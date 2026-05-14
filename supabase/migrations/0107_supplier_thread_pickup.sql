-- =============================================================================
-- 0107_supplier_thread_pickup.sql (Loo 2026-05-15)
-- =============================================================================
-- Per-thread readiness + multi-DO partial pickup. Spec:
--   docs/superpowers/specs/2026-05-15-supplier-thread-pickup-design.md
--
-- 1. Adds enum value 'partially_shipped' to po_sup_status.
-- 2. New table po_pickup_events (1 row = 1 physical DO paper = 1 trip).
-- 3. order_supplier_threads gets supplier_ready_at/by + pickup_event_id.
-- 4. RPCs: supplier_mark_thread_ready / supplier_unmark_thread_ready /
--    partner_pickup_threads / logistics_receive_threads / pickup_event_render_payload.
-- 5. RLS for po_pickup_events scoped per role.
-- 6. Backfill: any purchase_orders with do_number IS NOT NULL but no
--    po_pickup_events row gets one synthetic event + threads pointed at it.
--
-- LP whitelist intentionally skipped — the only LP whitelist trigger lives on
-- purchase_orders (function enforce_partner_po_column_whitelist) and its
-- deny-list does not include sup_status or updated_at, which are the only
-- columns these RPCs touch under partner role. There is no LP whitelist
-- trigger on order_supplier_threads.
--
-- Authorized in conversation 2026-05-15 per CLAUDE.md §7.
-- =============================================================================

-- 1. Enum value
ALTER TYPE po_sup_status ADD VALUE IF NOT EXISTS 'partially_shipped' BEFORE 'shipped';

-- 2. New table
CREATE TABLE IF NOT EXISTS po_pickup_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id         text NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  do_number     text NOT NULL,
  do_file_path  text,
  do_note       text,
  picked_up_at  timestamptz NOT NULL DEFAULT now(),
  picked_up_by  uuid REFERENCES app_users(id),
  ack_role      app_role NOT NULL CHECK (ack_role IN ('partner', 'logistics')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (po_id, do_number)
);
CREATE INDEX IF NOT EXISTS po_pickup_events_po_idx ON po_pickup_events(po_id);

-- 3. Thread additions
ALTER TABLE order_supplier_threads
  ADD COLUMN IF NOT EXISTS supplier_ready_at  timestamptz,
  ADD COLUMN IF NOT EXISTS supplier_ready_by  uuid REFERENCES app_users(id),
  ADD COLUMN IF NOT EXISTS pickup_event_id    uuid REFERENCES po_pickup_events(id);
CREATE INDEX IF NOT EXISTS ost_pickup_event_idx ON order_supplier_threads(pickup_event_id)
  WHERE pickup_event_id IS NOT NULL;

