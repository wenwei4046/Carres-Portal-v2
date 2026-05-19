-- 0116_supplier_orders_for_threads.sql
-- 2026-05-16 (Loo screenshot + carry-forward phase-10-supplier-pos-list-urgency-blank) —
-- supplier `/api/supplier/pos` LIST query embeds threads with `orders(dl, customer_name,
-- delivery_date)` to compute urgency badges + customer_eta_min on each PO card.
-- Under orders_scoped_read (0002) the supplier role isn't admitted (policy only
-- recognises internal / dealer / partner-delivery-leg), so the nested orders
-- returns null and the urgency badge stays hidden even when the PO has urgent
-- threads. The supplier PODrawer already worked around this via 0111
-- supplier_threads_for_po (single-PO scope) — this migration adds the bulk
-- equivalent for the list page.

CREATE OR REPLACE FUNCTION public.supplier_orders_for_threads(p_order_ids uuid[])
RETURNS TABLE(id uuid, dl integer, customer_name text, delivery_date date)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_supplier_id uuid;
BEGIN
  v_supplier_id := public.app_supplier_id();

  IF public.app_role() <> 'supplier' THEN
    RAISE EXCEPTION 'forbidden: supplier role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: supplier_id missing on JWT'
      USING ERRCODE = '42501', DETAIL = 'no_supplier_id';
  END IF;

  RETURN QUERY
  SELECT DISTINCT o.id, o.dl, o.customer_name, o.delivery_date
  FROM orders o
  JOIN order_supplier_threads t ON t.order_id = o.id
  JOIN purchase_orders po ON po.id = t.po_id
  WHERE o.id = ANY(p_order_ids)
    AND po.supplier_id = v_supplier_id;
END;
$$;

REVOKE ALL ON FUNCTION public.supplier_orders_for_threads(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.supplier_orders_for_threads(uuid[]) TO authenticated;
