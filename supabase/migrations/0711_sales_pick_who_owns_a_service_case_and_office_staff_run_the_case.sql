-- 0711 — Sales pick who owns a Service Case, and office staff run the case by hand.
--
-- Weisiang's decision (Mr Lim, Houzs owner side, WhatsApp 2026-10-22, relayed by
-- YH 2026-10-23): "I think just clear Carress rules and Implement Houzs inside".
-- Where a written Carres Service rule clashes with Houzs, the Houzs behaviour is
-- built and the Carres rule is marked overturned in docs/service/MASTER.md.
-- Jess was not part of this decision.
-- Follows Houzs backend/src/services/assrVisibility.ts:214 (My Cases),
-- frontend/src/pages/ServiceCases.tsx:3594 (Close Case on every open case) and
-- backend/src/routes/assr.ts:327 (default assignee) per Weisiang's ruling (2026-10-22): clear Carres rules, implement Houzs.
--
--   1. service_cases.owner_user_id — the Case owner. The Sales Order PIC picks
--      an admin to own the case (Houzs). Overturns Service MASTER "the Sales
--      Order PIC is never the Case owner" and the round-robin owner rule. Who
--      may pick is enforced by the API (PATCH /api/ops/service-cases/:id)
--      and by the service_cases_owner_pick_guard trigger.
--   2. priority stops being generated from `usable`: staff edit it (Houzs).
--      Existing values are kept; new cases still start from `usable`.
--   3. Close Case no longer waits for the customer's confirmation (Houzs
--      "Close Case on every open case"): the 0293 close trigger is dropped.
--   4. service_settings — one row: the default Case owner when nobody picks.
--      Edited by the principal or a person named for the new `service`
--      Settings section, who may also edit the Case Type and Stage pick lists.
--   5. my_service_case_ids() — "My Cases": cases I or anyone under me (the
--      app_users.reports_to_user_id tree) owns, raised, or is the Sales Order
--      PIC of (Houzs assrVisibility.ts myCasesPredicateSql).
--   6. The last stage that closes the case cannot be switched off, un-closed
--      or deleted (YH, chat 2026-10-26), so Close Case always has a stage.
--
-- Additive except (2) and (3), which are the ruling itself. Rollback at foot.

-- ── 1 · the Case owner ──────────────────────────────────────────────────────
alter table public.service_cases
  add column if not exists owner_user_id uuid references public.app_users(id);
create index if not exists service_cases_owner_user_id_idx
  on public.service_cases (owner_user_id);
comment on column public.service_cases.owner_user_id is
  '0711: the Case owner, picked by the Sales Order PIC (Weisiang''s decision, WhatsApp 2026-10-22). Falls back to service_settings.default_owner_user_id at create.';

-- Who may pick, held in the database too (the browser can reach PostgREST):
-- the principal, the order's PIC, or any office person when there is no PIC.
-- Mirrors shared mayPickCaseOwner. No JWT (service role, migrations) passes.
create or replace function public.service_case_owner_pick_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_pic uuid;
begin
  if new.owner_user_id is not distinct from old.owner_user_id or auth.uid() is null then
    return new;
  end if;
  if (select public.app_role()) = 'principal' then
    return new;
  end if;
  select oc.assigned_staff into v_pic
    from public.ops_order_control oc where oc.order_id = new.order_id;
  if (select public.app_role()) = 'operation' and (v_pic is null or v_pic = auth.uid()) then
    return new;
  end if;
  raise exception 'Only the sales order PIC can pick who owns this case.'
    using errcode = '42501', detail = 'not_order_pic';
end;
$fn$;
drop trigger if exists service_cases_owner_pick_guard on public.service_cases;
create trigger service_cases_owner_pick_guard
  before update of owner_user_id on public.service_cases
  for each row execute function public.service_case_owner_pick_guard();

-- ── 2 · staff edit the priority ─────────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from pg_attribute
     where attrelid = 'public.service_cases'::regclass
       and attname = 'priority' and attgenerated <> ''
  ) then
    alter table public.service_cases alter column priority drop expression;
  end if;
end $$;
alter table public.service_cases drop constraint if exists service_cases_priority_known;
alter table public.service_cases add constraint service_cases_priority_known
  check (priority is null or priority in ('low', 'normal', 'high'));
comment on column public.service_cases.priority is
  '0711: staff edit it (Weisiang''s decision, WhatsApp 2026-10-22). A new case starts from usable (no=high, temporary=normal, yes=low).';

-- ── 3 · Close Case without waiting for the customer ─────────────────────────
drop trigger if exists service_cases_close_needs_customer on public.service_cases;
drop function if exists public.service_case_close_needs_customer();

