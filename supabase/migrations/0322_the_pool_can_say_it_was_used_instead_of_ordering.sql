-- =====================================================================
-- 0322 — P13②: K4's reason list gains a SIXTH word
-- =====================================================================
-- Card: docs/purchasing-execution-queue.md § P13 — "the take path says what it
-- means — one button word, one reason word". LOO RULED IT, 2026-08-04.
--
-- WHY
--   K4 (0292) exists to answer 为什么一直缺货, and it does that by making every
--   draw off the free pool name its reason from a locked list of five:
--
--     sales_urgent · supplier_delay · warranty_exchange · vip · other
--
--   P10 (2026-08-04) opened a SIXTH way for a unit to leave that pool — the To
--   Order take: *"we had it on the shelf, so we did not raise a purchase
--   order."* Not one of the five describes it, so P10 recorded every one of
--   them as `other` with a note. That was right of that chat — inventing a
--   word for a locked vocabulary is a business ruling, not a routine fix — and
--   it is not right to LEAVE, because a monthly split whose biggest slice
--   reads `Other` cannot answer the question the ledger was built for.
--
-- WHAT CHANGES, AND WHAT DELIBERATELY DOES NOT
--   • The CHECK on ops_stock_pool_usage.reason goes from five values to six.
--   • The two RPCs that validate the same list in their own bodies —
--     ops_stock_pool_draw (0292) and ops_stock_takeout (0294) — take the same
--     sixth value. If only the CHECK were widened, the doors would still
--     refuse it and the constant, the picker and the database would disagree.
--   • THE FIVE EXISTING WORDS ARE BYTE-IDENTICAL in all three places, in the
--     same order. The sixth is APPENDED. P13's Must-NOT forbids renaming or
--     re-ordering them, and the array in packages/shared/src/pool-usage.ts is
--     also the DISPLAY order — so `other` keeps its position and the catch-all
--     is simply no longer last.
--   • NO BACKFILL. The `other` rows P10 already wrote are the honest record of
--     what the system could say at the time. There is no UPDATE in this file.
--   • The `other`-needs-a-note rule is untouched, in the CHECK and in both
--     function bodies. The new reason needs no note: it says its own sentence.
--
-- EVERYTHING ELSE IN BOTH FUNCTION BODIES IS REPRODUCED VERBATIM from the live
-- definitions (read with pg_get_functiondef before writing this file, and
-- reconciled by md5(prosrc) after applying). One list is longer by one string;
-- nothing else moves.
--
-- Number: tracker tail 0321 · repository tail 0321 · every branch's tail 0321
-- → 0322 (rule 17 in its widened form — the MAX of all three, because 0318 and
-- 0319 are applied and absent from the tracker).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The CHECK
-- ---------------------------------------------------------------------
alter table public.ops_stock_pool_usage
  drop constraint if exists ops_stock_pool_usage_reason_check;

alter table public.ops_stock_pool_usage
  add constraint ops_stock_pool_usage_reason_check
  check (reason in (
    'sales_urgent','supplier_delay','warranty_exchange',
    'vip','other','used_instead_of_ordering'));

comment on column public.ops_stock_pool_usage.reason is
  'Why the unit left the free pool. K4''s five (0292) plus P13''s sixth (0322, Loo 2026-08-04): `used_instead_of_ordering` = To Order found it on the shelf and raised no purchase order. Mirrored by POOL_USE_REASONS in packages/shared/src/pool-usage.ts.';

