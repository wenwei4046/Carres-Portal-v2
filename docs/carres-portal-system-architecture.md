# Carres Portal · system architecture + business locks (LOCKED 2026-07-22)

> **THE master doc.** Any fresh chat OR external reviewer (Claude / ChatGPT / human) MUST read this first before touching any module. Explains the whole 8-module system, cross-module interactions, priority order, and (critically) the **business locks** that fresh chats keep missing because they live in memory.

**Owner:** Loo (Chairman, HOUZS Venture) via Jess (COO). All decisions below locked with them.

---

## How to review this portal (for Claude / ChatGPT / any external reviewer)

You are reviewing the Carres Portal — a make-to-order furniture operations system built on Vite + React + Hono + Supabase for a small Malaysia furniture company (Carres, ~1000 orders/month target, ~30 orders/day today, 4-8 ops staff).

**Read in this exact order:**

1. **`docs/carres-portal-system-architecture.md`** — THIS file (system overview + business locks)
2. **`docs/COPY-STANDARD.md`** — microcopy vocabulary rules
3. **`docs/UI-KIT.md`** §A0 — design laws
4. **`docs/purchase-cockpit-handoff.md`** §5 — the shipped reference implementation (Purchase cockpit, live at erp.carresofficial.com/operation?tab=purchase)
5. Module proposals in priority order:
   - `docs/orders-panel-concept-proposal.md`
   - `docs/purchasing-3panels-proposal.md`
   - `docs/inventory-module-proposal.md`
   - `docs/delivery-module-proposal.md`
   - `docs/payment-module-proposal.md`
   - `docs/right-rail-widgets-proposal.md`

**Then per module, answer 5 questions:**

1. Which LOCKED decision is riskiest? Why?
2. Are there real gaps missed by the doc's self-audit (a 9th gap)?
3. Any missing cross-module interaction with sibling modules?
4. Are the executable phases in the right order? Any dependency issues?
5. Is the rating trajectory realistic (e.g. 5→9/10 path sound)?

**Then give top 3 changes I should make**, prioritized P1/P2/P3. **Don't rewrite my doc — identify gaps + suggest fixes.**

**Critical rule for the reviewer:** the business locks in §3 below are NOT proposals — they are decisions made by Loo/Jess. Do not suggest changing them without flagging as "business decision — needs owner approval". You may critique them but not silently replace.

---

## §1 · What is the Carres Portal

**One-line:** the operations backbone for Carres, a make-to-order furniture retailer in Malaysia. Every customer sales order (SO) triggers a supplier PO → factory produces → 3PL delivers → payment collected. The portal orchestrates this end-to-end for staff who mostly have no ERP experience.

**Users (roles):**
- **Principal / COO (Jess)** — controls everything, edits pricing, approves refunds/waivers, sees Team view of workload
- **Operation staff** — the daily driver seat (assign logistic, chase supplier, collect payment)
- **Salesperson** — books orders at POS, reserves ready stock
- **Supplier** — logs into their own view to acknowledge POs, mark ready
- **Partner (3PL like NETS)** — logs into their own view to accept pickup, mark delivered
- **Finance** — reconciles bank statements, closes months

**Stack (do not change):**
- Web: Vite + React 18 + TypeScript + React Router 7 + Tailwind + shadcn/ui + TanStack Query
- API: Hono v4 on Cloudflare Workers
- Shared: zod + adapters + typed DB rows
- DB: Supabase Postgres + RLS + RPCs + Auth + Storage
- Deploy: Cloudflare Pages (web) + Cloudflare Workers (api)

---

## §2 · Module map (8 modules)

