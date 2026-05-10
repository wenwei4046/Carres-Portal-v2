-- =============================================================================
-- 0082_partner_arrived_at_warehouse_rpc.sql (Loo 2026-05-10)
-- =============================================================================
-- Third partner-side state-progression RPC, completing the proto's pickup
-- pipeline (reference/proto/partner-pickups.jsx):
--
--   Awaiting accept  →  Scheduled       (partner_accept_pickup)         [0080]
--   Scheduled        →  In transit      (partner_mark_picked_up)        [0080]
--   In transit       →  Delivered to WH (partner_arrived_at_warehouse)  [THIS]
--
-- After "Arrived at WH", `sup_status='delivered'` but `status` stays 'open'
-- — the goods are physically at the warehouse but logistics still needs to
-- formally count + upload the supplier DO via the existing
-- logistics_receive_po_with_do flow (migration 0076). That's what flips
-- status='received' for the final close.
--
-- Source state : picked_up
-- Target state : delivered (sup_status), status unchanged
-- Side effect  : po_history + audit_log entries
-- =============================================================================


create or replace function public.partner_arrived_at_warehouse(p_po_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role        app_role;
  v_partner_id  uuid;
  v_actor       text;
  v_po          purchase_orders;
begin
  v_role := public.app_role();
  v_partner_id := public.app_partner_id();

  if v_role <> 'partner' then
    raise exception 'forbidden: partner only'
      using errcode = '42501', detail = 'forbidden';
  end if;
  if v_partner_id is null then
    raise exception 'no partner_id on JWT'
      using errcode = '42501', detail = 'no_partner_id';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO not found' using errcode = '42P01', detail = 'po_not_found';
  end if;

  if v_po.procurement_partner_id is distinct from v_partner_id then
    raise exception 'forbidden: cross-partner arrived'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if v_po.sup_status <> 'picked_up' then
    raise exception 'PO is not in transit (got %)', v_po.sup_status
      using errcode = '22023', detail = 'wrong_sup_status';
  end if;

  v_actor := coalesce((select name from app_users where id = (select auth.uid())), 'Partner');

  update purchase_orders
     set sup_status = 'delivered',
         updated_at = now()
   where id = p_po_id;

  insert into po_history (po_id, text, by_role)
  values (p_po_id, 'Partner arrived at warehouse · awaiting receive', 'partner');

  insert into audit_log (role, actor_text, action, ref)
  values ('partner', v_actor, format('Arrived at WH · PO %s · awaiting receive', p_po_id), p_po_id);

  return jsonb_build_object('po_id', p_po_id, 'sup_status', 'delivered');
end;
$$;

revoke all on function public.partner_arrived_at_warehouse(text) from public;
revoke all on function public.partner_arrived_at_warehouse(text) from anon;
grant execute on function public.partner_arrived_at_warehouse(text) to authenticated;
