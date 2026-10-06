# CUSTOMER SERVICE — MASTER

> **BLUEPRINT / PLAN ONLY — consolidated 2026-10-06.** This is the one Customer Service
> Blueprint. Approved business rulings below bind the target; proposed lifecycle and presentation
> decisions are explicitly marked **PROPOSAL / NOT LAW**. A complete written recommendation is
> not owner approval, implementation evidence or permission to activate WhatsApp.
>
> Read §§3–4 for ownership and the end-to-end journey, §§5–12 for answer rules, §13 for hours and
> channel operation, §14 for the staff experience and §16 for acceptance and remaining decisions.
> No implementation Card, application change, migration or channel cutover is authorised here.
> Git holds history; replace obsolete text rather than adding another Customer Service document.

## 1 · Purpose

Customer Service is the communication layer over authoritative Carres ERP facts. The target is an
internal CARRES staff workspace using shared Communication and Tasks once the portal and WhatsApp
connection are ready and verified together. Until then, staff continue the current WhatsApp process;
they are not required to copy every enquiry into an unfinished portal. The approved response hours
remain the operating rule. There is no manual-first portal rollout requirement.

This is OWNER-APPROVED TARGET / NOT BUILT (2026-10-06), not approval to activate WhatsApp or cut over
live operations. Detailed enquiry lifecycle recommendations in §4 remain PROPOSAL / NOT LAW.

```text
Customer Service answers.
The owning ERP module decides.
```

Customer Service helps a customer understand the fact they are asking about. It never creates a
second Sales Order, Purchase Order, Receiving, Stock, Delivery, Payment, Guarantee or Service Case
truth. It never compresses those independent truths into one overall `Order Status`.

The same Sales Order may contain goods at different stages. The answer follows the actual item and
the actual question, not a generic order-level label.

The staff workspace remains useful after WhatsApp API is connected. All supported channels use the same
Customer Service logic and ownership laws; §13 defines the connection and rollout boundary.

## 2 · Ownership and boundary

Customer Service may own:

- customer-enquiry handling within the single shared Workspace communication surface;
- customer and order verification context;
- understanding and classifying the enquiry;
- customer-facing communication;
- the customer-enquiry handling record, including its identity and History, linked to shared conversation evidence;
- handover and escalation context.

Customer Service may read authoritative facts. Reading never transfers ownership or creates a
second writer.

| Customer asks about | Authoritative owner | Customer Service boundary |
|---|---|---|
| what was ordered | Sales Orders | explain the order and item facts; never edit them |
| supplier progress or supplier date | Purchasing | repeat the evidenced supplier fact; never turn it into a customer promise |
| whether goods physically arrived | Receiving | repeat the receipt fact; never record receipt |
| whether an exact item is physically available | Stock / Warehouse | repeat current Unit/availability truth; never reserve, release or move it |
| delivery contact, arrangement or result | Delivery | repeat the Delivery fact and link the responsible owner; never create or change the arrangement |
| money paid, outstanding, receipt or refund payment | Payment | repeat customer-money truth; never post, waive, refund or decide it |
| a customer-affecting problem and its outcome | Service Case | preserve the conversation and handover link; never decide or close the Case |
| warranty or service entitlement | Guarantee / Service Package, with the linked Service Case | explain authoritative terms and evaluated entitlement facts; never independently interpret eligibility or approve a claim |

Customer Service does **not** own:

- Sales Order truth;
- supplier ETA or supplier commitment;
- Goods Receipt or GRN truth;
- physical Stock or Unit truth;
- delivery appointment, Delivery Order, result or proof;
- payment, waiver, credit or refund;
- payment exception or payment-on-delivery approval;
- warranty eligibility, remedy or exception;
- Service Case decision, execution or closure.

## 3 · Authority, responsibilities and readiness

### 3.1 · Current authority chain

This consolidation reads the current main authorities (baseline `848ad3268`), not the older
planning branch's copies. Later readers use the current owning MASTER at each path.

| Responsibility | Canonical authority | Customer Service reads or hands over |
|---|---|---|
| Constitution and ownership | `CLAUDE.md`; `docs/ERP-ARCHITECTURE.md` | One owner, one result, no independent operational writer |
| Customer order | `docs/orders/MASTER.md` | Actual goods, customer request, governed amendments and money gate |
| Supplier / Receiving / Supplier Claim | `docs/purchasing/MASTER.md` | Supplier evidence, receipts, supplier claim links; no customer promise inferred |
| Physical goods | `docs/stock/MASTER.md` | Exact Unit, location, availability, movement evidence |
| Delivery | `docs/delivery/MASTER.md` | Scheduled delivery, optional time, contact and outcome evidence |
| Customer money | `docs/payment/MASTER.md` | Recorded money, outstanding, approved payment destinations, proof handling |
| Customer problem | `docs/service/MASTER.md`, especially §7 | Case intake, Service Duty, response obligations, approvals and remedy outcome |
| Entitlement | `docs/guarantee/MASTER.md`; `docs/rental/MASTER.md` where applicable | Actual item/agreement policy and evaluated entitlement |
| Duties and Work | `docs/workspace/MASTER.md` §§2–5; `docs/ACTION-FLOW-STANDARD.md` | Source-action admission, resolved assignment, cover, source result and due calendar |
| Presentation | `docs/ui/MASTER.md`; `docs/01-design-tokens.md`; `docs/02-components.md`; `docs/03-page-patterns.md` | Shared shell, kit, panel, Tasks/Calendar, search and History |
| Words | `docs/COPY-STANDARD.md` | Governed on-screen labels, dates, money; examples here do not admit new UI words |

No staff names are frozen here. Staff & Duties resolves the current holder and applicable cover.
Service's current §7.9 allocates routine Cases through Service Duty; helpers and Customer Service
reporters do not silently become Case owners. Service's substantive response and internal processing
clocks stay with Service. Its two-Office-working-day Case response is not the enquiry's one-hour
first response. Handover resets neither clock and opening a Case proves neither response nor remedy.

### 3.2 · Four-way resolution

