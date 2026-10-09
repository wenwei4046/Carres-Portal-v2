# WORKSPACE — MASTER

> **APPROVED / LOCKED business architecture — Jess, 2026-09-03; Work architecture reconciled
> with the owner-approved working-week and three-panel direction, 2026-09-16.** This is the one
> Workspace authority for Staff & Duties,
> action/approval ownership, Work and their relationship to the one global Dashboard.
> Modules own business facts and completion; Workspace coordinates them. There is no second
> Workspace Blueprint. The Work composition and measurable UI contract are locked in §5.5; existing
> HTML prototypes and prototype companion specifications remain exploration only.

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
  Workspace
  Issue Tracker

HEADER SETTINGS
  All System Settings
    Staff & Duties
```

**NAVIGATION LABEL — OWNER-APPROVED 2026-09-29 / BUILT; production verification pending.**
The main-menu destination is `Workspace`, matching its existing page title. This replaces the
visible destination name `Work`; the existing `work` route key and `/operation?tab=work` address
remain unchanged. `Workspace` also names the coordination section; it creates no extra landing
page or Dashboard. The page retains `My Task` and `Team Work`, with `My Task` the default for staff
and managers. Dashboard may drill into the same filtered work set. Internal references to Work
describe the shared action engine, not a second navigation destination.

### 1.1 · Cross-destination relationship

| From | To | Exact reason and preserved context |
|---|---|---|
| Work item | Owning module object | Perform or record the required result; Work scope/filter remains in the URL |
| Work `Not assigned` | Settings → Staff & Duties | Open the exact unresolved Duty; returning restores the same Work result |
| Staff & Duties Duty | Team Work | Read-only `Open Team Work` with exact normal-owner/Duty filter; Staff & Duties never composes rows |
| Issue Tracker Current Action | Work or same Issue result section | Shared action identity; no copied task and no second completion |
| Work Issue item | Issue workspace | Open exact Issue and Current Action; My/Team scope remains recoverable |
| Issue linked object | Owning module object | Read/write business truth there; Issue selection remains recoverable |
| Owning module problem | Issue Tracker intake | Prefill typed source object and observed facts; the module event remains authoritative |
| Dashboard Work health | Team Work | Exact URL-visible health/owner/timing filter; Dashboard never shows action rows |

Browser Back returns to the same scope, saved view, search, filters, selected owner/Duty and scroll
position where technically safe. A cross-page door never changes business state merely by opening.

`Settings → Staff & Duties` answers who holds each ERP Duty today, who covers an absence and who
actually acted. Workspace does not own module records or their completion facts.

Carres has one cross-module Work coordination surface. Module Registers, queues and action views
may show the same obligation, but never become separate Work Engines. One obligation retains one
identity, owner rule, due rule, completion fact and deep link everywhere.

**Customer enquiries — shared contract, 2026-10-06.** Read
[`Customer Service MASTER`](../customer-service/MASTER.md) §§4, 13–16 before building its projection.
The approved target reuses the same Tasks/working panel and Staff & Duties, including enquiries
without an SO. Customer Service owns its first-response rule and handling evidence; Case response
and results remain Service-owned. Conversation discovery inside Workspace is a supported
recommendation awaiting owner/shared-UI consolidation, not approval of another page or task engine.
No enquiry projection, connected message history or rollout is claimed by this pointer.

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
| Next, when one exists | Governed consequence, not a Workspace promise; absence does not block admission |

Workspace reads projections and opens the owning write door. It never copies the business record,
assigns routine work independently, changes its due date or closes it.

## 3 · Assignment and actual work

**OWNER RULING 2026-09-29 — APPROVED TARGET / NOT BUILT.** Assignment provides accountability,
not an execution restriction. The Duty / Work Engine decides who is assigned; any authorised
staff member may help; the source records the actual person; one business fact completes the job.

```text
Duty / Work Engine → Assigned to
→ any authorised staff member records the business result
→ Updated by / Completed by + date and time + source surface
→ one source-owned fact completes the Work occurrence everywhere
```

Staff UI exposes two distinct facts: `Assigned to` means who is responsible now; `Completed by`
means who actually completed the work. Before completion, show the action, its current assignment
and the authorised source action. After completion, show `Completed`, the assignment effective at
completion, `Completed by` and the completion date/time. Never infer the completer from assignment.
A later assignment change cannot rewrite completed evidence. `Updated by` identifies each update.

Do not expose `Normal owner`, `Acting owner`, `Buddy cover`, `Covering {name}`, `Temporary owner`,
or equivalent competing-person labels in staff pages, menus, tooltips, accessibility names,
filters or rendered history. Internal source identities and existing cover records are retained as
technical evidence; they are rendered as dated assignment movements, never erased or relabelled
as if a new person had performed somebody else's work.

**STAFF HELP.** Every active authorised Operation person, including newcomers, may perform ordinary
operational work without first changing its assignment: place/issue PO, post GRN, update authorised
Delivery facts, upload evidence, record customer/logistics replies and resolve urgent work. A job
assigned to Jess can be completed by Ali or Yu Jun. Helping does not itself change `Assigned to`.
No claim/reassign-first step is introduced. A joining-month PO allocation restriction remains a
routing rule and does not prevent that newcomer from performing authorised PO work.
Jess, as an active authorised Principal person, may also help with ordinary operational work
without a reassignment or an employment-tenure check. For example, work assigned to Shasha and
completed by Jess retains `Assigned to Shasha` and records `Completed by Jess`. Missing joining
dates never block helping or completion; employment-tenure checks belong only to newcomer
automatic PO allocation. This does not change the separately governed approval gates.

The original Work assignment when an occurrence opens, each subsequent assignment movement,
assignment effective for each update/completion, actual updater/completer, authoritative date/time
and originating surface must be retained. Completion originating in `Workspace` or `Delivery Monitor`
is distinguishable. Background processing preserves the human who recorded the completing source
fact; it must not replace that person with the system account. A historic unknown actor/origin is
not guessed. Opening a page does not reset the original assignment snapshot.

Workspace and Delivery Monitor use the same owning-module writer and completion fact. A failed save
cannot complete Work; duplicate/concurrent saves cannot create a second completion. Recording a
reply completes only the action whose governed completion condition that reply satisfies. Due dates,
other unfinished actions and historical records do not change just because someone helped.

**PERSON AND PERMISSION BOUNDARY.** Assignment, manual management and execution use active personal
identities (`app_users.is_person`), not a shared/generic login or email exception. Existing manual
no-self-assignment gates remain; system allocation is a separately governed act. This ruling never
auto-grants approval, self-approval, Finance/Principal powers, or separately governed amendment/void
rights. Ordinary authorised operations are not restricted to the displayed person; source-owned
capabilities, required evidence and business gates still apply. Approval decisions retain their
specific permissions, while their staff UI uses the same plain assignment/actual-actor vocabulary.

**IMPLEMENTATION STATUS — 2026-09-29, current-assignment display PRODUCTION VERIFIED, PR #1800.**
Deployment [36566892580](https://github.com/wenwei4046/Carres-Portal-v2/actions/runs/36566892580)
succeeded for `4ec8022fd081a711527d2f7cf90a8b1a44fd95e5`; its proof step confirms all five
production surfaces converged to that SHA (independently checked by this lane). The implementing
Workspace task reports an authenticated Jess walk showing `Assigned to Shasha` and opening the
existing Delivery date form without reassignment or saving a business record.
Workspace action cards and owner/source disclosure, Payment Monitor, Collection owner details and
PO send evidence use the plain assignment vocabulary. Missing current assignment never falls back
to the original person. Source forms and actual send/history actors are preserved. This UI change
does not deliver §4's Staff & Duties redesign, automatic reassignment, original-occurrence assignment
snapshots, update/completion assignment snapshots or source-surface audit. Those remain pending;
no completion actor is inferred from the current assignee.

The operational reassignment policy and its two Settings times are owned by §4.4. Assignment
changes are explicit recorded movements, not a hidden alternative person behind an unchanged UI.

## 4 · Staff & Duties

**FINAL BLUEPRINT — OWNER-APPROVED / LOCKED 2026-09-29 · PARTIALLY DELIVERED.**
The owner approved the assembled end-to-end Blueprint: Settings destination, plain current-person
catalogue/detail, `Manage staff`, `Next`, collapsed `History`, monthly rotation, newcomer allocation
versus execution, automatic recorded-leave cover, bounded manual exceptions and People-owned
single-confirmation departure with restricted former-profile lookup. §§3–4 and HR MASTER §3 hold
this one current truth. The UI alternatives and earlier cross-chat proposals are not parallel law.
PLAN design review is complete and BUILD/DELIVERY was authorised by Jess. Settings relocation,
current-person presentation and the two-period engine are delivered in #1791/#1798; §4.4 records
production evidence and the remaining approved target. Approval alone never claims delivery.

**ENTRY PLACEMENT — PRODUCTION VERIFIED 2026-09-29, PR #1791 (owner-approved 2026-09-28).**
Jess approved this segment: move the one Staff & Duties destination to global Settings, remove its
persistent main-menu row, and retain Work's direct door to the exact unresolved Duty. The page is
reached through the header gear → `All System Settings` → `Staff & Duties`; a contextual Duty
correction link opens that same destination without making the operator browse the Settings index.
Return restores the originating Work context. Existing authorised read-only access and manager-only
assignment controls remain intact. Module links lead to this same page; no second editor is created.
Workspace still owns assignment/cover and the Shared Duty Resolver. Settings owns only placement;
People/HR retains employee identity and eligibility, and modules retain actual work/completion.

**Measured implementation boundary:** CARD 02 is production verified (PR #1791; §4.6 proof).
Settings contains the existing page, the permanent main-menu row is removed, and legacy/contextual
links preserve the exact Duty and safe return context. Settings navigation opens on demand, with
one catalogue/detail pane on narrow screens. No token or business-permission change was made.
The rest of the final Blueprint remains approved target work, not delivered by this relocation.

Routine operational allocation follows the governed automatic rotation and eligible active People
pool. Jess does not enter each monthly assignment. Staff & Duties displays the results and governed
exceptions. The manual form is reached through `⋯` for applicable exceptions under §4.3, never a
required step for normal monthly rotation or recorded PO/GRN leave.

**JOINER / LEAVER TIMING — OWNER-APPROVED 2026-09-28 / APPROVED TARGET / NOT BUILT.**
**Current scoped clarification — owner 8–9 October 2026; implementation UNVERIFIED.**
The joining-month exclusion applies only to formal PO Duty allocation. A new employee becomes
eligible on the first day of the calendar month after joining, subject to active role/access
eligibility; 20 October joining means 1 November eligibility. Do not impose that waiting period
on GRN Duty, other ordinary work or qualified help/cover. Keep the existing stable rotation order;
PO eligibility is not an automatic takeover of existing orders or a promise of the next PO slot.
Creating an account alone does not establish People-owned employment or role eligibility.
Departure removes a person immediately when departure becomes effective; do not wait for the next
month. Re-resolve the affected current/future routine allocation through the one shared Duty model,
preserving historical actual-actor evidence. This timing ruling does not auto-grant approval rights,
change source-owned task completion; §4.4 governs cover.

**NEWCOMER PO TIMING — OWNER-APPROVED 2026-09-28 / APPROVED TARGET / NOT BUILT.**
A new employee does not take PO Duty during their calendar month of joining. From the first day of
the following month they automatically join the PO rotation, provided they remain active and meet
the existing role/access eligibility. No separate manager competency confirmation, training sign-off
or fixed probation period is required for that transition. Joining in a month means that calendar
month, not a rolling 30-day wait; the company calendar/timezone governs the boundary. Automatic
admission makes the person available for the governed rotation; it does not mean every newcomer
must be the PO holder on that first day. Existing approval capability and receiving-posting rules
remain separate.

**MONTHLY ROTATION ORDER — OWNER-APPROVED 2026-09-29 / BUILT ON BRANCH 2026-10-09 (0671, `build/settings-completion`; not applied, not deployed — see §4.4 "Leave, rota and Saturday on-call build").**
Maintain a stable cyclic order of eligible routine Operation staff. Each month one person owns PO
Duty and the next person in that order owns GRN Duty; advance the PO position by one each month.
For three eligible people A/B/C, the cycle is PO A / GRN B → PO B / GRN C → PO C / GRN A.
**Owner reaffirmation 9 October 2026 — APPROVED; implementation UNVERIFIED:** PO and GRN
rotate once per calendar month, normally with different coordinating holders. The existing
Variable team size clarification permits one qualified available person to coordinate both when
only one remains; this is not the normal multi-person rota. No eligible person stays a visible
exception, never an invented assignee. Helpers retain their own actual-actor evidence.
These letters illustrate the rule, not stored people or a live assignment. An eligible newcomer joins the
end of the existing rotation order under the duty-specific admission rule (the next-month wait is PO-only); preserve the existing
people's relative order rather than restarting the schedule. Entry into the pool is not a promise
of the next PO slot. Remove a departed person when departure is effective and continue the remaining
order, re-resolving affected current/future allocation without rewriting historical actual actors.

This determines responsibility and Work routing, not exclusive receiving-posting rights: other
active Operation staff may still post Receiving under Purchasing's approved posting law. It does
not rotate commercial approvers or change source-owned task completion. Existing one-person/
no-eligible-person boundaries remain separate from the illustrated multi-person cycle. Temporary
absence follows §4.4; do not treat absence as departure.

**DEPARTURE — OWNER-APPROVED 2026-09-29 / APPROVED TARGET / NOT BUILT.** HR MASTER §3 owns
one departure workflow: an authorised personnel manager chooses the employee, enters the last
working day, reviews the effects and confirms once. Departure recording and access disablement
are coordinated; when effective, the account automatically leaves Settings/default staff lists,
current choices and Duty routing without a second removal step. Workspace consumes those facts
and re-resolves affected open/future routine allocation. Do not hide a future leaver before the
recorded departure takes effect or claim a scheduled effect already completed.

Ordinary staff cannot browse former employee accounts/profiles. Only existing personnel-management
permission permits deliberate historical profile lookup; managers also default to current staff.
People/account read gates enforce this beyond the visible list. Historical PO, GRN and other
source evidence retains actual names for authorised document readers, without exposing private
employee/account details through those names. This is not deletion, a second employment switch,
or permission for ordinary staff to disable accounts. The approved `Manage staff` entry opens the existing People management surface and preserves
return context; it creates no second staff editor.

`Settings → Staff & Duties` is the only Duty assignment/cover surface and shows immutable history.
Automatic operational allocation does not grant approval capability or randomly rotate Principal/
Finance approval duties. Existing approval qualifications, object PIC ownership and dated-cover
rules remain in force. How automation represents its authoritative assignments, handles a changed
eligible pool and exposes genuine exceptions remains a measured target gap, not a claim of delivery.

Modules store only `rule → required Duty`. They never store another staff list, local approver,
hard-coded Jess/Manager identity or page-level cover calculation. People/HR supplies active,
employment and leave facts; Workspace owns Duty assignments; the Shared Duty Resolver combines
them.

People/HR also owns each employee's normal working-week eligibility. Module calendars own
business-open days and public-holiday/special-date rules. The Shared Duty Resolver combines the
person calendar with the module calendar for the resolved actor; Staff & Duties displays that result
but does not become a second People calendar editor. **Built on branch `build/settings-completion` (9 Oct 2026; 0678 not
applied):** the person's week is `hr_employees.work_days` (NULL = not recorded), written only by HR /
principal through `hr_upsert_employee` and shown as `Working days` in the HR person drawer; internal
readers get only user id + days through `workspace_person_work_days`. The first consumer is the
payment collection ACTION day (Work, Payment Monitor, collection workspace): the resolved actor's
recorded days, else the Office weekdays, with the Office holidays (Payment MASTER "Two calendars, one
clock" names the sources). It never moves a payment fact. Staff & Duties neither shows nor edits it
yet.

Distinct Duties include Storage Waiver Approver, Payment Approver, Purchasing Approver, Delivery
Charge Approver, Stock Adjustment Approver, Service Case Approver and Delivery Duty
(customer-order fallback and no-Sales-Order display transport coordination). There is no fake `ERP Owner`.

**Routine Delivery work belongs to the Sales Order's PIC** (owner ruling 2026-09-17). When an
order enters Operations, `ops_order_control.assigned_staff` names the one normal owner for its
order, customer, delivery and ordinary collection work. The Work Engine routes today's action to
the current work assignment, initially that PIC and subsequently any recorded §4.4 assignment movement. The Sales Order PIC remains a separate source fact. Delivery
Duty is not the routine customer-order owner. For customer-order work it is the explicit fallback
when a Sales Order has no PIC; that exception stays visible under `Delivery Duty` and prints `Nobody assigned to this order`
over `Manager assigns in Settings → Staff & Duties` (owner ruling 2026-09-26: an unassigned order is a system error and
only a manager can add a person or assign the order; `Manage staff` opens People). Delivery Settings never holds a roster or a
second owner list (`../delivery/MASTER.md` §13.1).

**SHOWROOM ASSIGNMENTS — APPROVED TARGET / NOT BUILT; Jess, 2026-09-28.** For display
transport without a Sales Order, Delivery Duty owns transport coordination under Delivery MASTER
§13.1; existing Shared Duty Resolver, active-person and dated-cover rules apply. Supplier work
stays PO Duty, and physical actions keep their own permissions/completion. No fake Sales Order,
local roster or request-recorder assignment is introduced. Missing eligible holder remains visible.
This does not change PIC-first customer work or prove that the new action is admitted/built.

For unresolved Showroom commercial work whose original Sales negotiator permanently departs,
authorised management designates an active Sales successor with assigner, reason and effective
date. Preserve original negotiator and previous actors; temporary absence uses governed cover.
Workspace owns the assignment contract; Purchasing reads it and retains commercial evidence.
Do not silently route it to Operation or grant Catalog/price/approval powers. The exact governing
person-assignment action remains to be admitted before build; no local Showroom staff list.

**Reason for the ruling:** the PIC sweep shares open orders between the two active operators,
Shasha and Yu Jun, at roughly 50/50. A single Delivery Duty instead left 101 routine Delivery
actions unowned in production and broke the one-person customer/order follow-through.

**`Purchasing Approver` (`purchasing_approver`) takes an active Principal person only** (owner
rulings 2026-09-18, 0533). Its pickers list Principal people; the doors refuse every Operation
account — Shasha and Yu Jun included — as holder (`invalid_holder`) or cover (`invalid_cover`).
Deciding a Manual Purchase admits only today's resolved actor — the holder, or their dated Principal
cover — and never the principal role alone, the `ops_manager` position or an email list. Unheld
answers `Nobody holds Purchasing Approver.` · `Set the holder in Settings → Staff & Duties.` Nobody
decides a Manual Purchase they raised (`own_request`), and the principal role no longer raises one.
**Bootstrap:** no door can name the first holder (self-assignment is refused and the shared login
may not assign), so 0533 assigned Jess once from 2026-09-18 with `assigned_by` NULL, note `Bootstrap
— owner ruling 2026-09-18 (no second Principal person)` and an audit row naming the migration. It
runs only when the Duty has no assignment history; it created no cover. Until a second Principal
person exists, Jess has no eligible cover: her approvals wait while she is away.

**Sales Approver — OWNER-APPROVED 2026-10-01 / TARGET NOT BUILT.** Orders MASTER
§ “Staff amendments and Sales Approver” replaces the earlier all-amendments approval ruling and
withdrawn matrix. Ordinary SO amendments need no owner approval. Sales Approver is required before
price decreases, customer refunds and whole-SO cancellation after Proceed take effect. Holder and
any cover must be active Principal people, assigned only through Settings → Staff & Duties and
resolved through the shared mechanism; no hard-coded person, local roster or expanded role rights.
A required approval cannot pass when its eligible assignment is unresolved. The catalogue and
live assignments are unchanged by this PLAN. This Duty is NOT BUILT.

For an ordinary amendment whose changed line is covered by an issued PO, PO Duty records the
supplier's confirmation that the change can be made before it takes effect. No supplier answer or
an unknown supplier date means waiting, not automatic effectiveness. This does not make PO Duty
a general commercial approver. Purchasing still owns the PO change. No issued PO covering that
line means ordinary application on submission with the required customer evidence. The accepted
trade-off is no second-person check on ordinary product changes; retain the actual submitter and
confirmation actors. Linked changes remain one effective outcome.

**SO submission — owner-approved A, 2026-10-01; PIC notification TARGET NOT BUILT.** Any
Operation staff member with existing order access may submit; it is not PIC-only. Principal
submission remains permitted, while Salespeople/Dealers continue to request changes through
Operation. Automatically notify the order PIC via the shared notification/activity mechanism,
retaining the actual submitter and Before/After evidence. Notification does not transfer PIC
ownership, misattribute the act, grant approval rights or add a PIC approval gate. A waiting
amendment must not be presented as already effective. See Orders MASTER for the full ruling.
Do not infer notification delivery from the existing submission door; it remains unverified.

Requested Delivery Date routing is settled in Orders/Delivery MASTER: evidenced customer
earlier-date amendments require ready stock, otherwise refuse; evidenced later-date amendments
apply; neither date change needs PO Duty or supplier confirmation. Carres-initiated early
arrangements leave the SO date unchanged. This adds no new staff or approval assignment.
System-priced delivery-charge changes have no manual approval lane: staff cannot override the
computed price (Orders MASTER, owner-confirmed 2026-10-01 / TARGET NOT BUILT). Do not assign a
new SO charge-waiver task to Delivery Charge Approver; that Duty remains for its other governed
uses. Customer refunds still route to Sales Approver. Non-delivery service exceptions, 0329
attribution changes/consolidation remain undecided. **Sales Approver self-approval — owner-approved
2026-10-01 / TARGET NOT BUILT:** the currently resolved eligible Principal holder or dated cover
may decide their own SO exception request, retaining reason, customer evidence, actual submitter,
approver and times. This does not allow another Principal to bypass duty resolution or change
Finance/refund execution controls or other Duties' own-request rules. Do not copy Purchasing
Approver's own-request prohibition or bootstrap into this Duty as an assumed decision.
The existing PIC-first ordinary Delivery ownership remains unchanged.

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

1. Who is assigned now?
2. Who is assigned next, if a future assignment exists?
3. What recorded assignment changes explain it?

It is not People, leave management, a roster/calendar, workload balancing, permission administration
or a manager dashboard. People owns active employment/access/leave facts. Modules name the Duty they
require. Staff & Duties owns effective Duty assignments and the automatic reassignment settings; the Shared Duty Resolver
combines those truths. A manager never assigns individual routine Work here.

### 4.2 · Page composition

**FINAL COMPOSITION — OWNER-APPROVED 2026-09-29 / DELIVERED 2026-09-30 (#1798).**
Keep one Duty catalogue and one selected-Duty detail. Use the final plain headings `Next` and
`History`. An authorised personnel manager reaches the existing People surface through the header
`Manage staff` action; staff who lack that permission do not receive that management entry.
The detail reads in this order: `Assigned to` and plain dates → next effective assignment → collapsed
`History`. Future appointments are not presented as if their terms already ran.
All authorised assignment/cover records remain reachable; collapsing history never deletes evidence.

```text
Staff & Duties                         [Manage staff]

Search duties       │ PO Duty                          ⋯
State: All duties   │ Assigned to Yu Jun
                    │ Mon, 7 Sep to Wed, 30 Sep
PO Duty             │
GRN Duty            │
Purchasing Approver │
…                   │ Next
                    │ Shasha · Thu, 1 Oct to Sat, 31 Oct
                    │
                    │ ▸ History
