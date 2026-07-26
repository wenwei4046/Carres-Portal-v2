-- =============================================================================
-- 0268_rental_approver_gate.sql (Loo 2026-07-26 — the credit-assessment clause,
-- implemented)
-- =============================================================================
-- Loo's own T&C (v5_260706) says participation is "subject to credit
-- assessment". Until this migration the system did not honour that clause:
-- `create_rental_agreement` stamped status 'active' directly, so a signature at
-- a store terminal was the ONLY thing standing between a stranger and 84 months
-- of Carres credit. The locked spec closes it:
--
--   "sales takes the order + customer signature -> the order lands on a finance
--    Approver page (new tab) instead of going straight to operations.
--    Approve -> the sales order moves on to operations. Reject -> the order
--    fails."
--
-- Two halves, and they are inseparable:
--
--   1. An agreement is now BORN 'pending_approval' (column default + the sell
--      RPC's literal, so neither door can mint a live contract).
--   2. NOTHING downstream is materialised until a human approves. Previously
--      the sell RPC also wrote, in the same breath: the full N-month
--      `rental_billings` schedule, an ALLOCATED `rental_stock_units` row, and
--      the included package's `service_entitlements` + `service_visits`.
--      Leaving those at signup would have made the gate cosmetic — a REJECTED
--      application would still have left phantom receivables in finance, an
--      asset ops believes is spoken for, and service visits the customer never
--      earned. They move, verbatim, into `rental_approve_agreement`.
--
-- Because the contract must survive a re-price between signing and approval
-- (CF `rental-plan-reprice-policy`), the approve path materialises from the
-- AGREEMENT's own snapshot (term_months / monthly_fee), never from a re-read of
-- `rental_plans`. The one thing the agreement did not snapshot — which service
-- package was included — becomes a real column here for the same reason.
--
-- The CBM (Credit Bureau Malaysia) check is deliberately NOT built: the spec
-- says "the hook is planned, not built now". `credit_checked_at` /
-- `credit_reference` land now so the later call has somewhere to write without
-- another migration.
--
-- BONUS the shape gives us for free: the Stripe checkout route already refuses
-- any agreement whose status is not 'active' (apps/api/src/routes/rental.ts,
-- 422 `wrong_status`). Because an agreement is now born 'pending_approval',
-- NO CARD CAN BE CHARGED BEFORE FINANCE APPROVES — with zero API changes. That
-- is the correct order for a credit product: assess first, collect second.
--
-- Safe to apply on live data: every rental table is at 0 rows (verified
-- 2026-07-26), so there is no backfill and no in-flight agreement to strand.
-- =============================================================================

BEGIN;

-- ── 1 · the status machine learns about approval ─────────────────────────────
-- 'pending_approval' is the new birth state; 'rejected' is terminal.
ALTER TABLE public.rental_agreements
  DROP CONSTRAINT IF EXISTS rental_agreements_status_check;

ALTER TABLE public.rental_agreements
  ADD CONSTRAINT rental_agreements_status_check CHECK (
    status = ANY (ARRAY[
      'pending_approval'::text,
      'rejected'::text,
      'active'::text,
      'buyout_pending'::text,
      'completed'::text,
      'ownership_transferred'::text,
      'defaulted'::text,
      'repossessed'::text,
      'cancelled'::text
    ])
  );

ALTER TABLE public.rental_agreements
  ALTER COLUMN status SET DEFAULT 'pending_approval'::text;

-- ── 2 · the decision, and what the contract promised ─────────────────────────
ALTER TABLE public.rental_agreements
  -- which service package was promised at signing (snapshot: the plan may be
  -- re-priced or re-pointed before finance gets to it)
  ADD COLUMN IF NOT EXISTS included_package_id uuid REFERENCES public.service_packages (id),
  -- who decided, and when. One pair for both outcomes — the status says which.
  -- Bare uuid, no FK: matches this table's own `created_by` (a public table
  -- holding an auth.users FK is not a pattern this schema uses).
  ADD COLUMN IF NOT EXISTS decided_by          uuid,
  ADD COLUMN IF NOT EXISTS decided_at          timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason    text,
  -- the CBM hook's landing strip (nothing writes these yet, by design)
  ADD COLUMN IF NOT EXISTS credit_checked_at   timestamptz,
  ADD COLUMN IF NOT EXISTS credit_reference    text;

