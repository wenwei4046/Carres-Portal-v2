# CARRES WORKSPACE — MASTER

> **The only Workspace document.** Overwritten when re-ruled; never versioned.
> **You read `CLAUDE.md`, `docs/ERP-ARCHITECTURE.md`, `docs/ui/MASTER.md` and this file.**
>
> **Status:** `READY FOR OWNER REVIEW` · PLAN ONLY · no Cards · no production code.
> **NOT `LAYOUT APPROVED`. NOT `READY FOR CARD`.** §17 states exactly what is still open.
>
> **Scope.** Workspace owns TWO pages — `Dashboard` (*what management must know*) and
> `Work` (*what someone must do*) — and the coordination metadata no module owns. It owns no
> business record, no business form and no completion fact.
>
> This file holds ONE current truth. Superseded questions, superseded compositions and the
> history of corrections are **deleted**, not annotated. Git is the archive (`CLAUDE.md` Law 3).

| I am working on | Read |
|---|---|
| the cross-module Work ruling | **§1** |
| what each surface may contain | **§2** |
| the action contract | **§3** |
| a module's actions | **§4** |
| owner · duty · cover | **§5** |
| priority, time and escalation | **§6** |
| a word on screen | **§7** |
| the Work page composition | **§8** |
| the Dashboard composition | **§9** |
| the Right Rail | **§10** |
| Notifications | **§11** |
| what the kit is short of | **§12** |
| current vs proposed | **§13** |
| what is still unruled | **§15 · §16 · §17** |

---

# §1 · APPROVED / LOCKED — the one cross-module Work coordination surface

**Owner ruling. This is the governing statement of the whole document.**

```
Carres has ONE cross-module Work coordination surface:  Workspace → Work.
```

**Owning modules keep their local operational registers, queues and action views.** Those
surfaces own the business object, its evidence, its write door and its completion fact.
**They are not separate Work Engines.**

The same obligation, shown locally and shown in Workspace, must retain:

```
one action identity
one owner rule
one due / SLA rule
one completion fact
one authoritative deep link
```

**Workspace READS the owning module's action projection.** It may not independently copy,
assign, reschedule or complete the business obligation.

### The interpretation, module by module

| Surface | Ruling |
|---|---|
| Delivery's local `Delivery Work` capability | **Delivery-owned and it stays.** It is not a second cross-module Work Engine. |
| Issue Tracker | **An owning-module destination.** It is *not* a competing destination beside Work. Its `Current Action` remains authoritative on the issue; Work projects that action and never restates or re-derives it. |
| Purchasing claims queue | **A Purchasing-owned view.** |
| Receiving's local operational view | **It stays.** It may not present itself as a parallel global Workspace. |
| The word `Work` | Identifies the **cross-module coordination surface**, unless a module MASTER explicitly governs a qualified local business name (`Delivery Work`, `Correction work`). A bare local `Work` page in a module is forbidden. |

**Consequence for `ERP-ARCHITECTURE.md` §4.** The action engine is the ERP's, not one module's.
Workspace is its ONE cross-module *reader*. It is not a second engine and raises no action.

---

# §2 · Product boundary

| Surface | Its one question | Contains | Must not contain |
|---|---|---|---|
| **Dashboard** | What must management know now? | broken commitments, exposure, trend, workload health, duty coverage, named drill-downs | a work queue, row-level actions, tick boxes, KPI wallpaper, a duplicate module report |
| **Work** | What must someone do next? | open system actions, owner, due/calendar, blockers, required result, the owning door | person-authored reminders, copied business records, a manual `Done`, charts |
| **Follow-ups** | What did one person ask another to remember? | person-authored reminder, assignee, human completion | system actions, derived SLA truth, automatic business completion |
| **Notifications** | What changed that I should notice? | assignment, cover start, newly late, unblock, source failure, subscribed completion | durable work state, unread-as-priority, a second task list |
| **Right Rail** | Is there work or coverage I must open? | counts and one door | any execution, editable rows, an independent calculation |
| **Owning module** | How is this business result completed? | the record, its forms, its evidence, its history, the completion mutation | a Workspace-owned copy |

**Follow-ups and Work may never appear in one list** (`ACTION-FLOW-STANDARD.md` Law 7). One
closes when the system measures it; the other closes when a person says so. Mixed, staff learn
that some rows leave by themselves and some do not, and then trust neither.

### The non-negotiable data flow

```
OWNING MODULE
stored facts  ->  its action projection  ->  Workspace Work  ->  deep link  ->  owning write door
                        |                         |
                        |- same identity          |- reads only
                        |- same due / calendar    |- never records a business result
                        |- same completion fact   |- never mints a second identity

business result recorded in the owning module
      ->  the action projection is no longer open
      ->  the Work row leaves Open and enters History
      ->  Dashboard figures recompute
      ->  a notification may be emitted
```

**Workspace stores only what no module owns:** the stable projection identity, presentation
timestamps, notification delivery/read state, and the cover/assignment audit where an owner
action permits assignment. It stores no customer, PO, stock, receipt, delivery, payment, case,
claim or issue truth.

---

# §3 · The action contract

**The shape is `ACTION-FLOW-STANDARD.md` Law 2, APPROVED / LOCKED 2026-08-14. This file does
not restate the engine law; it states what Work needs on top of it to project a row.**

```
Trigger
Owner rule
Resolved normal owner
Today's actor or cover
Action
Completion fact
Due date and governing calendar
Source object
Cover rule
Deep link
```

### The projection fields Work reads

| Field | Rule |
|---|---|
| `workId` | `{ownerModule}:{actionKey}:{objectType}:{objectId}:{occurrenceKey}`. One open obligation never mints a second row on refresh. |
| `ownerModule` | A governed record owner: Sales Order · Purchasing · Receiving · Stock · Delivery · Payment/Finance · Service · Supplier Claim · Issue Tracker. **A view is never an owner.** |
| `actionKey` | The owning engine's canonical key. Never free text. |
| `objectType` / `objectId` | The business object whose stored facts trigger and close the work. |
| `objectLabel` | The human handle — `SO-1318`, `PO-2051`, `GRN-…`, `CL-18`, `SN-…`. |
| `factLabel` | The measurable fact or problem, and only that. |
| `actionLabel` | The canonical action, and only that. `COPY-STANDARD.md`'s seven verbs; ≤ 10 words; the owner's name is never inside it. |
| `ownerRule` | The governed resolver — Responsible Salesperson · current PO Duty · current GRN Duty · Payment owner · Delivery owner · Service Case owner · Claim owner · Issue owner. |
| `taskOwnerKind` | `person` or `duty`. Never an email convention. |
| `taskOwnerId` | The normal resolved identity. **A Sales Order has no universal action owner.** |
| `actingPersonId` | Who acts today after roster/cover. May equal the task owner. The normal owner is always preserved. |
| `recipient` | The named supplier, logistics company, customer, warehouse or internal owner when the action has one. `null` only when none is inherent. |
| `requiredResult` | The stored fact(s) that close it, phrased for the operator. |
| `triggeredAt` | The observed instant the trigger first became true. Never reconstructed from *now* when it decides the SLA. |
| `dueAt` / `dueDate` | ONE exact due result from the owning engine. |
| `calendar` | `office` · `warehouse` · `delivery`, or a governed supplier calendar where the rule expressly needs one (`ACTION-FLOW-STANDARD.md` Law 2A). |
| `timeState` | `late` · `today` · `later` · `none`. Derived, never chosen. |
| `priorityClass` | `broken_commitment` · `today_run` · `customer_waiting` · `goods_unsecured` · `delivery_preparation` · `money`, or an owner-governed equivalent. |
| `blocked` / `blockedBy` | True only when a **named** dependency prevents the required result now, carrying the owner module/object/action and the plain fact. Waiting is not blocked. |
| `closeWhen` | The module's machine-readable completion predicate. |
| `deepLink` | Opens the owning object at the exact action region / write door. Never a module landing page when a record door exists. |
| `openedRevision` | Version/hash of the source facts used to project the row — concurrency and audit. |
| `closedAt` / `closedBy` | Derived from completion evidence. `closedBy` may be the system or the human whose recorded act produced it. |
| `visibility` | Inherited from the owning object. **Workspace never widens access.** |

### Admission test — a `no` excludes the candidate

```
1  Can a human produce the result?
2  Does exactly ONE module own the result and its completion evidence?
3  Is the trigger computed from stored truth?
4  Is the required result explicit?
5  Is there a due rule with a named calendar, or an express `none`?
6  Is the responsible person or duty resolvable?
7  Does the deep link reach the real write door?
8  Will it close by itself when the outcome is recorded?
```

**A number the system should have stamped and did not is NOT work** (`ACTION-FLOW-STANDARD.md`
Law 7). It is a fact in the record and a defect to report. It reaches Dashboard `Work health`,
never a person's list.

### Presentation law — APPROVED / LOCKED

```
object identity   row/card header or its governed Register column — never inside the sentence
fact or problem   first semantic line
resolved owner    structured avatar / metadata, OUTSIDE the sentence
action            second semantic line; the action and nothing else
completion fact   an authoritative owner-module fact, never copied prose
due               derived through the governed calendar law
cover             normal owner AND today's actor, both retained as evidence
```

- **My Work normally omits the current user's own avatar.** It appears only for cover or handover.
- **Team Work groups by NORMAL owner.** Owner identity sits in the group header, not on every row.
- **Cover preserves both identities** and never rewrites source ownership.
- **Workspace never stores a second copy of business truth.**
- **System Work has no manual `Mark done`.**

---

# §4 · Complete module action coverage

**Every row below is the OWNING module's action. Workspace restates none of them; it projects
them.** `UNKNOWN` means repository authority does not determine the rule — §15 carries the six
that must be ruled.

## 4.1 · Sales Order

| Action | Trigger | Owner rule | Required result / completion fact | Due · calendar | Door |
|---|---|---|---|---|---|
| `Delay planning` | latest supplier date exceeds Customer Delivery | order PIC / case owner | decision recorded: promise still met, or not | 2 Office working days from stored detection | SO delay region |
| `Case owner decision required` | supplier cannot fulfil and the order needs a decision | case owner only | the governed decision is recorded | **UNKNOWN — §15.2** | the affected SO issue |
| Sales Order amendment decision | staff requests an order change | management duty | approved or rejected, with reason | **UNKNOWN — §15.1** | the amendment |
| Amendment owner confirmation | an approved change affects another owner | the affected owner module's duty | executable confirmed, or refused with reason | **UNKNOWN — §15.1** | the owner consequence |

Sales Order **displays** Purchasing, Delivery and Payment actions and owns none of them. Its PIC
may remain case owner; Work always uses the task owner supplied by the action's owning module.

## 4.2 · Purchasing

| Action | Trigger | Owner rule | Required result / completion fact | Due · calendar | Door |
|---|---|---|---|---|---|
| `Issue PO` | approved demand is still uncovered | current PO duty, or buddy cover | the formal PO exists | engine order-by / PO-day rule · Office | SO Batch Purchase selection |
| `Call {supplier} — confirm ready date` | ready date missing, changed, late or needing reconfirmation | PO duty or cover | latest ready date and the outcome are recorded | arrival-window rule · Office | PO call region |
| `Call {supplier} — confirm tomorrow's delivery` | supplier delivery expected tomorrow | PO duty or cover | the supplier's answer is recorded | owner call rule · Office | PO call region |
| `Call {supplier} — confirm balance delivery date` | receipt is short and the balance date is absent or expired | PO duty or cover | the balance date is recorded | owner call rule · Office | PO call region |
| `Check Expected Arrival` | the factory has never named an arrival day, or the day it named has passed | PO duty or cover | the expected arrival date is recorded | owner call rule · Office | PO register `Current Action` door |
| Mark emergency request ordered | an approved urgent request has been placed | `po_duty_editor` duty | the PO link/result is recorded | **UNKNOWN — §15.4** | request / PO door |

