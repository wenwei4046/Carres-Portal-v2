-- =============================================================================
-- 0673_delivery_rules_keep_the_assignment_lead.sql
-- =============================================================================
-- WHAT THE OWNER RULED (DEL-04, docs/delivery/MASTER.md §2.1, owner-approved
-- 2026-09-29, confirmed 9 Oct 2026):
--   `Assign logistics` OPENS on the day the Purchase Order is issued (a stock
--   order: the day it enters Operations). That is an opening trigger, never
--   the deadline. Delivery Settings → Delivery Rules owns the configurable
--   assignment lead, initially 3 Delivery working days before Scheduled
--   delivery, or Requested delivery until a schedule exists. Delivery
--   computes the one deadline; Sales Orders, Monitor and Workspace read it.
--
-- WHAT WAS WRONG
--   No storage existed: the Work item was due the PO day, the Logistics card
--   counted 3 from the Requested date with a constant, and the Orders list
--   counted its own seed 3.
--
-- WHAT THIS CHANGES
--   1 · public.delivery_rules — one row, `assignment_lead_working_days`
--       (default 3, range 1–30), with a revision for safe concurrent saves.
--   2 · delivery_setting_changes gains `reason` and `effective_from` so this
--       row's change keeps who · when · old → new · effective date · reason
--       (Delivery MASTER §11). Existing rows keep null in both.
--   3 · The door delivery_set_assignment_lead(days, revision, reason) behind
--       the Settings editor gate (Jess, or a person she names for Delivery —
--       0668/0669). A new value is effective from the day it is saved.
--
-- Schema only. Nothing is counted, deleted or rewritten.
-- =============================================================================

set search_path = public, pg_temp;

create table if not exists public.delivery_rules (
  id                            smallint primary key default 1 check (id = 1),
  assignment_lead_working_days  int not null default 3
                                  check (assignment_lead_working_days between 1 and 30),
  revision                      bigint not null default 1,
  changed_at                    timestamptz not null default now(),
  changed_by                    uuid references public.app_users(id)
);
insert into public.delivery_rules (id) values (1) on conflict (id) do nothing;

comment on table public.delivery_rules is
  '0673: Delivery Settings → Delivery Rules (Delivery MASTER §11). One row. assignment_lead_working_days = `Assign logistics by` {n} Delivery working days before Scheduled delivery, else Requested delivery (§2.1, DEL-04).';

alter table public.delivery_rules enable row level security;
revoke all on public.delivery_rules from public, anon, authenticated;
grant select on public.delivery_rules to authenticated;
grant all on public.delivery_rules to service_role;
drop policy if exists delivery_rules_read on public.delivery_rules;
create policy delivery_rules_read on public.delivery_rules
  for select to authenticated using ((select public.is_internal()));

alter table public.delivery_setting_changes
  add column if not exists reason text,
  add column if not exists effective_from date;

comment on column public.delivery_setting_changes.reason is
  '0673: why the change was made, when the editor gave one.';
comment on column public.delivery_setting_changes.effective_from is
  '0673: the day the new value takes effect (a Delivery Rules value is effective from the day it is saved).';

create or replace function public.delivery_set_assignment_lead(
  p_working_days int,
  p_revision bigint,
  p_reason text default null
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_before public.delivery_rules;
  v_after  public.delivery_rules;
  v_today  date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_reason text := case when coalesce(p_reason, '') ~ '[^[:space:]]' then btrim(p_reason) else null end;
begin
  perform public._settings_require_editor('delivery');
  if p_working_days is null or p_revision is null then
    raise exception 'the number of working days is required'
      using errcode = '22023', detail = 'missing_days';
  end if;
  if p_working_days not between 1 and 30 then
    raise exception 'choose between 1 and 30 working days'
      using errcode = '22023', detail = 'days_out_of_range';
  end if;
  select * into strict v_before from public.delivery_rules where id = 1 for update;
  if v_before.revision <> p_revision then
    raise exception 'settings changed' using errcode = '40001', detail = 'settings_changed';
  end if;
  if v_before.assignment_lead_working_days = p_working_days then
    return to_jsonb(v_before);
  end if;
  update public.delivery_rules set
    assignment_lead_working_days = p_working_days,
    revision   = revision + 1,
    changed_at = clock_timestamp(),
    changed_by = auth.uid()
  where id = 1
  returning * into v_after;
  insert into public.delivery_setting_changes
    (what, partner_id, old_value, new_value, actor_id, reason, effective_from)
  values ('assignment_lead', null,
          jsonb_build_object('assignment_lead_working_days', v_before.assignment_lead_working_days),
          jsonb_build_object('assignment_lead_working_days', v_after.assignment_lead_working_days),
          auth.uid(), v_reason, v_today);
  return to_jsonb(v_after);
end;
$fn$;

revoke all on function public.delivery_set_assignment_lead(int, bigint, text) from public, anon;
grant execute on function public.delivery_set_assignment_lead(int, bigint, text) to authenticated;

comment on function public.delivery_set_assignment_lead(int, bigint, text) is
  '0673: Delivery Rules → Assign logistics by {n} Delivery working days before Scheduled delivery, else Requested delivery (DEL-04). Settings editor gate; keeps who · when · old → new · effective date · reason.';
