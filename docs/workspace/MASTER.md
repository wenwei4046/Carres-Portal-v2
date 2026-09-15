# WORKSPACE — MASTER

> **APPROVED / LOCKED by Jess, 2026-09-03 / sequencing approved 2026-09-04.** This is the one
> Workspace authority for Staff & Duties, action/approval ownership, Work and their relationship to
> the one global Dashboard.
> Modules own business facts and completion; Workspace coordinates them. There is no second
> Workspace Blueprint.
>
> **2026-09-15 COMPLETION ADDENDUM — READY FOR OWNER REVIEW.** Sections 4.1–4.6, 5.1–5.7, 6.1
> and 8.2.1 complete the previously missing Staff & Duties, Work and Dashboard relationship: UI
> composition, state, search/filter, priority/SLA, responsive, action-catalogue and management-measure
> contracts. They record target law separately from measured implementation truth in §10; they do
> not approve a production release or overwrite module facts.

## 1 · Mission and boundary

```text
Dashboard   what management needs to know
Work        what someone needs to do
```

These jobs are related but their left-navigation homes are not nested. Carres has exactly one
top-level `Dashboard`. It sits independently at the main start of the left bar and is never labelled,
grouped or repeated as `Workspace → Dashboard`.

```text
Dashboard

WORKSPACE
  Work
  Staff & Duties
  Issue Tracker
```

`Workspace` is the left-bar section label for coordination destinations, not a landing page and not
another Dashboard. Selecting `Work` opens My Work by default for staff and managers. Dashboard may
drill into filtered Work, while Work never becomes a Dashboard tab.

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

Distinct Duties include Storage Waiver Approver, Payment Approver, Purchasing
Approver, Delivery Charge Approver, Stock Adjustment Approver, Service Case Approver and, since
the owner ruling of 2026-09-13, **Delivery Duty** (`delivery_duty`). There is no fake `ERP Owner`.

**`Delivery Duty` is the assignment key of an owner rule the Work Engine already carried**
(`ownerRule: "delivery_duty"`), not a new Delivery-local duty system: routine Delivery
arrangement, customer contact, proxy recording, result recording on behalf of a partner and proof
review all resolve through it and the Shared Duty Resolver. Its Primary holder and Buddy cover are
configured only here. When no active holder or cover resolves, the action stays visible under its
duty word and the surface prints the governed configuration failure with its door, `Nobody holds
Delivery Duty.` and `Set the holder in Workspace → Staff & Duties`; the protected act refuses with
the same sentence. No action is routed to an Operations Superuser by default and Delivery Settings
never holds a roster or an owner list (`../delivery/MASTER.md` §13.1).

**`Finance Approver` (`finance_approver`) takes Finance users only.** Its holder and cover pickers
list active Finance users. The API reads them through the definer function `workspace_duty_staff`,
because an operation login cannot read Finance accounts under RLS. The database refuses a
non-Finance holder or cover with `the Finance Approver must be an active Finance user` (migration
0514, `workspace_duty_holder_roles`). While nobody holds the duty, the HR position tick still
answers (0508). The principal can always approve.

A missing holder is `Not assigned`, never a silent PIC/email/manager fallback. The action remains
visible to authorised supervision with a Staff & Duties door.

Current Operation roster effective 2026-09-07: Yu Jun and Shasha. Khor Yee is departed and may
appear only in immutable historical actor, employment, assignment or cover evidence; she is never a
current/future Duty holder, cover, acting person, My Work recipient or Team Work group.

### 4.1 · Page job and boundary

Staff & Duties answers three questions only:

1. Who normally holds each governed Duty?
2. Who acts during a dated absence?
3. What effective assignment/cover history proves that resolution?

It is not People, leave management, a roster/calendar, workload balancing, permission administration
or a manager dashboard. People owns active employment/access/leave facts. Modules name the Duty they
require. Staff & Duties owns effective primary assignment and Buddy cover; the Shared Duty Resolver
combines those truths. A manager never assigns individual routine Work here.

### 4.2 · Page composition

Desktop uses one catalogue and one selected-duty detail. It does not repeat two large forms and a
full history beneath every Duty.

```text
┌ Staff & Duties ──────────────────────────────────────────────────────────────┐
│ Who holds each company duty today and who covers an absence.   Search duties│
├ DUTIES ──────────────────────────┬ SELECTED DUTY ────────────────────────────┤
│ PO Duty                          │ PO Duty                                   │
│ [YJ] Yu Jun                      │ Normal owner  [YJ] Yu Jun                 │
│                                  │ Acting today [SH] Shasha                  │
│ GRN Duty                         │ Cover         15–17 Sep · Annual leave    │
│ [SH] Shasha                      │                                            │
│                                  │ [Change holder] [Add cover]               │
│ Delivery Duty                    ├ ASSIGNMENT & COVER HISTORY ───────────────┤
│ Not assigned                     │ 15 Sep · Shasha covering for Yu Jun       │
│                                  │ 01 Sep · Yu Jun assigned by Jess          │
│ …                                │                                            │
└──────────────────────────────────┴────────────────────────────────────────────┘
```

