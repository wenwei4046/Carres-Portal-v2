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

### Carres Examples

**Purchase Orders → To Order** *(region order frozen 2026-07-31; page rebuilt
from zero on the kit the same day — `OperationToOrder.tsx`, the old shell
deleted whole)*

```
Header                    supplier · category · order-by date
Supplier Communication    channels · WhatsApp + Email drafts   collapsed by default
Items                     the review itself                    the largest region
Notes to Supplier
Issue Purchase Order      the one primary action
```

Order is deliberate: **who am I sending to → can I reach them → what am I
sending.** Communication sits ABOVE Items and collapsed, because the real
sequence is review-then-send, and a section at the bottom of a long table is a
section that gets missed.

Rulings this example added (Loo, 2026-07-31 — they bind every Review page):

- **An unbuilt region is NOT rendered as an empty placeholder.** A chevron
  that opens nothing is a dead control. The frozen region ORDER holds; a
  region joins the page when its data exists, not before.
- **A commit parameter has ONE operational home — beside the commit.**
  Destination lives in the Issue region, where the operator confirms it, and
  is repeated nowhere.
- **A region with a one-line body is a permanent line, not a collapsible.**
  The Header is a permanent `SectionHeader` (title `supplier · category`,
  meta `Order by {date}`) until `suppliers` carries address / tel / attn /
  terms — then it becomes collapsible, because there is something to open.

Section status:

| Section | State |
|---|---|
| Items | ✅ `SectionHeader` (permanent) + `DataTable` — Ref · Item · Size · Qty · `⋯` |
| Header | line only — body blocked on `suppliers` address / tel / attn / terms |
| Supplier Communication | not rendered — blocked on `po_sends` |
| Notes to Supplier | not rendered — no ruled word |
| Issue | ✅ `Card` + `Select` (Destination) + the one primary `Button` |

The page around the workspace is the Queue pattern: a 280px queue rail
(proposals, with the current proposal's purchase orders nested under it) and
the workspace as the detail panel. The rail is page-local markup, tokens only
— extracted into the kit on its second occurrence, per `02`'s own law.

Frozen rules this example depends on, owned by Business not by this file:
one purchase order has exactly one fulfilment destination · a sofa purchase
order carries one customer order and never merges · Communication is an EVENT,
never a status · there is no `Sent` state, because the portal cannot observe
WhatsApp.

**Receiving** · **Claims** — not yet designed. When they are, their shape is
recorded here, under the pattern they use.

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
