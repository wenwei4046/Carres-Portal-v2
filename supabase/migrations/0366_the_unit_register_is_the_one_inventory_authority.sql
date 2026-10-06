-- =============================================================================
-- 0366_the_unit_register_is_the_one_inventory_authority.sql
-- WAREHOUSE UNIT AUTHORITY FOUNDATION
-- (card docs/cards/CARD-2026-08-20-warehouse-unit-authority.md; approved
--  Warehouse operating model in docs/stock/MASTER.md, owner-reviewed 2026-08-20.)
--
-- THE LAW THIS RECORDS
--
--   ONE AUTHORITY.  The exact physical Unit register (`ops_stock_items`) is the
--   only inventory authority. Every quantity anywhere is DERIVED from
--   identifiable Units and drills back to their ids. No rollup, no stored
--   total, no bulk quantity and no generic status may independently decide
--   whether goods can be offered (Stock MASTER §4; Architecture Law D).
--
--   ONE IDENTITY, FOREVER.  A Unit ID is minted once, is never duplicated, is
--   never reused after cancellation, delivery, supplier return, write-off or
--   disposal, and its row is never deleted (MASTER §3, Card §2).
--
--   ONE GOVERNED DOOR PER FACT.  Where, Who has it, condition protection,
--   ownership, identity correction and lifecycle end each change through one
--   SECURITY DEFINER door that leaves append-only evidence. There is no generic
--   Edit, Delete, Add stock, Remove stock or status selector (MASTER §2/§6,
--   Card §5).
--
-- WHAT THIS MIGRATION MEASURED ON LIVE BEFORE WRITING (2026-08-20)
--
--   · 136 units, of which 88 carry NO unit_code — the unique index is PARTIAL
--     (`where unit_code is not null`), so identity was optional.
--   · `ops_stock_items_write_internal` is `FOR ALL` to every internal user:
--     any internal session could INSERT, UPDATE or DELETE a Unit directly,
--     bypassing all fifteen governed doors.
--   · `operation_adjust_stock` writes `stock_balances.qty` by delta and never
--     touches a Unit — a stored total that decides availability on its own.
--   · `ops_rollup_stock_balances` uses count(*), not sum(qty), so the five live
--     bulk rows (qty 2 · 555 · 15 · 319 · 2) count as ONE unit each. Two
--     arithmetics that do not agree.
--   · Three raw reservation writers exist beside the governed pool draw
--     (POS post-receive labelling, the sofa loan claim and its rollback).
--   · `trg_po_units_follow_destination` DELETEs surplus incoming Units, so a
--     minted identity could simply vanish.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
--
--   · It does not build Transfers, Counts, Ready stock, the Stock Register, the
--     sidebar or month-end. `transferred` keeps the meaning PR #860 gives it
--     (custody has left the origin, the destination has not received) and this
--     migration only CONSUMES it as in-transit.
--   · It does not backfill, repair or clean imported rows. Every live row is
--     test data (Constitution §6). Minting the 88 missing identities is what
--     makes the NOT NULL satisfiable, not a repair worklist.
--   · It asserts NO production row count.
-- =============================================================================

