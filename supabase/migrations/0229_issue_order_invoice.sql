-- =============================================================================
-- 0229_issue_order_invoice.sql (Jess 2026-07-18 — Balance tab §10 Generate invoice)
-- =============================================================================
-- SPEC §10 "Generate invoice": the Balance tab issues the Sales Invoice ON
-- DEMAND — before dispatch — instead of waiting for the 0098 auto-issue
-- trigger (which only fires on operation_stage -> 'dispatched').
--
-- Semantics:
--   * IDEMPOTENT — an already-invoiced order returns its existing invoice
--     untouched (an invoice, once issued, is immutable; void + re-issue is
--     the correction path, unchanged from 0098's model).
--   * Number formula IDENTICAL to orders_auto_issue_on_dispatched:
--       INV-YYYY-{so, 6-digit zero-padded}
--     so the dispatch trigger and this RPC can never mint two different
--     numbers for one order (the trigger's `IF invoice_no IS NULL` guard
--     then no-ops at dispatch).
--   * Amount: caller-supplied p_amount wins (the Balance tab's invoice
--     total = goods total + storage fee — AutoCount-imported orders carry
--     NO order_lines prices, so the line-sum is 0 for them); falls back to
--     the 0098 line+addon sum for native orders when p_amount is absent.
--   * History: order_history + audit_log rows, mirroring 0098.
--
-- Roles: operation / principal (via is_operation()) + finance. Internal tax
-- doc — dealer/partner/supplier/showroom denied.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.issue_order_invoice(
  p_order_id uuid,
  p_amount   numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role       text;
  v_actor_uid  uuid;
  v_so         bigint;
  v_existing   text;
  v_invoice_no text;
  v_amount     numeric(12,2);
BEGIN
  v_actor_uid := (SELECT auth.uid());
  v_role := (SELECT role FROM app_users WHERE id = v_actor_uid);
  IF NOT (public.is_operation() OR v_role = 'finance') THEN
    RAISE EXCEPTION 'Not allowed to issue invoices' USING ERRCODE = '42501';
  END IF;

  -- Lock the order row so two concurrent issues can't race the number.
  SELECT so, invoice_no INTO v_so, v_existing
  FROM orders WHERE id = p_order_id FOR UPDATE;
  IF v_so IS NULL THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;

  -- Already issued -> return it untouched (idempotent).
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'invoice_no', v_existing,
      'issued_at', (SELECT issued_at FROM invoices WHERE invoice_no = v_existing),
      'amount', (SELECT amount FROM invoices WHERE invoice_no = v_existing),
      'already_issued', true
    );
  END IF;

  -- Amount: caller figure (Balance tab total = goods + storage) else the
  -- 0098 line+addon sum (native orders).
  IF p_amount IS NOT NULL AND p_amount >= 0 THEN
    v_amount := p_amount;
  ELSE
    SELECT
      coalesce(sum(ol.qty * ol.unit_price), 0) +
      coalesce((SELECT sum(oa.qty * oa.unit_price) FROM order_addons oa
                WHERE oa.order_id = p_order_id), 0)
    INTO v_amount
    FROM order_lines ol
    WHERE ol.order_id = p_order_id;
  END IF;

  v_invoice_no := 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(v_so::text, 6, '0');

  INSERT INTO invoices (invoice_no, order_id, amount, tax_amount, issued_at)
  VALUES (v_invoice_no, p_order_id, v_amount, 0, current_date)
  ON CONFLICT (invoice_no) DO NOTHING;

  UPDATE orders
  SET invoice_no = v_invoice_no, invoiced_at = current_date
  WHERE id = p_order_id;

  INSERT INTO order_history (order_id, text, by_role, by_user_id)
  VALUES (
    p_order_id,
    format('Sales Invoice issued from Balance tab · %s (RM %s)', v_invoice_no, v_amount),
    'operation',
    v_actor_uid
  );

  INSERT INTO audit_log (role, actor_text, action, ref)
  VALUES (
    'operation',
    coalesce((SELECT name FROM app_users WHERE id = v_actor_uid), 'System'),
    format('Issued invoice %s on demand for order #%s (RM %s)', v_invoice_no, v_so, v_amount),
    p_order_id::text
  );

  RETURN jsonb_build_object(
    'invoice_no', v_invoice_no,
    'issued_at', current_date,
    'amount', v_amount,
    'already_issued', false
  );
END;
$$;

-- Supabase default-grants EXECUTE to authenticated/anon (KEY LESSON, §17.1):
-- strip anon explicitly; authenticated stays callable — the in-function role
-- check is the gate.
REVOKE EXECUTE ON FUNCTION public.issue_order_invoice(uuid, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.issue_order_invoice(uuid, numeric) TO authenticated;
