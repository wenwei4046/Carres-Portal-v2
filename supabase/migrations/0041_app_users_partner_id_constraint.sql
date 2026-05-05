-- =============================================================================
-- 0041_app_users_partner_id_constraint.sql — Phase 4.5 Chunk 1
-- =============================================================================
-- Source spec: docs/superpowers/specs/2026-05-05-phase-4.5-chunk-1-design.md §6.1
-- Sprint: 1 (schema)
--
-- Why this migration:
--   - Adds CHECK constraint enforcing role='partner' XOR partner_id IS NOT NULL
--   - Adds partial INDEX on app_users(partner_id) for "list users for given LP" queries
--
-- What's NOT here (already exists, intentionally not redefined):
--   - app_users.partner_id column (0001_init.sql:141)
--   - public.app_partner_id() helper (0002_rls.sql:36)
--   - Auth Hook injects partner_id into JWT (0004_auth_hook.sql:45,60)
--
-- Pre-flight: 0 rows with role='partner' AND partner_id IS NULL must hold.
-- Production today: 0 partner users exist (role dormant).
-- =============================================================================

-- 1. Partial INDEX for "list users for a given LP company"
CREATE INDEX IF NOT EXISTS app_users_partner_id_idx
  ON app_users(partner_id)
  WHERE partner_id IS NOT NULL;

-- 2. CHECK constraint: role='partner' iff partner_id IS NOT NULL
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_users_partner_id_iff_role_partner') THEN
    ALTER TABLE app_users ADD CONSTRAINT app_users_partner_id_iff_role_partner
      CHECK (
        (role = 'partner' AND partner_id IS NOT NULL) OR
        (role <> 'partner' AND partner_id IS NULL)
      );
  END IF;
END $$;
