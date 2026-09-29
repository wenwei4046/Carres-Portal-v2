-- =============================================================================
-- 0607_a_supplier_reply_names_its_scope_date_and_evidence.sql
-- (numbered after 0605 = payment reference whitespace and 0606 = the Purchasing
--  Settings lane's `claim_reply_waiting_days` / `claim_escalation_extra_days`)
-- =============================================================================
-- Purchasing MASTER §9.5 "SUPPLIER REPLY RECORDING — OWNER-APPROVED (Jess,
-- 2026-09-25)". The record page records what the supplier ACTUALLY answered:
--
--   Supplier's answer  the six governed goods words (0291's list, unchanged)
--   Applies to         `Whole claim` (stored claim-level, NEVER distributed per
--                      Unit) or `These Units` (the exact Units named)
--   Supplier's date    the supplier's own promised date, when one was given
--   Evidence           files (photo, video, PDF) and/or the phone answer:
--                      who spoke and when; what was said is the answer + Note
--   Note               required for Reject and Other agreement (0291's rule)
--
-- Any active Operation person records (the §5.7 ruling); the recorder is kept.
--
-- What this adds, each load-bearing:
--
--   1. `supplier_claim_replies` — append-only. EVERY recorded reply is a row, so
--      a new answer appends and supersedes the old promise instead of erasing it
--      (§9.5 "A new answer appends and supersedes the old promise").
--   2. A reply that arrives BEFORE any ask is stored as contact evidence
--      (`formal_at` null). 0291's CHECK still refuses an answer without a
--      question on `supplier_claims`, and nobody is forced to record a false
--      earlier ask. When the ask is recorded, the latest such reply BECOMES the
--      formal reply (`supplier_claim_record_request`, re-issued below from its
--      production definition with only that step added).
--   3. `supplier_claim_record_reply` — the one writer of a reply. The legacy
--      `supplier_claim_record_response(uuid,text,text)` stores an answer with
--      no scope, date or evidence; its EXECUTE is revoked from `authenticated`
--      so no second door can write a reply the approved form would refuse. The
--      function itself is left in place (no DROP).
--   4. `document_sends` admits `supplier_claim`, and
--      `supplier_claim_record_send` records `Claim sent to supplier`: the
--      channel, recipient, actor and time staff confirm. Opening WhatsApp or
--      copying a message never reaches it (§9.5 business protections).
--   5. THE ASK SNAPSHOTS THE REPLY TIMING. §9.5: a settings change never
--      silently rewrites an existing dated obligation, so recording the ask
--      copies `Reply waiting days` and `Extra days before escalation` onto the
--      claim (the way 0602 snapshots the repair return target onto the RO).
--      `Reply expected` and the escalation date read the claim's snapshot,
--      never the live setting. The settings columns are 0606's (Settings
--      lane); they are read through to_jsonb so this file applies before or
--      after 0606, and an absent column reads the governed starting value 2.
--
-- What it deliberately does NOT do:
--   · no settings columns — those are 0606's (Purchasing Settings lane).
--   · no status, no close, no Authorised Outcome writer — none is approved here.
--   · no row count is asserted and no existing row is changed.
-- =============================================================================

set search_path = public;

-- ── 1 · the send ledger admits a Supplier Claim ─────────────────────────────

alter table public.document_sends
  drop constraint if exists document_sends_document_kind_check;
alter table public.document_sends
  add constraint document_sends_document_kind_check
  check (document_kind in ('repair_order', 'supplier_claim'));

-- ── 2 · every recorded supplier reply ───────────────────────────────────────

create table if not exists public.supplier_claim_replies (
  id           uuid primary key default gen_random_uuid(),
  claim_id     uuid not null references public.supplier_claims(id),
  response     text not null check (response in ('replacement','deliver_remaining','repair',
                                                 'return_and_replace','reject','other_agreement')),
  -- `claim` = the whole claim, stored claim-level; `units` = exactly these Units.
  scope        text not null check (scope in ('claim', 'units')),
  unit_ids     uuid[] not null default '{}',
  supplier_date date,
  note         text,
  -- [{ path, kind: photo|video|pdf }] in the private `issue-evidence` bucket.
  evidence     jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  -- A phone answer: who spoke, and when. What was said is the answer + note.
  spoke_with   text,
  spoken_at    timestamptz,
  recorded_by  uuid not null references auth.users(id),
  recorded_at  timestamptz not null default now(),
  -- When it became the claim's formal reply. Null = contact evidence received
  -- before any ask was recorded.
  formal_at    timestamptz,
  constraint supplier_claim_replies_scope_units
    check ((scope = 'claim' and cardinality(unit_ids) = 0)
        or (scope = 'units' and cardinality(unit_ids) > 0)),
  constraint supplier_claim_replies_note_required
    check (response not in ('reject','other_agreement')
           or coalesce(note, '') ~ '[^[:space:]]'),
  constraint supplier_claim_replies_phone_whole
    check ((spoke_with is null) = (spoken_at is null)),
  constraint supplier_claim_replies_evidence_required
    check (jsonb_array_length(evidence) > 0 or spoke_with is not null)
);

