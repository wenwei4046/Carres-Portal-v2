-- 0577 · Finance adds an account or a heading, a heading moves under another
--        heading, and a new money account may carry a number Finance types.
--
-- Work needed before the AutoCount renumber (YH, 23 Sep: codes like 100-0001,
-- 310-1000, 900-A001; headings nest three deep; code order is not structure).
--
-- 1 · gl_account_add(parent, code, name, first_code, first_name). No door
--     added a chart account or a heading before this. A heading is an account
--     with an account under it (0539), so a heading is added WITH its first
--     account, in one call: an empty heading would be a posting account and
--     could be posted to before its first account arrived. The kind follows
--     the heading it goes under. The name and number checks, and their
--     sentences, are gl_account_update's (0570), word for word. The parent must
--     already be a heading; gl_accounts_protect_posted still refuses a parent
--     with posted lines. The new account goes last under its heading
--     (sort_order one past the largest there, 0557).
--
-- 2 · gl_account_move now moves a heading too. 0570 refused it because the
--     reports group by the immediate parent only (see REPORTS below). The same
--     refusals as an account: same kind, the target is a heading and not the one
--     it is under, not into or out of a gl_rule_headings heading, not the last
--     account under a heading, and 0557's order check on both headings. One more
--     for a heading: never under itself or under a heading inside it.
--     gl_accounts_protect_posted refuses a parent that has posted lines, for a
--     heading exactly as for an account. Every other line is 0570's.
--
-- 3 · gl_money_account_add(name, kind, code). The next free number under the
--     money accounts heading stays the default (0570: NNN-0000 gives
--     NNN-1000 .. NNN-9000, HH00 gives HH01 .. HH99). Finance may type the
--     number instead; it is checked as gl_account_update checks one. When no
--     number is free and none was typed, the refusal asks for one (detail
--     code_needed) instead of failing with no way forward. The two-argument
--     function is dropped: its only caller is POST /money-accounts, which now
--     sends the third argument.
--
-- REPORTS: unchanged by this file. gl_balance_sheet and gl_profit_and_loss
-- subtotal by the immediate parent only; gl_trial_balance does not group.
-- A heading under a heading prints as a 0.00 line under its parent and its own
-- accounts subtotal under it; section totals are unaffected. Nested subtotals
-- are a separate change.
--
-- RLS: unchanged. DR/CR: none. No row is read for a backfill, none rewritten.
-- No account number is written in this file: the money heading is read by role.

begin;

set local search_path = public, pg_temp;

-- ── 1 · add an account, or a heading with its first account ──────────────────
-- One row's checks, shared by both rows of a heading. The sentences are
-- gl_account_update's (0570).
create or replace function public._gl_account_new_row_check(p_code text, p_name text)
returns text
language plpgsql
stable
set search_path = public, pg_temp
as $fn$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_code text := btrim(coalesce(p_code, ''));
begin
  if v_code ~ '^([0-9]{4}|[0-9]{3}-[0-9A-Za-z][0-9]{3})$' then
    v_code := upper(v_code);
  end if;
  if coalesce(p_name, '') !~ '[^[:space:]]' then
    raise exception 'Type the account name.'
      using errcode = '22023', detail = 'name_missing';
  end if;
  if length(v_name) > 60 then
    raise exception 'Keep the name to 60 characters.'
      using errcode = '22023', detail = 'name_too_long';
  end if;
  if exists (select 1 from public.gl_accounts a where lower(a.name) = lower(v_name)) then
    raise exception 'An account named % is already in the chart.', v_name
      using errcode = '22023', detail = 'name_exists';
  end if;
  if v_code !~ '^([0-9]{4}|[0-9]{3}-[0-9A-Z][0-9]{3})$' then
    raise exception 'A number is four digits, like 1210, or AutoCount''s form, like 100-0001 or 900-A001.'
      using errcode = '22023', detail = 'code_shape';
  end if;
  if exists (select 1 from public.gl_accounts a where a.code = v_code) then
    raise exception 'An account numbered % is already in the chart.', v_code
      using errcode = '22023', detail = 'code_exists';
  end if;
  return v_code;
