# ERP Page Control Audit and Master Blueprint Proposal

> **Status: PROPOSAL / NOT LAW — Owner review required.**
> **Audit cut:** 2026-08-31 · latest `origin/main` and production `cfc334f194781468fc35dc333603a9f6af916c69`.
> **Authority:** this file is an auditable control ledger subordinate to [`MASTER.md`](MASTER.md),
> [`../ERP-ARCHITECTURE.md`](../ERP-ARCHITECTURE.md), each module MASTER and
> [`../COPY-STANDARD.md`](../COPY-STANDARD.md). It does not create a second UI MASTER or dictionary.
> After Owner approval, accepted global laws are folded into `MASTER.md`; this ledger remains evidence.

## 1. Owner-visible result

Carres does **not** currently have one fully aligned ERP page system. The production deploy is the
same SHA as latest main, so the live observations below are directly comparable with the audited
code. Sales Orders, SO Batch Purchase, Manual Purchase and the PO object prove much of the intended
grammar; the remaining pages are a mixture of current Register/Workspace patterns, older custom
surfaces, planned-only work and broken routes.

Immediate control findings:

1. **Stock is production-broken:** the live page reports that
   `stock_unit_register_v.site_name` does not exist.
2. **Warehouse Unit deep links are broken:** `/operation/stock/unit/:unitCode` is declared, but the
   URL-driven router omits it and renders Dashboard.
3. **The named UI authority entry points are broken:** `docs/UI-KIT.md` and
   `docs/UI-DICTIONARY.md` no longer exist. The current truth is split correctly across
   `docs/ui/MASTER.md`, `01-design-tokens.md`, `02-components.md`, `03-page-patterns.md` and
   `COPY-STANDARD.md`, while code comments and retired guidance still point to the deleted paths.
4. **Purchase Orders is split truth:** a usable production page exists, but the complete governed
   implementation is only open PR #993 and conflicts with main. It must be reconstructed by the
   active convergence task; it is not live merely because CI passed.
5. **Receiving is split truth:** production still says `Goods Receipts`; current authority says
   `Receiving`. PR #986 is authority/spec only and conflicts with main. The active convergence task
   is separately rebuilding the single writer and Register/Workspace.
6. **Narrow production proof is incomplete:** the in-app browser stayed at its 1280px minimum when
   asked for 768px. Existing tests and code provide evidence; they do not replace a real sub-1280
   Owner walk.

No application code, migration, Card, PR merge or deployment is authorised by this proposal.

## 2. Audit evidence and scope

### 2.1 Evidence order

When evidence conflicts, use this order:

1. explicit current Owner ruling;
2. `CLAUDE.md` Constitution and `ERP-ARCHITECTURE.md`;
3. current module MASTER and `ui/MASTER.md` / copy / action standards;
4. latest main implementation and tests;
5. production at an identified deploy SHA;
6. open PR diff;
7. Card/spec/plan;
8. task/chat history.

`Implemented`, `Approved`, `complete` or `live` inside a task is not proof without merge ancestry,
deploy SHA and a production walk.

### 2.2 Repository and production proof

| Evidence | Result |
|---|---|
| Latest main | `cfc334f194781468fc35dc333603a9f6af916c69` |
| Web deploy | `https://erp.carresofficial.com/__carres_deploy.json` reported the same SHA |
| API deploy | `https://api.carresofficial.com/health` reported the same SHA |
| Route/navigation owners | `portal-nav.ts`; `OperationApp.tsx`; external portal apps |
| Shared UI owners | `docs/ui/MASTER.md`; `docs/01-design-tokens.md`; `docs/02-components.md`; `docs/03-page-patterns.md`; `apps/web/src/components/kit/` |
| Copy owner | `docs/COPY-STANDARD.md` |
| Action/owner/calendar owner | `docs/ACTION-FLOW-STANDARD.md` |
| Production walk | governed Operations account, desktop 1440 and effective 1280 widths; no fake records created |
| Narrow limitation | requested 768×900, browser remained 1280px; recorded as an evidence gap |

## 3. Canonical Master Page Blueprint — proposed

### 3.1 One anatomy

Every internal ERP page composes, in this order:

```text
Portal navigation
└─ Destination Header (50px; identity + global Jump to / Notifications / Help / Settings)
   └─ Page-owned work surface
      ├─ optional Work Toolbar (45px; normal state OR selected state)
      ├─ optional local business rail (240px; filters/groups only)
      ├─ main Register / Object / Workspace / Settings / Report / Document surface
      └─ Register status footer (32px) when the surface is a Register
```

Pages do not redraw global chrome, repeat the destination title, add KPI bands above Registers or
invent module-local settings and work queues.

### 3.2 Shell variants

| Variant | Use | Law |
|---|---|---|
| Internal ERP | Operations, Finance, HR, Admin | One portal navigation and one Destination Header. Role changes destinations, not geometry. |
| External governed portal | Supplier, Warehouse, Delivery Partner, Dealer/BD | May use a smaller audience-specific nav; retains the same copy, evidence, object and interaction laws. It never writes an internal record it does not own. |
| Official document | PO, GRN, DO, SO, invoice/receipt | Document identity and version are immutable evidence. Preview is not a second editor. |

### 3.3 Navigation and local-rail law

- Navigation names an owned business object or accepted operation, not `List`, a state or a screen
  form. `Old Orders` is a temporary cutover door and not permanent IA.
- Purchasing keeps its four groups and eleven destinations. Unbuilt destinations say exactly
  `Coming soon`, are not links and are outside the tab order.
- The one settings gear opens the central Settings Workspace. A shortcut deep-links; it does not
  create another Settings home.
