-- =============================================================================
-- 0676_finance_follows_up_the_notes_suppliers_owe.sql
-- =============================================================================
-- THE RULING (Chew 2026-10-06, 2026-10-07 and 2026-10-09 「可以，开始做」;
--   docs/finance/MASTER.md §3.2 "Credit and debit notes to follow up"):
--   one list of the credit and debit notes suppliers still owe, so Finance can
--   follow each one up. A reminder only: it posts nothing.
--   - A confirmed bill's line whose price differs from its PO price is marked
--     by Finance as a credit or debit note owed, with an amount and a remark.
--     A draft bill's lines can still change, so a draft offers nothing.
--   - A purchase return on goods on a confirmed bill makes a credit note owed
--     by itself, worth the bill's price for the returned goods: the latest
--     confirmed bill line for that GRN and PO line, never more units than were
--     billed. A wrong item is never billed. Purchasing's return is read, never
--     changed.
--   - Each follow-up keeps its day, what the supplier said and the next day.
--   - A confirmed supplier credit note settles credit notes owed, in part or
--     in full; while it is cancelled, what it settled is owed again. A note
--     owed can also be closed with a reason.
--   - Reasons: Price differs from PO (PRICE) · Purchase return (RETURN) ·
--     Other (OTHER).
--
-- WHAT THIS ADDS
--   1. supplier_note_followups, _contacts and _settlements.
--   2. Doors (Finance and principal): supplier_note_followup_add,
--      _contact_add, _close, _settle, _settlement_take_off.
--   3. Reads: supplier_note_followups_read, supplier_note_followup_document,
--      supplier_note_followups_of_bill, supplier_note_followups_of_credit_note
--      and supplier_note_followups_owed. The list, the credit note's and the
--      voucher's reads first add the credit notes owed for purchase returns.
--
-- RLS: the three new tables read for Finance (gl_may_read); no write policy.
-- DATA: none. DR/CR: none.
-- =============================================================================

begin;

set local search_path = public, pg_temp;

-- ── 1 · the notes owed ───────────────────────────────────────────────────────
create table if not exists public.supplier_note_followups (
  id                 uuid primary key default gen_random_uuid(),
  supplier_id        uuid not null references public.suppliers(id),
  kind               text not null check (kind in ('CREDIT', 'DEBIT')),
  reason             text not null check (reason in ('PRICE', 'RETURN', 'OTHER')),
  bill_line_id       uuid references public.supplier_bill_lines(id),
  purchase_return_id uuid references public.purchase_returns(id),
  amount             numeric(12,2) not null check (amount > 0),
  remark             text check (remark is null or length(remark) <= 500),
  noted_on           date not null default (now() at time zone 'Asia/Kuala_Lumpur')::date,
  next_follow_up_on  date,
  closed_at          timestamptz,
  closed_by          uuid references public.app_users(id),
  close_reason       text,
  created_at         timestamptz not null default now(),
  created_by         uuid references public.app_users(id),
  constraint supplier_note_followups_price_names_its_line check ((reason = 'PRICE') = (bill_line_id is not null)),
  constraint supplier_note_followups_return_names_it check ((reason = 'RETURN') = (purchase_return_id is not null)),
  constraint supplier_note_followups_return_is_credit check (reason <> 'RETURN' or kind = 'CREDIT'),
  constraint supplier_note_followups_close_says_why check (
    (closed_at is null and close_reason is null) or (closed_at is not null and coalesce(close_reason, '') ~ '[^[:space:]]'))
);

-- One open note per bill line; one note per purchase return, ever (closing it
-- never brings it back).
create unique index if not exists supplier_note_followups_one_open_per_line
  on public.supplier_note_followups (bill_line_id) where bill_line_id is not null and closed_at is null;
create unique index if not exists supplier_note_followups_one_per_return
  on public.supplier_note_followups (purchase_return_id) where purchase_return_id is not null;
create index if not exists supplier_note_followups_supplier on public.supplier_note_followups (supplier_id);

create table if not exists public.supplier_note_followup_contacts (
  id            uuid primary key default gen_random_uuid(),
  followup_id   uuid not null references public.supplier_note_followups(id),
  contacted_on  date not null,
  said          text not null check (said ~ '[^[:space:]]' and length(said) <= 1000),
  created_at    timestamptz not null default now(),
  created_by    uuid references public.app_users(id)
);
create index if not exists supplier_note_followup_contacts_note on public.supplier_note_followup_contacts (followup_id);

