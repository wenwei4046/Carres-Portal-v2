-- 0570 · A heading can be renumbered, and an account can move under another heading.
--
-- WHAT THE OWNER ASKED FOR
--   "header name and number need to be changeable as well", and a drag that
--   "doesnt change account number or name, it's just that it falls under
--   different header so that in report that account belongs in the new header".
--
-- WHAT WAS MISSING ON MAIN
--   · The Chart of accounts screen (PR 1504) saves through gl_account_update,
--     but no migration on main defines it. 0550 wrote it and never merged, so a
--     database built from main has only gl_account_rename and every Save fails.
--   · gl_accounts_parent_code_fkey has no ON UPDATE action, so renumbering a
--     heading is refused while any account sits under it. The same is true of
--     every other key that names the chart except gl_account_roles (0554).
--   · There is no way to change an account's heading at all.
--
-- 1 · Every foreign key that names gl_accounts(code) becomes ON UPDATE CASCADE.
--     0550's walk, unchanged: it finds the keys in the catalog, so the chart's
--     own parent_code is one of them and a renumbered heading keeps its
--     children. A key that already cascades is skipped, so this is a no-op on a
--     database that already ran 0550 by hand.
--
-- 2 · gl_account_update(code, name, new_code): 0550's door, one door for an
--     account and a heading alike, so a heading gets exactly the same guards:
--     the number's shape, a number already taken, and (through the cascade)
--     the frozen-document triggers. The name checks are gl_account_rename's,
--     carried from pg_proc on a 0561 clone; the blank-name test is 0560's form.
--     gl_account_rename is dropped, as 0550 did: nothing calls it since PR 1504.
--
-- 3 · gl_account_move(code, to_heading, from_was, from_now, to_was, to_now).
--     Changes parent_code and the order under both headings. Never the number,
--     the name or the kind. It carries 0557's concurrency check for BOTH
--     headings: `was` is the order the screen read, `now` the order it wants,
--     and a `was` that is no longer the stored order is refused. The `now`
--     lists are checked and written by 0557's own gl_accounts_reorder.
--     Refused: a target that is not a heading, the heading it is already under,
--     itself or anything inside it, and a heading of another kind (asset,
--     liability, equity, income, expense) — a move across kinds would put the
--     account on a different statement, and `kind` lives on the account row, so
--     the row would contradict its heading. That last one is an ASSUMPTION the
--     owner can overturn.
--
-- 4 · Five account numbers written inside function bodies become roles in
--     gl_account_roles (0554's table), because a renumber cannot reach text:
--       '1100' in gl_money_account_add (where a new bank account is hung),
--       '2200' and '1300' in fin_money_in_account_problem (which headings hold
--       customer money and stock), and '3200' / '3300' in the same function.
--     0554 left these as literals when only leaves were thought of; renumbering
--     heading 2200 would otherwise switch a receipt-line guard off silently.
--     Both bodies are pg_proc's text on a 0561 clone with only the literal
--     swapped. The 1121-1129 / 1131-1139 code ranges in gl_money_account_add are
--     NOT changed: how a new bank account is numbered is the owner's call.
--
-- REPORTS: gl_profit_and_loss and gl_balance_sheet group by the live
-- parent_code (`coalesce(a.parent_code, a.code) as hdr`); gl_trial_balance does
-- not group by heading. A move shows on the next read. Nothing to fix there.
--
-- RLS: unchanged. No policy is created, dropped or altered. DR/CR: none.
-- SECTION 6: no row is read for a backfill, and none is rewritten. The only
-- rows written are five new gl_account_roles rows (a seed, like 0554's seven).

begin;

-- pg_get_constraintdef prints table names as the search_path reads them, and
-- section 1 hands that text back to Postgres, so the path is pinned.
set local search_path = public, pg_temp;

-- ── 1 · every key that names the chart follows a renumber (0550 §1) ─────────
do $cascade$
declare
  v_keys jsonb;
  r      jsonb;
begin
  -- gl_accounts.code, plus any column a foreign key ties to something already
  -- in the set (card_settlement_routes reaches the chart through
  -- gl_money_accounts).
  with recursive closure(relid, attnum) as (
    select a.attrelid, a.attnum
      from pg_attribute a
     where a.attrelid = 'public.gl_accounts'::regclass
       and a.attname = 'code'
       and not a.attisdropped
    union
    select c.conrelid, c.conkey[1]
      from pg_constraint c
      join closure d on d.relid = c.confrelid and d.attnum = c.confkey[1]
     where c.contype = 'f'
       and array_length(c.conkey, 1) = 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', c.conname,
           'tbl',  format('%I.%I', ns.nspname, rel.relname),
           'def',  pg_get_constraintdef(c.oid),
           'cols', array_length(c.conkey, 1))), '[]'::jsonb)
    into v_keys
    from pg_constraint c
    join pg_class rel     on rel.oid = c.conrelid
    join pg_namespace ns  on ns.oid = rel.relnamespace
    join closure d on d.relid = c.confrelid and d.attnum = c.confkey[1]
   where c.contype = 'f'
     and c.confupdtype <> 'c';          -- 'c' = already on update cascade

  for r in select value from jsonb_array_elements(v_keys) loop
    -- ON UPDATE is appended to the printed clause, which is only right for a
    -- one-column key that is not DEFERRABLE and not MATCH FULL. Stop otherwise.
    if (r->>'def') ~* '\mdeferrable\M|\mmatch\M' or (r->>'cols')::int <> 1 then
      raise exception '0570: % is a shape this migration does not rewrite: %',
        r->>'name', r->>'def';
    end if;
    execute format('alter table %s drop constraint %I', r->>'tbl', r->>'name');
    execute format('alter table %s add constraint %I %s on update cascade',
                   r->>'tbl', r->>'name', r->>'def');
  end loop;
