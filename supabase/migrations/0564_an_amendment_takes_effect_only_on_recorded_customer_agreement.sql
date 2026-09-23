-- 0564_an_amendment_takes_effect_only_on_recorded_customer_agreement
--
-- ⚠️ RENUMBERED 0562 → 0564 (2026-09-23). `0562_a_manual_purchase_says_what_it_needs`
-- is APPLIED in production (`supabase_migrations.schema_migrations`
-- `20260922211119`) and Purchasing CARD 13 also holds an unapplied
-- `0563_one_create_door_per_name_again.sql`, so 0562 and 0563 are both taken.
-- Verified against the live tracker and every worktree on this machine, not
-- from `ls` of one checkout — Constitution red line 7.
--
-- CUSTOMER AGREEMENT EVIDENCE — APPROVED / LOCKED, owner ruling 2026-09-22
-- (`docs/orders/MASTER.md` § "Customer agreement evidence").
--
--   "A change to the customer's actual agreement must have a recorded,
--    traceable basis for that customer's acceptance before it takes effect.
--    A signed document or a reference to the relevant customer confirmation
--    (for example, WhatsApp) is acceptable; a new handwritten signature is not
--    required for every amendment. A manager's statement or checkbox saying
--    the customer agreed is not sufficient by itself and cannot substitute for
--    the evidence."
--
-- MEASURED BEFORE THIS MIGRATION (2026-09-23, production schema):
-- `sales_order_amendments` carried id · order_id · base_revision ·
-- base_contractual_hash · proposed_snapshot · reason · status · submitted_by ·
-- submitted_at · applied_at · created_at · decided_by · decided_at ·
-- decision_note · decision_impact · customer_asked_on. There was NO column
-- naming the customer's acceptance, and `sales_order_decide_amendment` asked
-- for none. A principal could approve and apply a new price, a new quantity
-- or a new promised date with nothing on the record saying the customer had
-- ever agreed to it. That is the gap this closes.
--
-- ---- WHAT IS ENFORCED, AND WHERE ------------------------------------------
--
--   SUBMIT   unchanged. "The request may remain recorded while evidence is
--            incomplete; it cannot take effect." A proposal is still born the
--            moment Sales writes it, evidence or no evidence.
--   RECORD   a new door. Sales records the confirmation basis, and may replace
--            it while the amendment is still open.
--   REJECT   unchanged. Refusing a change needs no customer agreement.
--   APPROVE  REFUSED unless evidence exists AND still covers the exact terms
--            being approved.
--
-- ---- WHY THE HASH ---------------------------------------------------------
--
-- "Evidence must remain traceable to the proposal it supports. Following
--  conflict review or a changed proposal, verify that the evidence still
--  covers the resulting terms; do not silently reuse approval for different
--  terms."
--
-- So the basis is stored WITH a fingerprint of the terms it was recorded
-- against, and approve compares that fingerprint against the proposal it is
-- about to apply. Today no door edits `proposed_snapshot` after submit, so the
-- comparison always passes for honest use — it is written now so the rule is
-- STRUCTURAL rather than incidental, and a future proposal-edit door cannot
-- quietly inherit an approval the customer gave to different terms. `jsonb`
-- normalises object key order, so equal proposals fingerprint equal.
--
-- ---- WHAT THIS DELIBERATELY DOES NOT DO -----------------------------------
--
-- It does not rewrite a historical signature, and it does not turn a WhatsApp
-- confirmation into a signature: the KIND is recorded and stays distinguishable
-- forever. It does not contact anybody — "Recording a communication reference
-- does not authorise contacting customers or external parties." It adds no
-- checkbox that a manager can tick to mean the customer agreed: the three
-- accepted kinds all demand a reference that points at something outside this
-- table, and a manager's own assertion is not one of them.
--
-- No row count is asserted. No existing row is modified. Every column added is
-- nullable, so every amendment already open stays readable and rejectable; it
-- simply cannot be APPROVED until its basis is recorded, which is the ruling.

set search_path = public;

-- ---------------------------------------------------------------------
-- 1. The record of the customer's acceptance
-- ---------------------------------------------------------------------

