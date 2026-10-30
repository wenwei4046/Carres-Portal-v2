-- =============================================================================
-- 0737_a_delivery_of_accessories_only_hands_over_without_unit_ids.sql
-- =============================================================================
-- WHAT WAS WRONG
--   A Delivery Order that carries only accessories (pillows, mattress
--   protectors) could never be handed over. `delivery_handover_record` refused
--   every `handed_over` on a DO with no Unit list (`exact_units_not_recorded`)
--   and then demanded Unit IDs. Accessories are counted goods: Catalog marks
--   them `stock_identity_mode = 'quantity'` (0442), so PO issue never gives
--   them Unit IDs and no Unit list can ever exist for them. SO-1372 (one
--   pillow) was stuck there.
--
--   Behind it, the deliver step's fallback for a DO with no Unit list (the
--   pre-0424 SKU pick) took `LIMIT qty` ROWS by SKU. A counted accessory sits
--   in ONE bulk row standing for many pieces (0453), so delivering one pillow
--   would have marked the whole bulk row sold.
--
-- WHAT THIS CHANGES (YH, 30 Oct 2026: option 1)
--   1 · `handed_over` on a DO with no Unit list is allowed when EVERY line it
--       carries is not Unit-tracked: a whole-order DO (`trip_groups` null, so
--       its lines are the order's lines) whose order has lines, and none of
--       them is an `exact_unit` SKU or a SKU Catalog does not know. Such a
--       handover needs no Unit IDs. Receiver, proof, the logistics partner and
--       the ready → handed over → received order are unchanged. A DO with any
--       Unit-tracked line keeps today's refusal. A later Journey leg still
--       needs the previous leg's partner recorded; its Unit-holder check has no
--       Units to check, so it passes.
--   2 · The no-Unit-list SKU pick in `_delivery_mark_delivered` takes single
--       Units only (`qty = 1`, `identity_scope = 'unit'`), never a counted bulk
--       row. Counted stock is not moved by delivery; that is unchanged.
--
-- Both functions are edited on their LIVE body (the 0721 / 0733 pattern), so
-- 0560's blank-answer guards and 0733's one-sell helper are kept.
-- =============================================================================

set search_path = public;

create or replace function pg_temp.mig0737_rewrite(p_fn regprocedure, p_old text, p_new text)
returns void
language plpgsql
as $rw$
declare
  v_def text := replace(pg_get_functiondef(p_fn), E'\r\n', E'\n');
  v_n   integer;
begin
  -- A file checked out on Windows (autocrlf) carries CRLF inside a multi-line
  -- needle; the body was normalised above, so the needle must be too.
  p_old := replace(p_old, E'\r\n', E'\n');
  p_new := replace(p_new, E'\r\n', E'\n');
  if position(p_new in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
  if v_n <> 1 then
    raise exception '0737: % holds the text to change % times, not 1: %', p_fn, v_n, left(p_old, 90);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$rw$;

-- ── 1 · an accessories-only DO hands over without Unit IDs ───────────────────
select pg_temp.mig0737_rewrite('public.delivery_handover_record(uuid,text,text,text,jsonb,text,text,text[],jsonb)'::regprocedure,
$old$    if v_required = 0 then$old$,
$new$    -- 0737 · no Unit list is refused unless every line is counted goods.
    if v_required = 0 and (
         v_do.trip_groups is not null
         or not exists (select 1 from order_lines l where l.order_id = v_do.order_id)
         or exists (select 1 from order_lines l
                      left join product_skus ps on ps.sku = l.sku
                     where l.order_id = v_do.order_id
                       and (ps.sku is null or ps.stock_identity_mode = 'exact_unit'))) then$new$);

select pg_temp.mig0737_rewrite('public.delivery_handover_record(uuid,text,text,text,jsonb,text,text,text[],jsonb)'::regprocedure,
$old$    if p_unit_codes is null or array_length(p_unit_codes, 1) is null then$old$,
$new$    if v_required > 0 and (p_unit_codes is null or array_length(p_unit_codes, 1) is null) then   -- 0737$new$);

select pg_temp.mig0737_rewrite('public.delivery_handover_record(uuid,text,text,text,jsonb,text,text,text[],jsonb)'::regprocedure,
$old$      'Handed over ' || array_length(v_items, 1) || ' of ' || v_required
        || ' Units to '$old$,
$new$      case when v_required = 0 then 'Handed over the accessories'   -- 0737
           else 'Handed over ' || array_length(v_items, 1) || ' of ' || v_required || ' Units' end
        || ' to '$new$);

-- ── 2 · the no-Unit-list pick never sells a counted bulk row ─────────────────
select pg_temp.mig0737_rewrite('public._delivery_mark_delivered(uuid,text,text,text,text,text,text)'::regprocedure,
$old$            WHERE s.sku = v_line.sku$old$,
$new$            WHERE s.sku = v_line.sku
              AND s.qty = 1 AND s.identity_scope = 'unit'   -- 0737$new$);
