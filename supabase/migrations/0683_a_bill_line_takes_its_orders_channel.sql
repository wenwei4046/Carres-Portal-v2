-- =============================================================================
-- 0683_a_bill_line_takes_its_orders_channel.sql
-- =============================================================================
-- THE RULING (Chew 2026-10-06, docs/finance/MASTER.md §0 ruling 2; the plan
--   "Splitting the money by channel" step 1, approved 2026-10-12 「分渠道做」):
--   a supplier bill's channel comes from the order its goods were bought for,
--   never typed by hand. A purchase without an order takes its channel from the
--   purpose of its Manual Purchase Request (§0 "A purchase without an order").
--
-- WHAT THIS CHANGES
--   1. A new department, STOCK, "Not yet in a channel": goods no order has
--      taken yet (Ready Stock). Allowed on bill lines and ledger lines only; no
--      form offers it.
--   2. fin_order_channels: an order's channel, read without the reader's role,
--      because the postings that need it also run for people who are not
--      Finance. A showroom order with no outlet belongs to the showroom when
--      Carres has exactly one. fin_order_departments reads it, so reports and
--      bills agree.
--   3. fin_goods_line_split(PO line, qty): how much of a goods line belongs to
--      each channel. First the orders the PO line was bought for
--      (po_line_sources), else the orders its Units were put aside or sold for;
--      earliest order first, less what earlier bills of that PO line already
--      charged there. What no order takes follows the request's purpose:
--      Showroom Display goes to the showroom when there is exactly one, else
--      STOCK; Internal Staff, Other and Subsidiary Purchase go to Office;
--      Service Case goes to the case's order; Ready Stock or no request goes to
--      STOCK. A PO line bought for orders keeps the earliest order's channel for
--      anything charged beyond them; goods bought for no order keep only the
--      Units already put aside or sold, and the rest follows the purpose.
--   4. supplier_bill_save_draft: a goods line's department is always worked
--      out, never taken from the form. A line serving several channels is saved
--      as one line per channel, the quantity split and the price kept.
--   5. fin_goods_lines_channels(lines): the same split for the bill form, so it
--      shows where each goods line goes before it is saved.
--
-- RLS: none changed. fin_order_channels and fin_goods_line_split are read only
--   by the doors that own them; fin_goods_lines_channels is Finance's.
-- DATA: none. DR/CR: unchanged; each line posts its own department, as since
--   0540.
-- =============================================================================

begin;

set local search_path = public, pg_temp;

-- Replace one exact snippet of a live function; refuse unless it occurs once.
create or replace function pg_temp.mig0683_rewrite(p_fn regprocedure, p_old text, p_new text)
returns void
language plpgsql
as $rw$
declare
  v_def text := replace(pg_get_functiondef(p_fn), E'\r\n', E'\n');
  v_n   integer;
begin
  v_n := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
  if v_n <> 1 then
    raise exception '0683: % holds the text to change % times, not once: %', p_fn, v_n, left(p_old, 90);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$rw$;

-- ── 1 · STOCK, "Not yet in a channel" ───────────────────────────────────────
alter table public.gl_entry_lines drop constraint gl_entry_lines_department_shape;
alter table public.gl_entry_lines add constraint gl_entry_lines_department_shape check (
  (department_type is null and department_id is null)
  or (department_type in ('SHOWROOM','DEALER') and department_id is not null)
  or (department_type in ('SUBSCRIPTION','OFFICE','STOCK') and department_id is null));

alter table public.supplier_bill_lines drop constraint supplier_bill_lines_department_shape;
alter table public.supplier_bill_lines add constraint supplier_bill_lines_department_shape check (
  (department_type is null and department_id is null)
  or (department_type in ('SHOWROOM','DEALER') and department_id is not null)
  or (department_type in ('SUBSCRIPTION','OFFICE','STOCK') and department_id is null));

