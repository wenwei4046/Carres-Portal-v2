-- ═══════════════════════════════════════════════════════════════════════════
-- 0599 · Three named Carres staff are people (owner answer, Jess 2026-09-28)
--
-- 0533 created `app_users.is_person` and marked only the three people its
-- ruling named; accounts created before it stayed `false`, and 0592's record
-- grammar therefore prints their acts as `Staff identity not recorded`.
-- Jess, 2026-09-28: "khor yee & samantha resigned. herng is business
-- development, chan chee liang is nets owner/pic."
--
--   khoryee@carres.com        Khor Yee   · resigned · account already disabled
--   samantha@carres.com       Samantha   · resigned · account already disabled
--   hugo@carresofficial.com   Herng      · Business Development · active
--
-- A resigned person is still the person who acted: History names her. The
-- marker does not revive a login — `workspace_is_person` (0533) also requires
-- an ACTIVE account, so a disabled person can never hold, cover, assign or
-- execute a duty.
--
-- NOT marked: Chan chee liang (`warehouse` role) is NETS's owner and PIC, not
-- Carres staff. The marker admits an account to Carres duties, and a NETS
-- login may hold none (People/HR creation marks only internal roles, 0533).
-- Naming a personal NETS login in History is the governed personal NETS
-- operator gap (Workspace MASTER), not this marker.
--
-- Idempotent. Runs with no JWT, which the 0533 marker guard admits.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

update public.app_users
   set is_person = true
 where email in ('khoryee@carres.com', 'samantha@carres.com', 'hugo@carresofficial.com')
   and not is_person;

commit;
