-- =============================================================================
-- 0645_staff_ask_finance_to_pay_with_the_bill.sql
-- =============================================================================
-- WHAT WAS MISSING
--   A member of staff who needs a bill paid (a landlord, a repairman, a booth)
--   had no door: they sent the bill on WhatsApp, Finance keyed a voucher from
--   it, and nobody could see where it stood. Chew (Finance) ruled on
--   2026-10-03 (docs/finance/MASTER.md §3.3): staff with permission raise a
--   request with the bill; Finance answers it with a voucher or a bill; the
--   requester sees which stage it has reached. The boss sets the permission.
--
-- WHAT THIS ADDS
--   · finance_request_grants: who may ask. One live grant per person, set and
--     taken back only by the boss (the principal, a real person), each act
--     kept. Finance and the principal may always ask. Today only Operation
--     staff can be granted: they are the staff the Finance pages admit (App
--     routes /finance/* to finance, principal and operation).
--   · payment_requests: the requester's half of a payment — who to pay, how
--     much, by when, what for, the payee's bank details and the bill's own
--     number and date. Its number is drawn like every formal document
--     (PRQ, MASTER §6.1). Status records only what no document can say:
--       submitted · answered (by ONE voucher or ONE bill) · returned · withdrawn
--     Where the money stands is read from the answering document on every
--     read, never stored, so the request can never disagree with the money.
--   · payment_request_files: the bill. A request is answered only once it
--     carries one (Houzs: 「申请一定要有」; Chew: "with the bill").
--   · payment_request_events: what happened, by whom and when.
--   · The doors: payment_request_save (raise, or change while waiting or
--     returned — a returned request goes back to Finance), _withdraw,
--     _return (Finance, with a note), _answer (Finance links the voucher or
--     bill it made), _file_add; the readers _register, _document, _me; and
--     finance_request_grant_list / _set for the boss.
--
-- RLS — NEW tables and a NEW bucket only; no existing policy changes:
--   · The four tables: RLS on, writes revoked, SELECT granted, one read policy
--     each: Finance and the principal (gl_may_read) read every request; a
--     requester reads their own. Grants: Finance and the principal, and the
--     person their own.
--   · Storage: a NEW private bucket `payment-request-files` (PDF/JPEG/PNG/WebP,
--     20 MB) with two NEW policies on storage.objects, only in that bucket:
--     select for whoever may read the request, insert for whoever may attach
--     to it now. No update and no delete: a bill is evidence. The payables
--     bucket (`ap-documents`, 0477) stays Finance's alone; this one exists so
--     a requester can upload without being given Finance's files.
-- DATA: none. DR/CR: none — the voucher or bill that answers posts as always.
-- =============================================================================

begin;

-- ── 1 · who may ask ─────────────────────────────────────────────────────────
create table public.finance_request_grants (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.app_users(id),
  granted_by  uuid references public.app_users(id),
  granted_at  timestamptz not null default now(),
  revoked_by  uuid references public.app_users(id),
  revoked_at  timestamptz
);
create unique index finance_request_grants_one_live
  on public.finance_request_grants (user_id) where revoked_at is null;
comment on table public.finance_request_grants is
  '0645 · Chew 2026-10-03 (Finance MASTER §3.3): who may ask Finance to pay a bill. One live grant per person; set and taken back by the boss only; every grant kept.';

alter table public.finance_request_grants enable row level security;
revoke all on public.finance_request_grants from anon, authenticated;
grant select on public.finance_request_grants to authenticated;
create policy finance_request_grants_read on public.finance_request_grants
  for select using ((select public.gl_may_read()) or user_id = (select auth.uid()));

-- May this person raise a payment request? Finance and the principal always;
-- anyone else needs a live grant and an active account.
create or replace function public.finance_may_request_payment(p_user_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce((
    select u.status = 'active'
       and (u.role::text in ('finance', 'principal')
            or exists (select 1 from public.finance_request_grants g
                        where g.user_id = u.id and g.revoked_at is null))
      from public.app_users u
     where u.id = coalesce(p_user_id, auth.uid())), false)
$fn$;
revoke all on function public.finance_may_request_payment(uuid) from public, anon;
grant execute on function public.finance_may_request_payment(uuid) to authenticated;

-- ── 2 · the request ─────────────────────────────────────────────────────────
create table public.payment_requests (
  id                  uuid primary key default gen_random_uuid(),
  request_no          text not null unique,
  requested_by        uuid not null references public.app_users(id),
  payee_name          text not null check (payee_name ~ '[^[:space:]]' and length(btrim(payee_name)) <= 120),
  amount              numeric(12,2) not null check (amount > 0),
  pay_by              date,
  purpose             text not null check (purpose ~ '[^[:space:]]' and length(btrim(purpose)) <= 300),
  note                text check (note is null or length(note) <= 2000),
  bank_name           text check (bank_name is null or length(bank_name) <= 80),
  bank_account_no     text check (bank_account_no is null or length(bank_account_no) <= 40),
  bank_account_holder text check (bank_account_holder is null or length(bank_account_holder) <= 120),
  bill_no             text check (bill_no is null or length(bill_no) <= 80),
  bill_date           date,
  status              text not null default 'submitted'
                        check (status in ('submitted', 'answered', 'returned', 'withdrawn')),
  voucher_id          uuid references public.payment_vouchers(id),
  bill_id             uuid references public.supplier_bills(id),
  return_note         text,
  decided_by          uuid references public.app_users(id),
  decided_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint payment_requests_answered_names_one
    check (status <> 'answered' or ((voucher_id is null) <> (bill_id is null))),
  constraint payment_requests_return_says_why
    check (status <> 'returned' or coalesce(return_note, '') ~ '[^[:space:]]')
);
create index payment_requests_requester on public.payment_requests (requested_by, created_at desc);
create index payment_requests_voucher on public.payment_requests (voucher_id) where voucher_id is not null;
create index payment_requests_bill on public.payment_requests (bill_id) where bill_id is not null;
comment on table public.payment_requests is
  '0645 · Chew 2026-10-03 (Finance MASTER §3.3): staff ask Finance to pay a bill. Finance answers with one voucher or one bill; where the money stands is read from that document, never stored. Written only by its functions.';

create table public.payment_request_files (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.payment_requests(id),
  storage_path text not null unique,
  file_name    text not null check (file_name ~ '[^[:space:]]' and length(file_name) <= 200),
  mime_type    text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes   bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  uploaded_by  uuid references public.app_users(id),
  uploaded_at  timestamptz not null default now()
);
create index payment_request_files_request on public.payment_request_files (request_id);

create table public.payment_request_events (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.payment_requests(id),
  action     text not null check (action in ('submitted', 'edited', 'resubmitted', 'withdrawn', 'returned', 'answered', 'file_added')),
  note       text,
  actor      uuid references public.app_users(id),
  at         timestamptz not null default now()
);
create index payment_request_events_request on public.payment_request_events (request_id, at);

alter table public.payment_requests       enable row level security;
alter table public.payment_request_files  enable row level security;
alter table public.payment_request_events enable row level security;
revoke all on public.payment_requests, public.payment_request_files, public.payment_request_events from anon, authenticated;
grant select on public.payment_requests, public.payment_request_files, public.payment_request_events to authenticated;

-- Who may read a request: Finance and the principal, and the person who asked.
create or replace function public.payment_request_may_read(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(public.gl_may_read(), false)
      or exists (select 1 from public.payment_requests r
                  where r.id = p_request_id and r.requested_by = auth.uid())
$fn$;

-- Who may attach a file now: the person who asked, while it waits for Finance
-- or is returned to them; Finance, until it is withdrawn.
create or replace function public.payment_request_may_attach(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.payment_requests r
     where r.id = p_request_id
       and ((r.requested_by = auth.uid() and r.status in ('submitted', 'returned')
             and public.finance_may_request_payment(auth.uid()))
            or (coalesce(public.app_role()::text in ('finance', 'principal'), false)
                and r.status <> 'withdrawn')))
$fn$;

-- The request a stored file belongs to: `<request id>/<file>.<ext>`.
create or replace function public.payment_request_id_of_path(p_name text)
returns uuid
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select case when split_part(coalesce(p_name, ''), '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_name, '/', 1)::uuid end
$fn$;

revoke all on function public.payment_request_may_read(uuid), public.payment_request_may_attach(uuid),
                       public.payment_request_id_of_path(text) from public, anon;
grant execute on function public.payment_request_may_read(uuid), public.payment_request_may_attach(uuid),
                          public.payment_request_id_of_path(text) to authenticated;

create policy payment_requests_read on public.payment_requests
  for select using ((select public.gl_may_read()) or requested_by = (select auth.uid()));
create policy payment_request_files_read on public.payment_request_files
  for select using (public.payment_request_may_read(request_id));
create policy payment_request_events_read on public.payment_request_events
  for select using (public.payment_request_may_read(request_id));

-- ── 3 · the bucket ──────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-request-files', 'payment-request-files', false, 20971520,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists payment_request_files_select on storage.objects;
drop policy if exists payment_request_files_insert on storage.objects;
create policy payment_request_files_select on storage.objects
  for select to authenticated
  using (bucket_id = 'payment-request-files'
         and public.payment_request_may_read(public.payment_request_id_of_path(name)));
create policy payment_request_files_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'payment-request-files'
              and public.payment_request_may_attach(public.payment_request_id_of_path(name)));

-- ── 4 · the doors ───────────────────────────────────────────────────────────
create or replace function public._payment_request_event(p_request_id uuid, p_action text, p_note text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $fn$
  insert into public.payment_request_events (request_id, action, note, actor)
  values (p_request_id, p_action, nullif(btrim(coalesce(p_note, '')), ''),
          (select u.id from public.app_users u where u.id = auth.uid()))
$fn$;
revoke all on function public._payment_request_event(uuid, text, text) from public, anon, authenticated;

-- Raise a request, or change one that waits for Finance or was returned (a
-- returned request goes back to Finance). Only the person who asked changes it.
create or replace function public.payment_request_save(
  p_request_id          uuid,
  p_payee_name          text,
  p_amount              numeric,
  p_purpose             text,
  p_pay_by              date default null,
  p_note                text default null,
  p_bank_name           text default null,
  p_bank_account_no     text default null,
  p_bank_account_holder text default null,
  p_bill_no             text default null,
  p_bill_date           date default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_me  uuid := (select u.id from public.app_users u where u.id = auth.uid());
  v_req public.payment_requests%rowtype;
  v_id  uuid;
  v_today date := timezone('Asia/Kuala_Lumpur', now())::date;
begin
  if v_me is null or not public.finance_may_request_payment(v_me) then
    raise exception 'Only staff the boss has allowed can ask Finance to pay.'
      using errcode = '42501', detail = 'not_allowed_to_request';
  end if;
  if coalesce(p_payee_name, '') !~ '[^[:space:]]' then
    raise exception 'Say who is to be paid.' using errcode = 'P0001', detail = 'payee_missing';
  end if;
  if length(btrim(p_payee_name)) > 120 then
    raise exception 'The payee''s name is too long.' using errcode = 'P0001', detail = 'payee_too_long';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'The amount must be more than RM 0.00.' using errcode = 'P0001', detail = 'amount_invalid';
  end if;
  if round(p_amount, 2) <> p_amount then
    raise exception 'Type the amount in ringgit and sen, like 1250.00.' using errcode = 'P0001', detail = 'amount_invalid';
  end if;
  if coalesce(p_purpose, '') !~ '[^[:space:]]' then
    raise exception 'Say what the payment is for.' using errcode = 'P0001', detail = 'purpose_missing';
  end if;
  if length(btrim(p_purpose)) > 300 then
    raise exception 'Keep what it is for to 300 characters.' using errcode = 'P0001', detail = 'purpose_too_long';
  end if;
  if length(coalesce(p_note, '')) > 2000 then
    raise exception 'Keep the note to 2,000 characters.' using errcode = 'P0001', detail = 'note_too_long';
  end if;
  if length(btrim(coalesce(p_bank_name, ''))) > 80 or length(btrim(coalesce(p_bank_account_no, ''))) > 40
     or length(btrim(coalesce(p_bank_account_holder, ''))) > 120 or length(btrim(coalesce(p_bill_no, ''))) > 80 then
    raise exception 'A bank or bill detail is too long.' using errcode = 'P0001', detail = 'detail_too_long';
  end if;
  if p_bank_account_no is not null and btrim(p_bank_account_no) <> '' and btrim(p_bank_account_no) !~ '^[0-9][0-9 -]{4,38}[0-9]$' then
    raise exception 'An account number is digits only.' using errcode = 'P0001', detail = 'account_no_invalid';
  end if;

  if p_request_id is null then
    v_id := gen_random_uuid();
    insert into public.payment_requests
      (id, request_no, requested_by, payee_name, amount, pay_by, purpose, note,
       bank_name, bank_account_no, bank_account_holder, bill_no, bill_date)
    values
      (v_id, public.allocate_formal_document_code('PRQ', v_id::text, v_today), v_me,
       btrim(p_payee_name), p_amount, p_pay_by, btrim(p_purpose), nullif(btrim(coalesce(p_note, '')), ''),
       nullif(btrim(coalesce(p_bank_name, '')), ''), nullif(btrim(coalesce(p_bank_account_no, '')), ''),
       nullif(btrim(coalesce(p_bank_account_holder, '')), ''), nullif(btrim(coalesce(p_bill_no, '')), ''), p_bill_date);
    perform public._payment_request_event(v_id, 'submitted', null);
    return v_id;
  end if;

  select * into v_req from public.payment_requests where id = p_request_id for update;
  if not found or (v_req.requested_by <> v_me and not coalesce(public.gl_may_read(), false)) then
    raise exception 'That payment request is not one you can open.' using errcode = 'P0002', detail = 'request_missing';
  end if;
  if v_req.requested_by <> v_me then
    raise exception 'Only the person who asked changes a request. Finance returns it instead.'
      using errcode = '42501', detail = 'not_yours';
  end if;
  if v_req.status not in ('submitted', 'returned') then
    raise exception 'Payment request % is % and can no longer change.', v_req.request_no,
      case v_req.status when 'answered' then 'answered by Finance' else 'withdrawn' end
      using errcode = 'P0001', detail = 'request_locked';
  end if;

  update public.payment_requests
     set payee_name = btrim(p_payee_name), amount = p_amount, pay_by = p_pay_by, purpose = btrim(p_purpose),
         note = nullif(btrim(coalesce(p_note, '')), ''),
         bank_name = nullif(btrim(coalesce(p_bank_name, '')), ''),
         bank_account_no = nullif(btrim(coalesce(p_bank_account_no, '')), ''),
         bank_account_holder = nullif(btrim(coalesce(p_bank_account_holder, '')), ''),
         bill_no = nullif(btrim(coalesce(p_bill_no, '')), ''), bill_date = p_bill_date,
         status = 'submitted', updated_at = now()
   where id = p_request_id;
  perform public._payment_request_event(p_request_id,
    case when v_req.status = 'returned' then 'resubmitted' else 'edited' end, null);
  return p_request_id;
end;
$fn$;

create or replace function public.payment_request_withdraw(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_req public.payment_requests%rowtype;
begin
  select * into v_req from public.payment_requests where id = p_request_id for update;
  if not found or not public.payment_request_may_read(p_request_id) then
    raise exception 'That payment request is not one you can open.' using errcode = 'P0002', detail = 'request_missing';
  end if;
  if v_req.requested_by <> auth.uid() then
    raise exception 'Only the person who asked can withdraw a request.' using errcode = '42501', detail = 'not_yours';
  end if;
  if v_req.status = 'withdrawn' then
    return p_request_id;
  end if;
  if v_req.status = 'answered' then
    raise exception 'Finance has answered % already. Ask Finance to cancel the payment instead.', v_req.request_no
      using errcode = 'P0001', detail = 'request_answered';
  end if;
  update public.payment_requests set status = 'withdrawn', updated_at = now() where id = p_request_id;
  perform public._payment_request_event(p_request_id, 'withdrawn', null);
  return p_request_id;
end;
$fn$;

-- The answering document as it stands: is it still alive?
create or replace function public._payment_request_answer_cancelled(p_req public.payment_requests)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select case
           when p_req.voucher_id is not null then
             coalesce((select v.status = 'cancelled' from public.payment_vouchers v where v.id = p_req.voucher_id), true)
           when p_req.bill_id is not null then
             coalesce((select b.status = 'cancelled' from public.supplier_bills b where b.id = p_req.bill_id), true)
           else false
         end
$fn$;
revoke all on function public._payment_request_answer_cancelled(public.payment_requests) from public, anon, authenticated;

-- Finance sends a request back to the person who asked, with a note they read.
create or replace function public.payment_request_return(p_request_id uuid, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_req public.payment_requests%rowtype;
begin
  if not coalesce(public.app_role()::text in ('finance', 'principal'), false) then
    raise exception 'Only Finance returns a payment request.' using errcode = '42501', detail = 'not_finance';
  end if;
  if coalesce(p_note, '') !~ '[^[:space:]]' then
    raise exception 'Say why it goes back. The person who asked reads it.' using errcode = 'P0001', detail = 'note_missing';
  end if;
  select * into v_req from public.payment_requests where id = p_request_id for update;
  if not found then
    raise exception 'That payment request does not exist.' using errcode = 'P0002', detail = 'request_missing';
  end if;
  if not (v_req.status = 'submitted' or (v_req.status = 'answered' and public._payment_request_answer_cancelled(v_req))) then
    raise exception 'Payment request % is % and cannot be returned.', v_req.request_no,
      case v_req.status when 'answered' then 'answered by a document that is still live' else v_req.status end
      using errcode = 'P0001', detail = 'request_not_returnable';
  end if;
  update public.payment_requests
     set status = 'returned', return_note = btrim(p_note), decided_by = auth.uid(), decided_at = now(), updated_at = now()
   where id = p_request_id;
  perform public._payment_request_event(p_request_id, 'returned', btrim(p_note));
  return p_request_id;
end;
$fn$;

-- Finance links the voucher or bill it made for the request. One request, one
-- live answer; one document answers one request.
create or replace function public.payment_request_answer(p_request_id uuid, p_voucher_id uuid default null, p_bill_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_req   public.payment_requests%rowtype;
  v_doc   text;
  v_state text;
  v_other text;
begin
  if not coalesce(public.app_role()::text in ('finance', 'principal'), false) then
    raise exception 'Only Finance answers a payment request.' using errcode = '42501', detail = 'not_finance';
  end if;
  if (p_voucher_id is null) = (p_bill_id is null) then
    raise exception 'Answer with one payment voucher or one bill.' using errcode = '22023', detail = 'answer_needs_one';
  end if;
  select * into v_req from public.payment_requests where id = p_request_id for update;
  if not found then
    raise exception 'That payment request does not exist.' using errcode = 'P0002', detail = 'request_missing';
  end if;
  if v_req.status in ('withdrawn', 'returned') then
    raise exception 'Payment request % was % and takes no payment until it is sent again.', v_req.request_no,
      case v_req.status when 'withdrawn' then 'withdrawn by the person who asked' else 'returned' end
      using errcode = 'P0001', detail = 'request_closed';
  end if;
  if v_req.status = 'answered' and not public._payment_request_answer_cancelled(v_req) then
    raise exception 'Payment request % is answered already.', v_req.request_no
      using errcode = 'P0001', detail = 'request_answered';
  end if;
  if not exists (select 1 from public.payment_request_files f where f.request_id = p_request_id) then
    raise exception 'Payment request % has no bill attached. Return it so the bill is attached.', v_req.request_no
      using errcode = 'P0001', detail = 'request_no_bill';
  end if;

  if p_voucher_id is not null then
    select coalesce(v.voucher_no, 'a draft voucher'), v.status into v_doc, v_state
      from public.payment_vouchers v where v.id = p_voucher_id;
  else
    select coalesce(b.bill_no, 'a draft bill'), b.status into v_doc, v_state
      from public.supplier_bills b where b.id = p_bill_id;
  end if;
  if v_state is null then
    raise exception 'That voucher or bill does not exist.' using errcode = 'P0002', detail = 'document_missing';
  end if;
  if v_state = 'cancelled' then
    raise exception 'A cancelled document cannot answer a request.' using errcode = 'P0001', detail = 'document_cancelled';
  end if;
  select r.request_no into v_other
    from public.payment_requests r
   where r.id <> p_request_id and r.status = 'answered'
     and ((p_voucher_id is not null and r.voucher_id = p_voucher_id) or (p_bill_id is not null and r.bill_id = p_bill_id))
   limit 1;
  if v_other is not null then
    raise exception '% answers payment request % already.', initcap(v_doc), v_other
      using errcode = 'P0001', detail = 'document_answers_another';
  end if;

  update public.payment_requests
     set status = 'answered', voucher_id = p_voucher_id, bill_id = p_bill_id,
         decided_by = auth.uid(), decided_at = now(), updated_at = now()
   where id = p_request_id;
  perform public._payment_request_event(p_request_id, 'answered', v_doc);
  return p_request_id;
end;
$fn$;

-- After the browser uploaded: record the file. The path must be this request's
-- and the object really in the bucket.
create or replace function public.payment_request_file_add(
  p_request_id uuid, p_storage_path text, p_file_name text, p_mime_type text, p_size_bytes bigint)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_path text := btrim(coalesce(p_storage_path, ''));
  v_id   uuid;
begin
  if not public.payment_request_may_attach(p_request_id) then
    raise exception 'This payment request takes no file from you now.' using errcode = '42501', detail = 'may_not_attach';
  end if;
  if v_path not like p_request_id::text || '/%' then
    raise exception 'That file was uploaded for a different request.' using errcode = 'P0001', detail = 'file_path_mismatch';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'payment-request-files' and o.name = v_path) then
    raise exception 'The file has not finished uploading. Try again.' using errcode = 'P0001', detail = 'file_not_uploaded';
  end if;
  insert into public.payment_request_files (request_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
  values (p_request_id, v_path, btrim(p_file_name), p_mime_type, p_size_bytes,
          (select u.id from public.app_users u where u.id = auth.uid()))
  returning id into v_id;
  perform public._payment_request_event(p_request_id, 'file_added', btrim(p_file_name));
  return v_id;
end;
$fn$;

-- ── 5 · the readers ─────────────────────────────────────────────────────────
-- The facts a stage is read from: the answering document as it stands.
create or replace function public._payment_request_row(p_req public.payment_requests)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select jsonb_build_object(
    'id', p_req.id, 'request_no', p_req.request_no, 'status', p_req.status,
    'requested_by', p_req.requested_by, 'requested_by_name', (select u.name from public.app_users u where u.id = p_req.requested_by),
    'payee_name', p_req.payee_name, 'amount', p_req.amount, 'pay_by', p_req.pay_by, 'purpose', p_req.purpose,
    'note', p_req.note, 'bank_name', p_req.bank_name, 'bank_account_no', p_req.bank_account_no,
    'bank_account_holder', p_req.bank_account_holder, 'bill_no', p_req.bill_no, 'bill_date', p_req.bill_date,
    'return_note', p_req.return_note, 'decided_at', p_req.decided_at,
    'decided_by_name', (select u.name from public.app_users u where u.id = p_req.decided_by),
    'created_at', p_req.created_at, 'updated_at', p_req.updated_at,
    'file_count', (select count(*) from public.payment_request_files f where f.request_id = p_req.id)::integer,
    'voucher', (select jsonb_build_object('id', v.id, 'voucher_no', v.voucher_no, 'status', v.status, 'voucher_date', v.voucher_date)
                  from public.payment_vouchers v where v.id = p_req.voucher_id),
    'bill', (select jsonb_build_object('id', b.id, 'bill_no', b.bill_no, 'status', b.status, 'total', b.total_amount,
                                       'paid', coalesce((select bp.paid from public.ap_bill_paid(b.id) bp), 0))
               from public.supplier_bills b where b.id = p_req.bill_id))
$fn$;
revoke all on function public._payment_request_row(public.payment_requests) from public, anon, authenticated;

-- Every request Finance may see, or the caller's own.
create or replace function public.payment_request_register(p_all boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_finance boolean := coalesce(public.gl_may_read(), false);
begin
  if auth.uid() is null or not (v_finance or public.finance_may_request_payment(auth.uid())
                                or exists (select 1 from public.payment_requests r where r.requested_by = auth.uid())) then
    raise exception 'payment requests are internal' using errcode = '42501', detail = 'not_internal';
  end if;
  return coalesce((
    select jsonb_agg(public._payment_request_row(r) order by r.created_at desc)
      from public.payment_requests r
     where (p_all and v_finance) or r.requested_by = auth.uid()), '[]'::jsonb);
end;
$fn$;

create or replace function public.payment_request_document(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_req     public.payment_requests%rowtype;
  v_finance boolean := coalesce(public.app_role()::text in ('finance', 'principal'), false);
  v_mine    boolean;
  v_dead    boolean;
  v_files   integer;
begin
  select * into v_req from public.payment_requests where id = p_request_id;
  if not found or not public.payment_request_may_read(p_request_id) then
    raise exception 'That payment request is not one you can open.' using errcode = 'P0002', detail = 'request_missing';
  end if;
  v_mine  := v_req.requested_by = auth.uid();
  v_dead  := v_req.status = 'answered' and public._payment_request_answer_cancelled(v_req);
  v_files := (select count(*) from public.payment_request_files f where f.request_id = p_request_id);
  return jsonb_build_object(
    'request', public._payment_request_row(v_req),
    'files', coalesce((
      select jsonb_agg(to_jsonb(f) order by f.uploaded_at) from (
        select fl.id, fl.file_name, fl.mime_type, fl.size_bytes, fl.storage_path, fl.uploaded_at, u.name as uploaded_by_name
          from public.payment_request_files fl left join public.app_users u on u.id = fl.uploaded_by
         where fl.request_id = p_request_id) f), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(to_jsonb(ev) order by ev.at) from (
        select e.action, e.note, e.at, u.name as actor_name
          from public.payment_request_events e left join public.app_users u on u.id = e.actor
         where e.request_id = p_request_id) ev), '[]'::jsonb),
    'finance', v_finance,
    'can', jsonb_build_object(
      'edit',     v_mine and v_req.status in ('submitted', 'returned') and public.finance_may_request_payment(auth.uid()),
      'withdraw', v_mine and v_req.status in ('submitted', 'returned'),
      'add_file', public.payment_request_may_attach(p_request_id),
      'return',   v_finance and (v_req.status = 'submitted' or v_dead),
      'answer',   v_finance and (v_req.status = 'submitted' or v_dead) and v_files > 0)
  );
end;
$fn$;

-- What the menu and the page need to know about the caller.
create or replace function public.payment_request_me()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select jsonb_build_object(
    'may_request', public.finance_may_request_payment(auth.uid()),
    'finance', coalesce(public.app_role()::text in ('finance', 'principal'), false),
    'boss', coalesce(public.app_role()::text = 'principal' and public.workspace_is_person(auth.uid()), false))
$fn$;

-- ── 6 · the boss sets who may ask ───────────────────────────────────────────
create or replace function public.finance_request_grant_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not coalesce(public.gl_may_read(), false) then
    raise exception 'finance settings are internal' using errcode = '42501', detail = 'not_internal';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.name) from (
      select u.id as user_id, u.name, u.role::text as role, g.granted_at, gb.name as granted_by_name,
             (g.id is not null) as allowed
        from public.app_users u
        left join public.finance_request_grants g on g.user_id = u.id and g.revoked_at is null
        left join public.app_users gb on gb.id = g.granted_by
       where u.status = 'active' and u.role::text = 'operation' and coalesce(u.is_person, true)) x), '[]'::jsonb);
end;
$fn$;

create or replace function public.finance_request_grant_set(p_user_id uuid, p_allowed boolean)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_me   uuid := (select u.id from public.app_users u where u.id = auth.uid());
  v_user public.app_users%rowtype;
  v_id   uuid;
begin
  if v_me is null or not coalesce(public.app_role()::text = 'principal' and public.workspace_is_person(v_me), false) then
    raise exception 'Only the boss decides who may ask Finance to pay.' using errcode = '42501', detail = 'not_the_boss';
  end if;
  select * into v_user from public.app_users where id = p_user_id;
  if not found or v_user.status <> 'active' or v_user.role::text <> 'operation' or not coalesce(v_user.is_person, true) then
    raise exception 'Only an active Operation staff member can be allowed to ask.' using errcode = 'P0001', detail = 'not_grantable';
  end if;
  perform 1 from public.app_users where id = p_user_id for update;  -- one change for one person at a time
  select g.id into v_id from public.finance_request_grants g where g.user_id = p_user_id and g.revoked_at is null;
  if p_allowed and v_id is null then
    insert into public.finance_request_grants (user_id, granted_by) values (p_user_id, v_me) returning id into v_id;
  elsif not p_allowed and v_id is not null then
    update public.finance_request_grants set revoked_by = v_me, revoked_at = now() where id = v_id;
  end if;
  return v_id;
end;
$fn$;

-- ── 7 · grants ──────────────────────────────────────────────────────────────
revoke all on function public.payment_request_save(uuid, text, numeric, text, date, text, text, text, text, text, date) from public, anon;
revoke all on function public.payment_request_withdraw(uuid) from public, anon;
revoke all on function public.payment_request_return(uuid, text) from public, anon;
revoke all on function public.payment_request_answer(uuid, uuid, uuid) from public, anon;
revoke all on function public.payment_request_file_add(uuid, text, text, text, bigint) from public, anon;
revoke all on function public.payment_request_register(boolean) from public, anon;
revoke all on function public.payment_request_document(uuid) from public, anon;
revoke all on function public.payment_request_me() from public, anon;
revoke all on function public.finance_request_grant_list() from public, anon;
revoke all on function public.finance_request_grant_set(uuid, boolean) from public, anon;
grant execute on function public.payment_request_save(uuid, text, numeric, text, date, text, text, text, text, text, date) to authenticated;
grant execute on function public.payment_request_withdraw(uuid) to authenticated;
grant execute on function public.payment_request_return(uuid, text) to authenticated;
grant execute on function public.payment_request_answer(uuid, uuid, uuid) to authenticated;
grant execute on function public.payment_request_file_add(uuid, text, text, text, bigint) to authenticated;
grant execute on function public.payment_request_register(boolean) to authenticated;
grant execute on function public.payment_request_document(uuid) to authenticated;
grant execute on function public.payment_request_me() to authenticated;
grant execute on function public.finance_request_grant_list() to authenticated;
grant execute on function public.finance_request_grant_set(uuid, boolean) to authenticated;

-- ── 8 · sanity ──────────────────────────────────────────────────────────────
do $sanity$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and (p.proname like 'payment_request%' or p.proname like 'finance_request_grant%'
                     or p.proname in ('finance_may_request_payment', '_payment_request_event', '_payment_request_row',
                                      '_payment_request_answer_cancelled'))
                and p.proname <> 'payment_request_id_of_path'
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0645 sanity: a payment request function lost security definer or its search_path';
  end if;
  if has_function_privilege('authenticated', 'public._payment_request_event(uuid, text, text)', 'execute')
     or has_function_privilege('authenticated', 'public._payment_request_row(public.payment_requests)', 'execute') then
    raise exception '0645 sanity: an internal helper is callable from outside';
  end if;
  if not exists (select 1 from storage.buckets where id = 'payment-request-files' and public = false) then
    raise exception '0645 sanity: the payment request bucket is missing or public';
  end if;
  -- fail closed: a caller who is not signed in gets an error, never rows.
  begin
    perform public.payment_request_register(false);
    raise exception '0645 sanity: an anonymous caller was not refused';
  exception
    when insufficient_privilege then null;
  end;
end
$sanity$;

commit;
