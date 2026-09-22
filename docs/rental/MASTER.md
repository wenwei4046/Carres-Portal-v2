# RENTAL — MASTER

> **The only Rental document.** Overwritten when re-ruled; never versioned.
> **You read `CLAUDE.md` and this file.**

---

# Subscription / Diglant — owner direction 2026-09-22 · PLAN / NOT BUILT

**OWNER-CONFIRMED BUSINESS DIRECTION.** Jess confirmed Subscription as a separate business
module/line from outright sales. Diglant is the mattress supplier exclusively for Subscription
and is also an investor. The business has monthly quantity KPI/forecasts used to plan how many
subscriptions to sell and how much stock to order from Diglant. The reported stock supply lead
time is 45 days. Carres appoints logistics to collect at Diglant and deliver to customers;
Diglant can print and attach Carres Unit ID labels. Other operating processes should reuse the
current portal flow; Subscription needs its own additional after-sales detail. The owner requests
a whole-portal consequence audit and complete recommendation, not a local SO filter-only change.
This confirms direction, not unspecified commercial terms, kit design, implementation or cutover.

**SCOPE AND AUTHORITY.** This MASTER remains the current Rental/Subscription authority; do not
create a competing Subscription MASTER. Preserve existing agreements and their signed terms.
Existing rental pricing, supplier splits, settlement, credit, billing anchors and ownership rules
are not automatically new Diglant contractual terms. The investor relationship confers no system
access, approval exemption, settlement formula or right to see unrelated supplier/customer data.
Unit IDs remain allocated by the Carres authority, never independently invented by the printer.
No supplier contact, account invite, purchase commitment or live data change is authorised here.

**OPEN CONTRACT EVIDENCE.** The 45-day quantity is confirmed; calendar versus working days,
start trigger, endpoint (ready for pickup versus delivered to a destination), included transit,
capacity/minimum batch commitments and calendar must be established before promised dates or
Order By can be computed. Existing Purchasing Safety days and production/transit calendar rules
must be reconciled, not silently replaced by browser date subtraction. KPI measurement event
(signed, approved, activated/delivered, net of cancellation) and monthly sales-to-delivery mapping
also need an explicit definition. Do not label all as current SO delivery-month quantities.

**RECOMMENDED ARCHITECTURE — PROPOSAL / NOT LAW.**
- Subscription owns plan/contract, its versioned monthly targets and forecasts, asset connection,
  recurring billing and service entitlement context. Maintain separate target, forecast total,
  confirmed subscriptions, actual delivery/activation and remaining customer commitments.
- Purchasing consumes approved supply planning needs through its one authority; it owns stock/PO
  coverage, purchase remainder, supplier promise and issuance. Sales Orders may expose the same
  read-only demand by business type without manufacturing sales revenue from fulfilment documents.
- Forecast orders and actual orders must not be summed twice. Actual matched demand consumes the
  same model/size/period forecast; excess actuals remain visible, and planning keeps version/basis
  history. KPI is not automatically a PO. Shared stock/PO allocations cannot cover both business
  lines at once. Forecast buying before a named SO is a gap to check against Manual Purchase's
  approved purposes and approvals, not permission to invent a new ungoverned buying door.
- Stock retains identity, ownership, location, custody and history. Direct supplier-to-customer
  movement records actual supplier handover/inspection and customer receipt, never fictional Carres
  warehouse arrival. Delivery retains logistics assignment, pickup, partial/failed delivery and proof.
- Routine entitled cleaning remains a Visit; complaints/exceptions remain Service Cases. Upgrade,
  exchange, return, termination, asset recovery and entitled care link contract, physical asset,
  billing consequences and original evidence. Existing subscription service rulings remain authority.
- Dashboard/Reports read shared metrics; Work reads owning-module obligations; Finance/AP and People
  retain settlement and commission ownership. No duplicate billing or investor-only write authority.

**AUDIT STATUS.** Initial authority/source pass only, not whole-portal or production verification.
Read ERP Architecture, Rental/Subscription, SO, Purchasing, Stock, Delivery, Payment, Guarantee,
Service, Workspace and Issue Tracker boundaries; inspected shared rental calculations and rental
route references. Existing code includes recurring schedule and supplier/commission splitting;
this is code evidence, not proof the new investor arrangement fits or operates in production.
Next audit must trace Catalog/plan eligibility, POS approvals, contract and document history,
forecast revisions/consumption, supplier calendars, purchase coverage, custody handover, fulfilment,
billing failures/settlement, visits/cases, upgrades/termination/recovery, Finance/AP/People,
permissions, Work/notifications, reporting/export and migration of existing agreements.
Outstanding verified gaps include missing Catalog MASTER, SO rental population exclusion,
45-day calendar/endpoint ambiguity, forecast-based stock planning admission, and no measured
end-to-end Diglant supplier-pickup flow. No completion or build-readiness claim is made.

