-- 0222_pos_proceed_lane_edits.sql
-- (authored as 0220; renumbered 2026-07-14 — Jess's parallel line had already
--  applied 0220_ops_customer_confirmed + 0221_ops_last_chased_at to prod)
-- ===========================================================================
-- POS "My orders" order-detail drawer (2990s parity, Loo 2026-07-14) —
-- proceed-lane edits + un-proceed:
--   (a) update_order(uuid, jsonb) is REPLACED (same signature — body based on
--       the CURRENT live definition, which equals the 0165 version; verified
--       against prod 2026-07-14):
--         • `customer_email` becomes an accepted payload key (nullable trim,
--           like phone), written to orders.customer_email (0200 column);
--         • the wholesale `status <> 'place' → wrong_status` gate becomes
--           FIELD-SCOPED: status 'place' allows everything (today's behavior
--           + email); status 'proceed_order' allows the CUSTOMER fields only
--           (name/phone/email/address/address_unknown/billing/billing_same/
--           emergency) — any delivery/date key in the payload raises 22023
--           detail 'proceed_locked_fields'; delivered/cancelled keep raising
--           22023 'wrong_status'. Everything else (cross-dealer guard,
--           empty-name guard, no_changes, proceed_after_delivery re-check,
--           order_history + audit_log writes) is byte-equal to 0165.
--   (b) NEW unproceed_order(uuid) RPC — the sales-side "Move to Order placed"
--       reversal. Only reversible while the Proceed marker is still purely a
--       sales action: status must be 'proceed_order' AND operation_stage must
--       still be 'confirmed' (what proceed_order stamps; once ops advances the
--       stage → 22023 'wrong_stage') AND the proceed date, if set, must not
--       have passed in MYT (→ 22023 'proceed_date_passed'). Flips
--       status='place' + operation_stage=NULL (fresh Place orders carry a
--       NULL stage — the POS laneOf() relies on it to put the order back in
--       lane 01). Writes order_history (kind:'unproceed') + audit_log
--       ('order.unproceeded').
--
-- APPLIED to prod 2026-07-14 via MCP (tail verified = 0221 immediately
-- before apply; live update_order re-verified == 0165 the same day).
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. update_order — field-scoped proceed-lane gate + customer_email support.
--    Body based on 0165 (the live def); changes marked with "-- 0222:".
-- ---------------------------------------------------------------------------
create or replace function public.update_order(p_order_id uuid, p_payload jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_order            orders;
  v_role             app_role;
  v_caller_dealer_id uuid;
  v_changed          text[] := '{}';
  v_new_delivery     date;
  v_new_proceed      date;
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

  if v_role not in ('principal','operation','finance','bd')
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
$function$;

-- ---------------------------------------------------------------------------
-- 2. unproceed_order — NEW. Sales-side reversal of proceed_order while the
--    Proceed marker is still purely a sales action. Guard rationale in the
--    header comment. Role/dealer guard mirrors update_order/proceed_order.
-- ---------------------------------------------------------------------------
create or replace function public.unproceed_order(p_order_id uuid)
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

  if v_role not in ('principal','operation','finance','bd')
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
$function$;

-- Supabase default-grants EXECUTE on new public functions to anon/authenticated
-- DIRECTLY — `revoke from public` alone does NOT strip anon (CLAUDE.md §17.1
-- P8c/P8d lesson). Revoke anon explicitly on both functions.
revoke all on function public.unproceed_order(uuid) from public;
revoke all on function public.unproceed_order(uuid) from anon;
grant execute on function public.unproceed_order(uuid) to authenticated;

revoke all on function public.update_order(uuid, jsonb) from anon;

COMMIT;