end $cascade$;

-- ── 2 · one door changes an account's or a heading's name and number ─────────
drop function if exists public.gl_account_rename(text, text);

create or replace function public.gl_account_update(p_code text, p_name text, p_new_code text default null)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := public.app_role()::text;
  v_old  text;
  v_name text := btrim(coalesce(p_name, ''));
  v_code text := btrim(coalesce(p_new_code, p_code));
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance changes the chart of accounts.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  select a.name into v_old from public.gl_accounts a where a.code = p_code for update;
  if not found then
    raise exception 'That account is not in the chart.'
      using errcode = 'P0002', detail = 'account_missing';
  end if;
  if coalesce(p_name, '') !~ '[^[:space:]]' then
    raise exception 'Type the account name.'
      using errcode = '22023', detail = 'name_missing';
  end if;
  if length(v_name) > 60 then
    raise exception 'Keep the name to 60 characters.'
      using errcode = '22023', detail = 'name_too_long';
  end if;
  if exists (select 1 from public.gl_accounts a
              where lower(a.name) = lower(v_name) and a.code <> p_code) then
    raise exception 'An account named % is already in the chart.', v_name
      using errcode = '22023', detail = 'name_exists';
  end if;
  if v_code !~ '^(\d{4}|\d{3}-\d{4})$' then
    raise exception 'A number is four digits, or three digits, a dash and four — 1210 or 100-0001.'
      using errcode = '22023', detail = 'code_shape';
  end if;
  if v_code <> p_code and exists (select 1 from public.gl_accounts a where a.code = v_code) then
    raise exception 'An account numbered % is already in the chart.', v_code
      using errcode = '22023', detail = 'code_exists';
  end if;

  if v_name is distinct from v_old then
    update public.gl_accounts set name = v_name where code = p_code;
  end if;
  -- The number goes last, so the name update above still finds the row by its
  -- old number. Section 1 carries the new number to every row that names it,
  -- including the accounts under a heading.
  if v_code <> p_code then
    update public.gl_accounts set code = v_code where code = p_code;
  end if;
  return v_code;
