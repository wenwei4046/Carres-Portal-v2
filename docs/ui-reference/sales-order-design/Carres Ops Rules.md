# Carres Operations — Ops Rules
Last updated: 8 Oct 2026 · agreed with Jess (COO). This file always shows the current rules only (old versions are removed, not kept). Numbers marked (Settings) can be changed by Jess (COO).

## 1. Mission
- The system monitors every order against the **customer requested delivery date**.
- We never promise a delivery date to the customer and never tell the customer whether goods have arrived. Delivery questions go to logistics.
- Every staff member can help any order; one person owns each job.

## 2. Where things live
| Place | Answers | Time |
|---|---|---|
| Workspace (home) | What to do today, what is stuck, team today | Today |
| Module Summary panel | How this module is doing | This month |
| Reports (own menu item) | Is the company improving | Month · Quarter · Year · 2 years · 5 years |
| Tasks (right panel, every page) | My jobs, log a call/WhatsApp | Today + next working day |
- Module Summary numbers link to the matching Reports view; same data.

## 2a. Module design scope (scope only; not all approved or built)
| Module | Design | Settings holds |
|---|---|---|
| Dashboard | Company / operations focus, exception summary, links into the related work | Metric definitions and display range (to check) |
| Workspace / Tasks | Today's tasks, whole-team work, owner, due, cover, steps and proof, reason not finished | Staff duties, rota, dispatch, cover, check times |
| Showroom | Stock at each location, Display / Consignment links, requests, moves, history | Location data and links to rules; purchasing rules stay in Purchasing |
| Sales Orders | List, order detail, amendment / history, Order Route, linked documents and problems | Does not repeat Sales Portal order settings; operating rules link to the owning module |
| Purchasing | SO Batch Purchase, Manual Purchase, PO, supplier reply, Receiving, Supplier Claim, Return, Repair | Order windows, supplier calendar, production lead time, safety days, purchase approval |
| Warehouse | Stock, unit / quantity goods, availability, reservation, location, in / out, handover, transfer, problem goods | Warehouse / location, stock and handover rules |
| Payments | Outstanding, chasing, payment records, Receipt / Invoice, storage fee, duplicate / overpayment, approval and hold status | Chasing deadlines, storage fee, related approval and notification rules |
| Delivery | Assign logistics, agree date, multi-leg / multi-trip, DO, pickup handover, delivery result, photo review, failed / redelivery, loan | Partner coverage, working days, check deadlines, proof and route rules |
| Customer Care | Customer enquiry intake, Service Case, proof, owner, due, decision, arrangement, close / reopen | Enquiry and case clocks, handling playbook, approval eligibility; open items listed separately |
| Issue Tracker | Cross-module incidents, linked records, responsible party, investigation, next step, cost and resolution proof | Severity, routing and handling rules; nothing new where the source is undecided |
| Reports | Overview, operations, suppliers, logistics, team, problems and money: totals, comparisons, links to detail | Metric definitions, data range, view / export permission (each to be settled) |
| Suppliers | Supplier details, contacts, address, supply / pickup method, related PO / Claim / performance | Each supplier's own lead time, calendar and details; shared purchasing rules not repeated |
| Catalog | Products, models, specs, categories, prices and add-on services | Product and price rules; full permission and scope still to check |
- Settings is one sidebar entry with 12 sections: Company · Office · Team · Workspace / Tasks · Sales Orders · Purchasing · Warehouse · Payments · Delivery · Customer Care · Issue Tracker · Reports. No separate Settings sections for Approvers (qualifications and holders in Team; decisions stay in their module), Journey (each rule in its owning module; Order Route reads it), Showroom (links to Warehouse and Purchasing), Suppliers (uses Purchasing supplier configuration), Dashboard (reads Reports definitions), Catalog (owns product master data; settings scope to check) and Subscription (deferred). This is the structure proposal with confirmed defaults, not approval of every policy or proof of build.
- Settings is the single place to maintain the rules above, not another business module. Settings access: Jess (COO) changes settings and may give other staff access to named areas only (e.g. Office, Team, Purchasing, Delivery). Only people with access can change; others keep viewing as before. Each grant records who gave it, the area and when it starts; removing access keeps the history. Every change records the person who made it. Every change records old → new, who and when; no reason is asked. Access to settings is not approval power (refunds, fee waivers and other approvals follow their own rules). Team and Approvers are people, duty and permission set-up inside Settings, not side-menu modules.
- Current focus: Workspace / Tasks dispatch list + Sales Orders design scope. Other modules stay on this list and are not expanded yet.

