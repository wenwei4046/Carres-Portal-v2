-- 0614_a_claim_photo_names_its_unit_and_supplier_receipt_is_recorded.sql
--
-- Purchasing MASTER §9.5 "Row expansion — the per-Unit evidence inspector" and
-- §9.6 Purchase Returns `Supplier Received Date`.
--
-- 1 · A CLAIM PHOTO MAY NAME ITS UNIT.
--     `supplier_claims.photos` (0288) holds `{path, at, by}` per claim: no file
--     says which Unit it shows, so the per-Unit inspector may not attribute any
--     stored file to a Unit (§9.5: evidence is never distributed across Units).
--     The ONE writer every receiving door already calls,
--     `supplier_claim_photo_entries`, now also accepts `{path, unit_code}` and
--     keeps `unit_code` on the stored entry. A plain string still files a
--     claim-level photo exactly as before, so every current caller is
--     unchanged. The reader attributes a file to a Unit only when its
--     `unit_code` is one of THIS claim's Units; everything else, including
--     every file stored before this migration, stays claim-level.
--
-- 2 · `Record supplier receipt` — the supplier's own receipt of returned Units.
--     §9.6: "`Supplier Received Date` is recorded from supplier evidence; fully
--     picked up never implies it." Append-only
--     `purchase_return_supplier_receipts` (date, supplier evidence, recorder)
--     plus the exact Units it covers. Partial receipt is allowed; a Unit is
--     received once. The door refuses a Unit that Stock has not recorded as
--     picked up (`purchase_return_units.actual_pickup_date`, Stock's fact, read
--     here and never written) and a date before that pickup or in the future.
--     It writes NO pickup fact, NO custody, and not the 0548 column
--     `purchase_return_units.supplier_received_date`: the date is read from this
--     ledger (ERP-ARCHITECTURE law D, one arithmetic).
--
-- 3 · RETURN TO FALLS BACK TO THE SUPPLIER'S ADDRESS — OWNER RULING (Jess,
--     2026-09-29, relayed through the Settings lane). Return To =
--     `suppliers.return_address` when filled, otherwise `suppliers.address`;
--     Issue refuses only when BOTH are blank: `Add the address of {Supplier}`
--     (detail `address_missing`). `purchasing_issue_purchase_return` is
--     re-issued from the definition APPLIED in production (0609, read with
--     pg_get_functiondef 2026-09-29) with only that change; the resolved value
--     is still snapshotted onto `purchase_return_units.return_to`.
--
-- Schema only. No row is read for a count, none is written.

-- ── 1 · the claim photo writer keeps an optional Unit ───────────────────────

create or replace function public.supplier_claim_photo_entries(p_paths jsonb, p_by uuid)
returns jsonb
language sql
stable
as $$
  select coalesce(
    jsonb_agg(
      case when t.unit_code is null
           then jsonb_build_object('path', t.p, 'at', now(), 'by', p_by)
           else jsonb_build_object('path', t.p, 'at', now(), 'by', p_by, 'unit_code', t.unit_code)
      end
      order by t.o),
    '[]'::jsonb)
  from (
    select distinct on (x.p) x.p, x.unit_code, x.o
      from (
        select btrim(case when jsonb_typeof(e.value) = 'string' then e.value #>> '{}'
                          else e.value ->> 'path' end) as p,
               case when jsonb_typeof(e.value) = 'object'
                    then nullif(btrim(coalesce(e.value ->> 'unit_code', '')), '') end as unit_code,
               e.o
          from jsonb_array_elements(
                 case when jsonb_typeof(coalesce(p_paths, '[]'::jsonb)) = 'array'
                      then p_paths else '[]'::jsonb end) with ordinality as e(value, o)
         where jsonb_typeof(e.value) in ('string', 'object')
      ) x
     where x.p is not null and length(x.p) > 0
     order by x.p, x.o
  ) t;
$$;

comment on function public.supplier_claim_photo_entries(jsonb, uuid) is
  '0614 (§9.5): a string files a claim-level photo {path, at, by}; an object {path, unit_code} also keeps the Unit it shows. The inspector attributes a file to a Unit only when unit_code is one of that claim''s Units.';

-- ── 2 · the supplier's receipt of returned Units ────────────────────────────

create table if not exists public.purchase_return_supplier_receipts (
  id                 uuid primary key default gen_random_uuid(),
  purchase_return_id uuid not null references public.purchase_returns(id) on delete restrict,
  received_on        date not null,
  -- [{path, kind: photo|video|pdf, purpose: supplier_receipt}] in the private
  -- `issue-evidence` bucket under purchase_return_receipt/.
  evidence           jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  -- Or who at the supplier confirmed it, and when.
  confirmed_by       text,
  confirmed_at       timestamptz,
  note               text,
  recorded_by        uuid not null references auth.users(id),
  recorded_at        timestamptz not null default now(),
  constraint purchase_return_supplier_receipts_evidence_required
    check (jsonb_array_length(evidence) > 0 or confirmed_by is not null),
  constraint purchase_return_supplier_receipts_confirmation_pairs
    check ((confirmed_by is null) = (confirmed_at is null))
);

