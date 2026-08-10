-- 0330 · THE APPROVER CAN SEE WHAT THEY ARE APPROVING
-- (STAGE 3 · card 3.3, completing GATE 3's approver lane)
--
-- 0329 gave HR the RIGHT to approve a salesperson / showroom move
-- (`sales_order_decide_attribution`, GATE 3 frozen: "Salesperson / Showroom →
-- hr OR principal"). It did not give HR the ability to READ the request.
--
--   auth-guards.ts:80-85  "HR is deliberately NOT in is_internal(): it reaches
--                          order data only through those explicitly-gated RPCs."
--   order_change_requests_select_scoped   USING (is_internal() OR own dealer)
--
-- So the HR half of GATE 3 was unreachable: an approver who cannot see the
-- request cannot approve it, and the lane would have been UI theatre — the
-- exact failure GATE 3 exists to prevent, one layer up.
--
-- The fix is a READ, and it is a definer function for the same reason the
-- verbs are: the gate is server-side. It returns the ONE live request on an
-- order (pending or approved-not-yet-applied) with the party NAMES resolved,
-- because an approver deciding "Chai → Shasha" must not be shown two UUIDs.
--
-- WRITES NOTHING. Reads one request, one order, three name tables.

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
  if v_role not in ('operation','hr','principal') then
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
   order by created_at desc
   limit 1;

  if not found then
    return jsonb_build_object('request', null);
  end if;

  v_ch := v_req.payload->'changes';

  -- FROM → TO, in names. The order's CURRENT value is the `from`, read now:
  -- a request that has waited while something else moved must show what the
  -- approver is actually deciding, not what was true at SUBMIT.
  v_out := jsonb_build_object(
    'id', v_req.id,
    'status', v_req.status,
    'reason', v_req.payload->>'reason',
    'created_at', v_req.created_at,
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
end $$;

revoke all on function public.sales_order_attribution_live(uuid) from public;
grant execute on function public.sales_order_attribution_live(uuid) to authenticated;