## Recommended Subscription / Diglant portal blueprint — PROPOSAL / NOT LAW

**Two commercial businesses, shared execution.** Subscription is a separate business/contract
surface, not another supplier filter and not a second warehouse, PO engine or Delivery engine.
Business type is structurally linked from contract to fulfilment/demand; supplier alone must not
be used to infer commercial type. Catalog restricts Diglant's subscription models to eligible
plans and captures model/size/identity mode; opening data errors are reported, not Other goods.

| Surface / owner | Recommended operator journey and boundary |
|---|---|
| Subscription Plans / Settings | Maintain eligible Diglant models, contract/benefit versions, terms, fee schedule and effective dates. Preserve prior agreements. No assumed reuse of old financial percentages. |
| Monthly plan in Subscription | Management sees six monthly sales KPI columns and separately versioned forecast, approved agreements, delivered/activated quantity and cancellations. Define KPI event explicitly; dispatch month is not sales-credit month. Maintain revision reason, actor and approval history. |
| POS / agreement | Select Subscription, plan and model, customer, requested delivery, signed terms and required approval. Do not mix outright and subscription lines. Pending/rejected applications are visible pipeline, not firm procurement demand or active assets. |
| SO / Monthly demand | One read projection, selectable business type. Show approved customer commitments by requested delivery month. Existing operation/orders.ts explicitly excludes source_system=rental in a Register count read: admission/count/list/export must converge before claiming the new business is represented. Preserve zero-priced fulfilment semantics to avoid doubled receivables. |
| Purchasing planning | Match firm demand against the appropriate model/size/period forecast, then net eligible unallocated stock and dated incoming supply once. A monthly KPI alone cannot issue a PO. Forecast procurement needs governed approval, plan-version link and an existing/approved buying purpose. Demand passed its Order By is a risk, never a backdated PO. |
| Supplier / PO | Issue to Diglant using normal PO duty, permissions, document revisions, supplier promise and response evidence. Unit IDs generated by Carres on the authorised source event; send only relevant label/Unit/model information. Investor role does not bypass approvals or disclose unrelated records. |
| Supplier handover / Receiving | Verify the issued IDs, goods, quantities and condition at the actual handover. Label printed / label attached / goods ready / goods collected are different facts. Missing/wrong labels cannot invent Units. Verify how existing receipt/GRN acceptance supports supplier-site handover before adding any event. |
| Stock / Warehouse | Track actual location at Diglant, logistics custody and customer custody, without fake warehouse receipts. Ownership is a distinct contractual fact. Forecast stock, assigned stock, quarantine, returned and replacement assets retain provenance and cannot be counted twice. |
| Delivery | Assign partner, source Diglant, target customer, pickup readiness and appointment. Read valid release evidence; do not assume the outright-payment release gate suits subscription credit approval. Partial/failed collection or delivery preserves actual Unit custody, exception evidence and rescheduling history. |
| Subscription billing / Payments / Finance | Contract owns schedule; existing writer records each collection once. Separate customer recurring receipts, supplier procurement liability and any investor/commercial settlement. Audit failed payments, retries, arrears, correction, early termination/settlement and permissions; no invented investment share or automated refund. |
| Entitlements / Visits / Service | Routine included cleaning books a Visit against the correct contract-year entitlement; accepted completion consumes entitlement. Missed/poor work, defects and disputes open/link Service Cases. Customer-requested upgrade follows quote/acceptance, contract/fee change and asset exchange; complaints link rather than duplicate those writers. |
| Returns / recovery | Termination or upgrade produces controlled collection; inspect returned Unit before reuse, repair, quarantine or retirement. No automatic availability, entitlement restart or asset renumbering. Original signatures and delivery/collection evidence remain version-bound. |
| People / Reports / Work / Issue Tracker | People owns commission calculation; reporting reads KPI event, forecast version and actual results. Work derives next action from owning facts. Issue Tracker explains delay, fault/cost and learning; never replaces the operative case/claim. Investor report scope and access must be authorised separately. |