-- ---------------------------------------------------------------------
-- 2. The draw door (0292) — one string longer, nothing else
-- ---------------------------------------------------------------------
create or replace function public.ops_stock_pool_draw(
  p_ref       text,
  p_reason    text,
  p_note      text default null,
  p_item_id   uuid default null,
  p_sku       text default null,
  p_condition text default null,
  p_wh        uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := (select public.app_role());
  v_ref  text := nullif(btrim(coalesce(p_ref, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_sku  text := nullif(btrim(coalesce(p_sku, '')), '');
  v_wh   uuid := p_wh;
  v_id   uuid;
  v_qty  int;
  v_item_sku text;
begin
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden' using errcode = '42501',
      detail = 'the stock register is an operation surface';
  end if;
  if v_ref is null then
    raise exception 'ref_required' using errcode = '22023',
      detail = 'a drawn unit is committed to something — say what';
  end if;
  -- P13 (0322): the sixth reason is APPENDED. The five before it are the same
  -- five strings in the same order — the list a chat is most likely to "tidy".
  if p_reason is null or p_reason not in (
       'sales_urgent','supplier_delay','warranty_exchange','vip','other',
       'used_instead_of_ordering') then
    raise exception 'bad_reason' using errcode = '22023';
  end if;
  if p_reason = 'other' and v_note is null then
    raise exception 'reason_needs_words' using errcode = '22023',
      detail = 'say what the reason is when you pick Other';
  end if;
  if p_item_id is null and v_sku is null then
    raise exception 'item_or_sku_required' using errcode = '22023';
  end if;

  if p_item_id is not null then
    -- The operator picked this exact physical unit. Claim it only if it is
    -- genuinely still free — a unit somebody else grabbed a second ago must
    -- read as a conflict, never as a silent no-op.
    update ops_stock_items
       set status       = 'reserved',
           reserved_ref = v_ref,
           updated_at   = now()
     where id           = p_item_id
       and status       = 'free'
       and needs_repair = false
    returning id, sku, coalesce(qty, 1) into v_id, v_item_sku, v_qty;
  else
    if v_wh is null then
      select id into v_wh from warehouses where name ilike '%klang%' limit 1;
    end if;
    if v_wh is null then
      raise exception 'warehouse_not_found' using errcode = '22023';
    end if;

    -- Oldest first (FIFO), skipping anything another session is holding — the
    -- pick rule ops_stock_reserve has used since 0137, unchanged.
    update ops_stock_items
       set status       = 'reserved',
           reserved_ref = v_ref,
           updated_at   = now()
     where id = (
       select id from ops_stock_items
        where sku          = v_sku
          and warehouse_id = v_wh
          and status       = 'free'
          and needs_repair = false
          and (p_condition is null or condition = p_condition)
        order by date_in asc nulls last, created_at asc
        limit 1
        for update skip locked
     )
    returning id, sku, coalesce(qty, 1) into v_id, v_item_sku, v_qty;
  end if;

  -- Nothing free matched. The routes turn this into 404/409; there is
  -- deliberately no ledger row, because nothing left the pool.
  if v_id is null then
    return null;
  end if;

  insert into ops_stock_pool_usage (item_id, sku, qty, reason, note, ref, taken_by)
  values (v_id, v_item_sku, v_qty, p_reason, v_note, v_ref, auth.uid());

  -- audit_log.role is the app_role ENUM, not text (0286 caught this the hard
  -- way: without the cast EVERY successful write raises 42804).
  insert into audit_log (role, actor_text, action, ref)
  values (v_role::public.app_role,
          (select name from app_users where id = auth.uid()),
          format('Ready stock taken · %s x%s · %s', v_item_sku, v_qty, p_reason),
          v_ref);

  -- The order's own timeline. `ops_stock_reserve` has written this since 0139;
  -- the drawer's picker never did, which is why a reserve made there left no
  -- trace on the order. One act, one trail — order_id is nullable, so a ref
  -- that names no order simply logs without one.
  insert into ops_activity_log (order_id, action, actor_id, detail)
  values (
    public._activity_log_order_id_from_ref(v_ref),
    'stock_reserve',
    auth.uid(),
    jsonb_build_object('sku', v_item_sku, 'ref', v_ref, 'item_id', v_id,
                       'qty', v_qty, 'reason', p_reason)
  );

  return v_id;
end;
$function$;

-- ---------------------------------------------------------------------
-- 3. The takeout door (0294) — the same one string, same reason
--
--    The reason vocabulary is ONE vocabulary. `POOL_USE_REASONS` feeds the
--    zod enum that guards BOTH routes and all three pickers, so a word the
--    dropdown offers and this door refuses would be exactly the disease
--    `poolDrawProblem` was written to prevent: a button that goes dark for a
--    different reason than the server refuses for.
-- ---------------------------------------------------------------------
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
    -- P13 (0322): the same six, in the same order, as ops_stock_pool_draw.
    IF p_reason IS NULL OR p_reason NOT IN (
         'sales_urgent','supplier_delay','warranty_exchange','vip','other',
         'used_instead_of_ordering') THEN
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

-- ---------------------------------------------------------------------
-- 4. Sanity — the six, the five that must not have moved, and the shape
-- ---------------------------------------------------------------------
do $sanity$
declare
  v_reasons   text;
  v_r         text;
  v_overloads int;
  v_write_pol int;
  v_draw_src  text;
  v_take_src  text;
begin
  select pg_get_constraintdef(oid) into v_reasons
    from pg_constraint
   where conrelid = 'public.ops_stock_pool_usage'::regclass
     and conname = 'ops_stock_pool_usage_reason_check';
  if v_reasons is null then
    raise exception 'SANITY: the reason list is not constrained';
  end if;

  -- All SIX are accepted…
  foreach v_r in array array['sales_urgent','supplier_delay','warranty_exchange',
                             'vip','other','used_instead_of_ordering'] loop
    if position(v_r in v_reasons) = 0 then
      raise exception 'SANITY: reason % missing from the CHECK', v_r;
    end if;
  end loop;

  -- …and BOTH doors accept the same six. A CHECK widened alone would leave the
  -- picker offering a word the RPC refuses.
  select prosrc into v_draw_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ops_stock_pool_draw';
  select prosrc into v_take_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ops_stock_takeout';
  if position('used_instead_of_ordering' in coalesce(v_draw_src, '')) = 0 then
    raise exception 'SANITY: ops_stock_pool_draw still refuses the sixth reason';
  end if;
  if position('used_instead_of_ordering' in coalesce(v_take_src, '')) = 0 then
    raise exception 'SANITY: ops_stock_takeout still refuses the sixth reason';
  end if;

  -- The `other`-needs-a-note rule is UNTOUCHED — in the table and in both
  -- bodies. P13's Must-NOT: the reason may never become optional.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.ops_stock_pool_usage'::regclass
       and conname = 'ops_stock_pool_usage_other_needs_words'
  ) then
    raise exception 'SANITY: the other-needs-a-note constraint is gone';
  end if;
  if position('reason_needs_words' in coalesce(v_draw_src, '')) = 0
     or position('reason_needs_words' in coalesce(v_take_src, '')) = 0 then
    raise exception 'SANITY: a door stopped demanding words for Other';
  end if;

  -- No ghost overload — a "fixed" gate serving the old body is how a widened
  -- list quietly stays five (0290's check, inherited).
  select count(*) into v_overloads
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('ops_stock_pool_draw','ops_stock_takeout');
  if v_overloads <> 2 then
    raise exception 'SANITY: expected exactly 2 K4 doors, found %', v_overloads;
  end if;

  -- The RPC gate must still be the only way in (0292's own assertion).
  select count(*) into v_write_pol
    from pg_policies
   where schemaname = 'public'
     and tablename = 'ops_stock_pool_usage'
     and cmd <> 'SELECT';
  if v_write_pol <> 0 then
    raise exception 'SANITY: % write policies on the ledger — the RPC gate is walkable', v_write_pol;
  end if;

  raise notice 'P13 sanity OK: reasons=6 doors=2 other_needs_words=intact write_policies=0';
end;
$sanity$;
