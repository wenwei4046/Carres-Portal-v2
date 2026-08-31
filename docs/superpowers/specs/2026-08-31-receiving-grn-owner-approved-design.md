# Receiving / Goods Receipt / GRN — Owner-Approved Design

**Status:** OWNER-APPROVED — all eight review sections approved on 31 Aug 2026
**Scope:** Purchasing → Receiving → Goods Receipt / GRN → Stock / Claim / Return
**Delivery state:** design authority only; no implementation, migration or production deployment

## 1 · Final names

These concepts deliberately do not share one name:

| Concept | Carres word |
|---|---|
| navigation, page and register | `Receiving` |
| one physical delivery being worked | `Receiving Session` |
| posted inventory transaction | `Goods Receipt` |
| numbered official document | `GRN`; formal title `GOODS RECEIPT NOTE` |
| document number | `GRN No.`; stored `GRN-YYYYMMDD-RRRR` |
| supplier evidence | `Supplier DO No.` · `Signed DO photo` |
| primary actions | `Start Receiving` · `Save Receiving` · `Send count` · `Check in` · `Return count to {warehouse}` |

`Goods Receipts` is retired as navigation. `GRN` is a document, never the process or an action.

## 2 · One governed flow

```text
Manual Purchase ─┐
                 ├─ approved demand → one Purchase Order authority
SO Batch Purchase┘
→ Purchase Orders owns supplier issue, answer, evidence and Supplier Delivery Date
→ one Receiving engine owns physical count, posting and formal GRN
→ Stock receives only the governed physical consequence
→ Service Case / Supplier Claim / Return owns later continuations
```

Manual Purchase and SO Batch Purchase remain separate demand doors. Neither may create its own PO
writer or receipt lane. A PO or CO is the only Receiving source. The source's `Deliver To` is
authoritative: the normal default is the configured Carres warehouse; a showroom is an explicit
source exception.

Purchase Orders preserves four different time facts: `PO Issued`, original `PO Delivery Date`,
supplier's current `Supplier Delivery Date`, and Receiving's actual `Goods Received At`. Work-date
arithmetic never silently changes any of them.

## 3 · Page and layout

