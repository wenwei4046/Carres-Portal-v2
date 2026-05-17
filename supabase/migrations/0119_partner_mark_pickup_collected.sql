-- 0119_partner_mark_pickup_collected.sql
-- 2026-05-17 (Loo screenshot) — Pickup Selected used to collapse two distinct
-- partner steps into one: it created the pickup_event AND marked the goods as
-- physically in-transit. The proto (reference/proto/partner-pickups.jsx lines
-- 10-11) has 3 partner phases: SCHEDULED (pickup booked) → IN TRANSIT (goods
-- loaded, driving) → DELIVERED (at warehouse). The legacy non-thread flow
-- preserved these via sup_status transitions pickup_accepted → picked_up →
-- delivered.
--
-- Per-thread flow needs the same split. We add a `departed_at` column on
-- po_pickup_events:
--   - departed_at IS NULL  → event is "booked, awaiting partner physical
--                            departure" → drives PO into SCHEDULED column
--   - departed_at IS NOT   → event is "loaded + driving to WH" → drives PO
--     NULL                   into IN TRANSIT column
--
-- A new RPC `partner_mark_pickup_collected(event_id)` stamps the column to
-- NOW(). Existing `picked_up_at` keeps its meaning as "when the DO event row
-- was created" (= when partner pressed Pickup Selected). No backfill needed
-- because pre-existing pickup events were all from Loo's manual testing today;
-- they retain departed_at = NULL, which simply puts those POs in SCHEDULED.
-- Loo can flip them with the new Mark Collected button.

ALTER TABLE po_pickup_events
  ADD COLUMN IF NOT EXISTS departed_at timestamptz;

-- RPC: partner stamps an event as "physically departed from supplier dock".
-- Scoped to the procurement-leg partner via purchase_orders.procurement_partner_id
-- (mirrors partner_pickup_threads gate from 0107).
CREATE OR REPLACE FUNCTION public.partner_mark_pickup_collected(
  p_event_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_event      po_pickup_events;
  v_po         purchase_orders;
  v_partner_id uuid;
  v_actor_uid  uuid;
BEGIN
  v_partner_id := public.app_partner_id();
  v_actor_uid  := (SELECT auth.uid());

  IF public.app_role() <> 'partner' THEN
    RAISE EXCEPTION 'forbidden: partner role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: partner_id missing on JWT'
      USING ERRCODE = '42501', DETAIL = 'no_partner_id';
  END IF;

  SELECT * INTO v_event FROM po_pickup_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pickup event not found'
      USING ERRCODE = '42P01', DETAIL = 'event_not_found';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = v_event.po_id;
  IF v_po.procurement_partner_id IS DISTINCT FROM v_partner_id THEN
    RAISE EXCEPTION 'forbidden: PO not assigned to this partner'
      USING ERRCODE = '42501', DETAIL = 'cross_tenant';
  END IF;

  IF v_event.departed_at IS NOT NULL THEN
    RAISE EXCEPTION 'pickup event already marked collected at %', v_event.departed_at
      USING ERRCODE = '22023', DETAIL = 'already_collected';
  END IF;

  UPDATE po_pickup_events
     SET departed_at = now()
   WHERE id = p_event_id;

  INSERT INTO po_history (po_id, text, by_role, by_user_id)
  VALUES (v_event.po_id,
          format('Partner marked collected · DO %s · in transit to WH',
                 v_event.do_number),
          'partner', v_actor_uid);

  RETURN jsonb_build_object(
    'event_id', p_event_id,
    'departed_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.partner_mark_pickup_collected(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.partner_mark_pickup_collected(uuid) TO authenticated;
