-- ═══════════════════════════════════════════════════════════════════════════
-- 0546 · A MANUAL PURCHASE HAS A NUMBER AGAIN, AND ITS LINE CAN HOLD READY
--        STOCK
--
-- Owner rulings 2026-09-18 (docs/purchasing/MASTER.md §9.2; docs/ui/MASTER.md
-- §6.8–6.9; COPY-STANDARD Manual Purchase / Purchasing UI dictionary):
--
--   I1  `MPR No` is the Manual Purchase Request identity again —
--       `MPR-YYYYMMDD-RRRR`, allocated at creation, permanent, never reused.
--       This OVERWRITES Card 08's 2026-09-04 retirement (0424): the ruling is
--       newer and says so in its own words.
--   I2  A request records WHAT IT IS FOR in the allocation sense: a concrete
--       need that existing Units can answer, or additional replenishment that
--       existing Units may never silently reduce. It is STORED, never guessed
--       from the SKU, the shelf count or an ambiguous purpose.
--   I3  A saved Ready Stock choice binds to the EXACT Manual Purchase line and
--       reduces that line's remaining procurement quantity. It NEVER borrows a
--       Sales Order binding and an MPR id never reaches an SO-only route.
--   I4  The save is one act: additions and removals together, all or none,
--       including removing every chosen Unit.
--
-- ── MEASURED BEFORE WRITING (repository, 2026-09-18) ───────────────────────
--   · `purchase_requests.req_no` lost its default in 0424, so every request
--     raised since then stores NULL. Nothing is backfilled here — CLAUDE.md §6
--     rules every row today is test data and forbids a backfill card. A NULL
--     history row prints the governed absence and keeps its other doors.
--   · `ops_stock_items` carries `reserved_order_line_id` (0471) and nothing
--     that names a Manual Purchase line, so today there is no honest way to
--     hold a Unit for an MPR. `reserved_ref` alone cannot do it: a request has
--     several lines and a text reference cannot say which one.
--   · `so_line_remaining_requirement` (0471) is the SO side's one arithmetic.
--     The Manual Purchase side had none, because it had no allocation.
--   · `ops_stock_release` (0500) clears `reserved_order_line_id`. It must also
--     clear the new binding or a released Unit keeps answering a line it left.
--
-- ── ONE WRITER, EXTENDED — NOT A SECOND ONE ────────────────────────────────
-- `ops_stock_pool_draw` stays the ONE door that takes a Unit out of the free
-- pool, writes the pool-usage ledger, the audit row and the activity row. It
-- gains `p_purchase_demand_id` and the guards that binding needs. The
-- 8-argument form is DROPPED and the 9-argument form created in the same
-- transaction, so there is never a moment with two overloads: PostgREST
-- resolves by the exact argument NAMES a request sends, and every existing
-- 8-name caller (`/reserve`, `/reserve-item`, `so_batch_reserve_ready_units`)
-- keeps resolving because the ninth argument has a default.
--
-- ── LOCK ORDER — the reason a race has exactly one winner ───────────────────
-- request FOR SHARE → demand FOR UPDATE → unit FOR UPDATE. Exactly the order
-- `purchasing_issue_pos_batch` takes (0522), so an allocation, an issue and a
-- decision queue on one row in one order and the loser leaves by name.
--
-- NON-DESTRUCTIVE. Adds two columns, one index, one constraint, one view
-- column, two functions and one event kind, and replaces three function
-- bodies. No row is updated, deleted or backfilled. Asserts no production row
-- count.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ───────────────────────────────────────────────────────────────────────────
-- 1 · I1 · The number comes back for NEW requests only
-- ───────────────────────────────────────────────────────────────────────────
alter table public.purchase_requests
  alter column req_no set default public.allocate_formal_document_code('MPR');

comment on column public.purchase_requests.req_no is
  'The Manual Purchase Request identity — `MPR-YYYYMMDD-RRRR` from allocate_formal_document_code (0381), allocated at creation, permanent and never reused (owner ruling 2026-09-18, which OVERWRITES Card 08''s 2026-09-04 retirement in 0424). MPR = Manual Purchase Request; `MP` is never used, it is already the Mattress Protector SKU code. Rows raised between 0424 and 0546 store NULL and are NOT backfilled (CLAUDE.md §6): they print the governed absence and open through the row, never an invented number. Pre-0401 `REQ-####` identities print exactly as stored and stay searchable.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2 · I2 · The recorded intent — the ONE fact that decides whether existing
