-- =============================================================================
-- 0462_a_supplier_bill_is_a_document.sql
-- THE LEDGER · CARD D — ACCOUNTS PAYABLE
-- (rulings J/K/L/M/N, .claude/LEDGER-CONTRACT.md; boundary from
--  docs/purchasing/MASTER.md §1 line 37 and §13 line 1482.)
--
-- WHAT CARRES HAS TODAY, MEASURED
--   · `purchase_orders` (0001_init.sql:322, id is TEXT) — what we asked a
--     supplier to send.
--   · `po_receipts` (0001_init.sql:355) — what physically arrived against a PO.
--   · `purchase_order_lines.cost` (0055) — what we EXPECTED to pay.
--   · `purchase_orders.pay_status` — a three-word enum on the PO header.
--
--   And that is the whole of it. Nowhere in this repository is there a record of
--   what the supplier actually BILLED us, nor of a payment we made to one. The
--   PO is a promise, the receipt is goods, `pay_status` is a flag somebody sets
--   by hand. None of the three is a document, none carries an amount owed, and
--   none can be added up. Purchasing MASTER §1 has always said Finance/AP owns
--   "supplier invoice, settlement, credit and payment" — it just had nothing to
--   own it WITH. This migration builds the two missing documents.
--
-- THE TWO DOCUMENTS
--   ① SUPPLIER BILL (`SB-YYYYMM-NNNN`) — the supplier's invoice, as we received
--      it. It carries THEIR invoice number in its own field, because that is
--      the number the supplier will quote on the phone and it is not ours to
--      mint. `draft → confirmed`. Confirming posts:
--          Dr  expense / inventory, per line
--          Cr  accounts payable (control), party = the supplier
--      A draft posts nothing. A confirmed bill is frozen: no edit, no delete.
--      A mistake is undone by reversal, exactly like every other posted thing.
--
--   ② PAYMENT VOUCHER (`PV-YYYYMM-NNNN`) — OUR decision to pay bills.
--      `draft → prepared → released` (ruling M).
--          PREPARE  = role `finance`. Checks the arithmetic and freezes the
--                     numbers. POSTS NOTHING. Nothing has moved yet.
--          RELEASE  = the position holding the `finance_approver` duty
--                     (0260_hr_duty_keys.sql:37). Release is the act that moves
--                     money, so release is what posts:
--                         Dr  accounts payable (control), party = the supplier
--                         Cr  bank / cash
--      AND THE SAME PERSON MAY NOT DO BOTH. That is not a permission setting to
--      be relaxed on a busy day; it is the entire reason the two steps exist. It
--      is enforced in `payment_voucher_release`, and the refusal says so in
--      words, because a message that reads like a missing permission is a
--      message somebody will try to fix by granting themselves a permission.
--
-- WHY THE ALLOCATION TABLE IS MANY-TO-MANY
--   One transfer clears four invoices; one large invoice is paid over three
--   months. Both happen, and a `bill.paid_amount` column can represent neither
--   honestly. `payment_voucher_allocations` says which voucher money landed on
--   which bill, and the ceilings — no bill over-allocated, no voucher
--   over-spent — are held by a trigger that locks the rows it is checking, not
--   by application code that a second tab can race.
--
-- WHAT IS NOT CACHED
--   There is no `amount_paid`, no `balance`, no `is_settled` column anywhere
--   below. `ap_outstanding()` recomputes from rows every time it is asked, and
--   it returns a row for EVERY supplier, including the ones that owe nothing —
--   so that "not in the list" can never be read as "nothing owed". Those two
--   sentences mean the same thing to a database and opposite things to a person
--   at 6pm.
--
-- GO-LIVE (ruling L)
--   A bill or voucher dated before `gl_config.go_live_on` is refused at confirm
--   and at release, naming the date. Customer payments have legacy history to
--   walk past; these two documents have none — they are born here — so there is
--   nothing to be lenient about.
--
-- NO `DELETE` STATEMENT APPEARS IN THIS FILE.
-- =============================================================================


