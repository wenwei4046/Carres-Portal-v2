-- =============================================================================
-- 0424_outbound_hands_over_exact_units_and_the_holder_moves.sql
-- WAREHOUSE CARD 03 — Dashboard Calendar → exact-Unit Outbound handover
-- (docs/cards/CARD-2026-09-04-warehouse-03-dashboard-outbound.md §8;
--  docs/stock/MASTER.md §12.6; docs/delivery/MASTER.md §4;
--  docs/ERP-ARCHITECTURE.md §3.5.1).
--
-- WHAT 0363 COULD NOT SAY, AND THIS MIGRATION MAKES IT SAY:
--
--   · WHICH exact Units a Delivery Order requires — 0363 recorded [{sku,qty}].
--     The DO/leg scope now lives in `delivery_order_units`, snapshotted from
--     the ONE Sales Order allocation at issue time. Warehouse may not type,
--     add, substitute or remove the required IDs.
--   · A PARTIAL handover — 0363 allowed ONE `handed_over` fact per document.
--     A DO may now have multiple append-only handover batches; a Unit is
--     accepted ONCE for its scope (`delivery_handover_event_units`).
--   · WHO HAS IT — 0363 changed no holder. The same transaction that appends
--     an accepted batch now moves ONLY those Units' `holder_party_id` to the
--     governed Delivery operating party, and 0366's lineage trigger records
--     the holder history. A scheduled plan alone never moves authority.
--   · CHECK / PACK — per-Unit preparation facts (`delivery_unit_prep`),
--     scanned → checked → packed, recorded before a handover may accept.
--
-- Legacy 0363 rows remain readable, append-only and attributable. Nothing
-- rewrites old quantity evidence to look exact.
--
-- THE HOLDER IS NEVER CLIENT TEXT. The server resolves the Delivery operating
-- party from the DO's arrangement partner through the governed relationship
-- added here (`delivery_partners.operating_party_id`). Backfill mints one
-- delivery-operator identity per partner row (1:1 from the partner itself —
-- no display-name matching); the NETS partner links to the party 0366 already
-- seeded for exactly this duty (`nets_delivery`), by that seed's own CODE.
-- =============================================================================

-- ── 1 · the required exact-Unit scope of a Delivery Order ────────────────────
create table if not exists public.delivery_order_units (
  id                uuid primary key default gen_random_uuid(),
  delivery_order_id uuid not null references public.ops_delivery_orders(id) on delete restrict,
  item_id           uuid not null references public.ops_stock_items(id) on delete restrict,
  created_at        timestamptz not null default now(),
  unique (delivery_order_id, item_id)
);

create index if not exists delivery_order_units_item_idx
  on public.delivery_order_units (item_id);

comment on table public.delivery_order_units is
  '0424 — the exact Units one Delivery Order requires, snapshotted from the ONE Sales Order allocation at issue. Immutable: Warehouse may not type, add, substitute or remove the required IDs. required = handed over + not handed over derives from this scope (ERP-ARCHITECTURE §3.5.1).';

alter table public.delivery_order_units enable row level security;

drop policy if exists delivery_order_units_read_internal on public.delivery_order_units;
create policy delivery_order_units_read_internal
  on public.delivery_order_units
  for select using ((select public.is_internal()));

-- 0367's lesson: a NEW table inherits ALL grants. Revoke, including TRUNCATE.
revoke insert, update, delete, truncate on public.delivery_order_units
  from authenticated, anon;

-- The scope is immutable once written.
create or replace function public.delivery_order_units_immutable()
returns trigger
language plpgsql
as $fn$
begin
  raise exception 'a delivery order''s required Units are its scope — the scope is never edited'
    using errcode = 'P0001', detail = 'delivery_order_units_immutable';
end;
$fn$;

drop trigger if exists delivery_order_units_no_rewrite on public.delivery_order_units;
create trigger delivery_order_units_no_rewrite
  before update or delete on public.delivery_order_units
  for each row execute function public.delivery_order_units_immutable();

-- A Unit may sit in at most ONE live claim: another non-voided DO whose scope
-- still holds this Unit un-handed refuses the insert. (A voided document is
-- history; a Unit already handed over on an old document may be claimed by a
-- later governed journey — goods physically move on.)
create or replace function public.delivery_order_units_one_live_claim()
returns trigger
language plpgsql
as $fn$
declare
  v_other text;
