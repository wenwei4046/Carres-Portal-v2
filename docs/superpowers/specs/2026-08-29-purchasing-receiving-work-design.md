# Purchasing → Receiving → GRN → Claim / Return Design

> **Status:** OWNER-APPROVED · 29 Aug 2026
>
> **Lane:** PLAN / DESIGN · no production migration or deployment authorised
>
> **Canonical business authority:** [`docs/purchasing/MASTER.md`](../../purchasing/MASTER.md)
>
> **Cross-module boundary authority:** [`docs/ERP-ARCHITECTURE.md`](../../ERP-ARCHITECTURE.md)

## 1 · Owner-visible outcome

An employee opens `My Work` and can tell what they must do today. A manager opens `Team Work` and
can tell who normally owns each action, who is covering, who actually acted, what is late and what
evidence is missing. The employee completes the action in the module that owns the business fact;
Work never becomes a second writer.

The governed chain is:

```text
approved buying source
→ PO Duty issues and records the supplier document
→ PO Duty confirms the arrival one Office working day before it is due
→ GRN Duty receives on the Warehouse-calendar arrival day
→ Goods Receipt is posted and the formal GRN exists
→ accepted Units enter the Stock consequence once
→ partial, reject, claim, repair and return continue through their own source-linked records
```

## 2 · Current conflict and measured root cause

The current implementation does not form this chain:

- `My Work` and `Team Work` compose only Sales Order-derived actions. Purchasing, Receiving and
  Supplier Claim rules are registered but their live feeds are not wired into the open work set.
- Production PO issue authority treats the current PO Duty / dated cover as the only actor. The
  SO Batch browser removes the `Issue PO` button when `operation@carres.com` is not that actor; the
  API and SQL creation authority refuse the same shared Operations Superuser.
- Receiving has two legitimate entry doors—Office direct receiving and Warehouse submission—but
  the Office review/posting SQL admits any Operation / Principal account instead of resolving GRN
  Duty, dated cover and Operations Superuser authority.
- Supplier promises preserve a structured answer and actor/time, but do not preserve the supplier's
  WhatsApp or equivalent response evidence. Opening WhatsApp is correctly not treated as proof.
- A receiving problem can mint a Supplier Claim and controlled Stock, but `reject on the spot` and
  `accept with issue` are not separate per-Unit outcomes throughout the engine.
- A formal GRN number is derived from a Receiving Session. Office receiving now creates that
  session, but Work does not use its `posted` fact as the one completion event.
- Purchase Return is an approved source-linked target, not a complete production workflow.

The production screenshot on 29 Aug 2026 is therefore expected under the old implementation:
selection says `Issue 1 PO`, while the action is replaced by `Yu Jun holds PO duty`.

## 3 · Architectural decision

### 3.1 Separate writers; one Work projection

The accepted approach is **module execution with one cross-module Work projection**:

| Surface | Owns | Does not own |
|---|---|---|
| SO Batch Purchase / Manual Purchase | approved purchase input and issue preparation | Work assignment, receiving or Stock |
| Purchase Orders | supplier commitment, document/version, promise and supplier response evidence | physical receipt or Stock |
| Goods Receipts | count, Unit inspection, delivery note, receipt outcome, posting and formal GRN | supplier commercial commitment or later custody |
| Supplier Claims | what Carres asked, what the supplier answered and approved supplier-resolution path | original receipt or physical return handover |
| Purchase Returns / Repair Orders | approved source-linked outgoing instruction and collection/return evidence | blank problem intake |
| Stock | exact Unit custody, condition, availability and append-only physical consequence | PO, supplier promise or GRN |
| My Work / Team Work | read-only projection of open module actions and their resolved ownership | business completion mutation or manual Done |

A merged PO-lifecycle page is rejected because supplier commitment and physical receipt have
different owners, calendars and evidence. Executing everything directly in Work is rejected because
it would create a second writer. Separate, unconnected module queues are rejected because employees
and managers would again lack one daily answer.

### 3.2 One action contract

Every action entering Work must carry:

```text
owner module + stable action key + source object + normal owner
+ dated cover/acting owner + authorised actual actor + recipient
+ required result + due date + named calendar + completion fact + deep link
```

The module owns trigger, due arithmetic and completion. The Work Engine owns composition,
owner/cover resolution, `My Work`, `Team Work` grouping and late arithmetic. A Work row disappears
only when its module completion fact exists.

## 4 · Responsibility and evidence model

