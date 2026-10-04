# UI — MASTER

> **The only UI-architecture document.** Overwritten when re-ruled; never versioned.
> **Start with `AGENTS.md` and the ERP PLAN CHAT START PROTOCOL; this is the shared UI authority.**
>
> **Canonical token definitions live in the three standards below.** The source-audited template
> measurements in this MASTER are implementation references, not independently editable tokens:
> [`../01-design-tokens.md`](../01-design-tokens.md) (spacing · colour · typography · icons) ·
> [`../02-components.md`](../02-components.md) · [`../03-page-patterns.md`](../03-page-patterns.md).
> **Change canonical tokens/components first; refresh template measurements in the same change.**

| I am working on | Read |
|---|---|
| **any UI at all — first** | **§0 Current kit index** (below) |
| anything | **§1 · §2** |
| a kit component | **§3** |
| a page shell or a grid | **§4** |
| the right rail | **§5** |
| colour or typography debt | **§6** |
| something approved and unbuilt | **§7** |

---

# §0 · Current kit index — read this first

**One row per thing on screen; one current source per row.** If something is not in this table it is
not a current pattern: do not copy it from a neighbouring page. Live examples are on `/ui`. "Files" is
the count of app files importing it, measured on `fe53daeec` (tests and `/ui` excluded) — re-measure
before quoting. Built is not the same as owner-verified on every page.

| Area | Use this | Source | Status |
|---|---|---|---|
| Tokens: type · colour · radius · icons · layers | Tailwind token classes; `Icon`; `overlay-layer` | `01-design-tokens.md`, `tailwind.config.ts`, `components/kit/Icon.tsx` | LOCKED · built |
| Page frame | `ListPageShell` (27 files) today; kit `PageShell` (6) is the target | `components/ListPageShell.tsx` · `components/kit/PageShell.tsx` | Moving a page onto `PageShell` re-lays it out: owner preview first |
| Register / listing | `register/DataGrid` (41) with §6.0 · §6.7–6.10 | `components/register/DataGrid.tsx` | Owner accepted 2026-10-01 · built |
| Simple and document tables | `DataTable` (16) · `DocumentTable` · `TotalsSummary` · `TableScroller` | `components/kit/*` · `components/TableScroller.tsx` | Built |
| Local filter rail | the Sales Orders `.so-template-rail` recipe | `SalesOrdersRegister.tsx` | Accepted 2026-10-01 · not yet extracted to the kit |
| Object header + tabs | `SalesOrderTabs` recipe | `pages/operation/SalesOrderTabs.tsx` | Accepted · page-owned, no generic API yet |
| Forms | `Input` · `Textarea` · `Select` · `SearchInput` · `Checkbox` · `DatePicker` · `FieldFrame` | `components/kit/*`, `field-recipe.ts` | LOCKED · built |
| Buttons and menus | `Button` (99) · `DropdownMenu` · `Popover` · `Tooltip` · `Segmented` (Table/Cards) | `components/kit/*` · `components/Segmented.tsx` | LOCKED · built |
| Fact cards | `Block` — the one object card (§4.1) · `Panel` · `StatusPill` · `EmptyState` · `Loading` | `components/kit/*` | LOCKED · built |
| Orders list / drawer band | `SectionPanel` (cream band) — that surface only, not a general card | `components/SectionPanel.tsx` | Governed by §4.1; not a `Block` duplicate |
| Dialogs and panels | `Modal` · `Drawer` (incl. quick view) · `Toast` · `PdfPreview` · `SavedEvidenceViewer` | `components/kit/*` | Built |
| **Compact module card** (shared customer header, module tabs, module summary, editors, items, Communication, Timeline) | **`CompactModuleCard`** — pass the header facts once and each module's own facts, editors and items | `components/kit/CompactModuleCard.tsx` · `/ui#compact-card` · contract `docs/ui-reference/MODULE-CARD-TEMPLATE.md` | Owner rules 2026-10-03/04 (§4.3) · shared component built · **Sales Orders adoption and confirmed corrections production verified 2026-10-05 (PR #1893/#1896/#1897; §4.3 evidence)** · palette/font/radius await the token decision |
| Work right-panel Communication | `WorkCommunication` — recorded channels only | `pages/operation/work/WorkCommunication.tsx` | Owner ruling 2026-09-17 · built; differs from the compact card's editable `To` (open owner question) |
| Record history | §5 three-rank grammar 13/12/11 | this MASTER §5 | LOCKED · no shared component; each page draws it |

**Retired — do not import; a test blocks new use** (`components/retired-components.test.ts`): `Btn`
(→ `Button`), `Field` (→ kit inputs / `field-recipe`), `PageHeader` (→ `PageShell`). Their remaining
pages move only after the owner approves a before/after preview, because each swap changes what the
operator sees. **Deleted 2026-10-04:** the `carres-design` agent skill and
`docs/ui-reference/po-supplier-reply-mock.html`; 2026-10-04 the Delivery-only card reference, superseded by
the shared-header handoff. `docs/ui-reference/` holds only the compact-card contract, its reference page
and measurements.

---

# §1 · Overview

**Shared document display implementation — 2026-10-04, branch only / NOT PRODUCTION VERIFIED.**
`packages/shared/src/document-display.ts` provides `documentDisplayNumber` for known Carres-owned
numbers. It validates the date segment, preserves prefix/serial/version and leaves short or
non-date identities alone. Monthly granularity must be explicit, avoiding reinterpretation of
legacy six-digit daily dates. Receiving adopts this through its existing number reader;
other modules are not claimed migrated. Never call it on supplier-owned document references.

**Document numbers — owner clarification 2026-10-04 / APPROVED TARGET.** Every module follows
COPY-STANDARD's system-wide two-digit-year document display contract. Reuse one shared formatting
rule across lists, Working Panels, full pages, related records, search, Work and document previews;
no PO-only exception or page-local formatter. Stored identities and historical issued documents
remain unchanged; verify adoption per surface before calling it built.


**Receiving compact-card adoption — branch only, 2026-10-04 / NOT PRODUCTION VERIFIED.**
Receiving's adapter uses the existing compact-card Drawer and `CompactModuleCard`. A module may
provide `detailsLabel` for its own object vocabulary; omission preserves Sales Order wording.
`referenceStatus` provides an exceptional document state below the reference (Receiving:
`Cancelled`), omitted on a normal document. Receipt quantities, evidence and history remain
source-owned, and the full GRN owns amendments, voiding and PDF. No new card or drawer engine.

## Reuse-first shared page templates — owner ruling 2026-10-01

### Reference geometry with Carres colour — owner direction, 2026-10-01

**APPROVED DIRECTION / implementation not verified.** Use the measured Houzs geometry and
information hierarchy as the reference, adapted to Inter and the existing Carres semantic palette.
Copying the relationship between text, whitespace, surfaces and emphasis does not approve literal
Houzs green, a new hex palette, or all reference dimensions. The pending warm-grey hex proposal is
withdrawn from the current direction; it supplies no tokens. Carres canvas/surface/slate text and
borders remain authoritative; blue retains admitted primary/selection/focus roles and red retains
error/destructive-condition meaning under existing action rules. This does not add a danger Button
variant or recolour actions merely because their verb sounds destructive.

**APPROVED TARGET — compact search, owner follow-up2026-10-01.** Canonical dimensions are in
01§7.2. Placeholder is `Search orders…`; an accessible hint describes only the actual supported
search fields. Do not advertise phone or universal server search without implementation proof.
Visible SO toolbar content is search, admitted Table/Cards and far-right `⋯`; count and quantity remain in the footer.
The search and right-toolbar design are settled for this scope; accepted geometry and bounded delivery evidence are governed by Confirmed shared template below. Existing Carres neutral canvas, white surfaces, dark/mid neutral text, light neutral
header/hover/borders, blue primary/selection/focus and red error/destructive-condition roles remain;
no palette token changes. The accepted SO rail,32px main rows and read-only quick view are governed by Confirmed shared template; this does not admit a generic editing drawer. No automatic global adoption, merge or deployment is authorised.


### Register toolbar — owner-approved target, 2026-10-01

**APPROVED TARGET / NOT BUILT.** Jess approved the Sales planner's fixed far-right overflow
recommendation. Search, current filter summary and Table/Cards (where supported/admitted) remain
visible. Secondary supported page tools, including Export and Columns, move into the far-right
`⋯` menu. Wrap/reset appear only where actually supported. Menu entries have icon and text; they
are page tools, never order amendment/cancellation writers. Keep governed creation and selection
ownership; this ruling does not invent actions or remove any export/permission semantics.

The canonical trigger measurements are in 01 §7.2. On narrow screens put secondary tools into
overflow first to preserve a single row and visible primary controls; do not silently hide an
active filter or query. Preserve an accessible trigger name, keyboard menu use and focus return.
If primary content still cannot fit, report the measured gap rather than shrink type or invent a
second layout. Existing toolbar height stays in force: the earlier 48px candidate is **NOT
APPROVED**. Current dimensions and rail composition are governed by Confirmed shared template below.

Sales is the first pilot; other module adoption needs its own verification and existing lane
boundary. Documentation approval is not proof of implementation or permission to merge/deploy.

