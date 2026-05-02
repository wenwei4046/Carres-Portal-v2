-- =============================================================================
-- 0003_rpcs.sql — RPC functions for cross-role workflows
-- =============================================================================
-- Per MIGRATION_SPEC §5: any state-machine action that mutates >1 table or
-- enforces business rules goes through SECURITY DEFINER RPCs called from the
-- client. CRUD that's safe to expose directly (read catalog, list orders)
-- stays on PostgREST.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- order_proceed(order_id) — Dealer/Salesperson "Proceed to next step"
--   - flips order.status from 'place' to 'proceed_order'
--   - sets logistics_stage = 'awaiting_stock'
--   - appends history
-- -----------------------------------------------------------------------------
create or replace function order_proceed(p_order_id uuid)
returns orders
language plpgsql security definer as $$
declare
  v_order orders;
begin
  update orders
    set status          = 'proceed_order',
        logistics_stage = 'awaiting_stock'
    where id = p_order_id and status = 'place'
    returning * into v_order;

  if v_order.id is null then
    raise exception 'Order not found or not in place state' using errcode = 'P0002';
  end if;

  insert into order_history (order_id, text, by_role, by_user_id)
  values (p_order_id,
          'Proceeded · routed to Logistics',
          auth.app_role(),
          auth.uid());

  return v_order;
end;
$$;

-- -----------------------------------------------------------------------------
-- order_record_payment — record a Dealer top-up / order payment
-- -----------------------------------------------------------------------------
create or replace function order_record_payment(
  p_order_id   uuid,
  p_amount     numeric,
  p_method     payment_method,
  p_reference  text,
  p_note       text,
  p_receipt_url text
) returns payments
language plpgsql security definer as $$
declare v_pay payments;
begin
  insert into payments (direction, amount, method, reference, note, paid_at,
                        order_id, receipt_url, recorded_by)
  values ('in', p_amount, p_method, p_reference, p_note, current_date,
          p_order_id, p_receipt_url, auth.uid())
  returning * into v_pay;

  update orders set paid = paid + p_amount where id = p_order_id;

  insert into order_history (order_id, text, by_role, by_user_id)
  values (p_order_id,
          format('Payment received · RM %s · %s', p_amount, p_method),
          auth.app_role(), auth.uid());

  return v_pay;
end;
$$;

-- -----------------------------------------------------------------------------
-- po_issue — Logistics issues a PO
-- -----------------------------------------------------------------------------
create or replace function po_issue(
  p_id            text,
  p_supplier_id   uuid,
  p_warehouse_id  uuid,
  p_sku           text,
  p_qty           int,
  p_partner_id    uuid,
  p_expected_ready date
) returns purchase_orders
language plpgsql security definer as $$
declare v_po purchase_orders;
begin
  if auth.app_role() not in ('logistics','principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into purchase_orders (id, supplier_id, warehouse_id, sku, qty,
                               status, sup_status, delivery_partner_id, expected_ready_date)
  values (p_id, p_supplier_id, p_warehouse_id, p_sku, p_qty,
          'open', 'pending', p_partner_id, p_expected_ready)
  returning * into v_po;

  insert into po_history (po_id, text, by_role, by_user_id)
  values (p_id, 'Issued by Logistics', 'logistics', auth.uid());

  return v_po;
end;
$$;

-- -----------------------------------------------------------------------------
-- po_advance — supplier acknowledges / starts production / ships / ready
-- -----------------------------------------------------------------------------
create or replace function po_advance(
  p_po_id       text,
  p_to_status   po_sup_status,
  p_note        text
) returns purchase_orders
language plpgsql security definer as $$
declare v_po purchase_orders;
begin
  update purchase_orders set sup_status = p_to_status, updated_at = now()
    where id = p_po_id returning * into v_po;
  if v_po.id is null then
    raise exception 'PO not found' using errcode = 'P0002';
  end if;

  insert into po_history (po_id, text, by_role, by_user_id)
  values (p_po_id, coalesce(p_note, p_to_status::text), auth.app_role(), auth.uid());

  return v_po;
