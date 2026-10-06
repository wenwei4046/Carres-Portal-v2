# Approvals — Operation area (part A)

| What needs approval | Who approves | Limit | Status | Source |
|---|---|---|---|---|
| Manual Purchase request (Approve / Refuse) | Purchasing Approver — an active Principal person; never the person who raised it | Every request; decide by its Order By date | BUILT | packages/shared/src/work-engine.ts:309; docs/workspace/MASTER.md:301; docs/workspace/MASTER.md:307 |
| Supplier claim with no reply after the extra days | Purchasing Approver (PO Duty keeps the chase) | After Reply expected + Extra days before escalation (starting value 2) | BUILT | packages/shared/src/work-engine.ts:532; docs/workspace/MASTER.md:2384 |
| Accept a supplier's changed price, keep the PO price, or cancel | Purchasing Approver (currently Jess) | Every price change; Operation never sees or types the amount | APPROVED | docs/purchasing/MASTER.md:1349; docs/purchasing/MASTER.md:1361 |
| Supplier disagrees with a cancellation, goods shipped, or a cancellation fee | Purchasing Approver (commercial exception); Finance handles money | UNKNOWN — ask Jess | APPROVED | docs/purchasing/MASTER.md:1802 |
| Unallocated purchased PO quantity: wait or cancel | Purchasing Approver (currently Jess) | Only wait or cancel; different goods need a new Manual Purchase | APPROVED | docs/purchasing/MASTER.md:1874 |
| Any required Repair Order approval | Jess alone, through her personal identity | UNKNOWN — ask Jess | APPROVED | docs/workspace/MASTER.md:2304 |
| Free storage request, mattress/bedframe total day 8–21 | Operation (Responsible Delivery Operation) | Through total day 21; exact end date; decide the same working day | APPROVED | docs/payment/MASTER.md:617; docs/payment/MASTER.md:658; docs/payment/MASTER.md:669; docs/payment/MASTER.md:711 |
| Free storage request, mattress/bedframe total day 22–30 | Storage Waiver Approver | Through total day 30; none from day 31; decide by next working day | APPROVED | docs/payment/MASTER.md:617; docs/payment/MASTER.md:659; docs/payment/MASTER.md:669; docs/payment/MASTER.md:712 |
| Free storage request, sofa | Nobody — sofa never offers extra free storage | Automatic 14 days only | APPROVED | docs/payment/MASTER.md:618; docs/payment/MASTER.md:632 |
| Overpaid or unallocated money | Payment Approver | Every overpayment; no clock | BUILT | packages/shared/src/work-engine.ts:361; docs/payment/MASTER.md:713 |
| Suspected wrong or duplicate payment | Payment Approver | UNKNOWN — ask Jess | APPROVED | docs/payment/MASTER.md:714 |
| Payment void or reallocation | Payment Approver | UNKNOWN — ask Jess | APPROVED | docs/payment/MASTER.md:831 |
| Finance exception (bank / payment evidence) | Finance Control Duty | Holds delivery until cleared with evidence | APPROVED | docs/payment/MASTER.md:715; docs/payment/MASTER.md:829 |
| Payment vouchers, cancel a confirmed bill or issued invoice, void a receipt | Finance Approver (Finance users only) | UNKNOWN — ask Jess | BUILT | packages/shared/src/workspace-duties-catalogue.ts:23; docs/workspace/MASTER.md:356 |
| Price decrease, customer refund, whole-SO cancel after Proceed | Sales Approver (active Principal person; may decide own request) | Every such request; ordinary amendments need none | APPROVED | docs/workspace/MASTER.md:314; docs/workspace/MASTER.md:348 |
| SO amendment on a line already on an issued PO | PO Duty records the supplier's confirmation first | Only lines covered by an issued PO | APPROVED | docs/workspace/MASTER.md:323 |
| Delivery with unpaid money | Nobody — no approval door exists | Delivery Order needs Balance due RM 0 and no open Finance exception | APPROVED | docs/payment/MASTER.md:815; docs/payment/MASTER.md:817 |
| SO delivery charge change | Nobody — system-priced, no manual approval lane | Operation cannot edit, discount or waive it | APPROVED | docs/workspace/MASTER.md:344; docs/delivery/MASTER.md:452 |
| Delivery charge approval (other uses) | Delivery Charge Approver | UNKNOWN — ask Jess | APPROVED | docs/ERP-ARCHITECTURE.md:218; docs/delivery/MASTER.md:456 |
| Stock adjustment, write-off, major dispute | Stock Adjustment Approver | UNKNOWN — ask Jess | APPROVED | docs/stock/MASTER.md:55; docs/stock/MASTER.md:466 |
| Formal Service Case repair / replacement / charge / customer movement | Service Case Approver | Every formal decision; due next Office working day | APPROVED | docs/service/MASTER.md:520; docs/service/MASTER.md:592 |
| Goodwill, waived charge, refund, declined eligible claim, public escalation | Service Case Approver | Every such decision | APPROVED | docs/service/MASTER.md:610 |
