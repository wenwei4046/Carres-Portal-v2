# Records — the six business records staff read and act on

| Key | Meaning |
|---|---|
| APPROVED | the word or fact is ruled in a MASTER or COPY-STANDARD (built state not claimed) |
| APPROVED / NOT BUILT | the source itself says the target is not built |
| PROPOSAL | the source marks it PROPOSAL / NOT LAW |
| Paths | `COPY` = docs/COPY-STANDARD.md |

## SO — Sales Order

| Field | Meaning | Source | Label |
|---|---|---|---|
| SO No | The customer order's own document number | COPY:2621 · COPY:3666 | APPROVED |
| SO Doc Date | The day the Sales Order was taken | COPY:2740 · COPY:3667 | APPROVED |
| Proceed Date | Actual date Sales handed the complete order to Operations | COPY:1328 · COPY:3668 | APPROVED |
| Planned production start | Sales' planned production start; a plan, never a fact | COPY:2518 | APPROVED |
| Requested Delivery Date | The date the customer asks Carres to deliver on | COPY:2611 | APPROVED |
| Scheduled delivery | The delivery day Logistics arranged | COPY:2612 | APPROVED |
| Sales Location | Where the order was sold: the outlet, else the dealer | COPY:2619 | APPROVED |
| Salesperson | Who the customer calls | COPY:3671 | APPROVED |
| Customer | The customer, with Emergency contact and Billing | COPY:2798 | APPROVED |
| Delivery | Address, building type, floor, lift, stair carry | COPY:2805 | APPROVED |
| Items | The goods sold on the order | COPY:2799 | APPROVED |
| Goods · Services · Total payable · Paid to date · Balance due | The SO money totals on page and PDF | COPY:2804 | APPROVED |
| Outstanding | Register column: what the customer still owes HQ | COPY:2615 · COPY:2641 · CLAUDE.md:570 | APPROVED |
| PO No | Every linked PO number, comma-separated, each a link | COPY:2845 · docs/orders/MASTER.md:1093-1094 | APPROVED / NOT BUILT |
| DO No | One DO is a link; several open `{n} Delivery Orders` | COPY:2846 | APPROVED |
| Stock Status | Goods readiness of the order's lines | COPY:5014-5016 | APPROVED / NOT BUILT |
| Order Route | Fact-derived document, fulfilment and obligation map | COPY:2627 | APPROVED |
| Revisions | Complete immutable versions of one SO | COPY:2625 | APPROVED |
| History | Append-only events on one SO | COPY:2626 | APPROVED |

Statuses (exact words): `Placed` · `Proceed` · `Delivered` · `Cancelled` — COPY:3755-3758. Delivery release line: `Ready for delivery` · `Not ready for delivery` — COPY:2747-2748. Stock Status (APPROVED / NOT BUILT): `To purchase` · `Awaiting goods` · `Partially ready` · `Ready` — COPY:5016.

## PO — Purchase Order

| Field | Meaning | Source | Label |
|---|---|---|---|
| PO No | The purchase order's document number | COPY:2622 | APPROVED |
| PO Version | Current official version, e.g. `PO-260903-4389-V1` | COPY:3163 | APPROVED / NOT BUILT |
| Supplier | The factory the PO is issued to | COPY:3180 | APPROVED |
| Supplier Deliver To | Where the supplier must send the goods | COPY:3180 · COPY:2604 | APPROVED |
| PO Doc Date | The PO document's date | COPY:3180 | APPROVED |
| PO Delivery Date | The original official supplier-facing date on the PO | COPY:1363 · COPY:220 | APPROVED |
| Supplier Confirmed Delivery Date | The supplier's evidenced answer; `Not confirmed` until then | COPY:1250 · COPY:2098 | APPROVED |
| Sent | Current-version sending evidence: `PO sent to supplier · {channel} · {date}` | COPY:3164 · COPY:3180 | APPROVED |
| Order Qty | Total quantity on the current PO | COPY:3160 | APPROVED |
| Received Qty | Correct, accepted quantity posted through Receiving | COPY:3161 | APPROVED |
| Pending Delivery Qty | Order Qty minus Received Qty, in pieces | COPY:3162 | APPROVED |
| Current action | The PO page's one work block and its one primary button | COPY:3180 | APPROVED |

Statuses (exact words): `Waiting for goods from supplier` · `In Production` · `Receiving` · `Completed` · `Cancelled`; no current sending confirmation reads `Sending not confirmed`; `Open` is never shown — COPY:3117-3118 · COPY:3127-3134. SO Batch `PO Status` (a separate cell): `Pending` · `Partial` · `Done` — docs/purchasing/MASTER.md:2695-2697 (conflicts with banned `Pending`, see unknowns.md).

## GRN — Goods Received Note

| Field | Meaning | Source | Label |
|---|---|---|---|
| GRN No | The document the receiving act produces | COPY:2508 · COPY:2081 | APPROVED |
| Goods Received Date | Physical arrival date and time, not key-in time | COPY:2053 | APPROVED |
| Supplier DO No | The supplier's own DO number; never invented | COPY:2054 | APPROVED |
| Signed DO photo | Photo of the signed supplier DO | COPY:2055 | APPROVED |
| Goods arrived at | Where the goods physically arrived | COPY:2074 | APPROVED |
| Arrival evidence | Photo and video of the physical arrival | COPY:2077 | APPROVED |
| Order Qty · Received Qty · Damaged Qty · Wrong Item Qty · Pending Delivery Qty | Separate receiving quantities; damage never reduces Pending | COPY:2050 | APPROVED |
| Extra Qty | Goods not on the source PO or CO, kept separate | COPY:2075 | APPROVED |
| Per-Unit outcome | `Received` · `Received with issue` · `Not received` | COPY:2078 | APPROVED |
| SO No / MPR No / CO No / RO No · PO No | The receipt's linked source documents | COPY:2097 | APPROVED |
| Items | The GRN paper's own line words | COPY:2099 | APPROVED |

