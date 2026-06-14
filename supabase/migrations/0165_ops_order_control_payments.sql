-- 0165_ops_order_control_payments.sql
--
-- Jess: "balance should be its own panel" — the Master Sheet's dedicated
-- "Balance" tab (Outstanding payment + storage fees + payment status per
-- order). ops_order_control is already the per-order ops overlay (it carries
-- payment_status), so the payment surface extends it rather than a new table.
--
--   balance               — RM the customer still owes. Imported from
--                           AutoCount's order-level Balance column (the figure
--                           Jess copies into the sheet today); also editable.
--   storage_from          — the date storage fees start accruing. Defaults to
--                           NULL → the panel uses the order's delivery_date
--                           (ETA). Editable because the ETA can change.
--   storage_fee_override  — manual override of the auto-computed storage fee
--                           (NULL = use the computed value). Fees: mattress/
--                           bedframe RM150/month, sofa RM200/2 weeks, accruing
--                           from storage_from/ETA — computed in the app from
--                           the order's item categories, overridable here.
--
-- Additive nullable columns on an existing ops_ overlay table (Jess namespace).
-- payment_status already exists. No RLS change (0159 already scopes the table
-- to operation/principal). No data backfill — overlay rows are created lazily.

alter table public.ops_order_control
  add column if not exists balance numeric(12,2),
  add column if not exists storage_from date,
  add column if not exists storage_fee_override numeric(12,2);
