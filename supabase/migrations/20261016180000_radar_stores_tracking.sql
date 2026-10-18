-- Radar de lojas: acompanhamento diário de lojas do mercado (catálogo, home e
-- anúncios da Biblioteca da Meta) pra uso interno dos sócios.
--
-- Acesso: SOMENTE quem está em radar_access. Não usa is_agency_admin() porque
-- qualquer usuário logado consegue criar um workspace próprio e virar "dono".
-- Ninguém se autoconcede: radar_access não tem policy pra authenticated, só se
-- concede por SQL (service role). Um gatilho em team_members revoga o acesso de
-- quem vira cliente, sai da agência ou é desativado.
-- Escrita da coleta (runs, snapshots, events, metrics): só o coletor que roda
-- no PC do JV com service role (NODE-Radar). O app edita lojas, buscas e
-- candidatas. Nenhuma tabela aqui é visível pra anon.

-- ───────────────────────────── acesso ─────────────────────────────

create table public.radar_access (
    user_id uuid primary key references auth.users(id) on delete cascade,
    granted_at timestamptz not null default now(),
    note text
);

create or replace function public.radar_can_view()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select exists (select 1 from public.radar_access a where a.user_id = auth.uid());
$$;

revoke all on function public.radar_can_view() from public, anon;
grant execute on function public.radar_can_view() to authenticated;

-- Revogação automática e permanente (a pessoa não recupera o acesso editando
-- a própria linha de volta: a concessão só acontece por SQL).
create or replace function public.radar_revoke_access()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if tg_op = 'DELETE' then
        delete from public.radar_access where user_id = old.user_id;
        return old;
    end if;
    if new.user_id is not null and (
        new.user_type is distinct from 'agency'
        or new.role = 'client'
        or new.status is distinct from 'active'
        or new.linked_client_id is not null
    ) then
        delete from public.radar_access where user_id = new.user_id;
    end if;
    -- user_id trocado na linha: o usuário antigo deixa de estar vinculado
    if old.user_id is not null and old.user_id is distinct from new.user_id then
        delete from public.radar_access where user_id = old.user_id;
    end if;
    return new;
end;
$$;

revoke all on function public.radar_revoke_access() from public, anon, authenticated;

create trigger radar_revoke_access_on_team_change
    after update or delete on public.team_members
    for each row execute function public.radar_revoke_access();

-- ───────────────────────────── lojas ──────────────────────────────