Statuses (exact words): a normal GRN shows no status label; only `Cancelled` (APPROVED / NOT BUILT); `Posted` and `Voided` stay internal — COPY:2081.

## DO — Delivery Order

| Field | Meaning | Source | Label |
|---|---|---|---|
| DO No | The delivery order's document number; a door to the DO | COPY:2623 | APPROVED |
| DO Date · SO No · Customer · Requested Delivery Date | Register identity and request facts | docs/delivery/MASTER.md:1570-1572 | APPROVED |
| Scheduled delivery · Scheduled time | Day Logistics arranged; time only when recorded | docs/delivery/MASTER.md:1570-1572 · COPY:2612-2613 | APPROVED |
| Logistics · Assigned Driver · Vehicle | Transport company and the person, always separate | COPY:2549 | APPROVED |
| Delivery Location | Where the goods go | docs/delivery/MASTER.md:1571-1572 | APPROVED |
| Driver submission | Photos, videos and signed Delivery Order, each a door | docs/delivery/MASTER.md:1572 · docs/delivery/MASTER.md:1582-1583 | APPROVED |
| Status (line 2 reason) | The ONE reason under a failed or cancelled document | docs/delivery/MASTER.md:1576-1577 | APPROVED |

Statuses (exact words): document ladder `Created` · `Out for delivery` · `Arrived` · `Delivered` · `Partially Delivered` · `Failed Delivery` · `Cancelled` — docs/delivery/MASTER.md:1575-1577. Monitor `Delivery Status` line 1 (a separate vocabulary): `Assign logistics` · `Get delivery date from {partner}` · `Get delivery date from customer` · `Waiting for customer reply` · `Scheduled` · `Transfer scheduled` · `Waiting for {partner} pickup` · `Collected by {partner}` · `Collected for transfer` · `On the way to customer` · `In transit to {stop}` · `Overdue` · `Arrived at {stop}` · `Delivered to customer` · `Failed Delivery` · `Transfer failed` · `Order details incomplete`; line 2 readiness `Ready` · `Goods not ready` · `Hold delivery` · `Driver and vehicle not recorded` — docs/delivery/MASTER.md:1360-1364 · docs/delivery/MASTER.md:1403-1419.

## Payment

| Field | Meaning | Source | Label |
|---|---|---|---|
| Paid date · Receipt No · Customer · SO No · Amount received · Method | One Payment Records row: money actually received | COPY:2713 | APPROVED |
| Goods · Storage · Total payable · Paid to date · Balance due | Money rows on the payment page | COPY:2687 | APPROVED |
| RM {amount} unpaid | The money still owed, as a fact line | COPY:2673 | APPROVED |
| Storage | The storage charge fact for the order | COPY:2703 | APPROVED |
| Payment timing | The one timing fact for collecting the money | COPY:2705 | APPROVED |
| Collection owner | The acting person from the shared Work item | COPY:2707 | APPROVED |
| Date · Payment received · Approval code · Collected by · Amount (RM) | The SO payment table's five columns | COPY:2803 | APPROVED |
| Payment facts · Allocated to · Evidence · Actions · Receipt · History | Payment Record sections | COPY:2718 | APPROVED |

Statuses (exact words): Payment Record `Payment recorded` · `VOIDED`, exception `RM {x} needs review` — COPY:2714 · COPY:2717. Payment timing: `Payment due today` · `Ask customer today` · `Customer promised to pay today` · `Payment should have been received` · `Arrival not confirmed` · `Storage Invoice not paid` · `No delivery date` · `Payment due {day}` · `Paid` — COPY:2705.

## Service Case

| Field | Meaning | Source | Label |
|---|---|---|---|
| Case No | `CSYYMM-NNNN` (Outright) · `SCSYYMM-NNNNN` (Subscription) | docs/service/MASTER.md:35-36 | APPROVED / NOT BUILT |
| Source record | Customer/SO, DO, Invoice/Payment, or New Case with no source | docs/service/MASTER.md:95-98 | APPROVED |
| Current step | Derived who + action + object sentence; never chosen | docs/service/MASTER.md:23-31 | APPROVED |
| First response due | Substantive first response within two Office working days | docs/service/MASTER.md:473 | APPROVED |
| Deadline | 14 working days from the day reported, derived | docs/service/MASTER.md:357 | APPROVED |
| Intake questions | `Who told us?` · `Which item?` · `What is wrong?` · `Can the customer still use it?` · `What does the customer ask for?` | docs/service/MASTER.md:709 | PROPOSAL |
| Policy result · Remedy · Movement · Charge | The recorded decision on the Case | docs/service/MASTER.md:702-705 | PROPOSAL |

Statuses (exact words): no status word; the Case prints a derived who + action + object sentence, and `Pending` · `In Progress` · `Follow-up` · `Resolved` are retired — docs/service/MASTER.md:23-31. Stage filter words (PROPOSAL): `Reported` · `Evidence` · `Decision` · `Arranging` · `Customer confirm` · `Closed` — docs/service/MASTER.md:701.
