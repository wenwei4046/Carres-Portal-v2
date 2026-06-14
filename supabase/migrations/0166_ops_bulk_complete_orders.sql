-- 0166_ops_bulk_complete_orders.sql
--
-- Jess 2026-06-12: 105 of the 155 AutoCount-imported orders show "Overdue" —
-- their listing "New- Delivery Date" is in the past because most were already
-- delivered in real life before the portal existed; nobody marked them. This
-- RPC backs a bulk "Mark completed" action in the Orders ⋮ menu so operation
-- can clear that legacy backlog in one sweep.
--
-- Deliberately scoped to source_system='autocount' orders ONLY: those never
-- went through the portal pipeline (no threads, no reservations, no DO), so a
-- plain status flip has no inventory side-effects. Native orders must keep
-- using the real flow (operation_attach_do_and_deliver — stock movements,
-- e-sign POD, invoice gates).
--
-- SECURITY DEFINER + explicit role gate (operation/principal), per the
-- 0162/0164 ops-RPC pattern. Bypasses orders RLS for the UPDATE; the gate is
-- inside the body.

create or replace function public.ops_bulk_complete_orders(p_order_ids uuid[])
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_role text := (select auth.jwt()->'app_metadata'->>'role');
  v_uid uuid := auth.uid();
  v_ids uuid[];
  v_done int;
begin
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'Operation or principal only';
  end if;
  if p_order_ids is null or array_length(p_order_ids, 1) is null then
    return jsonb_build_object('completed', 0, 'skipped', 0);
  end if;

  with upd as (
    update orders o
       set status = 'delivered',
           operation_stage = 'delivered',
           delivered_at = coalesce(o.delivered_at, now())
     where o.id = any(p_order_ids)
       and o.source_system = 'autocount'
       and o.status not in ('delivered', 'cancelled')
     returning o.id
  )
  select array_agg(id), count(*) into v_ids, v_done from upd;

  insert into order_history (order_id, text, by_role, by_user_id)
  select id, 'Marked completed — bulk AutoCount legacy cleanup', 'operation', v_uid
    from unnest(coalesce(v_ids, '{}'::uuid[])) as t(id);

  return jsonb_build_object(
    'completed', coalesce(v_done, 0),
    'skipped', array_length(p_order_ids, 1) - coalesce(v_done, 0)
  );
end;
$function$;
