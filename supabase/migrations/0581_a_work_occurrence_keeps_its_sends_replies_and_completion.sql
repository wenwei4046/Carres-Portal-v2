-- =============================================================================
-- 0581_a_work_occurrence_keeps_its_sends_replies_and_completion.sql
-- Workspace MASTER §5 · owner rulings 2026-09-24 (Jess) — the Work lifecycle
-- `To do` · `Waiting` · `Completed` and its smallest data contract.
--
-- WHAT WAS MISSING, MEASURED on origin/main f7c95d851
--   · Work has no table. `/api/operation/work` projects the open set from each
--     module on every read, and an occurrence disappears the moment its module
--     records the result — so nothing can say it was Completed.
--   · `communication.replyState` exists in the v2 contract
--     (packages/shared/src/operation-work.ts:156) but no projector fills it, and
--     `closureReceipt` is always null (apps/api/src/routes/operation/work.ts:1086).
--     Nothing can say an occurrence is Waiting.
--
-- WHAT THIS ADDS — one append-only ledger, `work_occurrence_events`
--   request_sent    a request left for someone outside Carres. From an
--                   integrated provider ONLY after the provider accepted it;
--                   otherwise an explicit `Record request sent` by staff.
--                   Opening or copying a WhatsApp/email text is never a send.
--                   It moves the occurrence to Waiting and never completes it.
--   reply_received  the answer came back. The occurrence returns to To do
--                   unless the module's completion fact is already true.
--   completed       ONLY the owning module's completion fact produces it.
--                   Terminal: nothing is recorded on a completed occurrence.
--                   A recurring problem is a NEW occurrence identity.
--   The state is DERIVED from the events plus the live open set; no row stores
--   a state that could disagree with them.
--
-- DELIBERATELY NOT HERE (owner ruling 2026-09-24)
--   · No `company_id`: the database is single-company throughout, and scoping
--     only this table would be false isolation while its source orders,
--     contacts, payments and deliveries stay unscoped.
--   · No module record is copied: contacts are referenced by kind + id.
--
-- RLS: RLS ENABLED. Internal staff may READ (one policy). No client role may
--   insert, update or delete: every write is one of the three SECURITY DEFINER
--   doors below, and an append-only trigger refuses UPDATE / DELETE / TRUNCATE
--   for every role, the service role included. No existing policy changes.
-- NO ROW COUNT IS ASSERTED (CLAUDE.md §5.8).
-- =============================================================================

create table if not exists public.work_occurrence_events (
  id               uuid primary key default gen_random_uuid(),
  occurrence_id    text not null check (length(occurrence_id) >= 5),
  event            text not null check (event in ('request_sent', 'reply_received', 'completed')),
  actor_id         uuid,
  -- clock_timestamp, not now(): two events written in one transaction must
  -- still order, or "the latest event" is a coin toss.
  at               timestamptz not null default clock_timestamp(),
  channel          text check (channel in ('whatsapp', 'email', 'phone', 'in_person')),
  contact_kind     text check (contact_kind in ('customer', 'supplier', 'delivery_partner', 'dealer')),
  contact_id       uuid,
  reply_due_on     date,
  result_reference text check (result_reference is null or length(result_reference) >= 1),
  source_version   text not null check (length(source_version) >= 1),
  idempotency_key  text not null unique check (length(idempotency_key) >= 8),

  -- A contact is a kind AND an id, or neither.
  constraint work_occurrence_events_contact_pair
    check ((contact_kind is null) = (contact_id is null)),
  -- A send names who sent it, how, and when the reply is due.
  constraint work_occurrence_events_request_shape
    check (event <> 'request_sent'
           or (actor_id is not null and channel is not null
               and reply_due_on is not null and result_reference is null)),
  -- A reply carries no due date and no result.
  constraint work_occurrence_events_reply_shape
    check (event <> 'reply_received'
           or (reply_due_on is null and result_reference is null)),
  -- A completion is the module's fact: it names its result, and no contact.
  constraint work_occurrence_events_completed_shape
    check (event <> 'completed'
           or (result_reference is not null and channel is null
               and contact_kind is null and contact_id is null and reply_due_on is null))
);

