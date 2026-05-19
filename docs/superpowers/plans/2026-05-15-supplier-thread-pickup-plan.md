# Supplier Per-Thread Readiness + Multi-DO Partial Pickup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable supplier to tick PO threads ready individually (per linked sales order); enable partner / logistics to pick up subsets across multiple DO events; sort PO list by urgency driven by earliest customer delivery date.

**Architecture:** Per-thread state machine layered onto existing PO state. New table `po_pickup_events` decouples DO documents from PO (1:N). `partially_shipped` enum value lets PO `sup_status` reflect intermediate state. RLS-scoped reads for all 3 roles + SECURITY DEFINER RPCs for writes. Mirror Forecast page urgency UI patterns on dashboard + list views.

**Tech Stack:** Postgres (Supabase) + Hono v4 (CF Workers) + Vite SPA (React 18 + TanStack Query 5 + Tailwind). Spec source: `docs/superpowers/specs/2026-05-15-supplier-thread-pickup-design.md`.

---

## File Structure

### New files
- `supabase/migrations/0107_supplier_thread_pickup.sql` — schema + 5 RPCs + LP whitelist + backfill
- `apps/api/src/routes/supplier/threads.ts` — POST/DELETE /ready endpoints
- `apps/api/src/routes/supplier/threads.test.ts` — tests for above
- `apps/api/src/routes/partner/pickups-batch.ts` — POST /batch pickup endpoint
- `apps/api/src/routes/partner/pickups-batch.test.ts`
- `apps/api/src/routes/logistics/receive-threads.ts` — POST /receive-threads endpoint
- `apps/api/src/routes/logistics/receive-threads.test.ts`
- `apps/api/src/routes/pickup-events/print.ts` — shared print DO endpoint (all 3 roles)
- `apps/api/src/routes/pickup-events/print.test.ts`
- `apps/web/src/pages/supplier/PODrawerThreadList.tsx` — per-thread checklist component
- `apps/web/src/pages/supplier/PODrawerThreadList.test.tsx`
- `apps/web/src/pages/partner/components/PickupBatchDialog.tsx` — multi-select + DO upload modal
- `apps/web/src/pages/partner/components/PickupBatchDialog.test.tsx`
- `e2e/phase-10-partial-pickup-happy.spec.ts` — Playwright E2E

### Modified files
- `apps/api/src/routes/supplier/pos.ts` — enrich response with urgency/sku_summary/customer_eta_min/behind_schedule
- `apps/api/src/routes/supplier/pos.test.ts` — assertions for new fields
- `apps/api/src/routes/partner/pickups.ts` — same enrichment
- `apps/api/src/routes/partner/pickups.test.ts` — assertions
- `apps/api/src/index.ts` — mount 4 new routers
- `apps/web/src/lib/queries.ts` — new hooks: `useMarkThreadReady`, `useUnmarkThreadReady`, `usePartnerPickupBatch`, `useLogisticsReceiveThreads`, `usePickupEventPrint`
- `apps/web/src/pages/supplier/SupplierPOs.tsx` — urgency badge, sort dropdown, sku summary; mount `PODrawerThreadList` inside detail drawer
- `apps/web/src/pages/supplier/SupplierPOs.test.tsx` — new assertions
- `apps/web/src/pages/partner/PartnerPickupsPage.tsx` — multi-select + mount `PickupBatchDialog`
- `apps/web/src/pages/partner/PartnerPickupsPage.test.tsx` — new assertions
- `apps/web/src/pages/logistics/components/ReceivePOModal.tsx` — per-thread ready section for own_logistics POs
- `apps/web/src/pages/logistics/components/ReceivePOModal.test.tsx` — assertions
- `packages/shared/src/domain.ts` — new types: `PickupEvent`, `ThreadReadinessRow`, `Urgency`
- `packages/shared/src/schemas/supplier.ts` — zod for new endpoints
- `packages/shared/src/schemas/partner.ts` — zod for pickup batch
- `packages/shared/src/schemas/logistics.ts` — zod for receive threads
- `CLAUDE.md` — §17 sync after ship

---

## Task 1: Migration 0107 — schema + RPCs + LP whitelist + backfill

**Files:**
- Create: `supabase/migrations/0107_supplier_thread_pickup.sql`

Migration applied via Supabase MCP `apply_migration` per CLAUDE.md §7. Bundles schema + 5 RPCs + LP whitelist update + backfill for PO-2031/PO-2032 in one atomic apply.

- [ ] **Step 1: Write the migration file (full content shown)**

Create `supabase/migrations/0107_supplier_thread_pickup.sql` with this exact content:

```sql
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
-- 6. LP whitelist trigger admits new thread columns.
-- 7. Backfill: PO-2031 + PO-2032 (delivered) get one synthetic pickup_event
--    each so threads have pickup_event_id set.
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
  IF v_po.delivery_partner_id IS DISTINCT FROM v_partner_id THEN
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
  IF v_caller_role = 'partner' AND v_po.delivery_partner_id IS DISTINCT FROM public.app_partner_id() THEN
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

-- 5. RLS on po_pickup_events
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
         AND po.delivery_partner_id = (SELECT public.app_partner_id())
    )
  );

DROP POLICY IF EXISTS pickup_events_internal_read ON po_pickup_events;
CREATE POLICY pickup_events_internal_read ON po_pickup_events
  FOR SELECT TO authenticated USING (
    (SELECT public.app_role()) IN ('logistics', 'principal')
  );

-- 6. LP whitelist trigger update — admit new thread columns
-- Find the current LP whitelist trigger function and add supplier_ready_at,
-- supplier_ready_by, pickup_event_id to its allow-list. Existing trigger
-- (last touched in 0086) is order_supplier_threads_lp_whitelist or similar;
-- query pg_trigger to locate it then ALTER FUNCTION body. Pattern follows
-- migration 0085 (cf §17 entry 2026-05-11).
--
-- For this migration we use the simple approach: drop + recreate the
-- trigger function with the extended column list. The exact body is
-- shown in step 2 below (read from current DB first to preserve other
-- whitelisted columns).

-- 7. Backfill: PO-2031 + PO-2032 (already-delivered POs)
WITH legacy_dos AS (
  SELECT id AS po_id, do_number, do_file_path, do_note, do_uploaded_at, do_uploaded_by
    FROM purchase_orders
   WHERE do_number IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM po_pickup_events e WHERE e.po_id = purchase_orders.id
     )
), new_events AS (
  INSERT INTO po_pickup_events (po_id, do_number, do_file_path, do_note, picked_up_at, picked_up_by, ack_role)
  SELECT po_id, do_number, do_file_path, do_note,
         coalesce(do_uploaded_at, now()), do_uploaded_by, 'partner'
    FROM legacy_dos
  RETURNING id AS event_id, po_id
)
UPDATE order_supplier_threads t
   SET pickup_event_id   = ne.event_id,
       supplier_ready_at = coalesce(t.supplier_ready_at, t.updated_at, now()),
       supplier_ready_by = coalesce(t.supplier_ready_by, ne.event_id::text::uuid),  -- synthetic
       updated_at        = now()
  FROM new_events ne
 WHERE t.po_id = ne.po_id;
```

- [ ] **Step 2: Read current LP whitelist trigger function body**

Use Supabase MCP `execute_sql` to fetch the current trigger function definition so step 3 can append columns without dropping others:

```sql
SELECT prosrc FROM pg_proc WHERE proname IN (
  'order_supplier_threads_lp_whitelist',
  'enforce_lp_thread_column_whitelist'
);
```

Or query `pg_trigger` joined to `pg_proc` to find the actual function attached to `order_supplier_threads`:

```sql
SELECT t.tgname, p.proname, p.prosrc
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE t.tgrelid = 'order_supplier_threads'::regclass
  AND NOT t.tgisinternal;
```

Capture the full function body. Add 3 column names (`supplier_ready_at`, `supplier_ready_by`, `pickup_event_id`) to whatever array/IF chain defines the whitelist. Substitute into the migration file's section 6 placeholder before applying.

- [ ] **Step 3: Apply migration via Supabase MCP**

```
mcp__claude_ai_Supabase__apply_migration
  project_id: kfprgpjpaffedghytstl
  name: supplier_thread_pickup
  query: <full migration content from step 1, with LP trigger body filled in>
```

Expected: `{"success":true}`

- [ ] **Step 4: Verify schema landed**

```sql
-- Run via execute_sql
SELECT 'po_pickup_events row count', count(*) FROM po_pickup_events
UNION ALL
SELECT 'threads with pickup_event_id', count(*) FROM order_supplier_threads WHERE pickup_event_id IS NOT NULL
UNION ALL
SELECT 'partially_shipped enum exists',
       (SELECT count(*) FROM pg_enum WHERE enumlabel = 'partially_shipped'
        AND enumtypid = 'po_sup_status'::regtype)::text;
```

