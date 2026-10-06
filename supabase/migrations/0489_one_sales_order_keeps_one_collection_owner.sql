-- ============================================================================
-- 0489 — One Sales Order keeps one collection owner
--        (docs/payment/MASTER.md §3 · §10 · §12, owner ruling 2026-09-13)
--
-- The owner ruling replaces `Payment Duty` as the owner of ordinary customer
-- balance collection with the RESPONSIBLE DELIVERY OPERATION:
--
--   One Sales Order's ordinary payment follow-up keeps one normal owner until
--   the balance is fully paid. The system resolves that normal owner from the
--   authoritative responsible Delivery Operation. The owner does not rotate
--   every day. Only governed leave/buddy cover or a formal handover changes
--   who acts.
--
-- What this migration builds:
--
--   §1  `payment_collection_owners` — append-only, one row per establishment
--       or handover. The CURRENT normal owner of an order is its newest row
--       whose effective date is on or before today. A row is never updated or
--       deleted: a handover appends, carrying previous owner · new owner ·
--       reason · changed by · changed on · effective from.
--   §2  `payment_collection_owner_establish(order_ids, on)` — when collection
--       first becomes actionable for an order (the Work feed's own admission:
--       balance in the collection window, a missed promise, or a live Storage
--       Invoice), the Delivery Duty NORMAL holder on that day becomes the
--       order's collection owner. Idempotent: an order that already has an
--       owner is never touched, so a changed date, a later duty rotation, a
--       filter or a page reload cannot rotate the owner. No holder → nothing
--       is established and the surface prints the governed Delivery
--       configuration failure (`Nobody holds Delivery Duty.`).
--   §3  `payment_collection_owner_handover(order, new owner, reason, from)` —
--       the FORMAL handover, gated exactly like Staff & Duties
--       (`workspace_duty_settings_gate`: principal or a manager). Full
--       evidence on the row; the previous owner is never erased.
--   §4  `payment_collection_owner_context(order_ids, on)` — the one read the
--       Work feed and the collection workspace use: normal owner · today's
--       cover · acting person · history. Cover is the SHARED buddy-cover law:
--       a `workspace_duty_covers` row on `delivery_duty` whose normal person is
--       the order's owner and whose dates include today makes the cover the
--       acting person; the normal owner is preserved and work returns to them
--       when the cover ends. A future person-level leave fact plugs in here.
--
-- Measured before writing (production, 2026-09-13): 0 `payment_duty`
-- assignment rows; `delivery_duty` has no holder today; 0 collection
-- outcomes; the Work feed carries 0 payment items (both unpaid orders are
-- `Wait`). Nothing existing is rewritten.
-- ============================================================================

begin;

set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 1 · the append-only owner ledger
-- ---------------------------------------------------------------------------

create table if not exists public.payment_collection_owners (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  owner_user_id uuid not null references public.app_users(id),
  previous_owner_user_id uuid references public.app_users(id),
  source text not null check (source in ('established', 'handover')),
  reason text not null check (length(btrim(reason)) >= 3),
  changed_by uuid references public.app_users(id),
  changed_at timestamptz not null default now(),
  effective_from date not null
);

comment on table public.payment_collection_owners is
  '0489: one Sales Order keeps one collection owner (owner ruling 2026-09-13). Append-only: established from the Delivery Duty holder when collection first became actionable, or a formal handover with full evidence. The current owner is the newest row effective on or before today.';

create index if not exists payment_collection_owners_order_idx
  on public.payment_collection_owners (order_id, effective_from desc, changed_at desc);

alter table public.payment_collection_owners enable row level security;

drop policy if exists payment_collection_owners_read on public.payment_collection_owners;
create policy payment_collection_owners_read on public.payment_collection_owners
  for select using ((select public.is_internal()));
-- RPC-only writes: the two doors below are security definer.
revoke insert, update, delete on public.payment_collection_owners from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2 · establish — the Delivery Duty holder on the first actionable day
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
  v_established int := 0;
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
    if v_holder is null then
      v_unresolved := v_unresolved + 1;
      continue;
    end if;
    insert into public.payment_collection_owners
      (order_id, owner_user_id, previous_owner_user_id, source, reason, changed_by, changed_at, effective_from)
    values
      (v_order, v_holder, null, 'established',
       'Responsible Delivery Operation — the Delivery Duty holder when collection first became actionable',
       null, now(), v_on);
    v_established := v_established + 1;
  end loop;

  return jsonb_build_object(
    'on_date', v_on,
    'holder_user_id', v_holder,
    'established', v_established,
    'kept', v_kept,
    'unresolved', v_unresolved);
end;
$fn$;

comment on function public.payment_collection_owner_establish(uuid[], date) is
  '0489: when collection first becomes actionable, the Delivery Duty NORMAL holder on that day becomes the order''s stable collection owner. Idempotent — an order that has an owner is never touched, so no date change, duty rotation, filter or reload can rotate it. No holder → nothing established (the surface prints `Nobody holds Delivery Duty.`).';