**Numeric contract, 2026-10-01:** [01 §§7–8](../01-design-tokens.md#7--canonical-component-measurements--scoped-not-one-size-for-every-surface)
contains self-contained Carres values, source/target/status and the Sales-first acceptance boundary.
Old generic sizing assumptions are replaced by scoped shared recipes. Actual font loading remains
unverified here. Source table-header weight drift and small touch targets are recorded as gaps;
accepted Sales density and Cards composition follow Confirmed shared template; other adoption still requires verification.

**RULING / APPROVED DIRECTION AND DOCUMENTATION COMMISSION.** One Carres kit serves every
module. **Houzs-first complete visual templates, then tune for Carres** is the owner's current
presentation direction. Use coherent reference page families and their related hierarchy, density,
spacing and controls as the starting point, rather than retaining confusing Carres composition or
copying isolated decorative pieces. Preserve working business behaviour, permissions, evidence and
write ownership; reuse existing Carres components where they can deliver the reviewed target.
Component existence alone does not justify retaining a rejected visual result. This direction
supersedes the restriction that only a missing capability can justify borrowing presentation.
It does not approve every Houzs screen or literal pixel value: show complete reference-to-Carres
samples with realistic Sales, Purchasing and Warehouse content, retain the Carres brand, and
identify justified adaptations. Existing explicit presentation locks and token values remain in
force until a concrete replacement is reviewed and persisted; this direction commissions that
review rather than silently changing them. Reference code copying still requires verified rights,
dependencies and compatibility; pattern adoption is separate from source-code import.
The owner requested this explicit contract in the existing UI MASTER, not another kit or guide. Application changes, implementation Cards, deployment and external
cutover remain outside this PLAN commission. **ADOPTION AND FULL OPERATOR VALIDATION PENDING**:
a written contract is not proof that all pages comply.

### Approved reference template families — owner selection 2026-10-01

**RULING / APPROVED TARGET DIRECTION / NOT BUILT.** The owner explicitly selected complete
Houzs **list, detail, form and card** templates as the visual starting point for Carres, with
Carres blueprint concepts adapted into them. This is one shared presentation programme for
Sales Orders, Purchasing and Warehouse, not four independent page-local designs.

| Approved family | Reference basis already inspected | Carres adaptation to present for review |
|---|---|---|
| List | Service Cases register and shared DataTable | Complete toolbar, table, expansion and footer composition with Carres fields, retained filter rail and authorised actions; preserve search, scope and selection behaviour. |
| Detail | DetailLayout and inspected SCM detail surfaces | Complete identity/action/section/document/history composition using the owning Carres blueprint; no automatic requirement that every object become a drawer. |
| Form | SCM FormCard/FormGrid and Sales Order form source | Complete grouped fields, goods, validation and save arrangement; preserve Carres required facts, approvals and source-owned writes. |
| Card | Overview Needs you, summary cards and Loading List goods cards | Distinct task, summary and goods compositions with coherent text hierarchy and spacing; preserve true Work ownership and physical-work outcomes. |

The selection approves these complete reference families, not a claim that all adaptations,
values or states have been shown or verified. Present realistic complete pages for owner review,
including necessary small-screen/state variants and explicit deviations from the reference.
Keep the Carres brand and business truth. Do not restart approved module business blueprints.
Do not equate this selection with source-code licence clearance, blanket backend copying,
application implementation permission or completed kit adoption.

### Existing implementation sources and preservation contracts

The following sources identify current reuse and business-preservation boundaries, not a veto on
the approved Houzs-first visual adaptation. Paths below are relative to `apps/web/src/`. Existing
module-specific business rules and explicit presentation exceptions remain binding; identical
visual grammar never means identical fields, permissions or lifecycle.

| Surface / job | Actual shared source and inspected adopter | Required composition and behaviour | Allowed module differences |
|---|---|---|---|
| Module shell | `pages/operation/components/ModuleHeader.tsx`; current Sales Orders / Inbound | Existing navigation and shared destination header/global tools; page actions in the governed toolbar. No page-local replacement navigation, second title or decorative summary strip. | Governed destination name and content; current UI §6.0 owns header details. |
| Register | `components/register/DataGrid.tsx`, `register-field-widths`; `SalesOrdersRegister.tsx`, `WarehouseInbound.tsx` under `pages/operation/` | Shared search/column/filter/selection mechanics; explicit identity and action doors; governed widths/pinning and return context. Empty, loading, denied and failed reads are distinct. | Source population, business columns/order, approved exceptions, authorised actions and selection capability. |
| Filter rail | `pages/operation/components/workspace-rail.tsx`: FilterRail, FilterRailGroup, FilterRailRow | Preserve the existing rail. Applied conditions, rows, quantity summary and export describe the same scope; record counts and goods quantities are labelled separately. Keep governed Site tabs where present. A narrow-screen filter surface retains the same conditions. | Admitted filter dimensions and governed base population; contextual facet counts follow the current shared filter law. |
| Goods expansion | `pages/operation/components/GoodsMiniTable.tsx`; SalesOrdersRegister `ExpandedLines`; WarehouseInbound `InboundExpansion` | A structured read-only child table, real headings, aligned values and exact identity links. Expand has one job: goods and their relevant quantity/evidence detail. Never replace it with concatenated prose or a second editing form. | Source-owned receiving/loading results and approved line selection. Prove component capability before extending it; do not force Sales columns onto receipt facts. |
| Object detail | `pages/operation/SalesOrderWorkspace.tsx`, `purchase-orders/PurchaseOrdersPage.tsx`, `WarehouseUnitDetail.tsx`; shared `components/kit/Block.tsx`, DocumentTable, TotalsSummary | Use the existing approved object composition: identity, current authorised actions, grouped facts, source documents/evidence and actual history. Use shared Block chrome and table/totals treatment. The object's MASTER owns placement and business meaning. | Business groups, appropriate action placement and source-owned facts. A Unit is not a sales commercial record. |
| Edit / review | Existing source-owned forms and review surfaces; `components/kit/FieldFrame.tsx`, Input, Select, DatePicker, PdfPreview | Pre-filled known facts, grouped necessary inputs, field errors plus a discoverable blocked-save reason; preserve input on failure. Current-version preview, authorised save and clear saved/unsaved result. | Required fields, approved document preview arrangement and actual business validation. |
| Field operation | `pages/operation/components/ReceivingWorkspace.tsx`, PoReceivingView; `WarehouseOutboundWork.tsx` Loading workspace | Preserve the one receiving/loading write door. Clear source identity, goods/Units, physical checks, evidence, next action and residual work. Return to the same list context. Warehouse submission is not posted GRN; loaded is not driver-confirmed. | Physical steps and source contracts, never a second stock or approval engine. |
| Preview / confirmation | `components/kit/PdfPreview.tsx`, SavedEvidenceViewer, DialogFrame, Modal, Drawer | Use the existing admitted container for its purpose; correct version and evidence permissions, close/back behaviour and focus return. A preview is not a competing editable detail. | Evidence/file type and bounded confirmation content. Do not migrate all details to drawers because a reference uses one. |
| Work / ownership | Shared Work source/resolver plus `components/kit/Block.tsx`, RouteStop, ChecklistRow, QuietRouteRow | Render resolved responsibility and source action; current UI law uses Assigned to and Completed by. Completion comes from the owning business result. Authorised help retains the actual performer. | Source, governed dates and actions; no page-local rota, substitute resolver or fake Mark done. |

**Do not select by filename alone.** The inspected `components/kit/DetailShell.tsx` contains
OrderActionTrack and a fixed four-fact identity contract. It is not evidence of an unrestricted
cross-module detail template. Use the current approved object grammar and actual adopters above;
do not impose that older order model on unrelated objects. Existing generic DataTable uses are
not automatically wrong, but `docs/02-components.md`'s global-only DataTable wording cannot override
this MASTER's governed Register/DataGrid rules. Fix documentation scope, not working registrations.

### Typography and colour usage

**RESOLVED FROM EXISTING AUTHORITY:** `docs/01-design-tokens.md` owns the numerical values;
`components/kit/tokens.ts` and the configured classes implement them. No page chooses a new palette,
font scale, border, radius or spacing to resemble a screenshot. Current page/card/body/meta roles
remain 24/15/13/12 with the existing title, label and scoped Work-control roles. English uses the
configured Inter chain; mixed CJK uses the existing CJK handling. Codes and numeric columns use
the current code/numeric treatment, not an arbitrary second font per page.

**FIELD TYPOGRAPHY — PROPOSAL / NOT LAW / NOT BUILT:** measured Houzs Loading List uses a
16px document identity, 14px goods text and 12px supporting text. Evaluate that bounded field-card
hierarchy against Carres's current 15/13/12 with the same realistic content and viewport. Do not
apply it portal-wide or expand the Work-only control token to authorise it. Acceptance requires
better identity/product recognition without obscuring quantities/actions or excessive scrolling;
otherwise retain or revise the proposal. The owner's request to document the kit does not silently
approve a token-value change or make an unshown comparison validated.

**Colour mapping — retain the governed Carres semantic palette:** canvas/surface separate the
page from white cards; primary text is slate-12 and supporting text slate-11. Important facts do
not use disabled/placeholder colour. Blue remains the governed action/link/selection treatment;
hover and persistent selection are distinguishable. Success, warning and error use their existing
semantic pairs with explanatory text. A status label follows its actual business meaning: a
confirmed document is not automatically a completed physical job. The Houzs light-fill/dark-text
pill is a reference interaction, not permission to copy its green/brass palette, label vocabulary
or status mapping. Icons, text and state meaning remain readable without colour alone.

### Three-module alignment evidence — 2026-10-01

**FACT / SOURCE INSPECTION, NOT ALL-PAGE PRODUCTION ACCEPTANCE.** At inspected main
`86046dde04d29856a78be6a8f7cf0923405f6f00`, use the same table to track actual reuse rather
than infer delivery from coordination acknowledgments. Sales Order and Purchasing PLAN chats
acknowledge the shared direction; that does not certify rendered or business parity.

| Surface | Sales Orders | Purchasing PO | Warehouse | Remaining gap / verdict |
|---|---|---|---|---|
| Filter rail | workspace-rail FilterRail family | same family | same family in Inbound/Outbound | READY shared source; scoped counts, small-screen use and actual adoption still require page evidence. |
| Goods expansion | GoodsMiniTable through ExpandedLines | GoodsMiniTable through OrderedGoods | InboundExpansion; Outbound local goods/Unit rendering | Existing implementations, not a missing table engine. Compare and unify compatible visual grammar; preserve receiving/loading-specific facts. |
| Detail card | SalesOrderWorkspace imports kit/Block | PurchaseOrdersPage imports kit/Block | WarehouseUnitDetail imports kit/Block | READY card source, not proof all complete detail compositions match current law. |
| Execution workflow | Order amendment | Purchase Review/PDF/send | Receiving and Loading | Different legitimate jobs; reuse controls/feedback, do not force identical forms or share write ownership. |
| Typography/colour | Same governed kit baseline | Same governed kit baseline | Same governed kit baseline | Contrast findings below apply to candidate pairs; actual overrides/all-state use not yet audited comprehensively. |
| Work/ownership | Shared Work/Duties contract | same contract | same contract; Unit work currently only Issues | Integration evidence incomplete; do not invent another task list or claim all action links are wired. |

**Shared remaining acceptance:** a real approved exemplar per applicable template; component/source
mapping for each adopter; reviewed allowed differences; relevant state/viewport evidence; source-owned
workflow outcomes. Only then may a row be labelled adopted/verified. Existing colour adjustments
remain proposals; prior confirmations that values are unchanged describe current implementation,
not approval or deployment of the darker-button proposal.

### Colour contrast finding — measured palette pairs, 2026-10-01

**FACT / CALCULATED TOKEN PAIRS, NOT A FULL RUNTIME AUDIT.** Using opaque sRGB values
from the installed Radix palette and WCAG relative-luminance calculation: white on blue-9
(`#0090ff`) is 3.26:1; white on existing blue-11 (`#0d74ce`) is 4.77:1. Slate-12 and slate-11
on white are 16.39:1 and 5.94:1. Green-11 on green-3 is 4.21:1; amber-11 on amber-3 is
4.25:1; red-11 on red-3 is 4.54:1. Rounded figures are for reporting, not boundary decisions.
The normal-text minimum is 4.5:1 under
[WCAG 2.2 contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
These results invalidate a blanket assertion that the proposed semantic pairs are already
suitable for small labels. Actual component foreground/background/opacity must still be checked.

**PROPOSAL / NOT APPROVED / NOT BUILT:** retain the blue brand family, evaluate existing blue-11
as the filled primary-button background with white text rather than blue-9; separately evaluate
darker existing semantic foregrounds for small success/warning labels. Do not replace the brand
token globally or silently approve hover/focus/disabled states from this calculation. Real component
samples and owner review remain required before changing locked colour use.

### Houzs selection and copy boundary

Reference fixed at `ecce2e9676acc555efa8b2c30e78052b2ab54749` in
`Houzs-Century/Houzs-ERP`. Relevant source inventory is not one importable library:
`frontend/tailwind.config.js`, `frontend/src/index.css`,
`frontend/src/vendor/design-system/tokens.css`; vendor Button/IconButton/PriceTag; separate
`frontend/src/components/` Button/DataTable/Layout/DetailLayout; and
`frontend/src/vendor/scm/components/` form/dialog/evidence components. Duplicate button families
have different sizes. Importing all of them would create competing kit definitions.

| Inspected reference | Decision and retained lesson | Required adaptation / evidence status |
|---|---|---|
| `frontend/src/pages/scm-v2/LoadingList.tsx` | REUSE CANDIDATE for identity-first card grouping, goods/quantity alignment and a distinct action door. Goods are shown directly; this is not the Carres goods expander. | Compose with Carres components only where needed; preserve Unit, receipt and driver facts. No generic exported LoadingCard was found in that file. |
| `frontend/src/components/DataTable.tsx` | KEEP existing Carres DataGrid capabilities; study only a demonstrated missing interaction. | No replacement table engine justified. Source existence does not prove runtime parity. |
| `frontend/src/pages/scm-v2/GoodsReceivedListV2.tsx` | Reference for line breakdown and contextual detail access. | Preserve existing Carres full detail/receiving doors unless a scoped benefit is demonstrated; no automatic drawer conversion. |
| Vendor SCM FormCard / SaveProblemsList / SaveBlockedIndicator | REUSE CANDIDATE for understandable grouped input and actionable save feedback. | Map current FieldFrame and workflow errors first; no proven missing foundational engine. |
| DocFilesCard / PhotoGallery / MediaLightbox | KEEP existing Carres evidence viewers; assess only an actual unsupported capability. | File permissions, actual Unit association, source/version and media behaviour must survive. |
| PendingTasksReminder / PresencePanel / WorkspaceTabs | Reference evidence only; reject as replacement for Carres Work/Duties. | Pending reminders, online people and page tabs do not prove compatible task assignment or cover. |

Live read-only Loading List observations establish visible grouping and computed styles at the
observed viewport, not its deployment SHA or successful business writes. Houzs tests were not run;
current 2990 parity is unknown. Source-code rights, dependencies, data semantics, security and
compatibility are not fully verified: **no source-code item here is COPY REQUIRED**. Pattern reuse,
existing Carres component reuse, reference source copying and business-workflow adoption are
separate decisions. No unverified time-saving estimate is a reason to replace working behaviour.

### Houzs top-to-bottom UI coverage and measured examples — 2026-10-01

**FACT / REFERENCE AUDIT; CARRES ADAPTATIONS BELOW ARE PROPOSAL / NOT LAW / NOT BUILT.**
This is an audit coverage map derived from the inspected reference sources, not a claim that
Houzs publishes this checklist or has a single uniform UI kit. Source paths below are relative
to `frontend/src/` at the reference commit above. Directory inventory is not behaviour validation.
Existing Carres authority remains binding; proposed gaps do not authorise page-local components.
The design-system skill is used to separate tokens, components, patterns and interaction states.

#### Why the two owner-selected surfaces read differently

Read-only computed-style measurement on the live `/assr` table at **914 CSS px** width:
header 11.5px/600, 14.375px line-height, 8px vertical / 12px horizontal padding (outer selection
cell has a 20px left inset); header height 34.375px. Body cells 13px/400, 16.25px line-height,
6px vertical / 12px horizontal padding; sampled ordinary rows 29.5px high. The actual document-ID
child span is **12px/500**, not the body's inherited 13px/400. White and pale alternate rows,
subtle horizontal dividers and a darker header separate the reading bands. Fixed column widths
and a horizontal scroll surface keep columns from crushing each other. These are observed
samples, not universal fixed heights: wrapping, controls and secondary lines can increase height.
Source: `components/DataTable.tsx`, including `cellPad`, `headPad`, header/body rendering and
column-width resolution. At the default 603px viewport the inspected page showed a wrap/card
representation; it must not be certified as the same desktop table shrunk to a phone.

Read-only live Overview `Needs you` measurement reported **1280 CSS px** width: white card,
20px internal padding, 12px radius; heading 15px/700 with 22.5px line-height; record identity
13.5px/600 with 20.25px line-height; supporting line 11.5px/400 with 17.25px line-height.
A sampled two-line action row is 57.5px high, with 10px top/bottom padding and 12px gap between
its dot, text group and badge. The status badge is 9px/700, 2px vertical / 6px horizontal padding.
Source: `pages/Overview.tsx` and `components/Badge.tsx`; source card padding is responsive
16px then 20px. The screenshot marker's blue border is an annotation, not product selection.
These live observations are not linked to a verified deployment SHA; the reference source commit
and runtime observations remain separate evidence.

**Recommendation:** preserve the distinction between a dense comparison register and a task feed.
Borrow hierarchy, consistent alignment and purposeful whitespace, not every foreign pixel value.
A record's identity leads; supporting context is subordinate; state and action stay findable.
Do not use 9px badges, 700 weight or a 12px radius as implicit Carres approvals. Carres's existing
weight/radius/text roles remain authoritative pending an explicit reviewed token change. The
Overview uses truncation; full party/reason discovery and keyboard use need validation before
adopting that behaviour. The selected screenshots also show floating controls/update banners near
content: obstruction must be checked, not copied as desirable chrome.

| Coverage ID / surface | Houzs evidence / useful lesson | Existing Carres / proposed treatment | Still required before adopted/verified |
|---|---|---|---|
| UI-01 Semantic colours | `tailwind.config.js`, `index.css`, vendor tokens: canvas, surface, ink, functional accent, status pairs | KEEP Carres palette; improve evidenced contrast only through governed values | Rendered default/hover/selected/disabled/error pairs; current contrast proposals remain pending |
| UI-02 Typography | Overview vs DataTable vs LoadingList use distinct hierarchy; measured examples above | KEEP roles; bounded field-card typography proposal only; no portal-wide enlargement | Same realistic content comparison, CJK, numbers, long identifiers, zoom |
| UI-03 Spacing / border / elevation | Overview card padding versus table cell padding intentionally differs | KEEP token scale; specify card, row, section and toolbar composition separately | Approved full-page sample, nested sections, content density; no copied foreign radius |
| UI-04 Shell / navigation | Sidebar, TopNavbar, WorkspaceTabs and mobile navigation | KEEP Carres shell, Work/Quick Rail and module ownership; REJECT imported foreign navigation | Active destination, small-screen access, content and overlay clearance |
| UI-05 Page heading / toolbar | Layout/PageHeader and service register separate identity, search and tools | KEEP ModuleHeader + governed register toolbar; no decorative duplicate heading | Primary action, filter/selection state, narrow wrapping |
| UI-06 Search / filters / scope | DataTable search-scope hint, column filters, ColumnsDrawer | KEEP DataGrid + FilterRail; borrow only a demonstrated missing interaction | Scope matches summaries/export, clear/reset, saved state, permission population |
| UI-07 Dense register | Measured `/assr`; aligned widths, calm rows, stronger identity, light dividers | IMPROVE composition within DataGrid if comparison proves a deficit; no engine replacement | Column-by-column mapping, actual long data, hover/selection/focus, numeric alignment |
| UI-08 Columns / sorting / wrapping / paging | DataTable width/reorder/freeze/wrap/paging code and visible controls | KEEP existing equivalents; missing behaviour is REUSE CANDIDATE after capability mapping | Persistence, sort/filter combinations, keyboard access; source tests not run |
| UI-09 Row expansion / goods | LoadingList always shows goods; GoodsReceivedListV2 has breakdown; not one universal expander | KEEP GoodsMiniTable and source-owned warehouse facts; no prose-packed expansion | One expansion purpose, identity links, quantity meaning, many lines |
| UI-10 Task feed card | Overview `Needs you`: heading/count, two-line item, small state badge | ADAPT hierarchy using existing Work/Block patterns; no new job source | Full context access, actual assignee/actor, deep link, failure distinct from no work |
| UI-11 Summary / selectable cards | Overview KPI ribbon; service stage funnel visible in live page | Use summaries only when they help operation; selectable filters retain scoped truth | Distinguish static metric from filter/action; selected state, counts and keyboard |
| UI-12 Object detail / section card | DetailLayout, ResizableDetailDrawer; SCM FormCard | KEEP approved Carres object grammar and Block; no blanket drawer migration | Identity, current action, grouped facts, long content, evidence and history |
| UI-13 Forms / grouped fields | FormCard shares SalesOrderNew stylesheet; FormGrid documented 4/2/1 columns; FormField label/hint | KEEP FieldFrame and admitted inputs; adapt grouping, not supplier/sales assumptions | Required/read-only/error states, address wrapping, help, input preservation |
| UI-14 Buttons / icons / badges | Separate main and vendor Button families; Badge soft/solid/outline, 9/10.5px sizes | KEEP one Carres family; REJECT importing parallel families and tiny badges | All states, icon labels, keyboard focus, destructive meaning and contrast |
| UI-15 Save feedback / blocked action | SaveProblemsList aggregates line/field problems; SaveBlockedIndicator | Map existing validation first; ADAPT understandable all-problem feedback where missing | Actual API error contract, locate field, retain input, retry, stale record |
| UI-16 Dialog / drawer / confirmation | DetailLayout/drawer and SCM Modal family | KEEP Carres Modal/DialogFrame/Drawer for admitted purposes | Focus containment/return, Escape, unsaved close, scroll, permission errors |
| UI-17 Files / photos / documents | DocFilesCard, MediaLightbox and evidence components | KEEP DocumentTable/PdfPreview/SavedEvidenceViewer; no duplicate uploader | Unit/source association, version, rights, failed upload, preview/download access |
| UI-18 Loading / empty / failure | EmptyState, Skeleton; Overview explicitly distinguishes failed inbox read from zero tasks | KEEP truthful shared states; adapt missing composition | No results vs no access vs failed read, recovery action and preserved filters |
| UI-19 Small screens / keyboard | DataTable wrap representation observed; form grid source breakpoints | ADAPT responsive presentation without changing business scope | Tab order, visible focus, touch controls, zoom, horizontal scroll and overlay clearance |
| UI-20 Ownership / history / completion | Reminder/presence/tabs are insufficient proof of job ownership | KEEP Carres Work/Duties, business audit and actual actor; reference workflow REJECT if incompatible | Source action completion, authorised cover, partial work, history and return context |

**Coverage status:** shared-source inventory and the measured examples above are available.
This is not an exhaustive runtime verification of every Houzs component, theme, permission or
state. Rows with only source evidence remain source-inspected; states listed in the last column
are acceptance gaps, not invented defects. No Houzs tests were executed. No source-code reuse
has cleared rights/dependencies/security/data compatibility. The three Carres adopters must
share these presentation contracts while preserving their different operating tasks.

### Required samples and acceptance contract

Each adopting scope identifies **template → exact real component → approved real exemplar →
permitted differences → preserved behaviours → acceptance evidence**. “Follow UI kit” or “copy
Houzs” alone is insufficient. A business field adapter is not a new kit; a missing shared control
or template capability follows existing kit admission and is implemented once with its `/ui`
example. Do not create a page-local lookalike while waiting for that admission.

| Sample/state | Required result |
|---|---|
| Normal and expanded | Correct identity, aligned actual goods and quantities; expansion has the stated single job. |
| Long names, many lines, multiple open records | Complete values remain discoverable; names do not collide with quantities; no short-fixture-only visual claim. |
| Search/filter/summary/export | One authorised scope; record counts and quantity meanings explicit; clearing and return context correct. |
| Loading / empty / error / permission / missing setup | Distinct truthful states and appropriate next action; failure is never reported as zero stock or no work. |
| Editing / failed save / stale data / retry | Input and evidence preserved where valid; conflict explained; no duplicate or partial business result concealed. |
| Partial / complete | Result matches source facts; remaining work visible; actual actors and historical evidence retained. |
| Narrow screen / keyboard / zoom | Identity and action remain accessible; same business scope; focus/close/return behaviour works. |

A standard sample uses actual Carres components at a stated viewport, with traceable sample data.
Show the existing page and the bounded change; do not repaint the surrounding shell. Review both
actual component reuse and rendered interaction. Existing style checks cover only part of this:
passing tests or a screenshot alone does not prove operator success. Do not add duplicated tests
merely to mirror a trivial change; evidence must fit the behaviour being changed.

### Houzs UX adoption contract — owner direction 2026-10-01

**APPROVED TARGET / NOT BUILT:** Jess approved using the inspected Houzs UX patterns as the
shared guide and instructed “we just copy and update”. Reuse complete template relationships,
then adapt Carres business content. This is approval of the reuse direction and the five template
roles below, not approval of unreviewed layouts, new token values, source-code licensing, a new
business engine, or BUILD. Existing compatible capabilities are KEEP. The implementation status
of each adopter remains separate from this target.

**What failed in the reviewed samples:** the local SO/PO/Inbound samples imported existing pages
and mostly changed spacing/typography. They proved some component reuse but did not demonstrate
the full approved task-guidance or whole-template adaptation. A visual rhythm toggle is not a
complete UX blueprint or acceptance evidence. Do not label those baseline samples the final
Houzs template or copy their outdated fixture business rules into implementation.

#### Reference-to-Carres UX inventory

Reference source: Houzs repo `ecce2e9676acc555efa8b2c30e78052b2ab54749` and the observed
live pages named below. Live deployment SHA is unknown. Current 2990 equivalence is unknown.
No Houzs production save, upload or transition was performed. Root reuse licence was not found;
reference source code remains REUSE CANDIDATE, not COPY REQUIRED. Pattern adoption does not claim
code-copy rights or reduced integration effort.

| ID | Houzs observed pattern / source | Carres adoption and placement | Reuse evidence / limit |
|---|---|---|---|
| UX01 | Home `Needs you`: source identity, waiting reason, Review door | My Work / Team Work uses the existing Work item and Staff & Duties resolution; opens its exact task | Pattern observed; Carres Work is the existing owner. No register-local duplicate work queue. |
| UX02 | Loading List title plus short instruction | Task page header explains what to check and finish; source number, party and Site visible | Pattern observed; exact copy must pass governed dictionary. No instructional paragraphs repeated on every row. |
| UX03 | Service Case current stage and stage-specific action | Task/detail action region connects current fact, blocker and authorised action | Live interaction observed. Carres Work/business status remains source; no imported case stages, automatic transitions or new status engine. |
| UX04 | New SO grouped Customer/Delivery/Items/Payments | Form template groups fields by the work; Block + FieldFrame and kit controls | Grouping observed; specific fields and edit gates remain object-owned. |
| UX05 | New SO cannot-save count opens six-problem list | Explain all known blockers, point to the affected input, keep valid input; summary and field error agree | Dialog observed. Cross-module aggregate renderer parity remains UNVERIFIED; do not make parallel validators. |
| UX06 | New SO dependent dates constrained by Processing Date | Explain prerequisites beside dependent controls; source-owned validation controls availability | Observed form constraint; do not copy Houzs date or accounting assumptions. |
| UX07 | Loading List document header followed by goods/quantity rows | Goods card keeps one source scope, its goods and related exceptions together | Observed layout; loading completion/scan backend not verified. Existing Carres Receiving/Loading is the write door. |
| UX08 | Service Cases list strong identity, quieter supporting line | Shared register hierarchy; primary fact and supporting evidence, not action instructions in ordinary register cells | Observed visual hierarchy; Carres columns/copy/tokens govern. |
| UX09 | Service Cases search + Export/Wrap/Columns toolbar | One shared register toolbar grammar; expose useful supported functions consistently | Controls observed; scope, persisted preferences and export correctness not all runtime verified. |
| UX10 | Service Cases Wrap/Columns controls | Long text and optional columns use existing grid mechanisms; no shrink-to-fit type | Reference controls observed, full behaviour UNVERIFIED. Existing shared implementation first. |
| UX11 | Service overview metric cards above stage/record content | Overview template distinguishes summary from task/detail; same filtered scope and truthful quantities | Visual grouping observed; click-to-filter and arithmetic not proven. Do not turn every register into KPI cards. |
| UX12 | Service Case object timeline | History stays with its object, preserves actual person/time/action and source documents | Timeline observed; complete audit integrity not certified. Keep Carres history contracts. |

#### Five shared template roles — composition contract

These are roles assembled from existing shared components, not permission to create five competing
kits. The fifth operational role connects the previously approved list/detail/form/card families.
Module-specific field content differs; equivalent behaviours, controls and presentation do not.

| Template | Required reading/action sequence | Existing Carres sources | Allowed differences / forbidden shortcuts |
|---|---|---|---|
| Register | Shell and Site/context → factual filters → search/tools → records → goods-only disclosure → exact detail/action door → return to same list context | register/DataGrid, workspace-rail, GoodsMiniTable; SalesOrdersRegister and WarehouseInbound | Module columns, approved filters and source scope differ. Preserve Inbound Site tabs and Receive position. No generic Work rail, expanded editing form, or page-local grid clone. |
| Object detail | Source identity/version → governed object views → grouped facts → relevant action doors → documents and history | kit/Block, DocumentTable, TotalsSummary; SalesOrderWorkspace, PurchaseOrdersPage, WarehouseUnitDetail | Action placement follows object law; not every informational object needs a permanent task card. Document/cost visibility follows role. Do not show editable-looking disabled inputs merely by preference without comparing existing authority. |
| Task / operation | Exact source and goods scope → current responsibility/task → required checks/input → explicit missing requirements → one authoritative submission → recorded result and remaining work/handoff | ReceivingWorkspace, WarehouseIncoming, WarehouseOutboundWork; Block + existing Work presentation | Warehouse submission ≠ posted GRN; office direct receipt is its authorised posting door. Loaded ≠ driver-confirmed. Never insert an extra approval or duplicate form to make the visual stages match Houzs. |
| Form | Grouped inputs → conditional requirements → field-level feedback + consistent blocker explanation → submit → success/error/conflict outcome | Block, FieldFrame, Input, Select, DatePicker, EvidenceUploadField, Modal/DialogFrame | Object validations stay source-owned. No new local colour, control or storage wrapper solely for appearance. Save failure retains valid inputs; concurrency handling requires real integration evidence. |
| Work / overview card | Identity/scope → factual reason → resolved owner where governed → exact action door; overview counts stay separate from task results | Block and governed My Work/Team Work presentation | Cards do not calculate a competing truth or resolve another staff list. No universal clickable KPI claim without verified behaviour. |

**Left rail boundary:** global navigation changes module; register rail filters the viewed records
and summaries. It does not become an alternative task engine. Inbound Site remains a tab under
Stock law. Task forms use their governed full-width workspace and preserve return context; a local
review of the centre alone does not approve removal of navigation, filtering or Quick Rail.

**Current action boundary:** use the same task identity, responsible duty/person and source action
as Work. Show fact/blocker and the permitted next step together at the task/detail surface where
law places them. Do not require a newly invented permanent panel on every page. Exception inputs
belong beside the affected goods/field. Submission feedback replaces the relevant action state;
it must not report a pending review as completed stock, payment, delivery or approval.

#### Module adoption and visual acceptance

| Module sample | Required walkthrough | Current review status |
|---|---|---|
| Sales Order | Register → goods expansion → detail → permitted amendment → document/history → source-specific result | Real baseline reviewed, NOT final adaptation. Fixture still contains generic management-approval language and old fee arithmetic; missing rendered document. These must not override current Orders authority or its active implementation. |
| Purchasing | PO detail → supplier reply → goods/source lineage → partial receipt → claim/document/history | Real baseline reviewed, NOT final adaptation. Fixture has MPR header without per-line source, no receipt/claim examples and incomplete PDF evidence. These are sample gaps, not proven production failures. |
| Warehouse | Inbound exact arrangement → Unit checks → normal/issue/not-received → evidence/blockers → submit result/remaining/handoff | Existing Receiving/Inbound baseline plus a separate local composition proposal. Proposal illustrates warehouse submission, not office posting; no API or live storage verification. |

A module may change field content and existing authorised actions; it may not independently choose
another toolbar, control, card chrome, error grammar or submit/result pattern. If a required shared
component is absent, record that exact kit gap here before implementation; do not hide it in a
module-specific lookalike. Reference mapping, real shared component imports, whole-page sample,
allowed differences and state evidence must travel together. A next chat reading this contract
must still read the owning module's current business authority.

**Acceptance before any claim of completed adaptation:** compare before/after at the same viewport
with real shell width, long content and actual roles; walk normal, missing-input, exception,
failed-save and completion states. Verify focus/keyboard and narrow-screen access. Check document
lineage, quantities, responsible actor and cross-module destination. Separate simulated fixtures
from live observations and tests actually executed. A CSS comparison alone never passes.

**Purchasing fit review — PROPOSAL / NOT LAW, 2026-10-01:** the Purchasing Plan chat
reviewed this contract at `0545ae76e` against its module authority and found all five roles
applicable. It proposes four missing cross-module behavioural contracts, not four new components:

| Proposed common rule | Concrete acceptance example | Ownership / evidence boundary |
|---|---|---|
| Linked-record sections distinguish loading, error, empty, present and permission-denied | A failed receipt reader says it failed and offers retry; it does not say there are no receipts. Links retain exact record IDs. | Existing section components first; actual adopter behaviour requires runtime proof. |
| Current version, last sent version and goods completion remain separate facts | A current V2 with no outstanding goods still exposes its outstanding send obligation; sent V1 remains an immutable document. | PO document/Work authority decides the action. Never infer complete from a single badge. |
| Blocker summary points to exact row/field and preserves draft/focus | A split-quantity or missing-evidence error identifies its source line; fixing it does not clear other answers. | Module validation is the single source. Shared renderer parity remains UNVERIFIED. |
| Scoped source/Unit evidence remains traceable | Same-model SO and MPR lines retain distinct source references; damaged Unit evidence links the receipt and claim rather than matching by SKU. | No duplicated source allocation, receipt or claim writer. |

The proposed Purchasing example uses one sent PO with distinct SO/MPR sourced lines, records a
supplier split answer, then accepts two goods and records one damaged Unit against an SO line
ordered for three. Pending Delivery Qty remains one; damage is not accepted fulfilment. A
separately labelled approved-target example cancels that outstanding one, yielding Order 3 /
Received 2 / Cancelled 1 / Pending 0 while current V2 still needs sending and the claim may remain
open. These are synthetic review scenarios, not observed live records or executed transactions.
Purchasing owns validation against its latest law and its completed page sample. The local PO4014
fixture does not yet demonstrate these scenarios. Desktop document placement is retained pending
measurement; an answer form does not introduce a second issue/review workspace.

**Explicit remaining limits:** no complete Houzs conflict/permission/retry matrix; no verified
Houzs responsibility engine copy; no all-module whole-page approval; no approved new token values.
Local review artifacts are not production-ready implementations or portable repo exemplars.
Do not declare UI kit complete, whole Warehouse PLAN complete or BUILD commissioned from this
owner direction. The next approval concerns the completed visual/operator examples, not another
interview about already-decided business rules.

### Cold-start design contract and actual sample evidence — 2026-10-01

**RULING SCOPE:** the owner commissioned completion of reference extraction, component mapping,
new-chat discoverability and review samples. The four Houzs template families are approved direction;
the proposed visual overrides and layouts remain **PROPOSAL / NOT APPROVED / NOT BUILT** until reviewed.
The Constitution already requires UI MASTER, copy, navigation and token authority at Plan start;
do not introduce another constitution or a competing design guide.

**Every new chat's concrete lookup contract:** identify the page's list/detail/form/card family;
read its row here and the owning module MASTER; use the existing numerical source in 01, component
contract in 02 and composition in 03; inspect the named real adopter and review evidence. Record
`reference → Carres component → sample → permitted business differences → required states`.
Missing sample or unsupported capability is an explicit gap, never permission to invent a local
lookalike. Existing inline/local controls are measured migration candidates, not automatic precedent.
One admitted shared component owns appearance and interaction; a module supplies business content,
authorised actions and data. Document reading alone cannot enforce compliance: review must compare
real imports, actual rendering and operator completion before marking an adopter verified.

| Reference role | Carres shared source / actual adopter | Uniform behaviour; business-specific content |
|---|---|---|
| DataTable search, columns, row disclosure | register/DataGrid + workspace-rail + GoodsMiniTable; SalesOrdersRegister | Shared register mechanics and visual hierarchy; source columns and actions belong to module. |
| DetailLayout identity/sections | kit/Block, DocumentTable, TotalsSummary; SalesOrderWorkspace, PurchaseOrdersPage, WarehouseUnitDetail | Identity, grouped facts, document/history and real action doors; no generic order-specific DetailShell forced onto Unit. |
| FormCard/FormGrid | kit/Block + FieldFrame + Input/Select/DatePicker; SalesOrderWorkspace edit | Consistent labels, spacing, read-only/required/error/disabled controls; object-specific validation. |
| Overview task card / LoadingList goods card | kit/Block + existing Work presentation; ReceivingWorkspace / WarehouseIncoming | Clear source, current job, missing prerequisites, one next action and truthful result; never import Houzs service stages or fabricate Work completion. |
| Select and date controls | kit/Select, DatePicker, Popover and field-recipe | Keyboard operation, disabled values, label/error association, contained overlay; no foreign date format imported. |
| Confirmation / preview surface | kit/Modal → DialogFrame; existing SavedEvidenceViewer/PdfPreview | Named modal, keyboard/focus return and bounded context; source-specific confirmation/evidence. |
| Upload / retry | components/EvidenceUploadField plus source-specific wrappers | File rules, per-file progress/failure/retry and evidence association; storage rights/source ownership unchanged. |
| SaveProblemsList / blocked-save explanation | Existing source-owned validation; common controls do not provide one universal save engine | Explain all known blockers and how to resolve them. Aggregate-renderer parity across modules remains UNVERIFIED; do not invent backend validation or report a simulation as a business test. |

**Fresh main safety check:** fetched `origin/main` at
`36e2840dd8dcce6eeb77252417ab57febbd6848d` without checkout/reset of another chat.
Compared to `86046dde04d29856a78be6a8f7cf0923405f6f00`, no diff in the inspected UI MASTER,
01/02/03 standards, shared component directory or SalesOrderWorkspace. The read-only application
sources in this worktree remain the earlier inspected baseline; this is not whole-main certification.

**Real component sample location (LOCAL REVIEW ARTIFACT, NOT DEPLOYED):**
`http://127.0.0.1:5427/` on the reviewing host; artifact directory
`/Users/chaichiewlim/.codex/visualizations/2026/10/01/01a0f544-cea3-7ad2-824d-dd23ea6361a6/component-review/`.
The hub links Sales list, SO detail/edit, PO detail, Warehouse Inbound baseline, WarehouseIncoming count
and a control-state harness. `inbound-flow.html` is a distinct PROPOSAL composition importing real
kit controls with local-only fixture state, not the actual ReceivingWorkspace implementation.
Owner review preference: show the NEW Inbound proposal only; old Inbound links and comparison
controls are removed from its review entry. Baseline evidence remains for internal audit, not a
required owner-facing before/after screen. Actual baseline page imports are from existing `apps/web/src/dev/` fixtures;
kit controls import the unmodified production components. A local stylesheet proposes Houzs
reading rhythm and darker blue buttons; it is not an application change or final visual standard.
The WarehouseInbound fixture's nav is a labelled width stand-in, not proof of full-shell fidelity.
The local samples are not distributed by this docs PR; a new chat on another host must not claim
it viewed them from this URL. Source entry names above and measured evidence below remain available.

| Evidence / exercise | Observed result | Boundary / disposition |
|---|---|---|
| Houzs live SO new form | Grouped Customer/Order Info/Delivery/Line Items/Payments; cannot-save summary opened a six-problem dialog without submitting | Reuse explicit prerequisites and grouped feedback; Houzs states/business rules not imported. |
| Houzs live case detail | Current stage, stage actions, required resolution and timeline visibly connected; existing record contains automatic-on-open stage history | Read-only viewing only; no edit/transition/upload performed. Never copy autosave or stage writes by copying the layout. |
| Houzs problem dialog Escape | Escape left the dialog open in the sampled new-SO form; OK closed it | Observed keyboard difference; reuse Carres governed modal behaviour, not this limitation. |
| Carres Select keyboard | Space opens, ArrowDown/Enter selects, focus returns to trigger; disabled option is exposed disabled | Runtime local real component; not all module adapters verified. |
| Carres DatePicker | Calendar opens with day buttons; Escape dismisses; minimum-date capability exists in source | Browser sample plus source; not all locales/date edge cases tested. |
| Carres Modal | Named dialog; Tab remains in dialog; Escape closes and returns to Review trigger | Runtime local real component; separate automated focus test passed. |
| Carres long option at 390px | Original shared Select list right edge 420.72px exceeds viewport; isolated proposed max-width/wrapping yielded right edge 380px | REAL GAP; proposed fix only in review stylesheet, production unchanged. |
| Carres upload failure/retry | Real EvidenceUploadField shows failed filename and Retry; after local mock recovery shows Uploaded and one photo attached | Local signing/storage stub only; no real upload, permissions or storage integration certified. |
| Carres permission/error | Real SO fixture receiving payment 403 shows role-unavailable message; real Inbound 503 shows failure and Try again instead of zero | Actual component with simulated HTTP responses; backend access enforcement not exercised. |
| Carres save conflict/server failure | Control harness retains values and shows supplied conflict/error explanation | Harness-owned simulation only, NOT evidence that all actual business forms handle conflicts correctly. |
| Carres WarehouseIncoming exception branch | Count opens per-Unit outcomes; Received with issue reveals issue kind and damage-photo requirement; missing DO/photo keeps submission disabled | Actual component, local fixture; no receipt created. Existing source already guides part of the work; preserve it. |
| WarehouseIncoming modal close | Cancel closes; focus observed on containing page rather than Count trigger | REAL GAP in sampled fixture; adopt shared DialogFrame focus-return contract, no second modal engine. |
| Existing automated checks actually executed | DialogFrame.focus.test.tsx: 1 passed; SalesOrderWorkspace.block.test.tsx: 8 passed | Nine tests passed; no claim of full application, Houzs or production verification. |

**Workflow-guidance acceptance for Warehouse and other task pages:** show (1) task/source identity,
(2) current required check/input, (3) exact blockers, (4) authorised next action, (5) recorded result,
remaining quantity/work and receiving owner. Warehouse submission remains distinct from office GRN
posting; Loaded remains distinct from driver confirmation. Work/Duties determines responsibility;
the owning business result determines completion. Reference stage progress is a presentation lesson,
not another status engine. Final full-flow posting, conflict resolution, storage and role-matrix
proof require the separately commissioned BUILD/DELIVERY lane and controlled integration validation.
No PLAN completion claim follows from the local fixture results.

### Houzs Inventory density and filter placement — measured 2026-10-01

**FACT / REFERENCE ONLY:** read-only live `/scm/inventory` inspected; browser viewport at
measurement was 884 × 694 (different from the supplied 1063 × 694 screenshot). First populated
row was 34px high; description/category were 13px/400 with 16.25px line height; numerical spans
13px/600, right-aligned; product-code link 12px/400. Body cells had 6px vertical and normally
12px horizontal padding; synthetic disclosure cell had 20px left padding. Header sample height
32.375px. Table width was 1581px inside 830px client width (840px outer scrolling container);
container height 339px, horizontal AND vertical overflow auto. Therefore fourteen selected columns
are not fourteen simultaneously visible columns. These are measured reference values, NOT changes
to Carres tokens or approved row-height rules.

The live DOM includes category filters, warehouse selector, search, As of date, own/consignment
quantity/value summaries and dead-stock selection above the table. The owner's scrolled screenshot
does not show all that chrome. The screenshot also shows the persistent global navigation; the
absence of a second factual filter rail must not be described as removing navigation. Scroll
position, viewport, column preferences and active view can all change what is visible without
changing the underlying inventory facts. Correctness of live stock arithmetic was not audited.

Source `ecce2e9676acc555efa8b2c30e78052b2ab54749`,
`frontend/src/pages/scm-v2/Inventory.tsx` and `frontend/src/components/DataTable.tsx` inspected:
Balance tab uses one shared DataTable; category/search change scoped results, column definitions
use numeric sort values, row click opens warehouse breakdown and chevron expands variant/PO
information. Product code links Stock Card. Wrap has persisted table-specific state; the source
uses `wrapOn = wrapText && layoutFixed`. Source includes column sizing/personal layout mechanisms.
Controls were observed; no live saved layout was changed, exports were not downloaded, tests were
not executed and not every control behaviour was certified. Shared reference code does not grant
copy rights or prove current2990 equivalence.

**RECOMMENDATION / PROPOSAL, NOT APPROVED PRESENTATION CHANGE:** adopt the coherent reading
hierarchy, aligned numeric columns, restrained row decoration, scoped columns and useful disclosure;
do not copy the balance arithmetic, cost visibility, large all-row rendering or foreign tabs into
Carres. First measure available width with real navigation/Quick Rail and identify default task
columns; row count alone does not diagnose clutter. Top-filter placement is a scoped Inventory
candidate, not an instruction to remove every module's rail. Preserve existing factual filters
until a complete compact-top versus rail analysis covers frequent filters, selected-condition
visibility, summary/export scope, keyboard and narrow screens. The saved owner request to keep
filtering remains valid. Moving its location is not deleting the capability, but existing explicit
placement requires reviewed replacement. No code or prototype changes follow from this finding.

### Houzs Sales Order quick-view measurements — reported reference evidence

**FACT REPORTED BY SALES PLAN REVIEW, 2026-10-01; NOT CARRES VALUES OR APPROVAL.** At the
sampled live 1054 × 694 viewport, the Sales planner measured the SO quick-view drawer at 520px,
header 60px, footer 61px, independently scrolling body with 20px padding. Its two-column
label/value group had 16px padding, 12px row gap / 16px column gap, labels 9.5px/600 and values
13px/600. Sampled register row was 30.5px. These are reference measurements, not tokens; this
thread has not independently repeated that browser measurement. Do not shrink Carres type or
rows to match them. Reference deployment SHA remains unknown.

Source inspected by the Sales planner at Houzs `ecce2e9676acc555efa8b2c30e78052b2ab54749`:
`ResizableDetailDrawer.tsx` (default 520, bounds 420–1100, pointer resizing),
`MfgSalesOrdersListV2.tsx` drawer chrome, `SalesOrderDetailV2.tsx` Field/Section/DetailGrid,
`DetailLayout.tsx` main eight/twelve plus aside four/twelve at its large breakpoint, stacked below.
Observed full-page groups: Customer, Order info, Delivery address, Lines, Payments, and supporting
total/slip/dates/people/activity. Source presence is not evidence that all responsive/keyboard or
resize persistence behaviours were tested. Plain label/value groups and independent scroll are
reference candidates; tiny labels and reference business writers are not recommended imports.

**PROPOSAL / NOT LAW:** Sales recommends review of optional read-only quick view on row click,
with chevron still goods-only and number/explicit full-page door opening the actual detail/edit
surface. This conflicts with UI MASTER §4.1's current three-surface grammar and is NOT admitted.
Keep current navigation, row sizes and type until a scoped replacement is owner-reviewed. Existing
Drawer/DialogFrame and Block may support the pattern; compatibility and full adoption are
UNVERIFIED. This research does not approve a fourth surface or another edit/receipt/payment door.

### Concrete reference: Houzs Service Case detail card composition

**OWNER-SELECTED REFERENCE / ADAPTATION NOT YET APPROVED, 2026-10-01.** Jess selected the
visible composition at `https://erp.houzscentury.com/assr/1564` and specifically identified fonts,
pills, icons and clear sections. The supplied screenshot shows a case at Pickup / Return,
Step 4 / 7. This is visual evidence at the shown viewport, not proof of the case transition,
backend result, current live status or exact CSS dimensions. Do not read pixel values from the
scaled screenshot or treat this stage sequence as Carres business law.

| Visible reference feature | Why it is understandable | Carres composition rule / boundary |
|---|---|---|
| Object type above a prominent case number; customer/current stage/source refs below | First glance identifies the record and its context | Preserve identity → supporting facts hierarchy. Use governed type roles and record-specific facts. Houzs serif identity is a reference choice, not an approved new Carres font. |
| Main/secondary actions grouped near identity | The employee can find the applicable action without scanning every section | Keep the owning object's governed action positions. Do not copy Archive/Close Case into Warehouse or make unavailable actions look permitted. |
| Workflow in its own full-width region; completed/current/future steps differentiated with text, marks and emphasis | Separates progress from the detail fields; current position can be located quickly | Use only when a genuine governed sequence benefits the task. Read canonical stage/Work facts; no decorative step engine, manual stage bypass, or false serial order for parallel work. |
| Status pill beside the relevant stage; completion checkmarks and current-step emphasis | Compact state remains attached to the thing it describes | Pill = state, not an action. Text must identify meaning without colour alone. Carres state vocabulary and semantic colours remain authoritative. |
| One horizontal facts group: Status, Priority, SLA, Resolution, Lead time | Related summary facts can be compared without opening the detailed cards | Admit only meaningful, source-owned facts for the object; no copied SLA/priority fields merely to fill five slots. Never duplicate competing calculations. |
| Separate Issue / Product Info / Customer cards, each with an icon and labelled content | One card answers one question; icons help scanning and labels explain meaning | Reuse Block chrome and approved Icon meanings. Preserve semantic grouping, consistent header rhythm and internal label/value hierarchy. Do not create one card per field. |
| Darker/stronger main facts and quieter supporting labels/text | Readers can distinguish the value from its explanation | Existing text roles and contrast rules apply. Important values must not use disabled/placeholder colour. Exact reference-to-token comparison remains pending measurement. |
| Regular alignment, inner spacing, card gaps, background/surface separation | Groups remain distinct without dense borders around every sentence | Use 01 token values and one common composition recipe. No ad hoc per-module spacing or imported palette. Multi-column adaptation must account for long text, actual shell width and narrow stacking. |

**Design output this reference requires:** map the whole relationship above to one Carres object,
identify which facts/sections/actions survive and which are inapplicable, specify the real shared
components and all interaction states, then obtain whole-page review. A plain stack of Block
components is not evidence that the reference composition was copied. A source-owned read-only
fact is not automatically a disabled form field. Card hierarchy, spacing, density, field grouping
and action discoverability must be assessed together. This reference is available as guidance now;
its adoption is neither blocked by having existing components nor automatically verified by them.

### Sales Order compact goods summary and side inspection — owner-approved target

**APPROVED TARGET / NOT BUILT, owner ruling reported by Sales PLAN 2026-10-01.** On an SO
goods summary with a remaining-line indicator (for example `+9`), Jess requested: “we should
follow this format when long. click then see details at side”. Show a compact goods summary and
a count of the remaining GOODS LINES, then open read-only goods details at the side when the
summary/remaining-lines door is activated. Do not label the line count as quantity or Unit count.

This is an explicit, narrow exception to §4.1's otherwise three-surface grammar: **goods-summary
inspection only**. It does not admit a generic full-order drawer, an edit form in the side panel,
rail relocation, new status taxonomy or 32px rows. Preserve the full-order door, existing governed
goods expansion and current list/filter context. Table and Cards must read the same scoped goods
source; no independent lookup/calculation that can disagree with the register.

Reuse existing Drawer/DialogFrame and compatible goods renderer after capability inspection;
no new drawer engine is commissioned. The inspection must have a named heading, keyboard-operable
entry, contained scrolling, close/focus return and readable narrow-screen behaviour. Exact summary
truncation/line limit and dimensions follow the recorded module specification and existing token
law; this ruling does not supply or approve invented pixel values. Sales BUILD records the Orders
spec before coding within its commissioned pilot. The UI PLAN thread remains documentation-only.
This is the OWNER'S target, not proof that the pictured Houzs click behaviour was inspected or that
Carres has built or verified it. Live and test acceptance remain outstanding.

### Sales Order Table / Cards view — scoped owner direction

**OWNER-REQUESTED CAPABILITY / NOT BUILT, reported by the Sales PLAN chat 2026-10-01.** Jess
selected the Table/Cards toggle at Houzs `/scm/sales-orders?view=cards` and requested this function
to understand order delivery progress. Include this capability in the first Sales representative
design; it is not rejected as unnecessary. The reporting Sales planner owns verification of the
reference interaction and current Orders/Delivery semantics. This direction does not commission
application or prototype code, approve final card composition or introduce a global card-view
requirement for every register.

**RECOMMENDED CONTRACT / PROPOSAL detail:** Table and Cards are two presentations of the same
permission-scoped, filtered SO population; preserve search/filter/sort when switching. Proposed
card content is SO identity, customer, requested date and Delivery-owned fulfilment facts, with
partial versus complete delivery distinguished according to the existing authority. DO issuance,
dispatch or a locally inferred percentage cannot establish delivered. No parallel status engine,
new Work card or cross-module writer. Exact labels/aggregation, pagination, selection/export scope,
responsive layout and zero/error/loading states require existing-authority verification and owner
review of the complete design. Do not infer finished delivery from a reference's cosmetic badge.

### First representative design — Sales Orders, owner instruction 2026-10-01

**RULING / DESIGN PRIORITY, NOT BUILD:** Jess directs Sales Orders to be the first complete
representative page/template design and explicitly requests alignment with its existing PLAN chat.
Sales owns the coherent new-page recommendation and its SO business fit. Shared UI authority stays
here; Warehouse and Purchasing review the common grammar against their own journeys and return
specific missing contracts. They do not start independent visual systems or copy SO-specific fields,
approval gates or calculations. This prioritises design review, not all-module implementation.

**KIT FIRST + NARROW SO BUILD PILOT — owner approval reported by Sales PLAN, 2026-10-01.**
After specification is recorded, Jess explicitly approved ONE real Sales Order register pilot
in existing Sales BUILD chat `01a0f59c-6316-72d0-94dd-1e8600577cd4`. Use a separate isolated
branch/PR from the existing amendment work. The authorised scope is the actual register route,
Table/Cards, shared filters and bounded scroll/layout acceptance with the existing detail door.
Retain current 40/51 baseline row recipes; proposed 32px rows, quick-view admission and removal
of governed framed facts remain unapproved. No merge, deployment or broad rollout is authorised.

The Sales BUILD chat owns the Orders pilot specification and the authorised implementation;
this UI PLAN thread owns shared UI/02/03 documentation. Warehouse and Purchasing remain
DESIGN ONLY. This scoped exception does not authorise prototype/application coding in this thread
or supersede the no-coding instruction for the wider UI-kit commission. Approval is NOT verified
adoption. The pilot must use actual Carres route/components/read model in an isolated local/preview
environment, explicitly label real versus fixture data, and supply owner visual review plus
appropriate business/state evidence before any later rollout. Duplicate static HTML and isolated
styling patches are not accepted substitutes. No source-size measurement changes approved values.

The review presents the NEW design only, with traceable Houzs measurements and real Carres
component mapping. The first example must cover list/disclosure/detail/edit/document, task/result
where applicable and failure/narrow/keyboard states. Quick-view admission, framed facts and new
numeric scales remain scoped proposals until owner-reviewed. No visual approval is inferred from
this sequencing decision. The shared UI PLAN boundary remains effective. Only the separately commissioned SO pilot above
may implement its approved slice; no merge/deployment or other module rollout follows. Existing
business work in separately commissioned lanes is not re-scoped by this design priority.

### Documentation-only clarification and review freeze — owner instruction 2026-10-01

**RULING / EFFECTIVE NOW:** stop coding, including local review-page changes. The current commission
is to clarify the existing UI/UX authorities and align the module planners. No application code,
new prototype code, Cards, deploy or live writes in this UI PLAN thread are authorised by it.
The separately approved SO register pilot is the sole later scoped exception described above;
Warehouse and Purchasing remain design-only. UI MASTER is the single
shared authority; there is no separate UX-kit document. 01 owns numeric tokens, 02 component
contracts, 03 full page/interaction composition, COPY the actual user-facing vocabulary, module
MASTERs the business rules. This is one design system with several responsibilities, not separate
kits. No new colours, dimensions, English product copy or business decisions are silently approved.

**Review sample freeze:** `warehouse-ui-preview.html` is withdrawn. The later local
`inbound-flow.html` composition is also NOT ACCEPTED AS A BUILD REFERENCE: Jess could not identify
its purpose and challenged its value. It is independently composed, not a verified Houzs receiving
screen copy; its review chrome, invented explanatory copy and simulated result are not product
law. Baseline SO/PO fixtures and CSS-only rhythm changes are likewise not final adaptation. No
planner or builder may infer visual approval from these files or their screenshots. Keep their
limitations visible in evidence; do not ask the owner to approve them as complete templates.

**What a design must specify before it can direct BUILD:** page purpose/user/entry source;
exact applicable template role and existing shell; reference interaction with provenance;
ordered regions and every region's job; real shared component mapping; actual source of each
fact/action/owner; primary and secondary doors; disclosure/edit/submit/result behaviour;
all applicable states; narrow/keyboard/long-content behaviour; allowed business differences;
known gaps with evidence; operator acceptance. A list of five arrows is not such a specification.
A written specification is not proof of a working interface. Both documentation and review
outcomes retain APPROVED TARGET / IMPLEMENTED / VERIFIED distinctions.

**Shared gaps consolidated from Sales and Purchasing PLAN reviews — PROPOSAL detail, NOT new
component admission:** blocker summaries need field/row targets and recovery actions from the same
validator; responsibility can be missing and must not be fabricated; linked sections need truthful
loading/failed/empty/denied states; current/proposed/sent/historical document identity must remain
separate; completed business effect and later PDF/storage failure need different recovery; stale
business fixtures need explicit source revisions. These are cross-module contracts to verify
against existing components, not reasons to create parallel engines. Actual Sales representative
recommendation was read; its source candidate is `768fd8db9cce1518f3a4aecade4ba8022b647df0`, not
proof of production verification. Module-specific quantities, fees and gates remain module-owned.

**Conflict resolution without another owner questionnaire:** use the latest explicit scoped
module/owner ruling for a real exception; preserve it and name its scope. Older generic examples
must not override it. If two current explicit rulings still conflict, mark the exact unresolved
business/presentation consequence; never silently select whichever produces the preferred layout.
Do not rewrite locked token values or approved action placement merely to make a document shorter.

### Current status and document ownership

**IMPLEMENTED IN INSPECTED CODE / NOT A WHOLE-KIT VERIFICATION:** ModuleHeader, DataGrid,
FilterRail, GoodsMiniTable, Block, DocumentTable, TotalsSummary and the listed form/viewer components
exist with real adopters. Their presence does not certify every page's usage. Receiving's per-Unit
claim-photo support versus a line-level string-array form, and Unit Current work reading only
Issues, are measured workflow-integration gaps, not evidence that a new uploader or Work engine
is needed.

**DOCUMENTATION RECONCILED, 2026-10-01:** 02 scopes bounded DataTable versus Register/DataGrid,
Block versus existing legacy surfaces, real control adopters and unverified candidate names.
03 specifies the five roles, field/action placement and full state coverage; it no longer assigns
every operational module the batch Workspace pattern. Token values remain unchanged.
**PENDING:** completed real composed samples and relevant state/viewport/operator evidence. Do not
claim these are delivered because this section is saved. Keep the existing document split:
this MASTER owns contracts and exceptions; 01 owns values; 02 owns component API/use/state;
03 owns composition/examples; module MASTERs own business semantics; `/ui` shows actual examples.
Coordinate existing shared-document ownership rather than open competing PRs or another guide.

**REJECTED SAMPLE:** the standalone `warehouse-ui-preview.html` hand-written shell/filter card,
blue summary box and concatenated goods expansion were rejected by the owner and withdrawn.
Neither its screenshots nor its code is an approved template or build input. Preserve that
rejection boundary; no application implementation was authorised by this documentation update.

**Workspace destination label — owner ruling 2026-09-29 / BUILT; production verification pending.**
The main-menu link to `/operation?tab=work` reads `Workspace`, matching the page heading.
Keep its route, icon, permissions, selected treatment and `My Task` / `Team Work` scopes.
This is the same destination, not a new page. Workspace MASTER §1 and COPY-STANDARD own the
navigation contract and exact word.

## Shared field-operation UI — owner ruling 2026-09-29

**RULING / APPROVED DIRECTION / IMPLEMENTATION AND OPERATOR VALIDATION PENDING.**
Jess approved in Opit-Warehouse (task `01a0eb1b-b390-7191-b75b-571d5e43c76c`): office
staff manage through registers; Warehouse, Delivery and NETS share a simple field-operation
interaction pattern. The target operator has limited English and computer literacy and should
only perform the physical work, make the necessary confirmation, take photos and submit.

- Reuse the existing UI kit. Shared means the same interaction and familiar controls across
  tasks, not identical business steps or merely making every surface a card.
- Office registers retain management, planning and exception resolution. Field tasks foreground
  what to do now, with one clear primary next action and system-provided party, place, goods,
  quantity and related record. Do not shrink the office register into a phone-sized task card.
- Present only the current necessary step. Prefer scan or selection over typing; request photos
  where the owning workflow requires evidence. The system supplies known facts and performs
  calculations, record linking and follow-up routing.
- A problem door captures the observed problem and required evidence; office staff handle the
  resulting management work. Do not ask field operators to manage commercial decisions,
  schedules, stock adjustments or document administration.
- Photos alone never establish completion. Preserve the owning workflow's Unit/quantity,
  receiving, loading, handover, recipient and proof requirements where applicable. Loading
  remains distinct from driver acceptance; no UI simplification creates a second write owner.
- Show the recorded outcome and any next responsible party after successful submission. A
  failed upload or submission must not appear completed.
- Schedules open the owning work record; GRN/DO and other records stay automatically linked.
  Keep established navigation and PDF family formats. This ruling does not authorize another
  PDF design or a new standalone warehouse dashboard.

The owner's approved text sketch illustrates the direction; it does not freeze English labels,
card geometry or an unconditional four-step flow. Use COPY-STANDARD and the existing kit for the
concrete design. Validate receiving, short/damaged arrivals and delivery, including failure and
retry states, with the target operators before claiming completion or a 10/10 result. Do not
reopen this approved direction while resolving those concrete designs.

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
LOCKED, never invented   token VALUES · component internals · admitted shared template contracts
YOURS to improve         composition within those contracts; justify business-specific differences
KIT ADMISSION           a missing component or shared template capability; never a page-local copy
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
               composes within the admitted shared template using its own judgment; it does
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

## §1.1.1 · THE PRE-SHOW GATE — owner ruling, Jess 2026-09-26 · APPROVED / LOCKED

**"How can I avoid having to look and check every time before you design my UI?"** The answer
is a gate the chat runs on its own screenshot BEFORE the owner sees it. A page that fails any line
is not shown; it is fixed first. The chat states the six results in one line with the screenshot.

```
1  WORDS      every visible word is in COPY-STANDARD, with its row named; none invented
2  ONE BLUE   the page has ONE washed/filled blue = the chosen record/row; rail choices are
              bold + left line; tabs are grey; no blue words; links grey underlined
3  WIDTH      a card wider than 480px with more than three facts lays them in columns;
              nothing is a single column of six lines with an empty right half
4  ICONS      a record door is the kit's `open` icon with its accessible name, not the word
              `Open …` beside a title (Gmail's reading pane, not a form)
5  REFERENCE  the surface was put beside its reference (Gmail reading pane · Linear issue ·
              the Sales Orders Register) and the difference is named or removed
6  SELF-RATE  the chat rates its own screenshot out of 10 with the 🔴/🟡 list; under 8 it
              is not shown
```

**Why:** the owner rated the first Work rebuild 3/10 after ten review rounds she had to lead
herself ("i need always ask you check, copy who, how how how, rate rate rate"). Every one of the
faults — invented column words, five blue rows, a six-line card with an empty right half, the word
`Open` beside a title, a dashed date range — was visible in the chat's own screenshot before she saw
it. **The owner reviews design; she does not run the checklist.**

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

For Workspace Work, the complete owner-approved right-panel composition, exact 72px party-card
geometry, one-line concurrent Order Route, Customer/Supplier states, shared communication behaviour
and responsive acceptance are governed by `workspace/MASTER.md` §5.10. UI work must preserve the
deployed §5.5 left/middle density and §5.9 Logistics behaviour; existing Customer/Supplier shells are
implementation evidence, not proof that the approved target is complete.
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

The canonical values and named config keys are in [01 §8.2](../01-design-tokens.md#82-modal-and-admitted-goods-side-inspection).
The default serves a question/short form, `wide` serves a line list, and `viewer` serves a picture.
The viewer's original 2026-09-11 measurement used the dialog height cap and image aspect ratio;
that rationale does not admit caller-selected widths.

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
with its named Save (`Save scheduled delivery`); the operator stays on the same row, queue and
narrowings. No overflow menu and no separate dialog is invented for these acts, and no other
register may copy this without its own owner ruling. **The Delivery Orders register has that ruling
(owner, 2026-09-26):** its ▸ opens the Delivery Order brief in place — two columns at ≥1024px, acts
on the left in each panel's right slot, read-only facts on the right — so a result, a signed DO, a
receipt and a proof review are recorded without leaving the register (`../delivery/MASTER.md` §8.7).
**Two-column object composition (same ruling):** an object whose job is *look at facts, read what
happened* — the Delivery Order — lays its fixed facts in a ~420px right column and its events in a
scrolling left column at ≥1024px (Shopify order page · Linear issue page · GitHub PR), one column
below; a Sales Order keeps its tabs and a PO its 50/50 edit split. Sales facts inside the brief stay read-only:
the first panel's control `View Sales Order` unfolds the governed Sales Order document in place
(owner ruling 2026-09-25 — INSPECT stays INSPECT, no fourth surface), and the row's `SO No` is the
door to change them. The full law is `../delivery/MASTER.md` §8.5 and §8.6.

### ONE CARD GRAMMAR FOR EVERY OBJECT, DETAIL AND REVIEW SURFACE — OWNER INSTRUCTION 2026-09-26, BUILT
Jess, on the Review Purchase Orders pane: *"pls follow sales order ui kit … make sure every page of
purchasing fix this problem yourself."* The Sales Order object card is therefore the portal's ONE
section chrome for facts: a white card (`rounded-card`, `kit-slate-5` hairline, `px-4 py-3`), a
**black bold sentence-case `text-strong` (slate-12) title over a 1px `kit-slate-5` rule** (ONE KIT LAW,
owner ruling 2026-09-27 — it overwrites the 2026-09-21/22 "remain blue": blue is the primary button,
links and selection only), one 12px body gap, and inside it the Sales Order fact
grammar — `text-label` label over a 13px value, three to a row on a full-width page, two in a
half-width pane, one on a phone. **The shared `Block` (`SalesOrderWorkspace.tsx`) has exactly this
chrome and no second tone:** the former "shared" tone — a mono UPPERCASE title beside a left band —
is retired; the cream `SectionBand` stays the Orders LIST / drawer chrome only. **The box travels with the
grammar (owner, same day, pointing at the SO page: "got box … I want follow"):** on Purchasing pages
every fact prints in the Sales Order's bordered box, whether or not that page can change it; the SO
page's own three plain exceptions (`../orders/MASTER.md`, field standard 2026-09-22) remain the SO
page's. Drawn 2026-09-26 on: the Purchase Order object (`Purchase order` · `Goods lines` ·
`Receiving` · `Claims and returns` · `Revisions` · `History` · `Order Route`), the `Supplier reply` and
`Record supplier answer` in-card headings (label rank, sentence case), the Manual Purchase saved-request
detail, the Review Purchase Orders work pane (`Purchase order` facts + `Goods lines`), the Supplier
Claim panel and the seven Purchasing Settings sections. Table heads keep their uppercase `text-label`
row; a document's own heading (GRN, PO paper) keeps its document face.
**On a form the person is filling in, a value the SYSTEM fills wears a GREY box (owner ruling
2026-09-28, Jess "yes" after reading the white `Requested By` / `Proceed Date` as fields to fill).**
The shared `Fact` takes `automatic`: the same bordered box with the kit's `kit-slate-3` fill (the
disabled-control grey) and `data-kit="automatic-field"`; text stays slate-12. Everything the person
fills stays white. First drawn on the Manual Purchase create page (`Requested By`, `Proceed Date`); a
detail or review page, where nothing is being filled in, keeps the white box.

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

### DOCUMENT COMPOSITION FOLLOWS THE OWNING OBJECT RULE
Ordinary viewing remains a single facts flow except for explicit object rulings. Formal PO View
shows original read-only information and the actual current PDF in equal panes (owner 2026-10-04,
Purchasing MASTER complete SO Batch delivery boundary); opening it never enters Edit. GRN uses its
explicit preview rule below. Pressing edit shows the right half as
**the document the other party will actually receive**, redrawn as the left half is typed — which
is the only way an operator can see what a supplier will read without printing it.
```
SPLITS       PO · Consignment Order · Consignment Return ·
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
The downstream MPR Issue PO journey reuses the existing Review Purchase Orders
composition before creation, with the actual PO draft selected on the left;
it does not relabel the internal MPR preview as a PO. Purchasing §9.2 owns the
five grouping facts, request approval and distinct request/PO dates.

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

**Sales Orders navigation — owner approved 2026-09-23 · BUILT 2026-09-23.** The existing
PortalSidebar shows one expandable `Sales Orders` parent with `Outright Sales` and `Subscription`.
Replace the previous standalone SO/legacy menu entries in this tree; retain existing records and
valid deep links. No new sidebar dimensions or selection grammar. The owning Orders MASTER's
“One purpose and one navigation home” governs destination scope; Rental/Subscription retains
its own business authority. `Purchase` is not the name of the outright-sales child. This ruling
changes navigation only and does not approve Subscription business implementation.

Shipped exactly as ruled, and it moved no address: `Outright Sales` keeps `/operation/orders` and
`Subscription` keeps `?tab=rental`, so every bookmark, in-page link and ⌘K jump still lands. The
`Subscription` row MOVED out of Customer Care rather than being copied — two rows to one page are
two rows the rail lights at once. `Old Orders (temporary)` left the rail; its routes stay mounted,
so `CaseOrderLink` and every legacy deep link still resolve. The Admin area's jump to the same
register carries the same word. No page, permission, quantity or report was touched.

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

### MISSION — owner-approved direction, 2026-09-24

**APPROVED TARGET / NOT BUILT.** The right rail has three quick-reference doors:
**Calendar · Customers · Activity** (`Customers` is a proposed screen label pending COPY admission).
Calendar provides date-based module summaries; selecting a summary opens its owning module at
that date and scope. The customer door replaces the rail's My Work slot: search a customer list,
select a customer, then read their related orders and recorded history with source links.
Activity provides recent cross-module business changes within the signed-in person's existing
permissions, including authorized colleagues' changes; it is not presence, a public log or an
employee-only personal log. Modules remain writers and each object's History remains its ledger.

**Who sees it — owner direction 2026-09-24 ("everyone should can see").** The rail is not an
Operation-only feature: every portal shows it, and each signed-in person sees only what their existing
permissions already allow. Today it is mounted only in the Operation shell (operation + principal
roles, `App.tsx:132`) — a build gap. How it is scoped for each portal, including external portals
(dealer, supplier, delivery partner) that may see only their own records, is **PROPOSAL / NOT LAW**
in the discussion Card; no permission is widened by this direction.

Formal Work, My Work and Team Work remain at their existing Workspace destination. Removing the
rail shortcut changes no owner, obligation, calculation, due date or completion rule. No Work
badge remains on the replacement customer door. Team and Duty editing are not rail slots;
Staff & Duties owns Duty assignment and cover.

The owner approved these purposes and replacement, not the detailed layout, customer identity
matching, new COPY labels, kit additions or implementation. Those remain a proposal in the one
[discussion Card](../cards/SHARED-UI-calendar-work-activity-discussion.md). This PLAN ruling does
not authorize application implementation or claim a complete customer history is already built.

### ONE JOB, TWO DOORS — how work flows past the rail (owner-confirmed 2026-09-25, flow step 1)

1. **One job, two doors.** A job can be done from Work or directly on its owning module page. Both
   use the same module action and write the same single record (Workspace §5.1 Panel 3; ERP Law C).
2. **Done means the source fact exists.** When the module records the result, the Work item closes
   in both places at once. Nobody presses a separate `Done`.
3. **The rail only reflects and links.** The recorded change then appears in Activity (who · when ·
   what) and in the selected customer's history under Customers. Calendar changes only when a dated
   arrangement changes; it never lists to-do items. No rail door performs or completes the job —
   selecting a row opens Work or the owning module.

Example: delivery photo. Work `Upload the delivery photo` and the DO page's upload are one action →
the photo is saved once in Delivery → the Work item closes → Activity shows `Delivery photo uploaded`
with actor and time → the customer's history shows the same event → Calendar is unchanged.

### CALENDAR — pick a day, see each module's dated arrangements (owner-confirmed 2026-09-25, flow step 2)

```text
Calendar                                    [×]
Everything you can see · Updated 10:42
[Thu, 24 Sep] [Fri, 25 Sep] [This week]      month grid below
FRI, 25 SEP
Delivery      2 scheduled deliveries      ›  Delivery Monitor ?date=
              1 NETS contact deadline     ›  Delivery Monitor ?date= (that kind only)
Warehouse     1 arriving                  ›  ?tab=warehouse-arrival-schedule&date=
              3 pickups                   ›  ?tab=warehouse-pickup-schedule&date=
Purchasing    1 return pickup             ›  Purchase Returns
Payment       2 promised payments         ›  Payment Monitor ?day=
              1 free storage ends         ›  Payment Monitor ?day=
Subscription  1 service visit             ›  Rental (no date/record door yet — build gap)
```

**OWNER-APPROVED TARGET / NOT BUILT, 2026-10-04 — shared all-module calendar.**
Use the existing right Quick Rail Calendar, never a separate calendar page per module.
`All modules` shows only authorised, implemented dated event types; provide `Filter by module`
and `Filter by location` where the source supports location. Do not expose empty/unbuilt module
entries or turn undated Work into calendar events. Each summary names its module/event and
count unit, distinguishes expected arrangements from actual occurrence, and opens the owning
page with the explicit selected date and scope. Return preserves the Calendar day. Receiving
reads Warehouse arrival facts rather than publishing a duplicate arrival count. This approval
adds presentation/filter target truth, not new event writers, automatic GRN posting or a claim
that filters and Receiving adoption are deployed.

1. **Each module reports its own dated arrangements; Calendar only summarises.** Every row names
   what it counts in the module's own words; never a mixed total such as `5 jobs`. A zero prints
   nothing.
2. **A row opens that module's page on that day, filtered to that kind.** Back returns to the same
   Calendar day.
3. **Each person sees only the modules their existing permissions allow** (Operation all; Warehouse
   its Arrival/Pickup rows; Finance Payment and Subscription).
4. **One event, one owner, one count.** A supplier arrival counts once, under Warehouse, from the same
   `warehouse-schedule` projection the Schedule pages read; Purchasing never counts it again. Special
   movements (`Transfer arrival` · `Transfer pickup` · `Customer/failed-delivery return` · `Return from
   repair` · `Supplier replacement`) keep their names only inside the Schedule page's cards. A row that
   names the company prints `Pickup By {company}`.
5. **A source that fails to load says so and never prints `0`.**
6. **Not on Calendar:** Work to-dos; Issue Tracker (its MASTER rejects a calendar); private HR facts;
   modules not built yet (stock counts, Repair Orders).
7. **Contact deadlines belong to the Logistics company** (owner correction 2026-09-25, Workspace §5.10):
   `{n} {company} contact deadline(s)` shows the day the company must reach the customer, so staff can see
   whether it did; it is not a Carres call list.

### CUSTOMERS — find the caller, see all their orders and records (owner-confirmed 2026-09-26, flow step 3)

```text
Customers                                   [×]
Customers you can see · Updated 10:42
[ Name, phone or order number             ]
Mei Tan · 012-345 6789                    ›
Petaling Jaya · SO2609-4827 · 24 Sep
‹ Back to results
Mei Tan · 012-345 6789 · Matched by phone
[ Orders ] [ History ]
Orders   SO2609-4827 · Scheduled delivery Fri, 2 Oct   › Sales Order page
         SUB2609-48271 · Active                        › Subscription
History  Delivery scheduled · Fri, 2 Oct · NETS · recorded by Aina · 25 Sep 10:06  › source History
```

1. **Read only.** Changing details, recording a contact result or taking money is done on the source
   record through its own module action; the Customers door has no edit, note or completion control.
2. **Search, then choose.** Name, phone or saved order number (SO/SUB, including historical forms).
   Exact phone or number matches rank first, then name matches; nothing opens by itself.
3. **Say how a match was found.** `Matched by phone` where the canonical phone links records; a name-only
   hit is a `Possible match`, kept separate and never merged into one person, balance or entitlement.
4. **Permissions decide what exists.** Results, counts and suggestions never reveal a customer or order
   the signed-in person may not see.
5. **Different job from Work's Customer card** (Workspace §5.10): that card shows one mission's current
   customer-facing exception; this door starts from the customer and lists all their orders and
   recorded history. Both read the same source records and neither keeps a second copy.
6. **Who did it is stated truthfully.** Delivery contact by the Logistics company reads as the company's
   act recorded on its behalf (owner correction 2026-09-25), never as a Carres call.

### WHAT IS ON SCREEN TODAY — measured source, 2026-09-24

`OperationRightRail.tsx` still mounts Calendar, My Work (`TasksPanel`) and Activity. Customer search
exists separately as POS name autocomplete; it is not a verified complete customer dossier.
Current implementation differences from the above target are build gaps, not a competing design.

### FROZEN RULES
- The rail reads and links; a source module owns every change and completion.
- Calendar summarizes authorized dated arrangements/deadlines from their owners; a module summary
  opens the owning full destination with the same date, event type and permitted scope.
- The customer door starts with a searchable list, then a selected customer's related orders and
  recorded history. It never becomes a second Order Route, task list, customer editor or ledger.
- Activity scope is explicit and permission-filtered. A filter can narrow access, never widen it.
- Selecting a customer does not silently filter Calendar or Activity. Any contextual filter must be
  deliberately selected and visible; removing it restores the prior permitted scope.
- **A PAGE NEVER RESOLVES DUTY — owner ruling 2026-09-01.** Every action-bearing surface renders
  the resolved owner/avatar from the one Work Engine Action contract governed by
  `../ERP-ARCHITECTURE.md` Law F.1. Only `Settings → Staff & Duties` edits Duty assignments and
  recorded assignment changes; People supplies
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
  blocker (`Ready` · `Goods not ready` · `Hold delivery` · `Driver and vehicle not recorded`;
  owner ruling 2026-09-25). The two never merge into one status, because a progress rung and a
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
  6. **The one COMPANY actor — owner ruling 2026-09-24.** A logistics company with no portal
     login that answers through its external link (Delivery §5.5) is recorded and displayed as
     **`{company} via external link`** (`AL Logistics via external link · Wed, 16 Sep`). It is an
     organisation, never a person, and no screen may print a person's name for it.
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
- `Work` is a formal destination with `My Work` and `Team Work`; since the 2026-09-24 owner ruling (§5)
  the right rail no longer peeks at Work — Work is reached from its own navigation door.
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
title, for example `Sales Orders`, as the word alone. Right = genuine global utilities only: Jump to · Notifications · Help · System Settings. **Owner correction2026-10-02:** all global utility triggers are icon-only at desktop and phone; Jump to uses canonical kit `jump`/Lucide Command16, distinct from register Search; no visible Jump to word/keyboard chip, Help word or Settings word. Tooltips, accessible names and Jump to keyboard shortcuts remain; Notifications keeps its count. Page identities, Table/Cards and rail labels are unaffected. `Jump to…` is an approved missing
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

**DEPARTURE FLOW AND FORMER STAFF — OWNER-APPROVED 2026-09-29 / NOT BUILT.** HR MASTER §3
owns a single review-and-confirm departure flow coordinating last working day and access disablement.
Effective departure automatically removes the account from Settings/default active staff lists;
no separate delete/remove step. Only existing personnel-management permission allows intentional
lookup/opening of retained former profiles; ordinary staff cannot access them. All users default
to current staff. Historical document readers retain actual-actor names without thereby receiving
profile/account access. Preserve source identities and existing sensitive-field controls. Scheduled
effects are not completed effects; partial failure must show the unfinished work honestly. Reuse
existing governed components/tokens; the approved `Manage staff` header entry opens existing People management for authorised personnel
managers and preserves return context.

**TEMPORARY DUTY ADJUSTMENT — OWNER-APPROVED 2026-09-29 / NOT BUILT.** The manager menu’s
PO/GRN adjustment shows the affected arrangements before confirmation and requires person, start,
end and reason. Expiry returns to the system arrangement, not a changed monthly rota. Workspace
§4.3 owns the business boundary; reuse the governed focused form and plain-name/date presentation.

**ASSIGNMENT / ACTUAL WORK — OWNER RULING 2026-09-29 / APPROVED TARGET / NOT BUILT.**
Staff UI uses `Assigned to` for current responsibility and `Completed by` for the actual performer;
`Updated by` records an update. `Assigned by system` and timestamped assignment movements belong in
history. Remove Normal owner, Acting owner, Buddy cover, Covering a person, Temporary owner and
similar labels from routine pages, tooltips, accessibility names, filters and rendered history.
A completed job retains the assignment effective at completion and its actual performer/time.
Assignment never restricts another authorised Operation person from helping. Source permissions and
approval gates remain; one owning-module business fact completes Work in every surface. Workspace
§3 owns the complete evidence contract, including Workspace/Delivery Monitor origin.

**TWO ASSIGNMENT CHECK TIMES — OWNER RULING 2026-09-29 / APPROVED TARGET / NOT BUILT.**
Settings → Staff & Duties exposes two manager-editable times: `Morning check time` (10:30 AM) and
`Afternoon check time` (3:00 PM), in company time. Reuse governed time inputs, form/save states and
manager permissions. One shared persisted setting drives all consumers; a successful UI save cannot
claim an active automation until the source and resolver actually consume it. Each check needs fresh
activity evidence for its own work period; morning use cannot satisfy afternoon. Workspace §4.4 owns
the routing/evidence contract and measured implementation gap. No third roster or MC editor is added.

**STAFF & DUTIES PLACEMENT — PRODUCTION VERIFIED 2026-09-29, PR #1791 (owner-approved 2026-09-28).** The header gear →
`All System Settings` → `Staff & Duties` is the one maintained destination. Remove its persistent
main-menu row. Work's unresolved-Duty link opens the exact Duty in this same Settings destination
and preserves return context; contextual links are not duplicate editors. Preserve existing
read-only visibility and manager-only writes. Workspace MASTER §4 owns the capability and this
placement's acceptance boundary. Its §4.2 structure is separately owner-approved 2026-09-28 / NOT
BUILT: current facts → next assignment → collapsed history. Owner-approved 2026-09-29 / NOT
BUILT: authorised manual actions live in the selected Duty header’s visible `⋯` menu (`More actions`),
not permanent buttons. Only authorised managers see applicable actions; no right-click dependency. Catalogue/detail at 1440/1180px; list then full-width detail at 820/743/390px.
Settings navigation opens on demand; never force a third narrow-screen column. The separately approved
2026-09-28 catalogue shows today's holder/active cover/unassigned answer; future dates belong in
detail (Workspace §4.2), with no token change. Final Blueprint approved 2026-09-29 / NOT BUILT:
plain `Next` and collapsed `History`, plus `Manage staff` to the existing People surface. Workspace §4.3 also carries the owner-approved 2026-09-28 / NOT BUILT
assignment form: current read-only facts above the focused inputs, one confirmation, preserved
input on failure, and single-column narrow-screen layout. Owner correction later on 2026-09-28 makes routine assignment automatic; this form is only
conditional manual presentation, not the default journey. Effective departures disappear from
active staff views/choices; historical evidence remains. Workspace §4 owns the final approved target and bounded manual-exception law; the full assembled
Blueprint received owner approval 2026-09-29. This ruling changes no
colour, spacing, typography, icon or other token value.

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

**REGISTER TOAST PLACEMENT — APPROVED / LOCKED (Loo, 2026-08-11; owner confirmation2026-10-02).** Ordinary result feedback reuses the existing governed Toast; no extra duplicate banner or replacement component. Complete shared component recipes include accessibility, keyboard, focus, states and touch behavior; adopting a visual fragment is not complete kit reuse. Toasts use the proven 2990
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

**RAIL GROUPS ARE HEADERS FIRST — OWNER RULING 2026-09-28 (Jess: "international keep got description
under menu? … it should every category header, and click to expand listing"), overwrites the
2026-09-27 "icon + title + one supporting line".** Shopify, Linear and SAP Fiori facet panels show
the group title only. Every `FilterRailGroup` is **closed until the operator opens it** (the choice is
remembered per rail and group); a closed group still shows its **chosen value on the header**. No
description line under a group title. A page with two views of the same records switches them with
the kit `Tabs` bar at the top of the rail, never with a collapsible group. A closed group's rows are
not drawn (the body's display follows `open`; `hidden` alone had lost to `flex`, so every rail drew
its rows even when closed — fixed the same day).

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

**SALES ORDERS RAIL — owner approved 2026-09-22 · APPROVED TARGET / NOT BUILT.**
Orders MASTER's monthly-demand/left-rail section owns the two views and their factual filters.
Reuse FilterRail's shell, widths, wrapping and responsive grammar. No Clear filters is rendered
inside the SO rail: selected facets toggle off and selects retain All. The shared active-condition
bar/list-toolbar clear behaviour remains unchanged, as with the existing PO rail ruling.
Dealer/product multi-selection is an SO-specific target, not a capability of the current
single-slot FilterRailSelect and not a portal-wide change. Its governed kit interaction remains
unbuilt; do not implement a page-local substitute or infer permission to alter other module rails.

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
  itself to the viewport on load (`− + ⛶` above/outside the canvas, always visible, keyboard-operable; owner correction2026-10-02). Route viewport scrolls to its complete transformed extent so bottom nodes remain reachable; resolver facts/node-card design are unchanged. The Sales
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
detailed record. The later Confirmed shared template and Complete-template adoption contract govern the accepted SO-derived recipe and supersede older conflicts here. The reference page is the Sales Orders
Register (orders MASTER §0.1). Status: APPROVED; adoption is per page and is not proof of build.

```
0  KIT      ONE kit, every page (owner ruling 2026-09-27). A card / panel / block
            title is `text-strong` 15/600 slate-12 — BLACK BOLD, never blue, never a
            band; blue is the primary button, links, selection and partial-progress status pills. No dash as a
            value anywhere. A page that differs is a defect, not a style.
1  PAGE     Header 50px: page name + Jump to · alerts · help · settings only
            Toolbar: the module's create button ONLY where the module is the
            record's birthplace (Sales Orders has none — orders are born in the
            Sales Portal) · Search · Export · Columns
            Table · 32px footer. Nothing above the table (no KPI cards)
