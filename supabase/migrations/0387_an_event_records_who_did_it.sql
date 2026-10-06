-- =============================================================================
-- 0387_an_event_records_who_did_it.sql
-- SALES ORDER HISTORY · the actor is stamped ONCE, not by 118 callers
-- =============================================================================
--
-- THE MEASUREMENT THAT CAUSED THIS (2026-08-25).
--
-- The object page's History said `Unknown user · Principal`. The reader was not
-- the problem — the row was:
--
--   text                                  by_role    by_user_id
--   Order created · 0% deposit · online   principal  NULL
--
-- `0007_orders_payment_method.sql:185` writes
-- `insert into order_history (order_id, text, by_role)` and stops. It is not
-- alone: of the 118 inserts into `order_history` across this repository, 87 name
-- no `by_user_id` at all. So the ledger recorded WHICH KIND of person acted and
-- never WHICH PERSON, and `docs/orders/MASTER.md:146` calls History "the
-- append-only event ledger" — a ledger that cannot name its actor is an audit
-- trail with the audit removed.
--
-- ── WHY A TRIGGER AND NOT 87 FIXED WRITERS ──────────────────────────────────
--
-- Red line 6 forbids altering a committed migration, so "fix the writers" means
-- re-declaring 87 functions in a new one: a very large diff, every line of it a
-- chance to change behaviour that has been correct for months, to add ONE
-- column that every single caller wants set the same way.
--
-- Architecture Law D says a derived fact has ONE arithmetic. "Who did this" is
-- exactly that fact, and it currently has 118 implementations — 31 that answer
-- `auth.uid()` and 87 that answer nothing. This collapses it to one.
--
-- ── WHAT IT DOES, AND WHAT IT DELIBERATELY DOES NOT ─────────────────────────
--
-- · BEFORE INSERT, and only when `by_user_id` IS NULL. The 31 writers that
--   already stamp are untouched — an explicit value is never overwritten, so a
--   caller recording someone OTHER than the session user (an approval applied on
--   behalf of another actor) keeps saying what it meant.
--
-- · `auth.uid()` reads the request's JWT claim, NOT the database role. It works
--   inside SECURITY DEFINER functions for that reason: PostgREST sets the claim
--   for the request, and the definer's own privileges do not disturb it.
--
-- · A write with no end user — a cron, a trigger cascade, the service role —
--   leaves NULL, and the page says `Unknown user`. That is the honest answer and
--   it stays the answer. This migration makes the ledger record a person when
--   there IS one; it never invents one.
--
-- · NO BACKFILL. Rows already written have no actor to recover — the id was
--   never captured, so there is nothing to restore from. CLAUDE.md §6 forbids
--   the backfill anyway: every row today is test data and go-live starts clean.
--
-- · NO RLS CHANGE. Reading a name is still governed by `0002` and `0235`, and
--   whether the reader may resolve an id is a separate question from whether
--   the ledger recorded one. This migration answers only the second.
--
-- IDEMPOTENT: `create or replace` + `drop trigger if exists`. Safe to re-run.
-- =============================================================================

begin;

create or replace function public.order_history_stamp_actor()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Only fill a blank. An explicit actor is the caller's deliberate statement
  -- about who acted and outranks the session's own identity.
  if new.by_user_id is null then
    new.by_user_id := auth.uid();
  end if;
  return new;
end;
$$;

comment on function public.order_history_stamp_actor() is
  'BEFORE INSERT on order_history: fills by_user_id from auth.uid() when the '
  'caller left it null. Never overwrites an explicit actor; leaves null for '
  'service-role/cron writes, which the UI renders as "Unknown user". 0387.';

drop trigger if exists order_history_stamp_actor on public.order_history;
create trigger order_history_stamp_actor
  before insert on public.order_history
  for each row
  execute function public.order_history_stamp_actor();

commit;

-- ── VERIFY (run by hand; this file asserts no row count — red line 8) ────────
--
--   select tgname, tgenabled
--   from pg_trigger
--   where tgrelid = 'public.order_history'::regclass and not tgisinternal;
--
-- Then place any order through the portal and read its newest history row:
--
--   select text, by_role, by_user_id
--   from order_history
--   order by occurred_at desc
--   limit 1;
--
-- `by_user_id` should now carry the acting account. An event written before
-- this migration keeps its NULL for ever — that is expected, not a failure.
--
-- ── STILL OPEN AFTER THIS, and deliberately out of scope ────────────────────
--
-- `po_history` has the identical defect and the identical one-line remedy, but
-- Purchasing owns that table. Flagged rather than fixed here: a migration that
-- reaches into another module's table to be helpful is how two owners end up
-- editing one record.
