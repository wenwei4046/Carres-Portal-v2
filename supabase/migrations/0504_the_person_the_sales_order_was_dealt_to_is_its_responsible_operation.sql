-- ============================================================================
-- 0504 — The person the Sales Order was dealt to IS its responsible Operation
--        (owner ruling 2026-09-13; docs/orders/MASTER.md §"How the PIC is
--        decided", docs/payment/MASTER.md §10, docs/delivery/MASTER.md §5.1 ·
--        §13.1, docs/workspace/MASTER.md §3–§4)
--
-- THE OWNER'S RULE. A Sales Order is auto-assigned to an INDIVIDUAL Operation
-- follow-up person when it enters Operations. That person continues the
-- customer follow-up, including ordinary balance and storage collection.
-- Normal responsibility stays STABLE. Leave is buddy cover. A permanent change
-- is a formal handover. PO/GRN/Finance keep their own specialist owner rules —
-- there is no universal Sales Order owner.
--
-- WHAT WAS WRONG. `ops_order_control.assigned_staff` (0232/0235) has carried
-- that assignment since July, and this lane overlooked it: 0495/0498 inferred
-- responsibility from the earliest customer CONTACT and 0489/0499 from the
-- Delivery Duty holder. The owner rejects both inferences. Measured in
-- production 2026-09-13/14: 101 controls, 101 system-assigned, 0 rows in
-- `payment_collection_owners`, 0 covers, 5 contacts all recorded by the shared
-- `Operations` login — so every collection owner resolved to NOBODY while the
-- real assignment sat one table away.
--
-- WHAT THIS MIGRATION BUILDS (forward-only; 0489's ledger, handover, cover and
-- audit law are preserved, not replaced):
--
--   §1  `ops_person_is_in_today(user)` — the 10:00 MYT presence rule and the
--       person-level planned-leave flag, in ONE place the database can read
--       (it already existed only in TypeScript, `countsAsInToday`).
--   §2  `delivery_responsible_operation(order, day)` — the ONE responsibility
--       read, now:
--         normal = the order's responsibility ledger row effective that day
--                  (an establishment or a formal handover), when its person is
--                  still an active individual
--                · else `ops_order_control.assigned_staff`, when it is an
--                  active INDIVIDUAL (a People record with a `staff_code`)
--                · else nobody.
--       CONTACT HISTORY AND DELIVERY DUTY ARE NO LONGER OWNER SOURCES.
--         acting = a formal `delivery_duty` buddy cover on that person
--                · else, TODAY only, when that person is out (planned leave,
--                  or no heartbeat from 10:00 MYT), the least-loaded
--                  individual who IS in today — buddy cover, never a
--                  reassignment; the normal person is untouched and the work
--                  returns when they are back
--                · else the person.
--   §2a `payment_collection_owners.changed_at` now advances with
--       `clock_timestamp()`. It used to be `now()` — the TRANSACTION's start —
--       so two rows written by one act (a handover, then the assignment that
--       follows it) carried the SAME instant and `order by effective_from
--       desc, changed_at desc` could return either. A rolled-back production
--       probe caught exactly that: a handover effective today produced a
--       duplicate ledger row AND the read still answered the previous owner.
--       An append-only ledger whose timestamp does not advance is not ordered.
--   §3  `payment_collection_owner_follow_assignment()` — the assignment and
--       the ledger can never disagree: whenever an order is dealt or
--       reassigned to an individual, the append-only ledger records it
--       (`established` for the first, `handover` after, with who changed it).
--   §4  `payment_collection_owner_handover` — same signature, same Staff &
--       Duties gate, same evidence; it now also writes the assignment, so the
--       formal handover moves BOTH facts. A new owner must be an individual.
--   §5  `payment_collection_owner_establish` — same shape, reads §2.
--   §6  `payment_collection_owner_context` — reads §2, so an order that has an
--       assignment but no ledger row resolves the same on every surface (Law
--       D: a derived fact has ONE arithmetic).
--
-- Nothing is backfilled and no production row is asserted. The 100 orders
-- standing on the non-person test account simply stop resolving to an owner;
-- the sweep deals them to individuals on its next run.
-- ============================================================================

begin;

set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 0 · the ledger's own clock
-- ---------------------------------------------------------------------------

alter table public.payment_collection_owners
  alter column changed_at set default clock_timestamp();

comment on column public.payment_collection_owners.changed_at is
  '0504: when this row was written, by the WALL clock (clock_timestamp). now() is the transaction start, so two rows written by one act shared an instant and the newest-row read could pick either.';

