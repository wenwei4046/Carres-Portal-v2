-- =============================================================================
-- 0609_goods_on_a_sent_po_can_move_to_another_deliver_to.sql
-- Purchasing MASTER §5.4 `Change Deliver To` — APPROVED TARGET (Jess,
-- 2026-09-22), build boundary owner-confirmed 2026-09-25, build "go"
-- 2026-09-29.
--
-- WHAT WAS MISSING (measured on production 2026-09-29):
--   · `purchasing_revise_po` (0443) changes a WHOLE line's quantity or Deliver
--     To. It cannot split a line, so moving 2 of 6 meant moving all 6 or
--     opening a second PO — both forbidden by §5.4.
--   · `po_lines_sku_attrs_uniq` (0076) allows ONE line per (PO, SKU, attrs).
--     Two lines of the same item going to two places could not exist.
--   · `trg_stock_unit_identity_permanence` (0442) forbids a Unit from ever
--     changing its PO line, so exact Units could not follow the moved goods.
--
-- WHAT THIS FILE DOES
--   §1 The duplicate guard becomes one line per (PO, SKU, attrs, Deliver To).
--      The old index is replaced, not loosened: the same item to the same
--      place on one PO is still refused.
--   §2 The Unit permanence trigger keeps every rule, with ONE exception: a
--      Unit still `incoming` may move to another line of the SAME PO while
--      the transaction flag `carres.po_line_move` is set. Only §3 sets it.
--      The Unit keeps its ID, status, site and reservation.
--   §3 `purchasing_change_po_deliver_to(po, line, qty, deliver_to, reason,
--      unit_codes)` — one transaction on the SAME PO:
--        · refuses unless the reason is given, the PO is open, the line is on
--          it, the new Deliver To is active and different, and
--          1 <= qty <= ordered − received;
--        · exact-unit goods move by Unit: the given Unit IDs, or the line's
--          last n incoming IDs when none are given;
--        · snapshots the prior version into po_revisions (0312 shape, the
--          same one purchasing_revise_po writes, so the send comparison keeps
--          one spelling of the document);
--        · the whole line moving just changes its Deliver To; part of it
--          lowers the line and adds the moved qty to the line of the same
--          item already going there, or a new line copied from it;
--        · the Units bind to that line; a Unit reserved for a Sales Order
--          line (0600) keeps that reservation; customer lineage
--          (po_line_sources) for the rest moves newest first, never more
--          than the moved qty, so the demand is covered once;
--        · bumps the version, writes po_history, audit_log and one
--          stock_unit_events row per Unit (`line_moved` when it changes
--          line, `deliver_to_changed` when its whole line moves).
--      The total quantity of the PO never changes.
--   §4 Retires 0311's `purchasing_split_line_destination` (by grant): it
--      split a line without its Units, lineage or a version.
--
-- DELIBERATELY NOT HERE
--   · purchasing_revise_po (0443/0364) is untouched.
--   · Unit site (warehouse_id) is untouched: Receiving records the actual
--     site when goods arrive (owner instruction 2026-09-04).
--   · The prior version's PDF and po_sends rows are untouched; the new
--     version enters the normal send journey.
--   · No row is rewritten. RLS unchanged. NO ROW COUNT IS ASSERTED.
-- =============================================================================

-- ── §1 · one line per item per Deliver To ────────────────────────────────────

create unique index if not exists po_lines_sku_attrs_destination_uniq
  on public.purchase_order_lines
     (po_id, sku, (coalesce(attrs::text, '')), (coalesce(destination_id::text, '')));

comment on index public.po_lines_sku_attrs_destination_uniq is
  '0609 · Purchasing §5.4: the same (PO, SKU, attrs) may appear once per Deliver To, so part of a line can move to another destination on the SAME PO. Replaces 0076 po_lines_sku_attrs_uniq.';

drop index if exists public.po_lines_sku_attrs_uniq;

-- ── §2 · a Unit may follow its goods to another line of the same PO ─────────

