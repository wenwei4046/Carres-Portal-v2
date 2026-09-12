-- =============================================================================
-- 0484_a_supplier_can_be_paid_before_its_bill.sql
-- ACCOUNTS PAYABLE · SUPPLIER ADVANCE, PART 1 — A PAYMENT VOUCHER MAY PAY A
-- SUPPLIER BEFORE ITS BILL, AND "HOW MUCH OF THIS BILL IS PAID" HAS ONE ANSWER
-- (owner rulings 11 Sep 2026: "pay a factory before its bill, then knock it
--  off against the bill later"; a cancelled factory order either gets the
--  money back or keeps the advance as credit. Evolves 0477 — the same payment
--  voucher; no second document for money out.)
--
-- WHAT WAS WRONG, MEASURED
--   1. A factory that wants money before it ships had no document. The 0477
--      voucher pays a confirmed bill or a non-control account and nothing else
--      (0477 header, "WHAT THIS DELIBERATELY DOES NOT DO", names this gap). A
--      deposit could only be typed as a direct line to some expense or asset
--      account, where it can never be matched to the bill that arrives weeks
--      later, and the supplier's payables balance never shows it.
--   2. "How much of this bill is paid" was added up in SEVEN places, each with
--      its own SUM over payment_voucher_allocations: pv_allocation_ceiling,
--      _payment_voucher_validate, supplier_bill_cancel, supplier_bill_document,
--      supplier_bill_register, ap_outstanding and ap_bill_outstanding. They
--      agree today. A second way of paying a bill (an advance knocked off it)
--      would have had to be added to all seven, and the one that was missed
--      would let a bill be paid twice (ERP-ARCHITECTURE law D).
--
-- WHAT THIS BUILDS
--   A. payment_vouchers.advance_amount — numeric(12,2), never negative,
--      default 0. A "Pay supplier bills" voucher may carry an advance beside
--      its bills. The voucher total is direct lines + bills + advance, and a
--      supplier voucher needs at least one bill OR an advance above RM 0.00.
--      The advance is booked to the supplier's own payables control, kept in
--      payment_vouchers.ap_account_code (a 0464 column 0477 stopped reading):
--      2110 Trade payables, or 2120 Other payables for an other creditor —
--      the same default a bill from that supplier takes.
--   B. Two new tables. 0485's doors are their only writers:
--        supplier_advance_applications   an advance knocked off one bill
--        supplier_advance_money_back     money the supplier sent back
--      Neither row may be deleted; each ends by being taken off / cancelled.
--   C. ONE arithmetic for "how much of this bill is paid":
--        ap_bill_paid(bill) → paid = approved vouchers + live knock-offs
--                             held = vouchers not cancelled + live knock-offs
--      Six of the seven copies above now read it here; the seventh,
--      supplier_bill_document, is rewritten in 0485 with its knock-off lines.
--   D. ONE arithmetic for "how much of this advance is left":
--        supplier_advance_open(voucher) → advance − knocked off − money back,
--        over approved vouchers only (an advance is money once it is paid).
--   E. ap_outstanding gains advance_open and net_owing (= balance_owing −
--      advance_open). balance_owing keeps its meaning: what the bills say is
--      unpaid. The ledger Self-check compares net_owing, because the advance
--      sits in the same control account as the bills.
--   F. A voucher whose advance is knocked off a bill, or partly paid back, is
--      not cancelled: take those off first (detail advance_in_use).
--
-- DR / CR, PER ACTION (proven by the probe, reading gl_entry_lines)
--   Approve a voucher that carries an advance — source PAYMENT_VOUCHER, still
--   ONE entry, dated the payment date:
--       Dr  each direct line's account                              (0477)
--       Dr  each paid bill's own AP control, party = its supplier   (0477)
--       Dr  the voucher's AP control (2110 / 2120), party = the
--           supplier, for the advance                               ← new line
--       Cr  the pay-from money account, for the voucher total       (0477)
--   Cancel that voucher (nothing knocked off, nothing back) — gl_reverse on the
--       payment's original date, exactly as 0477.
--   Saving, preparing, checking, returning a voucher: post nothing (0477).
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   · No doors for knocking off, taking off, money back or its cancel — 0485.
--   · No separate "supplier deposits" asset account. The advance is a debit on
--     the supplier's own payables control, so the supplier's ledger balance is
--     net of it from the day it is paid, and knocking it off a bill later moves
--     nothing in the ledger (both halves are already on the same account and
--     party). No chart code is added.
--   · Bill aging is unchanged: a bill ages by what is unpaid ON IT. An advance
--     not yet knocked off is shown beside the bills, never spread across them.
--   · A direct payment cannot carry an advance: an advance belongs to a
--     supplier (a table check and the save door both say so).
--   · No backfill. Every existing voucher reads advance_amount 0, which is
--     what it paid. No row is changed and no row is deleted.
--
-- RLS / PERMISSIONS — what changes and why
--   · New tables supplier_advance_applications and supplier_advance_money_back:
--     RLS ON, every privilege revoked from anon and authenticated, SELECT
--     granted back to authenticated, and ONE select policy gl_may_read()
--     (finance + principal) — the shape of every 0477 table. No insert,
--     update or delete policy for anyone: every write is a security-definer
--     door (0485) that checks its caller, and a trigger refuses DELETE.
--   · New helpers ap_bill_paid and supplier_advance_open, and the two new
--     trigger functions: execute revoked from public, anon and authenticated.
--     Only the definer functions call them.
--   · ap_outstanding (new result columns) and payment_voucher_save_draft (new
--     argument) change their signature, so each is dropped and recreated; the
--     grants are re-applied exactly as 0477 set them — revoked from public and
--     anon, execute to authenticated. Every other function here is create or
--     replace: owner, security definer, search_path and grants are unchanged.
-- =============================================================================


-- ── 1 · the advance on the voucher ───────────────────────────────────────────
-- A constant default is metadata only: no row is rewritten, every existing
-- voucher reads 0.
alter table public.payment_vouchers
  add column if not exists advance_amount numeric(12,2) not null default 0;

alter table public.payment_vouchers
  add constraint payment_vouchers_advance_not_negative
  check (advance_amount >= 0);

