-- =============================================================================
-- 0275_rental_makes_a_sales_order.sql (Loo 2026-07-26 — "start with the SO")
-- =============================================================================
-- A rental produced an `RA-` and nothing else. No Sales Order meant: no SO
-- document, no invoice, and — the part that actually bites — OPERATIONS NEVER
-- SAW IT. The rented unit was stamped 'allocated' in the asset registry while
-- nothing anywhere told a warehouse to deliver it. A signed, credit-approved
-- rental simply stopped moving.
--
-- The locked spec already said this is how it should work; the built lane had
-- drifted from it:
--
--   "sales takes the order + customer signature -> the order lands on a finance
--    Approver page instead of going straight to operations. Approve -> the sales
--    order moves on to operations. Reject -> the order fails."
--
-- So: a rental signup now mints an `orders` row + one `order_lines` row, links
-- it as `rental_agreements.order_id`, APPROVE proceeds it into operations, and
-- REJECT cancels it (which closes CF `rental-reject-does-not-cancel-the-order`).
--
-- ── THE MONEY DECISION, AND WHY ──────────────────────────────────────────────
-- The rental order's line is priced at ZERO and its total is zero. That is
-- deliberate: a rental order is a FULFILMENT document, not a money document.
-- The money for a rental lives in `rental_billings` (84 monthly rows) and in
-- Stripe. Had the line carried the retail price, finance's AR would show
-- RM2,499 outstanding for a customer who owes nothing today; had it carried the
-- contract value, AR would double-count every ringgit already scheduled in
-- `rental_billings`. Zero is the only figure that is not a lie.
--
-- What the paperwork prints instead of a price rides in the line's
-- `attrs.rental` (plan, term, monthly fee, contract total, agreement no), so the
-- SO PDF and the order drawer can say "Rental · RM69/mo x 84 = RM5,796" without
-- any of it entering a total.
--
-- ── WHY proceed_order NEEDS A BRANCH ─────────────────────────────────────────
-- Its two money gates (`total_amount_missing`, `payment_below_50`) exist because
-- a normal order must be half paid before Carres spends on stock. A rental's
-- equivalent guarantee is not a deposit — it is the signed agreement plus the
-- credit approval plus the card on file. So for a rental order those two gates
-- are replaced by ONE: the agreement must be `active`, i.e. finance approved it.
--
-- The order's own `signature_required` / `terms_not_accepted` gates are also
-- skipped for a rental, because the contract the customer signs is the RENTAL
-- AGREEMENT, not the SO. That is not a hole being left open: 0268's approve path
-- is where the signature will be enforced (CF
-- `rental-approve-without-signature`), and since this branch requires the
-- agreement to be `active`, tightening THAT one guard automatically tightens
-- this one too. One gate to fix, everything downstream inherits it.
--
-- ── A DEALER IS NOW REQUIRED ─────────────────────────────────────────────────
-- `orders.dealer_id` is NOT NULL, so a rental that mints an order must belong to
-- a store. The RPC used to allow a dealer-less "HQ-direct" agreement; that shape
-- is now refused with a readable error. The POS always sends a store (its
-- submit is gated on one), so this narrows a path nothing real used.
--
-- NOT BACKFILLED: RA-1003 (the only existing agreement) is Loo's TEST record —
-- customer "TEST RENTAL", sku "TEST-RENTAL-K", and dealer-less. Minting it an SO
-- would put a phantom delivery job into a real store's operations queue, so it
-- is deliberately left alone.
-- =============================================================================

BEGIN;

-- Finding a rental order by its order id happens on every proceed; this keeps it
-- an index probe rather than a scan of the agreement table.
CREATE INDEX IF NOT EXISTS rental_agreements_order_id_idx
  ON public.rental_agreements (order_id)
  WHERE order_id IS NOT NULL;

-- ── 1 · signup mints the agreement AND its Sales Order ───────────────────────
-- DROP first, deliberately: adding a parameter to a live function creates a
-- SECOND overload rather than replacing it (the 0153/0154 ghost-overload trap),
-- and an ambiguous 9-arg call would then fail at runtime. One caller exists
-- (POST /api/rental/agreements) and it is updated in the same change.
DROP FUNCTION IF EXISTS public.create_rental_agreement(
  uuid, text, text, text, text, uuid, uuid, date, text
);

