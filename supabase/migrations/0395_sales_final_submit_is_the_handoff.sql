-- =============================================================================
-- 0395_sales_final_submit_is_the_handoff.sql
-- SALES → PURCHASING · completing the Sales Order is the handoff
-- =============================================================================
--
-- A complete Sales Portal checkout used to create status='place' and require a
-- second, hidden "Move to Proceed" action. Purchasing correctly reads only
-- proceeded orders, so complete customer orders could remain invisible there.
--
-- This migration makes the authoritative facts do the work:
--
--   * the Sales Portal creation door creates and tries the canonical Proceed in
--     one transaction;
--   * Sales final submit is recorded as its own authoritative fact; raw,
--     office, rental and imported orders never inherit that fact by accident;
--   * later governed writes are checked at transaction end, after header,
--     lines and add-ons have reached one final state;
--   * the explicit proceed_order RPC remains a strict recovery door and uses
--     the exact same transition function;
--   * proceeded_at records the actual Sales → Operations handoff. The existing
--     proceed_date remains the planned production-start date and is not reused.
--
-- Historical Place rows are never promoted from completeness or creator role.
-- Their old Portal/raw paths shared one primitive, so recovery requires exact
-- owner-confirmed IDs through the governed recovery RPC below.
-- =============================================================================

begin;

alter table public.orders
  add column if not exists proceeded_at timestamptz,
  add column if not exists sales_final_submitted_at timestamptz;

comment on column public.orders.proceeded_at is
  'Actual Sales-to-Operations handoff timestamp. Stamped when status enters '
  'proceed_order; cleared only by governed un-proceed back to place. 0395.';

comment on column public.orders.sales_final_submitted_at is
  'Authoritative Sales Portal final-submit timestamp. NULL for raw, office, '
  'rental and imported orders. Automatic handoff retries require this fact. 0395.';

-- Stamp every status door once: the canonical RPC, rental approval, imports,
-- and any future governed writer all receive the same handoff evidence.
create or replace function public.orders_stamp_proceeded_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status = 'proceed_order'
     and (tg_op = 'INSERT' or old.status is distinct from 'proceed_order') then
    new.proceeded_at := now();
  elsif tg_op = 'UPDATE'
        and old.status = 'proceed_order'
        and new.status = 'place' then
    new.proceeded_at := null;
  elsif tg_op = 'INSERT' and new.status <> 'proceed_order' then
    new.proceeded_at := null;
  end if;
  return new;
end;
$$;

create trigger orders_stamp_proceeded_at
  before insert or update of status on public.orders
  for each row execute function public.orders_stamp_proceeded_at();

