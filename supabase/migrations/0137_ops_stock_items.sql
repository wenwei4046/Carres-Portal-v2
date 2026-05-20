-- =============================================================================
-- 0137_ops_stock_items.sql — Per-unit stock register (Phase A step 5)
-- 2026-05-20 (Loo authorised in conversation per CLAUDE.md §7).
--
-- WHY: Carres Klang warehouse needs unit-level tracking to avoid duplicate
-- reservations + lost units. Each mattress/bedframe gets its own row in
-- ops_stock_items with a status (free/reserved/sold/transferred), a
-- condition (new/exhibition/old/damaged), a current customer ref + a
-- ref_history array preserving every prior reservation forever (warehouse
-- label reconciliation). The existing aggregate stock_balances stays as
-- the dashboard truth — rebuilt from ops_stock_items via a rollup RPC on
-- takeout (the only action that changes physical count).
--
-- SCOPE (Loo Q4=a): only Carres Klang for V1. NETS / TSDD / AL / HOUZS
-- continue aggregate-only. Schema is wh-parameterised; future flip-switch
-- to other warehouses is a config change, not a rewrite.
--
-- 5 actions exposed as SECURITY DEFINER RPCs:
--   ops_stock_reserve(sku, ref, condition?, wh?) → uuid (item id)
--   ops_stock_release(item_id)                   → uuid
--   ops_stock_reassign(item_id, new_ref)         → uuid
--   ops_stock_takeout(item_id)                   → uuid (calls rollup)
--   ops_stock_flag_repair(item_id, flag)         → uuid
--
-- Per-action audit lives in audit_log; cross-cutting activity-log table
-- comes Phase B.
-- =============================================================================

-- 1. Table
CREATE TABLE IF NOT EXISTS ops_stock_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku           text NOT NULL,
  warehouse_id  uuid NOT NULL REFERENCES warehouses(id),
  condition     text NOT NULL DEFAULT 'new'
                CHECK (condition IN ('new','exhibition','old','damaged')),
  status        text NOT NULL DEFAULT 'free'
                CHECK (status IN ('free','reserved','sold','transferred')),
  reserved_ref  text,
  ref_history   text[] NOT NULL DEFAULT '{}'::text[],
  needs_repair  boolean NOT NULL DEFAULT false,
  supplier      text,
  po_no         text,
  source_ref    text,
  date_in       date DEFAULT current_date,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ops_stock_items_sku_idx       ON ops_stock_items(sku);
CREATE INDEX IF NOT EXISTS ops_stock_items_wh_idx        ON ops_stock_items(warehouse_id);
CREATE INDEX IF NOT EXISTS ops_stock_items_status_idx    ON ops_stock_items(status);
CREATE INDEX IF NOT EXISTS ops_stock_items_condition_idx ON ops_stock_items(condition);
CREATE INDEX IF NOT EXISTS ops_stock_items_repair_idx    ON ops_stock_items(needs_repair);
CREATE INDEX IF NOT EXISTS ops_stock_items_refhist_idx   ON ops_stock_items USING gin (ref_history);

ALTER TABLE ops_stock_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_stock_items_read_internal  ON ops_stock_items;
DROP POLICY IF EXISTS ops_stock_items_write_internal ON ops_stock_items;

CREATE POLICY ops_stock_items_read_internal
  ON ops_stock_items FOR SELECT
  USING ((SELECT public.is_internal()));

CREATE POLICY ops_stock_items_write_internal
  ON ops_stock_items FOR ALL
  USING ((SELECT public.is_internal()))
  WITH CHECK ((SELECT public.is_internal()));

COMMENT ON TABLE  ops_stock_items IS
  'Per-physical-unit stock register. Each row = one mattress/bedframe/sofa unit at a Carres-operated warehouse. Carres Klang only for V1.';
COMMENT ON COLUMN ops_stock_items.ref_history IS
  'Every PRIOR reserved_ref kept forever (append on release/reassign). GIN-indexed so "find this unit by the old sticker" stays fast.';

