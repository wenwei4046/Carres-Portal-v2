-- 0250_bd_commission — BD gets paid by what their dealers sell (2026-07-25, Loo).
--
-- Third commission calculation, joining 0245's two: a BD (app_users role='bd')
-- owns a PORTFOLIO of dealer-channel stores and earns an effective-dated pct
-- of each owned store's monthly PURE item revenue (same formula as the staff
-- percentage method: order_lines only, service-category + addons excluded,
-- status <> 'cancelled'). No per-salesperson attribution needed — the DEALER
-- is the earning unit.
--
-- New: dealers.bd_owner_user_id (nullable, additive — the missing BD↔dealer
-- ownership link) + bd_commission_rates (RLS hr/principal, mirrors
-- staff_commission_rates) + audited hr_assign_dealer_bd + hr_commission_source
-- extended with bdUsers / dealerOrders / config.bdRates (signature unchanged,
-- verified against the live 0246 def). Dormant: no owner + no rate = RM0.

alter table public.dealers
  add column bd_owner_user_id uuid references public.app_users(id) on delete set null;

create table public.bd_commission_rates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  pct numeric(5, 2) not null check (pct >= 0 and pct <= 100),
  effective_from date not null default current_date,
  created_at timestamptz not null default now(),
  updated_by uuid,
  unique (user_id, effective_from)
);
create index bd_commission_rates_user_idx
  on public.bd_commission_rates (user_id, effective_from desc);

alter table public.bd_commission_rates enable row level security;
create policy bd_rates_hr_rw on public.bd_commission_rates
  for all
  using ((select public.app_role()) in ('hr', 'principal'))
  with check ((select public.app_role()) in ('hr', 'principal'));