The left catalogue follows the shared Duty catalogue order and shows Duty label, current normal
holder and exceptional state: `Covered today`, `Starts {date}`, `Ends {date}` or `Not assigned`.
It never shows workload, performance, a recommended person or a copied module roster. Search matches
Duty label and authorised current/historical person names; `State` may narrow to `All duties`,
`Covered today`, `Cover scheduled` and `Not assigned`.

The selected detail prints separate labelled facts: `Normal owner`, `Acting today`, `Effective`,
`Cover` and `Reason`. The same person is not repeated as acting when no cover exists. Avatar initials
carry a full-name accessible label and never replace the printed name. Selecting a Work
configuration failure may deep-link directly to the required Duty while preserving this layout.

### 4.3 · Change-holder contract

`Change holder` opens a focused action surface with `Duty`, `New holder`, `Effective from`, optional
`Until` and optional factual `Note`. Eligible choices come from People's active authorised Carres
staff only; a departed, disabled, external Warehouse or ineligible account is not offered and is
refused again at the write door. The system shows the current holder and the resulting effective
period before confirmation.

The act appends a new assignment; it never edits or deletes an old row. Overlap resolution is
server-owned and must not leave two primaries effective on one day. A future assignment does not
change today's resolution early. A retroactive correction requires the separately authorised
correction law and preserves what it superseded; the ordinary form cannot rewrite history.

Success says `{name} holds {Duty} from {date}` and refreshes Work resolution from the shared source.
It does not claim that historical Work changed. Failure prints the governed server reason and keeps
the entered facts for correction without optimistic owner changes.

### 4.4 · Buddy-cover contract

`Add cover` is available only when the Duty has a normal holder for the complete selected period.
It asks for `Acting person`, `From`, `Until` and `Reason`. The acting person must be active, eligible,
different from the normal holder and authorised for every protected act the Duty requires. Cover is
inclusive of the governed business dates and resolves in the company's timezone, never the browser's.

Overlapping active covers for one Duty are refused; the manager must close/correct the conflict
through a governed append-only act. Cover changes only the acting person for open/future actions
during the period. It never grants an approval capability the person lacks, rewrites the normal
owner, changes due dates or attributes another person's completed act to the cover.

Success says `{acting person} covers {normal owner} for {Duty}, {from}–{until}`. Work and protected
module doors must resolve the same answer immediately after refresh. Ending, replacing or correcting
cover requires its own recorded reason/actor/time; disappearance from the current view never deletes
history.

### 4.5 · Access, states and responsive behaviour

| State | Required presentation and behaviour |
|---|---|
| Non-manager | Full authorised read view · `Duty assignments are set by the manager.` · no disabled or hidden write imitation |
| Loading | Catalogue/detail skeletons retain page geometry · `Opening Staff & Duties…` is acceptable accessible status |
| Empty catalogue | Configuration failure, because the governed catalogue is code-owned; never `No duties yet` |
| No search match | `No duties match this search` · `Clear search`; catalogue truth remains healthy |
| Not assigned | `Not assigned` · `Nobody holds {Duty}.` · manager sees `Change holder`; Work remains visible under Duty word |
| Cover active | Normal and acting person shown separately with effective dates/reason |
| Cover scheduled | Normal owner remains today's actor; future cover and start date are visible in detail |
| Read failed | `Staff & Duties could not be opened` · `Try again`; never infer no holder |
| Write refused/failed | Exact reason beside action; no local mutation of displayed resolution |
| History empty | `No assignments yet` / `No covers yet` within a valid selected Duty |

At 1440px and above use the catalogue/detail split. At 1024–1439px retain the split with a narrower
catalogue. Below 1024px show the catalogue first and open the selected Duty as a full-width detail
with an explicit Back door; forms are single-column and dates/names never truncate. Keyboard order is
search/filter → Duty list → selected facts → authorised actions → history. Focus returns to the
originating Duty after a modal closes.

### 4.6 · Current → proposed gap audit — 2026-09-15

| Current branch evidence | Required Blueprint state |
|---|---|
| One shared catalogue/resolver, guarded assign/cover doors and append-only histories exist | Retain as the only authority; production-verify every catalogue consumer, not GRN alone |
| Current page stacks Assign Holder, Add Cover and History under every Duty in a 720px document | Replace with one compact catalogue and one selected-duty detail/action surface |
| Server `can_assign` correctly hides write forms from non-managers | Retain; separate readable facts from authorised actions |
| Current staff picker reads Operation staff but the Blueprint roster is Yu Jun and Shasha | Enforce active/eligible source facts at read and write; never revive Khor Yee or admit external Warehouse accounts |
| Current cover form does not explain capability eligibility or visible overlap recovery | Add pre-confirmation facts and governed conflict/correction handling; writer remains authoritative |
| Current page has loading/read-error and immutable history evidence | Retain; add no-match, catalogue-failure, scheduled-cover and write-success/refusal contracts |
| Current layout has no search/filter, selected Duty or narrow-screen contract | Build the §4.2/§4.5 composition and verify at 1440, 1024 and 390px |

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

### 5.1 · One Work composition

Work is one page with two scopes over one open set. It is not a board, inbox, calendar or module
dashboard.

