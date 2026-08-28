-- 0394 — A STAIR FEE FOLLOWS THE FLOOR THAT CHANGED (owner ruling YH, 2026-08-29).
--
-- 0393 stamps the fee when the order is CREATED. But `delivery_floor`,
-- `delivery_has_lift` and `delivery_stair_items` are all editable afterwards —
-- `update_order` (0010) writes them from the POS, `sales_order_save_revision`
-- (0327/0354) writes them from the office. Change a floor from 1 to 3 and the
-- stamped fee stayed at the old number: the order then described a charge that
-- its own inputs no longer produce.
--
-- This adds the ONE door that re-stamps it, and nothing else.
--
-- ── WHY A DOOR AND NOT A TRIGGER ────────────────────────────────────────────
--
-- A BEFORE UPDATE trigger on `orders` looks tempting and is the wrong shape
-- here: it would have to compute the fee in PL/pgSQL, which means the formula
-- would exist twice — once in `packages/shared/src/stair-carry.ts` and once in
-- SQL — and ERP-ARCHITECTURE ownership law D is that a derived fact has ONE
-- arithmetic, "not two that currently agree". Every money defect this Card came
-- from was two copies of one rule drifting apart.
--
-- So the CALLER computes (in the one TypeScript function, the same one the POS
-- confirm step and the create path already use) and this function only WRITES.
-- It takes the fee as a number and asks no questions about how it was reached.
--
-- ── WHAT IT GUARANTEES ──────────────────────────────────────────────────────
--
-- Exactly one STAIR_CARRY row per order, or none. It deletes before inserting,
-- so it is idempotent: calling it twice with the same fee leaves the same one
-- row, and calling it with 0 leaves none. A zero row is noise on every surface
-- that reads the order, which is why 0 means DELETE rather than "insert zero".
--
-- ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────────
--
-- It asserts no row count and touches no existing data (red line 8). It is a
-- schema change only. The backfill of existing orders is a separate script the
-- owner runs, precisely so the arithmetic stays in TypeScript rather than being
-- re-implemented in a migration that would then disagree with it.

set search_path = public;

create or replace function public.order_stamp_stair_carry(
  p_order_id uuid,
  p_fee numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists boolean;
begin
  if p_fee is null or p_fee < 0 then
    raise exception 'stair carry fee must be a non-negative number'
      using errcode = '22023', detail = 'bad_fee';
  end if;

  select exists (select 1 from public.orders o where o.id = p_order_id) into v_exists;
  if not v_exists then
    raise exception 'Order not found' using errcode = '42P01';
  end if;

  -- Delete-then-insert, so the function is idempotent and can never leave two
  -- rows for one fee. `order_addons` has no natural unique key on
  -- (order_id, addon_key) — several service add-ons of the same kind are legal
  -- — so an upsert is not available and this is the honest equivalent.
  delete from public.order_addons
   where order_id = p_order_id
     and addon_key = 'STAIR_CARRY';

  if p_fee > 0 then
    insert into public.order_addons (order_id, addon_key, qty, unit_price, attrs)
    values (p_order_id, 'STAIR_CARRY', 1, p_fee, null);
  end if;
end;
$$;

comment on function public.order_stamp_stair_carry(uuid, numeric) is
  '0394 — writes the ONE STAIR_CARRY order_addons row for an order, or removes it when the fee is 0. The CALLER computes the fee through packages/shared stairCarryFee; this function deliberately holds no formula, so the arithmetic exists once (ownership law D). Idempotent: delete-then-insert. Called after any save that moves delivery_floor / delivery_has_lift / delivery_stair_items, and by the owner-run backfill.';

-- Writes go through this door only — same posture as every other order_addons
-- writer since 0329 narrowed the grants.
revoke all on function public.order_stamp_stair_carry(uuid, numeric) from public, anon;
grant execute on function public.order_stamp_stair_carry(uuid, numeric) to authenticated;
