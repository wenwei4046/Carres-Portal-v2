# Purchasing module — 3-panel full proposal + critical self-rating

> Proposal + self-audit. Locked with Jess (COO) 2026-07-22 after PR #244 (Orders proposal) merged. Covers all THREE Purchasing tabs: **To Order · Purchase Orders · Receiving**. Each tab gets an honest rating out of 10 with international critical review + executable solution.

---

## How to resume (any machine, any new chat)

Paste this into a fresh chat:

> Continue Purchasing module redesign — all 3 tabs (To Order · Purchase Orders · Receiving).
> Read in order:
> 1. `docs/purchasing-3panels-proposal.md` — this file, the SPEC + ratings
> 2. `docs/COPY-STANDARD.md` — microcopy rules + canonical vocabulary
> 3. `docs/UI-KIT.md` §A0 — Module-tab law, Copy law, Date law, Hover law
> 4. `docs/purchase-cockpit-handoff.md` §5 — To Order reference implementation
> 5. `docs/orders-panel-concept-proposal.md` — Orders sibling (same discipline)
>
> Live-poke: `https://erp.carresofficial.com/operation?tab=purchase` (To Order shipped 2026-07-22) and `/operation/procurement` (Purchase Orders old) and `?tab=receiving` (Receiving old).
>
> Sign in `operation@carres.com / 111`, read-only, safe.

---

## Executive summary — 3 ratings

