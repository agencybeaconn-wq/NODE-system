-- Radar → Comercial em lote: possíveis clientes (radar_prospects) viram leads na
-- primeira coluna do kanban ("Lead", a fila comum, sem responsável), com o nicho.
-- Uma transação: ou passam todos, ou nenhum. Quem já foi pro Comercial ou foi
-- descartado é ignorado (clique duplo não duplica lead).
-- SECURITY INVOKER: valem as policies de quem chama (Radar e Comercial).

create or replace function public.radar_levar_pro_comercial(p_ids uuid[], p_workspace uuid)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    coluna record;
    p record;
    novo uuid;
    n integer := 0;
    servicos text;
begin
    if not public.radar_can_view() then
        raise exception 'sem acesso ao Radar';
    end if;
    if not public.crm_pode_acessar(p_workspace) then
        raise exception 'sem acesso ao Comercial deste workspace';
    end if;
    if coalesce(array_length(p_ids, 1), 0) > 500 then
        raise exception 'no máximo 500 por vez';
    end if;

    select c.id, c.title into coluna
      from public.crm_kanban_columns c
     where c.workspace_id = p_workspace
     order by c.order_index
     limit 1;

    for p in
        select * from public.radar_prospects
         where id = any(p_ids) and crm_lead_id is null and status <> 'descartado'
         for update
    loop
        -- Rótulos iguais aos da tela (SERVICOS em src/components/radar/prospectApi.ts).
        select string_agg(case s
                   when 'loja' then 'Loja virtual' when 'lp' then 'Landing page' when 'site' then 'Site'
                   when 'criativo' then 'Criativo' when 'motion' then 'Vídeo motion' when 'funil' then 'Funil de venda'
                   when 'trafego' then 'Tráfego pago' when 'ia' then 'Treinamento de IA' when 'app' then 'App'
                   when 'sistema' then 'Sistema sob medida' else s end, ', ')
          into servicos
          from unnest(p.services) s;

        insert into public.crm_leads (
            workspace_id, name, store_name, phone, site_url, product_interest, lead_score,
            observations, utm_source, segment, column_id, lead_status
        ) values (
            p_workspace, left(p.name, 200), left(p.name, 200), p.phone, p.website, servicos,
            case when p.score is null then null when p.score >= 70 then 'Quente' when p.score >= 45 then 'Morno' else 'Frio' end,
            concat_ws(E'\n',
                format('Veio do Radar de clientes (%s%s).', p.segment, coalesce(', ' || p.city, '')),
                format('Presença: %s%s.', case p.site_kind when 'none' then 'sem site' when 'social' then 'só rede ou plataforma'
                    when 'builder' then 'site de construtor' when 'own' then 'site próprio' else 'a confirmar' end,
                    coalesce(' (' || p.website || ')', '')),
                case when p.rating is not null then format('Google: %s estrelas.', p.rating) end,
                case when p.instagram is not null then 'Instagram: ' || p.instagram end,
                case when p.maps_url is not null then 'Maps: ' || p.maps_url end,
                case when p.notes is not null then E'\n' || p.notes end
            ),
            'radar-clientes', p.segment, coluna.id::text,
            case when coluna.title is not null then lower(regexp_replace(trim(coluna.title), '\s+', '_', 'g')) end
        )
        returning id into novo;

        update public.radar_prospects set status = 'no_comercial', crm_lead_id = novo where id = p.id;
        n := n + 1;
    end loop;
    return n;
end;
$$;

revoke all on function public.radar_levar_pro_comercial(uuid[], uuid) from public, anon;
grant execute on function public.radar_levar_pro_comercial(uuid[], uuid) to authenticated;