set search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · OPERATING PARTIES — Site, party and role are three different things
--
-- Carres Klang Warehouse is a SITE (`warehouses`). NETS Warehouse and NETS
-- Delivery are operating-role identities and are NEVER Sites (MASTER §3). The
-- model never hard-codes NETS: the parties are rows, so a second 3PL or a
-- future Carres-operated warehouse needs a row, not a migration.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.stock_operating_parties (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  -- What the party DOES. A party may hold goods in a warehouse, carry them, or
  -- staff a showroom floor; the role is not the Site and not the permission.
  kind       text not null check (kind in
               ('warehouse_operator','delivery_operator','showroom','partner')),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.stock_operating_parties is
  '0366 — WHO HAS IT. Operating-role identities (warehouse operator, carrier, '
  'showroom, partner). A Site lives in `warehouses`; these are never Sites.';

insert into public.stock_operating_parties (code, name, kind)
values
  ('carres_warehouse', 'Carres Warehouse', 'warehouse_operator'),
  ('nets_warehouse',   'NETS Warehouse',   'warehouse_operator'),
  ('nets_delivery',    'NETS Delivery',    'delivery_operator'),
  ('pj_showroom',      'PJ Showroom',      'showroom')
on conflict (code) do nothing;

alter table public.stock_operating_parties enable row level security;

drop policy if exists stock_operating_parties_read on public.stock_operating_parties;
create policy stock_operating_parties_read on public.stock_operating_parties
  for select using ( ( select public.is_internal() ) );

-- Settings owns the party list (MASTER §11). No client write path exists here;
-- adding a party is a governed Settings act, not an operator edit.
grant select on public.stock_operating_parties to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · THE AUTHORITATIVE UNIT FACTS (Card §1)
--
-- Catalog reference, source order, Where and the condition/protection facts all
-- already exist on the register. What was missing is ownership, Who has it and
-- when the Unit was last physically verified.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.ops_stock_items
  add column if not exists ownership       text not null default 'carres_owned',
  add column if not exists holder_party_id uuid references public.stock_operating_parties(id),
  add column if not exists last_verified_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ops_stock_items_ownership_valid') then
    alter table public.ops_stock_items
      add constraint ops_stock_items_ownership_valid
      check (ownership in ('carres_owned','supplier_consignment'));
  end if;
  -- Consignment goods belong to somebody. An ownership word with no owner is
  -- exactly the valuation gap Finance reads this column for.
  if not exists (select 1 from pg_constraint where conname = 'ops_stock_items_consignment_names_supplier') then
    alter table public.ops_stock_items
      add constraint ops_stock_items_consignment_names_supplier
      check (ownership <> 'supplier_consignment'
             or length(btrim(coalesce(supplier, ''))) > 0);
  end if;
end $$;

comment on column public.ops_stock_items.ownership is
  '0366 — Carres Owned or Supplier Consignment. Purchasing owns the source; '
  'Finance reads it for valuation and may never write a physical fact.';
comment on column public.ops_stock_items.holder_party_id is
  '0366 — WHO HAS IT. The operating party currently responsible for the Unit. '
  'Independent of warehouse_id (WHERE): both change through their own door.';
comment on column public.ops_stock_items.last_verified_at is
  '0366 — when a person last physically confirmed this Unit (scan, count, '
  'inspection). Never inferred from an edit.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · IDENTITY PERMANENCE (Card §2)
--
-- The ID ledger is the thing that makes "never reused" enforceable. A code
-- enters it the moment it is minted and never leaves; the primary key then
-- refuses the code a second time even if its row were somehow gone.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.stock_unit_ids (
  unit_code text primary key,
  unit_id   uuid not null,
  minted_at timestamptz not null default now()
);

comment on table public.stock_unit_ids is
  '0366 — every Carres Unit ID ever minted. Append-only and never pruned: this '
  'is what makes "an ID is never reused" enforceable rather than a convention.';

alter table public.stock_unit_ids enable row level security;
drop policy if exists stock_unit_ids_read on public.stock_unit_ids;
create policy stock_unit_ids_read on public.stock_unit_ids
  for select using ( ( select public.is_internal() ) );
-- Read only, and only through RLS. The ledger is written by the birth trigger.
grant select on public.stock_unit_ids to authenticated;

-- Mint the identities that were never minted, then make identity compulsory.
update public.ops_stock_items
   set unit_code = public.gen_unit_code()
 where unit_code is null;

insert into public.stock_unit_ids (unit_code, unit_id)
select unit_code, id from public.ops_stock_items
on conflict (unit_code) do nothing;

alter table public.ops_stock_items
  alter column unit_code set default public.gen_unit_code(),
  alter column unit_code set not null;

drop index if exists ops_stock_items_unit_code_key;
create unique index if not exists ops_stock_items_unit_code_uq
  on public.ops_stock_items (unit_code);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ops_stock_items_unit_code_format') then
    alter table public.ops_stock_items
      add constraint ops_stock_items_unit_code_format
      check (unit_code ~ '^id-[a-z]{3}[0-9]{6}$');
  end if;
end $$;

-- The generator now asks the LEDGER, not the register. A code belonging to a
-- Unit that was cancelled, delivered, returned, written off or disposed of is
-- still taken, forever.
create or replace function public.gen_unit_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code    text;
  v_letters text := 'abcdefghijklmnopqrstuvwxyz';
  v_try     int := 0;
begin
  loop
    v_try := v_try + 1;
    v_code := 'id-'
      || substr(v_letters, 1 + floor(random()*26)::int, 1)
      || substr(v_letters, 1 + floor(random()*26)::int, 1)
      || substr(v_letters, 1 + floor(random()*26)::int, 1)
      || lpad(floor(random()*1000000)::int::text, 6, '0');
    exit when not exists (select 1 from public.stock_unit_ids where unit_code = v_code)
          and not exists (select 1 from public.ops_stock_items where unit_code = v_code);
    if v_try >= 100 then
      raise exception 'gen_unit_code: could not find a free code after 100 tries'
        using errcode = 'P0001', detail = 'unit_code_exhausted';
    end if;
  end loop;
  return v_code;
end;
$$;

revoke all on function public.gen_unit_code() from public;
revoke all on function public.gen_unit_code() from anon;

-- Every born Unit registers its identity. The ledger's primary key is what
-- refuses a duplicate, so this is a guard and not bookkeeping.
create or replace function public.trg_stock_unit_id_register()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.stock_unit_ids (unit_code, unit_id)
  values (new.unit_code, new.id);
  return null;
exception
  when unique_violation then
    raise exception 'unit id % is already taken and can never be reused', new.unit_code
      using errcode = 'P0001', detail = 'unit_code_reused';
end;
$$;

drop trigger if exists stock_unit_id_register on public.ops_stock_items;
create trigger stock_unit_id_register
  after insert on public.ops_stock_items
  for each row execute function public.trg_stock_unit_id_register();

-- A Unit is never deleted and never renamed. 0341 protected only committed
-- units; the approved model protects every one of them, because an identity
-- that can vanish is an identity Receiving can mint a second time.
create or replace function public.trg_stock_unit_identity_permanence()
returns trigger
language plpgsql
set search_path = public
as $$
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

  return new;
end;
$$;

drop trigger if exists stock_unit_identity_permanence on public.ops_stock_items;
create trigger stock_unit_identity_permanence
  before update or delete on public.ops_stock_items
  for each row execute function public.trg_stock_unit_identity_permanence();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · A BULK ROW MAY NEVER ACT AS SEVERAL RESERVABLE UNITS (Card §2/§6)
--
-- A `qty > 1` row is one record standing for N identical anonymous pieces — a
-- pillow line, not furniture. It cannot carry a customer's promise, because a
-- promise is made to ONE physical item, and it can never represent a sofa,
-- which is independently traceable by definition.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ops_stock_items_bulk_never_reserved') then
    alter table public.ops_stock_items
      add constraint ops_stock_items_bulk_never_reserved
      check (qty = 1
             or (status not in ('reserved','sold','transferred')
                 and reserved_ref is null
                 and sold_order_id is null));
  end if;
end $$;

-- "What kind of product is this?" is the CATALOG's answer and nobody else's
-- (Architecture §3.1 / D9). Nothing here reads the SKU text.
create or replace function public.stock_sku_category(p_sku text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select pm.category::text
    from public.product_skus ps
    join public.product_models pm on pm.id = ps.model_id
   where ps.sku = p_sku
   limit 1;
$$;

revoke all on function public.stock_sku_category(text) from public, anon;
grant execute on function public.stock_sku_category(text) to authenticated;

create or replace function public.trg_stock_unit_traceable_is_one()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.qty > 1 and public.stock_sku_category(new.sku) = 'sofa' then
    raise exception
      'a sofa is traced one by one — % cannot be a bulk row of %', new.sku, new.qty
      using errcode = 'P0001', detail = 'traceable_unit_not_bulk';
  end if;
  return new;
end;
$$;

drop trigger if exists stock_unit_traceable_is_one on public.ops_stock_items;
create trigger stock_unit_traceable_is_one
  before insert or update of qty, sku on public.ops_stock_items
  for each row execute function public.trg_stock_unit_traceable_is_one();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5 · APPEND-ONLY IDENTITY AND PHYSICAL EVENT LINEAGE (Card §1/§5)
--
-- The lineage is written by a TRIGGER, not by each door, so it cannot be
-- forgotten by the sixteenth writer. A row is never updated and never deleted:
-- a correction is a NEW event that names the fact it corrects.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.stock_unit_events (
  id         uuid primary key default gen_random_uuid(),
  unit_id    uuid not null references public.ops_stock_items(id),
  unit_code  text not null,
  event      text not null,
  from_value text,
  to_value   text,
  note       text,
  actor_id   uuid,
  event_at   timestamptz not null default now()
);

create index if not exists stock_unit_events_unit_idx
  on public.stock_unit_events (unit_id, event_at desc);

comment on table public.stock_unit_events is
  '0366 — append-only physical lineage of one Unit. Written by trigger from the '
  'register itself, so no door can move a Unit without leaving the event.';

alter table public.stock_unit_events enable row level security;
drop policy if exists stock_unit_events_read on public.stock_unit_events;
create policy stock_unit_events_read on public.stock_unit_events
  for select using ( ( select public.is_internal() ) );
-- Read only. No client writes an event; the register's own trigger does, so
-- no door can move a Unit without leaving one behind.
grant select on public.stock_unit_events to authenticated;

create or replace function public.trg_stock_unit_events_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'a unit event is never edited or deleted — record a new one'
    using errcode = 'P0001', detail = 'unit_event_append_only';
end;
$$;

drop trigger if exists stock_unit_events_append_only on public.stock_unit_events;
create trigger stock_unit_events_append_only
  before update or delete on public.stock_unit_events
  for each row execute function public.trg_stock_unit_events_append_only();

create or replace function public.trg_stock_unit_lineage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.stock_unit_events
      (unit_id, unit_code, event, from_value, to_value, note, actor_id)
    values (new.id, new.unit_code, 'unit_born', null, new.status,
            coalesce(new.source_ref, new.po_no), v_actor);
    return null;
  end if;

  if new.status is distinct from old.status then
    insert into public.stock_unit_events
      (unit_id, unit_code, event, from_value, to_value, note, actor_id)
    values (new.id, new.unit_code, 'status_changed', old.status, new.status,
            new.hold_reason, v_actor);
  end if;

  if new.warehouse_id is distinct from old.warehouse_id then
    insert into public.stock_unit_events
      (unit_id, unit_code, event, from_value, to_value, note, actor_id)
    values (new.id, new.unit_code, 'site_changed',
            old.warehouse_id::text, new.warehouse_id::text, null, v_actor);
  end if;

  if new.holder_party_id is distinct from old.holder_party_id then
    insert into public.stock_unit_events
      (unit_id, unit_code, event, from_value, to_value, note, actor_id)
    values (new.id, new.unit_code, 'holder_changed',
            old.holder_party_id::text, new.holder_party_id::text, null, v_actor);
  end if;

  if new.ownership is distinct from old.ownership then
    insert into public.stock_unit_events
      (unit_id, unit_code, event, from_value, to_value, note, actor_id)
    values (new.id, new.unit_code, 'ownership_changed',
            old.ownership, new.ownership, new.supplier, v_actor);
  end if;

  if new.condition is distinct from old.condition then
    insert into public.stock_unit_events
      (unit_id, unit_code, event, from_value, to_value, note, actor_id)
    values (new.id, new.unit_code, 'condition_changed',
            old.condition, new.condition, null, v_actor);
  end if;

  if new.hold_reason is distinct from old.hold_reason
     or new.needs_repair is distinct from old.needs_repair then
    insert into public.stock_unit_events
      (unit_id, unit_code, event, from_value, to_value, note, actor_id)
    values (new.id, new.unit_code, 'protection_changed',
            coalesce(old.hold_reason, case when old.needs_repair then 'repair' end),
            coalesce(new.hold_reason, case when new.needs_repair then 'repair' end),
            new.hold_release_note, v_actor);
  end if;

  if new.reserved_ref is distinct from old.reserved_ref then
    insert into public.stock_unit_events
      (unit_id, unit_code, event, from_value, to_value, note, actor_id)
    values (new.id, new.unit_code, 'reservation_changed',
            old.reserved_ref, new.reserved_ref, new.reserve_reason, v_actor);
  end if;

  if new.last_verified_at is distinct from old.last_verified_at
     and new.last_verified_at is not null then
    insert into public.stock_unit_events
      (unit_id, unit_code, event, from_value, to_value, note, actor_id)
    values (new.id, new.unit_code, 'verified',
            old.last_verified_at::text, new.last_verified_at::text, null, v_actor);
  end if;

  return null;
end;
$$;

drop trigger if exists stock_unit_lineage on public.ops_stock_items;
create trigger stock_unit_lineage
  after insert or update on public.ops_stock_items
  for each row execute function public.trg_stock_unit_lineage();


-- ─────────────────────────────────────────────────────────────────────────────
-- 6 · ONE AVAILABILITY ARITHMETIC (Card §3, Stock MASTER §4)
--
-- One function decides what a Unit's availability IS. Everything else — the
-- view, the alert, the shortage feed, the browser — reads its answer. The same
-- six words exist once in SQL and once in TypeScript
-- (packages/shared/src/unit-availability.ts), and a test pins them together.
--
--   ended         customer accepted, or the lifecycle ended some other way
--   in_transit    between confirmed handovers (PR #860's `transferred`)
--   incoming      ordered, not received — never available
--   reserved      bound by the Sales Order's exact-Unit binding
--   not_available issue, inspection, repair, missing component, other control
--   available     received, complete, unreserved, uncontrolled
--
-- RESERVED OUTRANKS CONTROL ON PURPOSE. Warehouse may protect a problematic
-- reserved Unit but never silently releases or substitutes it (MASTER §4), so
-- protecting one must not quietly hand it back to the pool. It is not
-- `available` either way, so no goods are offered twice.
--
-- AVAILABILITY IS A VIEW, NEVER A STORED NUMBER. A second copy that a trigger
-- keeps in step is still a second copy, and Architecture Law D is explicit
-- that a derived fact has ONE arithmetic — not two that currently agree. So
-- `stock_sku_availability` computes from the register every time it is read
-- and cannot be stale, and every screen that decides whether goods can be
-- offered reads IT.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.unit_availability(
  p_status       text,
  p_needs_repair boolean,
  p_hold_reason  text default null
)
returns text
language sql
immutable
as $$
  select case
    when p_status in ('sold','voided','returned_to_supplier','written_off') then 'ended'
    when p_status = 'transferred' then 'in_transit'
    when p_status = 'incoming'    then 'incoming'
    when p_status = 'reserved'    then 'reserved'
    when p_status = 'on_hold'     then 'not_available'
    when p_status = 'free' and coalesce(p_needs_repair, false) then 'not_available'
    when p_status = 'free'        then 'available'
    else 'not_available'
  end;
$$;

comment on function public.unit_availability(text, boolean, text) is
  '0366 — THE availability arithmetic. Nothing may re-derive it from a status, '
  'a stored total or a bulk quantity.';

-- AVAILABILITY IS NOT HISTORY. `ended` is the right bucket for a list — goods
-- that left are not stock, however they left — but it must never erase HOW they
-- left. Delivered to a customer, cancelled before it ever arrived, written off
-- and returned to the supplier are four different business facts, and Delivered
-- / history has to tell them apart. So the lifecycle outcome is its own
-- authoritative answer beside the availability word, never folded into it.
create or replace function public.unit_lifecycle_outcome(p_status text)
returns text
language sql
immutable
as $$
  select case p_status
    when 'sold'                 then 'delivered'
    when 'voided'               then 'cancelled_before_receipt'
    when 'written_off'          then 'written_off'
    when 'returned_to_supplier' then 'returned_to_supplier'
    else 'active'
  end;
$$;

comment on function public.unit_lifecycle_outcome(text) is
  '0366 — HOW a Unit''s life ended, or `active` while it has not. Physical '
  'disposal is a separate recorded fact from the write-off APPROVAL '
  '(MASTER §5) and is not a fifth word here until that fact exists.';

-- Every derived total drills to the exact contributing ids through this view.
-- `status` travels WITH the availability word on purpose: the six words are
-- the right buckets for a list, but Delivered / history has to tell a unit
-- delivered to a customer from one written off or returned to its supplier,
-- and it must do that without a second query or a second arithmetic.
create or replace view public.stock_unit_availability_v
with (security_invoker = true) as
  select i.id,
         i.unit_code,
         i.sku,
         public.stock_sku_category(i.sku)                                as category,
         i.warehouse_id,
         i.holder_party_id,
         i.ownership,
         i.supplier,
         i.po_no,
         i.status,
         i.condition,
         i.needs_repair,
         i.hold_reason,
         i.reserved_ref,
         i.sold_order_id,
         i.qty,
         i.date_in,
         i.sold_at,
         i.last_verified_at,
         public.unit_availability(i.status, i.needs_repair, i.hold_reason) as availability,
         public.unit_lifecycle_outcome(i.status)                           as lifecycle_outcome
    from public.ops_stock_items i;

comment on view public.stock_unit_availability_v is
  '0366 — the Unit register with its ONE availability answer, its lifecycle '
  'outcome, the catalog category and the source status. Every rollup drills '
  'back to these ids.';

-- THE ONE PLACE ANY SCREEN ASKS "how much of this can we offer?".
-- It SUMS `qty`: the superseded rollup used count(*), so the five live bulk
-- rows (2 · 555 · 15 · 319 · 2) counted as one unit each. Ended units are
-- excluded because goods that left are not stock.
create or replace view public.stock_sku_availability
with (security_invoker = true) as
  select v.sku,
         v.warehouse_id,
         sum(v.qty) filter (where v.availability in ('available','reserved','not_available'))::int as on_hand,
         sum(v.qty) filter (where v.availability = 'available')::int     as available,
         sum(v.qty) filter (where v.availability = 'reserved')::int      as reserved,
         sum(v.qty) filter (where v.availability = 'not_available')::int as not_available,
         sum(v.qty) filter (where v.availability = 'incoming')::int      as incoming,
         sum(v.qty) filter (where v.availability = 'in_transit')::int    as in_transit
    from public.stock_unit_availability_v v
   where v.availability <> 'ended'
   group by v.sku, v.warehouse_id;

comment on view public.stock_sku_availability is
  '0366 — THE availability authority. `available` is the only number that '
  'answers whether goods can be offered. Never compute qty − reserved.';

grant select on public.stock_unit_availability_v to authenticated;
grant select on public.stock_sku_availability   to authenticated;
grant execute on function public.unit_availability(text, boolean, text) to authenticated;
grant execute on function public.unit_lifecycle_outcome(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7 · `stock_balances` STOPS BEING AN AUTHORITY
--
-- It is not deleted, because eighteen live SECURITY DEFINER functions across
-- Orders, Purchasing, Receiving and Delivery still read it, and dragging them
-- into a Warehouse foundation card would be a worse change than this one. What
-- it loses is its INDEPENDENCE:
--
--   · nobody may write a total by hand — `operation_adjust_stock` is retired
--     and the write policy is gone;
--   · it is recomputed from the register by a statement trigger inside the
--     same transaction as the change, so it cannot drift;
--   · nothing that decides whether goods can be OFFERED reads it any more —
--     the alert, the shortage feed, the warehouse totals and the stock summary
--     all move to `stock_sku_availability` in this PR.
--
-- Its `low_threshold` / `high_threshold` stay: those are Settings, and
-- configuration is the part that survives go-live (Constitution §6).
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stock_balances_qty_nonneg') then
    alter table public.stock_balances
      add constraint stock_balances_qty_nonneg check (qty >= 0);
  end if;
end $$;

comment on table public.stock_balances is
  '0366 — NOT an authority. `qty`/`reserved` are derived from the unit register '
  'by trigger for the legacy RPCs that still read them; the alert thresholds '
  'beside them are Settings. Availability lives in stock_sku_availability.';

-- The rollup now SUMS `qty` and reads the one arithmetic.
create or replace function public.ops_rollup_stock_balances(p_wh uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('carres.stock_rollup', '1', true);

  insert into public.stock_balances (sku, warehouse_id, qty, reserved)
  select a.sku, a.warehouse_id, (a.available + a.reserved), a.reserved
    from public.stock_sku_availability a
   where a.warehouse_id = p_wh
     and (a.available + a.reserved) > 0
  on conflict (sku, warehouse_id)
    do update set
      qty        = excluded.qty,
      reserved   = excluded.reserved,
      updated_at = now();

  update public.stock_balances sb
     set qty = 0, reserved = 0, updated_at = now()
   where sb.warehouse_id = p_wh
     and not exists (
       select 1 from public.stock_sku_availability a
        where a.warehouse_id = p_wh
          and a.sku          = sb.sku
          and (a.available + a.reserved) > 0
     );

  perform set_config('carres.stock_rollup', '0', true);
end;
$$;

-- Derivation is STRUCTURAL, not a step somebody must remember. Any statement
-- that touches the register recomputes the affected Sites in the SAME
-- transaction, so the legacy totals can never hold a number the Units do not
-- support. (DELETE needs no trigger — §3 refuses it outright.)
create or replace function public.trg_stock_balances_derive_ins()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_wh uuid;
begin
  for v_wh in select distinct warehouse_id from newtab where warehouse_id is not null loop
    perform public.ops_rollup_stock_balances(v_wh);
  end loop;
  return null;
end;
$$;

create or replace function public.trg_stock_balances_derive_upd()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_wh uuid;
begin
  for v_wh in
    select distinct warehouse_id from (
      select warehouse_id from newtab
      union all
      select warehouse_id from oldtab
    ) t
    where warehouse_id is not null
  loop
    perform public.ops_rollup_stock_balances(v_wh);
  end loop;
  return null;
end;
$$;

drop trigger if exists stock_balances_derive_ins on public.ops_stock_items;
create trigger stock_balances_derive_ins
  after insert on public.ops_stock_items
  referencing new table as newtab
  for each statement execute function public.trg_stock_balances_derive_ins();

drop trigger if exists stock_balances_derive_upd on public.ops_stock_items;
create trigger stock_balances_derive_upd
  after update on public.ops_stock_items
  referencing new table as newtab old table as oldtab
  for each statement execute function public.trg_stock_balances_derive_upd();

-- Nobody writes a total by hand — not through PostgREST, and not through a
-- future function that forgets. The thresholds beside them stay editable.
create or replace function public.trg_stock_balances_derived_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('carres.stock_rollup', true), '0') = '1' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.qty <> 0 or new.reserved <> 0 then
      raise exception
        'a stock total is derived from the unit register, never written'
        using errcode = 'P0001', detail = 'stock_total_is_derived';
    end if;
    return new;
  end if;
  if new.qty is distinct from old.qty or new.reserved is distinct from old.reserved then
    raise exception
      'a stock total is derived from the unit register, never written'
      using errcode = 'P0001', detail = 'stock_total_is_derived';
  end if;
  return new;
end;
$$;

drop trigger if exists stock_balances_derived_only on public.stock_balances;
create trigger stock_balances_derived_only
  before insert or update on public.stock_balances
  for each row execute function public.trg_stock_balances_derived_only();

-- The alert reads the ONE number instead of recomputing qty − reserved, which
-- silently counted a unit in repair as sellable.
create or replace function public.operation_stock_alerts()
returns table(sku text, warehouse_id uuid, qty integer, reserved integer,
              effective integer, low_threshold integer, shortage integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role app_role;
begin
  v_role := public.app_role();

  if v_role not in ('operation', 'principal') then
    raise exception 'forbidden: logistics or principal only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  return query
    select sb.sku,
           sb.warehouse_id,
           coalesce(a.on_hand, 0)                                as qty,
           coalesce(a.reserved, 0)                               as reserved,
           coalesce(a.available, 0)                              as effective,
           sb.low_threshold,
           (sb.low_threshold - coalesce(a.available, 0))::int    as shortage
      from public.stock_balances sb
      left join public.stock_sku_availability a
        on a.sku = sb.sku and a.warehouse_id = sb.warehouse_id
     where sb.low_threshold is not null
       and coalesce(a.available, 0) < sb.low_threshold
     order by (sb.low_threshold - coalesce(a.available, 0)) desc,
              sb.sku asc;
end;
$$;

-- Bring every Site's legacy totals onto the one arithmetic straight away, so
-- the first read after deploy is already derived rather than inherited.
do $$
declare v_wh uuid;
begin
  for v_wh in select distinct warehouse_id from public.ops_stock_items where warehouse_id is not null loop
    perform public.ops_rollup_stock_balances(v_wh);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8 · THE FORBIDDEN DOORS CLOSE (Card §3/§5)
-- ─────────────────────────────────────────────────────────────────────────────

-- "Add stock / Remove stock" by delta, moving a total without ever naming a
-- physical Unit. Retired in place so an old client gets a sentence rather than
-- a silent divergence.
create or replace function public.operation_adjust_stock(
  p_sku text, p_warehouse_id uuid, p_delta integer, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception
    'stock is counted from the unit register — record what happened to the exact units'
    using errcode = 'P0001', detail = 'unit_authority_only';
end;
$$;

-- The pick-oldest-by-sku reservation editor that 0292's pool draw superseded.
-- It has had no caller since, and a second reservation writer is exactly what
-- the Sales Order owns alone (Card §4).
drop function if exists public.ops_stock_reserve(text, text, text, uuid);

-- A surplus incoming Unit is VOIDED, not deleted: the PO changed its mind
-- about the goods, and the identity already given to the supplier must survive
-- that. This is the same function 0307 wrote, with its three DELETEs replaced.
create or replace function public.trg_po_units_follow_destination()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_posts_stock   boolean;
  v_is_own        boolean;
  v_supplier_name text;
  v_row           record;
  v_have          int;
  v_want          int;
begin
  select (pd.warehouse_id is not null and pd.warehouse_id = new.warehouse_id)
    into v_posts_stock
    from public.purchasing_destinations pd
   where pd.id = new.destination_id;
  v_posts_stock := coalesce(v_posts_stock, false);

  select (kind = 'own') into v_is_own from public.warehouses where id = new.warehouse_id;
  v_is_own := coalesce(v_is_own, false);

  if not (v_posts_stock and v_is_own) then
    update public.ops_stock_items
       set status = 'voided', updated_at = now()
     where po_no = new.id and status = 'incoming';
    return null;
  end if;

  select name into v_supplier_name from public.suppliers where id = new.supplier_id;

  for v_row in
    select l.sku, sum(l.qty)::int as want
      from public.purchase_order_lines l
     where l.po_id = new.id
     group by l.sku
  loop
    select count(*) into v_have
      from public.ops_stock_items
     where po_no = new.id and sku = v_row.sku and status = 'incoming';

    v_want := v_row.want;

    if v_have < v_want then
      insert into public.ops_stock_items
        (unit_code, sku, warehouse_id, status, supplier, po_no, source_ref, date_in)
      select public.gen_unit_code(), v_row.sku, new.warehouse_id, 'incoming',
             v_supplier_name, new.id, 'po_mint', current_date
        from generate_series(1, v_want - v_have);
    elsif v_have > v_want then
      update public.ops_stock_items
         set status = 'voided', updated_at = now()
       where id in (
         select id from public.ops_stock_items
          where po_no = new.id and sku = v_row.sku and status = 'incoming'
          order by created_at desc
          limit v_have - v_want
       );
    end if;
  end loop;

  update public.ops_stock_items
     set status = 'voided', updated_at = now()
   where po_no = new.id and status = 'incoming'
     and sku not in (select sku from public.purchase_order_lines where po_id = new.id);

  return null;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9 · THE GOVERNED DOORS (Card §4/§5)
--
-- Each door owns ONE fact, states its own refusal in words, and leaves the
-- lineage behind through the trigger in §5. Between these and the doors that
-- already existed, there is no other way to touch a Unit.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.ops_stock_set_condition(
  p_item_id uuid, p_condition text, p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_operation() then
    raise exception 'forbidden' using errcode = '42501', detail = 'forbidden';
  end if;
  update public.ops_stock_items
     set condition = p_condition, updated_at = now()
   where id = p_item_id
  returning id into v_id;
  if v_id is null then
    raise exception 'unit not found' using errcode = 'P0001', detail = 'unit_not_found';
  end if;
  return v_id;
end;
$$;

create or replace function public.ops_stock_refurbish(p_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_operation() then
    raise exception 'forbidden' using errcode = '42501', detail = 'forbidden';
  end if;
  update public.ops_stock_items
     set needs_repair = true, updated_at = now()
   where id = p_item_id and status = 'free' and needs_repair = false
  returning id into v_id;
  if v_id is null then
    raise exception 'unit is not a free in-pool unit'
      using errcode = 'P0001', detail = 'unit_not_free';
  end if;
  return v_id;
end;
$$;

create or replace function public.ops_stock_refurbish_complete(p_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_operation() then
    raise exception 'forbidden' using errcode = '42501', detail = 'forbidden';
  end if;
  update public.ops_stock_items
     set condition = 'refurbished', needs_repair = false, updated_at = now()
   where id = p_item_id and needs_repair = true
  returning id into v_id;
  if v_id is null then
    raise exception 'unit is not in repair'
      using errcode = 'P0001', detail = 'unit_not_in_repair';
  end if;
  return v_id;
end;
$$;

-- THE ONE BINDING DOOR. The Sales Order decides WHICH exact Unit is promised;
-- this records the decision. It never picks, never substitutes and never
-- releases on its own — those belong to the order, not to Stock (Card §4).
-- It replaces the two raw reservation writers measured on live: the POS
-- post-receive labelling and the sofa-loan claim.
create or replace function public.ops_stock_bind_units(
  p_item_ids uuid[], p_ref text, p_note text default null
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare v_ids uuid[];
begin
  if not public.is_operation() then
    raise exception 'forbidden' using errcode = '42501', detail = 'forbidden';
  end if;
  if p_ref is null or btrim(p_ref) = '' then
    raise exception 'a reservation names the order it is for'
      using errcode = 'P0001', detail = 'ref_required';
  end if;

  if exists (
    select 1 from public.ops_stock_items
     where id = any(p_item_ids) and qty > 1
  ) then
    raise exception 'a bulk record cannot carry one customer''s promise'
      using errcode = 'P0001', detail = 'bulk_never_reserved';
  end if;

  with bound as (
    update public.ops_stock_items
       set status = 'reserved', reserved_ref = p_ref, updated_at = now()
     where id = any(p_item_ids)
       and status = 'free'
       and needs_repair = false
    returning id
  )
  select array_agg(id) into v_ids from bound;

  return coalesce(v_ids, '{}'::uuid[]);
end;
$$;

create or replace function public.ops_stock_unbind_unit(
  p_item_id uuid, p_ref text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_operation() then
    raise exception 'forbidden' using errcode = '42501', detail = 'forbidden';
  end if;
  update public.ops_stock_items
     set status = 'free', reserved_ref = null, updated_at = now()
   where id = p_item_id
     and status = 'reserved'
     and (p_ref is null or reserved_ref = p_ref)
  returning id into v_id;
  if v_id is null then
    raise exception 'unit is not reserved to that order'
      using errcode = 'P0001', detail = 'unit_not_bound';
  end if;
  return v_id;
end;
$$;

-- WHERE and WHO HAS IT move separately, because they are separate facts: a
-- Unit can sit in the Klang warehouse while NETS Delivery is responsible for
-- it, and it can change hands without changing Site.
create or replace function public.ops_stock_set_site(
  p_item_id uuid, p_warehouse_id uuid, p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_operation() then
    raise exception 'forbidden' using errcode = '42501', detail = 'forbidden';
  end if;
  if not exists (select 1 from public.warehouses where id = p_warehouse_id) then
    raise exception 'that site does not exist'
      using errcode = 'P0001', detail = 'site_not_found';
  end if;
  update public.ops_stock_items
     set warehouse_id = p_warehouse_id, updated_at = now()
   where id = p_item_id
  returning id into v_id;
  if v_id is null then
    raise exception 'unit not found' using errcode = 'P0001', detail = 'unit_not_found';
  end if;
  return v_id;
end;
$$;

create or replace function public.ops_stock_set_holder(
  p_item_id uuid, p_party_code text, p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_party uuid;
begin
  if not public.is_operation() then
    raise exception 'forbidden' using errcode = '42501', detail = 'forbidden';
  end if;
  if p_party_code is not null then
    select id into v_party from public.stock_operating_parties
     where code = p_party_code and active;
    if v_party is null then
      raise exception 'no active operating party called %', p_party_code
        using errcode = 'P0001', detail = 'party_not_found';
    end if;
  end if;
  update public.ops_stock_items
     set holder_party_id = v_party, updated_at = now()
   where id = p_item_id
  returning id into v_id;
  if v_id is null then
    raise exception 'unit not found' using errcode = 'P0001', detail = 'unit_not_found';
  end if;
  return v_id;
end;
$$;

-- Purchasing owns why Carres holds the goods, so it owns this correction.
create or replace function public.ops_stock_set_ownership(
  p_item_id uuid, p_ownership text, p_supplier text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_operation() then
    raise exception 'forbidden' using errcode = '42501', detail = 'forbidden';
  end if;
  if p_ownership not in ('carres_owned','supplier_consignment') then
    raise exception 'ownership is Carres Owned or Supplier Consignment'
      using errcode = 'P0001', detail = 'ownership_invalid';
  end if;
  update public.ops_stock_items
     set ownership = p_ownership,
         supplier  = case when p_ownership = 'supplier_consignment'
                          then coalesce(p_supplier, supplier) else supplier end,
         updated_at = now()
   where id = p_item_id
  returning id into v_id;
  if v_id is null then
    raise exception 'unit not found' using errcode = 'P0001', detail = 'unit_not_found';
  end if;
  return v_id;
end;
$$;

create or replace function public.ops_stock_verify_unit(p_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_operation() then
    raise exception 'forbidden' using errcode = '42501', detail = 'forbidden';
  end if;
  update public.ops_stock_items
     set last_verified_at = now(), updated_at = now()
   where id = p_item_id
  returning id into v_id;
  if v_id is null then
    raise exception 'unit not found' using errcode = 'P0001', detail = 'unit_not_found';
  end if;
  return v_id;
end;
$$;

-- Booking in the Klang ready-stock sheet is still possible, but it is a door
-- with a Site and a lineage, not a table insert. A sofa may never arrive
-- through it as a bulk row (§4's guard fires) and every row gets an identity.
create or replace function public.ops_stock_book_in_units(
  p_rows jsonb, p_warehouse_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_count int;
begin
  if not public.is_operation() then
    raise exception 'forbidden' using errcode = '42501', detail = 'forbidden';
  end if;
  if not exists (select 1 from public.warehouses where id = p_warehouse_id) then
    raise exception 'that site does not exist'
      using errcode = 'P0001', detail = 'site_not_found';
  end if;

  with ins as (
    insert into public.ops_stock_items
      (sku, warehouse_id, condition, status, qty, reserved_ref,
       supplier, po_no, source_ref, date_in, ownership)
    select r->>'sku',
           p_warehouse_id,
           coalesce(nullif(r->>'condition', ''), 'new'),
           coalesce(nullif(r->>'status', ''), 'free'),
           coalesce((r->>'qty')::int, 1),
           case when coalesce(nullif(r->>'status', ''), 'free') = 'reserved'
                then nullif(r->>'reservedRef', '') end,
           nullif(r->>'supplier', ''),
           nullif(r->>'poNo', ''),
           nullif(r->>'sourceRef', ''),
           nullif(r->>'dateIn', '')::date,
           coalesce(nullif(r->>'ownership', ''), 'carres_owned')
      from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
    returning 1
  )
  select count(*)::int into v_count from ins;

  return coalesce(v_count, 0);
end;
$$;

-- Settings, not inventory: the alert points beside the derived totals.
create or replace function public.ops_stock_set_thresholds(
  p_sku text, p_warehouse_id uuid, p_low integer, p_high integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_operation() then
    raise exception 'forbidden' using errcode = '42501', detail = 'forbidden';
  end if;
  insert into public.stock_balances (sku, warehouse_id, qty, reserved,
                                     low_threshold, high_threshold)
  values (p_sku, p_warehouse_id, 0, 0, p_low, p_high)
  on conflict (sku, warehouse_id) do update
    set low_threshold  = excluded.low_threshold,
        high_threshold = excluded.high_threshold,
        updated_at     = now();
end;
$$;

do $$
declare v_fn text;
begin
  foreach v_fn in array array[
    'public.ops_stock_set_condition(uuid, text, text)',
    'public.ops_stock_refurbish(uuid)',
    'public.ops_stock_refurbish_complete(uuid)',
    'public.ops_stock_bind_units(uuid[], text, text)',
    'public.ops_stock_unbind_unit(uuid, text)',
    'public.ops_stock_set_site(uuid, uuid, text)',
    'public.ops_stock_set_holder(uuid, text, text)',
    'public.ops_stock_set_ownership(uuid, text, text, text)',
    'public.ops_stock_verify_unit(uuid)',
    'public.ops_stock_book_in_units(jsonb, uuid)',
    'public.ops_stock_set_thresholds(text, uuid, integer, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10 · NO UNGOVERNED WRITE REMAINS (Card §5)
--
-- Until now `ops_stock_items_write_internal` was `FOR ALL` to every internal
-- session: any authenticated internal token could reserve, re-site or delete a
-- Unit straight through PostgREST, and the governed doors were a convention.
-- Reads stay open to internal roles; writes belong to the doors. SECURITY
-- DEFINER functions run as the owner and are unaffected.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists ops_stock_items_write_internal on public.ops_stock_items;
revoke insert, update, delete on public.ops_stock_items from authenticated, anon;

drop policy if exists stock_balances_write_operation on public.stock_balances;
revoke insert, update, delete on public.stock_balances from authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11 · SANITY — schema and arithmetic only.
--      This migration asserts NO production row count.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_missing int;
  v_dupes   int;
  v_drift   int;
begin
  select count(*) into v_missing from public.ops_stock_items where unit_code is null;
  if v_missing > 0 then
    raise exception '0366 sanity: % units still have no identity', v_missing;
  end if;

  select count(*) into v_dupes from (
    select unit_code from public.ops_stock_items group by unit_code having count(*) > 1
  ) t;
  if v_dupes > 0 then
    raise exception '0366 sanity: % unit ids appear twice', v_dupes;
  end if;

  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'ops_stock_items_unit_code_uq'
  ) then
    raise exception '0366 sanity: the unit id is not uniquely indexed';
  end if;

  if exists (
    select 1 from pg_index i
      join pg_class c on c.oid = i.indexrelid
     where c.relname = 'ops_stock_items_unit_code_uq' and i.indpred is not null
  ) then
    raise exception '0366 sanity: the unit id index is still partial';
  end if;

  if exists (
    select 1 from public.ops_stock_items i
     where not exists (select 1 from public.stock_unit_ids l where l.unit_code = i.unit_code)
  ) then
    raise exception '0366 sanity: an identity is missing from the id ledger';
  end if;

  -- The one arithmetic exists and answers its own six words.
  if public.unit_availability('free', false, null)        <> 'available'
     or public.unit_availability('free', true, null)      <> 'not_available'
     or public.unit_availability('incoming', false, null) <> 'incoming'
     or public.unit_availability('transferred', false, null) <> 'in_transit'
     or public.unit_availability('reserved', false, null) <> 'reserved'
     or public.unit_availability('on_hold', false, 'damaged') <> 'not_available'
     or public.unit_availability('sold', false, null)     <> 'ended' then
    raise exception '0366 sanity: unit_availability does not answer its own six words';
  end if;

  -- `ended` never erases how the life ended.
  if public.unit_lifecycle_outcome('sold')                 <> 'delivered'
     or public.unit_lifecycle_outcome('voided')            <> 'cancelled_before_receipt'
     or public.unit_lifecycle_outcome('written_off')       <> 'written_off'
     or public.unit_lifecycle_outcome('returned_to_supplier') <> 'returned_to_supplier'
     or public.unit_lifecycle_outcome('free')              <> 'active' then
    raise exception '0366 sanity: the lifecycle outcome is not distinguishable';
  end if;

  -- No ungoverned write path is left on either table.
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'ops_stock_items' and cmd <> 'SELECT'
  ) then
    raise exception '0366 sanity: a write policy still stands on the unit register';
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'stock_balances' and cmd <> 'SELECT'
  ) then
    raise exception '0366 sanity: a write policy still stands on stock_balances';
  end if;

  -- The legacy cache agrees with the authority, everywhere, right now.
  select count(*) into v_drift
    from public.stock_balances sb
    left join public.stock_sku_availability a
      on a.sku = sb.sku and a.warehouse_id = sb.warehouse_id
   where sb.qty      is distinct from coalesce(a.available + a.reserved, 0)
      or sb.reserved is distinct from coalesce(a.reserved, 0);
  if v_drift > 0 then
    raise exception '0366 sanity: % cached totals do not match the unit register', v_drift;
  end if;

  raise notice
    '0366 OK: one unit identity, one availability arithmetic, one governed door per fact';
end $$;
