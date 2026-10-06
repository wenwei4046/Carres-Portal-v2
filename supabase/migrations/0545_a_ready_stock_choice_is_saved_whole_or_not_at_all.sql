-- 0545_a_ready_stock_choice_is_saved_whole_or_not_at_all.sql
--
-- ⭐ CHANGING A READY STOCK CHOICE IS ONE ACT — owner ruling 2026-09-18
-- (`docs/purchasing/MASTER.md` §9.1; `docs/ui/MASTER.md` §6.8).
--
-- 0471/0473 gave `Choose Ready Unit` its atomic ADD: every chosen Unit or none.
-- The approved journey needs the other half. After the first save the operator
-- reopens the saved set with `Change selection`, ticks and unticks freely, and
-- commits a REPLACEMENT with `Save changes` — which may add Units, give Units
-- back, or give every Unit back.
--
-- ── WHY THIS IS ONE DOOR AND NOT TWO CALLS ──────────────────────────────────
--
-- A browser that released three Units and then reserved three others makes SIX
-- acts out of one decision. Every gap between them is a race, and a refusal in
-- the middle leaves the customer's line half-answered — stock given back with
-- nothing put in its place, and no sentence that is true of what happened. The
-- owner's ruling is explicit: *"Any refusal saves nothing and preserves the
-- draft. Do not implement this as sequential partial releases and
-- reservations."* So the difference is computed and applied inside ONE
-- transaction, and a refusal aborts all of it.
--
-- ── WHAT THIS DOOR DECIDES: NOTHING ─────────────────────────────────────────
--
-- ERP Architecture Law C — a door, never a duplicate. Every guard, every ledger
-- row and every audit line stays with the two governed writers this delegates
-- to:
--
--   RELEASE   `ops_stock_release` (0137 · 0471 · 0500) — clears the binding and
--             the reference, keeps `ref_history`, writes `audit_log` and
--             `ops_activity_log`. `ops_stock_pool_usage` is NOT rewound: it
--             counts the DECISION and is append-only by law (0292).
--   ADD       `so_batch_reserve_ready_units` (0471 · 0473), which is itself the
--             atomic loop over `ops_stock_pool_draw` — the one draw door, with
--             the line/goods/availability/remaining-requirement guards and the
--             `unit_id=<uuid>` detail that names the Unit a refusal is about.
--
-- ── RELEASES RUN FIRST, AND THAT IS LOAD-BEARING ────────────────────────────
--
-- Swapping Unit A for Unit B on a one-piece line is the ordinary case. Drawing
-- B before releasing A meets `line_already_covered` — A is still answering the
-- line — so the whole act would be refused for doing exactly what was asked.
-- Releasing first returns the requirement, and the draw then measures the line
-- the operator actually meant.
--
-- ── A UNIT THAT HAS LEFT THE SHELF IS NOT TAKEN BACK ────────────────────────
--
-- `ops_stock_release` only moves a `reserved` row. A `sold` Unit is bound to
-- this line and is gone — delivered goods are not un-chosen by a picker — so
-- dropping one from the set is refused BY NAME rather than silently ignored,
-- which would make the screen disagree with the shelf.

begin;

