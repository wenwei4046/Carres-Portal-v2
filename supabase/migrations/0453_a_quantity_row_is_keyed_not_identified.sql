-- 0453_a_quantity_row_is_keyed_not_identified.sql
--
-- ⭐ THE UNIT ID CORRECTION. Reported 2026-09-09: operators still see lowercase
-- Unit IDs of the shape `id-aam135002` where the approved identity is
-- `U1-000-001`. Card 10 (0442 · 0443 · 0444, applied 2026-09-08) closed the
-- PURCHASE ORDER birth. It did not close the four doors below, and this file
-- is measured against production, not against that Card's intent.
--
-- ---- WHAT WAS MEASURED, 2026-09-09 ----------------------------------------
--
--   222 register codes.  82 approved `U…`.  140 legacy `id-…`.
--
-- The 140 are NOT a substituted identity. `unit_id_series.last_number` = 82 and
-- exactly 82 `U…` codes exist, every one bound to a live row, with zero orphans
-- in `stock_unit_ids`. Not one `U…` was ever allocated and lost, so there is no
-- original identity to restore and nothing to renumber. 0443's preflight had
-- already restored the 39 the destination trigger voided. The 140 are goods
-- that never had a `U…` identity: 84 opening-stock imports (2026-07-11),
-- 51 pre-0443 PO mints on 41 lines, 5 quantity bulk rows.
--
-- ---- THE FOUR DOORS THAT STILL MINT, AND WHY ------------------------------
--
--   🔴 1 · THE COLUMN DEFAULT IS A LIVE GENERATOR.
--      `ops_stock_items.unit_code default gen_unit_code()` (0153, kept by 0366
--      and blessed by 0416). ANY insert that omits the column silently mints a
--      lowercase code. 0442–0444 never touched it.
--
--   🔴 2 · `ops_stock_book_in_units` NAMES NO unit_code AT ALL.
--      The governed stock-import door (0366) inserts `identity_scope` rows at
--      its `'unit'` default and lets the DEFAULT above name them. This is the
--      door that is still producing `id-…` Unit IDs for EXACT units today, and
--      it is the one an operator can reach — `POST /api/ops/stock/import`.
--
--   🔴 3 · RECEIVING STILL MINTS FOR QUANTITY BULK ROWS.
--      0444 removed the shortfall mint that invented an IDENTITY. It left the
--      four bulk-row mints — three in `operation_receive_po_with_do`, one in
--      `receiving_amend` — which key a `identity_scope = 'quantity'` row with
--      `gen_unit_code()`. That key is a technical key, and it is correct that a
--      counted row needs one; it is NOT correct that it wears the shape of an
--      identity and prints under a `Unit ID` heading.
--
--   🔴 4 · THE DATABASE STILL BLESSES THE LEGACY SHAPE.
--      `ops_stock_items_unit_code_format` (0416) admits `^id-[a-z]{3}[0-9]{6}$`
--      for any row, forever. Nothing obliges a NEW exact-unit row to be `U…`.
--
-- ---- WHAT THIS FILE DOES --------------------------------------------------
--
-- A QUANTITY ROW IS KEYED. AN EXACT UNIT IS IDENTIFIED. The two stop sharing a
-- shape, so no surface can print one as the other.
--
--   · `gen_quantity_key()` mints `QTY-000000001` for counted rows — visibly not
--     a Unit ID, owner-only, and never shown to an operator.
--   · every remaining mint moves onto it; `gen_unit_code()` is DROPPED, so the
--     `id-…` shape has no producer left anywhere in the database.
--   · the column DEFAULT is dropped: nothing is keyed by omission.
--   · `ops_stock_book_in_units` allocates a real `U…` identity for an exact
--     unit and a `QTY-` key for a counted row.
--   · a BEFORE INSERT trigger holds the rule for every future door: a NEW
--     `unit` row wears `U…`, a NEW `quantity` row wears `QTY-`.
--   · the two register views expose `identity_scope`, so the surfaces can tell
--     an identity from a key. Until now they could not, which is why a bulk row
--     of 893 accessories printed a Unit ID.
--
-- ⛔ NOT ONE EXISTING ROW IS REWRITTEN. The 140 legacy codes are on labels, on
-- supplier PDFs and in audit history. The trigger fires on INSERT only, and the
-- CHECK keeps grandfathering the `id-` shape so history stays valid and
-- readable. Retiring those codes is a data ruling for the Owner, not a
-- constraint edit — and under Constitution §6 every one of them is test data
-- that go-live discards.

