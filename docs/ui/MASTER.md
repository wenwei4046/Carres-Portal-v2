# UI — MASTER

> **The one shared UI/UX authority.** It holds ONE current truth, is overwritten when re-ruled and
> is never versioned; Git is the history. Start with `CLAUDE.md` (the Constitution and its ERP PLAN
> CHAT START PROTOCOL); this file is the UI law under it. Owner instruction 2026-10-05 (Jess):
> *"delete all old confused part and use the current we confirmed"* — every new chat reads this file
> and follows the current shared UI/UX without Jess re-teaching it.

**One home per thing — this MASTER links, it never copies:**

| Thing | Its one home |
|---|---|
| Numbers: type, colour, spacing, radius, icons, component and template measurements | [`../01-design-tokens.md`](../01-design-tokens.md) (§7 is the measurement lookup) |
| Component API, use and states | [`../02-components.md`](../02-components.md) · `apps/web/src/components/kit/` · live `/ui` |
| Page-pattern examples (Register, Object, Task, Form, Card, Batch, Settings) | [`../03-page-patterns.md`](../03-page-patterns.md) |
| Every visible word | [`../COPY-STANDARD.md`](../COPY-STANDARD.md) |
| The compact module card's rules (the Working Panel's card contract) | [`../ui-reference/MODULE-CARD-TEMPLATE.md`](../ui-reference/MODULE-CARD-TEMPLATE.md) |
| Module column orders, business facts, permissions and write doors | each module MASTER |
| Printed documents | [`../pdf/DOCUMENT-KIT.md`](../pdf/DOCUMENT-KIT.md) |
| Reference research (FACT, binds nobody) | [`../research/houzs-ui-reference.md`](../research/houzs-ui-reference.md) · [`../research/grid-findings.md`](../research/grid-findings.md) |
| Shared page flow, shared contracts, exceptions and the status of every shared capability | **this MASTER** |

**Law order:** Business Rules → Information Architecture → Design System → Implementation; on a
conflict Business wins. Token VALUES and component internals are LOCKED. Composition inside the
admitted templates is the chat's job. A missing component or template capability is a **KIT GAP**:
it joins the kit once, with its `/ui` example, and every page gets it — never a page-local copy.
A rule that exists only as documentation is temporary: it should become a type, a lint rule or a
failing test.

**Status words used in this file:** `APPROVED / LOCKED` (owner ruling, in force) ·
`APPROVED TARGET / NOT BUILT` · `BUILT` (merged code) · `DEPLOYED` (merged and released) ·
`PRODUCTION VERIFIED` (authenticated production evidence recorded) · `PROPOSAL / NOT LAW` ·
`REAL GAP` (no answer, or two current answers conflict) · `KIT GAP` (the kit lacks it). Approved is
not built; built is not verified; one page verified is not every page adopted.

---

# §0 · Current kit index — read this first

**One row per thing on screen; one current source per row.** If something is not in this table it is
not a current pattern: do not copy it from a neighbouring page. Live examples are on `/ui`.

| Area | Use this | Source | Status |
|---|---|---|---|
| Tokens: type · colour · radius · icons · layers | Tailwind token classes; `Icon`; `overlay-layer` | `01-design-tokens.md`, `tailwind.config.ts`, `components/kit/Icon.tsx` | LOCKED · built |
| Page frame | `ListPageShell` today; kit `PageShell` is the target | `components/ListPageShell.tsx` · `components/kit/PageShell.tsx` | Moving a page onto `PageShell` re-lays it out: owner preview first |
| Destination header + global utilities | `ModuleHeader` + `GlobalTopBar` | `pages/operation/components/` | §4 · built |
| Portal navigation | `PortalSidebar` + `portal-nav` | `pages/portal/` | §4.2 · built |
| Left mission rail | `FilterRail` family + `useFilterRailOpen` + the Sales Orders `.so-template-rail` composition | `pages/operation/components/workspace-rail.tsx` · `SalesOrdersRegister.tsx` | §6.1 · rail recipe built; mission rule APPROVED TARGET 2026-10-05; complete composition not yet extracted to the kit (KIT GAP) |
| Register / listing | `register/DataGrid` | `components/register/DataGrid.tsx` | §6.0 · §6.2 · SO-derived template owner accepted 2026-10-01 · built; adoption per page |
| Goods expansion | `GoodsMiniTable` + connector | `pages/operation/components/GoodsMiniTable.tsx` · `ConnectedSections.tsx` | §6.9 · built |
| Simple and document tables | `DataTable` · `DocumentTable` · `TotalsSummary` · `TableScroller` | `components/kit/*` · `components/TableScroller.tsx` | §3 · built |
| **Compact module card** (the right Working Panel: identity header, Info and module tabs, module summary, editors, Items, Communication, Timeline) | **`CompactModuleCard`** in kit `Drawer variant="compact-card"` — pass the header facts once and each module's own facts, editors and items | `components/kit/CompactModuleCard.tsx` · `/ui#compact-card` · contract `docs/ui-reference/MODULE-CARD-TEMPLATE.md` | §4.3 · shared component built · Sales Orders adoption PRODUCTION VERIFIED 2026-10-05 (PR #1893/#1896/#1897, `2ce91e2d`) · other modules per §4.3 table |
| Object header + tabs | `SalesOrderTabs` recipe | `pages/operation/SalesOrderTabs.tsx` | §4.1 · accepted; page-owned — no generic ObjectHeader/ObjectPage kit API (KIT GAP) |
| Object facts | `Block` — the one card · `Panel` · `StatusPill` · `EmptyState` · `Loading` | `components/kit/*` | LOCKED · built |
| Forms | `Input` · `Textarea` · `Select` · `SearchInput` · `Checkbox` · `DatePicker` · `FieldFrame` | `components/kit/*`, `field-recipe.ts` | LOCKED · built |
| Buttons and menus | `Button` · `DropdownMenu` · `Popover` · `Tooltip` · `Tabs` (segmented Table/Cards) | `components/kit/*` | LOCKED · built |
| Dialogs, documents and evidence | `Modal` · `Drawer` · `Toast` · `PdfPreview` + `PdfPreviewHeader` · `SavedEvidenceViewer` | `components/kit/*` | §4.4 · built |
| Work route pieces | `RouteStop` · `ChecklistRow` · `QuietRouteRow` | `components/kit/*` | §3 · built 2026-09-28 |
| Orders list / drawer band | `SectionPanel` (cream band) — that surface only, not a general card | `components/SectionPanel.tsx` | Not a `Block` duplicate |
| Work right-panel Communication | `WorkCommunication` — recorded channels only | `pages/operation/work/WorkCommunication.tsx` | Built; differs from the card's editable `To` (§7.2) |
| Record history | §5.2 three-rank grammar | this MASTER | LOCKED · no shared component; each page draws it |

**Retired — do not import; a test blocks new use** (`components/retired-components.test.ts`): `Btn`
(→ `Button`), `Field` (→ kit inputs / `field-recipe`), `PageHeader` (→ `PageShell`). Their remaining
pages move only after the owner approves a before/after preview, because each swap changes what the
operator sees. The `carres-design` skill, the old `ui-reference/` mocks and the Delivery-only card
reference are deleted; `docs/ui-reference/` holds only the compact-card contract, its reference page
and its parity measurements.

## §0.1 · Page anatomy — the table of contents

**Not every module has, or must show, all six parts.** A module shows the parts its job needs; a part
it does not use is stated as not applicable, with the reason, never treated as a defect or invented.

| Part | Its job | Where the law is |
|---|---|---|
| **Shell** | where am I · global tools · navigation · quick reference | §4 header, toolbar rows, Settings, Jump to, toasts · §4.2 portal navigation · §5 right Quick Rail |
| **Left mission rail** | what work needs doing here; scope the records | §6.1 |
| **Listing** | find and compare records | §6.0 one-page template · §6.2 capabilities · §6.3 Columns and cross-module facts · §6.4–§6.11 detail |
| **Working Panel** | do the record's work without leaving the list | §4.3 + the card contract |
| **Object page** | the full record: View, deliberate Edit, Revisions, History, Route | §4.1 |
| **Document preview** | the document the other party receives | §4.4 |
| **One UX contract** | words, states, feedback, keyboard, narrow screens, acceptance | §2.1 · §2.2 · §5.1 · §5.2 |

## §0.2 · Shared module page flow — owner ruling 2026-10-05 · APPROVED TARGET

