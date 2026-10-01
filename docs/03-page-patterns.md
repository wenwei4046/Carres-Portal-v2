# 03 · PAGE PATTERNS

> **Status: GOVERNED SHARED PATTERNS.** Standard page layouts for the whole Carres Portal.
>
> Business modules REUSE these patterns and never invent their own page layout.
> A module's shape is recorded here as a **Carres Example** under the pattern it
> uses — an example is not a new standard, and a module never gets its own
> standards document (Loo, 2026-07-31: *"我们现在最大的目标是减少文件"*).

Page patterns use `01-design-tokens.md` and `02-components.md` only. They never
define typography, colour, spacing or component styles.

The current shared-template direction and its approval boundaries live in
[`ui/MASTER.md`, Houzs-based shared page templates](ui/MASTER.md#houzs-based-shared-page-templates--owner-direction-2026-10-01).
This file describes the common patterns; it is not a second reference selection or an authority
to redesign each page independently. The current listing contract is UI MASTER §6.0; its detailed
Register/Object Detail rules govern where an older example below differs.

**One purpose per page. One primary action. Business logic belongs to modules,
never to a pattern.**

**One obvious reading path.** Within three
seconds the operator knows: where they are · what needs attention · what to do
next.

**Vertical chrome is economical.** Never
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

The current header contract, dimensions and contents live once in
[`ui/MASTER.md` §6.0](ui/MASTER.md#60--listing-template--every-portal-listing--owner-rulings-2026-09-21-jess).
Use the shared module header, with page name and global tools. Page actions belong in the
toolbar; do not reconstruct the header locally or restore an old module-tab header example.

```
Page name │ Jump to · alerts · help · settings
─────────────────────────────────────────────────────────────
page content — the only scroll area
```

**Placement follows purpose**, within the current UI MASTER contract:

| It is for… | Slot |
|---|---|
| every page in the portal | the shared header's global tools |
| this page only | the page toolbar, using the shared controls |
| a selection | the shared selection toolbar, only while something is selected |
| one record's identity | the governed Object Detail header |

The shared header names the page once. Search and page actions stay in the toolbar;
no extra title, explanatory banner or KPI strip is added above a register without its
governed business purpose. Module destinations and object identity follow their current
owning MASTER, not the superseded Purchasing tab-shell example.

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
Detail in `orders/MASTER.md`.

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

**Purchasing → SO Batch Purchase** *(owner rulings 2026-08-27, Cards 02-B and 02-C;
`OperationToOrder.tsx` orchestrating `so-batch/SoBatchRegister.tsx`)* — the
pattern's first page and the reference for the rest of the module.

```
Navigator   TO ORDER (All not ordered)                       ← 240px FilterRail,
            ORDER TIMING (Can order early ·                    labels wrap, never
                          14 safety days left ·                truncate; no
                          1–13 safety days left ·              checkboxes; one
                          No safety days left ·                filter per section
                          Not enough production days)
            PRODUCT (All products · Mattress · Bedframe · Sofa)
            SUPPLIER (All suppliers · actual names, alphabetical)
            SETUP TO FIX (Production days not set — the whole section
                          renders only when at least one affected SO exists)
Toolbar     search · filter · sort · display · export
Grid        ☑ · Status · Proceed Date · PO No · SO No · Customer ·
            Delivery Location · Requested Delivery Date · Supplier ·
            Deliver To · PO Delivery Date
Footer      `{n} Sales Orders · {n} Partial · {n} Ordered`
```

Business rules this example depends on, owned by
`docs/purchasing/MASTER.md` and not by this file: the one server planning
engine owns the timing arithmetic and every rail category derives from it ·
`Issue PO` is the one act that creates a purchase order · the engine's
`Order By` drives the `ORDER TIMING` rows — it is a planned date, never an
unlock date, and every timing row remains orderable.

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
Safety days (`Safety days · 14 working days` — `Extra time allowed for
delays.`). A supplier × category with no number reads `Set a number` and
is never defaulted.
