-- CRM v2: modo ligação.
-- 1. Acesso: só o dono do workspace e a equipe da agência ativa. Antes, qualquer
--    membro ativo (inclusive cliente de loja no portal) lia e editava os leads.
-- 2. Lead ganha nicho, responsável e agenda de contato.
-- 3. crm_lead_activities: cada ligação ou WhatsApp com o resultado. A regra de
--    "quando chamar de novo" mora aqui (gatilho), não na tela.

-- ───────────────────────────── acesso ─────────────────────────────

create or replace function public.crm_pode_acessar(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select exists (select 1 from public.workspaces w where w.id = ws and w.owner_id = auth.uid())
        or exists (
            select 1 from public.team_members tm
            where tm.workspace_id = ws
              and tm.user_id = auth.uid()
              and tm.status = 'active'
              and coalesce(tm.user_type, 'agency') = 'agency'
        );
$$;
revoke all on function public.crm_pode_acessar(uuid) from public, anon;
grant execute on function public.crm_pode_acessar(uuid) to authenticated;

drop policy if exists "Enable read access for authenticated users in same workspace" on public.crm_leads;
drop policy if exists "Enable insert for authenticated users in same workspace" on public.crm_leads;
drop policy if exists "Enable update for authenticated users in same workspace" on public.crm_leads;
drop policy if exists "Enable delete for authenticated users in same workspace" on public.crm_leads;
drop policy if exists "crm_leads equipe" on public.crm_leads;
create policy "crm_leads equipe" on public.crm_leads
    for all to authenticated
    using (public.crm_pode_acessar(workspace_id))
    with check (public.crm_pode_acessar(workspace_id));

drop policy if exists "Workspace isolation for crm_kanban_columns" on public.crm_kanban_columns;
drop policy if exists "crm_kanban_columns equipe" on public.crm_kanban_columns;
create policy "crm_kanban_columns equipe" on public.crm_kanban_columns
    for all to authenticated
    using (public.crm_pode_acessar(workspace_id))
    with check (public.crm_pode_acessar(workspace_id));

revoke all on public.crm_leads, public.crm_kanban_columns from anon;

-- ─────────────────────── lead: nicho, dono, agenda ──────────────────────

alter table public.crm_leads
    add column if not exists segment text check (segment is null or char_length(trim(segment)) between 2 and 40),
    add column if not exists owner_id uuid references auth.users(id) on delete set null,
    add column if not exists next_contact_at timestamptz,
    add column if not exists last_contact_at timestamptz,
    add column if not exists contact_attempts integer not null default 0 check (contact_attempts >= 0),
    add column if not exists last_outcome text;

create index if not exists crm_leads_fila_idx on public.crm_leads (workspace_id, next_contact_at) where archived_at is null;
create index if not exists crm_leads_segment_idx on public.crm_leads (workspace_id, segment);

-- ─────────────────────── histórico de contato ───────────────────────

create table if not exists public.crm_lead_activities (
    id bigint generated always as identity primary key,
    lead_id uuid not null references public.crm_leads(id) on delete cascade,
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    user_id uuid references auth.users(id) on delete set null default auth.uid(),
    channel text not null check (channel in ('ligacao','whatsapp')),
    outcome text not null check (outcome in (
        'nao_atendeu','caixa_postal','pediu_retorno','interessado','sem_interesse','numero_errado','mensagem_enviada','respondeu'
    )),
    note text check (note is null or char_length(note) <= 2000),
    next_contact_at timestamptz,
    created_at timestamptz not null default now(),
    constraint crm_lead_activities_retorno_com_data check (outcome <> 'pediu_retorno' or next_contact_at is not null)
);
create index if not exists crm_lead_activities_lead_idx on public.crm_lead_activities (lead_id, created_at desc);
create index if not exists crm_lead_activities_dia_idx on public.crm_lead_activities (workspace_id, created_at desc);

-- O workspace vem do lead (a tela não escolhe) e quem registrou é sempre quem está logado.
create or replace function public.crm_atividade_preparar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
    select l.workspace_id into new.workspace_id from public.crm_leads l where l.id = new.lead_id;
    if new.workspace_id is null then
        raise exception 'lead inexistente';
    end if;
    if auth.uid() is not null then
        new.user_id := auth.uid();
    end if;
    new.created_at := now();
    return new;
end;
$$;

-- Regra de agenda (o que a equipe combinou):
--   não atendeu / caixa postal → tenta amanhã
--   mensagem enviada           → cobra em 2 dias
--   pediu retorno              → na data pedida
--   interessado / respondeu    → amanhã (ou a data informada) e avança pra Contato/Follow-up
--   sem interesse / nº errado  → arquiva (volta em Configurações → Leads Arquivados)
-- Data informada pela tela sempre vence. Coluna só anda pra frente.
create or replace function public.crm_atividade_aplicar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
    proximo timestamptz;
    destino text;
    coluna_destino record;
    ordem_atual integer;
begin
    proximo := coalesce(new.next_contact_at, case new.outcome
        when 'nao_atendeu' then now() + interval '1 day'
        when 'caixa_postal' then now() + interval '1 day'
        when 'mensagem_enviada' then now() + interval '2 days'
        when 'interessado' then now() + interval '1 day'
        when 'respondeu' then now() + interval '1 day'
        else null
    end);
    destino := case new.outcome
        when 'interessado' then 'follow-up'
        when 'respondeu' then 'contato'
        when 'pediu_retorno' then 'contato'
        else null
    end;

    update public.crm_leads l
       set last_contact_at = new.created_at,
           contact_attempts = l.contact_attempts + 1,
           last_outcome = new.outcome,
           next_contact_at = proximo,
           owner_id = coalesce(l.owner_id, new.user_id),
           archived_at = case when new.outcome in ('sem_interesse','numero_errado') then now() else l.archived_at end
     where l.id = new.lead_id;

    if destino is not null then
        select c.id, c.title, c.order_index into coluna_destino
          from public.crm_kanban_columns c
         where c.workspace_id = new.workspace_id and lower(trim(c.title)) = destino
         order by c.order_index
         limit 1;
        select c.order_index into ordem_atual
          from public.crm_leads l join public.crm_kanban_columns c on c.id::text = l.column_id
         where l.id = new.lead_id;
        if coluna_destino.id is not null and coalesce(ordem_atual, -1) < coluna_destino.order_index then
            update public.crm_leads
               set column_id = coluna_destino.id::text,
                   lead_status = lower(regexp_replace(trim(coluna_destino.title), '\s+', '_', 'g'))
             where id = new.lead_id;
        end if;
    end if;
    return null;
end;
$$;

drop trigger if exists crm_atividade_preparar on public.crm_lead_activities;
create trigger crm_atividade_preparar before insert on public.crm_lead_activities
    for each row execute function public.crm_atividade_preparar();
drop trigger if exists crm_atividade_aplicar on public.crm_lead_activities;
create trigger crm_atividade_aplicar after insert on public.crm_lead_activities
    for each row execute function public.crm_atividade_aplicar();

alter table public.crm_lead_activities enable row level security;
revoke all on public.crm_lead_activities from anon;
-- Histórico é só leitura e inserção: ninguém reescreve o que já foi registrado.
revoke update, delete on public.crm_lead_activities from authenticated;
drop policy if exists "crm_lead_activities ler" on public.crm_lead_activities;
create policy "crm_lead_activities ler" on public.crm_lead_activities
    for select to authenticated using (public.crm_pode_acessar(workspace_id));
drop policy if exists "crm_lead_activities registrar" on public.crm_lead_activities;
create policy "crm_lead_activities registrar" on public.crm_lead_activities
    for insert to authenticated
    with check (public.crm_pode_acessar(workspace_id) and user_id = auth.uid());
