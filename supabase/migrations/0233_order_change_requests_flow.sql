-- 0233 — Add-product initiative P3 (design:
-- docs/superpowers/plans/2026-07-18-order-add-product-initiative.md §3.3/§5).
--
-- WAKES the dormant `order_change_requests` table (0231): the proceed-lane
-- submission → operation/principal approval flow. ALL writes ride SECURITY
-- DEFINER RPCs — the table keeps ZERO RLS write policies (the 0231 select
-- policy stays the only policy):
--
--   * submit_order_change_request — dealer-side: file an 'add_lines' request
--     on a PROCEED-lane order (a place-lane order takes direct adds instead
--     → 'use_direct_add'). One pending per order (0231 partial unique →
--     'pending_exists').
--   * cancel_order_change_request — DEALER-SCOPE cancel (any same-dealer user,
--     plus internal roles) of a pending request: pending → cancelled. Wider
--     than "requester-only" BY DESIGN — a colleague on the same counter must
--     be able to withdraw a stale submission (review finding #2, documented).
--   * reject_order_change_request — operation/principal: pending → rejected
--     (+ decision note).
--   * APPROVE has no standalone RPC — it IS the apply: `add_order_lines`
--     (CREATE OR REPLACE, SAME 5-arg signature as 0232) now implements the
--     'change_request' source: operation/principal only, order may sit in
--     the proceed lane (incl. AutoCount imports — items_edited flips), and
--     the line insert + DELIVERY* replace + request stamp
--     (approved/decided/applied) commit in ONE transaction. The Hono decide
--     route runs the SAME engine pipeline as the direct add BEFORE calling
--     it, so an approved request is priced/validated exactly like a fresh
--     add at approval time.

-- ---------------------------------------------------------------------------
-- 1) submit_order_change_request
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.submit_order_change_request(
  p_order_id uuid,
  p_payload jsonb
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
  -- A PLACE-lane order (untouched by ops, not an import) takes DIRECT adds —
  -- a submission there would just stall the dealer behind an approval.
  if v_order.status = 'place'
     and v_order.operation_stage is null
     and coalesce(v_order.source_system, '') <> 'autocount' then
    raise exception 'This order can still take products directly — no approval needed'
      using errcode = '22023', detail = 'use_direct_add';
  end if;

  if jsonb_typeof(p_payload) is distinct from 'object'
     or jsonb_typeof(p_payload->'lines') is distinct from 'array'
     or jsonb_array_length(p_payload->'lines') < 1
     or jsonb_array_length(p_payload->'lines') > 10
     or pg_column_size(p_payload) > 16384 then
    raise exception 'payload must be an object with 1..10 lines (<=16KB)'
      using errcode = '22023', detail = 'invalid_payload';
  end if;

  begin
    insert into order_change_requests (order_id, kind, payload, requested_by)
    values (p_order_id, 'add_lines', p_payload, auth.uid())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'This order already has a pending product change'
      using errcode = '22023', detail = 'pending_exists';
  end;

  insert into order_history (order_id, text, by_role, metadata)
  values (
    p_order_id,
    format('Product change submitted · %s line(s) · awaiting HQ approval',
           jsonb_array_length(p_payload->'lines')),
    v_role,
    jsonb_build_object('kind', 'change_request_submitted', 'change_request_id', v_id)
  );
  insert into audit_log (role, action, dealer_id, ref)
  values (v_role, 'order.change_request_submitted', v_order.dealer_id, 'SO-' || v_order.so::text);

  return jsonb_build_object('id', v_id);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2) cancel_order_change_request
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.cancel_order_change_request(p_request_id uuid)
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
  if v_role not in ('principal','operation','finance','bd')
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
$function$;

-- ---------------------------------------------------------------------------
-- 3) reject_order_change_request (operation / principal)
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.reject_order_change_request(
  p_request_id uuid,
  p_note text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_req  order_change_requests;
  v_role app_role;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden: only operation/principal decide change requests'
      using errcode = '42501';
  end if;

  select * into v_req from order_change_requests where id = p_request_id for update;
  if not found then
    raise exception 'Change request not found' using errcode = '42P01';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'Only a pending change can be rejected'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  update order_change_requests
     set status = 'rejected',
         decided_by = auth.uid(),
         decided_at = now(),
         decision_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_request_id;

  insert into order_history (order_id, text, by_role, metadata)
  values (
    v_req.order_id,
    'Product change rejected by HQ' ||
      case when nullif(trim(coalesce(p_note, '')), '') is not null
           then ' · ' || trim(p_note) else '' end,
    v_role,
    jsonb_build_object('kind', 'change_request_rejected', 'change_request_id', p_request_id)
  );

  return jsonb_build_object('id', p_request_id, 'status', 'rejected');
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4) add_order_lines — the 'change_request' source (approve = apply). SAME
--    5-arg signature as 0232 → CREATE OR REPLACE (grants preserved).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.add_order_lines(
  p_order_id uuid,
  p_lines jsonb,
  p_source text DEFAULT 'direct',
  p_change_request_id uuid DEFAULT NULL,
  p_addons_replace jsonb DEFAULT NULL
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
  v_delta            numeric(14,2) := 0;
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

  -- 0232: cap 30 — the Hono route caps CLIENT input at 10 lines, but a sofa
  -- build explodes into per-compartment rows + RM0 gift appends.
  if jsonb_typeof(p_lines) is distinct from 'array'
     or jsonb_array_length(p_lines) < 1
     or jsonb_array_length(p_lines) > 30 then
    raise exception 'p_lines must be an array of 1..30 lines'
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

  insert into order_history (order_id, text, by_role, metadata)
  values (
    p_order_id,
    format('Products added · %s line(s) · RM %s%s', v_count, v_delta::text,
           case when p_source = 'change_request' then ' · approved product change' else '' end),
    v_role,
    jsonb_build_object(
      'kind', 'add_lines',
      'source', p_source,
      'change_request_id', p_change_request_id,
      'lines', p_lines,
      'addons_replace', p_addons_replace,
      'total_delta', v_delta
    )
  );

  insert into audit_log (role, action, dealer_id, ref)
  values (v_role, 'order.lines_added', v_order.dealer_id, 'SO-' || v_order.so::text);

  return jsonb_build_object('id', p_order_id, 'added', v_count, 'total_delta', v_delta);
end;
$function$;

-- Grants: the three NEW fns (add_order_lines keeps its 0232 grants via
-- CREATE OR REPLACE).
REVOKE ALL ON FUNCTION public.submit_order_change_request(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_order_change_request(uuid, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_order_change_request(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cancel_order_change_request(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.reject_order_change_request(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reject_order_change_request(uuid, text) TO authenticated, service_role;
