-- =============================================================================
-- 0211_backfill_carres_remark_to_annotations.sql
-- Option 1 (Jess 2026-07-11): retire the single-field `ops_order_control.carres_remark`
-- from the order panel. All hand-written per-order follow-up now lives in ONE
-- place — the Activity & notes timeline (`order_annotations`) — which stacks
-- entries with author + timestamp + tag instead of overwriting one box.
--
-- WHAT THIS DOES: a one-time, idempotent backfill that converts each order's
-- existing `carres_remark` text into the FIRST timeline note, so nothing Jess
-- typed in the Master sheet is lost when the field leaves the UI.
--
-- WHAT THIS DELIBERATELY DOES NOT DO:
--   • It does NOT drop the `carres_remark` column — the column is KEPT dormant
--     (many API select strings reference it; 0159 is a committed migration).
--     This keeps the change purely ADDITIVE and fully REVERSIBLE (to undo:
--     DELETE FROM order_annotations WHERE content LIKE 'Carres Remark (imported): %').
--   • It touches no other table, no RLS, no function. Additive only.
--
-- CHOICES:
--   • Author = the seeded "Operations" system user (22222222-…-002, the same
--     actor AutoCount imports use) → the timeline shows "Operations" as author,
--     honestly marking these as imported ops data (not a fabricated person).
--   • created_at = the order's `placed_at` so each note sits at the right point
--     in that order's history, not "now".
--   • content is prefixed "Carres Remark (imported): " and hard-capped at 2000
--     chars to satisfy the order_annotations length CHECK (real remarks are short
--     one-liners like "AL pickup bedf at Hookka", so no truncation in practice).
--
-- IDEMPOTENT: the NOT EXISTS guard keys on the exact imported content, so a
-- second run inserts nothing.
--
-- Expected: 25 rows (ops_order_control with a non-empty carres_remark, prod 2026-07-11).
-- =============================================================================

INSERT INTO order_annotations (order_id, content, tag, created_by, created_at)
SELECT
  c.order_id,
  left('Carres Remark (imported): ' || btrim(c.carres_remark), 2000),
  NULL,
  '22222222-2222-2222-2222-000000000002'::uuid,
  COALESCE(o.placed_at, now())
FROM ops_order_control c
JOIN orders o ON o.id = c.order_id
WHERE nullif(btrim(c.carres_remark), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM order_annotations a
    WHERE a.order_id = c.order_id
      AND a.content = left('Carres Remark (imported): ' || btrim(c.carres_remark), 2000)
  );

-- ─── sanity ──────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_imported int;
  v_source   int;
BEGIN
  SELECT count(*) INTO v_imported FROM order_annotations
    WHERE content LIKE 'Carres Remark (imported): %';
  SELECT count(*) INTO v_source FROM ops_order_control
    WHERE nullif(btrim(carres_remark), '') IS NOT NULL;
  RAISE NOTICE '0211 backfill: % source carres_remark → % imported notes present',
    v_source, v_imported;
END $$;