## 3. Sales Orders
- Keeps the original order from Sales Portal; answers "where is this order now?". Lookup only; work is done in Tasks or in the owning module.
- List tabs: Open · Delivered · All. Column views: Sales Order · Overview · Payment · Stock · Warehouse · Delivery; each view shows that module's document numbers (PO, Supplier DO, GRN, DO, Receipt).
- Order detail tabs: **Sales Order · Order Route · Timeline**.
- Sales Order = original purchase; never changed by extras. Extras (disposal, storage) are billed on a new invoice by Payments.
- Customer details change only through **Request amendment** (section 9).

## 4. Journey (per Sales Order)
Who each module deals with: Purchasing → supplier (PO Duty chases) · Warehouse → supplier goods in, GRN, Supplier Claim / Issue · Payments → customer (full payment, storage fee) · Delivery → logistics (logistics talks to the customer; we chase logistics only). Operation talks to the customer through the Sales Order, only for postpone / storage fee and the exceptions set in §5.
| # | Step | Module | Who acts | Due |
|---|---|---|---|---|
| 1 | Order proceeded | Sales Orders | System | D0 = Proceed Date |
| 2 | PO placed | Purchasing | PO Duty | Only for an eligible purchase need, inside the order window (Settings → Purchasing); not every SO on D0 |
| 3 | Logistics assigned | Delivery | Us | Opens the day the PO is sent (stock, no PO: the day the order enters Operations). Due read from Settings → Delivery (value to check) |
| 4 | Supplier delivers | Purchasing | Supplier (we chase) | PO date + supplier production days in working days, no Sunday (Settings, per supplier, default 14). This is the PO Delivery Date; every screen uses it until the supplier gives a new ETA |
| 5 | Goods received (GRN); problems → Supplier Claim / Issue | Warehouse | Warehouse (we chase) | Supplier delivery date |
| 6 | Early delivery offer (optional) | Delivery | Logistics | When stock ready |
| 7 | Logistics calls customer, agrees date | Delivery | Logistics (we only chase logistics) | Requested date − 3 days |
| 8 | Full payment (balance + storage + extras) | Payments | Customer (we chase) | Chasing starts only when there is an amount due + Customer confirmed delivery date + goods ready or a reliable arrival expected. Normal route: chase from 3 working days before delivery, paid in full 2 working days before (Settings, rule in effect). Out-of-town orders use their own rule. Not cleared → loading blocked |
| 9 | Delivery Order issued | Delivery | Operation | Needs goods in + paid + agreed date. Logistics collects it the day before |
| 10 | Delivered + photo | Delivery | Logistics | Agreed date |
- Supplier on time is judged only against the supplier deadline (PO date + production days), never against the customer date. Goods card shows PO date · Production · Deadline · New ETA (if supplier gave one) · Actual (date + GRN) · Result. States: Waiting ("n days left") · Late, not arrived ("n days late", task Chase supplier) · Late with new ETA (original deadline kept, still counted late) · On time ("n days early" or on the day) · Received late ("n days late", counted in Reports → Suppliers). Reference: `Supplier Date Proposal.dc.html`.
- Supplier late is chased by PO Duty. 1 Office working day before the expected arrival, PO Duty asks the supplier for the Supplier DO or a confirmation.
- Pillow and mattress protector come from warehouse stock (no PO). They show as Reserved. If out of stock: "Waiting for stock · next shipment …", then sent by courier to the customer when stock arrives (separate from the main delivery). Courier stock items: due within 3 working days (Settings → Journey → Courier stock items; Delivery & warehouse working-day calendar; authorised staff only, every change logged), counted from when the warehouse confirms the items are received, checked and ready to pack. Warehouse staff pack and hand to the courier; the order's Operations owner arranges and follows up. Small quantities go as soon as possible; larger ones may go in batches, each batch recording quantity, tracking no. and proof; anything not yet sent stays shown. Done = every quantity due has been handed to the courier (customer receipt is followed up separately). If the warehouse expects to miss the deadline it records an expected date; when the deadline passes the system gives the order owner a follow-up task, never a silent extension. Tasks and Order Route read the same setting. No daily capacity is set.
- A supplier delay notice is logged as a new contact (Production / Shipping delay + new ETA); the old record is not changed. The Goods card shows Deadline and New ETA; late is judged against the deadline only.
- Global search finds an order by SO no., customer, PO no. or supplier name (suppliers quote their PO). A PO result opens the order on Order Route.
- Today the DO PDF is made by staff and put in Drive; later logistics enters the agreed date and downloads the DO in its portal.

