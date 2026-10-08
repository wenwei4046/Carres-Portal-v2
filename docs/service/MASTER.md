# SERVICE — MASTER

> **The only Service document.** Overwritten when re-ruled; never versioned.
> **You read `CLAUDE.md` and this file.**

| I am working on | Read |
|---|---|
| anything | **§1 · §1.1** |
| the complete target operating model (business layer) | **§7 RECOMMENDED CARRES SERVICE BLUEPRINT** |
| filing a complaint | **§2 Intake** · §7.3 |
| the follow-ups | **§3** · §7.5 |
| the deadline | **§4** · §7.6 |
| the monthly numbers | **§5** · §7.17 |

---

**RESUME HERE — 2026-10-06, Service PLAN / final review.** Read §7.30 (the complete final recommendation, including corrected exception journeys and review boundaries) → §7.25 (approval scope) → §7.27 (complete operator workflow, Excel mapping and business acceptance) → §7.28–§7.29 (cross-module review evidence). The approved rulings below are in force; the entire Blueprint is not yet approved. Code baseline is main `678c27346`; this documentation branch contains subsequent scoped owner rulings, not proof of delivery. The old Oct-03 HTML is historical review evidence, not the current shared UI acceptance.

**APPROVED IN THIS CHAT — one current scope:** Operation shares routine service work with one per-Case owner and helpers (§7.9); every Case receives a substantive first response within two Office working days (§7.2); the scoped internal processing deadlines are §7.9; every formal repair/replacement/charge/customer-movement decision goes through Service Case Approver (§7.4), with no repeat approval for unchanged approved-scope follow-up. Original Case clock, source-module permissions and actual completion facts remain.

**NOT COMPLETE:** Service Register/Working Panel/Object/Tasks shared UI is still awaiting the UI controller's combined review, not a local variant. No-remedy/withdrawn/reopen, unapproved Excel extensions, settings changes and other explicitly marked proposals must not be silently implemented. No READY scope, Card, application code, live data change or deployment is authorised by this PLAN. Seven module reviews are recorded; they do not prove interfaces are connected. All scoped owner approvals must be available in the exact reviewed Git version before BUILD.

**STATUS IS DERIVED AND READS WHO + ACTION + OBJECT — OWNER RULING 2026-10-06 (Jess).** On
being shown the current `Pending / In Progress / Follow-up / Resolved` dropdown, the owner ruled:
*"pending, in progress, follow up all confused and never follow rules — who + object + who +
action?"* Therefore: staff never choose a Case status; the Case's current step is derived from
completed facts (the 2026-08-14 First-day law), and the step is printed as a who + action + object
sentence (`Lim Wei Ling to send the measurement video` · `NETS to pick up the sofa from Lim Wei Ling`
· `Customer to confirm the problem is solved`), never an abstract word. The four dropdown words are
retired from the screen; the exact sentences are §7.2 and go to COPY for admission. The
`service_case_statuses` table survives only as the `is_closed` fact until the derivation ships.

---

**Numbering — APPROVED TARGET / NOT BUILT, owner 2026-09-23.** New Outright cases use
`CSYYMM-NNNN`; Subscription cases use `SCSYYMM-NNNNN`. Use original creation month plus fixed
random decimal digits including leading zeros, independent pools of 10,000 and 100,000 per month.
Monitor capacity, enforce uniqueness and preserve historical SC references. Supplier Claims use
different approved prefixes CLM/SCLM; their approved format is `CLMYYMMDD-NNNN` / `SCLMYYMMDD-NNNN`. Existing SC code
and examples below are implementation/history, not target numbering. Governing complete table
and remaining limitations: Orders MASTER, External numbering privacy. No live cutover authorized.

# §1 · Overview

### MISSION
Service Case is Carres' customer complaint/service-request record, reported by the customer or
recorded by staff on the customer's behalf (owner clarification 2026-09-14). It owns customer
communication, investigation, remedy and follow-up. Record the customer problem once where it is
reported, preserve the evidence, route each owner its Work, generate the necessary execution
documents, and finish only when the customer and required outcomes are complete.

Receiving and stock supplier-goods problems go directly to the Purchasing Supplier Claim
(`docs/purchasing/MASTER.md` §7.3, §9.5). An affected Sales Order alone does not require a
Service Case.

### FIRST-DAY OPERATOR LAW — OWNER-RULED 2026-08-14

Service Case must not depend on experienced staff remembering policy or document names. A staff
member on their first working day must be able to complete the next correct action from the page.

- Never begin with a blank form or ask the operator to choose Claim/Return/Refund document type.
- Ask one factual question at a time in plain words; product, date, answer and entitlement decide
  the next question.
- Every Work item states `Do this now`, why, who/what it concerns, due date, required evidence and
  the exact completion fact.
- Show approved call/WhatsApp wording beside the action; staff do not improvise policy promises.
- Status is derived from completed facts and cannot be advanced by choosing a dropdown.
- An unavailable action explains the missing fact and provides the door to obtain it.
- Policy thresholds, terms versions, fees and required documents are system rules, not staff
  memory.

### WHAT IS ON SCREEN TODAY
`OperationServiceCases.tsx` **369 lines** · `OperationServiceNotes.tsx` **293 lines** ·
*measured 2026-08-05 from size, route and the shipped card records; **not read line by line.***
**Live: ONE case on file**, opened 2026-06-16, before the intake wizard existed.

### THE BOUNDARY THAT MATTERS
**The Service Case is the parent customer-problem record; it is not a replacement for
transactional documents.** Warehouse Work, Delivery Work and Finance Work are role-specific
workstreams under the Case. **Purchasing Supplier Claims are independent stock claims (owner
ruling 2026-09-14):** they originate from Stock Unit, PO line or Goods Receipt evidence, never
from a Service Case, and need no Case parent. A Case may link a related stock claim and read its
progress; it cannot create, approve or close it. Purchase Return, Delivery Return, replacement
Delivery Order, refund and credit/debit note remain the owning modules' formal stock, custody or
money records. Staff never create one merely because they are trying to report a problem.

## §1.1 · One intake, many in-context doors

**Owner-ruling, 2026-08-14; intake scope clarified 2026-09-14.** Staff report a customer
complaint/service request, including one recorded on the customer's behalf, from the record
already in front of them:

| Where the problem is found | Intake door | What the system carries into the Case |
|---|---|---|
| Customer / Sales Order | `Report Problem` | customer, order, affected lines and promise |
| Delivery Order / Delivery event | `Report Problem` | DO, visit/result, Logistics Partner, custody and proof |
| Invoice / Payment / Refund | `Report Problem` | customer-money record and the disputed amount/status |
| No source document can be found | `Service Cases → New Case` | manually captured party/item facts, followed by later linking |

Stock and receiving issue doors belong to their owning modules. A stock/product supplier problem
found at Stock, PO or Goods Receipt routes directly to a source-linked Purchasing Supplier Claim
without creating a Service Case.

Every door calls the same Case intake authority. It opens a new Case or links the source to an
existing Case after duplicate matching when customer remedy/communication is required. A pure
internal SOP, key-in, system, staff or process failure with no customer-resolution route becomes
an Operational Issue instead; an owning-module exception remains with its factual owner. One
incident may link both records when an internal failure also harmed a customer. The operator
reports facts and evidence; the operator
does **not** choose `Supplier Claim`, `Purchase Return`, `Delivery Return` or `Refund` as the
intake type, and Service intake never creates a Purchasing stock claim.

**Department destinations are Work views, not duplicate registers:**

- Delivery Work shows Case workstreams requiring arrangement, collection, return or proof.
- Warehouse Work shows Case workstreams requiring inspection, repair, packing, quarantine,
  handover or returned-goods receipt.
- Finance Work shows Case workstreams requiring refund or collection adjustment.

Updates made in a department view write back to the same Case timeline and evidence set. No team
rekeys the complaint, pictures, video, item or history.

`Purchasing → Supplier Claims` is Purchasing's independent stock-claim Register, not a Case work
view. When a related stock claim exists, the Case shows a read-only link to its progress.

**Showroom journey closure — OWNER-APPROVED 2026-10-02.** The approved page/request journey
is in Purchasing §9.8. Existing-goods service carries source identity/location/evidence into the
same Case; the Showroom request view reads meaningful progress, proposal/fee acceptance,
arrangements and outcome. New purchases follow normal order rules, without a duplicate Service
progress workflow. Actual return/custody facts remain with their physical owners. The proposed
5/7/3-day checkpoints and blanket Dealer 14-day promise were not approved by this page ruling.

### Dealer purchased display service — OWNER-RULED 2026-10-02

**APPROVED TARGET / NOT BUILT.** Dealer goods, including display bedframes and mattresses,
are purchased from Carres; this is not consignment. Dirt, display wear, damage or a product
problem may be reported as a service request through the same Service Case intake, from the
original order/item when available. Preserve Dealer company, authorised showroom location,
actual reporter, affected goods, description and requested help. Dealer identifies the product
in the request form and uploads photos and video when needed to explain its condition or the
requested work (owner clarification 2026-10-02). Video is not mandatory for every request.
Missing source evidence
uses the existing later-linking intake rather than blocking the report or inventing an order.

Operation assesses the evidence and entitlement, distinguishes product fault from dirt, wear
or other damage, and coordinates the confirmed remedy: cleaning, repair, parts, collection and
return, or a commercially authorised replacement. A request does not itself approve the remedy
or establish free warranty coverage. Record whether the service is free or charged, the amount
and responsible payer; obtain Dealer acceptance of a charged proposal before execution.
Execution must identify the responsible provider and respect existing Service/Delivery boundaries;
this ruling does not establish a Carres on-site inspection or technician service.

Dealer and Operation communicate, add evidence, confirm arrangements and view progress on the
same Case. Record actual responder, arrangements, collection/return facts, outcome evidence and
Dealer acknowledgement; unresolved outcomes remain open for follow-up. Department Work links
to this record and does not duplicate the request. Existing stock, custody and money documents
remain with their owning modules. A related independently sourced Purchasing Supplier Claim
may be linked read-only under §1; Dealer does not repeat its report for Purchasing.

**Display fulfilment and visible progress — OWNER-RULED 2026-10-02.** When the confirmed
display request/remedy requires newly produced goods, use the normal applicable product
production lead time as for Sales Orders; the first-response deadline is not a production or
delivery promise. Operation may arrange earlier delivery when the goods and lawful release
conditions permit, subject to the receiving location's availability and existing Delivery gates.
This does not shorten a supplier's production commitment by assumption or override commercial,
payment, stock or custody authority.

Separate service-progress follow-up applies to repair and other non-new-purchase assistance.
A new display purchase follows the applicable Sales Order rules and normal order communication,
not a second Service progress workflow (owner clarification 2026-10-02). If a remedy includes a
new purchase, its order execution remains with the order owner; the original service outcome
still requires its own evidence. Dealer does not need every internal fulfilment step. New-display timing defaults and manual
request adjustments follow Purchasing §9.8; they do not change repair response or completion
promises. Operation can publish meaningful Dealer-visible progress on the same source-linked request: stock ready,
scheduling in progress, and the confirmed sending/delivery arrangement with its date. Published
progress reads the owning Stock/Delivery facts and records the publishing actor/time; a click
must not fabricate readiness or a physical dispatch. Keep the requested date, estimated date,
confirmed dispatch/delivery dates and actual handover distinct. Actual dispatch requires its
real evidence. If an arrangement changes, show the current arrangement and preserve the prior
version/history; Dealer does not re-submit the request to see the update. Screen labels remain
subject to COPY admission. This cross-module handoff does not make Service the owner of a new
display purchase or of Stock/Delivery execution.

This ruling approves Dealer display-service coverage only, not the complete Showroom/Dealer
Blueprint, final portal labels, blanket free service or unconditional exchange/return policy.

**APPROVED TARGET / NOT BUILT — first handling deadline, owner 2026-10-02.** Operation starts handling and
provides a substantive first response within two working days of submission: assesses available
evidence, asks for the specific missing facts, or gives the proposed next action. Opening or
automatically acknowledging a request alone does not satisfy this response. It is not a promise
to complete repair, transport or exchange within two days. Calculate the deadline from actual
submission using the governed Carres working calendar, retain submission time and due date, and
route overdue first-response work to the responsible owner/cover. Later execution dates are
confirmed according to the remedy/provider and shown on the same record. This is an approved
first-response commitment, not a two-day completion guarantee.

### Customer collection and replacement arrangement

**APPROVED / NOT BUILT — Blueprint completion, Jess 2026-09-18.** Service owns
`Collect Defective Item`, `Replace First`, `Collect First` and `Exchange on Collection` for the
customer leg. Reuse the existing Case decision/entitlement gates and Service Case Approver;
these choices do not grant new eligibility, override collection safety or execute stock changes.
Delivery arranges and records customer collection/replacement legs; Warehouse records physical
receipt, inspection and custody. Separate incoming and outgoing Units and partial results persist.

Purchasing owns supplier return/repair/replacement execution under Purchasing MASTER §9.5.
If investigation identifies supplier recovery, Purchasing verifies Stock/PO/receipt provenance and
opens or matches the Claim from its source, then links the Case read-only. Keep the existing
returned-goods condition where that journey requires it. Service never creates/approves/closes
the Claim, nor waits for supplier recovery to provide already-authorised customer help.
No forced one-to-one linkage or duplicate customer arrangement writer exists on Supplier Claim.
Legacy Claim customer-execution entries remain historical facts; do not invent Cases to migrate them.

### DOCUMENT DECISION AND PRINT CONTROL

The system derives documents from an approved outcome plus execution facts. Examples:

| Confirmed execution fact | Owning document/action |
|---|---|
| Customer goods physically return to Carres | Delivery Return / customer collection record |
| Replacement goods leave Carres | replacement Delivery Order |
| Customer money is reversed or compensated | Finance refund / credit record |
| Inspection, repair, packing or transport only | Work instruction; no stock/money document |

Supplier recovery is not derived from a Case outcome. Where returned goods need supplier recovery,
Purchasing opens the stock claim from the Stock/receipt evidence; any Purchase Return, supplier
collection or replacement receipt follows that authorised stock-claim outcome, and Finance owns
any credit note. Customer remedy and supplier recovery are separate: an authorised customer
exchange is not held for a supplier reply.

Every governed Service Case decision routes to the `Service Case Approver` Duty through the one
Shared Duty Resolver. Service Settings stores the Duty key only; it never stores a manager's name
or another approver list. The decision evidence preserves the normal Primary holder, today's Buddy
cover and the actual authenticated actor separately.

The Case `Documents` panel is the operator's one checklist. For every derived document it states
`Waiting for decision`, `Ready to issue`, `Print required`, `Send electronically`, `Printed`,
`Signed/acknowledged` or `Not required`, together with who needs it and when. Staff do not have to
remember which document to print. A printable Visual Service Note remains the shared work aid;
it carries key images and a QR/link to the full evidence, while role-specific copies reveal only
the information that Warehouse, Logistics or Supplier needs.

### NO CARRES ON-SITE INSPECTION — OWNER-RULED 2026-08-14

Carres staff do not visit a customer's home to inspect a warranty complaint. There is no
`Warranty Inspection`, `Carres On-site Inspection` or generic technician-visit stage in the
Service Case lifecycle.

- Operation triages remotely from the customer's WhatsApp description, photos and video.
- When evidence indicates a supplier/manufacturing fault and an on-site visit is necessary, the
  Supplier owns and performs that visit as supplier assessment within the customer Case journey.
  It does not create a Purchasing stock claim; an independently sourced stock claim may be linked
  for context.
- When the problem concerns assembly or installation, the responsible Logistics Partner owns and
  performs the correction; Delivery coordinates it as Delivery Work.
- Warehouse inspects only when the goods physically reach a Carres warehouse. That receipt and
  inspection never backdate or substitute for a customer-site event.
- If remote evidence cannot establish the route, Operation obtains better customer evidence or
  arranges collection under an approved remedy. It does not create a warranty-inspection visit.

### PUBLIC / SOCIAL ESCALATION DOES NOT CHANGE ENTITLEMENT — OWNER-RULED 2026-08-14

A customer threatening or posting on Facebook, Instagram, TikTok, Google Reviews or another
public channel remains in the same Service Case. Staff append the screenshot/link, channel,
published time and exact allegation as evidence, then mark `Public escalation` so the Case gains
an urgent manager-owned communication Work item and one authorised spokesperson.

The escalation changes response speed, visibility and approval level. It does not turn an
ineligible complaint into a Mattress Guarantee, does not waive the `> 2 cm` threshold and does
not authorise exchange, compensation or refund. The current-business 100-Day Mattress Trial is
evaluated separately and permits one exchange, never a refund. Any goodwill exception is recorded as
an approved commercial exception, separate from `Guarantee eligible`, with approver, reason and
cost. Staff never ask a customer to remove a post as a condition of handling the Case.

### SUBSCRIPTION SERVICE BOUNDARY — OWNER-RULED 2026-08-14

Routine Subscription benefits do not become Service Cases. Three planned third-party cleaning
visits per year are Entitlement-backed Service Visits. The customer or Operation books them from
the Subscription; the appointed partner receives Work and records completion proof.

