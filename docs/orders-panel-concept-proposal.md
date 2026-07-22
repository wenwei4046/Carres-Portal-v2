# Orders panel — full concept proposal (LOCKED 2026-07-22)

> This file is the **spec** for the Orders panel redesign. Every decision below was locked with Jess (COO) 2026-07-22 after the Purchase cockpit shipped (PRs #242 + #243). A new chat MUST treat this file as authoritative — do not re-litigate. Layer concepts on top of the existing Orders panel; do NOT tear down what's there.

---

## How to resume (any machine, any new chat)

Paste this into a fresh chat:

> Continue Orders panel redesign. Read (in this order):
> 1. `docs/orders-panel-concept-proposal.md` — this file, the spec
> 2. `docs/COPY-STANDARD.md` — microcopy rules + canonical vocab
> 3. `docs/UI-KIT.md` §A0 — Module-tab law, Copy law, Date law, Hover law, Action law
> 4. `docs/purchase-cockpit-handoff.md` §5 — reference implementation (Purchase cockpit shipped 2026-07-22)
>
> Live-poke `https://erp.carresofficial.com/operation?tab=purchase` for the visual/interaction reference. Then start Phase 1 (safe, non-structural — copy audit + row action-line + inline What-to-do). Don't skip to Phase 2 without asking.

---

## Contract (don't break)

- **LAYER** concepts on top of existing Orders; do NOT tear down what's built.
- **Zero danger-zone breakage** (from `ORDERS_LIST_SPEC.md`):
  1. `readinessOf` / `stockMatchKey` / `STOCK_BUCKETS` — untouched
  2. `STATUS` / `STOCK` / `DUE` count + label formats — untouched (~36 tests baked in)
  3. Row inline-edit + row-click stopPropagation dance — untouched
- One PR per phase. Review + merge + deploy independently.
- Deploy only from `main` (per `docs/purchase-cockpit-handoff.md` §2 procedure).

---

## LOCKED decisions (do not re-litigate)

| # | Decision | Reason |
|---|---|---|
| 1 | **3 top tabs = 货 GOODS · 送 DELIVER · 钱 MONEY** | Miller's Law (3-5 chunks) + international convergence (SAP MM · Odoo · Amazon FC · Airbnb Ops · Toyota Kanban all use 3 top workstreams). Merit-based, NOT the CLAUDE.md lock. |
| 2 | **Existing 5-stage lifecycle (Placed → Proceed → Pending → Scheduled → Delivered) KEPT** as second tab row | Don't touch the state machine (danger zone). Stages = "where in lifecycle"; tracks = "what work to do NOW". Two-axis filter. |
| 3 | **Compact 2-row header** (title + 3-track + utilities on row 1; 5-stage tabs on row 2) | Save ~30px vs current 3-row header. Purchase cockpit + Orders both align to compact after Q3 talks. |
| 4 | **3-pane inline split** (facet 200 · middle list 420 · detail always visible) | Same as Purchase. Detail replaces the drawer overlay. Phase 2 change. |
| 5 | **Right rail = 4 widgets, one purpose each** (Calendar / Team-Duty-Board / My-Tasks / Activity) | International: Notion sidebar, Linear inbox. One question per widget. |
| 6 | **Pin (row) vs Follow-up task (detail-pane) split** | Row 🚩 = personal bookmark ("watch this SO"). Detail-pane "+ Follow-up" button = assign task to someone. Two affordances, two purposes, no ambiguity. |
| 7 | **Follow-up assignment + Buddy system + Overflow queue** for MC handling | Buddy = each staff has a backup; buddy inherits tasks on MC. Overflow = shared bucket for orphans. Manual MC today; automate later. |
| 8 | **Team panel → Duty Board (visible to ALL staff)** | Not supervisor-only. Everyone asks "who's on X duty this week?" Duty Board answers it once, for everyone. |
| 9 | **3-layer accountability: My Tasks / My Duty / My Orders** | Every staff opens portal and sees exactly what they need to CHASE (Tasks), COVER (Duty), and OWN (SOs where they're PIC). Zero-guess. |
| 10 | **Days-to-deliver strip → DROPPED for Orders** (right-rail Calendar covers delivery) | Don't duplicate the same data. Header shows 1-line hint `Deliveries today N · this week M › calendar`. |
| 11 | **Purchase Days-to-order strip → KEPT** (different data from Calendar) | Order-by ≠ delivery date. Different semantic, different visualization. Consistency rule = don't duplicate same data, not "always drop strip". |
| 12 | **Page name = "Orders"** (not module-tabbed) | Orders is one entity (customer SOs). No sub-tabs needed. Module-tab law does NOT apply. |

---

## Concepts that PORT from Purchase cockpit

| Purchase concept | Port to Orders as | Why |
|---|---|---|
| **Compact pill stage tabs** (~40px vs ~72px cards) | Row 2 of Orders = compact pills for the 5-stage lifecycle | Half vertical space; consistency with Purchase |
| **Row action-line** (≤10 words · verb + object + when) | Every Orders row ends with plain-English "next step": `Chase Ohana — PO-88 2d late.` · `Assign NETS for SO-1204 Mon delivery.` · `Call Ali Chen — no address on file.` | Zero-experience-friendly; layers on top of existing action pills (doesn't replace them) |
| **Inline What-to-do (3-4 step, horizontal)** in detail pane | Per stage AND per track: e.g. Proceed + ② DELIVER → "1. Call customer for ETA · 2. Assign NETS · 3. Book slot · 4. Send reminder" | New employees know the flow at every state |
| **COPY-STANDARD vocab alignment** | SO = customer sales order · PO = supplier PO · Ready date vs Delivery date · Chase supplier vs Chase logistic. Never same word two meanings. | Same discipline as Purchase cockpit |
| **3-pane inline split** (facet · list · detail always visible) | Kill the OrderDetailDrawer overlay; detail lives beside the list | Biggest UX win — same as Purchase |
| **Missing-data guard bar** | `N SOs need delivery date` · `N SOs need address` · `N SOs need customer contact` — one guard per data gap | Prevents work stalling downstream |
| **`Something wrong? (soon)` button** | Per-stage escape hatch stub | Placeholder for future write-path so we don't forget |
| **`Module-tab law`** — does NOT apply to Orders | Orders is standalone (no sub-tabs) → keeps a page title. Not a module. | See LOCKED #12. |

## Concepts that DON'T port to Orders

Orders is **lifecycle** (a customer SO has a fixed path Placed → … → Delivered), NOT **process-linear** like Purchase (a PO goes Send → Chase → Receive). Skip these:

- **Category icons on rows (Bed / Sofa / BedDouble)** — SO has mixed items, one icon per row = wrong. Keep SO number as row identity.
- **Split by category** — one SO is one document; splitting = wrong. Keep 1 row per SO.
- **Facet "By factory"** — for Orders, facet by Region (exists) + Salesperson + Overdue + Payment-status works better.
- **Send stage's 3-step What-to-do** — different content because Orders is lifecycle. SHAPE ports; STEPS differ per stage.
- **Days-to-deliver strip** — right-rail Calendar already covers customer delivery dates. See LOCKED #10.

---

## The 3-track model (LOCKED #1) — how it works

**3 top tabs = the daily "hot loop":**

```
┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
│ ① 货  GOODS          │   │ ② 送  DELIVER        │   │ ③ 钱  MONEY          │
│ 12 SOs · 3 overdue   │   │ 8 SOs · 2 no logistic│   │ 5 SOs · 1 overdue    │
└──────────────────────┘   └──────────────────────┘   └──────────────────────┘
```

**Each track = a GROUPING of the existing Next-action ladder (do NOT touch the ladder itself):**

| Track | Owns these Next-action words (ladder-derived) |
|---|---|
| **① 货 GOODS** | `Supplier overdue` · `No PO` · `Waiting stock` |
| **② 送 DELIVER** | `Assign logistic` · `Logistic no ETA` · `Call customer` · `Schedule delivery` |
| **③ 钱 MONEY** | `Collect $` (balance) · `Collect $` (storage overdue) |

**Two-axis filter:**
- Click a **track** → filter list to SOs whose current Next-action is in that track. Stage tabs stay lit; user sees "Proceed 45 · showing 8 (② DELIVER)".
- Click a **stage** → filter list to that lifecycle state. Track counts update.
- Click **both** → intersection (`② DELIVER × Proceed = 8`).
- Default = ALL tracks × ALL stages.

**Why 3, not 4/5** (LOCKED #1 rationale):
- Miller's Law: 3-5 chunks in short-term memory. Beyond 5 = paralysis.
- SAP MM · Odoo · Amazon FC · Airbnb Ops · Toyota Kanban all converge on 3 top workstreams.
- 4th possibility (Customer service) → already lives in the `Service Cases` sidebar item + right-rail Follow-ups panel. Not a top tab.
- 5th possibility (Admin/print) → tertiary, right rail only.

---

## Right-rail widget audit (LOCKED #5) — 4 widgets, one purpose each

| Widget | ONE question it answers | Keep / expand? |
|---|---|---|
| **📅 Calendar** | **When** are things happening? (delivery schedule, PO order-by) | ✅ Keep · essential |
| **👥 Team → Duty Board** | **Who** is on which duty this week + workload? | ✅ **Expand** to full Duty Board (see below) |
| **🔔 My Tasks** (currently `Follow-ups`) | **What** do I need to chase back? (personal task queue) | ✅ Keep · rename to "My Tasks" for clarity |
| **📜 Activity** | **What** changed recently? (audit log) | ✅ Keep · critical for tracing |

**Right-rail law:** each widget answers ONE question. If a widget answers two questions, split it. If it answers zero, kill it.

---

## Duty Board (LOCKED #8) — expanded from PO-duty-only

**Visible to ALL staff** (not supervisor-only). Everyone asks "who's on X duty this week?" — the board answers it once, for everyone.

```
👥 DUTY BOARD
─────────────────────────
📌 THIS WEEK
  PO duty (monthly rotation)    · Jess
  Escalation on-call (weekly)   · Ching
  Standup lead (weekly)         · Joy
  Reception cover (daily)       · Sha

📋 STAFF STATUS
  Jess    · active · 3 follow-ups
  Ching   · MC Wed-Fri · buddy Joy
  Joy     · active · 5 follow-ups
  Sha     · active · 2 follow-ups

📊 WORKLOAD (this week)
  Follow-ups outstanding: 10
    · Jess    ▓▓▓ 3
    · Joy     ▓▓▓▓▓ 5
    · Sha     ▓▓ 2
  Overdue: 1 (Sha · SO-1207 · 2h)
```

**Future duties to add over time (all one row per duty):**
- Warehouse gate keeper (this shift: X)
- Customer WhatsApp inbox owner (today: X)
- Petty cash holder (this week: X)
- Fire drill warden (this quarter: X)
- Any rotation you invent — one row per duty. This is your "Ops Board" (Airbnb / Uber / Shopify pattern).

---

## Follow-up flow + MC handling (LOCKED #6 + #7)

**Assignment loop:**

```
Ops picks 🚩 Pin on SO (personal bookmark, row-level)
          OR
Ops clicks "+ Follow-up task" in detail pane (assign to someone)
   ↓
FollowUpForm opens · assignee dropdown · due date/time · description
   ↓ SAVE
   ├──→ Task appears in assignee's "My Tasks" (right-rail panel)
   ├──→ Notification fires — in-app bell 🔔 (MVP)
   ├──→ Task appears on Team Duty Board (all staff see workload)
   └──→ If overdue > 24h → escalates to buddy
```

**Pin vs Follow-up task = 2 DISTINCT affordances (LOCKED #6):**

| Affordance | Where | Purpose |
|---|---|---|
| **🚩 Pin** (row-level bookmark) | Row-level icon | Personal "watch this SO" — no one else notified |
| **+ Follow-up task** | Detail-pane button | Assign a task to someone (buddy/anyone) with due date; goes to their My Tasks |

**MC (medical leave) handling — 3 patterns considered:**

| Pattern | Complexity | Decision |
|---|---|---|
| Auto-reassign on MC calendar | High (needs per-staff MC calendar + rules) | ❌ Fragile; MC often surprise |
| **Buddy system** — each staff has a backup buddy; buddy inherits tasks on MC | Medium (one buddy field per staff) | ✅ Recommended |
| **Overflow queue** — orphan tasks go to shared bucket; anyone picks | Low (one shared list) | ✅ Recommended alongside buddy |

**MVP:** `salespersons.buddy_id` column + shared Overflow queue. MC status set manually today; automate later once volume proves the pattern.

---

## 3-layer accountability (LOCKED #9) — zero-guess for every staff

**Each staff opens portal and sees ONE dashboard first:**

```
┌────────────────────────────────────────┐
│ Hi Ching · today                        │
│                                          │
│ MY TASKS · 5 open · 1 overdue           │  ← right-rail My Tasks
│  1. Call Ali Chen · overdue 2h  🔴      │
│  2. Chase Ohana · today 3pm  🟡         │
│  3. Book NETS for SO-1204 · Thu         │
│                                          │
│ MY DUTY THIS WEEK                        │  ← Team Duty Board
│  • Escalation on-call                    │
│  • Reception cover Tue-Thu               │
│                                          │
│ MY ORDERS · 12 SOs where I'm PIC        │  ← Orders panel filtered by PIC=me
│  [Open in Orders →]                     │
└────────────────────────────────────────┘
```

**3 layers = 3 clear questions:**
- **MY TASKS** = what to CHASE (assigned follow-ups)
- **MY DUTY** = what to COVER (rotational duties)
- **MY ORDERS** = what to OWN (SOs where I'm PIC)

**Enforcement (no yelling needed):**
- Overdue tasks → red + escalate to buddy after 24h
- Duty misses → surface in weekly review (Activity log)
- PIC-orphan SOs (no PIC) → flagged in "Needs attention" facet

---

## Full revised layout (locks #3 + #4 + #5 + #10)

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ Orders │ [① 货 12·3⚠] [② 送 8·2⚠] [③ 钱 5·1⚠] │ 158 SOs · Synced · 🔔 ❓ ⚙ · [Import Master▾] │  Row 1 · 42px
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ [ Placed 3 ][ Proceed 45 ][ Pending 12 ][ Scheduled 8 ][ Delivered ][ All 158 ]            │  Row 2 · 32px (existing 5-stage tabs, kept)
├──────────┬──────────────────────────────────────┬─────────────────────────────┬───────────┤
│ FACET    │ MIDDLE LIST                           │ DETAIL (always visible)      │ RIGHT     │
│ (200)    │ (420)                                 │ (fills)                      │ RAIL (48) │
│          │                                        │                              │           │
│ Needs    │  📌 Pinned (2)                        │ Order SO-1204 · ella · KL   │ 📅 When   │
│ Region   │  ────                                 │ ② DELIVER · Assign NETS      │ 👥 Duty   │
│ Sales    │                                        │ ─────────────────            │ 🔔 Tasks  │
│ Status   │  🚚 SO-1204 · ella · KL              │ Total 3 units · King 2 …    │ 📜 Log    │
│ ...      │  Assign NETS · Mon 27 Jul             │ SEND BY Mon 27 Jul (5d)     │           │
│          │                                        │ ...                          │           │
│          │  🚚 SO-1207 · PETER · Klang           │ WHAT TO DO (② DELIVER)      │           │
│          │  Call customer · no address           │ 1. Call customer for ETA     │           │
│          │                                        │ 2. Assign NETS               │           │
│          │  💰 SO-1210 · dato · KV               │ 3. Book delivery slot        │           │
│          │  Collect RM 2,500 🔒 blocks Send      │ 4. Send delivery reminder    │           │
│          │                                        │                              │           │
│          │  Deliveries today 5 · this week 21 › calendar                        │           │
│          │                                        │ [Pin] [+ Follow-up task]    │           │
│          │                                        │ [Something wrong? (soon)]   │           │
└──────────┴──────────────────────────────────────┴─────────────────────────────┴───────────┘
```

**Total header vertical:** 42 + 32 = ~74px (was 80px). Slight save + adds 3-track visibility.

**Small hint** `Deliveries today N · this week M › calendar` inline (bottom of middle list header area) — opens right-rail Calendar. Replaces the Days-to-deliver strip.

---

## Readability Phase 1 fixes (LOCKED)

**3 root causes of current-Orders-UI readability, based on `ORDERS_LIST_SPEC.md` + code read:**

| Cause | Diagnosis | Fix |
|---|---|---|
| **11 columns per row** (Ref · SO · Customer · Region · Deadline · MS · BF · Sofa · Stock · Logistic · Next action) | Eye jumps between all, no anchor | Collapse MS+BF+Sofa counts into ONE `Items` column (`5 MS · 3 BF · 8 Sofa` in one cell). 11 → 8 cols. |
| **Vocab inconsistency** ("orders" = SO or PO? "ETA" = supplier or delivery? "chase" = supplier or logistic?) | Same word two meanings → reader stops trusting labels | COPY-STANDARD audit — SO for customer, PO for supplier, Ready date vs Delivery date, Chase supplier vs Chase logistic. |
| **No plain-English action line** — every row is data-grid only | Operator mentally composes "next thing to do" from columns → cognitive load per row | **Add row action-line** (≤10 words, verb + object + when). `Chase Ohana — PO-88 2d late.` `Assign NETS for SO-1204 Mon delivery.` |

**Zero danger-zone risk** — additions + column consolidation, not touching `readinessOf` / `stockMatchKey` / `STOCK_BUCKETS` / count algorithms.

---

## Critical self-audit + executable fixes (LOCKED 2026-07-22)

> Self-rated the earlier proposal 7/10 (not 10) — solid direction but weak on user research, edge cases, and executable specificity. This section spells out each fix as a **concrete step-by-step** so a fresh chat can execute without interpretation.

### Fix 1 · Phase 0 · User research (INSERT before Phase 1)

**Do:** Watch 2 ops staff (recommend Ching + Joy) use the current Orders panel for 15 min each, screen recording OK. Ask exactly these 5 questions after each session:

1. When you open Orders, what's the FIRST thing you look for?
2. Show me an order you're currently chasing — what's blocking it?
3. When SO-XXXX comes in, how do you know it's YOURS to handle?
4. What do you do if you go on MC — who picks up your work?
5. What ONE thing about this page slows you down every day?

**Owner:** Jess (schedules), Claude (writes findings doc)

**Success criteria:** `docs/orders-panel-phase-0-findings.md` exists on `main` with ≥3 assumption confirmations OR challenges to the 12 LOCKED decisions.

**If a LOCKED decision is challenged by findings:** don't silently change it — open a new PR with `docs/orders-panel-concept-proposal.md` amendment + ask Jess.

**Time:** 1h (30 min observe · 30 min document)

### Fix 2 · Verify PIC field before "My Orders" layer

**Do:** SQL query before Phase 4:

```sql
select
  count(*) filter (where assigned_to is null) as no_pic,
  count(*) filter (where assigned_to is not null) as with_pic,
  count(*) as total
from orders
where status in ('place', 'proceed_order');
```

**Success criteria:** `with_pic / total >= 0.7`. If less: (a) backfill script BEFORE Phase 4 to auto-assign PIC from `orders.placed_by_salesperson` OR (b) drop the "My Orders" layer from the 3-layer accountability model.

**Owner:** Claude (writes SQL) · Jess (runs it in Supabase MCP)

### Fix 3 · Success metrics section (define BEFORE Phase 1)

Add to `docs/orders-panel-concept-proposal.md`:

| Metric | Baseline (before) | Target (after Phase 4) | Measurement |
|---|---|---|---|
| **Task-find time** (staff opens portal → first meaningful click) | Measure Sat before Phase 1 (screen-record 3 staff) | ≤ 10 seconds | Same measurement post-Phase 4 |
| **Orphan SOs** (no PIC OR no Next-action) | Query weekly | 0 by Friday each week | SQL cron report |
| **SUS score** (System Usability Scale, 10 questions) | N/A | ≥ 70 (industry "good") | Survey 5 staff 2 weeks post-Phase 4 |

**Owner:** Jess (Sat baseline · Friday orphan-check · 2-week SUS survey)

### Fix 4 · Multi-track badges spec (Phase 5)

**Problem:** Next-action ladder returns ONE word per SO → SO appears in ONE track only, hiding other issues.

**Do:**

1. Add helper in `packages/shared/src/order-track.ts`:
   ```ts
   export type OrderTrack = "goods" | "deliver" | "money";
   export function tracksForOrder(o: OrderSignals): Set<OrderTrack> {
     const t = new Set<OrderTrack>();
     if (o.supplierOverdue || o.noPo || o.waitingStock) t.add("goods");
     if (o.noLogistic || o.noEta || o.needsCustomerCall || o.needsSchedule) t.add("deliver");
     if (o.balanceOwing || o.storageOverdue) t.add("money");
     return t;
   }
   ```
2. Row displays 3 dot-badges header: `● 货 ○ 送 ● 钱` — filled if in-track.
3. Track pill count = distinct SOs where track ∈ `tracksForOrder(o)`. **SO in 2 tracks counted in BOTH.**
4. Row action-line still shows the TOP-priority word (`Chase Ohana — PO-88 2d late.`) but the 3 dots reveal the other issues.

**Success criteria:** an SO with "Supplier overdue" + "Balance owing" shows in ① 货 count AND ③ 钱 count · row has 2 filled dots.

### Fix 5 · Duty-rotation admin surface (Phase 4)

**Where:** `Team → Duty Board → Edit duties` button (visible to `role=principal` only).

**Schema:** new table `duty_rotations`:
```sql
create table duty_rotations (
  id uuid primary key default gen_random_uuid(),
  duty_type text not null,          -- 'po_duty' · 'escalation' · 'reception' · ...
  cadence text not null check (cadence in ('daily','weekly','monthly','quarterly')),
  rotation_pool uuid[] not null,    -- array of salesperson.ids
  current_holder uuid references salespersons(id),
  next_rotation_date date not null,
  created_at timestamptz default now(),
  updated_by uuid references salespersons(id)
);
```

**Auto-rotate:** Cron job (`0 1 * * *` — 09:00 MYT daily) checks `next_rotation_date <= today` → current = next-from-pool · advance `next_rotation_date`.

**Manual override:** admin edits `current_holder` directly.

**Success criteria:** admin can add "Warehouse gate keeper (weekly)" from the UI, assign 3 staff to the pool, see it rotate every Monday.

### Fix 6 · MC trigger UI (Phase 4)

**Where:** staff profile page (`/operation/staff/:id`).

**Field:** `salespersons.status text default 'active' check (status in ('active','mc','resigned'))` (schema: migration 0245 — additive, safe).

**Trigger — when status changes `active → mc`:**
1. Fire RPC `reassign_open_tasks_to_buddy(staff_id)`:
   ```sql
   update ops_tasks
      set assigned_to = (select buddy_id from salespersons where id = staff_id),
          note = coalesce(note, '') || E'\n[system] Reassigned from ' || (select name from salespersons where id = staff_id) || ' (MC)'
   where assigned_to = staff_id
     and status in ('open', 'in_progress');
   ```
2. Notify buddy (bell 🔔 · in-app notification)
3. Duty Board shows `Ching · MC Wed-Fri · buddy Joy`

**On `mc → active`:** NO auto-reversal (buddy keeps unless manually reassigned — matches how humans actually pass work back).

**Success criteria:** Jess clicks "Mark MC" on Ching's profile · Joy immediately sees Ching's 5 open tasks in her My Tasks panel with `[system]` note.

### Fix 7 · Responsive rules (Phase 2)

**Breakpoints (Tailwind conventions):**

| Screen width | Layout |
|---|---|
| `≥ 1200px` (`xl:`) | 3-pane inline (facet 200 · list 420 · detail fills) — the LOCKED layout |
| `900-1199px` (`lg:`) | 2-pane (facet collapses to icon toolbar 40px · list · detail) |
| `< 900px` (`md:` and below) | 1-pane (facet as slide-over · list · detail as overlay drawer, falls back to old `OrderDetailDrawer`) |

**Trigger:** `useMediaQuery` in `apps/web/src/lib/use-media.ts` (already exists per Purchase cockpit).

**Success criteria:** open Orders on 1024×768 tablet · facet auto-collapses · detail opens as slide-over instead of side-panel · nothing overflows horizontally.

### Fix 8 · Column consolidation with escape hatch

**Default view:** single `Items` column showing `5 MS · 3 BF · 8 Sofa` inline (compact).

**Escape hatch:** a `[Details view]` toggle in the table header · when on, restores the 3 separate columns (MS · BF · Sofa) — Master Sheet muscle-memory intact.

**Persistence:** localStorage per staff (`orders_items_view=compact|details`) so each person's preference sticks.

**Success criteria:** default = compact for new users · veterans toggle Details once and never see the compact view again.

### Fix 9 · Real cost disclosure

Rewrite the phased-execution section header from "~8h across 4 phases" to:

> **Total real cost = 22-25h across 3-4 weeks:**
> - Phase 0: 1h (research)
> - Phase 1: 3h impl + 2h review/test
> - Phase 2: 3h impl + 3h review/test (big change)
> - Phase 3: 2h impl + 1h review/test
> - Phase 4: 1h impl + 1h review/test
> - Phase 5: 2h impl + 2h review/test
> - Deploy per phase: ~15 min × 5 phases = 1.25h
> - Contingency (fixes after Jess reviews each phase): 3-4h

### Fix 10 · Locked-hard vs negotiable tiers

Split the 12 LOCKED decisions into TWO tiers so fresh chat knows what it can/can't propose changes to:

**Locked HARD (never touch — spec violations = revert):**
- #2 Keep 5-stage lifecycle (danger zone #1)
- #6 Pin vs Follow-up task split (semantic clarity)
- #12 Page name "Orders" (no module tabs)
- All `readinessOf` / `stockMatchKey` / `STOCK_BUCKETS` internals (danger zone #2)
- All existing count / label formats (danger zone #1)

**Locked, NEGOTIABLE if Phase 0 findings challenge OR Jess agrees:**
- #1 3-track model (could be 4 if Service Cases wants a top slot)
- #3 Compact 2-row header (some staff may prefer 3-row for scanability)
- #4 3-pane inline split (could stay drawer overlay if tests too fragile)
- #5 Right rail 4 widgets (could be 3 or 5)
- #7 Buddy + Overflow queue (some ops teams prefer auto-reassign)
- #8 Duty Board visible to all (could be role-gated)
- #9 3-layer accountability (could be 2 or 4 layers)
- #10 Days-to-deliver strip DROPPED (could re-add if Calendar too small)
- #11 Purchase strip KEPT (different data — stable)

**Rule for fresh chat:** if you want to change a NEGOTIABLE decision, open a PR amendment to this doc first with new reasoning. If you want to touch HARD-locked → ASK Jess in chat.

---

## Phased execution — 4 PRs (Sat 2026-07-26 onward)

- **Phase 0** (~1h · RESEARCH, before any code) — Fix 1 above. Observe 2 staff · document findings · confirm/challenge LOCKED decisions.
- **Phase 1** (~3h impl + 2h review) — copy audit + row action-line + inline What-to-do per stage. Delete old drawer verb-mixes, unify vocab (SO vs PO). Column consolidation (11 → 8) WITH `Details view` escape hatch (Fix 8). Small header hint `Deliveries today N › calendar`.
- **Phase 2** (~3h impl + 3h review · BIG) — 3-pane inline split (kill OrderDetailDrawer overlay). Detail always visible. Responsive rules (Fix 7 — 3-pane / 2-pane / drawer fallback). Needs full tests since drawer state moves inline (~36 tests baked in per `ORDERS_LIST_SPEC.md`).
- **Phase 3** (~2h impl + 1h review) — 3-track pill row (top) + wire Next-action-to-track mapping (display-only, no state machine touch). 5-stage tabs stay on row 2. Compact 2-row header locked.
- **Phase 4** (~1h impl + 1h review) — missing-data guards + `Something wrong? (soon)` stubs per stage. Duty Board expansion (Fix 5 — admin surface + rotation cron). Pin vs Follow-up split. MC trigger UI (Fix 6 — buddy inheritance + notification). Buddy field + Overflow queue.
- **Phase 5** (~2h impl + 2h review · EDGE CASES) — Multi-track badges (Fix 4). Any Phase 0 findings that need a fix. Success-metric measurement (Fix 3 · post-implementation).

**Each phase = one PR.** Review + merge + deploy independently.

---

## Deploy notes (from `docs/purchase-cockpit-handoff.md` §2)

- Purchase cockpit deployed 2026-07-22 from main tip `0777e1d6` (PR #243 merged) — api Worker `bd961e7a` · web `1655fc68`/`0d037ca5` to both carres-portal + carres-pos Pages projects · custom domains `erp.` + `pos.` carresofficial.com.
- Any Orders panel changes follow the SAME procedure:
  - Deploy ONLY from `main`
  - `pnpm install` first (LESSON 1 — else wrangler bundles stale `@carres/shared`)
  - Deploy API: `pnpm --filter @carres/api exec wrangler deploy`
  - Build web: `pnpm --filter @carres/web build`
  - Deploy web to both projects: `wrangler pages deploy dist --project-name=carres-portal --branch=main` + same for `carres-pos`
  - Re-curl canonicals ~15s after (LESSON 2 — edge cache lag)

---

## Open Purchase-side follow-ups (NOT this Orders work)

- Sat / Sun / public holidays greyed on Purchase Days-to-order strip (`packages/shared/src/my-holidays.ts` already exists — just import + check each cell's ISO).
- L / R chevron nav on Purchase strip (shift the 14-day window ±7 days).
- Real Send PO / Chase WhatsApp / Check-in GRN write paths (`docs/purchase-cockpit-handoff.md` §6 later units).
- Lead-time settings screen (migration 0243).

---

## Anti-drift note for next chat

If a fresh chat reads this and thinks any locked decision is wrong, it MUST:
1. Ask Jess explicitly before deviating
2. NOT silently redesign — every change from this spec = a conversation
3. Reference the LOCKED # in this file when proposing a change

The reason for locking = we already went through 3 rounds of Purchase feedback + 1 round of Orders proposal-review with Jess to arrive at these decisions. Re-deriving from scratch wastes token + risks landing somewhere Jess already rejected.