-- An advance belongs to a supplier, and it says which payables account it is
-- booked to.
alter table public.payment_vouchers
  add constraint payment_vouchers_advance_is_a_suppliers
  check (advance_amount = 0
         or (purpose = 'SUPPLIER_BILLS' and supplier_id is not null and ap_account_code is not null));

comment on column public.payment_vouchers.advance_amount is
  '0484: money paid to the supplier before its bill. Part of the voucher total; approve debits it to ap_account_code (party = the supplier). Knocked off bills (supplier_advance_applications) or sent back (supplier_advance_money_back) later; what is left is supplier_advance_open().';
comment on column public.payment_vouchers.ap_account_code is
  '0484: the payables control the voucher''s ADVANCE is booked to — 2110, or 2120 for an other creditor. Null when the voucher carries no advance. (0464 column; 0477 stopped reading it, because each bill allocation debits its own bill''s account.)';


-- ── 2 · a knock-off, and money back ──────────────────────────────────────────
create table if not exists public.supplier_advance_applications (
  id            uuid primary key default gen_random_uuid(),
  voucher_id    uuid not null references public.payment_vouchers(id) on delete restrict,
  bill_id       uuid not null references public.supplier_bills(id) on delete restrict,
  amount        numeric(12,2) not null check (amount > 0),
  status        text not null default 'applied' check (status in ('applied','cancelled')),
  created_at    timestamptz not null default now(),
  created_by    uuid references public.app_users(id),
  cancelled_at  timestamptz,
  cancelled_by  uuid references public.app_users(id),
  cancel_reason text,
  constraint supplier_advance_applications_cancel_is_stamped
    check (status <> 'cancelled'
           or (cancelled_at is not null and length(btrim(coalesce(cancel_reason, ''))) > 0))
);
-- One live knock-off per advance and bill, as one voucher pays a bill once
-- (payment_voucher_allocations is unique on voucher + bill). A double press
-- cannot knock the same advance off the same bill twice.
create unique index if not exists supplier_advance_applications_one_live
  on public.supplier_advance_applications (voucher_id, bill_id) where status = 'applied';
create index if not exists supplier_advance_applications_bill_idx
  on public.supplier_advance_applications (bill_id, status);
create index if not exists supplier_advance_applications_voucher_idx
  on public.supplier_advance_applications (voucher_id, status);

create table if not exists public.supplier_advance_money_back (
  id                 uuid primary key default gen_random_uuid(),
  money_back_no      text not null unique,
  voucher_id         uuid not null references public.payment_vouchers(id) on delete restrict,
  money_back_date    date not null,
  money_account_code text not null references public.gl_accounts(code),
  amount             numeric(12,2) not null check (amount > 0),
  reference          text,
  narration          text,
  status             text not null default 'posted' check (status in ('posted','voided')),
  gl_entry_id        uuid not null references public.gl_entries(id),
  reversal_entry_id  uuid references public.gl_entries(id),
  idempotency_key    uuid unique,
  created_at         timestamptz not null default now(),
  created_by         uuid references public.app_users(id),
  voided_at          timestamptz,
  voided_by          uuid references public.app_users(id),
  void_reason        text,
  constraint supplier_advance_money_back_void_is_complete
    check (status <> 'voided'
           or (reversal_entry_id is not null and voided_at is not null
               and length(btrim(coalesce(void_reason, ''))) > 0))
);
create index if not exists supplier_advance_money_back_voucher_idx
  on public.supplier_advance_money_back (voucher_id, status);

-- A knock-off is never deleted and never re-written: it is taken off, once.
create or replace function public.supplier_advance_application_frozen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'an advance knocked off a bill is never deleted; take it off instead'
      using errcode = '42501', detail = 'no_delete';
  end if;
  if old.status = 'cancelled' then
    raise exception 'an advance taken off a bill is final'
      using errcode = '42501', detail = 'application_cancelled';
  end if;
  if new.status <> 'cancelled'
     or new.voucher_id is distinct from old.voucher_id
     or new.bill_id    is distinct from old.bill_id
     or new.amount     is distinct from old.amount
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by then
    raise exception 'taking an advance off a bill may change only its cancellation stamp'
      using errcode = '42501', detail = 'application_locked';
  end if;
  return new;
end;
$fn$;

create trigger supplier_advance_application_frozen_trg
  before update or delete on public.supplier_advance_applications
  for each row execute function public.supplier_advance_application_frozen();

-- Money back is never deleted: it is cancelled by reversal, once.
create or replace function public.supplier_advance_money_back_frozen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'money back is never deleted; cancel it instead'
      using errcode = '42501', detail = 'no_delete';
  end if;
  if old.status = 'voided' then
    raise exception 'cancelled money back is final'
      using errcode = '42501', detail = 'money_back_cancelled';
  end if;
  if new.status <> 'voided'
     or new.money_back_no      is distinct from old.money_back_no
     or new.voucher_id         is distinct from old.voucher_id
     or new.money_back_date    is distinct from old.money_back_date
     or new.money_account_code is distinct from old.money_account_code
     or new.amount             is distinct from old.amount
     or new.reference          is distinct from old.reference
     or new.narration          is distinct from old.narration
     or new.gl_entry_id        is distinct from old.gl_entry_id
     or new.idempotency_key    is distinct from old.idempotency_key
     or new.created_at         is distinct from old.created_at
     or new.created_by         is distinct from old.created_by then
    raise exception 'cancelling money back may change only its cancellation stamp'
      using errcode = '42501', detail = 'money_back_locked';
  end if;
  return new;
end;
$fn$;

create trigger supplier_advance_money_back_frozen_trg
  before update or delete on public.supplier_advance_money_back
  for each row execute function public.supplier_advance_money_back_frozen();

comment on table public.supplier_advance_applications is
  '0484: an advance (payment_vouchers.advance_amount on an APPROVED voucher) knocked off a confirmed bill of the same supplier and payables account. Posts nothing: the advance and the bill are already on the same control account and party. Written only by supplier_advance_apply / supplier_advance_application_cancel (0485). Never deleted.';
comment on table public.supplier_advance_money_back is
  '0484: money a supplier sent back out of an advance. SRV-YYYYMMDD-RRRR. Posts Dr the money account / Cr the advance''s payables control (party = supplier). Written only by supplier_advance_money_back_record / _cancel (0485); cancel reverses the entry. Never deleted.';


