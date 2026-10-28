-- =============================================================================
-- 0675_finance_sets_the_dealer_commission_accounts.sql
-- =============================================================================
-- THE RULING (Chew 2026-10-09, 「可以，放上去」; docs/finance/MASTER.md §0
--   "Automatic posting accounts" and §3.2 step 4b): the six accounts the dealer
--   commission month close posts to (0666) are on Finance Settings → Posting
--   accounts, where Finance sees them and changes them as it changes the
--   purchase and charge accounts (0657).
--
-- WHAT THIS CHANGES
--   1. _gl_posting_account_write takes the six roles: the dealer commission,
--      renovation rebate and KPI allowance (each an expense account) and what
--      is owed for each until the dealer is paid (each a liability account).
--      Its other checks stand: an account in use, not a heading, not a control
--      or money account. Its wrong-kind sentence can name a liability.
--   2. gl_posting_accounts lists the six and says Finance may change them.
--   A change applies to postings made after it: a month already closed keeps
--   its entry, and a draft voucher keeps the lines it was raised with.
--
-- RLS: none. DATA: none. DR/CR: none.
-- =============================================================================

begin;

set local search_path = public, pg_temp;

create or replace function pg_temp.mig0675_rewrite(p_fn regprocedure, p_old text, p_new text)
returns void
language plpgsql
as $rw$
declare
  v_def text := replace(pg_get_functiondef(p_fn), E'\r\n', E'\n');
  v_n   integer;
begin
  v_n := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
  if v_n <> 1 then
    raise exception '0675: % holds the text to change % times, not once: %', p_fn, v_n, left(p_old, 90);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$rw$;

-- ── 1 · the write path takes the six ─────────────────────────────────────────
select pg_temp.mig0675_rewrite('public._gl_posting_account_write(text, text, text, text)'::regprocedure,
$old$    if p_key not in ('COST_OF_GOODS_SOLD', 'BANK_AND_PAYMENT_CHARGES', 'OTHER_INCOME') then$old$,
$new$    if p_key not in ('COST_OF_GOODS_SOLD', 'BANK_AND_PAYMENT_CHARGES', 'OTHER_INCOME',
                     -- 0675: the dealer commission month close's accounts.
                     'DEALER_COMMISSION', 'DEALER_COMMISSION_ACCRUED', 'RENOVATION_REBATE',
                     'RENOVATION_REBATE_ACCRUED', 'KPI_ALLOWANCE', 'KPI_ALLOWANCE_ACCRUED') then$new$);

select pg_temp.mig0675_rewrite('public._gl_posting_account_write(text, text, text, text)'::regprocedure,
$old$    v_need := case when p_key = 'OTHER_INCOME' then 'INCOME' else 'EXPENSE' end;$old$,
$new$    -- 0675: what a dealer is owed is a liability until it is paid.
    v_need := case when p_key = 'OTHER_INCOME' then 'INCOME'
                   when p_key in ('DEALER_COMMISSION_ACCRUED', 'RENOVATION_REBATE_ACCRUED',
                                  'KPI_ALLOWANCE_ACCRUED') then 'LIABILITY'
                   else 'EXPENSE' end;$new$);

select pg_temp.mig0675_rewrite('public._gl_posting_account_write(text, text, text, text)'::regprocedure,
$old$    raise exception 'Account % % is not an % account.', v_acc.code, v_acc.name,
        case v_need when 'INCOME' then 'income' else 'expense' end$old$,
$new$    raise exception 'Account % % is not % account.', v_acc.code, v_acc.name,
        case v_need when 'INCOME' then 'an income' when 'LIABILITY' then 'a liability' else 'an expense' end$new$);

-- ── 2 · the page lists them ──────────────────────────────────────────────────
select pg_temp.mig0675_rewrite('public.gl_posting_accounts()'::regprocedure,
$old$               'changeable', r.role in ('COST_OF_GOODS_SOLD', 'BANK_AND_PAYMENT_CHARGES', 'OTHER_INCOME'),$old$,
$new$               'changeable', r.role in ('COST_OF_GOODS_SOLD', 'BANK_AND_PAYMENT_CHARGES', 'OTHER_INCOME',
                                        'DEALER_COMMISSION', 'DEALER_COMMISSION_ACCRUED', 'RENOVATION_REBATE',
                                        'RENOVATION_REBATE_ACCRUED', 'KPI_ALLOWANCE', 'KPI_ALLOWANCE_ACCRUED'),   -- 0675$new$);

select pg_temp.mig0675_rewrite('public.gl_posting_accounts()'::regprocedure,
$old$       where r.role in ('COST_OF_GOODS_SOLD', 'BANK_AND_PAYMENT_CHARGES', 'OTHER_INCOME',
                        'TRADE_PAYABLE',$old$,
$new$       where r.role in ('COST_OF_GOODS_SOLD', 'BANK_AND_PAYMENT_CHARGES', 'OTHER_INCOME',
                        'DEALER_COMMISSION', 'DEALER_COMMISSION_ACCRUED', 'RENOVATION_REBATE',   -- 0675
                        'RENOVATION_REBATE_ACCRUED', 'KPI_ALLOWANCE', 'KPI_ALLOWANCE_ACCRUED',
                        'TRADE_PAYABLE',$new$);

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_src text;
begin
  select pg_get_functiondef('public._gl_posting_account_write(text, text, text, text)'::regprocedure) into v_src;
  if position('''KPI_ALLOWANCE_ACCRUED'') then ''LIABILITY''' in v_src) = 0
     or position('''RENOVATION_REBATE_ACCRUED'', ''KPI_ALLOWANCE'', ''KPI_ALLOWANCE_ACCRUED'') then' in v_src) = 0
     or position('''a liability''' in v_src) = 0
     or position('v_acc.is_control or exists' in v_src) = 0 then
    raise exception '0675: the write path does not take the dealer accounts, or lost a check';
  end if;
  select pg_get_functiondef('public.gl_posting_accounts()'::regprocedure) into v_src;
  if (length(v_src) - length(replace(v_src, '''KPI_ALLOWANCE_ACCRUED''', ''))) / length('''KPI_ALLOWANCE_ACCRUED''') <> 2
     or position('gl_may_read' in v_src) = 0 then
    raise exception '0675: the page does not list the dealer accounts, or lost its check';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('_gl_posting_account_write', 'gl_posting_accounts')
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0675: a posting account function lost security definer or its search_path';
  end if;
  if has_function_privilege('authenticated', 'public._gl_posting_account_write(text, text, text, text)', 'execute') then
    raise exception '0675: the write path can be called around its door';
  end if;
end $sanity$;

commit;
