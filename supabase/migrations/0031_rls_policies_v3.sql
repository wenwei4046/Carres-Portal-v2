-- =============================================================================
-- 0031_rls_policies_v3.sql — Phase 4 v3-S3
-- =============================================================================
-- Source spec: docs/superpowers/specs/2026-05-04-phase-4-v3-spec.md §3.4
--              (RLS policy template for partner-scoped resources)
-- Sprint:      v3-S3 (schema migrations 0026-0031, data layer only)
-- Bug fixes:   Codex review 2026-05-04 (Bug 2 -- reuse existing 'partner' role)
--
-- Why this migration:
--   v3 starts using the existing app_role 'partner' for the Logistics Partner
--   persona. The current v2 RLS already handles partner SELECT on
--   purchase_orders + purchase_order_lines via the broader po_scoped_read /
--   po_lines_scoped_read policies (0002_rls.sql:241, 0022_purchase_order_lines_rls.sql).
--   This migration adds explicit partner-named additive policies so the RLS
--   audit trail makes partner intent obvious -- if the v3 partner surface
--   needs to be reasoned about in isolation, these named policies can be
--   inspected independently of the multi-role OR-disjunctions.
--
--   Scope (per v3-S3 minimal slice):
--     1. partner_sees_own_po         -- explicit partner SELECT on purchase_orders
--     2. partner_sees_own_po_lines   -- explicit partner SELECT on purchase_order_lines
--
--   DEFERRED to later sprints (NOT in this migration):
--     - order_supplier_threads policies   -> v3-S4 / migration 0032 (table doesn't exist yet)
--     - stock_balances partner-WH scoping -> later (warehouses.owning_partner_id
--       not populated yet; needs supplier-driven seed)
--     - orders policies for partner       -> partner doesn't read orders directly
--
-- Auth helpers (existing, defined in 0002_rls.sql:18-40):
--   - public.app_role()        STABLE SECURITY DEFINER returns app_role
--   - public.app_partner_id()  STABLE SECURITY DEFINER returns uuid
--   Both query app_users by auth.uid(). Per CLAUDE.md §8.2 Fix 2 every
--   helper call in policy USING/WITH CHECK is wrapped (select fn()) for
--   InitPlan caching. Per Fix 3 helpers are STABLE.
--
-- Idempotency: drop policy if exists ... ; create policy ...;
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Partner sees own PO (explicit partner-only SELECT).
-- -----------------------------------------------------------------------------
-- Existing po_scoped_read in 0002_rls.sql:241 already covers partners via the
-- delivery_partner_id branch. This adds a partner-named additive policy so
-- the v3 partner surface is explicit and easy to audit independently.
-- Both policies stack via OR -- a partner row matches if EITHER policy allows.
drop policy if exists partner_sees_own_po on purchase_orders;
create policy partner_sees_own_po on purchase_orders
for select to authenticated
using (
  (select public.app_role()) = 'partner'
  and delivery_partner_id = (select public.app_partner_id())
);

-- -----------------------------------------------------------------------------
-- 2. Partner sees own PO lines (mirrors po_lines_scoped_read pattern).
-- -----------------------------------------------------------------------------
-- Existing po_lines_scoped_read in 0022_purchase_order_lines_rls.sql already
-- covers partners via the same EXISTS subquery. This adds the partner-named
-- additive form so v3 lookup queries scoped to partner can rely on a single
-- explicit policy when reasoning about access.
drop policy if exists partner_sees_own_po_lines on purchase_order_lines;
create policy partner_sees_own_po_lines on purchase_order_lines
for select to authenticated
using (
  (select public.app_role()) = 'partner'
  and exists (
    select 1
      from purchase_orders p
     where p.id = purchase_order_lines.po_id
       and p.delivery_partner_id = (select public.app_partner_id())
  )
);
