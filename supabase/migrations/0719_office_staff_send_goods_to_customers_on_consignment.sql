-- =============================================================================
-- 0719_office_staff_send_goods_to_customers_on_consignment.sql
--
-- WEISIANG'S DECISION (Mr Lim, Houzs owner side, WhatsApp 2026-10-22, relayed by
-- YH 2026-10-23): "I think just clear Carress rules and Implement Houzs inside".
-- Office staff send goods to customers on consignment and take unsold goods
-- back, the Houzs way. This overturns Jess's Purchasing MASTER rules that
-- dealers do not take consignment, that "Consignment Note" is a banned name and
-- that a consignment document is never created blank. Jess was not part of this
-- decision.
--
-- CUSTOMER SIDE ONLY. Carres's own `Consignment Order` / `Consignment Return`
-- (CRTN) stay the SUPPLIER-side documents (goods in from a supplier); nothing
-- here touches them. The customer side has its own names and numbers:
--
--   Customer Consignment Order   CCO  customer or dealer + the Units promised
--   Consignment Note             CSN  the delivery document: the Units leave
--                                     stock into the customer's custody
--                                     (still Carres-owned). From a CCO or blank.
--   Customer Consignment Return  CCR  unsold Units come back into stock. No
--                                     refund: nothing was paid for them.
--
-- (`CN` is not used: refunds already print credit notes as CN-.)
--
-- THE UNIT MODEL DOES NOT CHANGE. A Unit at the customer is `reserved` with
-- `reserved_ref` = the Consignment Note number — the same way 0209's loaner
-- sits at a customer as `reserved` / "LOAN SO-n". It is not offered for sale,
-- no Sales Order delivery can take it (0341 only takes its own SO's reserved
-- Units), and 0366's lineage trigger records every move.
--
-- SOLD: the customer pays through the existing payment path, on a Sales Order.
-- `consignment_note_mark_sold` turns the Unit `sold` against that Sales Order;
-- the money is recorded on the Sales Order like any other payment.
-- =============================================================================

set search_path = public;

-- ── 1 · the three documents ──────────────────────────────────────────────────

create table if not exists public.customer_consignment_orders (
  id               uuid primary key default gen_random_uuid(),
  order_no         text not null unique,
  dealer_id        uuid references public.dealers(id),
  customer_name    text not null check (length(btrim(customer_name)) > 0),
  customer_phone   text,
  customer_address text,
  note             text,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now()
);

create table if not exists public.customer_consignment_order_units (
  order_id uuid not null references public.customer_consignment_orders(id),
  unit_id  uuid not null references public.ops_stock_items(id),
  primary key (order_id, unit_id)
);

create table if not exists public.consignment_notes (
  id               uuid primary key default gen_random_uuid(),
  note_no          text not null unique,
  order_id         uuid references public.customer_consignment_orders(id),
  dealer_id        uuid references public.dealers(id),
  customer_name    text not null check (length(btrim(customer_name)) > 0),
  customer_phone   text,
  customer_address text,
  delivery_date    date not null default (now() at time zone 'Asia/Kuala_Lumpur')::date,
  note             text,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now()
);

create table if not exists public.consignment_note_units (
  note_id uuid not null references public.consignment_notes(id),
  unit_id uuid not null references public.ops_stock_items(id),
  primary key (note_id, unit_id)
);

create table if not exists public.customer_consignment_returns (
  id           uuid primary key default gen_random_uuid(),
  return_no    text not null unique,
  warehouse_id uuid not null references public.warehouses(id),
  note         text,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);

create table if not exists public.customer_consignment_return_units (
  return_id uuid not null references public.customer_consignment_returns(id),
  unit_id   uuid not null references public.ops_stock_items(id),
  note_id   uuid not null references public.consignment_notes(id),
  primary key (return_id, unit_id)
);