create index if not exists purchase_return_supplier_receipts_return_idx
  on public.purchase_return_supplier_receipts (purchase_return_id, recorded_at);

comment on table public.purchase_return_supplier_receipts is
  '0614 (Purchasing §9.6): append-only supplier receipts of returned Units — the date the supplier received them, the supplier evidence (file, or who confirmed and when) and the recorder. `Supplier Received Date` is read from here; fully picked up never implies it.';

create table if not exists public.purchase_return_supplier_receipt_units (
  receipt_id              uuid not null references public.purchase_return_supplier_receipts(id) on delete restrict,
  purchase_return_unit_id uuid not null references public.purchase_return_units(id) on delete restrict,
  primary key (receipt_id, purchase_return_unit_id),
  -- A Unit is received by the supplier once.
  constraint purchase_return_supplier_receipt_units_once unique (purchase_return_unit_id)
);

comment on table public.purchase_return_supplier_receipt_units is
  '0614 (§9.6): the exact returned Units one supplier receipt covers. Partial receipt is allowed; each Unit is received once.';

alter table public.purchase_return_supplier_receipts enable row level security;
alter table public.purchase_return_supplier_receipt_units enable row level security;
drop policy if exists purchase_return_supplier_receipts_read_internal on public.purchase_return_supplier_receipts;
create policy purchase_return_supplier_receipts_read_internal on public.purchase_return_supplier_receipts
  for select to authenticated using ((select public.is_internal()));
drop policy if exists purchase_return_supplier_receipt_units_read_internal on public.purchase_return_supplier_receipt_units;
create policy purchase_return_supplier_receipt_units_read_internal on public.purchase_return_supplier_receipt_units
  for select to authenticated using ((select public.is_internal()));
grant select on public.purchase_return_supplier_receipts, public.purchase_return_supplier_receipt_units to authenticated;
revoke insert, update, delete on public.purchase_return_supplier_receipts, public.purchase_return_supplier_receipt_units from authenticated, anon;

