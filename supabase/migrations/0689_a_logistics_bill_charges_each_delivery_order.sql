-- =============================================================================
-- 0689_a_logistics_bill_charges_each_delivery_order.sql
-- =============================================================================
-- THE RULING (Chew 2026-10-06, docs/finance/MASTER.md §0 ruling 5; the plan
--   "Splitting the money by channel" step 4, approved 2026-10-12 「分渠道做」):
--   transport is recorded as a cost of each order although customers pay
--   nothing for it (「虽然是我们出，但是还是要记录运输费用啊，根据订单」). A
--   logistics partner's bill is split over the delivery orders it lists; a
--   bill with only a total is split equally (「如果一个总数就平除」).
--
-- WHAT THIS CHANGES
--   1. A posting role, DELIVERY_TRANSPORT, on 900-T002 TRANSPORT - LOGISTIC
--      COST. Posting accounts lists it under Purchases and charges, and
--      Finance may change it, as it changes bank charges.
--   2. supplier_bill_lines.delivery_order_id: a bill line may name the
--      delivery order (DO) it charges for. A DO is on one live bill at most.
--   3. supplier_bill_save_draft: a line that names a DO takes its channel from
--      the DO's order (fin_order_channels), never from the form; its account
--      is the DELIVERY_TRANSPORT role's unless one was chosen; it says which
--      DO and order it is for unless the form said. A voided DO, a DO already
--      on another live bill, a DO twice on one bill, and a line naming both a
--      DO and a goods receipt are refused.
--   4. fin_bill_delivery_orders(bill): each logistics partner and its live DOs
--      not on another live bill, with each DO's order and channel, for the
--      bill form's picker. A DO belongs to the partner its delivery
--      arrangement names, else the partner its DO names.
--   5. supplier_bill_document returns each line's DO and its number.
--   How the amount is split over the DOs is the form's: an amount per DO, or
--   a total split equally in whole sen.
--
-- RLS: none changed. DATA: one role row. DR/CR: a DO line posts Dr its
--   account (900-T002) in its order's channel, Cr payables, as every bill
--   line does.
-- =============================================================================

begin;

set local search_path = public, pg_temp;

-- Replace one exact snippet of a live function; refuse unless it occurs once.
-- A note inside a snippet that sits mid-line is a block comment, never `--`.
create or replace function pg_temp.mig0689_rewrite(p_fn regprocedure, p_old text, p_new text)
returns void
language plpgsql
as $rw$
declare
  v_def text := replace(pg_get_functiondef(p_fn), E'\r\n', E'\n');
  v_n   integer;
begin
  v_n := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
  if v_n <> 1 then
    raise exception '0689: % holds the text to change % times, not once: %', p_fn, v_n, left(p_old, 90);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$rw$;

-- ── 1 · the posting role ─────────────────────────────────────────────────────
insert into public.gl_account_roles (role, account_code)
select 'DELIVERY_TRANSPORT', a.code
  from public.gl_accounts a
 where a.code = '900-T002' and a.kind = 'EXPENSE' and a.is_active and not a.is_heading
on conflict (role) do nothing;

select pg_temp.mig0689_rewrite('public._gl_posting_account_write(text, text, text, text)'::regprocedure,
$old$'RENOVATION_REBATE_ACCRUED', 'KPI_ALLOWANCE', 'KPI_ALLOWANCE_ACCRUED') then$old$,
$new$'RENOVATION_REBATE_ACCRUED', 'KPI_ALLOWANCE', 'KPI_ALLOWANCE_ACCRUED',
                     'DELIVERY_TRANSPORT') then   -- 0689$new$);

-- The list of postings first: until the changeable list below gains a comma
-- after its last role, this snippet is the list's alone.
select pg_temp.mig0689_rewrite('public.gl_posting_accounts()'::regprocedure,
$old$'RENOVATION_REBATE_ACCRUED', 'KPI_ALLOWANCE', 'KPI_ALLOWANCE_ACCRUED',$old$,
$new$'RENOVATION_REBATE_ACCRUED', 'KPI_ALLOWANCE', 'KPI_ALLOWANCE_ACCRUED', 'DELIVERY_TRANSPORT',$new$);

select pg_temp.mig0689_rewrite('public.gl_posting_accounts()'::regprocedure,
$old$'KPI_ALLOWANCE_ACCRUED'),   -- 0675$old$,
$new$'KPI_ALLOWANCE_ACCRUED', 'DELIVERY_TRANSPORT'),   -- 0675, 0689$new$);

-- ── 2 · a bill line may name its delivery order ──────────────────────────────
alter table public.supplier_bill_lines
  add column delivery_order_id uuid references public.ops_delivery_orders(id);

create index supplier_bill_lines_delivery_order_idx
  on public.supplier_bill_lines (delivery_order_id)
  where delivery_order_id is not null;

comment on column public.supplier_bill_lines.delivery_order_id is
  '0689: the delivery order a logistics partner''s bill line charges for. The line''s channel is that order''s.';

