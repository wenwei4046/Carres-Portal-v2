-- ============================================================================
-- 0495 — The collection owner is the order's OWN customer-contact owner
--        (docs/payment/MASTER.md §10, owner ruling 2026-09-13 — the ownership
--        seam correction; docs/delivery/MASTER.md §5.1 · §13.1)
--
-- The approved rule: THE RESPONSIBLE DELIVERY OPERATION FOR THIS CUSTOMER/SO
-- CONTINUES THE PAYMENT FOLLOW-UP. 0489 established the collection owner from
-- the Delivery Duty holder on the first actionable day — the person on duty,
-- not necessarily the person who has been handling this customer. Delivery's
-- authoritative model already records who that is: every customer contact
-- (0487 `ops_delivery_contacts`, Delivery MASTER §5.1) names its CONTACT
-- OWNER — the Operation person who talked to the customer (or arranged with
-- the partner) for this order.
--
-- So `payment_collection_owner_establish` now resolves, per order, in order:
--
--   1 · the order's established customer-contact responsibility — the contact
--       owner of the EARLIEST contact record on the order whose owner is still
--       active Operation staff, a contact with the CUSTOMER first, else any
--       contact for the order (the person arranging with the partner)
--   2 · else — nobody has contacted this customer yet — the Delivery Duty
--       NORMAL holder on the day (Delivery MASTER §13.1: routine customer
--       contact resolves through Delivery Duty), the same fallback 0489 used
--   3 · else nothing is established and the surface prints
--       `Nobody holds Delivery Duty.`
--
-- Everything else stands: append-only ledger, idempotent (an order with an
-- owner is never touched — no rotation on a later day, holder, date change or
-- reload), the shared buddy-cover law, the formal handover door. No new owner
-- field: the basis is written into the row's `reason`.
--
-- Measured before writing (production, 2026-09-13): 4 contact records on 4
-- orders (all contact owner `Operations`, today); the two unpaid orders have
-- none; 0 collection-owner rows; `delivery_duty` has no holder.
-- ============================================================================

begin;

set search_path = public, pg_temp;

create or replace function public.payment_collection_owner_establish(
  p_order_ids uuid[],
  p_on date default null
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_on date := coalesce(p_on, (timezone('Asia/Kuala_Lumpur', now()))::date);
  v_holder uuid;
  v_order uuid;
  v_contact_owner uuid;
  v_contact_when date;
  v_contact_with text;
  v_from_contact int := 0;
  v_from_duty int := 0;
  v_unresolved int := 0;
  v_kept int := 0;
begin
  if not coalesce(public.app_role() in ('operation', 'principal'), false) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_operation';
  end if;

  v_holder := nullif(public.workspace_resolve_duty('delivery_duty', v_on)->>'normal_user_id', '')::uuid;

  for v_order in
    select distinct o.id
      from public.orders o
     where o.id = any(coalesce(p_order_ids, '{}'::uuid[]))
  loop
    if exists (
      select 1 from public.payment_collection_owners c
       where c.order_id = v_order and c.effective_from <= v_on
    ) then
      v_kept := v_kept + 1;
      continue;
    end if;

    -- 1 · the order's own established customer-contact responsibility
    select c.contact_owner_user_id, c.contacted_at::date, c.contacted_person
      into v_contact_owner, v_contact_when, v_contact_with
      from public.ops_delivery_contacts c
      join public.app_users u on u.id = c.contact_owner_user_id
     where c.order_id = v_order
       and u.status = 'active'
       and u.role in ('operation', 'principal')
     order by (c.contacted_person = 'customer') desc, c.contacted_at asc
     limit 1;

    if v_contact_owner is not null then
      insert into public.payment_collection_owners
        (order_id, owner_user_id, previous_owner_user_id, source, reason, changed_by, changed_at, effective_from)
      values
        (v_order, v_contact_owner, null, 'established',
         'Responsible Delivery Operation — the customer-contact owner recorded on this order ('
           || case when v_contact_with = 'customer' then 'contacted the customer on ' else 'arranged with the partner on ' end
           || to_char(v_contact_when, 'YYYY-MM-DD') || ')',
         null, now(), v_on);
      v_from_contact := v_from_contact + 1;
      continue;
    end if;

    -- 2 · nobody has contacted this customer yet — the Delivery Duty holder today
    if v_holder is null then
      v_unresolved := v_unresolved + 1;
      continue;
    end if;
    insert into public.payment_collection_owners
      (order_id, owner_user_id, previous_owner_user_id, source, reason, changed_by, changed_at, effective_from)
    values
      (v_order, v_holder, null, 'established',
       'Responsible Delivery Operation — the Delivery Duty holder when collection first became actionable (no customer contact recorded on this order yet)',
       null, now(), v_on);
    v_from_duty := v_from_duty + 1;
  end loop;

  return jsonb_build_object(
    'on_date', v_on,
    'holder_user_id', v_holder,
    'established', v_from_contact + v_from_duty,
    'established_from_contact', v_from_contact,
    'established_from_duty', v_from_duty,
    'kept', v_kept,
    'unresolved', v_unresolved);
end;
$fn$;

comment on function public.payment_collection_owner_establish(uuid[], date) is
  '0495: when collection first becomes actionable, the order''s own customer-contact owner (0487 ops_delivery_contacts — the Operation person who talked to this customer, else arranged with the partner) becomes the stable collection owner; only when nobody has contacted this customer yet does the Delivery Duty NORMAL holder on that day stand in (Delivery MASTER §13.1). Idempotent — an order that has an owner is never touched. No holder and no contact → nothing established (`Nobody holds Delivery Duty.`).';

revoke all on function public.payment_collection_owner_establish(uuid[], date) from public, anon;
grant execute on function public.payment_collection_owner_establish(uuid[], date) to authenticated;

do $$
begin
  if to_regprocedure('public.payment_collection_owner_establish(uuid[], date)') is null then
    raise exception '0495: the establish door is missing';
  end if;
end $$;

commit;
