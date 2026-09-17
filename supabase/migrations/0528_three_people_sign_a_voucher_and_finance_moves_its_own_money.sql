-- =============================================================================
-- 0528_three_people_sign_a_voucher_and_finance_moves_its_own_money.sql
-- =============================================================================
-- WHAT WAS WRONG
--   A. The finance lead describes a payment voucher as three people: staff
--      prepares, finance checks, the boss approves. 0477 let the CHECKER also
--      approve (its constraint compared checker and approver only with the
--      preparer), so in practice two people signed money out.
--   B. Two money moves Finance makes every month had no door Finance may use:
--        - a bank transfer between two of Carres's own cash or bank accounts
--          (e.g. Public Bank to Hong Leong);
--        - a card payout: the card company pays what sat in a holding account
--          (e.g. 1131 GHL) into a bank, less its fee.
--      The only way was gl_manual_journal, which is principal-only (ruling M).
--
-- WHAT THIS CHANGES
--   A. payment_voucher_approve refuses when the approver checked the voucher
--      (42501, detail checker_cannot_approve). The body is the latest one,
--      0484_a_supplier_can_be_paid_before_its_bill.sql, changed only where
--      marked 0528. A new constraint payment_vouchers_checker_is_not_approver
--      says the same, NOT VALID: a voucher approved before today by its own
--      checker stays as it is.
--   B. public.gl_money_moves: one small document for both moves.
--        kind TRANSFER     from a CASH/BANK account to another CASH/BANK
--                          account. Dr to, Cr from, amount. fee is 0.
--        kind CARD_PAYOUT  from a HOLDING account to a BANK account.
--                          amount = what reached the bank, fee = what the card
--                          company kept.
--                          Dr bank amount, Dr 6500 fee, Cr holding amount+fee.
--      Both accounts must be in use on gl_money_accounts (0512).
--      Numbered MM-YYYYMMDD-NNNN (allocate_formal_document_code, drawn).
--      Flow: prepared (finance or principal) -> approved (the finance
--      approver, 0508, who did not prepare it; only approval posts, through
--      gl_post, source MONEY_TRANSFER or CARD_PAYOUT) -> reversed (the finance
--      approver; gl_reverse). A prepared move that is wrong is cancelled
--      (finance); nothing was posted, so nothing is reversed. Never deleted.
--      Doors: gl_money_move_create, gl_money_move_approve,
--      gl_money_move_reverse, gl_money_move_list.
--
-- RLS: gl_money_moves is read by gl_may_read and written only by the doors.
-- DATA: one gl_doc_series row (MM). DR/CR: as above, only on approval.
-- =============================================================================

begin;

-- ── A · the checker does not approve ─────────────────────────────────────────
alter table public.payment_vouchers
  add constraint payment_vouchers_checker_is_not_approver
    check (approved_by is null or checked_by is null or approved_by <> checked_by) not valid;

-- Body from 0484. Changed only where marked 0528.
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

  -- 0528: three people sign a payment out. The checker is not the approver.
  if v_v.checked_by = v_me then
    raise exception
      'You checked payment voucher %, so somebody else must approve it. Three different people prepare, check and approve a payment.',
      v_v.voucher_no
      using errcode = '42501', detail = 'checker_cannot_approve',
            hint = 'Ask another finance approver to approve it.';
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


-- ── B · money moves ──────────────────────────────────────────────────────────
-- The prefix: checked 17 Sep 2026 against gl_doc_series (JE SB PV MJ ARI RV),
-- allocate_formal_document_code callers (ARI GRN MPR PO PV RO RV SB TR) and
-- hand-built numbers (SO DL DO INV CN IS QTY RA RC REQ RU SC). MM is free.
insert into public.gl_doc_series (prefix, description) values
  ('MM', 'Money move — a bank transfer or a card payout between Finance''s own money accounts (0528)');

