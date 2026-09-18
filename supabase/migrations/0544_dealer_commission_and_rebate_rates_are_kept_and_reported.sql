-- =============================================================================
-- 0544_dealer_commission_and_rebate_rates_are_kept_and_reported.sql
-- =============================================================================
-- WHAT THIS ADDS (KL Gateway meeting, 18 Sep 2026; YH's notes)
--   Dealer commission and the renovation rebate as RATES Finance keeps, plus
--   one read for a report. Nothing here is owed, posted or stored as a balance:
--   CLAUDE.md §7 (no HQ -> dealer credit or debt) is not amended, so a payout
--   still goes through a direct payment voucher. No gl_post, no payable, no
--   bill, no run, no close.
--
--   1. dealer_commission_settings: one row. The default commission rate (25).
--   2. dealer_commission_rates: a product model that earns a different rate
--      (e.g. 20). Seeded empty; Finance adds the products on screen.
--   3. dealer_rebate_quotas: each dealer's renovation quota, its rebate rate
--      (default 5) and the date it starts counting collections from. The quota left is
--      never stored: the report works it out month by month from collections.
--   4. dealer_commission_source(p_month): the dealer-channel orders that have
--      money collected by the end of that month, with their lines, add-on
--      total and collections, plus the three tables above. The arithmetic is
--      packages/shared/src/dealer-commission.ts (one place).
--
-- NOT the HR commission engine (0245 / 0272, docs/hr/MASTER.md §4): that
--   engine pays showroom staff, freezes a month at close and keeps runs. This
--   is a read-only report over dealer money with no close, so it shares no
--   run and freezes nothing.
--
-- RLS: the three new tables are read and written by finance and principal
--   only (gl_may_read, NULL-safe). No existing policy changes.
-- DATA: the one settings row (25). No product rows, no quotas.
-- DR/CR: none.
-- =============================================================================

begin;

create table public.dealer_commission_settings (
  id            boolean primary key default true check (id),
  default_rate  numeric(5,2) not null default 25 check (default_rate between 0 and 100),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.app_users(id) default auth.uid()
);
insert into public.dealer_commission_settings (id) values (true);

create table public.dealer_commission_rates (
  model_id    uuid primary key references public.product_models(id),
  rate        numeric(5,2) not null check (rate between 0 and 100),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.app_users(id) default auth.uid()
);

create table public.dealer_rebate_quotas (
  dealer_id    uuid primary key references public.dealers(id),
  quota        numeric(12,2) not null check (quota >= 0),
  rebate_rate  numeric(5,2) not null default 5 check (rebate_rate between 0 and 100),
  starts_on    date not null,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.app_users(id) default auth.uid()
);

-- Who changed a rate and when, on every write.
create function public.dealer_commission_stamp()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end
$fn$;
create trigger dealer_commission_settings_stamp before update on public.dealer_commission_settings
  for each row execute function public.dealer_commission_stamp();
create trigger dealer_commission_rates_stamp before update on public.dealer_commission_rates
  for each row execute function public.dealer_commission_stamp();
create trigger dealer_rebate_quotas_stamp before update on public.dealer_rebate_quotas
  for each row execute function public.dealer_commission_stamp();

alter table public.dealer_commission_settings enable row level security;
alter table public.dealer_commission_rates    enable row level security;
alter table public.dealer_rebate_quotas       enable row level security;
revoke all on public.dealer_commission_settings, public.dealer_commission_rates,
              public.dealer_rebate_quotas from anon, authenticated;
grant select, update on public.dealer_commission_settings to authenticated;
grant select, insert, update, delete on public.dealer_commission_rates to authenticated;
grant select, insert, update on public.dealer_rebate_quotas to authenticated;
create policy dealer_commission_settings_finance on public.dealer_commission_settings
  for all using ((select public.gl_may_read())) with check ((select public.gl_may_read()));
create policy dealer_commission_rates_finance on public.dealer_commission_rates
  for all using ((select public.gl_may_read())) with check ((select public.gl_may_read()));
create policy dealer_rebate_quotas_finance on public.dealer_rebate_quotas
  for all using ((select public.gl_may_read())) with check ((select public.gl_may_read()));

create function public.dealer_commission_source(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_end date := (date_trunc('month', p_month) + interval '1 month')::date;
begin
  if not coalesce(public.gl_may_read(), false) then
    raise exception 'Finance or Principal only' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'settings', (select jsonb_build_object('defaultRate', s.default_rate)
                   from dealer_commission_settings s),
    'rates', coalesce((
      select jsonb_agg(jsonb_build_object('modelId', r.model_id, 'modelName', pm.name, 'rate', r.rate)
                       order by pm.name)
        from dealer_commission_rates r join product_models pm on pm.id = r.model_id), '[]'::jsonb),
    'quotas', coalesce((
      select jsonb_agg(jsonb_build_object('dealerId', q.dealer_id, 'quota', q.quota,
                                          'rebateRate', q.rebate_rate, 'startsOn', q.starts_on))
        from dealer_rebate_quotas q), '[]'::jsonb),
    'models', coalesce((
      select jsonb_agg(jsonb_build_object('id', pm.id, 'name', pm.name) order by pm.name)
        from product_models pm
       where pm.discontinued_at is null
         and pm.category::text not in ('service', 'guarantee')), '[]'::jsonb),
    'dealers', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by d.name)
        from dealers d where d.channel = 'dealer'), '[]'::jsonb),
    'outlets', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'dealerId', o.dealer_id)
                       order by o.name)
        from outlets o join dealers d on d.id = o.dealer_id and d.channel = 'dealer'), '[]'::jsonb),
    -- Collected = live customer payments that are not storage (the 0351 rule).
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'orderId', ord.id, 'so', ord.so, 'dealerId', ord.dealer_id, 'outletId', ord.outlet_id,
        'addons', (select coalesce(sum(a.qty * a.unit_price), 0)
                     from order_addons a where a.order_id = ord.id),
        'lines', (select coalesce(jsonb_agg(jsonb_build_object(
                           'modelId', m.id, 'category', m.category, 'value', l.qty * l.unit_price)), '[]'::jsonb)
                    from order_lines l
                    left join product_skus sk on sk.sku = l.sku
                    left join product_models m on m.id = sk.model_id
                   where l.order_id = ord.id),
        'payments', (select jsonb_agg(jsonb_build_object('paidOn', op.paid_on, 'amount', op.amount))
                       from order_payments op
                      where op.order_id = ord.id and op.kind <> 'storage'
                        and op.voided_at is null and op.paid_on < v_end)))
        from orders ord
        join dealers d on d.id = ord.dealer_id and d.channel = 'dealer'
       where ord.status <> 'cancelled'
         and exists (select 1 from order_payments op
                      where op.order_id = ord.id and op.kind <> 'storage'
                        and op.voided_at is null and op.paid_on < v_end)), '[]'::jsonb)
  );
end
$fn$;

revoke execute on function public.dealer_commission_source(date) from public, anon;
grant execute on function public.dealer_commission_source(date) to authenticated;
revoke execute on function public.dealer_commission_stamp() from public, anon;

commit;