**`PO day — N orders short of stock` is retired at cutover.** It is a generated `ops_task` that
duplicates the real `Issue PO` population and closes by a human tick. The duty holder sees the
derived actions instead.

## 4.3 · Receiving

| Action | Trigger | Owner rule | Required result / completion fact | Due · calendar | Door |
|---|---|---|---|---|---|
| `Check in from {supplier}` | goods physically arrive and need counting and posting | current GRN duty, or buddy cover | the Receiving Session is posted, with counts and exceptions | arrival-day · **Warehouse** | Receiving Workspace |
| `Return` the count | a warehouse count must go back to the other side for check or recount | the current holder on each side | the state records the count returned to the named recipient | **UNKNOWN — §15.5** | the receipt count |
| Correction work | an amend/void consequence is unresolved | GRN duty or the assigned owner | correction evidence recorded; closed by source state | **UNKNOWN — §15.5** | the correction record |

**Receiving never raises `Check in` merely because a PO has outstanding quantity.** It enters
Work only when the arrival makes the act executable. The local correction list stays
Receiving-owned; it is not a parallel Workspace (§1).

## 4.4 · Stock

| Action | Trigger | Owner rule | Required result / completion fact | Due · calendar | Door |
|---|---|---|---|---|---|
| `Reorder stock` *(word not yet in the dictionary — §7.4)* | free + incoming cover is at or below the governed reorder point | stock planner duty | an approved replenishment demand exists, or the reorder point changes | **UNKNOWN — §15.4** | the Stock row |
| Resolve held stock | a receiving exception quarantined a unit | stock owner | the unit becomes free, returns to the supplier, or is written off | **UNKNOWN — §15.4** | the held unit |
| Emergency stock request decision | an internal urgent request awaits planning | `stock_planner` duty | approved or rejected, with a governed reason | **UNKNOWN — §15.4** | the emergency request |
| Stock amendment confirmation | an SO amendment affects a reserved unit | stock owner | a suitable atomic allocation is confirmed, or refused | **UNKNOWN — §15.1** | the allocation consequence |

**`Set a number` is configuration, not Work.** An SKU with no reorder point states that fact on
the Stock screen; it never becomes a person's row until an owner and a due rule exist.

## 4.5 · Delivery — **APPROVED / LOCKED ownership**

**Delivery owns assignment, the Delivery Order, the delivery result, the proof, the delivery
problem and its own local operational view.** Sales Order only READS governed delivery facts.
Sales Order keeps the customer promise and the delay decision.

| Action | Trigger | Owner rule | Required result / completion fact | Due · calendar | Door |
|---|---|---|---|---|---|
| `Assign logistics` | the order needs delivery and none is chosen | Delivery owner | the logistics company is recorded | 3 Office working days before Customer Delivery | delivery region |
| `Call {logistics} — confirm delivery date` | logistics chosen; the customer-confirmed date and slot are absent | Delivery owner | the customer-confirmed date AND slot are recorded | configured Office working days before the date | booking region |
| `Call {logistics} — arrange new delivery date` | `Delay planning` ruled the promise cannot be met | **Sales Order** / order PIC | a new customer-confirmed date and slot exist | the same Office working day | delay / booking region |
| `Issue delivery order` | a booking exists, goods are ready, and no Finance payment exception holds it | Delivery owner | the governed DO exists | before the delivery run · Delivery | the DO door |
| `Deliver today` | the confirmed delivery date is today | Delivery / delivery operator | delivered, or a delivery problem with its governed reason | today · **Delivery** | delivery execution |
| `Upload delivery photo` | a delivery was recorded without proof | Delivery / delivery operator | the file exists | 1 working day after delivery · Delivery | the proof region |
| Delivery problem follow-up | a delivery problem is recorded | **UNKNOWN — §15.3** | **UNKNOWN — §15.3** | **UNKNOWN — §15.3** | the delivery problem |
| Delivery amendment confirmation | an SO amendment affects an active booking or DO | Delivery owner | an executable revision is confirmed, or refused | **UNKNOWN — §15.1** | the delivery consequence |

**`Call {logistics} — arrange new delivery date` stays with Sales Order** because it executes a
decision about the PROMISE, and the promise is the Sales Order's (`ERP-ARCHITECTURE.md` §3.2).
Everything that moves goods or produces delivery evidence is Delivery's.

**Consequence — §16.1.** `docs/delivery/MASTER.md` still declares Delivery a view that owns no
record and defines no action, and `docs/orders/MASTER.md` §7 still defines the delivery actions.
Both must be corrected in the same approved change before these action keys are frozen.

## 4.6 · Payment / Finance — **APPROVED / LOCKED, no split**

**Recording a payment is the SETTLEMENT.** It is ONE action, with one owner and one completion
fact. **Later bank matching is EVIDENCE attached to that payment record — it is not a second
Work action and never reopens the first.**

| Action | Trigger | Owner rule | Required result / completion fact | Due · calendar | Door |
|---|---|---|---|---|---|
| `Collect RM {amount} from {customer}` | the goods are collectable and money is outstanding | collections owner | the payment is recorded against the order, minting its receipt number | balance due date · Office | the Payment row |
| Clear payment exception | Finance explicitly recorded `payment not received` or opened a payment exception, holding delivery | Finance duty | the exception is cleared, or its final resolution is recorded | **PROPOSAL, NOT LAW — §15.7** | the payment exception |
| Supplier claim credit / debit evidence | a supplier owes Carres after a claim | Finance duty | the external credit-note / debit-note reference is recorded | **UNKNOWN — §15.2** | the Finance claim consequence |
| Amendment value consequence | an applied or requested change moves order value | Finance owner | the governed financial consequence is recorded | **UNKNOWN — §15.1** | the Finance consequence |

**Outstanding money never holds a delivery.** Only an explicit Finance `payment not received` /
payment exception does, and only Finance clears it (`docs/payment/MASTER.md` §2, owner ruling
2026-08-12; `ERP-ARCHITECTURE.md` §3.7).

**What this retires.** The former proposal to split `Collect` into an Operation submission action
and a Finance verification action is **rejected and deleted**. `Verify receipt/payment` is not a
Work item. Verification is Finance reading its own record; bank matching is evidence.

## 4.7 · Service Case

| Action | Trigger | Owner rule | Required result / completion fact | Due · calendar | Door |
|---|---|---|---|---|---|
| Derived case step | the intake plan requires a business event | case owner or step owner | the required outcome DATE is stored | the governed case plan · Office | the exact case step |
| `Call {customer} — explain the delay` | the case reaches 4 working days before its deadline unfinished | case owner | the call outcome and one governed reason are recorded **against this deadline** | 4 Office working days before the deadline | the deadline region |
| `Close` the case | every step is complete and the customer confirms | case owner | a `customer_confirmed` entry carrying the customer's business date exists | 14 Office working days from report, extend once within bound | the closure region |

**Step labels and recipients are emitted by `service-case-plan`.** Workspace generates none.
**Nothing here is a tick box** — a step closes because a date exists.

## 4.8 · Supplier Claim

| Action | Trigger | Owner rule | Required result / completion fact | Due · calendar | Door |
|---|---|---|---|---|---|
| `Call {supplier} — confirm what happens next` | a receiving exception opened a claim and the supplier's answer is needed | claim owner | the request and the supplier's answer are recorded | **UNKNOWN — §15.2** | the claim supplier-response region |
| Select Customer Resolution | the supplier's response needs a Carres decision | claim owner or case owner | the Customer Resolution is recorded | **UNKNOWN — §15.2** | the claim resolution region |
| Select Item Outcome | the held item needs a disposition | claim owner, Stock consequence | the item outcome is recorded and the Stock transition executes | **UNKNOWN — §15.2** | the claim item region |
| `Close` the claim | both sides and the required evidence are complete | claim owner | the close gate passes and the claim is sealed | **UNKNOWN — §15.2** | the claim |

Claims stay authoritative for **supplier-side** exceptions only. A fault found after delivery is
a Service Case; it becomes a Supplier Claim only when the approved second entrance is governed
and built (`ERP-ARCHITECTURE.md` §3.8, `docs/service/MASTER.md` §6).

## 4.9 · Issue Tracker

**Repository truth:** `apps/web/src/pages/operation/OperationServiceNotes.tsx` — every issue
takes an `SN` number, carries a deadline, and moves through a stored stage flow.

**Ruling (§1).** Issue Tracker is an **owning-module destination**, not a competing destination
beside Work. **Its `Current Action` is authoritative on the issue.** Work projects that action
verbatim and never restates, re-derives or re-labels it.

| Action | Trigger | Owner rule | Required result / completion fact | Due · calendar | Door |
|---|---|---|---|---|---|
| The issue's `Current Action` | the issue's stored stage exposes exactly one open action | **UNKNOWN — §15.6** | **UNKNOWN — §15.6** | deadline exists; the calendar is **UNKNOWN — §15.6** | the issue |

**Issue Tracker is EXCLUDED from Work until §15.6 is ruled.** It fails admission questions 5 and
6. Its deadline is visible on its own page today; Workspace does not fabricate an owner for it.

---

# §5 · Ownership, assignment and duty cover

## 5.1 · Four identities, never one ambiguous `owner`

| Identity | Meaning | Changes? | Where it shows |
|---|---|---|---|
| **Record owner module** | owns the business truth and its closure | only by an architecture ruling | the module word |
| **Case owner** | answerable for the customer/order/case end to end | rarely, by governed reassignment | object context; never repeated per action when identical |
| **Task owner** | the person or duty accountable for THIS result | yes, where the owner action permits | the row's avatar metadata · the Team Work group |
| **Acting person** | who does it today, including cover | with roster and cover | only when it differs from the task owner |

## 5.2 · Assignment

1. Owner modules assign **automatically** at trigger time from their governed person/duty rules.
2. Person-owned work enters that person's `My Work` immediately.
3. Duty-owned work resolves the current holder dynamically. The row keeps the duty identity and
   names the acting person.
4. A manager may reassign **only** where the owner action permits it. Reassignment changes
   coordination, never source business truth.
5. **There is no manual claim.** `Take it` and `Release` are removed from Workspace — they are
   not approved vocabulary and every action in §4 resolves an owner automatically. If a
   genuinely group-claimable action is ever ruled, it needs its own owner decision and its own
   word before any surface may offer it.
6. **Completing a business action is never `Mark done` in Work.** The owning module records the
   result; the row leaves by itself.

## 5.3 · Duty and buddy cover

Carres' approved PO/GRN rotation is the model and is unchanged:

```
PO duty and GRN duty are OFFSET — the same two people do not cover each other
the no-duty buddy covers either duty
planned `Away` activates cover from the start of the day
before 10:00 MYT, no heartbeat is NOT absence
from 10:00 MYT, no heartbeat today activates cover
when the holder returns, new and open duty work resolves back to the holder
no business row is rewritten to express temporary cover
both duty holders absent -> the remaining person covers both,
                            and Dashboard raises `Duty coverage`
```