**Forecast example (illustrative, one model/size and one delivery-planning month).** Sales KPI may
be 120, while the approved supply forecast is 100. If 40 confirmed undelivered orders are matched
within that forecast, residual forecast is 60, not another 100. Planning demand is 40 + 60 = 100;
eligible stock 20 plus timely open PO supply 50 leaves planned uncovered quantity 30. KPI 120 is
not added. The example assumes no earlier competing reservations, overdue carryover or safety
stock; actual shared planning must account for them, changes and time-phased receipts. Recurring
monthly payments never create another physical mattress demand. Replacement/upgrade demand is
separately reasoned and must not masquerade as a new subscription sale or count twice in KPI.

**45-day planning.** First establish the supplier's calendar, start event and delivery/ready
endpoint. Then use the one existing backwards/forwards calendar engine. Retain customer-requested
date, required stock/ready date, Order By and supplier-confirmed date as different facts. A single
monthly bucket is insufficient for a delivery on day 1 versus day 30; exact dated requirements
underpin the month total. Review forecast changes inside the committed lead-time window against
actual cancellability/capacity, never silently rewrite an issued PO. No fixed 45-day formula is
approved before the contract boundary is clear.

**Minimum review scenarios.** Forecast followed by actual customer order without double buying;
actual exceeds forecast; cancellation after supplier commitment; partial/late supply; stock at
supplier versus in transit; duplicate/reprinted/wrong labels; pickup failure and partial delivery;
credit rejected/pending; recurring payment failure without duplicated billing; cleaning scheduled
but not completed; complaint versus routine care; upgrade, termination and recovered asset reuse;
current terms changed after signature; dealer/investor access; all views/counts/exports consistent.
These are acceptance boundaries, not implementation Cards or evidence of passing tests.

