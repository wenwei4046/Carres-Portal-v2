-- ============================================================================
-- DRAFT — NOT YET APPLIED, NOT YET IN supabase/migrations/
-- (PRE-GOLIVE guardrail #8: migration drafts live in docs/ until approved.)
--
-- Number 0239 claimed against the remote tracker tail 0238 (list_migrations,
-- 2026-07-19). RE-CHECK the tail immediately before applying — parallel
-- sessions share prod.
-- ============================================================================
--
-- 0239 — account_email_change_requests (Loo 2026-07-19)
--
-- The dealer principal (店主) can change the STORE password directly (client →
-- Supabase Auth, no schema needed) but a login EMAIL change must be approved
-- by Carres HQ. This table is the request ledger:
--
--   POS submit  → INSERT via userClient (RLS: own login, own dealer, pending)
--   POS cancel  → UPDATE pending → cancelled via userClient (RLS-constrained)
--   HQ approve  → service_role: auth.admin email swap + app_users mirror +
--                 row → approved  (apps/api/src/routes/principal/accounts.ts)
--   HQ reject   → service_role: row → rejected + decision_note
--
-- Additive only. No existing table/policy touched.

create table public.account_email_change_requests (
  id                    uuid primary key default gen_random_uuid(),
  /** auth user whose LOGIN email changes (the store credential). */
  user_id               uuid not null,
  dealer_id             uuid not null references public.dealers(id) on delete cascade,
  current_email         text not null,
  requested_email       text not null,
  status                text not null default 'pending'
                        check (status in ('pending','approved','rejected','cancelled')),
  /** Who filed it — null = owner-mode (the password-proven store credential). */
  requested_by_staff_id uuid references public.salespersons(id),
  requested_by_name     text,
  /** HQ's note on reject — shown back to the store. */
  decision_note         text,
  decided_by            uuid,
  decided_at            timestamptz,
  created_at            timestamptz not null default now()
);

-- ONE open request per store login.
create unique index account_email_change_one_pending
  on public.account_email_change_requests (user_id) where (status = 'pending');

create index account_email_change_dealer_idx
  on public.account_email_change_requests (dealer_id, created_at desc);

alter table public.account_email_change_requests enable row level security;

-- Read: internal roles + the store's own dealer (0231 idiom, InitPlan-wrapped).
create policy "account_email_change_select"
on public.account_email_change_requests
for select
to authenticated
using (
  ( select is_internal() )
  or dealer_id = ( select app_dealer_id() )
);

-- Insert: only the store login files, only for itself, only as pending. The
-- principal-TIER gate (店主 only) is enforced in the Hono route via the 0233
-- staff token; RLS bounds the blast radius to the caller's own credential.
create policy "account_email_change_insert_own"
on public.account_email_change_requests
for insert
to authenticated
with check (
  user_id = ( select auth.uid() )
  and dealer_id = ( select app_dealer_id() )
  and status = 'pending'
);

-- Update: the store may ONLY flip its own pending request to cancelled.
-- Approve/reject run under service_role (bypasses RLS) in the principal API.
create policy "account_email_change_cancel_own"
on public.account_email_change_requests
for update
to authenticated
using (
  user_id = ( select auth.uid() )
  and status = 'pending'
)
with check (
  user_id = ( select auth.uid() )
  and status = 'cancelled'
);