create index if not exists supplier_claim_replies_claim_idx
  on public.supplier_claim_replies (claim_id, recorded_at desc);

comment on table public.supplier_claim_replies is
  '0607 (§9.5, owner approval 2026-09-25): every recorded supplier reply — answer, scope (whole claim or exact Units, never distributed), the supplier''s own date, evidence and recorder. Append-only; formal_at null = received before any ask.';

alter table public.supplier_claim_replies enable row level security;
drop policy if exists supplier_claim_replies_read_internal on public.supplier_claim_replies;
create policy supplier_claim_replies_read_internal on public.supplier_claim_replies
  for select to authenticated using ((select public.is_internal()));
grant select on public.supplier_claim_replies to authenticated;
revoke insert, update, delete on public.supplier_claim_replies from authenticated, anon;

alter table public.supplier_claims
  add column if not exists reply_waiting_days    int,
  add column if not exists escalation_extra_days int;
alter table public.supplier_claims
  drop constraint if exists supplier_claims_reply_timing_range;
alter table public.supplier_claims
  add constraint supplier_claims_reply_timing_range
  check ((reply_waiting_days is null or reply_waiting_days between 1 and 30)
     and (escalation_extra_days is null or escalation_extra_days between 1 and 30));
comment on column public.supplier_claims.reply_waiting_days is
  '0607 (§9.5): Reply waiting days (Office working days) snapshotted from Purchasing Settings when the ask was recorded. Null = an ask recorded before 0607; readers use the governed starting value 2.';
comment on column public.supplier_claims.escalation_extra_days is
  '0607 (§9.5): Extra days before escalation (Office working days) snapshotted with the ask. Null = before 0607; readers use 2.';

alter table public.supplier_claims
  add column if not exists supplier_response_reply_id uuid references public.supplier_claim_replies(id);
comment on column public.supplier_claims.supplier_response_reply_id is
  '0607: the supplier_claim_replies row that is the current formal reply (its scope, date and evidence). Legacy answers recorded through 0291 have none.';

-- ── 3 · the one reply writer ────────────────────────────────────────────────

