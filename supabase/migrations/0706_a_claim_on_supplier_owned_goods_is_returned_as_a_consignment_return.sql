-- =============================================================================
-- 0706_a_claim_on_supplier_owned_goods_is_returned_as_a_consignment_return.sql
-- =============================================================================
-- Purchasing MASTER 9.10 (Consignment Returns, own register and number family)
-- and 9.5 (Supplier Claim outcome `Return to supplier`); COPY "Showroom
-- document names": Consignment Return, number family CRTN.
--
-- A Supplier Claim with `Return to supplier` whose Units are ALL supplier-owned
-- (ops_stock_items.ownership = 'supplier_consignment') is issued by the SAME
-- door as a Purchase Return, but is numbered CRTN through
-- allocate_formal_document_code and marked purchase_returns.is_consignment, so
-- its own register can list it apart. Mixed ownership is refused
-- (detail `mixed_ownership`), as is supplier-owned goods whose supplier is not
-- the claim's (`not_suppliers_goods`, judged by the PO's supplier_id). Everything else in the door is 0614's,
-- read from the definition 0614 left (0609 is NOT the latest), role gate and
-- grants unchanged. A Consignment Return owes no credit: _supplier_note_followups_from_returns (0676) is
-- re-issued below to skip it, even for Units flipped to supplier-owned after billing.
--
-- REVERSAL:
--   1. Re-run section 3 of 0614 (the CREATE OR REPLACE of
--      purchasing_issue_purchase_return) verbatim; grants stay.
--      Re-run the CREATE OR REPLACE of _supplier_note_followups_from_returns
--      from 0676 (lines 166-214) verbatim, dropping `and not pr.is_consignment`.
--   2. Only if no row is a Consignment Return:
--        select count(*) from public.purchase_returns where is_consignment;  -- must be 0
--        alter table public.purchase_returns drop column is_consignment;
--      Otherwise keep the column: CRTN numbers are never reused (0574).
--   3. Section 2 (claimless Consignment Return): drop functions
--      purchasing_issue_consignment_return(uuid, jsonb, date),
--      consignment_return_eligible_units(uuid) and
--      consignment_return_unit_refusal(ops_stock_items, uuid). Only if no row
--      has a NULL supplier_claim_id: drop constraint
--      purchase_returns_claim_or_consignment, set supplier_claim_id NOT NULL.

alter table public.purchase_returns add column if not exists is_consignment boolean not null default false;

comment on column public.purchase_returns.is_consignment is
  '0706: true when every Unit was supplier-owned; the return is then a Consignment Return numbered CRTN (MASTER 9.10).';

