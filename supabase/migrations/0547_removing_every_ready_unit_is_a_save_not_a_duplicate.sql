-- 0547 · REMOVING EVERY READY UNIT IS A SAVE, NOT A DUPLICATE
--
-- ⛔ THE BUG, AND IT IS IN 0546's OWN DOOR.
--
-- `purchasing_allocate_ready_units` receives the COMPLETE desired set for one
-- Manual Purchase line. An EMPTY set is a legal and required act — the owner
-- ruling of 2026-09-18 says in as many words that `Save changes` "applies
-- additions/removals, including removing every selected Unit". 0546's
-- duplicate-Unit guard refuses exactly that act:
--
--     if array_length(v_want, 1) is distinct from
--        (select count(distinct u) from unnest(v_want) u) then
--       raise exception 'duplicate_unit_chosen'
--
-- On an empty array `array_length(arr, 1)` is NULL, not 0, while
-- `count(distinct u)` over no rows is 0 — and `NULL is distinct from 0` is
-- TRUE. So the one act that frees a line refuses itself, and it does so with
-- the word `duplicate_unit_chosen`, which is not even true of a set with
-- nothing in it.
--
-- MEASURED, on PostgreSQL 16.13 and on the PGlite the suite runs:
--
--     select array_length('{}'::uuid[], 1)                              -- NULL
--     select (select count(distinct u) from unnest('{}'::uuid[]) u)     -- 0
--     select array_length('{}'::uuid[],1) is distinct from 0            -- t
--
-- It was found by `apps/api/src/test/manual-purchase-stock-allocation.test.ts`
-- running the committed SQL rather than a mock of it. The API-layer tests
-- could not have found it: they answer for the database instead of asking it.
--
-- ── WHY A NEW FILE AND NOT AN EDIT ──────────────────────────────────────────
-- Red line 6: a committed migration is never altered, whatever the defect.
-- 0546 is committed; this file replaces the function body.
--
-- ── THE FIX, AND WHAT IT DOES NOT CHANGE ───────────────────────────────────
-- `coalesce(array_length(v_want, 1), 0)` is compared instead, so an empty set
-- compares 0 against 0 and passes, while a genuinely repeated Unit still
-- compares 2 against 1 and is still refused. The 50-Unit ceiling reads the
-- same coalesced count, which also stops `NULL > 50` quietly meaning "no
-- ceiling applies" for anyone who later reorders these guards.
--
-- NOTHING ELSE IN THE BODY MOVES. Same guards, same lock order (request FOR
-- SHARE → demand FOR UPDATE → unit FOR UPDATE inside the draw), same
-- release-then-draw sequence, same optimistic check, same event row, same
-- return shape. The diff against 0546 is the two counts.

