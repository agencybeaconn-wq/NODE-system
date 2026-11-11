-- =============================================================================
-- Demandas do portal do cliente: o BANCO cria o card no quadro e avisa a equipe.
--
-- Antes: o navegador do cliente tentava inserir em client_tasks (RLS recusa e o
-- status 'pending' não existe em task_columns), a solicitação ficava parada em
-- demand_requests e só virava card se alguém abrisse /solicitacoes (sem link no
-- menu). Nenhum aviso era disparado.
--
-- Agora, na MESMA transação do INSERT em demand_requests:
--   1. BEFORE: valida e corrige o que vem do navegador (workspace vem do cliente,
--      created_by vem do JWT, limites de tamanho, anexos só do nosso storage).
--   2. AFTER: cria o card em client_tasks (status 'todo'), resolve o responsável
--      pela área no servidor, vincula task_id, marca a solicitação como aprovada
--      e notifica a equipe (sino). O responsável recebe também o aviso padrão de
--      tarefa atribuída (tr_notify_task_assign, que inclui WhatsApp).
--   Se qualquer passo falhar, o INSERT inteiro falha: o cliente vê erro real.
--
-- Também: aviso para a equipe quando um cliente envia o briefing pelo portal.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Helper: usuário logado é da equipe da agência (ou dono do workspace)?
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_agency_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.workspaces w WHERE w.owner_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.user_id = auth.uid()
          AND tm.status = 'active'
          AND (tm.user_type IS NULL OR tm.user_type = 'agency')
    );
$$;

REVOKE ALL ON FUNCTION public.is_agency_staff() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_agency_staff() TO authenticated;

-- -----------------------------------------------------------------------------
-- 1. BEFORE INSERT: validação no servidor
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.demand_requests_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ws uuid;
    v_prefix text := 'https://gbmbrjvkayzwhdwnqjpi.supabase.co/storage/v1/object/public/attachments/';
BEGIN
    -- Workspace sempre o do cliente: o navegador não decide para onde a demanda vai.
    SELECT workspace_id INTO v_ws FROM public.agency_clients WHERE id = NEW.client_id;
    IF v_ws IS NULL THEN
        RAISE EXCEPTION 'Cliente da solicitação não encontrado.';
    END IF;
    NEW.workspace_id := v_ws;

    -- Autor sempre o usuário logado.
    IF auth.uid() IS NOT NULL THEN
        NEW.created_by := auth.uid();
    END IF;

    NEW.title := btrim(coalesce(NEW.title, ''));
    NEW.description := nullif(btrim(coalesce(NEW.description, '')), '');
    NEW.area := btrim(coalesce(NEW.area, ''));

    IF char_length(NEW.title) < 3 OR char_length(NEW.title) > 200 THEN
        RAISE EXCEPTION 'O título precisa ter entre 3 e 200 caracteres.';
    END IF;
    IF NEW.area = '' OR char_length(NEW.area) > 60 THEN
        RAISE EXCEPTION 'Selecione a área responsável.';
    END IF;
    IF char_length(coalesce(NEW.description, '')) > 10000 THEN
        RAISE EXCEPTION 'A descrição passou do limite de 10.000 caracteres.';
    END IF;

    NEW.attachments := coalesce(NEW.attachments, '{}'::text[]);
    IF coalesce(array_length(NEW.attachments, 1), 0) > 10 THEN
        RAISE EXCEPTION 'Máximo de 10 anexos por solicitação.';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(NEW.attachments) u WHERE left(u, length(v_prefix)) <> v_prefix) THEN
        RAISE EXCEPTION 'Anexo inválido: envie o arquivo pelo formulário.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_demand_requests_before_insert ON public.demand_requests;
CREATE TRIGGER tr_demand_requests_before_insert
    BEFORE INSERT ON public.demand_requests
    FOR EACH ROW EXECUTE FUNCTION public.demand_requests_before_insert();

-- -----------------------------------------------------------------------------
-- 2. AFTER INSERT: card no quadro + vínculo + aviso à equipe
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.demand_requests_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_task_id uuid;
    v_assignee uuid;
    v_client_name text;
    v_priority text;
    v_attachments jsonb;
    v_images jsonb;
    v_recipient uuid;
