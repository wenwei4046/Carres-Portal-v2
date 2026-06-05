-- =============================================================================
-- 0156_delivery_stops.sql — Multi-leg delivery chain (γ architecture)
-- 2026-06-05 (Loo authorised in conversation per CLAUDE.md §7 + §14 #2).
--
-- WHY: Carres started taking cross-state (KL→Johor) + cross-border (Johor→
-- Singapore) orders. The existing `orders.delivery_partner_id` assumes one
-- partner per order — fine for 95% of Klang-Valley deliveries but breaks
-- visibility on multi-party chains (NETS → Teow → EU, etc.).
--
-- Five business risks the single-partner model leaves open:
--   1. "Where is my furniture?" — can't answer mid-chain
--   2. Damage dispute between consecutive partners — no per-leg POD
--   3. Late-delivery root cause — no per-leg ETA / actual
--   4. Month-end 3-way invoice reconciliation — no per-leg fee
--   5. Partner reliability metrics (on-time %) — no per-leg outcomes
--
-- DESIGN (γ — minimal hybrid):
--   • `orders.delivery_partner_id` stays as the PRIMARY partner (first leg
--     / Carres-side coordinator). Existing single-leg flow is byte-identical.
--   • NEW `orders.delivery_stops jsonb` is OPTIONAL. Null/empty = single-leg
--     (current behaviour, ignore the column). 1+ elements = multi-leg chain.
--   • Each stop in the array is documented in the column COMMENT below.
--   • Two SECURITY DEFINER RPCs cover all writes:
--       - set_delivery_chain(order_id, stops_array)  — operation sets the route
--       - patch_delivery_stop(order_id, leg, patch)  — partial updates per leg
--     (mark picked_up / handed_off / delivered, attach POD url, add notes)
--
-- WHY jsonb not a separate `order_delivery_legs` table:
--   • 80%+ of orders are single-leg (Klang Valley); table-per-leg adds an
--     extra join + row for cases that don't need it.
--   • Multi-leg ratio is unknown in real ops data — start with jsonb (no
--     migration cost) so we can collect 3 months of stats. If multi-leg
--     ratio ≥30% OR per-partner reliability dashboards become a real ask,
--     promote to a relational table (β) — the jsonb shape mirrors the
--     would-be row shape, so backfill is one INSERT … SELECT.
--   • This decision is recorded in CLAUDE.md §17.5 as a CF revisit gate.
--
-- POD upload (per-leg photo at handoff/delivery) is operation-driven in
-- Phase 1 (Carres ops uploads on partners' behalf). Partner self-service
-- comes later via PrincipalAccounts UI + a stripped-down partner portal
-- (big buttons, BM/Chinese labels — Loo noted partners aren't English-
-- fluent / computer-savvy).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Column
-- -----------------------------------------------------------------------------
alter table orders
  add column if not exists delivery_stops jsonb;

comment on column orders.delivery_stops is
  '2026-06-05 (γ multi-leg). Null or empty array = single-leg, ignore (read delivery_partner_id). '
  'Otherwise an ordered array of leg objects:'
  '{ "leg": int (1-based),'
  '  "partner_id": uuid,'
  '  "partner_name": text (denormalised for display),'
  '  "from_loc": text (e.g. "Klang WH"),'
  '  "to_loc":   text (e.g. "JB Transit" or final customer address),'
  '  "scheduled_at":  timestamptz or null (planned),'
  '  "picked_up_at":  timestamptz or null (when partner collected),'
  '  "handed_off_at": timestamptz or null (when handed to next leg, last leg = null),'
  '  "delivered_at":  timestamptz or null (only meaningful for the FINAL leg),'
  '  "pod_url":       text or null (storage path to handoff/delivery photo),'
  '  "pod_signed_by": text or null (name of person who acknowledged at handoff),'
  '  "notes":         text or null (free remark from operation/partner),'
  '  "status":        text — one of pending|picked_up|handed_off|delivered|issue }'
  'Writes go through set_delivery_chain() / patch_delivery_stop() RPCs.';

-- -----------------------------------------------------------------------------
-- 2. GIN index — enables "find orders where any leg has partner X" filter
--     used by the upcoming Orders kanban partner-filter chip.
--     `jsonb_path_ops` is the cheaper variant (only supports @> containment,
--     which is all we need).
-- -----------------------------------------------------------------------------
create index if not exists orders_delivery_stops_gin
  on orders using gin (delivery_stops jsonb_path_ops);

-- -----------------------------------------------------------------------------
-- 3. RPC — set / replace the entire delivery chain for an order.
--     Operation calls this from the order detail drawer "Edit chain" form.
--     Validates: caller role, jsonb is an array, leg numbers are 1..N
--     contiguous, each stop has the required keys + a known partner_id.
-- -----------------------------------------------------------------------------
create or replace function public.set_delivery_chain(
  p_order_id uuid,
  p_stops    jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role         app_role;
  v_n            int;
  v_i            int;
  v_stop         jsonb;
  v_partner_id   uuid;
  v_partner_name text;
begin
  v_role := public.app_role();
  if v_role not in ('operation','principal') then
    raise exception 'forbidden: only operation/principal can set delivery chain'
      using errcode = '42501';
  end if;

  if p_stops is null or jsonb_typeof(p_stops) <> 'array' then
    raise exception 'p_stops must be a JSON array (empty array clears the chain)'
      using errcode = '22023';
  end if;

  v_n := jsonb_array_length(p_stops);

  -- Validate each leg: contiguous numbering 1..N, partner exists, required keys.
  for v_i in 0 .. (v_n - 1) loop
    v_stop := p_stops -> v_i;
    if (v_stop ->> 'leg')::int is distinct from (v_i + 1) then
      raise exception 'leg numbering must be contiguous 1..N (got % at index %)',
        v_stop ->> 'leg', v_i using errcode = '22023';
    end if;
    if v_stop ->> 'partner_id' is null or v_stop ->> 'from_loc' is null
       or v_stop ->> 'to_loc' is null then
      raise exception 'leg % missing one of required keys (partner_id, from_loc, to_loc)',
        v_i + 1 using errcode = '22023';
    end if;
    v_partner_id := (v_stop ->> 'partner_id')::uuid;
    select name into v_partner_name from delivery_partners where id = v_partner_id;
    if v_partner_name is null then
      raise exception 'leg %: partner_id % not in delivery_partners',
        v_i + 1, v_partner_id using errcode = '22023';
    end if;
  end loop;

  update orders
     set delivery_stops = case when v_n = 0 then null else p_stops end,
         updated_at     = now()
   where id = p_order_id;
  if not found then
    raise exception 'order % not found', p_order_id using errcode = '42P01';
  end if;
end;
$$;

revoke all on function public.set_delivery_chain(uuid, jsonb) from public;
grant execute on function public.set_delivery_chain(uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. RPC — patch a single leg (mark picked_up / handed_off / delivered,
--     attach POD url, add notes). Frontend sends a sparse jsonb patch; we
--     merge it onto the existing stop and overwrite the array slot.
--     Atomic UPDATE; no read-modify-write races.
-- -----------------------------------------------------------------------------
create or replace function public.patch_delivery_stop(
  p_order_id uuid,
  p_leg      int,
  p_patch    jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role     app_role;
  v_stops    jsonb;
  v_idx      int := p_leg - 1;            -- jsonb arrays are 0-indexed
  v_existing jsonb;
  v_merged   jsonb;
  v_now      timestamptz := now();
begin
  v_role := public.app_role();
  if v_role not in ('operation','principal') then
    raise exception 'forbidden: only operation/principal can patch delivery stops'
      using errcode = '42501';
  end if;

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'p_patch must be a JSON object' using errcode = '22023';
  end if;

  select delivery_stops into v_stops from orders where id = p_order_id for update;
  if v_stops is null or jsonb_typeof(v_stops) <> 'array' then
    raise exception 'order % has no delivery chain — call set_delivery_chain first',
      p_order_id using errcode = '22023';
  end if;
  v_existing := v_stops -> v_idx;
  if v_existing is null then
    raise exception 'leg % does not exist on order %', p_leg, p_order_id
      using errcode = '22023';
  end if;

  -- Convenience: if the patch sets `status` to one of the milestone values
  -- and the corresponding timestamp isn't already set in the patch, stamp
  -- `now()` automatically so the frontend can stay dumb.
  v_merged := v_existing || p_patch;
  if (p_patch ->> 'status') = 'picked_up' and v_merged ->> 'picked_up_at' is null then
    v_merged := v_merged || jsonb_build_object('picked_up_at', v_now);
  end if;
  if (p_patch ->> 'status') = 'handed_off' and v_merged ->> 'handed_off_at' is null then
    v_merged := v_merged || jsonb_build_object('handed_off_at', v_now);
  end if;
  if (p_patch ->> 'status') = 'delivered' and v_merged ->> 'delivered_at' is null then
    v_merged := v_merged || jsonb_build_object('delivered_at', v_now);
  end if;

  update orders
     set delivery_stops = jsonb_set(v_stops, array[v_idx::text], v_merged),
         updated_at     = v_now
   where id = p_order_id;

  return v_merged;
end;
$$;

revoke all on function public.patch_delivery_stop(uuid, int, jsonb) from public;
grant execute on function public.patch_delivery_stop(uuid, int, jsonb) to authenticated;

-- =============================================================================
-- Sanity
-- =============================================================================
do $sanity$
declare
  n_col     int;
  n_idx     int;
  n_set     int;
  n_patch   int;
begin
  select count(*) into n_col from information_schema.columns
    where table_schema='public' and table_name='orders' and column_name='delivery_stops';
  if n_col <> 1 then raise exception '0156 sanity: orders.delivery_stops missing'; end if;

  select count(*) into n_idx from pg_indexes
    where tablename='orders' and indexname='orders_delivery_stops_gin';
  if n_idx <> 1 then raise exception '0156 sanity: orders_delivery_stops_gin missing'; end if;

  select count(*) into n_set from pg_proc where proname='set_delivery_chain';
  if n_set <> 1 then raise exception '0156 sanity: set_delivery_chain missing/dup (%)', n_set; end if;

  select count(*) into n_patch from pg_proc where proname='patch_delivery_stop';
  if n_patch <> 1 then raise exception '0156 sanity: patch_delivery_stop missing/dup (%)', n_patch; end if;

  raise notice '0156 OK: multi-leg delivery_stops column + GIN index + 2 RPCs ready';
end $sanity$;