2  COLUMNS  Order = the module MASTER's owner-approved list, never guessed
            Record date(s) first, then the document number
            The document number pins left and opens the record
            Another document's number opens that document
3  WORDS    Only words in COPY-STANDARD
            A required fact prints no absence word (empty = system error)
            An empty cell draws NO glyph — never `—` (owner ruling 2026-09-26)
            A document not made yet: No PO yet · No DO yet
            Loading · Could not be loaded + Try again · empty — never mixed
4  WIDTH    Only from REGISTER_FIELD_WIDTH. A missing field is added there
5  ROW      Accepted SO-derived template: desktop row32px, text12px /18px
            Other unadopted listings keep their scoped recipe until verified
            8px left and right in every cell · 1px lines between cells
            Header 36px, 11px/600 (text-label) · footer 32px · 8px gaps
            Second fact in a cell (where approved): 11px grey (slate-11)
            One line per cell. A long value ends in … and shows whole on
            hover and focus; the column can be widened. Dates and numbers
            never cut. The row never grows
            Own approved designs, not this rule: SO Batch Purchase ·
            Manual Purchase · Payment Monitor · Delivery Monitor
6  HEADER   11px/600 grey band · the filter icon shows on hover, focus, or while
            that column is filtered — never on every column at rest (owner 2026-09-27)
            Sort = a 12px arrow icon (ArrowUp / ArrowDown) in the header ink,
            never a letter; its direction is spoken to a screen reader
