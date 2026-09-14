-- =============================================================================
-- 0478_money_in_that_is_not_a_sale_has_its_own_documents.sql
-- FINANCE · THE LEDGER — OTHER DEBTORS AND OTHER RECEIPTS
-- (ledger rulings J/K/L/M/N; CLAUDE.md §7; docs/payment/MASTER.md §1 —
--  Payment is CUSTOMER money only, so these documents belong to Finance.)
--
-- WHAT WAS WRONG, MEASURED
--
--   Carres finance keeps six kinds of money: customers (AR), other debtors,
--   suppliers (AP), other creditors, money received with no invoice (a loan,
--   a director putting money in), and money paid out with no bill. The ledger
--   built in 0461–0469 can hold only the first and the third.
--
--   · The ledger knows two kinds of party and no third: `control_for` and
--     `gl_entry_lines.party_type` allow CUSTOMER or SUPPLIER only
--     (0461:94-95, 0462:101) and gl_post refuses anything else (0468:230).
--     There is no table for a sister company, a lender, a landlord or a
--     person. `customers` cannot stand in: it is keyed by a phone number
--     (0467), and a sister company billed for its share of the office rent is
--     not a customer and has no Sales Order.
--   · The chart has no account for any of it: no other-debtors control, no
--     loan received, no loan given, no director's account, no other income.
--   · A second CUSTOMER asset control is not an option: gl_ar_control_account
--     (0463:196-223) would call receivables "ambiguous" and every customer
--     payment in the company would stop posting.
--
-- WHAT THIS FILE BUILDS
--
--   ① A THIRD KIND OF PARTY. `finance_parties` — a company or a person that
--      is neither a customer nor a supplier. The ledger's party type for it is
--      `OTHER`. gl_post is re-created from 0468 with exactly one change: it
--      accepts OTHER as well as CUSTOMER and SUPPLIER. The rest of the body
--      is 0468's text unchanged; the sanity block checks every 0468 validity
--      marker is still there, that no role gate came back, and probes that
--      CUSTOMER and SUPPLIER lines still post and still refuse the wrong side.
--
--   ② FIVE ACCOUNTS AND ONE HEADER.
--        1240 Other debtors                  ASSET      control, party OTHER
--        1250 Loans and advances given       ASSET
--        2350 Loans and director's account   LIABILITY  header
--        2360 Loans received                 LIABILITY
--        2370 Director's account             LIABILITY
--        4900 Other income                   INCOME
--      2300 and 3200 were already taken (Taxes and Retained earnings, 0461),
--      so the loan and director accounts sit under their own header in the
--      2300s. The director's account is a LIABILITY, not equity: money a
--      director puts in without shares being issued is owed back to him on
--      demand. Booked as equity it would make the company look richer than it
--      is and hide a debt it can be asked to repay tomorrow. Share capital
--      (3100) is where money goes once shares are actually issued for it.
--
--   ③ THE OTHER DEBTOR INVOICE (`ARI-YYYYMMDD-RRRR`). Finance bills a party
--      for something that is not furniture: a sister company's share of the
--      office rent, a recharge. draft → issued → cancelled.
--        ISSUE    Dr 1240 Other debtors (party OTHER)   the invoice total
--                 Cr each line's own account              e.g. 4900, or 6200
--                                                         for a rent recharge
--                 Dated the invoice date. Refused before the go-live date.
--        CANCEL   a draft simply stops. An issued invoice is reversed with
--                 gl_reverse, by the finance approver, and only after every
--                 receipt against it has been cancelled first.
--
--   ④ THE OTHER RECEIPT (`RV-YYYYMMDD-RRRR`, a receipt voucher). Money that
--      landed in a Carres bank or cash account and is NOT customer order money.
--      It is recorded and posted in one act — there is nothing to approve
--      about money that has already arrived — and it is the only door for:
--        · a loan in (Cr 2360), a director putting money in (Cr 2370),
--          other income with no invoice (Cr 4900), a loan being repaid to us
--          (Cr 1250), and
--        · money against issued other debtor invoices (Cr 1240, party OTHER),
--          part or in full.
--        RECORD   Dr the money account (a leaf under 1100)   the receipt total
--                 Cr each line's account                     (party stamped when
--                                                             the receipt names one)
--                 Cr 1240 per invoice received against        (party OTHER)
--        CANCEL   gl_reverse, by the finance approver. The invoice's
--                 outstanding opens again, because a cancelled receipt's
--                 allocations stop counting.
--
--   Outstanding per invoice = issued total − what live receipts allocated to
--   it. Nothing is cached; it is recomputed every time it is read.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--
--   · It does not touch order_payments, customer invoices or the Payment
--     module. Neither an invoice line nor a receipt line may credit a
--     customer revenue account (any account in gl_income_account_map), and a
--     receipt line may not credit anything under 2200 Customer money held:
--     customer revenue is recognised on the customer's invoice, customer
--     money is recorded in Payments, and a second door for either would make
--     two records of one act (ERP-ARCHITECTURE law C). A receipt line also
--     refuses stock (1300, Stock owns it), retained earnings (3200) and
--     opening balance equity (3300): money never arrives as any of them.
--   · It does not pay anyone. Giving a loan, repaying one and other money out
--     are payment documents, not this file.
--   · It does not change gl_party_statement, which still accepts only
--     CUSTOMER and SUPPLIER (0465:764, re-created unchanged in that respect by
--     0469). Re-creating it here would overwrite 0469's reversal fix with
--     whichever body this file copied. The per-invoice and per-party
--     outstanding below read these documents directly.
--   · It posts nothing for any date before gl_config.go_live_on.
--
-- WHO MAY ACT (law of 0468 — the document decides who, the ledger decides what)
--   parties, invoices (create / edit draft / issue), receipts   finance, principal
--   cancel an issued invoice, cancel a receipt                  finance approver
--                                                               (has_finance_approver)
--
-- RLS: every new table is read-only to finance and principal (gl_may_read)
-- and has NO write policy for anyone. Writes go through the security definer
-- functions below, each of which checks its caller itself. gl_accounts and
-- gl_entry_lines keep their policies; only one CHECK constraint on each widens.
--
-- NO `DELETE` IS EXECUTED BY THIS FILE. Draft invoice lines are replaced by
-- the draft-edit function at the time a person edits a draft; ledger rows are
-- never deleted by anything.
-- =============================================================================


-- ── 1 · a third kind of party ────────────────────────────────────────────────
create table public.finance_parties (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(btrim(name)) between 1 and 200),
  kind             text not null check (kind in ('company','person')),
  -- A company's registration number. Optional: a person lending the company
  -- money has none, and a government ID number is not collected here.
  registration_no  text check (registration_no is null or length(btrim(registration_no)) between 1 and 60),
  phone            text check (phone is null or length(btrim(phone)) between 1 and 40),
  email            text check (email is null or length(btrim(email)) between 3 and 200),
  address          text check (address is null or length(address) <= 500),
  notes            text check (notes is null or length(notes) <= 1000),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  created_by       uuid references public.app_users(id),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.app_users(id)
);

-- The same party entered twice is how one sister company ends up with two
-- statements that each look paid. Two people may share a name, so the
-- registration number breaks the tie when there is one.
create unique index finance_parties_one_identity
  on public.finance_parties (lower(btrim(name)), lower(btrim(coalesce(registration_no, ''))));

comment on table public.finance_parties is
  'A company or person that is neither a Carres customer nor a supplier: a sister company sharing the office, a lender, a landlord, an individual (0478). Ledger party_type OTHER.';

-- ── 2 · the ledger learns the third party type ───────────────────────────────
alter table public.gl_accounts drop constraint gl_accounts_control_for_valid;
alter table public.gl_accounts
  add constraint gl_accounts_control_for_valid
  check (control_for is null or control_for in ('CUSTOMER','SUPPLIER','OTHER'));

alter table public.gl_entry_lines drop constraint gl_entry_lines_party_type_check;
alter table public.gl_entry_lines
  add constraint gl_entry_lines_party_type_check
  check (party_type in ('CUSTOMER','SUPPLIER','OTHER'));

comment on column public.gl_accounts.control_for is
  'Which party type this control account is a subsidiary ledger for: CUSTOMER, SUPPLIER or OTHER (a finance_parties row, 0478). Null exactly when is_control is false.';

