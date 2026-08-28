# Carres Workspace — Dashboard + Work Blueprint

> **Status:** PROPOSAL FOR OWNER REVIEW · PLAN ONLY · no Cards · no production code  
> **Date:** 14 Aug 2026  
> **Decision surface:** the complete cross-module Workspace: `Dashboard = what I need to know` and `Work = what someone needs to do`.

## 0. Decision record

### Already approved / locked

- The system leads. Business actions appear from stored triggers, carry a measurable completion, and close from business evidence. Staff do not create or tick them complete.
- An action has one owner module. Another surface may read it and link to it; it may not duplicate the business truth or add a second writer.
- System actions and person-authored follow-ups are different objects with different closure laws and may not appear in one list.
- Every action carries trigger, label, checklist, completion, due date/calendar, and task owner.
- Office, Warehouse, and Delivery calendars are distinct. A due date without a named calendar is unfinished.
- The right rail is 200px navigation, not a second place to act.
- Red has one job: late / act now. Blue marks the current thing or primary action.
- Sales Order is a truth Register, not a work queue. Delivery is currently a view of Orders' delivery track. Other modules retain their own records and write doors.
- The approved system-led presentation law is the baseline. Object and owner are structured fields;
  the semantic lines do not duplicate them:

  ```text
  OBJECT IDENTITY                      row/card header or governed column
  FACT OR PROBLEM                      first semantic line
  [OWNER AVATAR / METADATA] ACTION     second semantic line
  COMPLETION · DUE · COVER             authoritative structured facts
  ```

### Genuinely unresolved before this blueprint

- No governed Workspace module or work-item projection contract exists.
- There is no ruled boundary between a management Dashboard, a cross-module Work list, the Quick Rail, and Notifications.
- Assignment, duty cover, blocked work, SLA escalation, history retention, search/filtering, and responsive behavior are not governed cross-module.
- Several producing modules have unfinished action definitions or ownership defects. Workspace cannot safely invent the missing parts.

### Recommendation

Create one top-level `Workspace` with two sibling pages:

```text
Workspace
├── Dashboard    what I need to know
└── Work         what someone needs to do
```

`Dashboard` summarizes management-significant conditions and trends. `Work` projects every eligible open action from its owning module into one system-led list. The object remains in its module; action execution always deep-links to the owning object and write door.

**What would overturn this recommendation:** evidence that the same operator must complete most cross-module actions without leaving the list, or that owners cannot expose stable action identities and completion evidence. In that case the action contract—not a duplicate Workspace writer—must be strengthened first.

---

## 1. Product boundary

| Surface | One question | Contains | Must not contain |
|---|---|---|---|
| **Dashboard** | What must management know now? | exceptions, exposure, trend, workload health, duty coverage, explicit drill-downs | a full action queue, individual checkboxes, generic KPI wallpaper, duplicate module reports |
| **Work** | What must someone do next? | open system actions, ownership, due/SLA, blockers, required result, owning-object door | manually created reminders, copied business records, manual “done”, dashboards/charts |
| **Follow-ups** | What did one person ask another person to remember? | person-authored reminder, assignee, human completion | system actions, derived SLA truth, automatic business completion |
| **Notifications** | What changed that I should notice? | new assignment, reassignment, newly overdue, unblock, failure, completion relevant to a subscriber | durable work state, unread-as-priority, a second task list |
| **Quick Rail** | Is there work or coverage I need to open? | compact counts and navigation | action execution, editable task rows, parallel calculations |
| **Owning module** | How is this business result completed? | source record, forms, evidence, history, completion mutation | Workspace-owned copies |

### The non-negotiable data flow

```text
OWNING MODULE
stored facts → its action projection → Workspace Work → deep link → owning write door
                   │                      │
                   ├─ same identity       ├─ reads only
                   ├─ same due/SLA        └─ never marks business work done
                   └─ same completion

Business outcome recorded in owning module
          → action projection no longer open
          → Work row disappears from Open and enters History
          → Dashboard summaries recompute
          → relevant notification may be emitted
```

Workspace stores only coordination metadata that no module owns: stable projection identity, presentation timestamps, notification delivery/read state, and—where permitted—assignment/cover audit. It does not store copied customer, PO, stock, receipt, delivery, payment, case, or claim truth.

---

## 2. Complete work-item contract

Every system action must satisfy this contract before Work may show it.

| Field | Required rule |
|---|---|
| `workId` | Stable identity: `{ownerModule}:{actionKey}:{ownerObjectType}:{ownerObjectId}:{occurrenceKey}`. The same open obligation may not mint duplicate rows on refresh. |
| `ownerModule` | One of the governed record owners: Sales Order, Purchasing, Receiving, Stock, Delivery, Payment/Finance, Service, Supplier Claim. A view is not an owner. |
| `actionKey` | Canonical engine key from the owning action source. Never free text. |
| `objectType` / `objectId` | The business object whose facts trigger and close the work. |
| `objectLabel` | Human handle: `SO-1300`, `PO-2051`, `GRN-…`, claim/case/receipt handle. |
| `factLabel` | Concrete fact/problem only. Object identity is a separate field and is not repeated where the surface already states it. |
| `actionLabel` | Canonical action only. Owner identity is structured metadata, never ordinary sentence text. Object/recipient appear only where the surrounding surface does not already state them. |
| `ownerRule` | Governed resolver such as Responsible Salesperson, current PO Duty, current GRN Duty, Payment owner, Delivery owner, or Service Case owner. |
| `taskOwnerKind` | `person` or `duty`. Never an email-string convention. |
| `taskOwnerId` | Normal resolved person/duty identity. A Sales Order does not have one universal action owner. |
| `actingPersonId` | Resolved person today after duty/cover rules. May equal task owner; may be the buddy covering it. Normal owner remains preserved. |
| `candidateGroup` | Optional. Only actions explicitly designed as group-claimable may expose `Take it`. |
| `recipient` | Named supplier, logistics company, customer, warehouse, or internal owner when the action involves one. Null only when no recipient is inherent. |
| `requiredResult` | Stored fact(s) that close the action, phrased for the operator. |
| `triggeredAt` | The observed instant the trigger first became true. Never reconstructed from “now” if it determines SLA. |
| `dueAt` / `dueDate` | One exact due result from the owning engine. |
| `calendar` | `office`, `warehouse`, `delivery`, or a governed supplier calendar when the rule expressly requires it. |
| `slaState` | `upcoming`, `today`, `overdue`, or `none`. Derived, never manually chosen. |
| `priorityClass` | `broken_commitment`, `today_run`, `customer_waiting`, `goods_unsecured`, `delivery_preparation`, `money`, or an owner-governed equivalent. |
| `blocked` | True only when a named dependency prevents the required result now. Waiting by itself is not blocked. |
| `blockedBy` | Owner module/object/action identity plus plain fact. No free-floating “Blocked”. |
| `closeWhen` | Machine-readable completion predicate owned by the module. |
| `nextWhenClosed` | The next action key(s) the owner engine may expose; informational only and recomputed after closure. |
| `deepLink` | Opens the owning object at the exact action region/write door. Never a generic module landing page when a record door exists. |
| `openedRevision` | Version/hash of the source facts used to project the row, for concurrency and audit. |
| `closedAt` / `closedBy` | Derived from completion evidence; `closedBy` may be system or the human whose recorded act produced it. |
| `visibility` | Role/duty access inherited from the owning object. Workspace never broadens access. |

### Admission test

A candidate is excluded from Work if any answer is no:

1. Can a human produce the result?
2. Does one module own the result and completion evidence?
3. Is the trigger computed from stored truth?
4. Is the required result explicit?
5. Is a due rule/calendar present, or expressly `none`?
6. Is the responsible person or duty resolvable?
7. Does a deep link reach the real write door?
8. Will the action close automatically when the outcome is recorded?

System defects, missing server stamps, and failed automation belong in operational monitoring/engineering—not staff Work.

---

