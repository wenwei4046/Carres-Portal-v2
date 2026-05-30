-- =============================================================================
-- 0152_auto_dispatch_and_reject_branch.sql
-- Phase 10 · Loo 2026-05-31 (authorised in conversation per CLAUDE.md §7 + §8).
--
-- Items B + C of the 2026-05-31 plan.
--
-- B — STANDARD goods auto-dispatch on warehouse arrival.
--   Since 0147 the customer-leg LP is pre-chosen at Accept Proceed
--   (orders.delivery_partner_id). 0122 had deliberately STOPPED STANDARD goods
--   at ready_to_dispatch (needing a manual operation_assign_partner) because
--   back then no LP was pre-chosen. Now that one IS, Loo wants the order to
--   AUTO-advance to dispatched the moment all its goods are at the warehouse —
--   with NO LP "accept" required (only an explicit LP reject blocks it).
--
--   New helper _operation_auto_dispatch_if_ready(order_id) encodes that gate
--   and is PERFORMed from the two warehouse-arrival RPCs
--   (operation_receive_threads + partner_pickup_threads) and from
--   operation_reselect_partner (so a freshly-chosen LP dispatches at once when
--   the goods are already at the WH).
--
-- C — LP reject branches on whether goods are at the warehouse.
--   A.3 (goods AT WH → order auto-dispatched): lp_reject_order reverts the
--        order + its dispatched threads back to ready_to_dispatch so Operation
--        reselects. operation_reselect_partner then re-auto-dispatches.
--   A.4 (goods NOT yet at WH → awaiting_operation_action): status unchanged.
--   Notification: operation_badge_counts gains an 'lp_rejected' counter
--        (counts orders.partner_rejected_at newer than the operator's
--        user_nav_seen timestamp) — a true active badge, not just the passive
--        OrderCard pill.
--
-- The 0117/0118/0122 history shows this state machine is regression-prone, so
-- the four touched RPCs are recreated VERBATIM from their live bodies with only
-- the additive blocks below, and a sanity guard asserts the SOP CASE survives.
--
-- RLS impact: NONE (no policy changes). Schema impact: NONE (no new columns).
-- =============================================================================


