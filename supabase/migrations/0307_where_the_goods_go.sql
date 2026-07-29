-- 0307_where_the_goods_go
--
-- P4 · a PO says where the supplier must send the goods, and prints it.
-- Design: docs/purchasing-execution-queue.md §P4 AUTHORITATIVE HANDOFF (Loo, 2026-07-29).
-- Words:  docs/COPY-STANDARD.md "Where the goods go — the PO destination words".
--
-- Nothing here invents a word, a warehouse or a business rule. AL and HOUZS are
-- DELIVERY ADDRESSES and never `warehouses` rows (Loo 2026-07-28) — Carres has
-- exactly one warehouse and a second warehouse entity would put goods we do not
-- count into every stock rollup.

-- =====================================================================
-- 1 · The destination list
-- =====================================================================
-- `warehouse_id` is the whole model: a destination that points at one of OUR
-- warehouses is where Carres inventory is recorded; a destination with NULL is
-- somewhere the goods physically go and we do not count them. That is Q1's
-- split (`purchase_orders.warehouse_id` = where inventory is recorded · the
-- destination = where the supplier sends it), and it is the same shape C9 used
-- for `holds` vs `owing`: two columns answering two questions is not a second
-- model.

create table if not exists public.purchasing_destinations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  warehouse_id  uuid references public.warehouses(id),
  address       text,
  is_default    boolean not null default false,
  active        boolean not null default true,
  sort_order    int  not null default 0,
  updated_by    uuid,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),

  -- ONE address, one source. A destination linked to a warehouse derives its
  -- address from that warehouse record, so it can never drift from it and
  -- `Address not set` can never be shown for `Carres Klang` (COPY-STANDARD).
  constraint purchasing_destinations_one_address
    check (warehouse_id is null or address is null),

  -- An empty string is not an address. Without this, `Address not set` would be
  -- a screen state a save could walk around.
  constraint purchasing_destinations_address_not_blank
    check (address is null or length(btrim(address)) > 0)
);

