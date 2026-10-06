-- 0487 · A customer contact is a record with its purpose
-- 【DELIVERY】 CARD 11 · In-panel arrangement writes (Delivery MASTER §5.1, §8.6)
--
-- Every contact names its purpose — never `Contact Customer` or `Follow Up`.
-- Each record stores purpose, contact owner, channel, person contacted, actual
-- time, result, reply evidence, recorder, proxy provenance and the explicit
-- next action. Silence is never a result: `Waiting for customer reply` appears
-- on a screen only when a record carries that result. A sent, copied or opened
-- message is never reply evidence.
--
-- Append-only. Reads: any internal user (the shared `is_internal()` answer).
-- Writes: none for the client — the Worker's service-role door is the only
-- writer, where the later-date rule and the arrangement save live together.

set search_path = public;

create table if not exists public.ops_delivery_contacts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  leg smallint not null default 0 check (leg between 0 and 20),

  -- WHY the contact happened — the governed purpose list (§5.1).
  purpose_key text not null check (purpose_key in (
    'confirm_delivery_date',
    'confirm_delivery_time',
    'confirm_customer_availability',
    'confirm_delivery_address',
    'confirm_site_access',
    'confirm_receiver',
    'obtain_missing_information',
    'confirm_new_delivery_date_after_failed_delivery',
    'confirm_new_delivery_date',
    'confirm_cancellation'
  )),
  -- HOW — the channel, named when transmission matters.
  channel text not null check (channel in ('whatsapp', 'call', 'in_person', 'email')),
  -- WHO was contacted, and who owns the conversation.
  contacted_person text not null check (contacted_person in ('customer', 'partner')),
  contact_owner_user_id uuid references public.app_users(id),
  contacted_at timestamptz not null default now(),

  -- WHAT came back — the governed result list (§5.1). Never inferred.
  result_key text not null check (result_key in (
    'confirmed',
    'no_answer',
    'asked_to_call_again',
    'requested_another_date',
    'contact_details_incorrect',
    'customer_refused_delivery',
    'waiting_for_customer_reply'
  )),
  -- The ACTUAL reply, when there is one: a storage path in the proof bucket.
  reply_evidence_path text,
  next_action text,
  note text,

  -- PROXY PROVENANCE: Operation recording on behalf of a partner names it.
  on_behalf_of_partner_id uuid references public.delivery_partners(id),

  recorded_by uuid references public.app_users(id),
  recorded_at timestamptz not null default now()
);

create index if not exists ops_delivery_contacts_scope_idx
  on public.ops_delivery_contacts (order_id, leg, contacted_at desc);

comment on table public.ops_delivery_contacts is
  '0487: the Delivery customer-contact record (Delivery MASTER §5.1). Append-only: purpose, channel, person, owner, time, result, reply evidence, next action, proxy provenance, recorder. The Worker door is the only writer; a result is never inferred from silence.';

alter table public.ops_delivery_contacts enable row level security;

-- 0367's lesson: a new table inherits a blanket write grant nobody asked for.
revoke all on public.ops_delivery_contacts from public, anon, authenticated;
grant select on public.ops_delivery_contacts to authenticated;

drop policy if exists ops_delivery_contacts_read on public.ops_delivery_contacts;
create policy ops_delivery_contacts_read
  on public.ops_delivery_contacts for select
  using ((select public.is_internal()));
-- WRITE: no policy at all, deliberately (0386's shape). Every write goes
-- through the Worker's service-role route, where the later-date rule (a new
-- date later than the requested one needs the customer's WhatsApp reply on
-- file) and the arrangement save are decided in one request.