-- gl_post — copied in full from 0468 (its latest definition). The ONLY change
-- is the party-type list in step 4, marked `0478` below.
create or replace function public.gl_post(
  p_source_type   text,
  p_source_doc_no text,
  p_entry_date    date,
  p_narration     text,
  p_lines         jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
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

    select a.is_active, a.is_control, a.control_for into v_active, v_control, v_control_for
      from public.gl_accounts a where a.code = v_code;
    if not found then
      raise exception 'gl_post refused: line % names account %, which is not in the chart', v_idx, v_code
        using errcode = '23503', detail = 'gl_post_account_unknown';
    end if;
    if not v_active then
      raise exception 'gl_post refused: line % names account %, which is retired', v_idx, v_code
        using errcode = '22023', detail = 'gl_post_account_inactive';
    end if;
    -- A HEADER is derived, never declared: any account that ANY row names as
    -- its parent_code, active or retired. Retiring the last child must not
    -- silently turn a header into a postable leaf, so `is_active` is not part
    -- of this test.
    if exists (select 1 from public.gl_accounts c where c.parent_code = v_code) then
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

    v_sum_debit  := v_sum_debit + v_debit;
    v_sum_credit := v_sum_credit + v_credit;

    v_norm := v_norm || jsonb_build_object(
      'line_no',      v_idx,
      'account_code', v_code,
      'debit',        v_debit,
      'credit',       v_credit,
      'party_type',   v_party_type,
      'party_id',     v_party_id,
      'memo',         nullif(btrim(coalesce(v_elem->>'memo','')), '')
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
    (entry_id, line_no, account_code, debit, credit, party_type, party_id, memo)
  select v_entry_id,
         (l->>'line_no')::int,
         l->>'account_code',
         (l->>'debit')::numeric,
         (l->>'credit')::numeric,
         l->>'party_type',
         (l->>'party_id')::uuid,
         l->>'memo'
    from jsonb_array_elements(v_norm) l;

  return v_entry_id;
end;
$fn$;

revoke all on function public.gl_post(text,text,date,text,jsonb) from public, anon, authenticated;

comment on function public.gl_post(text,text,date,text,jsonb) is
  'The ONE ledger writer. Idempotent per (source_type, source_doc_no). Refuses; never repairs. A null entry_date raises and is never replaced with today. No role check since 0468: the calling document decides who; this decides what. Party types CUSTOMER, SUPPLIER and OTHER (0478). Not callable over the API.';


-- ── 3 · the chart ────────────────────────────────────────────────────────────
-- 1240 is the other-debtors subsidiary ledger: control, party OTHER. It is an
-- ASSET control like 1210, but for OTHER, so gl_ar_control_account (which
-- asks for CUSTOMER) still finds exactly one account — the sanity block checks.
-- 1250 and the loan/director accounts are not controls: the task of naming the
-- lender belongs to the receipt, which stamps its party on every line it
-- posts, so a per-lender balance can still be read back from the ledger.
insert into public.gl_accounts (code, name, kind, parent_code, is_control, is_active, control_for) values
  ('1240', 'Other debtors',                 'ASSET',     '1200', true,  true, 'OTHER'),
  ('1250', 'Loans and advances given',      'ASSET',     '1200', false, true, null),
  ('2350', 'Loans and director''s account', 'LIABILITY', '2000', false, true, null),
  ('2360', 'Loans received',                'LIABILITY', '2350', false, true, null),
  ('2370', 'Director''s account',           'LIABILITY', '2350', false, true, null),
  ('4900', 'Other income',                  'INCOME',    '4000', false, true, null);


-- ── 4 · two prefixes, claimed once ───────────────────────────────────────────
-- Checked against every prefix in this repository on 2026-09-10: gl_doc_series
-- holds JE SB PV MJ; allocate_formal_document_code is called with GRN MPR PO
-- PV RO SB TR; hand-built numbers use SO DL DO INV CN IS QTY RA RC REQ RU SC.
-- Neither ARI nor RV is among them. `RC-` is the CUSTOMER receipt (0351), which
-- is exactly why this one is not RC. The primary key refuses a second claim.
insert into public.gl_doc_series (prefix, description) values
  ('ARI', 'Other debtor invoice — Finance bills a party that is not a customer (0478)'),
  ('RV',  'Receipt voucher — money in that is not customer order money (0478)');


-- ── 5 · small shared helpers ─────────────────────────────────────────────────
create or replace function public.fin_rm(p_amount numeric)
returns text
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select 'RM ' || to_char(coalesce(p_amount, 0), 'FM999,999,999,990.00')
$fn$;

-- The one active OTHER asset control. Two of them, or none, is a chart error.
create or replace function public.fin_other_debtor_control_account()
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_codes text[];
begin
  select array_agg(a.code order by a.code) into v_codes
    from public.gl_accounts a
   where a.is_control and a.is_active
     and a.control_for = 'OTHER' and a.kind = 'ASSET';
  if v_codes is null or array_length(v_codes, 1) = 0 then
    raise exception 'The chart has no active other debtors account.'
      using errcode = '22023', detail = 'other_debtor_control_missing';
  end if;
  if array_length(v_codes, 1) > 1 then
    raise exception 'The chart has % active other debtors accounts (%). Other debtors is ambiguous.',
      array_length(v_codes, 1), array_to_string(v_codes, ', ')
      using errcode = '22023', detail = 'other_debtor_control_ambiguous';
  end if;
  return v_codes[1];
end;
$fn$;

-- ap_refuse_before_go_live (0464) says the same thing, but with SQLSTATEs the
-- API maps to 500. A date before go-live is the operator's input, not an
-- outage, so this one raises 22023 (→ 422) and says the date out loud.
create or replace function public.fin_refuse_before_go_live(p_date date, p_what text)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_go_live date;
begin
  if p_date is null then
    raise exception '% has no date.', p_what
      using errcode = '22023', detail = 'date_missing';
  end if;
  select go_live_on into v_go_live from public.gl_config where id;
  if v_go_live is null then
    raise exception 'The ledger has no start date, so it cannot accept %.', lower(p_what)
      using errcode = '22023', detail = 'no_go_live';
  end if;
  if p_date < v_go_live then
    raise exception '% is dated %, before the ledger start date of %. Nothing earlier than that date can be posted.',
      p_what, to_char(p_date, 'Dy, DD Mon YY'), to_char(v_go_live, 'Dy, DD Mon YY')
      using errcode = '22023', detail = 'before_go_live';
  end if;
end;
$fn$;

-- One money amount out of a JSON element: a number, or a numeric string; more
-- than zero; at most two decimals. Rounding a figure a person typed would
-- post an amount nobody typed, so a third decimal is refused, not rounded.
create or replace function public.fin_json_amount(p_elem jsonb, p_key text, p_where text)
returns numeric
language plpgsql
immutable
set search_path = public, pg_temp
as $fn$
declare
  v numeric;
begin
  if p_elem is null or jsonb_typeof(p_elem -> p_key) not in ('number','string') then
    raise exception '%: the amount is missing.', p_where
      using errcode = '22023', detail = 'amount_missing';
  end if;
  begin
    v := (p_elem ->> p_key)::numeric;
  exception when invalid_text_representation then
    raise exception '%: % is not an amount.', p_where, p_elem ->> p_key
      using errcode = '22023', detail = 'amount_not_number';
  end;
  if v <= 0 then
    raise exception '%: the amount must be more than RM 0.00.', p_where
      using errcode = '22023', detail = 'amount_not_positive';
  end if;
  if v <> round(v, 2) then
    raise exception '%: % has more than two decimals.', p_where, p_elem ->> p_key
      using errcode = '22023', detail = 'amount_too_precise';
  end if;
  if v > 9999999999.99 then
    raise exception '%: % is larger than the ledger can hold.', p_where, p_elem ->> p_key
      using errcode = '22023', detail = 'amount_too_large';
  end if;
  return v;
end;
$fn$;

-- WHICH ACCOUNT MAY BE PICKED FOR WHAT. One function answers the form's option
-- list AND the documents' refusal, so the two can never disagree (law D).
-- Returns null when the account may be used, otherwise the sentence to show.
--   money         the account the money landed in: an active leaf under 1100
--   receipt_line  what a receipt credits: any active non-control leaf except
--                 a bank/cash account, a customer revenue account or
--                 anything under 2200 Customer money held
--   invoice_line  what an invoice credits: an active non-control income or
--                 expense leaf (income, or a recovered cost such as rent)
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
  if v.is_control then
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


-- ── 6 · the other debtor invoice ─────────────────────────────────────────────
create table public.other_debtor_invoices (
  id                  uuid primary key default gen_random_uuid(),
  -- Ours, minted at ISSUE: an abandoned draft must not burn a number.
  invoice_no          text unique,
  party_id            uuid not null references public.finance_parties(id),
  invoice_date        date not null,
  due_date            date,
  -- The party's own reference (their PO, the month being recharged).
  reference           text check (reference is null or length(reference) <= 120),
  narration           text check (narration is null or length(narration) <= 500),
  total_amount        numeric(12,2) not null default 0 check (total_amount >= 0),
  -- Which OTHER control the invoice was posted to. Fixed at issue, so a
  -- receipt credits the same account the invoice debited.
  debtor_account_code text references public.gl_accounts(code),
  status              text not null default 'draft'
                        check (status in ('draft','issued','cancelled')),
  gl_entry_id         uuid references public.gl_entries(id),
  reversal_entry_id   uuid references public.gl_entries(id),
  issued_at           timestamptz,
  issued_by           uuid references public.app_users(id),
  cancelled_at        timestamptz,
  cancelled_by        uuid references public.app_users(id),
  cancel_reason       text,
  created_at          timestamptz not null default now(),
  created_by          uuid references public.app_users(id),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references public.app_users(id),
  constraint other_debtor_invoices_due_after_date
    check (due_date is null or due_date >= invoice_date),
  constraint other_debtor_invoices_issued_is_complete
    check (status <> 'issued'
           or (invoice_no is not null and gl_entry_id is not null
               and debtor_account_code is not null and total_amount > 0
               and issued_at is not null)),
  constraint other_debtor_invoices_cancel_states_its_reason
    check (status <> 'cancelled' or length(btrim(coalesce(cancel_reason, ''))) > 0)
);
create index other_debtor_invoices_party_idx on public.other_debtor_invoices (party_id, status);
create index other_debtor_invoices_date_idx  on public.other_debtor_invoices (invoice_date);

create table public.other_debtor_invoice_lines (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.other_debtor_invoices(id) on delete restrict,
  line_no      integer not null check (line_no > 0),
  account_code text not null references public.gl_accounts(code),
  description  text check (description is null or length(description) <= 500),
  amount       numeric(12,2) not null check (amount > 0),
  created_at   timestamptz not null default now(),
  unique (invoice_id, line_no)
);

comment on table public.other_debtor_invoices is
  'An invoice Finance raises to a finance_parties row for something that is not furniture — a sister company''s share of the office rent, a recharge (0478). ARI-YYYYMMDD-RRRR, minted at issue. Issue posts Dr the OTHER control (1240) / Cr each line; an issued invoice is frozen and is undone only by cancellation, which reverses it.';


-- ── 7 · the other receipt ────────────────────────────────────────────────────
create table public.other_receipts (
  id                 uuid primary key default gen_random_uuid(),
  -- Minted at record: a receipt is recorded and posted in one act.
  receipt_no         text not null unique,
  party_id           uuid references public.finance_parties(id),
  -- Always present. With a party it defaults to the party's name; without
  -- one (a one-off payer) it is typed.
  payer_name         text not null check (length(btrim(payer_name)) between 1 and 200),
  receipt_date       date not null,
  money_account_code text not null references public.gl_accounts(code),
  reference          text check (reference is null or length(reference) <= 120),
  narration          text check (narration is null or length(narration) <= 500),
  total_amount       numeric(12,2) not null check (total_amount > 0),
  status             text not null default 'posted' check (status in ('posted','voided')),
  gl_entry_id        uuid not null references public.gl_entries(id),
  reversal_entry_id  uuid references public.gl_entries(id),
  -- One per opening of the form: a double press returns the first receipt
  -- instead of recording the money twice.
  idempotency_key    uuid unique,
  voided_at          timestamptz,
  voided_by          uuid references public.app_users(id),
  void_reason        text,
  created_at         timestamptz not null default now(),
  created_by         uuid references public.app_users(id),
  constraint other_receipts_void_is_complete
    check (status <> 'voided'
           or (reversal_entry_id is not null and voided_at is not null
               and length(btrim(coalesce(void_reason, ''))) > 0))
);
create index other_receipts_date_idx  on public.other_receipts (receipt_date);
create index other_receipts_party_idx on public.other_receipts (party_id);

create table public.other_receipt_lines (
  id           uuid primary key default gen_random_uuid(),
  receipt_id   uuid not null references public.other_receipts(id) on delete restrict,
  line_no      integer not null check (line_no > 0),
  account_code text not null references public.gl_accounts(code),
  description  text check (description is null or length(description) <= 500),
  amount       numeric(12,2) not null check (amount > 0),
  created_at   timestamptz not null default now(),
  unique (receipt_id, line_no)
);

create table public.other_receipt_allocations (
  id          uuid primary key default gen_random_uuid(),
  receipt_id  uuid not null references public.other_receipts(id) on delete restrict,
  invoice_id  uuid not null references public.other_debtor_invoices(id) on delete restrict,
  amount      numeric(12,2) not null check (amount > 0),
  created_at  timestamptz not null default now(),
  -- One receipt touches one invoice once.
  unique (receipt_id, invoice_id)
);
create index other_receipt_allocations_invoice_idx on public.other_receipt_allocations (invoice_id);

comment on table public.other_receipts is
  'Money that reached a Carres bank or cash account and is not customer order money (0478): a loan in, a director putting money in, other income, or money against issued other debtor invoices. RV-YYYYMMDD-RRRR. Recorded and posted in one act: Dr the money account / Cr each line / Cr 1240 per invoice. Cancelled only by reversal.';
comment on table public.other_receipt_allocations is
  'Which receipt money landed on which other debtor invoice. An allocation counts while its receipt is posted; a cancelled receipt''s allocations stop counting and the invoice is open again.';


-- ── 8 · immutability, at the row ─────────────────────────────────────────────
create or replace function public.other_debtor_invoice_frozen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'An other debtor invoice is never deleted. Cancel it instead.'
      using errcode = '42501', detail = 'no_delete';
  end if;
  if old.status = 'draft' then
    return new;                              -- a draft is still being written
  end if;
  if old.status = 'cancelled' then
    raise exception 'A cancelled invoice is final.'
      using errcode = '42501', detail = 'invoice_cancelled';
  end if;
  -- old.status = 'issued'
  if new.status <> 'cancelled' then
    raise exception 'An issued invoice cannot be edited. Cancel it and raise a corrected one.'
      using errcode = '42501', detail = 'invoice_issued';
  end if;
  if new.invoice_no          is distinct from old.invoice_no
     or new.party_id            is distinct from old.party_id
     or new.invoice_date        is distinct from old.invoice_date
     or new.due_date            is distinct from old.due_date
     or new.reference           is distinct from old.reference
     or new.narration           is distinct from old.narration
     or new.total_amount        is distinct from old.total_amount
     or new.debtor_account_code is distinct from old.debtor_account_code
     or new.gl_entry_id         is distinct from old.gl_entry_id
     or new.issued_at           is distinct from old.issued_at
     or new.issued_by           is distinct from old.issued_by
     or new.created_at          is distinct from old.created_at
     or new.created_by          is distinct from old.created_by then
    raise exception 'Cancelling an invoice may change only its cancellation stamp.'
      using errcode = '42501', detail = 'invoice_issued';
  end if;
  return new;
end;
$fn$;

create trigger other_debtor_invoice_frozen_trg
  before update or delete on public.other_debtor_invoices
  for each row execute function public.other_debtor_invoice_frozen();

create or replace function public.other_debtor_invoice_lines_frozen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_status text;
begin
  select status into v_status from public.other_debtor_invoices
   where id = coalesce(new.invoice_id, old.invoice_id);
  if v_status is distinct from 'draft' then
    raise exception 'The lines of an % invoice are frozen.', coalesce(v_status, 'unknown')
      using errcode = '42501', detail = 'invoice_not_draft';
  end if;
  return coalesce(new, old);
end;
$fn$;

create trigger other_debtor_invoice_lines_frozen_trg
  before insert or update or delete on public.other_debtor_invoice_lines
  for each row execute function public.other_debtor_invoice_lines_frozen();

create or replace function public.other_receipt_frozen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'A receipt is never deleted. Cancel it instead.'
      using errcode = '42501', detail = 'no_delete';
  end if;
  if old.status = 'voided' then
    raise exception 'A cancelled receipt is final.'
      using errcode = '42501', detail = 'receipt_cancelled';
  end if;
  if new.status <> 'voided'
     or new.receipt_no         is distinct from old.receipt_no
     or new.party_id           is distinct from old.party_id
     or new.payer_name         is distinct from old.payer_name
     or new.receipt_date       is distinct from old.receipt_date
     or new.money_account_code is distinct from old.money_account_code
     or new.reference          is distinct from old.reference
     or new.narration          is distinct from old.narration
     or new.total_amount       is distinct from old.total_amount
     or new.gl_entry_id        is distinct from old.gl_entry_id
     or new.idempotency_key    is distinct from old.idempotency_key
     or new.created_at         is distinct from old.created_at
     or new.created_by         is distinct from old.created_by then
    raise exception 'A recorded receipt cannot be edited. Cancel it and record a corrected one.'
      using errcode = '42501', detail = 'receipt_locked';
  end if;
  return new;
end;
$fn$;

create trigger other_receipt_frozen_trg
  before update or delete on public.other_receipts
  for each row execute function public.other_receipt_frozen();

-- A receipt's lines and allocations are written in the same transaction that
-- records the receipt, and never again. `now()` is the transaction's start
-- time, and so is the receipt's `created_at`: equal means "born together".
create or replace function public.other_receipt_children_frozen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op <> 'INSERT' then
    raise exception 'The lines of a recorded receipt are frozen. Cancel the receipt and record a corrected one.'
      using errcode = '42501', detail = 'receipt_locked';
  end if;
  if not exists (select 1 from public.other_receipts r
                  where r.id = new.receipt_id and r.status = 'posted'
                    and r.created_at = now()) then
    raise exception 'A line can be added to a receipt only while the receipt is being recorded.'
      using errcode = '42501', detail = 'receipt_locked';
  end if;
  return new;
end;
$fn$;

create trigger other_receipt_lines_frozen_trg
  before insert or update or delete on public.other_receipt_lines
  for each row execute function public.other_receipt_children_frozen();
create trigger other_receipt_allocations_frozen_trg
  before insert or update or delete on public.other_receipt_allocations
  for each row execute function public.other_receipt_children_frozen();

-- The ceiling, held by the database: no invoice receives more than its total.
-- It locks the invoice it measures, so two receipts against one invoice in two
-- tabs queue instead of both reading the same open amount.
create or replace function public.other_receipt_allocation_ceiling()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_inv      public.other_debtor_invoices%rowtype;
  v_party    uuid;
  v_received numeric(12,2);
begin
  select * into v_inv from public.other_debtor_invoices where id = new.invoice_id for update;
  select party_id into v_party from public.other_receipts where id = new.receipt_id;
  if v_inv.status is distinct from 'issued' then
    raise exception 'Money can only be received against an issued invoice.'
      using errcode = 'P0001', detail = 'invoice_not_issued';
  end if;
  if v_party is distinct from v_inv.party_id then
    raise exception 'Invoice % belongs to a different party from this receipt.', v_inv.invoice_no
      using errcode = 'P0001', detail = 'party_mismatch';
  end if;
  select coalesce(sum(a.amount), 0) into v_received
    from public.other_receipt_allocations a
    join public.other_receipts r on r.id = a.receipt_id
   where a.invoice_id = new.invoice_id and r.status = 'posted' and a.id <> new.id;
  if v_received + new.amount > v_inv.total_amount then
    raise exception 'Invoice % is for % and % is already received. % more would be more than the invoice.',
      v_inv.invoice_no, public.fin_rm(v_inv.total_amount), public.fin_rm(v_received), public.fin_rm(new.amount)
      using errcode = 'P0001', detail = 'invoice_over_received';
  end if;
  return new;
end;
$fn$;

create trigger other_receipt_allocation_ceiling_trg
  before insert on public.other_receipt_allocations
  for each row execute function public.other_receipt_allocation_ceiling();


-- ── 9 · parties: create and edit ─────────────────────────────────────────────
create or replace function public.finance_party_create(
  p_name            text,
  p_kind            text,
  p_registration_no text default null,
  p_phone           text default null,
  p_email           text default null,
  p_address         text default null,
  p_notes           text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := public.app_role()::text;
  v_id   uuid;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance adds a party.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'Type the party''s name.'
      using errcode = '22023', detail = 'name_missing';
  end if;
  if p_kind is null or p_kind not in ('company','person') then
    raise exception 'Choose whether the party is a company or a person.'
      using errcode = '22023', detail = 'kind_invalid';
  end if;
  begin
    insert into public.finance_parties
      (name, kind, registration_no, phone, email, address, notes, created_by, updated_by)
    values
      (btrim(p_name), p_kind,
       nullif(btrim(coalesce(p_registration_no, '')), ''),
       nullif(btrim(coalesce(p_phone, '')), ''),
       nullif(btrim(coalesce(p_email, '')), ''),
       nullif(btrim(coalesce(p_address, '')), ''),
       nullif(btrim(coalesce(p_notes, '')), ''),
       auth.uid(), auth.uid())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'A party named % is already on the list.', btrim(p_name)
      using errcode = '22023', detail = 'party_exists';
  end;
  return v_id;
end;
$fn$;

create or replace function public.finance_party_update(
  p_party_id        uuid,
  p_name            text,
  p_kind            text,
  p_registration_no text,
  p_phone           text,
  p_email           text,
  p_address         text,
  p_notes           text,
  p_is_active       boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role  text := public.app_role()::text;
  v_party public.finance_parties%rowtype;
  v_open  numeric(12,2);
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance edits a party.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  select * into v_party from public.finance_parties where id = p_party_id for update;
  if not found then
    raise exception 'Party not found.'
      using errcode = 'P0002', detail = 'party_missing';
  end if;
  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'Type the party''s name.'
      using errcode = '22023', detail = 'name_missing';
  end if;
  if p_kind is null or p_kind not in ('company','person') then
    raise exception 'Choose whether the party is a company or a person.'
      using errcode = '22023', detail = 'kind_invalid';
  end if;
  -- A party that still owes money cannot leave the list: its outstanding
  -- would stop being anybody's job.
  if v_party.is_active and p_is_active is false then
    select coalesce(sum(i.total_amount), 0)
           - coalesce((select sum(a.amount)
                         from public.other_receipt_allocations a
                         join public.other_receipts r on r.id = a.receipt_id
                         join public.other_debtor_invoices i2 on i2.id = a.invoice_id
                        where r.status = 'posted' and i2.status = 'issued'
                          and i2.party_id = p_party_id), 0)
      into v_open
      from public.other_debtor_invoices i
     where i.party_id = p_party_id and i.status = 'issued';
    if v_open > 0 then
      raise exception '% still owes %. A party with money outstanding stays on the list.',
        v_party.name, public.fin_rm(v_open)
        using errcode = 'P0001', detail = 'party_has_outstanding';
    end if;
  end if;
  begin
    update public.finance_parties
       set name            = btrim(p_name),
           kind            = p_kind,
           registration_no = nullif(btrim(coalesce(p_registration_no, '')), ''),
           phone           = nullif(btrim(coalesce(p_phone, '')), ''),
           email           = nullif(btrim(coalesce(p_email, '')), ''),
           address         = nullif(btrim(coalesce(p_address, '')), ''),
           notes           = nullif(btrim(coalesce(p_notes, '')), ''),
           is_active       = coalesce(p_is_active, v_party.is_active),
           updated_at      = now(),
           updated_by      = auth.uid()
     where id = p_party_id;
  exception when unique_violation then
    raise exception 'A party named % is already on the list.', btrim(p_name)
      using errcode = '22023', detail = 'party_exists';
  end;
  return p_party_id;
end;
$fn$;


-- ── 10 · the invoice's doors ─────────────────────────────────────────────────
-- Header rules shared by create and edit.
create or replace function public.other_debtor_invoice_check_header(
  p_party_id uuid, p_invoice_date date, p_due_date date)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_active boolean;
begin
  if p_party_id is null then
    raise exception 'Choose who the invoice is for.'
      using errcode = '22023', detail = 'party_missing';
  end if;
  select is_active into v_active from public.finance_parties where id = p_party_id;
  if not found then
    raise exception 'Party not found.'
      using errcode = 'P0002', detail = 'party_missing';
  end if;
  if not v_active then
    raise exception 'This party is no longer on the list. It cannot be invoiced.'
      using errcode = '22023', detail = 'party_inactive';
  end if;
  if p_invoice_date is null then
    raise exception 'Choose the invoice date.'
      using errcode = '22023', detail = 'date_missing';
  end if;
  if p_due_date is not null and p_due_date < p_invoice_date then
    raise exception 'The due date is before the invoice date.'
      using errcode = '22023', detail = 'due_before_date';
  end if;
end;
$fn$;

-- Lines, validated one by one and written; returns the total. A draft's lines
-- are replaced whole: the caller removes the old ones first.
create or replace function public.other_debtor_invoice_write_lines(p_invoice_id uuid, p_lines jsonb)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_elem    jsonb;
  v_idx     integer := 0;
  v_code    text;
  v_problem text;
  v_amount  numeric(12,2);
  v_total   numeric(12,2) := 0;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'An invoice needs at least one line.'
      using errcode = '22023', detail = 'no_lines';
  end if;
  if jsonb_array_length(p_lines) > 50 then
    raise exception 'An invoice takes at most 50 lines.'
      using errcode = '22023', detail = 'too_many_lines';
  end if;
  for v_elem in select value from jsonb_array_elements(p_lines) loop
    v_idx := v_idx + 1;
    if jsonb_typeof(v_elem) <> 'object' then
      raise exception 'Line %: not a line.', v_idx
        using errcode = '22023', detail = 'line_not_object';
    end if;
    v_code := btrim(coalesce(v_elem ->> 'account_code', ''));
    v_problem := public.fin_money_in_account_problem(v_code, 'invoice_line');
    if v_problem is not null then
      raise exception 'Line %: %', v_idx, v_problem
        using errcode = '22023', detail = 'line_account_refused';
    end if;
    v_amount := public.fin_json_amount(v_elem, 'amount', format('Line %s', v_idx));
    insert into public.other_debtor_invoice_lines (invoice_id, line_no, account_code, description, amount)
    values (p_invoice_id, v_idx, v_code,
            nullif(btrim(coalesce(v_elem ->> 'description', '')), ''), v_amount);
    v_total := v_total + v_amount;
  end loop;
  return v_total;
end;
$fn$;

-- Issue. The act that posts:  Dr 1240 (party OTHER)  /  Cr each line.
create or replace function public.other_debtor_invoice_issue(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role    text := public.app_role()::text;
  v_inv     public.other_debtor_invoices%rowtype;
  v_party   public.finance_parties%rowtype;
  v_line    record;
  v_problem text;
  v_total   numeric(12,2);
  v_ctl     text;
  v_no      text;
  v_lines   jsonb;
  v_entry   uuid;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance issues an other debtor invoice.'
      using errcode = '42501', detail = 'not_finance';
  end if;

  select * into v_inv from public.other_debtor_invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found.'
      using errcode = 'P0002', detail = 'invoice_missing';
  end if;
  if v_inv.status = 'issued' then
    raise exception 'Invoice % is already issued.', v_inv.invoice_no
      using errcode = '22023', detail = 'already_issued';
  end if;
  if v_inv.status = 'cancelled' then
    raise exception 'This invoice is cancelled. It cannot be issued.'
      using errcode = '22023', detail = 'invoice_cancelled';
  end if;

  select * into v_party from public.finance_parties where id = v_inv.party_id;
  if not v_party.is_active then
    raise exception '% is no longer on the list. The invoice cannot be issued.', v_party.name
      using errcode = '22023', detail = 'party_inactive';
  end if;

  perform public.fin_refuse_before_go_live(v_inv.invoice_date, 'This invoice');

  -- The chart may have moved since the draft was saved.
  for v_line in select l.line_no, l.account_code from public.other_debtor_invoice_lines l
                 where l.invoice_id = p_invoice_id order by l.line_no loop
    v_problem := public.fin_money_in_account_problem(v_line.account_code, 'invoice_line');
    if v_problem is not null then
      raise exception 'Line %: %', v_line.line_no, v_problem
        using errcode = '22023', detail = 'line_account_refused';
    end if;
  end loop;

  select coalesce(sum(amount), 0) into v_total
    from public.other_debtor_invoice_lines where invoice_id = p_invoice_id;
  if v_total <= 0 then
    raise exception 'An invoice of RM 0.00 is not an invoice.'
      using errcode = '22023', detail = 'zero_total';
  end if;

  v_ctl := public.fin_other_debtor_control_account();

  -- Random, not counted (0381, purchasing MASTER §6.1): this number goes to a
  -- sister company, and a counted one would tell them how many we raised.
  v_no := public.allocate_formal_document_code('ARI', v_inv.id::text, v_inv.invoice_date);

  select jsonb_build_array(jsonb_build_object(
           'account_code', v_ctl,
           'debit',        v_total,
           'credit',       0,
           'party_type',   'OTHER',
           'party_id',     v_inv.party_id,
           'memo',         'Invoice ' || v_no || ' · ' || v_party.name))
         || coalesce(jsonb_agg(jsonb_build_object(
           'account_code', l.account_code,
           'debit',        0,
           'credit',       l.amount,
           'memo',         coalesce(l.description, 'Invoice ' || v_no))
           order by l.line_no), '[]'::jsonb)
    into v_lines
    from public.other_debtor_invoice_lines l
   where l.invoice_id = p_invoice_id;

  v_entry := public.gl_post(
    'OTHER_DEBTOR_INVOICE',
    v_no,
    v_inv.invoice_date,
    coalesce(v_inv.narration, 'Other debtor invoice ' || v_no || ' · ' || v_party.name),
    v_lines);

  update public.other_debtor_invoices
     set invoice_no          = v_no,
         total_amount        = v_total,
         debtor_account_code = v_ctl,
         status              = 'issued',
         gl_entry_id         = v_entry,
         issued_at           = now(),
         issued_by           = auth.uid(),
         updated_at          = now(),
         updated_by          = auth.uid()
   where id = p_invoice_id;

  return v_entry;
end;
$fn$;

-- Create a draft; `p_issue` issues it in the same transaction, so a refused
-- issue leaves nothing half-saved.
create or replace function public.other_debtor_invoice_create(
  p_party_id     uuid,
  p_invoice_date date,
  p_lines        jsonb,
  p_due_date     date    default null,
  p_reference    text    default null,
  p_narration    text    default null,
  p_issue        boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role  text := public.app_role()::text;
  v_id    uuid;
  v_total numeric(12,2);
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance writes an other debtor invoice.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  perform public.other_debtor_invoice_check_header(p_party_id, p_invoice_date, p_due_date);

  insert into public.other_debtor_invoices
    (party_id, invoice_date, due_date, reference, narration, created_by, updated_by)
  values
    (p_party_id, p_invoice_date, p_due_date,
     nullif(btrim(coalesce(p_reference, '')), ''),
     nullif(btrim(coalesce(p_narration, '')), ''),
     auth.uid(), auth.uid())
  returning id into v_id;

  v_total := public.other_debtor_invoice_write_lines(v_id, p_lines);
  update public.other_debtor_invoices set total_amount = v_total where id = v_id;

  if coalesce(p_issue, false) then
    perform public.other_debtor_invoice_issue(v_id);
  end if;
  return v_id;
end;
$fn$;

-- Edit a draft. Only a draft: an issued invoice is posted and frozen.
create or replace function public.other_debtor_invoice_update(
  p_invoice_id   uuid,
  p_party_id     uuid,
  p_invoice_date date,
  p_lines        jsonb,
  p_due_date     date    default null,
  p_reference    text    default null,
  p_narration    text    default null,
  p_issue        boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role   text := public.app_role()::text;
  v_status text;
  v_total  numeric(12,2);
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance edits an other debtor invoice.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  select status into v_status from public.other_debtor_invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found.'
      using errcode = 'P0002', detail = 'invoice_missing';
  end if;
  if v_status <> 'draft' then
    raise exception 'Only a draft can be edited. This invoice is %.', v_status
      using errcode = '22023', detail = 'invoice_not_draft';
  end if;
  perform public.other_debtor_invoice_check_header(p_party_id, p_invoice_date, p_due_date);

  update public.other_debtor_invoices
     set party_id     = p_party_id,
         invoice_date = p_invoice_date,
         due_date     = p_due_date,
         reference    = nullif(btrim(coalesce(p_reference, '')), ''),
         narration    = nullif(btrim(coalesce(p_narration, '')), ''),
         updated_at   = now(),
         updated_by   = auth.uid()
   where id = p_invoice_id;

  -- A draft's lines are replaced whole. The lines trigger allows this only
  -- while the invoice is a draft; no posted row is touched.
  delete from public.other_debtor_invoice_lines where invoice_id = p_invoice_id;
  v_total := public.other_debtor_invoice_write_lines(p_invoice_id, p_lines);
  update public.other_debtor_invoices set total_amount = v_total where id = p_invoice_id;

  if coalesce(p_issue, false) then
    perform public.other_debtor_invoice_issue(p_invoice_id);
  end if;
  return p_invoice_id;
end;
$fn$;

-- Cancel. A draft simply stops. An issued invoice is reversed — by the finance
-- approver, and only once nothing is received against it any more.
create or replace function public.other_debtor_invoice_cancel(p_invoice_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     text := public.app_role()::text;
  v_inv      public.other_debtor_invoices%rowtype;
  v_received numeric(12,2);
  v_nos      text;
  v_reversal uuid;
begin
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Type why the invoice is cancelled.'
      using errcode = '22023', detail = 'reason_missing';
  end if;
  select * into v_inv from public.other_debtor_invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found.'
      using errcode = 'P0002', detail = 'invoice_missing';
  end if;
  if v_inv.status = 'cancelled' then
    raise exception 'This invoice is already cancelled.'
      using errcode = '22023', detail = 'already_cancelled';
  end if;

  if v_inv.status = 'draft' then
    if v_role is null or v_role not in ('finance','principal') then
      raise exception 'Only Finance cancels a draft invoice.'
        using errcode = '42501', detail = 'not_finance';
    end if;
  else
    if not public.has_finance_approver(auth.uid()) then
      raise exception 'Cancelling an issued invoice takes the finance approver.'
        using errcode = '42501', detail = 'not_finance_approver';
    end if;
    select coalesce(sum(a.amount), 0), string_agg(r.receipt_no, ', ' order by r.receipt_no)
      into v_received, v_nos
      from public.other_receipt_allocations a
      join public.other_receipts r on r.id = a.receipt_id
     where a.invoice_id = p_invoice_id and r.status = 'posted';
    if v_received > 0 then
      raise exception '% of this invoice was received on %. Cancel those receipts first.',
        public.fin_rm(v_received), v_nos
        using errcode = 'P0001', detail = 'invoice_has_receipts';
    end if;
    v_reversal := public.gl_reverse(v_inv.gl_entry_id, btrim(p_reason));
  end if;

  update public.other_debtor_invoices
     set status            = 'cancelled',
         reversal_entry_id = v_reversal,
         cancelled_at      = now(),
         cancelled_by      = auth.uid(),
         cancel_reason     = btrim(p_reason),
         updated_at        = now(),
         updated_by        = auth.uid()
   where id = p_invoice_id;

  return v_reversal;
end;
$fn$;


-- ── 11 · the receipt's two doors ─────────────────────────────────────────────
-- Record. Posts at once:
--   Dr money account (the total) / Cr each line (party stamped when named)
--                                / Cr the invoice's OTHER control per invoice
create or replace function public.other_receipt_create(
  p_receipt_date       date,
  p_money_account_code text,
  p_lines              jsonb default '[]'::jsonb,
  p_allocations        jsonb default '[]'::jsonb,
  p_party_id           uuid  default null,
  p_payer_name         text  default null,
  p_reference          text  default null,
  p_narration          text  default null,
  p_idempotency_key    uuid  default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role        text := public.app_role()::text;
  v_existing    uuid;
  v_party       public.finance_parties%rowtype;
  v_has_party   boolean := false;
  v_payer       text;
  v_problem     text;
  v_lines       jsonb := coalesce(p_lines, '[]'::jsonb);
  v_allocs      jsonb := coalesce(p_allocations, '[]'::jsonb);
  v_elem        jsonb;
  v_idx         integer;
  v_code        text;
  v_amount      numeric(12,2);
  v_inv_id      uuid;
  v_inv         public.other_debtor_invoices%rowtype;
  v_received    numeric(12,2);
  v_seen        uuid[] := '{}';
  v_line_rows   jsonb := '[]'::jsonb;
  v_alloc_rows  jsonb := '[]'::jsonb;
  v_total       numeric(12,2) := 0;
  v_id          uuid;
  v_no          text;
  v_gl          jsonb;
  v_entry       uuid;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance records a receipt.'
      using errcode = '42501', detail = 'not_finance';
  end if;

  -- A double press sends the same key twice. The lock queues the second call
  -- behind the first, and the second finds the first's receipt.
  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('other_receipt:' || p_idempotency_key::text, 0));
    select id into v_existing from public.other_receipts where idempotency_key = p_idempotency_key;
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  if p_receipt_date is null then
    raise exception 'Choose the date the money was received.'
      using errcode = '22023', detail = 'date_missing';
  end if;
  perform public.fin_refuse_before_go_live(p_receipt_date, 'This receipt');

  v_problem := public.fin_money_in_account_problem(p_money_account_code, 'money');
  if v_problem is not null then
    raise exception 'Received into: %', v_problem
      using errcode = '22023', detail = 'money_account_refused';
  end if;

  if p_party_id is not null then
    select * into v_party from public.finance_parties where id = p_party_id;
    if not found then
      raise exception 'Party not found.'
        using errcode = 'P0002', detail = 'party_missing';
    end if;
    if not v_party.is_active then
      raise exception '% is no longer on the list.', v_party.name
        using errcode = '22023', detail = 'party_inactive';
    end if;
    v_has_party := true;
  end if;

  v_payer := nullif(btrim(coalesce(p_payer_name, '')), '');
  if v_payer is null and v_has_party then
    v_payer := v_party.name;
  end if;
  if v_payer is null then
    raise exception 'Who paid? Type the payer''s name, or choose a party.'
      using errcode = '22023', detail = 'payer_missing';
  end if;

  if jsonb_typeof(v_lines) <> 'array' or jsonb_typeof(v_allocs) <> 'array' then
    raise exception 'The lines of a receipt must be a list.'
      using errcode = '22023', detail = 'lines_not_array';
  end if;
  if jsonb_array_length(v_lines) + jsonb_array_length(v_allocs) = 0 then
    raise exception 'A receipt needs at least one line, or one invoice it pays.'
      using errcode = '22023', detail = 'no_lines';
  end if;
  if jsonb_array_length(v_lines) > 50 or jsonb_array_length(v_allocs) > 50 then
    raise exception 'A receipt takes at most 50 lines and 50 invoices.'
      using errcode = '22023', detail = 'too_many_lines';
  end if;

  -- Lines: what the money was, when it is not an invoice being paid.
  v_idx := 0;
  for v_elem in select value from jsonb_array_elements(v_lines) loop
    v_idx := v_idx + 1;
    if jsonb_typeof(v_elem) <> 'object' then
      raise exception 'Line %: not a line.', v_idx
        using errcode = '22023', detail = 'line_not_object';
    end if;
    v_code := btrim(coalesce(v_elem ->> 'account_code', ''));
    v_problem := public.fin_money_in_account_problem(v_code, 'receipt_line');
    if v_problem is not null then
      raise exception 'Line %: %', v_idx, v_problem
        using errcode = '22023', detail = 'line_account_refused';
    end if;
    v_amount := public.fin_json_amount(v_elem, 'amount', format('Line %s', v_idx));
    v_line_rows := v_line_rows || jsonb_build_object(
      'line_no', v_idx, 'account_code', v_code, 'amount', v_amount,
      'description', nullif(btrim(coalesce(v_elem ->> 'description', '')), ''));
    v_total := v_total + v_amount;
  end loop;

  -- Invoices: money against other debtor invoices of this same party.
  if jsonb_array_length(v_allocs) > 0 then
    if not v_has_party then
      raise exception 'Money against an invoice needs the party the invoice was issued to.'
        using errcode = '22023', detail = 'party_missing';
    end if;
    -- Lock every invoice first, in one fixed order, so two receipts naming
    -- the same invoices cannot deadlock each other.
    begin
      perform 1 from public.other_debtor_invoices i
       where i.id in (select (e ->> 'invoice_id')::uuid from jsonb_array_elements(v_allocs) e)
       order by i.id
       for update;
    exception when invalid_text_representation then
      raise exception 'An invoice in this receipt is not a valid invoice.'
        using errcode = '22023', detail = 'invoice_id_invalid';
    end;

    v_idx := 0;
    for v_elem in select value from jsonb_array_elements(v_allocs) loop
      v_idx := v_idx + 1;
      v_inv_id := nullif(btrim(coalesce(v_elem ->> 'invoice_id', '')), '')::uuid;
      if v_inv_id is null then
        raise exception 'Invoice %: choose the invoice.', v_idx
          using errcode = '22023', detail = 'invoice_missing';
      end if;
      if v_inv_id = any(v_seen) then
        raise exception 'The same invoice is listed twice. Put the whole amount on one row.'
          using errcode = '22023', detail = 'invoice_twice';
      end if;
      v_seen := v_seen || v_inv_id;

      select * into v_inv from public.other_debtor_invoices where id = v_inv_id;
      if not found then
        raise exception 'Invoice not found.'
          using errcode = 'P0002', detail = 'invoice_missing';
      end if;
      if v_inv.status <> 'issued' then
        raise exception 'Only an issued invoice can be paid. This one is %.', v_inv.status
          using errcode = '22023', detail = 'invoice_not_issued';
      end if;
      if v_inv.party_id <> p_party_id then
        raise exception 'Invoice % was issued to a different party.', v_inv.invoice_no
          using errcode = '22023', detail = 'party_mismatch';
      end if;

      v_amount := public.fin_json_amount(v_elem, 'amount', 'Invoice ' || v_inv.invoice_no);
      select coalesce(sum(a.amount), 0) into v_received
        from public.other_receipt_allocations a
        join public.other_receipts r on r.id = a.receipt_id
       where a.invoice_id = v_inv.id and r.status = 'posted';
      if v_amount > v_inv.total_amount - v_received then
        raise exception 'Invoice % has % outstanding. % is more than that.',
          v_inv.invoice_no, public.fin_rm(v_inv.total_amount - v_received), public.fin_rm(v_amount)
          using errcode = 'P0001', detail = 'invoice_over_received';
      end if;

      v_alloc_rows := v_alloc_rows || jsonb_build_object(
        'invoice_id', v_inv.id, 'invoice_no', v_inv.invoice_no,
        'account_code', v_inv.debtor_account_code, 'amount', v_amount);
      v_total := v_total + v_amount;
    end loop;
  end if;

  if v_total <= 0 then
    raise exception 'A receipt of RM 0.00 is not a receipt.'
      using errcode = '22023', detail = 'zero_total';
  end if;

  v_id := gen_random_uuid();
  v_no := public.allocate_formal_document_code('RV', v_id::text, p_receipt_date);

  -- The entry: one debit to the money, one credit per line and per invoice.
  v_gl := jsonb_build_array(jsonb_build_object(
    'account_code', btrim(p_money_account_code),
    'debit',        v_total,
    'credit',       0,
    'memo',         'Receipt ' || v_no || ' · ' || v_payer));
  select v_gl || coalesce(jsonb_agg(
           jsonb_strip_nulls(jsonb_build_object(
             'account_code', l ->> 'account_code',
             'debit',        0,
             'credit',       (l ->> 'amount')::numeric,
             'party_type',   case when v_has_party then 'OTHER' end,
             'party_id',     case when v_has_party then p_party_id end,
             'memo',         coalesce(l ->> 'description', 'Receipt ' || v_no)))
           order by (l ->> 'line_no')::int), '[]'::jsonb)
    into v_gl
    from jsonb_array_elements(v_line_rows) l;
  select v_gl || coalesce(jsonb_agg(
           jsonb_build_object(
             'account_code', a ->> 'account_code',
             'debit',        0,
             'credit',       (a ->> 'amount')::numeric,
             'party_type',   'OTHER',
             'party_id',     p_party_id,
             'memo',         'Invoice ' || (a ->> 'invoice_no'))
           order by a ->> 'invoice_no'), '[]'::jsonb)
    into v_gl
    from jsonb_array_elements(v_alloc_rows) a;

  v_entry := public.gl_post(
    'OTHER_RECEIPT',
    v_no,
    p_receipt_date,
    coalesce(nullif(btrim(coalesce(p_narration, '')), ''), 'Receipt ' || v_no || ' · ' || v_payer),
    v_gl);

  insert into public.other_receipts
    (id, receipt_no, party_id, payer_name, receipt_date, money_account_code,
     reference, narration, total_amount, status, gl_entry_id, idempotency_key, created_by)
  values
    (v_id, v_no, p_party_id, v_payer, p_receipt_date, btrim(p_money_account_code),
     nullif(btrim(coalesce(p_reference, '')), ''),
     nullif(btrim(coalesce(p_narration, '')), ''),
     v_total, 'posted', v_entry, p_idempotency_key, auth.uid());

  insert into public.other_receipt_lines (receipt_id, line_no, account_code, description, amount)
  select v_id, (l ->> 'line_no')::int, l ->> 'account_code', l ->> 'description', (l ->> 'amount')::numeric
    from jsonb_array_elements(v_line_rows) l;

  insert into public.other_receipt_allocations (receipt_id, invoice_id, amount)
  select v_id, (a ->> 'invoice_id')::uuid, (a ->> 'amount')::numeric
    from jsonb_array_elements(v_alloc_rows) a;

  return v_id;
end;
$fn$;

-- Cancel. Money that was recorded is un-recorded by reversal, by the finance
-- approver. Its allocations stop counting, so the invoice is open again.
create or replace function public.other_receipt_void(p_receipt_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_rec      public.other_receipts%rowtype;
  v_reversal uuid;
begin
  if not public.has_finance_approver(auth.uid()) then
    raise exception 'Cancelling a receipt takes the finance approver.'
      using errcode = '42501', detail = 'not_finance_approver';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Type why the receipt is cancelled.'
      using errcode = '22023', detail = 'reason_missing';
  end if;
  select * into v_rec from public.other_receipts where id = p_receipt_id for update;
  if not found then
    raise exception 'Receipt not found.'
      using errcode = 'P0002', detail = 'receipt_missing';
  end if;
  if v_rec.status = 'voided' then
    raise exception 'This receipt is already cancelled.'
      using errcode = '22023', detail = 'already_cancelled';
  end if;

  v_reversal := public.gl_reverse(v_rec.gl_entry_id, btrim(p_reason));

  update public.other_receipts
     set status            = 'voided',
         reversal_entry_id = v_reversal,
         voided_at         = now(),
         voided_by         = auth.uid(),
         void_reason       = btrim(p_reason)
   where id = p_receipt_id;

  return v_reversal;
end;
$fn$;


-- ── 12 · reads, recomputed every time ────────────────────────────────────────
-- Every issued invoice's outstanding = total − what POSTED receipts allocated.
create or replace function public.other_debtor_invoice_list(p_party_id uuid default null)
returns table (
  invoice_id      uuid,
  invoice_no      text,
  status          text,
  party_id        uuid,
  party_name      text,
  invoice_date    date,
  due_date        date,
  reference       text,
  narration       text,
  first_line      text,
  line_count      integer,
  total_amount    numeric(12,2),
  received_amount numeric(12,2),
  outstanding     numeric(12,2),
  created_at      timestamptz,
  issued_at       timestamptz,
  cancelled_at    timestamptz,
  cancel_reason   text,
  go_live_on      date
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_go_live date;
begin
  if not public.gl_may_read() then
    raise exception 'Other debtors is for Finance.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  select gc.go_live_on into v_go_live from public.gl_config gc where gc.id;

  return query
  select i.id, i.invoice_no, i.status, i.party_id, p.name,
         i.invoice_date, i.due_date, i.reference, i.narration,
         (select coalesce(l.description, a.name) from public.other_debtor_invoice_lines l
            join public.gl_accounts a on a.code = l.account_code
           where l.invoice_id = i.id order by l.line_no limit 1),
         (select count(*)::int from public.other_debtor_invoice_lines l where l.invoice_id = i.id),
         i.total_amount,
         coalesce(rcv.total, 0)::numeric(12,2),
         (case when i.status = 'issued' then i.total_amount - coalesce(rcv.total, 0) end)::numeric(12,2),
         i.created_at, i.issued_at, i.cancelled_at, i.cancel_reason,
         v_go_live
    from public.other_debtor_invoices i
    join public.finance_parties p on p.id = i.party_id
    left join (
      select a.invoice_id, sum(a.amount) as total
        from public.other_receipt_allocations a
        join public.other_receipts r on r.id = a.receipt_id
       where r.status = 'posted'
       group by a.invoice_id
    ) rcv on rcv.invoice_id = i.id
   where p_party_id is null or i.party_id = p_party_id
   order by i.invoice_date desc, i.created_at desc;
end;
$fn$;

-- One row per party, EVERY party, owing or not — so "not in the list" can
-- never be read as "owes nothing".
create or replace function public.other_debtor_outstanding(p_party_id uuid default null)
returns table (
  party_id                 uuid,
  name                     text,
  kind                     text,
  registration_no          text,
  phone                    text,
  email                    text,
  address                  text,
  notes                    text,
  is_active                boolean,
  invoices_open            integer,
  invoiced_total           numeric(12,2),
  received_total           numeric(12,2),
  outstanding              numeric(12,2),
  oldest_open_invoice_date date,
  created_at               timestamptz,
  go_live_on               date
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_go_live date;
begin
  if not public.gl_may_read() then
    raise exception 'Other debtors is for Finance.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  select gc.go_live_on into v_go_live from public.gl_config gc where gc.id;

  return query
  with inv as (
    select i.id, i.party_id, i.invoice_date, i.total_amount,
           coalesce((select sum(a.amount)
                       from public.other_receipt_allocations a
                       join public.other_receipts r on r.id = a.receipt_id
                      where a.invoice_id = i.id and r.status = 'posted'), 0) as received
      from public.other_debtor_invoices i
     where i.status = 'issued'
  )
  select p.id, p.name, p.kind, p.registration_no, p.phone, p.email, p.address, p.notes, p.is_active,
         coalesce((select count(*) from inv where inv.party_id = p.id
                     and inv.total_amount > inv.received), 0)::int,
         coalesce((select sum(inv.total_amount) from inv where inv.party_id = p.id), 0)::numeric(12,2),
         coalesce((select sum(inv.received) from inv where inv.party_id = p.id), 0)::numeric(12,2),
         coalesce((select sum(inv.total_amount - inv.received) from inv where inv.party_id = p.id), 0)::numeric(12,2),
         (select min(inv.invoice_date) from inv where inv.party_id = p.id
             and inv.total_amount > inv.received),
         p.created_at,
         v_go_live
    from public.finance_parties p
   where p_party_id is null or p.id = p_party_id
   order by p.name;
end;
$fn$;

create or replace function public.other_debtor_invoice_detail(p_invoice_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_out jsonb;
begin
  if not public.gl_may_read() then
    raise exception 'Other debtors is for Finance.'
      using errcode = '42501', detail = 'not_finance';
  end if;

  select jsonb_build_object(
    'invoice', to_jsonb(l.*) || jsonb_build_object(
        'debtor_account_code', i.debtor_account_code,
        'entry_no',          (select e.entry_no from public.gl_entries e where e.id = i.gl_entry_id),
        'reversal_entry_no', (select e.entry_no from public.gl_entries e where e.id = i.reversal_entry_id),
        'created_by_name',   (select u.name from public.app_users u where u.id = i.created_by),
        'issued_by_name',    (select u.name from public.app_users u where u.id = i.issued_by),
        'cancelled_by_name', (select u.name from public.app_users u where u.id = i.cancelled_by)),
    'lines', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'line_no', dl.line_no, 'account_code', dl.account_code, 'account_name', a.name,
                 'description', dl.description, 'amount', dl.amount) order by dl.line_no)
          from public.other_debtor_invoice_lines dl
          join public.gl_accounts a on a.code = dl.account_code
         where dl.invoice_id = i.id), '[]'::jsonb),
    'receipts', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'receipt_id', r.id, 'receipt_no', r.receipt_no, 'receipt_date', r.receipt_date,
                 'amount', ra.amount, 'status', r.status) order by r.receipt_date, r.receipt_no)
          from public.other_receipt_allocations ra
          join public.other_receipts r on r.id = ra.receipt_id
         where ra.invoice_id = i.id), '[]'::jsonb))
    into v_out
    from public.other_debtor_invoices i
    cross join lateral (select * from public.other_debtor_invoice_list(i.party_id) x
                         where x.invoice_id = i.id) l
   where i.id = p_invoice_id;

  if v_out is null then
    raise exception 'Invoice not found.'
      using errcode = 'P0002', detail = 'invoice_missing';
  end if;
  return v_out;
end;
$fn$;

create or replace function public.other_receipt_list()
returns table (
  receipt_id         uuid,
  receipt_no         text,
  status             text,
  receipt_date       date,
  party_id           uuid,
  party_name         text,
  payer_name         text,
  money_account_code text,
  money_account_name text,
  reference          text,
  narration          text,
  what               text,
  total_amount       numeric(12,2),
  allocated_amount   numeric(12,2),
  created_at         timestamptz,
  created_by_name    text,
  voided_at          timestamptz,
  void_reason        text,
  go_live_on         date
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_go_live date;
begin
  if not public.gl_may_read() then
    raise exception 'Other receipts is for Finance.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  select gc.go_live_on into v_go_live from public.gl_config gc where gc.id;

  return query
  select r.id, r.receipt_no, r.status, r.receipt_date, r.party_id, p.name, r.payer_name,
         r.money_account_code, ma.name, r.reference, r.narration,
         -- What the money was, in the chart's own words, then the invoices it paid.
         nullif(concat_ws(' · ',
           (select string_agg(distinct a.name, ' · ') from public.other_receipt_lines rl
              join public.gl_accounts a on a.code = rl.account_code where rl.receipt_id = r.id),
           (select string_agg(i.invoice_no, ' · ' order by i.invoice_no)
              from public.other_receipt_allocations ra
              join public.other_debtor_invoices i on i.id = ra.invoice_id
             where ra.receipt_id = r.id)), ''),
         r.total_amount,
         coalesce((select sum(ra.amount) from public.other_receipt_allocations ra
                    where ra.receipt_id = r.id), 0)::numeric(12,2),
         r.created_at,
         (select u.name from public.app_users u where u.id = r.created_by),
         r.voided_at, r.void_reason,
         v_go_live
    from public.other_receipts r
    left join public.finance_parties p on p.id = r.party_id
    join public.gl_accounts ma on ma.code = r.money_account_code
   order by r.receipt_date desc, r.created_at desc;
end;
$fn$;

create or replace function public.other_receipt_detail(p_receipt_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_out jsonb;
begin
  if not public.gl_may_read() then
    raise exception 'Other receipts is for Finance.'
      using errcode = '42501', detail = 'not_finance';
  end if;

  select jsonb_build_object(
    'receipt', to_jsonb(l.*) || jsonb_build_object(
        'entry_no',          (select e.entry_no from public.gl_entries e where e.id = r.gl_entry_id),
        'reversal_entry_no', (select e.entry_no from public.gl_entries e where e.id = r.reversal_entry_id),
        'voided_by_name',    (select u.name from public.app_users u where u.id = r.voided_by)),
    'lines', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'line_no', rl.line_no, 'account_code', rl.account_code, 'account_name', a.name,
                 'description', rl.description, 'amount', rl.amount) order by rl.line_no)
          from public.other_receipt_lines rl
          join public.gl_accounts a on a.code = rl.account_code
         where rl.receipt_id = r.id), '[]'::jsonb),
    'allocations', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'invoice_id', i.id, 'invoice_no', i.invoice_no, 'invoice_date', i.invoice_date,
                 'invoice_total', i.total_amount, 'amount', ra.amount) order by i.invoice_no)
          from public.other_receipt_allocations ra
          join public.other_debtor_invoices i on i.id = ra.invoice_id
         where ra.receipt_id = r.id), '[]'::jsonb))
    into v_out
    from public.other_receipts r
    cross join lateral (select * from public.other_receipt_list() x where x.receipt_id = r.id) l
   where r.id = p_receipt_id;

  if v_out is null then
    raise exception 'Receipt not found.'
      using errcode = 'P0002', detail = 'receipt_missing';
  end if;
  return v_out;