begin;

-- ─── 1 · a counted row gets a KEY, and it is not shaped like an identity ────

create or replace function public.gen_quantity_key()
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_code text;
  v_try  int := 0;
begin
  loop
    v_try := v_try + 1;
    v_code := 'QTY-' || lpad(floor(random() * 1000000000)::bigint::text, 9, '0');
    exit when not exists (select 1 from public.stock_unit_ids where unit_code = v_code)
          and not exists (select 1 from public.ops_stock_items where unit_code = v_code);
    if v_try >= 100 then
      raise exception 'gen_quantity_key: could not find a free key after 100 tries'
        using errcode = 'P0001', detail = 'quantity_key_exhausted';
    end if;
  end loop;
  return v_code;
end;
$function$;

comment on function public.gen_quantity_key() is
  '0453: the technical key of a counted (identity_scope = quantity) register row. QTY-000000001 — deliberately NOT the shape of a Unit ID, so no screen, PDF or scan can present it as one. Never an identity: counted goods have none.';

revoke all on function public.gen_quantity_key() from public, anon, authenticated, service_role;

-- ─── 2 · the receive engine keys its bulk rows, and mints no identity ──────

-- ─── 3 · the ONE receive engine — verifier, never issuer ─────────────────────
drop function if exists public.operation_receive_po_with_do(text, text, text, jsonb, uuid);

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
  -- 0444
  v_mode               text;
  v_named              int;
  v_rest               int;
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

    -- ⭐ 0444 · THE MODE DECIDES, AT THE ENGINE TOO. A direct caller cannot
    -- take the quantity path for a traceable line by leaving `units` out,
    -- nor name Units against a quantity line. For an exact-unit line the
    -- named outcomes ARE the quantities — the counts must agree exactly.
    v_mode  := v_existing_line.identity_mode;
    v_named := cardinality(v_recv_ids) + cardinality(v_dmg_ids) + cardinality(v_wrong_ids);
    if v_mode is null then
      raise exception 'line % has no stock identity mode — set it for the SKU in Catalog', v_sku
        using errcode = 'P0001', detail = 'line_identity_mode_missing';
    end if;
    if v_mode = 'quantity' and v_named > 0 then
      raise exception 'line % is counted by quantity — it has no Unit IDs to scan', v_sku
        using errcode = 'P0001', detail = 'quantity_line_takes_no_units';
    end if;
    if v_mode = 'exact_unit' then
      if v_named = 0 and (v_delta > 0 or v_damaged_add > 0 or v_wrong_add > 0) then
        raise exception 'line % is traced by Unit ID — record one result for each expected Unit', v_sku
          using errcode = 'P0001', detail = 'exact_unit_line_needs_units';
      end if;
      if cardinality(v_recv_ids) <> v_delta
         or cardinality(v_dmg_ids) <> v_damaged_add
         or cardinality(v_wrong_ids) <> v_wrong_add then
        raise exception 'line % names % received, % damaged and % wrong Units but reports %, % and %',
                        v_sku, cardinality(v_recv_ids), cardinality(v_dmg_ids), cardinality(v_wrong_ids),
                        v_delta, v_damaged_add, v_wrong_add
          using errcode = 'P0001', detail = 'unit_outcomes_mismatch';
      end if;
      -- Every named Unit must be THIS line's, still incoming.
      if exists (
        select 1 from unnest(v_recv_ids || v_dmg_ids || v_wrong_ids) as x(id)
          left join ops_stock_items u on u.id = x.id
         where u.id is null or u.po_line_id is distinct from v_line_id
            or u.identity_scope <> 'unit' or u.status <> 'incoming'
      ) then
        raise exception 'a named Unit on % is not an incoming Unit of this line', v_sku
          using errcode = 'P0001', detail = 'unit_not_on_this_line';
      end if;
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
        -- 0444 · QUANTITY LINE. Units minted for this line before 0442 (fake
        -- IDs the old issue path gave interchangeable goods) are permanent:
        -- they flip oldest-first, by LINE, until none are left. The rest of
        -- the received count becomes ONE bulk register row — counted goods,
        -- no Unit ID. Nothing is minted as a Unit.
        with freed as (
          update ops_stock_items
             set status = 'free', warehouse_id = v_site, updated_at = now(),
                 ownership = case when v_po.is_consignment
                                  then 'supplier_consignment' else ownership end,
                 supplier = coalesce(nullif(btrim(coalesce(supplier, '')), ''), v_supplier_name)
           where id in (
             select id from ops_stock_items
              where po_line_id = v_line_id and identity_scope = 'unit' and status = 'incoming'
              order by created_at
              limit v_delta
           )
          returning 1
        )
        select count(*) into v_freed from freed;
        v_rest := v_delta - v_freed;
        if v_rest > 0 then
          insert into ops_stock_items
            (unit_code, sku, warehouse_id, status, ownership, supplier, po_no, po_line_id,
             identity_scope, qty, source_ref, date_in)
          values
            (public.gen_quantity_key(), v_sku, v_site, 'free', v_ownership,
             v_supplier_name, p_po_id, v_line_id,
             'quantity', v_rest, btrim(p_do_number), current_date);
        end if;
      end if;

      -- 0444 · no shortfall mint: Receiving never creates an identity.
      v_minted := 0;

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
        -- 0444 · quantity line: legacy line-bound Units first, then one bulk
        -- controlled row for the rest. Received-with-issue goods are present
        -- but unavailable; they never become a Unit.
        with held as (
          update ops_stock_items
             set status = 'on_hold', hold_reason = 'damaged',
                 hold_claim_id = v_damaged_claim, held_at = now(),
                 warehouse_id = v_site, updated_at = now()
           where id in (
             select id from ops_stock_items
              where po_line_id = v_line_id and identity_scope = 'unit' and status = 'incoming'
              order by created_at
              limit v_damaged_add
           )
          returning 1
        )
        select count(*) into v_held from held;
        v_rest := v_damaged_add - v_held;
        if v_rest > 0 and v_posts_stock then
          insert into ops_stock_items
            (unit_code, sku, warehouse_id, status, ownership, supplier, po_no, po_line_id,
             identity_scope, qty, hold_reason, hold_claim_id, held_at, source_ref, date_in)
          values
            (public.gen_quantity_key(), v_sku, v_site, 'on_hold', v_ownership,
             v_supplier_name, p_po_id, v_line_id,
             'quantity', v_rest, 'damaged', v_damaged_claim, now(), btrim(p_do_number), current_date);
          v_held := v_held + v_rest;
        end if;
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
                 warehouse_id = v_site, updated_at = now()
           where id in (
             select id from ops_stock_items
              where po_line_id = v_line_id and identity_scope = 'unit' and status = 'incoming'
              order by created_at
              limit v_wrong_add
           )
          returning 1
        )
        select count(*) into v_held from held;
        v_rest := v_wrong_add - v_held;
        if v_rest > 0 and v_posts_stock then
          insert into ops_stock_items
            (unit_code, sku, warehouse_id, status, ownership, supplier, po_no, po_line_id,
             identity_scope, qty, hold_reason, hold_claim_id, held_at, source_ref, date_in)
          values
            (public.gen_quantity_key(), v_sku, v_site, 'on_hold', v_ownership,
             v_supplier_name, p_po_id, v_line_id,
             'quantity', v_rest, 'wrong_item', v_wrong_claim, now(), btrim(p_do_number), current_date);
          v_held := v_held + v_rest;
        end if;
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