## 3. Authoritative work trace

### 3.1 Sales Orders

| Work | Why it exists | Owner / actor | Object / recipient | Required result / closure | Due / next / door |
|---|---|---|---|---|---|
| `Delay planning` | Latest supplier date exceeds Requested Delivery Date | Sales Order / order PIC | SO / internal decision | Decision records whether promise can still be met | 2 Office working days from stored detection; if no, opens logistics new-date action; open SO delay region |
| `Case owner decision required` | Supplier cannot fulfil and a customer-order decision is needed | Sales Order / case owner only | SO + affected item | Governed decision recorded | Due rule is **UNKNOWN in authority**; cannot enter Work until defined; open affected SO issue |
| Sales Order amendment management decision | Staff requests an order change | Sales Order / management duty | amendment + SO / requester | approve or reject with reason | Due rule is **UNKNOWN**; opens owner confirmations or atomic apply; open amendment |
| Amendment owner confirmation | Approved change affects another owner | affected owner module / resolved duty | amendment + affected object | owner confirms executable or refuses with reason | Due rules are **UNKNOWN per consequence**; closes into atomic apply or returns to management; deep-link to owner consequence |

Sales Order displays Purchasing, Delivery, and Payment actions but does not own them. Its PIC may remain the case owner, but Workspace must use the task owner supplied by the action's owner module.

### 3.2 Purchasing / Purchase Orders

| Work | Why it exists | Owner / actor | Object / recipient | Required result / closure | Due / next / door |
|---|---|---|---|---|---|
| `Issue PO` | Approved demand remains uncovered | Purchasing / current PO duty or buddy cover | demand batch / supplier | formal PO exists | engine order-by/PO-day rule; next is supplier readiness; open SO Batch Purchase selection |
| `Call {supplier} — confirm ready date` | Ready date missing, changed, late, or needs reconfirmation | Purchasing / PO duty or cover | PO / supplier | latest ready date and outcome recorded | arrival-window rule on Office calendar; next waiting/receiving/delay signal; open PO call region |
| `Call {supplier} — confirm tomorrow's delivery` | Supplier delivery is expected tomorrow | Purchasing / PO duty or cover | PO / supplier | supplier answer recorded | owner call calendar; next Receiving/wait; open PO call region |
| `Call {supplier} — confirm balance delivery date` | Receipt is short and balance date is absent/expired | Purchasing / PO duty or cover | PO line / supplier | balance date recorded | owner call calendar; next waiting/receiving; open PO call region |
| Emergency stock request decision | Internal urgent request awaits planning decision | Stock/Purchasing boundary / `stock_planner` duty | request + SKU | approve/reject with governed reason | Due rule **UNKNOWN**; approved request then requires PO action; open emergency request |
| Mark emergency request ordered | Approved urgent request has been placed | Purchasing / `po_duty_editor` duty | request + PO | PO link/result recorded | Due rule **UNKNOWN**; closes request; open request/PO door |

`PO day — N orders short of stock` is currently a generated `ops_task`, but it duplicates the real `Issue PO` queue and uses a human-completed reminder. Proposed disposition: retire it after Work is live; the duty holder sees the real derived actions.

### 3.3 Receiving

| Work | Why it exists | Owner / actor | Object / recipient | Required result / closure | Due / next / door |
|---|---|---|---|---|---|
| `Check in from {supplier}` | Goods physically arrive and need counting/posting | Receiving / current GRN duty or buddy cover | PO delivery / supplier | Receiving Session posted with counts and exceptions | Warehouse calendar, arrival-day action; opens Stock units and claims as consequences; open Receiving Workspace |
| Return count to Carres / warehouse | A warehouse count must move to the other side for check/recount | Receiving / current holder on each side | receipt/count / named recipient | state records count returned to recipient | Due rule **UNKNOWN**; next review or repost; open receipt count |
| Receiving correction work | An amendment/void consequence remains unresolved | Receiving / GRN duty or assigned owner | Receiving Session | correction evidence recorded and work closed by source state | Current durable list exists; exact SLA **UNKNOWN**; open correction record |

Receiving must not create a generic `Check in` row merely because a PO has outstanding quantity. It enters Work only when the arrival/physical trigger makes the action executable.

### 3.4 Stock / Warehouse

| Work | Why it exists | Owner / actor | Object / recipient | Required result / closure | Due / next / door |
|---|---|---|---|---|---|
| `Reorder stock` *(proposal label; dictionary approval required)* | Governed reorder point exists and free + incoming cover is at/below it | Stock / stock planner duty | SKU × warehouse | approved replenishment demand/PO consequence exists, or reorder point changes | Due/SLA **UNKNOWN**; next Purchasing demand; open Stock row |
| Set missing reorder point | SKU has no governed number | This is configuration, not ordinary Work until an owner/due rule exists | SKU | reorder point recorded | Currently `Set a number` is a quiet configuration fact; do not auto-admit |
| Resolve held stock | Receiving exception quarantined a unit | Stock / stock owner | Unit ID + claim | destination becomes free, returned to supplier, or written off | SLA **UNKNOWN**; next availability/claim closure; open held unit |
| Stock amendment confirmation | Sales Order amendment affects a reserved unit | Stock / stock owner | amendment + Unit ID | suitable atomic allocation confirmed or refused | SLA **UNKNOWN**; next atomic amendment apply or management return; open allocation consequence |

### 3.5 Delivery

The current Delivery page is a read-only view and the actions are presently owned by Orders. The architecture says Delivery owns carrier, trip derivation, and proof; this inconsistency must be reconciled before Workspace freezes final owner keys. Until then use the existing action source, not a second definition.

| Work | Why it exists | Current action owner / actor | Object / recipient | Required result / closure | Due / next / door |
|---|---|---|---|---|---|
| `Assign logistics` | Order needs delivery and none is chosen | current Orders engine / order PIC | SO / internal | logistics company recorded | 3 Office working days before Requested Delivery Date; next booking call; open delivery region |
| `Call {logistics} — confirm delivery date` | Logistics chosen; customer-confirmed date + slot absent | current Orders engine / order PIC | SO / logistics | customer-confirmed date and slot recorded | configured Office working days before date; next DO; open booking region |
| `Call {logistics} — arrange new delivery date` | Delay decision says promise cannot be met | Sales Order / order PIC | SO / logistics | new customer-confirmed date and slot | same Office working day; next DO; open delay/booking region |
| `Issue delivery order` | booking exists, goods ready, and no Finance exception | current Orders engine / order PIC | SO / system document | governed DO exists | before delivery run; next Deliver today; open DO door |
| `Deliver today` | confirmed delivery date is today | current Orders engine / delivery operator | SO/trip / customer | delivered, or Delivery Exception + reason | Delivery calendar, today; next photo or failed-delivery action; open delivery execution |
| `Upload delivery photo` | delivery recorded without proof | Delivery/current Orders engine / delivery operator | delivered SO / proof | file exists | 1 working day after delivery; closes delivery track; open proof region |
| Failed-delivery follow-up | Delivery Exception exists | **Approved shape, not defined** | SO/trip/customer/logistics | next result depends on reason | Missing action, due, owner, result; exclude until governed |
| Delivery amendment confirmation | active booking/DO is affected | Delivery / delivery owner | amendment + booking/DO | executable revision confirmed/refused | SLA **UNKNOWN**; next atomic apply or management return; open delivery consequence |

### 3.6 Payment / Finance

