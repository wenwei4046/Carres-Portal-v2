-- =============================================================================
-- 0473_a_rental_collection_reaches_the_ledger.sql
-- FINANCE LEDGER · BUILD D — RENT-TO-OWN MONEY REACHES THE LEDGER
--
-- WHAT WAS WRONG
--
-- Carres collects rent every month and none of it reaches the ledger.
--
--   · The rental Sales Order line is priced ZERO on purpose (0275:228-232,
--     Rental MASTER §2 "THE ORDER"), and a zero invoice never posts
--     (0466 `_sales_invoice_to_ledger` returns null for amount 0). So no
--     receivable and no revenue is ever booked from the order side.
--   · The money itself arrives through `rental_record_payment` (0281), the
--     one writer of `rental_billings`. It marks the month paid, computes the
--     supplier / commission split, writes a `rental_billing_events` row and an
--     audit row. It never calls `gl_post`.
--
-- The result: a month of rent sits in the bank and in `rental_billings`, and
-- the ledger shows neither the cash nor the income.
--
-- WHAT THIS BUILDS
--
--   ① `_rental_payment_to_ledger(billing_id)` — one collected month becomes
--      one journal entry. Private: only the security definer functions below
--      can call it.
--   ② `rental_record_payment` re-created from its ONLY definition (0281:198-330,
--      copied verbatim; 0295 and 0300 call it but never redefine it). One step
--      is added after the audit row: call ①. The return gains `glEntryId`,
--      additively. Every caller goes through it, so all three doors post:
--        · the manual door, "Record transfer" on the Rental collections screen
--          (apps/api routes/rental.ts POST /agreements/:id/collections/:seq/record)
--        · the Stripe webhook, signup month and every monthly invoice
--          (routes/stripe-webhook.ts) — this caller has NO auth.uid(); it
--          runs as service_role. 0468 removed gl_post's role check so it can.
--        · early settlement (`rental_settle_agreement`, 0300), which calls
--          `rental_record_payment` once per remaining month.
--   ③ `gl_rental_payments_unposted()` — the list of rental months collected on
--      or after go-live that have no active ledger entry. For the ledger
--      Self-check page. finance + principal only (`gl_may_read`).
--
-- DR / CR, PER COLLECTED MONTH
--
--   Dr  the money account for the payment method     paid_amount
--   Cr  Rental income (4200)                          paid_amount
--
--   No receivable. There is no rental invoice: the order is priced zero and
--   the schedule is not booked as a debt, so each collection is income on the
--   day it is paid. THIS IS A DEFAULT, NOT AN OWNER RULING — the Rental MASTER
--   does not say when rent is earned. If the owner rules otherwise (for
--   example: book the whole contract as a receivable at approval), this
--   function changes and nothing else does.
--
--   Source type `RENTAL_PAYMENT`. Document number `<agreement no>-M<seq>`,
--   e.g. `RA-1003-M07` — the agreement number and the month, which a person
--   can find on the Rental screen. Never a bare uuid. A month is collected
--   once and can never be un-collected, so the number is stable and gl_post's
--   idempotency on (source type, document number) makes a retry return the
--   entry that already stands. Dated the day the money was paid, in Malaysia
--   time (`paid_at at time zone 'Asia/Kuala_Lumpur'`): the database clock is
--   UTC in production, and a payment at 7am MYT is still yesterday in UTC.
--
-- WHICH ACCOUNTS, AND WHO DECIDES
--
--   The debit account is NOT decided here. It is asked of
--   `gl_account_for_payment_method(method, channel)` (0463), the same helper
--   customer payments use; BUILD A keeps that signature while replacing its
--   internals. Rental stores its own method words, so they are first
--   translated to the customer-payment dictionary words:
--
--     rental word      asks the helper for         (seeded today)
--     bank_transfer    bank                        1120
--     cash             cash                        1110
--     cheque           cheque                      1120
--     card             card                        1130
--     stripe           online, channel stripe_checkout   1130
--     settlement       bank   (0300 writes this word; see below)   1120
--     anything else    itself, unchanged           (unmapped words refuse)
--
--   An unmapped method REFUSES, and the whole collection rolls back — the same
--   decision 0463 made for customer payments and wrote down at length: a
--   payment that stops and names the gap is cheaper than a lost entry.
--
--   The credit account is the `('GOODS','rental')` row of
--   `gl_income_account_map` (0466) — the row that already says "rental money
--   is rental income". Read by its EXACT key, never through the wildcard
--   fallback, because the wildcard row is furniture income and rent booked as
--   furniture is a wrong posting that balances.
--
-- THE QUIET SKIPS, AND ONLY THESE
--
--   · paid before go-live — ruling L, the same rule as 0463. The month is
--     recorded exactly as before and simply does not reach the ledger.
--   · a month collected at RM 0.00 — no money moved, and gl_post refuses a
--     zero entry. Refusing would roll back a Stripe webhook forever.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--
--   · Supplier share and commission share are NOT posted. `rental_agreements`
--     records `supplier_rate_pct` but has no supplier party, and a supplier
--     line on the payables control account needs one. Whether Carres owes the
--     supplier its share per collection (and to whom) is an owner question.
--   · Late interest collected in an early settlement is NOT posted. 0300 keeps
--     it on the settlement event, outside `rental_record_payment`, and the
--     chart has no penalty-income account. Owner question.
--   · Early settlement posts one entry PER MONTH it closes, all to the bank,
--     because 0300 routes each month through `rental_record_payment` (Rental
--     MASTER §2: "each month genuinely was paid"). The settle screen does not
--     ask how the customer paid; "settlement" is read as a bank transfer.
--   · No reversal is built, because there is nothing to reverse: no door in
--     the repository un-collects a rental month. `rental_billings` blocks the
--     delete of a paid row (0281 trigger), `rental_record_payment_failure`
--     (0295) records a decline as an event and never touches a paid row, and
--     there is no refund or void path for rental. When one is built it must
--     call `gl_reverse` on the `RENTAL_PAYMENT` entry.
--   · No RLS change. No table change. No UI.
-- =============================================================================


