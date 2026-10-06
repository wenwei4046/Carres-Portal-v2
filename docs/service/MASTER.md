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

**RESUME HERE — 2026-10-06, Service Case PLAN lane.** §7 below is the complete business-layer
Blueprint drafted for owner review; every line in it is **PROPOSAL / NOT LAW** unless its heading says
otherwise. Its UI composition (§7.11–§7.14, §7.18) is deliberately **not written**: the owner ruled
on 2026-10-06 that Service waits for the UI/UX update master's latest shared kit and adopts it as
published; a Service-specific variant of the shared Register, Working Panel or Object page is not
drawn here. The alignment request was sent to that chat on 2026-10-06 (UI MASTER §0.3 item 11);
state: sent, not acknowledged, not aligned. Production could not be walked (login required);
measurements are from a local fixture preview of `origin/main` `9ad7231d0`, evidence in
`docs/evidence/service/2026-10-06-*.jpg`.

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
> challenged · `OWNER DECISION` = the one genuine business choice this Blueprint asks.
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

**PROPOSAL — the 2-working-day first response applies to every source, not only Dealer.** The
owner ruled it for Dealer requests (2026-10-02). One clock for all sources is one rule to learn and one
Work item. Falsifier: the owner says customer complaints need a different first-response promise.

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

**Approval (RESOLVED owner routing; PROPOSAL on scope):** the remedy within the policy's own
result needs no approver. `Service Case Approver` approval is required for: goodwill exception ·
waiving a charge or the condition rule · declining an eligible claim · any refund (then Payment
executes as its exceptional route) · a Case marked `Public escalation`. Falsifier: the owner wants
every remedy approved.

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
| First response | 2 Office working days from `opened_at` (RULING for Dealer; PROPOSAL for all) | Service Duty | NOT BUILT |
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

**CURRENT ADMISSION LIMIT — measured at main `678c27346`, 2026-10-06.** The owner rule above is resolved; do not re-interview the owner or revive a monthly single-holder proposal. Workspace §6.1/§11.5 still records the earlier admission hold, and the Work reader does not demonstrate routine Service actions. The remaining boundary is implementation plus approval of proposed per-step clock laws, not absence of the routine owner decision. The existing 14-working-day deadline/day-10 event is a reusable Case source, not evidence that Service is already in Tasks. No Service routine Tasks production verification is claimed.

**PROPOSAL / NOT LAW — action catalogue for later Workspace admission (owner rule is resolved; proposed step clocks are not automatically approved):**

| Action identity | Fact (line 1) · act (line 2) | Owner rule | Due | Closes when |
|---|---|---|---|---|
| `service.first_response` | `{Case No} has no reply yet` · `Reply to {customer} · Record what you told them` | Service Duty | 2 Office working days from `opened_at` | `first_response` event |
| `service.obtain_evidence` | `{evidence} is missing` · `Ask {customer} for {evidence} · Record their reply` | Service Duty | next Office working day | required slots filled |
| `service.decide_remedy` | `Evidence is complete` · `Decide the remedy for {Case No}` | Service Duty (Approver when §7.4 says so) | next Office working day | `decision` event |
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
| `First response within {n} working days` | 2 (code constant) | Service Settings, editable 1–5, Office working days (owner asked 2026-10-06 "got setting?"; answer: yes, this row) | NOT BUILT |
| `Finish within {n} working days` · `Call the customer at day {n}` | 14 · 10 (code) | Service Settings, editable; a change never moves an existing case's deadline (snapshot on `opened_at`, the Purchasing §9.5 pattern) | engine BUILT, setting NOT BUILT |
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

## 7.21 · Reference-to-Carres capability matrix (object-level mining, 2026-10-06)

