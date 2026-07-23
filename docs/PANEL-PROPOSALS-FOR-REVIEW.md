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
| 2 | Orders — **Detail** panel/drawer | 🟡 in progress | `docs/superpowers/plans/2026-07-10-order-panel-v3-spec.md` + `docs/CHECKPOINT-order-detail-v4-2026-07-16.md` |
| 3 | **Purchasing / Procurement** cockpit | 🔵 proposal (engine WIP) | `docs/purchase-procurement-plan.md` |
| 4 | **Payments / Collections** desk | 🟢 shipped, extensions pending | `docs/master-sheet-operating-model.md` |
| 5 | **Catalog** (Product & Maintenance, 9-tab) | 🟢 shipped | `docs/superpowers/plans/2026-06-25-2990s-products-9tab-parity-roadmap.md` |
| 6 | **POS** (dealer/showroom) | 🟢 shipped | `docs/superpowers/plans/2026-06-20-pos-2990s-alignment.md` |
| 7 | **Stock / on-hand** | 🔵 dependency (spec'd, not a panel yet) | (cross-team section in #3) |
| — | Cross-cutting: combined-ref split, order-activity log, doc numbering | 🔵/🟡 | `docs/2026-07-19-combined-ref-split-by-lead.md` |

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

**Full spec:** `docs/superpowers/plans/2026-07-10-order-panel-v3-spec.md` + latest checkpoint `docs/CHECKPOINT-order-detail-v4-2026-07-16.md`. Truth for the shipped state = SPEC §11/§12.

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

## 3. Purchasing / Procurement Cockpit  🔵 (the highest-value review target — engine WIP, UI not built)

**Full spec:** `docs/purchase-procurement-plan.md`. Branch `feat/purchase-mrp`. Logic ported from the sister company's "2990s ERP", rebuilt in Carres's UI-KIT.

### Business problem
Operations must buy the right goods, from the right supplier, early enough to hit each customer's deadline — without over-buying (money tied up) or under-buying (missed deadline). The business's real pain: **staff pad lead times "to be safe", producing the longest promised date = lost sales.**

### Proposed design
A **procurement cockpit** (called "Purchase page" in UI — the word "MRP" is banned): a top At-Risk radar (must-order-now · PO-late-to-chase · due-soon · to-receive) + three zones **Buy · Expedite · Receive**. Not an orders-list clone.

- **Two buying modes:**
  1. **Order-driven (make-to-order)** — sofa / bedframe / mattress (Nice Future): a customer order creates demand → raise a PO.
  2. **Forecast / reorder-point** — pillow + M.P (imported from China, ~2-month lead): pre-bought to stock, reorder when FREE stock hits **200/SKU**.
- **The net-requirements engine (pure, TDD, in `packages/shared`):**
  `to order = customer demand − FREE (unreserved) stock − qty on open PO`. Nets off stock + open POs so it never double-orders or misses. Greedy earliest-deadline-first allocation.
- **Lead times** — all editable defaults, counted in **working days** (Mon–Sat, skip Sunday + Selangor/national MY holidays):
  - Sofa 14 / peak 21 · Bedframe 7–10 · Mattress (Nice Future) TBD.
  - Peak season = Nov → Chinese New Year (separate lead profile, not year-round padding).
  - **Extra safety buffer default 0** — report the shortest credible date; don't lazy-pad.
  - **Raise-by = customer deadline − lead (working days).** ETA = order date + lead.
- **Short-delivery strategy** (the anti-padding levers): ready-stock-first = instant ~3-day promise; price promises off real supplier performance (scorecard: actual avg lead / on-time %); keep the customer promise (short) separate from the internal buffer (order early).
- **Order → PO → Receive:** demand → MRP shows netted shortage → group **one PO per supplier** (sofa = one PO per order / dye lot; mattress+bedframe merge into one bundle) → raise PO auto-costed from the Operation Catalog cost → PO PDF → send to supplier (v1 manual PDF; later one-tap WhatsApp) → **GRN receive** (partial OK, dye-lot = PO number, capture supplier DO) → stock IN → auto-reserve to the source order.
- **SKU model:** one SKU → one supplier → one cost (from `product_skus.cost`, migration 0226). No dual-code, no supplier price-matrix (simpler than 2990s).

### Locked decisions
- Cadence **C**: fixed review windows + urgent override; always **auto-SUGGEST, never auto-place** a PO.
- Mattress + bedframe review Mon/Wed/Fri (cycles skip if empty, look ahead to next).
- Sofa = one PO per order, no batching.
- Bed-set (mattress + frame) = one delivery bundle: raise-by = deadline − MAX(component leads); sofa is a separate trip.
- 5-colour urgency + a single "ready date" per trip.
- Forecast track watches pillow / M.P reorder < 200.
- Scope v1 = sofa + bedframe + mattress (Nice Future via portal now). Future subscription-mattress supplier is a separate later track.

### Open questions to review (genuinely open — this is what needs eyes before code)
- **Mattress (Nice Future) lead-time number** for the table — still TBD.
- **Peak-season exact start/end** (which day in Nov; CNY day or the week before).
- **Holiday calendar** — verify lunar/Islamic dates against the official Selangor gazette (starter data flagged as needs-verify).
- D1–D4 default parameters (defaults drafted, final sign-off pending).
- **Cross-team dependency (must align with the stock/on-hand model):** net requirements needs a per-SKU **FREE/available** quantity; GRN receive must post stock IN and auto-reserve to the source order; Klg (Klang warehouse) = the only real stock quantity, PJ Showroom = a filtered view of Klg.
- Is greedy earliest-deadline-first the right allocation when two orders compete for the same scarce stock, or should priority also weigh customer/payment status?

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

There is no standalone stock panel proposal yet, but the **Purchasing cockpit (#3) depends on a stock model** with these requirements (from the cross-team section of the purchase plan):
- Per-SKU **FREE (unreserved) / available** quantity exposed for net-requirements.
- **GRN receive posts stock IN and auto-reserves to the source order.**
- **Ready-stock-first** is the short-delivery lever.
- Pillow / M.P reorder point = 200 free stock per SKU.
- **Klg** (Klang warehouse) = the only real stock quantity; **PJ Showroom** = a filtered view of Klg.

**For review:** should stock become its own panel, or stay embedded in Purchasing (Receive zone) + Orders (Stock pill)? The current plan embeds it.

---

## Cross-cutting proposals

### A. Combined-Ref split by lead token  🟡 (spec + dormant helper; not wired)
**Full spec:** `docs/2026-07-19-combined-ref-split-by-lead.md`.

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

1. **Purchasing cockpit (#3)** — the net-requirements engine + lead-time / allocation model. It's the one panel where the code isn't written yet and the business logic is subtle (padding, peak season, bundle raise-by, scarce-stock allocation).
2. **The Outstanding / storage-fee money model** (#2, #4) — there's a known real bug (Outstanding = 0 for owing orders); the correct definition deserves scrutiny.
3. **Combined-ref rollout sequencing** (cross-cutting A) — a data-integrity change on shared prod that can create duplicates if mis-sequenced.
4. **The dormant-engine wake risk** (#5) — sofa/PWP/delivery have never run on live data.

*For any panel, the attached full spec file is the authoritative detail; this packet is the review-oriented summary.*