| Work | Why it exists | Owner / actor | Object / recipient | Required result / closure | Due / next / door |
|---|---|---|---|---|---|
| `Collect RM {amount} from {customer}` | Goods are collectable and money is outstanding | Payment / collections owner | SO / customer | customer receipt/payment submission recorded; proposed split below | balance due date on Office calendar; open Payment row |
| Verify receipt/payment | Operation submitted customer evidence | Finance / Finance duty | payment submission / customer | verified payment record or explicit exception | SLA **UNKNOWN**; next settlement or hold; open Finance verification |
| Clear payment exception | Finance explicitly holds delivery | Finance / Finance duty | payment exception / customer/order | exception cleared or final resolution recorded | SLA **UNKNOWN**, but broken delivery commitment can escalate; open exception |
| Supplier claim credit/debit evidence | Supplier owes Carres after claim | Finance / Finance duty | claim / supplier | external credit-note/debit-note reference recorded | approved evolution, not built; due **UNKNOWN**; open Finance claim consequence |
| Amendment value consequence | applied/requested order change changes value | Finance / Finance owner | amendment + payment/invoice/refund object | governed financial consequence confirmed/recorded | SLA **UNKNOWN**; open Finance consequence |

The current `Collect` completion (`outstanding = 0`) conflicts with the newly locked receipt rule saying Operation is done when evidence is submitted and Finance verifies. The action must split into Operation submission and Finance verification before Work can represent it faithfully.

### 3.7 Service Case

| Work | Why it exists | Owner / actor | Object / recipient | Required result / closure | Due / next / door |
|---|---|---|---|---|---|
| Derived case step | Intake's selected plan requires a business event | Service / case owner or step owner | Service Case / relevant party | required outcome date stored | governed case plan; next derived step; open exact case step |
| Call customer with delay reason | case reaches four working days before deadline without completion | Service / case owner | Service Case / customer | call outcome and one governed reason recorded against this deadline | Office calendar; next work/extension; open deadline region |
| Close case | all steps complete and customer confirms finished | Service / case owner | Service Case / customer | customer-confirmed business date exists | 14 Office working-day base deadline, extend once within bound; open closure region |

The exact step labels/recipients must be emitted by `service-case-plan`, not generated in Workspace.

### 3.8 Supplier Claims

| Work | Why it exists | Owner / actor | Object / recipient | Required result / closure | Due / next / door |
|---|---|---|---|---|---|
| `Call {supplier} — confirm what happens next` | receiving exception opened a claim and supplier answer is needed | Supplier Claim/Purchasing / claim owner | claim + PO line / supplier | request and supplier answer recorded | Due rule **UNKNOWN**; next waiting or internal decision; open claim supplier-response region |
| Select Customer Resolution | supplier response requires Carres decision | Supplier Claim / claim owner or case owner | claim + affected customer item | Customer Resolution recorded | approved concept; next action wiring unbuilt and due **UNKNOWN** |
| Select Item Outcome | claim needs disposition of held item | Supplier Claim + Stock consequence / claim owner | claim + Unit/PO line | item outcome recorded and Stock transition executed | due **UNKNOWN**; next closure/Finance consequence |
| Close claim | both sides and required evidence are complete | Supplier Claim / claim owner | claim | close gate passes and claim sealed | due **UNKNOWN**; no next action except linked consequences |

Claims remain authoritative only for supplier-side exceptions. Guarantee claims stay linked to Service Case work; they do not become Supplier Claims unless the approved second entrance is governed and built.

---

## 4. Ownership and assignment model

### 4.1 Four identities, never one ambiguous “owner”

| Identity | Meaning | Can change? | On screen |
|---|---|---|---|
| **Record owner module** | owns business truth and closure | no, without architecture ruling | module word |
| **Case owner** | answerable for the customer/order/case end to end | rarely; governed reassignment only | object context, not repeated on every action when identical |
| **Task owner** | person or duty accountable for this result | yes, through governed assignment | Work line 2 + Team Work |
| **Acting person** | person doing it today, including cover | changes with duty/cover | shown only when different from task owner |

### 4.2 Assignment rules

1. Owner modules assign automatically at trigger time using their governed person/duty rules.
2. Person-owned work enters that person's `My Work` immediately.
3. Duty-owned work resolves the current holder dynamically. The row keeps the duty identity and shows the acting person.
4. A manager may reassign only where the owner action permits reassignment. Reassignment changes coordination, never source business truth.
5. `Take it` appears only for a true candidate-group action. It is not a universal button.
6. Claiming is atomic and concurrency-safe. After one person takes it, every other view resolves to the new actor.
7. A claimed action may expose `Release` only when its owner permits return to the group.
8. Completing the business action is never `Mark done` in Work. The owning module records the result.

### 4.3 Duty and buddy cover

Carres' approved PO/GRN rotation remains the model:

- PO duty and GRN duty are offset; the same two people do not cover each other.
- The no-duty buddy covers either duty.
- Planned `Away` activates cover from the start of the day.
- Before 10:00 MYT, no heartbeat is not absence.
- From 10:00 MYT, no heartbeat today activates cover.
- When the duty holder returns, new/open duty work resolves back to the holder. No business row is rewritten merely to express temporary cover.
- If both duty holders are absent, the remaining person covers both and Dashboard raises `Duty coverage` as a management exception.

Work presentation:

```text
PO-2051 · Expected Arrival not recorded
[YJ] covering PO duty · Call Ohana — confirm ready date
```

The Team panel remains the one home for the rota. Work explains cover only on rows where it changes who acts today.

---

## 5. Priority and SLA

### 5.1 One deterministic order

Open Work sorts by:

1. broken commitment / failed today's run;
2. overdue duration, longest first;
3. due today;
4. customer must be told / outside commitment broken;
5. goods unsecured;
6. delivery preparation;
7. money;
8. due date/time;
9. customer promise date;
10. stable object/action identity.

Managers may filter/group but do not manually drag business priority. A user-entered `Urgent` flag cannot outrank an overdue system commitment.

### 5.2 Time states

| State | Rule | Presentation |
|---|---|---|
| `Overdue` | now is beyond owner-computed due | red time, red rail count; never a red button |
| `Today` | due on the active business day | neutral/strong; no alarm if still on time |
| `Upcoming` | due after today within the selected horizon | actual weekday + date |
| `No due` | owner explicitly rules no SLA | hidden from time buckets; allowed only with reason in contract |
| `Blocked` | required result cannot be produced because a named dependency is unresolved | named dependency line; keeps original due and overdue state |

Blocked does not pause SLA unless the owning business rule explicitly says the clock pauses. If it pauses, store the pause event and show the revised due basis; never silently move the date.

### 5.3 Escalation

- Newly overdue: notify task owner/acting person once.
- Still overdue at the owner-defined escalation threshold: notify responsible manager; do not mint a second “chase” task.
- Broken commitment or failed delivery: management visibility immediately.
- No owner / unresolved duty / missing deep link / projection failure: Dashboard `Work health` exception, not staff Work.
- SLA count is never one universal “60 minutes.” Each action owns its due rule and calendar.

---

## 6. Work composition

### 6.1 Default experience

`Work` opens on `My Work`, then the top row. It is a list-detail Queue pattern, not the batch Workspace pattern used by To Order.

```text
Workspace │ Dashboard  Work                                      🔔  ?  ⚙
────────────────────────────────────────────────────────────────────────────
My Work  12     Team Work 38                                    Search
────────────────────────────────────────────────────────────────────────────
Overdue 3   Today 5   Upcoming 4   Blocked 1                     Filters
──────────────────────────────────────┬─────────────────────────────────────
WORK LIST                                    │ ACTION CONTEXT
                                             │
PO-2051 · Expected Arrival not recorded      │ PO-2051 · Ohana
[YJ] Call Ohana — confirm ready date         │ Required result
                                             │ Latest ready date + outcome
Overdue 2 working days · Purchasing          │
                                             │ Why this exists
SO-1300 · Requested Delivery Date changed    │ Ready date was not recorded…
[KY] Confirm delivery consequence            │
                                             │ Due · owner · blocker
Today · Delivery                             │
                                             │ [Open purchase order]
…                                            │
──────────────────────────────────────┴─────────────────────────────────────
12 open · 3 overdue · Updated 10:42
```

The detail pane is read-only coordination context plus one primary deep link. It never embeds the owner module's form.

### 6.2 My Work

Includes:

