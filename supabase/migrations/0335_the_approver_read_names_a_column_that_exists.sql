-- 0335 · THE APPROVER READ NAMES A COLUMN THAT EXISTS
--
-- 0330's `sales_order_attribution_live` ordered and reported on
-- `order_change_requests.created_at`. THAT COLUMN DOES NOT EXIST. The table
-- (0231/0233) stamps `requested_at`:
--
--   id · order_id · kind · payload · status · requested_by · requested_at ·
--   decided_by · decided_at · decision_note · applied_at
--
-- Every call raised `42703: column "created_at" does not exist`, so
-- GET /api/operation/orders/:id/attribution answered 500 on every real order.
--
-- ── WHY THE TESTS WERE GREEN ──
--
-- `attribution-lane.test.ts` mocks the supabase client's `rpc`, so it proved
-- what the DOOR does — which function it calls, with which arguments, which
-- roles it admits — and could not have executed a line of the function body.
-- 3.3's live evidence exercised SUBMIT, APPROVE and APPLY against production
-- and never called the READ, so nothing ran it end to end. A plpgsql body is
-- only parsed at creation; unknown columns surface at RUN time.
--
-- The rule that follows is recorded in BUILD-QUEUE's evidence section: a card
-- that adds a definer function owes ONE live call per function, not per verb.
--
-- Only the two column references change; the shape of the answer is 0330's.

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
end $$;
