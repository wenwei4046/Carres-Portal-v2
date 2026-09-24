-- 0579: every heading on the Balance Sheet and the Profit and Loss carries its
-- own subtotal, at every depth.
--
-- The chart nests headings (AutoCount nests them three deep: a heading under a
-- heading under a heading). Until now both reports grouped each account under
-- its direct parent only, so a heading that held headings printed no subtotal
-- of its own, and a nested heading showed up as a zero account line.
--
-- Now:
--   * every heading (an account with children, or a top-level account) gets a
--     HEADER_SUBTOTAL row. Its amount is every account under it, at any depth,
--     counted once. A parent's subtotal therefore includes its child
--     headings' subtotals; the section total is still each account once.
--   * two new columns: header_depth (1 = top level) and parent_header_code
--     (the heading this heading sits under, null at the top), so the screen
--     can nest the rows without reading the chart again.
--   * rows follow the chart's own order (sort_order from 0557, then code),
--     heading by heading, and a heading's subtotal row comes after everything
--     under it.
--   * ACCOUNT rows are the accounts that are not headings. A heading is never
--     posted to (0468); if one ever carries an amount it still prints as its
--     own line, first under itself, so its subtotal still adds up.
--
-- gl_trial_balance is not changed here. gl_account_add and the heading move
-- (0577) are not touched.
--
-- The return type grows by two columns, so each function is dropped and
-- created again, with its grants and comment put back as they were.

create function public.gl_report_chart_tree()
returns table(code text, kind text, parent_code text, depth integer,
              ancestors text[], order_key text[], is_heading boolean)
language sql
stable
set search_path = public, pg_temp
as $$
  with recursive up as (
    select a.code as code, a.parent_code as next_up,
           array[a.code] as chain,
           array[lpad((a.sort_order::bigint + 2147483648)::text, 10, '0') || ':' || a.code] as keys
    from public.gl_accounts a
    union all
    select u.code, p.parent_code,
           array[p.code] || u.chain,
           array[lpad((p.sort_order::bigint + 2147483648)::text, 10, '0') || ':' || p.code] || u.keys
    from up u
    join public.gl_accounts p on p.code = u.next_up
    where not p.code = any(u.chain)
  ),
  top as (
    select distinct on (u.code) u.code, u.chain, u.keys
    from up u
    order by u.code, cardinality(u.chain) desc
  )
  select a.code, a.kind, a.parent_code,
         cardinality(t.chain)::integer,
         t.chain[1:cardinality(t.chain) - 1],
         t.keys,
         (a.parent_code is null
          or exists (select 1 from public.gl_accounts c where c.parent_code = a.code))
  from top t
  join public.gl_accounts a on a.code = t.code;
$$;

revoke all on function public.gl_report_chart_tree() from public, anon, authenticated;

comment on function public.gl_report_chart_tree() is
  '0579: each account with its depth, the headings above it, and its place in the chart order (sort_order, then code). is_heading: has children, or sits at the top. Read only by the report functions.';

drop function public.gl_balance_sheet(date, text, uuid);
drop function public.gl_profit_and_loss(date, date, text, uuid);