create table if not exists public.supplier_note_followup_settlements (
  id               uuid primary key default gen_random_uuid(),
  followup_id      uuid not null references public.supplier_note_followups(id),
  credit_note_id   uuid not null references public.supplier_credit_notes(id),
  amount           numeric(12,2) not null check (amount > 0),
  created_at       timestamptz not null default now(),
  created_by       uuid references public.app_users(id),
  taken_off_at     timestamptz,
  taken_off_by     uuid references public.app_users(id),
  take_off_reason  text,
  constraint supplier_note_followup_settlements_take_off_says_why check (
    (taken_off_at is null and take_off_reason is null) or (taken_off_at is not null and coalesce(take_off_reason, '') ~ '[^[:space:]]'))
);
create index if not exists supplier_note_followup_settlements_note on public.supplier_note_followup_settlements (followup_id);
create index if not exists supplier_note_followup_settlements_credit_note on public.supplier_note_followup_settlements (credit_note_id);

comment on table public.supplier_note_followups is
  '0676: a credit or debit note a supplier still owes Carres, followed up by Finance. A reminder only: it posts nothing. Written only by its doors.';
comment on table public.supplier_note_followup_contacts is
  '0676: each time Finance followed up a note owed: the day and what the supplier said.';
comment on table public.supplier_note_followup_settlements is
  '0676: a confirmed supplier credit note settling a credit note owed, in part or in full. Taking it off keeps the row; a cancelled credit note settles nothing.';

alter table public.supplier_note_followups enable row level security;
alter table public.supplier_note_followup_contacts enable row level security;
alter table public.supplier_note_followup_settlements enable row level security;

drop policy if exists supplier_note_followups_finance_read on public.supplier_note_followups;
create policy supplier_note_followups_finance_read on public.supplier_note_followups
  for select using ((select public.gl_may_read()));
drop policy if exists supplier_note_followup_contacts_finance_read on public.supplier_note_followup_contacts;
create policy supplier_note_followup_contacts_finance_read on public.supplier_note_followup_contacts
  for select using ((select public.gl_may_read()));
drop policy if exists supplier_note_followup_settlements_finance_read on public.supplier_note_followup_settlements;
create policy supplier_note_followup_settlements_finance_read on public.supplier_note_followup_settlements
  for select using ((select public.gl_may_read()));

revoke all on public.supplier_note_followups, public.supplier_note_followup_contacts,
              public.supplier_note_followup_settlements from anon;
revoke insert, update, delete, truncate on public.supplier_note_followups, public.supplier_note_followup_contacts,
              public.supplier_note_followup_settlements from authenticated;

-- ── 2 · the one arithmetic ───────────────────────────────────────────────────
-- What each note owed (one, or every one when p_id is null) has settled, what
-- is left and where it stands. A settlement counts while it is on and its
-- credit note is confirmed.
create or replace function public._supplier_note_followup_figures(p_id uuid)
returns table (followup_id uuid, settled numeric, left_amount numeric, status text)
language sql
stable
set search_path = public, pg_temp
as $fn$
  select f.id,
         coalesce(s.settled, 0)::numeric(12,2),
         greatest(f.amount - coalesce(s.settled, 0), 0)::numeric(12,2),
         case when f.closed_at is not null then 'closed'
              when coalesce(s.settled, 0) >= f.amount then 'settled'
              when coalesce(s.settled, 0) > 0 then 'part'
              else 'waiting' end
    from public.supplier_note_followups f
    left join lateral (
      select sum(st.amount) as settled
        from public.supplier_note_followup_settlements st
        join public.supplier_credit_notes n on n.id = st.credit_note_id
       where st.followup_id = f.id and st.taken_off_at is null and n.status = 'confirmed') s on true
   where p_id is null or f.id = p_id;
$fn$;

-- What a credit note has settled so far.
create or replace function public._supplier_credit_note_settled(p_note_id uuid)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $fn$
  select coalesce(sum(st.amount), 0)::numeric(12,2)
    from public.supplier_note_followup_settlements st
   where st.credit_note_id = p_note_id and st.taken_off_at is null;
$fn$;

