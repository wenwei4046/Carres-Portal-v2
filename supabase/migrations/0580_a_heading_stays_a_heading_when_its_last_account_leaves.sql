-- 0580: a heading stays a heading when its last account leaves, and an
-- account moves between any two headings of the same kind.
--
-- YH's rulings of 24 Sep 2026:
--   1. A drag works for every move between headings of the same kind. A move
--      under a heading of another kind is still refused.
--   2. The last account under a heading may leave it (2310 out of 2300 Taxes
--      was refused by move_last_child). The emptied heading stays a heading:
--      nothing posts to it, no account picker offers it, it still takes
--      accounts, and accounts can be moved back into it.
--   3. An account that is not a bank or cash account does not go under the
--      money accounts heading (role MONEY_ACCOUNTS_HEADING) or under a heading
--      inside it. A bank or cash account (one with a gl_money_accounts row)
--      still moves out and back in.
--   4. Kept: nothing moves into or out of a heading gl_rule_headings names; a
--      heading never goes under itself or a heading inside it; a move made
--      against an order that has since changed is refused as stale.
--
-- Until now a heading was worked out each time: "an account another account
-- names as its parent". That answer turns false the moment the last account
-- leaves, and the heading would quietly become an account that takes
-- postings. So a heading is now stored: gl_accounts.is_heading.
--
--   * The column is filled once, below, for every account that has an account
--     under it today. That is the chart's structure, not business data, and
--     it is the same answer every function below gave until now.
--   * A trigger sets it on the parent whenever an account is added or moved
--     under it, so "has an account under it" still always means a heading.
--   * gl_accounts_protect_posted refuses taking the flag off a heading that
--     still has an account under it, and giving it to an account with posted
--     lines.
--   * Every function that worked heading-ness out from the children now reads
--     the flag: gl_post, _ap_require_account, ap_account_choices,
--     fin_money_in_account_options, fin_money_in_account_problem,
--     gl_map_income_account, gl_map_payment_account, gl_money_account_ok,
--     gl_account_add, gl_account_move, gl_accounts_reorder and
--     gl_report_chart_tree.
--   * gl_balance_sheet and gl_profit_and_loss (from their 0579 bodies) build a
--     heading's subtotal from the rows that print, so an empty heading prints
--     no line at all, not a 0.00 line.
--
-- gl_trial_balance is not changed: it lists every account, and the API drops
-- the headings from it by this same flag.
--
-- Every replaced function starts from its latest body on main; the lines that
-- change are marked 0580. The signatures and return types are unchanged, so
-- CREATE OR REPLACE keeps each function's grants and comment.

alter table public.gl_accounts
  add column is_heading boolean not null default false;

comment on column public.gl_accounts.is_heading is
  '0580: this account is a heading. Nothing posts to it, no picker offers it, and it can hold accounts. Set by a trigger when an account goes under it; it stays when the last account leaves.';

-- The chart's structure, not a business-data backfill: every account that has
-- an account under it is a heading, which is what every check read until now.
update public.gl_accounts a
   set is_heading = true
 where exists (select 1 from public.gl_accounts c where c.parent_code = a.code);

create function public.gl_accounts_parent_is_heading()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- An account went under NEW.parent_code, so that account is a heading.
  update public.gl_accounts a
     set is_heading = true
   where a.code = new.parent_code
     and not a.is_heading;
  return null;
end;
$function$;

revoke all on function public.gl_accounts_parent_is_heading() from public, anon, authenticated;

comment on function public.gl_accounts_parent_is_heading() is
  '0580: an account added or moved under another makes that other a heading (gl_accounts.is_heading).';

create trigger gl_accounts_parent_is_heading_trg
  after insert or update of parent_code on public.gl_accounts
  for each row
  when (new.parent_code is not null)
  execute function public.gl_accounts_parent_is_heading();