| Classification | Current conclusion |
|---|---|
| **RESOLVED FROM AUTHORITY** | Source modules own their facts and business results; shared Work and Staff & Duties are reused; no fake SO, duplicate Case or second communication history. Approved answer, evidence, human-handover and response-hours rules are consolidated below. |
| **APPROVED TARGET / NOT BUILT** | Connected staff communication through shared Workspace/Tasks; pre-purchase enquiries; Customer Enquiry Duty for identification/first response/routing; captured evidence reuse; fixed out-of-hours acknowledgement. These are target capabilities, not a claim they exist. |
| **BUILT / VERIFIED** | Existing shared kit and Work foundations are governed in their owning MASTERs. This review verifies documentation compatibility only. No connected Customer Service journey, complete message history, enquiry Work projection or production channel is verified here. |
| **REAL GAP / CONTRADICTION** | Full enquiry grouping, accepted transfer, follow-through/closure/reopening policy and pre-task discovery placement need approval (§16). A source for a distinct Carres Promised Deadline cannot be inferred from Requested Delivery Date (§7). Connector, identity/access and recovery capabilities must be measured before rollout. |

### 3.3 · Source objects are different things

A **contact** is a person/channel identity, including someone who has never bought. An existing
customer account is linked only when matched and authorised. A **conversation** is captured
communication, not automatically an order or complaint. An **enquiry** is the handling context
for a question; its proposed grouping/completion policy is §4. A **task** is a source-owned
obligation projected into shared Work. A **Service Case** owns a customer problem and remedy.

These links do not convert one object into another. A phone match suggests a candidate, not proof
of identity, permission or the right to see another person's order. One conversation can concern
several orders or questions; one Case can link relevant messages without copying the conversation.

## 4 · Complete operating journey

### 4.1 · Status of this journey

**RECOMMENDED LIFECYCLE — PROPOSAL / NOT LAW.** The approved boundaries are §§1–3, 5–13.
The following fills the remaining lifecycle gaps as one reviewable recommendation. It does not
silently approve new Work admission, continuing-duty, closure or reopening policy. “Complete”,
“waiting” and “transfer” below describe business meaning, not approved new on-screen statuses.

### 4.2 · Receive, identify and organise

1. **Before rollout:** continue today's WhatsApp operation. No compulsory duplicate portal entry.
2. **After authorised rollout:** capture each real incoming message, sender/channel identity,
   receipt time, attachments and provider provenance. Preserve receipt independently of staff
   preview or enquiry grouping. Repeated delivery of the same provider event is not a new question.
3. **Find context:** authorised staff searches the actual contact and related records. A new
   enquirer can proceed without buying, without a customer account and without an SO or Case.
   Ambiguous identity stays unlinked until verified; request only the missing information.
4. **Group the question:** recommend one enquiry per customer question/outcome. Link additional
   messages about that question without restarting its due time. Keep different requests distinct
   and linked within the same conversation. Staff reviews ambiguity; phone equality never merges.
5. **Admit work:** a real enquiry requiring a reply supplies one source response obligation with
   identity, trigger, owner rule, resolved assignment, due/calendar, required result and exact
   source link. Customer Enquiry Duty resolves initial responsibility through Staff & Duties.
   Missing assignment stays visible to authorised oversight; it is not a healthy empty queue or
   automatic assignment to a manager. Unknown receipt time is explicit, never fabricated.

### 4.3 · Open, understand and reply

6. **Open the same work:** select its task through the shared rail or Workspace, or find the source
   conversation through the proposed discovery view (§14). Both open the same context and history.
7. **Read before asking:** review the actual question, previous replies and supplied evidence.
   Verify any related customer/order/item. Classify internally using §5; do not ask customers to
   choose a module or numbered menu.
8. **Check facts:** read the relevant owner under §§6–10. Show source/provenance and uncertainty.
   Preview and suggested text do not create a handled enquiry, send a message, create a Case or
   complete work. An already captured incoming message remains preserved even if preview is abandoned.
9. **Reply:** staff reviews the recipient, exact facts and text before sending through the connected
   channel. Record the actual actor/content/time and observed send outcome. Failure leaves the
   obligation open and input recoverable. Draft, Copy, internal note and fixed auto-acknowledgement
   do not count as human response. A meaningful “I am checking” reply can meet first response,
   but it leaves any promised check/customer update outstanding.

### 4.4 · Check, hand over and finish

10. **Answer directly when safe:** a factual information answer uses source facts; no unnecessary
    Case or operational task. Recommend finishing the enquiry when the evidenced answer leaves
    no promised check, update or required handover. Customer “thanks” is not required.
11. **If checking is needed:** recommend retaining customer-update accountability with Enquiry Duty
    until an accepted handover. Investigation uses the existing owning module's work. Do not create
    a second task for the same internal act. Record an actual promised customer-update time if one
    exists; otherwise recommend a visible undated obligation, not an invented deadline, hidden
    snooze or automatic inactivity closure. This follow-through rule still needs owner approval.
12. **If another owner must decide:** send the question, requested outcome, facts, evidence and
    previous response through its governed handover door. Reuse an existing Case/action where
    appropriate. Preserve the resulting destination link. Opening a page is not handover.
13. **Accept transfer:** recommend ending enquiry routing only when destination record/accountable
    handling are evidenced and the customer has been told what happens next. Failed/refused transfer
    retains enquiry responsibility. After accepted transfer, the destination owns its customer
    outcome; do not leave a duplicate enquiry-resolution task. Independent first-response evidence
    and every original due time remain intact. Service alone decides/finishes the Case.
14. **Record the result:** source evidence closes only the obligation it proves. Reply does not
    close Delivery, payment verification, a remedy or a Case. Customer withdrawal can end an enquiry
    with evidence; it never cancels an order, debt, delivery or Case by implication.
15. **Later messages:** recommend a new response occurrence on the same enquiry for a substantive
    same-topic reply; a new topic becomes a linked enquiry. Recommend the one-hour coverage rule for
    that new response occurrence, but this extension is **not yet approved**. Preserve completed
    history. Acknowledgement-only messages remain visible without another response task after staff
    review; ambiguity is never silently dismissed by AI.

### 4.5 · Manual evidence, identity and History

