-- 0231 — Add-product initiative P1 (Loo 2026-07-18; design:
-- docs/superpowers/plans/2026-07-18-order-add-product-initiative.md).
--
-- Opens the FIRST post-create write path for order_lines, append-only:
--
--   * `add_order_lines` RPC — appends validated, HONO-PRICED lines to a
--     PLACE-lane order (status='place', ops untouched, not an AutoCount
--     import). All intelligence (0089 mutex, server catalog pricing, special
--     add-ons + option-picks recompute) runs in the Hono route BEFORE this
--     RPC; the RPC re-checks the cheap invariants defensively (status gate,
--     sku existence, merged-cart mutex) and never edits existing rows.
--     `p_source` / `p_change_request_id` params ship now for signature
--     stability; only 'direct' is implemented — P3 (submission + approval)
--     extends via CREATE OR REPLACE without a grant-losing DROP.
--
--   * `order_change_requests` table — the P3 submission ledger, shipped
--     DORMANT: RLS allows reads (internal + own-dealer) but NO write policy
--     exists yet, so nothing can insert/update it until P3's migration adds
--     the flow. One pending request per order (partial unique).
--
-- create_order / update_order / existing order_lines rows are UNTOUCHED.

-- ---------------------------------------------------------------------------
-- 1) order_change_requests (dormant until P3)
-- ---------------------------------------------------------------------------

create table if not exists order_change_requests (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  kind          text not null check (kind in ('add_lines')),
  /** DraftLine[] as submitted (sku/qty/attrs + client preview prices). */
  payload       jsonb not null,
  status        text not null default 'pending'
                check (status in ('pending','approved','rejected','cancelled')),
  requested_by  uuid,
  requested_at  timestamptz not null default now(),
  decided_by    uuid,
  decided_at    timestamptz,
  decision_note text,
  /** Stamped when the approved payload was applied (idempotency guard). */
  applied_at    timestamptz
);

-- One live submission per order — prevents request spam + ambiguous approvals.
create unique index if not exists order_change_requests_one_pending
  on order_change_requests (order_id) where (status = 'pending');

create index if not exists order_change_requests_order_idx
  on order_change_requests (order_id, requested_at desc);

alter table order_change_requests enable row level security;

-- Read: internal roles + the order's own dealer (0227 pattern, InitPlan-wrapped).
-- NO insert/update/delete policy in P1 — the table is read-only-dormant until
-- P3 ships the submission flow + decide RPC.
create policy "order_change_requests_select_scoped"
on public.order_change_requests
for select
to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = order_change_requests.order_id
      and (
        ( select is_internal() )
        or o.dealer_id = ( select app_dealer_id() )
      )
  )
);

-- ---------------------------------------------------------------------------
-- 2) add_order_lines — append-only line write, Hono-priced
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.add_order_lines(
  p_order_id uuid,
  p_lines jsonb,
  p_source text DEFAULT 'direct',
  p_change_request_id uuid DEFAULT NULL
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

  -- P1 implements the DIRECT gate only. 'change_request' arrives in P3 via
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

  if jsonb_typeof(p_lines) is distinct from 'array'
     or jsonb_array_length(p_lines) < 1
     or jsonb_array_length(p_lines) > 10 then
    raise exception 'p_lines must be an array of 1..10 lines'
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
      'total_delta', v_delta
    )
  );

  insert into audit_log (role, action, dealer_id, ref)
  values (v_role, 'order.lines_added', v_order.dealer_id, 'SO-' || v_order.so::text);

  return jsonb_build_object('id', p_order_id, 'added', v_count, 'total_delta', v_delta);
end;
$function$;

REVOKE ALL ON FUNCTION public.add_order_lines(uuid, jsonb, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.add_order_lines(uuid, jsonb, text, uuid) TO authenticated, service_role;