- A local rail contains business groups and factual filters for the current surface only. It has
  no generic `Filters`, dashboard KPIs, duplicate destination tree, `WORK TO DO`, My Work or Team
  Work.
- Every count predicts the filtered rows. Non-exclusive counts must be named as such; one number
  cannot silently mean both records and quantities.
- Rail labels wrap; the rail stays 240px and can hide through the governed `Hide filters` /
  `Show filters` control.

### 3.4 Register anatomy

- A Register is a source-of-truth listing, not a dashboard and not a queue.
- Normal toolbar: view/search at left; governed display/output controls and at most one visible
  primary operational action at right.
- Selection replaces the same toolbar row. Left: selected business summary, Clear, structured
  owner context when required, primary operational action. Right: valid output actions.
- Output is separate from operational action. `Export ▾` owns Excel/PDF/Print; it never competes
  visually with `Issue PO`, `Start Receiving`, `Record issue` or `New Sales Order`.
- No enclosing outer rectangle around toolbar + table + footer. Internal header, row, column and
  footer dividers remain clear.
- Header 36px; complete parent row 38px; footer 32px. No compression to manufacture row count.
- Registers may scroll horizontally at narrower desktop widths where the governed column set
  cannot shrink. The rail never squeezes below 240px.
- Loading, empty, error, blocked, selected, partial, hover and focus states are first-class states,
  not ad-hoc banners.

### 3.5 Object Detail anatomy

Object Detail answers, in order: **what object · current truth · current action · facts · related
objects/documents · history**.

- Identity, status and primary action are visible at the top; an operational primary action is not
  hidden in a sticky bottom bar.
- View/inspect surfaces use full width unless side-by-side reading is necessary.
- Use **50% facts/edit + 50% official-document preview** when the operator must compare or revise a
  governed document: PO issue/revision, posted GRN review and equivalent approved cases.
- Draft/count/review Receiving is full-width because the work is physical counting, not reading a
  completed paper.
- The preview shows the current official version and clear document number. Download/Print is an
  output, not the operational primary action.
- Related objects deep-link to their single owner; no duplicate edit form is admitted.

### 3.6 Workspace and action anatomy

- Use Workspace only when staff decide/act across records or require coordinated panes. A Register
  is for finding truth; a Workspace is for doing the governed job.
- One action = trigger, owner rule, resolved owner, two-line fact/action copy, measured completion,
  due calendar, source object, cover rule and audit evidence.
- Line 1 is the fact/problem. Line 2 is the exact action with necessary object/recipient/result.
- My Work and Team Work are the only complete work queues. Module pages may show the current fact
  and action needed to finish the object, but never a second queue.
- Deep links open the exact source object and action surface. Completion is measured from the owning
  record; Work creates no second status.

### 3.7 Owner metadata law

- Keep four facts separate: normal duty owner, dated cover, actual actor and object PIC/case owner.
- Owner identity is a structured avatar chip, never a staff name inside an action sentence.
- A superuser may perform an authorised action without becoming the duty owner. History preserves
  both actual actor and normal duty/cover context.
- Runtime pages resolve staff and cover from governed People/Settings data; no sample names are
  hardcoded.

### 3.8 Settings and master-data law

- Settings owns expandable rosters, working calendars, supplier weeks, locations, `Deliver To`,
  categories, reasons, permissions and other governed values.
- Runtime pages consume IDs and current labels from their owner. They do not hardcode staff,
  supplier, site, location, order or example data.
- Browser-only permission is prohibited. A visible capability mirrors API and database authority.
- One business mutation has one writer. Summaries are read-only; cross-module work uses a link.

### 3.9 Responsive law

| Width/surface | Required behaviour |
|---|---|
| Wide desktop | Global nav + optional 240px local rail + full surface; fixed header/toolbar/footer where governed. |
| Narrow desktop | Global nav collapses; local rail hides to `Show filters`; Register keeps governed columns and may scroll horizontally; primary action remains in the top toolbar. |
| Small screen | `Jump to…` is full-screen; Object Detail stacks facts before preview; Workspace exposes one primary pane and opens secondary panes as governed drawers; no action exists only on hover. |

The exact breakpoints remain owned by current tokens/components. This law governs behaviour, not a
new set of pixel constants. A real sub-1280 production walk is required before any page can claim
responsive acceptance.

### 3.10 Accessibility and interaction states

- Keyboard reaches every navigation, filter, row, primary action, popover and dialog; focus is
  visible and restored after overlays.
- Colour is never the only status signal. Icons are from the governed set, not emoji.
- Disabled controls explain the blocking fact on screen. Unbuilt controls are not rendered.
- Empty states say what is empty and the valid next action, except the ruled `Jump to…` search
  result `No results` conflict, which must be reconciled in `COPY-STANDARD.md`.
- Errors remain near the affected surface and offer a truthful retry where retry is safe.
- Toasts never claim an external outcome the portal did not observe.

### 3.11 UI Dictionary ownership and change process

There is no current `docs/UI-DICTIONARY.md`. The only current word owner is
`docs/COPY-STANDARD.md`; placement is owned by `docs/ui/MASTER.md`; tokens/components/patterns are
owned by `01-design-tokens.md`, `02-components.md` and `03-page-patterns.md`.

A word change must:

1. identify the single business fact and current writer;
2. update `COPY-STANDARD.md` once;
3. update every affected UI surface and typed field/column catalogue in the same bounded change;
4. add a guard proving the retired synonym cannot return;
5. record any superseded word and production proof.

## 4. Page-control profiles