create table public.gl_money_moves (
  id                 uuid primary key default gen_random_uuid(),
  move_no            text not null unique,
  kind               text not null check (kind in ('TRANSFER','CARD_PAYOUT')),
  move_date          date not null,
  from_account_code  text not null references public.gl_accounts(code),
  to_account_code    text not null references public.gl_accounts(code),
  -- What reached the receiving account.
  amount             numeric(12,2) not null check (amount > 0),
  -- What the card company kept. Always 0 on a transfer.
  fee                numeric(12,2) not null default 0 check (fee >= 0),
  reference          text check (reference is null or length(reference) <= 120),
  note               text check (note is null or length(note) <= 500),
  status             text not null default 'prepared'
                       check (status in ('prepared','approved','reversed','cancelled')),
  idempotency_key    uuid unique,
  prepared_by        uuid not null references public.app_users(id),
  prepared_at        timestamptz not null default now(),
  approved_by        uuid references public.app_users(id),
  approved_at        timestamptz,
  gl_entry_id        uuid references public.gl_entries(id),
  ended_by           uuid references public.app_users(id),
  ended_at           timestamptz,
  end_reason         text,
  reversal_entry_id  uuid references public.gl_entries(id),
  constraint gl_money_moves_two_accounts check (from_account_code <> to_account_code),
  constraint gl_money_moves_transfer_has_no_fee check (kind <> 'TRANSFER' or fee = 0),
  constraint gl_money_moves_preparer_is_not_approver
    check (approved_by is null or approved_by <> prepared_by),
  constraint gl_money_moves_approved_is_posted
    check (status not in ('approved','reversed')
           or (gl_entry_id is not null and approved_by is not null and approved_at is not null)),
  constraint gl_money_moves_end_is_complete
    check (status not in ('reversed','cancelled')
           or (ended_by is not null and ended_at is not null
               and length(btrim(coalesce(end_reason, ''))) > 0)),
  constraint gl_money_moves_reversal_is_posted
    check (status <> 'reversed' or reversal_entry_id is not null)
);
create index gl_money_moves_date_idx on public.gl_money_moves (move_date desc);

alter table public.gl_money_moves enable row level security;
revoke all on public.gl_money_moves from anon, authenticated;
grant select on public.gl_money_moves to authenticated;
create policy gl_money_moves_read_finance on public.gl_money_moves
  for select using ((select public.gl_may_read()));

-- Never deleted; a finished move is final; nothing but the status stamps moves.
create or replace function public.gl_money_move_frozen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'A money move is never deleted. Reverse or cancel it instead.'
      using errcode = '42501', detail = 'no_delete';
  end if;
  if old.status in ('reversed','cancelled')
     or new.move_no           is distinct from old.move_no
     or new.kind              is distinct from old.kind
     or new.move_date         is distinct from old.move_date
     or new.from_account_code is distinct from old.from_account_code
     or new.to_account_code   is distinct from old.to_account_code
     or new.amount            is distinct from old.amount
     or new.fee               is distinct from old.fee
     or new.reference         is distinct from old.reference
     or new.note              is distinct from old.note
     or new.prepared_by       is distinct from old.prepared_by
     or new.prepared_at       is distinct from old.prepared_at
     or new.idempotency_key   is distinct from old.idempotency_key
     or (old.status = 'approved'
         and (new.gl_entry_id is distinct from old.gl_entry_id
              or new.approved_by is distinct from old.approved_by
              or new.approved_at is distinct from old.approved_at)) then
    raise exception 'A money move cannot be edited. Cancel or reverse it and enter a new one.'
      using errcode = '42501', detail = 'money_move_locked';
  end if;
  return new;
end;
$fn$;

create trigger gl_money_move_frozen_trg
  before update or delete on public.gl_money_moves
  for each row execute function public.gl_money_move_frozen();

-- The account rule, in one place, for create and again at approve.
create or replace function public._gl_money_move_check(
  p_kind text, p_from text, p_to text, p_amount numeric, p_fee numeric, p_date date)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_from_kind text;
  v_to_kind   text;
