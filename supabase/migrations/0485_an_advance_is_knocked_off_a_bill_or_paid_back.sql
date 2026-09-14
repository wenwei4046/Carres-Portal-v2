-- =============================================================================
-- 0485_an_advance_is_knocked_off_a_bill_or_paid_back.sql
-- ACCOUNTS PAYABLE · SUPPLIER ADVANCE, PART 2 — THE DOORS: KNOCK AN ADVANCE
-- OFF A BILL, TAKE IT OFF AGAIN, RECORD MONEY BACK, CANCEL MONEY BACK; AND THE
-- READERS THAT SHOW THEM
-- (owner rulings 11 Sep 2026: an advance is knocked off the supplier's bill
--  later; a factory order cancelled after an advance EITHER gets cash back OR
--  keeps the advance as credit — both supported. Builds on 0484.)
--
-- WHAT WAS MISSING
--   0484 lets a voucher pay an advance and gives the two tables that record
--   what happens to it next, but nothing could write them. After this file:
--     · CREDIT (the advance stays open) needs no act at all: an approved
--       advance with nothing knocked off stays open, is listed on the supplier
--       (supplier_advances, ap_outstanding.advance_open) and is knocked off a
--       later bill with supplier_advance_apply.
--     · CASH BACK is supplier_advance_money_back_record: money returns to a
--       Carres money account and closes that much of the advance.
--
-- WHAT THIS BUILDS
--   A. supplier_advance_apply(voucher, bill, amount) — finance or principal.
--      Locks the advance's voucher, then the bill, and refuses: a voucher with
--      no advance; an advance not yet approved (it is not money yet); a bill
--      that is not confirmed; another supplier's bill; a bill on a different
--      payables account from the advance (2110 vs 2120 — the two halves
--      would sit on different accounts); an advance already knocked off this
--      bill (take it off first); more than the advance has left
--      (supplier_advance_open); more than the bill has left to pay — total
--      less what is paid or on a voucher (ap_bill_paid.held, the same ceiling
--      a voucher allocation meets). Posts NOTHING.
--   B. supplier_advance_application_cancel(application, reason) — finance or
--      principal, with a reason. The bill owes that money again and the
--      advance has it back. Posts nothing.
--   C. supplier_advance_money_back_record(voucher, date, money account,
--      amount, reference, narration, idempotency key) — finance or principal.
--      Money-in pattern (0478 other_receipt_create): a double press with the
--      same key finds the first record — and the same key sent with a
--      different voucher, amount, account or date is refused
--      (idempotency_mismatch), never answered with the first record; the date
--      may not be before the ledger start or before the advance was paid; the
--      account must be a money account; the amount may not exceed what the
--      advance has left. Number <prefix>-YYYYMMDD-RRRR, drawn at random (the
--      formal document code, as PV); the prefix is written once, in
--      supplier_money_back_prefix() (section 2 — SMB, YH's ruling of 14 Sep 2026).
--   D. supplier_advance_money_back_cancel(money back, reason) — the finance
--      approver, with a reason; gl_reverse on the original date (0478
--      other_receipt_void).
--   E. Readers:
--      · supplier_advances(supplier) — every approved advance: paid, knocked
--        off, back, left.
--      · payment_voucher_document — the advance, its knock-offs, its money
--        back, and what the reader may do (apply, take off, money back,
--        cancel money back). `cancel` is false while the advance is in use.
--      · payment_voucher_register — two more columns: advance_amount and
--        advance_open. The result changes, so it is dropped and recreated.
--      · supplier_bill_document — its Paid and on-a-voucher totals now read
--        ap_bill_paid (the seventh copy 0484 left for this file); its Payments
--        list the advances knocked off it; it says whether an advance can be
--        applied.
--   F. History: four more actions on ap_document_events — advance_applied,
--      advance_taken_off, money_back, money_back_cancelled.
--
-- DR / CR, PER ACTION (proven by the probe, reading gl_entry_lines)
--   Knock an advance off a bill — NOTHING. The advance (Dr, 0484) and the bill
--       (Cr, 0477) are already on the same payables control and party; the
--       knock-off only says which bill the debit settles.
--   Take it off again — NOTHING.
--   Record money back — source SUPPLIER_MONEY_BACK, dated the money-back date:
--       Dr  the money account the supplier paid into
--       Cr  the advance's payables control (2110 / 2120), party = the supplier
--   Cancel money back (approver) — gl_reverse: source
--       SUPPLIER_MONEY_BACK_REVERSAL on the ORIGINAL date.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   · No "credit note" document. Keeping the advance as credit IS the open
--     advance; no act, no second record of the same money.
--   · No automatic knock-off when a bill is confirmed. Which advance settles
--     which bill is finance's decision; the bill says an advance is waiting.
--   · No money back for an advance that is not approved: a draft advance is
--     not money yet — change the draft instead.
--   · No row changed, no row deleted. The events constraint is replaced by a
--     wider one; every existing row satisfies both.
--
-- RLS / PERMISSIONS — what changes and why
--   · ap_document_events: its action CHECK constraint is dropped and re-added
--     with four more values (a superset). No policy and no grant changes.
--   · gl_doc_series: one register row, the money-back prefix. No policy or
--     grant change.
--   · supplier_money_back_prefix(): a new invoker function returning a
--     constant. Execute is revoked from public, anon and authenticated — only
--     the definer door that numbers a money back (run as its owner) calls it.
--   · The four doors and supplier_advances: execute revoked from public and
--     anon, granted to authenticated — each checks its caller itself (finance
--     or principal; the finance approver to cancel money back). gl_post and
--     gl_reverse stay revoked from authenticated (0468): only these definer
--     doors reach them.
--   · payment_voucher_register is dropped and recreated (new result columns);
--     its 0477 grants are re-applied exactly. payment_voucher_document and
--     supplier_bill_document are create or replace: grants unchanged.
-- =============================================================================


-- ── 1 · history gets the four new acts ───────────────────────────────────────
-- The 0477 check was written inline, so its name was generated. Find it by
-- what it checks, drop it, and put back the same list plus four.
do $widen$
declare
  r record;
begin
  for r in select c.conname
             from pg_constraint c
            where c.conrelid = 'public.ap_document_events'::regclass
              and c.contype = 'c'
              and pg_get_constraintdef(c.oid) like 'CHECK ((action = ANY%'
  loop
    execute format('alter table public.ap_document_events drop constraint %I', r.conname);
  end loop;
end
$widen$;

alter table public.ap_document_events
  add constraint ap_document_events_action_check
  check (action in ('created','edited','confirmed','prepared','checked','approved',
                    'rejected','cancelled','file_added',
                    'advance_applied','advance_taken_off','money_back','money_back_cancelled'));

comment on table public.ap_document_events is
  '0477 + 0485: the history of a supplier bill or payment voucher — created, changed, confirmed, prepared, checked, approved, returned, cancelled, file added; and (0485) an advance applied to a bill or taken off it, money back recorded or cancelled. Append-only.';


-- ── 2 · the money-back number ────────────────────────────────────────────────
-- The prefix is written ONCE, in this function: the series row below, the
-- numbering in section 5 and the sanity check all read it.
-- SMB = supplier money back. YH ruled it on 14 Sep 2026.
-- Checked on 2026-09-14 against main and every remote branch: gl_doc_series
-- holds ARI JE MJ PV RV SB; allocate_formal_document_code is called with ARI
-- GRN MPR PO PV RO RV SB TR; no code, test or migration uses SMB. The primary
-- key refuses a second claim, so a collision fails here instead of sharing a
-- series.
create or replace function public.supplier_money_back_prefix()
returns text
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select 'SMB'::text
$fn$;

comment on function public.supplier_money_back_prefix() is
  '0485: the one place the supplier money-back number prefix is written.';

insert into public.gl_doc_series (prefix, description)
values (public.supplier_money_back_prefix(),
        'Supplier money back — part of an advance a supplier sent back (0485)');


-- ── 3 · knock an advance off a bill ──────────────────────────────────────────
create or replace function public.supplier_advance_apply(p_voucher_id uuid, p_bill_id uuid, p_amount numeric)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := public.app_role()::text;
  v_me   uuid := (select u.id from public.app_users u where u.id = auth.uid());
  v_v    public.payment_vouchers%rowtype;
  v_bill public.supplier_bills%rowtype;
  v_open numeric(12,2);
  v_left numeric(12,2);
  v_id   uuid;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance applies an advance to a bill.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'The amount must be more than RM 0.00.'
      using errcode = 'P0001', detail = 'amount_invalid';
  end if;
  if round(p_amount, 2) <> p_amount then
    raise exception 'Type the amount in ringgit and sen, like 1250.00.'
      using errcode = 'P0001', detail = 'amount_invalid';
  end if;

  -- The advance first, then the bill. The allocation ceiling locks a bill and
  -- then a DRAFT voucher; this locks an APPROVED voucher and then a bill, so
  -- the two never hold each other's rows.
  select * into v_v from public.payment_vouchers where id = p_voucher_id for update;
  if not found then
    raise exception 'That payment voucher does not exist.'
      using errcode = 'P0002', detail = 'voucher_missing';
  end if;
  if v_v.advance_amount = 0 then
    raise exception 'Payment voucher % carries no advance.', coalesce(v_v.voucher_no, 'in draft')
      using errcode = 'P0001', detail = 'no_advance';
  end if;
  if v_v.status <> 'approved' then
    raise exception 'The advance on % is not paid yet. It can be applied to a bill once the voucher is approved.',
      coalesce(v_v.voucher_no, 'this voucher')
      using errcode = 'P0001', detail = 'advance_not_paid';
  end if;

  select * into v_bill from public.supplier_bills where id = p_bill_id for update;
  if not found then
    raise exception 'That bill does not exist.'
      using errcode = 'P0002', detail = 'bill_missing';
  end if;
  if v_bill.status <> 'confirmed' then
    raise exception 'Bill % is not confirmed. An advance is applied only to a confirmed bill.',
      coalesce(v_bill.bill_no, 'for invoice ' || v_bill.supplier_invoice_no)
      using errcode = 'P0001', detail = 'bill_not_confirmed';
  end if;
  if v_bill.supplier_id <> v_v.supplier_id then
    raise exception 'Bill % belongs to a different supplier. An advance is applied only to its own supplier''s bills.',
      v_bill.bill_no
      using errcode = 'P0001', detail = 'supplier_mismatch';
  end if;
  if v_bill.ap_account_code <> v_v.ap_account_code then
    raise exception 'Bill % is in account %, but the advance on % is in account %. They cannot be matched.',
      v_bill.bill_no, v_bill.ap_account_code, v_v.voucher_no, v_v.ap_account_code
      using errcode = 'P0001', detail = 'ap_account_mismatch';
  end if;
  if exists (select 1 from public.supplier_advance_applications a
              where a.voucher_id = p_voucher_id and a.bill_id = p_bill_id and a.status = 'applied') then
    raise exception 'The advance on % is already applied to bill %. Take it off first to change the amount.',
      v_v.voucher_no, v_bill.bill_no
      using errcode = 'P0001', detail = 'already_applied';
  end if;

  v_open := coalesce((select ao.advance_open from public.supplier_advance_open(p_voucher_id) ao), 0);
  if p_amount > v_open then
    raise exception 'Only RM % of the advance on % is left. RM % is more than that.',
      to_char(v_open, 'FM999,999,999,990.00'), v_v.voucher_no,
      to_char(p_amount, 'FM999,999,999,990.00')
      using errcode = 'P0001', detail = 'advance_over_applied';
  end if;

  -- The bill's ceiling is the one a voucher allocation meets: what is not
  -- yet paid AND not already on a voucher waiting to be approved.
  v_left := v_bill.total_amount - coalesce((select bp.held from public.ap_bill_paid(p_bill_id) bp), 0);
  if p_amount > v_left then
    raise exception 'Bill % has RM % left to pay. RM % is more than that.',
      v_bill.bill_no, to_char(v_left, 'FM999,999,999,990.00'),
      to_char(p_amount, 'FM999,999,999,990.00')
      using errcode = 'P0001', detail = 'bill_over_applied';
  end if;

  insert into public.supplier_advance_applications (voucher_id, bill_id, amount, created_by)
  values (p_voucher_id, p_bill_id, p_amount, v_me)
  returning id into v_id;

  perform public._ap_event('PAYMENT_VOUCHER', p_voucher_id, 'advance_applied',
                           v_bill.bill_no || ' · ' || public.fin_rm(p_amount));
  perform public._ap_event('SUPPLIER_BILL', p_bill_id, 'advance_applied',
                           v_v.voucher_no || ' · ' || public.fin_rm(p_amount));
  return v_id;
end;
$fn$;

comment on function public.supplier_advance_apply(uuid, uuid, numeric) is
  '0485: knocks part of an approved advance off a confirmed bill of the same supplier and payables account. Finance or principal. Capped by the advance left (supplier_advance_open) and the bill left to pay (ap_bill_paid.held). Posts nothing.';


-- ── 4 · take it off again ────────────────────────────────────────────────────
create or replace function public.supplier_advance_application_cancel(p_application_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := public.app_role()::text;
  v_me   uuid := (select u.id from public.app_users u where u.id = auth.uid());
  v_a    public.supplier_advance_applications%rowtype;
  v_pv   text;
  v_bill text;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance takes an advance off a bill.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Say why the advance is taken off this bill.'
      using errcode = 'P0001', detail = 'reason_missing';
  end if;

  select * into v_a from public.supplier_advance_applications where id = p_application_id for update;
  if not found then
    raise exception 'That advance on a bill does not exist.'
      using errcode = 'P0002', detail = 'application_missing';
  end if;
  if v_a.status <> 'applied' then
    raise exception 'This advance is already taken off the bill.'
      using errcode = 'P0001', detail = 'already_cancelled';
  end if;

  update public.supplier_advance_applications
     set status        = 'cancelled',
         cancelled_at  = now(),
         cancelled_by  = v_me,
         cancel_reason = btrim(p_reason)
   where id = p_application_id;

  select v.voucher_no into v_pv from public.payment_vouchers v where v.id = v_a.voucher_id;
  select coalesce(b.bill_no, b.supplier_invoice_no) into v_bill from public.supplier_bills b where b.id = v_a.bill_id;
  perform public._ap_event('PAYMENT_VOUCHER', v_a.voucher_id, 'advance_taken_off',
                           v_bill || ' · ' || public.fin_rm(v_a.amount) || ' · ' || btrim(p_reason));
  perform public._ap_event('SUPPLIER_BILL', v_a.bill_id, 'advance_taken_off',
                           v_pv || ' · ' || public.fin_rm(v_a.amount) || ' · ' || btrim(p_reason));
  return p_application_id;
end;
$fn$;

comment on function public.supplier_advance_application_cancel(uuid, text) is
  '0485: takes an advance back off a bill, with a reason. Finance or principal. The bill owes that money again; the advance has it back. Posts nothing.';


-- ── 5 · money back ───────────────────────────────────────────────────────────
create or replace function public.supplier_advance_money_back_record(
  p_voucher_id         uuid,
  p_money_back_date    date,
  p_money_account_code text,
  p_amount             numeric,
  p_reference          text default null,
  p_narration          text default null,
  p_idempotency_key    uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     text := public.app_role()::text;
  v_me       uuid := (select u.id from public.app_users u where u.id = auth.uid());
  v_seen     public.supplier_advance_money_back%rowtype;
  v_v        public.payment_vouchers%rowtype;
  v_money    text := btrim(coalesce(p_money_account_code, ''));
  v_ref      text := nullif(btrim(coalesce(p_reference, '')), '');
  v_narr     text := nullif(btrim(coalesce(p_narration, '')), '');
  v_supplier text;
  v_open     numeric(12,2);
  v_id       uuid;
  v_no       text;
  v_entry    uuid;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance records money back.'
      using errcode = '42501', detail = 'not_finance';
  end if;

  -- A double press sends the same key twice. The lock queues the second call
  -- behind the first, and the second finds the first's record (0478 pattern).
  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('supplier_money_back:' || p_idempotency_key::text, 0));
    select m.* into v_seen from public.supplier_advance_money_back m
     where m.idempotency_key = p_idempotency_key;
    if found then
      -- The same key must carry the same money back. A key re-sent with a
      -- different voucher, amount, account or date is not a double press: say
      -- so, never hand back a record that is not what the person typed.
      if v_seen.voucher_id <> p_voucher_id
         or v_seen.amount <> p_amount
         or v_seen.money_account_code <> btrim(coalesce(p_money_account_code, ''))
         or v_seen.money_back_date is distinct from p_money_back_date then
        raise exception 'This money back was already recorded as % with different details. Open the form again to record another.',
          v_seen.money_back_no
          using errcode = 'P0001', detail = 'idempotency_mismatch';
      end if;
      return v_seen.id;
    end if;
  end if;

  if p_money_back_date is null then
    raise exception 'Type the date the money came back.'
      using errcode = 'P0001', detail = 'date_missing';
  end if;
  perform public.ap_refuse_before_go_live(p_money_back_date, 'This money back');
  perform public._ap_require_account(v_money, 'pay_from', 'Received into');
  if p_amount is null or p_amount <= 0 then
    raise exception 'The amount must be more than RM 0.00.'
      using errcode = 'P0001', detail = 'amount_invalid';
  end if;
  if round(p_amount, 2) <> p_amount then
    raise exception 'Type the amount in ringgit and sen, like 1250.00.'
      using errcode = 'P0001', detail = 'amount_invalid';
  end if;

  select * into v_v from public.payment_vouchers where id = p_voucher_id for update;
  if not found then
    raise exception 'That payment voucher does not exist.'
      using errcode = 'P0002', detail = 'voucher_missing';
  end if;
  if v_v.advance_amount = 0 then
    raise exception 'Payment voucher % carries no advance.', coalesce(v_v.voucher_no, 'in draft')
      using errcode = 'P0001', detail = 'no_advance';
  end if;
  if v_v.status <> 'approved' then
    raise exception 'The advance on % is not paid yet, so no money can come back from it.',
      coalesce(v_v.voucher_no, 'this voucher')
      using errcode = 'P0001', detail = 'advance_not_paid';
  end if;
  if p_money_back_date < v_v.voucher_date then
    raise exception 'The money cannot come back before the advance was paid on %.',
      to_char(v_v.voucher_date, 'DD Mon YYYY')
      using errcode = 'P0001', detail = 'money_back_before_advance';
  end if;

  v_open := coalesce((select ao.advance_open from public.supplier_advance_open(p_voucher_id) ao), 0);
  if p_amount > v_open then
    raise exception 'Only RM % of the advance on % is left. RM % is more than that.',
      to_char(v_open, 'FM999,999,999,990.00'), v_v.voucher_no,
      to_char(p_amount, 'FM999,999,999,990.00')
      using errcode = 'P0001', detail = 'money_back_over_advance';
  end if;

  select s.name into v_supplier from public.suppliers s where s.id = v_v.supplier_id;
  v_id := gen_random_uuid();
  v_no := public.allocate_formal_document_code(public.supplier_money_back_prefix(), v_id::text, p_money_back_date);

  -- Dr the money account; Cr the advance's own payables control, party = the
  -- supplier. The supplier's payables balance rises by what came back.
  v_entry := public.gl_post(
    'SUPPLIER_MONEY_BACK',
    v_no,
    p_money_back_date,
    coalesce(v_narr, 'Money back ' || v_no || ' · ' || v_supplier),
    jsonb_build_array(
      jsonb_build_object(
        'account_code', v_money,
        'debit',  p_amount,
        'credit', 0,
        'memo',   concat_ws(' · ', 'Money back ' || v_no, v_ref, v_supplier)),
      jsonb_build_object(
        'account_code', v_v.ap_account_code,
        'debit',  0,
        'credit', p_amount,
        'party_type', 'SUPPLIER',
        'party_id',   v_v.supplier_id,
        'memo',   'Advance · ' || v_v.voucher_no)));

  insert into public.supplier_advance_money_back
    (id, money_back_no, voucher_id, money_back_date, money_account_code, amount,
     reference, narration, status, gl_entry_id, idempotency_key, created_by)
  values
    (v_id, v_no, p_voucher_id, p_money_back_date, v_money, p_amount,
     v_ref, v_narr, 'posted', v_entry, p_idempotency_key, v_me);

  perform public._ap_event('PAYMENT_VOUCHER', p_voucher_id, 'money_back',
                           v_no || ' · ' || public.fin_rm(p_amount));
  return v_id;
end;
$fn$;

comment on function public.supplier_advance_money_back_record(uuid, date, text, numeric, text, text, uuid) is
  '0485: records money a supplier sent back out of an approved advance. Finance or principal. Numbered with supplier_money_back_prefix(); posts Dr money account / Cr the advance''s payables control (party = supplier). Capped by the advance left. Idempotent on p_idempotency_key.';

create or replace function public.supplier_advance_money_back_cancel(p_money_back_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_m        public.supplier_advance_money_back%rowtype;
  v_reversal uuid;
begin
  if not public.has_finance_approver(auth.uid()) then
    raise exception 'Cancelling money back takes the finance approver.'
      using errcode = '42501', detail = 'not_finance_approver';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Say why this money back is cancelled.'
      using errcode = 'P0001', detail = 'reason_missing';
  end if;

  select * into v_m from public.supplier_advance_money_back where id = p_money_back_id for update;
  if not found then
    raise exception 'That money back does not exist.'
      using errcode = 'P0002', detail = 'money_back_missing';
  end if;
  if v_m.status = 'voided' then
    raise exception 'This money back is already cancelled.'
      using errcode = 'P0001', detail = 'already_cancelled';
  end if;

  -- The contra on the ORIGINAL date (gl_reverse). The advance has the money
  -- again: it may be knocked off a bill, or come back another day.
  v_reversal := public.gl_reverse(v_m.gl_entry_id, btrim(p_reason));

  update public.supplier_advance_money_back
     set status            = 'voided',
         reversal_entry_id = v_reversal,
         voided_at         = now(),
         voided_by         = auth.uid(),
         void_reason       = btrim(p_reason)
   where id = p_money_back_id;

  perform public._ap_event('PAYMENT_VOUCHER', v_m.voucher_id, 'money_back_cancelled',
                           v_m.money_back_no || ' · ' || btrim(p_reason));
  return v_reversal;
end;
$fn$;

comment on function public.supplier_advance_money_back_cancel(uuid, text) is
  '0485: cancels money back — the finance approver, with a reason. gl_reverse on the original date; the advance has that money left again.';


-- ── 6 · readers ──────────────────────────────────────────────────────────────

-- 6a · every approved advance, and what is left of it.
create or replace function public.supplier_advances(p_supplier_id uuid default null)
returns table (voucher_id uuid, voucher_no text, supplier_id uuid, supplier_name text,
               supplier_kind text, voucher_date date, ap_account_code text,
               advance_amount numeric, applied_total numeric, money_back_total numeric,
               advance_open numeric)
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
  select ao.voucher_id, v.voucher_no, ao.supplier_id, s.name, s.kind::text,
         v.voucher_date, ao.ap_account_code,
         ao.advance_amount, ao.applied_total, ao.money_back_total, ao.advance_open
    from public.supplier_advance_open() ao
    join public.payment_vouchers v on v.id = ao.voucher_id
    join public.suppliers s on s.id = ao.supplier_id
   where p_supplier_id is null or ao.supplier_id = p_supplier_id
   order by v.voucher_date, v.voucher_no;
end;
$fn$;

comment on function public.supplier_advances(uuid) is
  '0485: every approved advance — paid, applied to bills, money back, left (supplier_advance_open). Finance and principal only.';

-- 6b · the voucher document, with its advance.
create or replace function public.payment_voucher_document(p_voucher_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_v        public.payment_vouchers%rowtype;
  v_me       uuid := auth.uid();
  v_role     text := public.app_role()::text;
  v_finance  boolean;
  v_approver boolean;
  v_adv      record;
  v_in_use   boolean := false;
begin
  if not public.gl_may_read() then
    raise exception 'accounts payable is internal'
      using errcode = '42501', detail = 'not_internal';
  end if;
  select * into v_v from public.payment_vouchers where id = p_voucher_id;
  if not found then
    raise exception 'That payment voucher does not exist.'
      using errcode = 'P0002', detail = 'voucher_missing';
  end if;

  v_finance  := coalesce(v_role in ('finance','principal'), false);
  v_approver := public.has_finance_approver(v_me);

  -- What is left of the advance (0484 law D). Null until the voucher is
  -- approved: before that the advance is a plan, not money.
  select ao.applied_total, ao.money_back_total, ao.advance_open into v_adv
    from public.supplier_advance_open(p_voucher_id) ao;
  v_in_use := v_adv.advance_open is not null and v_adv.advance_open < v_v.advance_amount;

  return jsonb_build_object(
    'voucher', (
      select to_jsonb(x) from (
        select v.id, v.voucher_no, v.status, v.purpose, v.supplier_id,
               s.name as supplier_name, s.kind::text as supplier_kind, v.payee_name,
               v.voucher_date, v.amount, v.advance_amount,
               v.ap_account_code, apc.name as ap_account_name,
               v.pay_method, v.pay_reference,
               v.pay_from_account_code, a.name as pay_from_name, v.narration,
               v.created_at, cr.name as created_by_name,
               v.prepared_at, pu.name as prepared_by_name,
               v.checked_at, cu.name as checked_by_name,
               v.approved_at, au.name as approved_by_name,
               v.rejected_at, ru.name as rejected_by_name, v.reject_reason,
               v.cancelled_at, xu.name as cancelled_by_name, v.cancel_reason,
               e.entry_no as entry_no, re.entry_no as reversal_entry_no
          from public.payment_vouchers v
          left join public.suppliers s   on s.id = v.supplier_id
          left join public.gl_accounts a on a.code = v.pay_from_account_code
          left join public.gl_accounts apc on apc.code = v.ap_account_code
          left join public.app_users cr on cr.id = v.created_by
          left join public.app_users pu on pu.id = v.prepared_by
          left join public.app_users cu on cu.id = v.checked_by
          left join public.app_users au on au.id = v.approved_by
          left join public.app_users ru on ru.id = v.rejected_by
          left join public.app_users xu on xu.id = v.cancelled_by
          left join public.gl_entries e  on e.id = v.gl_entry_id
          left join public.gl_entries re on re.id = v.reversal_entry_id
         where v.id = p_voucher_id) x),
    'lines', coalesce((
      select jsonb_agg(to_jsonb(y) order by y.line_no) from (
        select l.line_no, l.account_code, ac.name as account_name, l.description, l.amount
          from public.payment_voucher_lines l
          left join public.gl_accounts ac on ac.code = l.account_code
         where l.voucher_id = p_voucher_id) y), '[]'::jsonb),
    'allocations', coalesce((
      select jsonb_agg(to_jsonb(z) order by z.bill_date, z.bill_no) from (
        select al.bill_id, b.bill_no, b.supplier_invoice_no, b.bill_date, b.due_date,
               b.total_amount as bill_total, b.ap_account_code, al.amount_applied
          from public.payment_voucher_allocations al
          join public.supplier_bills b on b.id = al.bill_id
         where al.voucher_id = p_voucher_id) z), '[]'::jsonb),
    'advance', case when v_v.advance_amount > 0 then jsonb_build_object(
      'advance_amount',   v_v.advance_amount,
      'applied_total',    coalesce(v_adv.applied_total, 0),
      'money_back_total', coalesce(v_adv.money_back_total, 0),
      'advance_open',     v_adv.advance_open,
      'applications', coalesce((
        select jsonb_agg(to_jsonb(ap) order by ap.created_at) from (
          select sa.id, sa.bill_id, b.bill_no, b.supplier_invoice_no, b.bill_date,
                 sa.amount, sa.status, sa.created_at, cu.name as created_by_name,
                 sa.cancelled_at, xu.name as cancelled_by_name, sa.cancel_reason
            from public.supplier_advance_applications sa
            join public.supplier_bills b on b.id = sa.bill_id
            left join public.app_users cu on cu.id = sa.created_by
            left join public.app_users xu on xu.id = sa.cancelled_by
           where sa.voucher_id = p_voucher_id) ap), '[]'::jsonb),
      'money_back', coalesce((
        select jsonb_agg(to_jsonb(mb) order by mb.money_back_date, mb.money_back_no) from (
          select m.id, m.money_back_no, m.money_back_date, m.money_account_code,
                 ma.name as money_account_name, m.amount, m.reference, m.narration, m.status,
                 e.entry_no, re.entry_no as reversal_entry_no,
                 m.created_at, cu.name as created_by_name,
                 m.voided_at, xu.name as voided_by_name, m.void_reason
            from public.supplier_advance_money_back m
            left join public.gl_accounts ma on ma.code = m.money_account_code
            left join public.gl_entries e  on e.id = m.gl_entry_id
            left join public.gl_entries re on re.id = m.reversal_entry_id
            left join public.app_users cu on cu.id = m.created_by
            left join public.app_users xu on xu.id = m.voided_by
           where m.voucher_id = p_voucher_id) mb), '[]'::jsonb)
    ) end,
    'files', coalesce((
      select jsonb_agg(to_jsonb(f) order by f.uploaded_at) from (
        select fl.id, fl.file_name, fl.mime_type, fl.size_bytes, fl.storage_path,
               fl.uploaded_at, u.name as uploaded_by_name
          from public.ap_document_files fl
          left join public.app_users u on u.id = fl.uploaded_by
         where fl.document_type = 'PAYMENT_VOUCHER' and fl.document_id = p_voucher_id) f), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(to_jsonb(ev) order by ev.at) from (
        select e.action, e.note, e.at, u.name as actor_name
          from public.ap_document_events e
          left join public.app_users u on u.id = e.actor
         where e.document_type = 'PAYMENT_VOUCHER' and e.document_id = p_voucher_id) ev), '[]'::jsonb),
    'go_live_on', (select gc.go_live_on from public.gl_config gc where gc.id),
    'you_prepared', v_v.prepared_by is not null and v_v.prepared_by = v_me,
    'can', jsonb_build_object(
      'edit',     v_v.status = 'draft' and v_finance,
      'prepare',  v_v.status = 'draft' and v_finance,
      'check',    v_v.status = 'prepared' and v_finance
                  and v_v.prepared_by is distinct from v_me,
      'approve',  v_v.status = 'checked' and v_approver
                  and v_v.prepared_by is distinct from v_me,
      'reject',   v_v.status in ('prepared','checked') and (v_finance or v_approver),
      'cancel',   case v_v.status
                    when 'approved' then v_approver and not v_in_use
                    when 'cancelled' then false
                    else v_finance end,
      'add_file', v_v.status <> 'cancelled' and v_finance,
      'apply_advance',     v_v.status = 'approved' and v_finance and coalesce(v_adv.advance_open, 0) > 0,
      'take_advance_off',  v_v.status = 'approved' and v_finance,
      'money_back',        v_v.status = 'approved' and v_finance and coalesce(v_adv.advance_open, 0) > 0,
      'cancel_money_back', v_v.status = 'approved' and v_approver)
  );
end;
$fn$;

-- 6c · the register: what each voucher advanced, and what is left of it.
drop function if exists public.payment_voucher_register();

create function public.payment_voucher_register()
returns table (id uuid, voucher_no text, status text, purpose text, supplier_id uuid,
               supplier_name text, payee_name text, voucher_date date, amount numeric,
               pay_method text, pay_reference text, pay_from_account_code text,
               pay_from_name text, bill_nos text, line_count integer,
               prepared_by_name text, checked_by_name text, approved_by_name text,
               file_count integer, created_at timestamp with time zone,
               advance_amount numeric, advance_open numeric)
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
  select v.id, v.voucher_no, v.status, v.purpose, v.supplier_id, s.name, v.payee_name,
         v.voucher_date, v.amount, v.pay_method, v.pay_reference,
         v.pay_from_account_code, a.name,
         (select string_agg(coalesce(b.bill_no, b.supplier_invoice_no), ', ' order by b.bill_date)
            from public.payment_voucher_allocations al
            join public.supplier_bills b on b.id = al.bill_id
           where al.voucher_id = v.id),
         (select count(*) from public.payment_voucher_lines l where l.voucher_id = v.id)::integer,
         pu.name, cu.name, au.name,
         (select count(*) from public.ap_document_files fl
           where fl.document_type = 'PAYMENT_VOUCHER' and fl.document_id = v.id)::integer,
         v.created_at,
         v.advance_amount,
         ao.advance_open
    from public.payment_vouchers v
    left join public.suppliers s  on s.id = v.supplier_id
    left join public.gl_accounts a on a.code = v.pay_from_account_code
    left join public.app_users pu on pu.id = v.prepared_by
    left join public.app_users cu on cu.id = v.checked_by
    left join public.app_users au on au.id = v.approved_by
    left join public.supplier_advance_open() ao on ao.voucher_id = v.id
   order by v.created_at desc;
end;
$fn$;

-- 6d · the bill document: paid through the helper; advances in its Payments.
create or replace function public.supplier_bill_document(p_bill_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_bill      public.supplier_bills%rowtype;
  v_role      text := public.app_role()::text;
  v_finance   boolean;
  v_approver  boolean;
  v_paid      numeric(12,2);
  v_allocated numeric(12,2);
  v_adv_open  numeric(12,2);
begin
  if not public.gl_may_read() then
    raise exception 'accounts payable is internal'
      using errcode = '42501', detail = 'not_internal';
  end if;
  select * into v_bill from public.supplier_bills where id = p_bill_id;
  if not found then
    raise exception 'That bill does not exist.'
      using errcode = 'P0002', detail = 'bill_missing';
  end if;

  v_finance  := coalesce(v_role in ('finance','principal'), false);
  v_approver := public.has_finance_approver(auth.uid());

  -- 0484 law D: paid and held come from the one arithmetic.
  select coalesce(bp.paid, 0), coalesce(bp.held, 0) into v_paid, v_allocated
    from (select 1) one
    left join public.ap_bill_paid(p_bill_id) bp on true;

  -- Advances this supplier has left on the same payables account: the ones
  -- that could settle this bill.
  select coalesce(sum(ao.advance_open), 0) into v_adv_open
    from public.supplier_advance_open() ao
   where ao.supplier_id = v_bill.supplier_id
     and ao.ap_account_code = v_bill.ap_account_code;

  return jsonb_build_object(
    'bill', (
      select to_jsonb(x) from (
        select b.id, b.bill_no, b.status, b.supplier_id, s.name as supplier_name,
               s.kind::text as supplier_kind, b.supplier_invoice_no, b.bill_date,
               b.due_date, b.po_id, b.ap_account_code, ap.name as ap_account_name,
               b.total_amount, b.narration, b.cancel_reason,
               b.created_at, cu.name as created_by_name,
               b.confirmed_at, fu.name as confirmed_by_name,
               b.cancelled_at, xu.name as cancelled_by_name,
               e.entry_no as entry_no, re.entry_no as reversal_entry_no
          from public.supplier_bills b
          join public.suppliers s on s.id = b.supplier_id
          left join public.gl_accounts ap on ap.code = b.ap_account_code
          left join public.app_users cu on cu.id = b.created_by
          left join public.app_users fu on fu.id = b.confirmed_by
          left join public.app_users xu on xu.id = b.cancelled_by
          left join public.gl_entries e  on e.id = b.gl_entry_id
          left join public.gl_entries re on re.id = b.reversal_entry_id
         where b.id = p_bill_id) x),
    'lines', coalesce((
      select jsonb_agg(to_jsonb(y) order by y.line_no) from (
        select bl.line_no, bl.account_code, a.name as account_name, bl.description, bl.sku,
               bl.qty, bl.unit_price, bl.amount, bl.warehouse_receipt_id,
               to_jsonb(r) ->> 'grn_no' as grn_no, r.po_id as grn_po_id, bl.po_line_id,
               pol.cost::numeric(12,2) as po_unit_cost,
               case when pol.cost is not null and bl.unit_price is not null
                    then (bl.unit_price - pol.cost)::numeric(12,2) end as price_diff
          from public.supplier_bill_lines bl
          left join public.gl_accounts a on a.code = bl.account_code
          left join public.warehouse_receipts r on r.id = bl.warehouse_receipt_id
          left join public.purchase_order_lines pol on pol.id = bl.po_line_id
         where bl.bill_id = p_bill_id) y), '[]'::jsonb),
    -- A voucher that pays the bill, and (0485) an advance applied to it.
    'payments', coalesce((
      select jsonb_agg(to_jsonb(z) order by z.sort_date, z.voucher_no) from (
        select 'voucher'::text as kind, null::uuid as application_id,
               pv.id as voucher_id, pv.voucher_no, pv.status, pv.voucher_date,
               null::date as applied_on, al.amount_applied,
               pv.voucher_date as sort_date
          from public.payment_voucher_allocations al
          join public.payment_vouchers pv on pv.id = al.voucher_id
         where al.bill_id = p_bill_id
        union all
        select 'advance'::text, sa.id,
               pv.id, pv.voucher_no, sa.status, pv.voucher_date,
               (sa.created_at at time zone 'Asia/Kuala_Lumpur')::date, sa.amount,
               (sa.created_at at time zone 'Asia/Kuala_Lumpur')::date
          from public.supplier_advance_applications sa
          join public.payment_vouchers pv on pv.id = sa.voucher_id
         where sa.bill_id = p_bill_id) z), '[]'::jsonb),
    'files', coalesce((
      select jsonb_agg(to_jsonb(f) order by f.uploaded_at) from (
        select fl.id, fl.file_name, fl.mime_type, fl.size_bytes, fl.storage_path,
               fl.uploaded_at, u.name as uploaded_by_name
          from public.ap_document_files fl
          left join public.app_users u on u.id = fl.uploaded_by
         where fl.document_type = 'SUPPLIER_BILL' and fl.document_id = p_bill_id) f), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(to_jsonb(ev) order by ev.at) from (
        select e.action, e.note, e.at, u.name as actor_name
          from public.ap_document_events e
          left join public.app_users u on u.id = e.actor
         where e.document_type = 'SUPPLIER_BILL' and e.document_id = p_bill_id) ev), '[]'::jsonb),
    'paid_total', v_paid,
    'allocated_total', v_allocated,
    'unpaid', case when v_bill.status = 'confirmed' then v_bill.total_amount - v_paid end,
    'left_to_pay', case when v_bill.status = 'confirmed' then v_bill.total_amount - v_allocated end,
    'advance_open', v_adv_open,
    'go_live_on', (select gc.go_live_on from public.gl_config gc where gc.id),
    'can', jsonb_build_object(
      'edit',    v_bill.status = 'draft' and v_finance,
      'confirm', v_bill.status = 'draft' and v_finance,
      'cancel',  case v_bill.status
                   when 'draft' then v_finance
                   when 'confirmed' then v_approver and v_allocated = 0
                   else false end,
      'add_file', v_bill.status <> 'cancelled' and v_finance,
      'apply_advance',    v_bill.status = 'confirmed' and v_finance
                          and v_bill.total_amount - v_allocated > 0 and v_adv_open > 0,
      'take_advance_off', v_bill.status = 'confirmed' and v_finance)
  );
end;
$fn$;


-- ── 7 · grants ───────────────────────────────────────────────────────────────
-- The doors and readers: signed-in users only; each checks its caller itself.
revoke all on function public.supplier_advance_apply(uuid, uuid, numeric)                                   from public, anon;
revoke all on function public.supplier_advance_application_cancel(uuid, text)                               from public, anon;
revoke all on function public.supplier_advance_money_back_record(uuid, date, text, numeric, text, text, uuid) from public, anon;
revoke all on function public.supplier_advance_money_back_cancel(uuid, text)                                from public, anon;
revoke all on function public.supplier_advances(uuid)                                                       from public, anon;
revoke all on function public.payment_voucher_register()                                                    from public, anon;

grant execute on function public.supplier_advance_apply(uuid, uuid, numeric)                                   to authenticated;
grant execute on function public.supplier_advance_application_cancel(uuid, text)                               to authenticated;
grant execute on function public.supplier_advance_money_back_record(uuid, date, text, numeric, text, text, uuid) to authenticated;
grant execute on function public.supplier_advance_money_back_cancel(uuid, text)                                to authenticated;
grant execute on function public.supplier_advances(uuid)                                                       to authenticated;
grant execute on function public.payment_voucher_register()                                                    to authenticated;

-- The prefix: nobody calls it but the numbering door, which runs as its owner.
revoke all on function public.supplier_money_back_prefix() from public, anon, authenticated;


-- ── 8 · sanity ───────────────────────────────────────────────────────────────
do $sanity$
declare
  v_missing text;
  v_src     text;
  v_def     text;
begin
  -- 1 · every door and reader, by name AND argument types
  select string_agg(x.fn || '(' || x.args || ')', ', ') into v_missing
    from (values
      ('supplier_advance_apply',             'uuid, uuid, numeric'),
      ('supplier_advance_application_cancel','uuid, text'),
      ('supplier_advance_money_back_record', 'uuid, date, text, numeric, text, text, uuid'),
      ('supplier_advance_money_back_cancel', 'uuid, text'),
      ('supplier_advances',                  'uuid'),
      ('payment_voucher_document',           'uuid'),
      ('payment_voucher_register',           ''),
      ('supplier_bill_document',             'uuid')
    ) as x(fn, args)
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = x.fn
        and oidvectortypes(p.proargtypes) = x.args);
  if v_missing is not null then
    raise exception '0485 sanity: missing or mis-typed: %', v_missing;
  end if;

  -- 2 · the history takes the new acts, and still refuses a made-up one
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
   where c.conrelid = 'public.ap_document_events'::regclass
     and c.conname = 'ap_document_events_action_check';
  if v_def is null or v_def not like '%advance_applied%' or v_def not like '%advance_taken_off%'
     or v_def not like '%money_back_cancelled%' or v_def not like '%file_added%' then
    raise exception '0485 sanity: the history does not take the advance acts';
  end if;
  if (select count(*) from pg_constraint c
       where c.conrelid = 'public.ap_document_events'::regclass and c.contype = 'c'
         and pg_get_constraintdef(c.oid) like 'CHECK ((action = ANY%') <> 1 then
    raise exception '0485 sanity: the history must have exactly one action check';
  end if;

  -- 3 · the number series
  if not exists (select 1 from public.gl_doc_series where prefix = public.supplier_money_back_prefix()) then
    raise exception '0485 sanity: the money-back series is not registered';
  end if;

  -- 4 · a knock-off posts nothing; money back posts with the supplier; its
  --     cancel reverses and takes the approver
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'supplier_advance_apply';
  if position('gl_post' in v_src) > 0 then
    raise exception '0485 sanity: knocking an advance off a bill must post nothing';
  end if;
  if position('supplier_advance_open(' in v_src) = 0 or position('ap_bill_paid(' in v_src) = 0
     or position('for update' in v_src) = 0 then
    raise exception '0485 sanity: supplier_advance_apply must lock and read both law-D helpers';
  end if;
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'supplier_advance_application_cancel';
  if position('gl_post' in v_src) > 0 or position('gl_reverse' in v_src) > 0 then
    raise exception '0485 sanity: taking an advance off a bill must post nothing';
  end if;
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'supplier_advance_money_back_record';
  if position('''SUPPLIER_MONEY_BACK''' in v_src) = 0 or position('party_type' in v_src) = 0
     or position('supplier_advance_open(' in v_src) = 0 or position('pg_advisory_xact_lock' in v_src) = 0
     or position('idempotency_mismatch' in v_src) = 0 or position('supplier_money_back_prefix()' in v_src) = 0 then
    raise exception '0485 sanity: money back lost its posting, its cap, its double-press guard or its prefix';
  end if;
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'supplier_advance_money_back_cancel';
  if position('gl_reverse' in v_src) = 0 or position('has_finance_approver' in v_src) = 0 then
    raise exception '0485 sanity: cancelling money back must reverse and take the approver';
  end if;

  -- 5 · law D: the bill document reads the helper, and the readers say the advance
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'supplier_bill_document';
  if position('ap_bill_paid(' in v_src) = 0 or position('supplier_advance_open(' in v_src) = 0 then
    raise exception '0485 sanity: supplier_bill_document adds up what is paid by itself';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'payment_voucher_register'
                    and 'advance_amount' = any (p.proargnames)
                    and 'advance_open' = any (p.proargnames)) then
    raise exception '0485 sanity: payment_voucher_register does not say the advance';
  end if;

  -- 6 · the doors are signed-in only; gl_post / gl_reverse stay closed
  if not has_function_privilege('authenticated', 'public.supplier_advance_apply(uuid, uuid, numeric)', 'execute')
     or has_function_privilege('anon', 'public.supplier_advance_apply(uuid, uuid, numeric)', 'execute')
     or not has_function_privilege('authenticated', 'public.supplier_advance_money_back_record(uuid, date, text, numeric, text, text, uuid)', 'execute')
     or has_function_privilege('anon', 'public.supplier_advance_money_back_record(uuid, date, text, numeric, text, text, uuid)', 'execute')
     or has_function_privilege('anon', 'public.supplier_advance_money_back_cancel(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.supplier_advance_application_cancel(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.supplier_advances(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.payment_voucher_register()', 'execute')
     or has_function_privilege('anon', 'public.payment_voucher_register()', 'execute') then
    raise exception '0485 sanity: a door has the wrong grant';
  end if;
  if has_function_privilege('authenticated', 'public.gl_post(text, text, date, text, jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.gl_reverse(uuid, text)', 'execute') then
    raise exception '0485 sanity: gl_post or gl_reverse is callable from outside';
  end if;

  -- 7 · fail closed: no internal role, no rows and no act.
  begin
    perform * from public.supplier_advances(null);
    raise exception '0485 sanity: an anonymous caller read the advances';
  exception
    when insufficient_privilege then null;
  end;
  begin
    perform public.supplier_advance_apply(gen_random_uuid(), gen_random_uuid(), 1);
    raise exception '0485 sanity: an anonymous caller applied an advance';
  exception
    when insufficient_privilege then null;
  end;
end
$sanity$;