-- =============================================================================
-- 2. Rollup RPC — rebuild stock_balances (qty + reserved) from
-- ops_stock_items for a given warehouse. Called by ops_stock_takeout; can
-- also be called manually as `select ops_rollup_stock_balances('<wh-uuid>');`
-- =============================================================================
CREATE OR REPLACE FUNCTION public.ops_rollup_stock_balances(p_wh uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO stock_balances (sku, warehouse_id, qty, reserved)
  SELECT
    sku,
    warehouse_id,
    count(*)::int                                   AS qty,
    count(*) FILTER (WHERE status = 'reserved')::int AS reserved
  FROM ops_stock_items
  WHERE warehouse_id = p_wh AND status IN ('free','reserved')
  GROUP BY sku, warehouse_id
  ON CONFLICT (sku, warehouse_id)
    DO UPDATE SET
      qty       = excluded.qty,
      reserved  = excluded.reserved,
      updated_at = now();

  UPDATE stock_balances sb
     SET qty = 0, reserved = 0, updated_at = now()
   WHERE sb.warehouse_id = p_wh
     AND NOT EXISTS (
       SELECT 1 FROM ops_stock_items i
        WHERE i.warehouse_id = p_wh
          AND i.sku          = sb.sku
          AND i.status IN ('free','reserved')
     );
END;
$$;

REVOKE ALL ON FUNCTION public.ops_rollup_stock_balances(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.ops_rollup_stock_balances(uuid) TO authenticated;

-- =============================================================================
-- 3. Five action RPCs — operation/principal role gate inside each.
-- =============================================================================

-- 3a. Reserve — pick oldest free + (optional condition) + (optional WH)
CREATE OR REPLACE FUNCTION public.ops_stock_reserve(
  p_sku       text,
  p_ref       text,
  p_condition text DEFAULT NULL,
  p_wh        uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role app_role;
  v_id   uuid;
  v_wh   uuid := p_wh;
BEGIN
  v_role := public.app_role();
  IF v_role NOT IN ('operation','principal') THEN
    RAISE EXCEPTION 'forbidden: ops stock action requires operation/principal'
      USING errcode = '42501';
  END IF;
  IF v_wh IS NULL THEN
    SELECT id INTO v_wh FROM warehouses WHERE name ILIKE '%klang%' LIMIT 1;
  END IF;
  IF v_wh IS NULL THEN
    RAISE EXCEPTION 'warehouse not found' USING errcode = '22023';
  END IF;

  UPDATE ops_stock_items
     SET status       = 'reserved',
         reserved_ref = p_ref,
         updated_at   = now()
   WHERE id = (
     SELECT id FROM ops_stock_items
      WHERE sku          = p_sku
        AND warehouse_id = v_wh
        AND status       = 'free'
        AND needs_repair = false
        AND (p_condition IS NULL OR condition = p_condition)
      ORDER BY date_in ASC NULLS LAST, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
   )
   RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    INSERT INTO audit_log (role, action, ref)
    VALUES (v_role, 'ops_stock.reserve', p_ref);
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ops_stock_reserve(text, text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.ops_stock_reserve(text, text, text, uuid) TO authenticated;

-- 3b. Release — reserved → free, push old ref into ref_history
CREATE OR REPLACE FUNCTION public.ops_stock_release(p_item_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role app_role;
  v_id   uuid;
  v_ref  text;
BEGIN
  v_role := public.app_role();
  IF v_role NOT IN ('operation','principal') THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  UPDATE ops_stock_items
     SET status       = 'free',
         reserved_ref = NULL,
         ref_history  = CASE
                          WHEN reserved_ref IS NOT NULL
                            THEN array_append(ref_history, reserved_ref)
                          ELSE ref_history
                        END,
         updated_at   = now()
   WHERE id = p_item_id
     AND status = 'reserved'
   RETURNING id, reserved_ref INTO v_id, v_ref;

  IF v_id IS NOT NULL THEN
    INSERT INTO audit_log (role, action, ref)
    VALUES (v_role, 'ops_stock.release', v_ref);
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ops_stock_release(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.ops_stock_release(uuid) TO authenticated;

-- 3c. Reassign — stay reserved, swap ref, push old into history
CREATE OR REPLACE FUNCTION public.ops_stock_reassign(p_item_id uuid, p_new_ref text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role app_role;
  v_id   uuid;
BEGIN
  v_role := public.app_role();
  IF v_role NOT IN ('operation','principal') THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  UPDATE ops_stock_items
     SET reserved_ref = p_new_ref,
         ref_history  = CASE
                          WHEN reserved_ref IS NOT NULL AND reserved_ref <> p_new_ref
                            THEN array_append(ref_history, reserved_ref)
                          ELSE ref_history
                        END,
         updated_at   = now()
   WHERE id = p_item_id
     AND status = 'reserved'
   RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    INSERT INTO audit_log (role, action, ref)
    VALUES (v_role, 'ops_stock.reassign', p_new_ref);
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ops_stock_reassign(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.ops_stock_reassign(uuid, text) TO authenticated;

-- 3d. Takeout — mark sold, write stock_movement, rollup aggregate
CREATE OR REPLACE FUNCTION public.ops_stock_takeout(p_item_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role app_role;
  v_id   uuid;
  v_sku  text;
  v_wh   uuid;
  v_ref  text;
BEGIN
  v_role := public.app_role();
  IF v_role NOT IN ('operation','principal') THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  UPDATE ops_stock_items
     SET status     = 'sold',
         updated_at = now()
   WHERE id = p_item_id
     AND status IN ('free','reserved')
   RETURNING id, sku, warehouse_id, reserved_ref
        INTO v_id, v_sku, v_wh, v_ref;

  IF v_id IS NOT NULL THEN
    INSERT INTO stock_movements (sku, warehouse_id, kind, qty, ref)
    VALUES (v_sku, v_wh, 'out', 1, COALESCE(v_ref, 'ops_stock.takeout'));

    PERFORM public.ops_rollup_stock_balances(v_wh);

    INSERT INTO audit_log (role, action, ref)
    VALUES (v_role, 'ops_stock.takeout', v_ref);
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ops_stock_takeout(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.ops_stock_takeout(uuid) TO authenticated;

-- 3e. Flag/unflag repair
CREATE OR REPLACE FUNCTION public.ops_stock_flag_repair(p_item_id uuid, p_flag boolean)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role app_role;
  v_id   uuid;
BEGIN
  v_role := public.app_role();
  IF v_role NOT IN ('operation','principal') THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  UPDATE ops_stock_items
     SET needs_repair = p_flag,
         updated_at   = now()
   WHERE id = p_item_id
   RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    INSERT INTO audit_log (role, action, ref)
    VALUES (v_role,
            CASE WHEN p_flag THEN 'ops_stock.flag_repair' ELSE 'ops_stock.unflag_repair' END,
            p_item_id::text);
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ops_stock_flag_repair(uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.ops_stock_flag_repair(uuid, boolean) TO authenticated;

-- =============================================================================
-- 4. Seed 67 units (Jess's 2026-05-18 best-truth count of Carres Klang stock).
-- WH looked up by name (no hardcoded UUID). Idempotent: re-running wipes
-- Carres Klang's items + re-seeds.
-- =============================================================================
CREATE TEMP TABLE _ops_seed_wh AS
  SELECT id FROM warehouses WHERE name ILIKE '%klang%' LIMIT 1;

DO $check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _ops_seed_wh) THEN
    RAISE EXCEPTION 'Carres Klang warehouse not found — seed of 67 ops_stock_items cannot proceed';
  END IF;
END $check$;

DELETE FROM ops_stock_items
 WHERE warehouse_id = (SELECT id FROM _ops_seed_wh);

INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'MS01-M1401F-K',(SELECT id FROM _ops_seed_wh),'new','free',NULL,false,'NF','PO/2604-042','RF2607' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='MS01-M1401F-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'MS01-M1401S-K',(SELECT id FROM _ops_seed_wh),'new','free',NULL,false,'NF','PO/2601-116','RF2601' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='MS01-M1401S-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'MS01-B1201F-K',(SELECT id FROM _ops_seed_wh),'new','free',NULL,false,'NF','PO/2604-042','RF2607' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='MS01-B1201F-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'MS01-B1201F-K',(SELECT id FROM _ops_seed_wh),'new','reserved','DL0565',false,'NF','PO/2604-062 (1)','DL0565' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='MS01-B1201F-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'MS01-B1201F-K',(SELECT id FROM _ops_seed_wh),'new','reserved','DL0565',false,'NF','PO/2604-062 (2)','DL0565' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='MS01-B1201F-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'MS01-L1201S-K',(SELECT id FROM _ops_seed_wh),'new','reserved','CR1008',false,'NF','PO/2511-110','CR1008' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='MS01-L1201S-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'MS01-H1401F-K',(SELECT id FROM _ops_seed_wh),'new','free',NULL,false,'NF','PO/2601-116','RF2601' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='MS01-H1401F-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'MS01-H1401F-K',(SELECT id FROM _ops_seed_wh),'new','free',NULL,false,'NF','PO/2604-042','RF2607' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='MS01-H1401F-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'MS01-H1401F-K',(SELECT id FROM _ops_seed_wh),'new','free',NULL,false,'NF','PO/2604-042','RF2607' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='MS01-H1401F-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'MS01-H1401S-K',(SELECT id FROM _ops_seed_wh),'new','free',NULL,false,'NF','PO/2604-042','RF2607' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='MS01-H1401S-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'MS01-L1202F-K',(SELECT id FROM _ops_seed_wh),'new','free',NULL,false,'NF','PO/2603-123','RF2606' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='MS01-L1202F-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'MS01-L1202S-K',(SELECT id FROM _ops_seed_wh),'new','free',NULL,false,'NF','PO/2603-018','RF2604' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='MS01-L1202S-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'MS01-L1202S-K',(SELECT id FROM _ops_seed_wh),'new','free',NULL,false,'NF','PO/2603-018','RF2604' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='MS01-L1202S-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'MS01-L1202S-K',(SELECT id FROM _ops_seed_wh),'new','free',NULL,false,'NF','PO/2603-123','RF2606' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='MS01-L1202S-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'MS01-M1401S-K',(SELECT id FROM _ops_seed_wh),'new','reserved',NULL,false,'NF','REPAIR','REPAIR' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='MS01-M1401S-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'MS01-B1201S-Q',(SELECT id FROM _ops_seed_wh),'new','reserved','DL0567',false,'NF','PO/2604-053','DL0567' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='MS01-B1201S-Q');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'MS01-L1201F-Q',(SELECT id FROM _ops_seed_wh),'new','free',NULL,false,'NF','PO/2603-123 (4)','RF2606' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='MS01-L1201F-Q');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'MS01-L1201F-Q',(SELECT id FROM _ops_seed_wh),'new','free',NULL,false,'NF','PO/2603-123 (5)','RF2606' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='MS01-L1201F-Q');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'MS01-L1201F-Q',(SELECT id FROM _ops_seed_wh),'new','free',NULL,false,'NF','PO/2603-123 (6)','RF2606' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='MS01-L1201F-Q');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'MS01-L1201F-Q',(SELECT id FROM _ops_seed_wh),'new','free',NULL,false,'NF','PO/2603-123 (6)','RF2606' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='MS01-L1201F-Q');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF04-1013Jager/Fab3-Q',(SELECT id FROM _ops_seed_wh),'new','reserved','CR0553',false,'NF','PO/2512-003','CR0553' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF04-1013Jager/Fab3-Q');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF04-1013Jager/Fab3-K',(SELECT id FROM _ops_seed_wh),'new','reserved','DL0453',false,'NF','PO/2510-098','DL0453' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF04-1013Jager/Fab3-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF04-1013Jager/Fab3-Q',(SELECT id FROM _ops_seed_wh),'new','reserved','CR0358',false,'NF','EXPO/2509-090','CR0358' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF04-1013Jager/Fab3-Q');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF04-2009(A)Trion/Fab3-K',(SELECT id FROM _ops_seed_wh),'new','reserved','CR0508',false,'NF','PO/2510-037','CR0508' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF04-2009(A)Trion/Fab3-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF04-1013Jager/Fab3-K',(SELECT id FROM _ops_seed_wh),'new','reserved','CR0114',false,'NF','EXPO/2509-132','CR0114' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF04-1013Jager/Fab3-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF04-1013Jager/Fab3-K',(SELECT id FROM _ops_seed_wh),'new','reserved','CR0445',false,'NF','PO/2509-058','CR0445' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF04-1013Jager/Fab3-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF04-1013Jager/Fab3-Q',(SELECT id FROM _ops_seed_wh),'new','reserved','CR1012',false,'NF','PO/2601-018','CR1012' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF04-1013Jager/Fab3-Q');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF04-1013Jager/Fab3-Q',(SELECT id FROM _ops_seed_wh),'new','reserved','CR0963',false,'NF','PO/2601-076','CR0963' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF04-1013Jager/Fab3-Q');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF04-1013Jager/Fab3-SS',(SELECT id FROM _ops_seed_wh),'new','reserved','CR1006',false,'NF','PO/2512-010','CR1006' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF04-1013Jager/Fab3-SS');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF04-1007/Cody/Fab3-K',(SELECT id FROM _ops_seed_wh),'new','reserved','CR0973',false,'Renness','PO/2601-105','CR0973' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF04-1007/Cody/Fab3-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF04-Divan/Fab3-K',(SELECT id FROM _ops_seed_wh),'new','reserved','CR1066',false,'Ohana','PO/2511-107','CR1066' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF04-Divan/Fab3-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF03-LSD013/NB02-Q',(SELECT id FROM _ops_seed_wh),'exhibition','free',NULL,false,'Renness','PO/2507-BF-03158(1)','RF/CR0170' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF03-LSD013/NB02-Q');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF01-910/01-CX1211-10-Q',(SELECT id FROM _ops_seed_wh),'exhibition','free',NULL,false,'Renness',NULL,'RF' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF01-910/01-CX1211-10-Q');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF01-910/02-CX1211-10-K',(SELECT id FROM _ops_seed_wh),'exhibition','free',NULL,false,'Renness',NULL,'RF' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF01-910/02-CX1211-10-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF01-910/03-CX1211-10-K',(SELECT id FROM _ops_seed_wh),'exhibition','free',NULL,false,'Renness',NULL,'RF' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF01-910/03-CX1211-10-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF02-LV625-WD/SC-1521-1-K',(SELECT id FROM _ops_seed_wh),'exhibition','free',NULL,false,'Laveo',NULL,'RF' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF02-LV625-WD/SC-1521-1-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF02-LV622-MD/SC-1521-1-K',(SELECT id FROM _ops_seed_wh),'exhibition','free',NULL,false,'Laveo',NULL,'RF' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF02-LV622-MD/SC-1521-1-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF04-1013Jager/Fab3-Q',(SELECT id FROM _ops_seed_wh),'exhibition','free',NULL,false,'Ohana','PO/2508-116','RF' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF04-1013Jager/Fab3-Q');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF04-1007/Cody/Fab3-Q',(SELECT id FROM _ops_seed_wh),'exhibition','free',NULL,false,'Ohana','PO/2508-116','RF' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF04-1007/Cody/Fab3-Q');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF04-2006(A)Regal/Fab3-K',(SELECT id FROM _ops_seed_wh),'exhibition','free',NULL,false,'Ohana','PO/2508-116','RF' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF04-2006(A)Regal/Fab3-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF04-2009(A)Trion/Fab3-K',(SELECT id FROM _ops_seed_wh),'exhibition','free',NULL,false,'Ohana','PO/2508-116','RF' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF04-2009(A)Trion/Fab3-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF03-Jager/LSD013/NB01-K',(SELECT id FROM _ops_seed_wh),'exhibition','free',NULL,false,'NB',NULL,'RF' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF03-Jager/LSD013/NB01-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF03-KHJ57/Divan10"-PC151-01-K',(SELECT id FROM _ops_seed_wh),'new','free',NULL,false,'NB',NULL,'RF' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF03-KHJ57/Divan10"-PC151-01-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF03-NH36(A)/PC151-01(Ivory)-K',(SELECT id FROM _ops_seed_wh),'old','free',NULL,true,'NB',NULL,'RF' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF03-NH36(A)/PC151-01(Ivory)-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF03-Jager/LSD013/NB01-K',(SELECT id FROM _ops_seed_wh),'new','free',NULL,false,'NB',NULL,'RF' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF03-Jager/LSD013/NB01-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF03-Jager/LSD013/NB01-K',(SELECT id FROM _ops_seed_wh),'exhibition','free',NULL,false,'NB',NULL,'RF' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF03-Jager/LSD013/NB01-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF04-1021Victoria/Fab3-K',(SELECT id FROM _ops_seed_wh),'new','free',NULL,false,'NB','PO/2508-152','RF/ CR0279' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF04-1021Victoria/Fab3-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF01-910/01-CX1211-10-Q',(SELECT id FROM _ops_seed_wh),'old','free',NULL,true,'NB',NULL,'RF/Repair/C235' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF01-910/01-CX1211-10-Q');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF01-910/01-CX1211-10-K',(SELECT id FROM _ops_seed_wh),'old','free',NULL,true,'NB',NULL,'RF/Repair/C234' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF01-910/01-CX1211-10-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF03-Jager/LSD013/NB01-K',(SELECT id FROM _ops_seed_wh),'new','free',NULL,false,'NB',NULL,'RF' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF03-Jager/LSD013/NB01-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF03-Jager/LSD013/NB01-K',(SELECT id FROM _ops_seed_wh),'new','free',NULL,false,'NB',NULL,'RF' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF03-Jager/LSD013/NB01-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF03-Jager/LSD013/NB01-K',(SELECT id FROM _ops_seed_wh),'exhibition','free',NULL,false,'NB',NULL,'RF' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF03-Jager/LSD013/NB01-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF03-KHJ57/Divan10"-PC151-01-K',(SELECT id FROM _ops_seed_wh),'new','free',NULL,false,'NB',NULL,'RF' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF03-KHJ57/Divan10"-PC151-01-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF03-Jager/LSD013/NB01-K',(SELECT id FROM _ops_seed_wh),'exhibition','free',NULL,false,'NB',NULL,'RF' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF03-Jager/LSD013/NB01-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF03-Jager/LSD013/NB01-K',(SELECT id FROM _ops_seed_wh),'exhibition','free',NULL,false,'NB',NULL,'RF' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF03-Jager/LSD013/NB01-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF03-Jager/LSD013/NB01-K',(SELECT id FROM _ops_seed_wh),'exhibition','free',NULL,false,'NB',NULL,'RF' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF03-Jager/LSD013/NB01-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF04-2009(A)Trion/Fab3-K',(SELECT id FROM _ops_seed_wh),'exhibition','free',NULL,false,'Ohana','PO/2508-116','RF' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF04-2009(A)Trion/Fab3-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF03-LSD013/NB02-Q',(SELECT id FROM _ops_seed_wh),'exhibition','free',NULL,false,'Renness','PO/2507-BF-03158(1)','RF/CR0170' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF03-LSD013/NB02-Q');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF01-910/01-CX1211-10-Q',(SELECT id FROM _ops_seed_wh),'exhibition','free',NULL,false,'Renness',NULL,'RF' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF01-910/01-CX1211-10-Q');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF01-910/01-CX1211-10-Q',(SELECT id FROM _ops_seed_wh),'exhibition','free',NULL,false,'Renness',NULL,'RF' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF01-910/01-CX1211-10-Q');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF01-910/01-CX1211-10-Q',(SELECT id FROM _ops_seed_wh),'exhibition','free',NULL,false,'Renness',NULL,'RF' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF01-910/01-CX1211-10-Q');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF04-2006(A)Regal/Fab3-K',(SELECT id FROM _ops_seed_wh),'exhibition','free',NULL,false,'Ohana','PO/2508-116','RF' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF04-2006(A)Regal/Fab3-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF04-1007/Cody/Fab3-Q',(SELECT id FROM _ops_seed_wh),'exhibition','free',NULL,false,'Ohana','PO/2508-116','RF' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF04-1007/Cody/Fab3-Q');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF01-910/02-CX1211-10-K',(SELECT id FROM _ops_seed_wh),'exhibition','free',NULL,false,'Renness',NULL,'RF' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF01-910/02-CX1211-10-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF04-1013Jager/Fab3-Q',(SELECT id FROM _ops_seed_wh),'exhibition','free',NULL,false,'Ohana','PO/2508-116','RF' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF04-1013Jager/Fab3-Q');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF01-910/03-CX1211-10-K',(SELECT id FROM _ops_seed_wh),'exhibition','free',NULL,false,'Renness',NULL,'RF' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF01-910/03-CX1211-10-K');
INSERT INTO ops_stock_items (sku,warehouse_id,condition,status,reserved_ref,needs_repair,supplier,po_no,source_ref) SELECT 'BF02-LV622-MD/SC-1521-1-K',(SELECT id FROM _ops_seed_wh),'exhibition','free',NULL,false,'Laveo',NULL,'RF' WHERE EXISTS(SELECT 1 FROM product_skus WHERE sku='BF02-LV622-MD/SC-1521-1-K');

-- One rollup at end so stock_balances reflects the 67-unit truth for Klang.
SELECT public.ops_rollup_stock_balances((SELECT id FROM _ops_seed_wh));

DROP TABLE _ops_seed_wh;

-- =============================================================================
-- Sanity
-- =============================================================================
DO $sanity$
DECLARE
  t_count int; rpc_count int; klang_items int;
BEGIN
  SELECT count(*) INTO t_count
    FROM information_schema.tables
   WHERE table_schema='public' AND table_name='ops_stock_items';
  IF t_count <> 1 THEN
    RAISE EXCEPTION '0137 sanity: ops_stock_items table missing';
  END IF;

  SELECT count(*) INTO rpc_count
    FROM pg_proc
   WHERE proname IN (
     'ops_rollup_stock_balances',
     'ops_stock_reserve',
     'ops_stock_release',
     'ops_stock_reassign',
     'ops_stock_takeout',
     'ops_stock_flag_repair'
   );
  IF rpc_count <> 6 THEN
    RAISE EXCEPTION '0137 sanity: expected 6 ops_stock RPCs, got %', rpc_count;
  END IF;

  SELECT count(*) INTO klang_items
    FROM ops_stock_items i
    JOIN warehouses w ON w.id = i.warehouse_id
   WHERE w.name ILIKE '%klang%';
  IF klang_items < 60 THEN
    RAISE EXCEPTION '0137 sanity: expected >=60 Klang ops_stock_items (target 67), got %', klang_items;
  END IF;

  RAISE NOTICE '0137 OK: ops_stock_items table + 6 RPCs created; % units seeded at Carres Klang', klang_items;
END $sanity$;
