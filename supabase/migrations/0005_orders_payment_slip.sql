-- =============================================================================
-- 0005 — Add `payment_slip_url` to orders.
-- Phase 2B eng-review D1: Storage strategy = Supabase Storage bucket day-1.
-- DB columns store storage paths (~100 bytes), NOT base64 data URLs. The
-- existing `signature_url` column stays as-is and now also holds a storage
-- path. List endpoint excludes both columns to keep responses lean.
-- =============================================================================

alter table orders
  add column payment_slip_url text;

-- No index needed — both columns are read on detail GET only, never filtered.
