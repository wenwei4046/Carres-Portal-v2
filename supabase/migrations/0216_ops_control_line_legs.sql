-- 0216_ops_control_line_legs.sql (Jess approved in-conversation 2026-07-11)
-- =============================================================================
-- Per-item transfer ROUTE LEGS for the order-drawer Route "Option D".
--
--   line_legs — jsonb { "<sku>": [ { from, to, carrier, done }, ... ] }
--               A SPECIAL multi-hop transfer arrangement for a line (supplier
--               pickup, cross-warehouse). Empty / absent = the standard single
--               hop to the default consolidation warehouse — so existing orders
--               read byte-identical to today.
--
-- Additive, nullable. Mirrors line_locations / line_etas (migrations 0190/0192).
-- No RLS change: ops_order_control's existing operation/principal read+write
-- policies already cover every column on the row.
-- =============================================================================

alter table public.ops_order_control
  add column if not exists line_legs jsonb;

comment on column public.ops_order_control.line_legs is
  'Per-line transfer route legs { <sku>: [{from,to,carrier,done}] } — a special multi-hop arrangement (supplier pickup / cross-warehouse); empty = the standard single hop to the default warehouse (migration 0216, Jess 2026-07-11).';