-- ─── 3 · the amendment keys its correction rows the same way ───────────────

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
  -- 0427
  v_new_do_file text;
  v_evidence_add jsonb;
  v_evidence_before int;
  -- 0444
  v_rest int;
  v_bulk ops_stock_items;
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
      raise exception 'Goods received on cannot be in the future'
        using errcode = '22023', detail = 'received_date_future';
    end if;
    if v_new_date < (v_po.placed_at at time zone 'Asia/Kuala_Lumpur')::date then
      raise exception 'Goods received on cannot be before the PO date (%)',
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

  -- ── 0427 · the paper's evidence ──────────────────────────────────────────
  if p_changes ? 'do_file_path' then
    v_new_do_file := btrim(coalesce(p_changes->>'do_file_path',''));
    if length(v_new_do_file) < 3 then
      raise exception 'a corrected DO file is required'
        using errcode = '22023', detail = 'do_file_invalid';
    end if;
    if v_new_do_file is distinct from coalesce(v_receipt.do_file_path,'') then
      -- The old paper is PRESERVED in before/after; the file is never deleted.
      v_before := v_before || jsonb_build_object('do_file_path', v_receipt.do_file_path);
      v_after  := v_after  || jsonb_build_object('do_file_path', v_new_do_file);
      update warehouse_receipts set do_file_path = v_new_do_file, updated_at = now()
       where id = p_receipt_id;
    end if;
  end if;

  if p_changes ? 'arrival_evidence_add' then
    v_evidence_add := p_changes->'arrival_evidence_add';
    if v_evidence_add is not null and jsonb_typeof(v_evidence_add) = 'array'
       and jsonb_array_length(v_evidence_add) > 0 then
      for v_chg in select * from jsonb_array_elements(v_evidence_add) loop
        if length(btrim(coalesce(v_chg->>'path',''))) < 3
           or coalesce(v_chg->>'kind','') not in ('photo','video') then
          raise exception 'invalid arrival evidence entry'
            using errcode = '22023', detail = 'evidence_invalid';
        end if;
      end loop;
      v_evidence_before :=
        coalesce(jsonb_array_length(coalesce(v_receipt.arrival_evidence, '[]'::jsonb)), 0);
      v_before := v_before || jsonb_build_object('arrival_evidence_count', v_evidence_before);
      v_after  := v_after  || jsonb_build_object(
        'arrival_evidence_count', v_evidence_before + jsonb_array_length(v_evidence_add));
      -- APPEND-ONLY: an amendment never removes recorded evidence.
      update warehouse_receipts
         set arrival_evidence = coalesce(arrival_evidence, '[]'::jsonb) || v_evidence_add,
             updated_at = now()
       where id = p_receipt_id;
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
          -- 0444 · an under-count correction flips this LINE's own incoming
          -- Units (oldest first). An exact-unit line that has none left to
          -- flip is refused: Receiving never invents an identity. A quantity
          -- line records the rest as a bulk register row.
          with freed as (
            update ops_stock_items
               set status = 'free', warehouse_id = v_site, updated_at = now()
             where id in (
               select id from ops_stock_items
                where po_line_id = v_line_id and identity_scope = 'unit' and status = 'incoming'
                order by created_at limit v_d)
            returning 1)
          select count(*) into v_moved from freed;
          v_rest := v_d - v_moved;
          if v_rest > 0 then
            if v_pol.identity_mode = 'exact_unit' then
              raise exception 'line % has no more expected Units to receive', v_pol.sku
                using errcode = 'P0001', detail = 'exact_unit_line_needs_units';
            end if;
            insert into ops_stock_items
              (unit_code, sku, warehouse_id, status, supplier, po_no, po_line_id,
               identity_scope, qty, source_ref, date_in)
            values
              (public.gen_quantity_key(), v_pol.sku, v_site, 'free',
               v_supplier_name, v_receipt.po_id, v_line_id,
               'quantity', v_rest, format('amend:%s', p_receipt_id), current_date);
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
            -- 0444 · by LINE. Exact Units go back to incoming; a quantity
            -- line's bulk rows shrink (a row that reaches zero is retired,
            -- never deleted).
            with take as (
              select id from ops_stock_items
               where po_line_id = v_line_id and identity_scope = 'unit' and status = 'free'
               order by created_at desc limit ((-v_d) - v_moved)
            ), back as (
              update ops_stock_items set status = 'incoming',
                     warehouse_id = v_po.warehouse_id, updated_at = now()
               where id in (select id from take)
              returning id)
            select v_moved + count(*) into v_moved from back;
          end if;
          while v_moved < (-v_d) loop
            select * into v_bulk from ops_stock_items
             where po_line_id = v_line_id and identity_scope = 'quantity' and status = 'free'
             order by created_at desc limit 1 for update;
            exit when not found;
            v_rest := least(v_bulk.qty, (-v_d) - v_moved);
            if v_rest = v_bulk.qty then
              update ops_stock_items set status = 'voided', updated_at = now() where id = v_bulk.id;
            else
              update ops_stock_items set qty = qty - v_rest, updated_at = now() where id = v_bulk.id;
            end if;
            v_moved := v_moved + v_rest;
          end loop;
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