-- 4a. RPC: supplier marks a thread ready
CREATE OR REPLACE FUNCTION public.supplier_mark_thread_ready(p_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_thread       order_supplier_threads;
  v_po           purchase_orders;
  v_supplier_id  uuid;
  v_actor_uid    uuid;
  v_new_sup_status po_sup_status;
BEGIN
  v_supplier_id := public.app_supplier_id();
  v_actor_uid   := (SELECT auth.uid());

  IF public.app_role() <> 'supplier' THEN
    RAISE EXCEPTION 'forbidden: supplier role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: supplier_id missing on JWT'
      USING ERRCODE = '42501', DETAIL = 'no_supplier_id';
  END IF;

  SELECT * INTO v_thread FROM order_supplier_threads WHERE id = p_thread_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'thread not found' USING ERRCODE = '42P01', DETAIL = 'thread_not_found';
  END IF;
  IF v_thread.po_id IS NULL THEN
    RAISE EXCEPTION 'thread has no PO' USING ERRCODE = '22023', DETAIL = 'no_po';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = v_thread.po_id;
  IF v_po.supplier_id IS DISTINCT FROM v_supplier_id THEN
    RAISE EXCEPTION 'forbidden: not this supplier''s PO'
      USING ERRCODE = '42501', DETAIL = 'cross_tenant';
  END IF;

  IF v_po.sup_status NOT IN ('acknowledged', 'in_production', 'ready_for_pickup', 'partially_shipped') THEN
    RAISE EXCEPTION 'PO not in a state that accepts ready ticks (got %)', v_po.sup_status
      USING ERRCODE = '22023', DETAIL = 'wrong_po_state';
  END IF;

  IF v_thread.pickup_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'thread already picked up' USING ERRCODE = '22023', DETAIL = 'already_picked';
  END IF;

  IF v_thread.supplier_ready_at IS NOT NULL THEN
    -- idempotent: already ready, return current state
    RETURN jsonb_build_object('thread_id', p_thread_id, 'supplier_ready_at', v_thread.supplier_ready_at, 'noop', true);
  END IF;

  UPDATE order_supplier_threads
     SET supplier_ready_at = now(),
         supplier_ready_by = v_actor_uid,
         updated_at        = now()
   WHERE id = p_thread_id;

  IF v_po.sup_status IN ('acknowledged', 'in_production') THEN
    UPDATE purchase_orders SET sup_status = 'ready_for_pickup', updated_at = now()
      WHERE id = v_po.id;
    v_new_sup_status := 'ready_for_pickup';
  ELSE
    v_new_sup_status := v_po.sup_status;
  END IF;

  INSERT INTO po_history (po_id, text, by_role, by_user_id)
  VALUES (v_po.id,
          format('Thread %s marked ready by supplier', p_thread_id),
          'supplier', v_actor_uid);

  RETURN jsonb_build_object(
    'thread_id', p_thread_id,
    'supplier_ready_at', now(),
    'po_sup_status', v_new_sup_status
  );
END;
$$;
REVOKE ALL ON FUNCTION public.supplier_mark_thread_ready(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.supplier_mark_thread_ready(uuid) TO authenticated;

-- 4b. RPC: supplier unmarks (only before pickup)
CREATE OR REPLACE FUNCTION public.supplier_unmark_thread_ready(p_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_thread       order_supplier_threads;
  v_po           purchase_orders;
  v_supplier_id  uuid;
  v_actor_uid    uuid;
  v_any_other_ready boolean;
  v_new_sup_status po_sup_status;
BEGIN
  v_supplier_id := public.app_supplier_id();
  v_actor_uid   := (SELECT auth.uid());

  IF public.app_role() <> 'supplier' THEN
    RAISE EXCEPTION 'forbidden: supplier role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  SELECT * INTO v_thread FROM order_supplier_threads WHERE id = p_thread_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'thread not found' USING ERRCODE = '42P01', DETAIL = 'thread_not_found';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = v_thread.po_id;
  IF v_po.supplier_id IS DISTINCT FROM v_supplier_id THEN
    RAISE EXCEPTION 'forbidden: cross_tenant'
      USING ERRCODE = '42501', DETAIL = 'cross_tenant';
  END IF;

  IF v_thread.pickup_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'cannot unmark: thread already picked up'
      USING ERRCODE = '22023', DETAIL = 'already_picked';
  END IF;
  IF v_thread.supplier_ready_at IS NULL THEN
    RETURN jsonb_build_object('thread_id', p_thread_id, 'noop', true);
  END IF;

  UPDATE order_supplier_threads
     SET supplier_ready_at = NULL,
         supplier_ready_by = NULL,
         updated_at        = now()
   WHERE id = p_thread_id;

  SELECT EXISTS (
    SELECT 1 FROM order_supplier_threads
     WHERE po_id = v_po.id
       AND id <> p_thread_id
       AND supplier_ready_at IS NOT NULL
       AND pickup_event_id IS NULL
  ) INTO v_any_other_ready;

  IF NOT v_any_other_ready AND v_po.sup_status = 'ready_for_pickup' THEN
    UPDATE purchase_orders SET sup_status = 'in_production', updated_at = now()
      WHERE id = v_po.id;
    v_new_sup_status := 'in_production';
  ELSE
    v_new_sup_status := v_po.sup_status;
  END IF;

  INSERT INTO po_history (po_id, text, by_role, by_user_id)
  VALUES (v_po.id,
          format('Thread %s ready unmarked by supplier', p_thread_id),
          'supplier', v_actor_uid);

  RETURN jsonb_build_object('thread_id', p_thread_id, 'po_sup_status', v_new_sup_status);
END;
$$;
REVOKE ALL ON FUNCTION public.supplier_unmark_thread_ready(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.supplier_unmark_thread_ready(uuid) TO authenticated;

-- 4c. RPC: partner batch pickup
-- Note: procurement-leg partner lives on purchase_orders.procurement_partner_id
-- (renamed in 0052). The customer-leg partner is per-thread on
-- order_supplier_threads.delivery_partner_id — not what we want here.
CREATE OR REPLACE FUNCTION public.partner_pickup_threads(
  p_po_id        text,
  p_thread_ids   uuid[],
  p_do_number    text,
  p_do_file_path text,
  p_do_note      text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_po           purchase_orders;
  v_partner_id   uuid;
  v_actor_uid    uuid;
  v_event_id     uuid;
  v_thread_count int;
  v_remaining    int;
  v_new_sup_status po_sup_status;
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
  IF p_do_number IS NULL OR length(btrim(p_do_number)) < 3 THEN
    RAISE EXCEPTION 'DO number must be at least 3 characters'
      USING ERRCODE = 'P0001', DETAIL = 'do_required';
  END IF;
  IF p_do_file_path IS NULL OR btrim(p_do_file_path) = '' THEN
    RAISE EXCEPTION 'DO file path required'
      USING ERRCODE = '22023', DETAIL = 'do_file_required';
  END IF;
  IF array_length(p_thread_ids, 1) IS NULL OR array_length(p_thread_ids, 1) = 0 THEN
    RAISE EXCEPTION 'at least one thread required'
      USING ERRCODE = '22023', DETAIL = 'empty_threads';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found' USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;
  IF v_po.procurement_partner_id IS DISTINCT FROM v_partner_id THEN
    RAISE EXCEPTION 'forbidden: PO not assigned to this partner'
      USING ERRCODE = '42501', DETAIL = 'cross_tenant';
  END IF;

  -- Validate each thread: belongs to PO, supplier-ready, not yet picked
  SELECT count(*) INTO v_thread_count
    FROM order_supplier_threads
   WHERE id = ANY(p_thread_ids)
     AND po_id = p_po_id
     AND supplier_ready_at IS NOT NULL
     AND pickup_event_id IS NULL
   FOR UPDATE;
  IF v_thread_count <> array_length(p_thread_ids, 1) THEN
    RAISE EXCEPTION 'one or more threads ineligible (not ready / wrong PO / already picked)'
      USING ERRCODE = '22023', DETAIL = 'ineligible_thread';
  END IF;

  -- Create pickup event
  INSERT INTO po_pickup_events (po_id, do_number, do_file_path, do_note, picked_up_at, picked_up_by, ack_role)
  VALUES (p_po_id, btrim(p_do_number), btrim(p_do_file_path), nullif(btrim(coalesce(p_do_note, '')), ''),
          now(), v_actor_uid, 'partner')
  RETURNING id INTO v_event_id;

  -- Update threads
  UPDATE order_supplier_threads
     SET pickup_event_id = v_event_id,
         logistics_stage = 'dispatched',
         updated_at      = now()
   WHERE id = ANY(p_thread_ids);

  -- Recompute PO sup_status
  SELECT count(*) INTO v_remaining
    FROM order_supplier_threads
   WHERE po_id = p_po_id AND pickup_event_id IS NULL;

  IF v_remaining = 0 THEN
    v_new_sup_status := 'shipped';
  ELSE
    v_new_sup_status := 'partially_shipped';
  END IF;
  UPDATE purchase_orders SET sup_status = v_new_sup_status, updated_at = now()
    WHERE id = p_po_id;

  INSERT INTO po_history (po_id, text, by_role, by_user_id)
  VALUES (p_po_id,
          format('Partner picked up %s thread(s) · DO %s · sup_status → %s',
                 v_thread_count, btrim(p_do_number), v_new_sup_status),
          'partner', v_actor_uid);

  RETURN jsonb_build_object(
    'pickup_event_id', v_event_id,
    'thread_count', v_thread_count,
    'po_sup_status', v_new_sup_status
  );
END;
$$;
REVOKE ALL ON FUNCTION public.partner_pickup_threads(text, uuid[], text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.partner_pickup_threads(text, uuid[], text, text, text) TO authenticated;

-- 4d. RPC: logistics batch receive (own_logistics suppliers)
CREATE OR REPLACE FUNCTION public.logistics_receive_threads(
  p_po_id        text,
  p_thread_ids   uuid[],
  p_do_number    text,
  p_do_file_path text,
  p_do_note      text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_po           purchase_orders;
  v_actor_uid    uuid;
  v_event_id     uuid;
  v_thread_count int;
  v_remaining    int;
  v_new_sup_status po_sup_status;
BEGIN
  v_actor_uid  := (SELECT auth.uid());

  IF public.app_role() <> 'logistics' THEN
    RAISE EXCEPTION 'forbidden: logistics role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  IF p_do_number IS NULL OR length(btrim(p_do_number)) < 3 THEN
    RAISE EXCEPTION 'DO number must be at least 3 characters'
      USING ERRCODE = 'P0001', DETAIL = 'do_required';
  END IF;
  IF p_do_file_path IS NULL OR btrim(p_do_file_path) = '' THEN
    RAISE EXCEPTION 'DO file path required'
      USING ERRCODE = '22023', DETAIL = 'do_file_required';
  END IF;
  IF array_length(p_thread_ids, 1) IS NULL OR array_length(p_thread_ids, 1) = 0 THEN
    RAISE EXCEPTION 'at least one thread required'
      USING ERRCODE = '22023', DETAIL = 'empty_threads';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found' USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;

  SELECT count(*) INTO v_thread_count
    FROM order_supplier_threads
   WHERE id = ANY(p_thread_ids)
     AND po_id = p_po_id
     AND supplier_ready_at IS NOT NULL
     AND pickup_event_id IS NULL
   FOR UPDATE;
  IF v_thread_count <> array_length(p_thread_ids, 1) THEN
    RAISE EXCEPTION 'one or more threads ineligible'
      USING ERRCODE = '22023', DETAIL = 'ineligible_thread';
  END IF;

  INSERT INTO po_pickup_events (po_id, do_number, do_file_path, do_note, picked_up_at, picked_up_by, ack_role)
  VALUES (p_po_id, btrim(p_do_number), btrim(p_do_file_path), nullif(btrim(coalesce(p_do_note, '')), ''),
          now(), v_actor_uid, 'logistics')
  RETURNING id INTO v_event_id;

  UPDATE order_supplier_threads
     SET pickup_event_id = v_event_id,
         logistics_stage = 'received',
         updated_at      = now()
   WHERE id = ANY(p_thread_ids);

  SELECT count(*) INTO v_remaining
    FROM order_supplier_threads
   WHERE po_id = p_po_id AND pickup_event_id IS NULL;

  IF v_remaining = 0 THEN
    v_new_sup_status := 'picked_up';
  ELSE
    v_new_sup_status := 'partially_shipped';
  END IF;
  UPDATE purchase_orders SET sup_status = v_new_sup_status, updated_at = now()
    WHERE id = p_po_id;

  INSERT INTO po_history (po_id, text, by_role, by_user_id)
  VALUES (p_po_id,
          format('Logistics received %s thread(s) · DO %s · sup_status → %s',
                 v_thread_count, btrim(p_do_number), v_new_sup_status),
          'logistics', v_actor_uid);

  RETURN jsonb_build_object(
    'pickup_event_id', v_event_id,
    'thread_count', v_thread_count,
    'po_sup_status', v_new_sup_status
  );
END;
$$;
REVOKE ALL ON FUNCTION public.logistics_receive_threads(text, uuid[], text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.logistics_receive_threads(text, uuid[], text, text, text) TO authenticated;

-- 4e. RPC: pickup event render payload (read-only)
-- Partner gate uses procurement_partner_id (procurement leg).
CREATE OR REPLACE FUNCTION public.pickup_event_render_payload(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_event       po_pickup_events;
  v_po          purchase_orders;
  v_supplier    suppliers;
  v_threads     jsonb;
  v_caller_role app_role;
BEGIN
  v_caller_role := public.app_role();
  SELECT * INTO v_event FROM po_pickup_events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'event not found' USING ERRCODE = '42P01', DETAIL = 'event_not_found';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = v_event.po_id;

  -- RLS-equivalent gate: supplier sees own PO; partner sees own assigned PO;
  -- logistics + principal see all.
  IF v_caller_role = 'supplier' AND v_po.supplier_id IS DISTINCT FROM public.app_supplier_id() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501', DETAIL = 'cross_tenant';
  END IF;
  IF v_caller_role = 'partner' AND v_po.procurement_partner_id IS DISTINCT FROM public.app_partner_id() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501', DETAIL = 'cross_tenant';
  END IF;
  IF v_caller_role NOT IN ('supplier', 'partner', 'logistics', 'principal') THEN
    RAISE EXCEPTION 'forbidden: role not allowed'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  SELECT * INTO v_supplier FROM suppliers WHERE id = v_po.supplier_id;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'thread_id', t.id,
      'order_id', t.order_id,
      'order_dl', o.dl,
      'customer_name', o.customer_name,
      'customer_delivery_date', o.delivery_date,
      'sku_lines', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('sku', ol.sku, 'qty', ol.qty)), '[]'::jsonb)
          FROM order_lines ol
         WHERE ol.order_id = t.order_id
      )
    )
  ), '[]'::jsonb) INTO v_threads
  FROM order_supplier_threads t
  LEFT JOIN orders o ON o.id = t.order_id
  WHERE t.pickup_event_id = p_event_id;

  RETURN jsonb_build_object(
    'event_id', v_event.id,
    'do_number', v_event.do_number,
    'do_file_path', v_event.do_file_path,
    'do_note', v_event.do_note,
    'picked_up_at', v_event.picked_up_at,
    'ack_role', v_event.ack_role,
    'po_id', v_po.id,
    'po_eta_date', v_po.eta_date,
    'supplier_name', v_supplier.name,
    'threads', v_threads
  );
END;
$$;
REVOKE ALL ON FUNCTION public.pickup_event_render_payload(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.pickup_event_render_payload(uuid) TO authenticated;

-- 5. RLS on po_pickup_events. Partner read-side uses procurement_partner_id.
ALTER TABLE po_pickup_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pickup_events_supplier_read ON po_pickup_events;
CREATE POLICY pickup_events_supplier_read ON po_pickup_events
  FOR SELECT TO authenticated USING (
    (SELECT public.app_role()) = 'supplier'
    AND EXISTS (
      SELECT 1 FROM purchase_orders po
       WHERE po.id = po_pickup_events.po_id
         AND po.supplier_id = (SELECT public.app_supplier_id())
    )
  );

DROP POLICY IF EXISTS pickup_events_partner_read ON po_pickup_events;
CREATE POLICY pickup_events_partner_read ON po_pickup_events
  FOR SELECT TO authenticated USING (
    (SELECT public.app_role()) = 'partner'
    AND EXISTS (
      SELECT 1 FROM purchase_orders po
       WHERE po.id = po_pickup_events.po_id
         AND po.procurement_partner_id = (SELECT public.app_partner_id())
    )
  );

DROP POLICY IF EXISTS pickup_events_internal_read ON po_pickup_events;
CREATE POLICY pickup_events_internal_read ON po_pickup_events
  FOR SELECT TO authenticated USING (
    (SELECT public.app_role()) IN ('logistics', 'principal')
  );

-- 6. Backfill: existing POs with do_number get a synthetic pickup_event
-- and their threads are pointed at it. supplier_ready_by stays NULL on the
-- backfill (no real signer for legacy data); supplier_ready_at falls back to
-- the thread's updated_at (best-available timestamp).
WITH legacy_dos AS (
  SELECT id AS po_id, do_number, do_file_path, do_uploaded_at, do_uploaded_by
    FROM purchase_orders
   WHERE do_number IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM po_pickup_events e WHERE e.po_id = purchase_orders.id
     )
), new_events AS (
  INSERT INTO po_pickup_events (po_id, do_number, do_file_path, do_note, picked_up_at, picked_up_by, ack_role)
  SELECT po_id, do_number, do_file_path, NULL,
         coalesce(do_uploaded_at, now()), do_uploaded_by, 'partner'
    FROM legacy_dos
  RETURNING id AS event_id, po_id
)
UPDATE order_supplier_threads t
   SET pickup_event_id   = ne.event_id,
       supplier_ready_at = coalesce(t.supplier_ready_at, t.updated_at, now()),
       supplier_ready_by = NULL,
       updated_at        = now()
  FROM new_events ne
 WHERE t.po_id = ne.po_id;
