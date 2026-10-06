-- =============================================================================
-- 0388_a_sku_remembers_every_supplier_that_quoted_it.sql
-- CATALOG · DUAL-SOURCING, THE RECORDING HALF ONLY (YH, 2026-08-26)
-- =============================================================================
--
-- THE MEASURED CASE. Hookka Manufacturing (supplier row `Ohana`, slug lineage
-- 0032) and Hookka Industries both supply some of the same bedframes. A
-- `product_skus` row carries ONE `supplier_id` and ONE `supplier_code`, so
-- while keying the Industries quotation of 24 Jul 2026 the second company's
-- own item code and prices for an already-supplied SKU had NOWHERE to be
-- written. The keyer was holding paper the system refused to remember.
--
-- WHAT THIS ADDS — and, just as deliberately, what it does NOT touch:
--
--   · A new table: one row per (sku, supplier) OFFER — that supplier's own
--     item code and quoted prices for that SKU. Pure record-keeping.
--   · `product_skus.supplier_id` remains THE routing truth: POs address the
--     supplier in the slot, exactly as before this migration. The slot and
--     the offer list are DIFFERENT facts — "who the next PO goes to" versus
--     "who has quoted this item, at what terms" — so this is not a second
--     copy of one fact (Law D); it is the first home of a fact that had none.
--   · No POS change, no PO change, no read path changes anywhere. A database
--     with zero rows in this table behaves byte-identically to yesterday.
--
-- Whether purchasing may one day AUTO-FALL-BACK to an alternate offer when
-- the slot supplier cannot supply is a real operating-model decision and is
-- NOT built here — it sits with the owner (write-up of 2026-08-25). This
-- migration only stops the paper being thrown away while that is decided.
--
-- IDEMPOTENT: `if not exists` / `drop policy if exists` throughout.
-- =============================================================================

begin;

create table if not exists public.sku_supplier_offers (
  id            uuid primary key default gen_random_uuid(),
  sku_id        uuid not null references public.product_skus(id) on delete cascade,
  supplier_id   uuid not null references public.suppliers(id) on delete cascade,
  -- That supplier's OWN code for this piece (e.g. `1007-(K)` off the Hookka
  -- Industries quotation). Free text; ours stays on product_skus.sku.
  supplier_code text,
  -- The quoted numbers, as-quoted. Group convention (YH, 2026-08-25): the
  -- quotation's figure is the SELLING price, so these mirror price/pwp_price
  -- semantics — `pwp_price <= 0` never occurs because NULL means not quoted.
  price         numeric(12,2),
  pwp_price     numeric(12,2),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.app_users(id),
  -- One offer per supplier per SKU — a re-key UPDATES it, never stacks a
  -- second row to disagree with the first.
  unique (sku_id, supplier_id)
);

create index if not exists sku_supplier_offers_sku_idx on public.sku_supplier_offers(sku_id);

alter table public.sku_supplier_offers enable row level security;

-- RLS, explained (red line 2): READ for every internal role — the same
-- boundary as `suppliers_read` (0002), because an offer is supplier-relation
-- data an internal screen may show. WRITE for the principal only — offers
-- carry PRICES, and price-bearing catalog writes have been principal-locked
-- since 0175/0186; the same person who may set a SKU's price may record what
-- a supplier quoted for it. No existing policy on any other table changes.
drop policy if exists sku_supplier_offers_internal_read on public.sku_supplier_offers;
create policy sku_supplier_offers_internal_read on public.sku_supplier_offers
  for select using ((select public.is_internal()));

drop policy if exists sku_supplier_offers_principal_write on public.sku_supplier_offers;
create policy sku_supplier_offers_principal_write on public.sku_supplier_offers
  for all using ((select public.is_principal()))
  with check ((select public.is_principal()));

commit;

-- ── VERIFY (by hand; no row-count assertions — red line 8) ──────────────────
--
--   select tablename, policyname from pg_policies
--   where tablename = 'sku_supplier_offers';
--
-- Expect the two policies above. Then record an offer through the catalog UI
-- and read it back:
--
--   select s.sku, o.supplier_code, o.price, o.pwp_price, sup.name
--   from sku_supplier_offers o
--   join product_skus s on s.id = o.sku_id
--   join suppliers sup on sup.id = o.supplier_id;