-- ── 2 · An order's channel ──────────────────────────────────────────────────
create or replace view public.fin_order_channels as
with one_showroom as (
  select case when count(*) = 1 then (array_agg(o.id))[1] end as outlet_id
    from public.outlets o
    join public.dealers d on d.id = o.dealer_id
   where d.channel = 'showroom'
)
select o.id as order_id,
       case when o.source_system = 'rental' then 'SUBSCRIPTION'
            when d.channel = 'showroom' then 'SHOWROOM'
            else 'DEALER' end as department_type,
       case when o.source_system = 'rental' then null::uuid
            when d.channel = 'showroom' then coalesce(o.outlet_id, s.outlet_id)
            else o.dealer_id end as department_id
  from public.orders o
  left join public.dealers d on d.id = o.dealer_id
  cross join one_showroom s
 where o.source_system = 'rental'
    or (d.channel = 'showroom' and coalesce(o.outlet_id, s.outlet_id) is not null)
    or (d.channel is distinct from 'showroom' and o.dealer_id is not null);
revoke all on public.fin_order_channels from public, anon, authenticated;
comment on view public.fin_order_channels is
  '0683: every order''s channel (Subscription, its showroom, or its dealer), whoever reads. A showroom order with no outlet is the showroom''s when Carres has exactly one. Read by Finance''s doors; readers go through fin_order_departments.';

create or replace view public.fin_order_departments as
select c.order_id, c.department_type, c.department_id
  from public.fin_order_channels c
 where public.is_internal();

-- ── 3 · How much of a goods line belongs to each channel ────────────────────
create or replace function public.fin_goods_line_split(p_po_line_id uuid, p_qty numeric)
returns table (department_type text, department_id uuid, qty numeric)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
#variable_conflict use_column
declare
  v_left     numeric := round(coalesce(p_qty, 0), 2);
  v_take     numeric;
  v_first_dt text;
  v_first_di uuid;
  v_purpose  text;
  v_case     uuid;
  v_sourced  boolean;
  r          record;
begin
  if v_left <= 0 then
    return;
  end if;
  v_sourced := exists (select 1 from public.po_line_sources s where s.po_line_id = p_po_line_id);

  for r in
    with cap as (
      select c.department_type as dt, c.department_id as di,
             sum(s.qty)::numeric as q, min(o.created_at) as first_at
        from public.po_line_sources s
        join public.orders o on o.id = s.order_id
        join public.fin_order_channels c on c.order_id = s.order_id
       where s.po_line_id = p_po_line_id
       group by c.department_type, c.department_id
      union all
      select c.department_type, c.department_id, count(*)::numeric, min(o.created_at)
        from public.ops_stock_items u
        left join public.order_lines ol on ol.id = u.reserved_order_line_id
        join public.orders o on o.id = coalesce(u.sold_order_id, ol.order_id)
        join public.fin_order_channels c on c.order_id = o.id
       where u.po_line_id = p_po_line_id
         and not exists (select 1 from public.po_line_sources s2 where s2.po_line_id = p_po_line_id)
       group by c.department_type, c.department_id
    ),
    billed as (
      select l.department_type as dt, l.department_id as di, sum(l.qty) as q
        from public.supplier_bill_lines l
        join public.supplier_bills b on b.id = l.bill_id
       where l.po_line_id = p_po_line_id
         and b.status <> 'cancelled'
       group by l.department_type, l.department_id
    )
    select cap.dt, cap.di, greatest(cap.q - coalesce(billed.q, 0), 0) as room
      from cap
      left join billed on billed.dt = cap.dt and billed.di is not distinct from cap.di
     order by cap.first_at, cap.dt, cap.di::text
  loop
    if v_first_dt is null then
      v_first_dt := r.dt;
      v_first_di := r.di;
    end if;
    exit when v_left <= 0;
    v_take := least(v_left, r.room);
    if v_take > 0 then
      department_type := r.dt;
      department_id   := r.di;
      qty             := v_take;
      return next;
      v_left := v_left - v_take;
    end if;
  end loop;

  if v_left <= 0 then
    return;
  end if;

  qty := v_left;
  if v_sourced and v_first_dt is not null then
    -- Bought for orders, charged beyond them: the earliest order's channel.
    department_type := v_first_dt;
    department_id   := v_first_di;
    return next;
    return;
  end if;

  -- Bought for no order: the purpose of the request it was bought on.
  select pr.purpose, pr.for_service_case_id
    into v_purpose, v_case
    from public.purchase_order_lines pol
    join public.purchase_demands dm on dm.id = pol.demand_id
    join public.purchase_requests pr on pr.id = dm.request_id
   where pol.id = p_po_line_id;

  department_type := 'STOCK';
  department_id   := null;
  if v_purpose in ('internal_staff_purchase', 'other_purchase', 'subsidiary_purchase', 'office') then
    department_type := 'OFFICE';
  elsif v_purpose in ('showroom_display', 'display') then
    select case when count(*) = 1 then (array_agg(o.id))[1] end
      into department_id
      from public.outlets o
      join public.dealers d on d.id = o.dealer_id
     where d.channel = 'showroom';
    if department_id is not null then
      department_type := 'SHOWROOM';
    end if;
  elsif v_purpose = 'service_case' then
    select c.department_type, c.department_id
      into department_type, department_id
      from public.service_cases sc
      join public.fin_order_channels c on c.order_id = sc.order_id
     where sc.id = v_case;
    if department_type is null then
      department_type := 'STOCK';
      department_id   := null;
    end if;
  end if;
  return next;