Expected: po_pickup_events count = 2 (PO-2031 + PO-2032 backfilled), threads count >= 2, partially_shipped exists = 1.

- [ ] **Step 5: Verify all 5 RPCs grantable**

```sql
SELECT proname FROM pg_proc WHERE proname IN (
  'supplier_mark_thread_ready',
  'supplier_unmark_thread_ready',
  'partner_pickup_threads',
  'logistics_receive_threads',
  'pickup_event_render_payload'
) ORDER BY proname;
```

Expected: 5 rows.

- [ ] **Step 6: Commit migration file**

```bash
git add supabase/migrations/0107_supplier_thread_pickup.sql
git commit -m "feat(supplier): migration 0107 — per-thread readiness + multi-DO partial pickup"
```

---

## Task 2: Shared types + zod schemas

**Files:**
- Modify: `packages/shared/src/domain.ts`
- Modify: `packages/shared/src/db-types.ts`
- Create: `packages/shared/src/schemas/supplier-threads.ts`
- Modify: `packages/shared/src/schemas/partner.ts`
- Modify: `packages/shared/src/schemas/logistics.ts`

- [ ] **Step 1: Add domain types**

Edit `packages/shared/src/domain.ts`, append:

```ts
export type Urgency = "critical" | "urgent" | "normal";

export type PickupEvent = {
  id: string;
  poId: string;
  doNumber: string;
  doFilePath: string | null;
  doNote: string | null;
  pickedUpAt: string;
  pickedUpBy: string | null;
  ackRole: "partner" | "logistics";
  createdAt: string;
};

export type ThreadReadinessRow = {
  threadId: string;
  orderId: string;
  orderDl: number;
  customerName: string;
  customerDeliveryDate: string | null;
  supplierReadyAt: string | null;
  pickupEventId: string | null;
  pickupDoNumber: string | null;
  skuLines: Array<{ sku: string; qty: number }>;
};
```

- [ ] **Step 2: Add db-types**

Edit `packages/shared/src/db-types.ts`, append the snake_case row shapes mirroring the table columns:

```ts
export interface PoPickupEventsRow {
  id: string;
  po_id: string;
  do_number: string;
  do_file_path: string | null;
  do_note: string | null;
  picked_up_at: string;
  picked_up_by: string | null;
  ack_role: "partner" | "logistics";
  created_at: string;
}
```

Also extend the existing `OrderSupplierThreadsRow` type to include `supplier_ready_at`, `supplier_ready_by`, `pickup_event_id` (all nullable).

- [ ] **Step 3: Create supplier-threads zod schema**

Create `packages/shared/src/schemas/supplier-threads.ts`:

```ts
import { z } from "zod";

export const markThreadReadyInput = z.object({}).strict(); // path-only, no body
export type MarkThreadReadyInput = z.infer<typeof markThreadReadyInput>;
```

- [ ] **Step 4: Extend partner schema**

Edit `packages/shared/src/schemas/partner.ts`, append:

```ts
export const partnerPickupBatchInput = z.object({
  poId:        z.string().min(1).max(50),
  threadIds:   z.array(z.string().uuid()).min(1),
  doNumber:    z.string().trim().min(3).max(50),
  doFilePath:  z.string().trim().min(1).max(500),
  doNote:      z.string().max(500).optional(),
  signed:      z.literal(true),
}).strict();
export type PartnerPickupBatchInput = z.infer<typeof partnerPickupBatchInput>;
```

- [ ] **Step 5: Extend logistics schema**

Edit `packages/shared/src/schemas/logistics.ts`, append:

```ts
export const logisticsReceiveThreadsInput = z.object({
  threadIds:   z.array(z.string().uuid()).min(1),
  doNumber:    z.string().trim().min(3).max(50),
  doFilePath:  z.string().trim().min(1).max(500),
  doNote:      z.string().max(500).optional(),
  signed:      z.literal(true),
}).strict();
export type LogisticsReceiveThreadsInput = z.infer<typeof logisticsReceiveThreadsInput>;
```

- [ ] **Step 6: Typecheck**

```bash
pnpm --filter @carres/shared exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/domain.ts packages/shared/src/db-types.ts \
        packages/shared/src/schemas/supplier-threads.ts \
        packages/shared/src/schemas/partner.ts \
        packages/shared/src/schemas/logistics.ts
git commit -m "feat(shared): types + zod for supplier thread pickup"
```

---

## Task 3: API — supplier threads endpoints

**Files:**
- Create: `apps/api/src/routes/supplier/threads.ts`
- Create: `apps/api/src/routes/supplier/threads.test.ts`
- Modify: `apps/api/src/index.ts` (mount router)

- [ ] **Step 1: Write failing test for POST /ready**

Create `apps/api/src/routes/supplier/threads.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import app from "../../index";
import { makeJwt } from "../../test-helpers/jwt";

const SB_THREAD_OK = {
  rpc: (name: string, _args: unknown) => {
    if (name === "supplier_mark_thread_ready") {
      return Promise.resolve({
        data: { thread_id: "11111111-1111-1111-1111-111111111111", supplier_ready_at: "2026-05-15T10:00:00Z", po_sup_status: "ready_for_pickup" },
        error: null,
      });
    }
    throw new Error(`unexpected rpc ${name}`);
  },
};

describe("POST /api/supplier/threads/:id/ready", () => {
  it("403 without supplier role", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(new Request("http://t/api/supplier/threads/11111111-1111-1111-1111-111111111111/ready", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
    }));
    expect(res.status).toBe(403);
  });

  it("422 on invalid uuid", async () => {
    const jwt = await makeJwt("supplier", { supplier_id: "00000000-0000-0000-0000-0000000000e2" });
    const res = await app.fetch(new Request("http://t/api/supplier/threads/not-a-uuid/ready", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
    }));
    expect(res.status).toBe(422);
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
pnpm --filter @carres/api exec vitest run src/routes/supplier/threads.test.ts
```

Expected: FAIL (route not mounted yet).

- [ ] **Step 3: Create threads.ts route**

Create `apps/api/src/routes/supplier/threads.ts`:

```ts
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

const supplierThreadsRouter = new Hono<AppEnv>();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireSupplier(c: { var: { auth: { role: string } } }) {
  if (c.var.auth.role !== "supplier") {
    throw new HTTPException(403, { message: "Supplier role required" });
  }
}

supplierThreadsRouter.post("/:threadId/ready", async (c) => {
  requireSupplier(c);
  const threadId = c.req.param("threadId");
  if (!UUID_RE.test(threadId)) {
    return c.json({ error: "invalid_id", code: "invalid_param", message: "threadId must be uuid" }, 422);
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("supplier_mark_thread_ready", { p_thread_id: threadId });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

supplierThreadsRouter.delete("/:threadId/ready", async (c) => {
  requireSupplier(c);
  const threadId = c.req.param("threadId");
  if (!UUID_RE.test(threadId)) {
    return c.json({ error: "invalid_id", code: "invalid_param", message: "threadId must be uuid" }, 422);
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("supplier_unmark_thread_ready", { p_thread_id: threadId });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

export default supplierThreadsRouter;
```

- [ ] **Step 4: Mount router in index.ts**

Edit `apps/api/src/index.ts`. Find the existing supplier router mounts (search for `supplier`). Add:

```ts
import supplierThreadsRouter from "./routes/supplier/threads";
// ... existing routers ...
app.route("/api/supplier/threads", supplierThreadsRouter);
```

- [ ] **Step 5: Re-run tests**

```bash
pnpm --filter @carres/api exec vitest run src/routes/supplier/threads.test.ts
```

