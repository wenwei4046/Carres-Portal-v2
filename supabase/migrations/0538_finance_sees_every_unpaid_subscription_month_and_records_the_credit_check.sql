-- ═══════════════════════════════════════════════════════════════════════════
-- 0538 · FINANCE SEES EVERY UNPAID SUBSCRIPTION MONTH AND RECORDS THE CREDIT CHECK
--        (KL Gateway meetings, 18 Sep 2026 · SUB-8, SUB-9, SUB-10)
--
-- 1 · rental_billings_for_month(p_month) — one read across ALL agreements:
--     every billing month due in the chosen calendar month, with customer, SO
--     and the salesperson on the order. Until now rental_billings was read
--     one agreement at a time, so "who has not paid this month" had no answer.
--     Read only. Same gate as the approver queue (rental_can_approve(): finance
--     and principal, null-safe through its coalesce).
-- 2 · rental_agreements.credit_check — which check Finance ran (free text,
--     nullable). credit_reference and credit_checked_at already exist (0268)
--     and had no writer. Approve and reject now take the check and its
--     reference and write all three. No bureau is called; Finance types it.
--
-- The two decide functions gain two parameters with defaults. CREATE OR REPLACE
-- with a new argument list would leave the old (uuid, text) overload beside
-- the new one and make every existing two-argument call ambiguous, so the old
-- signature is dropped first. That drops a function, not data. Bodies are the
-- latest ones: approve from 0281, reject from 0275; only the UPDATE changes.
-- No RLS change.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.rental_agreements
  ADD COLUMN IF NOT EXISTS credit_check text;

COMMENT ON COLUMN public.rental_agreements.credit_check IS
  'Which credit check Finance ran before deciding (typed by hand, e.g. CTOS). 0538.';
COMMENT ON COLUMN public.rental_agreements.credit_reference IS
  'The reference of that check, typed by Finance on approve or reject. 0538.';

-- ── 1 · approve ──────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.rental_approve_agreement(uuid, text);

