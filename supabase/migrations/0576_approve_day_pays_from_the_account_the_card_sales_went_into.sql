-- 0576 . Approve day pays from the card account the day's sales went into
--
-- Follow-up to 0572 (PR 1538).
--   1. Approve day took any routed card account as Paid from. It now must be
--      the account the day's matched payments were paid into, found through
--      gl_payment_account_map (gl_account_for_payment_method). A day whose
--      payments went into more than one account is refused.
--   2. gl_money_move_create refused a Money moves card payout only from a
--      routed card account. It now refuses one from every card account: any
--      account a card payment method maps to, and any routed account.
--   3. card_settlement_review listed unlinked card payouts only from routed
--      accounts. It now lists them from every card account, and gives each day
--      its holding_codes.
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
  v_ref     text := left(format('Card settlement %s %s %s', p_acquirer, p_group_key, to_char(p_day_date, 'YYYY-MM-DD')), 120);
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
  if cardinality(v_holding) > 1 then
    raise exception 'The sales on this day were paid into more than one card account, so one payout cannot cover them. Check the payment method of each sale.'
      using errcode = '22023', detail = 'day_many_holdings';
  end if;
  if cardinality(v_holding) = 1 and v_holding[1] is distinct from btrim(p_from_account_code) then
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

comment on function public.card_settlement_review() is
  '0572, 0576: the card settlement days (per machine per day; per merchant for Maybank), each with its live payout from card_settlement_payouts, the card accounts its matched payments were paid into (holding_codes), and any live card payout linked to no day from any card account on the day''s date; their rows with each open row''s suggestions, and the card payments a row can be matched to. Finance and principal. Read only.';
comment on function public.card_settlement_payout_prepare(text, date, text, date, text, text, text, uuid) is
  '0572, 0576: Approve day. Prepares the day''s one CARD_PAYOUT money move (0529, via gl_money_move_create) with the file''s net and fee and a fixed reference, and links it to the day. Refuses a day not fully matched, a day whose payments went into more than one card account, a from account that is not the one they went into, a day whose payout is prepared or approved, a from account no card settlement route serves, a to account that is not that route''s bank, and an idempotency key that is not this day''s own live payout. The only door for a card payout from a card account. Posts nothing: the finance approver approves the move.';

commit;
