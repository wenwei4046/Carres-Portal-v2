-- =============================================================================
-- 0068_lp_whitelist_trigger_drop_stale_cols.sql — Phase 7 prep
-- =============================================================================
-- Bug #5 from 2026-05-09 E2E session: the LP column-whitelist trigger function
-- (originally migration 0046, NULL-safe in 0067) still references TWO columns
-- that were DROPPED in migration 0052:
--   • `delivery_partner_id` — renamed to `procurement_partner_id` in 0052:52
--   • `request_for_delivery_at` — moved to `order_supplier_threads` in 0049
--
-- A partner-role UPDATE on `purchase_orders` would fire this trigger and then
-- error at runtime trying to access NEW.delivery_partner_id which doesn't
-- exist on the row. Currently silent because partner-role direct UPDATEs are
-- rare (most paths go through SECURITY DEFINER RPCs which inherit the
-- caller's role context — the trigger DOES still fire).
--
-- This migration:
--   • Drops both stale column refs from the blocklist
--   • Adds `procurement_partner_id` (the new column for the same intent —
--     prevent LP from reassigning their PO to a different partner)
--   • Keeps the NULL-safe early return from 0067
--
-- Authorized 2026-05-09 in conversation per CLAUDE.md §7.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_partner_po_column_whitelist()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  -- Only enforce for LP role; internal roles + service_role bypass.
  -- IS DISTINCT FROM is NULL-safe (kept from 0067).
  IF (select public.app_role()) IS DISTINCT FROM 'partner' THEN
    RETURN NEW;
  END IF;

  -- Reject any change to non-whitelisted column. Whitelist (unchanged from
  -- the original 0046 spirit): partner_accepted_at, partner_rejected_at,
  -- confirm_delivery_date — wait, those last two are also on threads now.
  -- The only LP-mutable PO columns left are partner_accepted_at +
  -- partner_rejected_at (Phase 4.5 Chunk 1 RFD flow on PO) AND
  -- customer_rejection (Sofa reject path on PO). Everything else is
  -- blocked.
  IF (NEW.id                       IS DISTINCT FROM OLD.id)                       OR
     (NEW.dl                       IS DISTINCT FROM OLD.dl)                       OR
     (NEW.supplier_id              IS DISTINCT FROM OLD.supplier_id)              OR
     (NEW.warehouse_id             IS DISTINCT FROM OLD.warehouse_id)             OR
     (NEW.status                   IS DISTINCT FROM OLD.status)                   OR
     (NEW.sup_status               IS DISTINCT FROM OLD.sup_status)               OR
     (NEW.procurement_partner_id   IS DISTINCT FROM OLD.procurement_partner_id)   OR
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
     (NEW.outsource_partner_zones  IS DISTINCT FROM OLD.outsource_partner_zones)
     -- Removed (columns dropped in 0052):
     --   delivery_partner_id    → renamed to procurement_partner_id (added above)
     --   request_for_delivery_at → moved to order_supplier_threads
  THEN
    RAISE EXCEPTION 'LP can only update partner_accepted_at, partner_rejected_at, customer_rejection (RFD reject)'
      USING ERRCODE = '42501', DETAIL = 'lp_column_whitelist_violation';
  END IF;

  RETURN NEW;
END;
$$;