**The Team panel remains the one home for the rota.** Work explains cover only on the rows where
it changes who acts today.

---

# §6 · Priority, time and escalation

## 6.1 · One deterministic order

Open Work sorts by:

```
 1  broken commitment / failed today's run
 2  late duration, longest first
 3  due today
 4  the customer must be told (through logistics)
 5  goods not secured
 6  delivery preparation
 7  money
 8  due date and time
 9  the customer's promised date
10  stable object / action identity
```

This is `ACTION-FLOW-STANDARD.md` Law 4 and Law 5 applied across modules. Managers may filter and
group; **nobody drags business priority**, and a person-entered `Urgent` flag can never outrank a
late system commitment.

## 6.2 · Time states

| State | Rule | Presentation |
|---|---|---|
| `Late` | now is beyond the owner-computed due | red time text and a red rail count. **Never a red button.** |
| `Today` | due on the active business day | neutral and strong; no alarm while still on time |
| `Later` | due after today, inside the selected horizon | the actual weekday and date through `fmtDate()` |
| `Blocked` | a **named** dependency prevents the required result now | the named dependency; the original due and late state are kept |
| no due | the owner expressly rules no SLA | hidden from the time buckets; permitted only with a reason in the contract |

**Blocked does not pause the SLA** unless the owning business rule expressly says the clock
pauses. If it does, the pause event is stored and the revised basis is shown. **A date is never
moved silently.**

## 6.3 · Escalation

- Newly late: notify the task owner / acting person **once**.
- Still late at the owner-defined threshold: notify the responsible manager. **Never mint a
  second task about a task** — `Chase` is a banned word and a chase row is a banned shape.
- Broken commitment or failed delivery: management visibility immediately.
- No owner, unresolved duty, missing deep link, projection failure: **Dashboard `Work health`**,
  never a person's Work row.
- **There is no universal 60-minute SLA.** Each action owns its due rule and names its calendar.

---

# §7 · Exact vocabulary

> The dictionary is **`docs/COPY-STANDARD.md`**. `docs/UI-DICTIONARY.md` does not exist in this
> repository. Banned display words are `COPY-STANDARD.md`'s list plus `01-design-tokens.md` §10.
> **A word not ruled may not appear on screen.**

## 7.1 · Words reused from the existing dictionary

`Dashboard` · `Work` · `My Work` · `Team Work` · `Today` · `Later` · `Completed` · `History` ·
`Search` · `Clear filters` · `Close` · `Open order` · `Open purchase order` ·
`Assign` · `Call` · `Issue` · `Upload` · `Return` · `Check` *(missing-fact meaning only)*.

`My Work` is `ACTION-FLOW-STANDARD.md`'s own word — the new hire's four-line training opens it.
`Later` is `COPY-STANDARD.md`'s ruled word for everything beyond the rolling window.

## 7.2 · Words removed from this blueprint

| Removed | Why |
|---|---|
| `Upcoming` | **Banned by `COPY-STANDARD.md`**: *"Never `Upcoming` · `Future` · `Beyond`"*. The ruled word is **`Later`**. |
| `Exception` / `Exceptions` as a heading | **Banned by `01-design-tokens.md` §10.** No umbrella heading replaces it — see §7.3. |
| `Take it` | Not approved vocabulary. There is no manual claim (§5.2.5). |
| `Release` | Not approved vocabulary. Nothing is claimed, so nothing is released. |
| `Delivery Exception` | The owning module's fact is a **delivery problem** and its governed reason. |
| `Escalation inbox` | A row-level queue inside a management overview. Its rows are Work; its count is `Work health`. |

## 7.3 · The umbrella-heading ruling

**There is no approved umbrella noun for *"broken commitments, duty coverage and work health"*,
and this document does not invent one.**

`Needs a decision` is **rejected as a blanket heading**: a broken commitment needs an act, duty
coverage needs cover, and a projection failure needs an engineering fix. Only some of them need a
manager's decision, so decision language would be false on two cards out of three.

**The resolution: the umbrella heading is DELETED. The three management facts are three named
regions, each stating its own name.**

```
Broken commitments      Duty coverage       Work health
```

**Decision language is used only where the governing rule genuinely requires a manager
decision** — `Sales Order amendment decision`, `Emergency stock request decision`,
`Case owner decision required`, `Select Customer Resolution`. Nowhere else.

## 7.4 · Words still requiring an owner ruling in `COPY-STANDARD.md`

| Word | Exact meaning | Never means |
|---|---|---|
| `Workspace` | the top-level home holding Dashboard and Work | the batch Workspace **page pattern** in `03-page-patterns.md` |
| `Work` | the one cross-module coordination surface | a module's local queue |
| `Late` | now is beyond the owner-computed due | difficult · at risk · behind |
| `Blocked` | a named dependency prevents the required result now | waiting · late · difficult |
| `Covering` | this person acts today for the normal owner | a permanent reassignment |
| `No owner or cover` | owner resolution failed, and no cover resolves either | anybody may casually take it |
| `Duty coverage` | the current holder is covered, or no safe cover exists | the ordinary leave calendar |
| `Work health` | management-only integrity of ownership, cover, source and lateness | a staff performance score |
| `Open Work` · `Open My Work` | navigate to the Work page | perform a business act |
| `Open {object}` | navigate to the exact owning object | a generic `View` / `Details` |
| `Reorder stock` | Stock's replenishment action label | a Purchasing act |

**Two collisions are recorded rather than silently resolved, and both must be ruled with the
words above** (§17):

1. **`Late` versus `Overdue`.** This document uses **`Late`** on the owner's instruction.
   `COPY-STANDARD.md`'s rail-calendar ruling uses **`Overdue`** for the same fact, and
   `docs/service/MASTER.md` already writes `2 working days late`. **Two spellings of one fact is
   the exact defect the dictionary exists to stop.** One must win portal-wide.
