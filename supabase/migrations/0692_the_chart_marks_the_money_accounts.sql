-- =============================================================================
-- 0692_the_chart_marks_the_money_accounts.sql
-- =============================================================================
-- THE RULING (Chew 2026-10-13, 「对，做」; docs/finance/MASTER.md §0
--   "One place for the money accounts"):
--   Chart of accounts is the one place that says an account holds money. Its
--   special type marks it: SBK a bank, SCH cash (AutoCount's), and HLD a card
--   or online payment company's holding account, which AutoCount has no type
--   for. The Money accounts tab of Finance Settings goes; its add button and
--   its Active switch move onto Chart of accounts.
--
-- WHY: until now gl_money_accounts (0512) said which accounts hold money, and
--   0656's special type said it again on the chart, read by nothing. Two marks
--   for one fact can disagree.
--
-- WHAT THIS CHANGES
--   1. gl_accounts.special takes HLD too, and gl_accounts.money_in_use is the
--      money account's own switch (0512's is_active): an account the ledger
--      posted to is never retired (0462), so a bank at RM 0.00 is taken out of
--      use without being retired. It is set exactly when the special type is
--      SBK, SCH or HLD; such an account is a plain asset account, never a
--      heading or a control account.
--   2. Every row of gl_money_accounts moves onto its account: BANK -> SBK,
--      CASH -> SCH, HOLDING -> HLD, is_active -> money_in_use.
--   3. gl_money_accounts is no longer a table but a view of the chart, with
--      the same three columns every reader uses (account_code, money_kind,
--      is_active). The 22 functions that read it are unchanged. The card
--      payout routes now point at the chart's account itself.
--   4. gl_money_account_add writes the special type and money_in_use;
--      gl_money_account_update switches money_in_use, with the same refusals
--      (RM 0.00, no payment method on it).
--   5. The chart import never fills SBK or SCH on an account already in the
--      chart: making a money account is Add a money account's job. The
--      sentences that sent Finance to the Money accounts tab now name
--      Add a money account or the account's Active switch.
--
-- RLS: the table's read policy (gl_may_read) goes with the table. The view is
--   security_invoker, so it reads through gl_accounts' own policy, which is the
--   same gl_may_read. Who may read is unchanged; nobody may write either.
-- DATA: the special type and switch of each money account. DR/CR: none.
-- =============================================================================

begin;

set local search_path = public, pg_temp;

-- ── 1 · the chart carries the mark ──────────────────────────────────────────
alter table public.gl_accounts drop constraint gl_accounts_special_known;
alter table public.gl_accounts add constraint gl_accounts_special_known
  check (special is null or special in ('SFA', 'SAD', 'SBK', 'SCH', 'HLD', 'SDC', 'SCC', 'SRE', 'SBS', 'SOS', 'SCS'));

alter table public.gl_accounts add column money_in_use boolean;

comment on column public.gl_accounts.special is
  '0656, 0692: AutoCount''s special account type, shown beside the name. SBK (bank), SCH (cash) and HLD (a card or online payment company''s holding account, Carres''s own) mark the money accounts.';
comment on column public.gl_accounts.money_in_use is
  '0692: a money account''s switch (SBK, SCH, HLD): false takes it out of every picker without retiring it. Null on every other account.';

-- ── 2 · the list moves onto the chart ───────────────────────────────────────
create temp table mig0692_was on commit drop as
  select account_code, money_kind, is_active from public.gl_money_accounts;

do $move$
declare
  v_bad text;
begin
  select string_agg(a.code || ' ' || a.special, ', ') into v_bad
    from public.gl_accounts a join mig0692_was m on m.account_code = a.code
   where a.special is not null
     and a.special <> case m.money_kind when 'BANK' then 'SBK' when 'CASH' then 'SCH' else 'HLD' end;
  if v_bad is not null then
    raise exception '0692: a money account already has another special type: %', v_bad;
  end if;
  select string_agg(a.code, ', ') into v_bad
    from public.gl_accounts a
   where a.special in ('SBK', 'SCH')
     and not exists (select 1 from mig0692_was m where m.account_code = a.code);
  if v_bad is not null then
    raise exception '0692: marked SBK or SCH in the chart but not a money account: %', v_bad;
  end if;
end;
$move$;

update public.gl_accounts a
   set special      = case m.money_kind when 'BANK' then 'SBK' when 'CASH' then 'SCH' else 'HLD' end,
       money_in_use = m.is_active
  from mig0692_was m
 where a.code = m.account_code;

alter table public.gl_accounts add constraint gl_accounts_money_in_use_marks_money
  check (coalesce(special in ('SBK', 'SCH', 'HLD'), false) = (money_in_use is not null));
