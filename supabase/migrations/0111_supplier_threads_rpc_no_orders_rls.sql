-- =============================================================================
-- 0111_supplier_threads_rpc_no_orders_rls.sql (Loo 2026-05-15)
-- =============================================================================
-- 0110 caused infinite recursion. Rolling back the RLS approach in favour of
-- a SECURITY DEFINER RPC that reads orders + order_lines bypassing RLS but
-- gated on supplier_id = app_supplier_id() inside the function body.
--
-- Authorized in conversation per CLAUDE.md §7.
-- =============================================================================

DROP POLICY IF EXISTS orders_supplier_read_via_threads ON orders;
DROP POLICY IF EXISTS order_lines_supplier_read_via_threads ON order_lines;

CREATE OR REPLACE FUNCTION public.supplier_threads_for_po(p_po_id text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_supplier_id uuid;
  v_po          purchase_orders;
  v_result      jsonb;
BEGIN
  IF public.app_role() <> 'supplier' THEN
    RAISE EXCEPTION 'forbidden: supplier only' USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  v_supplier_id := public.app_supplier_id();
  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'no supplier_id on JWT' USING ERRCODE = '42501', DETAIL = 'no_supplier_id';
  END IF;
  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found' USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;
  IF v_po.supplier_id IS DISTINCT FROM v_supplier_id THEN
    RAISE EXCEPTION 'forbidden: cross_tenant' USING ERRCODE = '42501', DETAIL = 'cross_tenant';
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id',                     t.id,
      'order_id',               t.order_id,
      'order_dl',               o.dl,
      'customer_name',          o.customer_name,
      'customer_delivery_date', o.delivery_date,
      'supplier_ready_at',      t.supplier_ready_at,
      'pickup_event_id',        t.pickup_event_id,
      'sku_lines', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('sku', ol.sku, 'qty', ol.qty)), '[]'::jsonb)
          FROM order_lines ol
          JOIN product_skus ps ON ps.sku = ol.sku
          JOIN product_models pm ON pm.id = ps.model_id
         WHERE ol.order_id = t.order_id
           AND pm.category::text = t.category
      )
    )
    ORDER BY o.delivery_date NULLS LAST, t.id
  ), '[]'::jsonb) INTO v_result
  FROM order_supplier_threads t
  LEFT JOIN orders o ON o.id = t.order_id
  WHERE t.po_id = p_po_id;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.supplier_threads_for_po(text) FROM public;
GRANT EXECUTE ON FUNCTION public.supplier_threads_for_po(text) TO authenticated;