## 5. Requested date, postpone, not delivered
- Date words (every module, same words): **Customer original delivery date** (date the customer asked for at order; never changes) · **Customer new delivery date** (latest date after a postpone, shown as "Thu, 22 Oct (2nd change)"; every change with who, when, why is in Timeline) · **Customer confirmed delivery date** (logistics and customer both agreed) · **Delivered**. The word "Planned" is not used; before confirmation write "Not confirmed yet".
- Confirmed = logistics called the customer and the customer agreed. "Waiting customer reply" from logistics is recorded as a status, not a confirmation.
- Logistics' job: call the customer for the customer delivery date and report the answer. If the customer wants to change the date, logistics must give the reason; Operation records it and follows up with the customer based on that answer (postpone rules below: a new date is required).
- Chase SOP (Operation always chases; logistics will not record by itself; we never ask the customer whether logistics called). Example delivery Thu 15 Oct:
  - D−3 (Mon 12): no Customer confirmed delivery date → task "Chase logistics · no confirmed date". Logistics says waiting for customer → record "Waiting customer reply".
  - D−2 (Tue 13): still none → chase again (2nd).
  - Once there is a Customer confirmed delivery date, chasing stops.
  - Days in Settings → Journey: Chase logistics from (3). What happens at D−1 and later with still no confirmed date has no approved rule yet (§15).
- Full payment is due 2 working days before delivery (normal route) because logistics routes and collects the DO the day before. A recorded payment is not done: the amount still to collect must be checked and be zero.
- Later (planned): Carres schedules the date itself and assigns the order to any logistics.
- Order Route shows Customer original delivery date (or Customer new delivery date) and Customer confirmed delivery date beside it with the difference ("1 day later", amber; "Same", green). Before it is confirmed it says "Not confirmed yet".
- Logistics reports a postpone with the reason and the date the customer wants, then the order passes to Operation. Logistics never talks about storage fee; Operation talks to the customer.
- When the date the customer wants is past the free period (section 12), the system shows the storage breakdown for that date (start date · day n · free until · automatic / approved · fee · calculated up to), so Operation tells the customer before the date is recorded. Operation records and requests only; it never approves money.
- Customer postpones: a new date is required. If none yet, record "Postponed, no date yet" → task "Follow up new date · tell storage fee", due within 2 working days, stays until a date is recorded.
- Postponed with a date: the new date becomes the monitored date (D−3 call from it). Storage start date follows section 12.
- Date passed and not delivered: next morning task "Ask logistics why SO-xxxx is not delivered". Never call the customer for our internal follow-up.
- Logistics trust level (Settings, per partner): Trusted / Check. Check partners must attach proof when they report "customer postponed". (Agreed date later than requested: warning thresholds not yet decided.)