-- ── 3 · saving a bill ────────────────────────────────────────────────────────
select pg_temp.mig0689_rewrite('public.supplier_bill_save_draft(uuid, uuid, text, date, jsonb, date, text, text)'::regprocedure,
$old$  v_out      integer := 0;    -- 0683: line numbers once goods lines are split
$old$,
$new$  v_out      integer := 0;    -- 0683: line numbers once goods lines are split
  v_do_id    uuid;             -- 0689
  v_do       record;
  v_dos      uuid[] := '{}';
  v_on       text;
$new$);

select pg_temp.mig0689_rewrite('public.supplier_bill_save_draft(uuid, uuid, text, date, jsonb, date, text, text)'::regprocedure,
$old$      v_pol_id := nullif(btrim(coalesce(v_line ->> 'po_line_id', '')), '')::uuid;
$old$,
$new$      v_pol_id := nullif(btrim(coalesce(v_line ->> 'po_line_id', '')), '')::uuid;
      v_do_id  := nullif(btrim(coalesce(v_line ->> 'delivery_order_id', '')), '')::uuid;   -- 0689
$new$);

select pg_temp.mig0689_rewrite('public.supplier_bill_save_draft(uuid, uuid, text, date, jsonb, date, text, text)'::regprocedure,
$old$    if v_rcpt is not null then
      select * into v_pol from public.purchase_order_lines where id = v_pol_id;$old$,
$new$    -- 0689 (Chew ruling 5): a line that names a delivery order charges a
    -- logistics partner's transport for that order. Its channel is the
    -- order's (below), its account the DELIVERY_TRANSPORT role's unless one
    -- was chosen.
    if v_do_id is not null then
      if v_rcpt is not null then
        raise exception 'Line %: a line charges for a goods receipt or a delivery order, not both.', v_n
          using errcode = 'P0001', detail = 'line_grn_and_delivery_order';
      end if;
      select d.id, d.do_number, d.order_id, d.voided_at, o.so into v_do
        from public.ops_delivery_orders d
        join public.orders o on o.id = d.order_id
       where d.id = v_do_id;
      if not found then
        raise exception 'Line %: that delivery order does not exist.', v_n
          using errcode = 'P0001', detail = 'delivery_order_missing';
      end if;
      if v_do.voided_at is not null then
        raise exception 'Line %: delivery order % is voided.', v_n, v_do.do_number
          using errcode = 'P0001', detail = 'delivery_order_voided';
      end if;
      if v_do_id = any (v_dos) then
        raise exception 'Line %: delivery order % is on this bill twice.', v_n, v_do.do_number
          using errcode = 'P0001', detail = 'delivery_order_twice';
      end if;
      select coalesce(b.bill_no, 'a draft bill') into v_on
        from public.supplier_bill_lines bl
        join public.supplier_bills b on b.id = bl.bill_id
       where bl.delivery_order_id = v_do_id
         and b.status <> 'cancelled'
         and b.id <> v_id
       limit 1;
      if v_on is not null then
        raise exception 'Line %: delivery order % is already on %.', v_n, v_do.do_number, v_on
          using errcode = 'P0001', detail = 'delivery_order_billed';
      end if;
      v_dos     := v_dos || v_do_id;
      v_account := coalesce(v_account, public.gl_account_for('DELIVERY_TRANSPORT'));
      v_desc    := coalesce(v_desc, format('Transport · %s · SO-%s', v_do.do_number, v_do.so));
    end if;

    if v_rcpt is not null then
      select * into v_pol from public.purchase_order_lines where id = v_pol_id;$new$);

select pg_temp.mig0689_rewrite('public.supplier_bill_save_draft(uuid, uuid, text, date, jsonb, date, text, text)'::regprocedure,
$old$    else
      v_dept := public.fin_line_department(v_line, v_account, format('Line %s', v_n));
$old$,
$new$    elsif v_do_id is not null then
      -- 0689: the delivery order's own order decides the channel, never the form.
      select c.department_type, c.department_id into v_dept
        from public.fin_order_channels c
       where c.order_id = v_do.order_id;
      if not found then
        raise exception 'Line %: the order of delivery order % has no channel.', v_n, v_do.do_number
          using errcode = 'P0001', detail = 'delivery_order_no_channel';
      end if;
      v_out := v_out + 1;
      insert into public.supplier_bill_lines
        (bill_id, line_no, account_code, description, sku, qty, unit_price, amount,
         warehouse_receipt_id, po_line_id, department_type, department_id, account_chosen,
         delivery_order_id)
      values
        (v_id, v_out, v_account, v_desc, v_sku, v_qty, v_price, v_amount,
         null, null, v_dept.department_type, v_dept.department_id,
         nullif(btrim(coalesce(v_line ->> 'account_code', '')), '') is not null,
         v_do_id);
      v_total := v_total + v_amount;
    else
      v_dept := public.fin_line_department(v_line, v_account, format('Line %s', v_n));
$new$);