--          Units may answer this request
-- ───────────────────────────────────────────────────────────────────────────
--
-- ⚠️ NULLABLE ON PURPOSE, AND NULL IS NOT `additional_stock`. A request raised
-- before this column existed recorded no intent, and a screen that treated the
-- absence as either answer would be guessing on the operator's behalf — which
-- is the exact thing the ruling forbids. The absence is its own state: the
-- stock section shows read-only and says why.
alter table public.purchase_requests
  add column if not exists fulfilment_intent text;

alter table public.purchase_requests
  drop constraint if exists purchase_requests_fulfilment_intent_check;
alter table public.purchase_requests
  add constraint purchase_requests_fulfilment_intent_check check (
    fulfilment_intent is null
    or fulfilment_intent in ('concrete_need', 'additional_stock')
  );

comment on column public.purchase_requests.fulfilment_intent is
  'Owner ruling 2026-09-18. `concrete_need` = an approved specific need that exact Units already on the shelf can answer, so a saved allocation REDUCES the remaining procurement quantity. `additional_stock` = buying EXTRA on top of what is there, so existing stock is reference only and is never netted against the ask. NULL = not recorded (every row raised before this column): the stock section is read-only and states the gap. It is never inferred from the SKU, the shelf count or the purpose.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3 · I3 · A Unit can name the Manual Purchase LINE it answers
-- ───────────────────────────────────────────────────────────────────────────
alter table public.ops_stock_items
  add column if not exists reserved_purchase_demand_id uuid
    references public.purchase_demands(id);

create index if not exists ops_stock_items_reserved_demand_idx
  on public.ops_stock_items (reserved_purchase_demand_id)
  where reserved_purchase_demand_id is not null;

-- A Unit answers ONE thing. Holding a customer's item line and an internal
-- purchase line at once would let two remaining-requirement arithmetics both
-- subtract the same piece of furniture.
alter table public.ops_stock_items
  drop constraint if exists ops_stock_items_one_binding;
alter table public.ops_stock_items
  add constraint ops_stock_items_one_binding check (
    reserved_order_line_id is null or reserved_purchase_demand_id is null
  );

comment on column public.ops_stock_items.reserved_purchase_demand_id is
  '0546 — the Manual Purchase LINE (purchase_demands.id) this Unit answers. Written ONLY by ops_stock_pool_draw through purchasing_allocate_ready_units, cleared by ops_stock_release. It is the MPR twin of reserved_order_line_id and the two are mutually exclusive by constraint: a Unit answers one line, never both. A request has several lines, so reserved_ref (the MPR No) can never say which one — that is why this column exists.';

-- ⚠️ BOTH VIEWS, IN THIS ORDER. `stock_unit_register_v` reads
-- `stock_unit_availability_v`, which selects an EXPLICIT column list from
-- `ops_stock_items` — so adding a base-table column does not propagate, and
-- recreating only the register view raises `column v.reserved_purchase_demand_id
-- does not exist` (caught by the migration replay before this file was pushed).
-- 0471's body, with the one column appended.
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
    reserved_order_line_id,
    reserved_purchase_demand_id
   FROM ops_stock_items i;

-- The authoritative register view carries it, so the allocation read has ONE
-- source and never falls back to the base table.
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
    v.reserved_order_line_id,
    v.reserved_purchase_demand_id
   FROM stock_unit_availability_v v
     LEFT JOIN warehouses w ON w.id = v.warehouse_id
     LEFT JOIN stock_operating_parties p ON p.id = v.holder_party_id
     LEFT JOIN LATERAL ( SELECT ev.event_at AS last_event_at,
            ev.event AS last_event
           FROM stock_unit_events ev
          WHERE ev.unit_id = v.id
          ORDER BY ev.seq DESC
         LIMIT 1) e ON true;