begin
  if p_kind is null or p_kind not in ('TRANSFER','CARD_PAYOUT') then
    raise exception 'Choose a bank transfer or a card payout.'
      using errcode = '22023', detail = 'kind_missing';
  end if;
  if p_date is null then
    raise exception 'Choose the date the money moved.'
      using errcode = '22023', detail = 'date_missing';
  end if;
  perform public.fin_refuse_before_go_live(p_date, 'This money move');

  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'The amount must be more than RM 0.00, in sen at most.'
      using errcode = '22023', detail = 'amount_invalid';
  end if;
  if p_fee is null or p_fee < 0 or p_fee <> round(p_fee, 2) then
    raise exception 'The fee must be RM 0.00 or more, in sen at most.'
      using errcode = '22023', detail = 'fee_invalid';
  end if;
  if p_kind = 'TRANSFER' and p_fee <> 0 then
    raise exception 'A bank transfer has no fee. Record a bank charge on a payment voucher.'
      using errcode = '22023', detail = 'fee_on_transfer';
  end if;
  if p_from is not distinct from p_to then
    raise exception 'The money must move between two different accounts.'
      using errcode = '22023', detail = 'same_account';
  end if;

  -- 'in' is every in-use CASH, BANK and HOLDING leaf (0512); the kind narrows it.
  select m.money_kind into v_from_kind from public.gl_money_accounts m
   where m.account_code = p_from and public.gl_money_account_ok(p_from, 'in');
  select m.money_kind into v_to_kind from public.gl_money_accounts m
   where m.account_code = p_to and public.gl_money_account_ok(p_to, 'in');

  if p_kind = 'TRANSFER' then
    if v_from_kind is null or v_from_kind not in ('CASH','BANK') then
      raise exception 'Paid from must be a cash or bank account in use.'
        using errcode = '22023', detail = 'from_account_refused';
    end if;
    if v_to_kind is null or v_to_kind not in ('CASH','BANK') then
      raise exception 'Paid into must be a cash or bank account in use.'
        using errcode = '22023', detail = 'to_account_refused';
    end if;
  else
    if v_from_kind is distinct from 'HOLDING' then
      raise exception 'A card payout comes from a card or online holding account in use.'
        using errcode = '22023', detail = 'from_account_refused';
    end if;
    if v_to_kind is distinct from 'BANK' then
      raise exception 'A card payout goes into a bank account in use.'
        using errcode = '22023', detail = 'to_account_refused';
    end if;
  end if;
end;
$fn$;

create or replace function public.gl_money_move_create(
  p_kind              text,
  p_move_date         date,
  p_from_account_code text,
  p_to_account_code   text,
  p_amount            numeric,
  p_fee               numeric default 0,
  p_reference         text    default null,
  p_note              text    default null,
  p_idempotency_key   uuid    default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     text := public.app_role()::text;
  v_existing uuid;
  v_id       uuid := gen_random_uuid();
  v_fee      numeric := coalesce(p_fee, 0);
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance records a money move.'
      using errcode = '42501', detail = 'not_finance';
  end if;

  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('gl_money_move:' || p_idempotency_key::text, 0));
    select id into v_existing from public.gl_money_moves where idempotency_key = p_idempotency_key;
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  perform public._gl_money_move_check(p_kind, btrim(p_from_account_code), btrim(p_to_account_code),
                                      p_amount, v_fee, p_move_date);

  insert into public.gl_money_moves
    (id, move_no, kind, move_date, from_account_code, to_account_code, amount, fee,
     reference, note, idempotency_key, prepared_by)
  values
    (v_id, public.allocate_formal_document_code('MM', v_id::text, p_move_date),
     p_kind, p_move_date, btrim(p_from_account_code), btrim(p_to_account_code), p_amount, v_fee,
     nullif(btrim(coalesce(p_reference, '')), ''),
     nullif(btrim(coalesce(p_note, '')), ''),
     p_idempotency_key, auth.uid());
  return v_id;
end;
$fn$;