-- A purchase return on goods on a confirmed bill owes a credit note. Each
-- returned Unit is valued at the latest confirmed bill line for the GRN that
-- received it and its PO line; never more Units than that pair billed. A
-- Unit received as a wrong item was never billable.
create or replace function public._supplier_note_followups_from_returns()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_n integer;
begin
  insert into public.supplier_note_followups (supplier_id, kind, reason, purchase_return_id, amount, noted_on)
  select pr.supplier_id, 'CREDIT', 'RETURN', pr.id, v.amount, (pr.pr_doc_date at time zone 'Asia/Kuala_Lumpur')::date
    from public.purchase_returns pr
    cross join lateral (
      select round(sum(g.units * g.price), 2) as amount
        from (
          select least(count(*)::numeric, max(b.billed_qty)) as units, max(b.price) as price
            from public.purchase_return_units pru
            join public.ops_stock_items si on si.id = pru.stock_item_id
            join lateral (
              select r.receipt_id
                from public.receiving_unit_results r
               where r.stock_item_id = pru.stock_item_id
                 and r.issue_kind is distinct from 'wrong_item'
               order by r.created_at desc
               limit 1) rr on true
            join lateral (
              select sum(bl.qty) as billed_qty,
                     (select bl2.unit_price
                        from public.supplier_bill_lines bl2
                        join public.supplier_bills b2 on b2.id = bl2.bill_id
                       where b2.status = 'confirmed'
                         and bl2.warehouse_receipt_id = rr.receipt_id
                         and bl2.po_line_id = si.po_line_id
                       order by b2.confirmed_at desc, bl2.line_no desc
                       limit 1) as price
                from public.supplier_bill_lines bl
                join public.supplier_bills b on b.id = bl.bill_id
               where b.status = 'confirmed'
                 and bl.warehouse_receipt_id = rr.receipt_id
                 and bl.po_line_id = si.po_line_id) b on b.billed_qty > 0 and b.price is not null
           where pru.purchase_return_id = pr.id
           group by rr.receipt_id, si.po_line_id) g) v
   where v.amount > 0
     and not exists (select 1 from public.supplier_note_followups f where f.purchase_return_id = pr.id)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

revoke all on function public._supplier_note_followup_figures(uuid) from public, anon, authenticated;
revoke all on function public._supplier_credit_note_settled(uuid) from public, anon, authenticated;
revoke all on function public._supplier_note_followups_from_returns() from public, anon, authenticated;