| Action | Normal owner / authorised actor | Due and calendar | Execution surface | Required evidence | Supervision | Consequence |
|---|---|---|---|---|---|---|
| Issue PO | PO Duty or dated cover; Jess / Operations Superuser may act | approved demand's governed issue date · Office | SO Batch / Manual Purchase issue review | current version, source, destination, normal duty, cover, actual actor, authority | Team Work | formal PO/version created |
| Record PO sent | same | issue day · Office | Purchase Orders communication region | exact version, recipient, channel, actor, Malaysia time | Team Work | current version becomes Issued |
| Confirm arrival | PO Duty / cover; superuser may act | one Office working day before expected arrival | Purchase Orders | structured answer/date plus WhatsApp or equivalent response evidence, recipient/channel, actor/time | Team Work | arrival remains or moves; Receiving work recomputes |
| Physical count | Carres location: GRN Duty; external Warehouse: assigned warehouse staff, accountable to GRN Duty | promised arrival day · Warehouse | Goods Receipts / Warehouse portal | exact Unit IDs where required, expected/accepted/rejected/not-delivered quantity, condition, signed DO, photos, site/time, counter | Team Work | submitted Receiving Session; no Stock movement yet for Warehouse submission |
| Post receipt | GRN Duty / dated cover; Jess / Operations Superuser may act | receipt day · Warehouse | Goods Receipts | submitted count or direct Office count, poster, source, signed DO, per-Unit outcomes | Team Work | session `posted`; formal GRN; Stock/Claim consequences once |
| Confirm balance date | PO Duty / cover | opens from partial posting; due on the next governed Office action day | Purchase Orders | open balance, supplier's new date and response evidence | Team Work | accepted quantity stays posted; remainder stays Incoming |
| Reject on spot | GRN Duty / receiving station | receipt day · Warehouse | Goods Receipts | exact Units/quantity, observable reason, photo, supplier/carrier hand-back proof | Team Work | rejected goods never become available Stock; Claim opens only when a supplier obligation remains |
| Accept with issue | GRN Duty | receipt day · Warehouse | Goods Receipts | exact Units, issue type, condition/photo evidence | Team Work | accepted Unit becomes controlled/unavailable and source-linked Supplier Claim opens |
| Claim request / response | PO Duty of the claim-open month or dated cover | each step has a governed Office date | Supplier Claims | requested result, supplier answer, response evidence, actor/time | Team Work | authorised replacement, repair, return, accept-as-is or other valid continuation |
| Purchase Return | created only from approved claim/outcome | supplier collection date · Warehouse | Purchase Returns | formal return version, exact Units, collection date, scan/count, handover proof, actual collector | Team Work | custody changes only on actual handover; Finance reads credit consequence |

`operation@carres.com` and Jess may perform governed operational actions, but neither becomes the
normal PO Duty or GRN Duty by acting. Audit always preserves normal owner, dated cover and actual
actor as different facts.

## 5 · Calendar rules

- PO issue, supplier calls, supplier answer recording and balance-date work use the Office calendar:
  Monday–Friday, excluding governed Malaysian holidays.
- Physical arrival, count, inspection, receipt posting and supplier collection use the Warehouse
  calendar: Monday–Saturday, excluding governed holidays.
- Supplier production uses the supplier's configured factory calendar. It does not redefine the
  Office or Warehouse week.
- A Saturday arrival creates Friday confirmation work. A Monday arrival also creates Friday work
  unless Friday is a holiday, in which case the Office engine moves to the prior valid day.
- Changing a supplier promise recomputes the confirmation and receipt actions from the new fact;
  it does not edit a Work row directly.

## 6 · Receiving outcomes and downstream truth

### Complete acceptance

Posting creates the formal GRN and applies accepted Stock/Unit consequences once. The PO closes
only when every ordered quantity is covered by accepted receipts or another authorised terminal
outcome.

### Partial receipt

Accepted Units post immediately. The remaining quantity stays Incoming on the PO line. Posting
opens `Confirm balance delivery date` for PO Duty; it does not invent damage or a claim.

### Reject on the spot

The goods remain with the supplier/carrier. The GRN records the rejected/not-delivered result and
proof but creates no available Stock. A Supplier Claim is created only when Carres must obtain a
replacement, repair, collection or other supplier result.

### Accept with issue

Physical custody is accepted, but the Unit is controlled and unavailable. The same posting creates
the source-linked claim and keeps the evidence connected to the GRN and Unit.

### Later defect

A later observation enters through Service Case, not a second Receiving intake. An authorised
supplier-responsible outcome creates the Supplier Claim workstream. Return or Repair is created only
from the approved outcome.

### Purchase Return

Creating or sending a return document does not move custody. The exact-Unit handover, collection
party, time and proof create the Stock consequence. Partial collection keeps the remainder open.

## 7 · Work and page placement

- `My Work` is every employee's complete daily list and defaults to their own work, including for
  managers.