-- The drop/create above re-creates the function, and Postgres hands a new
-- function EXECUTE to PUBLIC. The engine already refuses a caller whose
-- app_role() is not logistics/principal/partner (42501), but an unauthenticated
-- role has no business holding the grant at all.
revoke all on function public.operation_receive_po_with_do(text, text, text, jsonb, uuid)
  from public, anon;

comment on function public.operation_receive_po_with_do(text, text, text, jsonb, uuid) is
  '0444/0453: the ONE receive engine, mode-aware. Exact-unit line: flips only the named line-bound Units and refuses a quantity-only submission; quantity line: refuses Units and records the count as bulk rows keyed by gen_quantity_key(). Never mints an identity, and never a code shaped like one.';

comment on function public.receiving_amend(uuid, text, jsonb, uuid) is
  '0444/0453: a posted receiving is corrected, never re-minted. A quantity correction that needs a new bulk row keys it with gen_quantity_key(); an exact-unit line is refused rather than given an invented identity.';

-- ─── 4 · the stock-import door allocates an IDENTITY, or keys a COUNT ───────
--
-- 0366 called this "a DOOR: the RPC mints an identity per row". It did not — it
-- omitted `unit_code` and let the column DEFAULT name the row, which is how an
-- exact unit came to wear `id-…`. Now it asks for the right thing by name.