end;
$fn$;

comment on function public.gl_account_update(text, text, text) is
  '0570 (0550''s door): changes one account''s or heading''s name and, when a number is given, its number. Every key that names the chart cascades. Finance or principal.';
revoke all on function public.gl_account_update(text, text, text) from public, anon;
grant execute on function public.gl_account_update(text, text, text) to authenticated;

-- ── 3 · an account moves under another heading ──────────────────────────────
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
  v_order text[];
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance changes the chart of accounts.'
      using errcode = '42501', detail = 'not_finance';
  end if;

  -- A blank in any list first: a blank makes every comparison below NULL, and
  -- it would be reported as whatever check happened to fail next (0557).
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

  -- Lock the account, both headings and everything under both, in code order:
  -- the same order gl_accounts_reorder locks in, so a move and a reorder of
  -- the same heading wait for each other instead of deadlocking.
  perform 1 from public.gl_accounts a
    where a.code in (p_code, p_to_parent, v_from)
       or a.parent_code is not distinct from v_from
       or a.parent_code = p_to_parent
    order by a.code
    for update;

  select * into v_acc from public.gl_accounts a where a.code = p_code;
  if v_acc.parent_code is distinct from v_from then
    -- Somebody moved it between the read above and the lock.
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
  -- Under itself, or under anything inside it: walk up from the target.
  if exists (
    with recursive up(code, parent_code) as (
      select a.code, a.parent_code from public.gl_accounts a where a.code = p_to_parent
      union
      select a.code, a.parent_code from public.gl_accounts a join up on a.code = up.parent_code
    )
    select 1 from up where up.code = p_code
  ) then
    raise exception 'A heading cannot move under itself or under anything inside it.'
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

  if coalesce(array_length(p_from_was, 1), 0) = 0 or coalesce(array_length(p_to_was, 1), 0) = 0 then
    raise exception 'Send the order the chart was in before the drag.'
      using errcode = '22023', detail = 'order_was_missing';
  end if;

  -- 0557's check, once per heading: the order the screen read must still be
  -- the order stored now.
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

  -- Both `now` lists go through 0557's writer, which refuses a duplicate, a
  -- stranger or a missing account and writes 1..n. Its `was` here is the order
  -- stored after the parent changed, read under the locks taken above; the
  -- caller's own `was` lists were checked against the stored order just above.
  select array_agg(a.code order by a.sort_order, a.code) into v_order
    from public.gl_accounts a where a.parent_code is not distinct from v_from;
  if v_order is null then
    -- The heading it left is now empty, so there is nothing to order there.
    if coalesce(array_length(p_from_now, 1), 0) > 0 then
      raise exception 'Move an account only among the accounts under the same heading.'
        using errcode = '22023', detail = 'order_not_sibling';
    end if;
  else
    perform public.gl_accounts_reorder(v_from, v_order, p_from_now);
  end if;

  select array_agg(a.code order by a.sort_order, a.code) into v_order
    from public.gl_accounts a where a.parent_code = p_to_parent;
  perform public.gl_accounts_reorder(p_to_parent, v_order, p_to_now);

  return p_code;
end;
$fn$;

comment on function public.gl_account_move(text, text, text[], text[], text[], text[]) is
  '0570: puts one account under another heading of the same kind, and sets the order under both headings. Refuses an order somebody already replaced, under either heading. The number, name and kind never change. Finance or principal.';
revoke all on function public.gl_account_move(text, text, text[], text[], text[], text[]) from public, anon;
grant execute on function public.gl_account_move(text, text, text[], text[], text[], text[]) to authenticated;

-- ── 4 · numbers written inside two function bodies become roles ──────────────
insert into public.gl_account_roles (role, account_code) values
  ('MONEY_ACCOUNTS_HEADING',  '1100'),   -- Cash and bank: a new bank account is hung here
  ('CUSTOMER_MONEY_HEADING',  '2200'),   -- Customer money held: recorded in Payments
  ('STOCK_HEADING',           '1300'),   -- Inventory: stock value moves with the goods
  ('RETAINED_EARNINGS',       '3200'),   -- written only by the year-end close
  ('OPENING_BALANCE_EQUITY',  '3300');   -- written only by the opening balances