Staff may preserve relevant uncaptured calls or personal-channel communication with actual channel,
actor, time and evidence. Label it staff-recorded, not API-proven. This exception is not a manual-first
rollout requirement. Saving a real enquiry establishes handling context, not a sent reply.

Each saved enquiry has its own governed identity; no invented SO/PO prefix or second Case number.
Preview has no new permanent handling identity. Rechecking a saved enquiry continues that record.
Exact numbering uses Architecture's shared convention, resolved by engineering without a new
business interview. Unapproved visible labels still pass Copy/UI governance.

History is append-only and staff-attributed: receipt, actual reply, correction, assignment movement,
handover and related record links. Preserve original evidence and append correction rather than
silently rewriting what was said. Only proven automation is attributed to System. Current ERP
facts are read from their source; historical communication remains what was actually communicated.

## 5 · Initial enquiry families

The current internal planning classifications are:

1. My Order
2. Delivery
3. Payment
4. Product / Warranty
5. Problem After Delivery
6. Other Help / Human Handover

These classifications are internal. Customers speak normally. Customer Service must not force a
customer through a numbered menu or require them to know Carres module names.

Do not add, split or rename an enquiry family without a new owner ruling written into this MASTER.

## 6 · My Order answer law

Never answer `My Order` from one overall Sales Order status.

| The customer's actual question | Read from |
|---|---|
| What did I order? | Sales Orders |
| Has the supplier started or given a date? | Purchasing |
| Have the goods arrived? | Receiving |
| Are the goods physically available? | Stock / Warehouse |
| Has delivery been arranged? | Delivery |
| What have I paid or what is outstanding? | Payment |

Each item is explained separately when its facts differ.

```text
Item A may be ready.
Item B may still be with the supplier.
```

Customer Service must not reduce that answer to `Ready` or `Not Ready` for the whole order.

Every delivery-date question inside `My Order` follows §7. A supplier date may answer a supplier
progress question only as an evidenced supplier fact (§2), never as the customer's delivery date
or a Carres promise. Internal estimates, safety dates and workflow deadlines cannot supply a
customer delivery answer. The authoritative Promised Deadline and Logistics arrival estimate keep
their distinct meanings under §7.

## 7 · Delivery enquiries

### 7.1 · Delivery date truth — five facts, never interchangeable

Customer Service must distinguish:

| Fact | Owner and internal name | What Customer Service may say |
|---|---|---|
| **Requested / Preferred Date** | Sales Orders' `Requested Delivery Date`; Delivery preserves later contact/request evidence and follows the governed amendment path | acknowledge it; never call it a promise or a confirmed arrangement |
| **Promised Deadline** | an evidenced, distinct Carres commitment to complete delivery by that date; never alias Sales Orders' Requested Delivery Date | communicate it as a Carres commitment; never present it as a confirmed appointment |
| **Confirmed Delivery Appointment** | Delivery's authoritative `Scheduled delivery`, with supporting arrangement evidence | communicate it as confirmed |
| **Confirmed time / window** | Delivery's actual agreed time/window, when present | communicate it as arranged/confirmed |
| **Logistics estimated arrival time** | Logistics' ETA — an estimate that never rewrites the confirmed date/window | communicate it only as an estimate |

**Current authority conflict resolved by keeping the facts separate:** Orders explicitly bans
`Customer Delivery`, `Deliver By` and `Promised Delivery` as aliases for Requested Delivery Date.
The conceptual Promised Deadline ruling does not establish a present ERP field. Without distinct,
authorised commitment evidence, omit that answer; do not create a field or derive it from a request,
supplier date or estimate. Source ownership/admission of any new promise field needs Orders review.

Only authoritative Delivery truth may establish or replace a Confirmed Delivery Appointment.
Customer Service must never convert a Requested / Preferred Date into a promise or an appointment,
and never convert a Promised Deadline or an ETA into a confirmed appointment or time.

`Confirmed Delivery Appointment` is this Blueprint's document phrase for Delivery's confirmed
booking. On ERP screens the fact keeps Delivery's governed words (`Appointment` is not a screen
word under `docs/COPY-STANDARD.md`); customer-facing wording may say "confirmed".

### 7.2 · "When is my delivery?"

Answer from the strongest authoritative Delivery truth available:

1. **Confirmed appointment exists** — tell the customer the confirmed date, and the confirmed
   time/window if available.
   > Your delivery is confirmed for Saturday, 5 September.
2. **No confirmed appointment, but a Promised Deadline exists** — communicate the deadline without
   pretending it is an appointment.
   > Carres has promised to complete your delivery by 10 September. The delivery arrangement
   > still needs to be confirmed.
3. **Requested / Preferred Date only** — acknowledge the request; do not call it confirmed. Prefer
   helpful wording over unnecessarily highlighting negative status.
   > I can see you requested 5 September. Let me check the delivery arrangement for you.
4. **No safe authoritative answer** — pass the enquiry to Delivery. Never invent a date.

### 7.3 · Customer asks for a delivery date

Example: `Can deliver this Saturday?`

Customer Service may receive and pass the request. It may **not** confirm the requested date
itself — a customer request is not a confirmed Delivery appointment.

> Sure, I'll pass your request for Saturday to our delivery team to check.

### 7.4 · Change delivery date

Customer Service does **not** directly change a confirmed Delivery Appointment. Delivery owns
appointment truth. Customer Service may:

- receive the customer's requested new date;
- preserve the request;
- pass it to Delivery;
- communicate the authoritative result after Delivery decides.

If the confirmed appointment is Friday and the customer requests Saturday, Friday remains the
authoritative confirmed appointment until Delivery approves and establishes the replacement.
Customer Service must never silently remove or replace an existing appointment merely because the
customer requested another date. Customer self-service rescheduling remains deferred.

### 7.5 · Delivery arrival time

- **Confirmed time/window** — may be communicated as arranged/confirmed.
  > Your delivery is arranged for tomorrow between 2pm and 5pm.
- **Logistics estimated arrival time** — must remain an estimate. Never convert it into a Carres
  promise.
  > The estimated arrival time is around 3pm.
