-- =============================================================================
-- 0355_finance_names_the_one_thing_that_holds_a_delivery.sql
-- ORDER ROUTE · MONEY GATE CORRECTION — SLICE 1 of the implementation plan
-- (owner ruling 2026-08-16 "decision A"; docs/orders/MASTER.md §8;
--  docs/cards/CARD-2026-08-16-money-gate-correction.md).
--
-- THE RULING THIS SERVES:
--
--   outstanding money does not block the DO
--   an OPEN Finance exception is the ONLY money blocker
--   OPEN     blocks the DO gate
--   CLEARED  removes the block
--   the exception is an explicit Finance-owned record, never a derived
--   balance state
--
-- WHY THE RECORD COMES FIRST, ALONE. Removing money from the gate before this
-- table exists would ship an ungated Delivery Order — a state nobody approved.
-- So this migration builds the blocker and wires it to NOTHING. The gate, the
-- action engine and the canvas are corrected together in Slice 3, in one slice,
-- because a canvas that says "all requirements met" while the server refuses is
-- the screen telling a lie (Architecture Law D) — the very defect PR #825
-- refused to ship, and it is no better pointing the other way.
--
-- THE MODEL: a judgement, not a computation. Opening one is a Finance decision;
-- owing money is a fact. Nothing here reads `orders.paid`, `order_payments`,
-- `ops_order_control.balance` or any storage figure, and nothing may be added
-- later that does — deriving the exception from a balance would rebuild the
-- retired gate under a new name.
--
-- OWNERSHIP (docs/ERP-ARCHITECTURE.md Law A / Law C): Finance creates, changes
-- and clears it and owns its completion evidence. Sales Orders and Delivery
-- READ it to answer the gate; neither writes it, and there is exactly one door
-- onto each act. `finance` already exists in `app_role` (0001) and
-- `requireFinance` already exists in the API — no role and no second guard is
-- invented here.
--
-- CLEARING COSTS EVIDENCE. A block that can be lifted without saying why is the
-- hand-keyed `payment_status` defect this repository already retired once
-- (0347). The constraint, not the UI, is what makes it required.
-- =============================================================================

create table if not exists public.order_finance_exceptions (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete restrict,
  status         text not null default 'open'
                 check (status in ('open', 'cleared')),
  reason         text not null check (btrim(reason) <> ''),
  opened_by      uuid references auth.users(id),
  opened_at      timestamptz not null default now(),
  cleared_by     uuid references auth.users(id),
  cleared_at     timestamptz,
  clear_evidence text,

  -- A cleared exception carries its stamp, and an open one may not pretend to.
  constraint order_finance_exceptions_cleared_stamped
    check ((status = 'cleared') = (cleared_at is not null)),

  -- ⭐ CLEAR EVIDENCE IS REQUIRED, AND THE DATABASE IS WHERE THAT IS TRUE.
  constraint order_finance_exceptions_cleared_evidence
    check (
      (status = 'cleared')
      = (clear_evidence is not null and btrim(clear_evidence) <> '')
    )
);

create index if not exists order_finance_exceptions_order_idx
  on public.order_finance_exceptions (order_id);

-- The gate's only question is "does this order carry an OPEN one?", so that is
-- the index it gets. Deliberately NOT unique: one order may genuinely carry two
-- separate Finance reasons, and inventing a one-at-a-time rule the owner never
-- ruled would be this migration deciding business policy.
create index if not exists order_finance_exceptions_open_idx
  on public.order_finance_exceptions (order_id)
  where status = 'open';

comment on table public.order_finance_exceptions is
  'The ONE money blocker on the Delivery Order (owner ruling 2026-08-16 decision A, 0355). An explicit Finance-owned decision: OPEN blocks the DO gate, CLEARED removes the block, and clearing costs evidence. It is NEVER derived from a balance — an outstanding amount, of any size or age, does not block. Finance alone opens and clears; Sales Orders and Delivery only read. Rows are never deleted.';

alter table public.order_finance_exceptions enable row level security;

