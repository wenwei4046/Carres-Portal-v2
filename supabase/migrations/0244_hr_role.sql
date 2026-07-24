-- 0244_hr_role — add the 'hr' value to app_role (HR commission portal, 2026-07-25).
--
-- ALTER TYPE ... ADD VALUE cannot share a transaction with statements that USE the
-- new value, so this migration contains ONLY the enum add. Everything that
-- references 'hr' (tables, RLS, RPCs) lives in 0245_hr_commission.
--
-- The 0004 custom_access_token_hook is role-agnostic (copies app_users.role into
-- the JWT verbatim), so an 'hr' account flows into app_metadata with no hook change.
-- is_internal() is deliberately NOT widened: HR reaches order data only through the
-- explicitly-gated SECURITY DEFINER RPCs in 0245 (least privilege).

alter type public.app_role add value if not exists 'hr';
