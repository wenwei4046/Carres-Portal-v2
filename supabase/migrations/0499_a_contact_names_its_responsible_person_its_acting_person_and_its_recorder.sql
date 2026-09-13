-- ============================================================================
-- 0499 — A customer contact names its RESPONSIBLE person, the person ACTING,
--        and its RECORDER — and Payment reads that responsibility
--        (docs/delivery/MASTER.md §5.1 · §13.1, docs/payment/MASTER.md §10 · §14,
--        docs/workspace/MASTER.md §4; owner instruction 2026-09-13)
--
-- 0487 wrote every contact with `contact_owner_user_id = recorded_by = the
-- signed-in subject`. 0495 derived the stable collection owner from that
-- owner; 0498 guarded it (an individual, not covering) — and because every
-- contact so far was recorded by the shared `Operations` login, the guard
-- left every real order unassigned. The two identities the ruling keeps
-- separate must be separate in VALUE at the moment the record is written.
--
-- This migration gives the contact record four facts, each its own column:
--
--   contact_owner_user_id   the NORMAL responsible Operation person for this
--                           customer/SO — an INDIVIDUAL staff identity, never
--                           a shared role login
--   acting_user_id          who acts TODAY — the normal person, or the
--                           delivery_duty buddy cover on the normal person
--   recorded_by             who actually wrote the record (any signed-in
--                           account, the shared login included)
--   on_behalf_of_partner_id partner provenance when Operation records a
--                           partner's reply (0487, unchanged)
--
-- and ONE arithmetic for responsibility (Law D), shared by the contact writer
-- and the collection-owner door:
--
--   delivery_order_responsible_individual(order, on)
--     1 · the order's CURRENT collection owner (payment_collection_owners)
--     2 · else the order's established contact responsibility — the earliest
--         contact whose responsible person is an active individual who was
--         not the delivery_duty cover on the contact day (customer first)
--     3 · else nothing
--
--   delivery_contact_responsibility(order, recorder, on)
--     normal := responsible individual (1 · 2)
--               else the delivery_duty NORMAL holder on the day (Workspace §4)
--               else the recorder, only when the recorder is an active
--                    individual who is not the delivery_duty cover that day
--               else null — the record is still written; evidence is never
--                    refused for want of an owner
--     acting := the delivery_duty cover on the normal person today, else normal
--
-- A BEFORE INSERT trigger applies the arithmetic to every contact, whoever
-- writes it: a supplied owner is only ever a recorder candidate, so a shared
-- login can record evidence but can never become the normal owner, and a
-- cover who records a contact never becomes its owner. The basis is kept on
-- the row (`owner_basis`).
--
-- `payment_collection_owner_establish` now reads the same arithmetic: the
-- order's responsible individual first, then the Delivery Duty NORMAL holder
-- on the day, else unresolved. Nothing else moves: append-only ledger,
-- idempotent establish, the shared cover law, the formal handover door.
--
-- Historical contact rows are not rewritten (they are records; the five on
-- production name the shared login and stay as evidence). They establish
-- nobody, exactly as under 0498.
--
-- Measured before writing (production, 2026-09-13): no `delivery_duty`
-- assignment; no cover; 5 contacts all recorded and owned by the shared
-- login; 0 collection-owner rows; active individual Operation staff: Jess
-- CR002, Yu Jun CR004, Shasha CR005.
-- ============================================================================

begin;

set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 1 · the record carries the acting person and the basis of its owner
-- ---------------------------------------------------------------------------

alter table public.ops_delivery_contacts
  add column if not exists acting_user_id uuid references public.app_users(id),
  add column if not exists owner_basis text
    check (owner_basis in ('collection_owner', 'established_contact', 'delivery_duty', 'recorder', 'unresolved'));

comment on column public.ops_delivery_contacts.contact_owner_user_id is
  '0499: the NORMAL responsible Operation person for this customer/SO — an individual staff identity (staff_code), never a shared role login; resolved by delivery_contact_responsibility().';
comment on column public.ops_delivery_contacts.acting_user_id is
  '0499: who acts today — the normal person, or the delivery_duty buddy cover on that person.';
