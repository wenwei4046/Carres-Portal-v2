-- =============================================================================
-- 0714_office_staff_adjust_transfer_and_count_stock.sql
--
-- WEISIANG'S DECISION (Mr Lim, Houzs owner side, WhatsApp 2026-10-22, relayed by
-- YH 2026-10-23): "I think just clear Carress rules and Implement Houzs inside".
-- Office staff adjust, transfer and count stock the Houzs way. This overturns
-- Jess's Stock MASTER rules §12.4 (no ordinary-user plus/minus form), §12.5
-- (Difference never automatically becomes Adjustment; blind first Count) and
-- §12.7 (no immediate Transfer, no Transfer page). Jess was not part of this
-- decision.
--
-- THE DATA MODEL DOES NOT CHANGE. The Unit register (`ops_stock_items`) stays
-- the one inventory authority and every move still leaves its
-- `stock_unit_events` row through 0366's lineage trigger. Houzs moves a
-- quantity per SKU per warehouse; here each Houzs door is built on Units:
--
--   Stock Adjustment  minus = pick Units → Written off (with the reason)
--                     plus  = new Units are born at the Site (one Unit ID each)
--   Stock Transfer    picked Units change Site at once; Cancel moves them back
--   Stock Take        snapshot the Site's Units; Blind optional; Post applies
--                     the difference through the Stock Adjustment door
--
-- No cost and no valuation: Finance still owns value (Stock MASTER §1).
-- =============================================================================

set search_path = public;

-- ── 1 · the three documents ──────────────────────────────────────────────────

create table if not exists public.stock_counts (
  id           uuid primary key default gen_random_uuid(),
  count_no     text not null unique,
  warehouse_id uuid not null references public.warehouses(id),
  blind        boolean not null default false,
  note         text,
  status       text not null default 'open' check (status in ('open','posted')),
  extras       jsonb not null default '[]'::jsonb,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  posted_by    uuid,
  posted_at    timestamptz
);

create table if not exists public.stock_count_units (
  count_id uuid not null references public.stock_counts(id),
  unit_id  uuid not null references public.ops_stock_items(id),
  found    boolean,
  primary key (count_id, unit_id)
);

create table if not exists public.stock_adjustments (
  id           uuid primary key default gen_random_uuid(),
  adjustment_no text not null unique,
  warehouse_id uuid not null references public.warehouses(id),
  reason       text not null check (length(btrim(reason)) > 0),
  count_id     uuid references public.stock_counts(id),
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);

create table if not exists public.stock_adjustment_units (
  adjustment_id uuid not null references public.stock_adjustments(id),
  unit_id       uuid not null references public.ops_stock_items(id),
  direction     text not null check (direction in ('plus','minus')),
  primary key (adjustment_id, unit_id)
);

create table if not exists public.stock_transfers (
  id            uuid primary key default gen_random_uuid(),
  transfer_no   text not null unique,
  from_site_id  uuid not null references public.warehouses(id),
  to_site_id    uuid not null references public.warehouses(id),
  note          text,
  status        text not null default 'posted' check (status in ('posted','cancelled')),
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  cancelled_by  uuid,
  cancelled_at  timestamptz,
  cancel_reason text,
  check (from_site_id <> to_site_id)
);

create table if not exists public.stock_transfer_units (
  transfer_id uuid not null references public.stock_transfers(id),
  unit_id     uuid not null references public.ops_stock_items(id),
  primary key (transfer_id, unit_id)
);

