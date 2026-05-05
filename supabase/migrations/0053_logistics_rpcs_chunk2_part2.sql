-- =============================================================================
-- 0053_logistics_rpcs_chunk2_part2.sql -- Phase 4.5 Chunk 2 Sprint C Task 13.5
-- =============================================================================
-- Source spec: docs/superpowers/specs/2026-05-05-phase-4.5-chunk-2-design.md §3.4
-- Source plan: docs/superpowers/plans/2026-05-06-phase-4.5-chunk-2-resume.md
--              §Sprint C Task 13.5 (lines 148-174)
-- Authorization: docs/superpowers/plans/2026-05-06-phase-4.5-chunk-2-autonomous-run.md
--                §1 (Loo's in-conversation pre-approval, 2026-05-06).
--
-- Apply order:
--   * 0049 (ADD threads customer-leg cols) ............... already applied
--   * 0050 (backfill threads from PO) ..................... already applied
--   * 0051 (4 customer-leg RPCs onto threads) ............. already applied
--   * 0052 (DROP customer-leg cols + RENAME LP col) ....... applied IMMEDIATELY BEFORE this file (T14)
--   * 0053 (this file -- 4 procurement-leg RPCs) .......... applied IMMEDIATELY AFTER 0052 (T14)
--
-- Goal: 0052 renames purchase_orders.delivery_partner_id ->
-- purchase_orders.procurement_partner_id and drops the four customer-leg
-- timestamp columns. The four procurement-leg RPCs whose bodies still
-- reference the OLD column name (delivery_partner_id) would fail at
-- runtime once 0052 applies. This migration recreates those four RPC
-- bodies to read/write the new column name (procurement_partner_id).
--
-- Scope (6 RPCs + 1 trigger function, all CREATE OR REPLACE -- signatures
-- unchanged from 0045/0034/0046):
--   1. logistics_assign_partner_and_dispatch(text, uuid, text, text, text, uuid)
--      -- lifted from 0034:1000-1150; column refs swapped in 4 places
--   2. lp_accept_inbound_delivery(text)
--      -- lifted from 0045:195-255; column ref swapped in 1 place
--   3. partner_reject_customer(text, text)
--      -- lifted from 0045:267-341; column ref swapped in 1 place
--      -- (master plan / spec also references this RPC under the alias name
--       lp_reject_inbound_delivery -- the actual function name in the
--       database is partner_reject_customer per Chunk 1 v3 EXTEND -- see
--       docs/superpowers/specs/2026-05-05-phase-4.5-chunk-1-design.md §7.4
--       line 937 for the alias mapping)
--   4. logistics_receive_po_with_do(text, text, text, jsonb)
--      -- lifted from 0045:614-836; column ref swapped in 1 place
--   5. logistics_relocate_warehouse(text, uuid)
--      -- lifted from 0045:351-425; column refs swapped in 5 places
--      -- (read v_po.delivery_partner_id, UPDATE delivery_partner_id, jsonb
--      -- output `new_delivery_partner_id` -> `new_procurement_partner_id`,
--      -- and the `lp_reassigned` IS DISTINCT FROM check)
--      -- ADDED in T13.6 audit (audit found Hono caller at lp-inbound.ts:69)
--   6. enforce_partner_po_column_whitelist() (TRIGGER FUNCTION)
--      -- lifted from 0046:64-100; column references in IF guard re-aligned:
--      -- (a) NEW.delivery_partner_id -> NEW.procurement_partner_id
--      -- (b) NEW.request_for_delivery_at line REMOVED (column dropped by 0052;
--      --     LP no longer touches PO request_for_delivery_at -- 0051 RPCs now
--      --     write the customer-leg RFD on the THREAD ROW)
--      -- ADDED in T13.6 audit -- BEFORE UPDATE trigger fires on EVERY
--      -- purchase_orders UPDATE; missing rewrite would block ALL writes.
--
-- Out of scope (DEAD CODE -- runtime-safe to leave broken until cleanup sprint):
--   The following functions reference at-risk columns but are NOT called by
--   any current code path. They will fail at hypothetical CALL time post-0052
--   but no caller exists. Cleanup deferred to a future sprint as the carry-
--   forward `phase-4.5-chunk-2-stale-pre-0051-rpcs`:
--     * 0019:1425 logistics_assign_pickup_partner -- superseded by
--       logistics_assign_partner_and_dispatch (0034); apps/api/src/routes/
--       logistics/pos.ts:553 mentions it only in a code comment.
--     * 0003:76  po_issue -- superseded by Phase 4 v3 RPC suite.
--     * 0034:366 partner_confirm_receive -- already tracked as carry-forward
--       `phase-4.5-cleanup-old-partner-confirm-receive` (CLAUDE.md §17).
--     * 0045:30  partner_accept_dispatch -- superseded by 0051
--       logistics_partner_accept_rfd; comment in
--       packages/shared/src/schemas/logistics.ts:307 says "now-dropped".
--     * 0045:117 partner_reject_dispatch -- superseded by 0051
--       logistics_partner_reject_rfd; comment in logistics.ts:325 says
--       "now-dropped". Static SQL audit test (codex-fixes.test.ts) reads
--       the migration text but never invokes the RPC at runtime.
--     * 0034:1171 logistics_attach_pod_do -- listed in
--       packages/shared/src/sops.ts SOP map for `dispatched -> delivered`
--       transition, but the corresponding Hono route + FE button have not
--       been wired yet (Phase 7 work). Will be rewritten when wired.
--
-- Diff vs 0034/0045 source bodies:
--   * Every literal occurrence of `delivery_partner_id` is replaced with
--     `procurement_partner_id` (column refs in SELECT/UPDATE/comparison,
--     jsonb output keys, comment text, RAISE EXCEPTION DETAIL strings).
--   * Function argument names + types + return type + LANGUAGE +
--     SECURITY DEFINER + search_path are PRESERVED VERBATIM from the
--     source migration's CREATE statements -- callers (Hono, tests) do
--     not need to change call shapes.
--   * REVOKE / GRANT shape preserved verbatim from the source migrations.
--
-- All RPCs: SECURITY DEFINER, search_path = public, pg_temp.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. logistics_assign_partner_and_dispatch
-- -----------------------------------------------------------------------------
-- Lifted from 0034:1000-1150. Body preserves original lowercase plpgsql
-- style of 0034. Column-reference swaps:
--   * 0034:1077 comment text
--   * 0034:1081 outsource UPDATE clause
--   * 0034:1091 partner UPDATE clause
--   * 0034:1142 return jsonb key
-- -----------------------------------------------------------------------------
create or replace function public.logistics_assign_partner_and_dispatch(
  p_po_id                 text,
  p_partner_id            uuid    default null,
  p_outsource_name        text    default null,
  p_outsource_contact     text    default null,
  p_outsource_zones       text    default null,
  p_warehouse_override_id uuid    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_po              purchase_orders;
  v_role            app_role;
  v_actor           text;
  v_partner_name    text;
  v_warehouse_name  text;
  v_outsource       boolean;
begin
  v_role := public.app_role();

  if v_role is distinct from 'logistics' then
    raise exception 'forbidden: logistics only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  -- 2. XOR validation: exactly one of partner_id or outsource_name MUST be set.
  if (p_partner_id is null) = (p_outsource_name is null) then
    raise exception 'exactly one of partner_id or outsource_name must be provided'
      using errcode = '22023', detail = 'partner_or_outsource_xor';
  end if;

  v_outsource := p_partner_id is null;

  -- Outsource-specific validation.
  if v_outsource then
    if length(btrim(coalesce(p_outsource_name, ''))) = 0 then
      raise exception 'outsource name cannot be empty'
        using errcode = '22023', detail = 'outsource_name_empty';
    end if;
    if length(btrim(coalesce(p_outsource_contact, ''))) = 0 then
      raise exception 'outsource contact is required'
        using errcode = '22023', detail = 'outsource_contact_required';
    end if;
  end if;

  -- 3. Lock PO row (Codex Bug 7 race guard -- the assign step must observe
  --    a stable PO state to avoid double-assignment if two logistics users
  --    click simultaneously).
  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO not found'
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  -- Validate optional warehouse override.
  if p_warehouse_override_id is not null then
    if not exists (select 1 from warehouses where id = p_warehouse_override_id) then
      raise exception 'warehouse not found'
        using errcode = '42P01', detail = 'warehouse_not_found';
    end if;
  end if;

  -- Validate registered partner.
  if not v_outsource then
    select name into v_partner_name from delivery_partners where id = p_partner_id;
    if v_partner_name is null then
      raise exception 'delivery partner not found'
        using errcode = '42P01', detail = 'partner_not_found';
    end if;
  end if;

  v_actor := coalesce((select name from app_users where id = (select auth.uid())), 'Logistics');

  -- 4. Mutate PO. The 0030 CHECK po_outsource_xor_partner enforces:
  --    (outsource_partner_name is null) OR (procurement_partner_id is null).
  --    We always clear the OTHER side to keep that invariant.
  if v_outsource then
    update purchase_orders
       set procurement_partner_id     = null,
           outsource_partner_name     = btrim(p_outsource_name),
           outsource_partner_contact  = btrim(p_outsource_contact),
           outsource_partner_zones    = nullif(btrim(coalesce(p_outsource_zones, '')), ''),
           sup_status                 = 'pickup_assigned',
           warehouse_id               = coalesce(p_warehouse_override_id, warehouse_id),
           updated_at                 = now()
     where id = p_po_id;
  else
    update purchase_orders
       set procurement_partner_id     = p_partner_id,
           outsource_partner_name     = null,
           outsource_partner_contact  = null,
           outsource_partner_zones    = null,
           sup_status                 = 'pickup_assigned',
           warehouse_id               = coalesce(p_warehouse_override_id, warehouse_id),
           updated_at                 = now()
     where id = p_po_id;
  end if;

  if p_warehouse_override_id is not null then
    select name into v_warehouse_name from warehouses where id = p_warehouse_override_id;
  end if;

  -- 5. po_history (kind captured in text per existing po_history shape -- the
  --    table doesn't have a `kind` column).
  insert into po_history (po_id, text, by_role)
  values (
    p_po_id,
    case when v_outsource
         then format('Partner assigned (outsource: %s)%s',
                     btrim(p_outsource_name),
                     case when p_warehouse_override_id is not null
                          then ' to ' || coalesce(v_warehouse_name, 'warehouse')
                          else '' end)
         else format('Partner assigned: %s%s',
                     v_partner_name,
                     case when p_warehouse_override_id is not null
                          then ' to ' || coalesce(v_warehouse_name, 'warehouse')
                          else '' end)
    end,
    'logistics'
  );

  -- 6. audit_log -- action prefix tags this as the new v3 RPC.
  insert into audit_log (role, actor_text, action, ref)
  values ('logistics', v_actor,
          format('Assigned partner-and-dispatch %s -- %s%s',
                 p_po_id,
                 case when v_outsource
                      then 'outsource: ' || btrim(p_outsource_name)
                      else v_partner_name end,
                 case when p_warehouse_override_id is not null
                      then ' (wh: ' || coalesce(v_warehouse_name, 'override') || ')'
                      else '' end),
          p_po_id);

  return jsonb_build_object(
    'po_id',                  p_po_id,
    'sup_status',             'pickup_assigned',
    'outsource',              v_outsource,
    'procurement_partner_id', case when v_outsource then null else p_partner_id end,
    'outsource_partner_name', case when v_outsource then btrim(p_outsource_name) else null end,
    'warehouse_id',           coalesce(p_warehouse_override_id, v_po.warehouse_id)
  );
end;
$$;

revoke all on function public.logistics_assign_partner_and_dispatch(text, uuid, text, text, text, uuid) from public;
grant execute on function public.logistics_assign_partner_and_dispatch(text, uuid, text, text, text, uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 2. lp_accept_inbound_delivery(p_po_id text)
-- -----------------------------------------------------------------------------
-- Lifted from 0045:195-255. Body preserves original uppercase plpgsql style
-- of 0045. Column-reference swap:
--   * 0045:219 partner-role cross-tenant gate
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lp_accept_inbound_delivery(p_po_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_po         purchase_orders;
  v_role       app_role;
  v_partner_id uuid;
  v_actor      text;
BEGIN
  v_role := public.app_role();
  v_partner_id := public.app_partner_id();

  IF v_role NOT IN ('partner', 'logistics', 'principal') THEN
    RAISE EXCEPTION 'forbidden: partner or logistics only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found' USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;

  -- Cross-tenant guard for partner caller only.
  IF v_role = 'partner' AND v_po.procurement_partner_id IS DISTINCT FROM v_partner_id THEN
    RAISE EXCEPTION 'forbidden: cross-partner accept'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  -- State guard: must be in pre-flight ready_confirm_sent.
  IF v_po.sup_status IS DISTINCT FROM 'ready_confirm_sent' THEN
    RAISE EXCEPTION 'PO not in ready_confirm_sent state (got %)', v_po.sup_status
      USING ERRCODE = '22023', DETAIL = 'wrong_sup_status';
  END IF;

  v_actor := COALESCE((SELECT name FROM app_users WHERE id = (SELECT auth.uid())), INITCAP(v_role::text));

  -- Mutate PO ONLY. Threads stay at awaiting_logistics_action until Receive.
  UPDATE purchase_orders
     SET sup_status            = 'partner_confirmed',
         partner_confirmed_at  = now(),
         updated_at            = now()
   WHERE id = p_po_id;

  INSERT INTO po_history (po_id, text, by_role)
  VALUES (p_po_id, 'LP accepted inbound pre-flight (no thread change yet)', v_role);

  INSERT INTO audit_log (role, actor_text, action, ref)
  VALUES (v_role, v_actor,
          format('LP accepted inbound pre-flight for PO %s', p_po_id), p_po_id);

  RETURN jsonb_build_object(
    'po_id',                p_po_id,
    'sup_status',           'partner_confirmed',
    'partner_confirmed_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lp_accept_inbound_delivery(text) FROM public;
GRANT EXECUTE ON FUNCTION public.lp_accept_inbound_delivery(text) TO authenticated;


-- -----------------------------------------------------------------------------
-- 3. partner_reject_customer(p_po_id text, p_reason text DEFAULT '')
-- -----------------------------------------------------------------------------
-- Spec / master plan also reference this RPC under the alias name
-- `lp_reject_inbound_delivery` -- the actual function name in the database
-- is `partner_reject_customer` per Chunk 1 v3 EXTEND of 0034:467 (see
-- docs/superpowers/specs/2026-05-05-phase-4.5-chunk-1-design.md §7.4 line 937).
--
-- Lifted from 0045:267-341. Body preserves original uppercase plpgsql style
-- of 0045. Column-reference swap:
--   * 0045:294 partner-role cross-tenant gate
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.partner_reject_customer(
  p_po_id  text,
  p_reason text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_po         purchase_orders;
  v_role       app_role;
  v_partner_id uuid;
  v_actor      text;
  v_rejection  jsonb;
BEGIN
  v_role := public.app_role();
  v_partner_id := public.app_partner_id();

  IF v_role NOT IN ('partner', 'logistics', 'principal') THEN
    RAISE EXCEPTION 'forbidden: partner or logistics only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found' USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;

  IF v_role = 'partner' AND v_po.procurement_partner_id IS DISTINCT FROM v_partner_id THEN
    RAISE EXCEPTION 'forbidden: cross-partner reject'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  IF v_po.sup_status NOT IN ('ready_confirm_sent', 'partner_confirmed') THEN
    RAISE EXCEPTION 'PO not in pre-flight state (got %)', v_po.sup_status
      USING ERRCODE = '22023', DETAIL = 'wrong_sup_status';
  END IF;

  v_actor := COALESCE((SELECT name FROM app_users WHERE id = (SELECT auth.uid())), INITCAP(v_role::text));

  v_rejection := jsonb_build_object(
    'at',                  now(),
    'rejected_by',         'lp',
    'original_warehouse_id', v_po.warehouse_id
  );
  IF p_reason <> '' THEN
    v_rejection := v_rejection || jsonb_build_object('reason_audit_only', p_reason);
  END IF;

  UPDATE purchase_orders
     SET sup_status         = 'customer_rejected',
         customer_rejection = v_rejection,
         updated_at         = now()
   WHERE id = p_po_id;

  INSERT INTO po_history (po_id, text, by_role)
  VALUES (p_po_id,
          format('LP rejected inbound%s', CASE WHEN p_reason <> '' THEN ': ' || p_reason ELSE '' END),
          v_role);

  INSERT INTO audit_log (role, actor_text, action, ref)
  VALUES (v_role, v_actor,
          format('LP rejected inbound on PO %s%s', p_po_id,
                 CASE WHEN p_reason <> '' THEN format(' (reason: %s)', p_reason) ELSE '' END),
          p_po_id);

  RETURN jsonb_build_object(
    'po_id',      p_po_id,
    'sup_status', 'customer_rejected',
    'rejected_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.partner_reject_customer(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.partner_reject_customer(text, text) TO authenticated;


-- -----------------------------------------------------------------------------
-- 4. logistics_receive_po_with_do(p_po_id text, p_do_file_path text,
--                                 p_do_number text, p_lines jsonb)
-- -----------------------------------------------------------------------------
-- Lifted from 0045:614-836. Body preserves original uppercase plpgsql style
-- of 0045. Column-reference swap:
--   * 0045:671 partner-role cross-tenant gate (inside v_role = 'partner' branch)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.logistics_receive_po_with_do(
  p_po_id        text,
  p_do_file_path text,
  p_do_number    text,
  p_lines        jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_po                 purchase_orders;
  v_role               app_role;
  v_partner_id         uuid;
  v_actor              text;
  v_line               jsonb;
  v_sku                text;
  v_received_qty       int;
  v_existing_line      purchase_order_lines;
  v_delta              int;
  v_outstanding        int;
  v_lines_updated      int := 0;
  v_threads_advanced   int := 0;
  v_thread             record;
  v_reserve            record;
  v_uid                uuid;
  v_was_relocated      boolean;
  v_target_thread_stage logistics_stage;
  v_target_sup_status  po_sup_status;
BEGIN
  v_role := public.app_role();
  v_partner_id := public.app_partner_id();
  v_uid := (SELECT auth.uid());

  -- Role gate: logistics OR partner.
  IF v_role NOT IN ('logistics', 'partner') THEN
    RAISE EXCEPTION 'forbidden: logistics or partner only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  -- Validate inputs.
  IF p_do_file_path IS NULL OR length(btrim(p_do_file_path)) = 0 THEN
    RAISE EXCEPTION 'DO file path is required' USING ERRCODE = '22023', DETAIL = 'do_file_path_required';
  END IF;
  IF p_do_number IS NULL OR length(btrim(p_do_number)) < 3 THEN
    RAISE EXCEPTION 'DO number must be at least 3 characters' USING ERRCODE = '22023', DETAIL = 'do_number_too_short';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'lines must be a non-empty array' USING ERRCODE = '22023', DETAIL = 'lines_empty';
  END IF;

  -- Lock PO row.
  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found' USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;

  IF v_role = 'partner' THEN
    IF v_partner_id IS NULL OR v_po.procurement_partner_id IS DISTINCT FROM v_partner_id THEN
      RAISE EXCEPTION 'forbidden: cross-partner receive' USING ERRCODE = '42501', DETAIL = 'forbidden';
    END IF;
  END IF;

  IF v_po.status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'PO is not open (status=%)', v_po.status USING ERRCODE = '22023', DETAIL = 'po_not_open';
  END IF;

  -- v3 BRANCH: detect Sofa Reject + Relocate path.
  v_was_relocated := (v_po.sup_status = 'relocated');

  v_actor := COALESCE((SELECT name FROM app_users WHERE id = v_uid), INITCAP(v_role::text));

  -- Apply per-line received_qty + bump stock_balances (unchanged from 0034:806-927).
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_sku := v_line->>'sku';
    v_received_qty := nullif(v_line->>'received_qty', '')::int;

    IF v_sku IS NULL OR v_received_qty IS NULL OR v_received_qty < 0 THEN
      RAISE EXCEPTION 'invalid line: sku=%, received_qty=%', v_sku, v_received_qty
        USING ERRCODE = '22023', DETAIL = 'invalid_line';
    END IF;

    SELECT * INTO v_existing_line FROM purchase_order_lines
     WHERE po_id = p_po_id AND sku = v_sku FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PO line not found for sku=%', v_sku USING ERRCODE = '42P01', DETAIL = 'po_line_not_found';
    END IF;

    IF v_received_qty > v_existing_line.qty THEN
      RAISE EXCEPTION 'over-received: % > ordered %', v_received_qty, v_existing_line.qty
        USING ERRCODE = 'P0001', DETAIL = 'over_received';
    END IF;

    v_delta := v_received_qty - v_existing_line.received_qty;
    IF v_delta < 0 THEN
      RAISE EXCEPTION 'received_qty must be >= currently received (%)', v_existing_line.received_qty
        USING ERRCODE = 'P0001', DETAIL = 'received_qty_decrease';
    END IF;

    UPDATE purchase_order_lines SET received_qty = v_received_qty
     WHERE po_id = p_po_id AND sku = v_sku;

    IF v_delta > 0 THEN
      INSERT INTO stock_balances (sku, warehouse_id, qty)
        VALUES (v_sku, v_po.warehouse_id, v_delta)
        ON CONFLICT (sku, warehouse_id)
        DO UPDATE SET qty = stock_balances.qty + v_delta, updated_at = now();

      INSERT INTO stock_movements (sku, warehouse_id, qty, kind, ref, by_role, by_user_id)
      VALUES (v_sku, v_po.warehouse_id, v_delta, 'in', p_po_id, v_role, v_uid);

      v_lines_updated := v_lines_updated + 1;
    END IF;
  END LOOP;

  -- Advance threads + reserve. v3 BRANCH on v_was_relocated:
  FOR v_thread IN
    SELECT * FROM order_supplier_threads
     WHERE po_id = p_po_id AND logistics_stage = 'awaiting_logistics_action'
  LOOP
    -- Determine target thread stage per branch.
    IF v_was_relocated THEN
      v_target_thread_stage := 'waiting';  -- Sofa Reject path
    ELSE
      v_target_thread_stage := CASE WHEN v_thread.sop_name = 'SOFA_SPECIAL'
                                    THEN 'dispatched'
                                    ELSE 'ready_to_dispatch'
                               END;
    END IF;

    UPDATE order_supplier_threads
       SET logistics_stage = v_target_thread_stage,
           warehouse_id    = v_po.warehouse_id,
           reserved_at     = now(),
           updated_at      = now()
     WHERE id = v_thread.id;

    v_threads_advanced := v_threads_advanced + 1;

    -- Reserve stock for thread's slice (unchanged from 0034:893-927).
    FOR v_reserve IN
      SELECT ol.sku AS sku, ol.qty AS qty
        FROM order_lines ol
        JOIN product_skus ps ON ps.sku = ol.sku
        JOIN product_models pm ON pm.id = ps.model_id
       WHERE ol.order_id = v_thread.order_id
         AND ps.supplier_id = v_thread.supplier_id
         AND pm.category::text = v_thread.category
    LOOP
      BEGIN
        UPDATE stock_balances
           SET reserved   = reserved + v_reserve.qty, updated_at = now()
         WHERE sku = v_reserve.sku AND warehouse_id = v_po.warehouse_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'no stock_balances row for sku=% wh=%', v_reserve.sku, v_po.warehouse_id
            USING ERRCODE = 'P0001', DETAIL = 'insufficient_stock_for_reserve';
        END IF;
      EXCEPTION
        WHEN check_violation THEN
          RAISE EXCEPTION 'cannot reserve sku=% at wh=% (qty < reserved + %)',
                          v_reserve.sku, v_po.warehouse_id, v_reserve.qty
            USING ERRCODE = 'P0001', DETAIL = 'insufficient_stock_for_reserve';
      END;
    END LOOP;
  END LOOP;

  -- Determine target PO sup_status per branch.
  SELECT count(*) INTO v_outstanding
    FROM purchase_order_lines WHERE po_id = p_po_id AND received_qty < qty;

  IF v_outstanding = 0 THEN
    -- Full receive. Branch on relocated flag.
    IF v_was_relocated THEN
      v_target_sup_status := 'at_warehouse_waiting';  -- Codex F3: new value from 0043
    ELSE
      v_target_sup_status := 'delivered';  -- Codex F3: existing valid value (0034:938)
    END IF;

    UPDATE purchase_orders
       SET status         = 'received',
           sup_status     = v_target_sup_status,
           do_file_path   = p_do_file_path,
           do_uploaded_at = now(),
           do_uploaded_by = v_uid,
           updated_at     = now()
     WHERE id = p_po_id;
  ELSE
    -- Partial receive: persist DO + sup_status remains current.
    UPDATE purchase_orders
       SET do_file_path   = p_do_file_path,
           do_uploaded_at = now(),
           do_uploaded_by = v_uid,
           updated_at     = now()
     WHERE id = p_po_id;
  END IF;

  -- Audit + history.
  INSERT INTO po_history (po_id, text, by_role)
  VALUES (p_po_id,
          format('Received with DO %s (%s path) — %s line(s), %s thread(s)',
                 btrim(p_do_number),
                 CASE WHEN v_was_relocated THEN 'relocated→at_warehouse_waiting' ELSE 'normal→delivered' END,
                 v_lines_updated, v_threads_advanced),
          v_role);

  INSERT INTO audit_log (role, actor_text, action, ref)
  VALUES (v_role, v_actor,
          format('Received PO %s with DO %s', p_po_id, btrim(p_do_number)), p_po_id);

  RETURN jsonb_build_object(
    'po_id',             p_po_id,
    'do_file_path',      p_do_file_path,
    'do_number',         btrim(p_do_number),
    'lines_updated',     v_lines_updated,
    'threads_advanced',  v_threads_advanced,
    'po_status',         (SELECT status FROM purchase_orders WHERE id = p_po_id),
    'sup_status',        (SELECT sup_status FROM purchase_orders WHERE id = p_po_id),
    'was_relocated',     v_was_relocated
  );
END;
$$;

REVOKE ALL ON FUNCTION public.logistics_receive_po_with_do(text, text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.logistics_receive_po_with_do(text, text, text, jsonb) TO authenticated;


-- -----------------------------------------------------------------------------
-- 5. logistics_relocate_warehouse(p_po_id text, p_new_warehouse_id uuid)
-- -----------------------------------------------------------------------------
-- Lifted from 0045:351-425 (which itself EXTENDED 0034:584). Body preserves
-- original uppercase plpgsql style of 0045. Column-reference swaps:
--   * 0045:391 read of v_po.delivery_partner_id (COALESCE)
--   * 0045:398 UPDATE purchase_orders SET delivery_partner_id
--   * 0045:404 po_history format string "delivery_partner_id %s"
--   * 0045:406 IS DISTINCT FROM check (CASE WHEN ... THEN 'reassigned')
--   * 0045:418 jsonb output key 'new_delivery_partner_id'
--   * 0045:419 IS DISTINCT FROM check (lp_reassigned flag)
--   * Local variable name v_new_delivery_partner -> v_new_procurement_partner
--     (mirrors the column rename for readability). The variable is internal
--     only -- callers do not see the variable name.
-- Active callers verified during T13.6 audit:
--   * apps/api/src/routes/logistics/lp-inbound.ts:69 (Hono route handler)
--   * apps/web/src/pages/logistics/components/WarehouseRelocateDialog.tsx
--   * apps/api/src/routes/logistics/lp-inbound.test.ts:100 (integration test)
--   * apps/api/src/routes/logistics/codex-fixes.test.ts:199 (static SQL audit)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.logistics_relocate_warehouse(
  p_po_id            text,
  p_new_warehouse_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_po                       purchase_orders;
  v_role                     app_role;
  v_actor                    text;
  v_new_owning_partner       uuid;
  v_new_procurement_partner  uuid;
BEGIN
  v_role := public.app_role();

  IF v_role NOT IN ('logistics', 'principal') THEN
    RAISE EXCEPTION 'forbidden: logistics or principal only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found' USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;

  -- State guard: pre-receive only.
  IF v_po.sup_status IS DISTINCT FROM 'customer_rejected' THEN
    RAISE EXCEPTION 'PO not in customer_rejected state (got %)', v_po.sup_status
      USING ERRCODE = '22023', DETAIL = 'wrong_sup_status';
  END IF;

  -- Lookup new wh owning partner.
  SELECT owning_partner_id INTO v_new_owning_partner
    FROM warehouses WHERE id = p_new_warehouse_id;
  IF v_new_owning_partner IS NULL AND NOT EXISTS (SELECT 1 FROM warehouses WHERE id = p_new_warehouse_id) THEN
    RAISE EXCEPTION 'warehouse not found' USING ERRCODE = '42P01', DETAIL = 'warehouse_not_found';
  END IF;

  -- F9 invariant: keep current procurement_partner_id when new wh is own_wh (NULL owning_partner).
  v_new_procurement_partner := COALESCE(v_new_owning_partner, v_po.procurement_partner_id);

  v_actor := COALESCE((SELECT name FROM app_users WHERE id = (SELECT auth.uid())), INITCAP(v_role::text));

  UPDATE purchase_orders
     SET warehouse_id            = p_new_warehouse_id,
         sup_status              = 'relocated',
         procurement_partner_id  = v_new_procurement_partner,
         updated_at              = now()
   WHERE id = p_po_id;

  INSERT INTO po_history (po_id, text, by_role)
  VALUES (p_po_id,
          format('Logistics relocated PO to wh %s (procurement_partner_id %s)',
                 p_new_warehouse_id,
                 CASE WHEN v_new_procurement_partner IS DISTINCT FROM v_po.procurement_partner_id
                      THEN 'reassigned' ELSE 'kept' END),
          v_role);

  INSERT INTO audit_log (role, actor_text, action, ref)
  VALUES (v_role, v_actor,
          format('Relocate PO %s -> wh %s', p_po_id, p_new_warehouse_id), p_po_id);

  RETURN jsonb_build_object(
    'po_id',                       p_po_id,
    'sup_status',                  'relocated',
    'new_warehouse_id',            p_new_warehouse_id,
    'new_procurement_partner_id',  v_new_procurement_partner,
    'lp_reassigned',               v_new_procurement_partner IS DISTINCT FROM v_po.procurement_partner_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.logistics_relocate_warehouse(text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.logistics_relocate_warehouse(text, uuid) TO authenticated;


-- -----------------------------------------------------------------------------
-- 6. enforce_partner_po_column_whitelist() -- TRIGGER FUNCTION
-- -----------------------------------------------------------------------------
-- Lifted from 0046:64-100. BEFORE UPDATE trigger on purchase_orders --
-- attached via partner_po_update_whitelist_trg in 0046:103. The CREATE
-- TRIGGER itself stays bound by function NAME (not OID), so CREATE OR
-- REPLACE preserves the trigger binding -- no DROP TRIGGER + CREATE TRIGGER
-- needed here.
--
-- Body diff vs 0046:
--   * Line 0046:79: NEW.delivery_partner_id IS DISTINCT FROM OLD.delivery_partner_id
--                   -> NEW.procurement_partner_id IS DISTINCT FROM OLD.procurement_partner_id
--   * Line 0046:92: (NEW.request_for_delivery_at IS DISTINCT FROM OLD.request_for_delivery_at)
--                   REMOVED -- column dropped by 0052; the customer-leg RFD
--                   moved to order_supplier_threads in Sprint A/B (0049+0051),
--                   and the LP write path on threads is gated by the separate
--                   ost_partner_write policy + thread-level whitelist
--                   (deferred carry-forward, not Chunk 2 scope).
--   * RAISE EXCEPTION error string updated to match the new whitelist
--     (no longer mentions request_for_delivery_at).
--
-- Why this matters: this trigger fires on EVERY UPDATE to purchase_orders.
-- Without this rewrite, ALL UPDATEs (logistics, finance, principal --
-- everyone except the LP role short-circuit at line 1) would fail at trigger
-- fire time because Postgres can no longer resolve NEW.delivery_partner_id
-- (renamed) and NEW.request_for_delivery_at (dropped) against the post-0052
-- table schema.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_partner_po_column_whitelist()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  -- Only enforce for LP role; internal roles bypass.
  IF (select public.app_role()) <> 'partner' THEN
    RETURN NEW;
  END IF;

  -- Reject any change to non-whitelisted column.
  IF (NEW.id                       IS DISTINCT FROM OLD.id)                       OR
     (NEW.dl                       IS DISTINCT FROM OLD.dl)                       OR
     (NEW.supplier_id              IS DISTINCT FROM OLD.supplier_id)              OR
     (NEW.warehouse_id             IS DISTINCT FROM OLD.warehouse_id)             OR
     (NEW.status                   IS DISTINCT FROM OLD.status)                   OR
     (NEW.sup_status               IS DISTINCT FROM OLD.sup_status)               OR
     (NEW.procurement_partner_id   IS DISTINCT FROM OLD.procurement_partner_id)   OR
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
     (NEW.outsource_partner_zones  IS DISTINCT FROM OLD.outsource_partner_zones)
  THEN
    RAISE EXCEPTION 'LP can only update customer_rejection (RFD-on-PO disabled in Chunk 2; customer-leg RFD lives on order_supplier_threads)'
      USING ERRCODE = '42501', DETAIL = 'lp_column_whitelist_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- The BEFORE UPDATE trigger partner_po_update_whitelist_trg from 0046:103
-- binds by FUNCTION NAME, so CREATE OR REPLACE FUNCTION above preserves the
-- existing binding -- no DROP/CREATE TRIGGER needed.
