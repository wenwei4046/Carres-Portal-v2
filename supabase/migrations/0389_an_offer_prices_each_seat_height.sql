-- =============================================================================
-- 0389_an_offer_prices_each_seat_height.sql
-- CATALOG · a supplier's OFFER can price per sofa seat height (YH, 2026-08-26)
-- =============================================================================
--
-- THE MEASURED CASE. Xammar sofa modules are supplied by BOTH Hookkas and
-- priced per seat height (24" / 28" / 30"). The SLOT supplier's heights live on
-- the SKU itself (`product_skus.prices_by_size`, 0204 — the SKU Master sofa
-- grid). The OTHER supplier's offer (0388) carries ONE flat `price`, so their
-- per-height quotation had nowhere to be written — the same paper-refused
-- problem 0388 fixed, one layer deeper.
--
-- One additive column, mirroring 0204's shape exactly: a {height → RM} map.
-- Flat-priced offers keep using `price`; NULL here means "not quoted by
-- height", never zero. No routing, no POS, no existing read path changes —
-- the 0388 boundary holds: the slot remains the only thing POs route by.
--
-- RLS: unchanged. The 0388 row policies already govern every column.
--
-- IDEMPOTENT: `add column if not exists`.
-- =============================================================================

begin;

alter table public.sku_supplier_offers
  add column if not exists prices_by_size jsonb;

comment on column public.sku_supplier_offers.prices_by_size is
  'That supplier''s quoted price per size/seat-height, {size → RM} — the 0204 '
  'shape. NULL = not quoted by height (flat `price` applies, or nothing '
  'quoted). 0389.';

commit;

-- ── VERIFY (by hand; no row-count assertions — red line 8) ──────────────────
--
--   select column_name, data_type from information_schema.columns
--   where table_name = 'sku_supplier_offers' order by ordinal_position;
--
-- Expect `prices_by_size · jsonb` in the list. Then record a sofa offer through
-- the strip and read it back:
--
--   select s.sku, sup.name, o.prices_by_size
--   from sku_supplier_offers o
--   join product_skus s on s.id = o.sku_id
--   join suppliers sup on sup.id = o.supplier_id
--   where o.prices_by_size is not null;
