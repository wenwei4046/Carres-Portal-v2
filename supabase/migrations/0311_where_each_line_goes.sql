-- ============================================================================
-- 0311 — where each LINE goes  (Jess, 2026-08-02)
--
-- 0307 gave the PO one destination. Real life gives a LINE its own: ten
-- bedframes to Klang, one of them to AL Sungai Buloh because AL collects it
-- and takes it straight to the customer. Purchasing's only per-line job is
-- exactly this — "where does this piece go" — and until now the portal had
-- nowhere to put the answer, so it lived in a WhatsApp message and somebody's
-- head.
--
-- THREE things, all additive:
--   1 · `destination_id` on the LINE. NULL means "wherever the PO goes", so
--       every existing line keeps its meaning and nothing needs backfilling.
--       A read is `coalesce(line.destination_id, po.destination_id)`.
--   2 · `ops_remark` on the line — purchasing's OWN note. A COLUMN, not an
--       `attrs` key: 0307's document payload allowlists three attrs keys and
--       selects named columns, so a column here structurally CANNOT reach the
--       printed PO. That is the point — the SALESPERSON's remark prints for
--       the factory; ours is internal and must never leak onto their paper.
--   3 · Three write doors, and only these: set a line's destination, SPLIT a
--       line so part of it goes elsewhere, set the ops remark.
--
-- THE SPLIT IS THE LAW JESS FROZE (2026-08-02): a PO stays ONE document with
-- ONE supplier; when quantities go to different places the LINE splits, never
-- the PO. Received quantity NEVER moves — only the un-received remainder can
-- go somewhere else, which is 0257's own discipline (you may not re-route
-- goods that are already in a warehouse).
--
-- No new duty key: the same `purchasing_supplier_call_gate()` that guards the
-- supplier calls guards these, because it is the same person doing the same
-- job on the same document.
-- ============================================================================

alter table public.purchase_order_lines
  add column if not exists destination_id uuid references public.purchasing_destinations(id);

comment on column public.purchase_order_lines.destination_id is
  'Where THIS line goes (Jess 2026-08-02). NULL = wherever the PO goes, so a line that was never re-routed keeps the PO''s answer and no backfill exists. Written only by purchasing_set_line_destination / purchasing_split_line_destination.';

alter table public.purchase_order_lines
  add column if not exists ops_remark text;

comment on column public.purchase_order_lines.ops_remark is
  'Purchasing''s OWN note on this line — internal, never printed. A column rather than an attrs key precisely so it cannot reach purchasing_po_document, which allowlists attrs and selects named columns: the salesperson''s remark prints for the factory, ours does not.';

-- ── 1 · the whole line goes somewhere else ──────────────────────────────────
create or replace function public.purchasing_set_line_destination(
  p_line_id       uuid,
  p_destination_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role  app_role;
  v_uid   uuid;
  v_actor text;
  v_line  purchase_order_lines;
  v_po    purchase_orders;
  v_dest  purchasing_destinations;
begin
  v_role := public.purchasing_supplier_call_gate();
  v_uid  := auth.uid();

  select * into v_line from purchase_order_lines where id = p_line_id for update;
  if not found then
    raise exception 'line % not found', p_line_id
      using errcode = '42P01', detail = 'line_not_found';
  end if;

  select * into v_po from purchase_orders where id = v_line.po_id;
  if v_po.status <> 'open' then
    raise exception 'PO % is %', v_po.id, v_po.status
      using errcode = 'P0001', detail = 'po_not_open';
  end if;

  select * into v_dest from purchasing_destinations where id = p_destination_id and active;
  if not found then
    raise exception 'destination not found or inactive'
      using errcode = '42P01', detail = 'destination_not_found';
  end if;

  -- Goods already checked in are AT a warehouse; re-routing the line would
  -- claim they are somewhere they are not. Split the remainder instead.
  if v_line.received_qty > 0 then
    raise exception 'line % already has % received — split the remainder instead', p_line_id, v_line.received_qty
      using errcode = 'P0001', detail = 'line_partly_received';
  end if;

  update purchase_order_lines
     set destination_id = case when p_destination_id = v_po.destination_id then null else p_destination_id end
   where id = p_line_id;

  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));

  insert into po_history (po_id, text, by_role)
  values (v_line.po_id,
          format('%s × %s now goes to %s', v_line.sku, v_line.qty, v_dest.name),
          v_role);
  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('PO %s — line destination: %s → %s', v_line.po_id, v_line.sku, v_dest.name),
          v_line.po_id);

  return jsonb_build_object('line_id', p_line_id, 'destination', v_dest.name);
end;
$fn$;

