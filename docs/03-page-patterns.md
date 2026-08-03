# 03 · PAGE PATTERNS

> **Status: FROZEN.** Standard page layouts for the whole Carres Portal.
>
> Business modules REUSE these patterns and never invent their own page layout.
> A module's shape is recorded here as a **Carres Example** under the pattern it
> uses — an example is not a new standard, and a module never gets its own
> standards document (Loo, 2026-07-31: *"我们现在最大的目标是减少文件"*).

Page patterns use `01-design-tokens.md` and `02-components.md` only. They never
define typography, colour, spacing or component styles.

**One purpose per page. One primary action. Business logic belongs to modules,
never to a pattern.**

**One obvious reading path** (`UI_KIT_MASTER` §5, Loo 2026-08-02). Within three
seconds the operator knows: where they are · what needs attention · what to do
next.

**Vertical chrome is economical** (`UI_KIT_MASTER` §11, Loo 2026-08-02). Never
stack breadcrumb + title + tabs + summary + toolbar + filters + table header
without proving every layer earns its height. The active tab is never repeated
as a second page title unless the title adds information the tab does not.
When a pattern's workspace model scrolls its regions independently, the PAGE
itself does not scroll.

---

# Shell — the fixed module header (Loo, 2026-08-02)

**The shell draws the header; pages never do** (壳画头). A module's header is
ONE component rendered as the page's first child. A page draws no breadcrumb,
no title, no global icons of its own — it structurally cannot forget or
mis-draw the header, because it never draws one.

**One row · 44px · white · never scrolls.** Screens are wide and short, so the
header spends width, not height. White with a 1px bottom hairline; the only
colour allowed above the content is the blue active underline and a red count
badge — never a brand colour, except the logo.

```
Module word │ Tab  Tab  Tab  Tab │ ····· page-meta │ 🔔 ❓ ⚙
─────────────────────────────────────────────────────────────
page content — the only scroll area
```

**The five slots.** Any future function is placed by asking ONE question —
*who is it for?* — and the answer is final:

| It is for… | Slot |
|---|---|
| every page in the portal | **A** — global icon cluster (Bell · Help · Settings; ⌘K later) |
| the workload of one tab | **B** — a count badge on the tab word |
| this page only | **C** — the page's own toolbar row, right end |
| a selection | **D** — the batch bar, rendered only while something is selected |
| one record's identity | **E** — the Detail page title block (title + StatusPill + one meta line) |