-- ── 3 · ONE arithmetic for a bill, ONE for an advance (law D) ─────────────────
-- How much of a bill is paid. Every reader and every ceiling reads this; none
-- adds up allocations or knock-offs by itself.
--   paid  approved vouchers + live knock-offs     (money that has settled it)
--   held  vouchers not cancelled + live knock-offs (what is spoken for, so no
--         second voucher or knock-off may take it)
-- A live knock-off always belongs to an approved voucher: the voucher cannot
-- be cancelled while one stands (payment_voucher_cancel, below).
-- Returns a row only for a bill that has something against it.
create or replace function public.ap_bill_paid(p_bill_id uuid default null)
returns table (bill_id uuid, paid numeric(12,2), held numeric(12,2))
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select x.bid,
         coalesce(sum(x.amount) filter (where x.settled), 0)::numeric(12,2),
         coalesce(sum(x.amount), 0)::numeric(12,2)
    from (
      select al.bill_id as bid, al.amount_applied as amount, (pv.status = 'approved') as settled
        from public.payment_voucher_allocations al
        join public.payment_vouchers pv on pv.id = al.voucher_id
       where pv.status <> 'cancelled'
         and (p_bill_id is null or al.bill_id = p_bill_id)
      union all
      select ap.bill_id, ap.amount, true
        from public.supplier_advance_applications ap
       where ap.status = 'applied'
         and (p_bill_id is null or ap.bill_id = p_bill_id)
    ) x
   group by x.bid
$fn$;

comment on function public.ap_bill_paid(uuid) is
  '0484 · law D: the ONE arithmetic for how much of a bill is paid. paid = approved voucher allocations + live advance knock-offs; held = allocations on vouchers not cancelled + live knock-offs. Internal: only definer functions call it.';

-- How much of an advance is left: advance − knocked off − money back. Only an
-- APPROVED voucher's advance is money; a draft's is a plan.
create or replace function public.supplier_advance_open(p_voucher_id uuid default null)
returns table (voucher_id uuid, supplier_id uuid, ap_account_code text,
               advance_amount numeric(12,2), applied_total numeric(12,2),
               money_back_total numeric(12,2), advance_open numeric(12,2))
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select v.id, v.supplier_id, v.ap_account_code, v.advance_amount,
         coalesce(ap.total, 0)::numeric(12,2),
         coalesce(mb.total, 0)::numeric(12,2),
         (v.advance_amount - coalesce(ap.total, 0) - coalesce(mb.total, 0))::numeric(12,2)
    from public.payment_vouchers v
    left join (
      select a.voucher_id as vid, sum(a.amount) as total
        from public.supplier_advance_applications a
       where a.status = 'applied'
       group by a.voucher_id
    ) ap on ap.vid = v.id
    left join (
      select m.voucher_id as vid, sum(m.amount) as total
        from public.supplier_advance_money_back m
       where m.status = 'posted'
       group by m.voucher_id
    ) mb on mb.vid = v.id
   where v.status = 'approved'
     and v.advance_amount > 0
     and (p_voucher_id is null or v.id = p_voucher_id)
$fn$;

comment on function public.supplier_advance_open(uuid) is
  '0484 · law D: the ONE arithmetic for what is left of an advance — advance_amount on an approved voucher, less live knock-offs, less posted money back. Internal: only definer functions call it.';


-- ── 4 · every copy of "how much is paid" now reads ap_bill_paid ───────────────

-- 4a · the allocation ceiling. A knock-off now counts against the bill too.
-- This row's own previous amount is taken out, as the 0477 `a.id <> new.id`
-- did, so re-saving a draft's allocation does not count it twice.
create or replace function public.pv_allocation_ceiling()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_bill       public.supplier_bills%rowtype;
  v_voucher    public.payment_vouchers%rowtype;
  v_on_bill    numeric(12,2);
  v_on_voucher numeric(12,2);
begin
  select * into v_bill from public.supplier_bills
    where id = new.bill_id for update;
  if not found then
    raise exception 'That bill does not exist.'
      using errcode = 'P0002', detail = 'bill_missing';
  end if;
  select * into v_voucher from public.payment_vouchers
    where id = new.voucher_id for update;

  if v_bill.status <> 'confirmed' then
    raise exception 'Bill % is not confirmed. Only a confirmed bill can be paid.',
      coalesce(v_bill.bill_no, 'for invoice ' || v_bill.supplier_invoice_no)
      using errcode = 'P0001', detail = 'bill_not_confirmed';
  end if;

  if coalesce(v_voucher.purpose, 'SUPPLIER_BILLS') <> 'SUPPLIER_BILLS' then
    raise exception 'A direct payment does not pay bills.'
      using errcode = 'P0001', detail = 'direct_pays_no_bill';
  end if;

  if v_voucher.supplier_id is null or v_bill.supplier_id <> v_voucher.supplier_id then
    raise exception 'Bill % belongs to a different supplier. One voucher pays one supplier''s bills.',
      v_bill.bill_no
      using errcode = 'P0001', detail = 'supplier_mismatch';
  end if;

  v_on_bill := coalesce((select bp.held from public.ap_bill_paid(new.bill_id) bp), 0)
             - coalesce((select a.amount_applied
                           from public.payment_voucher_allocations a
                           join public.payment_vouchers v on v.id = a.voucher_id
                          where a.id = new.id and v.status <> 'cancelled'), 0);

  if v_on_bill + new.amount_applied > v_bill.total_amount then
    raise exception 'Bill % is RM % and RM % of it is already on a payment voucher or an advance, so it cannot take RM % more.',
      v_bill.bill_no,
      to_char(v_bill.total_amount, 'FM999,999,999,990.00'),
      to_char(v_on_bill, 'FM999,999,999,990.00'),
      to_char(new.amount_applied, 'FM999,999,999,990.00')
      using errcode = 'P0001', detail = 'bill_over_allocated';
  end if;

  -- The voucher's own side: its bills may not add up to more than it pays.
  -- This is a fact about the VOUCHER, not the bill, so it stays here.
  select coalesce(sum(a.amount_applied), 0)
    into v_on_voucher
    from public.payment_voucher_allocations a
   where a.voucher_id = new.voucher_id
     and a.id <> new.id;

  if v_on_voucher + new.amount_applied > v_voucher.amount then
    raise exception 'The bills on this voucher add up to more than the voucher total.'
      using errcode = 'P0001', detail = 'voucher_over_allocated';
  end if;

  return new;
