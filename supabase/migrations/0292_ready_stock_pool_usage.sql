-- =====================================================================
-- 0292 — Ready Stock K4: pool usage reasons + reserve levels
-- =====================================================================
-- Card: docs/ready-stock-execution-queue.md § K4 (Jess-locked 2026-07-27).
--   "taking a ready-stock unit records WHY (the locked reason list); each SKU
--    carries a COO-set `reserve level` — at/below it, further use warns but
--    never blocks (COO decides, system reminds). Usage split (Sales 60% /
--    supplier-delay 25% / …) readable per month."
--   Done when: 为什么一直缺货 is answerable from data.
--
-- WHAT THIS ADDS
--   1. ops_stock_pool_usage    — the dated ledger: one row per draw.
--   2. ops_stock_reserve_levels — one COO number per stock SKU.
--   3. ops_stock_pool_draw()   — takes the unit AND records why, in ONE act.
--   4. ops_set_reserve_level() — audited DEFINER write, COO/principal.
-- Both tables carry a READ policy and NO write policy at all (0286/0287/0290's
-- shape), so the RPCs are the only door and their gates cannot be walked
-- around by a direct PostgREST write.
--
-- ─────────────────────────────────────────────────────────────────────
-- WHY A LEDGER AND NOT THE COLUMN THAT ALREADY EXISTS
--
-- `ops_stock_items.reserve_reason` has been there since 0213 with two values
-- ('urgent','exchange'). It cannot answer this card: it is overwritten when a
-- released unit is drawn again, it carries NO DATE, and it leaves the question
-- entirely once the unit is sold or the row is deleted. "Per month" needs an
-- EVENT. Measured on live prod before choosing (2026-07-27): that column holds
-- 0 non-null values across 87 records, so nothing is migrated and nothing is
-- lost. This migration leaves the column and its CHECK completely untouched —
-- after K4 nothing writes it (recorded as a carry-forward rather than dropped;
-- dropping a column is Loo's call).
--
-- WHY NOT `stock_movements`, THE LEDGER THAT ALREADY EXISTS
--
-- Checked, not assumed: `stock_movements` holds 0 rows, and no reserve has
-- ever written to it — only `ops_stock_takeout` does. It records PHYSICAL in
-- and out at a warehouse; a draw is a COMMITMENT (the goods are still on the
-- floor, they are just no longer available), which is the moment the ready
-- pool actually drains. It also carries a blanket INSERT policy for every
-- operation login, so a reason stored there could be written — or skipped —
-- by any client, which is exactly the shape K1-K3 refused. Widening that table
-- for this would mean loosening a table partner flows read.
--
-- WHY THE DRAW AND THE REASON ARE ONE FUNCTION
--
-- 0213's route stamped the reason with a best-effort UPDATE *after* the
-- reserve succeeded, so a failed stamp left a drawn unit with no reason and
-- nobody the wiser. Here the flip and the ledger row are the same statement
-- pair in the same transaction: either the unit is taken WITH a reason, or it
-- is not taken. The card says taking a unit records why — that is only true if
-- it cannot half-happen.
--
-- WHY RESERVE LEVELS ARE THEIR OWN TABLE (and not a column on
-- ops_reorder_points)
--
-- Same key, same owner, same screen — but `ops_reorder_points.reorder_point`
-- is NOT NULL, so setting a reserve level for a SKU with no reorder point
-- would have to insert 0, and K1 documents 0 as "the reorder alert is switched
-- OFF". A SKU that reads "Set a number" today would silently start reading
-- "watched and fine" as a side effect of an unrelated act. K1's screen keeps
-- its meaning; the two numbers answer two questions (when to BUY vs how low to
-- let it GO) and are stored accordingly.
--
-- THE GATES (ZERO new duty keys — 0286's note, asserted by 0287 and 0290)
--   draw            → any active operation/principal login. The person on the
--                     floor takes the unit; a duty gate here would stop the
--                     work, and the reason is what we are collecting, not a
--                     permission.
--   set the level   → `stock_planner` (or principal) — "only the COO edits
--                     reorder points / reserve levels" is the queue doc's own
--                     line, and 0286 minted exactly this key for it.
--
-- NOT IN SCOPE (deliberately): the health ladder and slow-moving alerts (K5),
-- and PARTIAL draws from a bulk record — the register flips a whole record, so
-- the ledger records the record's qty. That is what actually left the free
-- pool; splitting a 555-unit accessory row belongs to the reservation engine,
-- which this card is told not to rebuild.
--
-- Tail re-checked immediately before apply (guardrail #8). It fired: a parallel
-- line applied 0291_supplier_claim_lifecycle while this draft was being dry-run,
-- so the unapplied file was renumbered 0291 -> 0292.
-- Dry-run: full body + behaviour assertions in a rolled-back transaction on
-- live prod, verified to leave 0 tables / 0 functions / 0 rows behind.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The ledger — why the ready pool drained
-- ---------------------------------------------------------------------
create table if not exists public.ops_stock_pool_usage (
  id           uuid primary key default gen_random_uuid(),
  -- The unit that was taken. ON DELETE SET NULL, not CASCADE: a mis-keyed row
  -- gets hard-deleted through DELETE /api/ops/stock/:itemId, and the reason
  -- the pool drained in July must survive that. `sku` is copied for the same
  -- reason — the history still reads after the unit is gone.
  item_id      uuid references public.ops_stock_items(id) on delete set null,
  sku          text not null check (btrim(sku) <> ''),
  qty          int  not null check (qty > 0 and qty <= 100000),
  -- The card's five, verbatim. Mirrored by POOL_USE_REASONS in
  -- packages/shared/src/pool-usage.ts — a flat, locked key list, so a CHECK is
  -- a true mirror here and not a copy that can drift into a different answer.
  reason       text not null check (reason in (
                 'sales_urgent','supplier_delay','warranty_exchange',
                 'vip','other')),
  note         text,
  -- The SO / customer reference the unit was committed to.
  ref          text,
  taken_by     uuid not null references public.app_users(id),
  taken_at     timestamptz not null default now(),

  -- "Other" with an empty note explains nothing, and the whole point of a
  -- locked reason list is that the monthly split reads as an answer. The same
  -- rule refuses it on the client, in the route and here — the DB is the one
  -- that cannot be skipped. (K3's law, inherited rather than re-invented.)
  constraint ops_stock_pool_usage_other_needs_words
    check (reason <> 'other' or btrim(coalesce(note, '')) <> '')
);

comment on table public.ops_stock_pool_usage is
  'Ready-stock pool usage (K4). One row per draw: what left the free pool, how many, why, who and when. Written ONLY by ops_stock_pool_draw(), in the same transaction as the reserve — a unit cannot be taken without a reason. Counts WHY, never net units: a later release does not unmake the decision, so nothing here is subtracted.';
comment on column public.ops_stock_pool_usage.qty is
  'Units this draw removed from free stock = the register record''s own qty (0218 bulk rows are ONE record of N units). The engine reports units and draws side by side so 555 pillows and 555 mattresses never read alike.';

alter table public.ops_stock_pool_usage enable row level security;

drop policy if exists ops_stock_pool_usage_read on public.ops_stock_pool_usage;
create policy ops_stock_pool_usage_read on public.ops_stock_pool_usage
  for select
  using ((select (auth.jwt() -> 'app_metadata') ->> 'role') in ('operation','principal'));

-- The screen's question is always "this month".
create index if not exists ops_stock_pool_usage_month_idx
  on public.ops_stock_pool_usage (taken_at desc);
create index if not exists ops_stock_pool_usage_sku_idx
  on public.ops_stock_pool_usage (sku, taken_at desc);

-- ---------------------------------------------------------------------
-- 2. The floor a human chose
-- ---------------------------------------------------------------------
create table if not exists public.ops_stock_reserve_levels (
  sku           text primary key,
  reserve_level int  not null check (reserve_level >= 0 and reserve_level <= 100000),
  note          text,
  updated_by    uuid references public.app_users(id),
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

comment on table public.ops_stock_reserve_levels is
  'Reserve level per stock SKU (K4) — how low the free pool may go before the screen reminds somebody. Key = ops_stock_items.sku verbatim (free-text Klg sheet names, NOT a catalog code — 0286''s measurement). 0 = the reminder is switched off. Written only by ops_set_reserve_level().';
comment on column public.ops_stock_reserve_levels.reserve_level is
  'WARNS at or below this, NEVER blocks (Jess: the COO decides, the system reminds). The register can be behind what the person on the floor knows, and a system that refuses the last unit teaches people to work around it.';

alter table public.ops_stock_reserve_levels enable row level security;

drop policy if exists ops_stock_reserve_levels_read on public.ops_stock_reserve_levels;
create policy ops_stock_reserve_levels_read on public.ops_stock_reserve_levels
  for select
  using ((select (auth.jwt() -> 'app_metadata') ->> 'role') in ('operation','principal'));

-- ---------------------------------------------------------------------
-- 3. Take a unit AND say why — one act, one transaction
--
--    Serves BOTH doors that draw from the free pool:
--      • p_item_id given  → the order drawer's picker claims THAT unit
--                           (returns null when it is no longer free → 409).
--      • p_sku given      → the On-hand box takes the oldest free unit for a
--                           SKU (returns null when there is none → 404).
--    One function so there is ONE ledger writer; the only branch is which
--    unit gets picked. Null-return (rather than RAISE) keeps both routes'
--    existing HTTP contracts byte-for-byte.
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
  if p_reason is null or p_reason not in (
       'sales_urgent','supplier_delay','warranty_exchange','vip','other') then
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
-- 4. Set the floor — COO only (0286's gate, same duty key)
-- ---------------------------------------------------------------------
create or replace function public.ops_set_reserve_level(
  p_sku   text,
  p_level int,
  p_note  text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := (select public.app_role());
  v_sku  text := nullif(btrim(coalesce(p_sku, '')), '');
begin
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_sku is null then
    raise exception 'sku_required' using errcode = '22023';
  end if;
  if p_level is null or p_level < 0 or p_level > 100000 then
    raise exception 'reserve_level_out_of_range' using errcode = '22023';
  end if;
  -- The same seat that sets reorder points and approves the monthly plan.
  -- `is_internal()` is deliberately NOT used: it admits roles with no business
  -- deciding how much stock the warehouse holds back.
  if not public.ops_stock_plan_has_duty('stock_planner') then
    raise exception 'forbidden' using errcode = '42501',
      detail = 'reserve levels are set by the COO';
  end if;

  insert into ops_stock_reserve_levels (sku, reserve_level, note, updated_by, updated_at)
  values (v_sku, p_level, nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), now())
  on conflict (sku) do update
    set reserve_level = excluded.reserve_level,
        note          = excluded.note,
        updated_by    = excluded.updated_by,
        updated_at    = now();

  insert into audit_log (role, actor_text, action, ref)
  values (v_role::public.app_role,
          (select name from app_users where id = auth.uid()),
          case when p_level = 0
               then format('Reserve level OFF · %s', v_sku)
               else format('Reserve level set · %s -> %s', v_sku, p_level)
          end,
          v_sku);
end;
$function$;

-- ---------------------------------------------------------------------
-- 5. Grants — revoke from BOTH public and anon, then grant back.
--    (Neither revoke alone does anything on Supabase; the pair plus the
--     explicit grant is the only shape that holds — 0268's measurement.)
-- ---------------------------------------------------------------------
revoke all on function public.ops_stock_pool_draw(text, text, text, uuid, text, text, uuid) from public, anon;
revoke all on function public.ops_set_reserve_level(text, int, text)                        from public, anon;

grant execute on function public.ops_stock_pool_draw(text, text, text, uuid, text, text, uuid) to authenticated;
grant execute on function public.ops_set_reserve_level(text, int, text)                        to authenticated;

-- ---------------------------------------------------------------------
-- 6. Sanity — flags set inside handlers, ASSERTED OUTSIDE them
--    (guardrail #4: a RAISE inside its own EXCEPTION handler catches
--     itself and proves nothing).
-- ---------------------------------------------------------------------
do $sanity$
declare
  v_sigs      text[] := array[
    'public.ops_stock_pool_draw(text, text, text, uuid, text, text, uuid)',
    'public.ops_set_reserve_level(text, int, text)'
  ];
  v_sig       text;
  v_write_pol int;
  v_read_pol  int;
  v_overloads int;
  v_new_duty  int;
  v_reasons   text;
  v_r         text;
begin
  foreach v_sig in array v_sigs loop
    if has_function_privilege('anon', v_sig, 'execute') then
      raise exception 'SANITY: anon can execute %', v_sig;
    end if;
    if not has_function_privilege('authenticated', v_sig, 'execute') then
      raise exception 'SANITY: authenticated cannot execute %', v_sig;
    end if;
  end loop;

  select count(*) into v_write_pol
    from pg_policies
   where schemaname = 'public'
     and tablename in ('ops_stock_pool_usage','ops_stock_reserve_levels')
     and cmd <> 'SELECT';
  if v_write_pol <> 0 then
    raise exception 'SANITY: % write policies on the K4 tables — the RPC gate is walkable', v_write_pol;
  end if;

  select count(*) into v_read_pol
    from pg_policies
   where schemaname = 'public'
     and tablename in ('ops_stock_pool_usage','ops_stock_reserve_levels')
     and cmd = 'SELECT';
  if v_read_pol <> 2 then
    raise exception 'SANITY: expected 2 read policies, found %', v_read_pol;
  end if;

  -- A ghost overload is how a "fixed" gate keeps serving the old body.
  select count(*) into v_overloads
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('ops_stock_pool_draw','ops_set_reserve_level');
  if v_overloads <> 2 then
    raise exception 'SANITY: expected exactly 2 K4 functions, found %', v_overloads;
  end if;

  -- K4 mints NO duty key either — the reserve level rides `stock_planner`,
  -- exactly as 0286 said it would. Same restraint 0287 and 0290 asserted.
  select count(*) into v_new_duty
    from org_duties where key not in
      ('ops_manager','po_duty_editor','account_creator','finance_approver',
       'roster_editor','stock_planner');
  if v_new_duty <> 0 then
    raise exception 'SANITY: % unexpected duty key(s) — K4 must mint none', v_new_duty;
  end if;

  -- The CHECK is a MIRROR of POOL_USE_REASONS, so a key added on one side and
  -- not the other trips here rather than at 2am on the warehouse floor.
  select pg_get_constraintdef(oid) into v_reasons
    from pg_constraint
   where conrelid = 'public.ops_stock_pool_usage'::regclass
     and conname = 'ops_stock_pool_usage_reason_check';
  if v_reasons is null then
    raise exception 'SANITY: the reason list is not constrained';
  end if;
  foreach v_r in array array['sales_urgent','supplier_delay','warranty_exchange','vip','other'] loop
    if position(v_r in v_reasons) = 0 then
      raise exception 'SANITY: reason % missing from the CHECK', v_r;
    end if;
  end loop;

  raise notice 'K4 sanity OK: anon=false auth=true write_policies=0 read_policies=2 functions=2 new_duties=0';
end;
$sanity$;