Every inventory row below inherits all facts from its profile; row-specific exceptions are stated
in the row. This avoids duplicating the same governance sentence across forty pages.

| ID | Purpose / daily job | Actor / calendar | Completion evidence / supervision | Downstream and truth owner |
|---|---|---|---|---|
| P0 Projection | See overall facts; no mutation | permitted viewer; source calendar | source timestamps; links to exact Work/object | no business writer; read models only |
| P1 Work | Perform system-derived actions top to bottom | resolved owner/cover; action-named calendar | owning completion fact; Team Work sees same stable action ID | source module writer; Work owns no outcome |
| P2 Register | Find, compare, filter and open records | module staff; source fact dates | persisted record + audit; Work deep-links exact row/object | module API/DB writer and source object |
| P3 Object Detail | Inspect or change one governed object | authorised role; action calendar | saved event/version/document + actual actor | owning object writer; append-only history where ruled |
| P4 Workspace | Complete a multi-record or multi-step operational act | governed duty/superuser; Office/Warehouse/Delivery calendar as named | measured commit/post event; Work closes from the same fact | one transaction/writer; downstream records by explicit seam |
| P5 Settings | Govern expandable master data and permissions | authorised manager/admin; Office | versioned setting + actor/time | Settings/People/Catalog owner; runtime pages read only |
| P6 Report | Review/export governed facts | permitted viewer; fact dates | identified query/filter/export time | read-only projection; no workflow completion |
| P7 Document | Read/print/download an official version | permitted party | immutable document number/version and generation/issue evidence | owning document object; external opening is not receipt |
| P8 External portal | Submit/read only the external party's owned evidence | authenticated supplier/warehouse/logistics/dealer; relevant calendar | authenticated event, source object and time | writes only admitted external evidence through governed API/RLS |

### 4.1 Truth-writer and audit map

This names the current writer family and principal stored object. A page may call the listed writer;
it may not recreate the mutation in the browser or another route.

| Domain fact | Current writer family | Source object / audit evidence |
|---|---|---|
| Sales Order | `apps/api/src/routes/operation/orders.ts` and governed order functions | `orders`; order revisions/history, document version and actor |
| Purchase demand / SO Batch plan | `operation/purchase-demands.ts`, `operation/to-order.ts`; PO creation only through the governed PO writer | `purchase_demands`; exact SO/line coverage and PO lineage |
| Manual Purchase | `operation/manual-purchase.ts` and its database decision/issue functions | `purchase_requests`; state events, decision actor and issued PO link |
| Purchase Order | `operation/pos.ts` and the single SQL issuance/revision authority | `purchase_orders`, `purchase_order_lines`; PO versions/history/evidence |
| Supplier answer/date | governed PO supplier-answer writer; #993/active convergence must reconcile its final home | `po_supplier_promises`; answer/channel/reporter/evidence/times, never a rewrite of PO Delivery Date |
| Receiving / GRN | current `receive-threads.ts` and warehouse intake routes are being converged into one Receiving Session writer | receiving session/events and posted receipt/GRN identity; no second direct receive writer |
| Stock / Unit | `operation/stock.ts` and ruled stock functions | `stock_unit_ids`, `stock_unit_events`; Unit custody/status/location history |
| Delivery / DO | `operation/delivery-orders.ts`, `delivery-arrangements.ts` and admitted partner event routes | `ops_delivery_orders`, `ops_delivery_arrangements`, append-only arrangement/attempt/handover evidence |
| Customer payment | `operation/order-payments.ts` / Finance payment routes and ruled posting functions | `order_payments`, `payment_allocations`; payer/reference/time/recorder and receipt |
| Issue Tracker | Issue Tracker routes/functions | `issues` plus evidence, people/fault/money links, reviews and timeline |
| Supplier Claim | `operation/supplier-claims.ts` | `supplier_claims`; linked receipt/Unit/issue, decision and resolution evidence |
| Catalog / SKU | Catalog routes and API/DB role gates | `product_models`, `product_skus`, supplier offers/mapping; audited actor |
| People / duty / cover | HR/People and governed duty settings writers | person/role/roster/dated cover; Work resolves but does not rewrite them |

## 5. Current-state control matrix

Legend: **LIVE** = observed in production at the audited SHA; **CODE** = route/implementation on
main but not walked; **PR** = open PR only; **PLAN** = approved/proposed authority only;
**MISSING/BROKEN** = no usable current surface or observed failure.

### 5.1 Operations navigation and objects