7  EXPAND   ▸ opens a child table · 1px line from ▸ to a bordered child box
            Item = product name on line 1, configuration on line 2
8  GROUPS   Only where the module MASTER approves them. Sales Orders: None
            by default, optional Delivery / Stock / Payment Status in Page tools
9  FILTER   Active chips above toolbar · neutral Clear all · footer {n} of {m}
10 SELECT   Ticking replaces the toolbar; no buttons inside rows
11 PHONE    The document number is visible on first screen; the table
            scrolls itself; the page never scrolls sideways
12 CHECK    1440 / 1180 / 820 / 390 · 200% zoom · keyboard
```

**TABLE RECIPES — owner ruling 2026-09-27 (Jess: "every chat doesn't know how to draw this UI").**
The portal has exactly FOUR tables. Each is a kit component with a live `/ui` example; a page
IMPORTS one and never draws a `<table>` of its own — `check-design-standard.mjs` refuses page-local
table styling. A fifth table does not exist until it joins the kit.

| # | Where | Component | Recipe (locked numbers) |
|---|---|---|---|
| 1 | a Register / listing | `DataGrid` (kit) | header 36px slate-3 11/600 · accepted SO-derived32px rows (other scoped recipes preserved) · 8px insets · column separators by column count (tokens §5.1) · hover slate-3, selection blue-3 · 32px footer |
| 2 | a row's goods expansion | `GoodsMiniTable` (kit) | header 27px · 51px two-line rows · four-sided frame · §6.9 connector |
| 3 | a document table inside a card (SO `Items`, `Payment` rows, PO lines) | `DocumentTable` — **admit to the kit** (today `components/so-document-table.ts`, page-local) | header 11/500 slate-11 over a 1px slate-5 line · 13px rows, 8px cell insets, 1px slate-5 line beneath each · NO vertical lines · amounts right, tabular · only the closing total 600 |
| 4 | a totals block (`Goods` · `Services` · `Total payable` · `Paid to date` · `Balance due`) | `TotalsSummary` — **admit to the kit** | the tail of recipe 3: two columns, label slate-11 left, amount slate-12 right tabular · 13px · 8px insets · 1px slate-5 line between rows · **NO outer frame, no boxes per cell** (owner 2026-09-27 — Shopify / Stripe / Xero shape; the 2026-09-22 "full-width bordered" frame is retired) · only `Total payable` and `Balance due` 600 · a missing value is a word (`No price yet`), never a dash · page and PDF draw the same block from the one arithmetic |


**THE WORK ROUTE KIT — admitted by Jess 2026-09-28 ("kit ok"; Workspace MASTER §5.10) · BUILT 2026-09-28.**
Four pieces joined the kit with the Work page; each has its `/ui` example (section `route`) and a
page imports it, never draws it:

| Piece | File | Locked values |
|---|---|---|
| `Block` — the ONE card | `components/kit/Block.tsx` (moved from `SalesOrderWorkspace.tsx`; Sales Order, Purchase Orders, Manual Purchase, Warehouse Unit and Work import it) | white · 1px `slate-5` · kit card radius · 12/16 padding · black `text-strong` title over a 1px rule · optional `why` second line under the title, 13/400 red (missed) / amber (due) / slate-11 |
| `RouteStop` | `components/kit/RouteStop.tsx` | 24px dot on a 1.5px line (dashed `slate-6`, solid `slate-11` once done; none under the last stop) · dot: red `!` missed · amber `!` due · dark tick all done · grey otherwise · label 11/500 uppercase slate-11 `.06em` with `Missed` / `Due` only |
| `ChecklistRow` | `components/kit/ChecklistRow.tsx` | 16px square mark (the Checkbox's 4px radius, read-only): dark tick done · 1.5px empty not yet · red / amber `!` the act now · no mark for a fact or a stop that cannot start · step 13/400 (13/600 when it is the act) · value 12/400 slate-11 (act colour for the act) · document on the right · ≥32px row · `stacked` drops the value under the step (the page sets it below 1340px) |
| `QuietRouteRow` | `components/kit/QuietRouteRow.tsx` | one ≥48px line: stop label · status 13/400 · `{n} of {m} done` · chevron · white, 1px `slate-5`, kit card radius, 8/16 padding · outline red / amber when it holds an act · `wrap` puts the status on its own line below 1100px instead of cutting it |

Two opt-in props came with them, and no other page moves: `Tabs fill` (tabs share a narrow bar by
their own length with no gap, so Work's four Communication tabs stay on one row at 280px) and
`FilterRailRow tone="workspace"` (14/400 rows with the count on the right; the chosen row is the
`blue-3` wash with the 3px blue edge; `indent` for a record row under its module row).

**Current row recipe.** The accepted SO-derived template uses desktop32px rows and12/18 text. Other listings retain their approved scoped recipe until their adoption round. Historical40px Sales evidence is superseded by the Confirmed shared template; the generic engine38px default is not globally changed.

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
   therefore cannot express this page — Supplier Claims does not adopt it. **Engine
   `DataGrid pinnedPrefix={{ columns, narrow }}` — BUILT ON BRANCH 2026-09-29 (Purchasing §9.5
   slice C1):** the page's own leading columns lead, cannot be hidden or dragged, pin at ≥768px,
   and only `narrow` pins below it; an in-cell disclosure toggles the SAME row expansion through
   `DataGridRowExpansionContext` (§6.9). Do not "restore" the date-first pair there.
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

**Paged-register column controls — PRODUCTION VERIFIED, 2026-10-05.**
`DataGrid serverColumns={{ values, onChange }}` reuses the same enum/date/number/clear controls.
The server supplies complete authorised choices and filters/sorts before pagination; the grid
never applies those operations a second time to the returned page. Existing local registers keep
their behaviour. Browser and server share `register-column-query`; modules do not copy it.
The caller resets to page 1 and displays loading during replacement. Receiving is the first adapter.
The shared menu anchors to its trigger, stays within an 8px viewport inset and returns focus on
Escape. Actual production at 545px measured 337–537px; supplier selection, clear and numeric sort
worked. The 366px preview separately measured 158–358px and found record 61 with five rows loaded.

#1899/#1901 are covered by successful deployment `37218697773`; all five surfaces converged to
`5c04b6625a0bd2f6bfc19f03400e7bfae0308195`. Exact-head CI `37217770861` passed before #1901 merged.
Live Receiving also verified shared Table/Cards, full-GRN/Back preserving view/filter and the
15-column Page tools surface. Predecessor own deployment `6be3a617.carres-portal.pages.dev`
(`index-BkDrOL2X.js`) versus live `index-D7wV4aOD.js`: card marker 0→1, new filter clamp 0→1,
old fixed filter style 1→0, `GRN Doc Date` control 6→6. This is not grouped-pagination or
all-record-export acceptance; export has its separate state below.

**Paged-register export — PRODUCTION VERIFIED (Excel), 2026-10-05.**
`DataGrid loadExportRows` is the shared optional full-population reader for a paged register.
It uses the existing Excel/PDF column derivation/renderers; the owning reader must return the
complete authorised current filtered/sorted population. It does not change row-selection export.
Read/render failure shows `The list could not be exported. Try again.` and produces no partial
file. Export prevents duplicate in-flight starts and leaves the displayed page untouched.
Receiving is the first adapter. The `/ui` paged example exported an actual 61-row workbook while
five rows were loaded, then a one-row workbook for its record-61 supplier. #1905 passed full CI
`37219247916`; deployment `37219944735` converged across all five canonical surfaces to
`a087fec9a`. Actual authenticated production exports contained seven receipts, then exactly three
Ohana receipts from filtered Cards. Live PDF-list download is not claimed.

**Compact card wrapped summary labels — LOCAL VERIFIED / DELIVERY PENDING, 2026-10-05.**
The shared summary cells use two shared grid tracks per row so a wrapped label grows the label
track and every value remains aligned below it. No token, label or module-specific CSS changed.
The Receiving showcase now includes all four actual summary labels. At 416px, the old fixed
16px track placed the value 13.59px inside the wrapped label; the correction leaves 4px clear
space and aligns all four values. At 366px the existing two-column composition also clears
all labels. Shared card/Receiving regression tests passed 102; design checks passed.

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

- **Rail style C:** icon plus 13px/600 slate-12 normal-case text group titles, and NO supporting line
  under a title (owner ruling 2026-09-28, RAIL GROUPS ARE HEADERS FIRST); collapsible groups with remembered
  expansion, 1px group dividers, selected value in blue at the right only when filtered; otherwise
  leave that space empty. Icons supplement labels and come from the existing kit. Each group
  remains single-choice; no new multi-select. Preserve each page's filter content and control type:
  an existing dropdown remains a dropdown inside its group. Collapse does not clear a filter.
- **Special rails:** Payment Monitor weekly plans and Warehouse schedule day lists use the same
  heading, divider and text treatment; preserve their content, date meaning and behavior.
  Sales Orders gains the owner-approved rail of 2026-09-22 / 2026-09-26 (Orders MASTER § Monthly
  demand): the view selector in the fixed region and six single-choice groups in the shared style C —
  no new kit component (the multi-select admitted earlier on 2026-09-26 was withdrawn the same day).
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

**ROW 2 · WORK TOOLBAR.** Keep the existing scoped height in 01 §7.4. The current
owner-approved presentation is the Register toolbar ruling above: search, current filter summary
and admitted Table/Cards remain visible, secondary supported tools live in the fixed far-right
`⋯` menu. Governed create/selection actions retain their business ownership. This replaces the
old always-visible icon-only Export/Columns arrangement; existing deployments may lag.

- Search uses its admitted shared control and preserves active query/clear access. Do not create
  a page-local search component. Narrow layouts overflow secondary tools first.
- Export and Columns entries have icon plus text. Export retains existing supported outputs,
  permission checks and selected-vs-filtered scope; this ruling changes placement, not capability.
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
- **Row 2 uses the shared Register toolbar target** — visible search/filter summary and admitted view control, secondary tools in `⋯`; no page-owned control in Row 1. The superseded
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

**ROW HIGHLIGHT — owner ruling 2026-09-29 · BUILT.** `DataGrid rowHighlight` draws a 3px stripe at a
row's left edge (the SAP Fiori table row `highlight`): `critical` = kit red-9 (the row cannot take the
act until something is fixed), `info` = kit blue-9 (an offer or a fact to read). Every row keeps ONE
height and a register cell keeps ONE word: the reason is never printed under the word in the cell. The
stripe's `label` is the row's hover title and `aria-description`, so colour is never the only signal,
and the owning page prints the reason with its door where the row's details live (SO Batch: the item
line in the expansion). The whole row is never painted — it fights hover and selection, tires the eye
and fails colour-blind readers. Opt-in; omitted callers are unchanged.

**DEPLOYED + AUTHENTICATED READBACK 2026-09-24 (#1589):** DataGrid's optional
`selectable.unselectableReason` adds an accessible description and the existing kit
Tooltip to a refused checkbox. The label is keyboard-focusable and description IDs
are unique per grid and row. It explains facts already visible on that owning page;
never make the tooltip their only copy. Omitted callers retain their existing behavior,
and no selectability or bulk-action rule changes.
CI `35986102965` and deployment `35987154529` passed; all five canonical endpoints
reported `96528e114129fb11d051a59fe81413dcb1c6a4d0`. Authenticated SO-1358 keyboard
focus displayed `Already on a PO` with zero checked rows; SO-1206 exposed `SKU not found`,
and the pending MPR row exposed `Need approval`. Purchasing §9.1 records the before/after
and keeps stock/issue lifecycle verification separate.

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

**THE SHARED TWO-LINE LISTING ROW IS 51px — owner ruling 2026-09-26 (Jess: *"I like the current row
height"*), overwriting the 2026-09-18 mockup number 54px.** An accepted SO-derived one-line listing row is32px (§6.0
rule 5). A row whose Item cell carries two lines — product name 13px/18 over configuration 11px/14,
the configuration on ONE line ending in `…` — is 8 + 18 + 2 + 14 + 8 = 50px plus its 1px rule:
**51px, measured on the Sales Orders goods expansion at 1440 (PR #1518) and kept.** Every row of a
two-line goods table is that height, a line with no configuration keeping the empty 14px second
line, so rows never differ. It is the goods-row geometry, not a portal-wide replacement: single-line
unadopted registers keep their scoped recipe, and per-page exceptions keep their own approved heights (Payment Monitor
72px). A required party, number, document or date is never ellipsised to protect the height.

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

**Shared saved-evidence viewer — DEPLOYED + RECEIVING PRODUCTION READBACK, 2026-09-24 (#1593).**
`SavedEvidenceViewer` is admitted under Purchasing §9.5's approved contract and recorded
in `02-components.md`, with a live `/ui` example. Existing Modal behavior owns focus,
Escape and scroll lock. Source/event and any actual Unit associations stay with each file;
permissions and refresh stay with the owning reader. Receiving is the first consumer;
Claim-record photos are deployed with authenticated readback (#1594). Claims' working
reply record and per-Unit expansion, Stock and Service adoption remain separate work; this kit
addition does not claim those workflows delivered.
Purchasing §9.5 records all-five-surface SHA proof, authenticated GRN failure/retry/focus
readback and production example photo/video controls; synthetic media is not business proof.
The fullscreen-exit focus correction is production-verified (#1595): native fullscreen
exit restores viewer focus; the following Escape closes it and returns to the opener.

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

The canonical numeric recipes and source/target conflicts are in
[01 §§7.2–7.4](../01-design-tokens.md#74-register-and-goods-tables).
Each Register keeps its sticky header inside its own scrolling viewport; grouped listings use
§6.10 group-local headers with one width/visibility/sort/resize set. Pinned identity is date +
number at canvas ≥768px and number only below; headers and cells scroll together. Expansion begins
after the parent's control gutter. Field widths retain the content-measurement registry below.

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
| RO No | 170 | prototype | Repair Orders, 2026-09-20. Historical width measurement used the former four-digit-year shape. Apply the system-wide two-digit-year display rule; remeasure actual content before changing governed width. **Owed:** the rendered-portal measurement |
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


### GRN document boundary — owner approved 2026-09-23 · NOT BUILT

The GRN document composition and receipt arithmetic are owned by Purchasing MASTER
§9.4, not by the register template or SO PDF. Retain the reviewed two information
blocks, the PO-family company letterhead and grouped item/Unit evidence; creation
time, physical arrival time, planned destination and actual site remain distinct.
Use COPY's accepted `Received Qty` versus `Physical arrived Qty` distinction. This
is not authority to redesign Manual Purchase, replace its PO with a GRN, or mark
a PDF production-verified. Screen blue heading styles do not recolour printed PDFs.

### Accepted SO representative measurements — 2026-10-01

The rendered pilot is owner accepted; BUILD through tests and deployment is authorised.
Count/summary left; Search220×32 desktop + Table/Cards +32×32 Page tools aligned right.
Toolbar40px desktop, touch controls40px. Rail240px; slate-2 canvas, white cards with
slate-6 border/radius6/gap8; slate-3 headings36px and white expanded bodies. Chosen values
remain visible when closed. SO Order list uses aggregate summary and requested-date shortcuts,
both initially open; Monthly demand retains its governed filters and stacked view navigation.
Rows32px desktop, body12/18, header11/600/36, horizontal cell padding8; touch targets40px.
Table/Cards uses shared segmented Tabs with canonical icon16 plus visible Table/Cards words (owner amendment2026-10-01): outer32px, border1/padding2/option26, radius6;
option13/18, horizontal padding10, selected blue-3/blue-11/600; outer40px touch.
Existing tokens and shared primitives own this template. Other-module adoption preserves its
business facts and governed placement; acceptance does not claim all pages are migrated.

### Shared listing order — owner ruling 2026-10-01

All listing pages follow **active filter chips → toolbar → table header/results**. Table and Cards share the same controls and order. This supersedes earlier instructions placing active conditions below the toolbar. The filter row is absent when there are no filters by default. Purchasing's owner-approved fixed placement (2026-10-02, Purchasing MASTER §9.3) opts into DataGrid `reserveConditionRow`: one 36px row remains when empty; multiple chips scroll horizontally, retaining all remove and Clear all controls without shifting the toolbar or results. Other registers retain their existing behaviour. Otherwise min-height36px, chips24px,6px vertical/12px horizontal padding,8px gap before the toolbar. No "Showing only" prefix. Each chip retains its accessible remove button; neutral slate-11 "Clear all" follows the chips, without a border or destructive red. The desktop toolbar is40px; search and Table/Cards and more tools right; SO count and quantity remain only in the footer and governed rail summary, directly above results. No divider between filters and toolbar. Narrow layouts may wrap controls and increase height to preserve accessibility. Shared DataGrid owns DOM/keyboard order; page-specific copies are not permitted. Existing pages using other listing engines still require migration; this ruling is not proof they are all deployed.


## Confirmed shared template — owner acceptance 2026-10-01

Jess accepted the rendered Sales Orders pilot as the shared TEMPLATE and authorised a dedicated BUILD controller through testing and deployment. This supersedes earlier unapproved visual-composition restrictions for the accepted elements below; production evidence below bounds the delivered reference. Business facts, permissions and module workflows remain module-owned.

- Global utility grammar (owner correction2026-10-02): Jump to, Help and Settings are icon-only on all widths; Jump to uses kit `jump`/Command16 while register Search remains a magnifier; tooltips/accessible names/key shortcuts remain, bell retains count, and menu contents/page identity do not change.
- Action grammar (owner amendment2026-10-01): Full-object Print and Export/Edit use canonical icon16 plus visible word; the compact card opens the saved document from its number, with output controls inside the source-owned document preview; labels remain on narrow screens and toolbars wrap. Back/Close/More are shared icon-only controls with tooltip and accessible name. Content tabs Order/Revisions/History/Order Route stay text-only, selected black600 with blue underline. Status pills retain text; icons are not added indiscriminately. No2990 comparison was verified for this amendment.
- Register presentation uses existing Tabs segmented variant: Table icon `Table2`, Cards icon `LayoutGrid`, both16px inheriting text colour with visible words. The same controls remain during selection; decorative icons are hidden from accessibility and names stay Table/Cards. This narrowly approved presentation amendment changes no data/filter engine or Purchasing business scope.
- Register: reuse DataGrid, active removable filter chips above its compact toolbar, neutral Clear all, Table/Cards sharing one search/filter result, existing column chooser and header filters. Left rail complements the table with relevant aggregate summaries and useful time shortcuts rather than repeating every column filter. Sales Orders uses four compact rows (owner2026-10-02): Sales orders, Total payable, Paid to date and Balance due, label left/value right with tabular no-wrap values and all four visible; missing-amount notices span the row only when needed, following the filtered LOADED result with explicit scope/missing-money wording, and Customer Requested Delivery Date shortcuts. Status filters live in table columns. Other modules choose meaningful aggregates from their own authoritative facts, never copy SO financial arithmetic blindly.
- Object header: white identity/actions row; slate-2 navigation row with slate-5 1px top divider. Selected tab uses semibold600 black text and blue underline. Header stays outside scrolling content. Back navigation is a neutral rounded square, canonical kit back icon16, desktop32/touch40 target, tooltip Back to the owning register, keyboard-accessible destination label. Do not replace status pills with square buttons: actions and status keep their distinct kit roles. Existing kit Button/Icon/Badge primitives own consistent sizes, states and semantics.
- Sidebar: expanded official Carres lockup mark36, versus prior26 (about40% enlargement), collapsed mark28. Preserve asset proportions and button clearance.
- Object composition: left form scrolls as ONE pane, right document preview independently; Items has natural height and no independent vertical scroll box. Desktop wraps product details; horizontal overflow only when required. Small-screen stacking follows existing responsive split.
- Sales Order Items example: five columns Item, Qty, Unit (RM), Disc (RM), Amount (RM); item name, code and configuration share Item. No sequence/code columns, numbers do not repeat RM below RM headers, amount remains on one line. Preserve per-line editing/protection and service rows; footer Total payable and category Quantity; omit empty Services: None. Printed PDF remains governed separately.
- Quick view: use the shared `CompactModuleCard` under §4.3 and `docs/ui-reference/MODULE-CARD-TEMPLATE.md` (owner2026-10-03/04). The common customer header, Info/Delivery facts and collapsed content replace the former Block composition. Preserve module facts, source errors, permissions and full-object door; no invented stock receipts or document numbers. The `Drawer` compact-card variant owns focus, Escape, background scroll lock and return behavior. Full object retains its governed read-first state and deliberate Edit.

**DELIVERED / PRODUCTION-VERIFIED — accepted SO pilot and action amendment, 2026-10-01.**
PR #1838 merged as `c926e3f76d6508245b91da2bda44783e69798898`; PR #1839 merged as
`f04ed27ccd7f5129ec5dd0125b39ce4970869cee`. Exact-head CI `36883995352` and production
Deploy `36886061086` succeeded. `verify-production.mjs` proved that amendment SHA on both
Pages sites, both canonical ERP/POS domains and API Worker health. Governance, types, complete
shared/API/web tests, production build and web-bundle secret guard passed; no migration or
business-data write was performed.

Authenticated read-only ERP proof as Sara · Principal: 31 orders; searching Kimmy returned
SO-1303 in both Table and Cards, with Total payable RM2,499, Paid to date RM1,250 and Balance
due RM1,249, and footer 1 of 31. The summary retains the Loaded orders only tooltip while
its redundant paragraph is absent. Canonical Table/Cards icons and words remain visible at
390px with page width390 and no page overflow. Quick view retains source document/absence
truth, Receipt unconfirmed, visible Print and40px touch controls. Full object is read-first,
with five Items columns, protected supplier-commitment rules and a rendered PDF canvas;
Back restores the register's search and presentation. Production console errors were absent.
Print was invoked without an observed error; the separate print viewer was not exposed by
browser tooling, so that viewer and physical printing are not claimed verified.

Shared reuse follow-up corrects selected kit tabs to semibold600, truncates long quick-view
identity only when needed with its full tooltip, and keeps header actions from shrinking.
At <=767px the identity and action group use two rows inside the same header. Full-object facts retain their governed labels and values; compact-card facts follow §4.3 and the sole card contract. Local /ui measurement proved dark
selected labels600 and blue indicators; SO390 proof showed title356px, header95px and all
40px actions visible without page overflow. Purchasing's read-only prototype reviewer confirmed
its long PO identity fits the same390px recipe. Focused follow-up checks:117 passed plus
29 kit/module-tab checks. The full-object header reuses its existing two-row layout when available content width is <=1023px (including shell rails), preserving identity/actions/global tools. Back accessible name matches its destination tooltip. This is shared template reuse, not Purchasing or Warehouse completion.

### Solid status pills — owner confirmed 2026-10-02

DEPLOYED / PRODUCTION-VERIFIED — PR1842, SHA `68d133c439e3ed8e1409db7a157c1b20e7a3c6c4`,2026-10-02. Status text is white on a solid semantic-colour pill,
without a circular mark or decorative icon. This replaces the previously proposed pale-fill
status presentation. Shared StatusPill owns the appearance; neutral Badge counts are unaffected.
Use canonical dark-enough token fills with readable white text, not the mock's hard-coded hex.

| Meaning | Tone | Sales Order labels |
|---|---|---|
| Complete | Green | Fully received, Fully delivered, Paid in full |
| Partial progress | Blue | Partially received, Partially delivered, Partially paid |
| Waiting / not started | Neutral grey | Awaiting receipt, Not delivered, Unpaid |
| Issue | Amber | Received with issue |
| Unknown / unconfirmed | Neutral grey | Receipt unconfirmed, Amount unconfirmed |

Keep full accessible status text, filter/sort/search/export strings and source calculations.
Red requires a proven late/blocking condition; unpaid alone does not qualify. Shared module
statuses preserve their existing business meaning; do not remap unrelated Work action tones
or neutral counts. Verify token contrast, desktop/phone geometry and register/quick-view parity.
Application change is authorised only for this status presentation and its shared recipe/examples;
unrelated Route/Monthly previews and unapproved master gaps are excluded.

### Optional register grouping — owner confirmed 2026-10-02

BUILT AND MERGED 2026-10-02 in PR #1850, source `2fbc2b62ffcc23c23e869f236c976ee1a3102638`.
Production release and five-surface revision proof: [Deploy production run 36984977880](https://github.com/wenwei4046/Carres-Portal-v2/actions/runs/36984977880).
Authenticated rendered evidence is recorded by the dedicated delivery controller; successful
release alone does not imply full cross-module template adoption. The complete existing register,
not a separate reduced mock, owns grouping. Default None. Existing shared Page tools (⋯) offers
Group by: None, Delivery Status, Stock Status, Payment Status for Sales Orders. Exactly one
selected grouping; other modules expose only their governed meaningful grouping fields.

- Reuse DataGrid group-local section headings and columns. Each heading shows status name and
  filtered SO count, supports collapse, and each open group repeats the same column header.
- One shared toolbar, search, column chooser, widths, filters, selection and export across all
  groups. Rows retain solid status pills. Hidden status columns may still supply grouping. Cards use the same group headings/collapse and result state; no physical-goods delivery condition belongs in Not applicable rather than disappearing.
- None restores one ordinary table. Grouping never duplicates an SO across several sections or
  calculates a new overall status. Counts reflect current results, not an unfiltered population.
- Choice must remain stable while operating the listing; the delivered SO register encodes `group` in
  route parameters. Browser/account persistence beyond URL is not claimed implemented.
- Do not invent a second rail control or page-local grouping engine. Existing DataGrid gained
  optional `pageToolsItems` to compose commands into its existing shared menu. PR #1850 isolates
  the delivered listing and tests from unfinished Route/Customer/Monthly preview work.

### Complete-template adoption contract — clarified 2026-10-02

This section is the single cross-chat handoff. Read it together with §6.0 and §§6.7–6.10,
`01-design-tokens.md`, `02-components.md`, `03-page-patterns.md`, the owning module MASTER and
its COPY entries. Do not create another kit guide. The confirmed rules immediately above govern
presentation; dated delivery evidence below describes what was verified at that time, not a
permission to restore superseded words or geometry.

**Measurement lookup for the accepted SO-derived template.** These accepted values supersede
older conflicting generic register density values for this template. Sizes not listed here come
from the linked token/component source; absence is not permission to invent a number. Module-owned
column widths remain content-measured and retain their documented exceptions.

| Element | Accepted measurement / behavior |
|---|---|
| Register search | Desktop220px wide ×32px high; responsive width follows shared DataGrid |
| Desktop results | Row32px; body12px /18px line height; header11px, weight600, height36px; horizontal cell padding8px |
| Register toolbar | Desktop40px; responsive wrapping may increase height |
| Active filters | Minimum36px row; chips24px; padding6px vertical /12px horizontal; gap8px before toolbar; omitted when empty |
| Canonical action/control icons |16px; use kit Icon registry and supported sizes, not independently drawn glyphs |
| Back/Close controls |32px desktop /40px touch; canonical neutral control geometry |
| Local rail breakpoint |896px available content canvas, after shell rails; not viewport width |
| Collapsed local rail |44px Show filters control; full open composition uses source `.so-template-rail` |
| SO summary |Four visible rows;8px row gap; label left, value right, tabular/no-wrap; conditional source notices |
| Object tab selection/divider |Weight600 black, blue underline;1px slate-5 divider; white identity row /slate-2 tab row |
| Quick-view facts |Labels12px; values weight600; use Drawer/Block source for width, padding and responsive stacking |
| Carres official mark |Expanded36px, collapsed28px; preserve original asset proportions |

### Detailed composition measurements — source audit 2026-10-02

The values below were inspected in current implementation source, not newly measured screenshots.
Use them with the acceptance checklist; source inspection does not prove every module renders them.
Shared token radii: control6px, card10px. `text-strong` is15px/22px, weight600.

| Surface / element | Exact source recipe | Design and responsive rule |
|---|---|---|
| Block card | `kit/Block.tsx`: horizontal padding16px, vertical12px; border1px; radius10px | White default, slate-3 muted identity; black15/22/600 heading; slate-5 border/divider |
| Block heading | Bottom padding8px; header horizontal gap12px /vertical4px; body margin-top12px | Header wraps; read-only navigation may use headerSlot; writing actions stay with their facts |
| Quick-view drawer | `kit/DialogFrame.tsx` + Tailwind `max-w-drawer`: width100%, maximum560px, full height | At desktop>=768 right offset64px preserves right rail; below768 uses side-frame right0 |
| Drawer header/body | Header padding16px horizontal /12px vertical; title/actions gap16px; actions gap8px; body padding16px | Quick view dark slate-12/white; title truncates with full tooltip; below768 header wraps into identity/actions rows with8px gap |
| Quick-view content | Register composition: cards gap12px; fact grid2columns, gap12px; labels12px, value600, value margin-top4px | Contact facts first; no duplicate customer card; no footer; body owns vertical scrolling |
| Button default | `kit/Button.tsx`: desktop>=768 height32px; phone40px; horizontal padding12px; gap8px; icon16px | Shared primary/secondary/ghost variants; no local className/style overrides |
| Icon-only button | Desktop32×32px; below76840×40px; padding0 | Tooltip and accessible name required; icon alone never removes keyboard access |
| Button specialised sizes | `sm`: height24px, padding8px, gap4px; `touch`: desktop36px/phone40px, padding12px, gap6px; sm/touch icon14px | Supported API variants only; small size is not the default for phone actions |
| FieldFrame | Label/control vertical gap4px | Shared label, required/error/hint semantics; do not hand-roll field wrappers |
| Single-line field | `kit/field-recipe.ts`: height32px, horizontal padding8px, border1px, radius6px | White/rest slate-5; focus blue-9 ring2px; disabled slate-3/slate-9; error border red-9 |
| Read-only framed fact | Workspace FullFact: minimum32px, padding8px horizontal /4px vertical, natural wrapping | Read-only is not disabled editing; automatic fact may use slate-3; preserve module ownership |
| Multi-line field | Padding8px horizontal /4px vertical; natural content height | Same control skin; do not force all multiline facts to32px |
| Toolbar field | Height36px at>=768,40px below; padding12px; text14/20 | Use supported toolbar shape, distinct from compact register search |
| Object identity/actions row | `SalesOrderTabs.tsx`: desktop44px; horizontal padding24px at>=768 /16px below; gap12px | Fixed outside content scroll; shared CSS wraps at available container<=1023px; wrapped row height is natural, not a fixed44px |
| Object tab row | Height36px, horizontal padding24px desktop /16px below768; top divider1px slate-5 | Slate-2 surface; horizontal overflow belongs to tab row; selected600 black with blue underline |
| Object panes (SO reference) | Workspace form minimum660px, PDF minimum320px | Available host>=1320: equal halves;980–1319:660px form plus remainder PDF; below980: stack form then PDF; these are SO source values, not universal module pane minimums |
| Object pane padding/gaps | Each pane16px padding; quick-view/card fact gaps12px | Side-by-side panes scroll independently; stacked view uses outer natural scroll; Items has no nested vertical scroll |
| Rail fixed navigation | `index.css`: padding8px vertical /12px horizontal; stacked tabs gap4px; tabs height36px, horizontal padding8px, radius6px | SO accepted stacked views; selected blue-3/blue-11/600; below768 minimum40px targets |
| Rail filter group | Margin4px vertical; border1px slate-6; radius6px; white body | Slate-3 header, slate-4 hover; expanded header bottom divider1px; header minimum36px/phone40px |
| Rail group body/rows | Body padding4px top/bottom,8px right,16px left; rows minimum32px, padding7px vertical; text12/18 | Phone minimum40px; chosen rows blue-3/blue-11; long text may increase height rather than clip |
| Table/Cards segmented switch | Shared CSS: outer padding2px/gap2px/border1px/radius6px; tab height26px desktop /34px phone, padding10px horizontal, radius4px, text13/18 | Selected600 blue-11 on blue-3; both labels and16px icons remain visible; surrounding hit targets must retain accepted touch behavior |

### Remaining kit gaps — explicit, not permission to improvise

- The rail's accepted complete visual recipe still includes `.so-template-rail` and SO-specific
  navigation/test selectors. Primitive FilterRail imports alone do not deliver that composition.
  Shared extraction/admission is needed before claiming plug-in reuse across every module.
- `SalesOrderTabs` and Workspace `FullFact` still carry page-owned composition/naming. They are
  inspected references, not proof of a complete generic Object template API.
- Whole Register/Quick-view/Object example coverage on `/ui`, including all responsive and failure
  states, must be audited. Component examples alone are not complete-page evidence.
- No source-based dimension in this section should be called a freshly rendered measurement.
  Visual validation remains owed for other-module adoption; Route/Monthly composition is owned by Orders MASTER and its separate delivery lane.

Do not assume every control is icon-only: global utility triggers are; Table/Cards and full-object Print retain words. Compact-card document actions follow §4.3 and the source-owned preview. Status pills retain text. Column width, drawer width,
field height, gaps and rail width must resolve to the actual admitted shared source/token; copy the
complete recipe rather than guessing from an image. Before changing a missing shared dimension,
record the measured source and route the gap to the kit owner.

**Copy composition, not screenshots or isolated imports.** Start with these source recipes:

| Surface | Existing implementation to inspect | What must carry across |
|---|---|---|
| Register | `apps/web/src/pages/operation/SalesOrdersRegister.tsx` | Shared Portal shell and right rail; DataGrid toolbar, search, selection, Table/Cards, column controls and filter chips |
| Local filter rail | Register `.so-template-rail` composition and `useFilterRailOpen` | Measure available content canvas, not browser width; threshold896; collapsed44px Show filters; narrow open overlay, backdrop, Escape and restored selection |
| Object header | `apps/web/src/pages/operation/SalesOrderTabs.tsx` | White identity/actions, quiet tab row, divider, selected black600/blue underline, fixed header and responsive action wrapping |
| Quick view content | `CompactModuleCard` with a module-owned adapter; sole contract `docs/ui-reference/MODULE-CARD-TEMPLATE.md` | Common header, module facts/editors, source-owned saved document, collapsed Items/Communication/Timeline and full-object door |
| Quick view container | Shared `Drawer` `variant="compact-card"` | Focus containment/return, Escape, background scroll lock, accessible identity; closing preserves register context |
| Object facts/items | `apps/web/src/pages/operation/SalesOrderWorkspace.tsx` | Shared field framing, readable hierarchy, protected edit state, natural Items height and separate document-preview scroll |
| Shared primitives | `apps/web/src/components/kit` and `/ui` | Exact supported props, tokens, hover/focus/disabled/loading states and keyboard/touch behavior |

SO source files are composition references, not permission to copy SO business fields or financial
calculations. Use actual shared exports. If a reusable capability exists only inside an SO page,
ask the kit owner to extract/admit it once; do not fork it into another module. A prototype adapter
must be labelled local/sample and cannot be described as shared-kit support or working production.

**Every adopting chat must finish this acceptance checklist before saying aligned:**

- Name the owning module, exact source recipe and shared components used; identify any local adapter.
- Preserve that module's governed columns, quantities, statuses, permissions and write ownership.
- Show a complete working preview, not a cropped header. Check desktop and390px phone, plus the
  available-canvas896px rail boundary with global navigation expanded/collapsed.
- Check rail open/closed, backdrop/Escape, search, selection, column filters and Table/Cards where
  admitted; retain the same result and filter state when changing presentation.
- Check quick view and full-object door, long identities, missing/error/loading/empty states,
  keyboard focus, icon accessible names and40px touch controls.
- Check the bottom of long content is reachable, headers remain fixed, and horizontal table overflow
  stays in its intended pane. No footer or floating controls may cover facts or actions.
- Provide the preview URL, visual evidence and relevant test results. State remaining gaps explicitly.
  Passing tests, importing kit primitives or another chat's approval is not whole-page visual proof.

The module chat owns implementation and reports in its own chat. The kit owner owns shared gaps;
the BUILD controller owns release verification. Send the same canonical section link and specific
mismatch to other chats, rather than a new prose standard. Approval, built, deployed and visually
verified are separate claims; include scope and evidence for each.

**Scope boundary:** the accepted shell/register/object/quick-view recipe is confirmed. Order Route compact-card redesign and Monthly Demand planning composition are governed separately by Orders MASTER; their current local work is not a universal kit pattern or part of this listing release. No complete2990 comparison is claimed.
The master contract being documented does not mean every module has migrated or been verified.

## §4.3 · Compact module card — owner rules 2026-10-03 / 2026-10-04

**OWNER CONFIRMED · SHARED KIT BUILT · SALES ORDERS ADOPTION AND CONFIRMED AUDIT CORRECTIONS PRODUCTION VERIFIED (2026-10-05).** Every module card
uses the kit [`CompactModuleCard`](../../apps/web/src/components/kit/CompactModuleCard.tsx) (live on
`/ui#compact-card` with Info and Delivery). Never copy reference HTML or CSS into a page. The
complete rules, the sample-data boundary and the deviations from the reference page live in
[`MODULE-CARD-TEMPLATE.md`](../ui-reference/MODULE-CARD-TEMPLATE.md); the reference page
`module-card-reference.html` is the proof target of `scripts/compact-card-states.mjs`
(25 states × 5 widths; reference parity evidence is distinct from business-page acceptance).

