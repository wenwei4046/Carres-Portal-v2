-- 0280_delivery_photos.sql
-- Delivery execution queue T6 — the delivery photo (the artifact).
-- Locked with Jess 2026-07-26 (docs/delivery-execution-queue.md card T6):
-- every completed delivery has proof. Named "delivery photo" everywhere —
-- POD stays banned (docs/COPY-STANDARD.md).
--
-- ONE additive column, nothing else:
--   * delivery_photos — jsonb array of {path, at, by} entries, appended ONLY
--     by the dedicated POST /:id/delivery-photo/attach route (which gates on
--     the order being delivered). Photos live in the existing PRIVATE
--     `proof-of-delivery` bucket (0069) under the `order/{order_id}/` prefix —
--     the partner POD flow keys on `{thread_id}/`, so the two families can
--     never collide. No storage policy change: the Worker signs upload AND
--     view URLs with the service client after its own operation/principal
--     role gate (0069's read policy still names the pre-0121 'logistics'
--     role, so user-JWT storage ops were never a working path here).
--
-- The card asked for "delivered_at + photo path columns". delivered_at is
-- DELIBERATELY absent: orders.delivered_at has existed since 0019 and has
-- real writers (the partner deliver RPC, ops bulk-complete, the 0106
-- auto-status trigger family) — a second copy on the overlay would be the
-- samantha-hole shape (a cosmetic duplicate of a load-bearing fact).
--
-- RLS: ops_order_control's existing policies (0159) already cover the new
-- column — read = internal, write = operation/principal.

set search_path = public;

alter table public.ops_order_control
  add column if not exists delivery_photos jsonb not null default '[]'::jsonb;

alter table public.ops_order_control
  add constraint ooc_delivery_photos_is_array
    check (jsonb_typeof(delivery_photos) = 'array');

comment on column public.ops_order_control.delivery_photos is
  'T6 (0280): delivery-photo ledger — jsonb array of {path, at, by}. path = object key in the private proof-of-delivery bucket under order/{order_id}/. Appended only by the delivery-photo attach endpoint (delivered orders only); never written by the generic control PUT.';

-- ── sanity ──────────────────────────────────────────────────────────────────
do $$
declare
  v_default text;
begin
  select column_default into v_default
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'ops_order_control'
    and column_name = 'delivery_photos';
  if v_default is null then
    raise exception 'delivery_photos column missing or has no default';
  end if;
end $$;
