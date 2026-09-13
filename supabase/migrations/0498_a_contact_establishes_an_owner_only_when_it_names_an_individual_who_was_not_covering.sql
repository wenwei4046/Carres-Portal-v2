-- ============================================================================
-- 0498 — A contact establishes a collection owner only when it names an
--        INDIVIDUAL who was not covering (docs/payment/MASTER.md §10 · §14,
--        owner semantic check 2026-09-13)
--
-- 0495 derived the stable collection owner from the order's earliest customer
-- contact (0487 `ops_delivery_contacts.contact_owner_user_id`). The owner's
-- semantic check asked whether that identity is the RESPONSIBLE customer-
-- contact person. Verified from the contact writer
-- (`apps/api/src/routes/operation/delivery-arrangements.ts`, `recordContact`):
--
--   contact_owner_user_id = recorded_by = the signed-in JWT subject, always.
--   The proxy flow adds only `on_behalf_of_partner_id` — Operation standing
--   proxy for a PARTNER's reply; it never names a different Operation person.
--   Nothing resolves buddy cover: a cover who records the contact is written
--   as its owner. And `Operations` (operation@carres.com) is a shared role
--   login — no staff_code, no position, `operations_superuser` — which every
--   contact recorded so far names as owner.
--
-- So the two identities the ruling keeps separate are conflated in VALUE, and
-- an earliest contact must not silently become permanent ownership. This
-- migration keeps the contact-first derivation but admits a contact only when
--
--   · its owner is an INDIVIDUAL staff identity — a People record, i.e.
--     `app_users.staff_code is not null` (the CRnnn code; a role mailbox has
--     none) — and active Operation/principal staff, and
--   · that person was NOT the acting `delivery_duty` buddy cover on the day
--     of the contact (`workspace_duty_covers`), so a cover's contact never
--     establishes the cover as the permanent owner.
--
-- Any other contact does not establish anybody; the order falls to the
-- Delivery Duty NORMAL holder on the day (Delivery MASTER §13.1) — never the
-- cover — or stays unresolved (`Nobody holds Delivery Duty.`). The result
-- reports how many contacts did not qualify. No new owner field; no rotating
-- owner; the Payment UI is unchanged.
--
-- Measured before writing (production, 2026-09-13): 5 contact records, every
-- one owned by the shared `Operations` login; individuals with a staff_code:
-- Jess CR002, Shasha CR005, Yu Jun CR004, principal CR001; 0 owner rows.
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
  v_holder uuid; v_order uuid; v_contact_owner uuid; v_contact_when date; v_contact_with text;
  v_from_contact int := 0; v_from_duty int := 0; v_unresolved int := 0; v_kept int := 0; v_contact_skipped int := 0;
begin
  if not coalesce(public.app_role() in ('operation', 'principal'), false) then raise exception 'forbidden' using errcode = '42501', detail = 'not_operation'; end if;
  v_holder := nullif(public.workspace_resolve_duty('delivery_duty', v_on)->>'normal_user_id', '')::uuid;
  for v_order in select distinct o.id from public.orders o where o.id = any(coalesce(p_order_ids, '{}'::uuid[])) loop
    if exists (select 1 from public.payment_collection_owners c where c.order_id = v_order and c.effective_from <= v_on) then v_kept := v_kept + 1; continue; end if;
    -- 1 · the order's own customer-contact owner — an INDIVIDUAL staff identity (a People record: staff_code),
    --     never a shared role login, and never a person who was acting as delivery_duty buddy cover that day
    select c.contact_owner_user_id, c.contacted_at::date, c.contacted_person into v_contact_owner, v_contact_when, v_contact_with
      from public.ops_delivery_contacts c
      join public.app_users u on u.id = c.contact_owner_user_id
     where c.order_id = v_order
       and u.status = 'active' and u.role in ('operation', 'principal')
       and u.staff_code is not null
       and not exists (select 1 from public.workspace_duty_covers w where w.duty_key = 'delivery_duty' and w.acting_user_id = c.contact_owner_user_id and (timezone('Asia/Kuala_Lumpur', c.contacted_at))::date between w.starts_on and w.ends_on)
     order by (c.contacted_person = 'customer') desc, c.contacted_at asc limit 1;
    if v_contact_owner is not null then
      insert into public.payment_collection_owners (order_id, owner_user_id, previous_owner_user_id, source, reason, changed_by, changed_at, effective_from)
      values (v_order, v_contact_owner, null, 'established', 'Responsible Delivery Operation — the customer-contact owner recorded on this order (' || case when v_contact_with = 'customer' then 'contacted the customer on ' else 'arranged with the partner on ' end || to_char(v_contact_when, 'YYYY-MM-DD') || ')', null, now(), v_on);
      v_from_contact := v_from_contact + 1; continue;
    end if;
    if exists (select 1 from public.ops_delivery_contacts c where c.order_id = v_order) then v_contact_skipped := v_contact_skipped + 1; end if;
    if v_holder is null then v_unresolved := v_unresolved + 1; continue; end if;
    insert into public.payment_collection_owners (order_id, owner_user_id, previous_owner_user_id, source, reason, changed_by, changed_at, effective_from)
    values (v_order, v_holder, null, 'established', 'Responsible Delivery Operation — the Delivery Duty holder when collection first became actionable (no customer contact by an individual staff member recorded on this order yet)', null, now(), v_on);
    v_from_duty := v_from_duty + 1;
  end loop;
  return jsonb_build_object('on_date', v_on, 'holder_user_id', v_holder, 'established', v_from_contact + v_from_duty, 'established_from_contact', v_from_contact, 'established_from_duty', v_from_duty, 'contacts_not_qualifying', v_contact_skipped, 'kept', v_kept, 'unresolved', v_unresolved);
end; $fn$;

comment on function public.payment_collection_owner_establish(uuid[], date) is
  '0498: a customer contact establishes the stable collection owner only when its owner is an INDIVIDUAL staff identity (staff_code) who was not acting as delivery_duty buddy cover on the contact day; otherwise the Delivery Duty NORMAL holder on the day stands in, or nothing is established. Idempotent; an order that has an owner is never touched.';

revoke all on function public.payment_collection_owner_establish(uuid[], date) from public, anon;
grant execute on function public.payment_collection_owner_establish(uuid[], date) to authenticated;

do $$
begin
  if to_regprocedure('public.payment_collection_owner_establish(uuid[], date)') is null then
    raise exception '0498: the establish door is missing';
  end if;
end $$;

commit;