-- ── 2 · part of the line goes somewhere else — the SPLIT ────────────────────
create or replace function public.purchasing_split_line_destination(
  p_line_id        uuid,
  p_move_qty       int,
  p_destination_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role   app_role;
  v_uid    uuid;
  v_actor  text;
  v_line   purchase_order_lines;
  v_po     purchase_orders;
  v_dest   purchasing_destinations;
  v_free   int;
  v_new_id uuid;
begin
  v_role := public.purchasing_supplier_call_gate();
  v_uid  := auth.uid();

  if p_move_qty is null or p_move_qty < 1 then
    raise exception 'move quantity must be at least 1'
      using errcode = '22023', detail = 'invalid_move_qty';
  end if;

  select * into v_line from purchase_order_lines where id = p_line_id for update;
  if not found then
    raise exception 'line % not found', p_line_id
      using errcode = '42P01', detail = 'line_not_found';
  end if;

  select * into v_po from purchase_orders where id = v_line.po_id;
  if v_po.status <> 'open' then
    raise exception 'PO % is %', v_po.id, v_po.status
      using errcode = 'P0001', detail = 'po_not_open';
  end if;

  select * into v_dest from purchasing_destinations where id = p_destination_id and active;
  if not found then
    raise exception 'destination not found or inactive'
      using errcode = '42P01', detail = 'destination_not_found';
  end if;

  -- Only the UN-RECEIVED remainder may move. What a warehouse already holds
  -- cannot be re-routed by editing a document (0257's discipline).
  v_free := v_line.qty - v_line.received_qty;
  if p_move_qty > v_free then
    raise exception 'only % of % are still to come — cannot move %', v_free, v_line.qty, p_move_qty
      using errcode = 'P0001', detail = 'move_qty_exceeds_remaining';
  end if;
  if p_move_qty = v_line.qty and v_line.received_qty = 0 then
    raise exception 'moving the whole line is not a split — set its destination instead'
      using errcode = '22023', detail = 'use_set_destination';
  end if;

  -- The new line inherits WHAT the goods are (sku · config · cost) and starts
  -- with nothing received: it is the same order for different goods to a
  -- different place, not a copy of a delivery.
  insert into purchase_order_lines
    (po_id, sku, qty, received_qty, cost, cost_source, attrs, destination_id, ops_remark, purchase_request_id)
  values
    (v_line.po_id, v_line.sku, p_move_qty, 0, v_line.cost, v_line.cost_source, v_line.attrs,
     case when p_destination_id = v_po.destination_id then null else p_destination_id end,
     v_line.ops_remark, v_line.purchase_request_id)
  returning id into v_new_id;

  update purchase_order_lines
     set qty = v_line.qty - p_move_qty
   where id = p_line_id;

  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));

  insert into po_history (po_id, text, by_role)
  values (v_line.po_id,
          format('%s split — %s of %s now goes to %s',
                 v_line.sku, p_move_qty, v_line.qty, v_dest.name),
          v_role);
  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('PO %s — line split: %s × %s → %s', v_line.po_id, v_line.sku, p_move_qty, v_dest.name),
          v_line.po_id);

  return jsonb_build_object(
    'line_id',     p_line_id,
    'new_line_id', v_new_id,
    'moved',       p_move_qty,
    'destination', v_dest.name
  );
end;
$fn$;

-- ── 3 · purchasing's own note on the line ───────────────────────────────────
create or replace function public.purchasing_set_line_ops_remark(
  p_line_id uuid,
  p_text    text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role  app_role;
  v_uid   uuid;
  v_actor text;
  v_line  purchase_order_lines;
  v_po    purchase_orders;
  v_txt   text;
begin
  v_role := public.purchasing_supplier_call_gate();
  v_uid  := auth.uid();
  v_txt  := nullif(btrim(coalesce(p_text, '')), '');

  select * into v_line from purchase_order_lines where id = p_line_id for update;
  if not found then
    raise exception 'line % not found', p_line_id
      using errcode = '42P01', detail = 'line_not_found';
  end if;
  select * into v_po from purchase_orders where id = v_line.po_id;
  if v_po.status <> 'open' then
    raise exception 'PO % is %', v_po.id, v_po.status
      using errcode = 'P0001', detail = 'po_not_open';
  end if;

  update purchase_order_lines set ops_remark = v_txt where id = p_line_id;

  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));
  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('PO %s — ops remark on %s', v_line.po_id, v_line.sku),
          v_line.po_id);

  return jsonb_build_object('line_id', p_line_id, 'ops_remark', v_txt);
end;
$fn$;

-- Both directions, per the guardrail: `revoke … from public` alone does NOT
-- drop `anon` on Supabase, and neither implies the grant back.
revoke execute on function public.purchasing_set_line_destination(uuid, uuid) from public;
revoke execute on function public.purchasing_set_line_destination(uuid, uuid) from anon;
grant  execute on function public.purchasing_set_line_destination(uuid, uuid) to authenticated;

revoke execute on function public.purchasing_split_line_destination(uuid, int, uuid) from public;
revoke execute on function public.purchasing_split_line_destination(uuid, int, uuid) from anon;
grant  execute on function public.purchasing_split_line_destination(uuid, int, uuid) to authenticated;

revoke execute on function public.purchasing_set_line_ops_remark(uuid, text) from public;
revoke execute on function public.purchasing_set_line_ops_remark(uuid, text) from anon;
grant  execute on function public.purchasing_set_line_ops_remark(uuid, text) to authenticated;

-- ── sanity ──────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_n int;
begin
  select count(*) into v_n from information_schema.columns
   where table_schema='public' and table_name='purchase_order_lines'
     and column_name in ('destination_id','ops_remark');
  if v_n <> 2 then raise exception '0311: expected 2 new line columns, found %', v_n; end if;

  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname in (
     'purchasing_set_line_destination','purchasing_split_line_destination','purchasing_set_line_ops_remark');
  if v_n <> 3 then raise exception '0311: expected 3 write doors, found %', v_n; end if;

  -- The ops remark may NEVER reach the printed PO. `purchasing_po_document`
  -- must not mention it; if a later hand adds it there, this migration's own
  -- guarantee is void and the build should fail loudly.
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname='purchasing_po_document') ilike '%ops_remark%' then
    raise exception '0311: purchasing_po_document must never read ops_remark — it is internal';
  end if;
end;
$sanity$;