-- ---------------------------------------------------------------------------
-- 1 · presence, in the database
-- ---------------------------------------------------------------------------

create or replace function public.ops_person_is_in_today(p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select
    -- planned leave is a person-level fact and outranks the clock
    coalesce((select s.available from public.ops_staff_settings s where s.user_id = p_user_id), true)
    and (
      -- before 10:00 MYT everybody keeps their share — late is not absent
      extract(hour from timezone('Asia/Kuala_Lumpur', now())) < 10
      or coalesce((
        select (timezone('Asia/Kuala_Lumpur', u.last_seen_at))::date
             = (timezone('Asia/Kuala_Lumpur', now()))::date
          from public.app_users u where u.id = p_user_id
      ), false)
    );
$fn$;

comment on function public.ops_person_is_in_today(uuid) is
  '0504: is this person in today for Operation work — planned leave (ops_staff_settings.available) outranks the clock; before 10:00 MYT everybody counts in; from 10:00 a heartbeat today is required. The SQL half of the shared `countsAsInToday` rule (0235).';

revoke all on function public.ops_person_is_in_today(uuid) from public, anon;
grant execute on function public.ops_person_is_in_today(uuid) to authenticated, service_role;

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
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_on date := coalesce(p_on, v_today);
  v_normal uuid;
  v_source text := 'not_assigned';
  v_effective date;
  v_acting uuid;
  v_cover_ends date;
begin
  if not (coalesce(auth.role() = 'service_role', false) or coalesce((select public.is_internal()), false)) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_internal';
  end if;

  -- a · the order's own responsibility ledger — an establishment or a formal
  --     handover. Newest row effective on or before the day, unconditionally:
  --     an older row never becomes the answer just because the newest person
  --     has since left.
  select c.owner_user_id, c.source, c.effective_from
    into v_normal, v_source, v_effective
    from public.payment_collection_owners c
   where c.order_id = p_order_id and c.effective_from <= v_on
   order by c.effective_from desc, c.changed_at desc
   limit 1;

  if v_normal is not null and not exists (
    select 1 from public.app_users u
     where u.id = v_normal and u.status = 'active'
       and u.role in ('operation', 'principal') and u.staff_code is not null
  ) then
    v_normal := null; v_source := 'not_assigned'; v_effective := null;
  end if;

  -- b · the person this Sales Order was DEALT to when it entered Operations.
  --     Only an INDIVIDUAL owns: a shared login or a robot account (no
  --     staff_code) may record evidence, never carry responsibility.
  if v_normal is null then
    select oc.assigned_staff, (timezone('Asia/Kuala_Lumpur', oc.assigned_at))::date
      into v_normal, v_effective
      from public.ops_order_control oc
      join public.app_users u on u.id = oc.assigned_staff
     where oc.order_id = p_order_id
       and u.status = 'active' and u.role in ('operation', 'principal')
       and u.staff_code is not null;
    if v_normal is not null then v_source := 'assigned'; end if;
  end if;

  if v_normal is null then
    return jsonb_build_object(
      'order_id', p_order_id, 'on_date', v_on, 'source', 'not_assigned',
      'normal_user_id', null, 'normal_user_name', null, 'effective_from', null,
      'acting_user_id', null, 'acting_user_name', null,
      'is_cover', false, 'cover_ends_on', null, 'cover_reason', null);
  end if;

  -- c · today's acting person — a FORMAL buddy cover first (the shared law).
  select w.acting_user_id, w.ends_on into v_acting, v_cover_ends
    from public.workspace_duty_covers w
   where w.duty_key = 'delivery_duty' and w.normal_user_id = v_normal
     and v_on between w.starts_on and w.ends_on
   order by w.created_at desc
   limit 1;

  -- d · ABSENCE IS COVER, NEVER A REASSIGNMENT. When the responsible person is
  --     out today and nobody was formally named, the least-loaded individual
  --     who is in today acts for the day. Presence is a fact about TODAY only,
  --     so a historical day is never re-guessed.
  if v_acting is null and v_on = v_today and not public.ops_person_is_in_today(v_normal) then
    select u.id into v_acting
      from public.ops_staff_settings s
      join public.app_users u on u.id = s.user_id
     where s.available is distinct from false
       and u.status = 'active' and u.role in ('operation', 'principal')
       and u.staff_code is not null and u.id <> v_normal
       and public.ops_person_is_in_today(u.id)
     order by (
       select count(*) from public.ops_order_control oc
         join public.orders o on o.id = oc.order_id
        where oc.assigned_staff = u.id
          and o.status is distinct from 'cancelled'
          and o.status is distinct from 'delivered'
          and o.operation_stage is distinct from 'delivered'
     ) asc, u.staff_code asc
     limit 1;
    if v_acting is not null then v_cover_ends := v_today; end if;
  end if;

  return jsonb_build_object(
    'order_id', p_order_id, 'on_date', v_on, 'source', v_source,
    'normal_user_id', v_normal,
    'normal_user_name', (select name from public.app_users where id = v_normal),
    'effective_from', v_effective,
    'acting_user_id', coalesce(v_acting, v_normal),
    'acting_user_name', (select name from public.app_users where id = coalesce(v_acting, v_normal)),
    'is_cover', v_acting is not null,
    'cover_ends_on', v_cover_ends,
    'cover_reason', case when v_acting is null then null
                         when v_cover_ends = v_today and not exists (
                           select 1 from public.workspace_duty_covers w
                            where w.duty_key = 'delivery_duty' and w.normal_user_id = v_normal
                              and v_on between w.starts_on and w.ends_on)
                         then 'away_today' else 'buddy_cover' end);
end;
$fn$;

comment on function public.delivery_responsible_operation(uuid, date) is
  '0504: the ONE read of a Sales Order''s responsible Operation person — the responsibility ledger (establishment or formal handover), else the individual the order was DEALT to (ops_order_control.assigned_staff), else nobody; plus today''s acting person (a formal delivery_duty cover, else an away person''s least-loaded stand-in for the day). Contact history and the Delivery Duty holder are NOT owner sources (owner ruling 2026-09-13). Delivery''s contact writer and Payment''s collection owner both read it.';

-- ---------------------------------------------------------------------------
-- 3 · the assignment and the ledger can never disagree
-- ---------------------------------------------------------------------------

create or replace function public.payment_collection_owner_follow_assignment()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_current uuid;
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
begin
  if new.assigned_staff is null then return new; end if;
  if not exists (
    select 1 from public.app_users u
     where u.id = new.assigned_staff and u.status = 'active'
       and u.role in ('operation', 'principal') and u.staff_code is not null
  ) then
    -- a non-person or inactive account never becomes an owner; the read
    -- ignores it and the sweep deals the order to an individual.
    return new;
  end if;

  select c.owner_user_id into v_current
    from public.payment_collection_owners c
   where c.order_id = new.order_id
   order by c.effective_from desc, c.changed_at desc
   limit 1;

  if v_current is not distinct from new.assigned_staff then return new; end if;

  insert into public.payment_collection_owners
    (order_id, owner_user_id, previous_owner_user_id, source, reason, changed_by, changed_at, effective_from)
  values (
    new.order_id, new.assigned_staff, v_current,
    case when v_current is null then 'established' else 'handover' end,
    case
      when v_current is null and new.assigned_by is null
        then 'Responsible Operation — dealt to this person when the order entered Operations'
      when v_current is null
        then 'Responsible Operation — assigned by management when the order entered Operations'
      when new.assigned_by is null
        then 'Responsible Operation — the previous person no longer holds this order'
      else 'Responsible Operation — reassigned by management'
    end,
    new.assigned_by, clock_timestamp(), v_today);

  return new;
end;
$fn$;

comment on function public.payment_collection_owner_follow_assignment() is
  '0504: every deal or reassignment of a Sales Order to an individual is recorded in the append-only responsibility ledger — `established` for the first, `handover` after, carrying previous owner, reason and who changed it. The assignment and the ledger therefore never disagree.';

drop trigger if exists payment_collection_owner_follows_assignment on public.ops_order_control;
create trigger payment_collection_owner_follows_assignment
  after insert or update of assigned_staff on public.ops_order_control
  for each row execute function public.payment_collection_owner_follow_assignment();

-- ---------------------------------------------------------------------------
-- 4 · the formal handover moves BOTH facts
-- ---------------------------------------------------------------------------

create or replace function public.payment_collection_owner_handover(
  p_order_id uuid,
  p_new_owner_user_id uuid,
  p_reason text,
  p_effective_from date default null
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_from date := coalesce(p_effective_from, (timezone('Asia/Kuala_Lumpur', now()))::date);
  v_current uuid;
  v_row public.payment_collection_owners;
begin
  perform public.workspace_duty_settings_gate();

  if p_order_id is null or not exists (select 1 from public.orders where id = p_order_id) then
    raise exception 'unknown order' using errcode = '22023', detail = 'unknown_order';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'a handover states its reason' using errcode = '22023', detail = 'reason_required';
  end if;
  if not exists (
    select 1 from public.app_users u
     where u.id = p_new_owner_user_id and u.status = 'active'
       and u.role in ('operation', 'principal')
  ) then
    raise exception 'the new owner must be active Operation staff'
      using errcode = '22023', detail = 'new_owner_not_operation_staff';
  end if;
  -- 0504: only an INDIVIDUAL carries responsibility.
  if not exists (
    select 1 from public.app_users u
     where u.id = p_new_owner_user_id and u.staff_code is not null
  ) then
    raise exception 'the new owner must be a person, not a shared account'
      using errcode = '22023', detail = 'new_owner_not_individual';
  end if;

  select c.owner_user_id into v_current
    from public.payment_collection_owners c
   where c.order_id = p_order_id and c.effective_from <= v_from
   order by c.effective_from desc, c.changed_at desc
   limit 1;

  if v_current = p_new_owner_user_id then
    raise exception 'this person already owns the collection'
      using errcode = '22023', detail = 'same_owner';
  end if;

  insert into public.payment_collection_owners
    (order_id, owner_user_id, previous_owner_user_id, source, reason, changed_by, changed_at, effective_from)
  values
    (p_order_id, p_new_owner_user_id, v_current, 'handover', btrim(p_reason), v_uid, clock_timestamp(), v_from)
  returning * into v_row;

  -- The assignment follows the handover, so the Sales Order and the collection
  -- desk name the same person. The ledger row above is already current, so the
  -- §3 trigger writes nothing further.
  insert into public.ops_order_control (order_id, assigned_staff, assigned_by, assigned_at, updated_by)
  values (p_order_id, p_new_owner_user_id, v_uid, now(), v_uid)
  on conflict (order_id) do update
    set assigned_staff = excluded.assigned_staff,
        assigned_by = excluded.assigned_by,
        assigned_at = excluded.assigned_at,
        updated_by = excluded.updated_by;

  return to_jsonb(v_row);
end;
$fn$;

comment on function public.payment_collection_owner_handover(uuid, uuid, text, date) is
  '0504: the FORMAL handover of one Sales Order''s responsible Operation person — principal or manager only (the Staff & Duties gate). Appends previous owner · new owner · reason · changed by · changed on · effective from, and moves the order''s assignment with it. The new owner must be an individual.';

-- ---------------------------------------------------------------------------
-- 5 · Payment establishes from the same read
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
  v_established int := 0; v_unresolved int := 0; v_kept int := 0;
begin
  if not coalesce(public.app_role() in ('operation', 'principal'), false) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_operation';
  end if;
  for v_order in select distinct o.id from public.orders o where o.id = any(coalesce(p_order_ids, '{}'::uuid[])) loop
    if exists (select 1 from public.payment_collection_owners c where c.order_id = v_order and c.effective_from <= v_on) then
      v_kept := v_kept + 1; continue;
    end if;
    v_r := public.delivery_responsible_operation(v_order, v_on);
    v_normal := nullif(v_r->>'normal_user_id', '')::uuid;
    if v_normal is null then v_unresolved := v_unresolved + 1; continue; end if;
    insert into public.payment_collection_owners
      (order_id, owner_user_id, previous_owner_user_id, source, reason, changed_by, changed_at, effective_from)
    values (v_order, v_normal, null, 'established',
      'Responsible Operation — the person this Sales Order was dealt to when it entered Operations',
      null, clock_timestamp(), v_on);
    v_established := v_established + 1;
  end loop;
  return jsonb_build_object(
    'on_date', v_on, 'established', v_established, 'kept', v_kept, 'unresolved', v_unresolved);
end;
$fn$;

comment on function public.payment_collection_owner_establish(uuid[], date) is
  '0504: the collection owner IS the responsible Operation person (delivery_responsible_operation) — the individual this Sales Order was dealt to. Written once when collection first becomes actionable and kept until the balance is RM 0. Idempotent; no responsible person → nothing established.';

-- ---------------------------------------------------------------------------
-- 6 · one arithmetic for every surface
-- ---------------------------------------------------------------------------

create or replace function public.payment_collection_owner_context(
  p_order_ids uuid[],
  p_on date default null
) returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
declare
  v_on date := coalesce(p_on, (timezone('Asia/Kuala_Lumpur', now()))::date);
  v_out jsonb := '[]'::jsonb;
  v_order uuid;
  v_r jsonb;
  v_normal uuid;
begin
  if not coalesce((select public.is_internal()), false) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_internal';
  end if;

  for v_order in select distinct x from unnest(coalesce(p_order_ids, '{}'::uuid[])) x loop
    v_r := public.delivery_responsible_operation(v_order, v_on);
    v_normal := nullif(v_r->>'normal_user_id', '')::uuid;
    -- An order with no responsible person yields NO row — the surfaces print
    -- the governed unassigned sentence rather than a fabricated owner.
    continue when v_normal is null;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'order_id', v_order,
      'normal_user_id', v_normal,
      'normal_user_name', v_r->>'normal_user_name',
      'cover_user_id', case when (v_r->>'is_cover')::boolean then nullif(v_r->>'acting_user_id', '')::uuid else null end,
      'cover_user_name', case when (v_r->>'is_cover')::boolean then v_r->>'acting_user_name' else null end,
      'acting_user_id', nullif(v_r->>'acting_user_id', '')::uuid,
      'acting_user_name', v_r->>'acting_user_name',
      'is_cover', (v_r->>'is_cover')::boolean,
      'cover_ends_on', nullif(v_r->>'cover_ends_on', '')::date,
      'source', v_r->>'source',
      'effective_from', nullif(v_r->>'effective_from', '')::date,
      'established_on', (select min(e.effective_from) from public.payment_collection_owners e
                          where e.order_id = v_order and e.source = 'established'),
      'history', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', h.id, 'source', h.source,
          'owner_user_id', h.owner_user_id, 'owner_user_name', ho.name,
          'previous_owner_user_id', h.previous_owner_user_id, 'previous_owner_user_name', hp.name,
          'reason', h.reason,
          'changed_by', h.changed_by, 'changed_by_name', hb.name,
          'changed_at', h.changed_at, 'effective_from', h.effective_from
        ) order by h.effective_from asc, h.changed_at asc)
          from public.payment_collection_owners h
          left join public.app_users ho on ho.id = h.owner_user_id
          left join public.app_users hp on hp.id = h.previous_owner_user_id
          left join public.app_users hb on hb.id = h.changed_by
         where h.order_id = v_order
      ), '[]'::jsonb)
    ));
  end loop;

  return v_out;
