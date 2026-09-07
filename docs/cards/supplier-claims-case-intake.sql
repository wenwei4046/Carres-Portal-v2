-- Local schema proposal for approved Purchasing MASTER §9.5.
-- Not applied. Keep outside migrations until tracker/all-branch numbering and
-- exact-file review are complete. No existing policies or rows are changed.
--
-- §A  stock-only Case intake (report identity, retry, no fake customer)
-- §B  Claim ↔ Case link (verified source, duty/cover, no reparenting)
-- §C  permanent incident ↔ exact-Unit occurrences (service_case_units)
-- §D  Receiving orchestration — the posting transaction opens/links the Case
-- §E  duplicate matching — a repeated report of the same verified occurrence
--     appends to the same Case instead of minting a second incident
begin;
alter table public.service_cases
  add column customer_impact text check (customer_impact in ('customer', 'stock_only')),
  add column intake_fingerprint text,
  -- The reporter's REAL label fact when the Unit cannot be resolved. Never a
  -- guessed source: the governed continuation is Purchasing source search.
  add column source_unit_label text;

alter table public.service_cases add constraint stock_case_has_no_customer
  check (customer_impact is distinct from 'stock_only' or (
    customer_name = '' and order_id is null and order_line_id is null
    and customer_phone is null and customer_address is null
    and usable is null and cardinality(customer_wants) = 0
    and reported_by <> 'customer'
  ));

-- ---------------------------------------------------------------------------
-- §C · one permanent occurrence per (Case, Unit). `hold_claim_id` is a current
-- control that is cleared when the hold releases; THIS is the incident history
-- that survives it. `receiving_unit_result_id` is unique so one physical
-- source occurrence can never feed two Cases.
-- ---------------------------------------------------------------------------
create table public.service_case_units (
  case_id uuid not null references public.service_cases(id),
  stock_item_id uuid not null references public.ops_stock_items(id),
  unit_code text not null,
  claim_id uuid references public.supplier_claims(id),
  receiving_unit_result_id uuid unique references public.receiving_unit_results(id),
  issue_type text not null,
  added_at timestamptz not null default now(),
  added_by uuid,
  primary key (case_id, stock_item_id)
);
comment on table public.service_case_units is
  'MASTER §9.5: the incident''s exact Units — permanent, written only inside the governed intake/orchestration writers. Duplicate matching reads it; hold release does not touch it.';
create index service_case_units_item_idx on public.service_case_units (stock_item_id);
alter table public.service_case_units enable row level security;
create policy service_case_units_read on public.service_case_units
  for select using (exists (select 1 from public.service_cases sc where sc.id = case_id));
grant select on public.service_case_units to authenticated;
revoke insert, update, delete on public.service_case_units from authenticated, anon;

-- One report identity, one outcome — whether the report CREATED a Case or was
-- MATCHED into an existing one. A retry returns the same answer; a retry with
-- different facts is refused.
create table public.service_case_reports (
  report_id uuid primary key,
  case_id uuid not null references public.service_cases(id),
  matched_existing boolean not null default false,
  fingerprint text not null,
  created_at timestamptz not null default now(),
  created_by uuid
);
alter table public.service_case_reports enable row level security;
create policy service_case_reports_read on public.service_case_reports
  for select using (exists (select 1 from public.service_cases sc where sc.id = case_id));
grant select on public.service_case_reports to authenticated;
revoke insert, update, delete on public.service_case_reports from authenticated, anon;

-- ---------------------------------------------------------------------------
-- §E: match a verified Receiving occurrence, exact Unit and problem. A Unit
-- label alone proves identity, never that two observations are the same fault.
-- New reports without a source occurrence remain distinct even if another Case
-- for this Unit/problem is still open. Report UUIDs handle uncertain-save retries.
create function public.service_case_match_unit_problem(
  p_stock_item_id uuid, p_issue_type text, p_receiving_unit_result_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_case_id uuid;
begin
  if p_receiving_unit_result_id is null then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_stock_item_id::text, 0));
  if not exists (
    select 1 from public.receiving_unit_results r
    where r.id = p_receiving_unit_result_id and r.stock_item_id = p_stock_item_id
      and r.issue_kind = case when p_issue_type = 'wrong_sku' then 'wrong_item' else p_issue_type end
  ) then
    raise exception 'The source occurrence does not match this Unit and problem' using errcode = '22023';
  end if;
  select u.case_id into v_case_id from public.service_case_units u
    where u.receiving_unit_result_id = p_receiving_unit_result_id
      and u.stock_item_id = p_stock_item_id and u.issue_type = p_issue_type;
  if v_case_id is not null then
    perform 1 from public.service_cases where id = v_case_id for update;
  end if;
  return v_case_id;
