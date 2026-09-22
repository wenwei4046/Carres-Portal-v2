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
-- 2. A NEW ACCOUNT LANDS AT THE END OF A HEADING THAT WAS DRAGGED.
--    DEFAULT 0 alone is not enough, and the hole is not hypothetical.
--    Once Finance drags heading 2100 into 2120=1, 2130=2, 2110=3, the next
--    account added under 2100 takes the default 0 and sorts FIRST — it jumps
--    over the order Finance just set. Two live paths add an account:
--      · gl_money_account_add (0512) inserts a bank or holding account under
--        heading 1100 whenever Finance adds a money account;
--      · a migration — 0539 itself hung 2130 Accrued expenses under 2100.
--    Both go through INSERT, so the fix is a BEFORE INSERT trigger rather than
--    an edit to either caller (0512 is merged and is not touched here).
--
--    THE RULE HAS TWO HALVES, AND THE SECOND ONE IS THE POINT:
--      · a heading NOBODY HAS DRAGGED has every child at 0. The newcomer stays
--        at 0 too, so the whole heading keeps reading in by-code order and an
--        account added by migration still lands where its number says. Forcing
--        a newcomer to max+1 here would be WRONG: inserting 2115 under
--        2110/2120/2130 would read 2110, 2120, 2130, 2115.
--      · a heading that HAS been dragged carries 1..n. The newcomer takes
--        max+1 and lands at the END, behind the order Finance set.
--    An INSERT that names a sort_order of its own keeps it. sort_order is NOT
--    NULL DEFAULT 0, so "0" and "not supplied" are the same value and the
--    trigger treats them the same — there is no caller that means "put me
--    first" by writing 0, and the reorder writer never writes 0.
--
--    NO BACKFILL (Section 6). Every row in the database today is test data and
--    no existing row is rewritten; the trigger only ever reads existing rows.
--
-- 3. gl_accounts_reorder(parent_code, was[], now[]) — the writer.
--    ONE call persists a whole heading's order, so a half-applied drag cannot
--    exist: it is one statement in one transaction.
--
--    THE CALLER SENDS BOTH ORDERS: the order it READ before the drag (`was`)
--    and the order it wants (`now`). The `was` list is what makes the
--    two-dragger promise TRUE rather than decorative, and it is the correction
--    this file carries:
--
--      An earlier draft compared only the child SET. That check fires when an
--      account is added, retired or reparented under the heading — and does
--      nothing at all in the ordinary case, where both draggers hold the same
--      set and only the ORDER differs. Both read 2130 > 2110 > 2120; A commits
--      ['2110','2120','2130'] and wins; B, still holding the pre-A screen,
--      commits ['2120','2130','2110'] — same set, so the set check passes and
--      A's move is silently thrown away. That is last-write-wins, which is
--      exactly what the comment claimed could not happen.
--
--      So the check is the ORDER, not the set: `was` must still be the order
--      stored right now, read under the same lock that the write takes. B's
--      `was` is the pre-A order, A already replaced it, and B is REFUSED with
--      a sentence that tells B to open the chart again. Nothing of A's is lost.
--
--    The row lock serialises two calls on one heading; the `was` check decides
--    which of them is stale. A drag ACROSS headings is refused separately: a
--    reparent changes parent_code, which 0462's gl_accounts_protect_posted
--    rules on and which is a far bigger ruling than reordering. This migration
--    does not reparent and cannot — parent_code is never written.
--
--    EVERY REFUSAL NAMES ITS OWN CAUSE. A code that is nowhere in the chart, a
--    code that belongs to another heading, a blank in the list, a short list
--    and a stale list are five different mistakes and get five different
--    sentences. Sending a user to re-open a chart that never changed, because
--    the real problem was a blank in the list, is a bug even though nothing is
--    corrupted.
--
--    The gate is the project's NULL-safe form: `v_role is null or v_role not in
--    (...)`. 0481/0482: `app_role() not in (...)` is NULL for a caller who is
--    not signed in, and `if NULL` does not raise, so the bare form FAILS OPEN.
--    Copied verbatim from gl_account_rename (0539). EXECUTE is revoked from
--    public and anon and granted to authenticated only, per 0482.
--
--    No RLS policy on any table changes, and no existing function body changes.
--    Run it after 0549.

alter table public.gl_accounts
  add column if not exists sort_order integer not null default 0;

comment on column public.gl_accounts.sort_order is
  '0557: display order among the accounts under the same parent (ties break on code). Never the account number.';

-- ── a new account joins the END of a heading that was dragged ────────────────

create or replace function public.gl_accounts_sort_order_default()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_max integer;
begin
  if new.sort_order is not null and new.sort_order <> 0 then
    return new;                       -- the caller chose a place; keep it
  end if;

  select max(a.sort_order) into v_max
    from public.gl_accounts a
   where a.parent_code is not distinct from new.parent_code
     and a.code is distinct from new.code;

  -- max 0 (or no siblings at all) means nobody has dragged this heading: leave
  -- the newcomer at 0 so the whole heading keeps reading by code. Anything
  -- above 0 means the heading carries a dragged order, and the newcomer goes
  -- behind it.
  if coalesce(v_max, 0) > 0 then
    new.sort_order := v_max + 1;
  end if;
  return new;
end;
$fn$;

comment on function public.gl_accounts_sort_order_default() is
  '0557: a new account lands at the end of a heading Finance has dragged, and keeps by-code order in a heading nobody has dragged.';
revoke all on function public.gl_accounts_sort_order_default() from public, anon, authenticated;

drop trigger if exists gl_accounts_sort_order_default_trg on public.gl_accounts;
create trigger gl_accounts_sort_order_default_trg
  before insert on public.gl_accounts
  for each row execute function public.gl_accounts_sort_order_default();

-- ── the writer ───────────────────────────────────────────────────────────────

create or replace function public.gl_accounts_reorder(p_parent_code text, p_was text[], p_now text[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     text := public.app_role()::text;
  v_children text[];   -- this heading's codes, sorted by code (the SET)
  v_order    text[];   -- this heading's codes, in the order stored right now
  v_sent     text[];
  v_stray    text;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance changes the chart of accounts.'
      using errcode = '42501', detail = 'not_finance';
  end if;

  if p_now is null or array_length(p_now, 1) is null then
    raise exception 'Send every account under this heading, in the order you want them.'
      using errcode = '22023', detail = 'order_incomplete';
  end if;

  -- A blank element is its own mistake. It must be caught HERE: `not (null =
  -- any (...))` is NULL, never true, so a blank slips past every membership
  -- test below and would be reported as whatever check happens to fail next.
  if exists (select 1 from unnest(p_now) c where c is null)
     or exists (select 1 from unnest(coalesce(p_was, array[]::text[])) c where c is null) then
    raise exception 'The order has a blank where an account should be.'
      using errcode = '22023', detail = 'order_blank';
  end if;

  if exists (select 1 from unnest(p_now) c group by c having count(*) > 1) then
    raise exception 'The same account is listed twice.'
      using errcode = '22023', detail = 'order_duplicate';
  end if;

  if p_was is null or array_length(p_was, 1) is null then
    raise exception 'Send the order the chart was in before the drag.'
      using errcode = '22023', detail = 'order_was_missing';
  end if;

  -- Lock this heading's children first, so two reorders of the same heading
  -- take turns instead of interleaving. (FOR UPDATE cannot be used with an
  -- aggregate, hence the separate PERFORM.)
  perform 1 from public.gl_accounts a
    where a.parent_code is not distinct from p_parent_code
    order by a.code
    for update;

  select array_agg(a.code order by a.code),
         array_agg(a.code order by a.sort_order, a.code)
    into v_children, v_order
    from public.gl_accounts a
   where a.parent_code is not distinct from p_parent_code;

  if v_children is null then
    raise exception 'That account is not in the chart.'
      using errcode = '22023', detail = 'heading_not_found';
  end if;

  -- STALE FIRST. Everything below names a mistake in the caller's list, and
  -- that accusation is only fair once we know the caller was looking at the
  -- chart as it stands. If somebody else dragged in between, THAT is the cause.
  if p_was is distinct from v_order then
    raise exception 'The chart changed while you were dragging. Open it again and redo the move.'
      using errcode = '40001', detail = 'order_stale';
  end if;

  select c into v_stray
    from unnest(p_now) c
   where not exists (select 1 from public.gl_accounts a where a.code = c)
   limit 1;
  if v_stray is not null then
    raise exception 'That account is not in the chart.'
      using errcode = '22023', detail = 'order_unknown_account';
  end if;

  select c into v_stray
    from unnest(p_now) c
   where not (c = any (v_children))
   limit 1;
  if v_stray is not null then
    raise exception 'Move an account only among the accounts under the same heading.'
      using errcode = '22023', detail = 'order_not_sibling';
  end if;

  -- Nothing stray and nothing duplicated, so a set that still differs can only
  -- be a list that left an account out.
  select array_agg(c order by c) into v_sent from unnest(p_now) c;
  if v_sent is distinct from v_children then
    raise exception 'Send every account under this heading, in the order you want them.'
      using errcode = '22023', detail = 'order_incomplete';
  end if;

  update public.gl_accounts a
     set sort_order = o.ord::integer
    from unnest(p_now) with ordinality o(code, ord)
   where a.code = o.code
     and a.sort_order is distinct from o.ord::integer;

  return array_length(p_now, 1);
end;
$fn$;

comment on function public.gl_accounts_reorder(text, text[], text[]) is
  '0557: reorders the accounts under one heading, whole or not at all, and refuses a list drawn from an order somebody has already replaced. No account number, name or parent changes. Finance or principal.';
revoke all on function public.gl_accounts_reorder(text, text[], text[]) from public, anon;
grant execute on function public.gl_accounts_reorder(text, text[], text[]) to authenticated;

do $sanity$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'gl_accounts' and column_name = 'sort_order'
       and is_nullable = 'NO' and column_default = '0'
  ) then
    raise exception '0557 sanity: gl_accounts.sort_order is missing, nullable, or has no default';
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.gl_accounts'::regclass
       and tgname = 'gl_accounts_sort_order_default_trg'
       and not tgisinternal
  ) then
    raise exception '0557 sanity: the new-account placement trigger is missing';
  end if;
  -- A trigger that exists and does nothing would let a new account jump to the
  -- top of a dragged heading, which is the whole reason it exists.
  if position('v_max + 1' in
              pg_get_functiondef('public.gl_accounts_sort_order_default()'::regprocedure)) = 0 then
    raise exception '0557 sanity: the placement trigger does not put a new account behind a dragged heading';
  end if;
  if has_function_privilege('anon', 'public.gl_accounts_reorder(text, text[], text[])', 'execute')
     or not has_function_privilege('authenticated', 'public.gl_accounts_reorder(text, text[], text[])', 'execute') then
    raise exception '0557 sanity: gl_accounts_reorder grants are wrong';
  end if;
  -- The gate must be the NULL-safe form (0481/0482), not the fail-open one.
  if position('v_role is null or v_role not in' in
              pg_get_functiondef('public.gl_accounts_reorder(text, text[], text[])'::regprocedure)) = 0 then
    raise exception '0557 sanity: gl_accounts_reorder is missing the NULL-safe role gate';
  end if;
  -- The two-dragger promise is the `was` check. Without it this is
  -- last-write-wins and the header above is a lie.
  if position('p_was is distinct from v_order' in
              pg_get_functiondef('public.gl_accounts_reorder(text, text[], text[])'::regprocedure)) = 0 then
    raise exception '0557 sanity: gl_accounts_reorder does not check the order the caller saw';
  end if;
end $sanity$;
