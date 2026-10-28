-- ════════════════════════════════════════════════════════════════════════════
-- 0627 · A CREDIT NOTE LOWERS WHAT AN INVOICE ASKS, AND POSTS ITS OWN JOURNAL
--        (ported from Houzs credit-notes.ts / the CN leg: Dr income / Cr
--        receivables, party = the customer; YH 2026-10-28)
--
-- WHAT WAS MISSING
-- Finance could read the old Refunds & Credit Notes history, but nothing
-- could issue a credit note against a Sales Invoice, post its journal, or
-- take it off what the customer owes. docs/pdf/DOCUMENT-KIT.md lists the
-- Credit Note as approved, not built (Finance owns it).
--
-- WHAT THIS DOES
--  1. sales_credit_notes: one row per credit note, bound to ONE invoice.
--     The number comes from next_credit_note_no() (0065), the one CN series.
--  2. orders.credited: the sum of the order's ISSUED credit notes, kept by
--     the two functions below, exactly as orders.paid is kept by its
--     writers. orderMoney subtracts it (packages/shared/src/order-money.ts)
--     so a credit lowers "still needed" through the ONE outstanding
--     arithmetic. A credit is allocated at issue: it comes off its own
--     invoice's order and nothing is left over (Carres does not refund —
--     payment/MASTER.md §13 — so a credit never exceeds what is still owed).
--  3. issue_credit_note(): Finance / principal only. Posts through gl_post:
--       Dr the income accounts the invoice credited (in the proportion it
--          credited them)        — same accounts as the invoice, so no new
--                                  account choice is made here
--       Cr receivables (gl_ar_control_account), party = the invoice's customer
--     Sales Invoices only: a storage paper is owed under its own rule.
--     source_type CREDIT_NOTE, source_doc_no = the credit note number, so a
--     second post of the same number is idempotent (gl_post step 1).
--  4. void_credit_note(): reverses that entry through gl_reverse and gives the
--     credit back to orders.credited. The row stays, status 'voided'.
--  5. A guard: an invoice with an issued credit note cannot be voided until
--     the credit note is. (Voiding the invoice reverses its journal; the
--     credit note's debit would be left standing against nothing.)
--
-- NOT HERE (named, not forgotten)
--  * Refund payout posting — payment/MASTER.md §13, Q14 awaits Finance.
--  * Supplier credit notes and debit notes.
--  * A credit larger than the order still owes is refused, not carried.
--
-- RLS: read for the internal ledger readers (gl_may_read, 0462); no direct
-- insert/update/delete for authenticated — only the two functions write.
-- DR / CR: as above. Re-runnable: if not exists / create or replace.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · the register ─────────────────────────────────────────────────────────
create table if not exists public.sales_credit_notes (
  id              uuid primary key default gen_random_uuid(),
  credit_note_no  text not null unique,
  invoice_id      uuid not null references public.invoices(id),
  order_id        uuid not null references public.orders(id),
  amount          numeric(12,2) not null check (amount > 0),
  reason          text not null check (btrim(reason) <> ''),
  note_date       date not null,
  status          text not null default 'issued' check (status in ('issued','voided')),
  gl_entry_id     uuid references public.gl_entries(id),
  created_by      uuid,
  created_at      timestamptz not null default now(),
  voided_at       timestamptz,
  voided_by       uuid,
  void_reason     text,
  constraint sales_credit_notes_void_shape check (
    (status = 'issued' and voided_at is null) or (status = 'voided' and voided_at is not null)
  )
);
create index if not exists sales_credit_notes_invoice_idx on public.sales_credit_notes(invoice_id);
create index if not exists sales_credit_notes_order_idx   on public.sales_credit_notes(order_id);

alter table public.sales_credit_notes enable row level security;
revoke all on public.sales_credit_notes from anon, authenticated;
grant select on public.sales_credit_notes to authenticated;
drop policy if exists sales_credit_notes_read_internal on public.sales_credit_notes;
create policy sales_credit_notes_read_internal on public.sales_credit_notes
  for select using ((select public.gl_may_read()));

comment on table public.sales_credit_notes is
  '0627: a credit note against one Sales/Storage invoice. Written only by issue_credit_note / void_credit_note. Carres does not refund: a credit lowers what the order still owes and is never paid out.';

-- ── 2 · what has been credited on an order ───────────────────────────────────
alter table public.orders
  add column if not exists credited numeric(12,2) not null default 0 check (credited >= 0);
comment on column public.orders.credited is
  '0627: the sum of the order''s ISSUED credit notes. orderMoney subtracts it from what the order is worth. Written only by issue_credit_note / void_credit_note.';

-- ── 3 · issue ────────────────────────────────────────────────────────────────
create or replace function public.issue_credit_note(
  p_invoice_id uuid,
  p_amount     numeric,
  p_reason     text,
  p_note_date  date default null
) returns public.sales_credit_notes
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     app_role;
  v_inv      invoices;
  v_order    orders;
  v_amount   numeric(12,2);
  v_date     date;
  v_credited numeric(12,2);
  v_entry    gl_entries;
  v_total    numeric(12,2);
  v_left     numeric(12,2);
  v_share    numeric(12,2);
  v_cn_no    text;
  v_entry_id uuid;
  v_lines    jsonb := '[]'::jsonb;
  v_rec      record;
  v_n        int;
  v_i        int := 0;
  v_row      sales_credit_notes;
begin
  v_role := public.app_role();
  if v_role is null or v_role::text not in ('finance','principal') then
    raise exception 'Only Finance may issue a credit note.'
      using errcode = '42501', detail = 'credit_note_forbidden';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Type the reason for the credit note.'
      using errcode = '22023', detail = 'credit_note_reason_blank';
  end if;
  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount <= 0 then
    raise exception 'The credit note amount must be above RM 0.00.'
      using errcode = '22023', detail = 'credit_note_amount_not_positive';
  end if;

  select * into v_inv from invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found.' using errcode = 'P0002', detail = 'invoice_not_found';
  end if;
  if v_inv.status <> 'issued' or v_inv.voided_at is not null then
    raise exception 'Invoice % is not an issued invoice, so it cannot be credited.', v_inv.invoice_no
      using errcode = '22023', detail = 'credit_note_invoice_not_issued';
  end if;

  -- Storage papers are owed under their own rule (soRemaining); a credit on
  -- one would lower the wrong figure. Sales Invoices only.
  if v_inv.kind <> 'sales' then
    raise exception 'Invoice % is a storage invoice. Credit notes are issued on Sales Invoices only.', v_inv.invoice_no
      using errcode = '22023', detail = 'credit_note_not_sales_invoice';
  end if;

  select coalesce(sum(amount), 0) into v_credited
    from sales_credit_notes where invoice_id = v_inv.id and status = 'issued';
  if v_amount > round(v_inv.amount - v_credited, 2) then
    raise exception 'Invoice % is for RM %, and RM % is already credited. A credit note can be at most RM %.',
      v_inv.invoice_no, to_char(v_inv.amount, 'FM999,999,990.00'), to_char(v_credited, 'FM999,999,990.00'),
      to_char(round(v_inv.amount - v_credited, 2), 'FM999,999,990.00')
      using errcode = '22023', detail = 'credit_note_exceeds_invoice';
  end if;

  select * into v_order from orders where id = v_inv.order_id for update;

  v_date := coalesce(p_note_date, current_date);
  if v_date < v_inv.issued_at then
    raise exception 'A credit note cannot be dated before its invoice (%).', v_inv.issued_at
      using errcode = '22023', detail = 'credit_note_before_invoice';
  end if;

  -- The invoice's own entry names the income accounts and the customer.
  select * into v_entry from gl_entries
   where source_type = 'SALES_INVOICE' and source_doc_no = v_inv.invoice_no
     and posted and not reversed
   limit 1;
  if not found then
    raise exception 'Invoice % is not in the ledger (it was issued before the ledger started, or is not posted), so a credit note cannot be posted against it.', v_inv.invoice_no
      using errcode = '22023', detail = 'credit_note_invoice_not_in_ledger';
  end if;

  select coalesce(sum(credit), 0), count(*) into v_total, v_n
    from gl_entry_lines where entry_id = v_entry.id and credit > 0;
  if v_n = 0 or v_total <= 0 then
    raise exception 'Invoice % has no income line to credit back.', v_inv.invoice_no
      using errcode = '22023', detail = 'credit_note_no_income_line';
  end if;

  v_cn_no := public.next_credit_note_no();

  -- Dr each income account in the proportion the invoice credited it; the
  -- last line takes the rounding remainder so the debits equal the amount.
  v_left := v_amount;
  for v_rec in
    select account_code, sum(credit) as credit
      from gl_entry_lines where entry_id = v_entry.id and credit > 0
     group by account_code order by account_code
  loop
    v_i := v_i + 1;
    v_share := case when v_i = (select count(distinct account_code) from gl_entry_lines
                                 where entry_id = v_entry.id and credit > 0)
                    then v_left
                    else round(v_amount * v_rec.credit / v_total, 2) end;
    v_left := round(v_left - v_share, 2);
    if v_share > 0 then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'account_code', v_rec.account_code, 'debit', v_share, 'credit', 0,
        'memo', format('Credit note %s on invoice %s', v_cn_no, v_inv.invoice_no)));
    end if;
  end loop;

  v_lines := v_lines || jsonb_build_array(jsonb_build_object(
    'account_code', public.gl_ar_control_account(),
    'debit', 0, 'credit', v_amount,
    'party_type', 'CUSTOMER',
    'party_id', public.gl_customer_party_for_order(v_inv.order_id),
    'memo', format('Credit note %s · invoice %s · order #%s', v_cn_no, v_inv.invoice_no, v_order.so)));

  v_entry_id := public.gl_post(
    'CREDIT_NOTE', v_cn_no, v_date,
    format('Credit note %s on invoice %s · order #%s (%s)', v_cn_no, v_inv.invoice_no, v_order.so, btrim(p_reason)),
    v_lines);

  insert into sales_credit_notes
    (credit_note_no, invoice_id, order_id, amount, reason, note_date, gl_entry_id, created_by)
  values
    (v_cn_no, v_inv.id, v_inv.order_id, v_amount, btrim(p_reason), v_date, v_entry_id, auth.uid())
  returning * into v_row;

  update orders set credited = round(credited + v_amount, 2) where id = v_inv.order_id;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role::text, (select name from app_users where id = auth.uid()),
          format('Credit note issued · %s · %s · RM %s', v_cn_no, v_inv.invoice_no, v_amount),
          v_cn_no);

  return v_row;
