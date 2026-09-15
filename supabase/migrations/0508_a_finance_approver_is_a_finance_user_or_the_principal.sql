-- =============================================================================
-- 0508_a_finance_approver_is_a_finance_user_or_the_principal.sql
-- =============================================================================
-- WHAT WAS WRONG
--   1. The role. The API lets only a finance user or the principal approve,
--      reject or cancel a payment voucher, cancel a confirmed supplier bill,
--      cancel an issued other-debtor invoice, void an other receipt, or cancel
--      a supplier's money back (requireFinance,
--      apps/api/src/lib/auth-guards.ts:71). The database under those doors
--      asked only has_finance_approver(auth.uid()) (0464:83), which said yes
--      to ANY active account that is not a dealer, if its position holds the
--      finance_approver duty. So an operation, bd or warehouse user whose
--      position was given that duty in HR could skip the API, call the
--      function straight over Supabase REST (/rpc, with their own login and
--      the public anon key), and release a payment voucher.
--   2. The holder. has_finance_approver read only org_position_duties (the
--      HR -> Team -> Permissions tick). An approver named in Workspace ->
--      Staff & Duties, and that person's buddy cover, were ignored.
--
-- THE RULINGS (YH, 15 Sep 2026)
--   "add the check, in case if someone knows the api url details and does bad
--   acting by doing curl at cli" -- the database refuses whatever the API
--   refuses. And for Staff & Duties: "make sure that finance doesnt ignore it".
--
-- WHAT THIS CHANGES
--   has_finance_approver(uuid) only. Every door listed above, and every "may I
--   approve" flag the finance pages show, reads this one helper; no other
--   function is redefined. The answer for p_user_id, in order:
--     a. The account must be active and its role finance or principal.
--        Anything else is no, whatever any duty table says -- the API admits
--        nobody else (0508, point 1).
--     b. The principal: yes (0260's standing law, unchanged).
--     c. A finance user, when Staff & Duties names somebody for
--        finance_approver today: yes only if this user is today's actor --
--        the holder, or the holder's cover while the cover runs
--        (workspace_resolve_duty(...)->>'actor_user_id', 0425). Exactly as
--        0474 did for purchasing_approver_gate.
--     d. A finance user, while finance_approver has NO holder in Staff &
--        Duties: the old org_position_duties tick still answers, so applying
--        this changes nothing on the day. That rung ends by itself the moment
--        the duty is assigned in Staff & Duties.
--   - A finance user or the principal who passed before still passes today
--     (nobody holds finance_approver in Staff & Duties until it is assigned),
--     so nothing the API allows is refused.
--   - It answers for ANY user id, not only auth.uid(), so a separation-of-
--     duties check can ask it about another person. (Today's checks compare
--     prepared_by with the caller and do not call it about the preparer.)
--   - A caller with no user (cron, the Stripe webhook, the service role):
--     auth.uid() is null, so the helper was and stays false. None of them
--     calls these doors. gl_post and gl_reverse carry no role gate on purpose
--     (0468) and are not touched.
--   - NULL-safe: the whole answer sits inside coalesce(..., false); an
--     unknown or disabled account has no role and gets no.
--   Security definer, search_path and grants are unchanged: `create or
--   replace` keeps the existing EXECUTE grants (revoked from public and anon,
--   granted to authenticated, 0464).
--
-- The Staff & Duties screen offers the duty from the shared catalogue
-- (packages/shared/src/workspace-duties-catalogue.ts), in the same change.
-- Who holds it is configuration set on that screen; this file assigns nobody.
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
  with me as (
    select u.role::text as role, u.position_id
      from public.app_users u
     where u.id = p_user_id and u.status = 'active'
  ),
  duty as (
    select nullif(public.workspace_resolve_duty('finance_approver')->>'actor_user_id', '')::uuid as actor
  )
  select coalesce(
    (select role from me) = 'principal'
    or ((select role from me) = 'finance'
        and case
              when (select actor from duty) is not null
                then (select actor from duty) = p_user_id
              else exists (
                select 1
                  from me
                  join public.org_position_duties pd on pd.position_id = me.position_id
                 where pd.duty_key = 'finance_approver'
              )
            end),
  false);
$fn$;

comment on function public.has_finance_approver(uuid) is
  'Ruling M release gate (0508). True for the active principal, and for an active finance user who is today''s finance_approver in Workspace -> Staff & Duties (the holder, or the holder''s cover: workspace_resolve_duty). While that duty has no holder, the org_position_duties finance_approver tick answers instead. Any other role is false, as in the API. Takes the user id, not auth.uid(), so a separation-of-duties check can ask about another person.';

do $sanity$
declare
  p regprocedure := to_regprocedure('public.has_finance_approver(uuid)');
  v_src text;
begin
  if p is null then
    raise exception '0508 sanity: has_finance_approver(uuid) is missing';
  end if;
  v_src := (select prosrc from pg_proc where oid = p);
  if position('= ''finance''' in v_src) = 0 or position('<> ''dealer''' in v_src) > 0 then
    raise exception '0508 sanity: has_finance_approver does not limit the duty to finance';
  end if;
  if position('workspace_resolve_duty(''finance_approver'')' in v_src) = 0 then
    raise exception '0508 sanity: has_finance_approver does not ask Staff & Duties';
  end if;
  if position('coalesce(' in v_src) = 0 or position('status = ''active''' in v_src) = 0 then
    raise exception '0508 sanity: has_finance_approver lost its coalesce or its active-only check';
  end if;
  if to_regprocedure('public.workspace_resolve_duty(text,date)') is null then
    raise exception '0508 sanity: workspace_resolve_duty(text, date) is missing';
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
