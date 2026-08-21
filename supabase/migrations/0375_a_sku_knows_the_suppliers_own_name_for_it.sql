-- 0375_a_sku_knows_the_suppliers_own_name_for_it.sql
-- ===========================================================================
-- THE SUPPLIER'S OWN ITEM CODE, ON THE SKU (Loo, meeting 2026-08-21).
--
-- WHY. The identity chain Loo named:
--     internal SKU code <> item name <> supplier SKU <> supplier name
-- Three of the four already live on product_skus (sku, description via the
-- model+variant, supplier_id -> suppliers.name). The SUPPLIER'S OWN code for
-- the item — what Hookka's quotation calls the piece — had nowhere to live,
-- so keying the paper in loses the one identifier the supplier recognises on
-- a PO or a claim.
--
-- WHAT. One nullable column. Precedent: catalog_fabrics.supplier_code (0202)
-- stores exactly this fact for fabrics.
--
-- NOT a second description column: product_skus.description already exists
-- (0170) and the Suppliers tab reads it. NOT a supplier_contacts table —
-- "different supplier accounts" is unconfirmed scope and suppliers.contact
-- still holds today's single contact.
--
-- WRITES: the catalog write doors (POST/PATCH /skus) — principal/internal per
-- the existing RLS (0002). No RLS change, no trigger change, no grant change.
-- 0175's price/cost lock is untouched: supplier_code is not money.
--
-- ⚠️ NOT APPLIED BY THE AUTHOR. Number taken 2026-08-21 as MAX(repo tail,
-- every remote branch, tracker) = 0374, so this is 0375 — RE-CHECK THE
-- TRACKER IN THE SAME MINUTE YOU APPLY:
--     select name, version from supabase_migrations.schema_migrations
--     order by version desc limit 5;
-- The SQL editor writes NO tracker row; insert it by hand after applying,
-- WITH the 0375_ prefix.
-- ===========================================================================

begin;

alter table public.product_skus
  add column if not exists supplier_code text;

comment on column public.product_skus.supplier_code is
  'The SUPPLIER''S own item code for this SKU (e.g. the code on the Hookka quotation). Nullable — legacy and service SKUs have none. Ours is `sku`; this is theirs.';

commit;

-- ===========================================================================
-- VERIFY after applying:
-- 1 · column exists, nullable, no default
--     select column_name, is_nullable, column_default
--     from information_schema.columns
--     where table_name = 'product_skus' and column_name = 'supplier_code';
-- 2 · NEGATIVE CONTROL — nothing was backfilled (§6: no data mutation)
--     select count(*) from product_skus where supplier_code is not null;
--     -- expect 0
-- ===========================================================================
