-- 0572 . A CARD SETTLEMENT FILE IS KEPT WHOLE AND ITS ROWS ARE MATCHED
--
-- Owner, 22 Sep 2026: "card settlement will be matched by daily total per
-- machine, not sale by sale. GHL match by amount and date, if cant match, prep
-- a section that allows staff to check through the suggested matching (+- 3 to
-- 7 days), if correct approve, if no adjust manually. the others match by auth
-- code. and in case of potential auth code typo, the suggested matching,
-- correct then approve wrong then adjust should be available as well"
--
-- WHAT THIS ADDS
--   1. card_settlement_files: one imported file, its whole text kept. Maybank
--      prints its payout once per merchant (the summary block), so its gross,
--      fee and net are kept on the file.
--   2. card_settlement_lines: one sale row of a file, the whole line and every
--      column kept (masked card number included), plus the few values the
--      match reads. payment_id is the recorded card payment it matches.
--      day_date is the day the row is paid in: the payout date for Public Bank
--      and Maybank, the sale date for GHL. The GHL file carries no settlement
--      date; its payout_date is the statement date in the file name when the
--      name has one, and is left empty when it does not.
--   3. card_settlement_payouts: the one link from a settled day to its card
--      payout money move. At most one link per day is live (unique index);
--      a link whose move was cancelled or reversed is released when the day
--      is prepared again.
--   4. card_settlement_import: Finance imports one parsed file. A refund, void
--      or chargeback row is refused: no sample had one, so its sign is not
--      known. A row already imported from another file is skipped. A row for a
--      day whose payout is already prepared is refused. After every import
--      the match rule runs again over every row, of every file, that is open
--      or was matched automatically, so the result does not depend on the
--      order the files came in: a row is matched only when the pairing is
--      unique from both sides (the row has one candidate, and that payment is
--      the candidate of no other open row). An automatic match whose payment
--      has become contested is released to open; a pairing that has become
--      unique is matched. A payment that a Public Bank or Maybank row may own
--      (its approval code, the code with another amount, or a likely typo of
--      it) is contested for GHL: only suggested there. Never changed here: a
--      match made by staff (approved suggestion or by hand), a row staff took
--      the match off (kept_open), and every row of a day whose payout is
--      prepared or approved (frozen).
--   5. card_settlement_review: the days (one payout per machine, or per
--      merchant for Maybank, per day), their rows and each open row's
--      suggestions. Read only. A day's payout is read from the link in 3.
--      Each day also lists the card payouts not linked to any day that left a
--      card account a card settlement route serves on the day's date (a payout
--      made on Money moves before this door was the only one).
--   6. card_settlement_match: staff approve a suggestion or pick the payment by
--      hand; a null payment takes the match off and keeps the row open.
--      Refused once the day's payout is prepared or approved.
--   7. card_settlement_payout_prepare: Approve day. Prepares the CARD_PAYOUT
--      move through gl_money_move_create with the file's net and fee and a
--      fixed reference, and links it to the day in the same transaction. An
--      idempotency key returns only this day's own live payout; any other use
--      of a key is refused, and the move made is checked to be this day's.
--   8. order_payments_paid_on_idx: the candidate search reads payments by
--      date first.
--   9. gl_money_move_create (rebuilt from pg_proc, every guard kept): a card
--      payout from a holding account that a card settlement route serves
--      (0541) has one door, card_settlement_payout_prepare, which names the
--      day it pays in the transaction-local setting carres.card_payout_day.
--      Any other card payout from such an account is refused. A card payout
--      from a holding account no route serves goes through as before.
--
-- WHAT IT DOES NOT DO
--   Nothing here writes the ledger or edits a payment. A typed approval code
--   that was wrong stays as it was typed; the match is only a link. The
--   payout posts only when the finance approver approves that money move
--   (0529). gl_money_moves gains no column, constraint or trigger.
--   ASSUMPTION: Carres records no card company on a holding account, so "a
--   card account whose file Carres imports" is read as "a holding account a
--   card settlement route serves". A route set for a card company whose file
--   is not imported (Hong Leong, a secured PDF) closes Money moves to its
--   payouts too.
--   Carres records no card machine on a payment (order_payments has no
--   terminal, MID, TID or acquirer), so the daily total per machine is the
--   card company's figure; Carres's side is the sum of the payments matched
--   to that day's rows.
--
-- RLS: three new tables, read by finance and principal (gl_may_read), written
--   only through the definer doors. No existing policy changes.
-- Section 6: no existing row is read for a backfill or written. DR/CR: none.

begin;

-- 1 . the files ---------------------------------------------------------------
create table public.card_settlement_files (
  id              uuid primary key default gen_random_uuid(),
  acquirer        text not null check (acquirer in ('PBB', 'GHL', 'MAYBANK')),
  file_name       text not null check (length(file_name) between 1 and 200),
  content         text not null,
  merchant_id     text,
  report_date     date,
  published_gross numeric(14,2),
  published_fee   numeric(14,2),
  published_net   numeric(14,2),
  imported_by     uuid not null references public.app_users(id),
  imported_at     timestamptz not null default now(),
  constraint card_settlement_files_maybank_totals check (
    acquirer <> 'MAYBANK'
    or (merchant_id is not null and report_date is not null and published_gross is not null
        and published_fee is not null and published_net is not null))
);

