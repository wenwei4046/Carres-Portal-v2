-- ============================================================================
-- THE REMAINDER OF A DEMAND CAN BE CANCELLED             Loo ruling 2026-08-04
-- ============================================================================
--
-- ⚠ HOW TO APPLY
--   1. Number read from the TRACKER TAIL, never from `ls` (rule 17), and then
--      taken as the MAX of three measurements because the tracker alone is a
--      trap — 0318 and 0319 are APPLIED and ABSENT from it (both were run
--      through the SQL editor rather than the mechanism). Measured 2026-08-04:
--      tracker tail `20260804033145 · 0320` · repository tail `0320` · every
--      branch's tail `0320` → this file is 0321.
--   2. Paste the whole file into the Supabase SQL editor and run it once.
--      Idempotent; the sanity block aborts everything if anything is off.
--   3. Run the VERIFY queries at the bottom.
--   4. Only THEN does the application code deploy.
--
-- THE RULING THIS IMPLEMENTS (Loo, 2026-08-04, card P12 — final, not re-asked):
--
--   "A demand that has already been part-ordered CAN have its remainder
--    cancelled. The 3 already ordered are the purchase order's problem."
--
-- 0320 left this question open BY NAME rather than deciding it quietly:
--
--   "Once P10 can satisfy part of a demand from stock, 'may the operator cancel
--    the REMAINDER of a demand that was partly ordered?' becomes a real
--    business question with two defensible answers, and it is Loo's, not this
--    migration's."
--
-- It is answered. *"Ordered 3, don't want the other 2"* is an ordinary day, and
-- stopping the 3 runs through `PURCHASING-WORKING-FLOW.md` §9 — cancelling the
-- whole purchase order — not through this door. Without this a part-ordered
-- demand can only ever GROW: it is a queue with no way out.
--
-- ONE LINE OF GATE CHANGES, AND IT IS THE WHOLE CARD.
--
--   before   po_id is not null            -> refuse `already_ordered`
--   after    remaining_qty <= 0           -> refuse `nothing_to_cancel`
--
-- The old gate asked *has anything been ordered?* The new one asks *is there
-- anything left to cancel?* — which is the question the operator is actually
-- answering, and the one 0320 made askable by generating `remaining_qty`.
--
-- NOTHING ELSE MOVES, AND EACH OMISSION IS A DECISION.
--
-- · `issued_qty` IS NOT TOUCHED. Its meaning is *units that have stopped being
--   something to buy BECAUSE SOMETHING TOOK THEM* — a purchase order, a ready
--   stock draw. Setting it to `qty` on a cancel would make the row say five
--   units were procured when three were, and it would break the card's own
--   "❌ let a cancel touch the issued quantity or the PO".
--
-- · NO CANCELLED-QUANTITY COLUMN, and none is needed: nothing may move
--   `issued_qty` after a cancel (the issue door refuses a cancelled demand),
--   so `remaining_qty` FREEZES at the moment of cancelling and IS the record of
--   how much was cancelled. A stored second copy of a number that is already
--   generated is the disease this table was built to avoid.
--
-- · NOBODY TYPES A QUANTITY. A cancel is whole-remainder or it is not a cancel;
--   a typed number is a number somebody can get wrong, and the partial case it
--   would serve is *reduce the demand*, which is a different act nobody asked
--   for.
--
-- · THE ROW LEAVES THE WORKSPACE BY ITSELF and needs no help doing it:
--   `purchase_demands_open_idx`, the api read and the grid all key on
--   `remaining_qty > 0 AND cancelled_at is null`, and the cancel sets the
--   second half. It stays fully readable — the reason, the quantity that was
--   cancelled and the purchase order that took the rest are all still on it.
--
-- · A REASON STAYS MANDATORY, in both places it already was: the function
--   refuses a blank one by name, and `purchase_demands_cancel_pair` refuses the
--   pair at the table. Neither is weakened here.
--
-- CANCEL IS NOT DELETE — and this migration ADDS AN ASSERTION rather than a
-- feature (Loo, 2026-08-04, naming AutoCount's real weakness: *"backend dont
-- know how can delete due to when testing"*). There is no delete function, no
-- delete policy and no delete grant on this table, and the sanity block below
-- proves all three every time it runs. Test rubbish is cleaned by SQL on
-- request and the database starts clean at go-live, so no feature is owed. A
-- delete built for testing survives into production as a way to erase a real
-- purchase record leaving no trace — C1's own lesson: *a live route with no
-- caller is a bypass one curl away.*
--
-- NO BACKFILL AND NOTHING TO BACKFILL: the one live demand (SONIC-S, qty 5,
-- issued 0, never cancelled) is untouched by a gate change.
-- ============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1 · The gate
--
-- `create or replace`, so the grants and the single signature both survive
-- untouched — a `drop` + `create` here would silently re-open the function to
-- whatever the default privileges are, which is the fault the 0312/0313 rebuild
-- found by replaying rather than by reading.
-- ---------------------------------------------------------------------------
create or replace function public.purchasing_cancel_demand(
  p_id     uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role;
  v_d    purchase_demands;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if btrim(coalesce(p_reason,'')) = '' then
    raise exception 'a reason is required' using errcode = '22023', detail = 'reason_required';
  end if;

  -- FOR UPDATE, so a cancel and an issue arriving in the same second queue
  -- rather than both reading a remainder that the other is about to spend.
  select * into v_d from purchase_demands where id = p_id for update;
  if not found then
    raise exception 'demand not found' using errcode = '42P01', detail = 'not_found';
  end if;
  if v_d.cancelled_at is not null then
    raise exception 'already cancelled' using errcode = 'P0001', detail = 'already_cancelled';
  end if;
  -- THE RELAXED GATE (Loo, 2026-08-04). It no longer asks whether a purchase
  -- order exists — a part-ordered demand is the case this card was written for.
  -- It asks whether there is a REMAINDER, because that is what a cancel takes.
  -- A demand whose every unit has already been ordered or drawn from stock has
  -- nothing left to cancel, and the refusal says so rather than writing a
  -- cancellation that changes nothing.
  if v_d.remaining_qty <= 0 then
    raise exception 'demand % has nothing left to cancel', p_id
      using errcode = 'P0001', detail = 'nothing_to_cancel';
  end if;

  -- `issued_qty` and `po_id` are deliberately absent from this SET. What was
  -- ordered stays ordered and keeps its link; stopping it is the purchase
  -- order's own business (flow §9).
  update purchase_demands
     set cancelled_at = now(), cancel_reason = btrim(p_reason)
   where id = p_id;

  -- `cancelled` is the remainder that this act cancelled. It is read back from
  -- the row rather than computed here, so the number the caller is told is the
  -- number the record now holds.
  select * into v_d from purchase_demands where id = p_id;
  return jsonb_build_object(
    'id',        p_id,
    'cancelled', v_d.remaining_qty,
    'issued',    v_d.issued_qty
  );
end;
$fn$;

comment on column public.purchase_demands.cancelled_at is
  'When the REMAINDER of this demand was cancelled (Loo, 2026-08-04, card P12). A part-ordered demand may be cancelled: what was already ordered keeps its purchase order and its issued_qty, and only what was still to buy stops being work. Because nothing may move issued_qty after this is set, remaining_qty freezes here and IS the quantity that was cancelled — there is no second column holding it. Never deleted: "we decided not to" is a business fact and a missing row cannot say it.';

-- ---------------------------------------------------------------------------
-- 2 · Sanity — aborts the migration rather than shipping a lie
--
-- NOTHING IN THIS BLOCK WRITES A ROW (0319/0320's own discipline). Every
-- assertion reads the CATALOGUE, so the proof costs nothing and depends on no
-- rollback. The ARITHMETIC is proved separately in a rolled-back transaction
-- against production, because proving it here would mean writing a probe row
-- into a live table.
-- ---------------------------------------------------------------------------
do $$
declare v_n int; v_src text;
begin
  select prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'purchasing_cancel_demand';
  if v_src is null then
    raise exception 'SANITY: purchasing_cancel_demand is missing';
  end if;

  -- The old gate is GONE. Left in place, a part-ordered demand still refuses.
  if v_src like '%already_ordered%' then
    raise exception 'SANITY: purchasing_cancel_demand still refuses a demand that has a purchase order';
  end if;
  -- ...and the new one is present, so "relaxed" cannot mean "ungated".
  if v_src not like '%nothing_to_cancel%' then
    raise exception 'SANITY: purchasing_cancel_demand has no remainder gate';
  end if;
  -- A reason is still mandatory. Relaxing one gate may never relax another.
  if v_src not like '%reason_required%' then
    raise exception 'SANITY: purchasing_cancel_demand stopped requiring a reason';
  end if;
  -- The cancel may never touch what was already taken.
  if v_src ~* 'set[^;]*issued_qty' or v_src ~* 'set[^;]*po_id' then
    raise exception 'SANITY: purchasing_cancel_demand writes issued_qty or po_id';
  end if;

  -- Exactly ONE signature. A second overload is guardrail #8's own lesson.
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'purchasing_cancel_demand';
  if v_n <> 1 then raise exception 'SANITY: % copies of purchasing_cancel_demand', v_n; end if;

  -- Not callable by anon, in both directions or it proves nothing.
  if has_function_privilege('anon', 'public.purchasing_cancel_demand(uuid,text)', 'execute') then
    raise exception 'SANITY: purchasing_cancel_demand is executable by anon';
  end if;
  if not has_function_privilege('authenticated', 'public.purchasing_cancel_demand(uuid,text)', 'execute') then
    raise exception 'SANITY: purchasing_cancel_demand is not executable by authenticated';
  end if;

  -- ── CANCEL IS NOT DELETE. Three separate proofs, because a delete could
  --    arrive by three separate doors and the card says to ASSERT it. ───────
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'purchase_demands'
     and cmd in ('DELETE','ALL');
  if v_n <> 0 then
    raise exception 'SANITY: % delete policy(ies) on purchase_demands', v_n;
  end if;

  select count(*) into v_n from information_schema.table_privileges
   where table_schema = 'public' and table_name = 'purchase_demands'
     and privilege_type = 'DELETE'
     and grantee in ('anon','authenticated','public');
  if v_n <> 0 then
    raise exception 'SANITY: % DELETE grant(s) on purchase_demands', v_n;
  end if;

  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosrc ~* 'delete[[:space:]]+from[[:space:]]+(public\.)?purchase_demands';
  if v_n <> 0 then
    raise exception 'SANITY: % function(s) delete from purchase_demands', v_n;
  end if;

  -- STILL no write policy at all: the three DEFINER doors remain the only way
  -- in, so nothing above can be walked around by PostgREST.
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'purchase_demands' and cmd <> 'SELECT';
  if v_n <> 0 then raise exception 'SANITY: % write policy(ies) on purchase_demands', v_n; end if;

  raise notice 'SANITY OK — the gate reads the remainder, a reason is still required, issued/po untouched, one door, anon locked out, and NO delete path exists (no policy, no grant, no function).';
end $$;

-- ============================================================================
-- VERIFY — run after, check every line, before any deploy
-- ============================================================================
-- a) select prosrc like '%nothing_to_cancel%' as has_new_gate,
--           prosrc like '%already_ordered%'   as has_old_gate
--      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public' and p.proname = 'purchasing_cancel_demand';
--    -- expect has_new_gate = true, has_old_gate = false
-- b) select cmd, policyname from pg_policies where tablename = 'purchase_demands';
--    -- expect SELECT only, unchanged
-- c) select grantee, privilege_type from information_schema.table_privileges
--     where table_name = 'purchase_demands' and grantee in ('anon','authenticated');
--    -- expect SELECT only for authenticated, nothing for anon
-- d) select has_function_privilege('anon','public.purchasing_cancel_demand(uuid,text)','execute') as anon,
--           has_function_privilege('authenticated','public.purchasing_cancel_demand(uuid,text)','execute') as auth;
--    -- expect anon = false, auth = true
-- e) select id, qty, issued_qty, remaining_qty, cancelled_at, cancel_reason
--      from purchase_demands;
--    -- expect the live rows unchanged by this migration
-- ============================================================================