alter table public.sales_order_amendments
  add column if not exists customer_agreement_kind      text,
  add column if not exists customer_agreement_reference text,
  add column if not exists customer_agreement_detail    text,
  add column if not exists customer_agreement_covers    text,
  add column if not exists customer_agreement_by        uuid,
  add column if not exists customer_agreement_at        timestamptz;

comment on column public.sales_order_amendments.customer_agreement_kind is
  '0564 - HOW the customer''s acceptance is evidenced: signed_document (a document the customer signed), customer_confirmation (a traceable reference to the customer''s own confirmation, e.g. a WhatsApp message) or original_agreement (a Staff correction where the agreement did not change, pointing back at the order''s existing signed agreement). A manager''s assertion is not a kind.';
comment on column public.sales_order_amendments.customer_agreement_reference is
  '0564 - the traceable pointer the kind demands. It must identify something outside this table that can be found again.';
comment on column public.sales_order_amendments.customer_agreement_covers is
  '0564 - fingerprint of the proposed terms this basis was recorded against. Approve refuses when it no longer matches the proposal being applied, so approval is never silently reused for different terms.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'amendments_agreement_kind_is_governed'
  ) then
    alter table public.sales_order_amendments
      add constraint amendments_agreement_kind_is_governed
      check (customer_agreement_kind is null
             or customer_agreement_kind in
                ('signed_document','customer_confirmation','original_agreement'));
  end if;
  -- A kind without its pointer is the checkbox the ruling refuses.
  if not exists (
    select 1 from pg_constraint
     where conname = 'amendments_agreement_names_its_evidence'
  ) then
    alter table public.sales_order_amendments
      add constraint amendments_agreement_names_its_evidence
      check (customer_agreement_kind is null
             or nullif(btrim(coalesce(customer_agreement_reference,'')),'') is not null);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. The fingerprint of a set of proposed terms
-- ---------------------------------------------------------------------

create or replace function public.sales_order_amendment_terms_hash(p_proposed jsonb)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select md5(coalesce(p_proposed, '{}'::jsonb)::text)
$$;

comment on function public.sales_order_amendment_terms_hash(jsonb) is
  '0564 - the fingerprint customer-agreement evidence is bound to. jsonb normalises object key order, so equal terms hash equal.';

-- ---------------------------------------------------------------------
-- 3. Sales records the confirmation basis
-- ---------------------------------------------------------------------

