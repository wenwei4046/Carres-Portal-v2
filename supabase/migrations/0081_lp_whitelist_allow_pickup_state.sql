-- =============================================================================
-- 0081_lp_whitelist_allow_pickup_state.sql (Loo 2026-05-10)
-- =============================================================================
-- Migration 0080 added partner-callable RPCs (`partner_accept_pickup`,
-- `partner_mark_picked_up`) for the procurement-leg state machine, but the
-- LP column-whitelist trigger from 0046/0067/0068 still BLOCKS those
-- writes — when the SECURITY DEFINER RPC's UPDATE fires, the trigger sees
-- the partner role on the JWT and rejects:
--
--   "LP can only update partner_accepted_at, partner_rejected_at,
--    customer_rejection (RFD reject)"
--
-- This migration removes three columns from the blocklist that the new
-- RPCs legitimately update:
--   • sup_status            — pickup_accepted, picked_up
--   • partner_confirmed_at  — set on accept
--   • pickup_date           — set on mark-picked-up
--   • updated_at            — always benign, was implicitly blocked
--
-- Safety posture: the partner can NOW also bypass the trigger via a raw
-- table UPDATE on these columns (not just via the RPCs). Acceptable
-- because:
--   1. The RPC + RLS path remains the canonical way; UI never issues raw
--      UPDATEs.
--   2. If a partner ever crafts a malicious raw UPDATE, the impact is
--      limited to advancing their own POs through the procurement state
--      machine — which has no money / customer / dealer side effects.
--      All real money mutations (pay_status, dl, supplier_id) stay
--      blocked.
--
-- The remaining whitelist still blocks LP from reassigning POs to other
-- partners, swapping warehouses, changing pricing fields, etc.
-- =============================================================================


CREATE OR REPLACE FUNCTION public.enforce_partner_po_column_whitelist()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF (select public.app_role()) IS DISTINCT FROM 'partner' THEN
    RETURN NEW;
  END IF;

  -- LP-mutable columns (whitelist):
  --   partner_accepted_at  — RFD accept (legacy; column may be dropped per memory)
  --   partner_rejected_at  — RFD reject (legacy)
  --   customer_rejection   — Sofa reject path
  --   sup_status           — 0080 procurement-leg state progression
  --   partner_confirmed_at — 0080 set on partner_accept_pickup
  --   pickup_date          — 0080 set on partner_mark_picked_up
  --   updated_at           — benign timestamp; touched by every UPDATE
  -- Anything else triggers the rejection.
  IF (NEW.id                       IS DISTINCT FROM OLD.id)                       OR
     (NEW.dl                       IS DISTINCT FROM OLD.dl)                       OR
     (NEW.supplier_id              IS DISTINCT FROM OLD.supplier_id)              OR
     (NEW.warehouse_id             IS DISTINCT FROM OLD.warehouse_id)             OR
     (NEW.status                   IS DISTINCT FROM OLD.status)                   OR
     (NEW.procurement_partner_id   IS DISTINCT FROM OLD.procurement_partner_id)   OR
     (NEW.expected_ready_date      IS DISTINCT FROM OLD.expected_ready_date)      OR
     (NEW.eta_date                 IS DISTINCT FROM OLD.eta_date)                 OR
     (NEW.pay_status               IS DISTINCT FROM OLD.pay_status)               OR
     (NEW.ready_confirm_at         IS DISTINCT FROM OLD.ready_confirm_at)         OR
     (NEW.do_file_path             IS DISTINCT FROM OLD.do_file_path)             OR
     (NEW.do_uploaded_at           IS DISTINCT FROM OLD.do_uploaded_at)           OR
     (NEW.do_uploaded_by           IS DISTINCT FROM OLD.do_uploaded_by)           OR
     (NEW.outsource_partner_name   IS DISTINCT FROM OLD.outsource_partner_name)   OR
     (NEW.outsource_partner_contact IS DISTINCT FROM OLD.outsource_partner_contact) OR
     (NEW.outsource_partner_zones  IS DISTINCT FROM OLD.outsource_partner_zones)
     -- 0081: removed from blocklist (RPC-validated procurement-leg progression):
     --   sup_status, partner_confirmed_at, pickup_date, updated_at
  THEN
    RAISE EXCEPTION 'LP can only update procurement-leg state via partner_accept_pickup / partner_mark_picked_up RPCs (or the legacy RFD accept/reject fields)'
      USING ERRCODE = '42501', DETAIL = 'lp_column_whitelist_violation';
  END IF;

  RETURN NEW;
END;
$$;