- actions directly assigned to me;
- actions whose duty I hold today;
- actions I am actively covering;
- group actions I have claimed.

It excludes:

- work merely visible to my team;
- person-authored follow-ups;
- completed work;
- notifications I have read but do not own.

Default buckets are mutually understandable views, not separate queues:

```text
Overdue · Today · Upcoming · Blocked
```

An overdue blocked row appears in `Overdue` and carries a `Blocked by …` fact. The `Blocked` view is a filter across open work, not a competing status that hides lateness.

### 6.3 Team Work

For staff: their permitted team/duty scope. For management: every permitted team with grouping by owner.

Default management grouping:

```text
No owner / no cover
Overdue by person or duty
Due today by person or duty
Upcoming
```

Team Work groups by normal owner. It adds per-row `Acting person` / `Cover` metadata only when
the row differs from its group or somebody is covering today. It is not a leaderboard. Counts
show capacity and risk; they do not score people without workload/complexity context.

### 6.4 Completed / History

- `Completed` is not in the open Work default.
- One `History` filter opens a read-only register of completed, superseded, and cancelled projections.
- History records the source result, completion time, actor where observed, object, and deep link.
- No `Reopen` in Workspace. If source truth changes and the trigger becomes true again, the owner engine emits a new occurrence key.
- Retention follows business/audit retention of the owning object; Workspace does not delete source history.

### 6.5 Filters and search

Permanent controls:

- Search across object handle, customer, supplier/logistics recipient, SKU/model, action phrase, and person/duty.
- Scope: `My Work` / `Team Work` tabs—not a duplicate dropdown.
- Time shortcuts: `Overdue`, `Today`, `Upcoming`.
- Filter menu: Module, Task owner, Acting person, Duty, Recipient, Calendar, Blocked, Due date.

Rules:

- Filters combine with AND across fields and OR within a multi-select field.
- Active filters appear in one removable band with `Clear filters`.
- Search/filter state may be encoded in the URL for shareable manager views; it resets to the default on a fresh entry unless a governed shared view exists.
- No personal column resizing/order memory.
- Empty filtered result: `No work matches these filters.` + `Clear filters`.

### 6.6 Work item presentation

Every row may use two semantic lines plus compact structured metadata. The action sentence never
absorbs the owner:

```text
PO-2051 · Expected Arrival not recorded
[YJ] Call Ohana — confirm ready date
Overdue 2 working days · Purchasing
```

Rules:

- Object identity belongs to the row/card header; a Register does not repeat an SO/customer already
  present in governed columns.
- Line 1 is the measurable fact/problem.
- Owner is a structured avatar/metadata field beside line 2, never part of its sentence.
- Line 2 is the canonical action. It includes object/recipient only when the surrounding surface
  does not already make them unambiguous.
- Completion remains an authoritative contract fact and is not appended as prose unless the
  current surface can actually complete it.
- Never `Follow up`, `Check`, `Handle`, `Process`, or `Pending` alone.
- `Check` is allowed only under the dictionary's narrow meaning: establish a missing fact and record it.
- Channel is secondary: `Open WhatsApp`, `Open WhatsApp group`, or `Copy message` may exist only inside the owner action surface.
- If the recipient has no stored identity, the owner action is not presentation-ready; Workspace does not guess.

---

## 7. Dashboard composition

### 7.1 Admission test for management visibility

A fact reaches Dashboard only if it changes a management decision today and at least one is true:

- a customer or supplier commitment is broken;
- money/goods/delivery exposure exceeds a governed threshold;
- work has no accountable actor or no cover;
- a module process is failing or blocked across multiple records;
- a trend is materially worsening/improving over a governed comparison period;
- a compliance/audit exception needs management action.

Reject a metric if it is merely easy to count, duplicates a module report, has no decision/door, or is just the open Work total enlarged.

### 7.2 Recommended desktop composition

```text
Workspace │ Dashboard  Work                                      🔔  ?  ⚙
────────────────────────────────────────────────────────────────────────────
Today · Fri 14 Aug                         Business day · updated 10:42

MANAGEMENT EXCEPTIONS
┌──────────────────────┬──────────────────────┬────────────────────────────┐
│ Broken commitments 3 │ Duty coverage 1      │ Work health 2              │
│ 2 delivery · 1 goods │ GRN duty covered     │ 1 unowned · 1 source error │
│ Open affected work → │ Open Team Work →     │ Open Work health →         │
└──────────────────────┴──────────────────────┴────────────────────────────┘

BUSINESS FLOW
┌──────────────────────────────────────┬───────────────────────────────────┐
│ Customer commitments                 │ Cash requiring attention          │
│ Due next 7 days · ready / at risk     │ Collectable outstanding           │
│ trend against prior 7 business days  │ Finance exceptions · aged change  │
│ Open Sales Orders / Delivery →        │ Open Payment / Finance →          │
└──────────────────────────────────────┴───────────────────────────────────┘

OPERATING FLOW
┌──────────────────────────────────────┬───────────────────────────────────┐
│ Goods flow                           │ Workload health                    │
│ To buy · expected · late · held       │ overdue by module · no owner       │
│ Open Purchasing / Receiving / Stock →│ today load by duty/person          │
└──────────────────────────────────────┴───────────────────────────────────┘

RECENT MATERIAL CHANGE
10:31  PO-2051 expected arrival moved beyond Requested Delivery Date       Open →
09:48  Finance opened payment exception on SO-1300                   Open →
```

### 7.3 Exact Dashboard regions

1. **Management Exceptions** — maximum three cards, only non-zero. Each states count + concrete composition + one door.
2. **Customer Commitments** — upcoming promised deliveries partitioned into ready/on track vs at risk/broken, plus change from prior comparable business-day window. This is not a list of actions.
3. **Cash Requiring Attention** — collectable outstanding, explicit Finance payment exceptions, ageing movement. Never equate outstanding with delivery hold.
4. **Goods Flow** — demand to buy, supplier arrival missing/late, receiving exceptions, held stock; each number drills to its owning module view.
5. **Workload Health** — overdue distribution, no-owner/no-cover, blocked duration, today capacity by duty/person. It answers whether the system of work is healthy, not which row to do next.
6. **Recent Material Change** — at most five business-significant changes, not a raw audit feed. Each links to the owning record.

### 7.4 Explicit exclusions

- No five-column order pipeline copied from the current Dashboard.
- No `Active orders` or GMV hero unless the owner defines the management decision it drives.
- No `Open POs`, `Low stock`, and `Stock alerts` as three competing counts of adjacent supply conditions.
- No row-level action list; `Open affected work` is a drill-down to Work.
- No KPI card for every 2990/AutoCount figure.
- No vanity percentages with insufficient real coverage.

### 7.5 Dashboard states

- All clear: `No management exceptions today.` Keep Business Flow and trends visible; do not show a confetti empty page.
- Section has insufficient records: state the coverage and withhold the trend.
- Partial source failure: keep unaffected sections; show `Goods flow could not update.` + `Try again`. Never present stale data as current.
- Whole-page failure: `Dashboard could not update.` + `Try again` + last successful update time if known.
- Stale beyond governed threshold: persistent warning band, not a toast.

---

## 8. Quick Rail and Notifications

### 8.1 Quick Rail

Replace the current actionable Follow-ups board in the rail with a navigation-only `Work` panel.

Collapsed rail:

```text
Team
Calendar
Work       3   ← my overdue count; red only if overdue
Activity
```

Expanded `Work` panel:

```text
WORK
My Work          12
Overdue           3
Due today         5
────────────────────
Team Work        38      manager only
No owner / cover  1      manager only

Open Work →
```

No rows, `Take it`, `Mark done`, assignment, or execution in the rail. `Team` remains the one home for PO/GRN duty identity; Calendar remains booking-led; Activity remains history.

Person-authored follow-ups move to a distinct, clearly named surface outside system Work. Until that surface is governed, preserve the data but remove its claim to be the system worklist.

### 8.2 Notifications

