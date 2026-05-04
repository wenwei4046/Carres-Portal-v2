-- =============================================================================
-- 0033_order_supplier_threads.sql -- Phase 4 v3-S4
-- =============================================================================
-- Source spec: docs/superpowers/specs/2026-05-04-phase-4-v3-spec.md §4.4 (table)
--              + §6.4 (Bug 7 race guard rationale)
-- Sprint:      v3-S4 (threads + RPCs v3)
-- Bug fixes:
--   - Codex Bug 1 (2026-05-04): po_id is TEXT, not uuid -- purchase_orders.id
--     is text in this schema. Original draft had uuid which would have errored
--     on first FK validation.
--   - Codex Bug 7 (2026-05-04): race guard. Two Logistics users press Auto-fill
--     simultaneously -> both submit logistics_create_pos_batch with overlapping
--     thread sets -> without the v3-S4 RPC's SELECT ... FOR UPDATE on threads,
--     two POs claim the same thread. The RPC (lands in 0034) is the primary
--     guard; the UNIQUE (order_id, supplier_id, category) constraint here
--     provides table-level identity (one thread per supplier-category per
--     order) so the RPC's FOR UPDATE has stable rows to lock.
--
-- Why this migration:
--   v3 splits a customer order into per-(supplier, category) threads. Each
--   thread has its own logistics_stage progression following the SOP for that
--   pair (SOP_STANDARD or SOP_SOFA_SPECIAL -- see packages/shared/src/sops.ts).
--   orders.logistics_stage becomes a coarse rollup computed from these threads
--   (rollup function lands in v3-S5 / migration 0035).
--
--   Routing matrix recap (spec §4.4):
--     Customer order #100 (1xsofa, 1xbedframe, 1xmattress)
--       -> 3 threads after confirm_proceed_request:
--          (HoOKkA  / sofa)     -> SOP_SOFA_SPECIAL
--          (HoOKkA  / bedframe) -> SOP_STANDARD
--          (Nice Future / mattress) -> SOP_STANDARD
--
-- Idempotency: CREATE TABLE IF NOT EXISTS, indexes IF NOT EXISTS, all policies
--   wrapped DROP IF EXISTS + CREATE. Trigger guarded the same way.
--
-- Auth helpers (existing in 0002_rls.sql:18-40):
--   - public.app_role()        STABLE SECURITY DEFINER -> app_role
--   - public.app_partner_id()  STABLE SECURITY DEFINER -> uuid
--   - public.app_dealer_id()   STABLE SECURITY DEFINER -> uuid
--   Per CLAUDE.md §8 Fix 2 every helper call is wrapped (select fn()) for
--   InitPlan caching. Per Fix 3 helpers are STABLE.
-- =============================================================================

-- 1. Table.
create table if not exists order_supplier_threads (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id) on delete cascade,
  supplier_id     uuid not null references suppliers(id),
  category        text not null,                 -- 'mattress' | 'bedframe' | 'sofa' (matches product_category enum)
  sop_name        text not null,                 -- 'STANDARD' | 'SOFA_SPECIAL'
  logistics_stage logistics_stage not null,
  -- po_id is TEXT (matches purchase_orders.id which is text -- Codex Bug 1).
  po_id           text references purchase_orders(id),
  warehouse_id    uuid references warehouses(id),
  reserved_at     timestamptz,
  delivered_at    timestamptz,
  history         jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Identity: one thread per (order, supplier, category). Confirms the RPC's
  -- SELECT ... FOR UPDATE has a stable row to lock when a thread is claimed.
  unique (order_id, supplier_id, category)
);

-- 2. Indexes.
create index if not exists ost_order_idx          on order_supplier_threads(order_id);
create index if not exists ost_supplier_stage_idx on order_supplier_threads(supplier_id, logistics_stage);
create index if not exists ost_po_idx             on order_supplier_threads(po_id) where po_id is not null;

-- Race guard documentation (Codex Bug 7):
--   The primary race guard lives in the RPC layer (logistics_create_pos_batch
--   v3 extension in 0034): SELECT ... FOR UPDATE on candidate thread rows
--   inside a transaction, plus a re-check that po_id IS NULL after the lock
--   acquires. SQLSTATE 40001 (serialization_failure) bubbles up to the Hono
--   layer as 409 Conflict. See spec §6.4. We do NOT add a partial unique
--   index on (po_id, ...) here because:
--     a. UNIQUE (order_id, supplier_id, category) above already prevents two
--        threads representing the same supplier-category for one order.
--     b. RPC FOR UPDATE locks rows during PO insert; READ COMMITTED isolation
--        (Supabase default) is sufficient for the no-double-claim invariant.
--     c. Adding a (po_id, ...) partial unique index would only protect against
--        non-RPC writers that bypass the SECURITY DEFINER path -- none planned.

-- 3. RLS.
alter table order_supplier_threads enable row level security;

-- 3a. Logistics + principal: full read.
drop policy if exists ost_logistics_read on order_supplier_threads;
create policy ost_logistics_read on order_supplier_threads
for select to authenticated
using (
  (select public.app_role()) in ('logistics', 'principal')
);

-- 3b. Partner: read threads on POs assigned to their company.
drop policy if exists ost_partner_read on order_supplier_threads;
create policy ost_partner_read on order_supplier_threads
for select to authenticated
using (
  (select public.app_role()) = 'partner'
  and exists (
    select 1
      from purchase_orders p
     where p.id = order_supplier_threads.po_id
       and p.delivery_partner_id = (select public.app_partner_id())
  )
);

-- 3c. Dealer: read threads of their own orders (for order detail view).
drop policy if exists ost_dealer_read on order_supplier_threads;
create policy ost_dealer_read on order_supplier_threads
for select to authenticated
using (
  exists (
    select 1
      from orders o
     where o.id = order_supplier_threads.order_id
       and o.dealer_id = (select public.app_dealer_id())
  )
);

-- 3d. Writes: only logistics role; SECURITY DEFINER RPCs bypass RLS for
--     service-side mutations (proceed_request split, PO claim, stage advance).
drop policy if exists ost_logistics_write on order_supplier_threads;
create policy ost_logistics_write on order_supplier_threads
for all to authenticated
using (
  (select public.app_role()) = 'logistics'
)
with check (
  (select public.app_role()) = 'logistics'
);

-- 4. Trigger: keep updated_at fresh on every UPDATE.
create or replace function order_supplier_threads_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists ost_set_updated_at on order_supplier_threads;
create trigger ost_set_updated_at
before update on order_supplier_threads
for each row execute function order_supplier_threads_set_updated_at();
