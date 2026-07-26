-- =====================================================================
-- 0267 — the auth hook stops minting a role for a disabled account
-- =====================================================================
-- APPLIED to prod 2026-07-26. Tail re-checked immediately before apply
-- (0266) — no collision. CLOSES CF `disabled-user-service-role-routes`.
--
-- WHY THIS IS STILL NEEDED AFTER 0266:
--   0266 made `disabled` real at the DATABASE layer — RLS and every hr_*
--   DEFINER gate now deny. But routes that use adminClient (service_role)
--   bypass RLS entirely, and their Hono guards (requireHr / requirePrincipal
--   / requireOperation) read `auth.role` from the JWT, not from app_users.
--   Measured on the LIVE hook before this migration:
--       custom_access_token_hook(samantha, disabled) → {"role": "operation"}
--   i.e. a disabled user who still knows their password could log in fresh
--   and be handed a perfectly valid operation token.
--
-- THE FIX IS ONE PREDICATE, AND DELIBERATELY NOT A NEW CLAIM.
--   The hook already has a "no row → return the event untouched" path, and
--   apps/api/src/middleware/auth.ts already rejects a token whose
--   app_metadata carries no valid role (`if (!isRole(roleRaw)) → 401`).
--   Narrowing the SELECT to active accounts routes a disabled user down that
--   existing path, so NO new claim, NO middleware change and NO frontend
--   change are required. A `status` claim would have meant editing the
--   highest-blast-radius function AND the auth middleware AND handling the
--   window where already-issued tokens carry no such claim — strictly more
--   risk for the same outcome.
--
-- NO exception handler is added, on purpose. If this function throws, token
-- issuance fails and that user cannot log in. Swallowing the error instead
-- would mint a ROLELESS token — the app would load and then 401 on every
-- call, which is a worse and much more confusing failure. Keep the body
-- small enough that it cannot realistically throw.
--
-- RESIDUAL, AND IT IS INHERENT TO JWTs: an access token issued BEFORE the
-- disable stays valid until it expires (~1h). Nothing short of a per-request
-- DB read closes that, which would tax every call in the system to shrink a
-- one-hour window. The practical answer is the three layers now in place:
-- revoke the session at disable time (logged since 2026-07-26, so a failure
-- is visible instead of swallowed), RLS denies immediately (0266), and no
-- NEW token can carry a role (this migration).
--
-- VERIFIED LIVE, BEFORE AND AFTER, by calling the hook with a synthetic event:
--   before → samantha minted {"role":"operation"}
--   after  → samantha mints {} (no role at all → middleware 401s her)
--   after  → ALL 14 active accounts mint exactly the role they minted before
--            (checked row by row, verdict OK for every one), and every entity
--            id still rides along: supplier_id / dealer_id / partner_id
--            verified on the supplier, dealer, showroom and partner logins.
--
-- Everything except the WHERE clause is byte-identical to the prior version.
-- Rollback = drop `and status = 'active'`.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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
    where id = v_user_id
      -- 0267: a non-active account matches no row, so no role is minted and
      -- the existing guard below returns the event untouched.
      and status = 'active';

  if v_user_row.role is null then
    return event;
  end if;

  v_meta := jsonb_strip_nulls(jsonb_build_object(
    'role',        v_user_row.role,
    'dealer_id',   v_user_row.dealer_id,
    'supplier_id', v_user_row.supplier_id,
    'partner_id',  v_user_row.partner_id,
    'outlet_id',   v_user_row.outlet_id
  ));

  return jsonb_set(
    event,
    '{claims, app_metadata}',
    coalesce(event #> '{claims, app_metadata}', '{}'::jsonb) || v_meta,
    true
  );
end;
$function$;
