-- Phase 4.5 Chunk 2 carry-forward `phase-4.5-chunk-2-stale-pre-0051-rpcs`.
--
-- IRREVERSIBLE: DROP 6 stale Category C functions whose bodies reference
-- columns dropped or renamed by Sprint C migration 0052
-- (purchase_orders.delivery_partner_id renamed → procurement_partner_id;
-- 4 customer-leg cols dropped: confirm_delivery_date, request_for_delivery_at,
-- partner_accepted_at, partner_rejected_at).
--
-- Pre-approval citation: Loo's explicit single-instance approval recorded
-- 2026-05-08 (current conversation) per CLAUDE.md §14 #1 + #7. The T13.6
-- audit during Sprint C confirmed no live callers for any of these 6
-- functions (see docs/superpowers/plans/2026-05-06-phase-4.5-chunk-2-preflight-notes.md
-- §"Sprint C T13.6 audit").
--
-- Replacement map (each dropped function is functionally superseded):
--
-- 1. po_issue(text, uuid, uuid, text, int, uuid, date) — 0003:76
--    Superseded by Phase 4 logistics_create_po + logistics_create_pos_batch
--    in 0019/0034. The original 0003 RPC was the v0 "single-line PO" prototype
--    before per-line PO_lines were introduced.
--
-- 2. logistics_assign_pickup_partner(text, uuid) — 0019:1425
--    Superseded by logistics_assign_partner_and_dispatch (0051) which is
--    thread-scoped (operates on order_supplier_threads, not purchase_orders).
--
-- 3. partner_confirm_receive(text) — 0034:366
--    Superseded by lp_accept_inbound_delivery (0045/0053) which moved the
--    PO sup_status advancement to a dedicated 代按-aware RPC.
--
-- 4. logistics_attach_pod_do(uuid, text, text) — 0034:1171
--    Referenced as a string literal in packages/shared/src/sops.ts SOP map
--    for the `dispatched → delivered` transition, but no runtime dispatcher
--    reads that map yet (Phase 7 will). The function body in 0034 references
--    purchase_orders columns that 0052 dropped; rewriting here would couple
--    Phase 7 design to today's schema. DROP now; Phase 7 recreates with a
--    fresh body matching its actual delivered-state requirements.
--
-- 5. partner_accept_dispatch(text, date) — 0045:30
--    Superseded by logistics_partner_accept_rfd (0051) which is thread-scoped.
--    The codex-fixes.test.ts F9/F12 assertions test the migration TEXT in 0045,
--    not the live function, so they continue to pass after this DROP.
--
-- 6. partner_reject_dispatch(text, text) — 0045:117
--    Same as #5 — superseded by logistics_partner_reject_rfd (0051);
--    test assertions are against migration text, unaffected by DROP.
--
-- DROP without CASCADE — the audit guarantees no dependents. If an unexpected
-- dependency surfaces, the migration will fail with a clear pg error and we
-- can investigate before adding CASCADE.
--
-- Idempotent: DROP FUNCTION IF EXISTS — re-running on a post-applied database
-- is a no-op (the functions no longer exist).

drop function if exists public.po_issue(text, uuid, uuid, text, int, uuid, date);
drop function if exists public.logistics_assign_pickup_partner(text, uuid);
drop function if exists public.partner_confirm_receive(text);
drop function if exists public.logistics_attach_pod_do(uuid, text, text);
drop function if exists public.partner_accept_dispatch(text, date);
drop function if exists public.partner_reject_dispatch(text, text);
