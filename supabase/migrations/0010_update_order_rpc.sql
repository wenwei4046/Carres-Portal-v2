-- =============================================================================
-- 0010 — Phase 2C.2: Full edit of a Place order's customer + delivery fields.
--
-- `update_order(p_order_id uuid, p_payload jsonb)` accepts a partial JSON
-- payload — only fields present in the payload are updated. Mirrors the
-- proto CustomerEditor flow (reference/proto/dealer-orders.jsx:472-581).
--
-- Same security/error contract as proceed_order / blocker resolution RPCs:
--   • SECURITY DEFINER + manual cross-dealer guard
--   • Status guard: only Place orders mutable
--   • SQLSTATE: 42501 forbidden, 42P01 not_found, 22023 invalid_param
--
-- Editable fields:
--   customer_name, customer_phone, customer_address,
--   customer_address_unknown, customer_billing, customer_billing_same,
--   customer_emergency,
--   delivery_date, delivery_date_tbd, delivery_floor, delivery_has_lift
-- =============================================================================

create or replace function public.update_order(
  p_order_id uuid,
  p_payload  jsonb
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
  v_changed          text[] := '{}';
begin
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = '42P01';
  end if;

  if v_role not in ('principal','logistics','finance','bd')
     and v_order.dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer edit'
      using errcode = '42501';
  end if;

  if v_order.status <> 'place' then
    raise exception 'Order is no longer editable'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Payload must be a JSON object'
      using errcode = '22023', detail = 'invalid_payload';
  end if;

  -- Validate the few fields with strict shape requirements.
  if p_payload ? 'customer_name' then
    if coalesce(trim(p_payload->>'customer_name'), '') = '' then
      raise exception 'Customer name cannot be empty'
        using errcode = '22023', detail = 'invalid_customer_name';
    end if;
    v_changed := array_append(v_changed, 'customer_name');
  end if;
  if p_payload ? 'customer_phone'             then v_changed := array_append(v_changed, 'customer_phone'); end if;
  if p_payload ? 'customer_address'           then v_changed := array_append(v_changed, 'customer_address'); end if;
  if p_payload ? 'customer_address_unknown'   then v_changed := array_append(v_changed, 'customer_address_unknown'); end if;
  if p_payload ? 'customer_billing'           then v_changed := array_append(v_changed, 'customer_billing'); end if;
  if p_payload ? 'customer_billing_same'      then v_changed := array_append(v_changed, 'customer_billing_same'); end if;
  if p_payload ? 'customer_emergency'         then v_changed := array_append(v_changed, 'customer_emergency'); end if;
  if p_payload ? 'delivery_date'              then v_changed := array_append(v_changed, 'delivery_date'); end if;
  if p_payload ? 'delivery_date_tbd'          then v_changed := array_append(v_changed, 'delivery_date_tbd'); end if;
  if p_payload ? 'delivery_floor'             then v_changed := array_append(v_changed, 'delivery_floor'); end if;
  if p_payload ? 'delivery_has_lift'          then v_changed := array_append(v_changed, 'delivery_has_lift'); end if;

  if cardinality(v_changed) = 0 then
    raise exception 'No editable fields in payload'
      using errcode = '22023', detail = 'no_changes';
  end if;

  -- Conditional UPDATE: each column either takes the new value (when key
  -- present in payload) or stays unchanged. nullif('', '') treats empty
  -- strings as NULL on the optional fields so the dealer can blank them.
  update orders set
    customer_name            = case when p_payload ? 'customer_name'
                                    then trim(p_payload->>'customer_name') else customer_name end,
    customer_phone           = case when p_payload ? 'customer_phone'
                                    then nullif(trim(p_payload->>'customer_phone'), '') else customer_phone end,
    customer_address         = case when p_payload ? 'customer_address'
                                    then nullif(trim(p_payload->>'customer_address'), '') else customer_address end,
    customer_address_unknown = case when p_payload ? 'customer_address_unknown'
                                    then (p_payload->>'customer_address_unknown')::boolean else customer_address_unknown end,
    customer_billing         = case when p_payload ? 'customer_billing'
                                    then nullif(trim(p_payload->>'customer_billing'), '') else customer_billing end,
    customer_billing_same    = case when p_payload ? 'customer_billing_same'
                                    then (p_payload->>'customer_billing_same')::boolean else customer_billing_same end,
    customer_emergency       = case when p_payload ? 'customer_emergency'
                                    then nullif(trim(p_payload->>'customer_emergency'), '') else customer_emergency end,
    delivery_date            = case when p_payload ? 'delivery_date'
                                    then nullif(p_payload->>'delivery_date', '')::date else delivery_date end,
    delivery_date_tbd        = case when p_payload ? 'delivery_date_tbd'
                                    then (p_payload->>'delivery_date_tbd')::boolean else delivery_date_tbd end,
    delivery_floor           = case when p_payload ? 'delivery_floor'
                                    then greatest(1, (p_payload->>'delivery_floor')::int) else delivery_floor end,
    delivery_has_lift        = case when p_payload ? 'delivery_has_lift'
                                    then (p_payload->>'delivery_has_lift')::boolean else delivery_has_lift end,
    updated_at               = now()
  where id = p_order_id;

  -- Human-readable history line listing the changed fields. The metadata
  -- column carries the full payload for the audit trail / future undo.
  insert into order_history (order_id, text, by_role, metadata)
  values (
    p_order_id,
    format('Order details updated · %s field(s)', cardinality(v_changed)),
    v_role,
    jsonb_build_object(
      'kind', 'edit',
      'changed', to_jsonb(v_changed),
      'payload', p_payload
    )
  );

  insert into audit_log (role, action, dealer_id, ref)
  values (
    v_role,
    'order.edited',
    v_order.dealer_id,
    'DL-' || v_order.dl::text
  );

  return jsonb_build_object(
    'id', p_order_id,
    'changed', v_changed
  );
end;
$$;

revoke all on function public.update_order(uuid, jsonb) from public;
grant execute on function public.update_order(uuid, jsonb) to authenticated;