BEGIN
    -- Só solicitações novas sem card (idempotente: nunca cria 2 cards).
    IF NEW.task_id IS NOT NULL OR NEW.status <> 'pending' THEN
        RETURN NEW;
    END IF;

    SELECT name INTO v_client_name FROM public.agency_clients WHERE id = NEW.client_id;

    -- Responsável pela área: papel da agência com o mesmo nome da área.
    -- member_roles.member_id = team_members.id; o card guarda o user_id (login).
    SELECT tm.user_id INTO v_assignee
    FROM public.agency_roles ar
    JOIN public.member_roles mr ON mr.role_id = ar.id
    JOIN public.team_members tm ON tm.id = mr.member_id
    WHERE lower(ar.name) = lower(NEW.area)
      AND tm.workspace_id = NEW.workspace_id
      AND tm.status = 'active'
      AND tm.user_id IS NOT NULL
      AND (tm.user_type IS NULL OR tm.user_type = 'agency')
    ORDER BY tm.id
    LIMIT 1;

    v_priority := CASE NEW.client_priority
        WHEN 'urgente' THEN 'critical'
        WHEN 'alta'    THEN 'high'
        WHEN 'normal'  THEN 'medium'
        ELSE 'low'
    END;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'url', u,
               'name', regexp_replace(u, '^.*/', ''),
               'type', CASE WHEN u ~* '\.pdf$' THEN 'pdf' ELSE 'image' END)), '[]'::jsonb),
           coalesce(jsonb_agg(to_jsonb(u)) FILTER (WHERE u !~* '\.pdf$'), '[]'::jsonb)
      INTO v_attachments, v_images
    FROM unnest(NEW.attachments) u;

    INSERT INTO public.client_tasks (
        client_id, workspace_id, title, description, status, priority,
        area, category, source, assignee_id, attachments, images, cover_image_url
    ) VALUES (
        NEW.client_id,
        NEW.workspace_id,
        '[SOLICITAÇÃO] ' || NEW.title,
        'Área: ' || NEW.area || E'\n\n' || coalesce(NEW.description, ''),
        'todo',
        v_priority,
        lower(NEW.area),
        'Solicitação do cliente',
        'demand_request',
        v_assignee,
        v_attachments,
        v_images,
        v_images ->> 0
    )
    RETURNING id INTO v_task_id;

    UPDATE public.demand_requests
       SET task_id = v_task_id, status = 'approved'
     WHERE id = NEW.id;

    -- Sino para toda a equipe ativa + dono, menos o autor e o responsável
    -- (o responsável já recebe 'Nova tarefa atribuída' pelo trigger do card).
    FOR v_recipient IN
        SELECT DISTINCT uid FROM (
            SELECT tm.user_id AS uid
            FROM public.team_members tm
            WHERE tm.workspace_id = NEW.workspace_id
              AND tm.status = 'active'
              AND tm.user_id IS NOT NULL
              AND (tm.user_type IS NULL OR tm.user_type = 'agency')
            UNION
            SELECT w.owner_id FROM public.workspaces w
            WHERE w.id = NEW.workspace_id AND w.owner_id IS NOT NULL
        ) s
        WHERE uid IS DISTINCT FROM NEW.created_by
          AND uid IS DISTINCT FROM v_assignee
    LOOP
        PERFORM public.create_notification(
            NEW.workspace_id,
            v_recipient,
            'demand_request',
            'Nova solicitação de cliente',
            NEW.title || ' — ' || coalesce(v_client_name, 'cliente'),
            '/tasks',
            jsonb_build_object('demand_id', NEW.id, 'task_id', v_task_id, 'client_id', NEW.client_id, 'area', NEW.area)
        );
    END LOOP;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_demand_requests_after_insert ON public.demand_requests;
CREATE TRIGGER tr_demand_requests_after_insert
    AFTER INSERT ON public.demand_requests
    FOR EACH ROW EXECUTE FUNCTION public.demand_requests_after_insert();

-- Funções de trigger não são chamáveis por RPC.
REVOKE ALL ON FUNCTION public.demand_requests_before_insert() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.demand_requests_after_insert() FROM public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Briefing enviado pelo cliente: avisa a equipe para gerar as demandas.
--    (As demandas de implementação são geradas pela equipe em Briefing > Arquivos;
--     a sessão do cliente não tem permissão de escrita no quadro.)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.briefings_notify_staff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_recipient uuid;
    v_client_name text;
BEGIN
    IF NEW.status IS DISTINCT FROM 'completed' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'completed' THEN RETURN NEW; END IF;
    -- Briefing preenchido pela própria equipe não precisa de aviso.
    IF auth.uid() IS NULL OR public.is_agency_staff() THEN RETURN NEW; END IF;

    SELECT name INTO v_client_name FROM public.agency_clients WHERE id = NEW.client_group_id;

    FOR v_recipient IN
        SELECT DISTINCT uid FROM (
            SELECT tm.user_id AS uid
            FROM public.team_members tm
            WHERE tm.workspace_id = NEW.workspace_id
              AND tm.status = 'active'
              AND tm.user_id IS NOT NULL
              AND (tm.user_type IS NULL OR tm.user_type = 'agency')
            UNION
            SELECT w.owner_id FROM public.workspaces w
            WHERE w.id = NEW.workspace_id AND w.owner_id IS NOT NULL
        ) s
    LOOP
        PERFORM public.create_notification(
            NEW.workspace_id,
            v_recipient,
            'briefing_received',
            'Briefing recebido',
            coalesce(v_client_name, NEW.client_name, 'Cliente') || ' enviou o briefing. Gere as demandas em Briefing > Arquivos.',
            '/briefing/arquivos',
            jsonb_build_object('briefing_id', NEW.id, 'client_id', NEW.client_group_id)
        );
    END LOOP;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_briefings_notify_staff ON public.briefings;
CREATE TRIGGER tr_briefings_notify_staff
    AFTER INSERT OR UPDATE OF status ON public.briefings
    FOR EACH ROW EXECUTE FUNCTION public.briefings_notify_staff();

REVOKE ALL ON FUNCTION public.briefings_notify_staff() FROM public, anon, authenticated;
