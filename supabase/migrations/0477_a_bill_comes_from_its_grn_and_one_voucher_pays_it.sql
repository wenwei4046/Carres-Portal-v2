-- =============================================================================
-- 0477_a_bill_comes_from_its_grn_and_one_voucher_pays_it.sql
-- THE LEDGER · BUILD B — SUPPLIER BILLS FROM THE GRN, OTHER CREDITORS, AND ONE
-- PAYMENT VOUCHER FOR EVERY RINGGIT THAT LEAVES THE BANK
-- (docs/purchasing/MASTER.md §5 Receiving · ledger rulings K/L/M/N ·
--  evolves 0464_a_supplier_bill_is_a_document.sql — the same tables, altered;
--  no second set of bill or voucher tables.)
--
-- WHAT WAS WRONG, MEASURED
--   1. A bill could not name the goods it pays for. 0464 linked a bill to the
--      LEGACY `po_receipts` table (0001_init.sql:355), which the receiving
--      engine in use today (`operation_receive_po_with_do`, 0453:109) never
--      writes. Real goods receipts live in `warehouse_receipts` (0302) and wear
--      their GRN number from 0426. So every bill was typed by hand: no PO line,
--      no unit price, and nothing to stop finance billing more than arrived.
--   2. The accounts were not checked. A bill line could land on ANY account —
--      the bank, the AP control itself — and the AP account was only checked
--      for `is_control`, so 1220 Supplier claims receivable (an ASSET) passed
--      as a payable.
--   3. A landlord, an advertiser or a lorry company could not exist:
--      `suppliers.kind` allows only own_logistics / factory_pickup, and supplier
--      setup demands furniture categories (0428).
--   4. The 0464 payment voucher could only pay one supplier's bills, for
--      exactly the voucher amount, from ANY non-control account (6900 passed as
--      "the bank"). A small expense paid straight from the bank had no document
--      at all, and nobody looked at a voucher between "prepared" and "money out".
--   5. An older door still paid suppliers WITHOUT the ledger:
--      `finance_po_pay` (0063:239) and `finance_po_schedule` (0063:304), both
--      executable by every signed-in user.
--
-- WHAT THIS BUILDS
--   A. `2120 Other payables` — a LIABILITY control account for SUPPLIER
--      parties, beside 2110 Trade payables. Other-creditor bills credit it.
--   B. A supplier kind `other_creditor` and one door that creates one
--      (`supplier_other_creditor_create`) — name and contact only, no
--      furniture categories, finance or principal.
--   C. A bill line may point at a real GRN line: `warehouse_receipt_id` +
--      `po_line_id` + `unit_price`. `supplier_bill_save_draft` converts a GRN
--      into bill lines (never re-keyed), and a trigger that LOCKS the GRN
--      refuses billing more than arrived. The price difference against the PO
--      cost is shown, never blocked — finance checks the supplier's price.
--   D. Tightened accounts. AP must be a LIABILITY control for SUPPLIER; a bill
--      line must be a non-control EXPENSE or ASSET account and never a money
--      account; goods lines default to 5100.
--   E. The Houzs-shaped payment voucher (Houzs payment-vouchers.ts, 0081):
--      payee name, supplier optional, purpose (pay supplier bills / direct
--      payment), direct lines to any non-control expense/asset/liability
--      account AND/OR bill allocations, total = lines + allocations.
--      draft → prepared → checked → approved, with "return to draft" from
--      prepared or checked. Pay-from must be a money account (a leaf under
--      1100).
--          prepare  finance (or principal)
--          check    finance or principal — NOT the preparer
--          approve  the finance_approver duty (has_finance_approver) — NOT the
--                   preparer. This is the act that moves money and posts.
--   F. Files on bills and vouchers: a private storage bucket `ap-documents`
--      and a metadata table `ap_document_files`; history in
--      `ap_document_events`.
--   G. Readers for the Finance pages (registers, documents, GRN picker,
--      account choices) and `ap_outstanding` / `ap_bill_outstanding` re-read
--      against the new statuses.
--   H. The legacy pay door is closed: execute on `finance_po_pay` and
--      `finance_po_schedule` is revoked from public, anon and authenticated.
--
-- DR / CR, PER ACTION (proven by the functional probe, reading gl_entry_lines)
--   Confirm a bill — source SUPPLIER_BILL, dated the BILL's own date:
--       Dr  each line's account (goods from a GRN default to 5100)
--       Cr  the bill's AP control (2110 supplier / 2120 other creditor),
--           party = SUPPLIER, the bill's supplier or creditor
--   Cancel a confirmed bill (approver, nothing paid on it) — gl_reverse: the
--       contra, on the bill's ORIGINAL date.
--   Approve a payment voucher — source PAYMENT_VOUCHER, dated the PAYMENT date:
--       Dr  each direct line's account
--       Dr  each paid bill's own AP control, party = that bill's supplier
--       Cr  the pay-from money account, for the voucher total
--     (0464 named this source SUPPLIER_PAYMENT. A voucher now also pays an
--      expense with no supplier, so the source is named after the document.
--      No 0464 voucher was ever released — its door had no API — so no ledger
--      row carries the old name.)
--   Cancel an approved voucher (approver) — gl_reverse: the contra, on the
--       payment's ORIGINAL date. (Houzs dates its reversal today; Carres does
--       not.)
--   Save a draft, prepare, check, return to draft, add a file: post nothing.
--
-- PERIODIC STOCK, ON PURPOSE
--   Receiving still posts nothing and touches no finance record (0453:217-219),
--   and there is no goods-received-not-invoiced account. Goods reach the
--   ledger when the SUPPLIER'S BILL is confirmed, as cost of goods sold (5100).
--   Stock on hand (1310) is not moved by a bill; a stock valuation at month end
--   is a separate, later decision.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   · No supplier advance / factory deposit account. Paying a factory before
--     it bills is an open owner question; a voucher can only pay a confirmed
--     bill or a non-control account.
--   · No change to the Receiving engine. A receipt amended or voided AFTER a
--     bill was confirmed against it is not refused by Receiving; the bill
--     confirm re-checks the GRN, but a confirmed bill is not re-opened.
--   · Loan-out / fund-out accounts are not added: this build may add chart codes
--     2120–2199 only. A voucher line accepts them as soon as they exist.
--   · No backfill, no data update, no row deleted. Existing 0464 rows (there are
--     none in production; 0464 applies with this file) are walked past: the
--     three constraints that a legacy row could not meet are added NOT VALID.
--
-- RLS / PERMISSIONS — what changes and why
--   · New tables `payment_voucher_lines`, `ap_document_files`,
--     `ap_document_events`: RLS ON, all privileges revoked from anon and
--     authenticated, SELECT granted back to authenticated, and ONE select
--     policy `gl_may_read()` (finance + principal) — the same shape as the four
--     0464 tables. No insert/update/delete policy for anyone: every write is a
--     security-definer function that checks its caller.
--   · Storage: a NEW private bucket `ap-documents` (PDF/JPEG/PNG/WebP, 20 MB)
--     with two NEW policies on storage.objects — select and insert, to
--     authenticated, only in that bucket and only when `gl_may_read()`. No
--     update and no delete policy: a supplier's invoice is evidence. No
--     existing policy is changed.
--   · `suppliers`: no policy change; other creditors are inserted only by the
--     new definer door.
--   · Execute revoked on the two legacy pay functions (item H).
-- =============================================================================


-- ── 1 · the chart: 2120 Other payables ───────────────────────────────────────
-- A landlord's rent, an advertiser's invoice, a lorry company on 30 days: these
-- are payables, and they must not sit inside Trade payables, where the supplier
-- aging for furniture factories would include the landlord.
insert into public.gl_accounts (code, name, kind, parent_code, is_active, is_control, control_for)
values ('2120', 'Other payables', 'LIABILITY', '2100', true, true, 'SUPPLIER')
on conflict (code) do nothing;


-- ── 2 · the other creditor ───────────────────────────────────────────────────
-- A new enum value cannot be USED in the transaction that adds it, so nothing
-- below casts the literal to the enum: every function compares `kind::text`,
-- and the sanity probe never inserts one.
alter type public.supplier_kind add value if not exists 'other_creditor';

