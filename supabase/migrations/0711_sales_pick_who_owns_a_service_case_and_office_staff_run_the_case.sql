-- 0711 — Sales pick who owns a Service Case, and office staff run the case by hand.
--
-- Weisiang's decision (Mr Lim, Houzs owner side, WhatsApp 2026-10-22, relayed by
-- YH 2026-10-23): "I think just clear Carress rules and Implement Houzs inside".
-- Where a written Carres Service rule clashes with Houzs, the Houzs behaviour is
-- built and the Carres rule is marked overturned in docs/service/MASTER.md.
-- Jess was not part of this decision.
--
--   1. service_cases.owner_user_id — the Case owner. The Sales Order PIC picks
--      an admin to own the case (Houzs). Overturns Service MASTER "the Sales
--      Order PIC is never the Case owner" and the round-robin owner rule. Who
--      may pick is enforced by the API (PATCH /api/ops/service-cases/:id).
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
--
-- Additive except (2) and (3), which are the ruling itself. Rollback at foot.

-- ── 1 · the Case owner ──────────────────────────────────────────────────────
alter table public.service_cases
  add column if not exists owner_user_id uuid references public.app_users(id);
create index if not exists service_cases_owner_user_id_idx
  on public.service_cases (owner_user_id);
comment on column public.service_cases.owner_user_id is
  '0711: the Case owner, picked by the Sales Order PIC (Weisiang''s decision, WhatsApp 2026-10-22). Falls back to service_settings.default_owner_user_id at create.';

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

-- ROLLBACK (manual):
--   drop function if exists public.my_service_case_ids();
--   drop policy if exists scs_service_editor_write on public.service_case_statuses;
--   drop policy if exists sct_service_editor_write on public.service_case_types;
--   drop table if exists public.service_settings;
--   (restore the 0668 section check without 'service'; re-run 0293 §trigger;
--    priority stays a plain column — re-generating it would discard staff edits)
--   alter table public.service_cases drop column if exists owner_user_id;
