-- =============================================================================
-- 0080_partner_pickup_state_rpcs.sql (Loo 2026-05-10)
-- =============================================================================
-- Partner-side procurement-leg state machine. Migration 0079 pre-assigns the
-- LP at PO creation time so they see the PO from sup_status='pending'
-- onward, but until now there were no partner-callable RPCs to actually
-- progress the pickup once the supplier presses Mark Ready. The LP could
-- only watch the PO sit there.
--
-- This migration adds two RPCs the partner can call to move the procurement
-- leg forward:
--
--   partner_accept_pickup(p_po_id text)
--     "I see the PO is ready, I'll come pick it up."
--     Source states: ready_confirm_sent | ready_for_pickup | pickup_assigned
--     Target state : pickup_accepted
--     Side effect  : partner_confirmed_at = now()
--
--   partner_mark_picked_up(p_po_id text)
--     "I have the goods on the truck, en route to warehouse."
--     Source state : pickup_accepted
--     Target state : picked_up
--     Side effect  : pickup_date = now()
--
-- Cross-partner guard inside both: caller must own the PO via
-- procurement_partner_id = app_partner_id(). The role gate is partner only;
-- logistics has its own assign-pickup-partner path that doesn't go through
-- here.
--
-- After picked_up, the next step is the logistics-side receive flow
-- (logistics_receive_po_with_do, migration 0076) — partner unloads goods
-- at warehouse and logistics confirms receipt + uploads supplier DO. That
-- transition is unchanged; we don't add another partner-callable step here.
-- =============================================================================


create or replace function public.partner_accept_pickup(p_po_id text)
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
    raise exception 'forbidden: cross-partner accept'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if v_po.sup_status not in ('ready_confirm_sent', 'ready_for_pickup', 'pickup_assigned') then
    raise exception 'PO is not in a state to accept pickup (got %)', v_po.sup_status
      using errcode = '22023', detail = 'wrong_sup_status';
  end if;

  v_actor := coalesce((select name from app_users where id = (select auth.uid())), 'Partner');

  update purchase_orders
     set sup_status          = 'pickup_accepted',
         partner_confirmed_at = now(),
         updated_at           = now()
   where id = p_po_id;

  insert into po_history (po_id, text, by_role)
  values (p_po_id, 'Partner accepted pickup', 'partner');

  insert into audit_log (role, actor_text, action, ref)
  values ('partner', v_actor, format('Accepted pickup for PO %s', p_po_id), p_po_id);

  return jsonb_build_object(
    'po_id',                p_po_id,
    'sup_status',           'pickup_accepted',
    'partner_confirmed_at', now()
  );
end;
$$;

revoke all on function public.partner_accept_pickup(text) from public;
revoke all on function public.partner_accept_pickup(text) from anon;
grant execute on function public.partner_accept_pickup(text) to authenticated;


create or replace function public.partner_mark_picked_up(p_po_id text)
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
    raise exception 'forbidden: cross-partner mark picked-up'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if v_po.sup_status <> 'pickup_accepted' then
    raise exception 'PO is not in a state to mark picked up (got %)', v_po.sup_status
      using errcode = '22023', detail = 'wrong_sup_status';
  end if;

  v_actor := coalesce((select name from app_users where id = (select auth.uid())), 'Partner');

  update purchase_orders
     set sup_status   = 'picked_up',
         pickup_date  = now()::date,
         updated_at   = now()
   where id = p_po_id;

  insert into po_history (po_id, text, by_role)
  values (p_po_id, 'Partner picked up · in transit to warehouse', 'partner');

  insert into audit_log (role, actor_text, action, ref)
  values ('partner', v_actor, format('Picked up PO %s · in transit', p_po_id), p_po_id);

  return jsonb_build_object('po_id', p_po_id, 'sup_status', 'picked_up');
end;
$$;

revoke all on function public.partner_mark_picked_up(text) from public;
revoke all on function public.partner_mark_picked_up(text) from anon;
grant execute on function public.partner_mark_picked_up(text) to authenticated;