-- Portfolio assignment is money-bearing -> audited DEFINER RPC, never a raw
-- dealers update (dealers write RLS stays untouched).
create or replace function public.hr_assign_dealer_bd(p_dealer_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dealer dealers%rowtype;
  v_bd_name text;
begin
  if (select public.app_role()) not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_dealer from dealers where id = p_dealer_id for update;
  if not found then
    raise exception 'dealer_not_found';
  end if;
  if v_dealer.channel <> 'dealer' then
    raise exception 'not_a_dealer'; -- showrooms are ours; BD earns on resellers only
  end if;

  if p_user_id is not null then
    select name into v_bd_name from app_users where id = p_user_id and role = 'bd';
    if not found then
      raise exception 'bd_user_mismatch';
    end if;
  end if;

  update dealers set bd_owner_user_id = p_user_id where id = p_dealer_id;

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ((select public.app_role()),
          (select name from app_users where id = auth.uid()),
          case when p_user_id is null
               then format('HR cleared BD owner of %s', v_dealer.name)
               else format('HR assigned %s to BD %s', v_dealer.name, v_bd_name) end,
          p_dealer_id,
          v_dealer.name);
end;
$$;

-- Extend the one gated source RPC (0246 body + bdUsers/dealerOrders/bdRates).
create or replace function public.hr_commission_source(p_year int, p_month int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start date;
  v_end date;
  v_result jsonb;
begin
  if (select public.app_role()) not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_month < 1 or p_month > 12 or p_year < 2020 or p_year > 2100 then
    raise exception 'invalid_month';
  end if;

  v_start := make_date(p_year, p_month, 1);
  v_end := v_start + interval '1 month';

  select jsonb_build_object(
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'staffRole', s.staff_role,
        'active', s.active, 'dealerId', s.dealer_id, 'outletId', s.outlet_id,
        'storeName', d.name, 'outletName', o.name))
      from salespersons s
      join dealers d on d.id = s.dealer_id and d.channel = 'showroom'
      left join outlets o on o.id = s.outlet_id), '[]'::jsonb),
    'models', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pm.id, 'name', pm.name, 'category', pm.category))
      from product_models pm
      where pm.discontinued_at is null
        and pm.category::text <> 'service'), '[]'::jsonb),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'orderId', ord.id, 'so', ord.so, 'placedAt', ord.placed_at,
        'salespersonId', ord.salesperson_id, 'dealerId', ord.dealer_id,
        'outletId', ord.outlet_id, 'modelId', m.id, 'modelName', m.name,
        'category', m.category, 'qty', l.qty, 'unitPrice', l.unit_price))
      from orders ord
      join dealers d on d.id = ord.dealer_id and d.channel = 'showroom'
      join order_lines l on l.order_id = ord.id
      left join product_skus sk on sk.sku = l.sku
      left join product_models m on m.id = sk.model_id
      where ord.placed_at >= v_start and ord.placed_at < v_end
        and ord.status <> 'cancelled'
        and coalesce(m.category::text, '') <> 'service'), '[]'::jsonb),
    'unattributed', coalesce((
      select jsonb_agg(jsonb_build_object(
        'orderId', ord.id, 'so', ord.so, 'placedAt', ord.placed_at,
        'dealerId', ord.dealer_id, 'outletId', ord.outlet_id,
        'storeName', d.name, 'customerName', ord.customer_name,
        'amount', (select coalesce(sum(l2.qty * l2.unit_price), 0)
                   from order_lines l2 where l2.order_id = ord.id)))
      from orders ord
      join dealers d on d.id = ord.dealer_id and d.channel = 'showroom'
      where ord.placed_at >= v_start and ord.placed_at < v_end
        and ord.status <> 'cancelled'
        and ord.salesperson_id is null), '[]'::jsonb),
    'bdUsers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'name', u.name, 'email', u.email))
      from app_users u where u.role = 'bd'), '[]'::jsonb),
    'dealers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'name', d.name, 'status', d.status,
        'bdOwnerUserId', d.bd_owner_user_id))
      from dealers d where d.channel = 'dealer'), '[]'::jsonb),
    'dealerOrders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'orderId', ord.id, 'so', ord.so, 'placedAt', ord.placed_at,
        'dealerId', ord.dealer_id,
        'amount', (
          select coalesce(sum(l.qty * l.unit_price), 0)
          from order_lines l
          left join product_skus sk on sk.sku = l.sku
          left join product_models m on m.id = sk.model_id
          where l.order_id = ord.id
            and coalesce(m.category::text, '') <> 'service')))
      from orders ord
      join dealers d on d.id = ord.dealer_id and d.channel = 'dealer'
      where ord.placed_at >= v_start and ord.placed_at < v_end
        and ord.status <> 'cancelled'), '[]'::jsonb),
    'config', jsonb_build_object(
      'schemes', coalesce((
        select jsonb_agg(jsonb_build_object(
          'dealerId', c.dealer_id, 'outletId', c.outlet_id, 'method', c.method))
        from commission_scheme_config c), '[]'::jsonb),
      'rates', coalesce((
        select jsonb_agg(jsonb_build_object(
          'salespersonId', r.salesperson_id, 'pct', r.pct,
          'effectiveFrom', r.effective_from))
        from staff_commission_rates r), '[]'::jsonb),
      'bdRates', coalesce((
        select jsonb_agg(jsonb_build_object(
          'userId', br.user_id, 'pct', br.pct,
          'effectiveFrom', br.effective_from))
        from bd_commission_rates br), '[]'::jsonb),
      'modelRates', coalesce((
        select jsonb_agg(jsonb_build_object(
          'modelId', mr.model_id, 'perUnitAmount', mr.per_unit_amount))
        from model_commission_rates mr), '[]'::jsonb),
      'modelTiers', coalesce((
        select jsonb_agg(jsonb_build_object(
          'modelId', mt.model_id, 'thresholdQty', mt.threshold_qty,
          'bonusAmount', mt.bonus_amount))
        from model_commission_tiers mt), '[]'::jsonb),
      'milestones', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', ms.id, 'category', ms.category, 'thresholdQty', ms.threshold_qty,
          'bonusAmount', ms.bonus_amount))
        from commission_milestones ms), '[]'::jsonb)))
  into v_result;

  return v_result;
end;
$$;
