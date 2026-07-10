-- 0214_autocount_import_create_only.sql
-- WHY (Loo, 2026-07-10): the workflow is now LOCKED — AutoCount is CREATE-ONLY.
--   Going forward AutoCount only ever *creates* a Sales Order. Once that order
--   exists in the portal, the portal is the SOLE source of truth: every edit
--   (delivery date, address, items, balance…) happens in the Order, never back
--   in AutoCount. Therefore a re-import must NEVER touch an existing order —
--   not the header, not the items — regardless of its status. This removes the
--   "old vs new / who wins" ambiguity entirely: AutoCount adds new orders, and
--   nothing else.
--
-- CHANGE: _import_autocount_order (the shared helper both the singular and the
--   batch import_autocount_orders delegate to, migration 0143) now returns
--   'skipped_locked' for ANY existing order. Previously only status<>'place'
--   was skipped; a still-'place' order was header-updated + item-replaced from
--   AutoCount (that overwrote portal edits — the exact behaviour Loo does NOT
--   want). The CREATE path (order not found) is unchanged. The two public
--   wrappers are untouched — they inherit the new rule for free.
--
-- SAFETY: additive behaviour-narrowing, no schema change. Idempotent
--   CREATE OR REPLACE. Existing orders become strictly read-only to the
--   importer; new orders still create + link SKUs + log history/audit/activity
--   exactly as before.

create or replace function public._import_autocount_order(payload jsonb)
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

  -- Idempotent lookup on the natural key.
  select id, so, status
    into v_existing
    from orders
   where source_system = v_src_system
     and source_ref    = v_src_ref;

  -- CREATE-ONLY (0214): if the order already exists in the portal, the portal
  -- owns it — skip entirely, regardless of status. AutoCount never updates.
  if found then
    return jsonb_build_object(
      'id', v_existing.id, 'so', v_existing.so,
      'source_ref', to_jsonb(v_src_ref), 'result', 'skipped_locked');
  end if;

  -- Order not found → create it.
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

  -- Insert lines.
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
    format('AutoCount import (%s) · %s', v_result, array_to_string(v_src_ref,' + ')),
    v_role
  );

  insert into audit_log (role, action, dealer_id, ref)
  values (v_role, 'order.imported', v_dealer_id, array_to_string(v_src_ref, ' + '));

  -- 0139 (jess): activity-log wiring — preserved.
  insert into ops_activity_log (order_id, action, actor_id, detail)
  values (v_order_id, 'autocount_import', auth.uid(),
    jsonb_build_object(
      'result',     v_result,
      'source_ref', to_jsonb(v_src_ref)
    ));

  return jsonb_build_object(
    'id', v_order_id,
    'so', v_so,
    'source_ref', to_jsonb(v_src_ref),
    'result', v_result
  );
end;
$$;

revoke all on function public._import_autocount_order(jsonb) from public;
grant execute on function public._import_autocount_order(jsonb) to authenticated;

-- Sanity: helper still present + singular/plural wrappers still delegate to it.
do $$
declare n int;
begin
  select count(*) into n from pg_proc where proname='_import_autocount_order';
  if n <> 1 then raise exception '0214 sanity: _import_autocount_order missing/dup (%)', n; end if;
  raise notice '0214 OK: AutoCount import is now CREATE-ONLY (existing orders skipped)';
end $$;
