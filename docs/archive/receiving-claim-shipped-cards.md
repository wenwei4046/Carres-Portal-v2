# Receiving & Supplier Claim execution queue — ONE CARD PER CHAT (locked with Jess 2026-07-27)

> **How to use (Jess):** new chat, paste:
> "Read `docs/receiving-claim-execution-queue.md`. Do card R<n> ONLY. Do not touch any
> other card. Do not redesign anything marked ALREADY EXISTS."
>
> **Source:** Jess's design conversation — receiving is an INSPECTION, not a checkbox:
> record what arrived / what's still coming / what's wrong, and every problem auto-becomes
> a tracked case. Vocabulary law: the not-yet-arrived qty is **`Pending delivery qty`** —
> NEVER "Missing" (the goods aren't lost, the supplier just hasn't sent them).
>
> **Sidebar home: Purchasing (EXISTS — Receiving is already a tab there; Claims becomes a
> sibling tab). Supplier KPI lands on Suppliers page later. No new menu item.**
> **RULE (memory): check `reference_2990s_shopping_list` BEFORE any Purchase/GRN work —
> the 2990s ERP already solved partial-receipt GRN + Purchase Return; copy, don't invent.**

## Ground truth (read before ANY card)

- **GRN station is LIVE**: `OperationReceiving.tsx` (待收 queue: To receive / Received /
  All) + `ReceivePOModal` (per-line tick + DO upload + signed checkbox →
  `operation_receive_po_with_do` RPC; `ops_stock_items` incoming→free + stock_balances).
  GRN scope = goods INTO Carres Klang only (AL/HOUZS goods tracked by Stock Location).
- Multi-DO partial pickup already exists on the supplier→ops side (0107-0111 era).
- Supplier claim CONCEPT does not exist yet — that is what R2+ builds.
- Money rule (Jess, locked): **supplier claims never produce a Credit Note** — credit
  notes are Finance-only for billing mistakes. Claim resolutions are goods actions.

## R1 · Receiving speaks Pending-delivery (vocabulary + progress)