- `Team Work` is the supervision view. It groups by normal owner and adds cover, actual actor,
  lateness, blocking fact and evidence state without reassigning the source object.
- A module's local rail may place `WORK TO DO` first, but it is a contextual filter over the same
  module actions, not another work store.
- On SO Batch Purchase, no permanent PO Duty toolbar, rail block or sentence is allowed. When a
  valid selection exists, the action is:

  ```text
  1 selected · 1 unit · Issue 1 PO          [YJ]  [Issue PO]
  ```

  The chip title is `Yu Jun · PO Duty`; a dated cover uses the cover's initials and names the cover
  context. The action sentence never contains Yu Jun's name.
- Every current and future Register/listing kit owns one four-sided light frame around its toolbar,
  table and fixed status footer. Sales Orders and SO Batch Purchase use the same engine rule; pages
  do not cancel side borders or add wrapper frames.

## 8 · Deliver To settings

`Carres Klang`, `AL Sungai Buloh`, `HOUZS` and `Ohana` are Purchasing Settings master data. Future
destinations use the same governed add/update door. A destination record must resolve:

- name, address, active state and default state;
- receiving station / party;
- arrival calendar;
- linked Carres warehouse or external/no-Stock consequence;
- Unit-scan and signed-DO/evidence requirements.

A warehouse-linked destination derives its address and Stock consequence from Warehouse authority.
An external destination must not create Carres Stock merely because it can receive a PO.

## 9 · Failure handling

- Missing duty or cover: Work and the action surface name the configuration defect; ordinary users
  cannot bypass it. Operations Superuser authority remains explicit and audited.
- Missing supplier response evidence: the promise cannot satisfy the confirmation action.
- Warehouse count already submitted: Office direct receiving is refused and opens that session.
- Duplicate PO + DO: the earlier receipt is named; a second GRN is refused.
- Missing/invalid Unit result or signed DO: posting is refused with the exact missing fix.
- Concurrent promise/receipt version change: save is refused and the operator reloads the source.
- Overdelivery: never silently accepted; exact extra Units enter a governed exception.
- Production migration number collision: no migration is applied until the delivery branch rebases
  onto the current migration sequence and repository migration gates pass.

## 10 · Implementation decomposition

This architecture must be delivered as independently reviewable plans, in this dependency order:

1. **Authority and owner-context foundation** — one Operations Superuser capability, PO/GRN duty,
   dated covers, normal-owner/cover/actor audit contract.
2. **Supplier confirmation evidence** — structured answer plus response evidence and the purchasing
   action projection.
3. **Goods Receipt / formal GRN authority** — per-Unit outcomes, two receiving doors, GRN Duty gate,
   posting and Stock/Claim consequences.
4. **Partial / reject / claim / return continuations** — balance work, reject vs accept-with-issue,
   source-linked Purchase Return and handover evidence.
5. **Cross-module Work feed and supervision** — Purchasing, Receiving and Claim projections into
   My Work / Team Work, plus contextual `WORK TO DO` rail filters.
6. **Owner-visible UI closure and rollout** — SO Batch selected-action owner chip/button, global
   Register frame, destination settings, real-account browser walks and production evidence.

Each plan starts with failing tests and ends with its own source-of-truth, API, SQL, audit and browser
gates. No plan may create a second action store or a second receipt/PO writer.

## 11 · Acceptance and release evidence

The complete release is not fixed until all of the following are true on the exact production SHA:

- PO Duty, dated cover, Jess and `operation@carres.com` see and can reach `Issue PO`; an ordinary
  non-duty/non-cover/non-superuser is refused by web, API and SQL.
- The selected SO Batch action shows only the compact owner chip beside `Issue PO`.
- My Work and Team Work contain real Purchasing, Receiving and Claim actions from production facts.
- Supplier confirmation cannot close without preserved response evidence.
- A real Warehouse-calendar arrival appears for GRN Duty; posting produces one formal GRN.
- Partial, reject and accept-with-issue each produce the specified distinct consequence.
- Audit shows actual actor and normal duty/dated-cover context separately.
- `AL Sungai Buloh` and `Ohana` are governed destination settings, and future locations use the same
  door.
- SO Batch Purchase and Sales Orders show the shared four-sided Register frame.
- Owner browser walk uses the real Operation account and real eligible records; screenshots and
  history/GRN evidence are retained.

## 12 · Delivery safety

PR #977 (`codex/purchase-orders-register`) was integrated into this delivery branch. After `main`
claimed `0401`, the three still-unmerged migrations were assigned the next legal sequence: `0402`
Purchase Orders document, `0403` Operations Superuser authority, and `0404` Deliver To Settings.
This design does not authorise applying any of them to production. Governed migration approval,
deployment, and production verification remain separate delivery gates after merge.