-- One note owed as every read shows it.
create or replace function public._supplier_note_followup_json(p_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $fn$
  select jsonb_build_object(
           'id', f.id,
           'supplier_id', f.supplier_id,
           'supplier_name', s.name,
           'kind', f.kind,
           'reason', f.reason,
           'amount', f.amount,
           'settled', fg.settled,
           'left', fg.left_amount,
           'status', fg.status,
           'remark', f.remark,
           'noted_on', f.noted_on,
           'next_follow_up_on', f.next_follow_up_on,
           'last_contact', (select jsonb_build_object('contacted_on', c.contacted_on, 'said', c.said)
                              from public.supplier_note_followup_contacts c
                             where c.followup_id = f.id
                             order by c.contacted_on desc, c.created_at desc limit 1),
           'bill_id', b.id,
           'bill_no', b.bill_no,
           'supplier_invoice_no', b.supplier_invoice_no,
           'bill_status', b.status,
           'line_no', bl.line_no,
           'line_item', coalesce(bl.description, bl.sku),
           'line_qty', bl.qty,
           'line_unit_price', bl.unit_price,
           'po_unit_cost', pol.cost,
           'grn_no', coalesce(wr.grn_no, prw.grn_no),
           'po_id', coalesce(pol.po_id, (select min(pru.po_id) from public.purchase_return_units pru
                                          where pru.purchase_return_id = pr.id)),
           'purchase_return_id', pr.id,
           'pr_no', pr.pr_no,
           'closed_at', f.closed_at,
           'closed_by_name', cu.name,
           'close_reason', f.close_reason,
           'created_at', f.created_at,
           'created_by_name', au.name)
    from public.supplier_note_followups f
    join public.suppliers s on s.id = f.supplier_id
    join public._supplier_note_followup_figures(p_id) fg on fg.followup_id = f.id
    left join public.supplier_bill_lines bl on bl.id = f.bill_line_id
    left join public.supplier_bills b on b.id = bl.bill_id
    left join public.purchase_order_lines pol on pol.id = bl.po_line_id
    left join public.warehouse_receipts wr on wr.id = bl.warehouse_receipt_id
    left join public.purchase_returns pr on pr.id = f.purchase_return_id
    left join public.warehouse_receipts prw on prw.id = pr.warehouse_receipt_id
    left join public.app_users cu on cu.id = f.closed_by
    left join public.app_users au on au.id = f.created_by
   where f.id = p_id;
$fn$;

revoke all on function public._supplier_note_followup_json(uuid) from public, anon, authenticated;

-- ── 3 · the doors ────────────────────────────────────────────────────────────
-- A note owed, from a confirmed bill's line priced off its PO price (PRICE) or
-- by hand (OTHER). A purchase return adds its own.
create or replace function public.supplier_note_followup_add(
  p_reason      text,
  p_kind        text,
  p_supplier_id uuid,
  p_bill_id     uuid,
  p_line_no     integer,
  p_amount      numeric,
  p_remark      text,
  p_next_on     date
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     text := public.app_role()::text;
  v_me       uuid := (select u.id from public.app_users u where u.id = auth.uid());
  v_reason   text := upper(btrim(coalesce(p_reason, '')));
  v_kind     text := upper(btrim(coalesce(p_kind, '')));
  v_remark   text := nullif(btrim(coalesce(p_remark, '')), '');
  v_supplier uuid := p_supplier_id;
  v_bill     public.supplier_bills%rowtype;
  v_line     public.supplier_bill_lines%rowtype;
  v_po_cost  numeric;
  v_id       uuid;
begin
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'Only Finance follows up the notes suppliers owe.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  if v_kind not in ('CREDIT', 'DEBIT') then
    raise exception 'Choose a credit note or a debit note.'
      using errcode = 'P0001', detail = 'kind_invalid';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'The amount must be more than RM 0.00.'
      using errcode = 'P0001', detail = 'amount_invalid';
  end if;
  if round(p_amount, 2) <> p_amount then
    raise exception 'Type the amount in ringgit and sen, like 1250.00.'
      using errcode = 'P0001', detail = 'amount_invalid';
  end if;
  if v_remark is not null and length(v_remark) > 500 then
    raise exception 'Keep the remark to 500 characters.'
      using errcode = 'P0001', detail = 'remark_too_long';
  end if;
  if p_next_on is not null and p_next_on < (now() at time zone 'Asia/Kuala_Lumpur')::date then
    raise exception 'The next follow-up cannot be before today.'
      using errcode = 'P0001', detail = 'next_in_past';
  end if;

  if v_reason = 'PRICE' then
    select * into v_bill from public.supplier_bills where id = p_bill_id;
    if not found then
      raise exception 'That bill does not exist.' using errcode = 'P0002', detail = 'bill_missing';
    end if;
    if v_bill.status <> 'confirmed' then
      raise exception 'Bill % is not confirmed. Follow up a line of a confirmed bill.',
        coalesce(v_bill.bill_no, 'for invoice ' || v_bill.supplier_invoice_no)
        using errcode = 'P0001', detail = 'bill_not_confirmed';
    end if;
    select * into v_line from public.supplier_bill_lines l where l.bill_id = p_bill_id and l.line_no = p_line_no;
    if not found then
      raise exception 'That line is not on bill %.', v_bill.bill_no using errcode = 'P0002', detail = 'line_missing';
    end if;
    select pol.cost into v_po_cost from public.purchase_order_lines pol where pol.id = v_line.po_line_id;
    if v_line.po_line_id is null or v_po_cost is null or v_line.unit_price is null then
      raise exception 'Line % of bill % has no PO price to compare.', v_line.line_no, v_bill.bill_no
        using errcode = 'P0001', detail = 'no_po_price';
    end if;
    if round(v_line.unit_price - v_po_cost, 2) = 0 then
      raise exception 'Line % of bill % is at its PO price.', v_line.line_no, v_bill.bill_no
        using errcode = 'P0001', detail = 'same_as_po_price';
    end if;
    if exists (select 1 from public.supplier_note_followups f
                where f.bill_line_id = v_line.id and f.closed_at is null) then
      raise exception 'Line % of bill % already has a note to follow up.', v_line.line_no, v_bill.bill_no
        using errcode = 'P0001', detail = 'already_followed_up';
    end if;
    v_supplier := v_bill.supplier_id;
  elsif v_reason = 'OTHER' then
    if v_supplier is null or not exists (select 1 from public.suppliers s where s.id = v_supplier) then
      raise exception 'Choose the supplier.' using errcode = 'P0001', detail = 'supplier_required';
    end if;
    if v_remark is null then
      raise exception 'Say what the note is for.' using errcode = 'P0001', detail = 'remark_required';
    end if;
  elsif v_reason = 'RETURN' then
    raise exception 'A purchase return adds its own note to follow up.'
      using errcode = 'P0001', detail = 'return_adds_itself';
  else
    raise exception 'Choose why the supplier owes a note.' using errcode = 'P0001', detail = 'reason_invalid';
  end if;

  insert into public.supplier_note_followups
    (supplier_id, kind, reason, bill_line_id, amount, remark, next_follow_up_on, created_by)
  values
    (v_supplier, v_kind, v_reason, case when v_reason = 'PRICE' then v_line.id end, p_amount, v_remark, p_next_on, v_me)
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end;
$fn$;

-- A follow-up: the day, what the supplier said, and the next day (none ends
-- the reminders).
create or replace function public.supplier_note_followup_contact_add(
  p_id           uuid,
  p_contacted_on date,
  p_said         text,
  p_next_on      date
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role  text := public.app_role()::text;
  v_me    uuid := (select u.id from public.app_users u where u.id = auth.uid());
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_f     public.supplier_note_followups%rowtype;
  v_id    uuid;
begin
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'Only Finance follows up the notes suppliers owe.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  if p_contacted_on is null then
    raise exception 'Choose the day you followed up.' using errcode = 'P0001', detail = 'date_required';
  end if;
  if p_contacted_on > v_today then
    raise exception 'The follow-up day cannot be after today.' using errcode = 'P0001', detail = 'date_in_future';
  end if;
  if coalesce(p_said, '') !~ '[^[:space:]]' then
    raise exception 'Say what the supplier said.' using errcode = 'P0001', detail = 'said_required';
  end if;
  if length(btrim(p_said)) > 1000 then
    raise exception 'Keep what the supplier said to 1000 characters.' using errcode = 'P0001', detail = 'said_too_long';
  end if;
  if p_next_on is not null and p_next_on < p_contacted_on then
    raise exception 'The next follow-up cannot be before this one.' using errcode = 'P0001', detail = 'next_before_this';
  end if;

  select * into v_f from public.supplier_note_followups where id = p_id for update;
  if not found then
    raise exception 'That note to follow up does not exist.' using errcode = 'P0002', detail = 'followup_missing';
  end if;
  if v_f.closed_at is not null then
    raise exception 'This note is closed.' using errcode = 'P0001', detail = 'followup_closed';
  end if;

  insert into public.supplier_note_followup_contacts (followup_id, contacted_on, said, created_by)
  values (p_id, p_contacted_on, btrim(p_said), v_me)
  returning id into v_id;
  update public.supplier_note_followups set next_follow_up_on = p_next_on where id = p_id;
  return v_id;
end;
$fn$;

-- Closing a note the supplier will not send, with the reason.
create or replace function public.supplier_note_followup_close(p_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role   text := public.app_role()::text;
  v_me     uuid := (select u.id from public.app_users u where u.id = auth.uid());
  v_f      public.supplier_note_followups%rowtype;
  v_status text;
begin
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'Only Finance follows up the notes suppliers owe.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  if coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'Say why this note is closed.' using errcode = 'P0001', detail = 'reason_missing';
  end if;
  if length(btrim(p_reason)) > 500 then
    raise exception 'Keep the reason to 500 characters.' using errcode = 'P0001', detail = 'reason_too_long';
  end if;

  select * into v_f from public.supplier_note_followups where id = p_id for update;
  if not found then
    raise exception 'That note to follow up does not exist.' using errcode = 'P0002', detail = 'followup_missing';
  end if;
  if v_f.closed_at is not null then
    raise exception 'This note is already closed.' using errcode = 'P0001', detail = 'already_closed';
  end if;
  select fg.status into v_status from public._supplier_note_followup_figures(p_id) fg;
  if v_status = 'settled' then
    raise exception 'This note is already settled.' using errcode = 'P0001', detail = 'already_settled';
  end if;

  update public.supplier_note_followups
     set closed_at = now(), closed_by = v_me, close_reason = btrim(p_reason), next_follow_up_on = null
   where id = p_id;
  return p_id;
end;
$fn$;

-- A confirmed credit note settling a credit note owed by its supplier.
create or replace function public.supplier_note_followup_settle(p_id uuid, p_credit_note_id uuid, p_amount numeric)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role      text := public.app_role()::text;
  v_me        uuid := (select u.id from public.app_users u where u.id = auth.uid());
  v_note      public.supplier_credit_notes%rowtype;
  v_f         public.supplier_note_followups%rowtype;
  v_left      numeric(12,2);
  v_note_left numeric(12,2);
  v_id        uuid;
begin
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'Only Finance follows up the notes suppliers owe.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'The amount must be more than RM 0.00.' using errcode = 'P0001', detail = 'amount_invalid';
  end if;
  if round(p_amount, 2) <> p_amount then
    raise exception 'Type the amount in ringgit and sen, like 1250.00.' using errcode = 'P0001', detail = 'amount_invalid';
  end if;

  -- The credit note first, then the note owed.
  select * into v_note from public.supplier_credit_notes where id = p_credit_note_id for update;
  if not found then
    raise exception 'That credit note does not exist.' using errcode = 'P0002', detail = 'note_missing';
  end if;
  if v_note.status <> 'confirmed' then
    raise exception 'Credit note % is not confirmed. Only a confirmed credit note settles a note owed.',
      coalesce(v_note.note_no, 'for ' || v_note.supplier_note_no)
      using errcode = 'P0001', detail = 'note_not_confirmed';
  end if;
  select * into v_f from public.supplier_note_followups where id = p_id for update;
  if not found then
    raise exception 'That note to follow up does not exist.' using errcode = 'P0002', detail = 'followup_missing';
  end if;
  if v_f.closed_at is not null then
    raise exception 'This note is closed.' using errcode = 'P0001', detail = 'followup_closed';
  end if;
  if v_f.kind <> 'CREDIT' then
    raise exception 'A credit note settles only a credit note owed.' using errcode = 'P0001', detail = 'kind_mismatch';
  end if;
  if v_f.supplier_id <> v_note.supplier_id then
    raise exception 'This note is owed by another supplier.' using errcode = 'P0001', detail = 'supplier_mismatch';
  end if;
  if exists (select 1 from public.supplier_note_followup_settlements st
              where st.followup_id = p_id and st.credit_note_id = p_credit_note_id and st.taken_off_at is null) then
    raise exception 'Credit note % already settles this note. Take it off first to change the amount.', v_note.note_no
      using errcode = 'P0001', detail = 'already_settles';
  end if;

  select fg.left_amount into v_left from public._supplier_note_followup_figures(p_id) fg;
  if p_amount > v_left then
    raise exception 'Only RM % is left on this note. RM % is more than that.',
      to_char(v_left, 'FM999,999,999,990.00'), to_char(p_amount, 'FM999,999,999,990.00')
      using errcode = 'P0001', detail = 'over_settled';
  end if;
  v_note_left := v_note.total_amount - public._supplier_credit_note_settled(p_credit_note_id);
  if p_amount > v_note_left then
    raise exception 'Only RM % of credit note % is left to settle notes owed. RM % is more than that.',
      to_char(v_note_left, 'FM999,999,999,990.00'), v_note.note_no, to_char(p_amount, 'FM999,999,999,990.00')
      using errcode = 'P0001', detail = 'note_over_settled';
  end if;

  insert into public.supplier_note_followup_settlements (followup_id, credit_note_id, amount, created_by)
  values (p_id, p_credit_note_id, p_amount, v_me)
  returning id into v_id;
  return v_id;
end;
$fn$;

-- Taking a settlement off, with the reason; the row stays.
create or replace function public.supplier_note_followup_settlement_take_off(p_settlement_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := public.app_role()::text;
  v_me   uuid := (select u.id from public.app_users u where u.id = auth.uid());
  v_st   public.supplier_note_followup_settlements%rowtype;
begin
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'Only Finance follows up the notes suppliers owe.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  if coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'Say why it is taken off.' using errcode = 'P0001', detail = 'reason_missing';
  end if;
  if length(btrim(p_reason)) > 500 then
    raise exception 'Keep the reason to 500 characters.' using errcode = 'P0001', detail = 'reason_too_long';
  end if;
  select * into v_st from public.supplier_note_followup_settlements where id = p_settlement_id for update;
  if not found then
    raise exception 'That settlement does not exist.' using errcode = 'P0002', detail = 'settlement_missing';
  end if;
  if v_st.taken_off_at is not null then
    raise exception 'It is already taken off.' using errcode = 'P0001', detail = 'already_taken_off';
  end if;
  update public.supplier_note_followup_settlements
     set taken_off_at = now(), taken_off_by = v_me, take_off_reason = btrim(p_reason)
   where id = p_settlement_id;
  return p_settlement_id;
end;
$fn$;

-- ── 4 · the reads ────────────────────────────────────────────────────────────
-- The list: every note owed, after adding the purchase returns' own.
create or replace function public.supplier_note_followups_read()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not coalesce(public.gl_may_read(), false) then
    raise exception 'accounts payable is internal' using errcode = '42501', detail = 'not_internal';
  end if;
  perform public._supplier_note_followups_from_returns();
  return jsonb_build_object(
    'today', (now() at time zone 'Asia/Kuala_Lumpur')::date,
    'rows', coalesce((
      select jsonb_agg(public._supplier_note_followup_json(f.id)
                       order by f.next_follow_up_on nulls last, f.noted_on, f.created_at)
        from public.supplier_note_followups f), '[]'::jsonb));
end;
$fn$;

-- One note owed: its follow-ups and what settled it.
create or replace function public.supplier_note_followup_document(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not coalesce(public.gl_may_read(), false) then
    raise exception 'accounts payable is internal' using errcode = '42501', detail = 'not_internal';
  end if;
  if not exists (select 1 from public.supplier_note_followups f where f.id = p_id) then
    return null;
  end if;
  return jsonb_build_object(
    'today', (now() at time zone 'Asia/Kuala_Lumpur')::date,
    'followup', public._supplier_note_followup_json(p_id),
    'contacts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'contacted_on', c.contacted_on, 'said', c.said,
               'created_at', c.created_at, 'created_by_name', u.name)
             order by c.contacted_on desc, c.created_at desc)
        from public.supplier_note_followup_contacts c
        left join public.app_users u on u.id = c.created_by
       where c.followup_id = p_id), '[]'::jsonb),
    'settlements', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', st.id, 'credit_note_id', n.id, 'note_no', n.note_no,
               'supplier_note_no', n.supplier_note_no, 'note_date', n.note_date, 'note_status', n.status,
               'amount', st.amount, 'counts', st.taken_off_at is null and n.status = 'confirmed',
               'created_at', st.created_at, 'created_by_name', cu.name,
               'taken_off_at', st.taken_off_at, 'taken_off_by_name', tu.name, 'take_off_reason', st.take_off_reason)
             order by st.created_at)
        from public.supplier_note_followup_settlements st
        join public.supplier_credit_notes n on n.id = st.credit_note_id
        left join public.app_users cu on cu.id = st.created_by
        left join public.app_users tu on tu.id = st.taken_off_by
       where st.followup_id = p_id), '[]'::jsonb));