end;
$fn$;

-- 4b · the check every step runs: bills through the helper, and the advance.
create or replace function public._payment_voucher_validate(p_voucher_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_v       public.payment_vouchers%rowtype;
  v_lines   numeric(12,2);
  v_allocs  numeric(12,2);
  v_nlines  integer;
  v_nallocs integer;
  v_bad     text;
  r         record;
begin
  select * into v_v from public.payment_vouchers where id = p_voucher_id;

  perform public.ap_refuse_before_go_live(v_v.voucher_date, 'This payment voucher');
  perform public._ap_require_account(v_v.pay_from_account_code, 'pay_from', 'Pay from');
  if length(btrim(coalesce(v_v.payee_name, ''))) = 0 then
    raise exception 'Type who is being paid.'
      using errcode = 'P0001', detail = 'payee_missing';
  end if;

  for r in select l.line_no, l.account_code
             from public.payment_voucher_lines l
            where l.voucher_id = p_voucher_id order by l.line_no loop
    perform public._ap_require_account(r.account_code, 'voucher_line', format('Line %s', r.line_no));
    if r.account_code = v_v.pay_from_account_code then
      raise exception 'Line %: the money cannot be paid from and to the same account.', r.line_no
        using errcode = 'P0001', detail = 'line_is_pay_from';
    end if;
  end loop;

  select coalesce(sum(amount), 0), count(*) into v_lines, v_nlines
    from public.payment_voucher_lines where voucher_id = p_voucher_id;
  select coalesce(sum(amount_applied), 0), count(*) into v_allocs, v_nallocs
    from public.payment_voucher_allocations where voucher_id = p_voucher_id;

  if coalesce(v_v.purpose, 'SUPPLIER_BILLS') = 'SUPPLIER_BILLS' then
    if v_v.supplier_id is null then
      raise exception 'Choose the supplier whose bills this voucher pays.'
        using errcode = 'P0001', detail = 'supplier_required';
    end if;
    if v_nallocs = 0 and v_v.advance_amount = 0 then
      raise exception 'Choose at least one bill to pay, or type an advance.'
        using errcode = 'P0001', detail = 'no_bills';
    end if;
    if v_v.advance_amount > 0 then
      perform public._ap_require_account(v_v.ap_account_code, 'ap', 'Advance');
    end if;
  else
    if v_nallocs > 0 then
      raise exception 'A direct payment does not pay bills.'
        using errcode = 'P0001', detail = 'direct_pays_no_bill';
    end if;
    if v_v.advance_amount > 0 then
      raise exception 'A direct payment does not carry an advance.'
        using errcode = 'P0001', detail = 'direct_pays_no_advance';
    end if;
    if v_nlines = 0 then
      raise exception 'Add at least one line: what is this money paying for?'
        using errcode = 'P0001', detail = 'no_lines';
    end if;
  end if;

  -- Every ringgit paid says what it pays: the total IS lines + bills + advance.
  if v_lines + v_allocs + v_v.advance_amount <> v_v.amount then
    raise exception 'This voucher is for RM %, but its lines, bills and advance add up to RM %.',
      to_char(v_v.amount, 'FM999,999,999,990.00'),
      to_char(v_lines + v_allocs + v_v.advance_amount, 'FM999,999,999,990.00')
      using errcode = 'P0001', detail = 'total_not_equal';
  end if;

  -- The bills as they stand NOW: still confirmed, still this supplier's, and
  -- not over-paid by another voucher or an advance since this one was typed.
  select string_agg(coalesce(b.bill_no, b.supplier_invoice_no), ', ') into v_bad
    from public.payment_voucher_allocations a
    join public.supplier_bills b on b.id = a.bill_id
   where a.voucher_id = p_voucher_id
     and (b.status <> 'confirmed'
          or b.supplier_id is distinct from v_v.supplier_id
          or coalesce((select bp.held from public.ap_bill_paid(a.bill_id) bp), 0) > b.total_amount);
  if v_bad is not null then
    raise exception 'These bills can no longer take this payment: %. Return the voucher to draft and correct it.', v_bad
      using errcode = 'P0001', detail = 'bill_cannot_take_payment';
  end if;
end;
$fn$;

-- 4c · cancelling a bill: refused while any of it is paid or spoken for,
-- by a voucher or by an advance.
create or replace function public.supplier_bill_cancel(p_bill_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     text := public.app_role()::text;
  v_bill     public.supplier_bills%rowtype;
  v_open     numeric(12,2);
  v_reversal uuid;
begin
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Say why this bill is cancelled.'
      using errcode = 'P0001', detail = 'reason_missing';
  end if;

  select * into v_bill from public.supplier_bills where id = p_bill_id for update;
  if not found then
    raise exception 'That bill does not exist.'
      using errcode = 'P0002', detail = 'bill_missing';
  end if;
  if v_bill.status = 'cancelled' then
    raise exception 'This bill is already cancelled.'
      using errcode = 'P0001', detail = 'already_cancelled';
  end if;

  if v_bill.status = 'draft' then
    if v_role is null or v_role not in ('finance','principal') then
      raise exception 'only finance cancels a draft supplier bill'
        using errcode = '42501', detail = 'not_finance';
    end if;
  else
    if not public.has_finance_approver(auth.uid()) then
      raise exception 'Cancelling a confirmed bill takes the finance approver.'
        using errcode = '42501', detail = 'not_finance_approver';
    end if;

    v_open := coalesce((select bp.held from public.ap_bill_paid(p_bill_id) bp), 0);

    if v_open > 0 then
      raise exception 'RM % of this bill is on a payment voucher or an advance. Cancel the voucher, or take the advance off this bill, first.',
        to_char(v_open, 'FM999,999,999,990.00')
        using errcode = 'P0001', detail = 'bill_allocated';
    end if;

    v_reversal := public.gl_reverse(v_bill.gl_entry_id, btrim(p_reason));
  end if;

  update public.supplier_bills
     set status            = 'cancelled',
         reversal_entry_id = v_reversal,
         cancelled_at      = now(),
         cancelled_by      = auth.uid(),
         cancel_reason     = btrim(p_reason)
   where id = p_bill_id;

  perform public._ap_event('SUPPLIER_BILL', p_bill_id, 'cancelled', btrim(p_reason));
  return v_reversal;
end;
$fn$;

-- 4d · the bill register's Paid and Unpaid.
create or replace function public.supplier_bill_register()
returns table (id uuid, bill_no text, status text, supplier_id uuid, supplier_name text,
               supplier_kind text, supplier_invoice_no text, bill_date date, due_date date,
               po_id text, grn_nos text, ap_account_code text, total_amount numeric,
               paid_total numeric, unpaid numeric, price_flags integer, file_count integer,
               created_at timestamp with time zone)
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
  select b.id, b.bill_no, b.status, b.supplier_id, s.name, s.kind::text,
         b.supplier_invoice_no, b.bill_date, b.due_date, b.po_id,
         g.grn_nos, b.ap_account_code, b.total_amount,
         coalesce(p.paid, 0)::numeric(12,2),
         case when b.status = 'confirmed'
              then (b.total_amount - coalesce(p.paid, 0))::numeric(12,2) end,
         coalesce(g.flags, 0)::integer,
         coalesce(f.n, 0)::integer,
         b.created_at
    from public.supplier_bills b
    join public.suppliers s on s.id = b.supplier_id
    left join lateral (
      select string_agg(distinct coalesce(to_jsonb(r) ->> 'grn_no', 'GRN of ' || r.po_id), ', ') as grn_nos,
             count(*) filter (where pol.cost is not null
                                and bl.unit_price is distinct from pol.cost) as flags
        from public.supplier_bill_lines bl
        left join public.warehouse_receipts r on r.id = bl.warehouse_receipt_id
        left join public.purchase_order_lines pol on pol.id = bl.po_line_id
       where bl.bill_id = b.id and bl.warehouse_receipt_id is not null
    ) g on true
    left join public.ap_bill_paid() p on p.bill_id = b.id
    left join (
      select fl.document_id as did, count(*) as n
        from public.ap_document_files fl
       where fl.document_type = 'SUPPLIER_BILL'
       group by fl.document_id
    ) f on f.did = b.id
   order by b.created_at desc;
end;
$fn$;

-- 4e · owed per confirmed bill.
create or replace function public.ap_bill_outstanding(p_supplier_id uuid default null)
returns table (bill_id uuid, bill_no text, supplier_id uuid, supplier_name text,
               supplier_invoice_no text, bill_date date, due_date date, po_id text,
               total_amount numeric, paid_total numeric, balance_owing numeric,
               go_live_on date, ap_account_code text, allocated_total numeric,
               unallocated numeric, supplier_kind text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_go_live date;
begin
  if not public.gl_may_read() then
    raise exception 'accounts payable is internal'
      using errcode = '42501', detail = 'not_internal';
  end if;

  select gc.go_live_on into v_go_live from public.gl_config gc where gc.id;

  return query
  select b.id, b.bill_no, b.supplier_id, s.name, b.supplier_invoice_no,
         b.bill_date, b.due_date, b.po_id, b.total_amount,
         coalesce(bp.paid, 0)::numeric(12,2),
         (b.total_amount - coalesce(bp.paid, 0))::numeric(12,2),
         v_go_live,
         b.ap_account_code,
         coalesce(bp.held, 0)::numeric(12,2),
         (b.total_amount - coalesce(bp.held, 0))::numeric(12,2),
         s.kind::text
    from public.supplier_bills b
    join public.suppliers s on s.id = b.supplier_id
    left join public.ap_bill_paid() bp on bp.bill_id = b.id
   where b.status = 'confirmed'
     and (p_supplier_id is null or b.supplier_id = p_supplier_id)
   order by b.bill_date, b.bill_no;
end;
$fn$;

-- 4f · owed per supplier: the bills, and beside them the advance not yet
-- knocked off. The result gains two columns, so the function is recreated.
drop function if exists public.ap_outstanding(uuid);

create function public.ap_outstanding(p_supplier_id uuid default null)
returns table (supplier_id uuid, supplier_name text, bills_confirmed integer,
               billed_total numeric, allocated_total numeric, paid_total numeric,
               balance_owing numeric, uncommitted numeric,
               oldest_confirmed_bill_date date, go_live_on date, supplier_kind text,
               open_bills integer, oldest_unpaid_bill_date date,
               advance_open numeric, net_owing numeric)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_go_live date;
begin
  if not public.gl_may_read() then
    raise exception 'accounts payable is internal'
      using errcode = '42501', detail = 'not_internal';
  end if;

  select gc.go_live_on into v_go_live from public.gl_config gc where gc.id;

  return query
  with bill_paid as (
    select sb.supplier_id as sid, sb.bill_date, sb.total_amount,
           coalesce(bp.paid, 0) as paid,
           coalesce(bp.held, 0) as allocated
      from public.supplier_bills sb
      left join public.ap_bill_paid() bp on bp.bill_id = sb.id
     where sb.status = 'confirmed'
  ), per_supplier as (
    select bpd.sid,
           count(*) as cnt,
           sum(bpd.total_amount) as billed,
           sum(bpd.allocated) as allocated,
           sum(bpd.paid) as paid,
           min(bpd.bill_date) as oldest,
           count(*) filter (where bpd.total_amount > bpd.paid) as open_cnt,
           min(bpd.bill_date) filter (where bpd.total_amount > bpd.paid) as oldest_open
      from bill_paid bpd
     group by bpd.sid
  ), advance as (
    select ao.supplier_id as sid, sum(ao.advance_open) as open_total
      from public.supplier_advance_open() ao
     group by ao.supplier_id
  ), owed as (
    select s.id as sid, s.name, s.kind::text as kind,
           ps.cnt, ps.billed, ps.allocated, ps.paid, ps.oldest, ps.open_cnt, ps.oldest_open,
           (coalesce(ps.billed, 0) - coalesce(ps.paid, 0)) as owing,
           coalesce(adv.open_total, 0) as adv_open
      from public.suppliers s
      left join per_supplier ps on ps.sid = s.id
      left join advance adv on adv.sid = s.id
     where p_supplier_id is null or s.id = p_supplier_id
  )
  select o.sid,
         o.name,
         coalesce(o.cnt, 0)::integer,
         coalesce(o.billed, 0)::numeric(12,2),
         coalesce(o.allocated, 0)::numeric(12,2),
         coalesce(o.paid, 0)::numeric(12,2),
         o.owing::numeric(12,2),
         (coalesce(o.billed, 0) - coalesce(o.allocated, 0))::numeric(12,2),
         o.oldest,
         v_go_live,
         o.kind,
         coalesce(o.open_cnt, 0)::integer,
         o.oldest_open,
         o.adv_open::numeric(12,2),
         (o.owing - o.adv_open)::numeric(12,2)
    from owed o
   order by o.name;
end;
$fn$;

comment on function public.ap_outstanding(uuid) is
  '0484: owed per supplier, every supplier listed. balance_owing = confirmed bills less what is paid on them (ap_bill_paid: approved vouchers + advance knock-offs). advance_open = advances paid and not yet knocked off or sent back (supplier_advance_open). net_owing = balance_owing - advance_open, which is what the supplier''s payables control holds in the ledger. Finance and principal only.';


-- ── 5 · the voucher carries the advance ──────────────────────────────────────

-- 5a · save a draft. One argument more, so the 0477 function is replaced
-- whole (two overloads that both default their tail would make every call
-- ambiguous).
drop function if exists public.payment_voucher_save_draft(uuid, text, uuid, text, date, text, jsonb, jsonb, text, text, text);

create function public.payment_voucher_save_draft(
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

-- 5b · the advance is locked with the rest of the numbers once prepared.
create or replace function public.payment_voucher_frozen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception
      'a payment voucher is never deleted; cancel it instead'
      using errcode = '42501', detail = 'no_delete';
  end if;

  if old.status = 'draft' then
    return new;
  end if;

  if old.status = 'cancelled' then
    raise exception 'a cancelled payment voucher is final'
      using errcode = '42501', detail = 'voucher_cancelled';
  end if;

  if not (
       (old.status = 'prepared' and new.status in ('prepared','checked','draft','cancelled'))
    or (old.status = 'checked'  and new.status in ('checked','approved','draft','cancelled'))
    or (old.status = 'approved' and new.status in ('approved','cancelled'))
  ) then
    raise exception 'a % payment voucher cannot become %', old.status, new.status
      using errcode = '42501', detail = 'voucher_locked';
  end if;

  if new.voucher_no            is distinct from old.voucher_no
     or new.purpose               is distinct from old.purpose
     or new.supplier_id           is distinct from old.supplier_id
     or new.payee_name            is distinct from old.payee_name
     or new.voucher_date          is distinct from old.voucher_date
     or new.amount                is distinct from old.amount
     or new.advance_amount        is distinct from old.advance_amount
     or new.pay_method            is distinct from old.pay_method
     or new.pay_reference         is distinct from old.pay_reference
     or new.pay_from_account_code is distinct from old.pay_from_account_code
     or new.ap_account_code       is distinct from old.ap_account_code
     or new.narration             is distinct from old.narration
     or new.created_at            is distinct from old.created_at
     or new.created_by            is distinct from old.created_by then
    raise exception
      'a prepared payment voucher''s numbers are locked; return it to draft to change them'
      using errcode = '42501', detail = 'voucher_locked';
  end if;

  if new.status <> 'draft'
     and (new.prepared_at is distinct from old.prepared_at
          or new.prepared_by is distinct from old.prepared_by) then
    raise exception 'the preparer of a payment voucher cannot be rewritten'
      using errcode = '42501', detail = 'voucher_locked';
  end if;

  if old.status = 'approved'
     and (new.gl_entry_id is distinct from old.gl_entry_id
          or new.approved_at is distinct from old.approved_at
          or new.approved_by is distinct from old.approved_by
          or new.checked_at  is distinct from old.checked_at
          or new.checked_by  is distinct from old.checked_by) then
    raise exception 'an approved payment voucher can only be cancelled'
      using errcode = '42501', detail = 'voucher_locked';
  end if;

  return new;
end;
$fn$;

-- 5c · approve: the advance is one more debit in the same entry.
create or replace function public.payment_voucher_approve(p_voucher_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_v     public.payment_vouchers%rowtype;
  v_me    uuid := auth.uid();
  v_lines jsonb := '[]'::jsonb;
  v_entry uuid;
  r       record;
begin
  if v_me is null then
    raise exception 'no signed-in account'
      using errcode = '42501', detail = 'no_session';
  end if;

  select * into v_v from public.payment_vouchers where id = p_voucher_id for update;
  if not found then
    raise exception 'That payment voucher does not exist.'
      using errcode = 'P0002', detail = 'voucher_missing';
  end if;
  if v_v.status <> 'checked' then
    raise exception 'Only a checked payment voucher can be approved.'
      using errcode = 'P0001', detail = 'voucher_not_checked';
  end if;

  if not public.has_finance_approver(v_me) then
    raise exception 'Approving a payment takes the finance approver.'
      using errcode = '42501', detail = 'not_finance_approver';
  end if;

  -- THE SEPARATION OF DUTIES. Worded so nobody reads it as a permission that
  -- somebody in HR forgot to switch on.
  if v_v.prepared_by = v_me then
    raise exception
      'separation of duties: you prepared payment voucher %, so you may not also approve it. This is not a permissions problem and granting yourself another duty will not change it — two people sign a payment out, and the second one must be somebody else.',
      v_v.voucher_no
      using errcode = 'P0001', detail = 'separation_of_duties',
            hint = 'Ask another holder of the finance approver duty to approve it.';
  end if;

  -- Lock the bills this voucher pays, then re-check everything as it stands.
  perform 1 from public.supplier_bills b
   where b.id in (select a.bill_id from public.payment_voucher_allocations a
                   where a.voucher_id = p_voucher_id)
     for update;
  perform public._payment_voucher_validate(p_voucher_id);

  -- Dr each direct line.
  for r in select l.account_code, l.amount, l.description
             from public.payment_voucher_lines l
            where l.voucher_id = p_voucher_id order by l.line_no loop
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_code', r.account_code,
      'debit',  r.amount,
      'credit', 0,
      'memo',   coalesce(r.description, 'Payment voucher ' || v_v.voucher_no)));
  end loop;

  -- Dr each paid bill's OWN AP control, party = that bill's supplier.
  for r in select b.ap_account_code, b.supplier_id, b.bill_no, b.supplier_invoice_no,
                  a.amount_applied
             from public.payment_voucher_allocations a
             join public.supplier_bills b on b.id = a.bill_id
            where a.voucher_id = p_voucher_id
            order by b.bill_date, b.bill_no loop
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_code', r.ap_account_code,
      'debit',  r.amount_applied,
      'credit', 0,
      'party_type', 'SUPPLIER',
      'party_id',   r.supplier_id,
      'memo',   'Pays ' || r.bill_no || ' · invoice ' || r.supplier_invoice_no));
  end loop;

  -- Dr the advance to the supplier's own payables control (0484). The bill it
  -- is knocked off later credits the same account and party, so the knock-off
  -- itself moves nothing.
  if v_v.advance_amount > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_code', v_v.ap_account_code,
      'debit',  v_v.advance_amount,
      'credit', 0,
      'party_type', 'SUPPLIER',
      'party_id',   v_v.supplier_id,
      'memo',   'Advance · ' || v_v.voucher_no));
  end if;

  -- Cr the money account, for the whole voucher.
  v_lines := v_lines || jsonb_build_array(jsonb_build_object(
    'account_code', v_v.pay_from_account_code,
    'debit',  0,
    'credit', v_v.amount,
    'memo',   concat_ws(' · ',
                case v_v.pay_method
                  when 'BANK_TRANSFER' then 'Bank transfer'
                  when 'CHEQUE' then 'Cheque'
                  when 'CASH' then 'Cash'
                  else 'Other' end,
                v_v.pay_reference,
                v_v.payee_name)));

  v_entry := public.gl_post(
    'PAYMENT_VOUCHER',
    v_v.voucher_no,
    v_v.voucher_date,
    coalesce(v_v.narration, 'Payment voucher ' || v_v.voucher_no || ' · ' || v_v.payee_name),
    v_lines);

  update public.payment_vouchers
     set status      = 'approved',
         gl_entry_id = v_entry,
         approved_at = now(),
         approved_by = v_me
   where id = p_voucher_id;

  perform public._ap_event('PAYMENT_VOUCHER', p_voucher_id, 'approved', v_v.voucher_no);
  return v_entry;
