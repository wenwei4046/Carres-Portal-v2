-- =============================================================================
-- 0002_rls.sql — Row Level Security policies + auth helpers
-- =============================================================================
-- Strategy (per MIGRATION_SPEC §4 + CLAUDE.md §8):
--   - JWT carries user.id only on raw login; the Auth Hook in 0004 enriches it
--     with role + entity ids in app_metadata so policies can read JWT claims
--     directly without querying app_users per row.
--   - All tables RLS-enabled; per-role read/write rules below.
--   - service_role JWT bypasses RLS entirely (used by Hono admin/cron paths).
--   - Every helper call in policy USING/WITH CHECK is wrapped `(select fn())`
--     so PG14+ runs it once per query (InitPlan), not per row.
--   - Helper functions are STABLE so the planner can cache within a query.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper functions (set in `auth` schema so policies can reference them cheaply)
-- -----------------------------------------------------------------------------
create or replace function auth.app_role()
returns app_role
language sql stable security definer as $$
  select role from public.app_users where id = auth.uid()
$$;

create or replace function auth.app_dealer_id()
returns uuid
language sql stable security definer as $$
  select dealer_id from public.app_users where id = auth.uid()
$$;

create or replace function auth.app_supplier_id()
returns uuid
language sql stable security definer as $$
  select supplier_id from public.app_users where id = auth.uid()
$$;

create or replace function auth.app_partner_id()
returns uuid
language sql stable security definer as $$
  select partner_id from public.app_users where id = auth.uid()
$$;

create or replace function auth.is_principal()
returns boolean
language sql stable security definer as $$
  select coalesce((select role from public.app_users where id = auth.uid()) = 'principal', false)
$$;

create or replace function auth.is_internal()
returns boolean
language sql stable security definer as $$
  select coalesce(
    (select role from public.app_users where id = auth.uid()) in
      ('principal','logistics','finance','bd'),
    false
  )
$$;

