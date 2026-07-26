-- =============================================================================
-- 0278_rental_signed_at_birth.sql (Loo 2026-07-26 — the signature stops being
-- thrown away)
-- =============================================================================
-- THE DEFECT THIS CLOSES, stated plainly: the customer already signs. The POS
-- confirm gate (`step4ValidRental`, apps/web/.../new-order/draft.ts) refuses to
-- enable Complete until `draft.signature` is a real `data:image/…` the customer
-- drew on the pad. Then `handleSubmit` (DealerPos.tsx) branches to the rental
-- path and RETURNS — before the `uploadDataUrl(...)` call that the ordinary
-- order path uses. The drawing is discarded in the browser.
--
-- So today the system ASKS for a signature purely to satisfy a gate and stores
-- nothing. That is worse than not asking: `create_rental_agreement` even writes
-- an order_history line reading "Rental RA-nnnn signed - awaiting finance credit
-- approval", and `rental_approve_agreement` extends up to RM 4,956 of credit on
-- the strength of it. A false record is not a missing feature.
--
-- Verified before writing this, not assumed: `signed_at` / `signed_nric` /
-- `signature_path` / `signed_doc_path` (columns added by 0267) have ZERO writers
-- anywhere in apps/api, packages/shared or supabase/migrations, and
-- `rental_agreement_templates` holds ZERO rows on live prod — the wording nobody
-- has published yet.
--
-- WHAT THIS MIGRATION DOES
--
--   1. `rental_current_agreement_template()` — ONE definition of "the wording in
--      force right now". Both the POS read route and the sell RPC below call it,
--      so the screen the customer reads and the version stamped on the contract
--      can never be two different documents. (The template table is RLS
--      internal-only by 0267, so a store JWT structurally cannot read it — this
--      definer function is how the counter gets to show the paper at all.)
--
--   2. `create_rental_agreement` learns the signature. An agreement is BORN
--      signed or is not born: no draft state, exactly as the locked spec says
--      ("no signature, no order"). It resolves the current template inside the
--      same transaction and stamps `template_id` + `template_version`, so an
--      agreement can always be re-rendered as the wording it was actually
--      signed against.
--
--   3. `rental_approve_agreement` gets the `signed_at IS NULL` guard that 0268
--      left commented out with the note "add it HERE and the 0275 proceed gate
--      inherits it automatically". That inheritance is the point: 0275's rental
--      branch in `proceed_order` requires status 'active', 'active' requires
--      approval, and approval now requires a signature. ONE guard closes the
--      whole chain — no signature → no agreement → no approval → no Sales Order
--      → no delivery.
--
--   4. A CHECK that the signature facts travel TOGETHER. `create_rental_agreement`
--      is the only FUNCTION that inserts an agreement (verified against live
--      pg_get_functiondef), but `rental_agreements` also carries a blanket
--      `is_internal()` ALL policy, so principal/operation/finance/bd can INSERT
--      straight through PostgREST. The constraint is the backstop for that door:
--      it cannot conjure a signature, but it can refuse a HALF-signed row.
--
-- WHY THE NEW PARAMS CARRY DEFAULTS (a deliberate lesson from 0275). 0275
-- DROPped the 9-arg RPC while the live Worker still called it, so rentals were
-- broken between apply and deploy. Giving the three new params defaults means a
-- stale Worker sending the old 10 named args still RESOLVES — and then fails on
-- `signature_required`, which is a readable refusal instead of "function not
-- found in schema cache". The window degrades to "rentals refuse politely"
-- rather than "rentals explode". Apply + deploy still go out together.
--
-- CHANGING THE SIGNATURE IS A DROP + CREATE, NOT A CREATE OR REPLACE — adding a
-- parameter to a REPLACE creates a SECOND overload and the old body keeps
-- serving (the 0153/0154 ghost-overload trap). The sanity block below asserts
-- exactly one copy survives, and re-grants EXECUTE, which a DROP throws away.
--
-- NOT DONE, on purpose, and recorded as carry-forwards rather than implied:
--   · `binds_to` is NOT used to pick the template. One document covers mattress,
--     bedframe and sofa today; filtering by category would add a refusal path
--     with no live benefit and a real chance of jamming a valid signup over a
--     data shape only one live offer can exercise. Resolution is by doc_key.
--   · `signed_doc_path` (the archived, filled, counter-signed PDF) still has no
--     writer. This migration captures the SIGNATURE, not the rendered document.
--   · `signed_nric` lands with no reveal-with-audit wrapper. HR-P4 built exactly
--     that pattern for PDPA fields; the rental approver reads this one in clear.
-- =============================================================================

