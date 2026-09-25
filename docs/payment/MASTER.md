# PAYMENT — MASTER

**All listing appearance — APPROVED / NOT BUILT (Jess, 2026-09-17):** follow
[UI MASTER §6.7 Portal-wide listing readability](../ui/MASTER.md#portal-wide-listing-readability--built-2026-09-17-slice-1--authenticated-walk-owed).
This is the shared default, not a PO visual pilot. Preserve this module's filter content,
control types, special schedules and business behavior; no page-local appearance specification.


> **APPROVED / LOCKED by Jess, 2026-09-03; navigation, Monitor, Payment Records, collection
> timing, storage days and the DO boundary re-ruled by the owner 2026-09-12.** This is the only
> Payment Blueprint. It completely overwrites the former routine Refund, Bank Matching and storage
> model, and the former `Payments · Invoices` two-listing destination. Git is the history.
> **Customer payment posting convergence is PRODUCTION-VERIFIED.** The rest of this Blueprint is
> approved target truth and is not claimed built by that closure.
>
> Read `CLAUDE.md` → `docs/ERP-ARCHITECTURE.md` → this MASTER. Sales Orders owns the delivery
> money gate; Workspace owns people/duties; Payment never creates a second owner, calendar,
> product category or delivery fact.

**Numbering — APPROVED TARGET / NOT BUILT, owner 2026-09-23.** Outright invoice/receipt/credit
note: `INVYYMM-NNNN`, `RCYYMM-NNNN`, `CNYYMM-NNNN`. Subscription: `SINVYYMM-NNNNNN`,
`SRCYYMM-NNNNNN`, `SCNYYMM-NNNNN`. Fixed random suffixes allow leading zeros and independent
monthly pools. Existing allocation code and historical document examples below are implementation
evidence, not the new target. Financial formats require accounting/e-invoice validation before
live use. Preserve issued numbers and documents. Credit notes are not proof of cash refunds.
The complete approved numbering table and remaining limitations are in Orders MASTER,
External numbering privacy. No production cutover is authorized by this PLAN approval.

## 1 · Mission and ownership

Payment is **customer Money In**: what the customer paid, what is still needed, and what the
collection owner must do next. **催钱前先看货**: collection always reads goods readiness and the
delivery commitment before telling staff to contact the customer.

Payment owns canonical incoming Payment records and allocation; one outstanding arithmetic;
customer invoices and receipts; collection outcomes and promise-to-pay; storage commercial
settings, calculation, charge, collection and waiver evidence; payment corrections and reports.

Payment does not own SO value/revision/cancellation; physical stock facts; delivery booking and
partner proof; partner AP, tax, GL or external bank control; Catalog category; Workspace duty
assignment; or ordinary refunds.

## 2 · One money model

```text
Customer Order + immutable revision
 ├─ Invoice/charge ── issue · void · replacement lineage
 ├─ Payment ── amount · method · paid date · source · evidence
 │   ├─ Allocation(s)
 │   └─ Receipt snapshot
 └─ Storage case
     ├─ readiness + customer-delay witnesses
     ├─ effective rule snapshot + product-group charge(s)
     ├─ free-storage request/decision
     └─ invoice(s) · payment(s) · receipt(s)
```

All entry paths use one Payment posting service and idempotency key. Operation may post money
received in delivery/storage; the Responsible Delivery Operation — the order's collection owner —
may post normal collection. Neither writes a second `orders.paid` truth or receipt identity.

**THE MONEY RULE — OWNER RULING (Jess, 2026-09-25) · APPROVED / LOCKED. This overwrites the
former invoice-keyed model completely.**

```text
1  The customer pays (the deposit) → the order Proceeds → Operation receives the order
2  A balance remains → collect it before delivery (the collection clock below)
3  Balance due reaches RM 0 → the system issues the Invoice and Operation sends Receipt + Invoice
   to the customer together, in one message
```

`Balance due = Sales Order total payable − money received` — the Sales Order's own `orderMoney`,
the same figure the Sales Order page and PDF print as `Balance due`. **An Invoice never asks for
money.** The customer is asked to pay against the Sales Order (`SO No` and its `Balance due`); the
Invoice is the closing document, issued automatically the moment `Balance due` reaches RM 0 and sent
with the Receipt. There is no manual `Generate invoice` door and no draft/issue step for staff.
Unknown and zero differ. No screen recalculates `Balance due` or storage independently.

**PROPOSAL / NOT LAW — Storage (to be settled in the Storage segment of the 2026-09-25 Blueprint
review):** a storage charge is one more line of the same `Balance due`, not a separate Storage
Invoice that asks for money; the one closing Invoice prints it. Falsifier: the owner keeps the
Storage Invoice / Additional Storage Invoice as separate customer documents.

One successful `Record payment` atomically creates Payment, allocates it, updates derived
outstanding, mints one receipt, appends SO activity, and closes/recalculates Work. Failure rolls
everything back. Partial payment keeps the remainder open.

## 3 · Navigation, Monitor, Payment Records and the collection lifecycle

### Navigation — owner ruling 2026-09-12

For an ordinary ERP user Payment is not a Finance Portal. The sidebar carries one module:

```text
PAYMENTS
├─ Monitor
└─ Payment Records
```

`PAYMENTS` is the module heading; `Monitor` and `Payment Records` are its only two destinations.
There are no `Payments / Invoices` tabs, no standalone Invoices page, no standalone Receipts page
and no clickable parent page (the module row expands and opens `Monitor`, the named landing, as
every module row does under the shell grammar). The technical address stays `/finance/monitor` ·
`/finance/payments`; the retired `/finance/invoices` forwards to the Monitor keeping its
`?invoice=` / `?order=` / Calendar parameters; `/finance/refunds` and `/finance/recon` forward to
Payment Records. The finance role sees the same two destinations as the same module; its genuine
finance-only capabilities (AR · Bills · Payment Vouchers · Ledger · Reports · Other money in ·
Rental Approver) keep their own rows and are outside this Payment slice.

### Ownership Payment reads live and never copies

```text
Sales Order        customer Invoice documents (Sales · Storage · Additional Storage)
Payment            incoming Payment records, allocations, Receipt snapshots
Warehouse          goods readiness
Purchasing/Receiving   expected arrival facts
Delivery           confirmed delivery, Logistics Partner, Delivery Orders
Workspace          duties, cover, working calendars
```

### Payment Monitor

Payment Monitor is a full-width control listing keyed on the Sales Order: one row per Proceeded SO
whose `Balance due` is above RM 0 (owner ruling 2026-09-25 — the row is the Sales Order, never an
Invoice; an order with no Invoice is still a row). It is not a calendar, a document register, a KPI dashboard or a
second My Work.

**THE LISTING IS THE SALES ORDERS REGISTER'S DENSITY — owner direction 2026-09-25 (Payment
Blueprint segment 3; this overwrites the 2026-09-16 72px two-line row completely).** The Monitor reuses
the shared DataGrid exactly as the Sales Orders Register does: **40px rows, one fact per cell on one
line**, 13px cells, 11px headers, the same toolbar (search field · `Export` · `Columns`), sorting,
per-column filters and fixed 32px footer. Supporting facts (the customer's phone and references,
`includes storage`, the delivery time, the Logistics company) live in the row's expansion, not in a
second cell line. `SO No` and `Customer` are sticky; the sheet scrolls sideways inside itself;
content decides each column's width, never the sheet. Colour appears in ONE column only — `Payment
timing` (red past the deadline, amber for a promise/ask day) — every other cell is plain text, with
`Not ready` in amber as the single goods exception. Design record:
`docs/payment/design/monitor-status-rail.html`.

Columns, in exactly this order:

```text
SO No | Customer | Balance due | Items & Stock | Storage | Requested Delivery Date | Scheduled delivery | Payment timing | Owner
```

- **Owner** (new, 2026-09-25) — the acting person as avatar + name from the shared Work item (cover
  ring when covered; `Not assigned` link when nobody resolves); empty on a `Wait` row. The action
  word is not repeated here: it is the expansion's blue door and the Work card's line.

- **SO No** — line 1 the SO number, which opens the formal Sales Order; line 2 the customer's own
  reference(s) when recorded, else nothing. Never joined into one number.
- **Customer** — line 1 the name; line 2 the phone on record.
- **Balance due** = the Sales Order's total payable − money received (the one arithmetic; owner
  ruling 2026-09-25 — the word was `Amount needed` until then), right-aligned. Line 2 `includes storage RM {amount}` only while an issued
  Storage Invoice is inside it. An accrued, not yet issued storage charge stays in `Storage` as
  `RM {amount} so far` and never enters Balance due.
- **Items & Stock** — Delivery's own cell, Delivery's own arithmetic (`monitorGoodsOf` over the
  Stock register's allocated Units and Purchasing's recorded arrivals), for the whole Sales Order:
  `Ready` (green) / `Not ready` (orange) over `2 of 2` · `1 of 2 · 1 short` · `Arriving after the
  requested date`; a delivered order that still owes money says `Delivered`. Payment keeps no
  goods opinion of its own. `Ready` is not `Received`, and neither is `deliverable`. The cell opens
  the row at Delivery's read-only `Items, Services & Stock` panel (Item · Qty · Source · Status ·
  Location, the Unit and its PO door as the source evidence), so staff never leave Payment to judge
  the goods. A reader without Operation's orders read (Finance) sees `Stock facts are Operation's.`; a failed read says `Stock facts could not be loaded.`
- **Storage** — every real state on two lines, the same governed sentence: `No storage charge` ·
  `Free until Mon, 14 Sep` · `Sofa · Day 15` / `RM 200.00 so far` · `Free request waiting for
  approval` / `Estimated charge RM 150.00` · `Free storage approved` / `until Mon, 21 Sep` ·
  `Storage Invoice issued` / `RM 200.00 not paid`. The cell opens the row at its Storage section;
  it never edits a charge or a balance.
- **Requested Delivery Date** — Sales' request, in Delivery's words (`Fri, 18 Sep` · `To be
  confirmed` · `No delivery date`). It stays after Delivery confirms a different day.
- **Scheduled delivery** — Delivery's fact in Delivery's spelling (owner ruling 2026-09-24):
  `Scheduled` over `Thu, 22 Oct · 2 PM to 5 PM`, or over the day alone when no time was recorded
  (the time is optional); `Not scheduled` and nothing beneath while no day is recorded. **ONE FACT (Law D, 2026-09-16):** the
  row, the workspace, the collection clock and the Work Engine all read `invoiceConfirmedDelivery`,
  Delivery's ladder for the leg that reaches the customer — the live Delivery Order → Delivery's
  arrangement → the booking overlay only while its stage is `confirmed`. Payment used to read the
  overlay's `confirmed_date` alone, which Delivery's `Save confirmed delivery` never writes, so a
  day Delivery agreed never started the clock. A day with a door opens the §17 Calendar at that
  week. The clock anchors on the agreed day; the requested day is never taken as confirmed.
- **Payment timing** — the two-line fact/action surface. Line 1 the fact: `Payment due today` ·
  `Ask customer today` · `Customer promised to pay today` · `Payment should have been received` ·
  `Arrival not confirmed` · `Storage Invoice not paid` · `No delivery date` · `Payment due
  {day}`. Line 2 **the shared Work item's own action** beside its owner avatar — when an order
  carries two items, the one whose work is the printed fact (`Storage Invoice not paid` → the
  storage item). **No Work item ⇒ no action and no person**; only `Wait` stands alone, for the
  waiting facts. The owner is an avatar (accessible name = the acting person; hover `Normal owner:
  {name} · Today's cover: {name}` when covered), never a word in the line. When no owner resolves
  the avatar is `Not assigned`, whose name is `Nobody is assigned to this order. Assign it in
  Sales Orders → Team` and whose door is the Sales Orders Team (0504: the owner is the individual
  the Sales Order was dealt to). This is the ruled exception to the fact-only register cell (UI
  MASTER).
- Rows sort by risk: should have been paid · Storage Invoice not paid · promised today · due today
  · ask today · due later · waiting · no date · value not recorded. Sorting `Payment timing`
  returns to that order. The footer says `{n} orders · RM {x} unpaid`.
- **A row opens below itself (owner ruling 2026-09-16).** The chevron `Show payment details`, the
  `Items & Stock` cell and the `Storage` cell open the SAME collection workspace inside the
  listing, the way a Delivery row opens its brief; the picked day, filters, search, scroll and the
  row's place never move. The main row stays 72px; the details below it grow freely. Shared Work's
  `?invoice=` opens that order's row the same way on `All unpaid orders`; only money no longer on
  the Monitor (already paid) opens the full-page workspace.
- **THE RAIL IS THE STATUS RAIL — owner ruling 2026-09-25 (Payment Blueprint segment 2; this
  overwrites the 2026-09-16 Monday–Friday follow-up plan completely).** The collection desk asks
  *which orders need my hands now*; the week view (`what day`) belongs to Work's own Date rail with
  Module = Payment, so the two never repeat each other. One row per status, every status shown, a
  count of ORDERS on each, in four groups:

  ```text
  Status
  今天要动手 (Needs action)     Missed (red) · Ask customer today · Payment due today ·
                                Customer promised to pay today · Storage Invoice not paid*
  不用动，在等 (Waiting)        Payment due later · No delivery date · Waiting for goods
  别人的事 (Someone else's)     Finance hold · Needs review
  完成 (Done)                   Paid orders
  ──────────────────────────
  All unpaid orders
  ```

  - Picking a row narrows the listing to those Sales Orders (`?status=`); the count and the listing
    are one set by construction. Default = `Missed` when it is above 0, else `Ask customer today`,
    else `All unpaid orders`. A count is ORDERS; every row prints its number, `0` included.
  - `Missed` = `Payment should have been received` (the deadline, or the customer's promised day,
    has passed with money still owed). `Payment due later` = a clock exists but the ask day has not
    come. `Waiting for goods` = `Arrival not confirmed` (催钱前先看货). `Finance hold` and `Needs
    review` are other people's work shown so the desk is complete; they carry no Operation action.
    `Paid orders` = `Balance due` RM 0 — the row that gives a paid Sales Order its home: the listing
    prints `Paid` in `Payment timing` and its expansion holds the Documents (Receipts · Invoice ·
    Statement) and Communication History. *`Storage Invoice not paid` stands until the Storage
    segment settles whether storage folds into `Balance due`.
  - The group headings are the four English words above in the rail's governed group style (UI
    MASTER §6.7 rail style C); the Chinese here is the explanation, never on screen.
  - The rail keeps the governed collapse (below 1100px a 44px strip with `Show filters`; a drawer on
    a phone); collapsed, the sheet header repeats the picked status and its count. A role that
    cannot read the Work feed (Finance) sees the same statuses computed from Payment's own read and
    no owner avatars; an unanswered read prints no numbers (`Reading the collection desk…`); a failed
    read says `The collection desk could not be loaded.` with `Try again`.
- Completed payment work leaves the Monitor; historical money remains in Payment Records. A
  scoped `?order=` for a paid SO says `SO-{n} needs no payment right now. Its money is in
  Payment Records.`