-- ── 1 · who may release money ────────────────────────────────────────────────
-- Checked first: `0260_hr_duty_keys.sql:37` registers the `finance_approver`
-- duty key but ships NO helper for it. The nearest existing helper is
-- `ops_stock_plan_has_duty(text)` (0287_ready_stock_plan.sql:164) — generic in
-- the duty, but it reads `auth.uid()` and takes no user argument, so it cannot
-- answer "did THIS person prepare it", which is the whole question a
-- separation-of-duties check asks. Hence a helper with the caller supplied.
-- Its rules are copied from 0287/0362 verbatim, deliberately: principal always
-- passes (0260's standing law), the account must be active, and a dealer never
-- holds an internal duty however the position table is edited.
create or replace function public.has_finance_approver(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(
    (select role from public.app_users
      where id = p_user_id and status = 'active') = 'principal'
    or exists (
      select 1
        from public.app_users u
        join public.org_position_duties pd on pd.position_id = u.position_id
       where u.id = p_user_id
         and u.status = 'active'
         and u.role <> 'dealer'
         and pd.duty_key = 'finance_approver'
    ),
  false);
$fn$;

comment on function public.has_finance_approver(uuid) is
  'Ruling M release gate. True if the given user holds the finance_approver duty (0260) or is principal. Takes the user id, not auth.uid(), so a separation-of-duties check can ask about the preparer.';


-- ── 2 · the supplier bill ────────────────────────────────────────────────────
create table public.supplier_bills (
  id                   uuid primary key default gen_random_uuid(),
  -- Ours. Minted at CONFIRM, not at create: a draft that is abandoned must not
  -- burn a number out of the month's run.
  bill_no              text unique,
  -- Theirs. This is the number the supplier will say out loud. It is recorded
  -- as given and never normalised into our own scheme.
  supplier_invoice_no  text not null
                         check (length(btrim(supplier_invoice_no)) > 0),
  supplier_id          uuid not null references public.suppliers(id),
  bill_date            date not null,
  due_date             date,
  -- The real Carres purchasing objects, by their real names and real types.
  -- `purchase_orders.id` is TEXT (0001_init.sql:322), not a uuid. Both links are
  -- optional and neither is a foreign key the bill depends on: a supplier can
  -- bill us for freight, a sample or a repair that no PO ever covered, and a
  -- bill that cannot be filed is a bill that gets filed in a drawer instead.
  po_id                text references public.purchase_orders(id),
  po_receipt_id        uuid references public.po_receipts(id),
  -- Which AP control account this bill sits in. Verified `is_control` at
  -- confirm, because a payable booked to a non-control account has no party and
  -- therefore no supplier statement.
  ap_account_code      text not null references public.gl_accounts(code),
  total_amount         numeric(12,2) not null default 0
                         check (total_amount >= 0),
  narration            text,
  status               text not null default 'draft'
                         check (status in ('draft','confirmed','cancelled')),
  gl_entry_id          uuid references public.gl_entries(id),
  reversal_entry_id    uuid references public.gl_entries(id),
  confirmed_at         timestamptz,
  confirmed_by         uuid references public.app_users(id),
  cancelled_at         timestamptz,
  cancelled_by         uuid references public.app_users(id),
  cancel_reason        text,
  created_at           timestamptz not null default now(),
  created_by           uuid references public.app_users(id),
  -- A confirmed bill has a number, an amount and a ledger entry, or it is not
  -- confirmed. The three arrive together or not at all.
  constraint supplier_bills_confirmed_is_complete
    check (status <> 'confirmed'
           or (bill_no is not null and gl_entry_id is not null
               and total_amount > 0 and confirmed_at is not null)),
  constraint supplier_bills_cancel_states_its_reason
    check (status <> 'cancelled'
           or length(btrim(coalesce(cancel_reason,''))) > 0)
);

-- The same invoice, entered twice, is how a supplier gets paid twice. Cancelled
-- rows are excluded so that correcting a mis-keyed bill does not permanently
-- poison its own invoice number.
create unique index supplier_bills_one_invoice_per_supplier
  on public.supplier_bills (supplier_id, lower(btrim(supplier_invoice_no)))
  where status <> 'cancelled';

create index supplier_bills_supplier_idx on public.supplier_bills (supplier_id, status);
create index supplier_bills_po_idx       on public.supplier_bills (po_id);
create index supplier_bills_date_idx     on public.supplier_bills (bill_date);

create table public.supplier_bill_lines (
  id           uuid primary key default gen_random_uuid(),
  bill_id      uuid not null references public.supplier_bills(id) on delete restrict,
  line_no      integer not null check (line_no > 0),
  -- Where the cost lands: an expense account, or inventory. Never the AP
  -- account — that is the other side, and the gate would refuse it for want of
  -- a party anyway.
  account_code text not null references public.gl_accounts(code),
  description  text,
  sku          text,
  qty          numeric(12,2) check (qty is null or qty > 0),
  amount       numeric(12,2) not null check (amount > 0),
  created_at   timestamptz not null default now(),
  unique (bill_id, line_no)
);
create index supplier_bill_lines_bill_idx on public.supplier_bill_lines (bill_id, line_no);


-- ── 3 · the payment voucher and its allocations ──────────────────────────────
create table public.payment_vouchers (
  id                 uuid primary key default gen_random_uuid(),
  -- Minted at PREPARE. Prepare is the step that freezes the numbers, so it is
  -- the step that earns the document number.
  voucher_no         text unique,
  supplier_id        uuid not null references public.suppliers(id),
  voucher_date       date not null,
  amount             numeric(12,2) not null check (amount > 0),
  pay_method         text not null default 'BANK_TRANSFER'
                       check (pay_method in ('BANK_TRANSFER','CHEQUE','CASH','OTHER')),
  pay_reference      text,
  bank_account_code  text not null references public.gl_accounts(code),
  ap_account_code    text not null references public.gl_accounts(code),
  narration          text,
  status             text not null default 'draft'
                       check (status in ('draft','prepared','released','cancelled')),
  gl_entry_id        uuid references public.gl_entries(id),
  reversal_entry_id  uuid references public.gl_entries(id),
  prepared_at        timestamptz,
  prepared_by        uuid references public.app_users(id),
  released_at        timestamptz,
  released_by        uuid references public.app_users(id),
  cancelled_at       timestamptz,
  cancelled_by       uuid references public.app_users(id),
  cancel_reason      text,
  created_at         timestamptz not null default now(),
  created_by         uuid references public.app_users(id),
  constraint payment_vouchers_prepared_is_stamped
    check (status not in ('prepared','released')
           or (voucher_no is not null and prepared_at is not null
               and prepared_by is not null)),
  constraint payment_vouchers_released_is_posted
    check (status <> 'released'
           or (gl_entry_id is not null and released_at is not null
               and released_by is not null)),
  -- The rule, written down where the database can also read it. The function
  -- refuses first and explains; this check is what stops any other path.
  constraint payment_vouchers_separation_of_duties
    check (released_by is null or prepared_by is null
           or released_by <> prepared_by),
  constraint payment_vouchers_cancel_states_its_reason
    check (status <> 'cancelled'
           or length(btrim(coalesce(cancel_reason,''))) > 0)
);
create index payment_vouchers_supplier_idx on public.payment_vouchers (supplier_id, status);
create index payment_vouchers_date_idx     on public.payment_vouchers (voucher_date);

-- Many to many, in both directions, because both directions really happen.
create table public.payment_voucher_allocations (
  id             uuid primary key default gen_random_uuid(),
  voucher_id     uuid not null references public.payment_vouchers(id) on delete restrict,
  bill_id        uuid not null references public.supplier_bills(id)   on delete restrict,
  amount_applied numeric(12,2) not null check (amount_applied > 0),
  created_at     timestamptz not null default now(),
  created_by     uuid references public.app_users(id),
  -- One voucher touches one bill once. Two lines for the same pair are two
  -- different numbers for one fact, and one of them is always the wrong one.
  unique (voucher_id, bill_id)
);
create index pv_alloc_bill_idx    on public.payment_voucher_allocations (bill_id);
create index pv_alloc_voucher_idx on public.payment_voucher_allocations (voucher_id);


-- ── 4 · the ceilings, held by the database ───────────────────────────────────
-- Two ceilings, one trigger. It locks the bill and the voucher it is about to
-- measure, so two operators allocating against the same invoice in two tabs
-- queue instead of both reading the same stale total and both passing.
create or replace function public.pv_allocation_ceiling()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_bill      public.supplier_bills%rowtype;
  v_voucher   public.payment_vouchers%rowtype;
  v_on_bill   numeric(12,2);
  v_on_voucher numeric(12,2);
begin
  select * into v_bill from public.supplier_bills
    where id = new.bill_id for update;
  select * into v_voucher from public.payment_vouchers
    where id = new.voucher_id for update;

  if v_bill.status <> 'confirmed' then
    raise exception
      'a payment voucher may only be allocated to a confirmed supplier bill; bill % is %',
      coalesce(v_bill.bill_no, v_bill.id::text), v_bill.status
      using errcode = '23514', detail = 'bill_not_confirmed';
  end if;

  if v_bill.supplier_id <> v_voucher.supplier_id then
    raise exception
      'payment voucher and supplier bill belong to different suppliers; one voucher pays one supplier'
      using errcode = '23514', detail = 'supplier_mismatch';
  end if;

  select coalesce(sum(a.amount_applied), 0)
    into v_on_bill
    from public.payment_voucher_allocations a
    join public.payment_vouchers v on v.id = a.voucher_id
   where a.bill_id = new.bill_id
     and v.status <> 'cancelled'
     and a.id <> new.id;

  if v_on_bill + new.amount_applied > v_bill.total_amount then
    raise exception
      'over-allocation refused: applying RM% to bill % would put % against a bill of RM% (RM% is already allocated to it)',
      to_char(new.amount_applied, 'FM999999999990.00'),
      coalesce(v_bill.bill_no, v_bill.id::text),
      to_char(v_on_bill + new.amount_applied, 'FM999999999990.00'),
      to_char(v_bill.total_amount, 'FM999999999990.00'),
      to_char(v_on_bill, 'FM999999999990.00')
      using errcode = '23514', detail = 'bill_over_allocated';
  end if;

  select coalesce(sum(a.amount_applied), 0)
    into v_on_voucher
    from public.payment_voucher_allocations a
   where a.voucher_id = new.voucher_id
     and a.id <> new.id;

  if v_on_voucher + new.amount_applied > v_voucher.amount then
    raise exception
      'over-allocation refused: payment voucher % is for RM% but its allocations would total RM%',
      coalesce(v_voucher.voucher_no, v_voucher.id::text),
      to_char(v_voucher.amount, 'FM999999999990.00'),
      to_char(v_on_voucher + new.amount_applied, 'FM999999999990.00')
      using errcode = '23514', detail = 'voucher_over_allocated';
  end if;

  return new;
end;
$fn$;

create trigger pv_allocation_ceiling_trg
  before insert or update on public.payment_voucher_allocations
  for each row execute function public.pv_allocation_ceiling();

-- An allocation may only be written while its voucher is a draft. Prepare
-- freezes the numbers; that is what prepare IS.
create or replace function public.pv_allocation_only_while_draft()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_status text;
  v_id     uuid := coalesce(new.voucher_id, old.voucher_id);
begin
  select status into v_status from public.payment_vouchers where id = v_id;
  if v_status is distinct from 'draft' then
    raise exception
      'allocations are frozen once a payment voucher is prepared; voucher is %', v_status
      using errcode = '42501', detail = 'voucher_not_draft';
  end if;
  if tg_op = 'DELETE' then
    raise exception
      'an allocation is never removed; cancel the draft voucher and write a new one'
      using errcode = '42501', detail = 'no_delete';
  end if;
  return new;
end;
$fn$;

create trigger pv_allocation_only_while_draft_trg
  before insert or update or delete on public.payment_voucher_allocations
  for each row execute function public.pv_allocation_only_while_draft();


-- ── 5 · immutability, enforced at the row ────────────────────────────────────
-- A confirmed bill may change in exactly one way: it may be cancelled, and the
-- cancellation may write only the cancellation columns. Everything else is
-- frozen. Nothing is ever deleted.
create or replace function public.supplier_bill_frozen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception
      'a supplier bill is never deleted; a confirmed bill is cancelled by reversal'
      using errcode = '42501', detail = 'no_delete';
  end if;

  if old.status = 'draft' then
    return new;                          -- a draft is still being written
  end if;

  if old.status = 'cancelled' then
    raise exception 'a cancelled supplier bill is final'
      using errcode = '42501', detail = 'bill_cancelled';
  end if;

  -- old.status = 'confirmed'
  if new.status <> 'cancelled' then
    raise exception
      'a confirmed supplier bill cannot be edited; cancel it by reversal and enter a corrected bill'
      using errcode = '42501', detail = 'bill_confirmed';
  end if;

  if new.bill_no             is distinct from old.bill_no
     or new.supplier_invoice_no is distinct from old.supplier_invoice_no
     or new.supplier_id      is distinct from old.supplier_id
     or new.bill_date        is distinct from old.bill_date
     or new.due_date         is distinct from old.due_date
     or new.po_id            is distinct from old.po_id
     or new.po_receipt_id    is distinct from old.po_receipt_id
     or new.ap_account_code  is distinct from old.ap_account_code
     or new.total_amount     is distinct from old.total_amount
     or new.narration        is distinct from old.narration
     or new.gl_entry_id      is distinct from old.gl_entry_id
     or new.confirmed_at     is distinct from old.confirmed_at
     or new.confirmed_by     is distinct from old.confirmed_by
     or new.created_at       is distinct from old.created_at
     or new.created_by       is distinct from old.created_by then
    raise exception
      'cancelling a supplier bill may change only its cancellation stamp, nothing else'
      using errcode = '42501', detail = 'bill_confirmed';
  end if;

  return new;
end;
$fn$;

create trigger supplier_bill_frozen_trg
  before update or delete on public.supplier_bills
  for each row execute function public.supplier_bill_frozen();

create or replace function public.supplier_bill_lines_frozen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_status text;
begin
  select status into v_status from public.supplier_bills
    where id = coalesce(new.bill_id, old.bill_id);

  if tg_op = 'DELETE' then
    raise exception
      'a supplier bill line is never deleted; cancel the bill and enter a corrected one'
      using errcode = '42501', detail = 'no_delete';
  end if;

  if v_status is distinct from 'draft' then
    raise exception
      'the lines of a % supplier bill are frozen', coalesce(v_status, 'missing')
      using errcode = '42501', detail = 'bill_not_draft';
  end if;
  return new;
end;
$fn$;

create trigger supplier_bill_lines_frozen_trg
  before insert or update or delete on public.supplier_bill_lines
  for each row execute function public.supplier_bill_lines_frozen();

create or replace function public.payment_voucher_frozen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception
      'a payment voucher is never deleted; a released voucher is cancelled by reversal'
      using errcode = '42501', detail = 'no_delete';
  end if;

  if old.status = 'draft' then
    return new;
  end if;

  if old.status = 'cancelled' then
    raise exception 'a cancelled payment voucher is final'
      using errcode = '42501', detail = 'voucher_cancelled';
  end if;

  if new.status not in ('prepared','released','cancelled')
     or (old.status = 'released' and new.status <> 'cancelled') then
    raise exception
      'a % payment voucher can only be released or cancelled', old.status
      using errcode = '42501', detail = 'voucher_locked';
  end if;

  -- The money facts are locked from prepare onward. Only the release and
  -- cancellation stamps may still be written.
  if new.voucher_no        is distinct from old.voucher_no
     or new.supplier_id       is distinct from old.supplier_id
     or new.voucher_date      is distinct from old.voucher_date
     or new.amount            is distinct from old.amount
     or new.pay_method        is distinct from old.pay_method
     or new.bank_account_code is distinct from old.bank_account_code
     or new.ap_account_code   is distinct from old.ap_account_code
     or new.prepared_at       is distinct from old.prepared_at
     or new.prepared_by       is distinct from old.prepared_by
     or new.created_at        is distinct from old.created_at
     or new.created_by        is distinct from old.created_by then
    raise exception
      'a prepared payment voucher''s numbers are locked; cancel it and prepare a new one'
      using errcode = '42501', detail = 'voucher_locked';
  end if;

  return new;
end;
$fn$;

create trigger payment_voucher_frozen_trg
  before update or delete on public.payment_vouchers
  for each row execute function public.payment_voucher_frozen();


-- ── 6 · go-live, refused with the date said out loud ─────────────────────────
create or replace function public.ap_refuse_before_go_live(p_doc_date date, p_what text)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_go_live date;
begin
  if p_doc_date is null then
    raise exception '% has no date', p_what
      using errcode = '22004', detail = 'date_missing';
  end if;
  select go_live_on into v_go_live from public.gl_config where id;
  if v_go_live is null then
    raise exception 'the ledger has no go-live date; it cannot accept %', p_what
      using errcode = '55000', detail = 'no_go_live';
  end if;
  if p_doc_date < v_go_live then
    raise exception
      '% is dated % — before the ledger go-live date of %. The ledger starts on that date and nothing earlier may be posted into it.',
      p_what, to_char(p_doc_date, 'DD Mon YYYY'), to_char(v_go_live, 'DD Mon YYYY')
      using errcode = '22007', detail = 'before_go_live';
  end if;
end;
$fn$;


-- ── 7 · the bill's three doors ───────────────────────────────────────────────
-- Create. Header and lines in one act — there is no second door that adds a
-- line to a bill that already exists, because a bill is a thing the supplier
-- sent us whole.
create or replace function public.supplier_bill_create(
  p_supplier_id         uuid,
  p_supplier_invoice_no text,
  p_bill_date           date,
  p_ap_account_code     text,
  p_lines               jsonb,
  p_due_date            date default null,
  p_po_id               text default null,
  p_po_receipt_id       uuid  default null,
  p_narration           text  default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role  text := public.app_role()::text;
  v_id    uuid;
  v_line  jsonb;
  v_n     integer := 0;
  v_total numeric(12,2) := 0;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'only finance enters a supplier bill'
      using errcode = '42501', detail = 'not_finance';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'a supplier bill needs at least one line'
      using errcode = '22023', detail = 'no_lines';
  end if;

  insert into public.supplier_bills
    (supplier_invoice_no, supplier_id, bill_date, due_date, po_id,
     po_receipt_id, ap_account_code, narration, created_by)
  values
    (btrim(p_supplier_invoice_no), p_supplier_id, p_bill_date, p_due_date, p_po_id,
     p_po_receipt_id, p_ap_account_code, p_narration, auth.uid())
  returning id into v_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_n := v_n + 1;
    insert into public.supplier_bill_lines
      (bill_id, line_no, account_code, description, sku, qty, amount)
    values
      (v_id, v_n,
       v_line ->> 'account_code',
       v_line ->> 'description',
       v_line ->> 'sku',
       nullif(v_line ->> 'qty','')::numeric,
       round((v_line ->> 'amount')::numeric, 2));
    v_total := v_total + round((v_line ->> 'amount')::numeric, 2);
  end loop;

  update public.supplier_bills set total_amount = v_total where id = v_id;
  return v_id;
end;
$fn$;

-- Confirm. This is the act that posts.
create or replace function public.supplier_bill_confirm(p_bill_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     text := public.app_role()::text;
  v_bill     public.supplier_bills%rowtype;
  v_total    numeric(12,2);
  v_control  boolean;
  v_lines    jsonb;
  v_no       text;
  v_entry    uuid;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'only finance confirms a supplier bill'
      using errcode = '42501', detail = 'not_finance';
  end if;

  select * into v_bill from public.supplier_bills where id = p_bill_id for update;
  if not found then
    raise exception 'supplier bill not found'
      using errcode = 'P0002', detail = 'bill_missing';
  end if;
  if v_bill.status <> 'draft' then
    raise exception 'this supplier bill is already %', v_bill.status
      using errcode = '42501', detail = 'not_draft';
  end if;

  perform public.ap_refuse_before_go_live(v_bill.bill_date, 'this supplier bill');

  select coalesce(sum(amount), 0) into v_total
    from public.supplier_bill_lines where bill_id = p_bill_id;
  if v_total <= 0 then
    raise exception 'a supplier bill of RM0 is not a bill'
      using errcode = '22023', detail = 'zero_total';
  end if;

  select is_control into v_control
    from public.gl_accounts where code = v_bill.ap_account_code;
  if v_control is distinct from true then
    raise exception
      'account % is not an accounts payable control account; a payable with no party cannot be read back per supplier',
      v_bill.ap_account_code
      using errcode = '22023', detail = 'ap_not_control';
  end if;

  -- Dr each line, Cr accounts payable for the whole, party = the supplier.
  select jsonb_agg(
           jsonb_build_object(
             'account_code', l.account_code,
             'debit',  l.amount,
             'credit', 0,
             'memo',   coalesce(l.description, l.sku))
           order by l.line_no)
    into v_lines
    from public.supplier_bill_lines l
   where l.bill_id = p_bill_id;

  v_lines := v_lines || jsonb_build_array(
    jsonb_build_object(
      'account_code', v_bill.ap_account_code,
      'debit',  0,
      'credit', v_total,
      'party_type', 'SUPPLIER',
      'party_id',   v_bill.supplier_id,
      'memo',       'Supplier invoice ' || v_bill.supplier_invoice_no));

  -- Random, not sequential — purchasing MASTER §6.1. Our SB number gets
  -- quoted back to the supplier on queries and remittance advice, so it leaks
  -- the same volume a sequential PO number leaked. gl_doc_series still owns
  -- the SB prefix; it is no longer the allocator.
  v_no := public.allocate_formal_document_code('SB', v_bill.id::text, v_bill.bill_date);

  v_entry := public.gl_post(
    'SUPPLIER_BILL',
    v_no,
    v_bill.bill_date,
    coalesce(v_bill.narration,
             'Supplier bill ' || v_no || ' · invoice ' || v_bill.supplier_invoice_no),
    v_lines);

  update public.supplier_bills
     set bill_no      = v_no,
         total_amount = v_total,
         status       = 'confirmed',
         gl_entry_id  = v_entry,
         confirmed_at = now(),
         confirmed_by = auth.uid()
   where id = p_bill_id;

  return v_entry;
end;
$fn$;

-- Cancel. A draft simply stops. A confirmed bill is reversed — reversing a
-- posted liability is at least as consequential as releasing a payment, so it
-- asks for the same approver.
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
  if length(btrim(coalesce(p_reason,''))) = 0 then
    raise exception 'a cancellation needs a reason'
      using errcode = '22023', detail = 'reason_missing';
  end if;

  select * into v_bill from public.supplier_bills where id = p_bill_id for update;
  if not found then
    raise exception 'supplier bill not found'
      using errcode = 'P0002', detail = 'bill_missing';
  end if;
  if v_bill.status = 'cancelled' then
    raise exception 'this supplier bill is already cancelled'
      using errcode = '42501', detail = 'already_cancelled';
  end if;

  if v_bill.status = 'draft' then
    if v_role is null or v_role not in ('finance','principal') then
      raise exception 'only finance cancels a draft supplier bill'
        using errcode = '42501', detail = 'not_finance';
    end if;
  else
    if not public.has_finance_approver(auth.uid()) then
      raise exception
        'reversing a confirmed supplier bill takes the finance approver'
        using errcode = '42501', detail = 'not_finance_approver';
    end if;

    select coalesce(sum(a.amount_applied), 0) into v_open
      from public.payment_voucher_allocations a
      join public.payment_vouchers v on v.id = a.voucher_id
     where a.bill_id = p_bill_id and v.status <> 'cancelled';

    if v_open > 0 then
      raise exception
        'RM% of this bill is allocated to a payment voucher; cancel or reverse that voucher first',
        to_char(v_open, 'FM999999999990.00')
        using errcode = '42501', detail = 'bill_allocated';
    end if;

    v_reversal := public.gl_reverse(v_bill.gl_entry_id, p_reason);
  end if;

  update public.supplier_bills
     set status            = 'cancelled',
         reversal_entry_id = v_reversal,
         cancelled_at      = now(),
         cancelled_by      = auth.uid(),
         cancel_reason     = btrim(p_reason)
   where id = p_bill_id;

  return v_reversal;
end;
$fn$;


-- ── 8 · the voucher's four doors ─────────────────────────────────────────────
create or replace function public.payment_voucher_create(
  p_supplier_id       uuid,
  p_voucher_date      date,
  p_amount            numeric,
  p_bank_account_code text,
  p_ap_account_code   text,
  p_allocations       jsonb default '[]'::jsonb,
  p_pay_method        text default 'BANK_TRANSFER',
  p_pay_reference     text default null,
  p_narration         text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := public.app_role()::text;
  v_id   uuid;
  v_a    jsonb;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'only finance prepares a payment voucher'
      using errcode = '42501', detail = 'not_finance';
  end if;

  insert into public.payment_vouchers
    (supplier_id, voucher_date, amount, pay_method, pay_reference,
     bank_account_code, ap_account_code, narration, created_by)
  values
    (p_supplier_id, p_voucher_date, round(p_amount, 2), p_pay_method, p_pay_reference,
     p_bank_account_code, p_ap_account_code, p_narration, auth.uid())
  returning id into v_id;

  if p_allocations is not null and jsonb_typeof(p_allocations) = 'array' then
    for v_a in select * from jsonb_array_elements(p_allocations) loop
      insert into public.payment_voucher_allocations
        (voucher_id, bill_id, amount_applied, created_by)
      values
        (v_id, (v_a ->> 'bill_id')::uuid,
         round((v_a ->> 'amount_applied')::numeric, 2), auth.uid());
    end loop;
  end if;

  return v_id;
end;
$fn$;

-- Add or adjust one allocation while the voucher is still a draft. The ceilings
-- are the trigger's job, not this function's.
create or replace function public.payment_voucher_allocate(
  p_voucher_id uuid,
  p_bill_id    uuid,
  p_amount     numeric
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
    raise exception 'only finance allocates a payment voucher'
      using errcode = '42501', detail = 'not_finance';
  end if;

  insert into public.payment_voucher_allocations
    (voucher_id, bill_id, amount_applied, created_by)
  values (p_voucher_id, p_bill_id, round(p_amount, 2), auth.uid())
  on conflict (voucher_id, bill_id) do update
    set amount_applied = excluded.amount_applied
  returning id into v_id;

  return v_id;
end;
$fn$;

-- PREPARE — ruling M, role `finance`. Checks the arithmetic, mints the number,
-- freezes the row. POSTS NOTHING. No money has moved and the ledger does not
-- yet know this document exists.
create or replace function public.payment_voucher_prepare(p_voucher_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     text := public.app_role()::text;
  v_v        public.payment_vouchers%rowtype;
  v_alloc    numeric(12,2);
  v_bad      text;
  v_no       text;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'only finance prepares a payment voucher'
      using errcode = '42501', detail = 'not_finance';
  end if;

  select * into v_v from public.payment_vouchers where id = p_voucher_id for update;
  if not found then
    raise exception 'payment voucher not found'
      using errcode = 'P0002', detail = 'voucher_missing';
  end if;
  if v_v.status <> 'draft' then
    raise exception 'this payment voucher is already %', v_v.status
      using errcode = '42501', detail = 'not_draft';
  end if;

  perform public.ap_refuse_before_go_live(v_v.voucher_date, 'this payment voucher');

  select coalesce(sum(amount_applied), 0) into v_alloc
    from public.payment_voucher_allocations where voucher_id = p_voucher_id;

  -- Equality, not merely "not more than". If a voucher pays RM5,000 and names
  -- RM4,000 of bills, then RM1,000 has left the bank against nothing, and the
  -- A/P list and the ledger will disagree forever after. The contract requires
  -- the ceiling; this requires the floor too, so the subledger below always
  -- reconciles to the AP control account above.
  if v_alloc <> v_v.amount then
    raise exception
      'this payment voucher is for RM% but names RM% of bills; every ringgit paid must say which bill it pays',
      to_char(v_v.amount, 'FM999999999990.00'),
      to_char(v_alloc,    'FM999999999990.00')
      using errcode = '22023', detail = 'allocation_not_equal';
  end if;

  -- Re-check the bill ceilings here as well as in the trigger: another voucher
  -- may have been released against the same invoice since this draft was typed.
  select string_agg(x.bill_no, ', ') into v_bad
  from (
    select coalesce(b.bill_no, b.id::text) as bill_no
      from public.payment_voucher_allocations a
      join public.supplier_bills b on b.id = a.bill_id
     where a.voucher_id = p_voucher_id
       and (b.status <> 'confirmed'
            or (select coalesce(sum(a2.amount_applied), 0)
                  from public.payment_voucher_allocations a2
                  join public.payment_vouchers v2 on v2.id = a2.voucher_id
                 where a2.bill_id = a.bill_id
                   and v2.status <> 'cancelled') > b.total_amount)
  ) x;

  if v_bad is not null then
    raise exception
      'these bills can no longer take this allocation: %', v_bad
      using errcode = '23514', detail = 'bill_over_allocated';
  end if;

  -- Random, not sequential. docs/purchasing/MASTER.md §6.1: production once
  -- minted PO-2054 from max(seq)+1, "a number that told any supplier holding
  -- two of our purchase orders how much Carres bought in between." A supplier
  -- holds our payment vouchers too. gl_doc_series still owns the PV prefix —
  -- it just is not the allocator for a document that leaves the building.
  v_no := public.allocate_formal_document_code('PV', v_v.id::text, v_v.voucher_date);

  update public.payment_vouchers
     set voucher_no  = v_no,
         status      = 'prepared',
         prepared_at = now(),
         prepared_by = auth.uid()
   where id = p_voucher_id;

  return v_no;
end;
$fn$;

-- RELEASE — ruling M, the `finance_approver` duty. This is the act that moves
-- money, and it is the act that posts.
create or replace function public.payment_voucher_release(p_voucher_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_v        public.payment_vouchers%rowtype;
  v_me       uuid := auth.uid();
  v_control  boolean;
  v_bank_ctl boolean;
  v_entry    uuid;
  v_lines    jsonb;
begin
  if v_me is null then
    raise exception 'no signed-in account'
      using errcode = '42501', detail = 'no_session';
  end if;

  select * into v_v from public.payment_vouchers where id = p_voucher_id for update;
  if not found then
    raise exception 'payment voucher not found'
      using errcode = 'P0002', detail = 'voucher_missing';
  end if;
  if v_v.status <> 'prepared' then
    raise exception
      'only a prepared payment voucher can be released; this one is %', v_v.status
      using errcode = '42501', detail = 'not_prepared';
  end if;

  if not public.has_finance_approver(v_me) then
    raise exception
      'releasing a payment voucher takes the finance approver; preparing it is a different job'
      using errcode = '42501', detail = 'not_finance_approver';
  end if;

  -- THE SEPARATION OF DUTIES. Worded so nobody reads it as a permission that
  -- somebody in HR forgot to switch on.
  if v_v.prepared_by = v_me then
    raise exception
      'separation of duties: you prepared payment voucher %, so you may not also release it. This is not a permissions problem and granting yourself another duty will not change it — two people sign a payment out, and the second one must be somebody else.',
      coalesce(v_v.voucher_no, v_v.id::text)
      using errcode = '42501', detail = 'separation_of_duties',
            hint = 'Ask another holder of the finance approver duty to release it.';
  end if;

  perform public.ap_refuse_before_go_live(v_v.voucher_date, 'this payment voucher');

  select is_control into v_control
    from public.gl_accounts where code = v_v.ap_account_code;
  if v_control is distinct from true then
    raise exception 'account % is not an accounts payable control account',
      v_v.ap_account_code
      using errcode = '22023', detail = 'ap_not_control';
  end if;

  select is_control into v_bank_ctl
    from public.gl_accounts where code = v_v.bank_account_code;
  if v_bank_ctl is null then
    raise exception 'account % is not in the chart of accounts', v_v.bank_account_code
      using errcode = '22023', detail = 'bank_account_missing';
  end if;
  if v_bank_ctl then
    raise exception
      'account % is a control account and cannot be the bank side of a payment',
      v_v.bank_account_code
      using errcode = '22023', detail = 'bank_is_control';
  end if;

  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_code', v_v.ap_account_code,
      'debit',  v_v.amount,
      'credit', 0,
      'party_type', 'SUPPLIER',
      'party_id',   v_v.supplier_id,
      'memo',       'Payment voucher ' || v_v.voucher_no),
    jsonb_build_object(
      'account_code', v_v.bank_account_code,
      'debit',  0,
      'credit', v_v.amount,
      'memo',   coalesce(v_v.pay_reference, v_v.pay_method)));

  v_entry := public.gl_post(
    'SUPPLIER_PAYMENT',
    v_v.voucher_no,
    v_v.voucher_date,
    coalesce(v_v.narration, 'Payment voucher ' || v_v.voucher_no),
    v_lines);

  update public.payment_vouchers
     set status      = 'released',
         gl_entry_id = v_entry,
         released_at = now(),
         released_by = v_me
   where id = p_voucher_id;

  return v_entry;
end;
$fn$;

create or replace function public.payment_voucher_cancel(p_voucher_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     text := public.app_role()::text;
  v_v        public.payment_vouchers%rowtype;
  v_reversal uuid;
begin
  if length(btrim(coalesce(p_reason,''))) = 0 then
    raise exception 'a cancellation needs a reason'
      using errcode = '22023', detail = 'reason_missing';
  end if;

  select * into v_v from public.payment_vouchers where id = p_voucher_id for update;
  if not found then
    raise exception 'payment voucher not found'
      using errcode = 'P0002', detail = 'voucher_missing';
  end if;
  if v_v.status = 'cancelled' then
    raise exception 'this payment voucher is already cancelled'
      using errcode = '42501', detail = 'already_cancelled';
  end if;

  if v_v.status = 'released' then
    -- Money left the bank. Unbooking it takes the same approver who let it go.
    if not public.has_finance_approver(auth.uid()) then
      raise exception
        'reversing a released payment voucher takes the finance approver'
        using errcode = '42501', detail = 'not_finance_approver';
    end if;
    v_reversal := public.gl_reverse(v_v.gl_entry_id, p_reason);
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

  return v_reversal;
end;
$fn$;


-- ── 9 · what we owe, recomputed every time it is asked ───────────────────────
-- One row per supplier, ALWAYS — including the suppliers that owe nothing.
-- An A/P list that quietly drops the settled suppliers teaches the reader that
-- absence means zero, and then one day absence means "the query broke".
--
--   billed_total    confirmed bills
--   allocated_total named by any voucher that is not cancelled (drafts included)
--   paid_total      named by a RELEASED voucher — money that actually left
--   balance_owing   billed_total - paid_total   ← ties to the AP control account
--   uncommitted     billed_total - allocated_total  ← what nobody has claimed yet
create or replace function public.ap_outstanding(p_supplier_id uuid default null)
returns table (
  supplier_id               uuid,
  supplier_name             text,
  bills_confirmed           integer,
  billed_total              numeric(12,2),
  allocated_total           numeric(12,2),
  paid_total                numeric(12,2),
  balance_owing             numeric(12,2),
  uncommitted               numeric(12,2),
  oldest_confirmed_bill_date date,
  go_live_on                date
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
    raise exception 'accounts payable is internal'
      using errcode = '42501', detail = 'not_internal';
  end if;

  select gc.go_live_on into v_go_live from public.gl_config gc where gc.id;

  return query
  select s.id,
         s.name,
         coalesce(b.cnt, 0)::integer,
         coalesce(b.total, 0)::numeric(12,2),
         coalesce(a.total, 0)::numeric(12,2),
         coalesce(p.total, 0)::numeric(12,2),
         (coalesce(b.total, 0) - coalesce(p.total, 0))::numeric(12,2),
         (coalesce(b.total, 0) - coalesce(a.total, 0))::numeric(12,2),
         b.oldest,
         v_go_live
    from public.suppliers s
    left join (
      select sb.supplier_id, count(*) as cnt,
             sum(sb.total_amount) as total, min(sb.bill_date) as oldest
        from public.supplier_bills sb
       where sb.status = 'confirmed'
       group by sb.supplier_id
    ) b on b.supplier_id = s.id
    left join (
      select sb.supplier_id, sum(al.amount_applied) as total
        from public.payment_voucher_allocations al
        join public.supplier_bills sb   on sb.id = al.bill_id
        join public.payment_vouchers pv on pv.id = al.voucher_id
       where sb.status = 'confirmed' and pv.status <> 'cancelled'
       group by sb.supplier_id
    ) a on a.supplier_id = s.id
    left join (
      select sb.supplier_id, sum(al.amount_applied) as total
        from public.payment_voucher_allocations al
        join public.supplier_bills sb   on sb.id = al.bill_id
        join public.payment_vouchers pv on pv.id = al.voucher_id
       where sb.status = 'confirmed' and pv.status = 'released'
       group by sb.supplier_id
    ) p on p.supplier_id = s.id
   where p_supplier_id is null or s.id = p_supplier_id
   order by s.name;
end;
$fn$;

comment on function public.ap_outstanding(uuid) is
  'A/P per supplier, recomputed from rows. Returns EVERY supplier, zero balances included, so "not in the list" can never be read as "nothing owed".';

-- The same truth one level down: which invoice is still open.
create or replace function public.ap_bill_outstanding(p_supplier_id uuid default null)
returns table (
  bill_id             uuid,
  bill_no             text,
  supplier_id         uuid,
  supplier_name       text,
  supplier_invoice_no text,
  bill_date           date,
  due_date            date,
  po_id               text,
  total_amount        numeric(12,2),
  paid_total          numeric(12,2),
  balance_owing       numeric(12,2),
  go_live_on          date
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
    raise exception 'accounts payable is internal'
      using errcode = '42501', detail = 'not_internal';
  end if;

  select gc.go_live_on into v_go_live from public.gl_config gc where gc.id;

  return query
  select b.id, b.bill_no, b.supplier_id, s.name, b.supplier_invoice_no,
         b.bill_date, b.due_date, b.po_id, b.total_amount,
         coalesce(p.total, 0)::numeric(12,2),
         (b.total_amount - coalesce(p.total, 0))::numeric(12,2),
         v_go_live
    from public.supplier_bills b
    join public.suppliers s on s.id = b.supplier_id
    left join (
      select al.bill_id, sum(al.amount_applied) as total
        from public.payment_voucher_allocations al
        join public.payment_vouchers pv on pv.id = al.voucher_id
       where pv.status = 'released'
       group by al.bill_id
    ) p on p.bill_id = b.id
   where b.status = 'confirmed'
     and (p_supplier_id is null or b.supplier_id = p_supplier_id)
   order by b.bill_date, b.bill_no;
end;
$fn$;


-- ── 10 · nobody writes these tables from outside ─────────────────────────────
-- RLS on, reads for internal staff only, and NO insert/update/delete policy for
-- anybody. Every write above is `security definer` and re-checks the caller in
-- its own body. That check is the door; there is no other.
alter table public.supplier_bills                enable row level security;
alter table public.supplier_bill_lines           enable row level security;
alter table public.payment_vouchers              enable row level security;
alter table public.payment_voucher_allocations   enable row level security;

revoke all on public.supplier_bills              from anon, authenticated;
revoke all on public.supplier_bill_lines         from anon, authenticated;
revoke all on public.payment_vouchers            from anon, authenticated;
revoke all on public.payment_voucher_allocations from anon, authenticated;

-- ...then give the READ back. `revoke all` plus a select policy cancel out:
-- with no SELECT privilege the policy is never consulted and no internal user
-- can see a bill at all. The grant is what makes gl_may_read() below mean
-- something. Insert, update and delete stay revoked, and no write policy
-- exists for anyone.
grant select on public.supplier_bills              to authenticated;
grant select on public.supplier_bill_lines         to authenticated;
grant select on public.payment_vouchers            to authenticated;
grant select on public.payment_voucher_allocations to authenticated;

create policy supplier_bills_read_internal
  on public.supplier_bills for select using (public.gl_may_read());
create policy supplier_bill_lines_read_internal
  on public.supplier_bill_lines for select using (public.gl_may_read());
create policy payment_vouchers_read_internal
  on public.payment_vouchers for select using (public.gl_may_read());
create policy payment_voucher_allocations_read_internal
  on public.payment_voucher_allocations for select using (public.gl_may_read());

revoke all on function public.has_finance_approver(uuid)            from public, anon;
revoke all on function public.ap_refuse_before_go_live(date, text)  from public, anon;
revoke all on function public.pv_allocation_ceiling()               from public, anon, authenticated;
revoke all on function public.pv_allocation_only_while_draft()      from public, anon, authenticated;
revoke all on function public.supplier_bill_frozen()                from public, anon, authenticated;
revoke all on function public.supplier_bill_lines_frozen()          from public, anon, authenticated;
revoke all on function public.payment_voucher_frozen()              from public, anon, authenticated;
revoke all on function public.supplier_bill_create(uuid, text, date, text, jsonb, date, text, uuid, text)
  from public, anon;
revoke all on function public.supplier_bill_confirm(uuid)           from public, anon;
revoke all on function public.supplier_bill_cancel(uuid, text)      from public, anon;
revoke all on function public.payment_voucher_create(uuid, date, numeric, text, text, jsonb, text, text, text)
  from public, anon;
revoke all on function public.payment_voucher_allocate(uuid, uuid, numeric) from public, anon;
revoke all on function public.payment_voucher_prepare(uuid)         from public, anon;
revoke all on function public.payment_voucher_release(uuid)         from public, anon;
revoke all on function public.payment_voucher_cancel(uuid, text)    from public, anon;
revoke all on function public.ap_outstanding(uuid)                  from public, anon;
revoke all on function public.ap_bill_outstanding(uuid)             from public, anon;

grant execute on function public.has_finance_approver(uuid)         to authenticated;
grant execute on function public.supplier_bill_create(uuid, text, date, text, jsonb, date, text, uuid, text)
  to authenticated;
grant execute on function public.supplier_bill_confirm(uuid)        to authenticated;
grant execute on function public.supplier_bill_cancel(uuid, text)   to authenticated;
grant execute on function public.payment_voucher_create(uuid, date, numeric, text, text, jsonb, text, text, text)
  to authenticated;
grant execute on function public.payment_voucher_allocate(uuid, uuid, numeric) to authenticated;
grant execute on function public.payment_voucher_prepare(uuid)      to authenticated;
grant execute on function public.payment_voucher_release(uuid)      to authenticated;
grant execute on function public.payment_voucher_cancel(uuid, text) to authenticated;
grant execute on function public.ap_outstanding(uuid)               to authenticated;
grant execute on function public.ap_bill_outstanding(uuid)          to authenticated;


-- ── 11 · what the words mean ─────────────────────────────────────────────────
comment on table public.supplier_bills is
  'What a supplier billed us. SB-YYYYMM-NNNN, minted at confirm. Carries the supplier''s own invoice number separately — that number is theirs, not ours. Confirmed bills are immutable and are undone only by reversal.';
comment on column public.supplier_bills.supplier_invoice_no is
  'The supplier''s number, as printed on their invoice. Unique per supplier among bills that are not cancelled: the same invoice entered twice is how a supplier gets paid twice.';
comment on column public.supplier_bills.po_id is
  'Optional link to purchase_orders (TEXT id, 0001_init.sql:322). Optional because freight, samples and repairs are billed with no PO behind them.';
comment on column public.supplier_bills.po_receipt_id is
  'Optional link to po_receipts (0001_init.sql:355) — the physical receipt this invoice is claimed against. Purchasing MASTER §9.4 approves a numbered GRN object; it is not built, so the receipt row is the honest link today.';
comment on table public.payment_vouchers is
  'Our decision to pay a supplier. PV-YYYYMM-NNNN. draft -> prepared -> released (ruling M). Prepare freezes the numbers and posts nothing; release moves the money and posts. Never the same person for both.';
comment on table public.payment_voucher_allocations is
  'Which voucher money landed on which bill. Many to many in both directions. Ceilings held by pv_allocation_ceiling, which locks the rows it measures.';