-- ONE transition authority. Automatic callers receive a named blocker and
-- keep the order in Place; the recovery RPC asks for strict errors and keeps
-- its existing typed error contract.
create or replace function public._sales_order_proceed(
  p_order_id uuid,
  p_strict boolean,
  p_actor_role app_role,
  p_actor_text text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_order orders;
  v_total numeric(12,2);
  v_rental rental_agreements;
  v_blocker text;
begin
  select * into v_order
    from orders
   where id = p_order_id
   for update;

  if not found then
    if p_strict then
      raise exception 'Order not found'
        using errcode = '42P01', detail = 'order_not_found';
    end if;
    return jsonb_build_object('id', p_order_id, 'proceeded', false,
                              'blocker', 'order_not_found');
  end if;

  if v_order.status <> 'place' then
    if p_strict then
      raise exception 'Order is not in Place status'
        using errcode = '22023', detail = 'wrong_status';
    end if;
    return jsonb_build_object('id', p_order_id, 'proceeded', false,
                              'status', v_order.status, 'blocker', 'wrong_status');
  end if;

  select * into v_rental
    from rental_agreements
   where order_id = p_order_id
   limit 1;

  if v_order.customer_name is null or btrim(v_order.customer_name) = '' then
    v_blocker := 'customer_name_required';
  elsif v_order.customer_phone is null or btrim(v_order.customer_phone) = '' then
    v_blocker := 'customer_phone_required';
  elsif v_order.customer_address_unknown
        or v_order.customer_address is null
        or btrim(v_order.customer_address) = '' then
    v_blocker := 'delivery_address_required';
  elsif v_order.delivery_date_tbd or v_order.delivery_date is null then
    v_blocker := 'delivery_date_required';
  elsif v_rental.id is null and v_order.signature_url is null then
    v_blocker := 'signature_required';
  elsif v_rental.id is null and not v_order.terms_accepted then
    v_blocker := 'terms_not_accepted';
  elsif v_rental.id is not null and v_rental.status = 'rejected' then
    v_blocker := 'rental_rejected';
  elsif v_rental.id is not null and v_rental.status <> 'active' then
    v_blocker := 'rental_not_approved';
  end if;

  if v_blocker is null and v_rental.id is null then
    select
      coalesce((select sum(unit_price * qty) from order_lines
                 where order_id = p_order_id), 0)
      + coalesce((select sum(unit_price * qty) from order_addons
                   where order_id = p_order_id), 0)
      into v_total;

    if v_total <= 0 then
      v_blocker := 'total_amount_missing';
    elsif coalesce(v_order.paid, 0) < v_total * 0.5 then
      v_blocker := 'payment_below_50';
    end if;
  end if;

  if v_blocker is not null then
    if p_strict then
      case v_blocker
        when 'customer_name_required' then
          raise exception 'Customer name is required'
            using errcode = 'P0001', detail = v_blocker;
        when 'customer_phone_required' then
          raise exception 'Customer phone is required'
            using errcode = 'P0001', detail = v_blocker;
        when 'delivery_address_required' then
          raise exception 'Delivery address is required'
            using errcode = 'P0001', detail = v_blocker;
        when 'delivery_date_required' then
          raise exception 'Delivery date is required'
            using errcode = 'P0001', detail = v_blocker;
        when 'signature_required' then
          raise exception 'Customer signature is required'
            using errcode = 'P0001', detail = v_blocker;
        when 'terms_not_accepted' then
          raise exception 'Terms must be accepted'
            using errcode = 'P0001', detail = v_blocker;
        when 'total_amount_missing' then
          raise exception 'Order total is zero — nothing to proceed'
            using errcode = 'P0001', detail = v_blocker;
        when 'payment_below_50' then
          raise exception 'Payment must be at least 50 percent of total'
            using errcode = 'P0001', detail = v_blocker;
        when 'rental_rejected' then
          raise exception 'Rental % was rejected — this order cannot proceed',
            v_rental.agreement_no
            using errcode = 'P0001', detail = v_blocker;
        when 'rental_not_approved' then
          raise exception 'Rental % is still awaiting finance approval',
            v_rental.agreement_no
            using errcode = 'P0001', detail = v_blocker;
      end case;
    end if;
    return jsonb_build_object('id', p_order_id, 'proceeded', false,
                              'status', 'place', 'blocker', v_blocker);
  end if;

  update orders
     set status = 'proceed_order',
         operation_stage = 'confirmed',
         updated_at = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role, metadata)
  values (
    p_order_id,
    case when v_rental.id is null
      then 'Order proceeded · awaiting logistics triage'
      else 'Rental ' || v_rental.agreement_no
           || ' approved · order proceeded, awaiting logistics triage'
    end,
    p_actor_role,
    jsonb_build_object('kind', 'proceed', 'automatic', not p_strict)
  );

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values (
    p_actor_role,
    nullif(btrim(coalesce(p_actor_text, '')), ''),
    'order.proceeded',
    v_order.dealer_id,
    'SO-' || v_order.so::text
  );

  return jsonb_build_object(
    'id', v_order.id,
    'so', v_order.so,
    'status', 'proceed_order',
    'operation_stage', 'confirmed',
    'proceeded', true
  );
end;
$fn$;

revoke all on function public._sales_order_proceed(uuid,boolean,app_role,text)
  from public, anon, authenticated;

-- The explicit door stays for recovery and rental approval, but no longer owns
-- a second copy of the readiness arithmetic.
create or replace function public.proceed_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_order orders;
  v_role app_role;
  v_caller_dealer_id uuid;
begin
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();

  if v_role is null
     or v_role not in (
       'dealer','salesperson','showroom',
       'principal','operation','finance','bd'
     ) then
    raise exception 'forbidden: role cannot proceed Sales Orders'
      using errcode = '42501', detail = 'forbidden';
  end if;

  -- Resolve authorization in the same predicate that acquires the lock. A
  -- cross-dealer caller cannot lock an order it is not allowed to govern.
  select * into v_order
    from orders
   where id = p_order_id
     and (
       v_role in ('principal','operation','finance','bd')
       or (
         v_role in ('dealer','salesperson','showroom')
         and v_caller_dealer_id is not null
         and dealer_id is not distinct from v_caller_dealer_id
       )
     )
   for update;
  if not found then
    if exists (select 1 from orders where id = p_order_id) then
      raise exception 'forbidden: cross-dealer proceed'
        using errcode = '42501', detail = 'forbidden';
    end if;
    raise exception 'Order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  return public._sales_order_proceed(p_order_id, true, v_role, null);