create or replace function public.ops_stock_book_in_units(p_rows jsonb, p_warehouse_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
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
      (unit_code, identity_scope,
       sku, warehouse_id, condition, status, qty, reserved_ref,
       supplier, po_no, source_ref, date_in, ownership)
    select
           -- ONE piece is an exact unit and is born with the locked identity.
           -- MANY pieces on one row are counted goods: a key, never an ID.
           case when coalesce((r->>'qty')::int, 1) = 1
                then public.allocate_unit_id()
                else public.gen_quantity_key() end,
           case when coalesce((r->>'qty')::int, 1) = 1 then 'unit' else 'quantity' end,
           r->>'sku',
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
$function$;

comment on function public.ops_stock_book_in_units(jsonb, uuid) is
  '0366/0453: the one book-in door. A single piece is born with a real allocate_unit_id() identity (U1-000-001); a multi-piece row is counted goods and gets a gen_quantity_key() technical key. 0366 relied on the column DEFAULT and so stamped exact units with the legacy id- shape.';

-- ─── 5 · nothing is keyed by omission, and the legacy shape loses its maker ──

alter table public.ops_stock_items alter column unit_code drop default;

drop function if exists public.gen_unit_code();

-- ─── 6 · the column admits the key, and still reads its own history ─────────

alter table public.ops_stock_items
  drop constraint if exists ops_stock_items_unit_code_format;
alter table public.ops_stock_items
  add constraint ops_stock_items_unit_code_format
  check (
    unit_code ~ '^U\d+-\d{3}-\d{3}$'
    or unit_code ~ '^QTY-\d{9}$'
    or unit_code ~ '^id-[a-z]{3}[0-9]{6}$'
  );

comment on constraint ops_stock_items_unit_code_format on public.ops_stock_items is
  '0453 — three shapes, and only two of them have a producer. U1-000-001 is the locked identity allocate_unit_id() mints for an exact unit; QTY-000000001 is the technical key gen_quantity_key() gives a counted row; id-abc123456 is GRANDFATHERED history only — gen_unit_code() is dropped, so nothing can make another. New rows are held to the first two by trg_stock_unit_code_matches_scope.';

-- ─── 7 · the rule every future door inherits ───────────────────────────────
--
-- INSERT only, on purpose. The 140 historical `id-` rows must stay updatable —
-- they move, they are reserved, they are delivered — and none of that is
-- allowed to require rewriting the code on their label.

create or replace function public.trg_stock_unit_code_matches_scope()
returns trigger
language plpgsql
as $function$
begin
  if new.identity_scope = 'unit' and new.unit_code !~ '^U\d+-\d{3}-\d{3}$' then
    raise exception
      'an exact unit is born with a Carres Unit ID (U1-000-001), not %', new.unit_code
      using errcode = 'P0001', detail = 'unit_needs_locked_identity';
  end if;
  if new.identity_scope = 'quantity' and new.unit_code !~ '^QTY-\d{9}$' then
    raise exception
      'counted goods carry a technical key (QTY-000000001), never a Unit ID — got %', new.unit_code
      using errcode = 'P0001', detail = 'quantity_takes_no_identity';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_stock_unit_code_matches_scope on public.ops_stock_items;
create trigger trg_stock_unit_code_matches_scope
  before insert on public.ops_stock_items
  for each row execute function public.trg_stock_unit_code_matches_scope();

comment on function public.trg_stock_unit_code_matches_scope() is
  '0453: a new row wears the shape its scope earns — exact unit U…, counted goods QTY-…. INSERT only, so the grandfathered id- rows stay fully updatable and keep the code printed on their label.';

-- ─── 8 · the surfaces can finally tell an identity from a key ───────────────

-- ⚠️ `security_invoker` is a VIEW OPTION, and `create or replace view` resets
-- it. Both views run as the CALLER so RLS applies to the person reading, and
-- restating the option here is what keeps that true (caught by
-- scripts/verify-inventory-read-surface.sql).
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
    identity_scope
   FROM ops_stock_items i;

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
    v.identity_scope
   FROM stock_unit_availability_v v
     LEFT JOIN warehouses w ON w.id = v.warehouse_id
     LEFT JOIN stock_operating_parties p ON p.id = v.holder_party_id
     LEFT JOIN LATERAL ( SELECT ev.event_at AS last_event_at,
            ev.event AS last_event
           FROM stock_unit_events ev
          WHERE ev.unit_id = v.id
          ORDER BY ev.seq DESC
         LIMIT 1) e ON true;

-- ─── 9 · this file proves its own claims before it commits ──────────────────

do $sanity$
declare
  v_n int;
begin
  -- the legacy generator has no producer left
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'gen_unit_code') then
    raise exception '0453 sanity: gen_unit_code() still exists';
  end if;

  -- nothing is keyed by omission
  if exists (
    select 1 from pg_attrdef d
      join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
     where d.adrelid = 'public.ops_stock_items'::regclass and a.attname = 'unit_code'
  ) then
    raise exception '0453 sanity: unit_code still has a DEFAULT';
  end if;

  -- no live function can still call the dropped generator
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and pg_get_functiondef(p.oid) ~ 'gen_unit_code\(\)';
  if v_n > 0 then
    raise exception '0453 sanity: % function(s) still call gen_unit_code()', v_n;
  end if;

  -- the scope reaches the surfaces
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'stock_unit_register_v'
                    and column_name = 'identity_scope') then
    raise exception '0453 sanity: stock_unit_register_v does not expose identity_scope';
  end if;

  raise notice '0453 OK — the id- shape has no producer, no DEFAULT keys a row by omission, and identity_scope reaches the register.';
end
$sanity$;

commit;