comment on table public.card_settlement_files is
  '0572: one card settlement file as it came from the card company, whole. Maybank keeps its per-merchant gross, fee and net here.';

create unique index card_settlement_files_same_file
  on public.card_settlement_files (acquirer, md5(content));
create unique index card_settlement_files_one_maybank_report
  on public.card_settlement_files (merchant_id, report_date) where acquirer = 'MAYBANK';

-- 2 . the rows ----------------------------------------------------------------
create table public.card_settlement_lines (
  id            uuid primary key default gen_random_uuid(),
  file_id       uuid not null references public.card_settlement_files(id),
  acquirer      text not null check (acquirer in ('PBB', 'GHL', 'MAYBANK')),
  line_no       integer not null check (line_no > 0),
  raw_line      text not null,
  fields        jsonb not null check (jsonb_typeof(fields) = 'object'),
  txn_date      date not null,
  payout_date   date,
  day_date      date not null generated always as (case when acquirer = 'GHL' then txn_date else payout_date end) stored,
  merchant_id   text,
  terminal_id   text,
  group_key     text not null,
  approval_code text,
  card_no       text,
  amount        numeric(12,2) not null check (amount > 0),
  net_amount    numeric(12,2),
  payment_id    uuid references public.order_payments(id),
  matched_how   text check (matched_how in ('approval_code', 'amount_and_date', 'suggestion', 'by_hand')),
  matched_by    uuid references public.app_users(id),
  matched_at    timestamptz,
  -- staff took the match off: the import never matches this row again
  kept_open     boolean not null default false,
  constraint card_settlement_lines_match_is_whole check (
    (payment_id is null) = (matched_how is null)
    and (payment_id is null) = (matched_by is null)
    and (payment_id is null) = (matched_at is null)),
  constraint card_settlement_lines_net_per_row check (acquirer = 'MAYBANK' or net_amount is not null),
  -- GHL alone prints no settlement date (the statement date may be in the file name).
  constraint card_settlement_lines_payout_date check (acquirer = 'GHL' or payout_date is not null)
);

comment on table public.card_settlement_lines is
  '0572: one sale row of a card settlement file: the whole line, every column (fields), and the recorded card payment it matches (payment_id). day_date is the payout date (Public Bank, Maybank) or the sale date (GHL).';

create unique index card_settlement_lines_same_line
  on public.card_settlement_lines (acquirer, md5(raw_line));
create unique index card_settlement_lines_one_payment
  on public.card_settlement_lines (payment_id) where payment_id is not null;
create index card_settlement_lines_file on public.card_settlement_lines (file_id);
create index card_settlement_lines_day on public.card_settlement_lines (acquirer, day_date, group_key);

-- 3 . the day's payout --------------------------------------------------------
create table public.card_settlement_payouts (
  id           uuid primary key default gen_random_uuid(),
  acquirer     text not null check (acquirer in ('PBB', 'GHL', 'MAYBANK')),
  day_date     date not null,
  group_key    text not null,
  move_id      uuid not null unique references public.gl_money_moves(id),
  prepared_by  uuid not null references public.app_users(id),
  prepared_at  timestamptz not null default now(),
  released_at  timestamptz
);

comment on table public.card_settlement_payouts is
  '0572: links a card settlement day (acquirer, day_date, group_key) to its CARD_PAYOUT money move. One live link per day; released_at is set when the move was cancelled or reversed and the day is prepared again.';

create unique index card_settlement_payouts_one_live_per_day
  on public.card_settlement_payouts (acquirer, day_date, group_key) where released_at is null;

alter table public.card_settlement_files enable row level security;
alter table public.card_settlement_lines enable row level security;
alter table public.card_settlement_payouts enable row level security;
revoke all on public.card_settlement_files, public.card_settlement_lines, public.card_settlement_payouts from anon, authenticated;
grant select on public.card_settlement_files, public.card_settlement_lines, public.card_settlement_payouts to authenticated;
create policy card_settlement_files_read_finance on public.card_settlement_files
  for select using ((select public.gl_may_read()));
create policy card_settlement_lines_read_finance on public.card_settlement_lines
  for select using ((select public.gl_may_read()));
create policy card_settlement_payouts_read_finance on public.card_settlement_payouts
  for select using ((select public.gl_may_read()));

-- 4 . payments by date ----------------------------------------------------------
create index if not exists order_payments_paid_on_idx on public.order_payments (paid_on);