create or replace function public.sales_order_record_amendment_agreement(
  p_amendment_id uuid,
  p_kind         text,
  p_reference    text,
  p_detail       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.app_role();
  v_a    sales_order_amendments%rowtype;
  v_ref  text := nullif(btrim(coalesce(p_reference,'')), '');
  v_det  text := nullif(btrim(coalesce(p_detail,'')), '');
  v_hash text;
begin
  -- The same door Sales already submits through. The APPROVER does not record
  -- the customer's agreement: "Sales records the confirmation basis; the
  -- authorised approver checks that it covers the proposed change." The
  -- principal keeps access because the principal is every internal role's
  -- superset everywhere else in this schema, not because approving grants it.
  if (v_role is null or v_role not in ('operation','principal')) then
    raise exception 'Operation/Principal only' using errcode = '42501';
  end if;

  if p_kind not in ('signed_document','customer_confirmation','original_agreement') then
    raise exception 'Record how the customer agreed'
      using errcode = '22023', detail = 'agreement_kind_invalid';
  end if;
  if v_ref is null then
    raise exception 'Name the document or message that shows the customer agreed'
      using errcode = '22023', detail = 'agreement_reference_required';
  end if;

  select * into v_a from public.sales_order_amendments
   where id = p_amendment_id for update;
  if not found then
    raise exception 'Amendment not found' using errcode = 'P0002';
  end if;
  -- A decided amendment's basis is history. It is not re-written afterwards.
  if v_a.status not in ('draft','submitted','issued','accepted') then
    raise exception 'Amendment is already %', v_a.status
      using errcode = '22023', detail = 'already_decided';
  end if;

  /* A Staff correction leans on the agreement the customer ALREADY gave, so
     its pointer must name a revision of THIS order — not a free sentence.
     "For Staff correction, where the actual customer agreement has not
     changed, reference the original agreement evidence instead of asking the
     customer to agree again." */
  if p_kind = 'original_agreement'
     and not exists (
       select 1 from public.sales_order_revisions
        where order_id = v_a.order_id
          and revision = nullif(regexp_replace(v_ref, '\D', '', 'g'), '')::int
     ) then
    raise exception 'Name the revision whose signed agreement still covers this change'
      using errcode = '22023', detail = 'agreement_revision_not_found';
  end if;

  v_hash := public.sales_order_amendment_terms_hash(v_a.proposed_snapshot);

  update public.sales_order_amendments
     set customer_agreement_kind      = p_kind,
         customer_agreement_reference = v_ref,
         customer_agreement_detail    = v_det,
         customer_agreement_covers    = v_hash,
         customer_agreement_by        = auth.uid(),
         customer_agreement_at        = now()
   where id = v_a.id;

  /* The record is a business fact, so it is written where the business reads
     facts. It names the KIND and the POINTER and nothing about the customer
     beyond what Sales typed — this door reaches nobody. */
  insert into public.order_history(order_id, text, by_role, by_user_id, metadata)
  values (v_a.order_id,
          'Customer agreement recorded - ' || p_kind || ' - ' || v_ref,
          v_role::app_role, auth.uid(),
          jsonb_build_object('kind','amendment_agreement_recorded',
                             'amendment_id', v_a.id,
                             'agreement_kind', p_kind,
                             'agreement_reference', v_ref,
                             'covers', v_hash));

  return jsonb_build_object('id', v_a.id, 'customer_agreement_kind', p_kind,
                            'customer_agreement_reference', v_ref,
                            'customer_agreement_covers', v_hash);
end $$;

revoke all on function public.sales_order_record_amendment_agreement(uuid,text,text,text)
  from public, anon;
grant execute on function public.sales_order_record_amendment_agreement(uuid,text,text,text)
  to authenticated;

-- ---------------------------------------------------------------------
-- 4. The approver reads the basis it is being asked to check
-- ---------------------------------------------------------------------
-- 0334's body with the evidence added. Nothing else is retyped or reordered.

create or replace function public.sales_order_amendment_live(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := public.app_role();
  v_a    sales_order_amendments%rowtype;
  v_now  text;
begin
  if (v_role is null or v_role not in ('operation','principal','finance','hr','bd')) then
    raise exception 'Internal roles only' using errcode = '42501';
  end if;
  select * into v_a from sales_order_amendments
   where order_id = p_order_id
     and status in ('draft','submitted','issued','accepted')
   order by submitted_at desc limit 1;
  if not found then
    return jsonb_build_object('amendment', null);
  end if;
  v_now := public.sales_order_contractual_hash(p_order_id);
  return jsonb_build_object('amendment', jsonb_build_object(
    'id', v_a.id,
    'status', v_a.status,
    'reason', v_a.reason,
    'customer_asked_on', v_a.customer_asked_on,
    'base_revision', v_a.base_revision,
    'base_contractual_hash', v_a.base_contractual_hash,
    'current_contractual_hash', v_now,
    'stale', v_now is distinct from v_a.base_contractual_hash,
    'proposed_snapshot', v_a.proposed_snapshot,
    'submitted_at', v_a.submitted_at,
    -- 0564 · what the approver must check before approving.
    'customer_agreement_kind', v_a.customer_agreement_kind,
    'customer_agreement_reference', v_a.customer_agreement_reference,
    'customer_agreement_detail', v_a.customer_agreement_detail,
    'customer_agreement_at', v_a.customer_agreement_at,
    /* Derived, never stored twice: the basis covers these terms only while its
       fingerprint still matches them. The screen reads this; the decide door
       re-computes it rather than trusting it. */
    'customer_agreement_covers_proposal',
      v_a.customer_agreement_kind is not null
      and v_a.customer_agreement_covers
          is not distinct from public.sales_order_amendment_terms_hash(v_a.proposed_snapshot)));
end $$;

comment on function public.sales_order_amendment_live(uuid) is
  '0334 live-amendment read; 0564 adds the recorded customer-agreement basis and whether it still covers the proposed terms.';

-- ---------------------------------------------------------------------
-- 5. THE GATE — an amendment takes effect only on recorded agreement
-- ---------------------------------------------------------------------
-- 0420's body (itself 0348's, with 0420's two `set_config` lines) reproduced
-- with ONE block added, marked below. Every other line is unchanged and every
-- existing guard still runs in the same order. The new check sits AFTER the
-- reject branch — refusing a change needs no customer agreement — and BEFORE
-- the stale check, so the operator is told the most fundamental thing wrong
-- with the approval first.

create or replace function public.sales_order_decide_amendment(
  p_amendment_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.app_role();
  v_a sales_order_amendments%rowtype;
  v_o orders%rowtype;
  v_note text := nullif(btrim(coalesce(p_note,'')), '');
  v_impact jsonb;
  v_header jsonb := '{}'::jsonb;
  v_lines jsonb := null;
  v_line jsonb;
  v_result jsonb;
  v_before jsonb;
  v_next int;
begin
  if v_role <> 'principal' then
    raise exception 'Principal only' using errcode = '42501';
  end if;
  if p_decision not in ('approve','reject') then
    raise exception 'Decision must be approve or reject' using errcode = '22023', detail = 'invalid_decision';
  end if;
  if v_note is null then
    raise exception 'A management decision says why' using errcode = '22023', detail = 'note_required';
  end if;

  select * into v_a from sales_order_amendments where id = p_amendment_id for update;
  if not found then raise exception 'Amendment not found' using errcode = 'P0002'; end if;
  if v_a.status not in ('submitted','issued','accepted') then
    raise exception 'Amendment is already %', v_a.status using errcode = '22023', detail = 'already_decided';
  end if;
  select * into v_o from orders where id = v_a.order_id for update;
  v_impact := public.sales_order_amendment_impact(v_a.id);

  if p_decision = 'reject' then
    update sales_order_amendments
       set status='rejected', decided_by=auth.uid(), decided_at=now(),
           decision_note=v_note, decision_impact=v_impact
     where id=v_a.id;
    insert into order_history(order_id,text,by_role,by_user_id,metadata)
    values(v_a.order_id,'Amendment rejected - ' || v_note,v_role::app_role,auth.uid(),
      jsonb_build_object('kind','amendment_rejected','amendment_id',v_a.id,
                         'reason',v_note,'before',public.sales_order_snapshot(v_a.order_id),
                         'after',public.sales_order_snapshot(v_a.order_id)));
    return jsonb_build_object('id',v_a.id,'status','rejected');
  end if;

  -- ── 0564 · THE CUSTOMER AGREEMENT GATE ──────────────────────────────────
  -- APPROVED / LOCKED 2026-09-22. Everything below this point CHANGES the
  -- customer's order, so the customer's acceptance has to be on the record
  -- first, and it has to be the acceptance of THESE terms.
  --
  -- Re-computed here rather than read from `customer_agreement_covers` alone:
  -- the stored fingerprint says what the basis was recorded against, and this
  -- comparison is what proves it is still true of the proposal being applied.
  if v_a.customer_agreement_kind is null then
    raise exception 'Record how the customer agreed before this change takes effect'
      using errcode = '22023', detail = 'customer_agreement_required';
  end if;
  if v_a.customer_agreement_covers
     is distinct from public.sales_order_amendment_terms_hash(v_a.proposed_snapshot) then
    raise exception 'The recorded customer agreement does not cover these terms - record it again'
      using errcode = '22023', detail = 'customer_agreement_stale';
  end if;

  if (v_impact->>'stale')::boolean then
    raise exception 'The order changed after this amendment was proposed'
      using errcode = '22023', detail = 'amendment_stale';
  end if;

  if v_a.proposed_snapshot ? 'delivery_date' then
    v_header := v_header || jsonb_build_object('delivery_date',v_a.proposed_snapshot->'delivery_date');
  end if;
  if v_a.proposed_snapshot ? 'delivery_date_tbd' then
    v_header := v_header || jsonb_build_object('delivery_date_tbd',v_a.proposed_snapshot->'delivery_date_tbd');
  end if;
  v_before := public.sales_order_snapshot(v_a.order_id);
  if v_a.proposed_snapshot ? 'installment_months' then
    update orders set installment_months = nullif(v_a.proposed_snapshot->>'installment_months','')::int
      where id = v_a.order_id;
  end if;
  if v_a.proposed_snapshot ? 'lines' then
    for v_line in select * from jsonb_array_elements(v_a.proposed_snapshot->'lines') loop
      if v_line ? 'id' and not exists (
        select 1 from order_lines where id=(v_line->>'id')::uuid and order_id=v_a.order_id
      ) then
        raise exception 'A proposed line no longer belongs to this order'
          using errcode = '22023', detail = 'proposal_line_stale';
      end if;
      if not (v_line ? 'id') and exists (
        select 1 from order_lines where order_id=v_a.order_id and sku=v_line->>'sku'
      ) then
        raise exception 'Re-propose this amendment with stable line identity'
          using errcode = '22023', detail = 'proposal_line_identity_required';
      end if;
    end loop;
    v_lines := v_a.proposed_snapshot->'lines';
  end if;

  if v_lines is null and v_header = '{}'::jsonb and v_a.proposed_snapshot ? 'installment_months' then
    if public.sales_order_snapshot(v_a.order_id) = v_before then
      raise exception 'Nothing changed' using errcode = '22023', detail = 'nothing_changed';
    end if;
    select coalesce(max(revision),1)+1 into v_next from sales_order_revisions where order_id=v_a.order_id;
    insert into sales_order_revisions(order_id,revision,snapshot,created_by,change_type,note)
    values(v_a.order_id,v_next,public.sales_order_snapshot(v_a.order_id),auth.uid(),'customer_change',coalesce(v_a.reason,v_note));
    insert into order_history(order_id,text,by_role,by_user_id,metadata)
    values(v_a.order_id,'Customer change - Rev '||v_next||' - installment_months',v_role::app_role,auth.uid(),
      jsonb_build_object('kind','edit','changed',jsonb_build_array('installment_months'),'revision',v_next));
    v_result := jsonb_build_object('revision',v_next,'changed',jsonb_build_array('installment_months'));
  else
    -- 0420 · EVERY GUARD ABOVE HAS ALREADY PASSED — principal, decision note,
    -- not already decided, the customer's recorded agreement covers these very
    -- terms (0564), not stale, every proposed line still owned by this order.
    -- Only now does the lane name itself to the writer, so 0415's F-11 and
    -- F-12 know this is the door they point at. `true` is is_local: the setting
    -- dies with this transaction and no other caller can see it.
    perform set_config('carres.applying_amendment','on',true);
    v_result := public.sales_order_save_revision(
      v_a.order_id,v_header,v_lines,
      jsonb_build_object('change_type','customer_change','note',coalesce(v_a.reason,v_note)));
    -- 0420 · Cleared the moment the writer returns, so nothing later in this
    -- transaction inherits the exemption.
    perform set_config('carres.applying_amendment','',true);
    if v_a.proposed_snapshot ? 'installment_months' then
      v_result := jsonb_set(v_result,'{changed}',coalesce(v_result->'changed','[]'::jsonb) || '"installment_months"'::jsonb);
    end if;
  end if;

  update sales_order_amendments
     set status='applied', decided_by=auth.uid(), decided_at=now(), applied_at=now(),
         decision_note=v_note, decision_impact=v_impact
   where id=v_a.id;
  /* 0564 · the applied record names the basis it was approved on, so the
     history answers "what made this change legitimate" without a second read. */
  insert into order_history(order_id,text,by_role,by_user_id,metadata)
  values(v_a.order_id,'Amendment approved and applied - Rev ' || (v_result->>'revision'),
    v_role::app_role,auth.uid(),
    jsonb_build_object('kind','amendment_applied','amendment_id',v_a.id,
                       'reason',coalesce(v_a.reason,v_note),'decision_note',v_note,
                       'revision',(v_result->'revision'),'impact',v_impact,
                       'agreement_kind',v_a.customer_agreement_kind,
                       'agreement_reference',v_a.customer_agreement_reference));
  return jsonb_build_object('id',v_a.id,'status','applied','revision',v_result->'revision',
                            'changed',v_result->'changed');
end $$;

revoke all on function public.sales_order_decide_amendment(uuid,text,text) from public, anon;
grant execute on function public.sales_order_decide_amendment(uuid,text,text) to authenticated;

comment on function public.sales_order_decide_amendment(uuid,text,text) is
  '0348 governed amendment decision; 0420 exempts F-11/F-12 for the one door they name; 0564 refuses APPROVE unless the customer''s recorded agreement exists and still covers the exact proposed terms. Reject is unchanged - refusing a change needs no customer agreement.';