Expected: PASS (both tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/supplier/threads.ts \
        apps/api/src/routes/supplier/threads.test.ts \
        apps/api/src/index.ts
git commit -m "feat(api): supplier threads ready/unready endpoints"
```

---

## Task 4: API — partner pickup batch endpoint

**Files:**
- Create: `apps/api/src/routes/partner/pickups-batch.ts`
- Create: `apps/api/src/routes/partner/pickups-batch.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/src/routes/partner/pickups-batch.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import app from "../../index";
import { makeJwt } from "../../test-helpers/jwt";

describe("POST /api/partner/pickups/batch", () => {
  it("403 for non-partner role", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(new Request("http://t/api/partner/pickups/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "content-type": "application/json" },
      body: JSON.stringify({ poId: "PO-1", threadIds: ["11111111-1111-1111-1111-111111111111"], doNumber: "DO-A", doFilePath: "p", signed: true }),
    }));
    expect(res.status).toBe(403);
  });

  it("422 on missing doNumber", async () => {
    const jwt = await makeJwt("partner", { partner_id: "00000000-0000-0000-0000-0000000000a1" });
    const res = await app.fetch(new Request("http://t/api/partner/pickups/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "content-type": "application/json" },
      body: JSON.stringify({ poId: "PO-1", threadIds: ["11111111-1111-1111-1111-111111111111"], doFilePath: "p", signed: true }),
    }));
    expect(res.status).toBe(422);
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
pnpm --filter @carres/api exec vitest run src/routes/partner/pickups-batch.test.ts
```

Expected: FAIL (route not exists).

- [ ] **Step 3: Create route**

Create `apps/api/src/routes/partner/pickups-batch.ts`:

```ts
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { partnerPickupBatchInput } from "@carres/shared/schemas/partner";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

const partnerPickupBatchRouter = new Hono<AppEnv>();

partnerPickupBatchRouter.post("/batch", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "partner") {
    throw new HTTPException(403, { message: "Partner role required" });
  }
  const raw = await c.req.json().catch(() => ({}));
  const parsed = partnerPickupBatchInput.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return c.json({
      error: "invalid_input",
      code: "invalid_param",
      message: issue?.message ?? "invalid input",
      field: issue?.path.join(".") ?? "unknown",
    }, 422);
  }
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("partner_pickup_threads", {
    p_po_id:        parsed.data.poId,
    p_thread_ids:   parsed.data.threadIds,
    p_do_number:    parsed.data.doNumber,
    p_do_file_path: parsed.data.doFilePath,
    p_do_note:      parsed.data.doNote ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

export default partnerPickupBatchRouter;
```

- [ ] **Step 4: Mount router**

Edit `apps/api/src/index.ts`:

```ts
import partnerPickupBatchRouter from "./routes/partner/pickups-batch";
app.route("/api/partner/pickups", partnerPickupBatchRouter);
```

(If `/api/partner/pickups` is already mounted with a different router, mount this as `/api/partner/pickups-batch` instead. Confirm by reading current index.ts first.)

- [ ] **Step 5: Re-run tests**

```bash
pnpm --filter @carres/api exec vitest run src/routes/partner/pickups-batch.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/partner/pickups-batch.ts \
        apps/api/src/routes/partner/pickups-batch.test.ts \
        apps/api/src/index.ts
git commit -m "feat(api): partner batch pickup endpoint"
```

---

## Task 5: API — logistics receive threads endpoint

**Files:**
- Create: `apps/api/src/routes/logistics/receive-threads.ts`
- Create: `apps/api/src/routes/logistics/receive-threads.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/src/routes/logistics/receive-threads.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import app from "../../index";
import { makeJwt } from "../../test-helpers/jwt";

describe("POST /api/logistics/pos/:poId/receive-threads", () => {
  it("403 for non-logistics role", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(new Request("http://t/api/logistics/pos/PO-1/receive-threads", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "content-type": "application/json" },
      body: JSON.stringify({ threadIds: ["11111111-1111-1111-1111-111111111111"], doNumber: "DO-X", doFilePath: "p", signed: true }),
    }));
    expect(res.status).toBe(403);
  });

  it("422 on empty threadIds", async () => {
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(new Request("http://t/api/logistics/pos/PO-1/receive-threads", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "content-type": "application/json" },
      body: JSON.stringify({ threadIds: [], doNumber: "DO-X", doFilePath: "p", signed: true }),
    }));
    expect(res.status).toBe(422);
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
pnpm --filter @carres/api exec vitest run src/routes/logistics/receive-threads.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create route**

Create `apps/api/src/routes/logistics/receive-threads.ts`:

```ts
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logisticsReceiveThreadsInput } from "@carres/shared/schemas/logistics";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

const logisticsReceiveThreadsRouter = new Hono<AppEnv>();

logisticsReceiveThreadsRouter.post("/:poId/receive-threads", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "logistics") {
    throw new HTTPException(403, { message: "Logistics role required" });
  }
  const poId = c.req.param("poId");
  const raw = await c.req.json().catch(() => ({}));
  const parsed = logisticsReceiveThreadsInput.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return c.json({
      error: "invalid_input",
      code: "invalid_param",
      message: issue?.message ?? "invalid input",
      field: issue?.path.join(".") ?? "unknown",
    }, 422);
  }
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("logistics_receive_threads", {
    p_po_id:        poId,
    p_thread_ids:   parsed.data.threadIds,
    p_do_number:    parsed.data.doNumber,
    p_do_file_path: parsed.data.doFilePath,
    p_do_note:      parsed.data.doNote ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

export default logisticsReceiveThreadsRouter;
```

- [ ] **Step 4: Mount router**

Edit `apps/api/src/index.ts`:

```ts
import logisticsReceiveThreadsRouter from "./routes/logistics/receive-threads";
app.route("/api/logistics/pos", logisticsReceiveThreadsRouter);
```

(If `/api/logistics/pos` mount conflicts with an existing router, route this on a sub-path instead. Confirm by reading current index.ts.)

- [ ] **Step 5: Re-run tests**

```bash
pnpm --filter @carres/api exec vitest run src/routes/logistics/receive-threads.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/logistics/receive-threads.ts \
        apps/api/src/routes/logistics/receive-threads.test.ts \
        apps/api/src/index.ts
git commit -m "feat(api): logistics receive threads endpoint"
```

---

## Task 6: API — enrich GET /api/supplier/pos with urgency + sku_summary + customer_eta_min + behind_schedule

**Files:**
- Modify: `apps/api/src/routes/supplier/pos.ts`
- Modify: `apps/api/src/routes/supplier/pos.test.ts`

- [ ] **Step 1: Write failing test for new fields**

Append to `apps/api/src/routes/supplier/pos.test.ts`:

```ts
it("returns urgency + sku_summary + customer_eta_min + behind_schedule on each PO row", async () => {
  // Mock returns one open PO with embedded lines + linked threads + dl→order join
  const fakeRow = {
    id: "PO-9999",
    sup_status: "in_production",
    eta_date: "2026-05-22",
    lines: [{ sku: "mattress:carres-original:King", qty: 5 }],
    threads: [
      { id: "t1", order_id: "o1", orders: { dl: 1001, delivery_date: "2026-05-20" } },
      { id: "t2", order_id: "o2", orders: { dl: 1002, delivery_date: "2026-05-28" } },
    ],
  };
  // ... configure mock to return [fakeRow] ...

  const jwt = await makeJwt("supplier", { supplier_id: "00000000-0000-0000-0000-0000000000e2" });
  const res = await app.fetch(new Request("http://t/api/supplier/pos", {
    headers: { Authorization: `Bearer ${jwt}` },
  }));
  expect(res.status).toBe(200);
  const rows = (await res.json()) as Array<Record<string, unknown>>;
  expect(rows[0].customer_eta_min).toBe("2026-05-20");
  expect(rows[0].urgency).toMatch(/critical|urgent|normal/);
  expect(rows[0].behind_schedule).toBe(true);          // eta_date 2026-05-22 > customer 2026-05-20
  expect(rows[0].sku_summary).toEqual([{ sku: "mattress:carres-original:King", qty: 5 }]);
});
```

(Full mock builder uses existing patterns in this file — reuse `buildSb` if present, or replicate the inline mock used by neighboring tests.)

- [ ] **Step 2: Run failing test**

```bash
pnpm --filter @carres/api exec vitest run src/routes/supplier/pos.test.ts -t "urgency"
```

Expected: FAIL (fields not returned).

- [ ] **Step 3: Add computation in pos.ts**

Edit `apps/api/src/routes/supplier/pos.ts`. After the existing Supabase query that fetches PO + lines + threads, add a post-processing block:

```ts
function computeUrgency(daysUntil: number | null): "critical" | "urgent" | "normal" | null {
  if (daysUntil == null) return null;
  if (daysUntil < 7) return "critical";
  if (daysUntil < 14) return "urgent";
  return "normal";
}

// After the SELECT returns `rows`:
const now = new Date();
const enriched = rows.map((po: any) => {
  const threadEtas = (po.threads ?? [])
    .map((t: any) => t.orders?.delivery_date)
    .filter(Boolean) as string[];
  const customerEtaMin = threadEtas.length
    ? threadEtas.sort()[0]
    : null;
  const daysUntilCustomer = customerEtaMin
    ? Math.floor((new Date(customerEtaMin).getTime() - now.getTime()) / 86_400_000)
    : null;
  const behindSchedule =
    customerEtaMin && po.eta_date
      ? po.eta_date >= customerEtaMin
      : false;
  const skuSummary = (po.lines ?? []).map((l: any) => ({ sku: l.sku, qty: l.qty }));
  return {
    ...po,
    customer_eta_min: customerEtaMin,
    urgency: computeUrgency(daysUntilCustomer),
    behind_schedule: behindSchedule,
    sku_summary: skuSummary,
  };
});
return c.json(enriched);
```

Also update the SELECT to embed `threads:order_supplier_threads(id, order_id, orders(dl, delivery_date))` so the join is available.

- [ ] **Step 4: Re-run test**

```bash
pnpm --filter @carres/api exec vitest run src/routes/supplier/pos.test.ts -t "urgency"
```

Expected: PASS.

- [ ] **Step 5: Run full supplier/pos test file**

```bash
pnpm --filter @carres/api exec vitest run src/routes/supplier/pos.test.ts
```

Expected: ALL PASS (no regressions on existing assertions).

- [ ] **Step 6: Mirror same enrichment in partner/pickups.ts**

Edit `apps/api/src/routes/partner/pickups.ts` similarly — partner needs same urgency/customer ETA visibility on PO cards. Add `customer_eta_min`, `urgency`, `behind_schedule`, `sku_summary` to each PO row in response.

Add a test in `apps/api/src/routes/partner/pickups.test.ts` mirroring step 1.

- [ ] **Step 7: Run partner tests**

```bash
pnpm --filter @carres/api exec vitest run src/routes/partner/pickups.test.ts
```

Expected: ALL PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/supplier/pos.ts \
        apps/api/src/routes/supplier/pos.test.ts \
        apps/api/src/routes/partner/pickups.ts \
        apps/api/src/routes/partner/pickups.test.ts
git commit -m "feat(api): enrich supplier+partner PO list with urgency/customer-eta/sku-summary"
```

---

## Task 7: API — pickup event print endpoint

**Files:**
- Create: `apps/api/src/routes/pickup-events/print.ts`
- Create: `apps/api/src/routes/pickup-events/print.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/src/routes/pickup-events/print.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import app from "../../index";
import { makeJwt } from "../../test-helpers/jwt";

describe("GET /api/pickup-events/:id/print", () => {
  it("422 on invalid uuid", async () => {
    const jwt = await makeJwt("supplier", { supplier_id: "00000000-0000-0000-0000-0000000000e2" });
    const res = await app.fetch(new Request("http://t/api/pickup-events/not-uuid/print", {
      headers: { Authorization: `Bearer ${jwt}` },
    }));
    expect(res.status).toBe(422);
  });

  it("403 for dealer role", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(new Request("http://t/api/pickup-events/11111111-1111-1111-1111-111111111111/print", {
      headers: { Authorization: `Bearer ${jwt}` },
    }));
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
pnpm --filter @carres/api exec vitest run src/routes/pickup-events/print.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create route**

Create `apps/api/src/routes/pickup-events/print.ts`:

```ts
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import { renderPickupEventDoPdf } from "../../lib/pdf/pickup-event-template";
import type { AppEnv } from "../../types";

const pickupEventsRouter = new Hono<AppEnv>();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

pickupEventsRouter.get("/:id/print", async (c) => {
  const auth = c.var.auth;
  if (!["supplier", "partner", "logistics", "principal"].includes(auth.role)) {
    throw new HTTPException(403, { message: "Role not allowed" });
  }
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) {
    return c.json({ error: "invalid_id", code: "invalid_param", message: "uuid required" }, 422);
  }
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("pickup_event_render_payload", { p_event_id: id });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  // Browser-side render: API returns JSON payload, web renders PDF via react-pdf
  // (Workers runtime cannot run @react-pdf — see fa47433 commit). Web side will
  // open a /print route that fetches this JSON then renders.
  return c.json(data);
});

export default pickupEventsRouter;
```

(Note: per existing pattern in this repo — see commit `fa47433 fix(pdf): move Invoice + DO + PO render to browser` — PDF generation lives in the web app, not the Worker. So this endpoint returns the JSON payload; web `print-do-event` route does the actual render.)

Remove the `renderPickupEventDoPdf` import since render is browser-side.

- [ ] **Step 4: Mount router**

Edit `apps/api/src/index.ts`:

```ts
import pickupEventsRouter from "./routes/pickup-events/print";
app.route("/api/pickup-events", pickupEventsRouter);
```

- [ ] **Step 5: Re-run tests**

```bash
pnpm --filter @carres/api exec vitest run src/routes/pickup-events/print.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/pickup-events/print.ts \
        apps/api/src/routes/pickup-events/print.test.ts \
        apps/api/src/index.ts
git commit -m "feat(api): pickup event print payload endpoint"
```

---

## Task 8: Web — query hooks

**Files:**
- Modify: `apps/web/src/lib/queries.ts`

- [ ] **Step 1: Add query keys + hooks**

Edit `apps/web/src/lib/queries.ts`. Find the `qk` object and add `supplierThreads` + `pickupEvents` namespaces. Then add hooks:

```ts
// In qk:
supplierThreads: {
  byPo: (poId: string) => ["supplierThreads", poId] as const,
},
pickupEvent: {
  print: (eventId: string) => ["pickupEvent", eventId] as const,
},

// Mutation hooks:
export function useMarkThreadReady() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (threadId: string) => {
      return apiFetch<{ thread_id: string; supplier_ready_at: string; po_sup_status: string }>(
        `/api/supplier/threads/${threadId}/ready`,
        { method: "POST" }
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplierPos"] });
      qc.invalidateQueries({ queryKey: ["supplierThreads"] });
    },
  });
}

export function useUnmarkThreadReady() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (threadId: string) => {
      return apiFetch<{ thread_id: string; po_sup_status: string }>(
        `/api/supplier/threads/${threadId}/ready`,
        { method: "DELETE" }
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplierPos"] });
      qc.invalidateQueries({ queryKey: ["supplierThreads"] });
    },
  });
}

export function usePartnerPickupBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      poId: string;
      threadIds: string[];
      doNumber: string;
      doFilePath: string;
      doNote?: string;
    }) => {
      return apiFetch<{ pickup_event_id: string; thread_count: number; po_sup_status: string }>(
        "/api/partner/pickups/batch",
        { method: "POST", body: JSON.stringify({ ...input, signed: true }) }
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partnerPickups"] });
    },
  });
}

export function useLogisticsReceiveThreads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      poId: string;
      threadIds: string[];
      doNumber: string;
      doFilePath: string;
      doNote?: string;
    }) => {
      const { poId, ...body } = input;
      return apiFetch<{ pickup_event_id: string; thread_count: number; po_sup_status: string }>(
        `/api/logistics/pos/${poId}/receive-threads`,
        { method: "POST", body: JSON.stringify({ ...body, signed: true }) }
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["logisticsPos"] });
    },
  });
}

export function usePickupEventPrint(eventId: string | null) {
  return useQuery({
    queryKey: eventId ? qk.pickupEvent.print(eventId) : ["pickupEvent", "none"],
    queryFn: () => apiFetch<PickupEventPrintPayload>(`/api/pickup-events/${eventId}/print`),
    enabled: !!eventId,
  });
}

export type PickupEventPrintPayload = {
  event_id: string;
  do_number: string;
  do_file_path: string | null;
  do_note: string | null;
  picked_up_at: string;
  ack_role: "partner" | "logistics";
  po_id: string;
  po_eta_date: string | null;
  supplier_name: string;
  threads: Array<{
    thread_id: string;
    order_id: string;
    order_dl: number;
    customer_name: string;
    customer_delivery_date: string | null;
    sku_lines: Array<{ sku: string; qty: number }>;
  }>;
};
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @carres/web exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/queries.ts
git commit -m "feat(web): query hooks for thread readiness + pickup batch"
```

---

## Task 9: Web — SupplierPOs list enhancements

**Files:**
- Modify: `apps/web/src/pages/supplier/SupplierPOs.tsx`
- Modify: `apps/web/src/pages/supplier/SupplierPOs.test.tsx`

- [ ] **Step 1: Write failing test for urgency badge**

Append to `apps/web/src/pages/supplier/SupplierPOs.test.tsx`:

```ts
it("renders urgency badge + customer ETA + sku summary on each card", async () => {
  vi.mocked(apiFetch).mockImplementation(async (url: string) => {
    if (url.includes("/api/supplier/pos")) {
      return [{
        id: "PO-9999",
        sup_status: "in_production",
        eta_date: "2026-05-22",
        sku_summary: [{ sku: "mattress:carres-original:King", qty: 5 }],
        customer_eta_min: "2026-05-20",
        urgency: "critical",
        behind_schedule: true,
        lines: [{ sku: "mattress:carres-original:King", qty: 5 }],
      }];
    }
    if (url.includes("/api/supplier/me")) return { /* supplier row mock */ };
    if (url.includes("/api/supplier/activity")) return [];
    if (url.includes("/api/supplier/products/demand")) return [];
    throw new Error("unexpected");
  });

  render(wrap(<SupplierPOs />));
  await waitFor(() => {
    expect(screen.getByText(/Customer ETA/i)).toBeInTheDocument();
  });
  expect(screen.getByText("2026-05-20")).toBeInTheDocument();
  expect(screen.getByText(/Behind schedule/i)).toBeInTheDocument();
  expect(screen.getByText(/mattress:carres-original:King/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run failing test**

```bash
pnpm --filter @carres/web exec vitest run src/pages/supplier/SupplierPOs.test.tsx -t "urgency badge"
```

Expected: FAIL.

- [ ] **Step 3: Update SupplierPOs.tsx**

Edit `apps/web/src/pages/supplier/SupplierPOs.tsx`. In the PO card render block, add (above or below existing meta):

```tsx
{po.urgency && (
  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.06em] ${
    po.urgency === "critical" ? "bg-destructive/10 text-destructive"
    : po.urgency === "urgent" ? "bg-warning/15 text-warning"
    : "bg-success/10 text-success"
  }`}>
    {po.urgency === "critical" ? "🔴 Critical" : po.urgency === "urgent" ? "🟠 Urgent" : "🟢 Normal"}
  </span>
)}
{po.customer_eta_min && (
  <span className="text-[11px] text-muted-foreground">
    Customer ETA <span className="font-mono">{po.customer_eta_min}</span>
  </span>
)}
{po.behind_schedule && (
  <span className="text-[10px] text-destructive font-semibold">⚠ Behind schedule</span>
)}
{po.sku_summary && po.sku_summary.length > 0 && (
  <div className="text-[11px] text-muted-foreground">
    {po.sku_summary.map((l) => `${l.sku} × ${l.qty}`).join(" · ")}
  </div>
)}
```

Add a sort dropdown above the list:

```tsx
const [sortBy, setSortBy] = useState<"urgency" | "po_id" | "po_eta" | "created">("urgency");

const sortedPos = useMemo(() => {
  const arr = [...pos];
  if (sortBy === "urgency") {
    const rank: Record<string, number> = { critical: 0, urgent: 1, normal: 2 };
    arr.sort((a, b) => {
      const ra = rank[a.urgency ?? "normal"] ?? 99;
      const rb = rank[b.urgency ?? "normal"] ?? 99;
      if (ra !== rb) return ra - rb;
      // tiebreak by customer_eta_min
      return (a.customer_eta_min ?? "9999").localeCompare(b.customer_eta_min ?? "9999");
    });
  } else if (sortBy === "po_eta") {
    arr.sort((a, b) => (a.eta_date ?? "9999").localeCompare(b.eta_date ?? "9999"));
  } else if (sortBy === "po_id") {
    arr.sort((a, b) => a.id.localeCompare(b.id));
  } // created keeps API order
  return arr;
}, [pos, sortBy]);

// In header:
<select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="...">
  <option value="urgency">Sort: Urgency</option>
  <option value="po_eta">Sort: PO ETA</option>
  <option value="po_id">Sort: PO ID</option>
  <option value="created">Sort: Created</option>
</select>
```

- [ ] **Step 4: Update domain type for PO row**

In `apps/web/src/lib/queries.ts`, extend the `SupplierPoRow` type to include `urgency`, `customer_eta_min`, `behind_schedule`, `sku_summary`. Or extend `packages/shared/src/domain.ts` if defined there.

- [ ] **Step 5: Run test**

```bash
pnpm --filter @carres/web exec vitest run src/pages/supplier/SupplierPOs.test.tsx
```

Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/supplier/SupplierPOs.tsx \
        apps/web/src/pages/supplier/SupplierPOs.test.tsx \
        apps/web/src/lib/queries.ts
git commit -m "feat(supplier): urgency badge + sort dropdown + sku summary on PO list"
```

---

## Task 10: Web — Supplier PODrawer per-thread checklist + pickup history

**Files:**
- Create: `apps/web/src/pages/supplier/PODrawerThreadList.tsx`
- Create: `apps/web/src/pages/supplier/PODrawerThreadList.test.tsx`
- Modify: `apps/web/src/pages/supplier/SupplierPOs.tsx` (mount component in PODrawer)

- [ ] **Step 1: Write failing test**

Create `apps/web/src/pages/supplier/PODrawerThreadList.test.tsx`:

```ts
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PODrawerThreadList from "./PODrawerThreadList";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(s: number, m: string, b: unknown) { super(m); this.status = s; this.body = b; this.name = "ApiError"; }
  },
}));
import { apiFetch } from "@/lib/api";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const THREADS = [
  { id: "t1", order_id: "o1", order_dl: 1001, customer_name: "Tan", customer_delivery_date: "2026-05-20",
    supplier_ready_at: null, pickup_event_id: null, sku_lines: [{ sku: "mattress:King", qty: 2 }] },
  { id: "t2", order_id: "o2", order_dl: 1002, customer_name: "Lim", customer_delivery_date: "2026-05-28",
    supplier_ready_at: "2026-05-15T10:00:00Z", pickup_event_id: null, sku_lines: [{ sku: "mattress:Queen", qty: 1 }] },
];

describe("PODrawerThreadList", () => {
  it("renders one row per thread with state pill", async () => {
    vi.mocked(apiFetch).mockResolvedValue(THREADS);
    render(wrap(<PODrawerThreadList poId="PO-9999" />));
    await waitFor(() => expect(screen.getByText("DL-1001")).toBeInTheDocument());
    expect(screen.getByText("DL-1002")).toBeInTheDocument();
    expect(screen.getByText(/Producing/i)).toBeInTheDocument(); // t1
    expect(screen.getByText(/Ready/i)).toBeInTheDocument();     // t2
  });

  it("calls mark-ready endpoint when checkbox clicked", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("/threads") && (init?.method === undefined || init?.method === "GET")) return THREADS;
      if (url.includes("/ready") && init?.method === "POST") return { thread_id: "t1", supplier_ready_at: "now", po_sup_status: "ready_for_pickup" };
      throw new Error(`unexpected ${url}`);
    });
    render(wrap(<PODrawerThreadList poId="PO-9999" />));
    await waitFor(() => expect(screen.getByText("DL-1001")).toBeInTheDocument());
    const checkbox = screen.getAllByRole("checkbox")[0];
    fireEvent.click(checkbox);
    await waitFor(() => {
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
        expect.stringContaining("/api/supplier/threads/t1/ready"),
        expect.objectContaining({ method: "POST" })
      );
    });
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
pnpm --filter @carres/web exec vitest run src/pages/supplier/PODrawerThreadList.test.tsx
```

Expected: FAIL (component does not exist).

- [ ] **Step 3: Create component**

Create `apps/web/src/pages/supplier/PODrawerThreadList.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useMarkThreadReady, useUnmarkThreadReady } from "@/lib/queries";

