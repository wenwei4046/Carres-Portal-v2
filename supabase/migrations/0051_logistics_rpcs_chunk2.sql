-- =============================================================================
-- 0051_logistics_rpcs_chunk2.sql — Phase 4.5 Chunk 2 Sprint B Task 6
-- =============================================================================
-- Source spec: docs/superpowers/specs/2026-05-05-phase-4.5-chunk-2-design.md §3.3 + §3.4
-- Source plan: docs/superpowers/plans/2026-05-06-phase-4.5-chunk-2.md Sprint B Task 6
--
-- Goal: pivot the four CUSTOMER-LEG logistics RPCs from reading/writing
-- `purchase_orders` customer-leg fields onto `order_supplier_threads`.
--
-- Migrations 0049 (ADD COLUMNS on threads) and 0050 (backfill from POs) already
-- shipped the schema + data. This migration rewrites the four RPCs so the
-- runtime reads/writes thread-row state for the customer-leg flow (LP, RFD,
-- accept, reject, confirm date). The PO customer-leg columns still exist on
-- disk; Sprint C migration 0052 (IRREVERSIBLE, gated on Loo's at-apply
-- approval) will rename `purchase_orders.delivery_partner_id ->
-- procurement_partner_id` and DROP the four PO customer-leg timestamps.
--
-- Until 0052 applies, these new RPCs MUST NOT touch the legacy PO customer-leg
-- columns — they are the canonical writers of the new thread-row shape.
--
-- Scope decision (deviates from plan T6 "all 8 RPCs in 0051" but matches the
-- explicit recommendation in the Sprint B Task 6 prompt):
--   * In scope (4 RPCs, customer-leg, signature changes):
--       1. logistics_dispatch_customer_leg     — old (text,uuid,date,bool) -> new (uuid,uuid,date,bool)
--       2. logistics_partner_accept_rfd        — replaces 0045 partner_accept_dispatch(text,date)
--       3. logistics_partner_reject_rfd        — replaces 0045 partner_reject_dispatch(text,text)
--       4. logistics_resume_dispatch_from_waiting — replaces 0045 logistics_resume_from_waiting(uuid order_id) with a thread-scoped variant
--   * Out of scope (4 RPCs, procurement-leg, bodies unchanged in Sprint B):
--       logistics_assign_partner_and_dispatch — body still writes purchase_orders.delivery_partner_id, no change in Sprint B
--       lp_accept_inbound_delivery            — partner-role gate still reads purchase_orders.delivery_partner_id, no change
--       partner_reject_customer               — same; partner-role gate unchanged
--       logistics_receive_po_with_do          — partner-role gate unchanged; fully procurement-leg
--   The procurement-leg RPCs get parameter-renamed and column-rewritten in
--   Sprint C migration 0052 alongside the actual column rename. Including them
--   here would force a breaking arg rename ahead of the API caller updates in
--   Sprint B Task 7+8, leaving tests temporarily broken across multiple
--   commits. Keeping 0051 focused on the four customer-leg RPCs lets Sprint B
--   land in a single coherent commit (T6+T7+T9+T10).
--
-- Drop+Create rationale:
--   Postgres `CREATE OR REPLACE FUNCTION` cannot change a function's argument
--   types or names — it can only rewrite the body. All four RPCs change
--   signature (arg type or arg name), so we DROP the old signature first then
--   CREATE the new one. Per CLAUDE.md §14:
--     * The DROP targets the OLD signature only; the new signature is created
--       immediately after in the same transaction (single migration).
--     * Customer-leg RPCs aren't called by anything in production yet (Loo's
--       Phase 4.5 Chunk 1 manual verification still pending), so the
--       drop window does not affect end users.
--     * The Sprint B sequencing (T6 SQL -> T7 Hono -> T9 frontend -> T10
--       tests -> T11 verify) lands the API caller updates immediately after
--       this migration in the same Sprint B commit.
--
-- Caller migration plan (Sprint B Task 7):
--   * apps/api/src/routes/logistics/dispatch-customer-leg.ts -> swap p_po_id text
--     for p_thread_id uuid; route param shifts to thread or order resolution.
--   * apps/api/src/routes/partner/pickups.ts (acceptRfd/rejectRfd) -> body
--     {threadId} not {poId}; rpc names switch to logistics_partner_*_rfd.
--   * apps/api/src/routes/logistics/resume-dispatch.ts -> rpc name change to
--     logistics_resume_dispatch_from_waiting and arg p_thread_id (thread
--     scope, not order scope).
--
-- Audit / history side-effects unchanged from 0045: each RPC writes to
-- po_history (via thread.po_id when present), audit_log (with the original
-- 0045 actor / action format), and returns a jsonb result-object that the
-- Hono routes already destructure.
--
-- All RPCs: SECURITY DEFINER + set search_path = public, pg_temp.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. DROP old signatures (replaced below).
-- -----------------------------------------------------------------------------
-- These DROPs target the EXACT old signatures created in 0045. The new
-- signatures are created right after, in the same migration / transaction.
--
-- IMPORTANT: do NOT add `CASCADE`. If anything depends on these (it shouldn't,
-- per scope notes above), the migration must fail loudly so we can investigate.

