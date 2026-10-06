-- =============================================================================
-- 0390_a_reader_may_name_an_internal_actor.sql
-- SALES ORDER RECORDS · an operation reader may NAME a principal actor
-- =============================================================================
--
-- THE MEASUREMENT THAT CAUSED THIS (2026-08-27, production acceptance of
-- CARD-2026-08-27-sales-order-revisions-history-readable-records).
--
-- SO-1329 was created TODAY by the principal account, after 0387 stamped
-- `by_user_id`. The approved record grammar requires the reader to see:
--
--   Order created
--   Jess · Principal · Thu, 27 Aug 12:30
--
-- The authenticated walk, signed in as OPERATION, saw instead:
--
--   Order created
--   Actor was not recorded · Principal · Thu, 27 Aug 12:30
--
-- — which is FALSE for that row. The actor WAS recorded; the reader simply
-- could not resolve the name, because 0235's peers policy lets an operation
-- JWT read only `app_users` rows whose role IS 'operation'. A principal,
-- finance, HR or warehouse actor is invisible to the very staff the ledger
-- exists to inform. `salespersons` (0002) answers the dealer-side half; this
-- migration answers the internal-staff half.
--
-- ── WHY A NARROW DEFINER FUNCTION AND NOT A WIDER READ POLICY ────────────────
--
-- Red line 2: an RLS change is explained, and the smallest one wins. A new
-- SELECT policy on `app_users` would hand operation staff the whole row —
-- email, status, last-seen — of every internal account, to satisfy a need
-- that is ONE column wide. This function returns exactly (id, name), only
-- for ids the caller already holds from a ledger row RLS let them read, and:
--
--   · only to internal reader JWTs ('operation' and 'principal' — the two
--     roles the Sales Order object routes admit);
--   · only for INTERNAL staff rows (principal · operation · finance · bd ·
--     hr · warehouse). Dealer/salesperson/showroom accounts are deliberately
--     NOT returned here, so the existing resolver arithmetic is unchanged:
--     `salespersons` keeps answering the sales-side profile name, and the
--     "account wins" rule cannot suddenly print a shop login name where the
--     salesperson's own name printed before.
--
-- No table policy changes. Writes are untouched. External roles get nothing.
--
-- IDEMPOTENT: `create or replace`. Safe to re-run.
-- =============================================================================

begin;

create or replace function public.actor_display_names(p_ids uuid[])
returns table (id uuid, name text)
language sql
security definer
stable
set search_path = public
as $$
  select u.id, u.name
  from public.app_users u
  where u.id = any(coalesce(p_ids, '{}'))
    and u.role in ('principal','operation','finance','bd','hr','warehouse')
    and (select (auth.jwt() -> 'app_metadata') ->> 'role') in ('operation','principal')
$$;

comment on function public.actor_display_names(uuid[]) is
  'Resolves internal-staff actor ids to display names for the History/'
  'Revisions record grammar. Returns only (id, name), only internal-staff '
  'rows, only to operation/principal JWTs. 0390.';

revoke execute on function public.actor_display_names(uuid[]) from anon, public;
grant execute on function public.actor_display_names(uuid[]) to authenticated;

commit;

-- ── VERIFY (run by hand; this file asserts no row count — red line 8) ────────
--
--   select * from public.actor_display_names(
--     array['11111111-1111-1111-1111-000000000001']::uuid[]);
--
-- Under an operation or principal JWT this names the principal account; under
-- anon or an external role it returns nothing.
