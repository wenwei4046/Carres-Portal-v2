# Delivery execution queue — ONE CARD PER CHAT (locked with Jess 2026-07-26)

> **How to use (Jess):** open a NEW chat, paste exactly this:
> "Read `docs/delivery-execution-queue.md`. Do card T<n> ONLY. Do not touch any other card.
> Do not redesign anything marked ALREADY EXISTS."
> One card = one PR = one deploy. When a card ships, mark it ✅ here with the PR number.
>
> **Why this doc exists:** every fresh AI chat self-invents and forgets. This doc removes the
> room to invent. Each card says what EXISTS (never rebuild), what to TOUCH, and DONE WHEN.
> The concepts come from Jess's delivery design conversation (2026-07-26); the sequence starts
> from the Order panel because that is where operators live today.

## Ground truth (read before ANY card — 30 seconds)

- **D1 two-stage booking is LIVE** (PR #360, migration 0277). `ops_order_control` carries
  `booking_stage` (`none|provisional|confirmed`), `confirmed_date`, `confirmed_time_slot`,
  `customer_confirmed_at/by`. Provisional derives from `logistic_eta` by DB trigger.
  `POST /api/operation/orders/:id/booking/confirm` is the ONE door to confirmed, with
  server-side gates (goods reserved + balance collected + no Sunday) via shared
  `bookingConfirmGate` in `packages/shared/src/booking-gate.ts`.
- **Next-action ladder is LIVE** in `apps/web/src/pages/operation/OperationOrdersControl.tsx`
  (~line 519-700): `Collect $ > Supplier overdue > No PO > Waiting stock > Assign logistic >
  Chase logistic > Call customer > Schedule delivery > Done`. ONE action per row, auto-computed.
- **PayHold is LIVE**: customer owing money suppresses delivery actions behind 🔒 Collect $.
- **Drawer booking UI is LIVE**: `OrderDetailDrawer.tsx` ~4553 — amber "not confirmed ·
  carrier said 23 Aug" / green "confirmed 23 Aug · 12pm–3pm" + `Confirm with customer` flow.
- Copy law: `docs/COPY-STANDARD.md`. Design law: `docs/UI-KIT.md`. Never leak DB stage words.
- Deploy law: merge to main first, deploy from main tip, both Pages projects, re-curl 4 canonicals.

---

## T1 · Delivery column tells the booking truth ✅ (PR #363)

**Concept (Jess):** the list column must never say "Unscheduled". It says WHO + WHEN + slot,
and whether the customer actually confirmed.

**Goal:** orders LIST rows + queues read `booking_stage` (they still key on old signals —
D1 explicitly left them out).

- Confirmed → `NETS · 27 Jul · 9–11 AM` (green tone — this is the ONLY green)
- Provisional → `NETS · carrier said 27 Jul` (amber — carrier's word is not the customer's yes)
- Partner assigned, no date → `NETS · need booking`
- No partner → existing `Assign logistic` stays as-is

**ALREADY EXISTS — do not rebuild:** booking data (0277), the drawer chip, the confirm endpoint.
**Touch:** `OperationOrdersControl.tsx` list row + queue predicates; control payload already
rides the list API — verify before adding any endpoint.
**No migration. Web-only expected.**
**Done when:** no row anywhere renders "Unscheduled"/"Not booked"; a provisional row can never
render green; queue counts match the drawer's stage.

## T2 · Actions speak human (verb + object + reason) ✅ (PR #367)

**Concept (Jess):** a new staff must know the next second's action without training. No ERP
abbreviations — POD is banned.

**Goal:** rename ladder + drawer action labels:

- `Assign logistic` → `Assign logistic` (keep — already a verb)
- `Call customer` → `Call customer (book delivery)`
- ladder's `Schedule delivery` → `Call customer (book delivery)` (merge if same act)
- any POD string → `Upload delivery photo`
- delay case (T3 will add) reserves `Call customer (stock delay)`

**Touch:** label maps in `OperationOrdersControl.tsx` (~519-700) + drawer strings +
`docs/COPY-STANDARD.md` (add the naming rule: verb + object + (reason); no abbreviations).
**No migration. Copy-only.**
**Done when:** every visible action is a doable act; COPY-STANDARD carries the rule.
**Shipped note (PR #367):** the ladder's `Call customer` / `Schedule delivery` rungs did not
exist anymore — the C-vocab rewrite (2026-07-19) had already merged them into
`Assign logistic / Chase logistic / Confirm`, so the ladder needed zero renames. The live
`Call customer` string was the drawer follow-up preset (now `Call customer (book delivery)`);
every visible POD string (partner upload dialog + hints) now says "delivery photo";
COPY-STANDARD carries the naming law + the reserved labels for T3/T6.

## T3 · Delay Radar — catch the miss BEFORE the window ✅ (PR #370)

**Concept (Jess, the Golden Rule):** delivery risk is not "is stock here today"; it is
"can the LATEST stock ETA still honour the customer's delivery date". If supplier ETA is
18 Aug and customer window ends 15 Aug, the system already knows on 1 Aug — the action must
flip to `Call customer (stock delay)` NOW, not show overdue on 16 Aug.

**Goal:** new ladder rule, inserted above `Call customer (book delivery)`:
`latest stock ETA (max over this order's open PO/thread ETAs) > customer delivery date`
→ next action = `Call customer (stock delay)` (red/amber tone).

**ALREADY EXISTS:** PO/thread ETAs; order delivery deadline; the ladder itself.
**Touch:** ladder computation (web, or the order-control API payload if ETAs don't ride it yet).
**Likely no migration** — computed at read. If a "customer informed" acknowledgement is wanted,
that is T4's reason write, not a new column here.
**Done when:** an order whose ETA overshoots its date shows `Call customer (stock delay)`
while the date is still in the future; delivered/completed orders never show it (guardrail #2).
**Shipped note (PR #370):** web-only, no migration — ETAs already ride the list payload
(`ops_order_control.line_etas`). The rung sits INSIDE the stock track: above `Chase supplier`
(chasing can't save a certain miss) but below `Order PO` (raising the PO stays the real
unblock) and below the LOCKED past-deadline `Chase logistic` escalation (freeze gate
2026-07-12 — post-deadline behaviour unchanged; the radar's job is BEFORE the window).
Strict overshoot only (ETA > date; ETA ON the date is not a delay); TBD dates / missing
ETAs stay silent. The verb also joined the QUEUES rows (C-vocab: counts match the NEXT
column by construction), danger tone, PIC chip.

## T4 · Reason Library v1 (structured, no free text) ✅ (PR #377)

**Concept (Jess):** staff pick facts, never write essays. Every reason has a hidden category
so the dashboard can later say "42% of delays are customer-side".

**Goal:** ONE shared constant `DELIVERY_REASONS` in `packages/shared` (label + category), wired
into the FIRST consumer only: the existing postpone/reschedule action in the drawer
(0196 one-time extension). Reasons v1 (culled to what really happens):

- customer: `Customer requested reschedule` · `Customer renovation` · `Customer requested hold`
  · `Customer unreachable`
- stock: `Stock not ready`
- payment: `Waiting balance payment` · `Waiting storage fee`
- logistic: `Driver unavailable` · `Vehicle breakdown` · `Logistic capacity full`
- site: `Condo approval required` · `Lift booking required`

Each reason ALSO carries a hidden `responsibility: 'customer' | 'carres' | 'external'`
(customer-category → customer; stock/logistic → carres; site → external). Not shown to staff.
This is what later lets the storage-fee rule say "customer delay starts the storage clock,
Carres delay never charges" and lets the dashboard split delay causes — without a second tagging
pass. Costs one field now, saves a re-tag of history later.

**Touch:** `packages/shared` constant + the reschedule write path stores `reason_key`
(ride an existing attrs/jsonb column if one fits; a migration ONLY if nothing fits — and then
one nullable column, nothing more) + drawer dropdown replaces/augments free text.
**Done when:** a reschedule cannot be saved without a reason; reasons land in activity history.
**Shipped note (PR #377):** ZERO migration — `reason_key` rides the existing
`ops_order_control.extension_reason` text column (0196, no CHECK on it); legacy
Renovation/Traveling/Others rows display as-is via `deliveryReasonLabel` passthrough.
The card left the payment category's responsibility unmapped → assigned **customer**
(waiting for the customer's money starts the storage clock). Activity: the 0211 trigger
doesn't watch extension columns, so the extend route appends
"Delivery postponed → 20 Aug 26 · {reason}" through the existing
`operation_add_annotation` SECURITY DEFINER door, fail-soft. Dropdown has NO default
(a silent default would record a wrong fact); note became an optional detail for ANY
reason — the required-if-Others rule died with Others. `DELIVERY_REASONS` lives in
`packages/shared/src/delivery-reasons.ts`, ready for T7's queues + the future dashboard.

## T5 · Booking progress spine in the drawer (read-only)

**Concept (Jess):** staff see WHERE the delivery is in 3 seconds — a checklist, not a status word.

**Goal:** small read-only checklist in the drawer's delivery block, each tick DERIVED from
existing signals (no new writes):

```
✓ Logistic assigned        (partner set)
✓ Customer confirmed        (booking_stage = confirmed)
□ Delivery order issued     (DO signal — if absent today, row shows "later" greyed)
□ Delivered                 (delivered signal)
□ Delivery photo            (T6 — greyed until T6 ships)
```

**Touch:** `OrderDetailDrawer.tsx` delivery block only. **No migration. Web-only.**
**Done when:** ticks agree with the chip/column for the same order, always.

## T6 · Delivery photo (the artifact — needs a migration)

**Concept (Jess):** every completed delivery has proof: photo (+ optional signature/remark).
Named "delivery photo" everywhere — POD stays banned.

**Goal:** upload from drawer once delivered; Storage bucket; `delivered_at` + photo path
columns (one additive migration — check remote tracker tail FIRST, guardrail #8).
**Done when:** a delivered order can attach ≥1 photo; T5's last tick goes live; activity logs it.

---

## Road ahead — T7-T11 (locked with Jess 2026-07-27; the queue ENDS at T11)

The T-series is ELEVEN cards total. T1-T6 finish the delivery lifecycle INSIDE the order
panel. T7-T11 build it OUT into a standalone Delivery capability. Same law: one card, one
chat, one PR, one deploy, in this order. Detail for each lives in the LATER entry it
promotes — the implementing chat reads BOTH this card and its L-entry.

## T7 · Queue split + auto-overdue (promotes L1)

Real queues: `Assign logistic / Confirm booking / Deliver today / Upload delivery photo`,
each with its own deadline relative to the confirmed date so items turn overdue by
themselves. Needs T1-T6 signals — that is why it waits for them.

## T8 · Delivery groups / partial delivery (promotes L7) — ✅ RULING RECEIVED, unblocked

**Jess's ruling (2026-07-27, verbatim confirmed):** mattress + bed frame = together (HARD,
never split) · sofa = prefer together but MAY go as a second trip (SOFT — ASK the customer
wait-vs-split, never auto-split) · pillow / mattress protector NEVER block a delivery
(back-order them). Build: the confirm gate learns delivery groups (accessory lines stop
blocking); a sofa split creates a second booking on the same SO via the
"confirm delivery preference with customer" flow.

## T9 · Logistic partner profiles (promotes L6)

Working days · blackout dates · daily capacity · booking lead time — and the confirm flow
warns when an operator books a date the partner cannot honour. First real consumer of
partner rules; the working-day util (L3) ships inside this card or T10, whichever needs it
first.

## T10 · Delivery calendar as single source (promotes L2)

Today / Tomorrow / This week views reading the SAME booking fields — never a second store.
Partner capacity from T9 shows on the day.

## T11 · Delivery module page (promotes L5) — the LAST card

The 3-pane standalone module per `docs/delivery-module-proposal.md` (LOCKED 2026-07-22
with Jess). By T11 every signal, queue, reason and profile already exists — this card is
ASSEMBLY, not invention. After T11: two weeks of live usage writes the fix list; nothing
else is planned past T11 on purpose.

---

## LATER (no card number = not planned; listed so no chat reinvents them)

- **L1 Queue split → PROMOTED TO T7** — `Assign logistic / Confirm booking / Issue DO /
  Deliver today / Upload delivery photo` as real queues (needs T1-T3 signals stable first).
  Each step gets its own
  deadline relative to the confirmed date (assign ≥3 working days before · confirm ≥1-3 days
  before · delivery order 1 day before · photo same/next day) so a queue item can turn
  overdue BY ITSELF — no human watching required.
- **L2 Delivery calendar → PROMOTED TO T10** (reads the same booking fields; never a second store).
- **L3 Working-day calendar engine** (condo Sat 0.5d etc.) — ships INSIDE T9 or T10,
  whichever needs it first, as a shared util, NOT an admin page. Not its own card.
- **L4 Multi-leg surfacing** — `delivery_stops` jsonb exists; UI in `DeliveryChain.tsx`.
- **L5 Delivery module page (3-pane) → PROMOTED TO T11** — `docs/delivery-module-proposal.md` (LOCKED 2026-07-22);
  the 6-step lifecycle maps INTO its 3 tabs; not a conflict, do after T-series.
- **L6 Logistic partner profiles → PROMOTED TO T9** — per-partner rules the booking flow will eventually read:
  working days (Sat half/full), blackout dates ("truck maintenance 15-18 Feb"), daily capacity
  ("NETS max N drops/day"), booking lead time ("needs 2 working days notice" → warn when an
  operator confirms a date the partner cannot honour). Today partners are bare rows; build the
  fields WITH the first consumer (likely L1's deadlines or L2's calendar), not as an admin page
  up front.
- **L7 Delivery groups / partial delivery → PROMOTED TO T8 — NEEDS A JESS RULING BEFORE ANY BUILD.**
  The business rule from Jess's design conversation: mattress + bed frame = ONE delivery
  (hard, never split) · sofa = prefer together but may go as a second trip · accessories
  (pillow/protector) NEVER block a delivery, back-order them. Today's `bookingConfirmGate`
  enforces the STRICTEST version — every goods line reserved or no confirm — so a missing
  RM39 pillow currently blocks a RM5,000 bed delivery. The first bite will be exactly that.
  When it bites: (1) Jess rules which categories may lag, (2) the gate learns delivery groups,
  (3) a split creates a second booking on the same SO ("confirm delivery preference with
  customer" flow — ASK the customer wait-vs-split, never auto-split).
- **NOT delivery, parked elsewhere:** Ready-stock planning (inventory proposal) · Receiving/
  Claim module (purchase v2 + 2990s list) · Service case wizard (own initiative) · Business
  Rules admin page (rules ship with the phase that needs them — standing decision) · Payment
  reminder schedule 7/3/1 days (Payments Collections Desk owns it; its "催钱前先看货" rule
  already implements "never chase payment for an undeliverable order").

## Status

| Card | Status | PR |
|---|---|---|
| T1 | ✅ shipped 2026-07-26 | #363 |
| T2 | ✅ shipped 2026-07-26 | #367 |
| T3 | ✅ shipped 2026-07-26 | #370 |
| T4 | ✅ shipped 2026-07-26 | #377 |
| T5 | ⬜ | — |
| T6 | ⬜ | — |
| T7 | ⬜ queue split + auto-overdue | — |
| T8 | ⬜ unblocked — ruling recorded in card | — |
| T9 | ⬜ partner profiles | — |
| T10 | ⬜ delivery calendar | — |
| T11 | ⬜ delivery module page (FINAL) | — |