end;
$$;

-- -----------------------------------------------------------------------------
-- po_receive — Logistics receives stock against a PO
-- -----------------------------------------------------------------------------
create or replace function po_receive(
  p_po_id        text,
  p_do_number    text,
  p_do_note      text,
  p_received_qty int,
  p_do_photo_url text
) returns po_receipts
language plpgsql security definer as $$
declare
  v_po purchase_orders;
  v_receipt po_receipts;
begin
  if auth.app_role() not in ('logistics','principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_po from purchase_orders where id = p_po_id;
  if v_po.id is null then raise exception 'PO not found'; end if;

  insert into po_receipts (po_id, do_number, do_note, received_qty, do_photo_url, received_by)
  values (p_po_id, p_do_number, p_do_note, p_received_qty, p_do_photo_url, auth.uid())
  returning * into v_receipt;

  insert into stock_balances (sku, warehouse_id, qty)
  values (v_po.sku, v_po.warehouse_id, p_received_qty)
  on conflict (sku, warehouse_id)
    do update set qty = stock_balances.qty + excluded.qty, updated_at = now();

  insert into stock_movements (sku, warehouse_id, qty, kind, ref, note, by_role, by_user_id)
  values (v_po.sku, v_po.warehouse_id, p_received_qty, 'in', p_po_id,
          format('DO #%s', p_do_number), auth.app_role(), auth.uid());

  update purchase_orders set status = 'received', sup_status = 'delivered', updated_at = now()
    where id = p_po_id;

  insert into po_history (po_id, text, by_role, by_user_id)
  values (p_po_id, format('Received · DO #%s · qty %s', p_do_number, p_received_qty),
          'logistics', auth.uid());

  return v_receipt;
end;
$$;

-- -----------------------------------------------------------------------------
-- order_dispatch — Logistics assigns partner + dispatches
-- -----------------------------------------------------------------------------
create or replace function order_dispatch(
  p_order_id      uuid,
  p_partner_id    uuid,
  p_warehouse_id  uuid
) returns orders
language plpgsql security definer as $$
declare v_order orders;
begin
  if auth.app_role() not in ('logistics','principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update orders set
    delivery_partner_id = p_partner_id,
    warehouse_id        = p_warehouse_id,
    logistics_stage     = 'dispatched',
    partner_stage       = 'assigned'
    where id = p_order_id
    returning * into v_order;

  perform 1 from order_lines where order_id = p_order_id;
  update stock_balances sb set
    qty = sb.qty - ol.qty,
    updated_at = now()
    from order_lines ol
    where ol.order_id = p_order_id and sb.sku = ol.sku and sb.warehouse_id = p_warehouse_id;

  insert into stock_movements (sku, warehouse_id, qty, kind, ref, note, by_role, by_user_id)
  select ol.sku, p_warehouse_id, ol.qty, 'out',
         format('DL #%s', v_order.dl), 'dispatched',
         'logistics', auth.uid()
    from order_lines ol where ol.order_id = p_order_id;

  insert into order_history (order_id, text, by_role, by_user_id)
  values (p_order_id, 'Dispatched · partner assigned', 'logistics', auth.uid());

  return v_order;
end;
$$;

-- -----------------------------------------------------------------------------
-- order_partner_advance — partner picks up / en-route / delivered
-- -----------------------------------------------------------------------------
create or replace function order_partner_advance(
  p_order_id   uuid,
  p_to_stage   partner_delivery_stage,
  p_note       text
) returns orders
language plpgsql security definer as $$
declare v_order orders;
begin
  update orders set
    partner_stage = p_to_stage,
    partner_picked_at = case when p_to_stage = 'picked_from_wh' then now() else partner_picked_at end,
    logistics_stage = case when p_to_stage = 'delivered' then 'delivered'::logistics_stage else logistics_stage end,
    status = case when p_to_stage = 'delivered' then 'delivered'::order_status else status end
    where id = p_order_id
    returning * into v_order;

  insert into order_history (order_id, text, by_role, by_user_id)
  values (p_order_id, coalesce(p_note, p_to_stage::text), 'partner', auth.uid());

  return v_order;
end;
$$;

-- -----------------------------------------------------------------------------
-- approval_decide — Principal approve/reject
-- -----------------------------------------------------------------------------
create or replace function approval_decide(
  p_id      uuid,
  p_status  approval_status,
  p_note    text
) returns approvals
language plpgsql security definer as $$
declare v_app approvals;
begin
  if not auth.is_principal() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update approvals set
    status = p_status,
    decided_at = now(),
    decided_by = auth.uid(),
    decision_note = p_note
    where id = p_id
    returning * into v_app;

  if v_app.kind = 'refund' and v_app.refers_to is not null then
    update refunds set
      status = case when p_status = 'approved' then 'approved'::refund_status else 'rejected'::refund_status end,
      approval_id = v_app.id,
      approved_at = case when p_status = 'approved' then now() end
      where order_id = (select id from orders where dl::text = replace(v_app.refers_to,'DL-',''));
  end if;

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('principal',
          (select name from app_users where id = auth.uid()),
          format('%s approval · %s', p_status, v_app.title),
          v_app.dealer_id,
          v_app.refers_to);

  return v_app;
end;
$$;

-- -----------------------------------------------------------------------------
-- invoice_issue — Finance issues a tax invoice
-- -----------------------------------------------------------------------------
create or replace function invoice_issue(
  p_order_id   uuid,
  p_amount     numeric,
  p_tax_amount numeric
) returns invoices
language plpgsql security definer as $$
declare
  v_inv invoices;
  v_no  text;
begin
  if auth.app_role() not in ('finance','principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_no := 'INV-' || to_char(now(),'YYYY') || '-' ||
          to_char((select dl from orders where id = p_order_id), 'FM0000');

  insert into invoices (invoice_no, order_id, amount, tax_amount, issued_at)
  values (v_no, p_order_id, p_amount, p_tax_amount, current_date)
  returning * into v_inv;

  update orders set invoice_no = v_no, invoiced_at = current_date where id = p_order_id;

  insert into order_history (order_id, text, by_role, by_user_id)
  values (p_order_id, format('Tax invoice issued · %s', v_no), 'finance', auth.uid());

  return v_inv;
end;
$$;

-- -----------------------------------------------------------------------------
-- dealer_topup — Dealer tops up deposit (creates payment + bumps balance)
-- -----------------------------------------------------------------------------
create or replace function dealer_topup(
  p_dealer_id  uuid,
  p_amount     numeric,
  p_method     payment_method,
  p_reference  text,
  p_receipt_url text
) returns payments
language plpgsql security definer as $$
declare v_pay payments;
begin
  insert into payments (direction, amount, method, reference, paid_at, receipt_url, recorded_by)
  values ('in', p_amount, p_method, p_reference, current_date, p_receipt_url, auth.uid())
  returning * into v_pay;

  update dealers set deposit_balance = deposit_balance + p_amount where id = p_dealer_id;

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values (auth.app_role(),
          (select name from app_users where id = auth.uid()),
          format('Top-up · RM %s · %s', p_amount, p_method),
          p_dealer_id,
          p_reference);

  return v_pay;
end;
$$;

-- -----------------------------------------------------------------------------
-- order_create — Dealer/Salesperson/Showroom creates an order (place state)
--   Accepts JSONB payload. Body shape:
--   {
--     dealer_id, outlet_id?, salesperson_id?,
--     customer: { name, phone, address, billing, billing_same, address_unknown, emergency },
--     delivery: { date?, date_tbd, floor, has_lift },
--     lines:    [{ sku, qty, attrs?, unit_price }],
--     addons:   [{ key, qty, unit_price }],
--     paid?, terms_accepted?, signature_url?
--   }
-- -----------------------------------------------------------------------------
create or replace function order_create(p_payload jsonb)
returns orders
language plpgsql security definer as $$
declare
  v_order  orders;
  v_dl     int;
  v_role   app_role := auth.app_role();
  v_dealer uuid     := (p_payload->>'dealer_id')::uuid;
  v_line   jsonb;
  v_addon  jsonb;
begin
  if v_role not in ('dealer','salesperson','showroom','principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(max(dl),1240) + 1 into v_dl from orders;

  insert into orders (
    dl, status, channel, dealer_id, outlet_id, salesperson_id,
    customer_name, customer_phone, customer_address, customer_billing,
    customer_billing_same, customer_address_unknown, customer_emergency,
    delivery_date, delivery_date_tbd, delivery_floor, delivery_has_lift,
    paid, terms_accepted, signature_url, placed_at
  ) values (
    v_dl, 'place',
    coalesce(p_payload->>'channel','dealer'),
    v_dealer,
    nullif(p_payload->>'outlet_id','')::uuid,
    nullif(p_payload->>'salesperson_id','')::uuid,
    p_payload->'customer'->>'name',
    p_payload->'customer'->>'phone',
    p_payload->'customer'->>'address',
    p_payload->'customer'->>'billing',
    coalesce((p_payload->'customer'->>'billing_same')::bool, true),
    coalesce((p_payload->'customer'->>'address_unknown')::bool, false),
    p_payload->'customer'->>'emergency',
    nullif(p_payload->'delivery'->>'date','')::date,
    coalesce((p_payload->'delivery'->>'date_tbd')::bool, false),
    coalesce((p_payload->'delivery'->>'floor')::int, 1),
    coalesce((p_payload->'delivery'->>'has_lift')::bool, false),
    coalesce((p_payload->>'paid')::numeric, 0),
    coalesce((p_payload->>'terms_accepted')::bool, false),
    nullif(p_payload->>'signature_url',''),
    now()
  ) returning * into v_order;

  for v_line in select * from jsonb_array_elements(coalesce(p_payload->'lines','[]'::jsonb))
  loop
    insert into order_lines (order_id, sku, qty, attrs, unit_price) values (
      v_order.id,
      v_line->>'sku',
      (v_line->>'qty')::int,
      v_line->'attrs',
      (v_line->>'unit_price')::numeric
    );
  end loop;

  for v_addon in select * from jsonb_array_elements(coalesce(p_payload->'addons','[]'::jsonb))
  loop
    insert into order_addons (order_id, addon_key, qty, unit_price) values (
      v_order.id,
      v_addon->>'key',
      coalesce((v_addon->>'qty')::int, 1),
      (v_addon->>'unit_price')::numeric
    );
  end loop;

  insert into order_history (order_id, text, by_role, by_user_id) values (
    v_order.id, 'Order created · awaiting deposit', v_role, auth.uid()
  );

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values (v_role,
          (select name from app_users where id = auth.uid()),
          format('Created order DL-%s', v_dl),
          v_dealer,
          format('DL-%s', v_dl));

  return v_order;
end;
$$;

-- =============================================================================
-- Grants — anon can call no RPC; authed can call all (RLS still applies inside)
-- =============================================================================
grant execute on function order_create(jsonb)                              to authenticated;
grant execute on function order_proceed(uuid)                              to authenticated;
grant execute on function order_record_payment(uuid, numeric, payment_method, text, text, text) to authenticated;
grant execute on function po_issue(text, uuid, uuid, text, int, uuid, date) to authenticated;
grant execute on function po_advance(text, po_sup_status, text)            to authenticated;
grant execute on function po_receive(text, text, text, int, text)          to authenticated;
grant execute on function order_dispatch(uuid, uuid, uuid)                 to authenticated;
grant execute on function order_partner_advance(uuid, partner_delivery_stage, text) to authenticated;
grant execute on function approval_decide(uuid, approval_status, text)     to authenticated;
grant execute on function invoice_issue(uuid, numeric, numeric)            to authenticated;
grant execute on function dealer_topup(uuid, numeric, payment_method, text, text) to authenticated;