end;
$fn$;

-- The account choices the two forms offer, from the same rules the documents
-- enforce.
create or replace function public.fin_money_in_account_options()
returns table (
  code             text,
  name             text,
  kind             text,
  parent_code      text,
  for_money        boolean,
  for_receipt_line boolean,
  for_invoice_line boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
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
     and not exists (select 1 from public.gl_accounts c where c.parent_code = a.code)
   order by a.code;
end;
$fn$;


-- ── 13 · nobody writes these tables from outside ─────────────────────────────
alter table public.finance_parties            enable row level security;
alter table public.other_debtor_invoices      enable row level security;
alter table public.other_debtor_invoice_lines enable row level security;
alter table public.other_receipts             enable row level security;
alter table public.other_receipt_lines        enable row level security;
alter table public.other_receipt_allocations  enable row level security;

revoke all on public.finance_parties            from anon, authenticated;
revoke all on public.other_debtor_invoices      from anon, authenticated;
revoke all on public.other_debtor_invoice_lines from anon, authenticated;
revoke all on public.other_receipts             from anon, authenticated;
revoke all on public.other_receipt_lines        from anon, authenticated;
revoke all on public.other_receipt_allocations  from anon, authenticated;

-- Select is granted back so the read policy is a live gate; insert, update
-- and delete stay revoked, and no write policy exists for anyone.
grant select on public.finance_parties            to authenticated;
grant select on public.other_debtor_invoices      to authenticated;
grant select on public.other_debtor_invoice_lines to authenticated;
grant select on public.other_receipts             to authenticated;
grant select on public.other_receipt_lines        to authenticated;
grant select on public.other_receipt_allocations  to authenticated;

create policy finance_parties_read_finance
  on public.finance_parties for select using ((select public.gl_may_read()));
create policy other_debtor_invoices_read_finance
  on public.other_debtor_invoices for select using ((select public.gl_may_read()));
create policy other_debtor_invoice_lines_read_finance
  on public.other_debtor_invoice_lines for select using ((select public.gl_may_read()));
create policy other_receipts_read_finance
  on public.other_receipts for select using ((select public.gl_may_read()));
create policy other_receipt_lines_read_finance
  on public.other_receipt_lines for select using ((select public.gl_may_read()));
create policy other_receipt_allocations_read_finance
  on public.other_receipt_allocations for select using ((select public.gl_may_read()));

-- Internal helpers and triggers: nobody calls these over the API.
revoke all on function public.fin_rm(numeric)                                 from public, anon, authenticated;
revoke all on function public.fin_other_debtor_control_account()               from public, anon, authenticated;
revoke all on function public.fin_refuse_before_go_live(date, text)            from public, anon, authenticated;
revoke all on function public.fin_json_amount(jsonb, text, text)               from public, anon, authenticated;
revoke all on function public.fin_money_in_account_problem(text, text)         from public, anon, authenticated;
revoke all on function public.other_debtor_invoice_check_header(uuid, date, date) from public, anon, authenticated;
revoke all on function public.other_debtor_invoice_write_lines(uuid, jsonb)    from public, anon, authenticated;
revoke all on function public.other_debtor_invoice_frozen()                    from public, anon, authenticated;
revoke all on function public.other_debtor_invoice_lines_frozen()              from public, anon, authenticated;
revoke all on function public.other_receipt_frozen()                           from public, anon, authenticated;
revoke all on function public.other_receipt_children_frozen()                  from public, anon, authenticated;
revoke all on function public.other_receipt_allocation_ceiling()               from public, anon, authenticated;

-- The doors and the reads: authenticated may call, and each checks its caller.
revoke all on function public.finance_party_create(text, text, text, text, text, text, text) from public, anon;
revoke all on function public.finance_party_update(uuid, text, text, text, text, text, text, text, boolean) from public, anon;
revoke all on function public.other_debtor_invoice_create(uuid, date, jsonb, date, text, text, boolean) from public, anon;
revoke all on function public.other_debtor_invoice_update(uuid, uuid, date, jsonb, date, text, text, boolean) from public, anon;
revoke all on function public.other_debtor_invoice_issue(uuid)                 from public, anon;
revoke all on function public.other_debtor_invoice_cancel(uuid, text)          from public, anon;
revoke all on function public.other_receipt_create(date, text, jsonb, jsonb, uuid, text, text, text, uuid) from public, anon;
revoke all on function public.other_receipt_void(uuid, text)                   from public, anon;
revoke all on function public.other_debtor_invoice_list(uuid)                  from public, anon;
revoke all on function public.other_debtor_outstanding(uuid)                   from public, anon;
revoke all on function public.other_debtor_invoice_detail(uuid)                from public, anon;
revoke all on function public.other_receipt_list()                             from public, anon;
revoke all on function public.other_receipt_detail(uuid)                       from public, anon;
revoke all on function public.fin_money_in_account_options()                   from public, anon;

grant execute on function public.finance_party_create(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.finance_party_update(uuid, text, text, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.other_debtor_invoice_create(uuid, date, jsonb, date, text, text, boolean) to authenticated;
grant execute on function public.other_debtor_invoice_update(uuid, uuid, date, jsonb, date, text, text, boolean) to authenticated;
grant execute on function public.other_debtor_invoice_issue(uuid)              to authenticated;
grant execute on function public.other_debtor_invoice_cancel(uuid, text)       to authenticated;
grant execute on function public.other_receipt_create(date, text, jsonb, jsonb, uuid, text, text, text, uuid) to authenticated;
grant execute on function public.other_receipt_void(uuid, text)                to authenticated;
grant execute on function public.other_debtor_invoice_list(uuid)               to authenticated;
grant execute on function public.other_debtor_outstanding(uuid)                to authenticated;
grant execute on function public.other_debtor_invoice_detail(uuid)             to authenticated;
grant execute on function public.other_receipt_list()                          to authenticated;
grant execute on function public.other_receipt_detail(uuid)                    to authenticated;
grant execute on function public.fin_money_in_account_options()                to authenticated;


-- ── 14 · sanity ──────────────────────────────────────────────────────────────
do $sanity$
declare
  v_src     text;
  v_go_live date;
  v_party   uuid := gen_random_uuid();
  v_entry   uuid;
  v_n       integer;
  v_probe   text;
  f         record;
begin
  -- 1 · gl_post: still nobody's over the API, still no role gate, every 0468
  --     validity marker still in the live body, and the third party type in.
  if has_function_privilege('authenticated', 'public.gl_post(text,text,date,text,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.gl_post(text,text,date,text,jsonb)', 'execute') then
    raise exception '0478 sanity: gl_post is callable over the API';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'public.gl_post(text,text,date,text,jsonb)'::regprocedure;
  if v_src like '%gl_post_forbidden%' or v_src like '%app_role()%' then
    raise exception '0478 sanity: a role gate came back into gl_post';
  end if;
  if v_src not like '%gl_post_entry_date_null%'
     or v_src not like '%gl_post_entry_date_before_go_live%'
     or v_src not like '%gl_post_account_is_header%'
     or v_src not like '%gl_post_account_inactive%'
     or v_src not like '%gl_post_control_account_needs_party%'
     or v_src not like '%gl_post_party_type_wrong_side%'
     or v_src not like '%gl_post_line_party_type_unknown%'
     or v_src not like '%gl_post_line_party_half_named%'
     or v_src not like '%gl_post_out_of_balance%'
     or v_src not like '%gl_post_zero_total%'
     or v_src not like '%not in (''CUSTOMER'',''SUPPLIER'',''OTHER'')%' then
    raise exception '0478 sanity: gl_post lost a validity check or did not learn OTHER';
  end if;

  -- 2 · the constraints widened, and only by OTHER.
  if pg_get_constraintdef((select oid from pg_constraint
        where conname = 'gl_accounts_control_for_valid'
          and conrelid = 'public.gl_accounts'::regclass)) not like '%OTHER%'
     or pg_get_constraintdef((select oid from pg_constraint
        where conname = 'gl_entry_lines_party_type_check'
          and conrelid = 'public.gl_entry_lines'::regclass)) not like '%OTHER%' then
    raise exception '0478 sanity: a party-type constraint did not learn OTHER';
  end if;

  -- 3 · customer receivables are still exactly one account.
  if public.gl_ar_control_account() <> '1210' then
    raise exception '0478 sanity: customer receivables moved to %', public.gl_ar_control_account();
  end if;
  if public.fin_other_debtor_control_account() <> '1240' then
    raise exception '0478 sanity: other debtors is not 1240';
  end if;

  -- 4 · the chart: kinds, parents, controls.
  select count(*) into v_n from public.gl_accounts a
   where (a.code, a.kind, a.parent_code, a.is_control, coalesce(a.control_for, '-')) in (
         ('1240','ASSET','1200',true,'OTHER'),
         ('1250','ASSET','1200',false,'-'),
         ('2350','LIABILITY','2000',false,'-'),
         ('2360','LIABILITY','2350',false,'-'),
         ('2370','LIABILITY','2350',false,'-'),
         ('4900','INCOME','4000',false,'-'));
  if v_n <> 6 then
    raise exception '0478 sanity: expected the six new accounts, found % matching', v_n;
  end if;
  if exists (select 1 from public.gl_accounts a join public.gl_accounts p on p.code = a.parent_code
              where p.kind <> a.kind) then
    raise exception '0478 sanity: a child account disagrees with its parent about kind';
  end if;
  if (select count(*) from public.gl_doc_series where prefix in ('ARI','RV')) <> 2 then
    raise exception '0478 sanity: ARI and RV are not both claimed';
  end if;

  -- 5 · the account rules say what the forms will offer.
  if public.fin_money_in_account_problem('1120', 'money') is not null
     or public.fin_money_in_account_problem('2360', 'money') is null
     or public.fin_money_in_account_problem('2360', 'receipt_line') is not null
     or public.fin_money_in_account_problem('2370', 'receipt_line') is not null
     or public.fin_money_in_account_problem('4900', 'receipt_line') is not null
     or public.fin_money_in_account_problem('1240', 'receipt_line') is null
     or public.fin_money_in_account_problem('1110', 'receipt_line') is null
     or public.fin_money_in_account_problem('2210', 'receipt_line') is null
     or public.fin_money_in_account_problem('4100', 'receipt_line') is null
     or public.fin_money_in_account_problem('4900', 'invoice_line') is not null
     or public.fin_money_in_account_problem('6200', 'invoice_line') is not null
     or public.fin_money_in_account_problem('2360', 'invoice_line') is null
     or public.fin_money_in_account_problem('2350', 'receipt_line') is null
     or public.fin_money_in_account_problem('4100', 'invoice_line') is null
     or public.fin_money_in_account_problem('4400', 'invoice_line') is null
     or public.fin_money_in_account_problem('1310', 'receipt_line') is null
     or public.fin_money_in_account_problem('3200', 'receipt_line') is null
     or public.fin_money_in_account_problem('3300', 'receipt_line') is null
     or public.fin_money_in_account_problem('3100', 'receipt_line') is not null
     or public.fin_money_in_account_problem('1250', 'receipt_line') is not null then
    raise exception '0478 sanity: the money-in account rules answer wrongly';
  end if;

  -- 6 · every door exists with the argument TYPES the API calls it with.
  for f in
    select * from (values
      ('finance_party_create',        'text, text, text, text, text, text, text'),
      ('finance_party_update',        'uuid, text, text, text, text, text, text, text, boolean'),
      ('other_debtor_invoice_create', 'uuid, date, jsonb, date, text, text, boolean'),
      ('other_debtor_invoice_update', 'uuid, uuid, date, jsonb, date, text, text, boolean'),
      ('other_debtor_invoice_issue',  'uuid'),
      ('other_debtor_invoice_cancel', 'uuid, text'),
      ('other_receipt_create',        'date, text, jsonb, jsonb, uuid, text, text, text, uuid'),
      ('other_receipt_void',          'uuid, text'),
      ('other_debtor_invoice_list',   'uuid'),
      ('other_debtor_outstanding',    'uuid'),
      ('other_debtor_invoice_detail', 'uuid'),
      ('other_receipt_list',          ''),
      ('other_receipt_detail',        'uuid'),
      ('fin_money_in_account_options','')
    ) as t(fname, args)
  loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = f.fname
                      and oidvectortypes(p.proargtypes) = f.args
                      and p.prosecdef) then
      raise exception '0478 sanity: %(%) is missing or not security definer', f.fname, f.args;
    end if;
  end loop;

  -- 7 · the tables are read-only from outside.
  if has_table_privilege('authenticated', 'public.other_receipts', 'insert')
     or has_table_privilege('authenticated', 'public.other_debtor_invoices', 'update')
     or has_table_privilege('authenticated', 'public.finance_parties', 'insert')
     or has_table_privilege('anon', 'public.other_receipts', 'select') then
    raise exception '0478 sanity: a new finance table is writable or anon-readable';
  end if;
  if exists (select 1 from pg_policy
              where polrelid in ('public.finance_parties'::regclass,
                                 'public.other_debtor_invoices'::regclass,
                                 'public.other_debtor_invoice_lines'::regclass,
                                 'public.other_receipts'::regclass,
                                 'public.other_receipt_lines'::regclass,
                                 'public.other_receipt_allocations'::regclass)
                and polcmd <> 'r') then
    raise exception '0478 sanity: a write policy exists on a new finance table';
  end if;

  -- 8 · the gate, probed. CUSTOMER and SUPPLIER behave exactly as before; OTHER
  --     posts to 1240 with a party and is refused without one or on the wrong
  --     side. Everything runs inside a block that always raises, so every row
  --     it writes is rolled back with it.
  select c.go_live_on into v_go_live from public.gl_config c where c.id;
  begin
    v_entry := public.gl_post('PROBE_0478', 'PROBE-0478-OTHER', v_go_live, 'OTHER probe',
      jsonb_build_array(
        jsonb_build_object('account_code', '1240', 'debit', 10, 'party_type', 'OTHER', 'party_id', v_party),
        jsonb_build_object('account_code', '4900', 'credit', 10)));
    if v_entry is null then
      raise exception '0478 sanity: an OTHER line on 1240 did not post';
    end if;

    v_probe := null;
    begin
      perform public.gl_post('PROBE_0478', 'PROBE-0478-A', v_go_live, 'probe',
        jsonb_build_array(
          jsonb_build_object('account_code', '1240', 'debit', 10, 'party_type', 'CUSTOMER', 'party_id', v_party),
          jsonb_build_object('account_code', '4900', 'credit', 10)));
    exception when others then
      get stacked diagnostics v_probe = pg_exception_detail;
    end;
    if v_probe is distinct from 'gl_post_party_type_wrong_side' then
      raise exception '0478 sanity: a CUSTOMER on 1240 was not refused as the wrong side (%)', v_probe;
    end if;

    v_probe := null;
    begin
      perform public.gl_post('PROBE_0478', 'PROBE-0478-B', v_go_live, 'probe',
        jsonb_build_array(
          jsonb_build_object('account_code', '1210', 'debit', 10, 'party_type', 'OTHER', 'party_id', v_party),
          jsonb_build_object('account_code', '4900', 'credit', 10)));
    exception when others then
      get stacked diagnostics v_probe = pg_exception_detail;
    end;
    if v_probe is distinct from 'gl_post_party_type_wrong_side' then
      raise exception '0478 sanity: an OTHER on customer receivables was not refused (%)', v_probe;
    end if;

    v_probe := null;
    begin
      perform public.gl_post('PROBE_0478', 'PROBE-0478-C', v_go_live, 'probe',
        jsonb_build_array(
          jsonb_build_object('account_code', '1240', 'debit', 10),
          jsonb_build_object('account_code', '4900', 'credit', 10)));
    exception when others then
      get stacked diagnostics v_probe = pg_exception_detail;
    end;
    if v_probe is distinct from 'gl_post_control_account_needs_party' then
      raise exception '0478 sanity: 1240 without a party was not refused (%)', v_probe;
    end if;

    v_probe := null;
    begin
      perform public.gl_post('PROBE_0478', 'PROBE-0478-D', v_go_live, 'probe',
        jsonb_build_array(
          jsonb_build_object('account_code', '6900', 'debit', 10, 'party_type', 'LENDER', 'party_id', v_party),
          jsonb_build_object('account_code', '1110', 'credit', 10)));
    exception when others then
      get stacked diagnostics v_probe = pg_exception_detail;
    end;
    if v_probe is distinct from 'gl_post_line_party_type_unknown' then
      raise exception '0478 sanity: an unknown party type was not refused (%)', v_probe;
    end if;

    -- SUPPLIER on supplier claims and CUSTOMER on trade receivables still post.
    if public.gl_post('PROBE_0478', 'PROBE-0478-E', v_go_live, 'probe',
         jsonb_build_array(
           jsonb_build_object('account_code', '1220', 'debit', 10, 'party_type', 'SUPPLIER', 'party_id', v_party),
           jsonb_build_object('account_code', '1210', 'credit', 10, 'party_type', 'CUSTOMER', 'party_id', v_party)))
       is null then
      raise exception '0478 sanity: a CUSTOMER/SUPPLIER entry stopped posting';
    end if;

    -- The OTHER entry reverses like any other.
    if public.gl_reverse(v_entry, 'probe') is null then
      raise exception '0478 sanity: an OTHER entry could not be reversed';
    end if;

    raise exception 'gl_0478_probe_rollback';
  exception when others then
    if sqlerrm <> 'gl_0478_probe_rollback' then
      raise;
    end if;
  end;

  raise notice '0478 OK: a third kind of party, other debtor invoices and other receipts reach the ledger';
end $sanity$;
