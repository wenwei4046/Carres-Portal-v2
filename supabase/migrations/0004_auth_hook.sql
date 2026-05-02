-- =============================================================================
-- 0004_auth_hook.sql — Custom Access Token Hook for RLS performance
-- =============================================================================
-- Per CLAUDE.md §8 Fix 1.
--
-- WHY: without this, every RLS check that asks "what role is this user?"
--   queries app_users — N policies × M tables × K rows = the HV Portal lag
--   disaster. With this, role + entity ids live INSIDE the JWT app_metadata,
--   so policies read auth.jwt() with zero extra queries.
--
-- HOW IT WORKS:
--   1. User signs in with email/password → Supabase Auth issues a JWT.
--   2. Before signing the JWT, Supabase calls this hook with the event payload.
--   3. Hook reads app_users by user_id, picks role + entity ids.
--   4. Returns event with claims.app_metadata enriched.
--   5. Final JWT carries the metadata; client + RLS read it from auth.jwt().
--
-- AFTER APPLYING THIS MIGRATION (one-time, manual step in Supabase Dashboard):
--   Dashboard → Authentication → Hooks → Send SMS / Hooks → Custom Access Token Hook
--   Function: auth.custom_access_token_hook
--   Enable.
--
-- GRACEFUL DEGRADATION:
--   If the user has no app_users row (signed up but admin hasn't created the
--   app_users mirror yet), the hook returns the event unchanged — no crash,
--   but the JWT carries no role and RLS will reject all dependent queries.
-- =============================================================================

create or replace function auth.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id    uuid;
  v_user_row   record;
  v_meta       jsonb;
begin
  v_user_id := (event->>'user_id')::uuid;

  select role::text       as role,
         dealer_id::text   as dealer_id,
         supplier_id::text as supplier_id,
         partner_id::text  as partner_id,
         outlet_id::text   as outlet_id
    into v_user_row
    from public.app_users
    where id = v_user_id;

  if v_user_row.role is null then
    -- No app_users row yet → return event unchanged.
    return event;
  end if;

  v_meta := jsonb_strip_nulls(jsonb_build_object(
    'role',        v_user_row.role,
    'dealer_id',   v_user_row.dealer_id,
    'supplier_id', v_user_row.supplier_id,
    'partner_id',  v_user_row.partner_id,
    'outlet_id',   v_user_row.outlet_id
  ));

  -- Merge into existing claims.app_metadata (preserve any pre-existing keys
  -- such as Supabase's default 'provider' / 'providers').
  return jsonb_set(
    event,
    '{claims, app_metadata}',
    coalesce(event #> '{claims, app_metadata}', '{}'::jsonb) || v_meta,
    true
  );
end;
$$;

-- Lock down. Only Supabase's auth admin role may call this.
grant execute on function auth.custom_access_token_hook to supabase_auth_admin;
revoke execute on function auth.custom_access_token_hook from public, anon, authenticated;
