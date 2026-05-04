-- =============================================================================
-- 0029_app_role_partner_no_op.sql — Phase 4 v3-S3
-- =============================================================================
-- Source spec: docs/superpowers/specs/2026-05-04-phase-4-v3-spec.md §3.4
-- Sprint:      v3-S3 (schema migrations 0026-0031, data layer only)
-- Bug fixes:   Codex review 2026-05-04 (Bug 2)
--
-- NO-OP placeholder. The original v3 spec proposed adding 'logistics_partner'
-- to app_role, but Codex review (2026-05-04) found app_role already has
-- 'partner' (0001_init.sql:15-17). v3 reuses the existing 'partner' role for
-- the Logistics Partner persona; the JWT app_metadata.partner_id claim already
-- carries the partner tenancy id, and policies use public.app_partner_id().
--
-- Slot kept so 0030+ numbering stays sequential per spec §17.2 binding.
-- =============================================================================
do $$ begin
  raise notice 'Migration 0029: no-op (app_role.partner already exists since 0001_init.sql)';
end $$;
