-- 0489 · Proof is reviewed, and every attempt keeps its evidence
-- 【DELIVERY】 CARD 13 · Proof review and per-attempt evidence (Delivery MASTER §6, §6.1)
--
-- Proof is bound to the exact event it proves. An uploaded file records what
-- the driver sent; it is not proof accepted and not a successful delivery.
-- Operation reviews delivery proof as `Proof Accepted`, `More Proof Required`
-- or `Proof Rejected`, each with a reason. `Proof Accepted` is the fact that
-- turns `Delivered` green everywhere and closes `Upload delivery proof`;
-- `Proof Rejected` reopens it with the reason.
--
-- Both records are append-only. Reads: any internal user. Writes: the doors
-- below only — the client never inserts, updates or deletes a row.

set search_path = public;

-- ── Per-attempt evidence ─────────────────────────────────────────────────────
create table if not exists public.delivery_attempt_evidence (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.delivery_attempts(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  do_number text,
  path text not null check (length(btrim(path)) > 0),
  kind text not null check (kind in ('photo', 'video', 'document')),
  recorded_by uuid references public.app_users(id),
  recorded_at timestamptz not null default now(),
  unique (attempt_id, path)
);
create index if not exists delivery_attempt_evidence_do_idx
  on public.delivery_attempt_evidence (do_number, recorded_at desc);
comment on table public.delivery_attempt_evidence is
  '0489: every file bound to the Delivery Visit it proves (Delivery MASTER §6.1). Append-only; the Worker door is the only writer.';

alter table public.delivery_attempt_evidence enable row level security;
revoke all on public.delivery_attempt_evidence from public, anon, authenticated;
grant select on public.delivery_attempt_evidence to authenticated;
drop policy if exists delivery_attempt_evidence_read on public.delivery_attempt_evidence;
create policy delivery_attempt_evidence_read on public.delivery_attempt_evidence
  for select using ((select public.is_internal()));

create or replace function public.delivery_attempt_evidence_no_rewrite()
returns trigger language plpgsql as $$
begin
  raise exception 'attempt evidence is append-only — corrections append, never rewrite'
    using errcode = 'P0001', detail = 'evidence_append_only';
end $$;
drop trigger if exists delivery_attempt_evidence_no_rewrite on public.delivery_attempt_evidence;
create trigger delivery_attempt_evidence_no_rewrite
  before update or delete on public.delivery_attempt_evidence
  for each row execute function public.delivery_attempt_evidence_no_rewrite();

-- ── The proof-review record ──────────────────────────────────────────────────
create table if not exists public.delivery_proof_reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  do_number text not null,
  attempt_id uuid references public.delivery_attempts(id) on delete restrict,
  decision text not null check (decision in ('accepted', 'more_required', 'rejected')),
  reason text,
  reviewed_by uuid references public.app_users(id),
  reviewed_at timestamptz not null default now(),
  -- A decision that asks for more, or refuses, says why.
  constraint delivery_proof_reviews_reason_stated check (
    decision = 'accepted' or (reason is not null and btrim(reason) <> '')
  )
);
create index if not exists delivery_proof_reviews_do_idx
  on public.delivery_proof_reviews (do_number, reviewed_at desc);
comment on table public.delivery_proof_reviews is
  '0489: Operation''s review of delivery proof — Proof Accepted · More Proof Required · Proof Rejected, each with its reason (Delivery MASTER §6.1). Append-only; the latest review decides, and a newer upload reopens the question.';

alter table public.delivery_proof_reviews enable row level security;
revoke all on public.delivery_proof_reviews from public, anon, authenticated;
grant select on public.delivery_proof_reviews to authenticated;
drop policy if exists delivery_proof_reviews_read on public.delivery_proof_reviews;
create policy delivery_proof_reviews_read on public.delivery_proof_reviews
  for select using ((select public.is_internal()));

create or replace function public.delivery_proof_reviews_no_rewrite()
returns trigger language plpgsql as $$
begin
  raise exception 'a proof review is history — it is never edited or deleted'
    using errcode = 'P0001', detail = 'review_append_only';
end $$;
drop trigger if exists delivery_proof_reviews_no_rewrite on public.delivery_proof_reviews;
create trigger delivery_proof_reviews_no_rewrite
  before update or delete on public.delivery_proof_reviews
  for each row execute function public.delivery_proof_reviews_no_rewrite();