end $$;
revoke all on function public.service_case_match_unit_problem(uuid, text, uuid) from public, anon, authenticated;

-- Append evidence entries to a Case the caller has already locked, skipping
-- paths the Case already holds — a retry appends nothing twice.
create function public.service_case_append_evidence(p_case_id uuid, p_entries jsonb)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_new jsonb;
  v_count int;
begin
  select coalesce(jsonb_agg(e), '[]'::jsonb), count(*) into v_new, v_count
    from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) e
   where not exists (
     select 1 from public.service_cases sc,
                   jsonb_array_elements(coalesce(sc.evidence, '[]'::jsonb)) old
      where sc.id = p_case_id and old->>'path' = e->>'path'
        and coalesce(old->>'bucket', 'service-case-evidence') = coalesce(e->>'bucket', 'service-case-evidence'));
  if v_count > 0 then
    update public.service_cases
       set evidence = coalesce(evidence, '[]'::jsonb) || v_new
     where id = p_case_id;
  end if;
  return v_count;
end $$;
revoke all on function public.service_case_append_evidence(uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- §A + §E · the narrow stock report writer. Definer is required for its
-- RPC-only report and Unit tables; authenticated internal role is checked here. Serialise only this report, so two
-- retries cannot consume two Case identities. An optional real Unit label is
-- resolved against the Unit register: a resolved Unit joins duplicate
-- matching; an unresolved label is preserved as the reporter's fact and the
-- Case stays source-free for the governed Purchasing source search.
-- ---------------------------------------------------------------------------
create function public.service_case_create_stock_report(p_report_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_report public.service_case_reports%rowtype;
  v_number text;
  v_evidence jsonb;
  v_role text := auth.jwt()->'app_metadata'->>'role';
  v_fingerprint text := md5(p_payload::text);
  v_unit_label text := nullif(btrim(coalesce(p_payload->>'unit_code', '')), '');
  v_occurrence uuid := nullif(p_payload->>'receiving_unit_result_id', '')::uuid;
  v_unit_id uuid;
  v_unit_sku text;
  v_unit_code text;
  v_case_id uuid;
  v_case_no text;
begin
  if auth.uid() is null or v_role is null or v_role not in ('operation','principal') or not public.is_internal() then
    raise exception 'Operation or principal only' using errcode = '42501';
  end if;
  if p_report_id is null or p_payload is null then
    raise exception 'Report identity and facts are required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_report_id::text, 0));
  select * into v_report from public.service_case_reports where report_id = p_report_id;
  if found then
    if v_report.fingerprint is distinct from v_fingerprint then
      raise exception 'This report was already saved with different facts' using errcode = '23505';
    end if;
    select case_no into v_case_no from public.service_cases where id = v_report.case_id;
    return jsonb_build_object('id', v_report.case_id, 'caseNo', v_case_no,
                              'matchedExisting', v_report.matched_existing);
  end if;
  if p_payload->>'reported_by' is null or p_payload->>'reported_by' = 'customer'
    or p_payload->>'product_category' is null or p_payload->>'issue_type' is null
    or jsonb_typeof(p_payload->'evidence') is distinct from 'array' then
    raise exception 'Record the product, problem, reporter and evidence' using errcode = '22023';
  end if;
  if jsonb_array_length(p_payload->'evidence') = 0 then
    raise exception 'Report evidence is required' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_payload->'evidence') e
    where e->>'path' is null or e->>'path' not like 'draft/' || p_report_id::text || '/%') then
    raise exception 'Evidence does not belong to this report' using errcode = '22023';
  end if;
  select jsonb_agg(jsonb_build_object(
    'slot', e->>'slot', 'path', e->>'path',
    'kind', case when lower(e->>'path') ~ '\.(mp4|mov)$' then 'video' else 'photo' end,
    'at', now(), 'by', auth.uid(), 'by_role', v_role
  )) into v_evidence from jsonb_array_elements(p_payload->'evidence') e;

  if v_unit_label is not null then
    select id, sku, unit_code into v_unit_id, v_unit_sku, v_unit_code
      from public.ops_stock_items where unit_code = v_unit_label;
    if v_unit_id is not null then
      if p_payload->>'product_sku' is not null
         and p_payload->>'product_sku' <> v_unit_sku then
        raise exception 'The Unit label and the reported product do not match. Check the Unit label.'
          using errcode = '22023';
      end if;
      v_case_id := public.service_case_match_unit_problem(v_unit_id, p_payload->>'issue_type', v_occurrence);
    end if;
  end if;

  if v_occurrence is not null and v_case_id is null then
    raise exception 'Open the verified source Case before adding this report' using errcode = '22023';
  end if;

  if v_case_id is not null then
    -- Same source occurrence, same Unit, same problem: the second reporter
    -- APPENDS evidence to the one incident. No second Case identity is minted.
    perform public.service_case_append_evidence(v_case_id, v_evidence);
    insert into public.service_case_units
      (case_id, stock_item_id, unit_code, issue_type, added_by)
    values (v_case_id, v_unit_id, v_unit_code, p_payload->>'issue_type', auth.uid())
    on conflict (case_id, stock_item_id) do nothing;
    insert into public.service_case_reports
      (report_id, case_id, matched_existing, fingerprint, created_by)
    values (p_report_id, v_case_id, true, v_fingerprint, auth.uid());
    select case_no into v_case_no from public.service_cases where id = v_case_id;
    return jsonb_build_object('id', v_case_id, 'caseNo', v_case_no, 'matchedExisting', true);
  end if;

  v_number := public.next_case_no();
  insert into public.service_cases (
    id, case_no, customer_impact, customer_name, reported_by,
    product_sku, product_category, issue_type, what_happened,
    evidence, created_by, intake_fingerprint, customer_wants, source_unit_label
  ) values (
    p_report_id, v_number, 'stock_only', '', p_payload->>'reported_by',
    p_payload->>'product_sku', p_payload->>'product_category',
    p_payload->>'issue_type', p_payload->>'what_happened',
    v_evidence, auth.uid(), v_fingerprint, '{}'::text[],
    case when v_unit_id is null then v_unit_label else null end
  );
  if v_unit_id is not null then
    insert into public.service_case_units
      (case_id, stock_item_id, unit_code, issue_type, added_by)
    values (p_report_id, v_unit_id, v_unit_code, p_payload->>'issue_type', auth.uid());
  end if;
  insert into public.service_case_reports
    (report_id, case_id, matched_existing, fingerprint, created_by)
  values (p_report_id, p_report_id, false, v_fingerprint, auth.uid());
  return jsonb_build_object('id', p_report_id, 'caseNo', v_number, 'matchedExisting', false);
