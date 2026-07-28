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

## R7 · GRN duty — receiving assigns itself (from PORTAL_CORE_ENGINE, 2026-07-27)

**Concept (Jess's architecture doc):** the PO-duty holder does NOT do GRN; the OTHER
operational staff share receiving, round-robin, one owner per GRN — separation gives
independent verification (the person who ordered isn't the person who checks it in).

**ALREADY EXISTS — do not rebuild:** `org_duties` (HR-P2, 0260) holds duty keys incl.
PO-duty; the orders fair-split auto-assign (PRs #188-#192) is the proven distribution
pattern; the offset-1 PO/GRN rotation is today a HUMAN planning rule (memory:
Jul = Shasha PO / Yu Jun GRN) — R7 makes the system enforce what the roster already does.
**Build:** each receiving (R1's form) auto-stamps ONE owner: round-robin over active
operation staff EXCLUDING the current PO-duty holder; owner shows on the Receiving row +
a "My receiving" count. Manual reassign stays possible (manager override), logged.
**Needs R1 first** (the owner must have a form to own). Small migration likely (owner
column) — guardrail #8.
**Done when:** no GRN exists without exactly one owner; the PO-duty holder never
auto-receives their own PO.

## R8 · The banned-verb sweep across the Purchasing lane

**Three screens, one sweep, one PR.** Every word below is already ruled; none of this is a
design decision. Three separate rename cards for one law would be worse than one card that
crosses two lines inside the SAME lane (Purchasing / Receiving is one lane by the index's own
rule), which is why P2's finding was folded in here rather than becoming a P-card.

**⓪ The To Order stage cells** (`OperationPurchase.tsx`), found by P2 2026-07-28 and live on
screen right now: they read **`Send POs` · `Chase factory` · `Receive`**. The dictionary locks
**`Send PO` · `Confirm ready date` · `Check in`**, and **`Chase` is a BANNED word** — this is
not lag, it is a banned word shipped. Same fix as C1 did for Orders: read from the shared word
module. **The cells are a STAGE picker, not queue tiles** (UI-KIT §8.2, the no-empty-state
rule) — R8 renames them and changes no behaviour.

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

- Purchase Return flow (2990s has it — port, don't invent) · claim → service-case
  cross-link view (J2 covers the order side) · multi-warehouse On-hand filtering (the
  P4 note in OperationReceiving) · partner-warehouse (SSY/EU) logins after Klang proves R6
  · **Smart Cover** (staff on leave stop receiving NEW assignments automatically — needs
  leave data, which nothing tracks yet; when HR grows leave records, this becomes a card
  across orders-assign + R7 + S-line in one move).

## Status

| Card | Status | PR |
|---|---|---|
| R1 | ✅ | [#401](https://github.com/wenwei4046/Carres-Portal-v2/pull/401) · 0284 |
| R2 | ✅ | [#412](https://github.com/wenwei4046/Carres-Portal-v2/pull/412) · 0288 |
| R3 | ✅ | [#428](https://github.com/wenwei4046/Carres-Portal-v2/pull/428) · 0291 |
| R4 | ✅ | [#454](https://github.com/wenwei4046/Carres-Portal-v2/pull/454) · 0299 |
| R5 | ✅ | [#475](https://github.com/wenwei4046/Carres-Portal-v2/pull/475) · no migration |
| R6 | ✅ | [#490](https://github.com/wenwei4046/Carres-Portal-v2/pull/490) · 0301 + 0302 |
| R7 | ⬜ after R1 · GRN duty auto-assign | — |
| R8 | ⬜ any time · `Contact` → `Call` rename (words only, no migration) | — |