2. **`Today` versus `Due today`.** The Work bucket is `Today`; the Right Rail count line reads
   `Due today` (§10, owner's verbatim specification). One word, one meaning — one must win.

## 7.5 · Banned in Workspace, always

Standalone `Follow up` · `Handle` · `Process` · `Pending` · `Action required` · `Needs
attention` · `To do` · `Done` for system work · `Chase` · `At Risk` · `Attention` ·
`Scheduled` · `Unscheduled` · `Soon` · `Check` without a named missing fact.

**Channel is never the action.** `Open WhatsApp` · `Open WhatsApp group` · `Copy message` exist
only inside the owning action surface (`ACTION-FLOW-STANDARD.md` Law 8 — the Observation Law).
If a recipient has no stored identity, the owner action is not presentation-ready and Workspace
does not guess.

## 7.6 · Worked lines

```
PO-2051 · Expected Arrival not recorded
[YJ] Call Ohana — confirm ready date

SO-1318 · Customer-confirmed delivery date and slot not recorded
[KY] Call NETS Logistics — confirm delivery date

SC-104 · 4 working days remain and the case is not finished
[SH] Call Umi — explain the delay

CL-18 · Supplier rejected replacement
[KY] Select Customer Resolution
```

Register density for the same contract, where `SO No` and `Customer` already own columns:

```
[late] No delivery date
[SH]   Ask customer for a delivery date
```

`[SH]` is an independent avatar chip whose accessible name is `Shasha`. It is never sentence
text, and the action never becomes `Shasha · Ask customer…`.

---

# §8 · Work — the composition

> **Work is the governed `Queue` page pattern** (`03-page-patterns.md`): *process multiple work
> items*, hierarchy **current work · priority · status · assignee**, regions **Filters · Queue
> list · Detail panel · Bulk actions**.
>
> **It is NOT the `Workspace` page pattern.** That pattern exists to decide across many records
> and **commit in one act**; Work commits nothing and its unit of thought is one obligation, not
> a batch. The earlier composition borrowed the Workspace pattern's toolbar/banner/grid/footer
> shape and is deleted.
>
> **`Bulk actions` is `NOT NEEDED AFTER REDESIGN`** — system Work has no manual completion, no
> claim and no batch commit, so the region has no act to hold.
>
> **Every number below is a governed token.** Nothing on this page invents a size.

## 8.1 · The shared shell

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Workspace │ Dashboard  Work              page-meta │ [bell] [help] [settings]    │ 44
├──────────────────────────────────────────────────────────────────────────────────┤
│ page content — the only region a page owns                                       │
└──────────────────────────────────────────────────────────────────────────────────┘
```

- The shell draws the header; **neither page draws one** (`03-page-patterns.md`, 壳画头).
- **One row · 44px · white · never scrolls.** `Workspace` is the module word; `Dashboard` and
  `Work` are the only tabs; the global icon cluster keeps its approved order.
- **No page repeats its lit tab as an H1.**
- **Tab badge: `Work` carries my `Late` count and nothing else.** Dashboard has no badge — a
  management summary is not an inbox.
- Dashboard scrolls vertically. **Work does not scroll: the queue list is its only scroller.**

## 8.2 · Work — wide desktop, ≥ 1280px

**Widths are `01-design-tokens.md` §8 verbatim:** content `desktop-max-width 1280` less
`page-padding 32` each side = 1216 · navigator `workspace-rail-width 200` · context
`side-panel-width 420` · queue list takes the remainder (596 at 1280).

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Workspace │ Dashboard  Work                     page-meta │ [bell] [help] [settings] │ 44
├───────────────┬──────────────────────────────────────────┬───────────────────────────┤
│ NAVIGATOR 200 │ [search] Search work   Filters  Updated 10:42 │  WORK CONTEXT  420    │ GridToolbar
│               ├──────────────────────────────────────────┤                           │
│ MY WORK    12 │ LATE · 3                                 │  PO-2051                  │
│   Late      3 │ ──────────────────────────────────────── │  Purchasing               │
│   Today     5 │ PO-2051 · Expected Arrival not recorded  │                           │
│   Later     4 │ [YJ] Call Ohana — confirm ready date     │  FACT                     │
│   Blocked   1 │                        Late 2 days · covering │  Expected Arrival not │
│               │ ──────────────────────────────────────── │  recorded                 │
│ TEAM WORK  38 │ SO-1318 · No delivery date               │                           │
│   No owner    │ Ask customer for a delivery date         │  ACTION                   │
│   or cover  1 │                    Late 1 day · Sales Order │  Call Ohana — confirm   │
│   Late      9 │ ──────────────────────────────────────── │  ready date               │
│   Today    24 │                                          │                           │
│   Later     5 │ TODAY · 5                                │  REQUIRED RESULT          │
│   Blocked   3 │ ──────────────────────────────────────── │  Latest ready date and    │
│               │ CL-18 · Supplier rejected replacement    │  the supplier's outcome   │
│               │ [KY] Select Customer Resolution          │  are recorded             │
│               │                  Today · Supplier Claim  │                           │
│               │ ──────────────────────────────────────── │  OWNER                    │
│               │ SN-207 · … (excluded until §15.6)        │  Normal   [SH] Shasha     │
│               │                                          │  Today    [YJ] Yu Jun     │
│               │ …                                        │           covers PO duty  │
│               │                                          │                           │
│               │                                          │  DUE                      │
│               │                                          │  Late 2 Office working    │
│               │                                          │  days · was Tue 11 Aug    │
│               │                                          │                           │
│               │                                          │  WHY THIS EXISTS          │
│               │                                          │  No ready date is on file │
│               │                                          │  and PO-2051 covers       │
│               │                                          │  SO-1318                  │
│               │                                          │                           │
│               │                                          │  NEXT                     │
│               │                                          │  Check in from Ohana can  │
│               │                                          │  start once the date is   │
│               │                                          │  recorded                 │
│               │                                          │                           │
│               │                                          │  [Open purchase order]    │
└───────────────┴──────────────────────────────────────────┴───────────────────────────┘
   200                        596 — the only scroller                  420
```

### Region responsibilities

| Region | Its one job | Rules |
|---|---|---|
| Navigator `200` | the Queue pattern's `Filters` region: scope, then time | **Left guides, right frees.** Every time block is a toggle and clears all the way. Scope is exclusive. Counts are `tabular-nums`. `TEAM WORK` renders only with the governed management permission. |
| `GridToolbar` — **one row** | narrow by words, open the filter menu, state freshness | `[ search ] ······ [ Filters ] [ Updated hh:mm ]`. **One row, one per page.** `meta` is the freshness stamp — **never a Refresh button**; a queue recomputes itself. |
| Queue list | scan and choose one obligation | The only vertical scroller. `SectionHeader` marks each time band. |
| Work context `420` | explain and hand over | Read-only. **One** primary button: `Open {owning object}`. It never embeds the owner's form. |

**What this removes from the earlier composition:** the second toolbar row, the invented 40px and
36px band heights, the invented 292px pane, the invented footer band, and `Clear` sitting on a
band of its own. `Clear filters` lives in the active-filter band (§8.9) and nowhere else.

## 8.3 · The list row — anatomy and height

```
row-comfortable = 56          padding 8 + line 18 + gap 4 + line 18 + padding 8 = 56
                              every number is a governed token; nothing is invented

┌──────────────────────────────────────────────────────────────────────┐
│ {objectLabel} · {factLabel}                          {time state}    │  text-body 13/18
│ [avatar] {actionLabel}                               {right meta}    │  text-body 13/18
└──────────────────────────────────────────────────────────────────────┘
```

**The row is `row-comfortable` — 56px.** `01-design-tokens.md` §7 governs exactly three row
heights (40 · 48 · 56). **72 and 88 were a fourth and a fifth and are deleted.** The composition
was rebuilt to fit the largest governed row rather than the number patched.

**`row-compact` 40 is not used here, and that is not a violation of the 40px law.** That law
binds *the rows you SCAN in a table*, and `DataTable` formats nothing, spells nothing and holds
one fact per cell. A Work row carries two semantic lines by owner ruling, so `DataTable` is the
wrong species and `row-comfortable` is the right governed height.

**The right meta slot holds ONE fact, by this precedence:**

```
1  Blocked by {object or fact}     — a named dependency outranks everything
2  covering {person}'s {duty}      — cover changes who acts today
3  {owner module}                  — the default
```

The full set — module, cover, blocker, calendar — is **always** in the context pane, so nothing
is lost. This is what replaced the invented third and fourth row lines.

**Colour on the row:**

- **Selection is blue** (`info`, `blue-3`) and **hover is grey** (`slate-3`) —
  `01-design-tokens.md` §2.3. Blue marks exactly two things on a screen.
- **Late is red on the time text only.** No full red row, no red button, no red fill.
- Two lines carry their meaning **without colour**; the time state is a word, not a dot.
- `[avatar]` is `badge-height 24`, `rounded-full`. It is a chip, never sentence text.

## 8.4 · My Work

The user already knows the work is theirs, so a normal row shows **no avatar**.

```
LATE · 3
────────────────────────────────────────────────────────────────
SO-1318 · No delivery date
Ask customer for a delivery date                Late 1 day · Sales Order
────────────────────────────────────────────────────────────────
PO-2051 · Expected Arrival not recorded
[YJ] Call Ohana — confirm ready date       Late 2 days · covering Shasha's PO duty
────────────────────────────────────────────────────────────────

TODAY · 5
────────────────────────────────────────────────────────────────
GRN · 3 items arriving from Ohana
Check in from Ohana                                  Today · Receiving
────────────────────────────────────────────────────────────────
```

**The avatar appears only for cover or handover** — the second row above is Yu Jun covering
Shasha's PO duty, so both identities survive on one line.

## 8.5 · Team Work

**Grouped by NORMAL owner.** The group header is an `AvatarChip` beside a `SectionHeader`; group
headers stay sticky inside the list scroller.

```
No owner or cover                                        1 open · 1 late
────────────────────────────────────────────────────────────────
PO-2088 · Expected Arrival not recorded
Check Expected Arrival                       Late 3 days · Purchasing
════════════════════════════════════════════════════════════════

[SH] Shasha                                              8 open · 2 late
────────────────────────────────────────────────────────────────
SO-1318 · No delivery date
Ask customer for a delivery date                   Today · Sales Order
────────────────────────────────────────────────────────────────
PO-2051 · Expected Arrival not recorded
[YJ] Call Ohana — confirm ready date        Late 2 days · Yu Jun covers today
════════════════════════════════════════════════════════════════

[YJ] Yu Jun                                             12 open · 1 late
────────────────────────────────────────────────────────────────
…
```

- **The owner's identity appears once, in the group header.** A row carries a second avatar only
  when the acting person differs from the group's normal owner.
- **`No owner or cover` is the first group and is management-only.**
- **Group collapse is refused.** Hiding a late group is a dangerous personal layout state, and
  `docs/ui/MASTER.md` §4 already refuses per-user layout memory.
- **Counts are workload facts, never performance scores** — `COPY-STANDARD.md`: a number is not
  a status until somebody has set the line it is judged against.

## 8.6 · The selected-action context

The pane answers seven questions, in this order, and asks nothing else:

```
1  What object is this?                     PO-2051 · Purchasing
2  What fact opened the action?             FACT
3  What action is required?                 ACTION
4  What authoritative result closes it?     REQUIRED RESULT
5  Who owns it, and who acts today?         OWNER
6  When is it due, on which calendar,
   and what blocks it?                      DUE  ·  BLOCKED BY
7  What is expected to happen next?         NEXT
                                            [Open {owning object}]
```

`NEXT` is a **forecast from the owner engine**, never a promise Workspace stores. The only
primary button is `Open {owning object}` — `Button` primary, one per screen.

**The pane must never show:**

```
a manual `Mark done`
an editable due date, unless the owning action itself owns rescheduling
a duplicated customer / order form
a free-text owner picker for automatically owned work
a channel button that would bypass the owning module's evidence capture
```

## 8.7 · Owner cover

```
OWNER
Normal   [SH] Shasha
Today    [YJ] Yu Jun covers PO duty
```

Roster and buddy-cover law resolve today's actor automatically **without overwriting normal
ownership**. Work shows the row to Yu Jun and preserves both identities. Register, My Work, Team
Work and the context pane consume the same contract; only the density changes.

## 8.8 · Late · Today · Later · Blocked

**They are four views over one open population, never four queues.**

```
NAVIGATOR                         What it selects
MY WORK    12                     every open row I own, hold by duty, or cover today
  Late      3                     timeState = late
  Today     5                     timeState = today
  Later     4                     timeState = later, inside the horizon
  Blocked   1                     blocked = true, ACROSS the three above
```

- **A late blocked row appears in `Late`** and carries `Blocked by …` in its right meta slot.
  `Blocked` is an orthogonal toggle, **not a competing status that hides lateness**.
- **`Blocked` may be lit together with a time bucket.** Its count is not subtracted from theirs.
- Selecting `Late`, `Today` or `Later` is exclusive between those three; selecting the lit one
  again clears it and returns to all open work in the current scope.
- `Later` is `COPY-STANDARD.md`'s ruled word. **`Upcoming` is banned.**
- **No `No due` bucket.** An action with an express `none` is outside the time buckets by
  contract and reachable only through `Filters`.

## 8.9 · Filtering and search

**Permanent:** one `Search work` input in the `GridToolbar`, and one `Filters` popover.

```
Search work        object handle · customer · supplier or logistics · SKU or model
                   · action phrase · person or duty

Filters            Module · Task owner · Acting person · Duty · Recipient
                   · Calendar · Blocked · Due date
```

- Filters combine **AND across fields**, **OR within one multi-select field**.
- **No second permanent toolbar.** The `Filters` popover opens on demand and closes.
- The navigator's time and scope selections are **not** repeated in the popover.

**The active-filter band appears only while something is active**, as one compact removable row
directly under the toolbar:

```
├──────────────────────────────────────────────────────────────────┤
│ Module: Purchasing ×   Due: This week ×   Covering only ×  Clear filters │
├──────────────────────────────────────────────────────────────────┤
```

- `Clear filters` clears Search and every filter value. It does **not** change the navigator
  scope, and it does not clear a time bucket the operator lit deliberately.
- Search never changes the owner grouping in Team Work.
- A manager arriving from a Dashboard drill-down **always** lands with a visible band, for
  example `No owner or cover ×`. **A hidden query is forbidden.**
- Search and filter state may be encoded in the URL for a shareable manager view. A fresh entry
  resets to the default. **No personal column width, order or layout is remembered** — a reload
  is the reset (`docs/ui/MASTER.md` §4).

## 8.10 · Completed and History

```
NAVIGATOR                          Queue list, History selected
MY WORK    12
  Late      3      COMPLETED · Today
  Today     5      ────────────────────────────────────────────────
  Later     4      PO-2044 · Ready date recorded
  Blocked   1      Call Ohana — confirm ready date
  History          Closed Fri 14 Aug 09:12 · by Yu Jun · Purchasing
                   ────────────────────────────────────────────────
                   SO-1290 · Delivery photo uploaded
                   Upload delivery photo
                   Closed Fri 14 Aug 08:40 · by system · Delivery
                   ════════════════════════════════════════════════
                   COMPLETED · Yesterday
                   ────────────────────────────────────────────────
                   …
```

- **`History` is a navigator entry, never part of the open default.** Open Work shows open work.
- History is a **read-only** register of completed, superseded and cancelled projections. It
  records the source result, the completion time, the actor where one was observed, the object
  and the deep link.
- **Grouped `Today · Yesterday · Earlier`** — never a flat list of dates
  (`docs/ui/MASTER.md` §6.4 ruling ⑦).
- **There is no `Reopen` in Workspace.** If source truth changes and the trigger becomes true
  again, the owner engine emits a **new occurrence key**.
- Retention follows the owning object's business/audit retention. **Workspace deletes no source
  history.**

## 8.11 · Empty, error and stale

```
My Work, genuinely empty
No work assigned to you.
Nothing is due from your duties.

Team Work, genuinely empty
No team work is open.

Filtered to nothing
No work matches these filters.
[Clear filters]

A time bucket that is empty
Nothing is late.
Open Today                       ← shown only while Today is above zero

History, empty period
No completed work in this period.

One module's source failed — persistent band above the list, never a toast
Purchasing work could not update. Other work is current.
[Try again]

Every source failed — the region, never a stale list presented as current
Work could not update.
Last updated Thu 13 Aug · 17:42
[Try again]

Stale beyond the governed threshold
These figures are from 09:15 and have not refreshed.
[Try again]
```

- **A failed region never silently prints zero**, and an old list is never presented as current.
- **The stale warning is a persistent band, never a toast** — a toast that carries a truth claim
  disappears before it is read.
- **Empty-state art is not used** (`EmptyState` has no illustration slot by design).
- **A row whose deep link is unreachable never reaches staff Work.** It is excluded and counted
  in Dashboard `Work health` — an unfinishable row teaches a new hire they have missed something.

## 8.12 · Interaction states

| Event | Queue list | Context pane |
|---|---|---|
| first load | select the first row of the highest-priority non-empty band | show its current contract |
| click a row | list scroll, scope and filters are preserved | replace the contract; focus stays on the row unless the keyboard opened the pane |
| the owner records the result | the row leaves Open on recompute | if still open, refresh; if closed, `Completed in {module}.` with a History link until another row is selected |
| the action changes at source | the row moves to its correct band and position | `This work changed in {module}.` and the current facts |
| cover activates | the row appears in the covering person's My Work **with no source reassignment** | `OWNER` shows the normal owner and today's cover |
| a blocker closes | the row loses its blocker meta and reorders by its **original** due | the current due; **no new work identity** |
| one source partly fails | successful modules keep their rows | the persistent band names the failed module |
| every source fails | no old list is shown | the full-region error with the last successful update |

**Auto-refresh never clobbers anything** — Workspace holds no dirty business form, because it
holds no business form at all.

## 8.13 · Responsive composition

### 1024–1279px — the context becomes a Drawer

```
┌──────────────────────────────────────────────────────────────────┐
│ Workspace │ Dashboard  Work         page-meta │ [bell][help][gear]│ 44
├───────────────┬──────────────────────────────────────────────────┤
│ NAVIGATOR 200 │ [search] Search work    Filters   Updated 10:42   │
│               ├──────────────────────────────────────────────────┤
│ MY WORK    12 │ LATE · 3                                         │
│   Late      3 │ ───────────────────────────────────────────────  │
│   Today     5 │ PO-2051 · Expected Arrival not recorded          │
│   Later     4 │ [YJ] Call Ohana — confirm ready date             │
│   Blocked   1 │                    Late 2 days · covering PO duty│
│               │ ───────────────────────────────────────────────  │
│ TEAM WORK  38 │ …                                                │
└───────────────┴──────────────────────────────────────────────────┘

   select a row  ->  Drawer, side-panel-width 420, from the right
```

- The persistent pane becomes a **`Drawer` at `side-panel-width` 420** — the same governed width,
  not a second number. **The invented 400px is deleted.**
- The list stays visible behind it; closing returns focus to the row.
- The navigator keeps its governed 200 and does not collapse — it is the only narrowing surface.
- Dashboard drops to one card per row after the three named management cards wrap.

### 768–1023px — below `desktop-min-width`

- The navigator collapses into the `GridToolbar`'s `right` slot as one `Select` (`My Work` /
  `Team Work`) plus the four time toggles. **Still one toolbar row.**