**Read the whole confirmed template before reuse.** This section is the shared entry point, not a claim that every Sales Order business workflow or every module has migrated. Read the single linked card contract, then Orders MASTER for full-page Items/Payment and Delivery MASTER for Customer/Logistics/DO business rules. Reuse `CompactModuleCard` and the source-owned adapter; never copy HTML/CSS, substitute sample facts, or assume another module has customer/SO fields. Other module adoption must verify its own source, permissions, states and full-page return path.

**Compact editor field skin and density — confirmed, deployed:** both universal border resets and button resets must exclude `data-kit` controls. The shared field recipe supplies visible 1px borders and 32px controls. Customer fields use two columns above 400px actual card width and one at 400px or below. Logistics crew shares a row; its condo textarea has two natural rows (48px in the accepted empty state), with no long hint. Keep source choice, evidence, ETA, failed-save input and actual business gates. One editor opens at once; Cancel then Save at right.

**Full Sales Order continuation — confirmed, deployed:** Orders MASTER owns the existing full-page layout. Remove only duplicate Quantity/category and Services prose below Items; retain line quantities, amounts and Total payable. Payment links use attachment icon + `Slip`, preserving both source-owned slip doors and the existing layout. Info `Balance due` agrees with the saved PDF; do not change amounts/calculation to match a visual proposal.

