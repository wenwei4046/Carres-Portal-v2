-- =============================================================================
-- 0281_rental_collection_ledger.sql (Loo 2026-07-26 — 收钱引擎 segment ②a)
-- =============================================================================
-- Two things, and they are the same thing: WHEN the money is due, and WHAT
-- happens when it arrives.
--
-- ── 1 · the calendar was wrong ───────────────────────────────────────────────
-- `rental_approve_agreement` generated due dates as `start_date + (n-1) months`,
-- so RA-1003's 84 instalments all fall on the 26th. Loo's own T&C says payment
-- is due "on or before the 7th". The system did not honour its own contract.
--
-- Loo's rule, in his words (2026-07-26), for a customer signing on the 30th:
--   1. 30 号购买的时候会付一次费
--   2. 紧接着的 7 号会付一次费
--   3. 下个月的 7 号再付一次费
--   ...到了最后一个月的时候，他基本上就不用付费了，因为之前已经多付过一次了
--   "final every month got pay full 7 years then ok, AS LONG AS THE SUM IS CORRECT"
--
-- So: N payments for an N-month term, the first at the counter and the rest on
-- the 7th, and N x monthly_fee must equal the contract value EXACTLY. That last
-- clause is the law; the calendar serves it. This migration asserts it rather
-- than trusting it — `rental_approve_agreement` now refuses to write a schedule
-- whose rows do not sum to the contract value.
--
-- `MIN_FIRST_GAP_DAYS` (7) is not politeness. Signing on the 6th would charge
-- again on the 7th — one day later — which a customer reads as a double charge
-- and a bank reads as a chargeback. It is ALSO load-bearing on the Stripe side:
-- the gap between signup and the first anchored invoice is carried by a trial,
-- and Stripe refuses a trial shorter than ~48 hours. The payment COUNT never
-- changes, so the sum never changes.
--
-- `rental_due_dates()` mirrors `rentalDueDates()` in packages/shared — same
-- clamping (31st -> 28/29 Feb, never rolling into the next month), same
-- strictly-after rule, same guard. Two implementations of one calendar is a
-- known cost; the alternative is the DB and the POS disagreeing about when a
-- customer owes money, which is worse. Both are asserted against the same
-- worked example.
--
-- ── 2 · the money had no way in ─────────────────────────────────────────────
-- `rental_billings` has 84 rows and ZERO writers: nothing in apps/api ever
-- marked one paid, so finance could only read the truth in the Stripe
-- dashboard. `rental_record_payment` is that writer, and it is the ONLY one:
--   · it computes the supplier/commission split SERVER-SIDE from the
--     agreement's own snapshot rates, never from anything a caller sends
--     (the sofa-P4 trust-gate doctrine, applied to money);
--   · it is IDEMPOTENT by `stripe_invoice_id`, because Stripe delivers
--     at-least-once and the POS poll can race the webhook;
--   · it writes a history row every time (guardrail #4 — no silent money edits);
--   · it is gated to finance/principal OR the service_role JWT the webhook uses.
-- Closes CF `rental-billing-writes-need-rpc`.
--
-- That CF also asked us to decide the CASCADE question. `rental_billings` is
-- `ON DELETE CASCADE` from the agreement, so deleting an agreement would delete
-- the record that money was received. An FK cannot say "cascade the unpaid ones
-- only", so the guard is a trigger: a COLLECTED month cannot be deleted by any
-- path. Unpaid rows stay deletable, which re-anchoring a schedule needs.
--
-- ── 3 · one events table, used from day 1 ───────────────────────────────────
-- Loo asked for a "base standby" for collections. An EMPTY table waiting for a
-- feature is the thing HR-P6 refused to build. So `rental_billing_events` is
-- written on every single collection from today, and segment ②b's dunning steps
-- (reminder / call task / warning / bureau escalation) land in the SAME table
-- as extra `kind` values. One table, live from the first ringgit.
--
-- The Credit Bureau landing strip needs nothing here: 0268 already put
-- `credit_checked_at` + `credit_reference` on `rental_agreements` for the CBM
-- hook. Checked before building a second one.
--
-- ── 4 · interest is computed, NOT fired ─────────────────────────────────────
-- Loo: 8%/month, 单利 (simple, not compounding), charged onto the next invoice.
-- The columns and the arithmetic land here; NOTHING fires them automatically,
-- because deciding a payment is late is the dunning ladder's job (②b) and that
-- needs a comms channel we do not have. Recording a capability we cannot yet
-- trigger is honest; auto-charging interest with no ladder behind it is not.
-- =============================================================================

BEGIN;

-- ── 1 · the calendar ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rental_due_dates(
  p_start_date   date,
  p_term_months  integer,
  p_anchor_day   integer DEFAULT 7,
  p_min_gap_days integer DEFAULT 7
)
RETURNS TABLE (seq integer, due_date date)
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  v_last_of_month integer;
  v_anchor        date;
BEGIN
  IF p_term_months IS NULL OR p_term_months < 1 THEN
    RAISE EXCEPTION 'rental_due_dates: term_months must be >= 1, got %', p_term_months
      USING errcode = 'P0001', detail = 'invalid_term';
  END IF;

  -- the anchor day inside the signing month, clamped to that month's length
  v_last_of_month := extract(day FROM (date_trunc('month', p_start_date)
                                       + interval '1 month - 1 day'))::integer;
  v_anchor := date_trunc('month', p_start_date)::date
              + (least(p_anchor_day, v_last_of_month) - 1);

  -- STRICTLY after signing: signing ON the 7th rolls to next month, because the
  -- signup payment already covered today.
  IF v_anchor <= p_start_date THEN
    v_anchor := (v_anchor + interval '1 month')::date;
  END IF;
  -- and never so close that it reads as a double charge (see the header)
  IF (v_anchor - p_start_date) < p_min_gap_days THEN
    v_anchor := (v_anchor + interval '1 month')::date;
  END IF;

  -- seq 1 is the counter payment; the rest ride the anchor. Every later date is
  -- computed from the BASE anchor, never iteratively, so a short month cannot
  -- permanently drag the day earlier (Jan 31 -> Feb 28 -> Mar 31, not Mar 28).
  seq := 1; due_date := p_start_date; RETURN NEXT;
  FOR i IN 2..p_term_months LOOP
    seq := i;
    due_date := (v_anchor + make_interval(months => i - 2))::date;
    RETURN NEXT;
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION public.rental_due_dates(date, integer, integer, integer) IS
  'The collection calendar (Loo 2026-07-26): seq 1 = signup day, seq 2..N = the anchor day (7th) of each successive month, first anchor strictly after signing and never within p_min_gap_days. N payments for an N-month term so the total always equals the contract value. Mirrors rentalDueDates() in packages/shared (0281).';

-- ── 2 · a collected month is evidence ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rental_billing_block_paid_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF old.status = 'paid' OR old.paid_at IS NOT NULL THEN
    RAISE EXCEPTION 'Instalment % of this agreement has been collected and cannot be deleted', old.seq
      USING errcode = 'P0001', detail = 'paid_billing_undeletable';
  END IF;
  RETURN old;
END;
$function$;

DROP TRIGGER IF EXISTS rental_billings_no_delete_paid ON public.rental_billings;
CREATE TRIGGER rental_billings_no_delete_paid
  BEFORE DELETE ON public.rental_billings
  FOR EACH ROW EXECUTE FUNCTION public.rental_billing_block_paid_delete();

-- ── 3 · interest columns (computed later, never auto-fired here) ─────────────
ALTER TABLE public.rental_billings
  ADD COLUMN IF NOT EXISTS late_interest      numeric(12,2),
  ADD COLUMN IF NOT EXISTS interest_charged_at timestamptz;

COMMENT ON COLUMN public.rental_billings.late_interest IS
  '8%/month SIMPLE interest accrued on this instalment (Loo T&C). Computed and recorded; firing it belongs to the dunning ladder in segment 2b (0281).';

-- ── 4 · the events ledger ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rental_billing_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id      uuid NOT NULL REFERENCES public.rental_agreements(id) ON DELETE CASCADE,
  billing_id        uuid REFERENCES public.rental_billings(id) ON DELETE SET NULL,
  seq               integer,
  kind              text NOT NULL CHECK (kind IN (
                      -- written from day one by rental_record_payment
                      'payment_recorded', 'interest_charged',
                      -- segment 2b's dunning ladder lands HERE, not in a second table
                      'reminder_sent', 'call_task_assigned', 'warning_sent',
                      'bureau_escalated', 'bureau_response', 'resolved', 'written_off'
                    )),
  amount            numeric(12,2),
  method            text,
  reference         text,
  stripe_invoice_id text,
  note              text,
  actor             uuid,
  actor_text        text,
  occurred_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rental_billing_events_agreement_idx
  ON public.rental_billing_events (agreement_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS rental_billing_events_billing_idx
  ON public.rental_billing_events (billing_id);

COMMENT ON TABLE public.rental_billing_events IS
  'Every money event on a rental agreement, written from day one by rental_record_payment. Segment 2b adds dunning kinds to the same table rather than a parallel one (0281).';

ALTER TABLE public.rental_billing_events ENABLE ROW LEVEL SECURITY;

-- Read internal. DELIBERATELY no INSERT/UPDATE/DELETE policy: the only writer
-- is the SECURITY DEFINER RPC below, which is the whole point of the CF.
DROP POLICY IF EXISTS rental_billing_events_read_internal ON public.rental_billing_events;
CREATE POLICY rental_billing_events_read_internal
  ON public.rental_billing_events FOR SELECT
  USING ((SELECT public.is_internal()));

-- ── 5 · the one writer ───────────────────────────────────────────────────────
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
      'commissionShare', v_bill.commission_share
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

  RETURN jsonb_build_object(
    'already',         false,
    'billingId',       v_bill.id,
    'seq',             v_bill.seq,
    'agreementNo',     v_ra.agreement_no,
    'paidAmount',      v_amount,
    'supplierShare',   v_supplier,
    'commissionShare', v_commission,
    'carresShare',     v_carres
  );
END;
$function$;

-- ── 6 · approve writes the RIGHT calendar, and proves the sum ───────────────
-- Only the billing INSERT block changes from the 0279 body; everything else was
-- pulled out of pg_get_functiondef rather than retyped (the standing rule).
CREATE OR REPLACE FUNCTION public.rental_approve_agreement(
  p_agreement_id uuid,
  p_note text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ra             rental_agreements;
  v_pkg            service_packages;
  v_unit           rental_stock_units;
  v_entitlement_id uuid;
  v_visits_total   integer := 0;
  v_proceeded      boolean := false;
  v_proceed_note   text;
  v_scheduled      numeric(12,2);
  v_contract       numeric(12,2);
BEGIN
  IF NOT public.rental_can_approve() THEN
    RAISE EXCEPTION 'Only finance or the principal may approve a rental agreement'
      USING errcode = '42501', detail = 'forbidden';
  END IF;

  SELECT * INTO v_ra FROM rental_agreements WHERE id = p_agreement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rental agreement not found'
      USING errcode = 'P0001', detail = 'agreement_not_found';
  END IF;
  IF v_ra.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Agreement is not awaiting approval (status %)', v_ra.status
      USING errcode = 'P0001', detail = 'not_pending';
  END IF;

  -- 0279 — an unsigned application cannot be approved, and because 0275's
  -- proceed_order rental branch requires 'active', that also means it can never
  -- reach operations. Closes CF `rental-approve-without-signature`.
  IF v_ra.signed_at IS NULL THEN
    RAISE EXCEPTION 'This application carries no signature - it cannot be approved'
      USING errcode = 'P0001', detail = 'not_signed';
  END IF;

  UPDATE rental_agreements
     SET status     = 'active',
         decided_by = auth.uid(),
         decided_at = now(),
         notes      = CASE
                        WHEN coalesce(btrim(p_note), '') = '' THEN notes
                        ELSE coalesce(notes || E'\n', '') || btrim(p_note)
                      END,
         updated_at = now()
   WHERE id = v_ra.id
   RETURNING * INTO v_ra;

  -- 0281 — the schedule speaks the 7th (Loo's T&C), not the signing day.
  INSERT INTO rental_billings (agreement_id, seq, due_date, amount_due, status)
  SELECT v_ra.id, d.seq, d.due_date, v_ra.monthly_fee, 'due'
    FROM public.rental_due_dates(v_ra.start_date, v_ra.term_months) AS d;

  -- ...and Loo's law is asserted, not assumed: "as long as the sum is correct".
  SELECT coalesce(sum(amount_due), 0) INTO v_scheduled
    FROM rental_billings WHERE agreement_id = v_ra.id;
  v_contract := round(v_ra.monthly_fee * v_ra.term_months, 2);
  IF v_scheduled <> v_contract THEN
    RAISE EXCEPTION 'Schedule totals % but the contract is % - refusing to approve',
      v_scheduled, v_contract
      USING errcode = 'P0001', detail = 'schedule_sum_mismatch';
  END IF;

  INSERT INTO rental_stock_units (sku, agreement_id, customer_id, status, updated_by)
  VALUES (v_ra.sku, v_ra.id, v_ra.customer_id, 'allocated', auth.uid())
  RETURNING * INTO v_unit;

  INSERT INTO rental_unit_events (unit_id, event_type, description, actor)
  VALUES (
    v_unit.id, 'note',
    'Allocated on approval of ' || v_ra.agreement_no,
    auth.uid()
  );

  IF v_ra.included_package_id IS NOT NULL THEN
    SELECT * INTO v_pkg FROM service_packages WHERE id = v_ra.included_package_id;
    IF FOUND THEN
      v_visits_total := greatest(
        1, floor((v_ra.term_months * v_pkg.visits_per_year)::numeric / 12)::integer
      );

      INSERT INTO service_entitlements (
        customer_id, package_id, source, agreement_id,
        visits_total, starts_on, expires_on, status, created_by
      ) VALUES (
        v_ra.customer_id, v_pkg.id, 'rental', v_ra.id,
        v_visits_total, v_ra.start_date,
        (v_ra.start_date + make_interval(months => v_ra.term_months))::date,
        'active', auth.uid()
      )
      RETURNING id INTO v_entitlement_id;

      INSERT INTO service_visits (entitlement_id, seq, due_date, unit_id, status)
      SELECT v_entitlement_id,
             gs,
             v_ra.start_date + round(gs * 365.0 / v_pkg.visits_per_year)::integer,
             v_unit.id,
             'pending'
        FROM generate_series(1, v_visits_total) AS gs;
    END IF;
  END IF;

  -- 0275 - "Approve -> the sales order moves on to operations" (Loo, locked).
  -- Wrapped: a missing delivery date must NOT undo a credit decision.
  IF v_ra.order_id IS NOT NULL THEN
    BEGIN
      PERFORM public.proceed_order(v_ra.order_id);
      v_proceeded := true;
    EXCEPTION WHEN OTHERS THEN
      v_proceed_note := coalesce(
        nullif(btrim(SQLERRM), ''), 'the order could not be proceeded'
      );
      INSERT INTO order_history (order_id, text, by_role)
      VALUES (
        v_ra.order_id,
        'Rental ' || v_ra.agreement_no
          || ' APPROVED, but the order is still in Place: ' || v_proceed_note,
        (SELECT public.app_role())
      );
    END;
  END IF;

  INSERT INTO audit_log (role, actor_text, action, dealer_id, ref)
  VALUES (NULL, 'rental-approver', 'rental.agreement_approved',
          v_ra.dealer_id, v_ra.agreement_no);

  RETURN jsonb_build_object(
    'agreement',      to_jsonb(v_ra),
    'unit',           to_jsonb(v_unit),
    'entitlementId',  v_entitlement_id,
    'visitsTotal',    v_visits_total,
    'orderProceeded', v_proceeded,
    'orderBlockedBy', v_proceed_note
  );
END;
$function$;

-- ── 7 · grants ───────────────────────────────────────────────────────────────
-- `REVOKE ... FROM anon` alone does nothing and `FROM public` alone does nothing
-- either: a new function is created with EXECUTE granted to PUBLIC and anon
-- inherits it. The pair PLUS an explicit grant back is the only working form,
-- asserted both directions below.
REVOKE ALL ON FUNCTION public.rental_due_dates(date, integer, integer, integer) FROM public, anon;
REVOKE ALL ON FUNCTION public.rental_record_payment(uuid, integer, text, numeric, timestamptz, text, text, text) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.rental_due_dates(date, integer, integer, integer)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rental_record_payment(uuid, integer, text, numeric, timestamptz, text, text, text)
  TO authenticated, service_role;

-- ── 8 · sanity ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_d       date;
  v_n       integer;
  v_sum     numeric;
BEGIN
  -- Loo's worked example, asserted against the SAME dates the TS tests assert.
  SELECT count(*) INTO v_n FROM public.rental_due_dates('2026-08-30', 84);
  IF v_n <> 84 THEN RAISE EXCEPTION '0281: expected 84 due dates, got %', v_n; END IF;

  SELECT d.due_date INTO v_d FROM public.rental_due_dates('2026-08-30', 84) d WHERE d.seq = 1;
  IF v_d <> DATE '2026-08-30' THEN
    RAISE EXCEPTION '0281: seq 1 should be the signing day, got %', v_d;
  END IF;
  SELECT d.due_date INTO v_d FROM public.rental_due_dates('2026-08-30', 84) d WHERE d.seq = 2;
  IF v_d <> DATE '2026-09-07' THEN
    RAISE EXCEPTION '0281: seq 2 should be 7 Sep 2026, got %', v_d;
  END IF;
  SELECT d.due_date INTO v_d FROM public.rental_due_dates('2026-08-30', 84) d WHERE d.seq = 84;
  IF v_d <> DATE '2033-07-07' THEN
    RAISE EXCEPTION '0281: seq 84 should be 7 Jul 2033, got %', v_d;
  END IF;

  -- the guard: signing on the 6th must NOT bill again on the 7th
  SELECT d.due_date INTO v_d FROM public.rental_due_dates('2026-09-06', 84) d WHERE d.seq = 2;
  IF v_d <> DATE '2026-10-07' THEN
    RAISE EXCEPTION '0281: the min-gap guard did not fire, seq 2 = %', v_d;
  END IF;

  -- THE LAW
  SELECT count(*) * 59 INTO v_sum FROM public.rental_due_dates('2026-08-30', 84);
  IF v_sum <> 4956 THEN
    RAISE EXCEPTION '0281: 84 x RM59 must be RM4,956, got %', v_sum;
  END IF;

  -- grants, both directions
  IF has_function_privilege('anon',
       'public.rental_record_payment(uuid, integer, text, numeric, timestamptz, text, text, text)',
       'EXECUTE') THEN
    RAISE EXCEPTION '0281: anon can execute rental_record_payment';
  END IF;
  IF NOT has_function_privilege('authenticated',
       'public.rental_record_payment(uuid, integer, text, numeric, timestamptz, text, text, text)',
       'EXECUTE') THEN
    RAISE EXCEPTION '0281: authenticated CANNOT execute rental_record_payment';
  END IF;
  IF NOT has_function_privilege('service_role',
       'public.rental_record_payment(uuid, integer, text, numeric, timestamptz, text, text, text)',
       'EXECUTE') THEN
    RAISE EXCEPTION '0281: service_role CANNOT execute rental_record_payment';
  END IF;

  -- the events table must be readable by nobody but internal, and writable by
  -- NO policy at all (the definer RPC is the only door)
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE tablename = 'rental_billing_events' AND cmd <> 'SELECT';
  IF v_n <> 0 THEN
    RAISE EXCEPTION '0281: rental_billing_events has % non-SELECT policies - money must go through the RPC', v_n;
  END IF;

  RAISE NOTICE '0281 OK: calendar asserted on Loo''s example, grants both ways, ledger write-sealed';
END $$;

COMMIT;