-- Read for internal staff; writes only through the doors below (0367's lesson:
-- a new table inherits every grant, TRUNCATE included).
do $$
declare t text;
begin
  foreach t in array array['stock_counts','stock_count_units','stock_adjustments',
                           'stock_adjustment_units','stock_transfers','stock_transfer_units'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read_internal', t);
    execute format('create policy %I on public.%I for select using ((select public.is_internal()))',
                   t || '_read_internal', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated, anon', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- ── 2 · why a Unit cannot be moved or written off, in the operator's words ───

create or replace function public._stock_move_refusal(u public.ops_stock_items, p_site uuid)
returns text
language sql
stable
as $$
  select case
    when u.warehouse_id <> p_site then u.unit_code || ' is not at this Site'
    when u.status not in ('free','reserved','on_hold') then u.unit_code || ' is not in stock here'
    when u.needs_repair then u.unit_code || ' is in repair'
    when u.hold_claim_id is not null then u.unit_code || ' is on a Supplier Claim'
  end;
$$;

-- ── 3 · Stock Adjustment (row 49) ────────────────────────────────────────────
-- p_minus: Unit ids to write off. p_plus: [{sku, qty, condition?}] — qty new
-- Units are born, each with its own Unit ID. A reserved Unit cannot be written
-- off: the Sales Order owns that reservation and must release it first.

create or replace function public.stock_adjust_units(
  p_warehouse_id uuid, p_reason text, p_minus uuid[], p_plus jsonb,
  p_count_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid := gen_random_uuid();
  v_no   text;
  u      public.ops_stock_items;
  r      jsonb;
  v_why  text;
  v_n    int;
  v_minus int := 0;
  v_plus  int := 0;
begin
  if not public.is_operation() then
    raise exception 'forbidden' using errcode = '42501', detail = 'forbidden';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Write the reason' using errcode = 'P0001', detail = 'reason_required';
  end if;
  if coalesce(cardinality(p_minus), 0) = 0 and jsonb_array_length(coalesce(p_plus, '[]'::jsonb)) = 0 then
    raise exception 'Pick at least one Unit or add at least one item'
      using errcode = 'P0001', detail = 'nothing_to_adjust';
  end if;
  if not exists (select 1 from public.warehouses where id = p_warehouse_id) then
    raise exception 'that site does not exist' using errcode = 'P0001', detail = 'site_not_found';
  end if;

  v_no := public.allocate_formal_document_code('ADJ', v_id::text);
  insert into public.stock_adjustments (id, adjustment_no, warehouse_id, reason, count_id)
  values (v_id, v_no, p_warehouse_id, btrim(p_reason), p_count_id);

  for u in select * from public.ops_stock_items
            where id = any(coalesce(p_minus, '{}')) order by unit_code for update loop
    v_why := public._stock_move_refusal(u, p_warehouse_id);
    if v_why is null and u.status = 'reserved' then
      v_why := u.unit_code || ' is reserved for ' || coalesce(u.reserved_ref, 'a Sales Order');
    end if;
    -- A quantity row stands for N counted pieces (0442); one tick must not end all N.
    if v_why is null and u.identity_scope = 'quantity' then
      v_why := u.sku || ' is counted goods, not a Unit';
    end if;
    if v_why is not null then
      raise exception '%', v_why using errcode = 'P0001', detail = 'unit_not_adjustable';
    end if;
    update public.ops_stock_items
       set status = 'written_off',
           hold_release_note = v_no || ': ' || btrim(p_reason),
           updated_at = now()
     where id = u.id;
    insert into public.stock_adjustment_units values (v_id, u.id, 'minus');
    v_minus := v_minus + 1;
  end loop;
  if v_minus <> coalesce(cardinality(p_minus), 0) then
    raise exception 'a picked Unit was not found' using errcode = 'P0001', detail = 'unit_not_found';
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_plus, '[]'::jsonb)) loop
    v_n := coalesce((r->>'qty')::int, 0);
    if length(btrim(coalesce(r->>'sku', ''))) = 0 or v_n < 1 or v_n > 500 then
      raise exception 'Each added line needs an item and a quantity from 1 to 500'
        using errcode = 'P0001', detail = 'plus_line_invalid';
    end if;
    -- Only a SKU the Catalog traces one by one gets Unit IDs (0442 closed minting for any other).
    if not exists (select 1 from public.product_skus s
                    where s.sku = btrim(r->>'sku') and s.stock_identity_mode = 'exact_unit') then
      raise exception '% is not an item traced by Unit ID', btrim(r->>'sku')
        using errcode = 'P0001', detail = 'plus_sku_not_exact_unit';
    end if;
    with born as (
      insert into public.ops_stock_items
        (unit_code, identity_scope, sku, warehouse_id, condition, status, qty, source_ref, date_in, ownership)
      select public.allocate_unit_id(), 'unit', btrim(r->>'sku'), p_warehouse_id,
             coalesce(nullif(r->>'condition', ''), 'new'), 'free', 1, v_no,
             (now() at time zone 'Asia/Kuala_Lumpur')::date, 'carres_owned'
        from generate_series(1, v_n)
      returning id
    )
    insert into public.stock_adjustment_units select v_id, id, 'plus' from born;
    v_plus := v_plus + v_n;
  end loop;

  return jsonb_build_object('id', v_id, 'adjustmentNo', v_no, 'minus', v_minus, 'plus', v_plus);
end;
$$;

-- ── 4 · Stock Transfer (row 50) — posts at once; Cancel moves the Units back ─

create or replace function public.stock_transfer_units(
  p_from uuid, p_to uuid, p_units uuid[], p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id  uuid := gen_random_uuid();
  v_no  text;
  u     public.ops_stock_items;
  v_why text;
  v_n   int := 0;
begin
  if not public.is_operation() then
    raise exception 'forbidden' using errcode = '42501', detail = 'forbidden';
  end if;
  if p_from = p_to then
    raise exception 'From and To must be different Sites' using errcode = 'P0001', detail = 'same_site';
  end if;
  if coalesce(cardinality(p_units), 0) = 0 then
    raise exception 'Pick at least one Unit' using errcode = 'P0001', detail = 'no_units';
  end if;
  if (select count(*) from public.warehouses where id in (p_from, p_to)) <> 2 then
    raise exception 'that site does not exist' using errcode = 'P0001', detail = 'site_not_found';
  end if;

  v_no := public.allocate_formal_document_code('TR', v_id::text);
  insert into public.stock_transfers (id, transfer_no, from_site_id, to_site_id, note)
  values (v_id, v_no, p_from, p_to, nullif(btrim(coalesce(p_note, '')), ''));

  for u in select * from public.ops_stock_items
            where id = any(p_units) order by unit_code for update loop
    v_why := public._stock_move_refusal(u, p_from);
    if v_why is not null then
      raise exception '%', v_why using errcode = 'P0001', detail = 'unit_not_movable';
    end if;
    update public.ops_stock_items set warehouse_id = p_to, updated_at = now() where id = u.id;
    insert into public.stock_transfer_units values (v_id, u.id);
    v_n := v_n + 1;
  end loop;
  if v_n <> cardinality(p_units) then
    raise exception 'a picked Unit was not found' using errcode = 'P0001', detail = 'unit_not_found';
  end if;

  return jsonb_build_object('id', v_id, 'transferNo', v_no, 'units', v_n);
end;
$$;

create or replace function public.stock_transfer_cancel(p_transfer_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t     public.stock_transfers;
  u     public.ops_stock_items;
begin
  if not public.is_operation() then
    raise exception 'forbidden' using errcode = '42501', detail = 'forbidden';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Write the reason' using errcode = 'P0001', detail = 'reason_required';
  end if;
  select * into t from public.stock_transfers where id = p_transfer_id for update;
  if t.id is null then
    raise exception 'transfer not found' using errcode = 'P0002', detail = 'transfer_not_found';
  end if;
  if t.status <> 'posted' then
    raise exception '% is already cancelled', t.transfer_no using errcode = 'P0001', detail = 'already_cancelled';
  end if;

  -- Every Unit must still stand at the destination; one that moved on since
  -- (sold, transferred again, written off) blocks the whole cancel.
  for u in select i.* from public.ops_stock_items i
             join public.stock_transfer_units tu on tu.unit_id = i.id
            where tu.transfer_id = t.id order by i.unit_code for update of i loop
    if u.warehouse_id <> t.to_site_id or u.status not in ('free','reserved','on_hold') then
      raise exception '% has moved on since %; it cannot be moved back', u.unit_code, t.transfer_no
        using errcode = 'P0001', detail = 'unit_moved_on';
    end if;
    update public.ops_stock_items set warehouse_id = t.from_site_id, updated_at = now() where id = u.id;
  end loop;

  update public.stock_transfers
     set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(),
         cancel_reason = btrim(p_reason)
   where id = t.id;
  return jsonb_build_object('id', t.id, 'transferNo', t.transfer_no, 'status', 'cancelled');
end;
$$;

-- ── 5 · Stock Take (row 51) — Blind optional; Post applies the difference ────

create or replace function public.stock_count_open(
  p_warehouse_id uuid, p_blind boolean, p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_no text;
  v_n  int;
begin
  if not public.is_operation() then
    raise exception 'forbidden' using errcode = '42501', detail = 'forbidden';
  end if;
  if not exists (select 1 from public.warehouses where id = p_warehouse_id) then
    raise exception 'that site does not exist' using errcode = 'P0001', detail = 'site_not_found';
  end if;
  v_no := public.allocate_formal_document_code('STK', v_id::text);
  insert into public.stock_counts (id, count_no, warehouse_id, blind, note)
  values (v_id, v_no, p_warehouse_id, coalesce(p_blind, false), nullif(btrim(coalesce(p_note, '')), ''));
  insert into public.stock_count_units (count_id, unit_id)
  select v_id, i.id from public.ops_stock_items i
   where i.warehouse_id = p_warehouse_id
     and i.status in ('free','reserved','on_hold')
     and i.identity_scope = 'unit'   -- counted goods are not ticked one by one
     and not i.needs_repair;
  get diagnostics v_n = row_count;
  return jsonb_build_object('id', v_id, 'countNo', v_no, 'units', v_n);
end;
$$;

-- p_found: the Unit IDs (codes) the counter saw. p_extras: [{sku, qty}] goods
-- on the shelf with no Unit ID in this count. p_post = false only saves.
-- Posting: every Unit not found is written off and every extra is born, both
-- through stock_adjust_units — the one row-49 door.
create or replace function public.stock_count_record(
  p_count_id uuid, p_found text[], p_extras jsonb, p_post boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c         public.stock_counts;
  v_unknown text;
  v_missing uuid[];
  v_reserved text;
  v_adj     jsonb;
begin
  if not public.is_operation() then
    raise exception 'forbidden' using errcode = '42501', detail = 'forbidden';
  end if;
  select * into c from public.stock_counts where id = p_count_id for update;
  if c.id is null then
    raise exception 'count not found' using errcode = 'P0002', detail = 'count_not_found';
  end if;
  if c.status <> 'open' then
    raise exception '% is already posted', c.count_no using errcode = 'P0001', detail = 'count_posted';
  end if;

  select string_agg(f, ', ') into v_unknown
    from unnest(coalesce(p_found, '{}')) f
   where not exists (select 1 from public.stock_count_units cu
                       join public.ops_stock_items i on i.id = cu.unit_id
                      where cu.count_id = c.id and i.unit_code = btrim(f));
  if v_unknown is not null then
    raise exception 'Not in this count: %. Add goods with no Unit ID as an extra item.', v_unknown
      using errcode = 'P0001', detail = 'unit_not_in_count';
  end if;

  update public.stock_count_units cu
     set found = i.unit_code = any(select btrim(f) from unnest(coalesce(p_found, '{}')) f)
    from public.ops_stock_items i
   where i.id = cu.unit_id and cu.count_id = c.id;
  update public.stock_counts set extras = coalesce(p_extras, '[]'::jsonb) where id = c.id;

  if not coalesce(p_post, false) then
    return jsonb_build_object('id', c.id, 'countNo', c.count_no, 'status', 'open');
  end if;

  -- Only Units still at the Site and still in stock count as missing; one that
  -- left through another door since the snapshot is not a difference.
  select array_agg(i.id order by i.unit_code),
         string_agg(case when i.status = 'reserved' then i.unit_code || ' (' || coalesce(i.reserved_ref, 'reserved') || ')' end, ', ')
    into v_missing, v_reserved
    from public.stock_count_units cu
    join public.ops_stock_items i on i.id = cu.unit_id
   where cu.count_id = c.id and not cu.found
     and i.warehouse_id = c.warehouse_id and i.status in ('free','reserved','on_hold');
  if v_reserved is not null then
    raise exception 'Not found but reserved: %. Release them on the Sales Order first.', v_reserved
      using errcode = 'P0001', detail = 'missing_unit_reserved';
  end if;

  if coalesce(cardinality(v_missing), 0) > 0 or jsonb_array_length(coalesce(p_extras, '[]'::jsonb)) > 0 then
    v_adj := public.stock_adjust_units(c.warehouse_id, 'Stock Take ' || c.count_no,
                                       v_missing, p_extras, c.id);
  end if;
  update public.stock_counts set status = 'posted', posted_by = auth.uid(), posted_at = now() where id = c.id;
  return jsonb_build_object('id', c.id, 'countNo', c.count_no, 'status', 'posted',
                            'adjustmentNo', v_adj->>'adjustmentNo');
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'stock_adjust_units(uuid, text, uuid[], jsonb, uuid)',
    'stock_transfer_units(uuid, uuid, uuid[], text)',
    'stock_transfer_cancel(uuid, text)',
    'stock_count_open(uuid, boolean, text)',
    'stock_count_record(uuid, text[], jsonb, boolean)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public._stock_move_refusal(public.ops_stock_items, uuid) from public, anon, authenticated;
end $$;

comment on table public.stock_adjustments is
  '0714 — Weisiang''s decision (Mr Lim, WhatsApp 2026-10-22): office staff write Units off or add Units with a reason, the Houzs way. Overturns Stock MASTER §12.4/§12.5; Jess was not part of this decision.';
comment on table public.stock_transfers is
  '0714 — Weisiang''s decision (Mr Lim, WhatsApp 2026-10-22): picked Units change Site at once; Cancel moves them back. Overturns Stock MASTER §12.7; Jess was not part of this decision.';
comment on table public.stock_counts is
  '0714 — Weisiang''s decision (Mr Lim, WhatsApp 2026-10-22): Stock Take, Blind optional; Post applies the difference through stock_adjust_units. Overturns Stock MASTER §12.5; Jess was not part of this decision.';
