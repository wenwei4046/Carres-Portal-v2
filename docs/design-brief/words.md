# Words — the dictionary for the Operation portal

| Key | Meaning |
|---|---|
| `COPY` | docs/COPY-STANDARD.md |
| APPROVED | ruled in COPY (built state not claimed) |
| APPROVED / NOT BUILT | COPY itself says the target is not built |

## Exact UI words

| Exact UI word | Where used | Source | Label |
|---|---|---|---|
| `Assign` | Worklist verb: an internal decision, we choose who | COPY:1907 | APPROVED |
| `Call` | Worklist verb: ask a named outside party; result recorded | COPY:1908 | APPROVED |
| `Issue` | Worklist verb: the system produces a formal document | COPY:1909 | APPROVED |
| `Upload` | Worklist verb: evidence is attached | COPY:1910 | APPROVED |
| `Close` | Worklist verb: a case or claim is finished and sealed | COPY:1911 | APPROVED |
| `Return` | Worklist verb: a record goes back to whoever produced it | COPY:1912 | APPROVED |
| `Check` | Worklist verb: a missing fact is found out and recorded | COPY:1913 | APPROVED |
| `Approve` | Worklist verb: permit a purchase; the label names what | COPY:1914 | APPROVED |
| `Decide` | Worklist verb: Carres chooses between existing outcomes | COPY:1915 | APPROVED |
| `Check in` | The act of counting goods that physically arrived | COPY:1926 · COPY:2507 | APPROVED |
| `Save` · `Cancel` | Form buttons only, never worklist actions | COPY:1835-1837 | APPROVED |
| `Add line` · `Remove` · `Restore` | Line-list form controls | COPY:1848-1850 | APPROVED |
| `Issue PO` | Raise a purchase order to a factory, one act | COPY:2504 | APPROVED |
| `Order` (or `SO-1207`) | The customer's own order | COPY:2514 | APPROVED |
| `PO` | The purchase order document | COPY:2513 | APPROVED |
| `GRN` | The document the Check in act produces | COPY:2508 | APPROVED |
| `SO No` · `PO No` · `DO No` | Document number labels | COPY:2621-2623 | APPROVED |
| `MPR No` | Manual Purchase request number | COPY:1540 | APPROVED |
| `Unit ID` | Identity of one stock unit | COPY:2605 | APPROVED |
| `Placed` · `Proceed` · `Delivered` · `Cancelled` | Sales Order status | COPY:3755-3758 | APPROVED |
| `Waiting for goods from supplier` · `In Production` · `Receiving` · `Completed` · `Cancelled` | Purchase Order status | COPY:3127-3131 | APPROVED |
| `Sending not confirmed` | PO with no current-version sending confirmation | COPY:3118 · COPY:3164 | APPROVED |
| `Created` · `Out for delivery` · `Delivered` · `Failed Delivery` · `Partially Delivered` · `Cancelled` | Delivery Order document status | COPY:3467-3471 | APPROVED |
| `Available` · `Reserved` · `Cannot sell` | Inventory Status of a Unit | COPY:2586 | APPROVED |
| `To purchase` · `Awaiting goods` · `Partially ready` · `Ready` | Sales Order Stock Status | COPY:5016 | APPROVED / NOT BUILT |
| `Ready for delivery` · `Not ready for delivery` | Order Route delivery release | COPY:2747-2748 | APPROVED |
| `Payment recorded` · `VOIDED` | Payment Record header state | COPY:2717 | APPROVED |
| `Paid in full` | SO register money cell, fully settled | COPY:2616 | APPROVED |
| `Proceed Date` | The ACTUAL date Sales handed the order to Operations (hand-off) | COPY:1328 · COPY:3668 | APPROVED |
| `Planned production start` | Sales' PLANNED production start; never a fact | COPY:2518 | APPROVED |
| `PO Delivery Date` | The original official supplier-facing date on the PO | COPY:1363 · COPY:220 | APPROVED |
| `Supplier Confirmed Delivery Date` | The supplier's evidenced delivery answer | COPY:1250 | APPROVED |
| `Requested Delivery Date` | The date the customer asks Carres to deliver on | COPY:2611 | APPROVED |
| `Scheduled delivery` · `Scheduled time` | Day and optional time Logistics arranged | COPY:2612-2613 | APPROVED |
| `SO Doc Date` | The day the Sales Order was taken | COPY:2740 | APPROVED |
| `Goods Received Date` | Physical arrival date and time of goods | COPY:2053 | APPROVED |
| `Outstanding` | Register column: what the customer still owes HQ | COPY:2615 · COPY:2641 | APPROVED |
| `Balance due` · `RM {amount} unpaid` | Customer money on Payment and Work surfaces | COPY:2673 | APPROVED |
| `Not recorded` | A register cell with no value | COPY:2844 | APPROVED |
| `No PO yet` · `No DO yet` | SO register when no PO or DO exists yet | COPY:2847 | APPROVED |
| `Coming soon` | A rail entry for an approved page not yet built | COPY:2381 · COPY:2389 | APPROVED |
| `Delay planning` | Working out what to do about a delay | COPY:2523 | APPROVED |
| `delivery photo` | Photo proving a delivery happened | COPY:2519 | APPROVED |
| `Logistics` | The company doing transport and customer contact in Delivery | COPY:2526 | APPROVED |
| `Deliver To` | Where the supplier must send the goods | COPY:2604 | APPROVED |
| `History` | Unit and Stock event history | COPY:2591 | APPROVED |
| `Workspace` · `My Task` · `Team Work` | Workspace page title and its two work scopes | COPY:4992 · COPY:197 | APPROVED |
| `Sales Orders` · `Outright Sales` · `Subscription` | Sales navigation parent and its two pages | COPY:4816-4818 | APPROVED |
| `Delivery` · `Monitor` · `Delivery Orders` | Delivery module and its two pages | COPY:3494-3496 | APPROVED |
| `Payments` · `Monitor` · `Payment Records` | Payments module and its two pages | COPY:2699 | APPROVED |
| `Inventory` · `Arrival Schedule` · `Pickup Schedule` | Warehouse pages | COPY:2529-2530 | APPROVED |

