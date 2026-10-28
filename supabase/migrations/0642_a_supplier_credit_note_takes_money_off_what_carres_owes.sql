-- =============================================================================
-- 0642_a_supplier_credit_note_takes_money_off_what_carres_owes.sql
-- =============================================================================
-- WHAT WAS MISSING
--   When a supplier sends a credit note (goods returned, a price taken off, a
--   rebate), Finance had no document for it: the only way to take money off
--   what Carres owes was a journal by hand, which no bill knew about. Chew
--   (Finance) ruled on 2026-10-03 to build supplier credit notes, knocked off
--   that supplier's bills (docs/finance/MASTER.md §3.2), after the Houzs
--   reference (Part 4 §6, the SCN).
--
-- WHAT THIS ADDS
--   A supplier credit note: the supplier's own paper entered once, with lines.
--     draft → confirmed (posts) → cancelled (a confirmed one is reversed)
--   Confirming posts, dated the note's date:
--     Dr the payables account, party = the supplier   (Carres owes less)
--     Cr each line's account                            (the cost comes back)
--   Its number is drawn like a bill's: SCN-YYYYMMDD-RRRR (random, MASTER §6.1).
--
--   A knock-off ties some of a confirmed note's credit to one of the same
--   supplier's confirmed bills on the same payables account. It posts nothing
--   (the credit is already on that account and party), exactly as an advance
--   knock-off (0485). It can be taken off again with a reason.
--
--   How much of a bill is paid keeps ONE arithmetic (law D): ap_bill_settled
--   (0640) now counts a live knock-off from the later of the note's date and
--   the day it was made; ap_bill_paid's held counts it too, so a voucher can
--   never pay what a credit note already took off.
--
--   AP · Payables (ap_outstanding) gains credit_open — confirmed credit not
--   yet knocked off — and net_owing subtracts it, so it still equals what the
--   supplier's payables account holds in the ledger (the Self-check reads it).
--   A bill's own page lists its knock-offs among its payments.
--
--   Files and history use the payables' own tables; the document type
--   SUPPLIER_CREDIT_NOTE and the actions credit_applied / credit_taken_off
--   join their lists. A credit note line takes an expense, asset or income
--   account (a rebate is income), never a control, cash or bank account.
--   A bill with a credit note on it cannot be cancelled, and the refusal now
--   names the credit note beside the voucher and the advance.
--
--   Every existing function changed here is carried forward from its LIVE
--   body (pg_get_functiondef after 0641), as 0560 does, never from an older
--   file: 0554 (account numbers by role), 0560 (a blank is no non-space
--   character) and 0580 (a heading is a stored flag) stay in them, and the
--   sanity block checks that they did (the 0561 lesson).
--
-- RLS: the three new tables read like the bills (gl_may_read); nobody writes
-- them except through the functions here.
-- DATA: none. DR/CR: only on confirm (above) and cancel (gl_reverse).
-- =============================================================================

begin;

-- ── 1 · the tables ──────────────────────────────────────────────────────────
create table public.supplier_credit_notes (
  id                uuid primary key default gen_random_uuid(),
  note_no           text unique,
  supplier_id       uuid not null references public.suppliers(id),
  -- 0560: a blank is no character that is not whitespace; btrim() trims spaces only.
  supplier_note_no  text not null check (supplier_note_no ~ '[^[:space:]]' and length(btrim(supplier_note_no)) <= 60),
  note_date         date not null,
  ap_account_code   text not null references public.gl_accounts(code),
  total_amount      numeric(12,2) not null default 0 check (total_amount >= 0),
  narration         text,
  status            text not null default 'draft' check (status in ('draft','confirmed','cancelled')),
  gl_entry_id       uuid references public.gl_entries(id),
  reversal_entry_id uuid references public.gl_entries(id),
  created_at        timestamptz not null default now(),
  created_by        uuid references public.app_users(id),
  confirmed_at      timestamptz,
  confirmed_by      uuid references public.app_users(id),
  cancelled_at      timestamptz,
  cancelled_by      uuid references public.app_users(id),
  cancel_reason     text,
  constraint supplier_credit_notes_confirmed_posts
    check (status = 'draft' or status = 'cancelled' or (gl_entry_id is not null and note_no is not null)),
  constraint supplier_credit_notes_cancel_says_why
    check (status <> 'cancelled' or coalesce(cancel_reason, '') ~ '[^[:space:]]')
);
comment on table public.supplier_credit_notes is
  '0642: a supplier''s credit note, entered once. Confirming posts Dr the payables account (party = supplier) / Cr each line. Written only by its functions.';

-- One live entry of one supplier paper.
create unique index supplier_credit_notes_one_live_paper
  on public.supplier_credit_notes (supplier_id, lower(btrim(supplier_note_no)))
  where status <> 'cancelled';

create table public.supplier_credit_note_lines (
  note_id         uuid not null references public.supplier_credit_notes(id) on delete cascade,
  line_no         integer not null check (line_no between 1 and 300),
  account_code    text not null references public.gl_accounts(code),
  description     text not null check (description ~ '[^[:space:]]' and length(btrim(description)) <= 200),
  amount          numeric(12,2) not null check (amount > 0),
  department_type text,
  department_id   uuid,
  primary key (note_id, line_no),
  constraint supplier_credit_note_lines_department_shape check (
    (department_type is null and department_id is null)
    or (department_type in ('SHOWROOM','DEALER') and department_id is not null)
    or (department_type in ('SUBSCRIPTION','OFFICE') and department_id is null))
);

create table public.supplier_credit_note_applications (
  id            uuid primary key default gen_random_uuid(),
  note_id       uuid not null references public.supplier_credit_notes(id),
  bill_id       uuid not null references public.supplier_bills(id),
  amount        numeric(12,2) not null check (amount > 0),
  status        text not null default 'applied' check (status in ('applied','cancelled')),
  created_at    timestamptz not null default now(),
  created_by    uuid references public.app_users(id),
  cancelled_at  timestamptz,
  cancelled_by  uuid references public.app_users(id),
  cancel_reason text,
  constraint supplier_credit_note_applications_cancel_says_why
    check (status <> 'cancelled' or (cancelled_at is not null and coalesce(cancel_reason, '') ~ '[^[:space:]]'))
);
create unique index supplier_credit_note_applications_one_live
  on public.supplier_credit_note_applications (note_id, bill_id) where status = 'applied';