CREATE OR REPLACE FUNCTION public.purchasing_issue_purchase_return(p_claim_id uuid, p_units jsonb, p_confirmed_pickup_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role        app_role := (select public.app_role());
  v_claim       public.supplier_claims%rowtype;
  v_supplier    public.suppliers%rowtype;
  v_return_to   text;
  v_return_id   uuid;
  v_unit        jsonb;
  v_item        public.ops_stock_items%rowtype;
  v_refusal     text;
  v_ids         uuid[] := '{}';
  v_count       int := 0;
  v_consign     int;
  v_total       int;
  v_pr_no       text;
begin
  -- 0500's law: a NULL app_role must never fall through a gate.
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'operation or principal only'
      using errcode = '42501', detail = 'not_purchasing';
  end if;

  select * into v_claim from public.supplier_claims where id = p_claim_id for update;
  if not found then
    raise exception 'supplier claim not found'
      using errcode = 'P0002', detail = 'claim_not_found';
  end if;
  if v_claim.status is distinct from 'open' then
    raise exception 'Claim % is %', v_claim.claim_no, v_claim.status
      using errcode = '23514', detail = 'claim_not_open';
  end if;

  -- THE APPROVED OUTCOME, AND NOTHING LOOSER (0548, unchanged).
  if v_claim.carres_execution is distinct from 'return_to_supplier' then
    raise exception 'this claim has no agreed Return to Supplier outcome'
      using errcode = '23514', detail = 'outcome_not_return_to_supplier';
  end if;

  -- RETURN TO — owner ruling 2026-09-29: the recorded return address, else
  -- the recorded address. Never typed by the caller; refused only when both
  -- are blank.
  select * into v_supplier from public.suppliers where id = v_claim.supplier_id;
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
    raise exception 'a purchase return needs at least one Unit'
      using errcode = '23514', detail = 'no_units';
  end if;

  -- 0706: ONE claim is wholly Carres goods or wholly the supplier's. All the
  -- supplier's own goods go back as a Consignment Return, numbered CRTN.
  select count(*) filter (where i.ownership = 'supplier_consignment'), count(*)
    into v_consign, v_total
    from public.ops_stock_items i
   where i.id in (select nullif(e ->> 'stock_item_id', '')::uuid from jsonb_array_elements(p_units) e);
  if v_consign > 0 and v_consign < v_total then
    raise exception 'a return cannot mix supplier-owned and Carres-owned Units'
      using errcode = '23514', detail = 'mixed_ownership';
  end if;
  v_return_id := gen_random_uuid();
  if v_consign > 0 then
    v_pr_no := public.allocate_formal_document_code('CRTN', v_return_id::text);
  end if;

  insert into public.purchase_returns (
    id, supplier_claim_id, supplier_id, warehouse_receipt_id,
    confirmed_pickup_date, created_by, is_consignment, pr_no
  )
  values (
    v_return_id, v_claim.id, v_claim.supplier_id, v_claim.warehouse_receipt_id,
    p_confirmed_pickup_date, auth.uid(), v_consign > 0,
    -- coalesce stops short, so a Purchase Return still draws its 0548 sequence
    -- value and a Consignment Return burns none.
    coalesce(v_pr_no, 'PR-' || to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYYMMDD')
                      || '-' || nextval('public.purchase_returns_no_seq'))
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

    -- REFUSED BY NAME, in the words the form listed it with.
    v_refusal := public.purchase_return_unit_refusal(v_item, v_claim.id);
    if v_refusal is not null then
      raise exception '%: %', coalesce(v_item.unit_code, 'Unit'), v_refusal
        using errcode = '23514', detail = 'unit_not_eligible', hint = v_refusal;
    end if;
    -- 0706: supplier-owned goods go back to THEIR supplier, not the claim's other.
    -- Whose they are is the PO's supplier_id (receiving sets ops_stock_items.po_no
    -- to purchase_orders.id and copies the supplier NAME as text; the name can be
    -- renamed or shared, the id cannot). A Unit with no PO is not provably theirs.
    if v_item.ownership = 'supplier_consignment'
       and (select po.supplier_id from public.purchase_orders po where po.id = v_item.po_no)
           is distinct from v_claim.supplier_id then
      raise exception '%: Not %''s goods', coalesce(v_item.unit_code, 'Unit'), v_supplier.name
        using errcode = '23514', detail = 'not_suppliers_goods';
    end if;
    -- A UNIT CHANGED UNDER THE FORM is refused by name; nothing is issued.
    if coalesce(v_unit ->> 'seen', '') = ''
       or v_item.updated_at is distinct from (v_unit ->> 'seen')::timestamptz then
      raise exception '%: Changed since the form opened', v_item.unit_code
        using errcode = '23514', detail = 'unit_changed';
    end if;

    -- READ ONLY. The Unit is SNAPSHOT; its status, holder and location are
    -- not changed. Issuing paper is not moving furniture (§7.4).
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
    v_count := v_count + 1;
  end loop;

  insert into public.audit_log (role, actor_text, action, ref)
  values (
    v_role, auth.uid()::text, 'purchasing_issue_purchase_return',
    v_return_id::text || ' claim=' || v_claim.claim_no || ' units=' || v_count
  );

  return v_return_id;
end;
$function$;

-- MONEY: a Consignment Return owes no credit. Its Units may once have sat on a
-- confirmed bill (set_ownership, 0366, can flip billed Carres stock to the
-- supplier's), so the follow-up must never be raised for one. Body is 0676's
-- (no later migration redefines it) plus `and not pr.is_consignment`; CREATE OR
-- REPLACE keeps the revoke from 0676.
create or replace function public._supplier_note_followups_from_returns()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_n integer;
begin
  insert into public.supplier_note_followups (supplier_id, kind, reason, purchase_return_id, amount, noted_on)
  select pr.supplier_id, 'CREDIT', 'RETURN', pr.id, v.amount, (pr.pr_doc_date at time zone 'Asia/Kuala_Lumpur')::date
    from public.purchase_returns pr
    cross join lateral (
      select round(sum(g.units * g.price), 2) as amount
        from (
          select least(count(*)::numeric, max(b.billed_qty)) as units, max(b.price) as price
            from public.purchase_return_units pru
            join public.ops_stock_items si on si.id = pru.stock_item_id
            join lateral (
              select r.receipt_id
                from public.receiving_unit_results r
               where r.stock_item_id = pru.stock_item_id
                 and r.issue_kind is distinct from 'wrong_item'
               order by r.created_at desc
               limit 1) rr on true
            join lateral (
              select sum(bl.qty) as billed_qty,
                     (select bl2.unit_price
                        from public.supplier_bill_lines bl2
                        join public.supplier_bills b2 on b2.id = bl2.bill_id
                       where b2.status = 'confirmed'
                         and bl2.warehouse_receipt_id = rr.receipt_id
                         and bl2.po_line_id = si.po_line_id
                       order by b2.confirmed_at desc, bl2.line_no desc
                       limit 1) as price
                from public.supplier_bill_lines bl
                join public.supplier_bills b on b.id = bl.bill_id
               where b.status = 'confirmed'
                 and bl.warehouse_receipt_id = rr.receipt_id
                 and bl.po_line_id = si.po_line_id) b on b.billed_qty > 0 and b.price is not null
           where pru.purchase_return_id = pr.id
           group by rr.receipt_id, si.po_line_id) g) v
   where v.amount > 0
     and not pr.is_consignment
     and not exists (select 1 from public.supplier_note_followups f where f.purchase_return_id = pr.id)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

-- ── 0706 §2 · a Consignment Return started straight from consigned stock ──
--
-- Follows Houzs frontend/src/pages/scm-v2/PurchaseConsignmentReturnNew.tsx:12-15
-- and backend/src/scm/routes/purchase-consignment-returns.ts:442 (a return
-- needs only a supplier; it starts from a receive, an order or free entry,
-- never from a claim) per Weisiang's ruling (2026-10-22): clear Carres rules,
-- implement Houzs. This overturns 0548's "Created only from an approved
-- Supplier Claim ... no blank + New" FOR CONSIGNMENT RETURNS ONLY: a Purchase
-- Return of Carres-owned goods still needs its claim.
--
-- Carres has no separate PC Receive document: a supplier's consigned goods are
-- its supplier-owned Units (ops_stock_items.ownership = 'supplier_consignment',
-- whose PO names the supplier). So "from receive" here is "pick that
-- supplier's consigned Units". Like the claim door, issuing is paper only: no
-- Unit is moved (section 7.4 kept; Stock proves the pickup).

alter table public.purchase_returns alter column supplier_claim_id drop not null;
alter table public.purchase_returns drop constraint if exists purchase_returns_claim_or_consignment;
alter table public.purchase_returns add constraint purchase_returns_claim_or_consignment
  check (supplier_claim_id is not null or is_consignment);

create or replace function public.consignment_return_unit_refusal(p_item ops_stock_items, p_supplier uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_doc text;
begin
  if p_item.unit_code is null or coalesce(p_item.qty, 1) <> 1 then
    return 'Counted stock';
  end if;
  if p_item.ownership is distinct from 'supplier_consignment' then
    return 'Carres-owned stock';
  end if;
  if (select po.supplier_id from purchase_orders po where po.id = p_item.po_no) is distinct from p_supplier then
    return 'Not this supplier''s goods';
  end if;
  select r.pr_no into v_doc
    from purchase_return_units u join purchase_returns r on r.id = u.purchase_return_id
   where u.stock_item_id = p_item.id
   limit 1;
  if v_doc is not null then
    return format('Already on %s', v_doc);
  end if;
  select r.ro_no into v_doc
    from repair_order_units ru join repair_orders r on r.id = ru.repair_order_id
   where ru.stock_item_id = p_item.id and ru.released_at is null and ru.removed_at is null
     and r.cancelled_at is null
   limit 1;
  if v_doc is not null then
    return format('Already on %s', v_doc);
  end if;
  -- A held Unit goes back through its own claim, never around it.
  if p_item.status = 'on_hold' then return 'On a Supplier Claim'; end if;
  if p_item.status = 'incoming' then return 'Not received'; end if;
  if p_item.status = 'transferred' then return 'This Unit is on the road'; end if;
  if p_item.status = 'reserved' then return 'Reserved'; end if;
  if p_item.status <> 'free' then return 'Not in stock'; end if;
  return null;
end;
$fn$;
revoke all on function public.consignment_return_unit_refusal(ops_stock_items, uuid) from public, anon;
grant execute on function public.consignment_return_unit_refusal(ops_stock_items, uuid) to authenticated;

-- The picker: every tracked supplier-owned Unit from this supplier's POs still
-- in Carres, with the door's own refusal words.
create or replace function public.consignment_return_eligible_units(p_supplier uuid)
returns table (
  stock_item_id uuid, unit_code text, sku text, po_no text, warehouse_id uuid,
  pickup_location text, seen text, refusal text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public.supplier_claim_gate();
  return query
    select i.id, i.unit_code, i.sku, i.po_no, i.warehouse_id, w.name, i.updated_at::text,
           public.consignment_return_unit_refusal(i, p_supplier)
      from ops_stock_items i
      join purchase_orders po on po.id = i.po_no and po.supplier_id = p_supplier
      left join warehouses w on w.id = i.warehouse_id
     where i.ownership = 'supplier_consignment'
       and i.unit_code is not null and coalesce(i.qty, 1) = 1
       and i.status in ('free', 'reserved', 'on_hold', 'transferred')
     order by (public.consignment_return_unit_refusal(i, p_supplier) is not null), i.unit_code;
end;
$fn$;
revoke all on function public.consignment_return_eligible_units(uuid) from public, anon;
grant execute on function public.consignment_return_eligible_units(uuid) to authenticated;

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

-- sanity: the catalog, never a row count
do $$
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'purchasing_issue_purchase_return') <> 1 then
    raise exception 'sanity: more than one purchasing_issue_purchase_return';
  end if;
  if has_function_privilege('anon', 'public.purchasing_issue_purchase_return(uuid, jsonb, date)', 'execute')
     or not has_function_privilege('authenticated', 'public.purchasing_issue_purchase_return(uuid, jsonb, date)', 'execute') then
    raise exception 'sanity: purchasing_issue_purchase_return grants changed';
  end if;
  if has_function_privilege('authenticated', 'public._supplier_note_followups_from_returns()', 'execute')
     or has_function_privilege('anon', 'public._supplier_note_followups_from_returns()', 'execute') then
    raise exception 'sanity: _supplier_note_followups_from_returns grants changed';
  end if;
end $$;