-- ── The doors ────────────────────────────────────────────────────────────────
create or replace function public.delivery_attempt_evidence_record(
  p_attempt_id uuid, p_path text, p_kind text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_attempt delivery_attempts;
  v_row delivery_attempt_evidence;
begin
  if not (select public.is_operation()) then
    raise exception 'Only operation or principal may bind delivery evidence' using errcode = '42501';
  end if;
  select * into v_attempt from delivery_attempts where id = p_attempt_id;
  if not found then
    raise exception 'delivery attempt not found' using errcode = 'P0002';
  end if;
  if p_kind not in ('photo', 'video', 'document') then
    raise exception 'evidence is a photo, a video or a document' using errcode = '22023', detail = 'bad_kind';
  end if;
  insert into delivery_attempt_evidence (attempt_id, order_id, do_number, path, kind, recorded_by)
  values (p_attempt_id, v_attempt.order_id, v_attempt.do_number, btrim(p_path), p_kind, auth.uid())
  on conflict (attempt_id, path) do nothing
  returning * into v_row;
  if v_row.id is null then
    select * into v_row from delivery_attempt_evidence where attempt_id = p_attempt_id and path = btrim(p_path);
  end if;
  return to_jsonb(v_row);
end;
$fn$;
revoke all on function public.delivery_attempt_evidence_record(uuid, text, text) from public, anon;
grant execute on function public.delivery_attempt_evidence_record(uuid, text, text) to authenticated;

create or replace function public.delivery_proof_review(
  p_do_number text, p_attempt_id uuid, p_decision text, p_reason text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_doc ops_delivery_orders;
  v_row delivery_proof_reviews;
  v_word text;
begin
  if not (select public.is_operation()) then
    raise exception 'Only operation or principal may review delivery proof' using errcode = '42501';
  end if;
  select * into v_doc from ops_delivery_orders where do_number = upper(p_do_number);
  if not found then
    raise exception 'Delivery order not found' using errcode = 'P0002';
  end if;
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
    raise exception 'that delivery attempt does not belong to this document' using errcode = '22023', detail = 'attempt_mismatch';
  end if;
  insert into delivery_proof_reviews (order_id, do_number, attempt_id, decision, reason, reviewed_by)
  values (v_doc.order_id, v_doc.do_number, p_attempt_id, p_decision, nullif(btrim(coalesce(p_reason, '')), ''), auth.uid())
  returning * into v_row;
  v_word := case p_decision when 'accepted' then 'Proof Accepted' when 'more_required' then 'More Proof Required' else 'Proof Rejected' end;
  insert into order_history (order_id, text, by_role)
  values (v_doc.order_id,
          format('%s · %s%s', v_doc.do_number, v_word, case when v_row.reason is not null then ' — ' || v_row.reason else '' end),
          (select public.app_role()));
  return to_jsonb(v_row);
end;
$fn$;
revoke all on function public.delivery_proof_review(text, uuid, text, text) from public, anon;
grant execute on function public.delivery_proof_review(text, uuid, text, text) to authenticated;

-- ── The signed Delivery Order, attached to a delivered or partially delivered
--    order WITHOUT re-recording the delivery ────────────────────────────────
-- The one existing writer (`operation_attach_do_and_deliver`, 0087/0151) also
-- marks the whole order delivered and deducts stock, so it could never be
-- offered against a partial trip. This door files the paper the customer
-- signed as evidence of the LATEST recorded attempt and touches no status, no
-- stock and no result (§6: completing proof never renames the result).
create or replace function public.delivery_signed_do_attach(
  p_do_number text, p_do_file_path text, p_signed_by text, p_signature_path text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_doc ops_delivery_orders;
  v_attempt delivery_attempts;
  v_path text := nullif(btrim(coalesce(p_do_file_path, '')), '');
begin
  if not (select public.is_operation()) then
    raise exception 'Only operation or principal may attach the signed Delivery Order' using errcode = '42501';
  end if;
  if v_path is null then
    raise exception 'the signed Delivery Order file is required' using errcode = '22023', detail = 'do_file_required';
  end if;
  select * into v_doc from ops_delivery_orders where do_number = upper(p_do_number);
  if not found then
    raise exception 'Delivery order not found' using errcode = 'P0002';
  end if;
  if v_doc.voided_at is not null then
    raise exception 'This delivery order was cancelled' using errcode = '22023', detail = 'delivery_order_voided';
  end if;
  select * into v_attempt from delivery_attempts
   where do_number = v_doc.do_number and result in ('delivered', 'partial')
   order by recorded_at desc limit 1;
  if not found then
    raise exception 'a signed Delivery Order proves a delivered or partially delivered result — none is recorded yet'
      using errcode = '22023', detail = 'no_delivered_result';
  end if;
  update orders
     set do_file_path      = v_path,
         do_uploaded_at    = now(),
         pod_signed_by     = coalesce(nullif(btrim(coalesce(p_signed_by, '')), ''), pod_signed_by),
         pod_signed_at     = coalesce(pod_signed_at, now()),
         pod_signature_url = coalesce(nullif(btrim(coalesce(p_signature_path, '')), ''), pod_signature_url)
   where id = v_doc.order_id;
  insert into delivery_attempt_evidence (attempt_id, order_id, do_number, path, kind, recorded_by)
  values (v_attempt.id, v_doc.order_id, v_doc.do_number, v_path, 'document', auth.uid())
  on conflict (attempt_id, path) do nothing;
  insert into order_history (order_id, text, by_role)
  values (v_doc.order_id, format('%s · Signed Delivery Order uploaded', v_doc.do_number), (select public.app_role()));
  return jsonb_build_object(
    'order_id', v_doc.order_id, 'do_number', v_doc.do_number,
    'attempt_id', v_attempt.id, 'do_file_path', v_path, 'do_uploaded_at', now()
  );
end;
$fn$;
revoke all on function public.delivery_signed_do_attach(text, text, text, text) from public, anon;
grant execute on function public.delivery_signed_do_attach(text, text, text, text) to authenticated;
