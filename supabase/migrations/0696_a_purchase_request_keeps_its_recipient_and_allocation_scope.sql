-- DRAFT FOR REVIEW. Not a migration, not approved SQL, never applied.
-- Purchasing MASTER5.2 / owner15-17Oct: preserve current rows and current doors.
-- This bounded foundation adds persistent source/allocation scope and approval versions.
-- No RLS change, no transaction backfill, no removal of an old request entry.
-- Constraint replacement below preserves every existing purpose and adds GP only.
-- Recovery: keep the existing application/writers; leave the additive columns and
-- broader purpose checks unused. Do not drop columns or rewrite transaction history.
-- Current production has none of these new fields (read-only schema audit17Oct).
-- Local isolated replay: foundation applied; existing atomic create/configuration/
-- resubmit integration3/3 passed. Full-chain replay has13 pre-existing failures
-- outside this draft (Finance/view fixtures); this is not an all-chain PASS.
-- Foundation only: no application capability is activated by this file.
-- Matching writer/revalidation work is a later scoped migration before form adoption.

begin;
alter table public.purchasing_settings
  add column if not exists purchase_request_normal_days integer not null default 30,
  add column if not exists purchase_request_service_days integer not null default 14,
  add column if not exists po_manual_whatsapp_screenshot_required boolean not null default true;
-- Recipient earliest dates are separate from legacy supplier required-arrival floors.
-- The existing Settings editor/audit door must expose these values before adoption.
alter table public.purchase_requests
  add column if not exists request_context jsonb,
  add column if not exists proceed_date date,
  add column if not exists request_version integer not null default 0,
  add column if not exists approval_scope jsonb,
  add column if not exists approval_version integer,
  add column if not exists submission_key uuid;
create unique index if not exists purchase_requests_submission_key_idx
  on public.purchase_requests (created_by, submission_key)
  where submission_key is not null;
alter table public.purchase_demands
  add column if not exists request_line_id uuid,
  add column if not exists supplier_allocation_id uuid,
  add column if not exists stock_proposal_id uuid,
  add column if not exists fulfilment_kind text not null default 'purchase';
create index if not exists purchase_demands_request_line_idx
  on public.purchase_demands (request_id, request_line_id)
  where request_line_id is not null;

-- These are CHECK constraints, not records. Existing values are all retained.
-- Explicit SQL review must approve these DROP CONSTRAINT statements before execution.
alter table public.purchase_requests drop constraint purchase_requests_purpose_check;
alter table public.purchase_requests add constraint purchase_requests_purpose_check check
  (purpose in ('ready_stock','display','office','warranty','spare_parts',
   'showroom_display','service_case','internal_staff_purchase','subsidiary_purchase',
   'other_purchase','general_purchase'));
alter table public.purchase_demands drop constraint purchase_demands_purpose_check;
alter table public.purchase_demands add constraint purchase_demands_purpose_check check
  (purpose in ('ready_stock','display','office','warranty','spare_parts',
   'showroom_display','service_case','internal_staff_purchase','subsidiary_purchase',
   'other_purchase','general_purchase'));
alter table public.purchase_orders drop constraint purchase_orders_purpose_check;
alter table public.purchase_orders add constraint purchase_orders_purpose_check check
  (purpose is null or purpose in ('customer_sales','ready_stock','display','office','warranty',
   'spare_parts','showroom_display','service_case','internal_staff_purchase',
   'subsidiary_purchase','other_purchase','general_purchase'));

comment on column public.purchase_requests.request_context is
  'Versioned contextual request scope. Full item recipient need is separate from stock proposals and supplier purchase allocations. Proposals are not reservations. Written only by the owning request door.';
comment on column public.purchase_requests.proceed_date is
  'Requester-selected planned purchasing date, distinct from created_at and submitted_at.';
comment on column public.purchase_requests.approval_scope is
  'Immutable approval scope/coverage evidence captured at the owning approval door. NULL is not a verified baseline. Reapproval creates a new recorded version; no baseline is invented for history.';
comment on column public.purchase_demands.request_line_id is
  'Stable original request-item identity, shared by split demand allocations. PO lines retain existing demand_id and receipts retain their existing PO-line link.';
comment on column public.purchase_demands.supplier_allocation_id is
  'Exact supplier-destination-date allocation within request_context; never a physical Unit identity.';
commit;