Notifications are event receipts, not work.

Notify on:

- newly assigned/reassigned/covered work;
- newly overdue work;
- work unblocked;
- explicit manager escalation threshold crossed;
- source action completed when the recipient is subscribed/depends on it;
- projection/source failure affecting the user's scope.

Do not notify on every refetch, unchanged overdue row, own action, or routine derived count change. Reading/dismissing a notification never changes Work. Every notification opens the Work item or owning object; the bell's count is unread notifications, not open work.

The current Bell duplicates its own order-overdue and missing-date calculations. Proposed disposition: replace them with subscriptions to owner action changes and Dashboard management exceptions.

---

## 9. Responsive behavior

### Wide desktop ≥ 1280px

- Fixed portal navigation, full list-detail Work, Dashboard two-column operating regions.
- Work list minimum 520px; detail 400–480px; no page-level horizontal scroll.
- Quick Rail may remain as the 200px navigation surface defined by UI authority.

### Compact desktop / tablet 768–1279px

- Work list uses full content width; selecting a row opens the context as a right drawer.
- Dashboard cards become one column after the exception strip; no squeezed three/five-column grids.
- Two-line row copy remains intact; metadata may wrap beneath it.
- Portal navigation may collapse; Quick Rail icon strip remains navigation only.

### Narrow < 768px

- `My Work` / `Team Work` remain top tabs.
- One list, no persistent detail pane. Selecting a row opens a full-screen detail sheet with `Close` and the owner deep link.
- Filters open one full-screen filter sheet; active-filter chips remain visible above rows.
- Dashboard is a single reading path: Exceptions → Customer Commitments → Cash → Goods → Workload → Recent Change.
- No hover-only information. Full copy, recipient, due date, and blocker are reachable by touch and keyboard.
- Quick Rail is not shown as a second side rail; global navigation exposes `Work` with the overdue badge.

### Accessibility

- Two lines carry meaning without colour.
- Due and blocked state are text, not icons alone.
- Keyboard order follows visual order; selecting a row does not steal focus unexpectedly.
- `Take it` and assignment are real buttons only where allowed, with atomic failure feedback.
- Live count changes use restrained announcements; refetch does not repeatedly announce the list.

---

## 10. Exact UI vocabulary

### Existing approved words reused

`Dashboard` · `Work` · `My Work` · `Team Work` · `Overdue` · `Today` · `Later` · `Completed` · `History` · `Search` · `Clear filters` · `Open order` · `Open purchase order` · `Take it` *(only candidate-group actions)* · `Assign` · `Call` · `Issue` · `Upload` · `Close` · `Return` · `Check` *(missing-fact meaning only)*.

### Workspace proposal words requiring owner approval in the UI Dictionary

| Word | Exact meaning | Never means |
|---|---|---|
| `Workspace` | top-level home containing Dashboard and Work | a module batch workspace pattern |
| `Upcoming` | open work due after today within the selected horizon | a rail day bucket (`Later` remains the rail word) |
| `Blocked` | a named dependency prevents the required result now | waiting, late, or difficult |
| `No owner` | owner resolution failed or is missing | anybody may casually do it |
| `Duty coverage` | current holder is covered or no safe cover exists | ordinary leave calendar |
| `Work health` | management-only integrity of ownership, cover, source, and overdue work | staff performance score |
| `Open Work` | navigate to the full Work page | execute a business act |
| `Open {object}` | navigate to the exact owning object | generic `View`/`Details` |
| `Release` | return a claimed candidate-group action to its governed group | cancel the business obligation |

### Banned generic copy

Never render standalone `Follow up`, `Handle`, `Process`, `Pending`, `Check` without a missing fact, `Action required`, `Needs attention`, `To do`, or `Done` for system work.

### Worked two-line examples

```text
PO-2051
Expected Arrival not recorded
[YJ] Call Ohana — confirm ready date

SO-1300
Customer-confirmed delivery date and slot not recorded
[KY] Call NETS Logistics — confirm delivery date

Service Case SC-104
4 working days remain and the case is not finished
[SH] Call Umi — explain the delay

Claim CL-18
Supplier rejected replacement
[KY] Select Customer Resolution
```

Register density for the same contract:

```text
⚠ No delivery date
[SH] Ask customer for a delivery date
```

`[SH]` is a separate avatar chip with hover/focus `Shasha`; `SO No` and `Customer` stay in their
own columns. My Work omits the user's own avatar except for cover/handover. Team Work places owner
identity in the grouping header and repeats it per row only for an exception.

---

## 11. Empty, error, blocked, and overdue states

| Context | Exact presentation |
|---|---|
| My Work empty | `No work assigned to you.` + if covering none, `Nothing is due from your duties.` |
| Team Work empty | `No team work is open.` |
| Filtered empty | `No work matches these filters.` + `Clear filters` |
| Completed empty | `No completed work in this period.` |
| Blocked row | `Blocked by {object/fact}.` Keep original due/overdue line. |
| Source missing | exclude action; Dashboard: `{module} work could not update.` + `Try again` |
| Deep link unavailable | exclude from staff Work; Dashboard `Work health`; never show an unfinishable row |
| Claim conflict | `{person} took this work first.` Refresh row to current actor; do not duplicate |
| Action changed while open | `This work changed in {module}.` Reload context; preserve no unsaved Workspace business form because none exists |
| Newly completed | row leaves Open; optional brief inline confirmation points to History; not a generic toast |
| Overdue | `Overdue {n} working day(s)` using the owning calendar; no relative calculation from the browser when the server owns it |

---

## 12. Current → proposed gap audit

| Current production / repo truth | Problem | Proposed destination | Classification |
|---|---|---|---|
| Dashboard hero: deliveries, waiting stock, ready to ship, active orders, GMV | mixes operator workload, pipeline, and commercial summary without a management admission test | management exceptions + flow health + material trends | 🔴 rebuild composition |
| Three KPI tiles: Today, Open POs, Overdue | counts have different owners and drill to broad pages | only governed exception cards with exact affected view | 🟡 adapt |
| Five-column order pipeline | Dashboard becomes a second Orders board | remove; Sales Orders/Delivery own record flow | 🔴 relocate |
| Open POs, Low Stock, Stock Alerts cards | overlapping supply truths and duplicate doors | one Goods Flow region with owner-specific drilldowns | 🔴 consolidate |
| Escalation inbox on Dashboard | row-level work inside management overview | Work/Team Work; Dashboard keeps only exception count | 🔴 relocate |
| Right-rail Tasks / Follow-ups | manual and generated rows share manual claim/done lifecycle | separate human Follow-ups; system Work from owner projections | 🔴 split |
| Any staff can create/delete task and tick system-generated tasks done | violates action-engine and measured-completion law | no manual completion for system work; human reminders stay separate | 🔴 stop |
| One universal 60-minute SLA | contradicts module-specific due rules/calendars | owner-supplied due/SLA | 🔴 replace |
| Cron rolls overdue claimed tasks to next day | hides lateness and uses weekend arithmetic that omits governed calendars/holidays | preserve original due unless owner explicitly pauses/resets clock | 🔴 replace |
| Cron creates `Chase:` task for stalled task | duplicate task about a task; banned word | escalation event on the same work item | 🔴 replace |
| Contact-by cron creates `Contact customer` task | generic/banned verb and duplicates owner action logic | owner action projection with exact recipient/result, or retire if no longer valid | 🔴 re-govern |
| PO-day cron creates reminder task | duplicates real Issue PO actions and manual completion | duty-resolved Issue PO rows | 🔴 retire after cutover |
| Bell independently calculates overdue orders and no logistics ETA | third action calculation, routes only to Orders | notifications subscribe to action transitions/exceptions | 🔴 replace |
| Sidebar badges are module-specific counters | no single Work entry or cross-module meaning | Workspace nav: Dashboard + Work; Work badge = my overdue | 🟡 adapt |
| Team panel shows PO duty only | approved GRN row is unbuilt; cover is not shown cross-module | Team remains rota home; add governed GRN/cover view | 🟡 complete approved evolution |
| Sales Order actions default to PIC | conflicts with Purchasing duty ownership for Purchasing actions | each owner projection supplies task owner | 🔴 correct boundary |
| Delivery actions defined in Orders while architecture says Delivery owns delivery acts | owner contradiction | reconcile module authority before final action keys | 🔴 governance blocker |
| Payment `Collect` closes at zero outstanding, but new rule says Operation ends at receipt submission and Finance verifies | one action currently spans two owners/results | split submission from verification/exception | 🔴 governance blocker |
| Failed delivery records exception but no next action | Work would strand the journey | define reason→next action map, owner, due, closure | 🔴 engine gap |
| Claims has resolution UI but no action wiring/due | hidden work found only by opening rows | owner engine emits resolution action after rules are complete | 🔴 engine gap |
| Service steps are derived correctly | strong fit for Work projection | expose stable step identity, owner, due, deep link | 🟢 keep/adapt |
| Receiving correction has durable list | separate local work surface but incomplete global contract | expose as owner projection if actor/due/closure are complete | 🟡 adapt |
| Work has no completed global history | managers cannot audit throughput or handoff | read-only projection history linked to source evidence | 🔴 build projection layer |
| No responsive cross-module Work | narrow users would inherit desktop rail/panels | list → drawer → full-screen progression | 🔴 design/build later |

