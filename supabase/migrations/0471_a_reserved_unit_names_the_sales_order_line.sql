-- 0471_a_reserved_unit_names_the_sales_order_line.sql
--
-- ⭐ A RESERVED UNIT SAYS WHICH SO ITEM LINE IT IS FOR.
-- (PURCHASING × STOCK × SALES ORDERS · SO Batch Purchase Ready Stock,
--  owner authorization 2026-09-10.)
--
-- ---- WHAT WAS MEASURED ON PRODUCTION, 2026-09-10 --------------------------
--
--   · `ops_stock_pool_draw` writes `reserved_ref = 'SO-1234'` and NOTHING else
--     about WHICH line the unit answers. A Sales Order with two lines of one
--     SKU therefore has no line truth at all — and that is not hypothetical:
--     SO-1251, SO-1207 and SO-1246 each carry two lines of the same SKU today.
--   · `ops_stock_release` (0139) returns the unit to `free` but the purchasing
--     netting reads `ops_stock_pool_usage`, whose own comment says a release is
--     never subtracted. So an Unreserve made the customer's requirement vanish
--     from SO Batch Purchase permanently. Under-supply, and nothing on screen.
--   · 261 catalog SKUs collide ZERO times under the portal's `stockMatchKey`
--     (measured by group-by on `product_skus`, 2026-09-10): fabric, colour and
--     the (LHF)/(RHF) hands all survive it; only the size word is lifted out.
--     The key is therefore sound as the SQL-side match, and the arithmetic is
--     pinned to its TypeScript twin by a contract test over the real corpus —
--     the same "agreement rather than trust" `documentPartitionKey` uses.
--   · 5 `identity_scope = 'quantity'` rows stand for 893 counted pieces. 0368
--     already ruled bulk is NOT bindable to a Sales Order; this file enforces
--     that ruling at the reservation door instead of leaving it to a screen.
--
-- ---- WHAT THIS FILE DOES --------------------------------------------------
--
--   1. `ops_stock_items.reserved_order_line_id` — the line the reservation
--      answers. A COLUMN, not a second table: the unit row already IS the
--      reservation (`reserved_ref`, `sold_order_id`, `po_line_id` all live on
--      it), so release and reassign already rewrite this row and the
--      restoration comes free. A side table would be a second truth.
--   2. `public.stock_match_key(text)` — the SQL half of the portal's one
--      linking rule between `order_lines.sku` and `ops_stock_items.sku`.
--   3. `ops_stock_pool_draw` gains `p_order_line_id`. NO reservation against a
--      Sales Order is stored without a line: `Choose Ready Unit` names one, and
--      a caller that does not (the order drawer's picker never had the concept)
--      has it RESOLVED — one candidate or a refusal, never a pick out of
--      several. The door then validates, in SQL, on the locked row: the line
--      belongs to that Sales Order, the SKUs match by the key, the unit is an
--      exact Unit (never a counted row), it is `available` by the one
--      availability arithmetic, and the line still has a remaining requirement
--      after existing Ready Stock and non-cancelled PO lineage. There is NO
--      override — not a reason box, not a note, not a flag.
--   4. `ops_stock_release` and `ops_stock_reassign` clear the binding, so the
--      requirement returns to SO Batch Purchase by itself.
--   5. A one-time, non-destructive backfill of the binding where exactly one
--      line can possibly be meant. Ambiguous rows stay NULL and keep reading
--      through the historical ledger.
--
-- ⛔ WHAT THIS FILE DOES NOT DO
--   · It does NOT subtract from `ops_stock_pool_usage`. That ledger counts the
--     DECISION and stays append-only (0292); coverage is a different question
--     and now has its own answer.
--   · It changes NO RLS policy and adds no write policy. The register still
--     has none: every write is a SECURITY DEFINER door.
--   · It deletes, renumbers or reuses NO Unit ID, and asserts no row count.

begin;

-- ─── 1 · the line a reservation answers ──────────────────────────────────────

alter table public.ops_stock_items
  add column if not exists reserved_order_line_id uuid references public.order_lines(id);

comment on column public.ops_stock_items.reserved_order_line_id is
  '0471: the Sales Order ITEM LINE this unit is reserved (and later sold) against. Written only by ops_stock_pool_draw with a validated line; cleared by ops_stock_release and ops_stock_reassign. `reserved_ref` names the order, this names the line — a Sales Order with two lines of one SKU needs both.';

create index if not exists ops_stock_items_reserved_order_line_idx
  on public.ops_stock_items (reserved_order_line_id)
  where reserved_order_line_id is not null;

-- ─── 2 · the one linking rule, in SQL ────────────────────────────────────────
--
-- Mirrors `stockMatchKey` in packages/shared/src/line-category.ts.
--
-- TWO THINGS THE OBVIOUS TRANSLATION GETS WRONG, and both are handled here:
--   · JavaScript's `\b` is a boundary against `[A-Za-z0-9_]`, NOT against
--     letters. Written as `[^a-z]` the SQL would lift the size word out of
--     `Queen2` where the TypeScript leaves it in. The class is `[^a-z0-9_]`.
--   · POSIX regex has no lookahead, so the trailing `-K` / `-Q` / `-S` form
--     captures its delimiter and puts it back rather than peeking past it.
--
-- Proven, not asserted: both implementations were run over the complete live
-- SKU corpus on 2026-09-10 (327 distinct SKUs across `ops_stock_items`,
-- `order_lines` and `product_skus`). Every size-bearing SKU produced the same
-- key in both, and every other SKU produced the plain normalisation.
-- `stock-match-key.contract.test.ts` pins the TypeScript half to that corpus.

create or replace function public.stock_match_key(p_sku text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  with s as (select lower(coalesce(p_sku, '')) as v)
  select regexp_replace(
           regexp_replace(
             regexp_replace(s.v, '(^|[^a-z0-9_])(super *)?(single|queen|king)([^a-z0-9_]|$)', '\1 \4', 'g'),
             '[-[:space:]][kqs]([/[:space:])]|$)', ' \1', 'g'),
           '[^a-z0-9]+', '', 'g')
      || case
           when s.v ~ '(^|[^a-z0-9_])queen([^a-z0-9_]|$)' then '|Q'
           when s.v ~ '(^|[^a-z0-9_])king([^a-z0-9_]|$)'  then '|K'
           when s.v ~ '(^|[^a-z0-9_])(super *)?single([^a-z0-9_]|$)' then '|S'
           when s.v ~ '[-[:space:]][kqs]([/[:space:])]|$)'
             then '|' || upper(substring(s.v from '[-[:space:]]([kqs])(?:[/[:space:])]|$)'))
           else ''
         end
    from s;
$function$;

comment on function public.stock_match_key(text) is
  '0471 — the SQL half of the portal''s ONE rule for linking `order_lines.sku` (catalog vocabulary) to `ops_stock_items.sku` (the warehouse''s own names). Kept identical to `stockMatchKey` in packages/shared by a contract test over the real SKU corpus. Zero collisions across 261 catalog SKUs, measured 2026-09-10.';

grant execute on function public.stock_match_key(text) to authenticated;

-- ─── 3 · how much of a line is still genuinely needed ────────────────────────
--
-- The SAME arithmetic `soBatchOrderLineOutstandingQty` prints, so the door can
-- never admit a unit the Register says is not needed:
--   line.qty  −  Ready Stock already bound  −  non-cancelled PO lineage.
-- Ready Stock counts units still reserved AND units already sold: a delivered
-- requirement must not come back as something to buy (0292's own warning), and
-- the binding survives the sale because nothing clears it there.

create or replace function public.so_line_remaining_requirement(
  p_order_line_id uuid,
  p_exclude_item  uuid default null
)
returns int
language sql
stable
set search_path to 'public'
as $function$
  select greatest(0,
    coalesce((select l.qty from order_lines l where l.id = p_order_line_id), 0)
    - coalesce((select sum(coalesce(i.qty, 1))
                  from ops_stock_items i
                 where i.reserved_order_line_id = p_order_line_id
                   and i.status in ('reserved', 'sold')
                   and (p_exclude_item is null or i.id <> p_exclude_item)), 0)
    - coalesce((select sum(greatest(0, s.qty))
                  from po_line_sources s
                  join purchase_orders p on p.id = s.po_id
                 where s.order_line_id = p_order_line_id
                   and p.status <> 'cancelled'), 0)
  );
$function$;

comment on function public.so_line_remaining_requirement(uuid, uuid) is
  '0471 — what a Sales Order item line still needs: ordered quantity less the Ready Stock Units bound to it (reserved or sold) less its non-cancelled purchase-order lineage. The same expression `soBatchOrderLineOutstandingQty` prints, so the reservation door and the Register cannot disagree.';

grant execute on function public.so_line_remaining_requirement(uuid, uuid) to authenticated;

-- ─── 4 · the draw door names the line ────────────────────────────────────────
--
-- ⚠️ THE 7-ARGUMENT FORM SURVIVES THIS FILE, AND ONLY THIS FILE. Dropping it
-- here would break `/reserve`, `/reserve-item` and `/take-stock` for the whole
-- window between applying the migration and the Worker reaching production —
-- the old bundle calls the 7-name form, the new one calls the 8-name form, and
-- whichever order they land in, one of them is calling a function that does not
-- exist. So this migration leaves a DELEGATOR (§4c below) and `0472` removes it
-- once the deploy is verified. The delegator validates nothing of its own: it
-- forwards to the door below with no line, which then resolves one or refuses.
-- Two doors is a debt, and it is paid the same day it is taken on.

create or replace function public.ops_stock_pool_draw(
  p_ref            text,
  p_reason         text,
  p_note           text default null,
  p_item_id        uuid default null,
  p_sku            text default null,
  p_condition      text default null,
  p_wh             uuid default null,
  p_order_line_id  uuid default null
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
  v_so       int;
  v_line_id  uuid;
  v_line     record;
  v_unit     record;
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

  -- ── 0471 · A CUSTOMER ORDER IS NAMED BY ITS LINE, NEVER BY ITS NUMBER ─────
  --
  -- NO RESERVATION AGAINST A SALES ORDER IS EVER STORED WITHOUT A LINE. When
  -- the caller does not name one — the order drawer's own picker has never had
  -- the concept — the door RESOLVES it, and resolution has exactly two
  -- outcomes: one candidate, or a refusal. It never picks a line out of
  -- several, because picking is the ambiguity this migration exists to remove.
  --
  -- A candidate is a line of THIS order whose goods match by the key and which
  -- still has a remaining requirement. On the live data that is one line for
  -- every order but the three that carry two lines of one SKU, and those are
  -- exactly the ones a guess would get wrong.
  v_so := nullif(substring(v_ref from '^SO-([0-9]+)$'), '')::int;
  v_line_id := p_order_line_id;

  if v_so is not null and v_line_id is null then
    select l.id into v_line_id
      from order_lines l
      join orders o on o.id = l.order_id
     where o.so = v_so
       and public.stock_match_key(l.sku) = public.stock_match_key(
             coalesce((select i.sku from ops_stock_items i where i.id = p_item_id), v_sku))
       and public.so_line_remaining_requirement(l.id, p_item_id) > 0
     limit 2;
    if v_line_id is null then
      raise exception 'order_line_required' using errcode = '22023',
        detail = 'no item line on that Sales Order still needs these goods';
    end if;
    if (select count(*) from order_lines l join orders o on o.id = l.order_id
         where o.so = v_so
           and public.stock_match_key(l.sku) = public.stock_match_key(
                 coalesce((select i.sku from ops_stock_items i where i.id = p_item_id), v_sku))
           and public.so_line_remaining_requirement(l.id, p_item_id) > 0) > 1 then
      raise exception 'order_line_required' using errcode = '22023',
        detail = 'that Sales Order has more than one item line for these goods — say which';
    end if;
  end if;

  if v_line_id is not null then
    if v_so is null then
      raise exception 'line_needs_sales_order_ref' using errcode = '22023',
        detail = 'an item line belongs to a Sales Order; this reference names none';
    end if;
    if p_item_id is null and p_order_line_id is not null then
      -- The CALLER named a line but no unit. `Choose Ready Unit` always names
      -- both; the pick-by-SKU door names neither and has its line resolved
      -- above, so this can only be a caller contract error.
      raise exception 'line_needs_exact_unit' using errcode = '22023',
        detail = 'a line binding names the exact Unit, never a pick-by-SKU';
    end if;

    select l.id, l.sku, l.qty, o.so
      into v_line
      from order_lines l
      join orders o on o.id = l.order_id
     where l.id = v_line_id;
    if not found then
      raise exception 'order_line_not_found' using errcode = '22023';
    end if;
    if v_line.so is distinct from v_so then
      raise exception 'line_not_in_order' using errcode = '22023',
        detail = 'that item line belongs to a different Sales Order';
    end if;

    if p_item_id is not null then
      -- Lock the unit BEFORE judging it: what it is must not change between
      -- the question and the update.
      select i.id, i.sku, i.status, i.needs_repair, i.condition, i.identity_scope
        into v_unit
        from ops_stock_items i
       where i.id = p_item_id
         for update;
      if not found then
        raise exception 'unit_not_found' using errcode = '22023';
      end if;
      if coalesce(v_unit.identity_scope, 'unit') <> 'unit' then
        -- 0368's ruling, enforced at the door: bulk is not bindable.
        raise exception 'quantity_row_not_bindable' using errcode = '22023',
          detail = 'counted stock has no Unit identity to commit to one item line';
      end if;
      if public.stock_match_key(v_unit.sku) is distinct from public.stock_match_key(v_line.sku) then
        raise exception 'unit_does_not_match_line' using errcode = '22023',
          detail = 'that Unit is not the goods this item line ordered';
      end if;
      -- A RACE AND AN UNSOUND UNIT ARE DIFFERENT ANSWERS, and the operator
      -- needs to be able to tell them apart: one means try again with another
      -- Unit, the other means this Unit was never choosable. `40001` is the
      -- serialisation class, so a caller can retry a race without parsing text.
      if v_unit.status <> 'free' then
        raise exception 'unit_no_longer_free' using errcode = '40001',
          detail = 'someone else took that Unit';
      end if;
      -- READY STOCK'S OWN DEFINITION OF READY (`unit_availability`, 0371), read
      -- through the one arithmetic rather than re-decided here.
      if public.unit_availability(v_unit.status, v_unit.needs_repair,
                                  null, v_unit.condition) <> 'available' then
        raise exception 'unit_not_available' using errcode = '22023',
          detail = 'that Unit is not free and sound ready stock';
      end if;
    else
      -- The pick-by-SKU door has not chosen a unit yet, but it will pick one
      -- whose `sku` equals `v_sku` exactly, so the goods can be judged now.
      -- 0368 still applies: only an exact Unit may be bound, and the pick below
      -- is narrowed to one for a Sales Order reference.
      if public.stock_match_key(v_sku) is distinct from public.stock_match_key(v_line.sku) then
        raise exception 'unit_does_not_match_line' using errcode = '22023',
          detail = 'that stock is not the goods this item line ordered';
      end if;
    end if;
    if public.so_line_remaining_requirement(v_line_id, p_item_id) <= 0 then
      raise exception 'line_already_covered' using errcode = '22023',
        detail = 'that item line is already covered by Ready Stock or a purchase order';
    end if;
  end if;

  if p_item_id is not null then
    -- The operator picked this exact physical unit. Claim it only if it is
    -- genuinely still free — a unit somebody else grabbed a second ago must
    -- read as a conflict, never as a silent no-op.
    update ops_stock_items
       set status                 = 'reserved',
           reserved_ref           = v_ref,
           reserved_order_line_id = coalesce(v_line_id, reserved_order_line_id),
           updated_at             = now()
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
    -- pick rule ops_stock_reserve has used since 0137, unchanged except that a
    -- pick destined for a Sales Order item line must land on an exact Unit
    -- (0368: bulk is not bindable).
    update ops_stock_items
       set status                 = 'reserved',
           reserved_ref           = v_ref,
           reserved_order_line_id = coalesce(v_line_id, reserved_order_line_id),
           updated_at             = now()
     where id = (
       select id from ops_stock_items
        where sku          = v_sku
          and warehouse_id = v_wh
          and status       = 'free'
          and needs_repair = false
          and (p_condition is null or condition = p_condition)
          and (v_line_id is null or coalesce(identity_scope, 'unit') = 'unit')
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
                       'qty', v_qty, 'reason', p_reason,
                       'order_line_id', v_line_id)
  );

  return v_id;
end;
$function$;

revoke all on function public.ops_stock_pool_draw(text, text, text, uuid, text, text, uuid, uuid)
  from public, anon;
grant execute on function public.ops_stock_pool_draw(text, text, text, uuid, text, text, uuid, uuid)
  to authenticated;

comment on function public.ops_stock_pool_draw(text, text, text, uuid, text, text, uuid, uuid) is
  '0471 — K4''s pool draw (0292/0322) plus the Sales Order ITEM LINE the unit answers. An `SO-` reference now requires that line and is validated in SQL against the locked unit row: the line belongs to the order, the SKUs match by `stock_match_key`, the unit is an exact Unit and not counted stock, it is `available` by the one availability arithmetic, and the line still has a remaining requirement. There is no override.';

-- ─── 4c · the deploy-window delegator, removed by 0472 ───────────────────────
--
-- PostgREST resolves an overload by the EXACT set of argument names a request
-- sends, so the 7-name bundle keeps reaching this one and the 8-name bundle
-- reaches the real door. It adds no rule and skips none.

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
language sql
security invoker
set search_path to 'public'
as $function$
  select public.ops_stock_pool_draw(
    p_ref => p_ref, p_reason => p_reason, p_note => p_note,
    p_item_id => p_item_id, p_sku => p_sku, p_condition => p_condition,
    p_wh => p_wh, p_order_line_id => null);
$function$;

comment on function public.ops_stock_pool_draw(text, text, text, uuid, text, text, uuid) is
  '0471 DEPLOY-WINDOW DELEGATOR — forwards to the 8-argument draw door with no item line, so a browser or Worker still on the pre-0471 bundle keeps working while the deploy lands. It validates nothing of its own. REMOVED BY 0472 once production is verified; do not build on it.';

revoke all on function public.ops_stock_pool_draw(text, text, text, uuid, text, text, uuid)
  from public, anon;
grant execute on function public.ops_stock_pool_draw(text, text, text, uuid, text, text, uuid)
  to authenticated;

-- ─── 4b · one operator act is one transaction ────────────────────────────────
--
-- The three existing pickers fire N parallel `reserve-item` requests and sort
-- the wreckage out with a toast: two of three reserved, one lost to a race,
-- and a screen that has to explain a half-done act. `Choose Ready Unit` is ONE
-- act, so it is ONE transaction — every unit or none, and the refusal names
-- the exact unit that stopped it.
--
-- THIS IS NOT A SECOND WRITER. It calls `ops_stock_pool_draw` and nothing else;
-- every guard, every ledger row and every audit line is the draw door's.

create or replace function public.so_batch_reserve_ready_units(
  p_ref    text,
  p_reason text,
  p_note   text,
  p_picks  jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pick   jsonb;
  v_item   uuid;
  v_line   uuid;
  v_drawn  uuid;
  v_out    jsonb := '[]'::jsonb;
  v_count  int := 0;
begin
  if jsonb_typeof(p_picks) <> 'array' or jsonb_array_length(p_picks) = 0 then
    raise exception 'no_units_chosen' using errcode = '22023';
  end if;
  if jsonb_array_length(p_picks) > 50 then
    raise exception 'too_many_units' using errcode = '22023',
      detail = 'choose at most 50 Units in one act';
  end if;

  for v_pick in select * from jsonb_array_elements(p_picks) loop
    v_item := (v_pick ->> 'itemId')::uuid;
    v_line := (v_pick ->> 'orderLineId')::uuid;

    v_drawn := public.ops_stock_pool_draw(
      p_ref           => p_ref,
      p_reason        => p_reason,
      p_note          => p_note,
      p_item_id       => v_item,
      p_sku           => null,
      p_condition     => null,
      p_wh            => null,
      p_order_line_id => v_line
    );

    -- A null answer is the draw door saying the unit is no longer free. In a
    -- one-act transaction that is a refusal, not a quiet shortfall.
    if v_drawn is null then
      raise exception 'unit_no_longer_free' using errcode = '40001',
        detail = format('Unit %s was taken by someone else', v_item::text);
    end if;

    v_count := v_count + 1;
    v_out := v_out || jsonb_build_object('itemId', v_drawn, 'orderLineId', v_line);
  end loop;

  return jsonb_build_object('reserved', v_count, 'units', v_out, 'reference', p_ref);
end;
$function$;

revoke all on function public.so_batch_reserve_ready_units(text, text, text, jsonb) from public, anon;
grant execute on function public.so_batch_reserve_ready_units(text, text, text, jsonb) to authenticated;

comment on function public.so_batch_reserve_ready_units(text, text, text, jsonb) is
  '0471 — SO Batch Purchase''s `Choose Ready Unit`: N exact Units, each named against the Sales Order ITEM LINE it answers, in ONE transaction. Delegates every guard and every ledger row to `ops_stock_pool_draw`; it adds only atomicity, so a race refuses the whole act by name instead of half-reserving it.';

-- ─── 5 · release and reassign give the requirement back ──────────────────────
--
-- Live bodies read before redefinition (production, 2026-09-10):
--   ops_stock_release   md5(prosrc) = b481846a8d807be051f6535319b2190b
--   ops_stock_reassign  md5(prosrc) = 3e351a4aa8e959e55016b809110b8928
-- Each gains exactly one assignment; nothing else in either body moves.

create or replace function public.ops_stock_release(p_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
DECLARE
  v_role app_role;
  v_id   uuid;
  v_ref  text;
BEGIN
  v_role := public.app_role();
  IF v_role NOT IN ('operation','principal') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE ops_stock_items
     SET status       = 'free',
         reserved_ref = NULL,
         -- 0471: the line goes with the reference. The customer still owes the
         -- goods, so the requirement must return to SO Batch Purchase.
         reserved_order_line_id = NULL,
         ref_history  = CASE
                          WHEN reserved_ref IS NOT NULL
                            THEN array_append(ref_history, reserved_ref)
                          ELSE ref_history
                        END,
         updated_at   = now()
   WHERE id     = p_item_id
     AND status = 'reserved'
   RETURNING id, reserved_ref INTO v_id, v_ref;

  IF v_id IS NOT NULL THEN
    INSERT INTO audit_log (role, action, ref)
    VALUES (v_role, 'ops_stock.release', v_ref);

    INSERT INTO ops_activity_log (order_id, action, actor_id, detail)
    VALUES (
      public._activity_log_order_id_from_ref(v_ref),
      'stock_release',
      auth.uid(),
      jsonb_build_object('item_id', v_id, 'ref', v_ref)
    );
  END IF;
  RETURN v_id;
END;
$$;

create or replace function public.ops_stock_reassign(p_item_id uuid, p_new_ref text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
DECLARE
  v_role app_role;
  v_id   uuid;
BEGIN
  v_role := public.app_role();
  IF v_role NOT IN ('operation','principal') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE ops_stock_items
     SET reserved_ref = p_new_ref,
         -- 0471: the reference moved without naming a line, so the OLD line's
         -- requirement returns and the new order shows the goods as still to
         -- buy until someone chooses this Unit against one of its lines.
         -- Over-buying is visible and recoverable; under-supply is not.
         reserved_order_line_id = NULL,
         ref_history  = CASE
                          WHEN reserved_ref IS NOT NULL AND reserved_ref <> p_new_ref
                            THEN array_append(ref_history, reserved_ref)
                          ELSE ref_history
                        END,
         updated_at   = now()
   WHERE id     = p_item_id
     AND status = 'reserved'
   RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    INSERT INTO audit_log (role, action, ref)
    VALUES (v_role, 'ops_stock.reassign', p_new_ref);

    INSERT INTO ops_activity_log (order_id, action, actor_id, detail)
    VALUES (
      public._activity_log_order_id_from_ref(p_new_ref),
      'stock_reassign',
      auth.uid(),
      jsonb_build_object('item_id', v_id, 'new_ref', p_new_ref)
    );
  END IF;
  RETURN v_id;
END;
$$;

-- ─── 6 · the two register views carry the binding ────────────────────────────
--
-- Appended at the end of each select list, so every existing column keeps its
-- name, type and position and `create or replace view` is legal.

create or replace view public.stock_unit_availability_v
  with (security_invoker = true) as
 SELECT id,
    unit_code,
    sku,
    stock_sku_category(sku) AS category,
    warehouse_id,
    holder_party_id,
    ownership,
    supplier,
    po_no,
    status,
    condition,
    needs_repair,
    hold_reason,
    reserved_ref,
    sold_order_id,
    qty,
    date_in,
    sold_at,
    last_verified_at,
    unit_availability(status, needs_repair, hold_reason, condition) AS availability,
    unit_lifecycle_outcome(status) AS lifecycle_outcome,
    identity_scope,
    reserved_order_line_id
   FROM ops_stock_items i;

create or replace view public.stock_unit_register_v
  with (security_invoker = true) as
 SELECT v.id,
    v.unit_code,
    v.sku,
    v.category,
    v.warehouse_id,
    v.holder_party_id,
    v.ownership,
    v.supplier,
    v.po_no,
    v.status,
    v.condition,
    v.needs_repair,
    v.hold_reason,
    v.reserved_ref,
    v.sold_order_id,
    v.qty,
    v.date_in,
    v.sold_at,
    v.last_verified_at,
    v.availability,
    v.lifecycle_outcome,
    e.last_event_at,
    e.last_event,
    w.name AS site_name,
    p.name AS holder_name,
    v.identity_scope,
    v.reserved_order_line_id
   FROM stock_unit_availability_v v
     LEFT JOIN warehouses w ON w.id = v.warehouse_id
     LEFT JOIN stock_operating_parties p ON p.id = v.holder_party_id
     LEFT JOIN LATERAL ( SELECT ev.event_at AS last_event_at,
            ev.event AS last_event
           FROM stock_unit_events ev
          WHERE ev.unit_id = v.id
          ORDER BY ev.seq DESC
         LIMIT 1) e ON true;

-- ─── 7 · the unambiguous history, bound once ─────────────────────────────────
--
-- Only where the answer cannot be wrong: the unit is reserved or sold to an
-- `SO-n` reference, and that order has EXACTLY ONE item line whose key matches.
-- Everything else stays NULL and keeps reading through the historical ledger.
-- No row is deleted, no reference is rewritten, and no count is asserted.

update public.ops_stock_items i
   set reserved_order_line_id = m.line_id
  from (
    /* `min()` has no uuid form; the group holds exactly one row, so the first
       element of the aggregate IS that row. */
    select c.item_id, (array_agg(c.line_id))[1] as line_id
      from (
        select distinct i2.id as item_id, l.id as line_id
          from public.ops_stock_items i2
          join public.orders o
            on o.so = nullif(substring(i2.reserved_ref from '^SO-([0-9]+)$'), '')::int
          join public.order_lines l
            on l.order_id = o.id
           and public.stock_match_key(l.sku) = public.stock_match_key(i2.sku)
         where i2.reserved_order_line_id is null
           and i2.status in ('reserved', 'sold')
           and coalesce(i2.identity_scope, 'unit') = 'unit'
           and i2.reserved_ref ~ '^SO-[0-9]+$'
      ) c
     group by c.item_id
    /* EXACTLY ONE CANDIDATE, or the row stays NULL. `min()` is reached only
       when the group holds a single line, so it never picks a winner. */
    having count(*) = 1
  ) m
 where i.id = m.item_id;

-- ─── 8 · sanity — the shape, not the data ────────────────────────────────────

do $sanity$
declare
  v_overloads int;
  v_col       int;
  v_key       text;
begin
  -- TWO, on purpose and for one deploy only: the real door and §4c's
  -- delegator. 0472 asserts it is back to one.
  select count(*) into v_overloads
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ops_stock_pool_draw';
  if v_overloads <> 2 then
    raise exception '0471 sanity: expected the door and its delegator, found %', v_overloads;
  end if;

  select count(*) into v_col
    from information_schema.columns
   where table_schema = 'public' and table_name = 'ops_stock_items'
     and column_name = 'reserved_order_line_id';
  if v_col <> 1 then
    raise exception '0471 sanity: the binding column is missing';
  end if;

  -- The key must survive the four shapes the live catalog actually uses.
  if public.stock_match_key('CODY-Q') <> 'cody|Q' then
    raise exception '0471 sanity: trailing size not lifted (got %)', public.stock_match_key('CODY-Q');
  end if;
  if public.stock_match_key('Hana LV622-MD/SC-1521-1(White)-King')
     <> public.stock_match_key('Hana LV622-MD/SC-1521-1(White)-K') then
    raise exception '0471 sanity: the two spellings of King disagree';
  end if;
  if public.stock_match_key('1013Jager/Fab3-Queen/PC151-01')
     = public.stock_match_key('1013Jager/Fab3-Queen/PC151-14') then
    raise exception '0471 sanity: colour was discarded by the key';
  end if;
  if public.stock_match_key('CODY-SK') = public.stock_match_key('CODY-K') then
    raise exception '0471 sanity: Super King collapsed into King';
  end if;

  select public.stock_match_key('5539-1A(LHF)') into v_key;
  if v_key = public.stock_match_key('5539-1A(RHF)') then
    raise exception '0471 sanity: the hand of a sofa piece was discarded';
  end if;
end;
$sanity$;

commit;
