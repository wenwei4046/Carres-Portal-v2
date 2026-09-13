-- =============================================================================
-- 0500_role_gates_refuse_a_caller_with_no_role.sql
-- =============================================================================
-- WHAT WAS WRONG, MEASURED
--   app_role() is NULL for a caller who is not signed in, for a signed-in
--   account with no app_users row, and for a disabled account. Many SECURITY
--   DEFINER functions guard themselves with
--       if app_role() not in ('principal', ...) then raise ...
--   and `NULL not in (...)` is NULL, not true, so the raise never runs and the
--   caller walks through. Some others skip their duty check the same way:
--       if v_role <> 'principal' then <check duties, raise if missing> end if;
--   Proven locally in rolled-back transactions: a no-role or disabled
--   account ran these functions as if it had a role. 0482 took EXECUTE away
--   from anon; this closes the same hole for a signed-in account with no
--   active role.
--
-- WHAT THIS CHANGES
--   A. GRANTS. Revokes EXECUTE from public and anon on 72 SECURITY DEFINER
--      function(s) 0482 does not list (created or re-signed after 0482's list
--      was taken, 0483-0498 included). Supabase grants anon EXECUTE on every
--      new function by default; none has an unauthenticated caller.
--      authenticated is not touched.
--   B. FUNCTION BODIES. For 107 SECURITY DEFINER functions, the role gate
--      is rewritten and nothing else:
--          A not in (...)   ->   (A is null or A not in (...))
--          A <> 'x'         ->   (A is null or A <> 'x')
--      For a caller who has a role the test is exactly the same; it only adds
--      a refusal for the caller who has none.
--      Each rewrite is GUARDED: it runs only if md5(live function body) equals
--      the exact source it was derived from -- the repo's latest definition, or
--      the live definition after the dynamic renames of 0121/0123/0126/0167/
--      0266/0272/0349 (which change bodies without a new `create function`, so
--      replaying repo text would revert them). A function whose live body
--      matches neither is left untouched with a NOTICE, and production_check
--      lists it. The generator proves each rewrite: undoing the gate edits
--      returns the source byte for byte. create or replace keeps owner, grants
--      and comment.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   - No RLS or policy change. No table grant change.
--   - Leaves the eleven finance functions 0481 owns, and the identity helpers
--     RLS policies call (app_role, app_dealer_id, is_internal, ...).
--   - Does not change app_dealer_id / app_partner_id / app_supplier_id, which
--     still read a disabled account's link (next work).
--
-- RLS: none. GRANTS: EXECUTE revoked from public+anon on the part A list;
--   authenticated unchanged. DR/CR: none.
-- =============================================================================

begin;

-- Part A: guarded revokes (a signature absent in this database is skipped).
do $revoke$
declare s text; p regprocedure;
begin
  for s in select unnest(array[
    'public._logistics_release_order_reserve(uuid)',
    'public._logistics_reserve_order(uuid)',
    'public.delivery_handover_record(uuid, text, text, text, jsonb, text, text, text[], jsonb)',
    'public.delivery_order_units_snapshot()',
    'public.delivery_order_void(uuid, text)',
    'public.delivery_outbound_prep_record(uuid, text, text[])',
    'public.delivery_payment_approver_gate()',
    'public.is_logistics()',
    'public.is_operations_superuser(uuid)',
    'public.logistics_abandon_order(uuid, text)',
    'public.logistics_adjust_stock(text, uuid, integer, text)',
    'public.logistics_assign_partner(uuid, uuid)',
    'public.logistics_assign_partner_and_dispatch(text, uuid, text, text, text, uuid)',
    'public.logistics_attach_do_and_deliver(uuid, text, text, boolean, text)',
    'public.logistics_calc_shortages(uuid, uuid)',
    'public.logistics_cancel_po(text, text)',
    'public.logistics_confirm_proceed_request(uuid, uuid)',
    'public.logistics_confirm_proceed_request_v3(uuid)',
    'public.logistics_create_po(uuid, uuid, jsonb, integer, integer[], uuid)',
    'public.logistics_create_pos_batch(jsonb)',
    'public.logistics_dashboard_summary()',
    'public.logistics_dispatch_customer_leg(uuid, uuid, date, boolean)',
    'public.logistics_issue_pos_for_order(uuid)',
    'public.logistics_partner_accept_rfd(uuid)',
    'public.logistics_partner_reject_rfd(uuid, text)',
    'public.logistics_partner_rfd_pending()',
    'public.logistics_pick_warehouse(uuid)',
    'public.logistics_reassign_po_warehouse(text, uuid)',
    'public.logistics_receive_po_line(text, text, integer)',
    'public.logistics_receive_threads(text, uuid[], text, text, text)',
    'public.logistics_relocate_warehouse(text, uuid)',
    'public.logistics_resume_dispatch_from_waiting(uuid)',
    'public.logistics_revert_order_dispatched_to_ready(uuid)',
    'public.logistics_revert_order_proceed_to_placed(uuid)',
    'public.logistics_stock_alerts()',
    'public.logistics_supplier_ready_confirm(text)',
    'public.logistics_warehouse_pick(uuid, uuid)',
    'public.ops_delivery_orders_materialise()',
    'public.ops_rollup_stock_balances(uuid)',
    'public.ops_stock_bind_units(uuid[], text, text)',
    'public.ops_stock_book_in_units(jsonb, uuid)',
    'public.ops_stock_refurbish(uuid)',
    'public.ops_stock_refurbish_complete(uuid)',
    'public.ops_stock_set_condition(uuid, text, text)',
    'public.ops_stock_set_holder(uuid, text, text)',
    'public.ops_stock_set_ownership(uuid, text, text, text)',
    'public.ops_stock_set_site(uuid, uuid, text)',
    'public.ops_stock_set_thresholds(text, uuid, integer, integer)',
    'public.ops_stock_unbind_unit(uuid, text)',
    'public.ops_stock_verify_unit(uuid)',
    'public.po_line_change_needs_revision()',
    'public.purchasing_actor_may_issue(uuid)',
    'public.purchasing_approve_po_cost(text, uuid, text, numeric, text, date)',
    'public.purchasing_check_line_commercials(text, uuid, text, numeric, text, numeric)',
    'public.purchasing_confirm_po_sent(text, integer, text, text, text)',
    'public.purchasing_default_destination()',
    'public.purchasing_po_actor()',
    'public.purchasing_record_po_issue_authority()',
    'public.purchasing_require_reply_evidence()',
    'public.service_case_close_needs_customer()',
    'public.trg_po_destination_guard()',
    'public.trg_po_units_follow_destination()',
    'public.trg_product_sku_identity_history()',
    'public.trg_stock_balances_derive_ins()',
    'public.trg_stock_balances_derive_upd()',
    'public.trg_stock_unit_id_register()',
    'public.trg_stock_unit_lineage()',
    'public.warehouse_can_manage_settings()',
    'public.warehouse_is_person(uuid)',
    'public.warehouse_save_special_date(uuid, uuid, date, text, time without time zone, time without time zone, text)',
    'public.warehouse_set_site_details(uuid, text, text, text, uuid, text, uuid, text)',
    'public.warehouse_set_working_hours(uuid, jsonb)'
  ]::text[]) loop
    p := to_regprocedure(s);
    if p is not null then execute format('revoke all on function %s from public, anon', p); end if;
  end loop;
end
$revoke$;

-- Part B: role gates refuse a caller with no role (guarded by the live body).
create temp table _g0500 (fn text primary key, result text) on commit drop;

-- _add_order_lines_0391_locked_impl(uuid, jsonb, text, uuid, jsonb, jsonb)
--   source: repo 0257_change_request_replace_and_service_addons.sql; 2 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public._add_order_lines_0391_locked_impl(uuid, jsonb, text, uuid, jsonb, jsonb)'); h text;
begin
  if p is null then insert into _g0500 values ('_add_order_lines_0391_locked_impl(uuid, jsonb, text, uuid, jsonb, jsonb)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '7cf649a7f2e83d3e9d263187a2a06339' then
    execute $s0500a$
create or replace function public._add_order_lines_0391_locked_impl(
  p_order_id uuid,
  p_lines jsonb,
  p_source text DEFAULT 'direct',
  p_change_request_id uuid DEFAULT NULL,
  p_addons_replace jsonb DEFAULT NULL,
  p_addons_append jsonb DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order            orders;
  v_req              order_change_requests;
  v_role             app_role;
  v_caller_dealer_id uuid;
  v_line             jsonb;
  v_addon            jsonb;
  v_count            int := 0;
  v_addon_count      int := 0;
  v_delta            numeric(14,2) := 0;
  v_sku              text;
  v_qty              int;
  v_price            numeric;
  v_addon_key        text;
  v_has_sofa         boolean;
  v_has_other        boolean;
  v_append_n         int := 0;
  v_desc             text;
begin
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();

  -- 0222 precedent: a NULL role (anon key / orphaned JWT) is rejected outright.
  if v_role is null then
    raise exception 'forbidden: no app role' using errcode = '42501';
  end if;

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = '42P01';
  end if;

  if (v_role is null or v_role not in ('principal','operation','finance','bd'))
     and v_order.dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer edit' using errcode = '42501';
  end if;

  if p_source = 'direct' then
    -- Direct add = the POS place lane exactly (order-edit-scope laneOf):
    -- status 'place', operation has NOT picked it up, and not an AutoCount
    -- import (those live in the proceed lane → the change-request flow).
    if v_order.status <> 'place'
       or v_order.operation_stage is not null
       or v_order.source_system = 'autocount' then
      raise exception 'Products can only be added while the order is in Order placed'
        using errcode = '22023', detail = 'wrong_status';
    end if;
  elsif p_source = 'change_request' then
    -- 0233 — APPROVE = apply: operation/principal only; the request must be
    -- the order's own PENDING one; the order may sit in the proceed lane
    -- (incl. AutoCount imports — items_edited flips below).
    if (v_role is null or v_role not in ('operation','principal')) then
      raise exception 'forbidden: only operation/principal approve change requests'
        using errcode = '42501';
    end if;
    if p_change_request_id is null then
      raise exception 'change_request source requires p_change_request_id'
        using errcode = '22023', detail = 'invalid_request';
    end if;
    select * into v_req from order_change_requests
     where id = p_change_request_id for update;
    if not found or v_req.order_id is distinct from p_order_id then
      raise exception 'Change request not found for this order'
        using errcode = '42P01';
    end if;
    -- 0257 — a replace_lines request applies through replace_order_lines,
    -- never through the append door.
    if v_req.kind is distinct from 'add_lines' then
      raise exception 'this change request is not an add-product request'
        using errcode = '22023', detail = 'wrong_kind';
    end if;
    if v_req.status <> 'pending' or v_req.applied_at is not null then
      raise exception 'Change request is no longer pending'
        using errcode = '22023', detail = 'wrong_status';
    end if;
    if v_order.status in ('delivered','cancelled') then
      raise exception 'Order is no longer editable'
        using errcode = '22023', detail = 'wrong_status';
    end if;
  else
    raise exception 'unsupported add_order_lines source'
      using errcode = '22023', detail = 'unsupported_source';
  end if;

  -- 0257 — service add-ons may ride WITHOUT lines (addons-only add); the cap
  -- stays 30 for exploded builds + RM0 gift appends.
  if p_addons_append is not null then
    if jsonb_typeof(p_addons_append) is distinct from 'array'
       or jsonb_array_length(p_addons_append) > 10 then
      raise exception 'p_addons_append must be an array of at most 10 add-ons'
        using errcode = '22023', detail = 'invalid_addons_append';
    end if;
    v_append_n := jsonb_array_length(p_addons_append);
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array'
     or jsonb_array_length(p_lines) > 30
     or (jsonb_array_length(p_lines) = 0 and v_append_n = 0) then
    raise exception 'p_lines must be an array of 0..30 lines (with add-ons) or 1..30'
      using errcode = '22023', detail = 'invalid_lines';
  end if;

  -- Per-line shape + sku existence (the Hono route already priced + validated;
  -- this is the cheap defensive re-check — add-lines never accepts a free-text
  -- sku, unlike the ops raw-create path).
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_sku   := v_line->>'sku';
    v_qty   := (v_line->>'qty')::int;
    v_price := (v_line->>'unit_price')::numeric;
    if coalesce(v_sku, '') = '' or v_qty is null or v_qty < 1 or v_qty > 99
       or v_price is null or v_price < 0 then
      raise exception 'invalid line shape'
        using errcode = '22023', detail = 'invalid_lines';
    end if;
    if not exists (select 1 from product_skus s where s.sku = v_sku) then
      raise exception 'unknown sku %', v_sku
        using errcode = '22023', detail = 'unknown_sku';
    end if;
  end loop;

  -- 0257 — service add-on shape gate: key must exist ACTIVE in the `addons`
  -- config and never be a server-exclusive DELIVERY* key (those only move
  -- through p_addons_replace). Price was set by Hono from the same config.
  if p_addons_append is not null then
    for v_addon in select * from jsonb_array_elements(p_addons_append) loop
      v_addon_key := v_addon->>'addon_key';
      v_qty   := (v_addon->>'qty')::int;
      v_price := (v_addon->>'unit_price')::numeric;
      if coalesce(v_addon_key, '') = ''
         or v_addon_key in ('DELIVERY','DELIVERY_CROSS','DELIVERY_ADD')
         or v_qty is null or v_qty < 1 or v_qty > 99
         or v_price is null or v_price < 0 then
        raise exception 'invalid add-on shape'
          using errcode = '22023', detail = 'invalid_addons_append';
      end if;
      if not exists (select 1 from addons a where a.key = v_addon_key and a.active) then
        raise exception 'unknown or inactive add-on %', v_addon_key
          using errcode = '22023', detail = 'unknown_addon';
      end if;
    end loop;
  end if;

  -- 0232: delivery addon replace-set — shape gate BEFORE any write.
  if p_addons_replace is not null then
    if jsonb_typeof(p_addons_replace) is distinct from 'array'
       or jsonb_array_length(p_addons_replace) > 10 then
      raise exception 'p_addons_replace must be an array of at most 10 addons'
        using errcode = '22023', detail = 'invalid_addons';
    end if;
    for v_addon in select * from jsonb_array_elements(p_addons_replace) loop
      if coalesce(v_addon->>'addon_key', '') not in ('DELIVERY','DELIVERY_CROSS','DELIVERY_ADD')
         or (v_addon->>'qty')::int is null or (v_addon->>'qty')::int < 1
         or (v_addon->>'unit_price')::numeric is null
         or (v_addon->>'unit_price')::numeric < 0 then
        raise exception 'invalid delivery addon shape'
          using errcode = '22023', detail = 'invalid_addons';
      end if;
    end loop;
  end if;

  -- 0089 category mutex over the MERGED cart (existing rows ∪ new lines) —
  -- same rule create_order enforces at birth.
  select
    exists (
      select 1 from (
        select ol.sku from order_lines ol where ol.order_id = p_order_id
        union all
        select l->>'sku' from jsonb_array_elements(p_lines) l
      ) merged
      join product_skus s on s.sku = merged.sku
      join product_models pm on pm.id = s.model_id
      where pm.category = 'sofa'
    ),
    exists (
      select 1 from (
        select ol.sku from order_lines ol where ol.order_id = p_order_id
        union all
        select l->>'sku' from jsonb_array_elements(p_lines) l
      ) merged
      join product_skus s on s.sku = merged.sku
      join product_models pm on pm.id = s.model_id
      where pm.category in ('mattress','bedframe')
    )
  into v_has_sofa, v_has_other;

  if v_has_sofa and v_has_other then
    raise exception 'sofa cannot mix with mattress or bedframe in the same order'
      using errcode = '22023', detail = 'mixed_category_lines';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    insert into order_lines (order_id, sku, qty, attrs, unit_price)
    values (
      p_order_id,
      v_line->>'sku',
      (v_line->>'qty')::int,
      v_line->'attrs',
      (v_line->>'unit_price')::numeric
    );
    v_count := v_count + 1;
    v_delta := v_delta + ((v_line->>'unit_price')::numeric * (v_line->>'qty')::int);
  end loop;

  -- 0232: atomic DELIVERY* replace — the Hono delivery recompute over the
  -- merged cart is authoritative for these three server-minted keys.
  if p_addons_replace is not null then
    delete from order_addons
     where order_id = p_order_id
       and addon_key in ('DELIVERY','DELIVERY_CROSS','DELIVERY_ADD');
    for v_addon in select * from jsonb_array_elements(p_addons_replace) loop
      insert into order_addons (order_id, addon_key, qty, unit_price, attrs)
      values (
        p_order_id,
        v_addon->>'addon_key',
        coalesce((v_addon->>'qty')::int, 1),
        (v_addon->>'unit_price')::numeric,
        v_addon->'attrs'
      );
    end loop;
  end if;

  -- 0257 — append the service add-ons (new rows; existing rows untouched —
  -- a second "Dispose old mattress" at a later config price is two rows,
  -- each an honest snapshot).
  if p_addons_append is not null then
    for v_addon in select * from jsonb_array_elements(p_addons_append) loop
      insert into order_addons (order_id, addon_key, qty, unit_price, attrs)
      values (
        p_order_id,
        v_addon->>'addon_key',
        (v_addon->>'qty')::int,
        (v_addon->>'unit_price')::numeric,
        v_addon->'attrs'
      );
      v_addon_count := v_addon_count + 1;
      v_delta := v_delta + ((v_addon->>'unit_price')::numeric * (v_addon->>'qty')::int);
    end loop;
  end if;

  -- 0233 — approve = apply + stamp, one transaction.
  if p_source = 'change_request' then
    update order_change_requests
       set status = 'approved',
           decided_by = auth.uid(),
           decided_at = now(),
           applied_at = now()
     where id = p_change_request_id;
  end if;

  -- 0135 — a portal edit on an AutoCount order wins over re-import (the
  -- change-request path reaches AutoCount orders; direct adds can't).
  update orders
     set items_edited = case when source_system = 'autocount' then true else items_edited end,
         updated_at = now()
   where id = p_order_id;

  v_desc := concat_ws(' + ',
    case when v_count > 0 then format('%s line(s)', v_count) end,
    case when v_addon_count > 0 then format('%s add-on(s)', v_addon_count) end);

  insert into order_history (order_id, text, by_role, metadata)
  values (
    p_order_id,
    format('Products added · %s · RM %s%s', v_desc, v_delta::text,
           case when p_source = 'change_request' then ' · approved product change' else '' end),
    v_role,
    jsonb_build_object(
      'kind', 'add_lines',
      'source', p_source,
      'change_request_id', p_change_request_id,
      'lines', p_lines,
      'addons_replace', p_addons_replace,
      'addons_append', p_addons_append,
      'total_delta', v_delta
    )
  );

  insert into audit_log (role, action, dealer_id, ref)
  values (v_role, 'order.lines_added', v_order.dealer_id, 'SO-' || v_order.so::text);

  return jsonb_build_object('id', p_order_id, 'added', v_count,
                            'addons_added', v_addon_count, 'total_delta', v_delta);
end;
$function$
$s0500a$;
    insert into _g0500 values ('_add_order_lines_0391_locked_impl(uuid, jsonb, text, uuid, jsonb, jsonb)', 'rewritten');
  elsif h in ('b74f971984b7077e2a2b7a1d53872182') then insert into _g0500 values ('_add_order_lines_0391_locked_impl(uuid, jsonb, text, uuid, jsonb, jsonb)', 'already');
  else insert into _g0500 values ('_add_order_lines_0391_locked_impl(uuid, jsonb, text, uuid, jsonb, jsonb)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', '_add_order_lines_0391_locked_impl(uuid, jsonb, text, uuid, jsonb, jsonb)';
  end if;
end
$g0500$;

-- _import_autocount_order(jsonb)
--   source: repo 0214_autocount_import_create_only.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public._import_autocount_order(jsonb)'); h text;
begin
  if p is null then insert into _g0500 values ('_import_autocount_order(jsonb)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'b58bca1abf24119e16f6a8d2f85a38fb' then
    execute $s0500a$
create or replace function public._import_autocount_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role         app_role;
  v_dealer_id    uuid;
  v_src_system   text;
  v_src_ref      text[];
  v_existing     record;
  v_order_id     uuid;
  v_so           int;
  v_line         jsonb;
  v_result       text;
begin
  v_role := public.app_role();
  if (v_role is null or v_role not in ('operation','principal')) then
    raise exception 'forbidden: import is operation/principal only'
      using errcode = '42501';
  end if;

  v_dealer_id  := nullif(payload->>'dealer_id','')::uuid;
  v_src_system := coalesce(nullif(payload->>'source_system',''), 'autocount');
  select array_agg(value::text)
    into v_src_ref
    from jsonb_array_elements_text(coalesce(payload->'source_ref','[]'::jsonb));

  if v_dealer_id is null then
    raise exception 'dealer_id is required' using errcode = '22023';
  end if;
  if v_src_ref is null or array_length(v_src_ref,1) is null then
    raise exception 'source_ref must be a non-empty array' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(payload->'lines','[]'::jsonb)) = 0 then
    raise exception 'order must have at least one line' using errcode = '22023';
  end if;

  -- Idempotent lookup on the natural key.
  select id, so, status
    into v_existing
    from orders
   where source_system = v_src_system
     and source_ref    = v_src_ref;

  -- CREATE-ONLY (0214): if the order already exists in the portal, the portal
  -- owns it — skip entirely, regardless of status. AutoCount never updates.
  if found then
    return jsonb_build_object(
      'id', v_existing.id, 'so', v_existing.so,
      'source_ref', to_jsonb(v_src_ref), 'result', 'skipped_locked');
  end if;

  -- Order not found → create it.
  insert into orders (
    dealer_id, channel,
    customer_name, customer_phone, customer_address, customer_address_unknown,
    delivery_date, delivery_date_tbd,
    paid, terms_accepted,
    source_system, source_ref
  ) values (
    v_dealer_id,
    coalesce(nullif(payload->>'channel',''), 'dealer'),
    payload->>'customer_name',
    nullif(payload->>'customer_phone',''),
    nullif(payload->>'customer_address',''),
    coalesce((payload->>'customer_address_unknown')::boolean, false),
    nullif(payload->>'delivery_date','')::date,
    coalesce((payload->>'delivery_date_tbd')::boolean, false),
    coalesce((payload->>'paid')::numeric, 0),
    false,
    v_src_system,
    v_src_ref
  )
  returning id, so into v_order_id, v_so;
  v_result := 'created';

  -- Insert lines.
  for v_line in select * from jsonb_array_elements(payload->'lines') loop
    insert into order_lines (order_id, sku, qty, attrs, unit_price, source_po)
    values (
      v_order_id,
      v_line->>'sku',
      coalesce((v_line->>'qty')::int, 1),
      v_line->'attrs',
      coalesce((v_line->>'unit_price')::numeric, 0),
      nullif(v_line->>'source_po','')
    );
  end loop;

  insert into order_history (order_id, text, by_role)
  values (
    v_order_id,
    format('AutoCount import (%s) · %s', v_result, array_to_string(v_src_ref,' + ')),
    v_role
  );

  insert into audit_log (role, action, dealer_id, ref)
  values (v_role, 'order.imported', v_dealer_id, array_to_string(v_src_ref, ' + '));

  -- 0139 (jess): activity-log wiring — preserved.
  insert into ops_activity_log (order_id, action, actor_id, detail)
  values (v_order_id, 'autocount_import', auth.uid(),
    jsonb_build_object(
      'result',     v_result,
      'source_ref', to_jsonb(v_src_ref)
    ));

  return jsonb_build_object(
    'id', v_order_id,
    'so', v_so,
    'source_ref', to_jsonb(v_src_ref),
    'result', v_result
  );
end;
$$
$s0500a$;
    insert into _g0500 values ('_import_autocount_order(jsonb)', 'rewritten');
  elsif h in ('f391fc5a99044db06ecab073d8b8530b') then insert into _g0500 values ('_import_autocount_order(jsonb)', 'already');
  else insert into _g0500 values ('_import_autocount_order(jsonb)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', '_import_autocount_order(jsonb)';
  end if;
end
$g0500$;

-- _set_order_address_0391_locked_impl(uuid, text, text, boolean, jsonb)
--   source: repo 0230_orders_structured_address.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public._set_order_address_0391_locked_impl(uuid, text, text, boolean, jsonb)'); h text;
begin
  if p is null then insert into _g0500 values ('_set_order_address_0391_locked_impl(uuid, text, text, boolean, jsonb)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '4ca765124f05883a2375649acc5d5fd6' then
    execute $s0500a$
create or replace function public._set_order_address_0391_locked_impl(
  p_order_id uuid,
  p_address text,
  p_billing text,
  p_billing_same boolean,
  p_parts jsonb DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order            orders;
  v_role             app_role;
  v_caller_dealer_id uuid;
begin
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = '42P01';
  end if;

  if (v_role is null or v_role not in ('principal','operation','finance','bd'))
     and v_order.dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer address update' using errcode = '42501';
  end if;

  if v_order.status <> 'place' then
    raise exception 'Address can only be set on Place orders'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  if p_address is null or trim(p_address) = '' then
    raise exception 'Address is required'
      using errcode = '22023', detail = 'invalid_address';
  end if;

  -- 0230: parts must be an object when present (lenient absent = flat write).
  if p_parts is not null and jsonb_typeof(p_parts) <> 'object' then
    raise exception 'p_parts must be a json object'
      using errcode = '22023', detail = 'invalid_address_parts';
  end if;

  update orders
     set customer_address = trim(p_address),
         customer_address_unknown = false,
         -- 0230: structured parts stored when sent, CLEARED on a flat-only
         -- write (same stale-guard as update_order — parts never outlive the
         -- string they were composed into).
         customer_address_line1    = case when p_parts is not null then nullif(trim(coalesce(p_parts->>'line1', '')), '') else null end,
         customer_address_line2    = case when p_parts is not null then nullif(trim(coalesce(p_parts->>'line2', '')), '') else null end,
         customer_address_state    = case when p_parts is not null then nullif(trim(coalesce(p_parts->>'state', '')), '') else null end,
         customer_address_city     = case when p_parts is not null then nullif(trim(coalesce(p_parts->>'city', '')), '') else null end,
         customer_address_postcode = case when p_parts is not null then nullif(trim(coalesce(p_parts->>'postcode', '')), '') else null end,
         customer_billing = case when coalesce(p_billing_same, true) then null else nullif(trim(p_billing), '') end,
         customer_billing_same = coalesce(p_billing_same, true),
         updated_at = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role)
  values (p_order_id, 'Delivery address provided', v_role);

  return jsonb_build_object('id', p_order_id);
end;
$function$
$s0500a$;
    insert into _g0500 values ('_set_order_address_0391_locked_impl(uuid, text, text, boolean, jsonb)', 'rewritten');
  elsif h in ('52c6a6f19929844f8693b95928b766a3') then insert into _g0500 values ('_set_order_address_0391_locked_impl(uuid, text, text, boolean, jsonb)', 'already');
  else insert into _g0500 values ('_set_order_address_0391_locked_impl(uuid, text, text, boolean, jsonb)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', '_set_order_address_0391_locked_impl(uuid, text, text, boolean, jsonb)';
  end if;
end
$g0500$;

-- _set_order_date_0391_locked_impl(uuid, date, date)
--   source: repo 0165_add_proceed_date.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public._set_order_date_0391_locked_impl(uuid, date, date)'); h text;
begin
  if p is null then insert into _g0500 values ('_set_order_date_0391_locked_impl(uuid, date, date)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'b4cea55bad34461397a1c01bb561b6c8' then
    execute $s0500a$
create or replace function public._set_order_date_0391_locked_impl(p_order_id uuid, p_date date, p_proceed_date date)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_order            orders;
  v_role             app_role;
  v_caller_dealer_id uuid;
begin
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = '42P01';
  end if;

  if (v_role is null or v_role not in ('principal','operation','finance','bd'))
     and v_order.dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer date update' using errcode = '42501';
  end if;

  if v_order.status <> 'place' then
    raise exception 'Delivery date can only be set on Place orders'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  if p_date is null then
    raise exception 'Date is required' using errcode = '22023', detail = 'invalid_date';
  end if;

  -- Phase 11.1 — proceed date pairs with delivery date and must be <= it.
  if p_proceed_date is null then
    raise exception 'Proceed date is required' using errcode = '22023', detail = 'invalid_proceed_date';
  end if;
  if p_proceed_date > p_date then
    raise exception 'proceed date must be on or before delivery date'
      using errcode = '22023', detail = 'proceed_after_delivery';
  end if;

  update orders
     set delivery_date = p_date,
         proceed_date = p_proceed_date,
         delivery_date_tbd = false,
         updated_at = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role)
  values (p_order_id, format('Delivery date confirmed: %s · proceed %s',
            to_char(p_date, 'YYYY-MM-DD'), to_char(p_proceed_date, 'YYYY-MM-DD')), v_role);

  return jsonb_build_object('id', p_order_id, 'date', p_date, 'proceedDate', p_proceed_date);
end;
$function$
$s0500a$;
    insert into _g0500 values ('_set_order_date_0391_locked_impl(uuid, date, date)', 'rewritten');
  elsif h in ('a39b4757b5ced79b8914970cc6541ccf') then insert into _g0500 values ('_set_order_date_0391_locked_impl(uuid, date, date)', 'already');
  else insert into _g0500 values ('_set_order_date_0391_locked_impl(uuid, date, date)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', '_set_order_date_0391_locked_impl(uuid, date, date)';
  end if;
end
$g0500$;

-- _unproceed_order_0391_locked_impl(uuid)
--   source: repo 0222_pos_proceed_lane_edits.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public._unproceed_order_0391_locked_impl(uuid)'); h text;
begin
  if p is null then insert into _g0500 values ('_unproceed_order_0391_locked_impl(uuid)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '494e83ae14cd7a817556bcc073b0db37' then
    execute $s0500a$
create or replace function public._unproceed_order_0391_locked_impl(p_order_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_order    orders;
  v_role     app_role;
  v_caller_dealer_id uuid;
  v_today_my date;
begin
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();

  -- NULL role (anon key / orphaned JWT) — reject before the NULL-boolean
  -- cross-dealer guard below can silently pass it.
  if v_role is null then
    raise exception 'forbidden: no app role'
      using errcode = '42501', detail = 'forbidden';
  end if;

  -- for update: hold the row so ops can't confirm-proceed (create supplier
  -- threads / advance the stage) between this guard read and the flip below.
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  if (v_role is null or v_role not in ('principal','operation','finance','bd'))
     and v_order.dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer unproceed'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if v_order.status <> 'proceed_order' then
    raise exception 'Order is not in Proceed status'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  -- proceed_order stamps operation_stage='confirmed'; any later stage means
  -- HQ operation has started working the order — no longer reversible.
  if v_order.operation_stage is distinct from 'confirmed' then
    raise exception 'HQ operation has already started on this order'
      using errcode = '22023', detail = 'wrong_stage';
  end if;

  -- The proceed date (planned production start) has passed in MYT — locked.
  v_today_my := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  if v_order.proceed_date is not null and v_order.proceed_date < v_today_my then
    raise exception 'The proceed date has passed'
      using errcode = '22023', detail = 'proceed_date_passed';
  end if;

  -- operation_stage back to NULL (not 'confirmed') — fresh Place orders carry
  -- a NULL stage and the POS laneOf() keys on that to restore lane 01.
  update orders
     set status          = 'place',
         operation_stage = null,
         updated_at      = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role, metadata)
  values (
    p_order_id,
    'Order moved back to Order placed (un-proceed)',
    v_role,
    jsonb_build_object('kind', 'unproceed')
  );

  insert into audit_log (role, action, dealer_id, ref)
  values (v_role, 'order.unproceeded', v_order.dealer_id, 'SO-' || v_order.so::text);

  return jsonb_build_object('id', v_order.id, 'so', v_order.so, 'status', 'place');
end;
$function$
$s0500a$;
    insert into _g0500 values ('_unproceed_order_0391_locked_impl(uuid)', 'rewritten');
  elsif h in ('1c69a46d3b153abb3d7fca549d6360f2') then insert into _g0500 values ('_unproceed_order_0391_locked_impl(uuid)', 'already');
  else insert into _g0500 values ('_unproceed_order_0391_locked_impl(uuid)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', '_unproceed_order_0391_locked_impl(uuid)';
  end if;
end
$g0500$;

-- _update_order_0391_locked_impl(uuid, jsonb)
--   source: repo 0230_orders_structured_address.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public._update_order_0391_locked_impl(uuid, jsonb)'); h text;
begin
  if p is null then insert into _g0500 values ('_update_order_0391_locked_impl(uuid, jsonb)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'f3b891f392ab714003bef713d00d946c' then
    execute $s0500a$
CREATE OR REPLACE FUNCTION public._update_order_0391_locked_impl(p_order_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order            orders;
  v_role             app_role;
  v_caller_dealer_id uuid;
  v_changed          text[] := '{}';
  v_new_delivery     date;
  v_new_proceed      date;
  v_has_parts        boolean; -- 0230 --
begin
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();

  -- 0222: NULL role (anon key / orphaned JWT) must not slip past the
  -- cross-dealer guard's NULL-boolean semantics — reject outright.
  if v_role is null then
    raise exception 'forbidden: no app role' using errcode = '42501';
  end if;

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = '42P01';
  end if;

  if (v_role is null or v_role not in ('principal','operation','finance','bd'))
     and v_order.dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer edit' using errcode = '42501';
  end if;

  -- 0222: field-scoped status gate replaces the wholesale `<> 'place'` reject.
  -- Place orders stay fully editable; Proceed orders accept CUSTOMER fields
  -- only (the POS proceed lane keeps customer details/payment editable while
  -- products + dates lock); delivered/cancelled stay uneditable.
  if v_order.status not in ('place','proceed_order') then
    raise exception 'Order is no longer editable'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Payload must be a JSON object'
      using errcode = '22023', detail = 'invalid_payload';
  end if;

  -- 0222: in the Proceed lane the delivery/date fields are locked — the
  -- caller must un-proceed first ("move back to edit"). Whole edit rejects
  -- (not silently filtered) so the client never half-applies a patch.
  if v_order.status = 'proceed_order'
     and (p_payload ? 'delivery_date'
          or p_payload ? 'proceed_date'
          or p_payload ? 'delivery_date_tbd'
          or p_payload ? 'delivery_floor'
          or p_payload ? 'delivery_has_lift'
          -- not an accepted key today, but the Hono route forwards it; keep it
          -- locked so a future schema addition can't slip past this gate
          or p_payload ? 'delivery_stair_items') then
    raise exception 'Delivery fields are locked after Proceed'
      using errcode = '22023', detail = 'proceed_locked_fields';
  end if;

  -- 0230: structured parts ride WITH the composed string, never alone — the
  -- composed `customer_address` is what every downstream consumer reads, so a
  -- parts-only write would silently desync the two representations.
  v_has_parts := p_payload ? 'customer_address_line1'
              or p_payload ? 'customer_address_line2'
              or p_payload ? 'customer_address_state'
              or p_payload ? 'customer_address_city'
              or p_payload ? 'customer_address_postcode';
  if v_has_parts and not p_payload ? 'customer_address' then
    raise exception 'structured address parts require the composed customer_address in the same payload'
      using errcode = '22023', detail = 'address_parts_without_composed';
  end if;

  if p_payload ? 'customer_name' then
    if coalesce(trim(p_payload->>'customer_name'), '') = '' then
      raise exception 'Customer name cannot be empty'
        using errcode = '22023', detail = 'invalid_customer_name';
    end if;
    v_changed := array_append(v_changed, 'customer_name');
  end if;
  if p_payload ? 'customer_phone'           then v_changed := array_append(v_changed, 'customer_phone'); end if;
  -- 0222: customer_email accepted (0200 column), nullable trim like phone.
  if p_payload ? 'customer_email'           then v_changed := array_append(v_changed, 'customer_email'); end if;
  if p_payload ? 'customer_address'         then v_changed := array_append(v_changed, 'customer_address'); end if;
  if p_payload ? 'customer_address_unknown' then v_changed := array_append(v_changed, 'customer_address_unknown'); end if;
  -- 0230: structured address parts (customer-class, proceed-lane editable).
  if p_payload ? 'customer_address_line1'    then v_changed := array_append(v_changed, 'customer_address_line1'); end if;
  if p_payload ? 'customer_address_line2'    then v_changed := array_append(v_changed, 'customer_address_line2'); end if;
  if p_payload ? 'customer_address_state'    then v_changed := array_append(v_changed, 'customer_address_state'); end if;
  if p_payload ? 'customer_address_city'     then v_changed := array_append(v_changed, 'customer_address_city'); end if;
  if p_payload ? 'customer_address_postcode' then v_changed := array_append(v_changed, 'customer_address_postcode'); end if;
  if p_payload ? 'customer_billing'         then v_changed := array_append(v_changed, 'customer_billing'); end if;
  if p_payload ? 'customer_billing_same'    then v_changed := array_append(v_changed, 'customer_billing_same'); end if;
  if p_payload ? 'customer_emergency'       then v_changed := array_append(v_changed, 'customer_emergency'); end if;
  if p_payload ? 'delivery_date'            then v_changed := array_append(v_changed, 'delivery_date'); end if;
  if p_payload ? 'proceed_date'             then v_changed := array_append(v_changed, 'proceed_date'); end if;
  if p_payload ? 'delivery_date_tbd'        then v_changed := array_append(v_changed, 'delivery_date_tbd'); end if;
  if p_payload ? 'delivery_floor'           then v_changed := array_append(v_changed, 'delivery_floor'); end if;
  if p_payload ? 'delivery_has_lift'        then v_changed := array_append(v_changed, 'delivery_has_lift'); end if;

  if cardinality(v_changed) = 0 then
    raise exception 'No editable fields in payload'
      using errcode = '22023', detail = 'no_changes';
  end if;

  update orders set
    customer_name            = case when p_payload ? 'customer_name'
                                    then trim(p_payload->>'customer_name') else customer_name end,
    customer_phone           = case when p_payload ? 'customer_phone'
                                    then nullif(trim(p_payload->>'customer_phone'), '') else customer_phone end,
    -- 0222: email mirrors the phone treatment (trim, empty → null).
    customer_email           = case when p_payload ? 'customer_email'
                                    then nullif(trim(p_payload->>'customer_email'), '') else customer_email end,
    customer_address         = case when p_payload ? 'customer_address'
                                    then nullif(trim(p_payload->>'customer_address'), '') else customer_address end,
    customer_address_unknown = case when p_payload ? 'customer_address_unknown'
                                    then (p_payload->>'customer_address_unknown')::boolean else customer_address_unknown end,
    -- 0230: each structured column takes its sent value; a flat-only
    -- customer_address write (no parts in the payload) CLEARS it instead
    -- (stale-guard — the string is no longer known to match the parts).
    customer_address_line1    = case when p_payload ? 'customer_address_line1'
                                     then nullif(trim(p_payload->>'customer_address_line1'), '')
                                     when p_payload ? 'customer_address' then null
                                     else customer_address_line1 end,
    customer_address_line2    = case when p_payload ? 'customer_address_line2'
                                     then nullif(trim(p_payload->>'customer_address_line2'), '')
                                     when p_payload ? 'customer_address' then null
                                     else customer_address_line2 end,
    customer_address_state    = case when p_payload ? 'customer_address_state'
                                     then nullif(trim(p_payload->>'customer_address_state'), '')
                                     when p_payload ? 'customer_address' then null
                                     else customer_address_state end,
    customer_address_city     = case when p_payload ? 'customer_address_city'
                                     then nullif(trim(p_payload->>'customer_address_city'), '')
                                     when p_payload ? 'customer_address' then null
                                     else customer_address_city end,
    customer_address_postcode = case when p_payload ? 'customer_address_postcode'
                                     then nullif(trim(p_payload->>'customer_address_postcode'), '')
                                     when p_payload ? 'customer_address' then null
                                     else customer_address_postcode end,
    customer_billing         = case when p_payload ? 'customer_billing'
                                    then nullif(trim(p_payload->>'customer_billing'), '') else customer_billing end,
    customer_billing_same    = case when p_payload ? 'customer_billing_same'
                                    then (p_payload->>'customer_billing_same')::boolean else customer_billing_same end,
    customer_emergency       = case when p_payload ? 'customer_emergency'
                                    then nullif(trim(p_payload->>'customer_emergency'), '') else customer_emergency end,
    delivery_date            = case when p_payload ? 'delivery_date'
                                    then nullif(p_payload->>'delivery_date', '')::date else delivery_date end,
    proceed_date             = case when p_payload ? 'proceed_date'
                                    then nullif(p_payload->>'proceed_date', '')::date else proceed_date end,
    delivery_date_tbd        = case when p_payload ? 'delivery_date_tbd'
                                    then (p_payload->>'delivery_date_tbd')::boolean else delivery_date_tbd end,
    delivery_floor           = case when p_payload ? 'delivery_floor'
                                    then greatest(1, (p_payload->>'delivery_floor')::int) else delivery_floor end,
    delivery_has_lift        = case when p_payload ? 'delivery_has_lift'
                                    then (p_payload->>'delivery_has_lift')::boolean else delivery_has_lift end,
    updated_at               = now()
  where id = p_order_id
  returning delivery_date, proceed_date into v_new_delivery, v_new_proceed;

  -- Phase 11.1 — after applying the partial edit, the resulting pair must stay
  -- ordered (proceed <= delivery). Raising here rolls the whole edit back.
  if v_new_delivery is not null and v_new_proceed is not null
     and v_new_proceed > v_new_delivery then
    raise exception 'proceed date must be on or before delivery date'
      using errcode = '22023', detail = 'proceed_after_delivery';
  end if;

  insert into order_history (order_id, text, by_role, metadata)
  values (
    p_order_id,
    format('Order details updated · %s field(s)', cardinality(v_changed)),
    v_role,
    jsonb_build_object('kind', 'edit', 'changed', to_jsonb(v_changed), 'payload', p_payload)
  );

  insert into audit_log (role, action, dealer_id, ref)
  values (v_role, 'order.edited', v_order.dealer_id, 'SO-' || v_order.so::text);

  return jsonb_build_object('id', p_order_id, 'changed', v_changed);
end;
$function$
$s0500a$;
    insert into _g0500 values ('_update_order_0391_locked_impl(uuid, jsonb)', 'rewritten');
  elsif h in ('1765cd3e121540760923ae3359efeb05') then insert into _g0500 values ('_update_order_0391_locked_impl(uuid, jsonb)', 'already');
  else insert into _g0500 values ('_update_order_0391_locked_impl(uuid, jsonb)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', '_update_order_0391_locked_impl(uuid, jsonb)';
  end if;
end
$g0500$;

-- bd_convert_inquiry(uuid)
--   source: repo 0072_bd_convert_inquiry.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.bd_convert_inquiry(uuid)'); h text;
begin
  if p is null then insert into _g0500 values ('bd_convert_inquiry(uuid)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '1d55945c044fff700af2f757117d9b4e' then
    execute $s0500a$
CREATE OR REPLACE FUNCTION public.bd_convert_inquiry(p_inquiry_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_inq      inquiries;
  v_role     app_role;
  v_app_id   uuid;
  v_actor    text;
BEGIN
  v_role := public.app_role();
  IF (v_role is null or v_role NOT IN ('bd', 'principal')) THEN
    RAISE EXCEPTION 'forbidden: BD or principal only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  SELECT * INTO v_inq FROM inquiries WHERE id = p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inquiry not found' USING ERRCODE = '42P01', DETAIL = 'inquiry_not_found';
  END IF;

  -- State guard: must be qualified (the only stage from which we convert).
  IF v_inq.stage <> 'qualified' THEN
    RAISE EXCEPTION 'inquiry must be qualified (got %)', v_inq.stage
      USING ERRCODE = '22023', DETAIL = 'wrong_stage';
  END IF;

  v_actor := COALESCE((SELECT name FROM app_users WHERE id = (SELECT auth.uid())), INITCAP(v_role::text));

  -- Insert approvals row for principal review.
  INSERT INTO approvals (kind, title, actor, refers_to, dealer_id, payload, status)
  VALUES (
    'new_dealer',
    format('New dealer · %s', v_inq.company),
    v_actor,
    p_inquiry_id::text,
    NULL,  -- no dealer yet; principal creates on approval
    jsonb_build_object(
      'inquiry_id', p_inquiry_id,
      'company',    v_inq.company,
      'region',     v_inq.region,
      'contact',    v_inq.contact,
      'note',       v_inq.note
    ),
    'pending'
  )
  RETURNING id INTO v_app_id;

  -- Move inquiry to converted, link the approval row via linked_dealer_id
  -- (overloaded — actually the approval id; the principal flow assigns the
  -- real dealer_id when it creates the dealer).
  UPDATE inquiries
     SET stage      = 'converted',
         updated_at = now()
   WHERE id = p_inquiry_id;

  RETURN jsonb_build_object(
    'inquiry_id', p_inquiry_id,
    'stage',      'converted',
    'approval_id', v_app_id
  );
END;
$$
$s0500a$;
    insert into _g0500 values ('bd_convert_inquiry(uuid)', 'rewritten');
  elsif h in ('a899b6ae207a9e9b68993c733bd0ee63') then insert into _g0500 values ('bd_convert_inquiry(uuid)', 'already');
  else insert into _g0500 values ('bd_convert_inquiry(uuid)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'bd_convert_inquiry(uuid)';
  end if;
end
$g0500$;

-- cancel_order(uuid, text)
--   source: repo 0357_a_cancelled_order_voids_its_delivery_orders.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.cancel_order(uuid, text)'); h text;
begin
  if p is null then insert into _g0500 values ('cancel_order(uuid, text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'ce95ee6db7dae106353731c1a6990ad9' then
    execute $s0500a$
create or replace function public.cancel_order(
  p_order_id uuid,
  p_reason   text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order            orders;
  v_role             app_role;
  v_caller_dealer_id uuid;
  v_reason_clean     text;
  v_impact           jsonb;
begin
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = '42P01';
  end if;

  if (v_role is null or v_role not in ('principal','operation','finance','bd'))
     and v_order.dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer cancel' using errcode = '42501';
  end if;

  -- UNCHANGED, and deliberately so: a proceeded order fails SAFE here. The
  -- governed proceeded-cancel is Card 7's deferred approval lane.
  if v_order.status <> 'place' then
    raise exception 'Only an order still at Placed can be cancelled'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  -- NEW · a cancelled customer transaction says why it was cancelled.
  v_reason_clean := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason_clean is null then
    raise exception 'A cancellation says why'
      using errcode = '22023', detail = 'reason_required';
  end if;

  -- Taken BEFORE the write, so the row records what actually stood open at
  -- the moment of the decision rather than what is left after it. The
  -- UNGUARDED facts function, because this door is legitimately reached by a
  -- dealer cancelling their own order.
  v_impact := public.sales_order_cancel_impact_facts(p_order_id);

  update orders
     set status = 'cancelled',
         updated_at = now()
   where id = p_order_id;

  -- 0357 · THE CANCELLATION HALF OF THE VOID LAW (blueprint card §6): the
  -- transaction that cancels the order voids its un-delivered documents in the
  -- same breath — reason + actor + time on each record, delivered documents
  -- untouched (the trip happened; history is never rewritten) — and the
  -- active-number mirror empties.
  update ops_delivery_orders d
     set voided_at   = now(),
         void_reason = 'order_cancelled',
         voided_by   = auth.uid()
   where d.order_id = p_order_id
     and d.voided_at is null
     and not exists (
       select 1 from delivery_attempts a
        where a.do_number = d.do_number
          and a.result = 'delivered'
     );
  update orders set do_number = null
   where id = p_order_id and do_number is not null;

  insert into order_history (order_id, text, by_role, by_user_id, metadata)
  values (
    p_order_id,
    'Order cancelled · ' || v_reason_clean,
    v_role,
    auth.uid(),
    jsonb_build_object(
      'kind',   'cancel',
      'reason', v_reason_clean,
      'impact', v_impact
    )
  );

  insert into audit_log (role, action, dealer_id, ref)
  values (v_role, 'order.cancelled', v_order.dealer_id, 'SO-' || v_order.so::text);

  return jsonb_build_object('id', p_order_id, 'so', v_order.so, 'status', 'cancelled');
end;
$$
$s0500a$;
    insert into _g0500 values ('cancel_order(uuid, text)', 'rewritten');
  elsif h in ('c759a9f1c5cf9823dbb228b12a5bcbad') then insert into _g0500 values ('cancel_order(uuid, text)', 'already');
  else insert into _g0500 values ('cancel_order(uuid, text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'cancel_order(uuid, text)';
  end if;
end
$g0500$;

-- cancel_order_change_request(uuid)
--   source: repo 0233_order_change_requests_flow.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.cancel_order_change_request(uuid)'); h text;
begin
  if p is null then insert into _g0500 values ('cancel_order_change_request(uuid)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'e46aab94515bf624572b428084cfe332' then
    execute $s0500a$
create or replace function public.cancel_order_change_request(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_req              order_change_requests;
  v_order            orders;
  v_role             app_role;
  v_caller_dealer_id uuid;
begin
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();
  if v_role is null then
    raise exception 'forbidden: no app role' using errcode = '42501';
  end if;

  select * into v_req from order_change_requests where id = p_request_id for update;
  if not found then
    raise exception 'Change request not found' using errcode = '42P01';
  end if;
  select * into v_order from orders where id = v_req.order_id;
  if (v_role is null or v_role not in ('principal','operation','finance','bd'))
     and v_order.dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer cancel' using errcode = '42501';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'Only a pending change can be cancelled'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  update order_change_requests
     set status = 'cancelled', decided_at = now()
   where id = p_request_id;

  insert into order_history (order_id, text, by_role, metadata)
  values (v_req.order_id, 'Product change cancelled', v_role,
          jsonb_build_object('kind', 'change_request_cancelled', 'change_request_id', p_request_id));

  return jsonb_build_object('id', p_request_id, 'status', 'cancelled');
end;
$function$
$s0500a$;
    insert into _g0500 values ('cancel_order_change_request(uuid)', 'rewritten');
  elsif h in ('c917daff7340e4de769c253a719b596d') then insert into _g0500 values ('cancel_order_change_request(uuid)', 'already');
  else insert into _g0500 values ('cancel_order_change_request(uuid)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'cancel_order_change_request(uuid)';
  end if;
end
$g0500$;

-- correction_work_close(uuid, text)
--   source: repo 0332_a_consequence_becomes_work_that_outlives_the_tab.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.correction_work_close(uuid, text)'); h text;
begin
  if p is null then insert into _g0500 values ('correction_work_close(uuid, text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '4338a6d9cd8298821c2955e2fbd94a37' then
    execute $s0500a$
create or replace function public.correction_work_close(p_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.app_role();
  v_row  sales_order_correction_work%rowtype;
begin
  if (v_role is null or v_role not in ('operation','finance','principal')) then
    raise exception 'Internal roles only' using errcode = '42501';
  end if;
  select * into v_row from sales_order_correction_work where id = p_id for update;
  if not found then
    raise exception 'Correction work not found' using errcode = 'P0002';
  end if;
  if v_row.state = 'closed' then
    return jsonb_build_object('id', p_id, 'already_closed', true);
  end if;
  -- Someone else must look. The person whose change raised the work has
  -- already decided it was fine; letting them close it makes the row a
  -- formality instead of a handover.
  if v_row.raised_by is not null and v_row.raised_by = auth.uid() then
    raise exception 'This correction work is closed by the module that receives it, not the one that raised it'
      using errcode = '42501', detail = 'closed_by_raiser';
  end if;

  update sales_order_correction_work
     set state = 'closed', closed_by = auth.uid(), closed_at = now(),
         closed_note = nullif(trim(coalesce(p_note,'')), '')
   where id = p_id;

  insert into order_history(order_id, text, by_role, by_user_id, metadata)
  values (v_row.order_id,
          'Correction work closed · ' || v_row.module || ' — ' || v_row.consequence,
          v_role::app_role, auth.uid(),
          jsonb_build_object('kind','correction_work_closed','work_id',p_id,
                             'module',v_row.module));
  return jsonb_build_object('id', p_id, 'state', 'closed');
end $$
$s0500a$;
    insert into _g0500 values ('correction_work_close(uuid, text)', 'rewritten');
  elsif h in ('1e785da6cc7587c8976e1383c3e6202b') then insert into _g0500 values ('correction_work_close(uuid, text)', 'already');
  else insert into _g0500 values ('correction_work_close(uuid, text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'correction_work_close(uuid, text)';
  end if;
end
$g0500$;

-- create_order(jsonb)
--   source: repo 0230_orders_structured_address.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.create_order(jsonb)'); h text;
begin
  if p is null then insert into _g0500 values ('create_order(jsonb)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'e4be47a58a35d74d3c66112b36e8e597' then
    execute $s0500a$
CREATE OR REPLACE FUNCTION public.create_order(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dealer_id          uuid;
  v_role               app_role;
  v_caller_dealer_id   uuid;
  v_order_id           uuid;
  v_so                 int;
  v_placed_at          timestamptz;
  v_deposit_pct        int;
  v_line               jsonb;
  v_addon              jsonb;
  v_method             text;
  v_installment_months int;
  v_has_sofa           boolean;
  v_has_other          boolean;
  v_entry_data         jsonb; -- 0219 --
BEGIN
  v_dealer_id := (payload->>'dealer_id')::uuid;
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();

  IF (v_role is null or v_role NOT IN ('principal','operation','finance','bd'))
     AND v_dealer_id IS DISTINCT FROM v_caller_dealer_id THEN
    RAISE EXCEPTION 'forbidden: cross-dealer insert' USING ERRCODE = '42501';
  END IF;

  IF v_dealer_id IS NULL THEN
    RAISE EXCEPTION 'dealer_id is required' USING ERRCODE = '22023';
  END IF;

  v_method := nullif(payload->>'payment_method', '');
  -- 0219 -- config-driven methods: the 0007 whitelist RAISE is replaced by a
  -- sanity bound; Hono validates the method against order_entry_config.
  IF v_method IS NOT NULL AND length(v_method) > 40 THEN
    RAISE EXCEPTION 'payment_method too long' USING ERRCODE = '22023';
  END IF;

  v_installment_months := nullif(payload->>'installment_months', '')::int;
  IF v_installment_months IS NOT NULL AND v_installment_months NOT IN (6, 12) THEN
    RAISE EXCEPTION 'installment_months must be 6 or 12' USING ERRCODE = '22023';
  END IF;
  IF v_method = 'installment' AND v_installment_months IS NULL THEN
    RAISE EXCEPTION 'installment_months is required when payment_method = installment' USING ERRCODE = '22023';
  END IF;
  IF v_method <> 'installment' AND v_installment_months IS NOT NULL THEN
    RAISE EXCEPTION 'installment_months only valid when payment_method = installment' USING ERRCODE = '22023';
  END IF;

  -- 0219 -- POS entry extras: must be a (bounded) jsonb object when present.
  v_entry_data := payload->'entry_data';
  IF v_entry_data IS NOT NULL AND jsonb_typeof(v_entry_data) <> 'object' THEN
    RAISE EXCEPTION 'entry_data must be a json object' USING ERRCODE = '22023';
  END IF;
  IF v_entry_data IS NOT NULL AND pg_column_size(v_entry_data) > 16384 THEN
    RAISE EXCEPTION 'entry_data too large' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(coalesce(payload->'lines', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'order must have at least one line' USING ERRCODE = '22023';
  END IF;

  -- Phase 11.1 — proceed date must be on/before delivery date (when both set).
  IF nullif(payload->>'delivery_date','') IS NOT NULL
     AND nullif(payload->>'proceed_date','') IS NOT NULL
     AND (payload->>'proceed_date')::date > (payload->>'delivery_date')::date THEN
    RAISE EXCEPTION 'proceed date must be on or before delivery date'
      USING ERRCODE = '22023', DETAIL = 'proceed_after_delivery';
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM jsonb_array_elements(payload->'lines') AS line
      JOIN product_skus s  ON s.sku = line->>'sku'
      JOIN product_models pm ON pm.id = s.model_id
     WHERE pm.category = 'sofa'
  ) INTO v_has_sofa;

  SELECT EXISTS (
    SELECT 1
      FROM jsonb_array_elements(payload->'lines') AS line
      JOIN product_skus s  ON s.sku = line->>'sku'
      JOIN product_models pm ON pm.id = s.model_id
     WHERE pm.category IN ('mattress','bedframe')
  ) INTO v_has_other;

  IF v_has_sofa AND v_has_other THEN
    RAISE EXCEPTION 'sofa cannot mix with mattress or bedframe in the same order'
      USING ERRCODE = '22023', DETAIL = 'mixed_category_lines';
  END IF;

  INSERT INTO orders (
    dealer_id, outlet_id, salesperson_id,
    customer_name, customer_phone, customer_address, customer_address_unknown,
    customer_address_line1, customer_address_line2, -- 0230 --
    customer_address_state, customer_address_city, customer_address_postcode, -- 0230 --
    customer_billing, customer_billing_same, customer_emergency,
    customer_email, customer_race, customer_gender, customer_birthday,
    delivery_date, proceed_date, delivery_date_tbd, delivery_floor, delivery_has_lift,
    paid, signature_url, payment_slip_url, terms_accepted,
    payment_method, approval_code, installment_months,
    entry_data -- 0219 --
  ) VALUES (
    v_dealer_id,
    nullif(payload->>'outlet_id', '')::uuid,
    nullif(payload->>'salesperson_id', '')::uuid,
    payload->>'customer_name',
    nullif(payload->>'customer_phone', ''),
    nullif(payload->>'customer_address', ''),
    coalesce((payload->>'customer_address_unknown')::boolean, false),
    nullif(payload->>'customer_address_line1', ''),    -- 0230 --
    nullif(payload->>'customer_address_line2', ''),    -- 0230 --
    nullif(payload->>'customer_address_state', ''),    -- 0230 --
    nullif(payload->>'customer_address_city', ''),     -- 0230 --
    nullif(payload->>'customer_address_postcode', ''), -- 0230 --
    nullif(payload->>'customer_billing', ''),
    coalesce((payload->>'customer_billing_same')::boolean, true),
    nullif(payload->>'customer_emergency', ''),
    nullif(payload->>'customer_email', ''),
    nullif(payload->>'customer_race', ''),
    nullif(payload->>'customer_gender', ''),
    nullif(payload->>'customer_birthday', '')::date,
    nullif(payload->>'delivery_date', '')::date,
    nullif(payload->>'proceed_date', '')::date,
    coalesce((payload->>'delivery_date_tbd')::boolean, false),
    coalesce((payload->>'delivery_floor')::int, 1),
    coalesce((payload->>'delivery_has_lift')::boolean, false),
    coalesce((payload->>'paid')::numeric, 0),
    payload->>'signature_url',
    nullif(payload->>'payment_slip_url', ''),
    coalesce((payload->>'terms_accepted')::boolean, false),
    v_method,
    nullif(payload->>'approval_code', ''),
    v_installment_months,
    v_entry_data -- 0219 --
  )
  RETURNING id, so, placed_at INTO v_order_id, v_so, v_placed_at;

  FOR v_line IN SELECT * FROM jsonb_array_elements(payload->'lines') LOOP
    INSERT INTO order_lines (order_id, sku, qty, attrs, unit_price)
    VALUES (
      v_order_id,
      v_line->>'sku',
      (v_line->>'qty')::int,
      v_line->'attrs',
      (v_line->>'unit_price')::numeric
    );
  END LOOP;

  IF payload ? 'addons' THEN
    FOR v_addon IN SELECT * FROM jsonb_array_elements(payload->'addons') LOOP
      -- 0133 - attrs jsonb passed through (e.g. disposal size tag).
      INSERT INTO order_addons (order_id, addon_key, qty, unit_price, attrs)
      VALUES (
        v_order_id,
        v_addon->>'addon_key',
        coalesce((v_addon->>'qty')::int, 1),
        (v_addon->>'unit_price')::numeric,
        v_addon->'attrs'
      );
    END LOOP;
  END IF;

  v_deposit_pct := coalesce((payload->>'deposit_pct')::int, 0);
  INSERT INTO order_history (order_id, text, by_role)
  VALUES (
    v_order_id,
    CASE
      WHEN v_method IS NULL THEN format('Order created · %s%% deposit', v_deposit_pct)
      WHEN v_method = 'installment' THEN
        format('Order created · %s%% deposit · installment %s mo', v_deposit_pct, v_installment_months)
      ELSE format('Order created · %s%% deposit · %s', v_deposit_pct, v_method)
    END,
    v_role
  );

  INSERT INTO audit_log (role, action, dealer_id, ref)
  VALUES (v_role, 'order.created', v_dealer_id, 'SO-' || v_so::text);

  RETURN jsonb_build_object('id', v_order_id, 'so', v_so, 'placed_at', v_placed_at);
END;
$function$
$s0500a$;
    insert into _g0500 values ('create_order(jsonb)', 'rewritten');
  elsif h in ('f9a841d5f0728cddb445dc1991cf3736') then insert into _g0500 values ('create_order(jsonb)', 'already');
  else insert into _g0500 values ('create_order(jsonb)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'create_order(jsonb)';
  end if;
end
$g0500$;

-- delivery_payment_approver_gate()
--   source: repo 0362_money_in_full_before_delivery_or_the_owner_signs.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.delivery_payment_approver_gate()'); h text;
begin
  if p is null then insert into _g0500 values ('delivery_payment_approver_gate()', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '5c8731337789286ebdd05be4a351723e' then
    execute $s0500a$
create or replace function public.delivery_payment_approver_gate()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role   text := (select public.app_role());
  v_duties text[];
begin
  if v_role is null then
    raise exception 'forbidden' using errcode = '42501',
      detail = 'no active account';
  end if;

  if (v_role is null or v_role <> 'principal') then
    select coalesce(array_agg(pd.duty_key), '{}'::text[])
      into v_duties
      from app_users u
      join org_position_duties pd on pd.position_id = u.position_id
     where u.id = auth.uid()
       and u.role <> 'dealer'
       and u.status = 'active';

    if not ('delivery_payment_approver' = any(coalesce(v_duties, '{}'::text[]))) then
      raise exception 'forbidden: only the configured approver decides a delivery payment approval'
        using errcode = '42501', detail = 'not_the_approver';
    end if;
  end if;

  return v_role;
end;
$fn$
$s0500a$;
    insert into _g0500 values ('delivery_payment_approver_gate()', 'rewritten');
  elsif h in ('651e1fae05e0cc34db635d0f2820268e') then insert into _g0500 values ('delivery_payment_approver_gate()', 'already');
  else insert into _g0500 values ('delivery_payment_approver_gate()', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'delivery_payment_approver_gate()';
  end if;
end
$g0500$;

-- delivery_settings_gate()
--   source: repo 0488_delivery_settings_hold_the_partners_rules_and_templates.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.delivery_settings_gate()'); h text;
begin
  if p is null then insert into _g0500 values ('delivery_settings_gate()', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'b903f91d3902c4a7f8dece5861ba4674' then
    execute $s0500a$
create or replace function public.delivery_settings_gate()
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := (select public.app_role());
  v_duties text[];
begin
  if v_role is null then
    raise exception 'forbidden' using errcode = '42501', detail = 'no active account';
  end if;
  if (v_role is null or v_role <> 'principal') then
    select coalesce(array_agg(pd.duty_key), '{}'::text[])
      into v_duties
      from app_users u
      join org_position_duties pd on pd.position_id = u.position_id
     where u.id = auth.uid() and u.role <> 'dealer' and u.status = 'active';
    if not ('ops_manager' = any(coalesce(v_duties, '{}'::text[]))) then
      raise exception 'forbidden' using errcode = '42501',
        detail = 'delivery settings are set by the manager';
    end if;
  end if;
end;
$fn$
$s0500a$;
    insert into _g0500 values ('delivery_settings_gate()', 'rewritten');
  elsif h in ('180ce0d45b7bc18c2ad10587b2a963bd') then insert into _g0500 values ('delivery_settings_gate()', 'already');
  else insert into _g0500 values ('delivery_settings_gate()', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'delivery_settings_gate()';
  end if;
end
$g0500$;

-- edit_order_addon_unchecked_0258(uuid, uuid, integer, jsonb, text, uuid)
--   source: repo 0258_edit_order_addon.sql; 2 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.edit_order_addon_unchecked_0258(uuid, uuid, integer, jsonb, text, uuid)'); h text;
begin
  if p is null then insert into _g0500 values ('edit_order_addon_unchecked_0258(uuid, uuid, integer, jsonb, text, uuid)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'd26f575881b56a440bf985764afccb33' then
    execute $s0500a$
create or replace function public.edit_order_addon_unchecked_0258(
  p_order_id uuid,
  p_addon_id uuid,
  p_qty int,
  p_attrs jsonb DEFAULT NULL,
  p_source text DEFAULT 'direct',
  p_change_request_id uuid DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order            orders;
  v_req              order_change_requests;
  v_row              order_addons;
  v_role             app_role;
  v_caller_dealer_id uuid;
  v_size_opts        jsonb;
  v_sizes            jsonb;
  v_i                int;
  v_delta            numeric(14,2);
begin
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();
  if v_role is null then
    raise exception 'forbidden: no app role' using errcode = '42501';
  end if;

  -- Order lock — an addon edit must not race a concurrent add / proceed.
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = '42P01';
  end if;
  if (v_role is null or v_role not in ('principal','operation','finance','bd'))
     and v_order.dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer edit' using errcode = '42501';
  end if;

  if p_source = 'direct' then
    -- Place lane exactly (same gate as the other direct edit doors).
    if v_order.status <> 'place'
       or v_order.operation_stage is not null
       or v_order.source_system = 'autocount' then
      raise exception 'Add-ons can only be edited while the order is in Order placed'
        using errcode = '22023', detail = 'wrong_status';
    end if;
  elsif p_source = 'change_request' then
    if (v_role is null or v_role not in ('operation','principal')) then
      raise exception 'forbidden: only operation/principal approve change requests'
        using errcode = '42501';
    end if;
    if p_change_request_id is null then
      raise exception 'change_request source requires p_change_request_id'
        using errcode = '22023', detail = 'invalid_request';
    end if;
    select * into v_req from order_change_requests
     where id = p_change_request_id for update;
    if not found or v_req.order_id is distinct from p_order_id then
      raise exception 'Change request not found for this order'
        using errcode = '42P01';
    end if;
    if v_req.kind is distinct from 'edit_addon' then
      raise exception 'this change request is not an add-on edit'
        using errcode = '22023', detail = 'wrong_kind';
    end if;
    if v_req.status <> 'pending' or v_req.applied_at is not null then
      raise exception 'Change request is no longer pending'
        using errcode = '22023', detail = 'wrong_status';
    end if;
    if v_order.status in ('delivered','cancelled') then
      raise exception 'Order is no longer editable'
        using errcode = '22023', detail = 'wrong_status';
    end if;
  else
    raise exception 'unsupported edit_order_addon source'
      using errcode = '22023', detail = 'unsupported_source';
  end if;

  select * into v_row from order_addons
   where id = p_addon_id and order_id = p_order_id
   for update;
  if not found then
    raise exception 'add-on not found on this order'
      using errcode = '22023', detail = 'addon_not_found';
  end if;
  if v_row.addon_key in ('DELIVERY','DELIVERY_CROSS','DELIVERY_ADD') then
    raise exception 'delivery fees are computed by the system and cannot be edited'
      using errcode = '22023', detail = 'addon_not_editable';
  end if;

  if p_qty is null or p_qty < 1 or p_qty > 99 then
    raise exception 'qty must be 1..99'
      using errcode = '22023', detail = 'invalid_qty';
  end if;
  -- THE up-sell law: the unit price snapshot never changes on an edit, so
  -- total can only drop by dropping qty — blocked (same as items).
  if p_qty < v_row.qty then
    raise exception 'quantity can only stay or increase — reductions go through HQ'
      using errcode = '22023', detail = 'downsell_blocked';
  end if;

  -- 0242 size law, validated against the LIVE addons config.
  select a.size_options into v_size_opts from addons a where a.key = v_row.addon_key;
  if v_size_opts is not null
     and jsonb_typeof(v_size_opts) = 'array'
     and jsonb_array_length(v_size_opts) > 0 then
    v_sizes := coalesce(p_attrs, '{}'::jsonb)->'sizes';
    if jsonb_typeof(v_sizes) is distinct from 'array'
       or jsonb_array_length(v_sizes) is distinct from p_qty then
      raise exception 'one size per unit is required'
        using errcode = '22023', detail = 'addon_size_required';
    end if;
    for v_i in 0 .. p_qty - 1 loop
      if jsonb_typeof(v_sizes->v_i) is distinct from 'string'
         or not (v_size_opts @> jsonb_build_array(v_sizes->v_i)) then
        raise exception 'invalid size pick'
          using errcode = '22023', detail = 'addon_size_required';
      end if;
    end loop;
  end if;

  v_delta := v_row.unit_price * (p_qty - v_row.qty);

  update order_addons
     set qty = p_qty,
         attrs = case when p_attrs is null then attrs else p_attrs end
   where id = p_addon_id;

  if p_source = 'change_request' then
    update order_change_requests
       set status = 'approved',
           decided_by = auth.uid(),
           decided_at = now(),
           applied_at = now()
     where id = p_change_request_id;
  end if;

  update orders
     set items_edited = case when source_system = 'autocount' then true else items_edited end,
         updated_at = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role, metadata)
  values (
    p_order_id,
    format('Add-on edited · %s ×%s → ×%s%s',
           v_row.addon_key, v_row.qty, p_qty,
           case when p_source = 'change_request' then ' · approved add-on change' else '' end),
    v_role,
    jsonb_build_object(
      'kind', 'edit_addon',
      'source', p_source,
      'change_request_id', p_change_request_id,
      'addon_id', p_addon_id,
      'addon_key', v_row.addon_key,
      'old', jsonb_build_object('qty', v_row.qty, 'attrs', v_row.attrs),
      'new', jsonb_build_object('qty', p_qty, 'attrs', coalesce(p_attrs, v_row.attrs)),
      'total_delta', v_delta
    )
  );

  insert into audit_log (role, action, dealer_id, ref)
  values (v_role, 'order.addon_edited', v_order.dealer_id, 'SO-' || v_order.so::text);

  return jsonb_build_object('id', p_order_id, 'addon_id', p_addon_id,
                            'qty', p_qty, 'total_delta', v_delta);
end;
$function$
$s0500a$;
    insert into _g0500 values ('edit_order_addon_unchecked_0258(uuid, uuid, integer, jsonb, text, uuid)', 'rewritten');
  elsif h in ('0186c95e65d71c70d9dc52d34592c114') then insert into _g0500 values ('edit_order_addon_unchecked_0258(uuid, uuid, integer, jsonb, text, uuid)', 'already');
  else insert into _g0500 values ('edit_order_addon_unchecked_0258(uuid, uuid, integer, jsonb, text, uuid)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'edit_order_addon_unchecked_0258(uuid, uuid, integer, jsonb, text, uuid)';
  end if;
end
$g0500$;

-- enforce_sku_price_cost_principal_only()
--   source: repo 0226_operation_costing.sql; 2 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.enforce_sku_price_cost_principal_only()'); h text;
begin
  if p is null then insert into _g0500 values ('enforce_sku_price_cost_principal_only()', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '4ed11e24cd061e53252193d5aad90734' then
    execute $s0500a$
CREATE OR REPLACE FUNCTION public.enforce_sku_price_cost_principal_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text := (select public.app_role())::text;
BEGIN
  -- Bypass for the principal (Master Admin) and for the service / admin
  -- context (NULL role = no end-user JWT: service_role, migrations, cron).
  IF v_role IS NULL OR v_role = 'principal' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Selling-side knobs stay principal-only for every other role.
    IF (NEW.price IS DISTINCT FROM OLD.price)
       OR (NEW.pwp_price IS DISTINCT FROM OLD.pwp_price)
       OR (NEW.prices_by_size IS DISTINCT FROM OLD.prices_by_size) THEN
      RAISE EXCEPTION
        'Only the principal (Master Admin) can set SKU price, pwp_price, or prices_by_size'
        USING ERRCODE = '42501', DETAIL = 'sku_price_cost_principal_only';
    END IF;
    -- 0226 — cost (the buying price) is recorded by operation OR principal.
    IF (NEW.cost IS DISTINCT FROM OLD.cost) AND (v_role is null or v_role <> 'operation') THEN
      RAISE EXCEPTION
        'Only operation or the principal can set SKU cost'
        USING ERRCODE = '42501', DETAIL = 'sku_cost_internal_only';
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    -- Non-principal may create an UNPRICED sku; operation may seed its cost.
    IF (NEW.price IS DISTINCT FROM 0)
       OR (NEW.pwp_price IS NOT NULL)
       OR (NEW.prices_by_size IS NOT NULL) THEN
      RAISE EXCEPTION
        'Only the principal (Master Admin) can set SKU price, pwp_price, or prices_by_size'
        USING ERRCODE = '42501', DETAIL = 'sku_price_cost_principal_only';
    END IF;
    IF (NEW.cost IS NOT NULL) AND (v_role is null or v_role <> 'operation') THEN
      RAISE EXCEPTION
        'Only operation or the principal can set SKU cost'
        USING ERRCODE = '42501', DETAIL = 'sku_cost_internal_only';
    END IF;
  END IF;

  RETURN NEW;
END;
$$
$s0500a$;
    insert into _g0500 values ('enforce_sku_price_cost_principal_only()', 'rewritten');
  elsif h in ('ca55b838ad67a1cf97f9677c9f71099f') then insert into _g0500 values ('enforce_sku_price_cost_principal_only()', 'already');
  else insert into _g0500 values ('enforce_sku_price_cost_principal_only()', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'enforce_sku_price_cost_principal_only()';
  end if;
end
$g0500$;

-- finance_po_pay(text, numeric, payment_method, text)
--   source: repo 0063_finance_ap_aging.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.finance_po_pay(text, numeric, payment_method, text)'); h text;
begin
  if p is null then insert into _g0500 values ('finance_po_pay(text, numeric, payment_method, text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '3f21ee701ae21332a10b7fac9af2918a' then
    execute $s0500a$
create or replace function public.finance_po_pay(
  p_po_id     text,
  p_amount    numeric,
  p_method    payment_method,
  p_reference text
) returns payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po  purchase_orders;
  v_pay payments;
begin
  if (public.app_role() is null or public.app_role() not in ('finance','principal')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'purchase order not found' using errcode = 'P0002';
  end if;

  if v_po.pay_status = 'paid' then
    raise exception 'po already paid' using errcode = '22023';
  end if;

  insert into payments (direction, amount, method, reference,
                        paid_at, po_id, recorded_by)
  values ('out', p_amount, p_method, p_reference,
          current_date, p_po_id, auth.uid())
  returning * into v_pay;

  update purchase_orders
     set pay_status = 'paid',
         updated_at = now()
   where id = p_po_id;

  insert into audit_log (role, actor_text, action, ref)
  values (public.app_role(),
          (select name from app_users where id = auth.uid()),
          format('PO paid · RM %s · %s · %s', p_amount, p_method, p_po_id),
          p_reference);

  return v_pay;
end;
$$
$s0500a$;
    insert into _g0500 values ('finance_po_pay(text, numeric, payment_method, text)', 'rewritten');
  elsif h in ('345f68dde1c5cb65a3e40a373b86c02a') then insert into _g0500 values ('finance_po_pay(text, numeric, payment_method, text)', 'already');
  else insert into _g0500 values ('finance_po_pay(text, numeric, payment_method, text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'finance_po_pay(text, numeric, payment_method, text)';
  end if;
end
$g0500$;

-- finance_po_schedule(text, date)
--   source: repo 0063_finance_ap_aging.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.finance_po_schedule(text, date)'); h text;
begin
  if p is null then insert into _g0500 values ('finance_po_schedule(text, date)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '8d7334f8a1972797844e5e1d3868fee1' then
    execute $s0500a$
create or replace function public.finance_po_schedule(
  p_po_id          text,
  p_scheduled_for  date
) returns purchase_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po purchase_orders;
begin
  if (public.app_role() is null or public.app_role() not in ('finance','principal')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'purchase order not found' using errcode = 'P0002';
  end if;

  if v_po.pay_status <> 'unpaid' then
    raise exception 'cannot schedule (current pay_status: %)', v_po.pay_status
      using errcode = '22023';
  end if;

  update purchase_orders
     set pay_status = 'scheduled',
         updated_at = now()
   where id = p_po_id
   returning * into v_po;

  insert into audit_log (role, actor_text, action, ref)
  values (public.app_role(),
          (select name from app_users where id = auth.uid()),
          format('PO scheduled · %s · %s', p_po_id,
                 coalesce(p_scheduled_for::text, 'no date')),
          p_po_id);

  return v_po;
end;
$$
$s0500a$;
    insert into _g0500 values ('finance_po_schedule(text, date)', 'rewritten');
  elsif h in ('c27712a8d2c0c612ddb216e1c42632dc') then insert into _g0500 values ('finance_po_schedule(text, date)', 'already');
  else insert into _g0500 values ('finance_po_schedule(text, date)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'finance_po_schedule(text, date)';
  end if;
end
$g0500$;

-- finance_record_receipt(uuid, numeric, text, text, text)
--   source: repo 0476_every_invoice_door_posts_and_a_method_is_a_setting.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.finance_record_receipt(uuid, numeric, text, text, text)'); h text;
begin
  if p is null then insert into _g0500 values ('finance_record_receipt(uuid, numeric, text, text, text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '4f8ac5d7a99cacaac218efb6e342c083' then
    execute $s0500a$
create or replace function public.finance_record_receipt(
  p_order_id uuid, p_amount numeric, p_method text, p_reference text,
  p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  -- 0476: coalesced — an unknown caller's NULL role is refused, not waved through (0448's lesson).
  if coalesce((public.app_role() is null or public.app_role() not in ('finance','principal')), true) then raise exception 'forbidden' using errcode='42501'; end if;
  return public._customer_payment_post(p_order_id, p_amount, current_date, p_method, 'payment',
    'finance_ar', coalesce(nullif(p_idempotency_key,''), gen_random_uuid()::text), p_reference,
    p_reference, null, null, null, '{}'::jsonb, true);
end;
$fn$
$s0500a$;
    insert into _g0500 values ('finance_record_receipt(uuid, numeric, text, text, text)', 'rewritten');
  elsif h in ('9e4713c160f38668c81c1cb0170b8b0f') then insert into _g0500 values ('finance_record_receipt(uuid, numeric, text, text, text)', 'already');
  else insert into _g0500 values ('finance_record_receipt(uuid, numeric, text, text, text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'finance_record_receipt(uuid, numeric, text, text, text)';
  end if;
end
$g0500$;

-- hr_assign_dealer_bd(uuid, uuid)
--   source: repo 0250_bd_commission.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.hr_assign_dealer_bd(uuid, uuid)'); h text;
begin
  if p is null then insert into _g0500 values ('hr_assign_dealer_bd(uuid, uuid)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '26673ce2d33713d917ed70a85519b740' then
    execute $s0500a$
create or replace function public.hr_assign_dealer_bd(p_dealer_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dealer dealers%rowtype;
  v_bd_name text;
begin
  if ((select public.app_role()) is null or (select public.app_role()) not in ('hr', 'principal')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_dealer from dealers where id = p_dealer_id for update;
  if not found then
    raise exception 'dealer_not_found';
  end if;
  if v_dealer.channel <> 'dealer' then
    raise exception 'not_a_dealer'; -- showrooms are ours; BD earns on resellers only
  end if;

  if p_user_id is not null then
    select name into v_bd_name from app_users where id = p_user_id and role = 'bd';
    if not found then
      raise exception 'bd_user_mismatch';
    end if;
  end if;

  update dealers set bd_owner_user_id = p_user_id where id = p_dealer_id;

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ((select public.app_role()),
          (select name from app_users where id = auth.uid()),
          case when p_user_id is null
               then format('HR cleared BD owner of %s', v_dealer.name)
               else format('HR assigned %s to BD %s', v_dealer.name, v_bd_name) end,
          p_dealer_id,
          v_dealer.name);
end;
$$
$s0500a$;
    insert into _g0500 values ('hr_assign_dealer_bd(uuid, uuid)', 'rewritten');
  elsif h in ('5baa1aeff44a5e296194cf61e839ba4a') then insert into _g0500 values ('hr_assign_dealer_bd(uuid, uuid)', 'already');
  else insert into _g0500 values ('hr_assign_dealer_bd(uuid, uuid)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'hr_assign_dealer_bd(uuid, uuid)';
  end if;
end
$g0500$;

-- hr_commission_source(integer, integer)
--   source: repo 0265_hr_source_exclude_imported_archive.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.hr_commission_source(integer, integer)'); h text;
begin
  if p is null then insert into _g0500 values ('hr_commission_source(integer, integer)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '8fb2f228acb9f55eba54b269405636a5' then
    execute $s0500a$
CREATE OR REPLACE FUNCTION public.hr_commission_source(p_year integer, p_month integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_start date;
  v_end date;
  v_result jsonb;
begin
  if ((select public.app_role()) is null or (select public.app_role()) not in ('hr', 'principal')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_month < 1 or p_month > 12 or p_year < 2020 or p_year > 2100 then
    raise exception 'invalid_month';
  end if;

  v_start := make_date(p_year, p_month, 1);
  v_end := v_start + interval '1 month';

  select jsonb_build_object(
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'staffRole', s.staff_role,
        'active', s.active, 'dealerId', s.dealer_id, 'outletId', s.outlet_id,
        'storeName', d.name, 'outletName', o.name))
      from salespersons s
      join dealers d on d.id = s.dealer_id and d.channel = 'showroom'
      left join outlets o on o.id = s.outlet_id), '[]'::jsonb),
    'models', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pm.id, 'name', pm.name, 'category', pm.category))
      from product_models pm
      where pm.discontinued_at is null
        and pm.category::text <> 'service'), '[]'::jsonb),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'orderId', ord.id, 'so', ord.so, 'placedAt', ord.placed_at,
        'salespersonId', ord.salesperson_id, 'dealerId', ord.dealer_id,
        'outletId', ord.outlet_id, 'modelId', m.id, 'modelName', m.name,
        'category', m.category, 'qty', l.qty, 'unitPrice', l.unit_price))
      from orders ord
      join dealers d on d.id = ord.dealer_id and d.channel = 'showroom'
      join order_lines l on l.order_id = ord.id
      left join product_skus sk on sk.sku = l.sku
      left join product_models m on m.id = sk.model_id
      where ord.placed_at >= v_start and ord.placed_at < v_end
        and ord.status <> 'cancelled'
        and coalesce(m.category::text, '') <> 'service'), '[]'::jsonb),
    'unattributed', coalesce((
      select jsonb_agg(jsonb_build_object(
        'orderId', ord.id, 'so', ord.so, 'placedAt', ord.placed_at,
        'dealerId', ord.dealer_id, 'outletId', ord.outlet_id,
        'storeName', d.name, 'customerName', ord.customer_name,
        'amount', (select coalesce(sum(l2.qty * l2.unit_price), 0)
                   from order_lines l2 where l2.order_id = ord.id)))
      from orders ord
      join dealers d on d.id = ord.dealer_id and d.channel = 'showroom'
      where ord.placed_at >= v_start and ord.placed_at < v_end
        and ord.status <> 'cancelled'
        and ord.salesperson_id is null
        -- 0265: imported archive is never "waiting for a human"
        and coalesce(ord.source_system, '') <> 'autocount'), '[]'::jsonb),
    -- 0265: counted, named, and shown — not silently dropped.
    'legacyUnattributed', coalesce((
      select count(*)
      from orders ord
      join dealers d on d.id = ord.dealer_id and d.channel = 'showroom'
      where ord.placed_at >= v_start and ord.placed_at < v_end
        and ord.status <> 'cancelled'
        and ord.salesperson_id is null
        and coalesce(ord.source_system, '') = 'autocount'), 0),
    'bdUsers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'name', u.name, 'email', u.email,
        'position', coalesce(bp.position, 'executive')))
      from app_users u
      left join bd_profiles bp on bp.user_id = u.id
      where u.role = 'bd'), '[]'::jsonb),
    'bdMethod', coalesce((select method from bd_commission_config limit 1), 'percentage'),
    'dealers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'name', d.name, 'status', d.status,
        'bdOwnerUserId', d.bd_owner_user_id))
      from dealers d where d.channel = 'dealer'), '[]'::jsonb),
    'dealerOrders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'orderId', ord.id, 'so', ord.so, 'placedAt', ord.placed_at,
        'dealerId', ord.dealer_id,
        'amount', (
          select coalesce(sum(l.qty * l.unit_price), 0)
          from order_lines l
          left join product_skus sk on sk.sku = l.sku
          left join product_models m on m.id = sk.model_id
          where l.order_id = ord.id
            and coalesce(m.category::text, '') <> 'service')))
      from orders ord
      join dealers d on d.id = ord.dealer_id and d.channel = 'dealer'
      where ord.placed_at >= v_start and ord.placed_at < v_end
        and ord.status <> 'cancelled'), '[]'::jsonb),
    'dealerLines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'orderId', ord.id, 'so', ord.so, 'placedAt', ord.placed_at,
        'dealerId', ord.dealer_id, 'modelId', m.id, 'modelName', m.name,
        'category', m.category, 'qty', l.qty, 'unitPrice', l.unit_price))
      from orders ord
      join dealers d on d.id = ord.dealer_id and d.channel = 'dealer'
      join order_lines l on l.order_id = ord.id
      left join product_skus sk on sk.sku = l.sku
      left join product_models m on m.id = sk.model_id
      where ord.placed_at >= v_start and ord.placed_at < v_end
        and ord.status <> 'cancelled'
        and coalesce(m.category::text, '') <> 'service'), '[]'::jsonb),
    'config', jsonb_build_object(
      'schemes', coalesce((
        select jsonb_agg(jsonb_build_object(
          'dealerId', c.dealer_id, 'outletId', c.outlet_id, 'method', c.method))
        from commission_scheme_config c), '[]'::jsonb),
      'rates', coalesce((
        select jsonb_agg(jsonb_build_object(
          'salespersonId', r.salesperson_id, 'pct', r.pct,
          'effectiveFrom', r.effective_from))
        from staff_commission_rates r), '[]'::jsonb),
      'bdRates', coalesce((
        select jsonb_agg(jsonb_build_object(
          'userId', br.user_id, 'pct', br.pct,
          'effectiveFrom', br.effective_from))
        from bd_commission_rates br), '[]'::jsonb),
      'modelRates', coalesce((
        select jsonb_agg(jsonb_build_object(
          'modelId', mr.model_id, 'perUnitAmount', mr.per_unit_amount,
          'program', mr.program))
        from model_commission_rates mr), '[]'::jsonb),
      'modelTiers', coalesce((
        select jsonb_agg(jsonb_build_object(
          'modelId', mt.model_id, 'thresholdQty', mt.threshold_qty,
          'bonusAmount', mt.bonus_amount, 'program', mt.program))
        from model_commission_tiers mt), '[]'::jsonb),
      'milestones', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', ms.id, 'category', ms.category, 'thresholdQty', ms.threshold_qty,
          'bonusAmount', ms.bonus_amount, 'program', ms.program))
        from commission_milestones ms), '[]'::jsonb)))
  into v_result;

  return v_result;
end;
$function$
$s0500a$;
    insert into _g0500 values ('hr_commission_source(integer, integer)', 'rewritten');
  elsif h in ('138af038ef41df810885e2c641173361') then insert into _g0500 values ('hr_commission_source(integer, integer)', 'already');
  else insert into _g0500 values ('hr_commission_source(integer, integer)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'hr_commission_source(integer, integer)';
  end if;
end
$g0500$;

-- hr_set_position(uuid, uuid)
--   source: repo 0254_hr_team_hierarchy.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.hr_set_position(uuid, uuid)'); h text;
begin
  if p is null then insert into _g0500 values ('hr_set_position(uuid, uuid)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '69a384d68124b6f1aefb9da99138b188' then
    execute $s0500a$
create or replace function public.hr_set_position(p_user_id uuid, p_position_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user app_users%rowtype;
  v_prev text;
  v_new text;
begin
  if ((select public.app_role()) is null or (select public.app_role()) not in ('hr', 'principal')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_user from app_users where id = p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;
  if v_user.role = 'dealer' then raise exception 'dealer_not_in_hierarchy'; end if;

  select name into v_prev from org_positions where id = v_user.position_id;
  if p_position_id is not null then
    select name into v_new from org_positions where id = p_position_id and active;
    if v_new is null then raise exception 'position_not_found'; end if;
  end if;

  update app_users set position_id = p_position_id where id = p_user_id;

  if coalesce(v_prev, '') <> coalesce(v_new, '') then
    insert into org_position_history
      (subject_kind, subject_id, subject_name, prev_position, new_position, changed_by)
    values ('hq_user', p_user_id, v_user.name, v_prev, v_new, auth.uid());

    insert into audit_log (role, actor_text, action, ref)
    values ((select public.app_role()),
            (select name from app_users where id = auth.uid()),
            format('Position change · %s: %s → %s',
                   v_user.name, coalesce(v_prev, '—'), coalesce(v_new, '—')),
            p_user_id::text);
  end if;
end;
$$
$s0500a$;
    insert into _g0500 values ('hr_set_position(uuid, uuid)', 'rewritten');
  elsif h in ('f4a6ad88f4038d95c8e58cde707b8a1e') then insert into _g0500 values ('hr_set_position(uuid, uuid)', 'already');
  else insert into _g0500 values ('hr_set_position(uuid, uuid)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'hr_set_position(uuid, uuid)';
  end if;
end
$g0500$;

-- hr_set_position_duty(uuid, text, boolean)
--   source: repo 0260_hr_duty_keys.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.hr_set_position_duty(uuid, text, boolean)'); h text;
begin
  if p is null then insert into _g0500 values ('hr_set_position_duty(uuid, text, boolean)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '1980d0a20b08e2f3dd5600696f2b7b3c' then
    execute $s0500a$
create or replace function public.hr_set_position_duty(
  p_position_id uuid,
  p_duty_key    text,
  p_granted     boolean
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pos  text;
  v_duty text;
begin
  if ((select public.app_role()) is null or (select public.app_role()) not in ('hr','principal')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select name into v_pos  from org_positions where id = p_position_id and active;
  if v_pos is null then raise exception 'position_not_found'; end if;

  select name into v_duty from org_duties where key = p_duty_key;
  if v_duty is null then raise exception 'duty_not_found'; end if;

  if p_granted then
    insert into org_position_duties (position_id, duty_key, granted_by)
    values (p_position_id, p_duty_key, auth.uid())
    on conflict (position_id, duty_key) do nothing;
  else
    delete from org_position_duties
    where position_id = p_position_id and duty_key = p_duty_key;
  end if;

  insert into audit_log (role, actor_text, action, ref)
  values ((select public.app_role()),
          (select name from app_users where id = auth.uid()),
          format('Duty %s · %s: %s',
                 case when p_granted then 'granted' else 'revoked' end,
                 v_pos, v_duty),
          p_position_id::text);
end;
$function$
$s0500a$;
    insert into _g0500 values ('hr_set_position_duty(uuid, text, boolean)', 'rewritten');
  elsif h in ('176830cc84208251f13b8cfdbbc41809') then insert into _g0500 values ('hr_set_position_duty(uuid, text, boolean)', 'already');
  else insert into _g0500 values ('hr_set_position_duty(uuid, text, boolean)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'hr_set_position_duty(uuid, text, boolean)';
  end if;
end
$g0500$;

-- hr_set_reports_to(uuid, uuid)
--   source: repo 0260_hr_duty_keys.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.hr_set_reports_to(uuid, uuid)'); h text;
begin
  if p is null then insert into _g0500 values ('hr_set_reports_to(uuid, uuid)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'f7f0ae2c08672e6207a63d6018f734fa' then
    execute $s0500a$
create or replace function public.hr_set_reports_to(p_user_id uuid, p_manager_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user  app_users%rowtype;
  v_walk  uuid;
  v_hops  int := 0;
  v_prev  text;
  v_new   text;
begin
  if ((select public.app_role()) is null or (select public.app_role()) not in ('hr', 'principal')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_user from app_users where id = p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;
  if v_user.role = 'dealer' then raise exception 'dealer_not_in_hierarchy'; end if;

  if p_manager_id is not null then
    if p_manager_id = p_user_id then raise exception 'reports_to_self'; end if;
    if not exists (select 1 from app_users
                   where id = p_manager_id and role <> 'dealer') then
      raise exception 'manager_not_found';
    end if;
    -- cycle guard: walking up from the manager must never reach the subject
    v_walk := p_manager_id;
    while v_walk is not null and v_hops < 20 loop
      select reports_to_user_id into v_walk from app_users where id = v_walk;
      if v_walk = p_user_id then raise exception 'reporting_cycle'; end if;
      v_hops := v_hops + 1;
    end loop;
  end if;

  select name into v_prev from app_users where id = v_user.reports_to_user_id;
  select name into v_new  from app_users where id = p_manager_id;

  update app_users set reports_to_user_id = p_manager_id where id = p_user_id;

  -- NEW (HR-P2): reporting-line moves are the payment spine for HR-P6
  -- rollups — they must not move silently.
  if coalesce(v_user.reports_to_user_id::text, '') <> coalesce(p_manager_id::text, '') then
    insert into audit_log (role, actor_text, action, ref)
    values ((select public.app_role()),
            (select name from app_users where id = auth.uid()),
            format('Reporting line · %s: %s → %s',
                   v_user.name, coalesce(v_prev, '—'), coalesce(v_new, '—')),
            p_user_id::text);
  end if;
end;
$function$
$s0500a$;
    insert into _g0500 values ('hr_set_reports_to(uuid, uuid)', 'rewritten');
  elsif h in ('f2ad90160080b7348706d150907c904f') then insert into _g0500 values ('hr_set_reports_to(uuid, uuid)', 'already');
  else insert into _g0500 values ('hr_set_reports_to(uuid, uuid)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'hr_set_reports_to(uuid, uuid)';
  end if;
end
$g0500$;

-- hr_set_staff_code(text, uuid, text)
--   source: repo 0254_hr_team_hierarchy.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.hr_set_staff_code(text, uuid, text)'); h text;
begin
  if p is null then insert into _g0500 values ('hr_set_staff_code(text, uuid, text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'be0ca6f81b35c435b9d93b6860fee6d7' then
    execute $s0500a$
create or replace function public.hr_set_staff_code(
  p_kind text, p_id uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_name text;
begin
  if ((select public.app_role()) is null or (select public.app_role()) not in ('hr', 'principal')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_kind not in ('hq_user', 'showroom_staff') then
    raise exception 'invalid_kind';
  end if;

  v_code := nullif(upper(trim(p_code)), '');
  if v_code is not null and v_code !~ '^[A-Z]{1,5}[0-9]{2,6}$' then
    raise exception 'invalid_staff_code';
  end if;

  if p_kind = 'hq_user' then
    select name into v_name from app_users where id = p_id and role <> 'dealer';
    if v_name is null then raise exception 'user_not_found'; end if;
    update app_users set staff_code = v_code where id = p_id;
  else
    select sp.name into v_name
    from salespersons sp
    join dealers d on d.id = sp.dealer_id and d.channel = 'showroom'
    where sp.id = p_id;
    if v_name is null then raise exception 'staff_not_found'; end if;
    update salespersons set staff_code = v_code where id = p_id;
  end if;

  insert into audit_log (role, actor_text, action, ref)
  values ((select public.app_role()),
          (select name from app_users where id = auth.uid()),
          format('Staff code · %s → %s', v_name, coalesce(v_code, '—')),
          p_id::text);
end;
$$
$s0500a$;
    insert into _g0500 values ('hr_set_staff_code(text, uuid, text)', 'rewritten');
  elsif h in ('417e26127d58dc627feaee2e4343e4bf') then insert into _g0500 values ('hr_set_staff_code(text, uuid, text)', 'already');
  else insert into _g0500 values ('hr_set_staff_code(text, uuid, text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'hr_set_staff_code(text, uuid, text)';
  end if;
end
$g0500$;

-- hr_team_source()
--   source: repo 0259_org_departments.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.hr_team_source()'); h text;
begin
  if p is null then insert into _g0500 values ('hr_team_source()', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '6caa5fb4e7654c94a3a0118264995a5a' then
    execute $s0500a$
create or replace function public.hr_team_source()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if ((select public.app_role()) is null or (select public.app_role()) not in ('hr', 'principal')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'email', u.email, 'name', u.name, 'role', u.role,
        'title', u.title, 'status', u.status,
        'staffCode', u.staff_code,
        'positionId', u.position_id, 'positionName', p.name, 'band', p.band,
        'reportsToUserId', u.reports_to_user_id,
        'lastSeenAt', u.last_seen_at, 'createdAt', u.created_at,
        'orgName', coalesce(s.name, dp.name, d.name))
        order by u.created_at)
      from app_users u
      left join org_positions p on p.id = u.position_id
      left join suppliers s on s.id = u.supplier_id
      left join delivery_partners dp on dp.id = u.partner_id
      left join dealers d on d.id = u.dealer_id
      where u.role <> 'dealer'), '[]'::jsonb),
    'showroomStores', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by d.name)
      from dealers d where d.channel = 'showroom'), '[]'::jsonb),
    'showroomStaff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sp.id, 'name', sp.name, 'staffRole', sp.staff_role,
        'staffCode', sp.staff_code, 'active', sp.active,
        'email', sp.email, 'phone', sp.phone,
        'dealerId', sp.dealer_id, 'storeName', d.name,
        'outletId', sp.outlet_id, 'outletName', o.name,
        'hasPin', exists (select 1 from salesperson_pins pin
                          where pin.salesperson_id = sp.id))
        order by d.name, o.name nulls first, sp.name)
      from salespersons sp
      join dealers d on d.id = sp.dealer_id and d.channel = 'showroom'
      left join outlets o on o.id = sp.outlet_id), '[]'::jsonb),
    'positions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', op.id, 'name', op.name, 'band', op.band,
        'sort', op.sort, 'active', op.active,
        'departmentId', op.department_id)
        order by case op.band when 'c_level' then 0 when 'manager' then 1 else 2 end,
                 op.sort, op.name)
      from org_positions op), '[]'::jsonb),
    'departments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', od.id, 'name', od.name, 'sort', od.sort, 'active', od.active)
        order by od.sort, od.name)
      from org_departments od), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id, 'subjectKind', h.subject_kind, 'subjectId', h.subject_id,
        'subjectName', h.subject_name, 'prevPosition', h.prev_position,
        'newPosition', h.new_position, 'changedAt', h.changed_at,
        'changedBy', (select name from app_users a where a.id = h.changed_by))
        order by h.changed_at desc)
      from (select * from org_position_history
            order by changed_at desc limit 100) h), '[]'::jsonb))
  into v_result;

  return v_result;
end;
$$
$s0500a$;
    insert into _g0500 values ('hr_team_source()', 'rewritten');
  elsif h in ('6abf27ce2c1de49bf1aeaa5bc5759a9b') then insert into _g0500 values ('hr_team_source()', 'already');
  else insert into _g0500 values ('hr_team_source()', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'hr_team_source()';
  end if;
end
$g0500$;

-- import_autocount_orders(jsonb)
--   source: repo 0143_autocount_import_batch.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.import_autocount_orders(jsonb)'); h text;
begin
  if p is null then insert into _g0500 values ('import_autocount_orders(jsonb)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '57afe89616c5f2cd9491a25ec1b23652' then
    execute $s0500a$
create or replace function public.import_autocount_orders(payloads jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role    app_role;
  v_payload jsonb;
  v_one     jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  v_role := public.app_role();
  if (v_role is null or v_role not in ('operation','principal')) then
    raise exception 'forbidden: import is operation/principal only'
      using errcode = '42501';
  end if;

  if payloads is null or jsonb_typeof(payloads) <> 'array' then
    raise exception 'payloads must be a JSON array' using errcode = '22023';
  end if;

  for v_payload in select * from jsonb_array_elements(payloads) loop
    begin
      v_one := public._import_autocount_order(v_payload);
    exception when others then
      -- Isolate the failure to this order; the rest of the batch still commits.
      v_one := jsonb_build_object(
        'id', null,
        'so', null,
        'source_ref', coalesce(v_payload->'source_ref', '[]'::jsonb),
        'result', 'error',
        'error', SQLERRM
      );
    end;
    v_results := v_results || jsonb_build_array(v_one);
  end loop;

  return v_results;
end;
$$
$s0500a$;
    insert into _g0500 values ('import_autocount_orders(jsonb)', 'rewritten');
  elsif h in ('762b510d7f4e6e4804072cc789a2da1a') then insert into _g0500 values ('import_autocount_orders(jsonb)', 'already');
  else insert into _g0500 values ('import_autocount_orders(jsonb)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'import_autocount_orders(jsonb)';
  end if;
end
$g0500$;

-- invoice_issue(uuid, numeric, numeric)
--   source: repo 0003_rpcs.sql; 1 gate edit(s)
--   source: live definition (dynamic renames applied); 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.invoice_issue(uuid, numeric, numeric)'); h text;
begin
  if p is null then insert into _g0500 values ('invoice_issue(uuid, numeric, numeric)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'cfcc247882ed4d327cca02856a7d4a70' then
    execute $s0500a$
create or replace function invoice_issue(
  p_order_id   uuid,
  p_amount     numeric,
  p_tax_amount numeric
) returns invoices
language plpgsql security definer as $$
declare
  v_inv invoices;
  v_no  text;
begin
  if (public.app_role() is null or public.app_role() not in ('finance','principal')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_no := 'INV-' || to_char(now(),'YYYY') || '-' ||
          to_char((select dl from orders where id = p_order_id), 'FM0000');

  insert into invoices (invoice_no, order_id, amount, tax_amount, issued_at)
  values (v_no, p_order_id, p_amount, p_tax_amount, current_date)
  returning * into v_inv;

  update orders set invoice_no = v_no, invoiced_at = current_date where id = p_order_id;

  insert into order_history (order_id, text, by_role, by_user_id)
  values (p_order_id, format('Tax invoice issued · %s', v_no), 'finance', auth.uid());

  return v_inv;
end;
$$
$s0500a$;
    insert into _g0500 values ('invoice_issue(uuid, numeric, numeric)', 'rewritten');
  elsif h = '2ce2bb3cec81405bf4a8be3a17c27eae' then
    execute $s0500b$
CREATE OR REPLACE FUNCTION public.invoice_issue(p_order_id uuid, p_amount numeric, p_tax_amount numeric)
 RETURNS invoices
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_inv invoices;
  v_no  text;
begin
  if (public.app_role() is null or public.app_role() not in ('finance','principal')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_no := 'INV-' || to_char(now(),'YYYY') || '-' ||
          to_char((select so from orders where id = p_order_id), 'FM0000');

  insert into invoices (invoice_no, order_id, amount, tax_amount, issued_at)
  values (v_no, p_order_id, p_amount, p_tax_amount, current_date)
  returning * into v_inv;

  update orders set invoice_no = v_no, invoiced_at = current_date where id = p_order_id;

  insert into order_history (order_id, text, by_role, by_user_id)
  values (p_order_id, format('Tax invoice issued · %s', v_no), 'finance', auth.uid());

  return v_inv;
end;
$function$
$s0500b$;
    insert into _g0500 values ('invoice_issue(uuid, numeric, numeric)', 'rewritten');
  elsif h in ('0a98b89a97d90e9c423dc9035c29f109', '8c6aa19e98db334701dfe6b8d4ede67a') then insert into _g0500 values ('invoice_issue(uuid, numeric, numeric)', 'already');
  else insert into _g0500 values ('invoice_issue(uuid, numeric, numeric)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'invoice_issue(uuid, numeric, numeric)';
  end if;
end
$g0500$;

-- issue_record_action_result(uuid, uuid, text, text, jsonb)
--   source: repo 0454_an_issue_action_has_one_identity_and_one_result.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.issue_record_action_result(uuid, uuid, text, text, jsonb)'); h text;
begin
  if p is null then insert into _g0500 values ('issue_record_action_result(uuid, uuid, text, text, jsonb)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '82490e148a2fb4e3c99d9f99797efc3f' then
    execute $s0500a$
create or replace function public.issue_record_action_result(
  p_issue_id uuid,
  p_action_id uuid,
  p_result_code text,
  p_result text,
  p_next_action jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_current public.issue_actions;
  v_duty jsonb;
  v_next public.issue_actions;
begin
  if v_uid is null or (public.app_role() is null or public.app_role() not in ('operation','principal')) then
    raise exception 'operation access required' using errcode = '42501';
  end if;
  if p_result_code is null or p_result_code not in ('accepted','rejected','proof_added','correction_confirmed','repair_confirmed','replacement_confirmed','answer_recorded') or length(btrim(p_result)) < 3 then
    raise exception 'a governed result is required' using errcode = '22023';
  end if;

  select * into v_current from public.issue_actions
   where id = p_action_id and issue_id = p_issue_id and status = 'open'
   for update;
  if not found then raise exception 'current action not found' using errcode = 'P0002'; end if;

  v_duty := public.workspace_resolve_duty(v_current.owner_rule, null);
  if nullif(v_duty->>'actor_user_id','')::uuid is distinct from v_uid
     and not public.is_operations_superuser(v_uid) then
    raise exception 'current Duty or cover must record this result' using errcode = '42501';
  end if;

  update public.issue_actions
     set status = case when p_next_action is null then 'completed' else 'replaced' end,
         result_code = p_result_code, result = btrim(p_result), completed_by = v_uid,
         completed_at = now(),
         normal_owner_id = nullif(v_duty->>'normal_user_id','')::uuid,
         cover_owner_id = nullif(v_duty->>'acting_user_id','')::uuid,
         assignment_id = null
   where id = v_current.id;

  if p_next_action is not null then
    insert into public.issue_actions
      (issue_id, sequence, trigger, owner_rule, action, recipient, required_result, due_on, opened_by)
    values (
      p_issue_id, v_current.sequence + 1,
      btrim(p_next_action->>'trigger'), p_next_action->>'ownerRule',
      btrim(p_next_action->>'action'), btrim(p_next_action->>'recipient'),
      btrim(p_next_action->>'requiredResult'), (p_next_action->>'dueOn')::date, v_uid
    ) returning * into v_next;
    update public.issue_actions set replaced_by = v_next.id where id = v_current.id;
  end if;

  insert into public.issue_timeline(issue_id, event_kind, summary, actor_id, payload)
  values (p_issue_id, 'action_result_recorded', btrim(p_result), v_uid,
    jsonb_build_object('action_id', v_current.id, 'result_code', p_result_code,
      'owner_rule', v_current.owner_rule,
      'normal_owner_id', v_duty->>'normal_user_id',
      'cover_owner_id', v_duty->>'acting_user_id',
      'next_action_id', v_next.id));

  update public.issues
     set status = case when p_next_action is null then 'waiting_review' else 'open' end,
         updated_at = now()
   where id = p_issue_id;
  return jsonb_build_object('action_id', v_current.id, 'next_action_id', v_next.id);
end
$fn$
$s0500a$;
    insert into _g0500 values ('issue_record_action_result(uuid, uuid, text, text, jsonb)', 'rewritten');
  elsif h in ('0d4568d2046d92f1e959d9a4422b337e') then insert into _g0500 values ('issue_record_action_result(uuid, uuid, text, text, jsonb)', 'already');
  else insert into _g0500 values ('issue_record_action_result(uuid, uuid, text, text, jsonb)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'issue_record_action_result(uuid, uuid, text, text, jsonb)';
  end if;
end
$g0500$;

-- logistics_confirm_proceed_request(uuid, uuid)
--   source: repo 0038b_logistics_v2_residual_rpc_sweep.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.logistics_confirm_proceed_request(uuid, uuid)'); h text;
begin
  if p is null then insert into _g0500 values ('logistics_confirm_proceed_request(uuid, uuid)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '1c2d50843656010d366029af205d9afa' then
    execute $s0500a$
create or replace function public.logistics_confirm_proceed_request(
  p_order_id     uuid,
  p_warehouse_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order            orders;
  v_role             app_role;
  v_actor            text;
  v_warehouse_id     uuid;
  v_warehouse_name   text;
  v_short_count      int;
  v_short_skus       text;
  v_reserved_skus    text;
  v_new_stage        logistics_stage;
begin
  v_role := public.app_role();

  if (v_role is null or v_role not in ('logistics','principal','bd')) then
    raise exception 'forbidden: logistics/principal/bd only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  -- 1. Lock the order row.
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  -- 2. Stage guard - must be in proceed_request to confirm.
  if v_order.logistics_stage is distinct from 'proceed_request' then
    raise exception 'order is not in proceed_request stage'
      using errcode = '22023', detail = 'wrong_stage';
  end if;

  -- 3. Warehouse resolution.
  if p_warehouse_id is not null then
    if not exists (select 1 from warehouses where id = p_warehouse_id) then
      raise exception 'warehouse not found'
        using errcode = '42P01', detail = 'warehouse_not_found';
    end if;
    v_warehouse_id := p_warehouse_id;
    update orders
       set warehouse_id = p_warehouse_id,
           updated_at   = now()
     where id = p_order_id;
  else
    if v_order.warehouse_id is null then
      raise exception 'warehouse must be assigned before confirming'
        using errcode = '22023', detail = 'warehouse_required';
    end if;
    v_warehouse_id := v_order.warehouse_id;
  end if;

  v_actor := coalesce((select name from app_users where id = auth.uid()),
                      initcap(v_role::text));

  -- 4. Compute shortage. A line is short when (qty - reserved) at the
  -- chosen warehouse is below the line.qty. Missing stock_balances row
  -- counts as shortage (treat available as 0). Single query: count short
  -- lines + comma-list of short SKUs (for awaiting-stock message) + comma-
  -- list of all order SKUs (for ready-to-dispatch message).
  select
    count(*) filter (where (coalesce(sb.qty, 0)
                              - coalesce(sb.reserved, 0)) < ol.qty),
    coalesce(string_agg(ol.sku, ', ')
               filter (where (coalesce(sb.qty, 0)
                                - coalesce(sb.reserved, 0)) < ol.qty),
             ''),
    coalesce(string_agg(ol.sku, ', '), '')
    into v_short_count, v_short_skus, v_reserved_skus
    from order_lines ol
    left join stock_balances sb
           on sb.sku = ol.sku
          and sb.warehouse_id = v_warehouse_id
   where ol.order_id = p_order_id;

  select name into v_warehouse_name from warehouses where id = v_warehouse_id;

  -- 5. Branch on shortage. All-clear -> ready_to_dispatch + reserve. Any
  -- shortage -> awaiting_logistics_action (no reserve; logistics will issue POs).
  if v_short_count = 0 then
    -- Reserve first; if helper raises insufficient_stock_for_reserve a race
    -- happened between availability check and reserve. Let it bubble up so
    -- the API route can retry / inform user.
    perform public._logistics_reserve_order(p_order_id);

    update orders
       set logistics_stage = 'ready_to_dispatch',
           updated_at      = now()
     where id = p_order_id;

    v_new_stage := 'ready_to_dispatch';

    insert into order_history (order_id, text, by_role)
    values (
      p_order_id,
      format('Confirmed at %s · ready to dispatch · reserved: %s',
             coalesce(v_warehouse_name, 'warehouse'),
             v_reserved_skus),
      v_role
    );
  else
    -- VOCAB SWEEP (T2-followup): write 'awaiting_logistics_action' instead
    -- of legacy 'awaiting_stock'.
    update orders
       set logistics_stage = 'awaiting_logistics_action',
           updated_at      = now()
     where id = p_order_id;

    v_new_stage := 'awaiting_logistics_action';

    insert into order_history (order_id, text, by_role)
    values (
      p_order_id,
      format('Confirmed at %s · awaiting stock for %s SKU(s): %s',
             coalesce(v_warehouse_name, 'warehouse'),
             v_short_count,
             v_short_skus),
      v_role
    );
  end if;

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values (v_role, v_actor,
          format('Confirmed proceed-request DL-%s · %s',
                 v_order.dl, v_new_stage::text),
          v_order.dealer_id, 'DL-' || v_order.dl::text);

  return jsonb_build_object(
    'status',          v_order.status,
    'logistics_stage', v_new_stage,
    'warehouse_id',    v_warehouse_id,
    'reserved',        (v_short_count = 0)
  );
end;
$$
$s0500a$;
    insert into _g0500 values ('logistics_confirm_proceed_request(uuid, uuid)', 'rewritten');
  elsif h in ('be37dfcc39a7b5f369cef0db0e5b5f16') then insert into _g0500 values ('logistics_confirm_proceed_request(uuid, uuid)', 'already');
  else insert into _g0500 values ('logistics_confirm_proceed_request(uuid, uuid)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'logistics_confirm_proceed_request(uuid, uuid)';
  end if;
end
$g0500$;

-- logistics_dispatch_customer_leg(uuid, uuid, date, boolean)
--   source: repo 0051_logistics_rpcs_chunk2.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.logistics_dispatch_customer_leg(uuid, uuid, date, boolean)'); h text;
begin
  if p is null then insert into _g0500 values ('logistics_dispatch_customer_leg(uuid, uuid, date, boolean)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'b3182d0c9676ac4f7e1669e0b2bb5075' then
    execute $s0500a$
CREATE OR REPLACE FUNCTION public.logistics_dispatch_customer_leg(
  p_thread_id            uuid,
  p_partner_id           uuid,
  p_confirm_delivery_date date,
  p_force_dispatch       boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_thread       order_supplier_threads;
  v_role         app_role;
  v_actor        text;
  v_po_id        text;
BEGIN
  v_role := public.app_role();

  IF (v_role is null or v_role NOT IN ('logistics', 'principal')) THEN
    RAISE EXCEPTION 'forbidden: logistics or principal only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  -- Lock thread row.
  SELECT * INTO v_thread FROM order_supplier_threads WHERE id = p_thread_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'thread not found' USING ERRCODE = '42P01', DETAIL = 'thread_not_found';
  END IF;

  -- Validate partner exists.
  IF NOT EXISTS (SELECT 1 FROM delivery_partners WHERE id = p_partner_id) THEN
    RAISE EXCEPTION 'delivery_partner not found' USING ERRCODE = '42P01', DETAIL = 'partner_not_found';
  END IF;

  -- State guard: thread must be ready_to_dispatch.
  IF v_thread.logistics_stage IS DISTINCT FROM 'ready_to_dispatch' THEN
    RAISE EXCEPTION 'thread is not in ready_to_dispatch (got %)', v_thread.logistics_stage
      USING ERRCODE = '22023', DETAIL = 'wrong_stage';
  END IF;

  v_actor := COALESCE((SELECT name FROM app_users WHERE id = (SELECT auth.uid())), INITCAP(v_role::text));
  v_po_id := v_thread.po_id;  -- may be NULL on edge cases; po_history insert is gated below.

  IF p_force_dispatch THEN
    -- Force path: skip RFD, advance thread immediately to 'dispatched'.
    UPDATE order_supplier_threads
       SET delivery_partner_id    = p_partner_id,
           confirm_delivery_date  = p_confirm_delivery_date,
           partner_accepted_at    = now(),
           partner_rejected_at    = NULL,
           request_for_delivery_at = NULL,  -- not an RFD path
           logistics_stage        = 'dispatched',
           updated_at             = now()
     WHERE id = p_thread_id;

    IF v_po_id IS NOT NULL THEN
      INSERT INTO po_history (po_id, text, by_role)
      VALUES (v_po_id,
              format('Force-dispatched thread %s to LP %s on %s',
                     p_thread_id, p_partner_id, p_confirm_delivery_date),
              v_role);
    END IF;

    INSERT INTO audit_log (role, actor_text, action, ref)
    VALUES (v_role, v_actor,
            format('Force-dispatch thread %s to LP %s', p_thread_id, p_partner_id),
            COALESCE(v_po_id, p_thread_id::text));

    RETURN jsonb_build_object(
      'thread_id',             p_thread_id,
      'po_id',                 v_po_id,
      'mode',                  'force',
      'partner_id',            p_partner_id,
      'confirm_delivery_date', p_confirm_delivery_date,
      'logistics_stage',       'dispatched'
    );
  ELSE
    -- RFD path: set timestamp, thread stays at ready_to_dispatch.
    UPDATE order_supplier_threads
       SET delivery_partner_id    = p_partner_id,
           confirm_delivery_date  = p_confirm_delivery_date,
           request_for_delivery_at = now(),
           partner_accepted_at    = NULL,
           partner_rejected_at    = NULL,
           updated_at             = now()
     WHERE id = p_thread_id;

    IF v_po_id IS NOT NULL THEN
      INSERT INTO po_history (po_id, text, by_role)
      VALUES (v_po_id,
              format('RFD sent on thread %s to LP %s for %s',
                     p_thread_id, p_partner_id, p_confirm_delivery_date),
              v_role);
    END IF;

    INSERT INTO audit_log (role, actor_text, action, ref)
    VALUES (v_role, v_actor,
            format('RFD thread %s -> LP %s', p_thread_id, p_partner_id),
            COALESCE(v_po_id, p_thread_id::text));

    RETURN jsonb_build_object(
      'thread_id',             p_thread_id,
      'po_id',                 v_po_id,
      'mode',                  'rfd',
      'partner_id',            p_partner_id,
      'confirm_delivery_date', p_confirm_delivery_date,
      'rfd_sent_at',           now(),
      'logistics_stage',       v_thread.logistics_stage
    );
  END IF;
END;
$$
$s0500a$;
    insert into _g0500 values ('logistics_dispatch_customer_leg(uuid, uuid, date, boolean)', 'rewritten');
  elsif h in ('58f549f6866cf26461c0c10fe0bb07de') then insert into _g0500 values ('logistics_dispatch_customer_leg(uuid, uuid, date, boolean)', 'already');
  else insert into _g0500 values ('logistics_dispatch_customer_leg(uuid, uuid, date, boolean)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'logistics_dispatch_customer_leg(uuid, uuid, date, boolean)';
  end if;
end
$g0500$;

-- logistics_receive_po_with_do(text, text, text, jsonb)
--   source: repo 0120_receive_po_partial_thread_gate.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.logistics_receive_po_with_do(text, text, text, jsonb)'); h text;
begin
  if p is null then insert into _g0500 values ('logistics_receive_po_with_do(text, text, text, jsonb)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '9c4e783ff427404d103868b3dd4f5a9f' then
    execute $s0500a$
create or replace function public.logistics_receive_po_with_do(
  p_po_id        text,
  p_do_file_path text,
  p_do_number    text,
  p_lines        jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_po                 purchase_orders;
  v_role               app_role;
  v_uid                uuid;
  v_actor              text;
  v_was_relocated      boolean;
  v_line               jsonb;
  v_line_id            uuid;
  v_received_qty       int;
  v_existing_line      purchase_order_lines;
  v_sku                text;
  v_delta              int;
  v_lines_updated      int := 0;
  v_thread             record;
  v_target_thread_stage logistics_stage;
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

  if (v_role is null or v_role not in ('logistics', 'principal', 'partner')) then
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

  -- 0076: per-line update keys by `id`.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_line_id := nullif(v_line->>'id', '')::uuid;
    v_received_qty := nullif(v_line->>'received_qty', '')::int;

    if v_line_id is null or v_received_qty is null or v_received_qty < 0 then
      raise exception 'invalid line: id=%, received_qty=%', v_line_id, v_received_qty
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

    v_delta := v_received_qty - v_existing_line.received_qty;
    if v_delta < 0 then
      raise exception 'received_qty must be >= currently received (%)', v_existing_line.received_qty
        using errcode = 'P0001', detail = 'received_qty_decrease';
    end if;

    update purchase_order_lines set received_qty = v_received_qty
     where id = v_line_id;

    if v_delta > 0 then
      insert into stock_balances (sku, warehouse_id, qty)
        values (v_sku, v_po.warehouse_id, v_delta)
        on conflict (sku, warehouse_id)
        do update set qty = stock_balances.qty + v_delta, updated_at = now();

      insert into stock_movements (sku, warehouse_id, qty, kind, ref, by_role, by_user_id)
      values (v_sku, v_po.warehouse_id, v_delta, 'in', p_po_id, v_role, v_uid);

      v_lines_updated := v_lines_updated + 1;
    end if;
  end loop;

  -- 2026-05-17 (Bug B fix) — partial-receive aware thread advance. A thread
  -- is advanced only when EVERY PO line the thread's order needs (filtered
  -- by supplier_id + category) has been fully received post-update. Threads
  -- whose required lines are still short stay at awaiting_logistics_action.
  for v_thread in
    select * from order_supplier_threads
     where po_id = p_po_id and logistics_stage = 'awaiting_logistics_action'
  loop
    -- Per-thread satisfaction: do all SKUs this thread needs have a
    -- corresponding PO line with received_qty >= qty?
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
      continue;  -- thread waits for next receive
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
       set logistics_stage = v_target_thread_stage,
           warehouse_id    = v_po.warehouse_id,
           reserved_at     = now(),
           updated_at      = now()
     where id = v_thread.id;

    v_threads_advanced := v_threads_advanced + 1;

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
  end loop;

  -- sup_status branching: fully received → 'delivered' / 'at_warehouse_waiting';
  -- partial → keep current sup_status (caller side controls partially_shipped).
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
          format('Received with DO %s (%s path) — %s line(s), %s thread(s)',
                 btrim(p_do_number),
                 case when v_was_relocated then 'relocated→at_warehouse_waiting' else 'normal→delivered' end,
                 v_lines_updated, v_threads_advanced),
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
    'was_relocated',     v_was_relocated
  );
end;
$$
$s0500a$;
    insert into _g0500 values ('logistics_receive_po_with_do(text, text, text, jsonb)', 'rewritten');
  elsif h in ('89dc3155ac4ac0dab33c7d206186ea7a') then insert into _g0500 values ('logistics_receive_po_with_do(text, text, text, jsonb)', 'already');
  else insert into _g0500 values ('logistics_receive_po_with_do(text, text, text, jsonb)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'logistics_receive_po_with_do(text, text, text, jsonb)';
  end if;
end
$g0500$;

-- logistics_receive_threads(text, uuid[], text, text, text)
--   source: repo 0108_supplier_thread_pickup_fixes.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.logistics_receive_threads(text, uuid[], text, text, text)'); h text;
begin
  if p is null then insert into _g0500 values ('logistics_receive_threads(text, uuid[], text, text, text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '067e1c69414a26730813ceee0d31cc29' then
    execute $s0500a$
CREATE OR REPLACE FUNCTION public.logistics_receive_threads(
  p_po_id        text,
  p_thread_ids   uuid[],
  p_do_number    text,
  p_do_file_path text,
  p_do_note      text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_po           purchase_orders;
  v_actor_uid    uuid;
  v_event_id     uuid;
  v_thread_count int;
  v_remaining    int;
  v_new_sup_status po_sup_status;
BEGIN
  v_actor_uid  := (SELECT auth.uid());

  IF (public.app_role() is null or public.app_role() <> 'logistics') THEN
    RAISE EXCEPTION 'forbidden: logistics role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  IF p_do_number IS NULL OR length(btrim(p_do_number)) < 3 THEN
    RAISE EXCEPTION 'DO number must be at least 3 characters'
      USING ERRCODE = 'P0001', DETAIL = 'do_required';
  END IF;
  IF p_do_file_path IS NULL OR btrim(p_do_file_path) = '' THEN
    RAISE EXCEPTION 'DO file path required'
      USING ERRCODE = '22023', DETAIL = 'do_file_required';
  END IF;
  IF array_length(p_thread_ids, 1) IS NULL OR array_length(p_thread_ids, 1) = 0 THEN
    RAISE EXCEPTION 'at least one thread required'
      USING ERRCODE = '22023', DETAIL = 'empty_threads';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found' USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;

  SELECT count(*) INTO v_thread_count
    FROM order_supplier_threads
   WHERE id = ANY(p_thread_ids)
     AND po_id = p_po_id
     AND supplier_ready_at IS NOT NULL
     AND pickup_event_id IS NULL
   FOR UPDATE;
  IF v_thread_count <> array_length(p_thread_ids, 1) THEN
    RAISE EXCEPTION 'one or more threads ineligible'
      USING ERRCODE = '22023', DETAIL = 'ineligible_thread';
  END IF;

  INSERT INTO po_pickup_events (po_id, do_number, do_file_path, do_note, picked_up_at, picked_up_by, ack_role)
  VALUES (p_po_id, btrim(p_do_number), btrim(p_do_file_path), nullif(btrim(coalesce(p_do_note, '')), ''),
          now(), v_actor_uid, 'logistics')
  RETURNING id INTO v_event_id;

  -- F1 fix: own_logistics receive lands goods at WH awaiting customer-leg dispatch.
  -- Always 'ready_to_dispatch' (no SOFA_SPECIAL branch because own_logistics
  -- by definition routes goods through the warehouse, not direct-to-customer).
  UPDATE order_supplier_threads
     SET pickup_event_id = v_event_id,
         logistics_stage = 'ready_to_dispatch'::logistics_stage,
         updated_at      = now()
   WHERE id = ANY(p_thread_ids);

  SELECT count(*) INTO v_remaining
    FROM order_supplier_threads
   WHERE po_id = p_po_id AND pickup_event_id IS NULL;

  -- F3 fix: terminal converges to 'delivered' (consistency with
  -- logistics_receive_po_with_do); intermediate stays 'partially_shipped'.
  IF v_remaining = 0 THEN
    v_new_sup_status := 'delivered';
  ELSE
    v_new_sup_status := 'partially_shipped';
  END IF;
  UPDATE purchase_orders SET sup_status = v_new_sup_status, updated_at = now()
    WHERE id = p_po_id;

  INSERT INTO po_history (po_id, text, by_role, by_user_id)
  VALUES (p_po_id,
          format('Logistics received %s thread(s) · DO %s · sup_status → %s',
                 v_thread_count, btrim(p_do_number), v_new_sup_status),
          'logistics', v_actor_uid);

  RETURN jsonb_build_object(
    'pickup_event_id', v_event_id,
    'thread_count', v_thread_count,
    'po_sup_status', v_new_sup_status
  );
END;
$$
$s0500a$;
    insert into _g0500 values ('logistics_receive_threads(text, uuid[], text, text, text)', 'rewritten');
  elsif h in ('b4d1c3b742c8785d77733175f89a3fc8') then insert into _g0500 values ('logistics_receive_threads(text, uuid[], text, text, text)', 'already');
  else insert into _g0500 values ('logistics_receive_threads(text, uuid[], text, text, text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'logistics_receive_threads(text, uuid[], text, text, text)';
  end if;
end
$g0500$;

-- logistics_relocate_warehouse(text, uuid)
--   source: repo 0053_logistics_rpcs_chunk2_part2.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.logistics_relocate_warehouse(text, uuid)'); h text;
begin
  if p is null then insert into _g0500 values ('logistics_relocate_warehouse(text, uuid)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '940e23f97da12ace31fea0c841d9fdf9' then
    execute $s0500a$
CREATE OR REPLACE FUNCTION public.logistics_relocate_warehouse(
  p_po_id            text,
  p_new_warehouse_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_po                       purchase_orders;
  v_role                     app_role;
  v_actor                    text;
  v_new_owning_partner       uuid;
  v_new_procurement_partner  uuid;
BEGIN
  v_role := public.app_role();

  IF (v_role is null or v_role NOT IN ('logistics', 'principal')) THEN
    RAISE EXCEPTION 'forbidden: logistics or principal only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found' USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;

  -- State guard: pre-receive only.
  IF v_po.sup_status IS DISTINCT FROM 'customer_rejected' THEN
    RAISE EXCEPTION 'PO not in customer_rejected state (got %)', v_po.sup_status
      USING ERRCODE = '22023', DETAIL = 'wrong_sup_status';
  END IF;

  -- Lookup new wh owning partner.
  SELECT owning_partner_id INTO v_new_owning_partner
    FROM warehouses WHERE id = p_new_warehouse_id;
  IF v_new_owning_partner IS NULL AND NOT EXISTS (SELECT 1 FROM warehouses WHERE id = p_new_warehouse_id) THEN
    RAISE EXCEPTION 'warehouse not found' USING ERRCODE = '42P01', DETAIL = 'warehouse_not_found';
  END IF;

  -- F9 invariant: keep current procurement_partner_id when new wh is own_wh (NULL owning_partner).
  v_new_procurement_partner := COALESCE(v_new_owning_partner, v_po.procurement_partner_id);

  v_actor := COALESCE((SELECT name FROM app_users WHERE id = (SELECT auth.uid())), INITCAP(v_role::text));

  UPDATE purchase_orders
     SET warehouse_id            = p_new_warehouse_id,
         sup_status              = 'relocated',
         procurement_partner_id  = v_new_procurement_partner,
         updated_at              = now()
   WHERE id = p_po_id;

  INSERT INTO po_history (po_id, text, by_role)
  VALUES (p_po_id,
          format('Logistics relocated PO to wh %s (procurement_partner_id %s)',
                 p_new_warehouse_id,
                 CASE WHEN v_new_procurement_partner IS DISTINCT FROM v_po.procurement_partner_id
                      THEN 'reassigned' ELSE 'kept' END),
          v_role);

  INSERT INTO audit_log (role, actor_text, action, ref)
  VALUES (v_role, v_actor,
          format('Relocate PO %s -> wh %s', p_po_id, p_new_warehouse_id), p_po_id);

  RETURN jsonb_build_object(
    'po_id',                       p_po_id,
    'sup_status',                  'relocated',
    'new_warehouse_id',            p_new_warehouse_id,
    'new_procurement_partner_id',  v_new_procurement_partner,
    'lp_reassigned',               v_new_procurement_partner IS DISTINCT FROM v_po.procurement_partner_id
  );
END;
$$
$s0500a$;
    insert into _g0500 values ('logistics_relocate_warehouse(text, uuid)', 'rewritten');
  elsif h in ('426dc6064dd91cdda8d3ea7a7632d10f') then insert into _g0500 values ('logistics_relocate_warehouse(text, uuid)', 'already');
  else insert into _g0500 values ('logistics_relocate_warehouse(text, uuid)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'logistics_relocate_warehouse(text, uuid)';
  end if;
end
$g0500$;

-- logistics_resume_dispatch_from_waiting(uuid)
--   source: repo 0051_logistics_rpcs_chunk2.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.logistics_resume_dispatch_from_waiting(uuid)'); h text;
begin
  if p is null then insert into _g0500 values ('logistics_resume_dispatch_from_waiting(uuid)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'a400085098493f8f6fd2627714081623' then
    execute $s0500a$
CREATE OR REPLACE FUNCTION public.logistics_resume_dispatch_from_waiting(p_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_thread             order_supplier_threads;
  v_role               app_role;
  v_actor              text;
  v_remaining_waiting  int;
  v_po_rows_changed    int := 0;
  v_po_status_changed  boolean := false;
BEGIN
  v_role := public.app_role();

  IF (v_role is null or v_role NOT IN ('logistics', 'principal')) THEN
    RAISE EXCEPTION 'forbidden: logistics or principal only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  -- Lock thread row.
  SELECT * INTO v_thread FROM order_supplier_threads WHERE id = p_thread_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'thread not found' USING ERRCODE = '42P01', DETAIL = 'thread_not_found';
  END IF;

  -- State guard: must be waiting.
  IF v_thread.logistics_stage IS DISTINCT FROM 'waiting' THEN
    RAISE EXCEPTION 'thread is not in waiting (got %)', v_thread.logistics_stage
      USING ERRCODE = '22023', DETAIL = 'wrong_stage';
  END IF;

  v_actor := COALESCE((SELECT name FROM app_users WHERE id = (SELECT auth.uid())), INITCAP(v_role::text));

  -- Resume thread: waiting -> ready_to_dispatch.
  UPDATE order_supplier_threads
     SET logistics_stage = 'ready_to_dispatch',
         updated_at      = now()
   WHERE id = p_thread_id;

  -- Conditionally flip PO sup_status. We do this only when no sibling threads
  -- on the same PO remain in 'waiting' AND the PO is still
  -- 'at_warehouse_waiting'. This preserves the Chunk-1 single-thread Sofa-only
  -- behaviour without breaking future multi-thread orders.
  IF v_thread.po_id IS NOT NULL THEN
    SELECT count(*) INTO v_remaining_waiting
      FROM order_supplier_threads
     WHERE po_id = v_thread.po_id
       AND logistics_stage = 'waiting';

    IF v_remaining_waiting = 0 THEN
      UPDATE purchase_orders
         SET sup_status = 'delivered',
             updated_at = now()
       WHERE id = v_thread.po_id
         AND sup_status = 'at_warehouse_waiting';
      GET DIAGNOSTICS v_po_rows_changed = ROW_COUNT;
      v_po_status_changed := v_po_rows_changed > 0;
    END IF;

    INSERT INTO po_history (po_id, text, by_role)
    VALUES (v_thread.po_id,
            format('Resume from at_warehouse_waiting — thread %s back to ready_to_dispatch%s',
                   p_thread_id,
                   CASE WHEN v_po_status_changed
                        THEN '; PO sup_status -> delivered'
                        ELSE '' END),
            v_role);
  END IF;

  INSERT INTO order_history (order_id, text, by_role)
  VALUES (v_thread.order_id,
          format('Resume thread %s from waiting%s',
                 p_thread_id,
                 CASE WHEN v_po_status_changed
                      THEN ' (PO sup_status restored to delivered)'
                      ELSE '' END),
          v_role);

  INSERT INTO audit_log (role, actor_text, action, ref)
  VALUES (v_role, v_actor,
          format('Resume thread %s from waiting', p_thread_id),
          COALESCE(v_thread.po_id, p_thread_id::text));

  RETURN jsonb_build_object(
    'thread_id',         p_thread_id,
    'order_id',          v_thread.order_id,
    'po_id',             v_thread.po_id,
    'logistics_stage',   'ready_to_dispatch',
    'po_status_changed', v_po_status_changed
  );
END;
$$
$s0500a$;
    insert into _g0500 values ('logistics_resume_dispatch_from_waiting(uuid)', 'rewritten');
  elsif h in ('66986cae729fd4bf04e257cecb9291a5') then insert into _g0500 values ('logistics_resume_dispatch_from_waiting(uuid)', 'already');
  else insert into _g0500 values ('logistics_resume_dispatch_from_waiting(uuid)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'logistics_resume_dispatch_from_waiting(uuid)';
  end if;
end
$g0500$;

-- logistics_revert_order_dispatched_to_ready(uuid)
--   source: repo 0095_revert_state_rpcs.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.logistics_revert_order_dispatched_to_ready(uuid)'); h text;
begin
  if p is null then insert into _g0500 values ('logistics_revert_order_dispatched_to_ready(uuid)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '5c6660a4f7bdeb1fd633418aa1bcfad1' then
    execute $s0500a$
create or replace function public.logistics_revert_order_dispatched_to_ready(
  p_order_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_role             app_role;
  v_uid              uuid;
  v_actor            text;
  v_dl               int;
  v_threads_reverted int;
begin
  v_role := public.app_role();
  v_uid := (select auth.uid());

  if (v_role is null or v_role not in ('logistics', 'principal')) then
    raise exception 'forbidden: logistics or principal only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  select dl into v_dl from orders where id = p_order_id for update;
  if v_dl is null then
    raise exception 'Order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  -- Revert every dispatched thread on this order. Clears the partner
  -- assignment that logistics_assign_partner (0086) wrote — partner_id,
  -- confirm_delivery_date, partner_accepted_at, request_for_delivery_at.
  -- Leaves orders.warehouse_id alone (informational; the goods are still at
  -- the same WH and another LP assignment will rewrite delivery date anyway).
  update order_supplier_threads
     set logistics_stage         = 'ready_to_dispatch',
         delivery_partner_id     = null,
         confirm_delivery_date   = null,
         partner_accepted_at     = null,
         partner_rejected_at     = null,
         request_for_delivery_at = null,
         updated_at              = now()
   where order_id        = p_order_id
     and logistics_stage = 'dispatched';
  get diagnostics v_threads_reverted = row_count;

  if v_threads_reverted = 0 then
    raise exception 'No dispatched threads on this order'
      using errcode = '22023', detail = 'no_dispatched_threads';
  end if;

  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('Reverted order #%s · Dispatched → Ready to Dispatch (%s thread(s))',
                 v_dl, v_threads_reverted),
          p_order_id::text);

  return jsonb_build_object(
    'order_id',         p_order_id,
    'dl',               v_dl,
    'threads_reverted', v_threads_reverted
  );
end;
$$
$s0500a$;
    insert into _g0500 values ('logistics_revert_order_dispatched_to_ready(uuid)', 'rewritten');
  elsif h in ('f84a3a55b6ed1509fcce493f7492b48d') then insert into _g0500 values ('logistics_revert_order_dispatched_to_ready(uuid)', 'already');
  else insert into _g0500 values ('logistics_revert_order_dispatched_to_ready(uuid)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'logistics_revert_order_dispatched_to_ready(uuid)';
  end if;
end
$g0500$;

-- logistics_revert_order_proceed_to_placed(uuid)
--   source: repo 0095_revert_state_rpcs.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.logistics_revert_order_proceed_to_placed(uuid)'); h text;
begin
  if p is null then insert into _g0500 values ('logistics_revert_order_proceed_to_placed(uuid)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '0c8178ed1c54552eccb1cef762beb577' then
    execute $s0500a$
create or replace function public.logistics_revert_order_proceed_to_placed(
  p_order_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_role  app_role;
  v_uid   uuid;
  v_actor text;
  v_order orders;
begin
  v_role := public.app_role();
  v_uid := (select auth.uid());

  if (v_role is null or v_role not in ('logistics', 'principal')) then
    raise exception 'forbidden: logistics or principal only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  -- Only allow revert from the proceed step. We check logistics_stage because
  -- LogisticsOrders.tsx stageOf() shows the kanban column by that column when
  -- status is not 'place'. status will also be 'proceed_order' in this state
  -- (set together by 0024 proceed_order RPC).
  if v_order.logistics_stage is distinct from 'proceed_request' then
    raise exception 'Order is not in proceed_request stage (got logistics_stage=%, status=%)',
                    v_order.logistics_stage, v_order.status
      using errcode = '22023', detail = 'wrong_stage';
  end if;

  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));

  update orders
     set status          = 'place',
         logistics_stage = 'placed',
         updated_at      = now()
   where id = p_order_id;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('Reverted order #%s · Proceed Request → Placed', v_order.dl),
          p_order_id::text);

  return jsonb_build_object(
    'order_id',        p_order_id,
    'dl',              v_order.dl,
    'status',          'place',
    'logistics_stage', 'placed'
  );
end;
$$
$s0500a$;
    insert into _g0500 values ('logistics_revert_order_proceed_to_placed(uuid)', 'rewritten');
  elsif h in ('3e9f3f11ca6c712037b7283ef6ffea78') then insert into _g0500 values ('logistics_revert_order_proceed_to_placed(uuid)', 'already');
  else insert into _g0500 values ('logistics_revert_order_proceed_to_placed(uuid)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'logistics_revert_order_proceed_to_placed(uuid)';
  end if;
end
$g0500$;

-- logistics_stock_alerts()
--   source: repo 0054_stock_balances_thresholds.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.logistics_stock_alerts()'); h text;
begin
  if p is null then insert into _g0500 values ('logistics_stock_alerts()', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '852e80c2c3b7db08d85aff8396677679' then
    execute $s0500a$
create or replace function public.logistics_stock_alerts()
returns table (
  sku           text,
  warehouse_id  uuid,
  qty           int,
  reserved      int,
  effective     int,
  low_threshold int,
  shortage      int
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role app_role;
begin
  v_role := public.app_role();

  if (v_role is null or v_role not in ('logistics', 'principal')) then
    raise exception 'forbidden: logistics or principal only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  return query
    select sb.sku,
           sb.warehouse_id,
           sb.qty,
           sb.reserved,
           (sb.qty - sb.reserved)::int                 as effective,
           sb.low_threshold,
           (sb.low_threshold - (sb.qty - sb.reserved))::int as shortage
      from stock_balances sb
     where sb.low_threshold is not null
       and (sb.qty - sb.reserved) < sb.low_threshold
     order by (sb.low_threshold - (sb.qty - sb.reserved)) desc,
              sb.sku asc;
end;
$$
$s0500a$;
    insert into _g0500 values ('logistics_stock_alerts()', 'rewritten');
  elsif h in ('8535795d289f1dd73692d108ef85f82d') then insert into _g0500 values ('logistics_stock_alerts()', 'already');
  else insert into _g0500 values ('logistics_stock_alerts()', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'logistics_stock_alerts()';
  end if;
end
$g0500$;

-- logistics_supplier_ready_confirm(text)
--   source: repo 0034_logistics_rpcs_v3.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.logistics_supplier_ready_confirm(text)'); h text;
begin
  if p is null then insert into _g0500 values ('logistics_supplier_ready_confirm(text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '5f95f7490ed2e26da28bbdf28f591717' then
    execute $s0500a$
create or replace function public.logistics_supplier_ready_confirm(p_po_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_po       purchase_orders;
  v_role     app_role;
  v_supplier_id uuid;
  v_actor    text;
begin
  v_role := public.app_role();
  v_supplier_id := public.app_supplier_id();

  -- Role gate: logistics OR supplier (where supplier owns this PO).
  if (v_role is null or v_role not in ('logistics', 'supplier')) then
    raise exception 'forbidden: logistics or supplier only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  -- 1. Lock PO row.
  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO not found'
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  -- Cross-supplier guard: a supplier role caller can only press for their
  -- own PO. Logistics bypasses this check.
  if v_role = 'supplier' then
    if v_supplier_id is null or v_po.supplier_id is distinct from v_supplier_id then
      raise exception 'forbidden: cross-supplier ready-confirm'
        using errcode = '42501', detail = 'forbidden';
    end if;
  end if;

  -- 2. State guard. Spec §4.4: valid sources are sup_status in
  --    ('pending', 'acknowledged', 'in_production').
  if v_po.sup_status not in ('pending', 'acknowledged', 'in_production') then
    raise exception 'PO is not in a state to ready-confirm (got %)', v_po.sup_status
      using errcode = '22023', detail = 'wrong_sup_status';
  end if;

  v_actor := coalesce((select name from app_users where id = (select auth.uid())),
                      initcap(v_role::text));

  -- 3. Mutate.
  update purchase_orders
     set sup_status       = 'ready_confirm_sent',
         ready_confirm_at = now(),
         updated_at       = now()
   where id = p_po_id;

  -- 4. Audit + history.
  insert into po_history (po_id, text, by_role)
  values (
    p_po_id,
    case when v_role = 'logistics'
         then 'Ready-confirm sent (logistics 代按)'
         else 'Ready-confirm sent (supplier self-press)'
    end,
    v_role
  );

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('Ready-confirm sent on PO %s', p_po_id),
          p_po_id);

  return jsonb_build_object(
    'po_id',            p_po_id,
    'sup_status',       'ready_confirm_sent',
    'ready_confirm_at', now()
  );
end;
$$
$s0500a$;
    insert into _g0500 values ('logistics_supplier_ready_confirm(text)', 'rewritten');
  elsif h in ('c3794b9de8e3c4830977a53f8bfd38ef') then insert into _g0500 values ('logistics_supplier_ready_confirm(text)', 'already');
  else insert into _g0500 values ('logistics_supplier_ready_confirm(text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'logistics_supplier_ready_confirm(text)';
  end if;
end
$g0500$;

-- lp_accept_inbound_delivery(text)
--   source: repo 0053_logistics_rpcs_chunk2_part2.sql; 1 gate edit(s)
--   source: live definition (dynamic renames applied); 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.lp_accept_inbound_delivery(text)'); h text;
begin
  if p is null then insert into _g0500 values ('lp_accept_inbound_delivery(text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'a36b48ff1ec3cbaf2ee70b90b72b2c64' then
    execute $s0500a$
CREATE OR REPLACE FUNCTION public.lp_accept_inbound_delivery(p_po_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_po         purchase_orders;
  v_role       app_role;
  v_partner_id uuid;
  v_actor      text;
BEGIN
  v_role := public.app_role();
  v_partner_id := public.app_partner_id();

  IF (v_role is null or v_role NOT IN ('partner', 'logistics', 'principal')) THEN
    RAISE EXCEPTION 'forbidden: partner or logistics only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found' USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;

  -- Cross-tenant guard for partner caller only.
  IF v_role = 'partner' AND v_po.procurement_partner_id IS DISTINCT FROM v_partner_id THEN
    RAISE EXCEPTION 'forbidden: cross-partner accept'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  -- State guard: must be in pre-flight ready_confirm_sent.
  IF v_po.sup_status IS DISTINCT FROM 'ready_confirm_sent' THEN
    RAISE EXCEPTION 'PO not in ready_confirm_sent state (got %)', v_po.sup_status
      USING ERRCODE = '22023', DETAIL = 'wrong_sup_status';
  END IF;

  v_actor := COALESCE((SELECT name FROM app_users WHERE id = (SELECT auth.uid())), INITCAP(v_role::text));

  -- Mutate PO ONLY. Threads stay at awaiting_logistics_action until Receive.
  UPDATE purchase_orders
     SET sup_status            = 'partner_confirmed',
         partner_confirmed_at  = now(),
         updated_at            = now()
   WHERE id = p_po_id;

  INSERT INTO po_history (po_id, text, by_role)
  VALUES (p_po_id, 'LP accepted inbound pre-flight (no thread change yet)', v_role);

  INSERT INTO audit_log (role, actor_text, action, ref)
  VALUES (v_role, v_actor,
          format('LP accepted inbound pre-flight for PO %s', p_po_id), p_po_id);

  RETURN jsonb_build_object(
    'po_id',                p_po_id,
    'sup_status',           'partner_confirmed',
    'partner_confirmed_at', now()
  );
END;
$$
$s0500a$;
    insert into _g0500 values ('lp_accept_inbound_delivery(text)', 'rewritten');
  elsif h = '953e6917bb3d23714a3287904ce81d52' then
    execute $s0500b$
CREATE OR REPLACE FUNCTION public.lp_accept_inbound_delivery(p_po_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_po         purchase_orders;
  v_role       app_role;
  v_partner_id uuid;
  v_actor      text;
BEGIN
  v_role := public.app_role();
  v_partner_id := public.app_partner_id();

  IF (v_role is null or v_role NOT IN ('partner', 'operation', 'principal')) THEN
    RAISE EXCEPTION 'forbidden: partner or logistics only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found' USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;

  -- Cross-tenant guard for partner caller only.
  IF v_role = 'partner' AND v_po.procurement_partner_id IS DISTINCT FROM v_partner_id THEN
    RAISE EXCEPTION 'forbidden: cross-partner accept'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  -- State guard: must be in pre-flight ready_confirm_sent.
  IF v_po.sup_status IS DISTINCT FROM 'ready_confirm_sent' THEN
    RAISE EXCEPTION 'PO not in ready_confirm_sent state (got %)', v_po.sup_status
      USING ERRCODE = '22023', DETAIL = 'wrong_sup_status';
  END IF;

  v_actor := COALESCE((SELECT name FROM app_users WHERE id = (SELECT auth.uid())), INITCAP(v_role::text));

  -- Mutate PO ONLY. Threads stay at awaiting_logistics_action until Receive.
  UPDATE purchase_orders
     SET sup_status            = 'partner_confirmed',
         partner_confirmed_at  = now(),
         updated_at            = now()
   WHERE id = p_po_id;

  INSERT INTO po_history (po_id, text, by_role)
  VALUES (p_po_id, 'LP accepted inbound pre-flight (no thread change yet)', v_role);

  INSERT INTO audit_log (role, actor_text, action, ref)
  VALUES (v_role, v_actor,
          format('LP accepted inbound pre-flight for PO %s', p_po_id), p_po_id);

  RETURN jsonb_build_object(
    'po_id',                p_po_id,
    'sup_status',           'partner_confirmed',
    'partner_confirmed_at', now()
  );
END;
$function$
$s0500b$;
    insert into _g0500 values ('lp_accept_inbound_delivery(text)', 'rewritten');
  elsif h in ('f3623a484acf7c28433baf301f274bd0', 'ef92efaa63d0d9c3117480fea2ba8d06') then insert into _g0500 values ('lp_accept_inbound_delivery(text)', 'already');
  else insert into _g0500 values ('lp_accept_inbound_delivery(text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'lp_accept_inbound_delivery(text)';
  end if;
end
$g0500$;

-- lp_accept_order(uuid)
--   source: repo 0147_lp_request_accept_reject.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.lp_accept_order(uuid)'); h text;
begin
  if p is null then insert into _g0500 values ('lp_accept_order(uuid)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'c2f5d9d396d7f457004b68815a737588' then
    execute $s0500a$
CREATE OR REPLACE FUNCTION public.lp_accept_order(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role       app_role;
  v_partner_id uuid;
  v_actor      text;
  v_order      orders;
begin
  v_role       := public.app_role();
  v_partner_id := public.app_partner_id();

  if (v_role is null or v_role <> 'partner') then
    raise exception 'forbidden: partner only'
      using errcode = '42501', detail = 'forbidden';
  end if;
  if v_partner_id is null then
    raise exception 'no partner_id on JWT'
      using errcode = '42501', detail = 'no_partner_id';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  if v_order.delivery_partner_id is distinct from v_partner_id then
    raise exception 'forbidden: order is not assigned to this partner'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if v_order.request_for_delivery_at is null then
    raise exception 'order has no pending LP request'
      using errcode = '22023', detail = 'no_pending_request';
  end if;
  if v_order.partner_accepted_at is not null then
    raise exception 'order already accepted'
      using errcode = '22023', detail = 'already_accepted';
  end if;
  if v_order.partner_rejected_at is not null then
    raise exception 'order is in rejected state — Operation must reselect'
      using errcode = '22023', detail = 'order_rejected';
  end if;

  v_actor := coalesce((select name from app_users where id = (select auth.uid())), 'Partner');

  update orders
     set partner_accepted_at = now(),
         updated_at          = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role)
  values (p_order_id, format('LP accepted delivery · %s', v_actor), 'partner');

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('partner', v_actor,
          format('Accepted delivery for SO-%s', v_order.so),
          v_order.dealer_id, 'SO-' || v_order.so::text);

  return jsonb_build_object(
    'order_id',            v_order.id,
    'so',                  v_order.so,
    'partner_accepted_at', now()
  );
end;
$function$
$s0500a$;
    insert into _g0500 values ('lp_accept_order(uuid)', 'rewritten');
  elsif h in ('a229687bd4d28259e5a1179eee94ae94') then insert into _g0500 values ('lp_accept_order(uuid)', 'already');
  else insert into _g0500 values ('lp_accept_order(uuid)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'lp_accept_order(uuid)';
  end if;
end
$g0500$;

-- lp_reject_order(uuid, text)
--   source: repo 0152_auto_dispatch_and_reject_branch.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.lp_reject_order(uuid, text)'); h text;
begin
  if p is null then insert into _g0500 values ('lp_reject_order(uuid, text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'a2c08b06a9c66692496c1ae98ce176b1' then
    execute $s0500a$
CREATE OR REPLACE FUNCTION public.lp_reject_order(
  p_order_id uuid,
  p_reason   text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role         app_role;
  v_partner_id   uuid;
  v_actor        text;
  v_order        orders;
  v_reason       text;
  v_reverted     boolean := false;
begin
  v_role       := public.app_role();
  v_partner_id := public.app_partner_id();

  if (v_role is null or v_role <> 'partner') then
    raise exception 'forbidden: partner only'
      using errcode = '42501', detail = 'forbidden';
  end if;
  if v_partner_id is null then
    raise exception 'no partner_id on JWT'
      using errcode = '42501', detail = 'no_partner_id';
  end if;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'reject reason is required'
      using errcode = '22023', detail = 'reason_required';
  end if;
  if length(v_reason) > 500 then
    raise exception 'reject reason too long (% chars, max 500)', length(v_reason)
      using errcode = '22023', detail = 'reason_too_long';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  if v_order.delivery_partner_id is distinct from v_partner_id then
    raise exception 'forbidden: order is not assigned to this partner'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if v_order.request_for_delivery_at is null then
    raise exception 'order has no pending LP request'
      using errcode = '22023', detail = 'no_pending_request';
  end if;
  if v_order.partner_accepted_at is not null then
    raise exception 'order already accepted — cannot reject'
      using errcode = '22023', detail = 'already_accepted';
  end if;
  if v_order.partner_rejected_at is not null then
    raise exception 'order already rejected'
      using errcode = '22023', detail = 'already_rejected';
  end if;

  v_actor := coalesce((select name from app_users where id = (select auth.uid())), 'Partner');

  update orders
     set partner_rejected_at     = now(),
         partner_rejected_reason = v_reason,
         updated_at              = now()
   where id = p_order_id;

  -- C (Loo 2026-05-31) — branch on whether the goods are at the warehouse:
  --   A.3: order was auto-dispatched (goods at WH) → revert the order + its
  --        dispatched threads back to ready_to_dispatch so Operation reselects
  --        (operation_reselect_partner then re-auto-dispatches the new LP).
  --   A.4: order still awaiting_operation_action (goods not yet at WH) → leave
  --        the stage untouched; the reject flag alone bounces it to Operation.
  -- The 'lp_rejected' badge counter (operation_badge_counts) notifies Operation
  -- in both cases.
  if v_order.operation_stage = 'dispatched' then
    update order_supplier_threads
       set operation_stage     = 'ready_to_dispatch',
           delivery_partner_id = null,
           partner_accepted_at = null,
           updated_at          = now()
     where order_id = p_order_id
       and operation_stage = 'dispatched';

    update orders
       set operation_stage = 'ready_to_dispatch',
           dispatched_at   = null,
           updated_at      = now()
     where id = p_order_id;

    v_reverted := true;
  end if;

  insert into order_history (order_id, text, by_role)
  values (
    p_order_id,
    format('LP rejected delivery · %s · reason: %s%s', v_actor, v_reason,
           case when v_reverted
                then ' · goods at WH → reverted to ready_to_dispatch for reselect'
                else ' · awaiting stage unchanged' end),
    'partner'
  );

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('partner', v_actor,
          format('Rejected delivery for SO-%s · reason: %s', v_order.so, v_reason),
          v_order.dealer_id, 'SO-' || v_order.so::text);

  return jsonb_build_object(
    'order_id',                v_order.id,
    'so',                      v_order.so,
    'partner_rejected_at',     now(),
    'partner_rejected_reason', v_reason,
    'reverted_to_ready',       v_reverted
  );
end;
$function$
$s0500a$;
    insert into _g0500 values ('lp_reject_order(uuid, text)', 'rewritten');
  elsif h in ('ee2f093c01f66d53ef058c98fec334f0') then insert into _g0500 values ('lp_reject_order(uuid, text)', 'already');
  else insert into _g0500 values ('lp_reject_order(uuid, text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'lp_reject_order(uuid, text)';
  end if;
end
$g0500$;

-- operation_add_annotation(uuid, text, text)
--   source: repo 0138_order_annotations.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.operation_add_annotation(uuid, text, text)'); h text;
begin
  if p is null then insert into _g0500 values ('operation_add_annotation(uuid, text, text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'c7e6f2ed3e7f3803626a300984cdfbc5' then
    execute $s0500a$
CREATE OR REPLACE FUNCTION public.operation_add_annotation(
  p_order_id uuid,
  p_content  text,
  p_tag      text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role    text;
  v_user_id uuid;
  v_row     order_annotations;
BEGIN
  v_role    := (SELECT role FROM public.app_users WHERE id = auth.uid());
  v_user_id := auth.uid();

  IF (v_role is null or v_role NOT IN ('principal','operation','finance','bd')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_content IS NULL OR length(trim(p_content)) = 0 THEN
    RAISE EXCEPTION 'content required' USING ERRCODE = '22000';
  END IF;

  IF p_tag IS NOT NULL AND p_tag NOT IN ('follow_up','escalate','resolved') THEN
    RAISE EXCEPTION 'invalid tag: %. Must be follow_up, escalate or resolved', p_tag
      USING ERRCODE = '22000';
  END IF;

  INSERT INTO order_annotations (order_id, content, tag, created_by)
  VALUES (p_order_id, trim(p_content), p_tag, v_user_id)
  RETURNING * INTO v_row;

  -- auto-log so timeline stays unified
  INSERT INTO ops_activity_log (order_id, action, actor_id, detail)
  VALUES (
    p_order_id,
    'annotation_added',
    v_user_id,
    jsonb_build_object('tag', p_tag, 'preview', left(trim(p_content), 60))
  );

  RETURN row_to_json(v_row);
END;
$$
$s0500a$;
    insert into _g0500 values ('operation_add_annotation(uuid, text, text)', 'rewritten');
  elsif h in ('4834a26f4d337805150e2a0bfc152f5b') then insert into _g0500 values ('operation_add_annotation(uuid, text, text)', 'already');
  else insert into _g0500 values ('operation_add_annotation(uuid, text, text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'operation_add_annotation(uuid, text, text)';
  end if;
end
$g0500$;

-- operation_get_timeline(uuid)
--   source: repo 0138_order_annotations.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.operation_get_timeline(uuid)'); h text;
begin
  if p is null then insert into _g0500 values ('operation_get_timeline(uuid)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '0c8ac7ca85cbaf10c233db1b495e56c1' then
    execute $s0500a$
CREATE OR REPLACE FUNCTION public.operation_get_timeline(
  p_order_id uuid
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := (SELECT role FROM public.app_users WHERE id = auth.uid());

  IF (v_role is null or v_role NOT IN ('principal','operation','finance','bd')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT COALESCE(json_agg(t ORDER BY t.occurred_at DESC), '[]'::json)
    FROM (
      SELECT
        a.id::text               AS id,
        'annotation'::text       AS kind,
        a.content                AS content,
        a.tag                    AS tag,
        NULL::text               AS action,
        NULL::jsonb              AS detail,
        u.name                   AS actor_name,
        a.created_at             AS occurred_at
      FROM order_annotations a
      LEFT JOIN public.app_users u ON u.id = a.created_by
      WHERE a.order_id = p_order_id

      UNION ALL

      SELECT
        l.id::text               AS id,
        'activity'::text         AS kind,
        NULL::text               AS content,
        NULL::text               AS tag,
        l.action                 AS action,
        l.detail                 AS detail,
        u.name                   AS actor_name,
        l.occurred_at            AS occurred_at
      FROM ops_activity_log l
      LEFT JOIN public.app_users u ON u.id = l.actor_id
      WHERE l.order_id = p_order_id
    ) t
  );
END;
$$
$s0500a$;
    insert into _g0500 values ('operation_get_timeline(uuid)', 'rewritten');
  elsif h in ('6ab2cedacbf94a3031526133af3f249a') then insert into _g0500 values ('operation_get_timeline(uuid)', 'already');
  else insert into _g0500 values ('operation_get_timeline(uuid)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'operation_get_timeline(uuid)';
  end if;
end
$g0500$;

-- operation_receive_po_with_do(text, text, text, jsonb, uuid)
--   source: repo 0453_a_quantity_row_is_keyed_not_identified.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.operation_receive_po_with_do(text, text, text, jsonb, uuid)'); h text;
begin
  if p is null then insert into _g0500 values ('operation_receive_po_with_do(text, text, text, jsonb, uuid)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '1aaea6b0e8c19253c88f23558a31a9cc' then
    execute $s0500a$
create or replace function public.operation_receive_po_with_do(
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

  if (v_role is null or v_role not in ('operation', 'principal', 'partner')) then
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
$function$
$s0500a$;
    insert into _g0500 values ('operation_receive_po_with_do(text, text, text, jsonb, uuid)', 'rewritten');
  elsif h in ('353847b4eae361993e6972b77c9c8417') then insert into _g0500 values ('operation_receive_po_with_do(text, text, text, jsonb, uuid)', 'already');
  else insert into _g0500 values ('operation_receive_po_with_do(text, text, text, jsonb, uuid)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'operation_receive_po_with_do(text, text, text, jsonb, uuid)';
  end if;
end
$g0500$;

-- operation_receive_threads(text, uuid[], text, text, text)
--   source: repo 0152_auto_dispatch_and_reject_branch.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.operation_receive_threads(text, uuid[], text, text, text)'); h text;
begin
  if p is null then insert into _g0500 values ('operation_receive_threads(text, uuid[], text, text, text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'ec45d1a3881d25b50ed8ca09df079009' then
    execute $s0500a$
CREATE OR REPLACE FUNCTION public.operation_receive_threads(p_po_id text, p_thread_ids uuid[], p_do_number text, p_do_file_path text, p_do_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_po           purchase_orders;
  v_actor_uid    uuid;
  v_event_id     uuid;
  v_thread_count int;
  v_remaining    int;
  v_new_sup_status po_sup_status;
  v_oid          uuid;
BEGIN
  v_actor_uid  := (SELECT auth.uid());

  IF (public.app_role() is null or public.app_role() <> 'operation') THEN
    RAISE EXCEPTION 'forbidden: logistics role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  IF p_do_number IS NULL OR length(btrim(p_do_number)) < 3 THEN
    RAISE EXCEPTION 'DO number must be at least 3 characters'
      USING ERRCODE = 'P0001', DETAIL = 'do_required';
  END IF;
  IF p_do_file_path IS NULL OR btrim(p_do_file_path) = '' THEN
    RAISE EXCEPTION 'DO file path required'
      USING ERRCODE = '22023', DETAIL = 'do_file_required';
  END IF;
  IF array_length(p_thread_ids, 1) IS NULL OR array_length(p_thread_ids, 1) = 0 THEN
    RAISE EXCEPTION 'at least one thread required'
      USING ERRCODE = '22023', DETAIL = 'empty_threads';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found' USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;

  SELECT count(*) INTO v_thread_count
    FROM order_supplier_threads
   WHERE id = ANY(p_thread_ids)
     AND po_id = p_po_id
     AND supplier_ready_at IS NOT NULL
     AND pickup_event_id IS NULL
   FOR UPDATE;
  IF v_thread_count <> array_length(p_thread_ids, 1) THEN
    RAISE EXCEPTION 'one or more threads ineligible'
      USING ERRCODE = '22023', DETAIL = 'ineligible_thread';
  END IF;

  INSERT INTO po_pickup_events (po_id, do_number, do_file_path, do_note, picked_up_at, picked_up_by, ack_role)
  VALUES (p_po_id, btrim(p_do_number), btrim(p_do_file_path), nullif(btrim(coalesce(p_do_note, '')), ''),
          now(), v_actor_uid, 'operation')
  RETURNING id INTO v_event_id;

  -- F1 fix: own_logistics receive lands goods at WH awaiting customer-leg dispatch.
  -- Always 'ready_to_dispatch' (no SOFA_SPECIAL branch because own_logistics
  -- by definition routes goods through the warehouse, not direct-to-customer).
  UPDATE order_supplier_threads
     SET pickup_event_id = v_event_id,
         operation_stage = 'ready_to_dispatch'::operation_stage,
         updated_at      = now()
   WHERE id = ANY(p_thread_ids);

  SELECT count(*) INTO v_remaining
    FROM order_supplier_threads
   WHERE po_id = p_po_id AND pickup_event_id IS NULL;

  -- F3 fix: terminal converges to 'delivered' (consistency with
  -- operation_receive_po_with_do); intermediate stays 'partially_shipped'.
  IF v_remaining = 0 THEN
    v_new_sup_status := 'delivered';
  ELSE
    v_new_sup_status := 'partially_shipped';
  END IF;
  UPDATE purchase_orders SET sup_status = v_new_sup_status, updated_at = now()
    WHERE id = p_po_id;

  INSERT INTO po_history (po_id, text, by_role, by_user_id)
  VALUES (p_po_id,
          format('Logistics received %s thread(s) · DO %s · sup_status → %s',
                 v_thread_count, btrim(p_do_number), v_new_sup_status),
          'operation', v_actor_uid);

  -- B (Loo 2026-05-31): auto-dispatch any order whose goods are now all at the
  -- WH and which has a non-rejected pre-chosen customer-leg LP (no accept needed).
  FOR v_oid IN
    SELECT DISTINCT order_id FROM order_supplier_threads WHERE id = ANY(p_thread_ids)
  LOOP
    PERFORM public._operation_auto_dispatch_if_ready(v_oid);
  END LOOP;

  RETURN jsonb_build_object(
    'pickup_event_id', v_event_id,
    'thread_count', v_thread_count,
    'po_sup_status', v_new_sup_status
  );
END;
$function$
$s0500a$;
    insert into _g0500 values ('operation_receive_threads(text, uuid[], text, text, text)', 'rewritten');
  elsif h in ('a3a2071490f803a6a1a53e4269207953') then insert into _g0500 values ('operation_receive_threads(text, uuid[], text, text, text)', 'already');
  else insert into _g0500 values ('operation_receive_threads(text, uuid[], text, text, text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'operation_receive_threads(text, uuid[], text, text, text)';
  end if;
end
$g0500$;

-- operation_request_order_change(uuid, text, jsonb)
--   source: repo 0326_a_promise_is_never_moved_silently.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.operation_request_order_change(uuid, text, jsonb)'); h text;
begin
  if p is null then insert into _g0500 values ('operation_request_order_change(uuid, text, jsonb)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '1eb85cdfd293c0770fb7ed230847ca7d' then
    execute $s0500a$
create or replace function public.operation_request_order_change(
  p_order_id uuid,
  p_kind     text,
  p_payload  jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_order  orders;
  v_role   app_role;
  v_id     uuid;
  v_reason text;
  v_from   date;
  v_to     date;
  v_note   text;
begin
  v_role := public.app_role();
  if v_role is null then
    raise exception 'forbidden: no app role' using errcode = '42501';
  end if;
  -- The panel is an INTERNAL surface. A dealer changing their own order goes
  -- through the POS door, which has its own gates and its own approval queue.
  if (v_role is null or v_role not in ('principal', 'operation')) then
    raise exception 'forbidden: internal roles only' using errcode = '42501';
  end if;

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = '42P01';
  end if;
  if v_order.status in ('delivered', 'cancelled') then
    raise exception 'This order is no longer open'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  if p_kind not in ('promise_date', 'item_change') then
    raise exception 'unsupported change request kind'
      using errcode = '22023', detail = 'invalid_kind';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object'
     or pg_column_size(p_payload) > 8192 then
    raise exception 'payload must be an object (<=8KB)'
      using errcode = '22023', detail = 'invalid_payload';
  end if;

  -- THE REASON IS REQUIRED, and it is required HERE rather than only in the
  -- form: a record of a customer's postpone with no reason on it is the thing
  -- the next person cannot act on.
  v_reason := nullif(trim(p_payload->>'reason'), '');
  if v_reason is null then
    raise exception 'A reason is required'
      using errcode = '22023', detail = 'reason_required';
  end if;

  if p_kind = 'promise_date' then
    v_to := nullif(p_payload->>'to', '')::date;
    if v_to is null then
      raise exception 'A new date is required'
        using errcode = '22023', detail = 'date_required';
    end if;
    -- The FROM is read from the ORDER, never from the client: it is what the
    -- customer was actually promised, and a client that could name it could
    -- rewrite history by naming it wrongly.
    v_from := v_order.delivery_date;
    if v_from is not null and v_to = v_from then
      raise exception 'That is the date already promised'
        using errcode = '22023', detail = 'same_date';
    end if;
    p_payload := jsonb_build_object(
      'from', v_from, 'to', v_to, 'reason', v_reason);
  else
    v_note := nullif(trim(p_payload->>'note'), '');
    if v_note is null then
      raise exception 'Say what should change'
        using errcode = '22023', detail = 'note_required';
    end if;
    p_payload := jsonb_build_object('note', v_note, 'reason', v_reason);
  end if;

  begin
    insert into order_change_requests (order_id, kind, payload, requested_by)
    values (p_order_id, p_kind, p_payload, auth.uid())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'This order already has a change waiting'
      using errcode = '22023', detail = 'pending_exists';
  end;

  -- The history entry is not a duplicate of the request. The request is what is
  -- WAITING; the history is what HAPPENED, and it stays readable after the
  -- request is decided, cancelled or deleted.
  insert into order_history (order_id, text, by_role, by_user_id, metadata)
  values (
    p_order_id,
    case when p_kind = 'promise_date'
         then case when v_from is null
                   then format('Customer asked for %s · %s', v_to, v_reason)
                   else format('Customer asked to move %s to %s · %s',
                               v_from, v_to, v_reason) end
         else format('Customer asked to change the items · %s', v_note) end,
    v_role,
    auth.uid(),
    jsonb_build_object(
      'kind', case when p_kind = 'promise_date'
                   then 'promise_change_requested'
                   else 'item_change_requested' end,
      'change_request_id', v_id,
      'from', v_from,
      'to', v_to,
      'reason', v_reason)
  );

  insert into audit_log (role, action, dealer_id, ref)
  values (v_role, 'order.' || p_kind || '_requested', v_order.dealer_id,
          'SO-' || v_order.so::text);

  return jsonb_build_object('id', v_id);
end;
$$
$s0500a$;
    insert into _g0500 values ('operation_request_order_change(uuid, text, jsonb)', 'rewritten');
  elsif h in ('77e7b633acfcc2ccc1bc40cdf0d26154') then insert into _g0500 values ('operation_request_order_change(uuid, text, jsonb)', 'already');
  else insert into _g0500 values ('operation_request_order_change(uuid, text, jsonb)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'operation_request_order_change(uuid, text, jsonb)';
  end if;
end
$g0500$;

-- operation_stock_alerts()
--   source: repo 0368_one_question_one_number_and_bulk_is_not_bindable.sql; 1 gate edit(s)
--   source: live definition (dynamic renames applied); 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.operation_stock_alerts()'); h text;
begin
  if p is null then insert into _g0500 values ('operation_stock_alerts()', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '3bfdfd33a235f9e825a81f0e4e680246' then
    execute $s0500a$
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

  if (v_role is null or v_role not in ('operation', 'principal')) then
    raise exception 'forbidden: logistics or principal only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  return query
    select sb.sku,
           sb.warehouse_id,
           coalesce(a.on_hand, 0)                                as qty,
           coalesce(a.reserved, 0)                               as reserved,
           coalesce(a.sellable, 0)                               as effective,
           sb.low_threshold,
           (sb.low_threshold - coalesce(a.sellable, 0))::int      as shortage
      from public.stock_balances sb
      left join public.stock_sku_availability a
        on a.sku = sb.sku and a.warehouse_id = sb.warehouse_id
     where sb.low_threshold is not null
       and coalesce(a.sellable, 0) < sb.low_threshold
     order by (sb.low_threshold - coalesce(a.sellable, 0)) desc,
              sb.sku asc;
end;
$$
$s0500a$;
    insert into _g0500 values ('operation_stock_alerts()', 'rewritten');
  elsif h = 'f57890a742efa03a712adbc947af43d9' then
    execute $s0500b$
CREATE OR REPLACE FUNCTION public.operation_stock_alerts()
 RETURNS TABLE(sku text, warehouse_id uuid, qty integer, reserved integer, effective integer, low_threshold integer, shortage integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role app_role;
begin
  v_role := public.app_role();

  if (v_role is null or v_role not in ('operation', 'principal')) then
    raise exception 'forbidden: logistics or principal only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  return query
    select sb.sku,
           sb.warehouse_id,
           sb.qty,
           sb.reserved,
           (sb.qty - sb.reserved)::int                 as effective,
           sb.low_threshold,
           (sb.low_threshold - (sb.qty - sb.reserved))::int as shortage
      from stock_balances sb
     where sb.low_threshold is not null
       and (sb.qty - sb.reserved) < sb.low_threshold
     order by (sb.low_threshold - (sb.qty - sb.reserved)) desc,
              sb.sku asc;
end;
$function$
$s0500b$;
    insert into _g0500 values ('operation_stock_alerts()', 'rewritten');
  elsif h in ('d8c57805be5ff615b2f2b30110533fc9', '6285c565858dbc2090c8a09548e82bb3') then insert into _g0500 values ('operation_stock_alerts()', 'already');
  else insert into _g0500 values ('operation_stock_alerts()', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'operation_stock_alerts()';
  end if;
end
$g0500$;

-- ops_set_reorder_point(text, integer, integer, text)
--   source: repo 0286_stock_reorder_points.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.ops_set_reorder_point(text, integer, integer, text)'); h text;
begin
  if p is null then insert into _g0500 values ('ops_set_reorder_point(text, integer, integer, text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '521d2cfc2e5c508766d31b9737a46414' then
    execute $s0500a$
create or replace function public.ops_set_reorder_point(
  p_sku       text,
  p_point     int,
  p_lead_days int  default null,
  p_note      text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sku    text := nullif(btrim(coalesce(p_sku, '')), '');
  v_role   text := (select public.app_role());
  v_duties text[];
begin
  if v_sku is null then
    raise exception 'sku_required' using errcode = '22023';
  end if;

  if p_point is null or p_point < 0 or p_point > 100000 then
    raise exception 'reorder_point_out_of_range' using errcode = '22023';
  end if;

  if p_lead_days is not null and (p_lead_days < 0 or p_lead_days > 365) then
    raise exception 'lead_days_out_of_range' using errcode = '22023';
  end if;

  -- principal is the standing role gate (0260's law: never expressed as a
  -- duty). Everyone else needs the seat. Read inline rather than through
  -- my_org_duties() so the gate cannot be loosened by editing that helper.
  if (v_role is null or v_role <> 'principal') then
    select coalesce(array_agg(pd.duty_key), '{}'::text[])
      into v_duties
      from app_users u
      join org_position_duties pd on pd.position_id = u.position_id
     where u.id = auth.uid()
       and u.role <> 'dealer'
       and u.status = 'active';

    if not ('stock_planner' = any(coalesce(v_duties, '{}'::text[]))) then
      raise exception 'forbidden' using errcode = '42501',
        detail = 'reorder points are set by the COO';
    end if;
  end if;

  insert into ops_reorder_points (sku, reorder_point, lead_days, note, updated_by, updated_at)
  values (v_sku, p_point, p_lead_days, nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), now())
  on conflict (sku) do update
    set reorder_point = excluded.reorder_point,
        lead_days     = excluded.lead_days,
        note          = excluded.note,
        updated_by    = excluded.updated_by,
        updated_at    = now();

  -- `audit_log.role` is the app_role ENUM, not text. v_role is held as text
  -- above so it can be compared to 'principal', so the cast is required here —
  -- without it EVERY successful write raises 42804 and only the gate-refusal
  -- path appears to work. (Caught by the dry run, never by a UI click.)
  insert into audit_log (role, actor_text, action, ref)
  values (v_role::public.app_role,
          (select name from app_users where id = auth.uid()),
          case when p_point = 0
               then format('Reorder alert OFF · %s', v_sku)
               else format('Reorder point set · %s -> %s', v_sku, p_point)
          end,
          v_sku);
end;
$function$
$s0500a$;
    insert into _g0500 values ('ops_set_reorder_point(text, integer, integer, text)', 'rewritten');
  elsif h in ('c4bc7d2dc47119a972afee9e91ba17c6') then insert into _g0500 values ('ops_set_reorder_point(text, integer, integer, text)', 'already');
  else insert into _g0500 values ('ops_set_reorder_point(text, integer, integer, text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'ops_set_reorder_point(text, integer, integer, text)';
  end if;
end
$g0500$;

-- ops_stock_flag_repair(uuid, boolean)
--   source: repo 0139_wire_activity_log.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.ops_stock_flag_repair(uuid, boolean)'); h text;
begin
  if p is null then insert into _g0500 values ('ops_stock_flag_repair(uuid, boolean)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '1ab83a166e8c8f999b436870587d3f7b' then
    execute $s0500a$
CREATE OR REPLACE FUNCTION public.ops_stock_flag_repair(p_item_id uuid, p_flag boolean)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role     app_role;
  v_id       uuid;
  v_item_ref text;
BEGIN
  v_role := public.app_role();
  IF (v_role is null or v_role NOT IN ('operation','principal')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Look up reserved_ref before update for order linking in activity log
  SELECT reserved_ref INTO v_item_ref
    FROM ops_stock_items WHERE id = p_item_id;

  UPDATE ops_stock_items
     SET needs_repair = p_flag,
         updated_at   = now()
   WHERE id = p_item_id
   RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    INSERT INTO audit_log (role, action, ref)
    VALUES (v_role,
            CASE WHEN p_flag THEN 'ops_stock.flag_repair' ELSE 'ops_stock.unflag_repair' END,
            p_item_id::text);

    -- Phase C: activity log
    INSERT INTO ops_activity_log (order_id, action, actor_id, detail)
    VALUES (
      public._activity_log_order_id_from_ref(v_item_ref),
      'stock_flag_repair',
      auth.uid(),
      jsonb_build_object(
        'item_id', p_item_id,
        'flag',    p_flag,
        'ref',     v_item_ref
      )
    );
  END IF;
  RETURN v_id;
END;
$$
$s0500a$;
    insert into _g0500 values ('ops_stock_flag_repair(uuid, boolean)', 'rewritten');
  elsif h in ('a4cc507f6991fac81c10eaab0ac11586') then insert into _g0500 values ('ops_stock_flag_repair(uuid, boolean)', 'already');
  else insert into _g0500 values ('ops_stock_flag_repair(uuid, boolean)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'ops_stock_flag_repair(uuid, boolean)';
  end if;
end
$g0500$;

-- ops_stock_reassign(uuid, text)
--   source: repo 0471_a_reserved_unit_names_the_sales_order_line.sql; 1 gate edit(s)
--   source: live definition (dynamic renames applied); 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.ops_stock_reassign(uuid, text)'); h text;
begin
  if p is null then insert into _g0500 values ('ops_stock_reassign(uuid, text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '40babb6b94908030229b95cc51dbdfe7' then
    execute $s0500a$
create or replace function public.ops_stock_reassign(p_item_id uuid, p_new_ref text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
DECLARE
  v_role app_role;
  v_id   uuid;
BEGIN
  v_role := public.app_role();
  IF (v_role is null or v_role NOT IN ('operation','principal')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE ops_stock_items
     SET reserved_ref = p_new_ref,
         -- 0471: the reference moved without naming a line, so the OLD line's
         -- requirement returns and the new order shows the goods as still to
         -- buy until someone chooses this Unit against one of its lines.
         -- Over-buying is visible and recoverable; under-supply is not.
         reserved_order_line_id = NULL,
         ref_history  = CASE
                          WHEN reserved_ref IS NOT NULL AND reserved_ref <> p_new_ref
                            THEN array_append(ref_history, reserved_ref)
                          ELSE ref_history
                        END,
         updated_at   = now()
   WHERE id     = p_item_id
     AND status = 'reserved'
   RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    INSERT INTO audit_log (role, action, ref)
    VALUES (v_role, 'ops_stock.reassign', p_new_ref);

    INSERT INTO ops_activity_log (order_id, action, actor_id, detail)
    VALUES (
      public._activity_log_order_id_from_ref(p_new_ref),
      'stock_reassign',
      auth.uid(),
      jsonb_build_object('item_id', v_id, 'new_ref', p_new_ref)
    );
  END IF;
  RETURN v_id;
END;
$$
$s0500a$;
    insert into _g0500 values ('ops_stock_reassign(uuid, text)', 'rewritten');
  elsif h = 'e1e00647c4ac724a1e2b1b29f439e15d' then
    execute $s0500b$
CREATE OR REPLACE FUNCTION public.ops_stock_reassign(p_item_id uuid, p_new_ref text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role app_role;
  v_id   uuid;
BEGIN
  v_role := public.app_role();
  IF (v_role is null or v_role NOT IN ('operation','principal')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE ops_stock_items
     SET reserved_ref = p_new_ref,
         ref_history  = CASE
                          WHEN reserved_ref IS NOT NULL AND reserved_ref <> p_new_ref
                            THEN array_append(ref_history, reserved_ref)
                          ELSE ref_history
                        END,
         updated_at   = now()
   WHERE id     = p_item_id
     AND status = 'reserved'
   RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    INSERT INTO audit_log (role, action, ref)
    VALUES (v_role, 'ops_stock.reassign', p_new_ref);

    -- Phase C: activity log
    INSERT INTO ops_activity_log (order_id, action, actor_id, detail)
    VALUES (
      public._activity_log_order_id_from_ref(p_new_ref),
      'stock_reassign',
      auth.uid(),
      jsonb_build_object('item_id', v_id, 'new_ref', p_new_ref)
    );
  END IF;
  RETURN v_id;
END;
$function$
$s0500b$;
    insert into _g0500 values ('ops_stock_reassign(uuid, text)', 'rewritten');
  elsif h in ('41f0b18659be8de3f601d8409f78c29b', '41dc5d15cad52605f30ea9731c9f611b') then insert into _g0500 values ('ops_stock_reassign(uuid, text)', 'already');
  else insert into _g0500 values ('ops_stock_reassign(uuid, text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'ops_stock_reassign(uuid, text)';
  end if;
end
$g0500$;

-- ops_stock_release(uuid)
--   source: repo 0471_a_reserved_unit_names_the_sales_order_line.sql; 1 gate edit(s)
--   source: live definition (dynamic renames applied); 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.ops_stock_release(uuid)'); h text;
begin
  if p is null then insert into _g0500 values ('ops_stock_release(uuid)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'd6274a0d0c756621142cae991ad4be44' then
    execute $s0500a$
create or replace function public.ops_stock_release(p_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$
$s0500a$;
    insert into _g0500 values ('ops_stock_release(uuid)', 'rewritten');
  elsif h = '985ec1f2af1af22c8ae2eda785542da8' then
    execute $s0500b$
CREATE OR REPLACE FUNCTION public.ops_stock_release(p_item_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

    -- Phase C: activity log
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
$function$
$s0500b$;
    insert into _g0500 values ('ops_stock_release(uuid)', 'rewritten');
  elsif h in ('9f24c7da608bbe3ea7c35017d45cd619', '613865564afff56c9024f8bed4bef818') then insert into _g0500 values ('ops_stock_release(uuid)', 'already');
  else insert into _g0500 values ('ops_stock_release(uuid)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'ops_stock_release(uuid)';
  end if;
end
$g0500$;

-- ops_stock_takeout(uuid, text, text)
--   source: repo 0322_the_pool_can_say_it_was_used_instead_of_ordering.sql; 1 gate edit(s)
--   source: live definition (dynamic renames applied); 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.ops_stock_takeout(uuid, text, text)'); h text;
begin
  if p is null then insert into _g0500 values ('ops_stock_takeout(uuid, text, text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '862710c2dc0860910397fe5e825d7cbd' then
    execute $s0500a$
create or replace function public.ops_stock_takeout(
  p_item_id uuid,
  p_reason  text default null,
  p_note    text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_role app_role;
  v_id   uuid;
  v_sku  text;
  v_wh   uuid;
  v_ref  text;
  v_qty  int;
  v_was  text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  v_role := public.app_role();
  IF (v_role is null or v_role NOT IN ('operation','principal')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Read the state BEFORE the flip, and hold the row: whether this is a pool
  -- draw depends on what the unit was, and the answer must not change between
  -- the question and the update.
  SELECT status INTO v_was FROM ops_stock_items WHERE id = p_item_id FOR UPDATE;

  IF v_was = 'free' THEN
    -- P13 (0322): the same six, in the same order, as ops_stock_pool_draw.
    IF p_reason IS NULL OR p_reason NOT IN (
         'sales_urgent','supplier_delay','warranty_exchange','vip','other',
         'used_instead_of_ordering') THEN
      RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023',
        detail = 'taking a free unit draws on ready stock — say why';
    END IF;
    IF p_reason = 'other' AND v_note IS NULL THEN
      RAISE EXCEPTION 'reason_needs_words' USING ERRCODE = '22023',
        detail = 'say what the reason is when you pick Other';
    END IF;
  END IF;

  UPDATE ops_stock_items
     SET status     = 'sold',
         updated_at = now()
   WHERE id     = p_item_id
     AND status IN ('free','reserved')
   RETURNING id, sku, warehouse_id, reserved_ref, coalesce(qty, 1)
        INTO v_id, v_sku, v_wh, v_ref, v_qty;

  IF v_id IS NOT NULL THEN
    -- Only a FREE unit is a draw on the pool. A reserved one already has its
    -- row from ops_stock_pool_draw; a second row would inflate the month.
    IF v_was = 'free' THEN
      INSERT INTO ops_stock_pool_usage (item_id, sku, qty, reason, note, ref, taken_by)
      VALUES (v_id, v_sku, v_qty, p_reason, v_note, v_ref, auth.uid());
    END IF;

    INSERT INTO stock_movements (sku, warehouse_id, kind, qty, ref)
    VALUES (v_sku, v_wh, 'out', 1, COALESCE(v_ref, 'ops_stock.takeout'));

    PERFORM public.ops_rollup_stock_balances(v_wh);

    INSERT INTO audit_log (role, action, ref)
    VALUES (v_role, 'ops_stock.takeout', v_ref);

    INSERT INTO ops_activity_log (order_id, action, actor_id, detail)
    VALUES (
      public._activity_log_order_id_from_ref(v_ref),
      'stock_takeout',
      auth.uid(),
      jsonb_build_object('sku', v_sku, 'item_id', v_id, 'ref', v_ref)
    );
  END IF;
  RETURN v_id;
END;
$function$
$s0500a$;
    insert into _g0500 values ('ops_stock_takeout(uuid, text, text)', 'rewritten');
  elsif h = 'aab0e3f3daadbae5fe4aa490f83a8fb4' then
    execute $s0500b$
CREATE OR REPLACE FUNCTION public.ops_stock_takeout(p_item_id uuid, p_reason text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role app_role;
  v_id   uuid;
  v_sku  text;
  v_wh   uuid;
  v_ref  text;
  v_qty  int;
  v_was  text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  v_role := public.app_role();
  IF (v_role is null or v_role NOT IN ('operation','principal')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Read the state BEFORE the flip, and hold the row: whether this is a pool
  -- draw depends on what the unit was, and the answer must not change between
  -- the question and the update.
  SELECT status INTO v_was FROM ops_stock_items WHERE id = p_item_id FOR UPDATE;

  IF v_was = 'free' THEN
    IF p_reason IS NULL OR p_reason NOT IN (
         'sales_urgent','supplier_delay','warranty_exchange','vip','other') THEN
      RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023',
        detail = 'taking a free unit draws on ready stock — say why';
    END IF;
    IF p_reason = 'other' AND v_note IS NULL THEN
      RAISE EXCEPTION 'reason_needs_words' USING ERRCODE = '22023',
        detail = 'say what the reason is when you pick Other';
    END IF;
  END IF;

  UPDATE ops_stock_items
     SET status     = 'sold',
         updated_at = now()
   WHERE id     = p_item_id
     AND status IN ('free','reserved')
   RETURNING id, sku, warehouse_id, reserved_ref, coalesce(qty, 1)
        INTO v_id, v_sku, v_wh, v_ref, v_qty;

  IF v_id IS NOT NULL THEN
    -- Only a FREE unit is a draw on the pool. A reserved one already has its
    -- row from ops_stock_pool_draw; a second row would inflate the month.
    IF v_was = 'free' THEN
      INSERT INTO ops_stock_pool_usage (item_id, sku, qty, reason, note, ref, taken_by)
      VALUES (v_id, v_sku, v_qty, p_reason, v_note, v_ref, auth.uid());
    END IF;

    INSERT INTO stock_movements (sku, warehouse_id, kind, qty, ref)
    VALUES (v_sku, v_wh, 'out', 1, COALESCE(v_ref, 'ops_stock.takeout'));

    PERFORM public.ops_rollup_stock_balances(v_wh);

    INSERT INTO audit_log (role, action, ref)
    VALUES (v_role, 'ops_stock.takeout', v_ref);

    INSERT INTO ops_activity_log (order_id, action, actor_id, detail)
    VALUES (
      public._activity_log_order_id_from_ref(v_ref),
      'stock_takeout',
      auth.uid(),
      jsonb_build_object('sku', v_sku, 'item_id', v_id, 'ref', v_ref)
    );
  END IF;
  RETURN v_id;
END;
$function$
$s0500b$;
    insert into _g0500 values ('ops_stock_takeout(uuid, text, text)', 'rewritten');
  elsif h in ('cb0fc8be63859bbf8fc2b177a3990e73', '95af52919f86c6b7e9813aae362985e0') then insert into _g0500 values ('ops_stock_takeout(uuid, text, text)', 'already');
  else insert into _g0500 values ('ops_stock_takeout(uuid, text, text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'ops_stock_takeout(uuid, text, text)';
  end if;
end
$g0500$;

-- order_create(jsonb)
--   source: repo 0003_rpcs.sql; 1 gate edit(s)
--   source: live definition (dynamic renames applied); 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.order_create(jsonb)'); h text;
begin
  if p is null then insert into _g0500 values ('order_create(jsonb)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '840b62589d146b8bef3832b4ff7ce143' then
    execute $s0500a$
create or replace function order_create(p_payload jsonb)
returns orders
language plpgsql security definer as $$
declare
  v_order  orders;
  v_dl     int;
  v_role   app_role := public.app_role();
  v_dealer uuid     := (p_payload->>'dealer_id')::uuid;
  v_line   jsonb;
  v_addon  jsonb;
begin
  if (v_role is null or v_role not in ('dealer','salesperson','showroom','principal')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(max(dl),1240) + 1 into v_dl from orders;

  insert into orders (
    dl, status, channel, dealer_id, outlet_id, salesperson_id,
    customer_name, customer_phone, customer_address, customer_billing,
    customer_billing_same, customer_address_unknown, customer_emergency,
    delivery_date, delivery_date_tbd, delivery_floor, delivery_has_lift,
    paid, terms_accepted, signature_url, placed_at
  ) values (
    v_dl, 'place',
    coalesce(p_payload->>'channel','dealer'),
    v_dealer,
    nullif(p_payload->>'outlet_id','')::uuid,
    nullif(p_payload->>'salesperson_id','')::uuid,
    p_payload->'customer'->>'name',
    p_payload->'customer'->>'phone',
    p_payload->'customer'->>'address',
    p_payload->'customer'->>'billing',
    coalesce((p_payload->'customer'->>'billing_same')::bool, true),
    coalesce((p_payload->'customer'->>'address_unknown')::bool, false),
    p_payload->'customer'->>'emergency',
    nullif(p_payload->'delivery'->>'date','')::date,
    coalesce((p_payload->'delivery'->>'date_tbd')::bool, false),
    coalesce((p_payload->'delivery'->>'floor')::int, 1),
    coalesce((p_payload->'delivery'->>'has_lift')::bool, false),
    coalesce((p_payload->>'paid')::numeric, 0),
    coalesce((p_payload->>'terms_accepted')::bool, false),
    nullif(p_payload->>'signature_url',''),
    now()
  ) returning * into v_order;

  for v_line in select * from jsonb_array_elements(coalesce(p_payload->'lines','[]'::jsonb))
  loop
    insert into order_lines (order_id, sku, qty, attrs, unit_price) values (
      v_order.id,
      v_line->>'sku',
      (v_line->>'qty')::int,
      v_line->'attrs',
      (v_line->>'unit_price')::numeric
    );
  end loop;

  for v_addon in select * from jsonb_array_elements(coalesce(p_payload->'addons','[]'::jsonb))
  loop
    insert into order_addons (order_id, addon_key, qty, unit_price) values (
      v_order.id,
      v_addon->>'key',
      coalesce((v_addon->>'qty')::int, 1),
      (v_addon->>'unit_price')::numeric
    );
  end loop;

  insert into order_history (order_id, text, by_role, by_user_id) values (
    v_order.id, 'Order created · awaiting deposit', v_role, auth.uid()
  );

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values (v_role,
          (select name from app_users where id = auth.uid()),
          format('Created order DL-%s', v_dl),
          v_dealer,
          format('DL-%s', v_dl));

  return v_order;
end;
$$
$s0500a$;
    insert into _g0500 values ('order_create(jsonb)', 'rewritten');
  elsif h = 'eda006b431e304870efb2ee36bf67746' then
    execute $s0500b$
CREATE OR REPLACE FUNCTION public.order_create(p_payload jsonb)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_order  orders;
  v_so     int;
  v_role   app_role := public.app_role();
  v_dealer uuid     := (p_payload->>'dealer_id')::uuid;
  v_line   jsonb;
  v_addon  jsonb;
begin
  if (v_role is null or v_role not in ('dealer','salesperson','showroom','principal')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(max(so),1240) + 1 into v_so from orders;

  insert into orders (
    so, status, channel, dealer_id, outlet_id, salesperson_id,
    customer_name, customer_phone, customer_address, customer_billing,
    customer_billing_same, customer_address_unknown, customer_emergency,
    delivery_date, delivery_date_tbd, delivery_floor, delivery_has_lift,
    paid, terms_accepted, signature_url, placed_at
  ) values (
    v_so, 'place',
    coalesce(p_payload->>'channel','dealer'),
    v_dealer,
    nullif(p_payload->>'outlet_id','')::uuid,
    nullif(p_payload->>'salesperson_id','')::uuid,
    p_payload->'customer'->>'name',
    p_payload->'customer'->>'phone',
    p_payload->'customer'->>'address',
    p_payload->'customer'->>'billing',
    coalesce((p_payload->'customer'->>'billing_same')::bool, true),
    coalesce((p_payload->'customer'->>'address_unknown')::bool, false),
    p_payload->'customer'->>'emergency',
    nullif(p_payload->'delivery'->>'date','')::date,
    coalesce((p_payload->'delivery'->>'date_tbd')::bool, false),
    coalesce((p_payload->'delivery'->>'floor')::int, 1),
    coalesce((p_payload->'delivery'->>'has_lift')::bool, false),
    coalesce((p_payload->>'paid')::numeric, 0),
    coalesce((p_payload->>'terms_accepted')::bool, false),
    nullif(p_payload->>'signature_url',''),
    now()
  ) returning * into v_order;

  for v_line in select * from jsonb_array_elements(coalesce(p_payload->'lines','[]'::jsonb))
  loop
    insert into order_lines (order_id, sku, qty, attrs, unit_price) values (
      v_order.id,
      v_line->>'sku',
      (v_line->>'qty')::int,
      v_line->'attrs',
      (v_line->>'unit_price')::numeric
    );
  end loop;

  for v_addon in select * from jsonb_array_elements(coalesce(p_payload->'addons','[]'::jsonb))
  loop
    insert into order_addons (order_id, addon_key, qty, unit_price) values (
      v_order.id,
      v_addon->>'key',
      coalesce((v_addon->>'qty')::int, 1),
      (v_addon->>'unit_price')::numeric
    );
  end loop;

  insert into order_history (order_id, text, by_role, by_user_id) values (
    v_order.id, 'Order created · awaiting deposit', v_role, auth.uid()
  );

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values (v_role,
          (select name from app_users where id = auth.uid()),
          format('Created order DL-%s', v_so),
          v_dealer,
          format('SO-%s', v_so));

  return v_order;
end;
$function$
$s0500b$;
    insert into _g0500 values ('order_create(jsonb)', 'rewritten');
  elsif h in ('9b6c2df2750a9c967e58697144b606e9', 'e9c70f482bc6c77c5457ad0e96314739') then insert into _g0500 values ('order_create(jsonb)', 'already');
  else insert into _g0500 values ('order_create(jsonb)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'order_create(jsonb)';
  end if;
end
$g0500$;

-- order_dispatch(uuid, uuid, uuid)
--   source: repo 0003_rpcs.sql; 1 gate edit(s)
--   source: live definition (dynamic renames applied); 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.order_dispatch(uuid, uuid, uuid)'); h text;
begin
  if p is null then insert into _g0500 values ('order_dispatch(uuid, uuid, uuid)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'bfd3466928e7a062f054d7d07c78957e' then
    execute $s0500a$
create or replace function order_dispatch(
  p_order_id      uuid,
  p_partner_id    uuid,
  p_warehouse_id  uuid
) returns orders
language plpgsql security definer as $$
declare v_order orders;
begin
  if (public.app_role() is null or public.app_role() not in ('logistics','principal')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update orders set
    delivery_partner_id = p_partner_id,
    warehouse_id        = p_warehouse_id,
    logistics_stage     = 'dispatched',
    partner_stage       = 'assigned'
    where id = p_order_id
    returning * into v_order;

  perform 1 from order_lines where order_id = p_order_id;
  update stock_balances sb set
    qty = sb.qty - ol.qty,
    updated_at = now()
    from order_lines ol
    where ol.order_id = p_order_id and sb.sku = ol.sku and sb.warehouse_id = p_warehouse_id;

  insert into stock_movements (sku, warehouse_id, qty, kind, ref, note, by_role, by_user_id)
  select ol.sku, p_warehouse_id, ol.qty, 'out',
         format('DL #%s', v_order.dl), 'dispatched',
         'logistics', auth.uid()
    from order_lines ol where ol.order_id = p_order_id;

  insert into order_history (order_id, text, by_role, by_user_id)
  values (p_order_id, 'Dispatched · partner assigned', 'logistics', auth.uid());

  return v_order;
end;
$$
$s0500a$;
    insert into _g0500 values ('order_dispatch(uuid, uuid, uuid)', 'rewritten');
  elsif h = 'a1d2161841995a561e31cf99269b9cc5' then
    execute $s0500b$
CREATE OR REPLACE FUNCTION public.order_dispatch(p_order_id uuid, p_partner_id uuid, p_warehouse_id uuid)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare v_order orders;
begin
  if (public.app_role() is null or public.app_role() not in ('operation','principal')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update orders set
    delivery_partner_id = p_partner_id,
    warehouse_id        = p_warehouse_id,
    operation_stage     = 'dispatched',
    partner_stage       = 'assigned'
    where id = p_order_id
    returning * into v_order;

  perform 1 from order_lines where order_id = p_order_id;
  update stock_balances sb set
    qty = sb.qty - ol.qty,
    updated_at = now()
    from order_lines ol
    where ol.order_id = p_order_id and sb.sku = ol.sku and sb.warehouse_id = p_warehouse_id;

  insert into stock_movements (sku, warehouse_id, qty, kind, ref, note, by_role, by_user_id)
  select ol.sku, p_warehouse_id, ol.qty, 'out',
         format('DL #%s', v_order.so), 'dispatched',
         'operation', auth.uid()
    from order_lines ol where ol.order_id = p_order_id;

  insert into order_history (order_id, text, by_role, by_user_id)
  values (p_order_id, 'Dispatched · partner assigned', 'operation', auth.uid());

  return v_order;
end;
$function$
$s0500b$;
    insert into _g0500 values ('order_dispatch(uuid, uuid, uuid)', 'rewritten');
  elsif h in ('69540cbe96bb1862d56c8a90c98708c1', '5971f4e125e520165f247eefd6685699') then insert into _g0500 values ('order_dispatch(uuid, uuid, uuid)', 'already');
  else insert into _g0500 values ('order_dispatch(uuid, uuid, uuid)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'order_dispatch(uuid, uuid, uuid)';
  end if;
end
$g0500$;

-- partner_accept_pickup(text)
--   source: repo 0080_partner_pickup_state_rpcs.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.partner_accept_pickup(text)'); h text;
begin
  if p is null then insert into _g0500 values ('partner_accept_pickup(text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '7f325ea96d1b0e624f178bdbfde59f02' then
    execute $s0500a$
create or replace function public.partner_accept_pickup(p_po_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role        app_role;
  v_partner_id  uuid;
  v_actor       text;
  v_po          purchase_orders;
begin
  v_role := public.app_role();
  v_partner_id := public.app_partner_id();

  if (v_role is null or v_role <> 'partner') then
    raise exception 'forbidden: partner only'
      using errcode = '42501', detail = 'forbidden';
  end if;
  if v_partner_id is null then
    raise exception 'no partner_id on JWT'
      using errcode = '42501', detail = 'no_partner_id';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO not found' using errcode = '42P01', detail = 'po_not_found';
  end if;

  if v_po.procurement_partner_id is distinct from v_partner_id then
    raise exception 'forbidden: cross-partner accept'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if v_po.sup_status not in ('ready_confirm_sent', 'ready_for_pickup', 'pickup_assigned') then
    raise exception 'PO is not in a state to accept pickup (got %)', v_po.sup_status
      using errcode = '22023', detail = 'wrong_sup_status';
  end if;

  v_actor := coalesce((select name from app_users where id = (select auth.uid())), 'Partner');

  update purchase_orders
     set sup_status          = 'pickup_accepted',
         partner_confirmed_at = now(),
         updated_at           = now()
   where id = p_po_id;

  insert into po_history (po_id, text, by_role)
  values (p_po_id, 'Partner accepted pickup', 'partner');

  insert into audit_log (role, actor_text, action, ref)
  values ('partner', v_actor, format('Accepted pickup for PO %s', p_po_id), p_po_id);

  return jsonb_build_object(
    'po_id',                p_po_id,
    'sup_status',           'pickup_accepted',
    'partner_confirmed_at', now()
  );
end;
$$
$s0500a$;
    insert into _g0500 values ('partner_accept_pickup(text)', 'rewritten');
  elsif h in ('341dc79056a662bfedffd4ba44872baa') then insert into _g0500 values ('partner_accept_pickup(text)', 'already');
  else insert into _g0500 values ('partner_accept_pickup(text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'partner_accept_pickup(text)';
  end if;
end
$g0500$;

-- partner_arrived_at_warehouse(text)
--   source: repo 0082_partner_arrived_at_warehouse_rpc.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.partner_arrived_at_warehouse(text)'); h text;
begin
  if p is null then insert into _g0500 values ('partner_arrived_at_warehouse(text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '6dd0dd1897e9420fc2a362a8efdf7a60' then
    execute $s0500a$
create or replace function public.partner_arrived_at_warehouse(p_po_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role        app_role;
  v_partner_id  uuid;
  v_actor       text;
  v_po          purchase_orders;
begin
  v_role := public.app_role();
  v_partner_id := public.app_partner_id();

  if (v_role is null or v_role <> 'partner') then
    raise exception 'forbidden: partner only'
      using errcode = '42501', detail = 'forbidden';
  end if;
  if v_partner_id is null then
    raise exception 'no partner_id on JWT'
      using errcode = '42501', detail = 'no_partner_id';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO not found' using errcode = '42P01', detail = 'po_not_found';
  end if;

  if v_po.procurement_partner_id is distinct from v_partner_id then
    raise exception 'forbidden: cross-partner arrived'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if v_po.sup_status <> 'picked_up' then
    raise exception 'PO is not in transit (got %)', v_po.sup_status
      using errcode = '22023', detail = 'wrong_sup_status';
  end if;

  v_actor := coalesce((select name from app_users where id = (select auth.uid())), 'Partner');

  update purchase_orders
     set sup_status = 'delivered',
         updated_at = now()
   where id = p_po_id;

  insert into po_history (po_id, text, by_role)
  values (p_po_id, 'Partner arrived at warehouse · awaiting receive', 'partner');

  insert into audit_log (role, actor_text, action, ref)
  values ('partner', v_actor, format('Arrived at WH · PO %s · awaiting receive', p_po_id), p_po_id);

  return jsonb_build_object('po_id', p_po_id, 'sup_status', 'delivered');
end;
$$
$s0500a$;
    insert into _g0500 values ('partner_arrived_at_warehouse(text)', 'rewritten');
  elsif h in ('6c595982659db52d8666ccc8f4c0b459') then insert into _g0500 values ('partner_arrived_at_warehouse(text)', 'already');
  else insert into _g0500 values ('partner_arrived_at_warehouse(text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'partner_arrived_at_warehouse(text)';
  end if;
end
$g0500$;

-- partner_attach_pod(uuid, text, text, text, boolean, text, text)
--   source: repo 0151_delivery_esign.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.partner_attach_pod(uuid, text, text, text, boolean, text, text)'); h text;
begin
  if p is null then insert into _g0500 values ('partner_attach_pod(uuid, text, text, text, boolean, text, text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'c20a0879a8ca995811a295ae21c9a672' then
    execute $s0500a$
create or replace function public.partner_attach_pod(
  p_thread_id     uuid,
  p_pod_path      text,
  p_do_number     text,
  p_do_note       text,
  p_signed        boolean,
  p_signature_url text default null,
  p_signed_by     text default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_thread     order_supplier_threads;
  v_partner_id uuid;
  v_user_id    uuid;
BEGIN
  v_partner_id := public.app_partner_id();
  v_user_id    := (select auth.uid());

  IF (public.app_role() is null or public.app_role() <> 'partner') THEN
    RAISE EXCEPTION 'forbidden: partner role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: partner_id missing on JWT'
      USING ERRCODE = '42501', DETAIL = 'no_partner_id';
  END IF;

  IF p_signed IS NULL OR p_signed = false THEN
    RAISE EXCEPTION 'customer must sign DO'
      USING ERRCODE = 'P0001', DETAIL = 'do_required';
  END IF;

  IF p_pod_path IS NULL OR btrim(p_pod_path) = '' THEN
    RAISE EXCEPTION 'pod_path required'
      USING ERRCODE = '22023', DETAIL = 'pod_path_required';
  END IF;

  IF p_do_number IS NULL OR length(btrim(p_do_number)) < 3 THEN
    RAISE EXCEPTION 'DO number must be at least 3 characters'
      USING ERRCODE = 'P0001', DETAIL = 'do_required';
  END IF;

  SELECT * INTO v_thread FROM order_supplier_threads WHERE id = p_thread_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'thread not found' USING ERRCODE = '42P01', DETAIL = 'thread_not_found';
  END IF;

  IF v_thread.delivery_partner_id IS DISTINCT FROM v_partner_id THEN
    RAISE EXCEPTION 'forbidden: not this partner''s thread'
      USING ERRCODE = '42501', DETAIL = 'cross_tenant';
  END IF;

  IF v_thread.operation_stage IS DISTINCT FROM 'dispatched' THEN
    RAISE EXCEPTION 'thread is not in dispatched state (got %)', v_thread.operation_stage
      USING ERRCODE = '22023', DETAIL = 'wrong_stage';
  END IF;

  UPDATE order_supplier_threads
     SET pod_url           = btrim(p_pod_path),
         pod_do_number     = btrim(p_do_number),
         pod_note          = nullif(btrim(coalesce(p_do_note, '')), ''),
         pod_uploaded_at   = now(),
         pod_uploaded_by   = v_user_id,
         pod_signature_url = nullif(btrim(coalesce(p_signature_url, '')), ''),
         pod_signed_by     = nullif(btrim(coalesce(p_signed_by, '')), ''),
         pod_signed_at     = now(),
         operation_stage   = 'delivered',
         delivered_at      = now(),
         updated_at        = now()
   WHERE id = p_thread_id;

  INSERT INTO order_history (order_id, text, by_role, by_user_id)
  VALUES (
    v_thread.order_id,
    format('POD attached for thread %s · DO %s · signed by %s · stage → delivered',
           p_thread_id, btrim(p_do_number),
           coalesce(nullif(btrim(coalesce(p_signed_by, '')), ''), 'customer')),
    'partner',
    v_user_id
  );

  RETURN jsonb_build_object(
    'thread_id',         p_thread_id,
    'operation_stage',   'delivered',
    'pod_url',           btrim(p_pod_path),
    'pod_do_number',     btrim(p_do_number),
    'pod_signature_url', nullif(btrim(coalesce(p_signature_url, '')), ''),
    'pod_signed_by',     nullif(btrim(coalesce(p_signed_by, '')), '')
  );
END;
$function$
$s0500a$;
    insert into _g0500 values ('partner_attach_pod(uuid, text, text, text, boolean, text, text)', 'rewritten');
  elsif h in ('7aa72ba22983221bc173bb4626f12d47') then insert into _g0500 values ('partner_attach_pod(uuid, text, text, text, boolean, text, text)', 'already');
  else insert into _g0500 values ('partner_attach_pod(uuid, text, text, text, boolean, text, text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'partner_attach_pod(uuid, text, text, text, boolean, text, text)';
  end if;
end
$g0500$;

-- partner_mark_picked_up(text)
--   source: repo 0080_partner_pickup_state_rpcs.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.partner_mark_picked_up(text)'); h text;
begin
  if p is null then insert into _g0500 values ('partner_mark_picked_up(text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '1cb0cef70b6500332cbb5031214840f3' then
    execute $s0500a$
create or replace function public.partner_mark_picked_up(p_po_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role        app_role;
  v_partner_id  uuid;
  v_actor       text;
  v_po          purchase_orders;
begin
  v_role := public.app_role();
  v_partner_id := public.app_partner_id();

  if (v_role is null or v_role <> 'partner') then
    raise exception 'forbidden: partner only'
      using errcode = '42501', detail = 'forbidden';
  end if;
  if v_partner_id is null then
    raise exception 'no partner_id on JWT'
      using errcode = '42501', detail = 'no_partner_id';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO not found' using errcode = '42P01', detail = 'po_not_found';
  end if;

  if v_po.procurement_partner_id is distinct from v_partner_id then
    raise exception 'forbidden: cross-partner mark picked-up'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if v_po.sup_status <> 'pickup_accepted' then
    raise exception 'PO is not in a state to mark picked up (got %)', v_po.sup_status
      using errcode = '22023', detail = 'wrong_sup_status';
  end if;

  v_actor := coalesce((select name from app_users where id = (select auth.uid())), 'Partner');

  update purchase_orders
     set sup_status   = 'picked_up',
         pickup_date  = now()::date,
         updated_at   = now()
   where id = p_po_id;

  insert into po_history (po_id, text, by_role)
  values (p_po_id, 'Partner picked up · in transit to warehouse', 'partner');

  insert into audit_log (role, actor_text, action, ref)
  values ('partner', v_actor, format('Picked up PO %s · in transit', p_po_id), p_po_id);

  return jsonb_build_object('po_id', p_po_id, 'sup_status', 'picked_up');
end;
$$
$s0500a$;
    insert into _g0500 values ('partner_mark_picked_up(text)', 'rewritten');
  elsif h in ('8277c76f9d35b7065b5ef4afba29ea96') then insert into _g0500 values ('partner_mark_picked_up(text)', 'already');
  else insert into _g0500 values ('partner_mark_picked_up(text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'partner_mark_picked_up(text)';
  end if;
end
$g0500$;

-- partner_mark_pickup_collected(uuid)
--   source: repo 0119_partner_mark_pickup_collected.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.partner_mark_pickup_collected(uuid)'); h text;
begin
  if p is null then insert into _g0500 values ('partner_mark_pickup_collected(uuid)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '5e3422e5a18a6453c660c8539efc22ca' then
    execute $s0500a$
CREATE OR REPLACE FUNCTION public.partner_mark_pickup_collected(
  p_event_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_event      po_pickup_events;
  v_po         purchase_orders;
  v_partner_id uuid;
  v_actor_uid  uuid;
BEGIN
  v_partner_id := public.app_partner_id();
  v_actor_uid  := (SELECT auth.uid());

  IF (public.app_role() is null or public.app_role() <> 'partner') THEN
    RAISE EXCEPTION 'forbidden: partner role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: partner_id missing on JWT'
      USING ERRCODE = '42501', DETAIL = 'no_partner_id';
  END IF;

  SELECT * INTO v_event FROM po_pickup_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pickup event not found'
      USING ERRCODE = '42P01', DETAIL = 'event_not_found';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = v_event.po_id;
  IF v_po.procurement_partner_id IS DISTINCT FROM v_partner_id THEN
    RAISE EXCEPTION 'forbidden: PO not assigned to this partner'
      USING ERRCODE = '42501', DETAIL = 'cross_tenant';
  END IF;

  IF v_event.departed_at IS NOT NULL THEN
    RAISE EXCEPTION 'pickup event already marked collected at %', v_event.departed_at
      USING ERRCODE = '22023', DETAIL = 'already_collected';
  END IF;

  UPDATE po_pickup_events
     SET departed_at = now()
   WHERE id = p_event_id;

  INSERT INTO po_history (po_id, text, by_role, by_user_id)
  VALUES (v_event.po_id,
          format('Partner marked collected · DO %s · in transit to WH',
                 v_event.do_number),
          'partner', v_actor_uid);

  RETURN jsonb_build_object(
    'event_id', p_event_id,
    'departed_at', now()
  );
END;
$$
$s0500a$;
    insert into _g0500 values ('partner_mark_pickup_collected(uuid)', 'rewritten');
  elsif h in ('7af2fd54d931655d8a6f6256362d23fe') then insert into _g0500 values ('partner_mark_pickup_collected(uuid)', 'already');
  else insert into _g0500 values ('partner_mark_pickup_collected(uuid)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'partner_mark_pickup_collected(uuid)';
  end if;
end
$g0500$;

-- partner_orders_for_threads(uuid[])
--   source: repo 0130_cancelled_order_filter_audit.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.partner_orders_for_threads(uuid[])'); h text;
begin
  if p is null then insert into _g0500 values ('partner_orders_for_threads(uuid[])', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'c60a93cf8f1c1b445d9ecea803d42775' then
    execute $s0500a$
CREATE OR REPLACE FUNCTION public.partner_orders_for_threads(p_order_ids uuid[])
 RETURNS TABLE(id uuid, so integer, customer_name text, delivery_date date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_partner_id uuid;
BEGIN
  v_partner_id := public.app_partner_id();

  IF (public.app_role() is null or public.app_role() <> 'partner') THEN
    RAISE EXCEPTION 'forbidden: partner role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: partner_id missing on JWT'
      USING ERRCODE = '42501', DETAIL = 'no_partner_id';
  END IF;

  RETURN QUERY
  SELECT DISTINCT o.id, o.so, o.customer_name, o.delivery_date
  FROM orders o
  JOIN order_supplier_threads t ON t.order_id = o.id
  JOIN purchase_orders po ON po.id = t.po_id
  LEFT JOIN warehouses w ON w.id = po.warehouse_id
  WHERE o.id = ANY(p_order_ids)
    AND o.status <> 'cancelled'
    AND (po.procurement_partner_id = v_partner_id
         OR w.owning_partner_id = v_partner_id);
END;
$function$
$s0500a$;
    insert into _g0500 values ('partner_orders_for_threads(uuid[])', 'rewritten');
  elsif h in ('090c028764705ca44e5677a93d8febaa') then insert into _g0500 values ('partner_orders_for_threads(uuid[])', 'already');
  else insert into _g0500 values ('partner_orders_for_threads(uuid[])', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'partner_orders_for_threads(uuid[])';
  end if;
end
$g0500$;

-- partner_pickup_threads(text, uuid[], text, text, text)
--   source: repo 0152_auto_dispatch_and_reject_branch.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.partner_pickup_threads(text, uuid[], text, text, text)'); h text;
begin
  if p is null then insert into _g0500 values ('partner_pickup_threads(text, uuid[], text, text, text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'f4846ff9fa7b4c3515333d8049a80161' then
    execute $s0500a$
CREATE OR REPLACE FUNCTION public.partner_pickup_threads(p_po_id text, p_thread_ids uuid[], p_do_number text, p_do_file_path text, p_do_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_po              purchase_orders;
  v_partner_id      uuid;
  v_actor_uid       uuid;
  v_event_id        uuid;
  v_thread_count    int;
  v_remaining       int;
  v_new_sup_status  po_sup_status;
  v_existing_events int;
  v_do_number       text;
  v_oid             uuid;
BEGIN
  v_partner_id := public.app_partner_id();
  v_actor_uid  := (SELECT auth.uid());

  IF (public.app_role() is null or public.app_role() <> 'partner') THEN
    RAISE EXCEPTION 'forbidden: partner role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: partner_id missing on JWT'
      USING ERRCODE = '42501', DETAIL = 'no_partner_id';
  END IF;
  IF array_length(p_thread_ids, 1) IS NULL OR array_length(p_thread_ids, 1) = 0 THEN
    RAISE EXCEPTION 'at least one thread required'
      USING ERRCODE = '22023', DETAIL = 'empty_threads';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found' USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;
  IF v_po.procurement_partner_id IS DISTINCT FROM v_partner_id THEN
    RAISE EXCEPTION 'forbidden: PO not assigned to this partner'
      USING ERRCODE = '42501', DETAIL = 'cross_tenant';
  END IF;

  WITH locked AS (
    SELECT id FROM order_supplier_threads
     WHERE id = ANY(p_thread_ids)
       AND po_id = p_po_id
       AND supplier_ready_at IS NOT NULL
       AND pickup_event_id IS NULL
     FOR UPDATE
  )
  SELECT count(*) INTO v_thread_count FROM locked;
  IF v_thread_count <> array_length(p_thread_ids, 1) THEN
    RAISE EXCEPTION 'one or more threads ineligible (not ready / wrong PO / already picked)'
      USING ERRCODE = '22023', DETAIL = 'ineligible_thread';
  END IF;

  IF p_do_number IS NULL OR length(btrim(p_do_number)) < 3 THEN
    SELECT count(*) INTO v_existing_events FROM po_pickup_events WHERE po_id = p_po_id;
    v_do_number := format('DO-%s-%s', p_po_id, lpad((v_existing_events + 1)::text, 3, '0'));
  ELSE
    v_do_number := btrim(p_do_number);
  END IF;

  INSERT INTO po_pickup_events (po_id, do_number, do_file_path, do_note, picked_up_at, picked_up_by, ack_role)
  VALUES (p_po_id,
          v_do_number,
          nullif(btrim(coalesce(p_do_file_path, '')), ''),
          nullif(btrim(coalesce(p_do_note, '')), ''),
          now(), v_actor_uid, 'partner')
  RETURNING id INTO v_event_id;

  UPDATE order_supplier_threads t
     SET pickup_event_id = v_event_id,
         operation_stage = CASE WHEN t.sop_name = 'SOFA_SPECIAL'
                                THEN 'dispatched'::operation_stage
                                ELSE 'ready_to_dispatch'::operation_stage
                           END,
         updated_at      = now()
   WHERE t.id = ANY(p_thread_ids);

  SELECT count(*) INTO v_remaining
    FROM order_supplier_threads
   WHERE po_id = p_po_id AND pickup_event_id IS NULL;

  IF v_remaining = 0 THEN
    v_new_sup_status := 'shipped';
  ELSE
    v_new_sup_status := 'partially_shipped';
  END IF;
  UPDATE purchase_orders SET sup_status = v_new_sup_status, updated_at = now()
    WHERE id = p_po_id;

  INSERT INTO po_history (po_id, text, by_role, by_user_id)
  VALUES (p_po_id,
          format('Partner picked up %s thread(s) · DO %s · sup_status -> %s',
                 v_thread_count, v_do_number, v_new_sup_status),
          'partner', v_actor_uid);

  -- B (Loo 2026-05-31): factory-pickup STANDARD goods land at the WH
  -- (ready_to_dispatch); auto-dispatch the order if all its goods are now at
  -- the WH and a non-rejected LP was pre-chosen. SOFA_SPECIAL threads are
  -- already 'dispatched' so the helper's gate skips them.
  FOR v_oid IN
    SELECT DISTINCT order_id FROM order_supplier_threads WHERE id = ANY(p_thread_ids)
  LOOP
    PERFORM public._operation_auto_dispatch_if_ready(v_oid);
  END LOOP;

  RETURN jsonb_build_object(
    'pickup_event_id', v_event_id,
    'thread_count',    v_thread_count,
    'do_number',       v_do_number,
    'po_sup_status',   v_new_sup_status
  );
END;
$function$
$s0500a$;
    insert into _g0500 values ('partner_pickup_threads(text, uuid[], text, text, text)', 'rewritten');
  elsif h in ('862bc00a056b1e00960a7772c2e73e3a') then insert into _g0500 values ('partner_pickup_threads(text, uuid[], text, text, text)', 'already');
  else insert into _g0500 values ('partner_pickup_threads(text, uuid[], text, text, text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'partner_pickup_threads(text, uuid[], text, text, text)';
  end if;
end
$g0500$;

-- partner_reject_customer(text, text)
--   source: repo 0090_partner_receive_sofa_flow.sql; 1 gate edit(s)
--   source: live definition (dynamic renames applied); 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.partner_reject_customer(text, text)'); h text;
begin
  if p is null then insert into _g0500 values ('partner_reject_customer(text, text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'b69daf80b514e311d9c8f26e45298b93' then
    execute $s0500a$
CREATE OR REPLACE FUNCTION public.partner_reject_customer(
  p_po_id  text,
  p_reason text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_po          purchase_orders;
  v_role        app_role;
  v_partner_id  uuid;
  v_actor       text;
  v_rejection   jsonb;
  v_owns_via_wh boolean;
BEGIN
  v_role := public.app_role();
  v_partner_id := public.app_partner_id();

  IF (v_role is null or v_role NOT IN ('partner', 'logistics', 'principal')) THEN
    RAISE EXCEPTION 'forbidden: partner or logistics only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found' USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM warehouses w
    WHERE w.id = v_po.warehouse_id
      AND w.owning_partner_id = v_partner_id
  ) INTO v_owns_via_wh;

  IF v_role = 'partner'
     AND v_po.procurement_partner_id IS DISTINCT FROM v_partner_id
     AND NOT v_owns_via_wh THEN
    RAISE EXCEPTION 'forbidden: cross-partner reject'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  IF v_po.sup_status NOT IN ('ready_confirm_sent', 'partner_confirmed') THEN
    RAISE EXCEPTION 'PO not in pre-flight state (got %)', v_po.sup_status
      USING ERRCODE = '22023', DETAIL = 'wrong_sup_status';
  END IF;

  v_actor := COALESCE((SELECT name FROM app_users WHERE id = (SELECT auth.uid())), INITCAP(v_role::text));

  v_rejection := jsonb_build_object(
    'at',                    now(),
    'rejected_by',           'lp',
    'original_warehouse_id', v_po.warehouse_id
  );
  IF p_reason <> '' THEN
    v_rejection := v_rejection || jsonb_build_object('reason_audit_only', p_reason);
  END IF;

  UPDATE purchase_orders
     SET sup_status         = 'customer_rejected',
         customer_rejection = v_rejection,
         updated_at         = now()
   WHERE id = p_po_id;

  INSERT INTO po_history (po_id, text, by_role)
  VALUES (p_po_id,
          format('LP rejected inbound%s', CASE WHEN p_reason <> '' THEN ': ' || p_reason ELSE '' END),
          v_role);

  INSERT INTO audit_log (role, actor_text, action, ref)
  VALUES (v_role, v_actor,
          format('LP rejected inbound on PO %s%s', p_po_id,
                 CASE WHEN p_reason <> '' THEN format(' (reason: %s)', p_reason) ELSE '' END),
          p_po_id);

  RETURN jsonb_build_object(
    'po_id',       p_po_id,
    'sup_status',  'customer_rejected',
    'rejected_at', now()
  );
END;
$$
$s0500a$;
    insert into _g0500 values ('partner_reject_customer(text, text)', 'rewritten');
  elsif h = '91ced0897d03520214076f5ce490f3ce' then
    execute $s0500b$
CREATE OR REPLACE FUNCTION public.partner_reject_customer(p_po_id text, p_reason text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_po          purchase_orders;
  v_role        app_role;
  v_partner_id  uuid;
  v_actor       text;
  v_rejection   jsonb;
  v_owns_via_wh boolean;
BEGIN
  v_role := public.app_role();
  v_partner_id := public.app_partner_id();

  IF (v_role is null or v_role NOT IN ('partner', 'operation', 'principal')) THEN
    RAISE EXCEPTION 'forbidden: partner or logistics only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found' USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM warehouses w
    WHERE w.id = v_po.warehouse_id
      AND w.owning_partner_id = v_partner_id
  ) INTO v_owns_via_wh;

  IF v_role = 'partner'
     AND v_po.procurement_partner_id IS DISTINCT FROM v_partner_id
     AND NOT v_owns_via_wh THEN
    RAISE EXCEPTION 'forbidden: cross-partner reject'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  IF v_po.sup_status NOT IN ('ready_confirm_sent', 'partner_confirmed') THEN
    RAISE EXCEPTION 'PO not in pre-flight state (got %)', v_po.sup_status
      USING ERRCODE = '22023', DETAIL = 'wrong_sup_status';
  END IF;

  v_actor := COALESCE((SELECT name FROM app_users WHERE id = (SELECT auth.uid())), INITCAP(v_role::text));

  v_rejection := jsonb_build_object(
    'at',                    now(),
    'rejected_by',           'lp',
    'original_warehouse_id', v_po.warehouse_id
  );
  IF p_reason <> '' THEN
    v_rejection := v_rejection || jsonb_build_object('reason_audit_only', p_reason);
  END IF;

  UPDATE purchase_orders
     SET sup_status         = 'customer_rejected',
         customer_rejection = v_rejection,
         updated_at         = now()
   WHERE id = p_po_id;

  INSERT INTO po_history (po_id, text, by_role)
  VALUES (p_po_id,
          format('LP rejected inbound%s', CASE WHEN p_reason <> '' THEN ': ' || p_reason ELSE '' END),
          v_role);

  INSERT INTO audit_log (role, actor_text, action, ref)
  VALUES (v_role, v_actor,
          format('LP rejected inbound on PO %s%s', p_po_id,
                 CASE WHEN p_reason <> '' THEN format(' (reason: %s)', p_reason) ELSE '' END),
          p_po_id);

  RETURN jsonb_build_object(
    'po_id',       p_po_id,
    'sup_status',  'customer_rejected',
    'rejected_at', now()
  );
END;
$function$
$s0500b$;
    insert into _g0500 values ('partner_reject_customer(text, text)', 'rewritten');
  elsif h in ('a7e2f13268109f9dfb49307a1a273d77', 'bb3e24d0204b309d177f42e1d70dd72d') then insert into _g0500 values ('partner_reject_customer(text, text)', 'already');
  else insert into _g0500 values ('partner_reject_customer(text, text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'partner_reject_customer(text, text)';
  end if;
end
$g0500$;

-- partner_threads_to_deliver()
--   source: repo 0129_deep_audit_cascade_fixes.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.partner_threads_to_deliver()'); h text;
begin
  if p is null then insert into _g0500 values ('partner_threads_to_deliver()', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '5320d002f568e644344fe3ee9db09f18' then
    execute $s0500a$
CREATE OR REPLACE FUNCTION public.partner_threads_to_deliver()
 RETURNS TABLE(thread_id uuid, order_id uuid, po_id text, customer_name text, customer_address text, customer_phone text, dispatched_at timestamp with time zone, confirm_delivery_date date, do_number text, operation_stage text, delivered_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_partner_id uuid;
BEGIN
  v_partner_id := public.app_partner_id();

  IF (public.app_role() is null or public.app_role() <> 'partner') THEN
    RAISE EXCEPTION 'forbidden: partner role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: partner_id missing on JWT'
      USING ERRCODE = '42501', DETAIL = 'no_partner_id';
  END IF;

  RETURN QUERY
  SELECT
    t.id                       AS thread_id,
    t.order_id                 AS order_id,
    t.po_id                    AS po_id,
    o.customer_name            AS customer_name,
    o.customer_address         AS customer_address,
    o.customer_phone           AS customer_phone,
    t.updated_at               AS dispatched_at,
    t.confirm_delivery_date    AS confirm_delivery_date,
    o.do_number                AS do_number,
    t.operation_stage::text    AS operation_stage,
    t.delivered_at             AS delivered_at
  FROM order_supplier_threads t
  JOIN orders o ON o.id = t.order_id
  WHERE t.delivery_partner_id = v_partner_id
    -- 0129: filter cancelled orders so abandon doesn't leave ghost rows
    -- in the partner kanban. operation_stage enum has no 'cancelled' value
    -- so we filter at the order.status layer instead.
    AND o.status <> 'cancelled'
    AND (
      t.operation_stage = 'dispatched'
      OR (
        t.operation_stage = 'delivered'
        AND t.delivered_at IS NOT NULL
        AND t.delivered_at >= now() - interval '30 days'
      )
    )
  ORDER BY
    CASE WHEN t.operation_stage = 'dispatched' THEN 0 ELSE 1 END,
    COALESCE(t.delivered_at, t.updated_at) DESC;
END;
$function$
$s0500a$;
    insert into _g0500 values ('partner_threads_to_deliver()', 'rewritten');
  elsif h in ('3866808d636901d7725c8c110f82bb09') then insert into _g0500 values ('partner_threads_to_deliver()', 'already');
  else insert into _g0500 values ('partner_threads_to_deliver()', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'partner_threads_to_deliver()';
  end if;
end
$g0500$;

-- patch_delivery_stop(uuid, integer, jsonb)
--   source: repo 0156_delivery_stops.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.patch_delivery_stop(uuid, integer, jsonb)'); h text;
begin
  if p is null then insert into _g0500 values ('patch_delivery_stop(uuid, integer, jsonb)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '542f705ab64330d5ba2cd2af388bf8f1' then
    execute $s0500a$
create or replace function public.patch_delivery_stop(
  p_order_id uuid,
  p_leg      int,
  p_patch    jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role     app_role;
  v_stops    jsonb;
  v_idx      int := p_leg - 1;            -- jsonb arrays are 0-indexed
  v_existing jsonb;
  v_merged   jsonb;
  v_now      timestamptz := now();
begin
  v_role := public.app_role();
  if (v_role is null or v_role not in ('operation','principal')) then
    raise exception 'forbidden: only operation/principal can patch delivery stops'
      using errcode = '42501';
  end if;

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'p_patch must be a JSON object' using errcode = '22023';
  end if;

  select delivery_stops into v_stops from orders where id = p_order_id for update;
  if v_stops is null or jsonb_typeof(v_stops) <> 'array' then
    raise exception 'order % has no delivery chain — call set_delivery_chain first',
      p_order_id using errcode = '22023';
  end if;
  v_existing := v_stops -> v_idx;
  if v_existing is null then
    raise exception 'leg % does not exist on order %', p_leg, p_order_id
      using errcode = '22023';
  end if;

  -- Convenience: if the patch sets `status` to one of the milestone values
  -- and the corresponding timestamp isn't already set in the patch, stamp
  -- `now()` automatically so the frontend can stay dumb.
  v_merged := v_existing || p_patch;
  if (p_patch ->> 'status') = 'picked_up' and v_merged ->> 'picked_up_at' is null then
    v_merged := v_merged || jsonb_build_object('picked_up_at', v_now);
  end if;
  if (p_patch ->> 'status') = 'handed_off' and v_merged ->> 'handed_off_at' is null then
    v_merged := v_merged || jsonb_build_object('handed_off_at', v_now);
  end if;
  if (p_patch ->> 'status') = 'delivered' and v_merged ->> 'delivered_at' is null then
    v_merged := v_merged || jsonb_build_object('delivered_at', v_now);
  end if;

  update orders
     set delivery_stops = jsonb_set(v_stops, array[v_idx::text], v_merged),
         updated_at     = v_now
   where id = p_order_id;

  return v_merged;
end;
$$
$s0500a$;
    insert into _g0500 values ('patch_delivery_stop(uuid, integer, jsonb)', 'rewritten');
  elsif h in ('21c71c2fd7a5f9068f397026a28a5fd2') then insert into _g0500 values ('patch_delivery_stop(uuid, integer, jsonb)', 'already');
  else insert into _g0500 values ('patch_delivery_stop(uuid, integer, jsonb)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'patch_delivery_stop(uuid, integer, jsonb)';
  end if;
end
$g0500$;

-- payment_invoice_issue(uuid, jsonb)
--   source: repo 0476_every_invoice_door_posts_and_a_method_is_a_setting.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.payment_invoice_issue(uuid, jsonb)'); h text;
begin
  if p is null then insert into _g0500 values ('payment_invoice_issue(uuid, jsonb)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'e8c7351745eeaefc8a5e58960188bf68' then
    execute $s0500a$
create or replace function public.payment_invoice_issue(
  p_invoice_id uuid,
  p_snapshot jsonb
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_inv invoices;
  v_no text;
  v_seq integer := 1;
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_entry uuid;   -- 0476
begin
  if coalesce((public.app_role() is null or public.app_role() not in ('operation', 'finance', 'principal')), true) then   -- 0476: coalesced
    raise exception 'forbidden' using errcode = '42501', detail = 'not_payment_staff';
  end if;
  if p_snapshot is null or p_snapshot = '{}'::jsonb then
    raise exception 'the document snapshot is required'
      using errcode = '22023', detail = 'snapshot_required';
  end if;

  select * into v_inv from invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice not found' using errcode = '22023', detail = 'invoice_not_found';
  end if;
  if v_inv.status <> 'draft' then
    raise exception 'only a draft invoice can be issued'
      using errcode = '22023', detail = 'not_a_draft';
  end if;

  -- The governed document scheme: PREFIX-DDMMYY-NNNN, hashed tail, collision
  -- retry — the same arithmetic the receipt number uses (0351).
  loop
    v_no := 'INV-' || to_char(v_today, 'DDMMYY') || '-' ||
            lpad(mod(abs(hashtext(v_inv.id::text || ':' || v_seq::text)), 10000)::text, 4, '0');
    exit when not exists (select 1 from invoices where invoice_no = v_no);
    v_seq := v_seq + 1;
  end loop;

  update invoices
     set status = 'issued', invoice_no = v_no, issued_at = v_today,
         issued_by = auth.uid(),
         snapshot = p_snapshot || jsonb_build_object('invoice_no', v_no, 'issued_at', v_today)
   where id = v_inv.id
   returning * into v_inv;

  -- The order wears its live Sales Invoice number.
  if v_inv.kind = 'sales' then
    update orders set invoice_no = v_no, invoiced_at = v_today
     where id = v_inv.order_id;
  end if;

  insert into order_history (order_id, text, by_role, by_user_id)
  values (v_inv.order_id,
          format('Invoice issued · %s (RM %s)', v_no, v_inv.amount),
          public.app_role(), auth.uid());

  -- ── 0476 · every issue door posts. No exception handler: if the ledger
  -- refuses, the number, the snapshot and the order stamp roll back with it.
  v_entry := public._sales_invoice_to_ledger(v_no);

  return jsonb_build_object('invoice', to_jsonb(v_inv), 'gl_entry_id', v_entry);
end;
$fn$
$s0500a$;
    insert into _g0500 values ('payment_invoice_issue(uuid, jsonb)', 'rewritten');
  elsif h in ('2c95fdf98bad5cd42e0d3baa4134295f') then insert into _g0500 values ('payment_invoice_issue(uuid, jsonb)', 'already');
  else insert into _g0500 values ('payment_invoice_issue(uuid, jsonb)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'payment_invoice_issue(uuid, jsonb)';
  end if;
end
$g0500$;

-- payment_invoice_prepare(uuid, numeric, numeric)
--   source: repo 0429_an_invoice_asks_for_money_and_keeps_its_lineage.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.payment_invoice_prepare(uuid, numeric, numeric)'); h text;
begin
  if p is null then insert into _g0500 values ('payment_invoice_prepare(uuid, numeric, numeric)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '89e385b5ce2222dd8d9a465d9937d41d' then
    execute $s0500a$
create or replace function public.payment_invoice_prepare(
  p_order_id uuid,
  p_amount numeric,
  p_tax_amount numeric default 0
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_existing invoices;
  v_row invoices;
begin
  if (public.app_role() is null or public.app_role() not in ('operation', 'finance', 'principal')) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_payment_staff';
  end if;
  if p_order_id is null or p_amount is null or p_amount <= 0 then
    raise exception 'order and a positive amount are required'
      using errcode = '22023', detail = 'invalid_input';
  end if;
  if coalesce(p_tax_amount, 0) < 0 then
    raise exception 'tax cannot be negative' using errcode = '22023', detail = 'invalid_input';
  end if;

  perform 1 from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found' using errcode = '22023', detail = 'order_not_found';
  end if;

  select * into v_existing from invoices
   where order_id = p_order_id and kind = 'sales' and status <> 'voided'
   limit 1;

  if found and v_existing.status = 'issued' then
    -- An issued invoice is never edited here; correction goes through
    -- payment_invoice_void_replace.
    return jsonb_build_object('already_issued', true, 'invoice', to_jsonb(v_existing));
  end if;

  if found then
    update invoices
       set amount = p_amount, tax_amount = coalesce(p_tax_amount, 0)
     where id = v_existing.id
     returning * into v_row;
    return jsonb_build_object('already_issued', false, 'invoice', to_jsonb(v_row));
  end if;

  insert into invoices (order_id, amount, tax_amount, kind, status, created_by)
  values (p_order_id, p_amount, coalesce(p_tax_amount, 0), 'sales', 'draft', auth.uid())
  returning * into v_row;

  return jsonb_build_object('already_issued', false, 'invoice', to_jsonb(v_row));
end;
$fn$
$s0500a$;
    insert into _g0500 values ('payment_invoice_prepare(uuid, numeric, numeric)', 'rewritten');
  elsif h in ('28d2280c7f87e9323e92de378eec756f') then insert into _g0500 values ('payment_invoice_prepare(uuid, numeric, numeric)', 'already');
  else insert into _g0500 values ('payment_invoice_prepare(uuid, numeric, numeric)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'payment_invoice_prepare(uuid, numeric, numeric)';
  end if;
end
$g0500$;

-- payment_record(uuid, numeric, date, text, text, text, text, text, text, boolean, text, boolean)
--   source: repo 0448_a_likely_duplicate_is_inspected_by_the_approver.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.payment_record(uuid, numeric, date, text, text, text, text, text, text, boolean, text, boolean)'); h text;
begin
  if p is null then insert into _g0500 values ('payment_record(uuid, numeric, date, text, text, text, text, text, text, boolean, text, boolean)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '104291280818166b28233f49fbf59e49' then
    execute $s0500a$
create or replace function public.payment_record(
  p_order_id uuid, p_amount numeric, p_paid_on date, p_method text, p_kind text,
  p_reference text default null, p_note text default null, p_receipt_url text default null,
  p_receipt_no text default null, p_counts_toward_paid boolean default true,
  p_idempotency_key text default null,
  p_duplicate_ack boolean default false
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_key   text := coalesce(nullif(btrim(coalesce(p_idempotency_key, '')), ''), p_receipt_no);
  v_dups  jsonb := '[]'::jsonb;
  v_names text;
  v_uid   uuid := auth.uid();
  v_duty  jsonb;
  v_meta  jsonb := '{}'::jsonb;
begin
  -- 0448 also closes a three-valued hole this door has carried since 0351:
  -- `app_role()` answers NULL for a JWT whose subject has no `app_users` row,
  -- and `NULL not in (...)` is NULL, which `if` treats as FALSE — so the guard
  -- did not fire and an unknown caller reached the insert. Only the
  -- `recorded_by` foreign key stopped the money, by accident. Coalesced, the
  -- unknown caller is refused by the guard that was written to refuse it.
  if coalesce((public.app_role() is null or public.app_role() not in ('operation','principal')), true) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_operation';
  end if;

  -- CONCURRENCY. Take the order lock BEFORE looking for duplicates, so two
  -- submissions of the same transfer cannot both pass the gate: the second
  -- waits here, and after the first commits it SEES that payment. The owner
  -- re-locks the same row in the same transaction, which costs nothing.
  perform 1 from orders where id = p_order_id for update;

  -- IDEMPOTENT RETRY ≠ DUPLICATE. The same channel and key arriving again is
  -- the same act; the owner answers it with the original row. Never gate it.
  if not exists (
    select 1 from order_payments
     where source_channel = 'manual_payment' and idempotency_key = v_key
  ) then
    v_dups := public._payment_duplicate_matches(p_order_id, p_amount, p_paid_on, p_reference);

    if jsonb_array_length(v_dups) > 0 then
      select string_agg(
               format('%s · RM %s · %s%s',
                      coalesce(d->>'receipt_no', 'payment'),
                      to_char((d->>'amount')::numeric, 'FM999,999,990.00'),
                      d->>'paid_on',
                      case when (d->>'order_id') is distinct from p_order_id::text
                           then ' · SO ' || coalesce(d->>'so', '?') else '' end),
               '; ' order by ord)
        into v_names
        from jsonb_array_elements(v_dups) with ordinality as t(d, ord);

      if not coalesce(p_duplicate_ack, false) then
        raise exception
          'This looks like a payment already recorded (%). Open it first — if this is a different payment, a Payment Approver continues.',
          v_names
          using errcode = 'P0001', detail = 'possible_duplicate_payment';
      end if;

      -- PRIVILEGED CONTINUATION (§5 owner table: Payment Approver). The duty
      -- answer is coalesced — an unassigned duty must refuse, never admit.
      v_duty := public.workspace_resolve_duty('payment_approver', null);
      if not (coalesce(public.app_role() = 'principal', false)
              or (v_uid is not null
                  and coalesce(nullif(v_duty->>'actor_user_id', '')::uuid = v_uid, false))) then
        raise exception
          'Only the Payment Approver can record this — it looks like a payment already recorded (%).',
          v_names
          using errcode = '42501', detail = 'not_payment_approver';
      end if;

      -- What the approver was shown, and that they continued, live on the row.
      v_meta := jsonb_build_object(
        'duplicate_ack', true,
        'duplicate_ack_by', v_uid,
        'duplicate_ack_at', now(),
        'duplicate_matches', v_dups);

      insert into ops_activity_log(order_id, action, actor_id, detail)
      values (p_order_id, 'payment.duplicate_acknowledged', v_uid,
              jsonb_build_object('amount', p_amount, 'paid_on', p_paid_on,
                                 'reference', nullif(btrim(coalesce(p_reference,'')),''),
                                 'matches', v_dups));
    end if;
  end if;

  return public._customer_payment_post(p_order_id, p_amount, p_paid_on, p_method, p_kind,
    'manual_payment', v_key, p_reference,
    p_reference, p_note, p_receipt_url, p_receipt_no, v_meta, p_counts_toward_paid);
end;
$fn$
$s0500a$;
    insert into _g0500 values ('payment_record(uuid, numeric, date, text, text, text, text, text, text, boolean, text, boolean)', 'rewritten');
  elsif h in ('17d9c1303d2f1f8ef2a36b2b13eb36fe') then insert into _g0500 values ('payment_record(uuid, numeric, date, text, text, text, text, text, text, boolean, text, boolean)', 'already');
  else insert into _g0500 values ('payment_record(uuid, numeric, date, text, text, text, text, text, text, boolean, text, boolean)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'payment_record(uuid, numeric, date, text, text, text, text, text, text, boolean, text, boolean)';
  end if;
end
$g0500$;

-- payment_record_message_sent(uuid, uuid, text, text, text, text)
--   source: repo 0434_a_sent_message_is_recorded_with_its_proof.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.payment_record_message_sent(uuid, uuid, text, text, text, text)'); h text;
begin
  if p is null then insert into _g0500 values ('payment_record_message_sent(uuid, uuid, text, text, text, text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '7ac52b3194a251b4be9dcfc4ffbd769b' then
    execute $s0500a$
create or replace function public.payment_record_message_sent(
  p_order_id uuid,
  p_invoice_id uuid,
  p_kind text,
  p_message_text text,
  p_template_key text,
  p_screenshot_url text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row payment_communications;
begin
  if (public.app_role() is null or public.app_role() not in ('operation', 'finance', 'principal')) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_payment_staff';
  end if;
  if p_order_id is null then
    raise exception 'the order is required' using errcode = '22023', detail = 'order_required';
  end if;
  if p_kind not in ('payment_request', 'reminder', 'receipt', 'storage', 'other') then
    raise exception 'unknown message kind' using errcode = '22023', detail = 'bad_kind';
  end if;
  if nullif(btrim(coalesce(p_message_text, '')), '') is null then
    raise exception 'the sent message text is required'
      using errcode = '22023', detail = 'message_required';
  end if;
  -- Opening WhatsApp is neither sent nor read: the record needs the proof.
  if nullif(btrim(coalesce(p_screenshot_url, '')), '') is null then
    raise exception 'the sent screenshot is required'
      using errcode = '22023', detail = 'screenshot_required';
  end if;
  perform 1 from orders where id = p_order_id;
  if not found then
    raise exception 'order not found' using errcode = '22023', detail = 'order_not_found';
  end if;
  if p_invoice_id is not null then
    perform 1 from invoices where id = p_invoice_id and order_id = p_order_id;
    if not found then
      raise exception 'the invoice does not belong to this order'
        using errcode = '22023', detail = 'invoice_mismatch';
    end if;
  end if;

  insert into payment_communications
    (order_id, invoice_id, kind, message_text, template_key,
     sent_screenshot_url, recorded_by)
  values
    (p_order_id, p_invoice_id, p_kind, p_message_text,
     nullif(btrim(coalesce(p_template_key, '')), ''),
     btrim(p_screenshot_url), auth.uid())
  returning * into v_row;

  insert into order_history (order_id, text, by_role, by_user_id)
  values (p_order_id,
          format('Payment message sent · %s', p_kind),
          public.app_role(), auth.uid());

  update ops_order_control set last_chased_at = now(), updated_by = auth.uid(), updated_at = now()
   where order_id = p_order_id;

  return to_jsonb(v_row);
end;
$fn$
$s0500a$;
    insert into _g0500 values ('payment_record_message_sent(uuid, uuid, text, text, text, text)', 'rewritten');
  elsif h in ('bce1bf23e62334ec92152ce1ed78dd34') then insert into _g0500 values ('payment_record_message_sent(uuid, uuid, text, text, text, text)', 'already');
  else insert into _g0500 values ('payment_record_message_sent(uuid, uuid, text, text, text, text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'payment_record_message_sent(uuid, uuid, text, text, text, text)';
  end if;
end
$g0500$;

-- payment_settings_gate()
--   source: repo 0431_payment_settings_hold_the_banks_methods_and_storage_rules.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.payment_settings_gate()'); h text;
begin
  if p is null then insert into _g0500 values ('payment_settings_gate()', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'dde87ac1490dc9180963423cc4314b77' then
    execute $s0500a$
create or replace function public.payment_settings_gate()
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := (select public.app_role());
  v_duties text[];
begin
  if v_role is null then
    raise exception 'forbidden' using errcode = '42501', detail = 'no active account';
  end if;
  if (v_role is null or v_role <> 'principal') then
    select coalesce(array_agg(pd.duty_key), '{}'::text[])
      into v_duties
      from app_users u
      join org_position_duties pd on pd.position_id = u.position_id
     where u.id = auth.uid() and u.role <> 'dealer' and u.status = 'active';
    if not ('ops_manager' = any(coalesce(v_duties, '{}'::text[]))) then
      raise exception 'forbidden' using errcode = '42501',
        detail = 'payment settings are set by the manager';
    end if;
  end if;
end;
$fn$
$s0500a$;
    insert into _g0500 values ('payment_settings_gate()', 'rewritten');
  elsif h in ('192d2dde0c2990e86dd30a958421435a') then insert into _g0500 values ('payment_settings_gate()', 'already');
  else insert into _g0500 values ('payment_settings_gate()', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'payment_settings_gate()';
  end if;
end
$g0500$;

-- pickup_event_render_payload(uuid)
--   source: repo 0107_supplier_thread_pickup.sql; 1 gate edit(s)
--   source: live definition (dynamic renames applied); 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.pickup_event_render_payload(uuid)'); h text;
begin
  if p is null then insert into _g0500 values ('pickup_event_render_payload(uuid)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '711199d49cc186a4ed05f104e915415a' then
    execute $s0500a$
CREATE OR REPLACE FUNCTION public.pickup_event_render_payload(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_event       po_pickup_events;
  v_po          purchase_orders;
  v_supplier    suppliers;
  v_threads     jsonb;
  v_caller_role app_role;
BEGIN
  v_caller_role := public.app_role();
  SELECT * INTO v_event FROM po_pickup_events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'event not found' USING ERRCODE = '42P01', DETAIL = 'event_not_found';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = v_event.po_id;

  -- RLS-equivalent gate: supplier sees own PO; partner sees own assigned PO;
  -- logistics + principal see all.
  IF v_caller_role = 'supplier' AND v_po.supplier_id IS DISTINCT FROM public.app_supplier_id() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501', DETAIL = 'cross_tenant';
  END IF;
  IF v_caller_role = 'partner' AND v_po.procurement_partner_id IS DISTINCT FROM public.app_partner_id() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501', DETAIL = 'cross_tenant';
  END IF;
  IF (v_caller_role is null or v_caller_role NOT IN ('supplier', 'partner', 'logistics', 'principal')) THEN
    RAISE EXCEPTION 'forbidden: role not allowed'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  SELECT * INTO v_supplier FROM suppliers WHERE id = v_po.supplier_id;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'thread_id', t.id,
      'order_id', t.order_id,
      'order_dl', o.dl,
      'customer_name', o.customer_name,
      'customer_delivery_date', o.delivery_date,
      'sku_lines', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('sku', ol.sku, 'qty', ol.qty)), '[]'::jsonb)
          FROM order_lines ol
         WHERE ol.order_id = t.order_id
      )
    )
  ), '[]'::jsonb) INTO v_threads
  FROM order_supplier_threads t
  LEFT JOIN orders o ON o.id = t.order_id
  WHERE t.pickup_event_id = p_event_id;

  RETURN jsonb_build_object(
    'event_id', v_event.id,
    'do_number', v_event.do_number,
    'do_file_path', v_event.do_file_path,
    'do_note', v_event.do_note,
    'picked_up_at', v_event.picked_up_at,
    'ack_role', v_event.ack_role,
    'po_id', v_po.id,
    'po_eta_date', v_po.eta_date,
    'supplier_name', v_supplier.name,
    'threads', v_threads
  );
END;
$$
$s0500a$;
    insert into _g0500 values ('pickup_event_render_payload(uuid)', 'rewritten');
  elsif h = '8f282563dfd5c27c1a09374c54e5e68c' then
    execute $s0500b$
CREATE OR REPLACE FUNCTION public.pickup_event_render_payload(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_event       po_pickup_events;
  v_po          purchase_orders;
  v_supplier    suppliers;
  v_threads     jsonb;
  v_caller_role app_role;
BEGIN
  v_caller_role := public.app_role();
  SELECT * INTO v_event FROM po_pickup_events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'event not found' USING ERRCODE = '42P01', DETAIL = 'event_not_found';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = v_event.po_id;

  -- RLS-equivalent gate: supplier sees own PO; partner sees own assigned PO;
  -- logistics + principal see all.
  IF v_caller_role = 'supplier' AND v_po.supplier_id IS DISTINCT FROM public.app_supplier_id() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501', DETAIL = 'cross_tenant';
  END IF;
  IF v_caller_role = 'partner' AND v_po.procurement_partner_id IS DISTINCT FROM public.app_partner_id() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501', DETAIL = 'cross_tenant';
  END IF;
  IF (v_caller_role is null or v_caller_role NOT IN ('supplier', 'partner', 'operation', 'principal')) THEN
    RAISE EXCEPTION 'forbidden: role not allowed'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  SELECT * INTO v_supplier FROM suppliers WHERE id = v_po.supplier_id;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'thread_id', t.id,
      'order_id', t.order_id,
      'order_dl', o.so,
      'customer_name', o.customer_name,
      'customer_delivery_date', o.delivery_date,
      'sku_lines', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('sku', ol.sku, 'qty', ol.qty)), '[]'::jsonb)
          FROM order_lines ol
         WHERE ol.order_id = t.order_id
      )
    )
  ), '[]'::jsonb) INTO v_threads
  FROM order_supplier_threads t
  LEFT JOIN orders o ON o.id = t.order_id
  WHERE t.pickup_event_id = p_event_id;

  RETURN jsonb_build_object(
    'event_id', v_event.id,
    'do_number', v_event.do_number,
    'do_file_path', v_event.do_file_path,
    'do_note', v_event.do_note,
    'picked_up_at', v_event.picked_up_at,
    'ack_role', v_event.ack_role,
    'po_id', v_po.id,
    'po_eta_date', v_po.eta_date,
    'supplier_name', v_supplier.name,
    'threads', v_threads
  );
END;
$function$
$s0500b$;
    insert into _g0500 values ('pickup_event_render_payload(uuid)', 'rewritten');
  elsif h in ('9251627f7c89d57e6560109d0571cbd7', '79bb0c2ebf4a3ead3efff9a95b9fce85') then insert into _g0500 values ('pickup_event_render_payload(uuid)', 'already');
  else insert into _g0500 values ('pickup_event_render_payload(uuid)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'pickup_event_render_payload(uuid)';
  end if;
end
$g0500$;

-- po_receive(text, text, text, integer, text)
--   source: repo 0003_rpcs.sql; 1 gate edit(s)
--   source: live definition (dynamic renames applied); 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.po_receive(text, text, text, integer, text)'); h text;
begin
  if p is null then insert into _g0500 values ('po_receive(text, text, text, integer, text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'e771307e78ea7f67e98dd7286c9549e1' then
    execute $s0500a$
create or replace function po_receive(
  p_po_id        text,
  p_do_number    text,
  p_do_note      text,
  p_received_qty int,
  p_do_photo_url text
) returns po_receipts
language plpgsql security definer as $$
declare
  v_po purchase_orders;
  v_receipt po_receipts;
begin
  if (public.app_role() is null or public.app_role() not in ('logistics','principal')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_po from purchase_orders where id = p_po_id;
  if v_po.id is null then raise exception 'PO not found'; end if;

  insert into po_receipts (po_id, do_number, do_note, received_qty, do_photo_url, received_by)
  values (p_po_id, p_do_number, p_do_note, p_received_qty, p_do_photo_url, auth.uid())
  returning * into v_receipt;

  insert into stock_balances (sku, warehouse_id, qty)
  values (v_po.sku, v_po.warehouse_id, p_received_qty)
  on conflict (sku, warehouse_id)
    do update set qty = stock_balances.qty + excluded.qty, updated_at = now();

  insert into stock_movements (sku, warehouse_id, qty, kind, ref, note, by_role, by_user_id)
  values (v_po.sku, v_po.warehouse_id, p_received_qty, 'in', p_po_id,
          format('DO #%s', p_do_number), public.app_role(), auth.uid());

  update purchase_orders set status = 'received', sup_status = 'delivered', updated_at = now()
    where id = p_po_id;

  insert into po_history (po_id, text, by_role, by_user_id)
  values (p_po_id, format('Received · DO #%s · qty %s', p_do_number, p_received_qty),
          'logistics', auth.uid());

  return v_receipt;
end;
$$
$s0500a$;
    insert into _g0500 values ('po_receive(text, text, text, integer, text)', 'rewritten');
  elsif h = '4e701495a392ec5c7cfb781a16477aaf' then
    execute $s0500b$
CREATE OR REPLACE FUNCTION public.po_receive(p_po_id text, p_do_number text, p_do_note text, p_received_qty integer, p_do_photo_url text)
 RETURNS po_receipts
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_po purchase_orders;
  v_receipt po_receipts;
begin
  if (public.app_role() is null or public.app_role() not in ('operation','principal')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_po from purchase_orders where id = p_po_id;
  if v_po.id is null then raise exception 'PO not found'; end if;

  insert into po_receipts (po_id, do_number, do_note, received_qty, do_photo_url, received_by)
  values (p_po_id, p_do_number, p_do_note, p_received_qty, p_do_photo_url, auth.uid())
  returning * into v_receipt;

  insert into stock_balances (sku, warehouse_id, qty)
  values (v_po.sku, v_po.warehouse_id, p_received_qty)
  on conflict (sku, warehouse_id)
    do update set qty = stock_balances.qty + excluded.qty, updated_at = now();

  insert into stock_movements (sku, warehouse_id, qty, kind, ref, note, by_role, by_user_id)
  values (v_po.sku, v_po.warehouse_id, p_received_qty, 'in', p_po_id,
          format('DO #%s', p_do_number), public.app_role(), auth.uid());

  update purchase_orders set status = 'received', sup_status = 'delivered', updated_at = now()
    where id = p_po_id;

  insert into po_history (po_id, text, by_role, by_user_id)
  values (p_po_id, format('Received · DO #%s · qty %s', p_do_number, p_received_qty),
          'operation', auth.uid());

  return v_receipt;
end;
$function$
$s0500b$;
    insert into _g0500 values ('po_receive(text, text, text, integer, text)', 'rewritten');
  elsif h in ('62a0740c38ec870690667e287b3966ee', '46118a28c99ee4f957d55843743c5360') then insert into _g0500 values ('po_receive(text, text, text, integer, text)', 'already');
  else insert into _g0500 values ('po_receive(text, text, text, integer, text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'po_receive(text, text, text, integer, text)';
  end if;
end
$g0500$;

-- purchasing_settings_gate()
--   source: repo 0303_purchasing_settings.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.purchasing_settings_gate()'); h text;
begin
  if p is null then insert into _g0500 values ('purchasing_settings_gate()', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '0bf5a0fe1bbbd3e3c5ea4c5e777b9058' then
    execute $s0500a$
create or replace function public.purchasing_settings_gate()
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role   text := (select public.app_role());
  v_duties text[];
begin
  if v_role is null then
    raise exception 'forbidden' using errcode = '42501',
      detail = 'no active account';
  end if;

  if (v_role is null or v_role <> 'principal') then
    select coalesce(array_agg(pd.duty_key), '{}'::text[])
      into v_duties
      from app_users u
      join org_position_duties pd on pd.position_id = u.position_id
     where u.id = auth.uid()
       and u.role <> 'dealer'
       and u.status = 'active';

    if not ('ops_manager' = any(coalesce(v_duties, '{}'::text[]))) then
      raise exception 'forbidden' using errcode = '42501',
        detail = 'purchasing settings are set by the manager';
    end if;
  end if;

  return v_role;
end;
$function$
$s0500a$;
    insert into _g0500 values ('purchasing_settings_gate()', 'rewritten');
  elsif h in ('bd59673754d43ded52975d67a3da4041') then insert into _g0500 values ('purchasing_settings_gate()', 'already');
  else insert into _g0500 values ('purchasing_settings_gate()', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'purchasing_settings_gate()';
  end if;
end
$g0500$;

-- replace_order_lines(uuid, uuid[], jsonb, jsonb, text, uuid)
--   source: repo 0257_change_request_replace_and_service_addons.sql; 2 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.replace_order_lines(uuid, uuid[], jsonb, jsonb, text, uuid)'); h text;
begin
  if p is null then insert into _g0500 values ('replace_order_lines(uuid, uuid[], jsonb, jsonb, text, uuid)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '1e7229e876d8fbd01c6a1169dd9fc551' then
    execute $s0500a$
create or replace function public.replace_order_lines(
  p_order_id uuid,
  p_old_line_ids uuid[],
  p_lines jsonb,
  p_addons_replace jsonb DEFAULT NULL,
  p_source text DEFAULT 'direct',
  p_change_request_id uuid DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order            orders;
  v_req              order_change_requests;
  v_role             app_role;
  v_caller_dealer_id uuid;
  v_old              order_lines;
  v_old_attrs        jsonb;
  v_old_count        int := 0;
  v_old_total        numeric(14,2) := 0;
  v_old_snapshot     jsonb := '[]'::jsonb;
  v_target_count     int;
  v_build_keys       text[] := '{}';
  v_key              text;
  v_present          int;
  v_named            int;
  v_line             jsonb;
  v_addon            jsonb;
  v_count            int := 0;
  v_new_total        numeric(14,2) := 0;
  v_sku              text;
  v_qty              int;
  v_price            numeric;
  v_has_sofa         boolean;
  v_has_other        boolean;
begin
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();

  -- 0222 precedent: a NULL role (anon key / orphaned JWT) is rejected outright.
  if v_role is null then
    raise exception 'forbidden: no app role' using errcode = '42501';
  end if;

  -- Lock the order row: a replace deletes + re-inserts and must not race a
  -- concurrent add / proceed on the same order.
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = '42P01';
  end if;

  if (v_role is null or v_role not in ('principal','operation','finance','bd'))
     and v_order.dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer edit' using errcode = '42501';
  end if;

  if p_source = 'direct' then
    -- Place lane exactly (same gate as add_order_lines 'direct').
    if v_order.status <> 'place'
       or v_order.operation_stage is not null
       or v_order.source_system = 'autocount' then
      raise exception 'Products can only be edited while the order is in Order placed'
        using errcode = '22023', detail = 'wrong_status';
    end if;
  elsif p_source = 'change_request' then
    -- 0257 — APPROVE = apply for a replace_lines request: operation/principal
    -- only; the request must be the order's own PENDING replace_lines one.
    if (v_role is null or v_role not in ('operation','principal')) then
      raise exception 'forbidden: only operation/principal approve change requests'
        using errcode = '42501';
    end if;
    if p_change_request_id is null then
      raise exception 'change_request source requires p_change_request_id'
        using errcode = '22023', detail = 'invalid_request';
    end if;
    select * into v_req from order_change_requests
     where id = p_change_request_id for update;
    if not found or v_req.order_id is distinct from p_order_id then
      raise exception 'Change request not found for this order'
        using errcode = '42P01';
    end if;
    if v_req.kind is distinct from 'replace_lines' then
      raise exception 'this change request is not an item-change request'
        using errcode = '22023', detail = 'wrong_kind';
    end if;
    if v_req.status <> 'pending' or v_req.applied_at is not null then
      raise exception 'Change request is no longer pending'
        using errcode = '22023', detail = 'wrong_status';
    end if;
    if v_order.status in ('delivered','cancelled') then
      raise exception 'Order is no longer editable'
        using errcode = '22023', detail = 'wrong_status';
    end if;
  else
    raise exception 'unsupported replace_order_lines source'
      using errcode = '22023', detail = 'unsupported_source';
  end if;

  -- Target ids: non-empty, no duplicates.
  select count(distinct x) into v_target_count from unnest(p_old_line_ids) x;
  if v_target_count is null or v_target_count < 1 or v_target_count > 30
     or v_target_count is distinct from array_length(p_old_line_ids, 1) then
    raise exception 'p_old_line_ids must name 1..30 distinct lines'
      using errcode = '22023', detail = 'invalid_target';
  end if;

  -- Old rows: all must belong to THIS order. 0256: a free_gift row IS a valid
  -- target (the route sends the replaced line's own gift children — wizard
  -- semantics); free_item / pwp / bundle / combo rows stay non-editable.
  for v_old in
    select ol.* from order_lines ol
     where ol.id = any(p_old_line_ids)
       and ol.order_id = p_order_id
  loop
    v_old_attrs := coalesce(v_old.attrs, '{}'::jsonb);
    if (v_old_attrs ? 'free_item')
       or (v_old_attrs ? 'pwp') or (v_old_attrs ? 'bundle_group')
       or (v_old_attrs ? 'combo_key') then
      raise exception 'line % is not editable', v_old.id
        using errcode = '22023', detail = 'line_not_editable';
    end if;
    if v_old_attrs ? 'sofa_build_key' then
      v_build_keys := array_append(v_build_keys, v_old_attrs->>'sofa_build_key');
    end if;
    v_old_count := v_old_count + 1;
    v_old_total := v_old_total + (v_old.unit_price * v_old.qty);
    v_old_snapshot := v_old_snapshot || jsonb_build_array(jsonb_build_object(
      'id', v_old.id, 'sku', v_old.sku, 'qty', v_old.qty,
      'unit_price', v_old.unit_price, 'attrs', v_old.attrs));
  end loop;

  if v_old_count is distinct from v_target_count then
    raise exception 'target line(s) not found on this order'
      using errcode = '22023', detail = 'line_not_found';
  end if;

  -- 0257 PRODUCTION-SAFETY GATE (both sources): order_supplier_threads is ON
  -- DELETE CASCADE on order_lines (0124) — deleting a threaded line would
  -- silently destroy a live procurement thread. Threads are born at the ops
  -- confirm action; before that every line is thread-less and safe to swap.
  if exists (
    select 1 from order_supplier_threads t
     where t.order_line_id = any(p_old_line_ids)
  ) then
    raise exception 'item is already in HQ production — it can no longer be swapped here'
      using errcode = '22023', detail = 'line_in_production';
  end if;

  -- A sofa group must be replaced WHOLE — a partial delete would orphan the
  -- build's remaining compartment rows.
  for v_key in select distinct k from unnest(v_build_keys) k loop
    select count(*) into v_present
      from order_lines ol
     where ol.order_id = p_order_id
       and ol.attrs->>'sofa_build_key' = v_key;
    select count(*) into v_named
      from unnest(v_build_keys) k where k = v_key;
    if v_present is distinct from v_named then
      raise exception 'sofa build must be replaced as a whole group'
        using errcode = '22023', detail = 'partial_sofa_group';
    end if;
  end loop;

  -- 0232: cap 30 — the Hono route caps CLIENT input at ONE line, but a sofa
  -- build explodes into per-compartment rows + RM0 gift appends.
  if jsonb_typeof(p_lines) is distinct from 'array'
     or jsonb_array_length(p_lines) < 1
     or jsonb_array_length(p_lines) > 30 then
    raise exception 'p_lines must be an array of 1..30 lines'
      using errcode = '22023', detail = 'invalid_lines';
  end if;

  -- Per-line shape + sku existence (the Hono route already priced +
  -- validated; cheap defensive re-check). 0256: `free_gift` appends and
  -- code-less `pwp` claims are legal replacement rows (Hono recompute is the
  -- real gate — same posture as add_order_lines); `free_item` stays rejected.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_sku   := v_line->>'sku';
    v_qty   := (v_line->>'qty')::int;
    v_price := (v_line->>'unit_price')::numeric;
    if coalesce(v_sku, '') = '' or v_qty is null or v_qty < 1 or v_qty > 99
       or v_price is null or v_price < 0 then
      raise exception 'invalid line shape'
        using errcode = '22023', detail = 'invalid_lines';
    end if;
    if not exists (select 1 from product_skus s where s.sku = v_sku) then
      raise exception 'unknown sku %', v_sku
        using errcode = '22023', detail = 'unknown_sku';
    end if;
    if coalesce(v_line->'attrs', '{}'::jsonb) ? 'free_item' then
      raise exception 'free_item markers are not allowed on replacement lines'
        using errcode = '22023', detail = 'invalid_lines';
    end if;
    v_new_total := v_new_total + (v_price * v_qty);
  end loop;

  -- THE rule (Loo 2026-07-25): up-sell only. Old total from the DB rows
  -- (authoritative), new total from the server-priced replacement. Gift rows
  -- are RM0 on both sides — they never move these totals. Applies to BOTH
  -- sources: HQ approval does not waive the no-downsell law.
  if v_new_total < v_old_total then
    raise exception 'replacement total RM % is below the original RM % — upgrades only',
      v_new_total::text, v_old_total::text
      using errcode = '22023', detail = 'downsell_blocked';
  end if;

  -- 0232: delivery addon replace-set — shape gate BEFORE any write.
  if p_addons_replace is not null then
    if jsonb_typeof(p_addons_replace) is distinct from 'array'
       or jsonb_array_length(p_addons_replace) > 10 then
      raise exception 'p_addons_replace must be an array of at most 10 addons'
        using errcode = '22023', detail = 'invalid_addons';
    end if;
    for v_addon in select * from jsonb_array_elements(p_addons_replace) loop
      if coalesce(v_addon->>'addon_key', '') not in ('DELIVERY','DELIVERY_CROSS','DELIVERY_ADD')
         or (v_addon->>'qty')::int is null or (v_addon->>'qty')::int < 1
         or (v_addon->>'unit_price')::numeric is null
         or (v_addon->>'unit_price')::numeric < 0 then
        raise exception 'invalid delivery addon shape'
          using errcode = '22023', detail = 'invalid_addons';
      end if;
    end loop;
  end if;

  -- 0089 category mutex over the POST-replace cart: (existing minus the
  -- replaced rows) ∪ replacement lines.
  select
    exists (
      select 1 from (
        select ol.sku from order_lines ol
         where ol.order_id = p_order_id and not (ol.id = any(p_old_line_ids))
        union all
        select l->>'sku' from jsonb_array_elements(p_lines) l
      ) merged
      join product_skus s on s.sku = merged.sku
      join product_models pm on pm.id = s.model_id
      where pm.category = 'sofa'
    ),
    exists (
      select 1 from (
        select ol.sku from order_lines ol
         where ol.order_id = p_order_id and not (ol.id = any(p_old_line_ids))
        union all
        select l->>'sku' from jsonb_array_elements(p_lines) l
      ) merged
      join product_skus s on s.sku = merged.sku
      join product_models pm on pm.id = s.model_id
      where pm.category in ('mattress','bedframe')
    )
  into v_has_sofa, v_has_other;

  if v_has_sofa and v_has_other then
    raise exception 'sofa cannot mix with mattress or bedframe in the same order'
      using errcode = '22023', detail = 'mixed_category_lines';
  end if;

  -- Apply: delete old + insert replacement, one transaction.
  delete from order_lines
   where id = any(p_old_line_ids) and order_id = p_order_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    insert into order_lines (order_id, sku, qty, attrs, unit_price)
    values (
      p_order_id,
      v_line->>'sku',
      (v_line->>'qty')::int,
      v_line->'attrs',
      (v_line->>'unit_price')::numeric
    );
    v_count := v_count + 1;
  end loop;

  -- 0232: atomic DELIVERY* replace — the Hono delivery recompute over the
  -- post-replace cart is authoritative for these three server-minted keys.
  if p_addons_replace is not null then
    delete from order_addons
     where order_id = p_order_id
       and addon_key in ('DELIVERY','DELIVERY_CROSS','DELIVERY_ADD');
    for v_addon in select * from jsonb_array_elements(p_addons_replace) loop
      insert into order_addons (order_id, addon_key, qty, unit_price, attrs)
      values (
        p_order_id,
        v_addon->>'addon_key',
        coalesce((v_addon->>'qty')::int, 1),
        (v_addon->>'unit_price')::numeric,
        v_addon->'attrs'
      );
    end loop;
  end if;

  -- 0257 — approve = apply + stamp, one transaction (mirrors add_order_lines).
  if p_source = 'change_request' then
    update order_change_requests
       set status = 'approved',
           decided_by = auth.uid(),
           decided_at = now(),
           applied_at = now()
     where id = p_change_request_id;
  end if;

  -- 0135 — a portal edit on an AutoCount order wins over re-import (only the
  -- change-request path reaches AutoCount orders; the direct gate blocks them).
  update orders
     set items_edited = case when source_system = 'autocount' then true else items_edited end,
         updated_at = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role, metadata)
  values (
    p_order_id,
    format(case when p_source = 'change_request'
                then 'Item change approved · RM %s → RM %s'
                else 'Product edited · RM %s → RM %s' end,
           v_old_total::text, v_new_total::text),
    v_role,
    jsonb_build_object(
      'kind', 'replace_lines',
      'source', p_source,
      'change_request_id', p_change_request_id,
      'old_lines', v_old_snapshot,
      'lines', p_lines,
      'addons_replace', p_addons_replace,
      'old_total', v_old_total,
      'new_total', v_new_total
    )
  );

  insert into audit_log (role, action, dealer_id, ref)
  values (v_role, 'order.lines_replaced', v_order.dealer_id, 'SO-' || v_order.so::text);

  return jsonb_build_object(
    'id', p_order_id,
    'removed', v_old_count,
    'added', v_count,
    'old_total', v_old_total,
    'new_total', v_new_total
  );
end;
$function$
$s0500a$;
    insert into _g0500 values ('replace_order_lines(uuid, uuid[], jsonb, jsonb, text, uuid)', 'rewritten');
  elsif h in ('6f8dd7b07cc184c9581ae1c9dce4373b') then insert into _g0500 values ('replace_order_lines(uuid, uuid[], jsonb, jsonb, text, uuid)', 'already');
  else insert into _g0500 values ('replace_order_lines(uuid, uuid[], jsonb, jsonb, text, uuid)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'replace_order_lines(uuid, uuid[], jsonb, jsonb, text, uuid)';
  end if;
end
$g0500$;

-- sales_order_amendment_impact(uuid)
--   source: repo 0348_an_amendment_is_decided_once_and_preserves_every_owner.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.sales_order_amendment_impact(uuid)'); h text;
begin
  if p is null then insert into _g0500 values ('sales_order_amendment_impact(uuid)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '1de2f95434c497b019be97646b1c485e' then
    execute $s0500a$
create or replace function public.sales_order_amendment_impact(p_amendment_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_role text := public.app_role();
  v_a sales_order_amendments%rowtype;
  v_o orders%rowtype;
  v_current numeric := 0;
  v_proposed numeric := 0;
  v_po int := 0;
  v_receiving int := 0;
  v_units int := 0;
  v_delivery int := 0;
  v_loans int := 0;
  v_tasks int := 0;
  v_refunds int := 0;
  v_stale boolean;
begin
  if (v_role is null or v_role not in ('operation','principal','finance','hr','bd')) then
    raise exception 'Internal roles only' using errcode = '42501';
  end if;
  select * into v_a from sales_order_amendments where id = p_amendment_id;
  if not found then raise exception 'Amendment not found' using errcode = 'P0002'; end if;
  select * into v_o from orders where id = v_a.order_id;

  select coalesce(sum(qty * unit_price),0) into v_current
    from order_lines where order_id = v_a.order_id;
  if v_a.proposed_snapshot ? 'lines' then
    select coalesce(sum((x->>'qty')::numeric * (x->>'unit_price')::numeric),0)
      into v_proposed from jsonb_array_elements(v_a.proposed_snapshot->'lines') x;
  else
    v_proposed := v_current;
  end if;
  select count(*) into v_po from purchase_orders where so = v_o.so;
  select count(*) into v_receiving from po_receipts r
    join purchase_orders p on p.id = r.po_id where p.so = v_o.so;
  select count(*) into v_units from ops_stock_items
    where reserved_ref = 'SO-' || v_o.so::text or sold_order_id = v_a.order_id;
  select count(*) into v_delivery from delivery_attempts where order_id = v_a.order_id;
  select count(*) into v_loans from ops_sofa_loans where order_id = v_a.order_id;
  select count(*) into v_tasks from ops_tasks
    where related_order_id = v_a.order_id and status in ('open','claimed');
  select count(*) into v_refunds from order_refunds
    where order_id = v_a.order_id and status in ('requested','approved');
  v_stale := public.sales_order_contractual_hash(v_a.order_id)
             is distinct from v_a.base_contractual_hash;

  return jsonb_build_object(
    'amendment_id', v_a.id,
    'order_id', v_a.order_id,
    'so', v_o.so,
    'base_revision', v_a.base_revision,
    'stale', v_stale,
    'commercial_delta', v_proposed - v_current,
    'findings', jsonb_build_array(
      jsonb_build_object('owner','Purchasing','kind','purchase_order','count',v_po,'blocks',false,'href','/operation?tab=purchase'),
      jsonb_build_object('owner','Receiving','kind','receipt','count',v_receiving,'blocks',false,'href','/operation?tab=receiving'),
      jsonb_build_object('owner','Stock','kind','unit','count',v_units,'blocks',false,'href','/operation?tab=stock-onhand'),
      jsonb_build_object('owner','Delivery','kind','attempt','count',v_delivery,'blocks',false,'href','/operation?tab=delivery'),
      jsonb_build_object('owner','Money','kind','commercial_delta','amount',v_proposed-v_current,'count',v_refunds,'blocks',false,'href','/operation?tab=payments'),
      jsonb_build_object('owner','Loan','kind','loan','count',v_loans,'blocks',false,'href','/operation?tab=loans'),
      jsonb_build_object('owner','Other Commitments','kind','work','count',v_tasks,'blocks',false,'href','/operation?tab=work')
    )
  );
end $$
$s0500a$;
    insert into _g0500 values ('sales_order_amendment_impact(uuid)', 'rewritten');
  elsif h in ('aeb19a934145bb3c542d5ee526ec1f8e') then insert into _g0500 values ('sales_order_amendment_impact(uuid)', 'already');
  else insert into _g0500 values ('sales_order_amendment_impact(uuid)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'sales_order_amendment_impact(uuid)';
  end if;
end
$g0500$;

-- sales_order_amendment_live(uuid)
--   source: repo 0354_the_object_page_edits_every_field_the_portal_asked.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.sales_order_amendment_live(uuid)'); h text;
begin
  if p is null then insert into _g0500 values ('sales_order_amendment_live(uuid)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '10ea04849101583ffbd488b9cb7c0727' then
    execute $s0500a$
create or replace function public.sales_order_amendment_live(p_order_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_role text := public.app_role();
  v_a    sales_order_amendments%rowtype;
  v_now  text;
begin
  if (v_role is null or v_role not in ('operation','principal','finance','hr','bd')) then
    raise exception 'Internal roles only' using errcode = '42501';
  end if;
  select * into v_a from sales_order_amendments
   where order_id = p_order_id
     and status in ('draft','submitted','issued','accepted')
   order by submitted_at desc limit 1;
  if not found then
    return jsonb_build_object('amendment', null);
  end if;
  v_now := public.sales_order_contractual_hash(p_order_id);
  return jsonb_build_object('amendment', jsonb_build_object(
    'id', v_a.id,
    'status', v_a.status,
    'reason', v_a.reason,
    'customer_asked_on', v_a.customer_asked_on,
    'base_revision', v_a.base_revision,
    'base_contractual_hash', v_a.base_contractual_hash,
    'current_contractual_hash', v_now,
    'stale', v_now is distinct from v_a.base_contractual_hash,
    'proposed_snapshot', v_a.proposed_snapshot,
    'submitted_at', v_a.submitted_at));
end $$
$s0500a$;
    insert into _g0500 values ('sales_order_amendment_live(uuid)', 'rewritten');
  elsif h in ('497c0e6bf1e69a80cb0c54d4675c789a') then insert into _g0500 values ('sales_order_amendment_live(uuid)', 'already');
  else insert into _g0500 values ('sales_order_amendment_live(uuid)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'sales_order_amendment_live(uuid)';
  end if;
end
$g0500$;

-- sales_order_apply_attribution(uuid)
--   source: repo 0333_every_door_that_mints_a_revision_raises_the_work.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.sales_order_apply_attribution(uuid)'); h text;
begin
  if p is null then insert into _g0500 values ('sales_order_apply_attribution(uuid)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '8e356019d860eebc5b2525897b07178a' then
    execute $s0500a$
create or replace function public.sales_order_apply_attribution(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role     text := public.app_role();
  v_req      order_change_requests%rowtype;
  v_order    orders%rowtype;
  v_changes  jsonb;
  v_fields   text[];
  v_floors   jsonb;
  v_block    jsonb;
  v_old      jsonb;
  v_next     int;
  v_work     int := 0;
begin
  if (v_role is null or v_role not in ('operation','principal')) then
    raise exception 'Operation/Principal only' using errcode = '42501';
  end if;
  select * into v_req from order_change_requests where id = p_request_id for update;
  if not found or v_req.kind <> 'attribution' then
    raise exception 'Attribution request not found' using errcode = 'P0002';
  end if;
  if v_req.applied_at is not null then
    return jsonb_build_object('id', p_request_id, 'already_applied', true);
  end if;
  if v_req.status <> 'approved' then
    raise exception 'Only an approved request can be applied'
      using errcode = '22023', detail = 'not_approved';
  end if;

  select * into v_order from orders where id = v_req.order_id for update;
  v_changes := v_req.payload->'changes';
  v_fields  := array(select jsonb_object_keys(v_changes));

  v_floors := public.sales_order_floors(v_req.order_id, v_fields);
  select f into v_block from jsonb_array_elements(v_floors->'findings') f
   where f->>'severity' = 'BLOCK' limit 1;
  if v_block is not null then
    raise exception '%', v_block->>'evidence' using errcode = '22023', detail = 'floor_blocked';
  end if;

  v_old := public.sales_order_snapshot(v_req.order_id);
  if not exists (select 1 from sales_order_revisions where order_id = v_req.order_id) then
    insert into sales_order_revisions(order_id, revision, snapshot, created_by)
    values (v_req.order_id, 1, v_old, auth.uid());
  end if;

  update orders set
    salesperson_id = case when v_changes ? 'salesperson_id'
                          then nullif(v_changes->>'salesperson_id','')::uuid
                          else salesperson_id end,
    dealer_id      = case when v_changes ? 'dealer_id'
                          then (v_changes->>'dealer_id')::uuid
                          else dealer_id end,
    outlet_id      = case when v_changes ? 'outlet_id'
                          then nullif(v_changes->>'outlet_id','')::uuid
                          else outlet_id end,
    channel        = case when v_changes ? 'channel'
                          then v_changes->>'channel'
                          else channel end,
    updated_at     = now()
  where id = v_req.order_id;

  select coalesce(max(revision), 1) + 1 into v_next
    from sales_order_revisions where order_id = v_req.order_id;
  insert into sales_order_revisions(order_id, revision, snapshot, created_by)
  values (v_req.order_id, v_next, public.sales_order_snapshot(v_req.order_id), auth.uid());

  update order_change_requests set applied_at = now() where id = p_request_id;

  insert into order_history(order_id, text, by_role, by_user_id, metadata)
  values (v_req.order_id,
          'Attribution change applied - Rev ' || v_next || ' - ' || array_to_string(v_fields, ', '),
          v_role::app_role, auth.uid(),
          jsonb_build_object('kind','attribution_applied','fields',to_jsonb(v_fields),'revision',v_next));

  -- 3.4 · the same call as SAVE's. Attribution raises NOTHING today, and that
  -- is the correct answer, not a gap: GATE 6 gives it one consequence (the
  -- commission month lock) and that consequence is a floor, never work.
  begin
    v_work := public._raise_correction_work(v_req.order_id, v_fields, v_next, 'B');
  exception when others then
    raise warning 'correction work not raised for % rev %: %', v_req.order_id, v_next, sqlerrm;
  end;

  return jsonb_build_object('id', p_request_id, 'revision', v_next,
                            'changed', to_jsonb(v_fields), 'findings', v_floors->'findings',
                            'correction_work_raised', v_work);
end $$
$s0500a$;
    insert into _g0500 values ('sales_order_apply_attribution(uuid)', 'rewritten');
  elsif h in ('4a6453d5727ec172f4c7f92c279ea8df') then insert into _g0500 values ('sales_order_apply_attribution(uuid)', 'already');
  else insert into _g0500 values ('sales_order_apply_attribution(uuid)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'sales_order_apply_attribution(uuid)';
  end if;
end
$g0500$;

-- sales_order_attribution_live(uuid)
--   source: repo 0335_the_approver_read_names_a_column_that_exists.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.sales_order_attribution_live(uuid)'); h text;
begin
  if p is null then insert into _g0500 values ('sales_order_attribution_live(uuid)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '1490738deeac240a5949c6c4c770425f' then
    execute $s0500a$
create or replace function public.sales_order_attribution_live(p_order_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_role text := public.app_role();
  v_req  order_change_requests%rowtype;
  v_ord  orders%rowtype;
  v_ch   jsonb;
  v_out  jsonb;
begin
  if (v_role is null or v_role not in ('operation','hr','principal')) then
    raise exception 'Operation, HR or Principal only' using errcode = '42501';
  end if;

  select * into v_ord from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  -- The ONE live request: pending, or approved and not yet applied. An
  -- applied or rejected request is history — the revision ledger carries it.
  select * into v_req
    from order_change_requests
   where order_id = p_order_id
     and kind = 'attribution'
     and (status = 'pending' or (status = 'approved' and applied_at is null))
   order by requested_at desc
   limit 1;

  if not found then
    return jsonb_build_object('request', null);
  end if;

  v_ch := v_req.payload->'changes';

  -- FROM -> TO, in names. The order's CURRENT value is the `from`, read now:
  -- a request that has waited while something else moved must show what the
  -- approver is actually deciding, not what was true at SUBMIT.
  v_out := jsonb_build_object(
    'id', v_req.id,
    'status', v_req.status,
    'reason', v_req.payload->>'reason',
    'created_at', v_req.requested_at,
    'decided_at', v_req.decided_at,
    'decision_note', v_req.decision_note,
    'applied_at', v_req.applied_at,
    'fields', to_jsonb(array(select jsonb_object_keys(v_ch)))
  );

  if v_ch ? 'salesperson_id' then
    v_out := v_out || jsonb_build_object('salesperson', jsonb_build_object(
      'from', (select name from salespersons where id = v_ord.salesperson_id),
      'to',   (select name from salespersons where id = nullif(v_ch->>'salesperson_id','')::uuid)));
  end if;
  if v_ch ? 'dealer_id' then
    v_out := v_out || jsonb_build_object('dealer', jsonb_build_object(
      'from', (select name from dealers where id = v_ord.dealer_id),
      'to',   (select name from dealers where id = nullif(v_ch->>'dealer_id','')::uuid)));
  end if;
  if v_ch ? 'outlet_id' then
    v_out := v_out || jsonb_build_object('outlet', jsonb_build_object(
      'from', (select name from outlets where id = v_ord.outlet_id),
      'to',   (select name from outlets where id = nullif(v_ch->>'outlet_id','')::uuid)));
  end if;
  if v_ch ? 'channel' then
    v_out := v_out || jsonb_build_object('channel', jsonb_build_object(
      'from', v_ord.channel, 'to', v_ch->>'channel'));
  end if;

  -- The approver route, stated by the SAME rule 0329 enforces, so the screen
  -- can name who may decide instead of guessing.
  v_out := v_out || jsonb_build_object(
    'approver',
    case when (array(select jsonb_object_keys(v_ch))) && array['dealer_id','channel']
         then 'principal' else 'hr_or_principal' end);

  return jsonb_build_object('request', v_out);
end $$
$s0500a$;
    insert into _g0500 values ('sales_order_attribution_live(uuid)', 'rewritten');
  elsif h in ('3e35f0fc0db1367419fcdeb8928fdf7c') then insert into _g0500 values ('sales_order_attribution_live(uuid)', 'already');
  else insert into _g0500 values ('sales_order_attribution_live(uuid)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'sales_order_attribution_live(uuid)';
  end if;
end
$g0500$;

-- sales_order_cancel_impact(uuid)
--   source: repo 0350_a_cancellation_names_its_reason_and_its_consequences.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.sales_order_cancel_impact(uuid)'); h text;
begin
  if p is null then insert into _g0500 values ('sales_order_cancel_impact(uuid)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '0c6e7b0121bd9f81a809165657108d6e' then
    execute $s0500a$
create or replace function public.sales_order_cancel_impact(p_order_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_role text := public.app_role();
begin
  if (v_role is null or v_role not in ('operation','principal','finance','hr','bd')) then
    raise exception 'Internal roles only' using errcode = '42501';
  end if;
  return public.sales_order_cancel_impact_facts(p_order_id);
end $$
$s0500a$;
    insert into _g0500 values ('sales_order_cancel_impact(uuid)', 'rewritten');
  elsif h in ('8d9cd0d6c2f6bf782af8d0abadbf0654') then insert into _g0500 values ('sales_order_cancel_impact(uuid)', 'already');
  else insert into _g0500 values ('sales_order_cancel_impact(uuid)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'sales_order_cancel_impact(uuid)';
  end if;
end
$g0500$;

-- sales_order_commitment_bundle(uuid)
--   source: repo 0340_a_change_names_who_asked_for_it.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.sales_order_commitment_bundle(uuid)'); h text;
begin
  if p is null then insert into _g0500 values ('sales_order_commitment_bundle(uuid)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '19440f24554dbe5c898fa76a47861a29' then
    execute $s0500a$
create or replace function public.sales_order_commitment_bundle(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := public.app_role();
begin
  if (v_role is null or v_role not in ('operation','principal','finance','hr','bd')) then
    raise exception 'Internal roles only' using errcode = '42501';
  end if;
  if not exists (select 1 from orders where id = p_order_id) then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'order_id', p_order_id,
    'current', public.sales_order_snapshot(p_order_id),
    'revisions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'revision', r.revision,
        'created_at', r.created_at,
        'created_by', r.created_by,
        'change_type', r.change_type,
        'note', r.note,
        'snapshot', r.snapshot
      ) order by r.revision)
      from sales_order_revisions r
      where r.order_id = p_order_id
    ), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id,
        'kind', q.kind,
        'status', q.status,
        'requested_at', q.requested_at,
        'requested_by', q.requested_by,
        'decided_at', q.decided_at,
        'decided_by', q.decided_by,
        'applied_at', q.applied_at,
        'payload', q.payload
      ) order by q.requested_at)
      from order_change_requests q
      where q.order_id = p_order_id
    ), '[]'::jsonb)
  );
end $$
$s0500a$;
    insert into _g0500 values ('sales_order_commitment_bundle(uuid)', 'rewritten');
  elsif h in ('888cb5ddacf3309228586e5ed13d236f') then insert into _g0500 values ('sales_order_commitment_bundle(uuid)', 'already');
  else insert into _g0500 values ('sales_order_commitment_bundle(uuid)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'sales_order_commitment_bundle(uuid)';
  end if;
end
$g0500$;

-- sales_order_create_unchecked_0374(jsonb, jsonb)
--   source: repo 0374_a_line_born_in_the_office_may_carry_its_configuration.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.sales_order_create_unchecked_0374(jsonb, jsonb)'); h text;
begin
  if p is null then insert into _g0500 values ('sales_order_create_unchecked_0374(jsonb, jsonb)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'b5cd9824e9676909106b8694ecf4d7e0' then
    execute $s0500a$
create or replace function public.sales_order_create_unchecked_0374(
  p_header jsonb,
  p_lines  jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role     text := public.app_role();
  v_order_id uuid;
  v_so       int;
  v_line     jsonb;
  v_fields   jsonb := '{}'::jsonb;
begin
  if (v_role is null or v_role not in ('operation','principal')) then
    raise exception 'Operation/Principal only' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_header->>'customer_name',''))) = 0 then
    raise exception 'Customer name is required' using errcode = '22023';
  end if;
  if nullif(p_header->>'dealer_id','') is null then
    raise exception 'A dealer is required' using errcode = '22023';
  end if;
  -- orders_salesperson_required (0296): every order the portal writes names
  -- who sold it. Refused here with a sentence, before the constraint speaks.
  if nullif(p_header->>'salesperson_id','') is null then
    raise exception 'A salesperson is required' using errcode = '22023';
  end if;

  if p_header ? 'entry_fields' then
    if jsonb_typeof(p_header->'entry_fields') <> 'object' then
      raise exception 'entry_fields must be an object' using errcode = '22023';
    end if;
    v_fields := coalesce((
      select jsonb_object_agg(k, val)
        from jsonb_each(p_header->'entry_fields') e(k, val)
       where jsonb_typeof(val) <> 'null' and nullif(trim(val #>> '{}'),'') is not null
    ), '{}'::jsonb);
  end if;

  insert into orders (
    status, channel, dealer_id, outlet_id, salesperson_id,
    customer_name, customer_phone, customer_email, customer_address,
    customer_address_line1, customer_address_line2, customer_address_city,
    customer_address_state, customer_address_postcode,
    customer_emergency, customer_billing,
    delivery_date, delivery_date_tbd, proceed_date,
    delivery_floor, delivery_has_lift,
    customer_race, customer_gender, customer_birthday,
    customer_address_unknown, customer_billing_same, delivery_stair_items,
    entry_data
  ) values (
    'place',
    case when nullif(p_header->>'outlet_id','') is not null then 'showroom' else 'dealer' end,
    (p_header->>'dealer_id')::uuid,
    nullif(p_header->>'outlet_id','')::uuid,
    nullif(p_header->>'salesperson_id','')::uuid,
    trim(p_header->>'customer_name'),
    nullif(p_header->>'customer_phone',''),
    nullif(p_header->>'customer_email',''),
    nullif(p_header->>'customer_address',''),
    nullif(p_header->>'customer_address_line1',''),
    nullif(p_header->>'customer_address_line2',''),
    nullif(p_header->>'customer_address_city',''),
    nullif(p_header->>'customer_address_state',''),
    nullif(p_header->>'customer_address_postcode',''),
    nullif(p_header->>'customer_emergency',''),
    nullif(p_header->>'customer_billing',''),
    nullif(p_header->>'delivery_date','')::date,
    coalesce((p_header->>'delivery_date_tbd')::boolean, false),
    nullif(p_header->>'proceed_date','')::date,
    coalesce((p_header->>'delivery_floor')::int, 1),
    coalesce((p_header->>'delivery_has_lift')::boolean, false),
    nullif(p_header->>'customer_race',''),
    nullif(p_header->>'customer_gender',''),
    nullif(p_header->>'customer_birthday','')::date,
    coalesce((p_header->>'customer_address_unknown')::boolean, false),
    coalesce((p_header->>'customer_billing_same')::boolean, true),
    nullif(p_header->>'delivery_stair_items','')::int,
    case when v_fields = '{}'::jsonb then null
         else jsonb_build_object('fields', v_fields) end
  )
  returning id, so into v_order_id, v_so;

  if p_lines is not null and jsonb_typeof(p_lines) = 'array' then
    for v_line in select * from jsonb_array_elements(p_lines) loop
      if length(trim(coalesce(v_line->>'sku',''))) = 0 then
        raise exception 'A line needs a SKU' using errcode = '22023';
      end if;
      if coalesce((v_line->>'qty')::int, 0) < 1 then
        raise exception 'Line % qty must be at least 1', v_line->>'sku' using errcode = '22023';
      end if;
      if coalesce((v_line->>'unit_price')::numeric, -1) < 0 then
        raise exception 'Line % needs a unit price of 0 or more', v_line->>'sku' using errcode = '22023';
      end if;
      -- 0374 — `attrs` rides the birth. ABSENT stays NULL: a line with no
      -- configuration must look exactly as it did before this migration, not
      -- gain an empty object that later code would read as "configured, with
      -- nothing in it".
      insert into order_lines(order_id, sku, qty, unit_price, attrs)
      values (
        v_order_id,
        trim(v_line->>'sku'),
        (v_line->>'qty')::int,
        (v_line->>'unit_price')::numeric,
        case when jsonb_typeof(v_line->'attrs') = 'object' then v_line->'attrs' else null end
      );
    end loop;
  end if;

  -- Rev 1 = the created state. The order is BORN with its original on file.
  insert into sales_order_revisions(order_id, revision, snapshot, created_by)
  values (v_order_id, 1, public.sales_order_snapshot(v_order_id), auth.uid());

  insert into order_history(order_id, text, by_role, by_user_id, metadata)
  values (
    v_order_id,
    'Order created (office) · Rev 1',
    v_role::app_role,
    auth.uid(),
    jsonb_build_object('kind','created_office','revision',1)
  );

  return jsonb_build_object('id', v_order_id, 'so', v_so, 'revision', 1);
end $$
$s0500a$;
    insert into _g0500 values ('sales_order_create_unchecked_0374(jsonb, jsonb)', 'rewritten');
  elsif h in ('8c70fd1ea067a3c4020956148ded19a5') then insert into _g0500 values ('sales_order_create_unchecked_0374(jsonb, jsonb)', 'already');
  else insert into _g0500 values ('sales_order_create_unchecked_0374(jsonb, jsonb)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'sales_order_create_unchecked_0374(jsonb, jsonb)';
  end if;
end
$g0500$;

-- sales_order_decide_amendment(uuid, text, text)
--   source: repo 0420_the_amendment_lane_may_move_what_it_names.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.sales_order_decide_amendment(uuid, text, text)'); h text;
begin
  if p is null then insert into _g0500 values ('sales_order_decide_amendment(uuid, text, text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'efcb621d614be93d75f6b6948924e38f' then
    execute $s0500a$
create or replace function public.sales_order_decide_amendment(
  p_amendment_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.app_role();
  v_a sales_order_amendments%rowtype;
  v_o orders%rowtype;
  v_note text := nullif(btrim(coalesce(p_note,'')), '');
  v_impact jsonb;
  v_header jsonb := '{}'::jsonb;
  v_lines jsonb := null;
  v_line jsonb;
  v_result jsonb;
  v_before jsonb;
  v_next int;
begin
  if (v_role is null or v_role <> 'principal') then
    raise exception 'Principal only' using errcode = '42501';
  end if;
  if p_decision not in ('approve','reject') then
    raise exception 'Decision must be approve or reject' using errcode = '22023', detail = 'invalid_decision';
  end if;
  if v_note is null then
    raise exception 'A management decision says why' using errcode = '22023', detail = 'note_required';
  end if;

  select * into v_a from sales_order_amendments where id = p_amendment_id for update;
  if not found then raise exception 'Amendment not found' using errcode = 'P0002'; end if;
  if v_a.status not in ('submitted','issued','accepted') then
    raise exception 'Amendment is already %', v_a.status using errcode = '22023', detail = 'already_decided';
  end if;
  select * into v_o from orders where id = v_a.order_id for update;
  v_impact := public.sales_order_amendment_impact(v_a.id);

  if p_decision = 'reject' then
    update sales_order_amendments
       set status='rejected', decided_by=auth.uid(), decided_at=now(),
           decision_note=v_note, decision_impact=v_impact
     where id=v_a.id;
    insert into order_history(order_id,text,by_role,by_user_id,metadata)
    values(v_a.order_id,'Amendment rejected - ' || v_note,v_role::app_role,auth.uid(),
      jsonb_build_object('kind','amendment_rejected','amendment_id',v_a.id,
                         'reason',v_note,'before',public.sales_order_snapshot(v_a.order_id),
                         'after',public.sales_order_snapshot(v_a.order_id)));
    return jsonb_build_object('id',v_a.id,'status','rejected');
  end if;

  if (v_impact->>'stale')::boolean then
    raise exception 'The order changed after this amendment was proposed'
      using errcode = '22023', detail = 'amendment_stale';
  end if;

  if v_a.proposed_snapshot ? 'delivery_date' then
    v_header := v_header || jsonb_build_object('delivery_date',v_a.proposed_snapshot->'delivery_date');
  end if;
  if v_a.proposed_snapshot ? 'delivery_date_tbd' then
    v_header := v_header || jsonb_build_object('delivery_date_tbd',v_a.proposed_snapshot->'delivery_date_tbd');
  end if;
  v_before := public.sales_order_snapshot(v_a.order_id);
  if v_a.proposed_snapshot ? 'installment_months' then
    update orders set installment_months = nullif(v_a.proposed_snapshot->>'installment_months','')::int
      where id = v_a.order_id;
  end if;
  if v_a.proposed_snapshot ? 'lines' then
    for v_line in select * from jsonb_array_elements(v_a.proposed_snapshot->'lines') loop
      if v_line ? 'id' and not exists (
        select 1 from order_lines where id=(v_line->>'id')::uuid and order_id=v_a.order_id
      ) then
        raise exception 'A proposed line no longer belongs to this order'
          using errcode = '22023', detail = 'proposal_line_stale';
      end if;
      if not (v_line ? 'id') and exists (
        select 1 from order_lines where order_id=v_a.order_id and sku=v_line->>'sku'
      ) then
        raise exception 'Re-propose this amendment with stable line identity'
          using errcode = '22023', detail = 'proposal_line_identity_required';
      end if;
    end loop;
    v_lines := v_a.proposed_snapshot->'lines';
  end if;

  if v_lines is null and v_header = '{}'::jsonb and v_a.proposed_snapshot ? 'installment_months' then
    if public.sales_order_snapshot(v_a.order_id) = v_before then
      raise exception 'Nothing changed' using errcode = '22023', detail = 'nothing_changed';
    end if;
    select coalesce(max(revision),1)+1 into v_next from sales_order_revisions where order_id=v_a.order_id;
    insert into sales_order_revisions(order_id,revision,snapshot,created_by,change_type,note)
    values(v_a.order_id,v_next,public.sales_order_snapshot(v_a.order_id),auth.uid(),'customer_change',coalesce(v_a.reason,v_note));
    insert into order_history(order_id,text,by_role,by_user_id,metadata)
    values(v_a.order_id,'Customer change - Rev '||v_next||' - installment_months',v_role::app_role,auth.uid(),
      jsonb_build_object('kind','edit','changed',jsonb_build_array('installment_months'),'revision',v_next));
    v_result := jsonb_build_object('revision',v_next,'changed',jsonb_build_array('installment_months'));
  else
    -- 0420 · EVERY GUARD ABOVE HAS ALREADY PASSED — principal, decision note,
    -- not already decided, not stale, every proposed line still owned by this
    -- order. Only now does the lane name itself to the writer, so 0415's F-11
    -- and F-12 know this is the door they point at. `true` is is_local: the
    -- setting dies with this transaction and no other caller can see it.
    perform set_config('carres.applying_amendment','on',true);
    v_result := public.sales_order_save_revision(
      v_a.order_id,v_header,v_lines,
      jsonb_build_object('change_type','customer_change','note',coalesce(v_a.reason,v_note)));
    -- 0420 · Cleared the moment the writer returns, so nothing later in this
    -- transaction inherits the exemption.
    perform set_config('carres.applying_amendment','',true);
    if v_a.proposed_snapshot ? 'installment_months' then
      v_result := jsonb_set(v_result,'{changed}',coalesce(v_result->'changed','[]'::jsonb) || '"installment_months"'::jsonb);
    end if;
  end if;

  update sales_order_amendments
     set status='applied', decided_by=auth.uid(), decided_at=now(), applied_at=now(),
         decision_note=v_note, decision_impact=v_impact
   where id=v_a.id;
  insert into order_history(order_id,text,by_role,by_user_id,metadata)
  values(v_a.order_id,'Amendment approved and applied - Rev ' || (v_result->>'revision'),
    v_role::app_role,auth.uid(),
    jsonb_build_object('kind','amendment_applied','amendment_id',v_a.id,
                       'reason',coalesce(v_a.reason,v_note),'decision_note',v_note,
                       'revision',(v_result->'revision'),'impact',v_impact));
  return jsonb_build_object('id',v_a.id,'status','applied','revision',v_result->'revision',
                            'changed',v_result->'changed');
end $$
$s0500a$;
    insert into _g0500 values ('sales_order_decide_amendment(uuid, text, text)', 'rewritten');
  elsif h in ('61585b1dc438b95a6c71a60f32c4e2b8') then insert into _g0500 values ('sales_order_decide_amendment(uuid, text, text)', 'already');
  else insert into _g0500 values ('sales_order_decide_amendment(uuid, text, text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'sales_order_decide_amendment(uuid, text, text)';
  end if;
end
$g0500$;

-- sales_order_decide_attribution(uuid, text, text)
--   source: repo 0329_attribution_moves_by_request_and_the_side_doors_close.sql; 2 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.sales_order_decide_attribution(uuid, text, text)'); h text;
begin
  if p is null then insert into _g0500 values ('sales_order_decide_attribution(uuid, text, text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'e9f0cf2c3fc8909a6fdfa60b8e90bfb3' then
    execute $s0500a$
create or replace function public.sales_order_decide_attribution(
  p_request_id uuid,
  p_decision   text,
  p_note       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.app_role();
  v_req  order_change_requests%rowtype;
  v_fields text[];
begin
  if p_decision not in ('approved','rejected') then
    raise exception 'decision must be approved or rejected' using errcode = '22023';
  end if;
  select * into v_req from order_change_requests where id = p_request_id for update;
  if not found or v_req.kind <> 'attribution' then
    raise exception 'Attribution request not found' using errcode = 'P0002';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'This request was already decided'
      using errcode = '22023', detail = 'already_decided';
  end if;
  v_fields := array(select jsonb_object_keys(v_req.payload->'changes'));
  -- GATE 3, frozen: Dealer → principal ONLY (channel rides the same lane —
  -- decision logged); Salesperson / Showroom → hr OR principal.
  if (v_fields && array['dealer_id','channel']) then
    if (v_role is null or v_role <> 'principal') then
      raise exception 'Dealer/channel attribution is approved by the principal only'
        using errcode = '42501', detail = 'approver_principal_only';
    end if;
  else
    if (v_role is null or v_role not in ('hr','principal')) then
      raise exception 'Salesperson/showroom attribution is approved by HR or the principal'
        using errcode = '42501', detail = 'approver_hr_or_principal';
    end if;
  end if;

  update order_change_requests
     set status = p_decision,
         decided_by = auth.uid(),
         decided_at = now(),
         decision_note = nullif(trim(coalesce(p_note,'')), '')
   where id = p_request_id;

  insert into order_history(order_id, text, by_role, by_user_id, metadata)
  values (v_req.order_id,
          'Attribution change ' || p_decision || ' — ' || array_to_string(v_fields, ', '),
          v_role::app_role, auth.uid(),
          jsonb_build_object('kind','attribution_' || p_decision,'fields',to_jsonb(v_fields)));
  return jsonb_build_object('id', p_request_id, 'status', p_decision);
end $$
$s0500a$;
    insert into _g0500 values ('sales_order_decide_attribution(uuid, text, text)', 'rewritten');
  elsif h in ('b1149351be5fd0549ad0da2287af44be') then insert into _g0500 values ('sales_order_decide_attribution(uuid, text, text)', 'already');
  else insert into _g0500 values ('sales_order_decide_attribution(uuid, text, text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'sales_order_decide_attribution(uuid, text, text)';
  end if;
end
$g0500$;

-- sales_order_floors_unchecked_0328(uuid, text[], jsonb)
--   source: repo 0328_the_floors_speak_before_any_write.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.sales_order_floors_unchecked_0328(uuid, text[], jsonb)'); h text;
begin
  if p is null then insert into _g0500 values ('sales_order_floors_unchecked_0328(uuid, text[], jsonb)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '63c95afb51777048d6e94656a9a67e55' then
    execute $s0500a$
create or replace function public.sales_order_floors_unchecked_0328(
  p_order_id       uuid,
  p_changed        text[],
  p_proposed_lines jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role      text := public.app_role();
  v_order     orders%rowtype;
  v_findings  jsonb := '[]'::jsonb;
  v_items     boolean;
  v_promise   boolean;
  v_money     boolean;
  v_attrib    boolean;
  v_contact   text[];
  v_po        record;
  v_line      jsonb;
  v_received  numeric;
  v_inv       record;
  v_msg       text;
  v_frozen    text[];
begin
  if (v_role is null or v_role not in ('operation','principal','finance','hr','bd')) then
    raise exception 'Internal roles only' using errcode = '42501';
  end if;

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  v_items   := ('order_lines' = any(p_changed)) or ('order_addons' = any(p_changed));
  v_promise := ('delivery_date' = any(p_changed)) or ('delivery_date_tbd' = any(p_changed));
  v_money   := v_items or ('installment_months' = any(p_changed));
  v_attrib  := p_changed && array['salesperson_id','dealer_id','outlet_id','channel'];
  v_contact := (select coalesce(array_agg(f), '{}') from unnest(p_changed) f
                where f in ('customer_name','customer_phone','customer_email',
                            'customer_emergency','customer_address','customer_billing',
                            'customer_address_line1','customer_address_line2',
                            'customer_address_city','customer_address_state',
                            'customer_address_postcode'));

  -- ── GATE 7 · delivered / cancelled: contractual + attribution freeze;
  --    contact corrections stay allowed; revisions always appendable. ──
  if v_order.status in ('delivered','cancelled') then
    v_frozen := (select coalesce(array_agg(f), '{}') from unnest(p_changed) f
                 where f in ('order_lines','order_addons','delivery_date',
                             'delivery_date_tbd','installment_months',
                             'salesperson_id','dealer_id','outlet_id','channel'));
    if array_length(v_frozen, 1) > 0 then
      v_findings := v_findings || jsonb_build_object(
        'field', array_to_string(v_frozen, ','),
        'consequence', 'orders.status',
        'state', v_order.status,
        'severity', 'BLOCK',
        'evidence', 'GATE 7 — the order is ' || v_order.status ||
                    '; contractual and attribution fields are frozen. ' ||
                    'Contact corrections and appended revisions stay allowed.');
    end if;
  end if;

  -- ── PO lineage · POTENTIALLY AFFECTED, SHARED when >1 order (WORK) ──
  if v_items then
    for v_po in
      select po.id, po.so, po.so_refs, po.status,
             (select count(distinct s) from unnest(array[po.so] || coalesce(po.so_refs, '{}')) s
               where s is not null) as covered
      from purchase_orders po
      where (po.so = v_order.so or v_order.so = any(coalesce(po.so_refs, '{}')))
        and po.status <> 'cancelled'
        and exists (select 1 from purchase_order_lines pol
                     join order_lines ol on ol.sku = pol.sku
                    where pol.po_id = po.id and ol.order_id = p_order_id)
    loop
      v_findings := v_findings || jsonb_build_object(
        'field', 'order_lines',
        'consequence', 'purchase_orders',
        'state', v_po.status,
        'severity', 'WORK',
        'shared', v_po.covered > 1,
        'evidence', 'PO ' || v_po.id || ' covers SO-' ||
                    array_to_string(array[v_po.so] || coalesce(v_po.so_refs,'{}'), ', SO-') ||
                    ' — POTENTIALLY AFFECTED' ||
                    case when v_po.covered > 1 then ' · SHARED, human resolution required' else '' end ||
                    '. Never auto-revised.');
    end loop;
  end if;

  -- ── Received floor · proposed qty may not fall below received (BLOCK,
  --    pre-mutation — 2990's ReceivedFloorError shape, naming the line) ──
  if p_proposed_lines is not null and jsonb_typeof(p_proposed_lines) = 'array' then
    for v_line in select * from jsonb_array_elements(p_proposed_lines) loop
      select coalesce(sum(pol.received_qty), 0) into v_received
        from purchase_order_lines pol
        join purchase_orders po on po.id = pol.po_id
       where pol.sku = v_line->>'sku'
         and (po.so = v_order.so or v_order.so = any(coalesce(po.so_refs, '{}')))
         and po.status <> 'cancelled';
      if v_received > 0 and coalesce((v_line->>'qty')::numeric, 0) < v_received then
        v_findings := v_findings || jsonb_build_object(
          'field', 'order_lines.qty',
          'consequence', 'po_receipts.received_qty',
          'state', v_received::text,
          'severity', 'BLOCK',
          'evidence', 'Line ' || (v_line->>'sku') || ': proposed qty ' ||
                      coalesce(v_line->>'qty','0') || ' is below the ' ||
                      v_received || ' already received.');
      end if;
    end loop;
  end if;

  -- ── Operation gate · production started on THIS item — per field, never
  --    a whole-SO refusal (WORK) ──
  if v_order.operation_stage in ('in_production','ready_to_dispatch','dispatched','delivered')
     and (v_items or v_promise) then
    v_findings := v_findings || jsonb_build_object(
      'field', case when v_items and v_promise then 'order_lines,delivery_date'
                    when v_items then 'order_lines' else 'delivery_date' end,
      'consequence', 'operation_stage',
      'state', v_order.operation_stage,
      'severity', 'WORK',
      'evidence', 'Production has started (' || v_order.operation_stage ||
                  ') — operation correction work on the changed item(s).');
  end if;

  -- ── Logistics · dispatched or later → delivery correction WORK ──
  if v_promise and (v_order.dispatched_at is not null
                    or v_order.operation_stage in ('dispatched','delivered')) then
    v_findings := v_findings || jsonb_build_object(
      'field', 'delivery_date',
      'consequence', 'logistics',
      'state', coalesce(v_order.operation_stage, 'dispatched'),
      'severity', 'WORK',
      'evidence', 'Goods dispatched ' || coalesce(v_order.dispatched_at::text, '') ||
                  ' — the trip no longer matches the promise; delivery correction work.');
  end if;

  -- ── Invoice floor · issued amount may NOT be changed by an amendment.
  --    Route: credit note / refunds (0001:424, carries approval_id). ──
  if v_money then
    for v_inv in select invoice_no, amount from invoices
                  where order_id = p_order_id and voided_at is null
    loop
      v_findings := v_findings || jsonb_build_object(
        'field', 'order_lines,order_addons,installment_months',
        'consequence', 'invoices',
        'state', v_inv.invoice_no,
        'severity', 'BLOCK',
        'evidence', 'Invoice ' || v_inv.invoice_no || ' (RM ' || v_inv.amount ||
                    ') is issued and not voided — the amendment may not change ' ||
                    'its amount. Route: credit note / refunds.');
    end loop;
  end if;

  -- ── Commission month lock · CALL 0272, never a second engine ──
  if v_attrib then
    begin
      perform public._commission_assert_order_month_open(p_order_id);
      v_findings := v_findings || jsonb_build_object(
        'field', 'salesperson_id,dealer_id,outlet_id,channel',
        'consequence', 'commission_runs',
        'state', 'open',
        'severity', 'NONE',
        'evidence', 'Commission month open — attribution may move (0272 gate passed).');
    exception when others then
      -- 0272 raises 'commission_month_locked' and puts the HUMAN sentence in
      -- the DETAIL ("… is approved - reopen the run before changing who gets
      -- credit for it."). Surface the detail — that IS the 0272 message.
      declare v_detail text;
      begin
        get stacked diagnostics v_detail = pg_exception_detail;
        v_msg := coalesce(nullif(v_detail, ''), sqlerrm);
      end;
      v_findings := v_findings || jsonb_build_object(
        'field', 'salesperson_id,dealer_id,outlet_id,channel',
        'consequence', 'commission_runs',
        'state', 'locked',
        'severity', 'BLOCK',
        'evidence', v_msg);
    end;
  end if;

  -- ── Contact fields · EXPLICITLY cleared — never blocked by stage ──
  if array_length(v_contact, 1) > 0 then
    v_findings := v_findings || jsonb_build_object(
      'field', array_to_string(v_contact, ','),
      'consequence', 'none',
      'state', '',
      'severity', 'NONE',
      'evidence', 'Contact/address corrections carry no downstream consequence and are never blocked by operation_stage (GATE 6, verbatim).');
  end if;

  return jsonb_build_object('order_id', p_order_id, 'so', v_order.so, 'findings', v_findings);
end $$
$s0500a$;
    insert into _g0500 values ('sales_order_floors_unchecked_0328(uuid, text[], jsonb)', 'rewritten');
  elsif h in ('e5a58b6602c6b7a0cd3e4685f6b069cb') then insert into _g0500 values ('sales_order_floors_unchecked_0328(uuid, text[], jsonb)', 'already');
  else insert into _g0500 values ('sales_order_floors_unchecked_0328(uuid, text[], jsonb)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'sales_order_floors_unchecked_0328(uuid, text[], jsonb)';
  end if;
end
$g0500$;

-- sales_order_save_revision_unchecked_0354(uuid, jsonb, jsonb, jsonb)
--   source: repo 0354_the_object_page_edits_every_field_the_portal_asked.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.sales_order_save_revision_unchecked_0354(uuid, jsonb, jsonb, jsonb)'); h text;
begin
  if p is null then insert into _g0500 values ('sales_order_save_revision_unchecked_0354(uuid, jsonb, jsonb, jsonb)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '5bf566769466c310c637b6dbed1cd1de' then
    execute $s0500a$
create or replace function public.sales_order_save_revision_unchecked_0354(
  p_order_id uuid,
  p_header   jsonb default '{}'::jsonb,
  p_lines    jsonb default null,
  p_change   jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role        text := public.app_role();
  v_order       orders%rowtype;
  v_changed     text[] := '{}';
  v_next        int;
  v_line        jsonb;
  v_keep_ids    uuid[] := '{}';
  v_id          uuid;
  v_old         jsonb;
  v_new         jsonb;
  v_keys        text[] := array[
    'customer_name','customer_phone','customer_email','customer_address',
    'customer_address_line1','customer_address_line2','customer_address_city',
    'customer_address_state','customer_address_postcode','customer_emergency',
    'customer_billing','delivery_date','delivery_date_tbd','proceed_date',
    'delivery_floor','delivery_has_lift',
    -- 0354 · every remaining question the Sales Portal asks
    'customer_race','customer_gender','customer_birthday',
    'customer_address_unknown','customer_billing_same','delivery_stair_items',
    'entry_fields'
  ];
  v_key         text;
  v_work        int := 0;
  v_change_type text;
  v_note        text;
  v_contractual boolean;
  v_thread      record;
  v_floor       jsonb;
  v_floor_names text[];
  v_proposed    jsonb := null;
  v_fields      jsonb;
begin
  if (v_role is null or v_role not in ('operation','principal')) then
    raise exception 'Operation/Principal only' using errcode = '42501';
  end if;
  if p_header ? 'salesperson_id' or p_header ? 'outlet_id'
     or p_header ? 'dealer_id' or p_header ? 'channel' then
    raise exception 'Attribution moves by request - submit an attribution change for approval'
      using errcode = '22023', detail = 'attribution_by_request';
  end if;

  -- The cause, validated up front. Whether it is REQUIRED is decided after
  -- the diff — only a change that moves the contractual fields demands it.
  if p_change is not null then
    if jsonb_typeof(p_change) <> 'object' then
      raise exception 'p_change must be an object' using errcode = '22023';
    end if;
    v_change_type := nullif(trim(coalesce(p_change->>'change_type','')), '');
    v_note        := nullif(trim(coalesce(p_change->>'note','')), '');
    if v_change_type is not null
       and v_change_type not in ('staff_correction','customer_change') then
      raise exception 'change_type must be staff_correction or customer_change'
        using errcode = '22023', detail = 'invalid_change_type';
    end if;
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if (p_header is null or p_header = '{}'::jsonb) and p_lines is null then
    raise exception 'Nothing to save' using errcode = '22023';
  end if;

  -- 0257 parity + Card 1 §7: a line with a live procurement thread is a
  -- production commitment. Removing it (the delete would CASCADE the thread,
  -- 0124) or changing its SKU refuses BEFORE anything is written. Qty and
  -- price edits pass through — the received floor and the operation gate
  -- speak to those below.
  if p_lines is not null and jsonb_typeof(p_lines) = 'array' then
    for v_thread in
      select ol.id, ol.sku
        from order_lines ol
       where ol.order_id = p_order_id
         and exists (select 1 from order_supplier_threads t where t.order_line_id = ol.id)
    loop
      select l into v_line
        from jsonb_array_elements(p_lines) l
       where nullif(l->>'id','') is not null
         and (l->>'id')::uuid = v_thread.id;
      if v_line is null then
        raise exception 'Line % is in production - it cannot be removed here', v_thread.sku
          using errcode = '22023', detail = 'line_in_production';
      end if;
      if trim(coalesce(v_line->>'sku','')) is distinct from v_thread.sku then
        raise exception 'Line % is in production - its item cannot be changed here', v_thread.sku
          using errcode = '22023', detail = 'line_in_production';
      end if;
    end loop;
  end if;

  v_old := public.sales_order_snapshot(p_order_id);
  if not exists (select 1 from sales_order_revisions where order_id = p_order_id) then
    insert into sales_order_revisions(order_id, revision, snapshot, created_by)
    values (p_order_id, 1, v_old, auth.uid());
  end if;

  foreach v_key in array v_keys loop
    if p_header ? v_key then
      case v_key
        when 'delivery_date' then
          update orders set delivery_date = nullif(p_header->>'delivery_date','')::date where id = p_order_id;
        when 'proceed_date' then
          update orders set proceed_date = nullif(p_header->>'proceed_date','')::date where id = p_order_id;
        when 'delivery_date_tbd' then
          update orders set delivery_date_tbd = coalesce((p_header->>'delivery_date_tbd')::boolean, false) where id = p_order_id;
        when 'delivery_floor' then
          update orders set delivery_floor = coalesce((p_header->>'delivery_floor')::int, 1) where id = p_order_id;
        when 'delivery_has_lift' then
          update orders set delivery_has_lift = coalesce((p_header->>'delivery_has_lift')::boolean, false) where id = p_order_id;
        when 'customer_name' then
          if length(trim(coalesce(p_header->>'customer_name',''))) = 0 then
            raise exception 'Customer name is required' using errcode = '22023';
          end if;
          update orders set customer_name = trim(p_header->>'customer_name') where id = p_order_id;
        -- 0354 · the typed columns cannot ride the generic text path.
        when 'customer_birthday' then
          update orders set customer_birthday = nullif(p_header->>'customer_birthday','')::date where id = p_order_id;
        when 'customer_address_unknown' then
          update orders set customer_address_unknown = coalesce((p_header->>'customer_address_unknown')::boolean, false) where id = p_order_id;
        when 'customer_billing_same' then
          update orders set customer_billing_same = coalesce((p_header->>'customer_billing_same')::boolean, true) where id = p_order_id;
        when 'delivery_stair_items' then
          update orders set delivery_stair_items = nullif(p_header->>'delivery_stair_items','')::int where id = p_order_id;
        -- 0219's bag: the building type and the operator's own fields. MERGED,
        -- never replaced — the form sends the keys it renders, and a config
        -- field retired last month must not be erased by an unrelated save.
        -- An explicit JSON null CLEARS one key, which is how the form empties
        -- a field the operator blanked.
        when 'entry_fields' then
          if jsonb_typeof(p_header->'entry_fields') <> 'object' then
            raise exception 'entry_fields must be an object' using errcode = '22023';
          end if;
          v_fields := coalesce(v_order.entry_data->'fields','{}'::jsonb) || (p_header->'entry_fields');
          v_fields := coalesce((
            select jsonb_object_agg(k, val)
              from jsonb_each(v_fields) e(k, val)
             where jsonb_typeof(val) <> 'null' and nullif(trim(val #>> '{}'),'') is not null
          ), '{}'::jsonb);
          update orders
             set entry_data = jsonb_set(
                   coalesce(entry_data, '{}'::jsonb), '{fields}', v_fields, true)
           where id = p_order_id;
        else
          execute format('update orders set %I = $1 where id = $2', v_key)
            using nullif(p_header->>v_key, ''), p_order_id;
      end case;
    end if;
  end loop;

  if p_lines is not null then
    if jsonb_typeof(p_lines) <> 'array' then
      raise exception 'p_lines must be an array' using errcode = '22023';
    end if;
    if jsonb_array_length(p_lines) = 0 then
      raise exception 'An order needs at least one item' using errcode = '22023';
    end if;
    for v_line in select * from jsonb_array_elements(p_lines) loop
      if length(trim(coalesce(v_line->>'sku',''))) = 0 then
        raise exception 'A line needs a SKU' using errcode = '22023';
      end if;
      if coalesce((v_line->>'qty')::int, 0) < 1 then
        raise exception 'Line % qty must be at least 1', v_line->>'sku' using errcode = '22023';
      end if;
      if coalesce((v_line->>'unit_price')::numeric, -1) < 0 then
        raise exception 'Line % needs a unit price of 0 or more', v_line->>'sku' using errcode = '22023';
      end if;
      if v_line ? 'id' and nullif(v_line->>'id','') is not null then
        v_id := (v_line->>'id')::uuid;
        update order_lines
           set sku = trim(v_line->>'sku'),
               qty = (v_line->>'qty')::int,
               unit_price = (v_line->>'unit_price')::numeric
         where id = v_id and order_id = p_order_id;
        if not found then
          raise exception 'Line % does not belong to this order', v_id using errcode = '22023';
        end if;
      else
        insert into order_lines(order_id, sku, qty, unit_price)
        values (p_order_id, trim(v_line->>'sku'), (v_line->>'qty')::int, (v_line->>'unit_price')::numeric)
        returning id into v_id;
      end if;
      v_keep_ids := array_append(v_keep_ids, v_id);
    end loop;
    delete from order_lines
     where order_id = p_order_id
       and not (id = any(v_keep_ids));
  end if;

  v_new := public.sales_order_snapshot(p_order_id);
  if v_new = v_old then
    raise exception 'Nothing changed' using errcode = '22023';
  end if;

  foreach v_key in array v_keys loop
    if (v_old->'header'->v_key) is distinct from (v_new->'header'->v_key) then
      v_changed := array_append(v_changed, v_key);
    end if;
  end loop;
  if (v_old->'lines') is distinct from (v_new->'lines') then
    v_changed := array_append(v_changed, 'items');
  end if;

  -- CARD 1 §3 · a contractual change states its cause; a pure Class-B
  -- correction (contact / address / floor / proceed_date) IS a correction.
  v_contractual := ('items' = any(v_changed))
                or ('delivery_date' = any(v_changed))
                or ('delivery_date_tbd' = any(v_changed));
  if v_contractual and v_change_type is null then
    raise exception 'Say who asked: staff correction or customer change'
      using errcode = '22023', detail = 'change_type_required';
  end if;
  if not v_contractual then
    v_change_type := coalesce(v_change_type, 'staff_correction');
  end if;

  -- THE FLOORS BITE (0328, GATE 6/7) — evaluated on what ACTUALLY changed,
  -- inside the same transaction; any BLOCK rolls the whole save back.
  v_floor_names := array(select case when k = 'items' then 'order_lines' else k end
                           from unnest(v_changed) k);
  if 'order_lines' = any(v_floor_names) then
    select jsonb_agg(jsonb_build_object('sku', sku, 'qty', qty))
      into v_proposed
      from order_lines where order_id = p_order_id;
  end if;
  for v_floor in
    select f from jsonb_array_elements(
      public.sales_order_floors(p_order_id, v_floor_names, v_proposed)->'findings') f
    where f->>'severity' = 'BLOCK'
  loop
    raise exception '%', coalesce(v_floor->>'evidence', 'Blocked by a downstream floor')
      using errcode = '22023', detail = 'blocked_by_floor';
  end loop;

  select coalesce(max(revision), 1) + 1 into v_next
    from sales_order_revisions where order_id = p_order_id;
  insert into sales_order_revisions(order_id, revision, snapshot, created_by, change_type, note)
  values (p_order_id, v_next, v_new, auth.uid(), v_change_type, v_note);

  insert into order_history(order_id, text, by_role, by_user_id, metadata)
  values (p_order_id,
          case v_change_type
            when 'customer_change' then 'Customer change - Rev '
            else 'Staff correction - Rev '
          end || v_next || ' - ' || array_to_string(v_changed, ', '),
          v_role::app_role, auth.uid(),
          jsonb_build_object('kind','edit','changed', to_jsonb(v_changed), 'revision', v_next,
                             'change_type', v_change_type, 'note', v_note));

  -- 3.4 · the consequence outlives the tab (0332/0333, unchanged).
  begin
    v_work := public._raise_correction_work(p_order_id, v_floor_names, v_next, 'B');
  exception when others then
    raise warning 'correction work not raised for % rev %: %', p_order_id, v_next, sqlerrm;
  end;

  return jsonb_build_object('revision', v_next, 'changed', to_jsonb(v_changed),
                            'change_type', v_change_type,
                            'correction_work_raised', v_work);
end $$
$s0500a$;
    insert into _g0500 values ('sales_order_save_revision_unchecked_0354(uuid, jsonb, jsonb, jsonb)', 'rewritten');
  elsif h in ('55da0828db9151265298d0cdcce76c95') then insert into _g0500 values ('sales_order_save_revision_unchecked_0354(uuid, jsonb, jsonb, jsonb)', 'already');
  else insert into _g0500 values ('sales_order_save_revision_unchecked_0354(uuid, jsonb, jsonb, jsonb)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'sales_order_save_revision_unchecked_0354(uuid, jsonb, jsonb, jsonb)';
  end if;
end
$g0500$;

-- sales_order_submit_amendment(uuid, jsonb, text, date)
--   source: repo 0354_the_object_page_edits_every_field_the_portal_asked.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.sales_order_submit_amendment(uuid, jsonb, text, date)'); h text;
begin
  if p is null then insert into _g0500 values ('sales_order_submit_amendment(uuid, jsonb, text, date)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'f56aff0c2fbc7ee170fa37289015c6e8' then
    execute $s0500a$
create or replace function public.sales_order_submit_amendment(
  p_order_id         uuid,
  p_proposed         jsonb,
  p_reason           text default null,
  p_customer_asked_on date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.app_role();
  v_rev  int;
  v_hash text;
  v_id   uuid;
begin
  if (v_role is null or v_role not in ('operation','principal')) then
    raise exception 'Operation/Principal only' using errcode = '42501';
  end if;
  if p_proposed is null or jsonb_typeof(p_proposed) <> 'object' then
    raise exception 'A proposal is required' using errcode = '22023';
  end if;
  if not exists (select 1 from orders where id = p_order_id) then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  -- A day the customer has not reached yet is a typo, not a request.
  if p_customer_asked_on is not null and p_customer_asked_on > current_date then
    raise exception 'The customer cannot have asked on a future day'
      using errcode = '22023', detail = 'asked_on_in_future';
  end if;

  -- The document is computed FROM the current revision. Mint Rev 1 first if
  -- the order has never been touched, so `base_revision` always points at a
  -- snapshot that exists (0327's pattern).
  if not exists (select 1 from sales_order_revisions where order_id = p_order_id) then
    insert into sales_order_revisions(order_id, revision, snapshot, created_by)
    values (p_order_id, 1, public.sales_order_snapshot(p_order_id), auth.uid());
  end if;
  select max(revision) into v_rev from sales_order_revisions where order_id = p_order_id;
  v_hash := public.sales_order_contractual_hash(p_order_id);

  begin
    insert into sales_order_amendments(
      order_id, base_revision, base_contractual_hash, proposed_snapshot, reason,
      status, submitted_by, customer_asked_on)
    values (p_order_id, v_rev, v_hash, p_proposed, nullif(trim(coalesce(p_reason,'')),''),
            'submitted', auth.uid(), p_customer_asked_on)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'An amendment is already open on this sales order'
      using errcode = '22023', detail = 'amendment_exists';
  end;

  insert into order_history(order_id, text, by_role, by_user_id, metadata)
  values (p_order_id,
          'Amendment submitted - from Rev ' || v_rev,
          v_role::app_role, auth.uid(),
          jsonb_build_object('kind','amendment_submitted','amendment_id',v_id,
                             'base_revision',v_rev,
                             'customer_asked_on',p_customer_asked_on));
  return jsonb_build_object('id', v_id, 'base_revision', v_rev,
                            'base_contractual_hash', v_hash, 'status', 'submitted');
end $$
$s0500a$;
    insert into _g0500 values ('sales_order_submit_amendment(uuid, jsonb, text, date)', 'rewritten');
  elsif h in ('1bfdbd5cefb97b9478dd205db4ec1205') then insert into _g0500 values ('sales_order_submit_amendment(uuid, jsonb, text, date)', 'already');
  else insert into _g0500 values ('sales_order_submit_amendment(uuid, jsonb, text, date)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'sales_order_submit_amendment(uuid, jsonb, text, date)';
  end if;
end
$g0500$;

-- sales_order_submit_attribution(uuid, jsonb, text)
--   source: repo 0329_attribution_moves_by_request_and_the_side_doors_close.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.sales_order_submit_attribution(uuid, jsonb, text)'); h text;
begin
  if p is null then insert into _g0500 values ('sales_order_submit_attribution(uuid, jsonb, text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '9e841a769a5250f576f38824ec883870' then
    execute $s0500a$
create or replace function public.sales_order_submit_attribution(
  p_order_id uuid,
  p_changes  jsonb,
  p_reason   text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role   text := public.app_role();
  v_fields text[];
  v_id     uuid;
  v_key    text;
begin
  if (v_role is null or v_role not in ('operation','principal')) then
    raise exception 'Operation/Principal only' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason,''))) = 0 then
    raise exception 'A reason is required' using errcode = '22023', detail = 'reason_required';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'p_changes must be an object' using errcode = '22023';
  end if;
  v_fields := array(select jsonb_object_keys(p_changes));
  if array_length(v_fields,1) is null then
    raise exception 'Nothing to change' using errcode = '22023';
  end if;
  foreach v_key in array v_fields loop
    if v_key not in ('salesperson_id','dealer_id','outlet_id','channel') then
      raise exception 'Field % is not an attribution field', v_key using errcode = '22023';
    end if;
  end loop;
  if p_changes ? 'channel'
     and p_changes->>'channel' not in ('dealer','showroom') then
    raise exception 'channel must be dealer or showroom' using errcode = '22023';
  end if;
  if not exists (select 1 from orders where id = p_order_id) then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  begin
    insert into order_change_requests (order_id, kind, payload, status, requested_by)
    values (p_order_id, 'attribution',
            jsonb_build_object('changes', p_changes, 'reason', trim(p_reason)),
            'pending', auth.uid())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'An attribution change is already waiting on this order'
      using errcode = '22023', detail = 'pending_exists';
  end;

  insert into order_history(order_id, text, by_role, by_user_id, metadata)
  values (p_order_id,
          'Attribution change requested — ' || array_to_string(v_fields, ', '),
          v_role::app_role, auth.uid(),
          jsonb_build_object('kind','attribution_requested','fields',to_jsonb(v_fields)));
  return jsonb_build_object('id', v_id, 'fields', to_jsonb(v_fields));
end $$
$s0500a$;
    insert into _g0500 values ('sales_order_submit_attribution(uuid, jsonb, text)', 'rewritten');
  elsif h in ('e0c96fef6a14de4a2789f8dc0bb9bfb2') then insert into _g0500 values ('sales_order_submit_attribution(uuid, jsonb, text)', 'already');
  else insert into _g0500 values ('sales_order_submit_attribution(uuid, jsonb, text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'sales_order_submit_attribution(uuid, jsonb, text)';
  end if;
end
$g0500$;

-- sales_order_withdraw_attribution(uuid, text)
--   source: repo 0336_an_approved_request_can_be_taken_back.sql; 2 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.sales_order_withdraw_attribution(uuid, text)'); h text;
begin
  if p is null then insert into _g0500 values ('sales_order_withdraw_attribution(uuid, text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '6c952a129b1d08ab355a220ad4bf0932' then
    execute $s0500a$
create or replace function public.sales_order_withdraw_attribution(
  p_request_id uuid,
  p_reason     text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role   text := public.app_role();
  v_req    order_change_requests%rowtype;
  v_fields text[];
begin
  if length(trim(coalesce(p_reason,''))) = 0 then
    raise exception 'A reason is required' using errcode = '22023', detail = 'reason_required';
  end if;

  select * into v_req from order_change_requests where id = p_request_id for update;
  if not found or v_req.kind <> 'attribution' then
    raise exception 'Attribution request not found' using errcode = 'P0002';
  end if;

  if v_req.applied_at is not null then
    raise exception 'This change was already applied — it is history now, not a decision to take back'
      using errcode = '22023', detail = 'already_applied';
  end if;
  if v_req.status <> 'approved' then
    raise exception 'Only an approved request can be withdrawn'
      using errcode = '22023', detail = 'not_approved';
  end if;

  v_fields := array(select jsonb_object_keys(v_req.payload->'changes'));

  -- GATE 3, the SAME routing as the approval it takes back.
  if (v_fields && array['dealer_id','channel']) then
    if (v_role is null or v_role <> 'principal') then
      raise exception 'Dealer/channel attribution is approved by the principal only'
        using errcode = '42501', detail = 'approver_principal_only';
    end if;
  else
    if (v_role is null or v_role not in ('hr','principal')) then
      raise exception 'Salesperson/showroom attribution is approved by HR or the principal'
        using errcode = '42501', detail = 'approver_hr_or_principal';
    end if;
  end if;

  update order_change_requests
     set status = 'cancelled',
         decided_by = auth.uid(),
         decided_at = now(),
         decision_note = trim(p_reason)
   where id = p_request_id;

  insert into order_history(order_id, text, by_role, by_user_id, metadata)
  values (v_req.order_id,
          'Attribution change withdrawn — ' || array_to_string(v_fields, ', ')
            || ' — ' || trim(p_reason),
          v_role::app_role, auth.uid(),
          jsonb_build_object('kind','attribution_withdrawn','fields',to_jsonb(v_fields)));

  return jsonb_build_object('id', p_request_id, 'status', 'cancelled');
end $$
$s0500a$;
    insert into _g0500 values ('sales_order_withdraw_attribution(uuid, text)', 'rewritten');
  elsif h in ('1e0b2f2e1afde08d69332c0e7669e2e9') then insert into _g0500 values ('sales_order_withdraw_attribution(uuid, text)', 'already');
  else insert into _g0500 values ('sales_order_withdraw_attribution(uuid, text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'sales_order_withdraw_attribution(uuid, text)';
  end if;
end
$g0500$;

-- set_delivery_chain(uuid, jsonb)
--   source: repo 0156_delivery_stops.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.set_delivery_chain(uuid, jsonb)'); h text;
begin
  if p is null then insert into _g0500 values ('set_delivery_chain(uuid, jsonb)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '3f7955db33f406524b0d64223053aa68' then
    execute $s0500a$
create or replace function public.set_delivery_chain(
  p_order_id uuid,
  p_stops    jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role         app_role;
  v_n            int;
  v_i            int;
  v_stop         jsonb;
  v_partner_id   uuid;
  v_partner_name text;
begin
  v_role := public.app_role();
  if (v_role is null or v_role not in ('operation','principal')) then
    raise exception 'forbidden: only operation/principal can set delivery chain'
      using errcode = '42501';
  end if;

  if p_stops is null or jsonb_typeof(p_stops) <> 'array' then
    raise exception 'p_stops must be a JSON array (empty array clears the chain)'
      using errcode = '22023';
  end if;

  v_n := jsonb_array_length(p_stops);

  -- Validate each leg: contiguous numbering 1..N, partner exists, required keys.
  for v_i in 0 .. (v_n - 1) loop
    v_stop := p_stops -> v_i;
    if (v_stop ->> 'leg')::int is distinct from (v_i + 1) then
      raise exception 'leg numbering must be contiguous 1..N (got % at index %)',
        v_stop ->> 'leg', v_i using errcode = '22023';
    end if;
    if v_stop ->> 'partner_id' is null or v_stop ->> 'from_loc' is null
       or v_stop ->> 'to_loc' is null then
      raise exception 'leg % missing one of required keys (partner_id, from_loc, to_loc)',
        v_i + 1 using errcode = '22023';
    end if;
    v_partner_id := (v_stop ->> 'partner_id')::uuid;
    select name into v_partner_name from delivery_partners where id = v_partner_id;
    if v_partner_name is null then
      raise exception 'leg %: partner_id % not in delivery_partners',
        v_i + 1, v_partner_id using errcode = '22023';
    end if;
  end loop;

  update orders
     set delivery_stops = case when v_n = 0 then null else p_stops end,
         updated_at     = now()
   where id = p_order_id;
  if not found then
    raise exception 'order % not found', p_order_id using errcode = '42P01';
  end if;
end;
$$
$s0500a$;
    insert into _g0500 values ('set_delivery_chain(uuid, jsonb)', 'rewritten');
  elsif h in ('fec7dcb53bacc793becc5abc466bdf2d') then insert into _g0500 values ('set_delivery_chain(uuid, jsonb)', 'already');
  else insert into _g0500 values ('set_delivery_chain(uuid, jsonb)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'set_delivery_chain(uuid, jsonb)';
  end if;
end
$g0500$;

-- set_sales_order_grid_config(jsonb, jsonb)
--   source: repo 0174_sales_order_grid_config.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.set_sales_order_grid_config(jsonb, jsonb)'); h text;
begin
  if p is null then insert into _g0500 values ('set_sales_order_grid_config(jsonb, jsonb)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'e0a7a2b8fa995caf30ffd6dcda0d28ee' then
    execute $s0500a$
create or replace function public.set_sales_order_grid_config(
  p_columns jsonb,
  p_options jsonb
)
returns public.sales_order_grid_config
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.sales_order_grid_config;
begin
  if (( select public.app_role() )::text is null or ( select public.app_role() )::text not in ('operation', 'principal')) then
    raise exception 'forbidden: operation or principal only'
      using errcode = '42501';
  end if;

  if jsonb_typeof(p_columns) is distinct from 'array' then
    raise exception 'columns must be a json array' using errcode = '22023';
  end if;
  if jsonb_typeof(p_options) is distinct from 'object' then
    raise exception 'options must be a json object' using errcode = '22023';
  end if;

  insert into public.sales_order_grid_config (id, columns, options, updated_at, updated_by)
  values (true, p_columns, p_options, now(), ( select auth.uid() ))
  on conflict (id) do update
    set columns    = excluded.columns,
        options    = excluded.options,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
  returning * into v_row;

  return v_row;
end;
$$
$s0500a$;
    insert into _g0500 values ('set_sales_order_grid_config(jsonb, jsonb)', 'rewritten');
  elsif h in ('25d1047fd3a77bde4f6c9ef039a4d9ea') then insert into _g0500 values ('set_sales_order_grid_config(jsonb, jsonb)', 'already');
  else insert into _g0500 values ('set_sales_order_grid_config(jsonb, jsonb)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'set_sales_order_grid_config(jsonb, jsonb)';
  end if;
end
$g0500$;

-- submit_order_change_request_unchecked_0258(uuid, jsonb, text)
--   source: repo 0258_edit_order_addon.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.submit_order_change_request_unchecked_0258(uuid, jsonb, text)'); h text;
begin
  if p is null then insert into _g0500 values ('submit_order_change_request_unchecked_0258(uuid, jsonb, text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '60c9eb41f06f5b6952037d972ed3a52d' then
    execute $s0500a$
CREATE OR REPLACE FUNCTION public.submit_order_change_request_unchecked_0258(
  p_order_id uuid,
  p_payload jsonb,
  p_kind text DEFAULT 'add_lines'
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order            orders;
  v_role             app_role;
  v_caller_dealer_id uuid;
  v_id               uuid;
  v_lines_n          int := 0;
  v_addons_n         int := 0;
  v_targets          uuid[];
  v_cnt              int;
  v_addon_row        order_addons;
  v_target_addon     uuid;
  v_new_qty          int;
begin
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();
  if v_role is null then
    raise exception 'forbidden: no app role' using errcode = '42501';
  end if;

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = '42P01';
  end if;
  if (v_role is null or v_role not in ('principal','operation','finance','bd'))
     and v_order.dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer submit' using errcode = '42501';
  end if;

  if v_order.status in ('delivered','cancelled') then
    raise exception 'Order is no longer editable'
      using errcode = '22023', detail = 'wrong_status';
  end if;
  -- A PLACE-lane order (untouched by ops, not an import) takes DIRECT edits —
  -- a submission there would just stall the dealer behind an approval.
  if v_order.status = 'place'
     and v_order.operation_stage is null
     and coalesce(v_order.source_system, '') <> 'autocount' then
    raise exception 'This order can still be edited directly — no approval needed'
      using errcode = '22023', detail = 'use_direct_add';
  end if;

  if p_kind not in ('add_lines','replace_lines','edit_addon') then
    raise exception 'unsupported change request kind'
      using errcode = '22023', detail = 'invalid_kind';
  end if;

  if jsonb_typeof(p_payload) is distinct from 'object'
     or pg_column_size(p_payload) > 16384 then
    raise exception 'payload must be an object (<=16KB)'
      using errcode = '22023', detail = 'invalid_payload';
  end if;

  if p_kind = 'add_lines' then
    if ((p_payload ? 'lines')
        and jsonb_typeof(p_payload->'lines') is distinct from 'array')
       or ((p_payload ? 'addons')
        and jsonb_typeof(p_payload->'addons') is distinct from 'array') then
      raise exception 'lines/addons must be arrays'
        using errcode = '22023', detail = 'invalid_payload';
    end if;
    v_lines_n := coalesce(case when jsonb_typeof(p_payload->'lines') = 'array'
                               then jsonb_array_length(p_payload->'lines') end, 0);
    v_addons_n := coalesce(case when jsonb_typeof(p_payload->'addons') = 'array'
                                then jsonb_array_length(p_payload->'addons') end, 0);
    if v_lines_n > 10 or v_addons_n > 10 or (v_lines_n + v_addons_n) < 1 then
      raise exception 'payload must carry 1..10 lines and/or 1..10 add-ons'
        using errcode = '22023', detail = 'invalid_payload';
    end if;
  elsif p_kind = 'replace_lines' then
    -- replace_lines: targetLineIds (1..30 uuids, this order, no promo/free/
    -- bundle markers, thread-virgin) + the replacement line object.
    if jsonb_typeof(p_payload->'targetLineIds') is distinct from 'array'
       or jsonb_array_length(p_payload->'targetLineIds') < 1
       or jsonb_array_length(p_payload->'targetLineIds') > 30
       or jsonb_typeof(p_payload->'line') is distinct from 'object' then
      raise exception 'payload must carry targetLineIds (1..30) + line'
        using errcode = '22023', detail = 'invalid_payload';
    end if;
    begin
      select array_agg(distinct value::uuid) into v_targets
        from jsonb_array_elements_text(p_payload->'targetLineIds');
    exception when others then
      raise exception 'targetLineIds must be uuids'
        using errcode = '22023', detail = 'invalid_payload';
    end;
    if coalesce(array_length(v_targets, 1), 0)
       is distinct from jsonb_array_length(p_payload->'targetLineIds') then
      raise exception 'targetLineIds must be distinct'
        using errcode = '22023', detail = 'invalid_payload';
    end if;
    select count(*) into v_cnt from order_lines ol
     where ol.id = any(v_targets) and ol.order_id = p_order_id;
    if v_cnt is distinct from array_length(v_targets, 1) then
      raise exception 'target line(s) not found on this order'
        using errcode = '22023', detail = 'line_not_found';
    end if;
    if exists (
      select 1 from order_lines ol
       where ol.id = any(v_targets)
         and (coalesce(ol.attrs, '{}'::jsonb) ? 'free_gift'
           or coalesce(ol.attrs, '{}'::jsonb) ? 'free_item'
           or coalesce(ol.attrs, '{}'::jsonb) ? 'pwp'
           or coalesce(ol.attrs, '{}'::jsonb) ? 'bundle_group'
           or coalesce(ol.attrs, '{}'::jsonb) ? 'combo_key')
    ) then
      raise exception 'free, promo and bundle items cannot be changed'
        using errcode = '22023', detail = 'line_not_editable';
    end if;
    -- Production-safety: a line with a live thread can't be swapped (the
    -- 0124 CASCADE would delete the thread). Fail at SUBMIT so the dealer
    -- hears it immediately, not days later at approval.
    if exists (
      select 1 from order_supplier_threads t
       where t.order_line_id = any(v_targets)
    ) then
      raise exception 'This item is already in HQ production — contact operation to change it'
        using errcode = '22023', detail = 'line_in_production';
    end if;
  else
    -- 0258 edit_addon: targetAddonId (this order, not DELIVERY*) + qty
    -- (up-sell law: ≥ current) — fail at SUBMIT, not at approval.
    if jsonb_typeof(p_payload->'targetAddonId') is distinct from 'string'
       or jsonb_typeof(p_payload->'qty') is distinct from 'number' then
      raise exception 'payload must carry targetAddonId + qty'
        using errcode = '22023', detail = 'invalid_payload';
    end if;
    begin
      v_target_addon := (p_payload->>'targetAddonId')::uuid;
    exception when others then
      raise exception 'targetAddonId must be a uuid'
        using errcode = '22023', detail = 'invalid_payload';
    end;
    v_new_qty := (p_payload->>'qty')::int;
    if v_new_qty is null or v_new_qty < 1 or v_new_qty > 99 then
      raise exception 'qty must be 1..99'
        using errcode = '22023', detail = 'invalid_payload';
    end if;
    select * into v_addon_row from order_addons
     where id = v_target_addon and order_id = p_order_id;
    if not found then
      raise exception 'add-on not found on this order'
        using errcode = '22023', detail = 'addon_not_found';
    end if;
    if v_addon_row.addon_key in ('DELIVERY','DELIVERY_CROSS','DELIVERY_ADD') then
      raise exception 'delivery fees are computed by the system and cannot be edited'
        using errcode = '22023', detail = 'addon_not_editable';
    end if;
    if v_new_qty < v_addon_row.qty then
      raise exception 'quantity can only stay or increase — reductions go through HQ'
        using errcode = '22023', detail = 'downsell_blocked';
    end if;
  end if;

  begin
    insert into order_change_requests (order_id, kind, payload, requested_by)
    values (p_order_id, p_kind, p_payload, auth.uid())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'This order already has a pending product change'
      using errcode = '22023', detail = 'pending_exists';
  end;

  insert into order_history (order_id, text, by_role, metadata)
  values (
    p_order_id,
    case when p_kind = 'replace_lines'
         then 'Item change submitted · awaiting HQ approval'
         when p_kind = 'edit_addon'
         then 'Add-on change submitted · awaiting HQ approval'
         else format('Product change submitted · %s item(s) · awaiting HQ approval',
                     v_lines_n + v_addons_n)
    end,
    v_role,
    jsonb_build_object('kind', 'change_request_submitted',
                       'change_request_id', v_id,
                       'change_kind', p_kind)
  );
  insert into audit_log (role, action, dealer_id, ref)
  values (v_role, 'order.change_request_submitted', v_order.dealer_id, 'SO-' || v_order.so::text);

  return jsonb_build_object('id', v_id);
end;
$function$
$s0500a$;
    insert into _g0500 values ('submit_order_change_request_unchecked_0258(uuid, jsonb, text)', 'rewritten');
  elsif h in ('8b4dbb96fbf5a459199fdc7fec432b98') then insert into _g0500 values ('submit_order_change_request_unchecked_0258(uuid, jsonb, text)', 'already');
  else insert into _g0500 values ('submit_order_change_request_unchecked_0258(uuid, jsonb, text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'submit_order_change_request_unchecked_0258(uuid, jsonb, text)';
  end if;
end
$g0500$;

-- supplier_acknowledge(text)
--   source: repo 0066_supplier_phase6_rpcs.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.supplier_acknowledge(text)'); h text;
begin
  if p is null then insert into _g0500 values ('supplier_acknowledge(text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '2cba2cad3486860d82efbc185b6a530b' then
    execute $s0500a$
create or replace function public.supplier_acknowledge(p_po_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_po           purchase_orders;
  v_role         app_role;
  v_supplier_id  uuid;
  v_supplier_kind supplier_kind;
  v_actor        text;
begin
  v_role        := public.app_role();
  v_supplier_id := public.app_supplier_id();

  if (v_role is null or v_role <> 'supplier') then
    raise exception 'forbidden: supplier role only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO not found'
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  if v_supplier_id is null or v_po.supplier_id is distinct from v_supplier_id then
    raise exception 'forbidden: cross-supplier acknowledge'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if v_po.sup_status <> 'pending' then
    raise exception 'PO not in pending state (got %)', v_po.sup_status
      using errcode = '22023', detail = 'wrong_sup_status';
  end if;

  -- own_logistics-only gate. factory_pickup uses supplier_start_production
  -- to jump directly from pending → in_production.
  select kind into v_supplier_kind from suppliers where id = v_supplier_id;
  if v_supplier_kind <> 'own_logistics' then
    raise exception 'PO acknowledge only valid for own_logistics suppliers (kind %)', v_supplier_kind
      using errcode = '22023', detail = 'wrong_supplier_kind';
  end if;

  v_actor := coalesce((select name from app_users where id = (select auth.uid())), 'Supplier');

  update purchase_orders
     set sup_status = 'acknowledged',
         updated_at = now()
   where id = p_po_id;

  insert into po_history (po_id, text, by_role, by_user_id)
  values (p_po_id, 'Acknowledged · production scheduled', 'supplier', (select auth.uid()));

  insert into audit_log (role, actor_text, action, ref)
  values ('supplier', v_actor, format('Acknowledged PO %s', p_po_id), p_po_id);

  return jsonb_build_object('po_id', p_po_id, 'sup_status', 'acknowledged');
end;
$$
$s0500a$;
    insert into _g0500 values ('supplier_acknowledge(text)', 'rewritten');
  elsif h in ('f0b5b5e16f0aa49eb051049548c456f7') then insert into _g0500 values ('supplier_acknowledge(text)', 'already');
  else insert into _g0500 values ('supplier_acknowledge(text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'supplier_acknowledge(text)';
  end if;
end
$g0500$;

-- supplier_committed_demand()
--   source: repo 0148_supplier_forecast_category.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.supplier_committed_demand()'); h text;
begin
  if p is null then insert into _g0500 values ('supplier_committed_demand()', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '5443410c9d69edeb7d6999252298dceb' then
    execute $s0500a$
create or replace function public.supplier_committed_demand()
returns table(sku text, category text, committed_qty int, po_count int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $func$
declare
  v_supplier_id uuid;
begin
  if (public.app_role() is null or public.app_role() <> 'supplier') then
    raise exception 'forbidden: supplier only' using errcode = '42501', detail = 'forbidden';
  end if;
  v_supplier_id := public.app_supplier_id();
  if v_supplier_id is null then
    raise exception 'no supplier_id on JWT' using errcode = '42501', detail = 'no_supplier_id';
  end if;

  return query
    select pol.sku::text,
           public.resolve_demand_category(pol.sku) as category,
           sum(pol.qty)::int                       as committed_qty,
           count(distinct pol.po_id)::int          as po_count
      from purchase_order_lines pol
      join purchase_orders po on po.id = pol.po_id
     where po.supplier_id = v_supplier_id
       and po.sup_status in (
         'pending','acknowledged','in_production','ready_for_pickup',
         'pickup_assigned','pickup_accepted','partially_shipped','shipped','reassign_needed'
       )
     group by pol.sku
     order by sum(pol.qty) desc;
end;
$func$
$s0500a$;
    insert into _g0500 values ('supplier_committed_demand()', 'rewritten');
  elsif h in ('c5f6d3d269322920c70cadf2df39edf1') then insert into _g0500 values ('supplier_committed_demand()', 'already');
  else insert into _g0500 values ('supplier_committed_demand()', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'supplier_committed_demand()';
  end if;
end
$g0500$;

-- supplier_mark_delivered(text, text, text, text)
--   source: repo 0094_supplier_mark_delivered_require_do_file.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.supplier_mark_delivered(text, text, text, text)'); h text;
begin
  if p is null then insert into _g0500 values ('supplier_mark_delivered(text, text, text, text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '6bcb1e96987a1db41050038f4d61f077' then
    execute $s0500a$
CREATE OR REPLACE FUNCTION public.supplier_mark_delivered(
  p_po_id        text,
  p_do_number    text,
  p_do_file_path text,
  p_do_note      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_po          purchase_orders;
  v_role        app_role;
  v_supplier_id uuid;
  v_uid         uuid;
  v_actor       text;
BEGIN
  v_role        := public.app_role();
  v_supplier_id := public.app_supplier_id();
  v_uid         := (select auth.uid());

  IF (v_role is null or v_role <> 'supplier') THEN
    RAISE EXCEPTION 'forbidden: supplier role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  IF p_do_number IS NULL OR btrim(p_do_number) = '' THEN
    RAISE EXCEPTION 'DO number is required'
      USING ERRCODE = '22023', DETAIL = 'missing_do_number';
  END IF;

  IF p_do_file_path IS NULL OR btrim(p_do_file_path) = '' THEN
    RAISE EXCEPTION 'DO file is required'
      USING ERRCODE = '22023', DETAIL = 'do_file_path_required';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found'
      USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;

  IF v_supplier_id IS NULL OR v_po.supplier_id IS DISTINCT FROM v_supplier_id THEN
    RAISE EXCEPTION 'forbidden: cross-supplier mark-delivered'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  -- Valid sources: pickup_accepted (own_logistics + factory_pickup pickup
  -- flow), shipped (own_logistics direct ship variant), partner_confirmed
  -- (0090 sofa flow — partner_owned WH accepted the supplier-delivered goods).
  IF v_po.sup_status NOT IN ('pickup_accepted', 'shipped', 'partner_confirmed') THEN
    RAISE EXCEPTION 'PO not in pickup_accepted/shipped/partner_confirmed state (got %)', v_po.sup_status
      USING ERRCODE = '22023', DETAIL = 'wrong_sup_status';
  END IF;

  v_actor := coalesce((SELECT name FROM app_users WHERE id = v_uid), 'Supplier');

  UPDATE purchase_orders
     SET sup_status     = 'delivered',
         do_number      = btrim(p_do_number),
         do_file_path   = btrim(p_do_file_path),
         do_uploaded_at = now(),
         do_uploaded_by = v_uid,
         updated_at     = now()
   WHERE id = p_po_id;

  INSERT INTO po_history (po_id, text, by_role, by_user_id)
  VALUES (
    p_po_id,
    format('DO uploaded · %s%s · file %s',
           btrim(p_do_number),
           CASE WHEN p_do_note IS NOT NULL AND btrim(p_do_note) <> ''
                THEN ' · ' || btrim(p_do_note)
                ELSE '' END,
           btrim(p_do_file_path)),
    'supplier',
    v_uid
  );

  INSERT INTO audit_log (role, actor_text, action, ref)
  VALUES (
    'supplier',
    v_actor,
    format('Marked PO %s delivered (DO %s)', p_po_id, btrim(p_do_number)),
    p_po_id
  );

  RETURN jsonb_build_object(
    'po_id',        p_po_id,
    'sup_status',   'delivered',
    'do_number',    btrim(p_do_number),
    'do_file_path', btrim(p_do_file_path)
  );
END;
$$
$s0500a$;
    insert into _g0500 values ('supplier_mark_delivered(text, text, text, text)', 'rewritten');
  elsif h in ('f2f183303b4673c1f9f8525e0524c123') then insert into _g0500 values ('supplier_mark_delivered(text, text, text, text)', 'already');
  else insert into _g0500 values ('supplier_mark_delivered(text, text, text, text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'supplier_mark_delivered(text, text, text, text)';
  end if;
end
$g0500$;

-- supplier_mark_thread_ready(uuid)
--   source: repo 0131_supplier_mark_ready_po_rollup.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.supplier_mark_thread_ready(uuid)'); h text;
begin
  if p is null then insert into _g0500 values ('supplier_mark_thread_ready(uuid)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'fe39e5a049eb69983126fa8b4fd703ab' then
    execute $s0500a$
CREATE OR REPLACE FUNCTION public.supplier_mark_thread_ready(p_thread_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_thread          order_supplier_threads;
  v_po              purchase_orders;
  v_supplier_id     uuid;
  v_actor_uid       uuid;
  v_all_ready       boolean;
  v_warehouse_owner uuid;
  v_target_status   po_sup_status;
  v_advanced        boolean := false;
BEGIN
  v_supplier_id := public.app_supplier_id();
  v_actor_uid   := (SELECT auth.uid());

  IF (public.app_role() is null or public.app_role() <> 'supplier') THEN
    RAISE EXCEPTION 'forbidden: supplier role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: supplier_id missing on JWT'
      USING ERRCODE = '42501', DETAIL = 'no_supplier_id';
  END IF;

  SELECT * INTO v_thread FROM order_supplier_threads WHERE id = p_thread_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'thread not found' USING ERRCODE = '42P01', DETAIL = 'thread_not_found';
  END IF;
  IF v_thread.po_id IS NULL THEN
    RAISE EXCEPTION 'thread has no PO' USING ERRCODE = '22023', DETAIL = 'no_po';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = v_thread.po_id FOR UPDATE;
  IF v_po.supplier_id IS DISTINCT FROM v_supplier_id THEN
    RAISE EXCEPTION 'forbidden: not this supplier''s PO'
      USING ERRCODE = '42501', DETAIL = 'cross_tenant';
  END IF;

  IF v_po.sup_status NOT IN ('acknowledged', 'in_production', 'ready_for_pickup', 'ready_confirm_sent', 'partially_shipped') THEN
    RAISE EXCEPTION 'PO not in a state that accepts ready ticks (got %)', v_po.sup_status
      USING ERRCODE = '22023', DETAIL = 'wrong_po_state';
  END IF;

  IF v_thread.pickup_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'thread already picked up' USING ERRCODE = '22023', DETAIL = 'already_picked';
  END IF;

  IF v_thread.supplier_ready_at IS NOT NULL THEN
    RETURN jsonb_build_object('thread_id', p_thread_id, 'supplier_ready_at', v_thread.supplier_ready_at, 'noop', true);
  END IF;

  UPDATE order_supplier_threads
     SET supplier_ready_at = now(),
         supplier_ready_by = v_actor_uid,
         updated_at        = now()
   WHERE id = p_thread_id;

  INSERT INTO po_history (po_id, text, by_role, by_user_id)
  VALUES (v_po.id,
          format('Thread %s marked ready by supplier', p_thread_id),
          'supplier', v_actor_uid);

  -- 0131: PO sup_status rollup. After marking this thread ready, check if
  -- all non-picked threads of this PO are now ready. If yes, advance PO
  -- sup_status to ready_confirm_sent (LP-owned WH) or ready_for_pickup
  -- (own WH). Only runs when current sup_status is acknowledged/in_production
  -- so we don't overwrite downstream states.
  SELECT bool_and(supplier_ready_at IS NOT NULL)
    INTO v_all_ready
    FROM order_supplier_threads
   WHERE po_id = v_po.id
     AND pickup_event_id IS NULL;

  IF v_all_ready IS TRUE
     AND v_po.sup_status IN ('acknowledged', 'in_production') THEN
    SELECT owning_partner_id INTO v_warehouse_owner
      FROM warehouses WHERE id = v_po.warehouse_id;

    v_target_status := CASE
      WHEN v_warehouse_owner IS NOT NULL THEN 'ready_confirm_sent'::po_sup_status
      ELSE 'ready_for_pickup'::po_sup_status
    END;

    UPDATE purchase_orders
       SET sup_status       = v_target_status,
           ready_confirm_at = now(),
           updated_at       = now()
     WHERE id = v_po.id;

    INSERT INTO po_history (po_id, text, by_role, by_user_id)
    VALUES (v_po.id,
            format('All threads ready · PO advanced to %s%s',
                   v_target_status,
                   CASE WHEN v_warehouse_owner IS NOT NULL
                        THEN ' (awaiting LP accept)'
                        ELSE ' (awaiting receive at own WH)'
                   END),
            'supplier', v_actor_uid);

    v_advanced := true;
  END IF;

  RETURN jsonb_build_object(
    'thread_id', p_thread_id,
    'supplier_ready_at', now(),
    'po_sup_status', CASE WHEN v_advanced THEN v_target_status ELSE v_po.sup_status END,
    'po_advanced', v_advanced
  );
END;
$function$
$s0500a$;
    insert into _g0500 values ('supplier_mark_thread_ready(uuid)', 'rewritten');
  elsif h in ('d90e820b28f60e495f4b6be520e842df') then insert into _g0500 values ('supplier_mark_thread_ready(uuid)', 'already');
  else insert into _g0500 values ('supplier_mark_thread_ready(uuid)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'supplier_mark_thread_ready(uuid)';
  end if;
end
$g0500$;

-- supplier_orders_for_threads(uuid[])
--   source: repo 0130_cancelled_order_filter_audit.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.supplier_orders_for_threads(uuid[])'); h text;
begin
  if p is null then insert into _g0500 values ('supplier_orders_for_threads(uuid[])', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'c6ad30da8d72c2670c2a0bbd75814bf3' then
    execute $s0500a$
CREATE OR REPLACE FUNCTION public.supplier_orders_for_threads(p_order_ids uuid[])
 RETURNS TABLE(id uuid, so integer, customer_name text, delivery_date date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_supplier_id uuid;
BEGIN
  v_supplier_id := public.app_supplier_id();

  IF (public.app_role() is null or public.app_role() <> 'supplier') THEN
    RAISE EXCEPTION 'forbidden: supplier role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: supplier_id missing on JWT'
      USING ERRCODE = '42501', DETAIL = 'no_supplier_id';
  END IF;

  RETURN QUERY
  SELECT DISTINCT o.id, o.so, o.customer_name, o.delivery_date
  FROM orders o
  JOIN order_supplier_threads t ON t.order_id = o.id
  JOIN purchase_orders po ON po.id = t.po_id
  WHERE o.id = ANY(p_order_ids)
    AND o.status <> 'cancelled'
    AND po.supplier_id = v_supplier_id;
END;
$function$
$s0500a$;
    insert into _g0500 values ('supplier_orders_for_threads(uuid[])', 'rewritten');
  elsif h in ('83335fe86d4c1a812e3bbf9b8351e23a') then insert into _g0500 values ('supplier_orders_for_threads(uuid[])', 'already');
  else insert into _g0500 values ('supplier_orders_for_threads(uuid[])', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'supplier_orders_for_threads(uuid[])';
  end if;
end
$g0500$;

-- supplier_pending_demand()
--   source: repo 0148_supplier_forecast_category.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.supplier_pending_demand()'); h text;
begin
  if p is null then insert into _g0500 values ('supplier_pending_demand()', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '19b2cf6f638531ee729183622006bdb1' then
    execute $s0500a$
create or replace function public.supplier_pending_demand()
returns table(sku text, category text, pending_qty int, order_count int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $func$
declare
  v_supplier_id uuid;
  v_cat_covered text[];
begin
  if (public.app_role() is null or public.app_role() <> 'supplier') then
    raise exception 'forbidden: supplier only' using errcode = '42501', detail = 'forbidden';
  end if;
  v_supplier_id := public.app_supplier_id();
  if v_supplier_id is null then
    raise exception 'no supplier_id on JWT' using errcode = '42501', detail = 'no_supplier_id';
  end if;
  select s.cat_covered into v_cat_covered from suppliers s where s.id = v_supplier_id;
  if v_cat_covered is null or array_length(v_cat_covered, 1) is null then
    return;
  end if;

  return query
    with lines as (
      select ol.id, ol.order_id, ol.sku, ol.qty,
             public.resolve_demand_category(ol.sku) as cat
        from order_lines ol
        join orders o on o.id = ol.order_id
       where o.status not in ('delivered', 'cancelled')
         and not exists (
           select 1 from order_supplier_threads t
            where t.order_line_id = ol.id and t.po_id is not null
         )
    )
    select l.sku::text,
           l.cat                                as category,
           sum(l.qty)::int                      as pending_qty,
           count(distinct l.order_id)::int      as order_count
      from lines l
     where l.cat = ANY (v_cat_covered)
     group by l.sku, l.cat
     order by sum(l.qty) desc;
end;
$func$
$s0500a$;
    insert into _g0500 values ('supplier_pending_demand()', 'rewritten');
  elsif h in ('cfb97f546522a105067fe78fb5c70ce0') then insert into _g0500 values ('supplier_pending_demand()', 'already');
  else insert into _g0500 values ('supplier_pending_demand()', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'supplier_pending_demand()';
  end if;
end
$g0500$;

-- supplier_start_production(text)
--   source: repo 0066_supplier_phase6_rpcs.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.supplier_start_production(text)'); h text;
begin
  if p is null then insert into _g0500 values ('supplier_start_production(text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '91a492c04399bae3102354574be5daa1' then
    execute $s0500a$
create or replace function public.supplier_start_production(p_po_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_po           purchase_orders;
  v_role         app_role;
  v_supplier_id  uuid;
  v_supplier_kind supplier_kind;
  v_actor        text;
begin
  v_role        := public.app_role();
  v_supplier_id := public.app_supplier_id();

  if (v_role is null or v_role <> 'supplier') then
    raise exception 'forbidden: supplier role only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO not found'
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  if v_supplier_id is null or v_po.supplier_id is distinct from v_supplier_id then
    raise exception 'forbidden: cross-supplier start-production'
      using errcode = '42501', detail = 'forbidden';
  end if;

  -- factory_pickup: pending → in_production (skip ack)
  -- own_logistics: acknowledged → in_production (after ack)
  select kind into v_supplier_kind from suppliers where id = v_supplier_id;

  if v_supplier_kind = 'factory_pickup' then
    if v_po.sup_status not in ('pending', 'acknowledged') then
      raise exception 'PO not in pending/acknowledged state (got %)', v_po.sup_status
        using errcode = '22023', detail = 'wrong_sup_status';
    end if;
  else
    -- own_logistics: must be acknowledged first
    if v_po.sup_status <> 'acknowledged' then
      raise exception 'PO not in acknowledged state (got %)', v_po.sup_status
        using errcode = '22023', detail = 'wrong_sup_status';
    end if;
  end if;

  v_actor := coalesce((select name from app_users where id = (select auth.uid())), 'Supplier');

  update purchase_orders
     set sup_status = 'in_production',
         updated_at = now()
   where id = p_po_id;

  insert into po_history (po_id, text, by_role, by_user_id)
  values (p_po_id, 'Production started', 'supplier', (select auth.uid()));

  insert into audit_log (role, actor_text, action, ref)
  values ('supplier', v_actor, format('Started production on PO %s', p_po_id), p_po_id);

  return jsonb_build_object('po_id', p_po_id, 'sup_status', 'in_production');
end;
$$
$s0500a$;
    insert into _g0500 values ('supplier_start_production(text)', 'rewritten');
  elsif h in ('9f6c5828437f234f0416c22f79b20ed2') then insert into _g0500 values ('supplier_start_production(text)', 'already');
  else insert into _g0500 values ('supplier_start_production(text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'supplier_start_production(text)';
  end if;
end
$g0500$;

-- supplier_threads_for_po(text)
--   source: repo 0130_cancelled_order_filter_audit.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.supplier_threads_for_po(text)'); h text;
begin
  if p is null then insert into _g0500 values ('supplier_threads_for_po(text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '154c1f41361c2ebf1f06d6ab8ef201de' then
    execute $s0500a$
CREATE OR REPLACE FUNCTION public.supplier_threads_for_po(p_po_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_supplier_id uuid;
  v_po          purchase_orders;
  v_result      jsonb;
BEGIN
  IF (public.app_role() is null or public.app_role() <> 'supplier') THEN
    RAISE EXCEPTION 'forbidden: supplier only' USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  v_supplier_id := public.app_supplier_id();
  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'no supplier_id on JWT' USING ERRCODE = '42501', DETAIL = 'no_supplier_id';
  END IF;
  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found' USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;
  IF v_po.supplier_id IS DISTINCT FROM v_supplier_id THEN
    RAISE EXCEPTION 'forbidden: cross_tenant' USING ERRCODE = '42501', DETAIL = 'cross_tenant';
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id',                     t.id,
      'order_id',               t.order_id,
      'order_dl',               o.so,
      'customer_name',          o.customer_name,
      'customer_delivery_date', o.delivery_date,
      'supplier_ready_at',      t.supplier_ready_at,
      'pickup_event_id',        t.pickup_event_id,
      'sku_lines', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('sku', ol.sku, 'qty', ol.qty)), '[]'::jsonb)
          FROM order_lines ol
          JOIN product_skus ps ON ps.sku = ol.sku
          JOIN product_models pm ON pm.id = ps.model_id
         WHERE ol.order_id = t.order_id
           AND pm.category::text = t.category
      )
    )
    ORDER BY o.delivery_date NULLS LAST, t.id
  ), '[]'::jsonb) INTO v_result
  FROM order_supplier_threads t
  LEFT JOIN orders o ON o.id = t.order_id
  WHERE t.po_id = p_po_id
    -- 0130: hide threads whose underlying order has been cancelled. The
    -- supplier Production checklist shouldn't ask them to act on dead
    -- work. LEFT JOIN preserved + IS NULL check so threads with broken
    -- order ref (shouldn't happen, but defensive) don't disappear.
    AND (o.status IS NULL OR o.status <> 'cancelled');

  RETURN v_result;
END;
$function$
$s0500a$;
    insert into _g0500 values ('supplier_threads_for_po(text)', 'rewritten');
  elsif h in ('c1b8155111211e53c7424f4c574b1998') then insert into _g0500 values ('supplier_threads_for_po(text)', 'already');
  else insert into _g0500 values ('supplier_threads_for_po(text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'supplier_threads_for_po(text)';
  end if;
end
$g0500$;

-- supplier_unmark_thread_ready(uuid)
--   source: repo 0131_supplier_mark_ready_po_rollup.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.supplier_unmark_thread_ready(uuid)'); h text;
begin
  if p is null then insert into _g0500 values ('supplier_unmark_thread_ready(uuid)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '1e47498370067b8f15f653c05954b0f2' then
    execute $s0500a$
CREATE OR REPLACE FUNCTION public.supplier_unmark_thread_ready(p_thread_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_thread       order_supplier_threads;
  v_po           purchase_orders;
  v_supplier_id  uuid;
  v_actor_uid    uuid;
  v_all_ready    boolean;
  v_reverted     boolean := false;
BEGIN
  v_supplier_id := public.app_supplier_id();
  v_actor_uid   := (SELECT auth.uid());

  IF (public.app_role() is null or public.app_role() <> 'supplier') THEN
    RAISE EXCEPTION 'forbidden: supplier role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  SELECT * INTO v_thread FROM order_supplier_threads WHERE id = p_thread_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'thread not found' USING ERRCODE = '42P01', DETAIL = 'thread_not_found';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = v_thread.po_id FOR UPDATE;
  IF v_po.supplier_id IS DISTINCT FROM v_supplier_id THEN
    RAISE EXCEPTION 'forbidden: cross_tenant'
      USING ERRCODE = '42501', DETAIL = 'cross_tenant';
  END IF;

  IF v_thread.pickup_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'cannot unmark: thread already picked up'
      USING ERRCODE = '22023', DETAIL = 'already_picked';
  END IF;
  IF v_thread.supplier_ready_at IS NULL THEN
    RETURN jsonb_build_object('thread_id', p_thread_id, 'noop', true);
  END IF;

  UPDATE order_supplier_threads
     SET supplier_ready_at = NULL,
         supplier_ready_by = NULL,
         updated_at        = now()
   WHERE id = p_thread_id;

  INSERT INTO po_history (po_id, text, by_role, by_user_id)
  VALUES (v_po.id,
          format('Thread %s ready-tick rolled back by supplier', p_thread_id),
          'supplier', v_actor_uid);

  -- 0131: reverse PO rollup. After unmarking this thread, check if at least
  -- one non-picked thread is now not-ready. If so AND PO was at our advanced
  -- state (ready_confirm_sent / ready_for_pickup), revert to in_production
  -- so the PO drops back from LP "Awaiting Accept" / Operation "Ready" UI.
  -- Don't touch if downstream actor has already advanced past us
  -- (partner_confirmed, partially_shipped, etc.).
  SELECT bool_and(supplier_ready_at IS NOT NULL)
    INTO v_all_ready
    FROM order_supplier_threads
   WHERE po_id = v_po.id
     AND pickup_event_id IS NULL;

  IF (v_all_ready IS NOT TRUE)
     AND v_po.sup_status IN ('ready_confirm_sent', 'ready_for_pickup') THEN
    UPDATE purchase_orders
       SET sup_status       = 'in_production',
           ready_confirm_at = NULL,
           updated_at       = now()
     WHERE id = v_po.id;

    INSERT INTO po_history (po_id, text, by_role, by_user_id)
    VALUES (v_po.id,
            'Thread unmarked · PO reverted to in_production',
            'supplier', v_actor_uid);

    v_reverted := true;
  END IF;

  RETURN jsonb_build_object(
    'thread_id', p_thread_id,
    'po_sup_status', CASE WHEN v_reverted THEN 'in_production' ELSE v_po.sup_status::text END,
    'po_reverted', v_reverted
  );
END;
$function$
$s0500a$;
    insert into _g0500 values ('supplier_unmark_thread_ready(uuid)', 'rewritten');
  elsif h in ('37d6e54776c4740b7de6abe3f01a5516') then insert into _g0500 values ('supplier_unmark_thread_ready(uuid)', 'already');
  else insert into _g0500 values ('supplier_unmark_thread_ready(uuid)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'supplier_unmark_thread_ready(uuid)';
  end if;
end
$g0500$;

-- top_up_order(uuid, numeric, text, text, text, text, date, jsonb, text)
--   source: repo 0351_customer_payment_posting_convergence.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.top_up_order(uuid, numeric, text, text, text, text, date, jsonb, text)'); h text;
begin
  if p is null then insert into _g0500 values ('top_up_order(uuid, numeric, text, text, text, text, date, jsonb, text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'be07fe46491aebd8326467a8fb197892' then
    execute $s0500a$
create or replace function public.top_up_order(
  p_order_id uuid, p_amount numeric, p_method text, p_method_label text,
  p_reference text, p_note text, p_date date, p_photo_paths jsonb,
  p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_order orders; v_role app_role; v_caller_dealer_id uuid;
  v_total numeric(12,2); v_amount numeric(12,2); v_post jsonb; v_existing order_payments;
begin
  v_role := public.app_role(); v_caller_dealer_id := public.app_dealer_id();
  if nullif(p_idempotency_key,'') is not null then
    select * into v_existing from order_payments
     where source_channel='sales_top_up' and idempotency_key=p_idempotency_key;
    if found then
      if v_existing.order_id is distinct from p_order_id then
        raise exception 'idempotency key was already used for a different payment'
          using errcode='22023',detail='idempotency_conflict';
      end if;
      select paid into v_total from orders where id=p_order_id;
      return jsonb_build_object('id',p_order_id,'amount',v_existing.amount,'paid',v_total,
                                'payment_id',v_existing.id,'already',true);
    end if;
  end if;
  select * into v_order from orders where id=p_order_id for update;
  if not found then raise exception 'Order not found' using errcode='42P01'; end if;
  if (v_role is null or v_role not in ('principal','logistics','finance','bd'))
     and v_order.dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer top-up' using errcode='42501';
  end if;
  if v_order.status in ('delivered','cancelled') then
    raise exception 'Top-up not allowed once order is delivered or cancelled' using errcode='22023',detail='wrong_status';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero' using errcode='22023',detail='invalid_amount'; end if;
  select coalesce((select sum(unit_price*qty) from order_lines where order_id=p_order_id),0)
       + coalesce((select sum(unit_price*qty) from order_addons where order_id=p_order_id),0) into v_total;
  if v_total<=0 then raise exception 'Order has no priced items — cannot top up' using errcode='22023',detail='total_amount_missing'; end if;
  v_amount := least(p_amount, v_total-coalesce(v_order.paid,0));
  if v_amount<=0 then raise exception 'Order is already fully paid' using errcode='22023',detail='already_paid'; end if;
  v_post := public._customer_payment_post(p_order_id,v_amount,p_date,p_method,'payment','sales_top_up',
    coalesce(nullif(p_idempotency_key,''),gen_random_uuid()::text),p_reference,p_reference,p_note,
    null,null,jsonb_build_object('method_label',p_method_label,'photo_paths',coalesce(p_photo_paths,'[]'::jsonb)),true);
  insert into order_history(order_id,text,by_role,metadata) values(p_order_id,
    format('Top-up RM %s via %s%s',v_amount::text,coalesce(nullif(p_method_label,''),p_method),
      case when nullif(trim(coalesce(p_reference,'')),'') is not null then ' · ref '||p_reference else '' end),
    v_role,jsonb_build_object('kind','top_up','amount',v_amount,'method',p_method,
      'method_label',p_method_label,'reference',nullif(p_reference,''),'note',nullif(p_note,''),
      'date',p_date,'photo_paths',coalesce(p_photo_paths,'[]'::jsonb),'payment_id',v_post->'payment_id'));
  return jsonb_build_object('id',p_order_id,'amount',v_amount,'paid',v_post->'orders_paid','payment_id',v_post->'payment_id');
end;
$fn$
$s0500a$;
    insert into _g0500 values ('top_up_order(uuid, numeric, text, text, text, text, date, jsonb, text)', 'rewritten');
  elsif h in ('2bb0645e8ca685ffa93504e9f2791311') then insert into _g0500 values ('top_up_order(uuid, numeric, text, text, text, text, date, jsonb, text)', 'already');
  else insert into _g0500 values ('top_up_order(uuid, numeric, text, text, text, text, date, jsonb, text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'top_up_order(uuid, numeric, text, text, text, text, date, jsonb, text)';
  end if;
end
$g0500$;

-- update_order_change_request(uuid, jsonb)
--   source: repo 0258_edit_order_addon.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.update_order_change_request(uuid, jsonb)'); h text;
begin
  if p is null then insert into _g0500 values ('update_order_change_request(uuid, jsonb)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '652890754f42e5a36a88ec3b66efdea2' then
    execute $s0500a$
CREATE OR REPLACE FUNCTION public.update_order_change_request(
  p_request_id uuid,
  p_payload jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_req              order_change_requests;
  v_order            orders;
  v_role             app_role;
  v_caller_dealer_id uuid;
  v_lines_n          int := 0;
  v_addons_n         int := 0;
  v_targets          uuid[];
  v_cnt              int;
  v_addon_row        order_addons;
  v_target_addon     uuid;
  v_new_qty          int;
begin
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();
  if v_role is null then
    raise exception 'forbidden: no app role' using errcode = '42501';
  end if;

  select * into v_req from order_change_requests where id = p_request_id for update;
  if not found then
    raise exception 'Change request not found' using errcode = '42P01';
  end if;
  select * into v_order from orders where id = v_req.order_id;
  if (v_role is null or v_role not in ('principal','operation','finance','bd'))
     and v_order.dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer edit' using errcode = '42501';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'Only a pending change can be edited'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  if jsonb_typeof(p_payload) is distinct from 'object'
     or pg_column_size(p_payload) > 16384 then
    raise exception 'payload must be an object (<=16KB)'
      using errcode = '22023', detail = 'invalid_payload';
  end if;

  if v_req.kind = 'replace_lines' then
    if jsonb_typeof(p_payload->'targetLineIds') is distinct from 'array'
       or jsonb_array_length(p_payload->'targetLineIds') < 1
       or jsonb_array_length(p_payload->'targetLineIds') > 30
       or jsonb_typeof(p_payload->'line') is distinct from 'object' then
      raise exception 'payload must carry targetLineIds (1..30) + line'
        using errcode = '22023', detail = 'invalid_payload';
    end if;
    begin
      select array_agg(distinct value::uuid) into v_targets
        from jsonb_array_elements_text(p_payload->'targetLineIds');
    exception when others then
      raise exception 'targetLineIds must be uuids'
        using errcode = '22023', detail = 'invalid_payload';
    end;
    select count(*) into v_cnt from order_lines ol
     where ol.id = any(v_targets) and ol.order_id = v_req.order_id;
    if v_cnt is distinct from coalesce(array_length(v_targets, 1), 0) then
      raise exception 'target line(s) not found on this order'
        using errcode = '22023', detail = 'line_not_found';
    end if;
  elsif v_req.kind = 'edit_addon' then
    -- 0258 — same shape law as submit.
    if jsonb_typeof(p_payload->'targetAddonId') is distinct from 'string'
       or jsonb_typeof(p_payload->'qty') is distinct from 'number' then
      raise exception 'payload must carry targetAddonId + qty'
        using errcode = '22023', detail = 'invalid_payload';
    end if;
    begin
      v_target_addon := (p_payload->>'targetAddonId')::uuid;
    exception when others then
      raise exception 'targetAddonId must be a uuid'
        using errcode = '22023', detail = 'invalid_payload';
    end;
    v_new_qty := (p_payload->>'qty')::int;
    select * into v_addon_row from order_addons
     where id = v_target_addon and order_id = v_req.order_id;
    if not found then
      raise exception 'add-on not found on this order'
        using errcode = '22023', detail = 'addon_not_found';
    end if;
    if v_addon_row.addon_key in ('DELIVERY','DELIVERY_CROSS','DELIVERY_ADD') then
      raise exception 'delivery fees are computed by the system and cannot be edited'
        using errcode = '22023', detail = 'addon_not_editable';
    end if;
    if v_new_qty is null or v_new_qty < 1 or v_new_qty > 99
       or v_new_qty < v_addon_row.qty then
      raise exception 'quantity can only stay or increase — reductions go through HQ'
        using errcode = '22023', detail = 'downsell_blocked';
    end if;
  else
    if ((p_payload ? 'lines')
        and jsonb_typeof(p_payload->'lines') is distinct from 'array')
       or ((p_payload ? 'addons')
        and jsonb_typeof(p_payload->'addons') is distinct from 'array') then
      raise exception 'lines/addons must be arrays'
        using errcode = '22023', detail = 'invalid_payload';
    end if;
    v_lines_n := coalesce(case when jsonb_typeof(p_payload->'lines') = 'array'
                               then jsonb_array_length(p_payload->'lines') end, 0);
    v_addons_n := coalesce(case when jsonb_typeof(p_payload->'addons') = 'array'
                                then jsonb_array_length(p_payload->'addons') end, 0);
    if v_lines_n > 10 or v_addons_n > 10 or (v_lines_n + v_addons_n) < 1 then
      raise exception 'payload must carry 1..10 lines and/or 1..10 add-ons'
        using errcode = '22023', detail = 'invalid_payload';
    end if;
  end if;

  update order_change_requests
     set payload = p_payload,
         requested_by = auth.uid(),
         requested_at = now()
   where id = p_request_id;

  insert into order_history (order_id, text, by_role, metadata)
  values (
    v_req.order_id,
    'Product change edited · awaiting HQ approval',
    v_role,
    jsonb_build_object('kind', 'change_request_edited', 'change_request_id', p_request_id)
  );

  return jsonb_build_object('id', p_request_id);
end;
$function$
$s0500a$;
    insert into _g0500 values ('update_order_change_request(uuid, jsonb)', 'rewritten');
  elsif h in ('01d11129ae7872e723b02206564183a6') then insert into _g0500 values ('update_order_change_request(uuid, jsonb)', 'already');
  else insert into _g0500 values ('update_order_change_request(uuid, jsonb)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'update_order_change_request(uuid, jsonb)';
  end if;
end
$g0500$;

-- warehouse_incoming_pos()
--   source: repo 0444_receiving_verifies_the_units_purchasing_issued.sql; 1 gate edit(s)
--   source: live definition (dynamic renames applied); 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.warehouse_incoming_pos()'); h text;
begin
  if p is null then insert into _g0500 values ('warehouse_incoming_pos()', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '2a30e5fce74bf1d70c3bfdd86a291413' then
    execute $s0500a$
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
  if (public.app_role() is null or public.app_role() <> 'warehouse') then
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
                       'category',       public.claim_product_category(pol.sku),
                       -- 0444 · the snapshotted mode decides the count shape.
                       'identity_mode',  pol.identity_mode
                     ) order by pol.sku, pol.id)
                from purchase_order_lines pol where pol.po_id = po.id
            ), '[]'::jsonb),
            -- 0426/0444: the governed expected Units still incoming on this
            -- PO, each bound to its line.
            'expected_units', coalesce((
              select jsonb_agg(jsonb_build_object(
                       'id', i.id, 'unit_code', i.unit_code,
                       'sku', i.sku, 'status', i.status,
                       'po_line_id', i.po_line_id
                     ) order by i.unit_code)
                from ops_stock_items i
               where i.po_no = po.id and i.status = 'incoming'
                 and i.identity_scope = 'unit'
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
$fn$
$s0500a$;
    insert into _g0500 values ('warehouse_incoming_pos()', 'rewritten');
  elsif h = '0b0fc18afe8db4b3d276d475dd1457bd' then
    execute $s0500b$
CREATE OR REPLACE FUNCTION public.warehouse_incoming_pos()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_wh_id uuid;
  v_out   jsonb;
begin
  if (public.app_role() is null or public.app_role() <> 'warehouse') then
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
            -- A PO whose receipt is waiting must not offer a second form.
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
$function$
$s0500b$;
    insert into _g0500 values ('warehouse_incoming_pos()', 'rewritten');
  elsif h in ('e82021e3ea64a84ed6a975139c284d6f', 'c119d48bf263634a1b9eaa5494d06051') then insert into _g0500 values ('warehouse_incoming_pos()', 'already');
  else insert into _g0500 values ('warehouse_incoming_pos()', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'warehouse_incoming_pos()';
  end if;
end
$g0500$;

-- warehouse_my_receipts()
--   source: repo 0302_warehouse_files_its_own_receiving.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.warehouse_my_receipts()'); h text;
begin
  if p is null then insert into _g0500 values ('warehouse_my_receipts()', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '6d88cd951f1ea6c0346e58ca05d661ae' then
    execute $s0500a$
create or replace function public.warehouse_my_receipts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_wh_id uuid;
begin
  if (public.app_role() is null or public.app_role() <> 'warehouse') then
    raise exception 'forbidden: warehouse role required'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_wh_id := public.app_warehouse_id();
  if v_wh_id is null then
    raise exception 'this login is not bound to a warehouse'
      using errcode = '42501', detail = 'no_warehouse';
  end if;

  return coalesce((
    select jsonb_agg(r order by r->>'submitted_at' desc)
      from (
        select jsonb_build_object(
          'id',            wr.id,
          'po_id',         wr.po_id,
          'supplier_name', s.name,
          'do_number',     wr.do_number,
          'status',        wr.status,
          'lines',         wr.lines,
          'note',          wr.note,
          'submitted_at',  wr.submitted_at,
          'reviewed_at',   wr.reviewed_at,
          'return_reason', wr.return_reason,
          -- The issues this receipt raised, once ops checked it in. Only the
          -- three things the warehouse needs: what it was, how many, is it
          -- settled. No supplier correspondence, no money, no internal notes.
          'claims', coalesce((
            select jsonb_agg(jsonb_build_object(
                     'claim_no',   sc.claim_no,
                     'claim_type', sc.claim_type,
                     'sku',        sc.sku,
                     'qty',        sc.qty,
                     'status',     sc.status
                   ) order by sc.claim_no)
              from supplier_claims sc where sc.warehouse_receipt_id = wr.id
          ), '[]'::jsonb)
        ) as r
        from warehouse_receipts wr
        join purchase_orders po on po.id = wr.po_id
        join suppliers s on s.id = po.supplier_id
       where wr.warehouse_id = v_wh_id
       order by wr.submitted_at desc
       limit 200
      ) q
  ), '[]'::jsonb);
end;
$fn$
$s0500a$;
    insert into _g0500 values ('warehouse_my_receipts()', 'rewritten');
  elsif h in ('e4d2627fbcf0743f8ce6a044cf861d7e') then insert into _g0500 values ('warehouse_my_receipts()', 'already');
  else insert into _g0500 values ('warehouse_my_receipts()', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'warehouse_my_receipts()';
  end if;
end
$g0500$;

-- warehouse_resubmit_receipt(uuid, text, text, text, jsonb, date, jsonb, jsonb)
--   source: repo 0426_a_posted_receiving_wears_its_grn_number.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.warehouse_resubmit_receipt(uuid, text, text, text, jsonb, date, jsonb, jsonb)'); h text;
begin
  if p is null then insert into _g0500 values ('warehouse_resubmit_receipt(uuid, text, text, text, jsonb, date, jsonb, jsonb)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'fb0df0a86215e03537f5fa64bc18bb0b' then
    execute $s0500a$
create or replace function public.warehouse_resubmit_receipt(
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
  if (public.app_role() is null or public.app_role() <> 'warehouse') then
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
$fn$
$s0500a$;
    insert into _g0500 values ('warehouse_resubmit_receipt(uuid, text, text, text, jsonb, date, jsonb, jsonb)', 'rewritten');
  elsif h in ('78c9a7d160a1e638cb1a0a4a0560a048') then insert into _g0500 values ('warehouse_resubmit_receipt(uuid, text, text, text, jsonb, date, jsonb, jsonb)', 'already');
  else insert into _g0500 values ('warehouse_resubmit_receipt(uuid, text, text, text, jsonb, date, jsonb, jsonb)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'warehouse_resubmit_receipt(uuid, text, text, text, jsonb, date, jsonb, jsonb)';
  end if;
end
$g0500$;

-- warehouse_submit_receipt(text, text, text, text, jsonb, date, jsonb, jsonb)
--   source: repo 0426_a_posted_receiving_wears_its_grn_number.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.warehouse_submit_receipt(text, text, text, text, jsonb, date, jsonb, jsonb)'); h text;
begin
  if p is null then insert into _g0500 values ('warehouse_submit_receipt(text, text, text, text, jsonb, date, jsonb, jsonb)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'd0effe7e85b2c4ab84d42b5536e1d9b2' then
    execute $s0500a$
create or replace function public.warehouse_submit_receipt(
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
  if (public.app_role() is null or public.app_role() <> 'warehouse') then
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
$fn$
$s0500a$;
    insert into _g0500 values ('warehouse_submit_receipt(text, text, text, text, jsonb, date, jsonb, jsonb)', 'rewritten');
  elsif h in ('0068d7e762113379970c561ce01699d9') then insert into _g0500 values ('warehouse_submit_receipt(text, text, text, text, jsonb, date, jsonb, jsonb)', 'already');
  else insert into _g0500 values ('warehouse_submit_receipt(text, text, text, text, jsonb, date, jsonb, jsonb)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'warehouse_submit_receipt(text, text, text, text, jsonb, date, jsonb, jsonb)';
  end if;
end
$g0500$;

-- workspace_assign_duty(text, uuid, date, date, text)
--   source: repo 0425_one_shared_duty_resolver_and_the_grn_gate.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.workspace_assign_duty(text, uuid, date, date, text)'); h text;
begin
  if p is null then insert into _g0500 values ('workspace_assign_duty(text, uuid, date, date, text)', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = '558727e3f8e5af6f3dccfea264d1e4a7' then
    execute $s0500a$
create or replace function public.workspace_assign_duty(
  p_duty_key text,
  p_holder_id uuid,
  p_effective_from date,
  p_effective_until date default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  perform public.workspace_duty_settings_gate();
  if p_duty_key is null or p_duty_key !~ '^[a-z][a-z0-9_]{2,39}$' then
    raise exception 'a duty key is required' using errcode = '22023', detail = 'invalid_duty_key';
  end if;
  if p_holder_id is null or not exists (
    select 1 from app_users where id = p_holder_id and status = 'active' and role <> 'dealer'
  ) then
    raise exception 'the holder must be an active internal staff member'
      using errcode = '22023', detail = 'invalid_holder';
  end if;
  -- A staff member cannot assign themself a duty (workspace/MASTER.md §5).
  -- Principal is the governed exception: Jess assigns, including to herself.
  if p_holder_id = v_uid and ((select public.app_role()) is null or (select public.app_role()) <> 'principal') then
    raise exception 'you cannot assign a duty to yourself'
      using errcode = '42501', detail = 'self_assignment_refused';
  end if;
  if p_effective_from is null then
    raise exception 'an effective date is required' using errcode = '22023', detail = 'invalid_dates';
  end if;
  insert into workspace_duty_assignments
    (duty_key, holder_id, effective_from, effective_until, assigned_by, note)
  values
    (p_duty_key, p_holder_id, p_effective_from, p_effective_until, v_uid,
     nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;
  insert into audit_log (role, actor_text, action, ref)
  values ((select public.app_role()),
          coalesce((select name from app_users where id = v_uid), 'Manager'),
          format('Assigned %s to %s from %s%s', p_duty_key,
                 coalesce((select name from app_users where id = p_holder_id), 'staff'),
                 to_char(p_effective_from, 'DD Mon YYYY'),
                 case when p_effective_until is null then ''
                      else ' until ' || to_char(p_effective_until, 'DD Mon YYYY') end),
          p_duty_key);
  return jsonb_build_object('id', v_id, 'duty_key', p_duty_key, 'holder_id', p_holder_id);
end;
$fn$
$s0500a$;
    insert into _g0500 values ('workspace_assign_duty(text, uuid, date, date, text)', 'rewritten');
  elsif h in ('80433017b4eed001ac7f928a1d691fef') then insert into _g0500 values ('workspace_assign_duty(text, uuid, date, date, text)', 'already');
  else insert into _g0500 values ('workspace_assign_duty(text, uuid, date, date, text)', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'workspace_assign_duty(text, uuid, date, date, text)';
  end if;
end
$g0500$;

-- workspace_duty_settings_gate()
--   source: repo 0425_one_shared_duty_resolver_and_the_grn_gate.sql; 1 gate edit(s)
do $g0500$
declare p regprocedure := to_regprocedure('public.workspace_duty_settings_gate()'); h text;
begin
  if p is null then insert into _g0500 values ('workspace_duty_settings_gate()', 'absent'); return; end if;
  select md5(replace(prosrc, E'\r', '')) into h from pg_proc where oid = p and prosecdef;
  if h = 'c2b118270f4f8d77834e06d844bb69f5' then
    execute $s0500a$
create or replace function public.workspace_duty_settings_gate()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role   text := (select public.app_role());
  v_duties text[];
begin
  if v_role is null then
    raise exception 'forbidden' using errcode = '42501', detail = 'no active account';
  end if;
  if (v_role is null or v_role <> 'principal') then
    select coalesce(array_agg(pd.duty_key), '{}'::text[])
      into v_duties
      from app_users u
      join org_position_duties pd on pd.position_id = u.position_id
     where u.id = auth.uid()
       and u.role <> 'dealer'
       and u.status = 'active';
    if not ('ops_manager' = any(coalesce(v_duties, '{}'::text[]))) then
      raise exception 'forbidden' using errcode = '42501',
        detail = 'duty assignments are set by the manager';
    end if;
  end if;
  return v_role;
end;
$fn$
$s0500a$;
    insert into _g0500 values ('workspace_duty_settings_gate()', 'rewritten');
  elsif h in ('e3d85b2b0710a846171ce94418ec8bc0') then insert into _g0500 values ('workspace_duty_settings_gate()', 'already');
  else insert into _g0500 values ('workspace_duty_settings_gate()', 'live body differs - left untouched');
    raise notice '0500: % left untouched: live body matches no known source', 'workspace_duty_settings_gate()';
  end if;
end
$g0500$;

do $sanity$
declare s text; p regprocedure; r record;
begin
  for s in select unnest(array[
    'public._logistics_release_order_reserve(uuid)',
    'public._logistics_reserve_order(uuid)',
    'public.delivery_handover_record(uuid, text, text, text, jsonb, text, text, text[], jsonb)',
    'public.delivery_order_units_snapshot()',
    'public.delivery_order_void(uuid, text)',
    'public.delivery_outbound_prep_record(uuid, text, text[])',
    'public.delivery_payment_approver_gate()',
    'public.is_logistics()',
    'public.is_operations_superuser(uuid)',
    'public.logistics_abandon_order(uuid, text)',
    'public.logistics_adjust_stock(text, uuid, integer, text)',
    'public.logistics_assign_partner(uuid, uuid)',
    'public.logistics_assign_partner_and_dispatch(text, uuid, text, text, text, uuid)',
    'public.logistics_attach_do_and_deliver(uuid, text, text, boolean, text)',
    'public.logistics_calc_shortages(uuid, uuid)',
    'public.logistics_cancel_po(text, text)',
    'public.logistics_confirm_proceed_request(uuid, uuid)',
    'public.logistics_confirm_proceed_request_v3(uuid)',
    'public.logistics_create_po(uuid, uuid, jsonb, integer, integer[], uuid)',
    'public.logistics_create_pos_batch(jsonb)',
    'public.logistics_dashboard_summary()',
    'public.logistics_dispatch_customer_leg(uuid, uuid, date, boolean)',
    'public.logistics_issue_pos_for_order(uuid)',
    'public.logistics_partner_accept_rfd(uuid)',
    'public.logistics_partner_reject_rfd(uuid, text)',
    'public.logistics_partner_rfd_pending()',
    'public.logistics_pick_warehouse(uuid)',
    'public.logistics_reassign_po_warehouse(text, uuid)',
    'public.logistics_receive_po_line(text, text, integer)',
    'public.logistics_receive_threads(text, uuid[], text, text, text)',
    'public.logistics_relocate_warehouse(text, uuid)',
    'public.logistics_resume_dispatch_from_waiting(uuid)',
    'public.logistics_revert_order_dispatched_to_ready(uuid)',
    'public.logistics_revert_order_proceed_to_placed(uuid)',
    'public.logistics_stock_alerts()',
    'public.logistics_supplier_ready_confirm(text)',
    'public.logistics_warehouse_pick(uuid, uuid)',
    'public.ops_delivery_orders_materialise()',
    'public.ops_rollup_stock_balances(uuid)',
    'public.ops_stock_bind_units(uuid[], text, text)',
    'public.ops_stock_book_in_units(jsonb, uuid)',
    'public.ops_stock_refurbish(uuid)',
    'public.ops_stock_refurbish_complete(uuid)',
    'public.ops_stock_set_condition(uuid, text, text)',
    'public.ops_stock_set_holder(uuid, text, text)',
    'public.ops_stock_set_ownership(uuid, text, text, text)',
    'public.ops_stock_set_site(uuid, uuid, text)',
    'public.ops_stock_set_thresholds(text, uuid, integer, integer)',
    'public.ops_stock_unbind_unit(uuid, text)',
    'public.ops_stock_verify_unit(uuid)',
    'public.po_line_change_needs_revision()',
    'public.purchasing_actor_may_issue(uuid)',
    'public.purchasing_approve_po_cost(text, uuid, text, numeric, text, date)',
    'public.purchasing_check_line_commercials(text, uuid, text, numeric, text, numeric)',
    'public.purchasing_confirm_po_sent(text, integer, text, text, text)',
    'public.purchasing_default_destination()',
    'public.purchasing_po_actor()',
    'public.purchasing_record_po_issue_authority()',
    'public.purchasing_require_reply_evidence()',
    'public.service_case_close_needs_customer()',
    'public.trg_po_destination_guard()',
    'public.trg_po_units_follow_destination()',
    'public.trg_product_sku_identity_history()',
    'public.trg_stock_balances_derive_ins()',
    'public.trg_stock_balances_derive_upd()',
    'public.trg_stock_unit_id_register()',
    'public.trg_stock_unit_lineage()',
    'public.warehouse_can_manage_settings()',
    'public.warehouse_is_person(uuid)',
    'public.warehouse_save_special_date(uuid, uuid, date, text, time without time zone, time without time zone, text)',
    'public.warehouse_set_site_details(uuid, text, text, text, uuid, text, uuid, text)',
    'public.warehouse_set_working_hours(uuid, jsonb)'
  ]::text[]) loop
    p := to_regprocedure(s);
    if p is not null and has_function_privilege('anon', p, 'execute') then
      raise exception '0500: anon still executes %', p; end if;
  end loop;
  for r in select result, count(*) n from _g0500 group by result loop
    raise notice '0500 part B: % %', r.n, r.result;
  end loop;
end
$sanity$;

commit;