| Reference capability | Carres current / owner | Verdict | Why | Dependency |
|---|---|---|---|---|
| Zendesk: ticket status derived by workflow, SLA badge with "first reply" and "resolution" clocks | 14-day clock BUILT; no first-reply clock; dropdown status | ADAPT | two clocks, both derived; status as who+action+object (owner ruling) | §7.2, §7.6 |
| Zendesk macros: approved reply wording one click away | none | BUILD | First-day law: staff never improvise policy promises | §7.7, COPY |
| Shopify Returns: return → exchange/refund options come from policy; restock only after condition check | Guarantee policy engine (terms text); condition-gated collection RESOLVED | ADAPT | engine offers only allowed remedies; refund stays exceptional | §7.4 |
| Linear: status is a workflow fact; properties in a side rail; keyboard first | shared compact card + DataGrid | KEEP (kit) | adopts the shared template as published | UI master |
| Intercom: conversation timeline + customer context beside it | Timeline tab + embedded SO in Info | KEEP (kit) | §5.2 three-rank history; no second customer store | UI master |
| Houzs Service Case detail hierarchy (owner-selected reference 2026-10-01) | — | ADAPT (hierarchy only) | sections: result → decision → arrangements → evidence → history | UI master |
| AutoCount: sortable headers, per-column filters, footer totals | DataGrid supports | KEEP | copy the power, not the 17 columns | UI master |
| Zendesk/Intercom: assignee per ticket with round-robin | Operation sharing / per-Case owner rule approved; implementation not verified | ADAPT | Service Duty on the shared resolver, helpers retain owner | §7.9 |
| Shopify: customer-visible order/return status page | Dealer request view (Purchasing §9.8) | ADAPT | published progress events, never raw status | §7.7 |
| Any helpdesk: canned "closed" by agent | Carres closes only on customer confirmation (BUILT) | KEEP | the module's own law | §7.2 |
| Any helpdesk: free-text ticket body | five guided questions (BUILT) | KEEP | staff cannot fill free text | §7.3 |

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

## 7.25 · Review boundary — NOT READY FOR CARD

**PROPOSAL / NOT LAW — consolidated business recommendation for owner review, 2026-10-06.** Apply Dealer's substantive first-response promise of two Office working days to all customer Cases; acknowledging receipt alone is not a substantive reply. Internal evidence review, remedy decisions, approval and final-confirmation follow-up should have a next-Office-working-day action deadline from the triggering fact; failed collection and public escalation should be handled the same Office working day (after hours: next Office working day). These are proposed action response deadlines, never promised supplier repair, stock arrival or customer-response dates. Waiting or sending never closes an obligation or pauses the existing 14-working-day Case deadline. Preserve §4's derived calendar rule, bounded extension and deadline-bound call events; do not introduce the conflicting proposed settings snapshot for existing Case deadlines. New source obligations keep their occurrence, original trigger, owner and due across repeated events and reassignment.

Recommend ordinary policy-authorised remedies proceed with the assigned Case owner's recorded decision; exceptions (goodwill, charge waiver, refusing an eligible entitlement, refund, condition waiver, public-escalation decision) require the governed Approver and cannot override an absolute policy safety/condition prohibition. Payment executes approved customer money; Purchasing owns supplier recovery independently. Trade-off: faster normal handling with clearer response expectations increases Operation workload and requires monitored Duty coverage; exception control remains. This recommendation is overturned by evidence that two-day replies cannot be staffed, that ordinary remedies require commercial approval by policy, or that existing source deadlines would be duplicated. Any contrary approved policy wins and the conflict stays visible for resolution.

**Review scope:** the complete business Blueprint includes intake/source matching, preserved numbering, policy-version evidence, remedy/movement decisions, cross-module completion legs, assigned ownership, proposed response timing, documents/history, reporting/settings boundaries and the intentional rejects in §7.23. Shared Register/Working Panel/Tasks composition is still excluded pending the UI controller's combined review. Owner acceptance of business truth does not mean UI acceptance, production verification, full PLAN completion or permission to implement.

**RULING / APPROVED — scoped owner confirmation 2026-10-06 in Service PLAN chat.** Jess confirmed the recommended processing chain: first substantive reply → required evidence → remedy decision / exception approval when required → collection, repair or replacement execution → communicate the outcome → customer confirmation. Each obligation names its owner, authoritative source and completion evidence. Delivery, Stock/Warehouse, Purchasing and Payment keep their own task identities and write ownership; Service reads their outcomes and does not create duplicate tasks. This scoped confirmation does not approve the full Blueprint, proposed response/per-action clocks, proposed approval scope, settings changes, shared UI composition or deployment. No READY scope or BUILD commission follows from this confirmation.

