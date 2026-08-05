# Backlog — design decisions pending

## NETS onboarding gap — ✅ RESOLVED 2026-07-19 (works by design)

**Verdict (Jess, 2026-07-19): NOT a data bug. `delivery_partner_id` being all-NULL
is CORRECT — no order has yet reached the confirmed/booked state.** Cancelled the
proposed backfill. The gap was a mis-reading of the business flow, corrected below.

**Business flow (confirmed):** Sales creates order in POS → Portal shows `place`
(customer ordered, no ETA). Customer confirms to the salesperson → salesperson
clicks Proceed → operation confirms the proceed request, which places the PO to
the supplier **and books the logistic partner**. Only at that booking moment does
`delivery_partner_id` get set. NETS must NOT see `place` orders (unconfirmed) or
historical delivered imports — only orders it has actually been booked on.

**Correction to the 2026-07-17 audit note:** `ops_assigned_logistic` is NOT
free-text — it is a `uuid` column with an FK to `delivery_partners.id`
(`orders_ops_assigned_logistic_fkey`), same as `delivery_partner_id`. It holds the
Inbox-triage *tentative* pick at `place`; `delivery_partner_id` holds the *formal
booking* at proceed. The two-column split is intentional, not an accident.

**Data snapshot (2026-07-19, 184 orders):** `delivery_partner_id` 0 filled;
`ops_assigned_logistic` 164 filled — NETS 161, AL 1, TEOW 1, TT 1; 0 unmappable,
0 conflicts. Of NETS's 161: 125 `delivered` (historical), 36 `place` (unconfirmed).
Both buckets correctly invisible to NETS today.

**End-to-end verification (rolled-back txn, no data changed):** ran the real
`operation_confirm_proceed_request_v3(order, NETS)` RPC on a test order as an
operation user, then read the order back through RLS impersonating the NETS partner
login (`role authenticated`, NETS JWT sub):
- Before proceed (dpid NULL): NETS sees **0 rows** (RLS correctly hides it).
- RPC sets `delivery_partner_id` = NETS ✅ and `request_for_delivery_at` ✅, advances
  `confirmed` → `in_production`.
- After proceed: NETS sees **1 row** via the RLS-gated read ✅.

**Conclusion:** the write path and partner RLS both work correctly. Blocker closes
as **"works by design, awaiting real proceed events."** Nothing to build. Once real
orders are proceeded (booked) after go-live, they will surface in NETS's portal
automatically. No backfill, no assignment-flow change.

Owner: Jess. Status: closed — no action required for NETS go-live (~Jul 30).

## NETS RPC workstream — write path for ops_order_control fields

**Deliberately NOT covered by the 2026-07-17 RLS hardening (migrations
0227–0229), which only removes over-broad access.** The spec's core NETS
UPDATE fields — stock ETA (`stock_eta` / `line_etas`), GRN receive
(`line_received` + `ops_stock_items`), customer confirmed date+time
(`customer_confirmed`), and NETS's own logistic remark — all live in
`ops_order_control`, which is internal-only (read AND write) for good reason:
the same row carries storage fees / balance / waivers that NETS must never
see.

Planned shape: narrow per-action SECURITY DEFINER RPCs (mirroring the
`partner_confirm_receive` family), each one:
- gated on `app_role() = 'partner'` + the order's
  `delivery_partner_id = app_partner_id()`,
- writing ONLY its named field(s),
- writing an activity-log entry (guardrail #4),
- with explicit `REVOKE`/`GRANT` per the P8c EXECUTE-grant lesson.

NO blanket partner policy on `ops_order_control`. Blocking: NETS self-service
from ~Jul 30; until then Jess's team keys these fields in.
