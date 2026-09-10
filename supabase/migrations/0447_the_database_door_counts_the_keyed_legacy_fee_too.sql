-- ============================================================================
-- 0447 — the database door counts the keyed legacy fee too, and the two
--        storage models stop being writable onto one order
-- (docs/payment/MASTER.md §2 · §7 · §12 — the 2026-09-08 correction)
--
-- WHAT WAS WRONG. 0441 taught the DO money door the storage PAPERS, and the
-- readers were then given a precedence rule that let the invoice model OWN an
-- order and stop counting the legacy C9 fee. That rested on a rule nobody
-- approved — that voiding a paper is a WAIVER. It is not:
--
--   · §4 makes a void the CORRECTION path (void + linked replacement draft).
--   · The approved storage waiver is the §7 extra-free decision, which changes
--     the FREE PERIOD before anything is charged (0436's own door).
--   · C9's shipped semantics are explicit: `storage_waiver_status='approved'`
--     RELEASES the hold and leaves the money owed; the write-off is
--     `storage_fee_override = 0` — "an override must never quietly forgive
--     money" (Jess, 2026-07-27).
--
-- So a legacy fee is owed until it is COLLECTED or written off, and nothing
-- else clears it. The corrected reader rule adds the two obligations, each
-- under its own approved rule, each exactly once. This migration brings the
-- database door into line and removes the way the ambiguity could be created.
--
--   §1  the DO money door counts the KEYED legacy ladder (override, else the
--       imported pair) beside the papers. The date-walked ACCRUAL stays
--       TS-side exactly as 0362 recorded — its catalog lookup and day walk do
--       not belong in a trigger, and the API gate still asserts it (Law D).
--   §2  a BEFORE INSERT OR UPDATE trigger on `ops_order_control` refuses to
--       raise a storage fee on an order that already has a storage case. With
--       0445 (no case beside a fee) the two models can no longer be written
--       onto one order from EITHER direction — by any writer, not just the
--       route that exists today. Clearing a fee (to 0) is always allowed;
--       collecting it is always allowed.
--
-- Nothing here migrates a row, forgives money, or changes what a waiver means.
-- ============================================================================
begin;

-- §1 · the door -------------------------------------------------------------
create or replace function public.ops_delivery_orders_money_gate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_priced   numeric;
  v_paid     numeric;
  v_keyed    numeric;
  v_storage  numeric;
  v_legacy   numeric;
  v_ctrl     record;
  v_owing    numeric;
begin
  select coalesce(sum(l.qty * l.unit_price), 0)
    into v_priced
    from order_lines l
   where l.order_id = new.order_id and l.unit_price is not null;
  select v_priced + coalesce(sum(a.qty * a.unit_price), 0)
    into v_priced
    from order_addons a
   where a.order_id = new.order_id and a.unit_price is not null;

  select greatest(0, coalesce(o.paid, 0)) into v_paid
    from orders o where o.id = new.order_id;

  -- The §2 storage obligation: live ISSUED storage-kind papers with tax.
  -- A draft asks nothing (issued or not, replacement or not); a voided paper
  -- asks nothing until its replacement is ISSUED — a correction, not a waiver.
  select coalesce(sum(i.amount + i.tax_amount), 0)
    into v_storage
    from invoices i
   where i.order_id = new.order_id
     and i.kind in ('storage', 'additional_storage')
     and i.status = 'issued'
     and i.voided_at is null;

  -- 0447 — the KEYED legacy C9 fee, under its own rule: an override beats the
  -- imported pair, `storage_collected_at` clears it, an override of 0 is the
  -- approved write-off. Never netted against `paid` (C9 never read `paid`).
  v_legacy := 0;
  select c.storage_fee_override, c.storage_fee_msbf, c.storage_fee_sof,
         c.storage_collected_at
    into v_ctrl
    from ops_order_control c
   where c.order_id = new.order_id;
  if found and v_ctrl.storage_collected_at is null then
    v_legacy := case
      when v_ctrl.storage_fee_override is not null then greatest(0, v_ctrl.storage_fee_override)
      else greatest(0, coalesce(v_ctrl.storage_fee_msbf, 0) + coalesce(v_ctrl.storage_fee_sof, 0))
    end;
  end if;

  if v_priced > 0 then
    v_owing := greatest(0, v_priced + v_storage - v_paid) + v_legacy;
  else
    select c.balance into v_keyed
      from ops_order_control c where c.order_id = new.order_id;
    if v_keyed is not null then
      v_owing := greatest(0, v_keyed) + v_storage + v_legacy;
    else
      v_owing := greatest(0, v_storage - v_paid) + v_legacy;
    end if;
  end if;

  if v_owing > 0 and not exists (
    select 1 from order_delivery_payment_approvals a
     where a.order_id = new.order_id and a.status = 'approved'
  ) then
    raise exception
      'RM % is still outstanding — collect it in full, or request a payment approval (owner ruling 2026-08-19: money in full before delivery)',
      to_char(v_owing, 'FM999,999,990.00')
      using errcode = 'P0001', detail = 'delivery_money_gate';
  end if;

  return new;
end;
$fn$;

comment on function public.ops_delivery_orders_money_gate() is
  'The database door of the money-in-full law (0362, ABSOLUTE per 2026-09-01; 0441 added the storage papers; 0447 adds the KEYED legacy C9 fee): no DO may be born while the order owes goods money, a live issued Storage/Additional Storage Invoice, or an uncollected keyed legacy storage fee — unless a historical APPROVED Delivery Payment Approval exists. Paid subtracts ONCE across goods and papers; the legacy fee keeps its own C9 rule and is cleared only by collection or an override of 0. The date-walked legacy ACCRUAL stays TS-side (0362''s Law D split) and is asserted by the API gate.';

-- §2 · the two models stop being writable onto one order ---------------------
create or replace function public.ops_order_control_storage_model_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_new_fee numeric;
  v_old_fee numeric;
begin
  v_new_fee := case
    when new.storage_fee_override is not null then greatest(0, new.storage_fee_override)
    else greatest(0, coalesce(new.storage_fee_msbf, 0) + coalesce(new.storage_fee_sof, 0))
  end;
  v_old_fee := case
    when tg_op = 'INSERT' then 0
    when old.storage_fee_override is not null then greatest(0, old.storage_fee_override)
    else greatest(0, coalesce(old.storage_fee_msbf, 0) + coalesce(old.storage_fee_sof, 0))
  end;

  -- Lowering a fee, clearing it to 0, or collecting it is always allowed —
  -- those are exactly how an operator COLLAPSES an unreconciled state. Only
  -- RAISING legacy storage money on a case-managed order is refused.
  if v_new_fee > v_old_fee
     and coalesce(new.storage_collected_at, old.storage_collected_at) is null
     and exists (select 1 from payment_storage_cases s where s.order_id = new.order_id)
  then
    raise exception
      'This order records storage as a storage case. Add the charge there — the old storage fee field cannot be raised on it.'
      using errcode = '22023', detail = 'storage_model_conflict';
  end if;
  return new;
end;
$fn$;

drop trigger if exists ops_order_control_storage_model_guard on public.ops_order_control;
create trigger ops_order_control_storage_model_guard
  before insert or update on public.ops_order_control
  for each row execute function public.ops_order_control_storage_model_guard();

comment on function public.ops_order_control_storage_model_guard() is
  '0447: with 0445 (no case beside an uncollected keyed fee), the two storage models can no longer be written onto one order from either direction, by ANY writer. Lowering, clearing to 0 and collecting stay open — they are how an operator collapses an unreconciled state.';

commit;