Receiving reuses the approved Shell, Register, Object Detail, GoodsMiniTable and Work Engine. It is
not a dashboard and it does not create a local Work store.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ GLOBAL HEADER                                                               │
├───────────────┬──────────────────────────────────────────────────────────────┤
│ PURCHASING    │ Receiving                                                   │
│               │ See what should arrive and record what actually arrived.    │
│ SO Batch      ├──────────────────────────────────────────────────────────────┤
│ Manual        │ Search…                                      [Start Receiving]│
│ Purchase      ├───────────────┬──────────────────────────────────────────────┤
│ Orders        │ RECEIVING DATE│ REGISTER                                     │
│ Receiving     │ Late          │ PO / CO open-balance parent                  │
│               │ six work dates│   └─ Receiving Session / posted GRN          │
│ Problems…     │ Later         │                                               │
│               │ No date       │                                               │
│               ├───────────────┴──────────────────────────────────────────────┤
│               │ fixed governed register footer                              │
└───────────────┴──────────────────────────────────────────────────────────────┘
```

The page header is 50px, toolbar 45px and `RECEIVING DATE` rail 240px. A row inspection expands
inline. Actual receiving work opens the full object workspace. At narrow width the same hierarchy
stacks; it never becomes a different mobile information model.

The full Register has no enclosing four-sided outer border. The toolbar bottom divider, table grid
lines and footer top divider preserve the governed Register structure.

## 4 · Register and date rail

The Register parent is one open PO/CO delivery balance. Each physical Receiving Session or posted
GRN discloses beneath it. Default columns are:

`GRN No.` · `PO No.` · `PO Issued` · `Supplier` · `Deliver To` · `PO Delivery Date` · conditional
`Supplier Delivery Date` · `Goods Received At` · `Order Qty` · `Received Qty` · `Damaged Qty` ·
`Wrong Item Qty` · `Pending Delivery Qty` · `Supplier DO No.` · `Unit ID`.

There is no `Source`, purchase-origin, `Arrival Date`, `Expected`, `Accepted`, `Rejected`, status or
Work column. `Supplier Delivery Date` appears as the additional changed date; unchanged rows read
`Same as PO`.

The rail is `RECEIVING DATE`: `Late`, six actual Warehouse working dates, `Later`, and
`No delivery date`. It shows zero counts. Warehouse work is Monday–Saturday, excluding Sunday and
Selangor public holidays. Office supplier work is Monday–Friday. A Saturday or Monday arrival
creates confirmation work on Friday, or the preceding valid Office day when Friday is a holiday.

The default result set shows every open balance, sorted late first and then by governed arrival
date. My Work and Team Work deep-link the exact PO or Receiving Session; Receiving has no second
Work panel.

## 5 · Object Detail

`Start Receiving` creates one persistent autosaved Draft. Internal lifecycle is `draft` →
`submitted` → `returned` or `posted` → optional governed `amended` / `voided` events. These states
are not a Register status column.

Draft, count and review use one full-width operational workspace. It shows source PO/CO, supplier,
Deliver To, four date facts, Supplier DO evidence, one line per ordered item, exact Unit IDs where
required, quantity facts, exception evidence and append-only History.

Carres-station staff use `Save Receiving`. External Warehouse staff use `Send count`; missing
required evidence keeps an autosaved Draft visible and the button names the exact gap. Warehouse
submission moves no Stock and creates no GRN. GRN Duty uses `Check in` or
`Return count to {warehouse}`. Both entrances converge on the same posting authority.

A posted record is read-only. At 1130px and wider it may use 50% operational facts plus 50% official
`GOODS RECEIPT NOTE` preview. Below 1130px the GRN preview stacks after the facts. Amend and Void are
explicit governed events; they never turn a posted form into a silent editor.

## 6 · Operator journeys

| Situation | Operator journey and consequence |
|---|---|
| supplier delay or changed date | PO Duty opens the exact PO from My Work, asks the supplier and records the real answer, channel, evidence, reporter/recorder and times. Original PO Delivery Date stays fixed; the current Supplier Delivery Date changes and History keeps the earlier promise. |
| full receipt | Record DO, Goods Received At, correct quantities, evidence and Unit IDs; authorised `Check in` posts one Goods Receipt/GRN. Correct Units enter Stock and Pending Delivery Qty becomes zero. The PO becomes Completed only when no purchasing action remains. |
| partial receipt | Post only the correct quantity physically received. Pending Delivery Qty stays open and PO Duty receives balance-date work. Partial receipt alone is not damage and opens no Claim. |
| rejected on arrival | Record damaged or wrong quantity, exact Units, observable reason, photos and hand-back proof. It creates no available Stock and does not reduce Pending Delivery Qty. Open a Claim only when a supplier result is required. |
| over-delivery | Record Extra Qty, exact Units and evidence. Never silently accept it or reduce Pending Delivery Qty. Keep it out of available Stock while the governed supplier exception decides the continuation. |
| damage found later | Keep the posted GRN sealed. Open a Service Case; an authorised supplier-responsible outcome creates the linked Supplier Claim and only then a repair, replacement or return continuation. |
| Supplier DO missing | Preserve the autosaved Draft and physical facts, but refuse formal posting. Work names the missing DO/evidence and opens the same session. A GRN exists only after the evidence gate passes. |
| Unit ID missing or wrong | Never mint a second identity. Record label evidence, return the count for correction when needed, and require the expected PO/CO Unit ID before posting. A replacement label keeps the original Unit ID and History. |
| supplier direct to showroom | The PO must explicitly name the showroom as Deliver To. Rostered showroom staff count, sign and submit through the same Receiving Session; GRN Duty posts and Stock records the showroom location and governed ownership. |
| supplier consignment | Start from the CO and use the same Receiving engine. Preserve supplier ownership, exact Unit IDs and showroom location. The Goods Receipt/GRN creates no supplier payable and there is no Consignment Receipt page. |
| Purchase Return | Only an approved Claim/outcome creates the Return. Issuing its document does not move custody. Exact-Unit scan/count, collector, actual time and handover proof create the Stock consequence; partial collection leaves the remainder open. |

## 7 · Exact two-line action copy

Every open action uses a current fact/problem followed by one exact action. Owner avatar, normal
Duty, dated cover, due date and late state are structured metadata, never sentence text.

### Supplier work

| Fact / problem | Exact action |
|---|---|
| `Supplier Delivery Date is missing` | `Ask {supplier} for the delivery date` |
| `The goods are due on {weekday, date}` | `Confirm {supplier}'s {weekday, date} arrival` |
| `The Supplier Delivery Date passed on {weekday, date}` | `Ask {supplier} when the goods will arrive` |
| `Supplier answer evidence is missing` | `Upload the WhatsApp or email, or write the call note` |
| `The balance delivery date is missing` | `Ask {supplier} for the balance delivery date` |

### Receiving gates

| Fact / problem | Exact action |
|---|---|
| `The goods are due on {weekday, date}` | `Check in {document} from {supplier}` |
| `The warehouse count is ready` | `Check in {document} from {supplier}` |
| `Supplier DO is missing` | `Add the Supplier DO before you finish receiving` |
| `Signed DO photo is missing` | `Upload the signed DO photo` |
| `Goods Received At is missing` | `Enter when the goods arrived` |
| `Unit ID is missing for {item}` | `Scan the Unit ID shown on {document}` |
| `Unit ID {unit id} is not on {document}` | `Check the label and scan the correct Unit ID` |
| `The count needs changes` | `Fix the named items and return the count to Carres` |

### Exceptions and continuations

| Fact / problem | Exact action |
|---|---|
| `Damage evidence is missing` | `Take photos and say what is damaged` |
| `Wrong item details are missing` | `Choose what is wrong and take photos` |
| `Extra goods were found` | `Record the Unit IDs and keep them out of available stock` |
| `The extra goods need a supplier answer` | `Ask {supplier} what to do with the extra goods` |
| `Supplier DO {do number} was already used for {grn number}` | `Open {grn number}. Do not create another GRN` |
| `Damage was found after {grn number} was posted` | `Open a Service Case for {unit id}` |
| `The supplier claim has no reply` | `Ask {supplier} to reply to the supplier claim` |
| `The supplier collection date is missing` | `Ask {supplier} for the collection date` |
| `Return handover proof is missing` | `Upload the signed proof and record who collected the Units` |
| `Some return Units are still with Carres` | `Ask {supplier} when the remaining Units will be collected` |