Jess: the left rail shows the mission, not a reproduction of the table; every module uses the same
table listing with different columns; every module uses the shared right Working Panel, with different
module tabs and the Info structure retained as in Sales Order. Warehouse work uses a `Warehouse` tab.
(Persisted by PR #1918, `1b43419e7`.)

```
module entry → left mission rail → one shared listing → right Working Panel (Info + module tab;
             opens on the current page's own main work tab)
             → the module's action and result → return to the list with its context retained
```

- **Left mission rail** (§6.1): tells the operator what work needs doing from source-owned task or
  mission facts. It is not a copy of listing columns and not a summary of whatever the table loaded.
  It may scope the records through governed navigation or filtering. Reuse the existing source and
  resolver authority; never a second task engine, ownership resolver or completion counter.
- **Listing** (§6.0, §6.2): one shared DataGrid and one interaction contract. Modules differ by record
  grain, default columns, optional columns, data, business filters, permissions and actions — never
  by a module-local grid or an invented layout.
- **Right Working Panel** (§4.3): the shared Sales Order-derived `CompactModuleCard`. Keep its Info
  structure and interaction grammar; add the module's own tab with source-owned facts and actions.
  The panel opens on the current page's own main work tab (owner 2026-10-05, §4.3.1).
  Never fabricate Sales Order or customer facts for a record whose source has none. Reusing the
  structure never transfers write ownership.
- **Completing work:** the module's authorised work happens in its tab, with the existing approved
  editors, preview and save/result interactions. Preserve source identity, exact goods/document
  scope, permissions, saved-versus-draft and the list's return context.
- **The Working Panel never replaces** the full object page (§4.1), its read-first View, its
  deliberate Edit, the PDF preview (§4.4), Revisions or History. Their approved roles stay until Jess
  changes them; this flow is not permission to auto-edit, remove document pages or change gates.
- **Exceptions:** when a genuine business constraint cannot fit this flow, the chat proves it with
  evidence and brings a concrete alternative with its impact (§0.3). Never force the pattern blindly;
  never invent an exception silently. A different UX needs Jess's approval.

**Adoption acceptance:** compare the actual module page top to bottom against the Sales Orders
reference at the operator's viewport and a narrow layout. Verify the mission source independently of
table loading/filtering, the listing interactions, record-to-panel opening, Info and the module tab (the page's main work tab selected on open),
authorised edit/preview/result, source scope and retained return state. Record verified and missing
coverage per module (§4.3, §6.1). Tests or shared-component imports alone do not prove adoption.

## §0.3 · Every new chat — before acting

1. **State the authority and its version:** this MASTER, the owning module MASTER and COPY entries,
   read at `origin/main` `{sha}`; name the reference instance you compare against (Sales Orders unless
   the module MASTER names another).
2. **Name what you reuse:** the kit components, DataGrid props, card adapter and configuration.
3. **Classify every needed capability** as `SUPPORTED` (§6.2 names the prop) · `APPROVED TARGET /
   NOT BUILT` · `REAL GAP` / `KIT GAP`. A gap goes to the kit owner, never into a page-local copy.
4. **List the anatomy parts that do not apply** (§0.1) with the reason and the operator impact.
5. **When a standard does not fit, write:** Current → Problem → Better design → Trade-off →
   Recommendation (Constitution Law 4). Never make a silent exception; never answer "the MASTER says so".
6. **Ordinary engineering is yours** — files, props, tests, merge, deploy. Only a business rule or a
   change to a locked word, workflow or presentation goes to the owner, through the controlling chat.
7. **Before a design may direct BUILD it specifies:** page purpose, user and entry; template role and
   shell; reference interaction with provenance; ordered regions and each region's job; real
   component per region; the source of every fact, action and owner; primary and secondary doors;
   disclosure/edit/submit/result behaviour; all applicable states (§2.2); narrow, keyboard and long
   content; allowed business differences; known gaps; operator acceptance. A list of arrows is not a
   specification, and a specification is not a working interface.
8. **Conflicts without an owner questionnaire:** the latest explicit scoped owner ruling wins over an
   older generic example. If two current explicit rulings still conflict, record the exact
   consequence as a REAL GAP (§7.2); never pick whichever gives the preferred layout, and never
   rewrite locked values or approved action placement to make a document shorter.
9. **Every number states its trigger** — viewport width, grid canvas width, available content canvas
   (after shell rails), card width or pointer type. A number without its trigger is how chats end up
   copying different things; 01 §7 carries the trigger beside each measurement.
10. **Module Settings completion — owner ruling 2026-10-05.** When a module's build is complete, the
    chat proactively offers how to complete that module's Settings: every setting the module needs to
    run, its Settings door, current value or default, which are still empty, and who sets it — before
    calling the module complete. Never wait for the owner to ask.

## Find it — this index is enough

| I need | Go to |
|---|---|
| The listing (template on one page) | §6.0, then §6.2 for the capability table |
| The left rail (mission rule, recipe, per-module status) | §6.1 |
| The right Working Panel | §4.3 (rules in `MODULE-CARD-TEMPLATE.md`, numbers in 01 §7.6) |
| Which tab the panel opens on (page-owned main work tab) | §4.3.1 |
| Standalone versus embedded Sales Order card | §4.3.3 |
| Columns and other modules' facts on my list | §6.3 |
| Row expansion | §6.9 (goods tables §6.8) |
| The full object page | §4.1 |
| PDF and document preview | §4.4 |
| Loading, empty, error, denied, feedback, keyboard, narrow, acceptance | §2.2 |
| Every exception, real gap, kit gap and proposal | §7 |
| A number | 01 §7 (§7.5 SO-derived template, §7.6 compact card) |
| A word | COPY-STANDARD |

---

# §1 · Working law for every UI chat

## §1.1 · Production UI Execution Law — owner ruling 2026-08-11

**Production UI is built on proactive design judgment and reviewed asynchronously.** This overwrites
the earlier synchronous gates (the blanket "ASCII mock first, wait for yes" and the localhost "Layout
Approved" hold) for production execution work:

```
BEFORE build   token values, the kit, COPY-STANDARD and the page patterns BIND exactly as
               before. The chat composes within the admitted shared template using its own
               judgment; it does not wait for a layout sign-off.
AFTER build    the owner reviews the LIVE surface asynchronously. A review verdict is a normal
               re-ruling: it changes the next commit, it does not invalidate the shipped one.
STILL GATED    a NEW business rule · a change to an approved workflow or ruled word · anything
               the Constitution's interrupt list names. Judgment covers COMPOSITION, never law.
```

When the owner is IN the conversation choosing between options, sketch before code (Constitution
§10). The gate that is gone is the one that parked autonomous production execution on approval.

## §1.1.1 · The pre-show gate — owner ruling 2026-09-26 · APPROVED / LOCKED

The chat runs this on its own screenshot BEFORE the owner sees a surface. A page that fails a line
is fixed first, not shown. State the six results in one line with the screenshot.

```
1  WORDS      every visible word is in COPY-STANDARD, with its row named; none invented
2  ONE BLUE   one washed/filled blue = the chosen record/row; rail choices bold + left line;
              tabs grey; no blue words; links grey underlined
3  WIDTH      a card wider than 480px with more than three facts lays them in columns
4  ICONS      a record door is the kit's `open` icon with its accessible name, not the word
              `Open …` beside a title
5  REFERENCE  the surface was put beside its reference (Sales Orders Register · Gmail reading
              pane · Linear issue) and every difference is named or removed
6  SELF-RATE  the chat rates its own screenshot out of 10 with the 🔴/🟡 list; under 8 it is
              not shown
```

**Why:** the owner rated a Work rebuild 3/10 after ten review rounds she had to lead herself. Every
fault was visible in the chat's own screenshot first. The owner reviews design; she does not run the
checklist.

## §1.2 · Plan / Design: the UI extension of the start protocol — APPROVED / LOCKED 2026-08-11/13/14

The Constitution's ERP PLAN CHAT START PROTOCOL, its MISSION / CARD / CHAT BOUNDARY LAW and its PLAN
DECISION PERSISTENCE LAW apply unchanged and are not repeated here. For a UI surface the whole-domain
audit additionally includes the four items below. APPROVED / LOCKED decisions are not re-researched,
reopened or offered for re-approval. Governance is not feature freeze: an existing capability is
KEEP, but its placement and presentation bind only where a MASTER explicitly locks them, and a
missing capability may be proposed with its operator value.

1. **Dictionary / IA preflight.** Before ANY proposal, inspect COPY-STANDARD, navigation/IA, module
   ownership, this MASTER, the tokens and the target module MASTER. For every proposed button, tab,
   menu, destination, page, action or Settings entry, name the existing Carres word, owner and
   destination first; check duplicates, wrong module placement, future consequences and missing
   useful capability; recommend **KEEP · IMPROVE · RELOCATE · RETIRE · BUILD** with the reason.
   Extract a short **LOCKED CONSTRAINTS** list (sidebar active treatment · header law · toolbar law ·
   typography · density and row heights · pill/button/tab/filter/dropdown/overflow admission ·
   spacing · width/scroll law · locked column order · capabilities to preserve · retired patterns).
   A conflict with LOCKED truth makes the proposal INVALID before Jess sees it; conflicting
   authorities are reported, never silently resolved.
2. **Eight-lens review** (Loo 2026-08-11) — none skipped: UI Dictionary · Information Architecture ·
   Cross-module consistency · Component/interaction language · Capability gap · Future consequence ·
   Reference translation · Recommendation (KEEP/IMPROVE/RELOCATE/RETIRE/BUILD with reasons). A mockup
   that has not passed the eight lenses is INVALID even when its tokens are right.
3. **Reference function mining** (Jess 2026-08-12) — object-level, not screenshot-level. For the
   unresolved surface inventory every applicable reference capability (workflow, Settings/Maintenance,
   navigation, detail, preview, edit, print, export, search, filter, columns, scan, copy, bulk and
   context actions) as:

   | REFERENCE CAPABILITY | CARRES CURRENT EQUIVALENT / OWNER | KEEP / ADAPT / RELOCATE / BUILD / REJECT | WHY | DEPENDENCY / CONFLICT |
   |---|---|---|---|---|

   Then give ONE evidence-based Carres recommendation, not an A/B/C menu. Screenshots are evidence of
   implementation, never authority over frozen target truth or unresolved placement.
4. **Completion gate** — before calling a UI plan complete, show coverage of: current capability ·
   locked governance · dictionary/IA/ownership · reference mining matrix · mature benchmark where
   useful · gap analysis · cross-module consequences · Blueprint synthesis · dependencies.

Every action remains one structured contract — **owner context + short action + necessary
object/recipient/result + actual working date** (§2.1, §5.1). When the owner approves a complete UI
decision, overwrite this MASTER or the owning module MASTER immediately (PLAN may update governing
documents; it may not implement application code).

## §1.3 · Reference products — owner direction 2026-10-01 · APPROVED DIRECTION

- **References never author Carres visual tokens** (APPROVED / LOCKED). Linear, 2990, GitHub,
  Shopify, AutoCount, Houzs and others may supply a proven structure, behaviour or trade-off; colour,
  typography, radius, elevation, icons and component styling come only from 01 and the kit. Copying
  2990 cream/yellow, orange ink or another product's control shape is a defect; mockups too.
- **Register reference division** (APPROVED / LOCKED): headers follow the compact, width-spending
  Linear pattern; listing behaviour and readability follow the governed 2990 reference (engine,
  controls, column powers, row disclosure, hierarchy); GitHub is evidence for tab admission only.
  Copy the POWER of the team's tools (AutoCount sortable headers, per-column filters, footer totals),
  never their assumptions.
- **Houzs-first complete templates** (Jess 2026-10-01: "we just copy and update"). The owner selected
  Houzs **list, detail, form and card** families as the visual starting point for one shared Carres
  presentation, adapting their geometry and information hierarchy to Inter and the existing Carres
  semantic palette. This is not approval of literal Houzs values or palette (the warm-grey hex proposal
  is withdrawn), of unreviewed layouts, of a new business engine or of source-code copying: Houzs code
  is a REUSE CANDIDATE only, never COPY REQUIRED, until rights, dependencies, security and data fit are
  verified. Existing explicit presentation locks stay until a reviewed replacement is persisted.
  All Houzs measurements and inventories are FACT in
  [`../research/houzs-ui-reference.md`](../research/houzs-ui-reference.md).
- **The five template roles** — one kit, five compositions; module content differs, behaviour does not:

| Role | Reading / action sequence | Carres sources | Forbidden shortcut |
|---|---|---|---|
| Register | shell → mission rail → search/tools + listing → Working Panel (Info + module tab) → approved work/edit/preview → retained list context | DataGrid, workspace-rail, CompactModuleCard; Sales Orders is the reference | page-local grid or panel clone; a different layout without a proven constraint and owner approval |
| Object detail | identity/version → object views → grouped facts → action doors → documents and history | Block, DocumentTable, TotalsSummary; SalesOrderWorkspace, PurchaseOrdersPage, WarehouseUnitDetail | forcing the order-specific DetailShell on other objects; disabled-looking inputs for read-only facts |
| Task / operation | exact source and goods scope → current task and owner → checks/input → missing requirements → one submission → recorded result, remaining work, handoff | ReceivingWorkspace, WarehouseIncoming, WarehouseOutboundWork; Block | an extra approval or duplicate form to mimic a reference; warehouse submission ≠ posted GRN; loaded ≠ driver-confirmed |
| Form | grouped inputs → conditional requirements → field feedback + one blocker explanation → submit → success/error/conflict | Block, FieldFrame, Input, Select, DatePicker, EvidenceUploadField, Modal | local colour/control/storage wrappers; losing valid input on failure |
| Work / overview card | identity/scope → factual reason → resolved owner → exact action; counts separate from tasks | Block + My Work/Team Work presentation | a competing truth, a second staff list or an unverified clickable KPI |

---

# §2 · Shared architecture

| Concern | The ONE home |
|---|---|
| token values | `docs/01-design-tokens.md` · mirrored (never driven) by `apps/web/src/lib/design-standard.ts` |
| the components themselves | `apps/web/src/components/kit/**` (plus `components/register/DataGrid`) |
| the live look | **`/ui`** — public, lazy, its own chunk, so a kit reference never rides the operator's bundle |
| the enforcement | `pnpm --filter @carres/web lint` + the kit source scans + `scripts/check-design-standard.mjs` |

**Frozen and not reopened:** the spacing scale is 8 steps (`2 4 6 8 12 16 24 32`) · `font-bold` (700)
is folded into 600 · Lucide's stroke stays 2.

## §2.1 · New-staff operating language — owner ruling 2026-08-20 · APPROVED / LOCKED

**The system knows the process; staff confirm facts, perform the stated act and record the result.**
No surface may depend on experience, memory, WhatsApp history or asking a long-serving employee what
comes next; any authorised cover must be able to resume from the structured facts.

English is the one official language for fields, records, search, reports and documents. Facts,
warnings, actions, validation, empty states and prepared messages use **Primary School Standard
English**: one sentence carries one fact or one act; about 12 words at most where governed terms
allow; actions start with common verbs (`Send`, `Call`, `Ask`, `Check`, `Choose`, `Save`, `Upload`,
`Add`); required business words stay (`Purchase Order`, `Supplier`, `Deliver To`, `Unit ID`, `Invoice`,
`Credit Note`, `Claim`, `Consignment`) with on-demand explanation; never `Process`, `Handle`,
`Proceed accordingly`, `Action required`, `Resolve discrepancy` or `Follow up`; actual dates such as
`18 Aug 2026`, never `ASAP`, `Today`, `Tomorrow`, `T−2`; an error states the failed fact and the act
that fixes it; a button states what pressing it does. Optional `What does this mean?` help may explain
in Chinese or Bahasa Malaysia without changing the authoritative English. Prefer governed choices and
prepared messages over free typing.

An action-capable surface separates the fact from the act:

```
Supplier invoice is missing
[YJ] Ask the supplier to send the invoice by 18 Aug 2026
```

`[YJ]` is a structured owner chip, never sentence text; the action record carries trigger, owner
rule, resolved owner, completion fact, governed date, source object and cover evidence. This law
simplifies execution; it removes no permission, approval or separation of duties.

## §2.2 · One UX contract — states, feedback, keyboard, narrow screens, acceptance

**Truthful states — never mixed, never disguised:**

| State | Required visible behaviour |
|---|---|
| Loading | busy state inside the work surface; toolbar stays |
| Genuinely empty / filtered empty | the two read differently; criteria stay visible with a way to remove them |
| Failed read | `Could not be loaded` + `Try again`; never zero, never "no work", never a completed status |
| Denied / read-only | the restricted action or data is absent; no fake empty, no pointless retry |
| Missing setup | says which setting is missing and where it is fixed |
| Required / invalid | the exact missing item and how to fix it; the same fact in the field and in any summary |
| Upload pending / failed | per-file state, safe retry, source association; no false saved evidence |
| Unsaved / submitting / conflict | valid draft kept; current version explained; no duplicate or silent partial result |
| Success / waiting / partial | the actual effect, what remains and who is responsible next; a toast alone is not enough |
| Historical / document failure | correct version and actor; business success is separate from a failed PDF capture |
| Long content / many records | the full identity is reachable; quantities and actions stay findable; contained scroll |

**Feedback:** ordinary results use the governed `Toast` in one fixed bottom-right tray, stacking
upward, never in document flow; success/information auto-dismisses after five seconds with a slim
remaining-time line and a close door (owner confirmation 2026-10-02). A persistent business blocker
stays an in-page message by the affected surface; field validation stays inline. The listing's three
message kinds are in §6.5. A `Save` is disabled until something changed, and a blocked save names the
gap (`Save changes — say why this date is different`). Editors: one open at a time; a failed save
keeps the input and says why; a refetch never clobbers an open edit (§6.4 C3).

**Keyboard and focus:** every overlay opens by keyboard (tested, not assumed); `DialogFrame` returns
focus to the element that opened it (§3); a grid is one Tab stop (§6.2); icon-only controls have a
tooltip and an accessible name; colour is never the only signal.

**Narrow screens:** the page never scrolls sideways; a table scrolls inside itself; touch targets are
40px; check 1440 / 1180 / 820 / 390 and 200% zoom; nothing (footer, floating control, toast) covers a
fact or an action; the bottom of long content stays reachable.

**Field-operation UI — owner ruling 2026-09-29 (Opit-Warehouse) · APPROVED DIRECTION, validation
pending.** Office staff manage through registers; Warehouse, Delivery and NETS field tasks share one
simple interaction pattern for operators with limited English and computer literacy: show only the
current necessary step with one clear next action; the system supplies party, place, goods, quantity
and the related record; prefer scan or selection over typing; ask for photos where the owning
workflow requires evidence; a problem door captures the observed problem and evidence and office
staff handle the management work. Photos alone never establish completion; Unit/quantity, receiving,
loading, handover and proof rules stay with the owning workflow; loading stays distinct from driver
acceptance. Show the recorded outcome and next responsible party; a failed upload never looks
complete. Schedules open the owning work record; keep established navigation and PDF formats. Validate
receiving, short/damaged arrivals and delivery with the target operators before claiming completion.

**Workflow-guidance acceptance for task pages:** show (1) task/source identity, (2) the current
required check or input, (3) the exact blockers, (4) the authorised next action, (5) the recorded
result, remaining quantity/work and receiving owner. Work/Duties decides responsibility; the owning
business result decides completion.

**Every adopting chat finishes this checklist before saying "aligned":**

- Name the owning module, the reference recipe and the shared components used; identify any adapter.
- Preserve the module's governed columns, quantities, statuses, permissions and write ownership.
- Show a complete working page, not a cropped header: desktop and 390px, plus the 896px
  available-canvas rail boundary with global navigation expanded and collapsed.
- Check rail open/closed, backdrop/Escape, search, selection, column filters and Table/Cards;
  switching presentation keeps the same result and filters.
- Check the Working Panel and full-object door, long identities, all §2.2 states, keyboard focus,
  icon accessible names and 40px touch controls.
- Check long content is reachable, headers stay fixed and horizontal overflow stays in its pane.
- Provide the preview URL, visual evidence and test results; state remaining gaps. Passing tests,
  importing kit primitives or another chat's approval is not whole-page visual proof. Approved,
  built, deployed and visually verified are separate claims, each with scope and evidence.

---

# §3 · The kit — frozen component rules

**Live:** every kit component renders on `/ui`. Current kit (`components/kit/`, re-measured
2026-10-05): `Badge · Block · Button · Card · Checkbox · ChecklistRow · CompactModuleCard · DataTable ·
DatePicker · DetailShell · DialogFrame · DocumentTable · Drawer · DropdownMenu · EmptyState · FieldFrame ·
GridToolbar · Icon · Input · Loading · Modal · MonthCalendar · PageShell · Panel · PdfPreview · Popover ·
QuietRouteRow · RouteStop · SavedEvidenceViewer · ScheduleCard · SearchInput · SectionHeader · Select ·
StatusPill · Tabs · Textarea · Toast · Tooltip · TotalsSummary`, plus `register/DataGrid`.

- **Radix for behaviour, the kit for appearance. NOT shadcn/ui.**
- **No component takes `className` or `style`** (enforced by `@ts-expect-error` tests).
- **`Icon`'s name is the ruled icon meaning list** and it has no `strokeWidth` prop.
- **`StatusPill`'s tone is the action tone type** — tone from a CONDITION, never a verb. `Badge` has
  no tone. `Button` has no `danger`. `Button` forwards its ref (every `asChild` trigger anchors on it).
- **Widths and radii with no home in a standard live as named config keys**, never as numbers.
- **Card titles are black bold `text-strong` (15/600, slate-12), never blue, never a band** (ONE KIT LAW,
  owner ruling 2026-09-27). Blue is the primary button, links, selection and partial-progress pills.
- **Colour use — the governed Carres semantic palette (01 §2).** Canvas and surface separate the page
  from white cards; primary text slate-12, supporting slate-11; an important fact never wears
  disabled/placeholder colour; hover and persistent selection are distinguishable; success, warning
  and error use their semantic pairs with explanatory text; a status follows its actual business
  meaning (a confirmed document is not a completed physical job); state is readable without colour.
- **Solid status pills — owner confirmed 2026-10-02, PRODUCTION VERIFIED (PR #1842, `68d133c4`).**
  White text on a solid semantic fill, no circular mark or decorative icon; `StatusPill` owns it,
  neutral `Badge` counts are unaffected. Complete = green (`Fully received` · `Fully delivered` ·
  `Paid in full`); partial progress = blue (`Partially …`); waiting/not started = neutral grey
  (`Awaiting receipt` · `Not delivered` · `Unpaid`); issue = amber (`Received with issue`); unknown =
  neutral grey (`Receipt unconfirmed` · `Amount unconfirmed`). Red needs a proven late/blocking
  condition; unpaid alone is not one. Accessible, filter, sort, search and export strings keep the full
  text.
- **Action grammar (owner amendment 2026-10-01, correction 2026-10-02).** Full-object Print, Export
  and Edit: icon 16 + visible word. Back, Close and More: shared icon-only controls with tooltip and
  accessible name. Global utilities are icon-only (§4). Content tabs are text only. Status pills keep
  their text; icons are not added indiscriminately. The compact card opens its saved document from
  the document number (§4.4).
- **The centred surface has three widths** — default (question/short form), `wide` (line list),
  `viewer` (picture); values in 01 §8.2. `width` is a union of literals; a fourth width is a decision
  for this table, never a caller's.
- **Returning focus is `DialogFrame`'s job** (defect found and fixed 2026-09-11): it remembers the
  element focused when it opened and restores it on close, skipping an opener the close removed.
  `Modal` accepts `returnFocusRef` for a persistent trigger when the opening menu item unmounts.
- **The portal has exactly four tables**, each a kit component with a `/ui` example; a page imports
  one and never draws its own `<table>` (`check-design-standard.mjs` refuses page-local table styling):

| # | Where | Component | Recipe |
|---|---|---|---|
| 1 | a Register / listing | `DataGrid` | §6.0 rule 5 · header 36px slate-3 11/600 · 8px insets · column separators by column count (01 §5.1) · hover slate-3, selection blue-3 · 32px footer |
| 2 | a row's goods expansion | `GoodsMiniTable` | header 27px · 51px two-line rows · four-sided frame · §6.9 connector |
| 3 | a document table inside a card (SO Items, Payment rows, PO lines) | `DocumentTable` | header 11/500 slate-11 over a 1px slate-5 line · 13px rows, 8px insets, a 1px slate-5 line beneath each · no vertical lines · amounts right, tabular · only the closing total 600 |
| 4 | a totals block (`Goods` · `Services` · `Total payable` · `Paid to date` · `Balance due`) | `TotalsSummary` | two columns, label slate-11 left, amount slate-12 right tabular · 13px · 8px insets · 1px line between rows · no outer frame, no boxes per cell (owner 2026-09-27) · only `Total payable` and `Balance due` 600 · a missing value is a word (`No price yet`) · page and PDF draw it from the one arithmetic |

- **The Work route pieces** (admitted by Jess 2026-09-28, Workspace MASTER §5.10, BUILT): `Block`
  (white, 1px slate-5, card radius, 12/16 padding, black title over a 1px rule, optional `why` line
  13/400 red/amber/slate-11), `RouteStop` (24px dot on a 1.5px line; red `!` missed, amber `!` due,
  dark tick done), `ChecklistRow` (16px read-only mark; the act 13/600; `stacked` below 1340px),
  `QuietRouteRow` (one ≥48px line; outline red/amber when it holds an act; `wrap` below 1100px). Opt-in
  props that came with them: `Tabs fill` and `FilterRailRow tone="workspace"`.
- **Every optional power is OPTIONAL and no signature moves.** A page must justify wiring a power; an
  unwired power's ABSENCE is asserted by a test where it matters.

---

# §4 · Shell — destination header, toolbar row, Settings, Jump to

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Sales Orders                                              ⌘   🔔⁴⁸   ?   ⚙   │ 50 min
└──────────────────────────────────────────────────────────────────────────────┘
   the word alone                         global only: Jump to · Notifications · Help · Settings
   ── 8px ──
 [active filter chips · Clear all]                          only while something is filtered
 {count / summary}                     [🔍 Search orders…] [▦ Table | ▤ Cards] [⋯]   40 toolbar
 table header 36 · rows · 32px status footer
```

- **Row 1 · Destination header — APPROVED / LOCKED (Loo 2026-08-11; Jess 2026-08-15).** One shared
  `ModuleHeader`, rendered by the shell (pages never draw a header). Left: one short identity, **the
  word alone**, `text-page` 24/32/600, no icon, no `{module} ·` prefix. Right: genuine global
  utilities only. **Owner correction 2026-10-02:** Jump to, Help and Settings are icon-only at every
  width (Jump to uses kit `jump` / Command 16, distinct from the register's magnifier); tooltips,
  accessible names and the ⌘K shortcut stay; the bell keeps its count. **No page-owned control ever
  enters this row**: no create, Scan, Export, Columns, Search, View, filter, selection state, breadcrumb,
  duplicate title, KPI or tab. The 50px is a **floor**: a long identity wraps (`min-w-0 break-words`)
  rather than truncating or forcing a sideways page scroll (BUILT 2026-09-18); a page's identity is
  one fact (a Unit page's word is `{unitCode}` alone, BUILT 2026-09-19).
- **Row 2 · Work toolbar.** Owned by the listing (§6.0, §6.5): count/summary left; Search, admitted
  Table/Cards and the far-right `⋯` Page tools right; the module's create button only where the module
  is the record's birthplace. Selection replaces this row in place.
- **No KPI preamble.** A register is truth, not a dashboard: no card strip, totals band or counters
  above the table; the 32px status footer carries the summary.
- **Global Settings entry — APPROVED / LOCKED (Loo 2026-08-11).** The header gear is the ERP's one
  Settings entry: a compact permission-filtered launcher (`{Current module} Settings` when the module
  owns settings and the user may open them, then `All System Settings`) that navigates into the one
  full-page Settings Workspace. Values are edited only there. No module tab, navigation row, toolbar or
  `⋯` repeats a Settings destination; Columns, personal layouts and view presentation stay on the
  register. `Staff & Duties` lives at gear → `All System Settings` → `Staff & Duties` (PRODUCTION
  VERIFIED 2026-09-29, PR #1791); Work's unresolved-Duty link opens that exact Duty and keeps return
  context; Workspace MASTER §§3–4 owns its composition and manager actions. Its owner-approved UI
  targets (2026-09-28/29, NOT BUILT unless Workspace says so): current facts → plain `Next` →
  collapsed `History`; manager actions in the selected Duty header's visible `⋯` (`More actions`);
  catalogue + detail at 1440/1180px, list then full-width detail at 820/743/390px; `Manage staff`
  opens existing People management with return context; two manager-editable times
  `Morning check time` (10:30 AM) and `Afternoon check time` (3:00 PM); a temporary duty adjustment
  shows the affected arrangements and needs person, start, end and reason; an effective departure
  leaves active staff lists while history keeps actual actors.
- **Settings Workspace — APPROVED / LOCKED 2026-08-14 / 2026-09-09, BUILT.** Its section rail is the
  governed rail: 240px, flush left, one straight right divider, no card/radius/shadow, active row
  `blue-3` wash with a 2px `blue-9` line; `Hide settings` removes the whole rail (remembered as
  `ops-settings-rail`), never a 60px icon strip. Every section draws a `kicker` (module) over an
  `h1.text-page font-display` (page). A module may own several rows when they are sections of one page
  (`Warehouse Details · Working Hours · Public Holidays · Special Dates · Access`). A module page
  renders plain-language groups and readable rows; a coherent configuration commits with **one**
  header `Save changes`, disabled until something changed and naming any invalid gap. No empty
  Settings pages, no duplicate settings homes, no raw database-shaped fields as the default view.
- **`Jump to…` — APPROVED / LOCKED 2026-08-11, BUILT 2026-08-15 (`JumpTo.tsx`).** The one global
  navigate-only command surface (click or ⌘K; desktop centred overlay, full screen on small screens;
  the kit `Modal`). No query: at most five permitted recent destinations, then destinations. Typing
  searches only governed destination names and document numbers (SO · PO · GRN · INV); results are
  permission-filtered first (destinations from `portal-nav`'s own visibility functions; documents read
  under the caller's token so RLS decides), show number, type and the smallest identifying party, and
  only navigate (an `INV` opens the Sales Order it invoices; a `GRN` number is read back to its day).
  `↑`/`↓`/`Enter`/`Esc`. Register Search stays page-owned and does a different job: `⌘K` finds
  destinations and document numbers across the ERP; `🔍` finds customers, phones and items inside one
  page — both stay. Wider global search needs a governed cross-module index and an architecture
  decision. The empty-state word is a REAL GAP (§7.2).
- **`PageShell` makes the height budget a TYPE** (`variant="list"` has no KPI slot; no extra band).
- **ERP Shell (owner ruling 2026-08-13):** navigation is grouped by responsibility
  (`../ERP-ARCHITECTURE.md` §2.1); `Workspace` (`/operation?tab=work`, owner label ruling 2026-09-29)
  is the formal destination for `My Task` / `Team Work`; one central Settings destination with module
  deep links; `Old Orders` is temporary cutover infrastructure.

## §4.1 · Object page — the full record

**How one record opens — four surfaces, each with one job; a fifth needs an owner ruling.**

```
INSPECT    row expansion            the record's goods and related facts; ↑↓ moves · Esc closes (§6.9)
WORK       right Working Panel      Info + module tab; quick work in place of the list (§4.3)
OBJECT     full object page         read-first View · deliberate Edit · Revisions · History · Route
DOCUMENT   document preview         the saved/current document the other party receives (§4.4)
```

**Anatomy of the page:** identity row → tab row → form pane (left) + document pane (right) where the
object rule splits (§4.4), otherwise one facts flow. The Working Panel is the default record-to-panel
opening from a listing (§0.2); the full object page keeps its approved roles and is reached from the identity number or the panel's ↗. View, deliberate
Edit, PDF, Revisions and History stay distinct: only explicit `Edit` opens the formal edit context;
View, Preview and Print are never edit; Revisions are complete versions, History is events.

**Approved in-list write state — two owner rulings, no other register copies them without its own:**
the **Delivery Monitor** row expansion (owner ruling 2026-09-13) is the delivery brief of four kit
`Panel`s; a panel that owns a Delivery write flips its own body into a focused edit state through its
one right-slot control (`Update date and time`, `Assign logistics` / `Change logistics`) with a named
Save, staying on the same row and narrowings. The **Delivery Orders** register (owner ruling
2026-09-26) opens the Delivery Order brief in place — two columns at ≥1024px, acts left, read-only
facts right — so a result, signed DO, receipt and proof review are recorded without leaving the list.
Sales facts inside a brief stay read-only (`View Sales Order` unfolds the governed SO document in
place; the row's `SO No` is the door to change them). Full law: Delivery MASTER §§8.5–8.7.

**Object header template — APPROVED / LOCKED 2026-08-14; presentation accepted 2026-10-01.** One
owning-register back destination, one persistent identity (`number · party`), governed actions at the
right, the applicable object views directly below; View and Edit keep the same context. A white
identity/actions row over a slate-2 tab row with a 1px slate-5 divider; selected tab 600 black with a
blue underline; tabs are text only; the header stays outside the scrolling content. Back is a neutral
rounded square with the canonical back icon (32 desktop / 40 touch) whose tooltip and accessible name
name the owning register. Below 768px, or when the available content width is ≤1023px including shell
rails, identity and actions wrap into two rows inside the same header; a long identity truncates only
when needed, with its full tooltip. No duplicate singular/plural pseudo-tabs, no second `Back to …`.
Output actions (`Print ▾`) stay distinct from Edit; rare or destructive actions live in overflow.
Numbers: 01 §7.5. **KIT GAP:** `SalesOrderTabs` and Workspace `FullFact` are page-owned recipes, not a
generic ObjectHeader/ObjectPage API; `kit/DetailShell` embeds an order-specific action track and
four-fact contract (and has no `state` prop, by type) and must not be forced onto other objects.

**Scoped SO exception — goods-summary inspection (owner 2026-10-01, BUILT):** a compact goods summary
with a `+{n}` count of remaining goods LINES (never quantity) opens a read-only goods inspection in the
kit `Drawer` (`SO-{n} · Items`), reading the same goods source as the expansion. It is not a full-order
drawer and has no edit form.

**The four regions** (03 Detail pattern): Header (which record · state · `‹ 4 of 69 ›`) · Summary ·
Sections · History (`Today · Yesterday · Earlier`).

**One card grammar for every object, detail and review surface — owner instruction 2026-09-26, BUILT.**
The shared `Block` is the one section chrome: white card, `rounded-card`, `kit-slate-5` hairline,
`px-4 py-3`, a black bold sentence-case `text-strong` title over a 1px rule, one 12px body gap, then
the Sales Order fact grammar — `text-label` label over a 13px value, three to a row on a full page,
two in a half-width pane, one on a phone. On Purchasing pages every fact prints in the Sales Order's
bordered box whether or not the page can change it; the SO page keeps its own three plain exceptions
(Orders MASTER field standard 2026-09-22). Table heads keep their uppercase `text-label` row; a
document's own heading keeps its document face. **A value the SYSTEM fills on a form the person is
filling wears a grey box** (owner ruling 2026-09-28): `Fact automatic` = the bordered box with the
`kit-slate-3` fill and `data-kit="automatic-field"`; a detail page keeps the white box.

**A tab earns its place two ways, and only two.** Reason one — genuinely parallel tracks (a Sales
Order: goods, delivery, money move at once). Reason two — reference a human opens rarely but must find
(Versions, History, the route map). Everything else is ONE SCROLL. The mechanical test: would a staff
member open this tab on an ordinary Tuesday? Yes and it runs beside the others → reason one; no, but
they would hunt for it when something went wrong → reason two; neither → a section in the scroll.

```
PARALLEL TRACKS   Sales Order
REFERENCE ONLY    Purchase Order · Supplier Claim — work is the first tab; then Versions / History / Order Route
ONE SCROLL        Goods Receipt · Purchase Return · Repair Order · Display Request · Manual Purchase ·
                  the governed Consignment documents
```

**Object composition (accepted 2026-10-01):** in a split, the left form scrolls as ONE pane and the
right document preview independently; Items has its natural height and no nested vertical scroll;
desktop wraps product details; small screens stack (form then document). Two-column object
composition for a facts-and-events object (Delivery Order): fixed facts in a ~420px right column,
events in a scrolling left column at ≥1024px, one column below; a Sales Order keeps its tabs and a PO
its 50/50 split. **A panel's actions live in its own header `⋮`** (Jess 2026-07-11); the redundant
inline button is gone.

**What is remembered:** whether a rail or a panel is collapsed (per browser). Register column
preferences follow §6.7 rule 4. Object goods tables gain no column customisation.

**The reference instance** is the Sales Order page: `SalesOrderWorkspace` (read-first View, deliberate
Edit with the 50/50 live document, Revisions, History, Order Route). Orders MASTER owns its business
facts, field standard, Items (five columns `Item · Qty · Unit (RM) · Disc (RM) · Amount (RM)`) and the
Order Route ONE NODE MAP (`docs/orders/MASTER.md`). Other objects copy the grammar, never SO fields or
arithmetic. The owner-selected Houzs Service Case detail composition (2026-10-01) is a reference for
hierarchy and sections, not an approved adaptation (research file §6).

## §4.2 · Portal navigation — current grammar PR #861; Purchasing tree approved 2026-08-22

`PortalSidebar` is the only left navigation surface: 232px expanded, 60px collapsed; a module never
opens a second sidebar, flyout or duplicate tab strip. A multi-page module is one icon + name +
chevron row with its pages on quiet rounded elbows; a one-page destination is a direct icon + name
row. **Payments** is a module of two destinations, `Monitor` (the landing) and `Payment Records`, for
every role (owner ruling 2026-09-12). **Sales Orders** is one expandable parent with `Outright Sales`
(`/operation/orders`) and `Subscription` (`?tab=rental`) (owner approved and BUILT 2026-09-23; no
address moved; `Old Orders (temporary)` left the rail while its routes stay mounted for legacy links). **Purchasing** has one more level: `BUY`, `RECEIVE`, `PROBLEMS` and `SHOWROOM` are
independent full-row accordion headers; more than one may be open; the active destination's group
opens automatically; state is remembered per signed-in user; no Home or module Work destination. The
exact Purchasing map is `docs/purchasing/MASTER.md` §4. A local filter or mission rail belongs inside
a page and never becomes a second sidebar.

- **The full row toggles**; a module click never silently opens its first page.
- **Existing useful capability stays reachable through its approved home;** a previous screen earns
  no permanent door when its job is now a register facet, a central Work item, a central report or an
  in-context request.
- **The complete map is present from day one:** an approved but unbuilt destination is a `<span>` with
  no href, outside the tab order, `aria-disabled`, printing `Coming soon`, with no hover, bar or count.
- **Exactly one visible active indication — APPROVED / LOCKED.** Tree open: only the exact current
  child row; tree shut while on its page: the module parent; rail collapsed: the module icon. Never
  nothing, never twice. Active = `kit-blue-3` wash + `kit-blue-9` line (never red/flame: the flame is
  the brand mark; red is late work/alert).
- **Wire-line, never boxes;** no destination icons (one module icon); counts mean human work waiting
  and zero prints nothing; parents never sum a second queue number; collapsed stays 60px.
- **A collapsed module icon opens a NAMED destination** (Purchasing → `SO Batch Purchase`).
- **The active row is brought into view** without centring or animation; brand/collapse fixed at the
  top, the signed-in user fixed at the bottom; only the middle scrolls.
- **Settings stays in the header gear;** no Settings rows in the rail.
- **Sidebar mark (accepted 2026-10-01):** expanded official Carres lockup 36, collapsed 28; preserve
  proportions and clearance.

Implementation: `pages/portal/portal-nav.ts` · `PortalSidebar.tsx` · `operation/PurchasingTabs.tsx` ·
`operation/StockTabs.tsx` · `operation/components/ModuleHeader.tsx`.

## §4.3 · Working Panel — the compact module card

**APPROVED TARGET for every module (owner ruling 2026-10-05, §0.2) · shared kit BUILT · Sales Orders
PRODUCTION VERIFIED.** The right Working Panel is the kit **`CompactModuleCard`** inside the shared
`Drawer variant="compact-card"` (the Drawer owns focus containment, Escape, background scroll lock and
return focus; the card owns its visible identity and Close; closing preserves the register context).
Never copy reference HTML or CSS into a page; never draw a lookalike panel.

- **Its shell, the same for every module:** identity Header → `Info` tab and the module tabs (the
  panel opens on the current page's own main work tab; related tabs such as the embedded
  `Sales Order`) → helper entries (`Items`, `Communication`, `Timeline`) → module summary cells → one inline editor at
  a time. Responsive rules follow the **card's** width, not the viewport.
- **The rules of the card** (header facts, sales facts, Info and module defaults, summary cells,
  editors, DO conditions, Items, Communication, Timeline, the SO document preview, the dark Header
  colour, the original requested-date day count, the adapters and the reference differences) live
  **once** in [`MODULE-CARD-TEMPLATE.md`](../ui-reference/MODULE-CARD-TEMPLATE.md). Its numbers live in
  [01 §7.6](../01-design-tokens.md#76-compact-module-card--compactmodulecard); its words in
  COPY-STANDARD "Compact module card words" (`CARD_WORDS`); `/ui#compact-card` shows it live.

### §4.3.1 · The panel opens on the current page's own main work tab — owner-approved 2026-10-05

**The right Working Panel on each module page shows that page's own main work tab, selected by
default when the panel opens.** The panel structure, style and interaction are shared (Info + module
tab, §0.2); each page supplies its own identity, work content and authorised actions. The labels are
the current COPY page/object names: SO Batch Purchase page → main tab `SO Batch Purchase`; Purchase
Orders page → `Purchase Order`; Manual Purchase Request page → `Manual Purchase Request`. A related
`Sales Order` tab keeps its approved capability and uses the shared embedded SO component (§4.3.3).
There is no generic `Purchasing` main tab. The Sales Orders page's standalone SO card keeps
`Info · Delivery` (§4.3.3).

### §4.3.2 · The outer identity belongs to the host module

The Header always describes the **main record that is open**, with the shared structure and style:
a Sales Order is the customer (name · SO No · phone · `Customer’s original` / `requested delivery`);
a Purchase Order is the supplier · PO No (with its PO state); a purchasing round is the round time and
date (with `Missed` / `Done` through `referenceStatus`); a GRN is the supplier and GRN No. **`Info`
always describes that main record.** No customer, address, amount or date is fabricated where the
source has none (empty header slots collapse). Module work lives in its own tab; write ownership stays
with the owning module, and the panel only reaches its existing governed doors. A module tab reads its
own source; a missing or failed read stays explicit inside that tab. Current work in a tab uses the
existing task identity, duty/person and source action: fact, blocker and authorised next step stay
together; exception inputs sit beside the affected field or goods; submission feedback distinguishes
pending review from completed stock, payment, delivery or approval. No new panel engine.

### §4.3.3 · Standalone and embedded Sales Order — owner-approved 2026-10-05

| | Standalone SO card | Embedded SO (`Sales Order` tab inside a host panel) |
|---|---|---|
| Where | the Sales Orders register (and any surface whose main record is the SO) | a PO panel, a purchasing round panel or another approved host whose main record is not the SO |
| Identity | the dark shared Header (customer · SO No · phone · original requested delivery · ↗ · ×) | light identity in the tab: name, underlined SO No → saved PDF, phone, two-line `Customer’s original` / `requested delivery`, `31d · Sat, 31 Oct` (original revision-1 date minus Proceed date, calendar days), ↗ full SO page. No second dark header, no nested tabs, no × |
| Tabs | `Info · Delivery` | none inside the tab |
| Opens with | Info: address and sales facts open; Items, Communication and Timeline closed | address and sales facts open; money; the items table shown by default with `Item · Qty · Unit (RM) · Disc (RM) · Amount (RM)` |
| Component | `CompactModuleCard` | the same component in its embedded presentation |

A single-SO card whose Header is already that SO does not embed the same SO again. **Delivery: the
embedded presentation's code and exact measurements are being delivered by the controlled build on
branch `codex/embedded-sales-order-tab`** (BUILD IN PROGRESS at the time of writing; its measured
numbers join 01 §7.6 and its rules join the card contract when it merges).

### §4.3.4 · Adoption by module

| Module / host | Panel | Status | Evidence / owner |
|---|---|---|---|
| Sales Orders register (Table and Cards) | standalone SO card, `SalesOrderCompactView`; Info · Delivery | PRODUCTION VERIFIED 2026-10-05 for the confirmed corrections; the 2026-10-05 Info layout (#1915) and the original-date header (#1919/#1920, `9294659a2`) are DEPLOYED with live acceptance not yet recorded | PR #1893/#1896/#1897 merge `2ce91e2d` (deploy 37213753695); Orders MASTER owns the business path |
| Delivery tab (inside the SO card) | `DeliveryBrief` summary + Delivery-owned editors | DEPLOYED with the SO card; editors reuse Delivery's governed doors | Delivery MASTER |
| SO Batch Purchase quick view / Cards | `SoBatchCompactView`; opens on main tab `SO Batch Purchase` (§4.3.1, target) | DEPLOYED (#1891); its header still shows the current request with a today-based countdown — the original-date fix is LOCAL ONLY in the Purchasing lane | Purchasing MASTER §9.1 |
| Receiving (GRN) | `ReceivingCompactView`: supplier/source + GRN No, `referenceStatus` `Cancelled` | DEPLOYED (#1894); wrapped summary labels PRODUCTION VERIFIED (#1906, `d4cca587`) | Purchasing MASTER §9.4 |
| Purchase Orders (PO working panel) | supplier · PO No + PO state; Info · `Purchase Order` (default) · `Sales Order` (embedded, §4.3.3) | tabs owner-approved 2026-10-05; the layout of the work content is PROPOSAL, localhost first; a `GRN` tab is pending owner decision; PO quick panel NOT BUILT (stale PR #1859 not authorised) | Purchasing MASTER §9.3 |
| SO Batch Purchase purchasing round | round time/date + `Missed` / `Done`; Info · `SO Batch Purchase` (default) · `Sales Order` (embedded) | tabs owner-approved 2026-10-05; the layout of the work content is PROPOSAL, localhost only; NOT BUILT | Purchasing MASTER §5.6.1 |
| Manual Purchase Request | Info · `Manual Purchase Request` (default) · related `Sales Order` (embedded) per its approved capability | APPROVED TARGET / NOT BUILT (owner 2026-10-05) | Purchasing MASTER §9.2 |
| Warehouse | a `Warehouse` tab in the shared panel | APPROVED TARGET / NOT BUILT (§0.2) | Stock MASTER |
| Workspace Work right panel | Workspace §5.10 composition | Governed by `docs/workspace/MASTER.md` §5.10 (deployed §5.9 Logistics; rest NOT BUILT); not yet aligned to this card | Workspace MASTER |

**Open items on the card** are in §7: the compact-card token decision, 40px phone tabs, the editable
`To` versus Work's recorded channels, the native Input/Textarea cascade, the preview-versus-kit
differences, ↗ only with `onOpen`, the link-style button inside the card and "several SOs → list first".

## §4.4 · Document preview — the document the other party receives

- **Document composition follows the owning object rule.** Ordinary viewing is one facts flow except
  explicit object rulings. Formal **PO View** shows original read-only information and the actual
  current PDF in equal panes and never enters Edit (owner 2026-10-04, Purchasing MASTER). Pressing
  Edit shows the right half as the document the other party will receive, redrawn as the left half is
  typed.

```
SPLITS      PO · Consignment Order · Consignment Return · Purchase Return · Repair Order ·
            Supplier Claim · Goods Receipt (GRN)
NEVER       Display Request
EXCEPTION   Manual Purchase create / returned-request edit: internal MPR preview (owner 2026-09-22;
            Purchasing §9.2) — left form, right live MPR preview, `Request Details → Delivery → Items`
            on both sides; the saved MPR detail and its register do not split; MPR → Issue PO reuses
            the Review Purchase Orders composition and never relabels the MPR preview as a PO
GRN         official A4 for supplier and auditors: object and Amend Receiving use the 50/50 official
            preview (owner 2026-09-06, Purchasing §9.4); GRN composition and arithmetic are Purchasing's
PAYMENT     the customer-facing 50/50 composition is used only while editing a customer message/Invoice,
            recording Payment or sending — Payment MASTER owns it
```

- **The preview surface:** `PdfPreview` (fit to width, zoom, its own scroll, explicit loading/error with
  Try again) under `PdfPreviewHeader` — a wrapping document title naming the actual document number
  (the SO instance: `Sales order PDF · {actual SO number}`; other titles need COPY), source-owned actions (`Download` disabled until the saved file exists) and a named icon Close, in
  one row; zoom on the next row. Identity and Close stay available during loading and error. Closing
  returns focus to the opener. The compact card opens its saved document from the document number
  (the SO instance is in the card contract).
- **Versions stay separate:** current, proposed, last-sent and historical documents are labelled
  accurately and never mixed; a failed PDF capture after a business success is not a failed business
  act and is not a reason to repeat it.
- **Register list PDF** (a listing output, never mistakable for a business document — no letterhead,
  terms or signature): Excel and PDF derive their cells once; the list PDF opens in the in-page
  `Modal` + `PdfPreview` with Download. PRODUCTION VERIFIED (PR #1911, `5604b06d`, deploy 37248636367).
- **Document numbers:** every module follows COPY-STANDARD's two-digit-year display contract through
  the one shared `documentDisplayNumber` (`packages/shared/src/document-display.ts`, PR #1890) on lists,
  panels, pages, related records, search, Work and previews; stored identities and issued documents
  never change; never apply it to supplier-owned references. Adoption is verified per surface.
- **Printed documents** follow `docs/pdf/DOCUMENT-KIT.md`; screen heading styles never recolour a PDF.

---

# §5 · The right Quick Rail

**APPROVED TARGET / NOT BUILT (owner direction 2026-09-24).** Three quick-reference doors:
**Calendar · Customers · Activity** (`Customers` admitted in COPY 2026-09-26).

- **Calendar door — icon only (owner ruling 2026-10-05):** no visible word; tooltip and accessible name
  keep `Calendar`. Calendar is the one shared quick calendar for every module (approved 2026-10-04).
- **The rail's My Work door becomes Customers** — the customer quick check (approved 2026-09-24/26);
  APPROVED TARGET / NOT BUILT, production still mounts My Work.
- **Detailed content blueprint incomplete:** the complete right-rail blueprint (Calendar · Customers ·
  Activity) is being prepared for owner review; the
  [discussion Card](../cards/SHARED-UI-calendar-work-activity-discussion.md) is the current PROPOSAL.
  Whether Customers and Activity are also icon-only is PROPOSAL (§7.4), not law.

Every portal shows the rail and each person sees only what their permissions allow (today it is mounted only in the Operation
shell — a build gap; scoping for external portals is PROPOSAL in the
[discussion Card](../cards/SHARED-UI-calendar-work-activity-discussion.md)). Formal Work stays at its
Workspace destination; no Work badge on the rail. **Measured 2026-10-05:** `OperationRightRail.tsx`
still mounts Calendar, My Work (`TasksPanel`) and Activity — the difference is a build gap, not a
competing design.

**One job, two doors (owner-confirmed 2026-09-25).** A job can be done from Work or on its owning
module page; both use the same module action and write the same record. Done means the source fact
exists — the Work item closes everywhere; nobody presses `Done`. The rail only reflects and links:
Activity shows who · when · what; the customer's history shows the event; Calendar changes only when a
dated arrangement changes. No rail door performs or completes a job.

**Calendar (owner-confirmed 2026-09-25; shared all-module calendar owner-approved 2026-10-04, NOT
BUILT).** One right-rail Calendar, never a calendar page per module. `All modules` shows only
authorised, implemented dated event types, with `Filter by module` and `Filter by location` where the
source supports location. Each module reports its own dated arrangements in its own words (never a
mixed `5 jobs`; zero prints nothing); a row opens the owning page on that day, filtered to that kind,
and Back returns to the same day. One event, one owner, one count (a supplier arrival counts once,
under Warehouse, from the `warehouse-schedule` projection; Receiving reads it, never republishes it).
A source that fails says so and never prints `0`. Not on Calendar: Work to-dos, Issue Tracker, private
HR facts, unbuilt modules. Contact deadlines belong to the Logistics company
(`{n} {company} contact deadline(s)`). The day comes from the BOOKING through the one shared rule;
day chips print actual days (never `Today`/`Tomorrow`; `This week` survives as a span) with the
portal's one date string.

```text
Calendar                                    [×]
Everything you can see · Updated 10:42
[Thu, 24 Sep] [Fri, 25 Sep] [This week]      month grid below
FRI, 25 SEP
Delivery      2 scheduled deliveries      ›  Delivery Monitor ?date=
Warehouse     1 arriving                  ›  ?tab=warehouse-arrival-schedule&date=
Payment       2 promised payments         ›  Payment Monitor ?day=
```

**Customers (owner-confirmed 2026-09-26).** Read only: search by name, phone or saved order number
(exact phone/number first, then name; nothing opens by itself); `Matched by phone` versus a separate
`Possible match`, never merged; permissions decide what exists; the selected customer's orders and
recorded history link to their sources; Logistics contact reads as the company's act recorded on its
behalf. A different job from Work's Customer card (Workspace §5.10); both read the same records.

**Activity** previews recent append-only events within the person's permissions and links to their
objects; it never replaces an object's History. No stored value reaches the screen untranslated and no
`—` stands in for a value (COPY-STANDARD).

**Frozen:** the rail reads and links; a source module owns every change and completion; selecting a
customer never silently filters Calendar or Activity; a filter can narrow access, never widen it.
**A page never resolves Duty** (owner ruling 2026-09-01): every action surface renders the resolved
owner from the one Work Engine Action contract (`../ERP-ARCHITECTURE.md` Law F.1); only Settings →
Staff & Duties edits assignments.

## §5.1 · Work owner and two-line action grammar — OWNER-APPROVED / LOCKED 2026-08-14

- **Owner is structured identity, never sentence copy:** the governed compact avatar/initial chip;
  hover and accessible name expose the full name. My Work omits the current user's avatar; Team Work
  groups by owner (avatar · full name · `{n} actions to do · {n} late`). My Work is every employee's
  default, including a manager's.
- **`Assigned to` / `Completed by` (owner ruling 2026-09-29, APPROVED TARGET / NOT BUILT):** current
  responsibility reads `Assigned to`, the actual performer `Completed by`; `Updated by` records an
  update; `Assigned by system` and timestamped movements belong in history. Normal owner, Acting
  owner, Buddy cover, Covering a person and Temporary owner leave routine pages, tooltips and filters.
  Assignment never stops another authorised person from helping; one owning business fact completes
  the Work everywhere (Workspace §3).
- **Action owner template (owner-approved 2026-09-03):** identity in the row/card header, owner in
  structured metadata, the sentence carries only the act; counts name concrete work
  (`5 customer balances need collection`), never abstract `open`/`late` totals.
- **Two lines when both fact and act are needed:** line 1 the fact/problem, `text-body` 13 semibold;
  line 2 the act, `text-label` 11 at `font-normal`, quieter but readable (owner ruling 2026-08-15).
  Never blend the two into one clipped sentence; do not repeat context the row already supplies.
- **A register cell carries the FACT alone (owner ruling 2026-08-18, extended 2026-09-04):** no action
  clause, owner avatar, owner name or duty holder in a register cell, and no `Work` column; a cell's
  second line is supporting evidence, never an instruction. Actions live in My Work, Team Work, the
  Order Route, the Working Panel's module tab and detail panels. **A left mission rail may present
  source-owned missions (§6.1); it never calculates its own work or owners.**
- **Ruled exceptions (no other register copies them without its own ruling):** the **Payment Monitor**
  `Payment timing` cell (owner ruling 2026-09-12, re-ruled 2026-09-16; Payment MASTER §3) — a control
  listing whose last column shows the fact and the shared Work item's own action with its resolved
  owner avatar; the **Delivery Monitor** `Delivery Status` column (Delivery MASTER §8.4) — one status
  word set from one function, no avatar and no second action; the **Delivery schedule card** — two
  facts on two lines (journey progress, then readiness/blocker) and a type label, never summed
  (Delivery MASTER §§8.2, 8.4). **Delivery Work sentences** are two structured lines: act with
  recipient (`Call NETS`), then the required result (`Confirm the delivery date`).
- Missing optional facts render the governed neutral empty value; a missing required fact that opens
  work renders the fact plus its action; a bare `Not recorded` never impersonates a warning.

## §5.2 · History and revision three-rank record grammar — OWNER-APPROVED / LOCKED 2026-08-27

History and Revisions answer in five seconds: **what happened · who did it · when · the important
result.** Up to three lines in fixed order (omit an inapplicable third; never an empty line):
1 what happened — `text-body` 13 semibold; 2 who and when — `text-meta` 12 regular (real staff name +
role + `fmtDate()` date/time); 3 the important result — `text-label` 11 `font-normal`. Never
concatenate actor, role, action and raw fields into one dotted sentence.

**Staff identity law (Jess 2026-08-27):** `Who did it?` is a PERSON, never a permission. Every staff
member has an individual account; every write stores the individual `user_id`, resolved to the real
display name (`Jess · Principal · Thu, 27 Aug 12:30` · `Recorded by Jess · Thu, 27 Aug 12:30`;
forbidden: `principal · Principal`, `Recorded by principal`, `Unknown user`). `System` appears only when
the event's own facts prove automation acted. An unrecoverable old actor reads
**`Staff identity not recorded`**. A logistics company answering through its external link is
**`{company} via external link`** — an organisation, never a person (owner ruling 2026-09-24). A
Revision uses the same ranks and stays a complete-version door (Rev 1 `Original order`).

```text
Order created
Jess · Principal · Mon, 24 Aug 11:16
No deposit · Online order
```

**Acceptance:** a staff member who did not build the screen answers all four questions within five
seconds, or the record fails.

---

# §6 · Listing

## §6.0 · Listing template — every Portal listing (one page)

**Read this first for any listing.** The reference page is the Sales Orders Register
(`SalesOrdersRegister.tsx`; Orders MASTER). Adoption is per page and is not proof of build.

```
0  KIT      One kit, every page (ONE KIT LAW 2026-09-27). Card/panel/block titles black bold
            text-strong 15/600, never blue, never a band. No dash as a value anywhere.
1  PAGE     Shell header row (§4) → active filter chips (only while filtered) → toolbar:
            count/summary left; Search 220×32 · Table/Cards (where admitted) · far-right ⋯ Page
            tools (Export, Columns, module presentation items) right; a create button ONLY where
            the module is the record's birthplace (Sales Orders has none) → table → 32px footer.
            Nothing above the table. Mission rail on the left (§6.1); Working Panel on the right (§4.3)
2  COLUMNS  Defaults = the module MASTER's owner-approved order, never guessed. Record date(s)
            first, then the document number (§6.7 rule 2). Row click / Cards View opens the
            Working Panel; the identity number is the door the module MASTER rules; another
            document's number opens that document. Other permitted facts come from Columns (§6.3)
3  WORDS    Only COPY-STANDARD words. A required fact prints no absence word (empty = system
            error). An empty cell draws NO glyph, never `—`. A document not made yet: `No PO yet` ·
            `No DO yet`. Loading · `Could not be loaded` + `Try again` · empty — never mixed
4  WIDTH    Only from REGISTER_FIELD_WIDTH (§6.11). A missing field is added there
5  ROW      SO-derived template (SO, SO Batch, Purchase Orders): row 32px at a grid canvas
            ≥768px, text 12/18 (below that canvas the 40px checkbox target grows rows — §7.2).
            Other listings keep their scoped recipe (engine default 38px) until their adoption
            round. 8px left/right in every cell · 1px lines between cells · header 36px 11/600 ·
            footer 32px · 8px gaps. Second fact in a cell (where approved): 11px slate-11. One line
            per cell; a long value ends in … and shows whole on hover and focus; dates and numbers
            never cut; the row never grows. Own approved heights: Delivery Monitor and Payment
            Monitor 72px; two-line goods rows 51px (§6.8)
6  HEADER   11px/600 grey band; the filter icon shows on hover, focus or while filtered — never
            on every column at rest; sort = a 12px ArrowUp/ArrowDown icon, spoken to a screen reader
7  EXPAND   ▸ opens the record's goods and related facts (§6.9) — one job, not a second panel.
            Item = product name on line 1, configuration on line 2
8  GROUPS   Only where the module MASTER approves them; optional `Group by` in Page tools
            (Sales Orders: None default, Delivery / Stock / Payment Status)
9  FILTER   Active chips above the toolbar · neutral `Clear all` · footer `{n} of {m}`
10 SELECT   Ticking replaces the toolbar in place; no buttons inside rows
11 PHONE    The document number is visible on first screen; the table scrolls itself; the page
            never scrolls sideways
12 CHECK    1440 / 1180 / 820 / 390 · 200% zoom · keyboard · §2.2 checklist
```

Numbers for this template are in [01 §7.5](../01-design-tokens.md#75-accepted-so-derived-template--measurement-lookup).
**Delivery record:** owner accepted the rendered Sales Orders pilot as the shared template on
2026-10-01 and it is PRODUCTION VERIFIED (PR #1838 `c926e3f7` and #1839 `f04ed27c`, deploy
36886061086; follow-up #1840). Optional grouping and related-document columns: PR #1850 (`2fbc2b62`,
deploy 36984977880). The template is confirmed; not every module has migrated.

## §6.1 · Left mission rail

**The mission rule — owner ruling 2026-10-05 · APPROVED TARGET.** The left rail tells the operator
what work needs doing on this page, from **source-owned** task or mission facts. Its counts come from
an independent business source — never from the filtered or loaded table — and it reuses the
existing source/resolver authority (Work Engine, module projections): no second task engine,
ownership resolver or completion counter. It may scope the listing to the records of a mission.
Module business facts differ; the rail grammar does not.

**Three things the operator must be able to tell apart:** a **mission entry** (work to do, counted by
its source), an **ordinary filter** (narrows the same records; its count follows the shared facet
semantics in §6.7) and an **optional work mode** (a manually started mode such as SO Batch
`Match Ready Stock`). Listing filters stay available through the shared grid header filters; status
filters stay in their columns. Anything a module needs that the kit rail lacks is a PROPOSAL and a
KIT GAP, never a page-local control.

**The Sales Orders rail is the SO instance, not the mission rule.** Sales Orders owns no work: its
Order summary (Sales orders · Total payable · Paid to date · Balance due) and the
`Customer’s original requested delivery` shortcuts, with Monthly demand's stacked views, are SO
presentation (Orders MASTER) and measured implementation evidence — not a licence to make every
module rail a filtered-table summary. The right-side Calendar keeps its role (§5); this rule
redesigns nothing there.

**The one rail grammar — APPROVED / LOCKED, built in `workspace-rail.tsx`:**

- **Shell:** `FilterRail` / `FilterRailGroup` / `FilterRailRow`, 240px wide, flush beside the
  register with its border; never squeezed below 240px (the register scrolls instead); scrolls
  vertically as rows grow. Navigation, not batch selection: no checkboxes. Numbers: 01 §7.3.
- **Groups are headers first** (owner ruling 2026-09-28): icon + 13/600 slate-12 title, no description
  line; every group closed until opened (remembered per rail and group,
  `carres.filterRail.<rail>.<group>`); a closed group still shows its chosen value on its header; a
  closed group's rows are not drawn. Two views of the same records are a kit `Tabs` bar at the top of
  the rail (Sales Orders stacks its two views and opens Delivery first — Orders MASTER).
- **Rows:** a governed label is never truncated and never hidden behind a tooltip — it wraps; the count
  stays visible and right-aligned; the active row is the `NavRow` treatment (`rounded-control`,
  `blue-3` wash, a straight 2px `blue-9` line inset left, slate hover for the rest); zero-count active
  filters stay readable and removable; unknown is not zero.
- **Compact fact dropdown** (owner ruling 2026-09-11): a long, growing fact list (`PRODUCT`, `SUPPLIER`,
  `PURCHASE PURPOSE`) collapses into one `FilterRailSelect` — the same single-slot filter, `All …` first,
  the count in the option text (`Ohana · 4`), the active treatment when narrowed; never multi-select.
  Daily worklist and timing lenses stay rows.
- **Fixed header + month calendar** (owner corrections 2026-09-06): `FilterRail` may carry a fixed
  `header` block above independently scrolling groups; its governed content is the kit
  `MonthCalendar` — pick a day to narrow, pick again to clear, ‹ › one month, Sunday muted, a count
  under the date with the same fact in its aria sentence, today a ring and the selected date the blue
  fill, the current work week a subtle band. Nobody draws a third month grid.
- **Collapse** (owner ruling 2026-08-27; BUILT 2026-09-17): `Hide filters` removes the whole rail and
  gives its width to the register, which then carries `Show filters`; the browser remembers the choice.
  Below an **896px available canvas** (after shell rails, not the viewport) the rail starts hidden
  unless this browser opened it before, and opens as an overlay with backdrop and Escape, keeping the
  chosen filters. Use the sidebar's panel-left icon pair, never a chevron or `X`.
- **No `Clear filters` inside a rail** (Sales Orders, Purchase Orders): click a chosen facet again to
  clear it; selects keep `All`; the shared condition strip keeps its own clear.
- **Special rails** (Payment Monitor weekly plans, Warehouse schedule day lists) use the same heading,
  divider and text treatment and keep their content and date meaning.

**Per module (adoption of the mission rule):** Sales Orders — SO instance as above (owns no work).
SO Batch — `TO ORDER` / `ORDER TIMING` rows from the planning engine (BUILT); its round rail
(`Match Ready Stock → Missed → Today → PO Safety Days → Completed rounds`) is PROPOSAL, localhost only.
Purchase Orders, Receiving, Supplier Claims, Purchase Returns, Manual Purchase, Warehouse Inbound and
Outbound, Delivery Monitor, Payment Monitor — the built rails are factual-filter rails on the shared
recipe; their mission entries are APPROVED TARGET / NOT BUILT and need a measured adoption round with
the source each mission count reads. Exact rail sections live in each module MASTER. **KIT GAP:** the
accepted complete rail composition still lives in `.so-template-rail` with SO-specific selectors; it
must be extracted and admitted once before any module claims plug-in reuse.

## §6.2 · Shared listing — one engine, one interaction contract

Every module uses the **same `register/DataGrid`, toolbar and interaction contract**. A module supplies
only: record grain, default columns, optional columns, real data, business filters, permissions and
actions. **A component existing is not whole-page adoption** — each page proves adoption by §2.2.

| Capability | Status | DataGrid prop / source | Note |
|---|---|---|---|
| Search | SUPPORTED | built-in box; `searchPlaceholder` · `searchScope` · `initialSearch` · `onSearchChange` · `searchPresentation="responsive"` (`Search: {query}` chip) | 220×32 desktop under the template; the accessible hint names only fields actually searched; server search is the page's reader |
| Table / Cards | SUPPORTED | `presentationTools` + `renderResults` (Cards consume the grid's exact sorted/filtered result) · `presentationKey` | Adopted: Sales Orders, SO Batch, Purchase Orders, Receiving. Kit `Tabs` segmented with `Table2` / `LayoutGrid` icons and visible words |
| Page tools `⋯` | SUPPORTED | `presentationTools` menu: Export · `outputActions` · `pageToolsItems` · Columns | Entries icon + text; page tools never write business records |
| Columns (show/hide, grouped chooser) | SUPPORTED — parent columns only | column `defaultHidden` · `chooserGroup` · `chooserGroupOrder` | Expansion columns are not listed (§6.3, KIT GAP) |
| Sort | SUPPORTED | column `sortable` · `sortFn` · `onSortChange` | 12px arrow; grouped listings sort the whole register once |
| Per-column filter | SUPPORTED | column `filterable` · `filterType` · `filterValue` · `dateValue` · `numberValue` | Every filter matches its column type (dates get presets and Between…); paged registers use `serverColumns` |
| Active conditions | SUPPORTED | `activeConditions` · `onClearConditions` · `reserveConditionRow` | One removable strip for rail + column + search conditions; neutral `Clear all` |
| Drag order (columns) | SUPPORTED | header drag; layout per `storageKey` | `leadingColumns` / `pinnedPrefix` columns cannot be dragged or hidden |
| Drag order (rows) | SUPPORTED (opt-in) | `rowDrag` | Keyboard Alt+↑/↓; the page persists |
| Drag width | SUPPORTED | resize handle; column `width` / `minWidth` from `REGISTER_FIELD_WIDTH` | `Best fit` in personal layouts; the last handle stays inside the table |
| Pinning | SUPPORTED | `leadingColumns` (date + identity; `.before` for an approved leading column) · `pinnedPrefix` · `stickyIdentity` (older) | ≥768px canvas pins date + identity; below pins identity only |
| Select / select all | SUPPORTED | `selectable` (`isSelectable`, `unselectableReason`, indeterminate parents) · `selectionSummary` · `selectionPrimary` · `selectionActions` | A group header selects only its group (PR #1912 `a929e90d`, deployed; live check not recorded) |
| Grouping | SUPPORTED | `fixedGroups` (governed, §6.10) · `initialGroupBy` · `allowColumnGrouping` · `countsInGroup`; optional `Group by` via `pageToolsItems` | Sales Orders optional grouping released (PR #1850); the choice rides the route parameters — browser/account persistence beyond the URL is not built; one grouping at a time, never duplicating a record across groups |
| Expansion | SUPPORTED | `expandable` (`renderExpansion` · `flush` · `alignToColumn` · `fitExpansionToViewport` · `trigger` · `defaultExpandedKeys` · `revealExpandedKey`) + `GoodsMiniTable` + connector | §6.9 |
| Identity link | SUPPORTED (page-rendered cell) | `leadingColumns.identity` + the page's link cell · `onRowClick` · `onRowDoubleClick` | No generic identity-link prop; Enter = double-click |
| Export (current view) | SUPPORTED | Excel and list PDF from one derivation: column `exportValue` · `exportLabel` · `exportName`; selection exports the ticked rows | List PDF in-page preview PRODUCTION VERIFIED (#1911) |
| Paged full-population export | SUPPORTED | `loadExportRows` | Receiving first; PRODUCTION VERIFIED for Excel (#1905, `a087fec9`); live PDF-list download of a paged register not claimed |
| Server-side column filter/sort | SUPPORTED | `serverColumns { values, onChange }` + shared `register-column-query` | PRODUCTION VERIFIED on Receiving (#1899/#1901, `5c04b662`) |
| Footer | SUPPORTED | 32px status footer: `statusSummary` · column `footerTotal` · filtered `{n} of {m}` | Information only; never a second toolbar |
| Loading / error / empty | SUPPORTED | `isLoading` · `errorState` (opt-in) · `emptyMessage` · `noMatchMessage` · `warning` (message kind ②) | §2.2 |
| Long text in a cell | SUPPORTED | column `overflowText` (Popover `{column}: {value}`) · column `wrap` (row grows; completeness columns only) · `headerLines` | A page-level `Wrap` tool is a GAP |
| Row stripe | SUPPORTED (opt-in) | `rowHighlight` (`critical` red-9 / `info` blue-9, with a label) | Never paint the whole row (§6.8) |
| Narrow screen | SUPPORTED | grid-canvas rules below 768px (40×40 checkbox target, identity-only pinning); toolbar follows the viewport and never shrinks; filter menus clamp to an 8px viewport inset | Proof per page at 390px; canvas-versus-viewport trigger mismatch is a REAL GAP (§7.2) |
| Keyboard | SUPPORTED | one Tab stop (roving row); ↑/↓ Home/End PageUp/PageDown over the full list; Enter opens; Space ticks; →/← expansion; Shift+F10 / Menu key row menu | 🟡 a keyboard user crosses every header button before the rows |
| Personal layouts (account-saved) | SUPPORTED (opt-in) · rollout APPROVED NOT BUILT | `personalLayouts` (Purchase Orders pilot only, migration 0528); browser layout per `storageKey` for everyone | Other listings wait for owner acceptance of the PO pilot |
| Return context | SUPPORTED | `sessionKey` · `presentationKey` | Back from a record restores search, filters, view, expansion and scroll |
| Virtualization | PARTIAL / GAP | `useVirtualizer` only for flat lists over 25 rows | Expansion or groups are not virtualized — engine debt |
| Expansion columns in Columns | GAP | — | PROPOSAL / KIT GAP (§6.3) |

## §6.3 · Columns and cross-module facts — owner principle 2026-10-05

- **Modules differ by DEFAULT columns, not by table.** Staff add other permitted facts related to the
  row from the **same** Columns menu, grouped by source (`chooserGroup`, named for the owning module).
  Never a module-specific table, a duplicate mini table or a second listing engine for "other
  modules' facts".
- **Fields come from the owning module.** Viewing never grants editing; no business truth is copied
  into another module's store; the owning module's arithmetic is the one arithmetic (ERP Law D).
- **One-to-many facts state their aggregation** — e.g. `PO No` lists every linked number, each its
  own link (SO Batch, Purchasing §9.1); never one arbitrary PO or Unit, never duplicated parent rows.
- **Future fields extend the same column configuration** (the same column definitions and chooser),
  never a new table. A field joins with: business meaning · owning source · record relationship ·
  default or optional · filter/sort/export behaviour · how several related records show · its
  unknown/error/permission treatment. A shared fact (SO number, Proceed Date, customer) is reused once,
  not duplicated under each module.
- **Do not claim every module's fields are available.** What exists today is per page; a new
  cross-module field is approved per module (Purchasing's SO Batch field inventory is localhost only;
  new cross-module fields there are NOT approved).
- **Main table versus goods expansion are separate choices.** Today the Columns menu lists **parent
  columns only**. An opt-in "expansion columns" capability (e.g. `expandable.columns`, optional goods
  columns OFF by default) is **PROPOSAL / KIT GAP** — Purchasing asked for it; the owner has not
  decided (§7.4).

## §6.4 · Register interaction rulings still in force — Loo 2026-08-08

```
②  EVERY FILTER MATCHES ITS COLUMN — a date column gets This week · Next week · No date ·
    Between…, never a textbox
③  ITEMS READ AS HUMAN WORDS — `King Mattress`, not `B1201S-K`; the SKU rides the hover
⑥  SAVE IS DISABLED UNTIL SOMETHING CHANGED
⑦  HISTORY GROUPS BY Today · Yesterday · Earlier, never a flat list of dates
⑩  NO Refresh button (data refreshes itself) · Close, never Back, on a panel · no spare header height
```

- **C1 · a date is never blue.** Blue marks the current thing and the primary action only; emphasis
  comes from size and weight; `Outstanding` takes amber/red only when genuinely late.
- **C2 · one search AND per-column filters.** A caller says "I'm Umi" — a name or a phone? Keep ONE
  search over the register's governed fields beside the per-column filters (AutoCount does both).
- **C3 · A REFETCH MAY NEVER CLOBBER AN OPEN EDIT.** Auto-refresh pauses while a panel or form is
  dirty (asserted in `SalesOrderWorkspace.ui-contract.test.ts`).

## §6.5 · Register chrome — toolbar, selection, messages, footer, density, boundary

The local filter/mission rail recipe is §6.1; this section holds the register's own chrome.

- **Tabs are avoided by default — APPROVED / LOCKED (Loo 2026-08-11).** Separate jobs, owned records or
  destinations are separate navigation entries. A tab row is admitted only when every tab stays inside
  the same owned object, the same responsibility and the same primary work, and switching changes only
  the view or partition. The default register stack has no tab row: header → toolbar → work surface.
- **Toolbar (owner-approved 2026-10-01; accepted SO template).** Search, the current filter summary
  and admitted Table/Cards stay visible; supported secondary tools (Export, Columns, module
  presentation items) live in the fixed far-right `⋯` with icon + text; Wrap/reset only where actually
  supported. Count and quantity sit in the footer (and the governed rail summary), not the toolbar.
  On narrow screens secondary tools overflow first and controls may wrap; an active filter or query is
  never silently hidden. The 48px toolbar candidate is NOT APPROVED. `Reset columns` lives inside
  Columns. Header filters are the per-column door; no duplicate generic Filters button. A scope such
  as `All orders` / `Not delivered` is a filter or a saved view, never a permanent row of pills; a View
  control appears only for a genuinely distinct view (Supplier Claims shows all permitted records and
  has no View selector, owner correction 2026-09-07).
- **Order:** active filter chips → toolbar → table header/results, in Table and Cards alike; the chip
  row is absent when nothing is filtered, except where a module opts into `reserveConditionRow`
  (Purchasing, owner 2026-10-02). No `Showing only` prefix; each chip has its remove button.
- **Toolbar shape language — APPROVED / LOCKED.** Controls that choose or configure a view (View,
  Search, Columns, overflow) use the 6px `rounded-control`; a visible verb that acts immediately (New,
  Scan, Clear, explicit Export selection actions) uses the kit `Button shape="pill"`. At most one
  primary blue action per toolbar state.
- **Selection replaces the toolbar in place** — same height, the table never moves: left = truthful
  count (in the page's own unit where it has one) + `Clear` + the primary work action with any
  structured owner context; right = outputs and secondary actions valid for that exact selection
  (`Export Excel ({n})`). A one-record action disappears on multi-select. With rows ticked, Export can
  also produce the documents those rows own (`Print {n} sales orders`, one governed page per order,
  assembled server-side) — never confused with the list output.
- **The three message kinds — only one may move the table.** ① **Selection** replaces the toolbar.
  ② **Warning** — a real business blocker as a 40px band between toolbar and table (`DataGrid
  warning`: `role="alert"`, amber), only while its fact is true; never a permanent band or KPI strip.
  ③ **Result** — a toast in the fixed bottom-right tray (§2.2). A ticked checkbox never moves the table.
- **Status footer — APPROVED / LOCKED (Loo 2026-08-11).** One 32px always-present footer fixed to the
  table frame; it states the listing's total summary, the selected business summary in the page's
  unit (`Mattress 5`) while rows are ticked, and narrowed-versus-total when filtered. Information only:
  no action, Columns or Reset. When one number would answer two questions it prints both and names
  them (Stock: `85 you can promise · 893 pieces you cannot`). Each module MASTER owns its vocabulary
  and arithmetic.
- **Density — APPROVED / LOCKED.** The readable baseline is a 36px header (`text-label` 11/14) and a
  single-line parent row through frozen tokens; the accepted SO-derived template sets that row at 32px
  (§6.0 rule 5) and other listings keep the 38px engine default until adopted. Ruled exceptions: the
  Delivery Monitor work list (owner 2026-09-12) and Payment Monitor listing (owner 2026-09-16) use a
  fixed 72px row through the shared `MonitorTwoLines` (one fact + one supporting line, never a third;
  a cut value opens whole). Rows are gained by removing chrome, never by squeezing below the template.
- **Listing boundary — owner correction 2026-08-31.** A full DataGrid has **no enclosing outer
  border**; the toolbar keeps its bottom divider, the table its header/row/column lines, the footer its
  top divider. 8px breathing room above and below; available height fills with complete rows (one
  fewer row rather than a compressed one); no designed blank region while more results exist.
- **Display rules shared by every listing:** Excel and PDF derive cells once and the list PDF prints
  the current view with no letterhead, terms or signature; `Showroom` prints the place without
  `Carres ` (display only; `Deliver To` keeps it, owner ruling 2026-08-15).

## §6.6 · Sales Orders — the reference register

Sales Orders is the production reference for the shell, register and object/edit templates. Its
column order, population, Proceed/SO Doc Date semantics, expansion columns, related-document columns,
Monthly demand, summary rail and amendment rules are owned by **Orders MASTER** ("Sales Orders
Register — find truth, never assign work" and "Sales Order accepted shared UI template"); this MASTER
does not repeat them. It is a truth register, not Work and not a dashboard. Creation stays in the
Sales Portal (no New Sales Order or Copy order in Operation). Production history: the ERP shell and
SO reference were verified 2026-08-14 (PR #795, `759d49ef`); the accepted 2026-10-01 template is
recorded in §6.0; the compact card in §4.3.4.

## §6.7 · Shared listing standard — owner approved 2026-09-16, staged adoption

1. **Search and filters.** Show active conditions and `Clear filters` whenever search, rail or header
   filters narrow the list; clear all three together; preserve permissions and the governed base
   population; the footer shows filtered versus total (`5 of 62`). Grouping is presentation, not a
   filter.
2. **Date and identity lead — APPROVED (Jess 2026-09-17).** Every listing begins with its own record
   date, then its document number. Canvas ≥768px pins both; narrower pins identity only; neither can
   be hidden or moved by a personal layout (`leadingColumns`). Mappings: Sales Orders
   `Proceed Date · SO Doc Date · SO No` (`Proceed Date` rides `leadingColumns.before`); SO Batch
   `Proceed Date · SO No`; Manual Purchase `Proceed Date · MPR No`; Purchase Orders `PO Date · PO No`;
   Receiving `GRN Date · GRN No`; Delivery Orders `DO Date · DO No`; Payment Records
   `Paid date · Receipt No`. Supplier Claims is the one exception (§7.1). Never invent a date fact;
   exact page orders live in the module MASTERs and are never rearranged by a general heuristic.
3. **A useful default view.** At 1440px with filters open, identity and the facts for the main
   judgement are fully visible in the real shell and font; other columns scroll or sit in Columns;
   never squeeze dates or names, never silently hide approved facts.
4. **Personal columns — APPROVED 2026-09-17 · BUILT, Purchase Orders pilot only.** `Columns` offers
   show/hide, `Save layout as…`, `Load layout`, `Set as my default`, `Reset columns`, `Best fit`,
   `Expand all`, `Collapse all`. Up to 10 named layouts per listing per signed-in user, owner-only.
   A layout saves order, widths, visibility and sort ONLY — never search, filters or group state;
   `Reset columns` restores the company layout (and clears sort). Browser-remembered layout per page key
   applies everywhere. Rollout beyond Purchase Orders waits for owner acceptance of the pilot.
5. **Actions.** Essential actions stay discoverable on the record opened via identity; right-click is a
   shortcut, never the only door; read-only registers get no invented batch actions.
6. **Presentation.** Shared header, typography, palette, icons, row treatment and width registry; no
   separate page theme.
7. **Expansion and states.** Reuse the governed expansion; loading, failure, empty and filtered-empty
   stay distinct; collapsed records stay in totals; missing data never implies zero or completion.
8. **Group-local headers** — §6.10.
9. **Narrow canvas.** Filters use an overlay when they would consume the content; tables scroll inside
   their container; inputs, Back/Cancel and submit stay usable; Cards are an admitted presentation
   where the module offers Table/Cards.

**Facet counts — one reading for every page.** A count reflects every OTHER active filter and the
search, and NOT the selections inside its own group — the only reading under which a count never
promises rows it cannot deliver. Purchase Orders §9.3, Purchase Returns §9.6 and Supplier Claims §9.5
still spell three different readings: converging them is owed, each in its own round (§7.2).
*Falsifier: a measured journey in which whole-register counts read truer — then this changes once,
here.*

### Portal-wide listing readability — BUILT 2026-09-17 (SLICE 1) · authenticated walk OWED

The shared default for ALL listings (owner approved 2026-09-17; PR #1426, `8209ce8c`): `FilterRail`
style C (§6.1); DataGrid draws the slate listing surfaces for every grid (`palette="slate"` means only
the ticked-row selection model); one canvas token `#F7F8FA`; blue-grey register themes retired.
**Text:** main 13px slate-12, weight by hierarchy; table secondary fact 11px slate-11; helper 12px
slate-11; input error/save failure 13px error colour with text and icon; never slate-9 for meaningful
text; no opacity or italics for helper text. **Surfaces:** white toolbar, rail, table and footer;
slate-3 header with slate-11 11/600 normal casing; 1px separators. **Scope:** Sales Orders; SO Batch,
Manual Purchase, Purchase Orders, Receiving, Supplier Claims; Delivery Monitor and Delivery Orders;
Warehouse Inbound, Inventory, Outbound; Payment Monitor, Payment Records and every Finance listing.
The signed-in production walk of every listing is still owed.

**Different jobs, shared interaction:** Sales Orders is the customer-transaction register; SO Batch
uses `To buy` / `No purchase needed`; Manual Purchase `Need approval` / `To buy` /
`No purchase needed`; Purchase Orders its §9.3 groups; Receiving is a formal GRN register, not a queue.
An operator sends a PO PDF outside, then records `PO sent to supplier` — recorded sending is not proof
of supplier receipt (Purchasing MASTER owns the send/version contract).

## §6.8 · Shared goods tables — SO Batch reference (Jess 2026-09-18, BUILT)

SO Batch listing and stock-picker composition is the approved reference for shared goods-table work;
business columns stay in the module MASTERs; no page gains editing or reservation powers implicitly.
Manual Purchase inherits the same capabilities (Purchasing §9.2). Engine capabilities (all opt-in):
`leadingColumns.before`; `headerTone="paleBlue"` (the SO Batch main header band — not a global
blue-header ruling); `GoodsMiniTable soBatchGoodsLayout`; `ReadyStockTable layout="picker"`.

- 8px cell padding, 1px dividers, measured content widths (never equal or stretched); headers reserve
  a common two-line height at 11/600; main/item text 13px with configuration and Unit ID on line two
  at 11px slate-11; consistent two-line geometry with vertically centred checkbox and quantity.
- SO Batch keeps separate leading checkbox and goods-disclosure controls; `SO No` opens the record and
  never carries a decorative arrow; keyboard disclosure exposes its expanded state. A goods row's
  `Ready Stock` cell shows available then reserved with its own borderless disclosure; saved
  selections have one `Change selection` journey; the stock picker shows `PO No / Ref No` with the
  Unit ID on line two and the date only (six-column order in Purchasing §9.1). The parent listing has
  no `Ready Stock` column (owner 2026-10-05).
- **The two-line goods row is 51px** (owner ruling 2026-09-26): 8 + 18 + 2 + 14 + 8 + 1px rule,
  measured on the Sales Orders goods expansion (PR #1518). Every row of a two-line goods table is that
  height; a required party, number, document or date is never ellipsised to protect it.
- **One cell may carry a document and the exact goods it names — never two documents.** Line one is
  the full document number; line two one Unit ID, `{n} Units` as a disclosure into that row's
  expansion, `Counted stock`, or the honest absence/failure word. Never fabricate a Unit ID.
- **Header bands never overlap or leave blank blocks:** every header cell belongs to one opaque band;
  paint order is shared (sticky header above body, pinned above unpinned, pinned header above both).
- **Row highlight** (owner ruling 2026-09-29, BUILT): `rowHighlight` draws a 3px left stripe —
  `critical` red-9 or `info` blue-9 — with its label as hover title and `aria-description`; one row
  height, one word per cell; the reason prints where the row's details live; never paint the row.
- **Refused selection explains itself** (DEPLOYED + authenticated readback 2026-09-24, #1589):
  `selectable.unselectableReason` adds an accessible description and kit Tooltip to a refused box,
  explaining facts already visible on the page.
- **Evidence controls inside a row are icon + text, never buttons:** `Photos {n}` / `Video {n}`, 12px,
  hover/focus tint only, a focus ring, `aria-expanded`; each opens beneath its row independently; a
  count is never printed when unknown.
- **One shared saved-evidence viewer:** `SavedEvidenceViewer` (DEPLOYED #1593; fullscreen focus fix
  #1595; Receiving and Claim photos PRODUCTION VERIFIED; Stock/Service adoption separate). Read-only
  photo zoom/drag/Reset/Previous/Next/Close/Esc and native video; missing is not unreadable
  (`Photo {n} could not be loaded` + `Try again`); file-to-Unit/event relationships stay visible;
  recording evidence stays with the owning record.
- Production walks of SO Batch at 1440/1180/820/390 and 200% zoom are owed per Purchasing §9.1.

## §6.9 · Row expansion — one job, connected to its row

**The contract.** `▸` opens the record's **goods and related facts** as a structured read-only child
table (`GoodsMiniTable`) with real headings, aligned values and exact identity links. Expand has
exactly one job: it is **not a second Working Panel**, not an editing form and never concatenated
prose. Module-specific goods facts stay the module's (receiving and loading results are not forced
into Sales columns). Only explicitly ruled in-place write states (§4.1, Delivery) edit inside it.
Purchasing's approved deletion of SO Batch's separate `Purchase order details` table is
Purchasing-specific and conditional on a localhost proof that no fact is lost — see Purchasing
MASTER §9.1; it does not generalise to other modules.

**The connector belongs to the table (BUILT 2026-09-18 / 2026-09-21).** Only the grid knows where its
caret cell is, so the line is drawn by CSS inside that cell, never by arithmetic over declared widths
(measured failures: summing widths was ~900px wrong on wide canvases; anchoring the frame at a column
put it beyond the fold). The row-to-expansion line drops from beneath the `▸` (50% of the caret cell),
curves in the expansion's pinned gutter and runs flat into `ConnectedSections` at
`EXPANSION_JOIN_Y` = 21px; it holds under sideways scroll. An item's `Ready Stock` disclosure draws a
1px line from beneath its own cell to the TOP BORDER of its stock frame, which spans the full goods
row; it disappears when collapsed and never runs into the next item. The active goods context carries
a blue boundary; the stock frame is neutral white; neither is evidence of a saved reservation. A
padded or viewport-fitted expansion (Delivery Monitor brief) keeps its own first elbow; a plain child
table gets no connector. 🟡 SO Batch's 40px goods header meets the line 8px above its middle;
`connectAt` 20px is Purchasing's follow-up.

**One expanded state per row; a second door is not a second panel.** A row-leading disclosure and an
in-cell disclosure (`Ready Stock` count, Supplier Claims `{n} Units`) open and close the SAME expansion
(`DataGridRowExpansionContext`); the in-cell door also moves focus to the part it names. A per-item
evidence disclosure inside an expansion is its own independent state.

## §6.10 · Group-local headers — owner ruling 2026-09-18 · BUILT (#1462)

A governed grouped listing reads, per group: collapsed = heading + count; expanded = heading → column
header → records. There is no header above all groups; the current group's header is sticky within
its own group and stops at its boundary. Every group shares ONE setting: the same widths, visibility,
sorting and resizing; sorting from any group's header sorts the whole register once. Pinned identity
is unchanged. It is the ENGINE's behaviour for every register handing the grid `fixedGroups` (SO
Batch, Manual Purchase, Purchase Orders); a flat register keeps one sticky header. Structure: each
group is its own `<table>` in one scroll container sharing one `<colgroup>` and `table-layout: fixed`
(one `<tbody>` per group was measured failing — the header escaped its section). A group header's
checkbox selects only that group's selectable rows (PR #1912). An always-open group states its
emptiness beside the zero through `fixedGroups[].emptyLabel` (`Need approval 0 · Nothing waiting for
approval`). *Falsifier: a browser where a sticky
`<thead>` is not constrained by its own table, or groups drifting out of column alignment.*

## §6.11 · Field-width registry — one number per field (owner instruction 2026-09-18)

A page MASTER never carries its own width for a registry field; it records its MEASUREMENT as evidence.
**The registry number is the WIDEST measured requirement across the pages showing the field.**
`MEASURED` = the rendered portal in the real font; `prototype` = not yet measured (a prototype that
clips a governed value is wrong — fix the shared definition, never squeeze the cell). Required numbers
never truncate; content may wrap; user resizing stays. **The registry is code:**
`apps/web/src/components/register/register-field-widths.ts` — a page passes
`REGISTER_FIELD_WIDTH.poNo`, never `168`. Owed convergence is each page's own round.

| Field / role | Width | Status | Evidence, and the convergence owed |
|---|---:|---|---|
| Checkbox / disclosure (each) | 40 | prototype | |
| Date (short date) | 120 | **MEASURED** | SO Batch cross-year 99px → 120; PO widened 118 → 120. **Owed:** Manual Purchase built 112 |
| PO No / MPR No / GRN No | 170 | **MEASURED** | `PO-20260903-4316` 125px in JetBrains Mono; 142 cut 34 live rows. **Owed:** SO Batch and Manual Purchase built 144 |
| SO No | 90 | **MEASURED** | Sales Orders 2026-09-21: `SO-1334` 54.6px + 16; header controls set the floor |
| SO No / MPR No mixed reference | 176 | **MEASURED** | PO, 2026-09-18 |
| Status | 144 | prototype | |
| Approval Status | 188 | **MEASURED** | Manual Purchase: `Sent back for changes` pill 134px + avatar |
| PO Safety Days | 110 | prototype | |
| Order By | 112 | **MEASURED** | Manual Purchase |
| Category (parent) | 112 | prototype | Sales Orders live 2026-10-05 renders Category at 208 — reconcile in the SO round |
| Stock Status (status pill) | 120 | **MEASURED — too narrow** | Sales Orders live 2026-10-05: cuts every `Receipt unconfirmed` pill; widen after re-measuring (§7.2) |
| Qty | 64 | **MEASURED** | header floor 24px + 16 |
| Item / Items | 208 | **MEASURED** | PO 2026-09-18. **Owed:** Manual Purchase built 180 |
| Supplier / Ready Stock | 140 | **MEASURED** | longest live supplier 17 characters; PO widened 136 → 140 |
| Supplier Deliver To | 150 | **MEASURED** | PO. **Owed:** Manual Purchase built 132 |
| Customer | 150 | prototype | one line; a longer name ends in `…` and opens whole |
| Sales Location | 168 | **MEASURED** | `Carres Kota Damansara` 145.4px + 16 |
| Salesperson | 120 | **MEASURED** | `Khoo Aik Yean` 89.2px + 16; header + filter icon 103px floor |
| Sales Orders optional catalog: amount 116 · party name 150 · reference 150 · phone 132 · email 200 · address 240 · place word 140 · short fact 96 · small count 120 | — | prototype | registry roles, not typed numbers. **Owed:** measurement when shown by default |
| Customer Delivery Location | 176 | prototype | |
| Customer Requested Delivery Date | 180 | prototype | **Owed:** re-measure against the longest governed absence |
| PO Delivery Date | 150 | **MEASURED** | wording `PO {n}-Day Delivery Date` (Purchasing §5.7, COPY own the rule) |
| Supplier Confirmed Delivery Date | 180 | **MEASURED** | holds `Not confirmed` and `Supplier changed from {date}` |
| Goods Received Date | 140 | **MEASURED** | holds `{n} receipt dates` and `Time not recorded` |
| Purpose | 150 | **MEASURED** | Manual Purchase |
| Requested By | 144 | prototype | **Owed:** Manual Purchase built 124 |
| Stock Location | 160 | prototype | |
| Unit ID standalone | 140 | prototype | |
| Condition | 120 | prototype | |
| PO Version with send evidence | 265 | **MEASURED** | `PO sent to supplier · WhatsApp · Wed, 28 Sep` needs 247px at 11px |
| SO No / MPR No / CO No / RO No | 176 | prototype | Receiving; several references stack as lines |
| Goods arrived at | 150 | prototype | a receiving SITE, deliberately not `Stock Location` |
| Received / Damaged / Wrong Item / Extra Qty | 112 | prototype | one family, one width |
| Supplier DO No | 150 | prototype | supplier's own reference; a longer one wraps |
| RO No | 170 | prototype | apply the two-digit-year display rule before re-measuring |
| Supplier Claim No | 150 | prototype | §9.5 measurement 122.8px + header chrome |
| Cost Responsibility | 144 | prototype | a responsibility WORD, never an amount |

**The goods table is the second scope of the same registry:** its numbers live in `GoodsMiniTable`'s
`CHILD_COLUMNS` — Category 132 · Unit ID 140 · Deliver To 200 · SKU 152 · Qty 64 · Supplier 140 ·
`PO No / Unit ID` 230 · Item flexible, floor 220. Exactly one goods column is flexible, always last.

---

# §7 · Exceptions, real gaps, kit gaps and proposals

**This is the one exceptions list.** An item here is current; when it is decided or built it moves
into the section it belongs to, and this list loses it.

## §7.1 · Approved module-specific exceptions — no other module copies them without its own ruling

| Exception | Owner ruling | Owner of the detail |
|---|---|---|
| Delivery Monitor: 72px two-line rows; in-place panel write state in the expansion; `Delivery Status` word set | 2026-09-12 / 09-13 / 09-14 / 09-25 | Delivery MASTER §§8.3–8.5 |
| Delivery Orders: DO brief recorded in place (two columns ≥1024px) | 2026-09-26 | Delivery MASTER §8.7 |
| Delivery schedule card: two facts on two lines + type label | 2026-09-14 / 09-25 | Delivery MASTER §§8.2, 8.4 |
| Payment Monitor: 72px rows; `Payment timing` fact + Work action + avatar cell | 2026-09-12 / 09-16 | Payment MASTER §3 |
| SO Batch Purchase and Manual Purchase: their own approved listing designs (§6.8); the PO Duty owner chip only beside the selected `Issue PO` (`YJ`), Export at the far right | 2026-09-18 | Purchasing MASTER §§9.1–9.2 |
| SO Batch `PO No` cell: every linked PO on one line, comma-separated, each its own link, 170px, no wrap (DEPLOYED #1924; signed-in check owed). Sales Orders keeps its own PO No cell; unifying them is NOT approved | 2026-10-05 | Purchasing MASTER §9.1 |
| Supplier Claims leading order `☐ · ▸ · Claim status · Supplier Claim No · Claim Reported · …` (status leads; date never pinned; `pinnedPrefix`, BUILT on branch 2026-09-29) | 2026-09-18 | Purchasing MASTER §9.5 |
| Purchase Orders rail: section icons (message/goods/supplier/warehouse, 16px, aria-hidden), no `Clear filters`; Purchasing `reserveConditionRow` | 2026-09-18 / 10-02 | Purchasing MASTER §9.3 |
| Purchase Returns rail reuses the Supplier Claims supplier list | 2026-09-18 | Purchasing MASTER §9.6 |
| Repair Orders: automatic RO Doc Date (no backdating), 14-working-day target from evidenced supplier receipt; all Unit IDs shown beneath their PO (row may grow); optional `Price` only in create/detail; outstanding owner consent shown in detail + Workspace, never disabling Issue (APPROVED TARGET / NOT BUILT) | 2026-09-19 / 09-20 | Purchasing MASTER §9.7 |
| GRN document composition and arithmetic; `Received Qty` versus `Physical arrived Qty` (NOT BUILT) | 2026-09-23 | Purchasing MASTER §9.4 |
| Warehouse `Monitor · Inbound · Inventory · Outbound`: Inbound/Outbound on the 240px rail + register grammar; column `wrap` and `expandable.trigger` opt-ins | 2026-09-06 / 09-07 | Stock MASTER §7 |
| Sales Orders rail: no `Clear filters` inside; dealer/product multi-select is an SO-specific target not yet in the kit (NOT BUILT) | 2026-09-22 | Orders MASTER |
| Sales Orders goods summary: `+{n}` counts remaining goods LINES (never quantity) and opens a read-only `SO-{n} · Items` goods inspection Drawer (BUILT, `GoodsSummary`; §4.1) | 2026-10-01 | Orders MASTER |

## §7.2 · REAL GAPs and conflicts — need a decision; none is silently resolved

| Gap | The conflict | Next step |
|---|---|---|
| **`Proceed Date` names two facts** | Register first column `Proceed Date` = `orders.proceeded_at` (actual hand-off; Orders MASTER, COPY SO Batch row). SO page / PDF / Work `Proceed Date` = `orders.proceed_date` (planned production start). Card `Proceed date` = `proceed_date`. One word, two facts | Owner word decision (COPY) |
| **Owner-confirmed standalone SO preview versus the kit — 3 differences** | Preview (`127.0.0.1:5465 sales-order-requested-date-preview.html`, owner-confirmed 2026-10-05) versus kit: (1) money facts centred vs left aligned — the kit follows the card contract's summary-cell rule (left aligned, the reference's centring was recorded as a defect); (2) Proceed date cell 12/13px weight 400 vs 11/12px weight 500 — the kit follows 01 §7.6 (label 11, value 12/17 weight 500); (3) four equal sales columns vs `1fr 1fr 1.55fr .75fr` — the written owner rule says only "four columns above 440px", the kit follows 01 §7.6. Neither side wins automatically | Owner / controller decides; then card contract and 01 §7.6 update once |
| **Touch sizes switch by canvas for rows but by viewport for the toolbar** | Live SO register 2026-10-05 (viewport 1058×804, register column 694px, rail open): main rows render 39px, not the accepted 32px, because DataGrid switches to `narrowCanvas` below a 768px GRID CANVAS and wraps the checkbox in a 40×40 hit area (`checkHitNarrow`, `DataGrid.tsx` ~2548 / `DataGrid.module.css` ~1229), while the toolbar and search follow the VIEWPORT (`@media (max-width: 767px)`) and stay desktop — one screen mixes a desktop toolbar with touch rows (01 §7.5 live table) | Owner presentation decision; controller recommends touch sizes follow the device/viewport (or pointer), not the canvas |
| Card editable `To` vs Work recorded channels | `CompactModuleCard` Communication offers an editable `To`; Work's `WorkCommunication` allows recorded channels only (owner ruling 2026-09-17) | Owner decision |
| `Jump to…` empty word | The locked contract prints `No results`; COPY-STANDARD rule 5 lists `No results` as the ✘ empty-state example. Reconcilable (a search matched nothing; a worklist is empty) but COPY does not yet carry that split | COPY ruling |
| Facet counts spelt three ways | PO §9.3 (whole register), Purchase Returns §9.6 (respect other dimensions), Supplier Claims §9.5 (complete searched/filtered set) versus §6.7's one reading | Converge each page in its own round |
| Native Input/Textarea inside the card | `.panel input/select/textarea` still overrides font, padding, radius and border of native Input/Textarea (01 §7.6 records the actual values); Select/DatePicker keep the kit skin | Governed source correction |
| Reference table header weight | 01 §7.4 records source weight 700 vs governed 600 | Measure and correct in 01/source |
| Shared Select long option at 390px | measured right edge 420.72px beyond the viewport (research file §9) | Kit fix |
| WarehouseIncoming modal close | focus lands on the page, not the Count trigger (research file §9) | Adopt `DialogFrame` focus return |
| Picker inside a dialog renders UNDER it | a real P1 defect, approved, not built | Kit fix |
| Stock Status column truncates its pill | Live SO register 2026-10-05: the 120px Stock Status width cuts every `Receipt unconfirmed` pill (natural width >103px of content) — content must decide width (Constitution §2) | GAP: re-measure and widen the registry role in the SO round |

## §7.3 · KIT GAPs — admit once, never draw locally

- **Mission rail composition** — `.so-template-rail` + SO selectors are not a kit export (§6.1).
- **Generic ObjectHeader / ObjectPage** — `SalesOrderTabs` and `FullFact` are page-owned (§4.1).
- **Expansion columns in the Columns menu** — PROPOSAL `expandable.columns` (§6.3); Purchasing's demo
  uses `Goods: …` Page tools items (words pending) and a proposed registry width `unitWithPo: 260`.
- **A link-style button inside the card** — SO numbers inside card content fall back to a ghost
  `Button` (reported by Purchasing).
- **Virtualization with expansion or groups** — flat lists only today (§6.2).
- **Page-level Wrap tool** — only per-column `wrap` exists.
- **Account-saved layouts beyond Purchase Orders; kit `DataTable` layout memory** — APPROVED TARGET /
  NOT BUILT (`OperationOrdersControl.test.tsx` measures the DataTable gap).
- **Shared region error/permission recipe** — no universal numeric component proved (01 §8.3 PROPOSAL).
- **Touch targets** — segmented tab 34 on phone, rail Hide/Show 28, chip remove 24, bare checkbox 16 do
  not prove 40px hit areas; DialogFrame Close ≥40 is PROPOSAL.
- **Accessible assignment avatar** — the avatar-only hover/focus/tap identity contract has no shared
  component.
- **`/ui` whole-page coverage** — Register, Working Panel and Object examples with all responsive and
  failure states still need an audit; component examples are not complete-page evidence.

## §7.4 · PROPOSAL / NOT LAW — challenge, never obey

| Proposal | Source | Falsifier / decision owed |
|---|---|---|
| Customers and Activity rail doors icon-only, like Calendar (controller recommends yes, for consistency) | controller 2026-10-05 | Owner decision with the complete right-rail blueprint |
| Reduced motion: animations respect the operator's reduced-motion setting | consolidation review 2026-10-05 | Owner/kit decision; no rule until approved |
| Confirm before an act that cannot be undone, in COPY wording | consolidation review 2026-10-05 | Any word change goes through COPY |
| Compact-card token decision: the card's palette, font family, radius, drawn glyphs and red error line are the reference's own, not 01 (values in 01 §7.6) | card contract | Owner token decision |
| 40px phone module tabs on the card (controls stay 32px today) | card contract | Module-tab-row decision |
| Expansion-only Columns (opt-in goods columns, OFF by default) | Purchasing 2026-10-05 | Owner has not decided (§6.3) |
| "Several SOs → list first, then one" inside a host panel | Purchasing 2026-10-05 | Owner decision |
| ↗ renders only when the page passes `onOpen` | Purchasing (LOCAL ONLY); being delivered by the controlled build | Record as built after it merges |
| PO working panel and round panel content layouts; SO Batch round rail; `Match Ready Stock` placement; SO Batch optional goods columns replacing the details table | Purchasing lane, localhost | Owner review in the Purchasing lane |
| Filled primary button on blue-11 (white on blue-9 measures 3.26:1); darker semantic foregrounds for small labels | research file §8 | Real component samples + owner review |
| Field-card typography 16/14/12 (Houzs Loading List) versus 15/13/12 | 2026-10-01 | Same-content comparison |
| Cards grid: container minimum 320, three columns ≥984, two ≥652 | 01 §8.1 | Sample review |
| Purchasing fit review — four cross-module contracts: linked sections distinguish loading/error/empty/present/denied; current, last-sent and goods completion are separate facts; blocker summaries point to the exact row/field and keep the draft; source/Unit evidence stays traceable | Purchasing PLAN 2026-10-01 | Verify against existing components; Purchasing owns its sample |
| Inventory top-filter placement (instead of a rail) | research file §4 | Complete compact-top versus rail analysis |

## §7.5 · Approved targets not yet built (shared)

Quick Rail Calendar · Customers · Activity and the all-module calendar filters (§5) · `Assigned to` /
`Completed by` wording (§5.1) · mission entries on module rails (§6.1) · `Warehouse` tab (§4.3.4) ·
personal saved-layout rollout (§6.7) · facet-count convergence (§6.7) · SO dealer/product multi-select
rail · the flame repoint `--primary` → blue (594 sites; needs its own card and a visual approval) ·
`base-*` → kit palette (4,661 sites; page by page with the page migrations, never globally) · real
pages on `PageShell` / `DataTable` / `DetailShell` (the order drawer is BLOCKED: L4 needs a facts
4-tuple that does not exist) · splitting the grid's `layout` prop when a page needs resize without
reorder · `SavedEvidenceViewer` adoption in Stock and Service.

## §7.6 · Rejected or withdrawn — do not revive

`warehouse-ui-preview.html` (hand-written shell, blue summary box, concatenated goods expansion —
rejected by the owner) · `inbound-flow.html` (not accepted as a build reference) · the 48px toolbar
candidate · the warm-grey hex palette · literal Houzs colours, 9px badges, 700 weight or 12px radius ·
a generic full-order editing drawer beside the Working Panel · `DetailShell` as a cross-module shell ·
the always-visible icon-only Export/Columns toolbar (replaced by `⋯`) · the former quick-view `Block`
composition (replaced by `CompactModuleCard`).

## §7.7 · Measured debt

**Colour** (measured 2026-07-29): 6,385 colour sites; after the ruler shipped 5,545 of 6,129 measured
(90.5%), rules O 4,661 · P 594 · Q 111. **Typography:** the `t-*` ramp is retired; sizes carry weight
and line-height in ONE class. **The kit's own coverage number may never go down.** The grid's render
cost is linear in rows and flat in density (research `grid-findings.md` F64–F70): a windowing
question, never a row-height one.
