# Pages — Operation portal destinations

| Key | Meaning |
|---|---|
| BUILT | a route exists in `apps/web/src`; the route file:line is cited first |
| APPROVED | a MASTER names it; no route |
| PROPOSAL | proposed only |
| `OperationApp` | apps/web/src/pages/operation/OperationApp.tsx |
| `portal-nav` | apps/web/src/pages/portal/portal-nav.ts |
| `FinanceApp` | apps/web/src/pages/finance/FinanceApp.tsx |

| Module | Page | Purpose (1 line) | Status | Source |
|---|---|---|---|---|
| Workspace | Dashboard | The one global management reading surface over module facts | BUILT | OperationApp:578 · portal-nav:297 · docs/workspace/MASTER.md:2480-2481 |
| Workspace | Workspace (My Task · Team Work) | Formal destination for My Task and Team Work | BUILT | OperationApp:630 · portal-nav:340 · docs/ui/MASTER.md:547-548 |
| Workspace | Issue Tracker | Records every operational issue: what happened, who caused it, who acts | BUILT | OperationApp:550 · portal-nav:345 · docs/issue-tracker/MASTER.md:27-31 |
| Workspace | Payment Requests | Allowed staff ask Finance to pay a bill | BUILT | FinanceApp:107 · portal-nav:349-351 · docs/finance/MASTER.md:144,152 |
| Sales Orders | Outright Sales | Outright-order register and its SO detail and amendment journey | BUILT | OperationApp:519 · portal-nav:313-314 · docs/orders/MASTER.md:560-561 |
| Sales Orders | Subscription | Subscription-owned journey governed by the Rental MASTER | BUILT | OperationApp:650 · portal-nav:333 · docs/orders/MASTER.md:561 |
| Sales Orders | Sales Order (object page) | One SO: read-first View, Edit, Revisions, History, Order Route | BUILT | OperationApp:556 · docs/ui/MASTER.md:558 |
| Sales Orders | Monthly overview | Order list monthly composition inside Outright Sales | APPROVED | docs/orders/MASTER.md:568,581 |
| Sales Orders | Amendments | UNKNOWN — ask Jess (named in the 2026-08-13 IA tree only) | APPROVED | docs/ERP-ARCHITECTURE.md:390-392 |
| Sales Orders | Subscription inner destinations | Rental Blueprint destinations, not approved | PROPOSAL | docs/orders/MASTER.md:581-582 |
| Sales Orders | Old Orders (temporary) | Temporary cutover door; off the rail, legacy links still resolve | BUILT | OperationApp:564-573 · docs/ERP-ARCHITECTURE.md:437 · docs/orders/MASTER.md:578-579 |
| Purchasing | SO Batch Purchase | Buy what Sales Orders need; feeds the one PO issuance | BUILT | OperationApp:653,511 · portal-nav:412-413 · docs/ERP-ARCHITECTURE.md:482 |
| Purchasing | Manual Purchase Request | Non-SO buy request (MPR); feeds the one PO issuance | BUILT | OperationApp:666 · portal-nav:419 · docs/purchasing/MASTER.md:113 · docs/ERP-ARCHITECTURE.md:482 |
| Purchasing | Manual Purchase Request (object) | One MPR: header, request facts, timing | BUILT | apps/web/src/pages/operation/OperationManualPurchase.tsx:723 · docs/COPY-STANDARD.md:1544-1545 |
| Purchasing | Purchase Orders | One operational listing row per PO | BUILT | OperationApp:514 · portal-nav:423-424 · docs/purchasing/MASTER.md:4266-4267 |
| Purchasing | Purchase Order (object) | One PO: Current action, facts, Document | BUILT | apps/web/src/pages/operation/purchase-orders/PurchaseOrdersPage.tsx:584 · docs/COPY-STANDARD.md:3180 |
| Purchasing | Purchase Orders → Monthly demand | Monthly demand view inside Purchase Orders | BUILT | apps/web/src/pages/operation/purchase-orders/PurchaseOrdersPage.tsx:456 · docs/COPY-STANDARD.md:4791 · docs/purchasing/MASTER.md:4267 |
| Purchasing | Purchase Orders → Amendments | Record view, one PO change or request per row | APPROVED | docs/purchasing/MASTER.md:4266-4269 |
| Purchasing | Receiving | Physical receipt operation; GRN is made only after receiving | BUILT | OperationApp:598 · portal-nav:441 · docs/ERP-ARCHITECTURE.md:447-449 |
| Purchasing | GRN (object) | One posted receipt, with Amend and Void Receiving doors | BUILT | apps/web/src/pages/operation/OperationReceiving.tsx:95 · docs/COPY-STANDARD.md:2079-2080 |
| Purchasing | Supplier Claims | Purchasing-owned stock claims from Stock, PO or receipt evidence | BUILT | OperationApp:610 · portal-nav:444 · apps/web/src/pages/operation/OperationSupplierClaims.tsx:171 · CLAUDE.md:113 |
| Purchasing | Purchase Returns | Goods an approved claim outcome sends back | BUILT | OperationApp:611-614 · portal-nav:445 · docs/purchasing/MASTER.md:6010-6012 |
| Purchasing | Repair Orders | Direct inventory or Claim-linked repair order | BUILT | OperationApp:615 · portal-nav:446 · CLAUDE.md:110 |
| Purchasing | Display Requests | Staff enter one Display Request for showroom display goods | APPROVED | portal-nav:454 (Coming soon) · docs/ERP-ARCHITECTURE.md:407 · docs/COPY-STANDARD.md:1150-1151 |
| Purchasing | Consignment Orders | Instructs the supplier to provide consignment goods | APPROVED | portal-nav:455 (Coming soon) · docs/purchasing/MASTER.md:7044-7046 |
| Purchasing | Consignment Returns | Records supplier-owned goods handed back | APPROVED | portal-nav:456 (Coming soon) · docs/purchasing/MASTER.md:7099-7101 |
| Showroom | Carres | Goods in Carres-operated showrooms | BUILT | OperationApp:685 · portal-nav:452 · docs/COPY-STANDARD.md:1131-1135 |
| Showroom | Dealer | Dealer-operated showrooms; stays Coming soon | APPROVED | portal-nav:453 · docs/COPY-STANDARD.md:1135-1136 |
| Showroom | Ready Stock | Showroom staff find eligible Warehouse stock for urgent SOs | APPROVED | docs/ERP-ARCHITECTURE.md:368-370 |
| Warehouse | Arrival Schedule | Dated board of goods arriving | BUILT | OperationApp:689 · portal-nav:507-508 · docs/COPY-STANDARD.md:2530 |
| Warehouse | Pickup Schedule | Dated board of goods being picked up | BUILT | OperationApp:692 · portal-nav:524-525 · docs/COPY-STANDARD.md:2530 |
| Warehouse | Inbound | Register of goods owed in and their receipt | BUILT | OperationApp:695 · portal-nav:531-532 · docs/COPY-STANDARD.md:2573 |
| Warehouse | Inventory | The one current Unit Register | BUILT | OperationApp:684 · portal-nav:537 · docs/ERP-ARCHITECTURE.md:441 |
| Warehouse | Outbound | Register of goods leaving, loading and driver confirmation | BUILT | OperationApp:696 · portal-nav:539-540 · docs/COPY-STANDARD.md:2574 |
| Warehouse | Unit Detail (object) | One Unit by its permanent Carres Unit ID | BUILT | OperationApp:531 · docs/COPY-STANDARD.md:2579 |
| Warehouse | Arrival source (object) | Create and review one non-PO inbound source | BUILT | OperationApp:697-699 |
| Delivery | Monitor | Daily delivery arrangement, assignment, confirmation and calendar | BUILT | OperationApp:626 · portal-nav:472-473 · docs/delivery/MASTER.md:709-711 |
| Delivery | Delivery Orders | The formal Delivery Order register | BUILT | OperationApp:526 · portal-nav:479-480 · docs/delivery/MASTER.md:712 |
| Delivery | Delivery Order (object) | One formal DO, its evidence and history; a door on a number | BUILT | OperationApp:527 · docs/delivery/MASTER.md:713 |
| Payments | Monitor | Collection control listing keyed on the Sales Order | BUILT | FinanceApp:118 · portal-nav:562-563 · docs/payment/MASTER.md:158 |
| Payments | Payment collection page (one SO) | The opened Monitor row: money, storage, history, customer | BUILT | apps/web/src/pages/finance/PaymentMonitor.tsx:471 · docs/COPY-STANDARD.md:2685-2686 |
| Payments | Payment Records | The only permanent incoming-customer-money listing | BUILT | FinanceApp:119 · portal-nav:572-573 · docs/payment/MASTER.md:488 |
| Payments | Payment Record (object) | One payment: facts, allocation, evidence, receipt, history | BUILT | apps/web/src/pages/finance/PaymentRecords.tsx:163 · docs/COPY-STANDARD.md:2717-2718 |
| Customer Care | Service Cases | Customer complaint or service-request record | BUILT | OperationApp:719 · portal-nav:589-590 · docs/service/MASTER.md:46-47 |
| Customer Care | Service Case (object) | One Case, opened by deep link | BUILT | apps/web/src/pages/operation/OperationServiceCases.tsx:41 |
| Customer Care | Service Register, Working Panel, Object page (target) | Target Service UI, waiting for the UI MASTER's kit | PROPOSAL | docs/service/MASTER.md:650 |
| Customer Care | Guarantees | Look up a guarantee or care plan on an item | BUILT | OperationApp:721 · portal-nav:595-598 · docs/guarantee/MASTER.md:6-8 |
| Master Data | Catalog | Costing catalog door (SKU Master, Modular, Fabric) | BUILT | OperationApp:680 · portal-nav:579-583 · CLAUDE.md:103 |
| Master Data | Suppliers | Supplier roster | BUILT | OperationApp:704 · portal-nav:584-586 |
| Master Data | Supplier items | The supplier's own item code joined to ours | BUILT | OperationApp:705-709 · portal-nav:587 |
| Admin | Settings | The one central Settings destination (page-header gear) | BUILT | OperationApp:537-539 · docs/ERP-ARCHITECTURE.md:435-437 |
| Admin | Settings → Staff & Duties | The one company-wide duty assignment surface | BUILT | apps/web/src/pages/operation/SettingsWorkspace.tsx:192 · docs/COPY-STANDARD.md:2088 |
| Admin | Settings → Sales Orders · Purchasing · Payment · Issue Tracker · Warehouse · Delivery | Each module's settings inside central Settings | BUILT | apps/web/src/pages/operation/SettingsWorkspace.tsx:200-208 |
| Admin | Reports (central destination) | Central Reports in the IA; no Operation rail row today | APPROVED | docs/ERP-ARCHITECTURE.md:430-431 |
| Admin | Reports → Receiving & Inbound | Every non-draft receiving session with its GRN, plus still owed | BUILT | OperationApp:599-601 · docs/COPY-STANDARD.md:2094 |
| Admin | Reports → Delivery | Central delivery report | BUILT | OperationApp:602-604 · docs/COPY-STANDARD.md:819 |
| Admin | Reports → Purchasing | Central purchasing report | BUILT | OperationApp:620-623 · docs/COPY-STANDARD.md:3227 |