comment on column public.ops_delivery_contacts.owner_basis is
  '0499: how the owner was resolved — collection_owner · established_contact · delivery_duty · recorder · unresolved.';

-- ---------------------------------------------------------------------------
-- 2 · an individual staff identity — one predicate, reused
-- ---------------------------------------------------------------------------

create or replace function public.delivery_is_individual_operation_staff(p_user uuid)
returns boolean
language sql stable
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.app_users u
     where u.id = p_user
       and u.status = 'active'
       and u.role in ('operation', 'principal')
       and u.staff_code is not null
  );
$fn$;

comment on function public.delivery_is_individual_operation_staff(uuid) is
  '0499: active Operation/principal staff with a People record (staff_code) — the only identities that may hold customer responsibility. A shared role login has none.';

-- Was this person acting as delivery_duty buddy cover on that day?
create or replace function public.delivery_was_duty_cover_on(p_user uuid, p_on date)
returns boolean
language sql stable
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.workspace_duty_covers w
     where w.duty_key = 'delivery_duty'
       and w.acting_user_id = p_user
       and p_on between w.starts_on and w.ends_on
  );
$fn$;

-- ---------------------------------------------------------------------------
-- 3 · ONE arithmetic — the order's established individual responsibility
-- ---------------------------------------------------------------------------

create or replace function public.delivery_order_responsible_individual(
  p_order_id uuid,
  p_on date default null
) returns jsonb
language plpgsql stable
set search_path = public, pg_temp
as $fn$
declare
  v_on date := coalesce(p_on, (timezone('Asia/Kuala_Lumpur', now()))::date);
  v_user uuid;
  v_when date;
  v_with text;
begin
  -- 1 · the order's CURRENT collection owner
  select c.owner_user_id into v_user
    from public.payment_collection_owners c
   where c.order_id = p_order_id and c.effective_from <= v_on
   order by c.effective_from desc, c.changed_at desc
   limit 1;
  if v_user is not null then
    return jsonb_build_object('user_id', v_user, 'basis', 'collection_owner');
  end if;

  -- 2 · the order's established contact responsibility — an individual who
  --     was not the delivery_duty cover on the contact day; customer first
  select c.contact_owner_user_id, (timezone('Asia/Kuala_Lumpur', c.contacted_at))::date, c.contacted_person
    into v_user, v_when, v_with
    from public.ops_delivery_contacts c
   where c.order_id = p_order_id
     and c.contact_owner_user_id is not null
     and public.delivery_is_individual_operation_staff(c.contact_owner_user_id)
     and not public.delivery_was_duty_cover_on(c.contact_owner_user_id, (timezone('Asia/Kuala_Lumpur', c.contacted_at))::date)
   order by (c.contacted_person = 'customer') desc, c.contacted_at asc
   limit 1;
  if v_user is not null then
    return jsonb_build_object('user_id', v_user, 'basis', 'established_contact',
                              'contacted_on', v_when, 'contacted_person', v_with);
  end if;

  return jsonb_build_object('user_id', null, 'basis', null);
end;
$fn$;

comment on function public.delivery_order_responsible_individual(uuid, date) is
  '0499: the ONE arithmetic for a Sales Order''s responsible Delivery Operation person — its current collection owner, else the earliest contact whose responsible person is an individual who was not covering that day. Null when nobody is established.';

-- ---------------------------------------------------------------------------
-- 4 · the contact writer's resolution — normal · acting · basis
-- ---------------------------------------------------------------------------

create or replace function public.delivery_contact_responsibility(
  p_order_id uuid,
  p_recorder uuid default null,
  p_on date default null
) returns jsonb
language plpgsql stable
set search_path = public, pg_temp
as $fn$
declare
  v_on date := coalesce(p_on, (timezone('Asia/Kuala_Lumpur', now()))::date);
  v_est jsonb;
  v_normal uuid;
  v_basis text;
  v_duty jsonb;
  v_cover uuid;