- The context is a `Drawer` at 420, or full width where 420 exceeds the viewport.
- Two semantic lines stay intact; the right meta slot wraps beneath line 2.

### < 768px

```
Workspace                                    [bell]
Dashboard   Work
────────────────────────────────────────────────────
My Work 12                    Team Work 38
[search] Search work                       Filters
Late 3     Today 5     Later 4     ›
────────────────────────────────────────────────────
PO-2051 · Expected Arrival not recorded
Call Ohana — confirm ready date
                              Late 2 days · covering
────────────────────────────────────────────────────
SO-1318 · No delivery date
Ask customer for a delivery date
                                 Late 1 day · Sales Order
────────────────────────────────────────────────────
…

tap a row  ->  full-screen work context, `Close` top-left,
               [Open purchase order] at the bottom
```

- **`My Work` / `Team Work` remain top-level tabs.** One list, no persistent pane.
- `Blocked` moves into the horizontal shortcut scroller or into `Filters` when the width cannot
  hold it, and stays visibly lit when selected.
- **Filters open one full-screen sheet;** the active-filter band stays above the rows.
- **The Right Rail is not shown as a second side rail.** Global navigation exposes `Work` with
  the `Late` badge.
- Team Work owner headers stay sticky.
- Dashboard becomes one vertical reading path in the governed order (§9.2).

### Accessibility, every width

```
two lines carry their meaning without colour
due state and blocked state are TEXT, never an icon alone
keyboard order follows visual order; selecting a row does not steal focus
no hover-only information — the recipient, due, calendar and blocker are
    reachable by touch and by keyboard
live count changes announce with restraint; a refetch does not re-announce the list
every overlay opens by keyboard (Radix; a click-only test proves nothing)
```

---

# §9 · Dashboard — the composition

> **Dashboard is *what management must know*. It is not a second Work queue and it never
> becomes one.** Every number names a management decision and carries one governed door.

## 9.1 · Admission test

A fact reaches Dashboard only if it changes a management decision **today**, and at least one is
true:

```
a customer or supplier commitment is broken
money, goods or delivery exposure passes a governed threshold
work has no accountable actor and no cover
a module process is failing or blocked across several records
a trend is materially worsening or improving over a governed comparison window
a compliance or audit condition needs management action
```

**Reject a metric** that is merely easy to count · duplicates a module report · has no decision
and no door · or is the open Work total enlarged.

## 9.2 · Dashboard — wide desktop

**There is no umbrella heading.** Each region states its own name (§7.3). Widths are the
governed content 1216 with `card-gap 20` and `section-gap 32`.

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Workspace │ Dashboard  Work                     page-meta │ [bell] [help] [settings] │ 44
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Fri 14 Aug · business day                                        Updated 10:42       │
│                                                                                      │
│ ┌────────────────────────┬────────────────────────┬────────────────────────────────┐ │
│ │ Broken commitments   3 │ Duty coverage        1 │ Work health                  2 │ │
│ │ 2 delivery · 1 goods   │ GRN duty covered       │ 1 no owner or cover            │ │
│ │                        │ by Yu Jun              │ 1 source could not update      │ │
│ │ Open affected work     │ Open Team Work         │ Open Work health               │ │
│ └────────────────────────┴────────────────────────┴────────────────────────────────┘ │
│                                                                                      │
│ ┌──────────────────────────────────────┬─────────────────────────────────────────┐   │
│ │ Customer commitments                 │ Cash requiring attention                │   │
│ │ Next 7 business days             18  │ Collectable            RM 128,400.00    │   │
│ │ On track 14 · At risk 3 · Broken 1   │ Payment exceptions              2       │   │
│ │ versus the prior 7 business days     │ 30 days and older       RM 42,100.00    │   │
│ │   At risk +1                         │                                         │   │
│ │ Open Sales Orders    Open Delivery   │ Open Payment                            │   │
│ └──────────────────────────────────────┴─────────────────────────────────────────┘   │
│                                                                                      │
│ ┌──────────────────────────────────────┬─────────────────────────────────────────┐   │
│ │ Goods flow                           │ Workload health                         │   │
│ │ To buy 12 · Arrival not recorded 4   │ Late 9 · Today 24 · Blocked 3           │   │
│ │ Supplier late 3 · Held stock 1       │ No owner or cover 1                     │   │
│ │ Open Purchasing   Open Receiving     │ Open Team Work                          │   │
│ │ Open Stock                           │                                         │   │
│ └──────────────────────────────────────┴─────────────────────────────────────────┘   │
│                                                                                      │
│ Recent material change                                                               │
│ 10:31  PO-2051 expected arrival moved beyond SO-1318's Customer Delivery   Open PO   │
│ 09:48  Finance opened a payment exception on SO-1300                       Open SO   │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

**`At risk` is `COPY-STANDARD.md`-banned as a STATUS word for one record. Here it is a
COUNT of a governed partition of the commitment window, printed as a figure and never as a
row-level badge.** If the owner rules against that reading, the partition is renamed with the
other vocabulary items in §17 — it is recorded here rather than assumed.

## 9.3 · Hierarchy and card behaviour

```
1  the business-day and freshness line
2  Broken commitments · Duty coverage · Work health — only above zero
3  Customer commitments · Cash requiring attention
4  Goods flow · Workload health
5  Recent material change
```

- **No hero sentence, no GMV headline, no order pipeline, no card because a metric exists.**
- **A named management card renders only above zero.** If all three are zero, one calm line reads
  `Nothing is broken and every duty is covered.` and the rest of Dashboard stays.
- **Clicking the card body or its named link opens Work with a VISIBLE filter band** (§8.9). It
  never opens a Dashboard clone and never applies a hidden query.
- A business-flow card opens the **owning module** when its number is a module report, and
  **filtered Work** when its number is an action population. **The label names the destination.**
- **A trend appears only when both comparison windows have valid coverage.** Otherwise the card
  states its coverage and withholds the comparison.
- **Money is the `Money` component; dates are `fmtDate()`.** Cents are never rounded away where a
  person may act on the figure. A governed compact display is allowed for a management total only
  when the full value is reachable **without hover**.
- **At most five rows in `Recent material change`.** It is business-significant change, not a raw
  audit feed, and each row opens the owning record.

## 9.4 · Explicit exclusions

```
no five-column order pipeline
no `Active orders` or GMV hero
no `Open POs` + `Low stock` + `Stock alerts` as three competing counts of one supply condition
no row-level action list — `Open affected work` is a drill-down, not a queue
no escalation inbox with rows on the management page
no KPI card for every 2990 or AutoCount figure
no vanity percentage with insufficient coverage
no `Exception` umbrella heading
```

## 9.5 · Drill-down map — every destination is named and visible

| Dashboard fact | Destination | Visible filter band on arrival |
|---|---|---|
| `Broken commitments` | Work → Team Work | `Broken commitment ×` |
| `Duty coverage` | Work → Team Work, grouped by normal owner | `Covering only ×` |
| `No owner or cover` | Work → Team Work, first group | `No owner or cover ×` |
| `Work health` | the Work health diagnostic | — · **no staff row is fabricated** |
| `Customer commitments` | Sales Orders, then Delivery — two named links | the governed module view |
| `Collectable` · `Payment exceptions` | Payment | the governed Payment view |
| `To buy` | SO Batch Purchase | the governed Purchasing view |
| `Arrival not recorded` · `Supplier late` | Purchase Orders CALLS view | the governed Purchasing view |
| `Held stock` | Stock held view, then the Supplier Claim rows | the governed Stock view |
| `Late` · `Today` · `Blocked` | Work → Team Work | the matching time band, visibly lit |
| a `Recent material change` row | the exact owning object | — |

## 9.6 · Dashboard states

```
Nothing to raise
Nothing is broken and every duty is covered.

Not enough history to compare
7 business days on record. The comparison appears after 14.

One source failed
Purchasing figures could not update. The other figures are current.
[Try again]

Dashboard failed
Dashboard could not update.
Last updated Thu 13 Aug · 17:42
[Try again]

Stale beyond the governed threshold
These figures are from 09:15 and have not refreshed.
[Try again]
```

**A failed region never prints zero. The last-updated time belongs to the response state, never
to a manual Refresh button.**

---

# §10 · The Right Rail — APPROVED / LOCKED

> **The Right Rail is included in this blueprint and it is NOT a second Work queue.** It gives a
> compact summary and navigation into the authoritative main Work surface, and nothing else.

