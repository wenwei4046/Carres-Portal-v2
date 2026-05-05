-- =============================================================================
-- 0055_purchase_order_lines_cogs.sql -- Phase 4.5 Chunk 2 Sprint E Task 24
-- =============================================================================
-- Source spec:  docs/superpowers/specs/2026-05-05-phase-4.5-chunk-2-design.md
--               §6 M4.6 (CQ3 -- "PO COGS source", backfill NULL)
-- Source plan:  docs/superpowers/plans/2026-05-06-phase-4.5-chunk-2.md
--               §Sprint E Task 24 (lines 263-269)
-- Resume plan:  docs/superpowers/plans/2026-05-06-phase-4.5-chunk-2-resume.md
--               §Sprint E (lines 269-282) -- migration number bumped to 0055
--               (master plan said 0054 but 0054 is now Sprint D
--               stockpile thresholds migration).
--
-- What this migration does (additive only -- no DROPs / RENAMEs):
--   1. Creates ENUM cost_source_enum with 3 labels:
--        a. hand_entered     -- logistics user typed the cost manually
--        b. prev_po          -- auto-filled from the most-recent received PO
--                              for the same SKU (via logistics_recent_po_cost
--                              RPC -- T27 work, not T24)
--        c. system_suggested -- heuristic suggestion (e.g. 110% of prev_po)
--   2. Adds 2 NULLABLE columns to purchase_order_lines:
--        a. cost        numeric(14,2) -- per-unit cost. CHECK enforces
--                                        non-negative when set (NULL allowed).
--        b. cost_source cost_source_enum -- which heuristic produced the
--                                          cost value above.
--      Both columns are NULLABLE because legacy rows from 0019/0025-era
--      PO creates have no historical cost recorded (CQ3 locked: backfill
--      NULL, do not invent). New PO creates will enforce non-NULL via
--      zod schema (T25) + RPC validation (T26 -- raises ERRCODE 22023
--      DETAIL 'cost_required' when either field is NULL on insert).
--
-- Handoff:
--   * T25 (next): zod -- extend createPoInput.lines[] with cost + costSource
--                  in packages/shared/src/schemas/logistics.ts; sync
--                  db-types.ts + domain.ts + adapters.ts.
--   * T26 (after T25): RPC -- extend logistics_create_po and
--                  logistics_create_pos_batch to validate non-NULL on insert
--                  and persist both columns per line.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. ENUM cost_source_enum -- 3 labels, ordered hand_entered < prev_po <
--    system_suggested per design spec §6.1.
-- -----------------------------------------------------------------------------
create type cost_source_enum as enum (
  'hand_entered',
  'prev_po',
  'system_suggested'
);


-- -----------------------------------------------------------------------------
-- 2. purchase_order_lines.cost + .cost_source -- both NULLABLE.
--    cost CHECK: non-negative when set; NULL allowed for legacy rows.
-- -----------------------------------------------------------------------------
alter table purchase_order_lines
  add column if not exists cost        numeric(14,2) check (cost is null or cost >= 0),
  add column if not exists cost_source cost_source_enum;
