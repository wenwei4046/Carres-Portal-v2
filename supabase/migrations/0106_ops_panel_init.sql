-- =============================================================================
-- 0106_ops_panel_init.sql
-- =============================================================================
-- Ops Panel initialisation (Jess COO 2026-05-14).
--
-- Adds:
--   1. Carres Klang warehouse (NETS-managed, RM7.5k/month rent, primary stock
--      destination from 2026-05-20 when GAI Klang quit completes).
--   2. ops_activity_log table — team-wide audit feed shown in the live "Recent
--      Activity" panel (Phase 1). Every ops action (transfer/import/booking/
--      annotation/etc.) inserts a row here for transparency.
--
-- Deliberately NOT in this migration:
--   • app_role enum extension for 'ops' role — deferred to Phase 2 when ops
--     staff (Samantha/Sasha/Mia) onboard. Phase 1 gates by principal+logistics
--     so Jess + wenwei can use it immediately without enum DDL.
--   • Domain tables (ops_order_annotations / ops_balance_followup /
--     ops_returns / ops_service_notes / ops_issues / ops_meeting_minutes /
--     ops_stock_transfers) — each module brings its own migration (0107+).
--
-- All changes additive — wenwei's existing tables/RLS untouched.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Carres Klang warehouse — destination for GAI/HOUZS stock consolidation.
-- -----------------------------------------------------------------------------
-- Uses upsert-style insert so re-running is safe. Owning partner = NETS
-- (delivery_partners table) since NETS physically manages the facility and
-- handles pickup/dispatch operations from here.
insert into warehouses (id, name, code, owning_partner_id)
select
  '00000000-0000-0000-0000-000000000c03'::uuid,
  'Carres Klang',
  'CKLG',
  dp.id
from delivery_partners dp
where dp.name ilike '%nets%'
  and not exists (
    select 1 from warehouses where id = '00000000-0000-0000-0000-000000000c03'::uuid
  )
limit 1;

-- Fallback if NETS partner row not yet seeded — create warehouse without owner.
-- Production already has NETS so this branch is defensive only.
insert into warehouses (id, name, code)
select
  '00000000-0000-0000-0000-000000000c03'::uuid,
  'Carres Klang',
  'CKLG'
where not exists (
  select 1 from warehouses where id = '00000000-0000-0000-0000-000000000c03'::uuid
);

-- -----------------------------------------------------------------------------
-- 2. ops_activity_log — team-wide audit feed.
-- -----------------------------------------------------------------------------
-- One row per ops action. Visible to whole ops team (transparency requirement
-- from Jess 2026-05-14 — replaces WhatsApp screenshot workflow). Filterable by
-- person/module/time in the UI. Last ~50 shown live, full history queryable.
create table if not exists ops_activity_log (
  id            uuid primary key default gen_random_uuid(),
  -- Who did it. Nullable for system-triggered events (cron / import). For
  -- user-triggered events this is the authenticated app_users.id.
  actor_id      uuid references app_users(id) on delete set null,
  actor_name    text,        -- snapshotted at write time so audit survives staff leavers
  -- What module / action. Free-text for now; will tighten to enum in Phase 2
  -- once we know the full action vocabulary (e.g. 'stock.transfer.created').
  module        text not null,
  action        text not null,
  -- What entity was affected. Polymorphic — could be an order id, transfer id,
  -- SN id, etc. Display layer joins as needed.
  entity_type   text,        -- 'order' | 'transfer' | 'service_note' | 'issue' | etc.
  entity_ref    text,        -- the human-facing ref (CR1234, SN/2605-03, A047, etc.)
  -- Free-form description for the activity feed line.
  summary       text not null,
  -- Optional structured payload for "before → after" diff display.
  details       jsonb,
  occurred_at   timestamptz not null default now()
);

create index if not exists ops_activity_log_occurred_idx on ops_activity_log(occurred_at desc);
create index if not exists ops_activity_log_actor_idx on ops_activity_log(actor_id);
create index if not exists ops_activity_log_entity_idx on ops_activity_log(entity_type, entity_ref);

comment on table ops_activity_log is
  'Team-wide audit feed for the Ops panel (Jess 2026-05-14). Every ops user action inserts a row; UI shows last ~50 live to whole team. Survives staff leavers because actor_name is snapshotted.';

-- -----------------------------------------------------------------------------
-- 3. RLS — internal staff can read all activity; only authenticated users can
-- write (no anon). Writes happen via Hono API routes which set actor_id from
-- JWT, so we trust the auth.uid() check below.
-- -----------------------------------------------------------------------------
alter table ops_activity_log enable row level security;

create policy ops_activity_log_read_internal
  on ops_activity_log for select
  using ( (select is_internal()) );

create policy ops_activity_log_write_authenticated
  on ops_activity_log for insert
  with check ( auth.uid() is not null );