### Compact-card measurements — complete source lookup, 2026-10-05

**Scope and authority:** this table describes the existing shared compact card, not every full-page table or the whole kit. CSS px throughout; padding is vertical × horizontal unless otherwise stated. Source is `apps/web/src/components/kit/compact-card.module.css`, plus `DeliveryBrief.tsx`, `field-recipe.ts`, `PdfPreview.tsx` and `DialogFrame.tsx`. These are implementation measurements, not new independently editable token definitions. Canonical tokens remain in01; update source and this lookup together. Do not copy these values into a page-local stylesheet.

**Evidence key:** **Live** means measured on real SO-1368 after production2ce91e2d. **Source** means inspected current final cascade, not a fresh browser measurement. **Pending reference value** means implemented for fidelity but still subject to the existing token decision; recording it does not approve it globally. Natural content decides height; do not reserve four lines or freeze card/editor/section height.

| Element | Current measurement and relationship | Basis |
|---|---|---|
| Card container |100% of available width, maximum560px; inline-size container queries | Source; live560/440/416/396/366 |
| Outer card | Border1px; overflow hidden; natural height | Source |
| Card radius/font | Outer radius8px; system-ui; base13px/1.4 (18.2px line height); normal weight400 | Pending reference value |
| Reference control/inner-box radius | Native reference controls4px; summary/editor/menu boxes6px; kit controls retain canonical6px | Pending reference value versus canonical field recipe |
| General card glyph |16×16px, stroke1.7; contact glyph12×12px; address glyph stroke1.6 | Source; reference glyph decision remains pending |
| Header | Minimum56px, natural growth; padding6×12px; columns `minmax(0,1fr) auto auto 64px`; gap8px, vertically centred | Source |
| Identity layout | Text plus24px toggle column; row gap2px, column gap6px; right divider1px and8px inset | Source |
| Customer name |14px/18px, weight700; wrap long words; title-group gap10px | Source; card font/weight fidelity exception |
| Order/phone |11px; flex wrapping contact group gap4px; phone icon+number stays one wrapping unit, internal gap4px | Source |
| Sales chevron |24×32px; lower-right of identity; font12px, chevron11px/1; margin-bottom−7px; no visible label | Source |
| Address trigger column |38px high,6px right inset,1px right divider; bottom aligned; trigger11px/18px with4px icon/text gap | Source |
| Target date column |38px high; vertical gap2px, right inset8px/divider1px; date13px, icon gap5px, no wrapping | Source |
| Countdown | Canonical label11px/500/14px; white on dark Header, no badge fill; existing0×5px inset | Source; visible26d live5Oct |
| Header Open/Close |32×32px each; text-arrow/×18px; action column64px above460px | Source |
| Header colours | slate-12 background, white primary/countdown, slate-4 contacts, slate-11 dividers/hover; white2px focus outline with−2px offset | Approved source tokens |
| Sales-fact disclosure | Padding10×12px; grid1fr/1.55fr/0.75fr; gap12px;1px top rule; label11px, value12px/17px weight500; label/value gap4px | Source |
| Address disclosure | Padding8×12px; type12px;1px top rule; full-address icon gap6px; building/floor/lift group gap16px, top margin5px; fact internal gap5px | Source |
| Module navigation | Horizontal inset10px;1px top/bottom rules; tabs12px with8×7px padding; selected underline2px, weight600 | Source |
| Navigation disclosure icons |32×32px, padding8px; icon16px; active soft background/brand colour | Source |
| Body | Padding10px; white surface | Source |
| Summary strip | Equal columns based on actual1/2/3/4 facts, no column gap; border1px, radius6px; bottom margin8px | Source |
| Summary cell | Padding8px; natural height; right dividers1px except last; title row16px then natural value, gap4px, top/left aligned | Source |
| Summary type | Title11px/16px; main value12px/18px weight700; optional status11px/16px weight400 with4px top margin; Info value13px above400px | Source |
| Summary disclosure | Chevron at right of title row; active cell bottom inset accent2px; main value maximum4 lines, never4 reserved rows | Source |
| Inline editor | Padding10px; soft surface, radius6px, bottom margin8px; natural height | Source |
| Editor labels/error | Labels11px; reference margin7px top/3px bottom, compact kit labels margin0; error12px/16px with8px top margin | Source; error colour retains existing pending review |
| Native reference field | Type12px; padding7px, border1px, reference radius4px; default textarea minimum90px | Source, distinct from embedded kit fields |
| Canonical embedded field recipe | Single line32px, sides8px/radius6px, solid1px slate-5 border; focus blue-9 ring2px; multiline sides8px/top-bottom4px | Source field-recipe; see actual cascade below |
| Actual Select/DatePicker in card |32px high, padding0×8px, radius6px, solid1px slate-5; Select13px/18px, inherited system-ui | Live Select; DatePicker recipe/source and border live |
| Actual ETA Input/condo Textarea | `.panel input/textarea` still overrides recipe:12px system-ui, padding7px all sides, radius4px, border1px card-line. ETA32px; condo48px minimum | Live; recorded source-cascade discrepancy, not a canonical token change |
| Customer grid | Two equal columns, gap8px above400px card width; one column at400px or below; outer form stack gap12px | Source; five widths live |
| Logistics grid | Driver/vehicle two equal columns, gap12px; outer form stack gap12px; ETA full width; source/proof retained | Source; controls live within bounds |
| Compact condo textarea | Two rows, minimum48px; grows with content; omit long hint | Source; empty48px live |
| Editor actions | Cancel then Save, right aligned; gap6px, top margin10px; minimum32px, type12px, padding6×10px | Source; live visible through366px |
| DO checklist | Single column; one condition per line; grid gap4px vertical/12px horizontal, top margin8px; line internal gap8px; type12px, indicator16px | Source; live read-only conditions |
| Compact generic items |100% width, fixed layout, separate borders/spacing0; cells6px; header11px/500, body12px; bottom rules1px, none after last row | Source |
| Generic item column hints | Source first55%, second10%, third38%; these are CSS hints, not additive exact pixel widths (total103%). Do not reuse them as a full-page table-width contract | Source; retained fidelity limitation |
| Info goods table |100% width, auto table layout; cells7×6px; header11px/500, body13px; first body cell50%; numeric cells right/no-wrap; row rules1px; config11px | Source |
| Communication/Timeline section | Top rule1px; section padding10px; head padding8×10px, margin−10px sides/top and10px bottom; header/body natural height | Source |
| Section title |14px, inherited1.4 line height, weight700 | Source; reference fidelity, not global Block title token |
| Channel select |112×32px; padding4×8px, type12px;1px border, native radius4px | Source |
| To/Subject row | Label column48px + flexible field, gap8px; row margin8px vertical; label11px; input32px high | Source |
| Message toolbar | Internal gap8px; margin8px top/4px bottom; menu trigger32×32px | Source |
| Message input |80px high/minimum, vertically resizable, full width | Source |
| Template menu |190px wide,4px inset, top36px, right0; border1px/radius6px; shadow0 3px 12px black13%; menu rows8px inset,12px type | Source |
| Template picker/manager | Picker padding8px/bottom margin8px; manager padding10px/top margin8px;1px border/radius6px; template rows6px vertical, gap8px | Source |
| Naming dialog | `min(320px,100vw−32px)`; padding12px; border1px/radius8px; backdrop rgb(20,30,40)/25%; actions top margin12px | Source |
| Attachment evidence | Trigger32×32px/border1px; row gap6px/margin8px vertical; chips11px, padding4×6px, gap6px, native radius4px, wrap within card | Source |
| Timeline event | Padding8px vertical, gap8px, type12px; subsequent events top rule1px | Source |
| Actor avatar |28×28px circle;1px border; initial11px/600; actor name accessible, no repeated visible name | Source; live |
| Event metadata/result | Metadata/time11px, gap8px; title12px; time no-wrap, full instant retained; result12px, top margin2px | Source; live recorded time without MYT |
| Compact Drawer | No second visible container header; body0 inset with vertical scrolling; card owns visible identity/Close; Drawer owns focus/Escape/backdrop/return | Source |
| PDF title/action header | Gap8px, bottom margin8px; flexible wrapped title13px/18px weight600; actions shrink0/gap8px; Close uses existing icon-only Button32×32px at viewport≥768px and40×40px below768px (iconOnly overrides small-button height); Button requests14px icon, while the enclosing card SVG cascade is16px | Source, distinct from32px card Header × |
| PDF zoom/render region | Controls on next row, gap8px/bottom margin8px; PDF pane flexes/scrolls. Paper height depends on actual document and zoom, no card-local fixed height | Source |
| Full-page continuation | Use existing Block/DocumentTable/TotalsSummary/field recipes in§6.0 and Detailed composition measurements; Slip uses the existing inline link-button with16px attachment icon,6px icon/text gap,13px/18px body text/weight500; not a new input or card | Source; Orders owns business grouping |

