-- =============================================================================
-- 0712_office_staff_open_a_sales_invoice_by_hand.sql
-- =============================================================================
-- THE RULING (Weisiang, Mr Lim "Houzs Weisiang.00", WhatsApp 2026-10-22,
--   relayed by YH 2026-10-23): "I think just clear Carress rules and Implement
--   Houzs inside, as long as they can open SO PO DO". Office staff open a
--   Sales Invoice by hand from a Sales Order's (or a Delivery Order's) lines,
--   the Houzs way (SalesInvoiceFromDo.tsx), and an order may carry more than
--   one: a part invoice bills only the quantities picked. This overturns
--   Jess's rules in docs/payment/MASTER.md (no manual `Generate invoice` door;
--   one live Sales Invoice per order). Jess was not part of this decision.
--   Follows Houzs frontend/src/pages/scm-v2/SalesInvoiceFromDo.tsx:7-14 (a line
--   invoiced across several invoices until remaining = qty - invoiced reaches 0)
--   per Weisiang's ruling (2026-10-22): clear Carres rules, implement Houzs.
--
-- WHAT A PART INVOICE NEEDS (Carres has no invoice-lines table)
--   The invoice's own lines live in its immutable issue snapshot:
--   snapshot.issued_from = 'office', snapshot.lines = [{order_line_id, sku,
--   qty, unit_price}], snapshot.addons = [{addon_key, qty, unit_price}].
--   What is left to invoice on an order line = its qty minus the qty on the
--   order's live office invoices.
--
-- WHAT THIS CHANGES
--   1  The one-live-Sales-Invoice index now leaves office invoices out: the
--      system's own doors (dispatch, Generate invoice, prepare) still make at
--      most one whole-order invoice; office invoices may be many.
--   2  Revenue: `_sales_invoice_to_ledger` (and 0659's `_gl_goods_split`,
--      where it exists) read an office invoice's OWN lines and add-ons, not
--      the whole order's. Every other invoice reads exactly what it read.
--   3  Two doors: `sales_invoice_office_offer(order)` (what is left) and
--      `sales_invoice_office_open(order, lines)`, which issues through the ONE
--      numbering and posting authority `payment_invoice_issue`. The order's
--      add-ons ride on the order's first office invoice.
--   4  Voiding an office invoice drafts no whole-order replacement (correct it
--      by opening a new one through the door); the order keeps wearing another
--      live invoice's number when one exists, so the system's own doors stay
--      shut.
--   5  The Collection report adds up every live Sales Invoice of the order
--      (it showed only the newest).
--
-- WHAT IT REFUSES
--   · a caller who is not Operation, Finance or principal (NULL-safe)
--   · a cancelled order; an order already on a whole-order Sales Invoice
--     (issued or draft) — that one already bills everything
--   · no lines, a line of another order, a repeated line, a qty that is not a
--     whole number above 0, or more than is left on the line
--   · an invoice that comes to RM 0
--   · a snapshot sent straight to payment_invoice_issue that claims to be an
--     office invoice (only the door makes one)
--
-- UNCHANGED: Balance due, the Payment Monitor, AR and statements stay ORDER
-- money (orderMoney / soRemaining); payments still credit AR as before.
-- =============================================================================

begin;

set search_path = public, pg_temp;

create or replace function pg_temp.mig0712_rewrite(p_fn regprocedure, p_old text, p_new text)
returns void
language plpgsql
as $rw$
declare
  v_def text := replace(pg_get_functiondef(p_fn), E'\r\n', E'\n');
  v_n   integer;
begin
  p_old := replace(p_old, E'\r\n', E'\n');
  p_new := replace(p_new, E'\r\n', E'\n');
  v_n := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
  if v_n <> 1 then
    raise exception '0712: % holds the text to change % times, not once: %', p_fn, v_n, left(p_old, 90);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$rw$;

-- ── 1 · many office invoices, still one whole-order invoice ──────────────────
drop index if exists public.invoices_live_sales_per_order_uidx;
create unique index invoices_live_sales_per_order_uidx
  on public.invoices (order_id)
  where kind = 'sales' and status <> 'voided'
    and coalesce(snapshot ->> 'issued_from', '') <> 'office';
comment on index public.invoices_live_sales_per_order_uidx is
  '0712 (Weisiang 2026-10-22): at most ONE live whole-order Sales Invoice per order. Office invoices (snapshot.issued_from = office) are left out: an order may carry several part invoices.';

