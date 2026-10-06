-- 0393 — STAIR CARRY IS MONEY THE CUSTOMER OWES (owner ruling YH, 2026-08-28).
--
-- > "If stair carry requires money for it, it should be included — whether it's
-- >  paid on the carry day or before, it still needs to be paid."
--
-- Authority: docs/orders/MASTER.md § STAIR CARRY IS MONEY THE CUSTOMER OWES
-- Card:      docs/cards/CARD-2026-08-28-stair-carry-is-money-the-order-can-hold.md
-- Found by:  docs/audits/SO-WORKSPACE-FIELD-AUDIT.md §2 F-2
--
-- ── THE DEFECT THIS OPENS THE DOOR ON ───────────────────────────────────────
--
-- The stair-carry fee was computed in the browser on every render, from three
-- stored inputs plus a globally mutable rate, and written down NOWHERE: no
-- column, no addon row, no writer, across all 392 preceding migrations.
--
-- So the customer signed a POS screen that itemises the fee twice, folds it
-- into the headline total and sizes the deposit off it — under a T&C clause
-- promising it is billed on this sales order — while the order's own total was
-- `lines + addons` only. Every payment door caps against that same total, so
-- Stripe returned 422 BEFORE Stripe was called and cash top-up answered "Order
-- is already fully paid". At seeded rates a 5-item floor-3 order signs at
-- RM 9,600 against a database that can only ever describe RM 9,450.
--
-- ── WHY A SEEDED KEY, AND WHY IT IS BARE ────────────────────────────────────
--
-- `order_addons.addon_key` is FK'd to `addons(key)` (0001_init), so the key
-- must exist before any row can reference it. This follows 0184's road exactly
-- — the three DELIVERY keys are seeded at price 0 with the real per-order
-- figure supplied by the server recompute, because `addons.price` is a fixed
-- per-key price and these fees are COMPUTED.
--
-- No `service_sku`. The three delivery keys are bare too (0172 added the
-- column; 0184 did not use it). Whether a computed fee needs a Service SKU for
-- accounting is one question about four keys, not a new one about this key, and
-- the column is additive whenever Finance answers it.
--
-- ── WHAT THIS MIGRATION DOES NOT DO ─────────────────────────────────────────
--
-- No backfill. CLAUDE.md §6 — every row in this database today is test data,
-- and the ruling binds new orders from the day it ships. This migration asserts
-- no row count (red line 8): it seeds one reference row and walks past the data.
--
-- It also does not decide HOW MANY items are charged. The 2026-08-27
-- UNSET-MEANS-NONE ruling and the clamp extracted in 392a55e1 both stand
-- untouched; this changes only where the fee is RECORDED.

set search_path = public;

-- SERVER-EXCLUSIVE, exactly as DELIVERY / DELIVERY_CROSS / DELIVERY_ADD are.
-- `POST /api/orders` strips a client-sent STAIR_CARRY before the RPC, so the
-- charge can only ever come from the server's own computation.
--
-- `Stair carry` is the governed word — two words, no hyphen
-- (docs/COPY-STANDARD.md).
insert into public.addons (key, name, price, active) values
  ('STAIR_CARRY', 'Stair carry', 0, true)
on conflict (key) do nothing;

comment on table public.addons is
  'Reference set of order add-ons. Most are operator-picked services with a fixed price. FOUR keys are SERVER-EXCLUSIVE and carry price 0 here because their real figure is COMPUTED per order and written onto the order_addons row: DELIVERY, DELIVERY_CROSS, DELIVERY_ADD (0184) and STAIR_CARRY (0393). A client may not send any of the four; the create route strips them before the RPC.';