end;
$fn$;

-- 5d · cancel: refused while the advance is knocked off a bill or partly back.
create or replace function public.payment_voucher_cancel(p_voucher_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     text := public.app_role()::text;
  v_v        public.payment_vouchers%rowtype;
  v_open     numeric(12,2);
  v_reversal uuid;
begin
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Say why this voucher is cancelled.'
      using errcode = 'P0001', detail = 'reason_missing';
  end if;

  select * into v_v from public.payment_vouchers where id = p_voucher_id for update;
  if not found then
    raise exception 'That payment voucher does not exist.'
      using errcode = 'P0002', detail = 'voucher_missing';
  end if;
  if v_v.status = 'cancelled' then
    raise exception 'This payment voucher is already cancelled.'
      using errcode = 'P0001', detail = 'already_cancelled';
  end if;

  if v_v.status = 'approved' then
    -- Money left the bank. Unbooking it takes the same approver who let it go.
    if not public.has_finance_approver(auth.uid()) then
      raise exception 'Cancelling an approved payment takes the finance approver.'
        using errcode = '42501', detail = 'not_finance_approver';
    end if;
    -- 0484: reversing the voucher reverses the whole advance. If part of it
    -- already settles a bill, or came back, the bill would stay paid by money
    -- the ledger no longer shows. Those come off first. (The voucher row is
    -- locked above; the knock-off and money-back doors lock it too.)
    if v_v.advance_amount > 0 then
      v_open := coalesce((select ao.advance_open from public.supplier_advance_open(p_voucher_id) ao), 0);
      if v_open < v_v.advance_amount then
        raise exception 'RM % of this voucher''s advance is taken off bills or has come back. Take the advance off each bill, and cancel each money back, before cancelling the voucher.',
          to_char(v_v.advance_amount - v_open, 'FM999,999,999,990.00')
          using errcode = 'P0001', detail = 'advance_in_use';
      end if;
    end if;
    v_reversal := public.gl_reverse(v_v.gl_entry_id, btrim(p_reason));
  else
    if v_role is null or v_role not in ('finance','principal') then
      raise exception 'only finance cancels a payment voucher'
        using errcode = '42501', detail = 'not_finance';
    end if;
  end if;

  update public.payment_vouchers
     set status            = 'cancelled',
         reversal_entry_id = v_reversal,
         cancelled_at      = now(),
         cancelled_by      = auth.uid(),
         cancel_reason     = btrim(p_reason)
   where id = p_voucher_id;

  perform public._ap_event('PAYMENT_VOUCHER', p_voucher_id, 'cancelled', btrim(p_reason));
  return v_reversal;
end;
$fn$;


-- ── 6 · nobody writes the new tables from outside ────────────────────────────
alter table public.supplier_advance_applications enable row level security;
alter table public.supplier_advance_money_back   enable row level security;

revoke all on public.supplier_advance_applications from anon, authenticated;
revoke all on public.supplier_advance_money_back   from anon, authenticated;

grant select on public.supplier_advance_applications to authenticated;
grant select on public.supplier_advance_money_back   to authenticated;

create policy supplier_advance_applications_read_internal
  on public.supplier_advance_applications for select using (public.gl_may_read());
create policy supplier_advance_money_back_read_internal
  on public.supplier_advance_money_back for select using (public.gl_may_read());

-- Internal helpers and trigger functions: nobody calls them over the API.
revoke all on function public.ap_bill_paid(uuid)                        from public, anon, authenticated;
revoke all on function public.supplier_advance_open(uuid)               from public, anon, authenticated;
revoke all on function public.supplier_advance_application_frozen()     from public, anon, authenticated;
revoke all on function public.supplier_advance_money_back_frozen()      from public, anon, authenticated;

-- The two recreated doors: back to exactly what 0477 granted.
revoke all on function public.ap_outstanding(uuid) from public, anon;
grant execute on function public.ap_outstanding(uuid) to authenticated;
revoke all on function public.payment_voucher_save_draft(uuid, text, uuid, text, date, text, jsonb, jsonb, text, text, text, numeric) from public, anon;
grant execute on function public.payment_voucher_save_draft(uuid, text, uuid, text, date, text, jsonb, jsonb, text, text, text, numeric) to authenticated;


-- ── 7 · sanity ───────────────────────────────────────────────────────────────
do $sanity$
declare
  v_missing text;
  v_src     text;
  v_fn      text;
begin
  -- 1 · the column
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'payment_vouchers'
                    and column_name = 'advance_amount' and is_nullable = 'NO'
                    and numeric_precision = 12 and numeric_scale = 2) then
    raise exception '0484 sanity: payment_vouchers.advance_amount is missing or has the wrong shape';
  end if;

  -- 2 · every function, by name AND argument types
  select string_agg(x.fn || '(' || x.args || ')', ', ') into v_missing
    from (values
      ('ap_bill_paid',                        'uuid'),
      ('supplier_advance_open',               'uuid'),
      ('ap_outstanding',                      'uuid'),
      ('ap_bill_outstanding',                 'uuid'),
      ('supplier_bill_register',              ''),
      ('supplier_bill_cancel',                'uuid, text'),
      ('pv_allocation_ceiling',               ''),
      ('_payment_voucher_validate',           'uuid'),
      ('payment_voucher_save_draft',          'uuid, text, uuid, text, date, text, jsonb, jsonb, text, text, text, numeric'),
      ('payment_voucher_approve',             'uuid'),
      ('payment_voucher_cancel',              'uuid, text'),
      ('payment_voucher_frozen',              ''),
      ('supplier_advance_application_frozen', ''),
      ('supplier_advance_money_back_frozen',  '')
    ) as x(fn, args)
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = x.fn
        and oidvectortypes(p.proargtypes) = x.args);
  if v_missing is not null then
    raise exception '0484 sanity: missing or mis-typed: %', v_missing;
  end if;

  -- 3 · the old save door is gone (one overload only)
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'payment_voucher_save_draft') <> 1 then
    raise exception '0484 sanity: payment_voucher_save_draft must have exactly one overload';
  end if;

  -- 4 · ap_outstanding says advance_open and net_owing
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'ap_outstanding'
                    and 'advance_open' = any (p.proargnames)
                    and 'net_owing' = any (p.proargnames)
                    and 'balance_owing' = any (p.proargnames)) then
    raise exception '0484 sanity: ap_outstanding lost balance_owing or lacks advance_open / net_owing';
  end if;

  -- 5 · law D: every re-routed copy reads the helper
  foreach v_fn in array array['pv_allocation_ceiling','_payment_voucher_validate',
                              'supplier_bill_cancel','supplier_bill_register',
                              'ap_bill_outstanding','ap_outstanding'] loop
    select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn;
    if position('ap_bill_paid(' in v_src) = 0 then
      raise exception '0484 sanity: % still adds up what is paid on a bill by itself', v_fn;
    end if;
  end loop;
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ap_outstanding';
  if position('supplier_advance_open(' in v_src) = 0 then
    raise exception '0484 sanity: ap_outstanding does not read supplier_advance_open';
  end if;

  -- 6 · the approve posts the advance with its supplier; the cancel guards it
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'payment_voucher_approve';
  if position('v_v.advance_amount' in v_src) = 0 or position('separation of duties' in v_src) = 0 then
    raise exception '0484 sanity: payment_voucher_approve lost the advance or its duty rule';
  end if;
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'payment_voucher_cancel';
  if position('advance_in_use' in v_src) = 0 then
    raise exception '0484 sanity: payment_voucher_cancel does not guard an advance in use';
  end if;
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'payment_voucher_frozen';
  if position('new.advance_amount' in v_src) = 0 then
    raise exception '0484 sanity: a prepared voucher''s advance is not locked';
  end if;

  -- 7 · the new tables are read-only from outside, and the helpers are internal
  select string_agg(c.relname, ', ') into v_missing
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('supplier_advance_applications','supplier_advance_money_back')
     and (not c.relrowsecurity
          or has_table_privilege('authenticated', c.oid, 'insert')
          or has_table_privilege('authenticated', c.oid, 'update')
          or has_table_privilege('authenticated', c.oid, 'delete')
          or has_table_privilege('anon', c.oid, 'select')
          or not has_table_privilege('authenticated', c.oid, 'select'));
  if v_missing is not null then
    raise exception '0484 sanity: not locked down: %', v_missing;
  end if;
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname in ('supplier_advance_applications','supplier_advance_money_back')) <> 2 then
    raise exception '0484 sanity: a new table is missing';
  end if;
  if has_function_privilege('authenticated', 'public.ap_bill_paid(uuid)', 'execute')
     or has_function_privilege('anon', 'public.ap_bill_paid(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.supplier_advance_open(uuid)', 'execute')
     or has_function_privilege('anon', 'public.supplier_advance_open(uuid)', 'execute') then
    raise exception '0484 sanity: a law-D helper is callable from outside';
  end if;
  if not has_function_privilege('authenticated', 'public.ap_outstanding(uuid)', 'execute')
     or has_function_privilege('anon', 'public.ap_outstanding(uuid)', 'execute')
     or not has_function_privilege('authenticated',
          'public.payment_voucher_save_draft(uuid, text, uuid, text, date, text, jsonb, jsonb, text, text, text, numeric)', 'execute')
     or has_function_privilege('anon',
          'public.payment_voucher_save_draft(uuid, text, uuid, text, date, text, jsonb, jsonb, text, text, text, numeric)', 'execute') then
    raise exception '0484 sanity: a recreated door did not get 0477''s grants back';
  end if;

  -- 8 · fail closed: a caller with no internal role gets an error, never rows.
  begin
    perform * from public.ap_outstanding(null);
    raise exception '0484 sanity: an anonymous caller was not refused';
  exception
    when insufficient_privilege then null;
  end;
end
$sanity$;
