# SERVICE — MASTER

> **The only Service document.** Overwritten when re-ruled; never versioned.
> **You read `CLAUDE.md` and this file.**

| I am working on | Read |
|---|---|
| anything | **§1 · §1.1** |
| filing a complaint | **§2 Intake** |
| the follow-ups | **§3** |
| the deadline | **§4** |
| the monthly numbers | **§5** |

---

# §1 · Overview

### MISSION
Service Case is Carres' customer complaint/service-request record, reported by the customer or
recorded by staff on the customer's behalf (owner clarification 2026-09-14). It owns customer
communication, investigation, remedy and follow-up. Record the customer problem once where it is
reported, preserve the evidence, route each owner its Work, generate the necessary execution
documents, and finish only when the customer and required outcomes are complete.

Receiving and stock supplier-goods problems go directly to the Purchasing Supplier Claim
(`docs/purchasing/MASTER.md` §7.3, §9.5). An affected Sales Order alone does not require a
Service Case. **Two doors, one Supplier Claim flow (owner ruling 2026-09-18):** a customer
complaint stays in its Service Case; only when the supplier must answer does the Case open one
linked Supplier Claim, which Purchasing then owns.

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
workstreams under the Case. **Purchasing Supplier Claims have two doors and one flow (owner
rulings 2026-09-14 / 2026-09-18):** door 1 opens a claim directly from Stock Unit, PO line or
Goods Receipt evidence with no Case; door 2 is this Case opening one linked Supplier Claim, only
when the supplier must answer, from the affected Unit's verified purchase source and reusing the
Case evidence. Either way the claim is Purchasing's: the Case reads its progress and can neither
approve nor close it, and the claim never decides the customer remedy. Purchase Return, Delivery Return, replacement
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
intake type. Intake itself never creates a Purchasing stock claim; the Case opens a linked
Supplier Claim later, only when its investigation finds the supplier must answer (2026-09-18).

**Department destinations are Work views, not duplicate registers:**

- Delivery Work shows Case workstreams requiring arrangement, collection, return or proof.
- Warehouse Work shows Case workstreams requiring inspection, repair, packing, quarantine,
  handover or returned-goods receipt.
- Finance Work shows Case workstreams requiring refund or collection adjustment.

Updates made in a department view write back to the same Case timeline and evidence set. No team
rekeys the complaint, pictures, video, item or history.

`Purchasing → Supplier Claims` is Purchasing's stock-claim Register for both doors, not a Case
work view. When a linked stock claim exists, the Case shows a read-only link to its progress.

**Customer execution belongs to the Case (owner ruling 2026-09-18).** The Case owns how Carres'
goods move with the customer: `Replace First` · `Collect First` · `Collect Defective Item` ·
`Exchange on Collection`. The Supplier Claim keeps only supplier-side results (repair,
replacement, return, refund) and shows the Case link. Neither record carries the other's picker.

### DOCUMENT DECISION AND PRINT CONTROL

The system derives documents from an approved outcome plus execution facts. Examples:

| Confirmed execution fact | Owning document/action |
|---|---|
| Customer goods physically return to Carres | Delivery Return / customer collection record |
| Replacement goods leave Carres | replacement Delivery Order |
| Customer money is reversed or compensated | Finance refund / credit record |
| Inspection, repair, packing or transport only | Work instruction; no stock/money document |

Supplier recovery is not derived automatically from a Case outcome. When the supplier must
answer, the Case opens one linked Supplier Claim (door 2); any Purchase Return, supplier
collection, repair or replacement receipt follows that claim's authorised stock-claim outcome, and
Finance owns any credit note. Customer remedy and supplier recovery are separate: an authorised customer
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
| **Case → linked Supplier Claim (door 2) and read-only progress** | APPROVED / NOT BUILT (owner rulings 2026-09-14 / 2026-09-18). When the supplier must answer, the Case opens one linked Supplier Claim from the Unit's verified source and reads its progress; it never approves or closes it. |
| **Customer execution words on the Case** | APPROVED / NOT BUILT (owner ruling 2026-09-18). `Replace First` · `Collect First` · `Collect Defective Item` · `Exchange on Collection` move from the Supplier Claim (built as layer ④, 0409) to the Case. |
| **`opened_at` becoming read-only after day one** | The deadline derives from it and the edit modal lets anyone change it, so moving `Opened` moves the deadline silently. Bounded today at one case. Approved fix: read-only, or log the change as an SLA event. |
| **A sweep for abandoned intake uploads** | Evidence uploads against a client-minted draft id land before the case exists — they must. An abandoned wizard orphans them. Approved fix is a `draft/` sweep, **not** a move-on-create: a mover adds a failure mode between *bytes uploaded* and *case filed*. |