-- ───────────────────────────────────────────────────────────────────────────
-- 4 · THE ONE MANUAL PURCHASE REMAINING ARITHMETIC (Law D)
-- ───────────────────────────────────────────────────────────────────────────
--
-- The approved quantity, less what has already been issued onto a purchase
-- order, less the Units bound to this exact line. The same expression the
-- browser prints (`manualPurchaseLineRemainingOf` + the allocation count), so
-- the door and the Register cannot disagree.
create or replace function public.purchasing_mpr_line_remaining_requirement(
  p_demand_id    uuid,
  p_exclude_item uuid default null
)
returns int
language sql
stable
set search_path to 'public'
as $function$
  select greatest(0,
    coalesce((select coalesce(d.approved_qty, d.qty)
                from purchase_demands d
               where d.id = p_demand_id
                 and d.cancelled_at is null), 0)
    - coalesce((select d.issued_qty from purchase_demands d where d.id = p_demand_id), 0)
    - coalesce((select sum(coalesce(i.qty, 1))
                  from ops_stock_items i
                 where i.reserved_purchase_demand_id = p_demand_id
                   and i.status in ('reserved', 'sold')
                   and (p_exclude_item is null or i.id <> p_exclude_item)), 0)
  );
$function$;

comment on function public.purchasing_mpr_line_remaining_requirement(uuid, uuid) is
  '0546 — what a Manual Purchase line still has to BUY: its approved quantity (coalesce(approved_qty, qty); a cancelled line is 0) less what purchase orders already took (issued_qty) less the Ready Stock Units bound to this exact line. One arithmetic for the allocation door, the Issue PO gate and the Register (Law D).';

grant execute on function public.purchasing_mpr_line_remaining_requirement(uuid, uuid)
  to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 5 · THE ONE DRAW DOOR LEARNS THE MANUAL PURCHASE LINE
-- ───────────────────────────────────────────────────────────────────────────
--
-- Byte-for-byte 0471's body plus the Manual Purchase branch. Everything the SO
-- branch does is untouched: same role gate, same reasons, same FIFO pick, same
-- ledger, audit and activity rows.
drop function if exists public.ops_stock_pool_draw(text, text, text, uuid, text, text, uuid, uuid);

