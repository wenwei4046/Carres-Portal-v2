-- Phase 4.5 Chunk 2 Sprint A Task 2: backfill customer-leg fields onto threads.
--
-- Per `docs/superpowers/specs/2026-05-05-phase-4.5-chunk-2-design.md` §3.2,
-- migration 0049 added 5 customer-leg columns to `order_supplier_threads`:
--   delivery_partner_id, confirm_delivery_date, request_for_delivery_at,
--   partner_accepted_at, partner_rejected_at.
--
-- Phase 4.5 Chunk 1 wrote those values onto `purchase_orders` (via 0044's
-- four PO columns + the existing PO.delivery_partner_id) under the
-- "same LP for both legs" assumption. Chunk 2 splits per-leg, so any
-- existing thread whose PO already carries customer-leg state needs that
-- state copied across before Sprint C migration 0052 drops the legacy PO
-- columns.
--
-- Schema delta: NONE — backfill only. No DDL, no RLS changes, no triggers.
--
-- Idempotency: the `t.delivery_partner_id IS NULL` predicate guards
-- re-runs. After the first pass, every backfilled row has a non-NULL
-- delivery_partner_id and is skipped. Future writes (e.g. from new
-- partner-accept flows landing in Sprint B) are also preserved because
-- this UPDATE never overwrites a non-NULL delivery_partner_id.
--
-- Expected row count on staging today: very likely 0 — LP test users
-- haven't been seeded against staging since Chunk 1, so customer-leg
-- flow rows on real PO data are minimal. The migration is still required
-- as forward-compatibility: production-like data with existing
-- PO.delivery_partner_id values must reflect onto threads.
--
-- Verification (post-apply):
--   SELECT COUNT(*) FROM order_supplier_threads
--    WHERE delivery_partner_id IS NOT NULL;
--   SELECT COUNT(*) FROM order_supplier_threads t
--     JOIN purchase_orders p ON t.po_id = p.id
--    WHERE p.delivery_partner_id IS NOT NULL;
-- Both counts must match.

update public.order_supplier_threads t
   set delivery_partner_id     = p.delivery_partner_id,
       confirm_delivery_date   = p.confirm_delivery_date,
       request_for_delivery_at = p.request_for_delivery_at,
       partner_accepted_at     = p.partner_accepted_at,
       partner_rejected_at     = p.partner_rejected_at
  from public.purchase_orders p
 where t.po_id = p.id
   and t.delivery_partner_id is null;
