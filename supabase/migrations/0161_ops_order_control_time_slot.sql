-- 0161_ops_order_control_time_slot.sql
-- P2 follow-up of the Orders control-grid build (memory: project-orders-control-spec, Jess 2026-06-10).
--
-- Adds the drawer's "delivery date + time slot" time-slot field to the control overlay.
-- delivery_date itself stays on `orders` (edited via set_order_date); the time WINDOW is an
-- operational annotation with no home on core `orders`, so it belongs here on the 1:1 overlay
-- alongside stock_eta / the four remark fields.
--
-- Purely additive: nullable text column, no default, no backfill, no RLS change (the column
-- inherits ops_order_control's existing row-level policies). Stored as free text — the UI offers
-- a suggested set (DELIVERY_TIME_SLOTS in packages/shared) but the operator isn't boxed in.

alter table public.ops_order_control
  add column delivery_time_slot text;

comment on column public.ops_order_control.delivery_time_slot is
  'Planned delivery time window (free text; UI suggests Morning/Afternoon/Evening/Anytime). Pairs with orders.delivery_date for the drawer "date + time slot".';