create function public.ops_stock_pool_draw(
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
          detail = 'counted stock has no Unit identity to commit to one item line';
      end if;
      if public.stock_match_key(v_unit.sku) is distinct from public.stock_match_key(v_line.sku) then
        raise exception 'unit_does_not_match_line' using errcode = '22023',
          detail = 'that Unit is not the goods this item line ordered';
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
  --
  -- Every guard the SO branch has, asked of the facts a Manual Purchase line
  -- actually carries, plus the two this lane owns: the request must be
  -- APPROVED, and it must have recorded a CONCRETE NEED. Additional
  -- replenishment is buying extra; netting the shelf against it would rewrite
  -- the ask, which the ruling forbids in its own words.
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
    -- The reference IS the request's own identity. An MPR never borrows an SO
    -- number and an SO number never reaches this branch (refused above).
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

revoke all on function public.ops_stock_pool_draw(text, text, text, uuid, text, text, uuid, uuid, uuid)
  from public, anon;
grant execute on function public.ops_stock_pool_draw(text, text, text, uuid, text, text, uuid, uuid, uuid)
  to authenticated;

comment on function public.ops_stock_pool_draw(text, text, text, uuid, text, text, uuid, uuid, uuid) is
  '0546 — 0471/0473''s pool draw plus the MANUAL PURCHASE LINE a Unit may answer. The Sales Order branch is unchanged. The Manual Purchase branch asks the same questions of the facts an MPR line carries (exact Unit, not counted stock, goods match by stock_match_key, available by the one availability arithmetic, remaining requirement above zero) and two of its own: the request is APPROVED, and it recorded a CONCRETE NEED — additional replenishment is never netted against the shelf. The two bindings are mutually exclusive, in this door and by table constraint.';

-- ───────────────────────────────────────────────────────────────────────────
-- 6 · RELEASE GIVES BACK BOTH BINDINGS
-- ───────────────────────────────────────────────────────────────────────────
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
     SET status       = 'free',
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
$function$;

revoke all on function public.ops_stock_release(uuid) from public, anon;
grant execute on function public.ops_stock_release(uuid) to authenticated;

comment on function public.ops_stock_release(uuid) is
  '0546 — the release door, unchanged except that it now clears reserved_purchase_demand_id beside reserved_order_line_id. A released Unit answers nothing: both requirements return to their own buying surface.';

-- ───────────────────────────────────────────────────────────────────────────
-- 7 · I4 · ONE SAVE — additions and removals together, all or none
-- ───────────────────────────────────────────────────────────────────────────
alter table public.purchase_request_events
  drop constraint if exists purchase_request_events_kind_check;
alter table public.purchase_request_events
  add constraint purchase_request_events_kind_check check (
    kind in ('sent_back', 'resubmitted', 'withdrawn', 'stock_allocated')
  );

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
  if array_length(v_want, 1) > 50 then
    raise exception 'too_many_units' using errcode = '22023',
      detail = 'choose at most 50 Units in one act';
  end if;
  -- A repeated Unit in one save would draw it twice and count it twice.
  if array_length(v_want, 1) is distinct from
     (select count(distinct u) from unnest(v_want) u) then
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
    'reserved', coalesce(array_length(v_want, 1), 0),
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
  '0546 — the ONE Manual Purchase stock save (owner ruling 2026-09-18). It receives the COMPLETE desired set for one MPR line and reconciles: releases every Unit that left it, draws every Unit that joined it, in one transaction, all or none — including an empty set, which releases everything. It adds no stock rule of its own: every guard, ledger row and audit row is ops_stock_pool_draw''s and ops_stock_release''s. p_expected_item_ids is the optimistic check — the saved set the browser was editing; a different current set refuses the whole save with stock_selection_changed so nobody overwrites somebody else''s allocation.';

-- ───────────────────────────────────────────────────────────────────────────
-- 7b · A UNIT SAVED OFF THE SHELF IS NOT BOUGHT AGAIN
-- ───────────────────────────────────────────────────────────────────────────
--
-- ⭐ WITHOUT THIS, THE WHOLE ALLOCATION IS DECORATION. The issue recorder's
-- ceiling was `coalesce(approved_qty, qty)`, which knows nothing about Units
-- held for the line — so a request for 2 with 1 answered off the shelf would
-- still have raised a purchase order for 2, and Carres would own three sofas
-- and have asked for two. The ceiling now subtracts the saved allocation,
-- which is the SAME expression `purchasing_mpr_line_remaining_requirement`
-- states and the Register prints (Law D).
--
-- It is 0522's body with that one line changed; every gate, lock and refusal
-- around it is byte-for-byte the same, including the FOR SHARE on the request
-- that gives a racing withdraw or send back exactly one winner.
create or replace function public.purchasing_demand_record_issue(
  p_id uuid, p_qty integer, p_po_id text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role    app_role;
  v_d       purchase_demands;
  v_ceiling int;
  v_held    int;
  v_request uuid;
  v_req     purchase_requests%rowtype;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_qty is null or p_qty < 1 then
    raise exception 'qty must be at least 1' using errcode = '22023', detail = 'invalid_qty';
  end if;

  -- 0522 · A MANUAL PURCHASE IS BOUGHT ONLY WHILE ITS APPROVAL STANDS.
  select request_id into v_request from purchase_demands where id = p_id;
  if v_request is not null then
    select * into v_req from purchase_requests where id = v_request for share;
    if v_req.approved_at is null
       or v_req.refused_at is not null
       or v_req.withdrawn_at is not null
       or v_req.sent_back_at is not null then
      raise exception 'manual purchase % is not approved', v_request
        using errcode = 'P0001', detail = 'not_ready_to_order';
    end if;
  end if;

  select * into v_d from purchase_demands where id = p_id for update;
  if not found then
    raise exception 'demand not found' using errcode = '42P01', detail = 'not_found';
  end if;
  if v_d.cancelled_at is not null then
    raise exception 'demand is cancelled' using errcode = 'P0001', detail = 'already_cancelled';
  end if;

  -- 0546 · what Ready Stock already answers for this exact line.
  select coalesce(sum(coalesce(i.qty, 1)), 0) into v_held
    from ops_stock_items i
   where i.reserved_purchase_demand_id = p_id
     and i.status in ('reserved', 'sold');

  v_ceiling := coalesce(v_d.approved_qty, v_d.qty) - v_held;

  if v_d.issued_qty + p_qty > v_ceiling then
    raise exception 'demand % has only % left, cannot take %',
      p_id, greatest(0, v_ceiling - v_d.issued_qty), p_qty
      using errcode = 'P0001', detail = 'over_issue';
  end if;

  update purchase_demands
     set issued_qty = issued_qty + p_qty,
         po_id      = coalesce(po_id, p_po_id),
         ordered_at = case
                        when po_id is null and p_po_id is not null then now()
                        else ordered_at
                      end
   where id = p_id;

  select * into v_d from purchase_demands where id = p_id;
  return jsonb_build_object(
    'id',        p_id,
    'issued',    v_d.issued_qty,
    'remaining', v_d.remaining_qty
  );
end;
$function$;

comment on function public.purchasing_demand_record_issue(uuid, integer, text) is
  '0546 — 0522''s issue recorder, with the ceiling reduced by the Ready Stock Units saved against this exact Manual Purchase line. A Unit taken off the shelf for a line is not bought again; the original ask (`qty`) is untouched, as is the approver''s cut.';

-- ───────────────────────────────────────────────────────────────────────────
-- 8 · The create door records the intent
-- ───────────────────────────────────────────────────────────────────────────
--
-- 0522's body, with the one added fact. NULL stays legal: a caller that does
-- not answer records no intent, and the stock section then states the gap
-- rather than guessing.
create or replace function public.purchasing_create_request(
  p_purpose text,
  p_destination_id uuid,
  p_why text default null::text,
  p_required_by date default null::date,
  p_for_service_case_id uuid default null::uuid,
  p_for_staff_user_id uuid default null::uuid,
  p_for_subsidiary_name text default null::text,
  p_fulfilment_intent text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role   app_role;
  v_id     uuid;
  v_no     text;
  v_intent text := nullif(btrim(coalesce(p_fulfilment_intent, '')), '');
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  if v_intent is not null and v_intent not in ('concrete_need', 'additional_stock') then
    raise exception 'unknown fulfilment intent' using errcode = '22023',
      detail = 'unknown_fulfilment_intent';
  end if;

  perform public._purchasing_check_request_facts(
    p_purpose, p_destination_id, p_why,
    p_for_service_case_id, p_for_staff_user_id, p_for_subsidiary_name);

  insert into purchase_requests (purpose, destination_id, required_by, why,
                                 for_service_case_id, for_staff_user_id,
                                 for_subsidiary_name, fulfilment_intent,
                                 approval_required, created_by)
  values (p_purpose, p_destination_id, p_required_by,
          nullif(btrim(coalesce(p_why, '')), ''),
          p_for_service_case_id, p_for_staff_user_id,
          nullif(btrim(coalesce(p_for_subsidiary_name, '')), ''),
          v_intent,
          true, auth.uid())
  returning id, req_no into v_id, v_no;

  return jsonb_build_object('id', v_id, 'req_no', v_no, 'approval_required', true,
                            'fulfilment_intent', v_intent);
end;
$function$;

revoke all on function public.purchasing_create_request(text, uuid, text, date, uuid, uuid, text, text)
  from public, anon;
grant execute on function public.purchasing_create_request(text, uuid, text, date, uuid, uuid, text, text)
  to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 9 · sanity — the SHAPE, never the data
-- ───────────────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_n int;
begin
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ops_stock_pool_draw';
  if v_n <> 1 then
    raise exception '0546 sanity: the draw door must stay ONE door, found %', v_n;
  end if;

  select count(*) into v_n
    from information_schema.columns
   where table_schema = 'public' and table_name = 'ops_stock_items'
     and column_name = 'reserved_purchase_demand_id';
  if v_n <> 1 then
    raise exception '0546 sanity: the Manual Purchase binding column is missing';
  end if;

  select count(*) into v_n
    from information_schema.columns
   where table_schema = 'public' and table_name = 'purchase_requests'
     and column_name = 'fulfilment_intent';
  if v_n <> 1 then
    raise exception '0546 sanity: the recorded intent column is missing';
  end if;

  select count(*) into v_n
    from information_schema.columns
   where table_schema = 'public' and table_name = 'stock_unit_register_v'
     and column_name = 'reserved_purchase_demand_id';
  if v_n <> 1 then
    raise exception '0546 sanity: the register view does not carry the binding';
  end if;

  if (select pg_get_expr(adbin, adrelid)
        from pg_attrdef d
        join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
       where d.adrelid = 'public.purchase_requests'::regclass
         and a.attname = 'req_no') is null then
    raise exception '0546 sanity: MPR No has no allocator again';
  end if;
end;
$sanity$;

commit;
