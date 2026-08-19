-- =============================================================================
-- 0365_a_unit_crosses_a_site_only_by_transfer.sql
-- WAREHOUSE TRANSFERS — slice 1 (owner-approved Warehouse Blueprint item 8,
-- reviewed 2026-08-14; card docs/cards/CARD-2026-08-19-warehouse-transfers.md).
--
-- THE LAW THIS RECORDS (blueprint item 8, the slice-1 subset):
--
--   Requested  →  In transit  →  Received        (+ Cancelled, pre-collection)
--
--   · SAME SITE = Move; DIFFERENT SITE = Transfer. A cross-site relocation may
--     never be a direct edit of `ops_stock_items.warehouse_id`, because a direct
--     edit hides three facts the owner named: who handed the goods over, who
--     held them in between, and whether the destination really received the
--     SAME unit.
--   · COLLECTION AND ARRIVAL ARE TWO EVENTS, NEVER ONE. The blueprint rejects
--     2990's "one action writes OUT and IN", which pretends the journey between
--     them does not exist. Here the OUT lands at collection and the IN lands at
--     arrival — two moments, two stock_movements rows, and a real gap between.
--   · THE STATE IS DERIVED FROM RECORDED EVENTS, never stored as an editable
--     dropdown (Architecture Law D). This migration stores observations only;
--     `stockTransferStateOf` in packages/shared is the one arithmetic.
--   · A Transfer cannot be cancelled once collected — the way back is a NEW
--     return Transfer, never an undo of a journey that physically happened.
--
-- IN TRANSIT IS `transferred`, AND THIS IS ITS FIRST WRITER. `transferred` has
-- sat in the status vocabulary since 0137 with no writer anywhere and ZERO rows
-- (measured on production 2026-08-19: free 90 · incoming 43 · reserved 2 ·
-- returned_to_supplier 1 · transferred 0). It means exactly one thing from here
-- on: custody has left the origin and the destination has not yet received.
-- Minting a second literal beside it would give one fact two words and leave
-- `transferred` orphaned forever (Architecture Law C). Everything downstream
-- already treats it correctly, which is why no consumer needs a patch:
--   · SELLABLE_STOCK_STATUSES = ['free'] — an in-transit unit is not sellable;
--   · ops_rollup_stock_balances counts only free + reserved (0137) — it is
--     absent from stock_balances, so no availability figure can see it;
--   · every pick/draw filters status='free' — it cannot be reserved or drawn;
--   · 0299's guard forbids on_hold → transferred, and 0341's delete guard
--     refuses to hard-delete a transferred unit.
-- Its RESERVATION SURVIVES UNTOUCHED: `reserved_ref` is never cleared by a
-- transfer, and arrival restores the status recorded at request time.
--
-- WHAT THIS SLICE DOES NOT DO (later cards): Positions / Operational Areas ·
-- partial receipt and its exception Work · Receive With Issue · Reject ·
-- supplier and repair-partner destinations · Counts · batch/dye-lot matching ·
-- any Settings surface. None of them is faked here.
--
-- Verified in a rolled-back transaction against live before apply: the four
-- doors, the append-only refusal, the cancel-after-collection refusal, the
-- on_hold refusal, and that collection alone does not derive Received.
-- =============================================================================

set search_path = public;

-- ── 1 · the Transfer ─────────────────────────────────────────────────────────
-- The id is supplied by the door, because it SEEDS the document number under
-- the locked docNumber() scheme (`TR-DDMMYY-NNNN`, reprint-stable) — the number
-- is derived from the id, so it cannot be minted after the row exists.
create table if not exists public.ops_stock_transfers (
  id                 uuid primary key,
  transfer_no        text not null unique,
  from_warehouse_id  uuid not null references public.warehouses(id) on delete restrict,
  to_warehouse_id    uuid not null references public.warehouses(id) on delete restrict,
  -- Why the goods move. The blueprint's business reasons, closed: a purpose
  -- nobody can name is a transfer nobody can audit six months later.
  purpose            text not null check (purpose in
                       ('sales_order','display','rebalance','return_to_warehouse')),
  -- The Sales Order a reserved unit is moving FOR. Present exactly when the
  -- purpose is that fulfilment — the blueprint's rule that ordinary display or
  -- outlet balancing may never take a reserved unit is enforced against it.
  sales_order_ref    text,
  expected_date      date not null,
  note               text,
  requested_by       uuid not null references auth.users(id),
  requested_at       timestamptz not null default now(),
  -- Same site = Move, different site = Transfer. Structural, not advisory.
  constraint ops_stock_transfers_sites_differ
    check (from_warehouse_id <> to_warehouse_id),
  constraint ops_stock_transfers_so_ref_matches_purpose
    check ((purpose = 'sales_order') = (sales_order_ref is not null))
);

