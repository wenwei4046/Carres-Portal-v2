# 03 · Page patterns

**Current shared target · owner instruction 9 Oct 2026.** Use the Sales Order design supplied by Jess as the visual reference, through the existing shared kit. All visual values live in 01; component contracts live in 02. Business record structure, permissions and exact words come from module MASTERs and COPY-STANDARD. No second layout guide.

## 1 · Shell

Navigation → global identity/search/team/notifications → page content. Summary and Tasks are collapsible contextual regions, not mandatory columns on every screen. Navigation selection is orange. Keep content reachable with navigation expanded or collapsed. Narrow layouts collapse secondary panels; they never compress essential facts until unreadable.

## 2 · Register

Module views and shared tools → source-owned records → filtered totals/footer. Current reference is `ui-reference/sales-order-design/Sales Order Outright Layout v8.dc.html`. Use the shared grid, two-line facts where meaningful, horizontal separators and governed columns. Record doors preserve the owning module's opening behaviour; linked document numbers open their own records. No Operations create-SO door. Selection replaces tools in place. Preserve list filters, scroll and selection on return.

### 2.1 Supplied Sales Order composition

Open · Delivered · All → source-owned column view → one table → quantities/footer. No added Table/Cards switch or permanent funnel on every header. Selection replaces the toolbar. The row opens the full SO object; checkbox, item inspection, linked document actions and selecting text must not trigger it. Ctrl/⌘-click opens a new tab; Back restores list scope and scroll. These are SO adapter choices, not an instruction to remove other modules’ approved views or actions.

## 3 · Full object

Identity/customer-or-party/status/owner → authorised actions → module views → grouped source-owned facts. SO uses its record, Route and Timeline views; other modules use their own records and facts, not copied SO field names. Two-column fact groups may become one column at narrow widths. Read-only facts are text. Edits, amendments, approval and document generation retain their owning module's gates.

SO reference: Sales Order · Order Route · Timeline. Normal viewing is read-only; Request amendment reveals only approved editable facts and keeps the current record context. Historical revision view stays read-only and offers Back to current. Existing amendment approval and financial/stock consequences are not replaced by the prototype.

## 4 · Working Panel and guided work

Shared host identity → Info and owning module tab → current action and checks → evidence → recorded outcome → next responsible party. Reuse CompactModuleCard and Drawer. A full object and a compact work panel have different purposes; neither introduces a second kit. A photo upload is not completion by itself. Never add approvals or customer calls merely to fill a layout.

## 5 · Order Route

Show concurrent Goods, Delivery and Payment facts, with related problems and source documents. A blocked state names its actual cause and responsible party. DO generation does not complete delivery, missing goods or service obligations. Linked claims, issues and cases retain their own record owners. Route facts do not write another module's records.

## 6 · Timeline and revisions

Recorded date/time → actor → event/result → source document/evidence. Distinguish normal owner, temporary assignee and actual person who acted. Historical versions are read-only. Filters change the visible history, not its facts. Missing source and failed read differ.

## 7 · Settings

Group by purpose and owning module. Plain rows show name, short explanation and value; detail reveals stable ID, access, source, effective treatment and history. Repeated entities such as companies, brands, bank accounts and staff use tables. Authorized users can fill approved missing settings. Rules awaiting a business decision cannot be activated by the prototype. Do not add a box or status pill to every row. A change must show its effect on open records without silently restarting clocks.

## 8 · Tasks and field screens

Office Tasks show assigned action, source, why, due, proof and next result. Field screens show the current necessary step with scan/choice/count/photo as the owning workflow requires. Ordinary helping is different from approval permission. Preserve upload input and drafts on failure and conflict. Phone/tablet layouts need their own complete-page verification; the desktop specimen is not proof.

Tasks stays visible while inspecting a document on supported desktop widths; the document drawer uses the adjacent work area, not a second stacked task panel. On narrow screens preserve one reachable active surface, safe draft return and access to the other context. Quick Calendar and Activity capabilities are retained; their unrepresented placement is not invented from the ZIP.

## 9 · Reports

Central Reports with module summary links remains the recorded owner direction. Period, comparison, metrics and drill-through follow their approved definitions. The kit supplies composition, not invented KPI definitions or financial access.

## 10 · Acceptance

Apply UI MASTER §2.2 to complete pages: desktop/narrow, keyboard, zoom, long content, read/save/upload failures, denied access, draft retention, conflict and historical records. Use verified data; explicit TEST cases may cover failures. Never label a scenario passed merely because a screenshot exists. Importing the prototype or kit is not production verification.