create or replace function public.so_batch_save_ready_units(
  p_ref       text,
  p_reason    text,
  p_note      text,
  p_order_id  uuid,
  p_line      uuid,
  p_item_ids  jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role     text := (select public.app_role());
  v_wanted   uuid[];
  v_id       uuid;
  v_status   text;
  v_released int := 0;
  v_added    int := 0;
  v_picks    jsonb := '[]'::jsonb;
  v_result   jsonb;
  v_units    jsonb := '[]'::jsonb;
begin
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden' using errcode = '42501',
      detail = 'the stock register is an operation surface';
  end if;
  if jsonb_typeof(p_item_ids) <> 'array' then
    raise exception 'invalid_param' using errcode = '22023',
      detail = 'the chosen set is an array of Unit ids';
  end if;
  if jsonb_array_length(p_item_ids) > 50 then
    raise exception 'too_many_units' using errcode = '22023',
      detail = 'choose at most 50 Units in one act';
  end if;

  -- THE LINE MUST BE THIS ORDER'S. The draw door checks the line against the
  -- REFERENCE; the release half has no reference to check, so the caller's own
  -- claim is verified here before anything moves.
  if not exists (
    select 1 from order_lines l where l.id = p_line and l.order_id = p_order_id
  ) then
    raise exception 'order_line_not_in_order' using errcode = '22023',
      detail = 'that item line is not on this Sales Order';
  end if;

  select coalesce(array_agg(distinct (e #>> '{}')::uuid), '{}'::uuid[])
    into v_wanted
    from jsonb_array_elements(p_item_ids) e;

  -- ── 1 · GIVE BACK WHAT THE REPLACEMENT DROPS ──────────────────────────────
  --
  -- `for update` so the set cannot change under the difference: a Unit someone
  -- else is releasing right now must not be counted twice.
  for v_id, v_status in
    select i.id, i.status
      from ops_stock_items i
     where i.reserved_order_line_id = p_line
       and i.status in ('reserved','sold')
       and not (i.id = any(v_wanted))
     order by i.id
     for update
  loop
    if v_status <> 'reserved' then
      raise exception 'unit_cannot_be_released' using errcode = '22023',
        detail = 'that Unit has already left the shelf · unit_id=' || v_id::text;
    end if;
    if public.ops_stock_release(v_id) is null then
      -- The row moved between the read and the write. A confirmed refusal, and
      -- the whole act rolls back with it.
      raise exception 'unit_not_reserved_here' using errcode = '40001',
        detail = 'that Unit is no longer reserved to this item line · unit_id=' || v_id::text;
    end if;
    v_released := v_released + 1;
  end loop;

  -- ── 2 · TAKE WHAT THE REPLACEMENT ADDS ────────────────────────────────────
  --
  -- Only Units this line does not already hold; re-drawing one it holds would
  -- meet `unit_no_longer_free` for a Unit the operator never touched.
  select coalesce(
           jsonb_agg(jsonb_build_object('itemId', w, 'orderLineId', p_line)
                     order by w),
           '[]'::jsonb)
    into v_picks
    from unnest(v_wanted) w
   where not exists (
     select 1 from ops_stock_items i
      where i.id = w
        and i.reserved_order_line_id = p_line
        and i.status in ('reserved','sold')
   );

  if jsonb_array_length(v_picks) > 0 then
    -- THE ADD IS THE EXISTING ATOMIC DOOR, unchanged. It raises the draw door's
    -- own refusal, SQLSTATE and word intact, with `unit_id=<uuid>` in DETAIL.
    v_result := public.so_batch_reserve_ready_units(p_ref, p_reason, p_note, v_picks);
    v_added := coalesce((v_result ->> 'reserved')::int, 0);
  end if;

  -- ── 3 · WHAT THE LINE NOW STANDS AT, READ BACK RATHER THAN COUNTED ────────
  select coalesce(
           jsonb_agg(jsonb_build_object('itemId', i.id, 'orderLineId', p_line)
                     order by i.id),
           '[]'::jsonb)
    into v_units
    from ops_stock_items i
   where i.reserved_order_line_id = p_line
     and i.status in ('reserved','sold');

  return jsonb_build_object(
    'reserved', jsonb_array_length(v_units),
    'added',    v_added,
    'released', v_released,
    'reference', p_ref,
    'units',    v_units
  );
end;
$function$;

revoke all on function public.so_batch_save_ready_units(text, text, text, uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.so_batch_save_ready_units(text, text, text, uuid, uuid, jsonb)
  to authenticated;

comment on function public.so_batch_save_ready_units(text, text, text, uuid, uuid, jsonb) is
  '0545 — SO Batch Purchase''s `Save changes`: the COMPLETE chosen set for ONE Sales Order item line, applied as a replacement in ONE transaction. Releases what the set drops through `ops_stock_release`, then adds what it gains through `so_batch_reserve_ready_units` (itself the atomic loop over `ops_stock_pool_draw`). Decides nothing of its own; an empty set is the governed instruction to give every Unit back, and any refusal rolls the whole act back.';

-- ─── sanity — the shape, not the data ───────────────────────────────────────

do $sanity$
declare
  v_fn int;
begin
  select count(*) into v_fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'so_batch_save_ready_units';
  if v_fn <> 1 then
    raise exception '0545 sanity: expected exactly one save door, found %', v_fn;
  end if;
  if to_regprocedure('public.ops_stock_release(uuid)') is null then
    raise exception '0545 sanity: the governed release door is missing';
  end if;
  if to_regprocedure('public.so_batch_reserve_ready_units(text, text, text, jsonb)') is null then
    raise exception '0545 sanity: the governed atomic add door is missing';
  end if;
end
$sanity$;

commit;
