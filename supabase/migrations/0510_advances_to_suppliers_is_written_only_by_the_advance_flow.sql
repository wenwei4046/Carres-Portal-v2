-- =============================================================================
-- 0510_advances_to_suppliers_is_written_only_by_the_advance_flow.sql
-- =============================================================================
-- WHAT WAS WRONG
--   1230 "Advances to suppliers" (0507) is where the Balance Sheet shows money
--   Carres paid a supplier before its bill. The Advance flow (0484/0485) books
--   that money on the supplier's own payables account (2110, or 2120 for an
--   other creditor), and gl_balance_sheet moves the suppliers below zero onto
--   1230 in the report, "adding the moved money to whatever it holds" (0507).
--   Nothing posts to 1230 itself. But 1230 is an ordinary active ASSET
--   account, not a control, so four doors that let a person pick an account
--   accepted it:
--     - a supplier bill line      (_ap_require_account 'bill_line', 0477;
--                                  offered by ap_account_choices.for_bill_line)
--     - a payment voucher line    (_ap_require_account 'voucher_line', 0477;
--                                  offered by ap_account_choices.for_voucher_line)
--     - a manual journal line     (gl_manual_journal, 0502: refuses control
--                                  accounts only)
--     - an other receipt line     (fin_money_in_account_problem 'receipt_line',
--                                  0478; its picker reads the same function)
--   Money typed onto 1230 by hand would be added to the advances the report
--   works out, and the Balance Sheet would print a figure no supplier
--   balance explains.
--
-- THE RULING (YH, 15 Sep 2026): 1230 is written only by the Advance flow. It
--   is not offered, and it is refused, as a bill line, a voucher line or a
--   manual journal line account. Hiding it in the web picker is not enough.
--   The other receipt line is the same kind of door and is closed with it.
--
-- WHAT THIS CHANGES
--   Four functions are redefined. Each body is its latest definition (named
--   in front of it) with only the 1230 refusal added:
--     1. _ap_require_account (0477): 1230 is refused for 'bill_line' and
--        'voucher_line' (detail account_kept_by_own_documents). 'ap' and
--        'pay_from' already refuse it (it is neither a supplier control nor
--        a bank account).
--     2. ap_account_choices (0477): for_bill_line and for_voucher_line are
--        false for 1230, so the bill and voucher pickers stop offering it.
--     3. gl_manual_journal(date, text, jsonb, uuid) (0502): a line on 1230 is
--        refused (detail gl_manual_journal_control_account, the refusal the
--        API already words for a party account). The web form stops offering
--        it in the same change.
--     4. fin_money_in_account_problem (0478): 1230 answers as a control
--        account does ("is kept by its own documents"), for every use. The
--        other receipt and other debtor invoice pickers read this function,
--        so they stop offering it too.
--   The refusal wording is reused from 0478; there are no new words.
--   The Advance flow is untouched: an advance posts to the supplier's
--   payables account through 'ap' and 'pay_from', never through a line.
--   gl_post, gl_reverse and gl_balance_sheet are not touched.
--   Security definer, search_path and grants are unchanged: `create or
--   replace` keeps the existing EXECUTE grants.
--
-- RLS: none. DATA: none. DR/CR: none.
-- =============================================================================

begin;

-- ── 1 · _ap_require_account — the body is 0477's, with the 1230 refusal added ───
create or replace function public._ap_require_account(p_code text, p_use text, p_what text)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
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
  if exists (select 1 from public.gl_accounts c where c.parent_code = v_acc.code) then
    raise exception '%: % % is a heading. Choose one of the accounts under it.', p_what, v_acc.code, v_acc.name
      using errcode = 'P0001', detail = 'account_is_heading';
  end if;

  -- 0510: 1230 Advances to suppliers is written only by the Advance flow,
  -- which reaches the supplier's payables account through 'ap', never a line.
  if v_acc.code = '1230' and p_use in ('bill_line','voucher_line') then
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
  elsif p_use = 'pay_from' then
    if not public.ap_account_is_money(v_acc.code) then
      raise exception '%: % % is not a cash or bank account.', p_what, v_acc.code, v_acc.name
        using errcode = 'P0001', detail = 'pay_from_not_money';
    end if;
  else
    raise exception 'unknown account use %', p_use
      using errcode = '22023', detail = 'account_use_unknown';
  end if;
end;
$fn$;