- **No authoritative time** — never invent or estimate one. Customer Service may ask the assigned
  logistics team to contact the customer and may provide the approved customer-facing logistics
  WhatsApp contact.
  > I'll ask our logistics team to contact you today about the timing. You can also WhatsApp them
  > here: [WhatsApp].

Use the actual authoritative date/window or estimate when applying these examples. `Today` contact
wording requires a supported request for contact that day; it is not a guarantee that Logistics
will call. Supply only the assigned team's approved customer-facing contact, never the placeholder.

### 7.6 · "Nobody contacted me" — delivery contact enquiry

Common real enquiries include:

- `Why nobody call me?`
- `Nobody contacted me about delivery.`
- `Who should I contact?`

A customer may ask well before or close to delivery. Read Delivery's current contact, booking
and escalation rules; do not copy a separate trigger or calculate a new Customer Service clock.
Logistics handles routine customer arrangement under Delivery authority; Carres handles the
specified exceptions. A changed Sales Order request follows the governed amendment path, distinct
from Delivery recording an agreed arrangement. Earlier-date requests require the owning modules'
actual readiness and amendment rules; never chase suppliers or promise readiness from this screen.

That operating knowledge does not automatically become customer-facing wording. Customer Service
must not tell the customer:

- `overdue`;
- `staff missed the deadline`;
- `logistics should already have called`;
- `SLA missed`;
- another internal workflow judgement.

The system may know more than it says.

Where the authoritative Delivery facts and a governed action show that help is required, Customer
Service does both:

1. give the assigned Logistics Partner's approved customer-facing WhatsApp contact so the customer
   can contact them directly; and
2. pass the enquiry and its context to the responsible Delivery / Logistics owner so Carres follows
   through and the Logistics side contacts the customer.

Giving a contact number never transfers Carres's responsibility to the customer. Customer Service
must make clear that Carres received the enquiry and is helping.

Illustrative wording for a genuine case requiring action today:

> I'll pass this to our logistics team and make sure they contact you today regarding your
> delivery. Here is their WhatsApp number too: [WhatsApp].

This sentence is an example, not a rigid template. It may be used only when the authoritative facts
and governed action support `today` and the approved contact belongs to the assigned Logistics
Partner. If those facts are absent, Customer Service must not guess a contact, deadline or promise.

## 8 · Payment enquiries

Payment / Finance owns money truth. Customer Service communicates authoritative Payment truth; it
does **not** create Payment truth. Payment owns the one governed outstanding arithmetic — Customer
Service must not independently calculate an authoritative balance from unrelated values.

### 8.1 · Outstanding balance

When authoritative Payment truth says the customer owes RM1,500:

> Your balance is RM1,500.

### 8.2 · Fully paid

Say payment is complete only when authoritative Payment truth establishes this.

> Your payment is complete. Thank you.

### 8.3 · Payment submitted but not verified

Do not describe a submitted payment as verified or complete.

> I can see your payment has been submitted. Let me get the team to check it for you.

### 8.4 · Payment proof

A payment slip, screenshot or customer statement that payment was made is **not** itself
authoritative proof that payment has been verified.

```text
Customer submits payment proof
→ preserve/attach the proof
→ Payment/Finance verifies
→ authoritative Payment truth changes
→ Customer Service communicates the result
```

**Payment proof ≠ verified payment.**

Customer-submitted proof, governed Payment recording and later bank matching are separate facts.
Under `docs/payment/MASTER.md` §§4 and 9, governed recording changes money truth; bank matching
later adds control evidence. Customer Service must not invent a second settlement/verification
gate or withhold an authoritative paid result merely because later bank matching is outstanding.

### 8.5 · Customer disputes payment status

Example: `I already paid. Why are you asking me to pay again?`

Do not argue with the customer. Do not continue automatically demanding payment when the customer
disputes the current status. Read authoritative Payment truth and, where verification is required:

> Sure, let me check the payment for you.

Route the verification to the correct Payment/Finance owner.

### 8.6 · Payment instructions

Customer Service must **never** invent, type from memory or modify:

- bank account number;
- bank account name;
- payment link;
- payment QR details;
- authoritative outstanding amount.

All payment instructions come from authoritative approved Payment configuration/truth. If a
governed payment link exists, Customer Service may send it. If approved bank-transfer details are
the governed payment method, Customer Service may send those authoritative details. Generative AI
is never allowed to generate financial destination details.

### 8.7 · Pay-later requests and the closed delivery exception

**Current authority wins:** Orders §8 closed new Delivery Payment Approval requests on
2026-09-01 and reaffirmed the closure on 2026-09-12. Customer Service must not offer, raise or
route a request through that retired approval door. Money in full before delivery remains the
current rule; a Finance exception is a separate blocker, not unpaid-delivery permission.

If the customer asks to pay after delivery or when goods arrive, preserve the request, explain
that payment is required before delivery, and offer help checking the authoritative balance or
payment instructions. A request to speak to a manager follows §11, without promising an exception
or reopening the closed route. Never say “No problem” or imply that asking creates approval.

Only an actual qualifying approval granted before the closure is honoured as historical source
truth under Orders' gate. Customer Service does not create one. For such a verified historical
arrangement only, the recorded terms require the full balance by online transfer before unloading;
no cash, no unloading on a screenshot alone, and unpaid goods return. Read the exact source record
before explaining these terms. They are not an offer available to new enquiries.

The older Customer Service draft's live exception-request flow conflicts with current Orders law
and is replaced here. Reopening that business policy would require an explicit new owner ruling
in Orders, not a Customer Service implementation choice.

## 9 · Customer-facing language

The staff workspace presents a **suggested reply** for staff assistance. Staff remains responsible for the
actual customer communication. Generation does not mean sent, and suggested wording does
not create authoritative truth. Use the source facts and the enquiry laws in §§6–11; uncertainty
requires clarification or handover, never a confident invented answer.

Customer Service English is:

- simple;
- short;
- friendly;
- professional;
- human;
- easy for customers with limited English to understand;
- never robotic.

Use one clear fact or action per sentence. Clarity matters more than sophisticated English. Prefer
helpful wording over unnecessarily highlighting negative status.

For a normal enquiry:

> Sure, I'll help you check.

Do not use a long formal apology or say `sorry` automatically. Say sorry when Carres genuinely
caused inconvenience or a service problem is confirmed.