| Destination / object | Profile · page pattern | Governing truth, dictionary and owner treatment | State, proof and current owner |
|---|---|---|---|
| Dashboard | P0 · Dashboard | Cross-module read-only; dates must name the fact/calendar | **LIVE / DRIFT:** generic KPI panels, ISO dates and emoji; Workspace Blueprint remains proposal. `OperationDashboard.tsx`; `Workspace Plan` |
| Work / My Work / Team Work | P1 · Queue/Workspace | action engine; structured owner/cover; exact object deep link | **LIVE:** 239 actions / 127 late in walk. `OperationWork.tsx`; no module may duplicate it |
| Issue Tracker | P2/P3/P6 · Register/Object/Report | issue authority and actual actor; Office calendar | **LIVE:** register, `Record issue`, monthly report. `OperationIssueTracker.tsx`; `Issue Tracker Plan` |
| Sales Orders | P2 · Register | SO truth; Sales owner; `SO Date`; top `New Sales Order` | **LIVE / REFERENCE:** frameless exterior, clear internal grid. `SalesOrdersRegister.tsx`; `Sales Orders Plan` |
| Sales Order | P3/P7 · Object Detail | SO version, delivery/payment/purchasing links; object PIC separate from action owner | **LIVE / COPY DRIFT:** good 50/50 official preview; raw service codes visible. `SalesOrderWorkspace.tsx` |
| Old Orders | P2 · temporary legacy | read-only cutover; must not own current work | **LIVE / DRIFT:** dashboard-style rail, PIC/team and local actions. Temporary door; no permanent blueprint exception |
| SO Batch Purchase | P4 · Workspace/Register | purchase demand/coverage; Office; PO Duty chip only beside selected `Issue PO` | **LIVE:** frameless grid and business rail; all sampled rows blocked by missing Catalog cost; timing buckets all zero need arithmetic check. `OperationToOrder.tsx`; convergence task |
| Manual Purchase | P2/P3/P4 · Register/Object/Approval | non-SO buying; requester, approver, PO Duty/actor separate; Office | **LIVE:** Cards through 06 on main; object/history present. Rail still says `WORK TO DO`, contrary to central Work law. `OperationManualPurchase.tsx`; convergence task owns seam |
| Purchase Orders | P2 · Register | PO commitment/document; Office; PO Duty chip + actual actor | **LIVE CURRENT + PR CONFLICT:** production 24 POs/22 PDFs not sent and obsolete outer frame. Full changes only PR #993, conflicting. Convergence task owns reconstruction |
| Purchase Order | P3/P7 · Object Detail | issued/versioned PO, PO vs Supplier Delivery Date kept separate | **LIVE:** top `Revise`, `Issue current PDF`, `Download PDF`; 50/50 official preview and owner metadata. PR #993 changes are not live |
| Receiving (production label `Goods Receipts`) | P4/P2 · Workspace/Register | Receiving Session, Supplier DO, Goods Receipt, GRN; Warehouse Mon–Sat; GRN Duty/actor | **LIVE OLD + ACTIVE BUILD:** three-pane workspace works, but name conflicts. PR #986 docs-only/conflicting; convergence task owns single writer and new surface |
| Posted GRN | P3/P7 · Object Detail/Document | stored GRN number only at posting; immutable retry; quantities by ruled fields | **PLAN/ACTIVE BUILD:** 50/50 after posting; not in audited main. PR #986 authority, convergence implementation |
| Supplier Claims | P2/P3 · Register/Object | supplier remedy; Office, links Receiving/Unit/Issue | **LIVE:** 0 open/1 closed in walk. `OperationSupplierClaims.tsx`; purchasing authority |
| Purchase Returns | P2/P3/P7 · Register/Object/Document | authorised return, exact units/qty/evidence | **PLAN:** `Coming soon`; existing plan is history until owned delivery scope |
| Repair Orders | P2/P3/P7 · Register/Object/Document | supplier repair continuation | **PLAN:** `Coming soon` |
| Display Requests | P2/P3 · Register/Object | showroom request, approval and destination | **PLAN:** `Coming soon` |
| Consignment Orders | P2/P3/P7 · Register/Object/Document | supplier-owned goods commitment | **PLAN:** `Coming soon` |
| Consignment Returns | P2/P3/P7 · Register/Object/Document | exact supplier-owned goods returned | **PLAN:** `Coming soon` |
| Consignment Sale Notices | P2/P3/P7 · Register/Object/Document | sold supplier-owned Unit notice | **PLAN:** `Coming soon` |
| Delivery | P2/P3/P4 · Register/Object/Workspace | DO, appointment, logistics, evidence; Delivery calendar | **LIVE:** business rail and grid. `OperationDelivery.tsx`; `Delivery Plan` owns target reconciliation |
| Delivery Order | P3/P7 · Object/Document | DO commitment, source SO and handover evidence; actual actor | **LIVE:** read-only facts/evidence/history and top Print. `DeliveryOrderPage.tsx` |
| Stock | P2 · Register | Unit custody/location/status; Warehouse calendar | **BROKEN P0:** production query missing `site_name`. `WarehouseStockRegister.tsx`; no active repair task identified |
| Warehouse Unit | P3 · Object Detail | immutable Unit ID, custody/status/location and history | **BROKEN P0:** direct route renders Dashboard because `OperationApp.tsx` omits route from URL-driven set |
| Ready stock | P0/P4 · Workspace | promise/reorder facts; Warehouse/Office seams | **LIVE / DRIFT:** dashboard panels and duplicated top chrome. `OperationOpsReady.tsx` |
| In & out | P2/P6 · Register/Report | stock movement facts, source event and actor | **LIVE / DRIFT:** old custom page, duplicate chrome. `OperationMovements.tsx` |
| Transfers | P2/P3/P4 · Register/Object/Workspace | exact Unit custody in two events | **PR ONLY / CONFLICT:** `Coming soon`; PR #860 long-idle, conflicting, migration unapplied and one-site data blocker |
| Counts | P2/P4 · Register/Workspace | count session and variance evidence | **MISSING:** `Coming soon`; no current owning task |
| Payments | P2/P3/P4/P7 · Register/Object/Workspace/Receipt | money-in and payment evidence; Office; action owner separate | **LIVE / DRIFT:** duplicate title and legacy generic rail. `OperationPayments.tsx`; `Payment Plan` |
| Rental | P2/P3 · Register/Object | rental agreement/assets/schedule; Office | **LIVE / DRIFT:** KPI + two custom tables. `OperationRental.tsx`; module MASTER |
| Service Cases | P2/P3/P4 · Register/Object/Workspace | case owner distinct from action owners; Office | **LIVE / DRIFT:** old table and unclear long copy. `OperationServiceCases.tsx`; `Service Case Plan` |
| Guarantees | P2/P3 · Register/Object | item entitlement and consumption; Office | **LIVE / DRIFT:** old custom table. `OperationGuarantees.tsx`; module MASTER |
| Suppliers | P2/P3 · Register/Object | supplier master/contact/terms; Office | **LIVE / DRIFT:** card list; copy `2 delivery deliveries on file`. No Supplier module MASTER — authority gap |
| Supplier items | P2 · Register | Catalog/Supplier mapping and supplier code | **LIVE / DRIFT:** duplicate chrome and internal grid instruction. `OperationSupplierItems.tsx`; no Supplier MASTER |
| Catalog | P2/P3/P5 · Register/Object/Settings-like maintenance | one SKU truth; write gates from API/DB | **LIVE / DRIFT:** dense custom workspace, not shared Register. `OperationStock.tsx` / Catalog components; no Catalog MASTER |
| Settings | P5 · Settings Workspace | one central audited settings destination | **LIVE:** operation route redirects to section; governed module sections. `SettingsWorkspace.tsx` |

