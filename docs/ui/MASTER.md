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

**Purchase Returns rail — approved target, 2026-09-18:** reuse the Supplier Claims supplier-list
pattern (heading icon, name + right-aligned document count, active state, click again to clear).
Supplier filtering combines with operational conditions. Exact page fields and rail sections
are governed by Purchasing MASTER §9.6; do not create a separate dropdown or page-specific
geometry. This is UI approval, not a claim that production is built.

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
semantics and ownership outrank external references; and every action remains one structured
contract: **owner context + short action + necessary object/recipient/result + actual working
day/date**. Owner and source object render as structured context under the latest Owner Engine law;
the sentence never repeats them when the surface already identifies them. The pass is a completeness
check, not permission to build every capability or to write UI/application code in Plan mode.

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

## §2.1 · NEW-STAFF OPERATING LANGUAGE — OWNER RULING 2026-08-20 · APPROVED / LOCKED

**The system knows the process; staff confirm facts, perform the stated act and record the result.**
No employee-facing surface may depend on experience, memory, WhatsApp history, an unwritten office
habit or asking a long-serving employee what comes next. Any authorised cover must be able to resume
from the current structured facts without reconstructing the story outside Carres.

English is the one official language for business fields, records, search, reports and documents.
Employee-facing facts, warnings, actions, validation, empty states and prepared messages use
**Primary School Standard English**:

- one sentence carries one fact or one act;
- aim for no more than about 12 words where the governed business terms allow it;
- start actions with common verbs such as `Send`, `Call`, `Ask`, `Check`, `Choose`, `Save`, `Upload`
  or `Add`;
- keep required business words such as `Purchase Order`, `Supplier`, `Deliver To`, `Unit ID`,
  `Invoice`, `Credit Note`, `Claim` and `Consignment`, and explain an unfamiliar term on demand;
- never use a vague instruction such as `Process`, `Handle`, `Proceed accordingly`, `Action
  required`, `Resolve discrepancy` or `Follow up`;
- show an actual date such as `18 Aug 2026`, not `ASAP`, `Today`, `Tomorrow`, `T−2` or a date the
  employee must calculate;
- an error states the failed fact and the act that fixes it; a button states what pressing it does.

Optional `What does this mean?` help may explain the official English in Chinese or Bahasa Malaysia.
That help never changes the authoritative field, record, search term, report, message or document.
Prefer governed choices (`Yes / No`, `Full / Partial`, `Good / Damaged`) and prepared messages over
free typing. Notes remain free text only where the business needs them and should offer a short
sentence pattern.

An action-capable surface separates the current fact from the act:

```
Supplier invoice is missing
[YJ] Ask the supplier to send the invoice by 18 Aug 2026
```

The first line says what is true. The second line starts with the act and says the smallest required
object, recipient, result and actual date that are not already clear from the row/card header.
`[YJ]` is a structured owner chip, never sentence text. The action record separately carries its
trigger, owner rule, resolved owner, completion fact, governed date, source object and cover evidence.
My Work normally omits the current employee's chip; Team Work places identity in the owner group;
cover and handover show the necessary owner context. A reference Register may show the fact only.
It never grows a duplicate action merely to satisfy this display grammar.

This law simplifies execution; it does not remove permission, approval or separation of duties.
The system may guide every authorised cover through the same steps while still preventing a
requester from approving their own exception and preventing Operations from performing Finance's act.

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

**⭐ THE CENTRED SURFACE'S WIDTH TABLE — closed at three, and every value carries its
measurement (2026-09-11, adding the third).**

| `width` | Config key | Value | The measurement that produced it |
|---|---|---|---|
| *(omitted)* | `max-w-modal` | 512px | The default: a question, a short form, a confirmation |
| `"wide"` | `max-w-modal-wide` | 600px | P19, 2026-08-05 — a surface carrying a LINE LIST rather than a question |
| `"viewer"` | `max-w-modal-viewer` | 880px | 2026-09-11 — a surface whose binding constraint is a PICTURE's height, not a column of text. The dialog caps at `85vh`; its chrome (header, footer, the caption line) takes 136px, leaving 629px of image. A 4:3 delivery photo 629px tall is 839px wide, so 880px shows it whole with 9px of headroom either side. Below this the photo is letterboxed and the operator zooms to read a door number |

**A FOURTH WIDTH IS A DECISION FOR THIS TABLE, NOT FOR A CALLER.** `width` stays a union of
literals with no number and no `style`, so what a page can express is one of these three. A page
that needs a surface this table does not describe brings the gap here — it does not draw its own
overlay.