create or replace function public.gl_money_move_approve(p_move_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_me    uuid := auth.uid();
  v_m     public.gl_money_moves%rowtype;
  v_what  text;
  v_lines jsonb;
  v_entry uuid;
begin
  if not public.has_finance_approver(v_me) then
    raise exception 'Approving a money move takes the finance approver.'
      using errcode = '42501', detail = 'not_finance_approver';
  end if;
  select * into v_m from public.gl_money_moves where id = p_move_id for update;
  if not found then
    raise exception 'That money move does not exist.'
      using errcode = 'P0002', detail = 'money_move_missing';
  end if;
  if v_m.status <> 'prepared' then
    raise exception 'Money move % is %, so it cannot be approved.', v_m.move_no, v_m.status
      using errcode = 'P0001', detail = 'money_move_not_prepared';
  end if;
  if v_m.prepared_by = v_me then
    raise exception 'You prepared money move %, so somebody else must approve it.', v_m.move_no
      using errcode = '42501', detail = 'preparer_cannot_approve';
  end if;

  -- The accounts may have gone out of use since it was prepared.
  perform public._gl_money_move_check(v_m.kind, v_m.from_account_code, v_m.to_account_code,
                                      v_m.amount, v_m.fee, v_m.move_date);

  v_what := case v_m.kind when 'TRANSFER' then 'Bank transfer' else 'Card payout' end
            || ' ' || v_m.move_no;
  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', v_m.to_account_code, 'debit', v_m.amount, 'credit', 0,
                       'memo', v_what),
    jsonb_build_object('account_code', v_m.from_account_code, 'debit', 0,
                       'credit', v_m.amount + v_m.fee, 'memo', v_what));
  if v_m.fee > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_code', '6500', 'debit', v_m.fee, 'credit', 0, 'memo', 'Card fee · ' || v_m.move_no));
  end if;

  v_entry := public.gl_post(
    case v_m.kind when 'TRANSFER' then 'MONEY_TRANSFER' else 'CARD_PAYOUT' end,
    v_m.move_no,
    v_m.move_date,
    coalesce(v_m.note, v_what),
    v_lines);

  update public.gl_money_moves
     set status = 'approved', approved_by = v_me, approved_at = now(), gl_entry_id = v_entry
   where id = p_move_id;
  return v_entry;
end;
$fn$;