-- ── 2 · ap_account_choices — the body is 0477's, with the 1230 refusal added ───
create or replace function public.ap_account_choices()
returns table (
  code             text,
  name             text,
  kind             text,
  parent_code      text,
  is_control       boolean,
  control_for      text,
  for_bill_line    boolean,
  for_voucher_line boolean,
  for_ap           boolean,
  for_pay_from     boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
#variable_conflict use_column
begin
  if not public.gl_may_read() then
    raise exception 'accounts payable is internal'
      using errcode = '42501', detail = 'not_internal';
  end if;
  return query
  select a.code, a.name, a.kind, a.parent_code, a.is_control, a.control_for,
         (not a.is_control and a.code <> '1230' and a.kind in ('EXPENSE','ASSET') and not public.ap_account_is_money(a.code)),
         (not a.is_control and a.code <> '1230' and a.kind in ('EXPENSE','ASSET','LIABILITY')),
         (a.kind = 'LIABILITY' and a.is_control and a.control_for = 'SUPPLIER'),
         public.ap_account_is_money(a.code)
    from public.gl_accounts a
   where a.is_active
     and not exists (select 1 from public.gl_accounts c where c.parent_code = a.code)
   order by a.code;
end;
$fn$;

-- ── 3 · gl_manual_journal — the body is 0502's, with the 1230 refusal added ───
create or replace function public.gl_manual_journal(
  p_entry_date  date,
  p_narration   text,
  p_lines       jsonb,
  p_request_key uuid
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role    app_role;
  v_uid     uuid;
  v_elem    jsonb;
  v_idx     int := 0;
  v_code    text;
  v_control boolean;
  v_doc_no  text;
  v_id      uuid;
  v_seen    public.gl_manual_journal_requests%rowtype;
  v_seen_no text;
begin
  v_role := public.app_role();
  if not coalesce(public.is_principal(), false) then
    raise exception 'gl_manual_journal refused: role % may not raise a manual journal — principal only', coalesce(v_role::text,'none')
      using errcode = '42501', detail = 'gl_manual_journal_forbidden';
  end if;
  v_uid := auth.uid();

  -- A resend carries the same key. The lock queues it behind the first call,
  -- and it then finds what the first call recorded.
  if p_request_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('gl_manual_journal:' || p_request_key::text, 0));
    select r.* into v_seen from public.gl_manual_journal_requests r
     where r.request_key = p_request_key;
    if found then
      -- The same key must carry the same entry. A key sent again with another
      -- date, narration or lines is not a resend: say so, and never hand back
      -- an entry that is not what the person typed.
      if v_seen.entry_date is distinct from p_entry_date
         or v_seen.narration is distinct from btrim(coalesce(p_narration, ''))
         or v_seen.lines is distinct from p_lines
         or v_seen.created_by is distinct from v_uid then
        select e.entry_no into v_seen_no from public.gl_entries e where e.id = v_seen.entry_id;
        raise exception 'gl_manual_journal refused: this request was already recorded as % with different details', coalesce(v_seen_no, v_seen.entry_id::text)
          using errcode = 'P0001', detail = 'idempotency_mismatch';
      end if;
      return v_seen.entry_id;
    end if;
  end if;

  if p_entry_date is null then
    raise exception 'gl_manual_journal refused: entry_date is required — a blank date is never replaced with today'
      using errcode = '22023', detail = 'gl_manual_journal_entry_date_null';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'gl_manual_journal refused: p_lines must be a JSON array, got %', coalesce(jsonb_typeof(p_lines),'null')
      using errcode = '22023', detail = 'gl_manual_journal_lines_not_array';
  end if;
  if nullif(btrim(coalesce(p_narration,'')), '') is null then
    raise exception 'gl_manual_journal refused: a narration is required — a manual journal with no explanation is unauditable'
      using errcode = '22023', detail = 'gl_manual_journal_narration_blank';
  end if;

  -- Control accounts belong to their subsidiary documents, not to a keyboard.
  for v_elem in select value from jsonb_array_elements(p_lines) loop
    v_idx := v_idx + 1;
    if jsonb_typeof(v_elem) <> 'object' then
      raise exception 'gl_manual_journal refused: line % is a %, expected an object', v_idx, jsonb_typeof(v_elem)
        using errcode = '22023', detail = 'gl_manual_journal_line_not_object';
    end if;
    v_code := btrim(coalesce(v_elem->>'account_code',''));
    select a.is_control into v_control from public.gl_accounts a where a.code = v_code;
    if found and v_control then
      raise exception 'gl_manual_journal refused: line % names control account % — AR and AP move only through their own documents', v_idx, v_code
        using errcode = '22023', detail = 'gl_manual_journal_control_account';
    end if;
    -- 0510: 1230 Advances to suppliers is written only by the Advance flow.
    if v_code = '1230' then
      raise exception 'gl_manual_journal refused: line % names account 1230 Advances to suppliers, which is kept by its own documents', v_idx
        using errcode = '22023', detail = 'gl_manual_journal_control_account';
    end if;
  end loop;

  v_doc_no := public.gl_next_doc_no('MJ', p_entry_date);

  v_id := public.gl_post('MANUAL', v_doc_no, p_entry_date, p_narration, p_lines);

  insert into audit_log (role, actor_text, action, ref)
  values (v_role,
          (select name from app_users where id = v_uid),
          format('Manual journal posted · %s · %s', v_doc_no, btrim(p_narration)),
          v_doc_no);

  if p_request_key is not null then
    insert into public.gl_manual_journal_requests
      (request_key, entry_id, entry_date, narration, lines, created_by)
    values
      (p_request_key, v_id, p_entry_date, btrim(p_narration), p_lines, v_uid);
  end if;

  return v_id;
end;
$fn$;

-- ── 4 · fin_money_in_account_problem — the body is 0478's, with the 1230 refusal added ───
create or replace function public.fin_money_in_account_problem(p_code text, p_use text)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
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
  if v.is_control or v.code = '1230' then
    return format('Account %s %s is kept by its own documents and cannot be picked here.', v.code, v.name);
  end if;

  if p_use = 'money' then
    if v.parent_code is distinct from '1100' or v.kind <> 'ASSET' then
      return format('Account %s %s is not a bank or cash account.', v.code, v.name);
    end if;
    return null;
  end if;

  if v.parent_code = '1100' then
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
  if v.parent_code = '2200' then
    return format('Account %s %s is customer money. Customer money is recorded in Payments.', v.code, v.name);
  end if;
  -- Stock value moves with the goods, and Stock owns it. Retained earnings
  -- and opening balance equity are written only by the year-end close and the
  -- opening balances. Money never arrives as any of them.
  if v.parent_code = '1300' or v.code in ('3200', '3300') then
    return format('Account %s %s cannot be the reason money came in.', v.code, v.name);
  end if;
  return null;
end;
$fn$;

do $sanity$
declare
  v_detail text;
  v_use    text;
begin
  if not exists (select 1 from public.gl_accounts where code = '1230' and is_active and not is_control) then
    raise exception '0510 sanity: 1230 Advances to suppliers is missing (0507 first)';
  end if;

  foreach v_use in array array['bill_line','voucher_line'] loop
    v_detail := null;
    begin
      perform public._ap_require_account('1230', v_use, 'probe');
    exception when others then
      get stacked diagnostics v_detail = pg_exception_detail;
    end;
    if v_detail is distinct from 'account_kept_by_own_documents' then
      raise exception '0510 sanity: _ap_require_account does not refuse 1230 as a % (got %)', v_use, coalesce(v_detail, 'no refusal');
    end if;
  end loop;

  -- The Advance flow's own accounts still pass.
  perform public._ap_require_account('2110', 'ap', 'probe');
  perform public._ap_require_account('2120', 'ap', 'probe');

  if public.fin_money_in_account_problem('1230', 'receipt_line') is null then
    raise exception '0510 sanity: an other receipt line still accepts 1230';
  end if;
  if public.fin_money_in_account_problem('4100', 'receipt_line') is null then
    raise exception '0510 sanity: fin_money_in_account_problem refuses 4100 on a receipt line';
  end if;

  if position('a.code <> ''1230''' in (select prosrc from pg_proc where oid = 'public.ap_account_choices()'::regprocedure)) = 0 then
    raise exception '0510 sanity: ap_account_choices still offers 1230';
  end if;
  if position('v_code = ''1230''' in (select prosrc from pg_proc where oid = 'public.gl_manual_journal(date,text,jsonb,uuid)'::regprocedure)) = 0 then
    raise exception '0510 sanity: gl_manual_journal does not refuse 1230';
  end if;

  if has_function_privilege('anon', 'public.ap_account_choices()', 'execute')
     or has_function_privilege('anon', 'public.gl_manual_journal(date,text,jsonb,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._ap_require_account(text,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.fin_money_in_account_problem(text,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.ap_account_choices()', 'execute')
     or not has_function_privilege('authenticated', 'public.gl_manual_journal(date,text,jsonb,uuid)', 'execute') then
    raise exception '0510 sanity: a grant changed';
  end if;
end
$sanity$;

commit;
