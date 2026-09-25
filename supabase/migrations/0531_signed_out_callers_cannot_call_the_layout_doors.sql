-- =============================================================================
-- 0531_signed_out_callers_cannot_call_the_layout_doors.sql (2026-09-17)
-- =============================================================================
-- 0528 revoked the two personal-layout doors from PUBLIC, but Supabase's default
-- privileges also grant EXECUTE to `anon` directly, and that grant survived
-- (measured: has_function_privilege('anon', …, 'EXECUTE') = true). Both doors
-- already refuse a null auth.uid() with 42501, so nothing could be written;
-- this removes the door itself for a signed-out caller. `authenticated` keeps
-- EXECUTE. No table, policy or function body changes.
-- =============================================================================

revoke execute on function public.register_layout_save(text, text, jsonb) from anon;
revoke execute on function public.register_layout_set_default(uuid) from anon;
