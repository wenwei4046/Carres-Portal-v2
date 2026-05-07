-- Phase 4.5 Chunk 2 carry-forward `phase-4.5-chunk-2-partner-rfd-page-rebuild`.
--
-- Adds the read RPC that lets a Logistics Partner (LP) list customer-leg
-- threads where Logistics has raised a Request-For-Delivery (RFD) and the
-- partner has not yet accepted or rejected.
--
-- Why an RPC and not a raw select via RLS:
--   - The existing `ost_partner_read` policy on `order_supplier_threads`
--     (0033:96-107) only admits a partner to read threads on POs where they
--     are the *procurement-leg* partner (`purchase_orders.procurement_partner_id`,
--     post-0052). It does NOT cover the case where the partner is assigned
--     only to the *customer-leg* (`order_supplier_threads.delivery_partner_id`).
--     A pure-customer-leg LP currently cannot read their own RFD-pending
--     threads via raw select.
--   - Rather than widen the RLS policy (which would expose more thread fields
--     than the listing needs), this RPC ships a tightly scoped projection
--     under SECURITY DEFINER and filters explicitly by app_partner_id().
--     Mirrors the pattern of `logistics_partner_accept_rfd` /
--     `logistics_partner_reject_rfd` (0051) which are also SECURITY DEFINER
--     for the partner role.
--
-- Data shape (return columns):
--   thread_id               — for the Accept/Reject mutation body
--   order_id                — parent order (for future deep-link to detail)
--   po_id                   — for the partner-facing display label (text per
--                             0033 / 0001:323 — purchase_orders.id is text,
--                             not uuid; po_id on threads matches that type)
--   customer_name           — primary row identifier the partner reads
--   request_for_delivery_at — when Logistics raised the RFD (sort key)
--   confirm_delivery_date   — what Logistics committed the customer to
--
-- Sort: most recently raised RFD first.
--
-- Index used: 0049's partial index `ost_rfd_pending_idx` on
--   (delivery_partner_id, request_for_delivery_at)
--   WHERE request_for_delivery_at IS NOT NULL
--     AND partner_accepted_at IS NULL
--     AND partner_rejected_at IS NULL
-- — predicate matches the WHERE here exactly.
--
-- STABLE: read-only function, deterministic per snapshot, eligible for
-- planner caching. SECURITY DEFINER bypasses RLS — the WHERE clause is
-- the security gate.
--
-- Permissions: REVOKE all from public, GRANT EXECUTE to authenticated. The
-- function self-filters by `app_partner_id()` so a non-partner caller gets
-- an empty result set rather than a 403; the wrapping Hono route enforces
-- role at the HTTP layer.
--
-- Idempotent: CREATE OR REPLACE FUNCTION + REVOKE / GRANT.

create or replace function public.logistics_partner_rfd_pending()
returns table (
  thread_id               uuid,
  order_id                uuid,
  po_id                   text,
  customer_name           text,
  request_for_delivery_at timestamptz,
  confirm_delivery_date   date
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ost.id   as thread_id,
    ost.order_id,
    ost.po_id,
    o.customer_name,
    ost.request_for_delivery_at,
    ost.confirm_delivery_date
  from order_supplier_threads ost
  join orders o on o.id = ost.order_id
  where ost.delivery_partner_id = public.app_partner_id()
    and ost.request_for_delivery_at is not null
    and ost.partner_accepted_at is null
    and ost.partner_rejected_at is null
  order by ost.request_for_delivery_at desc;
$$;

revoke all on function public.logistics_partner_rfd_pending() from public;
grant execute on function public.logistics_partner_rfd_pending() to authenticated;