-- ── 2 · an invoice's own lines and add-ons ───────────────────────────────────
create or replace function public._sales_invoice_lines(p_order_id uuid, p_invoice_no text)
returns table (sku text, qty numeric, unit_price numeric)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select l ->> 'sku', (l ->> 'qty')::numeric, (l ->> 'unit_price')::numeric
    from invoices i
    cross join jsonb_array_elements(i.snapshot -> 'lines') l
   where i.invoice_no = p_invoice_no and i.snapshot ->> 'issued_from' = 'office'
  union all
  select ol.sku, ol.qty::numeric, ol.unit_price
    from order_lines ol
   where ol.order_id = p_order_id
     and not exists (select 1 from invoices i
                      where i.invoice_no = p_invoice_no and i.snapshot ->> 'issued_from' = 'office');
$fn$;
comment on function public._sales_invoice_lines(uuid, text) is
  '0712: the goods an invoice bills. An office invoice: its snapshot lines. Any other: every line of the order, as before.';

create or replace function public._sales_invoice_addons(p_order_id uuid, p_invoice_no text)
returns table (addon_key text, qty numeric, unit_price numeric)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select a ->> 'addon_key', (a ->> 'qty')::numeric, (a ->> 'unit_price')::numeric
    from invoices i
    cross join jsonb_array_elements(coalesce(i.snapshot -> 'addons', '[]'::jsonb)) a
   where i.invoice_no = p_invoice_no and i.snapshot ->> 'issued_from' = 'office'
  union all
  select oa.addon_key, oa.qty::numeric, oa.unit_price
    from order_addons oa
   where oa.order_id = p_order_id
     and not exists (select 1 from invoices i
                      where i.invoice_no = p_invoice_no and i.snapshot ->> 'issued_from' = 'office');
$fn$;
comment on function public._sales_invoice_addons(uuid, text) is
  '0712: the add-ons an invoice bills. An office invoice: its snapshot add-ons. Any other: every add-on of the order, as before.';

revoke all on function public._sales_invoice_lines(uuid, text) from public, anon, authenticated;
revoke all on function public._sales_invoice_addons(uuid, text) from public, anon, authenticated;

-- ── 2b · revenue reads the invoice's own lines ───────────────────────────────
select pg_temp.mig0712_rewrite('public._sales_invoice_to_ledger(text)'::regprocedure,
$old$      from order_lines ol
     where ol.order_id = v_inv.order_id;$old$,
$new$      from public._sales_invoice_lines(v_inv.order_id, p_invoice_no) ol;   -- 0712: the invoice's own lines$new$);

select pg_temp.mig0712_rewrite('public._sales_invoice_to_ledger(text)'::regprocedure,
$old$        from order_addons oa
       where oa.order_id = v_inv.order_id
       group by oa.addon_key$old$,
$new$        from public._sales_invoice_addons(v_inv.order_id, p_invoice_no) oa   -- 0712: the invoice's own add-ons
       group by oa.addon_key$new$);

-- 0659's item-group split re-reads the goods; production has it, a replay that
-- stopped before 0659 does not.
do $split$
begin
  if to_regprocedure('public._gl_goods_split(jsonb, text, numeric, uuid, text, text)') is not null then
    perform pg_temp.mig0712_rewrite('public._gl_goods_split(jsonb, text, numeric, uuid, text, text)'::regprocedure,
$old$              from public.order_lines ol
             where ol.order_id = p_order_id) x$old$,
$new$              from public._sales_invoice_lines(p_order_id, p_invoice_no) ol) x   -- 0712$new$);
  end if;
end;
$split$;

-- ── 3 · the doors ────────────────────────────────────────────────────────────
-- What is left to invoice on each line of an order.
create or replace function public._sales_invoice_office_left(p_order_id uuid)
returns table (order_line_id uuid, sku text, qty integer, unit_price numeric, invoiced numeric)
language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select ol.id, ol.sku, ol.qty, ol.unit_price,
         coalesce((select sum((l ->> 'qty')::numeric)
                     from invoices i
                     cross join jsonb_array_elements(i.snapshot -> 'lines') l
                    where i.order_id = ol.order_id and i.kind = 'sales' and i.status = 'issued'
                      and i.snapshot ->> 'issued_from' = 'office'
                      and l ->> 'order_line_id' = ol.id::text), 0)
    from order_lines ol
   where ol.order_id = p_order_id
   order by ol.created_at, ol.id;
$fn$;
revoke all on function public._sales_invoice_office_left(uuid) from public, anon, authenticated;

