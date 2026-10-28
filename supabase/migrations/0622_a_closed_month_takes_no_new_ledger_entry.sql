-- ════════════════════════════════════════════════════════════════════════════
-- 0622 · A CLOSED MONTH TAKES NO NEW LEDGER ENTRY
--        (YH, 2026-09-30 — Finance month lock)
--
-- WHAT WAS MISSING
-- Nothing stopped a ledger entry dated in a month Finance had already
-- reported. A bill confirmed today with a bill date in August, a receipt keyed
-- with last month's date, a void of an August document: each one changes
-- August's trial balance after August's numbers went out.
--
-- WHAT THIS CHANGES
-- 1. gl_config (0461, the ledger's one-row settings table, beside go_live_on)
--    gets books_closed_through: the last closed day. NULL means no month is
--    closed. It is added NULL, so nothing changes until the principal sets it.
--
-- 2. A BEFORE INSERT OR UPDATE OF entry_date trigger on gl_entries refuses a
--    row dated on or before that day. Measured on a database built from main
--    (0001 to 0614): gl_post is the only function that inserts into
--    gl_entries, and every posting door reaches it (the document doors
--    directly, and gl_reverse through it). The guard sits on the table, not in
--    gl_post, because gl_post has been re-created five times (0462, 0468,
--    0478, 0540, 0580); a guard inside its body is lost the next time someone
--    re-creates it from an older copy. A trigger on the table survives that.
--
--    A reversal is refused the same way. gl_reverse dates the contra on the
--    original's date, so voiding a document from a closed month is refused
--    until the principal moves the date back. Its sentence says so.
--
--    The refusal is 22023 with DETAIL books_closed. The API passes 22023's
--    message and tag through (route-helpers.ts mapPgError), so every form
--    shows the sentence.
--
--    The trigger function is SECURITY DEFINER so it reads gl_config past RLS.
--    Read as the caller, a caller the gl_config policy hides the row from
--    would read NULL, and NULL means "nothing closed": the guard would fail
--    open.
--
-- 3. gl_set_books_closed_through(date) sets or clears the day. Principal only,
--    forward and back alike (whether Finance may reopen is an open owner
--    question). The gate is is_principal() (0266), which is coalesce(..., false),
--    so a caller with no role, a disabled account and anon are all refused;
--    anon also holds no EXECUTE (0482). The day must have ended: it must be
--    before today in UTC, which is the earlier of the two clocks. Invoices post
--    on issued_at::date in the session time zone, so a day that has ended in
--    Malaysia but not in UTC could still receive postings. Every change writes
--    an audit_log row.
--
-- READS: gl_config is already readable by finance and principal (0461 policy
-- gl_config_read_internal). No new read function.
-- RLS: no policy changes.
-- GRANTS: EXECUTE on gl_set_books_closed_through to authenticated only.
-- DR / CR: none. Nothing here posts or changes a posted row.
-- Re-runnable: add column if not exists, create or replace, the trigger is
-- dropped and created.
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table public.gl_config add column if not exists books_closed_through date;

comment on column public.gl_config.books_closed_through is
  '0622. The last closed day. The ledger refuses every entry dated on or before it. NULL: no month is closed. Set only by gl_set_books_closed_through (principal).';

-- ── the guard ───────────────────────────────────────────────────────────────
create or replace function public.gl_entries_refuse_closed_month()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_closed date;
begin
  select c.books_closed_through into v_closed from public.gl_config c where c.id;
  if v_closed is null then
    return new;
  end if;
  if new.entry_date <= v_closed
     or (tg_op = 'UPDATE' and old.entry_date <= v_closed) then
    if new.source_type like '%\_REVERSAL' then
      raise exception 'The books are closed up to %. An entry dated % cannot be reversed.',
        to_char(v_closed, 'FMDD Mon YYYY'), to_char(new.entry_date, 'FMDD Mon YYYY')
        using errcode = '22023', detail = 'books_closed';
    end if;
    raise exception 'The books are closed up to %. Date this in an open month.',
      to_char(v_closed, 'FMDD Mon YYYY')
      using errcode = '22023', detail = 'books_closed';
  end if;
  return new;
end;
$fn$;

comment on function public.gl_entries_refuse_closed_month() is
  '0622. Trigger on gl_entries: refuses an entry dated on or before gl_config.books_closed_through (22023, books_closed). Security definer so the read never fails open.';

revoke all on function public.gl_entries_refuse_closed_month() from public, anon, authenticated;

drop trigger if exists gl_entries_refuse_closed_month_trg on public.gl_entries;
create trigger gl_entries_refuse_closed_month_trg
  before insert or update of entry_date on public.gl_entries
  for each row execute function public.gl_entries_refuse_closed_month();

-- ── the setter ──────────────────────────────────────────────────────────────
create or replace function public.gl_set_books_closed_through(p_date date)
returns date
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
begin
  if not public.is_principal() then
    raise exception 'Only the principal may close or reopen a month.'
      using errcode = '42501', detail = 'forbidden';
  end if;
  if p_date is not null and p_date >= (now() at time zone 'UTC')::date then
    raise exception 'Choose a day that has ended. % has not ended yet.', to_char(p_date, 'FMDD Mon YYYY')
      using errcode = '22023', detail = 'books_closed_not_ended';
  end if;

  update public.gl_config
     set books_closed_through = p_date,
         updated_at = now(),
         updated_by = v_uid
   where id;
  if not found then
    raise exception 'gl_config has no row. The ledger was never started.'
      using errcode = 'P0002', detail = 'no_config';
  end if;

  insert into public.audit_log (role, actor_text, action, ref)
  values (public.app_role(),
          (select u.name from public.app_users u where u.id = v_uid),
          case when p_date is null then 'Books reopened · no month is closed'
               else format('Books closed up to %s', to_char(p_date, 'FMDD Mon YYYY')) end,
          'gl_config');

  return p_date;
end;
$fn$;

comment on function public.gl_set_books_closed_through(date) is
  '0622. Principal only. Sets gl_config.books_closed_through (NULL reopens every month). The day must have ended. Writes audit_log.';

revoke all on function public.gl_set_books_closed_through(date) from public, anon;
grant execute on function public.gl_set_books_closed_through(date) to authenticated;

-- ── sanity ──────────────────────────────────────────────────────────────────
do $sanity$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'gl_config'
                    and column_name = 'books_closed_through' and data_type = 'date') then
    raise exception '0622 sanity: gl_config.books_closed_through is missing';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.gl_entries'::regclass
                    and tgname = 'gl_entries_refuse_closed_month_trg'
                    and tgenabled = 'O'
                    and tgfoid = 'public.gl_entries_refuse_closed_month()'::regprocedure) then
    raise exception '0622 sanity: the closed-month trigger is not on gl_entries';
  end if;
  if not (select prosecdef from pg_proc where oid = 'public.gl_entries_refuse_closed_month()'::regprocedure) then
    raise exception '0622 sanity: the closed-month trigger function is not security definer';
  end if;
  if position('is_principal()' in pg_get_functiondef('public.gl_set_books_closed_through(date)'::regprocedure)) = 0 then
    raise exception '0622 sanity: gl_set_books_closed_through has no principal gate';
  end if;
  if has_function_privilege('anon', 'public.gl_set_books_closed_through(date)', 'execute')
     or not has_function_privilege('authenticated', 'public.gl_set_books_closed_through(date)', 'execute') then
    raise exception '0622 sanity: gl_set_books_closed_through grants are wrong';
  end if;
  if has_table_privilege('authenticated', 'public.gl_config', 'update')
     or has_table_privilege('anon', 'public.gl_config', 'update') then
    raise exception '0622 sanity: gl_config is writable outside the setter';
  end if;
end
$sanity$;

notify pgrst, 'reload schema';

commit;
