-- ============================================================================
-- 0426 — a posted receiving wears its GRN number, and only GRN Duty posts it
--        (owner instruction 2026-09-04 · purchasing/MASTER.md §6.1/§7.3 ·
--         ERP-ARCHITECTURE §3.4 Unit Reconciliation, owner ruling 2026-09-01)
--
-- Measured before this migration:
--   · the posting doors admit ANY operation/principal login (0314 §9, 0315 §1)
--     — the approved authority is GRN Duty, its dated cover, or an Operations
--     Superuser (spec 2026-08-29 §4);
--   · the GRN number is DERIVED in the browser (`receivingRecordNo`) while the
--     formal-document allocator (0381) sits unwired — MASTER §6.1 gives `GRN`
--     the PREFIX-YYYYMMDD-RRRR pool;
--   · no Actual Site, no arrival photo/video store, no Extra Qty record, no
--     idempotency key, no Amend/Void doors;
--   · units flip incoming→free OLDEST-FIRST by quantity — the 2026-09-01
--     ruling requires one physical result per expected Unit ID:
--     `Received · Received with issue · Not received`.
--
-- What this migration adds, in one engine (no second receipt writer):
--   §1  session columns: grn_no · actual_site_id · save_key · arrival_evidence
--       · extra_lines · the posted duty-evidence trio · a PO state snapshot
--   §2  receiving_unit_results — one physical result per governed Unit
--   §3  the shared validator learns per-Unit outcomes and extra lines
--   §4  operation_receive_po_with_do learns the Actual Site and exact-Unit
--       flips (5-arg; the 4-arg signature is dropped)
--   §5  office_receive_post — duty-gated, idempotent, GRN-stamped
--   §6  warehouse_receipt_check_in / _return — duty-gated, GRN-stamped,
--       idempotent on retry
--   §7  receiving_amend — reason + before/after + safe recalculation
--   §8  receiving_void — full reversal when safe; a named blocker otherwise
-- ============================================================================

begin;

set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- §1 · session columns
-- ---------------------------------------------------------------------------

alter table warehouse_receipts
  add column if not exists grn_no            text unique,
  add column if not exists actual_site_id    uuid references warehouses(id),
  add column if not exists save_key          uuid unique,
  add column if not exists arrival_evidence  jsonb not null default '[]'::jsonb,
  add column if not exists extra_lines       jsonb not null default '[]'::jsonb,
  add column if not exists posted_duty_holder uuid references app_users(id),
  add column if not exists posted_duty_cover  uuid references app_users(id),
  add column if not exists posted_authority   text
    check (posted_authority is null or posted_authority in ('grn_duty','cover','superuser')),
  add column if not exists po_status_before   text,
  add column if not exists sup_status_before  text;

comment on column warehouse_receipts.grn_no is
  '0426: the formal GRN number, allocated from the daily formal-document pool (0381) at posting. Null on drafts/submissions and on sessions posted before 0426 — those keep their derived display. Never reused, survives void.';
comment on column warehouse_receipts.actual_site_id is
  '0426: where the goods PHYSICALLY arrived. Never overwrites the source Deliver To; null means the PO''s own booked warehouse.';
comment on column warehouse_receipts.save_key is
  '0426: client idempotency key. A retried Save Receiving with the same key returns the first posting instead of minting a second GRN.';
comment on column warehouse_receipts.arrival_evidence is
  '0426: arrival photo/video evidence — [{"path": text, "kind": "photo"|"video"}].';
comment on column warehouse_receipts.extra_lines is
  '0426: extra goods recorded separately — [{"sku": text, "qty": int, "note": text}]. Extra goods never enter Inventory and never alter ordered/pending arithmetic.';