-- 5 . text helpers --------------------------------------------------------------
-- Free text as stored: blank (0560's form) is null, otherwise without the
-- whitespace around it.
create or replace function public._card_text(p text)
returns text
language sql
immutable
as $fn$
  select case when coalesce(p, '') !~ '[^[:space:]]' then null
              else regexp_replace(p, '^[[:space:]]+|[[:space:]]+$', '', 'g') end
$fn$;

-- An approval code as the match reads it: letters and digits only, upper case.
create or replace function public._card_code(p text)
returns text
language sql
immutable
as $fn$
  select nullif(upper(regexp_replace(coalesce(p, ''), '[^[:alnum:]]', '', 'g')), '')
$fn$;

-- A likely typo: same length and one character different, or two
-- neighbouring characters swapped.
create or replace function public._card_code_near(a text, b text)
returns boolean
language sql
immutable
as $fn$
  select coalesce(
    a <> b and length(a) = length(b) and (
      (select count(*) from generate_series(1, length(a)) i
        where substr(a, i, 1) <> substr(b, i, 1)) = 1
      or exists (select 1 from generate_series(1, length(a) - 1) i
                  where overlay(a placing substr(a, i + 1, 1) || substr(a, i, 1) from i for 2) = b)),
    false)
$fn$;

revoke all on function public._card_text(text) from public, anon;
revoke all on function public._card_code(text) from public, anon;
revoke all on function public._card_code_near(text, text) from public, anon;

-- 6 . a day's live payout -------------------------------------------------------
-- Live = the linked move is prepared or approved (0529). A cancelled or
-- reversed move frees the day.
create or replace function public._card_settlement_live_payout(p_acquirer text, p_day date, p_group text)
returns uuid
language sql
stable
set search_path = public, pg_temp
as $fn$
  select m.id
    from public.card_settlement_payouts cp
    join public.gl_money_moves m on m.id = cp.move_id
   where cp.acquirer = p_acquirer and cp.day_date = p_day and cp.group_key = p_group
     and m.status in ('prepared', 'approved')
   order by m.status = 'approved' desc, m.prepared_at desc
   limit 1
$fn$;

revoke all on function public._card_settlement_live_payout(text, date, text) from public, anon, authenticated;

-- 7 . the candidates for one row ----------------------------------------------
-- Recorded card payments not voided and not matched to another row, within 7
-- days; the row's own payment stays a candidate.
--   Public Bank, Maybank: approval_code (code and amount agree, a match),
--     code_other_amount (code agrees, amount does not), code_near (a likely
--     typo, amount agrees).
--   GHL: amount_and_date (same amount, same day, a match), amount_near_date.
-- The window is 3 days; it widens to 7 only when nothing is found inside 3.
-- An agreeing approval code is shown at any distance inside 7.
-- Payments are cut to the date window before any text work.
create or replace function public._card_settlement_candidates(p_line_id uuid)
returns table (payment_id uuid, how text, days_apart integer)
language sql
stable
set search_path = public, pg_temp
as $fn$
  with l as (
    select c.acquirer, c.txn_date, c.amount, c.payment_id as own, public._card_code(c.approval_code) as code
      from public.card_settlement_lines c
     where c.id = p_line_id
  ), near as materialized (
    select p.id, p.amount, p.paid_on, p.reference, p.method
      from l
      join public.order_payments p
        on p.paid_on between l.txn_date - 7 and l.txn_date + 7
     where p.voided_at is null
  ), rated as (
    select p.id, abs(p.paid_on - l.txn_date) as gap,
           case
             when l.acquirer = 'GHL' then
               case when p.amount = l.amount and p.paid_on = l.txn_date then 'amount_and_date'
                    when p.amount = l.amount then 'amount_near_date' end
             when public._card_code(p.reference) = l.code then
               case when p.amount = l.amount then 'approval_code' else 'code_other_amount' end
             when p.amount = l.amount and public._card_code_near(public._card_code(p.reference), l.code) then 'code_near'
           end as how
      from l
      join near p on public.payment_method_key(p.method) in ('card', 'credit_card', 'debit_card')
     where p.id is not distinct from l.own
        or not exists (select 1 from public.card_settlement_lines m where m.payment_id = p.id)
  )
  select r.id, r.how, r.gap
    from rated r
   where r.how is not null
     and (r.how = 'approval_code'
          or r.gap <= case when exists (select 1 from rated x where x.how is not null and x.gap <= 3)
                           then 3 else 7 end)
   order by r.how in ('approval_code', 'amount_and_date') desc, r.gap, r.id
$fn$;

revoke all on function public._card_settlement_candidates(uuid) from public, anon, authenticated;

-- 8 . import ------------------------------------------------------------------
create or replace function public.card_settlement_import(
  p_acquirer  text,
  p_file_name text,
  p_content   text,
  p_rows      jsonb,
  p_published jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     text := public.app_role()::text;
  v_me       uuid := auth.uid();
  v_file     uuid;
  v_row      jsonb;
  v_line     uuid;
  v_amount   numeric;
  v_net      numeric;
  v_merchant text;
  v_terminal text;
  v_payout   date;
  v_new      integer := 0;
  v_matched  integer := 0;
  v_released integer := 0;
  v_paid_row integer;
  v_auto     jsonb;
  v_sure     jsonb;
begin
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'Only Finance works on card settlement.' using errcode = '42501', detail = 'not_finance';
  end if;
  if p_acquirer is null or p_acquirer not in ('PBB', 'GHL', 'MAYBANK') then
    raise exception 'Choose Public Bank, GHL or Maybank.' using errcode = '22023', detail = 'bad_acquirer';
  end if;
  if coalesce(p_file_name, '') !~ '[^[:space:]]' then
    raise exception 'The file has no name.' using errcode = '22023', detail = 'no_file_name';
  end if;
  if coalesce(p_content, '') !~ '[^[:space:]]'
     or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'The file has no sales.' using errcode = '22023', detail = 'no_rows';
  end if;
  -- ponytail: one lock for every card settlement write; Finance is a handful of people.
  perform pg_advisory_xact_lock(hashtextextended('card_settlement', 0));
  if exists (select 1 from public.card_settlement_files f
              where f.acquirer = p_acquirer and md5(f.content) = md5(p_content)) then
    raise exception 'This file was imported before.' using errcode = '22023', detail = 'file_imported';
  end if;
  if p_acquirer = 'MAYBANK' then
    if public._card_text(p_published ->> 'merchant_id') is null
       or p_published ->> 'report_date' is null or p_published ->> 'gross' is null
       or p_published ->> 'fee' is null or p_published ->> 'net' is null then
      raise exception 'This is not a Maybank settlement file. Check the card company and the file.'
        using errcode = '22023', detail = 'not_the_format';
    end if;
    if exists (select 1 from public.card_settlement_files f
                where f.acquirer = 'MAYBANK' and f.merchant_id = public._card_text(p_published ->> 'merchant_id')
                  and f.report_date = (p_published ->> 'report_date')::date) then
      raise exception 'This file was imported before.' using errcode = '22023', detail = 'file_imported';
    end if;
  end if;

  insert into public.card_settlement_files
    (acquirer, file_name, content, merchant_id, report_date,
     published_gross, published_fee, published_net, imported_by)
  values (p_acquirer, public._card_text(p_file_name), p_content,
          case when p_acquirer = 'MAYBANK' then public._card_text(p_published ->> 'merchant_id') end,
          case when p_acquirer = 'MAYBANK' then (p_published ->> 'report_date')::date end,
          case when p_acquirer = 'MAYBANK' then round((p_published ->> 'gross')::numeric, 2) end,
          case when p_acquirer = 'MAYBANK' then round((p_published ->> 'fee')::numeric, 2) end,
          case when p_acquirer = 'MAYBANK' then round((p_published ->> 'net')::numeric, 2) end,
          v_me)
  returning id into v_file;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_amount := (v_row ->> 'amount')::numeric;
    v_net    := (v_row ->> 'net_amount')::numeric;
    -- No sample had a refund, void or chargeback, so their sign is not known.
    if v_amount is null or v_amount <= 0
       or (p_acquirer = 'PBB' and (v_row -> 'fields' ->> 'Status') is distinct from 'PURCHASES')
       or (p_acquirer = 'GHL' and (v_row -> 'fields' ->> 'tx_code_true') is distinct from 'PAYMENT') then
      raise exception 'Row % is a refund, void or chargeback. Carres does not import these until their sign is confirmed on a real one.',
        coalesce(v_row ->> 'line_no', '?')
        using errcode = '22023', detail = 'reversal_refused';
    end if;
    v_merchant := case when p_acquirer = 'MAYBANK' then public._card_text(p_published ->> 'merchant_id')
                       else public._card_text(v_row ->> 'merchant_id') end;
    v_terminal := public._card_text(v_row ->> 'terminal_id');
    -- GHL: the statement date from the file name, or nothing; never the sale date.
    v_payout   := case when p_acquirer = 'MAYBANK' then (p_published ->> 'report_date')::date
                       else (v_row ->> 'payout_date')::date end;
    if v_amount <> round(v_amount, 2) or v_net < 0 or (p_acquirer <> 'MAYBANK' and v_net is null)
       or (v_row ->> 'txn_date') is null or (p_acquirer <> 'GHL' and v_payout is null)
       or coalesce(v_row ->> 'raw_line', '') !~ '[^[:space:]]'
       or jsonb_typeof(v_row -> 'fields') is distinct from 'object'
       or (p_acquirer = 'PBB' and (v_merchant is null or v_terminal is null))
       or (p_acquirer = 'GHL' and v_terminal is null) then
      raise exception 'Row % could not be read. Import the file as it came from the card company.',
        coalesce(v_row ->> 'line_no', '?')
        using errcode = '22023', detail = 'row_unreadable';
    end if;

    v_line := null;
    insert into public.card_settlement_lines
      (file_id, acquirer, line_no, raw_line, fields, txn_date, payout_date, merchant_id, terminal_id,
       group_key, approval_code, card_no, amount, net_amount)
    values (v_file, p_acquirer, (v_row ->> 'line_no')::integer, v_row ->> 'raw_line', v_row -> 'fields',
            (v_row ->> 'txn_date')::date, v_payout, v_merchant, v_terminal,
            case p_acquirer when 'PBB' then v_merchant || ' / ' || v_terminal
                            when 'GHL' then v_terminal
                            else v_merchant end,
            public._card_text(v_row ->> 'approval_code'),
            public._card_text(v_row ->> 'card_no'),
            v_amount, round(v_net, 2))
    on conflict do nothing
    returning id into v_line;
    if v_line is not null then
      v_new := v_new + 1;
    end if;
  end loop;

  -- A new row may not change a day whose payout is already prepared or approved.
  select min(l.line_no) into v_paid_row
    from public.card_settlement_lines l
   where l.file_id = v_file
     and public._card_settlement_live_payout(l.acquirer, l.day_date, l.group_key) is not null;
  if v_paid_row is not null then
    raise exception 'Row % is for a day whose payout is already prepared. Cancel that money move first.', v_paid_row
      using errcode = '22023', detail = 'day_paid';
  end if;

  -- The match rule runs again over every row, of every file, that is open or
  -- was matched automatically, so the result does not depend on the order
  -- the files came in. Never touched: a match made by staff, a row staff took
  -- the match off (kept_open), and every row of a day whose payout is
  -- prepared or approved (frozen).
  -- ponytail: every such row on an unpaid day is read at each import; cut it
  -- to a date window if unpaid rows ever run into the thousands.
  --   1. the automatic matches are set aside, so their payments are free again
  select coalesce(jsonb_object_agg(l.id, jsonb_build_object('payment_id', l.payment_id, 'how', l.matched_how,
                                                            'by', l.matched_by, 'at', l.matched_at)), '{}'::jsonb)
    into v_auto
    from public.card_settlement_lines l
   where l.matched_how in ('approval_code', 'amount_and_date')
     and public._card_settlement_live_payout(l.acquirer, l.day_date, l.group_key) is null;
  update public.card_settlement_lines l
     set payment_id = null, matched_how = null, matched_by = null, matched_at = null
   where v_auto ? l.id::text;

  --   2. a pairing is sure when it is unique from both sides: the row has one
  --      candidate, and that payment is the candidate of no other open row.
  --      A payment a Public Bank or Maybank row may own (its approval code,
  --      the code with another amount, or a likely typo of it) is contested
  --      for GHL: only a suggestion there.
  with cand as materialized (
    select o.id as line_id, o.acquirer, o.kept_open, c.payment_id, c.how
      from public.card_settlement_lines o
     cross join lateral public._card_settlement_candidates(o.id) c
     where o.payment_id is null
       and public._card_settlement_live_payout(o.acquirer, o.day_date, o.group_key) is null
  ), pairs as (
    select x.line_id, x.kept_open, x.payment_id, x.how
      from cand x
     where x.how in ('approval_code', 'amount_and_date')
       and not (x.acquirer = 'GHL'
                and exists (select 1 from cand k
                             where k.payment_id = x.payment_id and k.acquirer <> 'GHL'
                               and k.how in ('approval_code', 'code_other_amount', 'code_near')))
  )
  select coalesce(jsonb_agg(jsonb_build_object('line_id', p.line_id, 'payment_id', p.payment_id, 'how', p.how)), '[]'::jsonb)
    into v_sure
    from pairs p
   where not p.kept_open
     and (select count(*) from pairs x where x.line_id = p.line_id) = 1
     and (select count(*) from pairs x where x.payment_id = p.payment_id) = 1;

  --   3. the sure pairings are matched; one that was already matched keeps who and when
  update public.card_settlement_lines l
     set payment_id  = (s ->> 'payment_id')::uuid,
         matched_how = s ->> 'how',
         matched_by  = case when v_auto -> (s ->> 'line_id') ->> 'payment_id' = s ->> 'payment_id'
                            then (v_auto -> (s ->> 'line_id') ->> 'by')::uuid else v_me end,
         matched_at  = case when v_auto -> (s ->> 'line_id') ->> 'payment_id' = s ->> 'payment_id'
                            then (v_auto -> (s ->> 'line_id') ->> 'at')::timestamptz else now() end
    from jsonb_array_elements(v_sure) s
   where l.id = (s ->> 'line_id')::uuid;

  -- matched: rows matched now that were not matched to that payment before;
  -- released: automatic matches that did not come back to the same payment
  select count(*) into v_matched
    from jsonb_array_elements(v_sure) s
   where (v_auto -> (s ->> 'line_id') ->> 'payment_id') is distinct from s ->> 'payment_id';
  select count(*) into v_released
    from jsonb_each(v_auto) a
   where not exists (select 1 from jsonb_array_elements(v_sure) s
                      where s ->> 'line_id' = a.key and s ->> 'payment_id' = a.value ->> 'payment_id');

  return jsonb_build_object('file_id', v_file, 'rows', jsonb_array_length(p_rows),
                            'imported', v_new, 'matched', v_matched, 'released', v_released);
end;
$fn$;

comment on function public.card_settlement_import(text, text, text, jsonb, jsonb) is
  '0572: Finance imports one parsed card settlement file (Public Bank, GHL or Maybank). Keeps every row whole, refuses a refund, void or chargeback row and a row for a day already paid out, skips a row already imported, then runs the match rule again over every open or automatically matched row of every file on a day not paid out: a row is matched only when the pairing is unique from both sides, and an automatic match whose payment has become contested is released. Never changes a match made by staff, a row staff took the match off, or a day whose payout is prepared or approved. Writes no ledger row.';
revoke all on function public.card_settlement_import(text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.card_settlement_import(text, text, text, jsonb, jsonb) to authenticated;

-- 9 . review ------------------------------------------------------------------
-- Days in the last 92 days, and any older day with a row still open.
create or replace function public.card_settlement_review()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_out   jsonb;
begin
  if not public.gl_may_read() then
    raise exception 'Only Finance works on card settlement.' using errcode = '42501', detail = 'not_finance';
  end if;

  with day as (
    select l.acquirer, l.day_date, l.group_key,
           max(l.payout_date) as payout_date,
           count(*)::integer as row_count,
           count(l.payment_id)::integer as matched_count,
           sum(l.amount) as gross,
           case when l.acquirer = 'MAYBANK' then max(f.published_net) else sum(l.net_amount) end as net,
           sum(p.amount) as recorded,
           left(format('Card settlement %s %s %s', l.acquirer, l.group_key, to_char(l.day_date, 'YYYY-MM-DD')), 120) as reference
      from public.card_settlement_lines l
      join public.card_settlement_files f on f.id = l.file_id
      left join public.order_payments p on p.id = l.payment_id
     group by l.acquirer, l.day_date, l.group_key
    having l.day_date >= v_today - 92 or count(l.payment_id) < count(*)
  ), day_paid as (
    select d.*, public._card_settlement_live_payout(d.acquirer, d.day_date, d.group_key) as payout_move_id
      from day d
  ), day_out as (
    select d.*, m.status as payout_status, m.move_no as payout_move_no,
           -- a live card payout linked to no day, from a card account a route
           -- serves, on the day's date: it may be this day's money paid twice
           coalesce((select jsonb_agg(jsonb_build_object('move_id', u.id, 'move_no', u.move_no, 'status', u.status,
                                                         'move_date', u.move_date, 'from_account_code', u.from_account_code,
                                                         'amount', u.amount, 'fee', u.fee, 'reference', u.reference)
                                      order by u.move_no)
                       from public.gl_money_moves u
                      where u.kind = 'CARD_PAYOUT' and u.status in ('prepared', 'approved')
                        and u.move_date in (d.day_date, d.payout_date)
                        and u.from_account_code in (select r.holding_code from public.card_settlement_routes r)
                        and not exists (select 1 from public.card_settlement_payouts cp where cp.move_id = u.id)),
                    '[]'::jsonb) as unlinked_payouts
      from day_paid d
      left join public.gl_money_moves m on m.id = d.payout_move_id
  ), line as (
    select l.*, f.file_name,
           case when l.payment_id is null then
             coalesce((select jsonb_agg(jsonb_build_object('payment_id', c.payment_id, 'how', c.how,
                                                           'days_apart', c.days_apart) order by c.n)
                         from public._card_settlement_candidates(l.id) with ordinality as c(payment_id, how, days_apart, n)),
                      '[]'::jsonb)
           else '[]'::jsonb end as suggestions
      from public.card_settlement_lines l
      join public.card_settlement_files f on f.id = l.file_id
      join day d on d.acquirer = l.acquirer and d.day_date = l.day_date and d.group_key = l.group_key
  ), pay as (
    select p.id, p.amount, p.paid_on, p.reference, p.receipt_no, o.so, p.voided_at is not null as voided
      from public.order_payments p
      join public.orders o on o.id = p.order_id
     where p.id in (select x.payment_id from line x where x.payment_id is not null)
        or (p.paid_on between (select min(x.txn_date) - 31 from line x)
                          and (select max(x.txn_date) + 31 from line x)
            and p.voided_at is null
            and public.payment_method_key(p.method) in ('card', 'credit_card', 'debit_card')
            and not exists (select 1 from public.card_settlement_lines m where m.payment_id = p.id))
  )
  select jsonb_build_object(
    'days', coalesce((select jsonb_agg(to_jsonb(d) order by d.day_date desc, d.acquirer, d.group_key) from day_out d), '[]'::jsonb),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
               'id', x.id, 'file_name', x.file_name, 'acquirer', x.acquirer, 'line_no', x.line_no,
               'txn_date', x.txn_date, 'payout_date', x.payout_date, 'day_date', x.day_date, 'group_key', x.group_key,
               'merchant_id', x.merchant_id, 'terminal_id', x.terminal_id,
               'approval_code', x.approval_code, 'card_no', x.card_no,
               'amount', x.amount, 'net_amount', x.net_amount,
               'payment_id', x.payment_id, 'matched_how', x.matched_how, 'matched_at', x.matched_at,
               'suggestions', x.suggestions)
             order by x.day_date desc, x.acquirer, x.group_key, x.line_no) from line x), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(to_jsonb(y) order by y.paid_on desc, y.id) from pay y), '[]'::jsonb))
    into v_out;
  return v_out;