-- ── 1 · the document number, one arithmetic ──────────────────────────────────
-- Used by the poster AND the unposted read, so the two can never disagree about
-- which entry belongs to which month. `lpad` is given a width of at least the
-- number's own length because `lpad` TRUNCATES a longer string.
create or replace function public._rental_payment_doc_no(p_agreement_no text, p_seq integer)
returns text
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select p_agreement_no || '-M' || lpad(p_seq::text, greatest(2, length(p_seq::text)), '0')
$fn$;

comment on function public._rental_payment_doc_no(text, integer) is
  'The ledger document number of one collected rental month: <agreement no>-M<seq>, e.g. RA-1003-M07 (0473).';

revoke all on function public._rental_payment_doc_no(text, integer) from public, anon, authenticated;


-- ── 2 · the poster — one collected month becomes one journal entry ───────────
-- Called by `rental_record_payment` after the month is marked paid. Returns the
-- gl_entries.id, or null for the two quiet skips. Raises for everything else,
-- and the caller does not catch it: there is no `exception when others` around
-- a ledger call in this file, on purpose (see 0463's failure decision).
create or replace function public._rental_payment_to_ledger(p_billing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_bill     rental_billings;
  v_ra       rental_agreements;
  v_go_live  date;
  v_paid_on  date;
  v_amount   numeric(12,2);
  v_word     text;
  v_method   text;
  v_channel  text;
  v_money    text;
  v_income   text;
  v_doc_no   text;
begin
  select * into v_bill from rental_billings where id = p_billing_id;
  if not found then
    raise exception 'rental instalment not found'
      using errcode = '42P01', detail = 'billing_not_found';
  end if;
  if v_bill.status <> 'paid' or v_bill.paid_at is null then
    raise exception 'instalment % has not been collected, so there is nothing to post', v_bill.seq
      using errcode = '22023', detail = 'billing_not_paid';
  end if;

  select * into v_ra from rental_agreements where id = v_bill.agreement_id;

  select go_live_on into v_go_live from gl_config where id;
  if v_go_live is null then
    raise exception 'the ledger has no go-live date — gl_config is not configured'
      using errcode = '22023', detail = 'gl_not_configured';
  end if;

  -- The business day in Malaysia, never the server's day.
  v_paid_on := (v_bill.paid_at at time zone 'Asia/Kuala_Lumpur')::date;
  if v_paid_on < v_go_live then
    return null;                       -- ruling L. Quietly. Not an error.
  end if;

  v_amount := round(coalesce(v_bill.paid_amount, 0), 2);
  if v_amount < 0 then
    raise exception 'a rental collection of % cannot be posted', v_bill.paid_amount
      using errcode = '22023', detail = 'invalid_amount';
  end if;
  if v_amount = 0 then
    return null;                       -- nothing moved.
  end if;

  -- Rental keeps its own method words; the helper speaks the customer-payment
  -- dictionary. Translate the word, then ASK — the account is never decided here.
  v_word := nullif(btrim(coalesce(v_bill.method, '')), '');
  v_channel := null;
  v_method := case v_word
    when 'bank_transfer' then 'bank'
    when 'stripe'        then 'online'
    when 'settlement'    then 'bank'
    else v_word
  end;
  if v_word = 'stripe' then
    v_channel := 'stripe_checkout';
  end if;

  v_money := public.gl_account_for_payment_method(v_method, v_channel);
  if v_money is null then
    raise exception 'rental collection method % has no ledger account — map the payment method % before recording this collection',
      coalesce(v_word, 'null'), coalesce(v_method, 'null')
      using errcode = '22023', detail = 'payment_account_unmapped';
  end if;

  -- Exact key only. The wildcard GOODS row is furniture income.
  select m.account_code into v_income
    from gl_income_account_map m
   where m.component_type = 'GOODS' and m.component_key = 'rental';
  if v_income is null then
    raise exception 'rental income has no ledger account — map GOODS / rental to the rental income account before recording this collection'
      using errcode = '22023', detail = 'rental_income_unmapped';
  end if;

  v_doc_no := public._rental_payment_doc_no(v_ra.agreement_no, v_bill.seq);

  return public.gl_post(
    'RENTAL_PAYMENT',
    v_doc_no,
    v_paid_on,
    format('Rental collection %s · month %s of %s', v_ra.agreement_no, v_bill.seq, v_ra.term_months),
    jsonb_build_array(
      jsonb_build_object(
        'account_code', v_money,
        'debit',  v_amount,
        'credit', 0,
        'memo',   format('%s %s', coalesce(v_word, 'null'),
                         coalesce(nullif(btrim(coalesce(v_bill.reference, '')), ''), v_doc_no))
      ),
      jsonb_build_object(
        'account_code', v_income,
        'debit',  0,
        'credit', v_amount,
        'memo',   format('Rent %s month %s', v_ra.agreement_no, v_bill.seq)
      )
    )
  );
end;
$fn$;

comment on function public._rental_payment_to_ledger(uuid) is
  'One collected rental month -> one RENTAL_PAYMENT journal entry: Dr the payment method''s money account, Cr rental income (0473). Null when paid before go-live or collected at zero. Private; called by rental_record_payment.';

revoke all on function public._rental_payment_to_ledger(uuid) from public, anon, authenticated;


-- ── 3 · the one writer, now with its ledger step ─────────────────────────────
-- Copied from 0281:198-330, its only definition (0295 adds a separate
-- `_failure` function; 0300 calls this one and never redefines it). Changed:
--   · declare `v_entry`
--   · the idempotent early return reports the entry that already stands
--   · after the audit row: `_rental_payment_to_ledger`
--   · the return carries `glEntryId`
-- Signature, gate, resolution, split, update, event row and audit row are
-- byte-for-byte 0281. If you `create or replace` this again, start from HERE.

CREATE OR REPLACE FUNCTION public.rental_record_payment(
  p_agreement_id      uuid    DEFAULT NULL,
  p_seq               integer DEFAULT NULL,
  p_stripe_invoice_id text    DEFAULT NULL,
  p_amount            numeric DEFAULT NULL,
  p_paid_at           timestamptz DEFAULT NULL,
  p_method            text    DEFAULT NULL,
  p_reference         text    DEFAULT NULL,
  p_note              text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_is_service boolean := coalesce((SELECT auth.jwt()->>'role'), '') = 'service_role';
  v_bill       rental_billings;
  v_ra         rental_agreements;
  v_amount     numeric(12,2);
  v_supplier   numeric(12,2);
  v_commission numeric(12,2);
  v_carres     numeric(12,2);
  v_invoice    text := nullif(btrim(coalesce(p_stripe_invoice_id, '')), '');
  v_entry      uuid;   -- 0473
BEGIN
  -- Finance/principal at a desk, or the Stripe webhook's service_role JWT.
  -- Deliberately NOT is_internal(): that admits bd, and a BD sells these.
  IF NOT (public.rental_can_approve() OR v_is_service) THEN
    RAISE EXCEPTION 'Only finance or the principal may record a rental collection'
      USING errcode = '42501', detail = 'forbidden';
  END IF;

  -- Resolution, most specific first. The invoice id wins because it is the only
  -- identifier that survives Stripe re-delivering the same event (and the only
  -- one immune to the due-date drift in CF rental-billing-anchor-drift).
  IF v_invoice IS NOT NULL THEN
    SELECT * INTO v_bill FROM rental_billings
     WHERE stripe_invoice_id = v_invoice
     FOR UPDATE;
  END IF;

  IF NOT FOUND OR v_bill.id IS NULL THEN
    IF p_agreement_id IS NULL THEN
      RAISE EXCEPTION 'Nothing to record against: give an agreement or a known invoice'
        USING errcode = 'P0001', detail = 'billing_not_found';
    END IF;
    IF p_seq IS NOT NULL THEN
      SELECT * INTO v_bill FROM rental_billings
       WHERE agreement_id = p_agreement_id AND seq = p_seq
       FOR UPDATE;
    ELSE
      -- No seq named: the OLDEST instalment still owing. This is how a fresh
      -- Stripe invoice maps onto the schedule, and why the schedule's own dates
      -- never have to line up with Stripe's calendar.
      SELECT * INTO v_bill FROM rental_billings
       WHERE agreement_id = p_agreement_id AND status <> 'paid'
       ORDER BY seq
       LIMIT 1
       FOR UPDATE;
    END IF;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No matching instalment to record'
        USING errcode = 'P0001', detail = 'billing_not_found';
    END IF;
  END IF;

  SELECT * INTO v_ra FROM rental_agreements WHERE id = v_bill.agreement_id;

  -- Idempotent. Stripe delivers at-least-once and the POS poll races the
  -- webhook; a second delivery must be a no-op, not a double collection.
  IF v_bill.status = 'paid' THEN
    RETURN jsonb_build_object(
      'already',         true,
      'billingId',       v_bill.id,
      'seq',             v_bill.seq,
      'agreementNo',     v_ra.agreement_no,
      'paidAmount',      v_bill.paid_amount,
      'supplierShare',   v_bill.supplier_share,
      'commissionShare', v_bill.commission_share,
      -- 0473: the entry that already stands (null before go-live or at zero).
      'glEntryId',       (SELECT e.id FROM gl_entries e
                           WHERE e.source_type = 'RENTAL_PAYMENT'
                             AND e.source_doc_no = public._rental_payment_doc_no(v_ra.agreement_no, v_bill.seq)
                             AND e.posted AND NOT e.reversed)
    );
  END IF;

  v_amount := round(coalesce(p_amount, v_bill.amount_due), 2);

  -- The split is computed HERE from the agreement's own snapshot rates. A
  -- caller never sends money figures — the same doctrine that keeps the POS
  -- from pricing its own sofas. Mirrors rentalMonthlySplit(): both rounded
  -- shares first, Carres takes the remainder, so the three always sum exactly.
  v_supplier   := round(v_amount * coalesce(v_ra.supplier_rate_pct, 0) / 100, 2);
  v_commission := round(v_amount * coalesce(v_ra.commission_base_pct, 0) / 100, 2);
  v_carres     := round(v_amount - v_supplier - v_commission, 2);

  UPDATE rental_billings
     SET status            = 'paid',
         paid_at           = coalesce(p_paid_at, now()),
         paid_amount       = v_amount,
         method            = coalesce(nullif(btrim(coalesce(p_method, '')), ''), method),
         reference         = coalesce(nullif(btrim(coalesce(p_reference, '')), ''), reference),
         stripe_invoice_id = coalesce(v_invoice, stripe_invoice_id),
         supplier_share    = v_supplier,
         commission_share  = v_commission,
         recorded_by       = auth.uid()
   WHERE id = v_bill.id
   RETURNING * INTO v_bill;

  INSERT INTO rental_billing_events (
    agreement_id, billing_id, seq, kind, amount, method, reference,
    stripe_invoice_id, note, actor, actor_text
  ) VALUES (
    v_ra.id, v_bill.id, v_bill.seq, 'payment_recorded', v_amount,
    v_bill.method, v_bill.reference, v_bill.stripe_invoice_id,
    nullif(btrim(coalesce(p_note, '')), ''),
    auth.uid(),
    CASE WHEN v_is_service THEN 'stripe-webhook' ELSE 'finance' END
  );

  INSERT INTO audit_log (role, actor_text, action, dealer_id, ref)
  VALUES (NULL,
          CASE WHEN v_is_service THEN 'stripe-webhook' ELSE 'rental-collection' END,
          'rental.payment_recorded', v_ra.dealer_id, v_ra.agreement_no);

  -- ── 0473 · the ledger. Dr the money account, Cr rental income. A month
  -- paid before go-live, or at zero, returns null quietly. Anything else
  -- that goes wrong raises and rolls the whole collection back — the month
  -- stays unpaid and the caller sees why. Not caught, on purpose.
  v_entry := public._rental_payment_to_ledger(v_bill.id);

  RETURN jsonb_build_object(
    'already',         false,
    'billingId',       v_bill.id,
    'seq',             v_bill.seq,
    'agreementNo',     v_ra.agreement_no,
    'paidAmount',      v_amount,
    'supplierShare',   v_supplier,
    'commissionShare', v_commission,
    'carresShare',     v_carres,
    'glEntryId',       v_entry   -- 0473
  );
END;
$function$;

comment on function public.rental_record_payment(uuid, integer, text, numeric, timestamptz, text, text, text) is
  'The ONE writer of rental_billings (0281): finance/principal at a desk or the Stripe webhook''s service_role. Idempotent by stripe_invoice_id / paid status. Computes the supplier/commission split server-side. 0473: every collection on or after go-live also posts one RENTAL_PAYMENT journal entry (Dr money account, Cr rental income); a refused posting rolls the collection back.';


-- ── 4 · the read — collected after go-live, and not in the ledger ────────────
-- For the ledger Self-check page. After this file a collection cannot commit
-- without its entry, so this list can only hold months collected between
-- go-live and the day 0473 was applied, or a month whose entry was later
-- reversed by hand. An empty list is the healthy answer.
create or replace function public.gl_rental_payments_unposted()
returns table (
  billing_id        uuid,
  agreement_id      uuid,
  agreement_no      text,
  seq               integer,
  paid_on           date,
  paid_amount       numeric(12,2),
  method            text,
  reference         text,
  stripe_invoice_id text,
  doc_no            text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
#variable_conflict use_column
declare
  v_go_live date;
begin
  -- Fail closed, like every ledger report (0465).
  if not public.gl_may_read() then
    raise exception 'gl reports are internal only'
      using errcode = '42501';
  end if;

  select c.go_live_on into v_go_live from public.gl_config c where c.id;
  if v_go_live is null then
    return;
  end if;

  return query
  select b.id,
         b.agreement_id,
         ra.agreement_no,
         b.seq,
         (b.paid_at at time zone 'Asia/Kuala_Lumpur')::date,
         round(b.paid_amount, 2)::numeric(12,2),
         b.method,
         b.reference,
         b.stripe_invoice_id,
         public._rental_payment_doc_no(ra.agreement_no, b.seq)
    from public.rental_billings b
    join public.rental_agreements ra on ra.id = b.agreement_id
   where b.status = 'paid'
     and b.paid_at is not null
     and (b.paid_at at time zone 'Asia/Kuala_Lumpur')::date >= v_go_live
     and round(coalesce(b.paid_amount, 0), 2) > 0
     and not exists (
       select 1 from public.gl_entries e
        where e.source_type = 'RENTAL_PAYMENT'
          and e.source_doc_no = public._rental_payment_doc_no(ra.agreement_no, b.seq)
          and e.posted and not e.reversed)
   order by 5, 3, 4;
end;
$fn$;

comment on function public.gl_rental_payments_unposted() is
  'Rental months collected on or after go-live with no active RENTAL_PAYMENT ledger entry (0473). finance + principal only. Empty is healthy.';

revoke all on function public.gl_rental_payments_unposted() from public, anon;
grant execute on function public.gl_rental_payments_unposted() to authenticated;

-- `create or replace` keeps 0281's grants; restated so this file alone says
-- who may call the writer.
revoke all on function public.rental_record_payment(uuid, integer, text, numeric, timestamptz, text, text, text) from public, anon;
grant execute on function public.rental_record_payment(uuid, integer, text, numeric, timestamptz, text, text, text)
  to authenticated, service_role;


-- ── 5 · sanity ───────────────────────────────────────────────────────────────
do $sanity$
declare
  v_n        int;
  v_src      text;
  v_args     text;
  v_go_live  date;
  v_money    text;
  v_income   text;
  v_cust     uuid;
  v_ra       uuid;
  v_out      jsonb;
  v_again    jsonb;
  v_pre      jsonb;
  v_entry    uuid;
  v_dr_acct  text;
  v_cr_acct  text;
  v_dr       numeric;
  v_cr       numeric;
  v_edate    date;
begin
  -- 1 · one writer, same signature, the 0281 body still inside it.
  select count(*) into v_n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'rental_record_payment';
  if v_n <> 1 then
    raise exception '0473 sanity: expected 1 rental_record_payment, found %', v_n;
  end if;
  select oidvectortypes(p.proargtypes), p.prosrc into v_args, v_src
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'rental_record_payment';
  if v_args <> 'uuid, integer, text, numeric, timestamp with time zone, text, text, text' then
    raise exception '0473 sanity: rental_record_payment signature drifted: %', v_args;
  end if;
  if v_src not like '%_rental_payment_to_ledger(v_bill.id)%' then
    raise exception '0473 sanity: rental_record_payment does not post to the ledger';
  end if;
  if v_src not like '%rental_can_approve() OR v_is_service%'
     or v_src not like '%supplier_rate_pct%'
     or v_src not like '%''payment_recorded''%'
     or v_src not like '%rental.payment_recorded%'
     or v_src not like '%IF v_bill.status = ''paid'' THEN%' then
    raise exception '0473 sanity: rental_record_payment lost part of its 0281 body';
  end if;
  if v_src ~* 'exception\s+when' then
    raise exception '0473 sanity: a ledger failure must roll the collection back, not be caught';
  end if;

  -- 2 · who may call what.
  if has_function_privilege('anon',
       'public.rental_record_payment(uuid, integer, text, numeric, timestamptz, text, text, text)', 'execute')
     or not has_function_privilege('authenticated',
       'public.rental_record_payment(uuid, integer, text, numeric, timestamptz, text, text, text)', 'execute')
     or not has_function_privilege('service_role',
       'public.rental_record_payment(uuid, integer, text, numeric, timestamptz, text, text, text)', 'execute') then
    raise exception '0473 sanity: rental_record_payment grants are wrong';
  end if;
  if has_function_privilege('authenticated', 'public._rental_payment_to_ledger(uuid)', 'execute')
     or has_function_privilege('anon', 'public._rental_payment_to_ledger(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._rental_payment_doc_no(text, integer)', 'execute') then
    raise exception '0473 sanity: the private rental posting helpers are callable over the API';
  end if;
  if has_function_privilege('anon', 'public.gl_rental_payments_unposted()', 'execute')
     or not has_function_privilege('authenticated', 'public.gl_rental_payments_unposted()', 'execute') then
    raise exception '0473 sanity: gl_rental_payments_unposted grants are wrong';
  end if;

  -- 3 · the document number.
  if public._rental_payment_doc_no('RA-1003', 7) <> 'RA-1003-M07'
     or public._rental_payment_doc_no('RA-1003', 84) <> 'RA-1003-M84'
     or public._rental_payment_doc_no('RA-1003', 123) <> 'RA-1003-M123' then
    raise exception '0473 sanity: the rental document number is wrong';
  end if;

  -- 4 · a Stripe-style collection with NO user posts, a retry does not post
  --     twice, and a month paid before go-live does not post. Runs inside a
  --     block that always raises, so every row it writes is rolled back. The
  --     agreement number is given explicitly so the RA sequence is not used.
  select c.go_live_on into v_go_live from public.gl_config c where c.id;
  v_money  := public.gl_account_for_payment_method('online', 'stripe_checkout');
  select m.account_code into v_income from public.gl_income_account_map m
   where m.component_type = 'GOODS' and m.component_key = 'rental';
  if v_go_live is null or v_money is null or v_income is null then
    raise warning '0473 sanity: probe skipped — go-live %, Stripe money account %, rental income account %. A rental collection will REFUSE until these are configured.',
      coalesce(v_go_live::text, 'MISSING'), coalesce(v_money, 'UNMAPPED'), coalesce(v_income, 'UNMAPPED');
  else
    begin
      perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
      perform set_config('request.jwt.claim.sub', '', true);

      insert into public.customers (name, phone, phone_key)
      values ('Probe 0473', '+60 00-000 0473', 'probe-0473')
      returning id into v_cust;
      insert into public.rental_agreements
        (agreement_no, customer_id, sku, term_months, monthly_fee, start_date, status)
      values ('RA-PROBE-0473', v_cust, 'PROBE-SKU', 2, 59, v_go_live - 40, 'active')
      returning id into v_ra;
      insert into public.rental_billings (agreement_id, seq, due_date, amount_due, status)
      values (v_ra, 1, v_go_live, 59, 'due'), (v_ra, 2, v_go_live - 30, 59, 'due');

      v_out := public.rental_record_payment(
        p_agreement_id => v_ra, p_seq => 1, p_stripe_invoice_id => 'in_probe_0473',
        p_amount => 59, p_paid_at => (v_go_live::timestamp + interval '12 hours') at time zone 'Asia/Kuala_Lumpur',
        p_method => 'stripe', p_reference => 'in_probe_0473');
      v_entry := nullif(v_out->>'glEntryId', '')::uuid;
      if v_entry is null then
        raise exception '0473 sanity: a no-user Stripe collection did not post';
      end if;

      select e.entry_date into v_edate from public.gl_entries e where e.id = v_entry;
      select l.account_code, l.debit into v_dr_acct, v_dr from public.gl_entry_lines l
       where l.entry_id = v_entry and l.debit > 0;
      select l.account_code, l.credit into v_cr_acct, v_cr from public.gl_entry_lines l
       where l.entry_id = v_entry and l.credit > 0;
      if v_edate <> v_go_live or v_dr_acct <> v_money or v_cr_acct <> v_income
         or v_dr <> 59 or v_cr <> 59 then
        raise exception '0473 sanity: wrong entry — date %, Dr % %, Cr % %',
          v_edate, v_dr_acct, v_dr, v_cr_acct, v_cr;
      end if;

      v_again := public.rental_record_payment(
        p_stripe_invoice_id => 'in_probe_0473', p_method => 'stripe');
      if not coalesce((v_again->>'already')::boolean, false)
         or nullif(v_again->>'glEntryId', '')::uuid is distinct from v_entry then
        raise exception '0473 sanity: a re-delivered collection did not return the entry that stands';
      end if;
      select count(*) into v_n from public.gl_entries e
       where e.source_type = 'RENTAL_PAYMENT' and e.source_doc_no = 'RA-PROBE-0473-M01';
      if v_n <> 1 then
        raise exception '0473 sanity: expected 1 entry for RA-PROBE-0473-M01, found %', v_n;
      end if;

      v_pre := public.rental_record_payment(
        p_agreement_id => v_ra, p_seq => 2, p_amount => 59,
        p_paid_at => (v_go_live::timestamp - interval '12 hours') at time zone 'Asia/Kuala_Lumpur',
        p_method => 'stripe');
      if v_pre->>'glEntryId' is not null then
        raise exception '0473 sanity: a collection paid before go-live reached the ledger';
      end if;

      -- Nothing is wrong. This is how the probe's rows are undone.
      raise exception 'gl_0473_probe_rollback';
    exception when others then
      if sqlerrm <> 'gl_0473_probe_rollback' then
        raise;
      end if;
    end;
  end if;

  raise notice '0473 OK: a rental collection reaches the ledger';
end $sanity$;