-- ── 4 · the delivery orders a bill can charge for ────────────────────────────
create function public.fin_bill_delivery_orders(p_bill_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.gl_may_read() then
    raise exception 'Only Finance reads the delivery orders a bill can charge for.'
      using errcode = '42501', detail = 'not_finance';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object('partner_id', p.id, 'name', p.name,
                                        'delivery_orders', x.dos) order by p.name)
      from public.delivery_partners p
      join lateral (
        select jsonb_agg(jsonb_build_object(
                 'id', d.id,
                 'do_no', d.do_number,
                 'delivery_date', d.delivery_date,
                 'order_id', d.order_id,
                 'so', o.so,
                 'department_type', c.department_type,
                 'department_id', c.department_id)
               order by d.delivery_date nulls last, d.do_number) as dos
          from public.ops_delivery_orders d
          join public.orders o on o.id = d.order_id
          left join public.fin_order_channels c on c.order_id = d.order_id
          left join public.ops_delivery_arrangements a on a.order_id = d.order_id and a.leg = d.leg
         where d.voided_at is null
           and coalesce(a.partner_id = p.id, d.logistics_partner = p.name)
           and not exists (
             select 1
               from public.supplier_bill_lines bl
               join public.supplier_bills b on b.id = bl.bill_id
              where bl.delivery_order_id = d.id
                and b.status <> 'cancelled'
                and b.id is distinct from p_bill_id)
      ) x on x.dos is not null
  ), '[]'::jsonb);
end;
$fn$;

revoke all on function public.fin_bill_delivery_orders(uuid) from public, anon;
grant execute on function public.fin_bill_delivery_orders(uuid) to authenticated;

comment on function public.fin_bill_delivery_orders(uuid) is
  '0689: each logistics partner and its live delivery orders not on another live bill, with each order and channel, for the bill form. Finance only.';

-- ── 5 · a bill's lines say their delivery order ──────────────────────────────
select pg_temp.mig0689_rewrite('public.supplier_bill_document(uuid)'::regprocedure,
$old$               bl.qty, bl.unit_price, bl.amount, bl.warehouse_receipt_id,$old$,
$new$               bl.qty, bl.unit_price, bl.amount, bl.warehouse_receipt_id,
               bl.delivery_order_id, dor.do_number as do_no,   -- 0689$new$);

select pg_temp.mig0689_rewrite('public.supplier_bill_document(uuid)'::regprocedure,
$old$          left join public.purchase_order_lines pol on pol.id = bl.po_line_id
         where bl.bill_id = p_bill_id) y), '[]'::jsonb),$old$,
$new$          left join public.purchase_order_lines pol on pol.id = bl.po_line_id
          left join public.ops_delivery_orders dor on dor.id = bl.delivery_order_id   -- 0689
         where bl.bill_id = p_bill_id) y), '[]'::jsonb),$new$);

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_src text;
begin
  if not exists (select 1 from public.gl_account_roles r
                  join public.gl_accounts a on a.code = r.account_code
                 where r.role = 'DELIVERY_TRANSPORT' and a.kind = 'EXPENSE' and not a.is_heading) then
    raise exception '0689: delivery transport has no expense account';
  end if;
  select pg_get_functiondef('public.supplier_bill_save_draft(uuid, uuid, text, date, jsonb, date, text, text)'::regprocedure) into v_src;
  if position('delivery_order_billed' in v_src) = 0 or position('fin_order_channels' in v_src) = 0
     or position('fin_goods_line_split' in v_src) = 0 or position('fin_line_department' in v_src) = 0
     or position('not_finance' in v_src) = 0 then
    raise exception '0689: saving a bill lost a check, or does not take a delivery order';
  end if;
  select pg_get_functiondef('public._gl_posting_account_write(text, text, text, text)'::regprocedure) into v_src;
  if position('''DELIVERY_TRANSPORT'') then' in v_src) = 0 or position('v_acc.is_control or exists' in v_src) = 0 then
    raise exception '0689: Posting accounts cannot change delivery transport, or lost a check';
  end if;
  select pg_get_functiondef('public.gl_posting_accounts()'::regprocedure) into v_src;
  if (length(v_src) - length(replace(v_src, '''DELIVERY_TRANSPORT''', ''))) / length('''DELIVERY_TRANSPORT''') <> 2 then
    raise exception '0689: Posting accounts does not list delivery transport';
  end if;
  select pg_get_functiondef('public.supplier_bill_document(uuid)'::regprocedure) into v_src;
  if position('dor.do_number as do_no' in v_src) = 0 then
    raise exception '0689: a bill does not say its delivery orders';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('fin_bill_delivery_orders', 'supplier_bill_save_draft', 'supplier_bill_document',
                                  '_gl_posting_account_write', 'gl_posting_accounts')
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0689: a function lost security definer or its search_path';
  end if;
  if has_function_privilege('anon', 'public.fin_bill_delivery_orders(uuid)', 'execute') then
    raise exception '0689: the delivery orders a bill can charge for are open to anon';
  end if;
end $sanity$;

commit;
