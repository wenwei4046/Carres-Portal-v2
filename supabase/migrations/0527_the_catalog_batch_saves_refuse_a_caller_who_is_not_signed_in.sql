-- 0527 — the Catalog batch saves refuse a caller who is not signed in.
--
-- WHAT WAS WRONG, MEASURED (production, 2026-09-17)
--   catalog_pool_batch_save(text, jsonb, text) and
--   catalog_fabrics_batch_save(jsonb, text) carry
--     proacl = {=X/postgres, postgres=X, anon=X, authenticated=X, service_role=X}
--   so PUBLIC and anon may EXECUTE both. They were created in 0201/0202, and
--   0482/0500 took EXECUTE from anon only on SECURITY DEFINER functions. These
--   two are SECURITY INVOKER, so RLS on catalog_option_pools, catalog_fabrics
--   and catalog_config_history still decides what a caller may write. But a
--   caller who is not signed in has no reason to reach a function that
--   replaces a whole option pool or the whole fabric master.
--
-- WHO CALLS THEM
--   Only apps/api/src/routes/catalog.ts (PUT pool, PUT fabrics), through
--   userClient(c.env, c.var.auth.jwt): the signed-in authenticated role.
--   Nothing calls them as anon.
--
-- WHAT THIS CHANGES
--   Grants only. EXECUTE is revoked from public and anon and granted to
--   authenticated explicitly, so removing the PUBLIC default cannot take it
--   from the signed-in caller. service_role keeps its own grant.
--   No function body, RLS policy, table or row is touched.

revoke all on function public.catalog_pool_batch_save(text, jsonb, text) from public, anon;
grant execute on function public.catalog_pool_batch_save(text, jsonb, text) to authenticated;

revoke all on function public.catalog_fabrics_batch_save(jsonb, text) from public, anon;
grant execute on function public.catalog_fabrics_batch_save(jsonb, text) to authenticated;