create or replace function public.trg_stock_unit_identity_permanence()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception
      'unit % (%) is a permanent record — end its lifecycle, never delete it',
      old.unit_code, old.id
      using errcode = 'P0001', detail = 'unit_never_deleted';
  end if;

  if new.unit_code is distinct from old.unit_code then
    raise exception
      'unit % cannot be renamed to % — a replacement label keeps the original id',
      old.unit_code, new.unit_code
      using errcode = 'P0001', detail = 'unit_code_immutable';
  end if;

  -- 0442 · once a Unit knows its line it never changes its mind.
  -- 0609 · except goods still at the supplier moving to another line of the
  -- SAME PO through `Change Deliver To` (the only writer of the flag).
  if old.po_line_id is not null and new.po_line_id is distinct from old.po_line_id then
    if not (
      coalesce(current_setting('carres.po_line_move', true), '') = 'true'
      and old.status = 'incoming'
      and new.status = 'incoming'
      and new.po_line_id is not null
      and (select l.po_id from purchase_order_lines l where l.id = new.po_line_id)
          = (select l.po_id from purchase_order_lines l where l.id = old.po_line_id)
    ) then
      raise exception
        'unit % is bound to PO line % for life',
        old.unit_code, old.po_line_id
        using errcode = 'P0001', detail = 'unit_line_immutable';
    end if;
  end if;

  if new.identity_scope is distinct from old.identity_scope then
    raise exception
      'unit % cannot change between a Unit ID and a quantity row',
      old.unit_code
      using errcode = 'P0001', detail = 'unit_scope_immutable';
  end if;

  return new;
end;
$function$;

-- ── §3 · the door ────────────────────────────────────────────────────────────

