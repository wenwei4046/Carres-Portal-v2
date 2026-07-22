# Delivery module — full proposal (LOCKED 2026-07-22)

> Spec for the NEW Delivery module — replaces the fragmented delivery affordances currently spread across Orders/Purchase panels. Locked with Jess (COO) 2026-07-22.

---

## How to resume (any machine, any new chat)

Paste this into a fresh chat:

> Continue Delivery module build. Read in order:
> 1. `docs/delivery-module-proposal.md` — this file, the SPEC
> 2. `docs/COPY-STANDARD.md` — microcopy rules + canonical vocabulary
> 3. `docs/UI-KIT.md` §A0 — Module-tab law, Copy law
> 4. `docs/purchase-cockpit-handoff.md` §5 — Purchase cockpit reference (design language proof)
> 5. `docs/orders-panel-concept-proposal.md` — Orders sibling (Delivery is the deep-dive view of Orders' ② 送 track)
> 6. `docs/purchasing-3panels-proposal.md` — Purchasing 3-panel sibling
> 7. `docs/inventory-module-proposal.md` — Inventory sibling (Delivery moves stock out of Inventory)
>
> Live-poke `https://erp.carresofficial.com/operation?tab=purchase` for the visual language.
>
> Start with **Phase 0 · user research** (observe operator + 1 partner-coordination call).

---

## Contract

- **NEW module** — no existing "Delivery" sidebar item today. Delivery affordances live in Orders' Next-action ladder + Purchase's Receiving tab.
- **Reverse view of Orders' ② 送 track** — Orders panel views delivery FROM a customer SO angle; Delivery module views it FROM a partner/schedule angle. Same underlying data (deliveries + linked SOs).
- Zero danger-zone breakage — no touch to Orders state machine or Purchase engine.
- One PR per phase.
- Deploy only from `main`.

---

## LOCKED decisions

**HARD:**

| # | Decision | Why |
|---|---|---|
| 1 | Module name = **Delivery** (not Logistics) | Customer-facing word; Odoo/Shopify/Amazon standard; SAP calls it "Logistics Execution" but that's too corporate for Carres |
| 2 | 3 stage tabs = **① To assign · ② In transit · ③ POD queue** | Real lifecycle: stock-ready-need-partner → partner-picked-up-en-route → delivered-POD-needed |
| 3 | Partner sub-tabs (Row 2) = **All / NETS / TEOW / TT / EU** | Direct partner filter faster than facet; Purchasing 3-panel taught us this |
| 4 | Call customer flow spread across ALL 3 stages via What-to-do | Real ops reality; not a stage of its own (Odoo/Shopify agree) |
| 5 | 3-pane inline split (facet 200 · list 420 · detail fills) | Consistency with Purchase + Orders + Inventory (module discipline) |
| 6 | Row action-line per Delivery (COPY-STANDARD template, ≤10 words) | Zero-experience friendly |
| 7 | POD photo upload = detail-pane action + file preview inline | Simple upload flow; no separate `photos` tab needed |

**NEGOTIABLE:**

| # | Decision | Alternative |
|---|---|---|
| 8 | Partner sub-tabs vs facet-by-partner | Could be facet if partners grow beyond 5 |
| 9 | POD queue as separate stage (Delivered but no POD photo yet) | Could fold into "In transit → Delivered" if operators find POD-catchup workflow smooth |
| 10 | Assign logistic includes auto-suggest by region + weight | Could be manual-only in Phase 1, auto-suggest in Phase 5 |
| 11 | Chase logistic threshold (2 days late = red) | Configurable per partner |

---

## Executive rating trajectory

| Point | Rating | State |
|---|---|---|
| Now | 0/10 | Module doesn't exist; delivery work scattered across Orders + Purchase |
| After Phase 1 (module skeleton) | 4/10 | Basic 3-tab shell + read-only data |
| After Phase 2 (3-pane + facet + row action-line) | 6/10 | Cockpit discipline applied |
| After Phase 3 (partner tabs + assign logistic) | 7/10 | Real assign flow |
| After Phase 4 (POD upload + chase) | 8/10 | Full lifecycle |
| After Phase 5 (Phase 0 findings + auto-suggest partner) | 9/10 | Live-tuned |
| After 2 weeks live-usage | 10/10 | Only real ops reveals |

---

## Full ASCII layout

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ Delivery │ [① To assign 8 · 2 late] [② In transit 5] [③ POD queue 12] │ Today · ⟳ 🔔 ❓ ⚙  │  Row 1 · 42px
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ [ All partners ] [ NETS 12 ] [ TEOW 6 ] [ TT 4 ] [ EU 3 ]                                    │  Row 2 · 32px · partner sub-tabs
├──────────┬────────────────────────────────────┬──────────────────────────────────────────┤
│ FACET    │ MIDDLE LIST                         │ DETAIL (always visible)                    │
│ (200)    │ (420)                                │ (fills)                                    │
│          │                                      │                                            │
│ NEEDS    │ 🚚 SO-1204 · ella · Klg → KL        │ Delivery for SO-1204 · ella               │
│  Late 2  │ ② In transit · NETS                 │ Pickup Klg → Deliver KL (Ampang)          │
│  No POD 3│ Call customer 30 min before.         │ ─────────────────                          │
│  No addr 1│                                      │ Assigned NETS · 21 Jul 14:00               │
│          │ 🚚 SO-1207 · PETER · Klg → Klang    │ Picked up · 22 Jul 08:30                  │
│ BY       │ ① To assign · address unclear       │ ETA · 22 Jul 15:00 (in 4h)                │
│ REGION   │ Call customer for address.           │                                            │
│  KV 5    │                                      │  ITEM      SKU        QTY  WEIGHT          │
│  Klang 3 │ 🚚 SO-1210 · dato · KL              │  N1001S-Q  N1001S      1   35kg           │
│  Outstn 2│ ③ POD needed · delivered Fri 24      │  M1401F-K  M1401F      1   28kg           │
│          │ Upload POD for SO-1210.              │                                            │
│ BY WH    │                                      │ WHAT TO DO (② In transit)                 │
│  Klg 8   │                                      │ 1. WhatsApp NETS driver (012-3456)         │
│  HOUZS 3 │                                      │ 2. Call customer 30 min before             │
│          │                                      │ 3. Wait for POD photo from driver          │
│          │                                      │ 4. Upload POD here to close                │
│          │                                      │                                            │
│          │                                      │ [ 📎 Upload POD ]  [Something wrong soon] │
└──────────┴────────────────────────────────────┴──────────────────────────────────────────┘
```

---

## 3 stage definitions (LOCKED · precise)

**① To assign** — SO is ready to move BUT no partner assigned yet.
- Query: `SO.status = 'proceed_order' AND stock_ready=true AND logistic_partner_id IS NULL`
- Row action-line: `Assign NETS for SO-1204 delivery Mon 27 Jul.` OR `Call customer for address (SO-1207).`
- Detail pane action: `[ Assign partner ▼ ]` dropdown (auto-suggest by region + weight in Phase 5)

**② In transit** — Partner assigned, goods moving, POD not yet.
- Query: `logistic_partner_id IS NOT NULL AND pod_url IS NULL AND delivered_at IS NULL`
- Sub-states (all under ② umbrella, shown in row):
  - `assigned` (booked, not yet picked up)
  - `picked_up` (partner has goods)
  - `at_partner_wh` (temporarily parked at partner WH mid-journey)
  - `out_for_delivery` (final leg)
- Row action-line: `Chase NETS — SO-1207 late 1 day.` OR `Call customer 30 min before arrival.`
- Detail pane action: `[ Update status ▼ ]` + `[ Mark delivered ]`

**③ POD queue** — Goods delivered BUT POD photo not uploaded.
- Query: `delivered_at IS NOT NULL AND pod_url IS NULL`
- Row action-line: `Upload POD for SO-1210.` OR `POD stuck — WhatsApp NETS driver.`
- Detail pane action: `[ 📎 Upload POD ]` — accepts JPEG/PDF/HEIC; auto-writes to Storage bucket

**Terminal state (not shown by default):**
- `delivered_at IS NOT NULL AND pod_url IS NOT NULL` → archived in "History" facet
- Filter: last 30 days by default

---

## Row action-line templates (COPY-STANDARD)

| Situation | Row action-line |
|---|---|
| ① Address unclear | `Call customer for address (SO-1204).` |
| ① Ready to assign | `Assign partner for SO-1204 delivery Mon 27 Jul.` |
| ① Late-assign (over 2d ready but not assigned) | `Assign PARTNER — SO-1204 stuck 2 days.` |
| ② Picked up (normal) | `NETS delivering SO-1204 by Wed 3pm.` |
| ② Chase (partner late) | `Chase NETS — SO-1207 late 1 day.` |
| ② Customer no-answer | `Call customer again — SO-1207 not answering.` |
| ② Before arrival | `Call customer 30 min before arrival (SO-1204).` |
| ③ POD needed | `Upload POD for SO-1210.` |
| ③ POD stuck | `POD stuck — WhatsApp NETS driver (SO-1210).` |

---

## What-to-do per stage (inline horizontal)

**① To assign:**
```
1. Confirm customer address (call if needed)
2. Pick partner by region + weight
3. Book slot in partner system
4. Save assignment here
```

**② In transit:**
```
1. WhatsApp partner driver
2. Call customer 30 min before arrival
3. Wait for POD photo from driver
4. Upload POD here to close
```

**③ POD queue:**
```
1. Chase driver for POD photo
2. Upload PDF or JPEG here
3. Verify signature visible
4. Close delivery
```

---

## Executable phases

- **Phase 0** (~2h · RESEARCH)
  - Observe 1 operator running full assign → transit → POD cycle
  - Sit in on 2 partner-coordination phone calls
  - 5 questions: (1) How do you pick which partner today? (2) What if partner delays? (3) How do you get POD? (4) What breaks when customer's not home? (5) What's the single most annoying thing about current delivery workflow?
  - Write `docs/delivery-phase-0-findings.md`

- **Phase 1** (~3h + 2h review) — Module skeleton
  - Create `apps/web/src/pages/operation/OperationDelivery.tsx`
  - Add sidebar item `Delivery`
  - Basic 3-stage tabs (read-only, list from orders WHERE stock_ready)
  - Route: `/operation/delivery`

- **Phase 2** (~4h + 3h review) — Cockpit discipline
  - 3-pane inline split (facet · list · detail)
  - Facet (Needs / Region / WH)
  - Row action-line
  - What-to-do per stage

- **Phase 3** (~3h + 2h review) — Assign flow
  - Partner sub-tabs (row 2)
  - `[ Assign partner ▼ ]` action (writes `orders.logistic_partner_id`)
  - Sub-status handling within ② (assigned / picked_up / at_partner_wh / out_for_delivery)

- **Phase 4** (~4h + 3h review) — POD + Chase
  - POD upload → Storage bucket `pod-photos`
  - Chase button → WhatsApp partner (via existing wa-templates)
  - Migration 0249 · `orders.delivered_at` + `orders.pod_url` (both nullable, additive)

- **Phase 5** (~2h + 2h review) — Auto-suggest partner + tuning
  - Suggest partner by region (KV=NETS, Klang=NETS, Johor=TEOW, Singapore=EU)
  - Weight/volume threshold (>50kg auto-flag for pickup truck)
  - Phase 0 findings fixes

**Total: ~18h impl + 12h review = ~30h across 5-6 weeks · 5 PRs · Delivery 0/10 → 9/10.**

---

## Critical self-audit · rating 6/10 (unbuilt module)

### Real gaps

| # | Gap | Risk | Fix |
|---|---|---|---|
| 1 | Excel/CSV import from partner (NETS reports delivery in bulk) | Manual entry burns time | Phase 4b: bulk-mark-delivered by CSV upload |
| 2 | `logistic_partner_id` = single partner per SO — what about multi-leg (Klg→HOUZS→customer)? | Data model breaks multi-leg | Multi-leg = separate `delivery_legs` table (Phase 5+); Phase 1-4 assumes single-partner |
| 3 | Customer no-shows / redelivery flow | Ad-hoc reschedule → tracking lost | Add `reschedule` action in Phase 5; log redelivery attempts |
| 4 | POD upload — driver takes photo but connectivity poor at delivery site | POD upload from ops-side only doesn't scale when driver-side upload needed | Phase 5+: driver-side WA bot uploads directly |
| 5 | Auto-suggest partner rules are guesses | Wrong partner suggested → operator ignores → feature dead | Phase 0 must extract real "why NETS vs TEOW" rules from operator interview |
| 6 | POD photo quality (blurry / no signature) | Bad POD = customer disputes | Phase 5: auto-quality-check (edge detection, brightness) or fallback "review before close" |
| 7 | Payment gate — Orders' 3-track ③ MONEY intersects here (customer with balance owing SHOULDN'T get delivery) | Delivery module unaware of money hold | Import Orders' PayHold check; block `Assign partner` if balance>0 without waiver |
| 8 | Right-rail Calendar shows delivery dates — Delivery module and Calendar view same data | Consistency risk if they drift | ONE source of truth (deliveries table) · Calendar reads it · Delivery module reads it |

### Solutions to lift 6 → 9/10

- **Solution A · Phase 0 non-skip + partner-choice rules from real interview** (Fix 5)
- **Solution B · Multi-leg delivery table** (Fix 2 · Phase 5)
- **Solution C · PayHold gate on Assign** (Fix 7)
- **Solution D · Bulk CSV import from partner** (Fix 1)

Rated after these: 9/10.
Rated after 2 weeks live-usage: 10/10.

---

## Anti-drift note for next chat

If a fresh chat reads this and thinks any LOCKED decision is wrong:
1. HARD-locked → ASK Jess in chat first
2. NEGOTIABLE-locked → open a doc-amendment PR
3. NOT silently redesign

Reference the LOCKED # when proposing changes.