A list page never repeats the lit tab as a title (that is Slot E's job on a
Detail page, where the title is the RECORD's name). Nothing else may enter the
header — an H1, a description, a search box, a page action or a KPI in the
header is a defect, not a variant.

**Carres Example.** Purchasing — `PurchasingTabs` is the module's shell row
(module word · 5 tabs · page-meta slot · global icons); To Order, Purchase
Orders, Receiving, Claims and Settings all render it first and draw nothing
above their own toolbar.

---

## Pattern standard

**Purpose · When to use · When NOT to use · Information Hierarchy · Layout ·
Regions · Primary action · Secondary actions · Responsive · Do · Don't ·
Carres Examples**

---

# Dashboard

**Purpose.** Monitor overall status.

**Information Hierarchy.** 1 Current Actions · 2 KPIs · 3 Issues · 4 Recent Activity

**Regions.** Header · KPI area · Action queue · Issues · Activity

---

# Queue

**Purpose.** Process multiple work items.

**Information Hierarchy.** 1 Current work · 2 Priority · 3 Status · 4 Assignee

**Regions.** Filters · Queue list · Detail panel · Bulk actions

---

# List

**Purpose.** Browse and manage records.

**Information Hierarchy.** 1 Records · 2 Filters · 3 Sorting · 4 Pagination

**Regions.** Toolbar · Filters · Table · Pagination

---

# Detail

**Purpose.** View one record.

**Information Hierarchy.** 1 Identity · 2 Current status · 3 Current action ·
4 Details · 5 History

**Regions.** Header · Summary · Detail sections · Activity timeline

### Carres Examples

**Order Detail** — the Golden Template. Six questions in the order a human asks
them, and the System Model is re-fitted to serve it, never the reverse.
Detail in `docs/ORDER-DETAIL-INFORMATION-MODEL.md`.

---

# Review

**Purpose.** Verify information before committing it.

**When to use.** The operator's job is to CHECK, then commit — not to fill in.
Roughly 80% of the time on the page is reading.

**When NOT to use.** Creating a record (that is Create) or browsing many
records without committing anything (that is List).

**Information Hierarchy.** 1 Summary · 2 Review items · 3 Validation · 4 Confirmation

**Regions.** Summary · Review items · Validation · Actions

**Primary action.** One, at the end, that commits. It carries the count of what
it is about to do.

**Do.** Give the review items the largest region — they are what is being
reviewed.
**Don't.** Put the commit parameters far from the commit, or the identity far
from the irreversible button.

**Rulings that bind every Review page** (Loo, 2026-07-31):

- **An unbuilt region is NOT rendered as an empty placeholder.** A chevron
  that opens nothing is a dead control. A frozen region ORDER holds; a region
  joins the page when its data exists, not before.
- **A commit parameter has ONE operational home — beside the commit.** It is
  repeated nowhere else on the page.
- **A region with a one-line body is a permanent line, not a collapsible.** It
  becomes collapsible when there is something to open.

### Carres Examples

None. To Order was this pattern's example until 2026-08-01; it is a
**Workspace** now (below), and the old single-proposal Review layout —
Header · Supplier Communication · Items · Notes · Issue, inside a 280px queue
rail — **was deleted whole with the page**. It is not recorded here as
history: a superseded example is a page somebody will build.

---

# Workspace

**Purpose.** Decide, across many records at once, and commit in one act.

**When to use.** The operator scans a whole day's work, narrows it, ticks what
goes, and commits — and the commit produces documents, not edits. The unit of
thought is the BATCH, not one record.

**When NOT to use.** Verifying ONE record before committing it (that is
Review) · browsing without committing (that is List) · working one item at a
time down a queue (that is Queue).

**Information Hierarchy.** 1 Where am I · 2 What is blocked · 3 The rows ·
4 What the commit will do

**Layout.** Two panes, no page scroll.

```
┌ shell header — module word · tabs · page-meta · global icons ─────────────┐
├──────────────┬───────────────────────────────────────────────────────────┤
│ NAVIGATOR    │ toolbar    search ···· scope · selection · PRIMARY ACTION  │
│ ~200px       ├───────────────────────────────────────────────────────────┤
│              │ banners    blocked / held / result — only when non-empty   │
│ engine-      ├───────────────────────────────────────────────────────────┤
│ guided       │                                                           │
│ narrowing    │ GRID — the only scroll area on the page                    │
│              │                                                           │
│ blocks are   ├───────────────────────────────────────────────────────────┤
│ toggles and  │ footer     what am I looking at, counted · way back out    │
│ clear fully  │                                                           │
└──────────────┴───────────────────────────────────────────────────────────┘
```

**Regions.** Navigator · Toolbar · Banners · Grid · Footer.

**Primary action.** One, in the toolbar, carrying the count of what it is about
to do. **It exists only while something is selected.**

**Behaviour — the rules that make this a pattern and not a page.**

- **Left guides, right frees.** The navigator says where the engine thinks the
  work is; it never limits what the operator may see, select or commit.
- **Every navigator block is a toggle and clears ALL the way.** Empty = that
  dimension stops narrowing. Nothing is forced to stay lit.
- **The batch is VIEW-SCOPED** (Excel's law). The commit acts on the sheet in
  front of you: a tick hidden by any filter neither counts nor commits.
- **The grid is the only scroll area.** The page itself does not scroll — the
  header, toolbar and footer never move.
- **The engine pre-selects only its own plan.** Everything a human changes is a
  DELTA, so a refetch can add rows but can never overturn a human's tick.
- **Reports are top flash bands, never toasts.** Success dismissible · failure
  stays with a retry and may not be waved off · a warning stays until resolved.
- **A page action appears only once it is BUILT.** No dead controls; a control
  that is deliberately disabled must say why, on screen.
- **No Refresh button** — the plan recomputes itself and states when it did.

**Do.** Give the grid every pixel the other four regions do not need.
**Don't.** Explain the commit only in a `title` tooltip — a fact the keyboard
cannot reach is a fact half the operators never get.

### Carres Examples

**Purchasing → To Order** *(frozen 2026-08-01; `OperationToOrder.tsx`)* — the
pattern's first page and the reference for the rest of the module.

```
Navigator   PO Schedule (one row per upcoming PO day, rolling, Overdue on top)
            Category (All · Mattress · Bedframe · Sofa · …)
            + Create Purchase
Toolbar     search · scope · `{n} selected` · `Issue {n} POs` · Updated hh:mm
Grid        ☑ · Customer Delivery · SO No. · Customer · Model · Qty · PO No.
Footer      `{n} orders` · Clear filters
```

Business rules this example depends on, owned by
`docs/PURCHASING-WORKING-FLOW.md` and not by this file: the planning engine
owns the schedule and operators own the purchase order · `Issue PO` is the one
act that creates a purchase order · the engine's `Order By` never reaches the
screen — it decides which navigator row a demand sits in.

**Purchase Orders** · **Receiving** · **Claims** · **Payments** — the same
pattern. Each is recorded here as it is built.

---

# Create

**Purpose.** Create a new record.

**Information Hierarchy.** 1 Required · 2 Optional · 3 Review · 4 Submit

**Regions.** Form · Context panel · Actions

---

# Edit

**Purpose.** Modify an existing record.

**Information Hierarchy.** 1 Current information · 2 Editable fields · 3 Save

**Regions.** Form · History · Actions

---

# Settings

**Purpose.** Configure system behaviour.

**Information Hierarchy.** 1 Categories · 2 Settings · 3 Description · 4 Save

**Regions.** Navigation · Settings panel · Actions

### Carres Examples

**Purchasing → Settings** — production working days, supplier work week,
order-by buffer. A supplier × category with no number reads `Set a number` and
is never defaulted.