create or replace function public.sales_invoice_office_offer(p_order_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
declare
  v_order orders;
  v_whole invoices;
begin
  if coalesce(public.app_role() not in ('operation', 'finance', 'principal'), true) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_payment_staff';
  end if;
  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Sales Order not found.' using errcode = 'P0002', detail = 'order_not_found';
  end if;
  select * into v_whole from invoices
   where order_id = p_order_id and kind = 'sales' and status <> 'voided'
     and coalesce(snapshot ->> 'issued_from', '') <> 'office'
   limit 1;
  return jsonb_build_object(
    'order', jsonb_build_object('id', v_order.id, 'so', v_order.so,
                                'customer_name', v_order.customer_name,
                                'cancelled', v_order.status::text = 'cancelled'),
    'whole_invoice_no', case when v_whole.id is null then null
                             else coalesce(v_whole.invoice_no, 'draft') end,
    'addons_pending', not exists (select 1 from invoices i
                                   where i.order_id = p_order_id and i.kind = 'sales' and i.status = 'issued'
                                     and i.snapshot ->> 'issued_from' = 'office'
                                     and jsonb_array_length(coalesce(i.snapshot -> 'addons', '[]'::jsonb)) > 0),
    'addons', coalesce((select jsonb_agg(jsonb_build_object('addon_key', a.addon_key, 'qty', a.qty,
                                                            'unit_price', a.unit_price) order by a.addon_key, a.id)
                          from order_addons a where a.order_id = p_order_id), '[]'::jsonb),
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
                                 'order_line_id', x.order_line_id, 'sku', x.sku, 'qty', x.qty,
                                 'unit_price', x.unit_price, 'invoiced', x.invoiced,
                                 'left', greatest(0, x.qty - x.invoiced)))
                         from public._sales_invoice_office_left(p_order_id) x), '[]'::jsonb));
end;
$fn$;
comment on function public.sales_invoice_office_offer(uuid) is
  '0712 (Weisiang 2026-10-22): what is left to invoice on each line of an order, for the office New Sales Invoice door.';
revoke all on function public.sales_invoice_office_offer(uuid) from public, anon;
grant execute on function public.sales_invoice_office_offer(uuid) to authenticated;