**⭐ RETURNING FOCUS IS `DialogFrame`'s JOB, AND IT WAS NOT BEING DONE (defect found and fixed
2026-09-11).** The kit documented *"focus returned to the trigger"* as Radix behaviour it
inherited. It was not: Radix restores focus to `Dialog.Trigger`, and the kit deliberately has
none, because `open` is CONTROLLED and what opens a surface is an ordinary page button, a row
action or a keyboard shortcut. Radix's modal content therefore called `preventDefault()` on its
own close-focus event and then focused a trigger that was `null` — so **every modal and drawer in
the portal dropped a keyboard user onto `<body>`**, with no way back to the row they opened.
`DialogFrame` now remembers the element that had focus when it opened and restores it on close,
skipping an opener the close itself removed from the document. One fix, every surface — which is
the whole reason the two components share a frame.

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
- **PERSONAL COLUMN LAYOUT IS REMEMBERED — Listing Standard, owner approved 2026-09-16.** Resize,
  reorder and hide are personal: remembered in that staff member's browser for now and affecting
  nobody else, with a visible `Reset columns` back to the governed default. `register/DataGrid`
  remembers per page key (Sales Orders `carres.salesOrders.register.v4.{role}`) and labels the act
  `Reset columns` (PR #1396). Kit `DataTable` does not remember yet: **APPROVED TARGET / NOT
  BUILT** there.
- **LISTING STANDARD ENGINE POWERS — owner approved 2026-09-16, BUILT in `register/DataGrid`
  (PR #1396).** Default-on for every register unless marked opt-in:
  ```
  KEYBOARD    a grid is ONE Tab stop (roving row, always a RENDERED row); ↑/↓ one row,
              Home/End first/last, PageUp/PageDown one screen — counted in the FULL row list
              (group banners and expansions skipped); a virtual list scrolls to the target,
              focuses it and corrects the scroll so it sits wholly below the sticky header
              (the virtualizer's 30px estimate vs 38px rows left it off-screen, measured
              2026-09-17, PR follow-up to #1396); Enter = what a double-click
              opens; Space ticks; → / ← open and close the expansion; Shift+F10 or the Menu key
              opens the row menu from the row or any control in it; the menu (role menu,
              `Row actions`) takes focus, ↑/↓/Home/End move, Escape or Tab gives focus back.
              A governed group heading is a Tab stop. Controls inside a row keep their own keys.
  NARROW      the toolbar and condition strip never shrink (flex: none), so a wrapped toolbar
              never slides under the header; below a 768px GRID canvas (not the device) the row
              checkbox has a 40×40 target and a 40px column.
  EDGE        the last column's resize handle stays inside the table — a register that exactly
              fills its width has no phantom 3px sideways scroll.
  opt-in errorState       a failed read drawn inside the work surface; the toolbar and its
                          create action stay; the footer prints no count.
  opt-in overflowText     per column: the value on one line; ONLY when the cell cuts it, a kit
                          Popover trigger (`{column}: {value}`) opens it whole by click or keyboard.
  searchPresentation="responsive"   the query is a `Search: {query}` condition chip; `Clear
                          filters` clears search + header filters; a no-match state with its own
                          `Clear filters` suppresses the strip's duplicate button.
  ```
  Measured on rendered fixture pages 2026-09-17 (not authenticated production): Sales Orders at
  1440/1180/820/390 + 200% zoom; smoke on SO Batch, Manual Purchase, Purchase Orders, Delivery
  Monitor and Payment Records — one Tab stop per grid, no page sideways scroll, no toolbar/header
  overlap. Known 🟡: a keyboard user crosses every header sort/filter button (20 stops on Sales
  Orders) before reaching the rows.
- **⭐ STICKY IDENTITY IS AN ENGINE CAPABILITY — owner ruling 2026-08-15 (Chai).** When optional
  columns widen a register past its frame it scrolls sideways, and the row loses the only thing
  that says WHICH record it is. `register/DataGrid` takes an OPTIONAL `stickyIdentity`: the control
  gutter (selection + expand) and the **first data column** pin to the left edge while the rest
  slides under them. The engine does not know what an `SO No` is — the identity column is whatever
  the page put first.
  - **The ruling said `kit/DataTable`, and that was a factual slip we are recording rather than
    obeying.** The Sales Orders Register runs `register/DataGrid` under the ruled exception in the
    line above, so building the capability in the kit component would have satisfied the words and
    left the actual register scrolling its identity away. What binds is the ruling's own reason —
    *"never a page-local hack"* — and it is honoured: one engine, every register that scrolls.
  - **Default OFF**, so no signature moved and no unwired page changed. `DataGrid.sticky.test.tsx`
    asserts BOTH directions, and the absence is the more important half: a power that quietly
    appears later is the failure the "every optional power is OPTIONAL" rule exists to stop.
  - A pinned cell paints its own fill and repaints hover/selection, or it becomes the one part of
    the row that never highlights; the pinned HEADER cells outrank the already-sticky `thead` while
    the pinned BODY cells sit below it. The edge is a shadow, never a border, so it cannot shave a
    control in the gutter (`01-design-tokens` §5.1).
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

# §4.1 · OBJECT DETAIL — APPROVED / LOCKED, Jess 2026-08-18

### WHY THIS SECTION EXISTS
**It was missing, and three modules each answered it differently.** Sales Order opens a
full-screen drawer; Purchase Orders opens a 400px right pane plus a row expand; Supplier Claims
puts a 712-line panel inside the row expansion and has no right pane at all
(`w-[400px]` greps zero on that page). `03-page-patterns.md` names a `Detail` pattern in four
lines — four regions and five hierarchy items — and stops. **Three surfaces for one job is what
happens when the law is four lines long.**

### THE THREE SURFACES, AND THERE IS NO FOURTH
```
INSPECT   inside the list      row expand      ↑↓ moves · Esc closes · read to decide
WORK      full screen          four regions    the job gets done here
EDIT      full screen          split           left composes · right shows what leaves Carres
```
`00-register-laws.md:7` already rules INSPECT (↑↓, Esc) and Purchasing already models the pair as
`{ poId, mode }`. This section names them as the complete set. **A fourth way to open one record
means staff must remember which one can do what, and that memory is the thing this portal exists
to remove.**

**THE ONE GOVERNED WRITE STATE INSIDE AN INSPECT SURFACE — owner ruling 2026-09-13, Delivery
Monitor.** The Monitor row's expansion is the delivery brief: four kit `Panel`s (`Customer,
Address & Access` · `Delivery Dates` · `Logistics Details` · `Items, Services & Stock`). Where a
panel owns a Delivery write, the `Panel`'s one right-slot control (`Update date and time`,
`Assign logistics` / `Change logistics`) flips that panel's own body into a focused edit state
with its named Save (`Save confirmed delivery`); the operator stays on the same row, queue and
narrowings. No overflow menu and no separate dialog is invented for these acts, and no other
register may copy this without its own owner ruling. Sales facts inside the brief stay read-only
behind `Open Sales Order to change`. The full law is `../delivery/MASTER.md` §8.5 and §8.6.

### THE FOUR REGIONS ARE `03-page-patterns.md`'s, UNCHANGED
```
Header       which record · what state · ‹ 4 of 69 ›
Summary      the facts read before anything is done
Sections     the content
History      Today · Yesterday · Earlier
```

### A TAB EARNS ITS PLACE TWO WAYS, AND ONLY TWO
*(Corrected the day it was written: the first draft gave one reason, then a Supplier Claim failed
the test while plainly needing tabs. The rule was incomplete, not the claim.)*

**REASON ONE — genuinely parallel tracks.** A Sales Order carries EIGHT (`items · delivery ·
balance · storage · loan · documents · cases · activity`) and earns every one: goods, delivery and
money all move at the same time and none waits for another.

**REASON TWO — reference a human opens rarely but must be able to find.** Versions, History, the
route map. Not work; evidence. Burying them in the scroll makes the daily page longer for
something read once a month, and hiding them altogether means somebody re-derives it from
WhatsApp.

**Everything else is ONE SCROLL.** A purchase return has a single track — get the goods back —
and eight tabs on it is one tab and seven empty rooms.
```
PARALLEL TRACKS      Sales Order (8)
REFERENCE ONLY       Purchase Order · Supplier Claim
                       work is the first tab; the rest are Versions / History / Order Route
ONE SCROLL           Goods Receipt · Purchase Return · Repair Order · Display Request ·
                       Manual Purchase · the governed Consignment documents
```
**The test, and it is mechanical: would a staff member open this tab on an ordinary Tuesday?**
Yes and it runs beside the others → reason one. No, but they would hunt for it when something
went wrong → reason two. Neither → it is a section in the scroll, not a tab.

### THE SPLIT IS AN EDIT MODE, AND ONLY WHERE AN OUTSIDER READS THE RESULT
**Viewing never splits the screen** (Jess, 2026-08-18). Pressing edit does, and the right half is
**the document the other party will actually receive**, redrawn as the left half is typed — which
is the only way an operator can see what a supplier will read without printing it.
```
SPLITS       PO · Consignment Order · Consignment Return · Consignment Sale Notice ·
               Purchase Return · Repair Order · Supplier Claim · Goods Receipt (GRN)
NEVER        Display Request
EXCEPTION    Manual Purchase create / returned-request edit: internal MPR preview
             (owner 2026-09-22; APPROVED / NOT BUILT; Purchasing §9.2).
```
Manual Purchase creation uses the same Sales Order form composition: left form,
right live MPR preview, with `Request Details → Delivery → Items` on both sides.
Apply the governed readable split/stack behavior; ordinary saved MPR detail and
its Register do not acquire this split. The preview is internal request content,
not a supplier-facing PO. Purchasing §9.2 and COPY own fields and actions.

The GRN is an official A4 document the supplier and auditors read, so its object and Amend
Receiving use the 50/50 official preview (owner ruling 2026-09-06, Purchasing MASTER §9.4).

### A PANEL'S ACTIONS LIVE IN ITS OWN HEADER ⋮
Already ruled (Jess, 2026-07-11) and it corrected nine surfaces at once —
`orders/MASTER.md`: *"every panel's actions live in its header ⋮; the redundant inline button is
gone."* It binds every object detail in the portal; it is not re-argued per module.

### WHAT IS REMEMBERED, AND WHAT IS NOT
**Remembered: whether a rail or a panel is collapsed.** Shipped and measured —
`OrderDetailDrawer.tsx:2000` reads `ops-drawer-rail` from `localStorage`, and panel open/closed
persists by panel title (`:656-673`).
**Register column preferences are personal — APPROVED / NOT BUILT (Jess, 2026-09-17).**
Purchase Orders pilots account-saved layouts under §6.7: up to 10 named layouts per listing,
readable and changeable only by the signed-in owner. Save order, widths, visibility and sort;
never search, filters or group expansion. Other listings keep their current behavior until owner
acceptance of the pilot. This does not add customisation to object-detail goods tables.
Measured gap: kit `DataTable` still persists no column shape (`OperationOrdersControl.test.tsx`); that capability remains APPROVED TARGET / NOT BUILT there.


---

# §4.2 · MODULE NAVIGATION — CURRENT GRAMMAR SHIPPED PR #861; PURCHASING TREE APPROVED 2026-08-22

### ONE PORTAL RAIL; MULTI-PAGE MODULES EXPAND, ONE-PAGE DESTINATIONS DO NOT

PR #861 replaced the short-lived uppercase-heading model with the current shared grammar: a
multi-page module uses one icon + name + chevron row, with its pages hanging from quiet rounded
elbows. A destination with only one page is a direct icon + name row; it does not hide that page
behind a chevron that reveals the same name again. **Payments is a module of two destinations
(owner ruling 2026-09-12): `Monitor` — the named landing — and `Payment Records`; no
`Payments · Invoices` tabs, no standalone Invoices or Receipts row, and the same two rows for the
finance role, which is never a second Payment information architecture.** The existing `PortalSidebar` is the only left navigation surface: 232px
expanded and 60px collapsed. A module never opens a second sidebar, flyout or duplicate tab strip.

Purchasing has enough permanent destinations to require one further level. Its module row toggles
the entire tree without navigating. `BUY`, `RECEIVE`, `PROBLEMS` and `SHOWROOM` are independent
full-row accordion headers. More than one group may remain open. The active destination's group
opens automatically and may not hide the active destination. Purchasing parent/group state is
remembered per signed-in user. Purchasing has no Home or module-specific Work destination: its
Registers and central Work Engine already own those jobs.

```text
Purchasing                                               ▾
│  BUY                                                   ▾
│  │  SO Batch Purchase                         ← current
│  │  Manual Purchase
│  │  Purchase Orders
│  RECEIVE                                               ▸
│  PROBLEMS                                              ▸
│  SHOWROOM                                              ▸
```

This is navigation only. A page's own local filter rail belongs inside an individual Work
Surface and never becomes a second module sidebar. A Purchasing Listing follows the Sales Orders
Register shell; its compact Destination Header shows the current page word once, at the same
size/weight, without a leading icon or `Purchasing ·` prefix. Formal Object Detail alone may use
the approved 50% work + 50% live-PDF surface.

### FROZEN RULES

- **The full row toggles.** The Purchasing module row and every group header respond across their
  complete width; the module click does not silently open the first page.
- **The complete map is present from day one.** An approved but unbuilt destination is a `<span>`
  with no href, outside the tab order, `aria-disabled`, and prints `Coming soon` using the existing
  two-line non-control treatment. It has no hover, active bar, count or fake page.
- **Existing useful capability remains reachable through its approved home.** A previous screen does
  not earn a permanent door when its job is now a Register facet, central Work item, central Report,
  in-context Catalog request or authoritative `purchase_demand` read.
- **ALWAYS EXACTLY ONE VISIBLE ACTIVE INDICATION — APPROVED / LOCKED (the shared module
  active-indication law; Purchasing is not an exception to it).** The rail never says nothing about
  where the operator is standing, and never says it twice. The one indication moves with what is on
  screen:

  | What is visible | What carries `kit-blue-3` + the `kit-blue-9` line |
  |---|---|
  | The Purchasing tree is OPEN | **only the exact current child row**; the module parent and every group header stay neutral |
  | The Purchasing tree is SHUT while the current page belongs to Purchasing | **the Purchasing parent row** |
  | The rail is collapsed to 60px while the current page belongs to Purchasing | **the Purchasing module icon** |

  An open module parent or group header is never a second blue row; a shut parent standing on its
  own page is never a neutral one. Grouping a module's Listing rows is presentation and does not
  give that module its own selection rule.
- **Wire-line, never boxes.** Reuse PR #861's measured elbow geometry and governed 1px neutral
  lines. Nested groups extend that geometry one level; no heavy outline, boxed section, card,
  popover or shadow is introduced.
- **No destination icons.** Purchasing owns one module icon. Direct rows, group rows and Listing
  rows carry no individual leading icons.
- **Counts mean human work waiting**, never document totals, and zero prints nothing. The module
  parent and group headers do not sum hidden work into a second queue number.
- **Collapsed mode stays 60px** and shows the module's one icon; children/group headers disappear.
  Expanded/collapsed rail width keeps the existing `ops-sidebar-collapsed` law.
- **A collapsed module icon opens a NAMED destination, never "the first live row".** A module's
  landing page is a capability in its own right and may not be a side effect of the order its rows
  happen to sit in. Purchasing's 60px icon permanently links to **`SO Batch Purchase`**
  (`/operation?tab=purchase`). Jump To ordering is unaffected — it lists pages, and a landing choice
  is not a page.
- **The active row is brought into view** without centring or animation. The brand/collapse area
  stays fixed at the top, the signed-in user stays fixed at the bottom, and only the middle
  destination region scrolls.
- **Settings stays in the Page Header gear.** No Purchasing Settings row is added to the rail.

*Current shared implementation: `apps/web/src/pages/portal/portal-nav.ts` ·
`PortalSidebar.tsx` · `operation/PurchasingTabs.tsx` · `operation/StockTabs.tsx` ·
`operation/components/ModuleHeader.tsx`. Purchasing's nested grouping is shared production grammar;
the exact final destination map is the approved target in `docs/purchasing/MASTER.md`.*

# §5 · The right rail

### MISSION
Four quick-peek surfaces on the right of the ERP shell — **Team · Calendar · My Work · Activity** —
answer **who · when · what I must do · what just happened** without leaving the current object.
They are not duplicate modules and never become a second home for business truth.

### WHAT IS ON SCREEN TODAY
`apps/web/src/pages/operation/components/rail/` — `CalendarPanel` · `TeamPanel` ·
`TasksPanel` (`KeepPanel` is unmounted). The four rail slots are `TeamPanel` · `CalendarPanel` ·
`TasksPanel` · `GlobalActivity`/`AnnotationTimeline`. *Measured 2026-08-15 by reading
`OperationRightRail.tsx` and each panel line by line — the 2026-08-05 entry listed the
directory only and said so.*

### FROZEN RULES
- **No widget is an island.** Widgets interlink with each other AND with the LEFT panel; an
  action anywhere cascades to the relevant widgets.
- **The rail is quick peek, not navigation truth and not a second place to act.** A row may
  deep-link to the authoritative object/action. The owning module remains the writer.
  **ONE ruled exception: the duty edit door on Team** — duty identity has no other home
  (`../purchasing/MASTER.md` §2.2 makes this panel the one home), so the only place it can be
  corrected is the only place it is stated. It is not a precedent for a second writer.
- **`My Work` in the rail is a preview of the formal `Work` destination.** The full destination
  owns the `My Work · Team Work` views over one work set; the rail may not create another work set.
  **It therefore wears the Work destination's own icon** (`portal-nav.ts`, `ListTodo`) in both
  the collapsed strip and the expanded header — owner ruling 2026-08-15. A peek wearing a
  different face than the door it previews reads as a different feature; the `Flag` it replaced
  was borrowed from the Orders follow-up column, a different system. Asserted by
  `OperationRightRail.ui-contract.test.ts`, which reads the icon out of the nav rather than
  hard-coding it, so the two can never drift.
- **Team** previews availability/coverage and per-person `{n} open · {n} overdue`, and
  People/HR remains the owner. **The numbers come from the ONE work engine** — `useOpenWorkSet`,
  literally the function the Work destination runs — so the rail and Team Work are structurally
  incapable of printing two answers for one person. Rows deep-link to Team Work scoped to that
  person (`?tab=work&scope=team&owner=…`); a link seeds the view, it never restricts it.
  **Everyone appears, including a clear desk at `0 open`** — a rail that hides the people at
  zero cannot answer *"is anyone free?"*, and a missing name reads as a missing person.
- **Team states BOTH operational duties, and neither is ever blank.** `PO DUTY` and `GRN DUTY` resolve
  through the ONE Shared Duty Resolver (`../ERP-ARCHITECTURE.md` Law F.1, owner ruling
  2026-09-01 / 2026-09-03): **Workspace → Staff & Duties is the one Duty assignment door**,
  People owns identity/eligibility only, and no
  page reads a rota table or calculates a Duty for itself (the current `ops_po_duty` read is
  legacy implementation evidence that must converge — `../purchasing/MASTER.md` §5.3).
  `Not assigned` may appear ONLY when zero eligible staff exists, and must then say where to
  fix it. This file does not restate the duty model.
- **A PAGE NEVER RESOLVES DUTY — owner ruling 2026-09-01.** Every action-bearing surface renders
  the resolved owner/avatar from the one Work Engine Action contract governed by
  `../ERP-ARCHITECTURE.md` Law F.1. Only `Workspace → Staff & Duties` edits Duty assignments and
  Buddy cover; People supplies
  active/access and last-working-date facts. Dashboard, module Registers, object details, My Work,
  Team Work and Quick Rail may change display density, but they may not query the rota, calculate
  an offset, store local assignment or invent a fallback identity.
- **Activity** previews recent append-only events and links to their objects; it does not replace
  an object's History or a module audit surface. **No stored value reaches the screen untranslated
  and no `—` stands in for a value** — the two rulings are in `../COPY-STANDARD.md` and bind
  every panel that renders an event, not only this one.
- **The calendar's day comes from the BOOKING, through the one shared rule** — never from the
  promised date, or two surfaces put one order on two days.
- **The calendar names actual days, never `Today` / `Tomorrow`** (owner ruling 2026-08-15). Both
  single-day chips and every day heading print the real weekday + date; `This week` survives
  because it is a SPAN. The full ruling, its one history-group exception and the structural
  enforcement are in `../COPY-STANDARD.md`.
- **The chip prints the SAME string as every other date in the portal** (THE YEAR RULE, owner
  ruling 2026-08-15). It once needed a compact spelling of its own because the year would not fit
  in ~100px; the year is no longer printed for a current-year date, so `fmtDayChip` is deleted and
  the chip calls `fmtDate`. A single-day chip therefore carries NO hover — the full ruled date is
  on its face, and a tooltip that repeats or under-states what it explains is a defect. A SPAN
  chip keeps its hover, because `This week` names no date.

### WORK OWNER + TWO-LINE ACTION GRAMMAR — OWNER-APPROVED / LOCKED 2026-08-14

- **Action owner is structured identity, not sentence copy.** Show the resolved owner as the
  governed compact avatar/initial chip. The accessible name and hover label expose the full staff
  name. Do not prepend or repeat the name inside every action sentence.
- **My Work** may omit the current user's repeated avatar because the scope already answers who.
  **Team Work** groups by owner identity — avatar · full name · the counts — and individual rows
  do not repeat that group identity unless the row is shown outside the group. **The count words
  are `{n} actions to do · {n} late`** (owner ruling 2026-08-16, blueprint card §7 — supersedes
  this section's earlier `open · overdue` pair): every count says WHAT it counts.
- **My Work is the default for every employee, including a manager** (Owner-approved Purchasing →
  Receiving work model, 2026-08-29). Authority does not erase personal work. `Team Work` is the
  explicit supervision view over the same set, never the manager's automatic landing replacement.
- **Work stays in `My Work` / `Team Work`; a Register kit must not add a generic local
  `WORK TO DO` rail panel.** Module rails contain only that Register's approved factual filters.
  A future exception requires an explicit Owner ruling naming the action owner and write door; a
  UI kit or page author may never infer one from available action data. SO Batch Purchase has no
  local work panel.
- A Current Action or Work row uses two visual lines when both fact and action are needed.
  **Line 1** is the fact/problem in governed body size and medium/semibold emphasis. **Line 2**
  is the next action in the governed smaller supporting size, regular weight and quieter but
  readable colour. It is not metadata and may not fall below the accessible contrast floor.
  **A REGISTER CELL carries the FACT alone — owner ruling 2026-08-18; extended 2026-09-04:**
  registers list documents and authoritative facts; the action clause renders only where actions
  live (My Work · Team Work · the Order Route · detail panels), never in a register cell — and
  neither does an owner avatar, an owner name or a duty holder: a Register has no `Work` column.
  A register cell's second line is supporting EVIDENCE (a channel · date, a state), never an
  instruction. The Purchase Orders Register's shipped `Work` column (fact + action + PO Duty
  avatar) violated this law and is removed under the 2026-09-04 correction; its actions stay in
  My Work, Team Work, the PO detail and Order Route. **THE ONE RULED EXCEPTION — the Payment
  Monitor's `Payment timing` cell (owner ruling 2026-09-12, `docs/payment/MASTER.md` §3):** the
  Monitor is a CONTROL LISTING, not a document register, and the owner ruled its last column a
  two-line fact/action surface — line 1 the fact, line 2 the shared Work item's own action with
  its resolved owner as an avatar (hover/accessible name = full name, never a name in the
  sentence; no Work item ⇒ no action and no person, only `Wait` stands alone — re-ruled
  2026-09-16). It reads the Work feed's items; it resolves no owner and creates no second action.
  No other register may copy this without its own owner ruling. **THE SECOND RULED EXCEPTION —
  the Delivery Monitor's `Delivery Status` column (owner ruling 2026-09-13, journey rungs re-ruled
  2026-09-14, `../delivery/MASTER.md` §8.4):** its status word names the actor and the fact in
  primary-school English (`Operation must call the customer` · `Waiting for {partner} pickup` ·
  `Collected by {partner}` · `On the way to customer`), one arithmetic, no owner avatar and no
  second action. It is a status word, not an action sentence.
  **THE DELIVERY SCHEDULE CARD CARRIES TWO FACTS ON TWO LINES — owner ruling 2026-09-14
  (`../delivery/MASTER.md` §8.2 · §8.4):** line 1 the journey progress, line 2 the readiness or
  blocker (`Ready` · `Stock risk` · `Payment blocked` · `Logistics details incomplete` ·
  `DO not released`). The two never merge into one status, because a progress rung and a
  readiness fact answer different questions and come from different arithmetics. Every card also
  wears a TYPE label (`DELIVERY` · `TRANSFER`) whose two populations are never summed into one
  total. No other surface adopts this grammar without its own owner ruling.
- **DELIVERY WORK SENTENCES ARE TWO STRUCTURED LINES — owner ruling 2026-09-13.** For Delivery
  Work, line 1 is the act with its recipient (`Call NETS`) and line 2 the required result
  (`Confirm the delivery date`); the row's status word carries the fact. Owner, source object and
  the actual working date are structured metadata beside the sentence, never joined into it, and
  no `—` appears in either line. The 13 / 11 sizes below apply unchanged.
- **THE SIZES ARE 13 / 11 — owner ruling 2026-08-15 (Chai).** Line 1 is `text-body` (13, semibold).
  Line 2 is **`text-label` (11) at `font-normal`**, moved down from `text-meta` (12). One point of
  separation was not enough to read as a second RANK: at 13/12 the two lines looked like one
  sentence that had wrapped, and the whole purpose of the grammar is that the eye takes the FACT
  first and the INSTRUCTION second. `text-label`'s own weight is 500, so the ruling's regular
  weight is an explicit `font-normal` — the size alone would have left line 2 heavier than line 1
  relative to its size. The colour token does not change: `text-base-600` measures 8.6:1 on the
  white row, so the quieter line stays well clear of this section's contrast floor at the smaller
  size rather than being rescued by it. Applies wherever the grammar renders — Work rows,
  the Quick Rail's Work peek, Current Action blocks (a register cell carries the fact alone since
  the 2026-08-18 owner ruling). `SalesOrdersRegister.test.tsx` now asserts the fact-only cell and
  names the retired action clause, so a revert fails rather than merely passing unnoticed.
- Do not repeat context already supplied by the row: SO number stays in SO No, customer stays in
  Customer, and owner stays in the avatar/group. At medium desktop, truncate the supporting line
  with a discoverable full value; never blend both lines into one clipped sentence.
- Missing optional facts render the governed neutral empty value. A missing required fact that
  opens work renders the fact/problem plus its action; bare `Not given` or `Not recorded` must not
  impersonate an actionable warning.

### HISTORY + REVISION THREE-RANK RECORD GRAMMAR — OWNER-APPROVED / LOCKED 2026-08-27

History and Revisions are not database dumps. They are employee-facing records that must answer,
in five seconds: **what happened · who did it · when · what important result was recorded.** A
developer who knows the schema is not the acceptance reader; a new operator is.

- Use **up to three visual lines**, in this fixed reading order. Omit an inapplicable third line;
  never render an empty line merely to preserve height.
  1. **What happened** — `text-body` (13), semibold, primary text.
  2. **Who and when** — `text-meta` (12), regular, secondary text. Use structured actor identity:
     real staff name + role + actual `fmtDate()` date/time.
  3. **Important result/detail** — `text-label` (11) at `font-normal`, quieter but accessible.
- Do not concatenate actor, role, action and raw fields into one sentence separated by dots. That
  makes a schema-literate developer do the hierarchy work in their head and leaves a new operator
  without a reading path.
- **STAFF IDENTITY LAW — OWNER RULING 2026-08-27 (Jess), after the failed five-second walk.**
  `Who did it?` is answered by a PERSON, never a permission. The first cold read failed on
  `principal · Principal` — a role/account label repeated twice — and the ruling that closed it:
  1. Every staff member uses an **individual authenticated account**. `Principal`, `Operation`
     and `Finance` are permission roles, never staff names, and a shared role-labeled login is
     not an actor.
  2. Every Sales Order write stores the authenticated individual `user_id`; Revisions and
     History resolve that id to the staff member's **real display name** from the authoritative
     identity source. The UI never hardcodes an account→person mapping and never translates a
     role into a person.
  3. Approved display: `Jess · Principal · Thu, 27 Aug 12:30` · `Recorded by Jess · Thu, 27 Aug
     12:30`. Forbidden display: `principal · Principal` · `Recorded by principal` ·
     `Unknown user`.
  4. `System` appears only when the event's own authoritative facts prove the portal, a
     scheduled job or database automation acted — never inferred from a missing id.
  5. An old record whose individual actor cannot be recovered — including one written by a
     shared role login — says **`Staff identity not recorded`**. A person is never invented.
- A Revision uses the same ranks but remains a complete-version door, not an event. Rev 1 says
  `Original order`; a later approved/applied Revision names the governed change. Selecting a
  Revision opens the complete read-only version and its document truth.

```text
Order created
Jess · Principal · Mon, 24 Aug 11:16
No deposit · Online order

Original order
Rev 1 · Current
Recorded by Jess · Mon, 24 Aug 11:16
```

**Acceptance.** Give the record to a staff member who did not build the screen. Within five
seconds they must answer what happened, who did it, when, and the important result. Failure to
answer any applicable question means the record fails UI acceptance even when every stored field
is technically present.

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
into a module tab strip. Purchasing is the explicit reference: `SO Batch Purchase` · `Manual
Purchase` · `Purchase Orders` · `Receiving` · `Supplier Claims` are individual
destinations inside its governed sidebar tree, with no Purchasing tabs and no substitute second
navigation row.

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
owns destination switching; the content header stays one identity row (50px, §6.7) and uses horizontal
room instead of adding title, breadcrumb, KPI or tab bands. Register listing behaviour and
readability follow the governed 2990 reference: its listing engine, controls, column powers,
row disclosure and table hierarchy are the reference. GitHub is evidence for tab admission,
not the Carres Register shell. Carres business ownership remains authoritative over all three.

**REGISTER PAGE HEADER — APPROVED / LOCKED (Loo, 2026-08-11).** Every Register begins with one
rendered 50px Page Header (44px until the 2026-08-15 ruling in §6.7). Left = one short identity
title, for example `Sales Orders`, as the word alone. Right = genuine global utilities only: `Jump to…` with its
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

**THE SETTINGS WORKSPACE RAIL — APPROVED / LOCKED, owner correction 2026-09-09. BUILT.** The
Workspace's section rail is the governed Carres rail, not a fifth visual language. It drew a 280px
floating rounded card with a shadow and a page margin, and marked the active section with a
near-black `base-900` pill. It now draws the same shell and `NavRow` treatment as every other
Carres rail (LOCAL FILTER RAIL / LOCAL RAIL ACTIVE ROW below): **240px, flush left, one straight
right divider, no card, no radius and no shadow on the container; `blue-3` wash with a straight 2px
`blue-9` line inset left on the active row; slate hover on the rest.**

It hides under the same law as a local filter rail: `Hide settings` removes the WHOLE rail and
gives its width to the settings page — never a second 60px icon strip beside the Portal sidebar —
the content then carries `Show settings`, and the choice is remembered for that staff browser
(`ops-settings-rail`). The icons are the Portal sidebar's governed panel-left pair. This is
navigation between module Settings sections, so the rail carries no filters and no checkboxes.

Every Settings section draws the same page header: a `kicker` naming the module above an
`h1.text-page font-display` naming the page. Purchasing Settings had neither and opened straight
onto a paragraph; it was corrected in the same change.

**A MODULE GROUP MAY OWN MORE THAN ONE RAIL ROW — APPROVED / LOCKED, owner card 2026-09-09. BUILT.**
Every module before Warehouse had exactly one settings page, so the rail carried one row per group.
`Warehouse` is five SECTIONS of one page — `Warehouse Details · Working Hours · Public Holidays ·
Special Dates · Access` — not five module settings pages, and they sit as five rows under one
`Warehouse` group heading. The rail treatment is unchanged: 240px, flush left, one straight right
divider, `blue-3` wash with a 2px `blue-9` line inset left on the active row. A group may still not
invent a second Settings home, and a section that opens nothing may not appear.

**A SETTINGS PAGE MAY CARRY ONE HEADER `Save changes` — APPROVED / LOCKED, owner card 2026-09-09.
BUILT.** This narrows, and does not repeal, the 2026-08-14 SETTINGS TEMPLATE rule that raw config
fields and Save/Cancel controls are not the default view. That rule was written against per-field
Save/Cancel scattered through a page of database-shaped inputs. A module settings page that edits
one coherent configuration instead renders plain-language groups and readable rows, holds the
operator's edits as a draft, and commits them with **one** `Save changes` in the Page Header's right
cluster. It obeys the Receiving button law: disabled while nothing has changed, and when something
is invalid it NAMES the gap — `Save changes — say why this date is different`. It never becomes a
second per-field control, and it never appears on a settings page that has no draft to commit.

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

**`JUMP TO…` — BUILT 2026-08-15.** The capability was approved 2026-08-11 and unbuilt until this
date; every Register inherited the hole. It is now on screen from
`apps/web/src/pages/operation/components/JumpTo.tsx`, mounted first in `TopBarIcons` so it renders
in every Page Header and in the slim utility bar at once. The overlay is the kit's `Modal` — focus
trap, Esc, scroll lock, returned focus — never a hand-rolled one; `w-full max-w-modal` +
`max-h-dialog` is what makes the small-screen case the same surface, full-width.

Four implementation boundaries the law left open, decided by build and recorded here so the next
chat does not re-decide them:

| Question | Decision | Why |
|---|---|---|
| Where do the DESTINATIONS come from? | `portal-nav`'s `visibleGroups` / `visibleItems` — the sidebar's own functions | A second destination list is a second permission model, and the copy is the one that drifts |
| How are DOCUMENTS permission-filtered? | `GET /api/operation/jump` reads under the caller's own token; RLS decides what exists. `requireOperation` keeps every other role off the route entirely | A row the caller may not select is never returned to the Worker, so there is no filtered list to leak |
| What does a `GRN` result open, given the number is DERIVED and never stored? | A query carrying a full `DDMMYY` reads the date back out of the number and asks for that day exactly; a half-typed query scans the 200 most recent posted records | An exact lookup must not depend on how far a recent window happens to reach |
| What does an `INV` result open? | The Sales Order it invoices | An invoice is a document OF an order (`invoices.order_id`, `orders.invoice_no`); the order's workspace is where the paper is read and reprinted |

🟡 **ONE WORD IS OWED A RULING.** The locked contract names the empty state `No results`, and
`COPY-STANDARD.md` rule 5 lists that exact string as the ✘ example of an empty state that teaches
nothing. The locked, dated, surface-specific ruling was implemented verbatim. The two are
reconcilable — a worklist is empty because there is no work and can say so, while a search that
matched nothing has nothing to teach — but COPY-STANDARD does not yet carry that split, and until
it does the two documents disagree in writing.

**REGISTER WORK TOOLBAR / SECOND HEADER — APPROVED / LOCKED (Loo, 2026-08-11).** Immediately
below the Page Header, a Register may own one rendered 45px Work Toolbar; it is one row and never
scrolls horizontally. Normal state spends the left side on the current View control and current-
Register Search, and the right side on page-owned Export/display controls, frequent actions, one
primary create action and a low-frequency overflow when needed. `View: {current view}` is explicit;
scope capabilities such as All orders / Not delivered are saved/reusable Views, never a permanent
row of pills. A View control is conditional on a useful, distinct view capability; do not render
one merely to repeat status filters. Supplier Claims defaults to all permitted new and historical
records and has no View selector (owner correction 2026-09-07; Purchasing §9.5). Header-column filters remain the direct per-column filter door; the Toolbar does not
add a duplicate generic Filters button. `Reset columns` remains inside Columns.

Selecting rows **replaces** the normal Toolbar within the same 45px height; it never adds a third
permanent band. Left = truthful selected count + Clear + the primary work action and any structured
owner context it needs. Right = outputs such as Export, followed only by secondary actions valid for
that exact selection. A one-record action disappears for multi-selection rather than pretending to
apply to many. Normal and selection states preserve the table's position and width.

On SO Batch Purchase, PO Duty ownership is shown only beside the selected `Issue PO` action as one
compact initials avatar chip (`YJ`, or the current dated cover), with full identity and duty context
in title/accessible name. There is no permanent PO Duty toolbar/rail block and no owner repetition
on rows. The left-side order is summary · Clear · owner chip · `Issue PO`; `Export Excel` stays at
the far right. The chip states work ownership; it does not imply that the current actor is the owner.

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

**LOCAL FILTER RAIL — READABLE SHELL — APPROVED / LOCKED, owner ruling 2026-08-27 (Purchasing
Card 02-C).** The page-owned filter rail's shell, group and row grammar is the shared
`FilterRail` / `FilterRailGroup` / `FilterRailRow` component (`workspace-rail.tsx`): 240px
wide · 12px outer padding · 8px heading → first row · 20px between groups · 36px minimum row.
A governed filter label is NEVER truncated and never hidden behind a hover or tooltip — it
wraps onto a second line in the same body font at its natural height (≥ 48px), with the count
still visible and right-aligned. The rail scrolls vertically as rows grow; it keeps its border
against the Register; at narrower desktop widths the Register scrolls horizontally and the
rail is never squeezed below 240px. The rail is navigation, not batch selection — it carries
no checkboxes. Pages still drawing the older 200px `RailGroup`/`RailItem` pair migrate to this
shell in their own cards, not as a side effect of someone else's.

**LOCAL FILTER RAIL — COMPACT FACT DROPDOWN — APPROVED / LOCKED, owner ruling 2026-09-11.**
A rail SECTION whose facts are a long, open-ended list collapses into ONE control —
`FilterRailSelect` in the same `workspace-rail.tsx` — instead of printing every value as a row.

- **WHICH SECTIONS, AND WHY.** A section stays a list of ROWS when it is the same few every day
  and its counts are what the operator scans first thing in the morning — the daily worklist and
  timing lenses (`WORK TO DO`, `TO ORDER`, `ORDER TIMING`, `REGION`, `SETUP TO FIX`). A section
  becomes a dropdown when it is a FACT LIST that grows with the business: today
  `PURCHASE PURPOSE` (Manual Purchase), `PRODUCT` and `SUPPLIER` (both purchasing Registers).
  **Measured 2026-09-11** on the Manual Purchase rail at a 1024×768 window: the collapsed rail's
  content is 718px and does not scroll; with those thirteen fact rows it is ~1132px, so the
  timing rows — the ones that say what to do today — sat below the fold.
- **IT IS THE SAME FILTER, NOT A SECOND MODEL.** The control writes the same single-slot section
  value the rows wrote: sections still combine with AND, the section's own `All …` word is the
  first option and its clear, and one section never holds two values. It is never a multi-select.
- **NOTHING QUIET IS LOST.** The count rides in the option text (`Ohana · 4`), and a narrowed
  control wears the rail's own ACTIVE treatment — the `kit-blue-3` field with the `kit-blue-9`
  left-edge marker — so a narrowed section is exactly as visible as a selected row was.
- **STILL NAVIGATION, NOT BATCH SELECTION.** No checkbox, and no `multiple`.

**LOCAL FILTER RAIL FIXED HEADER + MONTH CALENDAR — owner corrections 2026-09-06 (Delivery
Monitor + Receiving, landed the same day).** `FilterRail` accepts an optional fixed `header`
block: the header stays put while the filter groups scroll independently beneath it, separated
by a hairline (`{testId}-fixed` / `{testId}-scroll` regions). Its governed content is the rail
month calendar, and the kit gained **`MonthCalendar`** (`components/kit/MonthCalendar.tsx`) for
it: the same `react-day-picker` engine and token skin as `DatePicker`, rendered permanently
instead of in a popover, acting as a FILTER (pick a day to narrow the register beside it, pick
it again to clear, ‹ › move exactly one month). It prints the month spelled out as its caption,
keeps Sunday visible in the muted non-working state, and marks a day by printing a COUNT under
the date with the same fact in the day's aria sentence — colour is never the only signal.
Delivery Monitor's same-day `MonitorMonthCalendar` (a page-level recipe on the kit's exported
DatePicker skin and dot markers) predates the kit component by hours and migrates onto it in its
own card — §6.1's second-occurrence rule; nobody draws a third month grid. On Monitor, the month
calendar is the persistent date picker: choosing a date opens that date's `Day` view. The page
toolbar owns `Day · 3 days · Work week · Month` (owner ruling 2026-09-14 — a layout never wears a
word it does not honour, so a three-day half-week is never labelled `Week`); `Calendar` is never
repeated as a `WORK TO DO` rail row. **Today is a ring and the selected date is the blue FILL, so
the two never compete, and the current work week carries a subtle band** — a marker that marks a
day by shape and position, never by colour alone.

**LOCAL FILTER RAIL COLLAPSE — APPROVED / LOCKED, owner ruling 2026-08-27.** The open rail carries
one neutral `Hide filters` panel-left button. **S3 (BUILT 2026-09-17, SO Batch Purchase and Manual
Purchase, `useFilterRailOpen`):** below an 896px canvas the rail starts hidden unless this browser
opened it before; a browser that hid it keeps it hidden at any width. Hiding removes the whole local rail and gives its width
to the Register; it never leaves a duplicate 60px icon strip beside the Portal navigation. The
Register toolbar then carries `Show filters`. Reopening restores the same filters and the browser
remembers the open/closed choice. Use the Portal sidebar's governed panel-left icon family and
Carres control tokens, not a chevron, `X`, text link or a new visual language.

**PORTAL NAVIGATION ACTIVE COLOUR — APPROVED / LOCKED.** The flame repoint applies to active
navigation too: the current destination uses the governed blue selection treatment, never a
red/flame active line or red rounded selection block. Flame remains the Carres brand mark;
red remains late work / alert under the token law. A navigation item is selection, so its
active line and wash are `blue-9` / `blue-3`. The rollout remains a separate implementation
card; new designs and mockups show the approved destination, not the legacy red state.

**REGISTER TABLE DENSITY LAW — APPROVED / LOCKED.** The readable 2990 parent-list geometry is
the Register baseline, expressed only through frozen Carres typography tokens: rendered 36px
table header using `text-label` (11px / 14px); rendered 38px single-line parent row using
`text-body` (13px / 18px). **THE TWO PAGE-SPECIFIC EXCEPTIONS — the Delivery Monitor work list
(owner ruling 2026-09-12) and the Payment Monitor listing (owner ruling 2026-09-16): each parent
row is a fixed 72px because it deliberately carries one primary fact and one supporting line in
every cell (`../delivery/MASTER.md` §8.3 · `../payment/MASTER.md` §3). Both print the cell through
the one shared `MonitorTwoLines`; a cell never grows the row or shows a third line, and a cut value
opens whole by click or keyboard. The 38 versus 72 decision is not reopened, and no other register
inherits 72px without its own owner ruling.** The remaining height is balanced vertical breathing room, with the
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

**REGISTER LISTING BOUNDARY — APPROVED / LOCKED, Owner correction 2026-08-31; overwrites the
2026-08-29 four-sided-frame ruling.** A full `register/DataGrid` has **no enclosing outer border**
around its Work Toolbar + table + fixed status footer. The visible structure stays inside the
listing: the toolbar keeps its bottom divider, the table keeps its header/row/column grid lines,
and the status footer keeps its top divider. Removing the outer rectangle must never remove those
listing lines. A page may not add a wrapper border to recreate the obsolete frame. Embedded child
tables retain only their separately governed child-table treatment. This ruling changes the shared
Register engine, not one Sales Orders page override.

The Register work surface has 8px breathing room above and below. The 32px footer remains part of
the listing and never touches the browser edge. Available vertical space is filled with consecutive
complete parent rows. There is no
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
DestinationHeader  50px  Sales Orders identity + genuine global utilities only
Work Toolbar       45px  View · one Search · Export · Columns · actions · overflow
Work Surface             one DataGrid + fixed status footer; loading · empty · error remain inside it
```

**Proven in authenticated production at 1920 · 1440 · 1130:** one destination identity · one
Work Toolbar · one general Search · no duplicate destination tab/title · no outer-page scroll ·
DataGrid-owned genuine-wide horizontal overflow · 1130 without another toolbar band · Search ·
column filters · Export · Columns · persistence · expansion all survive the migration.

**The Sales Orders reference appearance follows the current Register Template:** 36px table
header · 38px single-line parent rows · 32px fixed status footer · 8px work-surface gaps · flat
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

  ▸ | SO Date | SO No | Requested Delivery Date | Customer |
    | Delivery Location | Showroom | PO No | DO No
```

- **NO ENCLOSING REGISTER FRAME — Owner correction 2026-08-31; overwrites the 2026-08-29
  four-sided-frame ruling.** Sales Orders inherits the shared Register engine's frameless outer
  boundary. The Work Toolbar divider, table header/row/column grid and status-footer divider stay;
  only the rectangle enclosing all three is absent. A page-local wrapper may not add it back.
- **DATE DICTIONARY — Owner correction 2026-08-31.** `orders.placed_at` is labelled **`SO Date`**
  everywhere in Sales Orders: Register, Order info, Order Route and field catalogs. `Ordered`
  remains Purchasing's state/quantity word (`Ordered` · `Ordered Qty`) and must not label an SO
  creation date.
- Sales Orders is a truth Register, not Work and not a dashboard. No KPI-card preamble, no
  giant card around the page.
- The seven business columns above are the governed default and exact order. `▸` is chrome.
  There is no overall `Current`/status column. Content sets predetermined usable widths; staff do
  not resize to repair the default. Optional columns may cause grid-owned horizontal overflow and
  may not squeeze the default set.
- **Sales Orders spacing correction — owner approved 2026-09-14.** The owning Orders MASTER
  §0.1 / Sales Orders Card 11 governs six separate child columns, fixed content widths with Item
  last, 8px side padding, its own four-sided border and 12px vertical gaps. The child follows the
  actual SO No column after saved reordering and ends at the parent table edge. Requested Delivery
  Date may use the deliberate two-line header `Requested` / `Delivery Date`; the exact accessible,
  filter and export label stays unchanged. Narrow grids scroll internally. These are Sales Orders
  opt-ins; Purchasing's approved goods composition and other consumers retain their layouts.
- Expansion is goods-only: a small clean, non-filterable table beneath the parent row with the
  locked columns `Category | Unit ID | Deliver To | SKU | Qty | Item` (owner ruling 2026-08-15,
  moving `Deliver To` next to `Unit ID`: both answer *where is this piece*, and separating them by
  three columns made the operator read across the whole table to pair them). It may use its own column
  tracks; it must retain the parent Register's seven-column structure and horizontal behaviour.
  Unit ID is Stock truth; Deliver To is read-only Purchasing truth, not Warehouse location. The
  word is `Unit ID` everywhere (`Item ID` is retired); on the opened Purchase Order's
  `Document → Goods lines` a quantity-scoped line prints `—` because it has no Unit ID by law,
  and an exact-unit line with none after issue reads `Unit IDs missing on this line — do not send
  this PO` (owner ruling 2026-09-07, Purchasing §6.2).
- Keep the proven Search, typed filters, Columns, Export and right-click document interaction.
  Selection may scope Export; it may not introduce register-owned execution. Direct SO/PO/DO
  numbers are links to their owner. Only explicit `Edit` opens the formal edit context; View,
  Preview and Print remain non-edit.
- The detail object presents Current/Order truth, Revisions, History, the actual PDF/document and
  Order Route. Revisions (complete versions) and History (events) are separate. Order Route is a
  read-only, fact-derived, multi-position route/obligation map — never a manual checklist or
  single overall status. Its governed visual grammar adapts parcel tracking: small state node, thin
  connector, fact/evidence and date, using Carres tokens rather than reference-product styling.
  **OVERWRITTEN 2026-08-16 (owner ruling) — the two-layer stack is retired; the route is ONE NODE
  MAP.** White node cards joined by connector lines on a single pannable, zoomable canvas that fits
  itself to the viewport on load (`− + ⛶` bottom-left, always visible, keyboard-operable). The Sales
  Order is the only root and goods, delivery and money leave it simultaneously; goods forks per line
  and per source quantity; everything converges on the read-only Delivery Order gate, with
  `DELIVER` and `DELIVERY PHOTO` below it and no trailing line after the last node. `CURRENT` is one
  per route — up to three, never a fourth. Completed nodes require owner-module evidence and are
  never manually ticked. Document links spell their destination (`Open PO-2048 →`); absent documents
  use plain facts rather than `—`. The canvas never reflows: at any width it simply fits smaller and
  the operator pans, so no node loses its anatomy. The gate is a read-only convergence result and
  deep-link, never a Sales Order write control — no Release or Approve button exists in any state.
  Conditional linked problems sit on a strip OUTSIDE the canvas, because a node is a stage every
  object passes through and an exception is not one. The content starts directly with the canvas:
  the persistent Object Header already supplies the page name and `number · party`, so neither is
  repeated. A door back to the already-open object is forbidden, and full machine timestamps are
  formatted before display. State is never carried by colour alone, and only the colour steps the
  Tailwind config publishes may be used — an unpublished step renders nothing at all.
  Governing detail: `docs/orders/MASTER.md` § ORDER ROUTE — ONE NODE MAP.
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
- **ACTION OWNER TEMPLATE — OWNER-APPROVED / LOCKED (2026-09-03).** Object identity belongs to the
  row/card header; owner belongs to structured metadata/avatar; the action sentence contains only
  the act. Avatar initials are a separate chip and hover reveals the person. My Work omits the
  current person's repeated avatar. Team Work groups by owner header. Cover shows normal owner and
  today's cover without overwriting either. Counts name concrete work (`5 customer balances need
  collection`), never abstract `open`/`late` totals. Register, My Work and Team Work render the same
  Action contract at different density; none stores a second free-text truth.
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
  interaction-blue selection, amber missing Requested Delivery Date, location summaries, the approved
  six-column goods mini-table and filtered quantity footer with no permanent Reset layout. The
  persistent Object Header and `Order · Revisions · History · Order Route` navigation were verified
  across View and Edit. Order is read-first at document width; PDF remains behind Print; Revisions
  and History are separate views; Order Route shows per-goods `CURRENT` and a secondary Still owed
  list. Edit keeps Requested Delivery Date read-only, retains the existing Proceed date writer, maps only
  existing address/access fields, and aligns Customer with Sales ownership beneath a full-width
  edit-scope notice. The same Object Route and Edit compositions remained usable with My Work open.
  This supersedes the earlier acceptance note's live PDF-canvas statement and closes the Sales Order
  Visual Acceptance slice without changing settled business truth.
- **SALES ORDER FINAL OWNER VISUAL CORRECTION — PRODUCTION-VERIFIED / LOCKED (2026-08-14).** Owner
  review reopened the preceding closure. The final correction is PR #795, merged as
  `759d49efaee6c643bd9d8e1840cb991dee2b7015`; complete CI run `31804608716` passed and production
  deploy run `31805501074` converged that exact SHA. Authenticated normal and medium-desktop
  acceptance proved the fact-first missing Requested Delivery Date presentation, concise locality,
  unchanged six-column goods mini-table, single-destination quantity suppression, equal Register
  and Object goods truth, the approved `Edit operational details | Order context` composition,
  governed Sales ownership, edit controls and URL state confined to Order Edit, safe dirty-navigation
  refusal, genuine Revisions/History/Order Route views, governed Activity event labels, and
  operator-English per-goods routing with formatted dates. Register normal/expanded/selected states,
  footer, row actions, Team/Calendar/My Work/Activity, Object views and Quick Rail coexistence were
  checked top-to-toe. Print remained visible and enabled; its blob-preview activation was the only
  browser-policy-blocked automation step, with the print handler, focused tests and production
  build passing. This record supersedes the prior closure and is the final reusable Sales Order UI
  reference without changing the Blueprint or module authority.
- `docs/orders/MASTER.md` §0.1 owns the business/field/amendment/permission rules. Sales Portal/POS
  remains the master form contract; UI composition may not create a second commercial form or an
  operational action door.

# §6.0 · LISTING TEMPLATE — every Portal listing · OWNER RULINGS 2026-09-21 (Jess)

**Read this first for any listing.** It is the one-page current truth; the sections below it are the
detailed record and lose to this page wherever they disagree. The reference page is the Sales Orders
Register (orders MASTER §0.1). Status: APPROVED; adoption is per page and is not proof of build.

```
1  PAGE     Header 50px: page name + Jump to · alerts · help · settings only
            Toolbar: one blue create button · Search · Export · Columns
            Table · 32px footer. Nothing above the table (no KPI cards)
2  COLUMNS  Order = the module MASTER's owner-approved list, never guessed
            Record date(s) first, then the document number
            The document number pins left and opens the record
            Another document's number opens that document
3  WORDS    Only words in COPY-STANDARD
            A required fact prints no absence word (empty = system error)
            A document not made yet: No PO yet · No DO yet
            Loading · Could not be loaded + Try again · empty — never mixed
4  WIDTH    Only from REGISTER_FIELD_WIDTH. A missing field is added there
5  ROW      A one-line listing row is 40px (aligned with SO Batch Purchase)
            Text 13px / 18px line (text-body) · 11px top and bottom
            8px left and right in every cell · 1px lines between cells
            Header 36px, 11px/600 (text-label) · footer 32px · 8px gaps
            Second fact in a cell (where approved): 11px grey (slate-11)
            One line per cell. A long value ends in … and shows whole on
            hover and focus; the column can be widened. Dates and numbers
            never cut. The row never grows
            Own approved designs, not this rule: SO Batch Purchase ·
            Manual Purchase · Payment Monitor · Delivery Monitor
6  HEADER   11px/600 grey band · the same simple filter icon on every column
            Sort = a 12px arrow icon (ArrowUp / ArrowDown) in the header ink,
            never a letter; its direction is spoken to a screen reader
7  EXPAND   ▸ opens a child table · 1px line from ▸ to a bordered child box
            Item = product name on line 1, configuration on line 2
8  GROUPS   Only where the module MASTER approves them. Sales Orders: flat
9  FILTER   Active conditions shown · one Clear filters · footer {n} of {m}
10 SELECT   Ticking replaces the toolbar; no buttons inside rows
11 PHONE    The document number is visible on first screen; the table
            scrolls itself; the page never scrolls sideways
12 CHECK    1440 / 1180 / 820 / 390 · 200% zoom · keyboard
```

**Row height ruling (Jess, 2026-09-21).** 40px is the target for a one-line listing. It is adopted PAGE BY
PAGE through the page's own `rowHeight={40}`; the engine default (`--grid-row-h`, 38px) is NOT changed, so
no other page moves until its own round. First adopter: Sales Orders (Card 12, NOT BUILT). The four pages
named in rule 5 keep their own approved row design.

# §6.7 · THE REGISTER SHELL — OWNER RULING 2026-08-15 (Jess) · APPROVED / LOCKED

### Shared listing standard — APPROVED / NOT BUILT, staged adoption (Jess, 2026-09-16)

The common interaction standard applies across modules; initial adoption covers Sales Orders,
SO Batch Purchase, Manual Purchase and Purchase Orders. It does not redefine module business
facts, permissions, complete-record populations or task ownership.

1. **Search and filters.** Show active conditions and `Clear filters` whenever search, rail or
   header filters narrow the list. Clear all three together; preserve permissions and the
   page's governed base population. Footer shows filtered versus total records (`5 of 62`).
   Grouping/collapse is presentation, not a filter, and does not reduce the total.
2. **Date and identity — APPROVED / NOT BUILT (Jess, 2026-09-17).** Every listing begins
   with its own record date, then its document number/business identity. Canvas ≥768px pins
   both; narrower canvas pins only identity. Neither may be hidden or reordered away by personal
   layout changes. Identity opens the object. Mappings: Sales Orders `Proceed Date · SO Doc Date · SO No` (owner ruling 2026-09-21, orders MASTER; BUILT Card 12 — `Proceed Date` rides `leadingColumns.before`, `SO Doc Date · SO No` pin at ≥768px, and below 768px the page passes `SO No` alone so it leads on first paint);
   SO Batch `Proceed Date · SO No`; Manual Purchase `Proceed Date · MPR No` (Purchasing §9.2); Purchase Orders `PO Date · PO No`; Receiving `GRN Date · GRN No`;
   Delivery Orders `DO Date · DO No`; Payment Records `Paid date · Receipt No`.
   **Supplier Claims is the one owner-approved exception (Jess, 2026-09-18):** its confirmed order
   is `☐ · ▸ · Claim status · Supplier Claim No · Claim Reported · …`, so status leads, identity is
   second and the date is third. It pins the two leading controls plus `Claim status` and
   `Supplier Claim No` at a ≥768px canvas, and `Supplier Claim No` alone below it; its date is
   never pinned. The shipped `leadingColumns` capability forces `date · identity` to lead and
   therefore cannot express this page — Supplier Claims does not adopt it as built, and the engine
   needs a pinned-prefix that takes a page's own leading columns (Purchasing §9.5). Do not
   "restore" the date-first pair there.
   Other listings use their governed record date and identity, without inventing date facts.
   PO Date is the PO issue/document date represented in its number, not the sent-mark date.
   GRN Date is record creation; physical `Goods Received Date` is its own Receiving column (owner
   ruling 2026-09-18). Full per-page column orders live in the module MASTERs (Purchasing §9.1–9.5);
   exact owner-approved page orders must not be rearranged by a general ordering heuristic.
   Purchasing labels are owned by [COPY-STANDARD: Purchasing UI dictionary](../COPY-STANDARD.md#purchasing-ui-dictionary).
   DO Date is the DO issue date. Use authoritative stored facts; never invent a missing date.
   **Engine — BUILT 2026-09-17:** `DataGrid leadingColumns={{ date, identity }}` (opt-in) forces
   the pair to lead whatever a saved layout or a drag says, removes them from the Columns chooser
   (disabled), the header `Hide column` / `Pin left` menu and drag, and pins both at a ≥768px
   canvas, identity alone below it. It replaces `stickyIdentity` on the page that sets it.
   **Adopted:** Sales Orders (layout key v5), SO Batch (v6), Manual Purchase (v6) — PR #1411,
   merge `5b61f7fa`, live in production from `c6d8706e` (all five surfaces verified 2026-09-17
   10:13 UTC; the ERP bundle carries the three layout keys). Purchase Orders adopts it in the PO
   round (`PO Date · PO No`). Every other Register is unchanged until its own round. **Owed:** the
   authenticated production walk of all four listings.
   **Grouped listings: the header is group-local (§6.10, owner ruling 2026-09-18).** A Register
   with governed groups draws no header above all groups; each open group carries its own between
   its heading and its records, sticky inside that group only. The pinning rule above is unchanged.
3. **Useful default view.** At 1440px with filters open, identity and facts needed for the main
   judgement must be fully visible. Measure in the actual portal shell/font. Other columns may
   scroll or be offered in Columns; do not squeeze dates/names or silently hide approved facts.
4. **Personal columns — APPROVED (Jess, 2026-09-17) · BUILT 2026-09-17, PO pilot only.**
   Engine: `DataGrid personalLayouts={{ layouts, limit, onSave, onSetDefault }}` (opt-in; the
   page owns storage, the engine owns the shape `DataGridSavedLayout = order · hidden · widths ·
   sort`). The seven actions sit above the column list in that order; `Save layout as…` asks for a
   `Layout name`; the person's default applies once when their layouts arrive; `Reset columns`
   also clears the header sort; `Best fit` sizes each visible column to its longest cell text and
   its full header; `Collapse all` never closes an always-open group. Storage: migration 0528
   (Purchasing MASTER §9.3). DataGrid provides an
   opt-in capability; only Purchase Orders enables the pilot, in its implementation round.
   Columns offers show/hide, `Save layout as…` (name), `Load layout`, `Set as my default`,
   `Reset columns`, `Best fit`, `Expand all` and `Collapse all`.
   Save per signed-in user, up to 10 layouts per listing; enforce ownership on reads and writes.
   Persist column order, widths, visibility and sort only. Never persist search, filters or group
   open/closed state in a layout. Personal layouts never alter company defaults or another user's
   view. Reset columns restores the company layout, leaving search, filters and records unchanged.
   Date and identity cannot be hidden or moved from their leading positions; responsive pinning
   follows rule 2 (both ≥768px, identity alone below768px). Expand/collapse respects mandatory-open
   group headings and does not change filtering or totals. Other pages remain unchanged until
   the owner accepts the PO pilot and authorizes rollout.
5. **Actions.** Essential actions remain discoverable on the object opened via identity.
   Right-click is a shortcut, not the sole door. Pages with batch actions replace the toolbar
   with their selection actions; do not invent batch actions on read-only registers.
6. **Presentation.** Reuse shared header, typography, palette, icons, row treatment and measured
   column-width rules. Content drives default width; full two-line headers plus controls set
   minimum width. No separate page theme to imitate the shared component. Where a governed grouped
   listing is concerned, §6.10 owns where that header is drawn.
7. **Expansion and states.** Reuse the governed expansion pattern and retain module-specific
   goods facts. Loading, failure, genuinely empty and filtered-empty states are distinct.
   Collapsed records remain in totals; missing/failed data must not imply zero or completion.
8. **Group-local headers.** The ruling, the engine and the measurement that decides the structure
   live in **§6.10** — one truth, not a second copy here. A listing round reads it there and
   writes no page-local version of it.

🟡 **FACET COUNTS ARE SPELT THREE WAYS, AND THAT IS ONE FACT WITH THREE ANSWERS — found
2026-09-20.** Purchase Orders §9.3 says a facet's number "describes the whole register, never what
another facet happens to have selected"; Purchase Returns §9.6 says counts "respect the other
active dimensions"; Supplier Claims §9.5 says they cover "the complete permitted searched/filtered
set". A register cannot obey all three, and an operator who learns one page learns the wrong thing
about the next. **The standard facet semantics are the answer, and they belong to this shared
contract, not to a page:** a count reflects every OTHER active filter and the search, and NOT the
selections inside its own group — the only reading under which a count never promises rows it
cannot deliver and never hides a row the operator could still reach. Purchasing §9.7 Repair Orders
is written to it. **Owed:** converging the three built/confirmed pages, each in its own round; no
page reaches into another's. *Falsifier: a measured operator journey in which whole-register counts
read truer than filtered ones — then this contract changes once, here, and every page follows.*

9. **Narrow canvas.** Filters use an overlay when they would consume usable content space.
   Tables may scroll inside their container. Inputs, Back/Cancel and submit remain usable;
   overlap or off-screen submission is not an accepted mobile fallback. Card lists are deferred.

### Portal-wide listing readability — BUILT 2026-09-17 (SLICE 1) · authenticated walk OWED

**Build record (SLICE 1, 2026-09-17).** Owner-approved Jess 2026-09-17. Shared `FilterRail` style C
is the kit default (`workspace-rail.tsx`: required kit icon per group, collapse remembered per
browser under `carres.filterRail.<rail>.<group>`, chosen value derived from the group's own rows
or select, `resets` marks an `All …` row). `DataGrid` draws the slate listing surfaces on `.root`
for every grid; `palette="slate"` now means only the ticked-row selection model. Body `--background`
and `kit.canvas` are one token, #F7F8FA. `PurchasingRegister.module.css` (blue-grey theme) is
deleted. Kit `FieldError` carries the 13px error voice with icon. Evidence: seeded before/after
captures of 23 listings at 1440/390 with identical fixtures — page text changed only by approved
words and heading casing; header 5.2:1, rail title 16.4:1, rail count 5.9:1; no page scroll at
200% zoom; keyboard collapse/choose/clear verified. **SHIPPED:** PR #1426 → `8209ce8c`, deploy run
35244605132 converged ERP/POS Pages + Worker on that SHA; the served bundle carries
`--background: 220 23% 97.5%`, `carres.filterRail` and `Confirm PO sent to supplier`. Evidence branch
`evidence/slice1-listing-readability`. **OWED:** signed-in production walk of the listings.
Not changed (not listings, still carry blue-grey `#b9c9d8`): Sales Order detail palette trial
(`sales-order-detail-theme.css`) and the Manual Purchase create header (`.mp-create-header`).

This is the shared default for ALL Portal listings, not a PO visual pilot. It supersedes older
listing typography, rail appearance and blue-grey surface prescriptions in this document.
Personal saved layouts remain a separate PO-only capability; this ruling does not roll them out.

- **Rail style C:** icon plus 13px/600 slate-12 normal-case text group titles, collapsible groups with remembered
  expansion, 1px group dividers, selected value in blue at the right only when filtered; otherwise
  leave that space empty. Icons supplement labels and come from the existing kit. Each group
  remains single-choice; no new multi-select. Preserve each page's filter content and control type:
  an existing dropdown remains a dropdown inside its group. Collapse does not clear a filter.
- **Special rails:** Payment Monitor weekly plans and Warehouse schedule day lists use the same
  heading, divider and text treatment; preserve their content, date meaning and behavior.
  Sales Orders has no local filter rail; do not add one for visual consistency.
- **Text:** main 13px slate-12, weight by hierarchy; table secondary fact 11px slate-11;
  form/button helper 12px slate-11; input error/save failure 13px error color with text and icon;
  cannot-act reason 13px dark grey or warning color according to meaning. Never use slate-9 for
  meaningful text. No opacity reduction or italics for helper text. Critical states stay legible.
- **Surfaces:** white toolbar, rail, table and footer; slate-3 header, slate-11 11px/600 normal
  casing; 1px separators. One canvas token resolves to #F7F8FA. Retire blue-grey register themes
  and #F3F4F6 body background; do not copy literal colors into page styles.
- **Scope:** Sales Orders; SO Batch, Manual Purchase, Purchase Orders, Receiving, Supplier Claims;
  Delivery Monitor and Delivery Orders; Warehouse Inbound, Inventory, Outbound; Payment Monitor,
  Payment Records and every Finance listing. Other Portal listings follow this same contract.
- **Verification:** inventory all listing routes and shared/legacy/custom rails. Capture each page
  before and after at 1440/390; test long labels, keyboard expand/choose/clear, 200% zoom and actual
  contrast. Active zero-count filters remain readable and removable; unknown is not zero.
  Any unintended content/behavior change is a defect. This appearance rollout does not approve
  Receiving's pending date-filter/workflow proposals or change business permissions and arithmetic.

**Different jobs, shared interaction:** Sales Orders remains the complete customer-transaction
register governed by Orders MASTER, not a purchasing work queue. SO Batch uses `To buy` /
`No purchase needed`. Manual Purchase uses `Need approval` / `To buy` / `No purchase needed`.
Purchase Orders uses the approved groups in Purchasing MASTER §9.3: `Confirm PO sent to supplier`,
`Waiting for goods from supplier`, `Completed`, `Cancelled`, classified cancelled → completed → marked with pending goods
→ unmarked. Receiving remains a formal GRN register, not a work queue.

**Pre-WhatsApp-API evidence:** an operator sends the PDF externally, then uses `PO sent to supplier`. Recorded sending is not proof of supplier receipt/read/acceptance. Absent confirmation is
not proof that no external send happened. Completed legacy documents must not become resend work
solely because a send record is absent. Purchasing MASTER owns the full send/version contract.

**Adoption order — Jess, 2026-09-17:** merge the documentation update, then wait for PR #1419
to merge, then open a fresh Claude task with the updated Slice 1 handoff. Slice 1 covers PO copy
and Portal-wide readability, not a visual pilot. An open PR editing FilterRail, DataGrid or
register CSS is a build stop: report the overlap before implementation. Personal saved-layout
rollout remains subject to separate owner acceptance. Approval is not build/deployment evidence.


**This section overwrites every conflicting composition rule in §6.4–§6.6.** Those sections remain
the measured implementation record; where they disagree with the shape below, this one rules. The
owner's reference is Gmail: *the fixed bar carries only what is true on every page, the list carries
its own tools, and nothing that is not needed is on screen.*

```
┌────────────────────────────────────────────────────────────────────┐
│ 📋 Sales Orders                          ⌘K    🔔⁴⁸    ❓    ⚙     │  44
└────────────────────────────────────────────────────────────────────┘
     where I am                    global only: Jump to · alerts · help · settings
                                   ⌘K IS the search here. No search box on this row.
   ── 8px ──
┌────────────────────────────────────────────────────────────────────┐
│  ⊕ New Sales Order                        🔍    ⤓ Export ▾    ▥    │  45
└────────────────────────────────────────────────────────────────────┘
     make a new thing  ←                      → how I look at this page
┌─────────────────────────────────────────────────────────────────────────┐
│ ▸ │ SO No   │ SO Date     │ Requested Delivery Date │ Customer          │  36
├───┼─────────┼─────────────┼─────────────────────────┼───────────────────┤
│ ▸ │ SO-1319 │ Wed, 12 Aug │ Thu, 24 Sep 26          │ LIM KUAN YANG     │  38
│ ▸ │ SO-1318 │ Tue, 11 Aug │ Customer not sure       │ CARD-1            │  38
├───┼─────────┼─────────────┼─────────────────────────┼───────────────────┤
│ 77 orders · Mattress 66 · Bedframe 36 · Sofa 15 · Pillow 44             │  32
└─────────────────────────────────────────────────────────────────────────┘
   ── 8px ──
```

**⭐ ROW 1's 50px IS A FLOOR, NOT A CEILING — BUILT 2026-09-18, a measured defect.**
At a 390px canvas EVERY destination page scrolled sideways by 30px, which rule 8
above forbids by name. The cause was one missing rule in `ModuleHeader`: the identity span was
`shrink-0` at the governed 24px, so `SO Batch Purchase` demanded 260px beside the 144px utility
cluster inside 366px of usable width. `Jump to…` had collapsed its label under `sm` since it
shipped; the WORD had no narrow-canvas rule at all.

The word may now WRAP (`min-w-0 break-words`) and the row's 50px became `min-h-[50px]`. **Nothing
was truncated, nothing was hidden and no phone type step was invented** — a governed label is
never cut and never sits behind a tooltip, and all four global utilities stay on the row. 50px
stays EXACT at every width where the identity fits one line. Measured on all 29 real destination
words: at 1440 every one is a single line in a 51px row (50 + the rule), unchanged; at 390, 11 of
them take two lines in a 73px row and no page overflows by a single pixel. One fix in the shared
component, so all 28 destination pages carry it.

**THE SAME MEASUREMENT EXPOSED ONE IDENTITY, AND IT IS FIXED — BUILT 2026-09-19.** The wrap rule
made `Warehouse Unit detail` readable instead of page-breaking, but it also showed WHY that page
wrapped worst: its word was `{unitCode} · {sku}` — two facts in the one slot this section rules is
"one short identity, the word alone". A Unit page's destination word is the Unit. The word is now
`{unitCode}` alone, and the SKU keeps the place it already had, printed under **Product** in
Connected records beside the product name — nothing is lost from the screen, only moved out of the
identity slot.

**MEASURED ON THE REAL PAGE, not on a mock of its header** — the lesson #1475 paid for. An isolated
header box said the old word cost two lines at 390. The actual page, rendered with a real SKU in the
real font, was far worse, and the defect reached three desktop widths, not just the phone:

| canvas | old word | new word |
|---|---|---|
| 1440 | 1 line · 51px | 1 line · 51px |
| 1180 | **2 lines · 73px** | 1 line · 51px |
| 820 | **3 lines · 105px** | 1 line · 51px |
| 390 | **5 lines · 169px** | 1 line · 51px |

Page overflow is 0px throughout — the floor fix already guaranteed that; the identity is what puts
the row back on its exact 50px. This was not a presentation preference handed to the owner: §6.7
already ruled it, and the page disagreed.

**ROW 1 · DESTINATION HEADER, 50px minimum.** Left = one short identity, **the word alone** — owner ruling
2026-08-15: the icon is dropped and the word rises to the governed `text-page` (24px / 32px / 600),
which is why the row grew from 44px to 50px. 24px inside 44px leaves 5.5px above and below and the
word reads as if it is touching the rule; 50px leaves 8.5px. The module's icon still identifies it
in the sidebar, where switching happens; repeating it beside a 24px word that says the same thing
spends width on a second copy of one fact. Other module headers keep their 44px tab-strip row and
their 13px word until they migrate to this template.
Right = genuine global utilities only: `Jump to…` (⌘K) · Notifications · Help · Settings. **No
page-owned control may enter this row — ever.** Not create, not Scan, not Export, not Columns, not
Search, not View, not filters, not selection state. **No search box on this row:** `Jump to…` is the
search that belongs to every page, and a second box here would be a second global search.

**ROW 2 · WORK TOOLBAR, 45px, one row, never scrolls sideways.** Left = the one primary create
action, written in full (`⊕ New Sales Order`) — it is the page's only blue. Right = how the operator
looks at this page: Search · `Export ▾` · Columns. Nothing else lives here.

- **Register Search — owner ruling R4, 2026-09-16 (overwrites the icon-only rule for every
  Register; adoption is staged).** The TOOLBAR's available width chooses, never a device label:
  with room, a readable search box carrying its governed placeholder; narrow, a search icon that
  opens the box with the caret inside. An active query keeps the box and its `Clear search` control
  visible at every width, so a narrowed listing never looks like the whole listing. `Esc` clears
  and closes the transient box. Selection still replaces the toolbar in place (`Clear` · owner ·
  primary action first). Engine capability: `DataGrid searchPresentation="responsive"`. **Adopted
  on SO Batch Purchase first (PR #1395); every other Register keeps its current icon search until
  its own toolbar is migrated and walked — never with a page-local search component.**
- **Columns is icon-only** (`▥`). Its hover/accessible name is `Columns`.
- **Export is icon-only too** (`⤓`) — owner ruling 2026-08-15, correcting this section's first
  draft, which reserved icon-only for view controls and kept the word on the verb. The right side
  of Row 2 is a row of icons; one word inside it reads as an exception. It carries **no caret**
  either (owner ruling, same day): Gmail's toolbar icons open menus without one, and a caret bolted
  to a bare icon reads as a split button that was never split. Its hover/accessible name is
  `Export`, and the menu offers **Excel · PDF · Print**
  — three outputs, one door, never scattered across `…` or separate permanent buttons.
- **Selection changes WHAT `Export ▾` can produce, not just how many.** With no selection the
  outputs describe the LIST: Excel · PDF · Print. With rows ticked the same space also offers the
  DOCUMENTS those rows own — `Print {n} sales orders` — assembled server-side under RLS, one
  governed single-order page per order in one file, with the truthful count in the label. This is
  the 2990 batch shape (`SalesInvoicesList.tsx:400`) translated into Carres: the operator who ticks
  69 rows wants the 69 documents, not a picture of the listing. The two must never be confused, so
  they never share a word.
- **`Showroom` prints the place, not the house** — owner ruling 2026-08-15. Every showroom is ours
  and the column already says `Showroom`, so `Carres ` distinguishes nothing there and cost the
  place name its width: at 126px `Carres Maluri Cheras` clipped to `Carres Maluri C…`, hiding the
  only part that identifies the branch. Display only; documents keep the outlet's registered name.
  **`Deliver To` keeps it**, because there it is the whole point — `Carres Klang` sits beside
  `AL Sungai Buloh`, and a bare `Klang` cannot say whose warehouse it is.
- **The Excel and PDF outputs derive their cells ONCE.** A cell that says one thing on screen,
  another in Excel and a third in the PDF is the defect that shared derivation exists to prevent.
  The PDF prints the current view and carries no letterhead, terms or signature block: it is a
  listing, and it must never be mistakable for a business document.
- **Register Search and `Jump to…` are two different tools and both stay.** `⌘K` finds destinations
  and document numbers across the ERP; `🔍` finds customers, phones and items inside this page only.
  Proven live: `Kimmy` returns SO-1303 in Register Search and `No results` in `Jump to…`. Removing
  either one removes a job the other cannot do.

**THE THREE MESSAGE KINDS — and only one of them may move the table.**

```
① SELECTION — replaces Row 2 in place. Same 45px. The table does not move.

   ┌──────────────────────────────────────────────────────────────┐
   │  3 selected    Clear                    ⤓ Export ▾ (3)       │  45
   └──────────────────────────────────────────────────────────────┘

   Left = truthful count + Clear. Right = only actions valid for that exact
   selection, with the true number. A one-record action disappears rather than
   pretending to apply to many.

② WARNING — a real business blocker. A 40px band between Row 2 and the table.

   ┌──────────────────────────────────────────────────────────────┐
   │  ⚠  3 orders have never been asked for a delivery date   →   │  40
   └──────────────────────────────────────────────────────────────┘

   Appears ONLY when the fact is true; costs zero height otherwise. It may not
   become a permanent band, a KPI strip or a decoration.

③ RESULT — a toast in the fixed bottom-right tray. Never in document flow.

                                    ┌────────────────────────┐
                                    │ ✓ Exported 77 orders   │
                                    └────────────────────────┘
```

**Engine capabilities for kinds ② and the governed groups — BUILT 2026-09-17 (Manual Purchase
Round 2).** `DataGrid warning` draws kind ② between the toolbar and the table (`role="alert"`,
amber-3 fill, amber-6 rule, amber-11 ink, 40px minimum) and costs zero height while absent; Manual
Purchase's `Issue PO` refusal is its first caller. `fixedGroups[].emptyLabel` lets an always-open
group state its emptiness beside the zero (`Need approval 0 · Nothing waiting for approval`). Both
are opt-in; every other Register renders unchanged.

**A ticked checkbox may never move the table.** The 2990 reference grows a new band on selection and
pushes the rows down; at 77 rows that moves the row under the operator's cursor and the next tick
lands on the wrong order. Selection therefore replaces the toolbar in place. **Only kind ② may add
height, and only while its fact is true.**

**NO KPI PREAMBLE.** A Register is truth, not a dashboard. No card strip, no totals band and no
counters above the table; the 32px status footer carries the summary.

**THIS SHAPE IS THE TEMPLATE.** Every Register inherits Rows 1–3 and the three message kinds
unchanged. Only Row 2's page-owned controls and the columns differ.

**WAREHOUSE INBOUND / OUTBOUND — OWNER-APPROVED 2026-09-06, unified 2026-09-07.** Warehouse
navigation is `Monitor · Inbound · Inventory · Outbound`. Monitor alone is the Calendar-summary
page. Inbound AND Outbound use the shared 240px page-specific Filter Rail + remaining-width
Register in one row grammar (stock MASTER §7); no six-working-day strip, Calendar cards or
35%/65% composition. A compact date/range control is a filter only. Status, document type, Site
and search filter one shared scope — the rail counts, the rows, the footer and the export can
never describe different ranges. Exact Monitor deep links preserve date, Site ID and document
scope. Two engine capabilities exist for this grammar and are opt-in per column/page:
`wrap: true` (a completeness column wraps and the row grows — Product, Exceptions) and
`expandable.trigger` (a named data column is the ONE expansion entry — its arrow and content
are one button; no second expand control). Every other register keeps the single-line,
gutter-chevron contract byte-identical.

**APPLIED — STOCK, 2026-08-21 (`CARD-2026-08-20-stock-register`).** The Warehouse master list is the
fourth Register on this template, and the first with a LEFT FILTER RAIL beside it.

- **The rail is not a KPI preamble.** §6.7 bans a card strip, a totals band and counters ABOVE the
  table; the rail sits BESIDE it, and the 32px status footer still carries the summary. Nothing was
  added above Row 3.
- **The footer carries TWO numbers**, not one: `85 you can promise · 893 pieces you cannot`. A
  `qty > 1` record can never be reserved (migration 0366), so a single number would either hide 893
  real pieces or promise 893 that no Sales Order can name. When a Register's one summary number
  would answer two different questions, it prints both and names them.
- **Row 2 is unchanged** — Search · Export · Columns, no page-owned control in Row 1. The superseded
  On hand page put its search box and an `Import sheet` button in the destination header, which §6.7
  forbids by name; the replacement does not.
- **There is no create button.** A Unit is born when a purchase order or consignment order is
  confirmed — Purchasing's door, never Stock's — so Row 2's create slot is deliberately empty rather
  than filled with an `Add stock` control the Unit authority removed.

## §6.8 · Shared goods tables — approved SO Batch reference

**Jess, 2026-09-18 · BUILT 2026-09-18 (SO Batch Purchase only) · authenticated production walk
OWED.** SO Batch listing and stock-picker composition is the
approved reference for shared component work. Business columns remain owned by each module MASTER;
Manual Purchase capabilities are explicitly approved in Purchasing §9.2; other pages do not gain
editing or reservation powers implicitly, and this build gave none of them any.

**Engine capabilities — BUILT 2026-09-18, all four opt-in, every other Register byte-identical:**
`DataGrid leadingColumns.before` lets an owner-approved page order put a column AHEAD of the
record date and identity (§6.7 rule 2 fixes the pair's ORDER, not that they are columns one and
two); the pair still pins alone and the named column scrolls under the block like any other fact.
`DataGrid headerTone="paleBlue"` draws the MAIN header band in blue-2, so the neutral slate child
tables inside an expansion read as children — it is this reference's treatment and NOT a global
blue-header ruling. `GoodsMiniTable soBatchGoodsLayout` draws the approved seven columns, a
page-drawn `Ready Stock` cell, a per-item `detailRow`, and the §6.9 connector.
`ReadyStockTable layout="picker"` draws the approved six picker columns. **Manual Purchase's own
§9.2 build inherits these four rather than growing a second set** — the geometry and the
edit/save/cancel controls are the same; its business guards stay in Purchasing.
Use the existing DataGrid, GoodsMiniTable, controls and connector kit; do not transplant mock HTML/CSS.

- Every cell has 8px left/right padding and 1px dividers. Columns use measured content widths,
  not equal widths or stretching to fill a canvas. Same field/role shares its default width.
  Personal resizing remains supported. No global 144/160/192px type-width proposal was approved.
- Headers reserve a common two-line height, 11px/600, normal casing; main header pale blue in
  this SO Batch reference, child headers neutral slate. This is not a new global blue-header ruling.
- Main/item text 13px; configuration and Unit ID on line two 11px/slate-11. All rows in a given
  goods table use consistent two-line geometry, vertically centered checkbox and quantity.
- SO Batch has separate leading checkbox and goods disclosure controls. SO No opens the object;
  never concatenate a decorative arrow into the number. Keyboard disclosure exposes expanded state.
- Ready Stock shows available count then reserved count, with a separate borderless disclosure
  button in that cell. Saved selections have a single Change selection journey, not per-row Undo.
- The stock table combines actual PO No / Ref No and Unit ID in one cell, identity on two lines.
  It shows date only. Its six-column order and business safeguards live in Purchasing §9.1.
- The reviewed local sample uses Supplier 136px consistently and Ready Stock 136px with two-line
  counts. These are reference sample measurements, not hard-coded production limits: validate long
  names, large counts, zoom and actual fonts. Do not hide required columns at narrow widths.
- Approval covers this composition and interaction, not production readiness or a 10/10 score.
  Production must verify 1440/1180/820/390, keyboard, 200% zoom, identity visibility and safe saves.
- **Walked 2026-09-18 on the real components** (`so-batch-listing-preview`, a dev-only vite entry
  that `vite build` cannot emit): 1440 / 1180 / 820 / 390 and 200% zoom carry no page-level
  horizontal scroll; both tables take their measured content width and neither stretches to fill
  the canvas; the pinned pair is `Proceed Date · SO No` at ≥768px and `SO No` alone at 390px; the
  picker's controls are the kit's own 32px Buttons. The 390px page-level overflow this walk found
  was in the shared destination header and is fixed there — see §6.7 below.

**THE SHARED TWO-LINE LISTING ROW IS 54px — owner ruling 2026-09-18, APPROVED / NOT BUILT.** A
listing whose cells carry two-line identity or two-line goods uses one shared 54px row with
vertically centred checkbox, disclosure and quantity. It is the goods-row geometry, NOT a
portal-wide replacement: the engine's 38px single-line row (`--grid-row-h`) stays correct for
single-line registers, and existing per-page exceptions keep their own approved heights
(SO Batch 40px, Payment Monitor 72px). Short content fits 54px; long content and accessibility
needs may grow the row — **a required party, number, document or date is never ellipsised to
protect the height.** No page-local row or header height. *Falsifier: the DOM measurement owed at
build. 54px is the owner's reviewed number from the 2026-09-18 mockups; no shipped surface states
it yet, so the build measures it in the rendered shell at 1440/1180/820/390 and reports back
rather than hard-coding a number nobody checked.*

**ONE CELL MAY CARRY A DOCUMENT AND THE EXACT GOODS IT NAMES — NEVER TWO DOCUMENTS.** The stock
picker's `PO No / Ref No` with the Unit ID on line two (§9.1) is the approved shape, and Supplier
Claims reuses it exactly (`PO No` line one, Unit ID line two — Purchasing §9.5). Line one is the
document number in full and never shortened. Line two is the goods identity that document names:
one Unit ID, `{n} Units` as a disclosure link into that row's own expansion, `Counted stock` where
there is no Unit ID and never will be, or the honest absence/failure word. **Never fabricate a
Unit ID, and never put a second document's number in that cell** — a reader must never have to
guess which document a number belongs to.

**HEADER BANDS DO NOT OVERLAP AND DO NOT LEAVE BLANK BLOCKS.** Every header cell — the leading
control cells included — belongs to the one opaque header band and reserves the shared two-line
header height, so a one-word header centres instead of leaving a blank block above it. Paint order
is fixed and shared: sticky header above body cells, pinned cells above unpinned ones, pinned
header cells above both. A transparent sticky cell, a page-local z-index ladder and a page-local
header height are all defects, not page style.

**EVIDENCE CONTROLS INSIDE A ROW ARE ICON + TEXT, NEVER BUTTONS.** Beneath a row's problem text,
saved evidence is offered as compact `Photos {n}` / `Video {n}` controls: icon plus text, shared
control ink, 12px helper size, hover/focus tint only while hovered or focused, a visible focus
ring, and `aria-expanded`. No large button, no pill, no border, no permanent filled background.
Clicking expands that row's evidence directly beneath it; clicking again collapses it. Opening one
never closes another and never moves the rows above it. A count is never printed when it is
unknown.

**KIT COMPONENT REQUEST — ONE SHARED SAVED-EVIDENCE VIEWER (does not exist; APPROVED TARGET /
NOT BUILT).** Verified on 2026-09-18: `CaseEvidenceGallery.tsx` is a Service-Case list with an
append-only uploader and no zoom, drag, Previous/Next or overlay; `ClaimPhotoUploadField.tsx` is an
upload field; `SupplierClaimPanel.tsx:35` prints `Evidence: {n} photos` as text. **No viewer
exists, so one joins the kit rather than being drawn inline on Supplier Claims** (Constitution §2).
One implementation, reused by Supplier Claims, Receiving, Stock and Service Case:

- **Photos:** zoom in · zoom out · drag to pan while enlarged · `Reset` · `Previous` · `Next` ·
  `Close` · `Esc`. Closing restores focus to the control that opened it and the caller's scroll
  position and open expansion.
- **Video:** play/pause, seek, fullscreen. **Local video zoom is outside this approval.**
- **Read-only.** No uploader, no delete, no rotate-and-save. Adding evidence stays with the owning
  record and its own permission; the viewer never widens a permission.
- **File-to-Unit and file-to-event relationships stay visible**, and per-file permission is
  enforced on the server.
- **Loading, failure and retry are distinct, and MISSING is not UNREADABLE.** A file the record
  never had is absent; a file that exists but could not be read says
  `Photo {n} could not be loaded` + `Try again`. The two never render alike.
- **It is a viewer, and only a viewer.** Recording or attaching evidence stays with the owning
  record's own governed write surface. On Supplier Claims that surface is the full-width claim
  record, which is itself **APPROVED TARGET / NOT BUILT** and must reuse the existing server door
  and the existing My Work deep link rather than grow a second editor (Purchasing §9.5).

Manual Purchase uses this same composition under Purchasing §9.2 (BUILT, migration 0546): independent Status and Approval Status, parent/child purchase selection, and stock allocation only for eligible approved concrete needs. Its six-column stock picker uses the same geometry and edit/save/cancel controls; business guards stay in Purchasing, not duplicated here.

## §6.9 · Connected expansion — BUILT 2026-09-18 for SO Batch

**The connector belongs to the TABLE, because only the table knows where the `Ready Stock` column
is.** `GoodsMiniTable` draws it inside that cell, in normal flow, as one unbroken 1px rule from
beneath the disclosure caret to the TOP BORDER of the picker's frame — measured at 1440 in the
rendered portal: centred on the caret to 0.2px, 1px below it, 0px from the frame's border, and
unchanged after the goods box is scrolled horizontally. It exists only while that picker is open,
so there is structurally no line that could run into the next item. The active goods context
carries a blue boundary; the stock frame stays neutral white, and neither is evidence of a saved
reservation — what a line holds is its `{n} reserved` count and the Unit IDs in the picker.
Ready Stock is no longer a sibling SECTION of the expansion: the expansion is the goods table and
`Purchase order details`, and the retired three-section arrangement does not return.

Use the existing shared connector primitives. The SO row connects to its goods expansion.
An item's Ready Stock disclosure connects vertically from beneath its own arrow/cell to the
TOP BORDER of its stock-detail frame. The line is 1px, visibly touches its destination, moves with
the source under horizontal scrolling/resizing, and disappears when collapsed. No floating elbow,
no line into the next item or SO. The active goods context has a blue boundary; the stock detail
has a subtle bordered white frame. A context boundary is not evidence of a saved reservation.

**HOW IT IS DRAWN — BUILT 2026-09-18, after two measured failures.** The line is rendered INSIDE
the `Ready Stock` cell, hanging below it (`left: 11px; top: 100%; height: 13px` in a relatively
positioned cell), and the stock frame spans the FULL goods row so the line always lands on its top
border. Two earlier shapes were measured in the rendered shell and rejected:

- **Summing the declared column widths** was wrong by ~900px on a wide canvas. The goods box is
  `w-full table-fixed` with a `minWidth`, so a canvas wider than that minimum STRETCHES the columns
  and the sum stops describing where anything is.
- **Anchoring the frame at the `Ready Stock` column** put it beyond the fold whenever the goods box
  scrolled sideways: pressing the disclosure gave a 300px white hole with the Units off-screen.

Verified at 1440/1180/820/390px: the line starts within the cell's own bounds and touches the
frame's top border at every width. **A connector may never be positioned by arithmetic over
declared widths** — the table that placed the cell is the only thing that knows where it is.
Other modules keep their existing business sections; do not recreate the retired three-sibling-section
SO Batch arrangement. Use one component implementation, not page-local connector drawings.

**THE ROW-TO-EXPANSION LINE STARTS AT THE CARET — BUILT 2026-09-21 (engine, Card 12 review).** The
SO-row connector used to be drawn by `ConnectedSections` inside the expansion cell at a fixed 10px,
which is not where the `▸` is: measured on SO Batch and Sales Orders alike, it began 26px right of
the caret and ~22px below it. Only the grid knows its caret cell, so the grid now draws the part
that starts there, positioned by CSS at 50% of that cell and never by arithmetic over widths:
the **drop** from beneath the caret to the row's edge (in the caret cell), the **curve** down the
same column to the join height and across to the expansion edge (in the expansion's caret-column
gutter cell, pinned with the caret so the line holds under a sideways scroll), and
`ConnectedSections` carries it as a flat **run** to its first child, later sections keeping their
own elbows on the stack's trunk. The join height is stated: `EXPANSION_JOIN_Y` = 21px (8px air plus
the 13px middle of a ruled header). It applies to a **flush** expansion holding `ConnectedSections`
(SO Batch; Sales Orders with Card 12). A padded or viewport-fitted one (the Delivery Monitor brief,
whose multi-leg route block sits above its panels) keeps the stack's own first elbow, and a plain
child table gets nothing — their DOM is unchanged. Measured at 1440 on SO Batch: the drop is centred
on the caret (x 293.5) and starts at its bottom edge; drop, curve and run are continuous; unchanged
after a 200px sideways scroll. 🟡 SO Batch's goods header is 40px, so the line meets it 8px above
its middle (inside the band, as before); passing `connectAt` 20px there is Purchasing's one-line
follow-up.

**ONE EXPANDED STATE PER ROW, AND A SECOND DOOR IS NOT A SECOND PANEL.** A row-leading disclosure
and an in-cell disclosure (SO Batch's Ready Stock count, Supplier Claims' `{n} Units` link) may
both exist; they open and close the SAME expansion, and the in-cell one additionally moves focus to
the part it names. Inside an expansion, a per-item evidence disclosure is its own independent
open/closed state beneath that item — it never collapses a sibling and never reflows the rows
above it.

# §7 · Approved Evolution

| What | Why it is not built |
|---|---|
| **The flame repoint — `--primary` to blue, 594 sites** | Approved. **It cannot be proved by checksum**, so it needs its own card AND a visual approval. |
| **`base-*` → the kit palette, 4,661 sites** | Approved. Ten steps into six, so it rolls out **page by page with the page migrations, never globally.** |
| **Real pages rendering through `PageShell` / `DataTable` / `DetailShell`** | Approved. Components-only was the ruling, not a shortfall. The order drawer specifically is BLOCKED: L4 needs a persistent-facts 4-tuple that does not exist on it, and creating one reverses a frozen ruling. |
| **A picker inside a dialog renders UNDER it** | A real P1 defect, scoped and approved, not yet built. |
| **Splitting the grid's `layout` prop** | `resize` and `reorder` arrive through ONE prop, so **no page can justify one power without the other.** The day a page wants one and not the other, this is the kit's card. |
| **Layout memory** | Refused as a kit-wide default. Browser layout keys stay per page. Server-side personal saved layouts exist only on Purchase Orders (§6.7 rule 4, BUILT 2026-09-17); rollout to other listings waits for owner acceptance of that pilot. |


### Shared Purchasing geometry — owner-approved consolidation, 2026-09-18

One registry governs SO Batch, Manual Purchase and Purchase Orders. Existing page-local widths
must converge; approval of this contract does not claim the three pages are already built or
production-verified. Other Registers inherit the shared padding, typography and sticky-header
behaviour, not Purchasing business fields or page-specific colours.

| Geometry | Shared value / behaviour |
|---|---|
| Cell horizontal padding | 8px per side; adjacent content separated by 16px plus divider |
| Dividers / connector | 1px |
| Header | 36px minimum, two 14px lines; 4px vertical padding; 11px/600 |
| Single-line parent row | 38px minimum, existing density law |
| Two-line goods / Unit rows | 54px minimum, shared across the same table; grow together if content requires |
| Main / secondary type | 13px / 18px line height; 11px / 14px secondary |
| Standard control | 32px minimum; checkbox 16px, vertically centred |
| Toolbar / footer | 45px / 32px minimum |
| Expansion | 12px above, 16px below; begins after the parent's control gutter |
| Sticky header | Each Register keeps its header inside its own scrolling viewport; on a grouped listing it is group-local per §6.10, and the groups share one width/visibility/sort/resize set |
| Pinned identity | Date + number at canvas >=768px; number only below; headers and cells scroll together |

**THE FIELD-WIDTH REGISTRY — ONE NUMBER PER FIELD (owner instruction 2026-09-18).**

A page MASTER may not carry its own width for a registry field. When it does, one fact ends up
with four widths — measured, this is exactly what had happened: `PO No` was 144 on SO Batch, 144 on
Manual Purchase and 170 here, and a date was 120 / 112 / 118. So the number lives here, once, and a
page MASTER records its MEASUREMENT as evidence the registry reads (Purchasing §9.1 R7, §9.2, §9.3).

**The registry number is the WIDEST measured requirement across the pages that show the field**,
because a field that fits on one page and clips on another is not one field. `MEASURED` means the
rendered portal in the real font; `prototype` means not yet measured, and a prototype that clips a
governed value is wrong — **fix the shared field definition, never squeeze the cell** (Law 2:
reality outranks the document). Validate actual fonts, longest values, 200% zoom and
1440/1180/820/390 before production. Required numbers never truncate; content may wrap, and user
resizing remains available.

| Field / role | Width | Status | Evidence, and the convergence owed |
|---|---:|---|---|
| Checkbox / disclosure (each) | 40 | prototype | |
| Date (short date) | 120 | **MEASURED** | SO Batch: cross-year date 99px → 120. PO built 118 → widened to 120 (2026-09-18). **Owed:** Manual Purchase built 112 |
| PO No / MPR No / GRN No | 170 | **MEASURED** | PO: `PO-20260903-4316` renders 125px in production's JetBrains Mono, and 142 cut 34 live rows. **Owed:** SO Batch and Manual Purchase built 144 off a 127px Inter measurement — the mono face is the wider one |
| SO No | 90 | **MEASURED** | Sales Orders, 2026-09-21: `SO-1334` 54.6px + 16; the header and its controls set the floor |
| SO No / MPR No mixed reference | 176 | **MEASURED** | PO, built 2026-09-18 |
| Status | 144 | prototype | |
| Approval Status | 188 | **MEASURED** | Manual Purchase: `Sent back for changes` pill 134px + requester avatar |
| PO Safety Days | 110 | prototype | |
| Order By | 112 | **MEASURED** | Manual Purchase |
| Category (parent) | 112 | prototype | |
| Qty | 64 | **MEASURED** | header floor 24px + 16 |
| Item / Items | 208 | **MEASURED** | PO, built 2026-09-18. **Owed:** Manual Purchase built 180 |
| Supplier / Ready Stock | 140 | **MEASURED** | Manual Purchase: longest live supplier 17 characters. PO built 136 → widened to 140 (2026-09-18) |
| Supplier Deliver To | 150 | **MEASURED** | PO, built 2026-09-18. **Owed:** Manual Purchase built 132 |
| Customer | 150 | prototype | Sales Orders shows it one line; a longer name ends in `…` and opens whole |
| Sales Location | 168 | **MEASURED** | Sales Orders, 2026-09-22: `Carres Kota Damansara` (longest live, printed in full as on the SO PDF) 145.4px + 16 = 161.4 |
| Salesperson | 120 | **MEASURED** | Sales Orders, 2026-09-22: `Khoo Aik Yean` (longest live) 89.2px + 16; the header word plus its filter icon (103px) is the floor |
| Sales Orders optional catalog: amount 116 · party name 150 · reference 150 · phone 132 · email 200 · address 240 · place word 140 · short fact 96 · small count 120 | — | prototype | Sales Orders, 2026-09-21: the hidden-by-default catalog columns take a registry role instead of a typed number. **Owed:** measurement when a page shows one by default |
| Customer Delivery Location | 176 | prototype | |
| Customer Requested Delivery Date | 180 | prototype | **Owed:** SO Batch built 144 off `No delivery date yet` 124px; re-measure against the longest governed absence |
| PO Delivery Date | 150 | **MEASURED** | PO column width, built 2026-09-18. Single-PO wording: `PO {n}-Day Delivery Date`; n is the recorded Settings working-day value, no transit added. Calculation correction APPROVED / NOT BUILT; Purchasing §5.7 and COPY own the rule. |
| Supplier Confirmed Delivery Date | 180 | **MEASURED** | PO, built 2026-09-18, holding `Not confirmed` and the `Supplier changed from {date}` second line |
| Goods Received Date | 140 | **MEASURED** | PO, built 2026-09-18, holding `{n} receipt dates` and the `Time not recorded` second line |
| Purpose | 150 | **MEASURED** | Manual Purchase |
| Requested By | 144 | prototype | **Owed:** Manual Purchase built 124 |
| Stock Location | 160 | prototype | |
| Unit ID standalone | 140 | prototype | |
| Condition | 120 | prototype | |
| PO Version with send evidence | 265 | **MEASURED** | PO, 2026-09-18, correcting the prototype 238: `PO sent to supplier · WhatsApp · Wed, 28 Sep` needs 247px of content at the 11px second line and 238 clipped it |
| SO No / MPR No / CO No / RO No | 176 | prototype | Receiving, 2026-09-18. The FOUR-way header wraps inside the shared two-line header height, so the header does not set the width; the CONTENT does, and it is the same 17-character document number as the two-way entry above. Several references stack as lines in the cell and never widen it. **Owed:** the rendered-portal measurement |
| Goods arrived at | 150 | prototype | Receiving, 2026-09-18. A receiving SITE name — deliberately NOT `Stock Location` (160), which names a stock position; §9.4 keeps the two facts apart. Same class of value as `Supplier Deliver To`, so the same number. **Owed:** the rendered-portal measurement against the longest live site name |
| Received Qty · Damaged Qty · Wrong Item Qty · Extra Qty | 112 | prototype | Receiving, 2026-09-18. Four adjacent quantity columns read as ONE family and share one width. The `Qty` role's 64 cannot hold them: their headers are two lines and the widest first line, `Wrong Item`, is about 63px at 11px/600 before the sort and filter affordances the engine draws beside it. **Owed:** the rendered-portal measurement |
| Supplier DO No | 150 | prototype | Receiving, 2026-09-18. The SUPPLIER's own reference, which obeys no Carres format and has no upper bound the registry can prove; a longer one wraps rather than truncating. **Owed:** the rendered-portal measurement against the longest live DO number |
| RO No | 170 | prototype | Repair Orders, 2026-09-20. Same 16-character `PREFIX-YYYYMMDD-RRRR` shape as `PO No` / `GRN No`, which the mono face measured at 170; it shares that number rather than inventing one. **Owed:** the rendered-portal measurement |
| Supplier Claim No | 150 | prototype | Repair Orders, 2026-09-20, reading §9.5's measurement of `SC-20260916-0007` at 122.8px of text plus header chrome. **Owed:** the rendered-portal measurement on a page that actually ships the column |
| Cost Responsibility | 144 | prototype | Repair Orders, 2026-09-20. Holds `Supplier pays` and the governed absence `Not decided`. It is a responsibility WORD, never an amount — no money field joins this registry through it |

**THE GOODS TABLE IS THE SECOND SCOPE OF THE SAME REGISTRY**, because the same fact carries
different content there: a parent `Supplier Deliver To` cell holds one destination name, while the
child cell holds a destination list with counts (`AL Sungai Buloh ×10`, measured 200). The child
numbers live in `GoodsMiniTable`'s `CHILD_COLUMNS` — ONE implementation, so the three pages cannot
drift — and measure Category 132 · Unit ID 140 · Deliver To 200 · SKU 152 · Qty 64 · Supplier 140 ·
`PO No / Unit ID` 230 · Item flexible, floor 220. Exactly one column in a goods table is flexible
and it is always last.

**Owed convergence is a page's own round, not another page's card.** A card that is building one
page corrects the registry with what it measured and names the divergence here; it does not reach
into a page it was not asked to build.

**AND THE REGISTRY IS CODE — BUILT 2026-09-18 (Receiving, PURCHASING CARD 12).** A table nobody
imports is a table the pages drift from, so the parent-scope numbers above live in one module the
registers read: `apps/web/src/components/register/register-field-widths.ts`. A page passes
`REGISTER_FIELD_WIDTH.poNo`, never `168`, which is what makes the next divergence a one-line
change instead of an audit. The goods table's second scope stays in `GoodsMiniTable`'s
`CHILD_COLUMNS`, unchanged. Receiving is the first page wired to it; the owed convergence of
SO Batch, Manual Purchase and Purchase Orders remains each page's own round.

PO rail section titles use the shared 16px Icon, Lucide stroke 2, inherited neutral colour and an 8px text gap: Supplier reply → message; Receiving → goods; Supplier → supplier; Supplier Deliver To → warehouse (the current Site destination filter). Keep the full visible label; icons are supplementary and aria-hidden when text already names the section. Do not add decorative icons to every filter row.

Repeat no page title inside the toolbar. PO's rail has no Clear filters button (owner correction);
clicking a selected facet again clears that facet. Selects retain their All option. The shared
active-filter toolbar behaviour is unchanged. PO expansion gains real line-bound Unit IDs under
Purchasing §9.3; quantity-managed lines have none. Do not infer new selection capabilities.

## §6.10 · GROUP-LOCAL HEADERS — OWNER RULING, Jess 2026-09-18 · BUILT 2026-09-18 (#1462)

**This ruling SUPERSEDES the earlier single global header above all groups.** A governed grouped
listing reads, per group:

```
collapsed   heading + count
expanded    heading  →  column header  →  records
```

There is no header above all groups. A collapsed group is its heading and its count and nothing
else — a column header over no records names columns nobody is reading. The current group's header
stays sticky within its own group and **stops at that group's boundary**; it never stands over the
next group's rows. Pinned identity is preserved: date + number at a canvas ≥768px, number only
below it.

**Every group shares one setting, not four copies of it:** the same column widths, the same
visibility, the same sorting and the same resizing. Sorting from any group's header sorts the whole
register once.

**It is the ENGINE's behaviour, implemented once** (`components/register/DataGrid`), for every
Register that hands the grid governed `fixedGroups` — today SO Batch Purchase, Manual Purchase and
Purchase Orders. **No page gains or loses a group, a default expansion, a collapse default or a
business rule by it.** A flat register keeps the one sticky header it has always had. The embedded
drill-down grid keeps its plain static header: it has no scroll container of its own for anything
to stick to.

**HOW, AND WHY IT IS STRUCTURAL — measured 2026-09-18.** Each group is its own `<table>` inside the
one scroll container, its heading and its column header riding together in that table's `<thead>`.
A sticky cell is constrained by the table it is in, so the header is pushed out with its own group
at the boundary and the next group's takes the top. **One `<tbody>` per group does not work and was
measured failing:** a table cell's containing block is the TABLE, so the first group's header
escaped its section and came to rest on top of the second group's own header, both drawn at once
6px apart (Chromium). The tables share one `<colgroup>` built from one `layout.widths` and use
`table-layout: fixed`, so a long value in one group cannot widen a column in that group alone —
which is what makes "every group shares the same widths" true by construction rather than by
agreement.

**Measured on the rendered Purchase Orders register, 2026-09-18:** the first group's header pinned
at 40px while its rows scrolled 573px beneath it, then was pushed to −32px as its table bottom
passed 4px, with the second group's header taking the top at 40px. No `<thead>` above all groups at
1440 / 1180 / 820 / 390.

**Falsifier:** a browser in which a sticky `<thead>` is not constrained by its own table, or a
grouped listing whose groups drift out of column alignment, overturns the structure — not the
ruling, which is about what the operator reads.

**Repair Orders date and identity presentation — owner correction 2026-09-20; target, not built.**
Purchasing §9.7 owns date semantics: read-only automatic RO Doc Date, no backdating; an automatic
Carres target of 14 working days from evidenced Supplier receipt of the RO; a separate attributed
Supplier return-date reply. Do not add an editable blank target date. Use existing form controls
and history patterns; sending is not Supplier receipt. The governed calendar is not yet verified.
For RO `PO No / Unit ID`, show all actual Unit IDs beneath their PO directly, not `{n} Units`.
Allow the row to grow to fit these identities rather than clipping to the default two-line height.
Items exposes a discoverable detail action; its exact review surface is not yet approved.

**Repair Orders price placement — owner-confirmed 2026-09-19; APPROVED TARGET / NOT BUILT.**
Purchasing §9.7 permits optional `Price` in RO creation/detail only. No price, quotation-amount,
Finance, Credit, Payment or Work column is added to its register. Missing price/financial approval
is not a placement/Issue blocker. This scoped placement ruling does not approve the remaining RO
column sequence, rail wording, prototype or full UI, and changes no other register's composition.

**Repair Orders owner-consent placement — owner ruling B, 2026-09-19; APPROVED TARGET / NOT BUILT.**
Purchasing §9.7 permits Issue while non-Carres owner consent is outstanding. Show the unresolved
fact and evidence in RO detail and its follow-up in the existing Workspace projection; do not
disable Issue solely for missing consent or add a second repair task list. This ruling adds no
financial/Work register column and does not approve the remaining RO prototype layout.
