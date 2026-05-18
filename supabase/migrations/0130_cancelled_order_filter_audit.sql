-- 0130_cancelled_order_filter_audit.sql
-- 2026-05-18 (Loo "ok go with next first")
--
-- Continuation of the deep-audit sweep. 0129 closed the highest-priority
-- cascade gaps; the carry-forward `phase-10-cancelled-order-filter-audit`
-- listed 7 functions that JOIN orders without a `status <> 'cancelled'`
-- filter. This migration walks each one and fixes the 5 that actually
-- need it.
--
-- PER-FUNCTION ANALYSIS
--   ✅ dealer_with_stats           — stats aggregate. cancelled orders
--      shouldn't inflate order_count/gmv/outstanding. ADD FILTER.
--   ✅ dealers_with_stats_list     — same shape as above. ADD FILTER.
--   ✅ partner_orders_for_threads  — caller-driven lookup, but
--      defense-in-depth: if cached thread IDs include cancelled orders,
--      enrichment shouldn't surface their customer info. ADD FILTER.
--   ✅ supplier_orders_for_threads — same as partner version. ADD FILTER.
--   ✅ supplier_threads_for_po     — supplier Production checklist for a
--      PO. If an order linked to the PO was abandoned (and the abandon
--      didn't cascade to threads — see open carry-forward), supplier
--      shouldn't be asked to act on it. ADD FILTER.
--   ❌ supplier_pending_demand     — ALREADY has `o.status not in
--      ('delivered', 'cancelled')`. Was a false positive in the earlier
--      audit regex (looked for `<>` form only). NO CHANGE.
--   ❌ partner_confirm_receive     — write action with state guards
--      (`po.sup_status = 'ready_confirm_sent'`), not a read surface.
--      Filtering would change behavior, not patch a UI gap. NO CHANGE.
--
-- Loo authorised in conversation 2026-05-18 ("ok go with next first")
-- per CLAUDE.md §14 #1 single-instance approval.


-- =============================================================================
-- FIX 1 — dealer_with_stats: exclude cancelled from aggregate stats
-- =============================================================================
CREATE OR REPLACE FUNCTION public.dealer_with_stats(p_id uuid)
 RETURNS TABLE(id uuid, name text, region text, contact text, status dealer_status, joined_date date, credit_limit numeric, payment_terms text, deposit_balance numeric, order_count bigint, gmv numeric, outstanding numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select d.id, d.name, d.region, d.contact, d.status, d.joined_date,
         d.credit_limit, d.payment_terms, d.deposit_balance,
         coalesce(s.order_count, 0)::bigint,
         coalesce(s.gmv, 0)::numeric,
         coalesce(s.outstanding, 0)::numeric
    from dealers d
    left join lateral (
      select count(*) as order_count,
             coalesce(sum(line_total + addon_total), 0) as gmv,
             coalesce(sum(greatest(0, (line_total + addon_total) - o.paid)), 0) as outstanding
        from orders o
        left join lateral (select coalesce(sum(unit_price * qty), 0) as line_total
                             from order_lines where order_id = o.id) ol on true
        left join lateral (select coalesce(sum(unit_price * qty), 0) as addon_total
                             from order_addons where order_id = o.id) oa on true
        where o.dealer_id = d.id
          and o.status <> 'cancelled'
    ) s on true
   where d.id = p_id;
$function$;


-- =============================================================================
-- FIX 2 — dealers_with_stats_list: same exclusion, all dealers
-- =============================================================================
CREATE OR REPLACE FUNCTION public.dealers_with_stats_list()
 RETURNS TABLE(id uuid, name text, region text, contact text, status dealer_status, joined_date date, credit_limit numeric, payment_terms text, deposit_balance numeric, order_count bigint, gmv numeric, outstanding numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select d.id, d.name, d.region, d.contact, d.status, d.joined_date,
         d.credit_limit, d.payment_terms, d.deposit_balance,
         coalesce(s.order_count, 0)::bigint,
         coalesce(s.gmv, 0)::numeric,
         coalesce(s.outstanding, 0)::numeric
    from dealers d
    left join lateral (
      select count(*) as order_count,
             coalesce(sum(line_total + addon_total), 0) as gmv,
             coalesce(sum(greatest(0, (line_total + addon_total) - o.paid)), 0) as outstanding
        from orders o
        left join lateral (select coalesce(sum(unit_price * qty), 0) as line_total
                             from order_lines where order_id = o.id) ol on true
        left join lateral (select coalesce(sum(unit_price * qty), 0) as addon_total
                             from order_addons where order_id = o.id) oa on true
        where o.dealer_id = d.id
          and o.status <> 'cancelled'
    ) s on true
    where d.status <> 'rejected'
    order by d.name;
$function$;


-- =============================================================================
-- FIX 3 — partner_orders_for_threads: defense-in-depth cancelled filter
-- =============================================================================
CREATE OR REPLACE FUNCTION public.partner_orders_for_threads(p_order_ids uuid[])
 RETURNS TABLE(id uuid, so integer, customer_name text, delivery_date date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_partner_id uuid;
BEGIN
  v_partner_id := public.app_partner_id();

  IF public.app_role() <> 'partner' THEN
    RAISE EXCEPTION 'forbidden: partner role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: partner_id missing on JWT'
      USING ERRCODE = '42501', DETAIL = 'no_partner_id';
  END IF;

  RETURN QUERY
  SELECT DISTINCT o.id, o.so, o.customer_name, o.delivery_date
  FROM orders o
  JOIN order_supplier_threads t ON t.order_id = o.id
  JOIN purchase_orders po ON po.id = t.po_id
  LEFT JOIN warehouses w ON w.id = po.warehouse_id
  WHERE o.id = ANY(p_order_ids)
    AND o.status <> 'cancelled'
    AND (po.procurement_partner_id = v_partner_id
         OR w.owning_partner_id = v_partner_id);
END;
$function$;


-- =============================================================================
-- FIX 4 — supplier_orders_for_threads: defense-in-depth cancelled filter
-- =============================================================================
CREATE OR REPLACE FUNCTION public.supplier_orders_for_threads(p_order_ids uuid[])
 RETURNS TABLE(id uuid, so integer, customer_name text, delivery_date date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_supplier_id uuid;
BEGIN
  v_supplier_id := public.app_supplier_id();

  IF public.app_role() <> 'supplier' THEN
    RAISE EXCEPTION 'forbidden: supplier role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: supplier_id missing on JWT'
      USING ERRCODE = '42501', DETAIL = 'no_supplier_id';
  END IF;

  RETURN QUERY
  SELECT DISTINCT o.id, o.so, o.customer_name, o.delivery_date
  FROM orders o
  JOIN order_supplier_threads t ON t.order_id = o.id
  JOIN purchase_orders po ON po.id = t.po_id
  WHERE o.id = ANY(p_order_ids)
    AND o.status <> 'cancelled'
    AND po.supplier_id = v_supplier_id;
END;
$function$;


-- =============================================================================
-- FIX 5 — supplier_threads_for_po: don't surface cancelled orders' threads
-- =============================================================================
CREATE OR REPLACE FUNCTION public.supplier_threads_for_po(p_po_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_supplier_id uuid;
  v_po          purchase_orders;
  v_result      jsonb;
BEGIN
  IF public.app_role() <> 'supplier' THEN
    RAISE EXCEPTION 'forbidden: supplier only' USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  v_supplier_id := public.app_supplier_id();
  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'no supplier_id on JWT' USING ERRCODE = '42501', DETAIL = 'no_supplier_id';
  END IF;
  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found' USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;
  IF v_po.supplier_id IS DISTINCT FROM v_supplier_id THEN
    RAISE EXCEPTION 'forbidden: cross_tenant' USING ERRCODE = '42501', DETAIL = 'cross_tenant';
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id',                     t.id,
      'order_id',               t.order_id,
      'order_dl',               o.so,
      'customer_name',          o.customer_name,
      'customer_delivery_date', o.delivery_date,
      'supplier_ready_at',      t.supplier_ready_at,
      'pickup_event_id',        t.pickup_event_id,
      'sku_lines', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('sku', ol.sku, 'qty', ol.qty)), '[]'::jsonb)
          FROM order_lines ol
          JOIN product_skus ps ON ps.sku = ol.sku
          JOIN product_models pm ON pm.id = ps.model_id
         WHERE ol.order_id = t.order_id
           AND pm.category::text = t.category
      )
    )
    ORDER BY o.delivery_date NULLS LAST, t.id
  ), '[]'::jsonb) INTO v_result
  FROM order_supplier_threads t
  LEFT JOIN orders o ON o.id = t.order_id
  WHERE t.po_id = p_po_id
    -- 0130: hide threads whose underlying order has been cancelled. The
    -- supplier Production checklist shouldn't ask them to act on dead
    -- work. LEFT JOIN preserved + IS NULL check so threads with broken
    -- order ref (shouldn't happen, but defensive) don't disappear.
    AND (o.status IS NULL OR o.status <> 'cancelled');

  RETURN v_result;
END;
$function$;


-- =============================================================================
-- SANITY CHECK — assert all 5 functions now contain the cancelled filter
-- =============================================================================
DO $sanity$
DECLARE
  miss text;
BEGIN
  SELECT string_agg(proname, ', ')
    INTO miss
    FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname IN ('dealer_with_stats',
                     'dealers_with_stats_list',
                     'partner_orders_for_threads',
                     'supplier_orders_for_threads',
                     'supplier_threads_for_po')
     AND pg_get_functiondef(oid) !~ '''cancelled''';

  IF miss IS NOT NULL THEN
    RAISE EXCEPTION '0130 sanity FAILED — function(s) missing cancelled filter: %', miss;
  END IF;
  RAISE NOTICE '0130 sanity OK — 5 functions now filter cancelled orders';
END
$sanity$;
