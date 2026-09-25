-- =============================================================================
-- 0581_a_logistics_company_answers_through_its_own_link.sql
-- WORKSPACE LOGISTICS CARD · owner rulings 2026-09-24 (docs/delivery/MASTER.md
-- §5.5 · docs/ERP-ARCHITECTURE.md §6.4 · docs/workspace/MASTER.md §5.9)
-- =============================================================================
--
-- THE OWNER'S RULINGS THIS MIGRATION EXISTS FOR:
--
--   · NETS keeps its signed-in portal. A logistics company with NO portal (AL,
--     TT, TEOW, EU, SSY, HOUZS …) answers through ONE external link — no OTP,
--     no PIN, no name asked. Whoever holds the link acts for THAT company on
--     THAT delivery; the record says `{company} via external link` and never
--     claims to know which person pressed the button.
--   · One active link per delivery scope. `Revoke link` kills it; a new link is
--     a separate, explicit `Create link` after a revoke.
--   · A save through a valid link IS the company's own external record — no
--     WhatsApp screenshot is required for it. A Carres operator recording a
--     WhatsApp reply still needs the screenshot (unchanged).
--   · The partner's answer is structured and the save decides the result:
--     a date → Scheduled · another date proposed → Requested another date ·
--     cannot deliver → Cannot deliver. No free-text outcome.
--
-- ── WHAT IT ADDS ─────────────────────────────────────────────────────────────
--   1. `ops_delivery_partner_links` — the link record. The token is a 256-bit
--      random bearer secret. It is stored as issued because `Copy link` must be
--      able to hand the same link out again; so the table has NO read grant and
--      NO policy for any signed-in role — only the Worker (service role) reads
--      it, after its own role gate, exactly the shape 0386 gave arrangements.
--   2. Two arrangement events: `arrangement_saved` (who saved the date, and
--      through which door) and `another_date_requested` (the proposed date and
--      its governed reason). `source` names the door: operation · partner
--      portal · external link. `link_id` names the link that carried it.
--   3. `ops_delivery_arrangements.updated_via` — the same door word on the
--      arrangement itself, so a reader never has to guess whether `updated_by`
--      being NULL means "the system" or "a link".
--
-- ── WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────────────
-- It moves no row, backfills nothing (CLAUDE.md §6 — every row today is test
-- data) and changes no existing write door's behaviour: every existing insert
-- names an event already allowed, and the new columns are nullable.
--
-- ── SCHEMA IS WHAT THIS OWNS; DATA IS WHAT IT WALKS PAST (Red line 8) ────────
-- No row count is asserted anywhere below.
--
-- Migration number: 0581 = MAX(tracker 0575 · repository 0579 · every branch
-- 0580) + 1, never from `ls`.
-- =============================================================================

set search_path = public;

-- ── 1 · the link ────────────────────────────────────────────────────────────
create table if not exists public.ops_delivery_partner_links (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders(id) on delete cascade,
  leg              smallint not null default 0 check (leg between 0 and 20),
  partner_id       uuid not null references public.delivery_partners(id),
  token            text not null unique check (length(token) >= 40),
  created_at       timestamptz not null default now(),
  created_by       uuid references public.app_users(id),
  revoked_at       timestamptz,
  revoked_by       uuid references public.app_users(id),
  -- `revoked`: an operator pressed Revoke link. `logistics_changed`: the
  -- scope's company changed, so the old company's link died with it.
  revoke_reason    text check (revoke_reason in ('revoked', 'logistics_changed')),
  first_opened_at  timestamptz,
  last_opened_at   timestamptz,
  constraint ops_delivery_partner_links_revoked_has_reason
    check ((revoked_at is null) = (revoke_reason is null))
);

comment on table public.ops_delivery_partner_links is
  '0581: one external answer link per delivery scope (order_id, leg) for a logistics company with no portal login. Worker-only: no grant, no policy for signed-in roles. Owner rulings 2026-09-24.';
comment on column public.ops_delivery_partner_links.token is
  '0581: 256-bit random bearer secret, base64url. Kept as issued so Copy link can hand the same link out again; never readable by a signed-in role.';
comment on column public.ops_delivery_partner_links.first_opened_at is
  '0581: the first time the link page RENDERED in a browser (a POST from the page, never the GET a chat app makes to build a preview).';

-- One ACTIVE link per scope. A revoked link stays as history.
create unique index if not exists ops_delivery_partner_links_one_active
  on public.ops_delivery_partner_links (order_id, leg)
  where revoked_at is null;
create index if not exists ops_delivery_partner_links_scope
  on public.ops_delivery_partner_links (order_id, leg, created_at desc);

-- 0367's lesson: a new table inherits a blanket write grant nobody asked for.
revoke all on public.ops_delivery_partner_links from public, anon, authenticated;
alter table public.ops_delivery_partner_links enable row level security;
-- No policy, on purpose: the Worker reads and writes with the service role
-- after `requireOperationOrPrincipal` (operation doors) or a token match
-- (the public link doors).

-- ── 2 · the arrangement events learn who saved, and the other-date answer ──
alter table public.ops_delivery_arrangement_events
  add column if not exists source        text,
  add column if not exists proposed_date date,
  add column if not exists link_id       uuid references public.ops_delivery_partner_links(id);

alter table public.ops_delivery_arrangement_events
  drop constraint if exists ops_delivery_arrangement_events_source_check;
alter table public.ops_delivery_arrangement_events
  add constraint ops_delivery_arrangement_events_source_check
    check (source is null or source in ('operation', 'partner_portal', 'external_link'));

alter table public.ops_delivery_arrangement_events
  drop constraint if exists ops_delivery_arrangement_events_event_check;
alter table public.ops_delivery_arrangement_events
  add constraint ops_delivery_arrangement_events_event_check
    check (event in ('assigned', 'changed', 'cleared', 'message_prepared', 'cannot_deliver',
                     'arrangement_saved', 'another_date_requested'));

-- `Requested another date` carries the date AND the governed reason; a link
-- event names its link. No free-text outcome exists to fill either gap.
alter table public.ops_delivery_arrangement_events
  drop constraint if exists ops_delivery_arrangement_events_another_date_is_whole;
alter table public.ops_delivery_arrangement_events
  add constraint ops_delivery_arrangement_events_another_date_is_whole
    check (event <> 'another_date_requested' or (proposed_date is not null and reason_key is not null));

alter table public.ops_delivery_arrangement_events
  drop constraint if exists ops_delivery_arrangement_events_link_event_names_link;
alter table public.ops_delivery_arrangement_events
  add constraint ops_delivery_arrangement_events_link_event_names_link
    check (source is distinct from 'external_link' or link_id is not null);

comment on column public.ops_delivery_arrangement_events.source is
  '0581: the door the fact came through — operation · partner_portal · external_link. NULL on rows written before 0581.';
comment on column public.ops_delivery_arrangement_events.proposed_date is
  '0581: the date a logistics company proposed with Requested another date. Not a scheduled date.';

-- ── 3 · the arrangement names the door that last saved it ──────────────────
alter table public.ops_delivery_arrangements
  add column if not exists updated_via text;
alter table public.ops_delivery_arrangements
  drop constraint if exists ops_delivery_arrangements_updated_via_check;
alter table public.ops_delivery_arrangements
  add constraint ops_delivery_arrangements_updated_via_check
    check (updated_via is null or updated_via in ('operation', 'partner_portal', 'external_link'));

comment on column public.ops_delivery_arrangements.updated_via is
  '0581: the door of the last save — operation · partner_portal · external_link. updated_by stays NULL for a link save: a link names a company, never a person.';