create or replace function public.sales_invoice_office_open(p_order_id uuid, p_lines jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_order   orders;
  v_whole   invoices;
  v_pick    jsonb;
  v_seen    uuid[] := '{}';
  v_id      uuid;
  v_qty     integer;
  v_left    record;
  v_lines   jsonb := '[]'::jsonb;
  v_addons  jsonb := '[]'::jsonb;
  v_amount  numeric(12,2) := 0;
  v_draft   invoices;
begin
  if coalesce(public.app_role() not in ('operation', 'finance', 'principal'), true) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_payment_staff';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Pick the goods to invoice.' using errcode = '22023', detail = 'nothing_picked';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Sales Order not found.' using errcode = 'P0002', detail = 'order_not_found';
  end if;
  if v_order.status::text = 'cancelled' then
    raise exception 'This Sales Order is cancelled.' using errcode = '22023', detail = 'order_cancelled';
  end if;

  select * into v_whole from invoices
   where order_id = p_order_id and kind = 'sales' and status <> 'voided'
     and coalesce(snapshot ->> 'issued_from', '') <> 'office'
   limit 1;
  if found then
    raise exception 'This Sales Order is already on Sales Invoice %.', coalesce(v_whole.invoice_no, '(draft)')
      using errcode = '22023', detail = 'already_invoiced_whole';
  end if;

  for v_pick in select value from jsonb_array_elements(p_lines) loop
    if coalesce(v_pick ->> 'order_line_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(v_pick ->> 'qty', '') !~ '^[0-9]{1,6}$' or (v_pick ->> 'qty')::integer < 1 then
      raise exception 'Each line needs a quantity of 1 or more.' using errcode = '22023', detail = 'invalid_line';
    end if;
    v_id  := (v_pick ->> 'order_line_id')::uuid;
    v_qty := (v_pick ->> 'qty')::integer;
    if v_id = any (v_seen) then
      raise exception 'A line is picked twice.' using errcode = '22023', detail = 'invalid_line';
    end if;
    v_seen := v_seen || v_id;

    select * into v_left from public._sales_invoice_office_left(p_order_id) x where x.order_line_id = v_id;
    if not found then
      raise exception 'That line is not on this Sales Order.' using errcode = '22023', detail = 'line_not_on_order';
    end if;
    if v_qty > v_left.qty - v_left.invoiced then
      raise exception '% has % left to invoice.', v_left.sku, greatest(0, v_left.qty - v_left.invoiced)
        using errcode = '22023', detail = 'more_than_left';
    end if;
    v_lines  := v_lines || jsonb_build_array(jsonb_build_object(
                  'order_line_id', v_id, 'sku', v_left.sku, 'qty', v_qty, 'unit_price', v_left.unit_price));
    v_amount := v_amount + round(v_qty * v_left.unit_price, 2);
  end loop;

  -- The order's add-ons (delivery, carrying, ...) ride on the first office
  -- invoice; if that one is voided, on the next (no live office invoice
  -- carries them any more).
  if not exists (select 1 from invoices i
                  where i.order_id = p_order_id and i.kind = 'sales' and i.status = 'issued'
                    and i.snapshot ->> 'issued_from' = 'office'
                    and jsonb_array_length(coalesce(i.snapshot -> 'addons', '[]'::jsonb)) > 0) then
    select coalesce(jsonb_agg(jsonb_build_object('addon_key', a.addon_key, 'qty', a.qty, 'unit_price', a.unit_price)
                              order by a.addon_key, a.id), '[]'::jsonb),
           v_amount + coalesce(sum(round(a.qty * a.unit_price, 2)), 0)
      into v_addons, v_amount
      from order_addons a where a.order_id = p_order_id;
  end if;

  if v_amount <= 0 then
    raise exception 'This invoice comes to RM 0. Pick priced goods.' using errcode = '22023', detail = 'nothing_to_bill';
  end if;

  insert into invoices (order_id, amount, tax_amount, kind, status, created_by, snapshot)
  values (p_order_id, v_amount, 0, 'sales', 'draft', auth.uid(), jsonb_build_object('issued_from', 'office'))
  returning * into v_draft;

  -- The ONE numbering and posting authority: number, snapshot, order stamp,
  -- history line and the journal entry, or none of them.
  return public.payment_invoice_issue(v_draft.id, jsonb_build_object(
    'kind', 'sales',
    'amount', v_amount,
    'tax_amount', 0,
    'order_id', p_order_id,
    'so', 'SO-' || v_order.so,
    'customer', jsonb_build_object('name', coalesce(v_order.customer_name, ''),
                                   'phone', v_order.customer_phone,
                                   'address', v_order.customer_address),
    'lines', v_lines,
    'addons', v_addons,
    'issued_from', 'office'));
end;
$fn$;
comment on function public.sales_invoice_office_open(uuid, jsonb) is
  '0712 (Weisiang 2026-10-22): office staff open a Sales Invoice by hand for picked SO lines and quantities; a part invoice is allowed. Issues through payment_invoice_issue.';
revoke all on function public.sales_invoice_office_open(uuid, jsonb) from public, anon;
grant execute on function public.sales_invoice_office_open(uuid, jsonb) to authenticated;

-- ── 4 · voiding an office invoice drafts no whole-order replacement ──────────
select pg_temp.mig0712_rewrite('public.payment_invoice_void_replace(uuid, text)'::regprocedure,
$old$  if v_inv.kind = 'sales' then
    update orders set invoice_no = null, invoiced_at = null
     where id = v_inv.order_id and invoice_no = v_inv.invoice_no;
  end if;$old$,
$new$  if v_inv.kind = 'sales' then
    update orders set invoice_no = null, invoiced_at = null
     where id = v_inv.order_id and invoice_no = v_inv.invoice_no;
  end if;

  -- 0712 (Weisiang 2026-10-22): an office invoice is corrected by opening a
  -- new one through the door, not by a whole-order replacement draft. The
  -- order keeps wearing another live invoice's number, so the system's own
  -- doors (dispatch, Generate invoice) stay shut.
  if v_inv.snapshot ->> 'issued_from' = 'office' then
    update orders o set invoice_no = x.invoice_no, invoiced_at = x.issued_at
      from (select i.invoice_no, i.issued_at from invoices i
             where i.order_id = v_inv.order_id and i.kind = 'sales' and i.status = 'issued'
             order by i.issued_at desc, i.created_at desc limit 1) x
     where o.id = v_inv.order_id and o.invoice_no is null;
    insert into order_history (order_id, text, by_role, by_user_id)
    values (v_inv.order_id, format('Invoice %s voided · %s', v_inv.invoice_no, btrim(p_reason)),
            public.app_role(), v_uid);
    return jsonb_build_object('voided', to_jsonb(v_inv), 'replacement', null);
  end if;$new$);

-- ── 4b · only the door makes an office invoice ───────────────────────────────
-- issued_from = 'office' now decides revenue and the one-live index, so a
-- snapshot sent straight to payment_invoice_issue may not claim it: the draft
-- must be the door's own (inserted with snapshot.issued_from = office).
select pg_temp.mig0712_rewrite('public.payment_invoice_issue(uuid, jsonb)'::regprocedure,
$old$      using errcode = '22023', detail = 'not_a_draft';
  end if;$old$,
$new$      using errcode = '22023', detail = 'not_a_draft';
  end if;
  -- 0712: only sales_invoice_office_open makes an office invoice.
  if (coalesce(p_snapshot ->> 'issued_from', '') = 'office')
     <> (coalesce(v_inv.snapshot ->> 'issued_from', '') = 'office') then
    raise exception 'Only New Sales Invoice opens an office invoice.'
      using errcode = '22023', detail = 'office_snapshot_mismatch';
  end if;$new$);

-- ── 5 · the Collection report adds up every live Sales Invoice ───────────────
select pg_temp.mig0712_rewrite('public.fin_collection(date, date)'::regprocedure,
$old$              select i.id, i.invoice_no, i.amount + coalesce(i.tax_amount, 0) as billed, i.issued_at
                from public.invoices i
               where i.order_id = o.id and i.kind = 'sales' and i.status = 'issued' and i.voided_at is null
               order by i.issued_at desc nulls last, i.created_at desc
               limit 1$old$,
$new$              -- 0712: an order may carry several Sales Invoices (part invoices).
              select (array_agg(i.id order by i.issued_at desc nulls last, i.created_at desc))[1] as id,
                     string_agg(i.invoice_no, ', ' order by i.issued_at, i.created_at) as invoice_no,
                     sum(i.amount + coalesce(i.tax_amount, 0)) as billed,
                     min(i.issued_at) as issued_at
                from public.invoices i
               where i.order_id = o.id and i.kind = 'sales' and i.status = 'issued' and i.voided_at is null$new$);

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_src text;
begin
  select pg_get_functiondef('public._sales_invoice_to_ledger(text)'::regprocedure) into v_src;
  if position('_sales_invoice_lines(v_inv.order_id, p_invoice_no)' in v_src) = 0
     or position('_sales_invoice_addons(v_inv.order_id, p_invoice_no)' in v_src) = 0 then
    raise exception '0712: revenue does not read the invoice''s own lines';
  end if;
  if to_regprocedure('public._gl_goods_split(jsonb, text, numeric, uuid, text, text)') is not null then
    if position('_sales_invoice_lines(' in pg_get_functiondef(
         to_regprocedure('public._gl_goods_split(jsonb, text, numeric, uuid, text, text)'))) = 0 then
      raise exception '0712: the item-group split does not read the invoice''s own lines';
    end if;
  end if;
  if position('issued_from'' = ''office''' in pg_get_functiondef('public.payment_invoice_void_replace(uuid, text)'::regprocedure)) = 0 then
    raise exception '0712: voiding an office invoice still drafts a whole-order replacement';
  end if;
  if position('office_snapshot_mismatch' in pg_get_functiondef('public.payment_invoice_issue(uuid, jsonb)'::regprocedure)) = 0 then
    raise exception '0712: a snapshot sent straight to payment_invoice_issue can still claim to be an office invoice';
  end if;
  if position('string_agg(i.invoice_no' in pg_get_functiondef('public.fin_collection(date, date)'::regprocedure)) = 0 then
    raise exception '0712: the Collection report still reads one invoice';
  end if;
  if has_function_privilege('anon', 'public.sales_invoice_office_open(uuid, jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public._sales_invoice_lines(uuid, text)', 'execute') then
    raise exception '0712: a door or helper is open to the wrong caller';
  end if;
end;
$sanity$;

commit;

-- =============================================================================
-- REVERSAL (by hand, only if 0712 must be withdrawn and NO office invoice is
-- live — otherwise the old index cannot be rebuilt):
--   1 re-run the bodies of _sales_invoice_to_ledger, _gl_goods_split,
--     payment_invoice_issue, payment_invoice_void_replace and fin_collection
--     from before 0712
--     (pg_get_functiondef on a database without 0712);
--   2 drop function public.sales_invoice_office_open(uuid, jsonb),
--     public.sales_invoice_office_offer(uuid), public._sales_invoice_office_left(uuid),
--     public._sales_invoice_lines(uuid, text), public._sales_invoice_addons(uuid, text);
--   3 drop index public.invoices_live_sales_per_order_uidx; create unique index
--     invoices_live_sales_per_order_uidx on public.invoices (order_id)
--     where kind = 'sales' and status <> 'voided';
-- =============================================================================
