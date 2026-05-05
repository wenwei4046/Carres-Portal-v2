-- =============================================================================
-- 0046_partner_role_rls.sql — Phase 4.5 Chunk 1
-- =============================================================================
-- Source spec: docs/superpowers/specs/2026-05-05-phase-4.5-chunk-1-design.md §6.6 (v3)
-- Sprint: 1 (schema)
--
-- v3 net policies (after Codex dedup F8):
--   - partner_sees_own_stock_movements (NEW; via stock_movements.ref text-match — F5)
--   - partner_updates_rfd_fields (NEW; RESTRICTIVE row guard — F4 fixed: public.* helpers)
--   - enforce_partner_po_column_whitelist BEFORE UPDATE trigger (NEW; VOLATILE per F7)
--
-- NOT included (already exist):
--   - partner_sees_own_threads → 0033:96 ost_partner_read (Codex F8)
--   - partner_sees_own_po → 0031:46 (v2 dedup)
--
-- All helper calls use `(select public.fn())` InitPlan-friendly form per CLAUDE.md §8 Fix 2.
-- =============================================================================

-- 1. Stock movements: LP sees only movements tied to their POs.
--    NOTE: stock_movements has `ref text` column, NOT `po_id` (Codex F5).
--    Both purchase_orders.id and stock_movements.ref are text-typed.
DROP POLICY IF EXISTS partner_sees_own_stock_movements ON stock_movements;
CREATE POLICY partner_sees_own_stock_movements ON stock_movements FOR SELECT
TO authenticated
USING (
  (select public.app_role()) = 'partner'
  AND EXISTS (
    SELECT 1 FROM purchase_orders po
    WHERE po.id = stock_movements.ref
      AND po.delivery_partner_id = (select public.app_partner_id())
  )
);

-- 2. RESTRICTIVE field-level guard: TIGHTENS 0002:249 po_scoped_update for partner.
--    PG 15+ RESTRICTIVE policy AND-stacks with PERMISSIVE (both must pass).
--    Row-level state guard: LP can only directly UPDATE PO during the RFD-pending
--    phase (sup_status = 'pickup_assigned'). Sofa pre-flight states
--    (ready_confirm_sent / at_warehouse_waiting) are reached via SECURITY DEFINER
--    RPCs that bypass RLS — the policy intentionally does NOT cover them.
--    Column-level enforcement via trigger below.
DROP POLICY IF EXISTS partner_updates_rfd_fields ON purchase_orders;
CREATE POLICY partner_updates_rfd_fields ON purchase_orders
AS RESTRICTIVE FOR UPDATE
TO authenticated
USING (
  (select public.app_role()) <> 'partner'
  OR (
    delivery_partner_id = (select public.app_partner_id())
    AND sup_status = 'pickup_assigned'
  )
)
WITH CHECK (
  (select public.app_role()) <> 'partner'
  OR delivery_partner_id = (select public.app_partner_id())
);

-- 3. Column whitelist enforcement (BEFORE UPDATE trigger — VOLATILE per Codex F7).
--    NOTE: purchase_orders has `dl` (link to orders.dl), NOT `order_id` (Codex F6).
--    LP whitelist (3 columns):
--      partner_accepted_at, partner_rejected_at, confirm_delivery_date
--    Plus customer_rejection jsonb (RFD reject path stamps it).
--    NOTE: sku/qty intentionally NOT in this list — they live on
--    purchase_order_lines, not purchase_orders (would NPE at runtime if listed).
CREATE OR REPLACE FUNCTION public.enforce_partner_po_column_whitelist()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  -- Only enforce for LP role; internal roles bypass.
  IF (select public.app_role()) <> 'partner' THEN
    RETURN NEW;
  END IF;

  -- Reject any change to non-whitelisted column.
  IF (NEW.id                       IS DISTINCT FROM OLD.id)                       OR
     (NEW.dl                       IS DISTINCT FROM OLD.dl)                       OR
     (NEW.supplier_id              IS DISTINCT FROM OLD.supplier_id)              OR
     (NEW.warehouse_id             IS DISTINCT FROM OLD.warehouse_id)             OR
     (NEW.status                   IS DISTINCT FROM OLD.status)                   OR
     (NEW.sup_status               IS DISTINCT FROM OLD.sup_status)               OR
     (NEW.delivery_partner_id      IS DISTINCT FROM OLD.delivery_partner_id)      OR
     (NEW.expected_ready_date      IS DISTINCT FROM OLD.expected_ready_date)      OR
     (NEW.pickup_date              IS DISTINCT FROM OLD.pickup_date)              OR
     (NEW.eta_date                 IS DISTINCT FROM OLD.eta_date)                 OR
     (NEW.pay_status               IS DISTINCT FROM OLD.pay_status)               OR
     (NEW.ready_confirm_at         IS DISTINCT FROM OLD.ready_confirm_at)         OR
     (NEW.partner_confirmed_at     IS DISTINCT FROM OLD.partner_confirmed_at)     OR
     (NEW.do_file_path             IS DISTINCT FROM OLD.do_file_path)             OR
     (NEW.do_uploaded_at           IS DISTINCT FROM OLD.do_uploaded_at)           OR
     (NEW.do_uploaded_by           IS DISTINCT FROM OLD.do_uploaded_by)           OR
     (NEW.outsource_partner_name   IS DISTINCT FROM OLD.outsource_partner_name)   OR
     (NEW.outsource_partner_contact IS DISTINCT FROM OLD.outsource_partner_contact) OR
     (NEW.outsource_partner_zones  IS DISTINCT FROM OLD.outsource_partner_zones)  OR
     (NEW.request_for_delivery_at  IS DISTINCT FROM OLD.request_for_delivery_at)
  THEN
    RAISE EXCEPTION 'LP can only update partner_accepted_at, partner_rejected_at, confirm_delivery_date, customer_rejection (RFD reject)'
      USING ERRCODE = '42501', DETAIL = 'lp_column_whitelist_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS partner_po_update_whitelist_trg ON purchase_orders;
CREATE TRIGGER partner_po_update_whitelist_trg
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_partner_po_column_whitelist();
