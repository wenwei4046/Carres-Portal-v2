-- 0126_close_remaining_dl_rename_gaps.sql
-- 2026-05-18 (Loo "do now") — close ALL residual 0123 dl→so rename gaps.
--
-- BACKGROUND
--   Cross-check sweep after 0125 (which fixed `p.dl` + `ot.dl` +
--   `v_target_order.dl`) uncovered 17 more functions still referencing
--   standalone `dl` token. 0123's snapshot+text-replace pipeline had two
--   blind spots:
--     (a) alias-form `<other-alias>.dl` (covered partial by 0125; rest here)
--     (b) `'dl'` JSON literal keys in jsonb_build_object output
--     (c) `NEW.dl` / `OLD.dl` references inside trigger functions
--     (d) bare `dl` column refs in WHERE/SELECT/UPDATE/RETURNS clauses
--         where 0123's positional regex didn't match
--     (e) `RETURNS TABLE(... dl integer, ...)` signature column names
--
-- SCOPE — 17 functions (categorized by impact):
--
--   Category A — RUNTIME 500 once called on a real row (11 functions):
--     1. orders_auto_issue_on_dispatched (TRIGGER on orders BEFORE UPDATE)
--        NEW.dl ×3 → catastrophic on first dispatch
--     2. enforce_partner_po_column_whitelist (TRIGGER on purchase_orders)
--        NEW.dl IS DISTINCT FROM OLD.dl → partner can't UPDATE POs
--     3. approval_decide                              where dl::text =
--     4. invoice_issue                                select dl from orders
--     5. finance_record_receipt                       select dl, dealer_id
--     6. finance_apply_credit_note                    select dl into v_target_dl
--     7. operation_create_po                          update set dl = p_so
--     8. operation_cancel_po                          where dl = v_po.so
--     9. operation_issue_pos_for_order                where (dl = v_order.so OR ...)
--    10. operation_warehouse_pick                     where (dl = v_order.so OR ...)
--    11. operation_revert_order_dispatched_to_ready   select dl into v_so
--
--   Category B — silent JSON contract mismatch (FE reads .so but backend
--                returns key 'dl'; result = undefined in UI) (6 functions):
--    12. create_order                                 'dl', v_so
--    13. proceed_order                                'dl', v_order.so
--    14. operation_abandon_order                      'dl', v_order.so
--    15. operation_assign_partner                     'dl', v_order.so
--    16. operation_attach_do_and_deliver              'dl', v_order.so
--    17. operation_revert_order_proceed_to_placed     'dl', v_order.so
--
--   Category C — RETURNS TABLE signature column-name rename (2 functions,
--                requires DROP + CREATE since PG forbids changing return
--                type via CREATE OR REPLACE):
--    18. partner_orders_for_threads    RETURNS TABLE(id uuid, dl integer, ...)
--    19. supplier_orders_for_threads   RETURNS TABLE(id uuid, dl integer, ...)
--
--   Note: some Cat A functions also have Cat B JSON keys; both fixed in
--   one regex pass.
--
-- APPROACH
--   PASS A — snapshot every public function whose body still contains
--            standalone `dl` token (regex `(?<![a-z_])dl(?![a-z_])`).
--   PASS B + C — for each: if RETURNS TABLE has `dl` column, DROP first;
--                else CREATE OR REPLACE. Body rewritten with single regex
--                pass converting standalone `dl` token → `so`.
--   PASS D — sanity check. Post-recreate scan must return zero; otherwise
--            RAISE EXCEPTION rolls back the whole migration.
--
-- The regex deliberately preserves:
--   * `'DL-'` capital-letter literals (kept by 0123 as historical record)
--   * `v_target_dl` local variable names (`_` before `dl` → no match)
--   * `dl_refs` / `dl_seq` / etc. compounds (`_` after `dl` → no match)
--     [Already renamed by 0123, but harmless to be defensive.]
--
-- Loo authorised in conversation 2026-05-18 ("do now") per CLAUDE.md
-- §14 #1 single-instance approval and §7 schema-change protocol.