**Reference-to-Carres decisions.** Microsoft Dynamics forecast reduction supplies the principle
that actual transactions consume forecast (https://learn.microsoft.com/en-us/dynamics365/supply-chain/master-planning/reduction-keys).
ADAPT that principle, reject blindly adding KPI/forecast/orders. Odoo subscription renewal/upsell
separation (https://www.odoo.com/documentation/18.0/applications/sales/subscriptions/renewals.html)
informs distinct contract lifecycle actions; do not copy its accounting/asset assumptions. Local
Carres ownership, calendar, consent and history rules prevail. 2990's subscription/forecast
capabilities have not been inspected in this pass and are not claimed as evidence.

**Completion limits.** This is a whole-portal consequence recommendation, not a completed
production audit. Source evidence proves the rental exclusion and existing rental math, not full
Diglant readiness. Contract/calendar/KPI semantics, supplier-site handover fit, investor settlement,
new-asset ownership and real permission/finance paths remain unresolved. The prior 8/10 SO preview
score is not a score for this enlarged business. Do not hand the enlarged scope to BUILD as ready.

# §1 · Overview

### MISSION
Rent-to-own furniture: an agreement is signed, approved on credit, billed monthly, and can be
settled early.

### WHAT IS ON SCREEN TODAY
`OperationRental.tsx` **356 lines** · a POS Rent-to-Own lane · a Finance **Rental Approver** tab
· a Rental Setting tab under Admin. *Measured 2026-08-05 from file sizes and the shipped card
records; **pages not read line by line.***

**Live scale: ONE agreement (`RA-1003`), 0 Stripe subscriptions.** Almost every rule below is
therefore proved by test and by rolled-back production transactions, **not by daily use.**

---

# §2 · Frozen rules

### THE AGREEMENT
- **Rent and outright purchase may NEVER share one order.** The rule lives in ONE module that
  the rail lock, the add guard, the totals and the submit branch all ask, so they cannot drift.
  The guard sits in the single funnel all four add-doors pass through. **A both-kinds cart
  reports RENTAL — the safe answer.**
- **Qty is fixed at 1.** One rented item = one agreement + one subscription + one tracked asset.
- **The monthly fee and the CONTRACT TOTAL are shown together.** *"RM59"* without
  *"× 84 = RM4,956"* is how people mis-buy credit.
- **An agreement is BORN signed.** The POS captured a signature and threw it away, so credit was
  approved against a record that only claimed one. Approve now refuses an unsigned agreement.
- **The wording is stored as ordered blocks with immutable versions**, and the agreement records
  which version it was signed against.

### THE CREDIT GATE
- **An agreement is born `pending_approval` and NOTHING is materialised until finance approves.**
  Before this, the sell RPC wrote the full billing schedule, allocated the asset and minted the
  service entitlement in the same breath — so a REJECTED application would have held phantom
  receivables, a reserved asset and unearned visits.
- **The gate is finance + principal, deliberately NARROWER than "internal"** — that would admit
  BD, and a BD sells these.
- **Free win:** the Stripe checkout route already required `active`, so no card can be charged
  before approval with zero API changes.

### THE MONEY
- **The calendar is the signup payment plus the 7th of every month**, N payments for an N-month
  term, and **approve REFUSES a schedule that does not sum to the contract value.**
- **`rental_billings` has exactly ONE writer.** A collected month is undeletable.
- **Stripe cannot express the rule directly** — so the signup month is a one-time line item, a
  trial carries the gap, trial end BECOMES the anchor, and the schedule runs term − 1.
- **A bounced card is recorded as an EVENT, never as a second writer** of the billing row, and
  it is idempotent **on Stripe's EVENT id** — Smart Retries fire a genuinely new event per
  attempt, so three refusals are three rows while one event delivered thrice is one.
- **Late interest: ACCRUED is derived, CHARGED is stored.** Interest grows daily, so a stored
  figure is wrong tomorrow.
- **A discounted settlement is REFUSED with the real figure**, never allocated by guess — 49% of
  a customer's penalty belongs to the supplier.
- **Settlement goes THROUGH the payment RPC per month**, so the split and the one-writer law
  both hold and each month genuinely was paid.

### THE ORDER
- **A rental produces a Sales Order**, or operations never see it: the unit was allocated while
  nothing told a warehouse to deliver.
- **The line is priced ZERO on purpose.** A rental order is a FULFILMENT document; retail price
  would overstate AR and contract value would double-count the billing schedule.
- **Credit approval replaces the 50% deposit** in the proceed gate.

### SUBSCRIPTION SERVICE, CLEANING AND UPGRADES — OWNER-RULED 2026-08-14

The future mattress Subscription owns the contract, enrolled model, tracked asset, monthly money,
term, included benefits and permitted changes. Its standard cleaning benefit is **three visits
per subscription year**, performed by an appointed third-party cleaning partner.

The objects remain separate:

- `rental_agreements` / Subscription owns what the customer contracted for.
- `service_entitlements` owns the three annual visit credits and their validity.
- `service_visits` owns each due/scheduled/completed cleaning appointment, assigned partner,
  result, before/after proof and customer acknowledgement.
- Service Case owns only an exception: missed/failed/poor cleaning, damage, complaint, disputed
  eligibility, partner conduct, repeated inability to arrange or another issue needing follow-up.

A routine cleaning request opens the customer's Subscription and books the next entitled Visit;
it does not open a Case. Completion consumes one visit only on accepted completion evidence, not
when an appointment is merely scheduled.

Extra cleaning is a paid top-up service: it creates a sale/payment and an additional entitlement,
then follows the same Visit engine. A move to a higher model is a governed Subscription Upgrade,
not a Service Case remedy: quote and acceptance → price/monthly-fee change → old-asset collection
→ new-asset Delivery Order → asset and contract history. If the request arose from a complaint,
the Case links to that Upgrade but does not own its money, asset movement or amended contract.

The future Subscription has its own Claim policy and does not inherit the current outright-sale
100-Day Trial or refund path.

---

# §3 · Approved Evolution

| What | Why it is not built |
|---|---|
| **The dunning ladder (Day 3 / 7 / 21)** | **BLOCKED with a named cause: no message-sending integration exists anywhere in the API.** The rungs cannot be built until one does. |
| **Pushing the penalty onto a Stripe invoice** | Ledger half shipped. Blocked: 0 of 1 agreements has a subscription, so the invoice-item path is unverifiable. Key it to the event so a retry cannot double-bill. |
| **A discount policy for early settlement** | Undecided how it spreads across N months and two payees. **A guess would short the supplier.** |
| **The archived signed PDF** | The signature is captured; the rendered agreement PDF has no writer yet. |
| **Store-side reading of agreements** | Needs a dealer-scoped RLS read. |
| **Interest as "per month or part thereof"** | The harsher reading is a one-line change in BOTH the shared function and its SQL mirror. Now that a button exists, it is worth an explicit ruling. |