-- ─── 1. Helper: _operation_auto_dispatch_if_ready ───────────────────────────
-- Internal (definer) helper called from already-gated RPCs. Auto-dispatches an
-- order IFF every thread's goods are at the WH and a non-rejected LP is set.
CREATE OR REPLACE FUNCTION public._operation_auto_dispatch_if_ready(p_order_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order            orders;
  v_pre_wh_count     int;
  v_ready_count      int;
  v_threads_advanced int := 0;
  v_partner_name     text;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Order-level gate: must be a live customer order with a pre-chosen LP that
  -- has NOT rejected. No LP "accept" is required (Loo 2026-05-31).
  IF v_order.status <> 'proceed_order'
     OR v_order.delivery_partner_id IS NULL
     OR v_order.partner_rejected_at IS NOT NULL THEN
    RETURN false;
  END IF;

  -- Thread-level gate: NO thread may still be pre-warehouse (in production /
  -- awaiting / waiting), and at least one thread must be ready_to_dispatch
  -- (= goods physically at the WH). SOFA_SPECIAL orders never satisfy this
  -- (their threads go straight to dispatched), so they are left untouched.
  SELECT
    count(*) FILTER (WHERE operation_stage IN
      ('placed','proceed_request','awaiting_operation_action','waiting')),
    count(*) FILTER (WHERE operation_stage = 'ready_to_dispatch')
    INTO v_pre_wh_count, v_ready_count
    FROM order_supplier_threads
   WHERE order_id = p_order_id;

  IF v_pre_wh_count > 0 OR v_ready_count = 0 THEN
    RETURN false;
  END IF;

  SELECT name INTO v_partner_name
    FROM delivery_partners WHERE id = v_order.delivery_partner_id;

  -- Flip the ready_to_dispatch threads to dispatched, stamping the customer-leg
  -- LP (mirrors operation_assign_partner's thread writes).
  UPDATE order_supplier_threads
     SET delivery_partner_id     = v_order.delivery_partner_id,
         confirm_delivery_date   = v_order.delivery_date,
         partner_accepted_at     = now(),
         partner_rejected_at     = NULL,
         request_for_delivery_at = NULL,
         operation_stage         = 'dispatched',
         updated_at              = now()
   WHERE order_id = p_order_id
     AND operation_stage = 'ready_to_dispatch';
  GET DIAGNOSTICS v_threads_advanced = ROW_COUNT;

  -- Explicit order write for the fields the rollup trigger doesn't manage
  -- (dispatched_at + warehouse_id). The trigger recomputes operation_stage to
  -- 'dispatched' from the thread writes above; we also set it for clarity.
  UPDATE orders
     SET operation_stage = 'dispatched',
         dispatched_at   = now(),
         updated_at      = now()
   WHERE id = p_order_id;

  INSERT INTO order_history (order_id, text, by_role)
  VALUES (
    p_order_id,
    format('Auto-dispatched on warehouse arrival via %s (%s thread%s) — LP pre-chosen at Accept, no manual assign needed',
           coalesce(v_partner_name, 'LP'),
           v_threads_advanced,
           CASE WHEN v_threads_advanced = 1 THEN '' ELSE 's' END),
    'operation'
  );

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public._operation_auto_dispatch_if_ready(uuid) FROM public;
REVOKE ALL ON FUNCTION public._operation_auto_dispatch_if_ready(uuid) FROM anon;


-- ─── 2. operation_receive_threads — append auto-dispatch loop ────────────────
-- Verbatim live body (own_logistics WH receive, always ready_to_dispatch) PLUS
-- a per-distinct-order auto-dispatch call at the end.
CREATE OR REPLACE FUNCTION public.operation_receive_threads(p_po_id text, p_thread_ids uuid[], p_do_number text, p_do_file_path text, p_do_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_po           purchase_orders;
  v_actor_uid    uuid;
  v_event_id     uuid;
  v_thread_count int;
  v_remaining    int;
  v_new_sup_status po_sup_status;
  v_oid          uuid;
BEGIN
  v_actor_uid  := (SELECT auth.uid());

  IF public.app_role() <> 'operation' THEN
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
          now(), v_actor_uid, 'operation')
  RETURNING id INTO v_event_id;

  -- F1 fix: own_logistics receive lands goods at WH awaiting customer-leg dispatch.
  -- Always 'ready_to_dispatch' (no SOFA_SPECIAL branch because own_logistics
  -- by definition routes goods through the warehouse, not direct-to-customer).
  UPDATE order_supplier_threads
     SET pickup_event_id = v_event_id,
         operation_stage = 'ready_to_dispatch'::operation_stage,
         updated_at      = now()
   WHERE id = ANY(p_thread_ids);

  SELECT count(*) INTO v_remaining
    FROM order_supplier_threads
   WHERE po_id = p_po_id AND pickup_event_id IS NULL;

  -- F3 fix: terminal converges to 'delivered' (consistency with
  -- operation_receive_po_with_do); intermediate stays 'partially_shipped'.
  IF v_remaining = 0 THEN
    v_new_sup_status := 'delivered';
  ELSE
    v_new_sup_status := 'partially_shipped';
  END IF;
  UPDATE purchase_orders SET sup_status = v_new_sup_status, updated_at = now()
    WHERE id = p_po_id;

  INSERT INTO po_history (po_id, text, by_role, by_user_id)
  VALUES (p_po_id,
          format('Logistics received %s thread(s) · DO %s · sup_status → %s',
                 v_thread_count, btrim(p_do_number), v_new_sup_status),
          'operation', v_actor_uid);

  -- B (Loo 2026-05-31): auto-dispatch any order whose goods are now all at the
  -- WH and which has a non-rejected pre-chosen customer-leg LP (no accept needed).
  FOR v_oid IN
    SELECT DISTINCT order_id FROM order_supplier_threads WHERE id = ANY(p_thread_ids)
  LOOP
    PERFORM public._operation_auto_dispatch_if_ready(v_oid);
  END LOOP;

  RETURN jsonb_build_object(
    'pickup_event_id', v_event_id,
    'thread_count', v_thread_count,
    'po_sup_status', v_new_sup_status
  );
END;
$function$;


-- ─── 3. partner_pickup_threads — append auto-dispatch loop ───────────────────
-- Verbatim live body (factory pickup; SOFA_SPECIAL → dispatched, STANDARD →
-- ready_to_dispatch — the 0122 SOP CASE) PLUS the auto-dispatch loop.
CREATE OR REPLACE FUNCTION public.partner_pickup_threads(p_po_id text, p_thread_ids uuid[], p_do_number text, p_do_file_path text, p_do_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_po              purchase_orders;
  v_partner_id      uuid;
  v_actor_uid       uuid;
  v_event_id        uuid;
  v_thread_count    int;
  v_remaining       int;
  v_new_sup_status  po_sup_status;
  v_existing_events int;
  v_do_number       text;
  v_oid             uuid;
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

  WITH locked AS (
    SELECT id FROM order_supplier_threads
     WHERE id = ANY(p_thread_ids)
       AND po_id = p_po_id
       AND supplier_ready_at IS NOT NULL
       AND pickup_event_id IS NULL
     FOR UPDATE
  )
  SELECT count(*) INTO v_thread_count FROM locked;
  IF v_thread_count <> array_length(p_thread_ids, 1) THEN
    RAISE EXCEPTION 'one or more threads ineligible (not ready / wrong PO / already picked)'
      USING ERRCODE = '22023', DETAIL = 'ineligible_thread';
  END IF;

  IF p_do_number IS NULL OR length(btrim(p_do_number)) < 3 THEN
    SELECT count(*) INTO v_existing_events FROM po_pickup_events WHERE po_id = p_po_id;
    v_do_number := format('DO-%s-%s', p_po_id, lpad((v_existing_events + 1)::text, 3, '0'));
  ELSE
    v_do_number := btrim(p_do_number);
  END IF;

  INSERT INTO po_pickup_events (po_id, do_number, do_file_path, do_note, picked_up_at, picked_up_by, ack_role)
  VALUES (p_po_id,
          v_do_number,
          nullif(btrim(coalesce(p_do_file_path, '')), ''),
          nullif(btrim(coalesce(p_do_note, '')), ''),
          now(), v_actor_uid, 'partner')
  RETURNING id INTO v_event_id;

  UPDATE order_supplier_threads t
     SET pickup_event_id = v_event_id,
         operation_stage = CASE WHEN t.sop_name = 'SOFA_SPECIAL'
                                THEN 'dispatched'::operation_stage
                                ELSE 'ready_to_dispatch'::operation_stage
                           END,
         updated_at      = now()
   WHERE t.id = ANY(p_thread_ids);

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
          format('Partner picked up %s thread(s) · DO %s · sup_status -> %s',
                 v_thread_count, v_do_number, v_new_sup_status),
          'partner', v_actor_uid);

  -- B (Loo 2026-05-31): factory-pickup STANDARD goods land at the WH
  -- (ready_to_dispatch); auto-dispatch the order if all its goods are now at
  -- the WH and a non-rejected LP was pre-chosen. SOFA_SPECIAL threads are
  -- already 'dispatched' so the helper's gate skips them.
  FOR v_oid IN
    SELECT DISTINCT order_id FROM order_supplier_threads WHERE id = ANY(p_thread_ids)
  LOOP
    PERFORM public._operation_auto_dispatch_if_ready(v_oid);
  END LOOP;

  RETURN jsonb_build_object(
    'pickup_event_id', v_event_id,
    'thread_count',    v_thread_count,
    'do_number',       v_do_number,
    'po_sup_status',   v_new_sup_status
  );
END;
$function$;


-- ─── 4. lp_reject_order — A.3 revert / A.4 leave ────────────────────────────
-- Verbatim live body PLUS the warehouse-state branch after the reject write.
CREATE OR REPLACE FUNCTION public.lp_reject_order(
  p_order_id uuid,
  p_reason   text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role         app_role;
  v_partner_id   uuid;
  v_actor        text;
  v_order        orders;
  v_reason       text;
  v_reverted     boolean := false;
begin
  v_role       := public.app_role();
  v_partner_id := public.app_partner_id();

  if v_role <> 'partner' then
    raise exception 'forbidden: partner only'
      using errcode = '42501', detail = 'forbidden';
  end if;
  if v_partner_id is null then
    raise exception 'no partner_id on JWT'
      using errcode = '42501', detail = 'no_partner_id';
  end if;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'reject reason is required'
      using errcode = '22023', detail = 'reason_required';
  end if;
  if length(v_reason) > 500 then
    raise exception 'reject reason too long (% chars, max 500)', length(v_reason)
      using errcode = '22023', detail = 'reason_too_long';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  if v_order.delivery_partner_id is distinct from v_partner_id then
    raise exception 'forbidden: order is not assigned to this partner'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if v_order.request_for_delivery_at is null then
    raise exception 'order has no pending LP request'
      using errcode = '22023', detail = 'no_pending_request';
  end if;
  if v_order.partner_accepted_at is not null then
    raise exception 'order already accepted — cannot reject'
      using errcode = '22023', detail = 'already_accepted';
  end if;
  if v_order.partner_rejected_at is not null then
    raise exception 'order already rejected'
      using errcode = '22023', detail = 'already_rejected';
  end if;

  v_actor := coalesce((select name from app_users where id = (select auth.uid())), 'Partner');

  update orders
     set partner_rejected_at     = now(),
         partner_rejected_reason = v_reason,
         updated_at              = now()
   where id = p_order_id;

  -- C (Loo 2026-05-31) — branch on whether the goods are at the warehouse:
  --   A.3: order was auto-dispatched (goods at WH) → revert the order + its
  --        dispatched threads back to ready_to_dispatch so Operation reselects
  --        (operation_reselect_partner then re-auto-dispatches the new LP).
  --   A.4: order still awaiting_operation_action (goods not yet at WH) → leave
  --        the stage untouched; the reject flag alone bounces it to Operation.
  -- The 'lp_rejected' badge counter (operation_badge_counts) notifies Operation
  -- in both cases.
  if v_order.operation_stage = 'dispatched' then
    update order_supplier_threads
       set operation_stage     = 'ready_to_dispatch',
           delivery_partner_id = null,
           partner_accepted_at = null,
           updated_at          = now()
     where order_id = p_order_id
       and operation_stage = 'dispatched';

    update orders
       set operation_stage = 'ready_to_dispatch',
           dispatched_at   = null,
           updated_at      = now()
     where id = p_order_id;

    v_reverted := true;
  end if;

  insert into order_history (order_id, text, by_role)
  values (
    p_order_id,
    format('LP rejected delivery · %s · reason: %s%s', v_actor, v_reason,
           case when v_reverted
                then ' · goods at WH → reverted to ready_to_dispatch for reselect'
                else ' · awaiting stage unchanged' end),
    'partner'
  );

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('partner', v_actor,
          format('Rejected delivery for SO-%s · reason: %s', v_order.so, v_reason),
          v_order.dealer_id, 'SO-' || v_order.so::text);

  return jsonb_build_object(
    'order_id',                v_order.id,
    'so',                      v_order.so,
    'partner_rejected_at',     now(),
    'partner_rejected_reason', v_reason,
    'reverted_to_ready',       v_reverted
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.lp_reject_order(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.lp_reject_order(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.lp_reject_order(uuid, text) TO authenticated;


-- ─── 5. operation_reselect_partner — re-auto-dispatch ───────────────────────
-- Verbatim live body PLUS an auto-dispatch call at the end (so a freshly-chosen
-- LP dispatches immediately when the goods are already at the WH — the A.3 case
-- where lp_reject_order reverted to ready_to_dispatch).
CREATE OR REPLACE FUNCTION public.operation_reselect_partner(
  p_order_id   uuid,
  p_partner_id uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role         app_role;
  v_uid          uuid;
  v_actor        text;
  v_order        orders;
  v_partner_name text;
  v_auto_dispatched boolean := false;
begin
  v_role := public.app_role();
  v_uid  := (select auth.uid());

  if v_role is distinct from 'operation' then
    raise exception 'forbidden: operation only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if p_partner_id is null then
    raise exception 'partner_id is required'
      using errcode = '22023', detail = 'partner_required';
  end if;
  select name into v_partner_name
    from delivery_partners where id = p_partner_id;
  if v_partner_name is null then
    raise exception 'delivery partner not found: %', p_partner_id
      using errcode = 'P0001', detail = 'partner_not_found';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  if v_order.partner_rejected_at is null then
    raise exception 'order is not in rejected state — nothing to reselect'
      using errcode = '22023', detail = 'not_rejected';
  end if;

  if v_order.delivery_partner_id is not distinct from p_partner_id then
    raise exception 'cannot reselect the same partner that just rejected'
      using errcode = '22023', detail = 'same_partner';
  end if;

  v_actor := coalesce((select name from app_users where id = v_uid), 'Operation');

  update orders
     set delivery_partner_id     = p_partner_id,
         request_for_delivery_at = now(),
         partner_accepted_at     = null,
         partner_rejected_at     = null,
         partner_rejected_reason = null,
         updated_at              = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role)
  values (p_order_id, format('Operation reselected LP → %s', v_partner_name), 'operation');

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('operation', v_actor,
          format('Reselected LP for SO-%s → %s', v_order.so, v_partner_name),
          v_order.dealer_id, 'SO-' || v_order.so::text);

  -- B/C (Loo 2026-05-31): if the goods are already at the WH (A.3 reject
  -- reverted the order to ready_to_dispatch), the new LP auto-dispatches now.
  -- If the goods aren't at the WH yet (A.4), the helper no-ops and dispatch
  -- happens later on warehouse arrival.
  v_auto_dispatched := public._operation_auto_dispatch_if_ready(p_order_id);

  return jsonb_build_object(
    'order_id',                v_order.id,
    'so',                      v_order.so,
    'delivery_partner_id',     p_partner_id,
    'request_for_delivery_at', now(),
    'auto_dispatched',         v_auto_dispatched
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.operation_reselect_partner(uuid, uuid) FROM public;
REVOKE ALL ON FUNCTION public.operation_reselect_partner(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.operation_reselect_partner(uuid, uuid) TO authenticated;


-- NOTE on the 'active notification' (Loo 2026-05-31): the operation badge feed
-- is NOT an RPC — it lives in apps/api/src/routes/operation/badges.ts as direct
-- count queries vs user_nav_seen.last_seen_at. The new 'operation:lp_rejected'
-- badge (counting orders.partner_rejected_at newer than last-seen) is added
-- there, not in SQL. No DB object needed for the notification.


-- ─── 6. Sanity ──────────────────────────────────────────────────────────────
DO $sanity$
DECLARE
  v_def text;
BEGIN
  -- Regression guard (closes phase-10-partner-pickup-rpc-regression-guard):
  -- the SOFA_SPECIAL CASE must survive every rewrite of partner_pickup_threads.
  v_def := pg_get_functiondef('public.partner_pickup_threads(text,uuid[],text,text,text)'::regprocedure);
  IF position('SOFA_SPECIAL' in v_def) = 0 THEN
    RAISE EXCEPTION '0152 sanity: partner_pickup_threads lost its SOFA_SPECIAL CASE';
  END IF;
  IF position('_operation_auto_dispatch_if_ready' in v_def) = 0 THEN
    RAISE EXCEPTION '0152 sanity: partner_pickup_threads did not get the auto-dispatch loop';
  END IF;

  v_def := pg_get_functiondef('public.operation_receive_threads(text,uuid[],text,text,text)'::regprocedure);
  IF position('_operation_auto_dispatch_if_ready' in v_def) = 0 THEN
    RAISE EXCEPTION '0152 sanity: operation_receive_threads did not get the auto-dispatch loop';
  END IF;

  v_def := pg_get_functiondef('public.lp_reject_order(uuid,text)'::regprocedure);
  IF position('ready_to_dispatch' in v_def) = 0 THEN
    RAISE EXCEPTION '0152 sanity: lp_reject_order did not get the A.3 revert branch';
  END IF;

  RAISE NOTICE '0152 OK: helper + receive/pickup auto-dispatch + reject A.3/A.4 (lp_rejected badge in badges.ts)';
END $sanity$;