create index if not exists ops_stock_transfers_from_idx
  on public.ops_stock_transfers (from_warehouse_id);
create index if not exists ops_stock_transfers_to_idx
  on public.ops_stock_transfers (to_warehouse_id);

comment on table public.ops_stock_transfers is
  'A cross-site custody journey for EXACT units (Warehouse Blueprint item 8, 0365). Same site = Move; different site = Transfer. State is DERIVED from ops_stock_transfer_events by stockTransferStateOf — never stored here.';
comment on column public.ops_stock_transfers.id is
  'Supplied by the door: it seeds the docNumber() tail, so the number is derived from the id and is reprint-stable.';
comment on column public.ops_stock_transfers.sales_order_ref is
  'Present exactly when purpose = sales_order. A reserved unit may only travel when the move serves ITS OWN fulfilment, and this is the ref that is matched.';

-- ── 2 · the exact units ──────────────────────────────────────────────────────
create table if not exists public.ops_stock_transfer_units (
  id             uuid primary key default gen_random_uuid(),
  transfer_id    uuid not null references public.ops_stock_transfers(id) on delete restrict,
  stock_item_id  uuid not null references public.ops_stock_items(id) on delete restrict,
  -- The status to restore when the goods arrive. RECORDED, never guessed: a
  -- reserved unit that travels must land reserved, and deriving that from
  -- `reserved_ref` at arrival time would silently free the unit if the ref had
  -- moved in between.
  status_before  text not null check (status_before in ('free','reserved')),
  unique (transfer_id, stock_item_id)
);

create index if not exists ops_stock_transfer_units_item_idx
  on public.ops_stock_transfer_units (stock_item_id);

comment on table public.ops_stock_transfer_units is
  'The EXACT units on one Transfer (0365) — never an SKU quantity. The blueprint rejects "只记录 SKU 数量而不知道哪些 Unit": the destination must be able to prove it received the same unit that left.';

-- ── 3 · the custody events ───────────────────────────────────────────────────
-- Append-only observations. Each records the person, the time and the unit set.
create table if not exists public.ops_stock_transfer_events (
  id                uuid primary key default gen_random_uuid(),
  transfer_id       uuid not null references public.ops_stock_transfers(id) on delete restrict,
  kind              text not null check (kind in
                      ('requested','collected','arrived','cancelled')),
  -- What THIS event moved: [{unit_id, unit_code, sku}]. The set is stamped
  -- server-side from the transfer's own lines, never trusted from the client.
  units             jsonb check (units is null or jsonb_typeof(units) = 'array'),
  -- Collection: who carried the goods, and who took them from the origin.
  carrier           text,
  handover_to       text,
  -- Arrival: the person at the destination who actually took delivery.
  received_by_name  text,
  -- Cancellation: why. A cancelled journey without its reason is a hole.
  reason            text,
  note              text,
  recorded_by       uuid not null references auth.users(id),
  recorded_at       timestamptz not null default now(),
  -- One event of each kind per Transfer: a second journey is a NEW Transfer.
  unique (transfer_id, kind)
);

create index if not exists ops_stock_transfer_events_transfer_idx
  on public.ops_stock_transfer_events (transfer_id);

comment on table public.ops_stock_transfer_events is
  'The append-only custody chain of one Transfer (0365): requested → collected → arrived, or cancelled before collection. Person + time + unit set on every row. Status is DERIVED from these facts; nothing here is ever edited or deleted.';

-- ── 4 · RLS — read internal, and the doors are the only writers ──────────────
alter table public.ops_stock_transfers       enable row level security;
alter table public.ops_stock_transfer_units  enable row level security;
alter table public.ops_stock_transfer_events enable row level security;