-- ── 4 · Service settings ────────────────────────────────────────────────────
alter table public.settings_section_editors
  drop constraint if exists settings_section_editors_section_check;
alter table public.settings_section_editors
  add constraint settings_section_editors_section_check check (section in (
    'company', 'office', 'staff_duties', 'sales_orders', 'purchasing',
    'payment', 'warehouse', 'delivery', 'issue_tracker', 'service'));

create table if not exists public.service_settings (
  id                    boolean primary key default true check (id),
  default_owner_user_id uuid references public.app_users(id),
  updated_by            uuid references public.app_users(id),
  updated_at            timestamptz not null default now()
);
insert into public.service_settings (id) values (true) on conflict (id) do nothing;
alter table public.service_settings enable row level security;

drop policy if exists service_settings_read on public.service_settings;
create policy service_settings_read on public.service_settings
  for select to authenticated using ((select public.is_internal()));
drop policy if exists service_settings_edit on public.service_settings;
create policy service_settings_edit on public.service_settings
  for update to authenticated
  using ((select public.settings_can_edit('service')))
  with check ((select public.settings_can_edit('service')));

-- The pick lists: principal kept its write policy; a named Service editor joins.
drop policy if exists sct_service_editor_write on public.service_case_types;
create policy sct_service_editor_write on public.service_case_types
  for all to authenticated
  using ((select public.settings_can_edit('service')))
  with check ((select public.settings_can_edit('service')));
drop policy if exists scs_service_editor_write on public.service_case_statuses;
create policy scs_service_editor_write on public.service_case_statuses
  for all to authenticated
  using ((select public.settings_can_edit('service')))
  with check ((select public.settings_can_edit('service')));

-- ── 5 · My Cases ────────────────────────────────────────────────────────────
create or replace function public.my_service_case_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  with recursive team(id) as (
    select auth.uid() where (select public.app_role()) in ('operation', 'principal')
    union
    select u.id from public.app_users u join team t on u.reports_to_user_id = t.id
  )
  select c.id
    from public.service_cases c
    left join public.ops_order_control oc on oc.order_id = c.order_id
   where c.owner_user_id in (select id from team)
      or c.created_by    in (select id from team)
      or oc.assigned_staff in (select id from team);
$fn$;
revoke execute on function public.my_service_case_ids() from public, anon;
grant execute on function public.my_service_case_ids() to authenticated;
comment on function public.my_service_case_ids() is
  '0711 My Cases (Weisiang''s decision, WhatsApp 2026-10-22): cases the caller or their downline owns, raised, or is the Sales Order PIC of. Operation and principal only; anyone else gets nothing.';

-- ── 6 · one stage that closes the case stays in use ─────────────────────────
-- YH (chat, 2026-10-26): lock "In use" on the last closing stage. Close Case
-- needs an active is_closed stage; switching the last one off (or un-closing
-- or deleting it) would leave no way to close a case. Held for every caller,
-- service role included. Renaming is untouched (fires only on active/is_closed).
-- Definer so the count sees every stage whatever the caller's RLS shows.
create or replace function public.service_case_status_keep_one_closing()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not (old.active and old.is_closed) then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.active and new.is_closed then
    return new;
  end if;
  -- Lock the other closing stages so two editors cannot each switch one off.
  perform 1 from public.service_case_statuses
    where active and is_closed and id <> old.id
    for update;
  if not found then
    raise exception 'Keep one stage that closes the case in use. Close Case needs it.'
      using errcode = '23514', detail = 'last_closing_stage';
  end if;
  return coalesce(new, old);
end;
$fn$;
revoke execute on function public.service_case_status_keep_one_closing() from public, anon, authenticated;
drop trigger if exists service_case_statuses_keep_one_closing on public.service_case_statuses;
create trigger service_case_statuses_keep_one_closing
  before update of active, is_closed or delete on public.service_case_statuses
  for each row execute function public.service_case_status_keep_one_closing();

-- ROLLBACK (manual):
--   drop trigger if exists service_case_statuses_keep_one_closing on public.service_case_statuses;
--   drop function if exists public.service_case_status_keep_one_closing();
--   drop function if exists public.my_service_case_ids();
--   drop trigger if exists service_cases_owner_pick_guard on public.service_cases;
--   drop function if exists public.service_case_owner_pick_guard();
--   drop policy if exists scs_service_editor_write on public.service_case_statuses;
--   drop policy if exists sct_service_editor_write on public.service_case_types;
--   drop table if exists public.service_settings;
--   (restore the 0668 section check without 'service'; re-run 0293 §trigger;
--    priority stays a plain column — re-generating it would discard staff edits)
--   alter table public.service_cases drop column if exists owner_user_id;
