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
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Layer 1 — leaf tables (no incoming FKs from anything we keep)
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
-- Layer 2 — child rows of orders / POs
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
-- Layer 4 — orders + POs
-- -----------------------------------------------------------------------------
delete from orders;
delete from purchase_orders;

-- -----------------------------------------------------------------------------
-- Layer 5 — entity tables (suppliers / partners / warehouses)
-- -----------------------------------------------------------------------------
delete from delivery_partners;
delete from suppliers;
delete from warehouses;

-- -----------------------------------------------------------------------------
-- Layer 6 — product catalog (commented out by default; uncomment for full wipe)
-- -----------------------------------------------------------------------------
-- delete from product_skus;
-- delete from product_models;
-- delete from sofa_fabrics;
-- delete from addons;
-- delete from floor_config;

-- -----------------------------------------------------------------------------
-- Layer 7 — dealer hierarchy
-- -----------------------------------------------------------------------------
delete from salespersons;
delete from outlets;
delete from dealers;

-- -----------------------------------------------------------------------------
-- Layer 8 — users (app_users first — has FK to auth.users)
-- -----------------------------------------------------------------------------
-- Drop ALL test users (*@x.com — runtime-created via pnpm seed:test-users).
delete from app_users where email like '%@x.com';

-- Drop demo *@carres.com users EXCEPT principal (Loo's account).
delete from app_users where email like '%@carres.com' and email <> 'principal@carres.com';

-- Drop the auth.users rows. CASCADE not enabled on app_users → must delete in
-- this order. principal@carres.com keeps both rows.
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