Open or link a Service Case only when the normal service fails or becomes disputed: no response,
missed appointment, rejected/poor cleaning, damage, partner conduct, exhausted entitlement
dispute or repeated rescheduling. A paid extra cleaning creates a top-up sale plus entitlement.
A higher-model request creates a Subscription Upgrade with the necessary money, collection,
delivery and asset records. A related Case may explain why, but never substitutes for those
transactions.

**Subscription lifecycle confirmation — OWNER-APPROVED TARGET / NOT BUILT, 2026-09-23.**
Rental §5.9 owns the confirmed programme flow: customer receipt with accepted proof precedes
service activation; Subscription centrally exposes contract/Unit/delivery/visit/history facts.
A booking consumes no cleaning credit; accepted completion does. Upgrade recovery and new delivery,
and subscription end versus physical recovery, stay separately evidenced. Normal visits remain
outside Service Cases; complaints/failures use the Case boundary above. No billing or new commercial
policy is approved by this confirmation, and the object layout remains a proposal.

### CONDITION-GATED CUSTOMER COLLECTION — OWNER-RULED 2026-08-14

**Local implementation note — 2026-09-07, not deployed:** Case links now open exact-Unit return or
repair source work with explicit Operation approval, linked dated Case evidence and a recorded
condition-dependent classification. Applicable checklists/photo proof gate acceptance; refusal
records no custody movement. Automated policy selection, complete surface-photo validation and
urgent shared Work are still target gaps. Implementation/readiness evidence is in the Stock MASTER;
the policy and two independent gates below remain authoritative.


A 100-Day Trial or other condition-dependent return is not sent straight to Logistics. Collection
has two independent gates:

1. **Pre-collection approval:** Operation obtains current, dated photos of all surfaces, sides,
   label and packaging/readiness. The system checks the policy's condition exclusions. No approved
   evidence means no collection booking.
2. **Doorstep acceptance before loading:** Logistics follows the same visual checklist, takes
   time-stamped photos and records each condition fact before touching/loading the item.

Logistics may record `Do not collect — condition failed` using governed reason codes (stain,
liquid/odour, bed bugs/pest evidence, saliva/unsanitary, tear/burn/cut, customer damage, wrong
item or unsafe/unwrapped transport). This is authority to refuse custody, not authority to make
the commercial eligibility decision or argue policy with the customer. The item stays with the
customer; Operation receives urgent Work, reviews the evidence and sends the formal outcome.

Once Logistics accepts and loads the item, custody transfers and the doorstep condition record is
sealed. Warehouse still records its own later receipt/condition; it never rewrites the doorstep
fact. Any potentially contaminated item accepted in error goes to quarantine, never free stock.

---

# §2 · Intake — no evidence, no case

### FROZEN RULES
- **The answer to *what is wrong* decides which photos the case cannot be filed without.**
  ONE shared checklist constant, **deliberately NOT mirrored in SQL** — it is a function of two
  answers plus per-slot counts, and a copy would drift rather than mirror.
- **A rule may name its REPORTERS.** A customer WhatsApp screenshot cannot exist when the
  WAREHOUSE found the fault, and **a required item nobody can produce teaches staff to upload a
  junk photo.** Every one of the 7 × 5 reporter/issue combinations is asserted satisfiable.
- **The gate is the SERVER'S**, recomputed from the same function the disabled button asks.
  The client is never trusted with the stamp, the file kind or the object key.
- **The database holds only what SQL can hold alone** — the stamp, and a floor strictly WEAKER
  than the API checklist.

# §3 · The follow-ups are DERIVED, not stored

### FROZEN RULES
- **The next steps are derived from question 5 of the intake**, so there is no task row to
  forget, delete, or leave pointing at an edited answer. **Only the OUTCOMES are stored** — the
  business date, stamped server-side with who recorded it.
- **Nothing here is a tick-box.** A step closes because a DATE exists.
- **The factory is resolved from the SKU at intake and snapshotted**, because zero purchase
  orders exist and `source_po` names nobody, while 200 of 205 SKUs carry a supplier.
- **Close is gated twice** — the API refuses with the open steps named, and a trigger refuses
  the TRANSITION into a closed status without a `customer_confirmed` entry. Already-closed cases
  stay editable, which is why the one live case survives.

# §4 · The deadline

### FROZEN RULES
- **14 WORKING days from the day it was reported, DERIVED and never stored.** No column can
  disagree with the rule, and a holiday-calendar correction fixes every case at once.
- **Four working days before it, the portal asks for ONE thing:** a call to the customer saying
  why it is taking longer, **with a reason picked from a locked list of seven.**
- **Every event names the deadline it was made ABOUT.** *"The customer has been told"* is only
  true about ONE deadline; without that field, moving the deadline would mark the new one as
  already explained.
- **Extend ONCE, bounded**, measured against the BASE deadline so it cannot be walked forward.
  A Sunday or holiday moves to the next working day BEFORE the bound is checked.
- **The reason list is deliberately NOT narrowed** to special-order parts — refusing every other
  true reason only gets the deadline moved under a false one.
- **The words are the laws', not the card's.** `At Risk` and `SLA` are banned, so the fact reads
  `4 working days left` / `2 working days late` and the action is the Call.

# §5 · The monthly numbers

### FROZEN RULES
- **No `closed_at` column, and it was REFUSED rather than deferred.** Closing already demands a
  `customer_confirmed` entry, and that entry carries the BUSINESS date the customer said it was
  solved. `closed_at` would record the afternoon somebody changed a dropdown; **the confirm date
  records the day the problem stopped**, which is the module's own law.
- **Every figure carries its coverage and withholds itself with a stated reason.** With one case
  on file an average would be invented and an on-time rate a coin toss.
- **Days are WORKING days**, so the average reads against the 14-working-day promise directly.
- **The delay reasons captured at §4 are READ here** — *why they ran long* needs no second
  tagging pass.

---

# §6 · Approved Evolution

| What | Why it is not built |
|---|---|
| **Read-only links from a Case to related Purchasing stock claims** | APPROVED / NOT BUILT (owner ruling 2026-09-14). A Case displays related stock-claim progress when relevant; Service intake never creates, approves or closes a stock claim. |
| **`opened_at` becoming read-only after day one** | The deadline derives from it and the edit modal lets anyone change it, so moving `Opened` moves the deadline silently. Bounded today at one case. Approved fix: read-only, or log the change as an SLA event. |
| **A sweep for abandoned intake uploads** | Evidence uploads against a client-minted draft id land before the case exists — they must. An abandoned wizard orphans them. Approved fix is a `draft/` sweep, **not** a move-on-create: a mover adds a failure mode between *bytes uploaded* and *case filed*. |

---

# §7 · RECOMMENDED CARRES SERVICE BLUEPRINT — PROPOSAL / NOT LAW (drafted 2026-10-06)

> **Status words:** `RULING` = owner's word, in force · `RESOLVED FROM AUTHORITY` = already decided
> elsewhere, cited · `PROPOSAL` = this chat's recommendation, carries its falsifier, must be
> challenged · `OWNER DECISION` = a genuine unresolved business choice; the current complete list is §7.25.
> Read it top to bottom once; correct what is wrong; silence is not approval. When the owner
> approves, the approved parts overwrite §1–§6 under the Override Law and this heading becomes
> `APPROVED / LOCKED`.

## 7.0 · Mission statement and resolution pass

**Mission.** One customer problem, recorded once where it is found, with its evidence; the system
decides the policy, names the remedy choices, routes each step to the right owner, generates the
papers, keeps the 14-working-day promise visible, and closes only when the customer says it is
solved and every outcome is proven.

**Resolution pass (Constitution step 2):**

| Classification | Fact | Source |
|---|---|---|
| RESOLVED FROM AUTHORITY | Service owns customer remedy + communication only; Purchasing owns supplier claims from Stock/PO/GRN; Delivery owns arrangement/DO/proof; Warehouse owns receipt/inspection; Finance owns money; Issue Tracker owns internal fault | §1, ERP-ARCHITECTURE §3.8–3.9, §6④, Purchasing §9.5 |
| RESOLVED FROM AUTHORITY | Intake doors: `Report a problem` on SO (built), DO, Invoice/Payment, Showroom request; `New Case` only when no source | §1.1, Orders MASTER "Guided operations and Service Case boundary", Purchasing §9.8 |
| RESOLVED FROM AUTHORITY | No Carres on-site inspection; remote triage; supplier visit when needed | §1 NO CARRES ON-SITE INSPECTION |
| RESOLVED FROM AUTHORITY | Entitlement by policy engine with versioned snapshot; mattress `> 2 cm`; 100-Day Trial one exchange, no refund; TCF/Bedframe terms; cutover 2026-08-01 | Guarantee MASTER §1 |
| RESOLVED FROM AUTHORITY | Four customer movements (`Collect Defective Item` · `Replace First` · `Collect First` · `Exchange on Collection`) are Case decisions; supplier-side `Return to supplier · Repair · Replacement` are Claim decisions | §1, Purchasing §9.5, COPY "Supplier Claim decision words" |
| RESOLVED FROM AUTHORITY | Condition-gated collection: pre-collection approval + doorstep check; refusal reasons; quarantine | §1, Delivery §1.2 (doorstep BUILT) |
| RESOLVED FROM AUTHORITY | 14 working days; day-10 call; one bounded extension; events bind to a deadline | §4 (BUILT) |
| RESOLVED FROM AUTHORITY | Dealer display service: same intake, 2-working-day substantive first response, published progress, new purchase is a Sales Order | §1 Dealer purchased display service, Purchasing §9.8 |
| RESOLVED FROM AUTHORITY | Status derived; printed as who + action + object | RULING 2026-10-06 (top of file) |
| RESOLVED FROM AUTHORITY | Numbering `CSYYMM-NNNN` / `SCSYYMM-NNNNN`; two-digit year display | Orders MASTER numbering table; COPY "System-wide document number display" |
| RESOLVED FROM AUTHORITY | Every governed decision routes to `Service Case Approver` through the Shared Duty Resolver; no module staff list | ERP-ARCHITECTURE Law F.1, Workspace §4 |
| RESOLVED FROM AUTHORITY | Shared page flow: mission rail → shared listing → Working Panel (Info + module tab) → full object page; register cell carries facts only | UI MASTER §0.2, §5.1 — **composition waits for the UI/UX master's latest kit (owner 2026-10-06)** |
| APPROVED TARGET / NOT BUILT | Read-only link Case ↔ Supplier Claim/RO; `opened_at` read-only after day one; `draft/` evidence sweep; new numbering; Dealer display coverage; collection/replacement arrangement; Documents panel; department Work views | §6, §1 |
| BUILT / VERIFIED (local preview of main `9ad7231d0`) | Guided intake (5 questions + evidence gate, server-stamped) · derived follow-up chain + two-layer close gate · derived deadline + bound events · Numbers tab with coverage · `Report a problem` from SO · `?orderId=` list filter · DO page / Arrival Source links to a Case | code read in full: `service-cases.ts`, 5 shared modules, 0210/0285/0289/0293/0298 |
| BUILT / NON-CONFORMING | Self-drawn table/tab row/modal (no DataGrid, rail, Working Panel; Escape does not close; 390px row 215px, button 16px) · dropdown status/type · banned words `Pending` `Follow-up` `Collect the item` · `Inspection` and `Refund` wants · `Call {supplier}` step inside the Case · `SC` prefix shared with Supplier Claims, 2-digit serial | §7.24 lists each with its replacement |
| RESOLVED FROM AUTHORITY / NOT BUILT | Operation shares routine Case work through Service Duty; one Case owner assigned by round robin; helpers do not change ownership | §7.9 owner ruling 2026-10-06; Workspace admission text predates this ruling |

## 7.1 · Purpose, ownership and boundaries

```
SERVICE CASE owns      the customer problem · evidence · policy result · remedy decision ·
                       customer movement order · customer communication · first-response and
                       completion deadlines · the Case timeline · Visual Service Note (work aid)
READS / LINKS          Sales Order (customer, goods, dates) · Delivery Order / arrangement / proof ·
                       Stock Unit (where, who has it, condition, inspection) · Supplier Claim / Repair
                       Order (supplier promise, outcome) · Payment (invoice, refund exception) ·
                       Guarantee entitlement (policy, cover) · Rental Visit (subscription exception)
NEVER WRITES           a DO, a stock movement, a Claim, a receipt, a refund, a credit note, a Unit
                       condition, a supplier promise, an Issue's accountability
```

Test applied to every control in this Blueprint (ERP-ARCHITECTURE ownership test): *does this screen
create, change or close the Case?* If no, it is a summary or a door.

## 7.2 · Lifecycle — derived status, printed as who + action + object

**RULING 2026-10-06 applied.** The Case stores facts (dated, stamped ledgers). The current step is
computed from the first obligation without a completion fact, in this order. The printed sentence
names the party that owes the next act. Nothing here is a dropdown.

| # | Stage (filter group) | Current step sentence (register cell · panel header) | Completion fact that moves it on | Owner of the act |
|---|---|---|---|---|
| 1 | `Reported` | `Carres to reply to {customer}` | `first_response` event (assessment · asked for facts · proposed next action) recorded, within 2 working days of `opened_at` | Service Duty (§7.9) |
| 2 | `Evidence` | `{customer} to send {evidence}` (e.g. `the measurement video`) · or `Carres to check {customer}'s photos` once received | every policy-required evidence slot filled, or the Approver records `evidence waived · reason` | customer / Service Duty |
| 3 | `Decision` | `Carres to decide the remedy` · `{Approver} to approve {remedy}` when §7.4 needs approval | `decision` event (policy result + remedy + movement + charge) recorded | Service Duty / Service Case Approver |
| 4 | `Arranging` | one sentence per open leg, first open leg shown, `+{n}` behind it: `{customer} to send pickup photos` · `Carres to approve the pickup photos` · `{Logistics} to pick up the {item} from {customer}` · `Warehouse to check the {item}` · `{Supplier} to repair the {item}` · `{Supplier} to send the replacement` · `{Logistics} to deliver the {item} to {customer}` · `{Dealer} to accept the charged proposal` · `Finance to pay back RM {amount}` · `Carres to tell {customer} the outcome` | the owning module's own completion fact (Delivery result · Receiving posted · Claim/RO outcome · Payment record · acceptance event · outcome message recorded) | the owning module's rule |
| 5 | `Customer confirm` | `{customer} to confirm the problem is solved` | `customer_confirmed` entry (BUILT gate) | Service Duty |
| 6 | `Closed` | `Closed · Solved {date}` · `Closed · No remedy {date}` · `Closed · Withdrawn {date}` | `is_closed` set only by the close gate | system |

Rules kept from §3 (BUILT): steps are derived, never stored; only outcomes are stored; close is gated
in the API and in the trigger. Rules changed (§7.24): the chain no longer contains `Inspect the item
at {customer}` or `Call {supplier} …`; supplier legs are **read** from the linked Claim/RO.

**Overlay facts, not stages:** `Day-10 call owed` · `Deadline moved once` · `Public escalation` ·
`{n} working days late` · `First reply late`. They print as a second line or a pill and open their own
Work item; they never replace the step sentence.

**RULING / APPROVED — owner confirmation in Service PLAN chat, 2026-10-06.** Every Service Case, regardless of source (customer, Dealer or staff reporting on their behalf), receives a substantive first response within two Office working days from the recorded Case report/open date. It includes an initial assessment, a specific request for required evidence or a concrete next arrangement; acknowledgment alone is not completion. The assigned Operation Case owner / authorised cover is responsible. The first-response completion record retains actor, channel, business date/time and available evidence. This is not a two-day repair, collection or delivery guarantee. The existing §4 fourteen-working-day completion clock is unchanged. Shared calendar defines working days; no page-local calendar, midnight assumption or undocumented time-of-day deadline is introduced. Approval is business truth, not implementation / production proof. Falsifier for future review: measured staff coverage cannot sustain the promise.

## 7.3 · Intake — the doors and the guided questions

**Doors (RESOLVED):** SO page `⋮ → Report a problem` (BUILT) · Delivery Order page `⋮ → Report a
problem` (NOT BUILT: pre-links DO, visit result, Logistics, custody, proof) · Payment Records row
`⋮ → Report a problem` (NOT BUILT: pre-links invoice, disputed amount) · Showroom request (Purchasing
§9.8, Dealer or Carres showroom; pre-links company, location, reporter, goods) · Subscription Visit
failure (Rental §5.9; pre-links agreement, Unit, visit) · `Service Cases → New Case` only when no
source document exists. A Stock Unit never opens a Case (Issue Tracker / Supplier Claim own it).

**The guided questions (KEEP the BUILT wizard, revise its answers):**