begin
  select d.do_number into v_other
    from public.delivery_order_units u
    join public.ops_delivery_orders d on d.id = u.delivery_order_id
   where u.item_id = new.item_id
     and u.delivery_order_id <> new.delivery_order_id
     and d.voided_at is null
     and not exists (
       select 1 from public.delivery_handover_event_units eu
        where eu.delivery_order_id = u.delivery_order_id
          and eu.item_id = u.item_id
          and eu.recorded_side = 'warehouse')
   limit 1;
  if v_other is not null then
    raise exception 'this Unit is already required by % — one Unit, one live delivery claim', v_other
      using errcode = 'P0001', detail = 'unit_already_claimed';
  end if;
  return new;
end;
$fn$;

-- (created after §3 defines delivery_handover_event_units — see below)

-- ── 2 · per-Unit preparation facts: scanned → checked → packed ───────────────
create table if not exists public.delivery_unit_prep (
  id                uuid primary key default gen_random_uuid(),
  delivery_order_id uuid not null references public.ops_delivery_orders(id) on delete restrict,
  item_id           uuid not null references public.ops_stock_items(id) on delete restrict,
  fact              text not null check (fact in ('scanned','checked','packed')),
  recorded_by       uuid not null references auth.users(id),
  recorded_at       timestamptz not null default now(),
  unique (delivery_order_id, item_id, fact)
);

create index if not exists delivery_unit_prep_do_idx
  on public.delivery_unit_prep (delivery_order_id);

comment on table public.delivery_unit_prep is
  '0424 — append-only per-Unit Warehouse preparation facts for one DO scope: scanned → checked → packed. A duplicate submission is reconciled idempotently by the governed door; the rows themselves are never edited.';

alter table public.delivery_unit_prep enable row level security;

drop policy if exists delivery_unit_prep_read_internal on public.delivery_unit_prep;
create policy delivery_unit_prep_read_internal
  on public.delivery_unit_prep
  for select using ((select public.is_internal()));

revoke insert, update, delete, truncate on public.delivery_unit_prep
  from authenticated, anon;

create or replace function public.delivery_unit_prep_append_only()
returns trigger
language plpgsql
as $fn$
begin
  raise exception 'a preparation fact is history — it is never edited or deleted'
    using errcode = 'P0001', detail = 'delivery_unit_prep_append_only';
end;
$fn$;

drop trigger if exists delivery_unit_prep_no_rewrite on public.delivery_unit_prep;
create trigger delivery_unit_prep_no_rewrite
  before update or delete on public.delivery_unit_prep
  for each row execute function public.delivery_unit_prep_append_only();

-- ── 3 · handover batches name exact Units ────────────────────────────────────
-- 0363 allowed one event per (document, kind). A DO now takes MULTIPLE
-- append-only `handed_over` batches; `ready_for_handover` and
-- `received_by_logistics` remain once-per-document facts.
alter table public.delivery_handover_events
  drop constraint if exists delivery_handover_events_delivery_order_id_kind_key;

create unique index if not exists delivery_handover_events_once_per_kind
  on public.delivery_handover_events (delivery_order_id, kind)
  where kind <> 'handed_over';

create table if not exists public.delivery_handover_event_units (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references public.delivery_handover_events(id) on delete restrict,
  delivery_order_id uuid not null references public.ops_delivery_orders(id) on delete restrict,
  item_id           uuid not null references public.ops_stock_items(id) on delete restrict,
  -- WHOSE statement this row is: the Warehouse's accepted handover, or the
  -- Logistics receipt's own count. A mismatch keeps both sides' exact Units
  -- and overwrites neither (delivery MASTER §4); the unmatched IDs are the
  -- set difference of the two sides.
  recorded_side     text not null default 'warehouse'
                      check (recorded_side in ('warehouse','logistics')),
  -- A Unit is accepted ONCE per side for its document's scope: a duplicate
  -- scan or a repeated submission is refused here, not hidden by a client.
  unique (delivery_order_id, item_id, recorded_side)
);

