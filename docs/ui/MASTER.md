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

**Current shared UI target — Jess, 9 Oct 2026:** `Sales Order.zip` (SHA-256
`bafd9111a239c2c8f0ca7b54bf5622321b04a4739b64a267c07610ea4b2e388f`) replaces
superseded visual values through the existing 01 / 02 / 03 and this MASTER. Source specimens live
at `docs/ui-reference/sales-order-design/`; tokens mirror at `docs/ui/carres-tokens.css`.
Read `UI Kit.md` + `Carres UI Kit.dc.html` for source component fidelity, then source screenshots,
CSS and the v8 HTML; the canonical resolved values are in 01, not another kit document.
The embedded README/Ops Rules are supplied material, not independent approval of business law.
The shared visual target covers shell/menu, tables, controls, object facts, Tasks, Route, Timeline
and density. Modules supply their own identities, columns, authorised actions and source facts.

**Current work split — owner 9 Oct 2026:** Claude Code owns application implementation, tests and
deployment. This UI owner updates governance documents only. Neither this document update nor a
component specimen proves application adoption, deployment or production acceptance. Later pages,
including SO Batch Purchasing, are supplied and reviewed one at a time against this same kit.
The latest approved page delta replaces only superseded rules; unresolved proposals keep their label.
No second MASTER, page-local kit or versioned standard is created.

**Law order:** Business Rules → Information Architecture → Design System → Implementation; on a
conflict Business wins. Current target token values are defined in 01; existing component internals require migration to that target. Composition inside the
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

**Implementation inventory:** Built/deployed entries below describe the existing components before visual migration. Their existence is not proof that the current target has been adopted. Appearance always comes from current 01.

**One row per thing on screen; one current source per row.** If something is not in this table it is
not a current pattern: do not copy it from a neighbouring page. Live examples are on `/ui`.

| Area | Use this | Source | Status |
|---|---|---|---|
| Tokens: type · colour · radius · icons · layers | Tailwind token classes; `Icon`; `overlay-layer` | `01-design-tokens.md`, `tailwind.config.ts`, `components/kit/Icon.tsx` | Existing component built; current visual migration owed |
| Page frame | `ListPageShell` today; kit `PageShell` is the target | `components/ListPageShell.tsx` · `components/kit/PageShell.tsx` | Moving a page onto `PageShell` re-lays it out: owner preview first |
| Destination header + global utilities | `ModuleHeader` + `GlobalTopBar` | `pages/operation/components/` | §4 · built |
| Portal navigation | `PortalSidebar` + `portal-nav` | `pages/portal/` | §4.2 · built |
| Left mission rail | `FilterRail` family + `useFilterRailOpen` + the Sales Orders `.so-template-rail` composition | `pages/operation/components/workspace-rail.tsx` · `SalesOrdersRegister.tsx` | §6.1 · rail recipe built; mission rule APPROVED TARGET 2026-10-05; complete composition not yet extracted to the kit (KIT GAP) |
| Register / listing | `register/DataGrid` | `components/register/DataGrid.tsx` | §6.0 · §6.2 · SO-derived template owner accepted 2026-10-01 · built; adoption per page |
| Goods expansion | `GoodsMiniTable` + connector | `pages/operation/components/GoodsMiniTable.tsx` · `ConnectedSections.tsx` | §6.9 · built |
| Simple and document tables | `DataTable` · `DocumentTable` · `TotalsSummary` · `TableScroller` | `components/kit/*` · `components/TableScroller.tsx` | §3 · built |
| **Compact module card** (the right Working Panel: identity header, Info and module tabs, module summary, editors, Items, Communication, Timeline) | **`CompactModuleCard`** in kit `Drawer variant="compact-card"` — pass the header facts once and each module's own facts, editors and items | `components/kit/CompactModuleCard.tsx` · `/ui#compact-card` · contract `docs/ui-reference/MODULE-CARD-TEMPLATE.md` | §4.3 · shared component built · Sales Orders adoption PRODUCTION VERIFIED 2026-10-05 (PR #1893/#1896/#1897, `2ce91e2d`) · embedded presentation DEPLOYED (PR #1926, `dc631e1a`, production SHA verified 2026-10-05; owner review owed) · other modules per §4.3.4 table |
| Object header + tabs | `SalesOrderTabs` recipe | `pages/operation/SalesOrderTabs.tsx` | §4.1 · accepted; page-owned — no generic ObjectHeader/ObjectPage kit API (KIT GAP) |
| Object facts | `Block` — the one card · `Panel` · `StatusPill` · `EmptyState` · `Loading` | `components/kit/*` | Existing component built; current visual migration owed |
| Forms | `Input` · `Textarea` · `Select` · `SearchInput` · `Checkbox` · `DatePicker` · `FieldFrame` | `components/kit/*`, `field-recipe.ts` | Existing component built; current visual migration owed |
| Buttons and menus | `Button` · `DropdownMenu` · `Popover` · `Tooltip` · `Tabs` (segmented Table/Cards) | `components/kit/*` | Existing component built; current visual migration owed |
| Dialogs, documents and evidence | `Modal` · `Drawer` · `Toast` · `PdfPreview` + `PdfPreviewHeader` · `SavedEvidenceViewer` | `components/kit/*` | §4.4 · built |
| Work route pieces | `RouteStop` · `ChecklistRow` · `QuietRouteRow` | `components/kit/*` | §3 · built 2026-09-28 |
| Orders list / drawer band | `SectionPanel` (cream band) — that surface only, not a general card | `components/SectionPanel.tsx` | Not a `Block` duplicate |
| Work right-panel Communication | `WorkCommunication` — recorded channels only | `pages/operation/work/WorkCommunication.tsx` | Built; differs from the card's editable `To` (§7.2) |
| Record history | §5.2 three-rank grammar | this MASTER | LOCKED · no shared component; each page draws it |
| Tasks and quick reference | Existing Work/Tasks host; `OperationRightRail` for existing quick capabilities | `pages/operation/work/` · `pages/operation/components/OperationRightRail.tsx` | §5 · supplied target has a collapsible Tasks region; Calendar/Activity capability retained, unresolved placement stays explicit; runtime adoption not verified |

