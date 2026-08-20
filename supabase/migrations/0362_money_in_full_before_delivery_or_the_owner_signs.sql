-- =============================================================================
-- 0362_money_in_full_before_delivery_or_the_owner_signs.sql
-- DELIVERY MONEY GATE + OWNER APPROVAL + COD
-- (owner-approved card docs/cards/CARD-2026-08-19-delivery-money-gate-approval.md;
--  docs/orders/MASTER.md §8 — SUPERSEDES the 2026-08-16 "decision A" ruling.)
--
-- THE RULING THIS SERVES (Jess, 2026-08-19, after a same-day incident — goods
-- delivered, money uncollected, no approval):
--
--   Money in full BEFORE delivery. That is the only default.
--   Operation cannot proceed on its own word. The exception is a recorded
--   approval — black and white in the system, never verbal.
--
--   A Delivery Order issues only when, for the trip's Sales Order:
--     outstanding = 0
--     OR an APPROVED Delivery Payment Approval covers the order
--     AND no OPEN Finance exception (0355 — NOT retired: the second blocker)
--
-- WHAT AN APPROVAL MEANS — COD on the owner's exact terms: the goods travel,
-- the customer may SEE them on the truck, pays the full balance by ONLINE
-- TRANSFER before unloading — no cash; unpaid, the goods do not come down.
--
-- THE MODEL mirrors 0355, the record it stands beside: a REQUEST is raised by
-- Operation or the salesperson with its reason; the DECISION belongs to the
-- configured approver — today Jess only. THE APPROVER LIST IS DATA: `principal`
-- decides (the same go-live fallback every governed door uses), and any
-- position holding the `delivery_payment_approver` duty joins later WITHOUT a
-- code change (`org_position_duties` — the exact mechanism
-- `purchasing_settings_gate` already trusts for the Settings numbers).
--
-- OWNERSHIP (Law A / Law C): Sales Orders owns the record; Operation/sales
-- raise through ONE door, the approver decides through ONE door, everything
-- else only reads. Rows are never deleted and a decision is never re-decided.
--
-- ⭐ THE DATABASE DOOR. The card demands the gate "asserted at the database
-- door, not only the UI": a BEFORE INSERT trigger on `ops_delivery_orders`
-- (0356) — the table EVERY mint path materialises into, including the legacy
-- 0098 dispatch backstop — refuses a document for an order still owing with no
-- approved approval. The GOODS arithmetic here is the same shape `orderMoney`
-- computes (Σ lines + Σ add-ons − paid, keyed-balance fallback for priced-less
-- imports, clamped at zero; an UNKNOWN value never blocks). The chargeable
-- STORAGE fee is deliberately NOT recomputed here: its accrual is date-walked
-- by the one shared arithmetic (`storageHold`, TS) and rebuilding that walk in
-- SQL would be a second arithmetic (Law D). The API gate reads the full figure
-- including storage; this door asserts the goods floor that must hold even if
-- every API path is bypassed.
-- =============================================================================

-- ── the record ───────────────────────────────────────────────────────────────

create table if not exists public.order_delivery_payment_approvals (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete restrict,
  status          text not null default 'pending'
                  check (status in ('pending', 'approved', 'refused')),
  request_reason  text not null check (btrim(request_reason) <> ''),
  requested_by    uuid references auth.users(id),
  requested_at    timestamptz not null default now(),
  decided_by      uuid references auth.users(id),
  decided_at      timestamptz,
  decision_reason text,

  -- A decided row carries its full stamp; a pending one may not pretend to.
  constraint order_delivery_payment_approvals_decided_stamped
    check ((status = 'pending') = (decided_at is null)),

  -- ⭐ THE DECISION RECORDS ITS REASON — black and white, never verbal. The
  -- constraint, not the UI, is what makes it required (the 0355 rule).
  constraint order_delivery_payment_approvals_decision_reasoned
    check (
      (status = 'pending')
      = (decision_reason is null or btrim(decision_reason) = '')
    )
);

create index if not exists order_delivery_payment_approvals_order_idx
  on public.order_delivery_payment_approvals (order_id);

-- The gate's only question is "does this order carry an APPROVED one?".
create index if not exists order_delivery_payment_approvals_approved_idx
  on public.order_delivery_payment_approvals (order_id)
  where status = 'approved';

