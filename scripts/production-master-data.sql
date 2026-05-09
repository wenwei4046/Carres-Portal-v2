-- =============================================================================
-- production-master-data.sql — Phase 9 Day 1 master data seed
-- =============================================================================
--
-- Generated 2026-05-09 from Loo's chat input. Values marked PLACEHOLDER are
-- safe to ship Day 1 and can be edited later via PrincipalDealers /
-- PrincipalSuppliers / etc. UIs without any code change.
--
-- Apply ONLY AFTER scripts/phase-9-cleanup.sql has been applied successfully.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- DEALERS — 1 real dealer + 1 Carres-owned showroom
-- -----------------------------------------------------------------------------
insert into dealers (name, region, contact, joined_date, status, credit_limit, payment_terms, channel) values
  ('Mattress King',       'Klang Valley', null, '2025-01-01', 'active', 100000, 'NET 30', 'dealer'),
  ('Carres KL Showroom',  'Klang Valley', null, '2025-01-01', 'active',      0, '—',      'showroom');

-- -----------------------------------------------------------------------------
-- OUTLETS — 1 under each dealer
-- -----------------------------------------------------------------------------
-- Address is NOT NULL on this table; placeholders so Loo can update via UI later.
insert into outlets (dealer_id, name, address) values
  ((select id from dealers where name = 'Mattress King'      limit 1), 'Mattress King Main',  'Address TBD — please update via Principal → Dealers'),
  ((select id from dealers where name = 'Carres KL Showroom' limit 1), 'Carres KL Showroom',  'Address TBD — please update via Principal → Dealers');

-- -----------------------------------------------------------------------------
-- SALESPERSONS — 1 under Mattress King (default name; Loo can rename via UI)
-- -----------------------------------------------------------------------------
-- The login user `sales-mk@carres.com` (created later via PrincipalAccounts
-- UI) will have salesperson_id pointing to this row.
insert into salespersons (dealer_id, outlet_id, name, phone) values
  ((select id from dealers where name = 'Mattress King' limit 1),
   (select id from outlets where name = 'Mattress King Main' limit 1),
   'Mattress King · Sales',
   null);

-- -----------------------------------------------------------------------------
-- SUPPLIERS — 2 (HoOKkA + Nice Future), kept in place during cleanup because
-- product_skus.supplier_id references these rows. Names + kinds + cat_covered
-- already match Loo's prod spec from seed.sql; only lead_time + contact need
-- updating. Login users (hookka@gmail.com + nicefuture@carres.com) get
-- created via PrincipalAccounts UI on Day 1 with supplier_id pointing here.
-- -----------------------------------------------------------------------------
update suppliers set lead_time = '7-21 days', contact = null where name = 'HoOKkA';
update suppliers set lead_time = '7-10 days', contact = null where name = 'Nice Future';

-- -----------------------------------------------------------------------------
-- DELIVERY PARTNERS — Nets Sdn Bhd
-- -----------------------------------------------------------------------------
-- partner_fleet stays empty Day 1 — partner can add vehicles via Partner →
-- Fleet UI (Phase 7 Sprint 3 shipped this).
insert into delivery_partners (name, contact, zones, onboarded_date, rate_card) values
  ('Nets Sdn Bhd', null, 'Klang Valley', '2025-01-01', null);

-- -----------------------------------------------------------------------------
-- WAREHOUSES — 1 (Carres Klang)
-- -----------------------------------------------------------------------------
insert into warehouses (name, address) values
  ('Carres Klang Warehouse', 'Address TBD — please update via Logistics → Warehouses');

-- -----------------------------------------------------------------------------
-- LOO'S OWN principal app_users row — rename from "Sara · Principal" demo
-- -----------------------------------------------------------------------------
update app_users
   set name = 'principal'
 where email = 'principal@carres.com';

commit;

-- =============================================================================
-- After applying:
--
-- Day 1 user creation (via PrincipalAccounts UI — Loo logged in as principal):
--
--  | Role          | Email                        | Linked entity              |
--  |---------------|------------------------------|----------------------------|
--  | finance       | finance@carres.com           | none                       |
--  | logistics     | logistics@carres.com         | none                       |
--  | bd            | BD@carres.com                | none                       |
--  | dealer        | mattress@carres.com          | Mattress King              |
--  | salesperson   | sales-mk@carres.com          | Mattress King + Main outlet|
--  | supplier      | hookka@gmail.com             | HoOKkA                     |
--  | supplier      | nicefuture@carres.com        | Nice Future                |
--  | partner       | nets@carres.com              | Nets Sdn Bhd               |
--  | showroom      | sales@carres.com             | Carres KL Showroom         |
--
-- Items Loo can refine later via UI (no Day 1 blocker):
--   • Outlet addresses (currently "TBD - please update via …")
--   • Warehouse address
--   • Phone numbers (currently NULL on dealers/outlets/suppliers/partner)
--   • Partner fleet vehicles (currently empty)
--   • Salesperson real name + phone (currently "Mattress King · Sales")
-- =============================================================================
