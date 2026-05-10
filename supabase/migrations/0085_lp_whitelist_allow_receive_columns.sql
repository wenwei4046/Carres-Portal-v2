-- =============================================================================
-- 0085_lp_whitelist_allow_receive_columns.sql (Loo 2026-05-11)
-- =============================================================================
-- Same shape as 0081 — relax the partner-LP UPDATE whitelist so the new
-- partner-callable receive flow (POST /api/partner/pickups/:id/receive →
-- logistics_receive_po_with_do RPC) can complete its UPDATE on
-- purchase_orders. The RPC is SECURITY DEFINER, but row triggers still fire
-- with the caller's session role intact, so the LP whitelist sees 'partner'
-- and rejects writes to the receive columns.
--
-- Columns moved off the blocklist:
--   • status            — full-receive flips 'open' → 'received'
--   • do_file_path      — DO file path saved on every receive (full + partial)
--   • do_uploaded_at    — DO timestamp
--   • do_uploaded_by    — auth.uid() of the partner driver
--
-- Risk posture (mirrors 0081's Loo-signed-off acceptance):
--   1. Partner can now raw-UPDATE these columns from outside the RPC. Worst
--      case: partner crafts `UPDATE purchase_orders SET status='received'`
--      directly → PO appears closed, but stock_balances + threads stay
--      un-touched (the side effects live inside the RPC body). Inventory
--      drift surfaces in audit (no stock_movements row backing the
--      received status).
--   2. The remaining blocklist still protects:
--      id, dl, supplier_id, warehouse_id, procurement_partner_id,
--      expected_ready_date, eta_date, pay_status, ready_confirm_at, and
--      the outsource_* fields.
-- =============================================================================


CREATE OR REPLACE FUNCTION public.enforce_partner_po_column_whitelist()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF (select public.app_role()) IS DISTINCT FROM 'partner' THEN
    RETURN NEW;
  END IF;

  -- LP-mutable columns (whitelist):
  --   partner_accepted_at, partner_rejected_at      — RFD legacy
  --   customer_rejection                            — Sofa reject path
  --   sup_status, partner_confirmed_at, pickup_date — 0080/0081 pickup state
  --   updated_at                                    — benign timestamp
  --   status, do_file_path, do_uploaded_at,
  --   do_uploaded_by                                — 0085 partner-side receive
  -- Anything else triggers the rejection.
  IF (NEW.id                       IS DISTINCT FROM OLD.id)                       OR
     (NEW.dl                       IS DISTINCT FROM OLD.dl)                       OR
     (NEW.supplier_id              IS DISTINCT FROM OLD.supplier_id)              OR
     (NEW.warehouse_id             IS DISTINCT FROM OLD.warehouse_id)             OR
     (NEW.procurement_partner_id   IS DISTINCT FROM OLD.procurement_partner_id)   OR
     (NEW.expected_ready_date      IS DISTINCT FROM OLD.expected_ready_date)      OR
     (NEW.eta_date                 IS DISTINCT FROM OLD.eta_date)                 OR
     (NEW.pay_status               IS DISTINCT FROM OLD.pay_status)               OR
     (NEW.ready_confirm_at         IS DISTINCT FROM OLD.ready_confirm_at)         OR
     (NEW.outsource_partner_name   IS DISTINCT FROM OLD.outsource_partner_name)   OR
     (NEW.outsource_partner_contact IS DISTINCT FROM OLD.outsource_partner_contact) OR
     (NEW.outsource_partner_zones  IS DISTINCT FROM OLD.outsource_partner_zones)
     -- 0081 dropped from blocklist: sup_status, partner_confirmed_at, pickup_date, updated_at
     -- 0085 dropped from blocklist: status, do_file_path, do_uploaded_at, do_uploaded_by
  THEN
    RAISE EXCEPTION 'LP can only update procurement-leg state via partner_accept_pickup / partner_mark_picked_up / partner-side receive RPCs (or the legacy RFD accept/reject fields)'
      USING ERRCODE = '42501', DETAIL = 'lp_column_whitelist_violation';
  END IF;

  RETURN NEW;
END;
$$;