-- The consignment SOURCE fact. One Receiving engine handles purchased AND
-- supplier-consignment arrivals (purchasing/MASTER.md §7.6): a consignment
-- source's received Units stay supplier-owned (`ops_stock_items.ownership =
-- 'supplier_consignment'`, 0366) and receipt creates NO payable — nothing in
-- the receive engine touches Finance/AP, and the tests pin that. The future
-- Consignment Order door stamps this flag at issue; nothing else writes it.
alter table purchase_orders
  add column if not exists is_consignment boolean not null default false;
comment on column purchase_orders.is_consignment is
  '0426: true when this supplier commitment is a consignment placement — received Units remain supplier-owned and receipt creates no payable. Stamped at issue by the consignment door; Receiving only reads it.';

-- ---------------------------------------------------------------------------
-- §2 · one physical result per governed Unit
-- ---------------------------------------------------------------------------

create table if not exists public.receiving_unit_results (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references warehouse_receipts(id) on delete restrict,
  stock_item_id uuid not null references ops_stock_items(id),
  unit_code text not null,
  outcome text not null check (outcome in ('received','received_with_issue','not_received')),
  issue_kind text check (issue_kind is null or issue_kind in ('damaged','wrong_item')),
  note text,
  created_at timestamptz not null default now(),
  constraint receiving_unit_once_per_session unique (receipt_id, stock_item_id),
  constraint receiving_issue_kind_pairs check (
    (outcome = 'received_with_issue') = (issue_kind is not null)
  )
);

comment on table public.receiving_unit_results is
  '0426: ERP-ARCHITECTURE §3.4 — one physical result for each expected Unit ID: Received · Received with issue · Not received. Written only inside the posting doors, in the posting transaction. Expected Units = Received Units + Not received Units.';

create index if not exists receiving_unit_results_receipt_idx
  on public.receiving_unit_results (receipt_id);
create index if not exists receiving_unit_results_item_idx
  on public.receiving_unit_results (stock_item_id);

alter table public.receiving_unit_results enable row level security;
drop policy if exists receiving_unit_results_read on public.receiving_unit_results;
create policy receiving_unit_results_read on public.receiving_unit_results
  for select using ((select public.is_internal()));
revoke insert, update, delete on public.receiving_unit_results from authenticated, anon;

-- ---------------------------------------------------------------------------
-- §3 · the shared validator — the ONE copy of the counting/evidence law
--      grows per-Unit outcomes and keeps quantity lines for goods without
--      governed Units (ERP-ARCHITECTURE §3.5.1 permits quantity scope for
--      governed interchangeable goods)
-- ---------------------------------------------------------------------------

create or replace function public.warehouse_receipt_validate_lines(
  p_po_id text,
  p_lines jsonb,
  p_uid   uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_line jsonb; v_line_id uuid; v_recv int; v_damaged int; v_wrong int;
  v_type text; v_pol purchase_order_lines; v_reportable int;
  v_counted int := 0; v_clean jsonb := '[]'::jsonb;
  v_units jsonb; v_unit jsonb; v_ucode text; v_uitem ops_stock_items;
  v_outcome text; v_u_recv int; v_u_dmg int; v_u_wrong int; v_u_notrecv int;
  v_seen text[]; v_clean_units jsonb;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'p_lines required (at least one line)'
      using errcode = '22023', detail = 'invalid_input';
  end if;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_line_id := nullif(v_line->>'id', '')::uuid;
    v_recv    := coalesce(nullif(v_line->>'received_now', '')::int, 0);
    v_damaged := coalesce(nullif(v_line->>'damaged_qty', '')::int, 0);
    v_wrong   := coalesce(nullif(v_line->>'wrong_item_qty', '')::int, 0);
    if v_line_id is null then
      raise exception 'invalid line: missing id' using errcode = '22023', detail = 'invalid_line';
    end if;
    if v_recv < 0 or v_damaged < 0 or v_wrong < 0 then
      raise exception 'invalid line: negative quantity' using errcode = '22023', detail = 'invalid_line';
    end if;
    select * into v_pol from purchase_order_lines where id = v_line_id and po_id = p_po_id;
    if not found then
      raise exception 'PO line not found for id=%', v_line_id using errcode = '42P01', detail = 'po_line_not_found';
    end if;
    v_reportable := greatest(0, v_pol.qty - least(v_pol.qty, v_pol.received_qty));
    if v_recv + v_damaged + v_wrong > v_reportable then
      raise exception 'line % counts % units but the PO still owes %',
                      v_pol.sku, v_recv + v_damaged + v_wrong, v_reportable
        using errcode = 'P0001', detail = 'line_over_reported';
    end if;

    -- Per-Unit outcomes, when the operator scanned governed Units. The unit
    -- list and the quantities are ONE fact: the quantities are re-derived
    -- from the outcomes so the two can never disagree.
    v_units := v_line->'units';
    v_clean_units := '[]'::jsonb;
    if v_units is not null and jsonb_typeof(v_units) = 'array'
       and jsonb_array_length(v_units) > 0 then
      v_seen := '{}'::text[];
      v_u_recv := 0; v_u_dmg := 0; v_u_wrong := 0; v_u_notrecv := 0;
      for v_unit in select * from jsonb_array_elements(v_units) loop
        v_ucode := public.normalise_unit_id(coalesce(v_unit->>'unit_code', ''));
        v_outcome := coalesce(v_unit->>'outcome', '');
        if v_outcome not in ('received','received_with_issue','not_received') then
          raise exception 'unit % has no valid outcome', coalesce(v_unit->>'unit_code','?')
            using errcode = '22023', detail = 'unit_outcome_invalid';
        end if;
        select * into v_uitem from ops_stock_items
         where public.normalise_unit_id(unit_code) = v_ucode
           and po_no = p_po_id;
        if not found then
          -- A Unit on another PO/CO or unknown to this source.
          raise exception 'Unit % does not belong to %', coalesce(v_unit->>'unit_code','?'), p_po_id
            using errcode = 'P0001', detail = 'unit_not_on_this_po';
        end if;
        if v_uitem.unit_code = any(v_seen) then
          raise exception 'Unit % was scanned twice', v_uitem.unit_code
            using errcode = 'P0001', detail = 'unit_scanned_twice';
        end if;
        v_seen := v_seen || v_uitem.unit_code;
        if v_uitem.status <> 'incoming' then
          raise exception 'Unit % was already received (session for %)', v_uitem.unit_code, p_po_id
            using errcode = 'P0001', detail = 'unit_already_received';
        end if;
        if v_uitem.sku <> v_pol.sku then
          raise exception 'Unit % is a % unit, not %', v_uitem.unit_code, v_uitem.sku, v_pol.sku
            using errcode = 'P0001', detail = 'unit_not_on_this_line';
        end if;
        if v_outcome = 'received' then v_u_recv := v_u_recv + 1;
        elsif v_outcome = 'not_received' then v_u_notrecv := v_u_notrecv + 1;
        else
          if coalesce(v_unit->>'issue_kind', '') = 'wrong_item' then v_u_wrong := v_u_wrong + 1;
          else v_u_dmg := v_u_dmg + 1;
          end if;
        end if;
        v_clean_units := v_clean_units || jsonb_build_array(jsonb_build_object(
          'stock_item_id', v_uitem.id,
          'unit_code', v_uitem.unit_code,
          'outcome', v_outcome,
          'issue_kind', case when v_outcome = 'received_with_issue'
                             then coalesce(nullif(v_unit->>'issue_kind',''), 'damaged')
                             else null end,
          'note', nullif(btrim(coalesce(v_unit->>'note','')), '')));
      end loop;
      -- The scanned outcomes ARE the quantities (Expected = Received + Not
      -- received; Received with issue is a subset of Received, split by kind).
      v_recv := v_u_recv; v_damaged := v_u_dmg; v_wrong := v_u_wrong;
      if v_recv + v_damaged + v_wrong > v_reportable then
        raise exception 'line % scans % received units but the PO still owes %',
                        v_pol.sku, v_recv + v_damaged + v_wrong, v_reportable
          using errcode = 'P0001', detail = 'line_over_reported';
      end if;
    end if;

    if v_damaged > 0 then
      if jsonb_array_length(public.supplier_claim_photo_entries(v_line->'damaged_photos', p_uid)) = 0 then
        raise exception 'damaged units on % need at least one photo', v_pol.sku
          using errcode = 'P0001', detail = 'damaged_photo_required';
      end if;
    end if;
    if v_wrong > 0 then
      v_type := nullif(btrim(coalesce(v_line->>'wrong_item_claim_type', '')), '');
      if v_type is null then
        raise exception 'wrong-item units on % need a claim type', v_pol.sku
          using errcode = 'P0001', detail = 'wrong_item_type_required';
      end if;
      if not public.supplier_claim_type_allowed(public.claim_product_category(v_pol.sku), v_type) then
        raise exception 'claim type % is not offered for %', v_type, v_pol.sku
          using errcode = 'P0001', detail = 'wrong_item_type_invalid';
      end if;
      if jsonb_array_length(public.supplier_claim_photo_entries(v_line->'wrong_item_photos', p_uid)) = 0 then
        raise exception 'wrong-item units on % need at least one photo', v_pol.sku
          using errcode = 'P0001', detail = 'wrong_item_photo_required';
      end if;
    end if;
    v_counted := v_counted + v_recv + v_damaged + v_wrong;
    if v_recv + v_damaged + v_wrong > 0
       or jsonb_array_length(v_clean_units) > 0 then
      v_clean := v_clean || jsonb_build_array(jsonb_build_object(
        'id', v_line_id, 'sku', v_pol.sku, 'received_now', v_recv,
        'damaged_qty', v_damaged, 'wrong_item_qty', v_wrong,
        'wrong_item_claim_type', case when v_wrong > 0 then v_type else null end,
        'damaged_photos', coalesce(v_line->'damaged_photos', '[]'::jsonb),
        'wrong_item_photos', coalesce(v_line->'wrong_item_photos', '[]'::jsonb),
        'units', v_clean_units));
    end if;
  end loop;
  if v_counted = 0 then
    raise exception 'count at least one unit before sending this'
      using errcode = 'P0001', detail = 'nothing_counted';
  end if;
  return jsonb_build_object('lines', v_clean, 'counted', v_counted);
end;
$fn$;

/**
 * Arrival evidence and extra goods share one validator so the two doors
 * cannot drift. Evidence entries are {path, kind photo|video}; extra lines
 * are {sku, qty > 0, note} and never touch Inventory or pending arithmetic.
 */
create or replace function public.receiving_validate_session_extras(
  p_arrival_evidence jsonb,
  p_extra_lines jsonb
) returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $fn$
declare
  v jsonb; v_ev jsonb := '[]'::jsonb; v_extra jsonb := '[]'::jsonb;
begin
  if p_arrival_evidence is not null and jsonb_typeof(p_arrival_evidence) = 'array' then
    for v in select * from jsonb_array_elements(p_arrival_evidence) loop
      if length(btrim(coalesce(v->>'path',''))) = 0
         or coalesce(v->>'kind','') not in ('photo','video') then
        raise exception 'arrival evidence must be a photo or video file'
          using errcode = '22023', detail = 'evidence_kind_invalid';
      end if;
      v_ev := v_ev || jsonb_build_array(jsonb_build_object(
        'path', btrim(v->>'path'), 'kind', v->>'kind'));
    end loop;
  end if;
  if p_extra_lines is not null and jsonb_typeof(p_extra_lines) = 'array' then
    for v in select * from jsonb_array_elements(p_extra_lines) loop
      if length(btrim(coalesce(v->>'sku',''))) = 0
         or coalesce(nullif(v->>'qty','')::int, 0) <= 0 then
        raise exception 'an extra goods line needs a SKU and a quantity'
          using errcode = '22023', detail = 'extra_line_invalid';
      end if;
      v_extra := v_extra || jsonb_build_array(jsonb_build_object(
        'sku', btrim(v->>'sku'),
        'qty', (v->>'qty')::int,
        'note', nullif(btrim(coalesce(v->>'note','')), '')));
    end loop;
  end if;
  return jsonb_build_object('arrival_evidence', v_ev, 'extra_lines', v_extra);
end;
$fn$;

revoke execute on function public.receiving_validate_session_extras(jsonb, jsonb)
  from public, anon, authenticated;

/**
 * The duty gate every Receiving door asks, raising the governed refusal.
 * Returns the evidence trio for the posting record.
 */
create or replace function public.receiving_require_post_authority()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_ctx jsonb := public.receiving_actor_context();
begin
  if not coalesce((v_ctx->>'allowed')::boolean, false) then
    if v_ctx->>'source' = 'not_assigned' and not coalesce((v_ctx->>'is_superuser')::boolean, false) then
      raise exception 'nobody holds GRN duty' using errcode = '42501', detail = 'no_grn_duty_holder';
    end if;
    raise exception 'only GRN duty may save a receiving'
      using errcode = '42501', detail = 'not_grn_duty';
  end if;
  return v_ctx;
end;
$fn$;

revoke execute on function public.receiving_require_post_authority()
  from public, anon, authenticated;

/**
 * Insert the per-Unit results a posting recorded. Runs inside the posting
 * transaction, from the VALIDATED session lines.
 */
create or replace function public.receiving_record_unit_results(
  p_receipt_id uuid,
  p_lines jsonb
) returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_line jsonb; v_unit jsonb; v_count int := 0;
begin
  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    for v_unit in select * from jsonb_array_elements(coalesce(v_line->'units', '[]'::jsonb)) loop
      insert into receiving_unit_results
        (receipt_id, stock_item_id, unit_code, outcome, issue_kind, note)
      values
        (p_receipt_id,
         (v_unit->>'stock_item_id')::uuid,
         v_unit->>'unit_code',
         v_unit->>'outcome',
         nullif(v_unit->>'issue_kind',''),
         nullif(v_unit->>'note',''));
      v_count := v_count + 1;
    end loop;
  end loop;
  return v_count;
end;
$fn$;

revoke execute on function public.receiving_record_unit_results(uuid, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- §4 · the ONE receive engine learns the Actual Site and exact-Unit flips
--      (extracted live with pg_get_functiondef() on 2026-09-04 and edited at
--      the named anchors; the 4-arg signature is dropped so no second engine
--      can linger)
-- ---------------------------------------------------------------------------

drop function if exists public.operation_receive_po_with_do(text, text, text, jsonb);

create function public.operation_receive_po_with_do(
  p_po_id text,
  p_do_file_path text,
  p_do_number text,
  p_lines jsonb,
  p_actual_site_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
  -- 0426 anchors
  v_site               uuid;
  v_recv_ids           uuid[];
  v_dmg_ids            uuid[];
  v_wrong_ids          uuid[];
  v_ownership          text;
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

  -- 0426 · the Actual Site: where the goods PHYSICALLY landed. It never
  -- rewrites the PO's Deliver To; it decides where the stock consequence
  -- posts. Null = the PO's own booked warehouse, exactly as before.
  if p_actual_site_id is not null and not exists (
    select 1 from warehouses where id = p_actual_site_id
  ) then
    raise exception 'actual site not found' using errcode = '22023', detail = 'actual_site_invalid';
  end if;
  v_site := coalesce(p_actual_site_id, v_po.warehouse_id);

  -- 0426 · consignment: a consignment source's received Units remain
  -- SUPPLIER-OWNED (0366's ownership contract) and receipt creates no
  -- payable — the engine touches no Finance/AP record either way.
  v_ownership := case when v_po.is_consignment then 'supplier_consignment'
                      else 'carres_owned' end;

  v_was_relocated := v_po.sup_status = 'relocated';
  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));

  -- R4: the per-unit register is Carres-owned scope — read at the PHYSICAL
  -- site (0426), because that is where the units land.
  select (kind = 'own') into v_is_own from warehouses where id = v_site;
  -- P4: goods become Carres stock when they physically land at a Carres
  -- warehouse. Without an Actual Site override that is still the original
  -- rule (destination books into the PO's warehouse); with one, the recorded
  -- physical arrival wins (owner instruction 2026-09-04: valid received
  -- Units enter Inventory at the Actual Site).
  select (pd.warehouse_id is not null and pd.warehouse_id = v_po.warehouse_id)
    into v_posts_stock
    from purchasing_destinations pd
   where pd.id = v_po.destination_id;
  v_posts_stock := coalesce(v_posts_stock, false) or p_actual_site_id is not null;
  v_is_own := coalesce(v_is_own, false);
  select name into v_supplier_name from suppliers where id = v_po.supplier_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_line_id := nullif(v_line->>'id', '')::uuid;
    v_received_qty := nullif(v_line->>'received_qty', '')::int;
    v_damaged_add := coalesce(nullif(v_line->>'damaged_qty', '')::int, 0);
    v_wrong_add   := coalesce(nullif(v_line->>'wrong_item_qty', '')::int, 0);
    v_damaged_claim := null;
    v_wrong_claim   := null;

    -- 0426 · the exact Units this line named, split by outcome. Empty arrays
    -- mean a quantity line (governed interchangeable goods) and the original
    -- oldest-first behaviour holds.
    select coalesce(array_agg((u->>'stock_item_id')::uuid), '{}'::uuid[])
      into v_recv_ids
      from jsonb_array_elements(coalesce(v_line->'units', '[]'::jsonb)) u
     where u->>'outcome' = 'received';
    select coalesce(array_agg((u->>'stock_item_id')::uuid), '{}'::uuid[])
      into v_dmg_ids
      from jsonb_array_elements(coalesce(v_line->'units', '[]'::jsonb)) u
     where u->>'outcome' = 'received_with_issue' and u->>'issue_kind' = 'damaged';
    select coalesce(array_agg((u->>'stock_item_id')::uuid), '{}'::uuid[])
      into v_wrong_ids
      from jsonb_array_elements(coalesce(v_line->'units', '[]'::jsonb)) u
     where u->>'outcome' = 'received_with_issue' and u->>'issue_kind' = 'wrong_item';

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

    update purchase_order_lines
       set received_qty   = v_received_qty,
           damaged_qty    = damaged_qty + v_damaged_add,
           wrong_item_qty = wrong_item_qty + v_wrong_add
     where id = v_line_id;

    v_damaged_total := v_damaged_total + v_damaged_add;
    v_wrong_total   := v_wrong_total + v_wrong_add;

    if v_delta > 0 and v_posts_stock then
      -- 0366 · the unit register is the ONE inventory authority: stock posts by
      -- flipping/minting Units only. `stock_balances` is derived by the rollup
      -- triggers on `ops_stock_items` — a direct write here is refused by
      -- `trg_stock_balances_derived_only` (this replaces the pre-0366 balance
      -- write the previous engine definition still carried).

      -- 0426 · EXACT-UNIT flips first (ERP-ARCHITECTURE §3.4): the scanned
      -- `Received` Units become free at the Actual Site. A quantity line
      -- keeps the oldest-first flip.
      if cardinality(v_recv_ids) > 0 then
        with freed as (
          update ops_stock_items
             set status = 'free', warehouse_id = v_site, updated_at = now(),
                 ownership = case when v_po.is_consignment
                                  then 'supplier_consignment' else ownership end,
                 supplier = coalesce(nullif(btrim(coalesce(supplier, '')), ''), v_supplier_name)
           where id = any(v_recv_ids) and status = 'incoming'
          returning 1
        )
        select count(*) into v_freed from freed;
        if v_freed <> cardinality(v_recv_ids) then
          raise exception 'a scanned unit on % was already received — reload and count again', v_sku
            using errcode = 'P0001', detail = 'unit_already_received';
        end if;
      else
        with freed as (
          update ops_stock_items
             set status = 'free', warehouse_id = v_site, updated_at = now(),
                 ownership = case when v_po.is_consignment
                                  then 'supplier_consignment' else ownership end,
                 supplier = coalesce(nullif(btrim(coalesce(supplier, '')), ''), v_supplier_name)
           where id in (
             select id from ops_stock_items
              where po_no = p_po_id and sku = v_sku and status = 'incoming'
              order by created_at
              limit v_delta
           )
          returning 1
        )
        select count(*) into v_freed from freed;
      end if;

      v_minted := 0;
      if v_is_own and v_freed < v_delta then
        insert into ops_stock_items
          (unit_code, sku, warehouse_id, status, ownership, supplier, po_no, source_ref, date_in)
        select public.gen_unit_code(), v_sku, v_site, 'free', v_ownership,
               v_supplier_name, p_po_id, btrim(p_do_number), current_date
          from generate_series(1, v_delta - v_freed);
        v_minted := v_delta - v_freed;
      end if;

      v_lines_updated := v_lines_updated + 1;
    end if;

    -- Quarantine the claimed units — the EXACT scanned ones when named,
    -- otherwise oldest-first, after the free-flip as before.
    if v_damaged_claim is not null then
      if cardinality(v_dmg_ids) > 0 then
        with held as (
          update ops_stock_items
             set status = 'on_hold', hold_reason = 'damaged',
                 hold_claim_id = v_damaged_claim, held_at = now(),
                 warehouse_id = v_site, updated_at = now()
           where id = any(v_dmg_ids) and status = 'incoming'
          returning 1
        )
        select count(*) into v_held from held;
        if v_held <> cardinality(v_dmg_ids) then
          raise exception 'a damaged unit on % was already received — reload and count again', v_sku
            using errcode = 'P0001', detail = 'unit_already_received';
        end if;
      else
        with held as (
          update ops_stock_items
             set status = 'on_hold', hold_reason = 'damaged',
                 hold_claim_id = v_damaged_claim, held_at = now(),
                 updated_at = now()
           where id in (
             select id from ops_stock_items
              where po_no = p_po_id and sku = v_sku and status = 'incoming'
              order by created_at
              limit v_damaged_add
           )
          returning 1
        )
        select count(*) into v_held from held;
      end if;
      v_units_held := v_units_held + v_held;
    end if;

    if v_wrong_claim is not null then
      if cardinality(v_wrong_ids) > 0 then
        with held as (
          update ops_stock_items
             set status = 'on_hold', hold_reason = 'wrong_item',
                 hold_claim_id = v_wrong_claim, held_at = now(),
                 warehouse_id = v_site, updated_at = now()
           where id = any(v_wrong_ids) and status = 'incoming'
          returning 1
        )
        select count(*) into v_held from held;
        if v_held <> cardinality(v_wrong_ids) then
          raise exception 'a wrong-item unit on % was already received — reload and count again', v_sku
            using errcode = 'P0001', detail = 'unit_already_received';
        end if;
      else
        with held as (
          update ops_stock_items
             set status = 'on_hold', hold_reason = 'wrong_item',
                 hold_claim_id = v_wrong_claim, held_at = now(),
                 updated_at = now()
           where id in (
             select id from ops_stock_items
              where po_no = p_po_id and sku = v_sku and status = 'incoming'
              order by created_at
              limit v_wrong_add
           )
          returning 1
        )
        select count(*) into v_held from held;
      end if;
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
           warehouse_id    = v_site,
           reserved_at     = now(),
           updated_at      = now()
     where id = v_thread.id;

    v_threads_advanced := v_threads_advanced + 1;

    -- 0366 · `reserved` is the Sales Order's exact-Unit binding, owned by the
    -- Stock reserve door (`status = 'reserved'` + `reserved_ref`), never an
    -- aggregate counter. The pre-0366 `stock_balances.reserved` increment the
    -- previous engine definition carried is removed — a receiving advances the
    -- thread; the dispatch flow binds its exact Units.
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
    'units_held',        v_units_held,
    'actual_site_id',    v_site
  );
end;
$function$;

revoke all on function public.operation_receive_po_with_do(text, text, text, jsonb, uuid) from public, anon;
grant execute on function public.operation_receive_po_with_do(text, text, text, jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- §5 · office_receive_post — duty-gated, idempotent, GRN-stamped
-- ---------------------------------------------------------------------------

drop function if exists public.office_receive_post(text, text, text, text, jsonb, date);

create function public.office_receive_post(
  p_po_id             text,
  p_do_number         text,
  p_do_file_path      text,
  p_note              text,
  p_lines             jsonb,
  p_goods_received_at date default null,
  p_actual_site_id    uuid default null,
  p_arrival_evidence  jsonb default null,
  p_extra_lines       jsonb default null,
  p_save_key          uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid; v_po purchase_orders; v_valid jsonb; v_line jsonb;
  v_pol purchase_order_lines; v_payload jsonb := '[]'::jsonb;
  v_receipt_id uuid; v_grn_date date; v_counted int;
  v_today_myt date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_prior warehouse_receipts; v_before uuid[]; v_result jsonb; v_linked int;
  v_ctx jsonb; v_extras jsonb; v_grn text; v_units int;
begin
  v_uid := auth.uid();

  -- The one authority: GRN Duty, its dated cover, or an Operations
  -- Superuser (0425). The trio is stored as evidence, never collapsed.
  v_ctx := public.receiving_require_post_authority();

  -- Idempotency: a retried Save with the same key returns the FIRST posting
  -- instead of minting a second GRN, a second Unit receipt or a second
  -- stock movement (owner instruction 2026-09-04 §5C).
  if p_save_key is not null then
    select * into v_prior from warehouse_receipts where save_key = p_save_key;
    if found then
      return jsonb_build_object(
        'receipt_id', v_prior.id, 'po_id', v_prior.po_id,
        'status', v_prior.status, 'grn_no', v_prior.grn_no,
        'already_saved', true);
    end if;
  end if;

  if length(btrim(coalesce(p_do_number, ''))) < 3 then
    raise exception 'a DO number is required'
      using errcode = '22023', detail = 'do_number_required';
  end if;
  if length(btrim(coalesce(p_do_file_path, ''))) = 0 then
    raise exception 'a photo of the signed DO is required'
      using errcode = '22023', detail = 'do_file_required';
  end if;

  v_grn_date := coalesce(p_goods_received_at, v_today_myt);
  if v_grn_date > v_today_myt then
    raise exception 'Goods Received At cannot be in the future'
      using errcode = '22023', detail = 'received_date_future';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO % not found', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;
  if v_po.status <> 'open' then
    raise exception 'PO % is no longer open', p_po_id
      using errcode = '22023', detail = 'po_not_open';
  end if;
  if v_grn_date < (v_po.placed_at at time zone 'Asia/Kuala_Lumpur')::date then
    raise exception 'Goods Received At cannot be before the PO date (%)',
                    to_char((v_po.placed_at at time zone 'Asia/Kuala_Lumpur')::date, 'DD Mon YY')
      using errcode = '22023', detail = 'received_date_before_po';
  end if;
  if p_actual_site_id is not null and not exists (
    select 1 from warehouses where id = p_actual_site_id
  ) then
    raise exception 'actual site not found' using errcode = '22023', detail = 'actual_site_invalid';
  end if;

  select * into v_prior from warehouse_receipts
   where po_id = p_po_id and status = 'submitted' limit 1;
  if found then
    raise exception 'the warehouse already filed a receiving for % (DO %) — check that one in instead',
                    p_po_id, coalesce(v_prior.do_number, '—')
      using errcode = 'P0001', detail = 'receipt_awaiting_review';
  end if;

  select * into v_prior from warehouse_receipts
   where po_id = p_po_id
     and lower(btrim(do_number)) = lower(btrim(p_do_number))
     and status <> 'voided'
   limit 1;
  if found then
    if v_prior.status = 'returned' then
      raise exception 'DO % was returned to the warehouse — reopen that receiving, do not file a new one',
                      btrim(p_do_number)
        using errcode = 'P0001', detail = 'do_returned_use_resubmit';
    else
      raise exception 'DO % was already received on % (session %)',
                      btrim(p_do_number),
                      to_char(v_prior.goods_received_at, 'DD Mon YY'), v_prior.id
        using errcode = 'P0001', detail = 'do_already_received';
    end if;
  end if;

  v_valid   := public.warehouse_receipt_validate_lines(p_po_id, p_lines, v_uid);
  v_counted := (v_valid->>'counted')::int;
  v_extras  := public.receiving_validate_session_extras(p_arrival_evidence, p_extra_lines);

  for v_line in select * from jsonb_array_elements(v_valid->'lines') loop
    select * into v_pol from purchase_order_lines
     where id = (v_line->>'id')::uuid and po_id = p_po_id;
    if not found then
      raise exception 'PO line % is gone — reload the purchase order and count again',
                      v_line->>'sku'
        using errcode = 'P0001', detail = 'po_line_not_found';
    end if;
    v_payload := v_payload || jsonb_build_array(jsonb_build_object(
      'id', v_line->>'id',
      'received_qty', v_pol.received_qty + coalesce((v_line->>'received_now')::int, 0),
      'damaged_qty', coalesce((v_line->>'damaged_qty')::int, 0),
      'wrong_item_qty', coalesce((v_line->>'wrong_item_qty')::int, 0),
      'wrong_item_claim_type', v_line->>'wrong_item_claim_type',
      'damaged_photos', coalesce(v_line->'damaged_photos', '[]'::jsonb),
      'wrong_item_photos', coalesce(v_line->'wrong_item_photos', '[]'::jsonb),
      'units', coalesce(v_line->'units', '[]'::jsonb)));
  end loop;

  insert into warehouse_receipts (
    po_id, warehouse_id, do_number, do_file_path, note, lines,
    goods_received_at, submitted_from, status,
    submitted_by, submitted_at, posted_by, posted_at,
    reviewed_by, reviewed_at,
    actual_site_id, save_key, arrival_evidence, extra_lines,
    posted_duty_holder, posted_duty_cover, posted_authority,
    po_status_before, sup_status_before
  ) values (
    p_po_id, v_po.warehouse_id, btrim(p_do_number), btrim(p_do_file_path),
    nullif(btrim(coalesce(p_note, '')), ''), v_valid->'lines',
    v_grn_date, 'office', 'posted',
    v_uid, now(), v_uid, now(),
    v_uid, now(),
    p_actual_site_id, p_save_key,
    v_extras->'arrival_evidence', v_extras->'extra_lines',
    nullif(v_ctx->>'normal_user_id','')::uuid,
    nullif(v_ctx->>'acting_user_id','')::uuid,
    case when coalesce((v_ctx->>'is_superuser')::boolean, false)
              and v_uid is distinct from nullif(v_ctx->>'actor_user_id','')::uuid
         then 'superuser'
         when coalesce((v_ctx->>'is_cover')::boolean, false)
              and v_uid = nullif(v_ctx->>'acting_user_id','')::uuid
         then 'cover'
         else 'grn_duty' end,
    v_po.status, v_po.sup_status::text
  ) returning id into v_receipt_id;

  select coalesce(array_agg(id), '{}'::uuid[]) into v_before
    from supplier_claims where po_id = p_po_id;

  v_result := public.operation_receive_po_with_do(
    p_po_id, btrim(p_do_file_path), btrim(p_do_number), v_payload, p_actual_site_id);

  update supplier_claims
     set warehouse_receipt_id = v_receipt_id
   where po_id = p_po_id and not (id = any(v_before))
     and warehouse_receipt_id is null;
  get diagnostics v_linked = row_count;

  -- The formal GRN number exists from the posted session (MASTER §7.3),
  -- drawn from the one daily formal-document pool (0381).
  v_grn := public.allocate_formal_document_code('GRN', v_receipt_id::text);
  update warehouse_receipts set grn_no = v_grn where id = v_receipt_id;

  v_units := public.receiving_record_unit_results(v_receipt_id, v_valid->'lines');

  insert into receiving_events (receipt_id, event, actor_id, payload)
  values (v_receipt_id, 'posted', v_uid,
          jsonb_build_object('do_number', btrim(p_do_number),
                             'goods_received_at', v_grn_date,
                             'units_counted', v_counted,
                             'entry_source', 'office',
                             'claims_linked', v_linked,
                             'grn_no', v_grn,
                             'actual_site_id', p_actual_site_id,
                             'unit_results', v_units,
                             'extra_lines', jsonb_array_length(coalesce(v_extras->'extra_lines','[]'::jsonb)),
                             'normal_user_id', v_ctx->>'normal_user_id',
                             'acting_user_id', v_ctx->>'acting_user_id'));

  insert into po_history (po_id, text, by_role, by_user_id)
  values (p_po_id,
          format('Received %s unit%s against DO %s · %s',
                 v_counted, case when v_counted = 1 then '' else 's' end,
                 btrim(p_do_number), v_grn),
          public.app_role(), v_uid);

  insert into audit_log (role, actor_text, action, ref)
  values (public.app_role(),
          coalesce((select name from app_users where id = v_uid), 'Operations'),
          format('Checked in %s (DO %s, %s unit%s) · %s', p_po_id, btrim(p_do_number),
                 v_counted, case when v_counted = 1 then '' else 's' end, v_grn),
          p_po_id);

  return jsonb_build_object('receipt_id', v_receipt_id, 'po_id', p_po_id,
                            'status', 'posted', 'grn_no', v_grn,
                            'units_counted', v_counted,
                            'claims_linked', v_linked, 'receive', v_result);
end;
$fn$;

revoke all on function public.office_receive_post(text, text, text, text, jsonb, date, uuid, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.office_receive_post(text, text, text, text, jsonb, date, uuid, jsonb, jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- §6 · the Warehouse review doors — duty-gated, GRN-stamped, retry-safe
-- ---------------------------------------------------------------------------

drop function if exists public.warehouse_receipt_check_in(uuid);

create function public.warehouse_receipt_check_in(
  p_receipt_id uuid,
  p_actual_site_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_receipt warehouse_receipts; v_uid uuid; v_line jsonb;
  v_pol purchase_order_lines; v_payload jsonb := '[]'::jsonb;
  v_before uuid[]; v_result jsonb; v_linked int; v_counted int := 0;
  v_ctx jsonb; v_grn text; v_po purchase_orders; v_units int;
begin
  v_uid := auth.uid();
  v_ctx := public.receiving_require_post_authority();
  select * into v_receipt from warehouse_receipts where id = p_receipt_id for update;
  if not found then
    raise exception 'receipt not found' using errcode = '42P01', detail = 'receipt_not_found';
  end if;
  -- A retried check-in of an already-posted session is the same business
  -- act arriving twice: return the first result instead of an error.
  if v_receipt.status = 'posted' then
    return jsonb_build_object('receipt_id', v_receipt.id, 'po_id', v_receipt.po_id,
                              'status', 'posted', 'grn_no', v_receipt.grn_no,
                              'already_saved', true);
  end if;
  if v_receipt.status <> 'submitted' then
    raise exception 'this receiving has already been reviewed' using errcode = '22023', detail = 'receipt_not_open';
  end if;
  if p_actual_site_id is not null and not exists (
    select 1 from warehouses where id = p_actual_site_id
  ) then
    raise exception 'actual site not found' using errcode = '22023', detail = 'actual_site_invalid';
  end if;

  select * into v_po from purchase_orders where id = v_receipt.po_id;

  for v_line in select * from jsonb_array_elements(v_receipt.lines) loop
    select * into v_pol from purchase_order_lines
     where id = (v_line->>'id')::uuid and po_id = v_receipt.po_id;
    if not found then
      raise exception 'PO line % is gone — send this receiving back and ask for a fresh count', v_line->>'sku'
        using errcode = 'P0001', detail = 'po_line_not_found';
    end if;
    v_counted := v_counted
               + coalesce((v_line->>'received_now')::int, 0)
               + coalesce((v_line->>'damaged_qty')::int, 0)
               + coalesce((v_line->>'wrong_item_qty')::int, 0);
    v_payload := v_payload || jsonb_build_array(jsonb_build_object(
      'id', v_line->>'id',
      'received_qty', v_pol.received_qty + coalesce((v_line->>'received_now')::int, 0),
      'damaged_qty', coalesce((v_line->>'damaged_qty')::int, 0),
      'wrong_item_qty', coalesce((v_line->>'wrong_item_qty')::int, 0),
      'wrong_item_claim_type', v_line->>'wrong_item_claim_type',
      'damaged_photos', coalesce(v_line->'damaged_photos', '[]'::jsonb),
      'wrong_item_photos', coalesce(v_line->'wrong_item_photos', '[]'::jsonb),
      'units', coalesce(v_line->'units', '[]'::jsonb)));
  end loop;
  select coalesce(array_agg(id), '{}'::uuid[]) into v_before
    from supplier_claims where po_id = v_receipt.po_id;
  v_result := public.operation_receive_po_with_do(
    v_receipt.po_id, v_receipt.do_file_path, v_receipt.do_number, v_payload, p_actual_site_id);
  update supplier_claims
     set warehouse_receipt_id = v_receipt.id
   where po_id = v_receipt.po_id and not (id = any(v_before)) and warehouse_receipt_id is null;
  get diagnostics v_linked = row_count;

  v_grn := public.allocate_formal_document_code('GRN', v_receipt.id::text);

  update warehouse_receipts
     set status = 'posted', posted_by = v_uid, posted_at = now(),
         reviewed_by = v_uid, reviewed_at = now(), updated_at = now(),
         grn_no = v_grn,
         actual_site_id = coalesce(p_actual_site_id, actual_site_id),
         posted_duty_holder = nullif(v_ctx->>'normal_user_id','')::uuid,
         posted_duty_cover  = nullif(v_ctx->>'acting_user_id','')::uuid,
         posted_authority   = case
           when coalesce((v_ctx->>'is_superuser')::boolean, false)
                and v_uid is distinct from nullif(v_ctx->>'actor_user_id','')::uuid
           then 'superuser'
           when coalesce((v_ctx->>'is_cover')::boolean, false)
                and v_uid = nullif(v_ctx->>'acting_user_id','')::uuid
           then 'cover'
           else 'grn_duty' end,
         po_status_before  = v_po.status,
         sup_status_before = v_po.sup_status::text
   where id = p_receipt_id;

  v_units := public.receiving_record_unit_results(p_receipt_id, v_receipt.lines);

  insert into receiving_events (receipt_id, event, actor_id, payload)
  values (p_receipt_id, 'posted', v_uid,
          jsonb_build_object('do_number', v_receipt.do_number,
                             'goods_received_at', v_receipt.goods_received_at,
                             'units_counted', v_counted,
                             'entry_source', 'warehouse',
                             'claims_linked', v_linked,
                             'grn_no', v_grn,
                             'actual_site_id', p_actual_site_id,
                             'unit_results', v_units,
                             'normal_user_id', v_ctx->>'normal_user_id',
                             'acting_user_id', v_ctx->>'acting_user_id'));
  insert into audit_log (role, actor_text, action, ref)
  values (public.app_role(),
          coalesce((select name from app_users where id = v_uid), 'Operations'),
          format('Checked in %s from %s (DO %s) · %s', v_receipt.po_id,
                 coalesce((select name from warehouses where id = v_receipt.warehouse_id), 'the warehouse'),
                 v_receipt.do_number, v_grn),
          v_receipt.po_id);
  return jsonb_build_object('receipt_id', p_receipt_id, 'po_id', v_receipt.po_id,
                            'status', 'posted', 'grn_no', v_grn,
                            'claims_linked', v_linked, 'receive', v_result);
end;
$fn$;

revoke all on function public.warehouse_receipt_check_in(uuid, uuid) from public, anon;
grant execute on function public.warehouse_receipt_check_in(uuid, uuid) to authenticated;

create or replace function public.warehouse_receipt_return(p_receipt_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_receipt warehouse_receipts; v_uid uuid;
begin
  v_uid := auth.uid();
  perform public.receiving_require_post_authority();
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'say what the warehouse must fix' using errcode = '22023', detail = 'reason_required';
  end if;
  select * into v_receipt from warehouse_receipts where id = p_receipt_id for update;
  if not found then
    raise exception 'receipt not found' using errcode = '42P01', detail = 'receipt_not_found';
  end if;
  if v_receipt.status <> 'submitted' then
    raise exception 'this receiving has already been reviewed' using errcode = '22023', detail = 'receipt_not_open';
  end if;
  update warehouse_receipts
     set status = 'returned', return_reason = btrim(p_reason),
         reviewed_by = v_uid, reviewed_at = now(), updated_at = now()
   where id = p_receipt_id;
  insert into receiving_events (receipt_id, event, actor_id, payload)
  values (p_receipt_id, 'returned', v_uid, jsonb_build_object('reason', btrim(p_reason)));
  insert into po_history (po_id, text, by_role, by_user_id)
  values (v_receipt.po_id,
          format('Receiving with DO %s sent back to %s — %s', v_receipt.do_number,
                 coalesce((select name from warehouses where id = v_receipt.warehouse_id), 'the warehouse'),
                 btrim(p_reason)),
          public.app_role(), v_uid);
  return jsonb_build_object('receipt_id', p_receipt_id, 'status', 'returned');
end;
$fn$;

-- ---------------------------------------------------------------------------
-- §6b · the external Warehouse doors learn per-Unit outcomes, arrival
--       photo/video evidence and extra goods — the SAME validator, the SAME
--       session shape, still no stock movement before the Carres save
-- ---------------------------------------------------------------------------

drop function if exists public.warehouse_submit_receipt(text, text, text, text, jsonb, date);

create function public.warehouse_submit_receipt(
  p_po_id             text,
  p_do_number         text,
  p_do_file_path      text,
  p_note              text,
  p_lines             jsonb,
  p_goods_received_at date default null,
  p_arrival_evidence  jsonb default null,
  p_extra_lines       jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_wh_id uuid; v_uid uuid; v_po purchase_orders; v_valid jsonb;
  v_receipt_id uuid; v_grn_date date;
  v_today_myt date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_prior warehouse_receipts; v_extras jsonb;
begin
  v_uid := auth.uid();
  if public.app_role() <> 'warehouse' then
    raise exception 'forbidden: warehouse role required' using errcode = '42501', detail = 'forbidden';
  end if;
  v_wh_id := public.app_warehouse_id();
  if v_wh_id is null then
    raise exception 'this login is not bound to a warehouse' using errcode = '42501', detail = 'no_warehouse';
  end if;
  if length(btrim(coalesce(p_do_number, ''))) < 3 then
    raise exception 'a DO number is required' using errcode = '22023', detail = 'do_number_required';
  end if;
  if length(btrim(coalesce(p_do_file_path, ''))) = 0 then
    raise exception 'a photo of the signed DO is required' using errcode = '22023', detail = 'do_file_required';
  end if;
  v_grn_date := coalesce(p_goods_received_at, v_today_myt);
  if v_grn_date > v_today_myt then
    raise exception 'Goods Received At cannot be in the future'
      using errcode = '22023', detail = 'received_date_future';
  end if;
  select * into v_po from purchase_orders where id = p_po_id and warehouse_id = v_wh_id for update;
  if not found then
    raise exception 'PO not found for this warehouse'
      using errcode = '42501', detail = 'po_not_found_or_cross_tenant';
  end if;
  if v_po.status <> 'open' then
    raise exception 'PO % is no longer open', p_po_id using errcode = '22023', detail = 'po_not_open';
  end if;
  if v_grn_date < (v_po.placed_at at time zone 'Asia/Kuala_Lumpur')::date then
    raise exception 'Goods Received At cannot be before the PO date (%)',
                    to_char((v_po.placed_at at time zone 'Asia/Kuala_Lumpur')::date, 'DD Mon YY')
      using errcode = '22023', detail = 'received_date_before_po';
  end if;
  if exists (select 1 from warehouse_receipts where po_id = p_po_id and status = 'submitted') then
    raise exception 'a receiving for % is already waiting for Carres', p_po_id
      using errcode = 'P0001', detail = 'receipt_already_open';
  end if;
  select * into v_prior from warehouse_receipts
   where po_id = p_po_id and lower(btrim(do_number)) = lower(btrim(p_do_number))
     and status <> 'voided';
  if found then
    if v_prior.status = 'returned' then
      raise exception 'DO % was returned — reopen and resubmit that receiving, do not file a new one',
                      btrim(p_do_number)
        using errcode = 'P0001', detail = 'do_returned_use_resubmit';
    else
      raise exception 'DO % was already received on % (session %)',
                      btrim(p_do_number), to_char(v_prior.goods_received_at, 'DD Mon YY'), v_prior.id
        using errcode = 'P0001', detail = 'do_already_received';
    end if;
  end if;
  v_valid  := public.warehouse_receipt_validate_lines(p_po_id, p_lines, v_uid);
  v_extras := public.receiving_validate_session_extras(p_arrival_evidence, p_extra_lines);
  insert into warehouse_receipts (
    po_id, warehouse_id, do_number, do_file_path, note, lines,
    goods_received_at, submitted_from, status, submitted_by,
    arrival_evidence, extra_lines
  ) values (
    p_po_id, v_wh_id, btrim(p_do_number), btrim(p_do_file_path),
    nullif(btrim(coalesce(p_note, '')), ''), v_valid->'lines',
    v_grn_date, 'warehouse', 'submitted', v_uid,
    v_extras->'arrival_evidence', v_extras->'extra_lines'
  ) returning id into v_receipt_id;
  insert into receiving_events (receipt_id, event, actor_id, payload)
  values (v_receipt_id, 'submitted', v_uid,
          jsonb_build_object('do_number', btrim(p_do_number),
                             'goods_received_at', v_grn_date,
                             'units_counted', (v_valid->>'counted')::int,
                             'arrival_evidence', jsonb_array_length(coalesce(v_extras->'arrival_evidence','[]'::jsonb)),
                             'extra_lines', jsonb_array_length(coalesce(v_extras->'extra_lines','[]'::jsonb))));
  insert into po_history (po_id, text, by_role, by_user_id)
  values (p_po_id,
          format('%s filed a receiving with DO %s — waiting Carres check',
                 coalesce((select name from warehouses where id = v_wh_id), 'The warehouse'),
                 btrim(p_do_number)),
          'warehouse', v_uid);
  return jsonb_build_object('id', v_receipt_id, 'po_id', p_po_id, 'status', 'submitted');
end;
$fn$;

drop function if exists public.warehouse_resubmit_receipt(uuid, text, text, text, jsonb, date);

create function public.warehouse_resubmit_receipt(
  p_receipt_id        uuid,
  p_do_number         text,
  p_do_file_path      text,
  p_note              text,
  p_lines             jsonb,
  p_goods_received_at date default null,
  p_arrival_evidence  jsonb default null,
  p_extra_lines       jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_wh_id uuid; v_uid uuid; v_receipt warehouse_receipts; v_po purchase_orders;
  v_valid jsonb; v_grn_date date; v_extras jsonb;
  v_today_myt date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_clash warehouse_receipts;
begin
  v_uid := auth.uid();
  if public.app_role() <> 'warehouse' then
    raise exception 'forbidden: warehouse role required' using errcode = '42501', detail = 'forbidden';
  end if;
  v_wh_id := public.app_warehouse_id();
  if v_wh_id is null then
    raise exception 'this login is not bound to a warehouse' using errcode = '42501', detail = 'no_warehouse';
  end if;
  select * into v_receipt from warehouse_receipts
   where id = p_receipt_id and warehouse_id = v_wh_id for update;
  if not found then
    raise exception 'receipt not found for this warehouse' using errcode = '42P01', detail = 'receipt_not_found';
  end if;
  if v_receipt.status <> 'returned' then
    raise exception 'only a returned receiving can be resubmitted (this one is %)', v_receipt.status
      using errcode = '22023', detail = 'receipt_not_returned';
  end if;
  if length(btrim(coalesce(p_do_number, ''))) < 3 then
    raise exception 'a DO number is required' using errcode = '22023', detail = 'do_number_required';
  end if;
  if length(btrim(coalesce(p_do_file_path, ''))) = 0 then
    raise exception 'a photo of the signed DO is required' using errcode = '22023', detail = 'do_file_required';
  end if;
  v_grn_date := coalesce(p_goods_received_at, v_today_myt);
  if v_grn_date > v_today_myt then
    raise exception 'Goods Received At cannot be in the future'
      using errcode = '22023', detail = 'received_date_future';
  end if;
  select * into v_po from purchase_orders where id = v_receipt.po_id for update;
  if v_po.status <> 'open' then
    raise exception 'PO % is no longer open', v_receipt.po_id using errcode = '22023', detail = 'po_not_open';
  end if;
  if v_grn_date < (v_po.placed_at at time zone 'Asia/Kuala_Lumpur')::date then
    raise exception 'Goods Received At cannot be before the PO date (%)',
                    to_char((v_po.placed_at at time zone 'Asia/Kuala_Lumpur')::date, 'DD Mon YY')
      using errcode = '22023', detail = 'received_date_before_po';
  end if;
  select * into v_clash from warehouse_receipts
   where po_id = v_receipt.po_id and lower(btrim(do_number)) = lower(btrim(p_do_number))
     and id <> v_receipt.id and status <> 'voided';
  if found then
    raise exception 'DO % already belongs to another receiving (session %)',
                    btrim(p_do_number), v_clash.id
      using errcode = 'P0001', detail = 'do_already_received';
  end if;
  v_valid  := public.warehouse_receipt_validate_lines(v_receipt.po_id, p_lines, v_uid);
  v_extras := public.receiving_validate_session_extras(p_arrival_evidence, p_extra_lines);
  update warehouse_receipts
     set status = 'submitted', do_number = btrim(p_do_number),
         do_file_path = btrim(p_do_file_path),
         note = nullif(btrim(coalesce(p_note, '')), ''),
         lines = v_valid->'lines', goods_received_at = v_grn_date,
         -- A resubmission that names new evidence replaces it; one that
         -- names none keeps what the first count attached.
         arrival_evidence = case when p_arrival_evidence is null
                                 then arrival_evidence
                                 else v_extras->'arrival_evidence' end,
         extra_lines = case when p_extra_lines is null
                            then extra_lines
                            else v_extras->'extra_lines' end,
         submitted_by = v_uid, submitted_at = now(), updated_at = now()
   where id = p_receipt_id;
  insert into receiving_events (receipt_id, event, actor_id, payload)
  values (p_receipt_id, 'resubmitted', v_uid,
          jsonb_build_object('do_number', btrim(p_do_number),
                             'goods_received_at', v_grn_date,
                             'units_counted', (v_valid->>'counted')::int));
  insert into po_history (po_id, text, by_role, by_user_id)
  values (v_receipt.po_id,
          format('%s resubmitted the receiving with DO %s — waiting Carres check',
                 coalesce((select name from warehouses where id = v_wh_id), 'The warehouse'),
                 btrim(p_do_number)),
          'warehouse', v_uid);
  return jsonb_build_object('id', p_receipt_id, 'po_id', v_receipt.po_id, 'status', 'submitted');
end;
$fn$;

revoke execute on function public.warehouse_submit_receipt(text, text, text, text, jsonb, date, jsonb, jsonb) from public, anon;
grant  execute on function public.warehouse_submit_receipt(text, text, text, text, jsonb, date, jsonb, jsonb) to authenticated;
revoke execute on function public.warehouse_resubmit_receipt(uuid, text, text, text, jsonb, date, jsonb, jsonb) from public, anon;
grant  execute on function public.warehouse_resubmit_receipt(uuid, text, text, text, jsonb, date, jsonb, jsonb) to authenticated;

/**
 * The warehouse's incoming read gains the EXPECTED UNITS — the exact IDs the
 * supplier was told to write on the packages — so the operator scans one
 * physical result per governed Unit (ERP-ARCHITECTURE §3.4). A warehouse
 * still sees only what it must count: unit code, product, state.
 */
create or replace function public.warehouse_incoming_pos()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_wh_id uuid;
  v_out   jsonb;
begin
  if public.app_role() <> 'warehouse' then
    raise exception 'forbidden: warehouse role required'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_wh_id := public.app_warehouse_id();
  if v_wh_id is null then
    raise exception 'this login is not bound to a warehouse'
      using errcode = '42501', detail = 'no_warehouse';
  end if;

  select jsonb_build_object(
    'warehouse', (select jsonb_build_object('id', w.id, 'name', w.name)
                    from warehouses w where w.id = v_wh_id),
    'pos', coalesce((
      select jsonb_agg(p order by p->>'po_id')
        from (
          select jsonb_build_object(
            'po_id',         po.id,
            'supplier_name', s.name,
            'eta_date',      po.eta_date,
            'sup_status',    po.sup_status,
            'lines', coalesce((
              select jsonb_agg(jsonb_build_object(
                       'id',             pol.id,
                       'sku',            pol.sku,
                       'qty',            pol.qty,
                       'received_qty',   pol.received_qty,
                       'damaged_qty',    pol.damaged_qty,
                       'wrong_item_qty', pol.wrong_item_qty,
                       'category',       public.claim_product_category(pol.sku)
                     ) order by pol.sku)
                from purchase_order_lines pol where pol.po_id = po.id
            ), '[]'::jsonb),
            -- 0426: the governed expected Units still incoming on this PO.
            'expected_units', coalesce((
              select jsonb_agg(jsonb_build_object(
                       'id', i.id, 'unit_code', i.unit_code,
                       'sku', i.sku, 'status', i.status
                     ) order by i.unit_code)
                from ops_stock_items i
               where i.po_no = po.id and i.status = 'incoming'
            ), '[]'::jsonb),
            'open_receipt_id', (
              select wr.id from warehouse_receipts wr
               where wr.po_id = po.id and wr.status = 'submitted' limit 1
            )
          ) as p
          from purchase_orders po
          join suppliers s on s.id = po.supplier_id
         where po.warehouse_id = v_wh_id
           and po.status = 'open'
        ) q
    ), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- §7 · receiving_amend — a posted GRN has no ordinary Edit
--      (owner instruction 2026-09-04 §9: preserve the original, require a
--       reason, show before/after, append-only event, safe recalculation,
--       idempotent)
-- ---------------------------------------------------------------------------

create or replace function public.receiving_amend(
  p_receipt_id uuid,
  p_reason text,
  p_changes jsonb,
  p_save_key uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_ctx jsonb;
  v_receipt warehouse_receipts;
  v_po purchase_orders;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_new_date date; v_new_do text; v_new_site uuid;
  v_clash warehouse_receipts;
  v_lines jsonb; v_chg jsonb; v_stored jsonb; v_stored_lines jsonb;
  v_line_id uuid; v_old_recv int; v_new_recv int; v_d int;
  v_pol purchase_order_lines;
  v_posts_stock boolean; v_site uuid; v_is_own boolean;
  v_moved int; v_supplier_name text;
  v_today_myt date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_qty_changed boolean := false;
  v_outstanding int;
  v_prior_event receiving_events;
begin
  v_ctx := public.receiving_require_post_authority();
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'a correction reason is required'
      using errcode = '22023', detail = 'amend_reason_required';
  end if;

  -- Idempotency: the same amendment save key returns the recorded event.
  if p_save_key is not null then
    select * into v_prior_event from receiving_events
     where receipt_id = p_receipt_id and event = 'amended'
       and payload->>'save_key' = p_save_key::text
     limit 1;
    if found then
      return jsonb_build_object('receipt_id', p_receipt_id,
                                'status', 'posted', 'already_saved', true);
    end if;
  end if;

  select * into v_receipt from warehouse_receipts where id = p_receipt_id for update;
  if not found then
    raise exception 'receipt not found' using errcode = '42P01', detail = 'receipt_not_found';
  end if;
  if v_receipt.status <> 'posted' then
    raise exception 'only a posted receiving can be amended'
      using errcode = '22023', detail = 'receipt_not_posted';
  end if;

  select * into v_po from purchase_orders where id = v_receipt.po_id for update;

  -- Where this session's stock consequence lives.
  v_site := coalesce(v_receipt.actual_site_id, v_po.warehouse_id);
  select (pd.warehouse_id is not null and pd.warehouse_id = v_po.warehouse_id)
    into v_posts_stock
    from purchasing_destinations pd
   where pd.id = v_po.destination_id;
  v_posts_stock := coalesce(v_posts_stock, false) or v_receipt.actual_site_id is not null;
  select (kind = 'own') into v_is_own from warehouses where id = v_site;
  v_is_own := coalesce(v_is_own, false);
  select name into v_supplier_name from suppliers where id = v_po.supplier_id;

  -- ── header facts ─────────────────────────────────────────────────────────
  if p_changes ? 'goods_received_at' then
    v_new_date := nullif(p_changes->>'goods_received_at','')::date;
    if v_new_date is null or v_new_date > v_today_myt then
      raise exception 'Goods Received At cannot be in the future'
        using errcode = '22023', detail = 'received_date_future';
    end if;
    if v_new_date < (v_po.placed_at at time zone 'Asia/Kuala_Lumpur')::date then
      raise exception 'Goods Received At cannot be before the PO date (%)',
                      to_char((v_po.placed_at at time zone 'Asia/Kuala_Lumpur')::date, 'DD Mon YY')
        using errcode = '22023', detail = 'received_date_before_po';
    end if;
    if v_new_date is distinct from v_receipt.goods_received_at then
      v_before := v_before || jsonb_build_object('goods_received_at', v_receipt.goods_received_at);
      v_after  := v_after  || jsonb_build_object('goods_received_at', v_new_date);
      update warehouse_receipts set goods_received_at = v_new_date, updated_at = now()
       where id = p_receipt_id;
    end if;
  end if;

  if p_changes ? 'do_number' then
    v_new_do := btrim(coalesce(p_changes->>'do_number',''));
    if length(v_new_do) < 3 then
      raise exception 'a DO number is required' using errcode = '22023', detail = 'do_number_required';
    end if;
    if lower(v_new_do) is distinct from lower(coalesce(v_receipt.do_number,'')) then
      select * into v_clash from warehouse_receipts
       where po_id = v_receipt.po_id and lower(btrim(do_number)) = lower(v_new_do)
         and id <> v_receipt.id and status <> 'voided' limit 1;
      if found then
        raise exception 'DO % already belongs to another receiving (session %)', v_new_do, v_clash.id
          using errcode = 'P0001', detail = 'do_already_received';
      end if;
      v_before := v_before || jsonb_build_object('do_number', v_receipt.do_number);
      v_after  := v_after  || jsonb_build_object('do_number', v_new_do);
      update warehouse_receipts set do_number = v_new_do, updated_at = now()
       where id = p_receipt_id;
    end if;
  end if;

  if p_changes ? 'actual_site_id' then
    v_new_site := nullif(p_changes->>'actual_site_id','')::uuid;
    if v_new_site is not null and not exists (select 1 from warehouses where id = v_new_site) then
      raise exception 'actual site not found' using errcode = '22023', detail = 'actual_site_invalid';
    end if;
    if v_new_site is distinct from v_receipt.actual_site_id then
      v_before := v_before || jsonb_build_object('actual_site_id', v_receipt.actual_site_id);
      v_after  := v_after  || jsonb_build_object('actual_site_id', v_new_site);
      update warehouse_receipts set actual_site_id = v_new_site, updated_at = now()
       where id = p_receipt_id;
      -- The recorded location truth changes; posted stock is NOT silently
      -- relocated — a physical move is Stock's transfer door.
    end if;
  end if;

  -- ── per-line received-quantity corrections ───────────────────────────────
  v_lines := p_changes->'lines';
  if v_lines is not null and jsonb_typeof(v_lines) = 'array' and jsonb_array_length(v_lines) > 0 then
    v_stored_lines := coalesce(v_receipt.lines, '[]'::jsonb);
    for v_chg in select * from jsonb_array_elements(v_lines) loop
      v_line_id := nullif(v_chg->>'id','')::uuid;
      v_new_recv := nullif(v_chg->>'received_now','')::int;
      if v_line_id is null or v_new_recv is null or v_new_recv < 0 then
        raise exception 'invalid correction line' using errcode = '22023', detail = 'invalid_line';
      end if;
      select t.val into v_stored
        from jsonb_array_elements(v_stored_lines) as t(val)
       where (t.val->>'id')::uuid = v_line_id limit 1;
      if v_stored is null then
        raise exception 'this receiving did not count that line'
          using errcode = '22023', detail = 'line_not_in_session';
      end if;
      v_old_recv := coalesce((v_stored->>'received_now')::int, 0);
      v_d := v_new_recv - v_old_recv;
      if v_d = 0 then continue; end if;
      v_qty_changed := true;

      select * into v_pol from purchase_order_lines
       where id = v_line_id and po_id = v_receipt.po_id for update;
      if not found then
        raise exception 'PO line not found for id=%', v_line_id
          using errcode = '42P01', detail = 'po_line_not_found';
      end if;

      if v_d > 0 then
        -- Under-count correction: the goods were in the SAME physical
        -- arrival, so they join this session (a NEW arrival is a NEW
        -- session/GRN, never an amendment).
        if v_pol.received_qty + v_d > v_pol.qty then
          raise exception 'line % would exceed its Order Qty', v_pol.sku
            using errcode = 'P0001', detail = 'over_received';
        end if;
        update purchase_order_lines set received_qty = received_qty + v_d
         where id = v_line_id;
        if v_posts_stock then
          -- 0366 · stock posts by flipping/minting Units only; the rollup
          -- triggers derive `stock_balances` from the unit register.
          with freed as (
            update ops_stock_items
               set status = 'free', warehouse_id = v_site, updated_at = now()
             where id in (
               select id from ops_stock_items
                where po_no = v_receipt.po_id and sku = v_pol.sku and status = 'incoming'
                order by created_at limit v_d)
            returning 1)
          select count(*) into v_moved from freed;
          if v_is_own and v_moved < v_d then
            insert into ops_stock_items
              (unit_code, sku, warehouse_id, status, supplier, po_no, source_ref, date_in)
            select public.gen_unit_code(), v_pol.sku, v_site, 'free',
                   v_supplier_name, v_receipt.po_id,
                   format('amend:%s', p_receipt_id), current_date
              from generate_series(1, v_d - v_moved);
          end if;
        end if;
      else
        -- Over-count correction: reverse the exact consequence, or refuse
        -- with the named blocker.
        if exists (
          select 1 from order_supplier_threads
           where po_id = v_receipt.po_id
             and operation_stage in ('ready_to_dispatch','dispatched','delivered')
        ) then
          raise exception 'goods from % already moved to dispatch — the count cannot be lowered', v_receipt.po_id
            using errcode = 'P0001', detail = 'threads_block_amend';
        end if;
        if v_pol.received_qty + v_d < 0 then
          raise exception 'line % cannot go below zero received', v_pol.sku
            using errcode = 'P0001', detail = 'lines_block_amend';
        end if;
        if v_posts_stock then
          -- Exact units first: this session's own received results, still free.
          with take as (
            select r.stock_item_id from receiving_unit_results r
              join ops_stock_items i on i.id = r.stock_item_id
             where r.receipt_id = p_receipt_id and r.outcome = 'received'
               and i.status = 'free'
             order by r.created_at desc limit (-v_d)
          ), back as (
            update ops_stock_items set status = 'incoming',
                   warehouse_id = v_po.warehouse_id, updated_at = now()
             where id in (select stock_item_id from take)
            returning id)
          select count(*) into v_moved from back;
          if v_moved < (-v_d) then
            with take as (
              select id from ops_stock_items
               where po_no = v_receipt.po_id and sku = v_pol.sku and status = 'free'
               order by created_at desc limit ((-v_d) - v_moved)
            ), back as (
              update ops_stock_items set status = 'incoming',
                     warehouse_id = v_po.warehouse_id, updated_at = now()
               where id in (select id from take)
              returning id)
            select v_moved + count(*) into v_moved from back;
          end if;
          if v_moved < (-v_d) then
            raise exception 'units on % are reserved or moved — the count cannot be lowered', v_pol.sku
              using errcode = 'P0001', detail = 'units_block_amend';
          end if;
          -- The rollup triggers lower the derived `stock_balances` as the
          -- Units return to incoming (0366).
          -- The unit results this correction reversed read Not received now.
          update receiving_unit_results r
             set outcome = 'not_received', issue_kind = null
            from ops_stock_items i
           where r.receipt_id = p_receipt_id and r.stock_item_id = i.id
             and r.outcome = 'received' and i.status = 'incoming';
        end if;
        update purchase_order_lines set received_qty = received_qty + v_d
         where id = v_line_id;
        -- Un-completing the PO restores the snapshot taken at posting.
        select count(*) into v_outstanding
          from purchase_order_lines where po_id = v_receipt.po_id and received_qty < qty;
        if v_po.status = 'received' and v_outstanding > 0 then
          if v_receipt.po_status_before is null then
            raise exception 'this receiving completed the PO before state snapshots existed'
              using errcode = 'P0001', detail = 'legacy_completion_block_amend';
          end if;
          update purchase_orders
             set status = v_receipt.po_status_before::po_status,
                 sup_status = v_receipt.sup_status_before::po_sup_status,
                 updated_at = now()
           where id = v_receipt.po_id;
        end if;
      end if;

      v_before := v_before || jsonb_build_object('line_' || v_line_id, v_old_recv);
      v_after  := v_after  || jsonb_build_object('line_' || v_line_id, v_new_recv);
      -- The session's own record states the corrected count.
      update warehouse_receipts
         set lines = (
           select jsonb_agg(case when (t.val->>'id')::uuid = v_line_id
                                 then jsonb_set(t.val, '{received_now}', to_jsonb(v_new_recv))
                                 else t.val end)
             from jsonb_array_elements(warehouse_receipts.lines) as t(val)),
             updated_at = now()
       where id = p_receipt_id;
    end loop;
  end if;

  if v_before = '{}'::jsonb then
    raise exception 'nothing changed — state the correction first'
      using errcode = '22023', detail = 'nothing_to_amend';
  end if;

  insert into receiving_events (receipt_id, event, actor_id, payload)
  values (p_receipt_id, 'amended', v_uid,
          jsonb_build_object('reason', btrim(p_reason),
                             'before', v_before, 'after', v_after,
                             'save_key', p_save_key,
                             'grn_no', v_receipt.grn_no,
                             'quantities_changed', v_qty_changed,
                             'normal_user_id', v_ctx->>'normal_user_id',
                             'acting_user_id', v_ctx->>'acting_user_id'));
  insert into po_history (po_id, text, by_role, by_user_id)
  values (v_receipt.po_id,
          format('Receiving %s amended — %s',
                 coalesce(v_receipt.grn_no, 'record'), btrim(p_reason)),
          public.app_role(), v_uid);
  insert into audit_log (role, actor_text, action, ref)
  values (public.app_role(),
          coalesce((select name from app_users where id = v_uid), 'Operations'),
          format('Amended %s — %s', coalesce(v_receipt.grn_no, p_receipt_id::text), btrim(p_reason)),
          v_receipt.po_id);

  return jsonb_build_object('receipt_id', p_receipt_id, 'status', 'posted',
                            'before', v_before, 'after', v_after);
end;
$fn$;

revoke all on function public.receiving_amend(uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.receiving_amend(uuid, text, jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- §8 · receiving_void — only for a GRN that should never have existed
-- ---------------------------------------------------------------------------

create or replace function public.receiving_void(
  p_receipt_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_ctx jsonb;
  v_receipt warehouse_receipts;
  v_po purchase_orders;
  v_line jsonb; v_pol purchase_order_lines;
  v_recv int; v_dmg int; v_wrong int;
  v_posts_stock boolean; v_site uuid; v_moved int;
  v_claims int;
begin
  v_ctx := public.receiving_require_post_authority();
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'a void reason is required'
      using errcode = '22023', detail = 'void_reason_required';
  end if;
  select * into v_receipt from warehouse_receipts where id = p_receipt_id for update;
  if not found then
    raise exception 'receipt not found' using errcode = '42P01', detail = 'receipt_not_found';
  end if;
  if v_receipt.status = 'voided' then
    return jsonb_build_object('receipt_id', p_receipt_id, 'status', 'voided',
                              'already_saved', true);
  end if;
  if v_receipt.status <> 'posted' then
    raise exception 'only a posted receiving can be voided'
      using errcode = '22023', detail = 'receipt_not_posted';
  end if;

  select * into v_po from purchase_orders where id = v_receipt.po_id for update;
  v_site := coalesce(v_receipt.actual_site_id, v_po.warehouse_id);
  select (pd.warehouse_id is not null and pd.warehouse_id = v_po.warehouse_id)
    into v_posts_stock
    from purchasing_destinations pd
   where pd.id = v_po.destination_id;
  v_posts_stock := coalesce(v_posts_stock, false) or v_receipt.actual_site_id is not null;

  -- ── named downstream blockers, never a partial void ──────────────────────
  select count(*) into v_claims from supplier_claims
   where warehouse_receipt_id = p_receipt_id;
  if v_claims > 0 then
    raise exception '% supplier claim(s) were opened from this receiving — settle them first', v_claims
      using errcode = 'P0001', detail = 'claims_block_void';
  end if;
  if exists (
    select 1 from order_supplier_threads
     where po_id = v_receipt.po_id
       and operation_stage in ('ready_to_dispatch','dispatched','delivered')
  ) then
    raise exception 'goods from % already moved to dispatch — this receiving cannot be voided', v_receipt.po_id
      using errcode = 'P0001', detail = 'threads_block_void';
  end if;
  if v_po.status = 'received' and v_receipt.po_status_before is null then
    raise exception 'this receiving completed the PO before state snapshots existed'
      using errcode = 'P0001', detail = 'legacy_completion_block_void';
  end if;

  -- ── reverse every line exactly ───────────────────────────────────────────
  for v_line in select * from jsonb_array_elements(coalesce(v_receipt.lines, '[]'::jsonb)) loop
    v_recv  := coalesce((v_line->>'received_now')::int, 0);
    v_dmg   := coalesce((v_line->>'damaged_qty')::int, 0);
    v_wrong := coalesce((v_line->>'wrong_item_qty')::int, 0);
    if v_recv + v_dmg + v_wrong = 0 then continue; end if;
    select * into v_pol from purchase_order_lines
     where id = (v_line->>'id')::uuid and po_id = v_receipt.po_id for update;
    if not found then
      raise exception 'PO line % is gone — this receiving cannot be voided automatically', v_line->>'sku'
        using errcode = 'P0001', detail = 'lines_block_void';
    end if;
    if v_pol.received_qty < v_recv or v_pol.damaged_qty < v_dmg or v_pol.wrong_item_qty < v_wrong then
      raise exception 'line % no longer carries this receiving''s quantities', v_pol.sku
        using errcode = 'P0001', detail = 'lines_block_void';
    end if;

    if v_recv > 0 and v_posts_stock then
      -- Exact units first; a legacy quantity session reverses newest-first.
      with take as (
        select r.stock_item_id from receiving_unit_results r
          join ops_stock_items i on i.id = r.stock_item_id
         where r.receipt_id = p_receipt_id and r.outcome = 'received'
           and i.sku = v_pol.sku and i.status = 'free'
         order by r.created_at desc limit v_recv
      ), back as (
        update ops_stock_items set status = 'incoming',
               warehouse_id = v_po.warehouse_id, updated_at = now()
         where id in (select stock_item_id from take)
        returning id)
      select count(*) into v_moved from back;
      if v_moved < v_recv then
        with take as (
          select id from ops_stock_items
           where po_no = v_receipt.po_id and sku = v_pol.sku and status = 'free'
           order by created_at desc limit (v_recv - v_moved)
        ), back as (
          update ops_stock_items set status = 'incoming',
                 warehouse_id = v_po.warehouse_id, updated_at = now()
           where id in (select id from take)
          returning id)
        select v_moved + count(*) into v_moved from back;
      end if;
      if v_moved < v_recv then
        raise exception 'units on % are reserved or moved — this receiving cannot be voided', v_pol.sku
          using errcode = 'P0001', detail = 'units_block_void';
      end if;
      -- The rollup triggers lower the derived `stock_balances` as the Units
      -- return to incoming (0366).
    end if;

    update purchase_order_lines
       set received_qty   = received_qty - v_recv,
           damaged_qty    = damaged_qty - v_dmg,
           wrong_item_qty = wrong_item_qty - v_wrong
     where id = v_pol.id;
  end loop;

  if v_po.status = 'received' then
    update purchase_orders
       set status = v_receipt.po_status_before::po_status,
           sup_status = v_receipt.sup_status_before::po_sup_status,
           updated_at = now()
     where id = v_receipt.po_id;
  end if;

  update warehouse_receipts
     set status = 'voided', void_at = now(), void_by = v_uid,
         void_reason = btrim(p_reason), updated_at = now()
   where id = p_receipt_id;

  insert into receiving_events (receipt_id, event, actor_id, payload)
  values (p_receipt_id, 'voided', v_uid,
          jsonb_build_object('reason', btrim(p_reason),
                             'grn_no', v_receipt.grn_no,
                             'normal_user_id', v_ctx->>'normal_user_id',
                             'acting_user_id', v_ctx->>'acting_user_id'));
  insert into po_history (po_id, text, by_role, by_user_id)
  values (v_receipt.po_id,
          format('Receiving %s voided — %s',
                 coalesce(v_receipt.grn_no, 'record'), btrim(p_reason)),
          public.app_role(), v_uid);
  insert into audit_log (role, actor_text, action, ref)
  values (public.app_role(),
          coalesce((select name from app_users where id = v_uid), 'Operations'),
          format('Voided %s — %s', coalesce(v_receipt.grn_no, p_receipt_id::text), btrim(p_reason)),
          v_receipt.po_id);

  return jsonb_build_object('receipt_id', p_receipt_id, 'status', 'voided',
                            'grn_no', v_receipt.grn_no);
end;
$fn$;

revoke all on function public.receiving_void(uuid, text) from public, anon;
grant execute on function public.receiving_void(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- §9 · sanity
-- ---------------------------------------------------------------------------

do $$
declare v int;
begin
  select count(*) into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'operation_receive_po_with_do';
  if v <> 1 then raise exception 'sanity: % copies of operation_receive_po_with_do', v; end if;
  select count(*) into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'office_receive_post';
  if v <> 1 then raise exception 'sanity: % copies of office_receive_post', v; end if;
  select count(*) into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'warehouse_receipt_check_in';
  if v <> 1 then raise exception 'sanity: % copies of warehouse_receipt_check_in', v; end if;
  select count(*) into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('receiving_amend','receiving_void');
  if v <> 2 then raise exception 'sanity: amend/void doors missing (%)', v; end if;
  -- The doors ask the duty gate, not the wide role check.
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'office_receive_post')
     not like '%receiving_require_post_authority%' then
    raise exception 'sanity: office_receive_post must ask the GRN duty gate';
  end if;
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'warehouse_receipt_check_in')
     not like '%receiving_require_post_authority%' then
    raise exception 'sanity: warehouse_receipt_check_in must ask the GRN duty gate';
  end if;
  -- One copy of the counting law, still.
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'office_receive_post')
     not like '%warehouse_receipt_validate_lines%' then
    raise exception 'sanity: office_receive_post must call the shared validator';
  end if;
  -- The GRN number is allocated from the one formal pool.
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'office_receive_post')
     not like '%allocate_formal_document_code%' then
    raise exception 'sanity: posting must draw the GRN number from the formal pool';
  end if;
  if has_function_privilege('anon', 'public.receiving_void(uuid, text)', 'execute') then
    raise exception 'sanity: receiving_void must not be callable by anon';
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
     where table_name = 'receiving_unit_results'
       and grantee = 'authenticated'
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ) then
    raise exception 'sanity: receiving_unit_results must be RPC-only';
  end if;
end $$;

commit;
