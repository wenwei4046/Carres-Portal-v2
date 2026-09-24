-- 0576 . Approve day pays from the card account the day's sales went into
--
-- Follow-up to 0572 (PR 1538).
--   1. Approve day took any routed card account as Paid from. It now must be
--      the account the day's matched payments were paid into, found through
--      gl_payment_account_map (gl_account_for_payment_method). A day whose
--      payments went into no card account, or into more than one, is refused.
--   2. gl_money_move_create refused a Money moves card payout only from a
--      routed card account. It now refuses one from every card account: any
--      account a card payment method maps to, and any routed account.
--   3. card_settlement_review listed unlinked card payouts only from routed
--      accounts. It now lists them from every card account, and gives each day
--      its holding_codes.
--   4. Words approved by YH, 24 Sep 2026. The payout reference names the card
--      company as the screen does and the day as D Mon YYYY: 'Card settlement
--      Public Bank 900000000001 / 90000001 1 Sep 2026' (was 'Card settlement
--      PBB ... 2026-09-01'). One function, _card_settlement_reference, makes it
--      for both the review and Approve day. Nothing finds a payout by its
--      reference: a day's payout is its card_settlement_payouts link (the
--      paid-day check, the idempotency pre-check, the frozen day, the unlinked
--      listing), and the gl_money_move_create guard compares the reference only
--      with the setting Approve day sets in the same call. So a payout prepared
--      with the old reference is still that day's payout and the day is never
--      paid twice. Old references are not rewritten.
--   5. card_settlement_import's refund refusal now reads 'Row {n} is a refund,
--      void or chargeback. Carres cannot import it yet. Give the file to IT.'
--      Only that sentence changes; every guard is kept.
-- Bodies are main's pg_get_functiondef at 0575, every guard kept. No account
-- code is written here. No backfill.

begin;

-- the card accounts: any account a card payment method maps to, and any
-- account a card settlement route serves (0541)
create or replace function public._card_payout_holdings()
returns setof text
language sql
stable
set search_path = public, pg_temp
as $fn$
  select m.account_code from public.gl_payment_account_map m
   where m.method in ('card', 'credit_card', 'debit_card')
  union
  select r.holding_code from public.card_settlement_routes r;
$fn$;
comment on function public._card_payout_holdings() is
  '0576: every card account. An account a card payment method (card, credit_card, debit_card) maps to in gl_payment_account_map, and a card_settlement_routes holding. A card payout from one of them is prepared on Card settlement only.';
revoke all on function public._card_payout_holdings() from public, anon, authenticated;

-- the payout reference: the card company's screen name, the machine, the day as D Mon YYYY
create or replace function public._card_settlement_reference(p_acquirer text, p_group_key text, p_day date)
returns text
language sql
stable
set search_path = public, pg_temp
as $fn$
  select left(format('Card settlement %s %s %s',
                     case p_acquirer when 'PBB' then 'Public Bank' when 'GHL' then 'GHL'
                                     when 'MAYBANK' then 'Maybank' else p_acquirer end,
                     p_group_key, to_char(p_day, 'FMDD Mon YYYY')), 120);
$fn$;
comment on function public._card_settlement_reference(text, text, date) is
  '0576: the card payout reference, e.g. Card settlement Public Bank 900000000001 / 90000001 1 Sep 2026. Written on the move by Approve day and shown by the review. Nothing finds a payout by it.';
revoke all on function public._card_settlement_reference(text, text, date) from public, anon, authenticated;

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

  -- 0572: a card account's payout is prepared by Card settlement's Approve
  -- day only, which names the day it pays. 0576: every card account, not only
  -- a routed one.
  if p_kind = 'CARD_PAYOUT'
     and btrim(p_from_account_code) in (select public._card_payout_holdings())
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

CREATE OR REPLACE FUNCTION public.card_settlement_review()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
           -- 0576: the card accounts the day's matched payments were paid into
           coalesce(array_agg(distinct public.gl_account_for_payment_method(p.method, p.source_channel))
                      filter (where p.id is not null and public.gl_account_for_payment_method(p.method, p.source_channel) is not null),
                    '{}') as holding_codes,
           public._card_settlement_reference(l.acquirer, l.group_key, l.day_date) as reference
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
                        and u.from_account_code in (select public._card_payout_holdings())
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
$function$;

