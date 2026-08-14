# DELIVERY — MASTER

> **The only Delivery document.** Overwrite it when re-ruled; Git is the archive.
> This operating model was owner-approved 2026-08-14 after the PR #769 Blueprint-before-Cards pass.
> Current implementation may lag this target; absence in code does not reopen approved truth.

## 1 · Mission, ownership and boundary

**MISSION** — turn the Customer Order's delivery commitment into a customer-confirmed booking,
a controlled Delivery Order, a factual Delivery Visit, delivery photos, and a clean finish,
another delivery or cross-module handover.

**DELIVERY OWNS**

- Logistics Partner identity/rules, assignment and append-only assignment history;
- the one derived carrier+date grouping and capacity view; it is not yet a first-class trip;
- Delivery Orders: number, issued scope snapshot, print/reprint and close/replacement history;
- Delivery Visits, item results, delivery problems, goods-location observations and delivery photos;
- Delivery actions and their completion evidence.

**DELIVERY READS / LINKS — NEVER WRITES A DUPLICATE**

| Truth | Owner |
|---|---|
| customer commitment, confirmed delivery date and time slot | Customer Order |
| ordered goods and permitted split/customer agreement | Customer Order |
| physical unit, readiness, custody, handover and return receipt | Stock / Warehouse |
| payment, outstanding and receipt | Money In |
| delivery money hold/release decision | Customer Order |
| supplier/PO ETA | Purchasing |
| product category and photo rule source | Catalog |
| remedy, replacement, refund, compensation and claims | owning downstream module |
| logistics claim/payment | Finance |

Delivery records what happened and creates/links the correct handover. It never decides refund,
replacement, compensation, supplier liability or stock correction. A manager lifting a delivery
money hold never forgives the debt.

## 2 · Current operating model

### 2.1 NETS now

For Klang Valley, **NETS Logistics is the current default and main Logistics Partner**.

```
credible fulfilment route
→ auto-assign NETS Logistics
→ NETS is responsible without an Accept click
→ NETS contacts the customer and obtains confirmed date + time slot
→ Operations records on NETS' behalf while the partner portal is immature
→ later NETS records the same facts directly
```

NETS reports only when it cannot deliver: `Cannot deliver on this date` or `Cannot deliver this
order`, with governed reason. The first keeps NETS eligible while Operations chooses another date
or partner; the second closes the active assignment. Either creates `Operations to assign another
Logistics Partner`. Operations chooses the replacement; there is no silent automatic reassignment.

Different deliveries may use different partners. One active Delivery Order / Delivery Visit has
exactly one active Logistics Partner. A permitted split may use different partners only through
separate scopes, Delivery Orders and Delivery Visits.

### 2.2 Current lifecycle

```
delivery obligation
→ default NETS assignment
→ preferred/provisional booking
→ NETS obtains customer-confirmed date + time slot + evidence
→ Issue delivery order conditions pass
→ Operations issues Delivery Order
→ Warehouse prepares and hands goods over
→ Logistics confirms custody and departs
→ Logistics updates arrival time
→ Delivery Result + item results + goods location
→ delivery photos uploaded and checked
→ finish / arrange another delivery / hand over a linked case
```

Planning and partner assignment may occur before goods are ready. A call alone never completes the
booking action. Confirmed means the customer's date **and** time slot with evidence.

Before `Issue delivery order`, all must pass atomically:

1. customer-confirmed date and time slot;
2. the released core goods are ready/reserved and grouping rules pass;
3. the Customer Order money condition passes;
4. the delivery date is permitted.

Sunday is refused. Partner working days, closed dates, notice and ordinary capacity warn unless a
governed rule explicitly makes them a hard stop. Public-holiday handling follows the governed
calendar/policy and retains any required acknowledgement.

## 3 · Goods scope and Delivery Order

- Bed-set goods remain inseparable.
- Sofa may travel separately only with customer agreement.
- Accessories do not block core large goods.
- The scope preview states `This delivery` and `Remaining after this delivery` with the real reason.
- Delivery reads Stock readiness/reservation and never edits a duplicate.

`Issue delivery order` is the one employee word and act. There is no free `Create DO`, bulk issue,
or editable Sales Order clone. Issuing rechecks every condition, creates a stable DO number, saves
the released snapshot and creates the current Delivery Visit atomically.