end;
$fn$;

-- A bill's lines and their notes owed (the bill page).
create or replace function public.supplier_note_followups_of_bill(p_bill_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not coalesce(public.gl_may_read(), false) then
    raise exception 'accounts payable is internal' using errcode = '42501', detail = 'not_internal';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'line_no', bl.line_no, 'id', f.id, 'kind', f.kind, 'status', fg.status,
             'amount', f.amount, 'left', fg.left_amount)
           order by bl.line_no, f.created_at)
      from public.supplier_note_followups f
      join public.supplier_bill_lines bl on bl.id = f.bill_line_id
      join public._supplier_note_followup_figures(null) fg on fg.followup_id = f.id
     where bl.bill_id = p_bill_id), '[]'::jsonb);
end;
$fn$;

-- A credit note's settlements, and its supplier's credit notes still owed
-- (the credit note page).
create or replace function public.supplier_note_followups_of_credit_note(p_note_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_note public.supplier_credit_notes%rowtype;
begin
  if not coalesce(public.gl_may_read(), false) then
    raise exception 'accounts payable is internal' using errcode = '42501', detail = 'not_internal';
  end if;
  select * into v_note from public.supplier_credit_notes where id = p_note_id;
  if not found then
    return null;
  end if;
  perform public._supplier_note_followups_from_returns();
  return jsonb_build_object(
    'settled', public._supplier_credit_note_settled(p_note_id),
    'left_to_settle', greatest(v_note.total_amount - public._supplier_credit_note_settled(p_note_id), 0),
    'settlements', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', st.id, 'followup_id', st.followup_id, 'amount', st.amount,
               'reason', f.reason, 'remark', f.remark, 'bill_no', b.bill_no, 'pr_no', pr.pr_no,
               'created_at', st.created_at, 'created_by_name', cu.name,
               'taken_off_at', st.taken_off_at, 'taken_off_by_name', tu.name, 'take_off_reason', st.take_off_reason)
             order by st.created_at)
        from public.supplier_note_followup_settlements st
        join public.supplier_note_followups f on f.id = st.followup_id
        left join public.supplier_bill_lines bl on bl.id = f.bill_line_id
        left join public.supplier_bills b on b.id = bl.bill_id
        left join public.purchase_returns pr on pr.id = f.purchase_return_id
        left join public.app_users cu on cu.id = st.created_by
        left join public.app_users tu on tu.id = st.taken_off_by
       where st.credit_note_id = p_note_id), '[]'::jsonb),
    'owed', coalesce((
      select jsonb_agg(public._supplier_note_followup_json(f.id) order by f.noted_on, f.created_at)
        from public.supplier_note_followups f
        join public._supplier_note_followup_figures(null) fg on fg.followup_id = f.id
       where f.supplier_id = v_note.supplier_id and f.kind = 'CREDIT' and fg.status in ('waiting', 'part')), '[]'::jsonb));
