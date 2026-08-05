# Carres Portal v2 — Panel Proposals (Review Packet)

> **Purpose:** a self-contained design brief for **each system panel**, so another AI (ChatGPT) can **review the proposed design BEFORE any code is written**. Read alongside `docs/PROJECT-HANDOVER.md` (project-wide context).
>
> Each panel below is written to be reviewable on its own — business problem → proposed design → locked decisions → **open questions to review**. The "Full spec" line names the repo file to attach if you want the raw, deeper doc (some are in Chinese; summaries here are in English).
>
> Compiled 2026-07-22. Live status authority: `CLAUDE.md §17`.

---

## How to read this packet (for the reviewer)

- **Status legend:** 🟢 shipped & live · 🟡 in progress (code partially exists) · 🔵 proposal only (no code yet — *this is where review matters most*).
- **Constraints every panel inherits** (don't re-litigate these in review — they're locked by the business owner):
  - Users read English poorly and aren't computer-literate → colour + party names + WhatsApp + one obvious button.
  - "What to do today" worklist, not a dashboard. Pre-compute what/how-many/who/when/price.
  - Plain language, no jargon (owner rejected the term "MRP" in UI). Specific dates (`31 Jul 26`), never vague words.
  - Design must use the `docs/UI-KIT.md` v4 token system (no new hex). Server is the price authority; money never moves silently.
  - DB is shared prod; migrations are additive + ship dormant.

### Panel index