```text
┌ Work ────────────────────────────────────────────────────────────────────────┐
│ [My Work] [Team Work]                         Search work…   Filters   Refresh│
│ Applied: Late · Delivery                                            Clear all│
├ BROKEN COMMITMENTS / LATE ──────────────────────────────────────────────────┤
│ SO-1318 · Sales Order                                                        │
│ No delivery date                                                            │
│ Ask customer for a delivery date                                            │
│ No date                                                    Open Sales Order  │
├ TODAY ───────────────────────────────────────────────────────────────────────┤
│ DO-2041 · Carres Klang Warehouse                                             │
│ 2 Units have not been handed over                                           │
│ Check, pack and hand over the exact Units · NETS Delivery                    │
│ Every required Unit handed over with receiver and proof         Due today   │
├ LATER ───────────────────────────────────────────────────────────────────────┤
│ …                                                                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

My Work groups by timing: `Broken commitments` when an authoritative promise is already broken,
then `Late`, `Today`, `Later` and `No date`. A broken commitment is also late when its due fact says
so; it appears once, at the highest applicable severity. Team Work first groups by normal owner,
Site queue or unresolved Duty, then uses the same timing order inside each group. Group headers say
what they count: `8 actions to do · 2 late`, never `8 open` without a noun.

The page never writes module truth. Selecting any item opens its exact owning object and focuses the
required act. Where the owning surface cannot perform the act, the item is read-only and says where
to go; Workspace does not add a substitute button.

### 5.2 · Work-item presentation contract

Each visible item is generated from structured facts in this order:

```text
OBJECT LABEL · MODULE OR SITE CONTEXT
FACT OR PROBLEM
ACTION · RECIPIENT (when applicable)
REQUIRED RESULT (when it materially disambiguates completion)
DUE / LATENESS · BLOCKER / COVER / SOURCE HEALTH (only when present)
```

- Object identity belongs in the item header and is not repeated in the action.
- Owner belongs in the Team group/avatar or exceptional cover/handover metadata, never the sentence.
- My Work omits the signed-in person's avatar. It shows `Covered for {normal owner}` when routed by
  active cover. Team Work keeps the normal owner's group and shows `Covered by {acting person}`.
- A Site queue is an owner state, not a person. It prints `{Site} queue` until a qualified person
  accepts; acceptance changes resolution, not the source object or completion fact.
- The action begins with a specific verb and names its business object only when the header does not
  already make it unambiguous. `Follow up`, `Check`, `Handle`, `Process` and `Pending` alone are
  forbidden.
- Required result is visible for physical handover, multi-result and otherwise ambiguous acts; it
  remains available as accessible supporting text for every item.
- Avatar initials are a chip with the full current name on hover, focus and tap. Departed people may
  appear only in historical evidence.

### 5.3 · Filter, search and URL contract

Search matches the authorised open set by object number/label, customer, supplier, recipient,
problem and action. It never broadens permission scope and never searches a separately cached copy.

Filters are: `Scope` (`My Work` · `Team Work`), `When` (`Late` · `Today` · `Later` · `No date`),
`Module`, `Owner` (Team only), `Covered`, `Blocked` and `Source failed`. `Broken commitment` is an
attention filter, not a synonym for late. Multiple filters combine and every active filter is
visible, individually removable and represented in the URL so Dashboard and Right Rail can open
the exact same result. `Clear all` preserves the current scope. Refresh re-reads the one feed and
does not change business state.

Default ordering is severity, due time, oldest opened occurrence, object label. Users may narrow
the view but cannot manually reprioritise authoritative due facts. Search and filter results keep
the same group and item grammar; zero matches is not the same as zero work.

### 5.4 · Work states

| State | Required presentation and behaviour |
|---|---|
| Loading | Keep the page shell and applied scope/filter visible; use quiet row placeholders, never `0` |
| Empty My Work | `Nothing assigned to you` · `Open Team Work` for authorised supervisors; source freshness remains visible |
| Empty Team Work | `No open work` only when every admitted source is healthy; otherwise show the failed source state |
| No search/filter match | `No work matches these filters` · `Clear filters`; never imply the source set is empty |
| Late | `Late — was due {date}` and working-day age; colour supports the words and is never the only signal |
| Blocked | Name the dependency and the door that can resolve it; retain late status and ordering |
| Not assigned | Group under the governed Duty word · `Nobody holds {Duty}` · `Set the holder in Workspace → Staff & Duties` |
| Covered | Preserve normal owner and effective cover evidence; My Work routes to today's acting person |
| Source delayed | Preserve last safe observation and say `Could not refresh {source}` with time |
| Source failed | Isolate and name the source; never omit its possible work or convert failure to zero |
| Permission refused | `You do not have access to this work` and no leaked counts, objects or people |
| Completed/history | Leaves the open set only after the authoritative completion fact; history shows result, actual actor and time |

### 5.5 · Responsive and accessibility contract

- At 1440px and above, Work uses the full main canvas; the global Right Rail may remain beside it but
  contains only the §7 peek. Team owner groups stay vertically readable, never become board columns.
- At 1024–1439px, controls wrap into two lines and item content remains one continuous reading order.
- Below 1024px, My/Team scope, search and filters become a touch-safe stacked toolbar; every item
  wraps rather than truncating the problem, action, required result or due state. No horizontal
  owner board or hidden completion text is permitted.
- Keyboard order follows scope → search → filters → groups → items. Every item has one descriptive
  accessible name combining object, problem and action. Hover evidence is also available by focus
  and tap; colour, initials and icon alone never carry meaning.

### 5.6 · Priority, due and SLA law

Workspace does not store a free-form priority or invent one global SLA. Severity is derived in this
order from module truth:

1. `Broken commitment` — an explicit customer, supplier, payment or delivery promise is past and
   its completion fact is absent.
2. `Late` — the governed due instant is past on the named calendar.
3. `Due today` — due on the current business day for that rule/calendar.
4. `Later` — a governed future due instant.
5. `No date` — the module explicitly admits an obligation with no lawful clock.

Materiality (`Routine` · `Significant` · `Critical`) belongs to the owning module and may raise
attention within the same timing band; it cannot turn an undated item into late. A blocker is an
orthogonal fact and never lowers severity. The displayed due date is the module's due fact; the
displayed working-days-late value is calculated with the same snapshotted calendar/rule. Changing
an SLA changes future obligations unless the owning module explicitly versions existing ones.

System automation that should have happened immediately is a source/integrity failure, not a fake
person task. Supervisory escalation is a notification/management receipt derived from the same
identity; it never changes the owner, due date or completion fact.

### 5.7 · Work current → proposed gap audit — 2026-09-14

| Current branch evidence | Required Blueprint state |
|---|---|
| My Work / Team Work use one server-composed open feed | Retain; make all admitted modules use the same transport contract and source health |
| My Work defaults correctly and Team groups by normal owner | Retain; add complete cover/handover and unresolved-Duty evidence everywhere |
| Right Rail reads the same cache and opens `when` filters | Retain; all supported filters must be URL-visible and use the same vocabulary |
| Current main Work page has scope toggles and limited Rail-linked time filtering | Add governed search, visible filter controls, module/owner/cover/blocker/source filters and no-match state |
| Current rows show object, problem, action and due; Delivery/Warehouse show required result | Make required result accessible on every item and visible whenever completion would otherwise be ambiguous |
| Current rows use truncation on narrow content | Replace with wrapping under 1024px; prove object/problem/action/result/due remain readable at 390px |
| Current empty/error handling is page-level and source composition is incomplete | Isolate source failures, distinguish true empty from no match, preserve last-safe observation where governed |
| No completed/history surface exists in shared Work | Add read-only history only after durable source result/actor evidence can support it; never synthesize Done rows |
| Warehouse external queue and acceptance exist on the pending branch | Complete identity/offboarding/transfer guards and production proof before admission claim |
| Service Case is absent; Bell remains a duplicate legacy queue | Keep Service Case excluded until owner/date laws close; replace Bell only with durable transition receipts |

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

### 6.1 · Governed action catalogue

This catalogue is the Workspace reading of module-owned rules. The module remains authoritative;
changing a trigger, due law or completion fact requires changing that module's MASTER and projector,
not editing free text in Workspace. Recipient is supplied by the source object where applicable.

| Owning module · action identity | Why it exists / required result | Owner rule | Due law | What closes it / next |
|---|---|---|---|---|
| Sales Orders · `ask_delivery_date` | Requested delivery date absent · obtain the customer's date or `not yet` answer | Responsible Salesperson | `No date` for admitted legacy rows | Requested Delivery Date or governed TBD fact exists · order planning continues |
| Sales Orders · `issue_po` | Demand is uncovered · obtain PO coverage | PO Duty | Purchasing Order By date | PO covers demand · supplier-confirmation work may open |
| Sales Orders · `delay_planning` | Supplier date breaks the customer commitment · record the customer-plan decision for that exact date | Responsible Delivery Operation for the customer commitment | 2 Office working days from detection | Decision and decided ETA recorded · Delivery opens the governed next booking act when required |
| Purchasing · `manual_purchase.approve` | Manual Purchase awaits a decision · approval/refusal recorded | Purchasing Approver | Request Order By date, Office calendar | Decision stored · approved demand may require PO issue |
| Purchasing · `manual_purchase.issue_po` | Approved demand/current PO version has not reached supplier · sent evidence | PO Duty | Request Order By date, Office calendar | Current version has confirmed-send evidence · supplier-reply clock opens |
| Purchasing · `purchasing.confirm_ready_date` | Open PO has no standing ready/arrival promise · supplier promise recorded | PO Duty | Customer date − buffer − production calendars | Standing supplier promise exists |
| Purchasing · `purchasing.supplier_reply` | Sent current PO version has no supplier answer · evidenced answer | PO Duty | First confirmed-send day, moved to next Office working day if closed | Answer for exact version exists |
| Purchasing · `purchasing.supplier_date_passed` | Supplier date passed with goods owing · new evidenced arrival answer | PO Duty | Supplier date, closure-adjusted | New governed supplier answer/date exists |
| Purchasing · `purchasing.confirm_tomorrows_delivery` | Arrival is tomorrow · confirmation about that date | PO Duty | Office working day before arrival | Tomorrow-delivery promise exists |
| Purchasing · `purchasing.confirm_balance_delivery_date` | Short receipt left goods owing · balance promise | PO Duty | Opens with short receipt; Calls calendar owns filing | Balance promise for line exists |
| Receiving · `receiving.check_in` | Promised goods lack a posted session · check in the arrival | GRN Duty | Promised arrival day | Receiving Session posted · stock/issue facts continue from Receiving |
| Warehouse · `warehouse.outbound_handover` | Dated pickup has Units not handed over · exact receiver/proof result | Authorised Site queue, then accepting operator | Scheduled Site handover date | Every required Unit has accepted handover evidence · Delivery owns the next leg/result |
| Delivery · `arrange_new_delivery_date` | Approved delay requires a reachable new booking · confirmed date/slot | Governed Delivery proxy rule | Same Office working day as delay decision | Customer-confirmed reachable booking exists |
| Delivery · `assign_logistics` | Delivery required with no company · company selected | Delivery Duty | 3 delivery working days before promise | Delivery company recorded · booking action may open |
| Delivery · `confirm_delivery_date` | Company assigned but customer date/slot unconfirmed · evidenced booking | Delivery Duty | Configured call days before promise | Confirmed date and slot with evidence |
| Delivery · `deliver_today` | Confirmed delivery is today without result · result recorded | Delivery Duty | Confirmed delivery date | Delivery attempt result exists · proof/recovery follows result |
| Delivery · `upload_delivery_photo` | Delivered result lacks file · proof file recorded | Delivery Duty | 1 delivery working day after delivery | File exists · proof review may open |
| Delivery · `check_delivery_proof` | Latest delivery file is unreviewed · governed review result | Delivery Duty | 1 delivery working day after delivery | Review newer than latest file exists |
| Delivery · `collect_loan_item` | Loan item remains out on delivery day · returned evidence | Delivery Duty | Delivery day | Loan row is returned |
| Payment · `payment.collect_customer_balance` / `payment.missed_promise` | Issued Invoice remains owing when collection is actionable · payment obtained | Stable Collection Owner; active cover acts | Collection deadline or customer's promised day | Atomic allocations reduce Invoice/order outstanding to RM 0 |
| Payment · `payment.send_storage_invoice` | Live Storage Invoice remains unpaid · invoice sent and money collected | Stable Collection Owner | Shared collection deadline, else `No date` | Live storage owing is RM 0 |
| Payment · `payment.review_overpayment` | Money exceeds live obligations · allocation or approved refund decision | Payment Approver Duty | Governed `No date` | Overpaid amount is RM 0 or approved refund covers it |
| Payment/Stock · `payment.check_stored_furniture` | Open storage case reached inspection interval · inspection result | Warehouse capability/owner rule; admission waits for a governed person resolution | Last check/storage start + configured interval | Due inspection recorded |
| Finance exception · `resolve_payment_exception` | Open Finance exception holds delivery · clearance evidence | Finance owner rule; unresolved must remain Not assigned | Immediate | Exception cleared with evidence · delivery gate re-evaluates |
| Claims · `claims.confirm_what_happens_next` | Supplier answered but Carres resolution absent · customer resolution | PO Duty holder from claim-open month, retained historically | Governed `No date` | Customer resolution recorded · claim proceeds to its next authoritative state |
| Issue Tracker · versioned `issue_actions` occurrence | Current governed issue result is required | Stored approved Duty rule resolved centrally | Stored occurrence due date | Atomic result completes or replaces occurrence |
| Service Case · deadline/derived follow-ups | Customer/case result required | **Not admitted:** routine owner rule is not yet governed | 14-working-day deadline exists; derived-step clocks unresolved | Case outcome facts close each source step; admission waits for §11.5 |

`issue_delivery_order` is registered system automation, not a person's Work item: the same
transaction that completes its gate issues the document. Claims remain in shared Work only where
the authoritative Claims projection above is still active; no old Purchasing claim queue may create
a duplicate occurrence. Older order-track keys such as `confirm_ready_date` and `collect` may remain
as compatibility identities only where they resolve to the same Purchasing or Payment obligation;
they may not produce a second open item. A module action not listed here is excluded until it passes
§6.

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

### 8.1 · Dashboard composition

The one global, top-level Dashboard is the management reading surface over authoritative module facts and the shared Work
contract. It answers, in this order:

1. Is a customer, supplier, delivery or payment commitment already broken?
2. Is material customer, goods or cash exposure increasing?
3. Can the accountable people act today, or is ownership/cover/source integrity broken?
4. Where is intervention changing the trend?

The desktop composition is:

```text
┌ Dashboard ─────────────────────────────── Refreshed 09:42 · All sources healthy ┐
│ MANAGEMENT ATTENTION                                                        │
│ 3 broken customer commitments  2 supplier promises broken  1 Work source failed│
│ Each fact is a drill-down aggregate; no action sentence or Done control.     │
├ COMMITMENT HEALTH ───────────────────────┬ MATERIAL EXPOSURE ─────────────────┤
│ Customer delivery · broken / due today   │ Customer cases · significant/critical│
│ Supplier promise · broken / no answer    │ Goods · shortage/quarantine/blocked │
│ Delivery result · missing / failed       │ Cash · overdue balance/recovery      │
│ Payment promise · overdue                │ Direction vs previous governed period│
├ WORK HEALTH ─────────────────────────────┼ RECENT MATERIAL CHANGE ─────────────┤
│ Open · late · blocked · no owner/cover   │ Time · fact changed · object door    │
│ Load by normal owner; cover shown apart  │ Only changes that alter intervention │
│ Oldest late and ageing distribution      │ Never a copied activity stream       │
└──────────────────────────────────────────┴────────────────────────────────────┘
```

`Management attention` contains only non-zero intervention facts. A fact identifies its measure,
scope and oldest/amount context, then opens the already-filtered owning Register or Team Work. It
does not list individual actions. When no intervention is required it says `No management attention
needed` and still shows source freshness; it never celebrates a failed source as a clear desk.

`Commitment health` uses explicit promises only. An internal estimate, open PO, active order or
pipeline stage is not a broken commitment. Each row shows `Broken · Due today · Due later` only where
the owning module has a governed date and completion fact. Selecting a row opens the owning module,
not a Dashboard drawer.

`Material exposure` admits only consequences that can change a management decision: significant or
critical customer cases, quarantined/blocked goods, material shortage, overdue customer cash and
unrecovered issue cost. Currency never nets incurred, recoverable and recovered. Threshold and
period come from the owning module/settings and appear in the drill-down evidence.

`Work health` is the only Dashboard reading of Work. It aggregates the same server feed by normal
owner, acting cover, lateness, blocker and source health. Selecting it opens Team Work with the exact
filter. It never repeats My Work rows or treats `Not assigned` as somebody's queue.

`Recent material change` is not an activity feed. It includes only a newly broken/recovered
commitment, material exposure crossing its governed threshold, owner/cover/source failure or a
material recovery. Each receipt states the changed fact, time and exact object door.

### 8.2 · Measure contract and source health

Every Dashboard measure carries:

| Fact | Requirement |
|---|---|
| Identity | stable measure key and owning module |
| Meaning | one sentence defining included and excluded records |
| Value | count, amount, age or rate with unit |
| As of | source observation time and business date |
| Comparison | governed prior period or none; never a decorative percentage |
| Threshold | named module rule where attention depends on a threshold |
| Coverage | included population and permission scope |
| Drill-down | one filtered owning Register or Team Work destination |
| Health | healthy · delayed · failed; last successful observation preserved |

Partial source failure is isolated. Healthy sections remain visible; the affected measure reads
`Could not load {source}` with `Last available {time}` where safe. A whole-page failure appears only
when the Dashboard composition itself cannot be validated. Retry re-reads sources and never changes
business state.

#### 8.2.1 · Management measure register

These are the only planned first-release measures. `Eligible` means the Blueprint admits the
meaning; it does not mean the source has passed the production gate.

| Dashboard measure | Owning truth and inclusion | Drill-down | Admission state |
|---|---|---|---|
| Broken customer delivery commitments | Sales Orders/Delivery: explicit confirmed/requested commitment past without governed result | Filtered Sales Orders or Delivery Register | Eligible after date/result source proof |
| Broken supplier promises / no answer | Purchasing: current PO version's evidenced promise passed, or confirmed-send answer clock passed, with goods owing | Filtered Purchase Orders | Eligible after exact-version proof |
| Missing/failed delivery result | Delivery: due Delivery Order without an accepted result, or latest attempt is an exception requiring intervention | Filtered Delivery Orders | Eligible after result/exception threshold proof |
| Overdue payment promise | Payment: issued Invoice outstanding after governed collection or customer-promise deadline | Filtered Payment Monitor | Eligible after one-Invoice arithmetic/source proof |
| Material customer cases | Service Case: open Significant/Critical cases under its governed materiality | Filtered Service Cases | Held until Service Case source/owner admission is complete |
| Material goods exposure | Stock/Receiving: governed shortages, quarantine or blocked Units/quantity above owning thresholds | Filtered Warehouse/Receiving surface | Held until threshold, Site scope and one drill-down are verified |
| Material cash exposure | Payment/Finance: overdue customer balance or approved recovery exposure, shown without netting distinct tracks | Filtered Payment/Finance register | Eligible after definition/threshold proof |
| Work health | Shared Work: open, late, blocked, unresolved owner/cover and failed source by normal owner | Team Work with exact URL filters | Eligible per admitted source; partial health required |
| Recent material change | Durable owning-module/Work transition crossing one admitted measure's state or threshold | Exact owning object | Held until durable idempotent receipts exist |

Counts of active Orders, open POs, GMV, generic low stock and unreviewed annotations are explicitly
not admitted measures. A measure without an authoritative threshold remains absent rather than
using an attractive default.

### 8.3 · Dashboard vocabulary

Use: `Management attention` · `Commitment health` · `Material exposure` · `Work health` ·
`Recent material change` · `Broken` · `Due today` · `Due later` · `Blocked` · `Not assigned` ·
`Covered by` · `Last available` · `Could not load` · `Open Team Work` · `Open {module}`.

Do not use: `At Risk` · `SLA` · `Open POs` as an alert · `Active pipeline` as management health ·
`to action` · `All on track` without source evidence · `No alerts ✓` · `Escalations` for an
unreviewed annotation · `Upcoming` · `Take it` · `Release`.

### 8.4 · Responsive behaviour

- At 1440px and above, use the two-column reading order shown in section 8.1; attention spans both.
- At 1024–1439px, keep attention full width and stack each paired section in a single column.
- Below 1024px, use one continuous document: source health, attention, commitment, exposure, Work
  health, recent changes. No horizontal pipeline, compressed five-column board or sideways KPI strip.
- Counts and amounts never truncate. Long measure explanations wrap; object doors remain keyboard and
  touch accessible. Hover-only source/threshold evidence also opens by focus/tap.
- Right Rail remains a My Work navigation peek beside Dashboard on supported desktop widths; it is
  not folded into Dashboard. On narrow screens its existing navigation door remains separate.

### 8.5 · Current → proposed gap audit — 2026-09-07

| Current production | Decision |
|---|---|
| `Today`, `Open POs`, `Overdue` KPI tiles | Replace with governed intervention facts; an open PO is not itself a problem |
| Active orders and GMV hero | Remove unless a governed comparison/threshold proves management relevance |
| Five-column order pipeline with recent order cards | Remove from Dashboard; Sales Orders owns its Register and flow views |
| Open Purchase Orders card | Remove; show only broken supplier promise/no-answer commitments from Purchasing truth |
| Low Stock plus separate Stock Alerts/Reorder queries | Replace with one material goods-exposure measure after Stock defines threshold, site scope and drill-down |
| Emoji Escalation inbox from annotations | Remove; an annotation is not a reviewed escalation or Work transition |
| Multiple client queries with independent loading states | Replace with one validated Dashboard composition carrying per-source health |
| `See all orders`, `Manage POs`, `Open warehouse` generic doors | Replace with one exact filtered owning-module drill-down per measure |
| Whole-page RPC error | Retain retry, add per-source health and last-safe observation; never turn failure into zero |
| Dashboard currently grouped under the left-bar `Workspace` section | Move it to the one independent top-level Dashboard position; Workspace contains Work, Staff & Duties and Issue Tracker only |

No Dashboard production rebuild begins until each admitted measure has the section 8.2 contract and
its owning module is production-verified. This blocks invented totals, not the already-honest Work
surface.

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
- The legacy `/api/operation/po-duty` response-shape adapter and its client hooks are retired.
  Purchase Orders, the Sales Order Route and Orders Control now read today's acting PO / GRN person
  from the shared Workspace Duty resolver; dated cover changes the acting person without rewriting
  the normal holder. The legacy PO-day `ops_tasks` reminder is also retired: each Sales Order that
  needs a PO is already an authoritative `issue_po` Work projection owned by current PO Duty. PO
  Days remain Purchasing scheduling facts and never create a second free-text task.
- `GET /api/operation/work` is now the one server-composed feed for admitted Sales Orders,
  Manual Purchase, Purchase Order supplier-reply and Receiving actions. Purchase Order reply work
  reads the exact current-version send and evidenced supplier-answer facts, resolves PO Duty and
  opens the exact PO; it does not restore the retired browser composition. The feed reuses the owning modules' reads and projectors;
  invalid source data fails visibly instead of presenting a false clear desk.
- My Work, Team Work and the Quick Rail My Work counts read that same cached response. The
  retired browser composition and Quick Rail Team/duty editor have been removed.
- **One cache key per read (production-verified 2026-09-13, `ed76eb43`).** The legacy
  `ops_tasks` read (header Bell, Orders Control) once cached under the SAME React Query key as the
  shared Work feed, so whichever read landed second was served the other's shape: My Work, Team
  Work, the Quick Rail counts and the Payment Monitor's owner cells went dark while the feed
  carried 215 items. The legacy read now owns `["operation","legacy-tasks"]`;
  `work-cache-isolation.test.tsx` proves both mounting orders, co-mounting, feed invalidation and
  shape incompatibility against a real QueryClient, with a negative control on the old key. A key
  collision is a silent wrong answer, never an error — every read owns exactly one key.
- My Work is the default for everyone. It routes by acting person; Team Work groups by normal
  owner and shows dated cover evidence without rewriting ownership.
- Stock/Warehouse admission was re-audited against the production-verified replacement Monitor,
  Inbound and Outbound surfaces on 2026-09-07. Supplier arrivals already enter through Receiving's
  GRN-owned action; Monitor is read-only management visibility and creates no Work. Physical
  Outbound work is deliberately not admitted yet: its approved owner is an individually signed-in
  NETS Warehouse operator, falling back to an authorised Site queue until accepted, while the
  current central Work endpoint is Operation-only and has neither Site-queue routing nor personal
  acceptance facts. Naming Carres staff, `NETS` or a shared warehouse login would violate section 3.
- Delivery-owned arrangement, company assignment, customer booking, delivery-day result, proof and
  loan-return actions now retain Delivery as their module in the shared engine. Their stable object
  is the Delivery scope until a Delivery Order exists, then the exact DO where the result/proof act
  belongs; the server supplies the Delivery editor/DO door. The source Sales Order remains linked
  context and is no longer presented as the universal owner of those actions.
- Payment collection now enters from the complete issued-Invoice register, not a second Sales Order
  balance calculation. The shared readiness and collection clock admit only due/late balances whose
  goods are ready or have a real arrival date; the order's ONE collection owner — the Responsible
  Delivery Operation, read through the one shared authority `delivery_responsible_operation`
  (the order's responsibility ledger row, else the INDIVIDUAL the Sales Order was dealt to when it
  entered Operations — `ops_order_control.assigned_staff`; contact history and the Delivery Duty
  holder are no longer owner sources, and an account with no `staff_code` may record evidence but
  never own), with today's acting person being the governed buddy cover, else an away person's
  least-loaded stand-in for the day, and kept until the
  balance is RM 0 (0489 · 0504, owner rulings 2026-09-13) — owns the action
  with the shared buddy-cover law and a formal handover door; `Payment Duty` is retired; the exact Invoice
  is the object/door (`/finance/monitor?invoice=`, the same collection workspace the Payment
  Monitor row opens), and only an atomic allocated payment reducing outstanding to RM 0 completes
  it. The clock's ask/deadline pair is `Settings → Payments → Collection timing` (0486),
  snapshotted on the invoice's issue day; the deadline is a company-calendar fact and the contact
  action is scheduled on the resolved owner's governed working days (Operation: Mon–Fri). A live unpaid Storage Invoice raises `Send the invoice and collect payment`
  (`payment.send_storage_invoice`) under the governed Delivery owner word. The Payment Monitor is
  the full collection overview and reads these same items for its owner avatar — it creates no
  second action, completion, owner or `Done`. A sent message remains evidence and bank matching
  remains later evidence; neither is a second settlement step nor closes Work.
- Service Case admission was re-audited against the approved Service MASTER and shipped case plan,
  deadline clock and case API on 2026-09-07. The one deadline action (`Call {customer} — say why it
  is taking longer`) already has an authoritative trigger, 14-working-day deadline, exact case door
  and completion event tied to the deadline in force. It is deliberately not admitted yet because
  routine Service Case work has no governed person rule or Duty key: production describes the whole
  module only as Operation-scoped. `Service Case Approver` governs case decisions, not routine
  customer calls, and must not be reused as a convenient fallback. The other derived case follow-ups
  also have no step owner or governed per-step due law. Workspace therefore reports this as an
  admission gap and does not invent an `Operation team` owner, a global fallback or duplicate task
  rows. Their outcome dates remain the authoritative completion facts in the Service Case.
- Issue Tracker admission now uses the versioned `issue_actions` occurrence as its one action truth.
  Intake stores an owner rule, never a person sentence; `Issue Triage Duty` and `Issue Review
  Approver` resolve through Staff & Duties with dated cover. One atomic result door records the
  governed result, actual actor, normal owner and cover evidence, then completes or replaces that
  occurrence. Open actions project into shared Work with their exact Issue door. Migration 0440
  preserves legacy Current Actions as sequence 1 and cancels only the explicitly linked generated
  `ops_tasks` duplicate; historical actor/task evidence remains. The old mutable columns remain
  transition-only database baggage and have no application writer or reader.
- Notifications were re-audited against the shipped global Bell on 2026-09-07. The current Bell is
  not a notification system: it independently recomputes overdue/near-delivery Orders, reads legacy
  `ops_tasks`, labels the result `to action` and opens Orders. That is a second action queue and can
  disagree with My Work, so it is not accepted as Workspace truth. No durable Work-transition receipt,
  recipient, unread/dismiss evidence or source-failure event store exists yet. Browser polling or
  local storage must not fabricate that history. The replacement must persist idempotent receipts
  from admitted Work identity transitions (`assigned`, `cover activated`, `became late`, `unblocked`,
  `source failed`, `completed`), scope them to the affected person/supervision, and keep read/dismiss
  independent from Work. Until that source exists, the legacy Bell remains measured debt, not a
  completed Workspace feature.
- Dashboard was re-audited against its RPC, route, client composition and all shipped tiles on
  2026-09-07. The current page remains an old order-pipeline prototype with duplicated PO/stock/order
  calculations and an annotation inbox; it is not accepted as management truth. Sections 8.1–8.5
  now govern the replacement composition, measure/source-health contract, exact vocabulary,
  responsive layout and current-to-proposed cutover. Production rebuild remains last and begins only
  when every admitted measure has a verified owner, definition, threshold where applicable and exact
  drill-down.
- Several module MASTERs are approved while target implementation remains incomplete.
- Dashboard must wait; totals built now would preserve incomplete and duplicate calculations.

## 11 · Next governed work

1. Production-verify Staff & Duties and the Shared Duty Resolver.
2. Require every core module to expose the section 2 projection.
3. Remove legacy PIC/duty fallbacks.
4. Add permission-scoped Warehouse Site queues and personal operator acceptance/resolution, then
   admit physical Outbound actions; never turn Monitor events into actions.
5. Define a routine Service Case owner rule/Duty (separate from approval) and decide whether its
   derived follow-ups are governed `No date` actions or receive per-step clocks; then admit only the
   qualified projections to the server feed.
6. Production-verify Issue Tracker action migration, result transition, duty assignment/cover and
   exact Work deep link; then remove its transition-only legacy Current Action columns in a later
   schema cleanup.
7. Retire remaining duplicate generated-task paths after source-by-source proof; PO-day and Issue
   Tracker generation are retired, while the legacy Bell remains the governed gap above.
8. Replace the legacy Bell queue with durable, idempotent Work-transition receipts and migrate the
   header to those receipts; read/dismiss must never alter Work.
9. Last, complete and owner-review Dashboard against production data.

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