comment on table public.order_delivery_payment_approvals is
  'The black-and-white door that opens the DO money gate (owner ruling 2026-08-19, 0362). Money in full before delivery is the only default; an APPROVED row here is the one exception, and it means COD: full balance by online transfer BEFORE unloading, no cash. Operation/sales raise, the configured approver (today: principal — Jess; later: any position holding the delivery_payment_approver duty) decides. Append-only: never deleted, never re-decided.';

alter table public.order_delivery_payment_approvals enable row level security;

drop policy if exists order_delivery_payment_approvals_read_internal
  on public.order_delivery_payment_approvals;
create policy order_delivery_payment_approvals_read_internal
  on public.order_delivery_payment_approvals
  for select using ((select public.is_internal()));

revoke insert, update, delete on public.order_delivery_payment_approvals
  from authenticated, anon;

-- A raised request and a recorded decision are history. Never erased.
create or replace function public.order_delivery_payment_approvals_no_delete()
returns trigger
language plpgsql
as $fn$
begin
  raise exception
    'a delivery payment approval is never deleted — the record is the point'
    using errcode = 'P0001', detail = 'payment_approval_not_deletable';
end;
$fn$;

drop trigger if exists order_delivery_payment_approvals_no_delete
  on public.order_delivery_payment_approvals;
create trigger order_delivery_payment_approvals_no_delete
  before delete on public.order_delivery_payment_approvals
  for each row execute function public.order_delivery_payment_approvals_no_delete();

-- ── the approver gate — the list is DATA ─────────────────────────────────────

create or replace function public.delivery_payment_approver_gate()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role   text := (select public.app_role());
  v_duties text[];
begin
  if v_role is null then
    raise exception 'forbidden' using errcode = '42501',
      detail = 'no active account';
  end if;

  if v_role <> 'principal' then
    select coalesce(array_agg(pd.duty_key), '{}'::text[])
      into v_duties
      from app_users u
      join org_position_duties pd on pd.position_id = u.position_id
     where u.id = auth.uid()
       and u.role <> 'dealer'
       and u.status = 'active';

    if not ('delivery_payment_approver' = any(coalesce(v_duties, '{}'::text[]))) then
      raise exception 'forbidden: only the configured approver decides a delivery payment approval'
        using errcode = '42501', detail = 'not_the_approver';
    end if;
  end if;

  return v_role;
end;
$fn$;

comment on function public.delivery_payment_approver_gate() is
  'Who may decide a Delivery Payment Approval (0362). principal (Jess — today the ONLY approver) or any active position holding the delivery_payment_approver duty — the settings-maintained data path for managers to join later without a code change (the purchasing_settings_gate mechanism).';

-- ── the two doors, and there are only two ────────────────────────────────────

