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
end $$;
