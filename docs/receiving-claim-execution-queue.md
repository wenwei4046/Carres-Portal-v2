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

## R2 · Receiving issue auto-becomes a case

**Goal:** any Damaged/Wrong-item qty (or an open Pending qty older than the supplier's
promise) auto-creates a **Supplier claim case**: PO · supplier · SKU · qty · photos
(required for damage/wrong — the S2 evidence law applies here too) · reported by/date.
Claim types DEPEND on category (same lists as S1: bed frame/sofa get Missing parts /
Wrong spec / Wrong colour / Colour uneven; mattress gets Wrong SKU / Damaged).
**Done when:** a receiving problem cannot exist without a case row chasing it.

## R3 · Claim lifecycle + supplier resolution

**Goal:** the case carries what WE ask (`Replace · Deliver missing parts · Deliver correct
item · Repair · Return for inspection`) and what the SUPPLIER answered
(`Replacement · Deliver remaining · Repair · Return & replace · Reject · Other agreement`)
— two separate fields, so "what we wanted vs what we got" is analysable. Chase via the
supplier's WhatsApp GROUP link (memory: suppliers recognise the CR/TCF ref, not PO#).
**Done when:** every open claim shows who owes the next move; closed claims keep both sides.

## R4 · Problem stock is quarantined (On hold / Returned to supplier)

**Goal:** damaged/wrong units flip to `on_hold` (with reason) so they can never be
allocated, reserved, or delivered; goods physically sent back flip to
`returned_to_supplier`; claim resolution flips them back to free (or writes them off).
**ALREADY EXISTS:** `ops_stock_items` per-unit statuses (incoming/free/reserved/void…) —
ADD statuses to the existing machine, never a parallel table.
**Done when:** a held unit is invisible to every sell/reserve/deliver path, provably.

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
| R1 | ⬜ | — |
| R2 | ⬜ | — |
| R3 | ⬜ | — |
| R4 | ⬜ | — |
| R5 | ⬜ | — |
| R6 | ⬜ after R1-R2 · warehouse login | — |
| R7 | ⬜ after R1 · GRN duty auto-assign | — |
