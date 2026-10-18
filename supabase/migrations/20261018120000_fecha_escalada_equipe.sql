-- Fecha a escalada de privilégio por autosserviço (achada em 17/10/2026).
--
-- Antes: qualquer usuário logado podia (a) criar um workspace próprio e passar
-- a contar como "dono" (is_agency_admin) e (b) editar livremente a própria
-- linha em team_members, inclusive tipo, cargo e vínculo com cliente.
-- Depois:
--   1. workspace novo só pelo backend (service role);
--   2. team_members: a equipe (is_agency_member) gerencia; a própria pessoa só
--      vincula o login, ativa o convite e muda nome/telefone;
--   3. is_agency_admin exige admin ativo da agência, sem vínculo com cliente.
-- O cadastro público de conta é fechado à parte (config de auth do projeto).

-- ─────────────────────────── 1. workspaces ───────────────────────────

drop policy if exists "Users can insert their own workspaces" on public.workspaces;

revoke all on function public.create_workspace_for_user(text, uuid, text, integer, integer) from public, anon, authenticated;

-- ─────────────────────────── 2. team_members ─────────────────────────

drop policy if exists team_members_scoped_all on public.team_members;

create policy team_members_select on public.team_members
    for select to authenticated
    using (public.is_agency_member(workspace_id) or user_id = auth.uid());

create policy team_members_insert_staff on public.team_members
    for insert to authenticated
    with check (public.is_agency_member(workspace_id));

create policy team_members_update on public.team_members
    for update to authenticated
    using (public.is_agency_member(workspace_id) or user_id = auth.uid())
    with check (public.is_agency_member(workspace_id) or user_id = auth.uid());

create policy team_members_delete_staff on public.team_members
    for delete to authenticated
    using (public.is_agency_member(workspace_id));

-- Quem não é da equipe do workspace só pode mexer nos campos de autosserviço.
create or replace function public.team_members_guard_self_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    -- backend (service role / migrations) não tem auth.uid()
    if auth.uid() is null then
        return new;
    end if;
    -- equipe da agência gerencia membros normalmente
    if public.is_agency_member(old.workspace_id) then
        return new;
    end if;
    if new.workspace_id is distinct from old.workspace_id
        or new.email is distinct from old.email
        or new.role is distinct from old.role
        or new.user_type is distinct from old.user_type
        or new.linked_client_id is distinct from old.linked_client_id
        or new.base_salary is distinct from old.base_salary
        or new.commission_rate is distinct from old.commission_rate
        or new.is_accounting_staff is distinct from old.is_accounting_staff
        or new.pix_key is distinct from old.pix_key
        or new.whatsapp_notifications is distinct from old.whatsapp_notifications
        or new.invited_at is distinct from old.invited_at
    then
        raise exception 'sem permissão para alterar esses campos do membro'
            using errcode = '42501';
    end if;
    if new.user_id is distinct from old.user_id and new.user_id is distinct from auth.uid() then
        raise exception 'só é possível vincular o próprio login' using errcode = '42501';
    end if;
    -- ativar convite sim; reativar quem foi desativado, não
    if new.status is distinct from old.status
        and not (new.status = 'active' and old.status in ('invited', 'pending'))
    then
        raise exception 'sem permissão para alterar o status' using errcode = '42501';
    end if;
    return new;
end;
$$;

revoke all on function public.team_members_guard_self_update() from public, anon, authenticated;

drop trigger if exists team_members_guard_self_update on public.team_members;
create trigger team_members_guard_self_update
    before update on public.team_members
    for each row execute function public.team_members_guard_self_update();

-- ─────────────────────────── 3. is_agency_admin ──────────────────────

create or replace function public.is_agency_admin()
returns boolean
language sql
stable
set search_path = public
as $$
    select exists (
        select 1 from public.workspaces w where w.owner_id = auth.uid()
    ) or exists (
        select 1 from public.team_members tm
        where tm.user_id = auth.uid()
          and lower(tm.role) = 'admin'
          and tm.user_type = 'agency'
          and tm.status = 'active'
          and tm.linked_client_id is null
    );
$$;