### 5.2 Finance, HR and Admin navigation

These destinations are in the current shared registry. Every row inherits its profile, global
layout/copy law and truth-writer map. This audit verified route/code ownership, not a governed
production walkthrough for each role; each therefore remains **CODE / PRODUCTION WALK OUTSTANDING**.

| Area / destination | Profile · page pattern | Business purpose, ownership and downstream control |
|---|---|---|
| Finance · Dashboard | P0 · Dashboard | read-only money/AP/AR supervision; deep-link exact records/actions |
| Finance · AR · Receivables | P2/P3 · Register/Object | find customer amounts owed; Money In writer and evidence only |
| Finance · AP · Payables | P2/P3 · Register/Object | find supplier amounts owed; AP writer stays separate from customer payments |
| Finance · Order Payments | P2/P3/P4 · Register/Object/Workspace | post/inspect payment once; receipt follows recorded payment |
| Finance · Invoices | P2/P3/P7 · Register/Object/Document | official invoice identity/version; no duplicate payment writer |
| Finance · Refunds & Credits | P2/P3/P7 · Register/Object/Document | authorised refund/credit fact, actor and source document |
| Finance · Rental Approver | P1/P4 · Work/Approval Workspace | decision surface only; the resulting rental/finance record closes Work |
| Finance · Reconciliation | P4 · Workspace | compare source records and record governed exception/resolution evidence |
| Finance · Reports | P6 · Report | read-only, named filters/as-of time; no operational completion |
| HR · Overview | P0 · Dashboard | people facts and links, no second roster writer |
| HR · Commission | P2/P6 · Register/Report | governed earning facts and calculation evidence |
| HR · Team | P2/P3/P5 · Register/Object/Settings | team, duty and cover truth; Work reads this metadata |
| HR · People | P2/P3/P5 · Register/Object/Settings | person/role/status/avatar truth and audit |
| HR · Performance | P2/P6 · Register/Report | governed measures with period/source; no free-text action truth |
| HR · People cost | P2/P6 · Register/Report | restricted cost facts with period/source and permission |
| Admin · Overview | P0 · Dashboard | permitted administrative facts and exact destination links |
| Admin · Approvals | P1/P4 · Work/Approval Workspace | exceptional decisions only; routine Work is not duplicated |
| Admin · Catalog (POS) | P2/P3/P5 · Register/Object/Master data | one Catalog truth; role gate changes write ability, not fields |
| Admin · Sales Orders | link only | opens the owning Sales Orders destination; no Admin copy |
| Admin · Purchasing settings | link/P5 | deep-links central Settings; no second settings home |
| Admin · Dealers | P2/P3/P5 · Register/Object/Master data | dealer identity/configuration and audit |
| Admin · Showrooms | P2/P3/P5 · Register/Object/Master data | showroom/site truth consumed by runtime pages |
| Admin · Partners | P2/P3/P5 · Register/Object/Master data | partner identity/service capability and audit |
| Admin · Audit log | P6 · Report | immutable/read-only event search with actor/object/time |
| Admin · Accounts | P2/P3/P5 · Register/Object/Settings | account/role/permission truth; server authority mirrors UI |
| Admin · Product & Maintenance | P2/P3/P5 · Register/Object/Master data | second door to the same Catalog object and API gates |
| Admin · Rental | P2/P3/P5 · Register/Object/Settings | rental configuration, not the runtime agreement writer |

### 5.3 External ERP portals

| Portal / page | Profile · pattern | Contract and state |
|---|---|---|
| Supplier · Dashboard | P8/P0 · external projection | own PO/activity summary; no internal mutation. **CODE; role walk outstanding.** |
| Supplier · Incoming | P8/P2/P4 · Register/response Workspace | provide admitted supplier answer/evidence against exact PO; never rewrite PO/GRN/Stock. **CODE.** |
| Supplier · POS | P8/P2/P7 · Register/Document | read governed POs/current versions under supplier identity. **CODE.** |
| Supplier · SKU | P8/P2 · Register | read supplier-scoped item truth and admitted supplier mapping/offer facts. **CODE.** |
| Warehouse · Incoming | P8/P2/P4 · Register/intake Workspace | report physical arrival/count into single Receiving Session; arrival alone is not posted GRN. **CODE; convergence owns seam.** |
| Warehouse · Receipts | P8/P2/P3/P7 · Register/Object/Document | inspect its admitted receipt/GRN evidence; no second posting writer. **CODE; convergence owns seam.** |
| Delivery Partner · Incoming | P8/P2 · Register | accepted jobs offered to this partner. **CODE; role walk outstanding.** |
| Delivery Partner · Dashboard | P8/P0 · external projection | partner workload/status facts only. **CODE.** |
| Delivery Partner · Factory pickups | P8/P2/P4 · Register/Workspace | record governed pickup/handover events; Delivery retains DO truth. **CODE.** |
| Delivery Partner · Deliveries | P8/P2/P4 · Register/Workspace | record attempt/proof events against exact DO. **CODE.** |
| Delivery Partner · Pickups | redirect only | points to the one owning pickup surface; no duplicate page. **CODE.** |
| Delivery Partner · Fleet | P8/P2/P5 · Register/Master data | partner-owned vehicle capability used by Delivery. **CODE.** |
| Delivery Partner · Profile | P8/P3/P5 · Object/Settings | partner identity/contact evidence within admitted fields. **CODE.** |
| Dealer / BD · Dealer POS | P8/P2/P4 · Register/Workspace | governed dealer order/evidence entry only. **CODE; role walk outstanding.** |