end;
$fn$;

comment on function public.card_settlement_review() is
  '0572: the card settlement days (per machine per day; per merchant for Maybank), each with its live payout from card_settlement_payouts and any live card payout linked to no day from a routed card account on the day''s date, their rows with each open row''s suggestions, and the card payments a row can be matched to. Finance and principal. Read only.';
revoke all on function public.card_settlement_review() from public, anon;
grant execute on function public.card_settlement_review() to authenticated;

-- 10 . approve a suggestion, or adjust by hand --------------------------------
create or replace function public.card_settlement_match(p_line_id uuid, p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := public.app_role()::text;
  v_line public.card_settlement_lines%rowtype;
  v_how  text;
begin
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'Only Finance works on card settlement.' using errcode = '42501', detail = 'not_finance';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('card_settlement', 0));
  select * into v_line from public.card_settlement_lines where id = p_line_id for update;
  if not found then
    raise exception 'That settlement row is not there.' using errcode = 'P0002', detail = 'row_not_found';
  end if;
  if public._card_settlement_live_payout(v_line.acquirer, v_line.day_date, v_line.group_key) is not null then
    raise exception 'The payout for this day is already prepared. Cancel that money move before you change a match.'
      using errcode = '22023', detail = 'day_paid';
  end if;

  -- Taken off by staff: the row stays open until staff match it.
  if p_payment_id is null then
    update public.card_settlement_lines
       set payment_id = null, matched_how = null, matched_by = null, matched_at = null, kept_open = true
     where id = p_line_id;
    return jsonb_build_object('id', p_line_id, 'payment_id', null);
  end if;

  -- The same payment saved again keeps how it was matched.
  if p_payment_id = v_line.payment_id then
    return jsonb_build_object('id', p_line_id, 'payment_id', p_payment_id, 'matched_how', v_line.matched_how);
  end if;

  if not exists (select 1 from public.order_payments p
                  where p.id = p_payment_id and p.voided_at is null
                    and public.payment_method_key(p.method) in ('card', 'credit_card', 'debit_card')) then
    raise exception 'Choose a card payment that is not voided.' using errcode = '22023', detail = 'not_card_payment';
  end if;
  if exists (select 1 from public.card_settlement_lines m where m.payment_id = p_payment_id and m.id <> p_line_id) then
    raise exception 'That payment is already matched to another row.' using errcode = '22023', detail = 'payment_taken';
  end if;

  v_how := case when exists (select 1 from public._card_settlement_candidates(p_line_id) c where c.payment_id = p_payment_id)
                then 'suggestion' else 'by_hand' end;
  update public.card_settlement_lines
     set payment_id = p_payment_id, matched_how = v_how, matched_by = auth.uid(), matched_at = now()
   where id = p_line_id;
  return jsonb_build_object('id', p_line_id, 'payment_id', p_payment_id, 'matched_how', v_how);