end $$;
revoke all on function public.service_case_create_stock_report(uuid, jsonb) from public, anon;
grant execute on function public.service_case_create_stock_report(uuid, jsonb) to authenticated;

alter table public.supplier_claims
  add column case_id uuid references public.service_cases(id),
  add column case_link_evidence jsonb;
create index supplier_claims_case_idx on public.supplier_claims(case_id);

-- ---------------------------------------------------------------------------
-- §B · the narrow definer writer is needed because Claim direct UPDATE is
-- revoked. It grants no new table access or policy. Shared duty/cover remains
-- mandatory.
-- ---------------------------------------------------------------------------
create function public.service_case_link_supplier_claim(p_case_id uuid, p_claim_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_case public.service_cases%rowtype;
  v_claim public.supplier_claims%rowtype;
  v_duty jsonb := public.workspace_resolve_duty('po_duty', null);
  v_actor uuid := auth.uid();
begin
  if v_actor is null or (auth.jwt()->'app_metadata'->>'role') is null
    or (auth.jwt()->'app_metadata'->>'role') not in ('operation','principal') or not public.is_internal() then
    raise exception 'Operation or principal only' using errcode = '42501';
  end if;
  if (v_duty->>'actor_user_id') is distinct from v_actor::text then
    raise exception 'The current Purchasing Duty holder or cover must link the source. Open Staff & Duties.' using errcode = '42501';
  end if;
  select * into v_case from public.service_cases where id = p_case_id for update;
  if not found then raise exception 'Case not found' using errcode = 'P0002'; end if;
  select * into v_claim from public.supplier_claims where id = p_claim_id for update;
  if not found then raise exception 'Claim not found' using errcode = 'P0002'; end if;
  if v_claim.case_id = p_case_id then
    return jsonb_build_object('caseId', p_case_id, 'claimId', p_claim_id);
  end if;
  if v_claim.case_id is not null then
    raise exception 'This Claim already belongs to another Case. Open that Case.' using errcode = '23505';
  end if;
  if v_claim.status <> 'open' or v_claim.claim_type = 'late_delivery'
    or exists (select 1 from public.service_case_statuses where id = v_case.status_id and is_closed) then
    raise exception 'Only an open product problem can be linked' using errcode = '22023';
  end if;
  if v_case.issue_type is distinct from v_claim.claim_type
    or v_case.product_category is distinct from v_claim.product_category
    or (v_case.product_sku is not null and v_case.product_sku <> v_claim.sku) then
    raise exception 'The Case and Claim describe different product problems' using errcode = '22023';
  end if;
  if not exists (select 1 from public.purchase_order_lines l
    join public.purchase_orders p on p.id = l.po_id
    where l.id = v_claim.po_line_id and p.id = v_claim.po_id
      and p.supplier_id = v_claim.supplier_id and l.sku = v_claim.sku) then
    raise exception 'Verify the original purchase source before linking this Claim' using errcode = '22023';
  end if;
  -- The selected Case is a human same-incident assertion. Verify its exact
  -- Units where already known; never let a same-SKU claim repoint them.
  if exists (select 1 from public.service_case_units where case_id = p_case_id)
    and not exists (
      select 1 from public.service_case_units u
      join public.ops_stock_items i on i.id = u.stock_item_id
      where u.case_id = p_case_id and i.hold_claim_id = p_claim_id
    ) then
    raise exception 'The Case and Claim refer to different Units' using errcode = '22023';
  end if;
  update public.supplier_claims set case_id = p_case_id,
    case_link_evidence = jsonb_build_object('at', now(), 'actor', v_actor, 'duty', v_duty)
    where id = p_claim_id;
  return jsonb_build_object('caseId', p_case_id, 'claimId', p_claim_id);
end $$;
revoke all on function public.service_case_link_supplier_claim(uuid, uuid) from public, anon;
grant execute on function public.service_case_link_supplier_claim(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- §D · Receiving orchestration. Both posting doors (office direct posting and
-- warehouse_receipt_check_in) already associate the session's new Claims to
-- the receipt and then call receiving_record_unit_results inside the posting
-- transaction (0426). Extending THAT function is the smallest atomic hook:
-- no trigger, no second engine, no new caller. It records the per-Unit
-- results exactly as 0426 did, then opens/links the shared Case for every new
-- Claim, carrying the exact source occurrences and REFERENCING the claim's
-- photos (bucket + original attribution) — never copying or re-uploading.
-- ---------------------------------------------------------------------------
create function public.service_case_attach_receiving_claims(p_receipt_id uuid)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_claim public.supplier_claims%rowtype;
  v_kind text;
  v_case_id uuid;
  v_number text;
  v_evidence jsonb;
  v_units jsonb;
  v_attached int := 0;
begin
  for v_claim in
    select * from public.supplier_claims
     where warehouse_receipt_id = p_receipt_id and case_id is null and status = 'open'
       and claim_type in ('damaged', 'wrong_sku')
     order by reported_at, id for update
  loop
    v_kind := case when v_claim.claim_type = 'damaged' then 'damaged' else 'wrong_item' end;
    -- The claim's exact source occurrences: this receipt's per-Unit results of
    -- the same problem on the same goods, each occurrence attached at most
    -- once (receiving_unit_result_id is unique in service_case_units).
    select coalesce(jsonb_agg(jsonb_build_object(
             'result_id', r.id, 'stock_item_id', r.stock_item_id,
             'unit_code', r.unit_code) order by r.created_at, r.id), '[]'::jsonb)
      into v_units
      from (
        select r.* from public.receiving_unit_results r
          join public.ops_stock_items i on i.id = r.stock_item_id
         where r.receipt_id = p_receipt_id and r.issue_kind = v_kind
           and i.hold_claim_id = v_claim.id
           and not exists (select 1 from public.service_case_units u
                            where u.receiving_unit_result_id = r.id)
         order by r.created_at, r.id
      ) r;
    if jsonb_array_length(v_units) <> v_claim.qty then
      raise exception 'Verify the exact receiving Units before linking the Claim' using errcode = '22023';
    end if;
    -- The claim's photos, REFERENCED with their source bucket and original
    -- attribution. The files are not copied and not re-uploaded.
    select coalesce(jsonb_agg(jsonb_build_object(
             'slot', 'receiving_photo', 'path', p->>'path',
             'kind', case when lower(p->>'path') ~ '\.(mp4|mov)$' then 'video' else 'photo' end,
             'at', p->>'at', 'by', p->>'by', 'bucket', 'delivery-orders')), '[]'::jsonb)
      into v_evidence
      from jsonb_array_elements(coalesce(v_claim.photos, '[]'::jsonb)) p;

    v_case_id := null;
    for i in 0 .. jsonb_array_length(v_units) - 1 loop
      v_case_id := coalesce(v_case_id, public.service_case_match_unit_problem(
        (v_units->i->>'stock_item_id')::uuid, v_claim.claim_type,
        (v_units->i->>'result_id')::uuid));
    end loop;

    if v_case_id is not null then
      perform public.service_case_append_evidence(v_case_id, v_evidence);
    else
      v_case_id := gen_random_uuid();
      v_number := public.next_case_no();
      insert into public.service_cases (
        id, case_no, customer_impact, customer_name, reported_by,
        product_sku, product_category, issue_type, what_happened,
        evidence, created_by, customer_wants
      ) values (
        v_case_id, v_number, 'stock_only', '', 'warehouse',
        v_claim.sku, v_claim.product_category, v_claim.claim_type, v_claim.note,
        v_evidence, v_claim.reported_by, '{}'::text[]
      );
    end if;

    update public.supplier_claims
       set case_id = v_case_id,
           case_link_evidence = jsonb_build_object(
             'at', now(), 'actor', v_claim.reported_by,
             'source', 'receiving', 'receipt_id', p_receipt_id)
     where id = v_claim.id;

    insert into public.service_case_units
      (case_id, stock_item_id, unit_code, claim_id, receiving_unit_result_id,
       issue_type, added_by)
    select v_case_id, (u->>'stock_item_id')::uuid, u->>'unit_code', v_claim.id,
           (u->>'result_id')::uuid, v_claim.claim_type, v_claim.reported_by
      from jsonb_array_elements(v_units) u
    on conflict (case_id, stock_item_id) do nothing;

    v_attached := v_attached + 1;
  end loop;
  return v_attached;
end $$;
revoke all on function public.service_case_attach_receiving_claims(uuid) from public, anon, authenticated;

-- The 0426 body, unchanged, plus the one orchestration call at the end of the
-- same posting transaction. Same signature; execute stays revoked — only the
-- two posting doors reach it.
create or replace function public.receiving_record_unit_results(
  p_receipt_id uuid,
  p_lines jsonb
) returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_line jsonb; v_unit jsonb; v_count int := 0;
begin
  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    for v_unit in select * from jsonb_array_elements(coalesce(v_line->'units', '[]'::jsonb)) loop
      insert into receiving_unit_results
        (receipt_id, stock_item_id, unit_code, outcome, issue_kind, note)
      values
        (p_receipt_id,
         (v_unit->>'stock_item_id')::uuid,
         v_unit->>'unit_code',
         v_unit->>'outcome',
         nullif(v_unit->>'issue_kind',''),
         nullif(v_unit->>'note',''));
      v_count := v_count + 1;
    end loop;
  end loop;
  perform public.service_case_attach_receiving_claims(p_receipt_id);
  return v_count;
end;
$fn$;
revoke execute on function public.receiving_record_unit_results(uuid, jsonb)
  from public, anon, authenticated;
commit;
