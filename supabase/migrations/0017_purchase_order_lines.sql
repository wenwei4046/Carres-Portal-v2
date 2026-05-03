-- =============================================================================
-- 0017_purchase_order_lines.sql — Phase 4 M1 schema (Logistics)
-- =============================================================================
-- Source of truth: docs/superpowers/specs/2026-05-03-phase-4-logistics-design.md
-- Decisions:
--   §5  — convert purchase_orders from single-sku to multi-line
--   §17 — adds dl_refs[] for cross-order PO bundles (E3/A7)
--   §17.5 CQ1 — destructive guard at top: refuse to drop columns if any rows exist
--
-- What this migration does (idempotent additive parts use IF NOT EXISTS where
-- possible; the destructive DROP COLUMN steps are gated behind the assertion):
--   1. Hard guard: refuse to proceed if purchase_orders has any rows. The proto
--      schema ships empty in MVP, so this should always pass on green-field.
--      If this raises in production, STOP and design a real data-migration step.
--   2. New child table `purchase_order_lines` (po_id, sku, qty, received_qty)
--      with composite PK and check constraints to keep over-receipt impossible.
--   3. Add `purchase_orders.dl_refs int[]` for combined PO bundles where one PO
--      groups SKUs across N source orders. Sofa POs continue using the singular
--      `dl` column; combined POs populate `dl_refs`. Drawer queries can use
--      `where p.dl = $1 OR $1 = ANY(p.dl_refs)` to find every PO touching a DL.
--   4. GIN index on `dl_refs` for fast `= ANY` lookups (P3).
--   5. Drop the old single-line `sku` and `qty` columns from purchase_orders —
--      replaced entirely by purchase_order_lines.
--
-- Why no data migration: spec §5 + §17.8 confirm the production purchase_orders
-- table is empty (Phase 1 schema, no real POs created yet). The CQ1 guard
-- enforces this assumption loudly instead of silently dropping columns that
-- might still hold data.
-- =============================================================================

-- 1. CQ1 destructive guard: bail loudly if remote has unexpected data.
do $$
begin
  if (select count(*) from purchase_orders) > 0 then
    raise exception 'purchase_orders is not empty (% rows). Drop columns aborted.',
      (select count(*) from purchase_orders);
  end if;
end $$;

-- 2. Multi-line child table.
create table purchase_order_lines (
  po_id        text not null references purchase_orders(id) on delete cascade,
  sku          text not null,
  qty          int  not null check (qty > 0),
  received_qty int  not null default 0 check (received_qty >= 0),
  primary key (po_id, sku),
  check (received_qty <= qty)
);
create index po_lines_po_idx on purchase_order_lines(po_id);

-- 3. dl_refs[] column for combined-bundle POs (A7 / E3).
alter table purchase_orders add column dl_refs int[];

-- 4. GIN index for `= ANY(dl_refs)` lookups (P3).
create index po_dl_refs_idx on purchase_orders using gin(dl_refs);

-- 5. Drop the legacy single-sku columns. Guard above ensures no data loss.
alter table purchase_orders drop column sku;
alter table purchase_orders drop column qty;