alter table public.gl_accounts add constraint gl_accounts_money_account_is_plain
  check (not coalesce(special in ('SBK', 'SCH', 'HLD'), false)
         or (kind = 'ASSET' and not is_control and not is_heading));

-- ── 3 · the list is a view of the chart ─────────────────────────────────────
alter table public.card_settlement_routes drop constraint card_settlement_routes_holding_code_fkey;
alter table public.card_settlement_routes drop constraint card_settlement_routes_bank_code_fkey;

drop table public.gl_money_accounts;

create view public.gl_money_accounts with (security_invoker = true) as
  select a.code as account_code,
         case a.special when 'SBK' then 'BANK' when 'SCH' then 'CASH' else 'HOLDING' end as money_kind,
         a.money_in_use as is_active
    from public.gl_accounts a
   where a.special in ('SBK', 'SCH', 'HLD');

comment on view public.gl_money_accounts is
  '0512, 0692: the money accounts, read from the chart''s special type (SBK bank, SCH cash, HLD card and online holding). CASH and BANK may pay out and take money in; HOLDING only takes money in. is_active is gl_accounts.money_in_use.';

revoke all on public.gl_money_accounts from public, anon, authenticated;
grant select on public.gl_money_accounts to authenticated;

alter table public.card_settlement_routes
  add constraint card_settlement_routes_holding_code_fkey
    foreign key (holding_code) references public.gl_accounts(code) on update cascade,
  add constraint card_settlement_routes_bank_code_fkey
    foreign key (bank_code) references public.gl_accounts(code) on update cascade;

-- ── 4 · the doors write the chart ───────────────────────────────────────────
create or replace function pg_temp.mig0692_rewrite(p_fn regprocedure, p_old text, p_new text)
returns void
language plpgsql
as $rw$
declare
  v_def text := replace(pg_get_functiondef(p_fn), E'\r\n', E'\n');
  v_n   integer;
begin
  v_n := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
  if v_n <> 1 then
    raise exception '0692: % holds the text to change % times, not once: %', p_fn, v_n, left(p_old, 90);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$rw$;

-- (a) adding a money account marks it on the chart.
select pg_temp.mig0692_rewrite('public.gl_money_account_add(text, text, text)'::regprocedure,
$old$  insert into public.gl_accounts (code, name, kind, parent_code, is_control, is_active, control_for)
  values (v_code, v_name, 'ASSET', v_head.code, false, true, null);
  insert into public.gl_money_accounts (account_code, money_kind, created_by, updated_by)
  values (v_code, p_kind, auth.uid(), auth.uid());$old$,
$new$  -- 0692: the chart's special type is the mark; money_in_use its switch.
  insert into public.gl_accounts (code, name, kind, parent_code, is_control, is_active, control_for,
                                  special, money_in_use)
  values (v_code, v_name, 'ASSET', v_head.code, false, true, null,
          case p_kind when 'BANK' then 'SBK' else 'HLD' end, true);$new$);

-- (b) taking one in or out of use switches money_in_use, on the chart's row.
select pg_temp.mig0692_rewrite('public.gl_money_account_update(text, text, boolean)'::regprocedure,
$old$  v_m      public.gl_money_accounts%rowtype;$old$,
$new$  v_m      record;$new$);
select pg_temp.mig0692_rewrite('public.gl_money_account_update(text, text, boolean)'::regprocedure,
$old$  select * into v_m from public.gl_money_accounts where account_code = p_code for update;$old$,
$new$  -- 0692: the list is the chart's; its row is the one locked.
  perform 1 from public.gl_accounts a where a.code = p_code for update;
  select * into v_m from public.gl_money_accounts where account_code = p_code;$new$);
select pg_temp.mig0692_rewrite('public.gl_money_account_update(text, text, boolean)'::regprocedure,
$old$  update public.gl_money_accounts
     set is_active  = coalesce(p_is_active, v_m.is_active),
         updated_at = now(),
         updated_by = auth.uid()
   where account_code = p_code;$old$,
$new$  update public.gl_accounts
     set money_in_use = coalesce(p_is_active, v_m.is_active)
   where code = p_code;$new$);

-- (c) a card payout route waits on the chart's rows.
select pg_temp.mig0692_rewrite('public.card_settlement_route_set(text, text, text)'::regprocedure,
$old$  perform 1 from public.gl_money_accounts
    where account_code in (p_holding, p_bank) order by account_code for share;$old$,
$new$  perform 1 from public.gl_accounts
    where code in (p_holding, p_bank) order by code for share;$new$);

