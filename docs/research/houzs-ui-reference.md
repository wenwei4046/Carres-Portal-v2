# Houzs UI reference — research evidence

> **FACT file. It binds nobody.** These are measurements and inventories taken from the Houzs ERP
> (`Houzs-Century/Houzs-ERP`, reference commit `ecce2e9676acc555efa8b2c30e78052b2ab54749`, plus
> read-only observations of live pages) and from local review samples, 2026-10-01. They were moved
> here unchanged from UI MASTER on 2026-10-05 so the MASTER holds only current Carres law.
>
> Carres law lives in [`docs/ui/MASTER.md`](../ui/MASTER.md) (§1.3 states the owner's Houzs-first
> direction and its limits). Carres numbers live in [`docs/01-design-tokens.md`](../01-design-tokens.md).
> Nothing below is a Carres token, an approved layout or permission to copy source code: no Houzs
> source item has cleared rights, dependencies, security or data compatibility, so none is
> COPY REQUIRED. Houzs tests were not run; live deployment SHAs are unknown; 2990 parity is unknown.

## 1 · Source inventory and copy boundary

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

## 2 · Top-to-bottom coverage map and measured examples

**FACT / REFERENCE AUDIT; CARRES ADAPTATIONS BELOW ARE PROPOSAL / NOT LAW / NOT BUILT.**
This is an audit coverage map derived from the inspected reference sources, not a claim that
Houzs publishes this checklist or has a single uniform UI kit. Source paths below are relative
to `frontend/src/` at the reference commit above. Directory inventory is not behaviour validation.
Existing Carres authority remains binding; proposed gaps do not authorise page-local components.
The design-system skill is used to separate tokens, components, patterns and interaction states.

### Why the two owner-selected surfaces read differently

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

## 3 · UX pattern inventory (UX01–UX12)

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

## 4 · Inventory density and filter placement

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

## 5 · Sales Order quick-view measurements (reported by the Sales PLAN review)

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

## 6 · Service Case detail composition (owner-selected reference)

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

## 7 · Three-module alignment snapshot (source inspection at `86046dde`)

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

## 8 · Colour contrast of palette pairs

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

## 9 · Local review samples and runtime exercises (local artefacts, not distributed)

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
The local samples were never distributed in the repository; a new chat on another host must not
claim it viewed them from this URL. `inbound-flow.html` and `warehouse-ui-preview.html` were not
accepted by the owner as build references (UI MASTER §7.6). Source entry names above and measured evidence below remain available.

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