create index supplier_credit_note_applications_bill on public.supplier_credit_note_applications (bill_id);

alter table public.supplier_credit_notes             enable row level security;
alter table public.supplier_credit_note_lines        enable row level security;
alter table public.supplier_credit_note_applications enable row level security;
revoke all on public.supplier_credit_notes, public.supplier_credit_note_lines,
              public.supplier_credit_note_applications from anon, authenticated;
grant select on public.supplier_credit_notes, public.supplier_credit_note_lines,
                public.supplier_credit_note_applications to authenticated;
create policy supplier_credit_notes_read_internal on public.supplier_credit_notes
  for select using ((select public.gl_may_read()));
create policy supplier_credit_note_lines_read_internal on public.supplier_credit_note_lines
  for select using ((select public.gl_may_read()));
create policy supplier_credit_note_applications_read_internal on public.supplier_credit_note_applications
  for select using ((select public.gl_may_read()));

-- ── 2 · files and history take the new document ──────────────────────────────
alter table public.ap_document_events drop constraint ap_document_events_document_type_check;
alter table public.ap_document_events add constraint ap_document_events_document_type_check
  check (document_type in ('SUPPLIER_BILL','PAYMENT_VOUCHER','SUPPLIER_CREDIT_NOTE'));
alter table public.ap_document_events drop constraint ap_document_events_action_check;
alter table public.ap_document_events add constraint ap_document_events_action_check
  check (action in ('created','edited','confirmed','prepared','checked','approved','rejected','cancelled',
                    'file_added','advance_applied','advance_taken_off','money_back','money_back_cancelled',
                    'credit_applied','credit_taken_off'));
alter table public.ap_document_files drop constraint ap_document_files_document_type_check;
alter table public.ap_document_files add constraint ap_document_files_document_type_check
  check (document_type in ('SUPPLIER_BILL','PAYMENT_VOUCHER','SUPPLIER_CREDIT_NOTE'));

