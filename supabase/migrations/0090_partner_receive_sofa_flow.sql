-- =============================================================================
-- 0090_partner_receive_sofa_flow.sql (Loo 2026-05-11)
-- =============================================================================
-- Reactivates the Phase 4 v3 Sofa-acceptance flow:
--   supplier mark-ready → partner-WH owner notice → accept OR reject → flow
--
-- HoOKkA (own_logistics) ships sofa straight to a partner-owned warehouse.
-- The partner (warehouse owner) has acceptance/rejection rights at the
-- pre-flight stage. On accept, supplier dispatches; on reject, Logistics
-- relocates to a different warehouse via `logistics_relocate_warehouse`.
--
-- This migration:
--
--   1. Recreates partner_confirm_receive(text) — was DROPPED by 0060 in the
--      stale-pre-0051 sweep with a wrong "superseded by lp_accept_inbound_delivery"
--      annotation. The Phase 7 carry-forward "partner-side customer-rejected
--      RPC wasn't part of original Phase 7 acceptance" referred to this gap.
--      Body lifted from 0034 line 366-451 with the 0052 column rename
--      (delivery_partner_id → procurement_partner_id).
--
--   2. Extends partner_confirm_receive + partner_reject_customer ownership:
--      a partner can accept/reject if EITHER procurement_partner_id = me
--      (factory-pickup assignment) OR warehouse.owning_partner_id = me
--      (own_logistics + partner-owned destination warehouse case — Loo's
--      "Logistics Partner 的 Warehouse" path).
--
--   3. Extends partner_sees_own_po RLS policy with the same dual path so
--      partner-WH owners actually see incoming PO rows in their kanban.
--      Mirror policy on purchase_order_lines.
--
-- Authorized in conversation 2026-05-11 per CLAUDE.md §7.
-- =============================================================================


-- 1. partner_confirm_receive — recreate with extended ownership.
CREATE OR REPLACE FUNCTION public.partner_confirm_receive(p_po_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_po                purchase_orders;
  v_role              app_role;
  v_partner_id        uuid;
  v_actor             text;
  v_threads_advanced  int;
  v_owns_via_wh       boolean;
BEGIN
  v_role := public.app_role();
  v_partner_id := public.app_partner_id();

  IF v_role IS DISTINCT FROM 'partner' THEN
    RAISE EXCEPTION 'forbidden: partner only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'partner JWT missing partner_id'
      USING ERRCODE = '42501', DETAIL = 'partner_id_missing';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found'
      USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM warehouses w
    WHERE w.id = v_po.warehouse_id
      AND w.owning_partner_id = v_partner_id
  ) INTO v_owns_via_wh;

  IF v_po.procurement_partner_id IS DISTINCT FROM v_partner_id AND NOT v_owns_via_wh THEN
    RAISE EXCEPTION 'forbidden: cross-partner confirm-receive'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  IF v_po.sup_status IS DISTINCT FROM 'ready_confirm_sent' THEN
    RAISE EXCEPTION 'PO is not in ready_confirm_sent state (got %)', v_po.sup_status
      USING ERRCODE = '22023', DETAIL = 'wrong_sup_status';
  END IF;

  v_actor := COALESCE((SELECT name FROM app_users WHERE id = (SELECT auth.uid())), 'Partner');

  UPDATE purchase_orders
     SET sup_status            = 'partner_confirmed',
         partner_confirmed_at  = now(),
         updated_at            = now()
   WHERE id = p_po_id;

  UPDATE order_supplier_threads
     SET logistics_stage = 'dispatched',
         updated_at      = now()
   WHERE po_id = p_po_id;
  GET DIAGNOSTICS v_threads_advanced = ROW_COUNT;

  INSERT INTO po_history (po_id, text, by_role)
  VALUES (
    p_po_id,
    'Partner confirmed receive · supplier may dispatch',
    'partner'
  );

  INSERT INTO audit_log (role, actor_text, action, ref)
  VALUES ('partner', v_actor,
          format('Partner confirmed receive on PO %s (%s thread(s) advanced)',
                 p_po_id, v_threads_advanced),
          p_po_id);

  RETURN jsonb_build_object(
    'po_id',                p_po_id,
    'sup_status',           'partner_confirmed',
    'partner_confirmed_at', now(),
    'threads_advanced',     v_threads_advanced
  );
