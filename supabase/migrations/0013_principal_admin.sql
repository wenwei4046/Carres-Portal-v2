-- 0013_principal_admin.sql
-- Adds Principal-side RPCs (dealer_invite, dealer_set_status, dealer_set_terms,
-- principal_dashboard_summary, dealer_with_stats, dealers_with_stats_list) and
-- an index on audit_log.occurred_at for the Recent Activity tile.
--
-- All RPCs are SECURITY DEFINER with manual is_principal() guard. No RLS changes.
-- SQLSTATE codes follow Phase 2C convention: 42501 forbidden, 42P01 not_found,
-- 22023 invalid_param.

-- Index for Recent Activity tile (audit_log ordered by occurred_at desc).
create index if not exists audit_log_occurred_at_idx on audit_log (occurred_at desc);

-- ----------------------------------------------------------------------------
-- dealer_invite(p_name, p_region, p_contact) -> jsonb
-- Idempotent: if a pending dealer with same (name, region) exists, returns it
-- without creating a duplicate. Otherwise creates dealer (status=pending) +
-- a new_dealer approval row in one tx.
-- ----------------------------------------------------------------------------
create or replace function public.dealer_invite(
  p_name    text,
  p_region  text,
  p_contact text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dealer    dealers;
  v_approval  approvals;
  v_existing  dealers;
  v_actor     text;
begin
  if not public.is_principal() then
    raise exception 'forbidden: principal only' using errcode = '42501';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'name required' using errcode = '22023', detail = 'name_missing';
  end if;
  if p_region is null or btrim(p_region) = '' then
    raise exception 'region required' using errcode = '22023', detail = 'region_missing';
  end if;
  if p_contact is null or btrim(p_contact) = '' then
    raise exception 'contact required' using errcode = '22023', detail = 'contact_missing';
  end if;

  -- Idempotency check: same name + region in pending status returns existing record.
  select * into v_existing
    from dealers
   where status = 'pending'
     and lower(btrim(name)) = lower(btrim(p_name))
     and lower(btrim(region)) = lower(btrim(p_region))
   limit 1;

  if found then
    select * into v_approval
      from approvals
     where kind = 'new_dealer'
       and refers_to = v_existing.id::text
       and status = 'pending'
     limit 1;

    return jsonb_build_object(
      'dealer',   row_to_json(v_existing),
      'approval', row_to_json(v_approval),
      'idempotent', true
    );
  end if;

  insert into dealers (name, region, contact, status)
  values (btrim(p_name), btrim(p_region), btrim(p_contact), 'pending')
  returning * into v_dealer;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Principal');
  insert into approvals (kind, title, actor, refers_to, dealer_id, status, created_by)
  values (
    'new_dealer',
    format('New dealer application · %s', v_dealer.name),
    'HQ · ' || v_actor,
    v_dealer.id::text,
    v_dealer.id,
    'pending',
    auth.uid()
  )
  returning * into v_approval;

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('principal', v_actor, format('Invited dealer · %s', v_dealer.name), v_dealer.id, v_dealer.id::text);

  return jsonb_build_object(
    'dealer',   row_to_json(v_dealer),
    'approval', row_to_json(v_approval),
    'idempotent', false
  );
end;
$$;

revoke all on function public.dealer_invite(text, text, text) from public;
grant execute on function public.dealer_invite(text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- dealer_set_status(p_dealer_id, p_new_status, p_reason) -> dealers
-- Suspend / reactivate. Same-status update is a no-op (returns existing row).
-- ----------------------------------------------------------------------------
create or replace function public.dealer_set_status(
  p_dealer_id  uuid,
  p_new_status dealer_status,
  p_reason     text default null
)
returns dealers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dealer dealers;
  v_actor  text;
begin
  if not public.is_principal() then
    raise exception 'forbidden: principal only' using errcode = '42501';
  end if;

  if p_new_status not in ('active', 'suspended') then
    raise exception 'set_status only for active|suspended (use approval_decide for pending->active)'
      using errcode = '22023', detail = 'invalid_status';
  end if;

  select * into v_dealer from dealers where id = p_dealer_id;
  if not found then
    raise exception 'dealer not found' using errcode = '42P01';
  end if;

  if v_dealer.status = p_new_status then
    return v_dealer;
  end if;

  update dealers set status = p_new_status, updated_at = now()
   where id = p_dealer_id
   returning * into v_dealer;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Principal');
  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values (
    'principal',
    v_actor,
    format('%s dealer · %s%s',
      case p_new_status when 'suspended' then 'Suspended' when 'active' then 'Reactivated' else 'Updated' end,
      v_dealer.name,
      case when p_reason is not null and btrim(p_reason) <> '' then ' (' || p_reason || ')' else '' end),
    p_dealer_id,
    p_dealer_id::text
  );

  return v_dealer;
end;
$$;

revoke all on function public.dealer_set_status(uuid, dealer_status, text) from public;
grant execute on function public.dealer_set_status(uuid, dealer_status, text) to authenticated;

-- ----------------------------------------------------------------------------
-- dealer_set_terms(p_dealer_id, p_credit_limit, p_payment_terms) -> dealers
-- ----------------------------------------------------------------------------
create or replace function public.dealer_set_terms(
  p_dealer_id     uuid,
  p_credit_limit  numeric,
  p_payment_terms text
)
returns dealers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dealer dealers;
  v_actor  text;
begin
  if not public.is_principal() then
    raise exception 'forbidden: principal only' using errcode = '42501';
  end if;
  if p_credit_limit is null or p_credit_limit < 0 then
    raise exception 'credit_limit must be >= 0' using errcode = '22023', detail = 'invalid_credit_limit';
  end if;
  if p_payment_terms not in ('NET 14','NET 30','NET 60','COD') then
    raise exception 'payment_terms must be NET 14|NET 30|NET 60|COD'
      using errcode = '22023', detail = 'invalid_terms';
  end if;

  update dealers
     set credit_limit = p_credit_limit,
         payment_terms = p_payment_terms,
         updated_at = now()
   where id = p_dealer_id
   returning * into v_dealer;
  if not found then
    raise exception 'dealer not found' using errcode = '42P01';
  end if;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Principal');
  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('principal', v_actor, format('Updated terms · %s', v_dealer.name), p_dealer_id, p_dealer_id::text);

  return v_dealer;
end;
$$;

revoke all on function public.dealer_set_terms(uuid, numeric, text) from public;
grant execute on function public.dealer_set_terms(uuid, numeric, text) to authenticated;

-- ----------------------------------------------------------------------------
-- principal_dashboard_summary() -> jsonb
-- One round-trip for KPI strip + leaderboard + pending approvals + audit recent.
-- Uses lateral joins for per-dealer stats (no N+1).
-- ----------------------------------------------------------------------------
create or replace function public.principal_dashboard_summary()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_kpis              jsonb;
  v_leaderboard       jsonb;
  v_pending_approvals jsonb;
  v_audit_recent      jsonb;
  v_alerts            jsonb;
begin
  if not public.is_principal() then
    raise exception 'forbidden: principal only' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total_gmv',          coalesce((select sum(unit_price * qty) from order_lines), 0)
                          + coalesce((select sum(unit_price * qty) from order_addons), 0),
    'active_orders',      (select count(*) from orders where status not in ('delivered','cancelled')),
    'active_dealers',     (select count(*) from dealers where status = 'active'),
    'total_dealers',      (select count(*) from dealers where status <> 'rejected'),
    'pending_approvals',  (select count(*) from approvals where status = 'pending' and kind <> 'discount'),
    'low_stock_skus',     0
  )
  into v_kpis;

  select coalesce(jsonb_agg(row_to_json(t) order by t.gmv desc), '[]'::jsonb) into v_leaderboard
  from (
    select d.id, d.name, d.region, d.status,
           coalesce(s.order_count, 0) as order_count,
           coalesce(s.gmv, 0)         as gmv
      from dealers d
      left join lateral (
        select count(*)                                     as order_count,
               coalesce(sum(line_total + addon_total), 0)   as gmv
          from orders o
          left join lateral (
            select coalesce(sum(unit_price * qty), 0) as line_total
              from order_lines where order_id = o.id
          ) ol on true
          left join lateral (
            select coalesce(sum(unit_price * qty), 0) as addon_total
              from order_addons where order_id = o.id
          ) oa on true
          where o.dealer_id = d.id
      ) s on true
      where d.status <> 'rejected'
      order by gmv desc
      limit 4
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_pending_approvals
  from (
    select id, kind, title, actor, refers_to, amount, dealer_id, created_at
      from approvals
     where status = 'pending' and kind <> 'discount'
     order by created_at desc
     limit 4
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_audit_recent
  from (
    select id, role, actor_text, action, dealer_id, ref, occurred_at
      from audit_log
     order by occurred_at desc
     limit 5
  ) t;

  select jsonb_build_object(
    'suspended_dealers', (select count(*) from dealers where status = 'suspended'),
    'low_stock',         '[]'::jsonb
  )
  into v_alerts;

  return jsonb_build_object(
    'kpis',              v_kpis,
    'leaderboard',       v_leaderboard,
    'pending_approvals', v_pending_approvals,
    'audit_recent',      v_audit_recent,
    'alerts',            v_alerts
  );
end;
$$;

revoke all on function public.principal_dashboard_summary() from public;
grant execute on function public.principal_dashboard_summary() to authenticated;

-- ----------------------------------------------------------------------------
-- Helper RPCs used by /api/principal/dealers route (list + detail)
-- ----------------------------------------------------------------------------
create or replace function public.dealer_with_stats(p_id uuid)
returns setof dealers
language sql security definer stable as $$
  select * from dealers where id = p_id;
$$;

revoke all on function public.dealer_with_stats(uuid) from public;
grant execute on function public.dealer_with_stats(uuid) to authenticated;

create or replace function public.dealers_with_stats_list()
returns table (
  id uuid, name text, region text, contact text, status dealer_status,
  joined_date date, credit_limit numeric, payment_terms text, deposit_balance numeric,
  order_count bigint, gmv numeric, outstanding numeric
)
language sql security definer stable as $$
  select d.id, d.name, d.region, d.contact, d.status, d.joined_date,
         d.credit_limit, d.payment_terms, d.deposit_balance,
         coalesce(s.order_count, 0)::bigint,
         coalesce(s.gmv, 0)::numeric,
         coalesce(s.outstanding, 0)::numeric
    from dealers d
    left join lateral (
      select count(*) as order_count,
             coalesce(sum(line_total + addon_total), 0) as gmv,
             coalesce(sum(greatest(0, (line_total + addon_total) - o.paid)), 0) as outstanding
        from orders o
        left join lateral (select coalesce(sum(unit_price * qty), 0) as line_total
                             from order_lines where order_id = o.id) ol on true
        left join lateral (select coalesce(sum(unit_price * qty), 0) as addon_total
                             from order_addons where order_id = o.id) oa on true
        where o.dealer_id = d.id
    ) s on true
    where d.status <> 'rejected'
    order by d.name;
$$;

revoke all on function public.dealers_with_stats_list() from public;
grant execute on function public.dealers_with_stats_list() to authenticated;