CREATE OR REPLACE FUNCTION public.card_settlement_payout_prepare(p_acquirer text, p_day_date date, p_group_key text, p_move_date date, p_from_account_code text, p_to_account_code text, p_note text DEFAULT NULL::text, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role    text := public.app_role()::text;
  v_rows    integer;
  v_matched integer;
  v_gross   numeric;
  v_net     numeric;
  v_move    uuid;
  v_ref     text := public._card_settlement_reference(p_acquirer, p_group_key, p_day_date);
  v_key     record;
  v_holding text[];
begin
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'Only Finance works on card settlement.' using errcode = '42501', detail = 'not_finance';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('card_settlement', 0));

  -- The same press sent twice returns this day's own live payout. A key that
  -- belongs to any other move (another kind, another day, a cancelled or
  -- reversed payout) is refused, never returned.
  if p_idempotency_key is not null then
    -- gl_money_move_create's own lock for this key, taken first: a move another
    -- session is making with the key is seen here once it commits.
    perform pg_advisory_xact_lock(hashtextextended('gl_money_move:' || p_idempotency_key::text, 0));
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


  -- The money leaves a card account a route serves and goes to that route's
  -- bank (0541), so Money moves can never pay the same day again.
  if not exists (select 1 from public.card_settlement_routes r where r.holding_code = btrim(p_from_account_code)) then
    raise exception 'Choose a card account that has a payout bank in Finance Settings.'
      using errcode = '22023', detail = 'from_not_routed';
  end if;
  if not exists (select 1 from public.card_settlement_routes r
                  where r.holding_code = btrim(p_from_account_code) and r.bank_code = btrim(p_to_account_code)) then
    raise exception 'Choose the payout bank Finance Settings sets for this card account.'
      using errcode = '22023', detail = 'to_not_routed';
  end if;

  -- 0576: the day is paid out from the card account its sales were paid into.
  select coalesce(array_agg(distinct a) filter (where a is not null), '{}')
    into v_holding
    from (select public.gl_account_for_payment_method(p.method, p.source_channel) as a
            from public.card_settlement_lines l
            join public.order_payments p on p.id = l.payment_id
           where l.acquirer = p_acquirer and l.day_date = p_day_date and l.group_key = p_group_key) s;
  if cardinality(v_holding) = 0 then
    raise exception 'The sales on this day were not paid into a card account, so they cannot be paid out here. Check the payment method of each sale.'
      using errcode = '22023', detail = 'day_no_holding';
  end if;
  if cardinality(v_holding) > 1 then
    raise exception 'The sales on this day were paid into more than one card account, so one payout cannot cover them. Check the payment method of each sale.'
      using errcode = '22023', detail = 'day_many_holdings';
  end if;
  if v_holding[1] is distinct from btrim(p_from_account_code) then
    raise exception 'Pay this day out from %, the card account its sales were paid into.', v_holding[1]
      using errcode = '22023', detail = 'from_not_day_holding';
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
                    and m.amount = v_net and m.fee = v_gross - v_net
                    and m.reference = v_ref and m.move_date = p_move_date
                    and m.from_account_code = btrim(p_from_account_code)
                    and m.to_account_code = btrim(p_to_account_code)) then
    raise exception 'This form was used before. Close it and press Approve day again.'
      using errcode = '22023', detail = 'idempotency_key_used';
  end if;
  insert into public.card_settlement_payouts (acquirer, day_date, group_key, move_id, prepared_by)
  values (p_acquirer, p_day_date, p_group_key, v_move, auth.uid());

  return jsonb_build_object('move_id', v_move, 'move_no', (select m.move_no from public.gl_money_moves m where m.id = v_move));
end;
$function$;

-- 0572's import, the refund refusal in YH's words (24 Sep 2026); every guard kept.
CREATE OR REPLACE FUNCTION public.card_settlement_import(p_acquirer text, p_file_name text, p_content text, p_rows jsonb, p_published jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      raise exception 'Row % is a refund, void or chargeback. Carres cannot import it yet. Give the file to IT.',
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
$function$;

comment on function public.card_settlement_review() is
  '0572, 0576: the card settlement days (per machine per day; per merchant for Maybank), each with its live payout from card_settlement_payouts, the card accounts its matched payments were paid into (holding_codes), and any live card payout linked to no day from any card account on the day''s date; their rows with each open row''s suggestions, and the card payments a row can be matched to. Finance and principal. Read only.';
comment on function public.card_settlement_payout_prepare(text, date, text, date, text, text, text, uuid) is
  '0572, 0576: Approve day. Prepares the day''s one CARD_PAYOUT money move (0529, via gl_money_move_create) with the file''s net and fee and a fixed reference, and links it to the day. Refuses a day not fully matched, a day whose payments went into no card account or more than one, a from account that is not the one they went into, a day whose payout is prepared or approved, a from account no card settlement route serves, a to account that is not that route''s bank, and an idempotency key that is not this day''s own live payout. The only door for a card payout from a card account. Posts nothing: the finance approver approves the move.';

commit;