CREATE OR REPLACE FUNCTION public.rental_approve_agreement(
  p_agreement_id uuid,
  p_note text DEFAULT NULL::text,
  p_credit_check text DEFAULT NULL::text,
  p_credit_reference text DEFAULT NULL::text
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
         -- 0538 — the check Finance ran, typed by hand. Blank keeps what is there.
         credit_check      = coalesce(nullif(btrim(p_credit_check), ''), credit_check),
         credit_reference  = coalesce(nullif(btrim(p_credit_reference), ''), credit_reference),
         credit_checked_at = CASE
                               WHEN coalesce(btrim(p_credit_check), '') <> ''
                                 OR coalesce(btrim(p_credit_reference), '') <> ''
                               THEN now() ELSE credit_checked_at
                             END,
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

-- ── 2 · reject ───────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.rental_reject_agreement(uuid, text);

CREATE OR REPLACE FUNCTION public.rental_reject_agreement(
  p_agreement_id uuid,
  p_reason text,
  p_credit_check text DEFAULT NULL::text,
  p_credit_reference text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ra        rental_agreements;
  v_reason    text := btrim(coalesce(p_reason, ''));
  v_cancelled boolean := false;
BEGIN
  IF NOT public.rental_can_approve() THEN
    RAISE EXCEPTION 'Only finance or the principal may reject a rental agreement'
      USING errcode = '42501', detail = 'forbidden';
  END IF;

  -- A rejection the customer cannot be told the reason for is not a decision.
  IF v_reason = '' THEN
    RAISE EXCEPTION 'A rejection needs a reason'
      USING errcode = 'P0001', detail = 'reason_required';
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

  UPDATE rental_agreements
     SET status           = 'rejected',
         decided_by       = auth.uid(),
         decided_at       = now(),
         -- 0538 — as approve.
         credit_check      = coalesce(nullif(btrim(p_credit_check), ''), credit_check),
         credit_reference  = coalesce(nullif(btrim(p_credit_reference), ''), credit_reference),
         credit_checked_at = CASE
                               WHEN coalesce(btrim(p_credit_check), '') <> ''
                                 OR coalesce(btrim(p_credit_reference), '') <> ''
                               THEN now() ELSE credit_checked_at
                             END,
         rejection_reason = v_reason,
         updated_at       = now()
   WHERE id = v_ra.id
   RETURNING * INTO v_ra;

  -- "Reject -> the order fails" (Loo, locked). Only ever a PLACE order: the
  -- rental gate means it cannot have reached operations, and if a human somehow
  -- pushed it there, cancelling under ops would strand threads and POs — so
  -- that case is left to a person and recorded instead.
  IF v_ra.order_id IS NOT NULL THEN
    UPDATE orders
       SET status = 'cancelled', updated_at = now()
     WHERE id = v_ra.order_id AND status = 'place';
    v_cancelled := FOUND;

    INSERT INTO order_history (order_id, text, by_role)
    VALUES (
      v_ra.order_id,
      CASE WHEN v_cancelled
        THEN 'Rental ' || v_ra.agreement_no || ' REJECTED · order cancelled — ' || v_reason
        ELSE 'Rental ' || v_ra.agreement_no || ' REJECTED (' || v_reason
             || ') but this order is past Place — cancel it by hand'
      END,
      (SELECT public.app_role())
    );
  END IF;

  INSERT INTO audit_log (role, actor_text, action, dealer_id, ref)
  VALUES (NULL, 'rental-approver', 'rental.agreement_rejected',
          v_ra.dealer_id, v_ra.agreement_no);

  RETURN jsonb_build_object(
    'agreement',      to_jsonb(v_ra),
    'orderCancelled', v_cancelled
  );
END;
$function$;

-- ── 3 · every billing month due in one calendar month, across agreements ────
CREATE OR REPLACE FUNCTION public.rental_billings_for_month(p_month date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_from date := date_trunc('month', p_month)::date;
  v_rows jsonb;
BEGIN
  IF NOT public.rental_can_approve() THEN
    RAISE EXCEPTION 'Only finance or the principal may read subscription collections'
      USING errcode = '42501', detail = 'forbidden';
  END IF;
  IF p_month IS NULL THEN
    RAISE EXCEPTION 'A month is required' USING errcode = '22004', detail = 'month_required';
  END IF;

  SELECT coalesce(jsonb_agg(r ORDER BY r->>'dueDate', r->>'agreementNo'), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT jsonb_build_object(
               'billingId',     b.id,
               'agreementId',   ra.id,
               'agreementNo',   ra.agreement_no,
               'seq',           b.seq,
               'dueDate',       b.due_date,
               'amountDue',     b.amount_due,
               'status',        b.status,
               'paidAmount',    b.paid_amount,
               'customerName',  c.name,
               'customerPhone', c.phone,
               'orderId',       ra.order_id,
               'orderSo',       o.so,
               -- the salesperson on the order; the agreement's own as fallback
               'salespersonName', coalesce(osp.name, asp.name)
             ) AS r
        FROM rental_billings b
        JOIN rental_agreements ra      ON ra.id  = b.agreement_id
        JOIN customers c               ON c.id   = ra.customer_id
        LEFT JOIN orders o             ON o.id   = ra.order_id
        LEFT JOIN salespersons osp     ON osp.id = o.salesperson_id
        LEFT JOIN salespersons asp     ON asp.id = ra.salesperson_id
       WHERE b.due_date >= v_from
         AND b.due_date <  (v_from + interval '1 month')::date
    ) q;

  RETURN v_rows;
END;
$function$;

-- ── 4 · grants ───────────────────────────────────────────────────────────────
-- A new function is born with EXECUTE for PUBLIC (anon inherits it): revoke
-- both, grant back to signed-in callers. Each function gates itself inside.
REVOKE ALL ON FUNCTION public.rental_approve_agreement(uuid, text, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.rental_reject_agreement(uuid, text, text, text)  FROM public, anon;
REVOKE ALL ON FUNCTION public.rental_billings_for_month(date)                  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rental_approve_agreement(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rental_reject_agreement(uuid, text, text, text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.rental_billings_for_month(date)                  TO authenticated;

COMMIT;
