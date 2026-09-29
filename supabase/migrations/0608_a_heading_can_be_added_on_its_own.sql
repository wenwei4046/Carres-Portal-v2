-- ════════════════════════════════════════════════════════════════════════════
-- 0608 · A HEADING CAN BE ADDED ON ITS OWN
--        (YH, 2026-09-29 — Finance Settings, Chart of accounts, Add account)
--
-- WHAT WAS BROKEN
-- Ticking "It is a heading" on Add account asked for a first account number
-- and name. YH typed his new heading (8000 testhead) into those fields,
-- because the form reads as if they are the heading. The ask came from 0577:
-- back then a heading was "an account with an account under it", so a heading
-- added empty would have been a posting account until its first account came.
-- 0580 made a heading a stored flag, gl_accounts.is_heading. An empty heading
-- is allowed since then: nothing posts to it, no account picker offers it, and
-- it still takes accounts. So the first account is no longer needed.
--
-- WHAT THIS CHANGES
-- gl_account_add, from its latest body (0580), takes one more argument,
-- p_is_heading, default false. The new row is a heading when p_is_heading is
-- true or a first account is given, and it is inserted with is_heading set, so
-- it is offered under Under straight away. The first account stays optional
-- and works as before. Every other line is 0580's: the Finance role check, the
-- two locks, the parent must be a heading, nothing in the money accounts
-- heading, no heading under a gl_rule_headings heading (p_is_heading now
-- counts as a heading there too), the name and number checks, and the new row
-- goes last under its heading (sort_order one past the largest).
--
-- ONE SIGNATURE. The five argument function is dropped in this file, so a
-- call can never pick the old body. Its one caller, POST /accounts, sends
-- p_is_heading from this change on. Named or five positional arguments still
-- reach the new function, because p_is_heading has a default.
--
-- RLS: unchanged. DR/CR: none. No row is read for a backfill, none rewritten.
-- No account number is written in this file: the money heading is read by role.
-- ════════════════════════════════════════════════════════════════════════════

begin;

set local search_path = public, pg_temp;

drop function if exists public.gl_account_add(text, text, text, text, text);

create or replace function public.gl_account_add(
  p_parent_code text,
  p_code        text,
  p_name        text,
  p_first_code  text    default null,
  p_first_name  text    default null,
  p_is_heading  boolean default false
)
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role  text := public.app_role()::text;
  v_head  public.gl_accounts%rowtype;
  v_hdr   public.gl_accounts%rowtype;
  v_rule  text;
  v_code  text;
  v_first text;
  -- 0608: a heading on its own, or a heading with its first account.
  v_heading boolean := coalesce(p_is_heading, false) or p_first_code is not null or p_first_name is not null;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance changes the chart of accounts.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  -- 0580: one change to the chart's structure at a time (see gl_account_move).
  perform pg_advisory_xact_lock(hashtext('gl_chart_structure'));
  -- Two people adding at once must not both pass the "already in the chart" checks.
  perform pg_advisory_xact_lock(hashtext('gl_account_add'));

  select * into v_head from public.gl_accounts a where a.code = p_parent_code for update;
  if not found then
    raise exception 'That account is not in the chart.'
      using errcode = 'P0002', detail = 'heading_not_found';
  end if;
  if not v_head.is_heading then                           -- 0580: the stored flag
    raise exception '% % is not a heading. Add the account under a heading.', v_head.code, v_head.name
      using errcode = '22023', detail = 'add_onto_account';
  end if;
  -- A bank or cash account needs its gl_money_accounts row, which only
  -- gl_money_account_add writes. So nothing is added in the money accounts
  -- heading, or in a heading inside it, through this door.
  if exists (
    with recursive up(code) as (
      select v_head.code
      union
      select a.parent_code from public.gl_accounts a join up on a.code = up.code
       where a.parent_code is not null
    )
    select 1 from up where up.code = public.gl_account_for('MONEY_ACCOUNTS_HEADING')
  ) then
    raise exception '% % holds the bank and cash accounts. Add a bank or cash account in Money accounts.', v_head.code, v_head.name
      using errcode = '22023', detail = 'add_money_account';
  end if;
  -- A gl_rule_headings heading decides how money may be recorded, and that
  -- check reads the immediate parent only. So no heading goes under one, and
  -- nothing is added under a heading inside one. A plain account directly
  -- under it is still checked by that rule.
  select u.code into v_rule from (
    with recursive up(code, depth) as (
      select v_head.code, 0
      union
      select a.parent_code, up.depth + 1 from public.gl_accounts a join up on a.code = up.code
       where a.parent_code is not null
    )
    select up.code, up.depth from up
  ) u
   where u.code = any (public.gl_rule_headings())
     and (u.depth > 0 or v_heading)                       -- 0608: a heading alone counts
   limit 1;
  if v_rule is not null then
    select * into v_hdr from public.gl_accounts a where a.code = v_rule;
    raise exception '% % decides how money may be recorded. A heading cannot go under it.', v_hdr.code, v_hdr.name
      using errcode = '22023', detail = 'add_rule_heading';
  end if;

  v_code := public._gl_account_new_row_check(p_code, p_name);
  if p_first_code is not null or p_first_name is not null then
    v_first := public._gl_account_new_row_check(p_first_code, p_first_name);
    if v_first = v_code then
      raise exception 'An account numbered % is already in the chart.', v_first
        using errcode = '22023', detail = 'code_exists';
    end if;
    if lower(btrim(p_first_name)) = lower(btrim(p_name)) then
      raise exception 'An account named % is already in the chart.', btrim(p_first_name)
        using errcode = '22023', detail = 'name_exists';
    end if;
  end if;

  insert into public.gl_accounts (code, name, kind, parent_code, is_control, is_active, control_for, sort_order, is_heading)
  values (v_code, btrim(p_name), v_head.kind, v_head.code, false, true, null,
          (select coalesce(max(a.sort_order), 0) + 1 from public.gl_accounts a where a.parent_code = v_head.code),
          v_heading);                                     -- 0608: stored at once
  if v_first is not null then
    insert into public.gl_accounts (code, name, kind, parent_code, is_control, is_active, control_for, sort_order)
    values (v_first, btrim(p_first_name), v_head.kind, v_code, false, true, null, 1);
  end if;
  return v_code;
end;
$function$;

comment on function public.gl_account_add(text, text, text, text, text, boolean) is
  '0608: adds one account under a heading, or a heading (p_is_heading, stored as is_heading) with or without its first account. The kind follows the heading. Finance or principal.';
revoke all on function public.gl_account_add(text, text, text, text, text, boolean) from public, anon;
grant execute on function public.gl_account_add(text, text, text, text, text, boolean) to authenticated;

-- Sanity: one signature, the chart-structure lock, and anon never runs it.
do $sanity$
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'gl_account_add') <> 1 then
    raise exception '0608 sanity: gl_account_add has more than one signature';
  end if;
  if position('gl_chart_structure' in pg_get_functiondef(
       'public.gl_account_add(text, text, text, text, text, boolean)'::regprocedure)) = 0 then
    raise exception '0608 sanity: gl_account_add does not take the chart-structure lock';
  end if;
  if has_function_privilege('anon', 'public.gl_account_add(text, text, text, text, text, boolean)', 'execute')
     or not has_function_privilege('authenticated', 'public.gl_account_add(text, text, text, text, text, boolean)', 'execute') then
    raise exception '0608 sanity: gl_account_add grants are wrong';
  end if;
end
$sanity$;

notify pgrst, 'reload schema';

commit;