-- Read for internal staff; writes only through the doors below.
do $$
declare t text;
begin
  foreach t in array array['customer_consignment_orders','customer_consignment_order_units',
                           'consignment_notes','consignment_note_units',
                           'customer_consignment_returns','customer_consignment_return_units'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read_internal', t);
    execute format('create policy %I on public.%I for select using ((select public.is_internal()))',
                   t || '_read_internal', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated, anon', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- ── 2 · why a Unit cannot go out, in the operator's words ────────────────────

create or replace function public._consignment_out_refusal(u public.ops_stock_items)
returns text
language sql
stable
as $$
  select case
    when u.ownership <> 'carres_owned' then u.unit_code || ' belongs to its supplier'
    when u.identity_scope <> 'unit' then u.unit_code || ' has no Unit ID of its own'
    when u.status = 'reserved' then u.unit_code || ' is reserved for ' || coalesce(u.reserved_ref, 'a Sales Order')
    when u.status <> 'free' then u.unit_code || ' is not in stock'
    when u.needs_repair then u.unit_code || ' is in repair'
  end;
$$;

-- p_customer: {name, phone?, address?}
create or replace function public._consignment_customer(p_dealer_id uuid, p_customer jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  v_name text := btrim(coalesce(p_customer->>'name', ''));
begin
  if p_dealer_id is not null and length(v_name) = 0 then
    select name into v_name from public.dealers where id = p_dealer_id;
  end if;
  if length(coalesce(v_name, '')) = 0 then
    raise exception 'Choose the customer or dealer' using errcode = 'P0001', detail = 'customer_required';
  end if;
  return jsonb_build_object('name', v_name,
    'phone', nullif(btrim(coalesce(p_customer->>'phone', '')), ''),
    'address', nullif(btrim(coalesce(p_customer->>'address', '')), ''));
end;
$$;

-- ── 3 · Customer Consignment Order (row 17) ──────────────────────────────────
-- Records the customer and the Units promised. The Units leave stock when the
-- Consignment Note is issued, so an order nobody delivers never strands a Unit.

create or replace function public.customer_consignment_order_create(
  p_dealer_id uuid, p_customer jsonb, p_units uuid[], p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid := gen_random_uuid();
  v_no   text;
  v_c    jsonb;
  u      public.ops_stock_items;
  v_why  text;
  v_n    int := 0;
begin
  if not public.is_operation() then
    raise exception 'forbidden' using errcode = '42501', detail = 'forbidden';
  end if;
  v_c := public._consignment_customer(p_dealer_id, p_customer);
  if coalesce(cardinality(p_units), 0) = 0 then
    raise exception 'Pick at least one Unit' using errcode = 'P0001', detail = 'no_units';
  end if;

  v_no := public.allocate_formal_document_code('CCO', v_id::text);
  insert into public.customer_consignment_orders
    (id, order_no, dealer_id, customer_name, customer_phone, customer_address, note)
  values (v_id, v_no, p_dealer_id, v_c->>'name', v_c->>'phone', v_c->>'address',
          nullif(btrim(coalesce(p_note, '')), ''));

  for u in select * from public.ops_stock_items where id = any(p_units) order by unit_code loop
    v_why := public._consignment_out_refusal(u);
    if v_why is not null then
      raise exception '%', v_why using errcode = 'P0001', detail = 'unit_not_sendable';
    end if;
    insert into public.customer_consignment_order_units values (v_id, u.id);
    v_n := v_n + 1;
  end loop;
  if v_n <> cardinality(p_units) then
    raise exception 'a picked Unit was not found' using errcode = 'P0001', detail = 'unit_not_found';
  end if;
  return jsonb_build_object('id', v_id, 'orderNo', v_no, 'units', v_n);
end;
$$;

-- ── 4 · Consignment Note (row 18) — from a CCO, or blank ─────────────────────

create or replace function public.consignment_note_create(
  p_order_id uuid, p_dealer_id uuid, p_customer jsonb, p_units uuid[],
  p_delivery_date date default null, p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid := gen_random_uuid();
  v_no   text;
  o      public.customer_consignment_orders;
  v_c    jsonb;
  u      public.ops_stock_items;
  v_why  text;
  v_n    int := 0;
begin
  if not public.is_operation() then
    raise exception 'forbidden' using errcode = '42501', detail = 'forbidden';
  end if;
  if p_order_id is not null then
    select * into o from public.customer_consignment_orders where id = p_order_id;
    if o.id is null then
      raise exception 'order not found' using errcode = 'P0002', detail = 'order_not_found';
    end if;
    v_c := jsonb_build_object('name', o.customer_name, 'phone', o.customer_phone, 'address', o.customer_address);
    p_dealer_id := o.dealer_id;
  else
    v_c := public._consignment_customer(p_dealer_id, p_customer);
  end if;
  if coalesce(cardinality(p_units), 0) = 0 then
    raise exception 'Pick at least one Unit' using errcode = 'P0001', detail = 'no_units';
  end if;

  v_no := public.allocate_formal_document_code('CSN', v_id::text);
  insert into public.consignment_notes
    (id, note_no, order_id, dealer_id, customer_name, customer_phone, customer_address, delivery_date, note)
  values (v_id, v_no, p_order_id, p_dealer_id, v_c->>'name', v_c->>'phone', v_c->>'address',
          coalesce(p_delivery_date, (now() at time zone 'Asia/Kuala_Lumpur')::date),
          nullif(btrim(coalesce(p_note, '')), ''));

  for u in select * from public.ops_stock_items where id = any(p_units) order by unit_code for update loop
    if p_order_id is not null and not exists (
      select 1 from public.customer_consignment_order_units where order_id = p_order_id and unit_id = u.id) then
      raise exception '% is not on %', u.unit_code, o.order_no using errcode = 'P0001', detail = 'unit_not_on_order';
    end if;
    v_why := public._consignment_out_refusal(u);
    if v_why is not null then
      raise exception '%', v_why using errcode = 'P0001', detail = 'unit_not_sendable';
    end if;
    -- The 0209 loaner model: a Carres-owned Unit at a customer is reserved to
    -- the document that sent it there.
    update public.ops_stock_items
       set status = 'reserved', reserved_ref = v_no, updated_at = now()
     where id = u.id;
    insert into public.consignment_note_units values (v_id, u.id);
    v_n := v_n + 1;
  end loop;
  if v_n <> cardinality(p_units) then
    raise exception 'a picked Unit was not found' using errcode = 'P0001', detail = 'unit_not_found';
  end if;
  return jsonb_build_object('id', v_id, 'noteNo', v_no, 'units', v_n);
end;
$$;

-- The Note a Unit is out on right now, if any.
create or replace function public._consignment_note_holding(u public.ops_stock_items)
returns public.consignment_notes
language sql
stable
as $$
  select n.* from public.consignment_notes n
    join public.consignment_note_units nu on nu.note_id = n.id
   where nu.unit_id = u.id and u.status = 'reserved' and u.reserved_ref = n.note_no;
$$;

-- ── 5 · Sold at the customer → the Sales Order that takes the payment ────────

create or replace function public.consignment_note_mark_sold(p_units uuid[], p_so int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order  uuid;
  v_status text;
  u        public.ops_stock_items;
  n        public.consignment_notes;
  v_n      int := 0;
begin
  if not public.is_operation() then
    raise exception 'forbidden' using errcode = '42501', detail = 'forbidden';
  end if;
  select id, status into v_order, v_status from public.orders where so = p_so;
  if v_order is null then
    raise exception 'Sales Order % not found', p_so using errcode = 'P0001', detail = 'order_not_found';
  end if;
  -- A cancelled Sales Order cannot take the payment (0351 refuses it), so it
  -- cannot take the sold Unit either.
  if v_status = 'cancelled' then
    raise exception 'SO-% is cancelled', p_so using errcode = 'P0001', detail = 'order_cancelled';
  end if;
  if coalesce(cardinality(p_units), 0) = 0 then
    raise exception 'Pick at least one Unit' using errcode = 'P0001', detail = 'no_units';
  end if;
  for u in select * from public.ops_stock_items where id = any(p_units) order by unit_code for update loop
    n := public._consignment_note_holding(u);
    if n.id is null then
      raise exception '% is not out on a Consignment Note', u.unit_code
        using errcode = 'P0001', detail = 'unit_not_on_consignment';
    end if;
    update public.ops_stock_items
       set status = 'sold', sold_at = now(), sold_order_id = v_order,
           reserved_ref = 'SO-' || p_so,
           ref_history = array_append(coalesce(ref_history, '{}'::text[]), n.note_no),
           updated_at = now()
     where id = u.id;
    v_n := v_n + 1;
  end loop;
  if v_n <> cardinality(p_units) then
    raise exception 'a picked Unit was not found' using errcode = 'P0001', detail = 'unit_not_found';
  end if;
  return jsonb_build_object('orderId', v_order, 'so', p_so, 'units', v_n);
end;
$$;

-- ── 6 · Customer Consignment Return (row 19) — unsold Units back into stock ──
-- No refund and no money posting: nothing was paid for unsold goods.

create or replace function public.customer_consignment_return_create(
  p_warehouse_id uuid, p_units uuid[], p_note text default null
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
  n     public.consignment_notes;
  v_n   int := 0;
begin
  if not public.is_operation() then
    raise exception 'forbidden' using errcode = '42501', detail = 'forbidden';
  end if;
  if not exists (select 1 from public.warehouses where id = p_warehouse_id) then
    raise exception 'Choose the Site the goods come back to' using errcode = 'P0001', detail = 'site_not_found';
  end if;
  if coalesce(cardinality(p_units), 0) = 0 then
    raise exception 'Pick at least one Unit' using errcode = 'P0001', detail = 'no_units';
  end if;

  v_no := public.allocate_formal_document_code('CCR', v_id::text);
  insert into public.customer_consignment_returns (id, return_no, warehouse_id, note)
  values (v_id, v_no, p_warehouse_id, nullif(btrim(coalesce(p_note, '')), ''));

  for u in select * from public.ops_stock_items where id = any(p_units) order by unit_code for update loop
    n := public._consignment_note_holding(u);
    if n.id is null then
      raise exception '% is not out on a Consignment Note', u.unit_code
        using errcode = 'P0001', detail = 'unit_not_on_consignment';
    end if;
    update public.ops_stock_items
       set status = 'free', reserved_ref = null, warehouse_id = p_warehouse_id,
           ref_history = array_append(coalesce(ref_history, '{}'::text[]), n.note_no),
           updated_at = now()
     where id = u.id;
    insert into public.customer_consignment_return_units values (v_id, u.id, n.id);
    v_n := v_n + 1;
  end loop;
  if v_n <> cardinality(p_units) then
    raise exception 'a picked Unit was not found' using errcode = 'P0001', detail = 'unit_not_found';
  end if;
  return jsonb_build_object('id', v_id, 'returnNo', v_no, 'units', v_n);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'customer_consignment_order_create(uuid, jsonb, uuid[], text)',
    'consignment_note_create(uuid, uuid, jsonb, uuid[], date, text)',
    'consignment_note_mark_sold(uuid[], int)',
    'customer_consignment_return_create(uuid, uuid[], text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public._consignment_out_refusal(public.ops_stock_items) from public, anon, authenticated;
  revoke all on function public._consignment_customer(uuid, jsonb) from public, anon, authenticated;
  revoke all on function public._consignment_note_holding(public.ops_stock_items) from public, anon, authenticated;
end $$;

comment on table public.customer_consignment_orders is
  '0719 — Weisiang''s decision (Mr Lim, WhatsApp 2026-10-22): Customer Consignment Order (CCO), goods out to a customer or dealer, Houzs way. Not the supplier-side Consignment Order. Jess was not part of this decision.';
comment on table public.consignment_notes is
  '0719 — Weisiang''s decision (Mr Lim, WhatsApp 2026-10-22): Consignment Note (CSN), the delivery document that sends Units to the customer; blank allowed. Lifts COPY-STANDARD''s ban on the name. Jess was not part of this decision.';
comment on table public.customer_consignment_returns is
  '0719 — Weisiang''s decision (Mr Lim, WhatsApp 2026-10-22): Customer Consignment Return (CCR), unsold Units back into stock, no refund. Not the supplier-side CRTN. Jess was not part of this decision.';