end;
$fn$;

comment on function public.card_settlement_match(uuid, uuid) is
  '0572: matches one card settlement row to a recorded card payment (an approved suggestion, or picked by hand), or takes the match off (null) and keeps the row open: an import never matches it again. Refused once the day''s payout is prepared or approved. Edits no payment and writes no ledger row.';
revoke all on function public.card_settlement_match(uuid, uuid) from public, anon;
grant execute on function public.card_settlement_match(uuid, uuid) to authenticated;

-- 11 . approve a day: prepare its one payout ---------------------------------
create or replace function public.card_settlement_payout_prepare(
  p_acquirer          text,
  p_day_date          date,
  p_group_key         text,
  p_move_date         date,
  p_from_account_code text,
  p_to_account_code   text,
  p_note              text default null,
  p_idempotency_key   uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role    text := public.app_role()::text;
  v_rows    integer;
  v_matched integer;
  v_gross   numeric;
  v_net     numeric;
  v_move    uuid;
  v_ref     text := left(format('Card settlement %s %s %s', p_acquirer, p_group_key, to_char(p_day_date, 'YYYY-MM-DD')), 120);
  v_key     record;
begin
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'Only Finance works on card settlement.' using errcode = '42501', detail = 'not_finance';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('card_settlement', 0));

  -- The same press sent twice returns this day's own live payout. A key that
  -- belongs to any other move (another kind, another day, a cancelled or
  -- reversed payout) is refused, never returned.
  if p_idempotency_key is not null then
    select m.id, m.move_no, m.status, cp.acquirer, cp.day_date, cp.group_key, cp.released_at, cp.id is not null as linked
      into v_key
      from public.gl_money_moves m
      left join public.card_settlement_payouts cp on cp.move_id = m.id
     where m.idempotency_key = p_idempotency_key;
    if found then
      if v_key.linked and v_key.released_at is null and v_key.status in ('prepared', 'approved')
         and v_key.acquirer = p_acquirer and v_key.day_date = p_day_date and v_key.group_key = p_group_key then
        return jsonb_build_object('move_id', v_key.id, 'move_no', v_key.move_no);
      end if;
      raise exception 'This form was used before. Close it and press Approve day again.'
        using errcode = '22023', detail = 'idempotency_key_used';
    end if;
  end if;

  select count(*), count(l.payment_id), sum(l.amount),
         case when p_acquirer = 'MAYBANK' then max(f.published_net) else sum(l.net_amount) end
    into v_rows, v_matched, v_gross, v_net
    from public.card_settlement_lines l
    join public.card_settlement_files f on f.id = l.file_id
   where l.acquirer = p_acquirer and l.day_date = p_day_date and l.group_key = p_group_key;
  if v_rows = 0 then
    raise exception 'That card settlement day is not there.' using errcode = 'P0002', detail = 'day_not_found';
  end if;
  if v_matched < v_rows then
    raise exception 'Match every sale before you approve the day.' using errcode = '22023', detail = 'day_not_matched';
  end if;

  -- a payout that was cancelled or reversed frees the day
  update public.card_settlement_payouts cp
     set released_at = now()
    from public.gl_money_moves m
   where m.id = cp.move_id and cp.released_at is null
     and cp.acquirer = p_acquirer and cp.day_date = p_day_date and cp.group_key = p_group_key
     and m.status not in ('prepared', 'approved');
  if exists (select 1 from public.card_settlement_payouts cp
              where cp.acquirer = p_acquirer and cp.day_date = p_day_date and cp.group_key = p_group_key
                and cp.released_at is null) then
    raise exception 'The payout for this day is already prepared.' using errcode = '22023', detail = 'payout_exists';
  end if;

  -- This door alone may prepare a card payout from a routed card account
  -- (section 12): it names the day for gl_money_move_create, for this call only.
  perform set_config('carres.card_payout_day', v_ref, true);
  v_move := public.gl_money_move_create(
    'CARD_PAYOUT', p_move_date, p_from_account_code, p_to_account_code, v_net, v_gross - v_net,
    v_ref, public._card_text(p_note), p_idempotency_key);
  perform set_config('carres.card_payout_day', '', true);
  -- gl_money_move_create returns any move that already holds the key: link
  -- only a new card payout of exactly this day's net and fee.
  if not exists (select 1 from public.gl_money_moves m
                  where m.id = v_move and m.kind = 'CARD_PAYOUT' and m.status = 'prepared'
                    and m.amount = v_net and m.fee = v_gross - v_net) then
    raise exception 'This form was used before. Close it and press Approve day again.'
      using errcode = '22023', detail = 'idempotency_key_used';
  end if;
  insert into public.card_settlement_payouts (acquirer, day_date, group_key, move_id, prepared_by)
  values (p_acquirer, p_day_date, p_group_key, v_move, auth.uid());

  return jsonb_build_object('move_id', v_move, 'move_no', (select m.move_no from public.gl_money_moves m where m.id = v_move));