create or replace function public.purchase_return_record_supplier_receipt(
  p_return_id      uuid,
  p_received_on    date,
  p_stock_item_ids uuid[],
  p_evidence       jsonb default '[]'::jsonb,
  p_confirmed_by   text default null,
  p_confirmed_at   timestamptz default null,
  p_note           text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     app_role := public.supplier_claim_gate();
  v_pr       purchase_returns;
  v_items    uuid[] := (select coalesce(array_agg(distinct x), '{}') from unnest(coalesce(p_stock_item_ids, '{}')) x);
  v_evidence jsonb := coalesce(p_evidence, '[]'::jsonb);
  v_by       text := nullif(btrim(coalesce(p_confirmed_by, '')), '');
  v_file     jsonb;
  v_files    jsonb := '[]'::jsonb;
  v_item     uuid;
  v_unit     purchase_return_units;
  v_code     text;
  v_prior    date;
  v_id       uuid;
begin
  select * into v_pr from purchase_returns where id = p_return_id for update;
  if not found then
    raise exception 'Purchase Return not found' using errcode = 'P0002', detail = 'return_not_found';
  end if;
  if p_received_on is null then
    raise exception 'Choose the Supplier Received Date' using errcode = '22023', detail = 'date_required';
  end if;
  if p_received_on > (timezone('Asia/Kuala_Lumpur', now()))::date then
    raise exception 'The Supplier Received Date is in the future' using errcode = '22023', detail = 'date_in_future';
  end if;
  if cardinality(v_items) = 0 then
    raise exception 'Tick the Units the supplier received' using errcode = '22023', detail = 'units_required';
  end if;

  -- Supplier evidence: a supplier-receipt upload, or who confirmed and when.
  if jsonb_typeof(v_evidence) <> 'array' then
    raise exception 'An evidence file is not a supplier-receipt upload' using errcode = '22023', detail = 'evidence_invalid';
  end if;
  for v_file in select value from jsonb_array_elements(v_evidence) loop
    if coalesce(v_file ->> 'path', '') !~ '^purchase_return_receipt/'
       or coalesce(v_file ->> 'kind', '') not in ('photo', 'video', 'pdf') then
      raise exception 'An evidence file is not a supplier-receipt upload' using errcode = '22023', detail = 'evidence_invalid';
    end if;
    v_files := v_files || jsonb_build_array(jsonb_build_object(
      'path', v_file ->> 'path', 'kind', v_file ->> 'kind', 'purpose', 'supplier_receipt'));
  end loop;
  if (v_by is null) <> (p_confirmed_at is null) then
    raise exception 'A confirmation needs who confirmed and when' using errcode = '22023', detail = 'confirmation_incomplete';
  end if;
  if jsonb_array_length(v_files) = 0 and v_by is null then
    raise exception 'Add the evidence: a file, or who confirmed and when' using errcode = '22023', detail = 'evidence_required';
  end if;

  -- Every named Unit, by name: on this return, picked up by Stock, not before
  -- that pickup, and not already received.
  foreach v_item in array v_items loop
    select * into v_unit from purchase_return_units
     where purchase_return_id = v_pr.id and stock_item_id = v_item;
    if not found then
      select unit_code into v_code from ops_stock_items where id = v_item;
      raise exception '%: Not on this return', coalesce(v_code, v_item::text)
        using errcode = '23514', detail = 'unit_not_on_return';
    end if;
    if v_unit.actual_pickup_date is null then
      raise exception '%: Not picked up', v_unit.unit_code using errcode = '23514', detail = 'not_picked_up';
    end if;
    if p_received_on < (timezone('Asia/Kuala_Lumpur', v_unit.actual_pickup_date))::date then
      raise exception '%: Picked up on %', v_unit.unit_code,
        to_char(timezone('Asia/Kuala_Lumpur', v_unit.actual_pickup_date), 'FMDD Mon YYYY')
        using errcode = '23514', detail = 'before_pickup';
    end if;
    select r.received_on into v_prior
      from purchase_return_supplier_receipt_units ru
      join purchase_return_supplier_receipts r on r.id = ru.receipt_id
     where ru.purchase_return_unit_id = v_unit.id;
    if found then
      raise exception '%: Already received %', v_unit.unit_code, to_char(v_prior, 'FMDD Mon YYYY')
        using errcode = '23514', detail = 'already_received';
    end if;
  end loop;

  insert into purchase_return_supplier_receipts
    (purchase_return_id, received_on, evidence, confirmed_by, confirmed_at, note, recorded_by)
  values
    (v_pr.id, p_received_on, v_files, v_by, case when v_by is not null then p_confirmed_at end,
     nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;

  insert into purchase_return_supplier_receipt_units (receipt_id, purchase_return_unit_id)
  select v_id, u.id from purchase_return_units u
   where u.purchase_return_id = v_pr.id and u.stock_item_id = any (v_items);

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, auth.uid()::text, 'purchase_return_supplier_receipt',
          format('%s supplier received %s Units on %s', v_pr.pr_no, cardinality(v_items), p_received_on));
  return v_id;
end;
$fn$;

revoke all on function public.purchase_return_record_supplier_receipt(uuid, date, uuid[], jsonb, text, timestamptz, text) from public, anon;
grant execute on function public.purchase_return_record_supplier_receipt(uuid, date, uuid[], jsonb, text, timestamptz, text) to authenticated;


-- ── 3 · Return To = return address, else address (owner ruling 2026-09-29) ──

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

  insert into public.purchase_returns (
    supplier_claim_id, supplier_id, warehouse_receipt_id,
    confirmed_pickup_date, created_by
  )
  values (
    v_claim.id, v_claim.supplier_id, v_claim.warehouse_receipt_id,
    p_confirmed_pickup_date, auth.uid()
  )
  returning id into v_return_id;

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

-- ── sanity — the catalog, never a row count ─────────────────────────────────
do $$
begin
  if exists (select 1 from pg_policies
              where schemaname = 'public'
                and tablename in ('purchase_return_supplier_receipts', 'purchase_return_supplier_receipt_units')
                and cmd <> 'SELECT') then
    raise exception 'sanity: a supplier receipt table has a write policy';
  end if;
  if has_function_privilege('anon', 'public.purchase_return_record_supplier_receipt(uuid, date, uuid[], jsonb, text, timestamptz, text)', 'execute') then
    raise exception 'sanity: anon can reach the supplier receipt door';
  end if;
  if not has_function_privilege('authenticated', 'public.purchase_return_record_supplier_receipt(uuid, date, uuid[], jsonb, text, timestamptz, text)', 'execute') then
    raise exception 'sanity: authenticated cannot reach the supplier receipt door';
  end if;
  if public.supplier_claim_photo_entries('["a.jpg"]'::jsonb, null) -> 0 ->> 'path' <> 'a.jpg'
     or public.supplier_claim_photo_entries('[{"path":"b.jpg","unit_code":"U1"}]'::jsonb, null) -> 0 ->> 'unit_code' <> 'U1' then
    raise exception 'sanity: supplier_claim_photo_entries lost a path or its Unit';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'purchasing_issue_purchase_return') <> 1 then
    raise exception 'sanity: more than one purchasing_issue_purchase_return';
  end if;
  if has_function_privilege('anon', 'public.purchasing_issue_purchase_return(uuid, jsonb, date)', 'execute')
     or not has_function_privilege('authenticated', 'public.purchasing_issue_purchase_return(uuid, jsonb, date)', 'execute') then
    raise exception 'sanity: purchasing_issue_purchase_return grants changed';
  end if;
end $$;