## 6. Tasks and team
- Jobs come only from Journey due dates or logged events. No manual to-do list.
- One owner per job, assigned by the system (auto share). Anyone can see every job and its owner.
- **Take over:** any staff can take any job, no approval; old owner gets a 🔔 note; Timeline records it. Jess (COO) can also move a job.
- Auto share: new orders shared equally among staff working today. Leave already recorded (MC, off) → no question; jobs go straight to a working, allowed cover with no leave.
- Attendance check runs by itself at 10:00 AM and 2:01 PM (Settings → Team), per person, not per job. At a check time, no activity and no leave record → the system asks a working colleague once, before anything moves: "Is X working today? The system saw no activity." Working, busy or out → jobs stay with X, confirmation recorded · Not working → all X's unfinished jobs that need cover go to that colleague in one go (jobs they may not own follow the cover order) · Not sure → "Attendance pending", reminder, asked again at the next check, nothing moves. No activity alone never counts as not working. Moved jobs appear in the cover person's Tasks at once; no taking or OK needed. No one working and allowed → Unassigned + reminder to Jess (COO).
- Company (Settings → Company): name Carres · brands / billing companies Carres · 2990 · country Malaysia · time zone GMT+8 · customer contact Carres Support Team, 011-6133 8862. All times 12-hour with AM / PM.
- Receiving bank accounts (Settings → Payments, from current ERP): Dealer order → RHB, CARRES SDN BHD 26219 3000 29076 · PJ own-showroom order → Hong Leong Bank, CARRES SDN BHD 177-003-23633. The bank follows the order source automatically; staff never choose or type an account. Payment methods (each lands in one money account): Online transfer 310-2000 · Cash 320-0000 · Cheque 310-2000 · Merchant PBB 315-1000 · GHL 315-2000 · HLBB 315-3000 · MBB 315-4000 (list may continue beyond the screenshot).
- Customer contact (Settings → Company → Customer contact): display name Carres Support Team · phone 011-6133 8862. Shared Operations number for calling customers and answering customer calls; not a staff member's phone. Tasks contact, Playbook and customer message templates read this one record; no module keeps its own copy. Changed by Jess (COO) or staff with Company access.
- Office (Settings → Office): one entry per office (address · state · working days · hours · flexible time · lunch · time zone); Add office for a branch. Public holidays follow the office's state. Working days, standard hours, address and state To check; flexible time up to 1 hour earlier or later; lunch 1:00 PM–2:00 PM (1 hour, may start up to 1 hour earlier or later); public holidays To check; time zone Malaysia GMT+8. Warehouse sites, receiving / collection hours, holidays and closed dates belong to Settings → Warehouse, not Office.
- Lunch is not leave; jobs stay with the person. Someone still at lunch at 2:01 PM is not checked then; 1 minute after their lunch ends the system checks activity again. No activity and no leave record → the same attendance question to a working colleague; jobs move only when the answer is Not working. Not sure at this check (no later check that day) → all the person's unfinished jobs go to the colleague who answered, recorded as "attendance not confirmed". Not sure at an earlier check still waits for the next check. Reference: `Late Lunch Proposal.dc.html`.
- Saturday duty (Settings → Team): staff take turns to answer customer, driver and warehouse calls and messages, default 9:00 AM–6:00 PM (changeable). Saturday duty does not mean every staff works on Saturday.
- PO and GRN each have a duty person (Settings → Team); other staff with "Can do" may cover, "Help only" staff may help. Duty decides the owner; help is recorded as the person who did it.
- Delivery jobs belong to the order's Operations owner; a job already covered keeps its current owner. This only decides who owns a job; it adds no new job. Logistics agrees the date with the customer; Operations acts only in the exceptions set in §5.
- Chase full payment: owner is the order's Operations owner, unless there is a formal payment owner or handover record, then that person. Today's cover may do it; the person who did it is recorded separately and the normal owner does not change.
- Customer call / WhatsApp: whoever answers responds and records, even if not their order.
- Every unfinished next step goes to one named person. Normal owner, current task owner and done-by are recorded separately.
- Team size not fixed (target 3, ideal minimum 2). No one allowed and working → job shows Unassigned.
- New staff: normal work as usual and may help PO; not on PO Duty in the joining month (joined 20 Oct → PO Duty from 1 Nov).
- Staff leaving: handover checklist (open jobs, orders owned, duty days, cover order, login) must give every item a named person before status becomes Left.
- DO is created by the system only when all gates pass: goods in · logistics assigned · customer confirmed delivery date · amount due cleared (checked against what must be collected; a recorded payment alone is not enough) · no Finance hold (blocks delivery on its own). Paid in full alone does not allow delivery. Creating the DO, warehouse handover and logistics collection are separate facts, each recorded on its own; one does not complete another. Operations does not approve money or clear a gate.
- Leave (MC, AM/PM off, Off) set by Jess (COO) in Settings → Team. Jobs moved after attendance is confirmed go straight into the cover person's Tasks; no taking or accepting one by one.
- Unassigned jobs sit at the top of Workspace until taken. Never hidden.
- Workspace Team today: per person jobs today · late · away/MC.
- Late = due passed and not done. Late jobs show amber for everyone; late more than 1 working day also alerts Jess (COO) (🔔). No manager role today; every staff works independently and the system keeps track.

