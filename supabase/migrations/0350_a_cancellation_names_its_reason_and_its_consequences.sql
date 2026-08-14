-- =============================================================================
-- 0350 · A CANCELLATION NAMES ITS REASON AND ITS CONSEQUENCES
-- (SALES ORDER V2 — CANCEL / INTAKE / MAINTENANCE CLOSEOUT, the Cancel slice)
--
-- Card 7 (2026-08-11) already measured the cancellation LINEAGE as true:
-- `cancel_order` stamps actor + reason + server time, deletes nothing, and it
-- structurally refuses a proceeded order (only 'place' cancels) — which IS
-- §3.14's "cancel is not allowed by default", a fail-safe RULING and not a
-- gap. GATE 7 (0340) then freezes a cancelled order's contractual fields, and
-- `order_refunds` (0345) is the money direction cancellation can create.
--
-- What Card 7 did NOT install is the DOOR. The Sales Orders register's locked
-- row context menu ends in `Cancel SO` and the Workspace header carries the
-- governed edit/cancel actions, but neither could reach the act, and nothing
-- told the operator what cancelling this particular order would raise for the
-- other owners. This migration closes exactly that, and invents no rule:
--
--   1 · `sales_order_cancel_impact` — the READ management sees before it
--       decides. It is the Cancel-shaped sibling of `sales_order_amendment_
--       impact` (0348/0349) and reports the SAME seven owners in the same
--       shape, so one vocabulary covers amendment and cancellation. It
--       writes nothing, and it answers `cancellable` from the one existing
--       rule rather than a second opinion.
--
--   2 · `cancel_order` — REPLACED, same signature (no ghost overload; the
--       0153/0154 lesson). Two changes and nothing else:
--
--         a · THE REASON IS NOW REQUIRED. The MASTER's cancellation ruling
--             has always read "permission, reason, ... and immutable audit",
--             but the function accepted a blank reason and wrote the bare
--             words 'Order cancelled' — a cancelled customer transaction
--             that cannot say why is an audit row that answers nothing.
--             Every LIVE caller already passes a real sentence (both Stripe
--             pending-order paths in the POS and the raw-entry lane), so
--             this tightens the contract without changing any live
--             behaviour. The one door that permitted a blank reason,
--             `CancelOrderDialog`, is exported and rendered by NOTHING —
--             the D10 pattern — so it is deleted in this slice rather than
--             kept as an unreachable second form for one act (Law C).
--
--         b · THE AUDIT ROW NOW CARRIES THE CONSEQUENCES AND THE ACTOR.
--             The history metadata gains `by_user_id` and the impact
--             snapshot taken at cancel time, so the record says who
--             cancelled, why, and what stood open at that moment. A page can
--             be re-rendered; a written row cannot be un-written.
--
--       IT ALSO REPAIRS A MEASURED DRIFT, which is why the whole body is
--       restated. The repository's only definition of this function is 0011,
--       and 0011 still reads `v_order.dl` (the column was renamed to `so`)
--       and still admits the retired `logistics` role. Production has been
--       running a corrected body that no migration in this repository
--       contains. Restating the current, governed body here makes the
--       repository the source of truth again — a fresh database now builds
--       the function that production actually runs.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO:
--   · It does not relax the 'place'-only guard. The governed cancel of a
--     PROCEEDED order is Card 7's named, deferred approval lane on
--     `order_change_requests`, and it arrives when the business asks for it.
--   · It does not auto-create a refund. Releasing money is the principal's
--     decision through `refund_request` / `refund_decide` (0345). Cancelling
--     goods and refunding money are two acts; the impact read SHOWS the money
--     that is now exposed and never spends it.
--   · It does not touch purchase orders, units, deliveries or Work. Each has
--     its own owner and its own door; the impact read links to them and
--     writes none of them.
--   · It deletes nothing, anywhere.
-- =============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · what cancelling this order would raise, for every owner
-- ─────────────────────────────────────────────────────────────────────────────
-- The FACTS, with no role guard, because it has two callers with two different
-- audiences: the operation preview below, and `cancel_order` — which a DEALER
-- may legitimately reach for their own order through the POS. Putting the
-- internal-roles guard on the shared arithmetic would have made every dealer
-- cancellation raise 'Internal roles only', so the guard lives on the READ
-- wrapper where the audience actually differs. One arithmetic, two doors
-- (Law D). This function is not granted to `authenticated`; both callers are
-- SECURITY DEFINER and reach it as the definer.
create or replace function public.sales_order_cancel_impact_facts(p_order_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_o         orders%rowtype;
  v_goods     numeric := 0;
  v_po        int := 0;
  v_receiving int := 0;
  v_units     int := 0;
  v_delivery  int := 0;
  v_loans     int := 0;
  v_tasks     int := 0;
  v_refunds   int := 0;
  v_paid      numeric := 0;
  v_refusal   text := null;
begin
  select * into v_o from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  select coalesce(sum(qty * unit_price), 0) into v_goods
    from order_lines where order_id = p_order_id;
  v_paid := coalesce(v_o.paid, 0);

  -- The same seven owners the amendment preview reads, read the same way, so
  -- amendment and cancellation never grow two vocabularies for one map.
  select count(*) into v_po from purchase_orders where so = v_o.so;
  select count(*) into v_receiving from po_receipts r
    join purchase_orders p on p.id = r.po_id where p.so = v_o.so;
  select count(*) into v_units from ops_stock_items
    where reserved_ref = 'SO-' || v_o.so::text or sold_order_id = p_order_id;
  select count(*) into v_delivery from delivery_attempts where order_id = p_order_id;
  select count(*) into v_loans from ops_sofa_loans where order_id = p_order_id;
  select count(*) into v_tasks from ops_tasks
    where related_order_id = p_order_id and status in ('open','claimed');
  select count(*) into v_refunds from order_refunds
    where order_id = p_order_id and status in ('requested','approved');

  -- `cancellable` restates the ONE existing rule; it never forms a second
  -- opinion. The words are what the operator reads when the answer is no.
  if v_o.status = 'cancelled' then
    v_refusal := 'This order is already cancelled.';
  elsif v_o.status <> 'place' then
    v_refusal := 'Only an order still at Placed can be cancelled here.';
  end if;

  return jsonb_build_object(
    'order_id',    p_order_id,
    'so',          v_o.so,
    'status',      v_o.status,
    'cancellable', v_refusal is null,
    'refusal',     v_refusal,
    'goods_total', v_goods,
    'paid',        v_paid,
    'findings', jsonb_build_array(
      jsonb_build_object('owner','Purchasing','kind','purchase_order','count',v_po,'blocks',false,'href','/operation?tab=purchase'),
      jsonb_build_object('owner','Receiving','kind','receipt','count',v_receiving,'blocks',false,'href','/operation?tab=receiving'),
      jsonb_build_object('owner','Stock','kind','unit','count',v_units,'blocks',false,'href','/operation?tab=stock-onhand'),
      jsonb_build_object('owner','Delivery','kind','attempt','count',v_delivery,'blocks',false,'href','/operation?tab=delivery'),
      jsonb_build_object('owner','Money','kind','paid','amount',v_paid,'count',v_refunds,'blocks',false,'href','/operation?tab=payments'),
      jsonb_build_object('owner','Loan','kind','loan','count',v_loans,'blocks',false,'href','/operation?tab=loans'),
      jsonb_build_object('owner','Other Commitments','kind','work','count',v_tasks,'blocks',false,'href','/operation?tab=work')
    )
  );
end $$;

comment on function public.sales_order_cancel_impact_facts(uuid) is
  'SO V2 Cancel slice (0350) — the shared arithmetic behind the cancellation preview and the cancellation audit stamp: what this Sales Order still holds open for Purchasing, Receiving, Stock, Delivery, Money, Loan and Other Commitments, plus the truthful cancellable/refusal answer restated from cancel_order''s one existing rule. NO role guard, because cancel_order reaches it as a dealer too; the guard lives on the read wrapper. Not granted to authenticated. Writes nothing. SECURITY DEFINER.';

revoke all on function public.sales_order_cancel_impact_facts(uuid) from public, anon, authenticated;
grant execute on function public.sales_order_cancel_impact_facts(uuid) to service_role;

-- The READ, for the operation preview. Same facts, internal audience.
create or replace function public.sales_order_cancel_impact(p_order_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_role text := public.app_role();
begin
  if v_role not in ('operation','principal','finance','hr','bd') then
    raise exception 'Internal roles only' using errcode = '42501';
  end if;
  return public.sales_order_cancel_impact_facts(p_order_id);
end $$;

comment on function public.sales_order_cancel_impact(uuid) is
  'SO V2 Cancel slice (0350) — read-only preview of what cancelling this Sales Order raises for every owner. Internal roles only; the arithmetic is sales_order_cancel_impact_facts. Writes nothing. SECURITY DEFINER.';

revoke all on function public.sales_order_cancel_impact(uuid) from public, anon;
grant execute on function public.sales_order_cancel_impact(uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · the act — one door, a required reason, an audit row that says what stood
--     open. Same signature: no second overload survives.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.cancel_order(
  p_order_id uuid,
  p_reason   text
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
  v_reason_clean     text;
  v_impact           jsonb;
begin
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = '42P01';
  end if;

  if v_role not in ('principal','operation','finance','bd')
     and v_order.dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer cancel' using errcode = '42501';
  end if;

  -- UNCHANGED, and deliberately so: a proceeded order fails SAFE here. The
  -- governed proceeded-cancel is Card 7's deferred approval lane.
  if v_order.status <> 'place' then
    raise exception 'Only an order still at Placed can be cancelled'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  -- NEW · a cancelled customer transaction says why it was cancelled.
  v_reason_clean := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason_clean is null then
    raise exception 'A cancellation says why'
      using errcode = '22023', detail = 'reason_required';
  end if;

  -- Taken BEFORE the write, so the row records what actually stood open at
  -- the moment of the decision rather than what is left after it. The
  -- UNGUARDED facts function, because this door is legitimately reached by a
  -- dealer cancelling their own order.
  v_impact := public.sales_order_cancel_impact_facts(p_order_id);

  update orders
     set status = 'cancelled',
         updated_at = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role, by_user_id, metadata)
  values (
    p_order_id,
    'Order cancelled · ' || v_reason_clean,
    v_role,
    auth.uid(),
    jsonb_build_object(
      'kind',   'cancel',
      'reason', v_reason_clean,
      'impact', v_impact
    )
  );

  insert into audit_log (role, action, dealer_id, ref)
  values (v_role, 'order.cancelled', v_order.dealer_id, 'SO-' || v_order.so::text);

  return jsonb_build_object('id', p_order_id, 'so', v_order.so, 'status', 'cancelled');
end;
$$;

comment on function public.cancel_order(uuid, text) is
  'SO V2 Cancel slice (0350) — the ONE cancellation door for a customer transaction. Place-only (a proceeded order fails safe), reason REQUIRED, actor + server time + the pre-write impact snapshot stamped into order_history, audit_log row written, and nothing deleted. Restates the body production actually runs; the repository''s 0011 had drifted to the renamed dl column and the retired logistics role. SECURITY DEFINER.';

revoke all on function public.cancel_order(uuid, text) from public, anon;
grant execute on function public.cancel_order(uuid, text) to authenticated, service_role;

commit;
