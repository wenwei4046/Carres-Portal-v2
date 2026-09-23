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
--   3. card_settlement_import: Finance imports one parsed file. A refund, void
--      or chargeback row is refused: no sample had one, so its sign is not
--      known. A row already imported from another file is skipped. A row whose
--      approval code (Public Bank, Maybank) or amount and date (GHL) points at
--      exactly one recorded card payment is matched at once.
--   4. card_settlement_review: the days (one payout per machine, or per
--      merchant for Maybank, per day), their rows and each open row's
--      suggestions. Read only.
--   5. card_settlement_match: staff approve a suggestion or pick the payment by
--      hand; a null payment takes the match off.
--
-- WHAT IT DOES NOT DO
--   Nothing here writes the ledger or edits a payment. A typed approval code
--   that was wrong stays as it was typed; the match is only a link.
--   Approving a matched day fills the existing card payout form on the web
--   page; the payout posts only when the finance approver approves that
--   money move (0529).
--   Carres records no card machine on a payment (order_payments has no
--   terminal, MID, TID or acquirer), so the daily total per machine is the
--   card company's figure; Carres's side is the sum of the payments matched
--   to that day's rows.
--
-- RLS: two new tables, read by finance and principal (gl_may_read), written
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
  payout_date   date not null,
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
  constraint card_settlement_lines_match_is_whole check (
    (payment_id is null) = (matched_how is null)
    and (payment_id is null) = (matched_by is null)
    and (payment_id is null) = (matched_at is null)),
  constraint card_settlement_lines_net_per_row check (acquirer = 'MAYBANK' or net_amount is not null)
);

comment on table public.card_settlement_lines is
  '0572: one sale row of a card settlement file: the whole line, every column (fields), and the recorded card payment it matches (payment_id).';

create unique index card_settlement_lines_same_line
  on public.card_settlement_lines (acquirer, md5(raw_line));
create unique index card_settlement_lines_one_payment
  on public.card_settlement_lines (payment_id) where payment_id is not null;
create index card_settlement_lines_file on public.card_settlement_lines (file_id);
create index card_settlement_lines_day on public.card_settlement_lines (acquirer, payout_date, group_key);

alter table public.card_settlement_files enable row level security;
alter table public.card_settlement_lines enable row level security;
revoke all on public.card_settlement_files, public.card_settlement_lines from anon, authenticated;
grant select on public.card_settlement_files, public.card_settlement_lines to authenticated;
create policy card_settlement_files_read_finance on public.card_settlement_files
  for select using ((select public.gl_may_read()));
create policy card_settlement_lines_read_finance on public.card_settlement_lines
  for select using ((select public.gl_may_read()));

-- 3 . approval codes ----------------------------------------------------------
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

revoke all on function public._card_code(text) from public, anon;
revoke all on function public._card_code_near(text, text) from public, anon;