Reprint keeps the number and logs the event. A replacement requires the previous active DO to close
with reason, creates a new number and Delivery Visit, and never inherits old photos, problem or
driver notes.

## 4 · Warehouse and Logistics separation

NETS Warehouse and NETS Logistics are separate duties and business identities even if supplied by
one legal company. Warehouse owns physical readiness, unit/location, handover and return receipt;
Logistics owns customer contact, vehicle/driver, transport, Delivery Result and photos.

Warehouse handover and Logistics custody acceptance are two events. Logistics departure cannot
stand in for warehouse handover. On return, Logistics reports goods returned and Warehouse records
what it actually received, condition and location. A difference creates investigation work; neither
side's original fact is overwritten.

One individual login may hold Warehouse, Logistics or both duties and switch workspace without
logging out. Each employee has an individual identity—no shared company credential. Every event
records person, company and duty. Even when one authorised person performs both steps, the two
events remain separate.

## 5 · Delivery Visit, result and photos

Employee UI uses **Delivery Visit**, never `Attempt`; internal implementation may retain
`delivery_attempt`.

Each actual customer visit is append-only and stores DO, date, partner, driver/vehicle snapshot,
arrival-time history, actual times, Delivery Result, item results, problem, goods location, photos
and linked cases. Current work reads the latest active visit; old visits remain read-only history.

Employee results are:

- `Delivered`
- `Some items delivered`
- `Not delivered`

Every item receives its own result. Every undelivered item must state its current location. Field
staff record the observable problem, not blame or remedy. Operations may later append Root Cause.

Photos bind to the Delivery Visit. The required set derives from the goods actually delivered and
Catalog category rules: signed Delivery Order plus governed completion photos. Logistics uploads;
Operations checks and may require re-upload. Finance reads eligibility and does not re-check photos.
Delivered is not finished while required photos remain missing or unchecked.

## 6 · Problems, another delivery and handover

Never show generic `Delivery Exception` or `Customer Refused Delivery`. Show the real problem.

| Observed problem | Next route |
|---|---|
| Customer not available / asked for another date | arrange another delivery / confirm new date |
| Vehicle breakdown | continue if customer accepts; otherwise arrange another delivery |
| NETS cannot deliver | Operations assigns another Logistics Partner |
| Product does not match Customer Order | create/link Product Issue case |
| Product damaged during delivery | create/link Service Case |
| Warehouse picking error | open/link Warehouse investigation |

Another delivery closes the factual current visit and DO, preserves delivered items, returns only
remaining obligation to booking/readiness, and issues a new DO after all current conditions pass.
Customer confirmation is re-obtained only when the arrangement changes and it is actually needed.

Closing locks Delivery facts. A later complaint creates a new linked owning case and never reopens
or rewrites Delivery history.

## 7 · Information architecture and UI

The ERP sidebar has one `Delivery` destination under Supply Chain. No top-level Fleet, Trips,
Regions, Delivery Returns or Delivery Settings destinations.

Routes:

- **Delivery Work** — default operational home;
- **Delivery Register** — all delivery obligations;
- **Delivery Orders Register** — document lookup/audit;
- **Delivery Workspace** — one obligation, DO and visit chain;
- central **Reports → Delivery**;
- central **Settings → Delivery**.

All pages apply the governed Shell Template. Registers apply the Register Template; truth-register
selection scopes output only and never bulk Issue/Deliver/Close/Assign/Confirm.

Delivery Register defaults: `SO · Customer commitment · Confirmed booking · Customer · Area ·
Logistics Partner · DO · Current action · Current problem`; expansion shows goods obligation only.

Delivery Orders Register defaults: `DO · Issued · Delivery date & slot · Customer · SO · Logistics
Partner · Delivery Visit · Result · Delivery photos`; it never edits commercial or money truth.

Delivery Workspace follows Object Detail order:

1. Identity: Customer · SO · Customer commitment · Outstanding;
2. Current Action, always visible;
3. Current Issues only when real;
4. Progress: Plan → Confirm delivery date → Issue delivery order → Deliver → Check delivery photos → Finish;
5. Booking · Goods · Logistics Partner · Delivery Order · Warehouse handover · Current Delivery ·
   Delivery Photos · Route/Linked Cases · Delivery History;
6. append-only Activity.