create index if not exists delivery_handover_event_units_event_idx
  on public.delivery_handover_event_units (event_id);

comment on table public.delivery_handover_event_units is
  '0424 — the exact Units one accepted handover batch physically moved. A partial batch changes only these Units'' holder; required minus these remains open on the original date.';

alter table public.delivery_handover_event_units enable row level security;

drop policy if exists delivery_handover_event_units_read_internal
  on public.delivery_handover_event_units;
create policy delivery_handover_event_units_read_internal
  on public.delivery_handover_event_units
  for select using ((select public.is_internal()));

revoke insert, update, delete, truncate on public.delivery_handover_event_units
  from authenticated, anon;

create or replace function public.delivery_handover_event_units_append_only()
returns trigger
language plpgsql
as $fn$
begin
  raise exception 'an accepted handover Unit is history — it is never edited or deleted'
    using errcode = 'P0001', detail = 'handover_event_units_append_only';
end;
$fn$;

drop trigger if exists delivery_handover_event_units_no_rewrite
  on public.delivery_handover_event_units;
create trigger delivery_handover_event_units_no_rewrite
  before update or delete on public.delivery_handover_event_units
  for each row execute function public.delivery_handover_event_units_append_only();

-- Now that the accepted-Units table exists, the one-live-claim guard can read it.
drop trigger if exists delivery_order_units_single_claim on public.delivery_order_units;
create trigger delivery_order_units_single_claim
  before insert on public.delivery_order_units
  for each row execute function public.delivery_order_units_one_live_claim();

-- ── 4 · the governed Delivery holder relationship ────────────────────────────
alter table public.delivery_partners
  add column if not exists operating_party_id uuid
    references public.stock_operating_parties(id);

create unique index if not exists delivery_partners_operating_party_uq
  on public.delivery_partners (operating_party_id)
  where operating_party_id is not null;

comment on column public.delivery_partners.operating_party_id is
  '0424 — the goods-holder identity of this Logistics Partner (stock_operating_parties, kind delivery_operator). The handover transaction resolves WHO HAS IT from this relationship; the client never sends the destination holder as text.';

do $backfill$
declare
  v_nets_party uuid;
  v_nets_count int;
begin
  -- The NETS partner links to the delivery-duty identity 0366 seeded for it,
  -- addressed by that seed's own governed CODE — a one-time explicit link,
  -- guarded to exactly one unlinked partner, never a runtime name match.
  select id into v_nets_party
    from public.stock_operating_parties where code = 'nets_delivery';
  select count(*) into v_nets_count
    from public.delivery_partners where name = 'NETS' and operating_party_id is null;
  if v_nets_party is not null and v_nets_count = 1
     and not exists (select 1 from public.delivery_partners
                      where operating_party_id = v_nets_party) then
    update public.delivery_partners
       set operating_party_id = v_nets_party
     where name = 'NETS' and operating_party_id is null;
  end if;

  -- Every other partner mints its own delivery-operator identity, 1:1 from
  -- the partner row itself (code carries the partner id — deterministic).
  insert into public.stock_operating_parties (code, name, kind)
  select 'partner_' || dp.id, dp.name, 'delivery_operator'
    from public.delivery_partners dp
   where dp.operating_party_id is null
  on conflict (code) do nothing;

  update public.delivery_partners dp
     set operating_party_id = sop.id
    from public.stock_operating_parties sop
   where dp.operating_party_id is null
     and sop.code = 'partner_' || dp.id;
end;
$backfill$;

-- ── 5 · the scope is snapshotted when the system issues the document ─────────
-- The ONE issuing path materialises `ops_delivery_orders` rows; this trigger
-- rides it. A whole-order document (trip_groups empty) snapshots the exact
-- Units the Sales Order allocation binds. A split-trip document receives its
-- scope from its own future issuing door — absence stays absence, and the
-- writer below refuses a handover on a document with no recorded scope.
create or replace function public.delivery_order_units_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.voided_at is not null then return new; end if;
  if new.trip_groups is not null and array_length(new.trip_groups, 1) > 0 then
    return new;
  end if;
  insert into delivery_order_units (delivery_order_id, item_id)
  select new.id, i.id
    from ops_stock_items i
    join orders o on o.id = new.order_id
   where i.qty = 1
     and (i.sold_order_id = new.order_id or i.reserved_ref = 'SO-' || o.so)
  on conflict (delivery_order_id, item_id) do nothing;
  return new;
