-- 0516_delivery_proof_review_refuses_stale_evidence_and_retries_once.sql
-- Work may host Delivery's proof-review door only when the door itself refuses
-- stale evidence and a retry cannot append a second review.

alter table public.delivery_proof_reviews
  add column if not exists source_version timestamptz,
  add column if not exists idempotency_key uuid;

create unique index if not exists delivery_proof_reviews_idempotency_uidx
  on public.delivery_proof_reviews (idempotency_key)
  where idempotency_key is not null;

drop function if exists public.delivery_proof_review(text, uuid, text, text);

create or replace function public.delivery_proof_review(
  p_do_number text,
  p_attempt_id uuid,
  p_decision text,
  p_reason text,
  p_expected_evidence_at timestamptz,
  p_idempotency_key uuid
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_doc ops_delivery_orders;
  v_existing delivery_proof_reviews;
  v_row delivery_proof_reviews;
  v_latest_evidence timestamptz;
  v_word text;
begin
  if not (select public.is_operation()) then
    raise exception 'Only operation or principal may review delivery proof' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'A proof review retry key is required'
      using errcode = '22023', detail = 'idempotency_required';
  end if;

  select * into v_existing
    from delivery_proof_reviews
   where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.do_number = upper(p_do_number)
       and v_existing.attempt_id is not distinct from p_attempt_id
       and v_existing.decision = p_decision
       and v_existing.reason is not distinct from nullif(btrim(coalesce(p_reason, '')), '')
       and v_existing.source_version is not distinct from p_expected_evidence_at then
      return to_jsonb(v_existing);
    end if;
    raise exception 'That proof review retry key was already used for another result'
      using errcode = '22023', detail = 'idempotency_conflict';
  end if;

  select * into v_doc from ops_delivery_orders where do_number = upper(p_do_number);
  if not found then
    raise exception 'Delivery order not found' using errcode = 'P0002';
  end if;
  perform 1 from orders where id = v_doc.order_id for update;

  if p_decision not in ('accepted', 'more_required', 'rejected') then
    raise exception 'a review is Proof Accepted, More Proof Required or Proof Rejected'
      using errcode = '22023', detail = 'bad_decision';
  end if;
  if p_decision <> 'accepted' and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'say why more proof is needed, or why it is rejected'
      using errcode = '22023', detail = 'reason_required';
  end if;
  if p_attempt_id is not null and not exists (
    select 1 from delivery_attempts where id = p_attempt_id and do_number = v_doc.do_number
  ) then
    raise exception 'that delivery attempt does not belong to this document'
      using errcode = '22023', detail = 'attempt_mismatch';
  end if;

  select max(candidate.at) into v_latest_evidence
  from (
    select max(e.recorded_at) as at
      from delivery_attempt_evidence e
     where e.do_number = v_doc.do_number
    union all
    select max(o.do_uploaded_at) as at
      from orders o
     where o.id = v_doc.order_id
       and o.do_number = v_doc.do_number
       and o.do_file_path is not null
    union all
    select max(nullif(photo->>'at', '')::timestamptz) as at
     from ops_order_control c
      cross join lateral jsonb_array_elements(coalesce(c.delivery_photos, '[]'::jsonb)) photo
     where c.order_id = v_doc.order_id
       and btrim(coalesce(photo->>'doNumber', '')) = v_doc.do_number
  ) candidate;

  if v_latest_evidence is null then
    raise exception 'There is no delivery proof to review'
      using errcode = '22023', detail = 'proof_missing';
  end if;
  if p_expected_evidence_at is null or p_expected_evidence_at is distinct from v_latest_evidence then
    raise exception 'The delivery proof changed. Review the latest proof.'
      using errcode = '40001', detail = 'stale_proof_evidence';
  end if;

  insert into delivery_proof_reviews
    (order_id, do_number, attempt_id, decision, reason, reviewed_by, source_version, idempotency_key)
  values
    (v_doc.order_id, v_doc.do_number, p_attempt_id, p_decision,
     nullif(btrim(coalesce(p_reason, '')), ''), auth.uid(), v_latest_evidence, p_idempotency_key)
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning * into v_row;

  -- Two identical retries can both pass the first read before either commit.
  -- The partial unique index chooses one writer; the other reads that result
  -- instead of appending a second review or surfacing a database error.
  if not found then
    select * into v_existing
      from delivery_proof_reviews
     where idempotency_key = p_idempotency_key;
    if v_existing.do_number = v_doc.do_number
       and v_existing.attempt_id is not distinct from p_attempt_id
       and v_existing.decision = p_decision
       and v_existing.reason is not distinct from nullif(btrim(coalesce(p_reason, '')), '')
       and v_existing.source_version is not distinct from p_expected_evidence_at then
      return to_jsonb(v_existing);
    end if;
    raise exception 'That proof review retry key was already used for another result'
      using errcode = '22023', detail = 'idempotency_conflict';
  end if;

  v_word := case p_decision
    when 'accepted' then 'Proof Accepted'
    when 'more_required' then 'More Proof Required'
    else 'Proof Rejected'
  end;
  insert into order_history (order_id, text, by_role)
  values (v_doc.order_id,
          format('%s · %s%s', v_doc.do_number, v_word,
                 case when v_row.reason is not null then ' — ' || v_row.reason else '' end),
          (select public.app_role()));
  return to_jsonb(v_row);
end;
$fn$;

revoke all on function public.delivery_proof_review(text, uuid, text, text, timestamptz, uuid) from public, anon;
grant execute on function public.delivery_proof_review(text, uuid, text, text, timestamptz, uuid) to authenticated;

comment on function public.delivery_proof_review(text, uuid, text, text, timestamptz, uuid) is
  '0489, 0516: append one personally attributed proof review only when the evidence version is current; an identical retry key returns the first result.';
