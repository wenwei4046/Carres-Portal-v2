-- 0257 — Proceed-lane item CHANGE submissions + service add-ons on the
-- post-create doors (Loo 2026-07-25, S0-1256 feedback):
--
--   1. "Submit product change" could only ADD items. order_change_requests
--      gains kind 'replace_lines' — the dealer re-configures an ORIGINAL item
--      from the proceed lane, HQ approves, and the approval applies through
--      the SAME replace pipeline as the place-lane pencil (0255/0256):
--      up-sell only, promo-entitlement guarded, gifts ride with their line.
--   2. Service add-ons (Dispose old sofa / mattress …, the `addons` config
--      the wizard's AddonsPanel offers) become addable post-create:
--      add_order_lines gains p_addons_append — Hono re-prices each from the
--      live `addons` config (active + not the server-exclusive DELIVERY*
--      keys); the RPC re-checks defensively and appends order_addons rows.
--
-- Signature discipline (0153/0154 ghost-overload lesson) — changed signatures
-- are DROP + CREATE with grants restated:
--   submit_order_change_request (uuid,jsonb)        → (uuid,jsonb,text)
--   add_order_lines            (uuid,jsonb,text,uuid,jsonb) → +p_addons_append
--   replace_order_lines        (uuid,uuid[],jsonb,jsonb)    → +p_source,+p_change_request_id
-- update_order_change_request keeps its signature → CREATE OR REPLACE.
--
-- PRODUCTION-SAFETY GATE (new, both replace sources): a target line that
-- already has an order_supplier_threads row raises 'line_in_production'.
-- 0124 made threads ON DELETE CASCADE on order_lines — without this gate a
-- replace would silently delete a live procurement thread. Threads are born
-- at the ops confirm action, so the change window is exactly "before ops
-- confirms the order"; later changes stay a human conversation with HQ.
--
-- RLS: UNCHANGED. order_change_requests keeps ZERO write policies (all writes
-- ride these SECURITY DEFINER RPCs, role-gated in-body — the 0231/0233
-- posture); order_lines / order_addons post-create writes stay RPC-only.

-- ---------------------------------------------------------------------------
-- 1) kind check: + 'replace_lines'
-- ---------------------------------------------------------------------------

alter table order_change_requests
  drop constraint order_change_requests_kind_check;
alter table order_change_requests
  add constraint order_change_requests_kind_check
  check (kind in ('add_lines','replace_lines'));

-- ---------------------------------------------------------------------------
-- 2) submit_order_change_request — now kind-aware (DROP: 2-arg → 3-arg)
-- ---------------------------------------------------------------------------

DROP FUNCTION public.submit_order_change_request(uuid, jsonb);

CREATE FUNCTION public.submit_order_change_request(
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
  if v_role not in ('principal','operation','finance','bd')
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

  if p_kind not in ('add_lines','replace_lines') then
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
  else
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
$function$;

REVOKE ALL ON FUNCTION public.submit_order_change_request(uuid, jsonb, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_order_change_request(uuid, jsonb, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) update_order_change_request — validation now follows the REQUEST's kind
--    (same 2-arg signature → CREATE OR REPLACE, grants carry over)
-- ---------------------------------------------------------------------------

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
  if v_role not in ('principal','operation','finance','bd')
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
$function$;

-- ---------------------------------------------------------------------------
-- 4) add_order_lines — + p_addons_append (DROP: 5-arg → 6-arg)
-- ---------------------------------------------------------------------------

DROP FUNCTION public.add_order_lines(uuid, jsonb, text, uuid, jsonb);

CREATE FUNCTION public.add_order_lines(
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

  if v_role not in ('principal','operation','finance','bd')
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
    if v_role not in ('operation','principal') then
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
$function$;

REVOKE ALL ON FUNCTION public.add_order_lines(uuid, jsonb, text, uuid, jsonb, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.add_order_lines(uuid, jsonb, text, uuid, jsonb, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) replace_order_lines — + change_request source + thread gate
--    (DROP: 4-arg → 6-arg). Body = 0256 + the marked additions.
-- ---------------------------------------------------------------------------

DROP FUNCTION public.replace_order_lines(uuid, uuid[], jsonb, jsonb);

CREATE FUNCTION public.replace_order_lines(
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

  if v_role not in ('principal','operation','finance','bd')
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
    if v_role not in ('operation','principal') then
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
$function$;

REVOKE ALL ON FUNCTION public.replace_order_lines(uuid, uuid[], jsonb, jsonb, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.replace_order_lines(uuid, uuid[], jsonb, jsonb, text, uuid) TO authenticated, service_role;
