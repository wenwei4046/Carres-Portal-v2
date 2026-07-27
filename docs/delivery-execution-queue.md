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
- Copy law: `docs/COPY-STANDARD.md` — REWRITTEN 2026-07-27 (Jess): `Chase` is banned; labels
  are verb + named party + measurable object; Dynamic Checklist law added. The C-line
  (`docs/portal-core-execution-queue.md`) renames the live UI; T9-T11 are built speaking the
  NEW words. Older wording inside shipped notes below is historical record, not law.
- Design law: `docs/UI-KIT.md`. Never leak DB stage words.
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

## T5 · Booking progress spine in the drawer (read-only) ✅ (PR #382)

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
**Shipped note (PR #382):** the DO row needed NO greyed fallback — `orders.do_number`
is a real signal (auto-assigned on the dispatch transition by the 0098 trigger and
already riding the drawer's order payload), so the tick reads it directly. Spine =
new `BookingSpine.tsx` (dumb, read-only), fed the SAME sources as the header chip
(carrier name · `booking_stage`+`confirmed_date` · `do_number` · the chip's own
delivered signal) so ticks and chip cannot disagree by construction. Photo row
greyed "later" until T6. 4 tests incl. a banned-word guard (POD/Unscheduled/Not
booked grep 0 in the spine).

## T6 · Delivery photo (the artifact — needs a migration) ✅ (PR #384)

**Concept (Jess):** every completed delivery has proof: photo (+ optional signature/remark).
Named "delivery photo" everywhere — POD stays banned.

**Goal:** upload from drawer once delivered; Storage bucket; `delivered_at` + photo path
columns (one additive migration — check remote tracker tail FIRST, guardrail #8).
**Done when:** a delivered order can attach ≥1 photo; T5's last tick goes live; activity logs it.
**Shipped note (PR #384, migration 0280):** the migration is ONE column, not two —
`delivered_at` already exists on `orders` (0019) with real writers (partner deliver RPC,
bulk-complete, the 0106 auto-status family), so adding a copy would have been a second
home for a load-bearing fact. The ledger is `ops_order_control.delivery_photos` jsonb
(`{path, at, by}` entries, server-stamped). The bucket is REUSED, not created: the private
`proof-of-delivery` bucket (0069) under an `order/{order_id}/` prefix — the partner flow
keys on `{thread_id}/`, so the families can't collide, and zero storage policies changed
(the Worker signs upload + view URLs with the service client after its own
operation/principal gate; 0069's read policy still names the pre-0121 'logistics' role, so
user-JWT storage was never a working path for HQ). Server is the gate: sign-upload AND
attach refuse unless the order reads delivered; the path must sit under the order's own
prefix. Activity rides the T4 `operation_add_annotation` door, fail-soft. The drawer's
delivery card gains the Delivery photo row (delivered orders only, signed-url view links +
`Upload delivery photo` with browser-side shrink); the T5 spine's last tick is live, fed by
the same ledger the row reads.

---

## Road ahead — T7-T11 (locked with Jess 2026-07-27; the queue ENDS at T11)

The T-series is ELEVEN cards total. T1-T6 finish the delivery lifecycle INSIDE the order
panel. T7-T11 build it OUT into a standalone Delivery capability. Same law: one card, one
chat, one PR, one deploy, in this order. Detail for each lives in the LATER entry it
promotes — the implementing chat reads BOTH this card and its L-entry.

## T7 · Queue split + auto-overdue (promotes L1) ✅ (PR #386)

Real queues: `Assign logistic / Confirm booking / Deliver today / Upload delivery photo`,
each with its own deadline relative to the confirmed date so items turn overdue by
themselves. Needs T1-T6 signals — that is why it waits for them.

**Shipped note (PR #386):** web + one additive API select line, **no migration**.
The delivery verbs left the QUEUES blob for their own **DELIVERY** facet group; the
stock verbs (`Order PO` / `Chase supplier` / `Call customer (stock delay)`) stayed
behind. No row changed queue — the labels ARE the NEXT verbs, so counts still equal
the NEXT column by construction (C-vocab).

**The working-day engine already existed** — L3 said it "ships INSIDE T9 or T10", but
`packages/shared/working-days.ts` + `my-holidays.ts` shipped with procurement
2026-07-21 (Mon–Sat, Selangor holidays, injected calendar). So the deadlines are real
working days from day one, not calendar days: assign = date − 3 wd · confirm = date −
1 wd · deliver = the confirmed date itself · photo = delivered + 1 wd. The math lives
in a new pure `packages/shared/delivery-queue.ts` (18 tests) so T10's calendar and
T11's module read the SAME rule instead of a second copy.

**Two words the card asked for that were NOT built, deliberately:**
- `Confirm booking` would be a second word for a step that already ships as
  `Chase logistic` (C-vocab locked 2026-07-19, and the drawer's Chase Now word).
  COPY-STANDARD rule 8 wins; renaming step 2 app-wide is a one-line call for Jess,
  a synonym is not. The queue is there, under the live word.
- L1's `Issue DO` queue has no human in it — `orders.do_number` is stamped by the
  0098 trigger on the dispatch transition (found while shipping T5), so a queue for
  it would hold work nobody does.

**Two ladder rungs were added to make the new queues real NEXT verbs** (a queue the
NEXT column doesn't speak is a queue nobody looks at):
- A confirmed booking stopped being one resting state: **today → `Deliver today`**,
  **date passed with no delivery → `Chase logistic` (red)**. That is the auto-overdue
  — the row leaves the Deliver-today queue by itself. The money-hold still wins
  (PayHold: never chase a delivery we may not make), and the pre-D1 past-deadline
  escalation is untouched (it only ever fired on UNCONFIRMED rows; a confirmed date
  passing is a case D1 created, which is why it fell through to `Confirm` before).
- **A delivered order with an empty photo ledger is not `Done`** — it shows
  `Upload delivery photo`, the only action a closed order ever shows, and the MANAGE
  cell's blank-when-closed rule now blanks on `Done` only. Tone is amber, never red
  (guardrail #2: a delivered order must not alarm). Its queue deliberately spans
  CLOSED orders — the second queue to do so, for the same reason Owing does.

**Degrades instead of lying:** an absent `delivery_photos` (older Worker, or no
overlay row at all) means UNKNOWN, not "no photo", so the queue stays silent rather
than demanding proof of every delivered order. A TBD customer date has no anchor and
can therefore never be late — silence over a false alarm, same rule as T3's radar.
Also fixed a time bomb found in the existing tests: the `BOOKED` fixture hardcoded
`2026-08-01`, which would have silently started testing a different rung once that
day passed; it is relative now.

## T8 · Delivery groups / partial delivery (promotes L7) ✅ (PR #391)

**Jess's ruling (2026-07-27, verbatim confirmed):** mattress + bed frame = together (HARD,
never split) · sofa = prefer together but MAY go as a second trip (SOFT — ASK the customer
wait-vs-split, never auto-split) · pillow / mattress protector NEVER block a delivery
(back-order them). Build: the confirm gate learns delivery groups (accessory lines stop
blocking); a sofa split creates a second booking on the same SO via the
"confirm delivery preference with customer" flow.

**Shipped note (PR #391, migration 0282):** shared + api + web, two additive columns.

**The HARD rule is STRUCTURE, not a flag.** Mattress and bed frame are not two groups with
a "keep together" setting someone can bypass — they are ONE group (`bed`) in the new
`packages/shared/delivery-groups.ts`. No caller can name them separately, so no code path
can send a mattress without its frame. The SOFT rule is the only split allowed, and it has
**no default**: omit `deliverGroups` on the confirm endpoint and the trip carries the whole
order, byte-identical to the pre-T8 gate. That missing default IS "never auto-split".

**The card's stated first bite was already fixed** — "a missing RM39 pillow blocks a
RM5,000 bed delivery" is not what the code did: `lineReadiness` has returned `reserved` for
every accessory since 2026-07-07 (Jess's own Klang-stock rule) and the gate already skipped
service charges. So accessories never blocked. T8 makes the reason explicit — a non-core
line carries NO group, i.e. it is outside the question rather than "a group that always
passes" — and pins it with tests instead of leaving it as an accident two files away.

**"A second booking on the same SO" — the one design call.** It cannot be created at split
time: the whole reason for splitting is that the other group has no date yet. So the split
records what THIS trip covers (`booking_groups`, NULL = the whole order ⇒ zero backfill),
the drawer grows a `Second trip` row naming what is still owed, and the follow-up trip is
confirmed later through the SAME endpoint and the same gates. There stays ONE live booking
in the columns T1/T5/T7 already read (and T10's calendar next); `delivery_trips` is an
ARCHIVE of replaced trips, not a competing store.

**Ships with zero live instances behind it:** no order in the database has both a bed set
and a sofa (14 orders carry sofa lines; all 14 are sofa-only), which is why the split is
behind an explicit operator choice and surfaces nowhere by default. The wait-vs-split
chooser appears ONLY when part is ready and part is not, and opens on `Wait for everything`.

`docs/COPY-STANDARD.md` gains the group words (`Bed set` · `Sofa` · `Second trip`;
"partial delivery" / "split shipment" / "back-order" banned on screen).

## T9 · Logistic partner profiles (promotes L6) ✅ (PR #398)

Working days · blackout dates · daily capacity · booking lead time — and the confirm flow
warns when an operator books a date the partner cannot honour. First real consumer of
partner rules; the working-day util (L3) ships inside this card or T10, whichever needs it
first.

**Shipped note (PR #398, migration 0283):** shared + api + web, four additive columns.

**These WARN, they never BLOCK — the one design call.** The gates that *refuse* a
confirmation (goods reserved · balance collected · no Sunday, `booking-gate.ts`) are about
**our own** obligations. A carrier's working pattern is not one of ours, and the carrier is
reachable by phone: an operator who already rang NETS and got a yes must be able to record
that yes. A refusal here would teach staff to enter fake dates, which is worse than a real
date with a note against it. So the Confirm button never reads these warnings, and the
confirm response hands them back *after* the write.

**The working-day util did NOT ship inside this card** — the card offered T9 or T10 as its
home, but `packages/shared/working-days.ts` + `my-holidays.ts` already shipped with
procurement 2026-07-21 (the same discovery T7 made). So T9 *delegates* to it rather than
reimplementing, and the notice period counts the **partner's own** working week: a
Saturday-off carrier's "2 days' notice" is not our 2 days.

**Silence over a false alarm** (the T7 law, held): all 8 live carriers are bare rows, so
every one reads "no rules recorded" and produces **zero** warnings. Absent data means "we
never asked", never "it's fine". Capacity stays quiet unless the partner states a limit
*and* the day's load was actually counted — `null` is not zero, and the count is skipped
entirely for a partner with no limit rather than fetched as trivia nobody reads.

**Sunday is deliberately absent from a carrier's rules.** It is refused for *every* partner
by the existing gate; a softer per-partner voice saying "call them" would read as though a
phone call could buy a Sunday. The off-day rule skips weekday 0 and the editor offers
Mon–Sat only.

**Why an RPC, not a policy:** `partners_principal_write` (0002) is principal-only and
operation is exactly who maintains these rules — but an UPDATE policy cannot be narrowed to
four columns, so widening it would also hand operation the partner's name, contact and rate
card. `set_partner_delivery_rules` (SECURITY DEFINER) names the four columns and audits the
change, because a change to these rules changes what the portal warns about tomorrow.

The editor lives in the drawer where the rules are FIRST read, per L6's own instruction
("build the fields WITH the first consumer, not as an admin page up front"). Today in MYT,
not UTC — the Worker's clock is UTC, and between 16:00 and midnight UTC it is already
tomorrow in Klang, so "cannot take a date in the past" must not fire a day early.
`docs/COPY-STANDARD.md` gains the carrier-rule words (`delivery rules` · `working days
notice` · `not running on` · `deliveries a day`) and the law that every one of these lines
names the carrier and ends in something the operator can do.

**Found, not fixed (not this card):** the drawer's delivery badge still renders
`Unscheduled` for "carrier assigned, no date" (`OrderDetailDrawer.tsx` ~3814 and ~3853).
T1 banned that word and fixed the LIST column; these two drawer copies were left behind.
One-line fix to T1's `need booking`, flagged rather than touched.

## T10 · Delivery calendar as single source (promotes L2) ✅ (PR #413)

Today / Tomorrow / This week views reading the SAME booking fields — never a second store.
Partner capacity from T9 shows on the day.

**Shipped note (PR #413):** shared + web, **no migration, no API change** — every field
the calendar needs already rides the orders list payload (T1 put `booking_stage` /
`confirmed_date` / `confirmed_time_slot` there; T9 put the carrier rules on
`/api/operation/partners`).

**The second store already existed, and it was the calendar.** There was no calendar to
build — the right-rail Calendar has had a Deliveries lens since 2026-07-23, and it bucketed
orders by `orders.delivery_date`: the date we PROMISED the customer. That is not when a
truck moves. Since D1 (0277) the truck's day is the booking, and the two dates diverge the
moment anything is rescheduled — which is the entire reason D1 split them. So T10 is not
"add a calendar", it is "make the calendar read the booking", and the fix is structural:
the confirmed-vs-provisional decision moved into ONE pure function
(`bookingDayOf`, `packages/shared/delivery-calendar.ts`, 34 tests) that the Orders list's
Delivery column now delegates to as well. The two surfaces cannot put the same order on two
different days, because there is only one rule left.

**The live finding that shaped the screen:** the database holds **zero bookings** —
0 confirmed, 0 provisional, across all 55 control rows — while **52 orders carry a promised
date**. So the pre-T10 calendar was showing 52 deliveries, and not one of them was a booked
truck. Reading only the booking would therefore have emptied the calendar completely and
read as a broken panel. The promise is kept on screen as **what it is**: a separate
`Promised this day, needs a date` block carrying `Call {customer} — book delivery date`,
never counted as a delivery. The day badge counts bookings; the block counts work. A day
can now be honestly empty of trucks and honestly full of calls at the same time.

**Ranges:** `This week` is the REST of the week — today through Saturday, because Sunday is
refused for every carrier by the booking gate. On a Saturday it is just today; on a Sunday
it is the Mon–Sat starting tomorrow. Empty days are skipped inside a multi-day range (noise)
but a single empty day still says so out loud (that is the answer).

**T9 on the day, under T9's own law:** each carrier's row shows what it is carrying, and
only CONFIRMED bookings count toward its limit — a provisional date is not a promise, so it
cannot fill a truck. All 8 live carriers are bare rows, so today every one shows a plain
count and warns about nothing. **Sunday is deliberately silent**: every carrier carries the
default `off_days [0]`, so voicing it as a per-partner rule would have blamed all 8 of them
for a rule none of them set — and T9 already ruled that a phone call cannot buy a Sunday.

`docs/COPY-STANDARD.md` gains the calendar words (`Confirmed` · `Carrier's date` ·
`Promised this day, needs a date` · `No carrier picked` · the three range words).

**Found, not fixed (not this card):** the panel's PO lens still has a tab labelled `Chase`,
banned by the 2026-07-27 copy rewrite. It belongs to the Purchase vocabulary and the C-line
owns that rename; touching it here would rename a different panel's word from a delivery
card. Also still open from T9: the drawer's two `Unscheduled` copies
(`OrderDetailDrawer.tsx` ~3814 and ~3853).

## T11 · Delivery module page (promotes L5) — the LAST card

The 3-pane standalone module per `docs/delivery-module-proposal.md` (rewritten 2026-07-27 —
the pre-T-series version was deleted, not annotated). By T11 every signal, queue, word,
reason, profile and calendar already exists — this card is ASSEMBLY, not invention, and it
carries the ONE new sidebar item in the whole plan. **Runs last in the drawer lane**, after
C5 → C1 → C2 → C3 → C6 → C7 → C8: assembling before the words and the action model are
settled means building the page twice. After T11: two weeks of live usage writes the fix
list; nothing else is planned past T11 on purpose.

---

## LATER (no card number = not planned; listed so no chat reinvents them)

- **L1 Queue split → SHIPPED as T7 (PR #386)** — `Assign logistic / Confirm booking / Issue DO /
  Deliver today / Upload delivery photo` as real queues (needs T1-T3 signals stable first).
  Each step gets its own
  deadline relative to the confirmed date (assign ≥3 working days before · confirm ≥1-3 days
  before · delivery order 1 day before · photo same/next day) so a queue item can turn
  overdue BY ITSELF — no human watching required.
- **L2 Delivery calendar → SHIPPED as T10 (PR #413)** — and the "second store" this entry
  warned about turned out to be the right-rail Calendar itself, which had been bucketing by
  the PROMISED date since 2026-07-23. It reads the booking now, through the same
  `bookingDayOf` rule the Orders list Delivery column reads.
- **L3 Working-day calendar engine** — **already existed** (found in T7):
  `packages/shared/working-days.ts` + `my-holidays.ts`, shipped with procurement
  2026-07-21 (Mon–Sat, Selangor holidays, calendar injected). T7's deadlines use it.
  What is still NOT built is the per-site refinement (condo Sat 0.5d etc.) — T9 did NOT
  take it: T9 models a carrier's whole days (`off_days`) because half a day answers
  neither question it asks. A site-level refinement is a different subject (the customer's
  building, not the carrier), so it stays here unclaimed rather than being wedged into a
  partner profile.
- **L4 Multi-leg surfacing** — `delivery_stops` jsonb exists; UI in `DeliveryChain.tsx`.
- **L5 Delivery module page (3-pane) → PROMOTED TO T11** — `docs/delivery-module-proposal.md` (LOCKED 2026-07-22);
  the 6-step lifecycle maps INTO its 3 tabs; not a conflict, do after T-series.
- **L6 Logistic partner profiles → SHIPPED as T9 (PR #398, migration 0283).**
  All four fields landed (working days · blackout dates · daily capacity · booking lead
  time), and the editor sits WITH its first consumer — the drawer's confirm flow — exactly
  as this entry asked, not as an admin page up front. **One thing L6 wanted was NOT built:**
  Saturday *half*-days. Half a working day answers neither question T9 asks (does the
  partner run at all · what is the earliest date it can take), so a day is open or it is
  not. The per-site refinement (condo Sat 0.5d etc.) stays unbuilt — see L3.
- **L7 Delivery groups / partial delivery → SHIPPED as T8 (PR #391, migration 0282).**
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
| T5 | ✅ shipped 2026-07-26 | #382 |
| T6 | ✅ shipped 2026-07-26 | #384 |
| T7 | ✅ shipped 2026-07-27 | #386 |
| T8 | ✅ shipped 2026-07-27 | #391 |
| T9 | ✅ shipped 2026-07-27 | #398 |
| T10 | ✅ shipped 2026-07-27 | #413 |
| T11 | ⬜ delivery module page (FINAL) | — |