end;
$fn$;

comment on function public.payment_collection_owner_context(uuid[], date) is
  '0504: the one read every surface uses for a Sales Order''s responsible Operation person — normal owner, today''s cover, the acting person and the append-only history, all from delivery_responsible_operation. Normal owner and today''s cover stay distinct facts; cover never rewrites the owner.';

-- ---------------------------------------------------------------------------
-- 7 · grants and sanity — schema only, never a production row count
-- ---------------------------------------------------------------------------

revoke all on function public.delivery_responsible_operation(uuid, date) from public, anon;
grant execute on function public.delivery_responsible_operation(uuid, date) to authenticated, service_role;
revoke all on function public.payment_collection_owner_establish(uuid[], date) from public, anon;
grant execute on function public.payment_collection_owner_establish(uuid[], date) to authenticated;
revoke all on function public.payment_collection_owner_handover(uuid, uuid, text, date) from public, anon;
grant execute on function public.payment_collection_owner_handover(uuid, uuid, text, date) to authenticated;
revoke all on function public.payment_collection_owner_context(uuid[], date) from public, anon;
grant execute on function public.payment_collection_owner_context(uuid[], date) to authenticated;

do $$
begin
  if to_regprocedure('public.ops_person_is_in_today(uuid)') is null
     or to_regprocedure('public.delivery_responsible_operation(uuid, date)') is null
     or to_regprocedure('public.payment_collection_owner_establish(uuid[], date)') is null
     or to_regprocedure('public.payment_collection_owner_handover(uuid, uuid, text, date)') is null
     or to_regprocedure('public.payment_collection_owner_context(uuid[], date)') is null then
    raise exception '0504: a responsibility door is missing';
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgname = 'payment_collection_owner_follows_assignment'
       and tgrelid = 'public.ops_order_control'::regclass
  ) then
    raise exception '0504: the assignment ledger trigger is missing';
  end if;
  if coalesce((
    select column_default from information_schema.columns
     where table_schema = 'public' and table_name = 'payment_collection_owners'
       and column_name = 'changed_at'), '') not like '%clock_timestamp%' then
    raise exception '0504: the ledger clock does not advance';
  end if;
end $$;

commit;