end;
$fn$;
revoke all on function public.fin_goods_line_split(uuid, numeric) from public, anon, authenticated;
comment on function public.fin_goods_line_split(uuid, numeric) is
  '0683 (Chew ruling 2): how much of a goods line belongs to each channel: its orders first (earliest first, less what earlier bills charged), then the request''s purpose. Read by supplier_bill_save_draft and fin_goods_lines_channels.';

-- ── 4 · The bill form's view of the same split ──────────────────────────────
create or replace function public.fin_goods_lines_channels(p_lines jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.gl_may_read() then
    raise exception 'accounts payable is internal'
      using errcode = '42501', detail = 'not_internal';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'po_line_id', x.pol,
             'channels', coalesce((select jsonb_agg(jsonb_build_object(
                                            'department_type', s.department_type,
                                            'department_id',   s.department_id,
                                            'qty',             s.qty))
                                     from public.fin_goods_line_split(x.pol, x.qty) s), '[]'::jsonb)))
      from (select (e ->> 'po_line_id')::uuid as pol, (e ->> 'qty')::numeric as qty
              from jsonb_array_elements(
                     case when jsonb_typeof(p_lines) = 'array' then p_lines else '[]'::jsonb end) e
             where nullif(btrim(coalesce(e ->> 'po_line_id', '')), '') is not null) x
  ), '[]'::jsonb);
end;
$fn$;
revoke all on function public.fin_goods_lines_channels(jsonb) from public, anon;
grant execute on function public.fin_goods_lines_channels(jsonb) to authenticated;
comment on function public.fin_goods_lines_channels(jsonb) is
  '0683: for the bill form, where each goods line [{po_line_id, qty}] goes: [{po_line_id, channels:[{department_type, department_id, qty}]}]. Finance only.';

-- ── 5 · Saving a bill: a goods line's department is worked out ──────────────
select pg_temp.mig0683_rewrite('public.supplier_bill_save_draft(uuid,uuid,text,date,jsonb,date,text,text)'::regprocedure,
$old$  v_dept     record;   -- 0540
$old$,
$new$  v_dept     record;   -- 0540
  v_part     record;          -- 0683
  v_part_amt numeric(12,2);   -- 0683
  v_out      integer := 0;    -- 0683: line numbers once goods lines are split
$new$);