## Banned or retired words

| Banned / retired word | Use instead | Source |
|---|---|---|
| `Chase` | `Call {party}` with a measurable object | COPY:2446 · COPY:505-507 |
| `POD` · `Proof of Delivery` | `delivery photo` | COPY:2446 · COPY:2519 |
| `Unscheduled` · `Not booked` · `need booking` | `No confirmed date` | COPY:2446 · COPY:3497 |
| `Pending` · `Processing` · `In Progress` | `Waiting {the exact thing}` as a state | COPY:2447 · COPY:2480-2482 |
| `Waiting` alone | `Waiting {the exact thing}` | COPY:2480 |
| `At Risk` · `Attention` | The fact and the work it names | COPY:2444 · COPY:2448 |
| `Customer Delivery` · `Deliver By` · `Promised Delivery` · `Customer 1st Requested Delivery` | `Requested Delivery Date` | COPY:2449 · COPY:2611 |
| `Movements` | `History` | COPY:2450 · COPY:2591 |
| `Recovery` (delay sense) | `Delay planning` | COPY:2450 · COPY:2523 |
| `Send` (as an action verb) | `Issue` | COPY:93 · COPY:1873-1876 |
| `Send PO` · `Prepare PO` · `Draft PO` | `Issue PO` | COPY:2504 |
| `Receive` (as a verb) · `Book in` | `Check in` | COPY:2507 |
| `Sales order` · `Job` · `Ticket` | `Order` or `SO-1207` | COPY:2514 |
| `Purchase order` · `P/O` | `PO` | COPY:2513 |
| `New` · `Draft` · `Pending` · `Open` (customer order) | `Placed` | COPY:2511 |
| `Confirmed` · `Approved` · `Green-lit` (customer order) | `Proceed` | COPY:2510 |
| `Void` · `Abandon` · `Kill` | `Cancel` | COPY:2512 |
| `Proceed Date` for the planned start | `Planned production start` | COPY:2518 |
| `Processing Date` | `Proceed Date` | COPY:3668 |
| `Open` as a PO status | `Sending not confirmed` or one of the five PO labels | COPY:3118 · COPY:3133-3134 |
| `Delivery exception` · `Failed` | `Failed Delivery` or `Partially Delivered` + one reason | COPY:3470 |
| `Completed` · `Closed` · `Done` (delivery) | `Delivered` | COPY:2614 |
| `Confirmed Delivery` | `Scheduled delivery` | COPY:2612 |
| `Balance` · `Balance owing` · `Amount due` · `Owing` | `Outstanding` | COPY:2641 |
| `Ship-to` · `Destination` · `Location` | `Deliver To` | COPY:2604 |
| `Serial` · `Item ID` | `Unit ID` | COPY:2605 |
| `Logistic` · `Carrier` · `Delivery partner` | `Logistics` | COPY:2526 |
| `Delivery Work` | `Delivery` | COPY:3489 · COPY:3494 |
| `Showroom` (where the order was sold) | `Sales Location` | COPY:2619 |
| `—` dash as a value or separator | The fact's word, two lines, or one clear line | COPY:3692-3706 |
| `Not given` · `N/A` · `—` · blank cell | `Not recorded` | COPY:2844 |
| `{first No} + {n} more` · `2 Purchase Orders` · popover | Every PO No on one line, comma-separated | COPY:2845 |
| `Purchase order details` table (SO Batch) | PO facts on the row listing | COPY:1511 |
| `Purchase requirement` · line `Note` (Manual Purchase) | `Configure` | COPY:1523 |
| `TBD` · `Not available` · `Not yet` · `Soon` alone | `Coming soon` | COPY:2391-2392 |
| `Today` · `Tomorrow` as a date | The actual day | COPY:3354-3356 · COPY:3903 |
| Warehouse `Monitor` | `Arrival Schedule` · `Pickup Schedule` | COPY:2530 |
