-- Radar v4: a busca de clientes no Google Maps vira fila do coletor (NODE-Radar),
-- igual à busca na Biblioteca de Anúncios. A Places API exige pré-pagamento no
-- Brasil; o coletor lê o Maps no navegador, sem chave e sem custo.
-- Sai a cota (reserva de chamadas); entra o status 'pending' e o app enfileira.

drop function if exists public.radar_google_reservar(text, text, text, text, uuid, int, int);
drop function if exists public.radar_google_uso_mes();

alter table public.radar_prospect_searches drop column if exists calls;
alter table public.radar_prospect_searches
    add column if not exists max_results smallint not null default 60 check (max_results between 5 and 120),
    add column if not exists started_at timestamptz;
alter table public.radar_prospect_searches drop constraint if exists radar_prospect_searches_status_check;
alter table public.radar_prospect_searches
    add constraint radar_prospect_searches_status_check check (status in ('pending','running','done','error'));
alter table public.radar_prospect_searches alter column status set default 'pending';
alter table public.radar_prospect_searches alter column requested_by set default auth.uid();
create index if not exists radar_prospect_searches_fila_idx on public.radar_prospect_searches (status, created_at);

-- O app só enfileira (pendente, em nome de quem pede); andamento e resultado
-- quem grava é o coletor (service_role).
grant insert on public.radar_prospect_searches to authenticated;
drop policy if exists "radar_prospect_searches enfileirar" on public.radar_prospect_searches;
create policy "radar_prospect_searches enfileirar" on public.radar_prospect_searches
    for insert to authenticated
    with check (
        public.radar_can_view()
        and status = 'pending'
        and requested_by = auth.uid()
        and started_at is null and finished_at is null and result is null and error is null
    );