end;
$fn$;

revoke all on function public.issue_credit_note(uuid, numeric, text, date) from public, anon;
grant execute on function public.issue_credit_note(uuid, numeric, text, date) to authenticated;

-- ── 4 · void ─────────────────────────────────────────────────────────────────
create or replace function public.void_credit_note(
  p_id     uuid,
  p_reason text
) returns public.sales_credit_notes
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role;
  v_row  sales_credit_notes;
begin
  v_role := public.app_role();
  if v_role is null or v_role::text not in ('finance','principal') then
    raise exception 'Only Finance may void a credit note.'
      using errcode = '42501', detail = 'credit_note_forbidden';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Type the reason for voiding the credit note.'
      using errcode = '22023', detail = 'credit_note_void_reason_blank';
  end if;

  select * into v_row from sales_credit_notes where id = p_id for update;
  if not found then
    raise exception 'Credit note not found.' using errcode = 'P0002', detail = 'credit_note_not_found';
  end if;
  if v_row.status = 'voided' then
    return v_row;                                 -- a second press changes nothing
  end if;

  perform public.gl_reverse(v_row.gl_entry_id, 'Credit note ' || v_row.credit_note_no || ' voided');

  update sales_credit_notes
     set status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
   where id = v_row.id returning * into v_row;

  update orders set credited = greatest(0, round(credited - v_row.amount, 2)) where id = v_row.order_id;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role::text, (select name from app_users where id = auth.uid()),
          format('Credit note voided · %s · RM %s', v_row.credit_note_no, v_row.amount),
          v_row.credit_note_no);

  return v_row;
end;
$fn$;

revoke all on function public.void_credit_note(uuid, text) from public, anon;
grant execute on function public.void_credit_note(uuid, text) to authenticated;

-- ── 5 · an invoice with a live credit note is not voided under it ────────────
create or replace function public.invoices_refuse_void_with_credit_note()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if exists (select 1 from sales_credit_notes where invoice_id = new.id and status = 'issued') then
    raise exception 'Invoice % has a credit note. Void the credit note first, then the invoice.', new.invoice_no
      using errcode = '22023', detail = 'invoice_has_credit_note';
  end if;
  return new;
end;
$fn$;

drop trigger if exists invoices_refuse_void_with_credit_note_trg on public.invoices;
create trigger invoices_refuse_void_with_credit_note_trg
  before update of voided_at, status on public.invoices
  for each row
  when (new.voided_at is not null and old.voided_at is null)
  execute function public.invoices_refuse_void_with_credit_note();

commit;