**Goal:** the receive flow records per line: `Received qty · Pending delivery qty ·
Damaged qty · Wrong item qty`, and the PO row shows a progress state instead of a binary:
`🚚 In transit · 🟡 Partially received (8/10) · 🟢 Fully received · 🔴 Receiving issue`.
A partial receive leaves the PO open with its pending qty visible — no separate paper list.
**ALREADY EXISTS:** per-line receive in ReceivePOModal — extend it, don't replace it.
Copy the 2990s partial-receipt shape (shopping-list item) before designing.
**Done when:** "还有 2 张没到" is readable from the Receiving list without opening anything.
**SHIPPED 2026-07-27 (PR #401, migration 0284).** The Receive modal asks three
numbers per line (Receive now · Damaged · Wrong item) under a `Pending delivery`
column, and the row carries the progress pill + "2 units pending delivery".
Locked while building: a damaged/wrong unit is **not** received — it never
enters stock and its qty stays Pending delivery, which is what leaves R4
something to quarantine and nothing to un-book. The issue counters accumulate
per DO (`received_qty` keeps its new-total semantics); the cap is per-delivery
inside the RPC (`report_exceeds_ordered`), never cumulative, so a replacement
delivery is still possible. Fully received outranks a historical issue, so a PO
that was made good stops being red by itself.

## R2 · Receiving issue auto-becomes a case

**Goal:** any Damaged/Wrong-item qty (or an open Pending qty older than the supplier's
promise) auto-creates a **Supplier claim case**: PO · supplier · SKU · qty · photos
(required for damage/wrong — the S2 evidence law applies here too) · reported by/date.
Claim types DEPEND on category (same lists as S1: bed frame/sofa get Missing parts /
Wrong spec / Wrong colour / Colour uneven; mattress gets Wrong SKU / Damaged).
**Done when:** a receiving problem cannot exist without a case row chasing it.
**SHIPPED 2026-07-27 (PR #412, migration 0288).** The law is a TRIGGER, not a
habit: `po_line_issue_requires_claim` refuses any door that raises a line's
damaged/wrong counter without a covering claim, so a hand-run UPDATE — or a
future RPC nobody has written yet — is refused too. Notes the next cards need:
- **The claim-type vocabulary is S1's, plus exactly one word** (`late_delivery`).
  `packages/shared/src/supplier-claim.ts` builds on `CASE_ISSUES`; the DB mirrors
  it in `supplier_claim_type_allowed()`. Do not fork it.
- **The damaged / wrong-item domains are DISJOINT and the guard depends on it**:
  a claim typed `damaged` covers `damaged_qty`, every other non-late type covers
  `wrong_item_qty`. That is why the wrong-item picker never offers `damaged`.
- **Evidence is a CHECK.** A damaged/wrong claim with no photo cannot be stored;
  `late_delivery` is exempt (nothing to photograph). Photos live in the existing
  private `delivery-orders` bucket under `<po_id>/` — no new bucket, no new
  storage policy.
- **`status` is only open/closed and nothing closes a claim yet — R3 owns that.**
  The queue page deliberately offers nothing to click, so R3 unpicks nothing.
- Late-delivery claims are minted by `supplier_claim_sweep_overdue()` on the
  daily 09:00-MYT cron, `service_role` only. R5's "avg claim-resolution days"
  needs a close timestamp that R3 must add.
- Live state at ship: **0 POs / 0 PO lines in prod**, so nothing was backfilled
  and the Claims tab reads empty until the first PO is received.

## R3 · Claim lifecycle + supplier resolution

**Goal:** the case carries what WE ask (`Replace · Deliver missing parts · Deliver correct
item · Repair · Return for inspection`) and what the SUPPLIER answered
(`Replacement · Deliver remaining · Repair · Return & replace · Reject · Other agreement`)
— two separate fields, so "what we wanted vs what we got" is analysable. Follow up via
the supplier's WhatsApp GROUP link (memory: suppliers recognise the CR/TCF ref, not PO#);
labels follow the 2026-07-27 word law (`Call {supplier} — confirm …`, never Chase).
**Done when:** every open claim shows who owes the next move; closed claims keep both sides.
**SHIPPED 2026-07-27 (PR #428, migration 0291).** Who owes the next move is
DERIVED (`claimNextMove`, shared) — a stored owner is a second copy of the
ask/answer pair and drifts on the first write nobody mirrored. Notes the next
cards need:
- **The card's ask list has a GAP and this is how it was closed.** All five asks
  describe things you do to goods you are HOLDING, so none of them fits
  `late_delivery` — and that type is minted automatically every night, so a late
  claim with no legal ask would jam the queue on the one type nobody files by
  hand. A late claim is therefore BORN with `deliver_remaining` stamped (the
  supplier answer list's own word, not a sixth invented one) and nothing is
  offered to pick. **Jess's call on the word — one constant changes it.**
- **The supplier's answer is never narrowed by what we asked.** They may offer
  something else or refuse; that mismatch is exactly what R5 counts. Only OUR
  side is narrowed, and only by the one fact the system knows: did goods arrive?
- **A claim cannot close with either side blank, and there is NO escape hatch
  for a supplier who never answers** — that claim stays open and keeps naming
  them, which is what R5's avg-resolution-days must see. `closed_at` is the
  timestamp R2 said R3 owed R5.
- **The ask FREEZES once answered** (RPC + the two-field design): editing it
  afterwards would rewrite history into agreement.
- Seven CHECK constraints hold the rules against a hand-run `UPDATE`, not just
  against the RPC. `supplier_claims` still has NO write policy — the three moves
  are SECURITY DEFINER RPCs, gated operation+principal (narrower than the read
  policy: finance has no move, because a claim never produces a credit note).
- **The late-claim staleness trap, closed:** the sweep creates and never closes,
  so the list route re-reads the PO line's pending qty **for late claims only**;
  a delivered one flips to `Close {claim_no} — {supplier} delivered the rest`.
  An unreadable line counts as STILL PENDING — unknown never reads as delivered.
- Follow-up = the supplier's WhatsApp group (`whatsapp_group_url`, 0239); one
  button records the ask, copies the message and opens the group. **5 of 10
  suppliers have no group link** — the panel says so and still records the ask.
- **Two words need Jess's ruling:** COPY-STANDARD's four-verb dictionary
  (Assign · Call · Issue · Upload) has no verb for ENDING a case (`Close` used)
  or for recording an answer (`Save` used); and `Send to {supplier}` reuses a
  word the vocabulary table pins to raising a PO.
- **Nothing auto-closes a claim when replacement goods arrive** — R4 owns
  "claim resolution flips them back to free", so the close is a human move.
- Live at ship: **0 claims / 0 POs**, so nothing was backfilled.

## R4 · Problem stock is quarantined (On hold / Returned to supplier)

**Goal:** damaged/wrong units flip to `on_hold` (with reason) so they can never be
allocated, reserved, or delivered; goods physically sent back flip to
`returned_to_supplier`; claim resolution flips them back to free (or writes them off).
**ALREADY EXISTS:** `ops_stock_items` per-unit statuses (incoming/free/reserved/void…) —
ADD statuses to the existing machine, never a parallel table.
**Done when:** a held unit is invisible to every sell/reserve/deliver path, provably.
**SHIPPED 2026-07-27 (PR #454, migration 0299).** Three statuses on the existing
machine — `on_hold` · `returned_to_supplier` · `written_off` — plus why a unit is
held, under which claim, and when the hold ended. Notes the next cards need:
- **"Provably" is a DESTINATION rule, not a caller check.** `ops_stock_items`
  carries a blanket internal write policy and three live PostgREST paths update
  `status` (the sofa-loan claim, its rollback, the loan return), so a guard
  inside one RPC is a guard one call walks around — and revoking column-level
  UPDATE would break the sofa lane. The trigger asks only WHERE a unit is going:
  `on_hold` may reach `free`, `returned_to_supplier` or `written_off`, and never
  `reserved`, `sold` or `transferred`. **The read side needed no change at all** —
  every pick already filters `status='free'`, and the rollup counts only
  free+reserved, so a held unit is absent from `stock_balances` too.
- **R1's leftover was worse than invisible.** A damaged unit stayed `incoming`
  forever, and both `reorder-alert.ts` and `ready-stock-plan.ts` read `incoming`
  as "on the way" — a unit that will never come was inflating future supply.
- **A hold is created by RECEIVING and nothing else** (the guard allows only
  `incoming → on_hold`). A pool unit later found damaged keeps its own machine
  (`needs_repair` + the Defective view); a second quarantine concept would let a
  held unit be "refurbished" back into the pool with the claim unanswered.
- **`returned_to_supplier` and `written_off` are terminal, and a held unit cannot
  be DELETED** — the hard-delete door would erase evidence an open claim chases.
- **`back_to_stock` does NOT touch the PO line** — `damaged_qty` is history
  (R1's accumulate law) and whether the supplier still owes us is the CLAIM's
  answer. It does write a `stock_movements` row + re-roll `stock_balances`.
  **Consequence R5 must know:** a PO whose shortfall is closed by a release
  rather than a replacement delivery stays `open` (only the receive RPC ever
  closes a PO). Filed as a carry-forward, not fixed inside a stock RPC.
- **The receive now MINTS the shortfall** — with the damaged units held, a
  replacement DO had no `incoming` unit left to flip. Own warehouses only.
- The resolution is **per claim, not per unit**, and is **not gated on the claim
  closing**: goods and paperwork move on different days.
- Live at ship: **87 units all `free`, 0 POs, 0 claims** — nothing backfilled.
  18 assertions passed against live in a rolled-back transaction before apply.

## R5 · Supplier scorecard

**Goal:** per supplier, derived from R1-R4 data: on-time %, partial-delivery rate,
damage rate, claim rate, avg claim-resolution days. Lives on the Suppliers page.
Feeds Purchase's promise-setting (short-delivery strategy already prices promises off
real supplier performance).
**Done when:** next supplier negotiation opens with numbers, not memory.
**SHIPPED 2026-07-27 (PR #475, NO migration).** The scorecard sits on the
supplier card and opens in full in the drawer. **R5 stores nothing** — it reads
R1's three numbers on a PO line, R2/R3's claims and R4's quarantine, calls no
RPC and adds no table (K5's shape: a review layer with its own state is a fifth
number to keep in step with four). Notes the next cards need:
- **The live finding is the whole design: 10 suppliers · 0 POs · 0 lines ·
  0 claims.** Every rate this card asks for is 0/0, so built the obvious way the
  screen opens ten negotiations with a percentage nobody earned — `0%` reads
  "Ohana never delivers on time" and a defaulted `100%` reads "Ohana is
  perfect". **A rate is either backed by records or it is not printed**, and the
  four gates that follow all heal by themselves as real POs land: a score needs
  `MIN_JUDGED_POS` (3) tested promises · a promise whose day has not come is not
  a failure · a PO with no `eta_date` can never be scored and is counted BY NAME
  (that one is ours, not the supplier's) · a PO that arrived complete with no
  receipt date leaves the on-time denominator instead of being guessed into it.
- **R4's carry-forward honoured, and where it is refused is reported not
  hidden.** `purchase_orders.status` never reaches the score (a PO made good by
  releasing held units stays `open` forever). But the CF also says on-time
  should read the covering claim's `closed_at`, and the RATES deliberately do
  not: a shortfall that was written off, or that the supplier refused, is a
  shortfall — counting a closed claim as "delivered in full" would launder a
  supplier failure into a pass. `closed_at` is used for the one number it
  genuinely answers, settle time. **One branch changes it if Jess disagrees.**
- **The card's "partial-delivery rate" ships as `In full`** — the same question
  stated as the thing that went right, so the label needs no minus sign; and
  "damage rate" ships as ONE `Damaged or wrong` figure over the units that
  actually arrived, because R2's two counters are disjoint and a negotiation
  asks "how many did I have to send back", not which box they came from.
- **Nothing on this screen is coloured.** UI-KIT reserves colour for
  action/selection/status/alert; a percentage is none of those until somebody
  sets a target, and **nobody has** — painting 82% amber would be the portal
  inventing a supplier policy Jess never ruled. It earns colour the day a target
  exists.
- **The open-claim count sits beside the settle-time average and is never folded
  in.** R3 left no escape hatch for a supplier who never answers; without this,
  one quick settlement plus five unanswered claims would read "settles in 2
  days".
- **NOT built, and reported rather than quietly dropped:** the card's "feeds
  Purchase's promise-setting". Nothing consumes the scorecard yet — with 0 POs
  there is no performance to price a promise off, and wiring a live lead-time
  override is its own card with its own business decision (does a supplier's
  record shorten the promise we give a customer, or only the one we expect from
  the factory?).
- Two words are new on screen and neither is in COPY-STANDARD's dictionary
  (`On time` · `In full`). They are FACTS, not actions, so no verb rule applies
  — but they are worth Jess's ruling before a second module reuses them.

### The on-time rule R5 locked (confirmed 2026-07-27 — do not undo it)

R4's carry-forward asked the scorecard to read the covering claim's `closed_at`. **It does
not, deliberately, and that stands.** A shortfall the supplier wrote off, or refused, is
still a shortfall. Counting a closed claim as "delivered in full" would launder a supplier
failure into a pass — which is the exact thing this scorecard exists to catch. `closed_at`
still matters for **how long a claim took to settle**; it never turns a miss into a hit.

## R6 · Warehouse login — the warehouse updates itself

**Concept (Jess, 2026-07-27):** the third-party warehouse stops reporting by WhatsApp;
they log in and file receiving themselves. **The pattern ALREADY EXISTS twice** — the
supplier portal (marks delivered + uploads DO photos) and the partner portal — warehouse
is the THIRD external role, built the same way (own role in auth, RLS-scoped, narrow shell).

What a warehouse login sees (and nothing else):
- POs bound for THEIR warehouse (incoming list)
- the R1 receive form (qty + photos; Pending delivery / Damaged / Wrong item)
- their own open issues (R2 cases they reported)

What it can NEVER do: prices · stock adjustments · settings · deletes · other warehouses.
Ops reviews/approves before stock actually updates (the GRN write stays behind the
existing RPC — warehouse submissions land as PENDING, ops confirm flips them).

**Sequencing law: R6 comes AFTER R1-R2** — the inspection form must exist and be proven
by ops first; giving outsiders a login before the structure exists recreates the
Service-Note free-text problem. Needs a migration (role + RLS) — guardrail #8, drafts to
Jess first.
**Done when:** a Klang receiving lands in the system with zero ops typing — ops only
reviews.
**SHIPPED 2026-07-28 (PR #490, migrations 0301 + 0302).** The warehouse counts on
R1's own form and files it; ops presses one button. Notes the next cards need:
- **The migrations were ALREADY APPLIED when this card was built.** An earlier
  R6 session applied 0301/0302 to prod and shipped no code, so the database was
  ahead of the repo. Both files are recovered here **byte-for-byte** — `md5` of
  each file equals `md5` of the statement in
  `supabase_migrations.schema_migrations`, checked before a line of code was
  written. **Nothing new was applied by this PR.** The lesson is the deploy
  rule read backwards: the tracker is the authority on what the database has,
  and a repo that does not match it is the thing to fix first.
- **A submission is a QUEUED CALL to the receive engine, never a second
  engine.** `warehouse_receipt_check_in` replays the stored payload through
  `operation_receive_po_with_do`, so R1's counters, R2's claim minting and its
  guard, R4's quarantine and the thread/stock cascade all come along unchanged.
  A test asserts the ops router never calls the engine directly.
- **The stored number is a DELTA** (`received_now`), not a running total: a
  receipt can sit for hours while another DO lands, and a stored total would be
  true when it was typed and wrong when it was replayed.
- **The warehouse has no RLS grant at all** — every read and write is a DEFINER
  RPC gated on `app_role() = 'warehouse'` and scoped by `app_warehouse_id()`,
  and 0302 ASSERTS that no table policy anywhere names the role. Storage is the
  one exception and has to be (an upload goes through a signed URL), and both
  branches are scoped to POs bound for the caller's own warehouse.
- **Check-in takes no body.** A count ops disagrees with goes BACK, with a
  reason, to the only people who can look at the goods again — an ops-side edit
  field would be "zero ops typing" quietly withdrawn, and it would make the
  record say the warehouse counted something it never counted.
- **The account door is HR → Team**, beside supplier and partner (Loo's
  2026-07-25 ruling). It PICKS an existing warehouse rather than naming one;
  the principal Accounts modal was deliberately left alone, so there is one
  door, not two. Live there is **1 warehouse (Carres Klang) and, at ship, no
  warehouse account yet** — R6 built the door, Jess mints the login.
- **Two words to rule.** `Send back` reuses `Send`, which COPY-STANDARD pins to
  raising a PO — the closest legal word, adopted and reported rather than
  invented around. And the warehouse's own button is the form law's `Save
  count` because the five verbs have none for "file this with Carres"; the
  state that follows, `Waiting Carres check`, is the approved
  "Waiting + the exact thing" shape.
- Live at ship: **0 POs · 0 PO lines · 0 receipts**, so the queue reads empty
  until the first PO is received — nothing was backfilled.

## R7 · The Receiving design — Phase 1, written down

**⚠️ RE-CUT BY LOO 2026-07-29. R7 is no longer "GRN duty — receiving assigns itself".** The
old card built a round-robin that auto-stamped one owner per GRN. The old text is deleted
rather than annotated (one concern, one file).

**GRN Duty Rotation is still REQUIRED — it was removed from Receiving, not cancelled** (Loo,
2026-07-29 — final). **Its permanent home will be decided in the Administration / Work
Assignment module**, and **it does not come back into R7 under any circumstance.** The
rotation itself stays LOCKED business in `docs/carres-portal-system-architecture.md` §3.16,
where it is a HUMAN roster rule the system does not enforce. **⑦ P5 therefore validates a real
PO with the GRN owner still a human rule** — known, accepted, and not a reason to re-open this
card.

**Goal:** the Receiving design is written down, and the portal's documentation stops
describing a flow nobody had ruled. **This card is documentation and architecture. It ships
no migration and changes no behaviour.**

**THE DESIGN LIVES IN `docs/carres-portal-system-architecture.md` §3.17 — read it there, not
here.** This card records what was ruled and what the ruling costs; the design has ONE home.
In one line each:

1. **Receiving only RECORDS FACTS. It does not decide delivery readiness.**
2. **The receiving result is one of exactly three** — `Received` · `Received with exception` ·
   `Rejected` — which were already locked in `docs/COPY-STANDARD.md` on 2026-07-27.
3. **Phase 1 is the current WhatsApp workflow** and is the only thing in scope: warehouse
   checks → marks Supplier D/O → signs received → sends evidence to Operation on WhatsApp →
   Operation reviews → Operation keys in the GRN → complete.
4. **Phase 2** (Warehouse Mobile Check-in → Operation Review & Confirm) is **roadmap only.**
5. **No Warehouse Code.**
6. **No photo upload is ADDED to the GRN in Phase 1.**

**Done when:** §3.17 exists, and no document in the repo describes a receiving flow that
contradicts it.

### What the ruling costs — measured 2026-07-29, reported not fixed

Every one of these is a real gap between the ruling and the code. **None is fixed by this
card**, because each needs either a migration or a word nobody has ruled.

1. **`Received with exception` and `Rejected` ship with the SUPPLIER CLAIM module** (Loo,
   2026-07-29 — final). Neither exists today: zero occurrences of either as a receiving result
   anywhere in the codebase, so nothing in the portal can refuse a whole delivery — R1's model
   is quantity-based and damaged / wrong units stay Pending delivery. **They are NOT a
   standalone Receiving card**, and R7 does not build them. That seam is the right one:
   "we refused the lorry" and "we took it and 2 are broken" are different events whose whole
   consequence is a supplier claim, so the status and the claim it raises get designed
   together or they disagree.
2. **Do not fold either status into R1's progress axis to close the gap early.**
   `receiving_issue` is a different question — per PO, derived from quantities, describing
   today — not the outcome of one arrival. Only `Received` is reachable until the Supplier
   Claim module carries the other two.
3. **The three results have no five-string dictionary rows.** COPY-STANDARD lists them as a
   vocabulary group, which is enough to stop a synonym being invented and not enough to build
   a screen. That is the flow file's job, below.
4. **Existing attachment behaviour is UNCHANGED** (Loo, 2026-07-29 — final). R7 means exactly
   two things: **no new Receiving photo upload is introduced**, and **the current attachment
   behaviour is not redesigned.** It must never be read as "delete the evidence law": two file
   paths already exist and both stay exactly as they are — the supplier D/O file (required to
   submit a check-in) and R2's damage / wrong-item photos, **which a CHECK constraint in
   migration 0288 enforces**, so removing them is a schema change.
5. **Phase 2's machinery is already built and dormant** — ④ R6 (PR #490, migrations 0301 +
   0302) is Warehouse Mobile Check-in + Operation Review & Confirm under another name. It is
   unreachable only because **0 warehouse accounts exist**. **Nobody may delete R6 to enforce
   Phase 1.** Phase 2 starts the day Jess mints a login — a business decision, not a deploy.
6. **This line still has no working-flow file, and R7 deliberately did NOT write one.**
   Law 0A says a module's flow belongs in `docs/RECEIVING-WORKING-FLOW.md` and nowhere else,
   so §3.17 is a holding home by necessity, not by right. Loo ruled TWICE (2026-07-28) that
   the three Foundation files come after **P5** and that none may be "just started" while
   waiting — *"a flow file drafted from the code would be an eighth purchasing document:
   fluent, plausible, and nobody's."* **When `RECEIVING-WORKING-FLOW.md` is written it
   ABSORBS §3.17 and §3.17 is deleted**, so the design never has two homes.
7. **`Received with Exception` vs `Received with exception`.** The ruling was written with a
   capital E; COPY-STANDARD locked lower-case on 2026-07-27 and every other portal string is
   sentence case. **The law was not edited to match a chat** — one word for Loo whenever the
   first screen needs it.

## R8 · The banned-verb sweep across the Purchasing lane

**Three screens, one sweep, one PR.** Every word below is already ruled; none of this is a
design decision. Three separate rename cards for one law would be worse than one card that
crosses two lines inside the SAME lane (Purchasing / Receiving is one lane by the index's own
rule), which is why P2's finding was folded in here rather than becoming a P-card.

**⓪ The To Order stage cells** (`OperationPurchase.tsx`) — **✅ DONE by R8 (PR #499). The
paragraph below described the state BEFORE that ship and is kept only as the record of why.**

> **Corrected 2026-07-29 (measured):** `OperationPurchase.tsx`'s `STAGE_LABEL` now reads from
> `purchasingActionQueue()`, so the cells render **`Send PO` · `Confirm ready date` ·
> `Check in`** and no banned word survives on them. **Anything still asserting they read
> `Send POs` · `Chase factory` · `Receive` "right now" is stale, not a live finding.**
>
> Separately and later: the FRAME around those cells changes. The purchase-order lifecycle
> was redesigned and frozen on 2026-07-29 —
> [`docs/PURCHASING-INFORMATION-MODEL.md`](PURCHASING-INFORMATION-MODEL.md) — which moves
> `Check in` off To Order to Receiving. **That is P6's, not R8's,
> and no R-card touches it.**

What it was, when it was found by P2 2026-07-28: the cells read **`Send POs` · `Chase
factory` · `Receive`** while the dictionary locked **`Send PO` · `Confirm ready date` ·
`Check in`**, and **`Chase` is a BANNED word** — not lag, a banned word shipped. Fixed the
same way C1 fixed Orders: read from the shared word module. **The cells are a STAGE picker,
not queue tiles** (UI-KIT §8.2, the no-empty-state rule) — R8 renamed them and changed no
behaviour.

**⓪b Delete the two dead filters in the same visit** (Loo ruled 2026-07-28). `attn` and
`selectedDay` in `OperationPurchase.tsx` carry state, filter logic and a clear chip that
**nothing on the page can switch on** — their tiles were deleted 2026-07-23/24 and the state
stayed. It is in this card because R8 is already opening that file and one visit beats two;
deleting unreachable state is not a behaviour change **by definition** — if nothing can reach
it, removing it cannot alter what anybody sees.

**Which is exactly the thing to PROVE, not assume.** Before deleting, grep for every writer of
each one. If ANY path outside the reset/clear handlers sets them — a keyboard shortcut, a URL
param, a `useEffect`, a prop from the shell — **they are not dead, deleting them IS a behaviour
change, and this card stops and reports.** P2 measured them as unreachable and I recorded it;
neither of us is a substitute for the grep in front of you. Delete the state, its filter
branch and its clear chip together — a chip that clears a filter nobody can set is the same
lie one level down.

**Not to be confused with a decision to drop the FEATURE.** "Only what is late" and "only this
day" are reasonable things to want on To Order; they were never ruled out, they were ruled
*not to sit in the code pretending to exist*. If Jess wants either back it is a card, and it
starts by naming the words — `Late only` is in no dictionary today.



**A rename, nothing else — and it is now TWO words, not one.**

**① `Receive` → `Check in`.** Found by R6 (2026-07-28) and correctly left alone by it:
`OperationReceiving.tsx:374` still renders **`Receive →`** on its own rows while the R6 panel
sitting beside it says `Check in` — **the same act, two words, on one screen.** COPY-STANDARD's
vocabulary table bans `Receive` as a verb outright (`Log goods arrival` → **`Check in`**), so
this is lag, not a decision. It is the clearest possible case of rule 8 and a new hire meets
it on their first shift.

**② `Send back` → `Return count to {warehouse}`, and `Save count` → `Return count to Carres`.**
Loo ruled 2026-07-28 after R6 reported both words as having no legal source. `Send` is pinned
to raising a PO to a factory and is never reused; `Return` is now the sixth verb and its two
forms are in the dictionary with all five strings each.

**ONLY `WarehouseReceiptsPanel.tsx` and the warehouse count form.** `Send back` is live on a
second screen — **`OperationStockPlan.tsx:681`, Ready Stock K2's plan review** — and Loo ruled
2026-07-28 that R8 **does not touch it**: one business, one dictionary. It is the same shape
(a record going back to whoever produced it) and a different object (a plan, not a count), so
Ready Stock defines its own flow and its own dictionary rows first, and only then does that
screen change. **Do not rename it, do not guess `Return plan to …`, and do not file it as an
oversight** — it is a decision, and it is recorded in `docs/carry-forwards.md`.

**③ `Contact supplier` → `Call {supplier} — confirm what happens next`.** Loo ruled 2026-07-28
that the portal has exactly FIVE verbs
(`Assign · Call · Issue · Upload · Close`) and `Contact` was a sixth for behaviour `Call`
already covers — reach the outside party, get an answer, record the outcome. **The ruling is
already law**: `docs/COPY-STANDARD.md` carries the five strings
(`Confirm what happens next` · `Call {supplier} — confirm what happens next` ·
`Record what happens next` · `Supplier answer recorded` ·
`No claim is waiting for a supplier answer.`) and the exception-lifecycle row no longer lists
`Contact supplier`. **The R2/R3 screens are the lag.**

**Build:** every visible `Receive`, `Send back`, `Save count` and `Contact` **on the receiving,
warehouse and claim screens** reads from the shared word module, same as C1 did for Orders. No
behaviour changes, no claim state changes, no migration.
**Grep both directions, for EVERY word** — the old string at 0 proves nothing says it; the new
string at 1 proves something says it. One direction proves half.
**`Send back` will NOT reach 0 repo-wide, and that is correct** — Ready Stock keeps its own
until Ready Stock rules its words. Scope the grep to this card's files and say so in the PR,
rather than "fixing" the count to look clean.
**Done when:** `Receive` (as a verb), `Send back` and `Contact` appear nowhere on the
receiving, warehouse and claim screens, the two panels on the Receiving station say the same
word for the same act, and the Claims queue tile has a name that is in the dictionary.

**④ `STATUS-STANDARD.md` §3 is called "the chase pair"** and describes a button labelled
`Chase` — found by D0.4 2026-07-28. `Chase` is banned outright. It is a LAW file, so a BUILD
chat may not rewrite it: **report it and let the PLAN chat retitle §3 in the same week**, then
sweep whatever the code still spells. Do not rename the section yourself.

**⑤ `GRN` — RULED 2026-07-28, and it is a SPLIT, not a rename.** `GRN` is no longer banned:
it survives as **the name of the document**, on the same ground as `DO` and `PO`. What it may
never be is **the act** — that is `Check in`. COPY-STANDARD carries the rule and the test.

Apply the test site by site, do not sweep:

| Live today | Verdict |
|---|---|
| `+ GRN` button | **act** → `Check in` |
| `GRN — goods arrived` modal title | **act** → `Check in` |
| `Save GRN` | **act** → `Check in` (and see the warehouse precedent: a button that changes whose problem something is was never a `Save`) |
| the toast after saving | **act** → the done message from the dictionary |
| a column or link naming the RECORD (`View GRN`, `3 GRNs on this PO`) | **document** → leave it, `GRN` is correct |

**Report the count both ways in the PR** — how many became `Check in`, how many stayed `GRN`.
A sweep that leaves zero `GRN` has misread the ruling as a ban.

**⑥ Delete the explainer above the Claims list** (Loo ruled 2026-07-28). The paragraph
*"What the supplier still owes us…"* spends a permanent horizontal band on a list page whose
fixed-chrome budget is 200px (UI-KIT §1.3), and it **explains rather than works** — §1.1's
third question ("if it were removed, could today's work still be finished?") answers YES, so
the gate does not admit it. One band back is roughly one more visible row, every day.
**This is a deletion Loo ruled, not R8 tidying** — R8 does not delete other copy on its own
initiative, and it reports anything else it thinks should go.

**LANE:** R8 now touches the Purchasing module's own pages as well as ④ R's
(`OperationPurchase.tsx` from ⓪, `OperationSupplierClaims.tsx` from ③), so **no P-chat and no
C4 chat may run beside it** — the whole Purchasing lane is R8's for one PR. That is the price
of doing the sweep once, and it is cheaper than three cards each waiting for the same lane.

**SHIPPED 2026-07-28 (PR #499, NO migration, web + shared only).** Notes the next
cards need:

- **The mirror grew a SECOND table rather than four more ladder keys.**
  `order-action-words.ts` now holds `PURCHASING_ONLY` beside `WORDS`, because
  `OrderActionKey` is the ORDER ladder's key — `DISPLAY_RANK` is a `Record` over
  it, and `order-action-due` and `order-action-checklist` both key off it. Adding
  `check_in` there would have forced a display rank and a due rule for an action
  the Orders row can never show. One file (Law 0A), two tables, and **`Send PO` /
  `Confirm ready date` are read back out of the order table**, never respelt —
  COPY-STANDARD says they are ONE action shared by both flows.
- **The rename reached SIX visible sites the card named five of.** The card
  pointed at `OperationReceiving`'s `Receive →`; the identical button, opening
  the identical modal, was also live on **Purchase Orders**
  (`ProcurementTabContent.tsx`) — one tab over, same module. Renamed with its
  sibling, because leaving it would have made the module's LAST screen the only
  one still saying the banned word.
- **The stage cell and the middle-list header are ONE label rendered twice.**
  `STAGE_LABEL` is read by both. Renaming only the cell would have produced
  `Confirm ready date` above a panel headed `Chase factories` — the exact defect
  this card exists to end, created by the card that ends it.
- **The dead filters were proved before being deleted, and the proof is the
  point.** Every writer of `attn` and `selectedDay` set `null`; there is no URL
  param, no keyboard handler, no effect and no prop. State, filter branches,
  clear chips and the four date helpers that served only the chip went together.
- **GRN: 4 sites became `Check in`, 5 stayed `GRN`.** The act sites were all in
  `OrderDetailDrawer.tsx` (`+ GRN`, the modal title, `Save GRN`, the toast) plus
  the linked-PO footer's `Receive (GRN)` — a fifth the card's table implies and
  does not list, carrying BOTH errors at once. The document sites — the column
  header, two tooltips and the error line — are correct and were left.
- **`Contact` appears in ZERO visible strings on the claim screens, measured.**
  R3 already shipped `Call`. What Loo's ruling actually still bought was the ROW
  LINE: `claimNextMove`'s answer step said `confirm what they will do` while the
  tile above it said the dictionary's `Confirm what happens next`. **The `late`
  variant (`confirm the new delivery date`) is gone with it** — one action has
  one row line — and that is the single thing this card makes LESS specific.
- **A source scan, not a render test, is what guards a rename.** A render test
  only sees the branches its fixture reaches; the banned words are true of the
  whole lane or not at all (`purchasing-words.test.ts`). Its two knowing
  exceptions are named in the file rather than regexed around: `Chase on
  WhatsApp` and `Direct receive →`.
- Live at ship: **0 POs · 0 PO lines · 0 claims · 0 warehouse receipts** — every
  screen this card renames is still empty, so nothing on it moved for anybody.

**Reported, NOT fixed** (each needs a word Jess or Loo has not ruled):
- **`Chase on WhatsApp`**, its tooltip and the `Chase {supplier}` pane title on
  To Order's ② detail pane. COPY-STANDARD offers `Open WhatsApp group` for a
  channel button — but this one opens a direct `wa.me/{phone}` link when the
  supplier has a contact and only falls back to the group, so that label is not
  literally true. **A banned word is still on screen** and this is the loudest
  thing R8 leaves behind.
- `Nothing to chase here` / `items to chase` — the same word in an empty state
  and a hint on that pane.
- **`ReceivePOModal` spells the act five ways** (`Receive {po} · attach Supplier
  DO` · `Receive now` · `Receive all pending` · `Receive partial` · `Mark
  received`). It is the check-in FORM, opened from three tabs. Only the title has
  a dictionary answer; the four form-internal labels have none, and renaming the
  title alone would leave one form spelling one act two ways.
- `Direct receive →` on Purchase Orders — the escape hatch out of the pickup
  flight. "Direct" is a modifier with no dictionary row.
- **`Record what happens next`** — the dictionary's BUTTON for this action; the
  claim panel says `Save {supplier}'s answer`. **Two laws disagree**: the verb
  dictionary exempts form buttons ("a button inside a form that stores what you
  just typed is `Save`"), and the PURCHASING table locks the button word. A BUILD
  chat reports a law conflict rather than picking a side.
- `STATUS-STANDARD.md` §3, "the chase pair" — ④'s item ④, still a LAW file and
  still a PLAN chat's to retitle.

## ⚠️ This line has NO working-flow file, and that is why its words are half-written

**Law 3: every module owns ONE working-flow file.** Two exist —
`ORDERS-WORKING-FLOW.md` and `PURCHASING-WORKING-FLOW.md`. **Receiving & Supplier Claim has a
queue doc and no flow**, and P2-Claims showed exactly what that costs: `claimNextMove`
computes THREE steps — ask → answer → close — and **only the middle one has a name**
(`Confirm what happens next`). The two Carres-side steps (deciding what to ask for, and
closing) are counted nowhere, can carry no queue tile, and have no strings.

**Loo ruled 2026-07-28: do NOT name them now.** Same sequence as Ready Stock — **the flow
comes first, then the words.** Inventing three tiles for a lifecycle with **0 live claims**
would be a queue chat naming a business that has not spoken.

**When this line writes `docs/RECEIVING-WORKING-FLOW.md`**, it names those two steps there
first, they get their five strings in COPY-STANDARD, and only then does a tile appear.
Until then the single named step is correct and complete on its own — one action with a
queue, not a flow with two holes in it.

## LATER

- ~~Purchase Return flow~~ — **ANSWERED 2026-08-05, do not port it.** AutoCount's
  `Purchase Return` / `Goods Return` / `Cancel Purchase Order` are three DOCUMENTS split by
  which ledger they hit, and Carres has no AP in the portal to hit. They are **Resolutions**
  here (`Return Goods` · `Refund` · `Cancel Outstanding`) — see THE THREE CONSEQUENCES.
  2990s ported the document and not the process, and its `credit_note_ref` is the proof.
- claim → service-case
  cross-link view (J2 covers the order side) · multi-warehouse On-hand filtering (the
  P4 note in OperationReceiving) · partner-warehouse (SSY/EU) logins after Klang proves R6
  · **Smart Cover** (staff on leave stop receiving NEW assignments automatically — needs
  leave data, which nothing tracks yet; when HR grows leave records, this becomes a card
  across orders-assign + R7 + S-line in one move).

---

# THE THREE CONSEQUENCES — the frame R9 · R11 · R12 sit inside

> **Frozen by Loo 2026-08-05, in the same ruling that gave R9 option A.** R9 owns *how many
> outcomes a claim may have*. **This section owns what an outcome CAUSES**, and it is the
> half that was missing: an outcome has **THREE** consequences, not two.

```
Claim  →  Resolution  →  ┌────────────┬──────────────────────┬──────────────────────┐
                         │ Inventory  │ Finance              │ Demand               │
                         │ how the    │ whether money moved  │ did the CUSTOMER get │
                         │ goods move │ — external evidence  │ their goods?         │
                         └────────────┴──────────────────────┴──────────────────────┘
```

| Resolution | Inventory | Finance | **Demand — customer got the goods?** |
|---|---|---|---|
| `Replace` | receive new goods | usually none | ✅ yes |
| `Repair` | none (goods stay) | usually none | ✅ yes |
| `Accept As-Is` | release hold → free | **possible** — discount / compensation | ✅ yes |
| `Return Goods` | `returned_to_supplier` | Debit Note / AP | ❌ **no** |
| `Refund` | none | Credit Note / AP | ❌ **no** |
| `Write Off` | `written_off` | Expense | ❌ **no** |
| `Cancel Outstanding` | none | void the outstanding liability | ❌ **no** |

**`Accept As-Is` may NOT be hard-coded to no financial consequence** (Loo, 2026-08-05). *"你
留着,我给你折扣"* is the commonest furniture settlement there is, and a claim that swallows
the discount leaves the customer's order carrying a cost that is simply wrong.

### The demand question has ONE answer; the other six are derived

Not seven business decisions — one:

> **Did this resolution put the goods in the customer's hands?**

```
✅ yes  →  the requirement is satisfied. Nothing returns
❌ no   →  the customer's order line is still live
           →  the unfulfilled quantity returns to To Order
           →  a HUMAN still issues the PO (the system suggests; a human issues)
```

**Why the third column had to be named at all — measured 2026-08-05:**

```
supplier_claim_close  (0291:389-460)  writes exactly three tables —
     supplier_claims · po_history · audit_log
     it touches NO purchase_order_lines column and NO PO status

To Order's real supply figure  (apps/api/src/routes/operation/to-order.ts:542-557)
     Σ(qty − received_qty)  over purchase_order_lines where purchase_orders.status='open'
```

**So today whether a customer's goods come back is an ACCIDENT of state, not a decision:**

| | |
|---|---|
| goods received, then written off | `received_qty` stands → remaining falls → demand **does** return |
| goods never arrived, PO still open | remaining stands → demand **does not** return |

**Both are wrong for the same reason: nobody ever made the decision.**

### Finance owns the ACTION, never the accounting

The Finance queue **stays**. A challenge that `PURCHASING-WORKING-FLOW.md` §8's ban on
*"a tick-box that only records 'I say I did it'"* would kill it was **overruled by Loo
2026-08-05** — because the completion was never a self-declaration:

> **A Finance Action completes when an EXTERNAL EVIDENCE reference is recorded** — the
> supplier's credit-note or debit-note number, or the AP adjustment reference.
> **The Portal does not perform accounting.** It owns *this must be done* and *it is done*.

**2990s is the worked example of getting this wrong, measured 2026-08-05:**
`purchase_returns.credit_note_ref` is free text a human types, and its only readers in that
whole repository are **the PDF that prints it and the detail page that displays it**. Nothing
happens because of it. **It has the field and no action. We give the field an owner and a due
date.**

**Operations never sees AP. Finance never sees photos.**

**Jess's locked rule, and why it does not block R12** (recorded so it is not re-litigated):
*"supplier claims never produce a Credit Note — credit notes are Finance-only for billing
mistakes."* Hers is the credit note **Carres issues to a customer**; R12's queue records the
one **a supplier issues to Carres**. **Two directions of money wearing one word** — if a
screen ever shows both, they need separate words, and that is a business decision.

---

## R9 · One claim, one outcome — and a button that splits it

**Lane: ④ RECEIVING & SUPPLIER CLAIM · `supplier_claims` + `supplier-claim.ts` +
`supplier-scorecard.ts` + the Claims screen. Amends R3 and R5; answers R4's carry-forward.**

**LOO RULED IT 2026-08-05: option A — a claim holds ONE outcome. Two outcomes are two
claims.** He did not choose it for simplicity:

> **AutoCount is already A.** Its `Cancel Purchase Order` · `Goods Return` · `Purchase Return`
> are three independent documents, and **no object in it holds more than one outcome.**
> *"换 2 退 1"* in AutoCount is two documents. The team already works this way.

**THE ONE REAL OBJECTION IS ANSWERED ON THE SCORECARD SIDE, NOT THE MODEL SIDE — that is the
whole shape of the ruling.** The cost of A is that splitting one problem into two documents
inflates any number that counts DOCUMENTS, and those numbers are what we take to a supplier
negotiation. Fixing that in the model (by letting one claim hold two outcomes) is expensive
and permanent; fixing it in the counter is cheap. **So the counter changes.**

### The three conditions, all binding — none is optional

**① R5 counts PROBLEM PO LINES, never claim documents.** One line of goods with a problem is
**one occurrence**, however many claims close it. Concretely, and measured against the shipped
code:

- `ScorecardClaim` today carries `po_id` and **not** `po_line_id`, and `claimRate` keys on
  `claimedPoIds` — a Set of distinct **POs**. It gains `po_line_id` and re-keys to distinct
  problem **LINES**.
- **The claim STATS move with it or the fix is half done.** `claims.open` must count distinct
  lines with an open claim, and the settle-time average must measure **per line, to the LAST
  claim on that line closing** — a line is not settled while one of its two halves is open.
  Leaving these on claim rows would let a split turn one slow settlement into two fast ones.
- **`supplier_claims.po_line_id` is `ON DELETE SET NULL` (0288), so a claim can have no
  line.** Such a claim cannot be attributed to one and **may not be silently dropped**: count
  it BY NAME, the way R5 already names a PO with no `eta_date` (*"that one is ours, not the
  supplier's"*).

**② The split is a BUTTON on the claim screen.** One press on *"this one ends two ways"* turns
one claim into two and divides the quantity. **An operator is never told to go and open a
second claim by hand** — that is the same failure as C1's second receiving door: a workflow
that exists only in somebody's head is a workflow half the team does differently.

**③ The A → B upgrade path is written down now, while it is free.** If the business ever needs
one claim to hold many outcomes, every existing claim becomes **one child row: outcome copied,
quantity equal to the whole claim.** That is one row per claim even with real data on file —
**A is cheap to reverse, and the card says so rather than letting a later chat call it
irreversible.**

### `Cancel PO` leaves the outcome list — `Cancel Outstanding` replaces it

**Loo, 2026-08-05, answering the question this lane asked twice and nobody answered.**
Cancelling a whole purchase order is a **PO-level** act; one claim, which is about one line,
cannot hold it. The outcome is **`Cancel Outstanding`** — *cancel only the quantity on THIS
line that has not arrived.* The business consequence is unchanged: the customer did not get
the goods, so **the demand returns to To Order.**

> ⚠️ **THIS CONTRADICTS A FROZEN RULE AND THE CONTRADICTION IS DELIBERATE — do not "fix" it
> back.** `PURCHASING-WORKING-FLOW.md` §9 says, frozen 2026-07-28: *"There is no cancelled
> quantity, and purchasing does not model a cancellation … stopping is the whole PO … never a
> quantity typed onto a line."* **Loo's 2026-08-05 ruling overrides it**, and §9 must be
> updated in the same PR or the next chat will read the old sentence and revert this.
>
> **§9's ACTUAL objection is avoidable, and the builder should avoid it.** Its reason is that a
> per-line cancelled quantity *"would put a policy decision into an arithmetic column."*
> **P12 / migration 0321 already solved that exact shape**: cancelling a demand writes NO
> cancelled-quantity column — it stamps `cancelled_at` and lets the GENERATED `remaining_qty`
> FREEZE, so the remainder *is* the record of what was cancelled. **Do the same here**: stop
> the line, do not type a number into it. Then §9 loses its objection instead of losing its
> argument.

**The returning demand keeps its ORIGINAL required-by date and will land straight in
`Overdue`. That is correct and it is not a bug.** The goods really are late — they were due,
they did not come, and the purchase was cancelled. **Written down here on purpose**, because
in three months this looks exactly like a date-defaulting bug and somebody will "repair" it.

### What the builder must reconcile BEFORE writing code

**The live model has no `resolution` field at all**, and this card must not add a third one
beside two that already exist. Measured on `packages/shared/src/supplier-claim.ts`:

| field | meaning | options |
|---|---|---|
| `requested_action` | what WE asked for | `Replace · Deliver missing parts · Deliver correct item · Repair · Return for inspection · Deliver remaining` |
| `supplier_response` | what the SUPPLIER answered | `Replacement · Deliver remaining · Repair · Return & replace · Reject · Other agreement` |

**The `Resolution` list this ruling edits was designed in the planning chat and is NOT in the
repository.** So step 1 is to state, in the PR, which of these three it is: a rename of
`supplier_response`, a THIRD field recording what actually happened, or a replacement for
both. **R3 froze the two-field design for a stated reason** (*"what we wanted vs what we got is
analysable"*, and the ask FREEZES once answered), so a third field must argue against that
sentence rather than ignore it. **If it needs Loo, ask once — do not guess.**

### Also closed by this card

**R4's carry-forward `hold-resolution-is-per-claim-not-per-unit`** is the same problem from
the stock side: `ops_stock_resolve_hold` moves EVERY held unit of a claim to ONE outcome, so
*"supplier took 2 back, we scrapped 1"* cannot be recorded. **Under A that is correct
behaviour, not a limitation** — it is two claims, and the split button is how you get there.
The CF's proposed `p_item_ids` narrowing is therefore **not** the fix; mark it closed by
ruling, and say so in the CF rather than deleting it.

**Done when.** A claim carries exactly one outcome and the type makes a second one
unrepresentable · the split button turns one claim into two with the quantity divided, and no
screen tells an operator to open a claim by hand · R5's claim rate, open count and settle
average are all keyed on the problem LINE, and a split provably does not move any of them
(assert it: two claims from one line read the same as one) · a claim with a NULL `po_line_id`
is counted by name, never dropped · `Cancel Outstanding` replaces `Cancel PO`, cancels only
the undelivered quantity of its line, and returns the demand to To Order · §9 is updated in
the same PR · the A → B upgrade path is in the card.

**Timing — Loo ruled it explicitly: NOW.** Live today: **0 claims** (re-verify before
building). There is no real data to migrate, which is the cheapest this change will ever be.

**Must NOT.** ❌ let one claim hold two outcomes · ❌ leave R5 counting claim documents ·
❌ make the operator open the second claim themselves · ❌ type a cancelled quantity into an
arithmetic column — freeze the remainder, 0321's shape · ❌ default the returning demand to a
new required-by date to keep it out of Overdue · ❌ invent a word: every outcome label needs a
COPY-STANDARD row, and `Cancel Outstanding` does not have one yet — **stop and ask Loo** ·
❌ touch the Receiving queue model (its own CF reserves it for the Receiving workstream).

---

## R10 · `PURCHASING-WORKING-FLOW.md` §9 says something the code does not do

**Lane: ④ · DOCS ONLY. No migration, no api, no UI.** Small, and it is a LAW file, so it gets
its own card rather than riding R9 — one concern, one file.

**Loo ruled it a real defect, 2026-08-05: *"一份会误导人的文件比没有文件糟。"*** It is on this
card because **it already misled a chat in this lane** — the §9 formula was read as the live
rule and the live rule is different.

**Measured 2026-08-05.** §9 publishes this ladder:

```
Part received     0 < received_qty < po_qty
Fully received    received_qty >= po_qty
Balance owed      po_qty − received_qty
```

`poReceivingProgress` (`packages/shared/src/po-receiving.ts`, the function the screens
actually render from) computes:

```
fully_received      ordered > 0 && received >= ordered
receiving_issue     damaged + wrong_item > 0        ← §9 HAS NO SUCH STATE
partially_received  received > 0
in_transit          otherwise
```

**Four disagreements, each checkable:**

1. **`Receiving issue` does not exist in §9 at all**, and in the code it is the SECOND rung —
   it OUTRANKS `partially_received`. A line with 5 of 10 received and 1 damaged reads
   `Receiving issue` on screen and `Part received` by §9's formula.
2. **§9's `Part received` condition is necessary but not sufficient.** The code tests
   `fully_received` first and `receiving_issue` second, so the published formula selects rows
   the screen does not.
3. **`Balance owed` can go negative in §9's arithmetic and cannot in the code**, which clamps
   per line (`min(qty, received_qty)`) precisely so a stray over-receipt cannot make the total
   read as more than ordered.
4. **§9 says *"the unit is the PO line"* while `poReceivingProgress` sums ACROSS lines and
   returns ONE state for the whole PO.** Both statements are defensible; together they are how
   a reader concludes the line-level formula drives the PO-level pill.

**Build.** Correct §9 to what the code does — **the code is the authority here, because it is
what the operator sees.** State the four-rung ladder with its PRECEDENCE (the order is the
rule), keep the stored-quantity table, keep the clamp, and say plainly which numbers are
per-line and which are per-PO.

**Done when.** §9 and `po-receiving.ts` agree rung for rung · the precedence is written as an
ORDER, not a set · a reader can tell per-line from per-PO without opening the code.

**Must NOT.** ❌ change any code to match the document — this card moves the document ·
❌ silently drop §9's frozen rulings that are still true (the two status axes · no `Draft` ·
`Open` never on screen) · ❌ fold R9's `Cancel Outstanding` amendment in here; that one ships
with R9, in R9's PR.

**A SECOND §9 CONTRADICTION, found independently 2026-08-05 — fix it in the same card.**
§9 publishes the To Order test as `required_qty > po_qty`. The code asks a different
question entirely (`apps/api/src/routes/operation/to-order.ts:542-557`):

```
Σ(qty − received_qty)     over purchase_order_lines
                          where purchase_orders.status = 'open'
```

Two differences, both load-bearing: a **part-received** line still supplies its balance, and
a **cancelled** PO supplies nothing at all — `po_qty` alone says neither. **This one misled
this chat while it was writing the section above**, which is the evidence that it misleads.
The code is the authority; the document moves.

## R11 · The Inventory consequence is wired to the resolution

**Lane: ④ R.** **Read THE THREE CONSEQUENCES first.** **MIGRATION: probably none — prove it.**

**Goal:** choosing a resolution moves the goods, once, through the machine that already
exists — never a second thing an operator has to remember.

**ALREADY EXISTS, and it is why this card is small.** R4 / 0299 already built **three of the
four** stock outcomes, under names that match Loo's table one for one:

```
Return Goods   →  returned_to_supplier    ✅ exists
Write Off      →  written_off             ✅ exists
Accept As-Is   →  back_to_stock           ✅ exists
Replace        →  the receive engine      ✅ exists
Repair · Refund · Cancel Outstanding      →  no stock move at all
```

**Nothing new is built. This is WIRING.** A chat that proposes new stock statuses has not
read 0299.

**Done when.** The stock move is a consequence of the resolution, and 0299's transition
guard still refuses every illegal destination (`on_hold` may never reach `reserved`, `sold`
or `transferred`).

**Must NOT.** ❌ add a parallel stock table · ❌ re-open R4's per-claim-not-per-unit
carry-forward — **R9 closes it by ruling** · ❌ gate the stock move on the claim closing:
goods and paperwork move on different days (R4's own rule).

## R12 · The money on a claim, and the Finance queue

**Lane: ④ R + Finance.** **Read THE THREE CONSEQUENCES first — especially the Finance rule.**
**MIGRATION: yes. Its action needs five strings in `docs/COPY-STANDARD.md`.**

**Goal:** a resolution with a financial consequence raises ONE action, owned by Finance,
that completes on evidence from outside the portal.

**ALREADY EXISTS: nothing — and that is the measurement.** `supplier_claims` has **28
columns and not one is money** (measured 2026-08-05), and `supplier-claim.ts` says so in its
own header: *"nothing in this module speaks money"*. The cost sits in
`purchase_order_lines.cost` and the claim has never read it.

**Done when.** Finance has a queue of its own · Operations never sees AP · Finance never
sees photos · every item completes on a reference from outside the portal · `Accept As-Is`
can carry a discount.

**Must NOT.** ❌ build a tick-box completion — the whole reason the queue survived its
challenge is that it does not have one · ❌ build AP, a supplier ledger, or a credit-note
document: the Portal owns the ACTION, the accountant owns the accounting · ❌ let a money
figure reach the Claims screen — Operations does not see AP.

---

# THE CLAIMS WORKSPACE — frozen by Loo 2026-08-05

> **RESUME POINT: [`docs/CHECKPOINT-claims.md`](CHECKPOINT-claims.md)** — what was ruled, what was measured, which card sits on which TAB, and the findings this lane is carrying. Paste its §4 to start a new chat.

> **Claims is not designed on its own. It is Purchasing's EXCEPTION WORKSPACE.**
>
> **The骨架 is right and one LAYER is missing.** Queue ✅ · List ✅ · Expand ✅ · Data ✅ ·
> Status ✅ — what is absent is the **Workspace layer**. **This is not a rebuild, and a chat
> that rebuilds the page has misread this section.** Three cards already shipped on it:
> P2 (#494) gave it the portal's click law, R8 (#499) fixed its words, D7-Claims (#612) moved
> it onto the kit with eight measured column widths.

## W1 · The reference model is SAP QM, not Zendesk (Loo, 2026-08-05)

**Workflow may be borrowed from Zendesk / ServiceNow. The DATA MODEL may not.**

A Zendesk ticket exists on its own. **A claim cannot** — 0288's trigger means it is born from
a PO line and is bound to `PO · Receipt · SKU · Supplier` forever. That is SAP QM's Quality
Notification, and it changes three things in the design:

1. **THE WORKSPACE HAS NO "NEW CLAIM" BUTTON, AND NEVER WILL.** Every other Purchasing tab is
   defined by a create verb — To Order `Issue PO` · Receiving `Check in` · Purchase Orders
   `Issue PO`. **Claims has none, and that is why it read as having no protagonist.** Its
   protagonist is the verb that ENDS a claim, not one that starts it.
2. **The context header is MANDATORY and may never be collapsed** — `PO · SKU · Supplier ·
   DO`, always on screen. QM's notification always carries its reference object, and the
   operator opening this tab has not seen it for three weeks.
3. **The queue aggregates by SUPPLIER and PO, not by ticket priority.** Three claims against
   one supplier are **one phone call**, not three.

## W2 · The four regions, and they are already law

Loo's layout maps one-for-one onto `PURCHASING-INFORMATION-MODEL.md` §12.7.5, frozen
2026-08-04. **Nothing new is designed here; §12.7.5 is applied to Claims:**

```
┌──────────────┐
│ Queue        │   the rail — P2 already built it
├──────────────┤
│ Claim List   │   the kit table — D7-Claims already built it
├──────────────┤
│ Claim Form   │  →  the EXPAND · §12.7.5's WORKING AREA. Resolution is decided here
├──────────────┤
│ Timeline     │  →  the RIGHT PANEL · §12.7.5's ACTIVITY. History, never the editor
└──────────────┘
```

**One editing surface (§12.7.5 rule 3). The panel does not edit.**

## W3 · Consequences may be STATED before they can be EXECUTED

**Loo overruled the claim that a Consequences region would ship as an empty shell, and he was
right — but the ruling has one measurable condition, and it is the whole difference:**

| | |
|---|---|
| **STATE the consequence** | the resolution → three-consequence mapping is a **PURE FUNCTION**. Zero migration. Every cell is a derived true sentence |
| **EXECUTE the consequence** | R11 (Inventory) and R12 (Finance). Migrations |

> **A region may say `No action required` only when it KNOWS there is none.** A region that
> renders blank because nothing computed it looks identical on screen and is the failure this
> condition exists to catch. **So the mapping ships in the SAME card as the region.**

**`Coming soon` is REFUSED.** It is not in `docs/COPY-STANDARD.md`, it is a promise about the
product rather than a fact about the claim, and it rots on screen after the feature lands.

```
Inventory   Receive replacement       ← the true sentence. No button yet
Finance     No action required
```

**The region states the fact; the BUTTON states the capability.** Facts ship now, buttons
ship with R11 · R12.

## W4 · Owner — and it is NOT a new column

**Measured 2026-08-05: a claim has no person.** Its four actor columns (`reported_by` ·
`requested_by` · `responded_by` · `closed_by`) record who did a PAST event, and
`claimNextMove`'s owner is `carres | supplier` — **a side, not a human.**

**Loo ranks this above the Timeline and that ranking is accepted. The fix is not an
`assigned_to` column on `supplier_claims`:**

- `PURCHASING-WORKING-FLOW.md` **§5 already designed it** — `(action identity) → claimed by →
  claimed at`, auto-expiring, and it explicitly forbids minting a task row per action.
- **§3 already names the default owner** of every purchasing action: the **PO-duty holder**
  (`org_duties`).
- **C6 ruled the same shape for Orders**: the order's PIC owns every action of that order, and
  no action carries an owner field.

> **A claim's owner is DERIVED from `org_duties` — zero columns, a name on screen in W-1.**
> **Taking over** is §5's Purchasing-wide mechanism, which has never been built anywhere.
> **Claims USES it; Claims does not invent it** — a second ownership model is
> `ops_order_control.balance`'s disease in a new coat.

## W5 · The build order, and the ONE engineering call inside it

```
W-1   the Workspace layer                              ZERO MIGRATION
W-2   R9    the seven resolutions become a real field
W-3   R11   Inventory executes      (0299 already ships 3 of 4 — wiring)
W-4   R12   Finance executes + the money
W-5   R14   Receiving sees its Claims               ← THE RECEIVING LANE'S
```

**Every step is usable on its own, and the layout does not move when the later ones land** —
that is why the regions are all present from W-1 and only their buttons appear later.

**DECIDED BY THE PLAN CHAT, not escalated — it is a sequencing call, not a business rule:**
**W-1's Resolution region reads today's `requested_action` + `supplier_response`.** It does
NOT wait for R9. The reason is Loo's own argument for shipping the region at all — *the
business decision already exists* — and it is true in the code today: those two columns are
live and the panel's `What we asked` / `Settle it` blocks already render them. W-2 then
upgrades the region's contents without moving one pixel of the layout.

---

## R13 · Claims becomes a Workspace (W-1)

**Lane: ④ R. MIGRATION: NONE. Read W1–W5 above before anything.**

**ALREADY EXISTS — do not rebuild any of it:** the queue rail (P2 #494) · the kit table and
its eight measured widths (D7-Claims #612) · the words (R8 #499) · the 504-line claim panel
with `The goods` · `Evidence` · `What we asked` · `Settle it` · `Closed`.

**To build:** §12.7.5's two-tier split applied (expand = working area, right panel =
Activity) · the un-collapsible context header · the Timeline's first four rungs, derived from
`reported_at → requested_at → responded_at → closed_at` · the Consequences region **with its
pure mapping function** · the Owner, derived from `org_duties`.

**DONE WHEN:** the four regions are on screen · the Timeline reads off existing timestamps
with **no migration** · every Consequences cell is a derived sentence and none is blank ·
a name appears as Owner · **there is no create button and no `Coming soon` string anywhere.**

**MUST NOT:** ❌ rebuild the page · ❌ add `assigned_to` to `supplier_claims` · ❌ let the
right panel edit anything · ❌ collapse the context header · ❌ touch `OperationReceiving.tsx`.

## R14 · Receiving sees its own Claims — **THE RECEIVING LANE'S CARD, NOT OURS**

**Measured 2026-08-05: `OperationReceiving.tsx` mentions `claim` exactly ONCE in the whole
file.** Receiving is effectively blind to what it produces, and a claim is born from a
receiving exception — so the Receiving summary should carry `Claims · n open · n closed`
without switching tabs.

**⚠️ NO PURCHASING SIBLING CHAT MAY BUILD THIS.** The open carry-forward
`receiving-queue-model-architecture-review` carries Jess's ruling of 2026-08-03: *"Do not
modify the Receiving module in this Purchase Orders workstream."* **It is recorded here so it
is not lost, and it is taken in the Receiving chat, on its own worktree.**

## Status

| Card | Status | PR |
|---|---|---|
| R1 | ✅ | [#401](https://github.com/wenwei4046/Carres-Portal-v2/pull/401) · 0284 |
| R2 | ✅ | [#412](https://github.com/wenwei4046/Carres-Portal-v2/pull/412) · 0288 |
| R3 | ✅ | [#428](https://github.com/wenwei4046/Carres-Portal-v2/pull/428) · 0291 |
| R4 | ✅ | [#454](https://github.com/wenwei4046/Carres-Portal-v2/pull/454) · 0299 |
| R5 | ✅ | [#475](https://github.com/wenwei4046/Carres-Portal-v2/pull/475) · no migration |
| R6 | ✅ | [#490](https://github.com/wenwei4046/Carres-Portal-v2/pull/490) · 0301 + 0302 |
| R7 | ✅ the Receiving design, Phase 1 — **docs + architecture only, NO migration** · RE-CUT by Loo 2026-07-29, so **it is no longer GRN duty auto-assign — that rotation is still REQUIRED and belongs to Administration / Work Assignment** (§3.16) | [#515](https://github.com/wenwei4046/Carres-Portal-v2/pull/515) |
| R8 | ✅ | [#499](https://github.com/wenwei4046/Carres-Portal-v2/pull/499) · no migration |
| R9 | ⬜ **one claim, one outcome — and a button that splits it** (Loo 2026-08-05, option A). AutoCount is already A: `Cancel Purchase Order` / `Goods Return` / `Purchase Return` are three documents and none holds two outcomes. **Three binding conditions:** R5 counts problem PO **LINES**, not claim documents (a split may not pollute a negotiation number) · the split is a **BUTTON** on the claim screen, never "go open a second claim" · the A→B upgrade path is written in the card (one row per claim, outcome copied, qty = whole). **`Cancel PO` leaves the outcome list for `Cancel Outstanding`** — line-level, undelivered qty only, demand returns to To Order **and lands in Overdue, correctly**. ⚠️ **Overrides `PURCHASING-WORKING-FLOW.md` §9's frozen no-per-line-cancellation rule — §9 updates in the same PR.** Build NOW: 0 claims live. Closes the R4 CF `hold-resolution-is-per-claim-not-per-unit` **by ruling** | — |
| R10 | ✅ **§9 rewritten against the code, 2026-08-05** — DOCS ONLY, one file, zero code. All six of the card's disagreements are closed, and **two of them came out different from the card once the code was read, which is the point of the card**. (1) **The card's own point 4 was imprecise**: `poReceivingProgress` does not return "one state per PO" — it returns one state per **SET of lines handed to it**, and there is a live caller that hands it exactly ONE (`RecordSupplierAnswerModal.tsx:181`, the balance-date sentence). §9 now publishes that as a table of screen → set → scope, because "per line vs per PO" is not a property of the function. (2) **`required_qty` is not a column and never was** — it greps to **zero** across the whole repository, so the retired formula's left-hand side named nothing; the real demand quantities are `order_lines.qty` and `purchase_demands.remaining_qty` (GENERATED, 0320), and typed demand was absent from §9's stored table altogether. Also closed: the 4-rung ladder is published **as an ORDER with each rung's business reason** · the clamp and its `Pending delivery` word (R1's locked vocabulary — `Balance owed` was a third name for the same number) · the To Order supply test · **`purchase_orders.status` is the 3-value `po_status` enum, a stored column, not the 5-word Operation Status axis** — a reader trap the old text left wide open. **Two things REPORTED and deliberately not folded in**: a SECOND on-screen ladder exists (`poWorkStateOf`, the register's rail) which reads the same clamped numbers and deliberately ignores damaged/wrong item — it is now documented beside the receiving ladder rather than merged with it, per Loo's two-axes freeze · **§9's no-per-line-cancellation ruling is untouched — that is R9's amendment and ships in R9's PR** | [#628](https://github.com/wenwei4046/Carres-Portal-v2/pull/628) · no migration |
| R11 | ⬜ **the Inventory consequence is wired to the resolution** — and it is WIRING, not building: R4 / 0299 already ships **three of the four** stock outcomes under names that match Loo's table one for one (`returned_to_supplier` · `written_off` · `back_to_stock`), and `Replace` is the receive engine. `Repair` · `Refund` · `Cancel Outstanding` move no stock at all | — |
| **R13** | ⬜ **Claims becomes a Workspace (W-1) — ZERO MIGRATION, and it is a LAYER, not a rebuild.** Queue · List · Expand · Data · Status all already exist. Adds §12.7.5's two-tier split, the un-collapsible `PO · SKU · Supplier · DO` header, the Timeline's first four rungs off existing timestamps, the Consequences region **with its pure mapping**, and an Owner derived from `org_duties`. **No create button — ever (SAP QM, not Zendesk). No `Coming soon`.** **DO FIRST** | — |
| **R14** | ⬜ **Receiving sees its own Claims** — measured: `OperationReceiving.tsx` says `claim` **once** in the whole file. **⚠️ THE RECEIVING LANE'S CARD.** Jess 2026-08-03 forbids any Purchasing sibling touching that page | — |
| R12 | ⬜ **the money on a claim, and the Finance queue** — `supplier_claims` has **28 columns and not one is money** (measured 2026-08-05); the cost sits in `purchase_order_lines.cost` and the claim has never read it. **A Finance Action completes on an EXTERNAL EVIDENCE reference** (the supplier's CN/DN number), never a tick-box — that is why §8 does not kill the queue. **2990s is the worked example of the failure**: its `purchase_returns.credit_note_ref` has exactly two readers in the whole repo, a PDF and a detail page. Operations never sees AP; Finance never sees photos. **`Accept As-Is` must be able to carry a discount** | — |