end;
$fn$;

comment on function public.card_settlement_payout_prepare(text, date, text, date, text, text, text, uuid) is
  '0572: Approve day. Prepares the day''s one CARD_PAYOUT money move (0529, via gl_money_move_create) with the file''s net and fee and a fixed reference, and links it to the day. Refuses a day not fully matched, a day whose payout is prepared or approved, and an idempotency key that is not this day''s own live payout. The only door for a card payout from a routed card account. Posts nothing: the finance approver approves the move.';
revoke all on function public.card_settlement_payout_prepare(text, date, text, date, text, text, text, uuid) from public, anon;
grant execute on function public.card_settlement_payout_prepare(text, date, text, date, text, text, text, uuid) to authenticated;

-- 12 . one door for a routed card account's payout --------------------------
-- gl_money_move_create as pg_proc holds it (0529 body; every guard kept), with
-- one guard added after the idempotency return: a card payout from a holding
-- account that a card settlement route serves (0541) is refused unless
-- card_settlement_payout_prepare named this move's day in its own transaction.
-- carres.card_payout_day is set only there, transaction-local; PostgREST sets
-- no carres.* setting. Its comment and grants are kept (create or replace).
CREATE OR REPLACE FUNCTION public.gl_money_move_create(p_kind text, p_move_date date, p_from_account_code text, p_to_account_code text, p_amount numeric, p_fee numeric DEFAULT 0, p_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- 0572: a routed card account's payout is prepared by Card settlement's
  -- Approve day only, which names the day it pays.
  if p_kind = 'CARD_PAYOUT'
     and exists (select 1 from public.card_settlement_routes r where r.holding_code = btrim(p_from_account_code))
     and (coalesce(current_setting('carres.card_payout_day', true), '') !~ '[^[:space:]]'
          or current_setting('carres.card_payout_day', true) is distinct from p_reference) then
    raise exception 'A card payout from this card account is prepared on Card settlement. Approve the day there.'
      using errcode = '22023', detail = 'card_payout_by_card_settlement';
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
$function$;

commit;
