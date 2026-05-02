-- =============================================================================
-- 0001_init.sql — Carres Operations Portal · initial schema
-- =============================================================================
-- Source of truth: /MIGRATION_SPEC.md §3.
-- Apply with: `supabase db push` (after `supabase init` + linking project).
-- =============================================================================

-- Required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- =============================================================================
-- ENUM types
-- =============================================================================
create type app_role as enum (
  'principal','dealer','salesperson','showroom',
  'logistics','supplier','partner','finance','bd'
);

create type user_status            as enum ('active','invited','disabled');
create type dealer_status          as enum ('active','suspended','pending');
create type supplier_kind          as enum ('own_logistics','factory_pickup');
create type product_category       as enum ('mattress','bedframe','sofa');
create type variant_kind           as enum ('size','preset','part');
create type stock_movement_kind    as enum ('in','out','adjust');
create type order_status           as enum ('place','proceed_order','delivered','cancelled');
create type logistics_stage        as enum ('awaiting_stock','ready_to_dispatch','dispatched','delivered');
create type partner_delivery_stage as enum ('assigned','picked_from_wh','en_route','delivered');
create type po_status              as enum ('open','received','cancelled');
create type po_sup_status          as enum (
  'pending','acknowledged','in_production',
  'shipped','delivered',
  'ready_for_pickup','pickup_assigned','pickup_accepted','picked_up','reassign_needed'
);
create type po_pay_status          as enum ('unpaid','scheduled','paid');
create type payment_method         as enum (
  'cash','bank_transfer','cheque','credit_card','debit_card','duitnow_qr','dealer_deposit'
);
create type payment_dir            as enum ('in','out');
create type refund_status          as enum ('pending','approved','rejected','paid');
create type approval_kind          as enum (
  'refund','discount','new_dealer','top_up','price_change','other'
);
create type approval_status        as enum ('pending','approved','rejected');
create type inquiry_kind           as enum ('new_dealer','expansion','product');
create type inquiry_stage          as enum ('new','contacted','qualified','converted','lost');

-- =============================================================================
-- 3.2 dealers · 3.3 outlets · 3.4 salespersons
-- =============================================================================
create table dealers (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  region          text,
  contact         text,
  joined_date     date,
  status          dealer_status not null default 'pending',
  credit_limit    numeric(12,2) not null default 0,
  payment_terms   text,
  deposit_balance numeric(12,2) not null default 0,
  channel         text not null default 'dealer',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table outlets (
  id          uuid primary key default gen_random_uuid(),
  dealer_id   uuid not null references dealers(id) on delete cascade,
  name        text not null,
  address     text not null,
  created_at  timestamptz not null default now()
);
create index outlets_dealer_idx on outlets(dealer_id);

create table salespersons (
  id          uuid primary key default gen_random_uuid(),
  dealer_id   uuid not null references dealers(id) on delete cascade,
  outlet_id   uuid references outlets(id) on delete set null,
  name        text not null,
  phone       text,
  user_id     uuid,
  created_at  timestamptz not null default now()
);
create index salespersons_dealer_idx on salespersons(dealer_id);

-- =============================================================================
-- 3.5 suppliers · 3.6 delivery_partners + fleet · 3.7 warehouses
-- =============================================================================
create table suppliers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  contact      text,
  lead_time    text,
  kind         supplier_kind not null,
  cat_covered  text[] not null default '{}',
  created_at   timestamptz not null default now()
);

create table delivery_partners (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  contact        text,
  zones          text,
  onboarded_date date,
  rate_card      jsonb,
  created_at     timestamptz not null default now()
);

create table partner_fleet (
  id              uuid primary key default gen_random_uuid(),
  partner_id      uuid not null references delivery_partners(id) on delete cascade,
  plate           text not null,
  vehicle_type    text not null,
  capacity        text,
  driver_name     text,
  driver_phone    text,
  created_at      timestamptz not null default now()
);
create index partner_fleet_partner_idx on partner_fleet(partner_id);

create table warehouses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  address     text,
  created_at  timestamptz not null default now()
);

-- =============================================================================
-- 3.1 app_users (auth mirror) — created here so other tables can FK to it
-- =============================================================================
create table app_users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null unique,
  name          text not null,
  role          app_role not null,
  title         text,
  status        user_status not null default 'invited',
  dealer_id     uuid references dealers(id),
  outlet_id     uuid references outlets(id),
  supplier_id   uuid references suppliers(id),
  partner_id    uuid references delivery_partners(id),
  created_by    uuid references app_users(id),
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index app_users_role_idx       on app_users(role);
create index app_users_dealer_id_idx  on app_users(dealer_id);

alter table salespersons
  add constraint salespersons_user_id_fkey
  foreign key (user_id) references app_users(id) on delete set null;

-- =============================================================================
-- 3.8 catalog (product_models · product_skus · sofa_fabrics)
-- =============================================================================
create table product_models (
  id              uuid primary key default gen_random_uuid(),
  category        product_category not null,
  model_key       text not null,
  name            text not null,
  blurb           text,
  colors          text[],
  gaps            text[],
  sofa_mode       text check (sofa_mode in ('preset','custom','both')),
  discontinued_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (category, model_key)
);

