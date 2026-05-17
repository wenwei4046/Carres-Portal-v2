-- 0123_rename_dl_to_so.sql
-- 2026-05-18 (Loo) — DL is just SO. Rename everywhere: DB schema column /
-- sequence / index / function arg / function body text / audit_log + history
-- text. Mirrors the 0121 logistics→operation pattern.
--
-- Scope (surveyed via pg_proc + information_schema):
--   columns:    orders.dl, purchase_orders.dl, purchase_orders.so_refs
--   sequence:   orders_dl_seq
--   indexes:    orders_dl_key (UNIQUE on orders.dl), po_dl_refs_idx (GIN)
--   functions:  22 in public schema touch dl / dl_refs / p_dl_refs / v_dl /
--               'DL-' / orders.dl. None are trigger functions and no
--               trigger references them (pg_trigger left-join confirms).
--   RLS:        0 policies reference dl (clean).
--   audit_log:  ref column has 'DL-####' string refs → backfilled to 'SO-'.
--   history:    order_history.text + po_history.text mention 'DL-' →
--               backfilled.
--
-- Loo authorised the rename + the destructive backfill UPDATEs in
-- conversation 2026-05-18 per CLAUDE.md §7 + §14 #1.
--
-- Historical migrations 0001-0122 still reference `dl` heavily — they are
-- frozen per §14 #6 and never replayed against a fresh DB after this point.
-- CLAUDE.md §17 history retains "DL" references for historical context
-- (matching the precedent set by the logistics→operation rename in 0121).
--
-- IMPLEMENTATION SHAPE — three-pass to dodge the
--   `cannot change name of input parameter` PG restriction on CREATE OR
--   REPLACE FUNCTION (PG won't let you rename input parameters without a
--   prior DROP):
--     PASS A — snapshot every affected function definition into a temp table
--     PASS B — DROP all of them, then ALTER tables, sequence, indexes
--     PASS C — recreate from snapshot, with text replacements


-- =============================================================================
-- PASS A — snapshot function definitions
-- =============================================================================
CREATE TEMP TABLE _dl_rename_snapshot AS
SELECT proname,
       pg_get_function_identity_arguments(oid) AS arg_sig,
       pg_get_functiondef(oid)                 AS body
  FROM pg_proc
 WHERE pronamespace = 'public'::regnamespace
   AND proname NOT LIKE 'pg_%'
   AND (
     position('dl_refs'         in pg_get_functiondef(oid)) > 0
     OR position('p_dl_refs'    in pg_get_functiondef(oid)) > 0
     OR position('p_dl '        in pg_get_functiondef(oid)) > 0
     OR position('p_dl,'        in pg_get_functiondef(oid)) > 0
     OR position('p_dl)'        in pg_get_functiondef(oid)) > 0
     OR position('orders_dl_seq' in pg_get_functiondef(oid)) > 0
     OR position('v_dl'         in pg_get_functiondef(oid)) > 0
     OR position('''DL-'        in pg_get_functiondef(oid)) > 0
     OR position('o.dl'         in pg_get_functiondef(oid)) > 0
     OR position('ord.dl'       in pg_get_functiondef(oid)) > 0
     OR position('v_order.dl'   in pg_get_functiondef(oid)) > 0
     OR position('orders.dl'    in pg_get_functiondef(oid)) > 0
   );


-- =============================================================================
-- PASS B — drop affected functions, rename structure
-- =============================================================================
DO $drop_block$
DECLARE r record;
BEGIN
  FOR r IN SELECT proname, arg_sig FROM _dl_rename_snapshot LOOP
    EXECUTE format('DROP FUNCTION public.%I(%s)', r.proname, r.arg_sig);
    RAISE NOTICE '0123 dropped public.%(%)', r.proname, r.arg_sig;
  END LOOP;
END
$drop_block$;

ALTER TABLE orders            RENAME COLUMN dl      TO so;
ALTER TABLE purchase_orders   RENAME COLUMN dl      TO so;
ALTER TABLE purchase_orders   RENAME COLUMN dl_refs TO so_refs;

ALTER SEQUENCE orders_dl_seq  RENAME TO orders_so_seq;

ALTER INDEX orders_dl_key     RENAME TO orders_so_key;
ALTER INDEX po_dl_refs_idx    RENAME TO po_so_refs_idx;


-- =============================================================================
-- PASS C — recreate each function from snapshot with text replacements.
--    Replacements ordered longest-first so the bare `dl` regex at the end
--    doesn't fragment compound tokens.
-- =============================================================================
DO $rebuild_block$
DECLARE
  r record;
  b text;
  fixed_count int := 0;
BEGIN
  FOR r IN SELECT proname, body FROM _dl_rename_snapshot LOOP
    b := r.body;

    -- Compound identifiers FIRST.
    b := replace(b, 'p_dl_refs',     'p_so_refs');
    b := replace(b, 'v_dl_refs',     'v_so_refs');
    b := replace(b, 'dl_refs',       'so_refs');
    b := replace(b, 'orders_dl_seq', 'orders_so_seq');
    b := replace(b, 'orders_dl_idx', 'orders_so_idx');
    b := replace(b, 'orders_dl_key', 'orders_so_key');
    b := replace(b, '''DL-',         '''SO-');

    -- Aliased column references.
    b := replace(b, 'v_order.dl',    'v_order.so');
    b := replace(b, 'orders.dl',     'orders.so');
    b := replace(b, 'ord.dl',        'ord.so');
    b := replace(b, 'o.dl',          'o.so');

    -- Local variables.
    b := replace(b, 'v_dl_text',     'v_so_text');
    b := replace(b, 'v_dl',          'v_so');

    -- Function arg-name positions.
    b := replace(b, 'p_dl ',         'p_so ');
    b := replace(b, 'p_dl,',         'p_so,');
    b := replace(b, 'p_dl)',         'p_so)');

    -- Bare `dl` as a column reference inside SQL:
    --   RETURNING id, dl, placed_at ...   |   INSERT INTO ... (..., dl, ...)
    --   RETURNS TABLE (..., dl integer, ...)
    b := regexp_replace(b, 'returning(\s+)dl(\s*[,\);]|\s+into)', 'returning\1so\2', 'gi');
    b := regexp_replace(b, '(,\s*)dl(\s*[,\);])',                  '\1so\2', 'g');
    b := regexp_replace(b, '(\(\s*)dl(\s*[,\)])',                  '\1so\2', 'g');
    b := regexp_replace(b, '\bdl(\s+(integer|int|int4|bigint))',   'so\1',   'g');

    BEGIN
      EXECUTE b;
      fixed_count := fixed_count + 1;
      RAISE NOTICE '0123 recreated %', r.proname;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '0123 FAILED on % — %', r.proname, SQLERRM;
      RAISE;
    END;
  END LOOP;

  RAISE NOTICE '0123 PASS C done — % function(s) recreated', fixed_count;
END
$rebuild_block$;


-- =============================================================================
-- HISTORY / AUDIT TEXT BACKFILL
-- =============================================================================
UPDATE audit_log
   SET ref    = replace(ref,    'DL-', 'SO-'),
       action = replace(action, 'DL-', 'SO-')
 WHERE ref LIKE 'DL-%' OR action LIKE '%DL-%';

UPDATE order_history
   SET text = replace(text, 'DL-', 'SO-')
 WHERE text LIKE '%DL-%';

UPDATE po_history
   SET text = replace(text, 'DL-', 'SO-')
 WHERE text LIKE '%DL-%';