Customer-facing communication must not:

- expose internal workflow words, deadlines or judgements;
- blame Carres staff, Logistics Partners or suppliers;
- expose unnecessary internal problems;
- describe an unsupported estimate as a promise;
- claim a message, call, reply, payment, delivery or other outcome that Carres did not observe;
- make unsupported promises.

Customer-facing copy and internal ERP truth are separate. The system may know more than it says.

The approved conversational examples here are not new ERP labels or financial formatting rules.
For example, a customer reply may say `Your balance is…`; the ERP field remains `Outstanding`.
Amounts always preserve the exact authoritative value, including any sen. Conversational
`today`/`tomorrow` refers to the actual date at the time of the reply; internal dates retain the
Copy Standard's governed spelling. Dates, amounts, warranty periods and contacts in examples are
illustrative, never default facts about a customer.

## 10 · Service Case, Product and Warranty boundary

Customer Service and Service Case are not two complaint systems.

- Customer Service owns the customer conversation and handover context.
- Service Case owns the parent customer-problem record, evidence, decisions, required follow-up,
  remedy journey and customer-confirmed closure.
- A linked Customer Service conversation must not become a duplicate Case timeline or editable Case
  status.

When an enquiry becomes a genuine product/service problem, open or reuse the governed Service
Case and link it to the enquiry. The enquiry does not transform into a second Case. Investigation,
evidence decisions, cause, remedy, warranty/entitlement decisions, replacement/refund decisions and
service resolution stay in the governed Service/Guarantee journey; Payment owns actual money.

### 10.1 · Problem After Delivery journey

Customer Service must distinguish normal information enquiries from customer problems requiring
Service Case handling. For a new product problem:

```text
Customer
→ identify customer / Sales Order / affected item
→ understand the problem
→ check for an existing Service Case
→ reuse the existing Case if present
→ otherwise collect only the minimum useful information/evidence
→ route/create through the governed Service Case process
```

Do not make customers repeat information already provided. If the customer already supplied the
problem description, photo or video, do not mechanically ask for it again.

Reuse the supplied evidence against Service's problem-specific checklist. Ask only for missing
required information; minimum useful evidence does not waive the governed intake requirements.

### 10.2 · Problem classification is not blame

Customer Service may classify incoming problems, such as:

- wrong item;
- missing item / part;
- damaged item;
- product defect;
- installation problem;
- other product problem.

Classification does **not** establish blame or root cause. Customer Service must not automatically
tell the customer that Carres, Warehouse, Logistics or a Supplier caused the problem unless
authoritative investigation establishes that fact and it is appropriate to communicate it.

### 10.3 · Warranty boundary

Customer Service may explain authoritative warranty terms.

> Your mattress has a 10-year warranty.

Use that example only when the affected item's authoritative terms establish ten years. It does
not replace the separate paid Mattress Guarantee or another item's policy. Read the applicable
item and terms version; Customer Service does not infer eligibility from a generic warranty period.

Warranty coverage information is **not** claim approval. Customer Service does not approve
warranty claims, replacement, refund or any remedy.

**Warranty coverage fact ≠ Claim approval.**

If approval or judgement is required, route to the governed Service Case owner.

### 10.4 · Existing Service Case updates

When a customer asks for an update about an existing problem, identify and reuse the existing
Service Case. Do not:

- create duplicate Cases unnecessarily;
- ask the customer to repeat the whole issue;
- invent generic statuses such as `processing` when the authoritative Service Case does not
  establish them.

Customer Service communicates authoritative Service Case progress. Service Case owns investigation
and decision truth.

### 10.5 · Refund / replacement requests

Customer Service may receive and preserve a refund or replacement request. It does **not** approve
the request, and it must not promise a refund, replacement timing or remedy without authoritative
approval.

> I understand. I'll pass your refund request to our team to review.

> I'll pass your replacement request to our team to check.

## 11 · Human Handover Law

Customer Service must hand over when:

- the customer explicitly asks for a human / manager;
- a decision requires authority Customer Service does not own;
- refund / replacement / exception approval is required;
- the system cannot safely determine the correct answer;
- human judgement is required.

### 11.1 · Human / manager request

If the customer explicitly asks to speak to a human or manager, hand over. Do not trap the
customer inside the automated assistant, and do not force the customer to justify why they want a
human before allowing handover.

> Sure. I'll pass this to our team for you.

### 11.2 · Unhappy customers

Customer emotion alone does not automatically require human handover. If Customer Service can
still safely resolve the enquiry within its authority, it may continue helping.

Customer: `Nobody called me! What kind of service is this?`

> I understand. I'll help you check this now.

If a genuine Carres service problem is confirmed, an appropriate simple apology may be used. Do
not argue with the customer or try to prove that Carres is right.

An explicit human request still requires §11.1 handover. A public/social escalation follows
the current Service MASTER's governed escalation route; it is a governed escalation fact, not emotion
alone, and it changes neither entitlement nor remedy approval.

### 11.3 · Preserve context

Human handover must preserve relevant context, including where available:

- customer identity;
- Sales Order;
- affected item;
- the conversation;
- the problem description;
- photos/videos/evidence already supplied;
- the existing Service Case;
- the customer's requested outcome;
- relevant Delivery / Payment / Service facts;
- what Customer Service has already told the customer.

Do not make the customer start again. A human receiving the handover should be able to understand
the problem without asking `How can I help you?` when the customer has already explained it.

## 12 · Customer reply and internal action are separate

A helpful reply does not prove that Carres completed the internal work.

When ERP facts require human action, the owning module supplies the shared Work Engine contract:

```text
TRIGGER
OWNER RULE
RESOLVED OWNER
ACTION
CHECKLIST / REQUIRED RESULT
COMPLETION FACT
DUE AND GOVERNING CALENDAR
SOURCE OBJECT
COVER RULE
AUTHORITATIVE DEEP LINK
```

Customer Service may pass the conversation and handover context into that governed action. It does
not create a parallel Customer Service task engine, generic `Follow up`, manual `Done` tick or
second completion fact.