| Tab | Rating | Status | Verdict |
|---|---|---|---|
| **To Order** (Purchase cockpit) | **8/10** | Shipped 2026-07-22 (PR #243) · 3 rounds of Jess review | Solid. Missing: Sat/Sun/PH greying · L/R nav · real write paths. |
| **Purchase Orders** (per-supplier tabs) | **3/10** | Untouched legacy — 4 supplier tabs (Nice Future · Ohana Sofa · Ohana Bedframe · placeholder) | Does not apply cockpit patterns. Fragmented per-supplier. No unified view. |
| **Receiving** (待收 queue) | **4/10** | Untouched legacy — flat table with 3 status filters | Works but no shared vocabulary. Missing detail pane, What-to-do, row action-line. |
| **Module-wide (average)** | **5/10** | 1 shipped + 2 legacy = design discontinuity across tabs | The module doesn't feel like ONE product; user context-switches mentally per tab. |

**Why not higher module rating:** we shipped 1 tab out of 3 with the discipline. The other 2 are old. A user clicking `To Order → Purchase Orders → Receiving` sees three different design languages — cognitive whiplash. Consistency is the international standard (SAP Fiori · Odoo · Salesforce all enforce module-wide design lock).

---

## Tab 1 · To Order (shipped) — critical self-audit · **8/10**

### What's actually good (why not 5)

- 3-pane inline split (facet · list · detail always visible) — SAP-Fiori standard
- Compact stage tabs (~40px) with number badge + verb + count
- Multi-category split (Ohana sofa + bedframe = 2 rows, 2 POs)
- 7-column SKU table (SAP MM / Odoo Purchase alignment)
- Inline horizontal What-to-do (3 steps for Send stage — realistic ops flow)
- Days-to-order strip with cadence day markers + status chips
- Something wrong? (soon) marker keeps future work visible
- Module-tab law kills the empty top row (~44px saved)

### Real gaps (why not 10)

| # | Gap | Fix | Owner |
|---|---|---|---|
| 1 | **Sat / Sun / public holidays not greyed on Days-to-order strip** | Import `packages/shared/src/my-holidays.ts` · in strip cell: if `dayOfWeek in (0,6)` OR `isHoliday(iso)` → grey text · no click · no count chip · tooltip `Weekend`/`PH: <name>` | Fresh chat (Sat) |
| 2 | **No L / R chevron navigation** — strip stuck to 14 days from today | Two chevron buttons above strip; each click shifts window ±7 days · add `Today` button to reset | Fresh chat |
| 3 | **Send PO button is a stub** — no real PO creation from the To Order flow | Wire to `operation_create_po` RPC · pass supplier + SKU list + qty · toast on success · redirect to Purchase Orders tab | Later unit (§6 handoff) |
| 4 | **Chase on WhatsApp is a stub** — opens wa.me URL but doesn't record | Insert row into `po_chase_events` on click · WA URL still opens · panel shows "last chased 2h ago" | Later unit |
| 5 | **Check in is a stub** — GRN write path missing | Wire to `operation_receive_po_with_do` RPC · pre-fill from PO items | Later unit |
| 6 | **DEADLINE column often shows `—`** — orders without `delivery_date` fill null | Add data-quality guard: `N SOs missing delivery date` bar at top; link to Orders panel to fix | Fresh chat |
| 7 | **No test data for empty states** — hard to know how the page behaves when zero POs to send | Storybook / mock data suite for 5 states (empty · 1 · 10 · 100 · error) | Later, low priority |
| 8 | **Assumption: 3 stages Send/Chase/Receive fit all supplier flows** — untested with Nice Future's real workflow (they may have "confirm quote" step BEFORE Send) | Interview 1 supplier (Nice Future) about their real flow · document · add stage 0 "Confirm quote" if needed | Post-Phase 0 finding |

### Solution to lift 8 → 10

Add a **Phase 0 fix pack** (2h): Fix 1, 2, 6 above — all low-risk, high-visibility polish. Fixes 3-5 are BIG (real write paths, migrations) — separate multi-week unit.

---

## Tab 2 · Purchase Orders (per-supplier tabs) — critical self-audit · **3/10**

### Current shape (`TabbedProcurementShell` + `ProcurementTabContent`)

- 4 supplier tabs: Nice Future Mattress · Ohana Sofa · Ohana Bedframe · (placeholder)
- Each tab renders the SAME `ProcurementTabContent` with a slug filter
- Columns: PO# · Items · Supplier · Warehouse · ETA · Status · Action
- Row actions: Receive · Assign pickup · LP inbound confirm · Detail modal
- Top-level "+ New PO" button opens `CreatePOModal`

### Why 3/10 (harsh but honest)

| # | Problem | Impact |
|---|---|---|
| 1 | **Per-supplier tabs = fragmentation** — user must switch tabs to see all POs. No unified view. | Can't answer "what POs are late across ALL suppliers?" without clicking each tab |
| 2 | **No cockpit discipline** — no 3-pane split, no What-to-do, no row action-line, no compact stage tabs | User re-learns UI when switching from To Order to Purchase Orders |
| 3 | **Vocab drift** — "Open / partial / Pickup action / Received" (this tab) vs "Send / Chase / Receive" (To Order) | Same PO, two names depending on which tab you view it in |
| 4 | **Row action-line missing** — pure data grid, no plain-English "what's next" | Operator mentally composes action from columns |
| 5 | **No detail pane** — click PO opens modal · covers list · breaks 3-pane consistency | Old drawer pattern that Purchase cockpit already replaced |
| 6 | **No stage tabs** — filters are `All / Open / Pickup / Received` · doesn't match the 3-stage Send/Chase/Receive vocabulary | Two mental models for the SAME PO lifecycle |
| 7 | **No days-view / no cadence** — can't answer "which POs are due to arrive this week?" without opening each row | Blind to time-based load |
| 8 | **"+ New PO" affordance is out-of-band** — user expects to raise POs FROM To Order (which points at "Send PO" button), not click "+ New PO" separately | Duplicate paths, confusing which one is canonical |

### Proposal · redesign to match cockpit discipline (rated 8-9 potential)

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ [ To Order ] [ Purchase Orders ] [ Receiving ]              Today · Wed 22 Jul  ⟳ 🔔 ❓ ⚙   │  ← PurchasingTabs (existing)
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ [ ① Open 12 · 3 late ] [ ② Confirmed 8 ] [ ③ In transit 4 ] [ ④ Received 45 ] [ All ]      │  ← 4-stage lifecycle
├──────────┬────────────────────────────────────┬────────────────────────────────────────────┤
│ FACET    │ MIDDLE LIST                         │ DETAIL (always visible)                     │
│ (200)    │ (420)                               │ (fills)                                     │
│          │ 📦 PO-88 · Ohana                   │ Purchase Order PO-88                        │
│ NEEDS    │ 3 items · ETA Thu 24 Jul           │ Send by · Ohana · Sofa                      │
│  ⚠ Late     │ Chase Ohana — 2d late.             │ ─────────────────                           │
│  ⚠ Reassign │                                     │ Total 3 units · King 1 · Queen 2            │
│           │ 📦 PO-86 · Nice Future             │ Send by ⬛ ETA 24 Jul (in 2 days)            │
│ BY        │ 5 items · ETA Fri 25 Jul           │ Warehouse Klang · Assigned NETS · 2h ago    │
│ SUPPLIER  │ On track                            │                                             │
│  Ohana 6  │                                     │  SKU        MODEL     SIZE QTY   ETA   PICKUP│
│  NiceF 4  │ 📦 PO-84 · Ohana                   │  SOF-REC-3S SofaRec-3S  K   1    Thu   NETS │
│  Bedfr 2  │ ARRIVED · check in 5 items         │  ...                                        │
│          │                                     │                                             │
│ BY WH    │                                     │ WHAT TO DO (② Confirmed track)             │
│  Klang 8 │                                     │ 1. Follow up final ready date               │
│  HOUZS 3 │                                     │ 2. Book NETS pickup slot                    │
│  Ohana 1 │                                     │ 3. Update ETA here                          │
│          │                                     │ 4. Send delivery reminder                   │
│          │                                     │                                             │
│          │                                     │ [Something wrong? (soon)]  [Reassign] [Detail]│
└──────────┴────────────────────────────────────┴────────────────────────────────────────────┘
```

**Stage tabs (4 lifecycle stages · aligned with `sup_status`):**

| # | Stage | `sup_status` values | Row action-line example |
|---|---|---|---|
| ① | **Open** | `pending`, `in_production` | `Chase Ohana — PO-88 2d late.` · `Remind Nice Future — expected ready date.` |
| ② | **Confirmed** | `ready_confirm_sent`, `ready_for_pickup`, `partially_shipped` | `Book NETS pickup for PO-86 by Fri.` |
| ③ | **In transit** | `partner_picked_up`, `at_partner_wh` | `PO-84 arriving at Klang tomorrow.` |
| ④ | **Received** | `received`, terminal | (archived, filter-only) |

**Facets:**
- `Needs attention` (Late + Reassign)
- `By supplier` (Ohana / Nice Future / Bedframe · REPLACES the 4 tabs)
- `By warehouse` (Klang / HOUZS / At Ohana)

**Kill the 4 supplier tabs** (`NiceFutureMattressTab`, `OhanaSofaTab`, `OhanaBedFrameTab`, placeholder) — supplier becomes a FACET, not a top tab. One panel, all suppliers, filterable.

### Executable phases for Purchase Orders redesign

- **Phase 1** (~2h · SAFE) — copy audit + row action-line + inline What-to-do per stage (add without touching layout)
- **Phase 2** (~4h · BIG) — kill the 4 supplier tabs · unify into ONE `OperationPurchaseOrders` component matching cockpit shape · move supplier to facet
- **Phase 3** (~2h) — 3-pane inline split · detail pane · 4-stage compact pills
- **Phase 4** (~1h) — needs-attention facet · Something wrong? (soon) stub

Rated after Phase 4: 8/10 (matches To Order's shipped quality).

---

## Tab 3 · Receiving (待收 queue) — critical self-audit · **4/10**

### Current shape (`OperationReceiving`)

- 3 filters: To receive · Received · All
- Row columns: PO# · Supplier · Items · ETA · Status · Action (Receive)
- Row click opens `ReceivePOModal` (per-line tick + DO upload + signed checkbox)

### Why 4/10

| # | Problem | Impact |
|---|---|---|
| 1 | **No 3-pane detail** — Receive opens as MODAL over the list · consistency break | Same drawer-covers-list problem Purchase cockpit already solved |
| 2 | **No row action-line** — user reads columns to compose action | `Check in from Ohana (3 items).` would fix instantly |
| 3 | **No What-to-do** — new operator doesn't know the 4-step GRN flow | Purchase cockpit already has this for Receive: count · photograph DO · book into stock · reserve to customer order |
| 4 | **Filters are stage-agnostic** — `To receive` includes both `arriving-today` AND `arriving-in-2-weeks` — no time slicing | Operator can't prioritize |
| 5 | **No days-view** — can't see receive load by day | 15 POs arriving Mon vs 2 on Fri = huge planning difference, invisible |
| 6 | **Master status labels drift from cockpit** — `Pending / In production / Awaiting accept / Ready / Partial / Arrived / Reassign` vs cockpit's Send/Chase/Receive vocabulary | Cognitive overload · operator learns two vocabs |

### Proposal · redesign to match cockpit

Receiving already IS "stage ③" of the To Order cockpit. So the Receiving TAB should mirror the same shape as the ③ Receive stage detail pane in cockpit — same day strip, same compact row, same inline What-to-do — but with the ability to check things in (write path).

**Proposed layout:**

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ [ To Order ] [ Purchase Orders ] [ Receiving ]         Today · Wed 22 Jul  ⟳ 🔔 ❓ ⚙        │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ [ ① Arriving today · 3 ] [ ② This week · 15 ] [ ③ Later · 22 ] [ Received (archive) ]      │  ← time-based tabs
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ DAYS TO RECEIVE (next 14 · click a day to focus)                                            │
│ Wed 22  Thu 23  Fri 24  Sat 25  Sun 26  Mon 27  ...                                         │
│  ●3      ●5      ●2      —       —       ●4                                                 │
│                                                                                              │
│ Today: 3 to check in.  This week: 15 arriving.                                              │
├──────────┬────────────────────────────────────┬────────────────────────────────────────────┤
│ FACET    │ MIDDLE LIST                         │ DETAIL (always visible)                     │
│ (200)    │ (420)                               │ (fills)                                     │
│          │                                     │                                             │
│ NEEDS    │ 🚚 PO-84 · Ohana                   │ Check in from Ohana · PO-84                 │
│  ⚠ Overdue │ 3 items · arrived · Klang          │ 3 units to check in                        │
│           │ Check in from Ohana (3 items).      │ ─────────────────                           │
│ BY        │                                     │ Ready at Ohana · 22 Jul 10:00              │
│ SUPPLIER  │ 🚚 PO-88 · Nice Future             │ NETS picked up 22 Jul 14:30                │
│  Ohana 2  │ 5 items · ETA Fri 24               │ Arrived Klang 22 Jul 16:00                 │
│  NiceF 1  │ Wait for arrival Fri 24.            │                                             │
│           │                                     │  SKU        QTY   MODEL     SIZE   PHOTO   │
│ BY WH     │                                     │  SOF-3S     1    Recliner  King   [📷]     │
│  Klang 3  │                                     │  ...                                        │
│           │                                     │                                             │
│           │                                     │ WHAT TO DO (③ Receive)                     │
│           │                                     │ 1. Count goods on arrival                   │
│           │                                     │ 2. Photograph the DO slip                   │
│           │                                     │ 3. Book into Klg stock                      │
│           │                                     │ 4. Reserve to customer SO                   │
│           │                                     │                                             │
│           │                                     │ [Something wrong? (soon)]  [✓ Check in]     │
└──────────┴────────────────────────────────────┴────────────────────────────────────────────┘
```

**Stage tabs (time-based · what actually matters):**
- ① **Arriving today** (ETA ≤ today · MUST check in today)
- ② **This week** (ETA within 7 days · plan ahead)
- ③ **Later** (ETA > 7 days · monitor)
- **Received (archive)** — filter-only, keep off default

### Executable phases

- **Phase 1** (~2h · SAFE) — copy audit + row action-line + What-to-do (add without layout change)
- **Phase 2** (~3h · BIG) — 3-pane inline split · kill modal · detail pane inline
- **Phase 3** (~2h) — Days-to-receive strip · time-based stage tabs · compact pills
- **Phase 4** (~1h) — Overdue guard · Something wrong? (soon) stub

Rated after Phase 4: 8/10.

---

## Cross-cutting laws (LOCKED for the whole Purchasing module)

| # | Law | Reason |
|---|---|---|
| 1 | **One vocab across all 3 tabs** — Send / Chase / Receive canonical; supplier / PO / SO never blur | User memorizes ONCE, uses across module |
| 2 | **3-pane split for all 3 tabs** — facet 200 · list 420 · detail fills | Consistency + no modal / drawer overlays |
| 3 | **Compact stage-pill row on all 3 tabs** (~35-40px) | Vertical space + same visual anchor |
| 4 | **Row action-line on every row of every tab** (COPY-STANDARD template) | Zero-experience friendly |
| 5 | **Inline horizontal What-to-do per stage** | Same discipline everywhere |
| 6 | **Something wrong? (soon)** button in each detail pane's footer | Future write-path stub kept visible |
| 7 | **Days-to-X strip for time-relevant stages** — order-by for To Order, ETA for Purchase Orders and Receiving | Different data, same shape |
| 8 | **Module-tab law** — no breadcrumb + big title on any of 3 tabs; freshness stamp + icons in `PurchasingTabs` right slot | Save ~44px on every tab |

**Enforce these 8 laws in code review.** If a PR touches Purchasing and breaks any law → revert and re-do.

---

## Module-wide rating breakdown

| Aspect | To Order | Purchase Orders | Receiving | Module avg |
|---|---|---|---|---|
| Layout consistency | 9 | 3 | 4 | 5.3 |
| Vocab alignment | 8 | 3 | 4 | 5.0 |
| Zero-experience friendliness | 8 | 3 | 3 | 4.7 |
| Time / calendar visibility | 8 | 2 | 3 | 4.3 |
| Data-quality guards | 6 | 3 | 3 | 4.0 |
| Write-path completeness | 2 | 6 | 6 | 4.7 |
| Detail-pane pattern | 9 | 3 | 3 | 5.0 |
| Module-wide law adherence | 9 | 2 | 3 | 4.7 |
| **Overall** | **8/10** | **3/10** | **4/10** | **5/10** |

**Why the module is 5/10 despite To Order being 8/10:** the 3 tabs feel like 3 different products. International consistency law says a module = ONE design language across all its tabs. We have 1 shipped + 2 legacy = fractured user experience.

---

## Phased plan for the whole module

**Purchase Orders redesign — 4 PRs · ~9h impl + 7h review = ~16h total**
- Phase 1: copy + action-line + What-to-do (2h + 2h)
- Phase 2: unify supplier tabs → single component + facet (4h + 3h)
- Phase 3: 3-pane split + 4-stage compact tabs (2h + 1h)
- Phase 4: needs-attention + Something wrong stub (1h + 1h)

**Receiving redesign — 4 PRs · ~8h impl + 6h review = ~14h total**
- Phase 1: copy + action-line + What-to-do (2h + 2h)
- Phase 2: 3-pane split · kill modal (3h + 2h)
- Phase 3: Days-to-receive + time-based tabs (2h + 1h)
- Phase 4: overdue guard + Something wrong stub (1h + 1h)

**To Order polish · 2h + 1h = ~3h**
- Sat / Sun / PH greyed on Days-to-order strip
- L / R chevron nav on strip
- Missing-deadline guard bar

**Grand total for module 8/10 → 9/10: ~33h across 4-5 weeks · 9 PRs**

---

## Anti-drift note for next chat

If a fresh chat reads this and thinks any decision is wrong:
1. Ask Jess in chat before deviating
2. NOT silently redesign — every LOCKED decision took a conversation to arrive at
3. Reference the LOCKED # in the doc when proposing a change

Same discipline as `docs/orders-panel-concept-proposal.md`.