Opening WhatsApp/email or dialling a number completes nothing. Completion comes only from the
owning module's recorded answer and required evidence. Generic `Invalid`, `Failed`, `Pending`, bare
`Follow up` and unexplained disabled buttons are forbidden.

## 8 · Permission, evidence, numbering, audit and boundaries

### Permission

| Role | May do | May not do |
|---|---|---|
| Warehouse / rostered showroom staff | count, scan, inspect, attach evidence and submit | post a GRN, change the PO/ownership or make Stock available |
| GRN Duty / dated cover | receive directly, review, return a count, post, amend and void | change PO price, ordered quantity, supplier promise or ownership agreement |
| Jess / Operations Superuser | use the same governed operational doors | impersonate Duty, bypass evidence or create a second writer |
| PO Duty / dated cover | own supplier answers, balance dates, Claims and collection-date work | post Stock merely because they own the PO action |
| Stock / Warehouse authority | own Unit custody, location, condition and availability consequences | rewrite Receiving, PO or Supplier DO facts |
| Finance / AP | read approved PO/GRN consequences for invoice, credit and settlement | edit receipt, Unit, delivery or PO facts |
| Administrator | govern rosters, calendars, destinations, permissions and number versions | alter historical documents silently |
| Owner / Audit | read all records and evidence | bypass required source/evidence without explicit governed authority |

### Posting evidence

The posted record freezes the exact PO/CO version, supplier, Deliver To, physical location,
Supplier DO reference/photo, Goods Received At, all five governed quantities, Extra Qty, required
Unit IDs and outcomes, exception reasons/photos, counter, submitter, poster and event times. Later
Supplier Master or source display changes never rewrite the GRN.

### Number and correction law

Draft/submitted sessions have no GRN number. Successful posting allocates and stores exactly one
`GRN-YYYYMMDD-RRRR`; `YYYYMMDD` is the formal posting date in Malaysia time, never a substitute for
Goods Received At. Retry returns the same number and applies Stock once. Reprint keeps the number.
Amend keeps the number and appends correction evidence. Void keeps the old number searchable and
never reuses it; a replacement receipt receives a new number linked to the voided GRN.

### Audit and effects

The append-only ledger records Draft started, Count submitted, Count returned, Count resubmitted,
GRN posted, amended, voided and evidence added. Every event preserves source version, normal Duty,
dated cover, actual actor, capability, reason, evidence and Malaysia time. `Goods Received At`,
submitted at and posted at remain three different facts.

Only Receiving may move `purchase_order_lines.received_qty`. Only valid Received Qty reduces Pending
Delivery Qty and enters Stock. Damaged, wrong and extra goods never become available or reduce the
balance. If Carres physically holds a problem Unit, Stock may record protected `Not available`
custody without treating it as valid receipt. Consignment preserves supplier ownership and creates
no payable.

### External boundaries

WhatsApp/email is evidence, not authority. A future supplier portal must write the same PO/CO/Claim
records. AutoCount/Finance may receive approved references but cannot own receipt or Unit truth.
Warehouse/showroom mobile surfaces expose only assigned count, scan, observation and evidence work.
Work deep-links and projects completion but never writes it. No production migration may be applied
without the repository's separate governed migration approval.

## 9 · Failure and concurrency law

- Duplicate PO/CO + Supplier DO names the earlier GRN and refuses another.
- An already submitted Warehouse session refuses Office direct receiving and opens the same session.
- Missing/invalid Unit result, Supplier DO or signed evidence refuses posting with the exact fix.
- A changed source or receipt version refuses the stale save and requires reload.
- Posting locks the session, is idempotent and calls Stock consequences once.
- Over-delivery enters an exception; no general receive endpoint may accept it silently.
- Posted evidence is never deleted or overwritten; governed Amend/Void events preserve lineage.

## 10 · Acceptance and release gates

Implementation is complete only when the exact production SHA proves:

- real Manual Purchase and SO Batch Purchase both reach the same PO and Receiving writer;
- real PO, CO, full, partial, damaged, wrong, extra and missing-evidence records follow this design;
- My Work/Team Work shows real supplier, Receiving and continuation actions with duty/cover/actor
  separation and correct Office/Warehouse calendars;
- one real Warehouse-calendar posting creates one searchable formal GRN and one Stock consequence;
- posted GRN preview and print/reprint preserve number, evidence and immutable source snapshot;
- desktop and narrow-width browser walks pass with real permitted accounts and no sample staff or
  fake supplier/order data;
- tests, typecheck, lint, migration law, build, secret-bundle check and repository delivery gates
  pass;
- governed migration approval, deployment and production verification are reported separately.

This design does not authorise changing SO Batch Purchase, the Purchase Orders delivery task or any
production migration outside the named seams.