CREATE FUNCTION public.create_rental_agreement(
  p_plan_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text DEFAULT NULL::text,
  p_customer_address text DEFAULT NULL::text,
  p_dealer_id uuid DEFAULT NULL::uuid,
  p_salesperson_id uuid DEFAULT NULL::uuid,
  p_start_date date DEFAULT NULL::date,
  p_notes text DEFAULT NULL::text,
  -- NEW: the order needs a delivery date to reach operations. The POS wizard
  -- already collects one; it simply was not being passed through.
  p_delivery_date date DEFAULT NULL::date
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
  v_dealer_id := coalesce(v_jwt_dealer, p_dealer_id);

  -- 0275: a rental now produces a Sales Order, and an order belongs to a store.
  IF v_dealer_id IS NULL THEN
    RAISE EXCEPTION 'A rental must be sold through a store — pick the store first'
      USING errcode = 'P0001', detail = 'dealer_required';
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

  -- Agreement — sku/term/fee/splits are SNAPSHOTS from the plan row read HERE,
  -- inside the definer transaction. It is an APPLICATION until finance says
  -- otherwise: no billing schedule, no allocated unit, no entitlement (0268).
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

  v_contract := round(v_plan.monthly_fee * v_plan.term_months, 2);
  v_channel  := coalesce((SELECT channel FROM dealers WHERE id = v_dealer_id), 'dealer');

  -- ── the Sales Order ────────────────────────────────────────────────────────
  -- Born 'place' like any other order. It reaches operations only when finance
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
    0, false, 'rental'
  )
  RETURNING * INTO v_order;

  -- ONE line: the thing to deliver. Priced ZERO on purpose (see the header) —
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
      'remark', 'Rental ' || v_agreement.agreement_no || ' · RM'
                || trim(to_char(v_plan.monthly_fee, 'FM999999990.00')) || '/mo x '
                || v_plan.term_months || ' months = RM'
                || trim(to_char(v_contract, 'FM999999990.00'))
    )
  );

  UPDATE rental_agreements SET order_id = v_order.id, updated_at = now()
   WHERE id = v_agreement.id
   RETURNING * INTO v_agreement;

  INSERT INTO order_history (order_id, text, by_role)
  VALUES (
    v_order.id,
    'Rental ' || v_agreement.agreement_no || ' signed · awaiting finance credit approval',
    (SELECT public.app_role())
  );

  -- audit_log's role column is the app enum; 'salesperson' etc. live outside
  -- it, so the seller role travels in actor_text (the 0223 webhook precedent).
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

-- ── 2 · proceed_order learns that a rental pays differently ───────────────────
CREATE OR REPLACE FUNCTION public.proceed_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order            orders;
  v_role             app_role;
  v_caller_dealer_id uuid;
  v_total            numeric(12,2);
  v_paid_pct         numeric;
  v_rental           rental_agreements;
