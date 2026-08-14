# UI — MASTER

> **The only UI-architecture document.** Overwritten when re-ruled; never versioned.
> **You read `CLAUDE.md` and this file.**
>
> **THE TOKEN VALUES ARE NOT HERE AND NEVER WILL BE.** They live in three standards that are
> the vocabulary itself, and this file links to them rather than copying them:
> [`../01-design-tokens.md`](../01-design-tokens.md) (spacing · colour · typography · icons) ·
> [`../02-components.md`](../02-components.md) · [`../03-page-patterns.md`](../03-page-patterns.md).
> **Open one only when you need a value. A number in two files is a number that drifts.**

| I am working on | Read |
|---|---|
| anything | **§1 · §2** |
| a kit component | **§3** |
| a page shell or a grid | **§4** |
| the right rail | **§5** |
| colour or typography debt | **§6** |
| something approved and unbuilt | **§7** |

---

# §1 · Overview

### MISSION
Give every page ONE vocabulary, so an operator never re-learns a screen and a chat never invents
a value.

### THE LAW ORDER
**Business Rules → Information Architecture → Golden Template → Design System →
Implementation.** On a conflict, Business wins and the Design System follows.

```
LOCKED, never invented   token VALUES · component internals
YOURS to improve         composition — layout, hierarchy, readability, scalability
STOP and ask             a component that does not exist. Never draw one inline "just this once"
```

**A rule that exists only as documentation is temporary and incomplete.** Every UI rule must
eventually become a structure the code can enforce — a type, a lint rule, or a failing test.

## §1.1 · Production UI Execution Law — owner ruling 2026-08-11

**Production UI is built on proactive design judgment and reviewed asynchronously.**
This overwrites (MASTER OVERWRITE LAW) the earlier synchronous approval gates — the blanket
"ASCII mock first, wait for yes" and the localhost "Layout Approved" hold — for production
execution work:

```
BEFORE build   the token values, the kit, COPY-STANDARD and the page patterns
               BIND exactly as before — the law order is unchanged. The chat
               composes with its own best judgment inside those laws; it does
               not wait for a layout sign-off.
AFTER build    the owner reviews the LIVE surface asynchronously. A review
               verdict is a normal re-ruling: it changes the next commit,
               it does not retroactively invalidate the shipped one.
STILL GATED    a NEW business rule · a change to an approved workflow or
               ruled word · anything §4 of the Constitution's interrupt list
               names. Design judgment covers COMPOSITION, never business law.
```

**The conversational rule survives where it always lived:** when the owner is IN the
conversation deciding between options, sketch before code (Constitution §10). The gate that
is gone is the one that parked autonomous production execution on a synchronous approval.

## §1.2 · Plan / Design Research Law — APPROVED / LOCKED, owner ruling 2026-08-11

Plan/design work continues from authoritative UI truth. **APPROVED / LOCKED decisions are not
re-researched, reopened or offered for re-approval.** At entry, separate what is already approved
from what is genuinely unresolved and name the single decision surface being solved.

**GOVERNANCE IS NOT FEATURE FREEZE — APPROVED / LOCKED (Jess, 2026-08-11).** Plan/design must
separate **business/capability truth** (whether a capability exists or should exist) from
**placement/presentation truth** (where and how it appears). Existing useful capabilities default
to **KEEP**, and approved business/capability truth is not casually reopened. But an existing
capability does not lock its current placement, control type or visual form unless this MASTER or
the owning module MASTER explicitly locks that placement/presentation. A capability missing from
the repository is not automatically forbidden: on a genuinely unresolved surface, scoped research
may and should identify and recommend a materially useful missing capability. The recommendation
must explain its operator value, check Carres business architecture and locked constraints, and
remain a proposal until Jess approves it. Reference products inform; they are never copied blindly.

**ERP PLAN CHAT START PROTOCOL + UI EXTENSION — APPROVED / LOCKED (Jess, 2026-08-13 / 2026-08-14).** Every new
or restarted Plan/Design chat first completes the Constitution's **ERP PLAN CHAT START PROTOCOL**,
including its authority read, four-way resolution pass, whole-domain audit, complete recommended
module Blueprint and owner decision gate. This MASTER does not duplicate that global law. For a UI surface, the required
whole-domain audit additionally includes this MASTER's UI Dictionary/IA preflight, eight-lens
review, reference-to-Carres capability matrix and completion gate below.

The chat must not infer either “keep this exact UI” from an existing capability or “do not propose
it” from repository absence. It continuously maintains **CURRENT MISSION · RESOLVED FROM AUTHORITY ·
APPROVED TARGET / NOT BUILT · BUILT / VERIFIED · REAL GAP / CONTRADICTION · RECOMMENDED NEXT STEP**.
It surfaces important unresolved matters Jess did not ask about, but asks her only for a genuine
business decision that passes the Constitution's owner decision gate.

This object/domain pass does not replace UI preflight. UI Dictionary/IA comes first; Carres
semantics and ownership outrank external references; and actionable copy remains **WHO + ACTION +
OBJECT + actual working day/date**. The pass is a completeness check, not permission to build every
capability or to write UI/application code in Plan mode.

**OFFICIAL CARD NUMBERS ARE GOVERNANCE; BLUEPRINT PRECEDES BUILD HANDOFF.** The planner
never invents an official Card number or status. The whole-domain audit is evidence, not a roadmap.
Only after the complete recommended module Blueprint is presented, owner-reviewed/approved and
persisted to the authoritative module MASTER may the planner identify dependency-ordered,
unnumbered **`READY FOR CARD`** handoff scopes. Those scopes carry approved business/UI acceptance
boundaries, not detailed engineering plans. Official Card authoring, numbering/status, writer
inventory, migrations, exact tests/TDD steps, task decomposition and CI/deploy probes belong to the
later BUILD/DELIVERY lane after takeover. PLAN does not create `*Card.md` or `*card.md` files unless
Jess explicitly commissions Card authoring; that instruction is the BUILD/DELIVERY takeover for
that deliverable.

**UI ARCHITECT RESPONSIBILITY + DICTIONARY / IA PREFLIGHT — APPROVED / LOCKED (Jess,
2026-08-11).** A new or restarted Plan/Design chat is not merely repository police or a visual
checker. Jess is the business owner and final decision-maker; she is not expected to enumerate
every UI/ERP implication. The chat must proactively act as Carres UI architect and plan ahead.
Before presenting **ANY** UI proposal, mockup or layout recommendation, it must inspect the
authoritative UI Dictionary/copy vocabulary, ERP navigation and information architecture, module
ownership, this MASTER, frozen design tokens, cross-module patterns and the target module MASTER.

