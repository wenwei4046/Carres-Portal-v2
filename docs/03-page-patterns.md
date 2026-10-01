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
[`ui/MASTER.md`, Reuse-first shared page templates](ui/MASTER.md#reuse-first-shared-page-templates--owner-ruling-2026-10-01).
This file describes the common patterns; it is not a second reference selection or an authority
to redesign each page independently. The current listing contract is UI MASTER §6.0; its detailed
Register/Object Detail rules govern where an older example below differs.

**Self-contained Carres measurements:** [01 §§7–8](01-design-tokens.md#7--canonical-component-measurements--scoped-not-one-size-for-every-surface) owns the scoped numeric recipes, source/target/status matrix and unresolved conflicts. Use it with these component/pattern contracts. Reference screenshots do not supply missing numbers; proposed sizes do not override approved sizes.

**Owner direction2026-10-01:** adapt measured Houzs geometry/hierarchy to Inter and existing
Carres semantic colours. Do not introduce the withdrawn warm-grey hex proposal or literal Houzs
palette. Compact search dimensions in01§7.2 and the fixed far-right secondary-tools menu are
APPROVED TARGETS awaiting actual pilot acceptance. Visible toolbar content is count/filter summary,
search, admitted Table/Cards and `⋯`. Left rail changes remain unapproved. Reference styling does not change business actions.

**One purpose per page and one obvious primary next action for the current task.**
Secondary authorised actions remain discoverable. Existing UI MASTER/module-specific action
placement wins; this does not impose a new button location. Business logic belongs to modules,
never to a pattern.

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

# List / Register

**Purpose.** Find and compare authoritative records, then open the exact record or governed task.
This is not an alternate My Work queue. A task queue and a document register are distinct.

**Composition (existing governed contract, not a new layout approval):**

```text
Existing portal navigation | Shared module header/global tools | Existing Quick Rail
                          | Governed Site/view tabs when applicable
                          | Filter rail | Search / page tools
                          |             | Register header + rows
                          |             |   Goods-only expansion when opened
                          |             | Scope-matched footer / pagination
```

- Global navigation changes destination. The factual rail narrows the same record population;
  Site remains a tab where the module has ruled it, including Inbound. Neither creates local Work.
- Apply UI MASTER’s owner-approved2026-10-01 Register toolbar target: visible search, current filter summary and admitted Table/Cards; supported secondary page tools in fixed far-right `⋯`. Use 01 §7.2 dimensions. Existing toolbar height remains;48px is not approved. A selection
  action states the selected scope; no hidden rows silently join a destructive/batch operation.
- Use DataGrid, content-led column recipes and governed defaults. Main identity, important facts
  and task door must be readable at the measured shell width. Do not shrink type to force columns.
- Expansion has one admitted purpose: scoped child goods/evidence with real headings and aligned
  quantities. Edit opens the owning surface; only explicitly ruled inline-edit exceptions survive.
- Number/link opens the exact object; return preserves current filters, sort and position under
  the existing state contract. Personal saved layouts and temporary filters are different state.
- Loading/error/denied do not render as empty. Empty filtered results retain criteria and a clear
  way to remove them. Row/quantity summaries and export use the same authorised population.
- Narrow layouts use the existing filter drawer and contained table scrolling. Full-width shell
  evidence is required; an isolated centre cannot prove default columns fit.

**Scoped SO exception — APPROVED TARGET / NOT BUILT, 2026-10-01:** a compact goods summary
with remaining GOODS LINE count may open read-only goods details at the side. This is only the
owner-admitted goods-summary inspection surface, not generic full-order quick view or editing.
Keep existing expansion/full-order navigation and filter context; same source and compatible goods
renderer, keyboard entry, named panel, close/focus return and narrow contained scrolling. UI MASTER
“Sales Order compact goods summary and side inspection” owns the exact scope and evidence status.

**Module differences:** admitted filters, source types, columns, quantities and authorised doors.
No separate card chrome, table engine, date format, selection language or generic local Work rail.

# Detail / Object

**Purpose.** Understand one record, inspect its evidence/history and reach lawful actions.
An object does not gain a permanent Current Action box merely because a shared kit can draw one.

**Composition:** object identity/version and governed actions → existing object views → grouped
facts → source-linked documents/evidence → actual history. A genuine pending task appears in the
object's governed action region, with its existing Work/source responsibility and applicable gates.
Read-only completed objects do not acquire invented work.

- Use Block and the actual approved object adopter, not an assumed universal DetailShell.
- Keep same field/group identity between view and edit. A section has one fact owner and one
  write door; cross-module summaries link there rather than embedding another private form.
- Current version, proposal, last sent version and historical original/reconstruction are labelled
  accurately. Unknown/unreadable document is not no document; authorised commercial data remains
  protected in the preview and attachment as well as the on-screen fields.
- A document split follows the explicit object rule (UI MASTER §4.1 and owning MASTER), not a
  universal “all details split” or “no views split” inference. It is not introduced merely to
  resemble Houzs. Preserve governed SO/PO/GRN arrangements and narrow stacking rules.
- History preserves actual actor/time/source; business completion, document sending and claim
  closure can be independent facts. A single Complete badge cannot suppress another obligation.

**Module differences:** factual groups, document obligations, views, permissions and action gates.
The shared template owns hierarchy/controls, never a universal overall status or approval engine.

### Carres examples

SalesOrderWorkspace · PurchaseOrdersPage · WarehouseUnitDetail are real adopters. Their module
MASTERs own business content. An existing adopter is evidence, not proof that all states or the
new Houzs adaptation are approved. UI MASTER records sample and source revisions.

# Task / Operation

**Purpose.** Finish one source-scoped job. This is the operational role within the approved
list/detail/form/card families, not another business status engine or compulsory wizard.

```text
Exact source / party / Site / goods scope
Current applicable task + factual blocker + resolved responsibility
Necessary checks and input, grouped by work
  Affected good/Unit → its condition, reason and evidence
Final checks + one authoritative submission
Actual result → remaining obligation → next responsible owner / exact door
```

- Enter from an exact arrangement/Work item and preserve its scope; a PO is not automatically
  the entire arriving batch. Use the existing authorised Receiving/Loading workspace.
- The action region summarises; the form performs. Do not repeat editable fields or create a
  second submit path in a rail, modal and page. Exception inputs stay with the affected item.
- Only show steps that correspond to actual decisions/work. No invented serial approval because
  a reference has a stage bar; parallel legitimate work remains possible.
- Before submission show specific missing requirements with field/row targets. Errors and
  summaries use the same validation facts. Keep valid input and evidence on recoverable failure.
- After submission show the actual outcome, remaining work and owner. Warehouse submission is
  not posted GRN; office direct receiving follows its posting authority; loading is not driver
  confirmation. No invented Mark done or manually chosen responsibility list.
- Missing/unresolved owner is stated honestly, not replaced with a guessed person. Qualified help
  follows existing permissions and records the actual performer; duty accountability stays intact.
- Unknown timeout result is not definite failure. A file-generation error after business success
  is not permission to repeat the business transaction. These require source integration proof.

**Evidence status:** target composition; actual module adoption and all-state verification remain
tracked in UI MASTER. A local simulated task is not verified Receiving/Stock/Work behaviour.

# Work card / Overview card / Goods card

**These are different jobs sharing Block chrome, not interchangeable contents.**

| Role | Reading sequence | Interaction and scope |
|---|---|---|
| Work card | Record/party → reason → resolved owner where governed → exact action | Existing My Work/Team Work item; assigned versus actual completed actor preserved. No second work engine. |
| Overview card | Metric label → value → scope/period | Link/filter only if supported and verified; failure is unknown, never zero. Does not replace a record/task. |
| Goods card | Source identity → destination/date facts → goods/quantities → scoped exception evidence | Loading List supplies hierarchy inspiration; Carres Unit and source contracts supply meaning. No service/transport line masquerading as a physical Unit. |

The common kit owns card chrome and text roles. Modules supply facts and real actions. Card click,
secondary link and primary action must have distinct, accessible purposes. No clickable whole-card
surface that consumes an inner control's action; no hidden hover-only essential door.

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

# Batch workspace

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
┌ shared module header — governed page name and global tools ─────────────┐
├──────────────┬───────────────────────────────────────────────────────────┤
│ NAVIGATOR    │ toolbar    search ···· scope · selection · PRIMARY ACTION  │
│ shared width ├───────────────────────────────────────────────────────────┤
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

Do not classify Purchase Orders, Receiving, Claims or Payments wholesale as batch workspaces.
Choose by the actual surface: register, detail, single operation or genuine batch decision. Their
module authority determines the job and existing governed layout.

---

# Form — Create / Edit

**Purpose.** Enter or amend one object's facts with one authoritative result. Group by meaning
and task, not by database field order. Create and edit share controls and group identity, but
permissions, required evidence and effects come from the owning business object.

**Placement contract:**

| Region | What belongs here | What does not |
|---|---|---|
| Identity/context | Object/source, draft or current version and relevant party | Unrelated summary cards or repeated page titles |
| Field group | Stable heading, visible labels, known values, necessary hints, conditional fields | Explanatory engineering text, unknown values guessed as zero |
| Goods/lines | Source identity, quantity/unit, line-specific inputs and evidence | Concatenated prose instead of structured line facts |
| Validation | Field/line error plus consistent known-blocker summary where needed | Separate frontend approval rules or an unlocatable wall of errors |
| Review/submit | Exact scope/effect and existing confirm/save action | A second full form or hidden auto-submit on field inspection |
| Outcome | Applied, waiting, rejected or unknown as actually returned; retained draft where applicable | Generic Saved implying every downstream job is complete |

- Known facts are prefilled. Required/read-only/disabled are different meanings, not one grey style.
- Dependent input explains its prerequisite. A conditional field appears with its relevant choice;
  switching choice must not silently submit or destroy evidence without the existing discard rule.
- Editing preserves group order. Unsaved changes remain evident; cancel returns to the original
  object and respects its existing draft/discard behaviour. Do not invent autosave from a reference.
- Derived amounts/stock/status remain computed by their owning source. A visual review never
  creates editable substitutes or parallel calculations.
- Busy submission prevents accidental repeat. Validation, denied access, upload failure, server
  failure and stale-version conflict have distinct recovery. Valid input survives where safe;
  conflicting records require re-checking current truth before a new effective result.
- PDF preview follows object law. Current, proposed and sent historical versions cannot be mixed.
- Use actual kit fields/Modal/DatePicker/uploader. Components with incomplete state evidence are
  marked UNVERIFIED rather than replaced by local controls.

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


# Required state and review coverage

This is a coverage contract, not a claim of implementation. UI MASTER holds exact runtime/test
provenance and the module MASTER owns business acceptance. Before a template is an approved BUILD
reference, its whole-page sample must identify source commit, reference page, real component map,
allowed differences, realistic source-linked content and the states below.

| Situation | Required visible behaviour |
|---|---|
| Normal populated | Identity, hierarchy, scope and exact action readable without an explanation from the designer |
| Empty / no search matches | State distinguishes empty population from narrowed results; criteria retained |
| Loading / failed reader | Busy or failure distinct from zero; scoped retry; unaffected facts remain readable |
| Denied / read-only | Correct absence of restricted action/data; no fake empty or pointless retry |
| Required / conditional / invalid | Exact missing item and resolution; same fact in field and summary |
| Upload pending / failed | File-level state, safe retry and source association; no false saved evidence |
| Unsaved / submitting / conflict | Retain valid draft, explain current version; no duplicate or silent partial result |
| Success / waiting / partial | Show actual effect, remaining quantities/obligations and truthful handoff |
| Historical / document failure | Correct version/actor; distinguish business success from missing file capture |
| Long content / many records | Full identity can be reached; quantities/actions remain findable; contained scroll |
| Narrow / keyboard | Same scope/capabilities; logical focus, labels and dialog return; no blocked controls |

**Per-adopter handoff evidence (documentation, not an implementation Card):** name the actual
route and component import for each region; link each numerical value to 01 and identify every
proposed exception separately; name the source of content, scope, action and responsibility;
specify click/keyboard/focus/scroll/narrow behaviour and applicable empty/loading/error/permission
states; state what an observer will see when the task succeeds, fails or remains pending. Exact
source/fixture revisions and approval state accompany the evidence. “Use the kit” or “like Houzs”
without this mapping is not a complete design handoff.

A later authorised implementation review runs on actual Carres routes in an isolated environment,
with real components and labelled real/fixture data. For the first SO register candidate, exercise
Table/Cards scope preservation, filters/search/sort, long content, narrow screens, existing detail
navigation and applicable business regressions. This is an observable acceptance boundary, not
permission to code or an assertion that the shared renderer already exists. No static duplicate
HTML or broad rollout substitutes for verified adoption on the actual surface.

Review demonstrations may have scenario controls, but those belong outside the operator page and
must not dominate the review. Jess's current presentation preference is NEW page only; baseline
comparison remains internal evidence. A rejected or withdrawn mock is never a template merely
because it imports shared components. Do not display an isolated centre as a verified full shell.

### SO representative correction — 2026-10-01, approved scoped pilot

This pilot overrides its earlier composition; it does not roll out to other pages.
Count/summary left; Search 280×32 desktop + Table/Cards + 32×32 Page tools aligned as one right
cluster. Toolbar content height 40px plus 1px divider, no blank reserved row. Touch controls 40px
and toolbar 48px plus divider. Rail 240px, existing slate-2 neutral background, selected blue-3
fill/blue-11 text; nav 36px with 16px icons, groups 36px, options 32px desktop/40px touch.
Stack the two existing views; Delivery first initially open, other groups initially closed with
chosen value visible. Desktop main rows 32px, header 36px/600, Inter 13/18, cell horizontal pad 8px;
mobile rows preserve 40px targets. Cards use the same tools/filter engine. Existing components
receive these scoped composition capabilities; no alternative kit or new palette.
Status: local implementation; owner visual acceptance, remote checks and deployment not implied.
