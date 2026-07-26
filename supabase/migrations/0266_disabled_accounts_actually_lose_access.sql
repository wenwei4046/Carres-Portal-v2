-- =====================================================================
-- 0266 — `disabled` starts meaning disabled
-- =====================================================================
-- APPLIED to prod 2026-07-26. Tail re-checked immediately before apply
-- (0265) — no collision.
--
-- WHAT WAS WRONG (found live 2026-07-26):
--   samantha@carres.com was `status='disabled'` in app_users and STILL had a
--   live auth session (1 session, 8 refresh tokens, last touched 2026-05-29).
--   Her access was never actually revoked, because NOTHING read status:
--     · apps/api/src/middleware/auth.ts verifies the JWT and reads
--       app_metadata — it never looks at app_users at all;
--     · app_role() / is_internal() / is_operation() / is_principal() all read
--       `role` with no status predicate, so every RLS policy kept granting;
--     · the only revocation was a best-effort `auth.admin.signOut` wrapped in
--       a bare try/catch that swallows its own failure silently.
--   So `disabled` was a grey row in a list, not a permission change. Her
--   sessions were cleared by hand (Loo authorised, 2026-07-26) before this.
--
-- TWO CHANGES, AND THEY MUST SHIP TOGETHER
--
--   (A) The four base helpers require status='active'.
--   (B) The eight hr_* gates stop passing on NULL.
--
--   Doing (A) alone would CREATE a hole rather than close one: a disabled
--   caller's app_role() becomes NULL, and the existing gate shape
--   `if (select public.app_role()) not in ('hr','principal') then raise`
--   evaluates `NULL not in (...)` → NULL → the IF is not taken → the function
--   RUNS. So tightening the helpers without fixing the gates would lock a
--   disabled user out of RLS while opening the HR functions to them.
--   (Filed as CF `hr-rpc-null-role-gate-shape` before this fix existed;
--   closed by this migration.)
--
-- BLAST RADIUS + WHY IT IS SAFE
--   These helpers back nearly every RLS policy. For all 14 CURRENTLY ACTIVE
--   accounts this is a no-op — they are already 'active'. There are ZERO
--   accounts in 'invited' state, so nothing mid-onboarding is caught. The
--   single 'disabled' account is the one this is meant to stop.
--   Rollback = re-apply the previous four bodies (drop the status predicate);
--   the (B) half is safe to leave in place either way.
--
-- VERIFIED LIVE AFTER APPLY (simulated auth.uid() per user):
--   disabled  → app_role NULL · is_internal/operation/principal all false ·
--               hr_team_source() and hr_commission_source() both raise 42501
--   principal → app_role 'principal' · all three helpers true ·
--               hr_team_source() returns 14 accounts (unchanged)
--
-- STILL OPEN after this migration — see CF `disabled-user-service-role-routes`:
--   routes that use adminClient (service_role) bypass RLS entirely, and their
--   Hono role gates read the JWT, not app_users. A disabled user holding an
--   unexpired access token could still reach those until it expires. Narrow
--   (needs their session to have survived the disable) but real; the fix is a
--   status claim in custom_access_token_hook, checked in the middleware.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (B) FIRST: make the hr_* gates fail CLOSED on an unknown role.
-- ---------------------------------------------------------------------
-- Rewritten programmatically from pg_get_functiondef so each body is
-- preserved byte-for-byte apart from the gate predicate — retyping eight
-- large function bodies by hand is exactly how a stray edit gets in.
do $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select p.oid, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ilike '%app_role()) not in%'
  loop
    execute replace(
      pg_get_functiondef(r.oid),
      '(select public.app_role()) not in',
      'coalesce((select public.app_role())::text, '''') not in'
    );
    v_count := v_count + 1;
  end loop;

  if v_count <> 8 then
    raise exception 'expected 8 hr_* gates to rewrite, found %', v_count;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- (A) THEN: the base helpers stop answering for a non-active account.
-- ---------------------------------------------------------------------
-- Bodies are otherwise unchanged from live (no search_path added, no
-- volatility change) — a security migration is the wrong place to also
-- tidy unrelated properties.

create or replace function public.app_role()
returns app_role
language sql
stable
security definer
as $function$
  select role from public.app_users
  where id = auth.uid() and status = 'active'
$function$;

create or replace function public.is_internal()
returns boolean
language sql
stable
security definer
as $function$
  select coalesce(
    (select role from public.app_users
     where id = auth.uid() and status = 'active') in
      ('principal','operation','finance','bd'),
    false
  )
$function$;

create or replace function public.is_operation()
returns boolean
language sql
stable
security definer
as $function$
  select coalesce(
    (select role from public.app_users
     where id = auth.uid() and status = 'active') in
      ('operation', 'principal'),
    false
  )
$function$;

create or replace function public.is_principal()
returns boolean
language sql
stable
security definer
as $function$
  select coalesce(
    (select role from public.app_users
     where id = auth.uid() and status = 'active') = 'principal',
    false
  )
$function$;
