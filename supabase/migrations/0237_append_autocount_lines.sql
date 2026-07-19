-- 0237_append_autocount_lines.sql
-- WHY (Jess, 2026-07-18 — Option A "Import 顺手补"): the Master "Ops" sheet
--   sometimes carries a line the portal order is MISSING (e.g. TCF0544 /
--   SO-1138: customer bought TWO sofas, the AutoCount export only had one).
--   0214 locked re-import to create-only — an existing order is never touched
--   silently — so there was NO door to add the missing line. This RPC is that
--   door: an EXPLICIT, operation-reviewed append (the Master-import result
--   screen lists "sheet has it, portal doesn't" candidates; the operator ticks
--   which to add). It never updates or deletes existing lines.
--
-- SCOPE: AutoCount-sourced orders only (native orders have the POS add-product
--   flow, 0231/0233). Lines are appended RAW — sku = the Master "Item Detail"
--   text, unit_price 0 (AutoCount orders carry no per-line prices), source_po
--   from the sheet. items_edited flips true (portal-wins guard: a future
--   accept-autocount-items reset is the only way AutoCount replaces items).
--
-- SAFETY: additive (one new fn, no table/RLS change). Idempotency is the
--   caller's job (the import screen only offers lines whose PO is absent from
--   the order); the fn itself re-checks nothing beyond shape + role + source.
create or replace function public.append_autocount_order_lines(
  p_order_id uuid,
  p_lines    jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_order orders;
  v_role  app_role;
  v_line  jsonb;
  v_count int := 0;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden: operation or principal only' using errcode = '42501';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = '42P01';
  end if;
  if coalesce(v_order.source_system, '') <> 'autocount' then
    raise exception 'Only AutoCount-imported orders take Master appends'
      using errcode = '22023', detail = 'not_autocount';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'Order is cancelled' using errcode = '22023', detail = 'wrong_status';
  end if;

  if jsonb_typeof(p_lines) is distinct from 'array'
     or jsonb_array_length(p_lines) < 1
     or jsonb_array_length(p_lines) > 30
     or pg_column_size(p_lines) > 16384 then
    raise exception 'p_lines must be an array of 1..30 lines (<=16KB)'
      using errcode = '22023', detail = 'invalid_lines';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if coalesce(btrim(v_line->>'sku'), '') = ''
       or length(v_line->>'sku') > 200
       or coalesce((v_line->>'qty')::int, 0) < 1
       or coalesce((v_line->>'qty')::int, 0) > 999 then
      raise exception 'each line needs sku (<=200 chars) + qty 1..999'
        using errcode = '22023', detail = 'invalid_lines';
    end if;
    insert into order_lines (order_id, sku, qty, attrs, unit_price, source_po)
    values (
      p_order_id,
      btrim(v_line->>'sku'),
      (v_line->>'qty')::int,
      coalesce(v_line->'attrs', '{}'::jsonb)
        || jsonb_build_object('master_append', true),
      0,
      nullif(btrim(coalesce(v_line->>'source_po', '')), '')
    );
    v_count := v_count + 1;
  end loop;

  update orders
     set items_edited = true,
         updated_at   = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role, metadata)
  values (
    p_order_id,
    format('%s line(s) appended from the Master sheet (portal was missing them)', v_count),
    v_role,
    jsonb_build_object('kind', 'master_lines_appended', 'count', v_count)
  );
  insert into audit_log (role, action, dealer_id, ref)
  values (v_role, 'order.master_lines_appended', v_order.dealer_id, 'SO-' || v_order.so::text);

  return jsonb_build_object('id', p_order_id, 'appended', v_count);
end;
$$;

REVOKE ALL ON FUNCTION public.append_autocount_order_lines(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.append_autocount_order_lines(uuid, jsonb) TO authenticated, service_role;
