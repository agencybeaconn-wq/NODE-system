-- Radar v2: perfil e potencial por loja, nota manual e tags criadas pelos sócios.
-- Mesmo acesso da v1: só quem está em radar_access (radar_can_view).

alter table public.radar_stores
    add column if not exists rating smallint check (rating between 1 and 5),
    add column if not exists potential smallint check (potential between 0 and 100),
    add column if not exists potential_detail jsonb,
    add column if not exists profile jsonb,
    add column if not exists profile_at timestamptz;

create index if not exists radar_stores_potential_idx on public.radar_stores (potential desc nulls last);

create table if not exists public.radar_tags (
    id bigint generated always as identity primary key,
    name text not null check (char_length(trim(name)) between 1 and 40),
    color text not null default '#71717a' check (color ~ '^#[0-9a-fA-F]{6}$'),
    created_at timestamptz not null default now()
);
create unique index if not exists radar_tags_name_uniq on public.radar_tags (lower(trim(name)));

create table if not exists public.radar_store_tags (
    store_id uuid not null references public.radar_stores(id) on delete cascade,
    tag_id bigint not null references public.radar_tags(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (store_id, tag_id)
);
create index if not exists radar_store_tags_tag_idx on public.radar_store_tags (tag_id);

alter table public.radar_tags enable row level security;
alter table public.radar_store_tags enable row level security;
revoke all on public.radar_tags, public.radar_store_tags from anon;

drop policy if exists "radar_tags viewers" on public.radar_tags;
create policy "radar_tags viewers" on public.radar_tags
    for all to authenticated
    using (public.radar_can_view()) with check (public.radar_can_view());

drop policy if exists "radar_store_tags viewers" on public.radar_store_tags;
create policy "radar_store_tags viewers" on public.radar_store_tags
    for all to authenticated
    using (public.radar_can_view()) with check (public.radar_can_view());
