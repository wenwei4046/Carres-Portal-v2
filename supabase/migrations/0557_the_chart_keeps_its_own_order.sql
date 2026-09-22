-- 0557 — The chart of accounts keeps its own order, and the order is not the number.
--
-- WHY
--   Finance wants to drag accounts into the order they want to read them in.
--   Dragging must not change an account's number: gl_entry_lines.account_code
--   points at the code (0462), and a used code stays ("Rename it, yes. Retire
--   it, no.", 0462). The number is changed by hand, separately. So display
--   order and account number become two independent things, and this migration
--   is the order half only. No code, name, kind or parent_code is touched here.
--
-- 1. gl_accounts.sort_order — one integer, ordered WITHIN a parent.
--    The chart is a tree (parent_code makes headers and children), so "order"
--    only ever means "order among the accounts under one heading". The read
--    side sorts each parent's children by (sort_order, code).
--
--    WHY A PLAIN INTEGER AND NOT A FRACTIONAL OR STRING KEY
--    A fractional key exists to insert between two rows without rewriting the
--    others. That buys nothing here: a heading holds a handful of children (the
--    whole chart is a few dozen accounts), so rewriting one heading's children
--    is one small UPDATE against a handful of rows, inside one transaction. A
--    fractional key would add precision drift and a rebalancing job for a table
--    this size. Integer, renumbered per heading, is the smaller thing that
--    works.
--
--    DEFAULT 0, AND NO BACKFILL (Section 6). Every existing row gets 0, they
--    all tie, and the tiebreak is `code` — which is exactly the order the chart
--    is read in today (apps/api readChart orders by code). So the default alone
--    gives every existing row a stable, sensible, unchanged order. No UPDATE
--    over existing rows is written, and none is needed. A reorder writes 1..n
--    for the one heading that was dragged; untouched headings keep 0 and keep
--    reading by code.
--
-- 2. gl_accounts_reorder(parent_code, codes[]) — the writer.
--    ONE call persists a whole heading's order, so a half-applied drag cannot
--    exist: it is one statement in one transaction.
--
--    The caller sends the heading and the COMPLETE list of that heading's
--    children in their new order. The function locks that heading's children
--    and then refuses unless the list is exactly that child set. This one check
--    does two jobs:
--      - a drag ACROSS headings is refused. Dragging a child under a different
--        header is a REPARENT: it changes parent_code, which 0462's
--        gl_accounts_protect_posted refuses for a posted parent, and which is a
--        far bigger ruling than reordering. This migration does not reparent
--        and cannot: parent_code is never written. A code from another heading
--        simply is not in the child set, and the call is refused with a plain
--        sentence.
--      - two people dragging at once cannot corrupt the order. The loser's list
--        is stale (an account was added, retired or renamed into a different
--        heading meanwhile), so the set no longer matches and the call is
--        refused rather than silently dropping the other person's change. The
--        row lock serialises the two calls; the set check catches the stale one.
--
--    The gate is the project's NULL-safe form: `v_role is null or v_role not in
--    (...)`. 0481/0482: `app_role() not in (...)` is NULL for a caller who is
--    not signed in, and `if NULL` does not raise, so the bare form FAILS OPEN.
--    Copied verbatim from gl_account_rename (0539). EXECUTE is revoked from
--    public and anon and granted to authenticated only, per 0482.
--
--    No RLS policy on any table changes. No existing function body changes.
--    Run it after 0549.

alter table public.gl_accounts
  add column if not exists sort_order integer not null default 0;

comment on column public.gl_accounts.sort_order is
  '0557: display order among the accounts under the same parent (ties break on code). Never the account number.';

create or replace function public.gl_accounts_reorder(p_parent_code text, p_codes text[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     text := public.app_role()::text;
  v_children text[];
  v_sent     text[];
  v_stray    text;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance changes the chart of accounts.'
      using errcode = '42501', detail = 'not_finance';
  end if;

  if p_codes is null or array_length(p_codes, 1) is null then
    raise exception 'Send the accounts in their new order.'
      using errcode = '22023', detail = 'order_missing';
  end if;

  if exists (select 1 from unnest(p_codes) c group by c having count(*) > 1) then
    raise exception 'The same account is listed twice.'
      using errcode = '22023', detail = 'order_duplicate';
  end if;

  -- Lock this heading's children first, so two reorders of the same heading
  -- take turns instead of interleaving. (FOR UPDATE cannot be used with an
  -- aggregate, hence the separate PERFORM.)
  perform 1 from public.gl_accounts a
    where a.parent_code is not distinct from p_parent_code
    order by a.code
    for update;

  select array_agg(a.code order by a.code) into v_children
    from public.gl_accounts a
    where a.parent_code is not distinct from p_parent_code;

  -- A code that is not under this heading: the drag crossed headings.
  select c into v_stray
    from unnest(p_codes) c
    where not (c = any (coalesce(v_children, array[]::text[])))
    limit 1;
  if v_stray is not null then
    raise exception 'Move an account only among the accounts under the same heading.'
      using errcode = '22023', detail = 'order_not_sibling';
  end if;

  select array_agg(c order by c) into v_sent from unnest(p_codes) c;
  if v_sent is distinct from v_children then
    raise exception 'The chart changed while you were dragging. Open it again and redo the move.'
      using errcode = '40001', detail = 'order_stale';
  end if;

  update public.gl_accounts a
     set sort_order = o.ord::integer
    from unnest(p_codes) with ordinality o(code, ord)
   where a.code = o.code
     and a.sort_order is distinct from o.ord::integer;

  return array_length(p_codes, 1);
end;
$fn$;

comment on function public.gl_accounts_reorder(text, text[]) is
  '0557: reorders the accounts under one heading, whole or not at all. No account number, name or parent changes. Finance or principal.';
revoke all on function public.gl_accounts_reorder(text, text[]) from public, anon;
grant execute on function public.gl_accounts_reorder(text, text[]) to authenticated;

do $sanity$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'gl_accounts' and column_name = 'sort_order'
       and is_nullable = 'NO' and column_default = '0'
  ) then
    raise exception '0557 sanity: gl_accounts.sort_order is missing, nullable, or has no default';
  end if;
  if has_function_privilege('anon', 'public.gl_accounts_reorder(text, text[])', 'execute')
     or not has_function_privilege('authenticated', 'public.gl_accounts_reorder(text, text[])', 'execute') then
    raise exception '0557 sanity: gl_accounts_reorder grants are wrong';
  end if;
  -- The gate must be the NULL-safe form (0481/0482), not the fail-open one.
  if position('v_role is null or v_role not in' in
              pg_get_functiondef('public.gl_accounts_reorder(text, text[])'::regprocedure)) = 0 then
    raise exception '0557 sanity: gl_accounts_reorder is missing the NULL-safe role gate';
  end if;
end $sanity$;
