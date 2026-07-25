-- 0256_replace_order_lines_promo_parity.sql
-- Line-EDIT promo parity (Loo 2026-07-25: "edited/added items must follow the
-- SAME rules as the POS — PWP, GWP, free-gift triggers"). Same-signature
-- CREATE OR REPLACE over 0255's replace_order_lines (no ghost overload):
--
--   1. p_old_line_ids may now include the replaced line's own RM0 free-gift
--      rows (the Hono route matches them — wizard semantics: gifts leave with
--      their line). free_item / pwp / bundle / combo targets stay rejected.
--   2. p_lines may now carry `free_gift` (the pipeline's re-earned gift
--      appends) and code-less `pwp` claim markers (validated by the Hono
--      recompute, same as add) — only `free_item` stays rejected. Posture
--      matches add_order_lines, which has no marker guard at all; the Hono
--      layer is the real gate on both paths.
--
-- Everything else (order row lock, place-lane gate, up-sell downsell_blocked
-- gate, sofa whole-group rule, before-image history + audit) is unchanged
-- from 0255. Gift rows price 0 on both sides, so the up-sell totals are
-- unaffected by their inclusion.

CREATE OR REPLACE FUNCTION public.replace_order_lines(
  p_order_id uuid,
  p_old_line_ids uuid[],
  p_lines jsonb,
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
  v_old              order_lines;
  v_old_attrs        jsonb;
  v_old_count        int := 0;
  v_old_total        numeric(14,2) := 0;
  v_old_snapshot     jsonb := '[]'::jsonb;
  v_target_count     int;
  v_build_keys       text[] := '{}';
  v_key              text;
  v_present          int;
  v_named            int;
  v_line             jsonb;
  v_addon            jsonb;
  v_count            int := 0;
  v_new_total        numeric(14,2) := 0;
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

  -- Lock the order row: a replace deletes + re-inserts and must not race a
  -- concurrent add / proceed on the same order.
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = '42P01';
  end if;

  if v_role not in ('principal','operation','finance','bd')
     and v_order.dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer edit' using errcode = '42501';
  end if;

  -- Place lane exactly (same gate as add_order_lines 'direct').
  if v_order.status <> 'place'
     or v_order.operation_stage is not null
     or v_order.source_system = 'autocount' then
    raise exception 'Products can only be edited while the order is in Order placed'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  -- Target ids: non-empty, no duplicates.
  select count(distinct x) into v_target_count from unnest(p_old_line_ids) x;
  if v_target_count is null or v_target_count < 1 or v_target_count > 30
     or v_target_count is distinct from array_length(p_old_line_ids, 1) then
    raise exception 'p_old_line_ids must name 1..30 distinct lines'
      using errcode = '22023', detail = 'invalid_target';
  end if;

  -- Old rows: all must belong to THIS order. 0256: a free_gift row IS a valid
  -- target (the route sends the replaced line's own gift children — wizard
  -- semantics); free_item / pwp / bundle / combo rows stay non-editable.
  for v_old in
    select ol.* from order_lines ol
     where ol.id = any(p_old_line_ids)
       and ol.order_id = p_order_id
  loop
    v_old_attrs := coalesce(v_old.attrs, '{}'::jsonb);
    if (v_old_attrs ? 'free_item')
       or (v_old_attrs ? 'pwp') or (v_old_attrs ? 'bundle_group')
       or (v_old_attrs ? 'combo_key') then
      raise exception 'line % is not editable', v_old.id
        using errcode = '22023', detail = 'line_not_editable';
    end if;
    if v_old_attrs ? 'sofa_build_key' then
      v_build_keys := array_append(v_build_keys, v_old_attrs->>'sofa_build_key');
    end if;
    v_old_count := v_old_count + 1;
    v_old_total := v_old_total + (v_old.unit_price * v_old.qty);
    v_old_snapshot := v_old_snapshot || jsonb_build_array(jsonb_build_object(
      'id', v_old.id, 'sku', v_old.sku, 'qty', v_old.qty,
      'unit_price', v_old.unit_price, 'attrs', v_old.attrs));
  end loop;

  if v_old_count is distinct from v_target_count then
    raise exception 'target line(s) not found on this order'
      using errcode = '22023', detail = 'line_not_found';
  end if;

  -- A sofa group must be replaced WHOLE — a partial delete would orphan the
  -- build's remaining compartment rows.
  for v_key in select distinct k from unnest(v_build_keys) k loop
    select count(*) into v_present
      from order_lines ol
     where ol.order_id = p_order_id
       and ol.attrs->>'sofa_build_key' = v_key;
    select count(*) into v_named
      from unnest(v_build_keys) k where k = v_key;
    if v_present is distinct from v_named then
      raise exception 'sofa build must be replaced as a whole group'
        using errcode = '22023', detail = 'partial_sofa_group';
    end if;
  end loop;

  -- 0232: cap 30 — the Hono route caps CLIENT input at ONE line, but a sofa
  -- build explodes into per-compartment rows + RM0 gift appends.
  if jsonb_typeof(p_lines) is distinct from 'array'
     or jsonb_array_length(p_lines) < 1
     or jsonb_array_length(p_lines) > 30 then
    raise exception 'p_lines must be an array of 1..30 lines'
      using errcode = '22023', detail = 'invalid_lines';
  end if;

  -- Per-line shape + sku existence (the Hono route already priced +
  -- validated; cheap defensive re-check). 0256: `free_gift` appends and
  -- code-less `pwp` claims are legal replacement rows (Hono recompute is the
  -- real gate — same posture as add_order_lines); `free_item` stays rejected.
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
    if coalesce(v_line->'attrs', '{}'::jsonb) ? 'free_item' then
      raise exception 'free_item markers are not allowed on replacement lines'
        using errcode = '22023', detail = 'invalid_lines';
    end if;
    v_new_total := v_new_total + (v_price * v_qty);
  end loop;

  -- THE rule (Loo 2026-07-25): up-sell only. Old total from the DB rows
  -- (authoritative), new total from the server-priced replacement. Gift rows
  -- are RM0 on both sides — they never move these totals.
  if v_new_total < v_old_total then
    raise exception 'replacement total RM % is below the original RM % — upgrades only',
      v_new_total::text, v_old_total::text
      using errcode = '22023', detail = 'downsell_blocked';
  end if;

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

  -- 0089 category mutex over the POST-replace cart: (existing minus the
  -- replaced rows) ∪ replacement lines.
  select
    exists (
      select 1 from (
        select ol.sku from order_lines ol
         where ol.order_id = p_order_id and not (ol.id = any(p_old_line_ids))
        union all
        select l->>'sku' from jsonb_array_elements(p_lines) l
      ) merged
      join product_skus s on s.sku = merged.sku
      join product_models pm on pm.id = s.model_id
      where pm.category = 'sofa'
    ),
    exists (
      select 1 from (
        select ol.sku from order_lines ol
         where ol.order_id = p_order_id and not (ol.id = any(p_old_line_ids))
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

  -- Apply: delete old + insert replacement, one transaction.
  delete from order_lines
   where id = any(p_old_line_ids) and order_id = p_order_id;

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
  end loop;

  -- 0232: atomic DELIVERY* replace — the Hono delivery recompute over the
  -- post-replace cart is authoritative for these three server-minted keys.
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

  update orders set updated_at = now() where id = p_order_id;

  insert into order_history (order_id, text, by_role, metadata)
  values (
    p_order_id,
    format('Product edited · RM %s → RM %s', v_old_total::text, v_new_total::text),
    v_role,
    jsonb_build_object(
      'kind', 'replace_lines',
      'old_lines', v_old_snapshot,
      'lines', p_lines,
      'addons_replace', p_addons_replace,
      'old_total', v_old_total,
      'new_total', v_new_total
    )
  );

  insert into audit_log (role, action, dealer_id, ref)
  values (v_role, 'order.lines_replaced', v_order.dealer_id, 'SO-' || v_order.so::text);

  return jsonb_build_object(
    'id', p_order_id,
    'removed', v_old_count,
    'added', v_count,
    'old_total', v_old_total,
    'new_total', v_new_total
  );
end;
$function$;

-- Same signature → grants from 0255 carry over via CREATE OR REPLACE.