| Step | Question on screen | Answers | Change versus today |
|---|---|---|---|
| 1 | `Who told us?` | `Customer` · `Dealer` · `Logistics` · `Warehouse` · `Staff` | `Supplier` removed (a supplier does not report a customer problem); `Dealer` added for showroom requests; label reworded from `Who found it?` |
| 2 | `Which item?` | the source document's lines (pre-filled by the door); manual category only on the no-source path | unchanged |
| 3 | `What is wrong?` | per category, unchanged keys (`wrong_sku` … `other`) plus `sagging` (mattress/sofa, drives the measurement evidence) · `dirty` (display) · `comfort` (mattress, routes to the Trial) | three keys added so the policy engine can branch |
| 4 | `Can the customer still use it?` | unchanged → priority | unchanged |
| 5 | `What does the customer ask for?` | `Repair` · `Replace` · `Missing parts` · `Exchange for another model` · `Clean it` · `Something else` | `Inspection` and `Refund` removed (§7.24); this is the customer's ask, never the decision |
| 6 | `Take the photos` | evidence checklist by issue type (BUILT), plus `measurement_video` for `sagging`, plus `all_surfaces` set for any condition-gated remedy later | checklist extended, same engine |

Duplicate matching before create: same customer/order/item with an open Case → offer `Add to
{Case No}` instead of a second Case (RESOLVED, §1.1). Numbering at create: `CSYYMM-NNNN` through the
shared document-number helper; old `SC…` numbers stay searchable.

## 7.4 · Decision engine — policy, entitlement, remedy, approval, movement, charge

**Policy selection (RESOLVED, Guarantee MASTER):** from the item's category + Sales Order date +
actual delivery date + paid Guarantee line → policy version. Snapshot on the Case: policy name and
version, dates used, entitlement source (paid line / legacy rule / none), covered Unit, result, reason,
actor, time.

**Entitlement result (system):** `Eligible` · `Not eligible` · `Evidence required` with the policy's
own reason sentence (e.g. `Body indentation must be more than 2 cm with nothing on the mattress`).

**Remedy choices offered by the engine (the operator picks only from what the policy allows):**

| Policy result | Remedy choices | Movement choices (Case-owned, RESOLVED words) | Charge |
|---|---|---|---|
| Mattress Guarantee eligible | `Replace` (one-for-one, retires the Guarantee ID) | `Replace First` · `Collect First` · `Exchange on Collection` | none |
| 100-Day Trial eligible | `Exchange for another model` (once; same or higher model; lower gives no price difference) | `Exchange on Collection` · `Collect First` | transport from RM 250 (Settings) + price difference via Sales Order |
| TCF Sofa / Bedframe eligible | `Repair` · `Replace` (TCF chooses; Carres chooses for bedframe) · `Missing parts` | `Collect Defective Item` · `Replace First` · `Collect First` · `Exchange on Collection` | transport from RM 250 where the terms say so |
| Dealer display (purchased) | `Clean` · `Repair` · `Missing parts` · `Replace` (commercially authorised) | `Collect Defective Item` · `Replace First` · `Exchange on Collection` | `Free` or `Charged RM {amount} · payer {Dealer}` — Dealer accepts before execution |
| Not eligible | `Paid service` (quote) · `No remedy` | as above when paid | charged |
| Any | `Goodwill exception` | any | recorded cost, Approver, reason |

**RULING / APPROVED — formal Case decision approval scope, owner confirmation 2026-10-06.** The assigned Operation Case owner replies, collects/reviews evidence, assesses the applicable policy and prepares the remedy proposal without an extra approval for each routine activity. Every formal repair/replacement/charge/customer-movement decision is approved by `Service Case Approver` before execution, preserving ERP-ARCHITECTURE's Service Case decision gate. The submitted proposal identifies exact goods/Units, policy/version and result, remedy/movement, charge/payer where applicable, reason and evidence. Approval/refusal records the actual actor, business result and source decision identity. Routine follow-up inside that approved decision does not repeat approval; a change to remedy, charge or scope requires a new governed decision approval with prior facts retained. Service approval does not issue/complete a DO, move stock, approve/settle a customer refund or bypass Payment/Purchasing/Delivery/Stock's own permissions and gates. Absolute policy/condition prohibitions cannot be overridden by approval. The explicitly approved next-Office-working-day internal processing rule applies to a ready approval request (§7.9). Approval of this rule does not claim implementation or approve new close paths/UI. The former proposal to exempt ordinary policy-authorised remedies from decision approval is superseded and removed.

**Refund:** never a remedy button. An exceptional refund is a goodwill decision by the Approver;
the Case links Payment's refund record read-only (Payment §13).

**Supplier recovery:** not decided here. When investigation shows a supplier fault, Purchasing opens
or matches the Claim from the Unit/PO/GRN and the Case links it read-only (§1). The Case never waits
for the supplier reply to give the customer an authorised remedy.

## 7.5 · Arrangements — the department workstreams (one fact table per leg)

Every arrangement leg is a row in the Case with: `leg kind` · `exact Unit(s)` · `owning module` ·
`required document` · `completion fact`. Service writes the **order** (which legs, in which sequence);
the owning module writes the **execution**.

| Display name (Case) | Source module | Read source | Write door | Completion fact | Evidence | Work state | Failure state |
|---|---|---|---|---|---|---|---|
| `Pickup photos` | Service | `service_cases.evidence` slots `all_surfaces·label·packaging` | Case evidence endpoint (customer sends; staff upload) | all condition slots present and Approver/Duty records `pickup approved` | time-stamped photos | To do → Waiting (customer) → Completed | `Photos could not be loaded` + Try again |
| `Pick up the {item} from {customer}` | Delivery | `ops_delivery_arrangements` + customer-return DO | Delivery's own collection arrangement (Arrival Source `Customer Return`, BUILT door) | Delivery result `Collected` with doorstep check passed | doorstep photos + reason codes | To do (assign) → Waiting (date) → Completed; `Do not collect — condition failed` reopens §7.4 outcome | `Delivery could not be read` |
| `Warehouse to check the {item}` | Stock / Receiving | Inbound `Customer Return` receipt + inspection | Receiving post (Warehouse) | receipt posted, inspection result recorded, Unit → `Needs checking` resolved | GRN + inspection photos | Waiting → Completed | `Receipt could not be read` |
| `{Supplier} to repair / send replacement` | Purchasing | Supplier Claim / Repair Order facts | Purchasing (read-only here) | Claim Authorised Outcome executed (RO returned + inspected · replacement received) | Claim/RO evidence | Waiting (read) | `Claim could not be read` |
| `Deliver the {item} to {customer}` | Delivery | replacement DO (system-issued when gate met) | Delivery arrangement + result | `Delivered` with proof accepted | delivery photo + signed DO | To do → Waiting → Completed | `Delivery could not be read` |
| `{Dealer} to accept the charged proposal` | Service | `proposal` event (amount, payer, terms) | Showroom request view (Purchasing §9.8) / Case | `proposal_accepted` event with actor | acceptance record | Waiting (dealer) → Completed | `Could not be loaded` |
| `Finance to pay back RM {amount}` | Payment | Payment refund record | Payment (exceptional route) | refund recorded | Payment record | Waiting → Completed | `Payment could not be read` |
| `Carres to tell {customer} the outcome` | Service | `outcome_sent` event (channel, wording, reply) | Case Communication | event recorded with evidence of the message | screenshot / call note | To do → Completed | — |

Units: incoming and outgoing Units are separate rows (RESOLVED). A partial result leaves the
remaining Unit's leg open. Case closure never moves a Unit (Stock §12.8).

## 7.6 · Deadlines

| Clock | Rule | Owner of the call | BUILT? |
|---|---|---|---|
| First response | 2 Office working days from `opened_at` (APPROVED for all Cases, owner 2026-10-06) | Service Duty | NOT BUILT |
| Completion promise | 14 working days from `opened_at` (Mon–Sat, MY holidays) | derived (BUILT) | BUILT |
| Day-10 call | `Call {customer} to say why it is taking longer`, reason from the locked list | Service Duty | engine BUILT; Work NOT admitted |
| Extension | once, ≤ one more period, measured from the base deadline | Service Duty records; no approver | BUILT |
| `opened_at` | read-only after the day it was filed; a correction is an `sla_events` entry | — | NOT BUILT (§6) |

## 7.7 · Communication

- **Approved wording beside every act** (First-day law): each step sentence has a prepared call
  script / WhatsApp message in code constants (the words go to COPY). Staff press `Copy message` or
  `Open WhatsApp`; neither completes anything (COPY external-reply law). The act completes when the
  reply is recorded: channel · who · time · screenshot or note.
- **Published progress (RESOLVED, Dealer):** `Publish progress` records an event the Showroom
  request view reads: `Stock ready` (reads Stock eligibility) · `Scheduling in progress` ·
  `Delivery arranged {date}` (reads the Delivery arrangement). A click can never fabricate
  readiness or dispatch: the button is unavailable until the owning fact exists and says why.
- **Public escalation (RESOLVED):** `Mark public escalation` stores channel · link/screenshot ·
  published time · allegation; raises an urgent Approver-owned Work item `Answer the public post
  about {Case No}` with one spokesperson; entitlement unchanged.

## 7.8 · Documents panel (RESOLVED composition, PROPOSAL wording)

One checklist per Case, derived from the decision and legs; each row prints `document · state ·
who needs it · when`:

| Document | Owner | States |
|---|---|---|
| Customer collection record / Delivery Return | Delivery | `Waiting for decision` → `Ready to issue` → `Printed` → `Signed` |
| Replacement Delivery Order | Delivery (system-issued) | `Waiting for decision` → `Ready to issue` → `Issued` → `Signed` |
| Visual Service Note (work aid: key photos + QR to the Case; role-specific copies) | Service | `Not required` · `Print required` · `Printed` |
| Charged service proposal / invoice | Service proposal; Payment invoice | `Waiting for acceptance` → `Accepted` → `Invoice issued` |
| Refund / credit record | Payment / Finance | `Not required` · `Waiting for approval` · `Recorded` |
| Supplier Claim / Repair Order | Purchasing | read-only link + its own state words |

The legacy `service_notes` table and `ServiceNotePrintPage` are retired from the UI once the Visual
Service Note prints from the Case; data stays.

## 7.9 · Work Engine actions — resolved shared Operation ownership and pending admission

**RULING / APPROVED — internal processing deadlines, owner confirmation 2026-10-06.** Once required evidence is complete, evidence review / remedy decision is handled by the next Office working day; when an exception request is ready, the governed Approver handles it by the next Office working day; when all required execution facts are ready, the assigned Case owner follows up for final customer confirmation by the next Office working day. “Handled” means a recorded check, reasoned decision or actual contact result as applicable; it does not mean the customer must respond or the supplier must finish by then. A failed-collection result or recorded public complaint is handled on the same Office working day; after-office receipt moves the internal response deadline to the next Office working day. Existing shared Office calendar/hours govern the boundary; no undocumented page-local cutoff is introduced. The assigned Case owner / authorised cover owns routine acts; exception approval/public response uses its governed Approver. These due dates start from the exact applicable source fact, are not reset by refresh, helping or reassignment, and do not replace any original Delivery/Payment/Purchasing obligation. Opening a page, drafting/sending a message or waiting does not itself complete the required outcome or pause the §4 Case clock. Intake missing-evidence chasing and other unlisted steps do not acquire a new approved due merely because they appear in the action catalogue.


**RULING 2026-10-06 (Jess) — routine Service Case work stays inside Operation and is SHARED.**
*"operation wont pass back to sales person. service duty ppl need to share."* Therefore a governed
`Service Duty` exists in Settings → Staff & Duties; the Sales Order PIC is never the Case owner and
is not asked to do service work. The sharing mechanism below is the planner's decision under the
Constitution's engineering/design rule, recorded here so no chat asks it again:

- **One Case, one owner, assigned by round robin.** A new Case goes to the next eligible active
  Operation person in Staff & Duties order; the Case stays with that person until it closes, so the
  customer hears one voice. No name is written here (GLOBAL DUTY LAW): who is eligible today is
  People's fact, and a departed person leaves the cycle on their last working day.
- **Leave moves it automatically** through the shared resolver's leave/cover rule; the owner takes
  the Case back on return only through a recorded reassignment, never silently.
- **Anyone may help** (Workspace §3 STAFF HELP): `Assigned to` is the owner, `Completed by` is whoever
  recorded the fact. Helping never changes the owner.
- **Reassignment is one governed act** on the Case (who, when, why), never a second staff list.
- **Approver decisions do not rotate:** goodwill, waived charge, refund, declined eligible claim,
  public escalation go to `Service Case Approver`.
- **Team Work** shows per person: open Cases · late Cases · replies due today.

Falsifier: the owner says one person a month must hold every Case (the PO/GRN monthly pattern); then
the Duty switches from per-Case round robin to monthly allocation and nothing else changes.

**CURRENT ADMISSION LIMIT — measured at main `678c27346`, 2026-10-06.** The owner rule above is resolved; do not re-interview the owner or revive a monthly single-holder proposal. Workspace §6.1/§11.5 still records the earlier admission hold, and the Work reader does not demonstrate routine Service actions. The remaining boundary is implementation plus any per-step clock not explicitly approved in §7.9, not absence of the routine owner decision. The existing 14-working-day deadline/day-10 event is a reusable Case source, not evidence that Service is already in Tasks. No Service routine Tasks production verification is claimed.

**Action catalogue for later Workspace admission — owner rule and explicitly scoped deadlines in §7.9 are APPROVED; unlisted clocks and new actions remain PROPOSAL / NOT LAW; formal decision approval scope is approved in §7.4.**

| Action identity | Fact (line 1) · act (line 2) | Owner rule | Due | Closes when |
|---|---|---|---|---|
| `service.first_response` | `{Case No} has no reply yet` · `Reply to {customer} · Record what you told them` | Service Duty | 2 Office working days from `opened_at` | `first_response` event |
| `service.obtain_evidence` | `{evidence} is missing` · `Ask {customer} for {evidence} · Record their reply` | Service Duty | next Office working day is still PROPOSAL for missing-evidence chasing | required slots filled; a contact result does not complete missing evidence |
| `service.decide_remedy` | `Evidence is complete` · `Prepare the remedy decision for {Case No}` | Case owner prepares; Service Case Approver approves every formal decision (§7.4) | next Office working day, scoped trigger §7.9 APPROVED | recorded proposal then authorised decision; preparing is not approval or execution |
| `service.approve_exception` | `{remedy} needs approval` · `Approve or refuse {remedy} for {Case No}` | Service Case Approver | next Office working day | approval event |
| `service.pickup_photos` | `Pickup photos not approved` · `Check {customer}'s photos · Approve or refuse the pickup` | Service Duty | next Office working day | `pickup approved` / refused |
| `service.deadline_call` | `{n} working days left` · `Call {customer} to say why it is taking longer` | Service Duty | day 10 | `customer_told` bound to the deadline (BUILT engine) |
| `service.condition_refused` | `{Logistics} did not collect: {reason}` · `Tell {customer} the outcome · Record the reply` | Service Duty | same day (urgent) | `outcome_sent` event |
| `service.public_escalation` | `Public post on {channel}` · `Answer the post about {Case No} · One spokesperson` | Service Case Approver | same day (urgent) | reply recorded |
| `service.customer_confirm` | `Every leg is done` · `Call {customer} to confirm the problem is solved` | Service Duty | next Office working day | `customer_confirmed` (BUILT gate) |

Delivery, Warehouse, Payment and Purchasing legs raise their own existing actions (Workspace §6.1);
the Case shows them read-only. No second task store.

## 7.10 · Daily operator journey (assigned Operation Case owner; PROPOSAL)

```
08:30  Shared Tasks → assigned Service items: replies due today · evidence to check · decisions · day-10 calls
       each item opens the Case in the Working Panel on the Service Case tab
09:00  Service Cases page → mission rail: Reply due 2 · Evidence to check 1 · Decision needed 1 ·
       Pickup photos 1 · Customer confirm owed 3  (counts from Case facts)
       pick the row → panel → read policy result → press the one primary act → record the reply
11:00  a Dealer request arrives from the Showroom view → Reported → reply within 2 working days
14:00  Delivery records `Collected` → the Case's leg closes by itself → next leg sentence appears
16:30  Customer confirms by WhatsApp → `Record customer confirmed` → Case closes · Numbers update
Closing: nothing to remember; what is still open is the rail and My Work tomorrow morning.
```

## 7.11–7.14 · Navigation, Register, Working Panel, Object page — WAITING FOR THE UI/UX MASTER'S LATEST KIT (owner 2026-10-06)

Not drawn here. Service adopts the shared Register, Working Panel (Info + `Service Case` tab, opens on
it) and Object page exactly as the UI/UX update master publishes them. What Service will supply to
that template (facts only, for its combined table): default columns `Opened · Case No · Customer ·
Item · Problem · Policy result · Current step · Deadline · Stage`; mission rail entries `Reply due ·
Evidence to check · Decision needed · Pickup photos · Customer confirm owed`; factual filters `Stage ·
Item category · Policy · Supplier · Opened month`; panel tabs `Info · Service Case · Documents ·
Communication · Timeline`; row menu `View · Print`; `New Case` only for the no-source path; kit gaps
named (entitlement result block · document checklist row with a state word · shared evidence checklist
· working-day countdown in the card header). The Numbers tab leaves the module page (§7.17).

## 7.15 · `Report a problem` per module (placement, all RESOLVED; build state)