-- Who may add a landlord or an advertiser: finance and principal — the people
-- who enter their bills. Supplier setup (0428) stays principal-only and stays
-- about furniture factories; this door writes no categories, no production
-- days and no collection settings, because an other creditor has none.
create or replace function public.supplier_other_creditor_create(
  p_name          text,
  p_contact       text default null,
  p_contact_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := public.app_role()::text;
  v_name text := btrim(coalesce(p_name, ''));
  v_base text;
  v_slug text;
  v_n    integer := 1;
  v_id   uuid;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'only finance adds an other creditor'
      using errcode = '42501', detail = 'not_finance';
  end if;
  if length(v_name) < 2 then
    raise exception 'Type the creditor''s name.'
      using errcode = 'P0001', detail = 'creditor_name_missing';
  end if;
  if exists (select 1 from public.suppliers s where lower(btrim(s.name)) = lower(v_name)) then
    raise exception '% is already on the supplier list. Choose it instead of adding it again.', v_name
      using errcode = 'P0001', detail = 'creditor_name_taken';
  end if;

  -- The same slug rule supplier setup uses (0428:17), with a numeric tail when
  -- the name is taken, so a unique slug (0032) can never refuse a real name.
  v_base := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
  if v_base = '' then
    v_base := 'creditor';
  end if;
  v_slug := v_base;
  while exists (select 1 from public.suppliers s where s.slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  insert into public.suppliers (name, slug, kind, cat_covered, contact, contact_email)
  values (v_name, v_slug, 'other_creditor', '{}',
          nullif(btrim(coalesce(p_contact, '')), ''),
          nullif(btrim(coalesce(p_contact_email, '')), ''))
  returning id into v_id;
  return v_id;
end;
$fn$;

comment on function public.supplier_other_creditor_create(text, text, text) is
  '0477: adds a non-furniture creditor (landlord, advertiser, logistics on credit terms) as suppliers.kind = other_creditor, with no categories. Finance or principal. Its bills credit 2120 Other payables.';


-- ── 3 · money and account rules, in one place ────────────────────────────────
-- A money account is an active, non-control ASSET leaf whose ancestry reaches
-- 1100 Cash and bank. Walking the ancestry (not just parent = 1100) keeps this
-- true when a second bank account is hung under a new 1120-style heading.
create or replace function public.ap_account_is_money(p_code text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_acc    public.gl_accounts%rowtype;
  v_parent text;
  v_depth  integer := 0;
begin
  select * into v_acc from public.gl_accounts where code = p_code;
  if not found or not v_acc.is_active or v_acc.is_control or v_acc.kind <> 'ASSET' then
    return false;
  end if;
  if exists (select 1 from public.gl_accounts c where c.parent_code = v_acc.code) then
    return false;                                   -- a heading holds no money
  end if;
  v_parent := v_acc.parent_code;
  while v_parent is not null and v_depth < 12 loop
    if v_parent = '1100' then
      return true;
    end if;
    select a.parent_code into v_parent from public.gl_accounts a where a.code = v_parent;
    v_depth := v_depth + 1;
  end loop;
  return false;
end;
$fn$;

-- One refusal per rule, worded for the person at the screen. `p_use` is
-- 'bill_line' · 'voucher_line' · 'ap' · 'pay_from'.
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

-- Copied from 0464 §6 and changed only in its error codes: P0001 with a
-- detail, so the API answers 422 with the reason instead of a 500.
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
    raise exception '% has no date.', p_what
      using errcode = 'P0001', detail = 'date_missing';
  end if;
  select go_live_on into v_go_live from public.gl_config where id;
  if v_go_live is null then
    raise exception 'The ledger has no start date yet, so it cannot accept %.', lower(p_what)
      using errcode = 'P0001', detail = 'no_go_live';
  end if;
  if p_doc_date < v_go_live then
    raise exception '% is dated %, before the ledger start date of %. Nothing dated earlier can enter the ledger.',
      p_what, to_char(p_doc_date, 'DD Mon YYYY'), to_char(v_go_live, 'DD Mon YYYY')
      using errcode = 'P0001', detail = 'before_go_live';
  end if;
end;
$fn$;


-- ── 4 · history and files ────────────────────────────────────────────────────
create table if not exists public.ap_document_events (
  id            uuid primary key default gen_random_uuid(),
  document_type text not null check (document_type in ('SUPPLIER_BILL','PAYMENT_VOUCHER')),
  document_id   uuid not null,
  action        text not null check (action in ('created','edited','confirmed','prepared',
                                                'checked','approved','rejected','cancelled',
                                                'file_added')),
  note          text,
  actor         uuid references public.app_users(id),
  at            timestamptz not null default now()
);
create index if not exists ap_document_events_doc_idx
  on public.ap_document_events (document_type, document_id, at);

create table if not exists public.ap_document_files (
  id            uuid primary key default gen_random_uuid(),
  document_type text not null check (document_type in ('SUPPLIER_BILL','PAYMENT_VOUCHER')),
  document_id   uuid not null,
  storage_path  text not null unique,
  file_name     text not null check (length(btrim(file_name)) between 1 and 200),
  mime_type     text not null check (mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
  size_bytes    bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  uploaded_by   uuid references public.app_users(id),
  uploaded_at   timestamptz not null default now()
);
create index if not exists ap_document_files_doc_idx
  on public.ap_document_files (document_type, document_id, uploaded_at);

-- History and evidence are append-only.
create or replace function public.ap_append_only()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  raise exception 'a % row is never changed or deleted', tg_table_name
    using errcode = '42501', detail = 'append_only';
end;
$fn$;

create trigger ap_document_events_append_only
  before update or delete on public.ap_document_events
  for each row execute function public.ap_append_only();
create trigger ap_document_files_append_only
  before update or delete on public.ap_document_files
  for each row execute function public.ap_append_only();

create or replace function public._ap_event(p_type text, p_id uuid, p_action text, p_note text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  insert into public.ap_document_events (document_type, document_id, action, note, actor)
  values (p_type, p_id, p_action, nullif(btrim(coalesce(p_note, '')), ''),
          (select u.id from public.app_users u where u.id = auth.uid()));
end;
$fn$;

-- The private bucket. Same shape as service-case-evidence (0289): PRIVATE,
-- read through short-lived signed URLs minted by the Worker with the USER's
-- token, insert for the same readers, no update and no delete.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ap-documents', 'ap-documents', false, 20971520,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists ap_documents_finance_select on storage.objects;
drop policy if exists ap_documents_finance_insert on storage.objects;

create policy ap_documents_finance_select on storage.objects
  for select to authenticated
  using (bucket_id = 'ap-documents' and (select public.gl_may_read()));

create policy ap_documents_finance_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'ap-documents' and (select public.gl_may_read()));


-- ── 5 · the bill line learns its GRN ─────────────────────────────────────────
-- `po_receipt_id` on the bill header stays (0464 created it) but is no longer
-- written: it points at the legacy table. The real link is per LINE, because
-- one supplier invoice can cover lines from two deliveries.
alter table public.supplier_bill_lines
  add column if not exists warehouse_receipt_id uuid
    references public.warehouse_receipts(id) on delete restrict,
  add column if not exists po_line_id uuid
    references public.purchase_order_lines(id) on delete restrict,
  add column if not exists unit_price numeric(12,2);

alter table public.supplier_bill_lines
  add constraint supplier_bill_lines_grn_link_paired
    check ((warehouse_receipt_id is null) = (po_line_id is null)),
  add constraint supplier_bill_lines_unit_price_not_negative
    check (unit_price is null or unit_price >= 0),
  add constraint supplier_bill_lines_grn_line_is_priced
    check (warehouse_receipt_id is null or (qty is not null and unit_price is not null)),
  add constraint supplier_bill_lines_amount_is_qty_times_price
    check (qty is null or unit_price is null or amount = round(qty * unit_price, 2));

create index if not exists supplier_bill_lines_grn_idx
  on public.supplier_bill_lines (warehouse_receipt_id, po_line_id)
  where warehouse_receipt_id is not null;

-- What a GRN line can be billed for: the good units plus the damaged ones —
-- both physically arrived and both are the item that was ordered (a damaged
-- unit is recovered through the supplier claim, 1220, not by refusing the
-- bill). Wrong items are NOT billable: they are not what was ordered.
-- `received_now` / `damaged_qty` are the per-session counts the shared receipt
-- validator stores (0426 §3, amended in place by receiving_amend, 0453).
create or replace function public.ap_grn_billable_qty(p_receipt_id uuid, p_po_line_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(sum(
           coalesce(nullif(l ->> 'received_now', '')::numeric, 0)
         + coalesce(nullif(l ->> 'damaged_qty',  '')::numeric, 0)), 0)
    from public.warehouse_receipts r
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(r.lines) = 'array' then r.lines else '[]'::jsonb end) l
   where r.id = p_receipt_id
     and l ->> 'id' = p_po_line_id::text;
$fn$;

-- The GRN ceiling. It LOCKS the receipt row, so two bills converted from one
-- GRN in two tabs queue here instead of both reading the same open quantity.
-- Drafts count: a draft that claims a GRN line holds it until it is cancelled.
create or replace function public.supplier_bill_line_grn_ceiling()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_bill     public.supplier_bills%rowtype;
  v_rcpt     public.warehouse_receipts%rowtype;
  v_po       public.purchase_orders%rowtype;
  v_pol      public.purchase_order_lines%rowtype;
  v_grn      text;
  v_billable numeric;
  v_billed   numeric;
  v_holders  text;
begin
  if new.warehouse_receipt_id is null then
    return new;
  end if;

  select * into v_bill from public.supplier_bills where id = new.bill_id;

  select * into v_rcpt from public.warehouse_receipts
   where id = new.warehouse_receipt_id
   for update;
  if not found then
    raise exception 'Line %: that goods receipt does not exist.', new.line_no
      using errcode = 'P0002', detail = 'grn_missing';
  end if;
  -- Read through to_jsonb: `grn_no` arrives with 0426, and a database where
  -- 0426 has not applied must still run this.
  v_grn := coalesce(to_jsonb(v_rcpt) ->> 'grn_no', 'the goods receipt of ' || v_rcpt.po_id);

  if v_rcpt.status <> 'posted' then
    raise exception 'Line %: % is not finished yet, so it cannot be billed.', new.line_no, v_grn
      using errcode = 'P0001', detail = 'grn_not_posted';
  end if;

  select * into v_po from public.purchase_orders where id = v_rcpt.po_id;
  if v_po.supplier_id is distinct from v_bill.supplier_id then
    raise exception 'Line %: % belongs to a different supplier.', new.line_no, v_grn
      using errcode = 'P0001', detail = 'grn_other_supplier';
  end if;
  -- 0426: a consignment receipt creates no payable — the goods are still the
  -- supplier's.
  if coalesce((to_jsonb(v_po) ->> 'is_consignment')::boolean, false) then
    raise exception 'Line %: % is a consignment receipt. The goods still belong to the supplier, so there is nothing to bill.', new.line_no, v_grn
      using errcode = 'P0001', detail = 'grn_is_consignment';
  end if;

  select * into v_pol from public.purchase_order_lines where id = new.po_line_id;
  if not found or v_pol.po_id is distinct from v_rcpt.po_id then
    raise exception 'Line %: that PO line is not on %.', new.line_no, v_grn
      using errcode = 'P0001', detail = 'po_line_not_on_grn';
  end if;

  v_billable := public.ap_grn_billable_qty(new.warehouse_receipt_id, new.po_line_id);
  if v_billable <= 0 then
    raise exception 'Line %: % received no % that can be billed.', new.line_no, v_grn, v_pol.sku
      using errcode = 'P0001', detail = 'po_line_not_on_grn';
  end if;

  -- Name the bills that hold the quantity: a forgotten DRAFT holds it too, and
  -- the person at the screen has to be able to find it.
  select coalesce(sum(bl.qty), 0),
         string_agg(distinct coalesce(b.bill_no, 'the draft for invoice ' || b.supplier_invoice_no), ', ')
    into v_billed, v_holders
    from public.supplier_bill_lines bl
    join public.supplier_bills b on b.id = bl.bill_id
   where bl.warehouse_receipt_id = new.warehouse_receipt_id
     and bl.po_line_id = new.po_line_id
     and b.status <> 'cancelled'
     and bl.id <> new.id;

  if v_billed + coalesce(new.qty, 0) > v_billable then
    raise exception 'Line %: % received % of %, and % of them are already on %. This line bills %, which is more than arrived.',
      new.line_no, v_grn, trim_scale(v_billable), v_pol.sku, trim_scale(v_billed),
      coalesce(v_holders, 'another bill'), trim_scale(new.qty)
      using errcode = 'P0001', detail = 'grn_over_billed';
  end if;

  return new;
end;
$fn$;

create trigger supplier_bill_line_grn_ceiling_trg
  before insert or update on public.supplier_bill_lines
  for each row execute function public.supplier_bill_line_grn_ceiling();

-- Copied from 0464 §5 and changed: a DRAFT's lines may now be deleted, because
-- saving a draft replaces its lines. Past draft, nothing moves and nothing is
-- deleted, exactly as before.
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

  if v_status is distinct from 'draft' then
    if tg_op = 'DELETE' then
      raise exception
        'a supplier bill line is never deleted once the bill is confirmed; cancel the bill and enter a corrected one'
        using errcode = '42501', detail = 'no_delete';
    end if;
    raise exception
      'the lines of a % supplier bill are frozen', coalesce(v_status, 'missing')
      using errcode = '42501', detail = 'bill_not_draft';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$fn$;


-- ── 6 · the payment voucher grows into the Houzs shape ───────────────────────
-- Renamed, not re-created: "released" is now "approved" (the boss's act), and
-- the bank account is "pay from", because petty cash is not a bank.
alter table public.payment_vouchers rename column released_at to approved_at;
alter table public.payment_vouchers rename column released_by to approved_by;
alter table public.payment_vouchers rename column bank_account_code to pay_from_account_code;

alter table public.payment_vouchers
  alter column supplier_id drop not null,
  -- no longer read: each allocation debits its OWN bill's AP account
  alter column ap_account_code drop not null,
  add column if not exists purpose       text,
  add column if not exists payee_name    text,
  add column if not exists checked_at    timestamptz,
  add column if not exists checked_by    uuid references public.app_users(id),
  add column if not exists rejected_at   timestamptz,
  add column if not exists rejected_by   uuid references public.app_users(id),
  add column if not exists reject_reason text;

alter table public.payment_vouchers
  drop constraint if exists payment_vouchers_status_check,
  drop constraint if exists payment_vouchers_prepared_is_stamped,
  drop constraint if exists payment_vouchers_released_is_posted,
  drop constraint if exists payment_vouchers_separation_of_duties;

alter table public.payment_vouchers
  -- NOT VALID: a 0464 row could hold 'released' or have no purpose/payee.
  -- New and changed rows are held to the rule; old rows are walked past.
  add constraint payment_vouchers_status_check
    check (status in ('draft','prepared','checked','approved','cancelled')) not valid,
  add constraint payment_vouchers_purpose_named
    check (purpose is not null and purpose in ('SUPPLIER_BILLS','DIRECT')) not valid,
  add constraint payment_vouchers_payee_named
    check (length(btrim(coalesce(payee_name, ''))) > 0) not valid,
  add constraint payment_vouchers_bills_need_a_supplier
    check (purpose is distinct from 'SUPPLIER_BILLS' or supplier_id is not null),
  add constraint payment_vouchers_prepared_is_stamped
    check (status not in ('prepared','checked','approved')
           or (voucher_no is not null and prepared_at is not null and prepared_by is not null)),
  add constraint payment_vouchers_checked_is_stamped
    check (status not in ('checked','approved')
           or (checked_at is not null and checked_by is not null)),
  add constraint payment_vouchers_approved_is_posted
    check (status <> 'approved'
           or (gl_entry_id is not null and approved_at is not null and approved_by is not null)),
  -- The rule where the database can read it too. The functions refuse first,
  -- in words; this stops any other path. The checker MAY be the approver.
  add constraint payment_vouchers_separation_of_duties
    check ((checked_by  is null or prepared_by is null or checked_by  <> prepared_by)
       and (approved_by is null or prepared_by is null or approved_by <> prepared_by)),
  add constraint payment_vouchers_return_states_its_reason
    check (rejected_at is null or length(btrim(coalesce(reject_reason, ''))) > 0);

create index if not exists payment_vouchers_status_idx
  on public.payment_vouchers (status, voucher_date);

-- Direct lines: the expense, the loan, the fund transfer — anything that is not
-- a supplier bill.
create table if not exists public.payment_voucher_lines (
  id           uuid primary key default gen_random_uuid(),
  voucher_id   uuid not null references public.payment_vouchers(id) on delete restrict,
  line_no      integer not null check (line_no > 0),
  account_code text not null references public.gl_accounts(code),
  description  text,
  amount       numeric(12,2) not null check (amount > 0),
  created_at   timestamptz not null default now(),
  unique (voucher_id, line_no)
);
create index if not exists payment_voucher_lines_voucher_idx
  on public.payment_voucher_lines (voucher_id, line_no);

create or replace function public.payment_voucher_lines_only_while_draft()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_status text;
begin
  select status into v_status from public.payment_vouchers
   where id = coalesce(new.voucher_id, old.voucher_id);
  if v_status is distinct from 'draft' then
    raise exception 'the lines of a payment voucher are frozen once it is prepared'
      using errcode = '42501', detail = 'voucher_not_draft';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$fn$;

create trigger payment_voucher_lines_only_while_draft_trg
  before insert or update or delete on public.payment_voucher_lines
  for each row execute function public.payment_voucher_lines_only_while_draft();

-- Copied from 0464 §4 and changed: a DRAFT's allocations may be deleted (saving
-- a draft replaces them); past draft nothing moves, as before.
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
      'the bills on a payment voucher are frozen once it is prepared'
      using errcode = '42501', detail = 'voucher_not_draft';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$fn$;

-- Copied from 0464 §4 and changed: the voucher must be a "pay supplier bills"
-- voucher with a supplier; refusals are P0001 with a detail (0464 used 23514,
-- which reached the screen as a 500).
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

  select coalesce(sum(a.amount_applied), 0)
    into v_on_bill
    from public.payment_voucher_allocations a
    join public.payment_vouchers v on v.id = a.voucher_id
   where a.bill_id = new.bill_id
     and v.status <> 'cancelled'
     and a.id <> new.id;

  if v_on_bill + new.amount_applied > v_bill.total_amount then
    raise exception 'Bill % is RM % and RM % of it is already on a payment voucher, so it cannot take RM % more.',
      v_bill.bill_no,
      to_char(v_bill.total_amount, 'FM999,999,999,990.00'),
      to_char(v_on_bill, 'FM999,999,999,990.00'),
      to_char(new.amount_applied, 'FM999,999,999,990.00')
      using errcode = 'P0001', detail = 'bill_over_allocated';
  end if;

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

-- Copied from 0464 §5 and rewritten for the new walk:
--   draft     free
--   prepared  → checked · → draft (returned) · → cancelled
--   checked   → approved · → draft (returned) · → cancelled
--   approved  → cancelled (by reversal)
--   cancelled final
-- The money facts are locked from prepare onward; going back to draft clears
-- the prepare/check stamps and nothing else.
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


-- ── 7 · the bill's doors ─────────────────────────────────────────────────────
-- 0464's create door took a legacy po_receipt_id and no unit price. It is
-- replaced by ONE save door that creates a draft (p_bill_id null) or rewrites
-- a draft (p_bill_id given). Nothing has ever called the old one.
drop function if exists public.supplier_bill_create(uuid, text, date, text, jsonb, date, text, uuid, text);

-- p_lines: [{ warehouse_receipt_id?, po_line_id?, account_code?, description?,
--             sku?, qty?, unit_price?, amount? }]
--   · a GRN line names BOTH warehouse_receipt_id and po_line_id, a qty and a
--     unit price; its amount is qty × price; its account defaults to 5100.
--   · any other line names an account and an amount (or qty and price).
create or replace function public.supplier_bill_save_draft(
  p_bill_id             uuid,
  p_supplier_id         uuid,
  p_supplier_invoice_no text,
  p_bill_date           date,
  p_lines               jsonb,
  p_due_date            date default null,
  p_ap_account_code     text default null,
  p_narration           text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     text := public.app_role()::text;
  v_me       uuid := (select u.id from public.app_users u where u.id = auth.uid());
  v_bill     public.supplier_bills%rowtype;
  v_supplier public.suppliers%rowtype;
  v_invoice  text := btrim(coalesce(p_supplier_invoice_no, ''));
  v_ap       text;
  v_dup      text;
  v_line     jsonb;
  v_n        integer := 0;
  v_total    numeric(12,2) := 0;
  v_rcpt     uuid;
  v_pol_id   uuid;
  v_pol      public.purchase_order_lines%rowtype;
  v_account  text;
  v_qty      numeric(12,2);
  v_price    numeric(12,2);
  v_amount   numeric(12,2);
  v_sku      text;
  v_desc     text;
  v_pos      text[] := '{}';
  v_id       uuid;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'only finance enters a supplier bill'
      using errcode = '42501', detail = 'not_finance';
  end if;

  if p_bill_id is not null then
    select * into v_bill from public.supplier_bills where id = p_bill_id for update;
    if not found then
      raise exception 'That bill does not exist.'
        using errcode = 'P0002', detail = 'bill_missing';
    end if;
    if v_bill.status <> 'draft' then
      raise exception 'Only a draft bill can be changed.'
        using errcode = 'P0001', detail = 'bill_not_draft';
    end if;
  end if;

  select * into v_supplier from public.suppliers where id = p_supplier_id;
  if not found then
    raise exception 'Choose who sent this bill.'
      using errcode = 'P0001', detail = 'supplier_missing';
  end if;
  if v_invoice = '' then
    raise exception 'Type the invoice number printed on the supplier''s bill.'
      using errcode = 'P0001', detail = 'invoice_no_missing';
  end if;
  if p_bill_date is null then
    raise exception 'Type the date printed on the supplier''s bill.'
      using errcode = 'P0001', detail = 'bill_date_missing';
  end if;
  perform public.ap_refuse_before_go_live(p_bill_date, 'This bill');
  if p_due_date is not null and p_due_date < p_bill_date then
    raise exception 'The due date is before the bill date.'
      using errcode = 'P0001', detail = 'due_before_bill_date';
  end if;

  -- The same invoice entered twice is how a supplier gets paid twice. The
  -- unique index (0464) is the last line; this says it in words first.
  select coalesce(b.bill_no, 'a draft bill') into v_dup
    from public.supplier_bills b
   where b.supplier_id = p_supplier_id
     and lower(btrim(b.supplier_invoice_no)) = lower(v_invoice)
     and b.status <> 'cancelled'
     and b.id is distinct from p_bill_id
   limit 1;
  if v_dup is not null then
    raise exception 'Invoice % from % is already entered, as %.', v_invoice, v_supplier.name, v_dup
      using errcode = 'P0001', detail = 'invoice_already_entered';
  end if;

  -- 2120 for an other creditor, 2110 for a supplier, unless finance chose
  -- another SUPPLIER payables account.
  v_ap := coalesce(nullif(btrim(coalesce(p_ap_account_code, '')), ''),
                   case when v_supplier.kind::text = 'other_creditor' then '2120' else '2110' end);
  perform public._ap_require_account(v_ap, 'ap', 'Payables account');

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'A bill needs at least one line.'
      using errcode = 'P0001', detail = 'no_lines';
  end if;
  if jsonb_array_length(p_lines) > 300 then
    raise exception 'A bill can have at most 300 lines.'
      using errcode = 'P0001', detail = 'too_many_lines';
  end if;

  if p_bill_id is null then
    insert into public.supplier_bills
      (supplier_invoice_no, supplier_id, bill_date, due_date, ap_account_code,
       narration, created_by)
    values
      (v_invoice, p_supplier_id, p_bill_date, p_due_date, v_ap,
       nullif(btrim(coalesce(p_narration, '')), ''), v_me)
    returning id into v_id;
  else
    v_id := p_bill_id;
    update public.supplier_bills
       set supplier_invoice_no = v_invoice,
           supplier_id         = p_supplier_id,
           bill_date           = p_bill_date,
           due_date            = p_due_date,
           ap_account_code     = v_ap,
           narration           = nullif(btrim(coalesce(p_narration, '')), ''),
           po_id               = null,
           total_amount        = 0
     where id = v_id;
    -- A draft's lines are replaced whole. Allowed only while draft
    -- (supplier_bill_lines_frozen); a draft has posted nothing.
    delete from public.supplier_bill_lines where bill_id = v_id;
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_n := v_n + 1;
    if jsonb_typeof(v_line) <> 'object' then
      raise exception 'Line % is not a bill line.', v_n
        using errcode = 'P0001', detail = 'line_invalid';
    end if;
    begin
      v_rcpt   := nullif(btrim(coalesce(v_line ->> 'warehouse_receipt_id', '')), '')::uuid;
      v_pol_id := nullif(btrim(coalesce(v_line ->> 'po_line_id', '')), '')::uuid;
      v_qty    := round(nullif(btrim(coalesce(v_line ->> 'qty', '')), '')::numeric, 2);
      v_price  := round(nullif(btrim(coalesce(v_line ->> 'unit_price', '')), '')::numeric, 2);
      v_amount := round(nullif(btrim(coalesce(v_line ->> 'amount', '')), '')::numeric, 2);
    exception when invalid_text_representation then
      raise exception 'Line %: a number or a link on it is not readable.', v_n
        using errcode = 'P0001', detail = 'line_invalid';
    end;
    v_account := nullif(btrim(coalesce(v_line ->> 'account_code', '')), '');
    v_sku     := nullif(btrim(coalesce(v_line ->> 'sku', '')), '');
    v_desc    := nullif(btrim(coalesce(v_line ->> 'description', '')), '');

    if (v_rcpt is null) <> (v_pol_id is null) then
      raise exception 'Line %: a goods line names both its goods receipt and its PO line.', v_n
        using errcode = 'P0001', detail = 'grn_link_half';
    end if;

    if v_rcpt is not null then
      select * into v_pol from public.purchase_order_lines where id = v_pol_id;
      if not found then
        raise exception 'Line %: that PO line does not exist.', v_n
          using errcode = 'P0001', detail = 'po_line_missing';
      end if;
      if v_qty is null or v_qty <= 0 then
        raise exception 'Line %: type how many % this bill charges for.', v_n, v_pol.sku
          using errcode = 'P0001', detail = 'grn_line_needs_qty';
      end if;
      if v_price is null or v_price < 0 then
        raise exception 'Line %: type the unit price on the supplier''s bill.', v_n
          using errcode = 'P0001', detail = 'grn_line_needs_price';
      end if;
      v_amount  := round(v_qty * v_price, 2);
      v_account := coalesce(v_account, '5100');     -- periodic stock: cost of goods sold
      v_sku     := coalesce(v_sku, v_pol.sku);
      v_desc    := coalesce(v_desc, v_pol.sku);
      if not (v_pol.po_id = any (v_pos)) then
        v_pos := v_pos || v_pol.po_id;
      end if;
    else
      if v_qty is not null and v_qty <= 0 then
        raise exception 'Line %: the quantity must be more than 0.', v_n
          using errcode = 'P0001', detail = 'line_qty_invalid';
      end if;
      if v_price is not null and v_price < 0 then
        raise exception 'Line %: the unit price cannot be below 0.', v_n
          using errcode = 'P0001', detail = 'line_price_invalid';
      end if;
      if v_qty is not null and v_price is not null then
        v_amount := round(v_qty * v_price, 2);
      end if;
      if v_desc is null and v_sku is null then
        raise exception 'Line %: say what this charge is for.', v_n
          using errcode = 'P0001', detail = 'line_needs_description';
      end if;
    end if;

    if v_amount is null or v_amount <= 0 then
      raise exception 'Line %: the amount must be more than RM 0.00.', v_n
        using errcode = 'P0001', detail = 'line_amount_invalid';
    end if;
    perform public._ap_require_account(v_account, 'bill_line', format('Line %s', v_n));

    insert into public.supplier_bill_lines
      (bill_id, line_no, account_code, description, sku, qty, unit_price, amount,
       warehouse_receipt_id, po_line_id)
    values
      (v_id, v_n, v_account, v_desc, v_sku, v_qty, v_price, v_amount,
       v_rcpt, v_pol_id);
    v_total := v_total + v_amount;
  end loop;

  update public.supplier_bills
     set total_amount = v_total,
         po_id        = case when cardinality(v_pos) = 1 then v_pos[1] end
   where id = v_id;

  perform public._ap_event('SUPPLIER_BILL', v_id,
                           case when p_bill_id is null then 'created' else 'edited' end, null);
  return v_id;
end;
$fn$;

-- Copied from 0464 §7 and changed: every account is re-checked by rule, the
-- GRN lines are re-checked against the receipt as it stands now (it may have
-- been amended since the draft was saved), refusals are P0001, and the act is
-- written to the history.
create or replace function public.supplier_bill_confirm(p_bill_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role  text := public.app_role()::text;
  v_bill  public.supplier_bills%rowtype;
  v_total numeric(12,2);
  v_lines jsonb;
  v_no    text;
  v_entry uuid;
  v_bad   text;
  r       record;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'only finance confirms a supplier bill'
      using errcode = '42501', detail = 'not_finance';
  end if;

  select * into v_bill from public.supplier_bills where id = p_bill_id for update;
  if not found then
    raise exception 'That bill does not exist.'
      using errcode = 'P0002', detail = 'bill_missing';
  end if;
  if v_bill.status <> 'draft' then
    raise exception 'This bill is already %.',
      case v_bill.status when 'confirmed' then 'confirmed' else 'cancelled' end
      using errcode = 'P0001', detail = 'bill_not_draft';
  end if;

  perform public.ap_refuse_before_go_live(v_bill.bill_date, 'This bill');
  perform public._ap_require_account(v_bill.ap_account_code, 'ap', 'Payables account');

  for r in select l.line_no, l.account_code
             from public.supplier_bill_lines l
            where l.bill_id = p_bill_id order by l.line_no loop
    perform public._ap_require_account(r.account_code, 'bill_line', format('Line %s', r.line_no));
  end loop;

  select coalesce(sum(amount), 0) into v_total
    from public.supplier_bill_lines where bill_id = p_bill_id;
  if v_total <= 0 then
    raise exception 'A bill of RM 0.00 is not a bill.'
      using errcode = 'P0001', detail = 'zero_total';
  end if;

  -- The GRNs as they stand NOW. Lock them first, so a concurrent bill on the
  -- same GRN waits for this one.
  perform 1
     from public.warehouse_receipts wr
    where wr.id in (select l.warehouse_receipt_id from public.supplier_bill_lines l
                     where l.bill_id = p_bill_id and l.warehouse_receipt_id is not null)
    for update;

  select string_agg(format('line %s', x.line_no), ', ' order by x.line_no) into v_bad
    from (
      select bl.line_no
        from public.supplier_bill_lines bl
        join public.warehouse_receipts wr on wr.id = bl.warehouse_receipt_id
       where bl.bill_id = p_bill_id
         and (wr.status <> 'posted'
              or (select coalesce(sum(b2l.qty), 0)
                    from public.supplier_bill_lines b2l
                    join public.supplier_bills b2 on b2.id = b2l.bill_id
                   where b2l.warehouse_receipt_id = bl.warehouse_receipt_id
                     and b2l.po_line_id = bl.po_line_id
                     and b2.status <> 'cancelled')
                 > public.ap_grn_billable_qty(bl.warehouse_receipt_id, bl.po_line_id))
    ) x;
  if v_bad is not null then
    raise exception 'The goods receipt changed after this bill was saved (%). Open the bill, correct the quantities and confirm again.', v_bad
      using errcode = 'P0001', detail = 'grn_changed_since_draft';
  end if;

  -- Dr each line, Cr the AP control for the whole, party = the supplier.
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

  -- Random, not sequential — purchasing MASTER §6.1 (as 0464).
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

  perform public._ap_event('SUPPLIER_BILL', p_bill_id, 'confirmed', v_no);
  return v_entry;
end;
$fn$;

-- Copied from 0464 §7 and changed: refusals are P0001 / 42501 with details, a
-- confirmed bill counts only NON-cancelled vouchers as holding it, and the act
-- is written to the history.
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

    select coalesce(sum(a.amount_applied), 0) into v_open
      from public.payment_voucher_allocations a
      join public.payment_vouchers v on v.id = a.voucher_id
     where a.bill_id = p_bill_id and v.status <> 'cancelled';

    if v_open > 0 then
      raise exception 'RM % of this bill is on a payment voucher. Cancel that voucher first.',
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


-- ── 8 · the voucher's doors ──────────────────────────────────────────────────
-- 0464's create / allocate / release are replaced. Nothing has ever called
-- them (no API route, no page).
drop function if exists public.payment_voucher_create(uuid, date, numeric, text, text, jsonb, text, text, text);
drop function if exists public.payment_voucher_allocate(uuid, uuid, numeric);
drop function if exists public.payment_voucher_release(uuid);

-- p_lines:       [{ account_code, description, amount }]
-- p_allocations: [{ bill_id, amount }]
-- The voucher total is NOT typed: it is lines + allocations, computed here.
create or replace function public.payment_voucher_save_draft(
  p_voucher_id            uuid,
  p_purpose               text,
  p_supplier_id           uuid,
  p_payee_name            text,
  p_voucher_date          date,
  p_pay_from_account_code text,
  p_lines                 jsonb default '[]'::jsonb,
  p_allocations           jsonb default '[]'::jsonb,
  p_pay_method            text  default 'BANK_TRANSFER',
  p_pay_reference         text  default null,
  p_narration             text  default null
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

  -- What it pays.
  if v_purpose = 'SUPPLIER_BILLS' then
    if jsonb_array_length(v_allocs) = 0 then
      raise exception 'Choose at least one bill to pay.'
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

  if v_total <= 0 then
    raise exception 'A voucher of RM 0.00 pays nothing.'
      using errcode = 'P0001', detail = 'zero_total';
  end if;

  if p_voucher_id is null then
    insert into public.payment_vouchers
      (purpose, supplier_id, payee_name, voucher_date, amount, pay_method,
       pay_reference, pay_from_account_code, narration, status, created_by)
    values
      (v_purpose, p_supplier_id, v_payee, p_voucher_date, v_total, v_method,
       nullif(btrim(coalesce(p_pay_reference, '')), ''), v_pay_from,
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

-- Everything prepare, check and approve must agree on, in one place.
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
    if v_nallocs = 0 then
      raise exception 'Choose at least one bill to pay.'
        using errcode = 'P0001', detail = 'no_bills';
    end if;
  else
    if v_nallocs > 0 then
      raise exception 'A direct payment does not pay bills.'
        using errcode = 'P0001', detail = 'direct_pays_no_bill';
    end if;
    if v_nlines = 0 then
      raise exception 'Add at least one line: what is this money paying for?'
        using errcode = 'P0001', detail = 'no_lines';
    end if;
  end if;

  -- Every ringgit paid says what it pays: the total IS lines + bills.
  if v_lines + v_allocs <> v_v.amount then
    raise exception 'This voucher is for RM %, but its lines and bills add up to RM %.',
      to_char(v_v.amount, 'FM999,999,999,990.00'),
      to_char(v_lines + v_allocs, 'FM999,999,999,990.00')
      using errcode = 'P0001', detail = 'total_not_equal';
  end if;

  -- The bills as they stand NOW: still confirmed, still this supplier's, and
  -- not over-paid by another voucher since this one was typed.
  select string_agg(coalesce(b.bill_no, b.supplier_invoice_no), ', ') into v_bad
    from public.payment_voucher_allocations a
    join public.supplier_bills b on b.id = a.bill_id
   where a.voucher_id = p_voucher_id
     and (b.status <> 'confirmed'
          or b.supplier_id is distinct from v_v.supplier_id
          or (select coalesce(sum(a2.amount_applied), 0)
                from public.payment_voucher_allocations a2
                join public.payment_vouchers v2 on v2.id = a2.voucher_id
               where a2.bill_id = a.bill_id
                 and v2.status <> 'cancelled') > b.total_amount);
  if v_bad is not null then
    raise exception 'These bills can no longer take this payment: %. Return the voucher to draft and correct it.', v_bad
      using errcode = 'P0001', detail = 'bill_cannot_take_payment';
  end if;
end;
$fn$;

-- PREPARE — finance. Checks everything, mints the number (once — a voucher
-- returned to draft keeps it), freezes the voucher. POSTS NOTHING.
-- Copied from 0464 §8 and rewritten for the new shape.
create or replace function public.payment_voucher_prepare(p_voucher_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := public.app_role()::text;
  v_v    public.payment_vouchers%rowtype;
  v_no   text;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'only finance prepares a payment voucher'
      using errcode = '42501', detail = 'not_finance';
  end if;

  select * into v_v from public.payment_vouchers where id = p_voucher_id for update;
  if not found then
    raise exception 'That payment voucher does not exist.'
      using errcode = 'P0002', detail = 'voucher_missing';
  end if;
  if v_v.status <> 'draft' then
    raise exception 'Only a draft payment voucher can be prepared.'
      using errcode = 'P0001', detail = 'voucher_not_draft';
  end if;

  perform public._payment_voucher_validate(p_voucher_id);

  -- Random, not sequential — purchasing MASTER §6.1 (as 0464).
  v_no := coalesce(v_v.voucher_no,
                   public.allocate_formal_document_code('PV', v_v.id::text, v_v.voucher_date));

  update public.payment_vouchers
     set voucher_no  = v_no,
         status      = 'prepared',
         prepared_at = now(),
         prepared_by = auth.uid(),
         checked_at  = null,
         checked_by  = null
   where id = p_voucher_id;

  perform public._ap_event('PAYMENT_VOUCHER', p_voucher_id, 'prepared', v_no);
  return v_no;
end;
$fn$;

-- CHECK — a second finance person (or the principal) reads it. Not the preparer.
create or replace function public.payment_voucher_check(p_voucher_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := public.app_role()::text;
  v_me   uuid := auth.uid();
  v_v    public.payment_vouchers%rowtype;
begin
  if v_me is null or v_role is null or v_role not in ('finance','principal') then
    raise exception 'only finance checks a payment voucher'
      using errcode = '42501', detail = 'not_finance';
  end if;

  select * into v_v from public.payment_vouchers where id = p_voucher_id for update;
  if not found then
    raise exception 'That payment voucher does not exist.'
      using errcode = 'P0002', detail = 'voucher_missing';
  end if;
  if v_v.status <> 'prepared' then
    raise exception 'Only a prepared payment voucher can be checked.'
      using errcode = 'P0001', detail = 'voucher_not_prepared';
  end if;
  if v_v.prepared_by = v_me then
    raise exception 'You prepared payment voucher %, so somebody else must check it. Two people look at every payment before it is approved.',
      v_v.voucher_no
      using errcode = 'P0001', detail = 'separation_of_duties';
  end if;

  perform public._payment_voucher_validate(p_voucher_id);

  update public.payment_vouchers
     set status     = 'checked',
         checked_at = now(),
         checked_by = v_me
   where id = p_voucher_id;

  perform public._ap_event('PAYMENT_VOUCHER', p_voucher_id, 'checked', null);
  return v_v.voucher_no;
end;
$fn$;

-- APPROVE — ruling M, the finance_approver duty. This is the act that moves
-- money, so it is the act that posts, dated the PAYMENT date.
-- Replaces 0464's payment_voucher_release; the separation-of-duties refusal is
-- copied from it word for word.
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

-- RETURN TO DRAFT — the checker or the approver sends it back with a reason.
-- The number stays; the prepare and check stamps are cleared, so the next
-- prepare and check are fresh.
create or replace function public.payment_voucher_reject(p_voucher_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := public.app_role()::text;
  v_me   uuid := auth.uid();
  v_v    public.payment_vouchers%rowtype;
begin
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Say what must change before it comes back.'
      using errcode = 'P0001', detail = 'reason_missing';
  end if;
  if v_me is null
     or not (coalesce(v_role in ('finance','principal'), false)
             or public.has_finance_approver(v_me)) then
    raise exception 'only finance returns a payment voucher'
      using errcode = '42501', detail = 'not_finance';
  end if;

  select * into v_v from public.payment_vouchers where id = p_voucher_id for update;
  if not found then
    raise exception 'That payment voucher does not exist.'
      using errcode = 'P0002', detail = 'voucher_missing';
  end if;
  if v_v.status not in ('prepared','checked') then
    raise exception 'Only a prepared or checked payment voucher can be returned to draft.'
      using errcode = 'P0001', detail = 'voucher_not_in_review';
  end if;

  update public.payment_vouchers
     set status        = 'draft',
         prepared_at   = null,
         prepared_by   = null,
         checked_at    = null,
         checked_by    = null,
         rejected_at   = now(),
         rejected_by   = v_me,
         reject_reason = btrim(p_reason)
   where id = p_voucher_id;

  perform public._ap_event('PAYMENT_VOUCHER', p_voucher_id, 'rejected', btrim(p_reason));
end;
$fn$;

-- CANCEL — copied from 0464 §8 and changed: 'released' is 'approved', and the
-- act is written to the history. An approved voucher is undone by gl_reverse,
-- whose contra keeps the ORIGINAL payment date.
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

-- A file on a bill or a voucher. The browser uploads to a path the Worker
-- signed with the user's own token; this records it, after checking the path
-- belongs to the document and the object is really there.
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
  else
    raise exception 'A file belongs to a bill or a payment voucher.'
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


-- ── 9 · what we owe, recomputed every time it is asked ───────────────────────
-- Copied from 0464 §9 and changed: "paid" means named by an APPROVED voucher
-- (0464's 'released' no longer exists), and three columns are ADDED AT THE END
-- so any reader of the 0464 columns keeps working. The return type changes, so
-- the function is dropped and re-created.
drop function if exists public.ap_outstanding(uuid);
create function public.ap_outstanding(p_supplier_id uuid default null)
returns table (
  supplier_id                uuid,
  supplier_name              text,
  bills_confirmed            integer,
  billed_total               numeric(12,2),
  allocated_total            numeric(12,2),
  paid_total                 numeric(12,2),
  balance_owing              numeric(12,2),
  uncommitted                numeric(12,2),
  oldest_confirmed_bill_date date,
  go_live_on                 date,
  supplier_kind              text,
  open_bills                 integer,
  oldest_unpaid_bill_date    date
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
  with bill_paid as (
    select sb.id as bill_id, sb.supplier_id as sid, sb.bill_date, sb.total_amount,
           coalesce((select sum(al.amount_applied)
                       from public.payment_voucher_allocations al
                       join public.payment_vouchers pv on pv.id = al.voucher_id
                      where al.bill_id = sb.id and pv.status = 'approved'), 0) as paid,
           coalesce((select sum(al.amount_applied)
                       from public.payment_voucher_allocations al
                       join public.payment_vouchers pv on pv.id = al.voucher_id
                      where al.bill_id = sb.id and pv.status <> 'cancelled'), 0) as allocated
      from public.supplier_bills sb
     where sb.status = 'confirmed'
  ), per_supplier as (
    select bp.sid,
           count(*) as cnt,
           sum(bp.total_amount) as billed,
           sum(bp.allocated) as allocated,
           sum(bp.paid) as paid,
           min(bp.bill_date) as oldest,
           count(*) filter (where bp.total_amount > bp.paid) as open_cnt,
           min(bp.bill_date) filter (where bp.total_amount > bp.paid) as oldest_open
      from bill_paid bp
     group by bp.sid
  )
  select s.id,
         s.name,
         coalesce(ps.cnt, 0)::integer,
         coalesce(ps.billed, 0)::numeric(12,2),
         coalesce(ps.allocated, 0)::numeric(12,2),
         coalesce(ps.paid, 0)::numeric(12,2),
         (coalesce(ps.billed, 0) - coalesce(ps.paid, 0))::numeric(12,2),
         (coalesce(ps.billed, 0) - coalesce(ps.allocated, 0))::numeric(12,2),
         ps.oldest,
         v_go_live,
         s.kind::text,
         coalesce(ps.open_cnt, 0)::integer,
         ps.oldest_open
    from public.suppliers s
    left join per_supplier ps on ps.sid = s.id
   where p_supplier_id is null or s.id = p_supplier_id
   order by s.name;
end;
$fn$;

comment on function public.ap_outstanding(uuid) is
  'A/P per supplier and other creditor, recomputed from documents. Returns EVERY supplier, zero included, so "not in the list" can never be read as "nothing owed". paid = on an APPROVED payment voucher (0477).';

drop function if exists public.ap_bill_outstanding(uuid);
create function public.ap_bill_outstanding(p_supplier_id uuid default null)
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
  go_live_on          date,
  ap_account_code     text,
  allocated_total     numeric(12,2),
  unallocated         numeric(12,2),
  supplier_kind       text
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
         v_go_live,
         b.ap_account_code,
         coalesce(a.total, 0)::numeric(12,2),
         (b.total_amount - coalesce(a.total, 0))::numeric(12,2),
         s.kind::text
    from public.supplier_bills b
    join public.suppliers s on s.id = b.supplier_id
    left join (
      select al.bill_id as bid, sum(al.amount_applied) as total
        from public.payment_voucher_allocations al
        join public.payment_vouchers pv on pv.id = al.voucher_id
       where pv.status = 'approved'
       group by al.bill_id
    ) p on p.bid = b.id
    left join (
      select al.bill_id as bid, sum(al.amount_applied) as total
        from public.payment_voucher_allocations al
        join public.payment_vouchers pv on pv.id = al.voucher_id
       where pv.status <> 'cancelled'
       group by al.bill_id
    ) a on a.bid = b.id
   where b.status = 'confirmed'
     and (p_supplier_id is null or b.supplier_id = p_supplier_id)
   order by b.bill_date, b.bill_no;
end;
$fn$;


-- ── 10 · readers for the Finance pages ───────────────────────────────────────
-- Every reader is gated by gl_may_read() (finance + principal) and is
-- security definer, so it can join the purchasing and user tables it names.

-- The accounts a form may offer, with what each may be used for.
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
         (not a.is_control and a.kind in ('EXPENSE','ASSET') and not public.ap_account_is_money(a.code)),
         (not a.is_control and a.kind in ('EXPENSE','ASSET','LIABILITY')),
         (a.kind = 'LIABILITY' and a.is_control and a.control_for = 'SUPPLIER'),
         public.ap_account_is_money(a.code)
    from public.gl_accounts a
   where a.is_active
     and not exists (select 1 from public.gl_accounts c where c.parent_code = a.code)
   order by a.code;
end;
$fn$;

-- The GRNs that still have goods to bill: finished, not consignment, and some
-- quantity not yet on a bill that is not cancelled.
create or replace function public.supplier_bill_grn_candidates(p_supplier_id uuid default null)
returns table (
  receipt_id            uuid,
  grn_no                text,
  po_id                 text,
  supplier_id           uuid,
  supplier_name         text,
  received_on           date,
  posted_at             timestamptz,
  open_lines            integer,
  open_qty              numeric(12,2),
  open_value_at_po_cost numeric(12,2)
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
  with rl as (
    select r.id as rid, (l ->> 'id') as pol_id,
           sum(coalesce(nullif(l ->> 'received_now', '')::numeric, 0)
             + coalesce(nullif(l ->> 'damaged_qty',  '')::numeric, 0)) as billable
      from public.warehouse_receipts r
      join public.purchase_orders po on po.id = r.po_id
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(r.lines) = 'array' then r.lines else '[]'::jsonb end) l
     where r.status = 'posted'
       and not coalesce((to_jsonb(po) ->> 'is_consignment')::boolean, false)
       and (p_supplier_id is null or po.supplier_id = p_supplier_id)
     group by r.id, l ->> 'id'
  ), billed as (
    select bl.warehouse_receipt_id as rid, bl.po_line_id::text as pol_id, sum(bl.qty) as qty
      from public.supplier_bill_lines bl
      join public.supplier_bills b on b.id = bl.bill_id
     where b.status <> 'cancelled' and bl.warehouse_receipt_id is not null
     group by bl.warehouse_receipt_id, bl.po_line_id
  ), open_lines as (
    select rl.rid, rl.pol_id, rl.billable - coalesce(bd.qty, 0) as open_qty
      from rl
      left join billed bd on bd.rid = rl.rid and bd.pol_id = rl.pol_id
     where rl.billable - coalesce(bd.qty, 0) > 0
  ), agg as (
    select ol.rid,
           count(*)::integer as n,
           sum(ol.open_qty)::numeric(12,2) as qty,
           sum(ol.open_qty * coalesce(pol.cost, 0))::numeric(12,2) as val
      from open_lines ol
      left join public.purchase_order_lines pol on pol.id::text = ol.pol_id
     group by ol.rid
  )
  select r.id, to_jsonb(r) ->> 'grn_no', r.po_id, po.supplier_id, s.name,
         r.goods_received_at, r.posted_at, agg.n, agg.qty, agg.val
    from agg
    join public.warehouse_receipts r on r.id = agg.rid
    join public.purchase_orders po on po.id = r.po_id
    join public.suppliers s on s.id = po.supplier_id
   order by r.goods_received_at desc, r.posted_at desc nulls last;
end;
$fn$;

-- One GRN's lines, ready to become bill lines: what arrived, what is already
-- billed, what is still open, and the PO's expected unit cost.
create or replace function public.supplier_bill_grn_lines(p_receipt_id uuid)
returns table (
  receipt_id           uuid,
  grn_no               text,
  po_id                text,
  supplier_id          uuid,
  supplier_name        text,
  po_line_id           uuid,
  sku                  text,
  received_qty         numeric(12,2),
  billed_qty           numeric(12,2),
  open_qty             numeric(12,2),
  po_unit_cost         numeric(12,2),
  commercial_treatment text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
#variable_conflict use_column
declare
  v_rcpt public.warehouse_receipts%rowtype;
  v_po   public.purchase_orders%rowtype;
begin
  if not public.gl_may_read() then
    raise exception 'accounts payable is internal'
      using errcode = '42501', detail = 'not_internal';
  end if;

  select * into v_rcpt from public.warehouse_receipts where id = p_receipt_id;
  if not found then
    raise exception 'That goods receipt does not exist.'
      using errcode = 'P0002', detail = 'grn_missing';
  end if;
  if v_rcpt.status <> 'posted' then
    raise exception 'That goods receipt is not finished yet, so it cannot be billed.'
      using errcode = 'P0001', detail = 'grn_not_posted';
  end if;
  select * into v_po from public.purchase_orders where id = v_rcpt.po_id;
  if coalesce((to_jsonb(v_po) ->> 'is_consignment')::boolean, false) then
    raise exception 'That is a consignment receipt. The goods still belong to the supplier, so there is nothing to bill.'
      using errcode = 'P0001', detail = 'grn_is_consignment';
  end if;

  return query
  select v_rcpt.id, to_jsonb(v_rcpt) ->> 'grn_no', v_rcpt.po_id, v_po.supplier_id, s.name,
         pol.id, pol.sku,
         x.billable::numeric(12,2),
         coalesce(bd.qty, 0)::numeric(12,2),
         (x.billable - coalesce(bd.qty, 0))::numeric(12,2),
         pol.cost::numeric(12,2),
         pol.commercial_treatment
    from (
      select (l ->> 'id') as pol_id,
             sum(coalesce(nullif(l ->> 'received_now', '')::numeric, 0)
               + coalesce(nullif(l ->> 'damaged_qty',  '')::numeric, 0)) as billable
        from jsonb_array_elements(
               case when jsonb_typeof(v_rcpt.lines) = 'array' then v_rcpt.lines else '[]'::jsonb end) l
       group by l ->> 'id'
    ) x
    join public.purchase_order_lines pol on pol.id::text = x.pol_id
    join public.suppliers s on s.id = v_po.supplier_id
    left join (
      select bl.po_line_id as plid, sum(bl.qty) as qty
        from public.supplier_bill_lines bl
        join public.supplier_bills b on b.id = bl.bill_id
       where bl.warehouse_receipt_id = p_receipt_id
         and b.status <> 'cancelled'
       group by bl.po_line_id
    ) bd on bd.plid = pol.id
   where x.billable > 0
   order by pol.sku;
end;
$fn$;

-- The Bills register.
create or replace function public.supplier_bill_register()
returns table (
  id                  uuid,
  bill_no             text,
  status              text,
  supplier_id         uuid,
  supplier_name       text,
  supplier_kind       text,
  supplier_invoice_no text,
  bill_date           date,
  due_date            date,
  po_id               text,
  grn_nos             text,
  ap_account_code     text,
  total_amount        numeric(12,2),
  paid_total          numeric(12,2),
  unpaid              numeric(12,2),
  price_flags         integer,
  file_count          integer,
  created_at          timestamptz
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
  select b.id, b.bill_no, b.status, b.supplier_id, s.name, s.kind::text,
         b.supplier_invoice_no, b.bill_date, b.due_date, b.po_id,
         g.grn_nos, b.ap_account_code, b.total_amount,
         coalesce(p.total, 0)::numeric(12,2),
         case when b.status = 'confirmed'
              then (b.total_amount - coalesce(p.total, 0))::numeric(12,2) end,
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
    left join (
      select al.bill_id as bid, sum(al.amount_applied) as total
        from public.payment_voucher_allocations al
        join public.payment_vouchers pv on pv.id = al.voucher_id
       where pv.status = 'approved'
       group by al.bill_id
    ) p on p.bid = b.id
    left join (
      select fl.document_id as did, count(*) as n
        from public.ap_document_files fl
       where fl.document_type = 'SUPPLIER_BILL'
       group by fl.document_id
    ) f on f.did = b.id
   order by b.created_at desc;
end;
$fn$;

-- One bill, whole: header, lines with the PO price beside the billed price,
-- the vouchers that pay it, its files, its history, and what the caller may do.
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

  select coalesce(sum(al.amount_applied) filter (where pv.status = 'approved'), 0),
         coalesce(sum(al.amount_applied) filter (where pv.status <> 'cancelled'), 0)
    into v_paid, v_allocated
    from public.payment_voucher_allocations al
    join public.payment_vouchers pv on pv.id = al.voucher_id
   where al.bill_id = p_bill_id;

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
    'payments', coalesce((
      select jsonb_agg(to_jsonb(z) order by z.voucher_date, z.voucher_no) from (
        select pv.id as voucher_id, pv.voucher_no, pv.status, pv.voucher_date, al.amount_applied
          from public.payment_voucher_allocations al
          join public.payment_vouchers pv on pv.id = al.voucher_id
         where al.bill_id = p_bill_id) z), '[]'::jsonb),
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
    'go_live_on', (select gc.go_live_on from public.gl_config gc where gc.id),
    'can', jsonb_build_object(
      'edit',    v_bill.status = 'draft' and v_finance,
      'confirm', v_bill.status = 'draft' and v_finance,
      'cancel',  case v_bill.status
                   when 'draft' then v_finance
                   when 'confirmed' then v_approver and v_allocated = 0
                   else false end,
      'add_file', v_bill.status <> 'cancelled' and v_finance)
  );
end;
$fn$;

-- The Payment Vouchers register.
create or replace function public.payment_voucher_register()
returns table (
  id                    uuid,
  voucher_no            text,
  status                text,
  purpose               text,
  supplier_id           uuid,
  supplier_name         text,
  payee_name            text,
  voucher_date          date,
  amount                numeric(12,2),
  pay_method            text,
  pay_reference         text,
  pay_from_account_code text,
  pay_from_name         text,
  bill_nos              text,
  line_count            integer,
  prepared_by_name      text,
  checked_by_name       text,
  approved_by_name      text,
  file_count            integer,
  created_at            timestamptz
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
         v.created_at
    from public.payment_vouchers v
    left join public.suppliers s  on s.id = v.supplier_id
    left join public.gl_accounts a on a.code = v.pay_from_account_code
    left join public.app_users pu on pu.id = v.prepared_by
    left join public.app_users cu on cu.id = v.checked_by
    left join public.app_users au on au.id = v.approved_by
   order by v.created_at desc;
end;
$fn$;

-- One voucher, whole — and, for the person asking, which of the five acts they
-- may do now, so the page never offers a button the database will refuse.
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

  return jsonb_build_object(
    'voucher', (
      select to_jsonb(x) from (
        select v.id, v.voucher_no, v.status, v.purpose, v.supplier_id,
               s.name as supplier_name, s.kind::text as supplier_kind, v.payee_name,
               v.voucher_date, v.amount, v.pay_method, v.pay_reference,
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
                    when 'approved' then v_approver
                    when 'cancelled' then false
                    else v_finance end,
      'add_file', v_v.status <> 'cancelled' and v_finance)
  );
end;
$fn$;


-- ── 11 · the legacy pay door is closed ───────────────────────────────────────
-- `finance_po_pay` wrote a payment and flipped purchase_orders.pay_status with
-- no ledger entry; `finance_po_schedule` promised a date for it. Both were
-- executable by anon and every signed-in user. The functions stay (history,
-- red line 6 spirit) but nobody outside the database may call them. The API
-- routes answer 410 and point at Payment Vouchers.
revoke all on function public.finance_po_pay(text, numeric, public.payment_method, text)
  from public, anon, authenticated;
revoke all on function public.finance_po_schedule(text, date)
  from public, anon, authenticated;


-- ── 12 · nobody writes these tables from outside ─────────────────────────────
alter table public.payment_voucher_lines enable row level security;
alter table public.ap_document_files     enable row level security;
alter table public.ap_document_events    enable row level security;

revoke all on public.payment_voucher_lines from anon, authenticated;
revoke all on public.ap_document_files     from anon, authenticated;
revoke all on public.ap_document_events    from anon, authenticated;

grant select on public.payment_voucher_lines to authenticated;
grant select on public.ap_document_files     to authenticated;
grant select on public.ap_document_events    to authenticated;

create policy payment_voucher_lines_read_internal
  on public.payment_voucher_lines for select using (public.gl_may_read());
create policy ap_document_files_read_internal
  on public.ap_document_files for select using (public.gl_may_read());
create policy ap_document_events_read_internal
  on public.ap_document_events for select using (public.gl_may_read());

-- Internal helpers and trigger functions: nobody calls them over the API.
revoke all on function public.ap_account_is_money(text)                   from public, anon, authenticated;
revoke all on function public._ap_require_account(text, text, text)       from public, anon, authenticated;
revoke all on function public._ap_event(text, uuid, text, text)           from public, anon, authenticated;
revoke all on function public.ap_grn_billable_qty(uuid, uuid)             from public, anon, authenticated;
revoke all on function public._payment_voucher_validate(uuid)             from public, anon, authenticated;
revoke all on function public.ap_append_only()                            from public, anon, authenticated;
revoke all on function public.supplier_bill_line_grn_ceiling()            from public, anon, authenticated;
revoke all on function public.supplier_bill_lines_frozen()                from public, anon, authenticated;
revoke all on function public.payment_voucher_lines_only_while_draft()    from public, anon, authenticated;
revoke all on function public.pv_allocation_only_while_draft()            from public, anon, authenticated;
revoke all on function public.pv_allocation_ceiling()                     from public, anon, authenticated;
revoke all on function public.payment_voucher_frozen()                    from public, anon, authenticated;
revoke all on function public.ap_refuse_before_go_live(date, text)        from public, anon;

-- The doors and readers: signed-in users only; each checks its caller itself.
revoke all on function public.supplier_other_creditor_create(text, text, text)                           from public, anon;
revoke all on function public.supplier_bill_save_draft(uuid, uuid, text, date, jsonb, date, text, text)   from public, anon;
revoke all on function public.supplier_bill_confirm(uuid)                                                 from public, anon;
revoke all on function public.supplier_bill_cancel(uuid, text)                                            from public, anon;
revoke all on function public.payment_voucher_save_draft(uuid, text, uuid, text, date, text, jsonb, jsonb, text, text, text) from public, anon;
revoke all on function public.payment_voucher_prepare(uuid)                                               from public, anon;
revoke all on function public.payment_voucher_check(uuid)                                                 from public, anon;
revoke all on function public.payment_voucher_approve(uuid)                                               from public, anon;
revoke all on function public.payment_voucher_reject(uuid, text)                                          from public, anon;
revoke all on function public.payment_voucher_cancel(uuid, text)                                          from public, anon;
revoke all on function public.ap_document_file_add(text, uuid, text, text, text, bigint)                  from public, anon;
revoke all on function public.ap_outstanding(uuid)                                                        from public, anon;
revoke all on function public.ap_bill_outstanding(uuid)                                                   from public, anon;
revoke all on function public.ap_account_choices()                                                        from public, anon;
revoke all on function public.supplier_bill_grn_candidates(uuid)                                          from public, anon;
revoke all on function public.supplier_bill_grn_lines(uuid)                                               from public, anon;
revoke all on function public.supplier_bill_register()                                                    from public, anon;
revoke all on function public.supplier_bill_document(uuid)                                                from public, anon;
revoke all on function public.payment_voucher_register()                                                  from public, anon;
revoke all on function public.payment_voucher_document(uuid)                                              from public, anon;

grant execute on function public.supplier_other_creditor_create(text, text, text)                           to authenticated;
grant execute on function public.supplier_bill_save_draft(uuid, uuid, text, date, jsonb, date, text, text)   to authenticated;
grant execute on function public.supplier_bill_confirm(uuid)                                                 to authenticated;
grant execute on function public.supplier_bill_cancel(uuid, text)                                            to authenticated;
grant execute on function public.payment_voucher_save_draft(uuid, text, uuid, text, date, text, jsonb, jsonb, text, text, text) to authenticated;
grant execute on function public.payment_voucher_prepare(uuid)                                               to authenticated;
grant execute on function public.payment_voucher_check(uuid)                                                 to authenticated;
grant execute on function public.payment_voucher_approve(uuid)                                               to authenticated;
grant execute on function public.payment_voucher_reject(uuid, text)                                          to authenticated;
grant execute on function public.payment_voucher_cancel(uuid, text)                                          to authenticated;
grant execute on function public.ap_document_file_add(text, uuid, text, text, text, bigint)                  to authenticated;
grant execute on function public.ap_outstanding(uuid)                                                        to authenticated;
grant execute on function public.ap_bill_outstanding(uuid)                                                   to authenticated;
grant execute on function public.ap_account_choices()                                                        to authenticated;
grant execute on function public.supplier_bill_grn_candidates(uuid)                                          to authenticated;
grant execute on function public.supplier_bill_grn_lines(uuid)                                               to authenticated;
grant execute on function public.supplier_bill_register()                                                    to authenticated;
grant execute on function public.supplier_bill_document(uuid)                                                to authenticated;
grant execute on function public.payment_voucher_register()                                                  to authenticated;
grant execute on function public.payment_voucher_document(uuid)                                              to authenticated;


-- ── 13 · what the words mean ─────────────────────────────────────────────────
comment on column public.supplier_bill_lines.warehouse_receipt_id is
  '0477: the GRN (warehouse_receipts, 0302/0426) this goods line was converted from. Paired with po_line_id. Billed qty per GRN line is capped at received + damaged (wrong items are not billable) across bills that are not cancelled.';
comment on column public.supplier_bill_lines.unit_price is
  '0477: the SUPPLIER''s unit price as billed. The PO''s expected cost (purchase_order_lines.cost) is shown beside it; a difference is a flag for finance, never a block.';
comment on column public.supplier_bills.po_receipt_id is
  '0464 link to the LEGACY po_receipts table, which the receiving engine no longer writes. Retired by 0477: no door writes it. The GRN link lives on each line (supplier_bill_lines.warehouse_receipt_id).';
comment on table public.payment_vouchers is
  'Money paid out. PV-YYYYMMDD-RRRR, minted at prepare. draft -> prepared -> checked -> approved (0477; Houzs shape), return-to-draft from prepared or checked. Pays supplier bills (allocations) and/or direct lines. Approve posts; the preparer may neither check nor approve.';
comment on column public.payment_vouchers.pay_from_account_code is
  '0477 (was bank_account_code): the money account the payment leaves — an active non-control ASSET leaf under 1100.';
comment on column public.payment_vouchers.ap_account_code is
  '0464 column, no longer read by 0477: each allocation debits its own bill''s AP account.';
comment on table public.payment_voucher_lines is
  '0477: direct lines of a payment voucher — an expense, an asset (loan out, fund transfer) or a non-control liability. Debited at approve.';
comment on table public.ap_document_files is
  '0477: files attached to a supplier bill or a payment voucher. Objects live in the private ap-documents bucket. Append-only.';
comment on table public.ap_document_events is
  '0477: the history of a supplier bill or payment voucher — who created, changed, confirmed, prepared, checked, approved, returned or cancelled it. Append-only.';


-- ── 14 · sanity ──────────────────────────────────────────────────────────────
do $sanity$
declare
  v_missing text;
  v_src     text;
  v_bill    uuid;
  v_sup     uuid;
  v_hit     boolean;
begin
  -- 1 · the chart
  if not exists (select 1 from public.gl_accounts
                  where code = '2120' and kind = 'LIABILITY' and parent_code = '2100'
                    and is_active and is_control and control_for = 'SUPPLIER') then
    raise exception '0477 sanity: 2120 Other payables is missing or has the wrong shape';
  end if;

  -- 2 · the kind
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                  where t.typname = 'supplier_kind' and e.enumlabel = 'other_creditor') then
    raise exception '0477 sanity: supplier_kind has no other_creditor';
  end if;

  -- 3 · every door and reader, by name AND argument types (types only)
  select string_agg(x.fn || '(' || x.args || ')', ', ') into v_missing
    from (values
      ('supplier_other_creditor_create', 'text, text, text'),
      ('supplier_bill_save_draft',       'uuid, uuid, text, date, jsonb, date, text, text'),
      ('supplier_bill_confirm',          'uuid'),
      ('supplier_bill_cancel',           'uuid, text'),
      ('payment_voucher_save_draft',     'uuid, text, uuid, text, date, text, jsonb, jsonb, text, text, text'),
      ('payment_voucher_prepare',        'uuid'),
      ('payment_voucher_check',          'uuid'),
      ('payment_voucher_approve',        'uuid'),
      ('payment_voucher_reject',         'uuid, text'),
      ('payment_voucher_cancel',         'uuid, text'),
      ('ap_document_file_add',           'text, uuid, text, text, text, bigint'),
      ('ap_outstanding',                 'uuid'),
      ('ap_bill_outstanding',            'uuid'),
      ('ap_account_choices',             ''),
      ('supplier_bill_grn_candidates',   'uuid'),
      ('supplier_bill_grn_lines',        'uuid'),
      ('supplier_bill_register',         ''),
      ('supplier_bill_document',         'uuid'),
      ('payment_voucher_register',       ''),
      ('payment_voucher_document',       'uuid'),
      ('ap_grn_billable_qty',            'uuid, uuid'),
      ('ap_account_is_money',            'text'),
      ('_ap_require_account',            'text, text, text'),
      ('_payment_voucher_validate',      'uuid')
    ) as x(fn, args)
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = x.fn
        and oidvectortypes(p.proargtypes) = x.args);
  if v_missing is not null then
    raise exception '0477 sanity: missing or mis-typed: %', v_missing;
  end if;

  -- 4 · the replaced doors are gone
  select string_agg(p.proname, ', ') into v_missing
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('supplier_bill_create','payment_voucher_create',
                       'payment_voucher_allocate','payment_voucher_release');
  if v_missing is not null then
    raise exception '0477 sanity: replaced doors still exist: %', v_missing;
  end if;

  -- 5 · markers in what changed
  select prosrc into v_src from pg_proc where proname = 'payment_voucher_approve';
  if v_src not like '%''PAYMENT_VOUCHER''%' or v_src not like '%has_finance_approver%'
     or v_src not like '%separation of duties%' or v_src not like '%party_type%' then
    raise exception '0477 sanity: payment_voucher_approve lost its posting or its duty rule';
  end if;
  select prosrc into v_src from pg_proc where proname = 'payment_voucher_check';
  if v_src not like '%separation_of_duties%' then
    raise exception '0477 sanity: payment_voucher_check lets the preparer check';
  end if;
  select prosrc into v_src from pg_proc where proname = 'supplier_bill_line_grn_ceiling';
  if v_src not like '%for update%' or v_src not like '%grn_over_billed%' then
    raise exception '0477 sanity: the GRN ceiling does not lock or does not refuse';
  end if;
  select prosrc into v_src from pg_proc where proname = 'ap_grn_billable_qty';
  if v_src not like '%received_now%' or v_src not like '%damaged_qty%' then
    raise exception '0477 sanity: the billable GRN quantity reads the wrong counts';
  end if;
  select prosrc into v_src from pg_proc where proname = 'supplier_bill_save_draft';
  if v_src not like '%''5100''%' or v_src not like '%other_creditor%' or v_src not like '%''2120''%' then
    raise exception '0477 sanity: supplier_bill_save_draft lost its defaults';
  end if;
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ap_outstanding';
  if v_src not like '%''approved''%' or v_src like '%''released''%' then
    raise exception '0477 sanity: ap_outstanding still reads the retired released status';
  end if;

  -- 6 · the legacy door is closed
  if has_function_privilege('authenticated', 'public.finance_po_pay(text, numeric, public.payment_method, text)', 'execute')
     or has_function_privilege('anon', 'public.finance_po_pay(text, numeric, public.payment_method, text)', 'execute')
     or has_function_privilege('authenticated', 'public.finance_po_schedule(text, date)', 'execute')
     or has_function_privilege('anon', 'public.finance_po_schedule(text, date)', 'execute') then
    raise exception '0477 sanity: the legacy supplier pay door is still open';
  end if;
  if has_function_privilege('anon', 'public.payment_voucher_approve(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._ap_require_account(text, text, text)', 'execute') then
    raise exception '0477 sanity: a voucher door or an internal helper is callable from outside';
  end if;

  -- 7 · the new tables are read-only from outside
  select string_agg(c.relname, ', ') into v_missing
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('payment_voucher_lines','ap_document_files','ap_document_events')
     and (not c.relrowsecurity
          or has_table_privilege('authenticated', c.oid, 'insert')
          or has_table_privilege('authenticated', c.oid, 'update')
          or has_table_privilege('authenticated', c.oid, 'delete')
          or not has_table_privilege('authenticated', c.oid, 'select'));
  if v_missing is not null then
    raise exception '0477 sanity: not locked down: %', v_missing;
  end if;

  -- 8 · the bucket is private
  if not exists (select 1 from storage.buckets where id = 'ap-documents' and public = false) then
    raise exception '0477 sanity: the ap-documents bucket is missing or public';
  end if;

  -- 9 · probe: a bill line's arithmetic and its GRN pairing are held by the
  --     table itself. Writes, then rolls back.
  begin
    insert into public.suppliers (name, slug, kind, cat_covered)
    values ('0477 sanity probe supplier', '0477-sanity-probe-' || md5(random()::text), 'own_logistics', '{}')
    returning id into v_sup;
    insert into public.supplier_bills (supplier_invoice_no, supplier_id, bill_date, ap_account_code)
    values ('0477-PROBE', v_sup, (select go_live_on from public.gl_config where id), '2110')
    returning id into v_bill;

    v_hit := false;
    begin
      insert into public.supplier_bill_lines (bill_id, line_no, account_code, description, qty, unit_price, amount)
      values (v_bill, 1, '5100', 'probe', 2, 5.00, 11.00);
    exception when check_violation then
      v_hit := true;
    end;
    if not v_hit then
      raise exception '0477 sanity: a bill line whose amount is not qty x price was accepted';
    end if;

    v_hit := false;
    begin
      insert into public.supplier_bill_lines (bill_id, line_no, account_code, description, qty, unit_price, amount, po_line_id)
      values (v_bill, 2, '5100', 'probe', 1, 5.00, 5.00, gen_random_uuid());
    exception when check_violation then
      v_hit := true;
    end;
    if not v_hit then
      raise exception '0477 sanity: a bill line naming a PO line without its GRN was accepted';
    end if;

    raise exception 'probe_rollback';
  exception when others then
    if sqlerrm <> 'probe_rollback' then
      raise;
    end if;
  end;
end;
$sanity$;