create table product_skus (
  id            uuid primary key default gen_random_uuid(),
  model_id      uuid not null references product_models(id) on delete cascade,
  sku           text not null unique,
  variant       text not null,
  variant_kind  variant_kind not null,
  price         numeric(12,2) not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index product_skus_model_idx on product_skus(model_id);

create table sofa_fabrics (
  id          uuid primary key default gen_random_uuid(),
  model_id    uuid not null references product_models(id) on delete cascade,
  fabric_name text not null,
  surcharge   numeric(12,2) not null default 0,
  unique (model_id, fabric_name)
);

-- =============================================================================
-- 3.9 addons + floor_config
-- =============================================================================
create table addons (
  key        text primary key,
  name       text not null,
  price      numeric(12,2) not null,
  active     boolean not null default true
);

create table floor_config (
  id                  int primary key default 1,
  free_up_to_floor    int not null default 2,
  per_floor_per_item  numeric(12,2) not null default 50,
  updated_at          timestamptz not null default now(),
  check (id = 1)
);

-- =============================================================================
-- 3.10 stock_balances + stock_movements
-- =============================================================================
create table stock_balances (
  sku          text not null,
  warehouse_id uuid not null references warehouses(id) on delete cascade,
  qty          int  not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (sku, warehouse_id)
);

create table stock_movements (
  id            uuid primary key default gen_random_uuid(),
  sku           text not null,
  warehouse_id  uuid not null references warehouses(id),
  qty           int  not null,
  kind          stock_movement_kind not null,
  ref           text,
  note          text,
  by_role       app_role,
  by_user_id    uuid references app_users(id),
  occurred_at   timestamptz not null default now()
);
create index stock_movements_sku_idx on stock_movements(sku);
create index stock_movements_at_idx  on stock_movements(occurred_at desc);

-- =============================================================================
-- 3.11 orders · order_lines · order_addons · order_history
-- =============================================================================
create sequence orders_dl_seq start 1251;

create table orders (
  id                       uuid primary key default gen_random_uuid(),
  dl                       int not null unique default nextval('orders_dl_seq'),
  status                   order_status not null default 'place',
  channel                  text not null default 'dealer',

  dealer_id                uuid not null references dealers(id),
  outlet_id                uuid references outlets(id),
  salesperson_id           uuid references salespersons(id),

  customer_name            text not null,
  customer_phone           text,
  customer_address         text,
  customer_address_unknown boolean not null default false,
  customer_billing         text,
  customer_billing_same    boolean not null default true,
  customer_emergency       text,

  delivery_date            date,
  delivery_date_tbd        boolean not null default false,
  delivery_floor           int not null default 1,
  delivery_has_lift        boolean not null default false,

  paid                     numeric(12,2) not null default 0,
  signature_url            text,
  terms_accepted           boolean not null default false,

  logistics_stage          logistics_stage,
  warehouse_id             uuid references warehouses(id),
  delivery_partner_id      uuid references delivery_partners(id),
  partner_stage            partner_delivery_stage,
  partner_picked_at        timestamptz,
  partner_eta              text,
  do_number                text,
  do_note                  text,

  invoice_no               text,
  invoiced_at              date,

  placed_at                timestamptz not null default now(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index orders_dealer_idx     on orders(dealer_id);
create index orders_status_idx     on orders(status);
create index orders_logistics_idx  on orders(logistics_stage);
create index orders_partner_idx    on orders(delivery_partner_id);

create table order_lines (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders(id) on delete cascade,
  sku          text not null,
  qty          int  not null check (qty > 0),
  attrs        jsonb,
  unit_price   numeric(12,2) not null,
  created_at   timestamptz not null default now()
);
create index order_lines_order_idx on order_lines(order_id);

create table order_addons (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders(id) on delete cascade,
  addon_key    text not null references addons(key),
  qty          int  not null default 1,
  unit_price   numeric(12,2) not null
);
create index order_addons_order_idx on order_addons(order_id);

create table order_history (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  text        text not null,
  by_role     app_role,
  by_user_id  uuid references app_users(id),
  occurred_at timestamptz not null default now()
);
create index order_history_order_idx on order_history(order_id, occurred_at desc);

-- =============================================================================
-- 3.12 purchase_orders · po_history · po_receipts
-- =============================================================================
create table purchase_orders (
  id                    text primary key,
  dl                    int references orders(dl),
  supplier_id           uuid not null references suppliers(id),
  warehouse_id          uuid not null references warehouses(id),
  sku                   text not null,
  qty                   int not null check (qty > 0),
  status                po_status not null default 'open',
  sup_status            po_sup_status not null default 'pending',
  delivery_partner_id   uuid references delivery_partners(id),
  expected_ready_date   date,
  pickup_date           date,
  eta_date              date,
  customer_rejection    jsonb,
  pay_status            po_pay_status not null default 'unpaid',
  placed_at             timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index po_supplier_idx     on purchase_orders(supplier_id);
create index po_warehouse_idx    on purchase_orders(warehouse_id);
create index po_partner_idx      on purchase_orders(delivery_partner_id);

create table po_history (
  id          uuid primary key default gen_random_uuid(),
  po_id       text not null references purchase_orders(id) on delete cascade,
  text        text not null,
  by_role     app_role,
  by_user_id  uuid references app_users(id),
  occurred_at timestamptz not null default now()
);
create index po_history_po_idx on po_history(po_id, occurred_at desc);

create table po_receipts (
  id              uuid primary key default gen_random_uuid(),
  po_id           text not null references purchase_orders(id) on delete cascade,
  do_number       text not null,
  do_note         text,
  received_qty    int  not null,
  do_photo_url    text,
  received_at     timestamptz not null default now(),
  received_by     uuid references app_users(id)
);

-- =============================================================================
-- 3.14 approvals (declared early; refunds FK to it)
-- =============================================================================
create table approvals (
  id            uuid primary key default gen_random_uuid(),
  kind          approval_kind not null,
  title         text not null,
  actor         text,
  refers_to     text,
  amount        numeric(12,2),
  dealer_id     uuid references dealers(id),
  reason        text,
  payload       jsonb,
  status        approval_status not null default 'pending',
  decided_at    timestamptz,
  decided_by    uuid references app_users(id),
  decision_note text,
  created_at    timestamptz not null default now(),
  created_by    uuid references app_users(id)
);
create index approvals_status_idx on approvals(status);

-- =============================================================================
-- 3.13 payments · invoices · refunds
-- =============================================================================
create table payments (
  id              uuid primary key default gen_random_uuid(),
  direction       payment_dir not null,
  amount          numeric(12,2) not null,
  method          payment_method not null,
  reference       text,
  note            text,
  paid_at         date not null,
  order_id        uuid references orders(id),
  po_id           text references purchase_orders(id),
  refund_id       uuid,
  receipt_url     text,
  recorded_by     uuid references app_users(id),
  created_at      timestamptz not null default now()
);
create index payments_order_idx  on payments(order_id);
create index payments_po_idx     on payments(po_id);

create table invoices (
  id            uuid primary key default gen_random_uuid(),
  invoice_no    text not null unique,
  order_id      uuid not null references orders(id),
  amount        numeric(12,2) not null,
  tax_amount    numeric(12,2) not null default 0,
  issued_at     date not null,
  voided_at     date,
  pdf_url       text,
  created_at    timestamptz not null default now()
);
create index invoices_order_idx on invoices(order_id);

create table refunds (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id),
  dealer_id       uuid references dealers(id),
  amount          numeric(12,2) not null,
  reason          text,
  status          refund_status not null default 'pending',
  approval_id     uuid references approvals(id),
  approved_at     timestamptz,
  paid_at         timestamptz,
  credit_note_no  text,
  created_at      timestamptz not null default now()
);
create index refunds_order_idx on refunds(order_id);

alter table payments
  add constraint payments_refund_id_fkey
  foreign key (refund_id) references refunds(id) on delete set null;

-- =============================================================================
-- 3.15 audit_log
-- =============================================================================
create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  role        app_role,
  actor_text  text,
  action      text not null,
  dealer_id   uuid references dealers(id),
  ref         text,
  occurred_at timestamptz not null default now()
);
create index audit_log_at_idx on audit_log(occurred_at desc);

-- =============================================================================
-- 3.16 inquiries
-- =============================================================================
create table inquiries (
  id                uuid primary key default gen_random_uuid(),
  kind              inquiry_kind not null,
  company           text not null,
  region            text,
  contact           text,
  stage             inquiry_stage not null default 'new',
  owner_user_id     uuid references app_users(id),
  note              text,
  linked_dealer_id  uuid references dealers(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index inquiries_stage_idx on inquiries(stage);

-- =============================================================================
-- 3.17 bank_statement_lines (recon)
-- =============================================================================
create table bank_statement_lines (
  id                  uuid primary key default gen_random_uuid(),
  posted_at           date not null,
  description         text,
  amount              numeric(12,2) not null,
  matched_payment_id  uuid references payments(id),
  imported_at         timestamptz not null default now()
);

-- =============================================================================
-- 3.18 announcements
-- =============================================================================
create table announcements (
  id          uuid primary key default gen_random_uuid(),
  body        text not null,
  level       text not null default 'info',
  audience    app_role[],
  starts_at   timestamptz,
  ends_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- =============================================================================
-- updated_at triggers (on the tables that carry one)
-- =============================================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  for t in
    select unnest(array[
      'app_users','dealers','product_models','product_skus',
      'orders','purchase_orders','inquiries'
    ])
  loop
    execute format(
      'create trigger %I_set_updated_at before update on %I for each row execute procedure set_updated_at();',
      t, t
    );
  end loop;
end$$;
