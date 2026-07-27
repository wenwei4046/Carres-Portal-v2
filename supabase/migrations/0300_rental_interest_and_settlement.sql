-- =============================================================================
-- 0300 — late interest, and paying the whole thing off early
--
-- Loo, 2026-07-27: "先做罚息 + 买断结清，一个 PR."
--
-- Two things the T&C and the locked proposal both promise and the system could
-- not do. `rental_agreements` has carried `buyout_at` / `buyout_amount` and the
-- `buyout_pending` status since 0249, and `rental_billings` has carried
-- `late_interest` / `interest_charged_at` since 0281 — all of it with no writer.
-- This gives them one each.
--
-- ── 1 · accrued vs CHARGED — the distinction the whole design rests on ───────
-- Interest owed grows every day. A figure stored today is wrong tomorrow, which
-- is the same trap `late` avoids by being derived on the read. So:
--
--   * ACCRUED  = a pure function of (amount, days late). Derived on the read,
--                never stored, never stale. The API already has the numbers.
--   * CHARGED  = a human act at a moment: this figure, now, onto their bill.
--                THAT is what `late_interest` + `interest_charged_at` hold.
--
-- Storing only the charge means the two can never silently disagree, and the
-- screen can honestly show "accrued RM12.40 · charged RM9.44 on 21 Aug".
--
-- ── 2 · the one-writer law, honoured with a named seam ───────────────────────
-- 0281 made `rental_record_payment` the ONLY writer of `rental_billings`, and
-- 0295 kept that (a decline writes an event, never the table). This migration
-- does not break it:
--
--   * `rental_charge_late_interest` touches EXACTLY two columns — late_interest
--     and interest_charged_at. It cannot mark money received; the sanity block
--     asserts it never writes status / paid_amount / the split columns.
--   * `rental_settle_agreement` writes NOTHING in rental_billings itself. It
--     CALLS `rental_record_payment` once per remaining month. That is not a
--     workaround, it is the point: one split implementation, one history trail,
--     and each month genuinely was paid — in one transfer instead of thirty-four.
--
-- ── 3 · the split is on RENT, not on the penalty ─────────────────────────────
-- Loo's rates are "of every RM59 COLLECTED, 49% supplier / 20% sales". A late
-- penalty is not rent. Handing a supplier 49% of a customer's punishment is a
-- policy nobody has decided, so each settled month is recorded at its own
-- `amount_due` — the split lands exactly as it always has — and the interest
-- rides the settlement event as its own figure. `buyout_amount` is the sum of
-- both, because that IS what the customer paid.
--
-- ── 4 · a discounted settlement is REFUSED, not guessed ──────────────────────
-- The locked rule is "pays the remaining term in one shot". Real settlements are
-- often discounted, and nobody has ruled on how a discount spreads across
-- thirty-four months and two payees. Rather than invent an allocation that
-- quietly shorts a supplier, an amount that does not equal the remaining total
-- is refused, and the error carries the exact figure so finance can see why.
--
-- ── 5 · no document, no settlement ───────────────────────────────────────────
-- Loo: "the customer signs it first, then it is attached to the agreement."
-- Enforced the way 0279 enforced the signature — by construction, in the same
-- statement. There is no draft state to forget to finish.
--
-- ── 6 · settling is not owning ───────────────────────────────────────────────
-- The money side closes (`completed`); the unit stays Carres's and the RU asset
-- is deliberately untouched. Ownership transfers when the request-to-buy form is
-- signed, which is a later, separate step (still unbuilt).
-- =============================================================================

BEGIN;

-- ── 1 · room for the two new facts ───────────────────────────────────────────
ALTER TABLE public.rental_agreements
  ADD COLUMN IF NOT EXISTS settlement_doc_path text;

COMMENT ON COLUMN public.rental_agreements.settlement_doc_path IS
  'The signed supporting document for an early settlement, in the private rental-agreements bucket (0300). Required: no document, no settlement.';

ALTER TABLE public.rental_billing_events
  DROP CONSTRAINT IF EXISTS rental_billing_events_kind_check;
ALTER TABLE public.rental_billing_events
  ADD CONSTRAINT rental_billing_events_kind_check CHECK (kind IN (
    'payment_recorded', 'interest_charged',
    'payment_failed',
    -- 0300: the customer paid the remaining term off in one go.
    'settled',
    'reminder_sent', 'call_task_assigned', 'warning_sent',
    'bureau_escalated', 'bureau_response', 'resolved', 'written_off'
  ));