-- Exactly one active default (the card's item 4). A partial unique index rather
-- than a CHECK, because the rule is across rows.
create unique index if not exists purchasing_destinations_one_default
  on public.purchasing_destinations (is_default) where is_default;

alter table public.purchasing_destinations enable row level security;

-- Internal read only. NO write policy at all, so PostgREST cannot change a
-- destination or its address without going through the audited manager RPCs
-- (0303's discipline: the gate cannot be walked around).
drop policy if exists purchasing_destinations_read on public.purchasing_destinations;
create policy purchasing_destinations_read on public.purchasing_destinations
  for select using ((select public.is_internal()));

-- ---------------------------------------------------------------------
-- The seed is DERIVED, not typed (0303's rule).
-- `Carres Klang` comes from the own-warehouse record, so it cannot be seeded
-- under a name the warehouse does not have. The two external destinations are
-- the two Loo named, and they are seeded with NO address on purpose — the
-- Settings screen reads `Address not set` until a manager fills it, and the
-- document RPC below refuses to export a PO bound for an address nobody set.
-- ---------------------------------------------------------------------
insert into public.purchasing_destinations (name, warehouse_id, is_default, sort_order)
select w.name, w.id, true, 0
  from public.warehouses w
 where w.kind = 'own'
on conflict (name) do nothing;

insert into public.purchasing_destinations (name, warehouse_id, address, is_default, sort_order)
values ('AL Sungai Buloh', null, null, false, 1),
       ('HOUZS',           null, null, false, 2)
on conflict (name) do nothing;

-- Sanity: the locked words must be exactly what got seeded. If somebody renames
-- the warehouse, this migration FAILS rather than quietly printing a fourth
-- string onto a supplier's document.
do $$
declare v_n int;
begin
  select count(*) into v_n from public.purchasing_destinations
   where name in ('Carres Klang', 'AL Sungai Buloh', 'HOUZS');
  if v_n <> 3 then
    raise exception 'P4 seed: expected the three locked destination names, found %', v_n;
  end if;

  select count(*) into v_n from public.purchasing_destinations where is_default;
  if v_n <> 1 then
    raise exception 'P4 seed: expected exactly one default destination, found %', v_n;
  end if;

  select count(*) into v_n from public.purchasing_destinations
   where name = 'Carres Klang' and warehouse_id is not null;
  if v_n <> 1 then
    raise exception 'P4 seed: Carres Klang must be linked to the own warehouse';
  end if;
end $$;

-- =====================================================================
-- 2 · The PO carries the destination
-- =====================================================================

create or replace function public.purchasing_default_destination()
returns uuid
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select id from public.purchasing_destinations
   where is_default and active
   limit 1
$fn$;

alter table public.purchase_orders
  add column if not exists destination_id uuid references public.purchasing_destinations(id),
  add column if not exists delivery_instructions text;

update public.purchase_orders
   set destination_id = public.purchasing_default_destination()
 where destination_id is null;

alter table public.purchase_orders
  alter column destination_id set default public.purchasing_default_destination();

alter table public.purchase_orders
  alter column destination_id set not null;

-- =====================================================================
-- 3 · Nice Future does not deliver — Q3, in the EXISTING manager-only
--     purchasing supplier settings, with audit history
-- =====================================================================
-- Not a hard-coded slug (P1 spent a card deleting that habit) and not a new
-- `suppliers` boolean: the settings model can represent it, so it does.
-- The locked sentence `NETS collects from Nice Future and delivers to Carres
-- Klang.` is COMPOSED from these three facts, never stored as a sentence.

alter table public.purchasing_supplier_settings
  add column if not exists fixed_destination_id uuid references public.purchasing_destinations(id),
  add column if not exists collected_by_partner_id uuid references public.delivery_partners(id);

insert into public.purchasing_supplier_settings (supplier_id, fixed_destination_id, collected_by_partner_id)
select s.id,
       (select d.id from public.purchasing_destinations d where d.is_default),
       (select dp.id from public.delivery_partners dp where dp.name = 'NETS')
  from public.suppliers s
 where s.slug = 'nice-future'
on conflict (supplier_id) do update
   set fixed_destination_id    = excluded.fixed_destination_id,
       collected_by_partner_id = excluded.collected_by_partner_id;

do $$
declare v_n int;
begin
  select count(*) into v_n
    from public.purchasing_supplier_settings ss
    join public.suppliers s on s.id = ss.supplier_id
   where s.slug = 'nice-future'
     and ss.fixed_destination_id is not null
     and ss.collected_by_partner_id is not null;
  if v_n <> 1 then
    raise exception 'P4 seed: Nice Future collection rule not stored (found %)', v_n;
  end if;
end $$;

-- =====================================================================
-- 4 · The destination guard — who may change it, and when it freezes
-- =====================================================================
-- MEASURED 2026-07-29, and this is why the guard is wider than the handoff's
-- §2 freeze: `po_scoped_update` lets the SUPPLIER and the PARTNER update their
-- own `purchase_orders` rows over PostgREST, and
-- `enforce_partner_po_column_whitelist` is a BLACKLIST — a new column is
-- permitted by default. Without this trigger a supplier could redirect its own
-- goods and the document would print the new address. A gated front door with
-- an open side door is worse than no gate.
--
-- §2 (Loo): once ANY line has received_qty > 0 the destination is FROZEN and a
-- later change is REJECTED. No partial preservation, no automatic stock
-- reconciliation — a PO saying `AL Sungai Buloh` while half its units are
-- booked into Klang is a state the register cannot express.

create or replace function public.trg_po_destination_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_role     app_role;
  v_received int;
begin
  if new.destination_id is not distinct from old.destination_id then
    return new;
  end if;

  v_role := public.app_role();
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'forbidden: only operation or principal can change where the goods go'
      using errcode = '42501', detail = 'forbidden';
  end if;

  select coalesce(sum(received_qty), 0) into v_received
    from public.purchase_order_lines where po_id = old.id;

  if v_received > 0 then
    raise exception 'PO % has already received goods — where the goods go can no longer change', old.id
      using errcode = 'P0001', detail = 'destination_frozen';
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_po_destination_guard on public.purchase_orders;
create trigger trg_po_destination_guard
  before update on public.purchase_orders
  for each row execute function public.trg_po_destination_guard();

-- =====================================================================
-- 5 · trg_po_units_follow_destination
-- =====================================================================
-- The register must be correct WHICHEVER door created the PO and in WHATEVER
-- order the fields were set (handoff §3) — 0305/0306's rule that a stamp one
-- route writes is a stamp the other doors walk around.
--
-- MEASURED, and it changes the trigger's timing: `_operation_create_po_inner`
-- inserts the `purchase_orders` row FIRST and mints the `incoming` units later,
-- inside its per-line loop, AFTER each line insert. So an immediate AFTER
-- INSERT trigger on either table fires before the units it is supposed to
-- reconcile exist, and would do nothing. A DEFERRED CONSTRAINT TRIGGER runs at
-- end of transaction, by which time every line and every unit is there — which
-- is what makes "in whatever order the fields were set" literally true.
--
-- It only ever touches units still in `incoming`. Received, held, free, sold
-- and reserved units are untouched by construction, and §2's freeze blocks the
-- dangerous case upstream rather than handling it here.

create or replace function public.trg_po_units_follow_destination()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_posts_stock   boolean;
  v_is_own        boolean;
  v_supplier_name text;
  v_row           record;
  v_have          int;
  v_want          int;
begin
  -- The SAME predicate `operation_receive_po_with_do` uses, so the mint and the
  -- posting can never disagree about one PO.
  select (pd.warehouse_id is not null and pd.warehouse_id = new.warehouse_id)
    into v_posts_stock
    from public.purchasing_destinations pd
   where pd.id = new.destination_id;
  v_posts_stock := coalesce(v_posts_stock, false);

  select (kind = 'own') into v_is_own from public.warehouses where id = new.warehouse_id;
  v_is_own := coalesce(v_is_own, false);

  if not (v_posts_stock and v_is_own) then
    -- A non-warehouse destination leaves NO incoming inventory units.
    delete from public.ops_stock_items
     where po_no = new.id and status = 'incoming';
    return null;
  end if;

  select name into v_supplier_name from public.suppliers where id = new.supplier_id;

  -- Idempotent both ways: mint what is missing, remove only surplus `incoming`.
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
      delete from public.ops_stock_items
       where id in (
         select id from public.ops_stock_items
          where po_no = new.id and sku = v_row.sku and status = 'incoming'
          order by created_at desc
          limit v_have - v_want
       );
    end if;
  end loop;

  -- A sku that no longer has a line keeps no incoming units.
  delete from public.ops_stock_items
   where po_no = new.id and status = 'incoming'
     and sku not in (select sku from public.purchase_order_lines where po_id = new.id);

  return null;
end;
$fn$;

drop trigger if exists trg_po_units_follow_destination on public.purchase_orders;
create constraint trigger trg_po_units_follow_destination
  after insert or update of destination_id, warehouse_id on public.purchase_orders
  deferrable initially deferred
  for each row execute function public.trg_po_units_follow_destination();

-- =====================================================================
-- 6 · operation_receive_po_with_do — the FOUR anchored edits
-- =====================================================================
-- Extracted live with pg_get_functiondef() and edited at four anchors, each of
-- which was verified to occur EXACTLY ONCE in the live source before the edit.
-- Unchanged: received_qty · receipt evidence (do_file_path, do_number, photos)
-- · claims and their evidence gates · po_history · thread progression.
-- A non-warehouse destination creates NO balances, NO movements, NO stock items
-- and NO reservations.

create or replace function public.operation_receive_po_with_do(p_po_id text, p_do_file_path text, p_do_number text, p_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_po                 purchase_orders;
  v_role               app_role;
  v_uid                uuid;
  v_actor              text;
  v_was_relocated      boolean;
  v_is_own             boolean := false;
  v_posts_stock        boolean := false;
  v_supplier_name      text;
  v_line               jsonb;
  v_line_id            uuid;
  v_received_qty       int;
  v_damaged_add        int;
  v_wrong_add          int;
  v_damaged_total      int := 0;
  v_wrong_total        int := 0;
  v_claims_created     int := 0;
  v_damaged_claim      uuid;
  v_wrong_claim        uuid;
  v_category           text;
  v_wrong_type         text;
  v_photos             jsonb;
  v_existing_line      purchase_order_lines;
  v_sku                text;
  v_delta              int;
  v_freed              int;
  v_minted             int;
  v_held               int;
  v_units_held         int := 0;
  v_lines_updated      int := 0;
  v_thread             record;
  v_target_thread_stage operation_stage;
  v_target_sup_status  po_sup_status;
  v_threads_advanced   int := 0;
  v_reserve            record;
  v_thread_satisfied   boolean;
  v_outstanding        int;
begin
  if p_po_id is null or length(btrim(p_po_id)) = 0 then
    raise exception 'p_po_id required' using errcode = '22023', detail = 'invalid_input';
  end if;
  if p_do_file_path is null or length(btrim(p_do_file_path)) = 0 then
    raise exception 'p_do_file_path required' using errcode = '22023', detail = 'invalid_input';
  end if;
  if p_do_number is null or length(btrim(p_do_number)) = 0 then
    raise exception 'p_do_number required' using errcode = '22023', detail = 'invalid_input';
  end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'p_lines required (at least one line)' using errcode = '22023', detail = 'invalid_input';
  end if;

  v_uid  := auth.uid();
  v_role := public.app_role();

  if v_role not in ('operation', 'principal', 'partner') then
    raise exception 'forbidden: only logistics/principal/partner can receive POs'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if v_role = 'partner' then
    select * into v_po from purchase_orders
     where id = p_po_id and procurement_partner_id = public.app_partner_id()
     for update;
  else
    select * into v_po from purchase_orders where id = p_po_id for update;
  end if;
  if not found then
    raise exception 'PO not found or not assigned to caller'
      using errcode = '42501', detail = 'po_not_found_or_cross_tenant';
  end if;

  if v_po.status = 'received' then
    raise exception 'PO already fully received'
      using errcode = '22023', detail = 'already_received';
  end if;

  v_was_relocated := v_po.sup_status = 'relocated';
  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));

  -- R4: the per-unit register is Carres-owned scope (0154's rule, read the same
  -- way here as at PO-open so the two cannot drift).
  select (kind = 'own') into v_is_own from warehouses where id = v_po.warehouse_id;
  -- P4: the goods only become Carres stock when the supplier actually sent them
  -- to the warehouse this PO books into. A destination with no warehouse (AL,
  -- HOUZS) posts nothing — the quantities and the evidence still move.
  select (pd.warehouse_id is not null and pd.warehouse_id = v_po.warehouse_id)
    into v_posts_stock
    from purchasing_destinations pd
   where pd.id = v_po.destination_id;
  v_posts_stock := coalesce(v_posts_stock, false);
  v_is_own := coalesce(v_is_own, false);
  select name into v_supplier_name from suppliers where id = v_po.supplier_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_line_id := nullif(v_line->>'id', '')::uuid;
    v_received_qty := nullif(v_line->>'received_qty', '')::int;
    -- R1: what THIS delivery found wrong. Absent = 0, so a pre-R1 caller
    -- behaves exactly as before.
    v_damaged_add := coalesce(nullif(v_line->>'damaged_qty', '')::int, 0);
    v_wrong_add   := coalesce(nullif(v_line->>'wrong_item_qty', '')::int, 0);
    v_damaged_claim := null;
    v_wrong_claim   := null;

    if v_line_id is null or v_received_qty is null or v_received_qty < 0 then
      raise exception 'invalid line: id=%, received_qty=%', v_line_id, v_received_qty
        using errcode = '22023', detail = 'invalid_line';
    end if;
    if v_damaged_add < 0 or v_wrong_add < 0 then
      raise exception 'invalid line: damaged_qty=%, wrong_item_qty=%', v_damaged_add, v_wrong_add
        using errcode = '22023', detail = 'invalid_line';
    end if;

    select * into v_existing_line from purchase_order_lines
     where id = v_line_id and po_id = p_po_id for update;
    if not found then
      raise exception 'PO line not found for id=%', v_line_id using errcode = '42P01', detail = 'po_line_not_found';
    end if;

    v_sku := v_existing_line.sku;

    if v_received_qty > v_existing_line.qty then
      raise exception 'over-received: % > ordered %', v_received_qty, v_existing_line.qty
        using errcode = 'P0001', detail = 'over_received';
    end if;

    -- R1: one delivery may never account for more units than the line still
    -- owes. NOTE this is deliberately per-DO, not cumulative — a line ordered
    -- 10 can record 10 damaged and later 10 received once they are replaced.
    if v_received_qty + v_damaged_add + v_wrong_add > v_existing_line.qty then
      raise exception 'reported % units on a line of % (received % + damaged % + wrong %)',
                      v_received_qty + v_damaged_add + v_wrong_add, v_existing_line.qty,
                      v_received_qty, v_damaged_add, v_wrong_add
        using errcode = 'P0001', detail = 'report_exceeds_ordered';
    end if;

    v_delta := v_received_qty - v_existing_line.received_qty;
    if v_delta < 0 then
      raise exception 'received_qty must be >= currently received (%)', v_existing_line.received_qty
        using errcode = 'P0001', detail = 'received_qty_decrease';
    end if;

    -- R2: the problem becomes a CASE — before the counters move, because the
    -- guard trigger checks the counters against the claims that exist.
    if v_damaged_add > 0 or v_wrong_add > 0 then
      v_category := public.claim_product_category(v_sku);
    end if;

    if v_damaged_add > 0 then
      v_photos := public.supplier_claim_photo_entries(v_line->'damaged_photos', v_uid);
      if jsonb_array_length(v_photos) = 0 then
        raise exception 'damaged units on % need at least one photo', v_sku
          using errcode = 'P0001', detail = 'claim_evidence_required';
      end if;
      insert into supplier_claims (
        po_id, po_line_id, supplier_id, sku, product_category,
        claim_type, qty, do_number, photos, reported_by
      ) values (
        p_po_id, v_line_id, v_po.supplier_id, v_sku, v_category,
        'damaged', v_damaged_add, btrim(p_do_number), v_photos, v_uid
      )
      returning id into v_damaged_claim;
      v_claims_created := v_claims_created + 1;
    end if;

    if v_wrong_add > 0 then
      v_wrong_type := nullif(btrim(coalesce(v_line->>'wrong_item_claim_type', '')), '');
      if v_wrong_type is null then
        raise exception 'wrong-item units on % need a claim type', v_sku
          using errcode = 'P0001', detail = 'claim_type_required';
      end if;
      if not public.supplier_claim_type_allowed(v_category, v_wrong_type) then
        raise exception 'claim type % is not offered for a % item', v_wrong_type, v_category
          using errcode = 'P0001', detail = 'claim_type_invalid';
      end if;
      v_photos := public.supplier_claim_photo_entries(v_line->'wrong_item_photos', v_uid);
      if jsonb_array_length(v_photos) = 0 then
        raise exception 'wrong-item units on % need at least one photo', v_sku
          using errcode = 'P0001', detail = 'claim_evidence_required';
      end if;
      insert into supplier_claims (
        po_id, po_line_id, supplier_id, sku, product_category,
        claim_type, qty, do_number, photos, reported_by
      ) values (
        p_po_id, v_line_id, v_po.supplier_id, v_sku, v_category,
        v_wrong_type, v_wrong_add, btrim(p_do_number), v_photos, v_uid
      )
      returning id into v_wrong_claim;
      v_claims_created := v_claims_created + 1;
    end if;

    -- R1: the issue counters ACCUMULATE; received_qty keeps new-total semantics.
    update purchase_order_lines
       set received_qty   = v_received_qty,
           damaged_qty    = damaged_qty + v_damaged_add,
           wrong_item_qty = wrong_item_qty + v_wrong_add
     where id = v_line_id;

    v_damaged_total := v_damaged_total + v_damaged_add;
    v_wrong_total   := v_wrong_total + v_wrong_add;

    if v_delta > 0 and v_posts_stock then
      insert into stock_balances (sku, warehouse_id, qty)
        values (v_sku, v_po.warehouse_id, v_delta)
        on conflict (sku, warehouse_id)
        do update set qty = stock_balances.qty + v_delta, updated_at = now();

      insert into stock_movements (sku, warehouse_id, qty, kind, ref, by_role, by_user_id)
      values (v_sku, v_po.warehouse_id, v_delta, 'in', p_po_id, v_role, v_uid);

      with freed as (
        update ops_stock_items
           set status = 'free', updated_at = now()
         where id in (
           select id from ops_stock_items
            where po_no = p_po_id and sku = v_sku and status = 'incoming'
            order by created_at
            limit v_delta
         )
        returning 1
      )
      select count(*) into v_freed from freed;

      -- R4: a REPLACEMENT delivery has no `incoming` unit left to flip — the
      -- units this line minted at PO-open were used up by the first DO and by
      -- the hold. The goods are physically here, so mint the shortfall as new
      -- free units. Own warehouses only, the same condition the PO mint uses:
      -- a partner warehouse keeps having no per-unit register rather than
      -- growing one by accident. Without this the register silently drifts
      -- BELOW stock_balances and the next rollup takes the units back off.
      v_minted := 0;
      if v_is_own and v_freed < v_delta then
        insert into ops_stock_items
          (unit_code, sku, warehouse_id, status, supplier, po_no, source_ref, date_in)
        select public.gen_unit_code(), v_sku, v_po.warehouse_id, 'free',
               v_supplier_name, p_po_id, btrim(p_do_number), current_date
          from generate_series(1, v_delta - v_freed);
        v_minted := v_delta - v_freed;
      end if;

      v_lines_updated := v_lines_updated + 1;
    end if;

    -- R4: quarantine what we just raised a claim for. AFTER the free-flip, so
    -- the good units are taken first and the hold gets what is left — the
    -- physical units the operator set aside.
    if v_damaged_claim is not null then
      with held as (
        update ops_stock_items
           set status        = 'on_hold',
               hold_reason   = 'damaged',
               hold_claim_id = v_damaged_claim,
               held_at       = now(),
               updated_at    = now()
         where id in (
           select id from ops_stock_items
            where po_no = p_po_id and sku = v_sku and status = 'incoming'
            order by created_at
            limit v_damaged_add
         )
        returning 1
      )
      select count(*) into v_held from held;
      v_units_held := v_units_held + v_held;
    end if;

    if v_wrong_claim is not null then
      with held as (
        update ops_stock_items
           set status        = 'on_hold',
               hold_reason   = 'wrong_item',
               hold_claim_id = v_wrong_claim,
               held_at       = now(),
               updated_at    = now()
         where id in (
           select id from ops_stock_items
            where po_no = p_po_id and sku = v_sku and status = 'incoming'
            order by created_at
            limit v_wrong_add
         )
        returning 1
      )
      select count(*) into v_held from held;
      v_units_held := v_units_held + v_held;
    end if;
  end loop;

  for v_thread in
    select * from order_supplier_threads
     where po_id = p_po_id and operation_stage = 'in_production'
  loop
    select coalesce(bool_and(pol.received_qty >= pol.qty), true)
      into v_thread_satisfied
      from order_lines ol
      join product_skus ps on ps.sku = ol.sku
      join product_models pm on pm.id = ps.model_id
      left join purchase_order_lines pol
        on pol.po_id = p_po_id and pol.sku = ol.sku
     where ol.order_id = v_thread.order_id
       and ps.supplier_id = v_thread.supplier_id
       and pm.category::text = v_thread.category;

    if not v_thread_satisfied then
      continue;
    end if;

    if v_was_relocated then
      v_target_thread_stage := 'waiting';
    else
      v_target_thread_stage := case when v_thread.sop_name = 'SOFA_SPECIAL'
                                    then 'dispatched'
                                    else 'ready_to_dispatch'
                               end;
    end if;

    update order_supplier_threads
       set operation_stage = v_target_thread_stage,
           warehouse_id    = v_po.warehouse_id,
           reserved_at     = now(),
           updated_at      = now()
     where id = v_thread.id;

    v_threads_advanced := v_threads_advanced + 1;

    if v_posts_stock then
    for v_reserve in
      select ol.sku as sku, ol.qty as qty
        from order_lines ol
        join product_skus ps on ps.sku = ol.sku
        join product_models pm on pm.id = ps.model_id
       where ol.order_id = v_thread.order_id
         and ps.supplier_id = v_thread.supplier_id
         and pm.category::text = v_thread.category
    loop
      begin
        update stock_balances
           set reserved   = reserved + v_reserve.qty, updated_at = now()
         where sku = v_reserve.sku and warehouse_id = v_po.warehouse_id;
        if not found then
          raise exception 'no stock_balances row for sku=% wh=%', v_reserve.sku, v_po.warehouse_id
            using errcode = 'P0001', detail = 'insufficient_stock_for_reserve';
        end if;
      exception
        when check_violation then
          raise exception 'cannot reserve sku=% at wh=% (qty < reserved + %)',
                          v_reserve.sku, v_po.warehouse_id, v_reserve.qty
            using errcode = 'P0001', detail = 'insufficient_stock_for_reserve';
      end;
    end loop;
    end if;
  end loop;

  select count(*) into v_outstanding
    from purchase_order_lines where po_id = p_po_id and received_qty < qty;

  if v_outstanding = 0 then
    if v_was_relocated then
      v_target_sup_status := 'at_warehouse_waiting';
    else
      v_target_sup_status := 'delivered';
    end if;

    update purchase_orders
       set status         = 'received',
           sup_status     = v_target_sup_status,
           do_file_path   = p_do_file_path,
           do_uploaded_at = now(),
           do_uploaded_by = v_uid,
           updated_at     = now()
     where id = p_po_id;
  else
    update purchase_orders
       set do_file_path   = p_do_file_path,
           do_uploaded_at = now(),
           do_uploaded_by = v_uid,
           updated_at     = now()
     where id = p_po_id;
  end if;

  insert into po_history (po_id, text, by_role)
  values (p_po_id,
          format('Received with DO %s (%s path) — %s line(s), %s thread(s)%s',
                 btrim(p_do_number),
                 case when v_was_relocated then 'relocated→at_warehouse_waiting' else 'normal→delivered' end,
                 v_lines_updated, v_threads_advanced,
                 case when v_damaged_total + v_wrong_total > 0
                      then format(' · issue: %s damaged, %s wrong item · %s supplier claim(s) opened · %s unit(s) on hold',
                                  v_damaged_total, v_wrong_total, v_claims_created, v_units_held)
                      else '' end),
          v_role);

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('Received PO %s with DO %s', p_po_id, btrim(p_do_number)), p_po_id);

  return jsonb_build_object(
    'po_id',             p_po_id,
    'do_file_path',      p_do_file_path,
    'do_number',         btrim(p_do_number),
    'lines_updated',     v_lines_updated,
    'threads_advanced',  v_threads_advanced,
    'po_status',         (select status from purchase_orders where id = p_po_id),
    'sup_status',        (select sup_status from purchase_orders where id = p_po_id),
    'was_relocated',     v_was_relocated,
    'damaged_qty',       v_damaged_total,
    'wrong_item_qty',    v_wrong_total,
    'claims_created',    v_claims_created,
    'units_held',        v_units_held
  );
end;
$fn$;

-- =====================================================================
-- 7 · purchasing_po_document — the ONE database source for external PO documents
-- =====================================================================
-- The money is NOT removed from a template, it is ABSENT FROM THE PAYLOAD, so
-- no client can print what it never receives.
--
-- `attrs` is ALLOWLISTED, not blocklisted: `fabric_surcharge` is an RM amount
-- that today's template renders as `Walnut (+RM 250)` inside the description,
-- so a payload that passed `attrs` through would leak a price after every
-- explicit money field had been removed. The allowlist is the three keys the
-- external template actually reads; a new key is invisible until somebody adds
-- it here on purpose.

create or replace function public.purchasing_po_document(p_po_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_role     app_role;
  v_po       purchase_orders;
  v_dest     purchasing_destinations;
  v_address  text;
  v_lines    jsonb;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'forbidden: only operation or principal can export a PO document'
      using errcode = '42501', detail = 'forbidden';
  end if;

  select * into v_po from purchase_orders where id = p_po_id;
  if not found then
    raise exception 'PO % not found', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  if v_po.status = 'cancelled' then
    raise exception 'PO % is cancelled and cannot be exported', p_po_id
      using errcode = 'P0001', detail = 'po_not_printable';
  end if;

  select * into v_dest from purchasing_destinations where id = v_po.destination_id;

  -- One address, one source: our own warehouse carries its own, an external
  -- destination carries the one a manager set. A PO bound for an address nobody
  -- has given may not be exported or sent.
  if v_dest.warehouse_id is not null then
    select address into v_address from warehouses where id = v_dest.warehouse_id;
  else
    v_address := v_dest.address;
  end if;

  if v_address is null or length(btrim(v_address)) = 0 then
    raise exception 'no address on file for %', v_dest.name
      using errcode = 'P0001', detail = 'destination_address_missing';
  end if;

  select coalesce(jsonb_agg(x order by x->>'sku'), '[]'::jsonb) into v_lines
    from (
      select jsonb_build_object(
               'sku',         l.sku,
               'description', coalesce(ps.variant, l.sku),
               'qty',         l.qty,
               'unit',        'pc',
               'attrs',       (
                 select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
                   from jsonb_each(coalesce(l.attrs, '{}'::jsonb)) as e(k, v)
                  where k in ('color', 'gap', 'fabric_name')
               )
             ) as x
        from purchase_order_lines l
        left join product_skus ps on ps.sku = l.sku
       where l.po_id = p_po_id
    ) s;

  return jsonb_build_object(
    'po_number',   v_po.id,
    'po_id',       v_po.id,
    'issue_date',  to_char(coalesce(v_po.placed_at, now()), 'YYYY-MM-DD'),
    'supplier', jsonb_build_object(
      'name',    coalesce((select name from suppliers where id = v_po.supplier_id), 'Supplier'),
      'address', null,
      'contact', (select contact from suppliers where id = v_po.supplier_id)
    ),
    'destination', jsonb_build_object(
      'name',    v_dest.name,
      'address', v_address
    ),
    'delivery_instructions', nullif(btrim(coalesce(v_po.delivery_instructions, '')), ''),
    'eta_date',    v_po.eta_date,
    'lines',       v_lines,
    'terms',       null
  );
end;
$fn$;

revoke execute on function public.purchasing_po_document(text) from public, anon;
grant  execute on function public.purchasing_po_document(text) to authenticated;

-- =====================================================================
-- 8 · The manager-only setters (0303's gate + audit, reused verbatim)
-- =====================================================================

create or replace function public.purchasing_set_destination_address(p_destination_id uuid, p_address text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_role text := (select public.purchasing_settings_gate());
  v_dest purchasing_destinations;
  v_new  text := nullif(btrim(coalesce(p_address, '')), '');
begin
  select * into v_dest from purchasing_destinations where id = p_destination_id;
  if not found then
    raise exception 'unknown_destination' using errcode = '22023';
  end if;
  if v_dest.warehouse_id is not null then
    raise exception 'address_comes_from_the_warehouse' using errcode = '22023',
      detail = v_dest.name;
  end if;

  update purchasing_destinations
     set address = v_new, updated_by = auth.uid(), updated_at = now()
   where id = p_destination_id;

  perform purchasing_record_change(
    v_role, 'destination_address', null, null,
    v_dest.address, coalesce(v_new, ''),
    format('Purchasing setting · %s address %s -> %s',
           v_dest.name, coalesce(v_dest.address, '-'), coalesce(v_new, '-')));
end;
$fn$;

create or replace function public.purchasing_set_supplier_collection(
  p_supplier_id uuid, p_destination_id uuid, p_partner_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_role text := (select public.purchasing_settings_gate());
  v_old  text;
  v_new  text;
  v_name text;
begin
  if not exists (select 1 from suppliers where id = p_supplier_id) then
    raise exception 'unknown_supplier' using errcode = '22023';
  end if;
  if p_destination_id is not null
     and not exists (select 1 from purchasing_destinations where id = p_destination_id) then
    raise exception 'unknown_destination' using errcode = '22023';
  end if;
  if p_partner_id is not null
     and not exists (select 1 from delivery_partners where id = p_partner_id) then
    raise exception 'unknown_partner' using errcode = '22023';
  end if;

  select name into v_name from suppliers where id = p_supplier_id;
  select coalesce((select d.name from purchasing_destinations d where d.id = ss.fixed_destination_id), '-')
    into v_old
    from purchasing_supplier_settings ss where ss.supplier_id = p_supplier_id;

  insert into purchasing_supplier_settings
    (supplier_id, fixed_destination_id, collected_by_partner_id, updated_by, updated_at)
  values (p_supplier_id, p_destination_id, p_partner_id, auth.uid(), now())
  on conflict (supplier_id) do update
    set fixed_destination_id    = excluded.fixed_destination_id,
        collected_by_partner_id = excluded.collected_by_partner_id,
        updated_by              = excluded.updated_by,
        updated_at              = now();

  select coalesce((select name from purchasing_destinations where id = p_destination_id), '-')
    into v_new;

  perform purchasing_record_change(
    v_role, 'supplier_collection', p_supplier_id, null,
    v_old, v_new,
    format('Purchasing setting · %s goods go to %s -> %s', v_name, coalesce(v_old, '-'), v_new));
end;
$fn$;

revoke execute on function public.purchasing_set_destination_address(uuid, text) from public, anon;
grant  execute on function public.purchasing_set_destination_address(uuid, text) to authenticated;
revoke execute on function public.purchasing_set_supplier_collection(uuid, uuid, uuid) from public, anon;
grant  execute on function public.purchasing_set_supplier_collection(uuid, uuid, uuid) to authenticated;

-- =====================================================================
-- 9 · Revokes — the two open side doors (handoff §6)
-- =====================================================================
-- Both write `stock_balances` and both have ZERO call sites (verified
-- 2026-07-29: 0 web · 0 api · 0 from other functions · 0 triggers · 0 hard
-- dependents · pg_cron is not installed). They are NOT deleted and NOT
-- redesigned (Loo) — they lose the doors a browser can reach.
--
-- Both directions matter: `revoke ... from public` alone does not drop `anon`
-- on Supabase, and revoking `anon` alone leaves the PUBLIC grant standing.

revoke execute on function public.operation_receive_po_line(text, text, integer)
  from public, anon, authenticated;
revoke execute on function public.po_receive(text, text, text, integer, text)
  from public, anon, authenticated;