begin
  v_est := public.delivery_order_responsible_individual(p_order_id, v_on);
  v_normal := nullif(v_est->>'user_id', '')::uuid;
  v_basis := v_est->>'basis';

  if v_normal is null then
    -- the configured normal Delivery Duty holder on the day — never the cover
    v_duty := public.workspace_resolve_duty('delivery_duty', v_on);
    v_normal := nullif(v_duty->>'normal_user_id', '')::uuid;
    if v_normal is not null then
      v_basis := 'delivery_duty';
    elsif p_recorder is not null
      and public.delivery_is_individual_operation_staff(p_recorder)
      and not public.delivery_was_duty_cover_on(p_recorder, v_on) then
      -- an individual taking responsibility by making the first contact
      v_normal := p_recorder;
      v_basis := 'recorder';
    else
      v_basis := 'unresolved';
    end if;
  end if;

  -- today's acting person: the delivery_duty buddy cover on the normal
  -- person, else the normal person (the shared cover law, keyed by the
  -- owner's person exactly as payment_collection_owner_context reads it)
  if v_normal is not null then
    select w.acting_user_id into v_cover
      from public.workspace_duty_covers w
     where w.duty_key = 'delivery_duty'
       and w.normal_user_id = v_normal
       and v_on between w.starts_on and w.ends_on
     order by w.created_at desc
     limit 1;
  end if;

  return jsonb_build_object(
    'on_date', v_on,
    'normal_user_id', v_normal,
    'acting_user_id', coalesce(v_cover, v_normal),
    'cover_user_id', v_cover,
    'is_cover', v_cover is not null,
    'basis', v_basis,
    'recorder_user_id', p_recorder,
    'recorder_is_individual', p_recorder is not null and public.delivery_is_individual_operation_staff(p_recorder));
end;
$fn$;

comment on function public.delivery_contact_responsibility(uuid, uuid, date) is
  '0499: who is RESPONSIBLE for this customer (normal), who ACTS today (cover or normal) and how that was resolved — for the contact writer. A shared login or a cover never becomes the normal person.';

revoke all on function public.delivery_contact_responsibility(uuid, uuid, date) from public, anon;
grant execute on function public.delivery_contact_responsibility(uuid, uuid, date) to authenticated;
revoke all on function public.delivery_order_responsible_individual(uuid, date) from public, anon;
grant execute on function public.delivery_order_responsible_individual(uuid, date) to authenticated;
revoke all on function public.delivery_is_individual_operation_staff(uuid) from public, anon;
grant execute on function public.delivery_is_individual_operation_staff(uuid) to authenticated;
revoke all on function public.delivery_was_duty_cover_on(uuid, date) from public, anon;
grant execute on function public.delivery_was_duty_cover_on(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 5 · every contact, whoever writes it, carries the resolved facts
-- ---------------------------------------------------------------------------

create or replace function public.trg_delivery_contact_names_its_people()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_on date := (timezone('Asia/Kuala_Lumpur', coalesce(new.contacted_at, now())))::date;
  v_recorder uuid := coalesce(new.recorded_by, new.contact_owner_user_id);
  v_r jsonb;
begin
  -- A supplied owner is only a recorder candidate: responsibility is
  -- resolved, never asserted by the writer.
  v_r := public.delivery_contact_responsibility(new.order_id, v_recorder, v_on);
  new.contact_owner_user_id := nullif(v_r->>'normal_user_id', '')::uuid;
  new.acting_user_id := nullif(v_r->>'acting_user_id', '')::uuid;
  new.owner_basis := v_r->>'basis';
  return new;
end;
$fn$;

drop trigger if exists delivery_contact_names_its_people on public.ops_delivery_contacts;
create trigger delivery_contact_names_its_people
  before insert on public.ops_delivery_contacts
  for each row execute function public.trg_delivery_contact_names_its_people();

-- ---------------------------------------------------------------------------
-- 6 · Payment reads the same responsibility
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
  v_holder uuid;
  v_order uuid;
  v_est jsonb;
  v_owner uuid;
  v_from_contact int := 0;
  v_from_duty int := 0;
  v_unresolved int := 0;
  v_kept int := 0;
  v_contact_skipped int := 0;
begin
  if not coalesce(public.app_role() in ('operation', 'principal'), false) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_operation';
  end if;

  v_holder := nullif(public.workspace_resolve_duty('delivery_duty', v_on)->>'normal_user_id', '')::uuid;

  for v_order in
    select distinct o.id from public.orders o
     where o.id = any(coalesce(p_order_ids, '{}'::uuid[]))
  loop
    if exists (
      select 1 from public.payment_collection_owners c
       where c.order_id = v_order and c.effective_from <= v_on
    ) then
      v_kept := v_kept + 1;
      continue;
    end if;

    -- 1 · the order's own established responsibility (the ONE arithmetic)
    v_est := public.delivery_order_responsible_individual(v_order, v_on);
    v_owner := nullif(v_est->>'user_id', '')::uuid;
    if v_owner is not null then
      insert into public.payment_collection_owners
        (order_id, owner_user_id, previous_owner_user_id, source, reason, changed_by, changed_at, effective_from)
      values
        (v_order, v_owner, null, 'established',
         'Responsible Delivery Operation — the responsible person recorded on this order''s customer contact ('
           || case when v_est->>'contacted_person' = 'customer' then 'contacted the customer on ' else 'arranged with the partner on ' end
           || coalesce(v_est->>'contacted_on', to_char(v_on, 'YYYY-MM-DD')) || ')',
         null, now(), v_on);
      v_from_contact := v_from_contact + 1;
      continue;
    end if;

    if exists (select 1 from public.ops_delivery_contacts c where c.order_id = v_order) then
      v_contact_skipped := v_contact_skipped + 1;
    end if;

    -- 2 · nobody responsible yet — the Delivery Duty NORMAL holder today, never the cover
    if v_holder is null then
      v_unresolved := v_unresolved + 1;
      continue;
    end if;
    insert into public.payment_collection_owners
      (order_id, owner_user_id, previous_owner_user_id, source, reason, changed_by, changed_at, effective_from)
    values
      (v_order, v_holder, null, 'established',
       'Responsible Delivery Operation — the Delivery Duty holder when collection first became actionable (no responsible person recorded on this order yet)',
       null, now(), v_on);
    v_from_duty := v_from_duty + 1;
  end loop;

  return jsonb_build_object(
    'on_date', v_on,
    'holder_user_id', v_holder,
    'established', v_from_contact + v_from_duty,
    'established_from_contact', v_from_contact,
    'established_from_duty', v_from_duty,
    'contacts_not_qualifying', v_contact_skipped,
    'kept', v_kept,
    'unresolved', v_unresolved);
end;
$fn$;

comment on function public.payment_collection_owner_establish(uuid[], date) is
  '0499: when collection first becomes actionable, the order''s responsible Delivery Operation person by the ONE arithmetic (delivery_order_responsible_individual: current owner, else the earliest contact whose responsible person is an individual who was not covering), else the Delivery Duty NORMAL holder on the day, else unresolved. Idempotent; append-only.';

revoke all on function public.payment_collection_owner_establish(uuid[], date) from public, anon;
grant execute on function public.payment_collection_owner_establish(uuid[], date) to authenticated;

-- ---------------------------------------------------------------------------
-- 7 · sanity — schema only, never a production row count
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regprocedure('public.delivery_contact_responsibility(uuid, uuid, date)') is null
     or to_regprocedure('public.delivery_order_responsible_individual(uuid, date)') is null
     or to_regprocedure('public.payment_collection_owner_establish(uuid[], date)') is null then
    raise exception '0499: a responsibility door is missing';
  end if;
  if not exists (
    select 1 from pg_trigger where tgname = 'delivery_contact_names_its_people'
       and tgrelid = 'public.ops_delivery_contacts'::regclass
  ) then
    raise exception '0499: the contact trigger is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'ops_delivery_contacts' and column_name = 'acting_user_id'
  ) then
    raise exception '0499: acting_user_id is missing';
  end if;
end $$;

commit;