| # | Panel | Status | Full spec file to attach |
|---|---|---|---|
| 1 | Orders — **List** redesign | 🟡 in progress | `ORDERS_LIST_SPEC.md` |
| 2 | Orders — **Detail** panel/drawer | 🟡 in progress | `docs/ORDER-DETAIL-INFORMATION-MODEL.md` (frozen 2026-07-28 — the highest business rule for this page) |
| 3 | **Purchasing / Procurement** | ✅ **SHIPPED** (all 5 tabs, P1-P4) · flow locked 2026-07-27 · **PO lifecycle + To Order information architecture frozen 2026-07-29** | `docs/PURCHASING-WORKING-FLOW.md` + `docs/PURCHASING-INFORMATION-MODEL.md` |
| 4 | **Payments / Collections** desk | 🟢 shipped, extensions pending | `docs/master-sheet-operating-model.md` |
| 5 | **Catalog** (Product & Maintenance, 9-tab) | 🟢 shipped | `docs/superpowers/plans/2026-06-25-2990s-products-9tab-parity-roadmap.md` |
| 6 | **POS** (dealer/showroom) | 🟢 shipped | `docs/superpowers/plans/2026-06-20-pos-2990s-alignment.md` |
| 7 | **Stock / on-hand** | 🔵 dependency (spec'd, not a panel yet) | (cross-team section in #3) |
| — | Cross-cutting: order-activity log, doc numbering | 🔵/🟡 | `docs/execution-queues-index.md` |

---

## 1. Orders — List Redesign  🟡

**Full spec:** `ORDERS_LIST_SPEC.md` (Chinese). Scope: header + listing only; the detail panel is a separate proposal (#2).

### Business problem
Carres outsources production and must chase many parties (suppliers, logistics partners like NETS/TEOW, the France ordering side). Things fall through the cracks with nobody following up. The core job of this page: **"at a glance, see where something is missing and what to chase."**

### Proposed design
A dense, AutoCount-style table (not cards), driven by the operations "Master Sheet".

- **Collapsible 3-layer header** (state remembered in localStorage):
  1. Title + buttons (Search · Import Master · Import AutoCount).
  2. **Alert banner** — system proactively surfaces issues, e.g. "12 from AutoCount need confirming"; multiple collapse to "N alerts ▾".
  3. **Filters** (collapsible) — a "Needs action" radar of pills (No ETA · No PO · Collect $ · Follow-up · For Jess) + 6 stackable filter cards (Due · Stock · Category · Region · Logistic · Status), all reusing existing count logic.
- **Listing** — two pinned zones:
  - `📌 Pinned` (staff manually flag an order → floats to top, survives paging).
  - `All orders · by deadline` (default sort = delivery deadline ascending; overdue first).
  - **11 columns:** `⚑pin · ☐ · Ref · Customer · Region · Deadline · MS · BF · Sofa · Stock · Next action`. (MS/BF/Sofa = per-category unit counts parsed from the Master sheet.)
  - **Ref is primary** (bold), SO id is the small secondary line. Staff recognise the Ref, not the system SO number.
  - **Stock pill (4 states):** ● Ready (green) · ● Waiting (amber, PO placed, awaiting goods) · ● No PO (red) · ● Partial (grey).
  - **"Next action" column** — the heart of the page. System auto-computes ONE action per row from existing signals, with a strict priority ladder: `Collect $ > Supplier overdue > No PO > Waiting stock > Assign logistic > Logistic no-ETA > Call customer > Schedule delivery > Done`. Staff can override but must give a ≥5-char reason.
  - **Payment hold:** if the customer owes money, the green "ready" light is suppressed and delivery actions are **locked (🔒)** behind a red "Collect $" until paid.
- **Bulk bar** (dark, appears on selection): Assign logistic · Export · Print · Mark done · Clear.

### Locked decisions (by Jess, COO)
- Only the list changes; the detail panel is out of scope for this proposal.
- Colour appears ONLY on: Next-action pill · Stock dot · Alert banner · radar pills · near-due dates. Everything else neutral; zones separated by lines, not colour.
- Supplier lines use "overdue / waiting / no PO" language; the word "ETA" is reserved for logistics only.
- Reuse ALL existing count algorithms and `readinessOf`/`stockMatchKey`/`STOCK_BUCKETS` — do not touch them (they're shared with the detail panel).

### Open questions to review
- Is the single "Next action" per row (with a priority ladder) the right model, or should a row be able to show two parallel actions (e.g. a money line AND a supplier line)?
- The payment-hold lock (🔒) couples money state to delivery readiness — is forcing "Collect $ before you can schedule delivery" too rigid for edge cases (e.g. VIP/goodwill deliveries)?
- **A cron that auto-creates "Contact customer" tasks may or may not actually be running** (code exists; a note elsewhere says not wired). If it isn't running, orders silently get missed — this needs verification before relying on it.
- Pagination caps ~200 rows (PostgREST) — the pinned-across-pages behaviour assumes the flag is server-persisted, not client-only. Confirm.

---

## 2. Orders — Detail Panel / Drawer  🟡

**Full spec:** `docs/ORDER-DETAIL-INFORMATION-MODEL.md` — the **Business Thinking Model**, frozen by Loo 2026-07-28 and the highest business rule for this page. Layout derives from it and from nothing else.

> **The three older layout documents were ARCHIVED 2026-07-28** to `docs/archive/order-detail/` and are **not a development source**. One (`2026-07-10-order-panel-v3-spec.md`) is kept as the single historical reference for what was shipped before the freeze; the two checkpoints are superseded in full. The summary below is likewise pre-freeze context, not a rule.

### Business problem
The order detail is the **hub** — every other module (stock, payments, procurement, service) cross-links back to it. It must let an inexperienced operator see the whole story of one order and take the next step, without leaking internal DB stage words.

### Proposed design (v3 → v4, "定稿" = finalised for the Delivery block)
- **Header:** overdue chip first (`[overdue 9d]`), then the ink-coloured deadline date. Date law `31 Jul 26` everywhere.
- A **combined route-map / timeline spine** (goods → delivery → money), fixed-width boxes (no rubber-banding).
- **Deadline is read-only** (auto-derived from AutoCount); a one-time "Postponed?" extension is the only manual override (migration 0196).
- **NOTES = an auto-dated append-only log** (not a free-edit textarea).
- **Chase = an auto-generated reminder text** (WhatsApp), with a `−Nd` tuner hidden behind a click.
- Explicitly **removed** a "customer-confirmed" tick — "we don't mark that."
- Money card must compute **Outstanding correctly** (a shipped bug computed Outstanding = 0 for 10 orders that actually owed money — flagged 🔴).

### Locked decisions
- Everything the panel shows must map to **real data that exists** — cut any field with no backing data.
- Keep the customer-facing 5-word state vocabulary; never show DB stage words.
- The detail panel shares readiness/stock logic with the list (#1) — changing one risks the other.

### Open questions to review
- Is an append-only auto-dated NOTES log the right call vs. free-edit? (It's better for audit but slower to correct typos.)
- The "one-time Postponed extension" — should a second postponement ever be allowed, and who authorises it?
- The Outstanding-calculation bug: what is the correct definition of Outstanding given storage fees + deposits + partial payments? (This is a genuine business-rule question worth the reviewer's eyes.)

---

## 3. Purchasing / Procurement  🟢 (SHIPPED — this section's old design is SUPERSEDED)

> **⛔ SUPERSEDED 2026-07-29. Everything this section used to propose has been replaced by
> shipped code and by two frozen documents. It is NOT a design to review and NOT a design to
> build from.**
>
> **Read these instead:**
> - [`docs/PURCHASING-WORKING-FLOW.md`](PURCHASING-WORKING-FLOW.md) — how Purchasing behaves
>   (the ONE flow file)
> - [`docs/PURCHASING-INFORMATION-MODEL.md`](PURCHASING-INFORMATION-MODEL.md) — the To Order
>   information architecture, **frozen 2026-07-29**
> - [`docs/PURCHASING-NEXT.md`](PURCHASING-NEXT.md) — what shipped and
>   what is next

**What this section claimed, and why every line of it had to go** (kept so the correction is
traceable, not as guidance):

| It said | Measured / ruled reality |
|---|---|
| 🔵 "engine WIP, UI not built" | **All five Purchasing tabs are shipped and live** (P1-P4) |
| a cockpit with three zones **Buy · Expedite · Receive** | the module is five TABS, and `Check in` has moved OFF To Order to Receiving (2026-07-29 boundary ruling) |
| lead times listed as fixed numbers (sofa 14 / peak 21 · bedframe 7-10) | **P1 (migration 0303) made every purchasing number a manager-edited setting**, per supplier × category, with change history. A supplier × category with no number reads `Set a number` and is held out of the plan — it never falls back to a default |
| "peak season = Nov → CNY, a separate lead profile" | **Peak season is explicitly NOT a mode and NOT a second set of numbers** (Jess + Loo, 2026-07-28). It is a manager raising one supplier's production time and lowering it again |
| "mattress + bedframe merge into one bundle" on a PO | consolidation is **across CUSTOMER ORDERS, not across categories** — every non-sofa line for one supplier merges into one PO; sofa splits |
| "**GRN** receive" as the act | `GRN` is the DOCUMENT. **`Check in` is the act** — the banned-verb sweep (R8) took `GRN`-as-a-verb, `Chase` and `Receive`-as-a-verb off the whole lane |
| "raise PO → PDF → send" as one step | the PO lifecycle was **redesigned and frozen 2026-07-29, then simplified on 2026-07-30**: **`Issue PO`** is the only business action that creates the official Purchase Order, and there is no preparation stage before it |

**The business problem it named is still true and is worth keeping:** operations must buy the
right goods from the right supplier early enough to hit each customer's deadline, without
over-buying; and **staff padding lead times "to be safe" produces the longest promised date
and loses sales.** That problem is what the frozen documents above now answer.

**Nothing in this section is an open question any more.** The ones it listed were closed by
P1 (the numbers), by the working flow (consolidation, peak season, cadence) or by the
2026-07-29 lifecycle freeze. Allocation across competing orders is the one genuinely open
item and it is tracked as **P5**, not here.

---

## 4. Payments / Collections Desk  🟢 (shipped; extensions pending review)

**Full spec / model:** `docs/master-sheet-operating-model.md` (storage-fee + balance rules). Live on `feat/orders-drawer`; deployed 2026-07-20.

### Business problem
Chase customers who owe money — but **check goods before chasing money** (催钱前先看货): don't chase someone whose goods aren't even ready.

### Design (as shipped) + what's proposed next
- A **stock-aware Collections Desk** with two queues: **Ready-to-chase** (goods ready, money owed) and **Waiting-stock** (owed, but goods not ready — don't chase yet).
- Row Manage actions: **Collect $ 🔒 · Done**. Row expand = record payment (mints a receipt number, no migration) + payment history + **promise-to-pay** (reuses `balance_due_date`) + Receipt PDF + Invoice PDF.
- **WhatsApp chase** popover + a pre-call brief.
- **Storage-fee rule (locked):** from ETA — mattress/bedframe RM150/month; sofa RM200 per 2 weeks; per commenced period, overridable (`computeStorageFee()` in `@carres/shared`).
- **Remaining (proposal, not built):** a storage-waiver lever, a collection-velocity KPI, bulk-remind.

### Open questions to review
- Storage-waiver lever — who can waive, and does a waiver need an audit entry / approval? (Money-touching → almost certainly yes.)
- Should "promise-to-pay" auto-snooze the row out of the chase queue until the promised date, or keep it visible?
- The page under-counts once the network outgrows one PostgREST page (client-side aggregation) — is a SQL month-aggregate endpoint worth building now or deferring?

---

## 5. Catalog — Product & Maintenance (9-tab)  🟢 (shipped, context only)

**Full spec:** `docs/superpowers/plans/2026-06-25-2990s-products-9tab-parity-roadmap.md`.

Reproduces the sister company's Products admin: **SKU Master · Modular · Special Add-ons · Fabrics · Maintenance pools · Combo Pricing · Delivery Fee · PWP · Promo.** Principal ("Master Admin") owns all pricing (DB-trigger locked). Most advanced pricing features (sofa combos, PWP vouchers, delivery fees, free gifts) ship **dormant** — zero authored rows means order totals are byte-identical until the principal turns them on. Included here so the reviewer understands the pricing surface the other panels depend on.

**Open question worth flagging:** several dormant engines (sofa, PWP, delivery) have **never run against live data** — the biggest untested risk in the system is the day the principal authors the first real rows.

---

## 6. POS — Dealer / Showroom  🟢 (shipped, context only)

**Full spec:** `docs/superpowers/plans/2026-06-20-pos-2990s-alignment.md`.

A catalog-first full-screen point-of-sale (01 CATALOG → 02 CUSTOMER → 03 CONFIRM), re-skinned to the flame `#C44D2B` look. Shared by dealer, showroom, BD, and principal-on-behalf. The submit pipeline (`DraftLine` → `POST /api/orders` → `create_order` RPC) is **contract-sacred** — nearly every feature is built to leave it untouched. Included so the reviewer knows the order-entry contract the other panels must not break.

---

## 7. Stock / On-hand  🔵 (dependency, not yet its own panel)

There is no standalone stock panel proposal yet, but **Purchasing (#3) depends on a stock model** with these requirements. *(Corrected 2026-07-29: "cockpit" was the superseded design's word; the source it cites, `purchase-procurement-plan.md`, was deleted 2026-07-27.)*
- Per-SKU **FREE (unreserved) / available** quantity exposed for net-requirements.
- **GRN receive posts stock IN and auto-reserves to the source order.**
- **Ready-stock-first** is the short-delivery lever.
- Pillow / M.P reorder point = 200 free stock per SKU.
- **Klg** (Klang warehouse) = the only real stock quantity; **PJ Showroom** = a filtered view of Klg.

**Answered, not open.** Stock became its own door — the `Stock` sidebar item with `On hand` / `In & out` / `Ready stock` (line ⑤, K0-K5, complete). It is not embedded in Purchasing, and there is no "Receive zone" — receiving is the `Receiving` TAB, and from 2026-07-29 `Check in` lives only there.

---

## Cross-cutting proposals

### A. Combined-Ref split by lead token  🟡 (spec + dormant helper; not wired)
**Full spec:** deleted 2026-07-27 — the live rule is `docs/PURCHASING-WORKING-FLOW.md`.

**The rule:** one customer holds several Ref numbers; the prefix names the goods (`CR…` vs `TCF…` = different products). The **lead (first) token** of a combined Ref identifies the order; trailing tokens are "delivered-with" cross-refs. So `CR1127+TCF0477` and `TCF0477+CR1127` are **two different orders**, not one.

**The bug:** the live import `normalizeRefs()` **sorts** the token set, merging two genuinely different orders into one. Impact today is **cosmetic** (both merged pairs are fully paid), but it's wrong data.

**Why not fixed unilaterally:** flipping the grouping key touches a shared import door owned by another developer (wenwei), and the ~116 already-imported orders were stored with sorted `source_ref[]` — a re-import after the flip would **create duplicates** unless a one-off re-key migration runs in the same deploy.

**For review:** the rollout sequencing (re-key migration + key flip + `master-append.ts` alignment, all in one deploy) — is it correct and complete? And is the "lead ref is stable across AutoCount re-exports" assumption safe?

### B. Order activity-history log  🔵 (planned, no code)
A tamper-proof append-only log per order → three views (operation / management / customer-future), auto-captured via DB triggers. Decisions locked, no code yet. **For review:** trigger-based capture vs application-level — trade-offs for a tamper-proof audit trail.

### C. Printable-doc numbering  🟢 (shipped, context)
All printable docs (loan note / receipt / DO / invoice) use `docNumber()` in `packages/shared`: format `PREFIX-DDMMYY-NNNN`, the 4-digit tail **hashed from the order id** (never a running counter → keeps sales volume private), per-order grouping, reprint-stable, amendments add `-B`.

---

## What I'd most want the reviewer to focus on

1. ~~**Purchasing cockpit (#3)**~~ — **CLOSED 2026-07-29.** The engine shipped, the lead-time model became manager-edited settings (P1 / migration 0303), peak season was ruled NOT to be a mode, and the PO lifecycle is frozen. **Scarce-stock allocation is the one item still open and it is tracked as P5**, not as a panel review.
2. **The Outstanding / storage-fee money model** (#2, #4) — there's a known real bug (Outstanding = 0 for owing orders); the correct definition deserves scrutiny.
3. **Combined-ref rollout sequencing** (cross-cutting A) — a data-integrity change on shared prod that can create duplicates if mis-sequenced.
4. **The dormant-engine wake risk** (#5) — sofa/PWP/delivery have never run on live data.

*For any panel, the attached full spec file is the authoritative detail; this packet is the review-oriented summary.*
