-- 0196_ops_control_storage_extension.sql
--
-- Storage delivery-EXTENSION record (Jess 2026-06-30, the two customer-facing
-- Delivery-Extension Google Forms). A one-time customer extension captures a new
-- requested delivery date + a reason + the customer's acknowledgement of the
-- one-time policy. The free storage window then recomputes (in WORKING DAYS) from
-- `extension_original_date` — a snapshot of the delivery date taken at the FIRST
-- extension so the original basis is never lost when the target date moves.
--
-- One-time rule: operation may record ONE extension (extension_count 0 -> 1);
-- a 2nd+ extension is blocked for operation and requires a PRINCIPAL (enforced in
-- the Hono /storage/extend route, mirroring the waiver decide gate).
--
-- Additive + DORMANT: every column is nullable / defaults to the no-extension
-- state (extension_count default 0), so existing orders + the storage-fee math
-- are byte-identical until an extension is actually recorded. ops_order_control
-- already carries operation/principal-only write RLS (migration 0159) — these
-- columns inherit it; no policy change.

alter table public.ops_order_control
  add column if not exists extension_original_date   date,
  add column if not exists extension_new_date        date,
  add column if not exists extension_reason          text,
  add column if not exists extension_note            text,
  add column if not exists extension_acknowledged_at timestamptz,
  add column if not exists extended_at               timestamptz,
  add column if not exists extended_by               uuid,
  add column if not exists extension_count           integer not null default 0;
