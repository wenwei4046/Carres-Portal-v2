-- 0232 — Add-product initiative P2 (design:
-- docs/superpowers/plans/2026-07-18-order-add-product-initiative.md §3.2/§5).
--
-- Extends `add_order_lines` (0231) for the full engine pipeline:
--
--   * NEW param `p_addons_replace jsonb default null` — the Hono route's
--     delivery-fee recompute over the MERGED cart emits a replacement set for
--     the SERVER-EXCLUSIVE trip-fee addon rows (keys DELIVERY /
--     DELIVERY_CROSS / DELIVERY_ADD, 0184). NULL = leave addons untouched
--     (byte-identical to 0231); an array (possibly empty) atomically DELETEs
--     the order's existing DELIVERY* rows and INSERTs the new set in the SAME
--     transaction as the line append. Only those 3 keys are replaceable —
--     any other addon_key rejects (client/ops addons are never server-swept).
--     The scoped DELETE is the first order_addons delete path in the schema;
--     it can only ever touch the 3 server-minted keys of ONE order.
--
--   * p_lines cap 10 → 30 — a sofa BUILD line explodes server-side into one
--     row per compartment (+ appended RM0 gift lines), so the post-explosion
--     set can legitimately exceed the client-facing 10-line cap (the Hono
--     zod cap on INPUT lines stays 10).
--
-- Signature changes → DROP + CREATE (no ghost overload) + explicit re-grants
-- (0230/0231 pattern). Everything else is 0231-verbatim: append-only lines,
-- place-lane direct gate, merged-cart 0089 mutex, history + audit.

DROP FUNCTION IF EXISTS public.add_order_lines(uuid, jsonb, text, uuid);