If the full action contract has not been approved, Customer Service may preserve the handover
context but must not invent a system action, owner or deadline. The owning module remains responsible
for defining what closes the work.

In the connected target, a Delivery enquiry requiring action links/passes context to governed Delivery work;
payment verification goes to Payment/Finance through its existing governed process; a product
problem goes through Service Case intake. Reuse existing operational actions where applicable,
not another action for the same obligation. Payment verification does not invent a second
settlement task or gate (§8.4).

The staff handler is the person who performed Customer Service handling, not a new universal
operational owner. A handover records only the actual pass and its target/context. Opening a
module link or previewing a proposed handover does not prove the pass occurred. The governed handover must carry the enquiry context into the governed destination and preserve the resulting link.

Do not add `Logistics contacted customer = Yes/No` or similar Customer Service completion fields.
After Delivery records contact, Customer Service may read/show its authoritative result and link.
Recording a Customer Service reply or handover never closes Delivery, Payment or Service Work.

**Customer Service History records conversation and handling. It links to operational work;
it does not duplicate operational truth.**

## 13 · Connected channel, response hours and rollout

### 13.1 · What enters the shared workspace

**APPROVED TARGET / NOT BUILT.** The connected Carres customer-service WhatsApp number supplies
incoming customer communication, including pre-purchase enquiries. The source is not the Service
Case register. Ordinary order, delivery and payment questions need no Case. A problem links the
governed Case and preserves context without duplicating it.

Authorised staff can continue captured conversation history, actual replies and attachments.
This means permission-controlled shared history, not unrestricted access for every employee.
Captured evidence is linked to the relevant record; no screenshot and re-upload is required.
Uncaptured personal chats/calls remain staff-recorded evidence. Connection does not promise all
historical chats, all personal accounts, retention forever, or provider delivery/read receipts.
Actual supported history and provenance must be verified at integration.

AI may assist classification, summary, translation and reply drafting using permitted facts,
with staff review. It may not approve money/remedies, invent dates or destinations, silently merge
identities, dismiss uncertain messages or send unrestricted autonomous customer replies. Fixed
availability acknowledgements below are a distinct approved target, not generative AI discretion.

### 13.2 · Approved first-response clock

**OWNER-APPROVED TARGET; current operating rule, automation not verified.** Response coverage is
Monday–Friday excluding the governed Operations Office public holidays, in Malaysia local time:
**10:00–13:00 and 14:00–18:00**. Lunch **13:00–14:00 has no cover**. Flexible staff arrival does not
start the public response clock before 10:00. One working hour is 60 covered minutes from actual
receipt, carrying elapsed minutes across lunch, closing, weekends and holidays.

| Message received | First human response due |
|---|---|
| Working day 10:00 | 11:00 that day |
| Working day 12:40 | 14:40 that day |
| Working day 13:30 | 15:00 that day |
| Working day 17:40 | 10:40 next working day |
| At/after 18:00, weekend or holiday | 11:00 next working morning |
| Before 10:00 on a working day | 11:00 that day |

More messages, reassignment, cover or handover do not reset the original first-response due time.
An already overdue response remains overdue. A meaningful staff reply saying the team is checking
meets first response, but not final resolution or an outstanding promised update. Case clocks and
module deadlines remain distinct. Extending this clock to every later substantive reply remains
proposed (§4.4), not silently included in this approved first-response rule.

### 13.3 · Fixed availability acknowledgements

**APPROVED TARGET / NOT ACTIVATED.** Once the channel and automation are separately authorised,
use truthful fixed wording. Do not imply a human is presently investigating.

Lunch on an actual working day:
> Thanks for your message. Our team is on lunch break from 1–2 pm. We’ll return at 2 pm and reply within one working hour after that.

Outside response hours:
> Thanks for your message. Our response hours are 10 am–6 pm, Monday–Friday, excluding public holidays. We’ll reply within one working hour after our response hours resume.

Send at most once per conversation per lunch day, or per continuous closed interval for after-hours;
not on every message. Use the holiday/weekend condition instead of promising a 2 pm return on a
closed day. Never replace an earlier, tighter outstanding deadline with the generic acknowledgement.
Automatic acknowledgement is recorded as automatic and does not satisfy first human response,
reset due time, claim staff action or close any work.

### 13.4 · Launch boundary and failure recovery

`Current WhatsApp operation → portal and connection verified together → explicit authorised rollout`

No mandatory manual portal duplication while preparing. No need to wait for every ERP module to
finish: a source capability is usable when its relevant read/handover/result contract is verified.
An unavailable owner connection shows the limitation and preserves accountable handling; it never
manufactures a status, answer or completed transfer. Customer Service itself cannot roll out until
incoming messages, staff replies, media/history, permissions, identity and shared Work are proven
end to end. Simulated inboxes do not satisfy this boundary.

Connection outage, partial attachment capture, failed send, uncertain send outcome and delayed
receipt must be visible. Preserve input and original timestamps; do not falsely show sent or an
empty healthy queue. Recovery must avoid duplicate sends, messages and obligations. Engineering
must prove safe recovery and the existing-channel continuity procedure before cutover. No planning
approval authorises account setup, external messages, production activation or retirement of the
current channel. No new retention/deletion policy or historical import is approved here.

## 14 · Staff experience and cross-module handoff

### 14.1 · Approved shared interaction and recommended discovery

**APPROVED TARGET:** right-rail Tasks and Workspace's personal/team work expose the same source
obligation. Select it → shared working panel → review communication and facts → reply or use the
owning result door. There is one communication source, composer context and task result, not a
Customer Service page competing with another WhatsApp inbox.

**RECOMMENDED PRESENTATION / NOT LAW:** place permission-filtered conversation/enquiry discovery
inside Workspace, opening the same working panel. It finds received messages and historical records
before or without a task. Search supports contact, enquiry identity and authorised linked order/Case;
no fake SO is needed. A non-actionable history result must not masquerade as personal work.

Workspace and shared UI task reviews on 2026-10-06 support this recommendation. Their reviews are
coordination evidence, not Jess's approval of exact layout. Reuse the current kit, shared object
identity and source-host contract. Existing Work/compact-card foundations are not proof that a
complete enquiry host, media viewer or connected conversation already exists.