## 6. Cross-task and PR ownership map

### 6.1 Audited task/chat population

App retrieval on 2026-08-31 found **64 ERP-related tasks/chats including this task**: 21 pinned,
31 recent and 12 archived. Unrelated personal chats were excluded. Titles were treated as evidence,
never as authority.

| Population | Exact source titles |
|---|---|
| Pinned / governing plans | `Payment Plan`; `Service Case Plan`; `Stock/warehouse Plan`; `Delivery Plan`; `Refine ERP object header UI`; `Doc ERP backbone`; `Issue Tracker Plan`; `Service Case Playbook`; `Sales Orders Plan`; `Workspace Plan`; `Audit Delivery Order blueprint`; `Map authoritative Carres repos`; `Plan Google claim submission flow`; `Purchasing Plan 2`; `Purchasing Plan`; the three pinned delegated tasks identified by IDs `01a04afd-10b1-78d3-9b65-cc675fab72b7`, `01a042a3-0665-7b30-a8aa-4d8594ad1cad`, `01a04816-f622-7f12-b76d-f2ab65e2814f`; `Purchasing — Receiving & GRN Page`; `ERP Master Page Control & UI Audit` |
| Recent build/history | `Purchasing Flow Convergence Build`; `Purchasing Card 06 implementation`; `Manual Purchase object detail and approval authority`; `Align Manual Purchase canApprove with the SQL decide gate`; `Manual Purchase permanent register`; `Manual Purchase left filter rail`; `SO Batch Purchase Order visibility`; `Sale Orders Plan`; `SO Batch Purchase right register`; `SO Batch Purchase left filter rail`; `Sales order revisions history card`; two tasks titled `SO batch left rail order timing`; `Purchasing card 02 final closure`; `Carres Google Form — Warranty & Tri…`; `Purchasing manual purchase card 03`; `Purchasing side menu final listing`; `PURCHASING — CARD 01 · FIX`; `Delivery Work layout redesign`; `Delivery sidebar menu structure`; `Purchase Demands Register`; `Warehouse 2`; `warehouse 1`; `SO Batch Purchase card implementation`; `Unit inventory authority foundation`; `Purchasing sidebar accordion plan`; `Warehouse transfers build`; `Stock/Warehouse Built`; `Purchasing Built`; `Onhand category filter build`; `Delivery Built`; `Carres Terms & Conditions Review` |
| Archived evidence | `Design mattress claims system`; `Purchasing Card 02 — Final Closure…`; `Execute approved tracker scopes`; `Issue Tracker Module Completion — P…`; `Issue Tracker Plan`; `Handle payment posting convergence`; `Payment plan`; `Issue Tracker Plan`; `Delivery architecture`; `Plan-Delivery module design`; `评审 Sales Orders 参考模板`; `Audit Sales Orders register template` |

The three delegated source titles are entire `<codex_delegation>` prompts in the app rather than
human-sized names; IDs are used above to avoid shortening those source titles into false names.

### 6.2 Current ownership and collision status

| Work | State | Owns now | Control ruling |
|---|---|---|---|
| `Purchasing Flow Convergence Build` | **ACTIVE** | end-to-end Purchasing seams, single Receiving writer, PO/Receiving reconstruction | Do not open duplicate Purchasing implementation work. Send later seam requirements here after Blueprint approval. |
| `Purchasing — Receiving & GRN Page` | **ACTIVE but review-gated** | complete authority/spec commit `b51d26ee`; no app implementation | Evidence input only. Its PR #986 conflicts; convergence owns integration. |
| Purchase Orders delegated task `01a04816…` | **IDLE** | prior full implementation and PR #993 | No new PR/merge here. Convergence selectively reconstructs after resolving main conflicts. |
| SO Batch delegated task `01a04afd…` | **IDLE / delivered history** | Operations Superuser, owner-chip and SO Batch corrections now on main | Its current live outcomes are evidence; no duplicate work. |
| Manual Purchase chain | **MERGED through Card 06** | current production implementation | Remaining UI seam (`WORK TO DO`) belongs to convergence/global control, not a new Manual Purchase build. |
| `Workspace Plan` | **PROPOSAL / repository-history conflict** | Dashboard/Work target discussion | Not law. Current `docs/workspace/BLUEPRINT.md` explicitly remains proposal. |
| Module Plan tasks | **IDLE / evidence** | Owner rulings and historical reasoning | Module MASTER/current main wins. Do not treat final chat prose as current status. |
| Archived tasks | **ARCHIVED / history** | none | May explain decisions; cannot own current work. |

### 6.3 Open PR population

