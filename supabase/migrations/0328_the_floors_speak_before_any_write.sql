-- 0328 · THE FLOORS SPEAK BEFORE ANY WRITE (STAGE 3 · card 3.2)
--
-- GATE 6 (docs/STAGE-3-GATES.md, FROZEN): **floors are PER-CONSEQUENCE,
-- never per-order.** `sales_order_floors()` evaluates CHANGED FIELDS against
-- the downstream state they actually touch and returns findings — it WRITES
-- NOTHING and BLOCKS NOTHING itself. The 3.3/3.8 APPLY RPCs call THIS
-- function pre-mutation, and the API exposes it read-only, so there is ONE
-- floor implementation, not two that currently agree (Law D).
--
-- Reused, not re-written:
--   commission month lock → 0272's own `_commission_assert_order_month_open`
--     is CALLED; its message is surfaced verbatim. No second lock engine.
--   received floor → the per-sku received fact is
--     `purchase_order_lines.received_qty` (the rollup 0001:355-363's
--     po_receipts feed); po_receipts itself carries no sku column, so the
--     line rollup IS the per-sku answer. (Build decision, logged.)
--   PO lineage → so / so_refs (0017) identify POTENTIALLY AFFECTED only.
--     NEVER an allocation truth, NEVER auto-revise (BUILD-QUEUE PO LINEAGE).
--
-- Severity: BLOCK (apply must fail whole) · WORK (durable correction work,
-- 3.4's input) · NONE (explicitly cleared — the evaluator says so aloud).
create or replace function public.sales_order_floors(
  p_order_id       uuid,
  p_changed        text[],
  p_proposed_lines jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role      text := public.app_role();
  v_order     orders%rowtype;
  v_findings  jsonb := '[]'::jsonb;
  v_items     boolean;
  v_promise   boolean;
  v_money     boolean;
  v_attrib    boolean;
  v_contact   text[];
  v_po        record;
  v_line      jsonb;
  v_received  numeric;
  v_inv       record;
  v_msg       text;
  v_frozen    text[];
begin
  if v_role not in ('operation','principal','finance','hr','bd') then
    raise exception 'Internal roles only' using errcode = '42501';
  end if;

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  v_items   := ('order_lines' = any(p_changed)) or ('order_addons' = any(p_changed));
  v_promise := ('delivery_date' = any(p_changed)) or ('delivery_date_tbd' = any(p_changed));
  v_money   := v_items or ('installment_months' = any(p_changed));
  v_attrib  := p_changed && array['salesperson_id','dealer_id','outlet_id','channel'];
  v_contact := (select coalesce(array_agg(f), '{}') from unnest(p_changed) f
                where f in ('customer_name','customer_phone','customer_email',
                            'customer_emergency','customer_address','customer_billing',
                            'customer_address_line1','customer_address_line2',
                            'customer_address_city','customer_address_state',
                            'customer_address_postcode'));

  -- ── GATE 7 · delivered / cancelled: contractual + attribution freeze;
  --    contact corrections stay allowed; revisions always appendable. ──
  if v_order.status in ('delivered','cancelled') then
    v_frozen := (select coalesce(array_agg(f), '{}') from unnest(p_changed) f
                 where f in ('order_lines','order_addons','delivery_date',
                             'delivery_date_tbd','installment_months',
                             'salesperson_id','dealer_id','outlet_id','channel'));
    if array_length(v_frozen, 1) > 0 then
      v_findings := v_findings || jsonb_build_object(
        'field', array_to_string(v_frozen, ','),
        'consequence', 'orders.status',
        'state', v_order.status,
        'severity', 'BLOCK',
        'evidence', 'GATE 7 — the order is ' || v_order.status ||
                    '; contractual and attribution fields are frozen. ' ||
                    'Contact corrections and appended revisions stay allowed.');
    end if;
  end if;

  -- ── PO lineage · POTENTIALLY AFFECTED, SHARED when >1 order (WORK) ──
  if v_items then
    for v_po in
      select po.id, po.so, po.so_refs, po.status,
             (select count(distinct s) from unnest(array[po.so] || coalesce(po.so_refs, '{}')) s
               where s is not null) as covered
      from purchase_orders po
      where (po.so = v_order.so or v_order.so = any(coalesce(po.so_refs, '{}')))
        and po.status <> 'cancelled'
        and exists (select 1 from purchase_order_lines pol
                     join order_lines ol on ol.sku = pol.sku
                    where pol.po_id = po.id and ol.order_id = p_order_id)
    loop
      v_findings := v_findings || jsonb_build_object(
        'field', 'order_lines',
        'consequence', 'purchase_orders',
        'state', v_po.status,
        'severity', 'WORK',
        'shared', v_po.covered > 1,
        'evidence', 'PO ' || v_po.id || ' covers SO-' ||
                    array_to_string(array[v_po.so] || coalesce(v_po.so_refs,'{}'), ', SO-') ||
                    ' — POTENTIALLY AFFECTED' ||
                    case when v_po.covered > 1 then ' · SHARED, human resolution required' else '' end ||
                    '. Never auto-revised.');
    end loop;
  end if;

  -- ── Received floor · proposed qty may not fall below received (BLOCK,
  --    pre-mutation — 2990's ReceivedFloorError shape, naming the line) ──
  if p_proposed_lines is not null and jsonb_typeof(p_proposed_lines) = 'array' then
    for v_line in select * from jsonb_array_elements(p_proposed_lines) loop
      select coalesce(sum(pol.received_qty), 0) into v_received
        from purchase_order_lines pol
        join purchase_orders po on po.id = pol.po_id
       where pol.sku = v_line->>'sku'
         and (po.so = v_order.so or v_order.so = any(coalesce(po.so_refs, '{}')))
         and po.status <> 'cancelled';
      if v_received > 0 and coalesce((v_line->>'qty')::numeric, 0) < v_received then
        v_findings := v_findings || jsonb_build_object(
          'field', 'order_lines.qty',
          'consequence', 'po_receipts.received_qty',
          'state', v_received::text,
          'severity', 'BLOCK',
          'evidence', 'Line ' || (v_line->>'sku') || ': proposed qty ' ||
                      coalesce(v_line->>'qty','0') || ' is below the ' ||
                      v_received || ' already received.');
      end if;
    end loop;
  end if;

  -- ── Operation gate · production started on THIS item — per field, never
  --    a whole-SO refusal (WORK) ──
  if v_order.operation_stage in ('in_production','ready_to_dispatch','dispatched','delivered')
     and (v_items or v_promise) then
    v_findings := v_findings || jsonb_build_object(
      'field', case when v_items and v_promise then 'order_lines,delivery_date'
                    when v_items then 'order_lines' else 'delivery_date' end,
      'consequence', 'operation_stage',
      'state', v_order.operation_stage,
      'severity', 'WORK',
      'evidence', 'Production has started (' || v_order.operation_stage ||
                  ') — operation correction work on the changed item(s).');
  end if;

  -- ── Logistics · dispatched or later → delivery correction WORK ──
  if v_promise and (v_order.dispatched_at is not null
                    or v_order.operation_stage in ('dispatched','delivered')) then
    v_findings := v_findings || jsonb_build_object(
      'field', 'delivery_date',
      'consequence', 'logistics',
      'state', coalesce(v_order.operation_stage, 'dispatched'),
      'severity', 'WORK',
      'evidence', 'Goods dispatched ' || coalesce(v_order.dispatched_at::text, '') ||
                  ' — the trip no longer matches the promise; delivery correction work.');
  end if;

  -- ── Invoice floor · issued amount may NOT be changed by an amendment.
  --    Route: credit note / refunds (0001:424, carries approval_id). ──
  if v_money then
    for v_inv in select invoice_no, amount from invoices
                  where order_id = p_order_id and voided_at is null
    loop
      v_findings := v_findings || jsonb_build_object(
        'field', 'order_lines,order_addons,installment_months',
        'consequence', 'invoices',
        'state', v_inv.invoice_no,
        'severity', 'BLOCK',
        'evidence', 'Invoice ' || v_inv.invoice_no || ' (RM ' || v_inv.amount ||
                    ') is issued and not voided — the amendment may not change ' ||
                    'its amount. Route: credit note / refunds.');
    end loop;
  end if;

  -- ── Commission month lock · CALL 0272, never a second engine ──
  if v_attrib then
    begin
      perform public._commission_assert_order_month_open(p_order_id);
      v_findings := v_findings || jsonb_build_object(
        'field', 'salesperson_id,dealer_id,outlet_id,channel',
        'consequence', 'commission_runs',
        'state', 'open',
        'severity', 'NONE',
        'evidence', 'Commission month open — attribution may move (0272 gate passed).');
    exception when others then
      -- 0272 raises 'commission_month_locked' and puts the HUMAN sentence in
      -- the DETAIL ("… is approved - reopen the run before changing who gets
      -- credit for it."). Surface the detail — that IS the 0272 message.
      declare v_detail text;
      begin
        get stacked diagnostics v_detail = pg_exception_detail;
        v_msg := coalesce(nullif(v_detail, ''), sqlerrm);
      end;
      v_findings := v_findings || jsonb_build_object(
        'field', 'salesperson_id,dealer_id,outlet_id,channel',
        'consequence', 'commission_runs',
        'state', 'locked',
        'severity', 'BLOCK',
        'evidence', v_msg);
    end;
  end if;

  -- ── Contact fields · EXPLICITLY cleared — never blocked by stage ──
  if array_length(v_contact, 1) > 0 then
    v_findings := v_findings || jsonb_build_object(
      'field', array_to_string(v_contact, ','),
      'consequence', 'none',
      'state', '',
      'severity', 'NONE',
      'evidence', 'Contact/address corrections carry no downstream consequence and are never blocked by operation_stage (GATE 6, verbatim).');
  end if;

  return jsonb_build_object('order_id', p_order_id, 'so', v_order.so, 'findings', v_findings);
end $$;

revoke all on function public.sales_order_floors(uuid, text[], jsonb) from public;
grant execute on function public.sales_order_floors(uuid, text[], jsonb) to authenticated;
