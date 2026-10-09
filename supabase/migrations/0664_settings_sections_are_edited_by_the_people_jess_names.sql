-- 0664 — Settings sections are edited by the people Jess names.
--
-- Owner rule (Carres Settings List TEAM-02 · SET-01, confirmed 9 Oct 2026):
-- Jess (the principal) edits every Settings section and may delegate editing
-- of a NAMED section to a named person. "No new grant made": this migration
-- creates the mechanism only — no grant row is written. A grant is editing
-- rights for that section's configuration and nothing else: it never carries
-- a money approval, a Duty or an ordinary-work permission.
--
--   settings_section_editors   one row per grant; revoking stamps the row
--                              (who · when), so the history is the table
--   settings_can_edit(section) the ONE gate every Settings write calls:
--                              principal, or an active person holding an
--                              unrevoked grant for that section
--   settings_grant_section_editor / settings_revoke_section_editor
--                              principal-only doors

create table if not exists public.settings_section_editors (
  id          uuid primary key default gen_random_uuid(),
  section     text not null check (section in (
                'company', 'office', 'staff_duties', 'sales_orders', 'purchasing',
                'payment', 'warehouse', 'delivery', 'issue_tracker')),
  user_id     uuid not null references public.app_users(id),
  granted_by  uuid not null references public.app_users(id),
  granted_at  timestamptz not null default now(),
  revoked_by  uuid references public.app_users(id),
  revoked_at  timestamptz,
  constraint settings_section_editors_revoke_stamped
    check ((revoked_at is null) = (revoked_by is null))
);

-- One live grant per person per section.
create unique index if not exists settings_section_editors_live
  on public.settings_section_editors (section, user_id) where revoked_at is null;

alter table public.settings_section_editors enable row level security;

-- Internal staff may read who edits what (the Settings page shows it); every
-- write goes through the definer doors below.
drop policy if exists settings_section_editors_read on public.settings_section_editors;
create policy settings_section_editors_read on public.settings_section_editors
  for select to authenticated using ((select public.is_internal()));

create or replace function public.settings_can_edit(p_section text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce((select public.is_principal()), false)
      or exists (
        select 1
          from public.settings_section_editors g
          join public.app_users u on u.id = g.user_id
         where g.section = p_section
           and g.user_id = auth.uid()
           and g.revoked_at is null
           and u.status = 'active'
      );
$fn$;

comment on function public.settings_can_edit(text) is
  '0664: the one Settings write gate — the principal, or an active person with an unrevoked grant for that named section (TEAM-02). Never a money approval.';

create or replace function public.settings_grant_section_editor(p_section text, p_user_id uuid)
returns public.settings_section_editors
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row public.settings_section_editors;
begin
  if not coalesce((select public.is_principal()), false) then
    raise exception 'only Jess may name Settings editors' using errcode = '42501', detail = 'not_principal';
  end if;
  if not exists (select 1 from public.app_users where id = p_user_id and status = 'active') then
    raise exception 'the person must be an active account' using errcode = '22023', detail = 'person_not_active';
  end if;
  if exists (select 1 from public.settings_section_editors
              where section = p_section and user_id = p_user_id and revoked_at is null) then
    raise exception 'this person already edits this section' using errcode = '22023', detail = 'already_editor';
  end if;
  insert into public.settings_section_editors (section, user_id, granted_by)
  values (p_section, p_user_id, auth.uid())
  returning * into v_row;
  return v_row;
end;
$fn$;

create or replace function public.settings_revoke_section_editor(p_section text, p_user_id uuid)
returns public.settings_section_editors
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row public.settings_section_editors;
begin
  if not coalesce((select public.is_principal()), false) then
    raise exception 'only Jess may name Settings editors' using errcode = '42501', detail = 'not_principal';
  end if;
  update public.settings_section_editors
     set revoked_at = now(), revoked_by = auth.uid()
   where section = p_section and user_id = p_user_id and revoked_at is null
  returning * into v_row;
  if v_row.id is null then
    raise exception 'this person does not edit this section' using errcode = '22023', detail = 'not_editor';
  end if;
  return v_row;
end;
$fn$;

revoke all on function public.settings_can_edit(text) from public, anon;
revoke all on function public.settings_grant_section_editor(text, uuid) from public, anon;
revoke all on function public.settings_revoke_section_editor(text, uuid) from public, anon;
grant execute on function public.settings_can_edit(text) to authenticated;
grant execute on function public.settings_grant_section_editor(text, uuid) to authenticated;
grant execute on function public.settings_revoke_section_editor(text, uuid) to authenticated;
