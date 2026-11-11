-- Demandas: só 3 áreas (Social Mídia, Manutenção Loja, Mídias).
-- demand_requests.area e client_tasks.area guardam o código (social_media, manutencao_loja, midias);
-- o responsável é o membro com papel (agency_roles) de mesmo nome do rótulo.
-- Cards e solicitações antigos não são alterados.

CREATE OR REPLACE FUNCTION public.demand_area_label(p_area text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT CASE p_area
        WHEN 'social_media'    THEN 'Social Mídia'
        WHEN 'manutencao_loja' THEN 'Manutenção Loja'
        WHEN 'midias'          THEN 'Mídias'
    END;
$$;

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
    IF public.demand_area_label(NEW.area) IS NULL THEN
        RAISE EXCEPTION 'Selecione a área: Social Mídia, Manutenção Loja ou Mídias.';
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
    WHERE lower(ar.name) = lower(public.demand_area_label(NEW.area))
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
        'Área: ' || public.demand_area_label(NEW.area) || E'\n\n' || coalesce(NEW.description, ''),
        'todo',
        v_priority,
        NEW.area,
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
            NEW.title || ' · ' || coalesce(v_client_name, 'cliente') || ' · ' || public.demand_area_label(NEW.area),
            '/tasks',
            jsonb_build_object('demand_id', NEW.id, 'task_id', v_task_id, 'client_id', NEW.client_id, 'area', NEW.area)
        );
    END LOOP;

    RETURN NEW;
END;
$$;
