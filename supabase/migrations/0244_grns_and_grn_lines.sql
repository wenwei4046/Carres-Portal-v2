-- 0244_grns_and_grn_lines.sql — introduce GRN (Goods Received Note) as a
-- first-class entity so every receive event has its own header row +
-- per-line accept/reject/reason breakdown, its own numbered doc, and a
-- reprintable audit trail.
--
-- Why: `ReceivePOModal` + `operation_receive_po_with_do` (mig 0045→0154)
-- already handles per-line partial receive, required supplier DO#, required
-- signed DO file upload, and thread advance. What's missing (P1 gap):
--   1. no `grns` header row per receive event → can't reprint / list
--      receive events as their own entity;
--   2. no cross-PO receive LIST page;
--   3. no Recv/Acc/Rej/Reason split (received_qty is a single number);
--   4. no Carres-branded GRN PDF.
--
-- Design (path A · 2026-07-24 owner-locked):
--   * Do NOT modify the proven 4-arg operation_receive_po_with_do RPC.
--   * Add a wrapper RPC operation_receive_po_with_grn that:
--       - PERFORMs the untouched inner RPC (all heavy business logic —
--         stock_balances, ops_stock_items, thread advance, reserve, rollup —
--         stays byte-identical);
--       - THEN inserts a `grns` header row + one `grn_lines` per received
--         line with the acc/rej/reason split;
--       - all in one enclosing transaction — any inner exception rolls back
--         both the receive AND the grn insert (SECURITY DEFINER + PERFORM).
--   * grn_number = GRN-DDMMYY-NNNN, 4-digit tail hashed from the grn uuid.
--     Deterministic (reprint-stable), volume-private, per doc-number scheme
--     locked 2026-07-19 (packages/shared/src/doc-number.ts).

begin;

-- ==================================================================
-- 1. TABLES
-- ==================================================================