-- ---------------------------------------------------------------------------
-- 3 · formal handover — gated like Staff & Duties, full evidence
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
     where u.id = p_new_owner_user_id
       and u.status = 'active'
       and u.role in ('operation', 'principal')
  ) then
    raise exception 'the new owner must be active Operation staff'
      using errcode = '22023', detail = 'new_owner_not_operation_staff';
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
    (p_order_id, p_new_owner_user_id, v_current, 'handover', btrim(p_reason), v_uid, now(), v_from)
  returning * into v_row;

  return to_jsonb(v_row);
end;
$fn$;

comment on function public.payment_collection_owner_handover(uuid, uuid, text, date) is
  '0489: the FORMAL handover of one order''s collection ownership — principal or manager only (the Staff & Duties gate). Appends previous owner · new owner · reason · changed by · changed on · effective from; nothing is erased.';

-- ---------------------------------------------------------------------------
-- 4 · context — normal owner · today's cover · acting person · history
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
begin
  if not coalesce((select public.is_internal()), false) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_internal';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'order_id', cur.order_id,
      'normal_user_id', cur.owner_user_id,
      'normal_user_name', nu.name,
      'cover_user_id', cv.acting_user_id,
      'cover_user_name', cu.name,
      'acting_user_id', coalesce(cv.acting_user_id, cur.owner_user_id),
      'acting_user_name', coalesce(cu.name, nu.name),
      'is_cover', cv.acting_user_id is not null,
      'cover_ends_on', cv.ends_on,
      'source', cur.source,
      'effective_from', cur.effective_from,
      'established_on', est.effective_from,
      'history', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', h.id,
          'source', h.source,
          'owner_user_id', h.owner_user_id,
          'owner_user_name', ho.name,
          'previous_owner_user_id', h.previous_owner_user_id,
          'previous_owner_user_name', hp.name,
          'reason', h.reason,
          'changed_by', h.changed_by,
          'changed_by_name', hb.name,
          'changed_at', h.changed_at,
          'effective_from', h.effective_from
        ) order by h.effective_from asc, h.changed_at asc)
          from public.payment_collection_owners h
          left join public.app_users ho on ho.id = h.owner_user_id
          left join public.app_users hp on hp.id = h.previous_owner_user_id
          left join public.app_users hb on hb.id = h.changed_by
         where h.order_id = cur.order_id
      ), '[]'::jsonb)
    ))
    from (
      select distinct on (c.order_id) c.order_id, c.owner_user_id, c.source, c.effective_from
        from public.payment_collection_owners c
       where c.order_id = any(coalesce(p_order_ids, '{}'::uuid[]))
         and c.effective_from <= v_on
       order by c.order_id, c.effective_from desc, c.changed_at desc
    ) cur
    left join public.app_users nu on nu.id = cur.owner_user_id
    left join lateral (
      select w.acting_user_id, w.ends_on
        from public.workspace_duty_covers w
       where w.duty_key = 'delivery_duty'
         and w.normal_user_id = cur.owner_user_id
         and v_on between w.starts_on and w.ends_on
       order by w.created_at desc
       limit 1
    ) cv on true
    left join public.app_users cu on cu.id = cv.acting_user_id
    left join lateral (
      select e.effective_from
        from public.payment_collection_owners e
       where e.order_id = cur.order_id and e.source = 'established'
       order by e.effective_from asc, e.changed_at asc
       limit 1
    ) est on true
  ), '[]'::jsonb);
end;
$fn$;

comment on function public.payment_collection_owner_context(uuid[], date) is
  '0489: the one read for an order''s collection ownership — normal owner, today''s buddy cover (the shared delivery_duty cover law keyed by the normal person), the acting person, and the append-only history. Normal owner and today''s cover are distinct facts; cover never rewrites the owner.';

-- ---------------------------------------------------------------------------
-- 5 · grants
-- ---------------------------------------------------------------------------

revoke all on function public.payment_collection_owner_establish(uuid[], date) from public, anon;
grant execute on function public.payment_collection_owner_establish(uuid[], date) to authenticated;
revoke all on function public.payment_collection_owner_handover(uuid, uuid, text, date) from public, anon;
grant execute on function public.payment_collection_owner_handover(uuid, uuid, text, date) to authenticated;
revoke all on function public.payment_collection_owner_context(uuid[], date) from public, anon;
grant execute on function public.payment_collection_owner_context(uuid[], date) to authenticated;

-- ---------------------------------------------------------------------------
-- 6 · sanity — schema only, never a production row count
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regprocedure('public.payment_collection_owner_establish(uuid[], date)') is null
     or to_regprocedure('public.payment_collection_owner_handover(uuid, uuid, text, date)') is null
     or to_regprocedure('public.payment_collection_owner_context(uuid[], date)') is null then
    raise exception '0489: a collection-owner door is missing';
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'payment_collection_owners'
       and policyname = 'payment_collection_owners_read'
  ) then
    raise exception '0489: the read policy is missing';
  end if;
end $$;

commit;
