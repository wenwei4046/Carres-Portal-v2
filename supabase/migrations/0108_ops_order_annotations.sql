-- =============================================================================
-- 0108_ops_order_annotations.sql
-- =============================================================================
-- Adds annotation columns to ops_imported_orders (Jess COO 2026-05-14).
--
-- These mirror her Excel Master/Ops sheet columns that today live in 19 wrap-
-- around columns. Storing them as proper columns on the staging table lets the
-- OrderDetailDrawer edit them inline + drives filtering/search later.
--
-- All nullable, all additive — no existing data touched.
-- =============================================================================

alter table ops_imported_orders
  add column if not exists ops_customer_request    text,
  add column if not exists ops_carres_remark       text,
  add column if not exists ops_action_for_logistic text,
  add column if not exists ops_logistic_remark     text,
  add column if not exists ops_logistic_eta        date,
  add column if not exists ops_delivery_time_slot  text;

comment on column ops_imported_orders.ops_customer_request is
  'Customer special request (deliver weekday 2-4pm, call before arrival, etc). From Excel Master/Ops "Customer Request" column.';
comment on column ops_imported_orders.ops_carres_remark is
  'Internal ops note for the team. From Excel Master/Ops "Carres Remark" column.';
comment on column ops_imported_orders.ops_action_for_logistic is
  'What ops wants the logistic partner to do (call b4 a week, etc). From Excel "Action For Logistic" column.';
comment on column ops_imported_orders.ops_logistic_remark is
  'What the logistic partner told us (NETS confirmed Tue 2pm, etc). From Excel "Logistic Remark" column.';
comment on column ops_imported_orders.ops_logistic_eta is
  'Date logistic partner committed for delivery. From Excel "Logistic ETA" column.';
comment on column ops_imported_orders.ops_delivery_time_slot is
  'Free-text delivery time window (2-4pm, morning, TBC). From Excel "Time" column.';
