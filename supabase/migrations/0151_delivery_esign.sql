-- 0151_delivery_esign.sql
-- Phase 10 · Loo 2026-05-31 · item E.
--
-- REQUIRED customer e-signature on mark-delivered, for BOTH legs:
--   - partner customer-leg  : partner_attach_pod
--   - HQ / operation leg     : operation_attach_do_and_deliver
--
-- Adds delivery-signature columns (pod_signature_url / pod_signed_by /
-- pod_signed_at) to order_supplier_threads + orders. These are DISTINCT from
-- orders.signature_url, which is the SALES-ORDER signature captured at order
-- creation — do not reuse it.
--
-- Both attach RPCs gain two NEW trailing params (p_signature_url, p_signed_by)
-- that DEFAULT NULL so the currently-deployed (pre-this-change) web bundle's
-- narrower named-arg calls keep resolving to the new function until redeploy
-- (zero-downtime). Required-ness is enforced at the UI + API (zod) layers; a
-- later cleanup migration can harden the RPC body (NOT NULL guard) once the old
-- bundle is gone. No SQL dependents reference either RPC (verified via
-- pg_get_functiondef scan), so drop+recreate is safe.

-- 1. Columns -----------------------------------------------------------------
alter table public.order_supplier_threads
  add column if not exists pod_signature_url text,
  add column if not exists pod_signed_by     text,
  add column if not exists pod_signed_at     timestamptz;

alter table public.orders
  add column if not exists pod_signature_url text,
  add column if not exists pod_signed_by     text,
  add column if not exists pod_signed_at     timestamptz;

-- 2. partner_attach_pod (customer leg) ---------------------------------------
drop function if exists public.partner_attach_pod(uuid, text, text, text, boolean);

