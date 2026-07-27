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
| R5 | ⬜ | — |
| R6 | ⬜ after R1-R2 · warehouse login | — |
| R7 | ⬜ after R1 · GRN duty auto-assign | — |