-- Copied from 0477 and changed: a credit note takes files too.
create or replace function public.ap_document_file_add(
  p_document_type text,
  p_document_id   uuid,
  p_storage_path  text,
  p_file_name     text,
  p_mime_type     text,
  p_size_bytes    bigint
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role   text := public.app_role()::text;
  v_type   text := upper(btrim(coalesce(p_document_type, '')));
  v_path   text := btrim(coalesce(p_storage_path, ''));
  v_status text;
  v_id     uuid;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'only finance adds a file to a bill or a voucher'
      using errcode = '42501', detail = 'not_finance';
  end if;

  if v_type = 'SUPPLIER_BILL' then
    select status into v_status from public.supplier_bills where id = p_document_id;
  elsif v_type = 'PAYMENT_VOUCHER' then
    select status into v_status from public.payment_vouchers where id = p_document_id;
  elsif v_type = 'SUPPLIER_CREDIT_NOTE' then
    select status into v_status from public.supplier_credit_notes where id = p_document_id;
  else
    raise exception 'A file belongs to a bill, a payment voucher or a supplier credit note.'
      using errcode = 'P0001', detail = 'document_type_unknown';
  end if;
  if v_status is null then
    raise exception 'That document does not exist.'
      using errcode = 'P0002', detail = 'document_missing';
  end if;
  if v_status = 'cancelled' then
    raise exception 'A cancelled document takes no new files.'
      using errcode = 'P0001', detail = 'document_cancelled';
  end if;
  if v_path not like v_type || '/' || p_document_id::text || '/%' then
    raise exception 'That file was uploaded for a different document.'
      using errcode = 'P0001', detail = 'file_path_mismatch';
  end if;
  if not exists (select 1 from storage.objects o
                  where o.bucket_id = 'ap-documents' and o.name = v_path) then
    raise exception 'The file has not finished uploading. Try again.'
      using errcode = 'P0001', detail = 'file_not_uploaded';
  end if;

  insert into public.ap_document_files
    (document_type, document_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
  values
    (v_type, p_document_id, v_path, btrim(p_file_name), p_mime_type, p_size_bytes,
     (select u.id from public.app_users u where u.id = auth.uid()))
  returning id into v_id;

  perform public._ap_event(v_type, p_document_id, 'file_added', btrim(p_file_name));
  return v_id;
end;
$fn$;

-- ── 3 · which accounts a credit note line takes ──────────────────────────────
-- Carried forward from the LIVE body (0580, read back with pg_get_functiondef,
-- as 0560 does), not from an older file: 0554 reads the advance account from
-- gl_account_roles and 0580 reads a heading from its stored flag, and a body
-- copied from an earlier file would silently undo both (the 0561 lesson).
-- Changed only by a new use, credit_line — an expense, asset or income account
-- (a rebate is income), never a control, cash or bank account, nor the
-- advance account — and by the bill line refusal losing its dash, as no
-- screen shows one (owner ruling 2026-09-27).
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
  if v_acc.is_heading then                                -- 0580: the stored flag
    raise exception '%: % % is a heading. Choose one of the accounts under it.', p_what, v_acc.code, v_acc.name
      using errcode = 'P0001', detail = 'account_is_heading';
  end if;

  -- 0510: 1230 Advances to suppliers is written only by the Advance flow,
  -- which reaches the supplier's payables account through 'ap', never a line.
  -- 0554: the number is read from gl_account_roles, not written here.
  if v_acc.code = public.gl_account_for('SUPPLIER_ADVANCE') and p_use in ('bill_line','voucher_line','credit_line') then
    raise exception '%: account % % is kept by its own documents and cannot be picked here.', p_what, v_acc.code, v_acc.name
      using errcode = 'P0001', detail = 'account_kept_by_own_documents';
  end if;

  if p_use = 'bill_line' then
    if v_acc.is_control then
      raise exception '%: % % is a control account. A bill line is a cost. Choose an expense or asset account.', p_what, v_acc.code, v_acc.name
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
  elsif p_use = 'credit_line' then
    if v_acc.is_control then
      raise exception '%: % % is a control account. A credit note line takes back a cost or records a rebate. Choose an expense, asset or income account.', p_what, v_acc.code, v_acc.name
        using errcode = 'P0001', detail = 'account_is_control';
    end if;
    if v_acc.kind not in ('EXPENSE','ASSET','INCOME') then
      raise exception '%: % % is not an expense, asset or income account.', p_what, v_acc.code, v_acc.name
        using errcode = 'P0001', detail = 'account_wrong_kind';
    end if;
    if public.ap_account_is_money(v_acc.code) then
      raise exception '%: % % is a cash or bank account. A credit note does not move money.', p_what, v_acc.code, v_acc.name
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
$fn$;

-- The payables forms read which box an account fits from here. The return
-- type gains for_credit_line, so the function is dropped and recreated. The
-- body is the LIVE one (0580), changed only by that last column.
drop function if exists public.ap_account_choices();
create function public.ap_account_choices()
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
  for_pay_from     boolean,
  for_credit_line  boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
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
         public.gl_money_account_ok(a.code, 'out'),      -- 0512: cash and bank only
         (not a.is_control and a.code <> v_advance and a.kind in ('EXPENSE','ASSET','INCOME') and not public.ap_account_is_money(a.code))
    from public.gl_accounts a
   where a.is_active
     and not a.is_heading                                -- 0580: the stored flag
   order by a.code;
end;
$fn$;
revoke all on function public.ap_account_choices() from public, anon;
grant execute on function public.ap_account_choices() to authenticated;

-- ── 4 · paid, with a credit note's knock-offs ────────────────────────────────
-- 0640's ap_bill_settled, with one more source: a live credit note knock-off,
-- counted from the later of the note's date and the day it was made.
create or replace function public.ap_bill_settled(p_as_at date default null)
returns table (bill_id uuid, paid numeric(12,2))
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select x.bid, coalesce(sum(x.amount), 0)::numeric(12,2)
    from (
      -- An approved voucher pays on its own date: the date it posts on.
      select al.bill_id as bid, al.amount_applied as amount
        from public.payment_voucher_allocations al
        join public.payment_vouchers pv on pv.id = al.voucher_id
       where pv.status = 'approved'
         and (p_as_at is null or pv.voucher_date <= p_as_at)
      union all
      -- A knock-off counts from the day it was made until the day it was cancelled.
      select ap.bill_id, ap.amount
        from public.supplier_advance_applications ap
       where (p_as_at is null and ap.status = 'applied')
          or (p_as_at is not null
              and timezone('Asia/Kuala_Lumpur', ap.created_at)::date <= p_as_at
              and (ap.status = 'applied'
                   or (ap.status = 'cancelled'
                       and timezone('Asia/Kuala_Lumpur', ap.cancelled_at)::date > p_as_at)))
      union all
      -- 0642: a credit note knock-off, from the later of the note's date and
      -- the day it was made, until the day it was taken off.
      select ca.bill_id, ca.amount
        from public.supplier_credit_note_applications ca
        join public.supplier_credit_notes cn on cn.id = ca.note_id
       where (p_as_at is null and ca.status = 'applied')
          or (p_as_at is not null
              and greatest(cn.note_date, timezone('Asia/Kuala_Lumpur', ca.created_at)::date) <= p_as_at
              and (ca.status = 'applied'
                   or (ca.status = 'cancelled'
                       and timezone('Asia/Kuala_Lumpur', ca.cancelled_at)::date > p_as_at)))
    ) x
   group by x.bid
$fn$;
revoke all on function public.ap_bill_settled(date) from public, anon, authenticated;

-- 0640's ap_bill_paid, with a credit note knock-off in held too.
create or replace function public.ap_bill_paid(p_bill_id uuid default null)
returns table (bill_id uuid, paid numeric(12,2), held numeric(12,2))
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select h.bid,
         coalesce(s.paid, 0)::numeric(12,2),
         h.held
    from (
      select x.bid, coalesce(sum(x.amount), 0)::numeric(12,2) as held
        from (
          select al.bill_id as bid, al.amount_applied as amount
            from public.payment_voucher_allocations al
            join public.payment_vouchers pv on pv.id = al.voucher_id
           where pv.status <> 'cancelled'
             and (p_bill_id is null or al.bill_id = p_bill_id)
          union all
          select ap.bill_id, ap.amount
            from public.supplier_advance_applications ap
           where ap.status = 'applied'
             and (p_bill_id is null or ap.bill_id = p_bill_id)
          union all
          select ca.bill_id, ca.amount
            from public.supplier_credit_note_applications ca
           where ca.status = 'applied'
             and (p_bill_id is null or ca.bill_id = p_bill_id)
        ) x
       group by x.bid
    ) h
    left join public.ap_bill_settled(null) s on s.bill_id = h.bid
$fn$;
revoke all on function public.ap_bill_paid(uuid) from public, anon, authenticated;

comment on function public.ap_bill_paid(uuid) is
  '0484 · 0640 · 0642 · law D: paid comes from ap_bill_settled(null) — approved vouchers + live advance and credit note knock-offs; held = allocations on vouchers not cancelled + live knock-offs. Internal: only definer functions call it.';

-- How much of a confirmed credit note is not knocked off yet.
create or replace function public.supplier_credit_open(p_note_id uuid default null)
returns table (note_id uuid, supplier_id uuid, ap_account_code text,
               total_amount numeric(12,2), applied_total numeric(12,2), credit_open numeric(12,2))
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select n.id, n.supplier_id, n.ap_account_code, n.total_amount,
         coalesce(a.total, 0)::numeric(12,2),
         (n.total_amount - coalesce(a.total, 0))::numeric(12,2)
    from public.supplier_credit_notes n
    left join (
      select ca.note_id as nid, sum(ca.amount) as total
        from public.supplier_credit_note_applications ca
       where ca.status = 'applied'
       group by ca.note_id
    ) a on a.nid = n.id
   where n.status = 'confirmed'
     and (p_note_id is null or n.id = p_note_id)
$fn$;
revoke all on function public.supplier_credit_open(uuid) from public, anon, authenticated;
comment on function public.supplier_credit_open(uuid) is
  '0642 · law D: a confirmed credit note less its live knock-offs. Internal.';

-- ── 5 · AP · Payables: credit not knocked off, so net owing stays the ledger ──
-- Copied from 0484 and changed: credit_open joins at the end, and net_owing
-- subtracts it. The return type changes, so the function is dropped.
drop function if exists public.ap_outstanding(uuid);
create function public.ap_outstanding(p_supplier_id uuid default null)
returns table (supplier_id uuid, supplier_name text, bills_confirmed integer,
               billed_total numeric, allocated_total numeric, paid_total numeric,
               balance_owing numeric, uncommitted numeric,
               oldest_confirmed_bill_date date, go_live_on date, supplier_kind text,
               open_bills integer, oldest_unpaid_bill_date date,
               advance_open numeric, net_owing numeric, credit_open numeric)
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
  ), credit as (
    select co.supplier_id as sid, sum(co.credit_open) as open_total
      from public.supplier_credit_open() co
     group by co.supplier_id
  ), owed as (
    select s.id as sid, s.name, s.kind::text as kind,
           ps.cnt, ps.billed, ps.allocated, ps.paid, ps.oldest, ps.open_cnt, ps.oldest_open,
           (coalesce(ps.billed, 0) - coalesce(ps.paid, 0)) as owing,
           coalesce(adv.open_total, 0) as adv_open,
           coalesce(cr.open_total, 0) as cr_open
      from public.suppliers s
      left join per_supplier ps on ps.sid = s.id
      left join advance adv on adv.sid = s.id
      left join credit cr on cr.sid = s.id
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
         (o.owing - o.adv_open - o.cr_open)::numeric(12,2),
         o.cr_open::numeric(12,2)
    from owed o
   order by o.name;
end;
$fn$;
revoke all on function public.ap_outstanding(uuid) from public, anon;
grant execute on function public.ap_outstanding(uuid) to authenticated;
comment on function public.ap_outstanding(uuid) is
  '0484 · 0642: owed per supplier, every supplier listed. balance_owing = confirmed bills less what is paid on them (ap_bill_paid). advance_open = advances not yet knocked off or sent back; credit_open = confirmed credit notes not yet knocked off. net_owing = balance_owing - advance_open - credit_open, which is what the supplier''s payables control holds in the ledger. Finance and principal only.';

-- ── 6 · the doors ───────────────────────────────────────────────────────────
create or replace function public.supplier_credit_note_save_draft(
  p_note_id          uuid,
  p_supplier_id      uuid,
  p_supplier_note_no text,
  p_note_date        date,
  p_lines            jsonb,
  p_ap_account_code  text default null,
  p_narration        text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     text := public.app_role()::text;
  v_me       uuid := (select u.id from public.app_users u where u.id = auth.uid());
  v_note     public.supplier_credit_notes%rowtype;
  v_supplier public.suppliers%rowtype;
  v_paper    text := btrim(coalesce(p_supplier_note_no, ''));
  v_ap       text;
  v_dup      text;
  v_line     jsonb;
  v_n        integer := 0;
  v_total    numeric(12,2) := 0;
  v_account  text;
  v_desc     text;
  v_amount   numeric(12,2);
  v_dept     record;
  v_id       uuid;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance enters a supplier credit note.'
      using errcode = '42501', detail = 'not_finance';
  end if;

  if p_note_id is not null then
    select * into v_note from public.supplier_credit_notes where id = p_note_id for update;
    if not found then
      raise exception 'That credit note does not exist.'
        using errcode = 'P0002', detail = 'note_missing';
    end if;
    if v_note.status <> 'draft' then
      raise exception 'Only a draft credit note can be changed.'
        using errcode = 'P0001', detail = 'note_not_draft';
    end if;
  end if;

  select * into v_supplier from public.suppliers where id = p_supplier_id;
  if not found then
    raise exception 'Choose who sent this credit note.'
      using errcode = 'P0001', detail = 'supplier_missing';
  end if;
  if coalesce(p_supplier_note_no, '') !~ '[^[:space:]]' then          -- 0560
    raise exception 'Type the number printed on the supplier''s credit note.'
      using errcode = 'P0001', detail = 'paper_no_missing';
  end if;
  if length(v_paper) > 60 then
    raise exception 'The credit note number is too long.'
      using errcode = 'P0001', detail = 'paper_no_too_long';
  end if;
  if p_note_date is null then
    raise exception 'Type the date printed on the supplier''s credit note.'
      using errcode = 'P0001', detail = 'note_date_missing';
  end if;
  perform public.ap_refuse_before_go_live(p_note_date, 'This credit note');

  -- The same paper entered twice takes money off twice.
  select coalesce(n.note_no, 'a draft credit note') into v_dup
    from public.supplier_credit_notes n
   where n.supplier_id = p_supplier_id
     and lower(btrim(n.supplier_note_no)) = lower(v_paper)
     and n.status <> 'cancelled'
     and n.id is distinct from p_note_id
   limit 1;
  if v_dup is not null then
    raise exception 'Credit note % from % is already entered, as %.', v_paper, v_supplier.name, v_dup
      using errcode = 'P0001', detail = 'paper_already_entered';
  end if;

  -- The same payables account a bill from this supplier takes: other payables
  -- for an other creditor, trade payables for a supplier (0554: by role).
  v_ap := coalesce(nullif(btrim(coalesce(p_ap_account_code, '')), ''),
                   public.gl_account_for(
                     case when v_supplier.kind::text = 'other_creditor' then 'OTHER_PAYABLE' else 'TRADE_PAYABLE' end));
  perform public._ap_require_account(v_ap, 'ap', 'Payables account');

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'A credit note needs at least one line.'
      using errcode = 'P0001', detail = 'no_lines';
  end if;
  if jsonb_array_length(p_lines) > 300 then
    raise exception 'A credit note can have at most 300 lines.'
      using errcode = 'P0001', detail = 'too_many_lines';
  end if;

  if p_note_id is null then
    insert into public.supplier_credit_notes
      (supplier_id, supplier_note_no, note_date, ap_account_code, narration, created_by)
    values
      (p_supplier_id, v_paper, p_note_date, v_ap, nullif(btrim(coalesce(p_narration, '')), ''), v_me)
    returning id into v_id;
  else
    v_id := p_note_id;
    update public.supplier_credit_notes
       set supplier_id      = p_supplier_id,
           supplier_note_no = v_paper,
           note_date        = p_note_date,
           ap_account_code  = v_ap,
           narration        = nullif(btrim(coalesce(p_narration, '')), ''),
           total_amount     = 0
     where id = v_id;
    -- A draft's lines are replaced whole; a draft has posted nothing.
    delete from public.supplier_credit_note_lines where note_id = v_id;
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_n := v_n + 1;
    if jsonb_typeof(v_line) <> 'object' then
      raise exception 'Line % is not a credit note line.', v_n
        using errcode = 'P0001', detail = 'line_invalid';
    end if;
    begin
      v_amount := round(nullif(btrim(coalesce(v_line ->> 'amount', '')), '')::numeric, 2);
    exception when invalid_text_representation then
      raise exception 'Line %: the amount is not a number.', v_n
        using errcode = 'P0001', detail = 'line_invalid';
    end;
    v_account := nullif(btrim(coalesce(v_line ->> 'account_code', '')), '');
    v_desc    := btrim(coalesce(v_line ->> 'description', ''));
    if v_desc !~ '[^[:space:]]' then                                      -- 0560
      raise exception 'Line %: say what this credit is for.', v_n
        using errcode = 'P0001', detail = 'line_needs_description';
    end if;
    if length(v_desc) > 200 then
      raise exception 'Line %: the description is too long.', v_n
        using errcode = 'P0001', detail = 'line_description_too_long';
    end if;
    if v_amount is null or v_amount <= 0 then
      raise exception 'Line %: the amount must be more than RM 0.00.', v_n
        using errcode = 'P0001', detail = 'line_amount_invalid';
    end if;
    perform public._ap_require_account(v_account, 'credit_line', format('Line %s', v_n));
    v_dept := public.fin_line_department(v_line, v_account, format('Line %s', v_n));

    insert into public.supplier_credit_note_lines
      (note_id, line_no, account_code, description, amount, department_type, department_id)
    values
      (v_id, v_n, v_account, v_desc, v_amount, v_dept.department_type, v_dept.department_id);
    v_total := v_total + v_amount;
  end loop;

  update public.supplier_credit_notes set total_amount = v_total where id = v_id;
  perform public._ap_event('SUPPLIER_CREDIT_NOTE', v_id,
                           case when p_note_id is null then 'created' else 'edited' end, null);
  return v_id;
end;
$fn$;

create or replace function public.supplier_credit_note_confirm(p_note_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role  text := public.app_role()::text;
  v_note  public.supplier_credit_notes%rowtype;
  v_total numeric(12,2);
  v_lines jsonb;
  v_no    text;
  v_entry uuid;
  r       record;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance confirms a supplier credit note.'
      using errcode = '42501', detail = 'not_finance';
  end if;

  select * into v_note from public.supplier_credit_notes where id = p_note_id for update;
  if not found then
    raise exception 'That credit note does not exist.'
      using errcode = 'P0002', detail = 'note_missing';
  end if;
  if v_note.status <> 'draft' then
    raise exception 'This credit note is already %.', v_note.status
      using errcode = 'P0001', detail = 'note_not_draft';
  end if;

  perform public.ap_refuse_before_go_live(v_note.note_date, 'This credit note');
  perform public._ap_require_account(v_note.ap_account_code, 'ap', 'Payables account');
  for r in select l.line_no, l.account_code
             from public.supplier_credit_note_lines l
            where l.note_id = p_note_id order by l.line_no loop
    perform public._ap_require_account(r.account_code, 'credit_line', format('Line %s', r.line_no));
  end loop;

  select coalesce(sum(amount), 0) into v_total
    from public.supplier_credit_note_lines where note_id = p_note_id;
  if v_total <= 0 then
    raise exception 'A credit note of RM 0.00 takes nothing off.'
      using errcode = 'P0001', detail = 'zero_total';
  end if;

  -- Dr the payables account for the whole, party = the supplier; Cr each line.
  select jsonb_build_array(jsonb_build_object(
           'account_code', v_note.ap_account_code,
           'debit',  v_total,
           'credit', 0,
           'party_type', 'SUPPLIER',
           'party_id',   v_note.supplier_id,
           'memo',       'Supplier credit note ' || v_note.supplier_note_no))
         || coalesce(jsonb_agg(jsonb_build_object(
              'account_code', l.account_code,
              'debit',  0,
              'credit', l.amount,
              'memo',   l.description,
              'department_type', l.department_type,
              'department_id',   l.department_id)
            order by l.line_no), '[]'::jsonb)
    into v_lines
    from public.supplier_credit_note_lines l
   where l.note_id = p_note_id;

  -- Random, not sequential, as a bill's number (purchasing MASTER §6.1).
  v_no := public.allocate_formal_document_code('SCN', v_note.id::text, v_note.note_date);

  v_entry := public.gl_post(
    'SUPPLIER_CREDIT_NOTE',
    v_no,
    v_note.note_date,
    coalesce(v_note.narration, 'Supplier credit note ' || v_no || ' · ' || v_note.supplier_note_no),
    v_lines);

  update public.supplier_credit_notes
     set note_no      = v_no,
         total_amount = v_total,
         status       = 'confirmed',
         gl_entry_id  = v_entry,
         confirmed_at = now(),
         confirmed_by = auth.uid()
   where id = p_note_id;

  perform public._ap_event('SUPPLIER_CREDIT_NOTE', p_note_id, 'confirmed', v_no);
  return v_entry;
end;
$fn$;

create or replace function public.supplier_credit_note_cancel(p_note_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     text := public.app_role()::text;
  v_note     public.supplier_credit_notes%rowtype;
  v_applied  numeric(12,2);
  v_reversal uuid;
begin
  if coalesce(p_reason, '') !~ '[^[:space:]]' then                   -- 0560
    raise exception 'Say why this credit note is cancelled.'
      using errcode = 'P0001', detail = 'reason_missing';
  end if;
  select * into v_note from public.supplier_credit_notes where id = p_note_id for update;
  if not found then
    raise exception 'That credit note does not exist.'
      using errcode = 'P0002', detail = 'note_missing';
  end if;
  if v_note.status = 'cancelled' then
    raise exception 'This credit note is already cancelled.'
      using errcode = 'P0001', detail = 'already_cancelled';
  end if;

  if v_note.status = 'draft' then
    if v_role is null or v_role not in ('finance','principal') then
      raise exception 'Only Finance cancels a draft supplier credit note.'
        using errcode = '42501', detail = 'not_finance';
    end if;
  else
    -- A confirmed note is a posted document: as a confirmed bill (0484).
    if not public.has_finance_approver(auth.uid()) then
      raise exception 'Cancelling a confirmed credit note takes the finance approver.'
        using errcode = '42501', detail = 'not_finance_approver';
    end if;
    select coalesce(sum(ca.amount), 0) into v_applied
      from public.supplier_credit_note_applications ca
     where ca.note_id = p_note_id and ca.status = 'applied';
    if v_applied > 0 then
      raise exception 'RM % of this credit note is knocked off bills. Take it off the bills first.',
        to_char(v_applied, 'FM999,999,999,990.00')
        using errcode = 'P0001', detail = 'note_knocked_off';
    end if;
    v_reversal := public.gl_reverse(v_note.gl_entry_id, btrim(p_reason));
  end if;

  update public.supplier_credit_notes
     set status            = 'cancelled',
         reversal_entry_id = v_reversal,
         cancelled_at      = now(),
         cancelled_by      = (select u.id from public.app_users u where u.id = auth.uid()),
         cancel_reason     = btrim(p_reason)
   where id = p_note_id;

  perform public._ap_event('SUPPLIER_CREDIT_NOTE', p_note_id, 'cancelled', btrim(p_reason));
  return p_note_id;
end;
$fn$;

create or replace function public.supplier_credit_note_apply(p_note_id uuid, p_bill_id uuid, p_amount numeric)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := public.app_role()::text;
  v_me   uuid := (select u.id from public.app_users u where u.id = auth.uid());
  v_note public.supplier_credit_notes%rowtype;
  v_bill public.supplier_bills%rowtype;
  v_open numeric(12,2);
  v_left numeric(12,2);
  v_id   uuid;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance knocks a credit note off a bill.'
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

  -- The note first, then the bill: the order the advance knock-off locks in.
  select * into v_note from public.supplier_credit_notes where id = p_note_id for update;
  if not found then
    raise exception 'That credit note does not exist.'
      using errcode = 'P0002', detail = 'note_missing';
  end if;
  if v_note.status <> 'confirmed' then
    raise exception 'Credit note % is not confirmed. Only a confirmed credit note is knocked off a bill.',
      coalesce(v_note.note_no, 'for ' || v_note.supplier_note_no)
      using errcode = 'P0001', detail = 'note_not_confirmed';
  end if;

  select * into v_bill from public.supplier_bills where id = p_bill_id for update;
  if not found then
    raise exception 'That bill does not exist.'
      using errcode = 'P0002', detail = 'bill_missing';
  end if;
  if v_bill.status <> 'confirmed' then
    raise exception 'Bill % is not confirmed. A credit note is knocked off only a confirmed bill.',
      coalesce(v_bill.bill_no, 'for invoice ' || v_bill.supplier_invoice_no)
      using errcode = 'P0001', detail = 'bill_not_confirmed';
  end if;
  if v_bill.supplier_id <> v_note.supplier_id then
    raise exception 'Bill % belongs to a different supplier. A credit note is knocked off only its own supplier''s bills.',
      v_bill.bill_no
      using errcode = 'P0001', detail = 'supplier_mismatch';
  end if;
  if v_bill.ap_account_code <> v_note.ap_account_code then
    raise exception 'Bill % is in account %, but credit note % is in account %. They cannot be matched.',
      v_bill.bill_no, v_bill.ap_account_code, v_note.note_no, v_note.ap_account_code
      using errcode = 'P0001', detail = 'ap_account_mismatch';
  end if;
  if exists (select 1 from public.supplier_credit_note_applications a
              where a.note_id = p_note_id and a.bill_id = p_bill_id and a.status = 'applied') then
    raise exception 'Credit note % is already knocked off bill %. Take it off first to change the amount.',
      v_note.note_no, v_bill.bill_no
      using errcode = 'P0001', detail = 'already_applied';
  end if;

  v_open := coalesce((select co.credit_open from public.supplier_credit_open(p_note_id) co), 0);
  if p_amount > v_open then
    raise exception 'Only RM % of credit note % is left. RM % is more than that.',
      to_char(v_open, 'FM999,999,999,990.00'), v_note.note_no, to_char(p_amount, 'FM999,999,999,990.00')
      using errcode = 'P0001', detail = 'credit_over_applied';
  end if;

  -- The bill's ceiling is the one a voucher allocation meets (0484).
  v_left := v_bill.total_amount - coalesce((select bp.held from public.ap_bill_paid(p_bill_id) bp), 0);
  if p_amount > v_left then
    raise exception 'Bill % has RM % left to pay. RM % is more than that.',
      v_bill.bill_no, to_char(v_left, 'FM999,999,999,990.00'), to_char(p_amount, 'FM999,999,999,990.00')
      using errcode = 'P0001', detail = 'bill_over_applied';
  end if;

  insert into public.supplier_credit_note_applications (note_id, bill_id, amount, created_by)
  values (p_note_id, p_bill_id, p_amount, v_me)
  returning id into v_id;

  perform public._ap_event('SUPPLIER_CREDIT_NOTE', p_note_id, 'credit_applied',
                           v_bill.bill_no || ' · ' || public.fin_rm(p_amount));
  perform public._ap_event('SUPPLIER_BILL', p_bill_id, 'credit_applied',
                           v_note.note_no || ' · ' || public.fin_rm(p_amount));
  return v_id;
end;
$fn$;

create or replace function public.supplier_credit_note_application_cancel(p_application_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := public.app_role()::text;
  v_me   uuid := (select u.id from public.app_users u where u.id = auth.uid());
  v_a    public.supplier_credit_note_applications%rowtype;
  v_note text;
  v_bill text;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance takes a credit note off a bill.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  if coalesce(p_reason, '') !~ '[^[:space:]]' then                   -- 0560
    raise exception 'Say why the credit note is taken off this bill.'
      using errcode = 'P0001', detail = 'reason_missing';
  end if;

  select * into v_a from public.supplier_credit_note_applications where id = p_application_id for update;
  if not found then
    raise exception 'That credit note on a bill does not exist.'
      using errcode = 'P0002', detail = 'application_missing';
  end if;
  if v_a.status <> 'applied' then
    raise exception 'This credit note is already taken off the bill.'
      using errcode = 'P0001', detail = 'already_cancelled';
  end if;

  update public.supplier_credit_note_applications
     set status        = 'cancelled',
         cancelled_at  = now(),
         cancelled_by  = v_me,
         cancel_reason = btrim(p_reason)
   where id = p_application_id;

  select n.note_no into v_note from public.supplier_credit_notes n where n.id = v_a.note_id;
  select coalesce(b.bill_no, b.supplier_invoice_no) into v_bill from public.supplier_bills b where b.id = v_a.bill_id;
  perform public._ap_event('SUPPLIER_CREDIT_NOTE', v_a.note_id, 'credit_taken_off',
                           v_bill || ' · ' || public.fin_rm(v_a.amount) || ' · ' || btrim(p_reason));
  perform public._ap_event('SUPPLIER_BILL', v_a.bill_id, 'credit_taken_off',
                           v_note || ' · ' || public.fin_rm(v_a.amount) || ' · ' || btrim(p_reason));
  return p_application_id;
end;
$fn$;

-- ── 7 · the readers ─────────────────────────────────────────────────────────
create or replace function public.supplier_credit_note_register()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.gl_may_read() then
    raise exception 'accounts payable is internal'
      using errcode = '42501', detail = 'not_internal';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(r) order by r.note_date desc, r.created_at desc) from (
      select n.id, n.note_no, n.status, n.supplier_id, s.name as supplier_name, s.kind::text as supplier_kind,
             n.supplier_note_no, n.note_date, n.ap_account_code, n.total_amount,
             case when n.status = 'confirmed' then co.applied_total end as applied_total,
             case when n.status = 'confirmed' then co.credit_open end as credit_open,
             (select count(*) from public.ap_document_files f
               where f.document_type = 'SUPPLIER_CREDIT_NOTE' and f.document_id = n.id)::integer as file_count,
             n.created_at
        from public.supplier_credit_notes n
        join public.suppliers s on s.id = n.supplier_id
        left join public.supplier_credit_open() co on co.note_id = n.id) r), '[]'::jsonb);
end;
$fn$;

create or replace function public.supplier_credit_note_document(p_note_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_note     public.supplier_credit_notes%rowtype;
  v_role     text := public.app_role()::text;
  v_finance  boolean;
  v_approver boolean;
  v_open     numeric(12,2);
  v_applied  numeric(12,2);
begin
  if not public.gl_may_read() then
    raise exception 'accounts payable is internal'
      using errcode = '42501', detail = 'not_internal';
  end if;
  select * into v_note from public.supplier_credit_notes where id = p_note_id;
  if not found then
    raise exception 'That credit note does not exist.'
      using errcode = 'P0002', detail = 'note_missing';
  end if;

  v_finance  := coalesce(v_role in ('finance','principal'), false);
  v_approver := public.has_finance_approver(auth.uid());
  select coalesce(co.credit_open, 0), coalesce(co.applied_total, 0) into v_open, v_applied
    from (select 1) one left join public.supplier_credit_open(p_note_id) co on true;

  return jsonb_build_object(
    'note', (
      select to_jsonb(x) from (
        select n.id, n.note_no, n.status, n.supplier_id, s.name as supplier_name, s.kind::text as supplier_kind,
               n.supplier_note_no, n.note_date, n.ap_account_code, ap.name as ap_account_name,
               n.total_amount, n.narration, n.cancel_reason,
               n.created_at, cu.name as created_by_name,
               n.confirmed_at, fu.name as confirmed_by_name,
               n.cancelled_at, xu.name as cancelled_by_name,
               e.entry_no as entry_no, re.entry_no as reversal_entry_no
          from public.supplier_credit_notes n
          join public.suppliers s on s.id = n.supplier_id
          left join public.gl_accounts ap on ap.code = n.ap_account_code
          left join public.app_users cu on cu.id = n.created_by
          left join public.app_users fu on fu.id = n.confirmed_by
          left join public.app_users xu on xu.id = n.cancelled_by
          left join public.gl_entries e  on e.id = n.gl_entry_id
          left join public.gl_entries re on re.id = n.reversal_entry_id
         where n.id = p_note_id) x),
    'lines', coalesce((
      select jsonb_agg(to_jsonb(y) order by y.line_no) from (
        select l.line_no, l.account_code, a.name as account_name, l.description, l.amount,
               l.department_type, l.department_id
          from public.supplier_credit_note_lines l
          left join public.gl_accounts a on a.code = l.account_code
         where l.note_id = p_note_id) y), '[]'::jsonb),
    'applications', coalesce((
      select jsonb_agg(to_jsonb(z) order by z.created_at) from (
        select ca.id as application_id, ca.bill_id, b.bill_no, b.supplier_invoice_no, b.bill_date,
               ca.amount, ca.status, ca.created_at,
               timezone('Asia/Kuala_Lumpur', ca.created_at)::date as applied_on,
               cu.name as created_by_name, ca.cancelled_at, ca.cancel_reason
          from public.supplier_credit_note_applications ca
          join public.supplier_bills b on b.id = ca.bill_id
          left join public.app_users cu on cu.id = ca.created_by
         where ca.note_id = p_note_id) z), '[]'::jsonb),
    'files', coalesce((
      select jsonb_agg(to_jsonb(f) order by f.uploaded_at) from (
        select fl.id, fl.file_name, fl.mime_type, fl.size_bytes, fl.storage_path,
               fl.uploaded_at, u.name as uploaded_by_name
          from public.ap_document_files fl
          left join public.app_users u on u.id = fl.uploaded_by
         where fl.document_type = 'SUPPLIER_CREDIT_NOTE' and fl.document_id = p_note_id) f), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(to_jsonb(ev) order by ev.at) from (
        select e.action, e.note, e.at, u.name as actor_name
          from public.ap_document_events e
          left join public.app_users u on u.id = e.actor
         where e.document_type = 'SUPPLIER_CREDIT_NOTE' and e.document_id = p_note_id) ev), '[]'::jsonb),
    'applied_total', case when v_note.status = 'confirmed' then v_applied end,
    'credit_open',   case when v_note.status = 'confirmed' then v_open end,
    'go_live_on', (select gc.go_live_on from public.gl_config gc where gc.id),
    'can', jsonb_build_object(
      'edit',     v_note.status = 'draft' and v_finance,
      'confirm',  v_note.status = 'draft' and v_finance,
      'cancel',   case v_note.status
                    when 'draft' then v_finance
                    when 'confirmed' then v_approver and v_applied = 0
                    else false end,
      'add_file', v_note.status <> 'cancelled' and v_finance,
      'apply',    v_note.status = 'confirmed' and v_finance and v_open > 0,
      'take_off', v_note.status = 'confirmed' and v_finance)
  );
end;
$fn$;

-- ── 8 · a bill lists the credit notes knocked off it ─────────────────────────
-- Copied from 0485 and changed: payments gain the credit note knock-offs
-- (kind credit_note), carrying the note in voucher_id / voucher_no so the
-- page links it like the rest.
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
    -- A voucher that pays the bill, (0485) an advance applied to it, and
    -- (0642) a credit note knocked off it.
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
         where sa.bill_id = p_bill_id
        union all
        select 'credit_note'::text, ca.id,
               cn.id, cn.note_no, ca.status, cn.note_date,
               (ca.created_at at time zone 'Asia/Kuala_Lumpur')::date, ca.amount,
               (ca.created_at at time zone 'Asia/Kuala_Lumpur')::date
          from public.supplier_credit_note_applications ca
          join public.supplier_credit_notes cn on cn.id = ca.note_id
         where ca.bill_id = p_bill_id) z), '[]'::jsonb),
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

