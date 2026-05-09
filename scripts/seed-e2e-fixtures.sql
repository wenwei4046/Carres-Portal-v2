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

-- ----- LP cross-tenant fixtures -----
-- POs assigned to LP-A and LP-B (synthetic E2E partners) for the
-- lp-creation-and-login cross-tenant test. Each PO is procurement-leg
-- assigned via procurement_partner_id (renamed from delivery_partner_id
-- in 0052). RLS scopes LP visibility by procurement_partner_id; LP-A
-- must NOT see LP-B's PO and vice versa.
--
-- Idempotent reset: clear any prior state on these PO ids.
-- (Threads cascade-delete via purchase_orders.id FK on order_supplier_threads.po_id.)
DELETE FROM order_supplier_threads WHERE po_id IN ('PO-LP-A-1', 'PO-LP-B-1', 'PO-FIXTURE-LP', 'PO-FIXTURE-LEG-X');
DELETE FROM purchase_orders WHERE id IN ('PO-LP-A-1', 'PO-LP-B-1', 'PO-FIXTURE-LP', 'PO-FIXTURE-LEG-X');
DELETE FROM orders WHERE id = '99999999-8000-8000-8000-000000008000'::uuid;

INSERT INTO purchase_orders (id, supplier_id, warehouse_id, status, sup_status, procurement_partner_id, placed_at)
VALUES
  ('PO-LP-A-1',      '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 'open', 'pickup_assigned', '11111111-aaaa-aaaa-aaaa-000000000001', now() - interval '2 days'),
  ('PO-LP-B-1',      '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 'open', 'pickup_assigned', '11111111-bbbb-bbbb-bbbb-000000000002', now() - interval '2 days'),
  -- PO-FIXTURE-LP: assigned to lp-test (JT Express partner) for the
  -- lp-update-column-whitelist E2E spec.
  ('PO-FIXTURE-LP',  '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 'open', 'pickup_assigned', '00000000-0000-0000-0000-0000000000f1', now() - interval '2 days'),
  -- PO-FIXTURE-LEG-X: per-leg LP split — procurement-leg = LP-X.
  -- Customer-leg lives on a paired thread (delivery_partner_id = LP-Y).
  ('PO-FIXTURE-LEG-X', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 'open', 'ready_for_pickup', '11111111-cccc-cccc-cccc-000000000003', now() - interval '1 day')
ON CONFLICT (id) DO NOTHING;

-- Companion order + thread for PO-FIXTURE-LEG-X. Thread has the customer-leg
-- LP (LP-Y) + an RFD raised (request_for_delivery_at NOT NULL) so it surfaces
-- on /api/partner/pickups/rfd-pending for LP-Y.
INSERT INTO orders (
  id, dl, status, channel, dealer_id, outlet_id, salesperson_id,
  customer_name, customer_phone, customer_address, customer_address_unknown,
  delivery_date, delivery_date_tbd, delivery_floor, delivery_has_lift,
  paid, terms_accepted, placed_at
)
VALUES (
  '99999999-8000-8000-8000-000000008000'::uuid,
  9080, 'proceed_order', 'dealer',
  '00000000-0000-0000-0000-000000000d01',
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000b1',
  'E2E Per-Leg Customer', '+60 11 9080 0000', '8 Per-Leg Drive', false,
  current_date + 7, false, 1, false,
  0, true, now() - interval '1 day'
);

INSERT INTO order_supplier_threads (
  id, order_id, po_id, supplier_id, category, sop_name, logistics_stage,
  delivery_partner_id, request_for_delivery_at, history
)
VALUES (
  '99999999-8888-8888-8888-000000008888'::uuid,
  '99999999-8000-8000-8000-000000008000'::uuid,
  'PO-FIXTURE-LEG-X',
  '00000000-0000-0000-0000-0000000000e1',
  'mattress', 'STANDARD', 'ready_to_dispatch',
  '11111111-dddd-dddd-dddd-000000000004',  -- customer-leg = LP-Y
  now() - interval '1 hour',                -- RFD raised → surfaces on rfd-pending
  '[]'::jsonb
);

-- ----- Race-condition fixture for concurrent-rfd-race E2E spec -----
-- A thread at logistics_stage='ready_to_dispatch'. Two concurrent calls to
-- logistics_dispatch_customer_leg(force=true) should serialize via FOR UPDATE:
-- first wins (200), second sees state='dispatched' → 22023 → 422 (mapPgError).
--
-- Idempotent reset: delete + reinsert. Ensures the thread starts fresh at
-- ready_to_dispatch even after a prior run flipped it to 'dispatched'.
DELETE FROM order_supplier_threads WHERE id = '99999999-7777-7777-7777-000000007777';
DELETE FROM orders WHERE id = '99999999-7000-7000-7000-000000007000';

INSERT INTO orders (
  id, dl, status, channel, dealer_id, outlet_id, salesperson_id,
  customer_name, customer_phone, customer_address, customer_address_unknown,
  delivery_date, delivery_date_tbd, delivery_floor, delivery_has_lift,
  paid, terms_accepted, placed_at
)
VALUES (
  '99999999-7000-7000-7000-000000007000'::uuid,
  9070, 'proceed_order', 'dealer',
  '00000000-0000-0000-0000-000000000d01',
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000b1',
  'E2E Race Customer', '+60 11 9070 0000', '7 Race St', false,
  current_date + 7, false, 1, false,
  0, true, now() - interval '1 day'
);

INSERT INTO order_supplier_threads (
  id, order_id, supplier_id, category, sop_name, logistics_stage, history
)
VALUES (
  '99999999-7777-7777-7777-000000007777'::uuid,
  '99999999-7000-7000-7000-000000007000'::uuid,
  '00000000-0000-0000-0000-0000000000e1',  -- HoOKkA
  'mattress', 'STANDARD', 'ready_to_dispatch',
  '[]'::jsonb
);

-- Stockpile threshold fixture for stockpile-alert-to-po E2E spec.
-- mattress:carres-cloud:Queen at warehouse c1 has qty=4 in seed (line 200 of
-- seed.sql). Setting low_threshold=50 guarantees logistics_stock_alerts()
-- returns this row (effective 4 < threshold 50) so the StockAlertsTile on
-- /logistics dashboard renders the alert.
UPDATE stock_balances
   SET low_threshold = 50
 WHERE sku = 'mattress:carres-cloud:Queen'
   AND warehouse_id = '00000000-0000-0000-0000-0000000000c1'
   AND (low_threshold IS DISTINCT FROM 50);

-- Visibility check
SELECT dl, status, paid, placed_at::date AS placed_date
FROM orders
WHERE dl IN (9001, 9101, 9102, 9103, 9104)
ORDER BY dl;