drop policy if exists ops_stock_transfers_read_internal on public.ops_stock_transfers;
create policy ops_stock_transfers_read_internal
  on public.ops_stock_transfers
  for select using ((select public.is_internal()));

drop policy if exists ops_stock_transfer_units_read_internal on public.ops_stock_transfer_units;
create policy ops_stock_transfer_units_read_internal
  on public.ops_stock_transfer_units
  for select using ((select public.is_internal()));

drop policy if exists ops_stock_transfer_events_read_internal on public.ops_stock_transfer_events;
create policy ops_stock_transfer_events_read_internal
  on public.ops_stock_transfer_events
  for select using ((select public.is_internal()));

-- No write policies and no write grants: the four doors below are the only
-- writers. 0299's lesson — a rule inside one RPC is a rule one call walks
-- around — so the destination refuses, not the caller.
revoke insert, update, delete on public.ops_stock_transfers       from authenticated, anon;
revoke insert, update, delete on public.ops_stock_transfer_units  from authenticated, anon;
revoke insert, update, delete on public.ops_stock_transfer_events from authenticated, anon;

-- ── 5 · history is never rewritten ───────────────────────────────────────────
create or replace function public.ops_stock_transfer_events_append_only()
returns trigger
language plpgsql
as $fn$
begin
  raise exception 'a transfer event is history — it is never edited or deleted'
    using errcode = 'P0001', detail = 'transfer_event_append_only';
end;
$fn$;

drop trigger if exists ops_stock_transfer_events_no_rewrite
  on public.ops_stock_transfer_events;
create trigger ops_stock_transfer_events_no_rewrite
  before update or delete on public.ops_stock_transfer_events
  for each row execute function public.ops_stock_transfer_events_append_only();

-- A Transfer that has moved goods is not deletable either: its units and its
-- events reference it ON DELETE RESTRICT, and the document itself is history.
create or replace function public.ops_stock_transfers_no_delete()
returns trigger
language plpgsql
as $fn$
begin
  raise exception 'a transfer is a document — cancel it, never delete it'
    using errcode = 'P0001', detail = 'transfer_no_delete';
end;
$fn$;

drop trigger if exists ops_stock_transfers_delete_refused on public.ops_stock_transfers;
create trigger ops_stock_transfers_delete_refused
  before delete on public.ops_stock_transfers
  for each row execute function public.ops_stock_transfers_no_delete();

-- ── 6 · helper: the unit set of a transfer, in business words ────────────────
create or replace function public.ops_stock_transfer_unit_set(p_transfer_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'unit_id',   i.id,
      'unit_code', i.unit_code,
      'sku',       i.sku
    ) order by i.unit_code nulls last, i.id),
    '[]'::jsonb)
    from ops_stock_transfer_units u
    join ops_stock_items i on i.id = u.stock_item_id
   where u.transfer_id = p_transfer_id;
$fn$;