create table if not exists public.grns (
  id                uuid        primary key default gen_random_uuid(),
  grn_number        text        not null unique,
  po_id             text        not null references public.purchase_orders(id) on delete restrict,
  supplier_id       uuid        references public.suppliers(id) on delete restrict,
  warehouse_id      uuid        references public.warehouses(id) on delete restrict,
  do_number         text,
  do_file_path      text,
  received_by       uuid        references public.app_users(id) on delete set null,
  received_by_name  text,       -- snapshot for audit stability (survives user delete)
  status            text        not null default 'confirmed' check (status in ('draft', 'confirmed')),
  notes             text,
  received_at       timestamptz not null default now(),
  confirmed_at      timestamptz default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.grns is
  'Goods Received Note header — one row per receive event (batched from ReceivePOModal). Extends operation_receive_po_with_do by materializing the receive event as its own numbered, listable, printable doc.';

create table if not exists public.grn_lines (
  id                uuid        primary key default gen_random_uuid(),
  grn_id            uuid        not null references public.grns(id) on delete cascade,
  po_line_id        uuid        not null references public.purchase_order_lines(id) on delete restrict,
  sku               text        not null,
  ordered_qty       int         not null,
  qty_received      int         not null check (qty_received >= 0),
  qty_accepted      int         not null check (qty_accepted >= 0),
  qty_rejected      int         not null default 0 check (qty_rejected >= 0),
  rejection_reason  text,
  created_at        timestamptz not null default now(),
  constraint grn_lines_qty_split check (qty_received = qty_accepted + qty_rejected),
  constraint grn_lines_reason_when_rejected check (qty_rejected = 0 or (rejection_reason is not null and length(btrim(rejection_reason)) > 0))
);

comment on table public.grn_lines is
  'GRN line detail — per-SKU accept/reject split for this receive event. Recv = Acc + Rej; Rej > 0 requires a reason.';

-- ==================================================================
-- 2. INDEXES
-- ==================================================================

create index if not exists idx_grns_po_id        on public.grns(po_id);
create index if not exists idx_grns_supplier_id  on public.grns(supplier_id);
create index if not exists idx_grns_warehouse_id on public.grns(warehouse_id);
create index if not exists idx_grns_received_at  on public.grns(received_at desc);
create index if not exists idx_grns_received_by  on public.grns(received_by);

create index if not exists idx_grn_lines_grn_id     on public.grn_lines(grn_id);
create index if not exists idx_grn_lines_po_line_id on public.grn_lines(po_line_id);
create index if not exists idx_grn_lines_sku        on public.grn_lines(sku);

-- ==================================================================
-- 3. RLS
-- ==================================================================
-- Mirror the purchase_orders pattern: internal roles read; writes are
-- RPC-only via SECURITY DEFINER. No direct INSERT/UPDATE/DELETE grants.

alter table public.grns       enable row level security;
alter table public.grn_lines  enable row level security;

drop policy if exists grns_read_internal on public.grns;
create policy grns_read_internal on public.grns
  for select
  using (( select public.is_internal() ));

drop policy if exists grn_lines_read_internal on public.grn_lines;
create policy grn_lines_read_internal on public.grn_lines
  for select
  using (( select public.is_internal() ));

-- Explicit no-write policy scoped to authenticated (writes go through the
-- SECURITY DEFINER wrapper only). Anon/service_role paths continue via role.
-- (No INSERT/UPDATE/DELETE policies = deny-by-default under RLS.)

-- ==================================================================
-- 4. WRAPPER RPC · operation_receive_po_with_grn
-- ==================================================================
-- Wraps the untouched operation_receive_po_with_do (4-arg) so we get the
-- full existing business logic (stock_balances / ops_stock_items /
-- thread-advance / reserve / PO rollup / audit_log / po_history) AND
-- materialize a GRN header + lines in the same transaction.
--
-- Args:
--   p_po_id, p_do_file_path, p_do_number, p_lines — verbatim pass-through
--       to the inner RPC. p_lines is [{id: <po_line_uuid>, received_qty: <new_total>}].
--   p_grn_lines — parallel array [{po_line_id, qty_received (this event),
--       qty_accepted, qty_rejected, rejection_reason}]. qty_received here is
--       the DELTA on this receive (not the running total), used only for
--       grn_lines audit — the inner RPC still uses p_lines.received_qty
--       (new total) for the actual stock bump.
--   p_notes — free-text captured on the GRN header (nullable).
--
-- Returns: inner receive-result jsonb || { grn_id, grn_number }.

create or replace function public.operation_receive_po_with_grn(
  p_po_id         text,
  p_do_file_path  text,
  p_do_number     text,
  p_lines         jsonb,
  p_grn_lines     jsonb,
  p_notes         text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_receive_result jsonb;
  v_grn_id         uuid   := gen_random_uuid();
  v_grn_number     text;
  v_supplier_id    uuid;
  v_warehouse_id   uuid;
  v_uid            uuid;
  v_user_name      text;
  v_grn_line       jsonb;
  v_collision_try  int    := 0;
begin
  -- 1. Delegate all heavy business logic to the untouched inner RPC.
  --    Any exception thrown by the inner RPC rolls back everything below,
  --    so no orphan GRN can ever be inserted for a failed receive.
  v_receive_result := public.operation_receive_po_with_do(
    p_po_id, p_do_file_path, p_do_number, p_lines
  );

  -- 2. Look up denormalized fields for the GRN header (RLS: caller has read
  --    access via the receive path we just completed).
  select po.supplier_id, po.warehouse_id
    into v_supplier_id, v_warehouse_id
    from public.purchase_orders po
   where po.id = p_po_id;

  v_uid := auth.uid();
  v_user_name := coalesce((select name from public.app_users where id = v_uid), 'Operation');

  -- 3. Mint GRN number: GRN-DDMMYY-NNNN, 4-digit hash tail from the grn uuid.
  --    Deterministic per uuid; volume-private; reprint-stable (uuid is stored
  --    on the row so re-derivation gives the same number).
  --    Collision handling: on the near-zero chance of a same-day collision
  --    with another grns.grn_number, regenerate the uuid up to 5 times.
  loop
    v_grn_number := 'GRN-' || to_char(current_date, 'DDMMYY') || '-' ||
      lpad((abs(hashtext(v_grn_id::text)) % 10000)::text, 4, '0');
    exit when not exists (select 1 from public.grns where grn_number = v_grn_number);
    v_collision_try := v_collision_try + 1;
    if v_collision_try >= 5 then
      raise exception 'grn_number collision after 5 tries'
        using errcode = 'P0001', detail = 'grn_number_collision';
    end if;
    v_grn_id := gen_random_uuid();
  end loop;

  -- 4. Insert grns header.
  insert into public.grns (
    id, grn_number, po_id, supplier_id, warehouse_id,
    do_number, do_file_path, received_by, received_by_name,
    status, notes, received_at, confirmed_at
  ) values (
    v_grn_id, v_grn_number, p_po_id, v_supplier_id, v_warehouse_id,
    btrim(p_do_number), p_do_file_path, v_uid, v_user_name,
    'confirmed', nullif(btrim(coalesce(p_notes, '')), ''), now(), now()
  );

  -- 5. Insert grn_lines. Uses the po_line's ordered_qty + sku as canonical
  --    snapshots so a later po_line edit / delete doesn't warp historical GRNs.
  for v_grn_line in select * from jsonb_array_elements(coalesce(p_grn_lines, '[]'::jsonb)) loop
    insert into public.grn_lines (
      grn_id, po_line_id, sku,
      ordered_qty, qty_received, qty_accepted, qty_rejected, rejection_reason
    )
    select
      v_grn_id,
      pol.id,
      pol.sku,
      pol.qty,
      coalesce((v_grn_line->>'qty_received')::int, 0),
      coalesce((v_grn_line->>'qty_accepted')::int, (v_grn_line->>'qty_received')::int, 0),
      coalesce((v_grn_line->>'qty_rejected')::int, 0),
      nullif(btrim(coalesce(v_grn_line->>'rejection_reason', '')), '')
    from public.purchase_order_lines pol
    where pol.id = nullif(v_grn_line->>'po_line_id', '')::uuid;
  end loop;

  -- 6. Return the inner result merged with the new GRN identifiers.
  return v_receive_result || jsonb_build_object(
    'grn_id',     v_grn_id,
    'grn_number', v_grn_number
  );
end;
$function$;

comment on function public.operation_receive_po_with_grn(text, text, text, jsonb, jsonb, text) is
  'Wraps operation_receive_po_with_do to also materialize a GRN header + lines in the same transaction. Path A (2026-07-24 owner-lock): existing receive RPC untouched.';

grant execute on function public.operation_receive_po_with_grn(text, text, text, jsonb, jsonb, text)
  to authenticated;

-- ==================================================================
-- 5. SANITY
-- ==================================================================
do $sanity$
declare
  v_def text;
begin
  -- Wrapper RPC exists on the expected signature.
  perform 1 from pg_proc
    where proname = 'operation_receive_po_with_grn'
      and pronargs = 6;
  if not found then
    raise exception '0244 sanity: operation_receive_po_with_grn(6-arg) not created';
  end if;

  -- Wrapper actually PERFORMs (via assignment) the inner RPC — i.e. we did
  -- not accidentally duplicate the receive logic.
  v_def := pg_get_functiondef('public.operation_receive_po_with_grn(text,text,text,jsonb,jsonb,text)'::regprocedure);
  if position('operation_receive_po_with_do' in v_def) = 0 then
    raise exception '0244 sanity: wrapper does not delegate to operation_receive_po_with_do';
  end if;

  -- Tables + indexes exist.
  perform 1 from pg_class where relname = 'grns'      and relkind = 'r';
  if not found then raise exception '0244 sanity: grns table missing'; end if;
  perform 1 from pg_class where relname = 'grn_lines' and relkind = 'r';
  if not found then raise exception '0244 sanity: grn_lines table missing'; end if;

  -- RLS enabled.
  perform 1 from pg_class where relname = 'grns'      and relrowsecurity = true;
  if not found then raise exception '0244 sanity: RLS not enabled on grns'; end if;
  perform 1 from pg_class where relname = 'grn_lines' and relrowsecurity = true;
  if not found then raise exception '0244 sanity: RLS not enabled on grn_lines'; end if;

  raise notice '0244 OK: grns + grn_lines + wrapper RPC installed; inner RPC untouched';
end $sanity$;

commit;