create table public.radar_stores (
    id uuid primary key default gen_random_uuid(),
    -- host sem protocolo e sem www, minúsculo (ex.: lojamantosdaquebrada.com.br)
    domain text not null unique
        check (domain = lower(domain) and domain ~ '^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$'),
    name text check (name is null or char_length(name) <= 200),
    niche text not null check (char_length(trim(niche)) between 2 and 40),
    country char(2) not null default 'BR' check (country ~ '^[A-Z]{2}$'),
    platform text not null default 'unknown'
        check (platform in ('shopify','nuvemshop','yampi','cartpanda','woocommerce','vtex','tray','lojaintegrada','wix','magento','other','unknown')),
    -- id numérico da página na Biblioteca de Anúncios (view_all_page_id)
    meta_page_id text check (meta_page_id ~ '^[0-9]{5,}$'),
    -- /products.json responde (só Shopify): habilita a coleta de catálogo
    public_catalog boolean not null default false,
    active boolean not null default true,
    source text not null default 'manual' check (source in ('manual','search','leads')),
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create trigger radar_stores_set_updated_at
    before update on public.radar_stores
    for each row execute function public.set_updated_at();

-- ───────────────────────────── coleta ─────────────────────────────

-- Uma linha por loja por tipo por execução: diz se rodou e por que falhou.
create table public.radar_runs (
    id bigint generated always as identity primary key,
    store_id uuid not null references public.radar_stores(id) on delete cascade,
    kind text not null check (kind in ('catalog','home','ads')),
    started_at timestamptz not null default now(),
    duration_ms integer,
    status text not null check (status in ('ok','error','blocked','skipped')),
    summary jsonb,
    error text
);
create index radar_runs_store_started_idx on public.radar_runs (store_id, started_at desc);
create index radar_runs_started_idx on public.radar_runs (started_at desc);

-- Só o estado mais recente por loja e tipo. O histórico vive em radar_events
-- e radar_daily_metrics; guardar snapshot completo por dia estouraria o banco.
create table public.radar_snapshots (
    store_id uuid not null references public.radar_stores(id) on delete cascade,
    kind text not null check (kind in ('catalog','home','ads')),
    captured_at timestamptz not null default now(),
    hash text not null,
    data jsonb not null,
    primary key (store_id, kind)
);

-- Linha do tempo: o que mudou em cada loja, em linguagem de gente.
create table public.radar_events (
    id bigint generated always as identity primary key,
    store_id uuid not null references public.radar_stores(id) on delete cascade,
    occurred_on date not null default current_date,
    kind text not null check (char_length(kind) between 3 and 40),
    title text not null check (char_length(title) between 3 and 300),
    detail jsonb,
    importance smallint not null default 1 check (importance between 1 and 3),
    created_at timestamptz not null default now()
);
create index radar_events_store_day_idx on public.radar_events (store_id, occurred_on desc);
create index radar_events_day_idx on public.radar_events (occurred_on desc, importance desc);

-- Métricas por loja por dia. Catálogo e anúncios preenchem colunas diferentes
-- da mesma linha (upsert parcial), por isso tudo é nullable.
create table public.radar_daily_metrics (
    store_id uuid not null references public.radar_stores(id) on delete cascade,
    day date not null,
    products integer,
    products_new integer,
    products_removed integer,
    sold_out integer,
    median_price numeric(12,2),
    ads_active integer,
    ads_new integer,
    ads_stopped integer,
    ads_video integer,
    ads_image integer,
    oldest_ad_days integer,
    updated_at timestamptz not null default now(),
    primary key (store_id, day)
);
create index radar_daily_metrics_day_idx on public.radar_daily_metrics (day desc);

create trigger radar_daily_metrics_set_updated_at
    before update on public.radar_daily_metrics
    for each row execute function public.set_updated_at();

-- ─────────────────────── busca de lojas por nicho ──────────────────────

-- Fila: o app enfileira, o coletor no PC processa (ele é quem tem o navegador).
create table public.radar_searches (
    id bigint generated always as identity primary key,
    term text not null check (char_length(trim(term)) between 2 and 80),
    country char(2) not null default 'BR' check (country ~ '^[A-Z]{2}$'),
    niche text not null check (char_length(trim(niche)) between 2 and 40),
    status text not null default 'pending' check (status in ('pending','running','done','error')),
    requested_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    started_at timestamptz,
    finished_at timestamptz,
    result jsonb,
    error text
);
create index radar_searches_status_idx on public.radar_searches (status, created_at);

create table public.radar_candidates (
    id bigint generated always as identity primary key,
    search_id bigint not null references public.radar_searches(id) on delete cascade,
    domain text not null,
    name text,
    niche text not null,
    country char(2) not null default 'BR',
    platform text not null default 'unknown',
    meta_page_id text,
    ads_active integer,
    ads_video integer,
    sample_ad jsonb,
    public_catalog boolean,
    status text not null default 'new' check (status in ('new','added','dismissed')),
    created_at timestamptz not null default now(),
    unique (search_id, domain)
);

-- ───────────────────────────── RLS ────────────────────────────────

alter table public.radar_access enable row level security;
alter table public.radar_stores enable row level security;
alter table public.radar_runs enable row level security;
alter table public.radar_snapshots enable row level security;
alter table public.radar_events enable row level security;
alter table public.radar_daily_metrics enable row level security;
alter table public.radar_searches enable row level security;
alter table public.radar_candidates enable row level security;

revoke all on public.radar_access, public.radar_stores, public.radar_runs, public.radar_snapshots,
    public.radar_events, public.radar_daily_metrics, public.radar_searches, public.radar_candidates
    from anon;

-- radar_access: RLS ligado e NENHUMA policy pra authenticated = ninguém lê nem escreve pelo app.
revoke all on public.radar_access from authenticated;

-- Tabelas que o app edita.
create policy "radar_stores viewers" on public.radar_stores
    for all to authenticated
    using (public.radar_can_view()) with check (public.radar_can_view());
create policy "radar_searches viewers" on public.radar_searches
    for all to authenticated
    using (public.radar_can_view()) with check (public.radar_can_view());
create policy "radar_candidates viewers" on public.radar_candidates
    for all to authenticated
    using (public.radar_can_view()) with check (public.radar_can_view());

-- Tabelas que só o coletor escreve (service role ignora RLS); o app só lê.
create policy "radar_runs read" on public.radar_runs
    for select to authenticated using (public.radar_can_view());
create policy "radar_snapshots read" on public.radar_snapshots
    for select to authenticated using (public.radar_can_view());
create policy "radar_events read" on public.radar_events
    for select to authenticated using (public.radar_can_view());
create policy "radar_daily_metrics read" on public.radar_daily_metrics
    for select to authenticated using (public.radar_can_view());

-- ───────────────────────────── acesso inicial ─────────────────────────

-- Quem é da agência com papel admin ou operator hoje (os sócios), com login,
-- ativo e sem vínculo com cliente. Gente nova só entra por insert manual aqui.
insert into public.radar_access (user_id, note)
select distinct tm.user_id, 'seed: ' || tm.role
from public.team_members tm
where tm.user_id is not null
  and tm.status = 'active'
  and tm.user_type = 'agency'
  and tm.role in ('admin', 'operator')
  and tm.linked_client_id is null
on conflict (user_id) do nothing;