---

## 13. Reference capability map

| Reference capability | Carres equivalent / owner | Decision | Why / dependency |
|---|---|---|---|
| Oracle separates group `Incoming Tasks` from `My Tasks`, supports Claim/Release/Reassign, and sorts due work with overdue first | Carres has person/duty work and a manual `Take it` board | **ADAPT** | use only for explicitly group-claimable actions; Carres defaults to automatic owner assignment |
| SAP Task Center substitution puts covered tasks in the substitute's inbox for a defined absence | Carres buddy-cover duty law | **ADAPT** | Carres' derived same-day cover is stronger for a three-person team; do not rewrite source ownership |
| Linear triage responsibility rotates intake ownership and can auto-assign | Carres PO/GRN rotating duty | **KEEP CONCEPT / ADAPT** | confirms visible duty ownership; Carres uses governed roster/heartbeat rules |
| Linear keeps Inbox notifications separate from Issues and supports view subscriptions | Carres Bell currently recomputes work | **ADAPT** | notifications become event receipts; Work remains durable truth |
| Linear custom views and assignee grouping | no governed shared Work views yet | **DEFER** | add shared named views only after repeated stable daily filtering is observed |
| Dynamics operational workspace combines overview, lists, links, and drill-through for a persona | Carres currently mixes dashboard and queues | **ADAPT BOUNDARY** | retain drill-through and role relevance, but separate Dashboard knowledge from Work execution |
| SAP Overview Pages use interactive, actionable cards for vital information | current Dashboard cards | **ADAPT** | cards require a management decision and an owning drill-down; never copy card volume blindly |
| Oracle worklists deep-link task and application identifiers to source details | Carres module objects | **KEEP** | every row must open the exact owning object/action region |

