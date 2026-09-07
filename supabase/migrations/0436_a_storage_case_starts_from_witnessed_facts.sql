-- ============================================================================
-- 0436 — a storage case starts from witnessed facts
-- (docs/payment/MASTER.md §6 · §7 · §12 — the storage journey's foundation)
--
-- Storage begins only when BOTH facts exist: Carres CAN complete the agreed
-- delivery scope, and the customer delays/refuses it or will not arrange
-- receipt. Storage Start is the LATER fact, derived by the system — staff
-- cannot key an earlier one, and the first valid start is PERMANENT: later
-- delay never resets it, a free period or a cycle.
--
-- Measured before this migration: `payment_storage_rules` (0431) holds the
-- effective-dated §7 values, but no storage CASE exists anywhere — nothing
-- records the witnessed facts, the start, the rule snapshot or a free-storage
-- decision. This migration creates:
--
--   §1  payment_storage_cases — one case per order + product group, forever.
--       The §7 rule values are SNAPSHOTTED onto the case at start (a later
--       Settings change never recalculates an old case).
--   §2  payment_storage_start — the one birth door. Derives the start,
--       snapshots the then-effective rule, appends the order history fact.
--   §3  payment_storage_extra_free — the §7 extra-free decision door.
--       Operation through its limit day, the Storage Waiver Approver duty
--       (Shared Duty Resolver, 0425) through its limit day, nobody beyond;
--       sofa (extra_free_allowed = false) always refuses. A WRITTEN request
--       is required — no written evidence means no approval.
--
-- Charging (the commenced-cycle arithmetic → Storage Invoice) is the NEXT
-- slice; this one records the facts every charge derives from.
-- ============================================================================
begin;

-- §1 · the case ---------------------------------------------------------------
create table if not exists public.payment_storage_cases (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  product_group text not null check (product_group in ('mattress_bedframe', 'sofa')),

  -- The two witnessed facts (§6). The start is the LATER of them.
  readiness_witnessed_on date not null,
  customer_delay_witnessed_on date not null,
  delay_witness_note text not null,
  delay_evidence_url text,

  storage_start date not null,
  constraint payment_storage_start_is_later check (
    storage_start = greatest(readiness_witnessed_on, customer_delay_witnessed_on)
  ),

  -- §7 rule snapshot at start — an old case NEVER recalculates.
  rule_free_days integer not null check (rule_free_days >= 0),
  rule_charge_amount numeric(12,2) not null check (rule_charge_amount >= 0),
  rule_cycle_days integer not null check (rule_cycle_days > 0),
  rule_operation_limit_day integer,
  rule_waiver_limit_day integer,
  rule_extra_free_allowed boolean not null,

  -- The §7 extra-free decision (empty until approved).
  approved_free_until date,
  approved_by uuid references public.app_users(id),
  approved_at timestamptz,
  approval_reason text,
  approval_evidence_url text,
  constraint payment_storage_approval_complete check (
    (approved_free_until is null) =
    (approved_by is null and approved_at is null
      and approval_reason is null and approval_evidence_url is null)
  ),
  constraint payment_storage_approval_extends check (
    approved_free_until is null or approved_free_until >= storage_start
  ),

  status text not null default 'open' check (status in ('open', 'closed')),
  closed_at timestamptz,
  constraint payment_storage_closed_pair check (
    (status = 'closed') = (closed_at is not null)
  ),

  created_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now(),

  -- The FIRST valid start is permanent — one case per order + group, forever.
  constraint payment_storage_one_case unique (order_id, product_group)
);

comment on table public.payment_storage_cases is
  '0436: one storage case per order + product group (payment/MASTER.md §6-§7). Start = later of the two witnessed facts, derived, permanent; §7 values are snapshotted at start and never recalculated.';

alter table public.payment_storage_cases enable row level security;

-- 0367's lesson: a new table inherits a blanket write grant nobody asked for.
revoke all on public.payment_storage_cases from authenticated, anon;
grant select on public.payment_storage_cases to authenticated;

drop policy if exists payment_storage_cases_internal_read on public.payment_storage_cases;
create policy payment_storage_cases_internal_read on public.payment_storage_cases
  for select to authenticated
  using (public.app_role() in ('operation', 'finance', 'principal', 'warehouse'));
-- No insert/update/delete policy: the doors below are the only writers.

-- §2 · the birth door ---------------------------------------------------------
create or replace function public.payment_storage_start(
  p_order_id uuid,
  p_product_group text,
  p_readiness_on date,
  p_customer_delay_on date,
  p_witness_note text,
  p_evidence_url text default null
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_start date;
  v_rule record;
  v_case payment_storage_cases;
  v_so integer;
begin
  -- Operation records storage at the delivery-window call (§6); principal
  -- keeps the owner override. coalesce — NULL must refuse (the 0429 lesson).
  if not coalesce(public.app_role() in ('operation', 'principal'), false) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_storage_recorder';
  end if;

  if p_product_group not in ('mattress_bedframe', 'sofa') then
    raise exception 'unknown product group' using errcode = '22023', detail = 'bad_group';
  end if;
  if p_readiness_on is null or p_customer_delay_on is null then
    raise exception 'both witnessed facts are required' using errcode = '22023', detail = 'missing_witness';
  end if;
  if p_readiness_on > v_today or p_customer_delay_on > v_today then
    raise exception 'a witness cannot be in the future' using errcode = '22023', detail = 'future_witness';
  end if;
  if nullif(btrim(coalesce(p_witness_note, '')), '') is null then
    raise exception 'the witness note is required' using errcode = '22023', detail = 'missing_note';
  end if;

  select so into v_so from orders where id = p_order_id;
  if v_so is null then
    raise exception 'order not found' using errcode = '22023', detail = 'order_not_found';
  end if;

  -- The system derives the start — the LATER witnessed fact (§6).
  v_start := greatest(p_readiness_on, p_customer_delay_on);

  -- Snapshot the §7 rule effective AT the start for this group.
  select r.free_days, r.charge_amount, r.cycle_days,
         r.operation_limit_day, r.waiver_limit_day, r.extra_free_allowed
    into v_rule
    from payment_storage_rules r
   where r.product_group = p_product_group
     and r.effective_from <= v_start
   order by r.effective_from desc, r.created_at desc
   limit 1;
  if v_rule is null then
    raise exception 'no storage rule is effective for this start'
      using errcode = '22023', detail = 'no_effective_rule';
  end if;

  insert into payment_storage_cases (
    order_id, product_group,
    readiness_witnessed_on, customer_delay_witnessed_on,
    delay_witness_note, delay_evidence_url,
    storage_start,
    rule_free_days, rule_charge_amount, rule_cycle_days,
    rule_operation_limit_day, rule_waiver_limit_day, rule_extra_free_allowed,
    created_by
  ) values (
    p_order_id, p_product_group,
    p_readiness_on, p_customer_delay_on,
    btrim(p_witness_note), nullif(btrim(coalesce(p_evidence_url, '')), ''),
    v_start,
    v_rule.free_days, v_rule.charge_amount, v_rule.cycle_days,
    v_rule.operation_limit_day, v_rule.waiver_limit_day, v_rule.extra_free_allowed,
    v_uid
  )
  returning * into v_case;
  -- A second start for the same order + group hits payment_storage_one_case:
  -- the FIRST valid start is permanent (§6).

  insert into order_history (order_id, text, by_role, by_user_id)
  values (p_order_id,
          format('Storage started · %s · %s', p_product_group, v_start),
          public.app_role(), v_uid);

  return to_jsonb(v_case);
end;
$fn$;

revoke all on function public.payment_storage_start(uuid, text, date, date, text, text) from public, anon;
grant execute on function public.payment_storage_start(uuid, text, date, date, text, text) to authenticated;

comment on function public.payment_storage_start(uuid, text, date, date, text, text) is
  '0436: the ONE storage-case birth door. Derives Storage Start as the later witnessed fact, snapshots the effective §7 rule, appends the order history fact; a second start for the same order + group is refused.';

-- §3 · the extra-free decision door -------------------------------------------
create or replace function public.payment_storage_extra_free(
  p_case_id uuid,
  p_free_until date,
  p_reason text,
  p_evidence_url text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_duty jsonb := public.workspace_resolve_duty('storage_waiver_approver', null);
  v_case payment_storage_cases;
  v_total_day integer;
  v_is_waiver_approver boolean;
begin
  if not coalesce(public.app_role() in ('operation', 'principal'), false) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_storage_recorder';
  end if;

  select * into v_case from payment_storage_cases where id = p_case_id for update;
  if not found then
    raise exception 'storage case not found' using errcode = '22023', detail = 'case_not_found';
  end if;
  if v_case.status <> 'open' then
    raise exception 'the storage case is closed' using errcode = '22023', detail = 'case_closed';
  end if;
  if not v_case.rule_extra_free_allowed then
    raise exception 'extra free storage is not allowed for this group'
      using errcode = '22023', detail = 'extra_free_not_allowed';
  end if;
  if p_free_until is null or p_free_until < v_case.storage_start then
    raise exception 'the free-until date must be on or after the storage start'
      using errcode = '22023', detail = 'bad_free_until';
  end if;
  if v_case.approved_free_until is not null and p_free_until <= v_case.approved_free_until then
    raise exception 'an approval may only extend the free period'
      using errcode = '22023', detail = 'not_an_extension';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'the reason is required' using errcode = '22023', detail = 'missing_reason';
  end if;
  -- §6: no written request means no free-storage approval.
  if nullif(btrim(coalesce(p_evidence_url, '')), '') is null then
    raise exception 'the written request evidence is required'
      using errcode = '22023', detail = 'missing_written_request';
  end if;

  -- Total day counts from the start: the start day is day 1 (§7 examples).
  v_total_day := (p_free_until - v_case.storage_start) + 1;

  -- Storage Waiver Approver via the Shared Duty Resolver (0425); principal
  -- keeps the owner override. An unassigned duty resolves NULL — coalesce,
  -- or three-valued logic waves the refusal through (the 0429 lesson).
  v_is_waiver_approver := coalesce(public.app_role() = 'principal', false)
    or (v_uid is not null
        and coalesce(nullif(v_duty->>'actor_user_id', '')::uuid = v_uid, false));

  if v_case.rule_operation_limit_day is not null
     and v_total_day <= v_case.rule_operation_limit_day then
    null; -- Operation (or principal) may approve through its own limit day.
  elsif v_case.rule_waiver_limit_day is not null
        and v_total_day <= v_case.rule_waiver_limit_day then
    if not v_is_waiver_approver then
      raise exception 'only the Storage Waiver Approver may approve this far'
        using errcode = '42501', detail = 'needs_waiver_approver';
    end if;
  else
    raise exception 'no authority may approve free storage this far'
      using errcode = '22023', detail = 'beyond_every_limit';
  end if;

  update payment_storage_cases
     set approved_free_until = p_free_until,
         approved_by = v_uid,
         approved_at = now(),
         approval_reason = btrim(p_reason),
         approval_evidence_url = btrim(p_evidence_url)
   where id = p_case_id
   returning * into v_case;

  insert into order_history (order_id, text, by_role, by_user_id)
  values (v_case.order_id,
          format('Free storage approved through %s (day %s)', p_free_until, v_total_day),
          public.app_role(), v_uid);

  return to_jsonb(v_case);
end;
$fn$;

revoke all on function public.payment_storage_extra_free(uuid, date, text, text) from public, anon;
grant execute on function public.payment_storage_extra_free(uuid, date, text, text) to authenticated;

comment on function public.payment_storage_extra_free(uuid, date, text, text) is
  '0436: the §7 extra-free decision door — Operation through its limit day, the Storage Waiver Approver duty through its limit day, nobody beyond; a written request is required and an approval may only extend.';

commit;