select pg_temp.mig0683_rewrite('public.supplier_bill_save_draft(uuid,uuid,text,date,jsonb,date,text,text)'::regprocedure,
$old$    -- 0540: a goods line with no department takes its sales order's (DEPT-6).
    if v_pol_id is not null and nullif(btrim(coalesce(v_line ->> 'department_type', '')), '') is null then
      v_line := v_line || coalesce((select jsonb_build_object('department_type', d.department_type,
                                                              'department_id',   d.department_id)
                                      from public.fin_po_line_departments d
                                     where d.po_line_id = v_pol_id), '{}'::jsonb);
    end if;
    v_dept := public.fin_line_department(v_line, v_account, format('Line %s', v_n));

    insert into public.supplier_bill_lines
      (bill_id, line_no, account_code, description, sku, qty, unit_price, amount,
       warehouse_receipt_id, po_line_id, department_type, department_id, account_chosen)
    values
      (v_id, v_n, v_account, v_desc, v_sku, v_qty, v_price, v_amount,
       v_rcpt, v_pol_id, v_dept.department_type, v_dept.department_id,
       -- 0659: a non-goods line's account is always chosen.
       v_rcpt is null or nullif(btrim(coalesce(v_line ->> 'account_code', '')), '') is not null);
    v_total := v_total + v_amount;
$old$,
$new$    if v_pol_id is not null then
      -- 0683 (Chew ruling 2): a goods line takes the channel of the orders it
      -- was bought for, never the form's. A line serving several channels is
      -- saved as one line per channel, the quantity split, the price kept.
      for v_part in select * from public.fin_goods_line_split(v_pol_id, v_qty) loop
        v_part_amt := round(v_part.qty * v_price, 2);
        if v_part_amt <= 0 then
          raise exception 'Line %: % of it is too little to charge at this price. Check the quantity and the unit price.', v_n, v_part.qty
            using errcode = 'P0001', detail = 'line_split_too_small';
        end if;
        v_out := v_out + 1;
        insert into public.supplier_bill_lines
          (bill_id, line_no, account_code, description, sku, qty, unit_price, amount,
           warehouse_receipt_id, po_line_id, department_type, department_id, account_chosen)
        values
          (v_id, v_out, v_account, v_desc, v_sku, v_part.qty, v_price, v_part_amt,
           v_rcpt, v_pol_id, v_part.department_type, v_part.department_id,
           -- 0659: a goods line's account counts as chosen only when the form sent one.
           nullif(btrim(coalesce(v_line ->> 'account_code', '')), '') is not null);
        v_total := v_total + v_part_amt;
      end loop;
    else
      v_dept := public.fin_line_department(v_line, v_account, format('Line %s', v_n));
      v_out := v_out + 1;
      insert into public.supplier_bill_lines
        (bill_id, line_no, account_code, description, sku, qty, unit_price, amount,
         warehouse_receipt_id, po_line_id, department_type, department_id, account_chosen)
      values
        (v_id, v_out, v_account, v_desc, v_sku, v_qty, v_price, v_amount,
         v_rcpt, v_pol_id, v_dept.department_type, v_dept.department_id,
         -- 0659: a non-goods line's account is always chosen.
         true);
      v_total := v_total + v_amount;
    end if;
$new$);

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_def text := pg_get_functiondef('public.supplier_bill_save_draft(uuid,uuid,text,date,jsonb,date,text,text)'::regprocedure);
begin
  if position('fin_goods_line_split' in v_def) = 0 or position('fin_po_line_departments' in v_def) > 0 then
    raise exception '0683 sanity: the bill draft does not work out a goods line''s channel';
  end if;
  if has_function_privilege('authenticated', 'public.fin_goods_line_split(uuid, numeric)', 'execute')
     or has_table_privilege('authenticated', 'public.fin_order_channels', 'select')
     or has_function_privilege('anon', 'public.fin_goods_lines_channels(jsonb)', 'execute') then
    raise exception '0683 sanity: an order''s channel can be read around Finance''s doors';
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'gl_entry_lines_department_shape'
                    and pg_get_constraintdef(oid) like '%STOCK%') then
    raise exception '0683 sanity: a ledger line cannot be Not yet in a channel';
  end if;
end
$sanity$;

commit;
