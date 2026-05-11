-- =============================================================================
-- 0087_orders_do_file_path.sql (Loo 2026-05-11)
-- =============================================================================
-- Adds DO file storage to order-level delivery (logistics → customer via WH
-- or direct). Before this migration, "Attach Delivery Order" modal only
-- captured DO# + note + signed checkbox — Finance couldn't audit the actual
-- signed paper trail, customer disputes had no proof artefact.
--
-- New columns on `orders` (additive, nullable so existing delivered rows
-- stay valid):
--   - do_file_path     text         (path within `delivery-orders` bucket)
--   - do_uploaded_at   timestamptz  (audit)
--   - do_uploaded_by   uuid         (auth.uid() of logistics user)
--
-- Storage layout: paths take the form `order-<order_uuid>/<uuid>-<do>.<ext>`
-- to avoid collision with PO-side files at `<po_id>/<uuid>-<do>.<ext>`.
-- Storage RLS from 0042 + 0084 needs no change — logistics + principal
-- short-circuit on both read + write, and the partner branch's
-- purchase_orders lookup fails for `order-*` prefixes (those don't match
-- PO ids), so partner reads are correctly denied for order-DOs.
--
-- RPC change: logistics_attach_do_and_deliver gains p_do_file_path TEXT as
-- a REQUIRED parameter (signature change → DROP + recreate). All prior
-- behaviour preserved: stock decrement, reserve release, order_history,
-- audit_log entry. The new file path is persisted on the orders row + woven
-- into the order_history message for post-hoc traceability.
--
-- Authorized in conversation 2026-05-11 per CLAUDE.md §7.
-- =============================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS do_file_path   text,
  ADD COLUMN IF NOT EXISTS do_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS do_uploaded_by uuid REFERENCES app_users(id);

DROP FUNCTION IF EXISTS public.logistics_attach_do_and_deliver(uuid, text, text, boolean);

CREATE OR REPLACE FUNCTION public.logistics_attach_do_and_deliver(
  p_order_id     uuid,
  p_do_number    text,
  p_do_note      text,
  p_signed       boolean,
  p_do_file_path text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order   orders;
  v_actor   text;
  v_line    record;
  v_user_id uuid;
BEGIN
  v_user_id := (select auth.uid());

  IF NOT public.is_logistics() THEN
    RAISE EXCEPTION 'forbidden: logistics only' USING ERRCODE = '42501';
  END IF;

  IF p_signed IS NULL OR p_signed = false THEN
    RAISE EXCEPTION 'customer must sign DO'
      USING ERRCODE = 'P0001', DETAIL = 'do_required';
  END IF;

  IF p_do_number IS NULL OR length(btrim(p_do_number)) < 3 THEN
    RAISE EXCEPTION 'DO number must be at least 3 characters'
      USING ERRCODE = 'P0001', DETAIL = 'do_required';
  END IF;

  IF p_do_file_path IS NULL OR length(btrim(p_do_file_path)) = 0 THEN
    RAISE EXCEPTION 'DO file required'
      USING ERRCODE = 'P0001', DETAIL = 'do_file_required';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found'
      USING ERRCODE = '42P01', DETAIL = 'order_not_found';
  END IF;

  IF v_order.logistics_stage IS DISTINCT FROM 'dispatched'
     OR v_order.status <> 'proceed_order' THEN
    RAISE EXCEPTION 'order is not in dispatched state'
      USING ERRCODE = '22023', DETAIL = 'wrong_stage';
  END IF;

  v_actor := coalesce((SELECT name FROM app_users WHERE id = v_user_id), 'Logistics');

  UPDATE orders
     SET status          = 'delivered',
         logistics_stage = 'delivered',
         do_number       = btrim(p_do_number),
         do_note         = nullif(btrim(coalesce(p_do_note, '')), ''),
         do_file_path    = btrim(p_do_file_path),
         do_uploaded_at  = now(),
         do_uploaded_by  = v_user_id,
         delivered_at    = now(),
         updated_at      = now()
   WHERE id = p_order_id;

  -- Pipeline v2: release reserve FIRST, then decrement qty. The helper
  -- clamps via GREATEST(0, ...) so legacy reserve-zero rows don't fail.
  PERFORM public._logistics_release_order_reserve(p_order_id);

  FOR v_line IN
    SELECT sku, qty FROM order_lines WHERE order_id = p_order_id
  LOOP
    UPDATE stock_balances
       SET qty        = qty - v_line.qty,
           updated_at = now()
     WHERE sku = v_line.sku
       AND warehouse_id = v_order.warehouse_id;

    INSERT INTO stock_movements
      (sku, warehouse_id, qty, kind, ref, by_role, by_user_id)
    VALUES
      (v_line.sku, v_order.warehouse_id, -v_line.qty, 'out',
       'DL-' || v_order.dl::text, 'logistics', v_user_id);
  END LOOP;

  INSERT INTO order_history (order_id, text, by_role)
  VALUES (
    p_order_id,
    format('Delivered · DO %s · file %s', btrim(p_do_number), btrim(p_do_file_path)),
    'logistics'
  );

  INSERT INTO audit_log (role, actor_text, action, dealer_id, ref)
  VALUES ('logistics', v_actor,
          format('Delivered DL-%s · DO %s', v_order.dl, btrim(p_do_number)),
          v_order.dealer_id, 'DL-' || v_order.dl::text);

  RETURN jsonb_build_object(
    'id',              v_order.id,
    'dl',              v_order.dl,
    'status',          'delivered',
    'logistics_stage', 'delivered',
    'do_number',       btrim(p_do_number),
    'do_file_path',    btrim(p_do_file_path),
    'delivered_at',    now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.logistics_attach_do_and_deliver(uuid, text, text, boolean, text) FROM public;
GRANT EXECUTE ON FUNCTION public.logistics_attach_do_and_deliver(uuid, text, text, boolean, text) TO authenticated;