-- 1 · _ap_require_account (0554): a heading is the stored flag.
CREATE OR REPLACE FUNCTION public._ap_require_account(p_code text, p_use text, p_what text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_acc  public.gl_accounts%rowtype;
  v_code text := btrim(coalesce(p_code, ''));
begin
  if v_code = '' then
    raise exception '%: choose an account.', p_what
      using errcode = 'P0001', detail = 'account_missing';
  end if;
  select * into v_acc from public.gl_accounts where code = v_code;
  if not found then
    raise exception '%: account % is not in the chart of accounts.', p_what, v_code
      using errcode = 'P0001', detail = 'account_unknown';
  end if;
  if not v_acc.is_active then
    raise exception '%: account % % is no longer in use.', p_what, v_acc.code, v_acc.name
      using errcode = 'P0001', detail = 'account_retired';
  end if;
  if v_acc.is_heading then                                -- 0580: the stored flag
    raise exception '%: % % is a heading. Choose one of the accounts under it.', p_what, v_acc.code, v_acc.name
      using errcode = 'P0001', detail = 'account_is_heading';
  end if;

  -- 0510: 1230 Advances to suppliers is written only by the Advance flow,
  -- which reaches the supplier's payables account through 'ap', never a line.
  -- 0554: the number is read from gl_account_roles, not written here.
  if v_acc.code = public.gl_account_for('SUPPLIER_ADVANCE') and p_use in ('bill_line','voucher_line') then
    raise exception '%: account % % is kept by its own documents and cannot be picked here.', p_what, v_acc.code, v_acc.name
      using errcode = 'P0001', detail = 'account_kept_by_own_documents';
  end if;

  if p_use = 'bill_line' then
    if v_acc.is_control then
      raise exception '%: % % is a control account. A bill line is a cost — choose an expense or asset account.', p_what, v_acc.code, v_acc.name
        using errcode = 'P0001', detail = 'account_is_control';
    end if;
    if v_acc.kind not in ('EXPENSE','ASSET') then
      raise exception '%: % % is not an expense or asset account.', p_what, v_acc.code, v_acc.name
        using errcode = 'P0001', detail = 'account_wrong_kind';
    end if;
    if public.ap_account_is_money(v_acc.code) then
      raise exception '%: % % is a cash or bank account. A bill does not move money; the payment voucher does.', p_what, v_acc.code, v_acc.name
        using errcode = 'P0001', detail = 'account_is_money';
    end if;
  elsif p_use = 'voucher_line' then
    if v_acc.is_control then
      raise exception '%: % % is a control account. To pay a supplier''s bill, choose the bill instead of a line.', p_what, v_acc.code, v_acc.name
        using errcode = 'P0001', detail = 'account_is_control';
    end if;
    if v_acc.kind not in ('EXPENSE','ASSET','LIABILITY') then
      raise exception '%: % % is not an expense, asset or liability account.', p_what, v_acc.code, v_acc.name
        using errcode = 'P0001', detail = 'account_wrong_kind';
    end if;
  elsif p_use = 'ap' then
    if v_acc.kind <> 'LIABILITY' or not v_acc.is_control
       or v_acc.control_for is distinct from 'SUPPLIER' then
      raise exception '%: % % is not a payables account for suppliers.', p_what, v_acc.code, v_acc.name
        using errcode = 'P0001', detail = 'ap_not_supplier_control';
    end if;
  elsif p_use in ('pay_from', 'received_into') then
    if exists (select 1 from public.gl_money_accounts m
                where m.account_code = v_acc.code and not m.is_active) then
      raise exception '%: account % % is no longer in use.', p_what, v_acc.code, v_acc.name
        using errcode = 'P0001', detail = 'account_retired';
    end if;
    -- 0512: money OUT leaves from cash or a bank only, never from a card or
    -- online payment company's holding account.
    if p_use = 'pay_from' and not public.gl_money_account_ok(v_acc.code, 'out') then
      raise exception '%: % % is not a cash or bank account.', p_what, v_acc.code, v_acc.name
        using errcode = 'P0001', detail = 'pay_from_not_money';
    end if;
    if p_use = 'received_into' and not public.gl_money_account_ok(v_acc.code, 'in') then
      raise exception '%: % % is not a bank or cash account.', p_what, v_acc.code, v_acc.name
        using errcode = 'P0001', detail = 'received_into_not_money';
    end if;
  else
    raise exception 'unknown account use %', p_use
      using errcode = '22023', detail = 'account_use_unknown';
  end if;
end;
$function$
;

-- 2 · ap_account_choices (0554): no heading is offered, an empty one included.
CREATE OR REPLACE FUNCTION public.ap_account_choices()
 RETURNS TABLE(code text, name text, kind text, parent_code text, is_control boolean, control_for text, for_bill_line boolean, for_voucher_line boolean, for_ap boolean, for_pay_from boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
declare
  -- 0554: one lookup, not one per account row.
  v_advance text := public.gl_account_for('SUPPLIER_ADVANCE');
begin
  if not public.gl_may_read() then
    raise exception 'accounts payable is internal'
      using errcode = '42501', detail = 'not_internal';
  end if;
  return query
  select a.code, a.name, a.kind, a.parent_code, a.is_control, a.control_for,
         (not a.is_control and a.code <> v_advance and a.kind in ('EXPENSE','ASSET') and not public.ap_account_is_money(a.code)),
         (not a.is_control and a.code <> v_advance and a.kind in ('EXPENSE','ASSET','LIABILITY')),
         (a.kind = 'LIABILITY' and a.is_control and a.control_for = 'SUPPLIER'),
         public.gl_money_account_ok(a.code, 'out')      -- 0512: cash and bank only
    from public.gl_accounts a
   where a.is_active
     and not a.is_heading                                -- 0580: the stored flag
   order by a.code;
end;
$function$
;

-- 3 · fin_money_in_account_options: no heading is offered, an empty one included.
CREATE OR REPLACE FUNCTION public.fin_money_in_account_options()
 RETURNS TABLE(code text, name text, kind text, parent_code text, for_money boolean, for_receipt_line boolean, for_invoice_line boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not public.gl_may_read() then
    raise exception 'The chart is for Finance.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  return query
  select a.code, a.name, a.kind, a.parent_code,
         public.fin_money_in_account_problem(a.code, 'money') is null,
         public.fin_money_in_account_problem(a.code, 'receipt_line') is null,
         public.fin_money_in_account_problem(a.code, 'invoice_line') is null
    from public.gl_accounts a
   where a.is_active
     and not a.is_heading                                -- 0580: the stored flag
   order by a.code;
end;
$function$
;

-- 4 · fin_money_in_account_problem (0570): a heading is the stored flag.
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
  if v.is_heading then                                    -- 0580: the stored flag
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
$function$
;

-- 5 · gl_map_income_account: a heading is the stored flag.
CREATE OR REPLACE FUNCTION public.gl_map_income_account(p_component_type text, p_component_key text, p_account_code text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_key text;
begin
  if not public.is_principal() then
    raise exception 'forbidden: only the principal can map an income account'
      using errcode = '42501', detail = 'forbidden';
  end if;
  if p_component_type not in ('GOODS','ADDON','STORAGE') then
    raise exception '% is not an invoice component type', coalesce(p_component_type,'null')
      using errcode = '22023', detail = 'bad_component_type';
  end if;

  v_key := coalesce(nullif(btrim(coalesce(p_component_key, '')), ''), '*');

  -- The one rule that makes an unmapped add-on a refusal instead of a silent
  -- misposting. Do not relax it.
  if p_component_type = 'ADDON' and v_key = '*' then
    raise exception 'an ADDON catch-all row is refused — map each add-on key explicitly, or let it refuse'
      using errcode = '22023', detail = 'addon_wildcard_refused';
  end if;

  if not exists (select 1 from gl_accounts a where a.code = p_account_code and a.is_active) then
    raise exception 'account % is not an active account in the chart', coalesce(p_account_code,'null')
      using errcode = '22023', detail = 'account_not_found';
  end if;
  if not exists (select 1 from gl_accounts a where a.code = p_account_code and a.kind = 'INCOME') then
    raise exception 'account % is not an income account — an invoice credits income', p_account_code
      using errcode = '22023', detail = 'account_not_income';
  end if;
  if exists (select 1 from gl_accounts a where a.code = p_account_code and a.is_heading) then  -- 0580
    raise exception 'account % is a header — post to one of its children', p_account_code
      using errcode = '22023', detail = 'account_is_header';
  end if;

  insert into gl_income_account_map (component_type, component_key, account_code, note, updated_by)
  values (p_component_type, v_key, p_account_code,
          nullif(btrim(coalesce(p_note,'')),''), auth.uid())
  on conflict (component_type, component_key) do update
    set account_code = excluded.account_code,
        note         = excluded.note,
        updated_at   = now(),
        updated_by   = excluded.updated_by;
end;
$function$
;

-- 6 · gl_map_payment_account (0541): a heading is the stored flag.
CREATE OR REPLACE FUNCTION public.gl_map_payment_account(p_method text, p_account_code text, p_source_channel text DEFAULT '*'::text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_method text;
begin
  if not public.is_principal() then
    raise exception 'forbidden: only the principal can map a payment account'
      using errcode = '42501', detail = 'forbidden';
  end if;
  -- 0476: a method is a key — a system word or a method in Settings → Payment.
  v_method := public.payment_method_key(p_method);
  if v_method is null
     or not (v_method in ('cash','bank','card','cheque','online','other',
                          'duitnow_qr','credit_card','debit_card')
             or exists (select 1 from payment_manual_methods m where m.method = v_method)) then
    raise exception '% is not a payment method', coalesce(p_method,'null')
      using errcode = '22023', detail = 'bad_method';
  end if;
  if not exists (select 1 from gl_accounts a where a.code = p_account_code and a.is_active) then
    raise exception 'account % is not an active account in the chart', coalesce(p_account_code,'null')
      using errcode = '22023', detail = 'account_not_found';
  end if;
  if exists (select 1 from gl_accounts a where a.code = p_account_code and a.is_control) then
    raise exception 'account % is a control account — customer money never debits a control account',
      p_account_code using errcode = '22023', detail = 'account_is_control';
  end if;
  if exists (select 1 from gl_accounts a where a.code = p_account_code and a.is_heading) then  -- 0580
    raise exception 'account % is a header — post to one of its children', p_account_code
      using errcode = '22023', detail = 'account_is_header';
  end if;
  -- 0541: only an in-use money account, and wait on its row (0518).
  perform 1 from public.gl_money_accounts where account_code = p_account_code for share;
  if not public.gl_money_account_ok(p_account_code) then
    raise exception 'account % is not a money account — choose cash, a bank account or card and online settlement',
      p_account_code
      using errcode = '22023', detail = 'account_not_money';
  end if;

  insert into gl_payment_account_map (method, source_channel, account_code, note, updated_by)
  values (v_method, coalesce(nullif(btrim(p_source_channel), ''), '*'), p_account_code,
          nullif(btrim(coalesce(p_note,'')),''), auth.uid())
  on conflict (method, source_channel) do update
    set account_code = excluded.account_code,
        note         = excluded.note,
        updated_at   = now(),
        updated_by   = excluded.updated_by;
end;
$function$
;

-- 7 · gl_money_account_ok (0512): a heading is the stored flag.
CREATE OR REPLACE FUNCTION public.gl_money_account_ok(p_account_code text, p_direction text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce((
    select m.is_active and a.is_active and a.kind = 'ASSET' and not a.is_control
           and not a.is_heading                        -- 0580: the stored flag
           and case p_direction
                 when 'out' then m.money_kind in ('CASH','BANK')
                 when 'in'  then m.money_kind in ('CASH','BANK','HOLDING')
                 else false
               end
      from public.gl_money_accounts m
      join public.gl_accounts a on a.code = m.account_code
     where m.account_code = p_account_code), false);
$function$
;

-- 8 · gl_post (0540): a line on a heading is refused by the stored flag, so an
-- empty heading is refused too. Same sentence, same tag.
CREATE OR REPLACE FUNCTION public.gl_post(p_source_type text, p_source_doc_no text, p_entry_date date, p_narration text, p_lines jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid         uuid;
  v_existing    uuid;
  v_go_live     date;
  v_count       int;
  v_elem        jsonb;
  v_idx         int := 0;
  v_code        text;
  v_active      boolean;
  v_control     boolean;
  v_control_for text;
  v_debit       numeric(12,2);
  v_credit      numeric(12,2);
  v_party_type  text;
  v_party_id    uuid;
  v_kind        text;   -- 0540
  v_heading     boolean; -- 0580
  v_dept_type   text;   -- 0540
  v_dept_id     uuid;   -- 0540
  v_sum_debit   numeric(12,2) := 0;
  v_sum_credit  numeric(12,2) := 0;
  v_norm        jsonb := '[]'::jsonb;
  v_source_type text;
  v_doc_no      text;
  v_entry_no    text;
  v_entry_id    uuid;
begin
  -- 0468: no role check here. WHO may act is decided by the document function
  -- that calls this one (a payment, an invoice, a bill, a journal), because
  -- that function knows the business rule. This function decides only whether
  -- the entry itself is valid. Nobody can call it over the API: execute is
  -- revoked from authenticated at the bottom of 0468.
  v_uid := auth.uid();

  -- Step 0 · the source identity must exist before step 1 can look it up.
  -- (Not in the contract's numbered list, but step 1 is undefined without it.)
  v_source_type := btrim(coalesce(p_source_type, ''));
  v_doc_no      := btrim(coalesce(p_source_doc_no, ''));
  if v_source_type = '' then
    raise exception 'gl_post refused: source_type is required'
      using errcode = '22023', detail = 'gl_post_source_type_blank';
  end if;
  if v_doc_no = '' then
    raise exception 'gl_post refused: source_doc_no is required for source_type %', v_source_type
      using errcode = '22023', detail = 'gl_post_source_doc_no_blank';
  end if;

  -- ── Step 1 · idempotency. A retry, a double-click and a replayed webhook
  -- all find the entry that already stands and get its id back. No raise.
  select e.id into v_existing
    from public.gl_entries e
   where e.source_type = v_source_type
     and e.source_doc_no = v_doc_no
     and e.posted
     and not e.reversed
   limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  -- ── Step 2 · the date.
  -- A NULL date RAISES. It is NEVER silently replaced with current_date. The
  -- system being replaced substitutes today, which quietly posts money into the
  -- wrong month; that is the one bug this whole file exists to refuse to copy.
  if p_entry_date is null then
    raise exception 'gl_post refused: entry_date is required for %/% — a blank date is never replaced with today', v_source_type, v_doc_no
      using errcode = '22023', detail = 'gl_post_entry_date_null';
  end if;

  select c.go_live_on into v_go_live from public.gl_config c where c.id;
  if v_go_live is null then
    raise exception 'gl_post refused: the ledger has no go-live date configured (gl_config is empty)'
      using errcode = '22023', detail = 'gl_post_no_go_live';
  end if;
  if p_entry_date < v_go_live then
    raise exception 'gl_post refused: entry_date % is before the ledger go-live date %', p_entry_date, v_go_live
      using errcode = '22023', detail = 'gl_post_entry_date_before_go_live';
  end if;

  -- ── Step 3 · the shape of the line list.
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'gl_post refused: p_lines must be a JSON array, got % for %/%',
      coalesce(jsonb_typeof(p_lines), 'null'), v_source_type, v_doc_no
      using errcode = '22023', detail = 'gl_post_lines_not_array';
  end if;
  v_count := jsonb_array_length(p_lines);
  if v_count < 2 then
    raise exception 'gl_post refused: an entry needs at least two lines, got % for %/%', v_count, v_source_type, v_doc_no
      using errcode = '22023', detail = 'gl_post_too_few_lines';
  end if;

  -- ── Step 4 · every line, one at a time. Each refusal names the line number
  -- AND the offending value, because "invalid line" is not a debuggable error.
  for v_elem in select value from jsonb_array_elements(p_lines) loop
    v_idx := v_idx + 1;

    if jsonb_typeof(v_elem) <> 'object' then
      raise exception 'gl_post refused: line % is a %, expected an object', v_idx, jsonb_typeof(v_elem)
        using errcode = '22023', detail = 'gl_post_line_not_object';
    end if;

    v_code := btrim(coalesce(v_elem->>'account_code', ''));
    if v_code = '' then
      raise exception 'gl_post refused: line % has no account_code', v_idx
        using errcode = '22023', detail = 'gl_post_line_account_code_blank';
    end if;

    select a.is_active, a.is_control, a.control_for, a.kind, a.is_heading
      into v_active, v_control, v_control_for, v_kind, v_heading
      from public.gl_accounts a where a.code = v_code;
    if not found then
      raise exception 'gl_post refused: line % names account %, which is not in the chart', v_idx, v_code
        using errcode = '23503', detail = 'gl_post_account_unknown';
    end if;
    if not v_active then
      raise exception 'gl_post refused: line % names account %, which is retired', v_idx, v_code
        using errcode = '22023', detail = 'gl_post_account_inactive';
    end if;
    -- 0580: a HEADER is gl_accounts.is_heading. Every account that another
    -- row names as its parent carries it, active or retired, and it stays
    -- when the last account leaves, so an empty heading is never posted to.
    if v_heading then
      raise exception 'gl_post refused: line % names account %, which is a header account and cannot be posted to', v_idx, v_code
        using errcode = '22023', detail = 'gl_post_account_is_header';
    end if;

    -- Amounts. A non-numeric amount is refused by name rather than by an
    -- unreadable cast error, and both sides are rounded to the storage scale
    -- BEFORE the balance test, so a set of lines that balances on input can
    -- never become unbalanced on write.
    if v_elem ? 'debit' and jsonb_typeof(v_elem->'debit') not in ('number','null') then
      raise exception 'gl_post refused: line % debit is a %, expected a number', v_idx, jsonb_typeof(v_elem->'debit')
        using errcode = '22023', detail = 'gl_post_line_debit_not_number';
    end if;
    if v_elem ? 'credit' and jsonb_typeof(v_elem->'credit') not in ('number','null') then
      raise exception 'gl_post refused: line % credit is a %, expected a number', v_idx, jsonb_typeof(v_elem->'credit')
        using errcode = '22023', detail = 'gl_post_line_credit_not_number';
    end if;
    v_debit  := round(coalesce((v_elem->>'debit')::numeric, 0), 2);
    v_credit := round(coalesce((v_elem->>'credit')::numeric, 0), 2);

    if v_debit < 0 or v_credit < 0 then
      raise exception 'gl_post refused: line % on account % has a negative amount (debit %, credit %) — reverse the sides instead', v_idx, v_code, v_debit, v_credit
        using errcode = '22023', detail = 'gl_post_line_negative';
    end if;
    if v_debit <> 0 and v_credit <> 0 then
      raise exception 'gl_post refused: line % on account % has both a debit (%) and a credit (%)', v_idx, v_code, v_debit, v_credit
        using errcode = '22023', detail = 'gl_post_line_two_sided';
    end if;
    if v_debit = 0 and v_credit = 0 then
      raise exception 'gl_post refused: line % on account % has neither a debit nor a credit', v_idx, v_code
        using errcode = '22023', detail = 'gl_post_line_empty';
    end if;

    -- The party.
    v_party_type := nullif(btrim(coalesce(v_elem->>'party_type','')), '');
    begin
      v_party_id := nullif(btrim(coalesce(v_elem->>'party_id','')), '')::uuid;
    exception when invalid_text_representation then
      raise exception 'gl_post refused: line % party_id % is not a uuid', v_idx, v_elem->>'party_id'
        using errcode = '22023', detail = 'gl_post_line_party_id_not_uuid';
    end;

    -- 0478: a third party type, OTHER (a finance_parties row). These lines are
    -- the only difference from the 0468 body.
    if v_party_type is not null and v_party_type not in ('CUSTOMER','SUPPLIER','OTHER') then
      raise exception 'gl_post refused: line % party_type % is not CUSTOMER, SUPPLIER or OTHER', v_idx, v_party_type
        using errcode = '22023', detail = 'gl_post_line_party_type_unknown';
    end if;
    if (v_party_type is null) <> (v_party_id is null) then
      raise exception 'gl_post refused: line % names a party by only half — party_type %, party_id %',
        v_idx, coalesce(v_party_type,'null'), coalesce(v_party_id::text,'null')
        using errcode = '22023', detail = 'gl_post_line_party_half_named';
    end if;
    -- A control account (AR / AP) is a subsidiary ledger in disguise: without a
    -- party the balance can never be broken back down to who owes it.
    if v_control and (v_party_type is null or v_party_id is null) then
      raise exception 'gl_post refused: line % posts to control account % without a party — both party_type and party_id are required', v_idx, v_code
        using errcode = '22023', detail = 'gl_post_control_account_needs_party';
    end if;
    -- And it must be the right KIND of party. Trade receivables is a customer
    -- ledger; booking a supplier into it produces a balance that looks correct
    -- in total and cannot be broken back down to anybody. Checking that a party
    -- exists is not the same as checking it belongs here.
    if v_control and v_party_type is distinct from v_control_for then
      raise exception 'gl_post refused: line % posts a % to account %, which is a % control account',
        v_idx, v_party_type, v_code, v_control_for
        using errcode = '22023', detail = 'gl_post_party_type_wrong_side';
    end if;

    -- 0540: the department. Its shape (which type needs which id) is the
    -- table's check constraint; the one rule that needs the chart is here:
    -- Office has expenses only.
    v_dept_type := nullif(btrim(coalesce(v_elem->>'department_type','')), '');
    begin
      v_dept_id := nullif(btrim(coalesce(v_elem->>'department_id','')), '')::uuid;
    exception when invalid_text_representation then
      raise exception 'gl_post refused: line % department_id % is not a uuid', v_idx, v_elem->>'department_id'
        using errcode = '22023', detail = 'gl_post_line_department_id_not_uuid';
    end;
    if v_dept_type = 'OFFICE' and v_kind = 'INCOME' then
      raise exception 'gl_post refused: line % puts income on account % in the Office department', v_idx, v_code
        using errcode = '22023', detail = 'gl_post_office_income';
    end if;

    v_sum_debit  := v_sum_debit + v_debit;
    v_sum_credit := v_sum_credit + v_credit;

    v_norm := v_norm || jsonb_build_object(
      'line_no',      v_idx,
      'account_code', v_code,
      'debit',        v_debit,
      'credit',       v_credit,
      'party_type',   v_party_type,
      'party_id',     v_party_id,
      'memo',         nullif(btrim(coalesce(v_elem->>'memo','')), ''),
      'department_type', v_dept_type,
      'department_id',   v_dept_id
    );
  end loop;

  -- ── Step 5 · the balance.
  if v_sum_debit <> v_sum_credit then
    raise exception 'gl_post refused: %/% is out of balance — debit % vs credit % (difference %)',
      v_source_type, v_doc_no, v_sum_debit, v_sum_credit, (v_sum_debit - v_sum_credit)
      using errcode = '23514', detail = 'gl_post_out_of_balance';
  end if;
  if v_sum_debit = 0 then
    raise exception 'gl_post refused: %/% totals zero on both sides — an entry that moves nothing is not an entry',
      v_source_type, v_doc_no
      using errcode = '22023', detail = 'gl_post_zero_total';
  end if;

  -- ── Step 6 · allocate the number and write.
  v_entry_no := public.gl_next_doc_no('JE', p_entry_date);

  insert into public.gl_entries
    (entry_no, entry_date, source_type, source_doc_no, narration,
     total_debit, total_credit, posted, created_by)
  values
    (v_entry_no, p_entry_date, v_source_type, v_doc_no,
     nullif(btrim(coalesce(p_narration,'')), ''),
     v_sum_debit, v_sum_credit, true,
     (select u.id from public.app_users u where u.id = v_uid))
  returning id into v_entry_id;

  insert into public.gl_entry_lines
    (entry_id, line_no, account_code, debit, credit, party_type, party_id, memo,
     department_type, department_id)
  select v_entry_id,
         (l->>'line_no')::int,
         l->>'account_code',
         (l->>'debit')::numeric,
         (l->>'credit')::numeric,
         l->>'party_type',
         (l->>'party_id')::uuid,
         l->>'memo',
         l->>'department_type',
         (l->>'department_id')::uuid
    from jsonb_array_elements(v_norm) l;

  return v_entry_id;
end;
$function$
;

-- 9 · gl_accounts_protect_posted (0570): the flag is guarded like the parent.
CREATE OR REPLACE FUNCTION public.gl_accounts_protect_posted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_lines bigint;
begin
  -- 0570: a chart renumber. The renumbered account changes only its number,
  -- and an account under a renumbered heading changes only its parent's number.
  if tg_op = 'UPDATE' and (
       (old.code = current_setting('carres.gl_renumber_from', true)
        and new.code = current_setting('carres.gl_renumber_to', true)
        and to_jsonb(new) - 'code' = to_jsonb(old) - 'code')
       or public.gl_renumber_only(to_jsonb(old), to_jsonb(new), array['parent_code'])) then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.is_active and old.is_active
     and new.parent_code is not distinct from old.parent_code
     and new.is_heading = old.is_heading then            -- 0580
    return new;                                   -- nothing dangerous changed
  end if;

  if tg_op = 'UPDATE' and (old.is_active and not new.is_active) then
    select count(*) into v_lines
      from public.gl_entry_lines l where l.account_code = old.code;
    if v_lines > 0 then
      raise exception 'account % has % posted line(s) and cannot be retired — entries touching it would become unreversible', old.code, v_lines
        using errcode = '22023', detail = 'gl_account_has_posted_history',
              hint = 'Rename it, or stop using it. A used account stays in the chart.';
    end if;
  end if;

  -- 0580: the flag is what gl_post reads. It never comes off a heading that
  -- still has an account under it, and an account with posted lines never
  -- gets it.
  if tg_op = 'UPDATE' and old.is_heading and not new.is_heading
     and exists (select 1 from public.gl_accounts c where c.parent_code = old.code) then
    raise exception 'account % has accounts under it and stays a heading', old.code
      using errcode = '22023', detail = 'gl_heading_has_accounts';
  end if;
  if tg_op = 'UPDATE' and new.is_heading and not old.is_heading then
    select count(*) into v_lines
      from public.gl_entry_lines l where l.account_code = new.code;
    if v_lines > 0 then
      raise exception 'account % has % posted line(s) and cannot become a header', new.code, v_lines
        using errcode = '22023', detail = 'gl_parent_has_posted_history',
              hint = 'Hang the new account off a parent that has never been posted to.';
    end if;
  end if;

  -- Making an account into a header: catch it from the CHILD side, because
  -- that is where the change actually happens.
  if tg_op in ('INSERT','UPDATE') and new.parent_code is not null then
    select count(*) into v_lines
      from public.gl_entry_lines l where l.account_code = new.parent_code;
    if v_lines > 0 then
      raise exception 'account % has % posted line(s) and cannot become a header by gaining child %', new.parent_code, v_lines, new.code
        using errcode = '22023', detail = 'gl_parent_has_posted_history',
              hint = 'Hang the new account off a parent that has never been posted to.';
    end if;
  end if;

  return new;
end;
$function$
;

-- 10 · gl_accounts_reorder (0557): an empty heading is still in the chart.
CREATE OR REPLACE FUNCTION public.gl_accounts_reorder(p_parent_code text, p_was text[], p_now text[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role     text := public.app_role()::text;
  v_children text[];   -- this heading's codes, sorted by code (the SET)
  v_order    text[];   -- this heading's codes, in the order stored right now
  v_sent     text[];
  v_stray    text;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance changes the chart of accounts.'
      using errcode = '42501', detail = 'not_finance';
  end if;

  if p_now is null or array_length(p_now, 1) is null then
    raise exception 'Send every account under this heading, in the order you want them.'
      using errcode = '22023', detail = 'order_incomplete';
  end if;

  -- A blank element is its own mistake. It must be caught HERE: `not (null =
  -- any (...))` is NULL, never true, so a blank slips past every membership
  -- test below and would be reported as whatever check happens to fail next.
  if exists (select 1 from unnest(p_now) c where c is null)
     or exists (select 1 from unnest(coalesce(p_was, array[]::text[])) c where c is null) then
    raise exception 'The order has a blank where an account should be.'
      using errcode = '22023', detail = 'order_blank';
  end if;

  if exists (select 1 from unnest(p_now) c group by c having count(*) > 1) then
    raise exception 'The same account is listed twice.'
      using errcode = '22023', detail = 'order_duplicate';
  end if;

  if p_was is null or array_length(p_was, 1) is null then
    raise exception 'Send the order the chart was in before the drag.'
      using errcode = '22023', detail = 'order_was_missing';
  end if;

  -- Lock this heading's children first, so two reorders of the same heading
  -- take turns instead of interleaving. (FOR UPDATE cannot be used with an
  -- aggregate, hence the separate PERFORM.)
  perform 1 from public.gl_accounts a
    where a.parent_code is not distinct from p_parent_code
    order by a.code
    for update;

  select array_agg(a.code order by a.code),
         array_agg(a.code order by a.sort_order, a.code)
    into v_children, v_order
    from public.gl_accounts a
   where a.parent_code is not distinct from p_parent_code;

  -- 0580: a heading with nothing under it is still in the chart. The `was`
  -- sent names accounts it no longer has, so the stale check below answers.
  if v_children is null
     and not exists (select 1 from public.gl_accounts a where a.code = p_parent_code and a.is_heading) then
    raise exception 'That account is not in the chart.'
      using errcode = '22023', detail = 'heading_not_found';
  end if;

  -- STALE FIRST. Everything below names a mistake in the caller's list, and
  -- that accusation is only fair once we know the caller was looking at the
  -- chart as it stands. If somebody else dragged in between, THAT is the cause.
  if p_was is distinct from v_order then
    raise exception 'The chart changed while you were dragging. Open it again and redo the move.'
      using errcode = '40001', detail = 'order_stale';
  end if;

  select c into v_stray
    from unnest(p_now) c
   where not exists (select 1 from public.gl_accounts a where a.code = c)
   limit 1;
  if v_stray is not null then
    raise exception 'That account is not in the chart.'
      using errcode = '22023', detail = 'order_unknown_account';
  end if;

  select c into v_stray
    from unnest(p_now) c
   where not (c = any (v_children))
   limit 1;
  if v_stray is not null then
    raise exception 'Move an account only among the accounts under the same heading.'
      using errcode = '22023', detail = 'order_not_sibling';
  end if;

  -- Nothing stray and nothing duplicated, so a set that still differs can only
  -- be a list that left an account out.
  select array_agg(c order by c) into v_sent from unnest(p_now) c;
  if v_sent is distinct from v_children then
    raise exception 'Send every account under this heading, in the order you want them.'
      using errcode = '22023', detail = 'order_incomplete';
  end if;

  update public.gl_accounts a
     set sort_order = o.ord::integer
    from unnest(p_now) with ordinality o(code, ord)
   where a.code = o.code
     and a.sort_order is distinct from o.ord::integer;

  return array_length(p_now, 1);
end;
$function$
;

-- 11 · gl_account_add (0577): the heading is the stored flag, so an account can
-- be added under an empty heading. A new heading gets the flag from the
-- trigger when its first account goes in under it.
CREATE OR REPLACE FUNCTION public.gl_account_add(p_parent_code text, p_code text, p_name text, p_first_code text DEFAULT NULL::text, p_first_name text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role  text := public.app_role()::text;
  v_head  public.gl_accounts%rowtype;
  v_hdr   public.gl_accounts%rowtype;
  v_rule  text;
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
     and (u.depth > 0 or p_first_code is not null or p_first_name is not null)
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

  insert into public.gl_accounts (code, name, kind, parent_code, is_control, is_active, control_for, sort_order)
  values (v_code, btrim(p_name), v_head.kind, v_head.code, false, true, null,
          (select coalesce(max(a.sort_order), 0) + 1 from public.gl_accounts a where a.parent_code = v_head.code));
  if v_first is not null then
    insert into public.gl_accounts (code, name, kind, parent_code, is_control, is_active, control_for, sort_order)
    values (v_first, btrim(p_first_name), v_head.kind, v_code, false, true, null, 1);
  end if;
  return v_code;
end;
$function$
;

-- 12 · gl_account_move (0577): any move between headings of the same kind; the
-- last account may leave; nothing but bank and cash accounts goes into the money
-- accounts heading.
CREATE OR REPLACE FUNCTION public.gl_account_move(p_code text, p_to_parent text, p_from_was text[], p_from_now text[], p_to_was text[], p_to_now text[])
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role  text := public.app_role()::text;
  v_from  text;                        -- the heading it leaves
  v_acc   public.gl_accounts%rowtype;
  v_to    public.gl_accounts%rowtype;
  v_hdr   public.gl_accounts%rowtype;
  v_rule  text;
  v_money public.gl_accounts%rowtype;   -- 0580
  v_plain public.gl_accounts%rowtype;   -- 0580
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
  -- 0580: the stored flag, so a heading whose last account left still takes one.
  if not v_to.is_heading then
    raise exception '% % is not a heading. Move the account under a heading.', v_to.code, v_to.name
      using errcode = '22023', detail = 'move_onto_account';
  end if;
  if v_to.kind <> v_acc.kind then
    raise exception 'An account moves only under a heading of the same kind.'
      using errcode = '22023', detail = 'move_other_kind';
  end if;
  -- 0580: the money accounts heading, and every heading inside it, holds bank
  -- and cash accounts only (a gl_money_accounts row). A bank or cash account
  -- moves out and back in; any other account, or a heading holding one, is
  -- refused. A heading with nothing else under it may go in.
  select a.* into v_money from public.gl_accounts a
   where a.code = public.gl_account_for('MONEY_ACCOUNTS_HEADING');
  if exists (
    with recursive up(code) as (
      select p_to_parent
      union
      select a.parent_code from public.gl_accounts a join up on a.code = up.code
       where a.parent_code is not null
    )
    select 1 from up where up.code = v_money.code
  ) then
    select a.* into v_plain from public.gl_accounts a
     where a.code in (
             with recursive down(code) as (
               select p_code
               union
               select c.code from public.gl_accounts c join down on c.parent_code = down.code
             )
             select down.code from down)
       and not a.is_heading
       and not exists (select 1 from public.gl_money_accounts m where m.account_code = a.code)
     order by a.code
     limit 1;
    if found and v_plain.code = v_acc.code then
      raise exception '% % is not a bank or cash account. Only bank and cash accounts go under % %.', v_acc.code, v_acc.name, v_money.code, v_money.name
        using errcode = '22023', detail = 'move_into_money_heading';
    elsif found then
      raise exception '% % holds % %, which is not a bank or cash account. Only bank and cash accounts go under % %.', v_acc.code, v_acc.name, v_plain.code, v_plain.name, v_money.code, v_money.name
        using errcode = '22023', detail = 'move_into_money_heading';
    end if;
  end if;
  -- 0577: the rule heading may sit above the heading it leaves or joins, not
  -- only be it. Walk up from both, or a two-step move gets around 0570's check.
  select u.code into v_rule from (
    with recursive up(code) as (
      select c from unnest(array[v_from, p_to_parent]) c where c is not null
      union
      select a.parent_code from public.gl_accounts a join up on a.code = up.code
       where a.parent_code is not null
    )
    select up.code from up
  ) u
   where u.code = any (public.gl_rule_headings())
   limit 1;
  if v_rule is not null then
    select * into v_hdr from public.gl_accounts a where a.code = v_rule;
    raise exception '% % decides how money may be recorded, not only where an account prints. No account moves into or out of it.', v_hdr.code, v_hdr.name
      using errcode = '22023', detail = 'move_rule_heading';
  end if;
  -- 0580: move_last_child is gone. The last account may leave; its heading
  -- keeps is_heading, so it is still a heading with nothing under it.

  -- 0580: an empty heading's order before the drag is empty, so `to.was`
  -- may be {} but must be sent. `from.was` always holds the account itself.
  if coalesce(array_length(p_from_was, 1), 0) = 0 or p_to_was is null then
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
  if p_to_was is distinct from coalesce(v_order, '{}') then  -- 0580: {} when empty
    raise exception 'The chart changed while you were dragging. Open it again and redo the move.'
      using errcode = '40001', detail = 'order_stale';
  end if;

  update public.gl_accounts set parent_code = p_to_parent where code = p_code;

  select array_agg(a.code order by a.sort_order, a.code) into v_order
    from public.gl_accounts a where a.parent_code is not distinct from v_from;
  if v_order is null then
    -- 0580: the last account left. Nothing is left to put in order, so the
    -- order after must be empty too.
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
$function$
;

-- 13 · gl_report_chart_tree (0579): a heading is the stored flag, or the top.
CREATE OR REPLACE FUNCTION public.gl_report_chart_tree()
 RETURNS TABLE(code text, kind text, parent_code text, depth integer, ancestors text[], order_key text[], is_heading boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
         (a.parent_code is null or a.is_heading)          -- 0580: the stored flag
  from top t
  join public.gl_accounts a on a.code = t.code;
$function$
;

-- 14 · gl_balance_sheet (0579): an empty heading prints no line.
CREATE OR REPLACE FUNCTION public.gl_balance_sheet(p_as_of date, p_department_type text DEFAULT NULL::text, p_department_id uuid DEFAULT NULL::uuid)
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
                 else null end)::text as moved_for,
           a.is_heading as flagged                         -- 0580
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
           t.ancestors, t.order_key, t.is_heading, r.flagged
    from bs_raw r
    join public.gl_report_chart_tree() t on t.code = r.code
  ),
  shown as (
  -- 0580: the rows that print. An account that is not a heading always
  -- prints. A heading prints as its own line only if it carries an amount,
  -- or if it is a top-level account that was never a heading. A heading's
  -- subtotal is built from these rows only, so a heading with nothing
  -- printed under it (one whose last account left) prints no line at all.
    select b.* from bs_accounts b
    where not b.is_heading or b.amt <> 0 or not b.flagged
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
    from shown b                                          -- 0580
    join sect_ord s on s.k = b.kind
    left join public.gl_accounts hn on hn.code = b.hdr

    union all

    -- every heading, at every depth: all the accounts under it, each once
    select s.o, tr.order_key || array['~'],
           b.kind, 'HEADER_SUBTOTAL'::text,
           tr.code, tr.name, null::text, null::text,
           sum(b.amt)::numeric(14,2),
           null::numeric(14,2), null::text,
           tr.depth, tr.parent_code
    from tree tr
    join shown b on b.code = tr.code or tr.code = any(b.ancestors)   -- 0580
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
$function$
;

-- 15 · gl_profit_and_loss (0579): an empty heading prints no line.
CREATE OR REPLACE FUNCTION public.gl_profit_and_loss(p_from date, p_to date, p_department_type text DEFAULT NULL::text, p_department_id uuid DEFAULT NULL::uuid)
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
           t.ancestors, t.order_key, t.is_heading,
           a.is_heading as flagged                         -- 0580
    from public.gl_accounts a
    left join movement m on m.acct = a.code
    join public.gl_report_chart_tree() t on t.code = a.code
    where a.kind in ('INCOME','EXPENSE')
      and (a.is_active or m.acct is not null)   -- retired accounts still show if they moved
  ),
  shown as (
  -- 0580: the rows that print. An account that is not a heading always
  -- prints. A heading prints as its own line only if it carries an amount,
  -- or if it is a top-level account that was never a heading. A heading's
  -- subtotal is built from these rows only, so a heading with nothing
  -- printed under it (one whose last account left) prints no line at all.
    select p.* from pl_accounts p
    where not p.is_heading or p.amt <> 0 or not p.flagged
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
    from shown p                                          -- 0580
    left join public.gl_accounts hn on hn.code = p.hdr

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
    join shown p on p.code = tr.code or tr.code = any(p.ancestors)   -- 0580
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
$function$
;

comment on function public.gl_report_chart_tree() is
  '0579: each account with its depth, the headings above it, and its place in the chart order (sort_order, then code). is_heading: 0580 gl_accounts.is_heading, or sits at the top. Read only by the report functions.';
comment on function public.gl_balance_sheet(date, text, uuid) is
  'Balance sheet as of a date; 0540: optionally one department. A filtered sheet may not balance: contra lines of a mixed document are untagged. 0579: every heading at every depth carries its own subtotal (header_depth, parent_header_code), in chart order. 0580: a heading with nothing printed under it prints no line.';
comment on function public.gl_profit_and_loss(date, date, text, uuid) is
  'Profit and loss for a period; 0540: optionally one department. 0579: every heading at every depth carries its own subtotal (header_depth, parent_header_code), in chart order. 0580: a heading with nothing printed under it prints no line.';

notify pgrst, 'reload schema';
