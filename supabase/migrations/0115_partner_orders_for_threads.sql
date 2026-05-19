-- 0115_partner_orders_for_threads.sql
-- 2026-05-16 (Loo screenshot) — partner-side kanban renders the ready-thread
-- multi-select with "DL-? · —" because the embedded `orders(dl, customer_name)`
-- nested select under threads gets blocked by orders_scoped_read (0002). That
-- policy admits partners only when `orders.delivery_partner_id = app_partner_id()`,
-- which is the customer-leg LP. PO-2033's orders haven't been dispatched to a
-- customer-leg LP yet, so the procurement-leg partner (Nets) sees null nested
-- orders for every thread it owns through the PO.
--
-- Fix mirrors the supplier solution (0111 supplier_threads_for_po): expose a
-- SECURITY DEFINER RPC that bypasses orders RLS internally but enforces
-- partner ownership via procurement_partner_id OR warehouse.owning_partner_id.
-- API route calls this RPC after the main pickups SELECT and merges the
-- enriched order info back into thread rows.
--
-- We deliberately avoid adding an orders SELECT policy: 0110 attempted this
-- for the supplier case and triggered infinite recursion in the planner.
-- A function with explicit scope check is the established safe path.

CREATE OR REPLACE FUNCTION public.partner_orders_for_threads(p_order_ids uuid[])
RETURNS TABLE(id uuid, dl integer, customer_name text, delivery_date date)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_partner_id uuid;
BEGIN
  v_partner_id := public.app_partner_id();

  IF public.app_role() <> 'partner' THEN
    RAISE EXCEPTION 'forbidden: partner role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: partner_id missing on JWT'
      USING ERRCODE = '42501', DETAIL = 'no_partner_id';
  END IF;

  -- Return orders that are linked via a thread on a PO the partner owns
  -- through either the procurement leg (procurement_partner_id) or the
  -- warehouse leg (own_logistics + partner-owned WH). Limited to the
  -- caller-supplied order_ids so this can't be used to dump every order.
  RETURN QUERY
  SELECT DISTINCT o.id, o.dl, o.customer_name, o.delivery_date
  FROM orders o
  JOIN order_supplier_threads t ON t.order_id = o.id
  JOIN purchase_orders po ON po.id = t.po_id
  LEFT JOIN warehouses w ON w.id = po.warehouse_id
  WHERE o.id = ANY(p_order_ids)
    AND (po.procurement_partner_id = v_partner_id
         OR w.owning_partner_id = v_partner_id);
END;
$$;

REVOKE ALL ON FUNCTION public.partner_orders_for_threads(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.partner_orders_for_threads(uuid[]) TO authenticated;