create or replace function public.supplier_claim_record_reply(
  p_claim_id      uuid,
  p_response      text,
  p_scope         text,
  p_unit_ids      uuid[] default '{}',
  p_supplier_date date default null,
  p_note          text default null,
  p_evidence      jsonb default '[]'::jsonb,
  p_spoke_with    text default null,
  p_spoken_at     timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     app_role;
  v_uid      uuid;
  v_actor    text;
  v_claim    supplier_claims;
  v_response text := nullif(btrim(coalesce(p_response, '')), '');
  v_note     text := nullif(btrim(coalesce(p_note, '')), '');
  v_spoke    text := nullif(btrim(coalesce(p_spoke_with, '')), '');
  v_units    uuid[] := coalesce(p_unit_ids, '{}');
  v_evidence jsonb := coalesce(p_evidence, '[]'::jsonb);
  v_formal   boolean;
  v_id       uuid;
  v_file     jsonb;
begin
  v_role := public.supplier_claim_gate();
  v_uid  := auth.uid();

  if p_claim_id is null or v_response is null then
    raise exception 'Choose the supplier''s answer' using errcode = '22023', detail = 'answer_required';
  end if;
  if v_response not in ('replacement','deliver_remaining','repair','return_and_replace','reject','other_agreement') then
    raise exception '% is not one of the supplier''s answers', v_response
      using errcode = '22023', detail = 'response_invalid';
  end if;
  if p_scope is null or p_scope not in ('claim', 'units') then
    raise exception 'Choose what the answer applies to' using errcode = '22023', detail = 'scope_required';
  end if;
  if p_scope = 'claim' and cardinality(v_units) > 0 then
    raise exception 'A whole-claim answer names no Units' using errcode = '22023', detail = 'scope_units_mismatch';
  end if;
  if p_scope = 'units' and cardinality(v_units) = 0 then
    raise exception 'Tick the Units this answer applies to' using errcode = '22023', detail = 'units_required';
  end if;
  if v_response in ('reject','other_agreement') and v_note is null then
    raise exception 'Write the note: why the supplier refused, or what was agreed'
      using errcode = '22023', detail = 'response_note_required';
  end if;
  if jsonb_typeof(v_evidence) <> 'array' then
    raise exception 'Evidence must be a list of files' using errcode = '22023', detail = 'evidence_invalid';
  end if;
  for v_file in select value from jsonb_array_elements(v_evidence) loop
    if coalesce(v_file->>'path', '') !~ '^supplier_claim_reply/'
       or coalesce(v_file->>'kind', '') not in ('photo', 'video', 'pdf') then
      raise exception 'An evidence file is not a supplier-reply upload' using errcode = '22023', detail = 'evidence_invalid';
    end if;
  end loop;
  if (v_spoke is null) <> (p_spoken_at is null) then
    raise exception 'A phone answer needs who spoke and when' using errcode = '22023', detail = 'phone_incomplete';
  end if;
  if jsonb_array_length(v_evidence) = 0 and v_spoke is null then
    raise exception 'Add the evidence: a file, or who spoke and when' using errcode = '22023', detail = 'evidence_required';
  end if;

  select * into v_claim from supplier_claims where id = p_claim_id for update;
  if not found then
    raise exception 'Claim not found' using errcode = 'P0002', detail = 'claim_not_found';
  end if;
  if v_claim.status <> 'open' then
    raise exception 'Claim % is %', v_claim.claim_no, v_claim.status
      using errcode = 'P0001', detail = 'claim_' || v_claim.status;
  end if;
  -- `These Units` names exactly this claim's own Units — never another claim's.
  if p_scope = 'units' and exists (
    select 1 from unnest(v_units) u(id)
     where not exists (select 1 from ops_stock_items s where s.id = u.id and s.hold_claim_id = p_claim_id)
  ) then
    raise exception 'A ticked Unit is not on this claim' using errcode = '22023', detail = 'unit_not_on_claim';
  end if;

  v_formal := v_claim.requested_action is not null;
  insert into supplier_claim_replies (claim_id, response, scope, unit_ids, supplier_date, note, evidence,
                                      spoke_with, spoken_at, recorded_by, formal_at)
  values (p_claim_id, v_response, p_scope, (select coalesce(array_agg(distinct x), '{}') from unnest(v_units) x),
          p_supplier_date, v_note, v_evidence, v_spoke, p_spoken_at, v_uid,
          case when v_formal then now() end)
  returning id into v_id;

  if v_formal then
    update supplier_claims
       set supplier_response          = v_response,
           supplier_response_note     = v_note,
           responded_at               = now(),
           responded_by               = v_uid,
           supplier_response_reply_id = v_id,
           updated_at                 = now()
     where id = p_claim_id;
  end if;

  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));
  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('Supplier claim %s — supplier answered %s (%s)%s', v_claim.claim_no, v_response,
                 case when p_scope = 'claim' then 'whole claim' else cardinality(v_units)::text || ' Units' end,
                 case when v_formal then '' else ' before the ask was recorded' end),
          v_claim.claim_no);

  return jsonb_build_object('reply_id', v_id, 'claim_no', v_claim.claim_no,
                            'supplier_response', v_response, 'formal', v_formal);
end;
$fn$;

revoke all on function public.supplier_claim_record_reply(uuid, text, text, uuid[], date, text, jsonb, text, timestamptz) from public, anon;
grant execute on function public.supplier_claim_record_reply(uuid, text, text, uuid[], date, text, jsonb, text, timestamptz) to authenticated;

-- The legacy door wrote an answer without scope, date or evidence. It stays
-- defined (history), but no signed-in caller may use it any more.
revoke execute on function public.supplier_claim_record_response(uuid, text, text) from authenticated;

-- ── 4 · the ask: a reply received first becomes the formal reply ────────────
-- Re-issued from the production definition (pg_get_functiondef, 2026-09-29);
-- the only change is the promotion step before the history rows.