create function public.partner_attach_pod(
  p_thread_id     uuid,
  p_pod_path      text,
  p_do_number     text,
  p_do_note       text,
  p_signed        boolean,
  p_signature_url text default null,
  p_signed_by     text default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_thread     order_supplier_threads;
  v_partner_id uuid;
  v_user_id    uuid;
BEGIN
  v_partner_id := public.app_partner_id();
  v_user_id    := (select auth.uid());

  IF public.app_role() <> 'partner' THEN
    RAISE EXCEPTION 'forbidden: partner role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: partner_id missing on JWT'
      USING ERRCODE = '42501', DETAIL = 'no_partner_id';
  END IF;

  IF p_signed IS NULL OR p_signed = false THEN
    RAISE EXCEPTION 'customer must sign DO'
      USING ERRCODE = 'P0001', DETAIL = 'do_required';
  END IF;

  IF p_pod_path IS NULL OR btrim(p_pod_path) = '' THEN
    RAISE EXCEPTION 'pod_path required'
      USING ERRCODE = '22023', DETAIL = 'pod_path_required';
  END IF;

  IF p_do_number IS NULL OR length(btrim(p_do_number)) < 3 THEN
    RAISE EXCEPTION 'DO number must be at least 3 characters'
      USING ERRCODE = 'P0001', DETAIL = 'do_required';
  END IF;

  SELECT * INTO v_thread FROM order_supplier_threads WHERE id = p_thread_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'thread not found' USING ERRCODE = '42P01', DETAIL = 'thread_not_found';
  END IF;

  IF v_thread.delivery_partner_id IS DISTINCT FROM v_partner_id THEN
    RAISE EXCEPTION 'forbidden: not this partner''s thread'
      USING ERRCODE = '42501', DETAIL = 'cross_tenant';
  END IF;

  IF v_thread.operation_stage IS DISTINCT FROM 'dispatched' THEN
    RAISE EXCEPTION 'thread is not in dispatched state (got %)', v_thread.operation_stage
      USING ERRCODE = '22023', DETAIL = 'wrong_stage';
  END IF;

  UPDATE order_supplier_threads
     SET pod_url           = btrim(p_pod_path),
         pod_do_number     = btrim(p_do_number),
         pod_note          = nullif(btrim(coalesce(p_do_note, '')), ''),
         pod_uploaded_at   = now(),
         pod_uploaded_by   = v_user_id,
         pod_signature_url = nullif(btrim(coalesce(p_signature_url, '')), ''),
         pod_signed_by     = nullif(btrim(coalesce(p_signed_by, '')), ''),
         pod_signed_at     = now(),
         operation_stage   = 'delivered',
         delivered_at      = now(),
         updated_at        = now()
   WHERE id = p_thread_id;

  INSERT INTO order_history (order_id, text, by_role, by_user_id)
  VALUES (
    v_thread.order_id,
    format('POD attached for thread %s · DO %s · signed by %s · stage → delivered',
           p_thread_id, btrim(p_do_number),
           coalesce(nullif(btrim(coalesce(p_signed_by, '')), ''), 'customer')),
    'partner',
    v_user_id
  );

  RETURN jsonb_build_object(
    'thread_id',         p_thread_id,
    'operation_stage',   'delivered',
    'pod_url',           btrim(p_pod_path),
    'pod_do_number',     btrim(p_do_number),
    'pod_signature_url', nullif(btrim(coalesce(p_signature_url, '')), ''),
    'pod_signed_by',     nullif(btrim(coalesce(p_signed_by, '')), '')
  );
END;
$function$;

-- 3. operation_attach_do_and_deliver (HQ leg) --------------------------------
drop function if exists public.operation_attach_do_and_deliver(uuid, text, text, boolean, text);

create function public.operation_attach_do_and_deliver(
  p_order_id      uuid,
  p_do_number     text,
  p_do_note       text,
  p_signed        boolean,
  p_do_file_path  text,
  p_signature_url text default null,
  p_signed_by     text default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order   orders;
  v_actor   text;
  v_line    record;
  v_user_id uuid;
  v_threads_advanced int;
BEGIN
  v_user_id := (select auth.uid());

  IF NOT public.is_operation() THEN
    RAISE EXCEPTION 'forbidden: logistics only' USING ERRCODE = '42501';
  END IF;

  IF p_signed IS NULL OR p_signed = false THEN
    RAISE EXCEPTION 'customer must sign DO'
      USING ERRCODE = 'P0001', DETAIL = 'do_required';
  END IF;

  IF p_do_number IS NULL OR length(btrim(p_do_number)) < 3 THEN
    RAISE EXCEPTION 'DO number must be at least 3 characters'
      USING ERRCODE = 'P0001', DETAIL = 'do_required';
  END IF;

  IF p_do_file_path IS NULL OR length(btrim(p_do_file_path)) = 0 THEN
    RAISE EXCEPTION 'DO file required'
      USING ERRCODE = 'P0001', DETAIL = 'do_file_required';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found'
      USING ERRCODE = '42P01', DETAIL = 'order_not_found';
  END IF;

  IF v_order.operation_stage IS DISTINCT FROM 'dispatched'
     OR v_order.status <> 'proceed_order' THEN
    RAISE EXCEPTION 'order is not in dispatched state'
      USING ERRCODE = '22023', DETAIL = 'wrong_stage';
  END IF;

  v_actor := coalesce((SELECT name FROM app_users WHERE id = v_user_id), 'Logistics');

  UPDATE orders
     SET status            = 'delivered',
         operation_stage   = 'delivered',
         do_number         = btrim(p_do_number),
         do_note           = nullif(btrim(coalesce(p_do_note, '')), ''),
         do_file_path      = btrim(p_do_file_path),
         do_uploaded_at    = now(),
         do_uploaded_by    = v_user_id,
         pod_signature_url = nullif(btrim(coalesce(p_signature_url, '')), ''),
         pod_signed_by     = nullif(btrim(coalesce(p_signed_by, '')), ''),
         pod_signed_at     = now(),
         delivered_at      = now(),
         updated_at        = now()
   WHERE id = p_order_id;

  PERFORM public._operation_release_order_reserve(p_order_id);

  FOR v_line IN
    SELECT sku, qty FROM order_lines WHERE order_id = p_order_id
  LOOP
    UPDATE stock_balances
       SET qty        = qty - v_line.qty,
           updated_at = now()
     WHERE sku = v_line.sku
       AND warehouse_id = v_order.warehouse_id;

    INSERT INTO stock_movements
      (sku, warehouse_id, qty, kind, ref, by_role, by_user_id)
    VALUES
      (v_line.sku, v_order.warehouse_id, -v_line.qty, 'out',
       'SO-' || v_order.so::text, 'operation', v_user_id);
  END LOOP;

  UPDATE order_supplier_threads
     SET operation_stage = 'delivered',
         delivered_at    = COALESCE(delivered_at, now()),
         updated_at      = now()
   WHERE order_id = p_order_id
     AND operation_stage <> 'delivered';
  GET DIAGNOSTICS v_threads_advanced = ROW_COUNT;

  INSERT INTO order_history (order_id, text, by_role)
  VALUES (
    p_order_id,
    format('Delivered · DO %s · file %s · signed by %s%s',
           btrim(p_do_number),
           btrim(p_do_file_path),
           coalesce(nullif(btrim(coalesce(p_signed_by, '')), ''), 'customer'),
           CASE WHEN v_threads_advanced > 0
                THEN format(' · %s thread(s) advanced', v_threads_advanced)
                ELSE '' END),
    'operation'
  );

  INSERT INTO audit_log (role, actor_text, action, dealer_id, ref)
  VALUES ('operation', v_actor,
          format('Delivered SO-%s · DO %s', v_order.so, btrim(p_do_number)),
          v_order.dealer_id, 'SO-' || v_order.so::text);

  RETURN jsonb_build_object(
    'id',                v_order.id,
    'so',                v_order.so,
    'status',            'delivered',
    'operation_stage',   'delivered',
    'do_number',         btrim(p_do_number),
    'do_file_path',      btrim(p_do_file_path),
    'pod_signature_url', nullif(btrim(coalesce(p_signature_url, '')), ''),
    'pod_signed_by',     nullif(btrim(coalesce(p_signed_by, '')), ''),
    'delivered_at',      now(),
    'threads_advanced',  v_threads_advanced
  );
END;
$function$;