For every proposed **button · tab · menu · destination · page · action · Settings/Maintenance
entry**, name the existing Carres terminology, owner and destination **before** proposing it. Check
for duplicate destinations or terminology, inconsistent control/interaction language, incorrect
module placement, future cross-module consequences, scalability problems and materially useful
missing capabilities. Distinguish business/capability truth from placement/presentation truth. The
architect must surface important consequences and gaps Jess did not explicitly ask about and, where
useful, recommend **KEEP · IMPROVE · RELOCATE · RETIRE · BUILD**, with the reason and the modules
that would inherit the decision.

Then extract a brief **LOCKED CONSTRAINTS** checklist appropriate to the decision surface and
validate the proposal against every item. When relevant, it includes: Sidebar active/current
treatment · page header law · toolbar law · typography · table density and row heights · pill,
button, tab, filter, dropdown and overflow-button admission · spacing · Register width/scroll law ·
locked target-module column order and field semantics · existing capabilities that must be
preserved · retired/banned patterns. A conflict with **APPROVED / LOCKED** truth makes the proposal
**INVALID** and it is corrected before Jess sees it. If authorities conflict, report the conflict
and stop the proposal; never silently choose one. Preflight protects locked truth without turning
unruled presentation or repository absence into a veto. **Governance protects truth; it does not
freeze innovation.**

**EIGHT-LENS DESIGN REVIEW — APPROVED / LOCKED (Loo, 2026-08-11).** The preflight is not only
a visual compliance check. Before every UI recommendation, the decision surface is reviewed
through all eight lenses below; none may be skipped because the current repository lacks the
answer:

1. **UI Dictionary** — one meaning has one Carres word. Check Settings / Maintenance / Manage /
   Edit and every action against the governed vocabulary; retire overlapping concepts.
2. **Information Architecture** — name the true owning module and the correct home: Navigation ·
   Page · Settings · Toolbar · Row action · Workspace. Do not create a second door unless the
   second door is an explicitly justified shortcut to the same owned action.
3. **Cross-module Consistency** — state what is reusable Register Template law and what is a
   page-owned exception. Test whether Purchase Orders, Receiving, Claims and Payments could
   inherit the rule coherently; never force them to inherit Sales Orders business content.
4. **Component / Interaction Language** — justify Tabs · pills · filters · dropdown · button ·
   overflow by their governed jobs. A component seen in a reference is not permission to copy it.
5. **Capability Gap** — proactively identify mature, materially useful missing capabilities that
   improve the operator journey and bring them to Jess; do not wait for the owner to discover
   them. Research and define a Carres-owned boundary before recommending BUILD.
6. **Future Consequence** — project the decision across the ERP: prevent Maintenance/Settings
   duplication, uncontrolled header growth, duplicate entry points and module-by-module drift.
7. **Reference Translation** — learn principle and interaction from Linear · Shopify · AutoCount ·
   2990, then translate them into Carres architecture. Never copy their terminology, information
   architecture or visual treatment as authority.
8. **Recommendation** — conclude with one or more explicit dispositions: **KEEP · IMPROVE ·
   RELOCATE · RETIRE · BUILD**, each with the business and architecture reason. Reporting only
   what the repository currently has is incomplete design work.

A mockup or recommendation that has not passed these eight lenses is **INVALID**, even when its
tokens and spacing are correct.

For a genuinely **UNRESOLVED** UI decision, proactively research only that declared surface. Use
the relevant governed references — including Linear, Shopify, AutoCount, 2990, current Carres UI
and appropriate mature/international ERP patterns when useful — and exclude unrelated history and
pages. Do not wait for Jess to ask “what does international do?” when a scoped benchmark can
materially improve the unresolved decision.

**REFERENCE PRODUCT FUNCTION MINING LAW — APPROVED / LOCKED (Jess, 2026-08-12).** Reference study
is not satisfied by looking at colours/layout or only the element Jess mentioned. For the CURRENT
unresolved surface, systematically inventory every applicable reference capability and interaction:
workflow · Settings/Maintenance · navigation · detail · preview · edit · print · export · search ·
filter · columns · scan · copy · bulk action · context action, plus other functions material to that
surface. The required output is:

| REFERENCE CAPABILITY | CARRES CURRENT EQUIVALENT / OWNER | DECISION | WHY | DEPENDENCY / CONFLICT |
|---|---|---|---|---|
| one relevant function or interaction | existing capability/destination and owning module, or GAP | **KEEP / ADAPT / RELOCATE / BUILD / REJECT** | operator/business reason | locked truth, duplicate, prerequisite or downstream consequence |

The matrix exists to discover reusable proven ideas and missing functions **before Jess has to ask
about them one by one**. In particular, when 2990 exposes `SO Maintenance`, the planner proactively
checks whether Carres already has an equivalent Settings/maintenance destination, which module owns
it, and whether Carres should adapt, relocate or reject it. A visual comparison alone fails this law.

“Copy” means reuse a proven principle, function or interaction where it fits — never blindly copy
terminology, IA, colours, tokens, fields, business rules or placement. Map every candidate through
Carres' UI Dictionary/copy authority, navigation and module ownership, ERP architecture, current
capabilities and locked truth first. Derive the common patterns and trade-offs, then give **one
evidence-based Carres recommendation**, not arbitrary A/B/C options. Reference discovery is evidence,
not design authority: Carres locked truth wins, and a missing/unresolved capability remains a
proposal until Jess approves it.
Current and legacy screenshots are evidence of implementation, not authority over frozen target
truth or over unresolved placement/presentation. For example, `Not delivered / All orders` may be
an existing scope capability that must be preserved; that fact alone does not make permanent header
pills its locked presentation. Conversely, Plan/Design may propose a useful missing interaction even
when current Carres has no such capability. The order is mandatory: establish locked constraints →
research only the unresolved surface → propose.

When the owner approves a complete UI or layout decision, immediately overwrite this MASTER or the
owning module MASTER with the current **APPROVED / LOCKED** truth before moving to another major
decision. PLAN mode forbids application implementation, not governing-document updates.