COMMENT ON COLUMN public.rental_agreements.decided_by IS
  'Finance/principal who approved or rejected. Status says which way.';
COMMENT ON COLUMN public.rental_agreements.credit_reference IS
  'Reserved for the CBM API result. Planned, not built (Loo 2026-07-26).';

-- A rejected agreement must say why; an undecided one must not claim a decider.
ALTER TABLE public.rental_agreements
  DROP CONSTRAINT IF EXISTS rental_agreements_decision_shape;
ALTER TABLE public.rental_agreements
  ADD CONSTRAINT rental_agreements_decision_shape CHECK (
    (status <> 'rejected' OR coalesce(btrim(rejection_reason), '') <> '')
    AND (status <> 'pending_approval' OR decided_at IS NULL)
  );

CREATE INDEX IF NOT EXISTS rental_agreements_pending_idx
  ON public.rental_agreements (created_at)
  WHERE status = 'pending_approval';

-- ── 3 · the sell RPC stops minting live contracts ────────────────────────────
-- Identical signature (guardrail: never change an applied function's arg list
-- without checking the live one first — verified 2026-07-26). Only two things
-- change: the birth status, and everything that spends money or reserves an
-- asset moves out to the approve path.
CREATE OR REPLACE FUNCTION public.create_rental_agreement(
  p_plan_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text DEFAULT NULL::text,
  p_customer_address text DEFAULT NULL::text,
  p_dealer_id uuid DEFAULT NULL::uuid,
  p_salesperson_id uuid DEFAULT NULL::uuid,
  p_start_date date DEFAULT NULL::date,
  p_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role        text := (SELECT auth.jwt()->'app_metadata'->>'role');
  v_jwt_dealer  uuid := (SELECT public.app_dealer_id());
  v_dealer_id   uuid;
  v_phone_key   text;
  v_today       date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_start       date;
  v_plan        rental_plans;
  v_customer    customers;
  v_agreement   rental_agreements;
BEGIN
  -- "Everyone can sell" (Loo) = the same set that can transact at the POS
  -- (mirrors requireOrderRole in apps/api). Suppliers/partners cannot.
  IF v_role IS NULL OR v_role NOT IN
     ('dealer','salesperson','showroom','bd','principal','operation','finance') THEN
    RAISE EXCEPTION 'Role cannot sell rental plans'
      USING errcode = '42501', detail = 'forbidden';
  END IF;

  -- A store JWT's own dealer always wins (no spoofing); only a dealer-less
  -- JWT (principal / operation / finance / bd on-behalf) may pass p_dealer_id.
  -- Both null = an HQ-direct agreement — allowed.
  v_dealer_id := coalesce(v_jwt_dealer, p_dealer_id);

  IF coalesce(trim(p_customer_name), '') = '' THEN
    RAISE EXCEPTION 'Customer name is required'
      USING errcode = 'P0001', detail = 'invalid_customer';
  END IF;

  v_phone_key := public.pwp_phone_key(p_customer_phone);
  IF coalesce(v_phone_key, '') = '' THEN
    RAISE EXCEPTION 'Customer phone has no usable digits'
      USING errcode = 'P0001', detail = 'invalid_phone';
  END IF;

  v_start := coalesce(p_start_date, v_today);
  -- A week of backdating covers "signed on paper yesterday"; 180 days forward
  -- covers a pre-sold launch. Outside that is almost certainly a typo.
  IF v_start < v_today - 7 OR v_start > v_today + 180 THEN
    RAISE EXCEPTION 'Start date out of range'
      USING errcode = 'P0001', detail = 'invalid_start_date';
  END IF;

  SELECT * INTO v_plan FROM rental_plans WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rental plan not found'
      USING errcode = 'P0001', detail = 'plan_not_found';
  END IF;
  IF NOT v_plan.active THEN
    RAISE EXCEPTION 'Rental plan is not active'
      USING errcode = 'P0001', detail = 'plan_inactive';
  END IF;

  IF p_salesperson_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM salespersons s WHERE s.id = p_salesperson_id) THEN
    RAISE EXCEPTION 'Unknown salesperson'
      USING errcode = 'P0001', detail = 'invalid_salesperson';
  END IF;

  -- Customer upsert by canonical phone. An EXISTING customer keeps their name
  -- and stored phone (identity anchor — a store terminal must not silently
  -- rename someone with live agreements); email/address only fill blanks.
  INSERT INTO customers (name, phone, phone_key, email, address, created_by)
  VALUES (
    trim(p_customer_name),
    trim(p_customer_phone),
    v_phone_key,
    nullif(trim(coalesce(p_customer_email, '')), ''),
    nullif(trim(coalesce(p_customer_address, '')), ''),
    auth.uid()
  )
  ON CONFLICT (phone_key) DO UPDATE
    SET email      = coalesce(customers.email,   excluded.email),
        address    = coalesce(customers.address, excluded.address),
        updated_at = now()
  RETURNING * INTO v_customer;

  -- Agreement — sku/term/fee/splits are SNAPSHOTS from the plan row read
  -- HERE, inside the definer transaction. The client named a plan; the DB
  -- priced it. It is an APPLICATION until finance says otherwise: no billing
  -- schedule, no allocated unit, no entitlement. See rental_approve_agreement.
  INSERT INTO rental_agreements (
    customer_id, dealer_id, salesperson_id, plan_id,
    sku, term_months, monthly_fee, supplier_rate_pct, commission_base_pct,
    start_date, status, notes, created_by, included_package_id
  ) VALUES (
    v_customer.id, v_dealer_id, p_salesperson_id, v_plan.id,
    v_plan.sku, v_plan.term_months, v_plan.monthly_fee,
    v_plan.supplier_rate_pct, v_plan.commission_base_pct,
    v_start, 'pending_approval', nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid(), v_plan.included_package_id
  )
  RETURNING * INTO v_agreement;

  -- audit_log's role column is the app enum; 'salesperson' etc. live outside
  -- it, so the seller role travels in actor_text (the 0223 webhook precedent).
  INSERT INTO audit_log (role, actor_text, action, dealer_id, ref)
  VALUES (NULL, 'pos-rental:' || v_role, 'rental.agreement_submitted',
          v_dealer_id, v_agreement.agreement_no);

  -- Shape kept for the POS lane: unit/entitlement are null until approval, so
  -- an old client reading them degrades to "nothing yet" instead of crashing.
  RETURN jsonb_build_object(
    'agreement',     to_jsonb(v_agreement),
    'customer',      to_jsonb(v_customer),
    'unit',          NULL,
    'entitlementId', NULL,
    'visitsTotal',   0,
    'pendingApproval', true
  );