## 7. Log a call or WhatsApp
- Who (Customer · Supplier · Warehouse · Logistics · Salesperson · Finance) → What happened (list per party, always ends with Other) → details if needed (new date, ETA, item + photo, amount + slip, new phone/address) → remark (required for Other) → proof (screenshot · photo · video).
- WhatsApp: the form asks for a screenshot of the chat.
- Answers that need follow-up create a task for the order's current owner; others save to Timeline only.
- Customer calls in: whoever answers handles it. Same form; if the order has an open task, choose: done by this call · add as note (default) · I'll take it.
- Lists are edited in Settings → Log reasons. "Other" remarks are reviewed monthly and common ones are added to the list.

## 8. Finishing a job
- A job is done once. The result goes to the order's Timeline and the job leaves Tasks.
- **Not finished** results (No reply, Not reachable, Left message, Promised to pay, Delay, Short quantity, Follow up later): the PIC picks the next follow-up — Suggested · Tomorrow · In 2 days · Next week · Pick date. Suggested depends on the situation (supplier: 3 days before supplier date if far, else tomorrow; promised payment: payment due date; logistics: 1 day before delivery). A date on/after the requested date shows a warning but can be saved. Saving creates the follow-up job.
- 3rd "no reply" on the same step alerts Jess (COO) (🔔 Escalation).
- Undo within 15 minutes. After that use Correct (a new record that keeps the original). Never edit old records.

## 9. Amendments (customer details)
- Edit on the order page: click the pencil next to a detail; only changed fields are submitted. Sales info, items and payment cannot be amended.
- Why: choose one or more reasons (Settings → Amendment reasons: From customer / Our side / Other + remark). From-customer reasons need the customer's WhatsApp screenshot.
- Approver is read by request type and duty (Settings → Approvers); not every request goes to Jess (COO). Ordinary safe corrections do not need approval. Approver list per request type and which changes need approval: to check (§15).
- Approval due: within 1 working day of submission (Settings → Approvers → Approval time; authorised staff only, every change logged). Applies to amendments and money requests; Tasks and Order Route read the same setting.
- Withdraw before approval; after approval submit a new amendment.
- Every approved amendment creates a revision (Rev 1, Rev 2 …). The original and every revision stay viewable; SO PDF shows the current revision.

## 10. Disposal
- Added by Operations only when the customer asks. No approval. Cut-off 7 days before original delivery date (Settings).
- Prices: sofa small RM50 · sofa big RM80 · mattress RM80 (size required) · bed frame RM100.

## 11. Sofa loan
- Only when the delay is our fault and the order has a sofa. Free, no approval.
- Steps: inform customer · needs loan? · source (our warehouse / supplier) · loan delivered · exchange on the same trip after GRN · loan returned and checked (damage → Issue). Order shows "Loan out" until returned.

## 12. Storage fee (customer postpones only)
Module: Payments (customer pays). Operation talks to the customer.
Source: payment MASTER (storage rules).
- **Start date (day 1):** both facts must exist: Carres can complete the agreed delivery scope, and the customer has actually postponed (recorded). Start = the later of the two. A customer who still takes delivery on the original agreed date has not postponed, even if goods were ready early. No Carres-caused delay; goods still in storage.
- **Automatic free period (calendar days from day 1):** mattress / bed frame 7 days · sofa 14 days.
- **Charge:** each started period is charged in full, not prorated by day. Mattress / bed frame RM150 per started 30-day period · sofa RM200 per started 14-day period.
- **Per order, per product group, not per piece.** Mattress + bed frame = one group. Two sofas = one sofa group.
- **Extra free time** (mattress / bed frame only) needs a formal approval. Sofa has no normal free-extension request. "Free to day 21 / day 30" counts from the storage start date (total days), not 21 / 30 more days.
- While an extension is only requested, the screen shows "Requested · free to day n · waiting approval" and the fee keeps counting as charged. If not approved, the fee stands and the system creates a task "Tell customer storage fee" for the order's Operations owner. The same task is created when the date the customer wants is past the free period. Due: Settings → Payments → Storage charges → Tell customer within (default Same day); changed only by authorised staff, every change logged. Tasks and Order Route read the same setting in effect; no screen has its own deadline. Operations tells the customer and records proof; it never approves the fee or a waiver.
- Changing any Setting applies to new cases only; cases already started keep their numbers. Every Setting stays editable any time (no season presets); every change is logged (who, when, old → new). A later postpone does not reset the start date.
- Each product group ends when its last item actually leaves storage. A planned delivery date is not the end. Days delayed by Carres are not charged.
- **Screen always shows:** start date · day n · free until · automatic / approved · current fee · calculated up to (date). Never only "this date has storage fee".
- Fee billed on a new invoice by Payments and part of the payment gate.
- Extension request link: customer picks a new date, latest original date + 30 days (Settings).

