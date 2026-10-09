-- =============================================================================
-- 0681_finance_records_the_debit_notes_suppliers_send.sql
-- =============================================================================
-- THE RULING (Chew 2026-10-03, docs/finance/MASTER.md §3.2 "Supplier credit
--   and debit notes"): a supplier debit note, the supplier charging more, is
--   its own document, with its own number and list, never mixed with bills;
--   it is paid by a payment voucher and counts in AP and AP Aging. And (Chew
--   2026-10-07, 「可以」): a supplier credit note takes the prefix PCN, so
--   subscription credit notes keep SCN; a supplier debit note takes PDN.
--   Built on Chew's word 2026-10-10 (「做」).
--
-- WHAT THIS ADDS
--   1. supplier_debit_notes and _lines: draft → confirmed (posts) → cancelled
--      (a confirmed one is reversed). Confirming posts, dated the note's date:
--        Dr each line's account, with its department   (the cost)
--        Cr the payables account, party = the supplier   (Carres owes more)
--      Its number is drawn like a credit note's: PDN-….
--   2. A voucher that pays supplier bills pays a debit note the same way:
--      payment_voucher_debit_note_allocations, held to the note's total by its
--      own ceiling trigger. The voucher's checks, its posting (Dr the note's
--      payables account, party = the supplier), its page and its list read them.
--   3. What a debit note still needs paying has ONE arithmetic (law D):
--      ap_debit_note_settled · ap_debit_note_paid · supplier_debit_open.
--      AP · Payables (ap_outstanding) gains debit_open, and net_owing adds it,
--      so it still equals the supplier's payables account in the ledger (the
--      Self-check reads net_owing). AP Aging ages a debit note by its dates.
--   4. A confirmed debit note settles debit notes owed on Notes to follow up
--      (0676), as a confirmed credit note settles credit notes owed; while it
--      is cancelled, what it settled is owed again.
--   5. A supplier credit note confirmed from now on is numbered PCN-…; those
--      already numbered keep their numbers.
--
-- NOT IN THIS FILE: knocking a credit note or an advance off a debit note (a
-- voucher pays it), and a debit note's PDF.
--
-- Every existing function changed here is rewritten from its LIVE body by an
-- exact, single text replacement (0675's helper), so the rules later files put
-- in them stay; ap_outstanding changes its return type, so it is recreated,
-- after checking its live body is the one 0642 left. The sanity block checks
-- the new text is in each and that 0554, 0560 and 0580 survived.
--
-- RLS: the three new tables read for Finance (gl_may_read); nobody writes them
-- except through the functions here. Every key onto gl_accounts(code) follows a
-- renumbered account (0570, 0647).
-- DATA: none. DR/CR: on a debit note's confirm and cancel, and on approving a
-- voucher that pays one (above).
-- =============================================================================

begin;

set local search_path = public, pg_temp;

create or replace function pg_temp.mig0681_rewrite(p_fn regprocedure, p_old text, p_new text)
returns void
language plpgsql
as $rw$
declare
  v_def text := replace(pg_get_functiondef(p_fn), E'\r\n', E'\n');
  v_n   integer;
begin
  v_n := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
  if v_n <> 1 then
    raise exception '0681: % holds the text to change % times, not once: %', p_fn, v_n, left(p_old, 90);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$rw$;

-- ── 1 · the tables ──────────────────────────────────────────────────────────
create table public.supplier_debit_notes (
  id                uuid primary key default gen_random_uuid(),
  note_no           text unique,
  supplier_id       uuid not null references public.suppliers(id),
  -- 0560: a blank is no character that is not whitespace.
  supplier_note_no  text not null check (supplier_note_no ~ '[^[:space:]]' and length(btrim(supplier_note_no)) <= 60),
  note_date         date not null,
  due_date          date,
  ap_account_code   text not null references public.gl_accounts(code) on update cascade,
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
  constraint supplier_debit_notes_confirmed_posts
    check (status = 'draft' or status = 'cancelled' or (gl_entry_id is not null and note_no is not null)),
  constraint supplier_debit_notes_cancel_says_why
    check (status <> 'cancelled' or coalesce(cancel_reason, '') ~ '[^[:space:]]'),
  constraint supplier_debit_notes_due_not_before_date
    check (due_date is null or due_date >= note_date)
);
comment on table public.supplier_debit_notes is
  '0681: a supplier''s debit note (the supplier charges more), entered once. Confirming posts Dr each line / Cr the payables account (party = supplier). Paid by a payment voucher. Written only by its functions.';

-- One live entry of one supplier paper.
create unique index supplier_debit_notes_one_live_paper
  on public.supplier_debit_notes (supplier_id, lower(btrim(supplier_note_no)))
  where status <> 'cancelled';
create index supplier_debit_notes_supplier on public.supplier_debit_notes (supplier_id);

create table public.supplier_debit_note_lines (
  note_id         uuid not null references public.supplier_debit_notes(id) on delete cascade,
  line_no         integer not null check (line_no between 1 and 300),
  account_code    text not null references public.gl_accounts(code) on update cascade,
  description     text not null check (description ~ '[^[:space:]]' and length(btrim(description)) <= 200),
  amount          numeric(12,2) not null check (amount > 0),
  department_type text,
  department_id   uuid,
  primary key (note_id, line_no),
  constraint supplier_debit_note_lines_department_shape check (
    (department_type is null and department_id is null)
    or (department_type in ('SHOWROOM','DEALER') and department_id is not null)
    or (department_type in ('SUBSCRIPTION','OFFICE') and department_id is null))
);

-- What a voucher pays on a debit note: the twin of payment_voucher_allocations,
-- which stays the bills' own.
create table public.payment_voucher_debit_note_allocations (
  id             uuid primary key default gen_random_uuid(),
  voucher_id     uuid not null references public.payment_vouchers(id),
  debit_note_id  uuid not null references public.supplier_debit_notes(id),
  amount_applied numeric(12,2) not null check (amount_applied > 0),
  created_at     timestamptz not null default now(),
  created_by     uuid references public.app_users(id),
  constraint payment_voucher_debit_note_allocations_once unique (voucher_id, debit_note_id)
);
create index payment_voucher_debit_note_allocations_note
  on public.payment_voucher_debit_note_allocations (debit_note_id);
comment on table public.payment_voucher_debit_note_allocations is
  '0681: what a payment voucher pays on a supplier debit note. Written only by payment_voucher_save_draft, while the voucher is a draft.';

alter table public.supplier_debit_notes                   enable row level security;
alter table public.supplier_debit_note_lines              enable row level security;
alter table public.payment_voucher_debit_note_allocations enable row level security;
revoke all on public.supplier_debit_notes, public.supplier_debit_note_lines,
              public.payment_voucher_debit_note_allocations from anon, authenticated;
grant select on public.supplier_debit_notes, public.supplier_debit_note_lines,
                public.payment_voucher_debit_note_allocations to authenticated;
create policy supplier_debit_notes_read_internal on public.supplier_debit_notes
  for select using ((select public.gl_may_read()));
create policy supplier_debit_note_lines_read_internal on public.supplier_debit_note_lines
  for select using ((select public.gl_may_read()));
create policy payment_voucher_debit_note_allocations_read_internal on public.payment_voucher_debit_note_allocations
  for select using ((select public.gl_may_read()));

-- ── 2 · files and history take the new document ──────────────────────────────
-- The type lists are extended from their LIVE definitions, so a value a later
-- file added stays.
do $types$
declare
  r     record;
  v_def text;
begin
  for r in select * from (values ('ap_document_events', 'ap_document_events_document_type_check'),
                                 ('ap_document_files',  'ap_document_files_document_type_check')) t(tbl, con) loop
    select pg_get_constraintdef(c.oid) into v_def
      from pg_constraint c where c.conrelid = format('public.%I', r.tbl)::regclass and c.conname = r.con;
    if v_def is null or position('''SUPPLIER_CREDIT_NOTE''::text' in v_def) = 0 then
      raise exception '0681: % is not the list 0642 left: %', r.con, v_def;
    end if;
    execute format('alter table public.%I drop constraint %I', r.tbl, r.con);
    execute format('alter table public.%I add constraint %I %s', r.tbl, r.con,
                   replace(v_def, '''SUPPLIER_CREDIT_NOTE''::text',
                                  '''SUPPLIER_CREDIT_NOTE''::text, ''SUPPLIER_DEBIT_NOTE''::text'));
  end loop;
end $types$;

select pg_temp.mig0681_rewrite('public.ap_document_file_add(text, uuid, text, text, text, bigint)'::regprocedure,
$old$  elsif v_type = 'SUPPLIER_CREDIT_NOTE' then
    select status into v_status from public.supplier_credit_notes where id = p_document_id;
  else
    raise exception 'A file belongs to a bill, a payment voucher or a supplier credit note.'$old$,
$new$  elsif v_type = 'SUPPLIER_CREDIT_NOTE' then
    select status into v_status from public.supplier_credit_notes where id = p_document_id;
  elsif v_type = 'SUPPLIER_DEBIT_NOTE' then                          -- 0681
    select status into v_status from public.supplier_debit_notes where id = p_document_id;
  else
    raise exception 'A file belongs to a bill, a payment voucher, or a supplier credit or debit note.'$new$);

-- ── 3 · which accounts a debit note line takes ───────────────────────────────
-- A new use, debit_line: what the supplier charges more is a cost, as a bill
-- line is (an expense or asset account, never a control, cash or bank account,
-- nor the advance account). ap_account_choices' for_bill_line already answers it.
select pg_temp.mig0681_rewrite('public._ap_require_account(text, text, text)'::regprocedure,
$old$p_use in ('bill_line','voucher_line','credit_line') then$old$,
$new$p_use in ('bill_line','voucher_line','credit_line','debit_line') then$new$);

select pg_temp.mig0681_rewrite('public._ap_require_account(text, text, text)'::regprocedure,
$old$  elsif p_use = 'credit_line' then$old$,
$new$  elsif p_use = 'debit_line' then                                    -- 0681
    if v_acc.is_control then
      raise exception '%: % % is a control account. A debit note line is a cost. Choose an expense or asset account.', p_what, v_acc.code, v_acc.name
        using errcode = 'P0001', detail = 'account_is_control';
    end if;
    if v_acc.kind not in ('EXPENSE','ASSET') then
      raise exception '%: % % is not an expense or asset account.', p_what, v_acc.code, v_acc.name
        using errcode = 'P0001', detail = 'account_wrong_kind';
    end if;
    if public.ap_account_is_money(v_acc.code) then
      raise exception '%: % % is a cash or bank account. A debit note does not move money; the payment voucher does.', p_what, v_acc.code, v_acc.name
        using errcode = 'P0001', detail = 'account_is_money';
    end if;
  elsif p_use = 'credit_line' then$new$);

-- ── 4 · paid, the one arithmetic ─────────────────────────────────────────────
-- An approved voucher pays a debit note on its own date, as it pays a bill.
create or replace function public.ap_debit_note_settled(p_as_at date default null)
returns table (debit_note_id uuid, paid numeric(12,2))
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select al.debit_note_id, coalesce(sum(al.amount_applied), 0)::numeric(12,2)
    from public.payment_voucher_debit_note_allocations al
    join public.payment_vouchers pv on pv.id = al.voucher_id
   where pv.status = 'approved'
     and (p_as_at is null or pv.voucher_date <= p_as_at)
   group by al.debit_note_id
$fn$;

-- paid as above; held = on any voucher not cancelled (the ceiling a new payment meets).
create or replace function public.ap_debit_note_paid(p_note_id uuid default null)
returns table (debit_note_id uuid, paid numeric(12,2), held numeric(12,2))
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select h.nid, coalesce(s.paid, 0)::numeric(12,2), h.held
    from (
      select al.debit_note_id as nid, coalesce(sum(al.amount_applied), 0)::numeric(12,2) as held
        from public.payment_voucher_debit_note_allocations al
        join public.payment_vouchers pv on pv.id = al.voucher_id
       where pv.status <> 'cancelled'
         and (p_note_id is null or al.debit_note_id = p_note_id)
       group by al.debit_note_id
    ) h
    left join public.ap_debit_note_settled(null) s on s.debit_note_id = h.nid
$fn$;

-- A confirmed debit note, what is paid on it and what is still owed.
create or replace function public.supplier_debit_open(p_note_id uuid default null)
returns table (note_id uuid, supplier_id uuid, ap_account_code text,
               total_amount numeric(12,2), paid_total numeric(12,2), held_total numeric(12,2),
               debit_open numeric(12,2))
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select n.id, n.supplier_id, n.ap_account_code, n.total_amount,
         coalesce(p.paid, 0)::numeric(12,2),
         coalesce(p.held, 0)::numeric(12,2),
         (n.total_amount - coalesce(p.paid, 0))::numeric(12,2)
    from public.supplier_debit_notes n
    left join public.ap_debit_note_paid(p_note_id) p on p.debit_note_id = n.id
   where n.status = 'confirmed'
     and (p_note_id is null or n.id = p_note_id)
$fn$;

revoke all on function public.ap_debit_note_settled(date) from public, anon, authenticated;
revoke all on function public.ap_debit_note_paid(uuid) from public, anon, authenticated;
revoke all on function public.supplier_debit_open(uuid) from public, anon, authenticated;
comment on function public.supplier_debit_open(uuid) is
  '0681 · law D: a confirmed supplier debit note, paid by approved vouchers; debit_open = total less paid. Internal.';

-- ── 5 · a voucher pays a debit note: its ceiling ─────────────────────────────
-- The twin of pv_allocation_ceiling (0477): the note confirmed, the voucher's
-- own supplier, never more than the note, and the voucher's bills and notes
-- never more than the voucher.
create or replace function public.pv_debit_note_allocation_ceiling()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_note       public.supplier_debit_notes%rowtype;
  v_voucher    public.payment_vouchers%rowtype;
  v_on_note    numeric(12,2);
  v_on_voucher numeric(12,2);
begin
  select * into v_note from public.supplier_debit_notes where id = new.debit_note_id for update;
  if not found then
    raise exception 'That debit note does not exist.'
      using errcode = 'P0002', detail = 'debit_note_missing';
  end if;
  select * into v_voucher from public.payment_vouchers where id = new.voucher_id for update;

  if v_note.status <> 'confirmed' then
    raise exception 'Debit note % is not confirmed. Only a confirmed debit note can be paid.',
      coalesce(v_note.note_no, 'for ' || v_note.supplier_note_no)
      using errcode = 'P0001', detail = 'debit_note_not_confirmed';
  end if;
  if coalesce(v_voucher.purpose, 'SUPPLIER_BILLS') <> 'SUPPLIER_BILLS' then
    raise exception 'A direct payment does not pay debit notes.'
      using errcode = 'P0001', detail = 'direct_pays_no_bill';
  end if;
  if v_voucher.supplier_id is null or v_note.supplier_id <> v_voucher.supplier_id then
    raise exception 'Debit note % belongs to a different supplier. One voucher pays one supplier.', v_note.note_no
      using errcode = 'P0001', detail = 'supplier_mismatch';
  end if;

  v_on_note := coalesce((select dp.held from public.ap_debit_note_paid(new.debit_note_id) dp), 0)
             - coalesce((select a.amount_applied
                           from public.payment_voucher_debit_note_allocations a
                           join public.payment_vouchers v on v.id = a.voucher_id
                          where a.id = new.id and v.status <> 'cancelled'), 0);
  if v_on_note + new.amount_applied > v_note.total_amount then
    raise exception 'Debit note % is RM % and RM % of it is already on a payment voucher, so it cannot take RM % more.',
      v_note.note_no,
      to_char(v_note.total_amount, 'FM999,999,999,990.00'),
      to_char(v_on_note, 'FM999,999,999,990.00'),
      to_char(new.amount_applied, 'FM999,999,999,990.00')
      using errcode = 'P0001', detail = 'debit_note_over_allocated';
  end if;

  select coalesce(sum(x.amount_applied), 0) into v_on_voucher
    from (select a.amount_applied from public.payment_voucher_allocations a
           where a.voucher_id = new.voucher_id
          union all
          select d.amount_applied from public.payment_voucher_debit_note_allocations d
           where d.voucher_id = new.voucher_id and d.id <> new.id) x;
  if v_on_voucher + new.amount_applied > v_voucher.amount then
    raise exception 'The bills and debit notes on this voucher add up to more than the voucher total.'
      using errcode = 'P0001', detail = 'voucher_over_allocated';
  end if;

  return new;
end;
$fn$;
revoke all on function public.pv_debit_note_allocation_ceiling() from public, anon, authenticated;

create trigger pv_debit_note_allocation_ceiling_trg
  before insert or update on public.payment_voucher_debit_note_allocations
  for each row execute function public.pv_debit_note_allocation_ceiling();
-- The bills' own rule: what a voucher pays is frozen once it leaves draft.
create trigger pv_debit_note_allocation_only_while_draft_trg
  before insert or delete or update on public.payment_voucher_debit_note_allocations
  for each row execute function public.pv_allocation_only_while_draft();

-- ── 6 · the voucher reads and writes them ────────────────────────────────────
-- Saving: an allocation names a bill or a debit note, never both.
select pg_temp.mig0681_rewrite(
  'public.payment_voucher_save_draft(uuid, text, uuid, text, date, text, jsonb, jsonb, text, text, text, numeric)'::regprocedure,
$old$    begin
      v_bill_id := nullif(btrim(coalesce(v_line ->> 'bill_id', '')), '')::uuid;$old$,
$new$    -- 0681: a voucher that pays supplier bills pays a supplier debit note the same way.
    if nullif(btrim(coalesce(v_line ->> 'bill_id', '')), '') is not null
       and nullif(btrim(coalesce(v_line ->> 'debit_note_id', '')), '') is not null then
      raise exception 'Bill %: choose a bill or a debit note, not both.', v_n
        using errcode = 'P0001', detail = 'allocation_invalid';
    end if;
    begin
      v_bill_id := coalesce(nullif(btrim(coalesce(v_line ->> 'bill_id', '')), '')::uuid,
                            nullif(btrim(coalesce(v_line ->> 'debit_note_id', '')), '')::uuid);$new$);

select pg_temp.mig0681_rewrite(
  'public.payment_voucher_save_draft(uuid, text, uuid, text, date, text, jsonb, jsonb, text, text, text, numeric)'::regprocedure,
$old$    delete from public.payment_voucher_allocations where voucher_id = v_id;$old$,
$new$    delete from public.payment_voucher_allocations where voucher_id = v_id;
    delete from public.payment_voucher_debit_note_allocations where voucher_id = v_id;   -- 0681$new$);

select pg_temp.mig0681_rewrite(
  'public.payment_voucher_save_draft(uuid, text, uuid, text, date, text, jsonb, jsonb, text, text, text, numeric)'::regprocedure,
$old$  for v_line in select value from jsonb_array_elements(v_allocs) loop
    insert into public.payment_voucher_allocations (voucher_id, bill_id, amount_applied, created_by)
    values (v_id, (v_line ->> 'bill_id')::uuid,
            round(nullif(btrim(coalesce(v_line ->> 'amount', v_line ->> 'amount_applied', '')), '')::numeric, 2),
            v_me);
  end loop;$old$,
$new$  for v_line in select value from jsonb_array_elements(v_allocs) loop
    if nullif(btrim(coalesce(v_line ->> 'debit_note_id', '')), '') is not null then
      -- 0681: a debit note, in its own table; its ceiling trigger measures it.
      insert into public.payment_voucher_debit_note_allocations (voucher_id, debit_note_id, amount_applied, created_by)
      values (v_id, (v_line ->> 'debit_note_id')::uuid,
              round(nullif(btrim(coalesce(v_line ->> 'amount', v_line ->> 'amount_applied', '')), '')::numeric, 2),
              v_me);
    else
      insert into public.payment_voucher_allocations (voucher_id, bill_id, amount_applied, created_by)
      values (v_id, (v_line ->> 'bill_id')::uuid,
              round(nullif(btrim(coalesce(v_line ->> 'amount', v_line ->> 'amount_applied', '')), '')::numeric, 2),
              v_me);
    end if;
  end loop;$new$);

-- Checking: the debit notes count in the total, and stand as they do NOW.
select pg_temp.mig0681_rewrite('public._payment_voucher_validate(uuid)'::regprocedure,
$old$  select coalesce(sum(amount_applied), 0), count(*) into v_allocs, v_nallocs
    from public.payment_voucher_allocations where voucher_id = p_voucher_id;$old$,
$new$  select coalesce(sum(x.amount_applied), 0), count(*) into v_allocs, v_nallocs
    from (select a.amount_applied from public.payment_voucher_allocations a
           where a.voucher_id = p_voucher_id
          union all
          -- 0681: the supplier debit notes it pays count as its bills do.
          select d.amount_applied from public.payment_voucher_debit_note_allocations d
           where d.voucher_id = p_voucher_id) x;$new$);

select pg_temp.mig0681_rewrite('public._payment_voucher_validate(uuid)'::regprocedure,
$old$  if v_bad is not null then
    raise exception 'These bills can no longer take this payment: %. Return the voucher to draft and correct it.', v_bad
      using errcode = 'P0001', detail = 'bill_cannot_take_payment';
  end if;$old$,
$new$  if v_bad is not null then
    raise exception 'These bills can no longer take this payment: %. Return the voucher to draft and correct it.', v_bad
      using errcode = 'P0001', detail = 'bill_cannot_take_payment';
  end if;

  -- 0681: the debit notes as they stand NOW, as the bills above.
  select string_agg(coalesce(d.note_no, d.supplier_note_no), ', ') into v_bad
    from public.payment_voucher_debit_note_allocations a
    join public.supplier_debit_notes d on d.id = a.debit_note_id
   where a.voucher_id = p_voucher_id
     and (d.status <> 'confirmed'
          or d.supplier_id is distinct from v_v.supplier_id
          or coalesce((select dp.held from public.ap_debit_note_paid(a.debit_note_id) dp), 0) > d.total_amount);
  if v_bad is not null then
    raise exception 'These debit notes can no longer take this payment: %. Return the voucher to draft and correct it.', v_bad
      using errcode = 'P0001', detail = 'debit_note_cannot_take_payment';
  end if;$new$);

-- Approving: lock the debit notes too, and Dr each one's payables account.
select pg_temp.mig0681_rewrite('public.payment_voucher_approve(uuid)'::regprocedure,
$old$  perform public._payment_voucher_validate(p_voucher_id);$old$,
$new$  -- 0681: and the debit notes it pays.
  perform 1 from public.supplier_debit_notes d
   where d.id in (select a.debit_note_id from public.payment_voucher_debit_note_allocations a
                   where a.voucher_id = p_voucher_id)
     for update;
  perform public._payment_voucher_validate(p_voucher_id);$new$);

select pg_temp.mig0681_rewrite('public.payment_voucher_approve(uuid)'::regprocedure,
$old$  -- Dr the advance to the supplier's own payables control (0484). The bill it$old$,
$new$  -- 0681: Dr each paid debit note's OWN payables account, party = its supplier.
  for r in select d.ap_account_code, d.supplier_id, d.note_no, d.supplier_note_no,
                  a.amount_applied
             from public.payment_voucher_debit_note_allocations a
             join public.supplier_debit_notes d on d.id = a.debit_note_id
            where a.voucher_id = p_voucher_id
            order by d.note_date, d.note_no loop
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_code', r.ap_account_code,
      'debit',  r.amount_applied,
      'credit', 0,
      'party_type', 'SUPPLIER',
      'party_id',   r.supplier_id,
      'memo',   'Pays ' || r.note_no || ' · debit note ' || r.supplier_note_no));
  end loop;

  -- Dr the advance to the supplier's own payables control (0484). The bill it$new$);

-- Its page lists the debit notes it pays.
select pg_temp.mig0681_rewrite('public.payment_voucher_document(uuid)'::regprocedure,
$old$    'advance', case when v_v.advance_amount > 0 then jsonb_build_object($old$,
$new$    -- 0681: the supplier debit notes it pays.
    'debit_notes', coalesce((
      select jsonb_agg(to_jsonb(z) order by z.note_date, z.note_no) from (
        select al.debit_note_id, d.note_no, d.supplier_note_no, d.note_date, d.due_date,
               d.total_amount as note_total, d.ap_account_code, al.amount_applied
          from public.payment_voucher_debit_note_allocations al
          join public.supplier_debit_notes d on d.id = al.debit_note_id
         where al.voucher_id = p_voucher_id) z), '[]'::jsonb),
    'advance', case when v_v.advance_amount > 0 then jsonb_build_object($new$);

-- Its list names them beside the bills.
select pg_temp.mig0681_rewrite('public.payment_voucher_register()'::regprocedure,
$old$         (select string_agg(coalesce(b.bill_no, b.supplier_invoice_no), ', ' order by b.bill_date)
            from public.payment_voucher_allocations al
            join public.supplier_bills b on b.id = al.bill_id
           where al.voucher_id = v.id),$old$,
$new$         (select string_agg(x.doc_no, ', ' order by x.doc_date)
            from (select coalesce(b.bill_no, b.supplier_invoice_no) as doc_no, b.bill_date as doc_date
                    from public.payment_voucher_allocations al
                    join public.supplier_bills b on b.id = al.bill_id
                   where al.voucher_id = v.id
                  union all
                  -- 0681: and the debit notes it pays.
                  select coalesce(dn.note_no, dn.supplier_note_no), dn.note_date
                    from public.payment_voucher_debit_note_allocations dl
                    join public.supplier_debit_notes dn on dn.id = dl.debit_note_id
                   where dl.voucher_id = v.id) x),$new$);

-- ── 7 · AP · Payables: a debit note still owed, so net owing stays the ledger ──
-- The return type gains debit_open, so the function is recreated. The body is
-- 0642's, checked here to be the live one, changed only by the debit notes.
do $live$
declare
  v_def text := replace(pg_get_functiondef('public.ap_outstanding(uuid)'::regprocedure), E'\r\n', E'\n');
begin
  if position('(o.owing - o.adv_open - o.cr_open)::numeric(12,2)' in v_def) = 0
     or position('from public.supplier_credit_open() co' in v_def) = 0
     or position('left join public.ap_bill_paid() bp on bp.bill_id = sb.id' in v_def) = 0 then
    raise exception '0681: ap_outstanding is not the body 0642 left; carry its live body forward instead';
  end if;
end $live$;

drop function public.ap_outstanding(uuid);
create function public.ap_outstanding(p_supplier_id uuid default null)
returns table (supplier_id uuid, supplier_name text, bills_confirmed integer,
               billed_total numeric, allocated_total numeric, paid_total numeric,
               balance_owing numeric, uncommitted numeric,
               oldest_confirmed_bill_date date, go_live_on date, supplier_kind text,
               open_bills integer, oldest_unpaid_bill_date date,
               advance_open numeric, net_owing numeric, credit_open numeric, debit_open numeric)
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
  ), debit_notes as (
    -- 0681: confirmed debit notes not yet paid.
    select dn.supplier_id as sid, sum(dn.debit_open) as open_total
      from public.supplier_debit_open() dn
     group by dn.supplier_id
  ), owed as (
    select s.id as sid, s.name, s.kind::text as kind,
           ps.cnt, ps.billed, ps.allocated, ps.paid, ps.oldest, ps.open_cnt, ps.oldest_open,
           (coalesce(ps.billed, 0) - coalesce(ps.paid, 0)) as owing,
           coalesce(adv.open_total, 0) as adv_open,
           coalesce(cr.open_total, 0) as cr_open,
           coalesce(db.open_total, 0) as db_open
      from public.suppliers s
      left join per_supplier ps on ps.sid = s.id
      left join advance adv on adv.sid = s.id
      left join credit cr on cr.sid = s.id
      left join debit_notes db on db.sid = s.id
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
         (o.owing + o.db_open - o.adv_open - o.cr_open)::numeric(12,2),
         o.cr_open::numeric(12,2),
         o.db_open::numeric(12,2)
    from owed o
   order by o.name;
end;
$fn$;
revoke all on function public.ap_outstanding(uuid) from public, anon;
grant execute on function public.ap_outstanding(uuid) to authenticated;
comment on function public.ap_outstanding(uuid) is
  '0484 · 0642 · 0681: owed per supplier, every supplier listed. balance_owing = confirmed bills less what is paid on them (ap_bill_paid). advance_open = advances not yet knocked off or sent back; credit_open = confirmed credit notes not yet knocked off; debit_open = confirmed debit notes not yet paid. net_owing = balance_owing + debit_open - advance_open - credit_open, which is what the supplier''s payables control holds in the ledger. Finance and principal only.';

-- ── 8 · AP Aging ages a debit note by its own dates ──────────────────────────
select pg_temp.mig0681_rewrite('public.fin_ap_aging(date)'::regprocedure,
$old$  open_bills as (
    select b.id, b.bill_no, b.supplier_invoice_no, b.supplier_id, b.bill_date, b.due_date,
           b.total_amount, b.total_amount - coalesce(st.paid, 0) as open
      from public.supplier_bills b
      left join settled st on st.bill_id = b.id
     where b.status = 'confirmed'
       and b.bill_date <= p_as_at
       and b.ap_account_code in (select code from ctl)
  ),$old$,
$new$  open_bills as (
    select b.id, b.bill_no, b.supplier_invoice_no, b.supplier_id, b.bill_date, b.due_date,
           b.total_amount, b.total_amount - coalesce(st.paid, 0) as open, 'bill'::text as kind
      from public.supplier_bills b
      left join settled st on st.bill_id = b.id
     where b.status = 'confirmed'
       and b.bill_date <= p_as_at
       and b.ap_account_code in (select code from ctl)
    union all
    -- 0681: a supplier debit note is owed like a bill, aged by its own dates.
    select d.id, d.note_no, d.supplier_note_no, d.supplier_id, d.note_date, d.due_date,
           d.total_amount, d.total_amount - coalesce(ds.paid, 0), 'debit_note'::text
      from public.supplier_debit_notes d
      left join public.ap_debit_note_settled(p_as_at) ds on ds.debit_note_id = d.id
     where d.status = 'confirmed'
       and d.note_date <= p_as_at
       and d.ap_account_code in (select code from ctl)
  ),$new$);

select pg_temp.mig0681_rewrite('public.fin_ap_aging(date)'::regprocedure,
$old$                          'open',                ob.open)$old$,
$new$                          'open',                ob.open,
                          'kind',                ob.kind)$new$);

-- ── 9 · the doors ───────────────────────────────────────────────────────────
create or replace function public.supplier_debit_note_save_draft(
  p_note_id          uuid,
  p_supplier_id      uuid,
  p_supplier_note_no text,
  p_note_date        date,
  p_lines            jsonb,
  p_due_date         date default null,
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
  v_note     public.supplier_debit_notes%rowtype;
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
    raise exception 'Only Finance enters a supplier debit note.'
      using errcode = '42501', detail = 'not_finance';
  end if;

  if p_note_id is not null then
    select * into v_note from public.supplier_debit_notes where id = p_note_id for update;
    if not found then
      raise exception 'That debit note does not exist.'
        using errcode = 'P0002', detail = 'note_missing';
    end if;
    if v_note.status <> 'draft' then
      raise exception 'Only a draft debit note can be changed.'
        using errcode = 'P0001', detail = 'note_not_draft';
    end if;
  end if;

  select * into v_supplier from public.suppliers where id = p_supplier_id;
  if not found then
    raise exception 'Choose who sent this debit note.'
      using errcode = 'P0001', detail = 'supplier_missing';
  end if;
  if coalesce(p_supplier_note_no, '') !~ '[^[:space:]]' then          -- 0560
    raise exception 'Type the number printed on the supplier''s debit note.'
      using errcode = 'P0001', detail = 'paper_no_missing';
  end if;
  if length(v_paper) > 60 then
    raise exception 'The debit note number is too long.'
      using errcode = 'P0001', detail = 'paper_no_too_long';
  end if;
  if p_note_date is null then
    raise exception 'Type the date printed on the supplier''s debit note.'
      using errcode = 'P0001', detail = 'note_date_missing';
  end if;
  if p_due_date is not null and p_due_date < p_note_date then
    raise exception 'The due date cannot be before the debit note''s date.'
      using errcode = 'P0001', detail = 'due_before_date';
  end if;
  perform public.ap_refuse_before_go_live(p_note_date, 'This debit note');

  -- The same paper entered twice charges twice.
  select coalesce(n.note_no, 'a draft debit note') into v_dup
    from public.supplier_debit_notes n
   where n.supplier_id = p_supplier_id
     and lower(btrim(n.supplier_note_no)) = lower(v_paper)
     and n.status <> 'cancelled'
     and n.id is distinct from p_note_id
   limit 1;
  if v_dup is not null then
    raise exception 'Debit note % from % is already entered, as %.', v_paper, v_supplier.name, v_dup
      using errcode = 'P0001', detail = 'paper_already_entered';
  end if;

  -- The same payables account a bill from this supplier takes (0554: by role).
  v_ap := coalesce(nullif(btrim(coalesce(p_ap_account_code, '')), ''),
                   public.gl_account_for(
                     case when v_supplier.kind::text = 'other_creditor' then 'OTHER_PAYABLE' else 'TRADE_PAYABLE' end));
  perform public._ap_require_account(v_ap, 'ap', 'Payables account');

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'A debit note needs at least one line.'
      using errcode = 'P0001', detail = 'no_lines';
  end if;
  if jsonb_array_length(p_lines) > 300 then
    raise exception 'A debit note can have at most 300 lines.'
      using errcode = 'P0001', detail = 'too_many_lines';
  end if;

  if p_note_id is null then
    insert into public.supplier_debit_notes
      (supplier_id, supplier_note_no, note_date, due_date, ap_account_code, narration, created_by)
    values
      (p_supplier_id, v_paper, p_note_date, p_due_date, v_ap, nullif(btrim(coalesce(p_narration, '')), ''), v_me)
    returning id into v_id;
  else
    v_id := p_note_id;
    update public.supplier_debit_notes
       set supplier_id      = p_supplier_id,
           supplier_note_no = v_paper,
           note_date        = p_note_date,
           due_date         = p_due_date,
           ap_account_code  = v_ap,
           narration        = nullif(btrim(coalesce(p_narration, '')), ''),
           total_amount     = 0
     where id = v_id;
    -- A draft's lines are replaced whole; a draft has posted nothing.
    delete from public.supplier_debit_note_lines where note_id = v_id;
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_n := v_n + 1;
    if jsonb_typeof(v_line) <> 'object' then
      raise exception 'Line % is not a debit note line.', v_n
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
      raise exception 'Line %: say what the supplier charges more for.', v_n
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
    perform public._ap_require_account(v_account, 'debit_line', format('Line %s', v_n));
    v_dept := public.fin_line_department(v_line, v_account, format('Line %s', v_n));

    insert into public.supplier_debit_note_lines
      (note_id, line_no, account_code, description, amount, department_type, department_id)
    values
      (v_id, v_n, v_account, v_desc, v_amount, v_dept.department_type, v_dept.department_id);
    v_total := v_total + v_amount;
  end loop;

  update public.supplier_debit_notes set total_amount = v_total where id = v_id;
  perform public._ap_event('SUPPLIER_DEBIT_NOTE', v_id,
                           case when p_note_id is null then 'created' else 'edited' end, null);
  return v_id;
end;
$fn$;

create or replace function public.supplier_debit_note_confirm(p_note_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role  text := public.app_role()::text;
  v_note  public.supplier_debit_notes%rowtype;
  v_total numeric(12,2);
  v_lines jsonb;
  v_no    text;
  v_entry uuid;
  r       record;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance confirms a supplier debit note.'
      using errcode = '42501', detail = 'not_finance';
  end if;

  select * into v_note from public.supplier_debit_notes where id = p_note_id for update;
  if not found then
    raise exception 'That debit note does not exist.'
      using errcode = 'P0002', detail = 'note_missing';
  end if;
  if v_note.status <> 'draft' then
    raise exception 'This debit note is already %.', v_note.status
      using errcode = 'P0001', detail = 'note_not_draft';
  end if;

  perform public.ap_refuse_before_go_live(v_note.note_date, 'This debit note');
  perform public._ap_require_account(v_note.ap_account_code, 'ap', 'Payables account');
  for r in select l.line_no, l.account_code
             from public.supplier_debit_note_lines l
            where l.note_id = p_note_id order by l.line_no loop
    perform public._ap_require_account(r.account_code, 'debit_line', format('Line %s', r.line_no));
  end loop;

  select coalesce(sum(amount), 0) into v_total
    from public.supplier_debit_note_lines where note_id = p_note_id;
  if v_total <= 0 then
    raise exception 'A debit note of RM 0.00 charges nothing.'
      using errcode = 'P0001', detail = 'zero_total';
  end if;

  -- Dr each line, with its department; Cr the payables account for the whole,
  -- party = the supplier.
  select coalesce(jsonb_agg(jsonb_build_object(
           'account_code', l.account_code,
           'debit',  l.amount,
           'credit', 0,
           'memo',   l.description,
           'department_type', l.department_type,
           'department_id',   l.department_id)
         order by l.line_no), '[]'::jsonb)
         || jsonb_build_array(jsonb_build_object(
              'account_code', v_note.ap_account_code,
              'debit',  0,
              'credit', v_total,
              'party_type', 'SUPPLIER',
              'party_id',   v_note.supplier_id,
              'memo',       'Supplier debit note ' || v_note.supplier_note_no))
    into v_lines
    from public.supplier_debit_note_lines l
   where l.note_id = p_note_id;

  -- Random, not sequential, as a bill's number (purchasing MASTER §6.1).
  v_no := public.allocate_formal_document_code('PDN', v_note.id::text, v_note.note_date);

  v_entry := public.gl_post(
    'SUPPLIER_DEBIT_NOTE',
    v_no,
    v_note.note_date,
    coalesce(v_note.narration, 'Supplier debit note ' || v_no || ' · ' || v_note.supplier_note_no),
    v_lines);

  update public.supplier_debit_notes
     set note_no      = v_no,
         total_amount = v_total,
         status       = 'confirmed',
         gl_entry_id  = v_entry,
         confirmed_at = now(),
         confirmed_by = auth.uid()
   where id = p_note_id;

  perform public._ap_event('SUPPLIER_DEBIT_NOTE', p_note_id, 'confirmed', v_no);
  return v_entry;
end;
$fn$;

create or replace function public.supplier_debit_note_cancel(p_note_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     text := public.app_role()::text;
  v_note     public.supplier_debit_notes%rowtype;
  v_held     numeric(12,2);
  v_reversal uuid;
begin
  if coalesce(p_reason, '') !~ '[^[:space:]]' then                   -- 0560
    raise exception 'Say why this debit note is cancelled.'
      using errcode = 'P0001', detail = 'reason_missing';
  end if;
  select * into v_note from public.supplier_debit_notes where id = p_note_id for update;
  if not found then
    raise exception 'That debit note does not exist.'
      using errcode = 'P0002', detail = 'note_missing';
  end if;
  if v_note.status = 'cancelled' then
    raise exception 'This debit note is already cancelled.'
      using errcode = 'P0001', detail = 'already_cancelled';
  end if;

  if v_note.status = 'draft' then
    if v_role is null or v_role not in ('finance','principal') then
      raise exception 'Only Finance cancels a draft supplier debit note.'
        using errcode = '42501', detail = 'not_finance';
    end if;
  else
    -- A confirmed note is a posted document: as a confirmed bill (0484).
    if not public.has_finance_approver(auth.uid()) then
      raise exception 'Cancelling a confirmed debit note takes the finance approver.'
        using errcode = '42501', detail = 'not_finance_approver';
    end if;
    v_held := coalesce((select dp.held from public.ap_debit_note_paid(p_note_id) dp), 0);
    if v_held > 0 then
      raise exception 'RM % of this debit note is on payment vouchers. Cancel those vouchers first.',
        to_char(v_held, 'FM999,999,999,990.00')
        using errcode = 'P0001', detail = 'note_on_voucher';
    end if;
    v_reversal := public.gl_reverse(v_note.gl_entry_id, btrim(p_reason));
  end if;

  update public.supplier_debit_notes
     set status            = 'cancelled',
         reversal_entry_id = v_reversal,
         cancelled_at      = now(),
         cancelled_by      = (select u.id from public.app_users u where u.id = auth.uid()),
         cancel_reason     = btrim(p_reason)
   where id = p_note_id;

  perform public._ap_event('SUPPLIER_DEBIT_NOTE', p_note_id, 'cancelled', btrim(p_reason));
  return p_note_id;
end;
$fn$;

-- ── 10 · the readers ────────────────────────────────────────────────────────
create or replace function public.supplier_debit_note_register()
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
             n.supplier_note_no, n.note_date, n.due_date, n.ap_account_code, n.total_amount,
             case when n.status = 'confirmed' then dop.paid_total end as paid_total,
             case when n.status = 'confirmed' then dop.held_total end as held_total,
             case when n.status = 'confirmed' then dop.debit_open end as debit_open,
             (select count(*) from public.ap_document_files f
               where f.document_type = 'SUPPLIER_DEBIT_NOTE' and f.document_id = n.id)::integer as file_count,
             n.created_at
        from public.supplier_debit_notes n
        join public.suppliers s on s.id = n.supplier_id
        left join public.supplier_debit_open() dop on dop.note_id = n.id) r), '[]'::jsonb);
end;
$fn$;

create or replace function public.supplier_debit_note_document(p_note_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_note     public.supplier_debit_notes%rowtype;
  v_role     text := public.app_role()::text;
  v_finance  boolean;
  v_approver boolean;
  v_paid     numeric(12,2);
  v_held     numeric(12,2);
begin
  if not public.gl_may_read() then
    raise exception 'accounts payable is internal'
      using errcode = '42501', detail = 'not_internal';
  end if;
  select * into v_note from public.supplier_debit_notes where id = p_note_id;
  if not found then
    return null;
  end if;

  v_finance  := coalesce(v_role in ('finance','principal'), false);
  v_approver := public.has_finance_approver(auth.uid());
  select coalesce(dp.paid, 0), coalesce(dp.held, 0) into v_paid, v_held
    from (select 1) one left join public.ap_debit_note_paid(p_note_id) dp on true;

  return jsonb_build_object(
    'note', (
      select to_jsonb(x) from (
        select n.id, n.note_no, n.status, n.supplier_id, s.name as supplier_name, s.kind::text as supplier_kind,
               n.supplier_note_no, n.note_date, n.due_date, n.ap_account_code, ap.name as ap_account_name,
               n.total_amount, n.narration, n.cancel_reason,
               n.created_at, cu.name as created_by_name,
               n.confirmed_at, fu.name as confirmed_by_name,
               n.cancelled_at, xu.name as cancelled_by_name,
               e.entry_no as entry_no, re.entry_no as reversal_entry_no
          from public.supplier_debit_notes n
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
          from public.supplier_debit_note_lines l
          left join public.gl_accounts a on a.code = l.account_code
         where l.note_id = p_note_id) y), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(to_jsonb(z) order by z.voucher_date, z.created_at) from (
        select al.voucher_id, v.voucher_no, v.status as voucher_status, v.voucher_date,
               al.amount_applied, al.created_at
          from public.payment_voucher_debit_note_allocations al
          join public.payment_vouchers v on v.id = al.voucher_id
         where al.debit_note_id = p_note_id) z), '[]'::jsonb),
    'files', coalesce((
      select jsonb_agg(to_jsonb(f) order by f.uploaded_at) from (
        select fl.id, fl.file_name, fl.mime_type, fl.size_bytes, fl.storage_path,
               fl.uploaded_at, u.name as uploaded_by_name
          from public.ap_document_files fl
          left join public.app_users u on u.id = fl.uploaded_by
         where fl.document_type = 'SUPPLIER_DEBIT_NOTE' and fl.document_id = p_note_id) f), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(to_jsonb(ev) order by ev.at) from (
        select e.action, e.note, e.at, u.name as actor_name
          from public.ap_document_events e
          left join public.app_users u on u.id = e.actor
         where e.document_type = 'SUPPLIER_DEBIT_NOTE' and e.document_id = p_note_id) ev), '[]'::jsonb),
    'paid_total', case when v_note.status = 'confirmed' then v_paid end,
    'held_total', case when v_note.status = 'confirmed' then v_held end,
    'debit_open', case when v_note.status = 'confirmed' then v_note.total_amount - v_paid end,
    'go_live_on', (select gc.go_live_on from public.gl_config gc where gc.id),
    'can', jsonb_build_object(
      'edit',     v_note.status = 'draft' and v_finance,
      'confirm',  v_note.status = 'draft' and v_finance,
      'cancel',   case v_note.status
                    when 'draft' then v_finance
                    when 'confirmed' then v_approver and v_held = 0
                    else false end,
      'add_file', v_note.status <> 'cancelled' and v_finance)
  );
end;
$fn$;

-- ── 11 · a supplier credit note is numbered PCN from now on ──────────────────
select pg_temp.mig0681_rewrite('public.supplier_credit_note_confirm(uuid)'::regprocedure,
$old$  v_no := public.allocate_formal_document_code('SCN', v_note.id::text, v_note.note_date);$old$,
$new$  -- 0681: PCN, so subscription credit notes keep SCN (Chew 2026-10-07).
  v_no := public.allocate_formal_document_code('PCN', v_note.id::text, v_note.note_date);$new$);

-- ── 12 · a debit note settles debit notes owed (0676) ────────────────────────
alter table public.supplier_note_followup_settlements
  alter column credit_note_id drop not null,
  add column debit_note_id uuid references public.supplier_debit_notes(id),
  add constraint supplier_note_followup_settlements_one_note
    check (num_nonnulls(credit_note_id, debit_note_id) = 1);
create index supplier_note_followup_settlements_debit_note
  on public.supplier_note_followup_settlements (debit_note_id) where debit_note_id is not null;

-- What settled a note owed: a settlement on, by a credit or debit note that is confirmed.
select pg_temp.mig0681_rewrite('public._supplier_note_followup_figures(uuid)'::regprocedure,
$old$        join public.supplier_credit_notes n on n.id = st.credit_note_id
       where st.followup_id = f.id and st.taken_off_at is null and n.status = 'confirmed') s on true$old$,
$new$        left join public.supplier_credit_notes n on n.id = st.credit_note_id
        left join public.supplier_debit_notes dn on dn.id = st.debit_note_id   -- 0681
       where st.followup_id = f.id and st.taken_off_at is null
         and coalesce(n.status, dn.status) = 'confirmed') s on true$new$);

select pg_temp.mig0681_rewrite('public.supplier_note_followup_document(uuid)'::regprocedure,
$old$               'id', st.id, 'credit_note_id', n.id, 'note_no', n.note_no,
               'supplier_note_no', n.supplier_note_no, 'note_date', n.note_date, 'note_status', n.status,
               'amount', st.amount, 'counts', st.taken_off_at is null and n.status = 'confirmed',$old$,
$new$               'id', st.id, 'credit_note_id', st.credit_note_id, 'debit_note_id', st.debit_note_id,
               'note_no', coalesce(n.note_no, dn.note_no),
               'supplier_note_no', coalesce(n.supplier_note_no, dn.supplier_note_no),
               'note_date', coalesce(n.note_date, dn.note_date), 'note_status', coalesce(n.status, dn.status),
               'amount', st.amount, 'counts', st.taken_off_at is null and coalesce(n.status, dn.status) = 'confirmed',$new$);

select pg_temp.mig0681_rewrite('public.supplier_note_followup_document(uuid)'::regprocedure,
$old$        join public.supplier_credit_notes n on n.id = st.credit_note_id
        left join public.app_users cu on cu.id = st.created_by
        left join public.app_users tu on tu.id = st.taken_off_by
       where st.followup_id = p_id), '[]'::jsonb));$old$,
$new$        left join public.supplier_credit_notes n on n.id = st.credit_note_id
        left join public.supplier_debit_notes dn on dn.id = st.debit_note_id    -- 0681
        left join public.app_users cu on cu.id = st.created_by
        left join public.app_users tu on tu.id = st.taken_off_by
       where st.followup_id = p_id), '[]'::jsonb));$new$);

-- What a debit note has settled so far.
create or replace function public._supplier_debit_note_settled(p_note_id uuid)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $fn$
  select coalesce(sum(st.amount), 0)::numeric(12,2)
    from public.supplier_note_followup_settlements st
   where st.debit_note_id = p_note_id and st.taken_off_at is null;
$fn$;
revoke all on function public._supplier_debit_note_settled(uuid) from public, anon, authenticated;

-- A confirmed debit note settling a debit note owed by its supplier.
create or replace function public.supplier_note_followup_settle_by_debit_note(
  p_id uuid, p_debit_note_id uuid, p_amount numeric)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role      text := public.app_role()::text;
  v_me        uuid := (select u.id from public.app_users u where u.id = auth.uid());
  v_note      public.supplier_debit_notes%rowtype;
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

  -- The debit note first, then the note owed.
  select * into v_note from public.supplier_debit_notes where id = p_debit_note_id for update;
  if not found then
    raise exception 'That debit note does not exist.' using errcode = 'P0002', detail = 'note_missing';
  end if;
  if v_note.status <> 'confirmed' then
    raise exception 'Debit note % is not confirmed. Only a confirmed debit note settles a note owed.',
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
  if v_f.kind <> 'DEBIT' then
    raise exception 'A debit note settles only a debit note owed.' using errcode = 'P0001', detail = 'kind_mismatch';
  end if;
  if v_f.supplier_id <> v_note.supplier_id then
    raise exception 'This note is owed by another supplier.' using errcode = 'P0001', detail = 'supplier_mismatch';
  end if;
  if exists (select 1 from public.supplier_note_followup_settlements st
              where st.followup_id = p_id and st.debit_note_id = p_debit_note_id and st.taken_off_at is null) then
    raise exception 'Debit note % already settles this note. Take it off first to change the amount.', v_note.note_no
      using errcode = 'P0001', detail = 'already_settles';
  end if;

  select fg.left_amount into v_left from public._supplier_note_followup_figures(p_id) fg;
  if p_amount > v_left then
    raise exception 'Only RM % is left on this note. RM % is more than that.',
      to_char(v_left, 'FM999,999,999,990.00'), to_char(p_amount, 'FM999,999,999,990.00')
      using errcode = 'P0001', detail = 'over_settled';
  end if;
  v_note_left := v_note.total_amount - public._supplier_debit_note_settled(p_debit_note_id);
  if p_amount > v_note_left then
    raise exception 'Only RM % of debit note % is left to settle notes owed. RM % is more than that.',
      to_char(v_note_left, 'FM999,999,999,990.00'), v_note.note_no, to_char(p_amount, 'FM999,999,999,990.00')
      using errcode = 'P0001', detail = 'note_over_settled';
  end if;

  insert into public.supplier_note_followup_settlements (followup_id, debit_note_id, amount, created_by)
  values (p_id, p_debit_note_id, p_amount, v_me)
  returning id into v_id;
  return v_id;
end;
$fn$;

-- A debit note's settlements, and its supplier's debit notes still owed (the
-- debit note page).
create or replace function public.supplier_note_followups_of_debit_note(p_note_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_note public.supplier_debit_notes%rowtype;
begin
  if not coalesce(public.gl_may_read(), false) then
    raise exception 'accounts payable is internal' using errcode = '42501', detail = 'not_internal';
  end if;
  select * into v_note from public.supplier_debit_notes where id = p_note_id;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'settled', public._supplier_debit_note_settled(p_note_id),
    'left_to_settle', greatest(v_note.total_amount - public._supplier_debit_note_settled(p_note_id), 0),
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
       where st.debit_note_id = p_note_id), '[]'::jsonb),
    'owed', coalesce((
      select jsonb_agg(public._supplier_note_followup_json(f.id) order by f.noted_on, f.created_at)
        from public.supplier_note_followups f
        join public._supplier_note_followup_figures(null) fg on fg.followup_id = f.id
       where f.supplier_id = v_note.supplier_id and f.kind = 'DEBIT' and fg.status in ('waiting', 'part')), '[]'::jsonb));
end;
$fn$;

-- ── 13 · grants ─────────────────────────────────────────────────────────────
revoke all on function public.supplier_debit_note_save_draft(uuid, uuid, text, date, jsonb, date, text, text) from public, anon;
revoke all on function public.supplier_debit_note_confirm(uuid) from public, anon;
revoke all on function public.supplier_debit_note_cancel(uuid, text) from public, anon;
revoke all on function public.supplier_debit_note_register() from public, anon;
revoke all on function public.supplier_debit_note_document(uuid) from public, anon;
revoke all on function public.supplier_note_followup_settle_by_debit_note(uuid, uuid, numeric) from public, anon;
revoke all on function public.supplier_note_followups_of_debit_note(uuid) from public, anon;
grant execute on function public.supplier_debit_note_save_draft(uuid, uuid, text, date, jsonb, date, text, text) to authenticated;
grant execute on function public.supplier_debit_note_confirm(uuid) to authenticated;
grant execute on function public.supplier_debit_note_cancel(uuid, text) to authenticated;
grant execute on function public.supplier_debit_note_register() to authenticated;
grant execute on function public.supplier_debit_note_document(uuid) to authenticated;
grant execute on function public.supplier_note_followup_settle_by_debit_note(uuid, uuid, numeric) to authenticated;
grant execute on function public.supplier_note_followups_of_debit_note(uuid) to authenticated;

-- ── 14 · sanity ─────────────────────────────────────────────────────────────
do $sanity$
declare
  v_left text;
  r      record;
begin
  -- Every door and read is security definer with the search path.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('supplier_debit_note_save_draft', 'supplier_debit_note_confirm',
                                  'supplier_debit_note_cancel', 'supplier_debit_note_register',
                                  'supplier_debit_note_document', 'supplier_note_followup_settle_by_debit_note',
                                  'supplier_note_followups_of_debit_note', 'ap_debit_note_settled',
                                  'ap_debit_note_paid', 'supplier_debit_open', 'pv_debit_note_allocation_ceiling',
                                  'ap_outstanding')
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0681 sanity: a door or read lacks security definer or its search_path';
  end if;

  -- The rewrites took, and the rules earlier files put in them stayed.
  for r in select * from (values
      ('public.ap_document_file_add(text, uuid, text, text, text, bigint)', 'SUPPLIER_DEBIT_NOTE'),
      ('public._ap_require_account(text, text, text)', 'debit_line'),
      ('public._ap_require_account(text, text, text)', 'gl_account_for(''SUPPLIER_ADVANCE'')'),   -- 0554
      ('public._ap_require_account(text, text, text)', 'is_heading'),                              -- 0580
      ('public.payment_voucher_save_draft(uuid, text, uuid, text, date, text, jsonb, jsonb, text, text, text, numeric)', 'payment_voucher_debit_note_allocations'),
      ('public.payment_voucher_save_draft(uuid, text, uuid, text, date, text, jsonb, jsonb, text, text, text, numeric)', 'line_needs_description'),  -- 0552/0561
      ('public._payment_voucher_validate(uuid)', 'debit_note_cannot_take_payment'),
      ('public.payment_voucher_approve(uuid)', 'payment_voucher_debit_note_allocations'),
      ('public.payment_voucher_approve(uuid)', 'separation_of_duties'),
      ('public.payment_voucher_document(uuid)', '''debit_notes'''),
      ('public.payment_voucher_register()', 'payment_voucher_debit_note_allocations'),
      ('public.fin_ap_aging(date)', '''debit_note''::text'),
      ('public.supplier_credit_note_confirm(uuid)', '''PCN'''),
      ('public._supplier_note_followup_figures(uuid)', 'supplier_debit_notes'),
      ('public.supplier_note_followup_document(uuid)', 'supplier_debit_notes')) t(fn, needle) loop
    if position(r.needle in pg_get_functiondef(r.fn::regprocedure)) = 0 then
      raise exception '0681 sanity: % does not hold %', r.fn, r.needle;
    end if;
  end loop;
  if position('''SCN''' in pg_get_functiondef('public.supplier_credit_note_confirm(uuid)'::regprocedure)) > 0 then
    raise exception '0681 sanity: a supplier credit note is still numbered SCN';
  end if;

  -- 0570 / 0647: every key onto the chart follows a renumbered account.
  select string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ')
    into v_left
    from pg_constraint c
   where c.contype = 'f' and c.confrelid = 'public.gl_accounts'::regclass and c.confupdtype <> 'c';
  if v_left is not null then
    raise exception '0681 sanity: these keys do not follow a renumbered account: %', v_left;
  end if;
  if exists (select 1 from pg_trigger t
              where t.tgrelid in ('public.supplier_debit_notes'::regclass, 'public.supplier_debit_note_lines'::regclass)
                and not t.tgisinternal) then
    raise exception '0681 sanity: a debit note table has a trigger that could refuse a renumber; give it 0570''s allowance';
  end if;

  -- Written only through the doors; the internal arithmetic is not callable.
  if has_table_privilege('authenticated', 'public.supplier_debit_notes', 'insert')
     or has_table_privilege('authenticated', 'public.supplier_debit_note_lines', 'update')
     or has_table_privilege('authenticated', 'public.payment_voucher_debit_note_allocations', 'insert') then
    raise exception '0681 sanity: a debit note can be written around its doors';
  end if;
  if has_function_privilege('authenticated', 'public.supplier_debit_open(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.ap_debit_note_paid(uuid)', 'execute')
     or has_function_privilege('anon', 'public.supplier_debit_note_register()', 'execute')
     or not has_function_privilege('authenticated', 'public.ap_outstanding(uuid)', 'execute') then
    raise exception '0681 sanity: a door or helper has the wrong callers';
  end if;
end
$sanity$;

commit;
