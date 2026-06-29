-- =============================================================================
-- 0180_storage_orders_attachments_internal_write.sql
-- Principal-portal order creation (2026-06-25) — internal-role write branch on
-- the orders-attachments bucket.
-- =============================================================================
--
-- A principal places an order ON BEHALF OF a picked dealer (Option A) and must
-- upload the signature / payment-slip under THAT dealer's folder
-- (`orders-attachments/{dealer_id}/{session}/…`). The principal's
-- `app_dealer_id()` is NULL, so the 0006 dealer-own-folder INSERT/UPDATE policies
-- (`(storage.foldername(name))[1] = app_dealer_id()::text`) deny the write.
--
-- This adds an `is_internal()` WRITE branch — the exact mirror of the existing
-- `orders_attachments_internal_read` (0006:194-199) — so any internal role
-- (principal / operation / finance / bd) may INSERT/UPDATE inside
-- orders-attachments. Internal roles are already trusted (they READ all of this
-- bucket today); granting write to the same trusted set matches that model.
--
-- ADDITIVE: the dealer-own-folder INSERT/UPDATE policies (0006) are UNTOUCHED, so
-- a dealer's own upload path is byte-identical. No table change. No DELETE branch
-- (0006 keeps attachments immutable by design once submitted).
-- =============================================================================

-- INSERT: an internal role may upload into any orders-attachments folder
-- (in practice, the picked dealer's folder built by the principal POS).
drop policy if exists "orders_attachments_internal_insert" on storage.objects;
create policy "orders_attachments_internal_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'orders-attachments'
  and (select public.is_internal())
);

-- UPDATE: mirrors the dealer `replace` flow used by the slip uploader.
drop policy if exists "orders_attachments_internal_update" on storage.objects;
create policy "orders_attachments_internal_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'orders-attachments'
  and (select public.is_internal())
)
with check (
  bucket_id = 'orders-attachments'
  and (select public.is_internal())
);
