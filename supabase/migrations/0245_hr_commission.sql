-- 0245_hr_commission — commission config tables + HR RPCs (2026-07-25).
--
-- Scope (Loo, 2026-07-25): commission CALCULATION only — no base payroll, no
-- statutory deductions. Two configurable methods, chosen per outlet (with a
-- store-level default row where outlet_id is null):
--   'percentage' — pct of pure item revenue (order_lines only; order_addons —
--                  delivery / dispose-* service fees — are excluded by design).
--                  Manager tier earns an override = (manager pct − rep pct) on
--                  subordinate sales; their own sales pay their own pct.
--   'per_model'  — per-unit RM amount per product model + per-model volume tier
--                  bonuses (highest reached threshold pays) + overall quantity
--                  milestones (optional category filter, highest reached pays).
--
-- All tables are HR-owned config: RLS deny-all except role in ('hr','principal').
-- Commission math itself is the pure computeCommission engine in @carres/shared;
-- hr_commission_source() only hands the gated raw month slice to Hono.
-- Additive + dormant: zero config rows -> every report totals RM0.

-- ── config tables ────────────────────────────────────────────────────────────

create table public.commission_scheme_config (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  outlet_id uuid references public.outlets(id) on delete cascade,
  method text not null check (method in ('percentage', 'per_model')),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create unique index commission_scheme_store_default_uq
  on public.commission_scheme_config (dealer_id) where outlet_id is null;
create unique index commission_scheme_outlet_uq
  on public.commission_scheme_config (dealer_id, outlet_id) where outlet_id is not null;

-- effective-dated so a rate change never rewrites an already-reported month
create table public.staff_commission_rates (
  id uuid primary key default gen_random_uuid(),
  salesperson_id uuid not null references public.salespersons(id) on delete cascade,
  pct numeric(5, 2) not null check (pct >= 0 and pct <= 100),
  effective_from date not null default current_date,
  created_at timestamptz not null default now(),
  updated_by uuid,
  unique (salesperson_id, effective_from)
);
create index staff_commission_rates_sp_idx
  on public.staff_commission_rates (salesperson_id, effective_from desc);

create table public.model_commission_rates (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null unique references public.product_models(id) on delete cascade,
  per_unit_amount numeric(10, 2) not null check (per_unit_amount >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.model_commission_tiers (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.product_models(id) on delete cascade,
  threshold_qty int not null check (threshold_qty > 0),
  bonus_amount numeric(10, 2) not null check (bonus_amount >= 0),
  unique (model_id, threshold_qty)
);

create table public.commission_milestones (
  id uuid primary key default gen_random_uuid(),
  category text, -- null = every item category counts; else a product_category value
  threshold_qty int not null check (threshold_qty > 0),
  bonus_amount numeric(10, 2) not null check (bonus_amount >= 0)
);

-- ── RLS: hr + principal only ─────────────────────────────────────────────────

alter table public.commission_scheme_config enable row level security;
alter table public.staff_commission_rates enable row level security;
alter table public.model_commission_rates enable row level security;
alter table public.model_commission_tiers enable row level security;
alter table public.commission_milestones enable row level security;

create policy commission_scheme_hr_rw on public.commission_scheme_config
  for all
  using ((select public.app_role()) in ('hr', 'principal'))
  with check ((select public.app_role()) in ('hr', 'principal'));

create policy staff_rates_hr_rw on public.staff_commission_rates
  for all
  using ((select public.app_role()) in ('hr', 'principal'))
  with check ((select public.app_role()) in ('hr', 'principal'));

create policy model_rates_hr_rw on public.model_commission_rates
  for all
  using ((select public.app_role()) in ('hr', 'principal'))
  with check ((select public.app_role()) in ('hr', 'principal'));

create policy model_tiers_hr_rw on public.model_commission_tiers
  for all
  using ((select public.app_role()) in ('hr', 'principal'))
  with check ((select public.app_role()) in ('hr', 'principal'));

create policy milestones_hr_rw on public.commission_milestones
  for all
  using ((select public.app_role()) in ('hr', 'principal'))
  with check ((select public.app_role()) in ('hr', 'principal'));

-- ── hr_commission_source: the gated month slice ──────────────────────────────
-- One jsonb blob: showroom-channel staff roster, the month's product lines
-- (service-category lines excluded — pure item revenue only), the unattributed
-- worklist, and every config table. HR gets ONLY this projection of order data.

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

-- ── hr_assign_salesperson: close the attribution gap, audited ────────────────
-- Attribution drives money (commission), so the change is never silent:
-- order_history + audit_log both get a row (guardrail #4).

create or replace function public.hr_assign_salesperson(p_order_id uuid, p_salesperson_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_sp salespersons%rowtype;
begin
  if (select public.app_role()) not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found';
  end if;

  select * into v_sp from salespersons
  where id = p_salesperson_id and dealer_id = v_order.dealer_id and active;
  if not found then
    raise exception 'salesperson_mismatch';
  end if;

  update orders set salesperson_id = p_salesperson_id where id = p_order_id;

  insert into order_history (order_id, text, by_role, by_user_id)
  values (p_order_id,
          format('Commission attribution · %s', v_sp.name),
          (select public.app_role()), auth.uid());

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ((select public.app_role()),
          (select name from app_users where id = auth.uid()),
          format('HR attributed SO-%s to %s', v_order.so, v_sp.name),
          v_order.dealer_id,
          'SO-' || v_order.so::text);
end;
$$;