-- pg_proc on a 0561 clone. Only '1100' changed.
CREATE OR REPLACE FUNCTION public.gl_money_account_add(p_name text, p_kind text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role text := public.app_role()::text;
  v_name text;
  v_code text;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance changes the money accounts.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  if p_kind is null or p_kind not in ('BANK','HOLDING') then
    raise exception 'Choose the kind: a bank, or an online payment company.'
      using errcode = '22023', detail = 'kind_invalid';
  end if;
  -- Two people adding at once must not both pick the same next code.
  perform pg_advisory_xact_lock(hashtext('gl_money_account_add'));
  v_name := public._gl_money_account_name(p_name, null);

  select min(c.code) into v_code
    from (select ((case p_kind when 'BANK' then 1121 else 1131 end) + g)::text as code
            from generate_series(0, 8) g) c
   where not exists (select 1 from public.gl_accounts a where a.code = c.code);
  if v_code is null then
    raise exception 'Codes % are all used. Take an account out of use, or ask for a new range.',
      case p_kind when 'BANK' then '1121 to 1129' else '1131 to 1139' end
      using errcode = 'P0001', detail = 'no_code_left';
  end if;

  -- 0570: the heading is read from gl_account_roles, not written here.
  insert into public.gl_accounts (code, name, kind, parent_code, is_control, is_active, control_for)
  values (v_code, v_name, 'ASSET', public.gl_account_for('MONEY_ACCOUNTS_HEADING'), false, true, null);
  insert into public.gl_money_accounts (account_code, money_kind, created_by, updated_by)
  values (v_code, p_kind, auth.uid(), auth.uid());
  return v_code;
end;
$function$;

-- pg_proc on a 0561 clone. Only '2200', '1300', '3200' and '3300' changed.
CREATE OR REPLACE FUNCTION public.fin_money_in_account_problem(p_code text, p_use text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v public.gl_accounts%rowtype;
begin
  if p_use is null or p_use not in ('money','receipt_line','invoice_line') then
    raise exception 'unknown account use %', coalesce(p_use, 'null')
      using errcode = '22023', detail = 'unknown_account_use';
  end if;

  select * into v from public.gl_accounts a where a.code = btrim(coalesce(p_code, ''));
  if not found then
    return format('Account %s is not in the chart.', coalesce(nullif(btrim(p_code), ''), 'No account'));
  end if;
  if not v.is_active then
    return format('Account %s %s is retired.', v.code, v.name);
  end if;
  if exists (select 1 from public.gl_accounts c where c.parent_code = v.code) then
    return format('Account %s %s is a group heading. Pick an account under it.', v.code, v.name);
  end if;
  -- 0510: 1230 Advances to suppliers is written only by the Advance flow.
  if v.is_control or v.code = public.gl_account_for('SUPPLIER_ADVANCE') then
    return format('Account %s %s is kept by its own documents and cannot be picked here.', v.code, v.name);
  end if;

  if p_use = 'money' then
    if exists (select 1 from public.gl_money_accounts m
                where m.account_code = v.code and not m.is_active) then
      return format('Account %s %s is retired.', v.code, v.name);
    end if;
    if not public.gl_money_account_ok(v.code, 'in') then      -- 0512: the one list
      return format('Account %s %s is not a bank or cash account.', v.code, v.name);
    end if;
    return null;
  end if;

  if public.ap_account_is_money(v.code) then
    return format('Account %s %s is a bank or cash account. Moving money between our own accounts is not a receipt.', v.code, v.name);
  end if;

  -- Customer sales income is recognised on the customer's invoice (0466).
  -- Neither document here may be a second door for it (ERP-ARCHITECTURE
  -- law C), so an invoice line and a receipt line both refuse every account
  -- the customer invoice routes revenue to.
  if exists (select 1 from public.gl_income_account_map m where m.account_code = v.code) then
    return format('Account %s %s is customer sales income. It is recorded on the customer''s invoice.', v.code, v.name);
  end if;

  if p_use = 'invoice_line' then
    if v.kind not in ('INCOME','EXPENSE') then
      return format('Account %s %s cannot be billed. An invoice line credits income, or recovers a cost.', v.code, v.name);
    end if;
    return null;
  end if;

  -- receipt_line
  -- 0570: the headings and accounts below are read from gl_account_roles.
  if v.parent_code = public.gl_account_for('CUSTOMER_MONEY_HEADING') then
    return format('Account %s %s is customer money. Customer money is recorded in Payments.', v.code, v.name);
  end if;
  -- Stock value moves with the goods, and Stock owns it. Retained earnings
  -- and opening balance equity are written only by the year-end close and the
  -- opening balances. Money never arrives as any of them.
  if v.parent_code = public.gl_account_for('STOCK_HEADING')
     or v.code in (public.gl_account_for('RETAINED_EARNINGS'), public.gl_account_for('OPENING_BALANCE_EQUITY')) then
    return format('Account %s %s cannot be the reason money came in.', v.code, v.name);
  end if;
  return null;
end;
$function$;

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
declare v_left int;
begin
  -- Every key that names the chart cascades, the chart's own parent key first.
  if not exists (select 1 from pg_constraint
                  where conname = 'gl_accounts_parent_code_fkey'
                    and conrelid = 'public.gl_accounts'::regclass
                    and confupdtype = 'c') then
    raise exception '0570 sanity: a renumbered heading would lose its children';
  end if;
  with recursive closure(relid, attnum) as (
    select a.attrelid, a.attnum
      from pg_attribute a
     where a.attrelid = 'public.gl_accounts'::regclass
       and a.attname = 'code' and not a.attisdropped
    union
    select c.conrelid, c.conkey[1]
      from pg_constraint c
      join closure d on d.relid = c.confrelid and d.attnum = c.confkey[1]
     where c.contype = 'f' and array_length(c.conkey, 1) = 1
  )
  select count(*) into v_left
    from pg_constraint c
    join closure d on d.relid = c.confrelid and d.attnum = c.confkey[1]
   where c.contype = 'f' and c.confupdtype <> 'c';
  if v_left > 0 then
    raise exception '0570 sanity: % key(s) naming the chart still do not cascade', v_left;
  end if;

  if has_function_privilege('anon', 'public.gl_account_update(text, text, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.gl_account_update(text, text, text)', 'execute')
     or has_function_privilege('anon', 'public.gl_account_move(text, text, text[], text[], text[], text[])', 'execute')
     or not has_function_privilege('authenticated', 'public.gl_account_move(text, text, text[], text[], text[], text[])', 'execute') then
    raise exception '0570 sanity: gl_account_update / gl_account_move grants are wrong';
  end if;

  -- The two-heading promise is the pair of `was` checks. Without them a move is
  -- last-write-wins under both headings.
  if position('p_from_was is distinct from v_order' in
              pg_get_functiondef('public.gl_account_move(text, text, text[], text[], text[], text[])'::regprocedure)) = 0
     or position('p_to_was is distinct from v_order' in
              pg_get_functiondef('public.gl_account_move(text, text, text[], text[], text[], text[])'::regprocedure)) = 0 then
    raise exception '0570 sanity: gl_account_move does not check the order the caller saw under both headings';
  end if;

  -- No heading literal is left in the two rebuilt bodies.
  if pg_get_functiondef('public.fin_money_in_account_problem(text, text)'::regprocedure) ~ '''(1300|2200|3200|3300)'''
     or pg_get_functiondef('public.gl_money_account_add(text, text)'::regprocedure) ~ '''1100''' then
    raise exception '0570 sanity: an account number is still written inside a body';
  end if;
end $sanity$;

commit;
