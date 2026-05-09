-- =============================================================================
-- phase-9-cleanup.sql — Phase 9 Go-live "Clean slate" cleanup
-- =============================================================================
--
-- ⚠️  DESTRUCTIVE — RUN ONCE, ON STAGING-PROMOTED-TO-PROD ONLY
-- ⚠️  REQUIRES Loo's per-instance approval per CLAUDE.md §14 #1.
--
-- Purpose: takes the staging Supabase project (kfprgpjpaffedghytstl) and
-- strips it down to "blank prod, ready for real master data" by removing:
--
--   1. ALL E2E test fixtures (DL-9001..9999 series, *@x.com users, PO-FIXTURE-*,
--      99999999-* seed-e2e-fixtures rows)
--   2. ALL demo *@carres.com users EXCEPT principal@carres.com (Loo signed off
--      on keeping that one with password='111' as known-risk in §17)
--   3. ALL demo master data from seed.sql (BedHouse KL et al, HoOKkA, Nice
--      Future, JT Express, demo warehouses + outlets + salespersons)
--
-- Preserved:
--   • principal@carres.com auth row + matching app_users row (Loo's account)
--   • Product catalog (product_models, product_skus, sofa_fabrics, addons,
--     floor_config) — these are Carres-branded SKUs, not demo data per se.
--     If Loo wants these wiped too, run the catalog cleanup at the bottom
--     (commented out by default).
--   • All migrations + RLS policies + RPCs + triggers (untouched)
--   • All Storage buckets (drained separately if needed)
--
-- Apply with: supabase db query --linked --file scripts/phase-9-cleanup.sql
-- (after explicit "go ahead" from Loo in conversation)
--
-- Layer ordering corrected 2026-05-09 after live-staging FK errors:
--   • purchase_orders BEFORE orders (PO.dl FK refs orders.dl)
--   • app_users BEFORE entities (app_users.partner_id/dealer_id/etc. refs)
--   • warehouses BEFORE delivery_partners (warehouses.owning_partner_id FK)
--   • suppliers NOT deleted: product_skus.supplier_id refs them, AND
--     HoOKkA + Nice Future names already match Loo's prod spec — UPDATE
--     fields in production-master-data.sql instead of INSERT.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Layer 1 — leaf tables
-- -----------------------------------------------------------------------------
delete from audit_log;
delete from po_history;
delete from order_history;
delete from po_receipts;
delete from payments;
delete from invoices;
delete from refunds;
delete from approvals;
delete from bank_statement_lines;
delete from bank_statements;
delete from reconciliations;
delete from announcements;
delete from inquiries;

-- -----------------------------------------------------------------------------
-- Layer 2 — child rows
-- -----------------------------------------------------------------------------
delete from order_lines;
delete from order_addons;
delete from order_supplier_threads;
delete from purchase_order_lines;
delete from stock_movements;

-- -----------------------------------------------------------------------------
-- Layer 3 — derived tables
-- -----------------------------------------------------------------------------
delete from stock_balances;
delete from partner_fleet;

-- -----------------------------------------------------------------------------
-- Layer 4 — purchase_orders BEFORE orders (PO.dl FK refs orders.dl)
-- -----------------------------------------------------------------------------
delete from purchase_orders;
delete from orders;

-- -----------------------------------------------------------------------------
-- Layer 5 — app_users (drops FK refs to entities BEFORE deleting entities)
-- -----------------------------------------------------------------------------
delete from app_users where email like '%@x.com';
delete from app_users where email like '%@carres.com' and email <> 'principal@carres.com';

-- -----------------------------------------------------------------------------
-- Layer 6 — warehouses BEFORE delivery_partners (warehouses.owning_partner_id)
-- -----------------------------------------------------------------------------
delete from warehouses;
delete from delivery_partners;

-- suppliers NOT deleted — product_skus.supplier_id references them, and the
-- HoOKkA + Nice Future names + kinds + cat_covered already match Loo's prod
-- spec. production-master-data.sql does UPDATEs on these rows in place.

-- -----------------------------------------------------------------------------
-- Layer 7 — product catalog (commented out by default; uncomment for full wipe
-- — but note suppliers cleanup must also be enabled or FKs will block)
-- -----------------------------------------------------------------------------
-- delete from product_skus;
-- delete from product_models;
-- delete from sofa_fabrics;
-- delete from addons;
-- delete from floor_config;
-- delete from suppliers;

-- -----------------------------------------------------------------------------
-- Layer 8 — dealer hierarchy
-- -----------------------------------------------------------------------------
delete from salespersons;
delete from outlets;
delete from dealers;

-- -----------------------------------------------------------------------------
-- Layer 9 — auth.users last
-- -----------------------------------------------------------------------------
delete from auth.users where email like '%@x.com';
delete from auth.users where email like '%@carres.com' and email <> 'principal@carres.com';

-- -----------------------------------------------------------------------------
-- Sequence resets (so prod numbering starts fresh)
-- -----------------------------------------------------------------------------
-- orders.dl is generated by trigger from a sequence. After cleanup, future
-- real orders should start at dl=1001 (not continue from wherever staging
-- left off). Same for invoices + credit_notes.
do $$
declare
  s text;
begin
  -- orders.dl sequence
  for s in
    select sequence_name from information_schema.sequences
    where sequence_schema = 'public'
      and sequence_name in ('orders_dl_seq', 'invoice_no_seq', 'credit_note_no_seq')
  loop
    execute format('alter sequence public.%I restart with 1001', s);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Sanity check (errors out if anything got left behind)
-- -----------------------------------------------------------------------------
do $$
declare
  v_cnt int;
begin
  select count(*) into v_cnt from auth.users where email like '%@x.com';
  if v_cnt > 0 then raise exception 'cleanup failed: % @x.com users remain', v_cnt; end if;

  select count(*) into v_cnt from auth.users
    where email like '%@carres.com' and email <> 'principal@carres.com';
  if v_cnt > 0 then raise exception 'cleanup failed: % demo @carres.com users remain', v_cnt; end if;

  select count(*) into v_cnt from dealers;
  if v_cnt > 0 then raise exception 'cleanup failed: % dealers remain', v_cnt; end if;

  select count(*) into v_cnt from suppliers;
  if v_cnt > 0 then raise exception 'cleanup failed: % suppliers remain', v_cnt; end if;
end $$;

commit;

-- =============================================================================
-- Post-run state:
--   • auth.users contains exactly 1 row (principal@carres.com)
--   • app_users contains exactly 1 row (Loo's principal entry)
--   • All transactional + master tables empty
--   • Product catalog preserved (Carres-branded SKUs)
--   • Sequences reset to 1001
-- Next step: run scripts/production-master-data.sql (Loo fills the template)
--           to seed real dealers / suppliers / partners / warehouses.
-- =============================================================================