**Responsive rules — actual card width, not viewport width:**

| Width condition | Existing change |
|---|---|
| Card≤460px | Header inset6×8px, gap5px; columns `minmax(0,1fr) 28px auto 60px`; hide only the address-place word on its icon trigger; order text10px; title gaps2px/6px; sales-fact horizontal inset8px |
| Card≤420px | Reference arrange split becomes one column; original-date divider becomes bottom rule with8px bottom inset; event metadata wraps; sales-fact columns1fr/1.4fr/0.65fr, gap8px; Info items cells7×3px/type11px |
| Card≤400px | Four-fact strip becomes2×2; right divider removed from second cell; three-fact Info strip remains three columns; Info value12px/title11px; compact Customer fields one column |
| Five verified card widths |560/440/416/396/366px; actual dimensions checked. Do not equate them to identical viewport sizes in a Drawer or reference page |

**Recorded field-cascade limitation:** excluding `data-kit` from border/button resets restores Select/DatePicker skin, but the existing `.panel input/select/textarea` rule still overrides font, padding, radius and border colour of native Input/Textarea. Do not claim all fields already use canonical skin unchanged; the actual dimensions above are the current implementation. This documentation commission does not authorise another visual change. Keep this discrepancy visible for a governed source correction rather than silently copying it to another module.