END;
$function$;

-- ── 4 · who may decide ───────────────────────────────────────────────────────
-- Narrower than is_internal() on purpose: that helper also admits 'bd', and a
-- business-development seller must not approve their own credit application.
CREATE OR REPLACE FUNCTION public.rental_can_approve()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce(
    (SELECT role FROM public.app_users
      WHERE id = auth.uid() AND status = 'active') IN ('finance','principal'),
    false
  )
$function$;

-- ── 5 · APPROVE — the contract goes live, and only now does it cost anything ─
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
BEGIN
  IF NOT public.rental_can_approve() THEN
    RAISE EXCEPTION 'Only finance or the principal may approve a rental agreement'
      USING errcode = '42501', detail = 'forbidden';
  END IF;

  -- Lock the row: two approvers clicking at once must not both materialise a
  -- schedule.
  SELECT * INTO v_ra FROM rental_agreements WHERE id = p_agreement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rental agreement not found'
      USING errcode = 'P0001', detail = 'agreement_not_found';
  END IF;
  IF v_ra.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Agreement is not awaiting approval (status %)', v_ra.status
      USING errcode = 'P0001', detail = 'not_pending';
  END IF;
  -- NO `signed_at IS NULL` guard here, deliberately. Loo's flow is signature
  -- first, approval second — but SIGNING IS NOT BUILT: 0267 landed the columns
  -- (signed_at / signed_name / signed_nric / signature_path / signed_doc_path)
  -- and a private bucket, and nothing in apps/api, apps/web or any later
  -- migration writes one of them. A guard here would jam the queue shut on a
  -- feature that does not exist, so the credit gate ships without it and the
  -- APPROVER SEES the signature state instead (rental_pending_approvals returns
  -- signedAt / signedName / signedDocPath; the page says "not signed yet" out
  -- loud). When the signing view lands, re-add exactly this:
  --   IF v_ra.signed_at IS NULL THEN
  --     RAISE EXCEPTION 'Agreement has not been signed'
  --       USING errcode = 'P0001', detail = 'not_signed';
  --   END IF;
  -- Tracked as CF `rental-approve-without-signature`.

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

  -- The full term's schedule, all 'due'. Month N is due start + (N-1) months
  -- (Postgres clamps Jan-31 -> Feb-28 the way finance expects). Segment (2)'s
  -- billing engine marks these paid from Stripe invoices. Amounts come from
  -- the AGREEMENT, not the plan — the contract is what was signed.
  INSERT INTO rental_billings (agreement_id, seq, due_date, amount_due, status)
  SELECT v_ra.id,
         gs,
         (v_ra.start_date + make_interval(months => gs - 1))::date,
         v_ra.monthly_fee,
         'due'
    FROM generate_series(1, v_ra.term_months) AS gs;

  -- The rented-out ASSET (Loo: still Carres property until ownership
  -- transfers). Born 'allocated'; ops flips it in_rental at deployment.
  INSERT INTO rental_stock_units (sku, agreement_id, customer_id, status, updated_by)
  VALUES (v_ra.sku, v_ra.id, v_ra.customer_id, 'allocated', auth.uid())
  RETURNING * INTO v_unit;

  INSERT INTO rental_unit_events (unit_id, event_type, description, actor)
  VALUES (
    v_unit.id, 'note',
    'Allocated on approval of ' || v_ra.agreement_no,
    auth.uid()
  );

  -- Included service package -> ONE entitlement whose visits ride the TERM
  -- (0248 doctrine), pre-generated visits spaced 12/visits_per_year months
  -- apart (landed as whole days: round(seq x 365/visits_per_year)). Mirrors
  -- shared serviceVisitsTotal: floor(term x visits/yr / 12), min 1.
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

  INSERT INTO audit_log (role, actor_text, action, dealer_id, ref)
  VALUES (NULL, 'rental-approver', 'rental.agreement_approved',
          v_ra.dealer_id, v_ra.agreement_no);

  RETURN jsonb_build_object(
    'agreement',     to_jsonb(v_ra),
    'unit',          to_jsonb(v_unit),
    'entitlementId', v_entitlement_id,
    'visitsTotal',   v_visits_total
  );