-- Everyone internal READS it — the gate, the route and Delivery all need the
-- answer. Nobody writes it directly: both acts go through the DEFINER doors
-- below, which is what makes "Finance, and only Finance" enforceable rather
-- than merely displayed.
drop policy if exists order_finance_exceptions_read_internal
  on public.order_finance_exceptions;
create policy order_finance_exceptions_read_internal
  on public.order_finance_exceptions
  for select using ((select public.is_internal()));

revoke insert, update, delete on public.order_finance_exceptions
  from authenticated, anon;

-- A Finance decision is history. A wrong exception is CLEARED with its reason
-- recorded, never erased.
create or replace function public.order_finance_exceptions_no_delete()
returns trigger
language plpgsql
as $fn$
begin
  raise exception
    'a finance exception is never deleted — clear it with its evidence instead'
    using errcode = 'P0001', detail = 'finance_exception_not_deletable';
end;
$fn$;

drop trigger if exists order_finance_exceptions_no_delete
  on public.order_finance_exceptions;
create trigger order_finance_exceptions_no_delete
  before delete on public.order_finance_exceptions
  for each row execute function public.order_finance_exceptions_no_delete();

-- ── the two doors, and there are only two ────────────────────────────────────

create or replace function public.finance_exception_open(
  p_order_id uuid,
  p_reason   text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role;
  v_row  order_finance_exceptions;
  v_so   int;
begin
  -- The same role gate every Phase 5 finance RPC uses. `principal` is admitted
  -- for the same reason it is admitted there: it is the go-live fallback while
  -- a dedicated finance account does not yet exist.
  v_role := public.app_role();
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'forbidden: only finance can open a finance exception'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if p_order_id is null or p_reason is null or btrim(p_reason) = '' then
    raise exception 'an order and a reason are required'
      using errcode = '22023', detail = 'invalid_input';
  end if;

  select so into v_so from orders where id = p_order_id;
  if v_so is null then
    raise exception 'order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  insert into order_finance_exceptions (order_id, reason, opened_by)
  values (p_order_id, btrim(p_reason), auth.uid())
  returning * into v_row;

  return to_jsonb(v_row);
end;
$fn$;

comment on function public.finance_exception_open(uuid, text) is
  'Finance opens the one thing that holds a delivery (0355). Finance or principal only. The reason is required; nothing about a balance is read or written.';

create or replace function public.finance_exception_clear(
  p_id       uuid,
  p_evidence text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role;
  v_row  order_finance_exceptions;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'forbidden: only finance can clear a finance exception'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if p_id is null or p_evidence is null or btrim(p_evidence) = '' then
    raise exception 'clear evidence is required to lift a finance exception'
      using errcode = '22023', detail = 'evidence_required';
  end if;

  -- Lock the row so two clicks cannot both believe they cleared it.
  select * into v_row
    from order_finance_exceptions
   where id = p_id
     for update;

  if v_row.id is null then
    raise exception 'finance exception not found'
      using errcode = '42P01', detail = 'finance_exception_not_found';
  end if;

  if v_row.status = 'cleared' then
    raise exception 'this finance exception is already cleared'
      using errcode = 'P0001', detail = 'already_cleared';
  end if;

  update order_finance_exceptions
     set status         = 'cleared',
         cleared_at     = now(),
         cleared_by     = auth.uid(),
         clear_evidence = btrim(p_evidence)
   where id = p_id
  returning * into v_row;

  return to_jsonb(v_row);
end;
$fn$;

comment on function public.finance_exception_clear(uuid, text) is
  'Finance clears the block it opened (0355). Finance or principal only. Evidence is required by the constraint as well as by this body, and a cleared exception is never cleared twice.';

revoke all on function public.finance_exception_open(uuid, text) from public, anon;
revoke all on function public.finance_exception_clear(uuid, text) from public, anon;
grant execute on function public.finance_exception_open(uuid, text) to authenticated;
grant execute on function public.finance_exception_clear(uuid, text) to authenticated;