end;
$fn$;

drop trigger if exists delivery_order_units_snapshot on public.ops_delivery_orders;
create trigger delivery_order_units_snapshot
  after insert on public.ops_delivery_orders
  for each row execute function public.delivery_order_units_snapshot();

-- Backfill: every LIVE whole-order document gets the same deterministic
-- snapshot now. Split-trip documents are counted and surfaced, never guessed.
do $scope_backfill$
declare
  v_split int;
begin
  insert into public.delivery_order_units (delivery_order_id, item_id)
  select d.id, i.id
    from public.ops_delivery_orders d
    join public.orders o on o.id = d.order_id
    join public.ops_stock_items i
      on i.qty = 1
     and (i.sold_order_id = d.order_id or i.reserved_ref = 'SO-' || o.so)
   where d.voided_at is null
     and (d.trip_groups is null or array_length(d.trip_groups, 1) = 0)
  on conflict (delivery_order_id, item_id) do nothing;

  select count(*) into v_split
    from public.ops_delivery_orders d
   where d.voided_at is null
     and d.trip_groups is not null and array_length(d.trip_groups, 1) > 0;
  if v_split > 0 then
    raise notice '0424: % live split-trip document(s) have no deterministic exact-Unit scope — surfaced, not guessed; their scope arrives with the split issuing door', v_split;
  end if;
end;
$scope_backfill$;

