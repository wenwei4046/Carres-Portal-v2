-- =============================================================================
-- 0508_a_finance_approver_is_a_finance_user_or_the_principal.sql
-- =============================================================================
-- WHAT WAS WRONG
--   The API lets only a finance user or the principal approve, reject or
--   cancel a payment voucher, cancel a confirmed supplier bill, cancel an
--   issued other-debtor invoice, void an other receipt, or cancel a supplier's
--   money back (requireFinance, apps/api/src/lib/auth-guards.ts:71). The
--   database under those doors asked only has_finance_approver(auth.uid())
--   (0464:83), which says yes to ANY active account that is not a dealer, if
--   its position holds the finance_approver duty. So an operation, bd or
--   warehouse user whose position was given that duty in HR could skip the
--   API and call the function straight over Supabase REST (/rpc, with their
--   own login and the public anon key) -- and release a payment voucher.
--
-- THE RULING (YH, 15 Sep 2026): "add the check, in case if someone knows the
--   api url details and does bad acting by doing curl at cli". The database
--   refuses whatever the API refuses.
--
-- WHAT THIS CHANGES
--   has_finance_approver(uuid) only. Its body is 0464's with one edit:
--       u.role <> 'dealer'   ->   u.role = 'finance'
--   So the answer is yes for an active principal (as before) and for an
--   active FINANCE user whose position holds finance_approver. Every door
--   listed above, and every "may I approve" flag the finance pages show,
--   reads this one helper; no other function is redefined.
--   - A finance user or the principal gets the same answer as before, so
--     nothing the API allows is refused.
--   - The separation-of-duties checks compare prepared_by with the caller
--     (payment_voucher_check / payment_voucher_approve); they do not call
--     this helper about the preparer, so they are unchanged. A preparer had to
--     be finance or principal anyway (payment_voucher_prepare's own gate).
--   - A caller with no user (cron, the Stripe webhook, the service role):
--     auth.uid() is null, the helper was and stays false. None of them calls
--     these doors. gl_post and gl_reverse carry no role gate on purpose (0468)
--     and are not touched.
--   - Still NULL-safe: the whole answer stays inside coalesce(..., false), and
--     status = 'active' is still required on both branches.
--   Security definer, search_path and grants are unchanged: `create or
--   replace` keeps the existing EXECUTE grants (revoked from public and anon,
--   granted to authenticated, 0464).
--
-- RLS: none. DATA: none. DR/CR: none.
-- =============================================================================

begin;

create or replace function public.has_finance_approver(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(
    (select role from public.app_users
      where id = p_user_id and status = 'active') = 'principal'
    or exists (
      select 1
        from public.app_users u
        join public.org_position_duties pd on pd.position_id = u.position_id
       where u.id = p_user_id
         and u.status = 'active'
         and u.role = 'finance'
         and pd.duty_key = 'finance_approver'
    ),
  false);
$fn$;

comment on function public.has_finance_approver(uuid) is
  'Ruling M release gate. True if the given user is the active principal, or an active finance user whose position holds the finance_approver duty (0260). 0508: finance only, as the API is -- before, any non-dealer holding the duty passed. Takes the user id, not auth.uid(), so a separation-of-duties check can ask about the preparer.';

do $sanity$
declare
  p regprocedure := to_regprocedure('public.has_finance_approver(uuid)');
  v_src text;
begin
  if p is null then
    raise exception '0508 sanity: has_finance_approver(uuid) is missing';
  end if;
  v_src := (select prosrc from pg_proc where oid = p);
  if position('u.role = ''finance''' in v_src) = 0 or position('<> ''dealer''' in v_src) > 0 then
    raise exception '0508 sanity: has_finance_approver does not limit the duty to finance';
  end if;
  if position('coalesce(' in v_src) = 0 or position('status = ''active''' in v_src) = 0 then
    raise exception '0508 sanity: has_finance_approver lost its coalesce or its active-only check';
  end if;
  if has_function_privilege('anon', p, 'execute') then
    raise exception '0508 sanity: anon can execute has_finance_approver';
  end if;
  if not has_function_privilege('authenticated', p, 'execute') then
    raise exception '0508 sanity: authenticated cannot execute has_finance_approver';
  end if;
  if not exists (
    select 1 from pg_proc pr
    where pr.oid = p and pr.prosecdef
      and pr.proconfig @> array['search_path=public, pg_temp']
  ) then
    raise exception '0508 sanity: has_finance_approver lost security definer or its search_path';
  end if;
end
$sanity$;

commit;
