-- =============================================================================
-- 0135_orders_items_edited.sql — Portal-wins-AutoCount guard on items array
-- 2026-05-20 (Loo authorised in conversation per CLAUDE.md §7 + §14 #1).
--
-- WHY: imported orders are operated on in the portal — operation can edit the
-- items array (swap SKU, add freebie, adjust qty). The next AutoCount re-
-- export MUST NOT silently overwrite those edits. Marker column flips to
-- true when the items array is mutated post-import.
--
-- Scope:
--   - Items array (order_lines for this order) — LOCKED once items_edited=true.
--     Re-import skips DELETE + re-INSERT of lines for that order.
--   - Non-item fields (customer_phone, customer_address, delivery_date, paid,
--     channel) — ALWAYS re-import from AutoCount. Those are the things that
--     genuinely change in AutoCount after the order entered the portal.
--
-- One-shot unlock affordance: POST /api/orders/:id/accept-autocount-items
-- clears the flag. Next re-import then accepts AutoCount's items array.
-- (No RPC needed — the endpoint UPDATEs the row directly; RLS gates ops/principal.)
-- =============================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS items_edited boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN orders.items_edited IS
  'true when the order_lines array has been edited in the portal after import. '
  'When true, import_autocount_order skips the lines DELETE+re-INSERT on '
  're-import. Cleared via POST /api/orders/:id/accept-autocount-items.';

-- -----------------------------------------------------------------------------
-- Replace import_autocount_order — add the items_edited guard.
-- Body mirrors 0132 verbatim except for:
--   1. Add v_items_edited / v_skip_lines locals
--   2. SELECT includes items_edited in the existing-lookup
--   3. UPDATE path: skip DELETE order_lines + the line-INSERT loop when locked
--   4. order_history text annotates whether items were preserved
-- -----------------------------------------------------------------------------
create or replace function public.import_autocount_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role         app_role;
  v_dealer_id    uuid;
  v_src_system   text;
  v_src_ref      text[];
  v_existing     record;
  v_order_id     uuid;
  v_so           int;
  v_items_edited boolean := false;  -- 0135: locks items array on re-import
  v_skip_lines   boolean := false;  -- 0135: derived guard
  v_line         jsonb;
  v_result       text;
begin
  v_role := public.app_role();
  if v_role not in ('operation','principal') then
    raise exception 'forbidden: import is operation/principal only'
      using errcode = '42501';
  end if;

  v_dealer_id  := nullif(payload->>'dealer_id','')::uuid;
  v_src_system := coalesce(nullif(payload->>'source_system',''), 'autocount');
  select array_agg(value::text)
    into v_src_ref
    from jsonb_array_elements_text(coalesce(payload->'source_ref','[]'::jsonb));

  if v_dealer_id is null then
    raise exception 'dealer_id is required' using errcode = '22023';
  end if;
  if v_src_ref is null or array_length(v_src_ref,1) is null then
    raise exception 'source_ref must be a non-empty array' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(payload->'lines','[]'::jsonb)) = 0 then
    raise exception 'order must have at least one line' using errcode = '22023';
  end if;

  -- Idempotent lookup on the natural key (now also reads items_edited).
  select id, so, status, items_edited
    into v_existing
    from orders
   where source_system = v_src_system
     and source_ref    = v_src_ref;

  if found then
    -- Never clobber an order already moving through fulfilment.
    if v_existing.status <> 'place' then
      return jsonb_build_object(
        'id', v_existing.id, 'so', v_existing.so,
        'source_ref', to_jsonb(v_src_ref), 'result', 'skipped_locked');
    end if;

    v_items_edited := coalesce(v_existing.items_edited, false);
    v_skip_lines   := v_items_edited;  -- 0135: portal-wins guard

    -- Non-item fields always re-import from AutoCount (phone/address/date/
    -- balance/channel genuinely change AutoCount-side).
    update orders set
      dealer_id                = v_dealer_id,
      channel                  = coalesce(nullif(payload->>'channel',''), 'dealer'),
      customer_name            = payload->>'customer_name',
      customer_phone           = nullif(payload->>'customer_phone',''),
      customer_address         = nullif(payload->>'customer_address',''),
      customer_address_unknown = coalesce((payload->>'customer_address_unknown')::boolean, false),
      delivery_date            = nullif(payload->>'delivery_date','')::date,
      delivery_date_tbd        = coalesce((payload->>'delivery_date_tbd')::boolean, false),
      paid                     = coalesce((payload->>'paid')::numeric, 0),
      updated_at               = now()
    where id = v_existing.id
    returning id, so into v_order_id, v_so;

    if not v_skip_lines then
      -- AutoCount wins items: replace lines.
      delete from order_lines where order_id = v_order_id;
    end if;
    v_result := case when v_skip_lines then 'updated_items_locked' else 'updated' end;
  else
    insert into orders (
      dealer_id, channel,
      customer_name, customer_phone, customer_address, customer_address_unknown,
      delivery_date, delivery_date_tbd,
      paid, terms_accepted,
      source_system, source_ref
    ) values (
      v_dealer_id,
      coalesce(nullif(payload->>'channel',''), 'dealer'),
      payload->>'customer_name',
      nullif(payload->>'customer_phone',''),
      nullif(payload->>'customer_address',''),
      coalesce((payload->>'customer_address_unknown')::boolean, false),
      nullif(payload->>'delivery_date','')::date,
      coalesce((payload->>'delivery_date_tbd')::boolean, false),
      coalesce((payload->>'paid')::numeric, 0),
      false,
      v_src_system,
      v_src_ref
    )
    returning id, so into v_order_id, v_so;
    v_result := 'created';
  end if;

  -- Insert lines (skip when locked on re-import — portal items preserved).
  if not v_skip_lines then
    for v_line in select * from jsonb_array_elements(payload->'lines') loop
      insert into order_lines (order_id, sku, qty, attrs, unit_price, source_po)
      values (
        v_order_id,
        v_line->>'sku',
        coalesce((v_line->>'qty')::int, 1),
        v_line->'attrs',
        coalesce((v_line->>'unit_price')::numeric, 0),
        nullif(v_line->>'source_po','')
      );
    end loop;
  end if;

  insert into order_history (order_id, text, by_role)
  values (
    v_order_id,
    case
      when v_skip_lines then format(
        'AutoCount re-import · %s · items preserved (portal-edited)', array_to_string(v_src_ref,' + '))
      else format(
        'AutoCount import (%s) · %s', v_result, array_to_string(v_src_ref,' + '))
    end,
    v_role
  );

  insert into audit_log (role, action, dealer_id, ref)
  values (
    v_role,
    case when v_skip_lines then 'order.imported.items_locked' else 'order.imported' end,
    v_dealer_id,
    array_to_string(v_src_ref, ' + ')
  );

  return jsonb_build_object(
    'id', v_order_id,
    'so', v_so,
    'source_ref', to_jsonb(v_src_ref),
    'result', v_result
  );
end;
$$;

revoke all on function public.import_autocount_order(jsonb) from public;
grant execute on function public.import_autocount_order(jsonb) to authenticated;

-- =============================================================================
-- Sanity
-- =============================================================================
DO $sanity$
DECLARE
  has_col int; fn_count int;
BEGIN
  SELECT count(*) INTO has_col
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='orders' AND column_name='items_edited';
  IF has_col <> 1 THEN
    RAISE EXCEPTION '0135 sanity: orders.items_edited missing';
  END IF;
  SELECT count(*) INTO fn_count
    FROM pg_proc WHERE proname='import_autocount_order';
  IF fn_count <> 1 THEN
    RAISE EXCEPTION '0135 sanity: import_autocount_order missing or duplicated (%)', fn_count;
  END IF;
  RAISE NOTICE '0135 OK: orders.items_edited added; import_autocount_order updated with items-lock guard';
END $sanity$;
