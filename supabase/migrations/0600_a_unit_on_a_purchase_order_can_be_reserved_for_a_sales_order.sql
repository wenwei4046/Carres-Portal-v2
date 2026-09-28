-- =============================================================================
-- 0600_a_unit_on_a_purchase_order_can_be_reserved_for_a_sales_order.sql
-- Purchasing MASTER §9.1 · RESERVE GOODS ALREADY ON A PO (owner ruling
-- 2026-09-28, Jess "yes") · Stock MASTER §4 (the `Use this PO` row).
--
-- WHAT WAS WRONG (measured on production b5e959d6): SO-1358 (Ohana Fenrir
-- King, qty 1) printed `Need PO` · `Already on a PO` · `No purchase needed`
-- and a refused tick on one row. An open PO carried goods of the same kind
-- that no order held, the per-SKU pool netting (`to-order.ts` T6) counted
-- them as this customer's cover, and nothing could tie them to the customer:
-- `ops_stock_pool_draw` (0546) refuses every Unit whose status is not `free`.
-- The operator could neither buy nor reserve.
--
-- THE RULING: goods on an open PO that no order holds may be reserved for a
-- Sales Order line exactly like Ready Stock (Law A — the SAME exact-Unit
-- reservation, owned by Stock). Every furniture Unit is born with its official
-- PO (0443), so the reservation binds that PO's `incoming` Unit ID(s).
--
-- WHAT THIS FILE DOES — the Ready Stock door family learns the incoming case;
-- no second writer is created.
--
--   1  `purchasing_po_line_free_units(po_line)` — the ONE arithmetic for what
--      an open PO line still has that no order holds: its unbound incoming
--      Units, less what customer lineage (`po_line_sources`) still waits for.
--      A line raised for a Manual Purchase that is not `additional_stock`
--      holds its goods for that request and offers nothing.
--      `purchasing_po_free_units()` lists it for every open PO line (the
--      register reads THIS, never its own arithmetic — Law D).
--   2  `so_line_remaining_requirement` counts a bound `incoming` Unit beside
--      the bound reserved/sold ones, so a line can never be over-bound.
--   3  `ops_stock_pool_draw` accepts an `incoming` Unit for a Sales Order
--      line: it sets ONLY `reserved_ref` + `reserved_order_line_id`; status
--      stays `incoming` until Receiving posts (Stock MASTER §4). It writes no
--      `ops_stock_pool_usage` row — nothing left the free pool.
--   4  `ops_stock_release` gives a bound incoming Unit back to its PO's free
--      balance (binding cleared, status stays `incoming`).
--   5  `so_batch_save_ready_units` treats a bound incoming Unit as part of the
--      line's saved set, so `Change selection` can release it.
--   6  `so_batch_use_po_units` — the `Use this PO` door: binds as many of one
--      PO's free incoming Units as the line still needs, all or none, through
--      the draw door.
--   7  A trigger makes Receiving honour the binding in EVERY posting path:
--      a bound Unit that arrives becomes `reserved` for its line instead of
--      `free`; a bound Unit that leaves `incoming` any other way (damaged on
--      arrival, voided by a PO revision or cancel) gives its line back, so the
--      requirement returns to SO Batch Purchase. An unbound receipt stays
--      `free`. A trigger, not five copied receiving bodies: 0560 carries those
--      bodies (500+ lines each) and a copy here would silently revert the next
--      change to them.
--
-- NOT TOUCHED: every view (`stock_unit_availability_v` / register view — the
-- 0588 trap), `unit_availability` (returns `incoming` for an incoming Unit
-- regardless), `issue_actions.owner_rule` (0590). Manual Purchase lines keep
-- drawing free Units only. Quantity-counted goods have no Unit ID and are
-- never offered.
--
-- Every replaced body is carried forward from its latest definition (0471,
-- 0545, 0546), verified identical to production by md5(prosrc) before this
-- file was written. Role gates are unchanged: operation · principal.
--
-- NON-DESTRUCTIVE: no table, column, view or row is dropped, updated or
-- backfilled. Asserts no production row count.
-- =============================================================================

begin;

