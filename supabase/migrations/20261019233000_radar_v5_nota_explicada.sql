-- Radar v5: a nota do possível cliente guarda o motivo de cada ponto (a tela
-- mostra "por que 70") e os sócios podem apagar buscas do Google Maps.

alter table public.radar_prospects
    add column if not exists score_detail jsonb
        check (score_detail is null or jsonb_typeof(score_detail) = 'array');

-- Apagar busca: só a que não está rodando (o coletor ainda grava nela).
-- Os possíveis clientes da busca ficam (search_id vira null); a tela apaga
-- junto, se pedirem, só os que ninguém mexeu.
grant delete on public.radar_prospect_searches to authenticated;
drop policy if exists "radar_prospect_searches apagar" on public.radar_prospect_searches;
create policy "radar_prospect_searches apagar" on public.radar_prospect_searches
    for delete to authenticated
    using (public.radar_can_view() and status <> 'running');
