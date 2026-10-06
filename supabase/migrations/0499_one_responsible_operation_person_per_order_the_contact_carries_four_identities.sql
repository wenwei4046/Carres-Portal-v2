-- ============================================================================
-- 0499 — One responsible Operation person per order; the customer contact
--        carries four identities (docs/delivery/MASTER.md §5.1 · §13.1,
--        docs/payment/MASTER.md §10, owner ruling 2026-09-13)
--
-- The user outcome is AUTOMATIC, STABLE customer-payment ownership: the
-- responsible Delivery Operation person for a customer/SO continues the money
-- follow-up. 0498 proved the contact writer conflated the responsible person
-- with the recorder, so a guard left every real order unassigned. This
-- migration fixes the seam at its source and gives Delivery and Payment ONE
-- authority to read (ERP-ARCHITECTURE Law D):
--
--   §1  `delivery_responsible_operation(order, day)` — the order's normal
--       responsible Operation person and today's acting person:
--         normal  = the order's collection-owner ledger row when one exists
--                   (an establishment or a formal handover — the same person
--                   by construction, or the handed-over one)
--                 · else the responsible person named on the order's earliest
--                   customer contact (an INDIVIDUAL — a People record with a
--                   staff_code — who was not acting as cover that day; older
--                   rows stored the recorder, so this guard stays)
--                 · else the configured NORMAL Delivery Duty holder on the day
--                   (Workspace → Staff & Duties), when that holder is an
--                   individual
--                 · else nobody (`not_assigned`)
--         acting  = that person's active `delivery_duty` buddy cover today,
--                   else the person — the shared cover law; cover never
--                   rewrites the normal person.
--   §2  `ops_delivery_contacts.acting_user_id` — the contact record now
--       carries FOUR identities, separately: `contact_owner_user_id` (the
--       normal responsible person, written from §1 — never the recorder as
--       such, never a shared login, never the cover) · `acting_user_id`
--       (today's acting person or buddy cover) · `recorded_by` (the actual
--       recorder, which may be a shared login) · `on_behalf_of_partner_id`
--       (partner provenance when a partner's reply is recorded).
--   §3  `payment_collection_owner_establish` reads §1 — the collection owner
--       IS the responsible Delivery Operation person, established once when
--       collection first becomes actionable and kept until RM 0.
--
-- Nothing is backfilled: the five existing contact rows (all recorded by the
-- shared `Operations` login) keep their values and, having no individual
-- owner, establish nobody. No new owner field; the Payment UI is unchanged.
--
-- Measured before writing (production, 2026-09-13): no authoritative source
-- names an initial Delivery Duty holder (org_position_duties: Jess's manager/
-- approver keys only; Workspace: GRN → Shasha, PO → Yu Jun, no delivery_duty;
-- every partner is customer_contact_by = partner). That initial holder is a
-- one-time staffing configuration, reported to the owner.
-- ============================================================================

begin;

set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 1 · the contact record's four identities
-- ---------------------------------------------------------------------------

alter table public.ops_delivery_contacts
  add column if not exists acting_user_id uuid references public.app_users(id);

comment on column public.ops_delivery_contacts.contact_owner_user_id is
  '0499: the NORMAL responsible Operation person for this order at the time of the contact — delivery_responsible_operation(). Never the recorder as such, never a shared login, never the cover.';
comment on column public.ops_delivery_contacts.acting_user_id is
  '0499: today''s acting person at the time of the contact — the active delivery_duty buddy cover of the normal person, else the normal person.';
comment on column public.ops_delivery_contacts.recorded_by is
  '0499: the actual signed-in recorder — may be a shared login or a cover; evidence, never responsibility.';
comment on column public.ops_delivery_contacts.on_behalf_of_partner_id is
  '0499: partner provenance — Operation recorded a partner''s reply on the partner''s behalf.';

-- ---------------------------------------------------------------------------
-- 2 · the ONE responsibility read
-- ---------------------------------------------------------------------------

create or replace function public.delivery_responsible_operation(
  p_order_id uuid,
  p_on date default null
) returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
declare
  v_on date := coalesce(p_on, (timezone('Asia/Kuala_Lumpur', now()))::date);
  v_normal uuid;
  v_source text := 'not_assigned';
  v_acting uuid;
  v_cover_ends date;
begin
  if not (coalesce(auth.role() = 'service_role', false) or coalesce((select public.is_internal()), false)) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_internal';
  end if;

  -- a · the order's own ledger — an establishment or a formal handover
  select c.owner_user_id, c.source into v_normal, v_source
    from public.payment_collection_owners c
   where c.order_id = p_order_id and c.effective_from <= v_on
   order by c.effective_from desc, c.changed_at desc
   limit 1;

  -- b · the responsible person named on the earliest customer contact (an individual, not covering that day)
  if v_normal is null then
    select c.contact_owner_user_id into v_normal
      from public.ops_delivery_contacts c
      join public.app_users u on u.id = c.contact_owner_user_id
     where c.order_id = p_order_id
       and u.status = 'active' and u.role in ('operation', 'principal') and u.staff_code is not null
       and not exists (
         select 1 from public.workspace_duty_covers w
          where w.duty_key = 'delivery_duty' and w.acting_user_id = c.contact_owner_user_id
            and (timezone('Asia/Kuala_Lumpur', c.contacted_at))::date between w.starts_on and w.ends_on)
     order by (c.contacted_person = 'customer') desc, c.contacted_at asc
     limit 1;
    if v_normal is not null then v_source := 'contact'; end if;
  end if;

  -- c · the configured NORMAL Delivery Duty holder on the day, when an individual
  if v_normal is null then
    select u.id into v_normal
      from public.app_users u
     where u.id = nullif(public.workspace_resolve_duty('delivery_duty', v_on)->>'normal_user_id', '')::uuid
       and u.status = 'active' and u.staff_code is not null;
    if v_normal is not null then v_source := 'delivery_duty'; end if;
  end if;

  if v_normal is null then
    return jsonb_build_object(
      'order_id', p_order_id, 'on_date', v_on, 'source', 'not_assigned',
      'normal_user_id', null, 'normal_user_name', null,
      'acting_user_id', null, 'acting_user_name', null, 'is_cover', false, 'cover_ends_on', null);
  end if;

  -- today's acting person — the shared buddy-cover law keyed by the normal person
  select w.acting_user_id, w.ends_on into v_acting, v_cover_ends
    from public.workspace_duty_covers w
   where w.duty_key = 'delivery_duty' and w.normal_user_id = v_normal
     and v_on between w.starts_on and w.ends_on
   order by w.created_at desc
   limit 1;

  return jsonb_build_object(
    'order_id', p_order_id, 'on_date', v_on, 'source', v_source,
    'normal_user_id', v_normal,
    'normal_user_name', (select name from public.app_users where id = v_normal),
    'acting_user_id', coalesce(v_acting, v_normal),
    'acting_user_name', (select name from public.app_users where id = coalesce(v_acting, v_normal)),
    'is_cover', v_acting is not null,
    'cover_ends_on', v_cover_ends);
end;
$fn$;

comment on function public.delivery_responsible_operation(uuid, date) is
  '0499: the ONE read of an order''s responsible Operation person — the collection-owner ledger (establishment or formal handover), else the individual named on the earliest customer contact, else the configured NORMAL Delivery Duty holder — plus today''s acting person under the shared buddy-cover law. Delivery''s contact writer and Payment''s establish both read it.';

-- ---------------------------------------------------------------------------
-- 3 · Payment establishes the collection owner from that read
-- ---------------------------------------------------------------------------

create or replace function public.payment_collection_owner_establish(
  p_order_ids uuid[],
  p_on date default null
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_on date := coalesce(p_on, (timezone('Asia/Kuala_Lumpur', now()))::date);
  v_order uuid; v_r jsonb; v_normal uuid;
  v_from_contact int := 0; v_from_duty int := 0; v_unresolved int := 0; v_kept int := 0;
begin
  if not coalesce(public.app_role() in ('operation', 'principal'), false) then raise exception 'forbidden' using errcode = '42501', detail = 'not_operation'; end if;
  for v_order in select distinct o.id from public.orders o where o.id = any(coalesce(p_order_ids, '{}'::uuid[])) loop
    if exists (select 1 from public.payment_collection_owners c where c.order_id = v_order and c.effective_from <= v_on) then v_kept := v_kept + 1; continue; end if;
    v_r := public.delivery_responsible_operation(v_order, v_on);
    v_normal := nullif(v_r->>'normal_user_id', '')::uuid;
    if v_normal is null then v_unresolved := v_unresolved + 1; continue; end if;
    insert into public.payment_collection_owners (order_id, owner_user_id, previous_owner_user_id, source, reason, changed_by, changed_at, effective_from)
    values (v_order, v_normal, null, 'established',
      case v_r->>'source'
        when 'contact' then 'Responsible Delivery Operation — the responsible person on this order''s customer contact'
        else 'Responsible Delivery Operation — the configured normal Delivery Duty holder when collection first became actionable'
      end, null, now(), v_on);
    if v_r->>'source' = 'contact' then v_from_contact := v_from_contact + 1; else v_from_duty := v_from_duty + 1; end if;
  end loop;
  return jsonb_build_object('on_date', v_on, 'established', v_from_contact + v_from_duty, 'established_from_contact', v_from_contact, 'established_from_duty', v_from_duty, 'kept', v_kept, 'unresolved', v_unresolved);
end; $fn$;

comment on function public.payment_collection_owner_establish(uuid[], date) is
  '0499: the collection owner IS the responsible Delivery Operation person (delivery_responsible_operation), established once when collection first becomes actionable and kept until the balance is RM 0. Idempotent; no responsible person → nothing established (`Nobody holds Delivery Duty.`).';

-- ---------------------------------------------------------------------------
-- 4 · grants and sanity
-- ---------------------------------------------------------------------------

revoke all on function public.delivery_responsible_operation(uuid, date) from public, anon;
grant execute on function public.delivery_responsible_operation(uuid, date) to authenticated, service_role;
revoke all on function public.payment_collection_owner_establish(uuid[], date) from public, anon;
grant execute on function public.payment_collection_owner_establish(uuid[], date) to authenticated;

do $$
begin
  if to_regprocedure('public.delivery_responsible_operation(uuid, date)') is null
     or to_regprocedure('public.payment_collection_owner_establish(uuid[], date)') is null then
    raise exception '0499: a door is missing';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ops_delivery_contacts' and column_name = 'acting_user_id') then
    raise exception '0499: acting_user_id is missing';
  end if;
end $$;

commit;
