-- =============================================================================
-- 0028_logistics_stage_v3.sql — Phase 4 v3-S3
-- =============================================================================
-- Source spec: docs/superpowers/specs/2026-05-04-phase-4-v3-spec.md §3.3
-- Sprint:      v3-S3 (schema migrations 0026-0031, data layer only)
-- Bug fixes:   Codex review 2026-05-04 — bare ALTER TYPE ADD VALUE is NOT
--              idempotent on re-run; use guard.
--
-- Why this migration:
--   v3 widens logistics_stage to support the Sofa SOP and renames the
--   current 'awaiting_stock' to a clearer 'awaiting_logistics_action' to
--   describe the column where logistics still has work to do (the old
--   name was misleading because rows could already have stock secured).
--
--   Two new values:
--     - 'awaiting_logistics_action' (renames awaiting_stock semantically;
--       BEFORE 'awaiting_stock' so it sits to the left in enum ordering)
--     - 'waiting' (Sofa-rejected sub-path: stock at own WH waiting for
--       customer's new delivery date; AFTER 'dispatched')
--
--   The original 'awaiting_stock' value LINGERS as a no-op alias because
--   Postgres cannot drop an enum value without recreating the type. New
--   code paths treat both as the same stage during the transition window.
--
-- Idempotency note (per 0023_logistics_stage_enum_extend.sql precedent):
--   ADD VALUE IF NOT EXISTS -- natively idempotent per Postgres 15+; matches
--   0023 precedent. Spec §3.3 showed a DO-block pg_enum guard which is also
--   valid but more verbose; the 0023 pattern wins for repo consistency.
--
-- Postgres caveat (echoed from 0023): ALTER TYPE ADD VALUE cannot run inside
--   an explicit transaction block. If the runner wraps statements in
--   BEGIN/COMMIT, run each ALTER TYPE statement individually outside a
--   transaction. Each statement here is idempotent so re-running is safe.
--
-- Final logistics_stage ordering after this migration:
--   placed,
--   proceed_request,
--   awaiting_logistics_action,        <- NEW (active value going forward)
--   awaiting_stock (alias, lingers),  <- still in enum, treated as alias
--   ready_to_dispatch,
--   dispatched,
--   waiting,                          <- NEW
--   delivered
-- =============================================================================

-- 1. Add 'awaiting_logistics_action' BEFORE 'awaiting_stock'.
alter type public.logistics_stage add value if not exists 'awaiting_logistics_action' before 'awaiting_stock';

-- 2. Add 'waiting' AFTER 'dispatched'.
alter type public.logistics_stage add value if not exists 'waiting' after 'dispatched';

-- 3. Data migration: rebrand any existing 'awaiting_stock' rows to the new
--    value. Old enum value stays in the type (Postgres can't drop without
--    recreating type); new code path treats both as the same stage during
--    transition. Safe at this point in the sprint because no FE/API code
--    has been updated yet to read either value -- v3-S4+ wires the new
--    value into the kanban.
update orders
   set logistics_stage = 'awaiting_logistics_action'
 where logistics_stage = 'awaiting_stock';