END;
$$;

REVOKE ALL ON FUNCTION public.partner_confirm_receive(text) FROM public;
GRANT EXECUTE ON FUNCTION public.partner_confirm_receive(text) TO authenticated;


-- 2. partner_reject_customer — extend ownership with warehouse-owner path.
CREATE OR REPLACE FUNCTION public.partner_reject_customer(
  p_po_id  text,
  p_reason text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_po          purchase_orders;
  v_role        app_role;
  v_partner_id  uuid;
  v_actor       text;
  v_rejection   jsonb;
  v_owns_via_wh boolean;
BEGIN
  v_role := public.app_role();
  v_partner_id := public.app_partner_id();

  IF v_role NOT IN ('partner', 'logistics', 'principal') THEN
    RAISE EXCEPTION 'forbidden: partner or logistics only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found' USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM warehouses w
    WHERE w.id = v_po.warehouse_id
      AND w.owning_partner_id = v_partner_id
  ) INTO v_owns_via_wh;

  IF v_role = 'partner'
     AND v_po.procurement_partner_id IS DISTINCT FROM v_partner_id
     AND NOT v_owns_via_wh THEN
    RAISE EXCEPTION 'forbidden: cross-partner reject'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  IF v_po.sup_status NOT IN ('ready_confirm_sent', 'partner_confirmed') THEN
    RAISE EXCEPTION 'PO not in pre-flight state (got %)', v_po.sup_status
      USING ERRCODE = '22023', DETAIL = 'wrong_sup_status';
  END IF;

  v_actor := COALESCE((SELECT name FROM app_users WHERE id = (SELECT auth.uid())), INITCAP(v_role::text));

  v_rejection := jsonb_build_object(
    'at',                    now(),
    'rejected_by',           'lp',
    'original_warehouse_id', v_po.warehouse_id
  );
  IF p_reason <> '' THEN
    v_rejection := v_rejection || jsonb_build_object('reason_audit_only', p_reason);
  END IF;

  UPDATE purchase_orders
     SET sup_status         = 'customer_rejected',
         customer_rejection = v_rejection,
         updated_at         = now()
   WHERE id = p_po_id;

  INSERT INTO po_history (po_id, text, by_role)
  VALUES (p_po_id,
          format('LP rejected inbound%s', CASE WHEN p_reason <> '' THEN ': ' || p_reason ELSE '' END),
          v_role);

  INSERT INTO audit_log (role, actor_text, action, ref)
  VALUES (v_role, v_actor,
          format('LP rejected inbound on PO %s%s', p_po_id,
                 CASE WHEN p_reason <> '' THEN format(' (reason: %s)', p_reason) ELSE '' END),
          p_po_id);

  RETURN jsonb_build_object(
    'po_id',       p_po_id,
    'sup_status',  'customer_rejected',
    'rejected_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.partner_reject_customer(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.partner_reject_customer(text, text) TO authenticated;


-- 3. RLS: partner sees own PO via either procurement assignment OR WH ownership.
DROP POLICY IF EXISTS partner_sees_own_po ON purchase_orders;
CREATE POLICY partner_sees_own_po ON purchase_orders
FOR SELECT TO authenticated
USING (
  (select public.app_role()) = 'partner'
  AND (
    procurement_partner_id = (select public.app_partner_id())
    OR EXISTS (
      SELECT 1 FROM warehouses w
      WHERE w.id = purchase_orders.warehouse_id
        AND w.owning_partner_id = (select public.app_partner_id())
    )
  )
);


-- 4. Mirror policy on po lines.
DROP POLICY IF EXISTS partner_sees_own_po_lines ON purchase_order_lines;
CREATE POLICY partner_sees_own_po_lines ON purchase_order_lines
FOR SELECT TO authenticated
USING (
  (select public.app_role()) = 'partner'
  AND EXISTS (
    SELECT 1
      FROM purchase_orders p
     WHERE p.id = purchase_order_lines.po_id
       AND (
         p.procurement_partner_id = (select public.app_partner_id())
         OR EXISTS (
           SELECT 1 FROM warehouses w
           WHERE w.id = p.warehouse_id
             AND w.owning_partner_id = (select public.app_partner_id())
         )
       )
  )
);