**Retired — do not import; a test blocks new use** (`components/retired-components.test.ts`): `Btn`
(→ `Button`), `Field` (→ kit inputs / `field-recipe`), `PageHeader` (→ `PageShell`). Their remaining
pages move only after the owner approves a before/after preview, because each swap changes what the
operator sees. The `carres-design` skill, the old `ui-reference/` mocks and the Delivery-only card
reference are deleted; `docs/ui-reference/` holds behaviour evidence for the compact card and the current imported Sales Order specimen. Neither is a second standard.

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
9. **Every number states its trigger** (a documentation convention the owner requested 2026-10-05, not a
   UI rule) — viewport width, grid canvas width, available content canvas
   (after shell rails), card width or pointer type. A number without its trigger is how chats end up
   copying different things; 01 §7 carries the trigger beside each measurement.
10. **Module Settings completion — owner ruling 2026-10-05.** When a module's build is complete, the
    chat proactively offers how to complete that module's Settings: every setting the module needs to
    run, its Settings door, current value or default, which are still empty, and who sets it — before
    calling the module complete. Never wait for the owner to ask.
11. **One combined review for shared UI — owner ruling 2026-10-05 ("agree, tell every chat to align
    with you").** A module chat never shows the owner its own variant of a shared part: Working Panel
    host and tabs, Tasks entries, compact card, row menu or listing kit. It sends them to the chat that
    controls this MASTER, in one message: per page, route · main object · panel host · tabs in order ·
    opens on · ↗ destination · row menu; per Tasks item, act wording · card + tab it opens; any kit part
    that does not exist (named, not drawn); status per item (APPROVED with MASTER § · BUILT with SHA ·
    PROPOSAL with preview + branch@SHA); known conflicts with another module's card. The UI owner
    combines every module into one table and one local preview; the owner accepts once; this MASTER is
    then written and each module writes its own section. Module business rules stay with the module
    chat.

## Find it — this index is enough

| I need | Go to |
|---|---|
| The listing (template on one page) | §6.0, then §6.2 for the capability table |
| The left rail (mission rule, recipe, per-module status) | §6.1 |
| The right Working Panel | §4.3 (rules in `MODULE-CARD-TEMPLATE.md`, numbers in 01 §7.6) |
| Which tab the panel opens on (page-owned main work tab) | §4.3.1 |
| Default page work and `Tasks` (layout under research) | §4.3.5 · §5 |
| Row right-click (ONE ROW MENU `View` · `Print`) and click behaviour per register | §6.7 rule 5 · §6.5 |
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
2  ONE KIT    selection, buttons, status and typography match current 01 tokens;
              condition words remain readable without colour
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

## §1.3 · Reference direction — current owner instruction 9 Oct 2026

The supplied Sales Order design is the current visual reference. Adapt it through the shared kit, not by copying page-local CSS or its simulated backend. Its full-page SO, Route and Timeline establish the visual family; module content and doors still come from their MASTERs. Houzs and other products may supply capabilities and organisation, but do not become another token authority. Five compositions share one kit: Register, Object, Task, Form and Overview/Settings.

---

# §2 · Shared architecture

| Concern | The ONE home |
|---|---|
| token values | `docs/01-design-tokens.md` · mirrored (never driven) by `apps/web/src/lib/design-standard.ts` |
| the components themselves | `apps/web/src/components/kit/**` (plus `components/register/DataGrid`) |
| the live look | **`/ui`** — public, lazy, its own chunk, so a kit reference never rides the operator's bundle |
| the enforcement | `pnpm --filter @carres/web lint` + the kit source scans + `scripts/check-design-standard.mjs` |

**Current values:** typography, spacing and icon target are in 01. Existing icon meaning IDs and shared component APIs are preserved during migration.

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
at least 44px; check 1440 / 1180 / 820 / 390 and 200% zoom; nothing (footer, floating control, toast) covers a
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
- Check contextual regions open/closed, backdrop/Escape, search, selection and column filters;
  supported presentation switches keep the same result and filters. The supplied SO target omits Table/Cards; do not add it from an older example.
- Check the Working Panel and full-object door, long identities, all §2.2 states, keyboard focus,
  icon accessible names and 40px touch controls.
- Check long content is reachable, headers stay fixed and horizontal overflow stays in its pane.
- Provide the preview URL, visual evidence and test results; state remaining gaps. Passing tests,
  importing kit primitives or another chat's approval is not whole-page visual proof. Approved,
  built, deployed and visually verified are separate claims, each with scope and evidence.

---

# §3 · Shared kit

Appearance and dimensions are defined once in 01; component use and states in 02; page compositions in 03. Reuse existing kit components and the DataGrid engine. Preserve component APIs, source-owned facts, accessible names and permissions. No page-local status, button, drawer, field or grid replacement.

Soft status pairs replace the previous solid-white status styling; Hold is dark. A condition determines tone, never the verb. Counts are not record status. Main action is charcoal, selection is orange. Business status words still come from COPY and the owning module. See 01 for every value and migration gap.

# §4 · Shell and page composition

Use 03 §§1–4 and 01 §4. Contextual summary and Tasks regions collapse independently. Settings uses plain grouped rows and entity tables, not mandatory extra rails. Preserve global utilities, source navigation and module permission boundaries. A prototype page opening does not authorise replacing every module's record doors.

## §4.1 · Object page — the full record

**How one record opens — four surfaces, each with one job; a fifth needs an owner ruling.**

```
INSPECT    row expansion            the record's goods and related facts; ↑↓ moves · Esc closes (§6.9)
WORK       right Working Panel      Info + module tab; quick work in place of the list (§4.3)
OBJECT     full object page         read-first View · deliberate Edit · Revisions · History · Route
DOCUMENT   document preview         the saved/current document the other party receives (§4.4)
```

**Anatomy of the page:** identity row → tab row → form pane (left) + document pane (right) where the
object rule splits (§4.4), otherwise one facts flow. The supplied SO target opens the full object on row click (03 §2.1), rather than automatically editing or opening a compact card. Other module record doors remain governed by their MASTER; the Working Panel remains available for its approved work purpose (§0.2). the full object page keeps its approved roles and is reached from the identity number or the panel's ↗. View, deliberate
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
right, the applicable object views directly below; View and Edit keep the same context. Current 01/03 own its appearance and responsive composition. Identity and actions wrap without loss; preserve visible focus, full identity and owning-register return context. No duplicate singular/plural pseudo-tabs or second Back door.
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
The shared Block is the one section component. Use 01 for its surface, heading and spacing. Read-only facts are plain text; editable and automatic form inputs remain distinguishable, labelled and source-owned. No module-local boxed-fact palette.

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

## §4.2 · Portal navigation

Reuse PortalSidebar and portal-nav; geometry and selected appearance live in 01 §4. Preserve the approved module hierarchy and each user's access. Navigation order is not a new permission. Source menus in the imported HTML are visual evidence, not automatic activation of Subscription or unbuilt pages. Scroll long navigation rather than shrinking items. Bottom Settings and user identity remain reachable.

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
- **Sales fact word — UI Master approved 2026-10-06 (owner ruling: two dates, two names).** The
  card's planned-date fact (`orders.proceed_date`) and its `{n}d` tooltip say **`Planned production
  start`** (`CARD_WORDS.proceedDate`, `CARD_WORDS.dayCountTitle`); `Proceed Date` names only the actual
  hand-off (`orders.proceeded_at`) and never appears on this card. Name only: the card reads the same
  date. On a card wider than 440px the longer label wraps to two lines in its `1fr` column, so the four
  labels share one row and the four values the next (CSS subgrid; sizes and fractions unchanged, +16px
  on the 560px card); ≤440px is unchanged. BUILT on branch, not yet deployed.

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
| Identity | the shared identity Header (customer · SO No · phone · original requested delivery · ↗ · ×), styled by current 01 | light identity in the tab: name, underlined SO No → saved PDF, phone, two-line `Customer’s original` / `requested delivery`, `31d · Sat, 31 Oct` (original revision-1 date minus Planned production start, calendar days), ↗ full SO page. No second identity header, no nested tabs, no × |
| Tabs | `Info · Delivery` | none inside the tab |
| Opens with | Info: address and sales facts open; Items, Communication and Timeline closed | address and sales facts open; money; the items table shown by default with `Item · Qty · Unit (RM) · Disc (RM) · Amount (RM)` |
| Component | `CompactModuleCard` | the same component in its embedded presentation |

A single-SO card whose Header is already that SO does not embed the same SO again. A host shows its
`Sales Order` tab only when a Sales Order is linked. **DEPLOYED (PR #1926, `dc631e1a`; deploy run 37293312776; production SHA verified on all five surfaces 2026-10-05); owner review owed**: the PO full page
`Sales Order` view, one SO builder (`sales-order-card.tsx`) feeding the standalone and embedded cards, and
the host entry `EmbeddedSalesOrders({ orderIds })`; owner acceptance owed. The PO working panel and round
panel adopt it as approved hosts (their work-content layouts are localhost-first). Complete defaults,
hidden parts, states and entry points: the contract's "Embedded presentation"; numbers: 01 §7.6.

### §4.3.4 · Adoption by module

| Module / host | Panel | Status | Evidence / owner |
|---|---|---|---|
| Sales Orders register (Table and Cards) | standalone SO card, `SalesOrderCompactView`; Info · Delivery | PRODUCTION VERIFIED 2026-10-05 for the confirmed corrections; the 2026-10-05 Info layout (#1915) and the original-date header (#1919/#1920, `9294659a2`) are DEPLOYED with live acceptance not yet recorded | PR #1893/#1896/#1897 merge `2ce91e2d` (deploy 37213753695); Orders MASTER owns the business path |
| Delivery tab (inside the SO card) | `DeliveryBrief` summary + Delivery-owned editors | DEPLOYED with the SO card; editors reuse Delivery's governed doors | Delivery MASTER |
| SO Batch Purchase quick view / Cards | `SoBatchCompactView`; opens on main tab `SO Batch Purchase` (§4.3.1, target) | DEPLOYED (#1891); its header still shows the current request with a today-based countdown — the original-date fix is LOCAL ONLY in the Purchasing lane | Purchasing MASTER §9.1 |
| Receiving (GRN) | `ReceivingCompactView`: supplier/source + GRN No, `referenceStatus` `Cancelled` | DEPLOYED (#1894); wrapped summary labels PRODUCTION VERIFIED (#1906, `d4cca587`) | Purchasing MASTER §9.4 |
| Shared embedded SO component (kit `CompactModuleCard presentation="embedded"`, `EmbeddedSalesOrders`, `sales-order-card`) | one SO builder for standalone and embedded cards | DEPLOYED (PR #1926, `dc631e1a`, production SHA verified 2026-10-05) | UI MASTER §4.3.3 · card contract |
| Purchase Orders full page | `Sales Order` view = `EmbeddedSalesOrders` (embedded presentation) | DEPLOYED (PR #1926, `dc631e1a`, production SHA verified 2026-10-05); owner acceptance owed | Purchasing MASTER §9.3 |
| Purchase Orders (PO working panel) | supplier · PO No + PO state; Info · `Purchase Order` (default) · `Sales Order` (embedded, §4.3.3) | APPROVED TARGET / NOT BUILT — tabs owner-approved 2026-10-05; the layout of the work content is PROPOSAL, localhost first; a `GRN` tab is pending owner decision (stale PR #1859 not authorised) | Purchasing MASTER §9.3 |
| SO Batch Purchase purchasing round | round time/date + `Missed` / `Done`; Info · `SO Batch Purchase` (default) · `Sales Order` (embedded) | APPROVED TARGET / NOT BUILT — tabs owner-approved 2026-10-05; the layout of the work content is PROPOSAL, localhost only | Purchasing MASTER §5.6.1 |
| Manual Purchase Request | Info · `Manual Purchase Request` (default) · related `Sales Order` (embedded) per its approved capability | APPROVED TARGET / NOT BUILT — tabs owner-approved 2026-10-05; the layout of the work content is PROPOSAL | Purchasing MASTER §9.2 |
| Warehouse | a `Warehouse` tab in the shared panel | APPROVED TARGET / NOT BUILT (§0.2) | Stock MASTER |
| Workspace Work right panel | Workspace §5.10 composition | Governed by `docs/workspace/MASTER.md` §5.10 (deployed §5.9 Logistics; rest NOT BUILT); not yet aligned to this card | Workspace MASTER |

### §4.3.5 · Default page work and `Tasks` — owner direction 2026-10-05

- **Default work presentation — APPROVED DIRECTION, localhost first, NOT BUILT.** Entering a module
  page, the right Working Panel shows that page's **highest-priority actionable work** from the
  existing Work / module task sources (owner, permissions, completion facts) — no new task engine, and
  never guessed from the current table filter. Purchasing priority: earliest `Missed` → today's due
  round → next round. Nothing is ticked, ordered, reserved or sent automatically. A task the operator
  navigates to by hand stays selected across a refresh; a draft is never lost. When there is no work,
  the panel says so plainly (COPY word needed) and record viewing stays available.
- **Page work and `Tasks` — APPROVED DIRECTION, NOT BUILT.** The page's own work and the global
  `Tasks` view (§5) never show as two stacked panels; a way back to the page's work is always present;
  selecting a row never silently changes the object open in Tasks; `View` opens the full document
  (§6.7 rule 5).
- **PROPOSAL / UNDER RESEARCH — not law:** how Tasks coexists with Calendar, Activity and the page's
  work. The owner requires Calendar to stay quickly viewable while handling a task; "Tasks replaces the
  page's work in the same area" is not decided (§7.4).

**Open items on the card** are in §7: the compact-card token decision, 40px phone tabs, the editable
`To` versus Work's recorded channels, the native Input/Textarea cascade, the preview-versus-kit
differences, the link-style button inside the card and "several SOs → list first". (↗ renders only when
the page passes `onOpen` — DEPLOYED in PR #1926, production SHA verified.)

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

**Current supplied shell target — owner 9 Oct 2026.** A collapsible Tasks region (01 §4)
is opened by the labelled Tasks/count control; Summary collapses independently. Do not add the old
permanent right icon column to the supplied SO composition. Tasks uses the signed-in person's
cross-module work from the one Work source; Workspace keeps its formal My Task/Team Work purpose.
The latest visual target replaces the old icon-only Tasks-door placement, not task business law.

- A task row opens the exact source-owned work/result. Module filter icons follow the menu order;
  counts come from authorised source work, never current table filters or a second engine.
- Keep task/source, reason, owner, due, required proof, recorded result and next action. Prototype
  choices and generic Save do not create permissions, evidence waivers or completion rules.
- Document inspection and task work share the available page area without stacked duplicate task
  panels; drafts and return context remain. Desktop drawer geometry lives in 01; narrow adoption
  still needs full-page checks.
- Calendar is still a shared quick-reference capability. Activity and Calendar integration not shown
  in this ZIP remain unresolved placement, not deleted capability or permission to invent new doors.
  The previously approved quick access while handling work must remain available in later composition.
- No Customers rail door. Customer/contact lookup remains an approved capability whose source-free
  enquiry placement is still reviewed with Workspace/Customer Service; never fabricate an SO.
- Module Quick Schedule and Activity's unfinished blueprint remain separate owner-reviewed work.

Historical production behaviour and old Quick Rail screenshots are implementation evidence only,
not another current shell standard. This document has not measured the new runtime deployment.

**One job, two doors (owner-confirmed 2026-09-25).** A job can be done from Work or on its owning
module page; both use the same module action and write the same record. Done means the source fact
exists — the Work item closes everywhere; nobody presses `Done`. The rail only reflects and links:
Activity shows who · when · what; the customer's recorded history shows the event; Calendar changes
only when a dated arrangement changes. No rail door performs or completes a job.

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
Payment       2 promised payments         ›  Payment Monitor ?status=
```

**Customer lookup — capability APPROVED 2026-09-24/26; rail door removed 2026-10-05; placement OPEN.**
Find a caller by name, phone or saved order number (SO/SUB, including historical forms) across all
their orders and recorded history. Read only: changing details, recording a contact result or taking
money is done on the source record through its own module action; no edit, note or completion
control. Exact phone or number matches rank first, then name matches; nothing opens by itself.
`Matched by phone` where the canonical phone links records; a name-only hit is a `Possible match`, kept
separate and never merged into one person, balance or entitlement. Permissions decide what exists:
results, counts and suggestions never reveal a customer or order the person may not see. Delivery
contact by the Logistics company reads as the company's act recorded on its behalf, never a Carres
call. A different job from Work's Customer card (Workspace §5.10); both read the same source records and
neither keeps a second copy. Selecting a customer never silently filters Calendar or Activity.
**Where the cross-order caller lookup now lives is OPEN** — PROPOSAL: Tasks → `Sales Order` tab covers
the linked SO only; a full caller search across all a customer's orders has no placement yet (§7.2).

**Activity** previews recent append-only events within the person's permissions and links to their
objects; it never replaces an object's History. No stored value reaches the screen untranslated and no
`—` stands in for a value (COPY-STANDARD).

**Frozen:** the rail reads and links; a source module owns every change and completion; a filter can
narrow access, never widen it.
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
- **Ruled exceptions (no other register copies them without its own ruling):** the **Delivery Monitor** `Delivery Status` column (Delivery MASTER §8.4) — one status
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

## §6.0 · Listing template — every Portal listing

Read 01 §§4–5 and 03 §2. Current visual reference: `docs/ui-reference/sales-order-design/Sales Order Outright Layout v8.dc.html`; shared runtime adapter: DataGrid. The old dense-row/blue/vertical-separator recipe is removed.

1. Module views, shared search/tools, source-owned table, footer; contextual summary and Tasks may collapse.
2. Columns, quantities, meanings and opening doors come from the owning module MASTER. Linked document numbers open their own records.
3. Missing, loading, failed and empty are different. Exact words come from COPY. No dash used as an absence value.
4. Row expansion has one job: goods and connected source facts. Do not invent another work queue inside it.
5. Filters, resize, sorting, selection and grouping use the existing shared engine. Preserve list context on return.
6. Content defines column widths. Re-measure the registry against current font/padding; never clip a date, amount, status or identity to preserve an old measurement.
7. Check the complete page under §2.2 before claiming adoption. Previous deployment evidence proves the previous implementation, not this new visual target.

## §6.1 · Contextual summary/filter rail

Use the shared FilterRail adapter when the module's purpose needs it. Approved source-owned filters and their count semantics remain. Current selected appearance and widths come from 01. Do not impose SO filters, mission labels or rail groups on every module. Hide/show retains filters and leaves the record table usable.

## §6.2 · Shared listing — one engine, one interaction contract

Every module uses the **same `register/DataGrid`, toolbar and interaction contract**. A module supplies
only: record grain, default columns, optional columns, real data, business filters, permissions and
actions. **A component existing is not whole-page adoption** — each page proves adoption by §2.2.

| Capability | Status | DataGrid prop / source | Note |
|---|---|---|---|
| Search | SUPPORTED | built-in box; `searchPlaceholder` · `searchScope` · `initialSearch` · `onSearchChange` · `searchPresentation="responsive"` (`Search: {query}` chip) | Current 01 search dimensions; the accessible hint names only fields actually searched; server search is the page's reader |
| Table / Cards | SUPPORTED | `presentationTools` + `renderResults` (Cards consume the grid's exact sorted/filtered result) · `presentationKey` | Adopted: Sales Orders, SO Batch, Purchase Orders, Receiving. Kit `Tabs` segmented with `Table2` / `LayoutGrid` icons and visible words |
| Page tools `⋯` | SUPPORTED | `presentationTools` menu: Export · `outputActions` · `pageToolsItems` · Columns | Entries icon + text; page tools never write business records |
| Columns (show/hide, grouped chooser) | SUPPORTED — parent columns only; default-hidden columns stay hidden (DEPLOYED and production SHA verified on all five surfaces (PR #1927, `a78e527c4`; deploy run 37293651075)) | column `defaultHidden` · `chooserGroup` · `chooserGroupOrder` | Expansion columns are not listed (§6.3, KIT GAP) |
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
| Row right-click menu | SUPPORTED — ONE ROW MENU `View · Print` (§6.7 rule 5), DEPLOYED (PR #1928, `488a627a8`; deploy run 37297402433 succeeded with its five-surface SHA check); authenticated production walk owed | `contextMenu` (Shift+F10 / Menu key) + the shared `documentRowMenu` helper (`components/register/row-menu.ts`) | Per-register menus in §6.5 |
| Export (current view) | SUPPORTED | Excel and list PDF from one derivation: column `exportValue` · `exportLabel` · `exportName`; selection exports the ticked rows | List PDF in-page preview PRODUCTION VERIFIED (#1911) |
| Paged full-population export | SUPPORTED | `loadExportRows` | Receiving first; PRODUCTION VERIFIED for Excel (#1905, `a087fec9`); live PDF-list download of a paged register not claimed |
| Server-side column filter/sort | SUPPORTED | `serverColumns { values, onChange }` + shared `register-column-query` | PRODUCTION VERIFIED on Receiving (#1899/#1901, `5c04b662`) |
| Footer | SUPPORTED | Current-token status footer: `statusSummary` · column `footerTotal` · filtered `{n} of {m}` | Information only; never a second toolbar |
| Loading / error / empty | SUPPORTED | `isLoading` · `errorState` (opt-in) · `emptyMessage` · `noMatchMessage` · `warning` (message kind ②) | §2.2 |
| Long text in a cell | SUPPORTED | column `overflowText` (Popover `{column}: {value}`) · column `wrap` (row grows; completeness columns only) · `headerLines` | A page-level `Wrap` tool is a GAP |
| Row stripe | SUPPORTED (opt-in) | `rowHighlight` (semantic condition token, with a label) | Never paint the whole row (§6.8) |
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

- **C1 · dates:** preserve fact identity and readable full values; selection uses current 01 and is not a business-status signal.

- **C2 · one search AND per-column filters.** A caller says "I'm Umi" — a name or a phone? Keep ONE
  search over the register's governed fields beside the per-column filters (AutoCount does both).
- **C3 · A REFETCH MAY NEVER CLOBBER AN OPEN EDIT.** Auto-refresh pauses while a panel or form is
  dirty (asserted in `SalesOrderWorkspace.ui-contract.test.ts`).

## §6.5 · Register chrome and feedback

Shared tools remain in the listing region; selection replaces ordinary tools in place. The owning module approves commands, group/view options, row menus and record doors. Create exists only at a record's authorised entry point; Operations cannot create an SO. Footer is informational and uses current 01 dimensions. Current minimum rows can grow for source-required content; never squeeze essential facts to match old density.

Distinguish loading, no records, no search matches, read failure, denied and incomplete setup. Preserve filters, selection and drafts on retry. An error names the affected action; a successful command does not falsely claim downstream physical completion. Scroll inside the table, keep header/footer reachable, and test keyboard and narrow screens.

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
   **One layout rule (DEPLOYED and production SHA verified on all five surfaces (PR #1927, `a78e527c4`; deploy run 37293651075)):** `register/DataGrid`: every layout writer
   passes through one rule (`settleLayout`) — on a pristine layout pin, drag, hide or show changes only
   that column and default-hidden columns stay hidden until shown; an arranged layout keeps an empty
   hidden literal; `Reset columns` alone returns to pristine (PR #1927, `a78e527c4`).
5. **ONE ROW MENU (owner 2026-10-05) — DEPLOYED (PR #1928, `488a627a8`; deploy run 37297402433 succeeded with its five-surface SHA check); authenticated production walk owed.** Every register's right-click
   menu starts `View · Print` from the shared `documentRowMenu` helper — View opens the record's full
   read-first document page (Edit only when pressed), Print runs that record's existing print flow; an
   item is omitted where the record has no full page or paper. Module MASTER-approved items follow
   after one divider (Sales Orders: Cancel SO). Click, double-click and number links are unchanged.
   Essential actions stay discoverable on the record opened via identity; right-click is a shortcut,
   never the only door; read-only registers get no invented batch actions.
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

### Portal-wide listing readability

Current appearance and minimum measurements come from 01 §§1–5. All listings share that target; adoption is per page, not proved by old deployment records. Important facts never use disabled styling. Source-specific columns and words remain unchanged.

**Different jobs, shared interaction:** Sales Orders is the customer-transaction register; SO Batch
uses `To buy` / `No purchase needed`; Manual Purchase `Need approval` / `To buy` /
`No purchase needed`; Purchase Orders its §9.3 groups; Receiving is a formal GRN register, not a queue.
An operator sends a PO PDF outside, then records `PO sent to supplier` — recorded sending is not proof
of supplier receipt (Purchasing MASTER owns the send/version contract).

## §6.8 · Shared goods tables — SO Batch reference (Jess 2026-09-18, BUILT)

SO Batch listing and stock-picker composition is the approved reference for shared goods-table work;
business columns stay in the module MASTERs; no page gains editing or reservation powers implicitly.
Manual Purchase inherits the same capabilities (Purchasing §9.2). Engine capabilities (all opt-in):
`leadingColumns.before`; `headerTone` (existing API; map its presentation to current tokens); `GoodsMiniTable soBatchGoodsLayout`; `ReadyStockTable layout="picker"`.

- Use current 01 cell padding, typography and row minimums; maintain content-defined widths and vertically aligned checkbox/quantity controls.
- SO Batch keeps separate leading checkbox and goods-disclosure controls; `SO No` opens the record and
  never carries a decorative arrow; keyboard disclosure exposes its expanded state. A goods row's
  `Ready Stock` cell shows available then reserved with its own borderless disclosure; saved
  selections have one `Change selection` journey; the stock picker shows `PO No / Ref No` with the
  Unit ID on line two and the date only (six-column order in Purchasing §9.1). The parent listing has
  no `Ready Stock` column (owner 2026-10-05).
- **Two-line goods rows:** use current 01; allow source-required content to grow rather than clip. Historical measurements do not define new target geometry.
- **One cell may carry a document and the exact goods it names — never two documents.** Line one is
  the full document number; line two one Unit ID, `{n} Units` as a disclosure into that row's
  expansion, `Counted stock`, or the honest absence/failure word. Never fabricate a Unit ID.
- **Header bands never overlap or leave blank blocks:** every header cell belongs to one opaque band;
  paint order is shared (sticky header above body, pinned above unpinned, pinned header above both).
- **Row highlight** (owner ruling 2026-09-29, BUILT): `rowHighlight` draws a 3px left stripe —
  current semantic condition colour — with its label as hover title and `aria-description`; one row
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
SO Batch's separate `Purchase order details` table is deleted (owner ruling 2026-10-06): its PO
facts are on the row listing and each PO page — see Purchasing MASTER §9.1. The deletion is
Purchasing-specific and does not generalise to other modules.

**The connector belongs to the table (BUILT 2026-09-18 / 2026-09-21).** Only the grid knows where its
caret cell is, so the line is drawn by CSS inside that cell, never by arithmetic over declared widths
(measured failures: summing widths was ~900px wrong on wide canvases; anchoring the frame at a column
put it beyond the fold). The row-to-expansion line drops from beneath the `▸` (50% of the caret cell),
curves in the expansion's pinned gutter and runs flat into `ConnectedSections` at
`EXPANSION_JOIN_Y` = 21px; it holds under sideways scroll. An item's `Ready Stock` disclosure draws a
1px line from beneath its own cell to the TOP BORDER of its stock frame, which spans the full goods
row; it disappears when collapsed and never runs into the next item. The active goods context carries
the current selected-state boundary; the stock frame is neutral white; neither is evidence of a saved reservation. A
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

## §6.11 · Field-width registry — one number per field

**Migration note 9 Oct:** the table below is prior implementation measurement evidence. Re-measure all adopted fields with 01 typography/padding before using them as new target widths. Preserve stable registry keys; do not copy literal old widths into pages.

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
| Stock Status (status pill) | 120 | **MEASURED — old words** | Sales Orders live 2026-10-05 cut the retired `Receipt unconfirmed` pill; re-measure against the Orders MASTER Stock Status words when they are built |
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
| SO Batch Purchase and Manual Purchase: their own approved listing designs (§6.8); the PO Duty owner chip only beside the selected `Issue PO` (`YJ`), Export at the far right | 2026-09-18 | Purchasing MASTER §§9.1–9.2 |
| SO Batch `PO No` cell: every linked PO on one line, comma-separated, each its own link, 170px, no wrap (DEPLOYED #1924; signed-in check owed). Sales Orders' `PO No` cell follows the same rule (owner 2026-10-06, NOT BUILT); Sales Orders' `DO No` is unchanged | 2026-10-05 / 10-06 | Purchasing MASTER §9.1 |
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
| Card editable `To` vs Work recorded channels | `CompactModuleCard` Communication offers an editable `To`; Work's `WorkCommunication` allows recorded channels only (owner ruling 2026-09-17) | Owner decision |
| `Jump to…` empty word | The locked contract prints `No results`; COPY-STANDARD rule 5 lists `No results` as the ✘ empty-state example. Reconcilable (a search matched nothing; a worklist is empty) but COPY does not yet carry that split | COPY ruling |
| Facet counts spelt three ways | PO §9.3 (whole register), Purchase Returns §9.6 (respect other dimensions), Supplier Claims §9.5 (complete searched/filtered set) versus §6.7's one reading | Converge each page in its own round |
| Shared Select long option at 390px | measured right edge 420.72px beyond the viewport (research file §9) | Kit fix |
| WarehouseIncoming modal close | focus lands on the page, not the Count trigger (research file §9) | Adopt `DialogFrame` focus return |
| Picker inside a dialog renders UNDER it | a real P1 defect, approved, not built | Kit fix |
| **Customer lookup placement** | The caller-lookup capability (name/phone/order number across all a customer's orders and recorded history) is approved 2026-09-24/26; its rail door was removed 2026-10-05. Tasks → `Sales Order` tab shows only the linked SO's customer | Owner decision on where the cross-order lookup lives (PROPOSAL in §5) |

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
- **Shared region error/permission recipe** — component adoption and full-page states still require proof (01 §8).
- **Touch targets** — existing consumers must pass §2.2; a drawn glyph size does not prove the control hit area.

- **Accessible assignment avatar** — the avatar-only hover/focus/tap identity contract has no shared
  component.
- **`/ui` whole-page coverage** — Register, Working Panel and Object examples with all responsive and
  failure states still need an audit; component examples are not complete-page evidence.

## §7.4 · PROPOSAL / NOT LAW — challenge, never obey

| Proposal | Source | Falsifier / decision owed |
|---|---|---|
| How `Tasks` coexists with Calendar, Activity and the page's work (same-area replacing is one option, not decided); Calendar must stay quickly viewable while handling a task | owner direction 2026-10-05 | Under research; owner review |
| Reduced motion: animations respect the operator's reduced-motion setting | consolidation review 2026-10-05 | Owner/kit decision; no rule until approved |
| Confirm before an act that cannot be undone, in COPY wording | consolidation review 2026-10-05 | Any word change goes through COPY |
| Expansion-only Columns (opt-in goods columns, OFF by default) | Purchasing 2026-10-05 | Owner has not decided (§6.3) |
| "Several SOs → list first, then one" inside a host panel | Purchasing 2026-10-05 | Owner decision |
| PO working panel and round panel content layouts; SO Batch round rail; `Match Ready Stock` placement; SO Batch optional goods columns replacing the details table | Purchasing lane, localhost | Owner review in the Purchasing lane |
| Purchasing fit review — four cross-module contracts: linked sections distinguish loading/error/empty/present/denied; current, last-sent and goods completion are separate facts; blocker summaries point to the exact row/field and keep the draft; source/Unit evidence stays traceable | Purchasing PLAN 2026-10-01 | Verify against existing components; Purchasing owns its sample |
| Inventory top-filter placement (instead of a rail) | research file §4 | Complete compact-top versus rail analysis |

## §7.5 · Approved targets not yet built (shared)

Shared Tasks-region adoption plus retained Calendar/Activity integration and all-module calendar filters (§5) · `Assigned to` /
`Completed by` wording (§5.1) · mission entries on module rails (§6.1) · `Warehouse` tab (§4.3.4) ·
personal saved-layout rollout (§6.7) · facet-count convergence (§6.7) · SO dealer/product multi-select
`base-*` → kit palette (4,661 sites; page by page with the page migrations, never globally) · real
pages on `PageShell` / `DataTable` / `DetailShell` (the order drawer is BLOCKED: L4 needs a facts
4-tuple that does not exist) · splitting the grid's `layout` prop when a page needs resize without
reorder · `SavedEvidenceViewer` adoption in Stock and Service.

## §7.6 · Rejected or withdrawn — do not revive

`warehouse-ui-preview.html` (hand-written shell, blue summary box, concatenated goods expansion —
rejected by the owner) · `inbound-flow.html` (not accepted as a build reference) · the 48px toolbar
candidate · the unapproved alternative palettes, 9px essential labels and 700 weight ·
a generic full-order editing drawer beside the Working Panel · `DetailShell` as a cross-module shell ·
the always-visible icon-only Export/Columns toolbar (replaced by `⋯`) · the former quick-view `Block`
composition (replaced by `CompactModuleCard`).

## §7.7 · Measured debt

**Colour** (measured 2026-07-29): 6,385 colour sites; after the ruler shipped 5,545 of 6,129 measured
(90.5%), rules O 4,661 · P 594 · Q 111. **Typography:** the `t-*` ramp is retired; sizes carry weight
and line-height in ONE class. **The kit's own coverage number may never go down.** The grid's render
cost is linear in rows and flat in density (research `grid-findings.md` F64–F70): a windowing
question, never a row-height one.
