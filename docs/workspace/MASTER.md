# WORKSPACE — MASTER

> **APPROVED / LOCKED by Jess, 2026-09-03 / sequencing approved 2026-09-04.** This is the one
> Workspace authority for Staff & Duties, action/approval ownership, Work and the future Dashboard.
> Modules own business facts and completion; Workspace coordinates them. There is no second
> Workspace Blueprint.

## 1 · Mission and boundary

```text
Dashboard   what management needs to know
Work        what someone needs to do
```

`Workspace → Staff & Duties` answers who holds each ERP Duty today, who covers an absence and who
actually acted. Workspace does not own module records or their completion facts.

Carres has one cross-module Work coordination surface. Module Registers, queues and action views
may show the same obligation, but never become separate Work Engines. One obligation retains one
identity, owner rule, due rule, completion fact and deep link everywhere.

## 2 · Action admission contract

An action enters Work only when its owning module supplies:

| Fact | Law |
|---|---|
| Work identity | Stable module + rule + source object + occurrence identity |
| Trigger | Stored condition that opened the obligation |
| Owning module | Owner of trigger and completion truth |
| Source | Canonical object identity and exact deep link |
| Fact/problem | Concrete first line; no generic `Pending`, `Handle` or `Follow up` |
| Action | Governed action; owner is metadata, never sentence prose |
| Required result | Exact fact the operator must produce |
| Completion | Measured by the owning module; Work has no manual `Done` |
| Owner rule | Stable person rule or Duty key, never a hard-coded person |
| Due | Exact date/time and calendar, or governed `No date` |
| Blocker | Named dependency; waiting alone is not blocked |
| Next | Governed consequence, not a Workspace promise |

Workspace reads projections and opens the owning write door. It never copies the business record,
assigns routine work independently, changes its due date or closes it.

## 3 · Duty, owner, cover and actor

> **An Action has an Owner. A business object does not have one universal action owner.**

```text
Action rule
→ named Duty or governed person rule
→ Primary holder / normal owner
→ active Buddy cover
→ acting person today
→ immutable actual actor when the result is recorded
```

Duty, normal owner, active cover, acting person and actual actor are separate facts. History stores
the effective assignment, cover, actor, decision and time. A later holder change updates current and
future routing everywhere but never rewrites history.

## 4 · Staff & Duties

`Workspace → Staff & Duties` is the only assignment surface. An authorised manager assigns one
Primary holder and optional effective-dated Buddy cover to each named Duty and can see immutable
assignment history.

Modules store only `rule → required Duty`. They never store another staff list, local approver,
hard-coded Jess/Manager identity or page-level cover calculation. People/HR supplies active,
employment and leave facts; Workspace owns Duty assignments; the Shared Duty Resolver combines
them.

Distinct Duties include Payment Duty, Storage Waiver Approver, Payment Approver, Purchasing
Approver, Delivery Charge Approver, Stock Adjustment Approver and Service Case Approver. There is
no fake `ERP Owner`.

A missing holder is `Not assigned`, never a silent PIC/email/manager fallback. The action remains
visible to authorised supervision with a Staff & Duties door.

## 5 · My Work and Team Work

```text
My Work     actions routed to the signed-in acting person today
Team Work   the same actions grouped by normal owner
```

- My Work is the default for everyone, including managers, and omits their repeated avatar.
- Team Work groups under owner avatar/name; cover appears only when today's actor differs.
- No manual `Take it`, `Release`, generic assignment or `Mark done` exists for deterministic work.
- Ordering is broken commitment, late, today, then later; blockers never hide lateness.
- Completed/History is read-only source evidence and preserves the actual actor.

## 6 · Module admission gate

A page displaying an action sentence is not enough. A module joins Work only with:

1. authoritative trigger and completion fact;
2. stable identity and occurrence law;
3. named person rule or Duty key resolved centrally;
4. governed due/calendar or explicit no-date law;
5. required result, recipient where applicable and exact source door;
6. permission/history evidence preserving the actual actor;
7. tests proving source completion removes the same Work identity.

Incomplete projections are excluded and reported as a Work-health gap. Workspace never fills a
missing module rule with a global default.

## 7 · Right Rail and Notifications

