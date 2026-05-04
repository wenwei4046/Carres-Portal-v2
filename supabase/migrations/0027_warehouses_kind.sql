-- =============================================================================
-- 0027_warehouses_kind.sql — Phase 4 v3-S3
-- =============================================================================
-- Source spec: docs/superpowers/specs/2026-05-04-phase-4-v3-spec.md §3.2
-- Sprint:      v3-S3 (schema migrations 0026-0031, data layer only)
--
-- Why this migration:
--   The Sofa flow ships to a partner-owned warehouse (zero rent for HQ), then
--   the partner does last-mile delivery. To represent that we need to mark
--   warehouses as either 'own' (HQ-controlled) or 'logistics_partner'
--   (partner-controlled). RLS on stock_balances for partner-WH rows must
--   eventually scope to the partner's role via owning_partner_id.
--
-- Idempotency:
--   - CREATE TYPE wrapped in DO block + pg_type lookup (CREATE TYPE has no
--     IF NOT EXISTS shorthand)
--   - ADD COLUMN uses IF NOT EXISTS
--   - CREATE INDEX uses IF NOT EXISTS
--   - Constraint guarded by pg_constraint lookup
--
-- Note: enum value 'logistics_partner' is the WAREHOUSE_KIND value -- a
--   different enum from app_role (which already has 'partner' since 0001_init.sql:15-17).
--   No conflict; do NOT confuse with Codex bug 2 which was about app_role.
-- =============================================================================

-- 1. Create enum type (idempotent guard via pg_type lookup).
do $$ begin
  if not exists (select 1 from pg_type where typname = 'warehouse_kind') then
    create type warehouse_kind as enum ('own', 'logistics_partner');
  end if;
end $$;

-- 2. Add kind column. Existing rows default to 'own' (the historic behaviour).
alter table warehouses
  add column if not exists kind warehouse_kind not null default 'own';

-- 3. Add owning_partner_id (nullable; required only when kind='logistics_partner').
alter table warehouses
  add column if not exists owning_partner_id uuid references delivery_partners(id);

-- 4. Check constraint: kind <-> owning_partner_id must agree.
--      kind='logistics_partner' -> owning_partner_id NOT NULL
--      kind='own'               -> owning_partner_id IS NULL
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'warehouses_partner_kind_check') then
    alter table warehouses add constraint warehouses_partner_kind_check
      check (
        (kind = 'logistics_partner' and owning_partner_id is not null)
        or
        (kind = 'own' and owning_partner_id is null)
      );
  end if;
end $$;

-- 5. Index for filtering on Reserved tab / partner-WH list drilldown.
create index if not exists warehouses_kind_idx on warehouses(kind);