create or replace function public.purchasing_change_po_deliver_to(
  p_po_id          text,
  p_line_id        uuid,
  p_qty            integer,
  p_destination_id uuid,
  p_reason         text,
  p_unit_codes     text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role       app_role;
  v_uid        uuid;
  v_actor      text;
  v_reason     text;
  v_po         purchase_orders;
  v_line       purchase_order_lines;
  v_target     purchase_order_lines;
  v_target_id  uuid;
  v_from_dest  uuid;
  v_from_name  text;
  v_to_name    text;
  v_item       text;
  v_open       integer;
  v_by_unit    boolean;
  v_units      uuid[];
  v_unit_codes text[];
  v_n          integer;
  v_snap       jsonb;
  v_last_rev   integer;
  v_rev_no     integer;
  v_version    integer;
  v_line_dest  uuid;
  v_src        record;
  v_take       integer;
  v_left       integer;
  v_moved_so   jsonb := '[]'::jsonb;
  v_whole      boolean;
begin
  v_role := public.purchasing_supplier_call_gate();
  v_uid  := auth.uid();

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'A Deliver To change must say why'
      using errcode = '22023', detail = 'reason_required';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO % not found', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;
  if v_po.status <> 'open' then
    raise exception 'PO % is %, not open', p_po_id, v_po.status
      using errcode = '22023', detail = 'po_not_open';
  end if;

  select * into v_line from purchase_order_lines
   where id = p_line_id and po_id = p_po_id
   for update;
  if not found then
    raise exception 'PO line % is not on %', p_line_id, p_po_id
      using errcode = '22023', detail = 'po_line_not_found';
  end if;

  if p_destination_id is null or not exists (
    select 1 from purchasing_destinations d where d.id = p_destination_id and d.active
  ) then
    raise exception 'The new Deliver To is not an open destination'
      using errcode = 'P0001', detail = 'deliver_to_closed';
  end if;

  v_from_dest := coalesce(v_line.destination_id, v_po.destination_id);
  if v_from_dest is not distinct from p_destination_id then
    raise exception 'These goods already go to that Deliver To'
      using errcode = '22023', detail = 'same_destination';
  end if;

  -- Only what the supplier has not delivered yet can move (§5.4). A fully
  -- received line reads `All received · use a transfer instead`.
  v_open := v_line.qty - v_line.received_qty;
  if v_open <= 0 then
    raise exception 'All % on this line is received', v_line.sku
      using errcode = 'P0001', detail = 'all_received';
  end if;
  if p_qty is null or p_qty < 1 or p_qty > v_open then
    raise exception 'Qty to move must be 1 to % (asked for %)', v_open, p_qty
      using errcode = '22023', detail = 'qty_out_of_range';
  end if;

  select coalesce(pm.name || ' · ' || ps.variant, pm.name, v_line.sku)
    into v_item
    from (select 1) k
    left join product_skus ps on ps.sku = v_line.sku
    left join product_models pm on pm.id = ps.model_id;
  v_item := coalesce(v_item, v_line.sku);
  select name into v_from_name from purchasing_destinations where id = v_from_dest;
  select name into v_to_name   from purchasing_destinations where id = p_destination_id;

  -- ── Units: exact-unit goods move by Unit (§5.4, §6.2 — never voided, never
  --    minted). A line with incoming Units moves them even if its mode is an
  --    older unset one, so the line and its Units never disagree.
  v_by_unit := v_line.identity_mode = 'exact_unit'
    or exists (select 1 from ops_stock_items i
                where i.po_line_id = v_line.id and i.status = 'incoming');

  if v_by_unit then
    if p_unit_codes is null or cardinality(p_unit_codes) = 0 then
      -- The planner's rule (2026-09-25): the system pre-selects the line's
      -- last n IDs; the screen may send another choice.
      select array_agg(id order by created_at desc, unit_code desc)
        into v_units
        from (select i.id, i.created_at, i.unit_code
                from ops_stock_items i
               where i.po_line_id = v_line.id and i.status = 'incoming'
               order by i.created_at desc, i.unit_code desc
               limit p_qty) t;
    else
      if (select count(distinct c) from unnest(p_unit_codes) c) <> cardinality(p_unit_codes) then
        raise exception 'A Unit ID is chosen twice'
          using errcode = '22023', detail = 'unit_chosen_twice';
      end if;
      select array_agg(i.id) into v_units
        from ops_stock_items i
       where i.unit_code = any(p_unit_codes)
         and i.po_line_id = v_line.id
         and i.status = 'incoming';
    end if;

    v_n := coalesce(cardinality(v_units), 0);
    if p_unit_codes is not null and cardinality(p_unit_codes) > 0 and v_n <> cardinality(p_unit_codes) then
      raise exception 'A chosen Unit ID is not waiting on this line'
        using errcode = '22023', detail = 'unit_not_on_line';
    end if;
    if v_n <> p_qty then
      raise exception 'Choose % Unit IDs (% chosen)', p_qty, v_n
        using errcode = '22023', detail = 'unit_count_mismatch';
    end if;

    select array_agg(unit_code order by unit_code) into v_unit_codes
      from ops_stock_items where id = any(v_units);
  end if;

  -- ── Where the moved goods land: the whole line just changes its Deliver To;
  --    part of it joins the line of the same item already going there, or a
  --    new line copied from this one.
  v_line_dest := case when p_destination_id = v_po.destination_id then null
                      else p_destination_id end;

  select * into v_target from purchase_order_lines l
   where l.po_id = p_po_id
     and l.id <> v_line.id
     and l.sku = v_line.sku
     and coalesce(l.attrs::text, '') = coalesce(v_line.attrs::text, '')
     and coalesce(l.destination_id, v_po.destination_id) = p_destination_id
   for update;

  v_whole := (p_qty = v_line.qty);

  if v_whole and v_target.id is not null then
    -- A line cannot be emptied (qty > 0) and is never deleted, so the whole
    -- line cannot fold into a sibling. Move one less, or change the sibling.
    raise exception '% already has a line going to %', v_item, v_to_name
      using errcode = 'P0001', detail = 'deliver_to_line_exists';
  end if;

  -- ── Snapshot the PRIOR version before any write (0312 shape).
  select jsonb_build_object(
           'eta_date',       v_po.eta_date,
           'destination_id', v_po.destination_id,
           'lines', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'sku', l.sku, 'qty', l.qty, 'destination_id', l.destination_id
                    ) order by l.sku, l.id)
               from purchase_order_lines l where l.po_id = p_po_id), '[]'::jsonb)
         ) into v_snap;

  select coalesce(max(rev_no), 0) into v_last_rev
    from po_revisions where po_id = p_po_id;
  insert into po_revisions (po_id, rev_no, snapshot, reason, created_by)
  values (p_po_id, v_last_rev + 1, v_snap, v_reason, v_uid)
  returning rev_no into v_rev_no;

  -- Both flags are transaction-local. `carres.po_revise` lets the line writes
  -- through the sent-PO guard; `carres.po_line_move` lets the Units follow.
  perform set_config('carres.po_revise', 'true', true);
  perform set_config('carres.po_line_move', 'true', true);

  if v_whole then
    update purchase_order_lines
       set destination_id = v_line_dest
     where id = v_line.id;
    v_target_id := v_line.id;
  else
    update purchase_order_lines
       set qty = qty - p_qty
     where id = v_line.id;

    if v_target.id is not null then
      update purchase_order_lines
         set qty = qty + p_qty
       where id = v_target.id;
      v_target_id := v_target.id;
    else
      insert into purchase_order_lines
        (po_id, sku, qty, received_qty, cost, cost_source, attrs,
         damaged_qty, wrong_item_qty, purchase_request_id, destination_id,
         ops_remark, commercial_treatment, commercial_reason, demand_id,
         identity_mode)
      values
        (p_po_id, v_line.sku, p_qty, 0, v_line.cost, v_line.cost_source, v_line.attrs,
         0, 0, null, v_line_dest,
         v_line.ops_remark, v_line.commercial_treatment, v_line.commercial_reason,
         v_line.demand_id, v_line.identity_mode)
      returning id into v_target_id;
    end if;

    -- ── Units follow the goods.
    if v_by_unit then
      update ops_stock_items
         set po_line_id = v_target_id, updated_at = now()
       where id = any(v_units);

      insert into stock_unit_events
        (unit_id, unit_code, event, from_value, to_value, note, actor_id)
      select i.id, i.unit_code, 'line_moved', v_line.id::text, v_target_id::text,
             format('Deliver To %s to %s. %s', coalesce(v_from_name, 'Not recorded'), v_to_name, v_reason),
             v_uid
        from ops_stock_items i where i.id = any(v_units);
    end if;

    -- ── Customer lineage follows, covered once. A Unit already reserved for a
    --    Sales Order line (0600) carries its own allocation with it; the rest
    --    of the moved qty takes the line's lineage newest first, never more
    --    than it. Coverage across the PO is unchanged by construction.
    v_left := p_qty;
    if v_by_unit then
      v_left := p_qty - (select count(*)::int from ops_stock_items i
                          where i.id = any(v_units)
                            and i.reserved_order_line_id is not null);
    end if;

    for v_src in
      select * from po_line_sources s
       where s.po_line_id = v_line.id
       order by s.created_at desc, s.id desc
       for update
    loop
      exit when v_left <= 0;
      v_take := least(v_left, v_src.qty);
      perform public._po_line_source_move(v_src.id, v_target_id, v_take);
      v_moved_so := v_moved_so || jsonb_build_array(jsonb_build_object('so', v_src.so, 'qty', v_take));
      v_left := v_left - v_take;
    end loop;
  end if;

  if v_whole and v_by_unit then
    insert into stock_unit_events
      (unit_id, unit_code, event, from_value, to_value, note, actor_id)
    select i.id, i.unit_code, 'deliver_to_changed', v_from_dest::text, p_destination_id::text,
           format('Deliver To %s to %s. %s', coalesce(v_from_name, 'Not recorded'), v_to_name, v_reason),
           v_uid
      from ops_stock_items i where i.id = any(v_units);
  end if;

  v_version := coalesce(v_po.version, 1) + 1;
  update purchase_orders
     set version = v_version,
         revised_at = now(),
         updated_at = now()
   where id = p_po_id;

  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));

  insert into po_history (po_id, text, by_role, by_user_id)
  values (p_po_id,
          format('Version %s: %s %s moved from %s to %s. Total unchanged. Reason: %s',
                 v_version, p_qty, v_item, coalesce(v_from_name, 'Not recorded'),
                 v_to_name, v_reason),
          v_role, v_uid);
  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('PO %s Change Deliver To, Version %s', p_po_id, v_version),
          p_po_id);

  return jsonb_build_object(
    'po_id',      p_po_id,
    'version',    v_version,
    'rev_no',     v_rev_no,
    'from_line',  v_line.id,
    'to_line',    v_target_id,
    'qty',        p_qty,
    'unit_codes', to_jsonb(coalesce(v_unit_codes, '{}'::text[])),
    'sales_orders', v_moved_so
  );
