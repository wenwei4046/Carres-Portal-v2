# 02 · Components

**Current shared target · owner instruction 9 Oct 2026.** Appearance comes exclusively from `01-design-tokens.md` and `ui/carres-tokens.css`. Replace existing kit internals; never create page-local copies. Existing component APIs and business contracts remain until deliberately migrated. Prototype HTML is a specimen, not application implementation.

## Component register

| Component family | Existing home / adapter | Current contract |
|---|---|---|
| Page shell and header | PageShell, GlobalTopBar, ModuleHeader | Conditional navigation/summary/tasks regions; current shell tokens |
| Navigation | PortalSidebar and portal-nav | Orange selected row; authorised module tree; scroll without shrinking rows |
| Register | components/register/DataGrid | Current two-line minimum row; shared sort/filter/resize/select/group/expand capabilities |
| Bounded / goods tables | DataTable, DocumentTable, GoodsMiniTable | Shared tokens; preserve source-specific quantities and connected records |
| Object header / tabs | Existing module object adapters and Tabs | Identity, status, owner, authorised actions, module-specific views |
| Card / sections | Block, SectionHeader, CompactModuleCard | Light bordered surface, plain facts, headings; no alternate module palette |
| Working Panel | Drawer and CompactModuleCard | Host-owned identity; Info plus module-owned work; retained draft; current visual tokens |
| Tasks | Existing work components and right-rail adapter | Task, reason, owner, deadline, proof, recorded outcome and next action |
| Buttons / menus | Button, DropdownMenu, Popover | Charcoal primary; secondary outlined/quiet; accessible icon controls |
| Inputs | Input, Textarea, Select, Checkbox, DatePicker, FieldFrame | Shared dimensions and validation; preserve valid input on failure |
| Status / count | StatusPill and Badge | Soft semantic status pairs; Hold dark; words never truncated; counts separate |
| Evidence / PDF | SavedEvidenceViewer, PdfPreview | Saved source versus draft evidence; failure and retry; no invented document |
| Dialog / drawer | Modal, DialogFrame, Drawer | Focus trap, Escape where safe, focus return; no hidden unsaved loss |
| Feedback | Toast, EmptyState, Loading | Outcome-specific words; errors beside affected action; no false success |
| Route / history | RouteStop, QuietRouteRow, ChecklistRow, module history adapters | Actual source-owned facts; parallel paths; immutable recorded events |
| Settings | Shared page/row/form components | Plain row groups; edit mode, access, current value, treatment and history |

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

The ZIP supplies Shell, Sales Order list, object, Route, Timeline and a component specimen. Phone/tablet, complete failure states, every module adapter, shared runtime migration and authenticated production acceptance are not proven by this import. /ui and complete pages must be checked under UI MASTER §2.2 before claiming adoption. Approval, implementation, deployment and verified operation are separate.

## Appearance picker · current target

Shared personal preference model: `lib/appearance.ts`, `AppearanceSync`, Settings → Appearance. Theme and focus use native labelled radio groups and the current token selectors; no approval or reason field. Save writes only authenticated user's `user_metadata.appearance`; shared shell reapplies it on login and resets on account switch/sign-out. Theme choices and display words are sourced from current source UI Kit §9.

The shared Button exposes its existing variant as `data-variant`; the current primary adapter remains charcoal for all themes. Shared DataGrid/DataTable/DocumentTable use separate header, row and footer line tokens.

## Shared adoption map — one implementation per purpose

| Source part | Reuse / configuration | Scope and acceptance |
|---|---|---|
| Menu and shell | PortalSidebar, portal-nav, shared header adapters | One permission-filtered tree on list, object, Workspace and Settings; only selection changes. Logo, 220/64 widths and tokens from 01. |
| Listing | register/DataGrid and column registry | Module supplies grain, columns, data and allowed actions; preserve sort/filter/resize/select/group. SO target has Open/Delivered/All and column views; do not add a Table/Cards switch to this supplied SO composition. |
| Selection tools | Existing selection toolbar configuration | Replaces ordinary tools in the same area; count and quantities use the current scope; supported export/print only. |
| Summary | Existing source-summary composition | Collapsible 240px region; module supplies verified facts and drill-through, no invented KPIs. |
| Tasks | Existing Work source and shared task host | Collapsible 320px region; row opens exact owning action; save/result must follow that source's permissions and completion. No second engine or generic Done. |
| Complete object | Module object adapters plus Tabs/Block | Identity, authorised actions, source facts, Route and Timeline where relevant; not a cloned SO page for every object. |
| Documents | PdfPreview/SavedEvidenceViewer with Drawer or Modal | Real saved version, loading/failure/retry, focus return; document is not an editor. |
| Compact facts | Existing property-row/field compositions | 01 §5.1 density, labelled text until Edit; one shared recipe, no module-local skin. |

Existing source names are entry points, not proof the latest visual target is built. A missing
API is recorded as KIT GAP; later implementation extends the same family with a `/ui` example.
The imported HTML/support.js demonstrates interactions only and is never the runtime component.

## Behaviour contracts retained through the visual replacement

- **Button/overlays:** existing variants remain API-compatible and read current tokens. Button
  forwards its DOM ref so menu, tooltip and popover anchors remain correct. Loading/disabled
  and keyboard focus are distinct. A navigation link is not a business-action button.
- **Checkbox:** label activates the whole hit area; table controls require an accessible name.
  Select-all preserves checked/unchecked/indeterminate and the exact authorised selection scope.
- **Select:** chooses a value; DropdownMenu performs an action. Input/Select share field skin,
  labels and validation. Use existing options-data API and keyboard behaviour; long choice sets
  need the existing searchable control. Do not remove a permission or validation to match a mock.
- **DropdownMenu/Popover:** trigger, floating content and labelled items; keep keyboard navigation,
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