end;
$fn$;

-- What a supplier still owes, for the voucher's reminder.
create or replace function public.supplier_note_followups_owed(p_supplier_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not coalesce(public.gl_may_read(), false) then
    raise exception 'accounts payable is internal' using errcode = '42501', detail = 'not_internal';
  end if;
  perform public._supplier_note_followups_from_returns();
  return (
    select jsonb_build_object(
             'credit_count', count(*) filter (where f.kind = 'CREDIT'),
             'credit_left', coalesce(sum(fg.left_amount) filter (where f.kind = 'CREDIT'), 0),
             'debit_count', count(*) filter (where f.kind = 'DEBIT'),
             'debit_left', coalesce(sum(fg.left_amount) filter (where f.kind = 'DEBIT'), 0))
      from public.supplier_note_followups f
      join public._supplier_note_followup_figures(null) fg on fg.followup_id = f.id
     where f.supplier_id = p_supplier_id and fg.status in ('waiting', 'part'));
end;
$fn$;

revoke all on function public.supplier_note_followup_add(text, text, uuid, uuid, integer, numeric, text, date) from public, anon;
revoke all on function public.supplier_note_followup_contact_add(uuid, date, text, date) from public, anon;
revoke all on function public.supplier_note_followup_close(uuid, text) from public, anon;
revoke all on function public.supplier_note_followup_settle(uuid, uuid, numeric) from public, anon;
revoke all on function public.supplier_note_followup_settlement_take_off(uuid, text) from public, anon;
revoke all on function public.supplier_note_followups_read() from public, anon;
revoke all on function public.supplier_note_followup_document(uuid) from public, anon;
revoke all on function public.supplier_note_followups_of_bill(uuid) from public, anon;
revoke all on function public.supplier_note_followups_of_credit_note(uuid) from public, anon;
revoke all on function public.supplier_note_followups_owed(uuid) from public, anon;
grant execute on function public.supplier_note_followup_add(text, text, uuid, uuid, integer, numeric, text, date) to authenticated;
grant execute on function public.supplier_note_followup_contact_add(uuid, date, text, date) to authenticated;
grant execute on function public.supplier_note_followup_close(uuid, text) to authenticated;
grant execute on function public.supplier_note_followup_settle(uuid, uuid, numeric) to authenticated;
grant execute on function public.supplier_note_followup_settlement_take_off(uuid, text) to authenticated;
grant execute on function public.supplier_note_followups_read() to authenticated;
grant execute on function public.supplier_note_followup_document(uuid) to authenticated;
grant execute on function public.supplier_note_followups_of_bill(uuid) to authenticated;
grant execute on function public.supplier_note_followups_of_credit_note(uuid) to authenticated;
grant execute on function public.supplier_note_followups_owed(uuid) to authenticated;

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('supplier_note_followup_add', 'supplier_note_followup_contact_add',
                                  'supplier_note_followup_close', 'supplier_note_followup_settle',
                                  'supplier_note_followup_settlement_take_off', 'supplier_note_followups_read',
                                  'supplier_note_followup_document', 'supplier_note_followups_of_bill',
                                  'supplier_note_followups_of_credit_note', 'supplier_note_followups_owed',
                                  '_supplier_note_followups_from_returns')
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0676: a door or read lacks security definer or its search_path';
  end if;
  if has_function_privilege('authenticated', 'public._supplier_note_followups_from_returns()', 'execute')
     or has_function_privilege('authenticated', 'public._supplier_note_followup_figures(uuid)', 'execute')
     or has_function_privilege('anon', 'public.supplier_note_followups_read()', 'execute')
     or not has_function_privilege('authenticated', 'public.supplier_note_followup_add(text, text, uuid, uuid, integer, numeric, text, date)', 'execute') then
    raise exception '0676: a door or helper has the wrong callers';
  end if;
  if has_table_privilege('authenticated', 'public.supplier_note_followups', 'insert')
     or has_table_privilege('authenticated', 'public.supplier_note_followup_contacts', 'update')
     or has_table_privilege('authenticated', 'public.supplier_note_followup_settlements', 'delete') then
    raise exception '0676: a note owed can be written around its doors';
  end if;
end $sanity$;

commit;