begin
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  if v_role not in ('principal','operation','finance','bd')
     and v_order.dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer proceed'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if v_order.status <> 'place' then
    raise exception 'Order is not in Place status'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  -- 0275: is this a rental order? Its guarantee of payment is the agreement,
  -- not a deposit, so the money + signature gates below take a different shape.
  select * into v_rental from rental_agreements where order_id = p_order_id limit 1;

  if v_order.customer_name is null or trim(v_order.customer_name) = '' then
    raise exception 'Customer name is required'
      using errcode = 'P0001', detail = 'customer_name_required';
  end if;

  if v_order.customer_phone is null or trim(v_order.customer_phone) = '' then
    raise exception 'Customer phone is required'
      using errcode = 'P0001', detail = 'customer_phone_required';
  end if;

  if v_order.customer_address_unknown
     or v_order.customer_address is null
     or trim(v_order.customer_address) = '' then
    raise exception 'Delivery address is required'
      using errcode = 'P0001', detail = 'delivery_address_required';
  end if;

  if v_order.delivery_date_tbd or v_order.delivery_date is null then
    raise exception 'Delivery date is required'
      using errcode = 'P0001', detail = 'delivery_date_required';
  end if;

  if v_rental.id IS NULL then
    -- ── ordinary sale: unchanged, byte for byte ──
    if v_order.signature_url is null then
      raise exception 'Customer signature is required'
        using errcode = 'P0001', detail = 'signature_required';
    end if;

    if not v_order.terms_accepted then
      raise exception 'Terms must be accepted'
        using errcode = 'P0001', detail = 'terms_not_accepted';
    end if;

    select
      coalesce((select sum(unit_price * qty) from order_lines  where order_id = p_order_id), 0)
      + coalesce((select sum(unit_price * qty) from order_addons where order_id = p_order_id), 0)
    into v_total;

    if v_total <= 0 then
      raise exception 'Order total is zero — nothing to proceed'
        using errcode = 'P0001', detail = 'total_amount_missing';
    end if;

    v_paid_pct := (v_order.paid / v_total) * 100;
    if v_paid_pct < 50 then
      raise exception 'Payment must be at least 50 percent of total'
        using errcode = 'P0001', detail = 'payment_below_50';
    end if;
  else
    -- ── RENTAL: credit approval replaces the deposit, and the signed AGREEMENT
    -- is the contract (so the order's own signature/terms flags do not apply).
    -- Requiring `active` here means the signature guard on 0268's approve path
    -- is the ONE place to tighten — this gate inherits it for free.
    if v_rental.status = 'rejected' then
      raise exception 'Rental % was rejected — this order cannot proceed',
        v_rental.agreement_no
        using errcode = 'P0001', detail = 'rental_rejected';
    end if;
    if v_rental.status <> 'active' then
      raise exception 'Rental % is still awaiting finance approval',
        v_rental.agreement_no
        using errcode = 'P0001', detail = 'rental_not_approved';
    end if;
  end if;

  update orders
     set status          = 'proceed_order',
         operation_stage = 'confirmed',
         updated_at      = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role)
  values (
    p_order_id,
    case when v_rental.id is null
      then 'Order proceeded · awaiting logistics triage'
      else 'Rental ' || v_rental.agreement_no
           || ' approved · order proceeded, awaiting logistics triage'
    end,
    v_role
  );

  insert into audit_log (role, action, dealer_id, ref)
  values (
    v_role,
    'order.proceeded',
    v_order.dealer_id,
    'SO-' || v_order.so::text
  );

  return jsonb_build_object(
    'id',              v_order.id,
    'so',              v_order.so,
    'status',          'proceed_order',
    'operation_stage', 'confirmed'
  );
end;
$function$;

-- ── 3 · APPROVE moves the sales order on to operations ───────────────────────
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
  -- NO `signed_at IS NULL` guard yet — signing is not built (0267 landed the
  -- columns and nothing writes them), so a guard here would jam the queue shut.
  -- When the signing view lands, add it HERE and the 0275 proceed gate inherits
  -- it automatically. CF `rental-approve-without-signature`.

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

  -- The full term's schedule, all 'due'. Amounts come from the AGREEMENT, not
  -- the plan — the contract is what was signed.
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

  -- 0275 — "Approve -> the sales order moves on to operations" (Loo, locked).
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
    'agreement',     to_jsonb(v_ra),
    'unit',          to_jsonb(v_unit),
    'entitlementId', v_entitlement_id,
    'visitsTotal',   v_visits_total,
    'orderProceeded', v_proceeded,
    'orderBlockedBy', v_proceed_note
  );
END;
$function$;

-- ── 4 · REJECT fails the order too (closes the CF) ───────────────────────────
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

REVOKE ALL ON FUNCTION public.create_rental_agreement(
  uuid, text, text, text, text, uuid, uuid, date, text, date
) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_rental_agreement(
  uuid, text, text, text, text, uuid, uuid, date, text, date
) TO authenticated, service_role;

COMMIT;
