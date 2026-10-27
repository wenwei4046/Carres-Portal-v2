-- 0727 · a claimless
-- Consignment Return takes its Units out of stock when it is created.
--
-- Follows Houzs backend/src/scm/routes/purchase-consignment-returns.ts:564
-- ("Inventory OUT" on create) per Weisiang's ruling (2026-10-22): clear Carres
-- rules, implement Houzs. Overturns Purchasing MASTER 9.10 "Issuing/sending
-- the return is not proof of collection" for `New Consignment Return` only.
-- A claim-issued Consignment Return still waits for its pickup (0612).
--
-- 0706 (already on main) is not edited. This file re-issues ONLY
-- purchasing_issue_consignment_return: 0706's body plus, per Unit, status
-- `free` -> `returned_to_supplier` and the line's actual_pickup_date. The
-- refusal (0706) has already proved each Unit is `free`; the 0341 guard
-- restricts only on_hold exits. Grants unchanged.
--
-- REVERSAL: re-run 0706's CREATE OR REPLACE of
-- purchasing_issue_consignment_return verbatim. Units already returned stay
-- returned (custody facts are never rewritten).

create or replace function public.purchasing_issue_consignment_return(
  p_supplier_id uuid, p_units jsonb, p_confirmed_pickup_date date default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role      app_role := (select public.app_role());
  v_supplier  public.suppliers%rowtype;
  v_return_to text;
  v_return_id uuid := gen_random_uuid();
  v_unit      jsonb;
  v_item      public.ops_stock_items%rowtype;
  v_refusal   text;
  v_ids       uuid[] := '{}';
  v_count     int := 0;
begin
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'operation or principal only'
      using errcode = '42501', detail = 'not_purchasing';
  end if;
  select * into v_supplier from public.suppliers where id = p_supplier_id;
  if not found then
    raise exception 'supplier not found' using errcode = 'P0002', detail = 'supplier_not_found';
  end if;
  v_return_to := coalesce(nullif(btrim(v_supplier.return_address), ''), nullif(btrim(v_supplier.address), ''));
  if v_return_to is null then
    raise exception 'Add the address of %', coalesce(v_supplier.name, 'the supplier')
      using errcode = '23514', detail = 'address_missing';
  end if;
  if p_confirmed_pickup_date is not null
     and p_confirmed_pickup_date < (timezone('Asia/Kuala_Lumpur', now()))::date then
    raise exception 'The Confirmed Pickup date has passed'
      using errcode = '22023', detail = 'pickup_date_passed';
  end if;
  if jsonb_typeof(p_units) is distinct from 'array' or jsonb_array_length(p_units) = 0 then
    raise exception 'a consignment return needs at least one Unit'
      using errcode = '23514', detail = 'no_units';
  end if;

  insert into public.purchase_returns (
    id, supplier_claim_id, supplier_id, warehouse_receipt_id,
    confirmed_pickup_date, created_by, is_consignment, pr_no
  )
  values (
    v_return_id, null, p_supplier_id, null,
    p_confirmed_pickup_date, auth.uid(), true,
    public.allocate_formal_document_code('CRTN', v_return_id::text)
  );

  for v_unit in select * from jsonb_array_elements(p_units) loop
    select * into v_item from public.ops_stock_items
     where id = nullif(v_unit ->> 'stock_item_id', '')::uuid
     for update;
    if not found then
      raise exception 'that Unit is not a tracked Unit'
        using errcode = '23514', detail = 'unit_not_tracked';
    end if;
    if v_item.id = any (v_ids) then
      raise exception '%: named twice', coalesce(v_item.unit_code, 'Unit')
        using errcode = '23514', detail = 'unit_twice';
    end if;
    v_ids := v_ids || v_item.id;
    v_refusal := public.consignment_return_unit_refusal(v_item, p_supplier_id);
    if v_refusal is not null then
      raise exception '%: %', coalesce(v_item.unit_code, 'Unit'), v_refusal
        using errcode = '23514', detail = 'unit_not_eligible', hint = v_refusal;
    end if;
    if coalesce(v_unit ->> 'seen', '') = ''
       or v_item.updated_at is distinct from (v_unit ->> 'seen')::timestamptz then
      raise exception '%: Changed since the form opened', v_item.unit_code
        using errcode = '23514', detail = 'unit_changed';
    end if;
    insert into public.purchase_return_units (
      purchase_return_id, stock_item_id, unit_code, po_id,
      category, item, item_spec, pickup_location, return_to
    )
    values (
      v_return_id, v_item.id, v_item.unit_code, v_item.po_no,
      nullif(btrim(v_unit ->> 'category'), ''),
      nullif(btrim(v_unit ->> 'item'), ''),
      nullif(btrim(v_unit ->> 'item_spec'), ''),
      coalesce(nullif(btrim(v_unit ->> 'pickup_location'), ''),
               (select w.name from public.warehouses w where w.id = v_item.warehouse_id)),
      v_return_to
    );
    -- Stock leaves when the return is created. Follows Houzs
    -- backend/src/scm/routes/purchase-consignment-returns.ts:564 ("Inventory
    -- OUT") per Weisiang's ruling (2026-10-22): clear Carres rules, implement
    -- Houzs. Overturns section 7.4 "issuing is not moving furniture" for this
    -- door only; the refusal above proved the Unit is `free`.
    update public.ops_stock_items
       set status = 'returned_to_supplier', updated_at = now()
     where id = v_item.id;
    update public.purchase_return_units
       set actual_pickup_date = now()
     where purchase_return_id = v_return_id and stock_item_id = v_item.id;
    v_count := v_count + 1;
  end loop;

  insert into public.audit_log (role, actor_text, action, ref)
  values (v_role, auth.uid()::text, 'purchasing_issue_consignment_return',
          v_return_id::text || ' supplier=' || p_supplier_id::text || ' units=' || v_count);
  return v_return_id;
end;
$function$;
revoke all on function public.purchasing_issue_consignment_return(uuid, jsonb, date) from public, anon;
grant execute on function public.purchasing_issue_consignment_return(uuid, jsonb, date) to authenticated;
