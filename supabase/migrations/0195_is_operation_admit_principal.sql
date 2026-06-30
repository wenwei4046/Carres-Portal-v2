-- 0189_is_operation_admit_principal
-- =============================================================================
-- Unified Internal Portal (2026-06-30) — admit `principal` into Operation.
--
-- Loo's decision: merge the Operation / Principal / Finance portals into ONE
-- role-aware portal. The principal (Chairman, de-facto super-admin) must be able
-- to SEE and OPERATE every Operation feature from the unified shell.
--
-- `public.is_operation()` is the manual guard inside every Operation RPC
-- (operation_dashboard_summary, the per-unit stock hooks, the delivery e-sign /
-- cascade RPCs, etc.). It currently admits ONLY role='operation', so a principal
-- hitting those RPCs 403s at the DB even when the API layer lets them through.
--
-- Widening it to `role in ('operation','principal')` cascades to ALL of those
-- guards in one shot — exactly mirroring how `is_internal()` (0002) already
-- treats principal as internal, and how `requireFinance` (auth-guards.ts) and
-- the Phase-5 finance RPCs already admit principal alongside finance.
--
-- This is the DB twin of the API-layer change that widens `requireOperation`
-- (apps/api/src/lib/auth-guards.ts) + the inline `auth.role !== 'operation'`
-- guards to also admit principal.
--
-- Additive + low-risk: it only ADMITS an additional role (the boss); no existing
-- operation behaviour changes. STABLE SECURITY DEFINER preserved per CLAUDE.md
-- §8 Fix 3 (planner caching). NULL-role (service_role / migration) bypass is
-- unaffected — these RPCs are SECURITY DEFINER and is_operation() returns false
-- for a NULL role, which was already the case.
-- =============================================================================

create or replace function public.is_operation()
returns boolean
language sql stable security definer as $$
  select coalesce(
    (select role from public.app_users where id = auth.uid()) in
      ('operation', 'principal'),
    false
  )
$$;