-- (d) the import never makes an account already in the chart a money account.
select pg_temp.mig0692_rewrite('public.gl_chart_import(jsonb, boolean)'::regprocedure,
$old$coalesce(v_acc.special is null and v_special in ('SFA', 'SAD', 'SBK', 'SCH', 'SDC', 'SCC', 'SRE', 'SBS', 'SOS', 'SCS'), false);$old$,
$new$coalesce(v_acc.special is null and v_special in ('SFA', 'SAD', 'SDC', 'SCC', 'SRE', 'SBS', 'SOS', 'SCS'), false);$new$);
select pg_temp.mig0692_rewrite('public.gl_chart_import(jsonb, boolean)'::regprocedure,
$old$                         and v_special in ('SFA', 'SAD', 'SBK', 'SCH', 'SDC', 'SCC', 'SRE', 'SBS', 'SOS', 'SCS')
                        then v_special end));$old$,
$new$                         and v_special in ('SFA', 'SAD', 'SDC', 'SCC', 'SRE', 'SBS', 'SOS', 'SCS')
                        then v_special end));$new$);
select pg_temp.mig0692_rewrite('public.gl_chart_import(jsonb, boolean)'::regprocedure,
$old$is a bank or cash account. Add it in Money accounts.$old$,
$new$is a bank or cash account. Add it with Add a money account.$new$);

-- (e) the sentences that named the Money accounts tab.
select pg_temp.mig0692_rewrite('public.gl_account_add(text, text, text, text, text, boolean, text)'::regprocedure,
$old$holds the bank and cash accounts. Add a bank or cash account in Money accounts.$old$,
$new$holds the bank and cash accounts. Add a bank account with Add a money account.$new$);
select pg_temp.mig0692_rewrite('public.gl_account_set_active(text, boolean)'::regprocedure,
$old$is a bank, cash or card account. Stop using it in Money accounts.$old$,
$new$is a bank, cash or card account. Open it and untick Active instead.$new$);
select pg_temp.mig0692_rewrite('public.payment_method_account_set(text, text, text, text)'::regprocedure,
$old$is not a bank, cash or card account in use. Choose one from Money accounts.$old$,
$new$is not a bank, cash or card account in use. Choose one in use.$new$);

comment on function public.gl_money_account_add(text, text, text) is
  '0577, 0692: adds a bank or holding account under the money accounts heading (read by role), marked SBK or HLD on the chart and in use. The number is the one Finance typed, or the next free one that follows the heading''s own number. Finance or principal.';
comment on function public.gl_money_account_update(text, text, boolean) is
  '0512, 0515, 0523, 0525, 0692: renames a money account, or takes it in or out of use (gl_accounts.money_in_use). Out of use is refused while its ledger total is not RM 0.00, or while any payment method row (manual or system, on or off) points at it. Finance or principal.';

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_src text;
begin
  -- Every account the list held reads back the same.
  if exists (select account_code, money_kind, is_active from mig0692_was
             except
             select account_code, money_kind, is_active from public.gl_money_accounts)
     or exists (select account_code, money_kind, is_active from public.gl_money_accounts
                except
                select account_code, money_kind, is_active from mig0692_was) then
    raise exception '0692: the money accounts read back differently from the list they came from';
  end if;

  select pg_get_functiondef('public.gl_money_account_update(text, text, boolean)'::regprocedure) into v_src;
  if position('money_in_use' in v_src) = 0 or position('money_account_not_zero' in v_src) = 0
     or position('money_account_used_by_method' in v_src) = 0 then
    raise exception '0692: gl_money_account_update lost a refusal or does not switch money_in_use';
  end if;
  select pg_get_functiondef('public.gl_chart_import(jsonb, boolean)'::regprocedure) into v_src;
  if position('''SBK'', ''SCH'', ''SDC''' in v_src) > 0 or position('Add it with Add a money account.' in v_src) = 0 then
    raise exception '0692: gl_chart_import may still fill SBK or SCH';
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('gl_money_account_add', 'gl_money_account_update', 'card_settlement_route_set',
                                  'gl_chart_import', 'gl_account_add', 'gl_account_set_active',
                                  'payment_method_account_set')
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0692: a rewritten function lost security definer or its search_path';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('gl_money_account_add', 'gl_money_account_update', 'card_settlement_route_set')
                and (has_function_privilege('anon', p.oid, 'execute')
                     or not has_function_privilege('authenticated', p.oid, 'execute'))) then
    raise exception '0692: a rewritten door changed who may call it';
  end if;
  if has_table_privilege('anon', 'public.gl_money_accounts', 'select')
     or has_table_privilege('authenticated', 'public.gl_money_accounts', 'insert')
     or not has_table_privilege('authenticated', 'public.gl_money_accounts', 'select') then
    raise exception '0692: the money accounts view is open to the wrong people';
  end if;
end;
$sanity$;

commit;