end;
$fn$;

revoke all on function public.proceed_order(uuid) from public, anon;
grant execute on function public.proceed_order(uuid) to authenticated;

-- `create_order` is the old production Worker's current door. Keep its existing
-- grant during the database-first compatibility window: 0395 must be safe while
-- the old Worker is still serving requests. After the new Worker is deployed
-- and its exact SHA is verified, a separate next-number migration retires this
-- primitive. The new source below never calls it directly from an API route.

-- The Sales Portal's final submit: creation and eligible handoff commit or roll
-- back together.
create or replace function public.create_order_from_sales_portal(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_created jsonb;
  v_result jsonb;
  v_role app_role;
begin
  v_role := public.app_role();
  if v_role is null
     or v_role not in (
       'dealer','salesperson','showroom',
       'principal','operation','finance','bd'
     ) then
    raise exception 'forbidden: role cannot final-submit a Sales Order'
      using errcode = '42501', detail = 'forbidden';
  end if;

  v_created := public.create_order(payload);
  update public.orders
     set sales_final_submitted_at = now()
   where id = (v_created->>'id')::uuid;

  v_result := public._sales_order_proceed(
    (v_created->>'id')::uuid,
    false,
    v_role,
    null
  );
  return v_created || jsonb_build_object(
    'status', v_result->>'status',
    'proceeded', coalesce((v_result->>'proceeded')::boolean, false),
    'proceed_blocker', v_result->>'blocker'
  );
end;
$fn$;

revoke all on function public.create_order_from_sales_portal(jsonb)
  from public, anon;
grant execute on function public.create_order_from_sales_portal(jsonb)
  to authenticated;

-- Raw/internal creation remains a deliberate draft-capable door, but its role
-- law now lives in the database too. It never attempts the Sales handoff.
create or replace function public.create_raw_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('principal','operation') then
    raise exception 'forbidden: raw order creation is internal only'
      using errcode = '42501', detail = 'forbidden';
  end if;
  return public.create_order(payload);
end;
$fn$;

revoke all on function public.create_raw_order(jsonb)
  from public, anon;
grant execute on function public.create_raw_order(jsonb)
  to authenticated;

-- Existing Proceed rows already crossed the governed boundary. Recover the
-- current handoff from the latest authoritative Proceed history; never invent
-- a date from placed_at/created_at and never infer a Portal final-submit fact.
with current_handoff as (
  select h.order_id, max(h.occurred_at) as occurred_at
    from public.order_history h
   where h.metadata->>'kind' = 'proceed'
      or h.text like 'Order proceeded ·%'
      or h.text like 'Rental % approved · order proceeded%'
   group by h.order_id
)
update public.orders o
   set proceeded_at = coalesce(o.proceeded_at, h.occurred_at)
  from current_handoff h
 where h.order_id = o.id
   and o.status = 'proceed_order';

-- Exact legacy recovery is the new authoritative fact for ambiguous historic
-- Portal births. It accepts only owner-confirmed IDs, records who confirmed
-- them and why, then delegates readiness to the same transition authority.
create or replace function public.recover_legacy_sales_final_submits(
  p_order_ids uuid[],
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role;
  v_actor_name text;
  v_reason text;
  v_order orders;
  v_order_id uuid;
  v_handoff jsonb;
  v_results jsonb := '[]'::jsonb;
  v_requested_count integer;
  v_locked_count integer := 0;
  v_recovered_count integer := 0;
  v_batch_id uuid := gen_random_uuid();
  v_was_recovered boolean;
begin
  v_role := public.app_role();
  if v_role is null or v_role <> 'principal' then
    raise exception 'Only Principal may confirm ambiguous legacy Sales submissions'
      using errcode = '42501', detail = 'forbidden';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'A recovery reason is required'
      using errcode = '22023', detail = 'reason_required';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'Recovery reason must be 500 characters or fewer'
      using errcode = '22023', detail = 'reason_too_long';
  end if;

  v_requested_count := coalesce(cardinality(p_order_ids), 0);
  if v_requested_count = 0 then
    raise exception 'Choose at least one exact Sales Order'
      using errcode = '22023', detail = 'order_ids_required';
  end if;
  if v_requested_count > 100 then
    raise exception 'A recovery batch may contain at most 100 Sales Orders'
      using errcode = '22023', detail = 'too_many_order_ids';
  end if;
  if exists (select 1 from unnest(p_order_ids) requested(id) where id is null) then
    raise exception 'Order IDs cannot contain NULL'
      using errcode = '22023', detail = 'null_order_id';
  end if;
  if exists (
    select id from unnest(p_order_ids) requested(id)
     group by id having count(*) > 1
  ) then
    raise exception 'Each Sales Order may appear only once'
      using errcode = '22023', detail = 'duplicate_order_id';
  end if;

  select u.name into v_actor_name
    from public.app_users u
   where u.id = auth.uid();

  -- Validate and lock the entire batch before the first write. UUID ordering
  -- makes overlapping recovery batches deterministic.
  for v_order in
    select o.*
      from public.orders o
      join unnest(p_order_ids) requested(id) on requested.id = o.id
     order by o.id
     for update of o
  loop
    v_locked_count := v_locked_count + 1;

    if v_order.source_system is not null or v_order.source_ref is not null then
      raise exception 'SO-% is imported and cannot be recovered here', v_order.so
        using errcode = '22023', detail = 'imported_order';
    end if;
    if exists (
      select 1 from public.rental_agreements r where r.order_id = v_order.id
    ) then
      raise exception 'SO-% is a rental order and cannot be recovered here', v_order.so
        using errcode = '22023', detail = 'rental_order';
    end if;
    if exists (
      select 1 from public.order_history h
       where h.order_id = v_order.id
         and h.metadata->>'kind' = 'created_office'
    ) then
      raise exception 'SO-% was created in the office and cannot be recovered here', v_order.so
        using errcode = '22023', detail = 'office_order';
    end if;
    if v_order.status <> 'place'
       and v_order.sales_final_submitted_at is null then
      raise exception 'SO-% is not waiting for Sales final-submit recovery', v_order.so
        using errcode = '22023', detail = 'wrong_status';
    end if;
  end loop;

  if v_locked_count <> v_requested_count then
    raise exception 'One or more requested Sales Orders do not exist'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  for v_order_id in
    select o.id
      from public.orders o
      join unnest(p_order_ids) requested(id) on requested.id = o.id
     order by o.id
  loop
    select * into v_order from public.orders where id = v_order_id;
    v_was_recovered := v_order.sales_final_submitted_at is not null;

    if not v_was_recovered then
      update public.orders
         set sales_final_submitted_at = now(), updated_at = now()
       where id = v_order.id;

      insert into public.order_history (
        order_id, text, by_role, by_user_id, metadata
      ) values (
        v_order.id,
        'Legacy Sales final submit confirmed',
        v_role,
        auth.uid(),
        jsonb_build_object(
          'kind', 'sales_final_submit_recovered',
          'authority', 'explicit_order_ids',
          'reason', v_reason,
          'recovery_batch_id', v_batch_id
        )
      );

      insert into public.audit_log (role, actor_text, action, dealer_id, ref)
      values (
        v_role, v_actor_name, 'order.sales_final_submit.recovered',
        v_order.dealer_id, 'SO-' || v_order.so::text
      );
      v_recovered_count := v_recovered_count + 1;
    end if;

    if v_order.status = 'place' then
      v_handoff := public._sales_order_proceed(
        v_order.id, false, v_role, v_actor_name
      );
    else
      v_handoff := jsonb_build_object(
        'id', v_order.id, 'so', v_order.so, 'status', v_order.status,
        'proceeded', true, 'already_recovered', true
      );
    end if;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'id', v_order.id,
        'so', v_order.so,
        'recovered_now', not v_was_recovered,
        'proceeded', coalesce((v_handoff->>'proceeded')::boolean, false),
        'status', v_handoff->>'status',
        'blocker', v_handoff->>'blocker'
      )
    );
  end loop;

  return jsonb_build_object(
    'recovery_batch_id', v_batch_id,
    'requested', v_requested_count,
    'recovered_now', v_recovered_count,
    'results', v_results
  );