## 10.1 · Required behaviour — owner ruling, verbatim

```
RIGHT RAIL — MY WORK

My Work                 12
Late                     3
Due today                5
Covering                 2

Open My Work →
```

## 10.2 · The rules

```
`Workspace → Work → My Work` is the COMPLETE personal execution queue.

The Right Rail shows COUNTS ONLY.
It may show:  total My Work · Late · Due today · Covering (only when non-zero).

It must NOT show individual work rows.
It must NOT contain `Mark done`.
It must NOT contain assignment, reassignment or owner editing.
It must NOT independently calculate work.

Counts come from the SAME authoritative Work projection as the main surface.

Selecting `Late`, `Due today` or `Covering` opens main My Work
    with that filter VISIBLY applied.
Selecting `My Work` or `Open My Work` opens the complete My Work view.

Reading or opening the Right Rail never alters work state.

The COLLAPSED rail badge shows only the current user's `Late` count.
Team Work counts appear only for users holding the governed management permission.

Quick Rail, Bell Notifications and main Work never maintain separate task truth.
```

## 10.3 · Collapsed and expanded

```
COLLAPSED strip                    EXPANDED panel

[people]   Team                    RIGHT RAIL — MY WORK
[date]     Calendar
[order]  3 Work                    My Work                 12
[activity] Activity                Late                     3
                                   Due today                5
   3 = MY LATE COUNT ONLY,         Covering                 2
       red, rendered only          ────────────────────────────
       above zero                  Team Work               38   manager only
                                   No owner or cover        1   manager only

                                   Open My Work →
```

- **`Covering` renders only when it is non-zero.** A zero line teaches nothing.
- **Every count is `tabular-nums`.** `Late` is red **text**; it is not a red pill and never a
  red button (`Badge` has no tone, by frozen rule — see §12.3).
- **`Team` remains the one home for the rota. `Calendar` remains booking-led. `Activity`
  remains history.** None of them gains a work row.
- The rail is the governed navigation surface of `docs/ui/MASTER.md` §5: **navigation, never a
  second place to act.**

## 10.4 · What leaves the rail

The current `Follow-ups` panel is an actionable board: it adds tasks, assigns them, claims them
with `Take it`, ticks them `Mark done`, deletes them, and marks them late against **one universal
60-minute SLA**. Every one of those is forbidden for system Work.

```
Person-authored follow-ups move to a distinct, clearly named surface OUTSIDE system Work.
Until that surface is governed, the DATA is preserved and its claim to be
the system worklist is removed.
```

## 10.5 · The rail width — a recorded contradiction, not a silent choice

| Source | Value |
|---|---|
| `docs/ui/MASTER.md` §5 | *"The rail is **200px** and it is navigation"* |
| `docs/01-design-tokens.md` §8 | `workspace-rail-width` **200** |
| Production `OperationRightRail.tsx` | **52px** icon strip + **320px** expanded panel |

**The governed value is 200 and this blueprint draws 200.** The built 52/320 is implementation
evidence that disagrees with frozen UI authority; it does not overturn it. **`docs/ui/MASTER.md`
§5 and the rail implementation must be reconciled in the same approved change** (§16.3). This
document does not invent a third number.

---

# §11 · Notifications

**Notifications are event receipts. They are not work.**

```
NOTIFICATIONS                                              4 unread
────────────────────────────────────────────────────────────────
Work assigned to you
PO-2051 · Call Ohana — confirm ready date                   10:31

Work became late
SO-1318 · Ask customer for a delivery date                  09:00

Cover started
You cover Shasha's PO duty today                            08:58

Work completed
CL-18 · Customer Resolution recorded                   Yesterday
────────────────────────────────────────────────────────────────
Mark all read                                        Open Work →
```

**Notify on:**

```
newly assigned, reassigned or covered work
work that became late
work that became unblocked
a governed manager escalation threshold crossed
a source action completed, when the recipient subscribes to it or depends on it
a projection or source failure inside the user's scope
```

**Never notify on:** every refetch · an unchanged late row · the user's own act · a routine
derived count change.

- **The bell's count is UNREAD NOTIFICATIONS, never open work.**
- **A row opens the exact Work item or owning object.**
- **Reading or dismissing never changes ownership, due, completion or priority.**
- **Repeated polling never mints repeated notifications.**
- **The current Bell recomputes its own overdue-order and missing-ETA figures** — a third action
  calculation that routes only to Orders. **It is replaced by subscriptions to owner action
  transitions and to the named Dashboard management facts.** Bell, Right Rail and Work read ONE
  projection.

---

# §12 · Component and token preflight

> **Classification is exactly one of:** `EXISTING / PROVEN` · `EXISTING / UNPROVEN` ·
> `MISSING — REQUIRES KIT ADMISSION` · `NOT NEEDED AFTER REDESIGN`.
>
> `PROVEN` means `docs/02-components.md` documents it as proven by a real business page.
> `UNPROVEN` means it exists in `apps/web/src/components/kit/` and renders on `/ui`, but no
> business page has proved it. *Measured 2026-08-15 by listing `components/kit/` — 28 components,
> and `Icon.tsx`'s union holds 43 meanings.*

## 12.1 · Every element this composition needs

| Need | Element | Classification |
|---|---|---|
| the shell header row, 44px | page-owned shell (the `PurchasingTabs` pattern) | `EXISTING / PROVEN` |
| the one toolbar row | `GridToolbar` | `EXISTING / PROVEN` |
| region and time-band labels | `SectionHeader` (permanent form) | `EXISTING / PROVEN` |
| the primary door `Open {object}` | `Button` primary | `EXISTING / PROVEN` |
| filter values | `Select` | `EXISTING / PROVEN` |
| every card surface | `Card` · `Panel` | `EXISTING / PROVEN` |
| every empty answer | `EmptyState` | `EXISTING / PROVEN` |
| loading | `Loading` (spinner and skeleton) | `EXISTING / PROVEN` |
| every glyph | `Icon` | `EXISTING / PROVEN` |
| search input | `SearchInput` | `EXISTING / UNPROVEN` |
| the `Filters` menu surface | `Popover` | `EXISTING / UNPROVEN` |
| a due-date range | `DatePicker` | `EXISTING / UNPROVEN` |
| the compact/narrow context | `Drawer` | `EXISTING / UNPROVEN` |
| a count chip that is a FACT | `Badge` | `EXISTING / UNPROVEN` |
| avatar hover / truncation reveal | `Tooltip` | `EXISTING / UNPROVEN` |
| the page height budget | `PageShell` | `EXISTING / UNPROVEN` |
| context-pane structure | `DetailShell` **principles only** — Work context is read-only page composition and adds no writer | `EXISTING / UNPROVEN` |
| **owner identity** | **`Avatar` / `AvatarChip`** | **`MISSING — REQUIRES KIT ADMISSION`** |
| **the persistent failure / stale band** | **`Banner`** | **`MISSING — REQUIRES KIT ADMISSION`** |
| **the two-line 56px selectable queue row and its list** | **`QueueList` / `QueueRow`** | **`MISSING — REQUIRES KIT ADMISSION`** |
| **the bell glyph** | **`notification` icon MEANING** | **`MISSING — REQUIRES KIT ADMISSION`** |
| the scan table | `DataTable` | `NOT NEEDED AFTER REDESIGN` |
| scope tabs inside the page | `Tabs` | `NOT NEEDED AFTER REDESIGN` — scope lives in the navigator |
| row selection / bulk commit | `Checkbox` | `NOT NEEDED AFTER REDESIGN` — Work has no batch act |
| row overflow actions | `DropdownMenu` | `NOT NEEDED AFTER REDESIGN` — one door per row |
| transient confirmations | `Toast` | `NOT NEEDED AFTER REDESIGN` — a truth claim never lives in a toast |
| a `Take it` / `Release` control | — | `NOT NEEDED AFTER REDESIGN` — no manual claim exists (§5.2.5) |
| a page footer band | — | `NOT NEEDED AFTER REDESIGN` — the navigator holds counts, `GridToolbar.meta` holds freshness |

## 12.2 · The four admissions, each with its exact need

**The earlier preflight claimed only `Avatar` was missing. That was wrong on three counts.**

### A · `Avatar` / `AvatarChip` — `MISSING`

The owner ruling makes owner identity **structured metadata outside the sentence**. Nothing in
the kit draws it. `01-design-tokens.md` §4 already reserves `rounded-full` for *avatar · status
dot*, and `badge-height 24` is the governed size, so the admission needs **no new token**.

```
initials, from the resolved person
accessible full name, exposed on hover AND focus
a cover state that renders the acting person while the normal owner stays inspectable
no `className`, no `style` — the frozen kit rule
```

### B · `Banner` — `MISSING`

`docs/02-components.md` lists `Alert` and `Banner` under **Not built**. This composition requires
a **persistent** page-level band in four places: one module's source failed · every source
failed · figures are stale · a Dashboard region could not update. `Toast` is expressly wrong —
*"a warning stays until resolved"*, and a truth claim that disappears before it is read is worse
than silence.

```
one line of text + one action (`Try again`)
persistent — it is dismissible only when the condition clears
tones limited to the governed status family; it is never blue and never a red button
```

### C · `QueueList` / `QueueRow` — `MISSING`

`DataTable` is the ONE list table and it is 40px, one fact per cell, formats nothing. A Work row
is two semantic lines at `row-comfortable` 56 with an avatar slot, a time-state slot and a right
meta slot, and it carries selection. **No kit species draws it, and `CLAUDE.md` forbids drawing
one inline "just this once".**

```
row height row-comfortable 56, fixed; content adapts to the row
line 1 text-body · line 2 text-body · right meta text-meta
slots: leading avatar (optional) · trailing time state · trailing meta
selection blue-3 · hover slate-3 · no full-row alarm colour
it spells no word and formats nothing — the caller passes fmtDate() and Money output
```

**This is ONE admission, not two.** The list is the row's container and shares its contract.

### D · The `notification` icon meaning — `MISSING`

`Icon.tsx`'s `IconName` union holds 43 meanings and **there is no bell**. Production draws a raw
Lucide `Bell` inside `GlobalTopBar.tsx`, outside the kit — exactly the drift the union exists to
stop. **One meaning, one glyph:** `notification` → Lucide `Bell`, stroke 2, sizes 14/16/18.
This is a one-line admission to the union, not a component.

## 12.3 · Things that are NOT admissions, and why

| Considered | Verdict |
|---|---|
| a red count pill for `Late` | **No admission.** `Badge` has no tone by frozen rule, and `Button` has no `danger`. The `Late` count is **red text** beside a neutral label. Red keeps its one job and no component changes. |
| a `Card` species for the Dashboard management figures | **No admission.** `Panel` is *a Card that has a title* and that is exactly the shape. **No new KPI-tile species.** |
| a group-header component for Team Work | **No admission.** It is `AvatarChip` beside `SectionHeader` in one flex row — composition of two kit elements, not a new species. |
| the collapsed rail badge | **No admission here.** It exists in production and is page-owned. Moving it into the kit is a separate decision with its own card. |
| a `Blocked` status pill | **No admission.** `Blocked by {fact}` is TEXT in the right meta slot. `StatusPill`'s tone is the action tone type, and blocked is a dependency fact, not an action tone. |

## 12.4 · Token conformance — nothing on these pages is invented