| PR | Current state | Truth classification | Owner/collision |
|---|---|---|---|
| [#993](https://github.com/wenwei4046/Carres-Portal-v2/pull/993) `feat(purchasing): complete governed Purchase Orders` | OPEN; CI success; `CONFLICTING / DIRTY`; head `f4762c6e`; includes migration 0406 | **PR ONLY**, not live | `Purchasing Flow Convergence Build`; overlaps Work, copy, architecture, PO UI/API/SQL |
| [#986](https://github.com/wenwei4046/Carres-Portal-v2/pull/986) `docs(receiving): reconcile GRN authority` | OPEN; CI success; `CONFLICTING / DIRTY`; docs/spec/plan only | **APPROVED BLUEPRINT CLAIM / PR ONLY**, no application build | review-gated Receiving task; convergence owns integration |
| [#860](https://github.com/wenwei4046/Carres-Portal-v2/pull/860) `A unit crosses a site only by transfer — custody, in two events (Warehouse item 8, slice 1)` | OPEN since 2026-08-19; CI success then; `CONFLICTING / DIRTY`; migration 0365 unapplied | **IDLE PR ONLY** | no active owner; cannot merge until current Stock truth/site data/migration are reconciled |

## 7. UI drift register

| ID / severity | Production or authority evidence | Conflict/current truth | Responsible owner |
|---|---|---|---|
| D01 P0 | Stock fails on missing `stock_unit_register_v.site_name` | live code/schema projection disagree | unowned; first correction |
| D02 P0 | Warehouse Unit direct URL renders Dashboard | declared route omitted from URL-driven routing | unowned; Stock owner |
| D03 P0 governance | `docs/UI-KIT.md` and `docs/UI-DICTIONARY.md` absent; stale references remain | current owners are UI MASTER + 01/02/03 + Copy Standard | this control task after Owner approval |
| D04 P1 | Purchase Orders production has enclosing outer frame | 2026-08-31 Register boundary law removes exterior but keeps internal grid | convergence task / shared Register seam |
| D05 P1 | Production nav says `Goods Receipts` | Owner/current architecture exact word is `Receiving` | convergence task |
| D06 P1 | Unit IDs/GRN/PO/Receiving dates and quantities differ across main, #993 and #986 | current main wins until selectively reconciled | convergence task |
| D07 P1 | Manual Purchase rail contains `WORK TO DO` | central My Work/Team Work is sole queue | convergence task |
| D08 P1 | Old Orders exposes PIC/team/local action logic | temporary read-only cutover, no permanent Work authority | Sales cutover owner |
| D09 P1 | Stock, Ready stock, In & out and Supplier items repeat top chrome | one Shell and one Destination Header | future bounded module corrections after approval |
| D10 P1 | Payments, Rental, Service Cases, Guarantees, Suppliers, Catalog use custom/legacy geometry | global page patterns apply; capability is kept while presentation migrates | module owners; no duplicate tasks yet |
| D11 P1 evidence | real browser could not go below 1280px | responsive acceptance requires real sub-1280 proof | every future page build gate |
| D12 P2 copy | SO object exposes `dispose-old-sofa-big-sofa`, `DELIVERY`, `STAIR_CARRY` | UI uses official English, never internal enums | Sales Orders owner |
| D13 P2 copy | Suppliers says `2 delivery deliveries on file`; Supplier items says `Drag a column header…` | Copy Standard/new-staff English | Supplier/Catalog authority gap |
| D14 P2 | Dashboard uses ISO dates and emoji; generic KPI direction differs from Workspace proposal | current page is live; Workspace target is not yet approved law | Workspace Owner review |
| D15 P2 data | SO Batch shows 24 not ordered while every ORDER TIMING bucket is zero | counts must predict rows; either copy/arithmetic or data state must explain it | convergence task |
| D16 P2 authority | `Jump to…` empty-state law says `No results`; general copy standard rejects that phrase | surface-specific ruling is live but written authorities disagree | Copy Standard owner |
| D17 P2 authority | Catalog and Supplier have no canonical module MASTER | Architecture calls Catalog gap explicitly; page behavior cannot become authority | future Plan after global approval |

## 8. Per-module blueprint and authorised exceptions

| Module | Pages → global pattern | Authorised exception / control note |
|---|---|---|
| Workspace | Dashboard→P0; Work→P1; Issue Tracker→P2/P3/P6 | Dashboard Blueprint remains proposal; Work is the only queue |
| Sales | Sales Orders→P2; SO→P3/P7; amendments/history/route are views of same object | Sales Orders is reference Register. Old Orders is temporary only |
| Purchasing | SO Batch→P4; Manual Purchase→P2/P3/P4; PO→P2/P3/P7; Receiving→P2/P4 then P3/P7; Claims/Returns/Repair/Showroom→P2/P3/P7 as applicable | four-group/eleven-door nav; no duplicate Work; Receiving draft full-width, posted GRN may use 50/50 |
| Stock/Warehouse | Stock/Transfers/Counts/In & out→P2/P4/P6; Unit→P3; Ready stock→P0/P4 | quantity-controlled interchangeable accessories are not forced into Unit rows; capability rule remains in Stock MASTER |
| Delivery | Delivery→P2/P4; DO→P3/P7 | Delivery calendar and logistics evidence; external partner writes only admitted events |
| Payments/Finance | Payments/AR/AP/invoice/refund→P2/P3/P4/P7; Reconciliation→P4; Reports→P6 | money-in vs AP writers remain separate; receipt proves recorded payment |
| Customer Care | Rental/Service/Guarantee→P2/P3/P4 | case owner is not every action owner; entitlements remain item-level |
| Suppliers | Suppliers/Supplier items→P2/P3/P5; supplier portal→P8 | no current module MASTER: no new capability law may be inferred from page layout |
| Catalog | Catalog/Product & Maintenance→P2/P3/P5 | two doors, one Catalog truth; role gates change write capability, not data definition |
| Settings | central Settings→P5 | one destination with module deep links; no runtime hardcoding |
| HR/People | People/Team→P2/P3/P5; other HR views→P0/P2/P6 | People is the source of duty, cover and avatar identity |

## 9. Supersession map

| Retired/history source | Current truth |
|---|---|
| `docs/UI-KIT.md` | Superseded/removed. Use `docs/ui/MASTER.md` + `01-design-tokens.md` + `02-components.md` + `03-page-patterns.md` + live kit implementation. Stale references must be removed in a later bounded governance change. |
| `docs/UI-DICTIONARY.md` | Superseded/removed. Use `docs/COPY-STANDARD.md`. |
| retired `.agents/skills/carres-design` guidance | Explicitly superseded; it is not current authority. |
| `docs/workspace/BLUEPRINT.md` | Proposal only, except Purchasing/Receiving Work slice separately locked in Architecture/Purchasing MASTER. |
| Cards, specs and plans | Execution contract/history only; module MASTER/current code/prod determines current truth. |
| archived docs and archived tasks | Historical evidence only. |
| open PR #993/#986/#860 | Proposed implementation/authority diffs only; none is current main or production truth. |
| chat statements `Implemented`, `Approved`, `complete`, `live` | Superseded by commit ancestry, merged PR, exact deploy SHA and production evidence. |
| production label `Goods Receipts` | Superseded target word is `Receiving`; remains a live drift until deployed. |
| permanent `Old Orders` IA | Superseded by Sales Orders; temporary cutover door only. |

## 10. Acceptance gates for every future ERP UI build

A page cannot be called aligned until all gates pass:

1. **Authority:** page identifies business owner, actor/override, calendar, completion evidence,
   Work supervision, downstream effect and single writer.
2. **Population:** route and navigation registry updated once; no dead or duplicate door.
3. **Pattern:** page declares Register/Object/Workspace/Settings/Report/Document and passes that
   pattern's anatomy; exceptions cite an explicit Owner ruling.
4. **Shell:** one Destination Header; no duplicate chrome/title/settings/work queue.
5. **Register:** no outer frame; internal header/row/column/footer dividers remain; counts predict
   rows; toolbar selection replaces rather than stacks; primary action stays above the table.
6. **Object:** top identity/action; exact related-object links; 50/50 preview only when governed;
   history preserves actual actor and owner/cover context.
7. **Copy:** every visible word exists in Copy Standard; no raw enum, generic `Filters`, vague ERP
   jargon, emoji or multiple names for one fact.
8. **Permissions/writers:** browser, API, database/RLS and SQL function agree; one mutation writer;
   a superuser action does not rewrite duty ownership.
9. **Data:** real governed settings/people/supplier/location/order data; no sample runtime records or
   hardcoded names.
10. **Interaction/accessibility:** keyboard/focus/ARIA; loading/empty/error/blocked/selected states;
    no colour-only status or hover-only fact.
11. **Responsive:** desktop and genuine sub-1280 production walks; rail collapse, table behavior,
    top primary action and stacked detail/preview verified.
12. **Evidence:** focused tests, typecheck, design/copy guards, migration law, full relevant suites,
    merged PR, exact deploy SHA and real-role production walk. CI success on an open PR is not live.

Recommended automated guards:

- route registry test: every live nav link resolves its intended page and every object deep link is
  included in URL-driven routing;
- Register boundary test: exterior borders are zero while internal dividers remain visible;
- banned-copy scan for stale UI paths, `WORK TO DO` outside central Work, raw enums and retired
  synonyms;
- authority test tying visible action capability to API/SQL permission;
- dictionary-column catalogue test so one fact has one header across modules;
- responsive screenshot/DOM contract at wide desktop, 820px and 700px plus real production walk.

## 11. Recommended correction order

Order is based on staff harm and cross-module dependency, not appearance:

1. **Restore Stock truth and Warehouse Unit deep links** — staff cannot trust or open current
   inventory; this also blocks Transfer/Receiving evidence.
2. **Finish active Purchasing convergence without duplicating it** — reconcile #993/#986 into one
   PO → supplier answer → Receiving Session → Goods Receipt → GRN → Stock seam; preserve newer main.
3. **Repair authority entry points** — explicitly retire the missing UI-KIT/UI-DICTIONARY paths and
   fix stale references so every future task starts from current truth.
4. **Remove duplicate work and shell ownership** — Manual Purchase `WORK TO DO`, Old Orders local
   queues, duplicated top chrome.
5. **Migrate staff-harmful legacy transaction pages** — Payments, Service Cases, Guarantees,
   Rental, Supplier pages; keep capability, replace presentation page by page.
6. **Reconcile Catalog/Supplier authority gaps** before redesigning their maintenance pages.
7. **Owner-review Workspace Dashboard target**; do not treat the proposal as current law.
8. **Complete role and narrow-width production evidence** for Finance, HR, Admin and external
   portals before any “all pages aligned” claim.

## 12. Owner confirmation gate

Owner confirmation is required for the Master Blueprint as a whole. Until then:

- this document stays **PROPOSAL / NOT LAW**;
- no implementation Cards are created;
- no seam message is sent to another task owner;
- no PR is merged and no migration/deployment is performed for this control task.

After confirmation, accepted laws are merged into the existing `docs/ui/MASTER.md` and
`COPY-STANDARD.md`; the first bounded work is correction order items 1–3, coordinated with
`Purchasing Flow Convergence Build` rather than duplicated.