comment on table public.work_occurrence_events is
  '0581 · append-only Work lifecycle ledger: request_sent (Waiting), reply_received (back to To do), completed (only from the owning module''s completion fact). State is derived, never stored. Written only by work_record_request_sent / work_record_reply_received / work_record_completed.';

create index if not exists work_occurrence_events_occurrence_idx
  on public.work_occurrence_events (occurrence_id, at);
create index if not exists work_occurrence_events_completed_idx
  on public.work_occurrence_events (at)
  where event = 'completed';

-- One completion per occurrence, ever.
create unique index if not exists work_occurrence_events_one_completion
  on public.work_occurrence_events (occurrence_id)
  where event = 'completed';

alter table public.work_occurrence_events enable row level security;
revoke all on public.work_occurrence_events from public, anon, authenticated;
grant select on public.work_occurrence_events to authenticated;

drop policy if exists work_occurrence_events_internal_read on public.work_occurrence_events;
create policy work_occurrence_events_internal_read
  on public.work_occurrence_events
  for select
  to authenticated
  using ((select public.is_internal()));

-- ── append-only ──────────────────────────────────────────────────────────────

create or replace function public._work_occurrence_events_append_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  raise exception 'a Work event is history: it is never changed or removed'
    using errcode = '42501', detail = 'work_event_append_only';
end;
$fn$;

drop trigger if exists work_occurrence_events_no_update on public.work_occurrence_events;
create trigger work_occurrence_events_no_update
  before update or delete on public.work_occurrence_events
  for each row execute function public._work_occurrence_events_append_only();

drop trigger if exists work_occurrence_events_no_truncate on public.work_occurrence_events;
create trigger work_occurrence_events_no_truncate
  before truncate on public.work_occurrence_events
  for each statement execute function public._work_occurrence_events_append_only();

-- ── shared checks ────────────────────────────────────────────────────────────