-- ── 8b · a bill with a credit note on it says so when it cannot be cancelled ─
-- The LIVE body (0560), changed only in the refusal's words: held now counts a
-- credit note knock-off too (ap_bill_paid above), so the words name it.
CREATE OR REPLACE FUNCTION public.supplier_bill_cancel(p_bill_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role     text := public.app_role()::text;
  v_bill     public.supplier_bills%rowtype;
  v_open     numeric(12,2);
  v_reversal uuid;
begin
  if coalesce(p_reason, '') !~ '[^[:space:]]' then
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
      raise exception 'RM % of this bill is on a payment voucher, an advance or a credit note. Cancel the voucher, or take the advance or the credit note off this bill, first.',
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
$function$;

-- ── 9 · grants ──────────────────────────────────────────────────────────────
revoke all on function public.supplier_credit_note_save_draft(uuid, uuid, text, date, jsonb, text, text) from public, anon;
revoke all on function public.supplier_credit_note_confirm(uuid)                                       from public, anon;
revoke all on function public.supplier_credit_note_cancel(uuid, text)                                  from public, anon;
revoke all on function public.supplier_credit_note_apply(uuid, uuid, numeric)                          from public, anon;
revoke all on function public.supplier_credit_note_application_cancel(uuid, text)                      from public, anon;
revoke all on function public.supplier_credit_note_register()                                          from public, anon;
revoke all on function public.supplier_credit_note_document(uuid)                                      from public, anon;
grant execute on function public.supplier_credit_note_save_draft(uuid, uuid, text, date, jsonb, text, text) to authenticated;
grant execute on function public.supplier_credit_note_confirm(uuid)                                       to authenticated;
grant execute on function public.supplier_credit_note_cancel(uuid, text)                                  to authenticated;
grant execute on function public.supplier_credit_note_apply(uuid, uuid, numeric)                          to authenticated;
grant execute on function public.supplier_credit_note_application_cancel(uuid, text)                      to authenticated;
grant execute on function public.supplier_credit_note_register()                                          to authenticated;
grant execute on function public.supplier_credit_note_document(uuid)                                      to authenticated;

-- ── 10 · sanity ─────────────────────────────────────────────────────────────
do $sanity$
declare
  v_src text;
begin
  if has_function_privilege('authenticated', 'public.ap_bill_paid(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.ap_bill_settled(date)', 'execute')
     or has_function_privilege('authenticated', 'public.supplier_credit_open(uuid)', 'execute') then
    raise exception '0642 sanity: a law-D helper is callable from outside';
  end if;
  if not has_function_privilege('authenticated', 'public.ap_outstanding(uuid)', 'execute')
     or has_function_privilege('anon', 'public.ap_outstanding(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.ap_account_choices()', 'execute')
     or has_function_privilege('anon', 'public.ap_account_choices()', 'execute') then
    raise exception '0642 sanity: a recreated door lost its grants';
  end if;
  select pg_get_functiondef('public.ap_bill_settled(date)'::regprocedure) into v_src;
  if position('supplier_credit_note_applications' in v_src) = 0 then
    raise exception '0642 sanity: ap_bill_settled does not count credit note knock-offs';
  end if;
  select pg_get_functiondef('public.ap_bill_paid(uuid)'::regprocedure) into v_src;
  if position('supplier_credit_note_applications' in v_src) = 0 or position('ap_bill_settled(' in v_src) = 0 then
    raise exception '0642 sanity: ap_bill_paid does not hold credit note knock-offs or lost ap_bill_settled';
  end if;
  select pg_get_functiondef('public.ap_outstanding(uuid)'::regprocedure) into v_src;
  if position('supplier_credit_open(' in v_src) = 0 then
    raise exception '0642 sanity: ap_outstanding does not subtract open credit';
  end if;
  -- The rebuilt bodies keep what later files wrote into them (the 0561
  -- lesson): 0554's advance account by role and 0580's stored heading flag.
  select pg_get_functiondef('public._ap_require_account(text, text, text)'::regprocedure) into v_src;
  if position('gl_account_for(''SUPPLIER_ADVANCE'')' in v_src) = 0 or position('is_heading' in v_src) = 0
     or position('credit_line' in v_src) = 0 then
    raise exception '0642 sanity: _ap_require_account lost 0554 / 0580, or has no credit_line';
  end if;
  select pg_get_functiondef('public.ap_account_choices()'::regprocedure) into v_src;
  if position('gl_account_for(''SUPPLIER_ADVANCE'')' in v_src) = 0 or position('is_heading' in v_src) = 0 then
    raise exception '0642 sanity: ap_account_choices lost 0554 / 0580';
  end if;
  select pg_get_functiondef('public.supplier_bill_cancel(uuid, text)'::regprocedure) into v_src;
  if position('[^[:space:]]' in v_src) = 0 or position('credit note' in v_src) = 0 then
    raise exception '0642 sanity: supplier_bill_cancel lost 0560''s blank test or does not name a credit note';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname like 'supplier_credit_%'
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0642 sanity: a credit note function lost security definer or its search_path';
  end if;
  -- fail closed: a caller with no internal role gets an error, never rows.
  begin
    perform public.supplier_credit_note_register();
    raise exception '0642 sanity: an anonymous caller was not refused';
  exception
    when insufficient_privilege then null;
  end;
end
$sanity$;

commit;