-- ── 2 · the arithmetic, mirrored from packages/shared ────────────────────────
-- Same duplication as the due-date calendar (CF rental-two-calendar-
-- implementations) and for the same unavoidable reason: the DB cannot import
-- TypeScript. Both sides assert the SAME worked examples, so changing one
-- without the other fails a test rather than silently drifting.
--   8% per month, SIMPLE, pro-rata BY DAY (a 30-day month is the divisor).
--   RM59 · 30 days = RM4.72 · 15 days = RM2.36 · 60 days = RM9.44
CREATE OR REPLACE FUNCTION public.rental_late_interest(
  p_amount numeric,
  p_days   integer,
  p_rate_pct_per_month numeric DEFAULT 8
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE
    WHEN coalesce(p_days, 0) <= 0 OR coalesce(p_amount, 0) <= 0 THEN 0::numeric
    ELSE round(p_amount * p_rate_pct_per_month * p_days / (100 * 30), 2)
  END
$function$;

COMMENT ON FUNCTION public.rental_late_interest(numeric, integer, numeric) IS
  '8%/month SIMPLE late interest, pro-rata by day. Mirror of rentalLateInterest() in packages/shared — change one, change both (0300).';

-- ── 3 · charging it: a human act, a server figure ────────────────────────────
CREATE OR REPLACE FUNCTION public.rental_charge_late_interest(
  p_agreement_id uuid,
  p_seq          integer,
  p_as_of        date DEFAULT NULL,
  p_note         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_is_service boolean := coalesce((SELECT auth.jwt()->>'role'), '') = 'service_role';
  v_bill     rental_billings;
  v_ra       rental_agreements;
  v_as_of    date := coalesce(p_as_of, current_date);
  v_days     integer;
  v_interest numeric(12,2);
BEGIN
  -- Same gate as the payment RPCs: finance/principal at a desk, or the webhook.
  -- Deliberately NOT is_internal() — that admits bd, and a BD sells these.
  IF NOT (public.rental_can_approve() OR v_is_service) THEN
    RAISE EXCEPTION 'Only finance or the principal may charge late interest'
      USING errcode = '42501', detail = 'forbidden';
  END IF;

  SELECT * INTO v_ra FROM rental_agreements WHERE id = p_agreement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agreement not found' USING errcode = 'P0001', detail = 'agreement_not_found';
  END IF;

  SELECT * INTO v_bill FROM rental_billings
   WHERE agreement_id = p_agreement_id AND seq = p_seq
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such instalment' USING errcode = 'P0001', detail = 'billing_not_found';
  END IF;

  -- Interest is for money still owed. A collected, waived or written-off month
  -- cannot grow a penalty.
  IF v_bill.status <> 'due' AND v_bill.status <> 'overdue' THEN
    RAISE EXCEPTION 'That instalment is not owing (%)' , v_bill.status
      USING errcode = 'P0001', detail = 'not_owing';
  END IF;

  v_days := v_as_of - v_bill.due_date;
  IF v_days <= 0 THEN
    RAISE EXCEPTION 'That instalment is not late yet'
      USING errcode = 'P0001', detail = 'not_overdue';
  END IF;

  v_interest := public.rental_late_interest(v_bill.amount_due, v_days);
  IF v_interest <= 0 THEN
    RAISE EXCEPTION 'Nothing to charge' USING errcode = 'P0001', detail = 'no_interest';
  END IF;

  -- Re-running on the same day for the same figure is a no-op rather than a
  -- second identical line on the customer's history. Re-running LATER is not:
  -- interest has grown, and bringing the charge up to date is a real act.
  IF v_bill.late_interest IS NOT DISTINCT FROM v_interest
     AND v_bill.interest_charged_at::date IS NOT DISTINCT FROM v_as_of THEN
    RETURN jsonb_build_object(
      'already', true, 'seq', v_bill.seq, 'daysLate', v_days,
      'interest', v_interest, 'agreementNo', v_ra.agreement_no
    );
  END IF;

  -- The ONLY two columns this function is allowed to touch. Money received is
  -- rental_record_payment's alone (0281); the sanity block below asserts it.
  UPDATE rental_billings
     SET late_interest       = v_interest,
         interest_charged_at = now()
   WHERE id = v_bill.id;

  INSERT INTO rental_billing_events (
    agreement_id, billing_id, seq, kind, amount, note, actor, actor_text
  ) VALUES (
    v_ra.id, v_bill.id, v_bill.seq, 'interest_charged', v_interest,
    coalesce(nullif(btrim(coalesce(p_note, '')), ''),
             format('%s days late at 8%%/month', v_days)),
    auth.uid(),
    CASE WHEN v_is_service THEN 'stripe-webhook' ELSE 'finance' END
  );

  INSERT INTO audit_log (role, actor_text, action, dealer_id, ref)
  VALUES (NULL, 'rental-collection', 'rental.interest_charged', v_ra.dealer_id, v_ra.agreement_no);

  RETURN jsonb_build_object(
    'already', false, 'seq', v_bill.seq, 'daysLate', v_days,
    'interest', v_interest, 'agreementNo', v_ra.agreement_no
  );
END;
$function$;

-- ── 4 · what settling would cost, worked out by the server ───────────────────
-- The client never computes money it is about to commit — the sofa-P4 trust-gate
-- doctrine. This is the figure the confirm dialog shows AND the figure the
-- settlement demands, from one place, so they cannot disagree.
CREATE OR REPLACE FUNCTION public.rental_settlement_quote(p_agreement_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ra       rental_agreements;
  v_months   integer;
  v_rent     numeric(12,2);
  v_interest numeric(12,2);
BEGIN
  IF NOT (SELECT public.is_internal()) THEN
    RAISE EXCEPTION 'Internal only' USING errcode = '42501', detail = 'forbidden';
  END IF;

  SELECT * INTO v_ra FROM rental_agreements WHERE id = p_agreement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agreement not found' USING errcode = 'P0001', detail = 'agreement_not_found';
  END IF;

  SELECT count(*)::integer,
         coalesce(sum(amount_due), 0)::numeric(12,2),
         coalesce(sum(late_interest), 0)::numeric(12,2)
    INTO v_months, v_rent, v_interest
    FROM rental_billings
   WHERE agreement_id = p_agreement_id AND status IN ('due', 'overdue');

  RETURN jsonb_build_object(
    'agreementNo',  v_ra.agreement_no,
    'status',       v_ra.status,
    'monthsLeft',   v_months,
    'rentRemaining', v_rent,
    -- Interest already CHARGED on those months. Accrued-but-uncharged interest
    -- is deliberately not swept in here: settling should not silently bill a
    -- penalty nobody ever put on the customer's account.
    'interestCharged', v_interest,
    'total',        (v_rent + v_interest)::numeric(12,2)
  );
END;
$function$;

-- ── 5 · settling ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rental_settle_agreement(
  p_agreement_id uuid,
  p_amount       numeric,
  p_doc_path     text,
  p_reference    text DEFAULT NULL,
  p_note         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ra       rental_agreements;
  v_doc      text := nullif(btrim(coalesce(p_doc_path, '')), '');
  v_months   integer;
  v_rent     numeric(12,2);
  v_interest numeric(12,2);
  v_total    numeric(12,2);
  v_seqs     integer[];
  v_seq      integer;
BEGIN
  -- A settlement is a desk decision about a live credit contract. No webhook,
  -- no bd: finance or the principal, the same pair that approves one.
  IF NOT public.rental_can_approve() THEN
    RAISE EXCEPTION 'Only finance or the principal may settle a rental'
      USING errcode = '42501', detail = 'forbidden';
  END IF;

  -- No document, no settlement (Loo). Enforced here rather than in the route so
  -- the PostgREST door cannot route around it.
  IF v_doc IS NULL THEN
    RAISE EXCEPTION 'Attach the signed settlement document first'
      USING errcode = 'P0001', detail = 'settlement_doc_required';
  END IF;
  IF v_doc NOT LIKE 'rental-agreements/%' THEN
    RAISE EXCEPTION 'The settlement document must live in the rental-agreements bucket'
      USING errcode = 'P0001', detail = 'invalid_settlement_doc_path';
  END IF;

  SELECT * INTO v_ra FROM rental_agreements WHERE id = p_agreement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agreement not found' USING errcode = 'P0001', detail = 'agreement_not_found';
  END IF;
  IF v_ra.status <> 'active' THEN
    RAISE EXCEPTION 'Only a live rental can be settled (this one is %)', v_ra.status
      USING errcode = 'P0001', detail = 'agreement_not_active';
  END IF;

  SELECT count(*)::integer,
         coalesce(sum(amount_due), 0)::numeric(12,2),
         coalesce(sum(late_interest), 0)::numeric(12,2)
    INTO v_months, v_rent, v_interest
    FROM rental_billings
   WHERE agreement_id = p_agreement_id AND status IN ('due', 'overdue');

  IF v_months = 0 THEN
    RAISE EXCEPTION 'There is nothing left to settle'
      USING errcode = 'P0001', detail = 'nothing_to_settle';
  END IF;

  v_total := (v_rent + v_interest)::numeric(12,2);
  -- A discount is a policy nobody has ruled on (see the header). Refuse, and
  -- say the number, rather than invent how it spreads across months and payees.
  IF round(coalesce(p_amount, -1), 2) <> v_total THEN
    RAISE EXCEPTION 'Settlement must be the full remaining amount of %, got %', v_total, p_amount
      USING errcode = 'P0001', detail = 'amount_mismatch';
  END IF;

  -- Each month is genuinely collected — in one transfer instead of N. Going
  -- through rental_record_payment keeps 0281's single writer, its server-side
  -- split, and a per-month history line. Rent only: the penalty is not rent, so
  -- it does not enter the supplier/commission split.
  --
  -- The list of months is materialised into an array FIRST rather than looped
  -- over a live cursor: the loop body flips each row out of the very predicate
  -- the cursor selected on, and how much of that a cursor snapshot sees is not
  -- a thing to leave to reasoning when the subject is money.
  SELECT array_agg(seq ORDER BY seq) INTO v_seqs
    FROM rental_billings
   WHERE agreement_id = p_agreement_id AND status IN ('due', 'overdue');

  FOREACH v_seq IN ARRAY v_seqs LOOP
    PERFORM public.rental_record_payment(
      p_agreement_id      => p_agreement_id,
      p_seq               => v_seq,
      p_stripe_invoice_id => NULL,
      p_amount            => NULL,          -- the instalment's own amount_due
      p_paid_at           => now(),
      p_method            => 'settlement',
      p_reference         => nullif(btrim(coalesce(p_reference, '')), ''),
      p_note              => 'Early settlement'
    );
  END LOOP;

  UPDATE rental_agreements
     SET buyout_at           = now(),
         buyout_amount       = v_total,
         settlement_doc_path = v_doc,
         -- The money side is done. Ownership is a separate, later signature.
         status              = 'completed'
   WHERE id = p_agreement_id
   RETURNING * INTO v_ra;

  INSERT INTO rental_billing_events (
    agreement_id, billing_id, seq, kind, amount, method, reference, note, actor, actor_text
  ) VALUES (
    v_ra.id, NULL, NULL, 'settled', v_total, 'settlement',
    nullif(btrim(coalesce(p_reference, '')), ''),
    coalesce(nullif(btrim(coalesce(p_note, '')), ''),
             format('%s months settled early (rent %s + interest %s)', v_months, v_rent, v_interest)),
    auth.uid(), 'finance'
  );

  INSERT INTO audit_log (role, actor_text, action, dealer_id, ref)
  VALUES (NULL, 'rental-collection', 'rental.settled', v_ra.dealer_id, v_ra.agreement_no);

  RETURN jsonb_build_object(
    'agreementNo',      v_ra.agreement_no,
    'status',           v_ra.status,
    'monthsSettled',    v_months,
    'rentSettled',      v_rent,
    'interestSettled',  v_interest,
    'total',            v_total
  );
END;
$function$;

-- ── 6 · grants ───────────────────────────────────────────────────────────────
-- REVOKE FROM public alone does nothing and FROM anon alone does nothing either
-- — the pair plus an explicit grant back is the only working form.
REVOKE ALL ON FUNCTION public.rental_late_interest(numeric, integer, numeric) FROM public, anon;
REVOKE ALL ON FUNCTION public.rental_charge_late_interest(uuid, integer, date, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.rental_settlement_quote(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.rental_settle_agreement(uuid, numeric, text, text, text) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.rental_late_interest(numeric, integer, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rental_charge_late_interest(uuid, integer, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rental_settlement_quote(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rental_settle_agreement(uuid, numeric, text, text, text) TO authenticated, service_role;

-- ── 7 · sanity ───────────────────────────────────────────────────────────────
-- Assertions never RAISE inside their own EXCEPTION handler (a handler that
-- catches its own raise proves nothing) — flags, checked outside.
DO $$
DECLARE
  v_n integer;
  v_i numeric;
BEGIN
  -- the mirrored arithmetic, against the SAME worked examples as the TS tests
  IF public.rental_late_interest(59, 30) <> 4.72 THEN
    RAISE EXCEPTION '0300: RM59 for 30 days should be 4.72, got %', public.rental_late_interest(59, 30);
  END IF;
  IF public.rental_late_interest(59, 15) <> 2.36 THEN
    RAISE EXCEPTION '0300: RM59 for 15 days should be 2.36';
  END IF;
  IF public.rental_late_interest(59, 60) <> 9.44 THEN
    RAISE EXCEPTION '0300: RM59 for 60 days should be 9.44';
  END IF;
  -- simple, not compounding: 60 days must be exactly twice 30
  SELECT public.rental_late_interest(100, 60) - 2 * public.rental_late_interest(100, 30) INTO v_i;
  IF v_i <> 0 THEN RAISE EXCEPTION '0300: interest is compounding, it must be simple'; END IF;
  IF public.rental_late_interest(59, 0) <> 0 OR public.rental_late_interest(59, -3) <> 0
     OR public.rental_late_interest(0, 90) <> 0 THEN
    RAISE EXCEPTION '0300: interest must floor at zero';
  END IF;

  -- THE law: charging interest may not touch money-received columns
  IF pg_get_functiondef('public.rental_charge_late_interest(uuid, integer, date, text)'::regprocedure)
     ~* 'set[^;]*(paid_amount|supplier_share|commission_share)' THEN
    RAISE EXCEPTION '0300: charging interest writes a money-received column';
  END IF;
  -- and settling must not write rental_billings directly at all
  IF pg_get_functiondef('public.rental_settle_agreement(uuid, numeric, text, text, text)'::regprocedure)
     ~* '(update|insert into|delete from)\s+rental_billings' THEN
    RAISE EXCEPTION '0300: settlement writes rental_billings directly — it must go through rental_record_payment';
  END IF;
  IF pg_get_functiondef('public.rental_settle_agreement(uuid, numeric, text, text, text)'::regprocedure)
     !~* 'rental_record_payment' THEN
    RAISE EXCEPTION '0300: settlement does not call rental_record_payment';
  END IF;

  -- the ledger learned the new word, and kept the old ones
  SELECT count(*) INTO v_n FROM pg_constraint
   WHERE conrelid = 'public.rental_billing_events'::regclass
     AND conname  = 'rental_billing_events_kind_check'
     AND pg_get_constraintdef(oid) LIKE '%settled%'
     AND pg_get_constraintdef(oid) LIKE '%payment_failed%'
     AND pg_get_constraintdef(oid) LIKE '%interest_charged%'
     AND pg_get_constraintdef(oid) LIKE '%bureau_escalated%';
  IF v_n <> 1 THEN RAISE EXCEPTION '0300: the kind CHECK did not come back whole'; END IF;

  -- grants, both directions
  IF has_function_privilege('anon', 'public.rental_settle_agreement(uuid, numeric, text, text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rental_charge_late_interest(uuid, integer, date, text)', 'EXECUTE') THEN
    RAISE EXCEPTION '0300: anon can execute a money RPC';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.rental_settle_agreement(uuid, numeric, text, text, text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.rental_charge_late_interest(uuid, integer, date, text)', 'EXECUTE') THEN
    RAISE EXCEPTION '0300: authenticated CANNOT execute the new RPCs';
  END IF;

  -- no ghost overloads
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('rental_late_interest', 'rental_charge_late_interest',
                       'rental_settlement_quote', 'rental_settle_agreement');
  IF v_n <> 4 THEN RAISE EXCEPTION '0300: expected 4 new functions, found %', v_n; END IF;

  -- Who is allowed to write rental_billings at all. Exactly three, each with a
  -- different and named job:
  --   rental_approve_agreement    mints the schedule
  --   rental_record_payment       money received (and its split) — 0281's law
  --   rental_charge_late_interest interest owed, TWO columns only (asserted above)
  -- A fourth means the law has quietly drifted; the count is the tripwire.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname LIKE 'rental%'
     AND pg_get_functiondef(p.oid) ~* '(update|insert into)\s+rental_billings';
  IF v_n <> 3 THEN
    RAISE EXCEPTION '0300: expected exactly 3 writers of rental_billings, found %', v_n;
  END IF;
END $$;

COMMIT;
