-- Radar v3: possíveis clientes da NODE (prospects).
-- Fontes: Google Maps (Places API, via edge function radar-prospect-google),
-- lojas achadas na Biblioteca de Anúncios e cadastro manual.
-- Mesmo acesso da v1/v2: só quem está em radar_access (radar_can_view).
-- O Radar qualifica; o acompanhamento de contato segue no kanban do Comercial
-- (crm_leads), pra não existirem dois funis.

-- ───────────────────────── buscas no Google ─────────────────────────

-- Cada chamada à Places API com site/telefone é cobrada na faixa Enterprise
-- (1.000 grátis por mês). `calls` guarda quantas chamadas a busca gastou; a
-- reserva acontece antes da chamada (radar_google_reservar), então a cota
-- nunca estoura nem com duas buscas ao mesmo tempo.
create table if not exists public.radar_prospect_searches (
    id bigint generated always as identity primary key,
    query text not null check (char_length(trim(query)) between 2 and 80),
    city text not null check (char_length(trim(city)) between 2 and 80),
    segment text not null check (char_length(trim(segment)) between 2 and 40),
    country char(2) not null default 'BR' check (country ~ '^[A-Z]{2}$'),
    status text not null default 'running' check (status in ('running','done','error')),
    calls smallint not null default 0 check (calls between 0 and 10),
    result jsonb,
    error text check (error is null or char_length(error) <= 500),
    requested_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    finished_at timestamptz
);
create index if not exists radar_prospect_searches_created_idx on public.radar_prospect_searches (created_at desc);

-- ───────────────────────────── prospects ────────────────────────────

create table if not exists public.radar_prospects (
    id uuid primary key default gen_random_uuid(),
    name text not null check (char_length(trim(name)) between 1 and 200),
    -- nicho do NEGÓCIO (dentista, restaurante, moda...). O serviço que a NODE
    -- venderia vai em `services`.
    segment text not null check (char_length(trim(segment)) between 2 and 40),
    category text check (category is null or char_length(category) <= 80),
    city text check (city is null or char_length(city) <= 80),
    address text check (address is null or char_length(address) <= 300),
    country char(2) not null default 'BR' check (country ~ '^[A-Z]{2}$'),
    phone text check (phone is null or char_length(phone) <= 40),
    website text check (website is null or char_length(website) <= 300),
    -- domínio do site próprio (dedupe com as lojas da Biblioteca); null sem site
    domain text check (domain is null or (domain = lower(domain) and domain ~ '^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$')),
    site_kind text not null default 'unknown'
        check (site_kind in ('none','social','builder','own','unknown')),
    instagram text check (instagram is null or char_length(instagram) <= 80),
    google_place_id text check (google_place_id is null or char_length(google_place_id) <= 300),
    maps_url text check (maps_url is null or char_length(maps_url) <= 500),
    rating numeric(2,1) check (rating is null or rating between 0 and 5),
    reviews integer check (reviews is null or reviews >= 0),
    ads_active integer check (ads_active is null or ads_active >= 0),
    services text[] not null default '{}'
        check (services <@ array['loja','lp','site','criativo','motion','funil','trafego','ia','app','sistema']::text[]),
    status text not null default 'novo'
        check (status in ('novo','qualificado','no_comercial','descartado')),
    score smallint check (score is null or score between 0 and 100),
    notes text check (notes is null or char_length(notes) <= 5000),
    source text not null default 'manual' check (source in ('google','anuncios','manual')),
    search_id bigint references public.radar_prospect_searches(id) on delete set null,
    crm_lead_id uuid references public.crm_leads(id) on delete set null,
    created_by uuid references auth.users(id) on delete set null default auth.uid(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create unique index if not exists radar_prospects_place_uniq on public.radar_prospects (google_place_id) where google_place_id is not null;
create unique index if not exists radar_prospects_domain_uniq on public.radar_prospects (domain) where domain is not null;
create index if not exists radar_prospects_lista_idx on public.radar_prospects (status, score desc nulls last);
create index if not exists radar_prospects_segment_idx on public.radar_prospects (segment);

drop trigger if exists radar_prospects_updated_at on public.radar_prospects;
create trigger radar_prospects_updated_at before update on public.radar_prospects
    for each row execute function public.set_updated_at();

-- ─────────────────────────── cota do Google ─────────────────────────

-- Reserva `p_calls` chamadas e cria a busca, ou recusa se o mês (fuso do
-- faturamento do Google, Pacífico) já passou de `p_cota`. A trava de transação
-- serializa reservas simultâneas. Só a edge function (service_role) chama.
create or replace function public.radar_google_reservar(
    p_query text, p_city text, p_segment text, p_country text, p_user uuid, p_calls int, p_cota int
)
returns bigint
language plpgsql
set search_path = public, pg_temp
as $$
declare
    usadas int;
    novo_id bigint;
begin
    perform pg_advisory_xact_lock(hashtext('radar_google_cota'));
    select coalesce(sum(calls), 0) into usadas
      from public.radar_prospect_searches
     where created_at >= (date_trunc('month', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles');
    if usadas + p_calls > p_cota then
        raise exception 'cota_google_esgotada: % de % chamadas usadas no mês', usadas, p_cota using errcode = 'P0001';
    end if;
    insert into public.radar_prospect_searches (query, city, segment, country, calls, requested_by)
    values (p_query, p_city, p_segment, p_country, p_calls, p_user)
    returning id into novo_id;
    return novo_id;
end;
$$;
revoke all on function public.radar_google_reservar(text, text, text, text, uuid, int, int) from public, anon, authenticated;
grant execute on function public.radar_google_reservar(text, text, text, text, uuid, int, int) to service_role;

-- Uso do mês, pra tela mostrar "312 de 900".
create or replace function public.radar_google_uso_mes()
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select case when public.radar_can_view() then coalesce(sum(calls), 0)::int else null end
      from public.radar_prospect_searches
     where created_at >= (date_trunc('month', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles');
$$;
revoke all on function public.radar_google_uso_mes() from public, anon;
grant execute on function public.radar_google_uso_mes() to authenticated;

-- ───────────────────────────────── RLS ──────────────────────────────

alter table public.radar_prospect_searches enable row level security;
alter table public.radar_prospects enable row level security;
revoke all on public.radar_prospect_searches, public.radar_prospects from anon;

-- Busca no Google só nasce pela edge function (que confere acesso e cota):
-- o app só lê o histórico.
revoke insert, update, delete on public.radar_prospect_searches from authenticated;
drop policy if exists "radar_prospect_searches read" on public.radar_prospect_searches;
create policy "radar_prospect_searches read" on public.radar_prospect_searches
    for select to authenticated using (public.radar_can_view());

drop policy if exists "radar_prospects viewers" on public.radar_prospects;
create policy "radar_prospects viewers" on public.radar_prospects
    for all to authenticated
    using (public.radar_can_view()) with check (public.radar_can_view());
