-- =============================================================================
-- 0693_a_card_account_is_added_under_card_and_online_clearing.sql
-- =============================================================================
-- THE RULING (Chew 2026-10-13, 「修刷卡账户编号的问题」 then 「可以，做」;
--   docs/finance/MASTER.md §0 "One place for the money accounts"):
--   A card or online holding account added with Add a money account goes
--   under 315-0000 CARD & ONLINE CLEARING, beside the merchants, and takes the
--   next free number there (315-7000 today). A bank account still goes under
--   310-0000 CASH AT BANK. Like the bank and cash heading, the card heading
--   holds money accounts only.
--
-- WHY: gl_money_account_add read one heading, MONEY_ACCOUNTS_HEADING
--   (310-0000), for both kinds, so a new card account was numbered 310-6000
--   among the banks. The card heading already has its role,
--   CLEARING_ACCOUNTS_HEADING (0654, 315-0000), which nothing read.
--
-- WHAT THIS CHANGES
--   1. gl_money_account_add: a HOLDING account goes under the
--      CLEARING_ACCOUNTS_HEADING account, a BANK account under the
--      MONEY_ACCOUNTS_HEADING account, each numbered from its own heading as
--      before (0570, 0577).
--   2. gl_account_add: nothing is added through Add account in either heading,
--      or a heading inside one.
--   3. gl_account_move: only money accounts move into either heading; the
--      refusal names the heading it is about.
--   Existing accounts are not moved or renumbered.
--
-- RLS: unchanged. DATA: none. DR/CR: none.
-- =============================================================================

begin;

set local search_path = public, pg_temp;

create or replace function pg_temp.mig0693_rewrite(p_fn regprocedure, p_old text, p_new text)
returns void
language plpgsql
as $rw$
declare
  v_def text := replace(pg_get_functiondef(p_fn), E'\r\n', E'\n');
  v_n   integer;
begin
  v_n := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
  if v_n <> 1 then
    raise exception '0693: % holds the text to change % times, not once: %', p_fn, v_n, left(p_old, 90);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$rw$;

-- (1) a card account under the card heading, a bank under the bank heading.
select pg_temp.mig0693_rewrite('public.gl_money_account_add(text, text, text)'::regprocedure,
$old$   where a.code = public.gl_account_for('MONEY_ACCOUNTS_HEADING');$old$,
$new$   where a.code = public.gl_account_for(case p_kind when 'HOLDING' then 'CLEARING_ACCOUNTS_HEADING'
                                                    else 'MONEY_ACCOUNTS_HEADING' end);  -- 0693$new$);

-- (2) Add account adds nothing in either money heading.
select pg_temp.mig0693_rewrite('public.gl_account_add(text, text, text, text, text, boolean, text)'::regprocedure,
$old$      select 1 from up where up.code = public.gl_account_for('MONEY_ACCOUNTS_HEADING')$old$,
$new$      select 1 from up where up.code in (public.gl_account_for('MONEY_ACCOUNTS_HEADING'),
                                         public.gl_account_for('CLEARING_ACCOUNTS_HEADING'))  -- 0693$new$);
select pg_temp.mig0693_rewrite('public.gl_account_add(text, text, text, text, text, boolean, text)'::regprocedure,
$old$holds the bank and cash accounts. Add a bank account with Add a money account.$old$,
$new$holds money accounts. Add one with Add a money account.$new$);

-- (3) only money accounts move into either heading; the refusal names the one
--     above where the account would go.
select pg_temp.mig0693_rewrite('public.gl_account_move(text, text, text[], text[], text[], text[])'::regprocedure,
$old$   where a.code = public.gl_account_for('MONEY_ACCOUNTS_HEADING');$old$,
$new$   where a.code in (public.gl_account_for('MONEY_ACCOUNTS_HEADING'),
                    public.gl_account_for('CLEARING_ACCOUNTS_HEADING'))   -- 0693
     and a.code in (
           with recursive up(code) as (
             select p_to_parent
             union
             select g.parent_code from public.gl_accounts g join up on g.code = up.code
              where g.parent_code is not null
           )
           select up.code from up)
   limit 1;$new$);
select pg_temp.mig0693_rewrite('public.gl_account_move(text, text, text[], text[], text[], text[])'::regprocedure,
$old$'% % is not a bank or cash account. Only bank and cash accounts go under % %.'$old$,
$new$'% % is not a money account. Only money accounts go under % %.'$new$);
select pg_temp.mig0693_rewrite('public.gl_account_move(text, text, text[], text[], text[], text[])'::regprocedure,
$old$'% % holds % %, which is not a bank or cash account. Only bank and cash accounts go under % %.'$old$,
$new$'% % holds % %, which is not a money account. Only money accounts go under % %.'$new$);

comment on function public.gl_money_account_add(text, text, text) is
  '0577, 0692, 0693: adds a bank account under the money accounts heading, or a card and online holding account under the card and online clearing heading (each read by role), marked SBK or HLD on the chart and in use. The number is the one Finance typed, or the next free one that follows its heading''s own number. Finance or principal.';

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_src text;
begin
  -- The card heading is a heading, and holds money accounts only.
  if not exists (select 1 from public.gl_accounts a
                  where a.code = public.gl_account_for('CLEARING_ACCOUNTS_HEADING') and a.is_heading) then
    raise exception '0693: the card and online clearing account is not a heading';
  end if;
  if exists (
    with recursive down(code) as (
      select public.gl_account_for('CLEARING_ACCOUNTS_HEADING')
      union
      select c.code from public.gl_accounts c join down on c.parent_code = down.code
    )
    select 1 from public.gl_accounts a join down on down.code = a.code
     where not a.is_heading and not coalesce(a.special in ('SBK', 'SCH', 'HLD'), false)) then
    raise exception '0693: an account that is not a money account sits under the card and online clearing heading';
  end if;

  select pg_get_functiondef('public.gl_money_account_add(text, text, text)'::regprocedure) into v_src;
  if position('CLEARING_ACCOUNTS_HEADING' in v_src) = 0 or position('money_in_use' in v_src) = 0 then
    raise exception '0693: gl_money_account_add does not read the card heading or lost 0692';
  end if;
  select pg_get_functiondef('public.gl_account_move(text, text, text[], text[], text[], text[])'::regprocedure) into v_src;
  if position('CLEARING_ACCOUNTS_HEADING' in v_src) = 0 or position('move_into_money_heading' in v_src) = 0 then
    raise exception '0693: gl_account_move does not guard the card heading';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('gl_money_account_add', 'gl_account_add', 'gl_account_move')
                and (not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])
                     or has_function_privilege('anon', p.oid, 'execute')
                     or not has_function_privilege('authenticated', p.oid, 'execute'))) then
    raise exception '0693: a rewritten function lost security definer, its search_path or its grants';
  end if;
end;
$sanity$;

commit;