Keep the actual contact/enquiry identity prominent. Show the question and conversation, relevant
read-only source context, outstanding customer obligation and the authorised action. Do not add
customer tabs, copy the SO tab set or put a duplicate Order Route writer here. A useful existing
Order Route may be shown read-only or linked for the selected SO, preserving its source and return
context. Non-buyers have no order route to fabricate. Internal notes must be visibly distinct from
customer messages; provider reply and private team discussion cannot share an ambiguous send action.

Preserve search, selection, scroll, exact source task and unsent input when opening/returning from
an owner record. Selecting a discovery row must not silently replace active task work. Do not stack
a page working panel over the global Tasks panel. Calendar remains quickly accessible. Shared UI
owns the final composition, responsive behaviour, focus/accessibility and admission of missing
components; exact new labels require Copy approval. Do not improvise local kit variants.

Alternatives considered: putting history in Tasks hides the distinction between records and work;
a standalone Communications destination adds another navigation surface. Workspace discovery best
fits the approved one-flow direction, at the cost of a clear record/work switch. Reject this design
if staff cannot find a received enquiry without manufacturing a task or losing active work.

### 14.2 · Morning-to-close operator journey

| Moment | What staff does | What the system must make clear |
|---|---|---|
| Start at 10:00 | Open assigned work; review carry-over, overdue and new enquiries | Original due times, actual assignment, existing context; no fresh clock for overnight carry-over |
| During coverage | Select enquiry; read evidence; answer or route; retain unfinished customer commitment | Actual reply versus draft/automatic acknowledgement; source owner and outstanding result |
| Lunch 13:00–14:00 | No covering staff are assumed | Coverage pauses; fixed acknowledgement only after activation; preserved elapsed minutes |
| Return at 14:00 | Handle outstanding work by actual due/urgency | 12:40 enquiry is due 14:40; lunch arrivals can be due 15:00 |
| Handover/absence | Use shared assignment and governed destination | Current responsible person plus actual actors; no second cover list or reset |
| Before 18:00 | Finish due replies, check promised updates and unaccepted handovers | Unfinished obligations remain visible; sending a holding reply does not erase the work |
| Next working day | Resume retained context and original deadlines | Holiday-aware calendar, preserved customer commitments and failure indicators |

### 14.3 · Module-by-module contract

| Owner | Input from communication | Owning action/result returned | Boundary |
|---|---|---|---|
| Sales Orders | Actual enquiry, verified order/item, requested change | Governed order/amendment or quotation response | Never edit the SO or create a fake buyer from chat |
| Purchasing / Receiving | Exact relevant goods and question | Supplier/receipt evidence, approved source work | Supplier answer is not a customer delivery promise; Supplier Claims remain Purchasing-owned |
| Stock | Exact item/Unit context | Physical availability/condition/movement evidence | No inferred receipt, reservation or release |
| Delivery | Contact/date request, missed contact or delivery issue, existing arrangement | Governed contact/schedule/result evidence | Customer request does not replace Scheduled delivery; no new contact clock |
| Payment | Proof/dispute/request and authorised customer/order link | Governed recording/verification/approval result | No duplicate balance, financial destination or release gate |
| Service / Guarantee | Problem, requested remedy, existing Case, item and captured evidence | Accepted Case handling, evaluated entitlement, approved remedy, communication and closure | Service Duty owns Case; formal approvals stay there; Case clock is separate |
| Workspace / Staff & Duties | Enquiry action contract, actual receipt/result evidence | One assignment/cover projection and exact source door | No independent CS task engine, roster or generic Done |
| Shared UI | Contact/enquiry identity, permitted source context and actions | Shared host, Tasks/Calendar and navigation grammar | Discovery proposal needs consolidated review; no SO-only host assumption |

A build chat must read the relevant owning source before implementing a seam. A missing connection
is an implementation dependency; it does not reopen approved business law. If source rules actually
conflict, record the precise conflict and retain safe handling rather than choose a convenient
second writer. Module build chats can align these contracts now; the channel launch remains gated.

### 14.4 · Settings, permissions and reporting

Use existing global Staff & Duties, People eligibility, source permissions, Operations Office
calendar and approved Payment configuration. Do not add Customer Service staff lists, financial
settings, holiday calendars or operational approval roles. Channel configuration remains an
integration capability needing authorised administration and verified recovery, not a public
customer control. This Blueprint grants no new role permissions.

Search, history, attachment access, linked records, suggestions and any export must all respect the
same source permissions; read access never grants operational write authority. Restricted data must
not leak through snippets, counts or AI context. Customer identity verification cannot be replaced
by phone matching. Existing controls apply; unresolved channel-specific verification, retention and
access coverage must be assessed before live disclosure, without inventing a new policy here.

Recommend operational review of unanswered/overdue work and actual first-response evidence through
shared Work. Do not lead with decorative dashboards or AI answered percentages. No separate bulk
messaging, conversation export, advanced analytics or data-retention/deletion capability is approved.
Any later report must distinguish automatic acknowledgements, human response and final outcome.

### 14.5 · Reference-to-Carres capability matrix

References provide patterns, not Carres authority. The supplied KirriDesk screenshots were visual
examples only; their backend, access and merge semantics were not verified.

| Reference capability | Carres equivalent / owner | Decision and reason | Dependency/conflict |
|---|---|---|---|
| KirriDesk conversation plus contextual record | Shared working panel / Workspace | ADAPT: see question and source facts without repeated searching | Exact host/discovery composition still proposed |
| KirriDesk AI reply editor | Staff-reviewed suggestions / CS | ADAPT: drafting, never authority or automatic remedy | Permitted facts, source freshness, actual-send evidence |
| KirriDesk customer preview | Contact/enquiry context | ADAPT: include non-buyers without fake customer/SO | Identity matching and access proof |
| KirriDesk private team discussion | Governed internal notes and handover | ADAPT: preserve context, separate internal/customer audience | Shared composer/permissions; no second task engine |
| KirriDesk merge tickets | Source grouping and Case duplicate checks | REJECT blind merge: same phone is not same question/person/Case | Proposed grouping; no destructive merge approved |
| KirriDesk call popup | Manual record of uncaptured call | DEFER integrated telephony; retain honest call evidence | No phone integration commissioned |
| Intercom unresolved versus closed conversation | Enquiry obligation versus response | ADAPT proposed evidence-based completion, no inactivity closure | Owner approval of §4 |
| Intercom reopening / Zendesk linked follow-up | Preserved history plus new response occurrence | ADAPT proposed substantive follow-up; avoid rewriting completed facts | Later-response clock extension awaits approval |