CREATE FUNCTION public.add_order_lines(
  p_order_id uuid,
  p_lines jsonb,
  p_source text DEFAULT 'direct',
  p_change_request_id uuid DEFAULT NULL,
  p_addons_replace jsonb DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order            orders;
  v_role             app_role;
  v_caller_dealer_id uuid;
  v_line             jsonb;
  v_addon            jsonb;
  v_count            int := 0;
  v_delta            numeric(14,2) := 0;
  v_sku              text;
  v_qty              int;
  v_price            numeric;
  v_has_sofa         boolean;
  v_has_other        boolean;
begin
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();

  -- 0222 precedent: a NULL role (anon key / orphaned JWT) is rejected outright.
  if v_role is null then
    raise exception 'forbidden: no app role' using errcode = '42501';
  end if;

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = '42P01';
  end if;

  if v_role not in ('principal','operation','finance','bd')
     and v_order.dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer edit' using errcode = '42501';
  end if;

  -- P1/P2 implement the DIRECT gate only. 'change_request' arrives in P3 via
  -- CREATE OR REPLACE on this same signature.
  if p_source is distinct from 'direct' then
    raise exception 'unsupported add_order_lines source'
      using errcode = '22023', detail = 'unsupported_source';
  end if;

  -- Direct add = the POS place lane exactly (order-edit-scope laneOf):
  -- status 'place', operation has NOT picked it up, and not an AutoCount
  -- import (those live in the proceed lane and must go through P3 approval).
  if v_order.status <> 'place'
     or v_order.operation_stage is not null
     or v_order.source_system = 'autocount' then
    raise exception 'Products can only be added while the order is in Order placed'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  -- 0232: cap raised 10 → 30 — the Hono route caps CLIENT input at 10 lines,
  -- but a sofa build explodes into per-compartment rows + RM0 gift appends.
  if jsonb_typeof(p_lines) is distinct from 'array'
     or jsonb_array_length(p_lines) < 1
     or jsonb_array_length(p_lines) > 30 then
    raise exception 'p_lines must be an array of 1..30 lines'
      using errcode = '22023', detail = 'invalid_lines';
  end if;

  -- Per-line shape + sku existence (the Hono route already priced + validated;
  -- this is the cheap defensive re-check — add-lines never accepts a free-text
  -- sku, unlike the ops raw-create path).
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_sku   := v_line->>'sku';
    v_qty   := (v_line->>'qty')::int;
    v_price := (v_line->>'unit_price')::numeric;
    if coalesce(v_sku, '') = '' or v_qty is null or v_qty < 1 or v_qty > 99
       or v_price is null or v_price < 0 then
      raise exception 'invalid line shape'
        using errcode = '22023', detail = 'invalid_lines';
    end if;
    if not exists (select 1 from product_skus s where s.sku = v_sku) then
      raise exception 'unknown sku %', v_sku
        using errcode = '22023', detail = 'unknown_sku';
    end if;
  end loop;

  -- 0232: delivery addon replace-set — shape gate BEFORE any write.
  if p_addons_replace is not null then
    if jsonb_typeof(p_addons_replace) is distinct from 'array'
       or jsonb_array_length(p_addons_replace) > 10 then
      raise exception 'p_addons_replace must be an array of at most 10 addons'
        using errcode = '22023', detail = 'invalid_addons';
    end if;
    for v_addon in select * from jsonb_array_elements(p_addons_replace) loop
      if coalesce(v_addon->>'addon_key', '') not in ('DELIVERY','DELIVERY_CROSS','DELIVERY_ADD')
         or (v_addon->>'qty')::int is null or (v_addon->>'qty')::int < 1
         or (v_addon->>'unit_price')::numeric is null
         or (v_addon->>'unit_price')::numeric < 0 then
        raise exception 'invalid delivery addon shape'
          using errcode = '22023', detail = 'invalid_addons';
      end if;
    end loop;
  end if;

  -- 0089 category mutex over the MERGED cart (existing rows ∪ new lines) —
  -- same rule create_order enforces at birth.
  select
    exists (
      select 1 from (
        select ol.sku from order_lines ol where ol.order_id = p_order_id
        union all
        select l->>'sku' from jsonb_array_elements(p_lines) l
      ) merged
      join product_skus s on s.sku = merged.sku
      join product_models pm on pm.id = s.model_id
      where pm.category = 'sofa'
    ),
    exists (
      select 1 from (
        select ol.sku from order_lines ol where ol.order_id = p_order_id
        union all
        select l->>'sku' from jsonb_array_elements(p_lines) l
      ) merged
      join product_skus s on s.sku = merged.sku
      join product_models pm on pm.id = s.model_id
      where pm.category in ('mattress','bedframe')
    )
  into v_has_sofa, v_has_other;

  if v_has_sofa and v_has_other then
    raise exception 'sofa cannot mix with mattress or bedframe in the same order'
      using errcode = '22023', detail = 'mixed_category_lines';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    insert into order_lines (order_id, sku, qty, attrs, unit_price)
    values (
      p_order_id,
      v_line->>'sku',
      (v_line->>'qty')::int,
      v_line->'attrs',
      (v_line->>'unit_price')::numeric
    );
    v_count := v_count + 1;
    v_delta := v_delta + ((v_line->>'unit_price')::numeric * (v_line->>'qty')::int);
  end loop;

  -- 0232: atomic DELIVERY* replace — the Hono delivery recompute over the
  -- merged cart is authoritative for these three server-minted keys.
  if p_addons_replace is not null then
    delete from order_addons
     where order_id = p_order_id
       and addon_key in ('DELIVERY','DELIVERY_CROSS','DELIVERY_ADD');
    for v_addon in select * from jsonb_array_elements(p_addons_replace) loop
      insert into order_addons (order_id, addon_key, qty, unit_price, attrs)
      values (
        p_order_id,
        v_addon->>'addon_key',
        coalesce((v_addon->>'qty')::int, 1),
        (v_addon->>'unit_price')::numeric,
        v_addon->'attrs'
      );
    end loop;
  end if;

  -- 0135 — a portal edit on an AutoCount order wins over re-import. Direct
  -- adds can't reach an autocount order (gate above), but the flag flip ships
  -- now so the P3 change-request path inherits it for free.
  update orders
     set items_edited = case when source_system = 'autocount' then true else items_edited end,
         updated_at = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role, metadata)
  values (
    p_order_id,
    format('Products added · %s line(s) · RM %s', v_count, v_delta::text),
    v_role,
    jsonb_build_object(
      'kind', 'add_lines',
      'source', p_source,
      'change_request_id', p_change_request_id,
      'lines', p_lines,
      'addons_replace', p_addons_replace,
      'total_delta', v_delta
    )
  );

  insert into audit_log (role, action, dealer_id, ref)
  values (v_role, 'order.lines_added', v_order.dealer_id, 'SO-' || v_order.so::text);

  return jsonb_build_object('id', p_order_id, 'added', v_count, 'total_delta', v_delta);
end;
$function$;

REVOKE ALL ON FUNCTION public.add_order_lines(uuid, jsonb, text, uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.add_order_lines(uuid, jsonb, text, uuid, jsonb) TO authenticated, service_role;