**ONE DATE SPELLING (COPY-STANDARD's date law, corrected here 2026-09-14).** Every day on every
Payment surface is spelled `Wed, 12 Aug` — the year only when it is not the current year. This
MASTER's examples used to carry the full weekday (`Monday, 21 Sep`) while the rest of the portal
spelled `Mon, 21 Sep` through `fmtDate`, so the Monitor said `Sunday, 4 Oct` and the workspace the
row opens said `Sun, 4 Oct` for the same day. COPY-STANDARD is explicit that a second date spelling
is itself the defect, and the date law outranks a module's examples.

### Monitor versus shared Work

Shared `My Work / Team Work` remains the one owner-resolved daily Work Engine. Monitor is the full
collection control overview; My Work and Team Work show the same authoritative actions filtered by
owner and date. No second action record, completion fact, owner calculation or manual `Done`.
Work deep-links to the same collection workspace the Monitor row opens (`/finance/monitor?order=`).

### Payment inside Work — owner ruling 2026-09-25 · APPROVED / LOCKED (composition), NOT BUILT

Staff finish collection from Work OR from the Monitor; both open the same Work item, the same
Payment components and the same completion fact (`Balance due` = RM 0). Work's standard right
panel (`../workspace/MASTER.md` §5.10) is not changed; Payment occupies exactly three places in it,
and **one fact appears in one place**:

```text
Middle card (104px)   PAYMENT · {customer}          module · recipient
                      RM 1,800.00 unpaid            the problem — the money, once (#1635's word)
                      Ask customer to pay           the action
                      SO-1404                  ↗    the object is the Sales Order, never an Invoice
Summary               RM 1,800.00 unpaid / Ask customer to pay · {customer} / [Ask customer to pay] [Open SO-1404]
Order Route           Payment due Wed, 23 Sep       the deadline, once — the exception line under the route
                      (owner reconciliation 2026-09-25: `by {date}` and `Hold delivery` on Payment
                      surfaces are retired; `Hold delivery` stays Delivery's, Warehouse's and
                      Logistics' word, whose question is *can this be delivered*)
Customer card         collapsed: Delivery's own line, unchanged (no money repeated)
                      expanded PAYMENT section: [Ask customer to pay] [Record the result] [Record payment]
                      · Last answer {result · day} · Payment's Communication History (read, not copied)
```

**ONE PAYMENT SECTION, TWO FRAMES — owner approval 2026-09-25.** The three doors, the Documents
list (Receipts · Invoice · Statement) and Communication History are ONE shared component, the
`Payment section`: the Work Customer card renders it when expanded, and the Monitor row renders it
below its fact grid. Same Work item, same completion fact (`Balance due` RM 0), same forms; only
the frame differs — Work is the mission view of one Sales Order (all parties), the Monitor is the
money view (status rail + fact grid). The doors open Payment's own compositions in place (the way
the Logistics card embeds Delivery's forms); Work draws no form and stores nothing. The Monitor's
door strip is `Record payment` · `Ask customer to pay` (the blue) · `⋯` (Statement · Print ·
Create payment link); the rail group `Someone else's` is spelt `Other owners`. The card and the Summary print the
Monitor's `Payment timing` fact family and the one money spelling `RM {amount} unpaid` (#1635) — one dictionary.

### Collection admission — 催钱前先看货

```text
Outstanding money exists
AND confirmed delivery exists
AND ( goods are ready  OR  a reliable expected arrival still supports the confirmed delivery )
```

Only then does the system create `Ask customer to pay`. Goods not ready and arrival not confirmed
⇒ `Arrival not confirmed` / `Wait`; no blind collection action exists.

### Collection timing — a setting, effective-dated (owner ruling 2026-09-12; migration 0486)

```text
Settings → Payments → Collection timing
Start asking the customer to pay   {n} working days before Scheduled delivery   (ruled default 3)
Payment must be complete           {m} working days before Scheduled delivery   (ruled default 2)
```

**Outstation row — owner ruling 2026-09-24 (APPROVED TARGET / NOT BUILT; `../ERP-ARCHITECTURE.md`
§6.5):** an outstation order's `Payment must be complete` is **3 working days before Scheduled
Delivery** (the customer's delivery date). Its ask day follows the same n > m rule; the default
ask day is an engineering setting, not an owner ruling. Same one clock, same calendar.

Editable by authorised Manager permission; asking must start earlier than the deadline (n > m).

**The Work right panel reads this clock (owner approval 2026-09-25, `../workspace/MASTER.md` §5.10):**
the Order Route's one payment line `Payment due {day}` (owner reconciliation 2026-09-25) and the
Logistics card's day-before money gap use the same deadline (`paymentDeadlineOf`, `packages/shared`). Payment is
never a route point and never `Blocked`. **The hold is told to Payment with its reason (owner ruling
2026-09-25, `../delivery/MASTER.md` §3 · APPROVED TARGET / NOT BUILT):** while a Scheduled delivery
exists and the DO cannot issue, the Payment Monitor row, the collection workspace and the `Ask the
customer to pay` Work item print `Payment due {day}` over `RM {amount} unpaid` (or `Finance
hold · {reason}`) — owner reconciliation 2026-09-25: the collection desk's first line is its deadline
fact, never `Hold delivery` — beside the doors `Record payment` and, for Finance only, `Remove hold`. The reason
is this module's own record; Delivery, Warehouse and Work read it. Paying in full or removing the
hold lets the system issue the DO, and the hold leaves every surface in the same read. **Gap:** both still use the ruled default m = 2 (3 outstation)
rather than the effective-dated rule row, because Operation cannot read the Payment settings payload.
Every change records old value · new value · effective from · changed by · changed on · reason.
A clock runs under the rule in force on the day it started — the invoice's issue day — so an
existing clock keeps its snapshot by construction and a new rule affects only new clocks from its
effective date. **Two calendars, one clock (owner ruling 2026-09-13):**

```text
Calculate the Payment deadline (and the ask day) from the configured company calendar —
  the delivery week (Mon–Sat) with Malaysian public holidays. These are FACTS and never move.
Schedule the actual customer-contact ACTION on the resolved action owner's governed working
  days — when a fact day is not one the owner works, the action moves to the owner's previous
  working day.
```

Operation does not work on Saturday, so an Operation collection owner acts on Friday for a
Saturday deadline while the Monitor still names the Saturday (`Payment due Sat, 12 Sep`) and
the Work item is due Friday. That is a property of the owner's calendar, not a global rule: a
future duty holder who works Saturdays keeps a Saturday action. A Sunday or public-holiday fact
day gives each owner its own governed previous working day. Logistics Partner DO lead time is
Delivery's own setting (`Delivery Settings → Logistics Partners → Delivery Order needed {n}
working day(s) before Scheduled delivery`) and does not live here.

### The collection workspace

**Owner approval 2026-09-25 / 2026-09-26 (segments 1, 4 and 6 of the Payment Blueprint review) ·
APPROVED / NOT BUILT.** The row's expansion is TWO COLUMNS — the same object grammar Delivery's DO
page adopts (Delivery §9 / UI MASTER §4.1, PR #1650): the LEFT column is what happened and what to
do, the RIGHT column is the read-only facts. Design record `docs/payment/design/monitor-status-rail.html`.

```text
[Record payment] [Ask customer to pay ← blue] [⋯ Statement · Print · Create payment link]   doors, top right
LEFT (remainder, ≥ 560px)                      RIGHT (420px, token side-panel-width)
What to do      fact · one line · one button   Money     Goods · Storage (when any) · Total payable · Paid · Balance due
Documents       Receipt rows · Invoice ·       Timing    Payment due {day} · Collection owner {name}
                Statement                      Storage   {Group} · Day {n} · free until {day} · next check {day}
Communication   newest first, 5, `Show all`    Customer  phone · reference
History
```

Flat: one hairline between sections, no nested cards; section titles 11px uppercase slate-11; the
row's own facts (customer, goods, dates, status, owner avatar) are not repeated. Below 1024px the
right column moves above the left. The Work Customer card renders the same LEFT column (the Payment
section); its Summary already carries the money. The paid Payment Record object (Payment Records)
uses the same two columns: left = the Receipt document and History, right = Payment facts and
Allocated to. The Monitor row opens one one-scroll object for the SO's collection below itself (Work's `?order=`
opens the same row; `?invoice=` is retired with the Invoice-keyed row): the fact grid carries Money,
Delivery Dates, Items & Stock, Storage and Collection owner as facts; the three blocks carry What to
do, Documents and Communication History; Delivery's `Items, Services & Stock` panel opens from the
`Items & Stock` cell as today. **There is no `Invoice` section**: the Invoice is the closing document and
lives with the Receipt in Payment Records. The doors sit on one strip above it (`Statement` ·
`Print` · `Create payment link` · `Record payment` · `Ask customer to pay`); **one blue** — `Ask
customer to pay` once the clock admits asking, otherwise `Record payment`. Money reads
`RM {x} unpaid` over `Total payable RM {t} · Paid RM {p}`. There is no full-page workspace: a paid
SO has left the Monitor and its money is in Payment Records (`SO-{n} needs no payment right now. Its
money is in Payment Records.`). The row's facts and Work's card are one read of one Work item. Its doors are `Record payment` (the canonical posting), `Ask customer to pay`, `Record the
result`, `Create payment link`, the §6/§7 storage doors, `Statement` and `Print`. Staff record a
structured result: `Customer paid` · `Customer will pay on a date` · `Customer needs help` ·
`Customer disputes the amount` · `Customer did not answer`; the system creates the next action.
`Done` never replaces authoritative completion. The posting form pre-fills SO, customer, invoice,
current Amount needed, today and the oldest valid unpaid allocation; staff confirm amount, date,
method, reference and evidence; Review writes nothing and says `This records customer money.` /
`This does not confirm the bank account.` The result is **Payment recorded**, never **Bank
confirmed**. Operation uploads evidence; Finance checks the bank outside daily Payment; delivery
continues from recorded money unless Finance explicitly raises an open Finance Exception.

### Payment Records

`Payment Records` is the only permanent incoming-customer-money listing — one row per actual
**Date-first listing — APPROVED / NOT BUILT (Jess, 2026-09-17).** Follow UI MASTER §6.7: date first, identity second; pin both at canvas ≥768px, identity alone below768px. Build sequence follows UI MASTER §6.7. Personal account layouts remain PO-only until owner acceptance.

Payment transaction. Default columns (Paid date then Receipt No, pinned per §6.7):

```text
Paid date | Receipt No | Customer | SO No | Amount received | Method
```

No Goods, arrival, Storage, delivery or timing here; no redundant `Recorded`; no required Invoice
column (one Payment may cover several Invoices). `Invoice · Reference · Recorded by · Recorded at
· Source · Evidence · Void reason · Exception` are Columns-chooser fields. A genuine exception sits
beside the Receipt No: `VOIDED` · `RM {amount} needs review`. The footer names records and money:
`12 payments · RM 18,420.00 received` (the shared formatter, always two decimals). Toolbar:
`Search | Export | Columns`; no `New Payment` — money is recorded from the collection workspace or
another canonical entry path. Selection replaces the toolbar in place (`3 selected | Clear |
Export`); actual documents are named as such — `Print 3 receipts` — and a listing export is never
called a Receipt. Inspect is read-only (Receipt/customer/amount once · allocated Invoices and
amounts · Evidence `View` · paid date and time · actual recorder · `Open payment`) with no Record,
Edit, Correct, Void or WhatsApp control.

### The Payment Record object

Full-width, one scroll, no tabs. Header: `Receipt No · Customer` / `SO No` / `Payment recorded`
(or `VOIDED`). Direct action `Print`; `Correct allocation` and `Void payment` live in the header
overflow and appear only to the Payment Approver duty holder or principal. Sections in order:

```text
1. Payment facts   Amount received · Paid date · Payment method · money account and the receiving
                   bank's masked ending · Reference · Recorded by · Recorded time · Source
2. Allocated to    every Invoice allocation and amount · Amount still needed (derived)
3. Evidence        governed `View` of the slip / screenshot / cheque / cash / terminal evidence
4. Actions         `Send receipt` (Operation, live receipt, an Active template)
5. Receipt         the immutable snapshot · `Print receipt`; a voided one prints VOIDED
6. History         recorded · voided, with actor and time
```

`Send receipt` enters the governed 50/50 composition (send steps + evidence left; the exact
Receipt and message preview right): Open Receipt → Copy message → Open WhatsApp or email → Upload
sent screenshot → Record receipt sent. Opening the app proves nothing; Communication History
stores document kind · immutable number/version · channel · recipient · staff · sent time · sent
evidence. A voided Receipt cannot be sent as a valid Receipt.

## 4 · Documents

**THE CUSTOMER MONEY DOCUMENTS — OWNER CONFIRMED 2026-09-25 (Payment Blueprint review).**

| Document | State | What was confirmed |
|---|---|---|
| Receipt — one per payment received, the deposit included | BUILT (0449 snapshot) · **no document standard** | keep; write its standard in `docs/pdf/DOCUMENT-KIT.md` |
| Invoice — ONE per Sales Order, issued by the system when `Balance due` reaches RM 0, sent with the Receipt | BUILT as a template · **must change** | no SST rows and no `TAX INVOICE` mode (Carres is not SST-registered); the `Payment request` mode is RETIRED (an Invoice never asks for money); write its standard |
| Customer Statement | read BUILT, **PDF MISSING** | build the printed statement (`GET /invoices/statement/:orderId` already derives it) |
| Credit Note | numbering approved (`CN2609-4827`), **NOT BUILT** | build it: an amendment that lowers the price after money was paid, and the exceptional refund, need it |
| Sales Order document (prints `Balance due`) | Sales Orders' | the paper the customer pays against; Payment references it, never re-prints it |
| Storage Invoice · Additional Storage Invoice | BUILT | PROPOSAL / NOT LAW: folded into `Balance due` under the 2026-09-25 money rule — settled in the Storage segment |


- Receipt proves money was recorded; the Invoice is the closing document issued at `Balance due`
  RM 0 and sent with the Receipt (owner ruling 2026-09-25). Neither asks for money.
- Sales Invoice, Storage Invoice and Additional Storage Invoice use one governed numbering and
  immutable document service.
- An issued invoice is never edited; correction voids it and issues a linked replacement.
- One payment may cover several invoices; its one receipt lists the allocations.
- Reprint uses the same number/snapshot. Voided Payment keeps a visible `VOIDED` receipt.
- SO detail reads `Invoice → Payment → Receipt` from the same canonical records.

## 5 · Payment exceptions

- Likely duplicate: compare customer, amount, paid date and reference; staff must inspect the
  earlier payment before privileged continuation.
- Partial: record actual amount; keep remaining collection open.
- Overpayment/unallocated: record actual money, allocate valid obligation, show `RM {amount} needs
  review`; never auto-create Customer Credit or Refund.
- Wrong allocation: `Correct allocation` preserves before/after, actor, time and reason.
- Wrong/duplicate posting: Payment Approver uses `Void payment`; original and reason remain.
- There is no delete, silent amount edit or ordinary Negative Payment control.

## 6 · Storage trigger and customer evidence

Storage begins only when both facts exist: **Carres can complete the agreed delivery scope** and
**the customer delays/refuses it or will not arrange receipt**. Storage Start is the later fact.
Supplier/Carres delay and goods-not-ready days are never charged. The system derives the date;
staff cannot key an earlier one.

The first valid Storage Start is permanent. Later delay never resets it, a free period or a cycle.

During the delivery-window call, Operation sends the prepared `Request a later delivery date`
form. Customer supplies new date, structured reason, acknowledgement of shown storage terms and,
where eligible, a free-storage request. Submitted form is default evidence; uploaded WhatsApp
written confirmation is the fallback. Telephone alone cannot formally change the date or obtain
free storage.

Customer refusal/non-response does not stop the clock once readiness plus customer delay is
witnessed. Original delivery date remains until written confirmation; no written request means no
free-storage approval.

At Storage Start, Warehouse records location, packaging, condition, photos, actor and date. Every
configured inspection interval (currently 30 days) raises `Check the stored furniture`. Damage
opens Service Case/Issue, not a Payment note.

## 7 · Storage commercial rule

Rates apply per customer order and **product group**, never quantity:

| Product group | Automatic free | Charge after free | Extra-free authority |
|---|---:|---:|---|
| Mattress / bedframe | **7 calendar days** (owner ruling 2026-09-12) | RM150 per commenced 30-day period | Operation through total day 21; Storage Waiver Approver through total day 30; from day 31 no ordinary free approval |
| Sofa | 14 calendar days | RM200 per commenced 14-day period, from day 15 | None |

Mattress plus bedframe is one RM150 group; either alone is also one group. Mixed orders add the
applicable groups. An approved free-until date becomes that group's free end; each charging cycle
begins on the first chargeable day after the applicable automatic or approved free-until date; a
later approval never resets an already-established Storage Start.

```text
Mattress/bedframe without approval:  day 1–7 RM0  · 8–37 RM150  · 38–67 RM300
Approved free through day 21:        day 1–21 RM0 · 22–51 RM150 · 52–81 RM300
Approved free through day 30:        day 1–30 RM0 · 31–60 RM150 · 61–90 RM300
Sofa:                                day 1–14 RM0 · 15–28 RM200 · 29–42 RM400
```

Approval limits count total days from Storage Start, not extra days. Sofa never offers extra free
storage. The effective values are `Settings → Payments → Storage charges` (0431 · 0486): one
readable rule card per Catalog group with one governed `Edit`, validated `automatic free ≤
Operation limit ≤ Approver limit` where enabled, every change recording old value · new value ·
effective from · changed by · changed on · reason. Each Storage case snapshots the effective rule at
Storage Start; later changes never recalculate an existing case.

A group ends only when its last item leaves Carres through authoritative delivery/collection
evidence. Planned date is not completion. Carres-caused non-delivery days are excluded. Each group
in mixed/partial delivery ends separately.

During storage show `Storage charge so far`. Once delivery is confirmed, calculate through that
date, issue Storage Invoice and collect before delivery. If customer delays after issue/payment,
keep the old invoice immutable and issue Additional Storage Invoice for only the new amount. A
live storage invoice holds the DO. Under the locked 2026-09-01 Sales Order money gate, full money
must be in before delivery and there is no live unpaid-release request door.

## 8 · Free-storage journey

The customer form shows the exact free-until date, rate and period in Primary School English and
says request is not approval.

```text
Mattress/bedframe day 1–7 automatic
day 8–21 the responsible Delivery Operation may approve a written request
day 22–30 Storage Waiver Approver decides
day 31+ ordinary free request unavailable
Sofa day 1–14 automatic; day 15+ ordinary free request unavailable
```

`Storage Waiver Approver` is a capability resolved from `Workspace → Staff & Duties`; no name is
hard-coded in Payment Settings. A pending request says `Free storage is not confirmed · Estimated
charge RM {amount}`; the Monitor's Storage cell says `Free request waiting for approval ·
Estimated charge RM {amount}`.

Operation decision is due same working day; Storage Waiver Approver by next working day and before
requested delivery. Pending says `Free storage is not confirmed`; estimated charge continues.
Decision stores request, requested/approved end, decision, actor, time and notification evidence.
Approval requires an exact end date.

Operation sends the prepared decision message. Completion is message-sent or WhatsApp evidence,
not `Done`.

At sofa day 14 and mattress/bedframe day 30, `Arrange delivery and collect RM {amount}` becomes
urgent. Continued non-arrangement escalates with exact days and amount. The system invents no
cancellation, disposal or resale authority.

## 9 · Delivery service charge seam

Delivery Operations records partner, destination, floor, quantity, carry-up, dismantle,
disposal/take-out, actual service and evidence. Normal delivery does not wait for quote/price.
After service, Operation may upload the partner's actual cost and negotiate disputed partner cost.

**SST — NOT SST-registered — OWNER RULING (Jess, 2026-09-23) · APPROVED / LOCKED; overwrites the 2026-09-21 "SST-registered" ruling.** Carres is
not registered for SST. Customer documents show **no tax row and no
"tax included" / "tax excluded" wording**; `invoices.tax_amount` stays 0. **Measured gap (origin/main
2026-09-23):** `apps/web/src/lib/pdf/invoice-template.tsx:8-16` still prints the "TAX INVOICE" mode with
`Subtotal (excl. SST) · SST 8%` rows and `apps/api/src/lib/pdf/types.ts:91-100` documents an 8% inclusive
split — both must stop showing tax. Document naming (e.g. whether the title stays "Invoice") and any
e-Invoice obligation are for the accountant to confirm; neither depends on SST registration.

Finance/Commercial authority owns customer invoice total, invoice-value percentage, RM2,000
boundary, SST, currency, customer-charge calculation, approval and correction. Operation never
changes those customer-money inputs. `Customer charge being checked` does not block Delivery.
Confirmed customer charge flows to Payment for invoice/collection. Only exceptional extra service
explicitly requiring a quote gains a quote step.

## 10 · Work Engine contract

Every action has Trigger · Owner rule · Resolved owner · Action · Completion fact · Due · Source
object · Cover rule. Object identity is row/card header; owner is metadata/avatar; sentence is act.

| Trigger | Owner rule | Action | Completion |
|---|---|---|---|
| Balance in window | Responsible Delivery Operation — the order's ONE collection owner | `Ask customer to pay` | outstanding = RM0 |
| Missed promise | Responsible Delivery Operation — the same owner | same, should-have-been-done state | outstanding = RM0 |
| Storage invoice live (`payment.send_storage_invoice`, admitted 2026-09-13) | Responsible Delivery Operation — the same owner | `Send the invoice and collect payment` | storage owing = RM0 |
| Free request through day 21 | responsible Delivery Operation | `Review the free storage request` | decision exists |
| Free request day 22–30 | Storage Waiver Approver | same | decision exists |
| Overpaid/unallocated money | Payment Approver | `Review RM {amount}` | allocated/classified |
| Suspected wrong/duplicate | Payment Approver | `Review payment RM {amount}` | distinct/corrected/voided |
| Finance Exception | Finance Control Duty | `Review payment evidence` | exception resolved |

**ONE SALES ORDER, ONE COLLECTION OWNER — AND IT IS THE PERSON THE ORDER WAS DEALT TO (owner
ruling 2026-09-17; migration 0504).** One Sales Order's ordinary payment follow-up keeps
one normal owner until the balance is fully paid. That owner is the INDIVIDUAL Operation person
the Sales Order was dealt to when it entered Operations — the same person who has been following
the customer up — read through the ONE authority Delivery and Payment share,
`delivery_responsible_operation(order, day)` (0504):

```text
the order's responsibility ledger row effective that day — an establishment or a formal
handover, when its person is still an active individual
  else  ops_order_control.assigned_staff, when it is an ACTIVE INDIVIDUAL (a People record
        with a staff_code)
  else  nobody
```

**Contact history and the Delivery Duty holder are not collection-owner sources.** The normal
owner is the Sales Order PIC in `ops_order_control.assigned_staff`, or the current formal handover
record when one exists. An order without a PIC remains an ownership exception; Payment never
establishes its collection owner from Delivery Duty.

**Today's acting person** is that Sales Order PIC's governed Buddy cover; when the owner is
away today (planned leave, or no heartbeat from 10:00 MYT) and no cover was named, it is the
least-loaded individual who IS in, for that day only; otherwise it is the owner. **Absence is
cover, never a reassignment** — the order does not move and the work returns when they are back.

The responsibility ledger `payment_collection_owners` stays append-only and is written by ONE
trigger, so the assignment and the ledger can never disagree: a deal appends `established`, a
reassignment or a formal handover appends `handover` with previous owner · new owner · reason ·
changed by · changed on · effective from. Its `changed_at` stamps `clock_timestamp()` (0504) — an
append-only ledger whose clock does not advance is not ordered. `payment_collection_owner_establish`
keeps its shape and reads the same authority, so an order dealt before the ledger existed still
resolves. The owner does not rotate: a changed date, a duty rotation, a later contact by somebody
else, a filter or a page reload never changes it, and a split delivery has one owner because the
owner is keyed by the Sales Order. Only two things change who acts: buddy cover (today) and a
formal handover (`payment_collection_owner_handover`, gated like Staff & Duties), which now moves
the assignment with it and refuses a new owner who is not an individual. Nobody resolvable →
nothing is established and the action stays visible with its governed failure: `Nobody is
assigned to this order.` with the door `Assign it in Sales Orders → Team` (owner instruction
2026-09-16; the Monitor row's short word is `Not assigned`). Staff & Duties is not named, because
it cannot fix an unassigned order. `Payment Duty` is RETIRED: no caller remained,
so the catalogue no longer offers it. There is no universal Sales Order Owner.

My Work omits self avatar; Team Work groups by owner. Cover preserves normal owner, today's cover
and actor. Every Payment item deep-links to `/finance/monitor?order={orderId}` — the same collection
workspace the Monitor row opens (owner approval 2026-09-25; `?invoice=` retired). The Monitor reads these items for its owner avatar and never
resolves an owner itself. Summaries name work: `3 customer balances need collection today`,
`1 payment should have been received already`, `2 storage payments need collection`. `8 open ·
2 late` is forbidden. Shared Calendar may show `Payment deadline` · `Customer promised to pay` ·
`Automatic free storage ends` · `Storage charge starts` · `Approved free storage ends`; a Payment
transaction itself is not a Calendar event.

## 11 · History, calendar and reports

History is append-only/filterable by date, customer, SO, amount, method, invoice, receipt, actor and
exception, and links immutable documents/source SO. Calendar shows dated promise/deadline,
free end, charge start and approved-free end, plus read-only Expected arrival and Customer Delivery
context under §17. Payment record is not a calendar event. Quick Rail
uses concrete copy and source deep-link.

One read-only customer statement derives invoices, allocations, payments, voids and amount needed.
Read-only reports/export: Money received · Customer balances · Storage charged/collected/waived
with reason/approver · Payment corrections · Money needing review. No Refund report or Bank
Matching workspace.

## 12 · Settings, duties and permissions

`Settings → Payments` is a maintenance surface, not daily Work. Its final section order:

```text
Receiving bank accounts · Which bank to use · Payment methods · Collection timing ·
WhatsApp templates · Invoice and Receipt numbers · Storage charges · Online payment provider
```

Each section is read-only until its focused authorised `Edit`; saving requires `Review changes`.
It owns receiving bank accounts, source-based bank routing, active manual payment methods, the
effective-dated collection timing (§3), versioned WhatsApp templates, automatic document numbering
(next example only — `Numbers are created automatically.`), effective-dated storage values per
Catalog group (free days, amount, cycle, Operation limit, Storage Waiver Approver limit, extra-free
allowed, inspection interval) and the online provider's connection fact (a server secret is never
entered or shown). Only manager permission edits them. Every effective change records old value ·
new value · effective from · changed by · changed on · reason, shown in the page's `Changes` list.
Storage Start and each collection clock snapshot the then-effective rule; later changes never
recalculate old cases, invoices or clocks. Validate free ≤ Operation ≤ Approver where enabled, and
ask-day > deadline. No collection owner, approver name or staff roster lives here — Workspace Staff &
Duties is the only duty/cover authority and the collection workspace's handover door the only
owner change.

Payment reads Calendar, Catalog category, Workspace duty/cover, Delivery/Order facts and
Stock/Warehouse facts; it never duplicates them.

Sales Orders owns the hard gate and reads Payment's one answer: the DO requires Amount needed =
RM0 and no open Finance Exception, beside Delivery's own facts (Scheduled delivery with its
optional time, valid scope, goods, Logistics Partner, address and handling). There is no live
unpaid-delivery approval or Payment Exception release door — the 0362 request/decide RPCs lost
their EXECUTE grant in 0486 and the API answers 410; an approval granted before the door closed is
honoured as history only. A Finance Exception may hold delivery for review; it cannot authorise
delivery with unpaid money. After all facts pass the system creates the DO; `Download DO` appears
only in Delivery Monitor, the Delivery Order object and authorised partner/warehouse surfaces —
never in Payment. A storage waiver changes the governed receivable; it is not an unpaid-delivery
release. A live unpaid Storage Invoice prevents Delivery Order creation.

| Duty/role | Authority |
|---|---|
| Responsible Delivery Operation (the order's collection owner — the individual the Sales Order was dealt to, 0504) | ordinary balance collection, storage-invoice collection, free-storage requests through Operation authority, delivery/storage contact, evidence, normal posting/receipt |
| Finance Control Duty | bank/payment evidence exception |
| Storage Waiver Approver | mattress/bedframe day 22–30 decision |
| Payment Approver | void, reallocation, overpayment review |
| Finance | read/export, external bank control, Finance Exception |
| Manager | Payment settings; Workspace still owns duty assignment |

## 13 · Intentional rejects and exceptional refund

No routine Refund queue/page/action/report; Negative Payment; automatic Customer Credit; full Bank
Matching workspace; supplier AP; arbitrary outstanding/storage edit; direct staff `No storage`;
delete Payment; or universal SO Owner.

Carres has no-refund policy. The single known mattress-sagging refund was exceptional: Service
Case/Operation handled customer/application, Management decided, Finance transferred externally,
Operation informed customer. Payment may show linked read-only history; it does not generalise it.

## 14 · Current build truth

### BUILD — PAYMENTS CARD 01 · Monitor rail = the Monday–Friday follow-up plan, 2026-09-16

**SHIPPED AND DEPLOYED, NOT PRODUCTION-VERIFIED (logged-in walk owed to the owner).** PR #1389 →
main `ec7718e3`; `erp.carresofficial.com/__carres_deploy.json` and `api.carresofficial.com/health`
both report `ec7718e3`; the live bundle carries the rail words. No migration. The §3 rail ruling
above is the built behaviour: `paymentWeekPlan` (`packages/shared/src/payment-monitor.ts`) over the
existing `/api/operation/work` feed, rendered by `PaymentMonitor.tsx`; the seven filters,
`monitorFilterMatch` and `monitorSummaries` are deleted.

- **Proven:** shared suite 3,396 (7 week-plan cases: week, Today, per-order counts, carried once,
  other weeks, holiday, weekend, unresolvable items); `PaymentMonitor.test.tsx` 33 (12 rail cases
  incl. cover, Finance, loading/error, collapse, `?order=` opening on every day); cache-isolation /
  banned-words / money-figures 128; typecheck shared/web/api; CI green. Local Playwright walk of the
  real component on a fixture at 1440, 1024 and 390 px: page `scrollWidth` equals the viewport, rail
  240 px, zero clipped or overflowing rail text; picking Thu listed exactly its 3 orders, Mon (past)
  listed its 1 carried order, `All unpaid orders` listed all 8. Screenshots:
  `docs/evidence/payment-monitor-week-rail/`.
- **Two defects found by the walk and fixed before ship:** an `?order=` door landed on the plan day
  and hid its own order; a wrapped rail sentence split a date (`Thu, 17 | Sep`).
- **Not proven:** the signed-in production page — this chat had no portal session. On 2026-09-16
  (Malaysia Day) production correctly shows no `Today` and plans Thu 17 Sep.
- **Out of scope, handed to CARD 02 (right listing):** the Customer cell truncates long names
  (`TAN SRI DATO' MUHAM…`).

### BUILD — PAYMENTS → Monitor · Payment Records, collection timing, 7-day free storage, the shut approval door, 2026-09-13

Owner ruling 2026-09-12, delivered as one slice (migration `0486`):

- **Navigation.** `PAYMENTS` is a module of two destinations, `Monitor` (landing) and `Payment
  Records`, for operation, principal and finance alike. The `Payments · Invoices` toolbar switch,
  the standalone Invoices Register, the finance rows `Order Payments` / `Invoices` / `Refunds &
  Credits` and the retired Master-Sheet desk address all forward: `/finance/invoices` → Monitor
  (parameters kept), `/finance/refunds` · `/finance/recon` → Payment Records, `/operation?tab=
  payments` → Monitor. Genuine finance-only capability (AR, Bills, Vouchers, Ledger, Reports, Other
  money in, Rental Approver) is untouched.
- **Monitor.** `PaymentMonitor.tsx` over the shared `paymentMonitorRows` derivation
  (`packages/shared/src/payment-monitor.ts`): one row per SO still needing money; the seven ruled
  columns; Primary School English goods/storage/delivery/timing facts; `Show items` disclosure;
  seven rail filters with counts; clear summaries; the owner avatar read from the shared Work feed
  (no second owner calculation); the row opens `PaymentCollectionWorkspace.tsx` — the same
  `?invoice=` door Work deep-links to. The register attaches each order's latest standing promise
  (`latest_promise`) so `Customer promised to pay today` reads the 0446 ledger.
- **Payment Records.** `PaymentRecords.tsx`: the six ruled columns, `Amount received`, the
  optional chooser fields (Reference · Recorded at · Source · Evidence · Void reason), `RM {amount}
  needs review` beside the receipt, `Print {n} receipts` on selection, the ruled object sections
  (Payment facts → Allocated to → Evidence → Actions → Receipt → History) with `Send receipt`,
  `Correct allocation` and `Void payment` in the authorised overflow, Evidence `View`, the money
  account with the receiving bank's masked ending, and `Source` (`source_channel` on the wire).
- **Collection timing (0486).** `payment_collection_timing_rules` (append-only, effective-dated,
  seeded 3·2 from 2026-08-19) + `payment_set_collection_timing` (manager gate, ask > deadline,
  reason required, change row). `collectionClock` takes the pair; `collectionTimingFor` picks the
  rule in force on the clock's start day (the invoice's issue day); the Work feed, the Monitor and
  the collection workspace all pass it. **Operation has no Saturday work:** an ask day or deadline
  landing on Saturday, Sunday or a holiday moves to the previous working day
  (`operationActionDay`).
- **Storage.** A new `mattress_bedframe` rule row with `free_days = 7` effective 2026-09-12 (the
  other values unchanged) plus its change row; `payment_setting_changes` gains `reason` and
  `effective_from`; `payment_set_storage_rule` takes `p_reason` (one signature). The Storage cards
  gained the governed `Edit → Review changes → Save changes`; the Settings page gained
  `Collection timing`, `Online payment provider` (connection fact only) and the `Changes` list, in
  the ruled order.
- **DO boundary.** `delivery_payment_approval_request` / `_decide` lost their EXECUTE grant
  (0486); `POST /api/operation/payment-approvals/*` answers 410 with the Monitor as its path;
  the read stays for history. `Download DO` appears nowhere in Payment.
- **Work.** `payment.send_storage_invoice` admitted (`Send the invoice and collect payment`, the
  governed Delivery owner word, due on the shared deadline, completes at storage owing RM0);
  `Ask customer to pay` is the ruled spelling; every Payment item's destination is
  `/finance/monitor?invoice=`.
- **Tests.** Shared: `collection-clock.test.ts` (timing pairs · snapshot · Saturday rule),
  `payment-monitor.test.ts` (goods · storage states · delivery · timing facts/actions · row set ·
  filters · summaries). API: settings timing door and reason, storage-rule validation, the 410
  approval doors, the requests read, the register's promise attachment, the feed's action words
  and destination. Web: sidebar module and destinations, FinanceApp routes and redirects,
  PaymentMonitor (columns · facts · owner avatar · storage · disclosure · rail · workspace ·
  states), PaymentRecords (columns · exception · Inspect · selection · object · Print · overflow ·
  void), PaymentSettings (order · timing edit · storage edit · change log · provider).
- **PRODUCTION-VERIFIED 2026-09-13.** PR #1252 merged as `cfbf6992`; the deploy workflow
  converged and `erp.carresofficial.com`, `pos.carresofficial.com`, `carres-portal.pages.dev`
  (`/__carres_deploy.json`) and the API Worker (`/health`) all reported `cfbf6992`. The served
  bundle (`index-Nz-2IzuE.js`) prints `Payment Records` ×13 · `Ask customer to pay` ×6 ·
  `Send the invoice and collect payment` · `Storage Invoice not paid` · `payment-monitor-rail`
  · `Collection timing` ×3, and `Payments · Invoices` / `Ask the customer to pay` are 0.
  Walked authenticated in the owner's signed-in Chrome session:
  - Sidebar: `Payments` module expanded with exactly `Monitor` (`/finance/monitor`, lit) and
    `Payment Records` (`/finance/payments`); no Invoices, Refunds, Order Payments or
    Reconciliation row; the collapsed 60px rail lights the Payments icon.
  - `/finance/monitor`: header `Monitor` (50px), 240px rail with `TODAY · Nothing needs
    collection today` and the seven filters with counts (`Waiting for goods 2 · All unpaid 2`),
    the seven columns in order, two live rows (SO-1321 · SO-1313) reading `Arrival not
    confirmed` · `No storage charge` · `Thursday, 20 Aug` / `Sunday, 4 Oct · Not confirmed yet`
    · `Arrival not confirmed / Wait`; footer `2 orders · RM 2,999.00 still needed`; no tabs,
    no `Download DO`. `?order=1321` scopes to one row and says `SO-1321 only`; `Show items`
    prints `Item · Qty · Goods` with `Jager · 1 · Arrival not confirmed`; the SO row opens the
    collection workspace (`INV-2026-001321`, back word `Monitor`, sections Money → Goods and
    Delivery → Storage → What to do → Invoice → Related Payments → Communication History,
    `What to do` = `Wait`, doors `Statement · Print · Create payment link · Record payment`).
  - `/finance/payments`: header `Payment Records`; columns `Receipt No · Paid date · Customer ·
    SO No · Amount received · Method`; two live rows; footer `2 payments · RM 1,915.00
    received`; no `New Payment`, no toolbar switch. Inspect is read-only and `Open payment`
    opens `RC-110926-2994` with state `Payment recorded`, `Print`, and the six sections in
    order. Two wording gaps found and closed in the closure PR: `Source order_create` printed
    raw (now `Sales Portal deposit`), and a provider-recorded `online` payment said `Money
    account not configured` (now `settled by the payment provider`); an order with no Invoice
    now says so instead of `Amount still needed not available`.
  - `/operation/settings/payment`: the eight sections in the ruled order, then `Changes`;
    Collection timing `3 · 2 working days before Scheduled delivery · In effect from Wed, 19
    Aug`; Mattress / Bedframe `Free storage 7 calendar days … In effect from Sat, 12 Sep`;
    Sofa unchanged; the `Changes` list shows the 0486 storage change with `Staff identity not
    recorded` and `free days 14 → free days 7`.
  - `POST /api/operation/payment-approvals/{orderId}` with the signed-in token → **410**
    `no_unpaid_delivery_approval`.

### CONVERGENCE — the Work feed restored, the approvers configured, the two-calendar clock, 2026-09-13

- **`GET /api/operation/work` was 500 in production** — `public.issue_actions` did not exist:
  the Issue Tracker lane's `0454_an_issue_action_has_one_identity_and_one_result.sql` was merged
  but never applied. Under the owner's explicit, limited authorisation it was applied through
  the governed production door after re-checking the committed file's checksum
  (`f1575745…`, identical on `origin/main` and disk) and the rolled-back probe (0 issues → 0
  backfilled actions, 0 `ops_tasks` cancelled). Tracker tail `0454…`; the feed answers 200 with
  215 items. Issue Tracker business behaviour was not touched.
- **Duties configured** (owner ruling 2026-09-13 — Jess is the approver until a Manager is
  assigned; the production staff identity `Jess <jess@carres.com>` is unambiguous): effective-dated
  `workspace_duty_assignments` rows `payment_approver → Jess` and `storage_waiver_approver → Jess`
  from 2026-09-13, written through `workspace_assign_duty` with the ruling as the note. **Payment
  Duty is deliberately NOT assigned** — no authoritative assignment exists; the Monitor prints the
  configuration exception `Payment Duty is not assigned · Staff & Duties` beside the action
  (never a blank avatar, never an invented owner), and Work keeps the item under the duty word.
- **The calendar rule corrected** (`collection-clock.ts`): the deadline/ask are company-calendar
  facts (`dueIso` / `askIso`); the owner's action days (`actionDueIso` / `actionAskIso`) come from
  the resolved owner's governed working days (`OwnerCalendar`, default the Operation week). Tests
  cover: Operation owner unavailable Saturday → previous working day · owner configured to work
  Saturday → Saturday action remains · Sunday/holiday → each owner's governed result · a
  historical clock keeps its rule snapshot. The Work item's due date is the owner's action day.
- **Non-blocking carry-forward:** `Print {n} receipts` prints the selected receipts one by one
  through the governed receipt-document door; one merged PDF package is an improvement recorded
  in `docs/carry-forwards.md`, not part of this closure.

**PRODUCTION-VERIFIED on `ed76eb43`, 2026-09-13 — the complete re-walk after the cache-key fix.**

- **🔴 FOUND BY THE PRODUCTION RE-WALK — the Work page was dark on a live feed.** With the feed
  answering 200 · 215 items, `My Work` / `Team Work` still printed `No open work — every track
  is clear` and the Quick Rail counted nothing. Root cause: the legacy tasks panel cached its
  `/api/ops/tasks` read under `["operation","work"]` — the SAME React Query key as the shared
  Work feed (`qk.operation.work()`), so whichever read landed second was served the other's
  shape. Fixed on `main`: PR #1257 (`8b23c5aa`) gives the legacy read `["operation",
  "legacy-tasks"]` and a key-distinctness test; PR #1258 (`ed76eb43`) adds the regression proof
  against a REAL QueryClient (`work-cache-isolation.test.tsx`): both mounting orders · Quick
  Rail + Payment Monitor + legacy read mounted together · invalidating the feed refreshes the
  Monitor's owner and leaves the legacy entry untouched · the unassigned-duty exception
  preserves the action · each cache entry satisfies its own zod schema and FAILS the other's
  (the shapes cannot be shared) · a negative control with the old colliding key reproduces the
  poisoning · every `/api/ops/tasks` reader in the app is pinned to `TASKS_KEY`. **Law: one
  cache key per read** — a key collision is a silent wrong answer, never an error.
- **Real production state captured first (`ed76eb43`, the owner's signed-in Chrome, read-only):**
  Work `215 actions to do · 114 late`, Team Work grouped per owner (Alvin 2 · E2E Test 101 ·
  Jess 1 · Shasha 6 · tan qu qu 1 · Yu Jun 104); the React Query cache holds TWO entries —
  `["operation","work"]` = `{items: 215, staff: 5, generatedOn}` and
  `["operation","legacy-tasks"]` = `{tasks: 10}`; the Quick Rail panel renders its three counts
  for the signed-in account (0 · 0 · 0 — it holds no duty) with no load error. Monitor rows
  `SO-1321` and `SO-1313` both `Arrival not confirmed | Wait`; rail `Needs attention 0 · Ask
  customer today 0 · Promised today 0 · Should have been paid 0 · Waiting for goods 2 · Storage
  payments 0 · All unpaid 2`; summary `Nothing needs collection today`; footer `2 orders ·
  RM 2,999.00 still needed`; zero owner cells, because no collection action is admitted today
  (催钱前先看货). Payment Records: the six ruled columns, `2 payments · RM 1,915.00 received`,
  `Online payment` / `Bank transfer` method words, no `New Payment`, no Payments/Invoices
  switch. Settings: the eight ruled sections in the ruled order; Collection timing 3 · 2
  working days; Mattress/Bedframe `Free storage 7 calendar days · RM 150.00 every 30 · Operation
  may approve until Day 21 · Approver until Day 30`; Sofa `14 · RM 200.00 every 14`; the change
  record prints the 0486 row (`Staff identity not recorded … Owner ruling 2026-09-12`). Duties:
  `payment_approver` and `storage_waiver_approver` → Jess; `payment_duty` unassigned. Browser
  console: no errors on any walked page.
- **INJECTED UI EVIDENCE — NOT PRODUCTION CUSTOMER DATA.** To prove the unassigned duty does not
  lose the action, one synthetic invoice `SO-9999` (customer name = the label itself) and its
  Work item were injected into the deployed bundle's `window.fetch` wrapper in the browser only,
  then the two React Query entries were invalidated in memory. Scope proof: the wrapper recorded
  every non-GET call — **zero writes issued**; `localStorage` byte-identical before and after;
  no API, database or customer record touched. The deployed Monitor rendered `SO-9999 | … |
  Payment should have been received | Payment Duty is not assigned · Staff & Duties | Ask
  customer to pay`, the link resolving to `/operation?tab=staff-duties`; the rail counted `Needs
  attention 1 · Should have been paid 1 · All unpaid 3`, summary `1 payment should have been
  received already`, footer `3 orders · RM 3,999.00 still needed`. **Reload restored the real
  state exactly** — wrapper gone, `SO-9999` and the label absent, the two real `Wait` rows,
  `2 orders · RM 2,999.00 still needed`, zero unassigned cells.
- **Deployed shared-code verification (not an observed customer event):** the clock files are
  byte-identical between `c4517cd1` and `ed76eb43` (`git diff` empty) and the deployed bundle
  carries the two-calendar fields (`actionDueIso` ×5, `actionAskIso` ×5). `collectionClock` on
  the `ed76eb43` checkout, Tuesday 15 Sep confirmed delivery, ruled 3 · 2: **Company deadline
  Saturday, 12 Sep** (ask Friday, 11 Sep) · **Operation owner action Friday, 11 Sep** (t2 from
  Friday; `late` only after the Saturday deadline) · **Saturday-working owner action Saturday, 12 Sep** (t3 on
  Friday, t2 on Saturday). The deadline fact never moved; only the owner's action day did, and
  only for the owner whose calendar excludes Saturday.
- **Bundle greps on `ed76eb43`:** `is not assigned` 1 · `legacy-tasks` 1 · `Payments · Invoices`
  0 · `Request payment approval` 0 · `Download DO` 0.
- **Responsive / zoom — limitation stated:** the owner's signed-in Chrome walk runs in a
  headless tab (`window.innerWidth` 0), so 390 px and 200 % could not be produced against
  production in that session; the Monitor's rail therefore started collapsed and was opened
  through `Show filters`. The same deployed code was walked locally at 390 px and 720 px (rail
  hidden below 1100 px, no horizontal page scroll, the fact column wraps) and the responsive
  tests pass (`PaymentMonitor.test.tsx` 23 · `PaymentRecords.test.tsx` 20 ·
  `work-cache-isolation.test.tsx` 8 on the `ed76eb43` checkout).
- **Production surfaces on `ed76eb43`:** ERP, POS, Pages and `/health` all reported the SHA.


**OVERALL PAYMENT DELIVERY STATUS: PARTIALLY DELIVERED.** The posting core is
production-verified and the §16/§17 registers, objects, actions, Settings and Calendar are
deployed with exact-SHA proof and local walks, but the governed acceptance is not complete:
the complete §16 message assembly (blocked on the owner-approved Important Notes wording),
Stripe convergence and the production VISUAL pass remain open below. **The everyday entry point
was corrected on 2026-09-09** — until then the sidebar `Payments` row still opened the retired
Master-Sheet desk, so none of the deployed §16 work reached the operator by its normal route.

### Production-verified — Customer payment posting convergence

Every current customer-order money entrance delegates to the canonical `_customer_payment_post`
transaction: Finance receipt, operational/manual Payment, Sales/POS top-up and customer Stripe
checkout. Source channel plus idempotency key prevents a retry from recording money twice. One
successful transaction creates the canonical Payment, its allocation, one receipt identity, the
derived `orders.paid` change and one Order activity fact; failure rolls the transaction back.

The old generic `payments` table cannot accept new incoming customer-order money. Existing Finance
receipt history was linked into the canonical ledger without increasing paid money again. A void
preserves the Payment and reverses its live allocation and paid contribution; there is no delete.
All current money readers and the Delivery gate derive from the same paid truth.

Production evidence, reconfirmed 2026-09-03: migration
`0351_customer_payment_posting_convergence.sql` is on `main`; focused API tests prove every posting
entrance, idempotency mapping, role gate and void contract; focused web tests prove the shared money
states and Finance reader; the production ERP, POS, both Pages projects and API Worker reported the
same deployed `main` SHA.

### PRODUCTION-VERIFIED — the entry point and the Invoices repair, 2026-09-09

Walked authenticated on the deployed ERP as `principal@carres.com`. ERP page and API Worker both
reported `a7db9fbc` (`de30da24` entry point + `a7db9fbc` Invoices repair; verified by ANCESTRY —
a sibling merge landed between them).

| Walked | Result |
|---|---|
| Sidebar `Payments` row | `href="/finance/payments"` — was `/operation?tab=payments` on `5da8dab3` |
| Clicking it | the canonical Register: `Payments · Invoices` toolbar, eight columns, read-only |
| Summary band · Queues | **gone** (were `Balance owing RM 134,060` · `Collect/Waiting stock/Stock late/Storage running`) |
| Editable fields on the destination | **0** — were **106**, including per-row `bal RM 0` / `storage RM 0` |
| Toolbar → Invoices | `INV-FIX-3208 · SO-1313 · RM 2,499.00 · Arrival not confirmed · Sun, 4 Oct` |
| Invoice date cell → Calendar | opens `?view=calendar&date=2026-10-04&so=…&from=delivery`, October month rail, the SO highlighted on its day, `Back to Invoices` |
| `/operation?tab=payments&so=1313` | lands on `/finance/payments?order=1313`, chip `SO-1313 only` + `Show all payments`, honest `No payment is recorded on SO-1313 yet.` |
| Toolbar switch under scope | `/finance/invoices?order=1313` — the scope survives |

**THE ZERO WAS A LIE, AND THE REPAIR PROVED IT.** Before `a7db9fbc` the Invoices Register drew
`0 invoices · RM 0.00 still needed`; after it, the same page drew `1 invoice · RM 2,499.00 still
needed`. There was always an invoice. The 500 hid it and the screen reported the hiding as zero.
That is the strongest available argument for the absent-is-not-zero law: the lie was not
detectable from the screen, only from the read behind it.

**The Payments Register's own zero is TRUE**, and was checked rather than assumed:
`GET /api/finance/payments/register` answers `{"rows":[],"total":0}` at HTTP 200. No canonical
receipt has been posted in production, which is what CLAUDE.md §6 expects of a clean-start
database.

**Corrected in the same pass:** both Register footers said `1 invoices` / `1 payments` — a count
interpolated straight into a plural noun, on the line an operator reads every day.

**AND THE REASON THE ERROR BRANCH NEVER FIRED — root-caused, 2026-09-09.** The branch is not
broken; it was never reached. React Query **PAUSES** a query rather than erroring it, and a paused
query reports `status:"pending" · fetchStatus:"paused" · isError:false · data:undefined` — read
live off the React fiber on the deployed page, with the failure reproduced by forcing the endpoint
to 500 in one tab. Because `isLoading` is `isPending && isFetching`, **`isLoading` is FALSE while
paused**, so `DataGrid` suppressed neither its empty message nor its footer, and
`rows = query.data ?? []` supplied the empty list. The screen therefore asserted
`0 invoices · RM 0.00 still needed` from a read that had never finished.

**Fixed:** both Registers pass `isLoading={!query.isSuccess}` — skeleton and `Loading…` until the
answer is real. Each carries a test that fails against `query.isLoading`, verified by reverting.

**This is a portal-wide pattern, not an Invoices bug.** Seven registers outside Payment still pass
`isLoading={query.isLoading}` and will read a paused read as a confirmed zero — listed with the
one-line fix in `docs/carry-forwards.md`. They belong to Purchasing, Receiving, Warehouse and
Suppliers and are left to their owners.

### 🔴 FOUND BY THE PRODUCTION WALK — the Invoices Register was dead, 2026-09-09

**Measured, not inferred.** The authenticated walk that verified the entry point above went on
through the Register toolbar to Invoices and found `GET /api/finance/invoices/register` returning
**HTTP 500 on every call** — both Worker hosts, the app's own request included — while the page
drew `No invoices yet. A prepared or issued invoice will appear here.` and
`0 invoices · RM 0.00 still needed`, with no alert and no `Try again`.

**That is the ABSENT-IS-NOT-ZERO failure stated as law elsewhere in this file: a read that failed
was painted as an empty list and RM 0.00.** An operator would have concluded Carres has no
invoices.

**Root cause — two missing `+` operators**, `apps/api/src/routes/finance/invoices.ts`, shipped by
PR #1169 (`e36e0f11`, 2026-09-08, the void-is-not-a-waiver storage correction). Adjacent string
literals are not concatenated in JavaScript: ASI ended the expression at the first one and
evaluated the rest away, so `INVOICE_REGISTER_SELECT` silently became

```
…,ops_order_control(balance,confirmed_date,line_etas,line_stock_status,
```

— seven open parentheses against five closed, a dangling comma, and all six storage columns
absent. PostgREST rejects it, the route throws its own 500, and the destination is dead. **It
typed, it built, it passed CI and it deployed.** The route's own 31 tests all pass against the
truncated string, because every one of them mocks the Supabase client and none reads the select.

**Fixed and guarded.** The operators are restored and `selectIsWellFormed` now asserts the real
constant: every embedded resource closes, no dangling or doubled separator, and the storage
columns are present. Reverting either `+` fails that test. A PostgREST select is a nested grammar
carried in a hand-built string that no compiler reads — the guard is the only thing that can.

**Consequence for the entry point above.** From 2026-09-08 to 2026-09-09 the Invoices Register and
the §17 Calendar behind its date cells were unreachable in production. The entry-point correction
did not cause this and did not depend on it; it is what made the walk find it.

### THE ENTRY POINT — the everyday `Payments` row opens the Register, 2026-09-09

**The gap this closes, stated plainly.** Every §16/§17 surface above was built, deployed and
proved at `/finance/*` — and the sidebar row an operator actually clicks every day still opened
`/operation?tab=payments`, the Master-Sheet "Balance" collections desk. So the approved Payment
experience was, from the operator's chair, not delivered: they saw a Summary band, queue chips
and EDITABLE balance and storage-fee fields, and never reached the Register at all. Building a
better page at a second address is not replacing the first one.

**Why it survived so long.** `PortalSidebar.test.tsx` asserted the row's SHAPE — that `Payments`
is a plain row and not a chevron hiding one child — and never once asserted where it went. A
rail test that never checks a destination cannot fail when the destination is wrong.

**The ruling applied.** `docs/ERP-ARCHITECTURE.md` ownership Law C — *a door, never a duplicate;
two forms for one act make two records*. The desk was the second form for recording and editing
customer money. It is deleted, not deprecated, not hidden behind a flag.

**What now happens (this change):**

* The Operations rail's `Payments` row links to `/finance/payments` — the canonical read-only
  Register — and stays lit across both of its listings. §12 already admits operation staff to
  Payments and Invoices, and `FinanceApp` already bounces them off every finance-only page.
* `Payments · Invoices` remains the Register toolbar's own switch (§16), so the rail keeps ONE
  Finance row; a second rail row for Invoices would be a second control for one act.
* The §17 Calendar keeps its approved entry: the Invoice `Expected arrival` and
  `Customer Delivery` date cells.
* `/operation?tab=payments` forwards to `/finance/payments`. The desk's `?so=<SO No>` scope
  travels with it as `?order=<SO No>`, which both Registers read — the Sales Order's
  `Open this order in Payment` door and the shared route engine's Money door now spell it that
  way. `?so=` was NOT reused: §17 already spends it on the Calendar's highlighted order, where
  it holds an `order_id` UUID. The scope narrows the LISTING only; the Invoice object, Inspect
  and the record-payment composition keep the complete set, because they derive one customer's
  money across their Sales Orders.
* Deleted: `OperationPayments.tsx`, `payments-money-state.ts` and their tests. The word-scan and
  money-rounding guards that watched the desk were moved onto the two Registers rather than
  deleted with it — a retired surface must never take a live guard with it.

**NOTHING WAS SILENTLY REMOVED — checked write door by write door.** The desk held exactly ONE
mutation: `PATCH /api/operation/orders/:id/control` writing `balance` and `storage_fee_override`
from two free-text cells on every listing row (measured on the deleted file: 106 editable inputs
on the live production page, 2026-09-09). That is the capability §13 already names an
**intentional reject** — *arbitrary outstanding/storage edit*. The route is untouched and both
fields keep their governed homes: `storage_fee_override` in the Order Detail Drawer and the
Orders Control page, and the approved storage path remains the §7 waiver ladder on the Invoice.
Every canonical §16 action — Record payment · Ask to pay · Send receipt · Print receipt · Payment
link · Correct allocation · Void — already lives on the Payment and Invoice objects the Registers
open. Historical money is untouched in the database, and the Payments Register IS the §11 history
surface (gap item 26). Operation access is unchanged: §12's route guard already admits operation
staff to `/finance/payments` and `/finance/invoices`.

Nothing about money arithmetic, the Delivery gate, permissions or the Register/object designs
changed here. This is the destination correction only.

### Deployed — the Payments Register answers the Finance door, 2026-09-06

PR #1104 merged as `caebd3e3` and the production deploy converged that exact SHA on the ERP
page, the POS page and the API Worker; the served bundle carries the Register's own strings.
`Finance → Payments` opens the canonical receipt Register: fail-closed paginated
`GET /finance/payments/register`, six approved columns with sticky Receipt No, view-scoped
selection/export retaining the VOIDED mark, void-aware footer total, read-only Inspect and the
one-scroll payment object. The sidebar row says the governed word `Payments`; the Phase-5
bucket page left the route. The shared Order/Work action engine now checks collection
readiness: goods not ready with no usable arrival date creates no collection action; arrival
confirmation creates it; delivered balances stay collectible. No money arithmetic or Delivery
gate changed. An authenticated owner walk of the live page is still owed; exact-SHA and bundle
evidence are the current production proof.

### Deployed — invoice lifecycle and the Invoices Register, 2026-09-06

Migration `0429` is APPLIED (tracker tail confirmed) and PR #1108 merged as `60e8814c`;
the ERP page, POS page and API Worker converged that exact SHA and the served bundle carries
the Invoices Register's own strings. `invoices` now carries the governed lifecycle: kind
(Sales/Storage/Additional Storage), draft → issued → voided status, immutable issue snapshot,
void reason/actors and the replacement lineage; one live Sales Invoice per order; allocations
may name an invoice. `payment_invoice_prepare` drafts idempotently, `payment_invoice_issue`
mints the governed `INV-DDMMYY-NNNN` number and freezes the snapshot, and
`payment_invoice_void_replace` — Payment Approver duty via the Shared Duty Resolver, or
principal — voids with a required reason and drafts the linked replacement. The dispatch
trigger adopts a prepared live invoice instead of minting a twin. `Finance → Invoices` opens
the §16 Register (eight approved columns; Needed/Goods/arrival/timing derived through the one
shared `orderMoney`/`collectionClock` arithmetic), read-only Inspect, and the one-scroll
invoice object with honest empty states. The rolled-back production probe's negative controls
were run before apply; an authenticated owner walk is still owed.

### Deployed — record payment, and a void wears its reason, 2026-09-06

Migration `0430` is APPLIED and PR #1110 merged as `124140a5` (deploy convergence in
progress at this edit; the closure note carries the proof). `payment_void` requires a reason
and gates on Payment Approver duty (Shared Duty Resolver) or principal, and refuses any account
that is not an active operation or principal account even if it holds that duty (0513: the
database refuses whatever the API refuses); the posting service +
column CHECK speak the §16 manual methods (`duitnow_qr` · `credit_card` · `debit_card`) with
the arithmetic byte-for-byte 0351. The Invoice object carries the §16 Record payment
composition — 50/50 action-and-receipt-preview, the six manual methods with their required
evidence words, Review stating `This records customer money.` / `This does not confirm the
bank account.`, one idempotency key per opening, upload-first posting through the canonical
door, and typed input retained on failure. The void doors in the order drawer and control
panel ask the reason inline. `/finance/*` admits operation staff to the Payments and Invoices
destinations only (§12); finance-only pages bounce them.

### Merged — Payment Settings foundation, 2026-09-06

Migration `0431` is APPLIED and PR #1112 merged as `f43bdbf9` (the rolled-back production
probe proved the manager gate refuses a non-manager, saves keep old/new/actor in the change
log, and the last Active method cannot be switched off). `Settings → Payment` has its storage:
receiving bank accounts keyed by the governed routing source (PJ own-showroom → Hong Leong
Bank · Dealer → RHB — the BANKS are seeded approved truth, the account numbers are the
manager's to enter), the six §16 manual methods with Active flags (`online` deliberately has
no row), and append-only effective-dated §7 storage rules seeded with the approved rates. The
Settings Workspace gains the Payment section: readable summaries, focused bank-account Edit,
method toggles, the two storage cards, and the numbering summary that says only the next
example and `Numbers are created automatically.` Record payment's method list now reads the
Active set. No approver name, collection owner or roster appears in Payment Settings.

### Deployed — a sent message is recorded with its proof, 2026-09-06

Migration `0434` is APPLIED and PR #1114 merged as `52659282`; production converged that
exact SHA. The rolled-back production probe proved a screenshotless record is refused, a
cross-order invoice is refused, and a real record lands
with its proof, the order-history fact and the shared chase stamp. The migration creates
`payment_communications`, the append-only sent-message ledger, and
`payment_record_message_sent`, its one recording door. The Invoice object gains
`Ask the customer to pay` — the door exists only when the shared clock says due or late, never
while `Wait` — opening the 50/50 message composition: editable ordinary wording beside the
real message the customer receives, Copy message → Open WhatsApp → Upload sent screenshot →
Record message sent. Opening WhatsApp records nothing. Communication History renders the
ledger. The message body is the CURRENT locked customer template (Jess 2026-07-13); the
complete §16 payment message swaps in when its owner-approved Important Notes wording
arrives — the bottom rules are never invented or shortened. `waLink` converged from two
page-local copies into the one shared implementation.

### Deployed — the invoice document prints from its snapshot, and the §17 Calendar, 2026-09-06

PR #1115 merged as `53853a12` and production converged that exact SHA (ERP page + Worker); PR
#1114 (`52659282` — the sent-message ledger and Ask the customer to pay, migration 0434
applied) converged before it. `GET /finance/invoices/:id/document` serves the issued
invoice's IMMUTABLE snapshot as the governed InvoiceTemplate data (a voided invoice keeps its
paper and says VOIDED in the title; a pre-0429 invoice has no snapshot, falls back to a live
read and says so); the Invoice object header gains the direct `Print` output. The §17 Calendar
navigation is built as ruled: Customer/SO/Invoice cells open the collection details (never an
automatic Calendar switch); a Customer Delivery or Expected arrival date cell opens the
Calendar at that date's fixed workweek with the exact SO highlighted and the Expected arrival
label explicit; a record without a usable date keeps its honest words and no door. The
Calendar view: 240px rail with the complete month fixed on top (arrows one month at a time),
business date filters scrolling below, one fixed Mon–Sun workweek with Sunday visible and
muted as `not a working day` (Malaysian holidays too), the selected date on the blue token,
every indicator carrying words. Entries are read-only facts from their authoritative owners;
an Expected arrival entry creates no deadline and no chase, and voided invoices place nothing.

### Deployed — the template library keeps every version, 2026-09-06

Migration `0435` is APPLIED and PR #1116 merged as `012887af`; production converged that exact
SHA. The rolled-back production probe proved: a non-manager is refused, an edit appends
version 2 while version 1 stays history, one Default per purpose holds, and an inactive
template cannot be the Default. The migration creates
`payment_message_templates`, the append-only version store, and its three manager doors
(save · set default · set active) through the same settings gate and change log. Seeds carry
ONLY the two already-locked customer wordings (Jess 2026-07-13) as the `Gentle reminder` and
`Payment should have been received` Defaults, with protected merge fields
`{customer} {ref} {outstanding} {items}`; every other governed purpose says
`No template yet. The approved wording must come from its owner.` — nothing invents customer
copy. `Settings → Payment → WhatsApp templates` gains the library: heads under the governed
§16 purpose words, New template · Duplicate · Edit · Set as default · Make inactive · View
history, and the governed 50/50 editor (ordinary wording left, real preview right, protected
fields, a lost amount field blocks Review, Review changes before Save). `Ask the customer to
pay` now recommends the Default template from the shared clock's answer, offers
`Change template` across Active templates, renders protected fields from structured facts,
and falls back to the built-in locked wording when the library is unreachable.

### Deployed — Send receipt, 2026-09-06

PR #1118 merged as `314b3d87` (no migration): after a successful posting, the done panel says Payment
recorded · Receipt number · Amount still needed and offers **Send receipt** — template-driven
ONLY. A full payment recommends the `Payment received` template, a partial one
`Partial payment received`; the composition renders the manager's wording with the receipt
facts (`{receipt_no}` `{amount}` `{still_needed}` join the protected fields) and records into
the immutable ledger as kind `receipt` with the sent-screenshot proof. With no Active receipt
template the panel says `No receipt template yet. Ask a manager to add the approved wording
in Settings.` — nothing invents customer copy.

### Deployed — the Calendar review corrections, 2026-09-07

The #1115 review found five gaps; the correction rebuilds the Calendar view on the kit's ONE
pinned `MonthCalendar` primitive (shared with Receiving and Delivery) instead of the
hand-rolled month grid. Built and locally verified (13 focused Calendar tests, 364 web tests
across every MonthCalendar consumer, design guard clean, walked at desktop, 390px and a
640px ≈200%-zoom viewport with no horizontal scroll):

- **Sunday-first month** with `SUN MON TUE WED THU FRI SAT` three-letter headings — the kit
  formatter now says the short weekday name, never a single ambiguous letter.
- **`‹ Previous week` / `Next week ›`** stand beside the week range and move exactly one
  fixed Mon–Sun workweek.
- **Filter → listing → Calendar**: a business date filter (Customer Delivery · Expected
  arrival — Payment-owned words only, no Delivery logistics-assignment copied) opens its
  dated LISTING while the complete month stays visible and its markers follow the filter;
  choosing any month date returns to Calendar at that week. `All dates` is the Calendar.
- **One SO, once — and the money is the SO across kinds**: entries dedupe on SO · date ·
  type, so an SO carrying Sales, Storage and Additional Storage invoices is ONE Customer
  Delivery and ONE Expected arrival; the Sales invoice is the door and the other obligations
  stay reachable through the Register and the opened details. The card's amount is the
  shared `soRemaining` derivation — goods value from the same `orderMoney` stores as
  `Needed`, PLUS the SO's live ISSUED storage-kind invoice obligations with their tax
  (a draft asks for nothing, a voided one is dead), MINUS `orders.paid` subtracted exactly
  ONCE (the Work engine's combined law), so the Sales door never hides an unpaid storage
  obligation and a payment posted against a storage invoice is never double-counted. Proven
  by the fixture the review asked for: all three kinds + partial payment + a voided
  obligation asserts RM 758 from goods 1,000 + live storage 158 − paid 400, with the
  never-values (600 · 858 · 918 · 508) each excluded, and the paid-past-goods case (1,100)
  spills into storage (58) instead of inflating it.
- **The kit fix the correction surfaced**: `MonthCalendar` passed no `onSelect` to
  `react-day-picker` v10, so selection was internal-state only and a day set from OUTSIDE
  (a register date door, a week arrow) never repainted; it now uses DayPicker's own
  controlled `onSelect`, keeping the pick-again-clears contract for every consumer.

PR #1124 merged as `4d717422` and the ERP page, POS page and API Worker all reported that
exact SHA. The verification evidence, each result stated for exactly what it proves:

- **Production DOM-interaction walk — DONE** (same day, through the operator's signed-in
  browser session): the live Register's Customer Delivery cell opened the Calendar at its
  fixed workweek with the exact SO highlighted; the month headed `Sun Mon Tue Wed Thu Fri
  Sat`; `‹ Previous week` moved the week and the month repainted its selected day (the
  controlled-selection kit fix, live); the filter opened its dated listing with the month
  visible; a month date returned to Calendar with `All dates` active. This proves the
  interactions; it does NOT prove visual layout.
- **Production VISUAL inspection — NOT DONE, precise blocker**: the authenticated session
  exists only in the owner's own browser, whose window is minimised (a zero-width window
  cannot be captured), and signing in from any automated browser would mean handling the
  owner's credentials, which is refused on principle. One owner action clears it: keep a
  normal-sized signed-in window open and ask for the visual pass.
- **200% zoom — layout-equivalent evidence, not native-zoom acceptance**: a browser's 200%
  page zoom on a 1280px window lays out at a 640px viewport, and that exact walk ran locally
  at 640×400 — week navigation, month repaint, filter → listing with the month visible,
  month-date return, ZERO elements clipped outside the viewport, no horizontal scroll, and
  the filter list owns its own scroller with the month outside it (fixed). Neither
  automation surface can drive the browser-chrome zoom control itself, and a CSS `zoom`
  emulation was rejected as evidence because it does not re-evaluate media queries the way
  real page zoom does — so glyph rasterisation at true 200% remains unexercised and this is
  recorded as layout-equivalent proof, not full visual acceptance.
- The multi-invoice dedupe could not be exercised on production data (one live invoice, and
  every live row is TEST data): its proof is the shared-arithmetic fixture tests and the
  local multi-invoice fixture walk, where the deduped SO card said RM 2,350 = goods 5,400 +
  storage 150 − paid 3,200.

### Deployed — Reports → Payment, 2026-09-07

`Finance → Reports` gains the Payment door and `/finance/reports/payment` renders the six
approved §16 listings — Money received · Customer balances · Storage charged and collected ·
Storage waived · Payment corrections · Money needing review — and never a Refund, Bank
Matching or Negative Payment report. The governed report laws hold: the page STORES NOTHING
(one read of the same payments wire the Payments Register reads, one read of the same
invoices wire the Invoices Register reads, every figure computed at render time by the
shared `soRemaining`/`isLivePayment` arithmetic); EVERY ROW IS A DOOR (a payment opens its
record at `?payment=`, an SO opens its collection object at `?invoice=`); EVERY EXCLUSION IS
SAID ON SCREEN (voided payments out of Money received, settled and unpriced orders out of
Customer balances with the unpriced count, drafts out of Storage). The month filter governs
the dated sections; balances, storage and review money are today's facts and say so.
`soRemaining` gains the `overpaid` field — money past every recorded obligation — which
feeds `RM {amount} needs review` (§5) without a second arithmetic. Storage waived states
honestly that the waiver journey is not built. The page stays finance-only under the §12
door (operation staff reach Payments and Invoices only). Verified by 9 focused report tests
(102 finance page tests green), a preview walk of all six sections with fixture data, and
390px/640px checks with zero clipped elements. PR #1130 merged as `da00900f`; the live SHA
carries it on the ERP page, POS page and Worker (ancestry-verified — a sibling push had
cancelled the exact-SHA run). Production-walked through the signed-in session: all six
heads render, the exclusion sentences are on screen, the month control stands, a balance
row doors to its invoice object, and SO-1313 said the SAME number the Calendar says —
Law D holding live.

### Deployed — the Online link journey on the Invoice, 2026-09-07

The §16 "Online link and Receipt" operator journey is built around the ALREADY-converged
Stripe checkout (0223 → 0351 — only a successful provider callback/poll posts Payment and
Receipt atomically; nothing here re-touches money). The Invoice object gains
`Create payment link` for the posting door's staff: create shows the amount (prefilled from
the shared goods outstanding the server cap enforces), then the standing link says
`Waiting for payment` · the amount · the exact expiry, and the sending sequence is the
governed Copy payment message → Open WhatsApp → Upload sent screenshot → Record link sent
(into the immutable communications ledger; created, sent or opened is NOT Payment and the
card says so). The customer message is TEMPLATE-DRIVEN ONLY — `Standard payment link`, with
`New link after expiry` recommended after one died; with no Active template nothing invents
customer wording: the page says the owner's words are owed and only the bare link URL (a
fact, not wording) can be copied. An unpaid expiry says `Payment link expired` ·
`Amount needed remains unchanged.` · `Create a new payment link`; a paid one says
`Payment recorded` with the remainder. While a link stands open the composition polls the
reconcile route, so a counter payment records within one poll even before the webhook. The
API gains read-only `GET /orders/:id/stripe/checkout` (the order's recent links, RLS-gated
on the order read) — no migration. Verified by 8 focused composition tests + 2 API route
tests (31 stripe route tests green). PR #1131 merged as `b3fc3c3b`; the live SHA carries it
on all three surfaces (ancestry-verified). Production-walked through the signed-in session:
the `Create payment link` door stands on the invoice header, the composition renders with
the amount prefilled from the shared outstanding (RM 2,499 on the walk invoice) and the
honest empty preview — no real Stripe link was minted during the walk, deliberately.

### Deployed — the storage case foundation, 2026-09-07

Migration `0436` creates `payment_storage_cases` — one case per order + product group,
FOREVER — and its two doors. The §6 truth is structural: a case is born only from BOTH
witnessed facts (Carres can complete the delivery scope · the customer delays it), the
system derives Storage Start as the LATER fact (a CHECK pins it; staff cannot key an
earlier one), the first valid start is permanent (a second start for the same order + group
is refused by the unique constraint), and the then-effective §7 rule is SNAPSHOTTED onto
the case so a later Settings change never recalculates an old case.
`payment_storage_extra_free` carries the §7 decision ladder: Operation through its limit
day, the Storage Waiver Approver duty (Shared Duty Resolver) through its limit day, nobody
beyond — even principal is refused past every limit; sofa always refuses; a WRITTEN request
is required and an approval may only extend. Both doors append the order history fact. The
shared `storageChargeOf` arithmetic (Law D) reproduces the §7 worked examples exactly
(1–14 RM0 · 15–44 RM150 · 45–74 RM300; approved-day-21 shift; sofa 14-day cycles) and is
the ONE derivation any card, report or future Storage Invoice may print.
`GET/POST /api/finance/payment-storage` are thin RPC wrappers.

The operator journey is on the Invoice object: a **Storage** section between the goods facts
and the money action (the §16 one-scroll order gains it — storage is a goods-side fact that
becomes money). A case says its witnessed start, which storage day today is, the free end
with its approval named, and the §7 charge so far through the ONE shared arithmetic —
honestly marked `not on a Storage Invoice yet.` The posting door's staff get
`Record storage start` (both witnessed facts + the note; the page says the system derives
the LATER date) and, where §7 allows, `Request more free days` — the customer's WRITTEN
request is uploaded first, and the form says a phone call is not enough. Finance reads the
same facts with no doors.

Closure: migration `0436` is APPLIED (tracker tail confirmed) and PR #1132 merged as
`f4aea2a5`; the ERP page, POS page and Worker all converged on a SHA carrying it, and the
served bundle prints the Storage section's own strings. The production DOM walk of the
section is owed: the signed-in browser's renderer froze mid-walk (a minimized window that
stopped answering the debugger) — recorded as the precise blocker, not as acceptance; the
DB layer's behaviour is production-proven by the rolled-back probe above.

The rolled-back production probe proved, with negative controls: a future witness refused ·
the later-fact start with the seeded rule snapshot · a second start refused · Operation
refused past day 21 while the waiver duty is unassigned · approval without written evidence
refused · Operation approving day 21 exactly · principal refused beyond every limit · sofa
extra-free refused · an unknown caller refused (`app_role()` resolves from `app_users`, so
a forged JWT role claim changes nothing). Charging (commenced cycles → Storage Invoice) and
the operator journey UI (the delivery-window form, the case surfaces, §16 composition
extension) are the named next slices — this one records the facts they derive from.

### Deployed — a commenced period becomes a Storage Invoice, 2026-09-07

Migration `0438` closes the charge side of the storage case: `payment_storage_invoice` turns
commenced, UNBILLED §7 periods into a real invoice through the EXISTING 0429 lifecycle —
the same `INV-` numbering authority, the same immutable snapshot (a server-composed
document carrying the case, the period range and the per-period charge), the same
void/replacement lineage; nothing invents a second document authority. The first paper for
a case is kind `storage`, every later one `additional_storage`; `billed_through_period`
advances atomically with the paper, a charge with nothing newly commenced is refused, a
storage paper never stamps the order's Sales-Invoice number, and the door is Operation /
principal (§12 — Finance reads and exports). The case card says
`{n} charge periods started · RM {x} — {m} not on a Storage Invoice yet.` and offers
`Create Storage Invoice` exactly while something is unbilled. The SQL arithmetic and the
shared `storageChargeOf` are both pinned to the §7 worked examples (the rolled-back
production probe asserted 1-period Aug-start RM150 · 7-period sofa RM1,400 ·
additional-storage RM200 top-up · double-charge refused · unknown caller refused).
Closure: migration `0438` is APPLIED (tracker tail confirmed) and PR #1140 merged as
`96ac6197`; the ERP page, POS page and Worker all converged on `90a8f3ef` carrying it, and
the served bundle prints `Create Storage Invoice`. The section's production DOM walk shares
the storage-foundation blocker above (the signed-in browser's frozen renderer); the DB
behaviour — including the real INV number minted inside the rolled-back probe — is
production-proven.

### Deployed — one money answer: the reader audit, 2026-09-07

Every Payment reader of "what this SO still needs" was audited against the §2 model and
converged on the ONE shared `soRemaining` arithmetic (SO across every live invoice kind;
`orders.paid` subtracted exactly once): the Calendar card, the Reports listings, the
Register's `Needed` cells and number filter, the Register FOOTER (a real defect found and
fixed — it summed the SO's outstanding once per ROW, so an SO carrying Sales and Storage
papers was double-counted; each SO with a live visible row now counts exactly once), the
Invoice object's Money section (`includes storage RM x` named), the timing's paid check
(an SO settled on goods but owing storage is NOT `paid` — the collection door stays open),
the Record payment prefill, the Ask-to-pay `{outstanding}` fact, and the payment link's
prefill AND server cap (the cap is now goods value + live storage obligations − paid, the
subtract-once shape; the invariant — a payment may never exceed what is owed — is
unchanged, and a link can now collect a storage fee).

**The obligation model, stated precisely.** Goods obligation reads the order's own live
value (priced lines/addons; the keyed imported balance is the explicit LEGACY FALLBACK for
unpriced imported rows, and it is already an outstanding, so nothing subtracts `paid` from
it twice). The issued Sales Invoice equals that value at issue by construction (the paper
snapshots it; corrections travel revision → void/replace), and reading the value keeps the
money visible BEFORE a paper is prepared. Storage obligation reads the SO's live ISSUED
storage-kind invoices with tax, PLUS a draft that REPLACES a voided one — the 0429
correction lineage exists precisely so an obligation survives its void, and the reader must
not lose the money between void and reissue (test-pinned); a fresh draft asks nothing and a
voided paper is dead.

**RESOLVED — the gate convergence (2026-09-07 slice).** The shared Work engine, the TS
booking gate's one feeder (`booking-context`), the completion reader and the DATABASE door
now consume the canonical §2 storage obligation through ONE precedence law
(`storageObligation`, shared): when the SO carries ANY live ISSUED storage paper, the
papers ARE the storage figure (the same shape as priced-lines-beat-keyed — never both,
never a double count), netted so `orders.paid` subtracts exactly once (a payment past the
goods value spills into storage; a fully paid SO leaves NO stale hold); with no paper the
LEGACY C9 answer passes through byte-identical (`collected_at` clears it, the override
ladder holds, existing C9 cases unchanged). Migration `0441` teaches the 0362 database door
— the one place the money law binds every DO mint — the same papers: an unpaid Storage /
Additional Storage Invoice now blocks a DO whatever path mints it. What deliberately does
NOT change: the legacy accrual stays TS-side (Law D division as 0362 recorded); a C9
`release` still lifts only the TS gate's HOLD and never this door (money in full is
ABSOLUTE per the 2026-09-01 delivery ruling; §12 — a waiver changes the receivable by
VOIDING the paper, it is not an unpaid-delivery release); the historical 0362 approval rows
stay honoured. Proven both directions by the rolled-back production probe on the real DO
door (unpaid paper blocks naming the RM; partial blocks with the remainder; combined-paid
opens; waiver-by-void opens; a draft asks nothing; the historical approval opens; a
fully-paid-goods baseline passes) and by Work-engine tests (an unpaid paper keeps the
collect work open on a goods-paid SO; combined payment closes it; no paper invents
nothing).

Closure: PR #1145 merged as `94acc54f` and the ERP page and Worker converged that exact
SHA. CORRECTED in the gate-convergence slice: the draft-REPLACEMENT clause #1145 added was
a new debt rule the approved lifecycle does not contain, and it is REVERTED — §2 reads
`issued live invoice obligations` exactly, so a correction in flight (void → reissue) asks
nothing until the replacement is ISSUED. Continuity is the lifecycle's own: the voided
paper is dead and never double-counted, `billed_through_period` never rolls back (0439),
the replacement exists to be issued, and the Storage section says `A Storage Invoice
correction is in progress` so nothing is silently lost from the operator's view. The
production DOM verification of the fixed readers is owed with the standing visual-pass
blocker below.

### Deployed — the storage facts are immutable, and a case can close, 2026-09-07

Migration `0439` makes the §6 permanence STRUCTURAL instead of disciplinary: a BEFORE
UPDATE trigger refuses any change to the witnessed facts, the derived start or the rule
snapshot (even a definer-function bug or a privileged hand cannot recalculate an old case),
refuses rolling `billed_through_period` backwards (a paper, once minted, is corrected
through the 0429 void lineage — never un-billed by an update), and refuses reopening a
closed case. `payment_storage_close` is the one closing door — Operation/principal, a
stated reason, the order history fact — and a closed case refuses charging, extra-free
decisions and every other door. The case card gains `End storage` (reason first) and a
closed case shows history with no doors. The rolled-back production probe passed with
negative controls: start/snapshot edits refused · billed rollback refused · close stored ·
charge and extra-free refused on the closed case · reopen refused · double close refused ·
unknown caller refused. Supplier/Carres delay staying unchargeable is structural (a charge
derives only from a start that REQUIRES the readiness witness); mixed product groups run as
separate cases per 0436; automatic close on delivery completion is Delivery-side wiring and
stays a named next step. Closure: migration `0439` is APPLIED (tracker tail confirmed) and
PR #1147 merged as `7b47adbf`; production converged it.

### Deployed — export, waivers on the report, the visible Reports door, and the §13 convergence, 2026-09-07

Reports → Payment gains: **Export Excel** (one sheet per section, computed at export time
from the same reads — the report still stores nothing); the **Storage waived** section now
lists every approved free-storage decision with its free-until date, reason and approver's
NAME (the §11 promise; the same case wire the Storage section reads, approver resolved
server-side so an id never reaches the screen); and the shared `Finance → Reports` page
carries a first-class **Payment** door card — the destination is discoverable, not a bare
route. The §13 convergence, non-destructively: **Refunds & Credit Notes is now READ-ONLY
history** — the create door and its modal left with the ruling (Carres has a no-refund
policy; the exceptional path runs Service Case → Management decision → Finance external
transfer, said on the page); the data, the list read and the API route remain untouched.
**Recon** keeps its function and gains the governed note (Finance checks the bank outside
daily Payment; the workspace is scheduled to retire under §13). Destructive retirement of
either surface still requires its own explicit authorization and has not been performed.
Closure: PR #1148 merged as `72779db7`; the ERP page, POS page and Worker all reported that
exact SHA.

### Stripe business verification — what is proven, and what live keys refuse

A rolled-back production probe proved the §16 Online-link money contract end-to-end on the
real posting service: a paid session posts Payment + Receipt atomically (`orders.paid`
moved once, an `RC-` receipt minted, the session flipped to paid); the DUPLICATE
callback/poll answers `already` and records nothing twice (one live payment per session
key, money unchanged); an unpaid expiry posts nothing and the amount needed stays
unchanged. Creation with the exact amount and expiry is covered by the route tests and the
signed-in production walk of the composition. The one unexercised path is a FRESH live
end-to-end payment: the production Stripe keys are LIVE mode (`cs_live_` sessions on
record), so a real end-to-end verification would mint a genuinely payable link — refused
deliberately, and the rolled-back posting probes verify DATABASE behaviour, not the
complete provider lifecycle. Provider end-to-end testing is PENDING authorised test-mode
access (a Stripe test-mode key set); where the governed acceptance requires the full
provider lifecycle, that access is a requirement, not an option. No live payable link is
ever created for testing.

### Deployed — the gate consumes the canonical obligations, 2026-09-07

The convergence slice itself (the RESOLVED entry above records the model): shared
`storageObligation` + `invoiceStorageSumOf`; feeders wired in `booking-context` (the one
TS-gate feeder), the Work projector (per-order sums off the same invoices read the
collection work already makes) and the completion reader; migration `0441` teaches the
0362 database door the storage papers with the same subtract-once arithmetic (priced:
`greatest(0, priced + storage − paid)`; keyed: `greatest(0, keyed) + storage`; unknown
goods still never block, but a storage PAPER is known money and does). The §13
convergence also completes within approved scope: the RECON WORKSPACE — inspected and
serving NO other authorised owner (its only consumers were its own page and routes) — loses
its navigation row and its page; the route lands on Payments; the reconciliation DATA and
its API routes remain untouched, and git is the history. Refunds stays as read-only
history. Verified by the 0441 rolled-back production probe (seven controls, both
directions), 9 composer tests, the Work both-directions test (26 work tests), 234
finance+portal page tests, design guard and typecheck. Closure: migration `0441` is
APPLIED (tracker tail confirmed; the Warehouse lane took `0440` mid-CI and the later file
renumbered — the 0398 law) and PR #1154 merged as `5cdccd13`; the ERP page, POS page and
Worker all reported that exact SHA. The DB-door behaviour is production-proven by the
rolled-back probe; the authenticated interaction and visual passes share the standing
blocker recorded under the verification categories.

### BUILD — the two storage-model boundary cases, 2026-09-08

The 2026-09-07 precedence law asked `a live paper exists`, and the boundary review found
two defects in it. Both are fixed; both are pinned by tests that use REAL C9 history, not
invoice-only fixtures.

**(a) Voiding the last paper resurrected the old C9 charge.** A void is the §12
waiver/correction path, so falling back to the legacy figure brought a waived obligation
back from the dead. FIXED: precedence is now keyed on storage-paper HISTORY (any
storage-kind invoice ever, voided ones included). An order with history is under the
invoice model permanently — zero live papers means ZERO storage owing, never a fallback.

**(b) A mixed order hid money.** One product group invoiced while another still sat in the
legacy columns meant the papers silently spoke for the whole order. The two models cannot be
reconciled by arithmetic — the legacy columns are ONE per-order figure with no group
breakdown, so nothing in the data can say whether a keyed fee is the same debt as a paper or
a different group's. RESOLVED without guessing: the invoice model DECIDES the money (which
also forces the zero-paper and one-paper answers in (a) to agree), and the legacy figure is
carried out as `unreconciledLegacy` — never merged into a paper figure, never silently
dropped. `GET /api/finance/payment-storage?orderId=` returns it through the same shared
composition the gate and Work use, and the Storage section says: *This order also carries
RM x of storage fee from the old records, which no Storage Invoice covers. Collect it, or
set the storage fee to 0 in the order, so the two do not disagree.*

**The state is also made unbirthable.** Migration `0445` refuses to open a storage case while
the order carries an uncollected KEYED legacy fee (override, else the imported pair), naming
the amount and the fix. It changes no row, migrates nothing and forgives no money. Measured
before writing (production, 2026-09-08): ZERO orders carry any legacy storage signal, ZERO
cases, ZERO papers — the refusal is a guard for the future, not a cleanup, and the go-live
database starts clean (CLAUDE.md §6). Rolled-back production probe, five controls: no-legacy
baseline opens · an imported RM 300 refuses naming RM 300.00 · an override RM 150 beats the
imported pair and refuses naming RM 150.00 · override 0 (the operator's "no storage") opens ·
a COLLECTED legacy fee opens.

**ONE EXPECTED AMOUNT, RECONCILED ACROSS FIVE SURFACES** (`storage-reconciliation.test.ts`):
for an invoice-only order and for a mixed order, Calendar · Reports · Invoice details
(`soRemaining`), shared Work and the TS booking gate (`orderMoney` ← `storageObligation`),
and the DATABASE gate (0441's arithmetic mirrored) all produce the SAME figure; the legacy
fee is named apart. With every paper voided, all five say zero and nothing resurrects. A
correction in flight changes nothing anywhere — no draft debt, no invented hold.

**THE ONE KNOWN DIVERGENCE, stated rather than papered over.** On a LEGACY-ONLY order (no
paper history) shared Work and the TS gate carry the C9 fee, while the Payment screens and
the 0441 database door do not — Payment's screens read the invoice model only, and 0362's
Law D split left the date-walked accrual TS-side. It is bounded: production carries zero
legacy storage signals, go-live starts clean, and 0445 keeps an order in exactly one model,
so the divergence has no live instance. Closing it would mean either teaching the Payment
register read the C9 columns or retiring the legacy columns outright — recorded in the gap
list below, not done silently.

**⛔ OPEN OWNER DECISION — does an unreconciled legacy fee HOLD the delivery?** Today it does
not: it is a named fact and work to resolve, because the alternative (holding on both) would
double-hold whenever the keyed fee and the paper are the same debt, and inventing a hold was
explicitly out of scope. The recommendation is to keep it as work, since 0445 prevents the
state and no live order can reach it. It is listed in the gap list as an owner decision.

### BUILD — the customer's answer is a recorded result, 2026-09-08

§3 asked for a structured collection result and the 2026-09-08 audit found it NOT BUILT:
0434 recorded the message we SENT, but nothing recorded what the customer ANSWERED, so no
next action could be derived from a result and the risk sort could never rank a missed
promise. Migration `0446` adds the missing half: `payment_collection_outcomes`, append-only,
one row per recorded conversation, and `payment_record_collection_outcome`, its one door.
The five approved §3 words are the only vocabulary; `Customer will pay on a date` REQUIRES
its date and may not be in the past, and no other result may carry one. The door appends the
order history fact and stamps the shared chase clock exactly as the message ledger does.

**An outcome is never money.** `Customer paid` records what the customer SAID: it does not
write `orders.paid`, mint a receipt or close a balance — the canonical posting service stays
the only money writer (§2), and the composition says so on screen. That is §3's "`Done`
never replaces authoritative completion", enforced rather than described.

The Invoice object gains `Record the result` beside `Ask the customer to pay`, with one
obvious button per result and the next step named under each. Rolled-back production probe,
eight controls: an unknown outcome word refused · a dateless promise refused · a promise in
the past refused · a stray date on another result refused · a promise stored with history and
the chase stamp · `Customer paid` moving neither `orders.paid` nor any payment row · an
invoice from another order refused · an unknown caller refused.

The remaining half of #8 — the shared Work feed RANKING a missed promise — belongs to the
Workspace-owned rule registry and stays listed as PARTIAL rather than reached into from here.

### BUILD — a likely duplicate is inspected before the money is recorded, 2026-09-08

§5 asks that a likely duplicate be compared on customer, amount, paid date and reference,
and that staff INSPECT the earlier payment before continuing. The audit found only the
posting key's idempotency, which stops an accidental double-submit but says nothing about a
human keying the same transfer twice. Shared `likelyDuplicatePayments` compares the order's
LIVE payments (a voided one is not money and never matches): equal amount within a two-day
window either side — a Friday slip keyed on Monday is the same payment — or an identical
reference, which matches on its own and ranks first. The Review step names each match with
its receipt number, amount, date and reference, and `Record payment` stays SHUT until the
operator ticks *I opened the earlier payment and this is a different one.* It is a warning
with a gate, never a refusal: a customer may genuinely pay the same amount twice. The
register wire gained `reference` and `method` on the payments read so the comparison names
the right earlier payment instead of guessing from a figure. Six shared tests and two
composition tests pin it.

### BUILD — the §5 duplicate rule moves out of the browser, 2026-09-08

The guard shipped earlier that day computed the match in the page and shut the button
behind a tickbox. Re-read against §5 word by word, three things were still missing, and
each one is a way the same money gets recorded twice:

* **"privileged continuation"** was not enforced anywhere. A tickbox in a page is not a
  permission — any caller could post the same payment through the API and never see it.
  §5's own owner table names the authority (`Suspected wrong/duplicate | Payment
  Approver`), so continuation is now the approver's act, with the same duty check as
  `payment_void` (0430): the Payment Approver duty through the Shared Duty Resolver, or
  principal. The role check also matches: `payment_record` refuses anyone but an
  operation or principal user before it looks for a duplicate (0448), the same two roles
  0513 gave `payment_void` and the only two the API admits.
* **"compare CUSTOMER"** was read as "compare this order". The duplicate §5 most fears is
  the transfer keyed onto the customer's OTHER SO — one customer holding several SOs is
  normal here — and nothing looked for it. The SQL comparison walks the customer: the same
  phone digits when both orders carry a usable one, else the same name.
* **the browser cannot see a payment recorded one second ago**, and a page whose register
  row carried no payment list found nothing and looked exactly like a clean order.

`payment_record` now takes the order lock BEFORE it looks, so two submissions of one
transfer serialise and the second sees the first. The page still draws the warning and
still asks for the look; it sends the acknowledgement as a REQUEST, and the door decides.
When the earlier payments could not be read at all it says so rather than staying silent.

⛔ **This is not idempotency and the two are kept apart.** The posting key answers "is this
the same submission arriving twice?" and returns the original row; this answers "is this a
different submission of money already recorded?" An exact idempotent retry is explicitly
exempt — it is the same act, not a second one.

**A separate defect found while probing and fixed in the same migration:** `payment_record`
guarded with `if app_role() not in ('operation','principal')`. `app_role()` answers NULL for
a JWT whose subject has no `app_users` row, `NULL not in (…)` is NULL, and `if` treats that
as false — so the guard never fired for an unknown caller. Only the `recorded_by` foreign
key stopped the money, by accident. It is coalesced now.

**Proven against the ACTUAL door** (rolled-back production probe, twelve controls):
baseline posts · a same-order duplicate is refused naming the receipt · an acknowledgement
WITHOUT the approver duty is refused (the duty is unassigned in production, and an
unassigned duty refuses) · the same customer's OTHER order is refused, naming that SO ·
a different customer with the same amount and date posts · an exact retry returns the
original and is never gated · an identical reference matches on its own · three days apart
is not a duplicate · a voided earlier payment never matches · principal continues and the
acknowledgement lands on the row and in the activity log · an assigned Payment Approver
continues · an unknown caller is refused by the coalesced guard.

**Limitation, stated:** true two-session concurrency was not executed — the probe runs in
one session. Serialisation rests on the `for update` lock taken before the comparison, and
the probe proves the comparison sees a payment committed earlier in the same transaction
ordering.
### BUILD — a receipt reprints from the moment the money was recorded, 2026-09-08

`invoices` learned this in 0429: issuing captures an immutable `snapshot`, and every reprint
reads it rather than live order data. The receipt never got the same treatment. Its NUMBER
was minted and stored, but nothing captured what the receipt SAID — so the customer name, the
SO and the method were re-read at reprint time, and a customer renamed or an order corrected
six months later would silently reprint a DIFFERENT receipt under the same number. A receipt
that changes is not a receipt.

The capture belongs in the one writer, not in a route: every channel — the desk, the POS
top-up, the payment link — mints its receipt there, so every channel captures the same way.
0449 replaces `_customer_payment_post` with the identical body plus the snapshot and changes
nothing else about it. `payment_void` is untouched, which is exactly why a voided payment
still reprints its receipt marked VOIDED — §4's own sentence.

**No backfill.** Payments recorded before 0449 have no snapshot and never will; their document
reads live and says `from_snapshot: false`, the same honest fallback the pre-0429 invoices
carry. Inventing a snapshot for a receipt nobody captured would be a forgery, not a repair.

**Proven against the ACTUAL writer** (rolled-back production probe, six controls): the
snapshot is captured with the number, customer, amount, method and reference, and its number
matches the row's · a LATER rename cannot rewrite the receipt · voiding keeps the snapshot ·
an unknown method prints as the governed word, never the raw input · a storage collection
carries its own receipt · an idempotent retry mints no second receipt. Eleven route and
composition tests pin the document and the button.
### BUILD — a promise the customer broke is its own work, 2026-09-08

§10 lists two payment triggers, `Balance in window` and `Missed promise`, sharing one action
and one completion fact. Only the first was fed. The promise was recorded (0446) and
`missedPromise` derived the fact, but nothing consumed it, so a customer who named a day and
let it pass looked exactly like a customer who had said nothing.

It is a rule in the Workspace-owned registry, not a special case bolted onto the feed:
`payment.missed_promise` names its own five parts, and the two differ in the two ways that
matter — its TRIGGER is the broken promise, and its CLOCK is the day the customer chose, so
`late` counts from that day and not from the delivery window. One invoice raises this OR the
window item, never both: the promise replaces the window once it is broken, because the act
and the completion fact are the same one.

It also reaches Work where the window cannot. With no delivery date the collection clock has
no anchor and raises nothing at all; a broken promise still raises, on its own date. The
ledger is read append-only and the LATEST answer decides — a newer, later promise cancels a
broken one, and `Customer paid` (which is not money, §3) leaves the ordinary window item
standing rather than inventing a broken promise. A settled balance closes both.

A read failure on the outcome ledger throws rather than yielding an empty list: a missed
promise that cannot be read must not quietly turn back into an ordinary balance.

Six projection tests pin it, including the two negative controls above.

### BUILD — the one read-only customer statement, 2026-09-08

§11 asks for a statement that DERIVES invoices, allocations, payments, voids and the amount
needed. Derives is the operative word: nothing on it is stored or summed a second time. The
invoices and payments are the canonical rows, and the amount still needed comes from the same
shared `soRemaining` the Calendar, the Reports and the Invoice object read. A statement that
computed its own total would be a second arithmetic — and the first thing to disagree with the
delivery gate.

It spans the CUSTOMER, not the invoice you arrived from. One customer holding several Sales
Orders is normal here, and a statement showing one of them is not a statement. The customer is
matched the way §5's duplicate check matches one: the same phone digits when both orders carry
a usable one, else the same name — and the page says WHICH rule answered, so nobody mistakes a
name match for a complete picture.

An order whose price nobody recorded says so. It never prints a confident RM 0, because "we do
not know" and "nothing is owed" are different answers and only one of them is safe to show a
customer.

The legacy C9 storage attachment the register performs was extracted into one helper both
readers call, so the register and the statement cannot disagree about an order's storage.

Read-only, by §11's own word: there is no action on the page. Ten route and composition tests
pin it, including the customer span, the name fallback, the unknown-price answer, and that the
voids and allocations are carried.

### BUILD — the customer's written request to delay is a record, not a note, 2026-09-08

A storage case could only be opened from a TYPED witness note — prose, unfilterable, and
silent about the three facts §6 actually asks the customer for. So "the customer acknowledged
the storage terms" and "the customer asked for free storage" were things an operator
remembered, not things the system held.

0451 records the §6 submission: the date the customer asked for, a structured reason, the
storage-terms acknowledgement, an optional free-storage request, and the evidence. It is
append-only, and its door refuses exactly what §6 refuses:

* **no evidence** — *"Telephone alone cannot formally change the date or obtain free storage."*
  A request nobody can show is not a written request, so the file is required, not optional.
* **terms not acknowledged** — §6 names the acknowledgement as part of what the customer
  supplies. Without it the form is incomplete, not merely thin.
* **a date already past** — a request to deliver yesterday is not a request.
* **no reason** — and the API adds the one check SQL cannot make: the reason must be a key
  from the one governed Delivery Reason Library, and a CUSTOMER-side one. §6 charges storage
  for customer delay only, so a request blamed on a Carres-side cause is not a §6 request at
  all. The form offers only those keys and the door refuses the rest, so no second word list —
  and no second responsibility rule — can grow here.

⛔ **It does not move the delivery date.** §6 is explicit that the original date stands until
written confirmation, and the date belongs to Orders/Delivery, never to Payment. The form says
so on its face, so nobody expects the calendar to change underneath them.

**Proven against the ACTUAL door** (rolled-back production probe, nine controls): an unknown
caller is refused · telephone alone is refused · the storage terms must be acknowledged · a
past date is refused · a reason is required · a complete submission records with its
free-storage request · the record never moves the delivery date · a second request stands
beside the first · the fact reaches the order history. Eight route and composition tests pin
the wire and the form, including that only customer-side reasons are offerable.
### BUILD — stored furniture is looked at, and the look is recorded, 2026-09-08

§6 asks for a `Check the stored furniture` every configured interval, and the interval was
configured (0431's `inspection_days`) — but nothing raised the work, because nothing COULD.
The Work engine admits a rule only when it can name an authoritative completion fact, and
there was no record that anyone had ever looked. A tick-box would not have been one.

0452 makes the look a record: location, packaging, condition, photo, actor and date, exactly
the six §6 names. It is append-only, and its door refuses a closed case, a future date, a date
before the storage started, a missing fact and — the one that matters most — a missing photo.
A check nobody can see is not a check. The same shape serves both halves of §6: the record
Warehouse makes AT Storage Start is simply the first inspection.

With the fact in place, `payment.check_stored_furniture` enters the registry with its own five
parts. Its clock restarts at each recorded check, so a case checked on time never accumulates
a backlog of missed intervals — one open item at a time, which is what an operator can act on.
The due date comes from one shared `storageCheckDue`, so the Work item and the Storage section
cannot disagree about the day. The interval is read as a SETTING, not a case snapshot: changing
it changes the cadence of every open case from now on, which is what an operational cadence
should do (unlike §7's commercial values, which stay snapshotted forever).

Its owner is **Warehouse**, and honestly unassigned: §6 gives the check to the warehouse floor
and names no duty, no warehouse duty roster exists, so the word stands rather than borrowing the
Sales Order PIC or another module's Duty.

⛔ **Damage is not recorded here.** §6 sends damage to a Service Case or an Issue, not to a
Payment note, so the door has no damage field and the form says so rather than pretending a
condition note is an escalation.

**Proven against the ACTUAL door** (rolled-back production probe, eight controls): an unknown
caller is refused · a photo is required · location, packaging and condition are all required ·
a future date is refused · a date before the storage start is refused · a complete check
records and reaches the order history · a second check stands beside the first · a closed case
has nothing to check. Four projection tests and four composition tests pin the rule and the
form, including that a recent check closes the item and that the configured interval — not a
fixed thirty days — decides.

### The isolated Stripe test environment — prepared, and what it still needs

Stripe test mode is not a separate account; it is the same account with `sk_test_` keys. This
Worker has ONE deployed environment, so putting a test key into its secrets would REPLACE the
live one — which is exactly what must not happen. The isolated environment is therefore the
LOCAL one: `wrangler dev` reads `apps/api/.dev.vars`, a gitignored file that never leaves the
machine, so the whole §16 journey can be walked against Stripe test mode with nothing in
production touched.

`apps/api/.dev.vars.example` now carries both keys with the exact dashboard path to each, so
the credential entry is a file on the owner's own machine — never a chat message, a commit or
a screenshot. Nothing else is waiting on engineering: both keys unset is already the correct
degrade (the routes answer 503 `stripe_not_configured` and the page says it is not set up
yet), and that is what production does today.

Setting the DEPLOYED Worker's secrets is a separate matter and is not attempted here: this
environment holds no `CLOUDFLARE_API_TOKEN`, so `wrangler secret list` and `secret put` both
refuse, and the live key's mode cannot be read from outside without an authenticated session.
That is stated as a limit, not assumed away.
### BUILD — the extra money becomes somebody's work, 2026-09-08

§5 asks that overpaid money be shown as `RM {amount} needs review`, and §10 gives the row an
owner and a completion: `Overpaid/unallocated money | Payment Approver | Review RM {amount} |
allocated/classified`. The figure existed — the shared `overpaid` answer, on the Invoice object
and in the Reports listing — but nothing turned it into work, so it was a number somebody had
to notice.

`payment.review_overpayment` is now a registry rule. It reads the ONE shared `soRemaining`
answer per Sales Order across every live invoice kind, so the Work item names the same figure
the Invoice object, the Reports listing and the statement show — one row per SO however many
invoices it holds. Its owner is the **Payment Approver** (§12: "void, reallocation, overpayment
review"), never the collection owner; an unassigned approver leaves it honestly ownerless rather than
borrowing somebody else's name. §10 gives the row no clock, so it opens with the overpayment
and none is invented.

**Both endings are authority's own, and neither invents a word.** ALLOCATED is §5's "allocate
valid obligation" — 0450's correction door — and the item closes when the figure reaches RM 0.
CLASSIFIED is the exceptional refund §13 already allows: "never AUTO-create Customer Credit or
Refund" forbids the automatic kind, not the decided one, so an APPROVED or PAID refund covering
the excess closes it. A refund still merely REQUESTED settles nothing, and one smaller than the
excess leaves the review open. **No Customer Credit is implied anywhere — none exists in the
system, and inventing one would have been inventing a capability, not building an approved one.**

Eight projection tests pin it, including every one of those negative controls.
### BUILD — a wrong allocation is corrected, not erased, 2026-09-08

The money was allocated once, at posting, and after that nothing could move it. An operator
who put a payment against the wrong SO — one customer with several SOs is normal here — had
exactly one remedy: void the payment and record it again. That destroys the receipt the
customer is holding in order to fix a bookkeeping mistake, and §5 asks for the opposite: the
payment STANDS, its allocation is corrected, and the correction is evidence.

`payment_correct_allocation` is the door. It refuses without a reason, refuses anyone but the
Payment Approver (§12: "void, reallocation, overpayment review") or principal, refuses any
account that is not an active operation, finance or principal account even if it holds that
duty (0513: the database refuses whatever the API refuses), voids the old
allocation rows rather than deleting them, inserts the new set, and moves every affected
order's `paid` by exactly its share — old orders and new ones locked in id order so two
corrections cannot deadlock. `payment_allocation_corrections` keeps before, after, actor,
time and the reason, append-only, with the definer door as its only writer.

**THE ARITHMETIC IS CONSERVED**, and the door enforces it: the corrected set must sum to
exactly the payment's amount, and the refusal names both figures. A correction moves money
between orders; it never creates or forgives any. That is what separates it from a void
(which reverses) and from a discount (which nobody may key here).

**A consequence found while building it, and fixed in the same migration.** `payment_void`
reversed `orders.paid` on the PAYMENT's own order. That was right while a payment could only
be allocated where it was recorded — and wrong the moment a correction can move it. Voiding
would have credited back an order that no longer held the money and left the one that does
overstated. The reversal now walks the LIVE ALLOCATIONS, which is what `paid` was built from;
a payment with no allocation row keeps the 0430 behaviour exactly.

**Proven against the ACTUAL doors** (rolled-back production probe, twelve controls): an
operator is refused · a reason is required · a short set is refused naming both figures · one
SO can appear only once · a split moves each order by its share · before, after, actor, time
and reason are recorded · the old allocation survives, voided · **a void follows the corrected
allocation to BOTH orders** · a voided payment has no money to allocate · a storage collection
has no allocation to correct · an unknown Sales Order is refused · the assigned Payment
Approver corrects. Eleven route and composition tests pin the wire and the form, including
that the control is not offered to staff who do not hold the duty.

### BUILD — the Payments Register becomes the §11 history, 2026-09-08

§11 asks for history "append-only/filterable by date, customer, SO, amount, method, invoice,
receipt, actor and exception", linking "immutable documents/source SO". Six of those nine axes
were already filterable columns; three were not there at all, and the audit called it PARTIAL
with "no single history surface".

The right answer was NOT a second surface — §13 rejects duplicate workspaces, and a second
history would be a second truth. The Payments Register already reads the canonical ledger,
is read-only by construction, and (since 0449) links the immutable receipt. It needed the
three missing axes:

* **Invoice** — from the payment's LIVE allocations, deduped and in order. One payment may
  cover several invoices (§4), so the cell is a list; a payment allocated to no invoice says
  `Not allocated to an invoice` rather than showing a blank that reads as "none owed". A
  VOIDED allocation is skipped: after a 0450 correction the old row survives, and it is not
  where the money sits, so it is not where the history points.
* **Recorded by** — the actor, already resolved to a name by the register read.
* **Exception** — the two a payment row can actually carry: `Voided`, and `Duplicate checked`
  (0448's acknowledged continuation). A payment that is both reads as `Voided` — the void is
  the state that matters to anyone reading history.

⛔ **The duplicate acknowledgement is DERIVED server-side to a boolean.** `source_metadata`
also holds whatever a payment provider sent, and that never needs to reach a browser, so the
raw field is dropped from the wire and a test asserts its absence.

Both derivations live in the shared module, so the register, any export and any later reader
answer identically. Six shared and composition tests pin them, including the voided-allocation
control and the no-invoice honesty.

### Verification evidence — the four categories, stated separately

Each §14 slice's evidence is one or more of: **DEPLOYMENT** (exact-SHA or ancestry-verified
convergence + served-bundle strings — proves the code shipped, nothing more) ·
**AUTHENTICATED INTERACTION** (signed-in production DOM walks — proves the interactions,
not the pixels) · **VISUAL INSPECTION** (a human-visible rendered page at real sizes and
real browser zoom) · **BUSINESS VERIFICATION** (the business outcome proven end-to-end —
rolled-back production probes with negative controls, or a live walk that exercises the
rule). Current standing: deployment evidence exists for every shipped slice; authenticated
interaction walks exist for the Calendar, Reports and the payment-link door; DB-layer
business verification exists for every migration (probes) and the §7 arithmetic; **visual
inspection and native-200%-zoom acceptance exist for NO slice** — they need a visible
signed-in browser window, and automation cannot drive the browser-chrome zoom control; the
Storage journey's authenticated interaction walk is also still owed.

**A PROBE THAT CANNOT SEE IS NOT A PROBE THAT FOUND NOTHING (measured 2026-09-08).** Searching
the served ERP bundle for Work-registry rule keys returns nothing for
`payment.review_overpayment` and `payment.check_stored_furniture` — AND for
`payment.collect_customer_balance`, which shipped weeks earlier. That third one is the control:
the Work registry is code-split into a chunk the entry bundle does not reference, so a
served-bundle grep is blind to every Work rule, old or new. Work-rule slices therefore carry
deployment evidence from the merge/ancestry check and from their tests, and their production
behaviour needs an authenticated walk. Reporting them as "absent from the bundle" would have
been a false negative.

The observed tool
failures, precisely and in the order they happened — two DIFFERENT modes, not one:

1. **Renderer unresponsive (while the signed-in window was minimised).** Screenshot
   capture returned `Cannot take screenshot with 0 width`; JavaScript evaluation timed out
   after 45s (`Runtime.evaluate` — "renderer may be frozen or unresponsive") on the
   existing tab AND on a freshly created tab. The minimised window is the correlated
   condition; renderer suspension is a plausible cause and was NOT measured.
2. **Extension not connected (later, 2026-09-07).** The browser tool returned
   `Claude in Chrome is not connected` — the extension is unreachable, a different failure
   from (1) and not a page-state problem at all.

Neither mode is a product defect and neither is evidence about the pages.

**CORRECTED 2026-09-08 — one action does NOT unlock all of it, and the earlier claim that it
would was wrong.** The browser tooling's own contract states that page-zoom shortcuts are
unsupported and error, so automation cannot drive Chrome's zoom control at all. The three
outstanding checks therefore need two different things:

* **The authenticated interaction walks** (the Storage journey, the converged Work/gate
  readers) need the Claude in Chrome extension connected and signed in, with the
  `erp.carresofficial.com` window at a normal visible size and left open.
* **The native 200% zoom pass** needs a person to set it: Chrome's ⋮ menu → the Zoom row →
  press + until the row reads **200%**, and confirm that displayed value. Two presses of ⌘+
  do not reliably mean 200% — the step sequence depends on the starting level — so the number
  shown in the menu is the evidence, not the keystrokes.
* **The visual pass** can then be captured from that same window. **Deployment evidence measured
meanwhile (2026-09-07), which is NOT visual or interaction acceptance:** the served ERP
bundle carries `A Storage Invoice correction is in progress`, `Create Storage Invoice`, the
Reports→Payment door card and the §13 no-refund wording, and carries NO `Reconciliation`
string; the live `ops_delivery_orders_money_gate` function body contains the 0441 storage
block, reads the storage kinds and performs the subtract-once arithmetic.

### The three external dependencies, stated exactly (2026-09-08)

**1 · Browser — what connecting it does and does NOT unlock.** Verified against the tool
contracts before promising anything: BOTH browser surfaces state that page-zoom shortcuts
(`cmd+=` / `ctrl+-` / `cmd+0`) are **not supported and return an error** — only a
magnify-a-region screenshot exists. So native browser zoom is **not drivable by automation
at all**, and connecting the browser does NOT unlock the native-200% check. What it does
unlock: the production VISUAL inspection at real sizes, the Storage journey's authenticated
interaction walk, and the production check of the converged Work/gate readers. The
native-200% pass needs a HUMAN keypress (⌘ + twice on the signed-in page) — or it stays what
it is today: layout-equivalent viewport evidence, never called acceptance.

**2 · Stripe — the approved test environment and its credential setup.** The Worker reads
`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` from Cloudflare Worker secrets
(`apps/api/wrangler.toml`), and today's production values are LIVE mode (`cs_live_` sessions
on record). Provider end-to-end verification therefore requires, and must not be faked:
a Stripe **test-mode** key pair (`sk_test_…` plus the test webhook endpoint's `whsec_…`), set
as secrets on a **separate non-production Worker environment** — `wrangler secret put
STRIPE_SECRET_KEY --env <non-production>` and the same for the webhook secret, entered by the
owner straight into Wrangler. Secrets are never pasted into a chat, never read back, and the
production live pair is never replaced for testing. Until that environment exists, the
provider lifecycle stays PENDING and the database posting contract stands on its probes.

**3 · The business content owed, consolidated into one request.** Two owner-supplied facts,
and nothing may be invented or shortened in their place:
   · the approved customer **Important Notes** wording — the bottom rules of the payment
     message (may be pasted straight into `Settings → Payment → WhatsApp templates` as the
     `Standard bank transfer` template);
   · the **receiving bank account numbers** for the two seeded, approved banks — PJ
     own-showroom → Hong Leong Bank, Dealer → RHB (both rows exist with the account number
     empty; a manager enters them in `Settings → Payment`, never through this chat).
Both block only the dependent customer messages (#20 in the list below); no other delivery
waits on them.

### CORRECTION — a void is not a waiver, and neither model erases the other, 2026-09-08

The 2026-09-07/08 storage precedence rules were wrong twice, both times in the same
direction: they let a valid obligation vanish.

1. `a live paper exists` — voiding the last paper fell back to the legacy charge, and a
   partly-invoiced order hid the un-invoiced group's fee.
2. `paper history owns the order` — the invoice model then stopped counting the legacy fee
   at all, and a NEVER-ISSUED draft could take ownership and erase a live obligation.

**Rule (2) rested on something nobody approved: that voiding a paper is a WAIVER.** It is
not. §4 makes a void the CORRECTION path (void + linked replacement). The approved storage
waiver is the §7 extra-free decision, which changes the FREE PERIOD before anything is
charged. And C9's shipped semantics are explicit: `storage_waiver_status = 'approved'`
RELEASES the hold and leaves the money owed, while the write-off is
`storage_fee_override = 0` — *"an override must never quietly forgive money"* (Jess,
2026-07-27). A legacy fee is therefore owed until it is COLLECTED or written off, and
nothing else clears it.

**THE CORRECTED RULE, inventing nothing.** Each model's obligation stands under its own
approved rule and they are ADDED, each counted exactly once: live ISSUED papers (netted so
`orders.paid` subtracts once across goods and storage) PLUS the legacy C9 figure (never
netted — C9 never read `paid`; its clearing fact is collection). Model ownership is gone, so
a draft cannot take it and a void cannot forfeit it. `unreconciledLegacy` now names the
legacy PART OF the figure — it is included in the money, not carried beside it — so an
operator collapses the state with the approved instruments: collect the fee, or override it
to 0.

**The pure-legacy divergence is CLOSED, not documented.** The Payment screens carry the
legacy figure too: the register wire now returns `legacy_storage_owing`, derived server-side
through the SAME shared `storageHold` the gate and Work use, batched once per page. And the
database door counts the KEYED legacy ladder (`0447`). One deliberate split remains and it
is 0362's own recorded law, not drift: the legacy ACCRUAL (a `storage_from` walk with no
keyed figure) stays TS-side because its day walk and catalog lookup do not belong in a
trigger — pinned by its own reconciliation case.

**The mixed state is unbirthable from BOTH directions, by any writer.** `0445` refuses a
case beside an uncollected keyed fee; `0447` adds a BEFORE INSERT OR UPDATE trigger on
`ops_order_control` refusing to RAISE a storage fee on a case-managed order — a trigger, not
a route check, so the legacy writers that exist today (the order-control PATCH) and any
future one are covered. Lowering, clearing to 0 and collecting stay open: they are exactly
how an operator collapses an unreconciled state.

**Proven against the ACTUAL database gate** (rolled-back production probe, eight controls —
a TypeScript mirror is never proof of SQL): baseline opens · PURE LEGACY blocks naming
RM 300.00 · the override-0 write-off opens · a collected fee opens · MIXED blocks naming
RM 350.00 (each obligation once) · papers VOIDED still block on the RM 200.00 legacy fee
(a correction forgives nothing) · a never-issued draft erases nothing · the model guard
refuses raising a legacy fee on a case-managed order while lowering stays open.

### THE ONE FACTUAL GAP LIST — audited 2026-09-08, whole approved mission

Audit method: every approved capability in §2–§17 was searched for in the repository and,
where it is data-bearing, counted in production. `BUILT` means shipped code plus at least
deployment evidence; `PARTIAL` names exactly what is missing; `NOT BUILT` means no
implementation exists. **Production data facts, measured 2026-09-08:** 1 invoice row (0 with
a snapshot — the pre-0429 row), 0 live payments, 0 receipts, 0 allocations, 0 recorded
messages, 2 seeded templates, 2 bank-account rows with NO account numbers, 0 storage cases,
0 storage papers, 0 legacy storage signals. The posting chain has therefore never been
exercised on live rows — its verification is probe/test based, as recorded in §14.

| # | Approved capability | § | State | The precise gap |
|---|---|---|---|---|
| 1 | Canonical posting, allocation, receipt identity, idempotency | 2 | **BUILT** | Production-verified 0351; no live rows exist yet |
| 2 | Payments + Invoices Registers, one-scroll objects, Inspect | 3·16 | **BUILT** | — |
| 3 | Record payment (6 methods, evidence, review sentences) | 3·16 | **BUILT** | — |
| 4 | Invoice lifecycle: draft → issue → void + replacement lineage | 4 | **BUILT** | — |
| 5 | Invoice document from its immutable snapshot | 4·16 | **BUILT** | — |
| 6 | Receipt reprint from an immutable snapshot | 4 | **BUILT** | 0449: the ONE writer freezes the receipt's content at posting; `GET /payments/:id/receipt-document` reads it, `Print receipt` stands on the payment object, and a voided payment reprints saying VOIDED. Payments recorded before 0449 read live and say so |
| 7 | Structured collection outcomes (`Customer paid` · `will pay on a date` · `needs help` · `disputes the amount` · `did not answer`) | 3 | **BUILT** | 0446 with probe; `Record the result` on the Invoice object |
| 8 | Promise-to-pay and the missed-promise Work sort | 3·10 | **BUILT** | `payment.missed_promise` is a registry rule with its own five parts; the feed raises it on the day the CUSTOMER chose, replaces the window item rather than doubling it, and it reaches Work even when the collection clock has no anchor |
| 9 | `Correct allocation` (before/after, actor, time, reason) | 5 | **BUILT** | 0450: the payment stands and its allocation moves; the corrected set must sum to what was received; old rows are voided, never deleted; the Payment Approver is the authority and `payment_void` now follows the live allocations |
| 10 | Likely-duplicate inspection before privileged continuation | 5 | **BUILT** | 0448 moved the rule into the database: the CUSTOMER's live payments are compared, the order is locked first so concurrent submissions serialise, and continuation needs the Payment Approver duty or principal. The page still draws the warning; it no longer decides |
| 11 | Overpayment surfaced and reviewed | 5·11 | **BUILT** | `payment.review_overpayment` is a registry rule owned by the Payment Approver; it closes the two ways §10 names — allocated (0450's correction) or classified (the exceptional refund §13 allows). No Customer Credit is implied; none exists |
| 12 | Void payment with reason + approver duty | 5 | **BUILT** | — |
| 13 | Storage case: witnesses, derived permanent start, rule snapshot | 6·7 | **BUILT** | 0436/0439 with probes |
| 14 | Storage charging → Storage / Additional Storage Invoice | 4·7 | **BUILT** | 0438 with probe |
| 15 | Storage waiver ladder (Operation → Waiver Approver → nobody) | 7 | **BUILT** | 0436 with probe |
| 16 | `Request a later delivery date` | 6 | **BUILT** | 0451 records the submission — new date, governed customer-side reason, storage-terms acknowledgement, optional free-storage request and the written evidence without which there is no request. It never moves the delivery date, which Orders/Delivery owns |
| 17 | `Check the stored furniture` every configured interval | 6 | **BUILT** | 0452 makes the look a RECORD — the completion fact the engine needed — and `payment.check_stored_furniture` is a registry rule fed from the open cases, the last check and the configured interval |
| 18 | Storage obligations reconciled across every reader + the DB gate | 2·14 | **BUILT** | Five-surface reconciliation test; 0441/0445 probes |
| 19 | Ask the customer to pay + immutable message ledger | 16 | **BUILT** | — |
| 20 | **Complete §16 customer message assembly** (bank routing, Partner contact, Important Notes) | 16 | **BLOCKED — owner content** | Wording and bank account numbers are owner inputs; 2 bank rows exist with NO account numbers. Never invented |
| 21 | Template library, versions, defaults, manager gate | 16 | **BUILT** | 0435 with probe |
| 22 | Online payment link journey + provider posting | 16 | **PARTIAL** | Journey and DB posting proven by probe; the provider end-to-end walk needs Stripe TEST-mode keys in `apps/api/.dev.vars` (the route is documented there) — the deployed Worker has one environment, so a test key there would replace the live one |
| 23 | Send receipt (template-driven) | 16 | **BUILT** | — |
| 24 | Reports → Payment, six listings + Excel export | 11·16 | **BUILT** | — |
| 25 | One read-only customer statement | 11 | **BUILT** | `GET /invoices/statement/:orderId` derives it across the CUSTOMER's Sales Orders through the same shared `soRemaining`; `Statement` opens it from the invoice object. Read-only, with no action on it |
| 26 | Payment history filterable by date/customer/SO/amount/method/invoice/receipt/actor/exception | 11 | **BUILT** | The Payments Register IS the history surface: all nine §11 axes are filterable columns, it links the immutable receipt (`Print receipt`) and the source SO, and it is read-only by construction |
| 27 | Settings → Payment (banks, methods, templates, numbering, storage) | 12 | **BUILT** | 0431/0435; bank account NUMBERS are the manager's to enter and are empty |
| 28 | Permissions: §12 role door, duties via the Shared Duty Resolver | 12 | **BUILT** | — |
| 29 | Intentional rejects: no Refund queue, no Bank Matching workspace | 13 | **BUILT** | Refunds read-only history; Recon page and navigation retired; data and API kept |
| 30 | Production VISUAL pass · native 200% zoom · Storage interaction walk | 14 | **BLOCKED — external** | Browser unavailable; both observed failure modes are recorded above |

**Owner decisions open (not engineering choices):**
- ~~Does an unreconciled legacy storage fee HOLD the delivery?~~ **WITHDRAWN 2026-09-08** —
  it was never an owner question. Existing authority settles it: a legacy fee is cleared
  only by collection or an override of 0 (C9), and money in full before delivery is
  ABSOLUTE (delivery/MASTER.md 2026-09-01). It holds, like any other owed money.
- **The two pieces of business content, consolidated into one request (#20).** Both are the
  owner's words and neither may be invented, so §16's customer message is incomplete until
  they exist. They are: (a) the approved **Important Notes** wording that goes on the payment
  message — the sentences Carres wants every customer to read before paying; and (b) the
  **receiving bank account numbers** for the two bank rows already configured, which today
  hold a bank name and NO account number. They can be entered directly in
  `Settings → Payment` (the manager-permission surface, 0431) — no engineering step waits on
  anything else.
- **Who holds the Payment Approver duty.** Measured 2026-09-08: `workspace_duty_assignments`
  carries `po_duty` and `grn_duty` rotations and **no `payment_approver` row at all**. The
  duty resolver refuses an unassigned duty (correctly), so today `Void payment` (0430) and
  the §5 duplicate continuation (0448) work for **principal only** — nobody in Operation can
  perform either. The engineering is right; the assignment is missing. Naming the holder is
  the owner's, exactly as the PO/GRN rotation was.

**Overall status: PARTIALLY DELIVERED.** Every approved CAPABILITY in the table above is now
built. What keeps the module short of DELIVERED is not engineering:

1. **#20 — owner content.** The approved Important Notes wording and the receiving bank account
   numbers. Entered in `Settings → Payment`; never invented here.
2. **#22 — Stripe test-mode keys**, so the provider end-to-end walk can run against the isolated
   local environment documented in `apps/api/.dev.vars.example`.
3. **#30 — the acceptance that needs a person**: the production visual pass, the native 200%
   zoom pass (automation cannot drive Chrome's zoom control) and the Storage authenticated
   interaction walk.
4. **The `payment_approver` duty has no assignment row in production** (measured 2026-09-08), so
   `Void payment`, the §5 duplicate continuation and `Correct allocation` work for principal
   only. The engineering is right; the assignment is missing.

Until 1–3 are closed, several slices carry deployment and DB-layer evidence but no visual or
authenticated-interaction acceptance — stated per slice in §14 rather than averaged away.

## 15 · Migration and module done-when

Adapt 2990's useful lineage: SO → DO → Sales Invoice → canonical Payment → Receipt, ledger-derived
balance, history and export. Reject its routine negative-payment/refund/credit surface.

Cutover: inventory writers/documents → reconcile balance/evidence → route through canonical service
→ prove parity/idempotency → make old forms read-only → retire duplicates only under separate live
authorisation. The 2026-09-06 BUILD/DELIVERY instruction authorises implementation, PR delivery, governed merge,
deployment and authenticated verification. It does not authorise customer messages, deletion or
fabricated payment/communication evidence.

Done means production proves one writer/arithmetic; atomic posting; Payments + Invoices Registers; system-led
Primary School English actions; global Duty/cover; approved storage trigger/rates/customer evidence/
tiered waiver/per-group clock/incremental invoices; effective snapshots; Delivery/Finance boundary;
append-only exceptions/reports; and no re-entry of rejected Refund/Bank Matching/Negative Payment.


## 16 · Locked Payment UI delivery contract — owner instruction 2026-09-06

### Monitor, Payment Records and Inspect

Use the UI MASTER Register Shell: 50px destination header (`Monitor` · `Payment Records`) with
global utilities only; 45px toolbar with Search, Export, Columns at right. No `New Payment`.
Column filters live in table headers. Selection replaces the same toolbar in place. The footer
names visible record count and money. The first data identity remains sticky. At 390px and 200%
zoom preserve one semantic listing with governed horizontal scrolling; the Monitor's 240px follow-up
plan rail starts collapsed under 1100px and is a drawer on a phone.

The two destinations, their columns, Inspect contents, filters, summaries and states are ruled in
§3 (owner ruling 2026-09-12) and are not restated here. The former `Payments · Invoices` toolbar
switch and the Invoices Register are retired; an Invoice is displayed and opened from the Monitor
and belongs to its Sales Order.

### Object views and action composition

Ordinary View is full-width, one continuous scroll. Payment order: Payment facts → Allocated to →
Evidence → Actions → Receipt → History (§3). Persistent identity: Receipt No · Customer, source
SO and factual state (`Payment recorded` · `VOIDED`). Print is direct output. Authorised Correct
allocation / Void payment live in header overflow; unauthorised staff never see them. A void
preserves the original Receipt with VOIDED, reason and history.

Collection workspace order (§3, owner approval 2026-09-25): Money → Delivery Dates → Items, Services & Stock →
Storage → What to do → Collection owner → Related Payments → Communication History (no Invoice section). Check money, goods readiness/arrival and customer Delivery before creating collection Work.
When goods are not ready and arrival is unknown, show `Wait`; never create a blind payment chase.
Draft may be edited and issued. Issued Invoice has no ordinary Edit; correction voids the old
Invoice and creates a linked replacement. (0476 · BUILT: `Void and replace` sits in the Invoice
section of an issued invoice, shown to the principal — the SQL also admits the Payment Approver
duty, which the screen cannot yet resolve. The void reverses the invoice's journal entry; the
replacement draft is issued from the order's `Generate invoice`, which draws a new number.)

50/50 is used only while editing a customer-facing message/Invoice, recording Payment, or sending
Invoice/Receipt. Narrow widths stack action/form first, customer document/message preview second.
**In place (owner approval 2026-09-25, segment 5):** `Ask customer to pay`, `Record the result` and
`Record payment` open INSIDE the Monitor row's expansion (replacing its three blocks) and inside the
Work Customer card's Payment section — the same components, never a page change. After a successful
posting the door strip's blue becomes `Send receipt and invoice` (one message, two documents); a
recorded message adds one Communication History line and moves the Work card to `Waiting`.

### Bank transfer and evidence

Shared Work opens Invoice → prepared WhatsApp → staff sends → customer returns slip in WhatsApp →
staff uploads it in the same Invoice → Review payment → Record payment → atomic Payment,
allocation, outstanding, Receipt, History and Work closure → Send receipt.
Uploading evidence is not Payment or Bank confirmed. Review explicitly states:
`This records customer money.` / `This does not confirm the bank account.`
Operation uploads; Finance checks the external bank separately. Only a real Finance Exception
stops Delivery. Failed atomic posting retains entered information and writes none of the results.

Order source selects bank automatically: PJ own-showroom → configured Hong Leong Bank; Dealer →
configured RHB. Staff cannot choose/type an account ad hoc. Account details belong in Settings.
Payment live-reads the assigned Partner customer-facing contact from Delivery Settings. Approved
contacts remain owned there: NETS 012-474 9881; AL 011-1268 7582; TEOW 016-703 3373;
TT 011-1778 7883; EU 012-942 7922; HOUZS 011-1110 8855. Missing Partner number uses the
configured Carres Delivery Line 011-1225 7456. Never expose an internal Partner WhatsApp group.

### Messages and template library

Preserve the complete approved customer message: customer, Delivery date/range, amount needed,
correct bank/link, slip instruction where applicable, assigned Partner, Partner's 1–3-day contact
statement, customer-facing number, and complete Important Notes/storage rules. Never shorten by
removing bottom rules. Actual sent messages and template versions are immutable history.

Sending: Edit message → Copy message → Open WhatsApp → Upload sent screenshot → Record message sent.
Opening WhatsApp alone is neither sent nor read. Ordinary wording is editable for one message;
amount, bank, Delivery date, Partner contact and charge facts remain protected source fields.

Settings → Payment → WhatsApp Templates holds multiple named Active templates per purpose and one
Default per governed situation. Structured facts recommend a template; `Change template` chooses
another Active template. Examples: Standard bank transfer, Gentle reminder, Payment should have
been received, Customer promised to pay, Standard payment link, New link after expiry, Payment
received, Partial payment received. Manager actions: New template, Duplicate, Edit, Set as default,
Make inactive, View history. Template Edit uses 50/50 ordinary wording and real preview; protected
merge fields; required-field checks before Review; Review changes before Save.

### Online link and Receipt

Converge existing Stripe-hosted checkout through the canonical posting service. Create payment link
shows amount, `Waiting for payment`, exact expiry → Copy payment message → Open WhatsApp → Upload
sent screenshot → Record link sent. Created/sent/opened is not Payment. Only successful provider
callback/poll posts Payment and Receipt atomically. Unpaid expiry says `Payment link expired`,
`Amount needed remains unchanged`, `Create a new payment link`. No general Customer Portal.

Successful posting shows Payment recorded, Receipt number, Amount still needed, Open receipt,
Send receipt. Receipt message includes amount received, Receipt number, actual remainder,
Delivery date/range, Partner's 1–3-day contact statement and customer contact. Full payment says
`Amount still needed: RM0`. Sending requires sent proof. Preserve the earlier complete Payment
message and Important Notes in Communication History.

### Methods, Settings, Reports and states

Selectable Active manual methods and required evidence: Bank transfer — transfer slip;
DuitNow QR — payment screenshot; Cheque — cheque photo and cheque number; Cash — cash collection
proof; Credit card / Debit card — terminal receipt and approval code. Online payment is provider-
recorded and is never a manual method. Cash never bypasses the paid-before-delivery gate.

**Payment methods is the one list of methods (0476 · BUILT, awaiting production proof).** A
manager adds a method, renames it, switches it off and chooses the one money account it lands
in (cash, a bank account or card and online settlement — never a control or header account).
Every form that records customer money (the Invoice's Record payment, the order's Record
payment and storage collection, Finance's Record receipt) offers the Active rows and sends the
method's key; a method a manager adds asks for `Payment proof` and an optional Reference. The
ledger resolves the account from the same list, so a new method posts Dr its money account /
Cr 1210 with no code change, and a renamed method keeps its old receipts' history. A method
with no money account is refused by the writer from go-live. The Sales Portal's own sale-time
method list (SO Maintenance) stays its own setting; its keys reach the same writer.

Settings groups, in order (§12): Receiving bank accounts; Which bank to use; Payment methods;
Collection timing; WhatsApp templates; Invoice and Receipt numbers; Storage charges; Online
payment provider. Default View uses readable summaries and focused Edit / Review changes, not raw
fields. Numbering shows only next example and `Numbers are created automatically.` No prefix,
sequence length, year/month toggle, reset or per-document number editing. No named approver,
collection owner or staff roster in Payment Settings.

Storage cards are separate and each reads as one rule card with one governed `Edit`:

```text
Mattress / Bedframe                      Sofa
Free storage 7 calendar days             Free storage 14 calendar days
Charge RM 150.00                         Charge RM 200.00
Charge every 30 calendar days            Charge every 14 calendar days
Operation may approve until Day 21       Extra free storage Not allowed
Approver may approve until Day 30        Check stored goods every 30 calendar days
Check stored goods every 30 calendar days
```

Existing cases keep the Storage Start rule snapshot. Shared Staff & Duties resolves people.

Shared Reports → Payment: Money received; Customer balances; Storage charged and collected;
Storage waived; Payment corrections; Money needing review. No Refund, Bank Matching or Negative
Payment report. Loading, empty, error, stale and permission states use Primary School English.
Upload, Review, Record, Send, Back and recovery remain usable at 390px and 200% zoom.

## 17 · Calendar navigation — owner-approved target, 2026-09-06

**RULING / APPROVED TARGET — reached from the Monitor since 2026-09-12.** The owner approved the
recommendation: click a customer or document to inspect the relevant collection object; click a
date to see its schedule. This supersedes the earlier suggestion that clicking a customer
automatically switches to Calendar and chooses Delivery before Expected arrival. The Monitor's
`Scheduled delivery` cell is the door when a day is scheduled (`?calendar=1&date=&so=`); the Calendar is a view of the
Monitor, never a third destination.

| Selection | Required result |
|---|---|
| Customer / SO / Invoice in the collection listing | Open the corresponding order's collection details, including money needed, goods arrival and delivery facts; preserve the selected SO identity when a customer has several orders |
| Customer Delivery date | Open Calendar at that date's fixed workweek and highlight the selected SO |
| Expected arrival date | Open Calendar at that date's fixed workweek and highlight the selected SO; explicitly label Expected arrival |
| Date in the left month calendar | Show the fixed workweek containing that date |
| Record without a relevant date | Keep it available in the listing, explain the missing date, and never invent a calendar position |

The Calendar view uses the owner-described shared composition: 240px page rail with a complete
month fixed at its top, month arrows moving one month at a time, and business filters scrolling
vertically below it independently. Sunday remains visible and is muted when non-working. The
selected date uses the standard blue selection token. A work indicator must have a textual or
accessible explanation and must not rely on colour alone. The right side shows a fixed workweek,
without infinite horizontal scrolling. Choosing a business listing filter keeps the month visible;
choosing a month date returns to Calendar. Apply the shared responsive authority at narrow widths.

Expected arrival, Customer Delivery and collection follow-up are distinct date types. Read arrival
and delivery facts from their authoritative modules; never create editable copies in Payment.
Appearance on an Expected arrival date does not itself create a collection deadline or chase.
Preserve the shared collection clock and readiness rules, including Wait when goods are not ready
and arrival is unconfirmed. Do not merge two dated facts for one SO into two apparent payments.

This ruling specifies Payment's Calendar interaction and source boundaries. It does not introduce
a module-local Work queue or changes to other modules.