DROP FUNCTION IF EXISTS public.partner_accept_dispatch(text, date);
DROP FUNCTION IF EXISTS public.partner_reject_dispatch(text, text);
DROP FUNCTION IF EXISTS public.logistics_dispatch_customer_leg(text, uuid, date, boolean);
DROP FUNCTION IF EXISTS public.logistics_resume_from_waiting(uuid);


-- -----------------------------------------------------------------------------
-- 1. logistics_dispatch_customer_leg(p_thread_id uuid, p_partner_id uuid,
--                                    p_confirm_delivery_date date,
--                                    p_force_dispatch boolean DEFAULT false)
-- -----------------------------------------------------------------------------
-- Customer-leg dispatch entry point. Logistics dispatches the customer
-- delivery for a single thread (was PO-scoped in 0045).
--
-- Modes:
--   * RFD path (force=false): write delivery_partner_id, confirm_delivery_date,
--     request_for_delivery_at on the THREAD ROW; reset accepted/rejected
--     stamps; thread.logistics_stage stays at 'ready_to_dispatch'. LP must
--     accept via logistics_partner_accept_rfd.
--   * Force path (force=true): same writes plus partner_accepted_at = now()
--     and thread.logistics_stage advances to 'dispatched'.
--
-- State guard: thread.logistics_stage must be 'ready_to_dispatch' (the only
-- valid source for dispatch). Callers cannot dispatch from any other stage.
--
-- Cross-tenant: logistics + principal only.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.logistics_dispatch_customer_leg(
  p_thread_id            uuid,
  p_partner_id           uuid,
  p_confirm_delivery_date date,
  p_force_dispatch       boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_thread       order_supplier_threads;
  v_role         app_role;
  v_actor        text;
  v_po_id        text;
BEGIN
  v_role := public.app_role();

  IF v_role NOT IN ('logistics', 'principal') THEN
    RAISE EXCEPTION 'forbidden: logistics or principal only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  -- Lock thread row.
  SELECT * INTO v_thread FROM order_supplier_threads WHERE id = p_thread_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'thread not found' USING ERRCODE = '42P01', DETAIL = 'thread_not_found';
  END IF;

  -- Validate partner exists.
  IF NOT EXISTS (SELECT 1 FROM delivery_partners WHERE id = p_partner_id) THEN
    RAISE EXCEPTION 'delivery_partner not found' USING ERRCODE = '42P01', DETAIL = 'partner_not_found';
  END IF;

  -- State guard: thread must be ready_to_dispatch.
  IF v_thread.logistics_stage IS DISTINCT FROM 'ready_to_dispatch' THEN
    RAISE EXCEPTION 'thread is not in ready_to_dispatch (got %)', v_thread.logistics_stage
      USING ERRCODE = '22023', DETAIL = 'wrong_stage';
  END IF;

  v_actor := COALESCE((SELECT name FROM app_users WHERE id = (SELECT auth.uid())), INITCAP(v_role::text));
  v_po_id := v_thread.po_id;  -- may be NULL on edge cases; po_history insert is gated below.

  IF p_force_dispatch THEN
    -- Force path: skip RFD, advance thread immediately to 'dispatched'.
    UPDATE order_supplier_threads
       SET delivery_partner_id    = p_partner_id,
           confirm_delivery_date  = p_confirm_delivery_date,
           partner_accepted_at    = now(),
           partner_rejected_at    = NULL,
           request_for_delivery_at = NULL,  -- not an RFD path
           logistics_stage        = 'dispatched',
           updated_at             = now()
     WHERE id = p_thread_id;

    IF v_po_id IS NOT NULL THEN
      INSERT INTO po_history (po_id, text, by_role)
      VALUES (v_po_id,
              format('Force-dispatched thread %s to LP %s on %s',
                     p_thread_id, p_partner_id, p_confirm_delivery_date),
              v_role);
    END IF;

    INSERT INTO audit_log (role, actor_text, action, ref)
    VALUES (v_role, v_actor,
            format('Force-dispatch thread %s to LP %s', p_thread_id, p_partner_id),
            COALESCE(v_po_id, p_thread_id::text));

    RETURN jsonb_build_object(
      'thread_id',             p_thread_id,
      'po_id',                 v_po_id,
      'mode',                  'force',
      'partner_id',            p_partner_id,
      'confirm_delivery_date', p_confirm_delivery_date,
      'logistics_stage',       'dispatched'
    );
  ELSE
    -- RFD path: set timestamp, thread stays at ready_to_dispatch.
    UPDATE order_supplier_threads
       SET delivery_partner_id    = p_partner_id,
           confirm_delivery_date  = p_confirm_delivery_date,
           request_for_delivery_at = now(),
           partner_accepted_at    = NULL,
           partner_rejected_at    = NULL,
           updated_at             = now()
     WHERE id = p_thread_id;

    IF v_po_id IS NOT NULL THEN
      INSERT INTO po_history (po_id, text, by_role)
      VALUES (v_po_id,
              format('RFD sent on thread %s to LP %s for %s',
                     p_thread_id, p_partner_id, p_confirm_delivery_date),
              v_role);
    END IF;

    INSERT INTO audit_log (role, actor_text, action, ref)
    VALUES (v_role, v_actor,
            format('RFD thread %s -> LP %s', p_thread_id, p_partner_id),
            COALESCE(v_po_id, p_thread_id::text));

    RETURN jsonb_build_object(
      'thread_id',             p_thread_id,
      'po_id',                 v_po_id,
      'mode',                  'rfd',
      'partner_id',            p_partner_id,
      'confirm_delivery_date', p_confirm_delivery_date,
      'rfd_sent_at',           now(),
      'logistics_stage',       v_thread.logistics_stage
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.logistics_dispatch_customer_leg(uuid, uuid, date, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.logistics_dispatch_customer_leg(uuid, uuid, date, boolean) TO authenticated;


-- -----------------------------------------------------------------------------
-- 2. logistics_partner_accept_rfd(p_thread_id uuid)
-- -----------------------------------------------------------------------------
-- LP accepts the customer-leg RFD on a single thread. Replaces 0045
-- partner_accept_dispatch(text, date) — the confirm_delivery_date arg is
-- removed because date setting now belongs to dispatch (the RFD already
-- carries it). Acceptance just stamps the timestamp + advances stage.
--
-- Validates: caller is partner role; thread.delivery_partner_id matches
-- caller's app_partner_id(); thread has request_for_delivery_at IS NOT NULL
-- AND partner_accepted_at IS NULL AND partner_rejected_at IS NULL.
--
-- Effect: stamp partner_accepted_at = now(); advance thread stage to
-- 'dispatched'. (No PO update — PO customer-leg fields are dead weight until
-- Sprint C migration 0052 drops them.)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.logistics_partner_accept_rfd(p_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_thread       order_supplier_threads;
  v_role         app_role;
  v_partner_id   uuid;
  v_actor        text;
BEGIN
  v_role := public.app_role();
  v_partner_id := public.app_partner_id();

  IF v_role IS DISTINCT FROM 'partner' THEN
    RAISE EXCEPTION 'forbidden: partner only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'partner JWT missing partner_id'
      USING ERRCODE = '42501', DETAIL = 'partner_id_missing';
  END IF;

  -- Lock thread row.
  SELECT * INTO v_thread FROM order_supplier_threads WHERE id = p_thread_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'thread not found' USING ERRCODE = '42P01', DETAIL = 'thread_not_found';
  END IF;

  -- Cross-tenant guard.
  IF v_thread.delivery_partner_id IS DISTINCT FROM v_partner_id THEN
    RAISE EXCEPTION 'forbidden: cross-partner accept'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  -- State guard: RFD must be pending.
  IF v_thread.request_for_delivery_at IS NULL
     OR v_thread.partner_accepted_at IS NOT NULL
     OR v_thread.partner_rejected_at IS NOT NULL THEN
    RAISE EXCEPTION 'RFD not pending (state invalid)'
      USING ERRCODE = '22023', DETAIL = 'rfd_not_pending';
  END IF;

  v_actor := COALESCE((SELECT name FROM app_users WHERE id = (SELECT auth.uid())), 'Partner');

  -- Mutate: stamp accepted; advance stage.
  UPDATE order_supplier_threads
     SET partner_accepted_at = now(),
         logistics_stage     = 'dispatched',
         updated_at          = now()
   WHERE id = p_thread_id;

  IF v_thread.po_id IS NOT NULL THEN
    INSERT INTO po_history (po_id, text, by_role)
    VALUES (v_thread.po_id,
            format('LP accepted RFD on thread %s — stage advanced to dispatched', p_thread_id),
            'partner');
  END IF;

  INSERT INTO audit_log (role, actor_text, action, ref)
  VALUES ('partner', v_actor,
          format('LP accepted RFD on thread %s', p_thread_id),
          COALESCE(v_thread.po_id, p_thread_id::text));

  RETURN jsonb_build_object(
    'thread_id',          p_thread_id,
    'po_id',              v_thread.po_id,
    'partner_accepted_at', now(),
    'logistics_stage',    'dispatched'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.logistics_partner_accept_rfd(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.logistics_partner_accept_rfd(uuid) TO authenticated;


-- -----------------------------------------------------------------------------
-- 3. logistics_partner_reject_rfd(p_thread_id uuid, p_reason text DEFAULT '')
-- -----------------------------------------------------------------------------
-- LP rejects the customer-leg RFD on a single thread. Replaces 0045
-- partner_reject_dispatch(text, text). p_reason is audit-only (matches 0045
-- F9: keep delivery_partner_id assigned so logistics can re-RFD or pick a
-- different LP via DispatchPartnerDialog without a re-assignment step).
--
-- Effect: clear request_for_delivery_at; stamp partner_rejected_at = now();
-- delivery_partner_id stays assigned; thread.logistics_stage stays at
-- 'ready_to_dispatch' so logistics can re-RFD.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.logistics_partner_reject_rfd(
  p_thread_id uuid,
  p_reason    text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_thread     order_supplier_threads;
  v_role       app_role;
  v_partner_id uuid;
  v_actor      text;
BEGIN
  v_role := public.app_role();
  v_partner_id := public.app_partner_id();

  IF v_role IS DISTINCT FROM 'partner' THEN
    RAISE EXCEPTION 'forbidden: partner only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'partner JWT missing partner_id'
      USING ERRCODE = '42501', DETAIL = 'partner_id_missing';
  END IF;

  SELECT * INTO v_thread FROM order_supplier_threads WHERE id = p_thread_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'thread not found' USING ERRCODE = '42P01', DETAIL = 'thread_not_found';
  END IF;

  IF v_thread.delivery_partner_id IS DISTINCT FROM v_partner_id THEN
    RAISE EXCEPTION 'forbidden: cross-partner reject'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  IF v_thread.request_for_delivery_at IS NULL
     OR v_thread.partner_accepted_at IS NOT NULL
     OR v_thread.partner_rejected_at IS NOT NULL THEN
    RAISE EXCEPTION 'RFD not pending'
      USING ERRCODE = '22023', DETAIL = 'rfd_not_pending';
  END IF;

  v_actor := COALESCE((SELECT name FROM app_users WHERE id = (SELECT auth.uid())), 'Partner');

  -- Mutate: clear RFD, stamp rejected. F9 invariant: keep delivery_partner_id.
  UPDATE order_supplier_threads
     SET request_for_delivery_at = NULL,
         partner_rejected_at     = now(),
         updated_at              = now()
   WHERE id = p_thread_id;

  IF v_thread.po_id IS NOT NULL THEN
    INSERT INTO po_history (po_id, text, by_role)
    VALUES (v_thread.po_id,
            format('LP rejected RFD on thread %s%s',
                   p_thread_id,
                   CASE WHEN p_reason <> '' THEN ': ' || p_reason ELSE '' END),
            'partner');
  END IF;

  INSERT INTO audit_log (role, actor_text, action, ref)
  VALUES ('partner', v_actor,
          format('LP rejected RFD on thread %s%s',
                 p_thread_id,
                 CASE WHEN p_reason <> '' THEN format(' (reason: %s)', p_reason) ELSE '' END),
          COALESCE(v_thread.po_id, p_thread_id::text));

  RETURN jsonb_build_object(
    'thread_id',           p_thread_id,
    'po_id',               v_thread.po_id,
    'partner_rejected_at', now(),
    'rfd_cleared',         true,
    'lp_kept_assigned',    true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.logistics_partner_reject_rfd(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.logistics_partner_reject_rfd(uuid, text) TO authenticated;


-- -----------------------------------------------------------------------------
-- 4. logistics_resume_dispatch_from_waiting(p_thread_id uuid)
-- -----------------------------------------------------------------------------
-- Replaces 0045 logistics_resume_from_waiting(p_order_id uuid).
--
-- Semantic shift (per spec §3.3 + plan T6):
--   OLD: order-scoped — flipped ALL waiting threads on the order back to
--        ready_to_dispatch, plus PO sup_status from at_warehouse_waiting ->
--        delivered.
--   NEW: thread-scoped — flips ONE waiting thread back to ready_to_dispatch
--        and (if all sibling threads on the same PO are no longer in
--        at_warehouse_waiting state) flips the PO sup_status. The PO state
--        flip preserves backwards behaviour for single-thread orders (the
--        Sofa-only case Chunk 1 supports today). Multi-thread orders with
--        mixed states will need the PO flip handled by callers.
--
-- Caller: logistics or principal only.
--
-- State guard: thread.logistics_stage must be 'waiting'.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.logistics_resume_dispatch_from_waiting(p_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_thread             order_supplier_threads;
  v_role               app_role;
  v_actor              text;
  v_remaining_waiting  int;
  v_po_rows_changed    int := 0;
  v_po_status_changed  boolean := false;
BEGIN
  v_role := public.app_role();

  IF v_role NOT IN ('logistics', 'principal') THEN
    RAISE EXCEPTION 'forbidden: logistics or principal only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  -- Lock thread row.
  SELECT * INTO v_thread FROM order_supplier_threads WHERE id = p_thread_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'thread not found' USING ERRCODE = '42P01', DETAIL = 'thread_not_found';
  END IF;

  -- State guard: must be waiting.
  IF v_thread.logistics_stage IS DISTINCT FROM 'waiting' THEN
    RAISE EXCEPTION 'thread is not in waiting (got %)', v_thread.logistics_stage
      USING ERRCODE = '22023', DETAIL = 'wrong_stage';
  END IF;

  v_actor := COALESCE((SELECT name FROM app_users WHERE id = (SELECT auth.uid())), INITCAP(v_role::text));

  -- Resume thread: waiting -> ready_to_dispatch.
  UPDATE order_supplier_threads
     SET logistics_stage = 'ready_to_dispatch',
         updated_at      = now()
   WHERE id = p_thread_id;

  -- Conditionally flip PO sup_status. We do this only when no sibling threads
  -- on the same PO remain in 'waiting' AND the PO is still
  -- 'at_warehouse_waiting'. This preserves the Chunk-1 single-thread Sofa-only
  -- behaviour without breaking future multi-thread orders.
  IF v_thread.po_id IS NOT NULL THEN
    SELECT count(*) INTO v_remaining_waiting
      FROM order_supplier_threads
     WHERE po_id = v_thread.po_id
       AND logistics_stage = 'waiting';

    IF v_remaining_waiting = 0 THEN
      UPDATE purchase_orders
         SET sup_status = 'delivered',
             updated_at = now()
       WHERE id = v_thread.po_id
         AND sup_status = 'at_warehouse_waiting';
      GET DIAGNOSTICS v_po_rows_changed = ROW_COUNT;
      v_po_status_changed := v_po_rows_changed > 0;
    END IF;

    INSERT INTO po_history (po_id, text, by_role)
    VALUES (v_thread.po_id,
            format('Resume from at_warehouse_waiting — thread %s back to ready_to_dispatch%s',
                   p_thread_id,
                   CASE WHEN v_po_status_changed
                        THEN '; PO sup_status -> delivered'
                        ELSE '' END),
            v_role);
  END IF;

  INSERT INTO order_history (order_id, text, by_role)
  VALUES (v_thread.order_id,
          format('Resume thread %s from waiting%s',
                 p_thread_id,
                 CASE WHEN v_po_status_changed
                      THEN ' (PO sup_status restored to delivered)'
                      ELSE '' END),
          v_role);

  INSERT INTO audit_log (role, actor_text, action, ref)
  VALUES (v_role, v_actor,
          format('Resume thread %s from waiting', p_thread_id),
          COALESCE(v_thread.po_id, p_thread_id::text));

  RETURN jsonb_build_object(
    'thread_id',         p_thread_id,
    'order_id',          v_thread.order_id,
    'po_id',             v_thread.po_id,
    'logistics_stage',   'ready_to_dispatch',
    'po_status_changed', v_po_status_changed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.logistics_resume_dispatch_from_waiting(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.logistics_resume_dispatch_from_waiting(uuid) TO authenticated;
