-- =============================================================================
-- 0168_drop_set_order_date_2arg_shim.sql — Phase 11.2 coordinated-cut cleanup
-- 2026-06-14.
--
-- The 0166 2-arg shim set_order_date(uuid, date) existed ONLY to keep the
-- pre-11.1 deployed API alive during the deploy gap (it called the 2-arg form
-- that 0165 had dropped). The 11.2 coordinated cut shipped the new API + web,
-- which call the 3-arg form set_order_date(p_order_id, p_date, p_proceed_date).
-- Verified 2026-06-14: no DB function references set_order_date besides itself,
-- and the live API route sends p_proceed_date. The 2-arg shim is now dead.
--
-- Drop ONLY the 2-arg overload (Postgres distinguishes by arg types); the 3-arg
-- 0165 version is untouched, so proceed date is always part of date-confirm.
-- =============================================================================

drop function if exists public.set_order_date(uuid, date);
