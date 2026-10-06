-- 0395_a_misclicked_service_can_be_taken_back.sql
--
-- A MISCLICKED SERVICE CAN BE TAKEN BACK — owner ruling (YH, 2026-08-28).
--
-- This NARROWS the ruling recorded the same day that a service is never
-- removed, only increased. That rule was written to stop a DOWNSELL: an order
-- quietly losing value after the customer agreed to it. It is kept, and it is
-- still what `edit_order_addon` enforces.
--
-- What it did not anticipate is the opposite error. An operator picks the wrong
-- service by accident and the customer is billed for something nobody agreed
-- to — and there was NO WAY BACK. Not the office, not the POS, not the
-- amendment lane (add-ons are not in `amendmentSubmitInput`'s Class A list).
-- `edit_order_addon` refuses any qty below 1 (`invalid_qty`) and refuses any
-- decrease (`downsell_blocked`), so "remove" could not even be expressed. The
-- only correction was cancelling the whole order.
--
-- A downsell and a misclick are not the same act. Protecting against the first
-- should not make the second permanent.
--
-- ⭐ THE GATE IS THE EDIT DOOR'S GATE, RE-STATED — never a second policy.
-- Same role check, same cross-dealer check, same `place` lane, same refusal to
-- touch a system-computed fee. If `edit_order_addon` would refuse to change the
-- row, this refuses to remove it, for the same reason and with the same words.
-- Once Operations has picked the order up, a change is still HQ's change.
--
-- NO REASON IS DEMANDED. Every other destructive act here asks for one, and
-- this deliberately does not: the act being corrected is a slip, and making
-- somebody type "misclick" to undo a misclick is friction on the exact case the
-- ruling exists to serve. The record is kept anyway — the full before-image
-- goes to `order_history` with the actor and the amount, so nothing is silent.
-- If the owner later wants a stated reason, it is one parameter.
--
-- Schema only; no rows are read, rewritten, backfilled or deleted by the
-- migration itself.

begin;

create function public.remove_order_addon(
  p_order_id uuid,
  p_addon_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role  text := public.app_role();
  v_order record;
  v_row   record;
begin
  if v_role is null then
    raise exception 'forbidden: no app role' using errcode = '42501';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = '42P01';
  end if;

  /* Cross-dealer protection, identical to the edit door's. */
  if v_role = 'dealer' and v_order.dealer_id <> public.app_dealer_id() then
    raise exception 'forbidden: cross-dealer edit' using errcode = '42501';
  end if;

  /* The place lane, word for word from 0258. An order Operations has started
     working is past the point where a slip can be quietly undone. */
  if v_order.status <> 'place'
     or v_order.operation_stage is not null
     or v_order.source_system = 'autocount' then
    raise exception 'Add-ons can only be edited while the order is in Order placed'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  select * into v_row from order_addons
   where id = p_addon_id and order_id = p_order_id
   for update;
  if not found then
    raise exception 'add-on not found on this order'
      using errcode = '22023', detail = 'addon_not_found';
  end if;

  /* The four SERVER-EXCLUSIVE keys are computed per order, not chosen — the
     delivery trio (0184) and the stair carry (0393). A human never picked them,
     so a human never misclicked them, and removing one by hand would put the
     order's money out of step with the inputs that produce it. */
  if v_row.addon_key in ('DELIVERY','DELIVERY_CROSS','DELIVERY_ADD','STAIR_CARRY') then
    raise exception 'delivery fees are computed by the system and cannot be edited'
      using errcode = '22023', detail = 'addon_not_editable';
  end if;

  delete from order_addons where id = p_addon_id;

  update orders
     set items_edited = case when source_system = 'autocount' then true else items_edited end,
         updated_at = now()
   where id = p_order_id;

  /* THE FULL BEFORE-IMAGE, so a removal is as legible afterwards as an edit —
     0258's guardrail #4, kept. */
  insert into order_history (order_id, text, by_role, metadata)
  values (
    p_order_id,
    format('Add-on removed · %s ×%s', v_row.addon_key, v_row.qty),
    v_role,
    jsonb_build_object(
      'kind', 'remove_addon',
      'addon_id', p_addon_id,
      'addon_key', v_row.addon_key,
      'old', jsonb_build_object(
        'qty', v_row.qty,
        'unit_price', v_row.unit_price,
        'attrs', v_row.attrs
      ),
      'total_delta', -(v_row.unit_price * v_row.qty)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'addon_key', v_row.addon_key,
    'total_delta', -(v_row.unit_price * v_row.qty)
  );
end;
$$;

revoke all on function public.remove_order_addon(uuid, uuid) from public;
grant execute on function public.remove_order_addon(uuid, uuid) to authenticated;

comment on function public.remove_order_addon(uuid, uuid) is
  '0395: takes back a service added by mistake, on the same lane and gates as edit_order_addon. The up-sell rule in edit_order_addon is unchanged — this is the misclick door, not a downsell door.';

commit;

-- ===========================================================================
-- VERIFICATION — run against a scratch order, never production.
--
-- 1 · REMOVES a hand-picked service and records the before-image
--     select public.remove_order_addon('<order>', '<addon_id>');
--     -- expect {ok:true, total_delta:-<price*qty>}
--     select text, metadata from order_history where order_id = '<order>'
--      order by occurred_at desc limit 1;
--     -- expect 'Add-on removed · DISPOSE-MATTRESS ×1' and kind=remove_addon
--
-- 2 · REFUSES a system-computed fee
--     -- pass the STAIR_CARRY row's id
--     -- expect ERROR 22023 detail addon_not_editable
--
-- 3 · REFUSES once Operations has the order
--     update orders set operation_stage = 'confirmed' where id = '<order>';
--     -- expect ERROR 22023 detail wrong_status
--
-- 4 · NEGATIVE CONTROL — the up-sell law is untouched
--     select public.edit_order_addon('<order>','<addon_id>', 1, null, 'direct', null);
--     -- on a row at qty 2, expect ERROR 22023 detail downsell_blocked
-- ===========================================================================