**PLAN COMPLETION GATE.** Before recommending implementation or declaring the planning surface
complete, the Plan chat must show that it covered all applicable rows below. A material omission
means research continues; Jess is not asked to supply the missing checklist.

| REQUIRED COVERAGE | EVIDENCE THE PLAN SHOWS |
|---|---|
| Current Carres capability | what exists, where it lives and who owns it |
| Locked governance | preserved business/capability and explicitly locked presentation truth |
| Dictionary · IA · module ownership | governed terms, destinations, doors and conflicts |
| Reference-product function mining | completed reference-to-Carres capability matrix |
| Mature/international benchmark | scoped finding where useful, or why it cannot materially help |
| Gap analysis | missing, duplicate, misplaced or deliberately rejected capability |
| Cross-module/future consequences | downstream inheritors, scalability and consistency risks |
| Blueprint synthesis | complete recommended operating model, operator journeys, UI/page/object placement and intentional rejects |
| Dependencies | prerequisites and constraints; implementation sequencing waits until Blueprint approval and persistence |

Only after this gate does the chat present the complete Blueprint and ask Jess for any remaining
genuine owner decision or correction. Approved complete truth is persisted immediately under the
Constitution's Plan Decision Persistence law. Continuous production-build governance remains §1.1
and is not part of this Plan gate.

### MISSION / CARD / CHAT BOUNDARIES — APPROVED / LOCKED (Jess, 2026-08-12)

**PLAN CHAT OWNS THE MISSION BOUNDARY.** Jess must not have to ask when planning is complete, when
a coherent implementation scope is ready, what comes next, or whether a fresh chat is advisable.
The maintained mission state above and these transitions are part of every Plan/Design restart:

0. **PLAN TERMINATES BEFORE CARD AUTHORING.** Its complete lifecycle is Authority → whole-domain
   audit → proactive reference mining → complete recommended Blueprint → owner review/correction →
   authoritative MASTER persistence → **`PLAN MISSION COMPLETE`**. It may then name approved,
   dependency-ordered READY boundaries only. It does not author Card files, select implementation
   strategy, start code, spawn build tasks or ask Jess to choose engineering execution mechanics.

1. **`READY FOR CARD — <scope>`.** Never state or invent this, Phase 1, roadmap or implementation
   sequencing before the complete recommended module Blueprint has been presented, owner-reviewed/
   approved, persisted to the authoritative module MASTER and declared **`PLAN MISSION COMPLETE`**.
   Then state it proactively only when a coherent capability or
   implementation slice has sufficient approved business truth, UI/interaction truth where
   relevant, ownership, dependencies and an acceptance boundary, and no unresolved owner decision
   blocks safe build. Recommend the dependency/build order and acceptance boundary. Do not invent
   an official Card number or detailed engineering plan merely because the scope is ready. Card
   authoring belongs to BUILD/DELIVERY after takeover. Do not keep solving application implementation
   detail in Plan mode, and do not hand unresolved business/UI truth to build just to move.
2. **`PLAN MISSION COMPLETE`.** State this proactively when the complete Blueprint is owner-reviewed/
   approved and final truth is persisted. Summarise **LOCKED operating model · intentional rejects/
   deferred items · exact recommended next lane/action.** Identify READY scopes and dependency order
   only after this state; a later BUILD/DELIVERY chat authors any detailed Cards. Do not wait for Jess
   to ask *“what next?”*
3. **`START A NEW CHAT`.** Recommend this when the mission is complete and the next work is a
   materially different planning domain, or unrelated accumulated context creates a real confusion
   risk. Do not recommend it merely because the conversation is long while the same coherent
   mission remains active and decisions are persisted in the repository. Supply the exact concise
   restart prompt and state **PLAN / DESIGN** or **CONTINUOUS BUILD**, with the reason. Use the two
   concise Constitution starters; do not make Jess reconstruct lane law in a giant prompt.

Plan Decision Persistence makes the authoritative MASTER—not chat length—the memory mechanism.
PLAN mode blocks application implementation but requires governing-document updates for approved
truth. Once an approved READY scope is handed to BUILD/DELIVERY mode, §1.1 and the Constitution's
Engineer-Owned Delivery law apply: engineering chooses its own compliant execution method and owns
tests → PR/merge → deploy → authenticated production verification → MASTER closure. It never asks
Jess to choose `Subagent-driven` versus `Inline execution` or other technical mechanics.

**Negative example:** “PLAN creates `Customer Payment Posting Convergence Card.md`, then asks
`1 Subagent-driven or 2 Inline execution?`” is prohibited. Correct: PLAN persists the approved
Blueprint, names the READY scope and closes; the later BUILD/DELIVERY lane decides how to execute.

---

# §2 · Shared architecture

| Concern | The ONE home |
|---|---|
| token values | `docs/01-design-tokens.md` · mirrored (never driven) by `apps/web/src/lib/design-standard.ts` |
| the components themselves | `apps/web/src/components/kit/**` |
| the live look | **`/ui`** — public, lazy, its own chunk, so a kit reference never rides the operator's bundle |
| the enforcement | `pnpm --filter @carres/web lint` + the kit source scans |

**Frozen and not to be reopened:** the spacing scale is **8 steps** (`2 4 6 8 12 16 24 32`) ·
**`font-bold` (700) is deleted into 600** · **Lucide's stroke stays 2.**

---

# §3 · The kit

### WHAT IS ON SCREEN TODAY
**28 components**, all rendering on `/ui`. *Measured 2026-08-05 by listing
`apps/web/src/components/kit/`.*

```
Button · Input · Textarea · SearchInput · Card · Panel · Badge · StatusPill ·
EmptyState · Loading · Icon · Modal · Drawer · Select · DropdownMenu · Tooltip ·
Popover · Tabs · Checkbox · DatePicker · Toast · PageShell · DataTable ·
DetailShell · DialogFrame · FieldFrame · GridToolbar · SectionHeader
```

### FROZEN RULES
- **Radix for behaviour, the kit for appearance. NOT shadcn/ui.**
- **No component takes `className` or `style`.** Enforced by `@ts-expect-error` tests.
- **`Icon`'s name is the ruled icon meaning list**, and it has **no `strokeWidth` prop** — the
  prop existed only so `/ui` could draw two candidates, so deleting it IS the enforcement.