| Concern | Governed value used | What was deleted |
|---|---|---|
| shell header | **44** | — |
| toolbar | **one** `GridToolbar` row | the second toolbar row, and the 40 / 36 band heights |
| queue row | **`row-comfortable` 56** | **72 and 88** |
| context pane | **`side-panel-width` 420** | **292**, and the responsive **400** |
| narrowing rail | **`workspace-rail-width` 200** | — |
| content width | **`desktop-max-width` 1280**, floor **`desktop-min-width` 1024** | the invented *"list minimum 520px, detail 400–480px"* |
| page padding · section gap · card gap | **32 · 32 · 20** | ad-hoc gaps |
| type | **page 24 · title 20 · strong 15 · body 13 · meta 12 · label 11** | every hand-picked size |
| avatar | **`badge-height` 24**, `rounded-full` | — |
| colour | **blue = primary action + selection only · hover `slate-3` · red = late** | full red rows, red buttons, blue dates |
| icons | **Lucide stroke 2, sizes 14/16/18, the 43 governed meanings** | **every emoji** — the bell / question-mark / gear glyphs become `[notification*] [help] [settings]`, and the warning-triangle glyph becomes `[late]` |
| dates | **`fmtDate()`** — `Fri 14 Aug`, `Tue 11 Aug` | hand-written date spellings |
| money | **the `Money` component**, `tabular-nums` | `RM …` written by hand |

`*` = the one governed meaning that must be admitted first (§12.2 D).

---

# §13 · Current → proposed gap audit

| Current repository truth | Problem | Destination | Class |
|---|---|---|---|
| `OperationDashboard.tsx` hero: deliveries today, waiting on stock, ready to ship, active orders, GMV | mixes operator workload, pipeline and commercial summary with no admission test | the six named Dashboard regions | 🔴 rebuild |
| its three KPI tiles `Today` · `Open POs` · `Overdue` | three owners, three meanings, drilling to broad pages | named management figures with exact destinations | 🟡 adapt |
| its five-column pipeline (`PipelineColumn` ×5) | Dashboard becomes a second Orders board | delete; Sales Orders and Delivery own record flow | 🔴 relocate |
| `OpenPOsCard` + `LowStockCard` + `StockAlertsTile` | three competing counts of one supply condition | one `Goods flow` region with owner-specific doors | 🔴 consolidate |
| `EscalationInboxCard` on Dashboard | row-level work inside a management overview | Work / Team Work; Dashboard keeps the count | 🔴 relocate |
| `rail/TasksPanel.tsx` — add, assign, `Take it`, `Mark done`, delete, `Urgent` | manual and generated rows share one manual lifecycle | Right Rail = counts only (§10); human reminders get their own named surface | 🔴 split |
| any staff may create, delete and tick a system-generated task | breaks the action-engine and measured-completion law | no manual completion for system work | 🔴 stop |
| **one universal 60-minute SLA** (`TasksPanel` doc comment, `t.overdue`) | contradicts every module's due rule and the three calendars | owner-supplied due and named calendar | 🔴 replace |
| cron rolls late claimed tasks to the next day | hides lateness and uses weekend arithmetic that ignores the governed calendars and holidays | preserve the original due unless the owner expressly pauses the clock | 🔴 replace |
| cron creates a `Chase:` task for a stalled task | a task about a task, and a banned word | an escalation event on the same work item | 🔴 replace |
| contact-by cron creates a `Contact customer` task | banned verb, and it duplicates owner action logic | the owner's action projection with an exact recipient and result, or retire | 🔴 re-govern |
| PO-day cron creates a reminder task | duplicates the real `Issue PO` population | duty-resolved `Issue PO` rows | 🔴 retire at cutover |
| `GlobalTopBar.tsx` Bell recomputes late orders and missing ETA | a third action calculation, routing only to Orders | subscriptions to owner action transitions | 🔴 replace |
| the Bell draws a raw Lucide `Bell` outside `Icon` | breaks one-meaning-one-glyph | admit the `notification` meaning (§12.2 D) | 🟡 kit admission |
| sidebar badges are module-specific counters | no single Work entry and no cross-module meaning | `Workspace` nav: Dashboard + Work; the `Work` badge is my `Late` count | 🟡 adapt |
| Team panel shows PO duty only | the approved GRN row is unbuilt; cover is not shown cross-module | Team stays the rota home; add the governed GRN and cover view | 🟡 complete approved evolution |
| `OperationRightRail.tsx` is 52 + 320 | frozen UI authority says the rail is 200 | reconcile in one change (§16.3) | 🟡 governance |
| Sales Order actions default to the PIC | conflicts with Purchasing duty ownership for Purchasing actions | each owner projection supplies its own task owner | 🔴 correct boundary |
| `docs/delivery/MASTER.md` declares Delivery a view owning nothing | contradicts the approved Delivery ownership ruling (§4.5) | overwrite `delivery/MASTER.md` and `orders/MASTER.md` §7 in one change | 🔴 governance blocker |
| `OperationServiceNotes.tsx` stage word `Scheduled` | **banned display word** (`01-design-tokens.md` §10) | the owning module renames it in its own change | 🟡 vocabulary |
| Issue Tracker has a deadline but no governed owner or completion | fails admission questions 5 and 6 | excluded from Work until §15.6 is ruled | 🔴 engine gap |
| a delivery problem is recorded with no next action | Work would strand the journey | reason → next action map, owner, due, closure | 🔴 engine gap |
| Claims has resolution UI but no action wiring or due | hidden work found only by opening rows | the owner engine emits the resolution action once §15.2 is ruled | 🔴 engine gap |
| Service steps derive correctly | strong fit for a projection | expose stable step identity, owner, due, deep link | 🟢 keep / adapt |
| Receiving correction has a durable list | a local surface with an incomplete global contract | expose as an owner projection once §15.5 is ruled | 🟡 adapt |
| Work has no completed global history | managers cannot audit throughput or handoff | the read-only projection history of §8.10 | 🔴 build projection layer |
| no responsive cross-module Work exists | narrow users would inherit desktop rails and panes | §8.13's three bands | 🔴 design, then build |
| Payment `Collect` closes at zero outstanding | **not a defect** under the current ruling — recording the payment IS the settlement | keep one action, one owner, one completion; bank matching is evidence | 🟢 keep |

## 13.1 · What Phase 1 retired from the previous blueprint

```
the request for a Delivery-ownership ruling      -> RULED (§4.5)
the demand to split Payment into two actions     -> RULED AGAINST (§4.6)
`Upcoming` · `Take it` · `Release`               -> DELETED (§7.2)
the `Exception` umbrella heading                 -> DELETED (§7.3)
the generic 60-minute task SLA                   -> INVALID (§6.3, §13)
the absence of Issue Tracker                     -> COVERED (§4.9)
the §14 UI composition                           -> REBUILT as §8 · §9 · §10 · §11
```

---

# §14 · Reference capability map

| Reference capability | Carres equivalent / owner | Decision | Why |
|---|---|---|---|
| Oracle separates group `Incoming Tasks` from `My Tasks`, supports claim / release / reassign, sorts late first | Carres resolves an owner automatically for every action in §4 | **REJECT the claim model; KEEP late-first** | Carres has no group-claimable action today, so a claim button would be a control with nothing to claim |
| SAP Task Center substitution places covered tasks in the substitute's inbox for a defined absence | Carres buddy-cover duty law | **ADAPT** | Carres' derived same-day cover is stronger for a three-person team, and it never rewrites source ownership |
| Linear triage rotates intake ownership and can auto-assign | Carres PO / GRN rotating duty | **KEEP CONCEPT** | confirms visible duty ownership; Carres uses its governed roster and heartbeat rules |
| Linear keeps Inbox notifications separate from Issues | the Carres Bell currently recomputes work | **ADAPT** | notifications become event receipts; Work stays the durable truth |
| Linear custom views and assignee grouping | no governed shared Work views yet | **DEFER** | add named shared views only after repeated stable daily filtering is observed |
| Dynamics operational workspaces combine overview, lists, links and drill-through per persona | Carres currently mixes dashboard and queue | **ADAPT THE BOUNDARY** | keep drill-through and role relevance; separate knowing from doing |
| SAP Overview Pages use interactive cards for vital information | the current Dashboard cards | **ADAPT** | a card must carry a management decision and a governed door; never copy card volume |
| Oracle worklists deep-link task and application identifiers to source details | Carres module objects | **KEEP** | every row opens the exact owning object and action region |

Primary references: Microsoft Dynamics navigation and operational workspaces · Oracle Permits
Worklist · SAP substitution management · Linear Triage and Inbox · SAP Overview Pages.
**References are evidence, never specification.**

---

# §15 · The six unresolved business rules

> These cannot be settled by reading the code, the docs, the database, or by measuring. **They
> are business rulings, not engineering choices.** Each excluded action stays out of Work until
> its ruling exists — Workspace never invents a due rule.
>
> **They are asked ONE AT A TIME, recommendation first, in the order below.**

### §15.1 · Sales Order amendment decision chain

```
Owning module      Sales Order (management duty), plus each affected owner module
Trigger            staff requests a change to a Sales Order that is already committed
Owner rule         management duty for the decision; the affected owner's governed
                   duty for each consequence confirmation
Required result    approve or reject with a reason; then each affected owner confirms
                   the change is executable, or refuses with a reason
Completion fact    the amendment record carries the management decision, and every
                   affected owner's confirmation or refusal
Current known due  NONE. No document states a due for the decision or for any
                   confirmation.
Exact missing      (a) how many working days the management decision has, on which
                   calendar; (b) how many the owner confirmations have; (c) whether a
                   late confirmation blocks the atomic apply or escalates
Recommendation     ONE Office working day for the management decision, and ONE Office
                   working day for each owner confirmation, because an amendment holds
                   a customer commitment open and every hour widens the gap between
                   what was sold and what four modules are executing.
Consequence        without it, amendment work cannot enter Work at all — so the one
                   change that touches Purchasing, Stock, Delivery and Finance at once
                   stays invisible, and its consequences are found by accident.
```

### §15.2 · Supplier-exception and Supplier Claim decision chain

```
Owning module      Supplier Claim (claim owner), with Sales Order's case owner for the
                   customer-side decision
Trigger            a receiving exception opens a claim; then each stage waits on a
                   named decision
Owner rule         claim owner throughout; case owner for `Case owner decision required`
Required result    the supplier's answer is recorded; the Customer Resolution is
                   selected; the Item Outcome is selected and Stock transitions; the
                   claim closes on external evidence
Completion fact    each stage's stored decision, and finally the supplier's own
                   credit-note or debit-note reference — never a tick box
Current known due  NONE for any of the four stages.
Exact missing      the working days allowed for (a) the supplier's answer, (b) the
                   Customer Resolution, (c) the Item Outcome, (d) claim closure —
                   and which calendar each counts on
Recommendation     count (a) on the SUPPLIER's own work week, because a factory's
                   silence is not measurable on our office week; count (b), (c) and
                   (d) on the Office calendar. Set (b) tight — a customer is waiting
                   behind it — and (d) loose, because it waits on external paper.
Consequence        the claims resolution UI already exists with no action wiring, so
                   this work is found only by opening rows one at a time. A customer
                   whose item is held learns about it last.
```

### §15.3 · Delivery problem follow-up