-- The idempotent replay: the same key on the same occurrence and event returns
-- the row already written; the same key reused for anything else is refused.
create or replace function public._work_event_replay(p_key text, p_occurrence_id text, p_event text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row work_occurrence_events;
begin
  select * into v_row from work_occurrence_events where idempotency_key = p_key;
  if not found then
    return null;
  end if;
  if v_row.occurrence_id <> p_occurrence_id or v_row.event <> p_event then
    raise exception 'this idempotency key already recorded a different Work event'
      using errcode = '23505', detail = 'work_event_key_reused';
  end if;
  return v_row.id;
end;
$fn$;

revoke all on function public._work_event_replay(text, text, text) from public, anon, authenticated;

create or replace function public._work_refuse_if_completed(p_occurrence_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if exists (select 1 from work_occurrence_events
             where occurrence_id = p_occurrence_id and event = 'completed') then
    raise exception 'this work is already completed; a recurring problem is new work'
      using errcode = 'P0001', detail = 'work_occurrence_completed';
  end if;
end;
$fn$;

revoke all on function public._work_refuse_if_completed(text) from public, anon, authenticated;

-- ── door 1 · request sent ────────────────────────────────────────────────────
-- Staff record a send made outside the ERP, or the API records a provider-
-- accepted send on the staff member's behalf. The actor is always the signed-
-- in person; the API computes `reply_due_on` on the Malaysian working-day
-- calendar and the door refuses a date before today in Kuala Lumpur or on a
-- weekend.
create or replace function public.work_record_request_sent(
  p_occurrence_id   text,
  p_channel         text,
  p_contact_kind    text,
  p_contact_id      uuid,
  p_reply_due_on    date,
  p_source_version  text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_id    uuid;
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
begin
  if auth.uid() is null or not coalesce((select public.is_internal()), false) then
    raise exception 'forbidden: only internal staff record a Work send'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_id := public._work_event_replay(p_idempotency_key, p_occurrence_id, 'request_sent');
  if v_id is not null then
    return v_id;
  end if;
  perform public._work_refuse_if_completed(p_occurrence_id);
  if p_reply_due_on is null or p_reply_due_on < v_today
     or extract(isodow from p_reply_due_on) in (6, 7) then
    raise exception 'the reply due date must be a working day from today'
      using errcode = '22023', detail = 'reply_due_not_a_working_day';
  end if;

  insert into work_occurrence_events (
    occurrence_id, event, actor_id, channel, contact_kind, contact_id,
    reply_due_on, source_version, idempotency_key
  ) values (
    p_occurrence_id, 'request_sent', auth.uid(), p_channel, p_contact_kind, p_contact_id,
    p_reply_due_on, p_source_version, p_idempotency_key
  ) returning id into v_id;
  return v_id;
end;
$fn$;

revoke all on function public.work_record_request_sent(text, text, text, uuid, date, text, text) from public, anon;
grant execute on function public.work_record_request_sent(text, text, text, uuid, date, text, text) to authenticated;

-- ── door 2 · reply received ──────────────────────────────────────────────────
-- Only a Waiting occurrence (its latest event is a send) can receive a reply.
create or replace function public.work_record_reply_received(
  p_occurrence_id   text,
  p_channel         text,
  p_contact_kind    text,
  p_contact_id      uuid,
  p_source_version  text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_id     uuid;
  v_latest text;
begin
  if auth.uid() is null or not coalesce((select public.is_internal()), false) then
    raise exception 'forbidden: only internal staff record a Work reply'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_id := public._work_event_replay(p_idempotency_key, p_occurrence_id, 'reply_received');
  if v_id is not null then
    return v_id;
  end if;
  perform public._work_refuse_if_completed(p_occurrence_id);
  select event into v_latest from work_occurrence_events
   where occurrence_id = p_occurrence_id
   order by at desc, id desc
   limit 1;
  if v_latest is distinct from 'request_sent' then
    raise exception 'this work is not waiting for a reply'
      using errcode = 'P0001', detail = 'work_occurrence_not_waiting';
  end if;

  insert into work_occurrence_events (
    occurrence_id, event, actor_id, channel, contact_kind, contact_id,
    source_version, idempotency_key
  ) values (
    p_occurrence_id, 'reply_received', auth.uid(), p_channel, p_contact_kind, p_contact_id,
    p_source_version, p_idempotency_key
  ) returning id into v_id;
  return v_id;
end;
$fn$;

revoke all on function public.work_record_reply_received(text, text, text, uuid, text, text) from public, anon;
grant execute on function public.work_record_reply_received(text, text, text, uuid, text, text) to authenticated;

-- ── door 3 · completed ───────────────────────────────────────────────────────
-- The owning module's completion writer, and nothing else: the service role
-- only. The actor is the person the module recorded (null when it recorded
-- none — never guessed). Exactly one completion per occurrence.
create or replace function public.work_record_completed(
  p_occurrence_id    text,
  p_actor_id         uuid,
  p_at               timestamptz,
  p_result_reference text,
  p_source_version   text,
  p_idempotency_key  text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_id uuid;
begin
  if not coalesce(auth.role() = 'service_role', false) then
    raise exception 'forbidden: only the owning module''s completion fact completes Work'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_id := public._work_event_replay(p_idempotency_key, p_occurrence_id, 'completed');
  if v_id is not null then
    return v_id;
  end if;
  perform public._work_refuse_if_completed(p_occurrence_id);

  insert into work_occurrence_events (
    occurrence_id, event, actor_id, at, result_reference, source_version, idempotency_key
  ) values (
    p_occurrence_id, 'completed', p_actor_id, coalesce(p_at, clock_timestamp()),
    p_result_reference, p_source_version, p_idempotency_key
  ) returning id into v_id;
  return v_id;
end;
$fn$;

revoke all on function public.work_record_completed(text, uuid, timestamptz, text, text, text) from public, anon, authenticated;
