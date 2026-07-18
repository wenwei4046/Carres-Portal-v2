-- 0234 — Add-product P3.1 (Loo live-test feedback 2026-07-18): EDIT a pending
-- change request ("View request" → Edit in the POS drawer replaces the payload
-- in place — no cancel+resubmit race against the one-pending unique). The ops
-- list badge needs no migration (the 0231 internal SELECT policy already
-- covers the pending list read). RPC-only writes hold — still zero RLS write
-- policies on order_change_requests.

CREATE FUNCTION public.update_order_change_request(
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
     or jsonb_typeof(p_payload->'lines') is distinct from 'array'
     or jsonb_array_length(p_payload->'lines') < 1
     or jsonb_array_length(p_payload->'lines') > 10
     or pg_column_size(p_payload) > 16384 then
    raise exception 'payload must be an object with 1..10 lines (<=16KB)'
      using errcode = '22023', detail = 'invalid_payload';
  end if;

  update order_change_requests
     set payload = p_payload,
         requested_by = auth.uid(),
         requested_at = now()
   where id = p_request_id;

  insert into order_history (order_id, text, by_role, metadata)
  values (
    v_req.order_id,
    format('Product change edited · %s line(s) · awaiting HQ approval',
           jsonb_array_length(p_payload->'lines')),
    v_role,
    jsonb_build_object('kind', 'change_request_edited', 'change_request_id', p_request_id)
  );

  return jsonb_build_object('id', p_request_id);
end;
$function$;

REVOKE ALL ON FUNCTION public.update_order_change_request(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_order_change_request(uuid, jsonb) TO authenticated, service_role;