| Surface | Door | Pre-links | State |
|---|---|---|---|
| Sales Order page `⋮` | `Report a problem` | SO, customer, lines | BUILT |
| Delivery Order page `⋮` | `Report a problem` | DO, result, Logistics, proof | NOT BUILT |
| Payment Records row `⋮` | `Report a problem` | invoice, amount | NOT BUILT |
| Showroom request (Carres / Dealer) | request form | company, location, reporter, goods, photos | NOT BUILT (Purchasing §9.8) |
| Subscription visit | `Report a problem` on a failed/disputed Visit | agreement, Unit, visit | NOT BUILT (Rental) |
| Stock Unit `⋮` | `Report a problem` → Issue / Claim, **never a Case** | — | BUILT (Stock) |

## 7.16 · Settings (central Settings → Service)

| Row | Value today | Where it is set | State |
|---|---|---|---|
| `Service Duty` eligible Operation staff / per-Case assignment | runtime eligibility and assignment not verified | Staff & Duties, shared resolver; one Case owner, helpers retain ownership | owner rule APPROVED §7.9; implementation/admission NOT VERIFIED |
| `Service Case Approver` | Duty key exists in the catalogue | Staff & Duties | APPROVED, assignment NOT VERIFIED |
| Paid-policy cutover | 2026-08-01 (code constant) | Service Settings | NOT BUILT |
| Mattress threshold | `> 2 cm` (code) | read-only display | NOT BUILT |
| Trial length / transport minimum | 100 days / RM 250 (code) | Service Settings | NOT BUILT |
| First response · finish · day-10 call | 2 Office working days · 14 working days · day 10 (owner-approved rules, code constants) | **read-only display only** in central Settings; no edit control. Planner recommendation (§7.30.7), not an owner ruling on Settings: the owner approved the timing values, not arbitrary editing. A future edit control needs explicit existing-Case applicability; calendar corrections continue to follow §4. No editable capability is approved by this row. | engine BUILT for 14 · day 10; first response NOT BUILT |
| Delay reasons · condition refusal reasons | code constants (shared with Delivery) | read-only display | BUILT |

## 7.17 · Reports and export

The BUILT Numbers engine (by month · by issue · by factory · average working days · on time · why
late) moves to `Reports → Service`; `?tab=numbers` forwards there. The register exports the current
view (Excel / list PDF) through the shared engine. No KPI strip on the register (UI MASTER §4).

## 7.18 · Responsive, states and copy — WAITING FOR THE KIT

Responsive behaviour and the §2.2 state matrix follow the shared template as published. Service adds
only its missing-data words (§7.20).

## 7.20 · Service words — PROPOSAL for COPY-STANDARD admission

| Meaning | Use exactly | Do NOT use |
|---|---|---|
| Current step sentences | `Carres to reply to {customer}` · `{customer} to send {evidence}` · `Carres to check {customer}'s photos` · `Carres to decide the remedy` · `{Approver} to approve {remedy}` · `{customer} to send pickup photos` · `Carres to approve the pickup photos` · `{Logistics} to pick up the {item} from {customer}` · `Warehouse to check the {item}` · `{Supplier} to repair the {item}` · `{Supplier} to send the replacement` · `{Logistics} to deliver the {item} to {customer}` · `{Dealer} to accept the charged proposal` · `Finance to pay back RM {amount}` · `Carres to tell {customer} the outcome` · `{customer} to confirm the problem is solved` · `Closed · Solved` · `Closed · No remedy` · `Closed · Withdrawn` | `Pending` · `In Progress` · `Follow-up` · `Resolved` · `Collect the item` · `Done` as a cell value |
| Stage (filter group) | `Reported` · `Evidence` · `Decision` · `Arranging` · `Customer confirm` · `Closed` | Status · Open · Active |
| Policy result | `Eligible` · `Not eligible` · `Evidence required` + the policy reason sentence | Approved · Rejected · Warranty OK |
| Remedy | `Repair` · `Replace` · `Exchange for another model` · `Missing parts` · `Clean` · `Paid service` · `No remedy` · `Goodwill exception` | Refund (as a remedy) · Inspection · Compensation |
| Movement | `Collect Defective Item` · `Replace First` · `Collect First` · `Exchange on Collection` (RESOLVED) | Return · Swap |
| Charge | `Free` · `Charged RM {amount} · payer {party}` · `Transport RM {amount}` | Fee TBD · — |
| Overlay facts | `{n} working days left` · `{n} working days late` · `Day-10 call owed` · `Deadline moved once` · `Public escalation` · `First reply late` | At risk · SLA · Overdue (as a word) |
| Published progress (Dealer) | `Stock ready` · `Scheduling in progress` · `Delivery arranged {date}` | In production · Processing |
| Absence words | `No sales order linked` · `Policy cannot be decided: delivery date not recorded` · `No supplier on the case` · `No photos on this case` · `Service Cases could not be read` | — · N/A · Unknown |
| Intake questions | `Who told us?` · `Which item?` · `What is wrong?` · `Can the customer still use it?` · `What does the customer ask for?` · `Take the photos` | Who found it? · Case Type |
| Doors | `Report a problem` (RESOLVED) · `New Case` · `Add to {Case No}` · `Publish progress` · `Mark public escalation` · `Record customer confirmed` | Raise case · Log complaint · Close case (as a button) |

## 7.21 · Reference-to-Carres完整能力矩阵 — PROPOSAL / NOT LAW

本节持久化此前研究记录中的对象级证据，替换原泛用产品类比表；不是本次重新运行测试。引用固定Houzs `main` commit `07cd742c001107a2bc3df7ce2b6d533f2f7ac8e1`，非当前2990运行证明。以下C编号是当时研究来源目录，批准法律以本MASTER及当前owning MASTER为准；旧研究中routine owner未决定等判断已由§7.9覆盖，不再询问。

| 来源键 | 路径与研究范围 |
|---|---|
| H1 | `docs/modules/service-case.md`：documented intent，阶段、权限、重复检查、supplier rounds、表单与DO/PO关系 |
| H2 | `backend/src/services/assr.ts`：number228、create345、transition823–940、PATCH_FIELDS976、list1782、export2098；代码检查 |
| H3 | `backend/src/routes/assr.ts`：summary638、list868、bulk1123–1158、export1208、SO search1288、history1627、create1672、duplicate1726、patch1866、token1976、PO2690、approve2749、transition2804–2868、timeline2893–2951、items3036、logistics3262 |
| H4 | `backend/src/services/assrSupplierReturns.ts` 1–180；`assrReopen.ts`、`assrVisibility.ts`、`assrStages.ts`、`assrSla.ts`、`assrPortal.ts`；PG supplier returns migration `20260921T2300_assr_supplier_returns.sql`31–54；supplier reference migration `20260924T2300_assr_supplier_return_ref_no.sql`28–31 |
| H5 | `frontend/src/pages/ServiceCases.tsx`、`ServiceSettings.tsx`；`backend/src/routes/assr_print.ts`1–140；共享DataTable/DetailLayout/Panel调用 |
| H6 | `backend/tests/assrReopen.test.ts`、`assrSupplierReturns.test.ts`、`assrCompanyScope.test.ts`、`assrVisibilityRule.test.ts`；测试范围见下文 |
| H7 | `backend/src/services/caseTracking.ts`1–140；`backend/src/routes/portal.ts`172–258；客户验证/可撤销bearer、评论、附件、rate limit代码；全部访问隔离和端到端提交未验证 |
| C1 / C9 | 本Service MASTER§§1–6、§7批准范围；原检查`apps/api/src/routes/ops/service-cases.ts`create410、evidence449、number466、patch537、close570、evidence688、progress764、sla865；`packages/shared/src/service-case-plan.ts`；`apps/web/src/pages/operation/OperationServiceCases.tsx`；migrations0210/0285/0289/0293/0298。原代码行是研究基线，非当前行号保证 |
| C2 / C3 / C4 | `docs/guarantee/MASTER.md`政策/claim lifecycle；`docs/purchasing/MASTER.md`§§9.5–9.7；`docs/stock/MASTER.md`Unit/Receiving/holder/history及当前Customer Return law；不以旧§12.8覆盖新§5 |
| C5 / C6 | `docs/delivery/MASTER.md`DO/Proof/分程；`docs/payment/MASTER.md`唯一客户钱/特殊退款；`docs/orders/MASTER.md`商品、商业修订、历史文件；`docs/rental/MASTER.md`§5.9；`docs/issue-tracker/MASTER.md`客户Case/内部Issue边界 |
| C7 / C8 | 当前Workspace权威，历史研究用其MASTER projection/Work段；`docs/ui/MASTER.md`Shell/Register/Object Detail、共享组件；`docs/COPY-STANDARD.md`；`docs/03-page-patterns.md`；`docs/01-design-tokens.md`及portal导航。当前共享UI组合审阅优先于旧layout类比 |

**测试证据（此前实际执行记录）：**Carres五套shared纯函数134项通过：intake22、evidence22、plan23、sla42、numbers25；只证明当时纯函数，不证明当前生产闭环。Houzs使用Vitest2.1.9探索运行四套51项通过：Reopen7、SupplierReturns12、CompanyScope8、VisibilityRule24；部分为源码断言。声明的Vitest4环境未完整重建；`assrSlaHoursOverride`及`assrSupplierReturnRefNo`缺`cloudflare:test`，加载失败、0项执行，不称全绿。本次没有重跑。全部移动、权限、并发、附件及跨模块生产结果未因此获验证。

**复用权及口径：**当时未找到足以确认源码复用许可的LICENSE/COPYING/NOTICE。COPY REQUIRED须另有适合Carres语义、模型、权限、UI、依赖及授权的完整证据；当前无此判定。READY只限注明的窄能力；未证明连接为UNVERIFIED。ENGINE GAP只表示本次所检证据没找到适合解法，不表示全球无人解决。下表处置是推荐，完整目标不因其中窄能力READY而自动ready。

| 能力 | Houzs证据 | Carres authority / current | 处置 | 员工收益 / 依赖与冲突 | 实现复用 |
|---|---|---|---|---|---|
| SO/DO/钱款来源开Case | H3 search/relatedSO | C1已有目标，入口不完整 | BUILD | 不重填订单/客户；各源owner保留 | UNVERIFIED：完整Carres接线未证明 |
| 手工无来源Case | H1/H3可无items | C1允许稍后链接，旧intake存在 | KEEP+IMPROVE | 不伪造订单；证据要求按报告人可满足 | READY：现有manual intake；完整target未ready |
| 所有intake同一校验 | H1可自由创建 | C1/C9共享函数+server gate | KEEP | 缺资料明确说明；不能照抄Houzs弱gate | READY：已有校验函数134测试范围 |
| 原始客户证据与structured summary | H3 attachments/timeline | C1/C9部分保存，正式声明未知 | IMPROVE | 一份原文件给各owner；避免员工代签 | READY：已有附件基础；完整声明UNVERIFIED |
| 新编号/legacyreference | H2计数ASSR | C1 CS/SCS随机decimal规则 | BUILD | 找得到旧SC，subscription不混类 | ENGINE GAP：Houzs语义不同 |
| 重复客户问题匹配 | H3 sameitem/docopen409 | C1打开/链接同一Case | ADAPT | 提示sameorder/Unit/problem；允许同Unit不同新问题 | UNVERIFIED：Houzs仅部分模型，权限/rights未齐 |
| Registersearch/filter/sort/columns | H3/H5/runtime | C8sharedDataGrid；旧rawtable | ADAPT | 直接找客户/Case/订单/截止事实；全scope统一 | READY：Carreskit基础；Serviceadoption未ready |
| 批量 | H3archive/reassign | C8权限与sourceversion | ADAPT | 可同批export/assignment；不可批量批准/收货/close | UNVERIFIED：Service动作合同不足 |
| Board/Calendar | H5runtime | C7Calendar仅有日期动作 | RELOCATE/REJECT部分 | 用sharedCalendar的真实visit，免第二调度板 | READY：sharedCalendar基础；Service未准入 |
| 对象详情/产品summary | H5DetailLayout | C8objecttemplate/miniGoods | ADAPT | 一页看问题、资格、决定、结果、文件 | READY：sharedkit基础，Servicecomposition未build |
| 日常负责人/审批 | H1namedaccess/subtree | §7.4 Approver + §7.9已批准Operation owner | BUILD | 已批准per-Case负责人和helpers，实际执行人留证 | UNVERIFIED：裁定已批准，完整接入未证明 |
| Permission / access | H3/H4companyscope | C9Operation/Principal较粗 | ADAPT | Sales只能适当来源/沟通，Logistics只见所需 | UNVERIFIED：全endpoint未runtime验证 |
| 政策/entitlement判断 | H1resolutionlookup | C2/C6ownersalreadydefined | KEEP+IMPROVE | 显示政策版本/依据；不复制Guarantee逻辑 | UNVERIFIED：全Case解释路径未demonstrated |
| 处理安排四选项 | H1stagepickupsubsteps | C1Sept18四安排已批准 | BUILD | 分清旧货收回、新货送出；部分结果不丢 | ENGINE GAP：不能用一个stage承载 |
| Approve outcome | H3approve | C1sharedServiceApprover | ADAPT | 决定与记录分离；actualactor/cover留证 | READY：SharedDutyResolver基础；casecomplete未ready |
| Supplierassessment | H1verification | C1suppliervisit/noCarresonsite | ADAPT | 报告supplierassessment，不派Carresinspect | UNVERIFIED：上门完整隔离未查证 |
| Customercollectioncondition | H1pickupdates | C1twogates+C4/C5 | KEEP+BUILD | 不污染stock；doorstep、receipt分别留证 | ENGINE GAP：Houzs未示同等gate |
| 每一次supplier往返 | H4独立roundrows | C3RO+C4custody | ADAPT/RELOCATE | 用每份RO/return/GRN追原Unit；Case只读汇总 | READY：CarresROmodel窄能力；闭环待验证 |
| CasePO / 修复采购 | H3generate-po | C3ownPO/manualrequestServiceCasepurpose | RELOCATE | 缺货发到现有Purchasing，不另造CasePO | READY：现有采购对象；接线未ready |
| 客户料金/差价/退款 | H3customer_amount | C5canonicalmoney,C6SO | RELOCATE/REJECT部分 | Case显示授权/应收/实收；无普通refundqueue | READY：现有moneyfunctions；Casebridge未ready |
| SLA/延时/通知 | H4priorityhours/profiles | C1office14/4warning/oncebounded | KEEP | 显示剩余/迟到工作日；不新建priorityclock | READY：sharedsla42tested；Case Work接入未验证 |
| Closed / newproblem / reopen | H4reopenoverwritesissue | C1confirmbusinessdate/C8sealed | IMPROVE | 同未解决问题重开；新问题新Case关联 | UNVERIFIED：完整revision/closuregate未证明 |
| 日志/更正/并发 | H3timelinecorrection,H4roundwrite | C9JSONRMWrisk | ADAPT+BUILD | 看谁何时录什么；旧记录保留、冲突需重新确认 | UNVERIFIED：可靠跨模块事务未证明 |
| Visual Service Note / snapshots | H5threeprintvariants | C1documentchecklist+C6historicaldocs | ADAPT | 带图/QR工作纸，不能代替custodyreceipt | UNVERIFIED：rights/versions/rolefiles |
| customer/supplierportal | H7permanentbearer | C1first-day/help,noexistingcustomeruploadlink | DEFER | 内部先闭环；未来最小scope/撤销/期限独立review | UNVERIFIED，外部cutover另获授权 |
| import / scan | H3SOlookup+externalintake | C1staffintake,C4Unit/C6SOsearch | REJECT批量开Case/ADAPTreadscan | 可读Unit/SO再开同intake；导入不补造证据 | UNVERIFIED，非本轮必要能力 |
| settings/policyversions | H5lookups/assigneeprofiles | C1rulefunctions,C2policy,C7Staff&Duties | RELOCATE/IMPROVE | 不另建名单，政策版本与有效日期由owner管 | UNVERIFIED：完整versionedpolicyregistry未证明 |
| reporting / export | H2/H3sharedfilters/runtimecounts | C1coverageworkingdays+C7sourcehealth | KEEP+IMPROVE | scope一致，未知不当零；不虚报已完成 | READY：旧numbers25tested；完整linkedreports未ready |
| 公关/内部问题/Subscription | H3notes/urgent | C1publicescalation,C6Issue/Rental | KEEP+BUILD | 社交升级不改资格；例行cleaning不塞Case | UNVERIFIED：exactWork/admission未完整 |

完整最终业务流程、异常修正及取舍见§7.30；外部参考不移转Carres owner，不产生外国政策或界面准入。

## 7.22 · Cross-module consequences and the alignment list (on approval)

