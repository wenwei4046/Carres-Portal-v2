-- ============================================================================
-- 0441 — the DO money gate learns the storage papers
-- (docs/payment/MASTER.md §2 · docs/delivery/MASTER.md money-in-full ABSOLUTE
--  ruling 2026-09-01 · the 2026-09-07 gate-convergence slice)
--
-- 0362's database door computed the GOODS money and deliberately left the
-- storage fee to the TS gate (its legacy accrual walks dates). 0436/0438 made
-- the storage obligation a PAPER — a live ISSUED Storage / Additional Storage
-- Invoice — which is plain SQL money. From this migration the one database
-- door that binds every DO mint reads it too, so an unpaid storage paper
-- cannot release a delivery whatever path minted the document.
--
--   priced goods:  owing = greatest(0, priced + storage − paid)   (paid is
--                  subtracted ONCE from the combined obligation — a customer
--                  who paid past the goods value has the excess honoured
--                  against storage, and a fully paid SO leaves no stale hold)
--   keyed import:  owing = greatest(0, keyed) + storage            (the keyed
--                  figure is already an outstanding — paid never subtracts
--                  from it twice)
--   unknown goods: owing = greatest(0, storage − paid)             (unknown
--                  goods still never block — §8 — but a storage PAPER is a
--                  known obligation and does)
--
-- What deliberately does NOT change:
--   · The LEGACY C9 storage figure (ops_order_control storage_from/override/
--     imported fees) stays TS-side, exactly as 0362 recorded — its date-walked
--     accrual is not duplicated here (Law D), and the API gate still asserts it.
--   · A C9 `storage_waiver_status = 'approved'` RELEASE does not open this
--     door: money in full before delivery is ABSOLUTE (delivery/MASTER.md,
--     2026-09-01), and a waiver changes the governed receivable (§12 — void
--     the paper), it is not an unpaid-delivery release.
--   · The historical order_delivery_payment_approvals escape stays honoured —
--     history, not a live path.
-- ============================================================================
begin;

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
  v_owing    numeric;
begin
  -- The same shape as the shared `orderMoney` rule, goods side:
  --   priced lines win; a priced-less import falls back to the hand-keyed
  --   outstanding (0165 — already an outstanding, so paid is NOT subtracted
  --   again); neither → UNKNOWN, and unknown goods never block (§8).
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

  -- 0441 — the §2 storage obligation: live ISSUED storage-kind papers with
  -- their tax. A draft asks nothing yet; a voided paper is dead (the
  -- waiver-by-void path). The same figure `soRemaining` and the TS
  -- `storageObligation` composer print.
  select coalesce(sum(i.amount + i.tax_amount), 0)
    into v_storage
    from invoices i
   where i.order_id = new.order_id
     and i.kind in ('storage', 'additional_storage')
     and i.status = 'issued'
     and i.voided_at is null;

  if v_priced > 0 then
    v_owing := greatest(0, v_priced + v_storage - v_paid);
  else
    select c.balance into v_keyed
      from ops_order_control c where c.order_id = new.order_id;
    if v_keyed is not null then
      v_owing := greatest(0, v_keyed) + v_storage;
    else
      v_owing := greatest(0, v_storage - v_paid);
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
  'The database door of the money-in-full law (0362, ABSOLUTE per the 2026-09-01 ruling; 0441 adds the storage papers): no DO document may be born while the order''s goods money OR a live issued Storage/Additional Storage Invoice is outstanding, unless a historical APPROVED Delivery Payment Approval exists. Goods arithmetic mirrors orderMoney; paid subtracts ONCE from the combined obligation; the LEGACY C9 storage columns stay asserted by the TS API gate (Law D division unchanged); a C9 release never opens this door — a waiver voids the paper.';

commit;
