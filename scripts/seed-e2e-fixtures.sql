-- =============================================================================
-- seed-e2e-fixtures.sql — fixture orders/POs for Playwright E2E specs
-- =============================================================================
-- Idempotent (every INSERT uses ON CONFLICT DO NOTHING). Re-running is safe.
--
-- Run via:  pnpm seed:e2e-fixtures
-- Which executes: supabase db query --linked --file scripts/seed-e2e-fixtures.sql
--
-- What this seeds (matches the pre-condition comments in the e2e/*.spec.ts files):
--   • DL-9001 — delivered + fully-paid order (no invoice yet) for
--               phase-5-invoice-issue-after-delivered (A2 acceptance).
--   • DL-9101..9104 — 4 orders with synthetic placed_at offsets (5/35/65/95
--                     days ago) so each lands in a distinct aging bucket
--                     (0-30 / 31-60 / 61-90 / 90+) for phase-5-ar-aging-buckets
--                     (A3 acceptance). All have paid=0 (outstanding > 0).
--
-- Fixtures NOT seeded yet (separate carry-forward — needs more user setup):
--   • PO-FIXTURE-LP, PO-FIXTURE-RACE, PO-FIXTURE-LEG-X (need lp-a/b/x/y users
--     + delivery_partners rows first; defer to next pass).
--
-- All 5 orders use:
--   dealer_id = BedHouse KL (00000000-0000-0000-0000-000000000d01)
--   outlet_id = BedHouse KL Bangsar (00000000-0000-0000-0000-0000000000a1)
--   salesperson_id = Aisha Rahman (00000000-0000-0000-0000-0000000000b1)
--   1 order_line each: 1 × Carres Cloud Queen (mattress:carres-cloud:Queen) @ RM 2,500
--   ⇒ total = 2500.00
-- =============================================================================

-- Reset step (idempotent rebuild): clear any existing test invoices + reset
-- the orders.invoice_no/invoiced_at fields so the spec can re-run from a
-- clean state. Without this, the second run hits the unique constraint on
-- invoices.invoice_no (each DL-9001 issue creates INV-{YYYY}-9001).
DELETE FROM invoices WHERE order_id IN (
  '99999999-9001-9001-9001-000000009001'::uuid,
  '99999999-9101-9101-9101-000000009101'::uuid,
  '99999999-9102-9102-9102-000000009102'::uuid,
  '99999999-9103-9103-9103-000000009103'::uuid,
  '99999999-9104-9104-9104-000000009104'::uuid
);
UPDATE orders
   SET invoice_no = NULL, invoiced_at = NULL
 WHERE id IN (
   '99999999-9001-9001-9001-000000009001'::uuid,
   '99999999-9101-9101-9101-000000009101'::uuid,
   '99999999-9102-9102-9102-000000009102'::uuid,
   '99999999-9103-9103-9103-000000009103'::uuid,
   '99999999-9104-9104-9104-000000009104'::uuid
 );

-- DL-9001: delivered + fully paid (5000 paid, but only 2500 expected... let's
-- be precise: 1 unit @ 2500 = total 2500, paid = 2500, outstanding = 0).
-- Used by phase-5-invoice-issue-after-delivered:
--   client gate (ARDrawer canIssue): row.outstanding <= 0.01 ✓ AND row.status === 'delivered' ✓
--   server gate (route /issue):       order.status === 'delivered' ✓
INSERT INTO orders (
  id, dl, status, channel,
  dealer_id, outlet_id, salesperson_id,
  customer_name, customer_phone, customer_address, customer_address_unknown,
  delivery_date, delivery_date_tbd, delivery_floor, delivery_has_lift,
  paid, terms_accepted, placed_at
)
VALUES (
  '99999999-9001-9001-9001-000000009001'::uuid,
  9001,
  'delivered',
  'dealer',
  '00000000-0000-0000-0000-000000000d01',
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000b1',
  'E2E Customer · Delivered',
  '+60 11 9001 0001',
  '1 E2E Drive, Kuala Lumpur 50000',
  false,
  current_date - 1, false, 1, true,
  2500,           -- paid in full (= total)
  true,
  now() - interval '7 days'
)
ON CONFLICT (dl) DO NOTHING;

INSERT INTO order_lines (order_id, sku, qty, unit_price)
SELECT '99999999-9001-9001-9001-000000009001'::uuid, 'mattress:carres-cloud:Queen', 1, 2500
WHERE NOT EXISTS (
  SELECT 1 FROM order_lines WHERE order_id = '99999999-9001-9001-9001-000000009001'::uuid
);

-- DL-9101: aging bucket "0-30" (placed 5 days ago, paid=0)
INSERT INTO orders (
  id, dl, status, channel, dealer_id, outlet_id, salesperson_id,
  customer_name, customer_phone, customer_address, customer_address_unknown,
  delivery_date, delivery_date_tbd, delivery_floor, delivery_has_lift,
  paid, terms_accepted, placed_at
)
VALUES (
  '99999999-9101-9101-9101-000000009101'::uuid,
  9101, 'proceed_order', 'dealer',
  '00000000-0000-0000-0000-000000000d01',
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000b1',
  'E2E Customer · Aging 0-30', '+60 11 9101 0001', '1 Bangsar', false,
  current_date + 7, false, 1, false,
  0, true, now() - interval '5 days'
)
ON CONFLICT (dl) DO NOTHING;
INSERT INTO order_lines (order_id, sku, qty, unit_price)
SELECT '99999999-9101-9101-9101-000000009101'::uuid, 'mattress:carres-cloud:Queen', 1, 2500
WHERE NOT EXISTS (SELECT 1 FROM order_lines WHERE order_id = '99999999-9101-9101-9101-000000009101'::uuid);

-- DL-9102: aging bucket "31-60" (placed 35 days ago)
INSERT INTO orders (
  id, dl, status, channel, dealer_id, outlet_id, salesperson_id,
  customer_name, customer_phone, customer_address, customer_address_unknown,
  delivery_date, delivery_date_tbd, delivery_floor, delivery_has_lift,
  paid, terms_accepted, placed_at
)
VALUES (
  '99999999-9102-9102-9102-000000009102'::uuid,
  9102, 'proceed_order', 'dealer',
  '00000000-0000-0000-0000-000000000d01',
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000b1',
  'E2E Customer · Aging 31-60', '+60 11 9102 0002', '2 Bangsar', false,
  null, true, 1, false,
  0, true, now() - interval '35 days'
)
ON CONFLICT (dl) DO NOTHING;
INSERT INTO order_lines (order_id, sku, qty, unit_price)
SELECT '99999999-9102-9102-9102-000000009102'::uuid, 'mattress:carres-cloud:Queen', 1, 2500
WHERE NOT EXISTS (SELECT 1 FROM order_lines WHERE order_id = '99999999-9102-9102-9102-000000009102'::uuid);

-- DL-9103: aging bucket "61-90" (placed 65 days ago)
INSERT INTO orders (
  id, dl, status, channel, dealer_id, outlet_id, salesperson_id,
  customer_name, customer_phone, customer_address, customer_address_unknown,
  delivery_date, delivery_date_tbd, delivery_floor, delivery_has_lift,
  paid, terms_accepted, placed_at
)
VALUES (
  '99999999-9103-9103-9103-000000009103'::uuid,
  9103, 'proceed_order', 'dealer',
  '00000000-0000-0000-0000-000000000d01',
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000b1',
  'E2E Customer · Aging 61-90', '+60 11 9103 0003', '3 Bangsar', false,
  null, true, 1, false,
  0, true, now() - interval '65 days'
)
ON CONFLICT (dl) DO NOTHING;
INSERT INTO order_lines (order_id, sku, qty, unit_price)
SELECT '99999999-9103-9103-9103-000000009103'::uuid, 'mattress:carres-cloud:Queen', 1, 2500
WHERE NOT EXISTS (SELECT 1 FROM order_lines WHERE order_id = '99999999-9103-9103-9103-000000009103'::uuid);

-- DL-9104: aging bucket "90+" (placed 95 days ago)
INSERT INTO orders (
  id, dl, status, channel, dealer_id, outlet_id, salesperson_id,
  customer_name, customer_phone, customer_address, customer_address_unknown,
  delivery_date, delivery_date_tbd, delivery_floor, delivery_has_lift,
  paid, terms_accepted, placed_at
)
VALUES (
  '99999999-9104-9104-9104-000000009104'::uuid,
  9104, 'proceed_order', 'dealer',
  '00000000-0000-0000-0000-000000000d01',
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000b1',
  'E2E Customer · Aging 90+', '+60 11 9104 0004', '4 Bangsar', false,
  null, true, 1, false,
  0, true, now() - interval '95 days'
)
ON CONFLICT (dl) DO NOTHING;
INSERT INTO order_lines (order_id, sku, qty, unit_price)
SELECT '99999999-9104-9104-9104-000000009104'::uuid, 'mattress:carres-cloud:Queen', 1, 2500
WHERE NOT EXISTS (SELECT 1 FROM order_lines WHERE order_id = '99999999-9104-9104-9104-000000009104'::uuid);

-- Bump the dl sequence past 9104 so future auto-allocated dl values don't
-- collide with our explicit fixture ids. Idempotent: setval to MAX(9104, current).
SELECT setval('orders_dl_seq', GREATEST(9104, last_value)) FROM orders_dl_seq;

-- Visibility check
SELECT dl, status, paid, placed_at::date AS placed_date
FROM orders
WHERE dl IN (9001, 9101, 9102, 9103, 9104)
ORDER BY dl;