-- Prepared: cancelled by Finance, nothing to undo. Approved: reversed by the
-- finance approver, on the original date (gl_reverse).
create or replace function public.gl_money_move_reverse(p_move_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     text := public.app_role()::text;
  v_m        public.gl_money_moves%rowtype;
  v_reversal uuid;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance cancels a money move.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Type why the money move is cancelled.'
      using errcode = '22023', detail = 'reason_missing';
  end if;
  select * into v_m from public.gl_money_moves where id = p_move_id for update;
  if not found then
    raise exception 'That money move does not exist.'
      using errcode = 'P0002', detail = 'money_move_missing';
  end if;
  if v_m.status in ('reversed','cancelled') then
    raise exception 'Money move % is already %.', v_m.move_no, v_m.status
      using errcode = 'P0001', detail = 'money_move_ended';
  end if;

  if v_m.status = 'approved' then
    if not public.has_finance_approver(auth.uid()) then
      raise exception 'Reversing a posted money move takes the finance approver.'
        using errcode = '42501', detail = 'not_finance_approver';
    end if;
    v_reversal := public.gl_reverse(v_m.gl_entry_id, btrim(p_reason));
  end if;

  update public.gl_money_moves
     set status            = case when v_reversal is null then 'cancelled' else 'reversed' end,
         reversal_entry_id = v_reversal,
         ended_by          = auth.uid(),
         ended_at          = now(),
         end_reason        = btrim(p_reason)
   where id = p_move_id;
  return p_move_id;
end;
$fn$;

create or replace function public.gl_money_move_list()
returns table (
  move_id          uuid,
  move_no          text,
  kind             text,
  status           text,
  move_date        date,
  from_account_code text,
  from_account_name text,
  to_account_code  text,
  to_account_name  text,
  amount           numeric(12,2),
  fee              numeric(12,2),
  reference        text,
  note             text,
  prepared_by_name text,
  prepared_by_me   boolean,
  prepared_at      timestamptz,
  approved_by_name text,
  approved_at      timestamptz,
  ended_by_name    text,
  ended_at         timestamptz,
  end_reason       text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.gl_may_read() then
    raise exception 'Money moves are for Finance.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  return query
  select m.id, m.move_no, m.kind, m.status, m.move_date,
         m.from_account_code, fa.name, m.to_account_code, ta.name,
         m.amount, m.fee, m.reference, m.note,
         (select u.name from public.app_users u where u.id = m.prepared_by),
         m.prepared_by = auth.uid(),
         m.prepared_at,
         (select u.name from public.app_users u where u.id = m.approved_by),
         m.approved_at,
         (select u.name from public.app_users u where u.id = m.ended_by),
         m.ended_at, m.end_reason
    from public.gl_money_moves m
    join public.gl_accounts fa on fa.code = m.from_account_code
    join public.gl_accounts ta on ta.code = m.to_account_code
   order by m.move_date desc, m.prepared_at desc;
end;
$fn$;

revoke all on function public.gl_money_move_frozen() from public, anon, authenticated;
revoke all on function public._gl_money_move_check(text, text, text, numeric, numeric, date) from public, anon, authenticated;
revoke all on function public.gl_money_move_create(text, date, text, text, numeric, numeric, text, text, uuid) from public, anon;
revoke all on function public.gl_money_move_approve(uuid) from public, anon;
revoke all on function public.gl_money_move_reverse(uuid, text) from public, anon;
revoke all on function public.gl_money_move_list() from public, anon;
grant execute on function public.gl_money_move_create(text, date, text, text, numeric, numeric, text, text, uuid) to authenticated;
grant execute on function public.gl_money_move_approve(uuid) to authenticated;
grant execute on function public.gl_money_move_reverse(uuid, text) to authenticated;
grant execute on function public.gl_money_move_list() to authenticated;


-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_src text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'payment_voucher_approve';
  if position('checker_cannot_approve' in v_src) = 0 or position('separation of duties' in v_src) = 0
     or position('v_v.advance_amount' in v_src) = 0 then
    raise exception '0528 sanity: payment_voucher_approve lacks the checker rule, the preparer rule or the advance';
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'payment_vouchers_checker_is_not_approver') then
    raise exception '0528 sanity: the checker constraint is missing';
  end if;
  if not exists (select 1 from public.gl_accounts
                  where code = '6500' and kind = 'EXPENSE' and is_active and not is_control) then
    raise exception '0528 sanity: 6500 Bank and payment charges is not an active expense account';
  end if;
  if has_function_privilege('anon', 'public.gl_money_move_create(text, date, text, text, numeric, numeric, text, text, uuid)', 'execute')
     or has_function_privilege('anon', 'public.gl_money_move_approve(uuid)', 'execute')
     or has_function_privilege('anon', 'public.gl_money_move_reverse(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.gl_money_move_list()', 'execute')
     or has_function_privilege('authenticated', 'public._gl_money_move_check(text, text, text, numeric, numeric, date)', 'execute')
     or has_table_privilege('anon', 'public.gl_money_moves', 'select')
     or has_table_privilege('authenticated', 'public.gl_money_moves', 'insert')
     or has_table_privilege('authenticated', 'public.gl_money_moves', 'update')
     or has_table_privilege('authenticated', 'public.gl_money_moves', 'delete') then
    raise exception '0528 sanity: a money-move door or the table is open past its gate';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('payment_voucher_approve', 'gl_money_move_frozen', '_gl_money_move_check',
                                  'gl_money_move_create', 'gl_money_move_approve',
                                  'gl_money_move_reverse', 'gl_money_move_list')
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0528 sanity: a function lost security definer or its search_path';
  end if;
end
$sanity$;

commit;