-- =============================================================================
-- PASS A — snapshot every function body still containing standalone `dl`
-- =============================================================================
CREATE TEMP TABLE _dl_residual_snapshot AS
SELECT proname,
       pg_get_function_identity_arguments(oid) AS arg_sig,
       pg_get_functiondef(oid)                 AS body
  FROM pg_proc
 WHERE pronamespace = 'public'::regnamespace
   AND proname NOT LIKE 'pg_%'
   AND prokind = 'f'
   AND pg_get_functiondef(oid) ~ '(?<![a-z_])dl(?![a-z_])';

DO $intro$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM _dl_residual_snapshot;
  RAISE NOTICE '0126 PASS A — snapshotted % function(s) with residual dl token', n;
END
$intro$;


-- =============================================================================
-- PASS B + C — DROP signature-changers, recreate with `dl` token rewritten
-- =============================================================================
DO $rebuild$
DECLARE
  r record;
  b text;
  needs_drop boolean;
  recreated_count int := 0;
  dropped_count   int := 0;
BEGIN
  FOR r IN SELECT * FROM _dl_residual_snapshot ORDER BY proname LOOP
    -- A signature change is when RETURNS TABLE(...) has a `dl` column.
    -- Match RETURNS TABLE followed by parens with bare `dl` + type identifier
    -- inside. NB: PG's ARE regex treats `\b` as backspace (not word boundary)
    -- — must use lookbehind `(?<![a-z_])` to scope to standalone `dl`.
    needs_drop := r.body ~ 'RETURNS TABLE\s*\([^)]*(?<![a-z_])dl\s+(integer|int|bigint|text|uuid|date|timestamp|numeric)';

    IF needs_drop THEN
      EXECUTE format('DROP FUNCTION public.%I(%s)', r.proname, r.arg_sig);
      dropped_count := dropped_count + 1;
      RAISE NOTICE '0126 dropped (RETURNS TABLE rename) public.%(%)',
        r.proname, r.arg_sig;
    END IF;

    -- Single regex: standalone lowercase `dl` token → `so`.
    --   (?<![a-z_]) — char before `dl` is NOT [a-z_]
    --   (?![a-z_])  — char after  `dl` is NOT [a-z_]
    -- This catches:
    --   `p.dl` `ot.dl` `o.dl` etc. (any alias)
    --   `NEW.dl` / `OLD.dl`
    --   `'dl'` (JSON key)
    --   bare `dl` in WHERE / SELECT / UPDATE SET / RETURNS TABLE
    -- And leaves untouched:
    --   `'DL-'` (uppercase) — historical record per 0123 stance
    --   `v_target_dl` (`_` before) — local var names
    --   `dl_refs`/`dl_seq`/etc. (`_` after) — already renamed by 0123
    b := regexp_replace(r.body, '(?<![a-z_])dl(?![a-z_])', 'so', 'g');

    BEGIN
      EXECUTE b;
      recreated_count := recreated_count + 1;
      RAISE NOTICE '0126 recreated %', r.proname;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '0126 FAILED on % — %', r.proname, SQLERRM;
      RAISE;
    END;
  END LOOP;

  RAISE NOTICE '0126 PASS B+C — % dropped, % recreated',
    dropped_count, recreated_count;
END
$rebuild$;


-- =============================================================================
-- PASS D — sanity check (assert zero functions still reference standalone dl)
-- =============================================================================
DO $sanity$
DECLARE leftover_count int;
BEGIN
  SELECT count(*) INTO leftover_count
    FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname NOT LIKE 'pg_%'
     AND prokind = 'f'
     AND pg_get_functiondef(oid) ~ '(?<![a-z_])dl(?![a-z_])';

  IF leftover_count > 0 THEN
    RAISE EXCEPTION '0126 sanity check FAILED — % function(s) still contain standalone dl',
      leftover_count;
  END IF;
  RAISE NOTICE '0126 sanity check OK — no public function references standalone dl';
END
$sanity$;