- **`StatusPill`'s tone is the action tone type**, so *"tone from a CONDITION, never a verb"*
  holds by construction. **`Badge` has no tone. `Button` has no `danger`.**
- **`Button` forwards its ref.** Every `asChild` trigger anchors on the trigger's DOM node, and
  a Button that eats the ref makes all four overlays open in the wrong place while React only
  warns.
- **Widths and radii that have no home in a standard live as named config keys**, never as
  numbers inside a component.

# §4 · Shells and grids

### FROZEN RULES
- **`PageShell` makes the height budget a TYPE** — `variant="list"` has no KPI slot and no
  variant has an extra band, so *"an eighth band has nowhere to go"* is literally true.
- **`DataTable` takes its header word from the column def**, which is where a duplicated `<th>`
  word came from, and it **formats nothing** — money and dates keep their own one home.
- **`DetailShell` has NO `state` prop and never may have.** Seven L4 constraints are types
  checked by `tsc`, not by the runner.
- **A list table never scrolls sideways by growing.** A column RESIZE takes width from its RIGHT
  NEIGHBOUR, never from the table — AutoCount lets a column grow and hands the operator a
  horizontal scrollbar.
- **Kit `DataTable` layout is NOT remembered across a reload.** Sales Orders uses the existing
  `register/DataGrid` engine instead; Loo explicitly ruled that Stage A preserves that engine's
  browser layout persistence. This is a page-scoped exception, not a new kit default.
- **The 40px row law remains the kit `DataTable` default.** Sales Orders reference rows use the
  approved page-scoped 38px exception in §6.5. The expanded cell is allowed to be tall and wrap.
- **40px is the international default, measured 2026-08-07 — not merely our own habit.**
  AG Grid's Quartz theme ships **42px**; the two denser references anyone cites are a Windows
  desktop control (AutoCount ~17px) and another repo (2990s 28px), neither a web-grid standard.
  **And the floor is set by the CONTROLS, not the type:** the kit's expand button is 24px and
  its checkbox 16px at any row height, so a 24px control fills 60% of a 40px row and **86% of a
  28px one.** Any density change below ~32px therefore moves `badge-height` too — a second
  token. *(Evidence: `docs/research/grid-findings.md` F64 · F69 · F70. What a synthetic
  harness could NOT measure — readability, scan speed, click accuracy — stays UNKNOWN, so the
  live question is whether in-row controls stay 24px, not "40 or 28".)*
- **The grid renders every row it is given, and the cost is now measured.** At 1,500 rows a
  header-click sort costs **~900ms** and one keystroke **~640ms**; the DOM holds 2,095 `<tr>`
  and 24,854 cells (F64 · F65). **AG Grid caps rendered rows at 500 and SAP Fiori at ~200
  before lazy-loading; `DataTable` has no cap of any kind** (F68). The cost is linear in rows
  and **flat in density** — 100ms is crossed at ~200–350 rows, so this is a WINDOWING question
  and never a row-height one.