END;
$function$;

-- ── 6 · REJECT — the application fails, and leaves no money behind ───────────
CREATE OR REPLACE FUNCTION public.rental_reject_agreement(
  p_agreement_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ra     rental_agreements;
  v_reason text := btrim(coalesce(p_reason, ''));
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
         rejection_reason = v_reason,
         updated_at       = now()
   WHERE id = v_ra.id
   RETURNING * INTO v_ra;

  INSERT INTO audit_log (role, actor_text, action, dealer_id, ref)
  VALUES (NULL, 'rental-approver', 'rental.agreement_rejected',
          v_ra.dealer_id, v_ra.agreement_no);

  RETURN jsonb_build_object('agreement', to_jsonb(v_ra));
END;
$function$;

-- ── 7 · the approver's worklist ──────────────────────────────────────────────
-- One read for the page: the application plus the particulars a human needs to
-- judge it. Definer + its own gate so the page never has to widen RLS.
CREATE OR REPLACE FUNCTION public.rental_pending_approvals()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT public.rental_can_approve() THEN
    RAISE EXCEPTION 'Only finance or the principal may read the approval queue'
      USING errcode = '42501', detail = 'forbidden';
  END IF;

  SELECT coalesce(jsonb_agg(r ORDER BY r->>'createdAt'), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT jsonb_build_object(
               'id',              ra.id,
               'agreementNo',     ra.agreement_no,
               'status',          ra.status,
               'sku',             ra.sku,
               'termMonths',      ra.term_months,
               'monthlyFee',      ra.monthly_fee,
               'oneOffTotal',     ra.one_off_total,
               'startDate',       ra.start_date,
               'createdAt',       ra.created_at,
               'notes',           ra.notes,
               'signedAt',        ra.signed_at,
               'signedName',      ra.signed_name,
               'signedNric',      ra.signed_nric,
               'signaturePath',   ra.signature_path,
               'signedDocPath',   ra.signed_doc_path,
               'templateVersion', ra.template_version,
               'creditCheckedAt', ra.credit_checked_at,
               'creditReference', ra.credit_reference,
               'orderId',         ra.order_id,
               'orderSo',         o.so,
               'customer', jsonb_build_object(
                 'id',      c.id,
                 'name',    c.name,
                 'phone',   c.phone,
                 'email',   c.email,
                 'address', c.address
               ),
               'dealer', CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object(
                 'id', d.id, 'name', d.name, 'channel', d.channel
               ) END,
               'salesperson', CASE WHEN sp.id IS NULL THEN NULL ELSE jsonb_build_object(
                 'id', sp.id, 'name', sp.name
               ) END,
               -- how much credit this one decision extends
               'termTotal', round(ra.monthly_fee * ra.term_months, 2)
             ) AS r
        FROM rental_agreements ra
        JOIN customers c            ON c.id  = ra.customer_id
        LEFT JOIN dealers d         ON d.id  = ra.dealer_id
        LEFT JOIN salespersons sp   ON sp.id = ra.salesperson_id
        LEFT JOIN orders o          ON o.id  = ra.order_id
       WHERE ra.status = 'pending_approval'
    ) q;

  RETURN v_rows;
END;
$function$;

-- ── 8 · grants ───────────────────────────────────────────────────────────────
-- Every function above gates itself on rental_can_approve(), which reads
-- app_users by auth.uid() — so an anon caller is already refused with 42501.
-- We still revoke `anon` EXPLICITLY (the 0255 precedent): `REVOKE … FROM public`
-- alone does NOT take it away, because Supabase grants EXECUTE to anon through
-- its own default privileges — measured on this database, anon kept EXECUTE
-- after a public-only revoke. Defence in depth: the logic gate is the wall, the
-- grant is the fence.
REVOKE ALL ON FUNCTION public.rental_can_approve()                 FROM public, anon;
REVOKE ALL ON FUNCTION public.rental_approve_agreement(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.rental_reject_agreement(uuid, text)  FROM public, anon;
REVOKE ALL ON FUNCTION public.rental_pending_approvals()           FROM public, anon;

GRANT EXECUTE ON FUNCTION public.rental_can_approve()                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.rental_approve_agreement(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rental_reject_agreement(uuid, text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.rental_pending_approvals()           TO authenticated;

COMMIT;