end;
$function$;

-- A source row moves whole (UPDATE of its line) or splits (decrement +
-- insert), so no lineage row is ever deleted. Internal helper: no grant.
create or replace function public._po_line_source_move(
  p_source_id uuid,
  p_to_line   uuid,
  p_qty       integer
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_src po_line_sources;
begin
  select * into v_src from po_line_sources where id = p_source_id for update;
  if p_qty >= v_src.qty then
    update po_line_sources set po_line_id = p_to_line where id = p_source_id;
  else
    update po_line_sources set qty = qty - p_qty where id = p_source_id;
    insert into po_line_sources (po_id, po_line_id, sku, order_id, so, order_line_id, qty, created_at)
    values (v_src.po_id, p_to_line, v_src.sku, v_src.order_id, v_src.so, v_src.order_line_id,
            p_qty, v_src.created_at);
  end if;
end;
$function$;

revoke all on function public._po_line_source_move(uuid, uuid, integer) from public, anon, authenticated;

revoke all on function public.purchasing_change_po_deliver_to(text, uuid, integer, uuid, text, text[]) from public, anon;
grant execute on function public.purchasing_change_po_deliver_to(text, uuid, integer, uuid, text, text[]) to authenticated;

comment on function public.purchasing_change_po_deliver_to(text, uuid, integer, uuid, text, text[]) is
  '0609 · Purchasing §5.4 Change Deliver To: moves part or all of one line''s undelivered qty to another active Deliver To on the SAME PO, as the next version. Exact Units keep their IDs and rebind; po_line_sources follow; total qty unchanged; prior version snapshotted.';

-- ── §4 · the old split door is retired ──────────────────────────────────────
-- 0311 `purchasing_split_line_destination` split a line without moving its
-- Units or Sales Order lineage and without a version. It always failed on the
-- 0076 index (same SKU twice on one PO); with §1 it would succeed and leave
-- Units on the wrong line. No screen calls it; the API route is removed in the
-- same change. Retired by grant, not dropped: the body stays for the record.
revoke all on function public.purchasing_split_line_destination(uuid, integer, uuid)
  from public, anon, authenticated;

-- SANITY — the new guard exists, the old one is gone, the door has one overload.
do $sanity$
declare v_n int;
begin
  if to_regclass('public.po_lines_sku_attrs_destination_uniq') is null then
    raise exception '0609 sanity: po_lines_sku_attrs_destination_uniq missing';
  end if;
  if to_regclass('public.po_lines_sku_attrs_uniq') is not null then
    raise exception '0609 sanity: po_lines_sku_attrs_uniq still present';
  end if;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'purchasing_change_po_deliver_to';
  if v_n <> 1 then
    raise exception '0609 sanity: purchasing_change_po_deliver_to must have one overload, found %', v_n;
  end if;
  if has_function_privilege('authenticated',
       'public.purchasing_split_line_destination(uuid, integer, uuid)', 'execute') then
    raise exception '0609 sanity: the retired split door is still callable';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'trg_stock_unit_identity_permanence'
                    and p.prosrc like '%carres.po_line_move%') then
    raise exception '0609 sanity: the Unit permanence trigger does not know the line move';
  end if;
end $sanity$;