type ThreadRow = {
  id: string;
  order_id: string;
  order_dl: number;
  customer_name: string;
  customer_delivery_date: string | null;
  supplier_ready_at: string | null;
  pickup_event_id: string | null;
  sku_lines: Array<{ sku: string; qty: number }>;
};

export default function PODrawerThreadList({ poId }: { poId: string }) {
  const threadsQ = useQuery<ThreadRow[]>({
    queryKey: ["supplierThreads", poId],
    queryFn: () => apiFetch<ThreadRow[]>(`/api/supplier/pos/${poId}/threads`),
  });
  const markReady = useMarkThreadReady();
  const unmarkReady = useUnmarkThreadReady();

  if (threadsQ.isPending) return <div className="text-sm text-muted-foreground">Loading threads…</div>;
  const threads = threadsQ.data ?? [];
  if (threads.length === 0) {
    return <div className="text-[13px] text-muted-foreground">No linked sales orders (stockpile PO).</div>;
  }

  return (
    <div className="space-y-2.5">
      {threads.map((t) => {
        const isReady = t.supplier_ready_at !== null;
        const isPicked = t.pickup_event_id !== null;
        return (
          <div key={t.id} className="border border-border rounded-md p-3 bg-card">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={isReady}
                disabled={isPicked || markReady.isPending || unmarkReady.isPending}
                onChange={() => {
                  if (isReady) unmarkReady.mutate(t.id);
                  else markReady.mutate(t.id);
                }}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-sm">DL-{t.order_dl}</span>
                  <span className="text-[12px] text-muted-foreground">{t.customer_name}</span>
                  <StatePill picked={isPicked} ready={isReady} />
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Customer ETA: {t.customer_delivery_date ?? "—"}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {t.sku_lines.map((l) => `${l.sku} × ${l.qty}`).join(" · ")}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatePill({ picked, ready }: { picked: boolean; ready: boolean }) {
  if (picked) return <span className="text-[10px] uppercase tracking-[0.06em] font-semibold text-success">🚚 Picked</span>;
  if (ready) return <span className="text-[10px] uppercase tracking-[0.06em] font-semibold text-primary">✅ Ready</span>;
  return <span className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">🛠 Producing</span>;
}
```

- [ ] **Step 4: Add endpoint to read threads for a PO**

Edit `apps/api/src/routes/supplier/pos.ts`. Add a route `GET /:poId/threads` that returns the ThreadRow array. RLS handles cross-tenant via existing thread policies.

```ts
supplierPosRouter.get("/:poId/threads", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "supplier") throw new HTTPException(403, { message: "Supplier role required" });
  const poId = c.req.param("poId");
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("order_supplier_threads")
    .select("id, order_id, supplier_ready_at, pickup_event_id, orders(dl, customer_name, delivery_date)")
    .eq("po_id", poId);
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  // Augment with per-order SKU lines
  const orderIds = (data ?? []).map((r: any) => r.order_id);
  const { data: lines } = await sb
    .from("order_lines")
    .select("order_id, sku, qty")
    .in("order_id", orderIds);
  const linesByOrder = new Map<string, Array<{ sku: string; qty: number }>>();
  for (const l of lines ?? []) {
    const list = linesByOrder.get(l.order_id) ?? [];
    list.push({ sku: l.sku, qty: l.qty });
    linesByOrder.set(l.order_id, list);
  }
  return c.json((data ?? []).map((r: any) => ({
    id: r.id,
    order_id: r.order_id,
    order_dl: r.orders?.dl,
    customer_name: r.orders?.customer_name,
    customer_delivery_date: r.orders?.delivery_date,
    supplier_ready_at: r.supplier_ready_at,
    pickup_event_id: r.pickup_event_id,
    sku_lines: linesByOrder.get(r.order_id) ?? [],
  })));
});
```

- [ ] **Step 5: Mount component in PODrawer**

Edit `apps/web/src/pages/supplier/SupplierPOs.tsx`. Find the existing PO detail drawer (modal that opens when a PO card is clicked). Inside the drawer's content area, after the existing meta block, add:

```tsx
<section className="mt-5">
  <h3 className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-3">
    Production checklist
  </h3>
  <PODrawerThreadList poId={selectedPo.id} />
</section>
```

Import at top: `import PODrawerThreadList from "./PODrawerThreadList";`.

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @carres/web exec vitest run src/pages/supplier/PODrawerThreadList.test.tsx
pnpm --filter @carres/api exec vitest run src/routes/supplier/pos.test.ts
```

Expected: ALL PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/supplier/PODrawerThreadList.tsx \
        apps/web/src/pages/supplier/PODrawerThreadList.test.tsx \
        apps/web/src/pages/supplier/SupplierPOs.tsx \
        apps/api/src/routes/supplier/pos.ts
git commit -m "feat(supplier): per-thread checklist in PODrawer"
```

---

## Task 11: Web — PartnerPickupsPage multi-select + PickupBatchDialog

**Files:**
- Create: `apps/web/src/pages/partner/components/PickupBatchDialog.tsx`
- Create: `apps/web/src/pages/partner/components/PickupBatchDialog.test.tsx`
- Modify: `apps/web/src/pages/partner/PartnerPickupsPage.tsx`
- Modify: `apps/web/src/pages/partner/PartnerPickupsPage.test.tsx`

- [ ] **Step 1: Write failing test for PickupBatchDialog**

Create `apps/web/src/pages/partner/components/PickupBatchDialog.test.tsx`:

```ts
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PickupBatchDialog from "./PickupBatchDialog";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  ApiError: class extends Error { status = 0; body: unknown = null; },
}));

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("PickupBatchDialog", () => {
  it("submit disabled until DO# >= 3 chars + signed checked", () => {
    render(wrap(
      <PickupBatchDialog
        poId="PO-1"
        selectedThreadIds={["t1", "t2"]}
        onClose={() => {}}
      />
    ));
    const submit = screen.getByRole("button", { name: /pickup/i });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/DO number/i), { target: { value: "DO-A1" } });
    fireEvent.click(screen.getByLabelText(/signed/i));
    // file upload field still needed
    expect(submit).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
pnpm --filter @carres/web exec vitest run src/pages/partner/components/PickupBatchDialog.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Create PickupBatchDialog component**

Create `apps/web/src/pages/partner/components/PickupBatchDialog.tsx`:

```tsx
import { useState } from "react";
import { usePartnerPickupBatch } from "@/lib/queries";
import { toast } from "sonner";
import DOFileUploadField from "@/components/DOFileUploadField";

export default function PickupBatchDialog({
  poId,
  selectedThreadIds,
  onClose,
}: {
  poId: string;
  selectedThreadIds: string[];
  onClose: () => void;
}) {
  const [doNumber, setDoNumber] = useState("");
  const [doNote, setDoNote] = useState("");
  const [signed, setSigned] = useState(false);
  const [doFilePath, setDoFilePath] = useState<string | null>(null);
  const pickup = usePartnerPickupBatch();

  const doNumberOk = doNumber.trim().length >= 3;
  const canSubmit = doNumberOk && signed && !!doFilePath && selectedThreadIds.length > 0;

  async function handleSubmit() {
    try {
      const res = await pickup.mutateAsync({
        poId,
        threadIds: selectedThreadIds,
        doNumber: doNumber.trim(),
        doFilePath: doFilePath!,
        doNote: doNote.trim() || undefined,
      });
      toast.success(`Picked up ${res.thread_count} thread(s) · DO ${doNumber}`);
      onClose();
    } catch (e) {
      toast.error(`Pickup failed: ${(e as Error).message}`);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-md p-6 max-w-md w-full space-y-4">
        <h2 className="font-display text-[22px]">Pickup {selectedThreadIds.length} thread(s)</h2>
        <p className="text-[12px] text-muted-foreground">PO {poId}</p>

        <div>
          <label htmlFor="do-number" className="block text-[10px] uppercase tracking-[0.06em] text-muted-foreground mb-1">DO number *</label>
          <input
            id="do-number"
            type="text"
            value={doNumber}
            onChange={(e) => setDoNumber(e.target.value)}
            className="w-full border border-input rounded px-3 py-2 text-sm"
            placeholder="e.g. DO-PO9999-A"
          />
          {!doNumberOk && doNumber.length > 0 && (
            <p className="text-[10px] text-destructive mt-1">Min 3 characters</p>
          )}
        </div>

        {doNumberOk && (
          <DOFileUploadField
            bucket="delivery-orders"
            signUploadUrl="/api/storage/dos/sign-upload"
            signUploadBody={{ poId, doNumber }}
            onChange={setDoFilePath}
          />
        )}

        <div>
          <label htmlFor="do-note" className="block text-[10px] uppercase tracking-[0.06em] text-muted-foreground mb-1">Note (optional)</label>
          <textarea
            id="do-note"
            value={doNote}
            onChange={(e) => setDoNote(e.target.value)}
            className="w-full border border-input rounded px-3 py-2 text-sm h-20"
          />
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={signed}
            onChange={(e) => setSigned(e.target.checked)}
          />
          <span className="text-sm">Signed receipt confirmed</span>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm">Cancel</button>
          <button
            disabled={!canSubmit || pickup.isPending}
            onClick={handleSubmit}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded disabled:opacity-50"
          >
            {pickup.isPending ? "Submitting…" : "Pickup"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

(Adjust signUploadBody to include the upload event scope. `DOFileUploadField` exists already — reuse from previous DO flows.)

- [ ] **Step 4: Integrate into PartnerPickupsPage**

Edit `apps/web/src/pages/partner/PartnerPickupsPage.tsx`. For each PO row that has ready threads (supplier_ready_at set), add multi-select checkboxes per ready thread, plus a "Pickup selected" button that opens the dialog. Track selection state with a Map<string, Set<string>> keyed by poId.

```tsx
const [selectedByPo, setSelectedByPo] = useState<Map<string, Set<string>>>(new Map());
const [openDialog, setOpenDialog] = useState<{ poId: string; threadIds: string[] } | null>(null);

function toggleThread(poId: string, threadId: string) {
  setSelectedByPo((prev) => {
    const next = new Map(prev);
    const set = new Set(next.get(poId) ?? []);
    if (set.has(threadId)) set.delete(threadId);
    else set.add(threadId);
    next.set(poId, set);
    return next;
  });
}
```

For each PO with readyThreads, render:
```tsx
{readyThreads.map((t) => (
  <label key={t.id} className="flex items-center gap-2">
    <input
      type="checkbox"
      checked={(selectedByPo.get(po.id) ?? new Set()).has(t.id)}
      onChange={() => toggleThread(po.id, t.id)}
    />
    <span>DL-{t.order_dl} · {t.customer_name} · {t.sku_lines.map((l) => `${l.sku} × ${l.qty}`).join(", ")}</span>
  </label>
))}
<button
  disabled={(selectedByPo.get(po.id)?.size ?? 0) === 0}
  onClick={() => setOpenDialog({ poId: po.id, threadIds: Array.from(selectedByPo.get(po.id) ?? []) })}
>
  Pickup selected
</button>
```

At bottom of page:
```tsx
{openDialog && (
  <PickupBatchDialog
    poId={openDialog.poId}
    selectedThreadIds={openDialog.threadIds}
    onClose={() => {
      setOpenDialog(null);
      setSelectedByPo(new Map()); // clear selection
    }}
  />
)}
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @carres/web exec vitest run src/pages/partner/
```

Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/partner/
git commit -m "feat(partner): multi-select pickup batch with DO upload"
```

---

## Task 12: Web — Logistics ReceivePOModal extension for own_logistics threads

**Files:**
- Modify: `apps/web/src/pages/logistics/components/ReceivePOModal.tsx`
- Modify: `apps/web/src/pages/logistics/components/ReceivePOModal.test.tsx`

- [ ] **Step 1: Add own_logistics ready-threads section**

In the modal, add a section visible only when:
- The PO's supplier has `kind === "own_logistics"`
- AND the PO has 1+ threads with `supplier_ready_at IS NOT NULL AND pickup_event_id IS NULL`

```tsx
// In the modal body, after the existing "Receive whole PO" form:
{supplierKind === "own_logistics" && readyThreads.length > 0 && (
  <section className="border-t border-border pt-4 mt-4">
    <h3 className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-3">
      Ready threads ({readyThreads.length})
    </h3>
    {readyThreads.map((t) => (
      <label key={t.id} className="flex items-center gap-2 py-1">
        <input
          type="checkbox"
          checked={selectedThreadIds.includes(t.id)}
          onChange={() => toggleSelected(t.id)}
        />
        <span className="text-sm">DL-{t.order_dl} · {t.customer_name}</span>
      </label>
    ))}
    <div className="mt-2">
      <label htmlFor="do-num">DO number</label>
      <input id="do-num" value={doNumber} onChange={(e) => setDoNumber(e.target.value)} />
    </div>
    <DOFileUploadField onChange={setDoFilePath} />
    <button onClick={handleReceiveThreads} disabled={!canReceive}>
      Receive selected threads
    </button>
  </section>
)}
```

`handleReceiveThreads` calls `useLogisticsReceiveThreads().mutateAsync({ poId, threadIds: selectedThreadIds, doNumber, doFilePath: doFilePath!, doNote })`.

- [ ] **Step 2: Add test**

Append to `apps/web/src/pages/logistics/components/ReceivePOModal.test.tsx`:

```ts
it("shows Ready threads section only for own_logistics suppliers with ready threads", () => {
  // mock with supplier.kind = own_logistics + 1 ready thread
  // render
  // assert "Ready threads (1)" in document
});
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @carres/web exec vitest run src/pages/logistics/components/ReceivePOModal.test.tsx
```

Expected: ALL PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/logistics/components/ReceivePOModal.tsx \
        apps/web/src/pages/logistics/components/ReceivePOModal.test.tsx
git commit -m "feat(logistics): per-thread receive section for own_logistics POs"
```

---

## Task 13: Web — DO reprint button + pickup history section

**Files:**
- Modify: `apps/web/src/pages/supplier/SupplierPOs.tsx` (drawer pickup history section)
- Modify: `apps/web/src/pages/partner/PartnerPickupsPage.tsx` (history section + reprint button)
- Modify: `apps/web/src/lib/pdf/` (add `pickup-event-template.tsx` if not exists; mirror existing DO template pattern from `do-template.tsx`)

- [ ] **Step 1: Add pickup history section to supplier PODrawer**

In `SupplierPOs.tsx` PODrawer content, after the production checklist section, add:

```tsx
<section className="mt-5">
  <h3 className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-3">
    Pickup history
  </h3>
  <PickupHistoryList poId={selectedPo.id} />
</section>
```

- [ ] **Step 2: Create PickupHistoryList component**

Create `apps/web/src/pages/supplier/PickupHistoryList.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

type PickupEventRow = {
  id: string;
  do_number: string;
  picked_up_at: string;
  ack_role: "partner" | "logistics";
  thread_count: number;
};

export default function PickupHistoryList({ poId }: { poId: string }) {
  const q = useQuery<PickupEventRow[]>({
    queryKey: ["pickupEvents", poId],
    queryFn: () => apiFetch<PickupEventRow[]>(`/api/supplier/pos/${poId}/pickup-events`),
  });
  if (q.isPending) return <div className="text-[12px] text-muted-foreground">Loading…</div>;
  const events = q.data ?? [];
  if (events.length === 0) {
    return <div className="text-[12px] text-muted-foreground">No pickups yet.</div>;
  }
  return (
    <div className="space-y-2">
      {events.map((e) => (
        <div key={e.id} className="flex items-center justify-between p-2.5 border border-border rounded bg-card">
          <div>
            <div className="text-sm font-mono font-semibold">{e.do_number}</div>
            <div className="text-[11px] text-muted-foreground">
              {new Date(e.picked_up_at).toLocaleString()} · {e.ack_role} · {e.thread_count} threads
            </div>
          </div>
          <button
            onClick={() => window.open(`/print/pickup-event/${e.id}`, "_blank")}
            className="text-sm px-3 py-1 border border-input rounded hover:bg-accent"
          >
            Reprint DO
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Add API endpoint for pickup events list per PO**

In `apps/api/src/routes/supplier/pos.ts`, add:

```ts
supplierPosRouter.get("/:poId/pickup-events", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "supplier") throw new HTTPException(403, { message: "Supplier role required" });
  const poId = c.req.param("poId");
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("po_pickup_events")
    .select("id, do_number, picked_up_at, ack_role")
    .eq("po_id", poId)
    .order("picked_up_at", { ascending: false });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  // Add thread_count per event
  const eventIds = (data ?? []).map((r: any) => r.id);
  const { data: tcRows } = await sb
    .from("order_supplier_threads")
    .select("pickup_event_id")
    .in("pickup_event_id", eventIds);
  const counts = new Map<string, number>();
  for (const t of tcRows ?? []) {
    counts.set(t.pickup_event_id!, (counts.get(t.pickup_event_id!) ?? 0) + 1);
  }
  return c.json((data ?? []).map((e: any) => ({ ...e, thread_count: counts.get(e.id) ?? 0 })));
});
```

- [ ] **Step 4: Add /print/pickup-event/:id browser route**

Edit `apps/web/src/App.tsx`. Add a new route:

```tsx
<Route path="/print/pickup-event/:eventId" element={<PickupEventPrintPage />} />
```

Create `apps/web/src/pages/print/PickupEventPrintPage.tsx`:

```tsx
import { useParams } from "react-router-dom";
import { useEffect } from "react";
import { usePickupEventPrint } from "@/lib/queries";
import { renderPickupEventPdf } from "@/lib/pdf/pickup-event-template";

export default function PickupEventPrintPage() {
  const { eventId } = useParams();
  const q = usePickupEventPrint(eventId ?? null);

  useEffect(() => {
    if (!q.data) return;
    let cancelled = false;
    (async () => {
      const blob = await renderPickupEventPdf(q.data);
      if (cancelled) return;
      const url = URL.createObjectURL(blob);
      window.location.replace(url);
    })();
    return () => { cancelled = true; };
  }, [q.data]);

  if (q.isPending) return <div className="p-8">Loading DO…</div>;
  if (q.error) return <div className="p-8 text-destructive">Failed to load DO: {(q.error as Error).message}</div>;
  return <div className="p-8">Rendering PDF…</div>;
}
```

- [ ] **Step 5: Create PDF template**

Create `apps/web/src/lib/pdf/pickup-event-template.tsx`. Mirror the existing `do-template.tsx` pattern (in same dir). Use `@react-pdf/renderer`. Renders: DO# header, supplier name, picked_up_at, ack_role, table of threads (DL, customer, SKU/qty), signature box.

(Skip full code — engineer should copy existing `do-template.tsx` and adapt the data shape to `PickupEventPrintPayload`.)

- [ ] **Step 6: Mirror reprint button in PartnerPickupsPage**

Add same PickupHistoryList component to partner's PO detail view (or a "Recent pickups" section), reading from `/api/partner/pos/:poId/pickup-events` (new partner-side endpoint with same shape, RLS-scoped per partner).

- [ ] **Step 7: Run tests + manual check**

```bash
pnpm --filter @carres/web exec vitest run
pnpm --filter @carres/api exec vitest run
```

Expected: ALL PASS.

Manually open dev server, log in as supplier, open a PO with a pickup history, click "Reprint DO", confirm PDF opens in new tab.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/pages/supplier/PickupHistoryList.tsx \
        apps/web/src/pages/supplier/SupplierPOs.tsx \
        apps/web/src/pages/partner/PartnerPickupsPage.tsx \
        apps/web/src/pages/print/PickupEventPrintPage.tsx \
        apps/web/src/lib/pdf/pickup-event-template.tsx \
        apps/web/src/App.tsx \
        apps/api/src/routes/supplier/pos.ts \
        apps/api/src/routes/partner/pickups.ts
git commit -m "feat(web): pickup history + DO reprint for supplier + partner"
```

---

## Task 14: E2E spec — phase-10-partial-pickup-happy

**Files:**
- Create: `e2e/phase-10-partial-pickup-happy.spec.ts`
- Modify: `scripts/seed-e2e-fixtures.sql` (add a PO with 3 threads in `in_production` state for testing)

- [ ] **Step 1: Seed fixture data**

Edit `scripts/seed-e2e-fixtures.sql`. Append a section that:
1. Creates 3 sales orders (DL-9301, DL-9302, DL-9303) all for Carres KL Showroom dealer
2. Triggers `confirm_proceed_request` for each → creates 3 threads against Nice Future (mattress)
3. Bundles them into a single PO (PO-FIXTURE-PICKUP-1) via `logistics_create_pos_batch`
4. Advances PO to `sup_status='in_production'`

(Reference existing fixture chunks for the SQL pattern.)

- [ ] **Step 2: Write E2E spec**

Create `e2e/phase-10-partial-pickup-happy.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/login";

test.describe.serial("Partial pickup happy path", () => {
  test("supplier ticks 2 of 3 threads, partner picks them, supplier ticks last, partner picks last", async ({ page }) => {
    // Step 1: Supplier (NiceFuture) signs in
    await loginAs(page, "supplier-nicefuture@x.com");
    await page.goto("/supplier/pos");

    // Step 2: Open PO-FIXTURE-PICKUP-1 drawer
    await page.getByText("PO-FIXTURE-PICKUP-1").click();

    // Step 3: Tick first 2 threads ready
    const checkboxes = page.getByRole("checkbox");
    await checkboxes.nth(0).check();
    await expect(page.getByText("✅ Ready").nth(0)).toBeVisible();
    await checkboxes.nth(1).check();

    // Step 4: Log out, log in as partner
    await page.getByRole("button", { name: /sign out/i }).click();
    await loginAs(page, "partner-nets@x.com");
    await page.goto("/delivery-partner/pickups");

    // Step 5: See PO with 2 ready threads, select them, open dialog
    await page.getByText("PO-FIXTURE-PICKUP-1").click();
    await page.getByRole("checkbox").nth(0).check();
    await page.getByRole("checkbox").nth(1).check();
    await page.getByRole("button", { name: /pickup selected/i }).click();

    // Step 6: Fill DO# + upload mock + sign
    await page.getByLabel(/DO number/i).fill("DO-FIX-A");
    // ... file upload skipped (Playwright + Supabase Storage hard) ...
    await page.getByLabel(/signed/i).check();
    // For E2E we mock the upload via API stub OR we use a fixture file
    // (defer to spec authoring time)

    // Step 7: Assert PO state = partially_shipped via API (or refresh UI)
    // ... assertion ...

    // Step 8: Back to supplier, tick last thread
    // Step 9: Back to partner, pickup last with DO-FIX-B
    // Step 10: Assert PO state = shipped, 2 pickup_events exist
  });
});
```

(Note: full E2E for file upload is finicky — mirror the truncated approach used in `phase-7-partner-pod-happy.spec.ts` per the §17 mention of similar pattern.)

- [ ] **Step 3: Mark spec test.fixme initially**

Wrap the test with `test.fixme(...)` since seed fixture might need iterating. Loo runs locally first, un-fixme once green.

- [ ] **Step 4: Commit**

```bash
git add e2e/phase-10-partial-pickup-happy.spec.ts \
        scripts/seed-e2e-fixtures.sql
git commit -m "test(e2e): phase-10 partial pickup happy spec (test.fixme)"
```

---

## Task 15: Final integration + smoke + CLAUDE.md sync

- [ ] **Step 1: Full test suite**

```bash
pnpm --filter @carres/web build
pnpm --filter @carres/api exec vitest run
pnpm --filter @carres/web exec vitest run
pnpm --filter @carres/shared exec vitest run
```

Expected: ALL PASS, web build green.

- [ ] **Step 2: Manual smoke**

- Loo opens supplier role with PO-FIXTURE-PICKUP-1, sees 3 threads
- Tick 2 threads ready
- Switch to partner role, see 2 ready threads on that PO
- Multi-select + DO upload + submit
- Assert PO sup_status = partially_shipped
- Switch back to supplier, tick last thread
- Switch back to partner, pickup last with new DO#
- Assert PO sup_status = shipped, pickup history shows 2 events
- Click reprint on first DO → PDF opens

- [ ] **Step 3: Update CLAUDE.md §17**

Add a new dated entry under §17 documenting:
- Feature shipped
- Migration 0107 + backfill
- Commit chain (use `git log --oneline -20`)
- Test count delta
- Migration count (106 → 107)
- Any known carry-forwards (e.g., mobile UI, partial qty per thread)

- [ ] **Step 4: Commit + push + deploy**

```bash
git add CLAUDE.md
git commit -m "docs(claude.md): sync §17 with supplier thread pickup ship"
git push origin main
pnpm --filter @carres/web build
wrangler pages deploy apps/web/dist --project-name=carres-portal --branch=main --commit-dirty=true
pnpm --filter @carres/api exec wrangler deploy --env production
```

Expected: web + API both deployed to production.

- [ ] **Step 5: Verify production**

- Curl `https://carres-portal-v2-api.wwch.workers.dev/health` → 200
- Open `https://carres-portal.pages.dev` → loads
- Sign in as supplier, smoke the per-thread checklist UI

---

## Acceptance Criteria

- [ ] Migration 0107 applied, all 5 RPCs callable, RLS verified
- [ ] PO-2031 + PO-2032 backfilled with synthetic pickup_events
- [ ] LP whitelist trigger admits new thread columns (no insert/update failures from partner/logistics roles)
- [ ] All API endpoints respond correctly (4 new POST/DELETE + 2 new GET)
- [ ] Supplier list shows urgency badge + sku summary + customer ETA + behind-schedule warning
- [ ] Sort dropdown works (urgency / PO ETA / PO ID / Created)
- [ ] Supplier PODrawer per-thread checklist works for linked PO; stockpile PO unchanged
- [ ] Partner can multi-select ready threads, fill DO, upload, submit → pickup_event created
- [ ] Logistics ReceivePOModal shows ready threads section for own_logistics POs
- [ ] PO sup_status transitions: in_production → ready_for_pickup → partially_shipped → shipped
- [ ] Supplier can unmark ready before pickup; cannot after
- [ ] All 3 roles can reprint historical DO via /print/pickup-event/:id
- [ ] All existing tests still green (no regressions)
- [ ] E2E spec landed (test.fixme initially; Loo un-fixmes after local run)
- [ ] Production deploy green, smoke test confirmed

---

## Risks & Mitigations

1. **Existing `OPEN_SUP_STATUSES` filter needs `partially_shipped` added** — `apps/api/src/routes/supplier/products.ts:24` lists which sup_status are considered "open" for the Forecast page. Add `partially_shipped` to that array. Audit other filter sites: `grep -r "OPEN_SUP_STATUSES\|sup_status.*in\b" apps/`.

2. **PO-level "Mark Ready" button on linked POs** — current SupplierPOs.tsx has a button that calls `supplier_mark_ready_for_pickup` at PO level. For linked POs, this button must be removed/disabled (per-thread takes over). For stockpile POs, it stays. Detect by checking if PO has any linked threads.

3. **LP whitelist trigger** — adding 3 new columns means the trigger function body must be expanded. If the trigger blocks the new RPCs (which run via caller JWT post-SECURITY DEFINER block — partner/logistics writes thread updates as themselves), partner can't update the thread. Must update trigger function in same migration. Verify with a test that calls partner_pickup_threads end-to-end.

4. **Storage path scheme** — current `dos/sign-upload` returns a path like `<po_id>/<uuid>-do.<ext>`. For multi-DO, we keep that but could optionally add `event_id` subpath. Not strictly required since each upload gets unique uuid. Leave path scheme unchanged for V1.

5. **Backfill data integrity** — the synthetic pickup_event for PO-2031/PO-2032 fakes `supplier_ready_by = ne.event_id::text::uuid` which isn't a real `app_users.id`. Either drop that NULL fallback or set to NULL explicitly:
   ```sql
   supplier_ready_by = NULL  -- legacy backfill, no real signer
   ```
   Edit the migration accordingly before applying.

6. **Test coverage for partial pickup state transitions** — write at least one integration test that walks: pending → ack → in_prod → tick 1 thread → ready_for_pickup → partner picks 1 → partially_shipped → tick + pick all → shipped. Catch any state machine drift.

---

> **Plan complete. Saved to `docs/superpowers/plans/2026-05-15-supplier-thread-pickup-plan.md`.**
