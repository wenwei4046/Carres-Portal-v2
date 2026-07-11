-- 0217_ops_loans_generalize.sql (Jess approved in-conversation 2026-07-11)
-- =============================================================================
-- Generalize the loaner flow from SOFA-only + OWN-WAREHOUSE-only (migration 0209)
-- to ANY category (mattress / sofa / bedframe) with TWO sources:
--   • warehouse — lend a free unit from Carres's own stock (the existing path).
--   • supplier  — BORROW a piece from a supplier; this creates a RETURN
--                 OBLIGATION (we owe the supplier one piece back when the real
--                 unit lands). No own ops_stock_items row exists for a borrowed
--                 piece, so item_id becomes nullable and the piece is described
--                 by borrowed_sku / borrowed_label + supplier_id.
--
-- All additive. Existing sofa loans default to source='warehouse' with item_id
-- intact — byte-identical behaviour. Table name kept (`ops_sofa_loans`) to avoid
-- churn across API/hooks; it now holds all categories. RLS unchanged (0209's
-- read-internal + write operation/principal policies already cover new columns).
-- =============================================================================

alter table public.ops_sofa_loans
  -- a borrowed-from-supplier loan has no own-stock unit
  alter column item_id drop not null;

alter table public.ops_sofa_loans
  add column if not exists source text not null default 'warehouse'
    check (source in ('warehouse', 'supplier')),
  -- what kind of piece is on loan (mattress / sofa / bedframe / accessory …)
  add column if not exists category text,
  -- supplier we borrowed from + owe a piece back to (source='supplier' only)
  add column if not exists supplier_id uuid references public.suppliers(id),
  -- describe the borrowed piece (no ops_stock_items row for a supplier borrow)
  add column if not exists borrowed_sku text,
  add column if not exists borrowed_label text,
  -- the RETURN OBLIGATION close-out: when the borrowed piece went back to the
  -- supplier. status='returned' means the customer swap is done; this stamps the
  -- separate "returned to supplier" step so the debt is visibly outstanding.
  add column if not exists returned_to_supplier_at timestamptz;

-- Outstanding supplier-borrow obligations (owe a piece, not yet returned).
create index if not exists idx_ops_sofa_loans_owed_supplier
  on public.ops_sofa_loans (supplier_id)
  where source = 'supplier' and returned_to_supplier_at is null;

comment on column public.ops_sofa_loans.source is
  'warehouse = lent from own free stock; supplier = borrowed from a supplier (owe a piece back). Migration 0217.';
comment on column public.ops_sofa_loans.returned_to_supplier_at is
  'When the borrowed piece was returned to the supplier — closes the return obligation (source=supplier). Migration 0217.';