The complete Blueprint is not owner-approved or persisted as final operating truth. There are no READY scopes, Cards or implementation sequence in this PLAN. Shared UI composition remains with the UI controller's combined review (§7.11–§7.14). Existing module owner rulings are preserved; approval of shared ownership is not approval of this entire proposal.

**PROPOSAL / NOT LAW — Tasks admission and business acceptance summary, 2026-10-06.**

| Operator need | Authoritative source / owner | Completion evidence | Current admission boundary |
|---|---|---|---|
| Give the first substantive reply | Case first-response record; assigned Operation Case owner | dated assessment, request for missing facts or proposed next step, with actor/channel | two Office working days approved for Dealer; extending to all sources remains PROPOSAL |
| Obtain and check missing evidence | Case policy-required slots; Case owner follows up, customer supplies | accepted evidence or authorised waiver; asking/sending alone does not fill the slots | intake evidence exists; next-day action clock remains PROPOSAL |
| Decide the remedy | versioned Guarantee policy and Case decision; Case owner, Approver for governed exceptions | remedy, reason, movement and charge decision; approval result where required | full engine and proposed approval scope are not thereby approved |
| Approve an exception | Service Case Approver through shared resolver | dated approval/refusal, reason and actual actor | approver duty exists; proposed action timing NOT LAW |
| Approve collection evidence | Case evidence plus Delivery condition law; assigned Case owner within authority | approved/refused pre-check, not a message sent | collection gate is approved target; action timing NOT LAW |
| Explain impending delay | original Case deadline and bound SLA event; assigned Case owner | customer_told event naming the exact deadline and reason | existing 14-day / four-days-before rule reusable; Work projection not demonstrated |
| Handle failed collection | Delivery refusal and proof, then Case customer communication | customer outcome recorded; revised movement/charge uses its owning facts | source failure does not silently close Case; same-day deadline remains PROPOSAL |
| Handle a public complaint | recorded escalation; Service Case Approver/spokesperson | recorded response and evidence; policy entitlement unchanged | public-escalation business rule exists; urgent clock remains PROPOSAL |
| Confirm customer outcome | Case plus every required owned leg | customer_confirmed record and required completion gates | close gate exists; legacy closed records without confirmation are retained explicitly, not invented |

**Shared display contract (business payload, not a new UI variant):** task identity is the Case plus its exact obligation/occurrence; record identity remains distinct from an action. The entry names the responsible party, action and object, carries the source due and missing completion fact, and opens the exact Case's Service work through the shared host. UI controller decides the common placement/tabs in the combined review. A Case with no SO uses its own customer/source evidence; no fabricated SO header or actor. Row selection cannot change an open task or erase a draft. Delivery/Stock/Purchasing/Payment actions are linked read-only and retain their existing identities, owners, clocks and completion doors.

**Exceptions and acceptance:** no eligible Operation owner → visible unassigned work for the manager, never hidden or assigned to Sales/Approver by convenience; missing source → factual no-source intake and later audited linking; source read failure → unavailable, never “completed”; multiple Units → retain each leg's remaining obligations; supplier waiting does not stop customer updates; duplicate submissions cannot create duplicate outcomes; amendments retain original evidence and actor/time; withdrawn/no-remedy/reopened outcomes retain reasons and traceability. Policy, reassignment, completion and money permissions are checked at their original owner. No bulk close, copied completed evidence or imported Resolved value may bypass completion gates. Historical SC references stay searchable; copying creates new intake facts, never copied approval, policy consumption or completion. External accounts, supplier channels and live cutover remain outside this PLAN.

**Actual real-data limitation:** the 2026-10-03 read-only snapshot of SC2607-01 shows a legacy Resolved record with no linked SO, structured Unit/quantity, photos or customer-confirmation date. It supports a missing-data review, not proof of new numbering, ownership allocation, Work admission or the complete new lifecycle. The current main's fixture preview is separate evidence and must not be labelled production.

**Open business proposals to review with the complete Blueprint:** extending Dealer's two-day first response to every Case; proposed per-action timing; proposed ordinary-versus-exception approval scope; editable timing settings and whether future settings changes snapshot existing promises. Existing §4 derives deadlines from the calendar; a proposed snapshot policy must not silently override it. No setting is “built” merely because its proposed row names a default. Screen wording remains pending COPY admission. Shared kit review is a dependency, not a request to re-approve resolved Service ownership.

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