| MASTER / chat | What changes |
|---|---|
| Workspace §6.1, §11.5 | admit the nine `service.*` actions once `Service Duty` exists; Duty catalogue gains `Service Duty` |
| Purchasing §9.5 / §9.8 | Case ↔ Claim read-only link style; `Publish progress` event words for the Showroom view |
| Delivery MASTER | `Report a problem` on the DO page; customer collection/replacement legs read the Case's movement order; §1.2 refusal raises `service.condition_refused` |
| Stock MASTER §12.8 | Case link on Customer Return receipt; inspection result closes the Case leg |
| Payment MASTER §13 | `Report a problem` on Payment Records; refund exception links back to the Case |
| Orders MASTER | numbering `CSYYMM-NNNN` goes live; `Report a problem` unchanged |
| Guarantee MASTER | entitlement snapshot fields written by the Case; `claim_case_id` set on replacement |
| Rental §5.9 | Visit failure door |
| COPY-STANDARD | §7.20 table admitted |
| UI MASTER §4.3.4 / §6.1 | Service row in the adoption tables (after the UI master's combined review) |
| Issue Tracker | unchanged: internal SOP failure routes there; a Case may link an Issue |

Chats to notify on approval: UI/UX update master · Workspace · Purchasing · Delivery · Warehouse ·
Payment · Sales Order. Tally recorded here as sent / acknowledged / aligned.

## 7.23 · Intentional rejects and non-goals

- No Carres on-site inspection stage (RULING). No `Inspection` ask.
- No refund as a routine remedy; no `Refund` button.
- No manual Case status, no manual Case Type, no manual priority.
- No Case-level PIC field; owner comes from the Duty resolver.
- No Case → Supplier Claim creation; no supplier call steps inside the Case.
- No Service Note as a separate document type; the Visual Service Note derives from the Case.
- No Service Case column or group on the Sales Orders register (RULING 2026-09-21).
- No second task list for Delivery/Warehouse/Finance; their views read the Case.
- No capacity for routine subscription cleaning visits (Rental Visit).

## 7.24 · What this Blueprint overwrites in §2–§5 when approved

| Today (BUILT / FROZEN in §2–§5) | After approval |
|---|---|
| `CASE_WANTS` includes `inspection` and `refund`; chain has `inspect` and `supplier_date / at_supplier / back_from_supplier` | wants per §7.3; chain legs per §7.5 read supplier legs from Purchasing |
| `CASE_REPORTERS` includes `supplier` | `dealer` replaces `supplier` |
| `service_case_types` chosen by staff | removed from the UI; policy snapshot replaces it |
| `service_case_statuses` chosen by staff | derived step sentence; table keeps `is_closed` only |
| `Collect the item from {customer}` | `{Logistics} to pick up the {item} from {customer}` |
| `SC{YYMM}-NN` numbering | `CSYYMM-NNNN` |
| Numbers tab on the module page | `Reports → Service` |
| `opened_at` editable | read-only after day one |
| Service Note modal / print page | retired from the UI; Visual Service Note from the Case |

## 7.25 · 批准范围与最终审阅门 — NOT READY FOR CARD

**RULING / APPROVED — scoped owner confirmation 2026-10-06 in Service PLAN chat.** Jess confirmed the recommended processing chain: first substantive reply → required evidence → remedy decision / exception approval when required → collection, repair or replacement execution → communicate the outcome → customer confirmation. Each obligation names its owner, authoritative source and completion evidence. Delivery, Stock/Warehouse, Purchasing and Payment keep their own task identities and write ownership; Service reads their outcomes and does not create duplicate tasks. This scoped confirmation does not approve the full Blueprint, unapproved per-action clocks, settings changes, shared UI composition or deployment. No READY scope or BUILD commission follows from this confirmation.

**RULING / APPROVED — all-Case first response, owner 2026-10-06.** Every Case receives a substantive first response within two Office working days (§7.2); acknowledgment alone is not completion.

**RULING / APPROVED — internal processing timing, owner 2026-10-06 (§7.9).** Evidence review, remedy decisions, approval and final-confirmation follow-up have the scoped next-Office-working-day processing rule; failed collection and public escalation use the same-Office-day / after-hours-next-day rule. These are proposed action response deadlines, never promised supplier repair, stock arrival or customer-response dates. Waiting or sending never closes an obligation or pauses the existing 14-working-day Case deadline. Preserve §4's derived calendar rule, bounded extension and deadline-bound call events; do not introduce the conflicting proposed settings snapshot for existing Case deadlines. New source obligations keep their occurrence, original trigger, owner and due across repeated events and reassignment.

**RULING / APPROVED — decision approval, owner 2026-10-06 (§7.4).** Operation prepares; Service Case Approver approves every formal repair/replacement/charge/customer-movement decision. Approved-scope routine follow-up does not repeat approval; changed remedy/charge/scope does. Original module permissions, commercial approval and absolute policy prohibitions remain. No ordinary-remedy exemption applies.

**唯一阅读路径：**§7.1–§7.9定义业务／来源／政策／负责人及动作；§7.27定义逐步操作和业务验收；§7.26是Excel事实与尚未批准扩展；§7.28–§7.29是协调／测量证据。已有裁定不重问；其他建议尚未成为LAW。UI组合仍交共享UI controller，不由本chat画新variant。

完整Blueprint尚未全部批准，未合并，不存在READY scopes、Cards或BUILD执行顺序。必须先完成下列真正业务决定，清除与原批准规则的冲突，再接受共享UI和COPY，才能完成PLAN：

| 待审项 | 已批准边界 | 推荐与操作影响 |
|---|---|---|
| 首次实质回复覆盖 | 全部Case两Office工作日已批准，2026-10-06 | 已解决，不重问；Operation owner／cover负责，收到式回复不算 |
| 内部处理期限 | §7.9 owner已批准，2026-10-06；原Case规则保持 | 已解决：审证据／决定／审批／最终确认跟进next Office日，拒收／公开投诉同日或after-hours next日；未列步骤不自动获批 |
| 审批范围 | §7.4正式处理决定审批已批准，2026-10-06 | 已解决：Operation准备，Approver批准；原模块执行门保持，不重复审批已批准范围的普通跟进 |
| No remedy／Withdrawn／Entered in error／reopen | 现有close gate保留 | 推荐答案已写在 §7.30 第1–3项（证据、授权、客户告知、重开触发、期限）；**等 owner 一次审阅**，未批准前不得实现 |
| Excel发现的扩展 | Excel事实不等于新增rule批准 | §7.30 第5项：A1、A2、A3、A4、A6、A7、A8 已从现有 authority 解决（RESOLVED FROM AUTHORITY，引用列出）；A5 多个SO 与 A9 外部客户表单仍是 owner 决定 |
| Settings期限改变 | §4现有calendar-derived rule | §7.30 第4项：已解决（以减少解决）——首版只读显示，不提供编辑，不引入 existing Case snapshot；之后要编辑是新裁定 |

首次回复规则已批准；其他新screen copy以及shared host/tabs/layout不包含在以上业务批准内。正式handoff只用可取得的合并commit，不用本地草稿替代main。

## 7.26 · Measured evidence — the two workbooks the team runs today (read 2026-10-06)

**FACT — `Carres_Issue Tracker (4).xlsx`** (23 sheets): Legend · REFERENCE_LIST (29 coded
categories P1–P7 / D1–D11 / S1–S8 / I1–I29) · Issue Tracker SOP (weekly Wednesday 2:15 pm review,
"who do what by when", target 0 open) · WhatsApp/Google-Form `Template` sheet · partner minutes
(`Minute_GAI`, `Minute_TSDD`, `Minute_Carress` 174 rows, `28 Apr QnA` supplier review) · eleven
monthly issue sheets Nov 25 → Sep 26. Row counts: Nov 91 · Dec 69 · Jan 41 · Feb 16 · Mar 19 ·
Apr 30 · May 10 · Jun 34 · Jul 16 · Aug 15 · Sep 14 (≈355 rows). Current columns: `KeyIN Date ·
Ref · Status (Done / Yet Discuss) · PIC · Product · Issue Title · Fault Owner · Incurred charges ·
Who involved · What happened · Carres Action Taken On The Spot · What was affected · Ops Follow Up
1–3 · Solution 1–4`. 132 rows carry an incurred charge. Top issue titles: production defect/damage
(76) · wrong model/size/colour/spec (22) · SOP failure (17 + 5) · missing items/parts (16) ·
missing key-in (15) · logistic delay/no call (13). Top fault owners: Hookka 32 · Red Sofa/Todern 18 ·
Ops 13 · Sales 9 · NETS 8. Older months use a different header (`Date · Ref No · Product Type ·
Partner · Department · Issue Category · What Happened · Action Taken · Status`).

**FACT — `Carres_Service Note_ (5).xlsx`** (69 sheets, 79 embedded photos): `Dashboard` (cases per
product per month: Jan 14 · Feb 10 · Mar 10 · Apr 10 · May 7 · Jun 4 · Jul 6 · Aug 3 · Sep 1 = 66) ·
`Summary` (one row per SN: status · category · type · Ref No · PO No · start · deadline · logistic ·
logistic/supplier/warehouse remarks · what happened · Carres remark · follow-up 1–2) · one printed
`SN/YYMM-NN` sheet per case with **Section A Logistic · Section B Supplier · Section C Warehouse**,
items with PO No, deadline, `Warehouse received by / Date` signature. Types used: Manufacturing
Defect · 100-Day Exchange · Logistic Damage · Warehouse Damage · Customer Damage - Under Warranty ·
Handling Issue · Others. Category: Sofa 33 · Bedframe 16 · Mattress 14 · accessory 3. Logistics:
NETS, TSDD, AL, HOUZS, GAI, `Supplier Own Transport`.

**What the workbooks prove about this Blueprint (INFERENCE, each with its row above):**

| Seen in the workbook | Blueprint section it validates | Change made |
|---|---|---|
| One SN = customer problem + three department sections + items + deadline | §7.5 legs per owning module; §7.8 Visual Service Note | none — confirmed |
| `START → DEADLINE` ≈ 14 days on every SN | §7.6 completion promise | none — confirmed |
| `Ongoing / Overdue / Total Open` counters on Summary | mission rail counts (§7.11 facts) | none — confirmed |
| Dashboard per product per month | §7.17 Reports (BUILT engine) | none — confirmed |
| Issue Tracker mixes customer problems, supplier faults, internal SOP failures, partner minutes and templates in one book | ERP separation: Service Case · Supplier Claim · Issue Tracker | none — the 29 reference codes map 1:1 (P-codes → Claim/Case, D-codes → Delivery exception/Issue, S-codes → Case, I-codes → Issue) |
| `Fault Owner` + `Incurred charges` on 132 rows; monthly tracker sent to Hookka; Wednesday review with `Yet Discuss` | Issue Tracker owns accountability, cost and the partner report | **PROPOSAL A1:** when a Case records a fault owner other than the customer (Logistics · Supplier · Staff), the Case candidates a linked Issue automatically, so the weekly meeting and the monthly partner report keep their feed. Falsifier: the owner wants Issues recorded only by hand |
| `take back 2 seater only` · `bedrest only` · `headboard only` · `legs only` | §7.5 legs name exact Units | **PROPOSAL A2:** a leg may name a component of a Unit (seater · backrest · headboard · divan · legs) when the Unit stays with the customer; the component word is recorded, the Unit ID is unchanged |
| Loan sofa while the sofa is repaired (SN/2603-04) | Orders owns the Loan | **PROPOSAL A3:** the Case links the Loan record read-only; `Collect the loan item` stays Delivery's action |
| Exchange from ready stock; old unit "keep as resale item" at GAI; repair then "replace ready stock with the repaired divan" | Stock §12.8 (`Needs checking` → inspection → outcome) | none — confirmed; the Case reads the inspection outcome |
| Same item complained three times (TCF0197), twice (TCF0124, TCF0189); third time exchanged for a new set | repeat handling | **PROPOSAL A4:** the Case shows `Earlier cases on this item: {n}` with their outcomes; a repeat after a completed repair routes the decision to the Approver; no automatic "third time → replace" rule is written |
| One SN covering three references (CR0963 + CR0198 + TCF0308) | Case ↔ source links | **PROPOSAL A5:** a Case may link several Sales Orders / lines; the first-linked SO is the identity shown in the header |
| `on hold waiting for cust to pay rm250 delivery fees` | §7.4 charge + Payment link | **PROPOSAL A6:** a charged leg is `Waiting for payment` until Payment records it; the leg sentence reads `{customer} to pay RM {amount}` |
| Supplier service team goes to the customer's house (Dorsettloft, Armani, Hookka via NETS); NETS re-adjusts backrest on site | §1 NO CARRES ON-SITE INSPECTION; supplier/Logistics own visits | none — confirmed; the leg reads `{Supplier} to repair the {item} at {customer}` and its completion is the supplier's recorded result on the Claim/RO |
| Logistics tore/scratched goods (NETS) → exchange 1-to-1, cost on NETS | fault owner ≠ remedy owner | none — Service remedies; Issue Tracker recovers the cost (A1) |
| Customer rejected the exchange item (wrong side again, SN/2601-04 → SN/2601-12) | re-decision after a failed leg | **PROPOSAL A7:** a failed or refused leg reopens §7.4 on the same Case (`Carres to decide the remedy` again) instead of a second Case; the first leg's facts stay |
| `Canceled · wrongly keyed in` (SN/2601-05) | §7.2 `Closed · Withdrawn` | none — confirmed |
| `Template` sheet: WhatsApp scripts (balance payment · 100-Day exchange explanation · RM250 fee refusal) + four Google Forms (100-Day Exchange · 15-Year Warranty · Sofa Warranty · Bedframe Warranty) | §7.7 approved wording | **PROPOSAL A8:** seed the approved-wording library from this sheet (balance-payment scripts belong to Payment); **PROPOSAL A9:** replace the four Google Forms with one customer-facing claim form on the external-link pattern (Delivery §5.5): the customer uploads photos/video and accepts the terms version; the answers land in the Case intake as `Customer` reporter. Falsifier for A9: the owner keeps Google Forms |
| Partner minutes (GAI · TSDD · Hookka) and the supplier QnA | not Service | none — they belong to the partner/supplier records and Issue Tracker's review; out of this Blueprint |
| `Status: Done / Yet Discuss` | derived status (RULING) | none — `Yet Discuss` is the Issue Tracker's review flag, not a Case stage |

**What the ERP already does better than the workbooks (no change):** evidence stamped and
append-only; deadline derived, not typed; close gated on the customer's confirmation; one number per
Case instead of a sheet per case; counts that withhold themselves when unmeasurable.


## 7.27 · 逐步工作流程与业务验收说明 — PROPOSAL / NOT LAW

**Jess 2026-10-06 要求：Blueprint 必须写清细节和工作流，防止 BUILD 自行猜测。** 本节是可审阅的业务流程说明，不是 Card 或代码执行计划。§7.9 的 Operation 共享负责、每案一名负责人以及已批准的处理链继续有效；本节中的尚未明确批准的权限细化、动作期限、文案和例外处理仍是提案。没有得到批准的部分不得被 BUILD 当作法律。共享布局只引用 UI MASTER，不新增 Service 版本；本节说明它必须承载什么工作，不替 UI controller 决定组件排列。

### 7.27.1 · 阅读和批准方式

每个工作步骤都回答：什么事实触发 → 谁负责 → 员工看到什么 → 可做什么 → 必须记录什么 → 谁写入 → 哪个事实才算完成 → 接下来去哪 → 失败如何处理。屏幕文字示例须经过 COPY 准入，不能把示例直接变成上线文案。

**三种状态严格分开：**

- **已批准规则**：引用原 MASTER 的具体节；没有重新审批或自创替代规则。
- **建议规则**：标为 PROPOSAL，说明业务影响；未批准不能驱动实现。
- **实现／验证状态**：另列代码证据、当地预览、生产证据；存在组件不等于 Service 已接通。

任务完成、案件完成、文件签署、商品移动、客户付款是不同的事实；一个不能代替另一个。员工发送消息不会自动完成收货，供应商答应维修不会自动完成维修，审批通过不会自动完成退款。

### 7.27.2 · 开案：从眼前的记录开始

| 步骤 | 触发／负责人 | 员工看到与操作 | 要记录及拥有者 | 完成／下一步 | 缺资料或失败 |
|---|---|---|---|---|---|
| 1 查原记录 | 客户、Dealer 或员工报告客户问题；有权限的接报员工 | 在原 SO／DO／Payment／Visit／Showroom 记录进入 Report a problem；看到原来源编号、客户和适用商品 | 原来源的稳定身份与关联；原模块拥有原资料 | 来源确认后进入同一 intake | 找不到来源走 no-source，不编造 SO；读失败明确错误，不能显示空白当无来源 |
| 2 检查重复 | 同一 intake；接报员工 | 看到同客户／商品／来源的现有相关案件及问题摘要；决定追加资料还是不同问题新开案 | Case 记录追加原因和来源，不改原事务 | 同一问题进入原 Case；不同问题保留区分依据 | 名字或旧 Reference 相同不构成自动关联；不把两位同名客户合并 |
| 3 记录事实 | 接报员工 | 按问题引导：谁报告、哪个商品、什么问题、能否使用、客户希望怎样处理 | 原话、结构化问题、商品／Unit 已知身份、报告来源、必要照片／视频；Service 保存 | 满足适用证据要求后正式开案 | 客户希望退款不等于批准退款；缺必需证据保留 intake 草稿／补证门，不诱导上传无关照片；豁免必须有授权依据 |
| 4 生成案件 | 保存成功；系统 | 显示唯一编号和真实来源关联 | 按已批准 CS/SCS 编号规则创建，旧编号保留；服务事实由 Service 写入 | 一个正式 Case 进入分配 | 重复提交不能产生两宗相同案件；保存失败不出现“已开案”，已有提交结果可查 |
| 5 分配负责 | 新正式 Case；共享 Duty resolver | 显示 Assigned to 与下一义务；帮助人不变更负责人 | eligible Operation 人员顺序分配，分配／替补／改派有记录，遵循 §7.9 | 负责人收到原 Case 动作 | 没有合格人员时显示未分配和经理处理入口，不静默归 Sales PIC 或 Approver |

**明确边界：**仓库／Receiving 发现纯供应商商品问题，直接走 Purchasing Claim；没有客户补救旅程不强制建 Case。纯内部 SOP／系统失误走 Issue Tracker。两者确实同时存在时只关联，不把一宗事件复制为两个同义任务。

**来源异常分支（PROPOSAL / NOT LAW）：**

| 情况 | 员工工作流 | 保存／验收边界 |
|---|---|---|
| 原SO与单件商品确定 | 显示只读source身份，选择真正属于订单的商品，补问题／愿望／证据 | source与line归属由服务端核对；case保存当时来源关联及用来决定政策／承诺的可追溯版本，不改SO |
| 多件商品同一问题 | 逐件确认affected范围，保留各自line/Unit和证据缺口 | 不能用一个sku代表所有商品；当前代码只单行，完整多行目标尚未实现；不同完成结果逐件保留 |
| 找到同一未完成问题 | 查看原Case摘要、来源、范围、尚欠事项；把新证据追加到原案 | 保留追加人和时间，不新建重复任务，不覆盖原投诉 |
| 同来源但不同问题 | 记录为什么是不同问题，建立独立Case并关联原来源 | 不因同customer/order就强制把全部投诉合一 |
| 来源有多个匹配／同名 | 明确呈现有权限候选，由员工核实原编号和商品 | 不自动选第一个；Reference仅别名，不作关系键 |
| 原资料读失败 | 显示失败及重试，保留已填草稿；授权允许时明确改走no-source | 失败不是无来源；不能静默建一宗丢关联Case |
| 未找到原记录 | 手填已知客户／商品和原始证据，明确来源未确认 | 后续关联有核对和审计，不反写SO客户；缺日期不能假定资格 |
| 订单已取消／商品行修改 | 读取实际保留历史及当时版本，记录当前问题 | 原记录取消不构成已解决投诉；入口及历史关联实现仍欠核，不承诺当前已支持 |
| 重复按提交／两人同时开同问题 | 返回已存在提交结果／提示相关案件，保留真实不同问题分支 | 不能仅靠UI禁用按钮防重复；来源冲突／权限变化返回明确原因，不丢草稿 |

### 7.27.3 · 首次回应与补证

1. 负责人打开原 Case 的服务工作，先读客户原话、来源及已有证据；页面说明缺什么、为什么需要、下一动作和期限来源。
2. 初次实质回复应包含评估、明确补证要求或下一处理安排。单纯“收到”不构成实质回复。所有Case在两办公室工作日内回复已由owner于2026-10-06批准（§7.2）；不是两日修复承诺。
3. 沟通入口带入原记录真实联系人；员工核对收件人后准备信息。复制／打开渠道／附件选择只是草稿操作，不代表已发送、已回复或已保存证据。
4. 员工记录实际渠道、联系对象、发生时间、内容和可用证据；系统保留实际记录人与记录时间。无人接听、未回复、要求稍后联系分别保留真实结果，不能标为 customer_confirmed。
5. 客户提供资料后，逐项确认适用清单。收到文件不自动等于通过政策检查；检查通过、拒绝或授权豁免均有理由和记录人。
6. 资料不足时案件当前义务仍是补证／审证据，显示明确缺口；不会自动变成 Not eligible，也不会暂停案件完成期限。

**验收例：**客户发了沙发照片但政策要求的视频仍缺失 → 照片留存、视频缺口仍可见、不能进入依赖该视频的决定。员工发出补证 WhatsApp → 联系记录可查，但补证义务仍未完成。

### 7.27.4 · 政策与决定：先算资格，再记录处理

| 顺序 | 负责人看到 | 可做与必须记录 | 不可做／失败处理 |
|---|---|---|---|
| 找适用政策 | 原订单／实际交付日期、商品、覆盖来源、Guarantee 条款版本 | 从 Guarantee 的唯一政策来源得出结果；保存本案采用的政策版本及所用事实 | Service 不另写价格、资格或扣减算法；缺日期／覆盖来源时显示无法决定的具体原因 |
| 检查资格 | 允许／不允许／待证据，附政策原因 | 核对证据，记录授权修正／豁免（政策允许时） | 不由员工随意挑 Eligible；绝对禁止条件不能凭审批绕过 |
| 决定处理 | 只显示适用政策允许的处理选择及受影响商品 | 记录 remedy、范围、理由、movement、费用／payer、需要的审批和执行腿 | 客户提出的愿望不是商业承诺；不把所有案件默认退款或更换 |
| 例外审批 | 原政策结果、申请差异、理由、成本／收费事实、证据 | Approver 记录批准／拒绝及理由；案件负责人看到结果后继续 | 所有未批准的例外不得先执行；审批人缺失时显示阻塞，不用常规负责人代替 |
| 有收费 | 实际提案金额、付款人、已接受条款与 Payment 原记录 | 对方接受提案有记录；Payment 创建／记录正式客户金额和付款 | 在 Case 输入“Paid”不构成付款；收取／派送遵守 Delivery/Payment 的实际门槛 |

**审批范围已批准，2026-10-06（§7.4）：**Operation准备并记录建议，Service Case Approver批准正式维修、更换、收费及商品收换决定；改变处理方式、费用或范围重新审批。已批准范围内的正常跟进不重复审批。退款等同时遵守Payment原权限门；政策禁止项不得绕过。公共投诉由一名授权spokesperson处理，公开发帖不自动改变资格或费用。

**政策冲突：**§7.4 的示例表不是独立政策来源。如模型选择、运输收费、Guarantee 消耗或条件检查与当前 Guarantee/Payment/Delivery MASTER 不同，显示 REAL GAP 并以各 owning MASTER 的已批准规则为准，不能为了补齐表格猜定。

### 7.27.5 · 执行安排：每条腿来自一个拥有模块

| 场景／腿 | Service 下达与展示 | 实际执行／记录在哪里 | 什么才算完成 | 失败／部分结果 |
|---|---|---|---|---|
| 收取客户商品 | 已批准 movement、确切商品／Unit、接收方、前置条件 | Delivery 安排、客户 return DO、门口 condition/proof | Delivery 的实际 Collected 事实及适用检查通过 | 条件不通过保留未收取、原因及照片；商品仍在客户；Case 转客户沟通／重决策 |
| 仓库收货和检查 | 客户退回来源、原案和确切 Unit 关联 | Receiving／Warehouse 收货、inspection、condition | 原 owning record 已记录实际收货及必要检查 | 到仓不等于维修完成；部分 Unit 到仓只关闭其对应腿，其他继续 |
| 供应商维修／更换 | 展示已关联 Claim/RO 的承诺、当前事实和缺口 | Purchasing 从 Unit／PO／GRN 建／匹配 Claim 与 RO | owning Claim/RO 的实际执行结果及必要收回检查 | 供应商答应日期只是承诺；Carres 客户沟通及授权补救不会因追偿等待而停止 |
| 先换、后收／先收、后换／同次交换 | Case 记录已批准顺序，明确 incoming 与 outgoing 商品 | Delivery 安排自己的物流腿；Stock 负责真实库存与 Unit | 每条必要腿分别完成 | 换品送到不代表旧品已收回；同次交换部分失败保留各腿结果 |
| 客户交付 | Case 展示可执行的替换商品和前置门槛 | Delivery 的正式 DO、安排及 delivery result | 实际 Delivered 与适用 proof 被接受 | 预约日期不是已送达；付款／库存／门口条件缺口仍阻塞原动作 |
| 退款例外 | 已批准决策与 Payment 关联 | Payment 的正式 obligation／refund／receipt lineage | Payment 的实际退款事实 | 审批通过或截图不能伪造完成；失败继续显示待处理 |

每条腿显示 source、owner、精确记录、商品范围、completion fact。页面只读摘要与跳转原拥有模块的门，不提供能在 Service 偷写库存、维修、送货或金额的“完成”按钮。

**完成范围的精确限制：**Supplier收到只完成receipt义务；全部Unit归还及GRN只能证明return跟进，不自动证明修好。维修完成还需要适用检查结果。Case读取的是原模块已接受的结果，任何取消／失败／无权限／读失败都不是成功；源task关闭不自动关闭Case。Payment存在不同退款门时先依原Payment authority决定适用source，不由Service挑一条新门。

### 7.27.6 · 告知、确认与关案

1. 所有必要执行结果就绪后，负责人告诉客户实际结果，记录内容／渠道／时间／证据。
2. 客户确认与“已通知”分开。最终确认记录保存客户的实际回复和业务日期，实际记录人另存；代理记录必须证明不是员工自己的判断。
3. 系统核对适用关案路径的条件。Solved 必须有必需执行结果及客户确认；No remedy／Withdrawn 仍是 Blueprint 提议的路径，必须先批准各自的理由、授权、客户告知和关闭条件，不能拿这些名称绕过现有两层 close gate。
4. 关闭后记录只读事实和历史。新增投诉／重开保留前次关闭依据，不删掉旧证据；重开触发什么新义务及原／新期限仍须按批准来源，不把 deadline 随意重置。
5. 历史 Resolved 但没有确认的案件保留“历史记录／确认未记录”的事实，不自动补造确认，也不能把新关案规则解释为删除历史 Case。

**真实资料例：**SC2607-01 的已取得快照有 Ryan Chong 原投诉、处理文字、原参考号，但没有关联 SO、结构化 Unit/数量、照片或客户确认日期。显示缺口，保留历史状态证据；不从“2 seater”推导商品数量，不从 Resolved 推导客户已确认，不使用已知开案日期编造联系时间线。

### 7.27.7 · 期限与每日操作

- Case 完成期限沿用 §4：14工作日、适用公司日历、期限前四工作日联系、一次有界延期、联系事件绑定当时的期限。不得把 Office 日历和 Case 的 Mon–Sat 日历混成一个。
- 全Case首次回复两Office工作日及§7.9列明的内部处理期限已批准；未列步骤期限仍是提案；必须有 original trigger、calendar、owner、completion fact，不能只写“urgent”。等待客户／供应商和发消息均不暂停 Case 时钟。
- 新期限不得与 Delivery、Payment、Purchasing 原动作产生第二个 due。多人协助、重复消息、刷新页面不重开同一 action occurrence 或推迟 due。
- **早上：**看分配给自己的未完成动作、新回复和到期事项；打开 exact Case，先处理必需动作，不从表格筛选猜工作优先级。
- **白天：**接报 → 核对重复 → 回复／补证 → 决定／审批 → 原模块安排执行。客户来电时读相同 Case 历史，不再找多份表格。
- **交接：**请假／改派依据共享人员事实，保留原负责人、实际执行人及理由；接手人看到当前缺口，不重新开案。
- **收工：**未完成动作继续在原 Tasks，待外部答复不被标 Done；经理看到无人负责、到期和异常案件。Calendar 可查看实际安排；共享 UI 决定与 Tasks 的共存布局。

### 7.27.8 · 页面、动作与文件：业务规格，不画第二套 kit

| 表面 | 唯一职责 | 必须承载的事实／行为 | 不能承载 |
|---|---|---|---|
| Service Cases Register | 找、比较、筛选案件 | 一案一行；默认事实由模块提案，共用 Columns；真实多关联摘要；Table/Cards 同来源；查看／full page 原门 | 复制 Work、在 cell 改状态、第二套 Columns／金额计算 |
| 共用 Working Panel | 做 exact Case 的服务工作 | 主对象身份；已知 customer/source；现状、缺口、允许动作、原 evidence；准备／提交／等待审批／成功分别显示 | 未确认的 Service 专用 host、tab 顺序或组件；套入不存在的 SO |
| Full object page | 完整阅读及受权决定 | 原来源、policy/version、决策、每条执行腿、文档、历史、权限 | 与 panel 不同的事实／状态算法 |
| Tasks | 显示个人／协助可处理的原动作 | exact source identity、assigned owner、实际 helper、source due、完成事实及 deep-link | 审批人作为例行 fallback、重复 action store |
| Calendar | 看有来源的安排和日期 | 原 Case／Delivery／Work 日期及来源 | 拖动日期就偷偷改各模块承诺 |
| Documents | 找正确文件和版本 | Case work aid 与原 DO／Claim／RO／Payment 文档链接；历史版本／签署状态 | Print=执行完成；修改旧已签文件内容 |
| Reports / Settings | 分析和维护治理 | 报表读真实结果及缺失覆盖率；Settings 管 approved staff/duty与规则 | 把提案默认值显示为已上线设置；报表排名鼓励绕过关案 |

Visual Service Note 是照片／QR 工作辅助，不代替 DO、GRN、Claim/RO、发票或退款记录。PDF 与页面引用同一事实；修改以后只产生可追溯的新版本，历史客户文件仍可打开。旧 Service Note UI 的退役与新能力验证相连，不能先删除可用出口。

### 7.27.9 · 权限、修改、批量、导入与并发

- Intake recorder、assigned owner、helper、Approver 是不同身份。权限按原角色／source验证，看到字段不等于能改。
- 修改客户证据／联系资料／受影响商品时记录原因及实际人，不改已签历史；政策／商业改变重新经过适用检查，原结果留史。
- original opened date 不作普通编辑控件；误录更正走已有可追溯规则，不能通过改日期隐藏延误。
- 批量查看／Export 可以复用共享能力；批量审批、关案、延期、库存或退款默认不提供，除非完整批准每案独立验证与权限。
- Excel／scan 只帮助找到来源或准备 intake；历史 import 必须保留原编号／日期／来源和缺口，不把 Done 文本当客户确认、付款或收货。
- 同案两人工作时，不允许后保存的人静默覆盖刚完成的决定。告诉员工原事实已改变、保留草稿、重读并检查权限；重复结果提交不能生成两次收费／移动／关闭。
- 外部短信／WhatsApp／邮件记录按实际发送／回应留证据，不能用渠道打开成功当送达证明。安全客户提交链接的身份、权限和文件证据由其获批能力负责；不在本 PLAN 新建外部账号或切换渠道。

### 7.27.10 · 验收情景与禁止误建

| 情景 | 正确结果 | 如果出现以下行为即失败 |
|---|---|---|
| 有 SO 的新客户问题 | 关联真实 SO／行，保留投诉，一宗 Case | 重新输入另一份 SO／客户，靠 Reference 猜关联 |
| 没有 SO 的历史案件 | Case 本身可读，明确缺口 | 为了套 card 造订单／Unit／数量 |
| 另一员工代负责人记录客户回复 | 显示实际 recorder，owner 不变 | 自动把负责人改成 recorder |
| 发消息要求照片但客户未回 | 联系证据已存，补证义务仍开 | WhatsApp 打开后 action Done |
| 有审批的退款 | 批准结果可查，Payment 未实际退款前仍待执行 | 审批按钮直接把金额标 Paid／Refunded |
| 收取失败，旧品仍在客户 | 原 Delivery refusal/proof；Case 跟进 | Unit 自动进仓，Case 自动关闭 |
| 两件商品只完成一件 | 一条腿完成，另一条仍有范围与 owner | 用案件一个 Done 隐藏剩余商品 |
| 供应商承诺维修日期 | 读取 Purchasing 承诺，客户更新继续 | Service 存另一维修状态／日期，停止 Case 期限 |
| 新消息／刷新／改派 | 原 occurrence 与 source due 保留，草稿不丢 | 重复 Tasks，期限重新从今天算 |
| 原 Case 已 Resolved 但无确认 | 明确历史缺口，无虚构事件 | 自动生成 customer_confirmed 或历史演员时间 |
| 无权限／读取失败 | 明确受限／失败，不泄漏字段和数量 | 空白当作没有记录／已完成，Export 泄漏 |

**进入 BUILD 前的门槛：**完整业务规则获批，所有用于执行的 deadline／approval／closure 路径无未决定分支；共用 UI controller 的统一组合获批，COPY 准入完成；每个 business fact 的 owner、source、scope 和 completion 清楚。未满足的 capability标为未批准／未实现，不交给工程猜。该 Blueprint 本身不是上线证明，不据此宣告 PLAN MISSION COMPLETE。
### 7.27.11 · Excel → Blueprint → BUILD 的唯一交接要求

**OWNER REQUIREMENT，2026-10-06：**Jess要求所有步骤、操作方式和验收明确，BUILD不能重复询问本文件／Excel／代码可以回答的案件工作流。此要求不批准尚未决定的业务规则，不授权本PLAN建应用。

**原Excel证据复核：**本次直接读取 Downloads 的 `Carres_Service Note_ (2).xlsx`（SHA256前16位4f5912597d85f15e）及 `Carres_Issue Tracker (3).xlsx`（01c08304e2128b52）的workbook/sharedStrings，确认Section A Logistic、B Supplier、C Warehouse、Warehouse received by、deadline、两段follow-up，以及Issue Tracker的What happened、Carres action与三段Ops Follow Up。§7.26所指(5)/(4)版本为先前报告，本次没有定位/重新读取这两版本，不假称本次已核对所有最新行。Excel证明实际工作及例子，不自动批准remarks中的每个商业例外。

| Excel员工认识的事实 | Carres承接位置／唯一owner | BUILD业务验收依据 |
|---|---|---|
| SN No／Ref／PO No／Product | Case历史编号与原来源链接；SO/PO/Unit原owner | 可从案件找回准确原记录；Ref不代替关系键，缺来源明确 |
| What Happened／照片 | Case原投诉和证据 | 原话／照片可查，保留人和时间；不是仅存一个summary |
| START／DEADLINE | Case报告日期与§4日历规则 | 起算、假期、延期、告知记录可解释；不另造表格日期 |
| SECTION A LOGISTIC | Delivery收取／送回安排与结果 | 预约、实际收取、到仓、实际送达分别可查；未收取货仍客户 |
| SECTION B SUPPLIER | Purchasing Claim/RO及原Unit关系 | 承诺和实际收到／维修／归还分开，不用Case自由文字代替 |
| SECTION C WAREHOUSE／received by／Date | Receiving/Stock真实receipt、Unit、检查 | 谁实际收货、何时、哪个Unit及检查结果可追溯；到仓不等于修好 |
| Carres Remark／Follow Up 1–2／Ops Follow Up 1–3 | Case沟通事件及source义务 | 后续可继续增加事件，不建三个固定空格；Assigned to与Completed by分开 |
| Incurred charges | 原事实备注与Payment正式义务/付款分别保留 | 备注不等于收款/退款；正式金额和completion读Payment |
| Status Done／Yet Discuss | 历史原值与证据；Case当前义务／Issue review flag分别保留 | 不把Excel Done当客户确认，Yet Discuss不作Case阶段 |

**节省时间的交接约定：**

1. **只有一个执行依据。** 最终批准后覆写本MASTER，移除重复、过时或相反正文；已批准、提案和测量状态分明。本文目前仍有未批准Blueprint，不能据此宣告ready。
2. **指定可取得版本。** 交接必须是已提交且接收chat可取得的版本；跨chat读取不同checkout不能混用。正式BUILD以合并后的commit及owningMASTER/UI/COPY为准。本localbranch不是main。
3. **BUILD先证明理解，再动应用。** 在自己的chat用业务语言说明选定已批准范围的入口→人→原事实→操作→完成→异常，并对照本节Excel映射；只核对，不重新设计政策。遗漏或与MASTER冲突先从资料解决，不让Jess重讲正常流程。
4. **用同一批情景贯穿验收。** §7.27.10的情景，加§7.27.2开案分支、§7.27.5逐腿完成条件，分别注明source fixture/Excel case/真实生产记录。Excel真实案例允许缺历史事实，不为演示补造actor、Unit或付款；生产只读证据与可回滚测试数据明确分开。未获授权不新增真实生产Case。
5. **以员工结果验收，而非按钮存在。** 能从问题做到正确结果，跨模块写入正确、证据可查、partial/failed保留，才完成范围。截图／编译／测试文件存在不足；真实测试、实际运行及生产验证分别列证据，未核实不能标通过。
6. **未完成事项不会消失。** 交接／MASTER记录每个blocking依赖的owner、准确缺口、批准状态与证据，不以“后面再做”跳过理解。工程实施方式由BUILD负责，不由Jess挑文件、策略或测试方案。
7. **问题只留真正业务例外。** 可以从MASTER、Excel、代码或测量回答的由agent解决。出现未批准商业规则或两个当前明确ruling冲突时，给出查过的权威、推荐、影响与取舍再向owner提一项决定；不问“这个Case怎么运作”。

**没有空白通行证：**普通路线清楚不代表No remedy、Withdrawn、reopen、多SO范围、deadline设置或审批例外已批准。它们若仍有未决定的分支，相关范围不进入BUILD。共享UI缺口交给kitowner统一处理，不做page-local替代。PLAN完成后再另开BUILD；不能把这份说明当作Card或部署授权。

## 7.28 · 跨模块通知记录 — FACT，2026-10-06

Jess 在本 Service chat 明确授权向 UI、Workspace、Sales Orders、Delivery、Warehouse、Purchasing、Payment、Guarantee 和 Rental chats 发送 PLAN 依赖核对通知。已发送消息明确限定：不授权 Cards、实施、合并、部署、外部联系或恢复暂停 BUILD；本 Blueprint 未全部批准。要求各模块核对 source identity、原门、权限、completion facts 和冲突，在各自 chat 报告；不要求越权回复或转发。

| Chat（原名称） | Thread ID | 状态 |
|---|---|---|
| UI/UX update master | `01a10c26-587f-7d90-a4ab-55b8197296f8` | review completed in recipient chat; findings recorded below; integration/alignment not verified |
| Workspace (Houzs) | `01a0f6ab-41bb-7070-b8f1-68f796c3e3c6` | review completed in recipient chat; findings recorded below; integration/alignment not verified |
| Sales Order | `01a10eb9-c4a2-7220-86b6-6c695f5898a5` | review completed in recipient chat; findings recorded below; integration/alignment not verified |
| Delivery | `01a10c26-58c1-7a82-a991-18e8582dd3d9` | review completed in recipient chat; findings recorded below; integration/alignment not verified |
| Warehouse | `01a10c26-58e6-7172-be05-34bff7497f2c` | review completed in recipient chat; findings recorded below; integration/alignment not verified |
| Purchasing | `01a10c26-5b48-7d02-bab9-8acc235ee8aa` | review completed in recipient chat; findings recorded below; integration/alignment not verified |
| Payment | `01a10eb9-c407-7870-a7b6-6f8ce01e5627` | review completed in recipient chat; findings recorded below; integration/alignment not verified |
| Guarantee | 未定位明确当前 owning chat | 未发送；Terms review 不自动等于 Guarantee owner |
| Rental | 未定位明确当前 owning chat | 未发送；发现历史 Subscription Blueprint archive，不自动恢复／替代当前 owner |

通知已发送不等于接收方已确认，也不等于接口已接通。现有场景：有原记录自动带入已有资料，仅补问题／要求／证据；无来源手动记录，不造 SO/Unit；每个执行模块保留自己的身份、时钟、权限和实际完成事实。共享 UI 提交的是业务 payload 与 kit gap 核对，未宣称 Service 自定义 tabs/layout 已批准。


## 7.29 · 跨模块核对结果与验收缺口 — FACT / REPORTED，2026-10-06

已只读取得 §7.28 七个接收 chats 的核对结果。下表是接收方报告，不等于本 chat 独立运行测试或生产验证；依据版本不同的内容不能混作同一 main 真相。通知接收／review completed 不等于接口 aligned。所有新增修正仍须进入完整 Blueprint 审阅；不据此启动 BUILD。

| 接收 chat | 报告基准 | 具体发现 | Blueprint 的必需检查／正确业务结果 |
|---|---|---|---|
| Sales Order | origin/main 678c27346；只读代码 | intake已有 orderId/customer/line；当前只一个affected line；deliveryDate带到wizard但创建请求未保存原承诺；未找到Case duplicate检查；order-line归属及完整权限负向检查未证明；取消SO门欠核 | 来源查找不等于重复案匹配；原来源／当时承诺应可追溯，不从当前SO修改后日期重构历史；多商品范围必须明确，未支持不能宣传；line必须属于对应order，权限服务端验证；取消SO不能凭取消状态丢失历史问题报告能力 |
| Workspace (Houzs) | Service 009d3a6c6 + main 678c27346 | Operation共享／round-robin owner规则已解决，routine Work未接；SLA与customer-confirmed代码存在，未运行测试或生产操作；Workspace仍有旧owner未决定文字 | 保留新Service §7.9裁定；不重问owner；Work接入必须有精确obligation、owner、source clock和completion，既有14日代码不证明九动作已可用 |
| UI/UX update master | 指定工作树与当前checkout有差异 | Case原身份、不造SO、共享组件未采用；Service合并布局仍未审；证据清单组件须继续核对 | 将本branch/commit内容明确标识local；不能拿另一个checkout的MASTER自动覆盖；共享host/tabs/row menu必须统一review，本通知不是UI批准 |
| Delivery | 当前远端Delivery MASTER；未生产操作 | DO同intake关联未证实；condition拒收边界报告BUILT migration0516；partial Unit/仓库/替换闭环欠验证；source与proof仍Delivery拥有 | Collected是实物装载/接收事实；condition失败货仍客户；安排/到仓/Delivered各自独立；没有逐Unit证据不能整案Done；原付款release门不重置 |
| Warehouse | checkout128328c6b，不同于main；migration0341/0344代码 | Customer Return hold/检查规则存在；Case→receipt→Unit→inspection完整关联未验证；Stock §12.8引用已失效 | 当前Stock MASTER §5为接收方指出的rule location，正式改引用前核对同一批准版本；Delivery attempt不是完整customer-return收货证明；Case关案不移动Unit |
| Purchasing | main678c273464代码 | Claim↔RO、Stock交接、Receiving归还GRN已有；Case↔Claim/RO双向只读链未发现；仅hold解除被用作inspection推断，缺显式检查结果/人/证据；跨源去重欠证明 | 维修结果必须以原模块规定的验收证据判定；解除hold的含义先核实，不把它扩张成所有检查通过；每Unit的实际归还及修复证据可追溯，Case不自造完成 |
| Payment | checkout128328c6b与main678c27346权威不同 | Payment Records问题门未见，Service已有NOT BUILT标记；Case收费/退款关联欠证据；refund request/decide/paid接口存在，未验证部署；Work去重/door欠验证 | 获取批准当前Payment规则后校对；Caseapproval不替代actualrefund，invoice不存在就保留缺口；originalallocation/settlement及owner clock唯一 |

**不得凭接收方报告改写已批准业务：**Delivery报告将movement顺序整体称proposal，与Service已有四种movement裁定不应混淆；已批准词义/能力保持，具体新增组合和链接尚未批准／实现。Warehouse/Payment的128328c6b与main差异需要统一版本复核。跨模块新动作、关闭权限和商业政策不会因为另一chat建议就成为LAW。

**依赖结论：**不用等每个模块全部完成，但进入本Case流程的真实来源与实际完成证据必须闭合。若界面能开Case却丢原承诺、误关联line或没有duplicate检查，不能称“完整开案”；若能显示RO却没有逐Unit有效完成证据，不能称“完整维修闭环”；未授权或失败的source读取不能显示为已完成。现阶段不声明READY或PLAN COMPLETE。




**最新协调核对 — REPORTED，2026-10-06，接收方读取 f06af529b / PR1960。** Workspace已确认本chat新批准的owner、all-Case两Office日、指定内部处理期限和formal decision gate，不再作为未决业务问题；routine Service task实现仍未证明。Workspace另报告Customer Enquiry的一小时first-response是不同来源义务；本Service chat不据报告扩展或改写Customer Service法律，必须读其owningMASTER确认。Case两Office日仍从自己的批准trigger起算；创建Case不完成、取消或重置原enquiry动作，也不证明交接已接受。关联只保留两个不同义务的准确身份／due／结果，禁止复制同一义务为两个Tasks。UI controller正在核对PR，未确认Service组合，不标aligned。其关于enquiry查找视图的建议是Customer Service／Workspace提案，不是新增Service页面或批准外部WhatsApp启用。

**本chat独立来源复核（事实，非运行验证）：**

**FACT，独立只读复核基准 main678c27346，未运行测试／未生产写入。** `ServiceCaseWizard.tsx` saveMut 保存 orderId、单个orderLineId、SKU、原Reference及客户资料；没有把 deliveryDate／原承诺版本传入 create input。`service-cases.ts` POST / 插入 order_id/order_line_id，不见同route的line-belongs-to-order检查或Case重复匹配。`0285_service_case_guided_intake.sql` 为 order_line_id 建外键，证明line存在，不单独证明该line属于本案order；此次未穷尽所有后续DB约束，归属保证仍UNVERIFIED。来源lookup多匹配要求SO号码，不等于Case duplicate检查；同名不合并。

**FACT，main678c27346只读复核，未运行测试／生产验证：**`routes/operation/repair-orders.ts` 201–204 的 inspected 从 returned fact + 当前 inspection hold 不存在推导，未在该返回字段提供独立inspection结果/执行人。`lib/repair-order-work.ts` 的 returnDatePassed 完成依据为每Unit goods_received_date 与GRN；它证明原RO归还跟进条件，不证明每Unit修好。`routes/operation/order-payments.ts` 有 refund_request/refund_decide/refund_mark_paid；另有 `routes/finance/refunds.ts` 的refund_pay路径。不能把两套现存门任意选一或合并成Service退款引擎；必须按Payment MASTER的适用客户金额/source规则读写。接口存在不是部署或到账验证。

**尚欠核实而非owner重问：**hold解除的正式权限/证据模型、有效取消receipt的排除、客户refund适用原门、Case到各腿的真实关系、跨源action去重。未证实前不得将这些行标READY或VERIFIED。以上是完整业务完成要求，不是迁移/测试文件/工程执行方案。

## 7.30 · 完整最终推荐与审阅入口 — PROPOSAL / NOT LAW，2026-10-06

**Lane: PLAN。** 本节取代原五项审阅包，结合§7.1–§7.29形成一份完整推荐，不另建Blueprint或执行队列。核对版本：main `b65905c05`，包含PR #1964。已经批准的负责人、首次回复、内部处理期限和正式决定审批不再询问；以下新异常规则、整体布局及完整Blueprint仍待审阅。文中的界面称呼用于解释业务，正式屏幕文字必须先通过COPY准入。本节不是实施Card，也不证明功能已建成。

### 7.30.1 · 目的、边界和证据等级

**推荐目标：**员工记录一次客户问题，由一个Case负责人协调，页面直接说明谁对哪件货做什么、何时到期、欠什么证据；执行仍发生在原拥有模块。客户不需要知道内部文件名称，员工不用靠记忆串Excel、订单和仓库记录。

| 事实分类 | 本案结论与出处 |
|---|---|
| RESOLVED FROM AUTHORITY | §1、§7.4、§7.9、§7.25：Operation共享案件工作，每案一位负责人，helper保留实际执行身份；正式维修、更换、收费及收换决定由Service Case Approver批准。Guarantee管资格政策，Payment管客户钱，Delivery管收送，Stock/Receiving管货与收货，Purchasing管供应商Claim/RO，Issue Tracker管内部问题。 |
| APPROVED TARGET / NOT BUILT | 两Office工作日实质首回、§7.9处理期限、who + action + object当前义务、CS/SCS新编号等已批准目标；当前缺实现不能再问老板是否需要。跨模块完整接口未证明已连接。 |
| BUILT / VERIFIED | §7.29及§7.27.6记录代码/只读快照的实际检查范围。SC2607-01存在原投诉及处理文字，但缺SO、结构化Unit/数量、照片与客户确认；旧Resolved值不证明全程完成。未测试、未运行或未生产核实的能力不称已验证。 |
| REAL GAP / CONTRADICTION | 非解决关案、有效重开周期、多SO范围和未来客户表单的新增语义；UI组合尚未获统一审阅，COPY尚未准入。原§7.30的“客户任何回复即可关”“保修过期必新案”“第一张SO当Case身份”已删除，替换为以下推荐。 |

Houzs研究基线为`main`，commit `07cd742c001107a2bc3df7ce2b6d533f2f7ac8e1`（完整证据及范围见§7.21）。文件存在、文档承诺、代码行为、实际测试、运行及生产验证分别陈述；不把Houzs推定为当前2990。现有证据未确认适用复用授权，不能宣称可直接复制代码。Excel本次复核版本及缺口见§7.27.11，不宣称重读未取得的(5)/(4)版本。

### 7.30.2 · 正常工作流：入口 → 人 → 操作 → 完成 → 下一步

| 步骤 | 谁与入口 | 怎么操作 | 什么才完成／下一步 | 异常处理 |
|---|---|---|---|---|
| 接到客户问题 | 接报员工；订单、现有沟通或Service入口 | 保留客户原话、实际报告日期、客户及受影响商品；先查同一未完成问题；有来源选真实来源，无来源明确标缺口 | 保存一宗Case与范围，指派一个Operation负责人；进入首回 | 不凭同名/Reference猜SO；读失败不是无来源；重复提交不生成两宗案。§7.27.2 |
| 首次实质回复 | Case负责人或helper；Tasks直达该Case | 核对已有证据，说明评估、明确补证或处理安排；记录实际联系人、内容、发生时间与证据 | 两Office工作日内实质回复；缺资料仍继续补证 | “收到”、复制消息或打开WhatsApp不算回复；等客户不暂停原完成期限。§7.27.3 |
| 核证据与资格 | Case负责人；同一对象 | 逐件核对原交付、政策版本、照片/视频、受影响范围；读Guarantee唯一政策 | 足够事实产生可解释的政策结果；准备正式决定 | 缺事实显示具体缺口，不自动不合格；Service不另算资格。§7.27.4 |
| 正式决定 | Operation准备，Service Case Approver审批 | 记录维修/更换/收费/收换范围、费用与payer、理由及执行顺序；变化重新审批 | 有批准事实才进入对应执行安排 | 审批不等于客户接受报价、付款或货移动；政策绝对禁止项不可绕过。§7.4 |
| 执行每条腿 | 原模块执行人员；从Case深链到原对象 | Delivery收送，Stock/Receiving实际收货检查，Purchasing供应商Claim/RO，Payment收费/退款；Case读取来源结果 | 每件受影响货、每条必需腿有原模块实际结果 | 承诺日期不等于完成；部分完成、拒收、失败、借货及未归还分别保留。§7.27.5 |
| 告知结果与客户确认 | Case负责人；同一沟通历史 | 告知真实已完成结果，请客户确认；保留客户实际意思及时间 | 原执行条件齐全且客户确认问题解决，才能按现行已批准规则结束 | 员工说“修好”、供应商说“做好”、旧Resolved值或打印单据均不替代客户确认。§7.27.6 |

四种已批准movement沿用§7.5；系统带出所需顺序与前提，不要求新员工先选Claim/Return/Refund文件类型。部分商品完成不会关闭整案。Case不写第二份付款、库存、供应商维修或Delivery状态。

### 7.30.3 · 晨间、白天、交接与收工

**早上：**员工在共享Tasks看自己的新案、首回、补证、待决定、待客户确认及到期事项；一键打开准确Case。Approver看到已具备审阅事实的决定，不代替普通负责人追客户。经理看无人负责、逾期、失败及长期等待。

**白天：**按7.30.2处理；新消息追加原案，不重开任务/期限；需要仓库、物流、采购、付款时进入原对象，完成后原事实回到Case。客户来电时同一对象能读原话、决定和最新实际结果。

**交接：**请假、覆盖或改派使用共享人员安排，留下原负责人、接手人、原因和时间；实际帮助者不自动成为负责人。接手人看到下一动作、缺口和原期限，不重新开案。

**收工：**等待外部回复的义务仍开放；没有完成证据不能勾Done。实际预约显示在原Calendar，原动作仍在Tasks。14工作日完成期、期限前四工作日联系及一次有界延期沿用§4；Office首回/内部处理日历与原Case完成日历分别说明，不混算。

### 7.30.4 · 异常结局：行政关案不冒充解决 — PROPOSAL / NOT LAW

现行已批准的解决关案仍要求实际执行与客户确认；本小节是新增业务推荐，不可直接用于当前关案。

| 结局 | 进入条件与操作 | 完成与负责人 | 报表／禁止事项 |
|---|---|---|---|
| 无补救方案 | 政策不合格且客户拒绝允许的收费服务，或Approver拒绝正式请求；记录政策、决定理由，并实际通知正确客户 | 推荐由Approver确认行政结局；已启动的货物、费用、借货及执行承诺须由原模块妥善完成或取消后，Case负责人才能行政关案 | 保留“未解决／无补救”事实，不算Solved或客户确认；不能只因客户发了一条回复就关 |
| 客户不同意 | 客户明确反对结果，保留原话；交Approver复核政策/证据/原批准范围，再向客户解释实际决定 | 不能走“有回复即可关”；推荐只有复核决定已通知、原模块义务已处理，且Approver明确批准行政结局时，才可行政关案并保留dispute标记 | 报表单列争议结局；客户不同意不能变为“接受”或“解决”；新事实可重新审阅 |
| 客户未回复 | 已有可证明的实际结果通知及正确收件人，无未处理争议、无未完成原模块义务 | 推荐通知后5个Office工作日无回复，由Approver确认、负责人行政关案；未发送成功或仅打开渠道不启动此等待期 | 五日是新增推荐，未获批准；无回复不等于同意或解决。仍可查原案与后来回复 |
| 客户撤回 | 有客户自己的撤回意思及可追溯证据；电话记录注明实际人、时间与原话摘要 | 推荐Approver确认行政结局；原货物/钱/借货/承诺先由拥有模块处理，负责人再结束 | 不删除；单列Withdrawn，保留已发生延误；不能用员工推断代替客户撤回 |
| 开错、测试或重复 | 必须说明错误原因；重复案关联保留的正确Case；错误来源不得覆盖真实投诉 | 推荐Approver批准Entered in error；保留编号、记录、演员、日期、原因及关联 | 仅确实不是独立案件的记录排除服务履约分母，并单列排除数量；真实逾期不能借此隐藏，原案期限不重算 |

**权衡：**行政关案避免无限挂案，也承认客户可能不同意；增加一次明确复核，防止把未解决案件清成漂亮KPI。**可推翻证据：**实际运营证明五日过短，或行政复核导致重大排队，应调整等待期/授权边界；仍不能取消争议和原义务的可见性。所有屏幕结局词经COPY统一后才能使用。

### 7.30.5 · 重开与重复投诉 — PROPOSAL / NOT LAW

1. 同一商品、同一问题追加到仍开放的Case：继续原周期、原期限和原义务，不能以新消息洗掉逾期。
2. 原案确实完成并有有效客户确认，后来同一问题再次发生：推荐保留同一Case号，记录新周期的报告、原因和事实；新周期采用两Office工作日首回及14工作日完成期。原周期的报告、期限、延期、确认与准时结果全部保留，不回写。
3. 原来是错误或提前关案、缺必需完成事实：恢复原未完成义务及原期限；不能当有效解决后新周期来重新计时。历史错误结局保留审计更正。
4. 不同问题或不同商品：新Case关联以前案件；不把同一客户全部投诉混在一起。
5. 资格由Guarantee依据原投诉日期、原政策版本和新事实判断。现在已过保不自动抹除当初及时申报而未解决的问题，也不自动授予新保修；资格不确定明确交政策拥有方处理。
6. 正式改变处理仍经过Approver。原负责人合资格时优先接回，否则按批准的指派规则分配；实际报告人保留。重复故障可以产生Issue候选，由Issue reviewer确认，不能自动定责或自动成为正式Issue。

**权衡：**有效新周期方便继续服务，但报表必须同时显示首次结局、重开次数、各周期准时情况及端到端持续时间。**可推翻证据：**真实案例证明同一编号使不同问题混淆，应改成关联新案；无论编号怎样选择，原失败记录不许消失。周期新增计时不是§4当前已实现能力。

### 7.30.6 · 多商品、多SO与借货 — PROPOSAL / NOT LAW

推荐同一客户的一次共同问题可以关联多张SO；**Case号与客户是主身份，第一张SO不是Case身份。** 每件商品分别保留来源SO/line/Unit（若已确认）、实际交付、政策版本/结果、证据、决定、费用和执行腿。不同客户不混；同电话/名字不能当客户关系证明。商品来源不同或政策不同并不自动共享资格。

操作者先明确共同问题及受影响范围，再逐件处理；主对象显示真实关联摘要并可打开每个来源。单件完成不关闭其余商品；新增商品、费用或处理范围重新审批。若实际上是互不相关的问题，拆成关联Case，减少错误承诺。**权衡：**一个沟通窗口减少客户重复说明，但不能用一个状态掩盖逐件未完成；真实案例若主要为独立问题，将推翻共同Case推荐。

部件依据ERP-ARCHITECTURE的Unit边界：独立可销售/更换模块用自己的Unit身份；脚、螺丝等非Unit部件用准确部件描述，不制造库存身份。借货由Orders的loan offer/Loan Note和原Delivery/Stock流程拥有，Service仅关联、协调及读完成事实；借出不是送回修好的原货，借货未处理不能静默结束其义务。

### 7.30.7 · 页面、文件、搜索与设置

| 位置 | 推荐员工用途与内容 | 共享约束／批准状态 |
|---|---|---|
| Service Register | 一案一行，Case身份、客户/来源摘要、当前谁做什么、负责人、期限、异常；按编号/客户/来源搜索，按负责人与实际义务、逾期、争议及缺证据筛选 | Shared DataGrid/CompactModuleCard、共同Columns与权限；精确默认列与组合待UI controller，不新增Service kit |
| Working Panel / full object | 同一事实：原投诉→范围/来源→资格与决定→执行腿→沟通→文档/历史；下一允许动作带人、证据和期限 | 相同状态/权限来源；Panel做当前工作、full page读全貌；不假造SO，组合及COPY待统一审阅 |
| Tasks / Quick Rail | 找到准确Case动作并深链；显示原owner/due/完成条件和实际helper | 使用共享Work Engine，不建Service任务池；Quick Rail是到达入口，不是第二个任务/状态引擎 |
| Calendar | 查真实收送/维修安排及来源日期 | 原模块修改与权限；拖动不能偷偷改Case或Delivery承诺 |
| Documents / history | Visual Service Note照片/QR辅助；链接原DO、Claim、RO、Payment/退款记录；可打开采用过的政策及历史客户文件版本 | 打印/生成不构成收货、送达、付款或解决；历史签署文件不覆盖 |
| Reports | 开放义务、首回、原完成期、各周期与端到端耗时、重开、争议、行政结局、缺证据覆盖率；导出保留真实范围与权限 | 行政结局分列，排除项可追溯；不得把历史Done自动转客户确认，数字口径未批准不作已建成声明 |
| Settings | 按共享People/角色维护合法指派与覆盖，展示已批准期限/政策来源 | 数字未获可编辑授权，推荐只读；不复制Guarantee政策或Payment收费表。新增可编辑规则需明确旧Case适用语义，不问老板选控件 |

修改/更正保留实际人、原因和时间；改变商业范围复核并重新审批；原报告日不可普通编辑隐藏延误。复制只作为新案草稿，不复制审批、客户确认、付款、收货或已完成腿。扫码/导入帮助找来源，不根据文本猜事实。批量查看及导出服从共享权限；批量关案、审批、延期、退款和库存动作不纳入当前推荐。并发修改时保留草稿并明确要求重读新事实，重复提交不产生两次收费或移动。完整异常与验收见§7.27.9–§7.27.11。

### 7.30.8 · 参考教训、复用分类与取舍

本表是§7.21完整能力矩阵的最终推荐摘要；文件/段落级证据在该节和§7.29，不能以此摘要扩大已核实范围。

| 能力 | Houzs／参考证据 | Carres当前／权威 | 取舍 | 员工收益与依赖 | 复用判定 |
|---|---|---|---|---|---|
| 来源开案及原关系 | §7.21 intake与关系检查；文件存在不代表全程运行 | §2、§7.3、§7.29 source归属仍有缺口 | ADAPT | 少重填，准确找到货；必须核来源权限 | UNVERIFIED完整多来源；现有单来源只按已核证范围 |
| 一案协调、多执行腿 | §7.21工作流与当前Excel物流/供应商/仓库段 | §7.5、§7.27.5原模块owner | ADAPT / BUILD连接 | 不漏收货/归还/部分结果；依赖真实Delivery/Stock/Purchasing事实 | UNVERIFIED整条连接，不称copy-ready |
| 政策及收费 | §7.21规则检查不能照搬Houzs商业假设 | Guarantee / Payment MASTER唯一权威 | KEEP / REJECT外国规则 | 一个资格和钱来源；不重复计算 | READY仅限各拥有模块已证明的本地能力；Case整体接线未证明 |
| 任务、步骤及沟通 | §7.21实现与测试范围；Excel连续跟进事实 | §7.9、共享Work与UI，Case Tasks尚未完整接入 | ADAPT / BUILD | 直接知道谁做什么；不建第二个任务引擎 | UNVERIFIED适配及复用授权 |
| 文件与版本 | §7.21文档证据、§7.27.8原文件边界 | 原模块文件，加Service工作辅助 | KEEP / ADAPT | 一处找到正确文件，不用打印代替完成 | UNVERIFIED历史版本全链 |
| 行政结局/重开/多SO | §7.26–27实际场景；§7.30明确差异 | 当前规则未完整解决新增语义 | BUILD仅在批准后 | 不隐藏争议/逾期，多件不漏 | ENGINE GAP：本次证据未找到符合本推荐全套语义的现成解法，并非声称全球没人解决 |
| 外部客户提交 | Houzs/Delivery链接模式只作模式参考 | §7.15、外部切换需另授权 | ADAPT未来能力；DEFER切换 | 少重录证据；需身份/范围/附件权限与沟通连续性 | UNVERIFIED；不能因链接存在就宣称可复制 |

**COPY REQUIRED目前不成立：**只有演示合适实现，并核业务语义、模型、权限、UI、依赖和复用权利后才能判定；本次没有这份完整证据。READY不表示本模块端到端已完成。UNVERIFIED必须保持可见，不能为了派工改叫ENGINE GAP。

**拒绝／不需要：**Houzs/其他系统的角色、政策、术语与状态直接照抄；Service自行管supplier stock claim；第二份钱/库存/供应商维修/Tasks状态；强迫员工先选内部文件；Carres上门检查；批量危险业务动作；删除错误Case；把消息发送、预约、收货或旧Done当解决。这些增加错误承诺或双重owner，缺乏当前操作收益。

### 7.30.9 · 跨模块和外部边界

- Sales Orders提供原客户/商品/历史及Loan Note；Case不改订单商业事实。多SO、新来源修正和已改单历史须真实可追溯。
- Guarantee提供唯一资格、覆盖与条款；Service保存本案引用证据，不建立政策分叉。
- Delivery提供收送安排、失败/拒收/condition proof；Payment提供实际收费/退款；批准不绕过其放行、金额和权限门。
- Stock/Receiving提供实际Unit、收到人/时间及检查；到仓不等于修好。Purchasing提供独立supplier Claim/RO，Stock问题不需要客户Case作为先决条件。
- Issue Tracker仅接候选及证据，由reviewer判定；Case反复或第三方失误不自动定责。Workspace接原owner/due/动作，不复制事实。
- Customer Service的新沟通和原消息可关联Case；Enquiry的一COVERED小时首回与Case两Office工作日是不同义务，不能互相重算或抹去。
- 推荐未来安全客户提交能力，先保存投诉及附件，再由员工核来源/资格；系统不直接承诺补救。现有四个Google Forms/WhatsApp继续使用。能力批准、外部账号、真实链接投放及渠道切换是不同授权，PLAN不执行。

不需要等所有模块宣布完成才完成本Blueprint；需要每个依赖的owner、事实及失败边界明确。接口未建是批准目标缺口，跨模块规则真正冲突才阻塞相关能力；这里不启动BUILD、不发送外部联系。

### 7.30.10 · 挑战与可推翻条件

| 当前 → 问题 | 更好设计 → 权衡 → 推荐 | 会推翻推荐的证据 |
|---|---|---|
| 旧状态选择/Excel Done → 人不同理解，未完成可被隐藏 | 当前义务从事实导出；增加证据要求，减少猜测；保留已批准who/action/object | 实际操作证明关键动作无法由事实表达，需先补事实边界，不恢复任意状态选择 |
| 消息/仓库/供应商备注各处 → 客户联系与货物结果混在一起 | Case协调、原模块执行；依赖真实连接；保持一个owner一个writer | 权威ownership出现真实变更；不能因接线未建就转移ownership |
| 原五项提案用任意客户回复关案 → 争议被算解决 | 行政结局独立并经复核；增加一次审阅；不虚构确认 | 正式owner选择永不行政关案，接受持续挂案成本 |
| 重开重置单一时钟 → 逾期记录可洗掉 | 合法新周期独立，提前关案恢复原钟；报表更复杂；保存端到端史 | 实际复发界定无法稳定区分新周期，应用关联新Case但仍保留原履约 |
| 多SO第一单当身份 → 其余来源/政策被遮蔽 | Case/customer为主，每件独立来源；范围核对更多；减少漏项 | 真实场景证明没有共同问题或运营必须按单分别负责，则拆关联案件 |
| 直接“复制Houzs UI” → 带入外来规则并分裂kit | 复制有用交互，使用Carres共同模板、COPY和token；等待组合审阅；收益必须可说明 | UI统一审阅及操作者测量证明另一合规组合明显更快，替换组合，不分裂kit |

### 7.30.11 · 最终审阅与停止边界

本次提交完整推荐供一次整体审阅，不把正常流程变成老板连续回答的小问题。已经批准部分保持有效；新增行政结局（含五Office工作日等待）、重开周期、多SO范围、未来客户提交能力及整体Blueprint只在明确审阅批准的范围内成为规则。未回复不是批准，复制其他chat回复不是批准。

尚欠三种不同证据：**owner对完整推荐的审阅；UI controller对共同组合的审阅；COPY准入。** UI尚未完成时，不冒称画面已获批准；本节已说明业务承载，不用假HTML替代审阅，也不把未决UI推给BUILD猜。

明确批准后，在同一MASTER删除过时或相反正文，将批准业务写成唯一当前规则并提交可取得的Git版本。只在完整Blueprint已审阅批准并持久化后声明PLAN MISSION COMPLETE；随后仅列有充分业务/UI/依赖和验收边界的未编号READY FOR CARD范围。后续实施需独立明确BUILD commission；本chat不因规划批准自动转BUILD、不创建Card、不部署、不改真实数据。
