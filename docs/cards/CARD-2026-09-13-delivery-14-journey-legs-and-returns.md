# DELIVERY — CARD 14 · Journey legs and returned-goods handling

> Module **DELIVERY** · Card **14** · authored 2026-09-13 under the BUILD/DELIVERY takeover of the
> owner-approved Delivery Blueprint (PR #1255, #1256). Steps use checkbox syntax for tracking.

**Goal:** Issue and result a Delivery Order per Journey leg, receive returned goods after a failed trip through Inbound as `Check required`, and admit leg rows to the Warehouse schedule feed.

**Authority:** `docs/delivery/MASTER.md` §1.1, §3.1, §4, §7, §13.3, §14.1 · `docs/stock/MASTER.md` §5, §12.6, §12.8 · `docs/ERP-ARCHITECTURE.md` §3.5.1, §6.2. The approved MASTER decides the design; this Card adds no design of its own.

**Dependencies:** Cards 10, 13.

**Runtime readers and writers affected:** Writers: `apps/api/src/lib/delivery-order-issue.ts` per-leg mint, `delivery_attempt_record` per leg, the returned-goods Inbound source; readers: the Warehouse schedule feed, Outbound, Monitor leg rows.

**Migrations required:** yes: leg binding on `ops_delivery_orders` and `delivery_attempts`; the returned-goods arrival source.

**Production acceptance surface:** Production: a Singapore order shows two leg rows with their own partner, day, DO and result; a failed trip's goods appear in Inbound as `Check required`; the schedule feed carries the leg.

## Global constraints

- Reuse existing Carres components, arithmetics and write doors; no duplicate quantity, owner, duty, date, payment or stock truth.
- Every visible word comes from `docs/COPY-STANDARD.md`; dates through `fmtDate`; no em dash joins a Delivery Work sentence.
- No `New DO`, `Issue`, `Release` or `Approve` control; no new payment exception or COD door; no Delivery-local roster; no Operations Superuser fallback.
- Loading, error, empty and no-results states, keyboard and focus, responsive behaviour, permissions and proxy-recording boundaries are tested.
- A Card is complete only after PR merge, exact-SHA deployment and authenticated production verification with the resulting records re-read.

## Tasks

- [x] Per-leg DO issuance through the one path; per-leg results — 0491: `ops_delivery_orders.leg` (one live document per scope), `delivery_attempts.leg`, `delivery_leg_document_mint`, `delivery_attempt_record(p_leg)` admitting an intermediate leg's arrival; `attemptLegDocumentIssue` (same gate, number seeded on order + leg) hooked on the leg arrangement save; the one-live-claim guard re-read per order; Monitor leg rows carry the leg document and the shared ladder; the DO object prints `Route` and offers `Arrived` on an intermediate leg
- [x] Returned-goods receipt as an Inbound arrival source — 0490 lands the Stock draft (`arrival_sources`, units, events, `receiving_arrival_post`…) with `attempt_id`; the attempt door plans ONE `Failed Delivery return` arrival for the visit's undelivered reserved Units; Inbound names it `DO No`; the immediate inspection hold is retired
- [x] Leg rows in the Warehouse schedule feed and Outbound — the feed admits a leg whose own document exists (matched by (order, leg)); Outbound reads the same feed; the feed's delivery door is the Monitor row (Edit Delivery retired)
- [x] Tests, probes, typecheck, design guard — targeted tests green (shared · api · web); full suites green (the migration-gate baseline was the one red, fixed by merging main); tsc ×3 clean; `pnpm --filter web lint` clean; rolled-back `begin;…rollback;` probe of 0490+0491 passed with negative controls (money gate fires on a leg document; a leg outside the Journey is refused; scope Units required on every leg; the failed-visit arrival binds `attempt_id` and names the DO)
- [x] PR → merge → apply → deploy → authenticated production verification — PR #1270 squash-merged `d78b4e26`; **0490** and **0491** applied through the governed path 2026-09-13 (ledger tail); deploy converged (`erp` · `pages.dev` `/__carres_deploy.json` and the Worker `/health` each report `d78b4e263ff87e2a1a0954cf491f0781e1856278`); walked as operation@carres.com — see Evidence. **Partial:** the leg document mint, the leg arrival result and the returned-goods arrival are proven by the rolled-back probe only (below)

## Evidence — production walk 2026-09-13 (operation@carres.com)

Production held **no Journey order** (0 rows with `delivery_stops`), so two fully-paid test orders
were given a two-leg chain through `set_delivery_chain` (NETS `Carres Klang Warehouse → JB transit
warehouse`, then AL `JB transit warehouse → Customer (Singapore)`): SO-1209 (`f72f2450-…`) and
SO-1282 (`d2544b01-…`); their requested day was moved to 2026-09-16 so a confirmed day would not
trip the later-date proof rule.

- **Monitor leg rows — VERIFIED.** `?tab=delivery&view=all&q=1282` prints two rows for SO-1282,
  each with its own route, partner and ladder: `Confirmed for Tue, 15 Sep 10 AM to 1 PM · SO-1282 ·
  Carres Klang Warehouse → JB transit warehouse · … · Confirmed Tue, 15 Sep · 10 AM to 1 PM · NETS ·
  Not ready · Arriving after the requested date · Paid · No delivery order yet` and `AL must
  contact the customer · SO-1282 · JB transit warehouse → Customer (Singapore) · … · Not confirmed ·
  Call by Sat, 12 Sep · AL · Not ready · … · Paid · No delivery order yet`. No `Leg` word anywhere.
- **Per-leg arrangement — VERIFIED.** `PUT /api/operation/delivery-arrangements/{order}?leg=1`
  (NETS, 2026-09-15, `10 AM to 1 PM`) → 200; `ops_delivery_arrangements` now holds `(order, leg 1)`
  rows `d7b2cba2-…` (SO-1209) and `a1ee7e1c-…` (SO-1282) beside SO-1282's untouched leg 0 row.
- **Leg document held by the ONE gate — VERIFIED as a refusal.** Both saves returned
  `deliveryOrder: null`: the leg issue runs the same goods/money gate as the whole-order document,
  and neither test order has its goods reserved (the whole-order backstop names it: *Goods not
  reserved to this order yet: TELLUC-1S — reserve them, or book a second trip*). No paid test order
  in production has reserved Units (2 reserved Units exist in the whole register), so the mint could
  not be exercised live. `ops_delivery_orders` still holds no leg document.
- **NOT walked live (probe-proven only):** `delivery_leg_document_mint`, the intermediate leg's
  `Arrived` result through `delivery_attempt_record(p_leg)`, and the `Failed Delivery return`
  arrival into Inbound. Each passed the rolled-back probe with its negative controls before merge.

🟡 **Follow-up (Law 4):** the leg arrangement save swallows the gate's reasons (`deliveryOrder:
null`) and the Monitor row reads only `No delivery order yet`. Fix: return the blocked reasons from
the PUT hook and print them on the leg row's brief exactly as the whole-order `Delivery Order`
panel prints them — one gate, one set of words.

### Walk continuation — the governed fixture SO-1362 (2026-09-13)

A fully governed fixture was built through the normal doors, nothing faked: `POST /api/orders/raw`
(dealer Carres Kelana Jaya · customer signature uploaded to `orders-attachments` · terms accepted ·
RM 1,200 paid in full · JAGER-SS ×1 · address, State, building type, floor, lift, requested date
2026-09-18) → `POST /api/orders/{id}/proceed` → `POST …/ready-stock/reserve` (Unit
`id-dtd627907`) → `PUT …/delivery-chain` (NETS `Carres Klang Warehouse → JB transit warehouse`,
AL `JB transit warehouse → Customer (Singapore)`) → `PUT …/delivery-arrangements/{id}?leg=1`.
The leg 1 save issued **DO-130926-0842** through the one gate (`deliveryOrder: {issued: true}`):
`ops_delivery_orders.leg = 1`, NETS, Tue 15 Sep · 10 AM to 1 PM, `delivery_order_units` holds
exactly `id-dtd627907`, History `DO-130926-0842 issued for leg 1 · Carres Klang Warehouse → JB
transit warehouse`, `orders.do_number` left null (only the customer leg mirrors). Monitor prints
`Waiting for NETS pickup · SO-1362 · Carres Klang Warehouse → JB transit warehouse · … · Ready 1 of
1 · Paid · DO-130926-0842` and `AL must contact the customer · … · No delivery order yet`.

🔴 **Found and fixed — 0494.** `ready_for_handover`, `scanned`, `checked`, `packed` recorded on the
leg document, but `handed_over` refused with `partner_holder_not_recorded`: the handover door
(0424/0440) resolved the goods-holder from the arrangement at **leg 0**, so a Journey leg's document
could never hand over. **0494** re-creates `delivery_handover_record` reading the DOCUMENT's own
scope (`a.leg = coalesce(v_do.leg, 0)`); a whole-order document is unchanged. Rolled-back probe on
DO-130926-0842: `handed_over` OK (accepted 1 of 1, counterparty NETS, holder → NETS Delivery),
`received_by_logistics` OK, a second handover of the same Unit REFUSED (`unit_already_handed_over`).
The SO-1361 fixture created without a signature was cancelled through the cancel door and its
reservation released through the release door.
