# 02 · Components

**Current shared target · owner instruction 11 Oct 2026 · supplied v12.** Appearance comes exclusively from `01-design-tokens.md` and `ui/carres-tokens.css`. Replace existing kit internals; never create page-local copies. Existing component APIs and business contracts remain until deliberately migrated. Prototype HTML is a specimen, not application implementation.

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
| Buttons / menus | Button, DropdownMenu, Popover | One `#1B1B39` main button per area; white word buttons; round icon-only buttons with no border; one 250 menu design for every ⋮, columns and filter menu |
| Inputs | Input, Textarea, Select, Checkbox, DatePicker, FieldFrame | Shared dimensions and validation; preserve valid input on failure |
| Status / count | StatusPill and Badge | Soft status pairs; Hold dark; in table rows a pill only for amber and green, plain text otherwise; words never cut; counts separate |
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

## v12 shared pieces — where each lives

The 11 Oct specimen names three shared pieces and a component list. Each has one home. A piece marked KIT GAP has no shared component in `components/kit` on 11 Oct; it is admitted once with its `/ui` example, never drawn inside a page.

| Specimen piece | Home | State |
|---|---|---|
| Shell: menu, top bar, toolbar row, Summary, Tasks, Settings → Appearance | PortalSidebar, PageShell, shared header adapters, ShellTasks | Extend the one shell |
| Table: header, list row, group row, item row, ticks, footer, frozen identifier | register/DataGrid | Extend the one engine; a module passes columns |
| Detail page: header, tabs, cards | DetailShell, Tabs, Block | Generic object header remains a KIT GAP (UI MASTER §7.3) |
| Button · IconButton | Button | Word button is a box; icon-only is round with no border (01 §3) |
| Pill | StatusPill | One status component |
| Menu | DropdownMenu, Popover | One menu design (01 §3) |
| Card · FieldRow | Card, Block, field-recipe | Field rows 36, label 150 (01 §5.1) |
| Tabs · SegmentedControl | Tabs | Segmented look (01 §3) |
| Toast | Toast | Bottom centre (01 §3) |
| Selection bar | GridToolbar | Replaces the toolbar in place |
| Chip: choice chip and theme chip | none | KIT GAP |
| Link: record number | PoNumberLinks and module link cells | KIT GAP: one shared record link |
| Avatar | none | KIT GAP (UI MASTER §7.3) |
| Item-row control | none | KIT GAP |

Behaviour the specimen fixes for every module:

- A row click opens the record; the tick, in-row controls and selecting text do not. Ctrl or ⌘ click opens a new tab. Back returns to the same scroll position.
- Hover, pressed, open and disabled follow 01 §1. A button whose menu, form or panel is open keeps its pressed grey and is never the selection colour.
- A record number in a card or task is the link that opens it; there is no separate Open button.
- Menus, dialogs and toasts are never clipped by a parent.
- Print and Download print only the document page, never the whole application.
- No value is cut with an ellipsis; text wraps inside its own cell or column.

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
