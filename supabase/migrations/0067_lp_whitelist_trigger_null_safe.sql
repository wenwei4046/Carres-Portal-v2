-- =============================================================================
-- 0067_lp_whitelist_trigger_null_safe.sql — Phase 7 prep
-- =============================================================================
-- Bug fix: enforce_partner_po_column_whitelist (migration 0046) early-return
-- guard `app_role() <> 'partner'` evaluates to NULL (not TRUE) when called
-- from a service_role connection where auth.uid() is null. Three-valued logic
-- means `IF NULL THEN` falls through to the column whitelist check, raising
-- `lp_column_whitelist_violation` on legitimate admin / cron / batch UPDATEs.
--
-- Surfaced 2026-05-09 by `pnpm reset:e2e-state` script (uses service_role to
-- reset HoOKkA POs to pending). Production impact: any cron / backup / batch
-- script touching purchase_orders would hit the same wall.
--
-- Fix: use IS DISTINCT FROM (NULL-safe) for the early-return check. Service-
-- role / anonymous (no auth.uid) → app_role() returns null → IS DISTINCT FROM
-- 'partner' is TRUE → trigger returns NEW (allows the update).
--
-- Authorized 2026-05-09 in conversation per CLAUDE.md §7.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_partner_po_column_whitelist()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  -- Only enforce for LP role; internal roles + service_role bypass.
  -- IS DISTINCT FROM is NULL-safe: returns TRUE when app_role() is NULL
  -- (service_role / anonymous), so the trigger correctly bypasses for them
  -- instead of falling through to the whitelist check (which is what the
  -- 0046 `<>` form did due to three-valued SQL logic).
  IF (select public.app_role()) IS DISTINCT FROM 'partner' THEN
    RETURN NEW;
  END IF;

  -- Reject any change to non-whitelisted column. (Whitelist unchanged from 0046:
  -- LP can update partner_accepted_at, partner_rejected_at, confirm_delivery_date,
  -- customer_rejection only.)
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