-- ───────────────────────────────────────────────────────────────────────────
-- 1 · WHAT AN OPEN PO LINE HAS THAT NO ORDER HOLDS
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.purchasing_po_line_free_units(p_po_line_id uuid)
returns int
language sql
stable
set search_path to 'public'
as $function$
  select case
    when pl.id is null or po.status is distinct from 'open' then 0
    -- A Manual Purchase line buys for that request; only a recorded
    -- `additional_stock` request leaves its goods for anyone.
    when pl.purchase_request_id is not null
         and (select r.fulfilment_intent from purchase_requests r
               where r.id = pl.purchase_request_id) is distinct from 'additional_stock'
      then 0
    else greatest(0,
      (select count(*)::int
         from ops_stock_items i
        where i.po_line_id = pl.id
          and i.status = 'incoming'
          and coalesce(i.identity_scope, 'unit') = 'unit'
          and i.reserved_order_line_id is null
          and i.reserved_purchase_demand_id is null)
      -- Customer lineage still waiting: what the line was raised for, less
      -- what has already arrived (a receipt answers its customers first).
      - greatest(0,
          coalesce((select sum(greatest(0, s.qty))::int
                      from po_line_sources s
                     where s.po_line_id = pl.id), 0)
          - coalesce(pl.received_qty, 0)))
  end
  from (select p_po_line_id as id) k
  left join purchase_order_lines pl on pl.id = k.id
  left join purchase_orders po on po.id = pl.po_id;
$function$;

comment on function public.purchasing_po_line_free_units(uuid) is
  '0600 — how many of an OPEN purchase order line''s incoming Unit IDs no order holds: unbound incoming exact Units less the customer lineage (po_line_sources) still waiting for goods. A Manual Purchase line that is not additional_stock holds its goods (0). The ONE arithmetic behind `{PO No} has {n} {Item} available.` and the `Use this PO` door (Law D).';

grant execute on function public.purchasing_po_line_free_units(uuid) to authenticated;

create or replace function public.purchasing_po_free_units()
returns table (po_id text, po_line_id uuid, sku text, free_units int)
language sql
stable
set search_path to 'public'
as $function$
  select pl.po_id, pl.id, pl.sku, public.purchasing_po_line_free_units(pl.id)
    from purchase_order_lines pl
    join purchase_orders po on po.id = pl.po_id
   where po.status = 'open'
     and exists (select 1 from ops_stock_items i
                  where i.po_line_id = pl.id and i.status = 'incoming'
                    and i.reserved_order_line_id is null
                    and i.reserved_purchase_demand_id is null)
     and public.purchasing_po_line_free_units(pl.id) > 0
   order by pl.po_id, pl.id;
$function$;

comment on function public.purchasing_po_free_units() is
  '0600 — every open PO line with incoming Unit IDs no order holds, and how many (purchasing_po_line_free_units). SO Batch Purchase reads this for its `Use this PO` offer; it computes nothing of its own.';

grant execute on function public.purchasing_po_free_units() to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2 · THE ONE SO-LINE REMAINING ARITHMETIC COUNTS A BOUND INCOMING UNIT
-- ───────────────────────────────────────────────────────────────────────────
-- 0471's body; the bound set gains `incoming`.
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
                   and i.status in ('reserved', 'sold', 'incoming')
                   and (p_exclude_item is null or i.id <> p_exclude_item)), 0)
    - coalesce((select sum(greatest(0, s.qty))
                  from po_line_sources s
                  join purchase_orders p on p.id = s.po_id
                 where s.order_line_id = p_order_line_id
                   and p.status <> 'cancelled'), 0)
  );
$function$;

comment on function public.so_line_remaining_requirement(uuid, uuid) is
  '0471/0600 — what a Sales Order item line still needs: ordered quantity less the Units bound to it (reserved, sold, or incoming on a PO by `Use this PO`) less its non-cancelled purchase-order lineage. The same expression SO Batch Purchase prints, so the reservation doors and the Register cannot disagree.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3 · THE ONE DRAW DOOR ACCEPTS AN INCOMING UNIT FOR A SALES ORDER LINE
