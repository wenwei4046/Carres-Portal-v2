-- =============================================================================
-- 0107_ops_imported_orders.sql
-- =============================================================================
-- AutoCount order import staging (Jess COO 2026-05-14).
--
-- Workflow:
--   1. Sales staff key new orders in AutoCount (legacy ERP, being replaced).
--   2. Jess exports order Listing.xlsx from AutoCount daily/weekly.
--   3. Ops Panel Order Import page accepts the Excel, parses, upserts here.
--   4. Ops Inbox shows imported orders, ops assigns final logistic partner.
--   5. (Future Phase 2) "Promote staging → wenwei.orders" once mapping is
--      stable. For now, staging stays separate; SN/Issue/Returns link via
--      order ref string (CR0418 / TCF0166 / DL0479 / RF2607).
--
-- De-dup rule (CRITICAL):
--   Same `ref` → UPSERT. Re-import updates customer/address/balance/items,
--   but PRESERVES `ops_assigned_logistic` if ops already set it. The
--   `import_source_logistic` keeps the sales-entered value for audit.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ops_imported_orders — staging table.
-- One row per order ref (CR0418, TCF0166, DL0479, etc.).
-- Line items kept as JSONB so we don't need a separate child table for now.
-- -----------------------------------------------------------------------------
create table if not exists ops_imported_orders (
  ref                        text primary key,
  -- Customer info (from AutoCount columns: Debtor Name, Phone, Delivery Address 1-4).
  customer_name              text not null,
  customer_phone             text,
  delivery_address_1         text,
  delivery_address_2         text,
  delivery_address_3         text,
  delivery_address_4         text,
  delivery_location          text,           -- "Muar, Johor" — Excel column "Delivery Location"
  delivery_date_requested    date,           -- "New- Delivery Date" — when customer wants delivery
  -- Financial.
  balance_raw                text,           -- "RM3322 Paid" / "RM2748" — keep raw string, parse later
  balance_amount             numeric(12,2),  -- parsed amount if regex matched
  balance_status             text,           -- 'paid' | 'pending' | NULL
  -- Line items as JSONB. Each item: { itemGroup, qty, description, poDocNo }.
  items                      jsonb not null default '[]'::jsonb,
  total_qty                  integer not null default 0,
  -- Order metadata.
  order_date                 date,           -- "Date" column — when sale was made
  -- Logistic assignment — TWO fields for the de-dup conflict rule.
  -- import_source_logistic: what AutoCount Excel had (sales' guess). Set on
  --   every import; can change between imports if sales updates their entry.
  -- ops_assigned_logistic: ops's final decision. Set manually by ops via the
  --   Inbox "Assign logistic" action. PRESERVED across re-imports.
  import_source_logistic     text,
  ops_assigned_logistic      text,           -- 'NETS' | 'TSDD' | 'AL' | 'HOUZS' | 'GAI' | 'HOOKKA' | etc.
  ops_assigned_at            timestamptz,
  ops_assigned_by            uuid references app_users(id),
  -- Workflow status managed by ops (mirrors Master.xlsx Logistic Remark column).
  ops_status                 text not null default 'inbox',
  -- 'inbox' | 'assigned' | 'awaiting_stock' | 'ready' | 'dispatched'
  -- | 'delivered' | 'on_hold' | 'cancelled'
  ops_remark                 text,
  -- Audit.
  first_imported_at          timestamptz not null default now(),
  last_imported_at           timestamptz not null default now(),
  last_imported_batch_id     uuid,
  imported_by                uuid references app_users(id)
);

create index if not exists ops_imported_orders_status_idx on ops_imported_orders(ops_status);
create index if not exists ops_imported_orders_logistic_idx on ops_imported_orders(ops_assigned_logistic);
create index if not exists ops_imported_orders_delivery_date_idx on ops_imported_orders(delivery_date_requested);

comment on table ops_imported_orders is
  'Staging table for orders imported from AutoCount Listing.xlsx (Jess 2026-05-14). Phase 1 holds AutoCount imports separately from wenwei.orders. Re-import is UPSERT on ref — preserves ops_assigned_logistic.';
comment on column ops_imported_orders.import_source_logistic is
  'Logistic value from AutoCount Excel at import time (sales staff''s initial guess). Refreshed on every re-import. Kept for audit.';
comment on column ops_imported_orders.ops_assigned_logistic is
  'Ops''s FINAL logistic decision. Set via Inbox "Assign logistic" action. Preserved across re-imports — re-import does NOT overwrite this.';

-- -----------------------------------------------------------------------------
-- ops_import_batches — one row per Excel upload, for audit + rollback.
-- -----------------------------------------------------------------------------
create table if not exists ops_import_batches (
  id                   uuid primary key default gen_random_uuid(),
  source_filename      text,
  rows_in_file         integer not null default 0,
  orders_created       integer not null default 0,
  orders_updated       integer not null default 0,
  imported_by          uuid references app_users(id),
  imported_by_name     text,
  imported_at          timestamptz not null default now(),
  notes                text
);

create index if not exists ops_import_batches_imported_at_idx on ops_import_batches(imported_at desc);

comment on table ops_import_batches is
  'Audit log of every Order Import operation. orders_created + orders_updated reconcile against rows_in_file (file may have duplicate lines per order ref).';

-- -----------------------------------------------------------------------------
-- RLS — internal staff full read/write. Writes happen via Hono API routes.
-- -----------------------------------------------------------------------------
alter table ops_imported_orders enable row level security;
alter table ops_import_batches enable row level security;

create policy ops_imported_orders_read_internal
  on ops_imported_orders for select
  using ( (select is_internal()) );

create policy ops_imported_orders_write_internal
  on ops_imported_orders for all
  using ( (select is_internal()) )
  with check ( (select is_internal()) );

create policy ops_import_batches_read_internal
  on ops_import_batches for select
  using ( (select is_internal()) );

create policy ops_import_batches_write_internal
  on ops_import_batches for insert
  with check ( (select is_internal()) );