-- ── 6 · the preparation door ─────────────────────────────────────────────────
create or replace function public.delivery_outbound_prep_record(
  p_do_id      uuid,
  p_fact       text,
  p_unit_codes text[]
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role         app_role;
  v_uid          uuid;
  v_warehouse_id uuid;
  v_do           ops_delivery_orders;
  v_items        uuid[];
  v_bad          text;
  v_missing      int;
  v_inserted     int;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal','warehouse') then
    raise exception 'forbidden: only operation, principal or a warehouse login records preparation'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_uid := auth.uid();
  if v_role = 'warehouse' then
    v_warehouse_id := public.app_warehouse_id();
    if v_warehouse_id is null then
      raise exception 'forbidden: this warehouse login is not bound to a warehouse'
        using errcode = '42501', detail = 'forbidden';
    end if;
  end if;

  if p_fact is null or p_fact not in ('scanned','checked','packed') then
    raise exception '% is not a preparation fact this door records', coalesce(p_fact,'null')
      using errcode = '22023', detail = 'bad_fact';
  end if;
  if p_unit_codes is null or array_length(p_unit_codes, 1) is null then
    raise exception 'preparation names the exact Unit IDs'
      using errcode = '22023', detail = 'units_required';
  end if;

  select * into v_do from ops_delivery_orders where id = p_do_id for update;
  if v_do.id is null then
    raise exception 'delivery order not found'
      using errcode = '42P01', detail = 'delivery_order_not_found';
  end if;
  if v_do.voided_at is not null then
    raise exception 'this delivery order was cancelled — a cancelled document has no preparation'
      using errcode = 'P0001', detail = 'delivery_order_voided';
  end if;

  -- Every code must be a Unit of THIS document's recorded scope; a warehouse
  -- login may prepare only Units at its own Site.
  select array_agg(i.id) into v_items
    from unnest(p_unit_codes) c(code)
    join ops_stock_items i on i.unit_code = c.code
    join delivery_order_units u
      on u.delivery_order_id = p_do_id and u.item_id = i.id
   where v_role <> 'warehouse' or i.warehouse_id = v_warehouse_id;
  if coalesce(array_length(v_items, 1), 0) <> array_length(p_unit_codes, 1) then
    select c.code into v_bad
      from unnest(p_unit_codes) c(code)
     where not exists (
       select 1 from ops_stock_items i
         join delivery_order_units u
           on u.delivery_order_id = p_do_id and u.item_id = i.id
        where i.unit_code = c.code
          and (v_role <> 'warehouse' or i.warehouse_id = v_warehouse_id))
     limit 1;
    raise exception '% is not a Unit this delivery order requires at your Site', coalesce(v_bad, 'a Unit')
      using errcode = 'P0001', detail = 'unit_not_in_scope';
  end if;

  -- A Unit already handed over needs no preparation — its work is done.
  select i.unit_code into v_bad
    from delivery_handover_event_units eu
    join ops_stock_items i on i.id = eu.item_id
   where eu.delivery_order_id = p_do_id
     and eu.recorded_side = 'warehouse'
     and eu.item_id = any(v_items)
   limit 1;
  if v_bad is not null then
    raise exception '% was already handed over on this delivery order', v_bad
      using errcode = 'P0001', detail = 'unit_already_handed_over';
  end if;

  -- The order is governed: checked needs scanned; packed needs checked.
  if p_fact in ('checked','packed') then
    select count(*) into v_missing
      from unnest(v_items) t(item_id)
     where not exists (
       select 1 from delivery_unit_prep p
        where p.delivery_order_id = p_do_id and p.item_id = t.item_id
          and p.fact = case p_fact when 'checked' then 'scanned' else 'checked' end);
    if v_missing > 0 then
      raise exception 'a Unit is % only after it is %',
        p_fact, case p_fact when 'checked' then 'scanned' else 'checked' end
        using errcode = 'P0001', detail = 'prep_out_of_order';
    end if;
  end if;

  -- Idempotent reconcile: an already-recorded fact is skipped, never doubled.
  insert into delivery_unit_prep (delivery_order_id, item_id, fact, recorded_by)
  select p_do_id, t.item_id, p_fact, v_uid
    from unnest(v_items) t(item_id)
  on conflict (delivery_order_id, item_id, fact) do nothing;
  get diagnostics v_inserted = row_count;

  return jsonb_build_object(
    'recorded', v_inserted,
    'alreadyRecorded', array_length(v_items, 1) - v_inserted);
end;
$fn$;

comment on function public.delivery_outbound_prep_record(uuid, text, text[]) is
  '0424 — records scanned/checked/packed for exact Units of one DO scope, in governed order, idempotently. Operation/Principal, or a warehouse login for Units at its own Site.';

-- ── 7 · the ONE handover door learns exact Units and moves the holder ────────
-- 0371's lesson: the old signature is DROPPED, not defaulted — a caller that
-- still speaks quantity-only must fail to compile, not silently succeed.
drop function if exists public.delivery_handover_record(uuid, text, text, text, jsonb, text, text);

create or replace function public.delivery_handover_record(
  p_do_id         uuid,
  p_kind          text,
  p_receiver_name text   default null,
  p_vehicle       text   default null,
  p_goods         jsonb  default null,
  p_note          text   default null,
  p_proof_path    text   default null,
  p_unit_codes    text[] default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role      app_role;
  v_uid       uuid;
  v_warehouse_id uuid;
  v_do        ops_delivery_orders;
  v_duty      text;
  v_company   text;
  v_counter   text;
  v_row       delivery_handover_events;
  v_line      text;
  v_items     uuid[];
  v_bad       text;
  v_party     uuid;
  v_required  int;
  v_accepted  int;
  v_n         int;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal','warehouse') then
    raise exception 'forbidden: only operation, principal or a warehouse login records a handover fact'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_uid := auth.uid();

  if p_kind is null or p_kind not in
     ('ready_for_handover','handed_over','received_by_logistics') then
    raise exception '% is not a handover fact this door records', coalesce(p_kind,'null')
      using errcode = '22023', detail = 'bad_kind';
  end if;
  -- Warehouse records physical Warehouse acts only — never the counterparty's
  -- receipt, never a Delivery Result (card §9).
  if v_role = 'warehouse' then
    if p_kind = 'received_by_logistics' then
      raise exception 'forbidden: logistics receipt is the receiving party''s own fact'
        using errcode = '42501', detail = 'forbidden';
    end if;
    v_warehouse_id := public.app_warehouse_id();
    if v_warehouse_id is null then
      raise exception 'forbidden: this warehouse login is not bound to a warehouse'
        using errcode = '42501', detail = 'forbidden';
    end if;
  end if;
  if p_goods is not null and jsonb_typeof(p_goods) <> 'array' then
    raise exception 'goods must be a list of {sku, qty}'
      using errcode = '22023', detail = 'bad_goods';
  end if;

  select * into v_do from ops_delivery_orders where id = p_do_id for update;
  if v_do.id is null then
    raise exception 'delivery order not found'
      using errcode = '42P01', detail = 'delivery_order_not_found';
  end if;
  if v_do.voided_at is not null then
    raise exception 'this delivery order was cancelled — a cancelled document has no handover'
      using errcode = 'P0001', detail = 'delivery_order_voided';
  end if;

  -- `ready_for_handover` and `received_by_logistics` stay once-per-document.
  if p_kind <> 'handed_over' and exists (
       select 1 from delivery_handover_events
        where delivery_order_id = p_do_id and kind = p_kind) then
    raise exception 'this fact is already recorded on % — history is never rewritten', v_do.do_number
      using errcode = 'P0001', detail = 'handover_fact_already_recorded';
  end if;
  if p_kind = 'received_by_logistics' and not exists (
       select 1 from delivery_handover_events
        where delivery_order_id = p_do_id and kind = 'handed_over') then
    raise exception 'logistics receipt is confirmed only after a handover is recorded'
      using errcode = 'P0001', detail = 'handover_out_of_order';
  end if;

  if p_kind = 'handed_over' then
    if p_receiver_name is null or btrim(p_receiver_name) = '' then
      raise exception 'a handover names the person who actually received the goods'
        using errcode = '22023', detail = 'receiver_required';
    end if;
    if p_proof_path is null or btrim(p_proof_path) = '' then
      raise exception 'a handover carries its proof — signature, photo or reply'
        using errcode = '22023', detail = 'proof_required';
    end if;

    -- The batch names its exact Units, and the document must carry a scope.
    select count(*) into v_required
      from delivery_order_units where delivery_order_id = p_do_id;
    if v_required = 0 then
      raise exception '% has no recorded exact-Unit scope — its scope must exist before goods leave', v_do.do_number
        using errcode = 'P0001', detail = 'exact_units_not_recorded';
    end if;
    if p_unit_codes is null or array_length(p_unit_codes, 1) is null then
      raise exception 'a handover names the exact Unit IDs it moves'
        using errcode = '22023', detail = 'units_required';
    end if;
    select count(distinct c.code) into v_n from unnest(p_unit_codes) c(code);
    if v_n <> array_length(p_unit_codes, 1) then
      raise exception 'a Unit appears twice in this batch — each Unit is accepted once'
        using errcode = 'P0001', detail = 'duplicate_unit_in_batch';
    end if;

    -- Every code is a Unit of THIS scope, at the caller's Site for a
    -- warehouse login, still with a warehouse-side holder, and not yet
    -- accepted. The Units are locked first (FOR UPDATE cannot ride an
    -- aggregate) so a concurrent batch cannot double-move them.
    perform 1
      from ops_stock_items i
      join delivery_order_units u
        on u.delivery_order_id = p_do_id and u.item_id = i.id
     where i.unit_code = any(p_unit_codes)
     for update of i;
    select array_agg(i.id) into v_items
      from unnest(p_unit_codes) c(code)
      join ops_stock_items i on i.unit_code = c.code
      join delivery_order_units u
        on u.delivery_order_id = p_do_id and u.item_id = i.id
     where v_role <> 'warehouse' or i.warehouse_id = v_warehouse_id;
    if coalesce(array_length(v_items, 1), 0) <> array_length(p_unit_codes, 1) then
      select c.code into v_bad
        from unnest(p_unit_codes) c(code)
       where not exists (
         select 1 from ops_stock_items i
           join delivery_order_units u
             on u.delivery_order_id = p_do_id and u.item_id = i.id
          where i.unit_code = c.code
            and (v_role <> 'warehouse' or i.warehouse_id = v_warehouse_id))
       limit 1;
      raise exception '% is not a Unit this delivery order requires at your Site', coalesce(v_bad, 'a Unit')
        using errcode = 'P0001', detail = 'unit_not_in_scope';
    end if;

    -- Already accepted for this scope? Refused, not silently reconciled —
    -- goods cannot physically leave twice.
    select i.unit_code into v_bad
      from delivery_handover_event_units eu
      join ops_stock_items i on i.id = eu.item_id
     where eu.delivery_order_id = p_do_id
       and eu.recorded_side = 'warehouse'
       and eu.item_id = any(v_items)
     limit 1;
    if v_bad is not null then
      raise exception '% was already handed over on % — a Unit is accepted once', v_bad, v_do.do_number
        using errcode = 'P0001', detail = 'unit_already_handed_over';
    end if;

    -- A Unit already with a carrier is not at the Warehouse to hand over.
    select i.unit_code into v_bad
      from ops_stock_items i
      join stock_operating_parties sop on sop.id = i.holder_party_id
     where i.id = any(v_items) and sop.kind = 'delivery_operator'
     limit 1;
    if v_bad is not null then
      raise exception '% is already with a delivery party — it is not at the Warehouse', v_bad
        using errcode = 'P0001', detail = 'unit_not_with_warehouse';
    end if;

    -- The physical checkpoint: every Unit scanned, checked and packed.
    select i.unit_code into v_bad
      from unnest(v_items) t(item_id)
      join ops_stock_items i on i.id = t.item_id
     where (select count(distinct p.fact) from delivery_unit_prep p
             where p.delivery_order_id = p_do_id and p.item_id = t.item_id
               and p.fact in ('scanned','checked','packed')) < 3
     limit 1;
    if v_bad is not null then
      raise exception '% is not ready — scan, check and pack every Unit before the handover', v_bad
        using errcode = 'P0001', detail = 'prep_incomplete';
    end if;

    -- WHO HAS IT next: the governed Delivery operating party, resolved from
    -- the document's own partner assignment — never from client text.
    select dp.operating_party_id into v_party
      from ops_delivery_arrangements a
      join delivery_partners dp on dp.id = a.partner_id
     where a.order_id = v_do.order_id and a.leg = 0;
    if v_party is null then
      raise exception 'no goods-holder identity is recorded for this delivery''s partner — assign the Logistics Partner first'
        using errcode = 'P0001', detail = 'partner_holder_not_recorded';
    end if;
  end if;

  if p_kind = 'received_by_logistics' then
    v_duty    := 'logistics';
    v_company := v_do.logistics_partner;
    v_counter := null;
  else
    v_duty    := 'warehouse';
    select w.name into v_company
      from orders o left join warehouses w on w.id = o.warehouse_id
     where o.id = v_do.order_id;
    v_counter := case when p_kind = 'handed_over' then v_do.logistics_partner end;
  end if;

  insert into delivery_handover_events
    (delivery_order_id, kind, duty, company, counterparty, receiver_name,
     vehicle, goods, note, proof_path, recorded_by)
  values
    (p_do_id, p_kind, v_duty, v_company, v_counter,
     nullif(btrim(coalesce(p_receiver_name,'')),''),
     nullif(btrim(coalesce(p_vehicle,'')),''),
     p_goods,
     nullif(btrim(coalesce(p_note,'')),''),
     nullif(btrim(coalesce(p_proof_path,'')),''),
     v_uid)
  returning * into v_row;

  if p_kind = 'handed_over' then
    insert into delivery_handover_event_units
      (event_id, delivery_order_id, item_id, recorded_side)
    select v_row.id, p_do_id, t.item_id, 'warehouse' from unnest(v_items) t(item_id);

    -- Only the accepted Units change WHO HAS IT — in this same transaction.
    -- 0366's lineage trigger records each holder change append-only.
    update ops_stock_items
       set holder_party_id = v_party, updated_at = now()
     where id = any(v_items);

    select count(*) into v_accepted
      from delivery_handover_event_units
     where delivery_order_id = p_do_id and recorded_side = 'warehouse';
  end if;

  -- The Logistics receipt may name ITS OWN exact Units — the counterparty's
  -- statement, preserved beside the Warehouse's, changing no holder and
  -- overwriting nothing. The unmatched IDs are the two sides' difference.
  if p_kind = 'received_by_logistics'
     and p_unit_codes is not null and array_length(p_unit_codes, 1) is not null then
    select c.code into v_bad
      from unnest(p_unit_codes) c(code)
     where not exists (
       select 1 from ops_stock_items i
         join delivery_order_units u
           on u.delivery_order_id = p_do_id and u.item_id = i.id
        where i.unit_code = c.code)
     limit 1;
    if v_bad is not null then
      raise exception '% is not a Unit this delivery order requires', v_bad
        using errcode = 'P0001', detail = 'unit_not_in_scope';
    end if;
    insert into delivery_handover_event_units
      (event_id, delivery_order_id, item_id, recorded_side)
    select v_row.id, p_do_id, i.id, 'logistics'
      from unnest(p_unit_codes) c(code)
      join ops_stock_items i on i.unit_code = c.code
    on conflict (delivery_order_id, item_id, recorded_side) do nothing;
  end if;

  v_line := case p_kind
    when 'ready_for_handover' then
      'Goods ready for handover — ' || v_do.do_number
    when 'handed_over' then
      'Handed over ' || array_length(v_items, 1) || ' of ' || v_required
        || ' Units to ' || coalesce(v_do.logistics_partner, 'logistics')
        || ' — received by ' || btrim(p_receiver_name) || ' (' || v_do.do_number || ')'
    else
      'Logistics confirmed receipt — ' || v_do.do_number || ' is out for delivery'
  end;
  insert into order_history (order_id, text, by_role)
  values (v_do.order_id, v_line, v_role);

  return to_jsonb(v_row) || jsonb_build_object(
    'acceptedUnits', coalesce(v_accepted, 0),
    'requiredUnits', coalesce(v_required, 0));
end;
$fn$;

comment on function public.delivery_handover_record(uuid, text, text, text, jsonb, text, text, text[]) is
  '0424 — the ONE handover door. handed_over names exact Units of the document''s recorded scope, requires scan/check/pack + receiver + proof, appends the batch and moves ONLY those Units'' holder to the partner''s governed operating party. Multiple partial batches; a Unit is accepted once. ready_for_handover / received_by_logistics stay once-per-document; a warehouse login may never record the logistics receipt.';

-- ── 8 · sanity — shape only, never a production row count ────────────────────
do $sanity$
declare
  v int;
begin
  -- The three new tables exist, carry RLS, and hold NO write grant.
  select count(*) into v from information_schema.tables
   where table_schema = 'public'
     and table_name in ('delivery_order_units','delivery_unit_prep','delivery_handover_event_units');
  if v is distinct from 3 then
    raise exception '0424 sanity: expected 3 new tables, found %', v;
  end if;

  select count(*) into v
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('delivery_order_units','delivery_unit_prep','delivery_handover_event_units')
     and grantee in ('authenticated','anon')
     and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE');
  if v is distinct from 0 then
    raise exception '0424 sanity: % write grant(s) survive on the new tables', v;
  end if;

  -- The once-per-kind rule survives for the two singleton kinds.
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and indexname = 'delivery_handover_events_once_per_kind') then
    raise exception '0424 sanity: the once-per-kind partial index is missing';
  end if;
  if exists (
    select 1 from pg_constraint
     where conname = 'delivery_handover_events_delivery_order_id_kind_key') then
    raise exception '0424 sanity: the 0363 one-event-per-document constraint survives';
  end if;

  -- The ONE door has exactly one signature — the exact-Unit one.
  select count(*) into v from pg_proc
   where proname = 'delivery_handover_record';
  if v is distinct from 1 then
    raise exception '0424 sanity: expected exactly one delivery_handover_record, found %', v;
  end if;

  -- Every delivery partner resolves a governed holder identity.
  select count(*) into v from public.delivery_partners
   where operating_party_id is null;
  if v is distinct from 0 then
    raise exception '0424 sanity: % delivery partner(s) resolve no goods-holder identity', v;
  end if;

  -- NEGATIVE CONTROL (0369''s lesson: prove a guard CAN fail): the write-grant
  -- assertion must be able to see a grant when one exists.
  select count(*) into v
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'authenticated'
     and privilege_type = 'SELECT'
     and table_name = 'delivery_order_units';
  if v is distinct from 1 then
    raise exception '0424 sanity negative control: the grant probe cannot see grants (found %)', v;
  end if;
end;
$sanity$;