-- ───────────────────────────────────────────────────────────────────────────
-- 0546's body. Added: the incoming branch (marked 0600). The Manual Purchase
-- branch, the pick-by-SKU path, the reasons, the role gate and every refusal
-- word are unchanged. LOCK ORDER for an incoming Unit: PO line → Unit, the
-- order Receiving takes, so a bind and a receipt queue instead of crossing.
create or replace function public.ops_stock_pool_draw(
  p_ref                text,
  p_reason             text,
  p_note               text default null,
  p_item_id            uuid default null,
  p_sku                text default null,
  p_condition          text default null,
  p_wh                 uuid default null,
  p_order_line_id      uuid default null,
  p_purchase_demand_id uuid default null
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
  v_demand   record;
  v_req      record;
  v_peek     record;
  v_incoming boolean := false;
  v_po_no    text;
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

  -- ── 0546 · A UNIT ANSWERS ONE LINE, AND TWO KINDS OF LINE EXIST ──────────
  if p_order_line_id is not null and p_purchase_demand_id is not null then
    raise exception 'one_binding_only' using errcode = '22023',
      detail = 'a Unit answers a Sales Order line or a Manual Purchase line, never both';
  end if;

  v_so := nullif(substring(v_ref from '^SO-([0-9]+)$'), '')::int;
  v_line_id := p_order_line_id;

  if v_so is not null and v_line_id is null and p_purchase_demand_id is null then
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
      -- 0600 · an incoming Unit's PO line is locked BEFORE the Unit, so its
      -- free balance cannot be spent twice by two binds at once.
      select i.status, i.po_line_id into v_peek
        from ops_stock_items i where i.id = p_item_id;
      if v_peek.status = 'incoming' and v_peek.po_line_id is not null then
        perform 1 from purchase_order_lines pl where pl.id = v_peek.po_line_id for update;
      end if;

      select i.id, i.sku, i.status, i.needs_repair, i.condition, i.identity_scope,
             i.po_line_id, i.po_no, i.reserved_order_line_id, i.reserved_purchase_demand_id
        into v_unit
        from ops_stock_items i
       where i.id = p_item_id
         for update;
      if not found then
        raise exception 'unit_not_found' using errcode = '22023';
      end if;
      if coalesce(v_unit.identity_scope, 'unit') <> 'unit' then
        raise exception 'quantity_row_not_bindable' using errcode = '22023',
          detail = 'counted stock has no Unit identity to commit to one item line';
      end if;
      if public.stock_match_key(v_unit.sku) is distinct from public.stock_match_key(v_line.sku) then
        raise exception 'unit_does_not_match_line' using errcode = '22023',
          detail = 'that Unit is not the goods this item line ordered';
      end if;
      if v_unit.status = 'incoming' then
        -- ── 0600 · GOODS ALREADY ON A PO (owner ruling 2026-09-28) ──────────
        v_incoming := true;
        v_po_no := v_unit.po_no;
        if v_unit.po_line_id is null then
          raise exception 'unit_not_on_a_po' using errcode = '22023',
            detail = 'that incoming Unit belongs to no purchase order line';
        end if;
        if v_unit.reserved_order_line_id is not null
           or v_unit.reserved_purchase_demand_id is not null then
          raise exception 'unit_no_longer_free' using errcode = '40001',
            detail = 'someone else took that Unit';
        end if;
        if coalesce(v_unit.needs_repair, false) then
          raise exception 'unit_not_available' using errcode = '22023',
            detail = 'that Unit is not sound';
        end if;
        if public.purchasing_po_line_free_units(v_unit.po_line_id) <= 0 then
          raise exception 'po_goods_held' using errcode = '22023',
            detail = 'that purchase order''s goods are held for another order';
        end if;
      else
        if v_unit.status <> 'free' then
          raise exception 'unit_no_longer_free' using errcode = '40001',
            detail = 'someone else took that Unit';
        end if;
        if public.unit_availability(v_unit.status, v_unit.needs_repair,
                                    null, v_unit.condition) <> 'available' then
          raise exception 'unit_not_available' using errcode = '22023',
            detail = 'that Unit is not free and sound ready stock';
        end if;
      end if;
    else
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

  -- ── 0546 · THE MANUAL PURCHASE BRANCH ───────────────────────────────────
  if p_purchase_demand_id is not null then
    if p_item_id is null then
      raise exception 'line_needs_exact_unit' using errcode = '22023',
        detail = 'a Manual Purchase line binding names the exact Unit, never a pick-by-SKU';
    end if;
    if v_so is not null then
      raise exception 'mpr_line_needs_request_ref' using errcode = '22023',
        detail = 'a Manual Purchase line is not answered against a Sales Order reference';
    end if;

    select d.id, d.sku, d.qty, d.approved_qty, d.issued_qty, d.cancelled_at, d.request_id
      into v_demand
      from purchase_demands d
     where d.id = p_purchase_demand_id
       for update;
    if not found then
      raise exception 'mpr_line_not_found' using errcode = '22023';
    end if;
    if v_demand.cancelled_at is not null then
      raise exception 'mpr_line_not_going_ahead' using errcode = '22023',
        detail = 'that Manual Purchase line is marked not going ahead';
    end if;
    if v_demand.request_id is null then
      raise exception 'mpr_line_has_no_request' using errcode = '22023',
        detail = 'that purchase line belongs to no Manual Purchase request';
    end if;

    select r.id, r.req_no, r.approved_at, r.refused_at, r.withdrawn_at,
           r.sent_back_at, r.fulfilment_intent
      into v_req
      from purchase_requests r
     where r.id = v_demand.request_id;
    if not found then
      raise exception 'mpr_line_has_no_request' using errcode = '22023';
    end if;
    if v_req.approved_at is null
       or v_req.refused_at is not null
       or v_req.withdrawn_at is not null
       or v_req.sent_back_at is not null then
      raise exception 'request_not_approved' using errcode = '22023',
        detail = 'stock is saved against an approved Manual Purchase only';
    end if;
    if v_req.fulfilment_intent is distinct from 'concrete_need' then
      raise exception 'request_not_a_concrete_need' using errcode = '22023',
        detail = 'existing stock answers a concrete need; it never reduces an additional replenishment';
    end if;
    if v_req.req_no is not null and v_ref is distinct from v_req.req_no then
      raise exception 'mpr_line_needs_request_ref' using errcode = '22023',
        detail = 'the reference must be this Manual Purchase''s own number';
    end if;

    select i.id, i.sku, i.status, i.needs_repair, i.condition, i.identity_scope
      into v_unit
      from ops_stock_items i
     where i.id = p_item_id
       for update;
    if not found then
      raise exception 'unit_not_found' using errcode = '22023';
    end if;
    if coalesce(v_unit.identity_scope, 'unit') <> 'unit' then
      raise exception 'quantity_row_not_bindable' using errcode = '22023',
        detail = 'counted stock has no Unit identity to commit to one purchase line';
    end if;
    if public.stock_match_key(v_unit.sku) is distinct from public.stock_match_key(v_demand.sku) then
      raise exception 'unit_does_not_match_line' using errcode = '22023',
        detail = 'that Unit is not the goods this purchase line asked for';
    end if;
    if v_unit.status <> 'free' then
      raise exception 'unit_no_longer_free' using errcode = '40001',
        detail = 'someone else took that Unit';
    end if;
    if public.unit_availability(v_unit.status, v_unit.needs_repair,
                                null, v_unit.condition) <> 'available' then
      raise exception 'unit_not_available' using errcode = '22023',
        detail = 'that Unit is not free and sound ready stock';
    end if;
    if public.purchasing_mpr_line_remaining_requirement(p_purchase_demand_id, p_item_id) <= 0 then
      raise exception 'mpr_line_already_covered' using errcode = '22023',
        detail = 'that purchase line is already covered by Ready Stock or a purchase order';
    end if;
  end if;

  if v_incoming then
    -- 0600 · ONLY the binding. Status stays `incoming` until Receiving posts;
    -- the arrival trigger below turns it into `reserved` for this line.
    update ops_stock_items
       set reserved_ref           = v_ref,
           reserved_order_line_id = v_line_id,
           updated_at             = now()
     where id                          = p_item_id
       and status                      = 'incoming'
       and reserved_order_line_id      is null
       and reserved_purchase_demand_id is null
    returning id, sku, coalesce(qty, 1) into v_id, v_item_sku, v_qty;

    if v_id is null then
      return null;
    end if;

    -- No `ops_stock_pool_usage` row: nothing left the free pool. The audit and
    -- activity rows say what happened, in their own words.
    insert into audit_log (role, actor_text, action, ref)
    values (v_role::public.app_role,
            (select name from app_users where id = auth.uid()),
            format('PO goods reserved · %s x%s · %s', v_item_sku, v_qty, coalesce(v_po_no, '')),
            v_ref);

    insert into ops_activity_log (order_id, action, actor_id, detail)
    values (
      public._activity_log_order_id_from_ref(v_ref),
      'stock_reserve',
      auth.uid(),
      jsonb_build_object('sku', v_item_sku, 'ref', v_ref, 'item_id', v_id,
                         'qty', v_qty, 'reason', p_reason,
                         'order_line_id', v_line_id,
                         'purchase_demand_id', null,
                         'source', 'incoming', 'po_no', v_po_no)
    );

    return v_id;
  end if;

  if p_item_id is not null then
    update ops_stock_items
       set status                      = 'reserved',
           reserved_ref                = v_ref,
           reserved_order_line_id      = coalesce(v_line_id, reserved_order_line_id),
           reserved_purchase_demand_id = coalesce(p_purchase_demand_id,
                                                  reserved_purchase_demand_id),
           updated_at                  = now()
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

  if v_id is null then
    return null;
  end if;

  insert into ops_stock_pool_usage (item_id, sku, qty, reason, note, ref, taken_by)
  values (v_id, v_item_sku, v_qty, p_reason, v_note, v_ref, auth.uid());

  insert into audit_log (role, actor_text, action, ref)
  values (v_role::public.app_role,
          (select name from app_users where id = auth.uid()),
          format('Ready stock taken · %s x%s · %s', v_item_sku, v_qty, p_reason),
          v_ref);

  insert into ops_activity_log (order_id, action, actor_id, detail)
  values (
    public._activity_log_order_id_from_ref(v_ref),
    'stock_reserve',
    auth.uid(),
    jsonb_build_object('sku', v_item_sku, 'ref', v_ref, 'item_id', v_id,
                       'qty', v_qty, 'reason', p_reason,
                       'order_line_id', v_line_id,
                       'purchase_demand_id', p_purchase_demand_id)
  );

  return v_id;
end;
$function$;

comment on function public.ops_stock_pool_draw(text, text, text, uuid, text, text, uuid, uuid, uuid) is
  '0546/0600 — the ONE draw door. 0600 adds goods already on a PO: an `incoming` exact Unit may be bound to a Sales Order line when its open PO line still has Units no order holds (purchasing_po_line_free_units). The bind sets only reserved_ref + reserved_order_line_id; status stays incoming until Receiving posts, and no pool-usage row is written because nothing left the free pool. The Manual Purchase branch still draws free Units only.';

-- ───────────────────────────────────────────────────────────────────────────
-- 4 · RELEASE GIVES A BOUND INCOMING UNIT BACK TO ITS PO
-- ───────────────────────────────────────────────────────────────────────────
-- 0546's body. A reserved Unit goes back to `free` as before; a bound
-- incoming Unit keeps `incoming` and loses only its binding, so it returns to
-- the PO's free balance.
create or replace function public.ops_stock_release(p_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
DECLARE
  v_role app_role;
  v_id   uuid;
  v_ref  text;
BEGIN
  v_role := public.app_role();
  IF (v_role is null or v_role NOT IN ('operation','principal')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE ops_stock_items
     SET status       = CASE WHEN status = 'incoming' THEN 'incoming' ELSE 'free' END,
         reserved_ref = NULL,
         -- 0471: the line goes with the reference. The customer still owes the
         -- goods, so the requirement must return to SO Batch Purchase.
         reserved_order_line_id = NULL,
         -- 0546: and the Manual Purchase line goes with it for the same
         -- reason — a released Unit must stop answering a purchase line, or
         -- that line reads as covered by goods it no longer holds.
         reserved_purchase_demand_id = NULL,
         ref_history  = CASE
                          WHEN reserved_ref IS NOT NULL
                            THEN array_append(ref_history, reserved_ref)
                          ELSE ref_history
                        END,
         updated_at   = now()
   WHERE id     = p_item_id
     AND (status = 'reserved'
          -- 0600: a Unit reserved on its PO by `Use this PO`.
          OR (status = 'incoming' AND reserved_order_line_id IS NOT NULL))
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
$function$;

comment on function public.ops_stock_release(uuid) is
  '0546/0600 — the release door. Clears reserved_ref, reserved_order_line_id and reserved_purchase_demand_id. A reserved Unit returns to free; a Unit reserved on its PO by `Use this PO` stays incoming and returns to that PO''s free balance.';

-- ───────────────────────────────────────────────────────────────────────────
-- 5 · THE ONE SAVE KNOWS A BOUND INCOMING UNIT
-- ───────────────────────────────────────────────────────────────────────────
-- 0545's body; the line's saved set includes `incoming` beside reserved/sold,
-- so `Change selection` can give a PO reservation back.
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
  for v_id, v_status in
    select i.id, i.status
      from ops_stock_items i
     where i.reserved_order_line_id = p_line
       and i.status in ('reserved','sold','incoming')
       and not (i.id = any(v_wanted))
     order by i.id
     for update
  loop
    if v_status not in ('reserved','incoming') then
      raise exception 'unit_cannot_be_released' using errcode = '22023',
        detail = 'that Unit has already left the shelf · unit_id=' || v_id::text;
    end if;
    if public.ops_stock_release(v_id) is null then
      raise exception 'unit_not_reserved_here' using errcode = '40001',
        detail = 'that Unit is no longer reserved to this item line · unit_id=' || v_id::text;
    end if;
    v_released := v_released + 1;
  end loop;

  -- ── 2 · TAKE WHAT THE REPLACEMENT ADDS ────────────────────────────────────
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
        and i.status in ('reserved','sold','incoming')
   );

  if jsonb_array_length(v_picks) > 0 then
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
     and i.status in ('reserved','sold','incoming');

  return jsonb_build_object(
    'reserved', jsonb_array_length(v_units),
    'added',    v_added,
    'released', v_released,
    'reference', p_ref,
    'units',    v_units
  );
end;
$function$;

comment on function public.so_batch_save_ready_units(text, text, text, uuid, uuid, jsonb) is
  '0545/0600 — SO Batch Purchase''s `Save changes`: the COMPLETE chosen set for ONE Sales Order item line, applied as a replacement in ONE transaction. 0600: a Unit reserved on its PO by `Use this PO` (status incoming) is part of the saved set and is released the same way. Decides nothing of its own.';

-- ───────────────────────────────────────────────────────────────────────────
-- 6 · `Use this PO` — ONE ACT, ALL OR NONE
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.so_batch_use_po_units(
  p_ref      text,
  p_reason   text,
  p_note     text,
  p_order_id uuid,
  p_line     uuid,
  p_po_id    text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role   text := (select public.app_role());
  v_line   record;
  v_po     record;
  v_need   int;
  v_taken  int := 0;
  v_cand   record;
  v_drawn  uuid;
  v_out    jsonb := '[]'::jsonb;
  v_state  text;
  v_word   text;
  v_detail text;
begin
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden' using errcode = '42501',
      detail = 'the stock register is an operation surface';
  end if;

  select l.id, l.sku into v_line
    from order_lines l
   where l.id = p_line and l.order_id = p_order_id;
  if not found then
    raise exception 'order_line_not_in_order' using errcode = '22023',
      detail = 'that item line is not on this Sales Order';
  end if;

  select po.id, po.status into v_po from purchase_orders po where po.id = p_po_id;
  if not found or v_po.status is distinct from 'open' then
    raise exception 'po_not_open' using errcode = '22023',
      detail = 'that purchase order is not open';
  end if;

  -- LOCK ORDER: the PO's lines first (the draw door's and Receiving's order).
  perform 1 from purchase_order_lines pl where pl.po_id = p_po_id order by pl.id for update;

  v_need := public.so_line_remaining_requirement(p_line);
  if v_need <= 0 then
    raise exception 'line_already_covered' using errcode = '22023',
      detail = 'that item line is already covered by Ready Stock or a purchase order';
  end if;

  for v_cand in
    select i.id, i.po_line_id
      from ops_stock_items i
      join purchase_order_lines pl on pl.id = i.po_line_id
     where pl.po_id = p_po_id
       and i.status = 'incoming'
       and coalesce(i.identity_scope, 'unit') = 'unit'
       and i.reserved_order_line_id is null
       and i.reserved_purchase_demand_id is null
       and coalesce(i.needs_repair, false) = false
       and public.stock_match_key(i.sku) = public.stock_match_key(v_line.sku)
     order by i.unit_code, i.id
  loop
    exit when v_taken >= v_need;
    -- Each bind spends the line's free balance; stop at what nobody holds.
    continue when public.purchasing_po_line_free_units(v_cand.po_line_id) <= 0;
    begin
      v_drawn := public.ops_stock_pool_draw(
        p_ref           => p_ref,
        p_reason        => p_reason,
        p_note          => p_note,
        p_item_id       => v_cand.id,
        p_sku           => null,
        p_condition     => null,
        p_wh            => null,
        p_order_line_id => p_line
      );
    exception when others then
      get stacked diagnostics
        v_state  = returned_sqlstate,
        v_word   = message_text,
        v_detail = pg_exception_detail;
      raise exception using
        errcode = v_state,
        message = v_word,
        detail  = coalesce(nullif(v_detail, '') || ' · ', '') || 'unit_id=' || v_cand.id::text;
    end;
    if v_drawn is null then
      raise exception 'unit_no_longer_free' using errcode = '40001',
        detail = 'someone else took that Unit · unit_id=' || v_cand.id::text;
    end if;
    v_taken := v_taken + 1;
    v_out := v_out || jsonb_build_object('itemId', v_drawn, 'orderLineId', p_line);
  end loop;

  if v_taken = 0 then
    raise exception 'po_has_no_free_units' using errcode = '22023',
      detail = 'that purchase order has no goods for this line that no order holds';
  end if;

  return jsonb_build_object('reserved', v_taken, 'poId', p_po_id,
                            'reference', p_ref, 'units', v_out);
end;
$function$;

revoke all on function public.so_batch_use_po_units(text, text, text, uuid, uuid, text)
  from public, anon;
grant execute on function public.so_batch_use_po_units(text, text, text, uuid, uuid, text)
  to authenticated;

comment on function public.so_batch_use_po_units(text, text, text, uuid, uuid, text) is
  '0600 — SO Batch Purchase''s `Use this PO`: binds as many of ONE open PO''s free incoming Unit IDs as the Sales Order line still needs, in one transaction, through ops_stock_pool_draw (every guard is the draw door''s). Refuses `po_has_no_free_units` when that PO has none for these goods.';

-- ───────────────────────────────────────────────────────────────────────────
-- 7 · RECEIVING HONOURS THE BINDING, IN EVERY POSTING PATH
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.ops_stock_bound_incoming_arrives()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if old.status = 'incoming'
     and new.status is distinct from old.status
     and old.reserved_order_line_id is not null then
    if new.status = 'free' then
      -- The goods arrived for the customer who reserved them on the PO.
      new.status := 'reserved';
    elsif new.status <> 'reserved' then
      -- Damaged/wrong on arrival, voided by a revision or cancel: the Unit no
      -- longer answers the line, and the requirement returns to SO Batch.
      new.ref_history := case when old.reserved_ref is not null
                              then array_append(old.ref_history, old.reserved_ref)
                              else old.ref_history end;
      new.reserved_ref := null;
      new.reserved_order_line_id := null;
    end if;
  end if;
  return new;
end;
$function$;

comment on function public.ops_stock_bound_incoming_arrives() is
  '0600 — a Unit reserved on its PO by `Use this PO` becomes `reserved` for its Sales Order line when Receiving posts it (instead of `free`), whichever receiving door posts it. Leaving `incoming` any other way clears the binding so the line''s requirement returns. An unbound Unit is untouched.';

drop trigger if exists ops_stock_bound_incoming_arrives on public.ops_stock_items;
create trigger ops_stock_bound_incoming_arrives
  before update of status on public.ops_stock_items
  for each row execute function public.ops_stock_bound_incoming_arrives();

-- ───────────────────────────────────────────────────────────────────────────
-- 8 · sanity — the SHAPE, never the data
-- ───────────────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_n int;
begin
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ops_stock_pool_draw';
  if v_n <> 1 then
    raise exception '0600 sanity: the draw door must stay ONE door, found %', v_n;
  end if;
  if to_regprocedure('public.so_batch_use_po_units(text, text, text, uuid, uuid, text)') is null then
    raise exception '0600 sanity: the Use this PO door is missing';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgname = 'ops_stock_bound_incoming_arrives'
                    and tgrelid = 'public.ops_stock_items'::regclass) then
    raise exception '0600 sanity: the arrival trigger is missing';
  end if;
  if position('incoming' in (select prosrc from pg_proc
                              where oid = 'public.so_line_remaining_requirement(uuid, uuid)'::regprocedure)) = 0 then
    raise exception '0600 sanity: the remaining arithmetic does not count a bound incoming Unit';
  end if;
end;
$sanity$;

commit;
