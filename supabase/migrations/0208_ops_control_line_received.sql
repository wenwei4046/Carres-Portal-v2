-- 0208_ops_control_line_received
--
-- GRN per-line partial receive (Jess 2026-07-07). The operation order detail can
-- now "Book in" received units per order line WITHOUT a portal PO (AutoCount
-- orders carry only a text source_po): the /receive-line endpoint inserts n rows
-- into ops_stock_items (status 'reserved', reserved_ref = "SO-{n}") and records
-- the per-line running total here. When line_received reaches the line qty the
-- line auto-flips to Ready (via line_stock_status).
--
-- Additive + nullable → zero behaviour change until a receive is booked. READ-only
-- on the generic control PUT (the /receive-line endpoint writes it). RLS unchanged
-- (ops_order_control already carries the operation/principal policies).

alter table ops_order_control
  add column if not exists line_received jsonb;

comment on column ops_order_control.line_received is
  'Per-line GRN received qty { sku: number } — units booked into ops_stock_items (reserved to this SO); reaching the line qty auto-flips it to Ready (migration 0208).';