create function public.gl_balance_sheet(p_as_of date, p_department_type text DEFAULT NULL::text, p_department_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(report_status text, go_live_on date, as_of date, ordinal bigint, section text, row_kind text, header_code text, header_name text, account_code text, account_name text, amount numeric, equation_balances boolean, equation_difference numeric, reclassified numeric, reclassified_for text, header_depth integer, parent_header_code text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
declare
  -- Where customers' money paid before the invoice is shown. The account's own
  -- name ("Customer deposits held") is the line label.
  c_deposits constant text := public.gl_account_for('CUSTOMER_DEPOSITS_HELD');
  -- Where money paid to suppliers before their bill is shown (0507). The
  -- account's own name ("Advances to suppliers") is the line label.
  c_advances constant text := public.gl_account_for('SUPPLIER_ADVANCE');
  v_go_live        date;
  v_assets         numeric(14,2);
  v_liab           numeric(14,2);
  v_equity         numeric(14,2);
  v_result         numeric(14,2);
  v_diff           numeric(14,2);
  v_moved_by_acct  jsonb;
  v_moved          numeric(14,2);
  v_adv_by_acct    jsonb;
  v_adv            numeric(14,2);
begin
  v_go_live := public.gl_report_guard();

  if p_as_of is null then
    raise exception 'gl_balance_sheet: p_as_of is required'
      using errcode = '22004';
  end if;

  if p_as_of < v_go_live then
    return query
      select 'BEFORE_GO_LIVE'::text, v_go_live, p_as_of, 1::bigint,
             null::text, 'NOTICE'::text, null::text, null::text, null::text, null::text,
             null::numeric(14,2), null::boolean, null::numeric(14,2), null::numeric(14,2),
             null::text, null::integer, null::text;
    return;
  end if;

  -- Customers who paid before their invoice (0506). Each customer's balance on
  -- each customer control asset account; a balance below zero is money held
  -- for that customer. Summed per account, computed once.
  select coalesce(jsonb_object_agg(c.acct, c.moved), '{}'::jsonb),
         coalesce(sum(c.moved), 0)::numeric(14,2)
  into v_moved_by_acct, v_moved
  from (
    select p.acct, sum(-p.bal)::numeric(14,2) as moved
    from (
      select l.account_code as acct,
             sum(l.debit - l.credit) as bal
      from public.gl_department_lines(p_department_type, p_department_id) l
      join public.gl_entries e on e.id = l.entry_id
      join public.gl_accounts a on a.code = l.account_code
      where e.posted
        and e.entry_date <= p_as_of
        and a.kind = 'ASSET'
        and a.control_for = 'CUSTOMER'
      group by l.account_code, l.party_type, l.party_id
    ) p
    where p.bal < 0
    group by p.acct
  ) c;

  -- Suppliers paid before their bill (0507). Each supplier's balance on each
  -- supplier control liability account; a balance below zero is money Carres
  -- paid that supplier ahead of its bills. Summed per account, computed once.
  select coalesce(jsonb_object_agg(c.acct, c.moved), '{}'::jsonb),
         coalesce(sum(c.moved), 0)::numeric(14,2)
  into v_adv_by_acct, v_adv
  from (
    select p.acct, sum(-p.bal)::numeric(14,2) as moved
    from (
      select l.account_code as acct,
             sum(l.credit - l.debit) as bal
      from public.gl_department_lines(p_department_type, p_department_id) l
      join public.gl_entries e on e.id = l.entry_id
      join public.gl_accounts a on a.code = l.account_code
      where e.posted
        and e.entry_date <= p_as_of
        and a.kind = 'LIABILITY'
        and a.control_for = 'SUPPLIER'
      group by l.account_code, l.party_type, l.party_id
    ) p
    where p.bal < 0
    group by p.acct
  ) c;

  -- The moved money needs a line to land on. Without it the totals below would
  -- still agree while the printed rows did not, so refuse instead.
  if v_moved <> 0 and not exists (
    select 1 from public.gl_accounts where code = c_deposits and kind = 'LIABILITY'
  ) then
    raise exception 'gl_balance_sheet: account % (LIABILITY) is missing', c_deposits
      using errcode = 'P0002';
  end if;
  if v_adv <> 0 and not exists (
    select 1 from public.gl_accounts where code = c_advances and kind = 'ASSET'
  ) then
    raise exception 'gl_balance_sheet: account % (ASSET) is missing', c_advances
      using errcode = 'P0002';
  end if;

  -- The three section totals and the undistributed result, computed once so the
  -- equation row is arithmetic on the same numbers the rows below print.
  --
  -- The result line reads `credit - debit` for BOTH income and expense on
  -- purpose. Profit is income minus expense; income is credit-positive and
  -- expense is debit-positive, so
  --     (credit-debit for income) - (debit-credit for expense)
  --   = (credit-debit for income) + (credit-debit for expense)
  -- and the two collapse into one expression. An expense therefore lands here
  -- as a negative number, which is exactly what reduces equity.
  select
    coalesce(sum(case when a.kind = 'ASSET'     then l.debit  - l.credit else 0 end), 0)::numeric(14,2),
    coalesce(sum(case when a.kind = 'LIABILITY' then l.credit - l.debit  else 0 end), 0)::numeric(14,2),
    coalesce(sum(case when a.kind = 'EQUITY'    then l.credit - l.debit  else 0 end), 0)::numeric(14,2),
    coalesce(sum(case when a.kind in ('INCOME','EXPENSE')
                      then l.credit - l.debit else 0 end), 0)::numeric(14,2)
  into v_assets, v_liab, v_equity, v_result
  from public.gl_department_lines(p_department_type, p_department_id) l
  join public.gl_entries e on e.id = l.entry_id
  join public.gl_accounts a on a.code = l.account_code
  where e.posted
    and e.entry_date <= p_as_of;

  -- The moved money leaves the wrong side of receivables and payables, so
  -- assets and liabilities each rise by both amounts: customer money onto
  -- customer deposits (0506), supplier money onto advances to suppliers (0507).
  v_assets := (v_assets + v_moved + v_adv)::numeric(14,2);
  v_liab   := (v_liab + v_moved + v_adv)::numeric(14,2);

  v_diff := (v_assets - (v_liab + v_equity + v_result))::numeric(14,2);

  return query
  with movement as (
    select l.account_code as acct,
           sum(l.debit)::numeric(14,2)  as dr,
           sum(l.credit)::numeric(14,2) as cr
    from public.gl_department_lines(p_department_type, p_department_id) l
    join public.gl_entries e on e.id = l.entry_id
    where e.posted
      and e.entry_date <= p_as_of
    group by l.account_code
  ),
  bs_raw as (
    select a.code, a.name, a.kind,
           coalesce(a.parent_code, a.code) as hdr,
           (case when a.kind = 'ASSET'
                 then coalesce(m.dr, 0) - coalesce(m.cr, 0)
                 else coalesce(m.cr, 0) - coalesce(m.dr, 0) end)::numeric(14,2) as booked,
           (case when a.code = c_deposits then v_moved
                 when a.code = c_advances then v_adv
                 when v_moved_by_acct ? a.code then -((v_moved_by_acct ->> a.code)::numeric)
                 when v_adv_by_acct ? a.code then -((v_adv_by_acct ->> a.code)::numeric)
                 else null end)::numeric(14,2) as moved,
           (case when a.code = c_deposits or v_moved_by_acct ? a.code then 'CUSTOMER'
                 when a.code = c_advances or v_adv_by_acct ? a.code then 'SUPPLIER'
                 else null end)::text as moved_for
    from public.gl_accounts a
    left join movement m on m.acct = a.code
    where a.kind in ('ASSET','LIABILITY','EQUITY')
      and (a.is_active or m.acct is not null
           or (a.code = c_deposits and v_moved <> 0)
           or (a.code = c_advances and v_adv <> 0))
  ),
  bs_accounts as (
    -- A control account's printed amount is its balance LESS the (negative)
    -- moved share, i.e. only the parties on the right side; 2210's and 1230's
    -- are their balance plus it.
    select r.code, r.name, r.kind, r.hdr,
           (r.booked + case when r.code in (c_deposits, c_advances) then coalesce(r.moved, 0)
                            else -coalesce(r.moved, 0) end)::numeric(14,2) as amt,
           r.moved,
           r.moved_for,
           t.ancestors, t.order_key, t.is_heading
    from bs_raw r
    join public.gl_report_chart_tree() t on t.code = r.code
  ),
  tree as (
    select t.code, t.parent_code, t.depth, t.order_key, h.name
    from public.gl_report_chart_tree() t
    join public.gl_accounts h on h.code = t.code
    where t.is_heading
  ),
  sect_ord as (
    select 'ASSET'::text as k, 1 as o
    union all select 'LIABILITY', 2
    union all select 'EQUITY', 3
  ),
  body as (
    -- one line per account that is not a heading, plus a top-level account
    -- with nothing under it, plus a heading only if it ever carries an
    -- amount of its own
    select s.o                    as sort1,
           b.order_key            as sort2,
           b.kind                 as sect,
           'ACCOUNT'::text        as rk,
           b.hdr                  as hcode,
           hn.name                as hname,
           b.code                 as acode,
           b.name                 as aname,
           b.amt                  as amt,
           b.moved                as moved,
           b.moved_for            as moved_for,
           null::integer          as hdepth,
           null::text             as hparent
    from bs_accounts b
    join sect_ord s on s.k = b.kind
    left join public.gl_accounts hn on hn.code = b.hdr
    where not b.is_heading or b.amt <> 0
       or not exists (select 1 from public.gl_accounts c where c.parent_code = b.code)

    union all

    -- every heading, at every depth: all the accounts under it, each once
    select s.o, tr.order_key || array['~'],
           b.kind, 'HEADER_SUBTOTAL'::text,
           tr.code, tr.name, null::text, null::text,
           sum(b.amt)::numeric(14,2),
           null::numeric(14,2), null::text,
           tr.depth, tr.parent_code
    from tree tr
    join bs_accounts b on b.code = tr.code or tr.code = any(b.ancestors)
    join sect_ord s on s.k = b.kind
    group by s.o, tr.order_key, b.kind, tr.code, tr.name, tr.depth, tr.parent_code

    union all

    -- the profit nobody has closed yet, sitting where a closing entry would put it
    select 3, array['~~'],
           'EQUITY'::text, 'DERIVED'::text,
           null::text,
           'Result not yet closed to equity'::text,
           null::text,
           'Derived from income and expense accounts up to the as-of date'::text,
           v_result,
           null::numeric(14,2), null::text, null::integer, null::text

    union all

    select s.o, array['~~~'],
           b.kind, 'SECTION_TOTAL'::text,
           null::text,
           ('Total ' || lower(b.kind))::text,
           null::text, null::text,
           (sum(b.amt) + case when b.kind = 'EQUITY' then v_result else 0 end)::numeric(14,2),
           null::numeric(14,2), null::text, null::integer, null::text
    from bs_accounts b
    join sect_ord s on s.k = b.kind
    group by s.o, b.kind

    union all

    -- always emitted, healthy or not
    select 4, array[]::text[],
           'CHECK'::text, 'EQUATION'::text,
           null::text,
           'Assets minus (liabilities + equity + unclosed result)'::text,
           null::text, null::text,
           v_diff,
           null::numeric(14,2), null::text, null::integer, null::text
  )
  select 'OK'::text, v_go_live, p_as_of,
         row_number() over (order by b2.sort1, b2.sort2 collate "C"),
         b2.sect, b2.rk, b2.hcode, b2.hname, b2.acode, b2.aname, b2.amt,
         (v_diff = 0), v_diff, b2.moved, b2.moved_for, b2.hdepth, b2.hparent
  from body b2
  order by b2.sort1, b2.sort2 collate "C";
end;
$function$;

create function public.gl_profit_and_loss(p_from date, p_to date, p_department_type text DEFAULT NULL::text, p_department_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(report_status text, go_live_on date, period_from date, period_to date, ordinal bigint, section text, row_kind text, header_code text, header_name text, account_code text, account_name text, amount numeric, header_depth integer, parent_header_code text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
declare
  v_go_live date;
begin
  v_go_live := public.gl_report_guard();

  if p_from is null or p_to is null then
    raise exception 'gl_profit_and_loss: p_from and p_to are both required'
      using errcode = '22004';
  end if;
  if p_to < p_from then
    raise exception 'gl_profit_and_loss: p_to (%) is earlier than p_from (%)', p_to, p_from
      using errcode = '22007';
  end if;

  if p_to < v_go_live then
    return query
      select 'BEFORE_GO_LIVE'::text, v_go_live, p_from, p_to, 1::bigint,
             null::text, 'NOTICE'::text, null::text, null::text, null::text, null::text,
             null::numeric(14,2), null::integer, null::text;
    return;
  end if;


  return query
  with movement as (
    select l.account_code as acct,
           sum(l.debit)::numeric(14,2)  as dr,
           sum(l.credit)::numeric(14,2) as cr
    from public.gl_department_lines(p_department_type, p_department_id) l
    join public.gl_entries e on e.id = l.entry_id
    where e.posted
      and e.entry_date between p_from and p_to
    group by l.account_code
  ),
  pl_accounts as (
    select a.code,
           a.name,
           a.kind,
           coalesce(a.parent_code, a.code) as hdr,
           -- income reads credit-positive, expense reads debit-positive, so both
           -- sections are printed as plain positive amounts and the net figure
           -- is income minus expense with no sign gymnastics on the screen.
           (case when a.kind = 'INCOME'
                 then coalesce(m.cr, 0) - coalesce(m.dr, 0)
                 else coalesce(m.dr, 0) - coalesce(m.cr, 0) end)::numeric(14,2) as amt,
           t.ancestors, t.order_key, t.is_heading
    from public.gl_accounts a
    left join movement m on m.acct = a.code
    join public.gl_report_chart_tree() t on t.code = a.code
    where a.kind in ('INCOME','EXPENSE')
      and (a.is_active or m.acct is not null)   -- retired accounts still show if they moved
  ),
  tree as (
    select t.code, t.parent_code, t.depth, t.order_key, h.name
    from public.gl_report_chart_tree() t
    join public.gl_accounts h on h.code = t.code
    where t.is_heading
  ),
  body as (
    select case when p.kind = 'INCOME' then 1 else 2 end as sort1,
           p.order_key                                    as sort2,
           p.kind                                         as sect,
           'ACCOUNT'::text                                as rk,
           p.hdr                                          as hcode,
           hn.name                                        as hname,
           p.code                                         as acode,
           p.name                                         as aname,
           p.amt                                          as amt,
           null::integer                                  as hdepth,
           null::text                                     as hparent
    from pl_accounts p
    left join public.gl_accounts hn on hn.code = p.hdr
    where not p.is_heading or p.amt <> 0
       or not exists (select 1 from public.gl_accounts c where c.parent_code = p.code)

    union all

    -- every heading, at every depth: all the accounts under it, each once
    select case when p.kind = 'INCOME' then 1 else 2 end,
           tr.order_key || array['~'],
           p.kind, 'HEADER_SUBTOTAL'::text,
           tr.code, tr.name,
           null::text, null::text,
           sum(p.amt)::numeric(14,2),
           tr.depth, tr.parent_code
    from tree tr
    join pl_accounts p on p.code = tr.code or tr.code = any(p.ancestors)
    group by 1, tr.order_key, p.kind, tr.code, tr.name, tr.depth, tr.parent_code

    union all

    select case when p.kind = 'INCOME' then 1 else 2 end,
           array['~~~'],
           p.kind, 'SECTION_TOTAL'::text,
           null::text,
           case when p.kind = 'INCOME' then 'Total income' else 'Total expense' end,
           null::text, null::text,
           sum(p.amt)::numeric(14,2),
           null::integer, null::text
    from pl_accounts p
    group by 1, p.kind

    union all

    select 3, array[]::text[],
           'NET'::text, 'NET'::text,
           null::text, 'Net result for the period'::text,
           null::text, null::text,
           coalesce(sum(case when p.kind = 'INCOME' then p.amt else -p.amt end), 0)::numeric(14,2),
           null::integer, null::text
    from pl_accounts p
  )
  select 'OK'::text, v_go_live, p_from, p_to,
         row_number() over (order by b.sort1, b.sort2 collate "C"),
         b.sect, b.rk, b.hcode, b.hname, b.acode, b.aname, b.amt, b.hdepth, b.hparent
  from body b
  order by b.sort1, b.sort2 collate "C";
end;
$function$;

revoke all on function public.gl_balance_sheet(date, text, uuid) from public, anon;
revoke all on function public.gl_profit_and_loss(date, date, text, uuid) from public, anon;
grant execute on function public.gl_balance_sheet(date, text, uuid) to authenticated, service_role;
grant execute on function public.gl_profit_and_loss(date, date, text, uuid) to authenticated, service_role;

comment on function public.gl_balance_sheet(date, text, uuid) is
  'Balance sheet as of a date; 0540: optionally one department. A filtered sheet may not balance: contra lines of a mixed document are untagged. 0579: every heading at every depth carries its own subtotal (header_depth, parent_header_code), in chart order.';
comment on function public.gl_profit_and_loss(date, date, text, uuid) is
  'Profit and loss for a period; 0540: optionally one department. 0579: every heading at every depth carries its own subtotal (header_depth, parent_header_code), in chart order.';

notify pgrst, 'reload schema';