end;
$fn$;

comment on function public.recover_legacy_sales_final_submits(uuid[],text) is
  'Temporary Principal-only recovery for exact confirmed legacy Sales Portal '
  'order IDs. Rejects imported, office and rental orders, records one recovery '
  'fact, then delegates handoff to _sales_order_proceed. Retire after the '
  'historical backlog is closed. 0395.';

revoke all on function public.recover_legacy_sales_final_submits(uuid[],text)
  from public, anon, authenticated, service_role;
grant execute on function public.recover_legacy_sales_final_submits(uuid[],text)
  to authenticated;

-- Lock and authorize a Sales Order before any mature writer reads its status
-- or attribution. The wrappers below delegate their existing field rules only
-- after this one protected row has been resolved.
create or replace function public._sales_order_lock_for_edit(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_order orders;
  v_role app_role;
  v_caller_dealer_id uuid;
begin
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();

  if v_role is null
     or v_role not in (
       'dealer','salesperson','showroom',
       'principal','operation','finance','bd'
     ) then
    raise exception 'forbidden: role cannot edit Sales Orders'
      using errcode = '42501', detail = 'forbidden';
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id
     and (
       v_role in ('principal','operation','finance','bd')
       or (
         v_role in ('dealer','salesperson','showroom')
         and v_caller_dealer_id is not null
         and dealer_id is not distinct from v_caller_dealer_id
       )
     )
   for update;

  if not found then
    if exists (select 1 from public.orders where id = p_order_id) then
      raise exception 'forbidden: cross-dealer order edit'
        using errcode = '42501', detail = 'forbidden';
    end if;
    raise exception 'Order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;
end;
$fn$;

revoke all on function public._sales_order_lock_for_edit(uuid)
  from public, anon, authenticated, service_role;

-- add_order_lines was the one current child writer that read the parent before
-- taking its lock. Keep its mature implementation, but put the parent lock in
-- a governed wrapper so payment and line changes cannot finalise two different
-- totals concurrently.
alter function public.add_order_lines(uuid,jsonb,text,uuid,jsonb,jsonb)
  rename to _add_order_lines_0391_locked_impl;

revoke all on function public._add_order_lines_0391_locked_impl(
  uuid,jsonb,text,uuid,jsonb,jsonb
) from public, anon, authenticated, service_role;

create function public.add_order_lines(
  p_order_id uuid,
  p_lines jsonb,
  p_source text default 'direct',
  p_change_request_id uuid default null,
  p_addons_replace jsonb default null,
  p_addons_append jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public._sales_order_lock_for_edit(p_order_id);

  return public._add_order_lines_0391_locked_impl(
    p_order_id,
    p_lines,
    p_source,
    p_change_request_id,
    p_addons_replace,
    p_addons_append
  );
end;
$fn$;

revoke all on function public.add_order_lines(uuid,jsonb,text,uuid,jsonb,jsonb)
  from public, anon;
grant execute on function public.add_order_lines(uuid,jsonb,text,uuid,jsonb,jsonb)
  to authenticated, service_role;

-- unproceed predates the exact seven-role fail-closed law. Preserve its mature
-- stage/date guards, but acquire the same authorized parent lock first.
alter function public.unproceed_order(uuid)
  rename to _unproceed_order_0391_locked_impl;
revoke all on function public._unproceed_order_0391_locked_impl(uuid)
  from public, anon, authenticated, service_role;

create function public.unproceed_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public._sales_order_lock_for_edit(p_order_id);
  return public._unproceed_order_0391_locked_impl(p_order_id);
end;
$fn$;

revoke all on function public.unproceed_order(uuid) from public, anon;
grant execute on function public.unproceed_order(uuid) to authenticated;

-- The three current header/date writers also read status and attribution
-- before their UPDATE. Lock before those reads so a concurrent Proceed cannot
-- change the lane while a stale guard is still being applied.
alter function public.update_order(uuid,jsonb)
  rename to _update_order_0391_locked_impl;
revoke all on function public._update_order_0391_locked_impl(uuid,jsonb)
  from public, anon, authenticated, service_role;

create function public.update_order(p_order_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public._sales_order_lock_for_edit(p_order_id);
  return public._update_order_0391_locked_impl(p_order_id, p_payload);
end;
$fn$;

revoke all on function public.update_order(uuid,jsonb) from public, anon;
grant execute on function public.update_order(uuid,jsonb)
  to authenticated, service_role;

alter function public.set_order_address(uuid,text,text,boolean,jsonb)
  rename to _set_order_address_0391_locked_impl;
revoke all on function public._set_order_address_0391_locked_impl(
  uuid,text,text,boolean,jsonb
) from public, anon, authenticated, service_role;

create function public.set_order_address(
  p_order_id uuid,
  p_address text,
  p_billing text,
  p_billing_same boolean,
  p_parts jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public._sales_order_lock_for_edit(p_order_id);
  return public._set_order_address_0391_locked_impl(
    p_order_id, p_address, p_billing, p_billing_same, p_parts
  );
end;
$fn$;

revoke all on function public.set_order_address(uuid,text,text,boolean,jsonb)
  from public, anon;
grant execute on function public.set_order_address(uuid,text,text,boolean,jsonb)
  to authenticated, service_role;

alter function public.set_order_date(uuid,date,date)
  rename to _set_order_date_0391_locked_impl;
revoke all on function public._set_order_date_0391_locked_impl(uuid,date,date)
  from public, anon, authenticated, service_role;

create function public.set_order_date(
  p_order_id uuid,
  p_date date,
  p_proceed_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public._sales_order_lock_for_edit(p_order_id);
  return public._set_order_date_0391_locked_impl(
    p_order_id, p_date, p_proceed_date
  );
end;
$fn$;

revoke all on function public.set_order_date(uuid,date,date) from public, anon;
grant execute on function public.set_order_date(uuid,date,date)
  to authenticated, service_role;

-- One marker-gated retry owner. Every deferred trigger re-reads the complete
-- current order and then delegates to the exact same locked transition.
create or replace function public._sales_order_retry_submitted(
  p_order_id uuid,
  p_actor_role app_role,
  p_actor_text text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform 1
    from public.orders
   where id = p_order_id
     and status = 'place'
     and sales_final_submitted_at is not null
   for update;

  if not found then
    return;
  end if;

  perform public._sales_order_proceed(
    p_order_id,
    false,
    p_actor_role,
    p_actor_text
  );
end;
$fn$;

revoke all on function public._sales_order_retry_submitted(uuid,app_role,text)
  from public, anon, authenticated;

-- The trigger event is deferred to transaction end. A revision may update
-- several header fields and then replace its lines; none of those intermediate
-- snapshots can cross the Sales boundary. A deliberate un-proceed event is
-- skipped, while the later correction transaction will schedule a fresh retry.
create or replace function public.orders_auto_handoff_deferred()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role;
begin
  if tg_op = 'UPDATE'
     and old.status = 'proceed_order'
     and new.status = 'place' then
    return null;
  end if;

  if new.status <> 'place' then
    return null;
  end if;

  v_role := public.app_role();
  perform public._sales_order_retry_submitted(
    new.id,
    v_role,
    case when v_role is null then 'automatic sales handoff' else null end
  );
  return null;
end;
$fn$;

revoke all on function public.orders_auto_handoff_deferred()
  from public, anon, authenticated;

create constraint trigger orders_auto_handoff_deferred
  after insert or update of
    sales_final_submitted_at,
    customer_name,
    customer_phone,
    customer_address,
    customer_address_unknown,
    delivery_date,
    delivery_date_tbd,
    signature_url,
    terms_accepted,
    paid,
    status
  on public.orders
  deferrable initially deferred
  for each row execute function public.orders_auto_handoff_deferred();

-- Line/add-on-only corrections also receive a final-state retry. On Portal
-- birth these events wait until the wrapper has stamped final submit; on raw
-- birth the marker stays NULL and they are inert.
create or replace function public.order_goods_auto_handoff_deferred()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_order_id uuid;
  v_role app_role;
begin
  v_role := public.app_role();

  if tg_op <> 'DELETE' then
    v_order_id := new.order_id;
    perform public._sales_order_retry_submitted(
      v_order_id,
      v_role,
      case when v_role is null then 'automatic sales handoff' else null end
    );
  end if;

  if tg_op = 'DELETE'
     or (tg_op = 'UPDATE' and old.order_id is distinct from new.order_id) then
    v_order_id := old.order_id;
    perform public._sales_order_retry_submitted(
      v_order_id,
      v_role,
      case when v_role is null then 'automatic sales handoff' else null end
    );
  end if;

  return null;
end;
$fn$;

revoke all on function public.order_goods_auto_handoff_deferred()
  from public, anon, authenticated;

create constraint trigger order_lines_auto_handoff_deferred
  after insert or delete or update of order_id, qty, unit_price
  on public.order_lines
  deferrable initially deferred
  for each row execute function public.order_goods_auto_handoff_deferred();

create constraint trigger order_addons_auto_handoff_deferred
  after insert or delete or update of order_id, qty, unit_price
  on public.order_addons
  deferrable initially deferred
  for each row execute function public.order_goods_auto_handoff_deferred();

-- Rental approval keeps its existing explicit proceed_order call. Rental rows
-- do not receive sales_final_submitted_at, so no second automatic path exists.

commit;
