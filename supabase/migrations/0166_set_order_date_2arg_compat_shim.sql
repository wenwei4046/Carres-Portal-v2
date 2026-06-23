-- =============================================================================
-- 0166_set_order_date_2arg_compat_shim.sql — Phase 11.1 zero-downtime shim
-- 2026-06-14.
--
-- 0165 replaced set_order_date(uuid, date) with a 3-arg version (date +
-- proceed_date) and DROPPED the 2-arg overload. But the CURRENTLY-DEPLOYED API
-- still calls the 2-arg form, so prod's "confirm delivery date" flow 404s until
-- the new API ships. This re-adds the 2-arg overload with the ORIGINAL legacy
-- behaviour (sets delivery date only, leaves proceed_date untouched) so the old
-- API keeps working during the deploy gap.
--
-- No ambiguity: PostgREST matches RPCs by the exact set of named params, so the
-- old API ({p_order_id, p_date}) hits this 2-arg shim while the new API
-- ({p_order_id, p_date, p_proceed_date}) hits the 0165 3-arg version.
--
-- TODO (drop after the Phase 11.1 api+web deploy lands): DROP this 2-arg shim so
-- proceed date is always required at date-confirm time.
-- =============================================================================

create or replace function public.set_order_date(p_order_id uuid, p_date date)
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

  if v_role not in ('principal','operation','finance','bd')
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

  update orders
     set delivery_date = p_date,
         delivery_date_tbd = false,
         updated_at = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role)
  values (p_order_id, format('Delivery date confirmed: %s', to_char(p_date, 'YYYY-MM-DD')), v_role);

  return jsonb_build_object('id', p_order_id, 'date', p_date);
end;
$function$;
