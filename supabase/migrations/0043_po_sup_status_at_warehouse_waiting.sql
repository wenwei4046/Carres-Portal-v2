-- =============================================================================
-- 0043_po_sup_status_at_warehouse_waiting.sql — Phase 4.5 Chunk 1
-- =============================================================================
-- Source spec: docs/superpowers/specs/2026-05-05-phase-4.5-chunk-1-design.md §6.3
-- Sprint: 1 (schema)
--
-- Adds new po_sup_status enum value 'at_warehouse_waiting' for the Sofa Reject
-- + Relocate + Receive flow. The original v3 spec value 'at_own_wh_waiting'
-- (added in 0030) stays in the enum (deprecated) — cleanup deferred per Loo
-- C1.13 (carry-forward `phase-4.5-cleanup-at-own-wh-waiting-rename`).
--
-- Idempotent via IF NOT EXISTS (Postgres 15+).
-- =============================================================================

ALTER TYPE public.po_sup_status ADD VALUE IF NOT EXISTS 'at_warehouse_waiting';
