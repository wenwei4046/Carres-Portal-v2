-- =============================================================================
-- 0479_every_control_account_names_who_it_belongs_to.sql
-- FINANCE LEDGER · the read the Self-check page needs, and nothing else
--
-- WHAT WAS MISSING. A control account (1210 trade receivables, 1220 supplier
-- claims, 2110 trade payables, and any the chart gains later) is only
-- trustworthy if its balance can be split into the parties who make it up.
-- 0465 answers that for ONE party at a time (`gl_party_statement`), and
-- `gl_receivables_reconcile` compares one total. Nothing answered "per party,
-- for every control account at once", and the API cannot add it up itself:
-- PostgREST does not aggregate, so the Worker would have to download every
-- control line in the ledger to sum them. That grows with every invoice and
-- every payment for as long as Carres trades.
--
-- WHAT THIS BUILDS. One read-only function, `gl_control_party_balances()`.
-- For every account where `is_control` is true it returns:
--   ACCOUNT   exactly one row: the account's own totals (a control account
--             with no lines still gets its row — an account that vanishes
--             because it never moved is how a missing posting hides).
--   PARTY     one row per party that has a line on the account, with its
--             debit, credit, natural balance and name. `party_matches` is
--             false when the line names a different KIND of party from the
--             one the account is for (a supplier on customer receivables);
--             those rows carry the entry numbers so the page can name them.
--   NO_PARTY  one row, only when some lines name no party at all, carrying
--             their entry numbers. gl_post refuses these today; the row is
--             how the page would find one that got in around the gate.
-- The account list is read from `gl_accounts`, not written in here, so a
-- control account another migration adds shows up with no change to this
-- file. The party NAME is resolved for CUSTOMER (customers.name) and SUPPLIER
-- (suppliers.name); any other party type comes back with a null name and the
-- page says so.
--
-- DR / CR. None. This file posts nothing and writes no rows.
--
-- THE 0469 RULE HOLDS. A balance sums every POSTED entry — a reversed original
-- and its contra both count and net to zero. There is no `not reversed` filter
-- anywhere in the body, and the sanity block asserts that.
--
-- ACCESS. Same gate as every other ledger report: `gl_report_guard()` —
-- finance and principal only, 42501 for anyone else, 55000 before the ledger
-- has a go-live date. security definer because the party NAMES come from
-- customers/suppliers, whose own policies are not the question here; the
-- guard is the question, and it runs first. No RLS changes.
--
-- WHAT IT DELIBERATELY DOES NOT DO. It does not compare the ledger with the
-- documents (invoices, supplier bills) — that is the API's Self-check, which
-- reads `gl_receivables_reconcile` and `ap_outstanding` beside this. It takes
-- no date: the Self-check is about the books as they stand now.
-- =============================================================================