The Right Rail is counts and navigation into main My Work:

```text
My Work
Late
Due today
Open My Work
```

It contains no independent calculation, row, Duty editor, cover chip, assignment or completion
control. Selecting a count opens My Work with the filter visibly applied.

Notifications are event receipts—assigned, cover activated, became late, unblocked, source failed
or completed. Read/dismiss never changes Work. The Bell is not a second queue.

## 8 · Dashboard admission law

Dashboard is built after core module projections are stable. It admits only facts that change
management intervention, commitment risk or confidence:

- broken customer, supplier or delivery commitments;
- missing Duty holder or cover;
- Work source/integrity failure;
- material customer, goods or cash risk;
- workload health and valid trends;
- recent material change with an exact owning-object door.

Dashboard contains no action queue, manual completion, copied report or arbitrary KPI card. Every
number has one governed drill-down. A failed source never appears as zero.

## 9 · Delivery sequence

Workspace is not wholly deferred until every ERP module is complete:

```text
NOW
Staff & Duties → Shared Duty Resolver

WITH EACH MODULE
action projection → owner Duty/person rule → due/calendar
→ completion fact → exact deep link and history evidence

AFTER CORE MODULES CONVERGE
My Work → Team Work → module-rail previews → Notifications

LAST
Dashboard → management facts → cross-module trends → production validation
```

Core admission covers Sales Orders, Purchasing, Receiving, Stock/Warehouse, Delivery, Payment,
Service Cases and Issue Tracker. Catalog, Guarantee and Rental may join later; they do not block
honest Work for admitted modules.

## 10 · Measured implementation truth — 2026-09-06

- Migration 0425's shared Duty registry/resolver, effective primary assignment, dated cover,
  audit evidence, guarded API and the one `Workspace → Staff & Duties` UI are production-proven
  for GRN Duty. The same catalogue now exposes the other approved cross-module Duty names; their
  module consumers remain implementation evidence until each module is production-verified.
- Order and Manual Purchase Work now carry structured owner rule, Duty key, normal owner, active
  cover and acting person. My Work routes to the acting person; Team Work retains the normal owner.
  Payment and PO work no longer borrow the order PIC when their Duty is unresolved.
- `/api/operation/po-duty` remains only as the response-shape adapter listed in the Purchasing
  MASTER. Remaining Purchasing screens and the PO-day reminder must move to the Workspace contract
  before that adapter is deleted.
- `GET /api/operation/work` is now the one server-composed feed for admitted Sales Orders,
  Manual Purchase, Purchase Order supplier-reply and Receiving actions. Purchase Order reply work
  reads the exact current-version send and evidenced supplier-answer facts, resolves PO Duty and
  opens the exact PO; it does not restore the retired browser composition. The feed reuses the owning modules' reads and projectors;
  invalid source data fails visibly instead of presenting a false clear desk.
- My Work, Team Work and the Quick Rail My Work counts read that same cached response. The
  retired browser composition and Quick Rail Team/duty editor have been removed.
- My Work is the default for everyone. It routes by acting person; Team Work groups by normal
  owner and shows dated cover evidence without rewriting ownership.
- Several module MASTERs are approved while target implementation remains incomplete.
- Dashboard must wait; totals built now would preserve incomplete and duplicate calculations.

## 11 · Next governed work

1. Production-verify Staff & Duties and the Shared Duty Resolver.
2. Require every core module to expose the section 2 projection.
3. Remove legacy PIC/duty fallbacks.
4. Admit the remaining qualified modules to the server feed.
5. Retire remaining duplicate generated-task paths after source-by-source proof.
6. Emit Notifications from Work transitions.
7. Last, complete and owner-review Dashboard against production data.

Cards follow dependency slices; this MASTER is not an implementation queue.

## 12 · Done-when

- one Duty registry resolves every admitted action/approval;
- one holder change updates all routing, My Work and Team Work;
- leave activates Buddy cover without overwriting normal owner;
- source completion closes one stable Work identity;
- actual actor and approval evidence remain immutable;
- no module has an independent staff list, approver name or cover resolver;
- Right Rail and Notifications read the same Work truth;
- Dashboard reads verified facts and never becomes another queue;
- production verification precedes every completion claim.