-- ───────────────────────────────────────────────────────────────────────────
-- THE SAVE DOOR, WITH AN EMPTY SET ALLOWED THROUGH ITS OWN GUARD
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.purchasing_allocate_ready_units(
  p_demand_id uuid,
  p_item_ids  uuid[],
  p_expected_item_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role    text := (select public.app_role());
  v_demand  record;
  v_req     record;
  v_want    uuid[] := coalesce(p_item_ids, '{}'::uuid[]);
  v_count   int    := coalesce(array_length(coalesce(p_item_ids, '{}'::uuid[]), 1), 0);
  v_have    uuid[];
  v_add     uuid[];
  v_drop    uuid[];
  v_item    uuid;
  v_drawn   uuid;
  v_state   text;
  v_word    text;
  v_detail  text;
begin
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden' using errcode = '42501',
      detail = 'the stock register is an operation surface';
  end if;
  -- 0547: the COALESCED count, so an empty set is 0 rather than NULL here too.
  if v_count > 50 then
    raise exception 'too_many_units' using errcode = '22023',
      detail = 'choose at most 50 Units in one act';
  end if;
  -- A repeated Unit in one save would draw it twice and count it twice.
  -- 0547: compared as 0 against 0 when the set is empty. Removing every Unit
  -- is the act that frees a line and it is never a duplicate of anything.
  if v_count is distinct from
     (select count(distinct u)::int from unnest(v_want) u) then
    raise exception 'duplicate_unit_chosen' using errcode = '22023';
  end if;

  -- ── LOCK ORDER: request → demand → unit (the issue door's own order) ────
  select d.id, d.request_id, d.sku, d.qty, d.approved_qty, d.issued_qty, d.cancelled_at
    into v_demand
    from purchase_demands d
   where d.id = p_demand_id;
  if not found then
    raise exception 'mpr_line_not_found' using errcode = '22023';
  end if;
  if v_demand.request_id is null then
    raise exception 'mpr_line_has_no_request' using errcode = '22023';
  end if;

  select r.id, r.req_no, r.approved_at, r.refused_at, r.withdrawn_at,
         r.sent_back_at, r.fulfilment_intent, r.round
    into v_req
    from purchase_requests r
   where r.id = v_demand.request_id
     for share;
  if not found then
    raise exception 'mpr_line_has_no_request' using errcode = '22023';
  end if;
  if v_req.approved_at is null
     or v_req.refused_at is not null
     or v_req.withdrawn_at is not null
     or v_req.sent_back_at is not null then
    raise exception 'request_not_approved' using errcode = '22023';
  end if;
  if v_req.fulfilment_intent is distinct from 'concrete_need' then
    raise exception 'request_not_a_concrete_need' using errcode = '22023';
  end if;
  if v_req.req_no is null then
    -- Every Unit taken from the pool is committed to a named reference
    -- (`ref_required`). A request minted before 0546 has no number, so it has
    -- nothing honest to commit to — and inventing one here would put a
    -- fabricated document number in the stock ledger for ever.
    raise exception 'request_has_no_number' using errcode = '22023';
  end if;

  -- Re-read the line under its own lock, AFTER the request lock.
  select d.id, d.request_id, d.sku, d.qty, d.approved_qty, d.issued_qty, d.cancelled_at
    into v_demand
    from purchase_demands d
   where d.id = p_demand_id
     for update;
  if v_demand.cancelled_at is not null then
    raise exception 'mpr_line_not_going_ahead' using errcode = '22023';
  end if;

  select coalesce(array_agg(i.id order by i.id), '{}'::uuid[])
    into v_have
    from ops_stock_items i
   where i.reserved_purchase_demand_id = p_demand_id
     and i.status in ('reserved', 'sold');

  -- ⭐ THE CONCURRENCY CHECK. The browser says which saved set it was editing.
  -- If somebody else moved the line since, the save is refused whole and the
  -- operator's own choices survive on screen to be re-judged.
  if p_expected_item_ids is not null then
    if (select coalesce(array_agg(x order by x), '{}'::uuid[])
          from unnest(p_expected_item_ids) x)
       is distinct from v_have then
      raise exception 'stock_selection_changed' using errcode = '40001';
    end if;
  end if;

  select coalesce(array_agg(w), '{}'::uuid[]) into v_add
    from unnest(v_want) w where not (w = any(v_have));
  select coalesce(array_agg(h), '{}'::uuid[]) into v_drop
    from unnest(v_have) h where not (h = any(v_want));

  -- RELEASE FIRST. A replacement that frees one Unit to take another must not
  -- be refused by its own outgoing choice still holding the requirement.
  foreach v_item in array v_drop loop
    if public.ops_stock_release(v_item) is null then
      -- Sold, delivered or already released by somebody else: the whole save
      -- is refused rather than leaving half a replacement standing.
      raise exception 'unit_cannot_be_released' using errcode = '22023',
        detail = 'that Unit is no longer held for this purchase · unit_id=' || v_item::text;
    end if;
  end loop;

  foreach v_item in array v_add loop
    begin
      v_drawn := public.ops_stock_pool_draw(
        p_ref                => v_req.req_no,
        -- The ledger's own word for stock taken INSTEAD of raising a purchase
        -- order — exactly what this act means (P13, 0322).
        p_reason             => 'used_instead_of_ordering',
        p_note               => 'Manual Purchase · ' || v_req.req_no,
        p_item_id            => v_item,
        p_sku                => null,
        p_condition          => null,
        p_wh                 => null,
        p_order_line_id      => null,
        p_purchase_demand_id => p_demand_id
      );
    exception when others then
      get stacked diagnostics
        v_state  = returned_sqlstate,
        v_word   = message_text,
        v_detail = pg_exception_detail;
      raise exception using
        errcode = v_state,
        message = v_word,
        detail  = coalesce(nullif(v_detail, '') || ' · ', '') || 'unit_id=' || v_item::text;
    end;
    if v_drawn is null then
      raise exception 'unit_no_longer_free' using errcode = '40001',
        detail = 'someone else took that Unit · unit_id=' || v_item::text;
    end if;
  end loop;

  if array_length(v_add, 1) > 0 or array_length(v_drop, 1) > 0 then
    insert into purchase_request_events (request_id, round, kind, actor_id, changes)
    values (v_req.id, v_req.round, 'stock_allocated', auth.uid(),
            jsonb_build_object(
              'demand_id', p_demand_id,
              'sku', v_demand.sku,
              'added', to_jsonb(v_add),
              'removed', to_jsonb(v_drop),
              'reserved', to_jsonb(v_want)));
  end if;

  return jsonb_build_object(
    'demandId', p_demand_id,
    'reference', v_req.req_no,
    'reserved', v_count,
    'added', coalesce(array_length(v_add, 1), 0),
    'removed', coalesce(array_length(v_drop, 1), 0),
    'unitIds', to_jsonb(v_want),
    'remainingQty', public.purchasing_mpr_line_remaining_requirement(p_demand_id));
end;
$function$;

revoke all on function public.purchasing_allocate_ready_units(uuid, uuid[], uuid[])
  from public, anon;
grant execute on function public.purchasing_allocate_ready_units(uuid, uuid[], uuid[])
  to authenticated;

comment on function public.purchasing_allocate_ready_units(uuid, uuid[], uuid[]) is
  '0547 — 0546''s save door with its duplicate-Unit guard fixed. It receives the COMPLETE desired set for one MPR line and reconciles: releases every Unit that left it, draws every Unit that joined it, in one transaction, all or none — INCLUDING AN EMPTY SET, which releases everything and is the act the owner ruling calls "removing every selected Unit". 0546 compared array_length(arr, 1), which is NULL rather than 0 on an empty array, so that act refused itself as duplicate_unit_chosen; the count is coalesced to 0 here. Everything else is 0546''s body unchanged: every guard, ledger row and audit row is still ops_stock_pool_draw''s and ops_stock_release''s, and p_expected_item_ids is still the optimistic check that refuses a save whose view of the line has moved.';

-- ───────────────────────────────────────────────────────────────────────────
-- SANITY — shape only. This file owns a function; it walks past every row.
-- ───────────────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_args text;
begin
  select pg_get_function_identity_arguments(p.oid) into v_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'purchasing_allocate_ready_units';
  if v_args is null then
    raise exception '0547 sanity: purchasing_allocate_ready_units is missing';
  end if;
  if v_args <> 'p_demand_id uuid, p_item_ids uuid[], p_expected_item_ids uuid[]' then
    raise exception '0547 sanity: unexpected signature (%)', v_args;
  end if;
  -- The defect itself: the body must no longer compare a bare array_length
  -- against the distinct count.
  if exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'purchasing_allocate_ready_units'
       and p.prosrc like '%array_length(v_want, 1) is distinct from%'
  ) then
    raise exception '0547 sanity: the empty-set duplicate guard is still in place';
  end if;
end
$sanity$;
