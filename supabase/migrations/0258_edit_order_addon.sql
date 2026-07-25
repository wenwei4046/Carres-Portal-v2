-- 0258 — SERVICE add-on rows become editable (Loo 2026-07-25, S0-1255
-- screenshot: "for service sku need to be editable as well"). The dispose /
-- service rows (order_addons) had NO edit path — only products got the 0255
-- pencil. Now:
--
--   * place lane  — pencil on a dealer-chosen addon row edits qty + per-unit
--     sizes DIRECTLY via the new `edit_order_addon` RPC.
--   * proceed lane — the same pencil files an order_change_requests
--     kind='edit_addon' submission; operation/principal approval applies it
--     through the SAME RPC (p_source='change_request').
--
-- Laws carried over from the item pencil (0255/0257):
--   * up-sell only — the row's unit_price snapshot never changes, so the law
--     reduces to qty ≥ current qty ('downsell_blocked'). Removing a service
--     row stays impossible from the POS (a removal is the maximum downsell).
--   * DELIVERY / DELIVERY_CROSS / DELIVERY_ADD are server-minted (0184
--     recompute) and never editable ('addon_not_editable').
--   * 0242 size law — an addon whose config carries size_options must arrive
--     with one size PER UNIT (attrs.sizes) + the composed attrs.size summary.
--
-- Signatures: submit_order_change_request (uuid,jsonb,text) and
-- update_order_change_request (uuid,jsonb) are UNCHANGED → CREATE OR REPLACE
-- (grants carry over; no ghost overloads). `edit_order_addon` is NEW.
-- RLS: unchanged — writes ride SECURITY DEFINER RPCs (0231/0233 posture);
-- guardrail #4: full before-image in order_history + audit_log.

-- ---------------------------------------------------------------------------
-- 1) kind check: + 'edit_addon'
-- ---------------------------------------------------------------------------

alter table order_change_requests
  drop constraint order_change_requests_kind_check;
alter table order_change_requests
  add constraint order_change_requests_kind_check
  check (kind in ('add_lines','replace_lines','edit_addon'));

-- ---------------------------------------------------------------------------
-- 2) edit_order_addon — qty/size edit on ONE order_addons row (NEW)
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.edit_order_addon(
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
  if v_role not in ('principal','operation','finance','bd')
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
$function$;

REVOKE ALL ON FUNCTION public.edit_order_addon(uuid, uuid, int, jsonb, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.edit_order_addon(uuid, uuid, int, jsonb, text, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) submit_order_change_request — + edit_addon branch (same 3-arg signature
--    → CREATE OR REPLACE; body = 0257 + the marked addition)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_order_change_request(
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
$function$;

-- ---------------------------------------------------------------------------
-- 4) update_order_change_request — + edit_addon branch (same 2-arg signature
--    → CREATE OR REPLACE; body = 0257 + the marked addition)
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
$function$;
