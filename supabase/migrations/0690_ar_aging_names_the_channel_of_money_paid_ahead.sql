-- =============================================================================
-- 0690_ar_aging_names_the_channel_of_money_paid_ahead.sql
-- =============================================================================
-- THE RULING (Chew 2026-10-12, 「可以，补上 AR Aging 的 Channel」;
--   docs/finance/MASTER.md §3.6): a debtor whose money is paid ahead of an
--   invoice shows its channel too. Until now AR Aging named the channel only
--   from open invoices, so a customer with only a deposit showed none.
--
-- WHAT THIS CHANGES
--   fin_ar_aging(p_as_at) returns, for each debtor, the channels its balance
--   sits in on the day: its lines on the debtor accounts, added up by the
--   department the reports already give each line (gl_line_departments, the
--   one arithmetic: an invoice's or a payment's order, or the department its
--   entry names). A channel whose lines add up to RM 0.00 is left out. So a
--   deposit names its order's channel, an invoice paid in part names its own,
--   and money posted before 0685 on 300-0000 names its order's channel as
--   well. Nothing else in the answer changes.
--
-- GRANTS: unchanged (Finance or principal, through gl_report_guard).
-- RLS: none. DATA: none. DR/CR: none.
-- =============================================================================

begin;

set local search_path = public, pg_temp;

-- Replace one exact snippet of a live function; refuse unless it occurs once.
create or replace function pg_temp.mig0690_rewrite(p_fn regprocedure, p_old text, p_new text)
returns void
language plpgsql
as $rw$
declare
  v_def text := replace(pg_get_functiondef(p_fn), E'\r\n', E'\n');
  v_n   integer;
begin
  v_n := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
  if v_n <> 1 then
    raise exception '0690: % holds the text to change % times, not once: %', p_fn, v_n, left(p_old, 90);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$rw$;

-- Each debtor-account line keeps its id, so its department can be found.
select pg_temp.mig0690_rewrite('public.fin_ar_aging(date)'::regprocedure,
$old$    select l.account_code, l.party_type, l.party_id, l.debit, l.credit
$old$,
$new$    select l.id as line_id, l.account_code, l.party_type, l.party_id, l.debit, l.credit
$new$);

-- The channels each debtor's balance sits in.
select pg_temp.mig0690_rewrite('public.fin_ar_aging(date)'::regprocedure,
$old$  party_balance as (
    select ln.party_type, ln.party_id, sum(ln.debit - ln.credit) as balance
      from ln
     where ln.party_id is not null
     group by ln.party_type, ln.party_id
  ),
$old$,
$new$  party_balance as (
    select ln.party_type, ln.party_id, sum(ln.debit - ln.credit) as balance
      from ln
     where ln.party_id is not null
     group by ln.party_type, ln.party_id
  ),
  -- 0690: the channels a debtor's balance sits in, by the department the
  -- reports give each line (gl_line_departments). RM 0.00 in a channel is no
  -- channel.
  party_channel as (
    select ln.party_type, ln.party_id, d.department_type, d.department_id,
           sum(ln.debit - ln.credit) as amount
      from ln
      join public.gl_line_departments d on d.line_id = ln.line_id
     where ln.party_id is not null
     group by ln.party_type, ln.party_id, d.department_type, d.department_id
    having sum(ln.debit - ln.credit) <> 0
  ),
$new$);

select pg_temp.mig0690_rewrite('public.fin_ar_aging(date)'::regprocedure,
$old$               'balance',    coalesce(pb.balance, 0),
$old$,
$new$               'balance',    coalesce(pb.balance, 0),
               'channels',   coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'department_type', pc.department_type,
                          'department_id',   pc.department_id,
                          'amount',          pc.amount)
                        order by pc.department_type, pc.department_id)
                   from party_channel pc
                  where pc.party_type = p.party_type
                    and pc.party_id is not distinct from p.party_id), '[]'::jsonb),
$new$);

comment on function public.fin_ar_aging(date) is
  '0686: AR aging (Chew 2026-10-03, 2026-10-12). Read only: the debtor control accounts on a day, each debtor''s balance on them, and its invoices still open that day (a customer''s order money fills its earliest invoice first; an other debtor''s receipts by allocation). 0690: each debtor''s balance by channel (gl_line_departments).';

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_src text;
begin
  select pg_get_functiondef('public.fin_ar_aging(date)'::regprocedure) into v_src;
  if position('party_channel' in v_src) = 0 or position('gl_line_departments' in v_src) = 0
     or position('''channels''' in v_src) = 0 then
    raise exception '0690: AR aging does not give each debtor''s channels';
  end if;
  if position('gl_report_guard()' in v_src) = 0 then
    raise exception '0690: AR aging lost its guard';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'fin_ar_aging'
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0690: fin_ar_aging lost security definer or its search_path';
  end if;
  if has_function_privilege('anon', 'public.fin_ar_aging(date)', 'execute') then
    raise exception '0690: AR aging is open to anon';
  end if;
end $sanity$;

commit;
