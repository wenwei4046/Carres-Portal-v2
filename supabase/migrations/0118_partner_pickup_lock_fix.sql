-- 0118_partner_pickup_lock_fix.sql
-- 2026-05-16 (Loo screenshot) — `FOR UPDATE is not allowed with aggregate
-- functions`. `SELECT count(*) ... FOR UPDATE` is invalid Postgres; the lock
-- has to land on the row scan before aggregation. Use a CTE to lock first,
-- then count the locked CTE. Inherited from the original 0107 RPC body — it
-- never tripped before because nothing actually called partner_pickup_threads
-- in real-world use until Loo's first pickup attempt today.

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
  v_po              purchase_orders;
  v_partner_id      uuid;
  v_actor_uid       uuid;
  v_event_id        uuid;
  v_thread_count    int;
  v_remaining       int;
  v_new_sup_status  po_sup_status;
  v_existing_events int;
  v_do_number       text;
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

  -- Lock the eligible thread rows first via CTE (FOR UPDATE in CTE),
  -- then count from the CTE result. Splitting lock + count is mandatory:
  -- Postgres rejects `SELECT count(*) ... FOR UPDATE` outright.
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

  UPDATE order_supplier_threads
     SET pickup_event_id = v_event_id,
         logistics_stage = 'dispatched',
         updated_at      = now()
   WHERE id = ANY(p_thread_ids);

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
                 v_thread_count, v_do_number, v_new_sup_status),
          'partner', v_actor_uid);

  RETURN jsonb_build_object(
    'pickup_event_id', v_event_id,
    'thread_count', v_thread_count,
    'do_number', v_do_number,
    'po_sup_status', v_new_sup_status
  );
END;
$$;
REVOKE ALL ON FUNCTION public.partner_pickup_threads(text, uuid[], text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.partner_pickup_threads(text, uuid[], text, text, text) TO authenticated;
