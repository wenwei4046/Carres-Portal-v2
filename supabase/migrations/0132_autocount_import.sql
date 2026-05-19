-- =============================================================================
-- 0132_autocount_import.sql — AutoCount order-import door (contract §1.5)
-- 2026-05-19 (Loo authorised in conversation per CLAUDE.md §7 + §14 #1).
--
-- WHY: real Carres operation starts in AutoCount, not the portal. Operation
-- exports an Excel "listing" and (today) pastes it into a Google Sheet to
-- control everything. We are replacing the sheet. The listing becomes the
-- single front door via POST /api/orders/import. See
-- docs/autocount-import-contract.md.
--
-- The existing create_order RPC (0006) is for the dealer wizard and REQUIRES
-- fields AutoCount lacks (signature/salesperson/slip/deposit) and force-keys
-- its own `so`. It also has no place to store AutoCount's Ref / PO Doc No.,
-- so its idempotency (re-import = upsert not duplicate) is impossible.
--
-- This migration: (1) adds source-tracking columns + an idempotency key, and
-- (2) adds a SIBLING RPC import_autocount_order. create_order is NOT touched.
--
-- SCOPE NOTE: imported orders land at status='place', exactly like a freshly
-- created dealer order. They do NOT create order_supplier_threads here —
-- thread creation is owned by the existing proceed flow
-- (operation_confirm_proceed_request_v3, per-line + SOP-aware). Imported
-- orders go through that SAME path afterward, so downstream behaviour is
-- identical without duplicating thread logic here.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Source-tracking columns
-- -----------------------------------------------------------------------------
alter table orders
  add column if not exists source_system text,
  add column if not exists source_ref    text[];

alter table order_lines
  add column if not exists source_po text;

comment on column orders.source_system is
  'Origin of an imported order, e.g. ''autocount''. NULL for portal-native orders.';
comment on column orders.source_ref is
  'AutoCount Ref set for this order (combined refs kept as array, e.g. {TCF0282,CR1009}). NULL for portal-native orders.';
comment on column order_lines.source_po is
  'AutoCount "PO Doc No." for this line (e.g. PO/2604-046). NULL for portal-native lines.';

-- Idempotency key: re-importing the same (source_system, source_ref) upserts,
-- never duplicates. Partial so portal-native orders (NULL source_system) are
-- unaffected. Array equality is well-defined in Postgres.
create unique index if not exists orders_source_unique
  on orders (source_system, source_ref)
  where source_system is not null;

-- -----------------------------------------------------------------------------
-- 2. import_autocount_order(payload jsonb) → jsonb
--    { id, so, source_ref, result: 'created'|'updated'|'skipped_locked' }
--
-- Sibling of create_order. SECURITY DEFINER so it can also write audit_log;
-- the operation/principal role gate is re-checked manually at the top.
-- One order per call (same cardinality as create_order); the API loops the
-- grouped rows and aggregates a per-order report.
-- -----------------------------------------------------------------------------
create or replace function public.import_autocount_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role        app_role;
  v_dealer_id   uuid;
  v_src_system  text;
  v_src_ref     text[];
  v_existing    record;
  v_order_id    uuid;
  v_so          int;
  v_line        jsonb;
  v_result      text;
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

  -- Idempotent lookup on the natural key.
  select id, so, status
    into v_existing
    from orders
   where source_system = v_src_system
     and source_ref    = v_src_ref;

  if found then
    -- Never clobber an order already moving through fulfilment. Operation
    -- works imported orders in the portal after import; a re-import must not
    -- rewind a proceeded/delivered order.
    if v_existing.status <> 'place' then
      return jsonb_build_object(
        'id', v_existing.id, 'so', v_existing.so,
        'source_ref', to_jsonb(v_src_ref), 'result', 'skipped_locked');
    end if;

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

    delete from order_lines where order_id = v_order_id;
    v_result := 'updated';
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

  -- Lines. sku is text (not an FK): the API passes the resolved SKU master
  -- Item Code, or the raw AutoCount Description when unresolved, so nothing
  -- is ever lost. source_po preserves the AutoCount PO Doc No. verbatim.
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

  insert into order_history (order_id, text, by_role)
  values (
    v_order_id,
    format('AutoCount import (%s) · %s', v_result, array_to_string(v_src_ref, ' + ')),
    v_role
  );

  insert into audit_log (role, action, dealer_id, ref)
  values (
    v_role,
    'order.imported',
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