```
Owning module      Delivery
Trigger            a delivery problem is recorded with its governed reason
Owner rule         UNKNOWN — the shape is approved, the owner is not named
Required result    UNKNOWN — the next result depends on the reason
Completion fact    UNKNOWN
Current known due  NONE.
Exact missing      the reason -> next action map. For each governed reason: the next
                   action, its owner rule, its due and calendar, and its completion
                   fact.
Recommendation     rule the map reason by reason rather than as one blanket SLA. A
                   customer who was not at home and a truck that broke down are not the
                   same obligation, and one due rule over both will be wrong for one of
                   them. Start with the reasons that actually occur.
Consequence        without it Work strands the journey: the exception is recorded and
                   nothing tells anybody what happens next. This is the single largest
                   hole in delivery coverage.
```

### §15.4 · Stock decision SLAs

> Two triggers, grouped because they share an owner and a door. **If the owner rules that they
> need different clocks, they split — that is the falsifier for this grouping.**

```
Owning module      Stock (stock owner / stock planner duty), with the Purchasing door
                   for the ordering half
Trigger            (a) a receiving exception quarantined a unit;
                   (b) an internal urgent stock request awaits a planning decision
Owner rule         stock owner for held stock; `stock_planner` duty for the request;
                   `po_duty_editor` duty for marking it ordered
Required result    (a) the unit becomes free, returns to the supplier, or is written
                   off; (b) approved or rejected with a governed reason, then the PO
                   link is recorded
Completion fact    (a) the unit's stored destination; (b) the request's stored decision
                   and its PO link
Current known due  NONE for either.
Exact missing      the working days allowed for each, and the calendar
Recommendation     count both on the WAREHOUSE calendar, because both are answered by
                   people who work the warehouse week. Hold the emergency request to a
                   same-day decision — an urgent request that waits is not urgent — and
                   give held stock longer, because it often waits on a claim.
Consequence        held units sit against a customer order with no clock, and an
                   urgent request has no measurable promise. Both are invisible today.
```

### §15.5 · Receiving correction and return count

```
Owning module      Receiving
Trigger            (a) a warehouse count must go back to the other side for check or
                   recount; (b) an amend or void consequence is unresolved
Owner rule         the current holder on each side; GRN duty or the assigned owner
Required result    (a) the state records the count returned to the named recipient;
                   (b) correction evidence is recorded and the source state closes it
Completion fact    the append-only receiving event ledger
Current known due  a durable correction list exists in `CorrectionWorkList.tsx`; NO due
                   rule exists for either.
Exact missing      the working days allowed for each, on which calendar
Recommendation     count on the WAREHOUSE calendar and keep it short — a disputed count
                   ages badly, and every day it waits the goods are less identifiable
                   and the supplier's memory is weaker.
Consequence        the correction list stays a local surface nobody is measured on, and
                   a returned count can sit indefinitely with no owner feeling late.
```

### §15.6 · The Issue Tracker action contract

```
Owning module      Issue Tracker (`OperationServiceNotes.tsx`, SN numbers, migration 0140)
Trigger            the issue's stored stage exposes exactly one open action
Owner rule         UNKNOWN — no MASTER governs this page and no owner rule exists
Required result    UNKNOWN per stage
Completion fact    UNKNOWN — the stages advance by a person changing them
Current known due  a deadline column EXISTS and drives a late flag; no calendar is named
                   and no owner is resolved
Exact missing      (a) whose duty owns an open issue; (b) which calendar the deadline
                   counts on; (c) the completion fact for each stage — a stored business
                   fact, never a stage dropdown
Recommendation     give Issue Tracker its own MASTER before it enters Work. Its
                   `Current Action` is already authoritative on the issue (§1), so the
                   projection is a small step — but a stage that advances because
                   somebody changed a dropdown is not a completion fact, and admitting
                   it into Work would import the exact defect the action-flow law exists
                   to stop.
Consequence        issues carry a deadline that nobody owns. They are excluded from
                   Work today, which means the one surface that promises "everything you
                   must do" is knowingly incomplete — and staff will learn that.
```

### §15.7 · Recorded as PROPOSAL — NOT LAW

**Clear payment exception — the due rule.** Repository authority states that Finance owns the
exception and that only Finance clears it, but names no due.

```
PROPOSAL   the exception inherits the HELD DELIVERY's commitment date and counts on the
           Office calendar, because the thing being broken is a delivery commitment and
           it already has a governed date. It needs no second clock.
FALSIFIER  a payment exception that exists with NO held delivery behind it. If Finance
           can open one against an order with no booking, this proposal is wrong and the
           rule must be ruled separately.
```

**This is a PROPOSAL and binds nobody** (`CLAUDE.md` PLAN DECISION PERSISTENCE LAW). It must be
challenged, not obeyed.

---

# §16 · Required reconciliations in other MASTERs

**These are consequences of rulings already made. They are not new decisions.** Under
`CLAUDE.md` Law 3 and `ERP-ARCHITECTURE.md`'s reconcile clause, each must be corrected in the
same approved change that freezes this blueprint.

| # | Document | What must change |
|---|---|---|
| 16.1 | `docs/delivery/MASTER.md` | It declares Delivery *"a VIEW, not a module that owns records"* that *"raises NO actions"*, and forbids itself from defining the delivery actions. **§4.5 rules that Delivery owns assignment, the Delivery Order, the delivery result, the proof, the delivery problem and its local operational view.** Overwrite. |
| 16.2 | `docs/orders/MASTER.md` §7 | It is the current single definition of the delivery actions. Move every action except `Call {logistics} — arrange new delivery date` to Delivery, and keep a read-only summary and a link. |
| 16.3 | `docs/ui/MASTER.md` §5 **or** `OperationRightRail.tsx` | The frozen rail width is **200**; production is **52 + 320**. One of the two is wrong. This document draws the governed 200 (§10.5). |
| 16.4 | `docs/COPY-STANDARD.md` | Admit §7.4's eleven words. Rule the two collisions: **`Late` vs `Overdue`** and **`Today` vs `Due today`**. One word, one meaning. |
| 16.5 | `docs/01-design-tokens.md` §10 vs `docs/COPY-STANDARD.md` | §10 bans the display word `Exception`, while the Receiving vocabulary approves `Receiving exception created` / `Exception closed`, and `docs/payment/MASTER.md` rules `payment exception` as a Finance record. **Workspace uses no bare `Exception` heading or chip**; owning-module compound terms survive in the owning module's words. The ban's exact boundary must be written down once. |
| 16.6 | `docs/02-components.md` | Record `Avatar`/`AvatarChip`, `Banner` and `QueueList`/`QueueRow` under **Not built**, and admit the `notification` icon meaning into `Icon.tsx`'s union. |
| 16.7 | `docs/03-page-patterns.md` | The `Queue` pattern is four lines long and now carries a real page. Record Workspace → Work as its **Carres Example**, with `Bulk actions` expressly absent. |
| 16.8 | `docs/ui-reference/00-register-laws.md` | It states a 28px row and a 35% detail pane, against the governed 40px row and `side-panel-width` 420. It is not one of the three references the UI MASTER governs. Either bring it under governance or delete it — **a number in two files is a number that drifts.** |

---

# §17 · Readiness verdict

## 17.1 · Status

```
READY FOR OWNER REVIEW
```

**NOT `LAYOUT APPROVED`** — layout approval is the owner's act, not this document's claim.
**NOT `READY FOR CARD`** — and it may not be claimed while any of the four gates below is open.

## 17.2 · The four open gates

| Gate | What is open | Where |
|---|---|---|
| **Business rules** | six unruled SLA / business rules | §15.1 – §15.6 |
| **Vocabulary** | eleven words to admit, plus two spelling collisions to settle | §7.4 · §16.4 |
| **Component admission** | `Avatar`/`AvatarChip` · `Banner` · `QueueList`/`QueueRow` · the `notification` icon meaning | §12.2 |
| **Layout approval** | the owner has not approved §8 · §9 · §10 · §11 | §8 – §11 |

**Two governance blockers sit behind the gates:** Delivery ownership must be written into
`delivery/MASTER.md` and `orders/MASTER.md` (§16.1, §16.2), and the rail-width contradiction must
be settled (§16.3).

## 17.3 · Completeness standard — checked line by line

| Required | Where | Verdict |
|---|---|---|
| one current cross-module architecture | §1 · §2 | pass |
| complete module action coverage | §4.1 – §4.9, Issue Tracker included | pass |
| resolved ownership boundaries | §1 · §4.5 · §4.6 · §5.1 | pass |
| a valid action contract | §3 | pass |
| Dashboard composition | §9 | pass |
| Work composition | §8 | pass |
| My Work and Team Work | §8.4 · §8.5 | pass |
| duty cover | §5.3 · §8.7 | pass |
| filtering and search | §8.9 | pass |
| priority / SLA law | §6 | pass — the six unknowns are named and excluded, not invented |
| completed / history | §8.10 | pass |
| Right Rail and Notifications | §10 · §11 | pass |
| responsive composition | §8.13 | pass |
| exact approved vocabulary | §7 | **open** — eleven words await the dictionary |
| valid component preflight | §12 | pass — three components and one icon meaning identified as missing |
| current → proposed gap audit | §13 | pass |
| no contradiction with frozen UI authority | §12.4 | pass — every number is a governed token |
| no obsolete unresolved question | §13.1 | pass — the seven superseded items are deleted |

## 17.4 · Dependency roadmap after approval — unnumbered, never a Card number

```
rule the six business rules (§15)
-> admit the vocabulary and settle the two collisions (§7.4, §16.4)
-> admit Avatar/AvatarChip, Banner, QueueList/QueueRow and the notification icon (§12.2)
-> overwrite delivery/MASTER.md and orders/MASTER.md §7 (§16.1, §16.2)
-> settle the rail width (§16.3)
-> LAYOUT APPROVED on §8 · §9 · §10 · §11
-> freeze ONE cross-module projection interface
-> implementation Cards may then be written — not in this plan
```

## 17.5 · Self-audit — the four questions this chat must always answer

**What contradicts the real code or data.** `docs/delivery/MASTER.md` contradicts the approved
Delivery ownership (§16.1). `docs/ui/MASTER.md` §5's 200px rail contradicts the built 52+320
(§16.3). `01-design-tokens.md` §7's `button-sm/md/lg 32/40/48` contradicts
`02-components.md`'s `Button` sizes `sm 24 · md 32` — **this composition therefore names no
button pixel height**, and the two references must be reconciled. `OperationServiceNotes.tsx`
ships the banned word `Scheduled`.

**What would confuse a new hire.** Two spellings for one fact — `Late` / `Overdue` and `Today` /
`Due today` (§7.4). Both are recorded, neither is silently chosen.

**What could not be built exactly as written.** The three-line My Work sketch in
`docs/ui/MASTER.md` does not fit any governed row height. It is rendered here as two semantic
lines at `row-comfortable` 56, with the object handle leading line 1 — the shape
`COPY-STANDARD.md`'s own Register example already uses. Nothing is lost: the third fact moves to
the row's right meta slot by a stated precedence, and the full set is always in the context pane.

**What this document does not cover.** The Follow-ups surface itself — this file rules only that
it separates from Work and keeps its data. `Reorder stock` is a proposal label awaiting the
dictionary. And Issue Tracker is knowingly excluded from Work (§15.6), which means Work is not
yet a complete answer to *"everything you must do"* — and that is stated on the page, not hidden.