| # | Module | Status | Sidebar item | 1-line purpose |
|---|---|---|---|---|
| 1 | **Orders** | 🟡 half-shipped · proposal locked (PR #244) | Orders | Customer SO lifecycle: placed → proceed → pending → scheduled → delivered |
| 2 | **Purchasing** | 🟢 1/3 tabs shipped + proposal for others (PR #245) | Purchasing (3 tabs) | Supplier PO lifecycle: To Order (send) · Purchase Orders (chase) · Receiving (GRN) |
| 3 | **Inventory** | 🔵 proposal locked (PR #247) | Inventory (4 tabs, replaces Stock) | On hand · Ready stock · Movements · Reconciliation |
| 4 | **Delivery** | 🔵 proposal locked (PR #247) | Delivery (new module) | 3PL delivery lifecycle: To assign · In transit · POD queue |
| 5 | **Payments** | 🟡 basic shipped · proposal locked (PR #247) | Payments (4 tabs) | Money flows: Collect (customer AR) · Pay (supplier AP) · Reconcile (bank) · Refunds |
| 6 | **Service Cases** | 🟡 basic shipped · needs redesign (TBD) | Service Cases | Post-delivery lifecycle: Open → Investigating → Repair → Resolved → Closed |
| 7 | **CRM (Customers)** | ❌ not built · P3 future | Customers | Customer profile · lifetime value · history |
| 8 | **Reports / Analytics** | ❌ not built · P4 future (needs other modules mature) | Reports | Sales trends · supplier performance · P&L · storage-fee accrual |

**Also universal chrome:**

- **Right rail widgets** — 4 widgets (Calendar · Duty Board · Tasks · Activity) on every module (proposal PR #247)
- **Dashboard** — landing page with cross-module KPIs (exists, no proposal needed today)
- **Operation Catalog** — product catalog (exists, no proposal needed)
- **Suppliers** — supplier profiles (exists, no proposal needed)

---

## §3 · Business locks (fresh chats KEEP missing these — this section is the shield)

**These are OWNER decisions (Loo/Jess). Not proposals. Not up for design debate. Any change requires owner sign-off in chat.**

### 3.1 · Supplier lifecycle changes

- **Nice Future (mattress supplier) will STOP** (Loo 2026-07-20). A new **subscription-mattress** supplier replaces them. Sofa + bedframe stay one-off (Ohana / bedframe factories continue).
- **Build Purchase for sofa + bedframe FIRST** (they're one-off, immediate). Subscription-mattress = SEPARATE FUTURE TRACK, not part of Q3 planning.
- **Do NOT couple** subscription-mattress logic into current Purchase engine. Keep them independent so subscription can plug in later without ripping out current flow.

### 3.2 · Lead times (working days · editable per supplier eventually)

> **CORRECTED 2026-07-23 (Jess — supersedes the earlier 14/8/10).** Two numbers per category: an **official/safe** lead (drives raise-by = order early enough) and the shorter **actual/promise** lead (what we tell the customer).

- **Mattress (Nice Future):** **5–7 working days** (WILL STOP when subscription supplier lands)
- **Bedframe:** **5–7 working days** (same as mattress)
- **Sofa:** **14 working days official · ~10 actual** (supplier currently sends in 10 → promise the shorter credible date, don't pad to 14)
- **Peak OFF** — the engine NEVER auto-pads lead times for peak season. Human overrides only.
- A lead-time settings table = migration 0243 (deferred; draft-first per §7 guardrail #8). Design = an **official + actual** two-column table, per category, room for per-supplier.

### 3.3 · Go-live rules (Jess 2026-07-21)

- **Everything = TEST DATA** until go-live day. No test/real flag needed on records.
- **ONE FINAL wipe at launch** — all test SOs / POs / stock movements deleted.
- **NO more Master.xlsx import** at go-live. That was a 2026-06 stopgap, retired at launch.
- **NO more AutoCount import** at go-live. Also retired. Portal is the sole source of truth after launch.
- Backfill from Master.xlsx only if 2026-05 catch-up hits real production gap; otherwise skip.
- **Portal starts CLEAN** on launch day (Jess-driven wipe SQL, not automated).

### 3.4 · Storage fee model (LOCKED · migration 0165 shipped 2026-06-12 · in production)

- **Mattress + Bedframe:** RM 150 / month from ETA (per commenced period, override with Jess approval)
- **Sofa:** RM 200 / 2 weeks from ETA (per commenced period, override with Jess approval)
- Waiver requires Jess approval + reason logged in `audit_log`
- Storage owed BLOCKS delivery until paid or waived (PayHold gate — see 3.9)

### 3.5 · Warehouse / location taxonomy (LOCKED 2026-07-22)

- **Own · Carres Klang** — you own it, NETS operates it (NETS-managed 3PL). Only Own location shows in Ready stock.
- **Partner · HOUZS Balakong** — HOUZS owns it, alliance transit hub for outstation.
- **Supplier · At Ohana, At Nice Future** — supplier still holds title; goods not yours yet.
- **In-transit · with NETS driver / with TEOW / with TT** — dynamic movement state, NOT a fixed warehouse row.
- Do NOT model in-transit as a warehouse. Model it as a movement event between two fixed warehouses.

### 3.6 · Logistic partners (LOCKED)

- **NETS** — primary partner for KV + Klang deliveries. Also operates Carres Klang warehouse.
- **TEOW** — Johor + South Malaysia deliveries.
- **TT** — East Coast + Central Malaysia deliveries.
- **EU** — Singapore cross-border deliveries.
- **Auto-suggest by region** is Phase 5 work; Phase 1 = manual only.
- **HOUZS Balakong** — used as transit HUB for outstation (multi-leg delivery: Klg → HOUZS → customer via secondary partner). Do NOT confuse with logistic partner.

### 3.7 · State machines (do NOT touch without spec change)

- **Orders (customer SO):** `placed → proceed → pending → scheduled → delivered` (5 stages)
- **Purchase (supplier PO sup_status):** `pending → in_production → ready_for_pickup → shipped → delivered → received` (6 stages)
- **Delivery (proposed):** `to_assign → in_transit → pod_queue → terminal` (3 stages)
- **Service Case (proposed):** `open → investigating → repair → resolved → closed` (5 stages)
- All state machines locked. Migrations changing them are BIG changes; require Jess review + regression test suite.

### 3.8 · Communication channels (LOCKED — do not add without Jess ask)

- **Supplier communication:** WhatsApp (deep-link wa.me + Business API future). SMS + email discouraged (suppliers don't check).
- **Customer communication:** WhatsApp Business API (future) + SMS fallback + phone call (still primary today). Email = receipts only.
- **Partner (NETS/TEOW/TT/EU):** WhatsApp + phone. Email for formal claims.
- **Portal-internal:** in-app bell notification (bell 🔔 top-right). NO email spam.

### 3.9 · Payment law · PayHold gate (LOCKED)

- **Customer owes money (balance > 0 OR storage_owed > 0) → BLOCKS delivery Assign action.**
- Delivery module Assign shows modal: `Customer owes RM X · deliver anyway (Jess override) OR wait`.
- Jess override logs to `audit_log` with `reason` required.
- Payment first, delivery second. Non-negotiable except Jess override.

### 3.10 · MC (medical leave) buddy system (LOCKED)

- Every staff has a `buddy_id` (backup person).
- When status → `mc`, open tasks auto-reassign to buddy via RPC.
- No auto-reversal on return; manual reassign only.
- MC status transparent on Duty Board — everyone knows Ching is out this week and Joy inherits her tasks.

### 3.11 · Right rail widget content per module (cross-panel content matrix — LOCKED)

| Module | Calendar shows | Tasks shows | Duty shows | Activity shows |
|---|---|---|---|---|
| Orders | Delivery dates | Follow-ups (My/Team) | Full board | All SO events |
| Purchasing | PO order-by dates | PO chase tasks | Full board (PO duty highlighted) | All PO events |
| Inventory | Reconciliation cadence | Stock check follow-ups | Full board | Stock movements |
| Delivery | Delivery schedule | POD chase tasks | Full board (Escalation highlighted) | All delivery events |
| Payments | Payment due dates | Collect $ tasks | Full board | All payment events |
| Service Cases | Case SLA dates | Case follow-ups | Full board | All case events |

Same 4 widgets · content adapts to LEFT context.

### 3.12 · Operation team roster (LOCKED · corrected Jess 2026-07-24 · v2)

- **Jess** — Principal / COO. Owns Product & Maintenance, principal-only actions. **Monitor + escalation only — NOT in duty pool, NOT in team chip, never auto-assigned tasks.**
- **Shasha** (SH · teal-mint chip) — active operator · **July PO duty** (yesterday-checkpoint truth confirmed by Jess 2026-07-24).
- **Yu Jun** (YJ · lavender chip) — active operator · joined 2026-07-20 · **July GRN duty (offset-1 from PO)**.
- **Khor Yee** (KY · pink chip) — active operator · joins 2026-08-01.
- **Sha** — active (reception + ops) · in wider staff but NOT in Purchase duty pool.
- **Alvin** — active (added 2026-07-19) · in wider staff but NOT in Purchase duty pool.
- **Samantha** — RESIGNED (remove from all UI).
- ~~Li Ching · Joy · Manly (曼丽)~~ — **DO NOT EXIST · never did.** Delete any references in seed data, migrations, dropdowns, docs. (Manly was my mishearing 2026-07-24 morning — Jess corrected: Shasha = July PO duty per yesterday's checkpoint.)

Use these actual names in test data. Do NOT invent staff. **Whole operation team shares ONE login: `operation@carresofficial.com`** — no per-user auth; PIC identity is a soft in-app tag on `orders.pic`, not tied to `auth.users`.

### 3.16 · PO / GRN duty concept (LOCKED · Jess 2026-07-24)

- **人分单,货合买.** PIC owns the customer relationship (via `orders.pic`). Purchase orders consolidate company-wide.
- **PO duty = ONE person handles ALL PO send + chase for the month.** Not distributed by PIC. Not a team workload split. Monthly rotation (calendar month, MYT). Management (COO / operations manager) may override.
- **GRN duty = ANOTHER SINGLE person handles all GRN receiving for the month.** Independent slot from PO duty. Same monthly rotation, **offset-1 from PO** (so when Shasha is PO, Yu Jun is GRN — never same person).
- **Duty pool for Purchase = Shasha · Yu Jun · Khor Yee only.** Sha / Alvin are wider staff but do NOT rotate on Purchase duties. Jess (COO) is monitor + escalation, never on duty.
- **Rotation locked:** Jul PO=Shasha / GRN=Yu Jun · Aug PO=Yu Jun / GRN=Khor Yee · Sep PO=Khor Yee / GRN=Shasha · loops.
- **PO days: Mon / Wed / Fri (MYT)** — the 3 batching days for bedframe + mattress. Sofa POs can go any day (one PO per SO, dye-lot). URGENT BYPASS: order deadline inside stock lead window (MS/BF 7d · Sofa 5d) fires red on ANY day, must not wait for PO day.
- **Purchase middle panel shows TWO chips: PO duty holder + GRN duty holder.** NOT a per-person workload strip (that pattern belongs to Orders panel where PIC filters real order counts).
- Code today: `packages/shared/src/schemas/ops-po-duty.ts · PO_DUTY_DAYS_MYT = [1, 4]` (Mon+Thu) is WRONG — needs correction to `[1, 3, 5]` (Mon/Wed/Fri).
- Migration `0236_ops_po_duty.sql` seed originally wrote `Jul=Shasha · Aug=Li Ching · Sep=Khor Yee`. Prod was manually corrected on 2026-07-18 16:35 (~47min after the seed) — the Aug row was updated to `yujun@carres.com` (real account). **Prod state verified 2026-07-24 = Jul Shasha · Aug Yu Jun · Sep Khor Yee, all correct.** No follow-up migration needed. The originally-proposed 0243 reseed migration was DROPPED (would have destroyed the manual correction).

### 3.13 · Purchase — line-change policy (LOCKED · Jess 2026-07-24)

- **When a customer adds a line AFTER a PO is already sent → engine ALWAYS raises a 2nd PO.** Never auto-append to the existing PO.
- Reason: Carres suppliers (Ohana / Nice Future) sit on WhatsApp; a 2nd PO is cheaper than chasing a supplier for a second confirmation on an in-flight PO.
- UI: order detail shows "This order has N POs" when >1.
- Sofa is unaffected — it's already one PO per SO by dye-lot rule.

### 3.14 · Purchase — SO cancellation policy (LOCKED · Jess 2026-07-24)

- **SO cancellation is NOT allowed by default.** Requires principal (Jess) approval + reason logged to `audit_log`.
- When an approved cancellation happens with a PO already sent:
  - **Do NOT cancel the PO.** Let production finish.
  - **GRN the goods into stockpile (Own · Carres Klang)** as free stock.
  - **Engine auto-suggests the next pending SO** whose demand matches — operator confirms the transfer.
- There is NO "cancel PO + WhatsApp supplier stop" flow. Cancellation of a PO in-flight is not a supported path.
- Rationale: sunk-cost sensitive business (storage fees charged from ETA); accepting the goods + reassigning always beats trying to reverse supplier work.

### 3.15 · Purchase — stock allocation policy (LOCKED · Jess 2026-07-24)

- **Allocation rule: greedy earliest-deadline-first.** Payment status does NOT influence which SO gets free stock.
- Reason: PayHold (§3.9) already blocks delivery for unpaid customers. Adding payment tiebreaker to allocation would double-gate the same rule and complicate the engine for no operator gain.
- Corollary: an unpaid customer CAN be assigned stock in the engine — they just can't take delivery until the money clears.

---

## §4 · Data flow diagram (cross-module interactions)

```
                                              ┌──────────────┐
                                              │  Salesperson │
                                              │  at POS      │
                                              └──────┬───────┘
                                                     │
                                                     │ creates SO
                                                     ▼
                                              ┌──────────────┐
                                              │   Orders     │
                                              │   panel      │
                                              └──┬─────────┬─┘
                                                 │         │
                    (customer confirms ETA)      │         │  (money side)
                                                 │         └──────────────┐
                                                 ▼                         ▼
                                          ┌──────────────┐          ┌──────────────┐
                                          │  Purchasing  │          │   Payments   │
                                          │   To Order   │          │   Collect    │
                                          └──────┬───────┘          └──┬───────────┘
                                                 │ send PO             │
                                                 ▼                     │ collected
                                          ┌──────────────┐              │
                                          │  Purchasing  │              │
                                          │   Chase      │              │
                                          └──────┬───────┘              │
                                                 │ goods ready          │
                                                 ▼                      │
                                          ┌──────────────┐              │
                                          │  Purchasing  │              │
                                          │   Receive    │              │
                                          └──────┬───────┘              │
                                                 │ GRN                  │
                                                 ▼                      │
                                          ┌──────────────┐              │
                                          │  Inventory   │              │
                                          │  On hand +   │              │
                                          │  Ready stock │              │
                                          └──────┬───────┘              │
                                                 │ stock ready          │
                                                 ▼                      │
                                          ┌──────────────┐              │
                                          │   Delivery   │◄────── PayHold gate: if $ owing → BLOCK
                                          │   To assign  │              │
                                          └──────┬───────┘              │
                                                 │ assigned NETS        │
                                                 ▼                      │
                                          ┌──────────────┐              │
                                          │   Delivery   │              │
                                          │   In transit │              │
                                          └──────┬───────┘              │
                                                 │ POD uploaded         │
                                                 ▼                      │
                                          ┌──────────────┐              │
                                          │   Delivery   │              │
                                          │   Delivered  │              │
                                          └──────┬───────┘              │
                                                 │ post-delivery issue? │
                                                 ▼                      │
                                          ┌──────────────┐              │
                                          │Service Cases │              │
                                          └──────┬───────┘              │
                                                 │ needs refund?        │
                                                 └──────► ┌─────────────▼┐
                                                          │  Payments    │
                                                          │  Refunds     │
                                                          └──────────────┘

Right rail widgets sit on EVERY module and interlink (see §3.11 + right-rail-widgets-proposal.md)
```

**Critical cross-module rules:**

- **Orders proceed → Purchasing To Order** — when SO status flips to `proceed_order`, auto-triggers Purchasing to plan a PO.
- **Purchasing Receive → Inventory On hand** — GRN write path adds units to `ops_stock_items`, refreshes `stock_balances` rollup.
- **Inventory Ready stock reserve → Orders line stock_ready=true** — Book now action writes back to the SO.
- **Payments Collect success → Delivery unblock** — payment marked paid, PayHold cleared, Assign action re-enabled.
- **Delivery POD upload → Orders status = delivered** — POD close moves the SO to terminal state.
- **Service Case Refund approved → Payments Refunds ready-to-pay** — approval workflow crosses modules.

---

## §5 · Priority order (what to build first · why)

| Priority | Item | Reason to do FIRST | Effort |
|---|---|---|---|
| **P1** | Orders Phase 0 + Phase 1 (copy audit, row action-line, What-to-do) | Orders is half-done; safe non-structural fixes lift readability without risking layout | 2h + 2h review |
| **P2** | Purchase strip polish (PR #246 already shipped code) | Merged + verified; just deploy | Deploy only |
| **P3** | Payments Phase 0 + Phase 1 (Collect tab cockpit) | Money is daily bleeding-point; storage fees uncollected, balance holds delivery | 4h + 3h review |
| **P4** | Inventory Phase 0 + Phase 1 (rename + module tab merge) | Safe rename; unlocks Reconciliation tab work | 2h + 2h review |
| **P5** | Delivery Phase 0 + Phase 1 (module skeleton) | New module; Phase 0 must extract real partner rules | 3h + 2h review |
| **P6** | Right rail Phase 0 + Phase 1 (rename widgets + audit) | Chrome that touches everything; low risk baseline | 3h + 2h review |
| **P7** | Orders Phase 2 (3-pane split, kill drawer) | BIG change; needs regression suite | 3h + 3h review |
| **P8** | Purchase Orders redesign (Phase 1-4) | 2nd Purchasing tab; 4 supplier tabs → unified | 16h across 4 PRs |
| **P9** | Receiving redesign (Phase 1-4) | 3rd Purchasing tab | 14h across 4 PRs |
| **P10** | Payments Phase 2 (Pay tab · supplier AP) + Phase 4 (Reconcile) | Foundation for closing months | 11h |
| **P11** | Inventory Phase 3 (Ready stock + Book now) | Salespersons blocked without this today | 5h |
| **P12** | Inventory Phase 4 (Reconciliation with your Excel) | Weekly ops workflow, needs SKU + supplier aliases | 7h |
| **P13** | Delivery Phase 2-4 (3-pane · assign · POD) | Full lifecycle | 11h |
| **P14** | Right rail Phase 2-4 (Duty Board + interlink) | Multi-module interlink cascade | 12h |
| **P15+** | Service Cases redesign, CRM, Reports | Later arcs when Q3 foundation ships | Multi-month |

**Total from P1 to P14: ~90h impl + 60h review = ~150h across 3-4 months if 1 person half-time on this.**

---

## §6 · Design laws (LOCKED · in all module proposals but summarized here)

1. **COPY-STANDARD** — 10 microcopy rules, canonical vocab (SO for customer sales order, PO for supplier purchase order, Send/Chase/Receive/Remind/Placed/Proceed)
2. **UI-KIT §A0** — Module-tab law (drop breadcrumb + title on module-tab pages), Copy law (must read COPY-STANDARD before writing UI text), Date law (fmtDate everywhere), Hover law (blue tint), Action law (Manage column .pill only)
3. **3-pane inline split** — facet 200 · list 420 · detail always visible (kill drawer overlays)
4. **Compact pill stage tabs** — ~40px pill row (not tall KPI cards)
5. **Row action-line** — every row ends with a ≤10-word action-line (verb + object + when)
6. **Inline What-to-do** — horizontal 3-4 step block in detail pane per stage
7. **Something wrong? (soon)** — every stage has an escape-hatch stub button
8. **Step 1-2-3 pedagogy** — every widget/panel has Red-fix / Yellow-do / Green-plan explicit
9. **Right rail interlink** — widgets cascade to each other + LEFT panel (Phase 4 non-skippable)
10. **Transparency law** — Duty Board visible to ALL staff, no role gating

---

## §7 · Anti-drift note (LOCKED)

**If a fresh chat / external reviewer disagrees with any decision:**

1. Business locks in §3 → **flag to owner, do NOT silently override**. These are Loo/Jess decisions.
2. HARD-locked module decisions → ask Jess in chat first.
3. NEGOTIABLE-locked module decisions → open a doc-amendment PR with new reasoning.
4. Design laws in §6 → follow strictly; if a page violates, revert the page.

**Never silently redesign.** Every change from spec = a conversation.

**Watch for these fresh-chat traps:**

- "Just add another top tab" — no. 3 tabs Miller's Law, extras go in facet.
- "Move breadcrumb back to top" — no. Module-tab law killed it.
- "Restore drawer overlay" — no. 3-pane inline is a LOCKED win.
- "Split by category" for Orders — no. SO is one document.
- "Nice Future is still active" — no (Loo 2026-07-20 — stopping, subscription supplier replaces).
- "Import Master.xlsx" — no (Jess 2026-07-21 — clean start, no imports at go-live).
- "Just remove the pin flag" — no. Pin (personal bookmark) is distinct from Follow-up task (assigned).

---

## §8 · Review packet checklist (for pass-out to Claude / ChatGPT / human reviewer)

Send this checklist along with the docs:

- [ ] Read this master doc first
- [ ] Note the 12 business locks in §3
- [ ] Understand the data flow diagram in §4
- [ ] Read each module proposal in priority order
- [ ] For each module, answer the 5 questions
- [ ] Give top 3 changes prioritized P1/P2/P3
- [ ] Do NOT rewrite docs — identify gaps + suggest fixes
- [ ] Flag anything in §3 you'd change → owner decision, not review
- [ ] Timeline for review: 1-2 hours per reviewer

**All doc links (open in order):**

1. https://github.com/wenwei4046/Carres-Portal-v2/blob/main/docs/carres-portal-system-architecture.md (this file)
2. https://github.com/wenwei4046/Carres-Portal-v2/blob/main/docs/COPY-STANDARD.md
3. https://github.com/wenwei4046/Carres-Portal-v2/blob/main/docs/UI-KIT.md
4. https://github.com/wenwei4046/Carres-Portal-v2/blob/main/docs/purchase-cockpit-handoff.md
5. https://github.com/wenwei4046/Carres-Portal-v2/blob/main/docs/orders-panel-concept-proposal.md
6. https://github.com/wenwei4046/Carres-Portal-v2/blob/main/docs/purchasing-3panels-proposal.md
7. https://github.com/wenwei4046/Carres-Portal-v2/blob/main/docs/inventory-module-proposal.md
8. https://github.com/wenwei4046/Carres-Portal-v2/blob/main/docs/delivery-module-proposal.md
9. https://github.com/wenwei4046/Carres-Portal-v2/blob/main/docs/payment-module-proposal.md
10. https://github.com/wenwei4046/Carres-Portal-v2/blob/main/docs/right-rail-widgets-proposal.md

**Live portal to poke:** https://erp.carresofficial.com/operation?tab=purchase (sign in `operation@carres.com / 111`, read-only, safe to click).