-- ── 7 · DOOR 1 · Request transfer ────────────────────────────────────────────
-- Names the exact units, both sites, the purpose and the expected date. It does
-- NOT move anything: the blueprint is explicit that a request states the
-- business reason and changes no unit location.
create or replace function public.ops_stock_transfer_request(
  p_id              uuid,
  p_transfer_no     text,
  p_from            uuid,
  p_to              uuid,
  p_unit_ids        uuid[],
  p_purpose         text,
  p_expected_date   date,
  p_sales_order_ref text default null,
  p_note            text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role  app_role;
  v_uid   uuid;
  v_unit  ops_stock_items;
  v_id    uuid;
  v_row   ops_stock_transfers;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden: only operation or principal requests a transfer'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_uid := auth.uid();

  if p_id is null or p_transfer_no is null or btrim(p_transfer_no) = '' then
    raise exception 'a transfer carries its own number'
      using errcode = '22023', detail = 'transfer_no_required';
  end if;
  if p_from is null or p_to is null then
    raise exception 'a transfer names where the goods leave and where they land'
      using errcode = '22023', detail = 'sites_required';
  end if;
  if p_from = p_to then
    raise exception 'that is a move inside one site, not a transfer'
      using errcode = '22023', detail = 'same_site';
  end if;
  if p_unit_ids is null or array_length(p_unit_ids, 1) is null then
    raise exception 'a transfer names the exact units that travel'
      using errcode = '22023', detail = 'units_required';
  end if;
  if p_purpose is null or p_purpose not in
     ('sales_order','display','rebalance','return_to_warehouse') then
    raise exception '% is not a reason this door moves goods for', coalesce(p_purpose,'null')
      using errcode = '22023', detail = 'bad_purpose';
  end if;
  if p_expected_date is null then
    raise exception 'a transfer says when the goods are expected'
      using errcode = '22023', detail = 'expected_date_required';
  end if;
  if (p_purpose = 'sales_order') <> (p_sales_order_ref is not null
                                     and btrim(p_sales_order_ref) <> '') then
    raise exception 'a transfer for a sales order names that order, and only that purpose may'
      using errcode = '22023', detail = 'so_ref_mismatch';
  end if;

  insert into ops_stock_transfers
    (id, transfer_no, from_warehouse_id, to_warehouse_id, purpose,
     sales_order_ref, expected_date, note, requested_by)
  values
    (p_id, btrim(p_transfer_no), p_from, p_to, p_purpose,
     nullif(btrim(coalesce(p_sales_order_ref,'')),''),
     p_expected_date,
     nullif(btrim(coalesce(p_note,'')),''),
     v_uid)
  returning * into v_row;

  -- Every unit is checked against the physical truth in the register, under a
  -- row lock so two requests cannot claim the same unit.
  foreach v_id in array p_unit_ids loop
    select * into v_unit from ops_stock_items where id = v_id for update;
    if v_unit.id is null then
      raise exception 'unit not found in the register'
        using errcode = '42P01', detail = 'unit_not_found';
    end if;
    if v_unit.warehouse_id <> p_from then
      raise exception 'unit % is not standing at the site the goods leave from',
        coalesce(v_unit.unit_code, v_unit.id::text)
        using errcode = 'P0001', detail = 'unit_not_at_origin';
    end if;
    if v_unit.status = 'on_hold' then
      raise exception 'unit % is on hold — a held unit does not travel on this transfer',
        coalesce(v_unit.unit_code, v_unit.id::text)
        using errcode = 'P0001', detail = 'unit_on_hold';
    end if;
    if v_unit.status not in ('free','reserved') then
      raise exception 'unit % is % — only free or reserved goods travel',
        coalesce(v_unit.unit_code, v_unit.id::text), v_unit.status
        using errcode = 'P0001', detail = 'unit_not_movable';
    end if;
    -- A reserved unit travels only for its OWN fulfilment (blueprint item 8:
    -- ordinary display or outlet balancing may never take a reserved unit).
    if v_unit.status = 'reserved'
       and (p_purpose <> 'sales_order'
            or v_unit.reserved_ref is distinct from btrim(p_sales_order_ref)) then
      raise exception 'unit % is reserved for % — it travels only for that order',
        coalesce(v_unit.unit_code, v_unit.id::text),
        coalesce(v_unit.reserved_ref, 'another order')
        using errcode = 'P0001', detail = 'unit_reserved_elsewhere';
    end if;
    -- Already promised to a journey that has not finished.
    if exists (
      select 1
        from ops_stock_transfer_units tu
        join ops_stock_transfers t on t.id = tu.transfer_id
       where tu.stock_item_id = v_id
         and t.id <> p_id
         and not exists (select 1 from ops_stock_transfer_events e
                          where e.transfer_id = t.id and e.kind in ('arrived','cancelled'))
    ) then
      raise exception 'unit % is already on an open transfer',
        coalesce(v_unit.unit_code, v_unit.id::text)
        using errcode = 'P0001', detail = 'unit_on_open_transfer';
    end if;

    insert into ops_stock_transfer_units (transfer_id, stock_item_id, status_before)
    values (p_id, v_id, v_unit.status);
  end loop;

  insert into ops_stock_transfer_events (transfer_id, kind, units, note, recorded_by)
  values (p_id, 'requested', public.ops_stock_transfer_unit_set(p_id),
          nullif(btrim(coalesce(p_note,'')),''), v_uid);

  insert into audit_log (role, action, ref)
  values (v_role, 'ops_stock_transfer.request', v_row.transfer_no);

  return to_jsonb(v_row);
end;
$fn$;

comment on function public.ops_stock_transfer_request(uuid, text, uuid, uuid, uuid[], text, date, text, text) is
  'DOOR 1 (0365): names exact units, both sites, purpose and expected date. Moves NOTHING — a request states the business reason. Refuses a held unit, a unit standing elsewhere, a unit already on an open transfer, and a reserved unit whose own order is not the reason.';

-- ── 8 · DOOR 2 · Confirm collection ──────────────────────────────────────────
-- The goods physically leave. Custody passes; the units go IN TRANSIT and fall
-- out of every availability figure. The OUT movement lands HERE — not paired
-- with an IN, because the goods have not arrived anywhere yet.
create or replace function public.ops_stock_transfer_collect(
  p_transfer_id uuid,
  p_carrier     text default null,
  p_handover_to text default null,
  p_note        text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role;
  v_uid  uuid;
  v_t    ops_stock_transfers;
  v_row  ops_stock_transfer_events;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden: only operation or principal confirms a collection'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_uid := auth.uid();

  select * into v_t from ops_stock_transfers where id = p_transfer_id for update;
  if v_t.id is null then
    raise exception 'transfer not found'
      using errcode = '42P01', detail = 'transfer_not_found';
  end if;
  if exists (select 1 from ops_stock_transfer_events
              where transfer_id = p_transfer_id and kind = 'cancelled') then
    raise exception 'transfer % was cancelled — cancelled goods do not travel', v_t.transfer_no
      using errcode = 'P0001', detail = 'transfer_cancelled';
  end if;
  if exists (select 1 from ops_stock_transfer_events
              where transfer_id = p_transfer_id and kind = 'collected') then
    raise exception 'transfer % has already been collected — history is never rewritten', v_t.transfer_no
      using errcode = 'P0001', detail = 'already_collected';
  end if;

  -- The units go in transit. `reserved_ref` is deliberately untouched: a
  -- reservation survives the journey.
  update ops_stock_items i
     set status = 'transferred', updated_at = now()
    from ops_stock_transfer_units u
   where u.transfer_id = p_transfer_id
     and i.id = u.stock_item_id;

  -- The OUT leg, at the moment the goods actually left.
  insert into stock_movements (sku, warehouse_id, qty, kind, ref, note, by_role, by_user_id)
  select i.sku, v_t.from_warehouse_id, sum(coalesce(i.qty, 1))::int, 'out',
         v_t.transfer_no, 'Transfer collected', v_role, v_uid
    from ops_stock_transfer_units u
    join ops_stock_items i on i.id = u.stock_item_id
   where u.transfer_id = p_transfer_id
   group by i.sku;

  perform public.ops_rollup_stock_balances(v_t.from_warehouse_id);

  insert into ops_stock_transfer_events
    (transfer_id, kind, units, carrier, handover_to, note, recorded_by)
  values
    (p_transfer_id, 'collected', public.ops_stock_transfer_unit_set(p_transfer_id),
     nullif(btrim(coalesce(p_carrier,'')),''),
     nullif(btrim(coalesce(p_handover_to,'')),''),
     nullif(btrim(coalesce(p_note,'')),''),
     v_uid)
  returning * into v_row;

  insert into audit_log (role, action, ref)
  values (v_role, 'ops_stock_transfer.collect', v_t.transfer_no);

  return to_jsonb(v_row);
end;
$fn$;

comment on function public.ops_stock_transfer_collect(uuid, text, text, text) is
  'DOOR 2 (0365): the goods physically leave. Units become `transferred` (In transit) and fall out of every availability figure; the reservation survives. Writes the OUT leg alone — the IN belongs to arrival, which may never happen in the same breath.';

-- ── 9 · DOOR 3 · Confirm arrival ─────────────────────────────────────────────
-- Only now do the goods enter the destination's stock, and only the units this
-- transfer carried. Each unit returns to the status it left in.
create or replace function public.ops_stock_transfer_arrive(
  p_transfer_id     uuid,
  p_received_by_name text default null,
  p_note             text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role;
  v_uid  uuid;
  v_t    ops_stock_transfers;
  v_row  ops_stock_transfer_events;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden: only operation or principal confirms an arrival'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_uid := auth.uid();

  select * into v_t from ops_stock_transfers where id = p_transfer_id for update;
  if v_t.id is null then
    raise exception 'transfer not found'
      using errcode = '42P01', detail = 'transfer_not_found';
  end if;
  -- Collection and arrival are two events, never one.
  if not exists (select 1 from ops_stock_transfer_events
                  where transfer_id = p_transfer_id and kind = 'collected') then
    raise exception 'goods arrive only after they were collected — transfer % has not left', v_t.transfer_no
      using errcode = 'P0001', detail = 'not_collected';
  end if;
  if exists (select 1 from ops_stock_transfer_events
              where transfer_id = p_transfer_id and kind = 'arrived') then
    raise exception 'transfer % is already received — history is never rewritten', v_t.transfer_no
      using errcode = 'P0001', detail = 'already_arrived';
  end if;
  if p_received_by_name is null or btrim(p_received_by_name) = '' then
    raise exception 'an arrival names the person who actually received the goods'
      using errcode = '22023', detail = 'receiver_required';
  end if;

  -- The register's location authority moves here, and nowhere else — and each
  -- unit lands in the status it left in, from the record made at request time.
  update ops_stock_items i
     set warehouse_id = v_t.to_warehouse_id,
         status       = u.status_before,
         updated_at   = now()
    from ops_stock_transfer_units u
   where u.transfer_id = p_transfer_id
     and i.id = u.stock_item_id;

  -- The IN leg, at the moment the goods actually landed.
  insert into stock_movements (sku, warehouse_id, qty, kind, ref, note, by_role, by_user_id)
  select i.sku, v_t.to_warehouse_id, sum(coalesce(i.qty, 1))::int, 'in',
         v_t.transfer_no, 'Transfer received', v_role, v_uid
    from ops_stock_transfer_units u
    join ops_stock_items i on i.id = u.stock_item_id
   where u.transfer_id = p_transfer_id
   group by i.sku;

  perform public.ops_rollup_stock_balances(v_t.from_warehouse_id);
  perform public.ops_rollup_stock_balances(v_t.to_warehouse_id);

  insert into ops_stock_transfer_events
    (transfer_id, kind, units, received_by_name, note, recorded_by)
  values
    (p_transfer_id, 'arrived', public.ops_stock_transfer_unit_set(p_transfer_id),
     btrim(p_received_by_name),
     nullif(btrim(coalesce(p_note,'')),''),
     v_uid)
  returning * into v_row;

  insert into audit_log (role, action, ref)
  values (v_role, 'ops_stock_transfer.arrive', v_t.transfer_no);

  return to_jsonb(v_row);
end;
$fn$;

comment on function public.ops_stock_transfer_arrive(uuid, text, text) is
  'DOOR 3 (0365): the destination receives. Only now does warehouse_id move and only the units this transfer carried enter the destination''s stock; each returns to the status recorded at request time, so a reserved unit lands reserved. Refuses an arrival that was never collected.';

-- ── 10 · DOOR 4 · Cancel transfer (pre-collection only) ──────────────────────
create or replace function public.ops_stock_transfer_cancel(
  p_transfer_id uuid,
  p_reason      text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role;
  v_uid  uuid;
  v_t    ops_stock_transfers;
  v_row  ops_stock_transfer_events;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden: only operation or principal cancels a transfer'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_uid := auth.uid();

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'a cancelled transfer says why'
      using errcode = '22023', detail = 'reason_required';
  end if;

  select * into v_t from ops_stock_transfers where id = p_transfer_id for update;
  if v_t.id is null then
    raise exception 'transfer not found'
      using errcode = '42P01', detail = 'transfer_not_found';
  end if;
  if exists (select 1 from ops_stock_transfer_events
              where transfer_id = p_transfer_id and kind = 'cancelled') then
    raise exception 'transfer % is already cancelled', v_t.transfer_no
      using errcode = 'P0001', detail = 'already_cancelled';
  end if;
  -- Once the goods are with the carrier there is no cancelling the journey that
  -- happened. The way back is a NEW return transfer.
  if exists (select 1 from ops_stock_transfer_events
              where transfer_id = p_transfer_id and kind = 'collected') then
    raise exception 'transfer % was already collected — send the goods back with a new transfer', v_t.transfer_no
      using errcode = 'P0001', detail = 'cancel_after_collection';
  end if;

  insert into ops_stock_transfer_events
    (transfer_id, kind, units, reason, recorded_by)
  values
    (p_transfer_id, 'cancelled', public.ops_stock_transfer_unit_set(p_transfer_id),
     btrim(p_reason), v_uid)
  returning * into v_row;

  insert into audit_log (role, action, ref)
  values (v_role, 'ops_stock_transfer.cancel', v_t.transfer_no);

  return to_jsonb(v_row);
end;
$fn$;

comment on function public.ops_stock_transfer_cancel(uuid, text) is
  'DOOR 4 (0365): cancels a transfer that has NOT been collected, with its reason. After collection it refuses — the way back is a new return transfer, never an undo of a journey that physically happened.';

-- ── 11 · grants ──────────────────────────────────────────────────────────────
revoke all on function public.ops_stock_transfer_unit_set(uuid) from public;
revoke all on function public.ops_stock_transfer_request(uuid, text, uuid, uuid, uuid[], text, date, text, text) from public;
revoke all on function public.ops_stock_transfer_collect(uuid, text, text, text) from public;
revoke all on function public.ops_stock_transfer_arrive(uuid, text, text) from public;
revoke all on function public.ops_stock_transfer_cancel(uuid, text) from public;

grant execute on function public.ops_stock_transfer_unit_set(uuid) to authenticated;
grant execute on function public.ops_stock_transfer_request(uuid, text, uuid, uuid, uuid[], text, date, text, text) to authenticated;
grant execute on function public.ops_stock_transfer_collect(uuid, text, text, text) to authenticated;
grant execute on function public.ops_stock_transfer_arrive(uuid, text, text) to authenticated;
grant execute on function public.ops_stock_transfer_cancel(uuid, text) to authenticated;

-- ── 12 · sanity — the shape this migration claims to have built ─────────────
do $$
declare
  v_missing text;
begin
  -- The three destinations exist.
  foreach v_missing in array array['ops_stock_transfers','ops_stock_transfer_units',
                                   'ops_stock_transfer_events'] loop
    if to_regclass('public.' || v_missing) is null then
      raise exception '0365 did not create %', v_missing;
    end if;
  end loop;

  -- Exactly one copy of each door.
  foreach v_missing in array array['ops_stock_transfer_request','ops_stock_transfer_collect',
                                   'ops_stock_transfer_arrive','ops_stock_transfer_cancel'] loop
    if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = v_missing) <> 1 then
      raise exception '0365 expects exactly one %', v_missing;
    end if;
  end loop;

  -- The append-only trigger is armed on BOTH events.
  if not exists (
    select 1 from pg_trigger
     where tgname = 'ops_stock_transfer_events_no_rewrite'
       and tgrelid = 'public.ops_stock_transfer_events'::regclass
       and (tgtype & 16) <> 0   -- UPDATE
       and (tgtype & 8)  <> 0   -- DELETE
  ) then
    raise exception '0365 expects the append-only trigger on UPDATE and DELETE';
  end if;

  -- The sites-differ law is structural, not advisory.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.ops_stock_transfers'::regclass
       and conname = 'ops_stock_transfers_sites_differ'
  ) then
    raise exception '0365 expects the same-site check';
  end if;

  -- `transferred` — the status this migration became the writer of — is still
  -- in the register's vocabulary.
  if (select pg_get_constraintdef(oid) from pg_constraint
       where conrelid = 'public.ops_stock_items'::regclass
         and conname = 'ops_stock_items_status_check') not like '%transferred%' then
    raise exception '0365 writes `transferred`, which the status check no longer admits';
  end if;

  -- No direct write reaches these tables: the doors are the only writers.
  if has_table_privilege('authenticated', 'public.ops_stock_transfer_events', 'INSERT') then
    raise exception '0365 expects no direct INSERT on the event log';
  end if;
end;
$$;