**Surface values still awaiting the existing token decision:** source CSS variables are background#f3f5f7, surface#fff, soft#f0f3f6, ink#202631, muted#596370, line#d8dde5, brand#006ac2, select-line#d5dce6, select-ink#172033, missing#64748b, disabled-fill#e8ebef, info-muted#536175, table-head#f1f3f5, toggle-hover#e7edf4, error#ce2c31. These describe the reference-fidelity block only; the approved dark Header and embedded kit field tokens override it in their own scopes. Do not spread these literals to another page or claim the pending full-card token conversion has been approved.

**Height evidence:** `docs/ui-reference/module-card-measurements.json` records the historical25-state×5-width reference parity run at viewport height900px. Its card/section heights and reference source hash are evidence of that run, not fixed heights for the current card, current business editors or current copy. The real production editor acceptance above records controls and layout; long names, wrapped values, errors/evidence and open sections can increase height. Never recreate a fixed total height from a screenshot.

**Latest confirmed-correction release proof — 2026-10-05:** PR1893 adds compact form density and removes duplicate Items prose; PR1896 corrects the stale Customer build record; PR1897 preserves kit control borders. Final merge `2ce91e2d0ce7b118cfd7bb95c2b8e6974233ad3f` passed full CI37212809683 and deployment37213753695. Independent ERP, POS, both Pages version endpoints and API health matched that SHA. Actual SO-1368 Customer and Logistics controls have solid1px borders; selects/inputs32px, empty condo textarea48px. Actual card widths560/440/416/396/366 were verified: Customer two/two/two/one/one columns, visible fields/actions within bounds. Cancel leaves the saved summaries unchanged. Related shared/form tests cover one editor, save success folding, save failure input retention and source/recorder distinction; no real customer agreement was saved for acceptance. Full-page Items retains quantities1/1/2 and totalRM2,759; paidRM1,380 and balanceRM1,379 remain. Both Slip links have attachment icons. The real PDF renders with its titled toolbar; Close PDF keeps the order and returns focus to the SO number, Close order returns to View. Dark header/countdown, sales facts, address, module summary, Items, Communication and Timeline were rechecked top to bottom on this release. Timeline shows recorded time without MYT and actor avatar without repeated visible name. Source contracts and this proof are authoritative; a screenshot alone is not a second template.

**SO file preview — owner approved 2026-10-04:** The source-owned preview uses the shared `PdfPreviewHeader`: `Sales order PDF · {actual SO number}` at left, existing saved-document `Download` and `Close PDF` × at right. Zoom stays on the next row, then the actual PDF. Identity and Close remain available during loading/error; Download is disabled until its saved Blob exists. No separate Close row. Close PDF returns to Info and focuses the SO number; the dark Header `Close order` × closes the whole Register Drawer and returns to its opener. Neither control saves business facts or changes current/historical issued documents.

**Shared Header colour — owner approved 2026-10-04:** use existing Radix slate-12 background, white primary text and countdown, slate-4 contact text, slate-11 dividers/hover. Countdown uses the existing label token (11px/500/14px), with no pale badge fill. Focus is visibly white inside the dark header. Only the identity Header changes; address details, tabs, summary and body stay light. Every CompactModuleCard consumer inherits this treatment; no per-module copy. This scoped approval does not decide the remaining card palette, font or radius.

In one line each: one shared customer header with sales facts behind a ▾/▴ (no words), address with
its own toggle, target date, Open and Close; the source-owned SO number lazily opens the saved formal document; Info opens sales facts and address, other modules start
closed; summary cells are label above value, left aligned, only the module's own facts (Info
`Total · Paid · Balance due`, Delivery `Stock · Logistics · Customer · DO`, the Customer cell ruled by Delivery MASTER); title row, value
and optional status line are top aligned on common baselines with the ▾ at the right; values take the
fewest lines, four at most; one editor at a time, folded on success, kept on failure, `Cancel` then
`Save` at right; DO one condition per line; items, Communication and Timeline start closed; times show
without a zone suffix while the full instant is kept; nothing in a module repeats the header, a date,
the sales facts or a completion note.

**Earlier register/navigation production acceptance — 2026-10-04:** PR1888 exact head
`dd581fb3139b9539216f1f1c9ddc25b107e3d4a5` passed full CI37207794735 and deployed as
`36d96ac427f059901f6fdf2d623bd6277adeb611` (Deploy37208534384); independent verification matched
all five revision surfaces. Orders MASTER owns the measured existing-path matrix and boundaries.
On that release, the real Carres Kota Damansara + Mattress October door opens only SO-1368;
loaded reload and Table → Cards retain its visible conditions and blank search. At390px removing
only category opens SO-1368 + SO-1358 while retaining the same location/month.121 Register/monthly
UI checks and16 shared arithmetic checks cover additional combinations;45 baseline report checks
remain fixture evidence. Purchasing retains responsibility for its equivalent month door.
Supporting PR1883/7f662b5 proof verifies real390px History long-note expansion/Escape without nested
buttons or page overflow, original/current Revisions and Cards/search return. A live Revisions
long-note sample was absent;136 functional checks prove its cut-note/no-version-action variant.
Priorf7857f6 retains completed/open Delivery, Monitor, widths and formal-object proof;086f23d retains
source/template/context/monthly evidence. PR1879's approved header/Balance due law remains preserved.
Live Save/send, Print/Download, Workspace/other-module adoption and all-role historical/exception
variants remain outside this proof. This acceptance does not certify the whole module.
A /ui result alone does not prove a business entry; the actual Orders entry supplies this evidence.

**Open, recorded, not approved:** palette, font, radius and glyphs are the reference's own (token
decision pending); 40px phone touch targets shown for review only; the editable `To` differs from the
Work panel's recorded-channels-only rule.