- **Every optional power is OPTIONAL and no signature moved** — that is the only reason a kit
  card can run while pages are frozen. **A page must justify wiring a power** (`§13.3` of the
  Constitution's design philosophy); an unwired power's ABSENCE is asserted by a test, because a
  power that quietly appears later is the failure that rule exists to stop.

# §5 · The right rail

### MISSION
Four quick-peek surfaces on the right of the ERP shell — **Team · Calendar · My Work · Activity** —
answer **who · when · what I must do · what just happened** without leaving the current object.
They are not duplicate modules and never become a second home for business truth.

### WHAT IS ON SCREEN TODAY
`apps/web/src/pages/operation/components/rail/` — `CalendarPanel` · `TeamPanel` · `KeepPanel` ·
`TasksPanel`. *Measured 2026-08-05 by listing the directory; **behaviour not read line by
line.***

### FROZEN RULES
- **No widget is an island.** Widgets interlink with each other AND with the LEFT panel; an
  action anywhere cascades to the relevant widgets.
- **The rail is quick peek, not navigation truth and not a second place to act.** A row may
  deep-link to the authoritative object/action. The owning module remains the writer.
- **`My Work` in the rail is a preview of the formal `Work` destination.** The full destination
  owns the `My Work · Team Work` views over one work set; the rail may not create another work set.
- **Team** previews availability/coverage and open/overdue workload; People/HR remains the owner.
- **Activity** previews recent append-only events and links to their objects; it does not replace
  an object's History or a module audit surface.
- **The calendar's day comes from the BOOKING, through the one shared rule** — never from the
  promised date, or two surfaces put one order on two days.

### ERP SHELL V1 — OWNER RULING 2026-08-13

- The left navigation is grouped by responsibility using the destination grammar in
  `../ERP-ARCHITECTURE.md` §2.1. It is not one flat list.
- `Work` is a formal destination with `My Work` and `Team Work`; the Quick Rail is only its peek.
- There is one central `Settings` destination with module deep-links. Module shortcuts enter that
  destination and do not manufacture `Sales Settings`, `SO Maintenance` or similar sidebar homes.
- `Old Orders` is temporary cutover infrastructure and must retire; it is not ERP Shell V1.

# §6 · The measured debt

**Colour**, measured 2026-07-29: the portal has **6,385 colour sites**; the guard saw **435**
(6.8%). After the ruler shipped, **5,545 of 6,129 are measured — 90.5%.** Rules O 4,661 ·
P 594 · Q 111 make the debt countable for the first time.

**Typography**: the `t-*` ramp is retired; sizes carry weight and line-height in ONE class.

**The kit's own coverage number may never go down.**

---

# §6.4 · THE ERP REGISTER BLUEPRINT — ruled by Loo 2026-08-08 on the live Sales Orders build

> **THE TABLE IS THE APPLICATION.** A register is not a web page with a table on it. Chrome
> that exists because "pages have headers" is deleted. Scored 9.4/10 on review; these are the
> corrections that must land before it is reused.

```
Sales Orders                                        Columns  Export
───────────────────────────────────────────────────────────────────
SO ▼ │ Customer ▼ │ Items ▼ │ Value ▼ │ Promised ▼ │ …
[flt]│[flt]       │[flt]    │[flt]    │[date ▼]    │        ← typed per column
───────────────────────────────────────────────────────────────────
rows …                          ┌──────────────────────┐
                                │ SO-1300           ×  │  ← CLOSE, never Back
                                │ ‹  4 of 69  ›        │     (Outlook preview)
                                │ Customer · Money ·   │
                                │ Promise · Request ·  │
                                │ Items · History      │
                                │                Save  │  ← disabled until dirty
                                └──────────────────────┘
```

**THE RULINGS**
```
① FREEZE `SO No` + `Customer` on the left. Everything else scrolls. (AutoCount's own shape.)
② EVERY FILTER MATCHES ITS COLUMN — a date column gets This week · Next week · No date ·
   Between…, never a textbox.
③ ITEMS READ AS HUMAN WORDS — `King Mattress`, not `B1201S-K`. The SKU rides the hover.
④ THE PANEL IS CALM — no box around every field. Notion, not a form. Sections, not borders.
⑤ THE MONEY STRIP IS THE MOST-READ REGION — Total large · Paid medium · Outstanding loud.
⑥ SAVE IS DISABLED UNTIL SOMETHING CHANGED.
⑦ HISTORY GROUPS BY Today · Yesterday · Earlier, never a flat list of dates.
⑧ ⭐ RECORD WHY THE PROMISE CHANGED. `The customer asks for {date}` + `Reason` → history.
   Six months later nobody can otherwise answer WHY the promise moved.
⑨ ⭐ `Request Item Change`, NEVER `Change Items`. Changing an item moves the quotation, the
   payment, the purchasing plan and the delivery. **This is §0's Charter enforced in a button
   word: Sales Order may REQUEST what four other modules must execute.**
⑩ DELETE: the Refresh button (auto) · the Back button (it is a close, not a navigation) ·
   the page header's spare height.
```

### 🔴 THREE CHALLENGES — recorded with the ruling, not after it

**🔴 C1 · `Promised` MAY NOT BE BLUE.** `../01-design-tokens.md:101` is frozen: *"blue marks
the current thing and the primary action, and nothing else"* — line 109 says blue marks
**exactly two things on any screen.** A date in blue makes it a third. **The money strip gets
its emphasis from SIZE and WEIGHT, which the ruling already uses for Total and Paid.**
`Outstanding` may take the amber/red family only when it is genuinely late — §2.2 gives red one
job. **This is the one item of the ten that cannot ship as written.**

**🟡 C2 · DELETING SEARCH ENTIRELY CONTRADICTS THE CHARTER, and AutoCount does not do it.**
§0 froze *"a customer phones and the operator must find that order"*. **A per-column filter
requires knowing WHICH column first** — a caller says "I'm Umi" and the operator does not know
if that is a name or a phone. **AutoCount's own window carries `Enter text to search… [Find]`
in its top-right AND per-column filters** — both, in Loo's own screenshots. **Recommendation:
keep ONE search box over SO · customer · phone · item, and add the per-column filters beside
it.** Excel's filters are an addition, never a replacement.

**🟡 C3 · AUTO-REFRESH MUST NEVER CLOBBER AN OPEN EDIT.** The panel has a dirty state and a
Save. A refetch that lands mid-typing loses the operator's words. **Auto-refresh pauses while
the panel is dirty.**

### SCOPE — approved as a BLUEPRINT, not as a rollout
**Purchase Orders (Phase 2, frozen 2026-08-03) and To Order (frozen by Jess 2026-08-01 —
*"再继续改只会开始进入无限微调"*) are FROZEN pages with approved layouts.** Reusing this
blueprint on them REOPENS two freezes. **The pattern is approved; each page's migration is its
own decision and its own card.**

---

# §6.5 · REGISTER NAVIGATION AND HEADER ADMISSION — ruled by Loo 2026-08-11

**TABS ARE AVOIDED BY DEFAULT — APPROVED / LOCKED.** Separate business jobs, owned records
or destinations are separate portal-navigation entries and pages; they are never compressed
into a module tab strip. Purchasing is the explicit reference: SO Batch Purchase · Manual
Purchase · Purchase Orders · Receiving · Supplier Claim are individual destinations, with no
Purchasing tabs and no substitute second navigation row.

**TAB ADMISSION LAW — APPROVED / LOCKED.** A tab row is not a standard Register layer. Tabs
are admitted only when every tab remains inside the same owned business object, the same
operator responsibility and the same primary work, and switching tabs changes only the view
or partition of that one work surface. If the owned record, operator job, primary action or
page purpose changes, the destination must be separate navigation instead.

A proposed tab may not be introduced merely to group related pages, imitate another product,
or fill a second header. Therefore the default Register stack has no tab row: Destination
Header → page Work Toolbar when required → Work Surface. Any exception is a new page-scoped
design decision and must demonstrate that it passes every admission condition above.

**REGISTER REFERENCE DIVISION — APPROVED / LOCKED.** Carres does not copy one product's whole
page. Register headers follow the compact, width-spending Linear pattern: portal navigation
owns destination switching; the content header stays one 44px identity row and uses horizontal
room instead of adding title, breadcrumb, KPI or tab bands. Register listing behaviour and
readability follow the governed 2990 reference: its listing engine, controls, column powers,
row disclosure and table hierarchy are the reference. GitHub is evidence for tab admission,
not the Carres Register shell. Carres business ownership remains authoritative over all three.

**REGISTER PAGE HEADER — APPROVED / LOCKED (Loo, 2026-08-11).** Every Register begins with one
rendered 44px Page Header. Left = the current destination's governed icon + one short identity
title, for example `Sales Orders`. Right = genuine global utilities only: `Jump to…` with its
keyboard hint · Notifications · Help · System Settings. `Jump to…` is an approved missing
global-navigation capability: it finds permitted modules/destinations and exact document numbers,
offers recent destinations, and only navigates; it never performs workflow. The header contains
no breadcrumb, `Backend` label, duplicate title, KPI, tab, scope/view, current-Register Search,
filter, export, Columns, selection state or page-specific action. New/create, Scan Order,
Export and every other page-owned action belong to the next Work Toolbar layer. Module Settings
never becomes a page-owned action; the global Settings utility owns its one door.

**GLOBAL SETTINGS ENTRY — APPROVED / LOCKED (Loo, 2026-08-11).** The governed Settings gear in
the Page Header's right utility cluster is the ERP's one Settings entry on every page. Clicking it
opens a compact permission-filtered launcher, not an editing form. Its first item is `{Current
module} Settings` when that module owns settings and the user may access them; its second item is
`All System Settings`. Either choice navigates into the one full-page Settings Workspace at the
relevant section. Business values, permissions and workflow options are edited only in that
auditable Workspace, never inside the launcher. Module tabs, portal navigation, Work Toolbars and
`…` must not repeat a Settings destination. Current-view presentation such as Columns, personal
Saved Views and governed Register layout remains on the owning Register and is not System Settings.

**REGISTER TOAST PLACEMENT — APPROVED / LOCKED (Loo, 2026-08-11).** Toasts use the proven 2990
behaviour translated into Carres components: one fixed overlay tray at the viewport's bottom-right,
stacking additional messages upward. A toast never occupies document flow and never moves, resizes
or adds height to the Page Header, Work Toolbar, Register table or status footer. It uses the
governed Carres Toast component, frozen semantic colours and governed icons — never 2990 visual
tokens. Each message provides its truthful semantic state, compact text, close door and a slim
remaining-time indicator; ordinary success/information feedback auto-dismisses after five seconds,
while accessibility live announcement follows the message severity. Persistent business blockers
remain an in-page message near the affected work surface, and field validation remains inline
beside its field; neither is misrepresented as an ephemeral Toast.

**`JUMP TO…` INTERACTION — APPROVED / LOCKED (Loo, 2026-08-11).** `Jump to…` is the one global
navigate-only command surface across the ERP; modules must not grow their own competing jump
search. The Page Header trigger shows its keyboard hint and opens from click or `⌘K`. Desktop uses
one centred overlay; small screens use the same surface full-screen. Opening with no query shows at
most five permitted recent destinations followed by permitted destinations. Typing searches only:

1. governed module / destination names; and
2. exact or partial governed document numbers such as SO · PO · GRN · INV.

Document results show the document number, its type and the smallest useful identifying party
(customer or supplier) without exposing unauthorised data. Results are permission-filtered before
display. `↑` / `↓` moves the active result, `Enter` navigates and `Esc` closes. No result renders
the plain empty state `No results`; it never offers a create action. Selecting a result only opens
its owning destination/document and never approves, receives, pays, edits or performs any other
workflow.

Register Search remains page-owned and searches that Register's governed fields. `Jump to…` does
not replace it and does not search arbitrary table-cell contents, customer phone, product text or
every ERP field. Expanding beyond destination + document-number + recents requires a governed
cross-module search index and a new architecture decision; individual modules may not expand the
global result contract locally.

**REGISTER WORK TOOLBAR / SECOND HEADER — APPROVED / LOCKED (Loo, 2026-08-11).** Immediately
below the Page Header, a Register may own one rendered 45px Work Toolbar; it is one row and never
scrolls horizontally. Normal state spends the left side on the current View control and current-
Register Search, and the right side on page-owned Export/display controls, frequent actions, one
primary create action and a low-frequency overflow when needed. `View: {current view}` is explicit;
scope capabilities such as All orders / Not delivered are saved/reusable Views, never a permanent
row of pills. Header-column filters remain the direct per-column filter door; the Toolbar does not
add a duplicate generic Filters button. `Reset layout` remains inside Columns.

Selecting rows **replaces** the normal Toolbar within the same 45px height; it never adds a third
permanent band. Left = truthful selected count + Clear. Right = only actions valid for that exact
selection. A one-record action disappears for multi-selection rather than pretending to apply to
many. Normal and selection states preserve the table's position and width.

**REGISTER EXPORT AND OVERFLOW ROUTING — APPROVED / LOCKED (Loo, 2026-08-11).** A Register uses
one visible `Export ▾` control for its supported current-view outputs: Excel · PDF · Print. Output
formats do not scatter across `…` or become separate permanent normal-state buttons. When rows are
selected, the same Toolbar space exposes only outputs valid for that exact selection and prints the
truthful count. `…` owns infrequent page actions in normal state and infrequent selection actions
in selection state; it never duplicates Export, Columns, a destination or a row-only action. A
useful but infrequent action may move into `…` instead of occupying permanent Toolbar width; this
is progressive disclosure, not capability removal.

**TOOLBAR SHAPE LANGUAGE — APPROVED / LOCKED.** A control that changes/chooses/configures a view
uses the governed 6px `rounded-control`: View dropdown · Search · Export dropdown · Columns ·
overflow. A visible verb that immediately performs an action uses the UI Kit pill button: New ·
Scan · Clear · View Flow · explicit Export Excel/PDF selection actions. Mixing the two shapes is
required when both interaction kinds coexist; arbitrary per-button shape variation is invalid.
There is at most one primary blue action in a Toolbar state. Page-owned controls vary by module;
the 45px one-row structure, state replacement and shape semantics are Register Template law.

**REFERENCE PRODUCTS NEVER AUTHOR CARRES VISUAL TOKENS — APPROVED / LOCKED.** Linear, 2990,
GitHub, Shopify, AutoCount and every other reference may supply a proven structure, behaviour
or trade-off; they never supply Carres colour, typography, radius, elevation, icon treatment or
component styling. Those come exclusively from frozen `../01-design-tokens.md` and the existing
Carres UI Kit component that owns the element. Copying 2990 cream/yellow surfaces, orange ink or
another product's control shape is a defect even when its listing behaviour is the reference.
A design mockup must use the governed Carres tokens and components too; mockup status never
permits invented styling.

**LOCAL RAIL ACTIVE ROW — APPROVED / LOCKED EXISTING KIT TRUTH.** A page-owned queue/facet rail
uses the governed Carres `NavRow` treatment: `rounded-control`; `blue-3` selection wash; one
straight 2px `blue-9` line inset on the left; slate hover for inactive rows. It is not a bordered
card, not a module tab, not a foreign reference colour and not a newly invented rail variant.

**PORTAL NAVIGATION ACTIVE COLOUR — APPROVED / LOCKED.** The flame repoint applies to active
navigation too: the current destination uses the governed blue selection treatment, never a
red/flame active line or red rounded selection block. Flame remains the Carres brand mark;
red remains late work / alert under the token law. A navigation item is selection, so its
active line and wash are `blue-9` / `blue-3`. The rollout remains a separate implementation
card; new designs and mockups show the approved destination, not the legacy red state.

**REGISTER TABLE DENSITY LAW — APPROVED / LOCKED.** The readable 2990 parent-list geometry is
the Register baseline, expressed only through frozen Carres typography tokens: rendered 36px
table header using `text-label` (11px / 14px); rendered 38px single-line parent row using
`text-body` (13px / 18px). The remaining height is balanced vertical breathing room, with the
row's checkbox included in the measured height. Expanded content takes its
natural governed child-row height and is not forced into 38px. Carres gains visible rows by
removing tall page chrome, breadcrumbs, KPI bands and redundant headings — never by squeezing
the parent row below this readable baseline. Footer geometry and contents are governed separately
below and do not alter row density.

**REGISTER STATUS FOOTER — APPROVED / LOCKED (Loo, 2026-08-11).** Every Register table ends in one rendered 32px,
always-present status footer fixed to the table frame; it never scrolls with the rows. The
footer keeps the operator oriented without spending a full data-row height. In its resting
state it states the current listing's total summary. When rows are selected it immediately
states the selected business summary in the page's owned unit — for example To Order's
`Mattress 5` — rather than replacing that consequence with a generic checkbox count. When a
filter narrows the listing, the footer must make the narrowed-versus-total state explicit.

The status footer is information, not a second toolbar: no primary action, Columns, Reset
layout or duplicated filter controls may enter it. **Every actionable control stays above the
table** in the page Work Toolbar, selection bar or the relevant top popover; `Reset layout`
belongs to Columns and never to the footer. Each Register MASTER owns its truthful summary
vocabulary and arithmetic; the global template may not invent a KPI, status or unit.

The table frame has an 8px outer gap above and an 8px outer gap below. The bottom gap is page
breathing room outside the frame; the 32px footer remains inside it and never touches the browser
edge. Available vertical space is filled with consecutive complete parent rows. There is no
designed blank data region while more results exist; genuine empty space is allowed only when the
complete current result set is shorter than the viewport. When another full governed row does not
fit, show one fewer complete row rather than compressing the locked 38px parent-row height. This
compact chrome must allow a Register to show more complete rows than the 2990 reference at the same
viewport height without copying its visual treatment.

# §6.6 · SALES ORDERS REFERENCE STRUCTURE — ruled by Loo 2026-08-10

**Stage A is owner-accepted and CLOSED.** Sales Orders is the first production reference
implementation of the approved Carres destination/listing architecture. The 2026-08-14 owner
touch-up below also governs the shared ERP Shell and Object Header; it does not reopen the
production-verified Sales Order business engine or another module's ownership.

```
DestinationHeader  44px  Sales Orders identity + genuine global utilities only
Work Toolbar       45px  View · one Search · Export · Columns · actions · overflow
Work Surface             one DataGrid + fixed status footer; loading · empty · error remain inside it
```

**Proven in authenticated production at 1920 · 1440 · 1130:** one destination identity · one
Work Toolbar · one general Search · no duplicate destination tab/title · no outer-page scroll ·
DataGrid-owned genuine-wide horizontal overflow · 1130 without another toolbar band · Search ·
column filters · Export · Columns · persistence · expansion all survive the migration.

**The Sales Orders reference appearance follows the current Register Template:** 36px table
header · 38px single-line parent rows · 32px fixed status footer · 8px outer frame gaps · flat
zero-radius grid · faint structural dividers · no zebra. Frozen Carres typography tokens and
the Register density law above own the text; older page-scoped 31/33/22px measurements no longer
author this destination.

**Preserved engine powers:** server Search · typed column filters · Columns · Excel Export ·
resize · reorder · browser layout persistence under the existing Sales Orders storage key ·
expanded order lines. Each column header remains the direct filter door; the Work Toolbar does
not duplicate it with a generic Filters control.

**1130 ruling:** Stage A must attempt one toolbar row and show a measured failure if it does
not fit. It may not invent a responsive law. The 2026-08-10 production-like measurement fit
all controls in 846px with no clipping; the grid itself retained 306px of grid-owned
horizontal overflow.

**Stage boundary:** expansion + virtualization is acknowledged DataGrid engine debt and Stage B
is not started. It does not block continuation of the ERP UI migration unless measured real
production scale or performance proves otherwise. The Sales Order Workspace and Old Orders
execution surface are unchanged.

## §6.6 · SALES ORDERS REGISTER CLOSEOUT — owner ruling 2026-08-13

This page-scoped ruling overwrites the conflicting Sales Orders composition/defaults in §6.4–6.5;
those sections remain the measured Stage A implementation record and generic research evidence.

```
compact destination header / work toolbar

breathing gap

┌─ light bordered Register ──────────────────────────────────────────────┐
│ ▸ | SO No | Ordered | Customer Delivery | Customer | Delivery         │
│   | Location | PO No | DO No                                          │
└────────────────────────────────────────────────────────────────────────┘
```

- Sales Orders is a truth Register, not Work and not a dashboard. No KPI-card preamble, no
  borderless Linear-style continuous slab, and no giant card around the page.
- The seven business columns above are the governed default and exact order. `▸` is chrome.
  There is no overall `Current`/status column. Content sets predetermined usable widths; staff do
  not resize to repair the default. Optional columns may cause grid-owned horizontal overflow and
  may not squeeze the default set.
- Expansion is goods-only: a small clean, non-filterable table beneath the parent row with the
  locked columns `Category | Unit ID | SKU | Qty | Item | Deliver To`. It may use its own column
  tracks; it must retain the parent Register's seven-column structure and horizontal behaviour.
  Unit ID is Stock truth; Deliver To is read-only Purchasing truth, not Warehouse location.
- Keep the proven Search, typed filters, Columns, Export and right-click document interaction.
  Selection may scope Export; it may not introduce register-owned execution. Direct SO/PO/DO
  numbers are links to their owner. Only explicit `Edit` opens the formal edit context; View,
  Preview and Print remain non-edit.
- The detail object presents Current/Order truth, Revisions, History, the actual PDF/document and
  Order Route. Revisions (complete versions) and History (events) are separate. Order Route is a
  read-only, fact-derived, multi-position route/obligation map — never a manual checklist or
  single overall status.
- **OBJECT HEADER TEMPLATE — OWNER-APPROVED / LOCKED (2026-08-14).** An ERP object has one owning-
  Register back destination, one persistent identity (`number · party`), governed actions at the
  right, and applicable object views directly below/alongside that identity. View and Edit retain
  the same context. Duplicate singular/plural pseudo-tabs and second `Back to order/register`
  controls are forbidden. Output actions such as `Print ▾` remain distinct from Edit; rare or
  destructive actions live in overflow. The grammar is shared by SO, PO, GRN and other governed
  objects, with only the tabs that apply to that object.
- **SETTINGS TEMPLATE — OWNER-APPROVED / LOCKED (2026-08-14).** One central Settings Workspace owns
  permission-filtered module destinations that actually exist. A module settings surface renders
  plain-language groups, readable summary rows/cards and an explicit focused Edit context; raw
  config fields, Save/Cancel controls and database-like keys are not the default view. Future
  Purchasing, Warehouse and Delivery settings inherit the grammar without creating empty pages or
  duplicate top-level settings homes.
- **ERP SHELL + SALES ORDER UI REFERENCE — PRODUCTION-VERIFIED / LOCKED (2026-08-14).** PR #771
  merged as `5fed50d3`; the known-goods classification correction followed in PR #773 and merged
  as `4934826d`; PR #776 closed the final object-route/Settings presentation mismatches and merged
  as `30fa407b`. Production deploy run `31768870907` converged both Pages projects, both canonical
  domains and Worker version `64b26128-5122-4082-95a8-bb13291d3186` on exact SHA `30fa407b`.
  Authenticated desktop verification at 1440×900 proved the seven-column bordered Register,
  header-owned New Sales Order action, compact Export/Columns utilities, direct header filters,
  customer-name-only cells and category-grouped expansion (`MATTRESS` for SO-1319, never the stale
  `OTHER GOODS` fallback for that known item). It also proved the grouped real-destination sidebar
  with `Old Orders (temporary)` preserved; the independently scrolling 340px Team / Calendar /
  My Work / Activity rail while the workspace remained usable; and the persistent Sales Order
  identity/navigation across Order, Revisions, History, Order Route and Edit. Edit exposed Save,
  Discard, the quiet commercial-boundary explanation, one read-only Address preview and Request
  ownership change. Order retained the live one-page PDF canvas and compact Print output; Order
  Route retained per-goods facts and Still owed. Sales Orders is therefore the production
  reference for the ERP Shell, Register and Object Detail/Edit templates. Shared shell components
  must remain module-neutral; dates, work, activity and mutations remain owned by their modules.
- **SALES ORDER GOODS EXPANSION — PRODUCTION-VERIFIED / CLOSED (2026-08-14).** PR #782 merged as
  `40fce19b` and deployed by run `31777783954`; authenticated production verification proved the
  locked `Category | Unit ID | SKU | Qty | Item | Deliver To` mini-table beneath the unchanged
  seven-column parent Register. Real evidence: SO-1312 renders Mattress `B1201S-K`, `Not
  allocated`, and `Carres Klang ×1`; SO-1204 renders Sofa modules with fabric/leg/height facts and
  Service lines with Unit ID `—` and Deliver To `Not applicable`; SO-1257 renders the corresponding
  Sofa/Service & Add-ons truth and governed default destination. Purchasing PO-2032 proves real
  `Carres Klang` plus `AL Sungai Buloh` destination truth. No current production record proves a
  HOUZS line, a same-SKU quantity split, or an allocated SO Unit ID (Stock reported zero reserved
  units), so none is fabricated as acceptance evidence. PO-2032 also demonstrates the known
  consolidated-PO allocation limit: without a structural PO-line→SO-line allocation, Sales Orders
  must not infer which destination quantity belongs to another SO line. Authenticated acceptance
  then found internal Sofa-builder coordinates/indexes/build UUIDs leaking into `Item`; PR #783
  removed those non-operational facts, merged as `30e08be9`, passed CI run `31779002343`, and
  deployed with exact-SHA proof in run `31779795185`. The final live SO-1204 check retained fabric,
  leg and Sofa height while proving `X/Y`, rotation, cell index, fabric tier and build UUID absent.
- **SALES ORDER OWNER VISUAL ACCEPTANCE — PRODUCTION-VERIFIED / CLOSED (2026-08-14).** PR #787
  merged as `b7d68eed`; authenticated production acceptance found one Edit-grid composition defect,
  fixed by PR #788 and merged as `ebc8fb5d`. Deploy run `31790978222` repeated the authoritative
  gates and proved exact SHA `ebc8fb5d` in production. At normal desktop width the Register keeps
  the seven governed columns, page-header New Sales Order action, utility-only grid toolbar,
  interaction-blue selection, amber missing Customer Delivery, location summaries, the approved
  six-column goods mini-table and filtered quantity footer with no permanent Reset layout. The
  persistent Object Header and `Order · Revisions · History · Order Route` navigation were verified
  across View and Edit. Order is read-first at document width; PDF remains behind Print; Revisions
  and History are separate views; Order Route shows per-goods `CURRENT` and a secondary Still owed
  list. Edit keeps Customer Delivery read-only, retains the existing Proceed date writer, maps only
  existing address/access fields, and aligns Customer with Sales ownership beneath a full-width
  edit-scope notice. The same Object Route and Edit compositions remained usable with My Work open.
  This supersedes the earlier acceptance note's live PDF-canvas statement and closes the Sales Order
  Visual Acceptance slice without changing settled business truth.
- `docs/orders/MASTER.md` §0.1 owns the business/field/amendment/permission rules. Sales Portal/POS
  remains the master form contract; UI composition may not create a second commercial form or an
  operational action door.

# §7 · Approved Evolution

| What | Why it is not built |
|---|---|
| **The flame repoint — `--primary` to blue, 594 sites** | Approved. **It cannot be proved by checksum**, so it needs its own card AND a visual approval. |
| **`base-*` → the kit palette, 4,661 sites** | Approved. Ten steps into six, so it rolls out **page by page with the page migrations, never globally.** |
| **Real pages rendering through `PageShell` / `DataTable` / `DetailShell`** | Approved. Components-only was the ruling, not a shortfall. The order drawer specifically is BLOCKED: L4 needs a persistent-facts 4-tuple that does not exist on it, and creating one reverses a frozen ruling. |
| **A picker inside a dialog renders UNDER it** | A real P1 defect, scoped and approved, not yet built. |
| **Splitting the grid's `layout` prop** | `resize` and `reorder` arrive through ONE prop, so **no page can justify one power without the other.** The day a page wants one and not the other, this is the kit's card. |
| **Layout memory** | Refused as a kit-wide default. Sales Orders preserves its existing role-scoped browser layout key by owner ruling; no other page inherits that exception. |