-- -----------------------------------------------------------------------------
-- Auto-create app_users row on auth.users insert (signup hook)
-- (For dev: you'll usually create app_users explicitly via admin panel.)
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql security definer as $$
begin
  insert into public.app_users (id, email, name, role, status)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', new.email), 'dealer', 'active')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

-- =============================================================================
-- Enable RLS on every table
-- =============================================================================
alter table app_users           enable row level security;
alter table dealers             enable row level security;
alter table outlets             enable row level security;
alter table salespersons        enable row level security;
alter table suppliers           enable row level security;
alter table delivery_partners   enable row level security;
alter table partner_fleet       enable row level security;
alter table warehouses          enable row level security;
alter table product_models      enable row level security;
alter table product_skus        enable row level security;
alter table sofa_fabrics        enable row level security;
alter table addons              enable row level security;
alter table floor_config        enable row level security;
alter table stock_balances      enable row level security;
alter table stock_movements     enable row level security;
alter table orders              enable row level security;
alter table order_lines         enable row level security;
alter table order_addons        enable row level security;
alter table order_history       enable row level security;
alter table purchase_orders     enable row level security;
alter table po_history          enable row level security;
alter table po_receipts         enable row level security;
alter table payments            enable row level security;
alter table invoices            enable row level security;
alter table refunds             enable row level security;
alter table approvals           enable row level security;
alter table audit_log           enable row level security;
alter table inquiries           enable row level security;
alter table bank_statement_lines enable row level security;
alter table announcements       enable row level security;

-- =============================================================================
-- POLICIES — every helper call wrapped in (select ...) for InitPlan caching
-- =============================================================================

-- Catalog/reference: read by everyone, write by principal/logistics
create policy catalog_read_all       on product_models  for select using ((select auth.uid()) is not null);
create policy catalog_write_internal on product_models  for all    using ((select auth.is_internal())) with check ((select auth.is_internal()));

create policy skus_read_all          on product_skus    for select using ((select auth.uid()) is not null);
create policy skus_write_internal    on product_skus    for all    using ((select auth.is_internal())) with check ((select auth.is_internal()));

create policy fabrics_read_all       on sofa_fabrics    for select using ((select auth.uid()) is not null);
create policy fabrics_write_internal on sofa_fabrics    for all    using ((select auth.is_internal())) with check ((select auth.is_internal()));

create policy addons_read_all        on addons          for select using ((select auth.uid()) is not null);
create policy addons_write_internal  on addons          for all    using ((select auth.is_internal())) with check ((select auth.is_internal()));

create policy floor_read_all         on floor_config    for select using ((select auth.uid()) is not null);
create policy floor_write_principal  on floor_config    for all    using ((select auth.is_principal())) with check ((select auth.is_principal()));

create policy warehouses_read_all       on warehouses   for select using ((select auth.uid()) is not null);
create policy warehouses_write_internal on warehouses   for all    using ((select auth.is_internal())) with check ((select auth.is_internal()));

-- app_users: self-read; principal full access
create policy app_users_self_read       on app_users for select using (id = (select auth.uid()) or (select auth.is_principal()));
create policy app_users_principal_write on app_users for all    using ((select auth.is_principal())) with check ((select auth.is_principal()));

-- Dealers · outlets · salespersons
create policy dealers_internal_read on dealers for select using (
  (select auth.is_internal()) or id = (select auth.app_dealer_id())
);
create policy dealers_principal_write on dealers for all using ((select auth.is_principal())) with check ((select auth.is_principal()));

create policy outlets_scoped_read on outlets for select using (
  (select auth.is_internal()) or dealer_id = (select auth.app_dealer_id())
);
create policy outlets_dealer_write on outlets for all using (
  (select auth.is_principal()) or dealer_id = (select auth.app_dealer_id())
) with check (
  (select auth.is_principal()) or dealer_id = (select auth.app_dealer_id())
);

create policy salespersons_scoped_read on salespersons for select using (
  (select auth.is_internal()) or dealer_id = (select auth.app_dealer_id())
);
create policy salespersons_dealer_write on salespersons for all using (
  (select auth.is_principal()) or dealer_id = (select auth.app_dealer_id())
) with check (
  (select auth.is_principal()) or dealer_id = (select auth.app_dealer_id())
);

-- Suppliers · delivery_partners · fleet
create policy suppliers_read on suppliers for select using (
  (select auth.is_internal()) or id = (select auth.app_supplier_id())
);
create policy suppliers_principal_write on suppliers for all using ((select auth.is_principal())) with check ((select auth.is_principal()));

create policy partners_read on delivery_partners for select using (
  (select auth.is_internal()) or id = (select auth.app_partner_id())
);
create policy partners_principal_write on delivery_partners for all using ((select auth.is_principal())) with check ((select auth.is_principal()));

create policy fleet_read on partner_fleet for select using (
  (select auth.is_internal()) or partner_id = (select auth.app_partner_id())
);
create policy fleet_partner_write on partner_fleet for all using (
  (select auth.is_principal()) or partner_id = (select auth.app_partner_id())
) with check (
  (select auth.is_principal()) or partner_id = (select auth.app_partner_id())
);

-- Stock
create policy stock_balances_read on stock_balances for select using ((select auth.is_internal()));
create policy stock_balances_write_logistics on stock_balances for all using (
  (select auth.app_role()) in ('logistics','principal')
) with check (
  (select auth.app_role()) in ('logistics','principal')
);

create policy stock_movements_read on stock_movements for select using ((select auth.is_internal()));
create policy stock_movements_insert_logistics on stock_movements for insert with check (
  (select auth.app_role()) in ('logistics','principal')
);

-- Orders + lines + history
create policy orders_scoped_read on orders for select using (
  (select auth.is_internal())
  or dealer_id = (select auth.app_dealer_id())
  or delivery_partner_id = (select auth.app_partner_id())
);
create policy orders_dealer_insert on orders for insert with check (
  (select auth.is_principal())
  or (select auth.app_role()) in ('logistics','finance','bd')
  or dealer_id = (select auth.app_dealer_id())
);
create policy orders_dealer_update on orders for update using (
  (select auth.is_principal())
  or (select auth.app_role()) in ('logistics','finance','bd')
  or dealer_id = (select auth.app_dealer_id())
  or delivery_partner_id = (select auth.app_partner_id())
);

create policy order_lines_scoped on order_lines for all using (
  exists (
    select 1 from orders o where o.id = order_lines.order_id
    and ((select auth.is_internal())
         or o.dealer_id = (select auth.app_dealer_id())
         or o.delivery_partner_id = (select auth.app_partner_id()))
  )
) with check (
  exists (
    select 1 from orders o where o.id = order_lines.order_id
    and ((select auth.is_internal()) or o.dealer_id = (select auth.app_dealer_id()))
  )
);

create policy order_addons_scoped on order_addons for all using (
  exists (
    select 1 from orders o where o.id = order_addons.order_id
    and ((select auth.is_internal())
         or o.dealer_id = (select auth.app_dealer_id())
         or o.delivery_partner_id = (select auth.app_partner_id()))
  )
) with check (
  exists (
    select 1 from orders o where o.id = order_addons.order_id
    and ((select auth.is_internal()) or o.dealer_id = (select auth.app_dealer_id()))
  )
);

create policy order_history_scoped_read on order_history for select using (
  exists (
    select 1 from orders o where o.id = order_history.order_id
    and ((select auth.is_internal())
         or o.dealer_id = (select auth.app_dealer_id())
         or o.delivery_partner_id = (select auth.app_partner_id()))
  )
);
create policy order_history_insert on order_history for insert with check ((select auth.uid()) is not null);

-- Purchase orders
create policy po_scoped_read on purchase_orders for select using (
  (select auth.is_internal())
  or supplier_id  = (select auth.app_supplier_id())
  or delivery_partner_id = (select auth.app_partner_id())
);
create policy po_logistics_insert on purchase_orders for insert with check (
  (select auth.app_role()) in ('logistics','principal')
);
create policy po_scoped_update on purchase_orders for update using (
  (select auth.is_principal())
  or (select auth.app_role()) in ('logistics','finance')
  or supplier_id = (select auth.app_supplier_id())
  or delivery_partner_id = (select auth.app_partner_id())
);

create policy po_history_read on po_history for select using (
  exists (
    select 1 from purchase_orders p where p.id = po_history.po_id
    and ((select auth.is_internal())
         or p.supplier_id = (select auth.app_supplier_id())
         or p.delivery_partner_id = (select auth.app_partner_id()))
  )
);
create policy po_history_insert on po_history for insert with check ((select auth.uid()) is not null);

create policy po_receipts_read on po_receipts for select using (
  exists (
    select 1 from purchase_orders p where p.id = po_receipts.po_id
    and ((select auth.is_internal())
         or p.supplier_id = (select auth.app_supplier_id()))
  )
);
create policy po_receipts_logistics_insert on po_receipts for insert with check (
  (select auth.app_role()) in ('logistics','principal')
);

-- Payments · Invoices · Refunds
create policy payments_scoped_read on payments for select using (
  (select auth.is_internal())
  or exists (select 1 from orders o where o.id = payments.order_id and o.dealer_id = (select auth.app_dealer_id()))
);
create policy payments_write_finance on payments for all using (
  (select auth.app_role()) in ('finance','principal')
) with check (
  (select auth.app_role()) in ('finance','principal')
);

create policy invoices_scoped_read on invoices for select using (
  (select auth.is_internal())
  or exists (select 1 from orders o where o.id = invoices.order_id and o.dealer_id = (select auth.app_dealer_id()))
);
create policy invoices_write_finance on invoices for all using (
  (select auth.app_role()) in ('finance','principal')
) with check (
  (select auth.app_role()) in ('finance','principal')
);

create policy refunds_scoped_read on refunds for select using (
  (select auth.is_internal())
  or exists (select 1 from orders o where o.id = refunds.order_id and o.dealer_id = (select auth.app_dealer_id()))
);
create policy refunds_write_finance on refunds for all using (
  (select auth.app_role()) in ('finance','principal')
) with check (
  (select auth.app_role()) in ('finance','principal')
);

-- Approvals · audit log · inquiries · announcements · bank statements
create policy approvals_internal_read    on approvals for select using ((select auth.is_internal()));
create policy approvals_internal_insert  on approvals for insert with check ((select auth.is_internal()));
create policy approvals_principal_decide on approvals for update using ((select auth.is_principal())) with check ((select auth.is_principal()));

create policy audit_internal_read on audit_log for select using ((select auth.is_internal()));
create policy audit_self_insert   on audit_log for insert with check ((select auth.uid()) is not null);

create policy inquiries_internal on inquiries for all using ((select auth.is_internal())) with check ((select auth.is_internal()));

create policy bank_lines_finance on bank_statement_lines for all using ((select auth.app_role()) in ('finance','principal')) with check ((select auth.app_role()) in ('finance','principal'));

create policy announcements_read            on announcements for select using ((select auth.uid()) is not null);
create policy announcements_principal_write on announcements for all using ((select auth.is_principal())) with check ((select auth.is_principal()));
