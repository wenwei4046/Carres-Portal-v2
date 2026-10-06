-- =============================================================================
-- 0536_a_voucher_line_says_what_it_is_for.sql
-- =============================================================================
-- WHAT WAS WRONG
--   A direct line on a payment voucher (a bank charge, an expense with no bill)
--   saved with an empty description (0484 wrote nullif(description, '')), so
--   the printed voucher and the ledger could not say what the money paid for.
--   A typed supplier-bill line already refuses this (0477, line_needs_description).
--
-- WHAT THIS CHANGES
--   payment_voucher_save_draft refuses a line with no description
--   (P0001, detail line_needs_description). The body is the latest one,
--   0484_a_supplier_can_be_paid_before_its_bill.sql, changed only where marked
--   0536. Same signature, so create or replace keeps 0484's grants; they are
--   restated anyway.
--   Voucher lines already saved without a description stay as they are.
--
-- RLS: unchanged. DATA: none. DR/CR: none.
-- =============================================================================

begin;

-- Body from 0484. Changed only where marked 0536.
create or replace function public.payment_voucher_save_draft(
  p_voucher_id            uuid,
  p_purpose               text,
  p_supplier_id           uuid,
  p_payee_name            text,
  p_voucher_date          date,
  p_pay_from_account_code text,
  p_lines                 jsonb   default '[]'::jsonb,
  p_allocations           jsonb   default '[]'::jsonb,
  p_pay_method            text    default 'BANK_TRANSFER',
  p_pay_reference         text    default null,
  p_narration             text    default null,
  p_advance_amount        numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     text := public.app_role()::text;
  v_me       uuid := (select u.id from public.app_users u where u.id = auth.uid());
  v_v        public.payment_vouchers%rowtype;
  v_supplier public.suppliers%rowtype;
  v_purpose  text := upper(btrim(coalesce(p_purpose, '')));
  v_method   text := upper(btrim(coalesce(p_pay_method, 'BANK_TRANSFER')));
  v_lines    jsonb := coalesce(p_lines, '[]'::jsonb);
  v_allocs   jsonb := coalesce(p_allocations, '[]'::jsonb);
  v_advance  numeric(12,2) := coalesce(p_advance_amount, 0);
  v_ap       text;
  v_payee    text;
  v_pay_from text := btrim(coalesce(p_pay_from_account_code, ''));
  v_line     jsonb;
  v_n        integer := 0;
  v_amount   numeric(12,2);
  v_account  text;
  v_bill_id  uuid;
  v_seen     uuid[] := '{}';
  v_total    numeric(12,2) := 0;
  v_id       uuid;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'only finance writes a payment voucher'
      using errcode = '42501', detail = 'not_finance';
  end if;

  if p_voucher_id is not null then
    select * into v_v from public.payment_vouchers where id = p_voucher_id for update;
    if not found then
      raise exception 'That payment voucher does not exist.'
        using errcode = 'P0002', detail = 'voucher_missing';
    end if;
    if v_v.status <> 'draft' then
      raise exception 'Only a draft payment voucher can be changed.'
        using errcode = 'P0001', detail = 'voucher_not_draft';
    end if;
  end if;

  if v_purpose not in ('SUPPLIER_BILLS','DIRECT') then
    raise exception 'Choose what this voucher is for: paying supplier bills, or a direct payment.'
      using errcode = 'P0001', detail = 'purpose_invalid';
  end if;
  if jsonb_typeof(v_lines) <> 'array' or jsonb_typeof(v_allocs) <> 'array' then
    raise exception 'The lines of this voucher are not readable.'
      using errcode = 'P0001', detail = 'lines_invalid';
  end if;

  if p_supplier_id is not null then
    select * into v_supplier from public.suppliers where id = p_supplier_id;
    if not found then
      raise exception 'That supplier does not exist.'
        using errcode = 'P0001', detail = 'supplier_missing';
    end if;
  end if;
  if v_purpose = 'SUPPLIER_BILLS' and p_supplier_id is null then
    raise exception 'Choose the supplier whose bills this voucher pays.'
      using errcode = 'P0001', detail = 'supplier_required';
  end if;

  -- The header, in the order the form asks for it: who, when, from where, how.
  -- Checked before what the voucher pays, so the first refusal names the
  -- first wrong field on the screen.
  v_payee := coalesce(nullif(btrim(coalesce(p_payee_name, '')), ''), v_supplier.name);
  if v_payee is null then
    raise exception 'Type who is being paid.'
      using errcode = 'P0001', detail = 'payee_missing';
  end if;
  if p_voucher_date is null then
    raise exception 'Type the payment date.'
      using errcode = 'P0001', detail = 'date_missing';
  end if;
  perform public.ap_refuse_before_go_live(p_voucher_date, 'This payment voucher');
  perform public._ap_require_account(v_pay_from, 'pay_from', 'Pay from');
  if v_method not in ('BANK_TRANSFER','CHEQUE','CASH','OTHER') then
    raise exception 'Choose how the money is paid.'
      using errcode = 'P0001', detail = 'pay_method_invalid';
  end if;

  -- The advance: money for this supplier before its bill (0484).
  if p_advance_amount is not null and round(p_advance_amount, 2) <> p_advance_amount then
    raise exception 'Type the advance in ringgit and sen, like 1250.00.'
      using errcode = 'P0001', detail = 'advance_invalid';
  end if;
  if v_advance < 0 then
    raise exception 'The advance cannot be less than RM 0.00.'
      using errcode = 'P0001', detail = 'advance_invalid';
  end if;
  if v_advance > 0 and v_purpose <> 'SUPPLIER_BILLS' then
    raise exception 'A direct payment does not carry an advance. Choose "Pay supplier bills" to pay a supplier before its bill.'
      using errcode = 'P0001', detail = 'direct_pays_no_advance';
  end if;
  if v_advance > 0 then
    -- The same payables account a bill from this supplier defaults to, so the
    -- advance can be knocked off that bill later.
    v_ap := case when v_supplier.kind::text = 'other_creditor' then '2120' else '2110' end;
    perform public._ap_require_account(v_ap, 'ap', 'Advance');
  end if;

  -- What it pays.
  if v_purpose = 'SUPPLIER_BILLS' then
    if jsonb_array_length(v_allocs) = 0 and v_advance = 0 then
      raise exception 'Choose at least one bill to pay, or type an advance.'
        using errcode = 'P0001', detail = 'no_bills';
    end if;
  else
    if jsonb_array_length(v_allocs) > 0 then
      raise exception 'A direct payment does not pay bills. Choose "Pay supplier bills" to pay a bill.'
        using errcode = 'P0001', detail = 'direct_pays_no_bill';
    end if;
    if jsonb_array_length(v_lines) = 0 then
      raise exception 'Add at least one line: what is this money paying for?'
        using errcode = 'P0001', detail = 'no_lines';
    end if;
  end if;
  if jsonb_array_length(v_lines) > 100 or jsonb_array_length(v_allocs) > 200 then
    raise exception 'This voucher has too many lines.'
      using errcode = 'P0001', detail = 'too_many_lines';
  end if;

  -- Read and check every line before anything is written.
  for v_line in select value from jsonb_array_elements(v_lines) loop
    v_n := v_n + 1;
    begin
      v_amount := round(nullif(btrim(coalesce(v_line ->> 'amount', '')), '')::numeric, 2);
    exception when invalid_text_representation then
      raise exception 'Line %: the amount is not a number.', v_n
        using errcode = 'P0001', detail = 'line_invalid';
    end;
    if v_amount is null or v_amount <= 0 then
      raise exception 'Line %: the amount must be more than RM 0.00.', v_n
        using errcode = 'P0001', detail = 'line_amount_invalid';
    end if;
    -- 0536: a line says what it is for.
    if nullif(btrim(coalesce(v_line ->> 'description', '')), '') is null then
      raise exception 'Line %: say what this payment is for.', v_n
        using errcode = 'P0001', detail = 'line_needs_description';
    end if;
    v_account := btrim(coalesce(v_line ->> 'account_code', ''));
    perform public._ap_require_account(v_account, 'voucher_line', format('Line %s', v_n));
    if v_account = v_pay_from then
      raise exception 'Line %: the money cannot be paid from and to the same account.', v_n
        using errcode = 'P0001', detail = 'line_is_pay_from';
    end if;
    v_total := v_total + v_amount;
  end loop;

  v_n := 0;
  for v_line in select value from jsonb_array_elements(v_allocs) loop
    v_n := v_n + 1;
    begin
      v_bill_id := nullif(btrim(coalesce(v_line ->> 'bill_id', '')), '')::uuid;
      v_amount  := round(nullif(btrim(coalesce(v_line ->> 'amount', v_line ->> 'amount_applied', '')), '')::numeric, 2);
    exception when invalid_text_representation then
      raise exception 'Bill %: the amount or the bill is not readable.', v_n
        using errcode = 'P0001', detail = 'allocation_invalid';
    end;
    if v_bill_id is null then
      raise exception 'Bill %: choose the bill.', v_n
        using errcode = 'P0001', detail = 'allocation_invalid';
    end if;
    if v_amount is null or v_amount <= 0 then
      raise exception 'Bill %: the amount to pay must be more than RM 0.00.', v_n
        using errcode = 'P0001', detail = 'allocation_amount_invalid';
    end if;
    if v_bill_id = any (v_seen) then
      raise exception 'The same bill is on this voucher twice.'
        using errcode = 'P0001', detail = 'bill_twice';
    end if;
    v_seen := v_seen || v_bill_id;
    v_total := v_total + v_amount;
  end loop;

  v_total := v_total + v_advance;

  if v_total <= 0 then
    raise exception 'A voucher of RM 0.00 pays nothing.'
      using errcode = 'P0001', detail = 'zero_total';
  end if;

  if p_voucher_id is null then
    insert into public.payment_vouchers
      (purpose, supplier_id, payee_name, voucher_date, amount, advance_amount, ap_account_code,
       pay_method, pay_reference, pay_from_account_code, narration, status, created_by)
    values
      (v_purpose, p_supplier_id, v_payee, p_voucher_date, v_total, v_advance, v_ap,
       v_method, nullif(btrim(coalesce(p_pay_reference, '')), ''), v_pay_from,
       nullif(btrim(coalesce(p_narration, '')), ''), 'draft', v_me)
    returning id into v_id;
  else
    v_id := p_voucher_id;
    update public.payment_vouchers
       set purpose               = v_purpose,
           supplier_id           = p_supplier_id,
           payee_name            = v_payee,
           voucher_date          = p_voucher_date,
           amount                = v_total,
           advance_amount        = v_advance,
           ap_account_code       = v_ap,
           pay_method            = v_method,
           pay_reference         = nullif(btrim(coalesce(p_pay_reference, '')), ''),
           pay_from_account_code = v_pay_from,
           narration             = nullif(btrim(coalesce(p_narration, '')), '')
     where id = v_id;
    -- A draft's lines and bills are replaced whole — allowed only while draft
    -- (the two only-while-draft triggers). A draft has posted nothing.
    delete from public.payment_voucher_lines       where voucher_id = v_id;
    delete from public.payment_voucher_allocations where voucher_id = v_id;
  end if;

  v_n := 0;
  for v_line in select value from jsonb_array_elements(v_lines) loop
    v_n := v_n + 1;
    insert into public.payment_voucher_lines (voucher_id, line_no, account_code, description, amount)
    values (v_id, v_n, btrim(v_line ->> 'account_code'),
            nullif(btrim(coalesce(v_line ->> 'description', '')), ''),
            round((v_line ->> 'amount')::numeric, 2));
  end loop;

  -- The ceilings (bill confirmed, same supplier, not over-paid) are the
  -- allocation trigger's job — it locks the bill while it measures.
  for v_line in select value from jsonb_array_elements(v_allocs) loop
    insert into public.payment_voucher_allocations (voucher_id, bill_id, amount_applied, created_by)
    values (v_id, (v_line ->> 'bill_id')::uuid,
            round(nullif(btrim(coalesce(v_line ->> 'amount', v_line ->> 'amount_applied', '')), '')::numeric, 2),
            v_me);
  end loop;

  perform public._ap_event('PAYMENT_VOUCHER', v_id,
                           case when p_voucher_id is null then 'created' else 'edited' end, null);
  return v_id;
end;
$fn$;

revoke all on function public.payment_voucher_save_draft(uuid, text, uuid, text, date, text, jsonb, jsonb, text, text, text, numeric) from public, anon;
grant execute on function public.payment_voucher_save_draft(uuid, text, uuid, text, date, text, jsonb, jsonb, text, text, text, numeric) to authenticated;

commit;