-- 4 . the candidates for one row ----------------------------------------------
-- Recorded card payments not voided and not matched to any row, within 7 days.
--   Public Bank, Maybank: approval_code (code and amount agree, a match),
--     code_other_amount (code agrees, amount does not), code_near (a likely
--     typo, amount agrees).
--   GHL: amount_and_date (same amount, same day, a match), amount_near_date.
-- The window is 3 days; it widens to 7 only when nothing is found inside 3.
-- An agreeing approval code is shown at any distance inside 7.
create or replace function public._card_settlement_candidates(p_line_id uuid)
returns table (payment_id uuid, how text, days_apart integer)
language sql
stable
set search_path = public, pg_temp
as $fn$
  with l as (
    select c.acquirer, c.txn_date, c.amount, public._card_code(c.approval_code) as code
      from public.card_settlement_lines c
     where c.id = p_line_id
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
      join public.order_payments p
        on p.voided_at is null
       and public.payment_method_key(p.method) in ('card', 'credit_card', 'debit_card')
       and p.paid_on between l.txn_date - 7 and l.txn_date + 7
     where not exists (select 1 from public.card_settlement_lines m where m.payment_id = p.id)
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

-- 5 . import ------------------------------------------------------------------
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
  v_pick     uuid;
  v_how      text;
  v_count    integer;
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
  if exists (select 1 from public.card_settlement_files f
              where f.acquirer = p_acquirer and md5(f.content) = md5(p_content)) then
    raise exception 'This file was imported before.' using errcode = '22023', detail = 'file_imported';
  end if;
  if p_acquirer = 'MAYBANK' then
    if coalesce(p_published ->> 'merchant_id', '') !~ '[^[:space:]]'
       or p_published ->> 'report_date' is null or p_published ->> 'gross' is null
       or p_published ->> 'fee' is null or p_published ->> 'net' is null then
      raise exception 'This is not a Maybank settlement file. Check the card company and the file.'
        using errcode = '22023', detail = 'not_the_format';
    end if;
    if exists (select 1 from public.card_settlement_files f
                where f.acquirer = 'MAYBANK' and f.merchant_id = btrim(p_published ->> 'merchant_id')
                  and f.report_date = (p_published ->> 'report_date')::date) then
      raise exception 'This file was imported before.' using errcode = '22023', detail = 'file_imported';
    end if;
  end if;

  insert into public.card_settlement_files
    (acquirer, file_name, content, merchant_id, report_date,
     published_gross, published_fee, published_net, imported_by)
  values (p_acquirer, btrim(p_file_name), p_content,
          case when p_acquirer = 'MAYBANK' then btrim(p_published ->> 'merchant_id') end,
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
    v_merchant := case when p_acquirer = 'MAYBANK' then btrim(p_published ->> 'merchant_id')
                       else nullif(btrim(coalesce(v_row ->> 'merchant_id', '')), '') end;
    v_terminal := nullif(btrim(coalesce(v_row ->> 'terminal_id', '')), '');
    v_payout   := case when p_acquirer = 'MAYBANK' then (p_published ->> 'report_date')::date
                       else (v_row ->> 'payout_date')::date end;
    if v_amount <> round(v_amount, 2) or v_net < 0 or (p_acquirer <> 'MAYBANK' and v_net is null)
       or (v_row ->> 'txn_date') is null or v_payout is null
       or coalesce(v_row ->> 'raw_line', '') !~ '[^[:space:]]'
       or jsonb_typeof(v_row -> 'fields') is distinct from 'object'
       or (p_acquirer = 'PBB' and (v_merchant is null or v_terminal is null))
       or (p_acquirer = 'GHL' and v_terminal is null) then
      raise exception 'Row % could not be read. Import the file as it came from the card company.',
        coalesce(v_row ->> 'line_no', '?')
        using errcode = '22023', detail = 'row_unreadable';
    end if;

    insert into public.card_settlement_lines
      (file_id, acquirer, line_no, raw_line, fields, txn_date, payout_date, merchant_id, terminal_id,
       group_key, approval_code, card_no, amount, net_amount)
    values (v_file, p_acquirer, (v_row ->> 'line_no')::integer, v_row ->> 'raw_line', v_row -> 'fields',
            (v_row ->> 'txn_date')::date, v_payout, v_merchant, v_terminal,
            case p_acquirer when 'PBB' then v_merchant || ' / ' || v_terminal
                            when 'GHL' then v_terminal
                            else v_merchant end,
            nullif(btrim(coalesce(v_row ->> 'approval_code', '')), ''),
            nullif(btrim(coalesce(v_row ->> 'card_no', '')), ''),
            v_amount, round(v_net, 2))
    on conflict do nothing
    returning id into v_line;
    if v_line is not null then
      v_new := v_new + 1;
    end if;
  end loop;

  -- A row matches at once when exactly one payment agrees on the key.
  for v_line in select l.id from public.card_settlement_lines l where l.file_id = v_file order by l.line_no loop
    select (array_agg(c.payment_id))[1], (array_agg(c.how))[1], count(*)
      into v_pick, v_how, v_count
      from public._card_settlement_candidates(v_line) c
     where c.how in ('approval_code', 'amount_and_date');
    if v_count = 1 then
      update public.card_settlement_lines
         set payment_id = v_pick, matched_how = v_how, matched_by = v_me, matched_at = now()
       where id = v_line;
      v_matched := v_matched + 1;
    end if;
  end loop;

  return jsonb_build_object('file_id', v_file, 'rows', jsonb_array_length(p_rows),
                            'imported', v_new, 'matched', v_matched);
end;
$fn$;

comment on function public.card_settlement_import(text, text, text, jsonb, jsonb) is
  '0572: Finance imports one parsed card settlement file (Public Bank, GHL or Maybank). Keeps every row whole, refuses a refund, void or chargeback row, skips a row already imported, and matches a row whose key points at exactly one recorded card payment. Writes no ledger row.';
revoke all on function public.card_settlement_import(text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.card_settlement_import(text, text, text, jsonb, jsonb) to authenticated;

-- 6 . review ------------------------------------------------------------------
-- Days paid out in the last 92 days, and any older day with a row still open.
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
    select l.acquirer, l.payout_date, l.group_key,
           count(*)::integer as row_count,
           count(l.payment_id)::integer as matched_count,
           sum(l.amount) as gross,
           case when l.acquirer = 'MAYBANK' then max(f.published_net) else sum(l.net_amount) end as net,
           sum(p.amount) as recorded,
           format('Card settlement %s %s %s', l.acquirer, l.group_key, to_char(l.payout_date, 'YYYY-MM-DD')) as reference
      from public.card_settlement_lines l
      join public.card_settlement_files f on f.id = l.file_id
      left join public.order_payments p on p.id = l.payment_id
     group by l.acquirer, l.payout_date, l.group_key
    having l.payout_date >= v_today - 92 or count(l.payment_id) < count(*)
  ), day_out as (
    select d.*, mv.status as payout_status, mv.move_no as payout_move_no
      from day d
      left join lateral (
        select m.status, m.move_no
          from public.gl_money_moves m
         where m.kind = 'CARD_PAYOUT' and m.reference = d.reference and m.status in ('prepared', 'approved')
         order by m.status = 'approved' desc, m.prepared_at desc
         limit 1) mv on true
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
      join day d on d.acquirer = l.acquirer and d.payout_date = l.payout_date and d.group_key = l.group_key
  ), pay as (
    select p.id, p.amount, p.paid_on, p.reference, p.receipt_no, o.so, p.voided_at is not null as voided
      from public.order_payments p
      join public.orders o on o.id = p.order_id
     where p.id in (select x.payment_id from line x where x.payment_id is not null)
        or (p.voided_at is null
            and public.payment_method_key(p.method) in ('card', 'credit_card', 'debit_card')
            and not exists (select 1 from public.card_settlement_lines m where m.payment_id = p.id)
            and p.paid_on between (select min(x.txn_date) - 31 from line x)
                              and (select max(x.txn_date) + 31 from line x))
  )
  select jsonb_build_object(
    'days', coalesce((select jsonb_agg(to_jsonb(d) order by d.payout_date desc, d.acquirer, d.group_key) from day_out d), '[]'::jsonb),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
               'id', x.id, 'file_name', x.file_name, 'acquirer', x.acquirer, 'line_no', x.line_no,
               'txn_date', x.txn_date, 'payout_date', x.payout_date, 'group_key', x.group_key,
               'merchant_id', x.merchant_id, 'terminal_id', x.terminal_id,
               'approval_code', x.approval_code, 'card_no', x.card_no,
               'amount', x.amount, 'net_amount', x.net_amount,
               'payment_id', x.payment_id, 'matched_how', x.matched_how, 'matched_at', x.matched_at,
               'suggestions', x.suggestions)
             order by x.payout_date desc, x.acquirer, x.group_key, x.line_no) from line x), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(to_jsonb(y) order by y.paid_on desc, y.id) from pay y), '[]'::jsonb))
    into v_out;
  return v_out;
