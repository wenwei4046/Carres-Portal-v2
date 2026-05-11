-- =============================================================================
-- 0094_supplier_mark_delivered_require_do_file.sql (Loo 2026-05-11)
-- =============================================================================
-- Close phase-6-storage-do-upload carry-forward. Two related changes:
--
--   1. supplier_mark_delivered RPC widens to require p_do_file_path TEXT. The
--      column already exists on purchase_orders (added pre-0034 for the
--      logistics_receive_po_with_do flow, whitelisted on partner-write by
--      0085). DROP + recreate the function to change the signature in place,
--      same pattern as 0087 logistics_attach_do_and_deliver and 0088
--      partner_attach_pod. New arg order:
--          p_po_id (required)
--          p_do_number (required)
--          p_do_file_path (required) ← NEW
--          p_do_note (optional)
--      Validation matches the logistics + partner siblings: btrim != ''
--      raises errcode 22023 detail=do_file_path_required.
--
--   2. delivery-orders Storage bucket read+write policies admit supplier
--      scoped on `purchase_orders.supplier_id = app_supplier_id()`. Same
--      EXISTS+split_part pattern as the existing partner branch (0084).
--      InitPlan-wrapped per CLAUDE.md §8 RLS performance fix #2.
--
-- Authorized in conversation 2026-05-11 per CLAUDE.md §7. No new columns.
-- Backward-compat note: any caller still passing 3-arg (po_id, do_number,
-- do_note) gets a 22023 missing_do_file_path at validation. The only callers
-- today are the supplier UI which is updated in the same PR.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. supplier_mark_delivered — drop legacy 3-arg, recreate with required file.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.supplier_mark_delivered(text, text, text);

CREATE OR REPLACE FUNCTION public.supplier_mark_delivered(
  p_po_id        text,
  p_do_number    text,
  p_do_file_path text,
  p_do_note      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_po          purchase_orders;
  v_role        app_role;
  v_supplier_id uuid;
  v_uid         uuid;
  v_actor       text;
BEGIN
  v_role        := public.app_role();
  v_supplier_id := public.app_supplier_id();
  v_uid         := (select auth.uid());

  IF v_role <> 'supplier' THEN
    RAISE EXCEPTION 'forbidden: supplier role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  IF p_do_number IS NULL OR btrim(p_do_number) = '' THEN
    RAISE EXCEPTION 'DO number is required'
      USING ERRCODE = '22023', DETAIL = 'missing_do_number';
  END IF;

  IF p_do_file_path IS NULL OR btrim(p_do_file_path) = '' THEN
    RAISE EXCEPTION 'DO file is required'
      USING ERRCODE = '22023', DETAIL = 'do_file_path_required';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found'
      USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;

  IF v_supplier_id IS NULL OR v_po.supplier_id IS DISTINCT FROM v_supplier_id THEN
    RAISE EXCEPTION 'forbidden: cross-supplier mark-delivered'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  -- Valid sources: pickup_accepted (own_logistics + factory_pickup pickup
  -- flow), shipped (own_logistics direct ship variant), partner_confirmed
  -- (0090 sofa flow — partner_owned WH accepted the supplier-delivered goods).
  IF v_po.sup_status NOT IN ('pickup_accepted', 'shipped', 'partner_confirmed') THEN
    RAISE EXCEPTION 'PO not in pickup_accepted/shipped/partner_confirmed state (got %)', v_po.sup_status
      USING ERRCODE = '22023', DETAIL = 'wrong_sup_status';
  END IF;

  v_actor := coalesce((SELECT name FROM app_users WHERE id = v_uid), 'Supplier');

  UPDATE purchase_orders
     SET sup_status     = 'delivered',
         do_number      = btrim(p_do_number),
         do_file_path   = btrim(p_do_file_path),
         do_uploaded_at = now(),
         do_uploaded_by = v_uid,
         updated_at     = now()
   WHERE id = p_po_id;

  INSERT INTO po_history (po_id, text, by_role, by_user_id)
  VALUES (
    p_po_id,
    format('DO uploaded · %s%s · file %s',
           btrim(p_do_number),
           CASE WHEN p_do_note IS NOT NULL AND btrim(p_do_note) <> ''
                THEN ' · ' || btrim(p_do_note)
                ELSE '' END,
           btrim(p_do_file_path)),
    'supplier',
    v_uid
  );

  INSERT INTO audit_log (role, actor_text, action, ref)
  VALUES (
    'supplier',
    v_actor,
    format('Marked PO %s delivered (DO %s)', p_po_id, btrim(p_do_number)),
    p_po_id
  );

  RETURN jsonb_build_object(
    'po_id',        p_po_id,
    'sup_status',   'delivered',
    'do_number',    btrim(p_do_number),
    'do_file_path', btrim(p_do_file_path)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.supplier_mark_delivered(text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.supplier_mark_delivered(text, text, text, text) TO authenticated;


-- -----------------------------------------------------------------------------
-- 2. delivery-orders bucket — admit supplier on read + write.
-- -----------------------------------------------------------------------------
-- Same EXISTS pattern as the partner branch added in 0084. Scope: supplier
-- can read/write a DO file only when the path's first segment matches a PO
-- whose supplier_id equals the caller's JWT app_supplier_id() claim.
-- InitPlan-wrapped per CLAUDE.md §8 fix #2.

DROP POLICY IF EXISTS "delivery_orders_read" ON storage.objects;
CREATE POLICY "delivery_orders_read" ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'delivery-orders' AND (
    (select public.app_role()) IN ('logistics', 'principal')
    OR (
      (select public.app_role()) = 'partner'
      AND EXISTS (
        SELECT 1 FROM purchase_orders po
        WHERE po.id = split_part(name, '/', 1)
          AND po.procurement_partner_id = (select public.app_partner_id())
      )
    )
    OR (
      (select public.app_role()) = 'supplier'
      AND EXISTS (
        SELECT 1 FROM purchase_orders po
        WHERE po.id = split_part(name, '/', 1)
          AND po.supplier_id = (select public.app_supplier_id())
      )
    )
  )
);

DROP POLICY IF EXISTS "delivery_orders_write" ON storage.objects;
CREATE POLICY "delivery_orders_write" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'delivery-orders' AND (
    (select public.app_role()) IN ('logistics', 'principal')
    OR (
      (select public.app_role()) = 'partner'
      AND EXISTS (
        SELECT 1 FROM purchase_orders po
        WHERE po.id = split_part(name, '/', 1)
          AND po.procurement_partner_id = (select public.app_partner_id())
      )
    )
    OR (
      (select public.app_role()) = 'supplier'
      AND EXISTS (
        SELECT 1 FROM purchase_orders po
        WHERE po.id = split_part(name, '/', 1)
          AND po.supplier_id = (select public.app_supplier_id())
      )
    )
  )
);
