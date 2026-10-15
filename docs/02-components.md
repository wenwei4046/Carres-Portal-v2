# 02 · Components

**Current shared target · owner instruction 12 Oct 2026 · supplied 12 Oct.** Appearance comes exclusively from `01-design-tokens.md` and `ui/carres-tokens.css`. Replace existing kit internals; never create page-local copies. Existing component APIs and business contracts remain until deliberately migrated. Prototype HTML is a specimen, not application implementation.

## Component register

| Component family | Existing home / adapter | Current contract |
|---|---|---|
| Page shell and header | PageShell, GlobalTopBar, ModuleHeader | Conditional navigation/summary/tasks regions; current shell tokens |
| Navigation | PortalSidebar and portal-nav | Selected item is a white pill with theme text at 500; authorised module tree; scroll without shrinking rows |
| Register | components/register/DataGrid | Current two-line minimum row; shared sort/filter/resize/select/group/expand capabilities |
| Bounded / goods tables | DataTable, DocumentTable, GoodsMiniTable | Shared tokens; preserve source-specific quantities and connected records |
| Object header / tabs | Existing module object adapters and Tabs | Identity, status, owner, authorised actions, module-specific views |
| Card / sections | Block, SectionHeader, CompactModuleCard | Light bordered surface, plain facts, headings; no alternate module palette |
| Working Panel | Drawer and CompactModuleCard | Host-owned identity; Info plus module-owned work; retained draft; current visual tokens |
| Tasks | Existing work components and right-rail adapter | Task, reason, owner, deadline, proof, recorded outcome and next action |
| Buttons / menus | Button, CMenu and CPopover (`carres/CPopover`) | One `#1B1B39` main button per area; white word buttons; round icon-only buttons with no border; one 250 menu design for every ⋮, columns and filter menu |
| Inputs | Input, Textarea, Select, Checkbox, DatePicker, FieldFrame | Shared dimensions and validation; preserve valid input on failure |
| Status / count | StatusPill and Badge | Soft status pairs; Hold dark; in table rows a pill only for amber and green, plain text otherwise; words never cut; counts separate |
| Evidence / PDF | SavedEvidenceViewer, PdfPreview | Saved source versus draft evidence; failure and retry; no invented document |
| Dialog / drawer | Modal, DialogFrame, Drawer | Focus trap, Escape where safe, focus return; no hidden unsaved loss |
| Feedback | Toast, EmptyState, Loading | Outcome-specific words; errors beside affected action; no false success |
| Route / history | RouteStop, module history adapters | Actual source-owned facts; parallel paths; immutable recorded events |
| Task steps | StepList, Step | The numbered steps of one job (owner's 12 Oct 2026 package): a 20px round mark, a 13 / 500 title, one 12 grey line and the step's own controls, a hairline between steps. Done is green with a tick, the step to do now is dark, a later step is white with the chip border. The marks show where the person is and never record anything; the act stays one named button. A step's button drops under its words when the room is narrow (the Tasks panel at 320), so neither is squeezed or cut |
| Task view | TaskView, TaskToast | The ONE shape of an opened task (owner's round 3 brief, 13 Oct 2026; 03 §8): the task at 13 / 500; its module icon, page and record with the owner's initials at the right, the record being the door to its page; one row per fact in one grid (icon 16, label as wide as the longest and at most 104, then the value), amber only on the fact that has gone by, and a fact may open its own detail under its row; then the segmented tabs. The first tab is the owning module's work and stays mounted; another tab is drawn when it is first opened. The view reads nothing, writes nothing and closes nothing. `TaskToast` is the dark toast after a task closes (01 §3): bottom centre, 12 seconds, `Next: {party} ›` when another task waits, ✕, never `Undo` |
| Settings | Shared page/row/form components | Plain row groups; edit mode, access, current value, treatment and history |

## Runtime reuse directory · 15 Oct 2026

| Need | Existing shared entry | Rule |
|---|---|---|
| List, selection, sort, filter, expansion | `register/DataGrid`, `register/ItemRows` | One listing engine; no CTable or copied HTML table |
| Model/specification cells and list totals | `carres/CCell`, `carres/CListFooter` | Module supplies facts; shared renderer supplies presentation |
| Detail order lines | `carres/COrderLines` | Different job from a register; preserve order-line arithmetic |
| View, panel and icon tools | `carres/CToolbar`: CViewButton, CShowPanelButton, CIconButton, CChip | Reuse the exported control; do not rebuild its wrapper/skin per page |
| Menus and small floating panels | `carres/CPopover`: CMenu, CMenuItem, CMenuGroup | Retired DropdownMenu/kit Popover are not alternatives |
| Status rendering | `carres/CPill`, `kit/StatusPill` | Two caller-tone adapters already share PILL_SHAPE and kit/tokens; one visual implementation. `/ui` shows the current CPill gallery once. |
| Forms, dialogs, documents, task view | Existing `kit/` families in the register above | Preserve behaviour and source ownership during visual adoption |
| Glyphs | `carres/MIcon`, semantic `kit/Icon` adapter | One approved glyph family; preserve semantic names, accessible labels and consumer APIs |
| Live catalogue | `pages/dev/UiShowcase.tsx` at `/ui` | Imports actual runtime components with TEST examples; it is not a separate implementation |

### Source-checked control contracts

These describe the measured implementation, not new approved values. The acceptance gaps remain in the existing handoff matrix.

| Entry | Preserved caller API and behaviour | Measured adoption boundary |
|---|---|---|
| `kit/Button` | `variant=primary/neutral/ghost`, `size=md/sm/touch`, `iconOnly`, `shape`, semantic `icon`, `loading`; forwards its ref and native button props. Busy disables input. No caller `className`/`style` skin. | Desktop md32/sm28/touch36; below768 all44. Icon-only32 desktop/44 narrow, actual glyph20; word glyph18. Main600, disabled45%; neutral hover #EDEFF2; icon hover .10/pressed or open .16. md consumer roles still require migration review against default34/panel30 law. |
| `carres/CPopover` | Controlled/uncontrolled open; trigger, label, align, explicit width, menu/panel roles. CMenu consumes command data and returns focus; disabled commands do not invoke actions. CMenuItem retains checked/strong/note adapters. | Default menu250 with available-viewport cap; explicit picker widths retained. Item32 desktop/44 narrow, ordinary13/400, selected/strong500, disabled45%. |
| `tasks/TaskFiles` | Owning module supplies lazy `TaskFile.load`; View and Download use that reader. Viewer retry calls the same reader, retains failure on a second rejection, and ignores stale responses after close/file change. | `work-preview` seeds only its exact order's existing Sales Order data reader. `file=failed`/`file=retry` exercise source failure. Fixture rendering is not production permission or document acceptance. |
| `kit/Modal` task-wide review | Existing full-surface task review uses `variant="task-review"` through the same DialogFrame as other modals. Full viewport, no duplicate visible header/Close/padding; the owning form retains Save/Cancel, draft, submission and result rules. Escape/outside do not discard this review. | `useTaskDesk.host.openReview` serves BatchPanel, SupplierAnswerTaskPanel and the PO-duty/Delivery task adapters. Shared Radix focus trap, background isolation, scroll lock, return focus and dialog-contained pickers replace its hand-written portal. `/ui` Dialogs includes the actual shared variant with TEST input. Ordinary Modal/Drawer dismissal is unchanged. |
| `kit/field-recipe` / `floating-surface` | Existing controlClass single/multi/pill/toolbar shapes, labels, validation and source callbacks remain. Interactive controls have min-height44 below768; CONTROL_BASE remains height-free for callers that skin read-only facts. Select list options also have mobile min-height44, disabled45%. | Personal `/ui`390 measurement: input/error/Select/search/date44, textarea68; three Select options44, disabled opacity.45, page390. Desktop1440 single fields32. Actual Delivery task date/time/source triggers44 at390, no page overflow. Calendar day/nav and Monitor rail's 216-wide/28-day adapter remain a separate mobile acceptance gap. |

Direct absolute-import inventory (15 Oct source scan, excludes test/spec, `src/dev` and `pages/dev`, does not count relative imports or re-exports): Button131 files; CPopover17; Icon29; DataGrid54; ItemRows4; TaskView2; StatusPill19; CPill3. These are source consumers, not accepted pages. ItemRows callers are Outright, SO Batch by order/by supplier and Forecast; TaskView callers are TaskFrame and its task-view adapter. Preserve their different capabilities before retirement.

**Retirement state:** CTable, DropdownMenu, kit Popover, unused Card, GridToolbar,
ChecklistRow and QuietRouteRow are already retired in the mainline source. Do not recreate them.
Btn, Field and PageHeader are legacy contracts blocked from new adoption; remaining consumers
move with their page. CPill/StatusPill are adapters over one pill drawing; generic Block/specialised side-panel surfaces require
capability review rather than deletion by name. Keep the remaining work in the existing handoff.

## Reuse rules

- Keep existing record-opening contracts from the owning module; the downloaded SO full-page door does not change every register into an SO page.
- Do not clone `support.js`, mock storage, TEST permissions or sample records into production.
- Existing retired Btn, Field and PageHeader stay retired; their replacements remain shared kit components.
- One Icon adapter, one status component, one field recipe and one grid engine across modules.
- Long addresses wrap; dates, amounts, statuses and linked document identities remain readable.
- Team identity uses initials plus accessible full name/role and a keyboard/touch-reachable tooltip; avatar colour is supplementary. Record the actual person who acted separately from owner and cover.
- A missing shared component is admitted here with its /ui example and checks, not drawn privately.

## Required states and behaviour

| Family | Checks |
|---|---|
| Every data region | Loading, empty, no matches, failed read, denied, incomplete setup, partial data |
| Form / action | Unchanged, valid/invalid, uploading, upload failure, saving, save failure, conflict, success, historical lock |
| Register | Filters and selection retained; full document links; expansion counts use module meanings; internal overflow |
| Dialog / panel | Keyboard entry/exit, labelled controls, visible focus, return to invoking element |
| Settings | Allowed editor can configure missing approved values; denied user cannot edit; scheduled versus effective distinguished |

## Implementation status

The 11 Oct ZIP supplies a shared Shell, a shared Table, the Sales Order list and detail with Order Route, Timeline, amendment and SO PDF, Purchasing on the same template, Settings → Appearance and a component specimen. Phone/tablet, complete failure states, every module adapter, shared runtime migration and authenticated production acceptance are not proven by this import. /ui and complete pages must be checked under UI MASTER §2.2 before claiming adoption. Approval, implementation, deployment and verified operation are separate.

## Appearance picker · current target

Shared personal preference model: `lib/appearance.ts`, `AppearanceSync`, Settings → Appearance. Theme is one labelled choice group drawn as theme chips (01 §9) on the current token selectors; no approval or reason field. The Focus choice is removed from the target; keyboard focus is the one rule in 01 §3. Default theme `blue`. Save writes only the authenticated user's own `user_metadata.appearance`; the shared shell reapplies it on login and resets on account switch or sign-out. Theme choices follow 01 §9; display words follow COPY.

The shared Button exposes its existing variant as `data-variant`; the current primary adapter remains charcoal for all themes. Shared DataGrid/DataTable/DocumentTable use separate header, row and footer line tokens.

## Shared adoption map — one implementation per purpose

| Source part | Reuse / configuration | Scope and acceptance |
|---|---|---|
| Menu and shell | PortalSidebar, portal-nav, shared header adapters | One permission-filtered tree on list, object, Workspace and Settings; only selection changes. Logo, 220/64 widths and tokens from 01. |
| Listing | register/DataGrid and column registry | Module supplies grain, columns, data and allowed actions; preserve sort/filter/resize/select/group. SO target has Open/Delivered/All and column views; do not add a Table/Cards switch to this supplied SO composition. |
| Selection tools | Existing selection toolbar configuration | Replaces ordinary tools in the same area; count and quantities use the current scope; supported export/print only. |
| Summary | Existing source-summary composition | Collapsible 264px region; one white card per section, rows 32; module supplies verified facts and drill-through, no invented KPIs. |
| Tasks | Existing Work source and shared task host | Collapsible 320px region; row opens exact owning action; save/result must follow that source's permissions and completion. No second engine or generic Done. |
| Complete object | Module object adapters plus Tabs/Block | Identity, authorised actions, source facts, Route and Timeline where relevant; not a cloned SO page for every object. |
| Documents | PdfPreview/SavedEvidenceViewer with Drawer or Modal | Real saved version, loading/failure/retry, focus return; document is not an editor. |
| Compact facts | Existing property-row/field compositions | 01 §5.1 density, labelled text until Edit; one shared recipe, no module-local skin. |

## Shared pieces of the current kit — where each lives

The current adoption map is a reuse contract, not a second kit. Source-checked on 15 Oct 2026 against `pages/dev/UiShowcase.tsx` and the existing component files. A KIT GAP is not permission to invent a page-local component; extend the owning family once and expose it on `/ui`.

| Specimen piece | Home | State |
|---|---|---|
| Shell: menu, top bar, toolbar row, Summary, Tasks, Settings → Appearance | PortalSidebar, PageShell, shared header adapters, ShellTasks | Extend the one shell |
| Table: header, list row, group row, item row, ticks, footer, frozen identifier | register/DataGrid | Extend the one engine; a module passes columns |
| Detail page: header, tabs, cards | DetailShell, Tabs, Block | Generic object header remains a KIT GAP (UI MASTER §7.3) |
| Button · IconButton | Button | Word button is a box; icon-only is round with no border (01 §3) |
| Pill | StatusPill | One status component |
| Menu | `CMenu` (items as data) or `CPopover role="menu"` + `CMenuItem`; `CPopover` (dialog) for a small panel | One menu design (01 §3); `DropdownMenu` and kit `Popover` retired 15 Oct 2026 |
| Card · FieldRow | Block (the one card), field-recipe | Field rows 36, label 150 (01 §5.1) |
| Tabs · SegmentedControl | Tabs | Segmented look (01 §3) |
| Toast | Toast | Bottom centre (01 §3) |
| Selection bar | DataGrid `selectable` (the engine draws it) | Replaces the toolbar in place |
| Choice chip | `carres/CToolbar.CChip` | Existing shared choice chip; reuse current API. Theme-choice adoption remains governed by 01 §9, not inferred from the existence of CChip. |
| Link: record number | PoNumberLinks and module link cells | KIT GAP: one shared record link |
| Avatar | none | KIT GAP (UI MASTER §7.3) |
| Item-row control | none | KIT GAP |

Behaviour the specimen fixes for every module:

- A row click opens the record; the tick, in-row controls and selecting text do not. Ctrl or ⌘ click opens a new tab. Back returns to the same scroll position.
- Hover, pressed, open and disabled follow 01 §1. A button whose menu, form or panel is open keeps its pressed grey and is never the selection colour.
- A record number in a card or task is the link that opens it; there is no separate Open button.
- Menus, dialogs and toasts are never clipped by a parent.
- Print and Download print only the document page, never the whole application.
- Parent list cells, expanded goods and detail order lines follow their distinct 01 §5 contracts. Only the approved customer-name second line may use ellipsis, with full hover/record access; never apply a generic wrap rule that changes every table.

Existing source names are entry points, not proof the latest visual target is built. A missing
API is recorded as KIT GAP; later implementation extends the same family with a `/ui` example.
The imported HTML/support.js demonstrates interactions only and is never the runtime component.

## Behaviour contracts retained through the visual replacement

- **Button/overlays:** existing variants remain API-compatible and read current tokens. Button
  forwards its DOM ref so menu, tooltip and popover anchors remain correct. Loading/disabled
  and keyboard focus are distinct. A navigation link is not a business-action button.
- **Checkbox:** label activates the whole hit area; table controls require an accessible name.
  Select-all preserves checked/unchecked/indeterminate and the exact authorised selection scope.
- **Select:** chooses a value; a menu (`CMenu`) performs an action. Input/Select share field skin,
  labels and validation. Use existing options-data API and keyboard behaviour; long choice sets
  need the existing searchable control. Do not remove a permission or validation to match a mock.
- **CMenu/CPopover:** trigger, floating content and labelled items; keep keyboard navigation (↓, Enter or Space open a menu on its first command; ↑ ↓ Home End move; Escape or Tab close it and return focus to its button),
  safe dismissal and focus return. A row menu acts on its row, a selection bar on its selection.
- **PdfPreview/PdfPreviewHeader:** caller supplies the actual rendered/saved PDF URL and owns its
  lifetime. Preview never issues a document or fetches business facts. Fit/zoom and contained
  scrolling remain; source change/retry/unmount cancel stale paints and release worker resources.
  Ready means all pages painted. Loading, decode failure and Retry are distinct from business
  success. Source header keeps identity, permitted download and Close reachable.
- **SavedEvidenceViewer:** authorised source supplies stable file IDs, media kind, signed URL and
  recorded context/Unit associations. Viewer does not list storage, widen access, upload, delete
  or rewrite evidence. Known-but-unreadable files show failure; truly empty evidence has no fake
  opening door. Retry calls the owning reader. Switching file resets zoom and cannot be replaced
  by a late retry. Retain photo zoom/drag/reset, video playback, previous/next and focus return
  after fullscreen. Never infer Unit attribution from receipt-level photos.
- **CompactModuleCard:** host passes identity once plus module facts, editors/items and source
  events; `presentation="embedded"` reuses the same SO adapter. Card never writes another
  module's record, uploads evidence or marks a message sent. Editors close only on confirmed
  save success; failure keeps the draft. Standalone/embedded defaults stay in MODULE-CARD-TEMPLATE.
  `CardEditorButtons`, `CardChecklist` and `compactCardStyles` remain reuse entry points.
- **Icon:** reuse the existing semantic-name adapter. Current font/glyph family and measurements
  come from 01; historical Lucide dimensions do not override the new visual target. Missing
  meanings join the shared registry once, never a page-local icon map.

These contracts preserve useful supported behaviour, not retired colours, font sizes or geometry.
Current source APIs must be checked before calling any family fully adopted.

## Current catalogue boundary · owner cleanup 15 Oct 2026

`/ui` presents the current design once per purpose: DataGrid and its cells/footer/expansion,
COrderLines, one pill gallery, toolbar, Summary, icons, fields, menus, tabs, dialogs, feedback,
documents/evidence and TaskView/StepList. The old dark-header compact-card preview, older extra
register demos, duplicate StatusPill gallery, RouteStop/Block task composition, placeholder task
words, dated import counts and obsolete CTable migration note are removed from the catalogue.
This retires demonstrations, not the business APIs still used by module pages. Internal sample
actions are explicitly TEST-only and do not save records. Remaining module migrations belong
in the existing delivery handoff, never as competing styles at the bottom of `/ui`.
