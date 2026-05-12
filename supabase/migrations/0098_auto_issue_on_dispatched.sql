-- =============================================================================
-- 0098_auto_issue_on_dispatched.sql (Loo 2026-05-13)
-- =============================================================================
-- Loo's spec 2026-05-13: when an order transitions to logistics_stage =
-- 'dispatched', the system should automatically:
--   1. Issue a Sales Invoice (set orders.invoice_no + invoices row, tax=0)
--   2. Assign a Carres-side DO number (orders.do_number) so the Logistics
--      drawer + Partner Delivery tab can render the customer-facing DO PDF
--      (the doc the LP prints, takes with the delivery, and the customer
--      signs).
--
-- Both are idempotent — already-set fields are preserved. Both are auto so
-- no manual Finance/Logistics click is required at dispatch time.
--
-- Implementation: AFTER UPDATE trigger on orders that fires only on
-- logistics_stage transition INTO 'dispatched' (OLD distinct from NEW).
--
-- Amount: sum of order_lines.qty * unit_price + order_addons.qty *
-- unit_price. Tax: 0 (V1 — no SST until Loo wires it). Currency: MYR
-- (project default).
--
-- do_number pattern: 'DO-' + zero-padded 6-digit dl. Same shape as SO-
-- prefix used for sales orders in DownloadSalesOrderButton (dl padded to
-- 6 digits).
--
-- Authorized in conversation 2026-05-13 per CLAUDE.md §7.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.orders_auto_issue_on_dispatched()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_amount     numeric(12,2);
  v_invoice_no text;
  v_actor_uid  uuid;
BEGIN
  -- Only fire on the transition INTO 'dispatched'.
  IF NEW.logistics_stage IS NOT DISTINCT FROM OLD.logistics_stage THEN
    RETURN NEW;
  END IF;
  IF NEW.logistics_stage IS DISTINCT FROM 'dispatched' THEN
    RETURN NEW;
  END IF;

  v_actor_uid := (SELECT auth.uid());

  -- 1. Auto-assign Carres DO number if not already set.
  IF NEW.do_number IS NULL THEN
    NEW.do_number := 'DO-' || lpad(NEW.dl::text, 6, '0');
  END IF;

  -- 2. Auto-issue Sales Invoice if not already issued.
  IF NEW.invoice_no IS NULL THEN
    SELECT
      coalesce(sum(ol.qty * ol.unit_price), 0) +
      coalesce((select sum(oa.qty * oa.unit_price) from order_addons oa where oa.order_id = NEW.id), 0)
    INTO v_amount
    FROM order_lines ol
    WHERE ol.order_id = NEW.id;

    v_invoice_no := 'INV-' || to_char(now(),'YYYY') || '-' || lpad(NEW.dl::text, 6, '0');

    INSERT INTO invoices (invoice_no, order_id, amount, tax_amount, issued_at)
    VALUES (v_invoice_no, NEW.id, v_amount, 0, current_date)
    ON CONFLICT (invoice_no) DO NOTHING;

    NEW.invoice_no  := v_invoice_no;
    NEW.invoiced_at := current_date;

    INSERT INTO order_history (order_id, text, by_role, by_user_id)
    VALUES (
      NEW.id,
      format('Sales Invoice auto-issued on dispatch · %s (RM %s)', v_invoice_no, v_amount),
      'logistics',
      v_actor_uid
    );

    INSERT INTO audit_log (role, actor_text, action, ref)
    VALUES (
      'logistics',
      coalesce((SELECT name FROM app_users WHERE id = v_actor_uid), 'System'),
      format('Auto-issued invoice %s on dispatch of order #%s (RM %s)',
             v_invoice_no, NEW.dl, v_amount),
      NEW.id::text
    );
  END IF;

  -- DO# history (independent of invoice — may be set without invoice if
  -- invoice was already issued earlier).
  IF NEW.do_number IS DISTINCT FROM OLD.do_number THEN
    INSERT INTO order_history (order_id, text, by_role, by_user_id)
    VALUES (
      NEW.id,
      format('Carres DO number assigned on dispatch · %s', NEW.do_number),
      'logistics',
      v_actor_uid
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_auto_issue_on_dispatched_trg ON orders;
CREATE TRIGGER orders_auto_issue_on_dispatched_trg
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION public.orders_auto_issue_on_dispatched();