create or replace function public.delivery_payment_approval_request(
  p_order_id uuid,
  p_reason   text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role;
  v_row  order_delivery_payment_approvals;
  v_so   int;
begin
  -- Operation and the salesperson raise (card §2); principal may too — the
  -- boss asking is not forbidden by a rule about who must ask.
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation', 'salesperson', 'principal') then
    raise exception 'forbidden: operation or the salesperson raises a payment approval request'
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

  -- One request at a time: a second ask while one waits would only split the
  -- approver's queue. Raising again AFTER a refusal is allowed — it is a new
  -- request, and the refused row stays as history.
  if exists (
    select 1 from order_delivery_payment_approvals a
     where a.order_id = p_order_id and a.status = 'pending'
  ) then
    raise exception 'a payment approval request is already waiting for the approver'
      using errcode = 'P0001', detail = 'request_already_pending';
  end if;

  insert into order_delivery_payment_approvals (order_id, request_reason, requested_by)
  values (p_order_id, btrim(p_reason), auth.uid())
  returning * into v_row;

  return to_jsonb(v_row);
end;
$fn$;

comment on function public.delivery_payment_approval_request(uuid, text) is
  'Operation or the salesperson raises the ask (0362). Reason required; changes nothing else — a raised request opens no gate. One pending request at a time; a refused one may be raised again as a new row.';

create or replace function public.delivery_payment_approval_decide(
  p_id       uuid,
  p_decision text,
  p_reason   text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row order_delivery_payment_approvals;
begin
  perform public.delivery_payment_approver_gate();

  if p_id is null
     or p_decision is null
     or p_decision not in ('approved', 'refused') then
    raise exception 'the decision is approved or refused'
      using errcode = '22023', detail = 'invalid_decision';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'the decision records the approver''s reason — black and white'
      using errcode = '22023', detail = 'reason_required';
  end if;

  -- Lock the row so two clicks cannot both believe they decided it.
  select * into v_row
    from order_delivery_payment_approvals
   where id = p_id
     for update;

  if v_row.id is null then
    raise exception 'payment approval request not found'
      using errcode = '42P01', detail = 'payment_approval_not_found';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'this request is already decided — a decision is never re-decided'
      using errcode = 'P0001', detail = 'already_decided';
  end if;

  update order_delivery_payment_approvals
     set status          = p_decision,
         decided_at      = now(),
         decided_by      = auth.uid(),
         decision_reason = btrim(p_reason)
   where id = p_id
  returning * into v_row;

  return to_jsonb(v_row);
end;
$fn$;

comment on function public.delivery_payment_approval_decide(uuid, text, text) is
  'The approver''s word (0362): approved opens the money gate for this order''s DOs — COD on the owner''s terms; refused keeps it shut. Approver = principal or the delivery_payment_approver duty (data). Reason required; one decision, forever.';

revoke all on function public.delivery_payment_approval_request(uuid, text) from public, anon;
revoke all on function public.delivery_payment_approval_decide(uuid, text, text) from public, anon;
grant execute on function public.delivery_payment_approval_request(uuid, text) to authenticated;
grant execute on function public.delivery_payment_approval_decide(uuid, text, text) to authenticated;

-- ── ⭐ the database door on the DO mint ──────────────────────────────────────
-- Every path that mints a document materialises a row here (0356) — the API
-- mint, a future split-trip door, and the legacy 0098 dispatch backstop. This
-- is therefore the one place the money law binds EVERYTHING.

create or replace function public.ops_delivery_orders_money_gate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_priced   numeric;
  v_paid     numeric;
  v_keyed    numeric;
  v_owing    numeric;
begin
  -- The same shape as the shared `orderMoney` rule, goods side:
  --   priced lines win; a priced-less import falls back to the hand-keyed
  --   outstanding (0165 — already an outstanding, so paid is NOT subtracted
  --   again); neither → UNKNOWN, and unknown never blocks (§8).
  select coalesce(sum(l.qty * l.unit_price), 0)
    into v_priced
    from order_lines l
   where l.order_id = new.order_id and l.unit_price is not null;
  select v_priced + coalesce(sum(a.qty * a.unit_price), 0)
    into v_priced
    from order_addons a
   where a.order_id = new.order_id and a.unit_price is not null;

  select greatest(0, coalesce(o.paid, 0)) into v_paid
    from orders o where o.id = new.order_id;

  if v_priced > 0 then
    v_owing := greatest(0, v_priced - v_paid);
  else
    select c.balance into v_keyed
      from ops_order_control c where c.order_id = new.order_id;
    v_owing := greatest(0, coalesce(v_keyed, 0));
  end if;

  if v_owing > 0 and not exists (
    select 1 from order_delivery_payment_approvals a
     where a.order_id = new.order_id and a.status = 'approved'
  ) then
    raise exception
      'RM % is still outstanding — collect it in full, or request a payment approval (owner ruling 2026-08-19: money in full before delivery)',
      to_char(v_owing, 'FM999,999,990.00')
      using errcode = 'P0001', detail = 'delivery_money_gate';
  end if;

  return new;
end;
$fn$;

comment on function public.ops_delivery_orders_money_gate() is
  'The database door of the 2026-08-19 money gate: no DO document may be born while the order''s goods money is outstanding and no APPROVED Delivery Payment Approval exists. Goods arithmetic mirrors orderMoney (priced lines, keyed-balance fallback, unknown never blocks); the storage fee''s date-walked accrual stays in the one shared TS arithmetic and is asserted by the API gate (Law D).';

drop trigger if exists ops_delivery_orders_money_gate on public.ops_delivery_orders;
create trigger ops_delivery_orders_money_gate
  before insert on public.ops_delivery_orders
  for each row execute function public.ops_delivery_orders_money_gate();
