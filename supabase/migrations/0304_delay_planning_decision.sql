-- 0304_delay_planning_decision.sql
--
-- C8 · Delay planning — the DECISION, and the gate before the customer
-- (Jess 2026-07-27; the specification is `docs/ORDERS-WORKING-FLOW.md` §3).
--
-- The supplier names a date later than the one we sold. That is NOT yet a
-- delay: we may have the item in ready stock, or another supplier may cover it.
-- So Operations decides FIRST — "can we still make the promised date?" — and
-- only the answer NO opens `Call {logistics} — arrange new delivery date`.
-- **The customer is the last to know, and only when we have tried and failed.**
-- This migration stores that decision and nothing else.
--
-- FIVE columns, all nullable and additive, so every existing row behaves
-- exactly as it does today. No decision recorded = Delay planning opens the
-- moment a supplier date overshoots the promise — which is the state all 55
-- live control rows are in and will stay in until somebody enters a supplier
-- ready date (measured 2026-07-28: `stock_eta` NULL ×55, `line_etas` empty ×55,
-- so 0 orders can reach this flow today; C8 decides the behaviour before the
-- first one appears, exactly as C7 and C9 did).
--
-- `delay_decision_eta` is the load-bearing column, and it is S4's discipline:
-- **an event names the thing it was made ABOUT.** A decision was taken against
-- ONE supplier date. If the supplier slips again, the old decision may not
-- silence the new delay — so the engine compares this snapshot against the
-- CURRENT supplier date and re-opens Delay planning when they differ. Without
-- it, one decision would close every future delay on that order forever, which
-- is the exact shape of bug C5 found in `ops_order_control.balance`: a stored
-- answer that keeps being read long after it stopped being about anything.
--
-- THE PROMISED DATE IS NOT HERE, ON PURPOSE (§3 stage 3, and the card's first
-- invariant). `orders.delivery_date` stays at what was sold — every
-- late / overdue / on-time figure measures against it, so a delay can never be
-- tidied away by pushing the date. The new date the customer agrees goes to the
-- BOOKING (`confirmed_date` + `confirmed_time_slot`), which already exists.
-- There is deliberately no column here that a future chat could mistake for a
-- second promised date.
--
-- `ops_order_control` already carries operation/principal-only write RLS
-- (migration 0159); these columns inherit it. No policy change.

alter table public.ops_order_control
  add column if not exists delay_decision      text,
  add column if not exists delay_decision_eta  date,
  add column if not exists delay_decision_at   timestamptz,
  add column if not exists delay_decision_by   uuid,
  add column if not exists delay_decision_note text;

-- Two answers to one question. The words on screen are their own and live in
-- `docs/COPY-STANDARD.md`: keep = "We can still make the promised date",
-- new_date = "We cannot make the promised date". A third value is refused here
-- so no client can invent a middle answer that the engine has no branch for.
alter table public.ops_order_control
  drop constraint if exists ops_order_control_delay_decision_check;
alter table public.ops_order_control
  add constraint ops_order_control_delay_decision_check
  check (delay_decision is null or delay_decision in ('keep', 'new_date'));

-- A decision with no supplier date to point at cannot be checked against a
-- later slip, so it would silence every future delay on the order. The pair is
-- the record; half of it is worse than none.
alter table public.ops_order_control
  drop constraint if exists ops_order_control_delay_decision_eta_check;
alter table public.ops_order_control
  add constraint ops_order_control_delay_decision_eta_check
  check (delay_decision is null or delay_decision_eta is not null);
