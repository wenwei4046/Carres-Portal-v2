-- =============================================================================
-- 0105_top_up_order_allow_through_dispatched.sql (Loo 2026-05-13)
-- =============================================================================
-- Feature: Allow recording a top-up payment all the way through the pipeline
-- until the order is delivered or cancelled.
--
-- Before (0009): top_up_order gated to status='place'. Once Logistics
-- confirmed-proceed and the order flipped to 'proceed_order', dealer/logistics
-- could no longer record a partial payment. Real flow: customer pays 50%
-- deposit at order time, then pays the remaining balance at delivery (cash on
-- delivery, bank transfer to Logistics, etc.). The old gate blocked that.
--
-- After: status not in ('delivered','cancelled'). 'place' + 'proceed_order'
-- both admit top-ups. The amount-cap check (paid <= total) already prevents
-- over-payment, so widening the status check is safe.
--
-- Safety:
--   - Recreates only the status check. No signature change. No new column.
--   - Reversible: re-apply 0009 to roll back the gate.
-- Authorized in conversation 2026-05-13 per CLAUDE.md §7.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.top_up_order(
  p_order_id     uuid,
  p_amount       numeric,
  p_method       text,
  p_method_label text,
  p_reference    text,
  p_note         text,
  p_date         date,
  p_photo_paths  jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order            orders;
  v_role             app_role;
  v_caller_dealer_id uuid;
  v_total            numeric(12,2);
  v_capped_amount    numeric(12,2);
  v_new_paid         numeric(12,2);
BEGIN
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();

  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found'
      USING ERRCODE = '42P01';
  END IF;

  IF v_role NOT IN ('principal','logistics','finance','bd')
     AND v_order.dealer_id IS DISTINCT FROM v_caller_dealer_id THEN
    RAISE EXCEPTION 'forbidden: cross-dealer top-up'
      USING ERRCODE = '42501';
  END IF;

  -- Widened (0105): allow top-up through the active pipeline. Only block when
  -- the order is fully settled or cancelled — the amount-cap below still
  -- prevents over-payment.
  IF v_order.status IN ('delivered','cancelled') THEN
    RAISE EXCEPTION 'Top-up not allowed once order is delivered or cancelled'
      USING ERRCODE = '22023', DETAIL = 'wrong_status';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero'
      USING ERRCODE = '22023', DETAIL = 'invalid_amount';
  END IF;

  SELECT
    coalesce((SELECT sum(unit_price * qty) FROM order_lines  WHERE order_id = p_order_id), 0)
    + coalesce((SELECT sum(unit_price * qty) FROM order_addons WHERE order_id = p_order_id), 0)
  INTO v_total;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Order has no priced items — cannot top up'
      USING ERRCODE = '22023', DETAIL = 'total_amount_missing';
  END IF;

  v_capped_amount := least(p_amount, v_total - v_order.paid);
  IF v_capped_amount <= 0 THEN
    RAISE EXCEPTION 'Order is already fully paid'
      USING ERRCODE = '22023', DETAIL = 'already_paid';
  END IF;
  v_new_paid := v_order.paid + v_capped_amount;

  UPDATE orders
     SET paid = v_new_paid,
         updated_at = now()
   WHERE id = p_order_id;

  INSERT INTO order_history (order_id, text, by_role, metadata)
  VALUES (
    p_order_id,
    format(
      'Top-up RM %s via %s%s',
      v_capped_amount::text,
      coalesce(nullif(p_method_label, ''), p_method),
      CASE
        WHEN p_reference IS NOT NULL AND trim(p_reference) <> ''
        THEN ' · ref ' || p_reference
        ELSE ''
      END
    ),
    v_role,
    jsonb_build_object(
      'kind', 'top_up',
      'amount', v_capped_amount,
      'method', p_method,
      'method_label', p_method_label,
      'reference', nullif(p_reference, ''),
      'note', nullif(p_note, ''),
      'date', p_date,
      'photo_paths', coalesce(p_photo_paths, '[]'::jsonb)
    )
  );

  INSERT INTO audit_log (role, action, dealer_id, ref)
  VALUES (
    v_role,
    'order.top_up',
    v_order.dealer_id,
    'DL-' || v_order.dl::text
  );

  RETURN jsonb_build_object(
    'id', p_order_id,
    'amount', v_capped_amount,
    'paid', v_new_paid
  );
END;
$$;