end;
$fn$;

comment on function public.card_settlement_review() is
  '0572: the card settlement days (per machine per day; per merchant for Maybank), their rows with each open row''s suggestions, and the card payments a row can be matched to. Finance and principal. Read only.';
revoke all on function public.card_settlement_review() from public, anon;
grant execute on function public.card_settlement_review() to authenticated;

-- 7 . approve a suggestion, or adjust by hand ---------------------------------
create or replace function public.card_settlement_match(p_line_id uuid, p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := public.app_role()::text;
  v_how  text;
begin
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'Only Finance works on card settlement.' using errcode = '42501', detail = 'not_finance';
  end if;
  perform 1 from public.card_settlement_lines where id = p_line_id for update;
  if not found then
    raise exception 'That settlement row is not there.' using errcode = 'P0002', detail = 'row_not_found';
  end if;

  if p_payment_id is null then
    update public.card_settlement_lines
       set payment_id = null, matched_how = null, matched_by = null, matched_at = null
     where id = p_line_id;
    return jsonb_build_object('id', p_line_id, 'payment_id', null);
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
  '0572: matches one card settlement row to a recorded card payment (an approved suggestion, or picked by hand), or takes the match off (null). Edits no payment and writes no ledger row.';
revoke all on function public.card_settlement_match(uuid, uuid) from public, anon;
grant execute on function public.card_settlement_match(uuid, uuid) to authenticated;

commit;
