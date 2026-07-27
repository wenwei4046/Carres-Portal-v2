-- =====================================================================
-- 0294 — Ready Stock K4, second half: the OTHER door out of the pool
-- =====================================================================
-- Card: docs/ready-stock-execution-queue.md § K4 — "taking a ready-stock unit
-- records WHY".
--
-- WHAT THIS FIXES, FOUND AFTER 0292 SHIPPED THE TWO RESERVE DOORS
--   The Stock → On hand grid offers `Takeout` on a **free** row, not only on a
--   reserved one (OpsStockListView gates it on `status in (free, reserved)`).
--   So a unit could still leave the ready pool — marked sold, a stock movement
--   written — with nothing recorded about why. Filing that as a carry-forward
--   and leaving the door open would look disciplined and behave like a trap
--   (the 2026-07-26 lesson from the care-plan merge): the whole point of the
--   locked reason list is that the monthly split can be read as an answer, and
--   a silent door makes it an under-count nobody can see.
--
-- THE RULE
--   • unit was FREE     → this IS a pool draw. A reason is REQUIRED, and one
--                         ops_stock_pool_usage row is written in the same
--                         transaction as the flip.
--   • unit was RESERVED → NOT a second draw. It was recorded when it was
--                         reserved (0292); writing it again would double-count
--                         the month. Any reason passed is ignored on purpose.
--
-- WHY DROP-AND-CREATE RATHER THAN A SECOND OVERLOAD
--   Adding defaulted parameters creates a NEW signature, leaving the old
--   one-argument function in place — and PostgREST would then have two
--   candidates for the same call. The old signature is dropped explicitly and
--   the sanity block asserts exactly ONE ops_stock_takeout survives (the ghost
--   overload check 0290 introduced). Verified before writing this: nothing in
--   the database calls ops_stock_takeout, and exactly one route does.
--
-- EVERYTHING ELSE IS BYTE-IDENTICAL to the 0139 body — same status guard, same
-- stock_movements insert, same rollup call, same audit + activity rows. This
-- migration adds a reason; it does not redesign takeout.
--
-- Tail re-checked immediately before apply (guardrail #8). It fired TWICE on
-- this card: 0291 went to supplier claims and 0293 to service-case follow-ups
-- while these drafts were being dry-run, so 0292 and 0294 are what shipped.
-- Dry-run: full body + 10 behaviour assertions in a rolled-back transaction on
-- live prod.
-- =====================================================================

drop function if exists public.ops_stock_takeout(uuid);

create or replace function public.ops_stock_takeout(
  p_item_id uuid,
  p_reason  text default null,
  p_note    text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_role app_role;
  v_id   uuid;
  v_sku  text;
  v_wh   uuid;
  v_ref  text;
  v_qty  int;
  v_was  text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  v_role := public.app_role();
  IF v_role NOT IN ('operation','principal') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Read the state BEFORE the flip, and hold the row: whether this is a pool
  -- draw depends on what the unit was, and the answer must not change between
  -- the question and the update.
  SELECT status INTO v_was FROM ops_stock_items WHERE id = p_item_id FOR UPDATE;

  IF v_was = 'free' THEN
    IF p_reason IS NULL OR p_reason NOT IN (
         'sales_urgent','supplier_delay','warranty_exchange','vip','other') THEN
      RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023',
        detail = 'taking a free unit draws on ready stock — say why';
    END IF;
    IF p_reason = 'other' AND v_note IS NULL THEN
      RAISE EXCEPTION 'reason_needs_words' USING ERRCODE = '22023',
        detail = 'say what the reason is when you pick Other';
    END IF;
  END IF;

  UPDATE ops_stock_items
     SET status     = 'sold',
         updated_at = now()
   WHERE id     = p_item_id
     AND status IN ('free','reserved')
   RETURNING id, sku, warehouse_id, reserved_ref, coalesce(qty, 1)
        INTO v_id, v_sku, v_wh, v_ref, v_qty;

  IF v_id IS NOT NULL THEN
    -- Only a FREE unit is a draw on the pool. A reserved one already has its
    -- row from ops_stock_pool_draw; a second row would inflate the month.
    IF v_was = 'free' THEN
      INSERT INTO ops_stock_pool_usage (item_id, sku, qty, reason, note, ref, taken_by)
      VALUES (v_id, v_sku, v_qty, p_reason, v_note, v_ref, auth.uid());
    END IF;

    INSERT INTO stock_movements (sku, warehouse_id, kind, qty, ref)
    VALUES (v_sku, v_wh, 'out', 1, COALESCE(v_ref, 'ops_stock.takeout'));

    PERFORM public.ops_rollup_stock_balances(v_wh);

    INSERT INTO audit_log (role, action, ref)
    VALUES (v_role, 'ops_stock.takeout', v_ref);

    INSERT INTO ops_activity_log (order_id, action, actor_id, detail)
    VALUES (
      public._activity_log_order_id_from_ref(v_ref),
      'stock_takeout',
      auth.uid(),
      jsonb_build_object('sku', v_sku, 'item_id', v_id, 'ref', v_ref)
    );
  END IF;
  RETURN v_id;
END;
$function$;

revoke all on function public.ops_stock_takeout(uuid, text, text) from public, anon;
grant execute on function public.ops_stock_takeout(uuid, text, text) to authenticated;

do $sanity$
declare
  v_overloads int;
  v_anon      boolean;
  v_auth      boolean;
begin
  -- Exactly ONE takeout function: the old single-argument signature must be
  -- gone, or PostgREST has two candidates and the gate above is optional.
  select count(*) into v_overloads
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ops_stock_takeout';
  if v_overloads <> 1 then
    raise exception 'SANITY: expected exactly 1 ops_stock_takeout, found %', v_overloads;
  end if;

  select has_function_privilege('anon',
           'public.ops_stock_takeout(uuid, text, text)', 'execute') into v_anon;
  select has_function_privilege('authenticated',
           'public.ops_stock_takeout(uuid, text, text)', 'execute') into v_auth;
  if v_anon then
    raise exception 'SANITY: anon can execute ops_stock_takeout';
  end if;
  if not v_auth then
    raise exception 'SANITY: authenticated cannot execute ops_stock_takeout';
  end if;

  raise notice 'K4b sanity OK: overloads=1 anon=false auth=true';
end;
$sanity$;
