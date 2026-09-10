-- ============================================================================
-- 0445 — a storage case refuses to be born beside an uncollected legacy fee
-- (docs/payment/MASTER.md §6 · §7 — the 2026-09-08 boundary review)
--
-- Two storage models exist in the code today: the CASE + INVOICE model (0436 /
-- 0438) and the LEGACY C9 columns on `ops_order_control` (storage_from /
-- storage_fee_override / storage_fee_msbf / storage_fee_sof, cleared by
-- storage_collected_at). The readers' precedence law is: an order with
-- storage-paper history is under the invoice model, and its money is the
-- papers — a voided (waived) paper never falls back to the old charge.
--
-- That law is total ONLY while the two models do not overlap on one order. If
-- they do, nothing in the data can say whether a keyed legacy fee is the SAME
-- debt as a paper or a DIFFERENT product group's — so the readers carry it out
-- as `unreconciledLegacy` and say it on screen rather than guess.
--
-- This migration stops that ambiguous state being BORN: the case door refuses
-- while an uncollected legacy fee stands on the order, and names the fix. It
-- changes no existing row, migrates nothing, and forgives no money.
--
-- Measured before writing (production, 2026-09-08): ZERO orders carry any
-- legacy storage signal, ZERO storage cases exist, ZERO storage papers exist —
-- so no live order can hit this refusal today, and the go-live database starts
-- clean (CLAUDE.md §6). The refusal is a guard for the future, not a cleanup.
-- ============================================================================
begin;

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
  v_ctrl record;
  v_legacy_fee numeric;
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

  -- 0445 — the two storage models may not overlap on one order. The keyed
  -- legacy fee is the unambiguous half of C9 (`storageHold`'s override /
  -- imported ladder); its date-walked accrual stays TS-side (Law D), so this
  -- guard asks only about a KEYED, uncollected figure — the state a human
  -- created and a human can clear.
  select c.storage_fee_override, c.storage_fee_msbf, c.storage_fee_sof,
         c.storage_collected_at
    into v_ctrl
    from ops_order_control c
   where c.order_id = p_order_id;
  if found and v_ctrl.storage_collected_at is null then
    v_legacy_fee := case
      when v_ctrl.storage_fee_override is not null then greatest(0, v_ctrl.storage_fee_override)
      else greatest(0, coalesce(v_ctrl.storage_fee_msbf, 0) + coalesce(v_ctrl.storage_fee_sof, 0))
    end;
    if coalesce(v_legacy_fee, 0) > 0 then
      raise exception
        'This order still carries an uncollected storage fee of RM % from the old records. Collect it, or set the storage fee to 0 in the order, before starting a storage case.',
        to_char(v_legacy_fee, 'FM999,999,990.00')
        using errcode = '22023', detail = 'legacy_storage_fee_unreconciled';
    end if;
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

comment on function public.payment_storage_start(uuid, text, date, date, text, text) is
  '0436 + 0445: the ONE storage-case birth door. Derives Storage Start as the later witnessed fact, snapshots the effective §7 rule, appends the order history fact; a second start for the same order + group is refused; and (0445) it refuses to open a case while the order still carries an uncollected KEYED legacy storage fee, so the two storage models never overlap on one order.';

commit;
