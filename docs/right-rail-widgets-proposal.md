# Right rail widgets — full proposal (LOCKED 2026-07-22)

> Spec for the 4 right rail widgets: Calendar · Duty Board · Tasks · Activity. These sit on the right of EVERY main portal panel (Orders / Purchasing / Inventory / Delivery / Payments / Service Cases). Locked with Jess (COO) 2026-07-22.

**Core principle:** widgets **interlink** with each other AND with the LEFT main panel. No widget is an island. Every action anywhere in the portal cascades to relevant widgets in real-time. This is what makes the rail management-grade (COO can supervise) AND staff-grade (everyone knows what everyone's doing without asking).

---

## How to resume (any machine, any new chat)

Paste this into a fresh chat:

> Continue Right Rail Widgets build. Read in order:
> 1. `docs/right-rail-widgets-proposal.md` — this file, the SPEC
> 2. `docs/COPY-STANDARD.md` — microcopy rules
> 3. `docs/UI-KIT.md` §A0 — Module-tab law
> 4. `docs/orders-panel-concept-proposal.md` — Orders sibling (Duty Board expansion lives there too)
> 5. All other module proposals (Purchase / Inventory / Delivery / Payment) for cross-panel content matrix
>
> Live-poke `https://erp.carresofficial.com/operation?tab=purchase` for current right rail (Team · Calendar · Follow-ups · Activity).
>
> Start with **Phase 0 · user research** (observe 1 line ops + Jess as COO for 15 min each).

---

## Contract

- **UNIVERSAL chrome** — same 4 widgets on every main portal panel (Orders / Purchasing / Inventory / Delivery / Payments / Service Cases).
- **Content adapts to LEFT context** — Calendar shows delivery dates on Orders, order-by dates on Purchasing, etc.
- Widgets INTERLINK (see Interlink section below · LOCKED HARD).
- Zero danger-zone breakage — extends existing `Team` / `Calendar` / `Follow-ups` / `Activity` widget skeletons.
- One PR per phase.
- Deploy only from `main`.

---

## LOCKED decisions

**HARD (never touch):**

| # | Decision | Why |
|---|---|---|
| 1 | 4 widgets max, no more no less | Miller's Law · cognitive load |
| 2 | Widget names: **Calendar · Duty Board · Tasks · Activity** | International standard (Notion / Linear / Airbnb) · one purpose each |
| 3 | Each widget has explicit **Step 1-2-3 pedagogy** top-to-bottom | Zero-experience friendly · read top-down = do top-down |
| 4 | **Widgets interlink** (action in one → cascade to others) | The whole point — help each other, not silos |
| 5 | **LEFT panel selection cascades to right** (select SO → widgets adapt) | Context-sensitive right rail (Airbnb/Linear pattern) |
| 6 | Tasks widget has **My / Team toggle** — line ops stay on My default, COO toggles to Team | Same widget serves both roles |
| 7 | Duty Board visible to ALL staff (no role gating) | Transparency law — zero guessing |
| 8 | Red = fix first · Yellow = do next · Green = plan — semantic COLOUR CONSISTENT across ALL widgets | One colour language across rail |
| 9 | System suggests when it can (`Joy overloaded — consider reassigning to Sha`) | AI-nudge, not just data dump |
| 10 | Auto-refresh 30s (except Calendar which is user-triggered) | Live feel without spam |
| 11 | Rail width 240-280px fixed · icon-only 48px collapsed mode | Save horizontal space at will |

**NEGOTIABLE:**

| # | Decision | Alternative |
|---|---|---|
| 12 | 4 widgets order top-down: Calendar · Duty · Tasks · Activity | Could reorder based on Phase 0 findings |
| 13 | Auto-refresh 30s cadence | Could be per-widget different |
| 14 | Widget rail icon-only collapse | Could hide entire rail with keyboard shortcut |

---

## Executive rating trajectory

| Point | Rating | State |
|---|---|---|
| Now | 3/10 | Widgets exist but disconnected · no cross-widget cascade · Activity dumps every audit event, unusable · no Duty Board expansion |
| After Phase 1 (audit + rename + one-purpose-per-widget) | 5/10 | Consistent naming and purpose |
| After Phase 2 (Duty Board expansion + rotation admin) | 6/10 | Transparency law working |
| After Phase 3 (LEFT→RIGHT context propagation) | 7/10 | Widgets react to main panel selection |
| After Phase 4 (widget ↔ widget interlink · cross-cascade) | 8/10 | Full interlink live |
| After Phase 5 (Phase 0 findings + AI nudges) | 9/10 | Live-tuned |
| After 2 weeks live-usage | 10/10 | Only real staff feedback |

---

## Widget 1 · 📅 Calendar · answers "When?"

```
┌────────────────────────────┐
│ 📅 Calendar                │
│ ─────────────────          │
│ TODAY · 22 Jul · Wed       │  ← STEP 1: today at a glance
│  🚚 5 deliveries           │
│  📦 3 POs due               │
│  🔔 5 follow-ups            │
│ ─────────────────          │
│ ‹  July 2026           ›   │
│ Mo Tu We Th Fr Sa Su       │
│           1  2  3  4  5    │
│  6  7  8  9 10 11 12       │
│ 13 14 15 16 17 18 19       │
│ 20 21 22 23 24 25 26       │  ← 22 highlighted flame (today)
│      ●        ●            │  ← dots = has events (per module context)
│ 27 28 29 30 31             │
│ ●     ●                    │
│ ─────────────────          │
│ 💡 Click any day to focus  │  ← STEP 3: teach the click
└────────────────────────────┘
```

**Cross-panel content:**
- Orders: delivery dates
- Purchasing: PO order-by dates
- Inventory: reconciliation cadence
- Delivery: delivery schedule
- Payments: payment due dates
- Service Cases: case SLA dates

**Interlinks:**
- Click date → Tasks filter to that day + main panel list filter
- Duty Board MC block → Calendar shows greyed dates for that person
- Task due date change → Calendar dot updates real-time

---

## Widget 2 · 👥 Duty Board · answers "Who's covering what?" · TRANSPARENCY = ZERO GUESSING

```
┌────────────────────────────┐
│ 👥 Duty Board · everyone   │  ← everyone sees SAME view
│ ─────────────────          │
│ ⚠ Escalation duty EMPTY    │  ← STEP 1: fix red first
│    → [ Assign now ]        │
│ ─────────────────          │
│ THIS WEEK (Mon 22 - Sun 28)│
│ PO duty         · Jess  🟢 │  ← STEP 2: see this week
│ Escalation      · nobody ⚠ │
│ Standup lead    · Joy   🟢 │
│ Reception       · Sha   🟢 │
│ ─────────────────          │
│ STAFF STATUS               │
│ Jess   🟢 active · 3 tsk   │  ← STEP 3: who's covering
│ Ching  🟡 MC W-F · buddy=Joy│    if MC, buddy shown
│ Joy    🟢 active · 5 tsk 🔥│    🔥 = overloaded flag (>4 tasks)
│ Sha    🟢 active · 2 tsk   │
│ ─────────────────          │
│ [ Edit duties → COO only ] │
└────────────────────────────┘
```

**Interlinks:**
- Ching status → MC → Tasks widget auto-reassigns Ching's open tasks to buddy Joy
- Duty change (PO handover) → Activity log entry
- Task count per person aggregated from Tasks widget → shows next to name

---

## Widget 3 · 🔔 Tasks · "What to chase" · My / Team TOGGLE

```
──── MY VIEW (default for line ops) ────
┌────────────────────────────┐
│ 🔔 Tasks [ My │ Team ]     │
│ ─────────────────          │
│ 🔴 STEP 1 · FIX OVERDUE (1)│
│ Call Ali Chen · 2h late    │
│                            │
│ 🟡 STEP 2 · DO TODAY (2)   │
│ Chase Ohana · 3pm          │
│ Book NETS · SO-1204        │
│                            │
│ 🟢 STEP 3 · PLAN THIS WEEK │
│ Upload POD SO-1210 · Fri   │
│ Confirm quote · Fri        │
│ ─────────────────          │
│ [ + New follow-up ]        │
└────────────────────────────┘

──── TEAM VIEW (COO / manager default) ────
┌────────────────────────────┐
│ 🔔 Tasks [ My │ Team ]     │
│ ─────────────────          │
│ 🔴 OVERDUE TASKS (4)       │
│ Ching (MC) → Joy · 2 tasks │  ← STEP 1: see who's late
│ Sha · 1 task · 2h late     │
│ Joy · 1 task · 30min late  │
│                            │
│ WORKLOAD DISTRIBUTION       │
│ Jess ▓▓▓        · 3         │  ← STEP 2: balance workload
│ Joy  ▓▓▓▓▓▓ 🔥  · 6         │
│ Sha  ▓▓          · 2         │
│ Ching (MC W-F)  · 0         │
│                            │
│ 💡 Joy overloaded — consider│  ← STEP 3: AI-nudge
│    reassigning 1 to Sha    │
└────────────────────────────┘
```

**Interlinks:**
- Complete task → Activity log entry + Calendar dot fades
- Task overdue → Duty Board shows 🔴 next to owner
- Ching MC → tasks auto-move to Joy · notification fires
- Overload detected (Joy >5 tsk) → 🔥 badge on Duty Board + nudge in Team View

---

## Widget 4 · 📜 Activity · "What happened + what to flag?"

```
┌────────────────────────────┐
│ 📜 Activity [Global│This SO]│  ← STEP 1: pick scope
│ ─────────────────          │
│ ⭐ FLAGGED (2)              │  ← STEP 2: COO's saved items
│ 2h · Approved refund RM500 │
│ Yesterday · PO-84 arrived  │
│ ─────────────────          │
│ RECENT (auto-refresh 30s)  │
│ 2h · operation@ · SO-1204  │
│ Assigned NETS · KL → Klg   │
│ [ ⭐ Flag ] [ Detail ]      │  ← STEP 3: flag for later
│                            │
│ 3h · sales@ · SO-1210      │
│ Reserved 1× N1001S-Q       │
│                            │
│ 5h · jess@ · SO-1195       │
│ Approved refund RM 500 ⭐  │
│                            │
│ ─────────────────          │
│ [ Load more ] [ Filter ▼ ] │
└────────────────────────────┘
```

**Interlinks:**
- Any action (LEFT panel or right widget) → Activity entry
- Flag ⭐ → creates a follow-up task in Tasks widget (COO backlog)
- Select SO on left → Activity toggles to "This SO" mode auto
- Delete/edit action → Activity records the change with before/after diff

---

## Interlink diagram (LOCKED · this is the whole point)

```
    LEFT (Main panel · Orders/Purchase/etc.)
                       │
                       │  Select · Filter · Action
                       ▼
    ┌─────────────────────────────────────────────────┐
    │              RIGHT RAIL (4 widgets)              │
    │                                                   │
    │   📅 Calendar ◄──────► 🔔 Tasks                  │
    │        ▲                    ▲                    │
    │        │                    │                    │
    │        ▼                    ▼                    │
    │   👥 Duty Board ◄──────► 📜 Activity              │
    │                                                   │
    └─────────────────────────────────────────────────┘
                       │
                       │ Bidirectional
                       ▼
    LEFT refreshes (row updates · counts refresh · alerts)
```

## Cross-panel content matrix

| Panel opened | Calendar shows | Tasks shows | Duty shows | Activity shows |
|---|---|---|---|---|
| **Orders** | Delivery dates | My/Team follow-ups | Full board | All SO events |
| **Purchasing** | PO order-by dates | PO chase tasks | Full board (PO duty highlighted) | All PO events |
| **Inventory** | Reconciliation cadence | Stock check follow-ups | Full board | Stock movements |
| **Delivery** | Delivery schedule | POD chase tasks | Full board (Escalation highlighted) | All delivery events |
| **Payments** | Payment due dates | Collect $ tasks | Full board | All payment events |
| **Service Cases** | Case SLA dates | Case follow-ups | Full board | All case events |

---

## Data model (LOCKED · additive migrations)

**Migration 0253 · activity_flags (⭐ Flag mechanic)**

```sql
create table activity_flags (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid references audit_log(id) on delete cascade,
  flagged_by uuid references salespersons(id),
  flagged_at timestamptz default now(),
  reason text,
  resolved_at timestamptz,
  resolved_by uuid references salespersons(id),
  unique(activity_id, flagged_by)
);
```

**Migration 0254 · ops_tasks extension**

```sql
alter table ops_tasks add column
  auto_reassigned_from uuid references salespersons(id);

alter table ops_tasks add column
  auto_reassigned_at timestamptz;

alter table ops_tasks add column
  auto_reassign_reason text;   -- e.g. 'buddy_mc'
```

**Migration 0255 · salespersons buddy field**

```sql
alter table salespersons add column
  buddy_id uuid references salespersons(id);

alter table salespersons add column
  status text default 'active' check (status in ('active', 'mc', 'resigned'));

alter table salespersons add column
  mc_from date;

alter table salespersons add column
  mc_to date;
```

**Client state (Zustand or React context) — right rail context**

```ts
interface RightRailContext {
  selectedRowId: string | null;      // main panel selected row (SO / PO / etc)
  selectedRowType: 'so' | 'po' | 'inventory_sku' | null;
  selectedDate: string | null;        // Calendar-clicked date (ISO)
  activePanel: 'orders' | 'purchase' | 'inventory' | ...;
  tasksView: 'my' | 'team';
  activityScope: 'global' | 'contextual';
}
```

**Cascade rules (LOCKED):**

```ts
// LEFT selection cascade
onRowSelect(rowId, rowType) {
  ctx.selectedRowId = rowId;
  ctx.selectedRowType = rowType;
  activity.scope = 'contextual';       // auto-switch
  calendar.highlight(rowId);           // pulse
  tasks.pin(rowId);                    // pin related tasks
}

// Widget → widget cascade
onCalendarDayClick(iso) {
  ctx.selectedDate = iso;
  tasks.filter(iso);                   // Tasks show that day only
  mainPanel.filter({ day: iso });      // Main list filters too
}

onTaskComplete(taskId) {
  activity.log({ event: 'task_completed', taskId });
  calendar.fade(taskId);               // dot fades
  duty.recomputeWorkload();            // count refresh
}

onDutyMcChange(personId, newStatus) {
  if (newStatus === 'mc') {
    tasks.reassignOpenTo(person.buddy_id);
    activity.log({ event: 'mc_reassign', from: personId });
    calendar.blockDates(personId, mc_from, mc_to);
  }
}

onActivityFlag(activityId) {
  tasks.createFollowUp({
    ref: activityId,
    assignedTo: currentUser.id,
    title: `Review: ${activity.description}`,
    dueDate: 'tomorrow',
  });
}
```

---

## Executable phases

- **Phase 0** (~2h · RESEARCH)
  - Observe 1 line ops + Jess as COO for 15 min each
  - 5 questions: (1) Which widget do you look at first thing morning? (2) What do you WISH you knew about your team but don't? (3) What's confusing about current Activity? (4) How do you know if someone else is overloaded? (5) What would make you flag/pin something?
  - Write `docs/right-rail-phase-0-findings.md`

- **Phase 1** (~3h + 2h review) — audit + rename
  - Rename existing widgets to canonical names (Team → Duty Board · Follow-ups → Tasks)
  - One-purpose-per-widget audit
  - Copy audit per COPY-STANDARD
  - Icon-only collapsed mode (48px)

- **Phase 2** (~4h + 3h review) — Duty Board expansion
  - Migration 0255 · buddy_id + status + MC dates
  - Rotation admin (PO/Escalation/Standup/Reception)
  - Workload count (🔥 badge at >4 tasks)
  - Transparency law: no role gating

- **Phase 3** (~5h + 3h review) — LEFT → RIGHT context propagation
  - `RightRailContext` client state
  - Selection cascade (select SO → widgets adapt)
  - Facet cascade (filter Region → Activity filters too)
  - Cross-panel content matrix (Calendar shows correct dates per panel)

- **Phase 4** (~4h + 3h review) — widget ↔ widget interlink
  - Migration 0253 (activity_flags) + 0254 (ops_tasks auto-reassign fields)
  - MC → auto-reassign tasks to buddy
  - Task complete → Activity log + Calendar fade
  - Flag Activity → create follow-up task
  - Calendar click → Tasks filter

- **Phase 5** (~3h + 2h review) — Phase 0 findings + AI nudges
  - Overload detection nudge (`Joy overloaded — consider reassigning to Sha`)
  - Live-tune refresh cadence per widget
  - Phase 0 findings fixes

**Total: ~21h impl + 13h review = ~34h across 5-6 weeks · 5 PRs · Rail 3/10 → 9/10.**

---

## Critical self-audit · rating 7/10

### Real gaps

| # | Gap | Fix |
|---|---|---|
| 1 | **Real-time cascade at scale** — 1000 orders/mo · dozens of tasks/day · could firehose widgets | Phase 3: debounce widget refresh 500ms · batch updates · pagination in Activity |
| 2 | **Mobile / tablet** — rail impossible on narrow screens | Phase 1: `<900px` = rail slides in as bottom-sheet · click FAB to show |
| 3 | **Notification fatigue** — every event fires notification, staff mute | Phase 5: aggregation rules (5 events in 1 min → 1 notification) |
| 4 | **Widget interlink complexity** — bug in cascade = wrong data everywhere | Phase 4: unit tests per cascade rule · integration test suite on selection scenarios |
| 5 | **Offline / poor connectivity** — widgets stale, no indication | Phase 5: `Last synced 2 min ago ⚠` badge when >1 min stale |
| 6 | **Auth / role edge cases** — line ops shouldn't see all Activity if sensitive | Phase 4: activity events tagged `sensitivity: public / internal / private` · rail filters |
| 7 | **Historical Activity size** — grows unbounded | Phase 5: retention policy (90 days default · configurable) · archive to `activity_archive` table |
| 8 | **Widget preferences per user** (collapsed by default? show which?) | Phase 5: `user_preferences.right_rail_state` JSON · restore on load |

### Solutions to lift 7 → 9/10

- **Solution A · Cascade debounce + batching** (Fix 1)
- **Solution B · Mobile bottom-sheet fallback** (Fix 2)
- **Solution C · Notification aggregation rules** (Fix 3)
- **Solution D · Cascade unit + integration tests** (Fix 4)

Rated after these: 9/10.
Rated after 2 weeks live-usage: 10/10.

---

## Anti-drift note for next chat

If a fresh chat reads this and thinks any LOCKED decision is wrong:
1. HARD-locked → ASK Jess in chat first
2. NEGOTIABLE-locked → open a doc-amendment PR
3. NOT silently redesign

Reference the LOCKED # when proposing changes.

**The interlink diagram + cross-cascade rules in Phase 4 are the heart of this proposal.** If a fresh chat wants to skip Phase 4 as "polish", ASK Jess — Phase 4 is what makes 4 widgets HELP EACH OTHER, without it the rail is 4 silos.