Sources reviewed: [Intercom closure](https://www.intercom.com/help/en/articles/8363763-close-a-conversation),
[Intercom later replies](https://www.intercom.com/help/en/articles/3449698-prevent-replies-after-you-close-a-conversation),
[Zendesk follow-up tickets](https://support.zendesk.com/hc/en-us/articles/8421655952026-Understanding-follow-up-tickets),
[Intercom internal notes](https://www.intercom.com/help/en/articles/6525765-loop-teammates-or-teams-into-conversations).
No provider-specific WhatsApp feature or historical import is established by these references.

## 15 · Intentional rejects and deferred capabilities

Reject duplicate WhatsApp inboxes, task engines, owners, operational writers and complaint systems;
fake overall Order Status, customers or SOs; silent identity/Case merge; mandatory manual portal
re-entry before connection; treating Copy/draft/auto-acknowledgement as human response; guessed
dates, bank details, balances, entitlement or remedy; blame, internal workflow judgement and
numbered customer menus; screenshots of evidence already captured; generic Done that bypasses a
source result; automatic closure of unresolved work or resets of original due times.

Customer-facing portal/web chat, autonomous AI replies, self-service delivery rescheduling,
telephony, live driver tracking, bulk messaging and advanced analytics remain deferred. A channel
connection alone authorises none of them. This PLAN work creates no implementation Card, code,
API, schema or live-operation change.

## 16 · Review, acceptance and handoff boundary

### 16.1 · What a build chat must not re-ask

Shared communication/Tasks, non-buyer enquiries, source ownership, captured evidence reuse,
human handover, initial Customer Enquiry Duty, one-hour first response, 10:00 start, uncovered
lunch, five working days/public holidays and connected-rollout prerequisite are approved targets.
Do not reopen these because an API or screen is missing. Do not repeat business interviews for
frameworks, numbering mechanics, source wiring or existing kit usage.

### 16.2 · Remaining review decisions and dependencies

| Item | Status / next responsible action |
|---|---|
| Grouping, ongoing customer-update accountability, accepted transfer, evidence-based enquiry closure and later-message handling | **Complete recommendation in §4 / NOT LAW.** Owner reviews this coherent lifecycle; it is not approved by the instruction to write a Blueprint. |
| One-hour rule for later substantive replies | **PROPOSAL.** Existing approval covers first response; extension needs explicit business approval. |
| Discovery within Workspace and final enquiry host | **RECOMMENDED / NOT LAW.** Workspace/UI reviews support the direction; shared UI consolidates the owner-reviewable presentation and governed copy. No second communications page is authorised. |
| Pay-later exception requests | **CONFLICT RESOLVED by current Orders authority (§8.7).** No new unpaid-delivery approval route; historical qualifying approvals only. The older CS request-for-approval flow is not incorporated as current law. |
| Distinct Promised Deadline source | **AUTHORITY GAP.** Preserve conceptual commitment; Orders owns any new source admission. Never alias current Requested Delivery Date. Safe answers can omit an unsupported promise. |
| Channel/history/media/send recovery, source enquiry action/result, access and identity coverage | **UNVERIFIED DEPENDENCIES.** Measure and prove before rollout; no fake connection or invented access/retention rules. Escalate only a genuine new business-policy gap. |
| Service owner/Case response/approvals | **RESOLVED from current Service §7.** Verify integration; do not interview the owner again or apply enquiry rules to Case completion. |

The complete recommendation is written; **PLAN MISSION COMPLETE is not claimed while the named
lifecycle/presentation decisions remain unapproved.** This document is the review and coordination
source now. No Card is ready merely because the prose is complete. After owner approval, overwrite
these proposal labels and remaining decisions in this same MASTER, then hand the approved scope to
an explicit BUILD/DELIVERY takeover. Planning approval alone never starts application work.

### 16.3 · Acceptance examples for review and later delivery

| Scenario | Required observable result |
|---|---|
| Unknown person asks a product question | Found and handled without fabricated SO, customer account or Case; approved product facts only |
| One order has items at different stages | Item-specific facts from their owners, no single misleading Ready label |
| Requested date only / supplier ETA / missing appointment | No invented promise or scheduled delivery |
| Enquiry at 12:40, 13:30, 17:40 or on holiday | Due times match §13; reassignment/additional messages preserve elapsed minutes |
| Lunch/after-hours acknowledgement | Correct once-per-interval automatic message; human response still outstanding |
| Staff sends a holding reply | First response evidenced; promised check remains visible under approved lifecycle, once approved |
| Customer supplied proof or photos | Reuse capture without repeat upload; payment/entitlement unchanged until owner result |
| Case already exists | Preserve Case/evidence/context; no second complaint or duplicate operational task |
| Handover fails or is refused | No false accepted transfer or ownerless customer outcome |
| Accepted Service handover | Exact destination and accountable handling; enquiry and Case clocks remain separate |
| Final answer, withdrawal, later question or thanks | Preserve history and apply only the lifecycle rules once approved; no implied order/Case cancellation |
| Duplicate event, concurrent handling, uncertain send or outage | No duplicate obligation/send or false success; original input and receipt provenance recoverable |
| Restricted user searches, opens attachment or reads suggestion | No disclosure beyond source permissions, including snippets and related identities |
| Staff leaves task for source record and returns | Exact context/draft retained, no stacked work panels or silent task replacement |

### 16.4 · Publication versus product deployment

Publishing this MASTER and its authority pointers makes current decisions discoverable to other
chats. It does not establish a working Customer Service page, connected WhatsApp or live automatic
reply. Runtime launch needs the explicit build lane, verified acceptance above and separate
cutover authorisation. Documentation publication must report its actual Git/PR result and never
claim production feature verification from a documentation-only change.