No employee UI uses `Release`, `Attempt`, `POD`, `Pending`, `At Risk` or a generic `Exception`.
Use `Issue delivery order`, `Delivery Visit`, `Delivery Result`, `Delivery History`, `Delivery
Photo` and `Signed Delivery Order`.

All scheduling/grouping/work due displays use actual `weekday + date`, never Today, Tomorrow,
Next 3 Days or Next 7 Days. The Calendar reads only Booking; provisional dates are visibly
provisional and excluded from confirmed counts/capacity.

## 8 · Work, Quick Rail and NETS portal

Delivery facts generate one ERP Work set. My Work and Team Work are filters over it. Completion is
the business fact, never a Done checkbox. Quick Rail My Work, Calendar and Activity are previews
that deep-link to the owner and never store duplicate truth.

NETS Logistics portal is mobile-first and shows assigned deliveries grouped by actual weekday/date.
Each record exposes one current action: confirm delivery date, update arrival time, record Delivery
Result or upload Delivery Photo. Low-frequency doors are `Cannot deliver on this date/order`.

Arrival fields are distinct: Planned Arrival Time, append-only Revised Arrival Time and Actual
Arrival Time. They never rewrite the customer-confirmed slot. Exceeding the slot raises truthful
work; only a new customer confirmation changes Booking.

Operations uses the same action forms on behalf of NETS until direct use is mature. Every proxy
record stores business party, reported by, recorded by, source, reported time, recorded time and
original evidence where needed.

WhatsApp is communication, not the evidence store. Google Sheet may remain during separately
authorised cutover validation but must not remain a second long-term authority.

For AL, TT, Teow or another Partner without portal access, Settings marks assignment confirmation
required. The portal prepares governed WhatsApp/email text and may copy/open the channel, attach the
DO and retain communication history. Prepared/copied/opened/sent never means accepted, booked or
delivered. Operations uploads the Partner's reply screenshot/email and records the concrete answer
on the Partner's behalf; that reply evidence alone may complete Partner confirmation, customer-date
confirmation or a reported Delivery Result. Message content exposes only the minimum delivery data.
Future messaging/email/Open APIs must call these same governed actions with authenticated Partner,
idempotency and verified provenance; they never write a derived status directly.

## 9 · Settings, permissions and reports

Central Delivery Settings owns Logistics Partners/default coverage rules, areas, working calendars,
capacity, drivers/vehicles, problem and Root Cause dictionaries, photo requirements, time slots,
site rules and portal access. Rules are audited/versioned; historical visits retain the rule/value
used at the time. NETS default is configurable, not hard-coded.

Permission is separate for view, record, record-on-behalf, review, correct, configure and export.
NETS Logistics sees only its assigned deliveries and minimum customer data. NETS Warehouse sees
only warehouse work. A person with both duties switches workspace. Partner users never see customer
money, other partners, commercial terms, Root Cause decisions or photo approval.

Central Reports owns commitment performance, booking confirmation, DO control, Delivery Results,
problem vs Root Cause, photo timeliness/rejection, partner performance, capacity by actual date,
Warehouse handover/returns and closure. Every measure declares its source date/fact and coverage;
old visits count only where the report definition calls for history, never as current work.

## 10 · Current truth versus intentional future options

**CURRENT:** NETS is Klang Valley default/main Logistics Partner; NETS deals with the customer;
Operations records on behalf until NETS direct portal use is mature; other partners are assigned by
Operations only when NETS cannot deliver.

**NOT CURRENT OPERATING TRUTH:** customer self-scheduling, Carres central customer scheduling,
automatic partner recommendation/allocation, routine multi-partner Klang Valley operation, Partner
Dispatch Board, route optimisation, formal lorry/Dispatch Run, per-trip cost or loading manifest.

The architecture does not bind Booking to NETS, so those capabilities can be reconsidered later.
A first-class Dispatch Run/Trip is admitted only when a vehicle-level fact actually exists—own-fleet
dispatch, ordered stops, signed loading manifest or per-trip cost. Until then partner+date grouping
remains a derived view.

## 11 · Approved target versus measured implementation

This MASTER is the approved operating target. Existing `OperationDelivery`, shared queue/calendar,
booking, DO, Delivery Visit/unit-result, photo and carrier-capacity code is measured evidence and may
cover only part of it. Legacy Order-owned or compatibility write doors do not regain authority by
existing in code. Application reconciliation and external cutover require later separately governed
work; this Plan approval itself changes neither production nor partner operations.
