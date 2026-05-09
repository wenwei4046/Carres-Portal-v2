-- =============================================================================
-- 0074_product_skus_cost_catalog.sql
-- =============================================================================
-- Catalog management (Loo 2026-05-09):
--   • cost is fixed per SKU (not hand-entered per PO line) — Q5=a
--   • Logistics + Principal both manage SKU catalog (Q2=c) — covered by the
--     existing `is_internal()` write policy (principal/logistics/finance/bd).
--   • Add new model + add new variant under existing model (Q4=c) — soft-delete
--     pattern needs `discontinued_at` on product_skus + sofa_fabrics, mirroring
--     product_models which has it since 0001.
--
-- This migration:
--   1. ADD COLUMN product_skus.cost numeric(14,2) — nullable; new lines stay
--      NULL until logistics sets a procurement cost in the catalog UI.
--      Backfill = round(price * 0.55, 2) so existing SKUs keep working in the
--      Create-PO flow immediately (matches finance_monthly_pl's COGS placeholder
--      from carry-forward `phase-5-cogs-real-source`).
--   2. ADD COLUMN product_skus.discontinued_at timestamptz — soft-delete.
--   3. ADD COLUMN sofa_fabrics.discontinued_at timestamptz — soft-delete.
--   4. ALTER TYPE cost_source_enum ADD VALUE 'catalog' — Create-PO now stamps
--      'catalog' on every line, since cost auto-reads from product_skus.cost.
--      Other values (hand_entered/prev_po/system_suggested/auto_issued) stay
--      live for legacy + auto-issue paths.
--
-- NOT touched (intentional):
--   • RLS — `catalog_write_internal` / `skus_write_internal` /
--     `fabrics_write_internal` already cover principal+logistics via
--     `is_internal()` (returns true for principal/logistics/finance/bd).
--   • _logistics_create_po_inner — still validates cost+cost_source non-NULL
--     per line; the FE just stops asking the operator and uses the SKU's cost.
--
-- CLAUDE.md §14 #6 satisfied — no edits to committed migration history.
-- =============================================================================

alter table public.product_skus
  add column if not exists cost              numeric(14,2),
  add column if not exists discontinued_at   timestamptz;

alter table public.sofa_fabrics
  add column if not exists discontinued_at   timestamptz;

-- Backfill: 55% of retail as a placeholder procurement cost, rounded to cents.
-- Logistics overrides via the catalog UI when real costs are negotiated.
update public.product_skus
   set cost = round(price * 0.55, 2)
 where cost is null;

-- New cost_source value for the auto-from-catalog path.
alter type cost_source_enum add value if not exists 'catalog';

comment on column public.product_skus.cost is
  'Fixed procurement cost per unit (Loo 2026-05-09). Auto-fills onto every Create-PO line; cost_source=''catalog'' on persist. NULL means "not yet set" — Create-PO refuses lines pointing at NULL-cost SKUs until logistics sets a value in the catalog UI.';

comment on column public.product_skus.discontinued_at is
  'Soft-delete (Loo 2026-05-09 catalog admin). NOT NULL means "hidden from new POs / orders"; existing PO lines keep referencing the SKU text. Mirrors product_models.discontinued_at (since 0001).';

comment on column public.sofa_fabrics.discontinued_at is
  'Soft-delete (Loo 2026-05-09 catalog admin). NOT NULL means "no longer offered to new orders". Existing order_lines/PO lines keep their fabric attrs intact.';