Example: original agreed date 1 Oct, Carres ready 1 Oct, customer postponed (recorded) 1 Oct → start 1 Oct = day 1. Order has mattress, bed frame and sofa.

No extra approval:
| Dates | Day | Mattress + bed frame (one group) | Sofa (one group) |
|---|---|---|---|
| 1–7 Oct | 1–7 | Free | Free |
| 8–14 Oct | 8–14 | RM150 | Free |
| 15–28 Oct | 15–28 | RM150 | RM200 |
| 29 Oct–6 Nov | 29–37 | RM150 | RM400 |
| 7–12 Nov | 38–43 | RM300 | RM400 to 11 Nov · RM600 from 12 Nov |

Mattress / bed frame formally approved free to 21 Oct:
| Dates | Mattress + bed frame | Sofa |
|---|---|---|
| 1–14 Oct | Free | Free |
| 15–21 Oct | Free (approved) | RM200 |
| 22–28 Oct | RM150 | RM200 |
| 29 Oct–20 Nov | RM150 | Continues on its own 14-day periods |
On 22 Oct the order total is RM350 (RM150 + RM200). Mattress and bed frame are not charged RM150 each.

Easy to get wrong:
- Carres ready only on 5 Oct → start cannot be before 5 Oct, even if the customer asked to postpone on 1 Oct.
- Goods ready early, customer still takes the original agreed date → not a postpone, no storage.
- Requested free extension ≠ approved.

## 13. Money, export, data
- RM is shown on payment places (Payment view, Payment card, Items table, SO PDF), as the order total in the selection bar ("n selected · n pcs · Total RM x"), and in Reports → Finance. The list summary line shows quantities only.
- Export (Excel / PDF): no approval; every export is logged (who, when, which list, rows).
- No bulk import that changes Sales Orders.

## 14. Reports
- Own menu item. Tabs: Overview · Operations · Suppliers · Logistics · Team · Finance.
- Period picker Month · Quarter · Year · Custom, ranges up to 5 years, compare with previous period / same period last year.
- Multi-year views need old data imported once.

## 15. Open questions
- **Needs revision · approval authority for money (storage free extension, waivers).** Payment MASTER: Operations does not approve money, only records and requests. The current free-extension permission conflicts with this. Owner direction: Jess (COO) approves now; a manager can also approve once there is one. Still marked needs revision until checked against payment MASTER.
- Source and start year of old data (AutoCount / Excel / Sales Portal).
- Lorry capacity per day.
- Agreed-date warning thresholds per logistics trust level.
- Who handles complaints, cancellations and refunds until Service Case / Payments modules exist.
- Partner portal languages: English · Malay · Chinese (planned).
- More than one office: does each person follow their own office's days / hours / holidays, and which office calendar counts a job's due date?
- Logistics chase at D−1 and later with still no Customer confirmed delivery date: no approved rule (old "3rd chase alerts Jess, Operation calls customer D−1" removed).
- Assign logistics: due value in Settings → Delivery.
- Warehouse handover and logistics collection after DO: owner, due, not-finished.
- Approvers: list per request type; which amendments are ordinary safe corrections.
- Dispatch owners not yet sourced: jobs 2, 6, 10, 11, 15 (order's Operations owner?) and job 5 not-finished path.
- Out-of-town orders: payment chase and pay-by days (Settings values not yet written here).
- "Reliable arrival expected" for starting payment chase: what counts (e.g. supplier confirmed ETA).