create or replace function public.supplier_claim_record_request(
  p_claim_id uuid,
  p_requested_action text,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role   app_role;
  v_uid    uuid;
  v_actor  text;
  v_claim  supplier_claims;
  v_action text;
  v_early  supplier_claim_replies;
  v_set    jsonb;
begin
  v_role := public.supplier_claim_gate();
  v_uid  := auth.uid();

  v_action := nullif(btrim(coalesce(p_requested_action, '')), '');
  if p_claim_id is null or v_action is null then
    raise exception 'p_claim_id and p_requested_action are required'
      using errcode = '22023', detail = 'invalid_input';
  end if;

  select * into v_claim from supplier_claims where id = p_claim_id for update;
  if not found then
    raise exception 'claim not found' using errcode = '42P01', detail = 'claim_not_found';
  end if;

  if v_claim.status = 'closed' then
    raise exception 'claim % is already closed', v_claim.claim_no
      using errcode = 'P0001', detail = 'claim_closed';
  end if;
  if v_claim.supplier_response is not null then
    raise exception 'claim % already carries the supplier''s answer', v_claim.claim_no
      using errcode = 'P0001', detail = 'request_frozen';
  end if;
  if not public.supplier_claim_request_allowed(v_claim.claim_type, v_action) then
    raise exception '% is not something we can ask for a % claim', v_action, v_claim.claim_type
      using errcode = 'P0001', detail = 'request_invalid';
  end if;

  -- 0607: the reply timing that applies to THIS ask, snapshotted. Read by
  -- name through to_jsonb so an absent Settings column (before 0606) is the
  -- governed starting value 2, never an error and never zero.
  select to_jsonb(s) into v_set from purchasing_settings s order by id limit 1;

  update supplier_claims
     set requested_action      = v_action,
         requested_at          = now(),
         requested_by          = v_uid,
         note                  = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note),
         reply_waiting_days    = coalesce(nullif(v_set->>'claim_reply_waiting_days', '')::int, 2),
         escalation_extra_days = coalesce(nullif(v_set->>'claim_escalation_extra_days', '')::int, 2),
         updated_at            = now()
   where id = p_claim_id;

  -- 0607: the latest reply received before this ask becomes the formal reply.
  select * into v_early from supplier_claim_replies
   where claim_id = p_claim_id and formal_at is null
   order by recorded_at desc, id desc limit 1;
  if found then
    update supplier_claim_replies set formal_at = now() where id = v_early.id;
    update supplier_claims
       set supplier_response          = v_early.response,
           supplier_response_note     = v_early.note,
           responded_at               = now(),
           responded_by               = v_early.recorded_by,
           supplier_response_reply_id = v_early.id,
           updated_at                 = now()
     where id = p_claim_id;
  end if;

  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));

  insert into po_history (po_id, text, by_role)
  values (v_claim.po_id,
          format('Claim %s — asked %s to: %s', v_claim.claim_no,
                 coalesce((select name from suppliers where id = v_claim.supplier_id), 'supplier'),
                 v_action),
          v_role);

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('Supplier claim %s — asked for %s', v_claim.claim_no, v_action),
          v_claim.claim_no);

  return jsonb_build_object(
    'claim_no',         v_claim.claim_no,
    'requested_action', v_action,
    'status',           v_claim.status,
    'reply_promoted',   v_early.id is not null
  );
end;
$fn$;

-- ── 5 · `Claim sent to supplier` ────────────────────────────────────────────

create or replace function public.supplier_claim_record_send(
  p_claim_id  uuid,
  p_channel   text,
  p_recipient text,
  p_note      text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role  app_role := public.supplier_claim_gate();
  v_claim supplier_claims;
  v_id    uuid;
begin
  select * into v_claim from supplier_claims where id = p_claim_id for update;
  if not found then
    raise exception 'Claim not found' using errcode = 'P0002', detail = 'claim_not_found';
  end if;
  if v_claim.status <> 'open' then
    raise exception 'Claim % is %', v_claim.claim_no, v_claim.status
      using errcode = 'P0001', detail = 'claim_' || v_claim.status;
  end if;
  if coalesce(p_channel, '') not in ('whatsapp', 'email', 'print') then
    raise exception 'Choose how it was sent' using errcode = '22023', detail = 'invalid_channel';
  end if;
  if coalesce(p_recipient, '') !~ '[^[:space:]]' then
    raise exception 'Say who received it' using errcode = '22023', detail = 'recipient_required';
  end if;

  -- A claim has no document versions yet: every send is of version 1.
  insert into document_sends (document_kind, document_id, version, recipient, channel, note, confirmed, sent_by)
  values ('supplier_claim', v_claim.id, 1, btrim(p_recipient), p_channel,
          case when coalesce(p_note, '') ~ '[^[:space:]]' then btrim(p_note) end, true, auth.uid())
  returning id into v_id;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, auth.uid()::text, 'supplier_claim_send',
          format('%s sent to %s by %s', v_claim.claim_no, btrim(p_recipient), p_channel));
  return v_id;
end;
$fn$;

revoke all on function public.supplier_claim_record_send(uuid, text, text, text) from public, anon;
grant execute on function public.supplier_claim_record_send(uuid, text, text, text) to authenticated;