create or replace function public.gl_control_party_balances()
returns table (
  go_live_on      date,
  account_code    text,
  account_name    text,
  kind            text,
  control_for     text,
  is_active       boolean,
  row_kind        text,
  party_type      text,
  party_id        uuid,
  party_name      text,
  party_matches   boolean,
  total_debit     numeric(14,2),
  total_credit    numeric(14,2),
  natural_balance numeric(14,2),
  line_count      bigint,
  entry_nos       text[]
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_go_live date;
begin
  v_go_live := public.gl_report_guard();

  return query
  with ctl as (
    select a.code, a.name, a.kind, a.control_for, a.is_active
      from public.gl_accounts a
     where a.is_control
  ),
  lines as (
    select l.account_code as acct,
           l.party_type   as pt,
           l.party_id     as pid,
           l.debit        as dr,
           l.credit       as cr,
           e.entry_no     as eno
      from public.gl_entry_lines l
      join public.gl_entries e on e.id = l.entry_id
      join ctl on ctl.code = l.account_code
     where e.posted
  ),
  acct as (
    select c.code, c.name, c.kind, c.control_for, c.is_active,
           coalesce(sum(li.dr), 0)::numeric(14,2) as dr,
           coalesce(sum(li.cr), 0)::numeric(14,2) as cr,
           count(li.acct)::bigint                 as n
      from ctl c
      left join lines li on li.acct = c.code
     group by c.code, c.name, c.kind, c.control_for, c.is_active
  ),
  party as (
    select li.acct, li.pt, li.pid,
           sum(li.dr)::numeric(14,2) as dr,
           sum(li.cr)::numeric(14,2) as cr,
           count(*)::bigint          as n,
           (array_agg(distinct li.eno order by li.eno))[1:20] as enos
      from lines li
     where li.pid is not null and li.pt is not null
     group by li.acct, li.pt, li.pid
  ),
  noparty as (
    select li.acct,
           sum(li.dr)::numeric(14,2) as dr,
           sum(li.cr)::numeric(14,2) as cr,
           count(*)::bigint          as n,
           (array_agg(distinct li.eno order by li.eno))[1:20] as enos
      from lines li
     where li.pid is null or li.pt is null
     group by li.acct
  ),
  body as (
    select a.code, a.name, a.kind, a.control_for, a.is_active,
           0 as sort1, 'ACCOUNT'::text as rk,
           null::text as pt, null::uuid as pid, null::text as pname, null::boolean as pm,
           a.dr, a.cr, a.n, null::text[] as enos
      from acct a
    union all
    select a.code, a.name, a.kind, a.control_for, a.is_active,
           1, 'NO_PARTY'::text,
           null::text, null::uuid, null::text, false,
           np.dr, np.cr, np.n, np.enos
      from noparty np
      join acct a on a.code = np.acct
    union all
    select a.code, a.name, a.kind, a.control_for, a.is_active,
           2, 'PARTY'::text,
           p.pt, p.pid,
           case p.pt
             when 'CUSTOMER' then (select cu.name from public.customers cu where cu.id = p.pid)
             when 'SUPPLIER' then (select su.name from public.suppliers su where su.id = p.pid)
           end,
           (p.pt is not distinct from a.control_for),
           p.dr, p.cr, p.n,
           case when p.pt is not distinct from a.control_for then null::text[] else p.enos end
      from party p
      join acct a on a.code = p.acct
  )
  select v_go_live,
         b.code, b.name, b.kind, b.control_for, b.is_active,
         b.rk, b.pt, b.pid, b.pname, b.pm,
         b.dr, b.cr,
         (case when b.kind in ('ASSET','EXPENSE') then b.dr - b.cr
               else b.cr - b.dr end)::numeric(14,2),
         b.n, b.enos
    from body b
   order by b.code, b.sort1, b.pname nulls last, b.pid;
end;
$$;

revoke all on function public.gl_control_party_balances() from public, anon;
grant execute on function public.gl_control_party_balances() to authenticated;

comment on function public.gl_control_party_balances() is
  'Self-check read (0479): every is_control account with one ACCOUNT row, one PARTY row per party (party_matches = the party kind the account is for) and a NO_PARTY row when any line names nobody. Sums every posted entry (0469). Finance and principal only.';

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_src  text;
  v_args text;
begin
  select p.prosrc, oidvectortypes(p.proargtypes)
    into v_src, v_args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'gl_control_party_balances';
  if v_src is null then
    raise exception '0479 sanity: gl_control_party_balances is missing';
  end if;
  if v_args <> '' then
    raise exception '0479 sanity: gl_control_party_balances takes no arguments, found (%)', v_args;
  end if;
  if position('gl_report_guard' in v_src) = 0 then
    raise exception '0479 sanity: gl_control_party_balances must run the report guard first';
  end if;
  if position('not e.reversed' in v_src) > 0 then
    raise exception '0479 sanity: a balance never drops reversed entries (0469)';
  end if;
  if position('where a.is_control' in v_src) = 0 then
    raise exception '0479 sanity: the control accounts must come from the chart, not a list';
  end if;

  -- Fail closed: a caller with no internal role gets an error, never rows.
  -- (In a migration there is no signed-in user, so app_role() is null.)
  begin
    perform * from public.gl_control_party_balances();
    raise exception '0479 sanity: an anonymous caller was not refused';
  exception
    when insufficient_privilege then null;   -- 42501, the expected refusal
  end;
end
$sanity$;
