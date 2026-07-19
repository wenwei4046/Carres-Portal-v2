-- ============================================================================
-- DRAFT — NOT YET APPLIED, NOT YET IN supabase/migrations/
-- (PRE-GOLIVE guardrail #8: migration drafts live in docs/ until approved.)
--
-- Number 0241 claimed against the remote tracker tail 0240 (list_migrations,
-- 2026-07-19). RE-CHECK the tail immediately before applying — parallel
-- sessions share prod (the 0239→0240 collision happened THIS morning).
-- ============================================================================
--
-- 0241 — salespersons profile fields (Loo 2026-07-19)
--
-- The Add-staff form now collects the member's email, birthday and gender
-- (and sets the 6-digit PIN in the same step — no schema needed for that,
-- createStaffInputSchema.pin already existed). Three additive nullable
-- columns; no RLS/policy change (existing salespersons policies keep gating
-- all writes).

alter table public.salespersons
  add column email text,
  add column birthday date,
  add column gender text check (gender in ('male','female'));