Primary references: [Microsoft Dynamics navigation and workspace model](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/user-interface/page-navigation), [Microsoft operational workspaces](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/user-interface/build-workspaces), [Oracle Permits Worklist](https://docs.oracle.com/en/cloud/saas/public-sector-compliance-regulation-common/26c/pspzu/using-the-permits-worklist.html), [SAP substitution management](https://help.sap.com/docs/task-center/sap-task-center/substitution-management), [Linear Triage](https://linear.app/docs/triage), [Linear Inbox](https://linear.app/docs/inbox), and [SAP Overview Pages](https://help.sap.com/docs/ABAP_PLATFORM_NEW/468a97775123488ab3345a0c48cadd8f/c64ef8c6c65d4effbfd512e9c9aa5044.html).

---

## 14. Exact UI composition — proposal for Layout Approved

This section turns the approved architecture into the exact two-page composition. It proposes no
new business truth and no production implementation.

### 14.1 Shared Workspace shell

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Workspace │ Dashboard   Work                            page meta │ 🔔  ?  ⚙ │ 44
├──────────────────────────────────────────────────────────────────────────────┤
│ page content — the only page-owned region                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

- `Workspace` is the module word. `Dashboard` and `Work` are the only tabs.
- The shell draws the header. Neither page repeats its active tab as an H1.
- Global icons keep the approved Bell · Help · Settings positions.
- Dashboard may scroll vertically. Work uses the full remaining height and the list is its only
  vertical scroller.
- Tab badges: `Work` shows **my overdue count only**. Dashboard has no badge; a management summary
  does not pretend to be an inbox.

### 14.2 Work — wide desktop

```text
┌ Workspace │ Dashboard  Work                                      🔔  ?  ⚙ ┐
├────────────────────────────────────────────────────────────────────────────┤
│ My Work 12      Team Work 38                         Search work…  Filters │ 40
├────────────────────────────────────────────────────────────────────────────┤
│ Overdue 3    Today 5    Upcoming 4    Blocked 1                      Clear │ 36
├───────────────────────────────────────────────┬────────────────────────────┤
│ WORK LIST                                     │ WORK CONTEXT               │
│                                               │                            │
│ OVERDUE · 3                                   │ PO-2051                    │
│ ───────────────────────────────────────────── │ Purchasing                 │
│ PO-2051                         Overdue 2 days │                            │
│ Expected Arrival not recorded                 │ Expected Arrival not       │
│ [YJ] Call Ohana — confirm ready date          │ recorded                   │
│ Purchasing · covered PO duty                  │                            │
│                                               │ ACTION                     │
│ SO-1318                          Overdue 1 day │ Call Ohana — confirm       │
│ No delivery date                             │ ready date                 │
│ Ask customer for a delivery date              │                            │
│ Sales Order                                   │ REQUIRED RESULT            │
│                                               │ Latest ready date and      │
│ TODAY · 5                                     │ supplier outcome recorded  │
│ ───────────────────────────────────────────── │                            │
│ Claim CL-18                                   │ OWNER                      │
│ Supplier rejected replacement                 │ Normal  [SH] Shasha        │
│ Select Customer Resolution                    │ Today   [YJ] Yu Jun covers │
│ Supplier Claim                                │                            │
│                                               │ DUE                        │
│ …                                             │ Overdue 2 Office working   │
│                                               │ days · was Tue 11 Aug      │
│                                               │                            │
│                                               │ WHY THIS EXISTS            │
│                                               │ Ready date is absent…      │
│                                               │                            │
│                                               │ NEXT                       │
│                                               │ Receiving can start when…  │
│                                               │                            │
│                                               │ [Open purchase order]      │
├───────────────────────────────────────────────┴────────────────────────────┤
│ 12 open · 3 overdue · Updated 10:42                                      │ 32
└────────────────────────────────────────────────────────────────────────────┘
```

#### Region responsibilities

| Region | Exact job | Rules |
|---|---|---|
| Scope tabs | switch between personal execution and team supervision | `My Work` is default for non-manager; manager also lands on My Work because the tab answers personal work, not authority |
| Search | find by object, party, item, action, person/duty | one input; results keep active scope/time filters |
| Filters | module, owner/duty, recipient, calendar, due range | opens a Popover on wide screens; no permanent second toolbar |
| Time bar | fast factual narrowing | `Overdue` · `Today` · `Upcoming`; `Blocked` is orthogonal and may overlap time state |
| Work list | scan and choose one action | list, not table; variable copy needs two semantic lines and compact metadata |
| Work context | explain and hand over | read-only; one primary owner-object link; never embeds the write form |
| Footer | state scope and freshness | count open rows in the current scope, overdue subset, last successful update |

#### List-row anatomy

```text
OBJECT IDENTITY                                      TIME STATE
FACT OR PROBLEM
[OWNER AVATAR only when needed] ACTION
OWNER MODULE · COVER / BLOCKER only when exceptional
```

The row is 72px when owner context is unnecessary and 88px when cover/blocker metadata is present.
This is not the Register's 40px scan-row law: a Work row must carry the complete two-line decision.
The selected row uses the approved selection colour. Overdue colour belongs only to the due text
and leading condition marker; it does not wash the entire row red.

#### My Work density

Normal rows omit the user's own avatar:

```text
SO-1318                                      Today
No delivery date
Ask customer for a delivery date
Sales Order
```

Cover is exceptional and therefore named:

```text
PO-2051                              Overdue 2 days
Expected Arrival not recorded
[YJ] Call Ohana — confirm ready date
Purchasing · covering Shasha's PO duty
```

#### Team Work density

Team Work groups by normal owner. Group headers remain sticky inside the list scroller:

```text
[SH] Shasha                         8 open · 2 overdue
────────────────────────────────────────────────────
SO-1318                                      Today
No delivery date
Ask customer for a delivery date

PO-2051                              Overdue 2 days
Expected Arrival not recorded
[YJ] Call Ohana — confirm ready date
Yu Jun covers today

[YJ] Yu Jun                        12 open · 1 overdue
────────────────────────────────────────────────────
…
```

- Owner avatar/name appears once in the group header.
- A row shows another avatar only when acting person differs from normal owner.
- `No owner / no cover` is the first group and is management-only.
- Group collapse is rejected: hiding an overdue group is a dangerous personal layout state.
- Group counts are workload facts, never performance scores.

#### Work context pane

The context pane answers seven questions in this order:

1. What object is this?
2. What fact/problem opened the action?
3. What action is required?
4. What authoritative result closes it?
5. Who normally owns it and who acts today?
6. When is it due, on which calendar, and what blocks it?
7. What is expected to happen next?

`Next` is a forecast from the owner engine, not a promise stored by Workspace. The only primary
button is `Open {owning object}`. A secondary `Take it` / `Release` control appears in the Owner
region only for actions whose contract declares a candidate group.

The pane must never show:

- a manual `Mark done`;
- an editable due date unless the owning action explicitly owns rescheduling;
- a duplicated customer/order form;
- a free-text owner picker for automatically owned work;
- an action channel button that would bypass the owning module's evidence capture.

### 14.3 Work interaction states

| Event | List behavior | Context behavior |
|---|---|---|
| first load | select first row in the highest-priority non-empty time section | show its current contract |
| click row | preserve list scroll and filter state | replace context; focus remains on selected row unless keyboard opened pane |
| owner result recorded in module | row leaves Open on recompute | if still open, refresh; if closed, show `Completed in {module}` and a History link until another row is selected |
| action changes | row moves to correct time/group position | show `This work changed in {module}.` and current facts |
| cover activates | row appears in cover person's My Work without source reassignment | Owner region shows normal owner + today's cover |
| claim conflict | losing user sees current actor | `Yu Jun took this work first.`; no duplicate row |
| blocked dependency closes | row loses blocker metadata and reorders by original due | context shows current due; no new work identity |
| source fetch partially fails | keep successful module rows | persistent top band names failed module + `Try again` |
| all sources fail | no old list presented as current | full-region error with last successful update |

### 14.4 Work filtering details

The default `My Work` view has no active filter band. Selecting filters inserts one compact band
between scope/search and the time bar:

```text
Module: Purchasing ×   Due: This week ×   Covering only ×       Clear filters
```

- Time-bar selection and filters combine; the selected time shortcut is visibly active.
- `Blocked` is a toggle filter, not an exclusive lifecycle state.
- Search does not change the owner grouping in Team Work.
- `Clear filters` clears Search, filter-menu values and time shortcuts, then returns to all open
  work in the current My/Team scope.
- A manager deep-link from Dashboard carries a visible filter band such as
  `Exception: No owner / no cover ×`; it never applies a hidden query.

### 14.5 Work empty states

```text
My Work, genuinely empty
No work assigned to you.
Nothing is due from your duties.

Team Work, genuinely empty
No team work is open.

Filtered
No work matches these filters.
[Clear filters]

Time shortcut
Nothing is overdue.
Open Today →
```

The last cross-link appears only when Today is non-zero. Empty-state art is not used.

### 14.6 Dashboard — wide desktop

```text
┌ Workspace │ Dashboard  Work                                      🔔  ?  ⚙ ┐
├────────────────────────────────────────────────────────────────────────────┤
│ Fri 14 Aug · Business day                                Updated 10:42   │
│                                                                          │
│ MANAGEMENT EXCEPTIONS                                                    │
│ ┌──────────────────────┬──────────────────────┬──────────────────────────│
│ │ Broken commitments 3 │ Duty coverage 1      │ Work health 2            │
│ │ 2 delivery · 1 goods │ GRN duty covered     │ 1 no owner · 1 failed    │
│ │ Open affected work → │ Open Team Work →     │ Open Work health →       │
│ └──────────────────────┴──────────────────────┴──────────────────────────│
│                                                                          │
│ CUSTOMER COMMITMENTS                            CASH REQUIRING ATTENTION │
│ ┌────────────────────────────────────┐          ┌────────────────────────│
│ │ Next 7 business days          18   │          │ Collectable  RM …      │
│ │ On track 14 · At risk 3 · Broken 1 │          │ Finance exceptions 2   │
│ │ versus prior 7 days   At risk +1   │          │ 30+ days          RM … │
│ │ Open Sales Orders / Delivery →     │          │ Open Payment →         │
│ └────────────────────────────────────┘          └────────────────────────│
│                                                                          │
│ GOODS FLOW                                      WORKLOAD HEALTH          │
│ ┌────────────────────────────────────┐          ┌────────────────────────│
│ │ To buy 12 · Arrival missing 4      │          │ Overdue 9              │
│ │ Supplier late 3 · Held stock 1     │          │ Today 24 · Blocked 3   │
│ │ Open Purchasing / Receiving →      │          │ No owner / cover 1     │
│ └────────────────────────────────────┘          │ Open Team Work →       │
│                                                 └────────────────────────│
│                                                                          │
│ RECENT MATERIAL CHANGE                                                   │
│ 10:31  PO-2051 arrival moved beyond Requested Delivery Date       Open PO│
│ 09:48  SO-1300 payment exception opened by Finance          Open SO →    │
└────────────────────────────────────────────────────────────────────────────┘
```

#### Dashboard hierarchy

1. Business-day/freshness line.
2. Non-zero Management Exceptions.
3. Customer Commitments and Cash Requiring Attention.
4. Goods Flow and Workload Health.
5. Recent Material Change.

There is no hero sentence, GMV headline, order pipeline or “cards because a metric exists.” Every
number has a named management decision and a governed door.

#### Dashboard card behavior

- An exception card renders only above zero. If all are zero, one calm line reads
  `No management exceptions today.` and the rest of Dashboard remains.
- Clicking the card body or its exact link opens Work with a visible filter. It never opens a
  generic Dashboard clone.
- Business Flow cards may open the owning module when the number is a module report, or filtered
  Work when it is an action population. The label makes the destination explicit.
- A trend appears only when both comparison windows have valid coverage. Otherwise the card states
  the coverage and withholds the comparison.
- Amounts never round away cents where a person may act on them. Large management totals may use
  governed compact display only if full value is reachable without hover.

#### Dashboard drill-down map

| Dashboard fact | Destination |
|---|---|
| Broken commitments | Team Work filtered to `broken commitment` |
| Duty coverage | Team Work grouped by normal owner, `Covering only` |
| No owner / no cover | Team Work first group, exact exception filter |
| Work source failure | Work health diagnostic; no staff work row is fabricated |
| Customer commitments | Sales Orders / Delivery governed view |
| Collectable / Finance exceptions | Payment / Finance owning view |
| To buy | SO Batch Purchase |
| Arrival missing / supplier late | Purchase Orders CALLS view |
| Held stock | Stock Held view / Supplier Claim owning rows |
| Overdue / Today / Blocked workload | Team Work with visible matching filter |
| Recent material change | exact owning object |

### 14.7 Dashboard states

```text
No exceptions
No management exceptions today.

Insufficient comparison coverage
7 business days on record. Trend appears after 14.

One source failed
Purchasing figures could not update. Other figures are current.
[Try again]

Dashboard failed
Dashboard could not update.
Last updated Thu 13 Aug · 17:42
[Try again]
```

A failed region never silently prints zero. Last-updated time belongs to the response state, not a
manual Refresh button.

### 14.8 Quick Rail composition

The approved right rail remains navigation. The existing actionable Tasks panel is not the Work UI.

```text
Collapsed                   Expanded Work panel

Team                        WORK
Calendar                    My Work              12
Work       3                Overdue               3
Activity                    Due today             5
                            ────────────────────────
                            Team Work             38   manager
                            No owner / cover       1   manager
                            [Open Work]
```

- Collapsed badge = my overdue only.
- The expanded panel has counts and one door; no task rows.
- `Open Work` preserves which count was used, by a visible filter on arrival.
- Team remains the one rota/normal-owner home. Calendar remains booking-led. Activity remains a
  history surface.

### 14.9 Notifications composition

The Bell popover uses event rows, not action rows:

```text
NOTIFICATIONS                                              4 unread
────────────────────────────────────────────────────────────────
Work assigned to you
PO-2051 · Call Ohana — confirm ready date                  10:31

Work became overdue
SO-1318 · Ask customer for a delivery date                 09:00

Cover started
You cover Shasha's PO duty today                           08:58

Work completed
Claim CL-18 · Customer Resolution recorded                 Yesterday
────────────────────────────────────────────────────────────────
Mark all read                                      Open Work →
```

- Unread is notification state, not work state.
- The row opens the exact Work item or owning object.
- Reading/dismissing never changes action ownership, due, completion or priority.
- Events caused by the same user do not notify that user unless a governed exception requires it.
- Repeated overdue polling does not mint repeated notifications.

### 14.10 Responsive composition

#### 1024–1279px

```text
Workspace │ Dashboard  Work                                  🔔 ? ⚙
──────────────────────────────────────────────────────────────────
My Work 12   Team Work 38                  Search       Filters
Overdue 3   Today 5   Upcoming 4   Blocked 1
──────────────────────────────────────────────────────────────────
WORK LIST — full width
…

select row → right Drawer (400px)
```

- Persistent Work context pane becomes a 400px Drawer.
- List state stays visible behind it and focus returns to the row on close.
- Dashboard uses one card per row after the three exception summaries wrap.

#### <768px

```text
Workspace                         🔔
Dashboard   Work
────────────────────────────────────
My Work 12       Team Work 38
Search work…              Filters
Overdue 3  Today 5  Upcoming 4
────────────────────────────────────
PO-2051                    2d overdue
Expected Arrival not recorded
Call Ohana — confirm ready date
Covering PO duty
────────────────────────────────────
…

tap → full-screen work context
```

- The portal's desktop Quick Rail disappears; Work is a first-level tab/nav destination.
- `Blocked` moves into the horizontal shortcut scroller or Filters when width cannot hold it; it
  remains visibly active if selected.
- Context is full-screen with `Close` and the owner-object primary button at the bottom.
- Team Work owner headers remain sticky.
- Dashboard becomes one vertical reading path in the governed hierarchy.

### 14.11 Component preflight

| Need | Existing kit answer | Decision |
|---|---|---|
| shell/tabs | shell pattern + `Tabs` | reuse |
| Work list container | Queue/List composition using existing surfaces | compose; do not force variable Work rows into `DataTable` |
| context on wide screen | existing `DetailShell` principles, but read-only work context is page composition | reuse concepts; no new writer |
| compact/narrow context | `Drawer` | reuse |
| search/filter | `SearchInput` · `Popover` · `Select` · `DatePicker` | reuse |
| states | `EmptyState` · `Loading` · persistent page bands already governed | reuse |
| owner identity | **no governed kit Avatar/AvatarChip exists** | approved concept now requires one kit component before build; initials + accessible full name + cover state, no `className` escape hatch |
| management cards | `Card` / `Panel` | reuse; no new KPI-tile species |

The only new kit admission created by the approved layout is `Avatar`/`AvatarChip`. Its business
need is proven by the owner ruling; exact component API belongs to a later Card, not this plan.

### 14.12 Layout rejection list

- No permanent Sales Order `Owner` column.
- No owner name embedded in every action sentence.
- No SO/customer repetition inside a cell whose row already states them.
- No Dashboard action table.
- No Work KPI strip.
- No My Work owner avatars on every normal row.
- No Team Work flat list with an owner column repeated 38 times.
- No Quick Rail execution controls.
- No notification badge that counts open work.
- No manual `Mark done` for system actions.
- No full red work rows.
- No hidden filters from Dashboard drill-down.
- No second business form inside Workspace.

---

## 15. Owner-review rulings required

This blueprint is complete as a product architecture, but five business/governance gaps must be ruled before it is READY FOR CARD:

1. **Delivery action ownership:** keep delivery actions temporarily owned by Sales Order, or move their authoritative definitions/completion to Delivery as ERP Architecture implies. Recommendation: move delivery execution/proof actions to Delivery; keep customer promise/delay decision in Sales Order.
2. **Payment split:** approve Operation receipt submission as one action and Finance verification/exception as the next. Recommendation: split; one action cannot have two owners and two completion moments.
3. **Missing SLA table:** approve owner-specific due rules for amendment confirmations, claims decisions/closure, held stock, emergency stock, receipt corrections, and Finance verification. Recommendation: each module supplies these; no Workspace default.
4. **Human Follow-ups home:** approve separating the existing `ops_tasks` experience from system Work. Recommendation: retain a small `Follow-ups` page for person-authored reminders only; stop generating business actions into it.
5. **New Workspace vocabulary:** approve `Workspace`, `Upcoming`, `Blocked`, `No owner`, `Duty coverage`, `Work health`, `Open Work`, and `Release` with the exact meanings in §10. The structured Owner/avatar presentation is now approved and is no longer part of this unresolved set.

These are business/UI rulings, not engineering execution choices.

---

## 16. Readiness verdict and dependency roadmap

### Verdict

**COMPLETE WORKSPACE BLUEPRINT — READY FOR OWNER REVIEW.**  
**NOT READY FOR CARD** until the five owner rulings above close the remaining authority contradictions and missing SLAs. No implementation is licensed by this document.

### Unnumbered dependency roadmap after approval

```text
Reconcile delivery ownership
→ split Payment submission / Finance verification
→ complete missing owner action contracts and SLA table
→ approve Workspace vocabulary and separate Follow-ups
→ freeze one cross-module projection interface
→ Dashboard/Work information architecture and responsive validation
→ implementation Cards may then be written (not in this plan)
```

## 17. Final self-audit

- Dashboard and Work have separate jobs and one shared architecture: **pass**.
- No Workspace writer duplicates owner truth: **pass**.
- Sales Orders, Purchasing, Receiving, Stock, Delivery, Payment/Finance, Service, and Claims traced: **pass**.
- Owner, actor, object, recipient, result, due/SLA, closure, next action, and deep link addressed: **pass**, with missing authority explicitly marked UNKNOWN and excluded from build readiness.
- My Work, Team Work, duty coverage, overdue, today, upcoming, blocked, history, assignment/Take it/cover, SLA, Quick Rail, Dashboard, Notifications covered: **pass**.
- Two-line system-led grammar and banned generic words applied: **pass**.
- Empty, error, overdue, responsive, vocabulary, ASCII layouts, and current→proposed audit included: **pass**.
- Dashboard avoids a duplicate work queue and blind KPI copying: **pass**.
- No Cards and no production code: **pass**.