BEGIN;

-- ── 1 · the wording in force, resolved in ONE place ──────────────────────────
-- `language sql stable` per the §8 planner doctrine. No extra role gate beyond
-- the grant: every role in this system is staff or a trading partner, there are
-- no customer logins, and this returns the very contract a customer is handed to
-- read. Gating it further would add a failure path that protects nothing.
CREATE OR REPLACE FUNCTION public.rental_current_agreement_template(
  p_doc_key text DEFAULT 'rent_to_own'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  -- The full row shape, so the API can feed it straight to the existing
  -- `rentalAgreementTemplateFromRow` adapter instead of growing a second,
  -- near-identical domain type for "the current one".
  SELECT to_jsonb(t)
    FROM (
      SELECT id, doc_key, name, binds_to, version, body, fields, effective_from,
             active, created_at, updated_at, updated_by
        FROM public.rental_agreement_templates
       WHERE doc_key = coalesce(nullif(btrim(p_doc_key), ''), 'rent_to_own')
         AND active
         AND effective_from <= (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
       ORDER BY version DESC
       LIMIT 1
    ) t;
$function$;

COMMENT ON FUNCTION public.rental_current_agreement_template(text) IS
  'The agreement wording in force right now for a doc_key (highest active version whose effective_from has arrived, MYT). NULL when nothing is published. Read by the POS confirm step AND stamped by create_rental_agreement, so the paper shown and the paper signed are one document (0278).';

-- ── 2 · the signature facts travel together ──────────────────────────────────
-- signed_nric is deliberately OUT of the constraint: not every customer hands
-- one over, and the T&C blank may be completed on paper.
ALTER TABLE public.rental_agreements
  DROP CONSTRAINT IF EXISTS rental_agreements_signature_is_whole;

ALTER TABLE public.rental_agreements
  ADD CONSTRAINT rental_agreements_signature_is_whole CHECK (
    (
      signed_at        IS NULL
      AND signature_path   IS NULL
      AND signed_name      IS NULL
      AND template_id      IS NULL
      AND template_version IS NULL
    )
    OR
    (
      signed_at        IS NOT NULL
      AND signature_path   IS NOT NULL
      AND signed_name      IS NOT NULL
      AND template_id      IS NOT NULL
      AND template_version IS NOT NULL
    )
  );

COMMENT ON CONSTRAINT rental_agreements_signature_is_whole ON public.rental_agreements IS
  'A signature is evidence or it is nothing: who signed, the drawing, and WHICH VERSION they signed must all be present or all absent. Backstops the is_internal() PostgREST insert door, which bypasses create_rental_agreement entirely (0278).';

-- ── 3 · the sell RPC — born signed, or not born ──────────────────────────────
DROP FUNCTION IF EXISTS public.create_rental_agreement(
  uuid, text, text, text, text, uuid, uuid, date, text, date
);

CREATE FUNCTION public.create_rental_agreement(
  p_plan_id          uuid,
  p_customer_name    text,
  p_customer_phone   text,
  p_customer_email   text DEFAULT NULL::text,
  p_customer_address text DEFAULT NULL::text,
  p_dealer_id        uuid DEFAULT NULL::uuid,
  p_salesperson_id   uuid DEFAULT NULL::uuid,
  p_start_date       date DEFAULT NULL::date,
  p_notes            text DEFAULT NULL::text,
  p_delivery_date    date DEFAULT NULL::date,
  -- 0278 — the customer's signature. Defaults so a stale caller gets a readable
  -- refusal instead of a schema-cache miss (see the header).
  p_signature_path   text DEFAULT NULL::text,
  p_signed_name      text DEFAULT NULL::text,
  p_signed_nric      text DEFAULT NULL::text
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
  v_order       orders;
  v_channel     text;
  v_contract    numeric(12,2);
  -- 0278
  v_template    jsonb;
  v_sig_path    text := nullif(btrim(coalesce(p_signature_path, '')), '');
  v_sig_name    text := nullif(btrim(coalesce(p_signed_name, '')), '');
  v_sig_nric    text := nullif(btrim(coalesce(p_signed_nric, '')), '');
BEGIN
  IF v_role IS NULL OR v_role NOT IN
     ('dealer','salesperson','showroom','bd','principal','operation','finance') THEN
    RAISE EXCEPTION 'Role cannot sell rental plans'
      USING errcode = '42501', detail = 'forbidden';
  END IF;

  v_dealer_id := coalesce(v_jwt_dealer, p_dealer_id);

  -- 0275: a rental now produces a Sales Order, and an order belongs to a store.
  IF v_dealer_id IS NULL THEN
    RAISE EXCEPTION 'A rental must be sold through a store - pick the store first'
      USING errcode = 'P0001', detail = 'dealer_required';
  END IF;

  -- 0278: the signature, checked BEFORE anything is written. "No signature, no
  -- order" (Loo, locked) — so there is no half-made application to clean up.
  IF v_sig_path IS NULL THEN
    RAISE EXCEPTION 'The customer must sign before a rental can be submitted'
      USING errcode = 'P0001', detail = 'signature_required';
  END IF;
  -- The API writes this key itself with the service client (a store JWT fails
  -- the bucket's is_internal() INSERT policy, so a client-side upload is
  -- structurally impossible). Refuse anything not in that bucket.
  IF v_sig_path NOT LIKE 'rental-agreements/%' THEN
    RAISE EXCEPTION 'Signature is not stored in the agreements bucket'
      USING errcode = 'P0001', detail = 'invalid_signature_path';
  END IF;
  IF v_sig_name IS NULL THEN
    RAISE EXCEPTION 'Who signed? A name is required alongside the signature'
      USING errcode = 'P0001', detail = 'signed_name_required';
  END IF;

  -- 0278: WHICH paper was signed. Resolved here so the contract records the
  -- exact version, and refused by name when Loo has not published wording yet —
  -- a rental cannot be signed against a document that does not exist.
  v_template := public.rental_current_agreement_template();
  IF v_template IS NULL THEN
    RAISE EXCEPTION 'No rental agreement wording is published - author it in Admin > Rental > Agreements first'
      USING errcode = 'P0001', detail = 'no_agreement_template';
  END IF;

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
  -- CF `rental-combo-agreement-sku-null`: a combo plan carries no sku and
  -- `rental_agreements.sku` is NOT NULL, so it would blow up mid-transaction
  -- with a constraint error nobody can read. Refuse it up front instead.
  IF coalesce(v_plan.sku, '') = '' THEN
    RAISE EXCEPTION 'That rental plan has no SKU to deliver (combo plans are not sellable yet)'
      USING errcode = 'P0001', detail = 'plan_has_no_sku';
  END IF;

  IF p_salesperson_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM salespersons s WHERE s.id = p_salesperson_id) THEN
    RAISE EXCEPTION 'Unknown salesperson'
      USING errcode = 'P0001', detail = 'invalid_salesperson';
  END IF;

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

  INSERT INTO rental_agreements (
    customer_id, dealer_id, salesperson_id, plan_id,
    sku, term_months, monthly_fee, supplier_rate_pct, commission_base_pct,
    start_date, status, notes, created_by, included_package_id,
    -- 0278 — the evidence. `created_by` above is the staff member who witnessed
    -- it, so the witness needs no column of its own.
    signed_at, signed_name, signed_nric, signature_path,
    template_id, template_version
  ) VALUES (
    v_customer.id, v_dealer_id, p_salesperson_id, v_plan.id,
    v_plan.sku, v_plan.term_months, v_plan.monthly_fee,
    v_plan.supplier_rate_pct, v_plan.commission_base_pct,
    v_start, 'pending_approval', nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid(), v_plan.included_package_id,
    now(), v_sig_name, v_sig_nric, v_sig_path,
    (v_template->>'id')::uuid, (v_template->>'version')::integer
  )
  RETURNING * INTO v_agreement;

  v_contract := round(v_plan.monthly_fee * v_plan.term_months, 2);
  v_channel  := coalesce((SELECT channel FROM dealers WHERE id = v_dealer_id), 'dealer');

  -- the Sales Order. Born 'place'; it reaches operations only when finance
  -- approves (rental_approve_agreement proceeds it), which is the locked flow.
  INSERT INTO orders (
    dealer_id, channel, salesperson_id, status,
    customer_name, customer_phone, customer_address, customer_address_unknown,
    delivery_date, delivery_date_tbd,
    paid, terms_accepted, source_system
  ) VALUES (
    v_dealer_id, v_channel, p_salesperson_id, 'place',
    v_customer.name, v_customer.phone,
    nullif(trim(coalesce(p_customer_address, v_customer.address, '')), ''),
    coalesce(nullif(trim(coalesce(p_customer_address, v_customer.address, '')), '') IS NULL, true),
    p_delivery_date, p_delivery_date IS NULL,
    -- Nothing is paid at signing: month 1 is collected by Stripe after approval.
    -- 0278: terms_accepted is now TRUE and it is the truth — the customer signed
    -- the wording resolved above, in this same transaction.
    0, true, 'rental'
  )
  RETURNING * INTO v_order;

  -- ONE line: the thing to deliver. Priced ZERO on purpose (see the header) --
  -- the rental terms ride in attrs so the paperwork can print them without any
  -- of it reaching a total.
  INSERT INTO order_lines (order_id, sku, qty, unit_price, attrs)
  VALUES (
    v_order.id, v_plan.sku, 1, 0,
    jsonb_build_object(
      'rental', jsonb_build_object(
        'agreementId',   v_agreement.id,
        'agreementNo',   v_agreement.agreement_no,
        'planId',        v_plan.id,
        'termMonths',    v_plan.term_months,
        'monthlyFee',    v_plan.monthly_fee,
        'contractTotal', v_contract
      ),
      'remark', 'Rental ' || v_agreement.agreement_no || ' - RM'
                || trim(to_char(v_plan.monthly_fee, 'FM999999990.00')) || '/mo x '
                || v_plan.term_months || ' months = RM'
                || trim(to_char(v_contract, 'FM999999990.00'))
    )
  );

  UPDATE rental_agreements SET order_id = v_order.id, updated_at = now()
   WHERE id = v_agreement.id
   RETURNING * INTO v_agreement;

  -- 0278: this line already claimed "signed". Now it names WHO and WHICH paper,
  -- so the order timeline carries the evidence too.
  INSERT INTO order_history (order_id, text, by_role)
  VALUES (
    v_order.id,
    'Rental ' || v_agreement.agreement_no || ' signed by ' || v_sig_name
      || ' (' || coalesce(v_template->>'name', 'agreement') || ' v'
      || (v_template->>'version') || ') - awaiting finance credit approval',
    (SELECT public.app_role())
  );

  INSERT INTO audit_log (role, actor_text, action, dealer_id, ref)
  VALUES (NULL, 'pos-rental:' || v_role, 'rental.agreement_submitted',
          v_dealer_id, v_agreement.agreement_no);

  RETURN jsonb_build_object(
    'agreement',       to_jsonb(v_agreement),
    'customer',        to_jsonb(v_customer),
    'unit',            NULL,
    'entitlementId',   NULL,
    'visitsTotal',     0,
    'pendingApproval', true,
    'orderId',         v_order.id,
    'so',              v_order.so
  );
END;
$function$;

-- ── 4 · approve refuses an unsigned application ──────────────────────────────
-- Same signature, so CREATE OR REPLACE keeps the existing grants. The ONLY
-- change from the live 0268 body is the guard block marked 0278 below; the rest
-- was pulled out of pg_get_functiondef rather than retyped, per the standing
-- rule about reconciling a function body back to live.
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

  -- 0278 — the guard 0268 left commented out, now that signing is built. It
  -- strands nobody: the queue held ZERO pending applications when this was
  -- applied (asserted in the sanity block), and from here every application is
  -- born signed. Because 0275's proceed_order rental branch requires 'active',
  -- this one line also means an unsigned contract can never reach operations.
  -- Closes CF `rental-approve-without-signature`.
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

  INSERT INTO rental_billings (agreement_id, seq, due_date, amount_due, status)
  SELECT v_ra.id,
         gs,
         (v_ra.start_date + make_interval(months => gs - 1))::date,
         v_ra.monthly_fee,
         'due'
    FROM generate_series(1, v_ra.term_months) AS gs;

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
  -- Wrapped: a missing delivery date must NOT undo a credit decision. The
  -- approval stands and finance is told what is still needed, rather than the
  -- whole thing rolling back over a blank field.
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

-- ── 5 · grants ───────────────────────────────────────────────────────────────
-- A DROP throws EXECUTE away, so create_rental_agreement is re-granted to
-- exactly what it held before this migration (measured: authenticated +
-- service_role, anon false).
--
-- `REVOKE … FROM anon` ALONE DOES NOTHING and `REVOKE … FROM public` alone does
-- nothing either: a new function is created with EXECUTE granted to PUBLIC, and
-- anon inherits it. The working form is `FROM public, anon` PLUS an explicit
-- grant back, or every Hono user-client call dies with permission denied. Both
-- directions are asserted below rather than assumed.
REVOKE ALL ON FUNCTION public.rental_current_agreement_template(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.create_rental_agreement(
  uuid, text, text, text, text, uuid, uuid, date, text, date, text, text, text
) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.rental_current_agreement_template(text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_rental_agreement(
  uuid, text, text, text, text, uuid, uuid, date, text, date, text, text, text
) TO authenticated, service_role;

-- ── 6 · sanity ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_copies    integer;
  v_pending   integer;
  v_halfsign  integer;
BEGIN
  -- the 0153/0154 ghost-overload trap: a DROP + CREATE that silently left two
  -- copies would mean the OLD unsigned body keeps serving some callers.
  SELECT count(*) INTO v_copies
    FROM pg_proc p
   WHERE p.proname = 'create_rental_agreement'
     AND p.pronamespace = 'public'::regnamespace;
  IF v_copies <> 1 THEN
    RAISE EXCEPTION '0278: expected exactly 1 create_rental_agreement, found %', v_copies;
  END IF;

  -- the new approve guard must strand nobody who is already in the queue.
  SELECT count(*) INTO v_pending
    FROM public.rental_agreements
   WHERE status = 'pending_approval' AND signed_at IS NULL;
  IF v_pending > 0 THEN
    RAISE EXCEPTION
      '0278: % unsigned application(s) are already awaiting approval - the new guard would jam them shut. Decide them first.',
      v_pending;
  END IF;

  -- the constraint must accept every row that already exists (RA-1003 carries
  -- all five columns NULL, so it is wholly unsigned and therefore consistent).
  SELECT count(*) INTO v_halfsign
    FROM public.rental_agreements
   WHERE NOT (
     (signed_at IS NULL AND signature_path IS NULL AND signed_name IS NULL
      AND template_id IS NULL AND template_version IS NULL)
     OR
     (signed_at IS NOT NULL AND signature_path IS NOT NULL AND signed_name IS NOT NULL
      AND template_id IS NOT NULL AND template_version IS NOT NULL)
   );
  IF v_halfsign > 0 THEN
    RAISE EXCEPTION '0278: % half-signed agreement row(s) exist', v_halfsign;
  END IF;

  -- grants, both directions, on both functions.
  IF has_function_privilege('anon',
       'public.rental_current_agreement_template(text)', 'EXECUTE') THEN
    RAISE EXCEPTION '0278: anon can execute rental_current_agreement_template';
  END IF;
  IF has_function_privilege('anon',
       'public.create_rental_agreement(uuid, text, text, text, text, uuid, uuid, date, text, date, text, text, text)',
       'EXECUTE') THEN
    RAISE EXCEPTION '0278: anon can execute create_rental_agreement';
  END IF;
  IF NOT has_function_privilege('authenticated',
       'public.rental_current_agreement_template(text)', 'EXECUTE') THEN
    RAISE EXCEPTION '0278: authenticated CANNOT execute rental_current_agreement_template';
  END IF;
  IF NOT has_function_privilege('authenticated',
       'public.create_rental_agreement(uuid, text, text, text, text, uuid, uuid, date, text, date, text, text, text)',
       'EXECUTE') THEN
    RAISE EXCEPTION '0278: authenticated CANNOT execute create_rental_agreement';
  END IF;
  IF NOT has_function_privilege('service_role',
       'public.create_rental_agreement(uuid, text, text, text, text, uuid, uuid, date, text, date, text, text, text)',
       'EXECUTE') THEN
    RAISE EXCEPTION '0278: service_role CANNOT execute create_rental_agreement';
  END IF;

  RAISE NOTICE '0278 OK: 1 sell RPC copy, % pending unsigned, grants asserted both ways', v_pending;
END $$;

COMMIT;
