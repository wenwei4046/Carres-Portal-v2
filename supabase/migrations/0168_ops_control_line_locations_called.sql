-- =============================================================================
-- 0168_ops_control_line_locations_called.sql (Loo approved in-conversation)
-- =============================================================================
-- Two more ops_order_control overlay fields for the order-drawer redesign:
--   line_locations  — jsonb { "<sku>": string[] }; each order line can sit in
--                     a different warehouse location (products differ), keyed by
--                     the line SKU (duplicate-SKU lines share a location).
--   called_customer — the operator ticks this once they have phoned the
--                     customer; the drawer blocks Proceed on outstation orders
--                     until it is ticked (call-first SOP).
-- Additive + nullable/defaulted → zero-downtime.
-- =============================================================================
alter table public.ops_order_control
  add column if not exists line_locations jsonb,
  add column if not exists called_customer boolean not null default false;