```

Names/dates above illustrate the reading order, never hard-coded facts. The next assignment is the
next effective primary assignment from the authoritative Duty source; it does not replace today's
normal owner early. It names the person and effective dates and is omitted when no future primary
assignment exists. Do not infer the next effective owner merely from the first history row. Full
future arrangements remain reachable in the expanded records, with their future effective periods
explicit. History distinguishes the recorded event time from the assignment/cover effective dates
and retains the shared event → who/when → detail grammar. Opening history changes no business fact.

**CATALOGUE — OWNER-APPROVED 2026-09-28 / PRODUCTION VERIFIED 2026-09-30 (#1798).** The left catalogue
follows the shared Duty catalogue order and answers who is responsible today. Each row shows the
Duty label and today's resolved person (effective cover when present, otherwise normal holder),
or `Not assigned`. Future appointments never replace today's answer early. `Starts {date}`
and `Ends {date}` do not appear in catalogue rows; effective periods and future arrangements belong
in the selected detail's assignment/cover facts and `Next`.

The catalogue never shows workload, performance, a recommended person or a copied module roster.
Search matches Duty label and authorised current/historical person names; retain `All duties` and
`Not assigned`. Remove cover-specific filter words; dated assignment changes remain in `Next` and
`History`. A scheduled change does not alter today's assignment early. Selecting the whole row opens detail, changes no assignment
and completes no Work. Long names wrap; rows support keyboard selection. Returning from narrow-screen
detail restores the catalogue's search/filter and position. Existing read-only users can navigate
and inspect the same authorised facts.

**ASSIGNMENT DISPLAY — OWNER RULING 2026-09-29 / APPROVED TARGET / NOT BUILT.**
Show `Assigned to {name}` with applicable plain dates, or `Not assigned`. All staff-facing Duty,
Work, Delivery and collection surfaces use §3's two-fact vocabulary. An avatar retains the full name
and never replaces the readable assignment. A completed action additionally shows `Completed by`
and `Completed` date/time; a Duty definition itself is not a completed job.

`History` shows assignment movements and actual work events, including `Assigned by system` and
`Updated by {name}`. Preserve original source identities, prior assignments and the actual performer.
Scheduled assignments stay in `Next`/history until effective. Work configuration links retain their
exact Duty and return context. Ordinary readers retain authorised source actions; only assignment
management controls remain manager-gated. No competing owner/acting/cover explanation is shown.

At 1440px and 1180px retain catalogue/detail. At 820px, 743px and 390px show the catalogue, then a
full-width selected detail with `Back to duties`. Settings navigation is available on demand and
must not force a third simultaneous narrow-screen column. §4.5 owns the retained loading, no-match,
read-failure, unassigned and read-only states; no task-level Waiting/Completed/Missed state is added.
Reuse the governed kit and token values. The five widths were verified with real components and on production in #1798; screenshots and
read/write verification boundaries are recorded in §4.4.

**MANUAL ACTION ENTRY — OWNER-APPROVED 2026-09-29 / DELIVERED 2026-09-30 (#1798).**
Place existing authorised manual adjustments in the selected Duty header's visible `⋯` menu,
accessible name `More actions`. Do not keep manual assignment actions as permanent buttons
beside the current person. Only authorised managers see this menu, and only applicable governed
actions appear; omit an empty menu. Selecting an action opens its existing focused form with the
Duty fixed. This is an entry-placement ruling, not approval for new override policies or new acts.
Even an unassigned Duty uses this menu for an authorised manual assignment; the missing-person
fact remains visible. Ordinary automatic allocation and §4.4 reassignment need no manual menu action.

Use the existing shared menu kit at all approved widths, with keyboard/touch operation, focus
return to the trigger and no right-click-only dependency. Readers retain the same person/date view
and their existing ordinary work execution rights. Keep source-owned permission checks, evidence
and failures; no new token or component is introduced.

### 4.3 · Change-holder contract

**FORM PRESENTATION — OWNER-APPROVED 2026-09-28 / DELIVERED 2026-09-30 (#1798); full cross-month exception semantics remain below.**
`Assign` opens one focused action surface. Show read-only `Duty`, the current person's name and applicable
plain dates above the inputs, followed by required `Assigned to` and
`From`, `Until` and a factual `Reason`. For a PO/GRN temporary adjustment, both dates
and `Reason` are required under the ruling below. Other Duties retain their governed
optional end/note rules. Do not preselect a person or start date. The selected person and effective dates remain visible before the single primary
`Assign` confirmation; `Cancel` closes without a write.

Eligible choices come from People's active authorised Carres staff only; a departed, disabled,
external Warehouse or ineligible account is not offered and is refused again at the write door.
Existing person-only, manager and no-self-assignment gates remain. Personnel loading/failure must
be distinguishable from a successfully loaded list with no eligible choice; never imply that a
failed read proves nobody is eligible. Missing fields use §4.4.1's exact repair sentences. Preserve
input on refusal/failure, prevent duplicate confirmation while saving, and only announce completion
after the authoritative assignment write succeeds. A successful future assignment appears under
`Next` without changing today's owner early. No Work is marked complete by this act.

Use the shared focused dialog at 1440/1180px and a single-column form at 820/743/390px. Names wrap,
content scrolls vertically, and controls remain reachable above the on-screen keyboard. Closing
returns focus to the originating action. Readers see the plain read view under §4.2
and no write imitation. This surface introduces no Waiting/Urgent/Missed task state.

**TEMPORARY PO/GRN ADJUSTMENT — OWNER-APPROVED 2026-09-29 / APPROVED TARGET / NOT BUILT.**
The manager's manual PO/GRN adjustment is a dated exception, not a permanent rewrite of automatic
rotation. Require a person, start date, end date and recorded reason. Before confirmation, display
the affected existing arrangements and the proposed dates/person. Apply the exception only during
that period; afterwards resolve the system's normal arrangement applicable on that date, including
any recorded leave cover. Never blindly restore the person who held the Duty before the adjustment.
Keep the underlying monthly order and later rotation intact, and retain historical actual actors.
A month-spanning exception does not move the rotation's monthly position or extend the former
month's normal assignment. A future exception does not change today's name early.

Existing automatic allocation in the requested dates is expected and must not itself be treated as
a duplicate-primary refusal. Competing manual exceptions must not silently overwrite one another;
retain the current governed conflict refusal until an explicit superseding act is approved. Existing
person/role/active status and no-self-assignment gates remain. This does not grant execution rights
or make ordinary work depend on holding the temporary assignment. Approval-Duty long-term holder
settings retain their own law; this bounded exception rule applies to routine PO/GRN only.
No application Build or new permanent rotation-editing control is authorised by this ruling.

The act appends a new assignment; it never edits or deletes an old row. Overlap resolution is
server-owned and must not leave two primaries effective on one day. A future assignment does not
change today's resolution early. A retroactive correction requires the separately authorised
correction law and preserves what it superseded; the ordinary form cannot rewrite history.

Success says `{Duty} assigned to {name} from {date}` and refreshes Work resolution from the shared source.
It does not claim that historical Work changed. Failure prints the governed server reason and keeps
the entered facts for correction without optimistic owner changes.

### 4.4 · Automatic assignment changes and two daily checks

**Release evidence 2026-09-30 — PR #1798 / DEPLOYED.**
The released #1798 collector uses trusted foreground interactions and removes the OperationApp
mount/timer heartbeat as assignment evidence. Follow-up #1816 moves that same collector into App,
scoped to the authenticated Operation/Principal identity rather than the current module, so Finance
or People navigation does not lose a Principal's evidence or reset minute deduplication. The
portal-wide follow-up is implemented in #1816. It also replaces
the misleading no-candidate write-error sentence with `No one else could be assigned at this check.
Any authorised staff may help.` A successful check with no candidate is not a failed read/write.
Migration 0625 is APPLIED and its tracker/function hashes match the committed file: both Duty/order projections report the latest recorded
check or movement outcome, so a later successful movement clears an older no-candidate message.
The stale-status negative control and both resolver timelines passed exact-file rollback probes. Shared validated settings feed independent Office
morning and afternoon windows; lunch, background tabs and post-cutoff interactions cannot satisfy
an earlier check. A failed settings/evidence read aborts the check rather than proving absence.
The weekday scheduler obtains a fresh source snapshot per period, validates source completion,
eligibility, settings revision and current assignment under database locks, and appends one
idempotent checkpoint receipt. An append-only movement ledger also handles explicitly recorded
unavailability between checkpoints. Stable Sales Order PIC and completed source facts are untouched.
Late activity does not undo a movement; the following day starts from its dated source allocation.

Migrations 0613, 0615–0621 and 0624 are **APPLIED**, with all nine tracker file hashes and all
19 final function hashes reconciled to the committed files. Exact-file rollback probes passed
settings validation/audit, manager and browser refusals, lunch/overnight exclusion, receipt retries,
stale source/settings refusal, independent morning/afternoon movement, no late bounce-back, newer
manual assignment precedence, recorded unavailability, restricted history and unchanged GRN
amendment authority. Additional probes passed collection-context departure/null-actor preservation,
and morning movement → intervening movement → afternoon current-actor acceptance with stale-actor
refusal. Follow-up reads confirmed no probe fixtures or tracker rows persisted.
The current live GRN posting gate was already opened to active personal Operation/Principal by
0601; 0619 preserves the separate original-holder/manual-assignment/Superuser amendment gate when
automatic responsibility moves. Automatic assignment never grants amendment or approval rights.

Settings has the two persisted manager-editable times, revision conflict handling and read failure
states. Duty catalogue/detail use one current person, future assignments, collapsed history and
the existing kit menu/form. System movements have paginated authenticated history; no private
People profile is exposed through a historic name. Work and Staff & Duties refresh their shared
current-person projections. Authenticated production reads verified saved times, current/next
people, collapsed/expanded history, read-only manager gates and zero horizontal overflow at all
five approved widths. Personal-manager writes were verified by rollback SQL and the real-component
manager fixture, not by changing live settings through the shared Principal test account.

**Measured data boundary:** Shasha and Yu Jun have no People joining date or employment event.
No date is invented and execution is unrestricted by tenure. Existing recorded PO assignment
membership preserves incumbent eligibility when the joining date is absent; a new person with no
People date and no such membership is excluded from automatic PO allocation only. Known joiners
enter automatic PO eligibility from the next calendar month. This is not the pending general
monthly roster/admission engine; current baseline assignment remains the dated source.

**Remaining target work:** the monthly rotation's release (built on branch, §4.4 below), the People-owned departure/access workflow
and restricted former-profile lookup, complete bounded manual-exception convergence across a
changing monthly baseline, full legacy-history pagination, and original/update/completion Work
assignment snapshots with originating-surface audit. The two-period movement ledger must not be
reported as those capabilities.

Release: merge `0f80cff62a73d17ade68fce0c07b87a73732cf59`, deployment run
[36677653387](https://github.com/wenwei4046/Carres-Portal-v2/actions/runs/36677653387).
Both Pages projects, both canonical web domains and the API Worker reported this SHA. The deployed
SHA passed shared 3,974, API 3,865 and web 5,815 tests (259 existing skips), lint, typecheck, build
and the browser-secret scan. Production screenshots and bundle comparison are in
`docs/evidence/staff-duties-2026-09-30/`. Scheduled execution is verified: read-only diagnostic run
[36680255269](https://github.com/wenwei4046/Carres-Portal-v2/actions/runs/36680255269) observed
`* 1-10 * * 1-5` with outcome `ok` and no exceptions. The first live morning pass recorded 104
checkpoints at 14:50–14:51 MYT (103 `no_candidate`, one `not_assigned`, zero movements). This was
the first post-release catch-up, not a claim that the new engine ran at 10:30 before it was deployed.
No earlier-period activity was fabricated and no unavailable recipient was selected. The live
afternoon pass independently began at 15:00:42 MYT and recorded another 104 receipts with the same
no-candidate/unassigned split; the two periods remain separate.

**CURRENT OWNER RULES — 8–9 October 2026; APPROVED TARGET, implementation UNVERIFIED.**
Sources: `Carres Settings List.md` OFF-01–05, WS-01–12 and its dated owner clarifications;
`Carres-Business-Blueprint-RESTART-2026-10-07/OWNER-CLARIFICATIONS.md`, “Current attendance and
lunch configuration”, “Variable team size”, “Office, Warehouse separation and Saturday duty”,
and the 9 October leave/rota rulings. These are scoped owner decisions, not blanket approval of
all inventory rows. The older “Office unconfirmed” note dated 8 October is superseded by the
Settings List's explicit 9 October Office confirmation. Neither file's observed runtime values
prove implementation of these targets.

**Office, publication and checks.** Ordinary Office work is Monday–Friday, 9:00 AM–6:00 PM;
Office holiday configuration remains separate from Warehouse site calendars. Publish daily work
at 9:00 AM without changing source deadlines. Preserve the permitted one-hour flexible start:
a 10:00 AM start finishes at 7:00 PM with eight working hours excluding lunch. Missing activity
at 10:00 is not proof of lateness or absence. The two authorised-editable availability-check
defaults are **10:00 AM / 2:01 PM**, one shared configuration, not additional 10:30/15:00 checks.
Record editor, old/new values, effective treatment and time. No browser timer or per-user
preference is the business authority.

**Lunch.** Office owns the one-hour lunch policy: default 1:00–2:00 PM, shiftable by up to one
hour. Workspace reads the actual person's lunch occurrence; it does not keep another policy
editor. Retain assigned tasks during lunch and skip the person's activity check during actual
lunch; the applicable check follows the shifted lunch's end. Do not infer absence from lunch,
use lunch activity as proof of working availability or invent a minute offset for a delayed check.

**Activity evidence and uncertain attendance.** Each check uses its own work period; morning
activity does not establish afternoon availability. Background tabs and an overnight session do
not prove a new period's activity. Missing activity without recorded leave/lunch prompts one
availability confirmation about the person, not once per task. Confirmed working/offsite staff
retain tasks; confirmed not working triggers direct qualified available cover. The detailed
“Not sure” morning-wait/final-check-transfer-to-respondent branch remains **DESIGNER-REPORTED /
UNVERIFIED**, not an approved automatic rule. No missing activity or failed source read creates
MC, misconduct, payroll or employment facts. An MC submission login does not establish working
availability. The exact activity/confirmation implementation remains to verify.

**One leave entry — Workspace → Leave.** MC, Emergency and Planned leave use the same submission
entry and People-owned dated absence facts; `On leave` is a status, not a fourth application type.
MC requires dates; proof is optional and never required (owner rule confirmed 9 Oct 2026). Emergency requires dates and a short reason. No standalone MC Report
page or duplicate HR record. All three types **currently require no approval**. Staff & Duties
leave policy defaults to `Approval required = No`; Jess or a section-authorised editor may change
it later, with effective date and treatment of existing submissions explicitly defined. No
retroactive refusal is assumed and required evidence is not waived.

**Leave recorded for a colleague — owner ruling 9 Oct 2026 (Jess, corrected the same day).** Every signed-in active staff member may record leave for a colleague (for example, one who is ill and cannot log in); this is not limited to the owner or Settings editors, and recording leave is a separate permission from changing Settings. Workspace → Leave → Record leave: the person defaults to me and may be changed to a colleague; choose MC, Emergency leave or Planned leave and the dates; Submit takes effect at once with no approval; MC proof is optional. The system keeps whose leave it is, who recorded it, when, and the change history (recorded, cancelled). Today's leave starts the existing cover; future leave starts on its day. Whole days only; half-day leave is not decided. Built on branch `build/settings-completion` (0680, not applied): `staff_leave.recorded_by`, `staff_leave_changes`, doors `staff_leave_submit` / `staff_leave_record_for` / `staff_leave_cancel` (the person or whoever recorded it).

A submission covering today activates qualified available cover immediately, without waiting for
approval or an activity checkpoint. Future leave activates cover on the absence date, not the
submission date. Receiving colleagues must be eligible and working; exclude recorded leave and
effective departures. Operational cover is separate from evidence review and payroll treatment.
Keep normal responsibility, effective assignment and actual helper as distinct recorded facts,
using the existing single `Assigned to` presentation. Return does not silently bounce work back.

**Saturday on-call coverage is separate — owner clarification 9 October 2026.** Staff & Duties governs rotating Saturday customer/driver/
Warehouse/Delivery contact support, default **9:00 AM–6:00 PM**, authorised-editable, with qualified
cover. Record issues and their next accountable work. This does not make Saturday an ordinary
Office workday, override source calendars, transfer all Delivery work, or grant money/approval
rights. Saturday rota cadence and its exact calendar integration remain **UNVERIFIED**; do not
infer monthly cadence from PO/GRN. Warehouse receiving/collection hours stay Warehouse-owned.

**Assignment consequences.** Use the existing shared resolver and duty-specific eligibility;
never create a module staff list. Preserve the original owner/source PIC, source deadlines,
completion facts, historical actual performers and monthly rota. Assistance does not reassign
responsibility. Subsequent cover changes are recorded; no silent task ping-pong. Missing eligible
cover or unreadable evidence stays a visible exception, never fabricated assignment. Approver
qualifications do not inherit ordinary-work help rights.

**Leave, rota and Saturday on-call build — BUILT ON BRANCH 2026-10-09 (`build/settings-completion`,
migrations 0670/0671 NOT APPLIED, NOT DEPLOYED; owner walk owed).** Measured implementation, not a
production claim:
- *Leave (0670).* `staff_leave` (People-owned dated absence; one row per submission; cancel stamps
  `cancelled_from/by/at`, never deletes) and `workspace_leave_policies` (one row per type,
  `approval_required` stored false and held false by a CHECK until an approval change with its
  effective treatment is built). Doors `staff_leave_submit` / `staff_leave_cancel`; private bucket
  `staff-leave-proof` (own folder; principal and HR read). Workspace → Leave is a plain Workspace
  menu row (`?tab=leave`). Colleagues see who is away and when through `workspace_leave_upcoming`,
  never type, reason or proof.
- *Cover reads leave through one question,* `_workspace_on_leave` (dated leave or the undated
  away switch), in the scope's eligibility and candidates, the visibility rule, the Team list and
  the movement loop. Today's PO, GRN and Delivery Duty answer the next eligible person at read
  time, any hour (the approach of PR #1966, which this supersedes). A same-day submission on an
  Office weekday also writes the durable movement at once; the minute engine covers future leave
  on its day. Orders stay on the movement ledger only (their workload order could change between
  a read and the movement). Leave is an eligibility fact, not an assignment-source change, so it
  never bounces work back to someone who missed a check.
- *Monthly rota (0671).* `workspace_plan_duty_rota(month)` (scheduler or Staff & Duties editor):
  PO advances one place in staff-code order from last month's PO; GRN is the next person after
  the PO holder; the PO newcomer wait reuses the cover engine's rule; one eligible person holds
  both; nobody eligible writes nothing. A manager's row starting inside a month leaves that
  month alone; a month not yet begun follows a changed cycle (newcomer admitted, exit recorded); a
  running month never flips except when its holder is no longer active (re-planned from today).
  Rows carry `origin = monthly_rotation`, `assigned_by` NULL, note `Monthly rotation`; History
  reads `Assigned by system`. The daily 09:00 MYT run plans this month (only to continue a
  running rotation) and, from the 25th, next month. 0437's pre-written two-person alternation
  (Oct 2026 to Sep 2027) is labelled as the rotation, so a newcomer is not frozen out for a year.
- *Saturday on-call (0671).* One editable window (default 9:00 AM to 6:00 PM, change history) and
  a dated rota (Saturday → person, optional cover), appended, edited by Staff & Duties editors
  (`_settings_require_editor('staff_duties')`). A person on leave that Saturday is flagged, never
  replaced. No automatic rotation (cadence undecided); it touches no Duty, Task or Office day.
- *Staff & Duties.* `Manage staff` shows for principal or HR (the People API gate). Three closed
  sections beside the duty facts: `On leave`, `Saturday on-call`, `Leave approval`.
- *Check times.* 10:00 AM morning is storable (CHECK, door and shared validation); live values are
  untouched by the release.

**Historical implementation evidence, not current defaults.** The 30 September #1798 release
used 10:30 AM / 3:00 PM and fixed 1:00–2:00 PM lunch; the measured passes above remain history.
The Settings List / Owner Clarifications record **10:15 AM observed live on 8 October**, unchanged
by that audit. It is an observation, not a new owner default and does not replace **10:00 AM**.
No production change or new live verification is claimed by this 9 October document update.
**Cross-module reconciliation still owed:** HR MASTER's rotation-entry paragraph and §5 leave
row still describe a general next-month eligibility wait and 10:30/15:00 defaults in the inspected
checkout. The scoped owner corrections above govern Workspace; HR's owner must align those
references. The 8 October clarification's earlier Planned-leave-after-approval proposal is
superseded by its explicit 9 October no-approval ruling. Neither stale text reopens these decisions.

History retains the assignment when the job opened, each change (from/to, system or personal
assigner, reason, effective/recorded time), every updater and the actual completer/time/origin.
For example: `Assigned to Jess` → `Assigned to Ali by system` → `Completed by Yu Jun`.
Use `Assignment reason: {name} was not online by {time}` only when the check actually established
the configured period's missing activity. An unreadable source or service outage is not that fact.

Recorded leave can also trigger a dated assignment change. Existing manual exceptions retain their
person, eligibility, date, reason, conflict and no-self-assignment gates, but their UI presents an
assignment rather than a second cover identity. Existing underlying cover records/RPC names are
technical compatibility, not user-facing terminology. End/change events remain append-only and
retain why, by whom and when. Neither automatic nor manual reassignment completes Work.

#### 4.4.1 · Staff & Duties validation and refusal copy

**APPROVED TARGET / NOT BUILT — 2026-09-29.** Existing technical refusal codes keep their
permission/date/conflict semantics; staff presentation uses assignment vocabulary.

| Condition | Write-door code | Exact sentence |
|---|---|---|
| Holder missing | (form) | `Choose a person.` |
| Assignment start missing | `invalid_dates` on assign | `Choose when this assignment starts.` |
| Assignment end before start | (form) | `Until must be on or after From.` |
| Ineligible/inactive/non-person holder, or anyone naming themself as holder | `invalid_holder` · `self_assignment_refused` on assign | `{name} cannot be assigned to {Duty}. Choose an eligible active staff member.` |
| Anyone naming themself as cover | `self_assignment_refused` on cover | `{name} cannot be assigned to {Duty}. Choose an eligible active staff member.` |
| Conflicting manual exception / otherwise conflicting primary period; automatic PO/GRN baseline alone is not a conflict (§4.3) | (target refusal; current writer does not enforce it) | `{Duty} already has an assignment for these dates. Choose different dates.` |
| Cover person missing | (form) | `Choose a person.` |
| Cover is normal holder | `cover_is_holder` | `Choose another person for {Duty}.` |
| Cover dates missing/reversed | `invalid_dates` on cover | `Choose valid assignment dates.` |
| No one normal owner for every day of the cover | `no_duty_holder` | `{Duty} has no assignment for all these dates. Assign it first.` |
| Conflicting cover | `cover_overlap` | `{Duty} already has an assignment for these dates. Choose different dates.` |
| Eligibility changed before save | `invalid_cover` | `{name} cannot be assigned to {Duty}. Choose an eligible active staff member.` |
| Caller is not a duty manager, or is a shared login (0533) | `not_duty_manager` | `Duty assignments are set by the manager.` |
| Unknown failure | `unknown` (any other error, a network failure included) | `{Duty} could not be updated. Try again.` |

The API returns only the code; the page maps it to the sentence above and never renders the
database's or the network's own text.

Client validation may guide early, but the server returns the same business refusal and remains
authoritative. No message says `Invalid`, `Error` or `Something went wrong` without the repair.

### 4.4.9 · Settings editors, Company and Office — BUILT ON BRANCH 2026-10-09 (`build/settings-completion`; 0669 · 0674 not applied, not deployed)

Owner rules TEAM-02 · SET-01 · COM · OFF (Carres Settings List, 9 Oct 2026). **Who edits Settings:**
the owner (principal) edits every section; she names a person per section in Settings → Team and
access → `Settings editors` (`settings_section_editors`, 0668 — applied to production by another
session 9 Oct). Every Settings write asks the one gate `settings_can_edit(section)` in the API
(`requireSettingsEditor`) and in SQL (0674 rewrites the Purchasing, Payment, Delivery, Warehouse and
Staff & Duties gates and the Sales Order entry door; Warehouse keeps its own manage-settings
capability). A named editor gets configuration editing only — never a money approval, a Duty or
ordinary-work rights. Measured 9 Oct: the only active `ops_manager` holder is the owner, so moving
the gates removes nobody's live right. Pages show read-only to anyone not named. **Company**
(COM-01/02) and **Office** (OFF-01…05) are stored singletons with who · when · old → new · optional
reason (`settings_changes`, 0669); the Office calendar (Monday to Friday, Kuala Lumpur holidays
recorded one year at a time, built-in list per unrecorded year) is the ONE calendar Office deadlines
read (`readOfficeCalendar` / `useOfficeCalendar`). Saturday on-call never makes Saturday an Office
day. Remaining gaps are listed in Carres Settings List "Build state".

### 4.5 · Access, states and responsive behaviour

| State | Required presentation and behaviour |
|---|---|
| Non-manager | Full authorised read view without an owner/permission explanation block · no disabled or hidden write imitation |
| Loading | Catalogue/detail skeletons retain page geometry · `Opening Staff & Duties…` is acceptable accessible status |
| Empty catalogue | Configuration failure, because the governed catalogue is code-owned; never `No duties yet` |
| No search match | `No duties match this search` · `Clear search`; catalogue truth remains healthy |
| Not assigned | `Not assigned` · `Nobody holds {Duty}.` · manager reaches applicable `Assign` through `⋯`; Work remains visible under Duty word |
| Current assignment changed | Show `Assigned to {name}` and the applicable dates; history preserves the change, reason and prior person |
| Assignment scheduled | Show the current `Assigned to`; the future person and dates remain in `Next`/history until effective |
| Read failed | `Staff & Duties could not be opened` · `Try again`; never infer no holder. On refresh failure retain the last successful catalogue/detail alongside the failure and retry state; do not present cached resolution as freshly confirmed. Loading never flashes an empty/unassigned answer. |
| Write refused/failed | Exact reason beside action; no local mutation of displayed resolution |
| History empty | `No assignments yet` within a valid selected Duty |

Use §4.2’s approved catalogue/detail composition and responsive targets. Below 1024px show the
catalogue first and open the selected Duty as a full-width detail with `Back to duties`; forms are
single-column and dates/names never truncate. Keyboard order is
search/filter → Duty list → selected facts → authorised actions → history. Focus returns to the
originating Duty after a modal closes.

### 4.6 · Resolution, reference lessons and measured delivery gaps

**Resolution pass — final review 2026-09-29.** Shared Duty ownership, People eligibility, module
completion and approval gates are RESOLVED FROM AUTHORITY. The owner-approved Settings/plain-name
UI, automation, operational execution and departure flows are APPROVED TARGET / NOT BUILT.
Catalogue/detail, search, state filter, current assignment/cover reads and guarded manual assign/
cover forms are BUILT in the inspected source; this is not verification of the newly approved target.
No additional owner policy is required for the bounded final Blueprint. Missing implementation
is not a reason to re-interview the owner or expand the agreed surface.

**DELIVERY PRIORITY — OWNER RULING 2026-09-29.** Deliver the Settings relocation first as
[【WORKSPACE】 — CARD 02 · Move Staff & Duties into Settings](../cards/CARD-2026-09-29-workspace-02-staff-duties-settings-entry.md).
This slice owns the existing page's destination, menu entry, compatible links and responsive shell;
it does not change Duty business rules, HR workflows or database contracts. The release diff was narrowed to this slice. Missing migration tooling is not a blocker for this Card;
the remaining approved automation, personnel and permission targets remain unfinished.

**CARD 02 — PRODUCTION VERIFIED, 2026-09-29.** PR #1791 delivered the Settings relocation at
`5fa933a5a06bdf7177043d892141e8cdd81e2f26`. CI run `36538315010` passed (13,507 tests passed;
222 existing skips), and main-owned deployment `36539744277` converged both Pages aliases, both
canonical web domains and the API Worker to that exact SHA. Downloaded predecessor/new bundles
prove the destination title changed from Workspace to Settings while the existing page-purpose
control remained present.

The authenticated Operation browser walk verified gear → All System Settings → Staff & Duties,
legacy exact-GRN redirection, current GRN facts, the read-only manager sentence, narrow Back,
on-demand Settings navigation, and the main menu's Workspace entry without a Staff & Duties row.
No production record was written. Fixture checks at 1440/1180/820/743/390px verify shell geometry,
no horizontal overflow, narrow return focus, loading/failure and unchanged reader/manager controls.
`docs/evidence/staff-duties/settings/` distinguishes these fixtures from deployment proof.

This closes the destination move only. Existing API contracts, forms, history and permissions are
unchanged. The subsequent #1798 release delivers the current-person/detail/history composition and
two-period/recorded-unavailability engine (§4.4). General rotation, People departure/access,
bounded manual-exception convergence and full Work actor/origin audit remain approved target work.

| Measured evidence and severity | Operator consequence | Required convergence |
|---|---|---|
| StaffDuties.tsx, DutyCatalogue.tsx and DutyDetail.tsx already implement selected detail, search and state filter | Rebuilding from the old stacked-page audit would discard useful capabilities | KEEP those capabilities; apply §4.2's plain-name Settings composition, manager menu and approved widths |
| Settings relocation and current-person/Next/history composition are production verified (#1791/#1798) | Staff now open the existing page under Settings | Preserve the shipped destination and composition; remaining policy/history gaps are separate below |
| Migration 0437 prefilled named two-person monthly assignments through September 2027 — red target gap | This does not establish general joiner/leaver automation | The approved cyclic allocation and next-month admission rule must produce the single authoritative assignment source |
| Existing assign writer accepts overlapping rows; current cover writer validates a whole normal-holder period — red target gap | Manual exceptions and automatic leave could otherwise give inconsistent answers | Dated §4.3 exceptions with impact preview and preserved baseline; §4.4 one effective cover answer and eligibility checks |
| PR #1798 replaces the OperationApp heartbeat and the 0504 presence fallback with period interaction evidence and recorded movements — deployed | Morning use does not satisfy the afternoon check; no late bounce-back | Applied files/functions reconcile; release and production evidence are in §4.4 |
| `operationWorkCompletedSchema` exposes completed actor/time but no assignment snapshots or Workspace/Delivery Monitor origin — measured contract gap | The full newly approved history cannot be claimed from that DTO alone | Preserve existing completion evidence and converge the assignment/update/origin audit across owning-module writers and Work reads |
| Existing Duty API limits history reads to 200 records — target gap | Older authorised records may not be reachable | Complete bounded history pagination in a separate approved delivery scope |
| PR #1798 retains the last successful Duty response on refresh failure — deployed | Staff keep the known facts and can retry | Failure/retained-data behavior is covered by focused tests and the real-component browser fixture |
| HrPersonDrawer ExitBlock explicitly separates exit recording and access disablement — red target gap | Manager can finish one step and miss the other | HR §3 one confirmation, honest scheduled/partial effects, default current-only lists and personnel-only former-profile access |
| GRN posting already admits active personal Operation/Principal under 0601; automatic assignment must not expand amendment permission | Helping remains possible regardless of the displayed assignee | 0619 preserves the original/manual GRN amendment authority separately from automatic responsibility; other source-owned permissions remain unchanged |

Reference lessons used during review, never authorities over Carres business rules:

| Reference capability | Carres owner / decision | Fit and boundary |
|---|---|---|
| [Linear members and roles](https://linear.app/docs/members-roles): managed suspension with retained activity | People / ADAPT | Central employee/access truth; remove leavers from routine lists while preserving evidence; Carres personnel-only former-profile rule applies |
| [Shopify roles](https://help.shopify.com/en/manual/your-account/users/roles): central role administration | People and module capabilities / KEEP separation | A displayed work person is not a new permission editor or automatic approval grant |
| [Shopify order details](https://help.shopify.com/en/manual/fulfillment/managing-orders/managing-order-details): More actions | Workspace / ADAPT | Visible `⋯` for applicable manager exceptions, not repeated permanent buttons |
| [Linear Inbox](https://linear.app/docs/inbox): contextual actions | Workspace / ADAPT, REJECT right-click-only entry | Preserve focused action context, but make entry visible and touch/keyboard operable |
| [Oracle effective-dated updates](https://docs.oracle.com/en/cloud/saas/human-resources/fahdl/options-for-updating-date-effective-objects-with-future-dated.html): explicit future-record effects | Workspace / ADAPT | Show affected arrangements; a temporary exception preserves the rotation baseline. Do not copy external overwrite modes or historical deletion semantics |

**Scope boundary.** This Blueprint does not add a Work claim button, workload-based allocation,
permission lecture, independent employee store, HR attendance scoring or destructive employee deletion.
The two work-period checks in §4.4 are operational assignment evidence only.
No new generic historical-correction UI, permanent rota editor or separate reporting/export surface
is introduced. Existing governed source records and audit remain reachable; HR-owned sensitive
records keep their existing gates. Build owns routine delivery mechanics, not new business policy.

### 4.7 · Staff & Duties acceptance contract

The page is ready for owner acceptance only when all are demonstrable:

- every shared catalogue Duty appears once and an unknown/missing catalogue response fails visibly;
- the current `Assigned to` or `Not assigned` answer matches the Shared Duty Resolver byte
  for byte on Staff & Duties, Team Work and one protected module door;
- manager and non-manager sessions see the exact §4.5 capabilities with no leaked write control;
- current, future and ended assignments/covers resolve on the correct company date boundary;
- inactive, departed, external Warehouse, same-as-holder and otherwise ineligible people are absent
  or refused at the authoritative write door;
- assignment and cover overlap/race attempts cannot yield two effective answers;
- success, known refusal, uncertain response and retry preserve one append-only act and honest UI;
- search/no-match/read-failure/history-empty states and deep links retain their required meaning;
- names, dates, action controls and history remain readable and operable at 1440, 1180, 820, 743 and 390px;
- the current owner, next effective assignment and collapsed history remain distinct under §4.2;
  recorded event time is never substituted for the effective period;
- changing the current holder/cover updates open/future Work routing without rewriting completed
  actor evidence.
- newcomers can perform ordinary PO work in their joining month while PO allocation starts next
  month; automatic admission/rotation never grants commercial approval;
- active-person eligibility, recorded leave and month boundaries give one consistent current name;
  temporary exceptions expire back to the correct system arrangement without resetting the rota;
- `Manage staff` opens the owning People flow for authorised personnel managers; ordinary staff
  cannot access former profiles by lists or direct links, while source-document actor names remain;
- departure confirmation coordinates due access/list/routing effects and exposes partial failures;
- `Next` and collapsed `History` use the final copy; full authorised evidence remains reachable even
  when the dataset exceeds the old API limit.

## 5 · My Work and Team Work

```text
My Work     actions routed to the signed-in acting person today
Team Work   the same actions grouped by normal owner
```

- My Work is the default for everyone, including managers, and omits their repeated avatar.
- Team Work groups under owner avatar/name; cover appears only when today's actor differs.
- No manual `Take it`, `Release`, generic assignment or `Mark done` exists for deterministic work.
- The working week is explicit: `Missed`, the working days admitted by each owning module and
  resolved owner's calendar, and `No working date`; blockers never hide the original required
  working day or missed age.
- Completed/History is read-only source evidence and preserves the actual actor.

### 5.1 · One Work composition

Work is one page with two scopes over one open set. It is an operator workspace, not a Dashboard,
Kanban board or second module record. Owner-approved 2026-09-16: large desktop uses three working
panels inside the existing global shell. My Work opens with a focus list containing `Missed`
followed by the actual current governed weekday/date. On a public holiday with no authorised
holiday operation, the holiday remains named in Panel 1 and the focus list uses the next eligible
governed working day; an authorised holiday operation remains on the named holiday. The complete
working week remains visible and choosing a day narrows Panel 2 to that day. The opening focus list
does not create a second occurrence or count.

**OWNER APPROVED — Work v4, 2026-09-17.** This section, §§5.2–5.5 and §5.8 carry the v4 rulings;
the reference review surface is https://claude.ai/artifact/HcREkf3UTPj35gYj339mCA (v4). Its
records, people, dates and simulated saves remain fixtures and are not authority.

```text
┌ 📅 Date   ‹ Sep 2026 › ┬ Missed {n} · Thu, {date} {n}┬ SELECTED ACTION ─────────────┐
│ ⟲ Missed     {count}   │ BROKEN COMMITMENT  (red)    │ {object} · {module}          │
│ [14 MON]               │▌{object} · {module}         │ {recipient, when applicable} │
│ [15 TUE]     {count}   │▌{fact}                      │                              │
│ [16 WED] {holiday}  {n}│▌{action} · {contact} {when} │ CURRENT FACT                 │
│ [17 THU] ← solid blue  │ MISSED                      │ {fact or problem}            │
│ [18 FRI]     {count}   │ {object} · {module}         │                              │
│ [19 SAT] when admitted │ {fact}                      │ ACTION                       │
│ ⊘ No date {n}          │ {action} · {contact} {when} │ {specific action}            │
│   (only while n > 0)   │ Blocked by {dependency}     │                              │
│                        │ THU, {date}                 │ COMMUNICATION (when admitted)│
│ ▦ Module               │ {object} · {module}         │ [Open WhatsApp group]        │
│ All modules  {count}   │ {fact}                      │ [Copy message]               │
│ Sales Orders {count}   │ {action} · {contact} {when} │                              │
│ Purchasing   {count}   │                             │ REQUIRED RESULT · FINISH WHEN│
│ Receiving    {count}   │                             │ {module action when admitted}│
│ Delivery     {count}   │                             │                              │
│ Payment      {count}   │                             │ [Open {object}]              │
│ Issue Tracker{count}   │                             │                              │
└────────────────────────┴─────────────────────────────┴──────────────────────────────┘
▌ = thin red row edge of a broken commitment (no row badge)
```

Panel 1 chooses the working day and module. Panel 2 lists the matching authorised actions; on first
open it shows `Missed` followed by the actual current or next eligible governed weekday/date under
the holiday law above. Panel 3 shows one selected action's fact, specific act, source-owned
communication where admitted, required result, admitted owning-module action and exact
owning-object door. `Missed` contains actions whose governed working day has passed;
the original day and working-day age remain visible. Previous/next controls move the selected week
without changing scope or filters. Monday through Friday always show. Saturday appears only when an
authoritative module action remains scheduled on Saturday after applying that module's rule and the
resolved owner's working calendar. Payment keeps its locked Friday-action rule for a Saturday
deadline. Physical Receiving or Delivery work remains on Saturday when its authoritative rule and
resolved actor admit Saturday; without a qualified actor it is `Not assigned`, not silently moved.
The approved Saturday contact-support rota (§4.4) does not override these source-owned
action calendars or create duplicate operational tasks. A separate preparation action may appear on Friday only when
its owning module generates that action. A public holiday remains visible and is named; normal work advances by
the source calendar, while an authorised holiday operation remains on the holiday and says so.
`No working date` is an admitted obligation without a lawful day and never pretends to belong to
today.

**Panel 1 — the left rail. OWNER APPROVED UI, Jess 2026-09-26 (replaces the 2026-09-24 card
column); BUILT 2026-09-26.** The shared 240px `FilterRail` (`Hide filters` / `Show filters`,
remembered per browser), running from the page header to the bottom. Every row is a real button with
a complete accessible name and a visible keyboard focus ring. Top to bottom:

- **The month header — ONE line:** `Previous month` · **`{Mon YYYY}`** (`Sep 2026`) · `Next
  month`. The arrows move the visible month and change neither the chosen Date, the Status, the
  Page nor any filter. (The 2026-09-24 two-week column and the 2026-09-26 one-week strip are
  retired: the owner wants the whole month.)
- **The month grid — Monday to Saturday, every week of the month** (`FilterRailMonthGrid`, Jess
  2026-09-26: "full 1 month — need to see Sat work; office doesn't work Saturday, but the Workspace
  needs to see it"). Six 36px tiles share the 216px row; Sunday is never drawn. A tile is the day
  number over its count line, cut from the one `fmtDate` spelling and moved by whole `YYYY-MM-DD`
  days. **No blue words:** the column heads `MON`–`SAT` grey, numbers black. The count line prints
  the number of open actions dated that day and is **empty** when there are none — never
  `No work`, never `0`. A public holiday (and any non-working day) is the grey-text tile, its name
  only in the accessible name and tooltip (`Malaysia Day`) — never `Hol`, never `Public holiday ·`.
  **Today** is the ringed black number, and this week's row is the tinted row; the word `Today` is
  never on screen. The **chosen** day is the solid-blue tile with white text — the page's ONE blue: a rail row choice is
  bold with its left line, never washed; the only washed row on the page is the chosen work. Today,
  closed and chosen are independent states. A day can be chosen whether or not it is closed and
  counts the work dated on it.
- **The fixed rows** `Missed {n}` and `No date {n}` — `0` printed. `Missed`, one tile and `No date`
  are one mutually exclusive Date choice. A missed occurrence counts once, under `Missed`, never
  again under its past weekday.
- **`Status`** — the three former middle tabs, now rail rows: `To do` · `Waiting for answer` ·
  `Done today`, each with its count over the chosen Date's rows. **More than one may be on**; a row
  toggles on its own; the last row on cannot be turned off. The opening list is `To do` alone.
  `Waiting for answer` holds a row only when the owning module recorded that we wait on the party;
  `Done today` waits on source-owned closure receipts (§5.2.1) and prints `0` until then.
- **`Page`** opens with `All pages`, then each admitted page as a name and a right-aligned count —
  no per-row icon. It counts the occurrences of the chosen Date before the page choice, so choosing
  one page never reduces another page's count; `All pages` equals the Date list and the page rows
  sum to it.
- **`Owner`** (Team Work only): the `All owners` select.

Date, Status, Page and Owner combine. The rail is the only place these facts live: the middle
column draws **no date heading, no count heading and no tabs** above the list.

The URL carries the visible month (`month`), the Date choice (`day` = `missed` ·
`YYYY-MM-DD` · `no_date`) and the module (`module`); opening that URL restores all three. Without
`month` (`YYYY-MM`), the rail shows the month of the chosen date, else the month of the focus day.
The URL also carries the Status choice (`status` = a comma list of `todo` · `waiting` · `done`; absent = `To do`).
The opening focus list (no `day`) rings the focus day's tile. `day=all`, reached from the toolbar's timing
filter or a Dashboard link, lists every open action and highlights no Date option.

Panel 2 draws no heading of its own (the rail names the day). Panel 2 groups appear in this order: `BROKEN COMMITMENT` →
`MISSED` → the selected day. A broken commitment is shown in the `BROKEN COMMITMENT` group with a red
group heading and a thin red row edge; the row carries no badge, and its accessible name still says
`Broken commitment`. It still counts under its own working day in Panel 1 (for example `Missed`) and
is never counted twice. There is no `Blocked` group: a blocked occurrence stays in its own group
(`BROKEN COMMITMENT`, `MISSED` or its day), keeps its date and missed age, and prints `Blocked by {dependency}`, so blocked
missed work is never hidden.

Every action belongs to exactly one working-day count. Once its governed action day is before today,
it moves into `Missed`; the row retains and prints the original required date, but that occurrence is
not counted again under the past weekday. Module and owner totals count the same occurrence once.
Day selection never creates a second copy.

Team Work uses the same three panels and week. It is visible to the whole Operation team: Principal,
Operation and Jess. Visibility does not grant new module data or action permission. Panel 1
additionally selects normal owner or `Not assigned`; a Site queue must not appear until its governed
identity, permission and acceptance path are built and admitted. Panel 2 keeps actions grouped or visibly identified by that normal owner and
Panel 3 preserves cover evidence. Counts always name actions.

My Work is available to every active internal role that may own an admitted action, including Sales
and Finance, and returns only occurrences routed to that signed-in acting person plus source health
they are authorised to know. Team Work remains limited to Principal, Operation and Jess and still
applies underlying module permissions. The Work read boundary therefore cannot remain the current
Operation/Principal-only guard; widening the endpoint never widens an owning-module object door.

Workspace never owns or stores module truth. Panel 3 is an action surface, not Object Detail and not
a Workspace-owned form. Every occurrence declares one interaction mode: `embedded`, `open_module`
or `read_only`. `embedded` renders the owning module's governed component and calls that module's
authoritative API with the same permission, validation, evidence, source-version, idempotency and
completion law. `open_module` uses one `Open {object}` door for complex or high-risk work.
`read_only` explains that the user can view the action here but has no admitted execution door.
Workspace never recreates a similar form or writes a substitute result.

An embedded action is admitted rule by rule, not inferred from a small-looking form. Its contract
must name the component, authoritative API/action key, permission, exact source version, required
evidence, completion predicate, specific success receipt, stale-state refusal, idempotency behaviour
and fallback owning-object door. Missing any one keeps the occurrence `open_module`. Opening
WhatsApp, copying text, uploading ungoverned evidence or marking a local checkbox never completes
business work.
A `FINISH WHEN` block prints the operator-safe completion statement supplied beside the
authoritative machine completion predicate. It does not expose table names or substitute
`requiredResult` merely because that sentence already exists. `WHAT HAPPENS NEXT` appears only when
the owning module supplies a separate governed consequence; Workspace never relabels the completion
predicate, required result or a likely consequence as one another.
The first admitted embedded vertical slice is Delivery proof review: `Accept proof`, `Request more
proof` or `Reject proof`, using Delivery's existing review truth. The existing Delivery review form
must first become one shared owning-module component used by Delivery and Work; Workspace does not
copy it. Supplier reply remains unadmitted until its API proves exact current-PO-version refusal and
evidence law. Customer delivery booking, Delivery result, Issue PO, Receiving/GRN, Payment, refund
and Service outcome remain `open_module` until separately admitted. A Case request, approval,
uploaded slip or checkbox never means Finance paid a refund.

For Delivery proof review, every file in the latest governed proof package must be readable before
`Accept proof` is available. A failed file says `Photo could not be loaded · Try again`; `Request
more proof`, `Reject proof` and the secondary `Open {Delivery Order}` door remain available. Once
all current files load, acceptance may resume. `Viewed` is temporary page assistance only: it is
not stored, is not completion evidence and creates no Work history. The UI never claims that a
driver was contacted merely because `Request more proof` was recorded; its truthful supporting
result is `More proof is required`.

### 5.2 · Work-item presentation contract

Each visible item uses the approved three-line row grammar (owner ruling 2026-09-17):

```text
OBJECT LABEL · MODULE OR SITE CONTEXT                       line 1
FACT OR PROBLEM                                             line 2
ACTION · CONTACT (when applicable) · TIMING / MISSED AGE    line 3
Blocked by {dependency} · exceptional state (only when true) wraps below
```

- Object identity belongs in the item header and is not repeated in the action.
- Owner belongs in the Team group/avatar or exceptional cover/handover metadata, never the sentence.
- My Work and Team Work show current `Assigned to` and use that assignment for their person scope.
  Changes remain in history; completed work separately shows `Completed by`. No cover labels remain.
- A future Site queue is an owner state, not a person. It may render only after a governed queue
  identity, permission and atomic acceptance path are built and admitted; until then unresolved
  site work is `Not assigned`.
- The action begins with a specific verb and names its business object only when the header does not
  already make it unambiguous. `Follow up`, `Check`, `Handle`, `Process` and `Pending` alone are
  forbidden.
- Required result belongs in Panel 3 for physical handover, multi-result and otherwise ambiguous
  acts; it remains available as accessible supporting text for every item.
- Required result describes the result the actor must produce. The machine completion predicate is
  the source rule that closes the occurrence. `FINISH WHEN` uses a third, operator-safe completion
  statement bound to that predicate. These may coincide in simple cases but the UI never assumes
  they are interchangeable and never exposes schema/table language.
- Communication is a structured source-owned `COMMUNICATION` block in Panel 3: recipient, channel,
  actual sent evidence and reply state when the source truly supplies them. It is absent for
  non-communication work. Workspace does not copy or store a second conversation. Where the owning
  module admits them, Panel 3 renders that module's own `Open WhatsApp group`, `Open WhatsApp` or
  `Copy message` control with the module's label law (COPY-STANDARD: the word follows the door the
  click opens) and the module's message text; Workspace never writes its own message or label.
  Opening WhatsApp or copying a message is never sent evidence and records nothing. A result control
  such as `Record supplier answer` appears only after that module's supplier-reply rule is admitted
  as an embedded action (§5.1).
- Avatar initials are a chip with the full current name on hover, focus and tap. Departed people may
  appear only in historical evidence.

#### 5.2.1 · Authoritative Work feed contract

The three panels render one permission-scoped server response. They do not join module reads in the
browser, infer missing facts or keep a second Work database. Every admitted open occurrence carries
the following structured facts; display sentences are generated from these facts and are not a
separate editable truth.

| Contract group | Required facts |
|---|---|
| Identity | Stable occurrence ID; admitted rule key and version; module; source object kind, ID and display label |
| Action | Fact/problem; specific action; recipient when applicable; required result; authoritative machine completion predicate; operator-safe completion statement |
| Ownership | Owner rule; Duty key when used; normal owner; today's acting person; active cover evidence; explicit unresolved state |
| Timing | Business deadline when one exists; governed action date/time; calendar key and source; working-day/missed calculation evidence; no-date reason when lawful |
| Calendar health | Module-calendar state; resolved-person calendar state; holiday name when applicable; `not configured` and `read failed` remain distinct |
| Communication | Optional source-owned channel, recipient, actual sent evidence and reply evidence/state; never a Workspace draft, send control or inferred conversation |
| Resolution | Blocker and resolving door when blocked; optional separately governed next consequence; exact owning-object deep link |
| Observation | Source observation time and source version needed to prove that the row and selected brief describe the same fact |
| Interaction | `embedded`, `open_module` or `read_only`; for embedded actions, owning component/action key, API capability, input/evidence contract, idempotency law, stale-version refusal and specific success-receipt contract |

`Business deadline` and `governed action date` are separate facts. For example, a Payment deadline
on Saturday may lawfully generate a Friday action without rewriting the Saturday deadline. Receiving
or Delivery may retain Saturday as both facts only when their rule and resolved actor calendar admit
it. The feed never asks the UI to reverse-engineer one from the other.

The response also carries one health record for every admitted source requested by the current
authorised scope:

| Source state | Required behaviour |
|---|---|
| `Healthy` | Return its current authorised items and observation time |
| `Delayed` | Preserve its governed last-safe observation and name when it was last read successfully |
| `Failed` | Name the unavailable source without exposing protected detail; do not replace its possible work with zero |
| `Not admitted` | Never return its objects, module option or count as if they were Work |

A failed source does not discard healthy-source actions. The envelope states whether the returned
set is complete, which sources are not current and the last successful observation available for
each. All visible counts, day/module/owner totals and Panel 2 rows derive from this same authorised
item set and health envelope. No separately queried total may disagree with the list. Permission
scoping happens before items, people and counts enter the response; a refused scope returns no
protected count or identity.

The permission-scoped envelope may additionally carry a short-lived closure receipt for the
previously selected occurrence: source-owned result, actual actor when durably recorded, closure
reason/time and source version. It is not Work history and cannot be invented from disappearance.
Until a receipt exists, external closure uses the neutral fallback `No longer needed`; it never
names a person or result that the source did not supply.

The selected action is addressed by its stable occurrence ID in the URL. After refresh, if source
completion law removed it from the open set, Work returns focus to the next visible row and shows
the authorised closure receipt or neutral fallback; it does not preserve a stale actionable brief.
An embedded mutation does not remove the row optimistically: Work re-reads the feed, confirms the
owning completion predicate removed that identity, then selects the next visible row. If closure
cannot be confirmed, the action stays visible and offers an idempotent retry. If a
filter removed it, the list retains the filter and selects the first matching row. If its source
failed, the last-safe brief is visibly non-current and has only its safe owning-object door.

Current implementation gap: contract v2 now separates deadline/action date, missed placement/age,
calendar health, rule/source version and cover evidence, and its strict transport shape requires a
viewer-resolved interaction plus an optional source-versioned closure receipt. Current projectors
truthfully default to `open_module`; viewer capability resolution and source-owned receipt loading
are not built. People-owned working eligibility, complete resolver cover periods and governed
last-safe delayed-source observations also remain incomplete. Delivery proof review still lives
inside its Delivery page component and is not admitted in Work. UI construction may use fixtures
for review, but production acceptance requires these facts and may not disguise a gap with client
defaults, hard-coded people/calendars, independent source calls or a copied mutation form.

### 5.2.2 · Owner review 2026-09-25 — the Work page as Jess walked it (BUILT)

Jess reviewed the live page in an 829px window and approved 24 fixes as written in
`docs/cards/CARD-2026-09-25-workspace-01-work-page-review.md`. The rules they set:

- **One stage below 768px only.** 768–1279 collapses the rail; 1280 and up shows three panels. The
  743×704 acceptance keeps its 40px rows.
- **The compact Date control (<768) is one horizontal strip of chips**, the chosen day blue, the
  strip closing on a pick; the toolbar's own Date and Page buttons stay neutral while it is open.
- **The header prints no count.** The list heading carries `{n} actions to do`; below 768px it is
  the count alone (the toolbar button already names the day). The header speaks only when My Work
  is empty while the team has work: `0 for you · {n} for the team`, and the empty list offers
  `See Team Work`.
- **Words:** rail section `Page` / `All pages` (not Module) · header `Jump to…` with its keyboard
  hint (the `Search` rename was reverted by Jess 2026-09-26) · `Help` and `Settings` beside their
  icons · the right rail names each icon. **Staff assignment wording follows §3 (Jess, 2026-09-29):** show `Assigned to`; assignment
  history records changes. No cover badge or cover filter remains.
- **The Date rail** is the one-line month header and the Monday–Saturday month grid of §5.1
  Panel 1 (Jess, 2026-09-26 — replaces the day cards, `Today` in words, `No work`,
  `Public holiday · {name}`, the two-week column and the one-week strip). `No date` (never
  `No working date`) is always listed.
- **List tabs are retired** (Jess, 2026-09-26): `To do` · `Waiting for answer` · `Done today` are
  the rail's `Status` rows, more than one may be on.
- **My Work / Team Work** active segment is kit blue. Search is 340px beside it at every width
  above 600px.
- **The empty list is one bordered white section** the height of its words.
- **Sidebar:** names by default from 1280px; below that it starts as icons (a 232px named rail
  would push Work under 768px and into the phone layout — measured on production 2026-09-25);
  the person's own collapse is remembered; the bottom block shows the account's name where one
  exists.
- **THE WORK SHELL IS THE §6.0 LISTING SHELL — owner ruling 2026-09-25 ("why you different from
  sales order ui").** Work draws the same shell as the Sales Orders Register: the 50px Destination
  Header (page name + Search · Alerts · Help · Settings, no count), then ONE plain white toolbar
  row with a bottom rule (no framed box): `My Work · Team Work` · Search 340px.
  **The left rail is the rail every page follows — the Payment Monitor's grammar (Jess,
  2026-09-26) with her same-day correction:** the shared 240px `FilterRail` with `Hide filters`;
  the one-line header `‹ Sep 2026 ›`; the Monday–Saturday month grid of day tiles; the fixed rows
  `Missed {n}` and `No date {n}`; the `Status` rows; the `Page` group (`All pages` + each page with
  its count) and, in Team Work, the `Owner` select — exactly as §5.2 Panel 1 writes it. Hidden, it
  leaves the 44px `Show filters` strip; the choice is remembered per browser; on one stage it
  floats over the list. The three-panel page is rail · list · detail. **The rail runs from the page header to the bottom; the toolbar belongs to the
  right column and never spans above the rail (Jess, 2026-09-26).** The 72px header, framed toolbar, compact strip and toolbar selects are retired.
  The middle column is the 300px two-line picker of §5.5 (Jess, 2026-09-26: "listing more important
  than working panel?" — no); the 104px cards are retired.
- **Phone shell (<768px, owner review 2026-09-25 round 2):** the page has the whole width; the
  sidebar is a slide-in drawer behind a `Menu` button; the right rail is not drawn. The header's
  `0 for you · {n} for the team` wraps instead of truncating. An empty list draws no
  `Select a work item` box.
- **Not done — needs its own card:** the bell badge (item 11) counts live order alerts and has no
  notification record to mark read.

### 5.3 · Filter, search and URL contract

Search matches the authorised open set by object number/label, customer, supplier, recipient,
problem and action. It never broadens permission scope and never searches a separately cached copy.

The toolbar `Filters` door is governed for Work. It lives in the toolbar only and is never a Panel 1
or rail heading. Filters are: `Scope` (`My Work` · `Team Work`), `Week`, `Working day` (`Missed` · admitted weekdays ·
Saturday when generated · `No date`), `Status`, `Page`, `Owner` (Team only),
`Blocked` and `Source failed`. `Broken commitment` is an attention filter, not a synonym for
`Missed`. Multiple filters combine and every active filter is
visible, individually removable and represented in the URL so Dashboard and module doors can open
the exact same result. `Clear all` preserves the current scope. Refresh re-reads the one feed and
does not change business state.

The Module filter lists only currently admitted projections: `Sales Orders` · `Purchasing` ·
`Receiving` · `Delivery` · `Payment` · `Issue Tracker`. `Service Case`, `Warehouse Outbound` and
`Claims` do not appear until their admission gates and live projection close.

Panel 2 group order is `BROKEN COMMITMENT` → `MISSED` → selected day (§5.1). Default ordering inside
a group is module-governed materiality, oldest opened occurrence, then object label. Users may narrow
the view but cannot manually reprioritise authoritative due facts. Search and filter results keep
the same group and item grammar; zero matches is not the same as zero work.

### 5.4 · Work states

| State | Required presentation and behaviour |
|---|---|
| Loading | Keep the page shell and applied scope/filter visible; use quiet row placeholders, never `0` |
| Empty My Work | `Nothing assigned to you` · `Open Team Work` for authorised supervisors; source freshness remains visible |
| Empty Team Work | `No open work` only when every admitted source is healthy; otherwise show the failed source state |
| No search/filter match | `No work matches these filters` · `Clear filters`; never imply the source set is empty |
| Missed | `Required {weekday, date} · {n} working day(s) missed`; colour supports the words and is never the only signal |
| Saturday | Appears only when an admitted action remains on Saturday after module and resolved-owner calendar law; retains the Saturday business date |
| Public holiday | Day remains visible and names the holiday; only an authorised holiday operation may remain assigned there |
| Calendar not configured | Name the affected Site/owner calendar and correction door; do not invent off-days or missed age |
| Calendar read failed | Say working days could not be loaded, preserve safe dated facts and hide invented missed age; never treat failure as zero |
| No eligible actor that day | Keep the action on its authoritative day · `Nobody works {date} for {Duty}.` · `Set cover in Settings → Staff & Duties`; do not falsely say the Duty has no holder |
| Blocked | Stays in its own working-day group (no `Blocked` group) · `Blocked by {dependency}` plus the door that can resolve it; retain original working day and missed age; the `Blocked` filter narrows to these rows |
| Not assigned | Group under the governed Duty word · `Nobody holds {Duty}` · `Set the holder in Settings → Staff & Duties` |
| Covered | Preserve normal owner and effective cover evidence; My Work routes to today's acting person |
| Source delayed | Preserve last safe observation and say `Could not refresh {source}` with time |
| Source failed | Isolate and name the source; never omit its possible work or convert failure to zero |
| Permission refused | `You do not have access to this work` and no leaked counts, objects or people |
| Completed/history | Leaves the open set only after the authoritative completion fact; history shows result, actual actor and time |

### 5.5 · Responsive and accessibility contract

- **THE WORK DENSITY — owner ruling 2026-09-25, APPROVED / BUILT. Exact values, not a direction.**
  Header: ONE white row, `Work` 28/34/600 with the count `{n} actions to do · {m} missed` 13/18/400
  on the right, 72px tall with 24px sides from 768px wide; below 768px 24/30/600, 12/16/400, 64px,
  16px sides. No breadcrumb row, no second title, KPI band or card header.
- **THE WORK SHELL — owner ruling 2026-09-27, APPROVED TARGET.** Work is one continuous white
  operating surface with quiet 1px dividers, no outer frame, large gutters, shadows or card field.
  The application sidebar remains 88px and the global right rail remains 56px. Inside them, the
  desktop Work surface is `280px Inbox · flexible Mission (minimum 560px) · 340px Communication`.
  At compact desktop it is `260px · flexible Mission (minimum 420px) · 300px`. When that minimum
  cannot be kept, the surface becomes `300px Inbox · Mission`; Communication is a 340px overlay
  drawer and never squeezes the Mission. Below 760px, Inbox → Mission → Messages are one full-width
  stage at a time. The page does not own one long desktop scroll: each column scrolls independently
  beneath its fixed heading; Communication also has a fixed action footer.
- **THE WORK INBOX — owner ruling 2026-09-27, APPROVED / LOCKED (Jess: "Left rail proposal approved and locked").** The left column owns scope,
  search, Filters, the Monday–Saturday month and the action list. It defaults to the whole month;
  pressing `{Mon YYYY}` contracts it to the selected week, and the last choice is remembered.
  Its fixed area is no more than 246px: 36px scope, 8px, 36px search/Filters, 8px, 32px month head,
  about 126px month grid and 36px `Missed`/`No date`. `Missed`, one chosen date and `No date` are
  mutually exclusive. With Missed work, first open selects Missed and lists only Missed; otherwise
  it selects today (or the next admitted day with work). Filters open from one door and contain
  Page, Owner and cover facts; active choices are removable chips below Search. They do not create
  a second permanent toolbar.
- **THE ACTION ROW — owner ruling 2026-09-27, APPROVED / LOCKED.** One row is exactly one Work
  occurrence and one action; an order with Payment, Purchasing and Delivery actions has separate
  rows and may have different owners. The row is 76px, edge-to-edge with a 1px divider, 12px sides,
  no radius, shadow, chips or card gap. Line 1 is `{document}` 12/16/500 and the date 12/16 on the
  right (red when Missed); line 2 is the action 14/20/600; line 3 is the short context 12/18,
  normally `{page} · {fact or party}`. Every line truncates with `…` and exposes the whole string
  on hover/focus. Selection is a 3px blue left edge plus pale-blue wash and never changes height.
  The month already names the selected date, so there is no repeated list heading or list tab bar.
  Rows draw 50 at a time; selection never shrinks the rendered range; a failed refresh keeps the
  last safe list and adds one retry row. Team Work may retain one 32px owner group line.
- The Mission column takes every pixel the Inbox and Communication leave (the working panel is the
  page; the list only picks). It stacks independent white sections in the §5.10 order: Order Route
  first, the Sales Order card, then the PARTY CARDS (§5.9) — Logistics · Customer · Supplier — then
  the audit disclosure. The selected-work summary block is drawn only for work that names no Sales
  Order (a PO window, an embedded proof review).
- **THE COMPACT DETAIL — owner ruling 2026-09-25, APPROVED / BUILT. Below 768px, exact values:**
  12px canvas padding; sections 8px apart; `Back to work` a 40px row; the header card (12px
  padding, height follows content) carries the object line, the problem 16/22/600 and the action
  line 13/18; the task card (12px padding) puts its result line and the 32px `Open {object}`
  button (13px) on ONE row, then the 36px `Owner, timing and source` disclosure (12px). Party cards:
  12px sides, heading 15/20/600, current action 13/18/600, supporting/status text 12/16,
  `Checks n of 3` 12px, a 40×40 chevron; Customer and Supplier collapse to exactly 72px; Logistics
  is at least 72px and grows only for its approved scheduled/exception facts (its five-fact
  collapsed law is unchanged); expanded bodies use 10px vertical padding and 8px between sections;
  radius stays `rounded-work`. The same compact detail applies at 820px and 390px. From 768px the
  previous detail geometry holds (16px gaps, 24/16px card padding, 14/20 current action).
- **One header row.** Work's header carries the top-bar icons (`Jump to…` · alerts · help ·
  settings) itself, so the slim 44px GlobalTopBar is not drawn on Work — the same law every page
  with its own Destination Header follows. When the row is too narrow (390px) the count wraps under
  the title inside the 64px row; the title never truncates. Acceptance at 743×704: two toolbar rows,
  and the detail title, task card, Logistics, Customer and Supplier headings all visible without
  scrolling.
- The page body does not own one long desktop scroll. Panel 1, Panel 2's action region and Panel 3's
  detail body scroll independently beneath fixed panel headings. On single-panel screens the active
  panel owns normal document scroll.
- Panel 3 has 24px horizontal / 16px vertical heading padding and a left-aligned detail body no wider
  than 760px. `open_module` and `read_only` retain the full structured brief. `embedded` is compact:
  object/module header; one current-fact line; module-owned form with `Finish when: {statement}` as
  supporting copy immediately below its heading; one primary mutation; then the secondary
  `Open {object}` door and expandable owner/timing/source evidence. At 1440×900 the primary mutation
  must be visible without scrolling for every admitted embedded action. There is no generic sticky
  send/record bar and no second primary action.
- Desktop controls retain their owning kit geometry; Work does not force Tabs, SearchInput, Select
  and Button to one height. Below 768px, every interactive target is at least 40px high
  with 8px between adjacent targets. Page padding is 24px on multi-panel content headings and 12px
  on single-panel screens. Only the frozen spacing, type, radius, colour and elevation tokens apply.
- Every item wraps rather than truncating problem, action, recipient, required result or working-day
  state. No horizontal owner board or hidden completion text is permitted.
- Keyboard order follows scope → search → working day → module/owner → filters → items → selected
  detail. From a selected row, `Enter` moves focus into the right panel: the first form field of an
  `embedded` action, otherwise the first control of the brief. `O` opens the owning object only while focus is in
  the Work list/detail navigation, never while typing in an input; the shortcut is discoverable in
  the object-door tooltip and accessible help. Every item has one descriptive
  accessible name combining object, problem and action. Hover evidence is also available by focus
  and tap; colour, initials and icon alone never carry meaning. Focus returns to the invoking row
  after Back; when that occurrence closed, it moves to the next visible row and announces the change.
  After a confirmed completion the row becomes an inline source receipt where the row was, including
  on mobile; it has no timer and remains until dismissal or the next meaningful list action. The next
  row is selected, keyboard focus stays on that row in the list, and Panel 3 shows the next
  occurrence, never the previous occurrence's receipt as if it belonged there. From the selected row,
  `Enter` moves focus into the right panel; `O` opens the owning object.
- Acceptance captures and measures 1440×900, 1180×820, 820×900 and 390×844. It records actual
  canvas/panel widths, overflow, focus order and wrapped action content; a screenshot without those
  measurements is not responsive proof.

The implementation reuses `PageShell`, `Tabs`, `SearchInput`, `Select`, `Button`, `FilterRail`,
`FilterRailGroup`, `FilterRailRow`, `Loading`, `EmptyState`, `Badge`, `Tooltip` and Lucide icons.
Status text that must wrap does not use the truncating `StatusPill`. A shared `Avatar` must first
govern one initials algorithm plus full-name hover/focus/tap behaviour; Work may not choose among
page-local avatar recipes. The only page-specific pieces permitted are `WorkSplitShell` (geometry), `WorkDayNav`
(provided dates/counts), `WorkActionRow` (presentation) and `WorkActionPanel` (the §5.10 summary and
host for an admitted owning-module component), and the §5.10 right-panel pieces `PartyCardShell`,
`CustomerCard`, `SupplierCard`, `LogisticsCard`, `WorkOrderRoute` and `WorkOwnerSource`. None calculates business dates, ownership, severity, completion or source health. They are
not promoted into the global kit until a separately governed second use exists.

### 5.6 · Priority, due and SLA law

Workspace does not store a free-form priority or invent one global SLA. Severity is derived in this
order from module truth:

1. `Broken commitment` — an explicit customer, supplier, payment or delivery promise is past and
   its completion fact is absent.
2. `Missed` — the governed working day is before today on that rule's calendar.
3. The selected calendar-admitted working day, with `Today` marked explicitly only when today is a
   working day for that action's authoritative calendar.
4. A later working day in the selected or a later week.
5. `No date` — the module explicitly admits an obligation with no lawful clock.

Materiality (`Routine` · `Significant` · `Critical`) belongs to the owning module and may raise
attention within the same timing band; it cannot turn an undated item into late. A blocker is an
orthogonal fact and never lowers severity. The displayed due date is the module's due fact; the
displayed working-days-late value is calculated with the same snapshotted calendar/rule. Changing
an SLA changes future obligations unless the owning module explicitly versions existing ones.

Calendar eligibility requires a named source for both the owning module calendar and the resolved
person's working days. Current hard-coded role calendars are insufficient to claim personal
Saturday eligibility. Until People/HR supplies that person-calendar fact through the Shared Duty
Resolver, the feed exposes a calendar-health gap and must not silently assume a default or fabricate
missed age.

System automation that should have happened immediately is a source/integrity failure, not a fake
person task. Supervisory escalation is a notification/management receipt derived from the same
identity; it never changes the owner, due date or completion fact.

### 5.7 · Work current → proposed gap audit — 2026-09-14

| Current branch evidence | Required Blueprint state |
|---|---|
| My Work / Team Work use one server-composed open feed | Retain; make all admitted modules use the same transport contract and source health |
| My Work defaults correctly and Team groups by normal owner | Retain; add complete cover/handover and unresolved-Duty evidence everywhere |
| The Right Rail My Work slot (HF-3, 2026-09-17: one identity, one focus day `workFocusDay`, one `Missed` + `Today` count `myMissedAndToday`) is built and still mounted | Retire it under §7 (owner 2026-09-24); Work keeps the one identity, focus day and count; all supported filters stay URL-visible |
| Current main Work page has scope toggles and limited time filtering | Add governed search, visible filter controls, module/owner/cover/blocker/source filters and no-match state |
| Current rows show object, problem, action and due; Delivery/Warehouse show required result | Make required result accessible on every item and visible whenever completion would otherwise be ambiguous |
| Current rows use truncation on narrow content | Replace with wrapping under 1024px; prove object/problem/action/result/due remain readable at 390px |
| Current source composition is one all-or-nothing read and the item shape omits parts of §5.2.1 | Build the permission-scoped feed envelope, isolate source failures, distinguish true empty from no match and preserve governed last-safe observation |
| No completed/history surface exists in shared Work | Add read-only history only after durable source result/actor evidence can support it; never synthesize Done rows |
| Warehouse external queue and acceptance exist on the pending branch | Complete identity/offboarding/transfer guards and production proof before admission claim |
| Service Case is absent; Bell remains a duplicate legacy queue | Keep Service Case excluded until owner/date laws close; replace Bell only with durable transition receipts |

### 5.8 · Work acceptance contract

Work is ready for owner acceptance only when all are demonstrable:

- every admitted source rule in §6.1 produces one stable identity and source completion removes that
  identity without a manual Done act;
- My Work and Team Work use one authorised response and one cache identity;
- every returned occurrence and admitted-source health record satisfies §5.2.1; one failed source
  leaves healthy-source actions usable and cannot be rendered as a complete or zero set;
- normal owner, cover, acting person, `Not assigned` and actual completed actor remain
  distinct across assignment/cover changes;
- broken commitment, missed, weekday, conditional Saturday, holiday and no-working-date examples order once under
  the governed working-day law;
- blockers retain the original working day and missed age, and source failure cannot reduce or clear
  any count;
- search and every filter in §5.3 combine, serialize to the URL and restore through Dashboard and module doors
  deep links without broadening permission scope;
- every row exposes object, fact/problem, concrete action, recipient when applicable, required result,
  due/late fact and exact owning door without repeating owner/object in sentence prose;
- first open shows `Missed` followed by the actual current or next eligible governed weekday/date,
  names a public holiday and never duplicates an occurrence or hides the complete working week;
- the `Date` section counts the visible week and prints no zero; `All modules` equals the Panel 2 row
  count before the module choice and the module rows sum to it; the heading reads `Missed {n} · {weekday, date} {n}` (single day `{weekday, date} {n}`);
- Panel 2 orders `BROKEN COMMITMENT` → `MISSED` → selected day; a broken commitment has a red group
  heading and red row edge with no badge and still counts once under its own working day; a blocked
  job stays in its own group with `Blocked by {dependency}`;
- rows are at least 64px and never truncate; after a confirmed completion the receipt stays in place,
  the next row is selected with focus on it, `Enter` moves into Panel 3 and `O` opens the object;
- at a 768–1103px canvas Panel 1 plus one work column shows; choosing a job replaces the column and
  `Back to work` returns focus to the same row;
- a communication job renders only the owning module's `Open WhatsApp group` / `Open WhatsApp` /
  `Copy message` controls and records nothing when they are used;
- each occurrence's interaction mode is explicit; an embedded action uses the owning component/API,
  refuses stale source versions, is idempotent, preserves permission/cover evidence and disappears
  only after the refreshed feed proves its completion predicate;
- Delivery proof review passes accepted, more-proof-required and rejected results plus permission,
  stale-version, duplicate-submit, uncertain-response, keyboard and next-selection tests before any
  second embedded action is admitted; its primary action is visible at 1440×900 without scrolling;
- true empty, no match, delayed/failed source, permission refusal and read-only history cannot be
  mistaken for one another;
- keyboard, screen-reader and focus-return pass; measured 1440×900, 1180×820, 820×900 and 390×844
  layouts record both portal-sidebar state and actual Work-canvas width and preserve the complete action;
- later holder/cover changes cannot rewrite completed actor evidence. Site-queue race acceptance is
  deferred with Warehouse Outbound and is not a Work v1 acceptance condition.

### 5.9 · Party cards — Logistics · Customer · Supplier (owner rulings 2026-09-24, Logistics BUILT; Customer/Supplier shell only)

When the selected work names exactly ONE Sales Order (a `sales_order` / `delivery_scope` object,
a Delivery Order, or an `SO-{n}` label), the detail column adds one white section per outside
party: **Logistics** (the one card with an approved specification and its own acts), **Customer**
and **Supplier** (the same stable shell, existing facts only, one door to their owner, no new SOP).
A work item that names several orders, or an order Delivery cannot read, draws no party card —
never a guessed `Logistics not assigned`. Loan appears only when a loan record exists (not built).

**THE CARD OWNS NO FACT.** Every write goes through a Delivery-owned component or door; the one
arithmetic is `logisticsCardModel` (`packages/shared/src/logistics-card.ts`); the order's Delivery
facts come from the Monitor card's own builder (`delivery-scope-card.ts`), the rest from Delivery's
`GET …/delivery-arrangements/:orderId/logistics-card`.

#### Collapsed — at most five facts

```
Logistics · AL Logistics                         Checks 1 of 3   ▾   ← heading 15/20/600
Call AL Logistics                                  ← the ONE current action (14/20/600)
Get the scheduled delivery date · due 24 Oct       ← result · due (12/16/400; red once missed)
Scheduled delivery · 27 Oct                        ← only when scheduled; time only when recorded
⚠ Hold delivery · RM 1,250.00 unpaid              ← ONE exception, only when it affects delivery
```

**Party-card type — owner density ruling 2026-09-25 (typography only, the cards are not
redesigned):** party heading 15/20/600 · current action 14/20/600 (13/18/600 below 768px) · secondary fact 12/16/400 ·
section label 11/14/600 uppercase · check row 13/18/400 · history row 12/16/400 · button 13/18/500,
at least 36px tall (40px below 768px). Customer and Supplier headings use the same 15/20/600.

`Logistics not assigned` replaces the heading when no company carries the delivery. Requested
date, PO, GRN, DO, money-in-general and the check rows never sit on the collapsed card.
Exception precedence: `Cannot deliver` → Finance hold → money owed → the first day-before gap.

#### Expanded — in this order

1. **Current action** — the act, its result and due date; the Delivery-owned door opens IN PLACE:
   `Assign logistics` / `Change logistics` (Delivery's `LogisticsDetailsEdit`), `Record scheduled
   delivery` (Delivery's `DeliveryDatesEdit`), `Create link` or `Copy message` for the contact step;
   `Open in Delivery` beside it. Work draws no form of its own.
2. **Checks** — the three fixed rows (below).
3. **Scheduled delivery** — `Requested delivery` · `Scheduled delivery` (`Not scheduled yet`) ·
   `Delivered` once recorded. Words, not identical calendar icons, tell the three dates apart.
4. **Assignment** — the company, and whether it answers in its own portal or through the external
   link; `Change logistics`.
5. **Stock route** — read-only summary (below) with `Open Purchasing`.
6. **External link** — the link state table (below).
7. **Communication** — the prepared message (customer reference first, never the SO number; the
   current link inserted), `Copy message`, `Open WhatsApp group`, and the reminder that copying or
   opening WhatsApp confirms nothing.
8. **Evidence and recent history** — three-rank lines; a link actor reads `{company} via external link`.

#### The three checks

Anchor: the **Scheduled delivery** date when recorded, else the **Requested delivery** date,
counted back on the Delivery week (Mon–Sat + Malaysian public holidays). Screen labels only —
internal keys `t3 · t2 · t1`.

| Check | Done when (a stored fact) | Not due | Due / missed | The action |
|---|---|---|---|---|
| `3 working days before · {date}` | a company is assigned AND it has the details: a portal company is assigned, the link page rendered, the company answered, or Operation recorded its reply | `Opens {date}` | `Details not received yet` (red once missed) | `Assign logistics` from the day the PO is issued (never red until this date) · then `Contact logistics` → `Contact logistics today` on/after the date |
| `2 working days before · {date}` | a Scheduled delivery date is recorded (time optional) | `Opens {date}` | `Not scheduled yet` · `No answer` once missed · `Requested another date · {date}` · `Cannot deliver · {reason}` | `Call {company}` / `Get the scheduled delivery date` · `Call the customer` / `Agree {date} …` · `Decide the next step for this delivery` |
| `1 working day before · {date}` | on its date, NOTHING is missing — then it shows `Nothing missing` and creates no call | `Opens {date}` | one line per gap: DO gate (`Goods not ready`, `Delivery Order not issued yet`), pickup/handover (`Not received at {site} yet`, `Driver and vehicle not recorded`, `Condo registration not recorded`), money (`Hold delivery · RM {amount} unpaid`, `Hold delivery · Finance hold · {reason}`) | only a gap that logistics can close carries an act (`Ask {company}` / `Record the driver and vehicle`); Payment, Finance and Warehouse gaps are facts with their owner's door |

A check whose date was already behind the day the order proceeded is `Passed before this delivery
started` (Q3: no impossible past step); the nearest still-possible check carries the action. A done
or missed check keeps the date it had.

**Reschedule example** (requested Tue 27 Oct): checks Fri 23 · Sat 24 · Mon 26. AL saves Scheduled
Tue 27 on Thu 22 → the first two are done, their dates kept. On Sat 24 AL moves it to Thu 29 → the
two done checks still read 23 and 24 Oct; `1 working day before` moves to Wed 28; the collapsed card
reads `Scheduled delivery · 29 Oct`. Had the 2-day check been missed on Sat 24, it would keep
`2 working days before · 24 Oct` in red with `No answer`.

#### The three stock routes (Purchasing / Stock own them; Work reads them)

| Route | Derived from | Event chain | Logistics responsible from |
|---|---|---|---|
| `Pickup from Carres Klang Warehouse` | `Supplier Deliver To` → a Site of kind `own`, or Units reserved at an own Site | PO → supplier delivers + Supplier DO → GRN at Carres Klang (Goods Received Date) → pick · check · pack → Outbound `Warehouse loaded` + `Driver collected` | `Driver collected` |
| `Pickup from supplier` | **NOT DERIVABLE YET** — no Purchasing fact records "logistics collects for the customer" | PO → supplier prepares + Supplier DO → `Collected from supplier` (APPROVED TARGET / NOT BUILT) — no GRN | `Collected from supplier` |
| `Supplier sends directly to logistics` | `Supplier Deliver To` → a Site of kind `Logistics transit point` (AL Sungai Buloh, HOUZS Balakong, HOUZS Penang — 0509's `operation_partner`): the Logistics company's own point, never a Carres warehouse (Stock §5, owner correction 2026-09-25) | PO → supplier delivers + Supplier DO → that Site's Inbound receipt/GRN → the Site's own outbound to the customer | the Site's receipt |
| `Supplier delivers to the customer` (Ohana) | a destination with no Site | a separate route, outside the three; not solved by this card | — |

#### External link states

| State | Shown | Acts |
|---|---|---|
| Portal company (NETS) | `{company} answers in its own portal.` | none |
| No company | `Assign logistics first.` | none |
| No link yet / revoked | `No link yet` · `Link revoked · {date}` | `Create link` (one button per card: the contact step's action carries it) |
| Active | the link · `Created {date} · {name}` · `Opened by {company} via external link · {date}` / `Not opened yet` | `Copy link` · `Revoke link` |
| Company changed | the old link is revoked automatically (`logistics_changed`) | `Create link` for the new company |

#### Source of truth

| Fact | Owner | Work's treatment |
|---|---|---|
| Company, Scheduled date/time, driver, vehicle, condo registration, answers, link | Delivery (`ops_delivery_arrangements`, `…_events`, `ops_delivery_partner_links`) | read; written only through Delivery's components/doors |
| Requested delivery, customer, address, building | Sales Orders | read-only |
| Stock route, PO, Supplier Deliver To, PO Delivery Date | Purchasing | read-only; `Open Purchasing` |
| GRN / Goods Received Date, Unit Site | Receiving / Stock | read-only |
| Money owed, Finance hold | Payment / Finance | fact only, from its clock (2 working days KV, 3 outstation) |
| DO | Delivery (system-issued) | fact only |
| Checks, current action, exception | derived — never stored | `logisticsCardModel` |

#### 390px order

The collapsed card first (company · action · checks · scheduled · exception), then Customer and
Supplier collapsed. Expanded, the eight sections stack in the order above in one column; buttons
keep kit geometry and wrap; a long link wraps inside its box; no sideways scroll (measured 0px at
1440 · 1180 · 820 · 390, `docs/evidence/workspace-work/logistics-2026-09-25/`).

#### Gaps for later architecture work (not built)

1. `Collected from supplier` — a Stock custody event (PO/source lines · supplier · company · date and
   time · qty · Supplier DO or collection evidence · source · actor), the Purchasing fact that
   selects the route, and the DO gate reading it instead of a reservation.
2. Receiving at a partner Site — who records AL/HOUZS receipts (the partner, through the link or a
   login, or Operation on its behalf) and the Site receiving authority (Stock MASTER open item);
   non-Site partners (TT, TEOW, EU, SSY) need location ownership before any receipt exists.
3. Which delivery requirement makes a time mandatory (building types) — its own missing item.
4. The Delivery Order download through the link — the governed DO prints `SO No`, which the link may
   not show; decide the paper or the rule.
5. The legacy Orders booking door (`ops_order_control`, `/operation/old-orders` →
   `/:id/booking/confirm`) still requires a time slot for leg 0 and writes only
   `ops_order_control.confirmed_date`. Since 2026-09-25 the Work feed reads Delivery's arrangement,
   so a booking made through that door does not close `confirm_delivery_date`. Retire the door or
   make it write the leg-0 arrangement; converge the whole-order DO issue onto the arrangement.
6. Closed 2026-09-25 (owner decision): the Work feed's `confirm_delivery_date` reads Delivery's
   arrangement (leg 0) as the booking and is due on the Logistics card's `2 working days before`
   check through the one `logisticsCheckDueIso`.
7. The Ohana supplier-to-customer route.
10. Closed 2026-09-26 (owner yes, Delivery segment 3): the Work items `Record the delivery result`,
   `Upload the delivery photo`, `Upload the signed DO` and `Check the delivery proof` deep-link to
   the Delivery Orders register with that document's row revealed and its brief open (Delivery
   §8.7), the way Delivery arrangement items reveal the Monitor row — never to a separate page;
   the proof-review form Work embeds stays the same component.
9. Closed 2026-09-25 (owner yes, Delivery segment 1): the Work feed's `logisticsAssigned` reads
   Delivery's arrangement (`ops_delivery_arrangements.partner_id`, leg-aware) — never the `orders`
   columns alone, which stay a fallback until retired; the Logistics card's progress line reads the
   same `deliveryWorkStatusOf` as the Monitor register and its words (`Scheduled` · `Transfer
   scheduled` · `Collected by {company}` · `On the way to customer` · `Delivered to customer` · `Ask
   {company} for the result`); one delivery-day reader (`confirmedDeliveryOf`: DO → arrangement →
   legacy booking) serves the rail Calendar, Monitor and the Work feed.
8. **Two contact days — owner ruling 2026-09-25 (Jess: keep both).** They are two different facts,
   never merged and never printed with the same words:
   - **`3 working days before`** the promised date (Orders Card 3 `T−3`, the `chase` lead
     `logistics_call_working_days`) is the day the customer is **contacted** — the Delivery work list,
     Monitor and the Orders booking brief show it as the contact day.
   - **`2 working days before`** (the Logistics card's check, `logisticsCheckDueIso("t2")`) is the
     deadline by which the **Scheduled delivery must be recorded** — Work's `confirm_delivery_date`,
     the Route's `Contact` point and the Logistics card show it as that deadline.
   A surface that shows either day names which one it is; neither is relabelled as the other.
   **9 Oct 2026 (BUILT ON BRANCH `build/settings-completion`):** the first check counts the stored
   Contact lead (`logistics_call_working_days`, DEL-05) and prints its number (`{n} working days
   before`, the ruled `3 working days before` at the default); `2` and `1` stay fixed, and
   `confirm_delivery_date` stays on the fixed 2-day check. `Assign logistics` is due by Delivery
   §2.1's stored assignment lead before the Scheduled delivery, else the Requested one; the PO day
   only opens it.

### 5.10 · THE WORK PAGE — ONE SPEC · APPROVED / LOCKED (Jess, 2026-09-28: "yes" to 定 and to the four kit admissions)

**LOCK RECORD — 2026-09-28.** Jess answered "yes" to "reply 定 to lock, kit ok to admit the four kit
pieces". What is locked is the CURRENT truth written in the revision-13 onward bullets of A7 below
(stop cards, acts first, checklist marks, content from authority, BUILD SHEET values); earlier
revision paragraphs that those bullets overwrite are history and must not be built. **Kit admissions
approved:** Route stop · Checklist row · Quiet route row · `Block` moved into `components/kit/`; each
joins the kit with its `/ui` example and its UI MASTER entry in the build that first draws it.
**Reference (evidence, not authority):** `docs/workspace/work-reference/prototype.html` and
`work-1440.png` · `work-1440-form-open.png` · `work-1023.png` (SO-1333, test data, 2026-09-28).
**Still owed after the 2026-09-28 build:** (a) The feed raised `purchasing.confirm_tomorrows_delivery`
for a PO whose current version has no send mark, while Purchasing §5.7 hides the supplier-answer
section until the PO is sent — FIXED at source by the Purchasing chat in PR #1707 (2026-09-28: the
day-before check derives nothing until the current version is marked sent); once #1707 is on main,
SO-1333's POs owe only the PO window's send line. (b) A PO window row still draws the earlier PO window
panel (its send form is the card layout with recorded channels only, no free text); moving it onto
the stop-card grammar is the next Work slice. (c) The Warehouse tab has no governed message yet
(`Message not available`). (d) The A3 PO view's related-order line prints SO No · customer ·
Requested date; its `Scheduled` date and delivery status are not yet read.
**Still owed, not locked:** the rail group titles' 11px supporting lines (words need owner approval);
the phone layout below 900px (its own round); the Sales Orders Order Route conflicts (`Waiting for purchase`,
`Confirm ready date`) are agreed and fixed in PR #1695 by the Sales Orders chat — the Route now reads
`po_sends`, acts `Send {PO No} to {Supplier}` until the current version is sent, and SUPPLIER's day-before
act is `Ask {Supplier} for the Supplier DO for {PO No}`; the build re-tallies once #1695 is on main.
**BUILT 2026-09-28 (branch `build/work-listing-table`; NOT merged, NOT deployed — merge waits for
the owner's OK in the build chat).** The desktop page for real orders from the Work feed and the
owning modules' components. **Acceptance, re-stated from real data (the build found the SO-1333
example false, agreed with the spec chat 2026-09-28):** SO-1333's two POs are SHARED —
`PO-20260903-4316` serves 9 Sales Orders and `PO-20260903-7907` serves 14 (SO Batch lineage, read
2026-09-28) — so by A3 no PO act belongs on SO-1333. The acceptance is therefore: (1) acts first,
measured on the real feed acts of the signed-in owner; (2) one order that carries an order-level act
(SO-1333, `Assign logistics`, Team Work); (3) one shared PO in the A3 PO view with `Related orders ·
{n}`; plus the BUILD SHEET values at 1440 / 1180 / 1023 / 919, no free-text send record, no page
scaling, only the owning form's primary button blue, every word in COPY-STANDARD ("The Work page
words"). **Measured 2026-09-28 on the SO-1333 replay preview (the real reads, test data):** columns
280·804·340 (1440) · 240·624·300 (1180) · 220·507·280 (1023) · 220·403·280 (919); no sideways scroll;
body 13px; buttons 36px; column title rows 64px; quiet rows 48px; card title 15/600; rail rows
14/400; the act's card on the first screen at every width; the four Communication tabs on one row
at every width; no status cut (a quiet row wraps below 1100px).


**Why this section exists.** Four days of Work design were done by rebuilding the live page round
after round, with three planners editing at once. Jess agreed (2026-09-27) to stop: one written
spec, her decisions on its open points, then ONE chat builds all of it and shows it once with a
checklist. Revisions 2 to 5 carry her corrections of the same day, made on the design images
(output/shots/whole-v4 … v12). Nothing here is law until she says
"定"; the shell and the Inbox rulings above are already hers.

**A · The page (settled direction, revision 5 wording).**
1. Three columns: Inbox 280 · Mission (rest, ≥560) · Communication 340; narrower and drawer rules
   as in "THE WORK SHELL" above. The global right rail is separate and not in this build.
2. Inbox: one row = one act (76px, three lines); Missed first on open; one date choice at a time.
3. **What the Mission's top shows.** The top is ALWAYS a summary of the record the act belongs to,
   and no step detail ever replaces it:
   - an act on a Sales Order, or on anything that resolves to exactly one Sales Order (a Delivery
     Order, a delivery scope): that order's **Order Route**, whose Proceed step carries the
     order's facts (A4);
   - a PO-level act whose PO serves **exactly one** Sales Order and carries no stock purpose: that
     Sales Order's Route, with the `PO` point chosen and that PO chosen inside it;
   - a PO-level act whose PO serves **two or more** Sales Orders, or stock: the **PO header** (no
     Order Route — choosing one order's Route would be a guess) and, under it, the PO detail and
     `Related orders · {n}`, one line per order: `SO No · customer · Requested {date} · Scheduled
     {date or Not scheduled} · {Customer delivery status}`. A stock PO reads `For stock` instead.
     The act stays ONE Work occurrence on the PO; it is never copied onto each order. Pressing a
     related order shows that order's Route in the Mission with the `PO` point chosen and
     a `Back to {PO No}` line above it; it creates and completes nothing.
   Source of "which orders": the PO's own source-order record (`so`, `so_refs` and the per-line
   `po_line_sources`, 0382) and its purpose (0361) — the same facts the PO PDF's `SO NO` column
   prints. Work never infers orders from goods or suppliers.
4. **No Order header (Jess, 2026-09-27: "header remove … order route start from Proceed").** The
   Route starts at the top of the Mission. Proceed carries the Sales Order's minimum facts from the
   SO PDF: the SO No (its document link, A7) · `{Customer} · {area}` · `Requested delivery {date}` ·
   `Order Total RM {amount}`. No status tag sits beside the customer (a `Missed` there read as "the
   customer missed"); a status sits only on the step it belongs to. A PO serving several orders, or
   stock, keeps a two-line PO header: `PO No · Supplier` / `PO Delivery Date {date} · Expected
   arrival {date} · Related orders · {n}`.
5. **Revision 3 (Jess, 2026-09-27: "Yes. This is clearer.") — under the full-width header the
   Mission is two columns.** LEFT (≈264px): the Route as a vertical list — every module always
   visible, in order `Proceed · Loan (only when a loan exists) · PO · GRN · Logistics · Customer
   delivery · Payment (only when it affects the delivery)` — each with its status word and its
   checklist directly beneath. A tick, an open circle or a warning comes from a recorded fact;
   staff never tick anything. More than one module may show an open item. RIGHT: the record panel —
   the exact forms that complete this order's open acts, stacked (A6), and nothing else (it does
   not repeat the order). The Inbox act opens with its item selected; after Save the checklist
   re-reads its facts. The card is the owning module's own
   component in place (for a PO answer, Purchasing's `Record supplier answer` form with its own
   words: `Confirmed` · `New date` · `Split delivery`, the eight governed reasons, `Evidence`,
   `Supplier DO received`, `Save`) — never a Workspace copy. The left column scrolls alone.
   **APPROVED (Jess, 2026-09-27: "good thing is route got date, module title + checklist"):** the left
   column reads as a vertical timeline like her references — the step's date in a fixed left
   column, a dot on one line (solid where done, dashed ahead), the module title with its status on
   the right, and its checklist beneath, each item one title line plus one grey line. Colour and
   order follow A6. No boxes between modules — the line and white space separate
   them.
6. **Order of work, one meaning per colour (Jess, 2026-09-27: "又有红又有蓝，没有让我知道先要做什么").**
   Every open act of the signed-in person on this order carries a mark on its checklist item: a red
   `!` when missed, an amber `!` when due (Jess, 2026-09-27: "confused the numbering work?" — the
   1, 2, 3 badges were removed because they did not read top to bottom). The first missed act in
   Route order opens by itself.
   **One page, no paging (Jess, 2026-09-27: "why working record panel need turn to next? i want
   one page"):** the record panel lists every open act of this order at once, stacked in number
   order, each headed by its number badge and title with its owning module's form beneath. The act
   being worked carries the 3px blue edge and drives Communication's tab; pressing a Route item
   scrolls to its form; after Save the act leaves the list and the rest renumber. Red = missed; amber = due on the chosen day (`Due {date}`, PROPOSED); blue
   = only the one item open now (pale-blue wash, 3px edge) and the card's primary button. An open
   item owned by someone else is grey, unnumbered, and names its owner (`No PO yet · {owner}`).
   Done is a dark tick; waiting is a hollow circle. Step dots are dark when done, red when missed,
   grey otherwise; there is no larger "current step" dot.
6a. **Five adaptations from the ChatGPT order-desk prototype (Jess "ok", 2026-09-27).** Ours stays
   the base; these five are added:
   1. The Communication pane follows its layout: `To` is a select (the party's contact or group),
      `Template` a select with the message shown beneath, the doors in one row — WhatsApp and Email
      as ICONS plus `Copy message` — then History, folded to one line `History {n}` and opened on press. The owning
      module's form is the Mission card, so the pane shows no answer door while it is open (Jess,
      2026-09-27: "history can hide").
   2. **Every fact appears once (Jess, 2026-09-27: "every module why repeated … no use word").** The
      Route carries the facts; the action area under it carries only its title and the owning
      module's form, never a fact the Route already shows (no `Why` rows, no party line). An item
      line never repeats its step's date. A step's items state that step's own fact (a PO item says
      `Confirmed`, never GRN's `Received`), and GRN lists only goods that have a PO; nothing is
      given a guessed date.
   3. No grey line under each step: the step name already says what it is (the proposed
      `Sales Order` / `Supplier confirmation` / … lines are withdrawn).
   4. `Missed {n}` and `No date {n}` under the Inbox month are two pressable boxes, not text rows.
   5. Delivery first, money last: with no Order header (A4) the Requested date sits on Proceed,
      the Scheduled date on Customer delivery and the balance on the Payment step
      (`RM {amount} unpaid` / `Must be paid by {date}`), the money only while owed.
   6. **All white, no card in the Mission (Jess, 2026-09-27: "it should all white base. remove card
      at middle").** The Mission's right side is white like the other two columns, with no border,
      shadow or grey panel; the column rule alone separates it. `Done` is grey; the only meaning
      colours are red, amber and blue (A6).
   Not taken: grouped multi-act inbox rows, a Route without dates, the SO number in an outside
   party's message, `No working date`, `Create delivery link`.
7. Document facts use the document's own words and values (Sales Order PDF for Proceed; PO PDF for
   PO: `PO Doc Date`, `PO {n}-Day Delivery Date`, `Deliver To`, `Delivery Method`). A missing fact
   prints `Not recorded`; nothing is guessed. **Every document number appears once, on the Route**
   (Jess, 2026-09-27: "doc no all show at order route there, dont repeated every where"): SO on
   Proceed, each PO on its supplier's PO item, each GRN on its received item, the DO on Customer
   delivery. It is underlined in ink, and the underline alone says it can be pressed; there is no
   `↗` icon. Pressing it opens that document's official PDF as paper in a sheet over the page
   (`Print` · `Download` · close; Esc closes; the page stays where it was), painted by the existing
   `usePdfCanvases`. The card title, the Communication pane and the Inbox never repeat it as a link
   (the Inbox's line 1 stays plain text). `Expected arrival` (the
   supplier's newest date) prints beside the PDF's `PO Delivery Date`, never instead of it.
8. Communication has one tab per outside party on the Route, always there, in Route order:
   `Supplier` · `Warehouse` · `Logistics` · `Customer` (Jess, 2026-09-27: "communication should got
   warehouse, every module"). The item open picks the tab: PO → Supplier · GRN → Warehouse ·
   Logistics → Logistics · Customer delivery and Payment → Customer. Proceed is internal and picks
   none. Copying or opening WhatsApp completes nothing.
7. **REVISION 12 · THE CARD BLUEPRINT — built from the module acts (Jess, 2026-09-28: "your job to
   plan and blueprint what to do, check with every module what mission and show").** Order header as before. Under `Order Route · To do {n}`, one stop per module in Route order
   (`Purchasing · Receiving · Warehouse · Payment · Delivery`); the line joins modules only.
   - **Card = the Sales Order `Block`:** white, 1px `slate-5` line, 6px radius, 12/16 padding.
     Every module has at least one card.
   - **A card with work:** title (15/600, black) = WHAT TO DO, the act's own row line from
     COPY-STANDARD; line 2 = WHY (13px, red when missed, amber when due today); a hairline, then
     the facts in grey (document link · goods · Deliver To). The owning module's button sits at the
     top right as an outline button. Pressing it opens that module's form INSIDE the card, laid out
     like the SO info grid (label over a bordered field, three per row, white). **The only blue is
     the primary `Save`** (and document links). Save closes the form; nothing opens by itself.
   - **A card without work:** title = the module's current state (`Not received yet` ·
     `RM {amount} unpaid`); facts under it; no button.
   - **Which cards carry work = the Work feed registry (§5.2.1), never invented:**

     | Module act (registry) | Card title (COPY row line) | Why line | Button (owning form) |
     |---|---|---|---|
     | `purchasing.supplier_date_passed` | `Ask {supplier} when the goods will arrive` | `The supplier delivery date passed on {date}` | `Record supplier answer` |
     | `purchasing.confirm_tomorrows_delivery` | `Ask {supplier} for the Supplier DO or confirmation for {date}` | `Confirm tomorrow's supplier delivery` | `Record supplier answer` |
     | `purchasing.confirm_balance_delivery_date` | `Ask {supplier} for the balance delivery date` | `The balance delivery date is missing` | `Record balance date` |
     | `receiving.check_in` (physical receipt scope only; approved target 2026-10-04, not built) | Use the actual receipt action from Receiving | Physical receipt needs confirmation or has a named validation blocker; a passed supplier date alone is not receipt evidence | Owning Receiving form; valid Warehouse confirmation posts automatically |
     | `delivery.assign_logistics` | `Assign logistics` | The recorded assignment deadline from Delivery §2.1; the lead is configurable, never a fixed `3` in the view | `Assign logistics` |
     | `delivery.confirm_delivery_date` | `Call {logistics}` | `Get the scheduled delivery date · due {date}` | `Update date and time` → `Save scheduled delivery` |
     | `delivery.deliver_today` | `Deliver on {weekday, date}` | — | `Record Delivery Result` |
     | `payment.collect_customer_balance` (only once a Scheduled delivery sets the deadline) | `Collect RM {amount} from {customer}` | `Payment must be complete by {date}` | `Record payment` |

   - **Measured on real data 2026-09-28 (overwrites the earlier SO-1333 example):** the live feed
     holds `purchasing.confirm_tomorrows_delivery` on both SO-1333 POs (owned by the PO Duty holder)
     and `assign_logistics` on SO-1333 (its PIC). Both POs are shared (9 and 14 orders), so their
     acts show in the A3 PO view, never on SO-1333. `assign_logistics` was an engine defect —
     the feed read only the order row's legacy company columns while Delivery's leg-0 arrangement
     names NETS; fixed in the same build (the feed now reads the arrangement's `partner_id`), so
     after deploy SO-1333 carries no act and shows its Route facts only.
   - **Placement rules for the build (spec chat, 2026-09-28):** (1) counts count OCCURRENCES, never
     POs — a PO window with two unsent POs for one order is ONE task on that order's row;
     (2) an act shows under a Sales Order only when its PO is sourced from that order ALONE (SO
     Batch lineage); a PO serving two or more orders (or stock) opens the A3 PO view, and a PO
     window with demand left to buy keeps its own row. The send act's words are Purchasing's own
     builder (`Send {PO No} to {Supplier}`, the ruled PO No with its version).
   - **REVISION 13 · STOPS = THE SALES ORDER ORDER ROUTE NODES, ONE CHECKLIST FORMAT (Jess,
     2026-09-28: "yes. direction is correct … split to supplier, receiving, etc, what order route from
     sales order do"; "every module step checklist progress is the same").** The
     stops are the orders MASTER node map in its order, under its bands: `GOODS` (`PURCHASING` ·
     `SUPPLIER` · `RECEIVING` · `STOCK`), `DELIVERY` (`LOGISTICS` · `DELIVERY DATE`), `PAYMENT`, then
     `DELIVERY ORDER` · `DELIVER` · `DELIVERY PHOTO`. No `Order Route · To do {n}` row and no
     band labels (`GOODS` …) are drawn (Jess 2026-09-28: "remove order route and to do 4 · remove goods
     word"). The stop label is small grey uppercase (11/500) with `Missed` / `Due` only; the ONE
     progress count is each card's own `{n} of {m} done`, never a second count on the stop ("confused"); the card title (15/600) is what to do,
     else the node's who + object sentence from the resolver (`Warehouse has not received the goods`);
     the second line says why. Every card carries its checklist: a square box per step, ✓ filled when
     done, empty when not yet, red or amber `!` for the step that is the act now, and `{n} of {m} done`.
     A fact (a date that is not a step) is never a checklist row. The DELIVERY ORDER card lists the
     gate's five requirements as its checklist. The payment deadline is the one shared
     `paymentDeadlineOf` (Scheduled delivery, else the Customer Requested Delivery Date); revision
     11's "no deadline until Scheduled delivery" is withdrawn. UI/UX skill rules applied: stop label
     and card title are two ranks; grey text at least 4.5:1 (slate-11); buttons 36px; only Save blue.
   - **Review corrections applied 2026-09-28 (Jess "可以", eight items; verified against authority).**
     (1) A PO whose current version has no send mark shows `Sending not confirmed` and its act is
     `Send {PO No} to {Supplier}` with Purchasing's `PoIssueEvidence` (`PO sent to supplier` records the
     send if it already happened; a missing mark never proves no send, Purchasing §5.6); the supplier
     date-passed act opens only after a send mark (Purchasing §5.7 sent/pending predicates).
     (2) PAYMENT shows the Route's fact `Customer must pay by {date}` (shared `paymentDeadlineOf`,
     Scheduled else Requested), but no collection act until Payment's ask rule admits it (ask day =
     3 working days before Scheduled delivery). (3) A goods line whose `Deliver To` is not a Carres
     Site gets no Receiving card; its route is not derived, so only the destination fact shows.
     (4) STOCK reads `Waiting for receiving` once a PO exists (orders MASTER scenario matrix; the
     resolver on main still prints `Waiting for purchase` — a Sales Orders bug to fix at source).
     (5) Progress counts only steps with completion evidence; a fact is never a row; the DELIVERY
     ORDER card shows its requirements without a second count. (6) Each act keeps its own draft.
     (7) An outside message never carries a missing field; each act uses its own template and
     deadline. (8) A stop with no current work and no fact change (`RECEIVING`, `STOCK`, `DELIVER`,
     `DELIVERY PHOTO` on SO-1333) collapses to one line and opens on press. Result on SO-1333: To do 3.
   - **Rail group titles follow UI MASTER "Rail style C" (Jess asked 2026-09-28 "only title need icon
     or how we standard ui"):** `Attention` and `Module` are group titles with the kit icon (`late`,
     `modules`; 16px, Lucide stroke 2, 8px gap) and 13/600 slate-12 normal-case text; the rows under
     them carry NO icon ("Do not add decorative icons to every filter row"). Style C's one 11px
     supporting line under each title is owed: its words need owner approval before they reach the
     screen.
   - **The layout stays Claude's stop-card version (Jess 2026-09-28: "i want your version … content can
     improve like chatgpt advise, but not bad ui from chatgpt").** No separate `To do` block on top and
     no route of outlined one-liners. The vertical line keeps one stop per node; a stop with an act (or
     facts that matter now) draws its white cards IN PLACE, the act's button on the card and its form
     opening inside it; a stop with no act now (`SUPPLIER` before the send is confirmed, `RECEIVING`,
     `STOCK`, `DELIVER`, `DELIVERY PHOTO` on SO-1333) is one quiet line (node · status · progress ·
     chevron) that opens to its facts, and a stop that cannot start yet shows no empty checkboxes.
     ChatGPT's CONTENT corrections are kept (send-not-confirmed act, no early collection act,
     undetermined route, `Waiting for receiving`, honest progress, drafts, clean messages, channels
     from Supplier Master, no desktop scaling, contrast).
   - **No free text in a send record (Jess: "what is recipient? no free text").** `Channel` lists
     only the channels the Supplier Master records for that supplier (SO-1333: Ohana WhatsApp group
     and email; Nice Future WhatsApp group) and `Recipient` is the fact that follows from it
     (Purchasing §5.6). No recorded channel → the form names the missing contact, no input.
   - **Six fixes 2026-09-28 (Jess "yes"):** the `3 working days before` check is a STEP (§5.9: done
     only when the company has the details), so LOGISTICS reads `1 of 2 done` and is not ticked; the
     four Communication tabs stay on one row; SUPPLIER's line is its own sentence `Supplier has not
     confirmed the ready date`; every text is at least 4.5:1 (calendar, search hint, counts, the SO
     link); a stop's outline takes its state colour (red missed · amber due); a route line carries one
     status and wraps below 1100px instead of being cut.
   - **Widths:** the page never scales on desktop. 1340+ as B2; 1100–1339 rail 240 · Mission ≥460 ·
     Communication 300 with checklist rows stacking the state under the step; 900–1099 rail 220 ·
     Mission ≥400 · Communication 280. Measured at 1440 / 1180 / 1023 / 919: 13px text, 36px buttons,
     no sideways scroll, the three acts on the first screen. Phone (below 900) is its own round.
   - **Acts first (Jess 2026-09-28: "make sure need to do put on top, not scroll down to find what to
     do").** Stops holding an open act come first, in Route order among themselves, with their full
     cards; every other stop follows in Route order as one quiet line. Measured on SO-1333 at 1440,
     1023 and 919: all three acts are on the first screen.
   - **BUILD SHEET — exact values (every number is a token; measured on the prototype 2026-09-28,
     BUILT 2026-09-28).** Reference files: `docs/workspace/work-reference/` (evidence, not authority).
     Built deviations, each for a kit or document law: the card and the quiet row use the kit CARD
     radius (10px), not the prototype's 6 (token values are locked); the header's `Planned production start` is
     the Sales Order document's own planned date (A7), not the hand-off time the prototype printed;
     the Communication tabs are the kit `Tabs` (its selected tab carries the kit's blue indicator);
     the calendar is the Work rail's existing Monday-to-Saturday month grid with each day's count.

     | Part | Kit component (exists) | Exact values |
     |---|---|---|
     | Page columns | `PageShell` + `grid-layout` | ≥1340: rail 280 · Mission ≥460 · Communication 340; 1100–1339: 240 · ≥460 · 300; 900–1099: 220 · ≥400 · 280; never scales; below 900 = phone round |
     | Column title rows | `SectionHeader` | 64px tall, 15/600 slate-12, one bottom line shared by all three columns |
     | Rail | `FilterRail` style C (`workspace-rail.tsx`) + `MonthCalendar` | group title = kit `Icon` 16px + 13/600 slate-12; rows 14/400 + right count, no row icon; ONE blue in the rail (Jess 2026-09-28: "why force to select all module with blue? confusing like select 2"): only the chosen ORDER row is blue-3 + 3px blue edge; a chosen filter (Attention, Module, the day) is the grey chip with bold text like the `My Task` · `Team Work` switch; the month grid prints each day's count UNDER its number (13 over 11/500, 36px rows), today a dark ring |
     | Order header | `DetailShell` header slots | three blocks of two lines: `SO No` link 15/600 over customer 13/400 · `Planned production start` 11/500 over date 13 · `Customer Requested Delivery Date` 11/500 over date 13 |
     | Act card | `Block` (SalesOrderWorkspace; ONE KIT LAW) | white, 1px slate-5, radius 6, padding 12/16, gap 12 between cards; title 15/600 black; second line 13/400 red (missed) / amber (due) / slate-11; hairline, then checklist |
     | Card button | `Button` secondary | 36px, top right of the card; opens the owning form in the card |
     | Form in card | `FieldFrame` + `field-recipe` + `Select` / `DatePicker` | three fields per row, gap 12, label 11/500 slate-11 over a 32px field; white; only `Save` is `Button` primary (the one blue) |
     | Progress | text | `{n} of {m} done` 12/400 slate-11, bottom right of a card; only steps with completion evidence count |
     | Communication | `Tabs` + `Select` + `Button` + `Icon` (`message`, `mail`) | four tabs on one row; To (recorded channels only) · Template · Message · icons · Copy · `History {n}` folded |
     | Document number | link + `PdfPreview` sheet | underlined 12/400 ink; opens the official PDF over the page |

     **ADMITTED TO THE KIT 2026-09-28 (Jess "kit ok") and BUILT the same day — values now live in UI
     MASTER "THE WORK ROUTE KIT":**
     1. **Route stop** — the vertical line with a 24px dot (red `!` missed · amber due · dark ✓ all
        done · grey otherwise), the stop label 11/500 uppercase slate-11 letter-spacing .06em, and
        `Missed` / `Due` beside it; line 1.5px dashed slate-6, solid once done.
     2. **Checklist row** — a 16px square mark, radius 4: filled dark with ✓ (done), empty with a
        1.5px border (not yet), filled red / amber with `!` (the step that is the act now); then the
        step 13/400 (13/600 when it is the act), its value 12/400 slate-11 (red/amber for the act), the
        document link on the right; row ≥30px; below 1340px the value drops under the step. A stop that
        cannot start yet draws its rows with NO mark.
     3. **Quiet route row** — one line 48px: stop label · status 13/400 · `{n} of {m} done` · chevron,
        white with 1px slate-5, radius 6, padding 8/16; outline red / amber when it holds an act;
        opens to the stop's cards.
     4. **`Block` itself** lives in `SalesOrderWorkspace.tsx`, not in `components/kit/`; it must be
        admitted to the kit as the one card so Workspace imports it rather than copying it.
   - **RULING (Jess, 2026-09-27: "workspace is stay here to complete all job"): every act is completed
     inside Workspace; nothing sends the operator to another page.** Each act opens its OWNING
     module's own component in place (Purchasing's supplier answer table, Receiving's receipt,
     Payment's record-payment, Delivery's arrangement), so a save writes the same one record the
     module page writes (ERP-ARCH laws A and C: a door, never a duplicate). Seeing a form never
     grants saving it: without the Duty or permission the form shows, Save is disabled and says why.
7a. **ONE Route format (Jess, 2026-09-27: "order route now messy and untidy … proceed is title,
   then expand checklist … we should set format").** Every step is the same title row: date · dot ·
   step name · the step's own document number when it has exactly one (Proceed's `SO No`) · status
   on the right · a chevron. Pressing the title opens or closes its checklist. A step opens by
   itself only when it holds an open act of the signed-in person; every other step shows its title
   alone. The checklist is one line per item in three aligned columns: **what** (party or fact
   name) · **its state** · **its document** (underlined, opens the PDF). No item takes a second
   line. Proceed lists only `Customer`: the money lives on Payment and the dates on Customer
   delivery, never repeated. Example: PO → `{supplier} · Confirmed · {PO No}` /
   `3 {supplier} · Not confirmed · {PO No}` / `{supplier} · No PO yet · {owner}`.
7a-i. **The Logistics step lists its three checks (Jess, 2026-09-27: "logistic check blueprint, it
   should before 3 days need call. show t1, t2, t3"),** read from §5.9 "The three checks" and
   Delivery §5.2, never re-invented. Screen words are the governed labels, never `T1/T2/T3`. The
   Logistics checklist gets a date column: `AL Logistics · Assigned` · `3 working days before · {date}
   · Details not received yet` · `2 working days before · {date} · Not scheduled yet` · `1 working day
   before · {date} · Opens {date}`; on its date the 1-day check lists one line per gap (`Goods not
   ready` · `Hold delivery · RM {amount} unpaid` …). Dates count back from the Scheduled date, else
   the Requested date, Mon to Sat with public holidays; a done or missed check keeps its date. One
   `Record scheduled delivery` save closes the 3-day and 2-day checks together. The Route needs
   ≥500px for this row to stay one line (B2).
7b. **Route and To do say the same words; open work cannot be folded (Jess, 2026-09-27: "order
   route not tally the to do 1 2 3 title … once done can hide and expand, before complete, cannot
   hide").** Each To do item opens with a two-line summary header: line 1 = the number and EXACTLY
   the Route item's words (`① Delivery details · Not received`), line 2 grey = `{step} · {the owning
   form's name}` (`Logistics · Record scheduled delivery`); the form follows. A Route step holding
   an open act and every open To do item stay open and show no fold arrow. After Save the item
   moves to the end of To do as one line (`✓ Delivery details · Received` / `Logistics · Saved`),
   which opens on press to show what was recorded; its Route step then folds and can be opened.
8a. **One title per panel, one row (Jess, 2026-09-27: "we need align each panel got one title like
   communication but not too big font size").** Every column opens with the same 48px title row,
   14px semibold, aligned across the page: the left column's `My Work` · `Team Work` switch ·
   `Order Route` · `To do {n}` (the record panel: this order's open acts) · `Communication`.
   PROPOSED: `To do` is the rail's governed Status word, reused as the panel's name.
8b. **The left column copies the ChatGPT order-desk rail (Jess, 2026-09-27: "i want the left nav
   rail, follow" / "i asked you copy").** Top to bottom: search and `Filters` · the month · the Mon
   to Sat grid with each day's count printed under its number (today ringed, the chosen day a
   grey chip, never blue; a past day's work counts once, under `Missed`) · `ATTENTION`: `! Missed {n}` ·
   `○ No date {n}` · `MODULE`: `All modules {n}`, then the list, then `Sales Orders` ·
   `Purchasing` · `Warehouse` · `Delivery` · `Payment`, each with its icon and count. **The list
   is one row per order** showing only the SO number and right-aligned numeric task count
   (`SO-1333` / `2`; owner correction 2026-09-28). No customer name, `actions` suffix, or repeated
   `Missed` status appears in the row; Attention already supplies the selected status. Counts retain
   the selected Attention/day and module scope. The order row opens directly under
   the chosen module, and it overwrites the earlier one-act-per-row Inbox ruling: the order's acts
   are the numbered `To do` list (A6). A chosen row is the pale-blue wash with the 3px blue edge.
   Kept from Carres law against the prototype: `No date` (not `No working date`) and no count on a
   past day. The icons are placeholders until the kit supplies them.
8c. **Names (Jess, 2026-09-27: "work change to Workspace … My Task, Team Work").** The page title
   is `Workspace`; the scope switch reads `My Task` · `Team Work` (replacing `My Work`). COPY entry
   owed on lock. There is no per-person tab (no `Jess` tab): an approval request is a Work
   occurrence owned by the person holding the approver Duty (§§3–4: Purchasing Approver, Payment
   Approver, Finance Approver and the others), so it arrives in that holder's `My Task`. STILL A PROPOSAL (not covered by the 2026-09-28 lock) /
   NOT LAW: an ATTENTION row `To approve {n}` for the signed-in person's approval occurrences, so
   an approver finds them in one press.
9. No dash on any screen; one blue; 12 / 14 / 16 / 20 type only; no icon beside every fact. The
   live Logistics templates (`wa-templates.ts` `buildLogisticReminder` / `buildLogisticChase`) still
   print `—` and `today`; the build removes both.

**B · Decisions (revision 2).**
- **B1 · AGREED WITH CORRECTIONS** — as A5.
- **B2 · SIZES (revision 7)** — three columns: rail 280 · Mission (rest, ≥720: Route 220 + To do)
  · Communication 340; each column fills the height and scrolls alone; Communication is always its
  own column. Narrower than 1340 the whole page scales down to fit (never stacks, never scrolls
  sideways). The left rail is never hidden.
- **B3 · AGREED IN PRINCIPLE.** Purchasing owns the template; its fields come from the real PO.
  Proposed wording (Jess 2026-09-27):
  `Hi {supplier},` / `Please confirm whether {PO No} will be delivered to {Deliver To} tomorrow,
  {date}.` / `Please send the Supplier DO when available. If delivery will be delayed, reply with
  the new delivery date and reason.` — Challenge for the lock: `{date}` should be the date the
  check is about, which is Purchasing's anchor for the tomorrow check (the supplier's newest
  Expected arrival when one exists, else the PO Delivery Date). Quoting only the PO Delivery Date
  would ask about the wrong day after a supplier moved it. When Supplier, Deliver To, the date or
  a contact method is missing, no message is built and the pane names what is missing.
- **B4 · LIST AGREED, BUILD LATER (own data and flow change; no control that cannot save).** The
  customer's decision after a supplier delay is one of: `Accept new date` · `Choose another date` ·
  `Deliver available items first` · `Change product` · `Cancel delayed item` · `Needs manager
  decision` · `No reply`. `Change product`, `Cancel delayed item` and `Needs manager decision` enter
  their approval / amendment flow; a sentence alone never completes them.
- **B5 · PROPOSED TRIGGER, from Delivery MASTER §§5.1–5.2 and §9's act table:**
  - *Checkpoint:* the Logistics card's `2 working days before` check — counted back from the
    Scheduled delivery date, else the Requested date, on the Mon–Sat delivery week with Malaysian
    public holidays (Delivery §5.2, the one deadline the Route and the Customer step already read).
  - *Missing fact at that check:* no Scheduled delivery date recorded (Delivery §5: a scheduled
    date alone completes the arrangement), AND no customer contact record (0487,
    `ops_delivery_contacts`) that settles it — i.e. none with `Confirmed`, `Requested Another Date`,
    `Customer Refused Delivery` or `Contact Details Incorrect`. The last three already raise their
    own §5.10 customer exception acts. A record with `No Answer`, `Asked to Call Again` or
    `Waiting for Customer Reply` does NOT stop the escalation (the customer is still not reached).
  - *The act:* a separate occurrence, dated that check day, with Delivery's governed words for the
    Carres-contacts row — line 1 `Call the customer`, line 2 `Get the scheduled delivery date` (no
    new words; the partner-chase row `Call {logistics}` stays its own occurrence).
  - *Owner:* the current recorded Work assignment, initially Sales Order PIC; Delivery Duty only when there is no PIC
    (Delivery §9, every Delivery act's owner rule).
  - *What closes it:* a Scheduled delivery date recorded, OR a customer contact record written by
    Carres (not on behalf of the partner) with a structured result. Opening or copying WhatsApp
    never closes it.
  - *Status:* Delivery does not raise this act today — build after this page, in Delivery.

**C · Not in this build.** The right-rail Calendar/Tasks/Activity; `{n} of {m} done` and
auto-advance (need closure receipts, §5.2.1); the `3 new actions` banner; B4 and B5.

**Acceptance (the builder checks, Jess only confirms).** 1440 / 1180 / 820 / 390; one difficult
order (three suppliers, one delayed, partial GRN, unpaid, Logistics not confirmed, customer asked
another date) AND one PO serving three orders; no page scroll; each column scrolls alone; no dash;
one blue; every word in COPY; and the one test that matters: pick an act in the Inbox, finish it in
the Mission, contact the right party in Communication, never open a second page.

#### The order-centred ruling of 2026-09-26 night (superseded in its layout by A4 above)

**"Order 就是那整个东西的核心。"** After three days of right-panel pictures the owner put the
reference images side by side — Jobdrive's deal, AML's transaction, Plain's thread, the mail
clients — and named what they share: **the centre is the one record, never the one act.** Work is
therefore ORDER-CENTRED:

- **One row = one order** (a Sales Order; for supplier work, a PO). An order appears ONCE in the
  list, however many open acts it carries. The row says: the number, the customer, where the
  Route stands, and what must be done today.
- **The right panel = that order, whole:** its number and state with ONE big button (today's next
  act) on top → the **Order Route**, one line, every point dated → **today's acts**, one line each,
  each with its own prepared message and button (`Call AL Logistics` · `Ask customer to pay`) →
  then the order's facts — Customer · Balance · Supplier · Logistics · what happened (history) —
  collapsed, opened on click.
- **An act lives inside its order** (Jobdrive's "Next drip · Follow up proposal · Scheduled for
  tomorrow" sits inside the deal; AML's investigation sits inside the transaction). Work never
  scatters one order's acts into separate rows.
- The left rail stays the month calendar: pick the day, then see that day's orders.
- **Every card tallies a Route step (Jess, 2026-09-27: "every card is tally every order route step").**
  Below the Route the cards come in Route order — `Proceed · Sales Order` · `PO · Supplier` ·
  `GRN · Warehouse` · `Contact · Logistics` · `Delivery · Customer` — each ONE row in three segments
  (the step · its status line · that step's date and status word from the Route, plus the one
  button when the order's act lands there), collapsed; expand = the detail, card in card, two
  sides (facts left, message and history right). Not every section is read every time. The
  order's acts land on their step: a delivery act on Contact · Logistics (the WhatsApp door with
  its template picker; the message folded until `Show message`), every other act on the Sales
  Order row (its door). The first act's button is the panel's ONE blue. "Long" is the failure:
  the panel uses its width, never its height.

**Retired by this ruling:** the per-act row (SO-1362 appearing once for Delivery and again for
Payment); the ACTION-card-only panel (ruling B, same night — superseded within the hour once the
owner saw it: "I want my Order Route"); the 2026-09-25 composition's summary-less panel. The
components built for them (Route, Sales Order card, party cards, ACTION card) are the parts this
composition reuses; nothing is drawn twice.

**Build order (owner to say "build"):** 1 · the middle list grouped by order, one row per order with
its today's acts · 2 · the order panel: header + big button, dated Route, the acts list with their
messages · 3 · the collapsed fact cards and history. Each step is shown on the real page, walked by
the owner with two questions per row — *do I know what to do? · did I have to open another page?*

#### The former per-act right panel (rulings 2026-09-25 / B 2026-09-26) — superseded, kept for the parts

**WORK IS AN INBOX. The right panel is the ACTION card and nothing else.** Asked "how does Work
help me work?", the owner chose, from three operating models, **B · do it here**: the left list
is the day's work; the right panel is *doing this one thing* — COPY's sections `ACTION` (the
sentence, the party, `due {date}`, red when missed) · `CURRENT FACT` · `FINISH WHEN` ·
`WHAT HAPPENS NEXT` (only when the source supplies one) · `COMMUNICATION` (the owning module's
prepared message, `Open WhatsApp group` / `Open WhatsApp` as the panel's ONE blue, `Copy message`,
and the module door that records the answer) · the `Open {object}` door. Buttons live only here.
When no module message is admitted, `Open {object}` is the act.

**Retired from Work by this ruling:** the Order Route, the Sales Order card, the Logistics,
Customer and Supplier cards and the mission header (option C, "see the whole order, then decide",
was rejected: "I don't know what I should do now"; option A, a bare list, was rejected for making
every act a page change). The whole-order view lives on the Sales Order page behind the door and
is not drawn a second time in Work. The party-card components and their laws below remain the
owning pages' material (Delivery §5.5 Logistics; Sales Order Route) — Work does not render them.
`Owner, timing and source` stays as the last, closed disclosure.

**Admitted messages so far:** Delivery work — Delivery's own logistics message (customer
reference, address, building, goods by catalogue name, customer date, the external link) to the
partner's WhatsApp group, door `Open in Delivery`. **Next:** Purchasing (the supplier group, PO
reference) and Payment (the customer) bring their own when their MASTERs admit them — never a
Workspace draft.

#### The former whole-order composition (owner-approved 2026-09-25) — kept for the owning pages, NOT drawn in Work

This section is the canonical continuation of §5.9. It freezes the complete selected-mission
composition so a later chat reads it from the repository rather than reconstructing it from chat.
The deployed left Date/Module rail, middle To do/Waiting/Completed cards, density contract in §5.5
and Logistics behaviour in §5.9 are preserved. The build scope is the missing Customer card,
multi-supplier Supplier card, compact Order Route and their shared communication/state behaviour.

#### One fixed top-to-bottom composition (Jess, 2026-09-26 — Route FIRST; BUILT)

1. **Order Route** — one compact horizontal mission-health line, first, always open; its title
   line is `{object} · {module}` (`SO-1362 · Delivery`), never the words "Order Route"; it is not
   a wizard or sequence.
2. **Sales Order card** — the order's own facts, read-only, in two columns: `Customer` (name ·
   phone) · `Deliver to` · `Goods` (`{name} ×{qty}` per line, catalogue names) · `Customer date` ·
   `Balance` (`RM 0.00 · paid` / red `RM {n} · not paid · by {date}` — the collection deadline the
   Route's payment line reads). The record door is the header's `open` icon (Jess, 2026-09-26).
   The Balance is the panel's ONE money line.
3. **Logistics card** — §5.9's deployed eight-section expansion, unchanged. Collapsed it reads like
   Customer and Supplier (Jess, 2026-09-26): the heading row with `Checks {n} of 3`, then ONE
   status line — the act in bold · its result · `due {date}` · the scheduled day · the one exception,
   `·`-separated, wrapping, never a third row. Its money exception (`Hold delivery · RM {n}
   unpaid`) is not printed on the right panel because the Balance already says it; the expanded
   `1 working day before` check keeps it.
4. **Customer card** — mission-relevant dates, contact checkpoint and structured answer only.
5. **Supplier card** — one mission card; when expanded, one row per supplier/PO.
6. **Owner, timing and source** — audit disclosure, last, not repeated inside every card.

**THE ACTION CARD IS BACK ON TOP — owner ruling, Jess 2026-09-26 evening ("I lost … I don't know why
I see so many info for what"; she chose option C with hide/expand).** The right panel is two layers:
**do**, then **look**. The first card is the selected work itself — COPY's own sections `ACTION`
(the sentence, the party, `due {date}`, red when missed) · `CURRENT FACT` · `FINISH WHEN` ·
`WHAT HAPPENS NEXT` (only when the source supplies one) · `COMMUNICATION` (the owning module's
prepared message, `Open WhatsApp group` / `Open WhatsApp` as the panel's ONE blue, `Copy message`,
and the door that records the answer). Buttons live only here. Below it every information card —
Sales Order · Logistics · Customer · Supplier — is collapsed to one line and expands on click, one
at a time, exactly as §5.9 built them; the Order Route stays open and each point explains itself on
click. The 2026-09-26 afternoon retirement of the summary block is overturned by this ruling. No section is dragged or reordered; sections are always open on a desktop.
The Route says which mission obligation needs attention; the party card says who must answer and
exposes the owning action. Only one party card expands at a time, and it remains expanded after a
save or refresh. On a screen below 768px `Back to work` restores the same list position and filters.

#### Order Route — one line, concurrent facts

The default points are **Proceed · PO · GRN · Contact · Delivery**. **Loan** appears between Proceed
and PO only when a real loan record exists. The route does not force the modules into Step 1/2/3:
PO, customer, payment and logistics work may progress concurrently. Payment and Logistics render as
contextual exceptions beneath the applicable point rather than two extra permanent circles.

Each point derives `{label, date_or_range, summary, state, source_module, details, source_link}` from
its owning module. Nothing is stored as a Workspace route status. States are `complete · current ·
attention · urgent · future · unavailable`: complete uses neutral dark/check, current blue,
attention amber, urgent/missed red and future/unavailable grey. Normally only one point is blue.

- **Proceed** — the recorded order-to-proceed fact/date.
- **Loan** — optional; current loan fact/date only, never hidden under Payment.
- **PO** — `{issued} of {total}` and the applicable supplier date or date range.
- **GRN** — Warehouse receipt progress/date, read from `receivingSummaryOf` (the one receipt
  arithmetic, Stock MASTER §7) — never a second count. There is no duplicate `Stock received` point.
- **Contact** — the customer/logistics contact checkpoint protecting delivery.
- **Delivery** — the final mission deadline: `Scheduled delivery · {date}`, then `Delivered · {date}`.

Dates use `27 Oct`, a range `18–20 Oct`, and a compact progress line such as `2 of 3 confirmed`.
Do not add `1 pending` when that progress already communicates the same fact. Clicking a point
reveals a compact detail row below the route and the owning-module door; it does not create a second
large timeline. On narrow screens the same line scrolls horizontally, auto-reveals the current
point and never wraps into two route rows.

#### Customer card

**Operating boundary — owner correction 2026-09-25.** The assigned Logistics company contacts the
customer and agrees the delivery date. This card is not a routine Carres customer-calling queue and
it does not give Operation a second scheduling workflow. Operation may record the partner's facts on
its behalf under Delivery §2, but the provenance remains the Logistics company. Carres contacts the
customer only when a source exception requires Carres judgement or correction:

1. Sales Orders already knows the goods will be late (`delay_planning`) and Carres must notify the
   customer through the Sales Order door;
2. Logistics records `Requested Another Date` and Carres must decide the next arrangement in
   Delivery;
3. Logistics records `Customer Refused Delivery` and Carres must decide the next step in Delivery;
4. Logistics records `Contact Details Incorrect` and Carres must correct the phone number in the
   Sales Order.

This overwrites the earlier §5.10 wording that made `Contact due today`, `Waiting for customer`,
`Accepted date` and a routine Carres `WhatsApp`/`Email` date-agreement checklist appear on every
mission. Those are not default Carres work. Outstation release remains the explicit separate
ERP-ARCHITECTURE §6.5 exception and keeps its governed proof/message rule.

Collapsed height is exactly **72px**. It prints `Customer · {name}` and one source-derived line:
`{company} contacts the customer · by {date}` before the partner's deadline; `Scheduled {date}`
after the arrangement; or the highest-material exception `Customer requested another date ·
{date}` · `Customer refused delivery` · `Phone number is wrong` ·
`Delivery delayed · customer notice required`. Phone, email, owner and history do not appear
collapsed.

**THE CUSTOMER DOOR IS ALWAYS THERE — owner ruling, Jess 2026-09-26 ("customer still need
communication, never know — example: inform the customer no stock once we place the PO").**
The routine date agreement stays the Logistics company's job and generates no Carres task; but the
Customer card, like Logistics and Supplier, always carries its communication side — WhatsApp
(`Open WhatsApp` · `Copy message`), email where recorded, `Record as sent` and the history — so
Operation can tell the customer anything the moment it is known (a supplier delay after the PO,
no stock, a changed plan) without waiting for a governed exception to open a button. Opening a
channel or copying text is never sent evidence; the message template is the owning module's.

Expanded order:

1. **Current action** — absent during normal partner scheduling. For the four exceptions above,
   show only the source-owned Carres action and door: `Tell the customer the new date` → Sales
   Order; `Decide the next step for this delivery` → Delivery; `Correct the phone number` → Sales
   Order.
2. **Delivery** — `Requested delivery` · `Scheduled delivery` · `Delivered`.
3. **Partner contact** — company, contact deadline and latest Delivery-owned result/evidence. It is
   read-only in Work except for the existing Delivery door that records the company's reply on its
   behalf.
4. **Exception** — only when one of the four governed exceptions exists; exact source fact, required
   Carres result and owning door.
5. **Evidence and communication history** — Delivery/Sales Orders source event, actor and time.

Completion is always the responsible source fact: Scheduled delivery for normal partner
arrangement; the recorded delay/customer-notice consequence for a known late order; Delivery's
decision for a requested date/refusal; or the corrected Sales Order phone number. Copying or opening
WhatsApp never completes anything. Facts remain owned by Sales Orders (customer/requested date,
delay planning and phone), Delivery (partner contact result, scheduled/delivered and arrangement
decision), and their source communication evidence.

**Relation to customer information in the right rail (UI MASTER §5):** this card is one mission's
customer-facing exception; the linked customer's information is reached through the `Sales Order` tab
inside Tasks (owner ruling 2026-10-05), and the customer-lookup capability (all their orders and recorded
history, approved 2026-09-26) keeps its approval with its placement open (UI MASTER §5). Both read the same Sales Orders / Delivery / Payment records; neither stores a copy.

#### Supplier card

One mission has one Supplier card even when it has several suppliers. Collapsed height is exactly
**72px**. It prints only group progress plus the highest-material exception, for example
`2 of 3 POs issued` · `2 of 3 dates ready · 1 delayed` · `2 of 3 received · 1 arriving 27 Oct` ·
`No purchase order for this Sales Order`. It does not print owner, supplier names or PO numbers
unless one is required to identify the exception.

Expanded, show one compact row per supplier/PO with applicable facts only:

- supplier and state: `PO not issued · Expected · Confirmation needed · Delayed · Arriving today ·
  Received · Short received`;
- original `PO Delivery Date`, preserved forever;
- `Expected arrival` — the supplier's newest promised date (owner decision 2026-09-25; never
  `Latest date`), Purchasing's `effectiveArrivalOf` over the `tomorrow_delivery` answers;
- governed delay reason and required WhatsApp evidence;
- warehouse destination;
- Supplier DO or exact-date/warehouse arrival confirmation;
- GRN date and received quantity from Warehouse, never a supplier claim;
- `Open PO`, `View evidence`, `View DO` or `Open GRN` owning doors as applicable.

Per-supplier checks are PO issued · delivery date known · pre-arrival confirmation · GRN received,
summarised as `{n} of 4 complete`, with detailed rows only on expansion. `Record supplier delay`
requires a new date, governed reason and WhatsApp screenshot; it appends evidence, preserves the
original date and updates Purchasing, Work and Route from the same source facts. One Office working
day before arrival, missing Supplier DO/confirmation yields `Confirmation needed today`; a sent
request yields `Waiting for supplier`; a passed arrival without receipt yields
`Arrival missed · Follow up supplier`.

**Alignment with Purchasing's owner-approved answer model (2026-09-25; Purchasing §5.4, §5.7).**
`Record supplier delay` is the same act as Purchasing's ONE `Record supplier answer` form — per PO
goods line, with `No change` · `Confirmed` · `New date` (server-classified `Earlier`/`Delayed`) ·
`Split delivery` (any number of `{n} pcs · {date}` batches) and `Supplier DO received` at the top —
never a second Workspace form. The expanded Supplier row therefore shows one sub-row per line or
batch; `Expected arrival` is per batch, and each batch carries its own day-before check. Evidence
accepts photo, video and PDF through the shared Receiving uploader. `PO Delivery Date` prints as
`PO {n}-Day Delivery Date` on a single-PO fact (COPY). A destination change on a sent PO is
Purchasing's `Change Deliver To` (same PO number, new version, moved Units keep their IDs); the card
reads the resulting stock route and never offers a Workspace destination editor. Sending a PO
version is Purchasing's `PoIssueEvidence` (`PO sent to supplier`) — where Work embeds it, it embeds
that component and its `po_sends` record, not the generic `Record as sent` store.

**Every goods need of the Sales Order counts — owner decision 2026-09-25.** Goods served from stock
(order lines no PO of this order carries) get their own row `From stock · {ready} of {total} ready ·
{Site}` (Delivery's readiness per line). `{Site}` is Inventory's `Stock Location` for the reserved
Units — `Carres Klang` · `PJ Showroom` · a transit point, never `NETS` — and readiness respects
Inventory's `Stock Condition`; the row's door is Inventory `?tab=stock-onhand&so={SO No}` (one Unit:
`&unit={Unit ID}`). Words follow Stock MASTER §7 (owner rulings 2026-09-25): never `Who has it` ·
`Where` · `With NETS Delivery` · `In transit` · `Stock use` · `Not available`; `Inventory Status` is
`Available` · `Reserved` · `Cannot sell`. Their short pieces are
goods that need a PO: with no PO for the order the collapsed line reads `No purchase order for this
Sales Order · {n} items need one` and the card's door is the Sales Order (its `issue_po` act). The
Route's `PO` point reads `From stock` only when no goods still need a PO. Evidence: production SO-1222
showed Logistics `Goods not ready · 0 of 5 · 5 short` beside a bare `No purchase order for this Sales
Order`. In a mixed order (some lines on a PO, others short with none) the collapsed line keeps the
PO progress and names the unbought goods as its top exception: `{n} items need a PO`.

#### Shared communication and Work states

Applicable expanded cards show the valid source-owned channels, latest event and `View history`.
The preview selects a governed template and inserts only module-owned facts. Staff may `Copy message`
or open WhatsApp/email; opening a channel is not sent evidence. On return, `Record as sent` stores
party, recipient, channel, template, source object, actor/time and reply due date. The transitions are:

`To do → recorded sent → Waiting` · `Waiting → reply → To do or source-fact Completed` ·
`Waiting → reply due passes → To do (`No answer · Follow up today`)`.

Evidence belongs to the source communication event: WhatsApp screenshot, email record, Supplier DO,
external-link answer or governed phone outcome. Customer messages use the customer/order reference;
Supplier uses the PO reference; Logistics uses CR/TCF and never exposes internal SO number through
the external link. Missing contact data prints the reason plus `Open {party} record`, not an
unexplained disabled button. This shared mechanism does not authorise a routine Carres customer
scheduling message: Customer communication appears only for §5.10's four Carres exceptions or the
separate governed outstation-release rule.

#### Payment, Warehouse, loan and after-sales boundaries

Payment is a Route/party exception only when it materially affects delivery; it is not another
calendar card. **Owner ruling 2026-09-25 (APPROVED / NOT BUILT; `../payment/MASTER.md` "Payment
inside Work"):** a collection Work item's object is the **Sales Order** (never an Invoice, so the
Route and party cards always draw); the middle card prints `Balance due RM {x}` over `Ask customer
to pay`; the Summary carries the money and the one blue `Ask customer to pay`; the Route exception
line is `Payment due {day}` (`to collect by` is retired); the Customer card keeps Delivery's collapsed
line and gains an expanded **Payment** section whose doors (`Ask customer to pay` · `Record the
result` · `Record payment`) open Payment's own compositions in place. That section is ONE shared
component with the Payment Monitor's row expansion (owner approval 2026-09-25: same function, two
frames). One fact, one place. Do not
invent `Blocked`. A permitted post-delivery clock starts from Delivered. PO/supplier delay belongs to
Purchasing; GRN/received quantity belongs to Warehouse. Loan is its optional independent point.
After-sales starts a separate mission after delivery unless its own MASTER explicitly connects it.

#### Exact responsive and state contract

- ≥1280px: `240px rail · 420px list · remainder detail`; detail padding 16px, section gap 8px.
- 768–1279px: 400px list plus detail; filters are behind the toolbar control.
- <768px: list/detail share one stage; detail padding 12px; `Back to work` first.
- Route is 88px and one horizontally scrollable line. Collapsed party card is exactly 72px.
- Summary title 16/22/600; supporting 13/18; party heading 15/20/600; state 12/16;
  expanded-section padding 10px; action buttons 36px; every touch target at least 40×40px.
- At 743×704, Back, summary, Route and all three collapsed party headings are visible before any
  party expansion. At 390px facts keep the same order, `27 Oct` never splits and the page never
  scrolls sideways.

No selection shows one `Select a work item` empty state and no fake route/cards. A missing Sales
Order shows `Order details unavailable` and no guessed party state. A refresh failure keeps the last
good mission with `Some information could not be refreshed. Try again.` Partial facts remain visible
with the exact missing source named. Permission refusal reveals no restricted party/payment data.
Skeletons use the final summary/88px Route/three 72px card geometry. Focus follows visual order;
Enter/Space opens a card, Escape collapses it, focus returns correctly, and text/icons—not colour
alone—announce every status.

#### Source facts and completions resolved for the build (2026-09-25)

These close the questions §5.10 leaves to the owning modules; they change no approved word or layer.

- **Who contacts the customer** is the assigned Logistics company (owner correction 2026-09-25,
  §5.10 Customer card). There is no Carres calling mode: Delivery's `customer_contact_by` (0488)
  informs the Monitor ladder only and never gives Work a routine Carres contact act.
- **The contact checkpoint is not a second clock.** The Route's `Contact` point and the Customer card
  read the Logistics card's `2 working days before` check (§5.9); on the Customer card it is the
  partner's deadline (`{company} contacts the customer · by {date}`), never a Carres task.
- **Customer exceptions are read from their owners** (`customerCardModel`): a known delay = the Sales
  Order action engine has `delay_planning` or `arrange_new_delivery_date` open (read from the one Work
  feed); `Requested Another Date` = Logistics' own answer (0581 link/portal) or a Delivery contact
  record; `Customer Refused Delivery` and `Contact Details Incorrect` = the latest Delivery contact
  record (0487). Each act opens its owner's door and writes nothing in Work. `Waiting` is not
  derived for the customer; the Waiting tab lists only a source-recorded waiting state (§5.2.1
  `communication.replyState`) and is empty until a module records one.
- **Payment exception line** beneath the Route: `Payment due {day}` (owner reconciliation 2026-09-25; amber
  once the deadline is reached) or `Payment · Hold delivery · Finance hold · {reason}`; the deadline is
  `paymentDeadlineOf` — the one the Logistics day-before check reads (2 working days before the
  delivery date, 3 outstation; the effective-dated Payment rule row is not readable by Operation —
  gap).
- **Supplier facts** come from Purchasing through `GET /api/operation/pos/for-order/:orderId`: the PO,
  whether it reached the supplier, the immutable PO Delivery Date, the latest supplier reply
  (answer, reason, evidence), `effectiveArrivalOf`, the Supplier DO (`do_number`, `do_uploaded_at`),
  Deliver To and the Warehouse GRN date. `Confirmation needed` opens one Office working day before the
  latest date. `Record supplier delay` opens the PO in Purchasing (`open_module`) until the reply rule
  is admitted as an embedded action (§5.1); the 2026-09-24 eight-reason list and multi-screenshot
  evidence are Purchasing's APPROVED TARGET / NOT BUILT (the stored list is 0432's six).
- **Loan** reads the Sales Order's loan offer (`ops_loan_offers`: offered · accepted · declined) and
  the loan Unit (`ops_sofa_loans`: lent out · returned). A loan is a loaner Unit, not financing.
- **Logistics collapsed stays as deployed** (§5.9, up to five facts); `exactly 72px` binds the
  Customer and Supplier cards, and the 743×704 acceptance requires all three headings visible.
- **The Route line is 88px; each exception line beneath it (payment, `Logistics not assigned`,
  `Logistics · Cannot deliver`) adds one 16px row.** A failed Purchasing read keeps the route:
  `PO` and `GRN` read `Unavailable` with `Try again`. The supplier pre-arrival confirmation is
  Purchasing's `tomorrowDeliveryCallOf` (anchored on the PO's expected arrival, closed by an answer
  about that exact date) or a Supplier DO; only the `tomorrow_delivery` answer feeds the latest date;
  a short receipt is not received.
- **Permission state:** `You cannot view this record` · `Ask an authorised operation user for access.`
- **One visible blue.** The blue goes to the most urgent party act (missed → due today → the selected
  work's party → future). With every card collapsed, the summary carries it as one button (the act's
  words) that opens that card; once a card with an act is open, the blue sits in that card instead.
  An admitted embedded action is always the blue and the summary then carries none.
- **An order outside the Operation list** (the read returns the latest 500) draws no route or cards;
  only a FAILED read prints `Order details unavailable` (gap: a per-order read).
- **Not built by this card:** outstation customer confirmation before the first leg (ERP-ARCH §6.5) ·
  customer chase answer link (§6.4) · supplier reply embedded in Work · closure receipts for
  `Completed` · the Ohana supplier-to-customer route.

#### Build and acceptance contract

Build order: persist this authority → shared party shell → Customer → Supplier aggregation → Route
projection → communication events → responsive/error/accessibility states. Preserve §5.9 Logistics,
§5.5 left/middle shell and the deployed density fix. Representative fixtures must cover: no PO;
one supplier; three suppliers with missing PO, delay and partial GRN; logistics unassigned/assigned
unscheduled; customer waiting/no answer/rescheduled; payment exception; loan; delivered; missing
contact; partial failure; permission refusal.

Acceptance measures 1440, 1180, 820, 743 and 390: no horizontal page scroll, 72px collapsed cards,
one-line Route, one primary blue action, unwrapped `27 Oct`, correct keyboard/screen-reader behaviour,
no console error, and no regression to Logistics, left rail, middle cards or list restoration.

## 6 · Module admission gate

**RO return timing — owner correction 2026-09-20; target, not built.** Purchasing §9.7 owns
Carres’s default 14-working-day target starting from evidenced Supplier receipt of the RO document,
not goods pickup or document sending. My Work/Team Work reads those same source facts; a later
Supplier-reported return date does not reset the Carres target or complete overdue follow-up.
Preserve setting/calendar versions and previous dates. A missing receipt cannot produce an
invented due date. Calendar and occurrence admission still require the §6 contract; no new task
engine, arbitrary follow-up deadline or extension approver is authorised here.

**Repair Orders integration — owner-approved target, 2026-09-18; the four RO rules are BUILT ON BRANCH 2026-09-29 (§6.1).** Purchasing MASTER
§9.7 admits direct inventory repairs as well as Claim-linked repairs, including Warehouse,
Showroom and Dealer Display Units. RO Issue/follow-up obligations and the existing
Outbound/Receiving inspection obligations share this Work engine. No separate repair task list,
status writer or custody ledger. Every new projection must pass the admission contract below;
reuse existing physical-work occurrences to avoid duplicate tasks. Duties, cover, permissions,
source actions and actual completion facts stay with their existing owners. The RO business
blueprint does not itself admit a production Work rule or define new financial approval limits.
**RO owner correction, 2026-09-19:** optional price/quotation recording is not an approval or
payment act. Missing price or a pending financial decision never blocks placing/issuing RO and
does not create a mandatory quote task. If an RO-related approval is required, Jess alone acts
through her governed personal identity; no other Duty holder or Buddy may substitute. Preserve
normal operational cover for Issue/follow-up and physical work. This exception does not alter
Manual Purchase/PO approval policy. Purchasing §9.7 owns the rule.
**RO owner-consent correction B, 2026-09-19; APPROVED TARGET / NOT BUILT:** issuing an RO for
non-Carres-owned Units without recorded owner consent is allowed and retains an outstanding
owner-consent follow-up. Project the RO-owned obligation here with its affected scope, resolved
operational assignee/cover and evidence-based completion under this admission contract. Reissue
must not duplicate unresolved work; partial consent completes only its covered scope and refusal
remains unresolved. Do not create a second task store, infer consent from Issue or invent a due
date. Purchasing §9.7 owns the trigger/completion rule; existing Stock/Outbound controls remain.


A page displaying an action sentence is not enough. A module joins Work only with:

1. authoritative trigger and completion fact;
2. stable identity and occurrence law;
3. named person rule or Duty key resolved centrally;
4. governed due/calendar or explicit no-date law;
5. required result, recipient where applicable and exact source door;
6. permission/history evidence preserving the actual actor;
7. tests proving source completion removes the same Work identity.

An action additionally qualifies for `embedded` interaction only with:

8. one shared owning-module component and authoritative API/action key;
9. the same server permission, validation and required evidence as the owning page;
10. source-version/stale-state refusal and idempotent repeat handling;
11. a specific source-owned success/closure receipt and refreshed-feed proof of closure;
12. an exact `Open {object}` fallback.

Payment, refund, GRN, Issue PO, Delivery result and Service outcome are not admitted merely because
a compact form can be drawn. Supplier reply cannot be scheduled as the second slice until its
existing API's exact PO-version and evidence checks are proven.

Incomplete projections are excluded and reported as a Work-health gap. Workspace never fills a
missing module rule with a global default.

### 6.1 · Governed action catalogue

This catalogue is the Workspace reading of module-owned rules. The module remains authoritative;
changing a trigger, due law or completion fact requires changing that module's MASTER and projector,
not editing free text in Workspace. Recipient is supplied by the source object where applicable.

This is a governed-rule catalogue, not proof that a rule is live in the current feed. A rule is
admitted only when §10 records its projector evidence and every §6 gate passes, including the
operator-safe completion statement required by §5.2.1. The current feed has no such statement field,
so no existing occurrence may be presented as contract-v2 complete; review fixtures must say they
are fixtures, and production keeps the current page until each admitted projection is upgraded.

| Owning module · action identity | Why it exists / required result | Owner rule | Due law | What closes it / next |
|---|---|---|---|---|
| Sales Orders · `ask_delivery_date` | Requested delivery date absent · obtain the customer's date or `not yet` answer | Responsible Salesperson · **reminded on that order in the Sales Portal (showroom/dealer login); never routed to an Operation person** (owner ruling Jess 2026-10-06: salespersons have no personal login; Operation Work is Operation-only) · APPROVED / Sales Portal reminder NOT BUILT | `No date` for admitted legacy rows | Requested Delivery Date or governed no-date answer exists · order planning continues |
| Sales Orders · `delay_planning` | Supplier date breaks the customer commitment · record the customer-plan decision for that exact date | Responsible Delivery Operation for the customer commitment | 2 Office working days from detection | Decision and decided ETA recorded · Delivery opens the governed next booking act when required |
| Purchasing · `manual_purchase.approve` | Manual Purchase awaits a decision · approval/refusal recorded | Purchasing Approver | Request Order By date, Office calendar | Decision stored · approved demand may require PO issue |
| Purchasing · `manual_purchase.issue_po` | Approved demand/current PO version has not reached supplier · sent evidence | PO Duty | Request Order By date, Office calendar | Current version has confirmed-send evidence · normal state becomes Waiting for goods; no immediate reply task |
| Purchasing · `purchasing.po_window` | Eligible SO demand is stamped into a daily PO window, or a PO issued from that window has an unsent current version · buy the window's demand and send every PO | PO Duty | The window's own time on its day (PO Days that are Office working days; a supplier's earlier cut-off is its own window) | No eligible demand left in the window and every PO issued from it has its current version marked `PO sent to supplier` · the PO waits for goods |
| Purchasing · `purchasing.supplier_reply` | **Retired 2026-09-24:** absence of an immediate answer after sending is not work | — | — | Early exception is recorded in Purchasing when reported; otherwise the exact-date day-before rule governs |
| Purchasing · `purchasing.supplier_date_passed` | Supplier date passed with goods owing · new evidenced arrival answer | PO Duty | Supplier date, closure-adjusted | New governed supplier answer/date exists |
| Purchasing · `purchasing.confirm_tomorrows_delivery` | Effective arrival is tomorrow · obtain Supplier DO or evidenced confirmation for that exact date and named Warehouse. **One occurrence per PO goods line / split batch — BUILT 2026-09-26** (owner-approved 2026-09-25, Purchasing §5.7 per-item answer; `poExpectedArrivalsOf`): a line split `4 pcs · 26 Sep` + `2 pcs · 6 Oct` derives two dated occurrences | PO Duty | One Office working day before each batch's effective arrival | Matching Supplier DO or evidenced tomorrow-delivery confirmation exists for that batch; a later answer is recorded per line in Purchasing's one `Record supplier answer` form (`No change` · `Confirmed` · `New date` → `Earlier`/`Delayed` · `Split delivery`) and derives new date-specific occurrences. Card action: `Click WhatsApp, ask {Supplier} for the Supplier DO for {PO No}` (email channel: `Click Email, …`). **Recording is open to any active Operation person (owner ruling 2026-09-25, Purchasing §5.7)** — the occurrence routes to PO Duty, but whoever records the supplier's answer closes it; actual recorder is stored beside normal duty/cover, never in place of them |
| Purchasing · `purchasing.confirm_balance_delivery_date` | Short receipt left goods owing · balance promise | PO Duty | Opens with short receipt; Calls calendar owns filing | Balance promise for line exists |
| Receiving · `receiving.check_in` | **APPROVED TARGET / PARTIALLY BUILT, 2026-10-05:** physical receipt confirmation or a source-linked validation blocker. A passed supplier date without goods is Operation supplier follow-up through Purchasing, never an instruction to post missing goods. The date-only Receiving trigger is removed in deployed #1907 (`629ece995`); Purchasing uses the existing per-line arrival authority and earliest passed outstanding date. Full CI and five deployment endpoints passed; the live Work scenario remains unverified. | Authorised individual Warehouse operator for physical confirmation; Operation retains direct receiving and GRN Duty handles receipt exceptions. PO Duty owns supplier chasing. | Actual source-owned physical work date; supplier follow-up retains Purchasing due law | Valid final confirmation posts once and creates GRN automatically; no second Operation approval. Claim and shortage follow-up close from their own results, not merely GRN creation. |
| Warehouse · `warehouse.outbound_handover` | **Not admitted:** dated pickup has Units not handed over · exact receiver/proof result | Requires governed personal NETS operator or admitted Site queue; neither is currently built. **PROPOSAL / NOT LAW (Stock §7, 2026-09-25):** until then the card resolves to the current GRN Duty so a Carres person sees `{DO No} · {SO No} / {n} items · pickup by {company} today / Load the goods` | Scheduled Site handover date on Warehouse calendar | Every required Unit has accepted handover evidence · admission waits for governed owner/acceptance |
| Delivery · `arrange_new_delivery_date` | Approved delay requires a reachable new booking · scheduled date, optional agreed time (§5 of Delivery MASTER) | Current Work assignment, initially Sales Order PIC; Delivery Duty fallback only when no PIC | Same Office working day as delay decision | Customer-confirmed reachable booking exists |
| Delivery · `assign_logistics` | Delivery required with no company; opens on PO issue day, or Operations entry day for a stock-source order without PO (owner-approved 2026-09-29 / NOT BUILT) | Current Work assignment, initially Sales Order PIC; Delivery Duty fallback only when no PIC | Delivery §2.1's one configured deadline, initially 3 Delivery working days before Scheduled delivery, else Requested delivery; evidenced earlier partner requirement wins. Late entry requires immediate action without invented past omission; no date means no invented countdown | Delivery company recorded · booking action may open |
| Delivery · `confirm_delivery_date` | Company assigned but no Scheduled delivery date recorded · evidenced booking | Current Work assignment, initially Sales Order PIC; Delivery Duty fallback only when no PIC | Delivery §5.2 Scheduled delivery deadline (2 Delivery working days before the anchor); contact lead is separate | Scheduled delivery date with required reply evidence; time optional. A genuine site appointment requirement remains its own missing item (Delivery §5) |
| Delivery · `deliver_today` | Confirmed delivery is today without result · result recorded | Current Work assignment, initially Sales Order PIC; Delivery Duty fallback only when no PIC | Confirmed delivery date | Delivery attempt result exists · proof/recovery follows result |
| Delivery · `upload_delivery_photo` | Delivered result lacks file · proof file recorded | Current Work assignment, initially Sales Order PIC; Delivery Duty fallback only when no PIC | 1 delivery working day after delivery | File exists · proof review may open |
| Delivery · `upload_signed_delivery_order` | Delivered result lacks the signed Delivery Order · signed file recorded | Current Work assignment, initially Sales Order PIC; Delivery Duty fallback only when no PIC | 1 delivery working day after delivery | Signed Delivery Order exists · proof review may open |
| Delivery · `check_delivery_proof` | Latest delivery file is unreviewed · governed review result | Current Work assignment, initially Sales Order PIC; Delivery Duty fallback only when no PIC | 1 delivery working day after delivery | Review newer than latest file exists |
| Delivery · `failed_delivery_next_step` | Failed Delivery has no recorded next step · named recovery fact | Current Work assignment, initially Sales Order PIC; Delivery Duty fallback only when no PIC | Same Delivery working day | Named next fact exists · delivery planning continues |
| Delivery · `collect_loan_item` | Loan item remains out on delivery day · returned evidence | Current Work assignment, initially Sales Order PIC; Delivery Duty fallback only when no PIC | Delivery day | Loan row is returned |
| Payment · `payment.collect_customer_balance` / `payment.missed_promise` | SO goods balance remains owing when Payment collection is actionable; a closing Sales Invoice is not a prerequisite (Payment §2, owner 25 Sep) | Stable Collection Owner; active cover acts | Payment-owned collection deadline or customer promise; unresolved clock-start reconciliation stays explicit | Canonical posted/allocated payment reduces the applicable SO goods balance to RM 0; closing Invoice automation and independent hold/Storage obligations remain separate |
| Payment · `payment.send_storage_invoice` | Live Storage Invoice remains unpaid · invoice sent and money collected | Stable Collection Owner | Shared collection deadline, else `No date` | Live storage owing is RM 0 |
| Payment · `payment.review_overpayment` | Money exceeds live obligations · allocation or approved refund decision | Payment Approver Duty | Governed `No date` | Overpaid amount is RM 0 or approved refund covers it |
| Payment/Stock · `payment.check_stored_furniture` | **Not admitted:** open storage case reached inspection interval · inspection result | Warehouse capability/owner rule; admission waits for a governed person resolution | Last check/storage start + configured interval | Due inspection recorded |
| Finance exception · `resolve_payment_exception` | Open Finance exception holds delivery · clearance evidence | Finance owner rule; unresolved must remain Not assigned | Immediate | Exception cleared with evidence · delivery gate re-evaluates |
| Purchasing · `claims.record_ask` | **APPROVED TARGET / NOT BUILT (2026-09-25, Purchasing §9.5).** Claim open with no recorded ask · record what Carres asks the supplier. Not projected in slice C1: the record page leads with `Record what we asked` in its Current action instead | PO Duty | Next Office working day after intake/evidence readiness | `requested_action` stored with actor/time · `claims.issue_claim` opens |
| Purchasing · `claims.issue_claim` | **BUILT ON BRANCH 2026-09-29 (Purchasing §9.5 slice C1, 0607 not applied).** Ask recorded and no confirmed `Claim sent to supplier` · fact `The supplier claim is not issued` · `Share the claim with {Supplier} and record the actual message sent` · deep link: the claim record (`/operation?tab=claims&claim={id}`) | PO Duty assignment through the Shared Duty Resolver | Office calendar: next Office working day after the ask | Confirmed send recorded through `Claim sent to supplier` (`document_sends` kind `supplier_claim`) · `claims.obtain_reply` opens |
| Purchasing · `claims.obtain_reply` | **BUILT ON BRANCH 2026-09-29 (slice C1).** Ask recorded and sent, no supplier reply · fact `{Supplier} has not replied` · `Ask {Supplier} to reply to the supplier claim` (opens the claim record's `Record supplier reply`) · deep link: the claim record | PO Duty; any active Operation person may record and thereby close it (actual recorder stored) | Office calendar: ask + `Reply waiting days` SNAPSHOTTED onto the claim with the ask (0607; Settings 0606, else 2) — a later Settings change never moves it | `supplier_response` stored with scope, date and evidence (`supplier_claim_replies`, 0607) · outcome work continues in Purchasing |
| Purchasing · `claims.no_reply_decision` | **BUILT ON BRANCH 2026-09-29 (slice C1).** `Reply expected` + Settings `Extra days before escalation` passed with no reply · fact `{Supplier} has not replied` · `Decide how Carres will resolve the item problem` · deep link: the claim record. PO Duty keeps `claims.obtain_reply` beside it | Purchasing Approver through the Shared Duty Resolver | Office calendar: Reply expected + `Extra days before escalation` snapshotted with the ask (0607; else 2) | The supplier's reply recorded (scope, date, evidence). 🟡 An authorised no-reply decision has no writer yet (Purchasing §9.5 Authorised Outcome), so today only the reply closes it |
| Purchasing · `purchase_return.issue` | **BUILT ON BRANCH 2026-09-29 (Purchasing §9.6 creation door, slice C2; 0609 not applied).** Open claim records `Return to supplier` and no Purchase Return is issued for it · fact `Not issued` · `Issue the purchase return to {Supplier}` · deep link: the claim record (`/operation?tab=claims&claim={id}`) → `Issue Purchase Return` | PO Duty through the Shared Duty Resolver; Buddy cover acts | Office calendar: next Office working day after `Return to supplier` was recorded | A Purchase Return issued for the claim (`purchase_returns`, through the one 0548/0609 door) · `purchase_return.send` opens |
| Purchasing · `purchase_return.send` | **BUILT ON BRANCH 2026-09-29.** A Purchase Return has no confirmed `Return document sent to supplier` · fact `Sending not confirmed` · `Send the return document to {Supplier}` · deep link: the PR record (`/operation?tab=purchase-returns&pr={id}`) | PO Duty through the Shared Duty Resolver; any active Operation person may record the send | Office calendar: next Office working day after the PR Doc Date | Confirmed send recorded (`document_sends` kind `purchase_return`, 0609) |
| Purchasing · `purchase_return.confirm_tomorrows_pickup` | **BUILT ON BRANCH 2026-09-29.** `Confirmed Pickup Date` is the next Office working day and the return is not fully picked up · `Confirm tomorrow's pickup · {Supplier}` (action · recipient) · deep link: the PR record → `Confirmed Pickup` | PO Duty through the Shared Duty Resolver; any active Operation person may record the supplier's confirmation | One Office working day before Confirmed Pickup Date (the PO day-before rule) | An evidenced pickup confirmation FOR THAT DATE recorded on or after the day before (`purchase_return_pickup_confirmations`, 0609); a confirmation taken at issue does not replace the check |
| Purchasing · `purchase_return.pickup_missed` | **BUILT ON BRANCH 2026-09-29.** Confirmed Pickup Date passed and Stock's Outbound `Return to supplier` handover recorded no Unit collected · `Pickup missed · Follow up supplier` (fact · action) · deep link: the PR record | PO Duty through the Shared Duty Resolver; Buddy cover acts | The Confirmed Pickup Date | A Unit collected (Stock Outbound actual pickup, Stock §12.8 — writer NOT BUILT) or a new confirmed pickup date not yet passed |
| Purchasing · `repair_order.issue` | **BUILT ON BRANCH 2026-09-29 (Purchasing §9.7 slice B).** Repair Order exists and its current version is not marked sent · `Issue repair order to {supplier}` · deep link: the RO object (`/operation?tab=repair-orders&ro={id}`) | PO Duty through the Shared Duty Resolver; Buddy cover acts | Office calendar: next Office working day after the RO Doc Date | Confirmed send of the current RO version (`document_sends`) recorded through `Issue repair order` · the receipt follow-up opens |
| Purchasing · `repair_order.confirm_receipt` | **BUILT ON BRANCH 2026-09-29.** Current version sent, Supplier receipt not recorded · `Ask {Supplier} to confirm they received {RO No}` · deep link: the RO object | PO Duty through the Shared Duty Resolver; Buddy cover acts | Office calendar: next Office working day after the first confirmed send of the current version | Evidenced Supplier receipt recorded (`repair_orders.supplier_received_at`, with the snapshotted 14-working-day Carres return target) |
| Purchasing · `repair_order.return_date_passed` | **BUILT ON BRANCH 2026-09-29.** Carres return target passed and a Unit is not back · `Ask {Supplier} when {Unit ID} will return` (several: `{first Unit ID} + {n} more`) · deep link: the RO object | PO Duty through the Shared Duty Resolver; Buddy cover acts | Office calendar: the Carres return target (14 Office working days from evidenced Supplier receipt) | Every Unit received back on the RO's return leg (posted GRN through Receiving's arrival post) or the RO cancelled; a Supplier reply or new Supplier date is recorded but NEVER closes it |
| Purchasing · `repair_order.owner_consent` | **BUILT ON BRANCH 2026-09-29.** Non-Carres-owned Unit on the RO without a `given` consent; never an Issue gate · `Ask {owner} to agree to repair {Unit ID}` · deep link: the RO object | PO Duty through the Shared Duty Resolver; Buddy cover acts | Office calendar; governed `No date` (no due date is invented) | `given` owner consent recorded for every such Unit (`repair_order_owner_consents`); a refusal keeps it open with its scope |
| Claims · `claims.confirm_what_happens_next` | **Not admitted:** supplier answered but Carres resolution absent · customer resolution | PO Duty holder from claim-open month, retained historically | Governed `No date` | Customer resolution recorded · admission waits for a qualified live projection |
| Issue Tracker · versioned `issue_actions` occurrence | Current governed issue result is required | Stored approved Duty rule resolved centrally | Stored occurrence due date | Atomic result completes or replaces occurrence |
| Service Case · deadline/derived follow-ups | Customer/case result required | **Not admitted:** routine owner rule is not yet governed | 14-working-day deadline exists; derived-step clocks unresolved | Case outcome facts close each source step; admission waits for §11.5 |

`issue_delivery_order` is registered system automation, not a person's Work item: the same
transaction that completes its gate issues the document. Claims remain in shared Work only where
the authoritative Claims projection above is still active; no old Purchasing claim queue may create
a duplicate occurrence. The Sales Order's own action ladder keeps `issue_po`, `confirm_ready_date`
and `collect` as its words on the Sales Order; none of them opens a Work item — buying is the PO
window card, the calculated PO Delivery Date is not a supplier confirmation (Purchasing §5.7), and
collection is Payment's. A module action not listed here is excluded until it passes §6.

### 6.1.1 · Source occurrence and completion reconciliation — 9 October 2026

**Blueprint contract clarification / runtime proof still owed.** Read §§2, 5.2.1, 5.6, 6.1 and §10 against the current module boundaries. The catalogue already supplies rule keys, owner rules, due law and closure facts; numbered demonstration tasks are not missing business rules or durable occurrence IDs. The remaining contract-v2 transport/projector gaps are stated in §5.2.1. The source-specific identity scopes below prevent an order-level shortcut from closing unrelated work; exact persisted encoding remains the owning projector's implementation contract, not a new Workspace API.

| Existing source family | Occurrence scope and re-evaluation | Completion boundary |
|---|---|---|
| Purchasing PO window / send | Source window stamp and current issued PO versions; shared demand/PO counted once under §6.2. Re-read demand and send facts after issue/amendment | Issue alone does not finish buying-and-sending. No eligible demand remains and every applicable current version has actual send evidence |
| Supplier arrival / day-before / balance | Exact PO goods line and split batch's effective dated promise; accepted receipt reduces only that batch's outstanding scope. A changed answer re-evaluates date-specific work without erasing prior late history | Required evidenced answer closes answer work; it does not prove receipt. Short balance and later split batch retain their own obligation |
| Receiving / physical Outbound | Actual receipt/session or exact handover scope and goods identity mode; not a passed supplier date or generic SO status. Receiving, supplier chase and Claim remain different required results | Source-owned accepted posting/handover evidence covers only the actual goods. Retry or partial result cannot post twice or complete the unreceived remainder; unadmitted Outbound ownership stays a visible admission gap |
| Delivery arrangement / attempt / proof | Arrangement uses its governed delivery scope; actual result/proof uses the exact DO/leg/visit and latest source evidence version. Later visits and replacement uploads remain distinguishable | Booking is not delivery; result is not uploaded proof; upload is not accepted proof review. Closing one visit's action cannot close another visit or a later return's warehouse obligation |
| Payment collection / storage / exception | SO-keyed goods balance and canonical payment/source allocations under the one order Collection Owner; closing Sales Invoice is not a collection prerequisite. Exact issued storage papers remain distinguishable from goods balance. Finance exception keeps its independent source identity | Sent invoice/message and promise do not settle money. Allocated outstanding reaching zero closes the applicable collection obligation; cleared hold re-evaluates dispatch but cannot settle an Invoice, and RM0 cannot clear an unknown/open hold |
| Claims / PR / RO | Exact source document/action, current send version and affected goods/consent/return scope under §6.1. Use existing physical-work occurrences for shared handover/receipt | Supplier answer is not actual returned goods or applied credit. Partial consent/return covers only named goods; financial continuation stays with its own owner |
| Issue / Service / customer handoff | Issue uses its versioned action occurrence. Case/customer context links the owning action; no second customer-service task or duplicate generated Issue task | Actual governed result completes/replaces the Issue occurrence. Service remains unadmitted until its routine owner and derived clocks are governed; approval qualification cannot substitute for a routine owner |

Across every family, source cancellation, replacement and correction need their owning valid result and retained reason/version. Disappearance from a filtered or failed feed is not completion. Normal owner, qualified Cover and actual actor remain distinct; ordinary help does not grant approval. Preserve business deadline versus actor working date and original lateness; no global fallback calendar or Saturday bulk reassignment. Direct object doors and source permission checks remain required even where an embedded interaction is unavailable.

Acceptance must reconcile source and Tasks for split/partial goods, current versus obsolete version, concurrent correction, same-event retry, evidence replacement, absent owner/qualified cover, failed source and denied direct access. These cases are unexecuted here. This is document coverage for the first-order action chain, not admission or production proof.

### 6.2 · The PO window card — BUILT, awaiting owner review (not live)

Purchasing §5.6.1 owns the window law and the one arithmetic (`poWindowFor`); the SO Batch read
stamps every eligible demand line and every lineage PO with its window, and both this card and SO
Batch's `?window=` scope read that stamp. Workspace decides the composition (handoff 2026-09-25):

- **Middle card.** Before issue: `Buy {n} items for {m} Sales Orders` / `Issue the POs by {time}`,
  document reference `{time} PO window`. After issue: `{k} POs issued · {x} not sent yet` / the
  earliest unsent PO's send line. Items are business units; a Sales Order is
  counted once. Demand left beside unsent POs: buying leads.
- **Right panel.** Summary → `To buy` (per supplier) → `POs to send` (one 72px card per PO, unsent
  first). While demand is left the summary's `Open {time} PO window` door — SO Batch scoped to
  exactly the window's lines — is the one blue act and every PO card starts closed. Once bought,
  the first unsent PO opens on Jess's send line (`Click WhatsApp, send …` / `Click Email, send …` /
  `Send …` by the supplier's recorded channel) and **the one shared send area** (`PoIssueEvidence`,
  Purchasing §8.2), embedded — never a second set of send controls. It opens on the supplier's
  recorded channel. Opening WhatsApp or email records nothing.
- **Completion.** `PO sent to supplier` is the door that completes the window, and only when the
  window has no eligible demand left and every PO it issued has its current version sent. Issuing
  completes nothing. A received PO needs no sending. A PO serving orders from two windows is
  counted once, in the earliest. Unreadable window settings fail the Purchasing source instead of
  showing an empty day.
- **Open review points (not law).** The embedded send area keeps its own heading
  (`{PO} · PO V1 · Sending not confirmed`) inside the card — a shared-component wording question for
  Purchasing. Purchasing Settings has storage (0585); the window-times editor is recorded BUILT 2026-09-28 in the constitution, with production persistence/owner walk not proved by this document pass. Supplier earlier cut-off still has no screen. Read the current effective source; 11:30 AM and 4:00 PM are defaults, not substitutes for an unavailable or edited setting.

## 7 · Right Rail and Notifications

**OWNER-APPROVED TARGET / NOT BUILT — 2026-09-24.** The Right Rail My Work slot
becomes `Tasks` (UI MASTER §5); customer information is reached through the `Sales Order` tab inside
Tasks (owner ruling 2026-10-05). Formal Work,
My Work and Team Work retain their current scope, counts, action projection and existing navigation.
The existing My Work rail code is
implementation awaiting replacement, not a second current target. No mobile mini-queue is added.

Notifications are event receipts—assigned, cover activated, became missed, unblocked, source failed
or completed. Each receipt carries one durable event identity, the affected Work identity, recipient,
event time and exact Work/object door. It describes what changed; it never repeats the full action
row or supplies `Done`, assignment or result controls. Read/dismiss changes only receipt state and
never changes Work, owner, due date or completion. Duplicate delivery of one event remains one
receipt. The Bell is not a second queue.

Notification loading, true empty, delayed source and failed source are distinct. `No notifications`
is allowed only after the complete authorised receipt source is healthy. A failed receipt source
does not alter Work counts. Until durable transition receipts exist, the current Bell
remains legacy debt and may not be presented as this contract.

### 7.1 · Right Rail and notification acceptance contract

- The right rail follows UI MASTER §5's Calendar/Tasks/Activity target (customer information is reached
  through the `Sales Order` tab inside Tasks, owner ruling 2026-10-05); it does not duplicate Work.
- Formal Work remains directly reachable from existing Workspace navigation on desktop and narrow widths.
- Removal of the rail shortcut changes no Work identity, count, owner, deadline or completion fact.
- No rail or Bell control assigns, covers, completes or dismisses Work or records a module result.
- One Work transition produces at most one durable receipt per governed recipient; read/dismiss
  cannot change the Work occurrence. Notification errors remain distinct from a healthy empty state.

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
┌ Dashboard ─────────────────────────── Last updated 09:42 · All sources healthy ┐
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
owner, acting cover, missed age, blocker and source health. Selecting it opens Team Work with the exact
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
| Work health | Shared Work: open, Missed, blocked, unresolved owner/cover and failed source by normal owner | Team Work with exact URL filters | Eligible per admitted source; partial health required |
| Recent material change | Durable owning-module/Work transition crossing one admitted measure's state or threshold | Exact owning object | Held until durable idempotent receipts exist |

Counts of active Orders, open POs, GMV, generic low stock and unreviewed annotations are explicitly
not admitted measures. A measure without an authoritative threshold remains absent rather than
using an attractive default.

### 8.3 · Dashboard vocabulary

Use: `Management attention` · `Commitment health` · `Material exposure` · `Work health` ·
`Recent material change` · `Broken` · `Due today` · `Due later` · `Blocked` · `Not assigned` ·
`Assigned to` · `Last available` · `Could not load` · `Open Team Work` · `Open {module}`.

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
- The right rail (Calendar · Tasks · Activity, UI MASTER §5) stays beside Dashboard on supported
  desktop widths; it is not folded into Dashboard. Work is reached from its own navigation door.

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
| Dashboard currently grouped under the left-bar `Workspace` section | Move it to the one independent top-level Dashboard position; Workspace contains Work and Issue Tracker; Staff & Duties is under global Settings (§4 placement target) |

No Dashboard production rebuild begins until each admitted measure has the section 8.2 contract and
its owning module is production-verified. This blocks invented totals, not the already-honest Work
surface.

### 8.6 · Dashboard acceptance contract

Dashboard is ready for owner acceptance only when all are demonstrable:

- every visible measure exists in §8.2.1 and prints its governed meaning, unit, scope, observation
  time, health and comparison/threshold only when those facts exist;
- healthy, delayed and failed sources remain distinguishable per measure, and a failed source can
  never reduce a value to zero or produce `No management attention needed`;
- each count, amount, age and trend reconciles to its one owning source for the same permission scope
  and business date;
- every measure has exactly one tested drill-down to its filtered owning Register or Team Work, and
  Browser Back restores Dashboard position and source-health context;
- Dashboard contains no action sentence, action row, owner assignment, manual completion, arbitrary
  KPI, copied pipeline or local business mutation;
- Work health uses the same authorised Work composition and preserves normal owner, acting cover,
  blocker, unresolved Duty and source failure as separate facts;
- management attention includes only non-zero governed intervention facts and recent change includes
  only durable threshold/state transitions, not a generic activity stream;
- permissions prevent leaked people, object identities, counts and amounts while leaving authorised
  healthy sections usable during a partial failure;
- the reading order and complete measure meaning remain operable at 1440, 1024 and 390px by keyboard,
  screen reader and touch, with no sideways KPI strip or hover-only evidence;
- the global right rail stays separate from Dashboard (UI MASTER §5), and Dashboard remains one independent
  top-level destination outside the `WORKSPACE` navigation group.

## 9 · Delivery sequence

Workspace is not wholly deferred until every ERP module is complete:

```text
NOW
Staff & Duties → Shared Duty Resolver

WITH EACH MODULE
action projection → owner Duty/person rule → due/calendar
→ completion fact → exact deep link and history evidence

AFTER CORE MODULES CONVERGE
My Work → Team Work → Notifications (the right rail is governed by UI MASTER §5)

LAST
Dashboard → management facts → cross-module trends → production validation
```

Core admission covers Sales Orders, Purchasing, Receiving, Stock/Warehouse, Delivery, Payment,
Service Cases and Issue Tracker. Catalog, Guarantee and Rental may join later; they do not block
honest Work for admitted modules.

## 10 · Measured implementation truth — 2026-09-16

- **Work left rail — DEPLOYED 2026-09-24 (`26f718d4`, PR #1581; owner-approved UI, Jess 2026-09-24); signed-in Operation walk OWED.** On `7e9da6459` the rail
  was a `Working day` text list with an `All` row, printed `0 actions`, a holiday that could not be
  chosen, no `All modules` row, no week control and no `week` in the
  URL; at 768–1103px of Work canvas Panel 1 was dropped entirely and the date strip scrolled
  sideways. Now §5.1's `Date` and `Module` sections render through `WorkDayNav.tsx` over
  `workRailDates` / `workModuleCounts` / `inWorkDay` in `work-model.ts`; 768–1103px keeps the rail
  beside one work column (`Back to work` returns); below 768px the Date options wrap. Kit Icon gained
  `previous` (ChevronLeft), `noDate` (CalendarOff) and `modules` (LayoutGrid). Proof:
  `OperationWork.left-rail.test.tsx` 12 red on main → 13/13 green under `TZ=Asia/Kuala_Lumpur`,
  plus model, strip and split-shell tests. Out of scope and unchanged: Panel 2 rows, Panel 3 detail,
  communication, templates and Delivery proof review.
  Deploy run 35977633523: both Pages projects, both canonical hosts and the API Worker report
  `26f718d4`, and the live ERP bundle carries the rail. The signed-in read of `/operation?tab=work`
  at 1440 / 1180 / 820 / 390 is still owed: no verification browser holds a production session.
- **Work truth hotfix HF-1 — DEPLOYED to production 2026-09-17 (`a48e5237`, PR #1400, includes YH's
  UTC-safe `workWeek`); authenticated production read OWED.** Measured on `a5776c50`: at UTC+8 the day
  strip read `Sun 13 Sept … Thu 17 Sept`, Malaysia Day was an ordinary `0` row, an empty day said
  `Nothing assigned to you` while Friday held work, one module filter zeroed every other module, and
  the panel count followed `window.innerWidth` (three panels in a ~950px Work area). Now: every day
  label is `fmtDate`; holidays come from the shared `my-holidays.ts` (named in the rail; since the 2026-09-24 left rail a
  holiday is a choosable date with its own count); the focus day is today when it is a working day, else the next working day
  (Saturday only when something is due that Saturday), and the focus list also keeps work dated
  between today and that day; empty states run failed source → no filter match → `No work on
  {weekday, date}` with `Open Missed` / `Open {weekday, date}` → true empty; module counts ignore only
  the module filter; panels follow the measured Work area. Proof: `OperationWork.truth.test.tsx`
  9 red on main → 10/10 green; web gate 347 files / 4960 tests; CI verify success; deploy run
  35202239240; carres-portal Pages, carres-pos Pages, erp, pos and the API Worker all report
  `a48e5237`, and the erp bundle carries the new sentences and no longer carries `Some work could not
  be loaded`. **Still open:** the signed-in read of `/operation?tab=work` and the four-viewport walk,
  blocked only on a production sign-in in the verification browser. Work v4 layout and words remain
  unbuilt (§5.1–5.5).

- **Workspace Work composition — BUILT, repository-verified 2026-09-16; NOT production-verified.**
  Branch `build/work-ui` now renders the governed My Work / Team Work composition from the one v2
  server response, with working-day navigation, owner/module/cover filters, exact object selection,
  responsive list/detail behavior and the (since superseded, §7) Right Rail counts. The browser validates the full
  v2 response at the query boundary: an old or partial contract is a visible read failure and can
  neither crash the page nor masquerade as an empty desk. Repository gates: `OperationWork.test.tsx`
  12/12; `work-cache-isolation.test.tsx` 11/11 including the invalid-contract regression; authenticated
  manager composition and owning-object Browser Back passed; four governed-fixture viewport walks
  passed at 1440×900, 1180×820, 820×900 and 390×844 with no document horizontal overflow. Manually
  inspected evidence is stored in `docs/evidence/workspace-work/`. The fixture is only presentation
  evidence; it does not claim live feed accuracy. **Still open:** authenticated non-manager acceptance
  requires a valid live test account, and production verification requires the v2 API and web client
  to be deployed together. No production deployment was performed by this work.

- **Sales Orders reader boundary, production-verified 2026-09-13/15.** Sales Orders PRs #1227 and
  #1259 preserve canonical Paid/Outstanding arithmetic while showing saved at-sale method,
  reference and slip as independent evidence. An absent individual transaction row does not prove
  that the customer never paid and does not authorise Workspace to infer a corrected amount.
  This dated reader evidence predates Payment §2’s 25 September SO-keyed collection ruling;
  the issued-Invoice projection is historical implementation evidence, not the current target.
  Collection Work must consume Payment’s one canonical outstanding source; saved evidence, an empty transaction list or the Sales Order
  reader may never generate a duplicate collection action. Warehouse/Delivery exact-Unit work uses
  recorded provenance; the Sales Orders `verifiedUnitIds` reader is evidence for display, not a new
  Unit assignment or Work source.
- Migration 0425's shared Duty registry/resolver, effective primary assignment, dated cover,
  audit evidence, guarded API and the one Staff & Duties UI are production-proven
  for GRN Duty. The same catalogue now exposes the other approved cross-module Duty names; their
  module consumers remain implementation evidence until each module is production-verified.
- **Existing Staff & Duties catalogue/detail implementation — DEPLOYED 2026-09-16
  (`56e52d0e`, PR #1388); owner acceptance under §4.7 still open.** This proves the shipped
  catalogue and focused actions only; §4’s Settings relocation and §4.2’s 2026-09-28 structure
  remain APPROVED TARGET / NOT BUILT. Deploy run 35075197322 passed its repeated
  authoritative checks and deployment proof; an independent `verify-production.mjs` run then read
  `56e52d0e` from carres-portal Pages, carres-pos Pages, erp.carresofficial.com,
  pos.carresofficial.com and the API Worker. The stacked 720px document is replaced by one catalogue
  and one selected Duty (`StaffDuties.tsx` + `staff-duties/`). The shared catalogue,
  `GET /api/operation/workspace-duties`, the SQL resolver and the assign/cover doors are unchanged
  and remain the only ownership truth; no API, migration or roster was added. Presentation helpers
  read today's actor from `resolution` alone and take the company date from `appTodayIso()`.
  Built behaviour: catalogue rows equal `WORKSPACE_DUTIES.length` (12, including Finance Approver);
  an unknown `duty` key is corrected with history-replace; readers receive `Duty assignments are set
  by the manager.` and zero write controls; the measured pre-convergence `Assign holder` and `Add cover` are focused kit `Modal`
  acts with §4.4.1 sentences, no optimistic owner change, and
  `Add cover` absent while nobody holds the Duty; an empty catalogue renders the read-failure
  sentence; history uses event / who-when / note ranks with no controls.
  Repository gates: CI `verify` green on the merged head; Staff & Duties suites 99/99; full web
  suite green apart from unrelated `OtherReceiptsPage.test.tsx`, which fails 1 of 3 solo runs with
  no Staff & Duties import; `ops/stock-register.test.ts` timed out only under parallel load (16/16
  alone). A seeded rendered walk (real page and portal shell, fixture responses) measured 1440px
  catalogue 320 / detail 888, 1024px 272 / 692, 390px one pane with `Back to duties`, zero document
  horizontal overflow and single-column dialogs inside the viewport (`docs/evidence/staff-duties/`);
  it found and fixed a State chip strip that widened the 390px document by 125px and clipped
  `Not assigned`, and a catalogue that was not narrower at 1024px.
  Production smoke without credentials: all four Staff & Duties API doors return 401 without a
  bearer token; the live ERP bundle carries the new governed sentences and no longer carries the
  retired `Assign a holder below.`; the deep link `/operation?tab=staff-duties&duty=grn_duty` loads
  at 1440 and 390px, redirects to `/login`, with no console error and no horizontal overflow.
  Read-only production SQL on 2026-09-16 (company date): `workspace_resolve_duty` answers all 12
  catalogue keys — PO Duty → Yu Jun, GRN Duty → Shasha, Payment Approver and Storage Waiver
  Approver → Jess (each `active`), the other eight `not_assigned`, no active cover — and that set
  equals the four assignment rows effective today. Khor Yee is `disabled` and holds no current
  assignment or cover. `actor_display_names` returns no names without an operation/principal JWT,
  which is its access gate, not an absence of holders.
  **Remaining acceptance, not performed (no credentials available to the build lane):** signed-in
  manager and non-manager sessions on the live page; byte-for-byte resolver agreement across Staff &
  Duties, Team Work and one protected module door; live assign/cover success, refusal, overlap, race
  and company-date-boundary behaviour; write-door refusal of departed, disabled, external Warehouse
  and same-as-holder people. §4.7 stays open until those run.
- **Staff & Duties data integrity (S2-A) — migration 0532.** The cover door takes a per-Duty
  advisory lock, refuses an overlap with any cover whose acting person is still active
  (`cover_overlap`) and requires ONE active normal holder for every day of the cover
  (`no_duty_holder`); the holder as their own cover is `cover_is_holder`. `workspace_duty_normal_on`
  is the one holder arithmetic the resolver and the door share: a disabled holder resolves
  `not_assigned` (an older assignment is never revived) and a disabled acting person's cover is
  ignored, so Khor Yee is never resolved. The API returns refusal codes only, names the normal owner
  the door wrote in the cover success sentence, and exposes `scheduled_cover_id` asked of the
  resolver on the next cover's first day; the detail shows the resolver's cover by `cover_id` /
  `scheduled_cover_id` using the pre-convergence staff wording. This measured implementation remains
  a target gap: §3 requires assignment history, not a competing cover identity, on staff UI. Duty pickers list
  active people only — since 0533 the governed `is_person` marker, not `staff_code`; shared logins
  and disabled accounts are not offered. Staff avatars use the one `personInitials` rule (`Shasha → SH`, `Yu Jun → YJ`) on
  Staff & Duties, Purchase Orders, HR People and Principal Accounts. Real-PostgreSQL proof:
  `duty-cover-integrity.integration.test.ts` red on 0531, green on 0532.
- **Personal approval identity + Purchasing Approver bootstrap (S2-D) — migration 0533.** Adds the
  guarded `app_users.is_person` marker (true for Jess, Shasha, Yu Jun; false for
  `principal@carres.com`); moves `jess@carres.com` to `principal` in the database (her token already
  said `principal`, so API and SQL had disagreed about her); makes `workspace_is_internal_staff`,
  the duty-settings gate and the duty pickers person-only; removes the principal self-assignment
  exception and refuses self-cover; restricts Purchasing Approver to Principal people; narrows
  `purchasing_approver_gate` to today's resolved actor; adds the `own_request` refusal to
  `purchasing_decide_request`; makes the principal rung of the Payment, Storage Waiver and Finance
  approver doors person-only; removes the principal role from Manual Purchase raise/resubmit; and
  narrows `is_operations_superuser` from "every principal" to the flag or a principal person, so
  the shared owner login loses the PO/GRN doors while Jess keeps them (Purchasing MASTER §5.3). The API Manual Purchase ladder reads only the resolver — no
  `ops_manager` rung and no email list — and names the approver through `actor_display_names`.
  Real-PostgreSQL proof: `personal-approver-identity.integration.test.ts` 9/10 red on 0532, 10/10
  green on 0533. **SHIPPED AND DEPLOYED 2026-09-18:** 0533 applied before merge (tracker
  `20260918020733`); PR #1433 merged `11dcade3`, every canonical surface reports it. Production
  read: Jess principal · CR002 · person; `principal@carres.com` not a person, holds and covers
  nothing; Jess holds `purchasing_approver` from 2026-09-18 with `assigned_by` NULL and the
  bootstrap note, plus the two migration audit rows. **Owed:** Jess's signed-in walk of Staff &
  Duties and a Manual Purchase approval (login-gated); she signs out and in once after the change.
- Order and Manual Purchase Work now carry structured owner rule, Duty key, normal owner, active
  cover and acting person. My Work routes to the acting person; Team Work retains the normal owner.
  Payment and PO work no longer borrow the order PIC when their Duty is unresolved.
- The legacy `/api/operation/po-duty` response-shape adapter and its client hooks are retired.
  Purchase Orders, the Sales Order Route and Orders Control now read today's acting PO / GRN person
  from the shared Workspace Duty resolver; dated cover changes the acting person without rewriting
  the normal holder. The legacy PO-day `ops_tasks` reminder is also retired: demand that needs a
  PO is the PO window Work occurrence (§6.2) owned by current PO Duty. `PO Days` decide which days
  a window opens and never create a second free-text task.
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
  Inbound and Outbound surfaces on 2026-09-07. That implementation used a GRN-owned arrival
  action. The 2026-10-04 approved target separates Warehouse physical confirmation from
  Operation supplier follow-up (§6.1); the existing feed must not be claimed aligned until
  verified. Monitor is read-only management visibility and creates no Work. Physical
  Outbound work is deliberately not admitted yet: its approved owner is an individually signed-in
  NETS Warehouse operator, falling back to an authorised Site queue until accepted, while the
  current central Work endpoint is Operation-only and has neither Site-queue routing nor personal
  acceptance facts. Naming Carres staff, `NETS` or a shared warehouse login would violate section 3.
- Delivery-owned arrangement, company assignment, customer booking, delivery-day result, proof and
  loan-return actions retain Delivery as their owning module in the shared engine. Their stable
  object is the Delivery scope until a Delivery Order exists, then the exact DO where the
  result/proof act belongs; the server supplies the Delivery editor/DO door. Ownership of the
  business fact remains with Delivery while responsibility for the action resolves to the linked
  the current recorded Work assignment, initially Sales Order PIC, with Delivery Duty only when that order has no PIC.
- **Historical implementation / superseded target:** this invoice-keyed projector predates Payment §2’s 25 September SO-keyed collection ruling. Its exact Invoice door and invoice-issue snapshot below are measured legacy behavior, not admission requirements for the current SO collection target. Source clock-start and route migration still require Payment-owned reconciliation; do not invent a replacement date or API. Payment collection in this measured implementation enters from the complete issued-Invoice register, not a second Sales Order
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
3. Remove legacy PIC/duty fallbacks except the explicit no-PIC Delivery Duty fallback governed in
   sections 4 and 6.
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
The execution sequence that implements this authority is recorded in
`docs/workspace/IMPLEMENTATION-PLAN.md`; it cannot amend this MASTER.

## 12 · Done-when

- one Duty registry resolves every admitted action/approval;
- one holder change updates all routing, My Work and Team Work;
- leave/checkpoint changes update the Work assignment with history, preserving the source PIC and actual actors;
- source completion closes one stable Work identity;
- actual actor and approval evidence remain immutable;
- no module has an independent staff list, approver name or cover resolver;
- Notifications read the same Work truth; the right rail never counts Work;
- Dashboard reads verified facts and never becomes another queue;
- production verification precedes every completion claim.

## 13 · Complete UI Blueprint trace

This matrix proves document coverage, not implementation or production completion.

| Required Blueprint question | Work | Staff & Duties | Issue Tracker |
|---|---|---|---|
| Exact page job/boundary | §§1, 5.1 | §§4.1 | Issue MASTER §§1, 11.1 |
| Information hierarchy and ASCII composition | §§5.1–5.2 | §4.2 | Issue MASTER §§11.1–11.2 |
| Authoritative read/feed contract | §5.2.1 | §§3–4 | Issue MASTER §§5–6, 11.3 |
| Ownership, cover and actor | §§3, 5.2, 6.1 | §§4.2–4.4 | Issue MASTER §§5–6, 11.2–11.3 |
| Primary journeys/actions | §§5.1–5.3 | §§4.3–4.4 | Issue MASTER §§4–5, 10, 11.2–11.3 |
| Search, views and filters | §5.3 | §4.2 | Issue MASTER §11.1 |
| Loading, empty, no-match, late, blocked and failure states | §5.4 | §4.5 | Issue MASTER §11.4 |
| Permission behavior | §§3–6 | §§4.3–4.5 | Issue MASTER §§11, 11.6 |
| Exact vocabulary | §§5.2–5.4 and COPY STANDARD `Workspace destination words` | §§4.2–4.5 and same dictionary | Issue MASTER §§4–5, 11.1–11.4 and same dictionary |
| Responsive/accessibility behavior | §5.5 | §4.5 | Issue MASTER §§11.2, 11.4 |
| Cross-page/deep-link behavior | §§1.1, 5.3, 7 | §§1.1, 4.2 | §§1.1 and Issue MASTER §§11.1–11.2 |
| Current → proposed evidence | §5.7 | §4.6 | Issue MASTER §11.5 |
| Testable owner acceptance | §5.8 | §4.7 | Issue MASTER §11.7 |

The page Blueprint is reviewable when every row points to current truth with no contradiction. The
pages are built only when their acceptance contracts pass against current implementation and real
authorised accounts. The global Dashboard remains outside these three destinations and retains its
separate §§8–8.6 contract. Notifications and the right-rail boundary retain the supporting §7–7.1 contract and
never become additional Workspace destinations.

### 13.1 · Owner-review result — composition 2026-09-16; Duty placement 2026-09-28

The composition review covers the complete relationship, not isolated screens:

```text
Dashboard ──management fact drill-down──▶ owning Register / Team Work
Workspace ──Work──▶ exact owning action door
          └─Issue Tracker──▶ Issue truth + shared Current Action
Settings ──Staff & Duties──▶ shared owner/cover resolution
Right rail ──(no Work count; UI MASTER §5)
Notifications ──event receipt──▶ Work / owning object
```

Staff & Duties entry placement follows §4’s 2026-09-28 ruling; its current internal-page review
is not complete. Implementation remains gated by the
module admission and production-proof work in §§6, 10 and 11; `Blueprint ready` does not mean those
sources, migrations or pages are deployed.

**OWNER APPROVED — Work design v3.1, 2026-09-16.** The approved review surface proves the
three/two/one-panel composition at 1440×900, 1180×820, 820×900 and 390×844; reconciled
Missed-plus-plan-day counts; inline completion receipts; Team/My ownership density; the three
interaction modes; keyboard/focus return; proof-image inspection and failure; and the §5.4 state
matrix. Its example objects, people, dates, amounts, permissions, photographs, save outcomes,
sidebar, Right Rail and unfinished filters remain fixtures and are not authority. Production must
render the contract and owning-module facts governed here; it must not copy fixture records or the
artifact's implementation.

**Owner correction 2026-09-28 — actionable work first (local prototype):** show admitted unfinished cards above the collapsed Order Route, missed before due. Render each actionable card once; route rows link back to it. Supplier before send confirmation shows `Sending not confirmed`; expanding reveals read-only facts without empty completion boxes or a progress ratio. Recipient is a recorded supplier contact/group, never free text; multiple recorded destinations permit selection, missing contact data must not be invented. Production integration remains owed.

Review fixes (owner approved 2026-09-28): communication tabs wrap within their panel at medium widths. Time reminders are facts without checkbox or progress weight. DELIVERY ORDER has one requirements ratio, no second done ratio. Unavailable messages cannot be copied; disconnected prototype messaging controls remain disabled.

**Saturday on-call boundary — owner confirmed 9 October 2026:** rotating contact coverage, default 9:00 AM–6:00 PM and editable. Answer customer, driver and warehouse calls/WhatsApp and record any required follow-up. It is not normal Saturday office attendance, PO Duty or GRN Duty, and does not automatically transfer all routine Tasks to the on-call person. Any follow-up retains its source-owned permission, normal owner and qualified cover rules. Rotation frequency remains unspecified; implementation unverified.