end;
$fn$;

comment on function public._gl_account_new_row_check(text, text) is
  '0577: the name and number checks gl_account_update makes (0570), for a row not yet in the chart. Returns the number in capitals.';
revoke all on function public._gl_account_new_row_check(text, text) from public, anon, authenticated;

create or replace function public.gl_account_add(
  p_parent_code text,
  p_code        text,
  p_name        text,
  p_first_code  text default null,
  p_first_name  text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role  text := public.app_role()::text;
  v_head  public.gl_accounts%rowtype;
  v_code  text;
  v_first text;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance changes the chart of accounts.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  -- Two people adding at once must not both pass the "already in the chart" checks.
  perform pg_advisory_xact_lock(hashtext('gl_account_add'));

  select * into v_head from public.gl_accounts a where a.code = p_parent_code for update;
  if not found then
    raise exception 'That account is not in the chart.'
      using errcode = 'P0002', detail = 'heading_not_found';
  end if;
  if not exists (select 1 from public.gl_accounts c where c.parent_code = v_head.code) then
    raise exception '% % is not a heading. Add the account under a heading.', v_head.code, v_head.name
      using errcode = '22023', detail = 'add_onto_account';
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

  insert into public.gl_accounts (code, name, kind, parent_code, is_control, is_active, control_for, sort_order)
  values (v_code, btrim(p_name), v_head.kind, v_head.code, false, true, null,
          (select coalesce(max(a.sort_order), 0) + 1 from public.gl_accounts a where a.parent_code = v_head.code));
  if v_first is not null then
    insert into public.gl_accounts (code, name, kind, parent_code, is_control, is_active, control_for, sort_order)
    values (v_first, btrim(p_first_name), v_head.kind, v_code, false, true, null, 1);
  end if;
  return v_code;
end;
$fn$;

comment on function public.gl_account_add(text, text, text, text, text) is
  '0577: adds one account under a heading, or a heading with its first account when first_code and first_name are given. The kind follows the heading. Finance or principal.';
revoke all on function public.gl_account_add(text, text, text, text, text) from public, anon;
grant execute on function public.gl_account_add(text, text, text, text, text) to authenticated;

-- ── 2 · a heading moves under another heading ──────────────────────────────────
create or replace function public.gl_account_move(
  p_code      text,
  p_to_parent text,
  p_from_was  text[],
  p_from_now  text[],
  p_to_was    text[],
  p_to_now    text[]
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role  text := public.app_role()::text;
  v_from  text;                        -- the heading it leaves
  v_acc   public.gl_accounts%rowtype;
  v_to    public.gl_accounts%rowtype;
  v_hdr   public.gl_accounts%rowtype;
  v_order text[];
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance changes the chart of accounts.'
      using errcode = '42501', detail = 'not_finance';
  end if;

  if exists (select 1 from unnest(coalesce(p_from_was, '{}') || coalesce(p_from_now, '{}')
                              || coalesce(p_to_was, '{}') || coalesce(p_to_now, '{}')) c
              where c is null) then
    raise exception 'The order has a blank where an account should be.'
      using errcode = '22023', detail = 'order_blank';
  end if;

  select a.parent_code into v_from from public.gl_accounts a where a.code = p_code;
  if not found then
    raise exception 'That account is not in the chart.'
      using errcode = 'P0002', detail = 'account_missing';
  end if;

  perform 1 from public.gl_accounts a
    where a.code in (p_code, p_to_parent, v_from)
       or a.parent_code is not distinct from v_from
       or a.parent_code = p_to_parent
    order by a.code
    for update;

  select * into v_acc from public.gl_accounts a where a.code = p_code;
  if v_acc.parent_code is distinct from v_from then
    raise exception 'The chart changed while you were dragging. Open it again and redo the move.'
      using errcode = '40001', detail = 'order_stale';
  end if;

  select * into v_to from public.gl_accounts a where a.code = p_to_parent;
  if not found then
    raise exception 'That account is not in the chart.'
      using errcode = 'P0002', detail = 'heading_not_found';
  end if;
  if v_to.code is not distinct from v_acc.parent_code then
    raise exception 'That account is already under this heading.'
      using errcode = '22023', detail = 'move_same_heading';
  end if;
  -- 0577: a heading moves too, but never under itself or under a heading
  -- inside it: that would cut it and everything under it off the chart.
  if exists (
    with recursive up(code) as (
      select p_to_parent
      union
      select a.parent_code from public.gl_accounts a join up on a.code = up.code
       where a.parent_code is not null
    )
    select 1 from up where up.code = p_code
  ) then
    raise exception '% % is inside % %. A heading cannot go under a heading inside it.', v_to.code, v_to.name, v_acc.code, v_acc.name
      using errcode = '22023', detail = 'move_into_itself';
  end if;
  if not exists (select 1 from public.gl_accounts c where c.parent_code = p_to_parent) then
    raise exception '% % is not a heading. Move the account under a heading.', v_to.code, v_to.name
      using errcode = '22023', detail = 'move_onto_account';
  end if;
  if v_to.kind <> v_acc.kind then
    raise exception 'An account moves only under a heading of the same kind.'
      using errcode = '22023', detail = 'move_other_kind';
  end if;
  if v_from = any (public.gl_rule_headings()) or p_to_parent = any (public.gl_rule_headings()) then
    select * into v_hdr from public.gl_accounts a
     where a.code = case when v_from = any (public.gl_rule_headings()) then v_from else p_to_parent end;
    raise exception '% % decides how money may be recorded, not only where an account prints. No account moves into or out of it.', v_hdr.code, v_hdr.name
      using errcode = '22023', detail = 'move_rule_heading';
  end if;
  if v_from is not null
     and not exists (select 1 from public.gl_accounts c where c.parent_code = v_from and c.code <> p_code) then
    select * into v_hdr from public.gl_accounts a where a.code = v_from;
    raise exception '% % is the last account under % %. Move another account under that heading first.', v_acc.code, v_acc.name, v_hdr.code, v_hdr.name
      using errcode = '22023', detail = 'move_last_child';
  end if;

  if coalesce(array_length(p_from_was, 1), 0) = 0 or coalesce(array_length(p_to_was, 1), 0) = 0 then
    raise exception 'Send the order the chart was in before the drag.'
      using errcode = '22023', detail = 'order_was_missing';
  end if;

  select array_agg(a.code order by a.sort_order, a.code) into v_order
    from public.gl_accounts a where a.parent_code is not distinct from v_from;
  if p_from_was is distinct from v_order then
    raise exception 'The chart changed while you were dragging. Open it again and redo the move.'
      using errcode = '40001', detail = 'order_stale';
  end if;
  select array_agg(a.code order by a.sort_order, a.code) into v_order
    from public.gl_accounts a where a.parent_code = p_to_parent;
  if p_to_was is distinct from v_order then
    raise exception 'The chart changed while you were dragging. Open it again and redo the move.'
      using errcode = '40001', detail = 'order_stale';
  end if;

  update public.gl_accounts set parent_code = p_to_parent where code = p_code;

  select array_agg(a.code order by a.sort_order, a.code) into v_order
    from public.gl_accounts a where a.parent_code is not distinct from v_from;
  perform public.gl_accounts_reorder(v_from, v_order, p_from_now);

  select array_agg(a.code order by a.sort_order, a.code) into v_order
    from public.gl_accounts a where a.parent_code = p_to_parent;
  perform public.gl_accounts_reorder(p_to_parent, v_order, p_to_now);

  return p_code;
end;
$fn$;

comment on function public.gl_account_move(text, text, text[], text[], text[], text[]) is
  '0577 (0570''s door): puts one account or heading under another heading of the same kind, and sets the order under both headings. Never under itself or a heading inside it, never the last account under a heading, never into or out of a heading gl_rule_headings names. Refuses an order somebody already replaced, under either heading. The number, name and kind never change. Finance or principal.';
revoke all on function public.gl_account_move(text, text, text[], text[], text[], text[]) from public, anon;
grant execute on function public.gl_account_move(text, text, text[], text[], text[], text[]) to authenticated;

-- ── 3 · a new money account may carry a number Finance types ──────────────────
drop function if exists public.gl_money_account_add(text, text);

create or replace function public.gl_money_account_add(p_name text, p_kind text, p_code text default null)
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role text := public.app_role()::text;
  v_name text;
  v_code text;
  v_head public.gl_accounts%rowtype;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance changes the money accounts.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  if p_kind is null or p_kind not in ('BANK','HOLDING') then
    raise exception 'Choose the kind: a bank, or an online payment company.'
      using errcode = '22023', detail = 'kind_invalid';
  end if;
  perform pg_advisory_xact_lock(hashtext('gl_money_account_add'));
  v_name := public._gl_money_account_name(p_name, null);

  select a.* into v_head from public.gl_accounts a
   where a.code = public.gl_account_for('MONEY_ACCOUNTS_HEADING');

  if nullif(btrim(p_code), '') is not null then
    -- 0577: a number Finance typed, checked as gl_account_update checks one.
    v_code := btrim(p_code);
    if v_code ~ '^([0-9]{4}|[0-9]{3}-[0-9A-Za-z][0-9]{3})$' then
      v_code := upper(v_code);
    end if;
    if v_code !~ '^([0-9]{4}|[0-9]{3}-[0-9A-Z][0-9]{3})$' then
      raise exception 'A number is four digits, like 1210, or AutoCount''s form, like 100-0001 or 900-A001.'
        using errcode = '22023', detail = 'code_shape';
    end if;
    if exists (select 1 from public.gl_accounts a where a.code = v_code) then
      raise exception 'An account numbered % is already in the chart.', v_code
        using errcode = '22023', detail = 'code_exists';
    end if;
  elsif v_head.code ~ '^[0-9]{3}-0000$' then
    select min(c.code) into v_code
      from (select left(v_head.code, 4) || k::text || '000' as code
              from generate_series(1, 9) k) c
     where not exists (select 1 from public.gl_accounts a where a.code = c.code);
  elsif v_head.code ~ '^[0-9]{2}00$' then
    select min(c.code) into v_code
      from (select left(v_head.code, 2) || lpad(k::text, 2, '0') as code
              from generate_series(1, 99) k) c
     where not exists (select 1 from public.gl_accounts a where a.code = c.code);
  else
    -- 0577: no number to follow; Finance types one.
    raise exception 'Type a number for the new account. % % does not end in 00 or -0000, so no number is picked for you.',
      coalesce(v_head.code, 'The money accounts heading'), coalesce(v_head.name, '')
      using errcode = '22023', detail = 'code_needed';
  end if;
  if v_code is null then
    -- 0577: every number is used. Ask for one instead of stopping here.
    raise exception 'Every number under % % is used. Type a number for the new account.', v_head.code, v_head.name
      using errcode = '22023', detail = 'code_needed';
  end if;

  insert into public.gl_accounts (code, name, kind, parent_code, is_control, is_active, control_for)
  values (v_code, v_name, 'ASSET', v_head.code, false, true, null);
  insert into public.gl_money_accounts (account_code, money_kind, created_by, updated_by)
  values (v_code, p_kind, auth.uid(), auth.uid());
  return v_code;
end;
$function$;

comment on function public.gl_money_account_add(text, text, text) is
  '0577: adds a bank or holding account under the money accounts heading (read by role). The number is the one Finance typed, or the next free one that follows the heading''s own number. Finance or principal.';
revoke all on function public.gl_money_account_add(text, text, text) from public, anon;
grant execute on function public.gl_money_account_add(text, text, text) to authenticated;

commit;
