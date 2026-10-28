-- =============================================================================
-- 0639_general_ledger_lists_every_account_for_a_period.sql
-- =============================================================================
-- WHAT WAS MISSING
--   The Journal shows one account's lines with a running balance, one account
--   at a time. Finance had no General Ledger: every account for a period, each
--   with its balance brought forward, its lines and its balance at the end, to
--   read and to file at month-end. Chew (Finance) listed it on 2026-10-03
--   (docs/finance/MASTER.md §3.6 and §4), after the Houzs reference (Part 10 §7).
--
-- WHAT THIS ADDS
--   fin_general_ledger(p_from, p_to, p_accounts, p_department_type,
--   p_department_id) → jsonb. READ ONLY.
--
--   For every account that takes postings (or only the accounts named), in
--   code order, the rows gl_account_ledger (0540) answers for the period:
--   OPENING, each LINE with its running balance, CLOSING. An account with
--   nothing brought forward and nothing in the period is left out. The figures
--   are gl_account_ledger's own, so the General Ledger and the Journal's
--   running balance can never disagree; this function only gathers them.
--
--   Refusals are the ledger reports' own: gl_report_guard (Finance or
--   principal, and a ledger that has started), a missing date (22004) and a
--   period that runs backwards (22007). A period that ends before go-live
--   answers BEFORE_GO_LIVE instead of a page of zeros.
--
-- RLS: none new. DATA: none. DR/CR: none.
-- =============================================================================

begin;

create or replace function public.fin_general_ledger(
  p_from            date,
  p_to              date,
  p_accounts        text[] default null,
  p_department_type text   default null,
  p_department_id   uuid   default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_go_live  date;
  v_code     text;
  v_rows     jsonb;
  v_accounts jsonb := '[]'::jsonb;
begin
  v_go_live := public.gl_report_guard();

  if p_from is null or p_to is null then
    raise exception 'fin_general_ledger: p_from and p_to are both required'
      using errcode = '22004';
  end if;
  if p_to < p_from then
    raise exception 'fin_general_ledger: p_to (%) is earlier than p_from (%)', p_to, p_from
      using errcode = '22007';
  end if;

  if p_to < v_go_live then
    return jsonb_build_object('status', 'BEFORE_GO_LIVE', 'go_live_on', v_go_live,
                              'from', p_from, 'to', p_to, 'accounts', '[]'::jsonb);
  end if;

  for v_code in
    select a.code
      from public.gl_accounts a
     where (p_accounts is null or a.code = any (p_accounts))
       and not exists (select 1 from public.gl_accounts c where c.parent_code = a.code)
       and exists (select 1
                     from public.gl_department_lines(p_department_type, p_department_id) l
                     join public.gl_entries e on e.id = l.entry_id
                    where e.posted
                      and l.account_code = a.code
                      and e.entry_date <= p_to)
     order by a.code
  loop
    select jsonb_agg(to_jsonb(x) order by x.ordinal)
      into v_rows
      from public.gl_account_ledger(v_code, p_from, p_to, p_department_type, p_department_id) x;

    -- Nothing brought forward and nothing in the period: no block.
    if exists (select 1 from jsonb_array_elements(v_rows) r where r->>'row_kind' = 'LINE')
       or exists (select 1 from jsonb_array_elements(v_rows) r
                   where r->>'row_kind' = 'OPENING' and (r->>'running_balance')::numeric <> 0) then
      v_accounts := v_accounts || jsonb_build_array(jsonb_build_object('account_code', v_code, 'rows', v_rows));
    end if;
  end loop;

  return jsonb_build_object('status', 'OK', 'go_live_on', v_go_live,
                            'from', p_from, 'to', p_to, 'accounts', v_accounts);
end;
$fn$;

revoke all on function public.fin_general_ledger(date, date, text[], text, uuid) from public, anon;
grant execute on function public.fin_general_ledger(date, date, text[], text, uuid) to authenticated;

comment on function public.fin_general_ledger(date, date, text[], text, uuid) is
  '0639: General Ledger (Chew 2026-10-03). Read only: gl_account_ledger''s rows for every account that moved or carries a balance, in code order.';

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
begin
  if has_function_privilege('anon', 'public.fin_general_ledger(date, date, text[], text, uuid)', 'execute') then
    raise exception '0639 sanity: the General Ledger is open to anon';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'fin_general_ledger'
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0639 sanity: fin_general_ledger lost security definer or its search_path';
  end if;
  if (select provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'fin_general_ledger') <> 's' then
    raise exception '0639 sanity: fin_general_ledger must be STABLE (read only)';
  end if;
end
$sanity$;

commit;
