-- =============================================================================
-- 0143_autocount_import_batch.sql — Batch the AutoCount import into ONE RPC
-- 2026-05-21 (Loo authorised in conversation per CLAUDE.md §7 + §14 #2).
--
-- WHY: POST /api/orders/import looped the per-order RPC import_autocount_order
-- once per grouped order. On Cloudflare Workers Free plan a single invocation
-- is hard-capped at 50 subrequests; each RPC call is one subrequest. A 115-order
-- listing therefore did 1 catalog read + 115 RPCs = 116 subrequests — the first
-- 49 (catalog + 48 orders) ran, the rest threw
--   "Too many subrequests by single Worker invocation".
-- That is exactly what Loo saw: 48 updated, 67 failed.
--
-- FIX (root cause, not symptom): collapse the N per-order subrequests into ONE.
--   1. Extract the single-order body into an internal helper
--      _import_autocount_order(payload jsonb). Its body MIRRORS the live
--      function as of migration 0139 — i.e. 0135's items-lock logic PLUS the
--      ops_activity_log INSERT that 0139 ("wire activity log into 7 RPCs")
--      added. We must keep that INSERT here, otherwise re-creating the function
--      would silently strip 0139's activity-log wiring from imports.
--   2. Re-point the public import_autocount_order(payload) at the helper as a
--      thin wrapper — behaviour is byte-identical, every existing caller keeps
--      working.
--   3. Add import_autocount_orders(payloads jsonb) that loops the helper inside
--      ONE transaction, each order wrapped in its own BEGIN/EXCEPTION sub-
--      transaction so a single bad order is reported as 'error' WITHOUT aborting
--      the batch — mirroring the API's prior per-order try/catch-and-continue.
--
-- After this the import does a CONSTANT 2 subrequests (catalog read + 1 batch
-- RPC) no matter whether the listing is 50 orders or 5000.
--
-- ORDERING: numbered 0143 because jess's concurrent work already took 0138
-- (order_annotations), 0139 (wire_activity_log), 0140 (service_notes), 0142
-- (service_note_stage). Runs AFTER 0139, so ops_activity_log already exists.
--
-- NOTE: thread creation is still owned by the proceed flow (see 0132 header);
-- this migration only changes HOW the import writes orders/lines, not WHAT.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Internal helper — single-order body, mirroring the LIVE function (0135 +
--    0139's ops_activity_log INSERT). SECURITY DEFINER + pinned search_path
--    identical to the public functions. NOT granted to `authenticated`: it is
--    callable only from the two public wrappers below, which run as the owner
--    and so retain execute rights.
-- -----------------------------------------------------------------------------
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

  -- Idempotent lookup on the natural key (also reads items_edited).
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

  -- 0139 (jess): activity-log wiring — preserved verbatim so re-creating this
  -- function does not strip the import's activity trail.
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

-- -----------------------------------------------------------------------------
-- 2. Singular public RPC — now a thin delegate. Behaviour unchanged for every
--    existing caller; the logic lives in the shared helper above.
-- -----------------------------------------------------------------------------
create or replace function public.import_autocount_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public._import_autocount_order(payload);
end;
$$;

revoke all on function public.import_autocount_order(jsonb) from public;
grant execute on function public.import_autocount_order(jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Batch public RPC — loop the helper once per payload, ONE subrequest total.
--    Returns a jsonb ARRAY of per-order results IN INPUT ORDER so the API can
--    zip them back to its per-group unmatched-SKU metadata by index. A caught
--    exception becomes a {result:'error', error:<msg>} element instead of
--    aborting the batch (per-order subtransaction via BEGIN/EXCEPTION).
-- -----------------------------------------------------------------------------
create or replace function public.import_autocount_orders(payloads jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role    app_role;
  v_payload jsonb;
  v_one     jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  v_role := public.app_role();
  if v_role not in ('operation','principal') then
    raise exception 'forbidden: import is operation/principal only'
      using errcode = '42501';
  end if;

  if payloads is null or jsonb_typeof(payloads) <> 'array' then
    raise exception 'payloads must be a JSON array' using errcode = '22023';
  end if;

  for v_payload in select * from jsonb_array_elements(payloads) loop
    begin
      v_one := public._import_autocount_order(v_payload);
    exception when others then
      -- Isolate the failure to this order; the rest of the batch still commits.
      v_one := jsonb_build_object(
        'id', null,
        'so', null,
        'source_ref', coalesce(v_payload->'source_ref', '[]'::jsonb),
        'result', 'error',
        'error', SQLERRM
      );
    end;
    v_results := v_results || jsonb_build_array(v_one);
  end loop;

  return v_results;
end;
$$;

revoke all on function public.import_autocount_orders(jsonb) from public;
grant execute on function public.import_autocount_orders(jsonb) to authenticated;

-- =============================================================================
-- Sanity
-- =============================================================================
do $sanity$
declare
  n_helper int; n_singular int; n_plural int; n_actlog int;
begin
  select count(*) into n_helper   from pg_proc where proname='_import_autocount_order';
  select count(*) into n_singular from pg_proc where proname='import_autocount_order';
  select count(*) into n_plural   from pg_proc where proname='import_autocount_orders';
  if n_helper   <> 1 then raise exception '0143 sanity: _import_autocount_order missing/dup (%)', n_helper; end if;
  if n_singular <> 1 then raise exception '0143 sanity: import_autocount_order missing/dup (%)', n_singular; end if;
  if n_plural   <> 1 then raise exception '0143 sanity: import_autocount_orders missing/dup (%)', n_plural; end if;
  -- Guard: the helper MUST still wire ops_activity_log (0139 preservation).
  select count(*) into n_actlog
    from pg_proc
   where proname='_import_autocount_order'
     and pg_get_functiondef(oid) ilike '%ops_activity_log%';
  if n_actlog <> 1 then
    raise exception '0143 sanity: helper lost the 0139 ops_activity_log INSERT';
  end if;
  raise notice '0143 OK: batch import_autocount_orders added; singular delegates to shared helper; activity-log preserved';
end $sanity$;
