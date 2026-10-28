# WORKSPACE — MASTER

> **APPROVED / LOCKED business architecture — Jess, 2026-09-03.** This is the one
> Workspace authority for Staff & Duties,
> action/approval ownership, Work and their relationship to the one global Dashboard.
> Modules own business facts and completion; Workspace coordinates them. There is no second
> Workspace Blueprint. The Workspace page is §5.10 (owner's round 3 brief, 13 Oct 2026; BUILT ON
> 2026, #2049; the signed-in production check is owed); existing HTML prototypes and prototype companion
> specifications remain exploration only.

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

### Employee-created internal tasks · OWNER-APPROVED, Jess 2026-10-14 · BUILT 14 Oct 2026, 0694 APPLIED 14 Oct 2026 · deployment and the signed-in production check owed

**RULING (Jess, 2026-10-14).** Employees may add an internal temporary task and assign it to
another employee through `+ Task`; example: Shasha asks Sara to obtain Ohana product photographs
tomorrow, which appears in Sara's Tasks. This is internal work, not a replacement for
system-generated purchasing, receipt or delivery actions. Completing a manual task does not approve
an MPR, issue/send a PO, post receipt or complete a customer delivery; those close only through
their owning module facts. Assignment grants no approval or operational permission. Preserve
creator, assignee, due date, actual completion actor/time and history. Use the existing shared
Tasks surface; no second task inbox, roster or module writer is authorised.

**How this stands beside §2 and ACTION-FLOW-STANDARD.** The law that the Portal raises every
business action and that Work has no manual `Done` is unchanged for every module's work. An
internal task is the one thing a person adds by hand. Its owning module is Workspace and its
completion fact is its own record: someone pressed `Mark done`. No rule raises it, it stands for no
other module's obligation, and it closes none.

**BUILT (FACT, 14 Oct 2026).**

- **Record.** `internal_tasks` and `internal_task_events` (0694): title, optional description,
  created_by, assigned_to, due_on, done_at with done_by; history `added` and `done`, each with its
  actor and time. Read for Operation and Principal only, no client write, four definer doors
  (`internal_task_add` · `internal_task_mark_done` · `internal_tasks_open` · `internal_task_read`).
- **Rules in the door.** The creator is the signed-in Operation or Principal account, never a
  value sent by the screen. The assignee is an active Operation or Principal account. The due date
  is today or later and an Office working day by the stored Office calendar. One request makes one
  task, so a retry after a lost answer is the same task.
- **Who finishes it.** Any Operation or Principal account may press `Mark done` (§3: being
  assigned is accountability, never an execution restriction). The person who pressed is the
  recorded actor. A second press changes nothing.
- **One Work read.** An open task is a Work occurrence of the module `workspace`
  (`workspace:{task}:internal_task`), owned by its assignee and due on its date. `Done` is written
  once through the 0584 ledger's existing completion door, so the Tasks panel and the Workspace
  page read the same `Done`. It names no party, so `Record as sent` and `Waiting` do not apply.
- **Screens.** `+ Task` in the Tasks panel's title row and in the Workspace page's `Module` title
  row (the toolbar has no room for it at 1025: measured on production 14 Oct 2026) opens one dialog: `Task name` · `Description (optional)` · `For` · `Due date`. The task is a card in its
  assignee's Tasks and a row of the `Staff tasks` module on the Workspace page (`Team Work` shows
  everyone's). Opened, it is the one task view with `Steps` and `History` only, because it serves
  no order and holds no document, and with one act, `Mark done`.
- **An open tab does not break.** A page loaded before this build is given the six sources it
  knows; this build asks the feed with `?include=workspace`.

**Boundaries held in code, each pinned by a test.** The dialog sends five facts and the API refuses
any other field. The routes call the task's own doors and the Work ledger's completion door and
nothing else; no route takes an order, PO, receipt or delivery id. Roles outside Operation and
Principal are refused by the API and again by the doors.

**0694 APPLIED 2026-10-14 through the governed path.** Numbered from the MAX across the tracker
(0693), main (0693) and every branch (none higher at the time; Purchasing then took 0695). A
rolled-back production probe first (`probe_0694_rolled_back_do_not_track`: add, a repeated request
returns the same task, four refusals, `Mark done` records its actor, a second press keeps the first
actor, a client write is refused, an outside account reads 0 rows, an outside and a signed-out
caller are refused at every door; re-read afterwards: nothing persisted), then the exact file.
Tracker name = the file's basename, `md5(statements[1])` = the file's md5
`87602bb5feda62d9c6222686d8baeaf7`, all five function bodies reconciled against `git show HEAD`.

**NOT BUILT.** A time of day · a link to a Sales Order or PO · reassign · cancel or edit after
adding · a bell note to the assignee (the Portal has no per-person notification record) · `@` notes
· `Undo` · a view of the tasks I added for others (`Team Work` shows them) · the count of working
days late (no Work projection passes a calendar yet, so a late task says `passed`).

**Named gap: the older `ops_tasks` (0162).** The order follow-up board (`FollowUpForm`,
`/api/ops/tasks`, the bell's escalated group) is a second, older hand-made task record. Measured
14 Oct 2026: 13 open rows, 12 with no assignee and tied to an order, no completion actor, no
history. It is not part of the Work read and this build left it untouched. RECOMMENDATION
(PROPOSAL / NOT LAW): retire its doors into Work rules or internal tasks so one hand-made task
record remains. Falsifier: a screen in daily use that only `ops_tasks` can serve.

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
assigns routine work independently, changes its due date or closes it. The one task a person adds
by hand is the internal task (§1 "Employee-created internal tasks"): Workspace owns that record, so
its `Mark done` is the owning module's own completion fact, never a manual `Done` over another
module's work.

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

**MONTHLY ROTATION ORDER — OWNER-APPROVED 2026-09-29 / BUILT 2026-10-09, DEPLOYED 10 Oct 2026 (#1996 `b437c2293`; production at `b21f32683`), 0671 APPLIED — see §4.4 "Leave, rota and Saturday on-call build".**
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

**Leave recorded for a colleague — owner ruling 9 Oct 2026 (Jess, corrected the same day).** Every signed-in active staff member may record leave for a colleague (for example, one who is ill and cannot log in); this is not limited to the owner or Settings editors, and recording leave is a separate permission from changing Settings. Workspace → Leave → Record leave: the person defaults to me and may be changed to a colleague; choose MC, Emergency leave or Planned leave and the dates; Submit takes effect at once with no approval; MC proof is optional. The system keeps whose leave it is, who recorded it, when, and the change history (recorded, cancelled). Today's leave starts the existing cover; future leave starts on its day. Whole days only; half-day leave is not decided. Built and DEPLOYED 10 Oct 2026 (#1996 `b437c2293`; production at `b21f32683`), 0680 APPLIED: `staff_leave.recorded_by`, `staff_leave_changes`, doors `staff_leave_submit` / `staff_leave_record_for` / `staff_leave_cancel` (unchanged 0670 rule: only the person whose leave it is cancels its future days; recording a colleague's leave gives no right to cancel it — owner correction 9 Oct 2026).

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

**Leave, rota and Saturday on-call build — DEPLOYED 10 Oct 2026 (#1996 `b437c2293`; production at `b21f32683`); migrations 0670/0671 APPLIED 10 Oct 2026;
owner authenticated walk owed.** Production acceptance (synthetic people, rolled back) passed: leave
for a colleague, no approval, MC without proof, history, today's cover to the next person:
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

### 4.4.9 · Settings editors, Company and Office — DEPLOYED 10 Oct 2026 (#1996 `b437c2293`; production at `b21f32683`); 0669 · 0674 APPLIED

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

## 5 · My Task and Team Work

```text
My Task     actions routed to the signed-in acting person
Team Work   the same actions for everyone, each with its owner
```

- `My Task` is the default for everyone, including managers.
- Team Work is the same list with an `Assigned to` column: the person the action is routed to now,
  or `Not assigned`.
- No manual `Take it`, `Release`, generic assignment or `Mark done` exists for deterministic work.
- The working week is explicit: Monday to Friday, and Saturday only while a module dates work on
  it. Late work and work with no working date are listed on today; blockers never hide the original
  required working day or missed age.
- Completed/History is read-only source evidence and preserves the actual actor.

### 5.1 · One Work set, two scopes

Work is one open set, read once and shown in two scopes. It is an operator surface, not a Dashboard,
a Kanban board or a second module record. The Workspace page that draws it is §5.10. The shell's
Tasks panel (UI MASTER §5) draws the signed-in person's part of the same set. Neither creates a
second occurrence or a second count.

**The working week.** Monday through Friday always show. Saturday appears only when an
authoritative module action remains scheduled on Saturday after applying that module's rule and the
resolved owner's working calendar. Payment keeps its locked Friday-action rule for a Saturday
deadline. Physical Receiving or Delivery work remains on Saturday when its authoritative rule and
resolved actor admit Saturday; without a qualified actor it is `Not assigned`, not silently moved.
The approved Saturday contact-support rota (§4.4) does not override these source-owned
action calendars or create duplicate operational tasks. A separate preparation action may appear on
Friday only when its owning module generates that action. A public holiday remains visible and is
named; normal work advances by the source calendar, while an authorised holiday operation remains
on the holiday and says so. Work with no working date is an admitted obligation without a lawful
day. It is listed in today's `To do`, so nothing is hidden for want of a date, and it says
`No date`, never an invented one.

**One count per occurrence.** Every action is counted once. Once its governed action day is before
today it is late: it is listed on today, keeps and prints its original required date, and is not
counted again under the past weekday. Module and owner totals count the same occurrence once, and
choosing a day never creates a second copy. A broken commitment is counted once. A blocked
occurrence keeps its date and missed age and is never hidden.

**The focus day.** On a public holiday with no authorised holiday operation, the focus day is the
next eligible governed working day; an authorised holiday operation remains on the named holiday.
FACT (`workFocusDay` · `myMissedAndToday`, `work/work-model.ts`): the `Pending work` reminder counts
what is late plus what is dated from today through the focus day. The focus day is today when today
is a working day, otherwise the next working day, and a Saturday only when something is due that
Saturday. Later days and work with no working date are not in that count. The Tasks panel and the
Workspace page do not use the focus day: they open on today (§5.10).

**Team Work** uses the same page and week. It is visible to the whole Operation team: Principal,
Operation and Jess. Visibility does not grant new module data or action permission. Every row is
visibly identified by its owner or `Not assigned`; a Site queue must not appear until its governed
identity, permission and acceptance path are built and admitted. Counts always name actions.

`My Task` is available to every active internal role that may own an admitted action, including Sales
and Finance, and returns only occurrences routed to that signed-in acting person plus source health
they are authorised to know. Team Work remains limited to Principal, Operation and Jess and still
applies underlying module permissions. The Work read boundary therefore cannot remain the current
Operation/Principal-only guard; widening the endpoint never widens an owning-module object door.

Workspace never owns or stores module truth. The task view is an action surface, not Object Detail
and not a Workspace-owned form. Every occurrence declares one interaction mode: `embedded`,
`open_module` or `read_only`. `embedded` renders the owning module's governed component and calls
that module's authoritative API with the same permission, validation, evidence, source-version,
idempotency and completion law. `open_module` uses one `Open {object}` door for complex or
high-risk work. `read_only` explains that the user can view the action here but has no admitted
execution door. Workspace never recreates a similar form or writes a substitute result.

An embedded action is admitted rule by rule, not inferred from a small-looking form. Its contract
must name the component, authoritative API/action key, permission, exact source version, required
evidence, completion predicate, specific success receipt, stale-state refusal, idempotency behaviour
and fallback owning-object door. Missing any one keeps the occurrence `open_module`. Opening
WhatsApp, copying text, uploading ungoverned evidence or marking a local checkbox never completes
business work.
`Finish when` prints the operator-safe completion statement supplied beside the
authoritative machine completion predicate. It does not expose table names or substitute
`requiredResult` merely because that sentence already exists. `Then` appears only when
the owning module supplies a separate governed consequence; Workspace never relabels the completion
predicate, required result or a likely consequence as one another.

**OWNER RULING (Jess, 2026-09-27: "workspace is stay here to complete all job"): every act is
completed inside Workspace; nothing sends the operator to another page.** Each act opens its OWNING
module's own component in place (Purchasing's supplier answer table, Receiving's receipt,
Payment's record-payment, Delivery's arrangement), so a save writes the same one record the
module page writes (ERP-ARCH laws A and C: a door, never a duplicate). Seeing a form never
grants saving it: without the Duty or permission the form shows, Save is disabled and says why.
This is the target. §5.10 lists the acts done in place today; every other act offers
`Open {object}` until its owning form is admitted under §6. Receiving/GRN, Payment, refund,
Delivery result and Service outcome are not done in place yet. A Case request, approval, uploaded
slip or checkbox never means Finance paid a refund.

Delivery proof review (`Accept proof`, `Request more proof` or `Reject proof`) uses Delivery's one
review form and Delivery's existing review truth; Workspace does not copy it.
For Delivery proof review, every file in the latest governed proof package must be readable before
`Accept proof` is available. A failed file says `Photo could not be loaded · Try again`; `Request
more proof`, `Reject proof` and the secondary `Open {Delivery Order}` door remain available. Once
all current files load, acceptance may resume. `Viewed` is temporary page assistance only: it is
not stored, is not completion evidence and creates no Work history. The UI never claims that a
driver was contacted merely because `Request more proof` was recorded; its truthful supporting
result is `More proof is required`.

### 5.2 · Work-item presentation contract

One Work occurrence is said the same way wherever it is listed: as a table row on the Workspace
page (§5.10), as a list card in the Tasks panel (UI MASTER §5) and in the one task view (03 §8).
The words of all three come from one place (`tasks/task-cards.ts`).

- Object identity belongs in the item's record line and is not repeated in the action.
- Owner belongs in the `Assigned to` column or the task view's head, never the sentence.
- `My Task` and Team Work show current `Assigned to` and use that assignment for their person scope.
  Changes remain in history; completed work separately shows `Completed by`. No cover labels remain.
  (§3, APPROVED TARGET. FACT: the Team Work column is headed `Assigned to` and the `Done` tab's
  `Completed by`; a covered list card still says `For {name}`.)
- A future Site queue is an owner state, not a person. It may render only after a governed queue
  identity, permission and atomic acceptance path are built and admitted; until then unresolved
  site work is `Not assigned`.
- The action begins with a specific verb and names its business object only when the record line
  does not already make it unambiguous. `Follow up`, `Check`, `Handle`, `Process` and `Pending` alone
  are forbidden.
- Required result belongs in the task view's `Steps` for physical handover, multi-result and
  otherwise ambiguous acts; it remains available as accessible supporting text for every item.
- Required result describes the result the actor must produce. The machine completion predicate is
  the source rule that closes the occurrence. `Finish when` uses a third, operator-safe completion
  statement bound to that predicate. These may coincide in simple cases but the UI never assumes
  they are interchangeable and never exposes schema/table language.
- Communication is the source-owned `Communication` card under the task (§5.10): the party's
  recorded channels, the owning module's message and its recorded history. It is absent for work
  that names no order and no PO. Workspace does not copy or store a second conversation and never
  writes its own message or label (COPY-STANDARD: the word follows the door the click opens).
  Opening WhatsApp or copying a message is never sent evidence and records nothing. A result
  control such as `Record supplier answer` is the owning module's own form (§5.1).
- Avatar initials are a chip with the full current name on hover, focus and tap. Departed people may
  appear only in historical evidence.

#### 5.2.1 · Authoritative Work feed contract

The Workspace page and the Tasks panel render one permission-scoped server response. They do not
join module reads in the browser, infer missing facts or keep a second Work database. Every admitted open occurrence carries
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
| Lifecycle | `to_do` or `waiting` for every open occurrence, derived from the 0584 ledger (`workLifecycleOf`) and never stored: when the request was recorded, its channel and contact, its answer day and whether that day has passed. Every list's `Waiting` reads this and nothing else |
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
each. All visible counts, day/module/owner totals and listed rows derive from this same authorised
item set and health envelope. No separately queried total may disagree with the list. Permission
scoping happens before items, people and counts enter the response; a refused scope returns no
protected count or identity.

The permission-scoped envelope may additionally carry a short-lived closure receipt for the
previously selected occurrence: source-owned result, actual actor when durably recorded, closure
reason/time and source version. It is not Work history and cannot be invented from disappearance.
Until a receipt exists, external closure uses the neutral fallback `No longer needed`; it never
names a person or result that the source did not supply.

The envelope also carries `completed`: the occurrences the owning modules finished in the last 60
days, each with its rule, record, time, result and who recorded it, read from the same ledger.
Every `Done` list reads it, and nothing synthesizes a Done row. If the ledger cannot be read the
whole read fails: a waiting item shown as `To do` would send a second request to someone already
asked.

The opened task is addressed by its stable occurrence ID in the URL. An act never removes its row
optimistically: the row leaves the list only when the re-read feed no longer carries that identity.
The task then returns to its list, the app's dark toast says the owning module's success words and
may offer `Next: {party}`, and nothing opens by itself (owner 12 Oct 2026, 03 §8). If closure
cannot be confirmed, the action stays visible and offers an idempotent retry. A link to an
occurrence that is no longer open opens the list. If its source failed, the last-safe task is
visibly non-current and has only its safe owning-object door.

Current implementation gap: contract v2 now separates deadline/action date, missed placement/age,
calendar health, rule/source version and cover evidence, and its strict transport shape requires a
viewer-resolved interaction plus an optional source-versioned closure receipt. Two projections are
`embedded` (Delivery proof review and the purchase batch's `PO sent to supplier`); every other
projector truthfully defaults to `open_module`. Viewer capability resolution and source-owned
receipt loading are not built. People-owned working eligibility, complete resolver cover periods
and governed last-safe delayed-source observations also remain incomplete. UI construction may use
fixtures for review, but production acceptance requires these facts and may not disguise a gap with
client defaults, hard-coded people/calendars, independent source calls or a copied mutation form.

### 5.3 · Filter, search and URL contract

The page's address is `/operation?tab=work` with five choices, and opening that address restores
them:

| In the address | Means | When absent |
|---|---|---|
| `scope=team` | Team Work | `My Task` |
| `status=waiting` · `status=done` | the `Waiting` or `Done` tab | `To do` |
| `module={module}` | one admitted module | `All modules` |
| `day=YYYY-MM-DD` | the chosen day | today |
| `task={occurrence id}` | the opened task | the table |

The address follows the opened task. A Dashboard or module door opens the same result by the same
address, and a door never changes business state merely by opening.

Search is the list's own: it matches the rows of the chosen tab by the words the table shows. It
never broadens permission scope and never searches a separately cached copy. Column heads sort and
filter as on every shared list (UI MASTER §6.2). Zero matches is not the same as zero work.

The module list holds only currently admitted projections: `Sales Orders` · `Purchasing` ·
`Warehouse` (Receiving's work) · `Delivery` · `Payment` · `Issue Tracker` · `Staff tasks` (internal
tasks, §1). `Service Case`,
`Warehouse Outbound` and `Claims` do not appear until their admission gates and live projection
close.

Rows stand late first, then earliest; `Done` stands newest first. A person may sort or narrow the
list but cannot reprioritise an authoritative due fact.

NOT BUILT on this page: a way to narrow to blocked work or to a failed source, and an owner or Duty
choice in the address, which §1.1's Staff & Duties and Dashboard doors need.

### 5.4 · Work states

| State | Required presentation and behaviour |
|---|---|
| Loading | Keep the page shell and applied scope/filter visible; print no number, never `0` (`Loading tasks`) |
| Empty tab | The Tasks panel's words for that tab and day, in both scopes (COPY-STANDARD "The Tasks panel words"). Only a healthy read may say them; otherwise the failed source state shows |
| No search/filter match | `No work matches these filters`; never imply the source set is empty. The list's own clear control removes the narrowing |
| Late | `Due` keeps the original date and `Status` says `{n} days late`, or `passed` when the count cannot be worked out; a purchase batch says `Cut-off passed`. Colour supports the words and is never the only signal |
| Saturday | Appears only when an admitted action remains on Saturday after module and resolved-owner calendar law; retains the Saturday business date |
| Public holiday | Day remains visible and names the holiday; only an authorised holiday operation may remain assigned there |
| Calendar not configured | Name the affected Site/owner calendar and correction door; do not invent off-days or missed age |
| Calendar read failed | Say working days could not be loaded, preserve safe dated facts and hide invented missed age; never treat failure as zero |
| No eligible actor that day | Keep the action on its authoritative day · `Nobody works {date} for {Duty}.` · `Set cover in Settings → Staff & Duties`; do not falsely say the Duty has no holder |
| Blocked | Stays on its own working day · `Blocked by {dependency}` plus the door that can resolve it; retain original working day and missed age. FACT: no projector supplies a blocker today, so these words are not drawn |
| Not assigned | `Assigned to` reads `Not assigned` · `Nobody holds {Duty}` · `Set the holder in Settings → Staff & Duties` (the door is not on the page yet) |
| Covered | Preserve normal owner and effective cover evidence; `My Task` routes to today's acting person |
| Source delayed | Preserve last safe observation and say `Could not refresh {source}` with time |
| Source failed | Isolate and name the source; never omit its possible work or convert failure to zero |
| Permission refused | `You do not have access to this work` and no leaked counts, objects or people |
| Completed/history | Leaves the open set only after the authoritative completion fact; `Done` shows result, actual actor and time |

### 5.5 · Responsive and accessibility contract

- **The page fits its window.** FACT (§5.10 "Measured"): at 1025, 1164 and 1440 the page and the
  table do not scroll sideways and no value is cut. The table is sized to the room it is given.
  From 1180 wide an opened task stands beside its pick list; under 1180 it takes the whole room.
  Widths under 1025 are not measured: a narrow or phone layout needs its own complete-page check
  before any claim (03 §10).
- The page never scrolls as one long document: the table body, the pick list and the opened task
  scroll inside their own regions (03 §1).
- Every item wraps rather than truncating problem, action, recipient, required result or working-day
  state. No horizontal owner board or hidden completion text is permitted.
- Keyboard order follows the page's reading order: the `Module` panel, the toolbar, the rows, then
  the opened task. Every item has one descriptive accessible name combining object, problem and
  action. Hover evidence is also available by focus and tap; colour, initials and icon alone never
  carry meaning. Focus returns to the invoking row after `Back to all tasks`.
- Spacing, type, radius, colour and elevation are 01's values; this MASTER holds none.

The implementation reuses the kit: `Tabs`, the shared listing engine (`register/DataGrid`,
`TwoLineCell`), `TaskView` through `TaskFrame`, the Tasks panel's day strip (`TaskDayStrip`) and the
shared task desk (`useTaskDesk`). The page's own pieces are `tasks/WorkspaceTasks.tsx` (layout) and
`tasks/workspace-table.ts` (rows and counts, asked of `task-cards.ts`). None calculates business
dates, ownership, severity, completion or source health.

### 5.6 · Priority, due and SLA law

Workspace does not store a free-form priority or invent one global SLA. Severity is derived in this
order from module truth:

1. `Broken commitment` — an explicit customer, supplier, payment or delivery promise is past and
   its completion fact is absent.
2. `Late` — the governed working day is before today on that rule's calendar.
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

### 5.7 · Work current → required gap audit: 13 Oct 2026, branch `build/workspace-v3`

| Current branch evidence | Required Blueprint state |
|---|---|
| `My Task`, Team Work and the Tasks panel read one server-composed feed | Retain; make all admitted modules use the same transport contract and source health |
| `My Task` is the default; Team Work lists everyone's work with the acting person under `Assigned to` | Retain; add complete assignment history and unresolved-Duty evidence everywhere (§3) |
| The `Pending work` reminder counts `myMissedAndToday` (late plus dated through the focus day); the Tasks panel and the Workspace page count today's `To do` (late, due today, no working date; waiting left out) | One arithmetic for a person's work today (Law D): choose one and remove the other |
| The page has scope, tab, day, module and task in its address, the list's own search and column filters | Add a way to narrow to blocked work and to a failed source, and an owner or Duty choice in the address |
| The row shows due, task, page and record, contact, last contact and status; the task view shows the problem and the required result | Keep the required result reachable on every item |
| Cells wrap and nothing is cut at 1025, 1164 and 1440 | Prove the same under 1025 before any narrow or phone claim |
| The feed gaps at the end of §5.2.1 are open | Close them before production acceptance; never disguise one with a client default |
| `Done` lists the read's `completed` occurrences with who recorded them | Never synthesize a Done row; keep the actual actor |
| `Record as sent` records a request (built on branch, §5.10); no screen records an answer that does not finish the task | Approve a word for the answer act, then build it through `/reply-received` |
| Warehouse external queue and acceptance: not re-measured on this branch | Complete identity/offboarding/transfer guards and production proof before admission claim |
| Service Case is absent; Bell remains a duplicate legacy queue | Keep Service Case excluded until owner/date laws close; replace Bell only with durable transition receipts |

### 5.8 · Work acceptance contract

Work is ready for owner acceptance only when all are demonstrable:

- every admitted source rule in §6.1 produces one stable identity and source completion removes that
  identity without a manual Done act;
- `My Task`, Team Work and the Tasks panel use one authorised response and one cache identity;
- every returned occurrence and admitted-source health record satisfies §5.2.1; one failed source
  leaves healthy-source actions usable and cannot be rendered as a complete or zero set;
- normal owner, cover, acting person, `Not assigned` and actual completed actor remain
  distinct across assignment/cover changes;
- broken commitment, late, weekday, conditional Saturday, holiday and no-working-date examples are
  each listed once under the governed working-day law;
- blockers retain the original working day and missed age, and source failure cannot reduce or clear
  any count;
- every choice in §5.3's address restores through Dashboard and module door deep links without
  broadening permission scope;
- every task exposes object, fact/problem, concrete action, recipient when applicable, required
  result, due/late fact and exact owning door across its row and its task view, without repeating
  owner/object in sentence prose;
- first open shows today's `To do`: what is late, what is due today and what has no working date;
  the day strip names a public holiday, and no occurrence is listed twice;
- a day with no `To do` prints no number; `All modules` equals the chosen tab's number and the
  module rows sum to it; the three tab numbers equal the Tasks panel's for the same person and day;
- rows stand late first, then earliest; a broken commitment says `Broken commitment` and is counted
  once; a blocked job is never hidden;
- no value is cut; after a confirmed completion the task returns to its list, the toast says the
  owning module's words and nothing opens by itself;
- under 1180 wide an opened task takes the whole room and `Back to all tasks` returns to the table;
- a communication job renders only the owning module's `Open WhatsApp group` / `Open WhatsApp` /
  `Copy message` controls and records nothing when they are used;
- each occurrence's interaction mode is explicit; an embedded action uses the owning component/API,
  refuses stale source versions, is idempotent, preserves permission/cover evidence and disappears
  only after the refreshed feed proves its completion predicate;
- Delivery proof review passes accepted, more-proof-required and rejected results plus permission,
  stale-version, duplicate-submit, uncertain-response and keyboard tests, and its primary action is
  visible at 1440×900 without scrolling (FACT: the other acts of §5.10 are already done in place;
  this evidence is not recorded for them);
- true empty, no match, delayed/failed source, permission refusal and read-only history cannot be
  mistaken for one another;
- keyboard, screen-reader and focus-return pass; the kit's own check passes at 1025, 1164 and 1440
  with the table and with a task open in both scopes, and a narrower layout is measured before it
  is claimed;
- later holder/cover changes cannot rewrite completed actor evidence. Site-queue race acceptance is
  deferred with Warehouse Outbound and is not a Work v1 acceptance condition.

### 5.9 · Logistics, Customer and Supplier: the party models (owner rulings 2026-09-24; models BUILT, cards NOT MOUNTED on any screen)

FACT, measured 13 Oct 2026 on `build/workspace-v3` and on `origin/main`: the three party cards
(`work/LogisticsCard.tsx`, `CustomerCard.tsx`, `SupplierCard.tsx`) are drawn on no screen. Their
only renderer (`work/WorkParties.tsx`) had no importer, and it is removed on this branch. Their
models and hooks are live: `logisticsCardModel`, `customerCardModel` and `supplierCardModel` feed
the task view's `Route` tab and the `Communication` card (§5.10), and `logisticsCheckDueIso` dates
the Work feed's `confirm_delivery_date`. So the Logistics card's own acts, `Create link` ·
`Copy link` · `Revoke link` among them, have no screen today. The external link rule below stands
(Delivery §5.5); where its acts are drawn is owed. This section is the rule the models compute. The
card composition under "Collapsed" and "Expanded" is APPROVED (2026-09-24) and NOT ON SCREEN.

The models are read per Sales Order: the order a task is about (a `sales_order` / `delivery_scope`
object) or, one at a time, each Sales Order a PO task serves. An order Delivery cannot read gets no
party reading, never a guessed `Logistics not assigned`. Loan appears only when a loan record
exists.

**THE CARD OWNS NO FACT.** Every write goes through a Delivery-owned component or door; the one
arithmetic is `logisticsCardModel` (`packages/shared/src/logistics-card.ts`); the order's Delivery
facts come from the Monitor card's own builder (`delivery-scope-card.ts`), the rest from Delivery's
`GET …/delivery-arrangements/:orderId/logistics-card`.

#### Collapsed: at most five facts (card composition, NOT ON SCREEN)

```
Logistics · AL Logistics                         Checks 1 of 3   ▾   ← heading
Call AL Logistics                                  ← the ONE current action
Get the scheduled delivery date · due 24 Oct       ← result · due (red once missed)
Scheduled delivery · 27 Oct                        ← only when scheduled; time only when recorded
⚠ Hold delivery · RM 1,250.00 unpaid              ← ONE exception, only when it affects delivery
```

`Logistics not assigned` replaces the heading when no company carries the delivery. Requested
date, PO, GRN, DO, money-in-general and the check rows never sit on the collapsed card.
Exception precedence: `Cannot deliver` → Finance hold → money owed → the first day-before gap.

#### Expanded: in this order (card composition, NOT ON SCREEN)

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

### 5.10 · The Workspace page: owner's round 3 brief, 13 Oct 2026 (points 3 and 4) · DEPLOYED 13 Oct 2026 (#2049, #2050) · seen signed in on production 13 Oct 2026 at 1025, 1164 and 1440, view only

Source: `docs/ui-reference/sales-order-design/docs/CODE-BRIEF-13-Oct-round3.md` and the package's
`Workspace v3.dc.html`. Where the package's words or rules differ from COPY-STANDARD or a module
MASTER, the page uses the Portal's own (01 §10.2). The owner's review of the built page is owed.
Removed with this build: the three-column page (rail, Mission and Communication columns), its route
stop cards, grouping by Sales Order, the PO view, the month grid, the `Attention` rows and the
rail's search; Git holds them, and the pictures under `docs/workspace/work-reference/` and
`docs/evidence/workspace-work/` show earlier pages, not this one.

#### The page

```text
Module            │ [My Task|Team Work] [To do n][Waiting n][Done n]            search  ⋮
‹ Mon … Fri ›     │ Due     Task               Contact   Last contact  (Assigned to)  Status
All modules   n   │ …
Sales Orders  n   │
Purchasing    n   │
…                 │                                                          {n} tasks
```

- **Left, the `Module` panel.** The day strip of the working week (the Tasks panel's own strip: a
  day's number is its `To do`), then `All modules` and the six admitted modules. Each row carries
  ONE plain number, that module's count in the chosen tab, and the rows sum to the tab's number.
  While the read is loading or failed a row prints no number, never `0`.
- **Toolbar, one line.** `My Task` · `Team Work`, then `To do {n}` · `Waiting {n}` · `Done {n}`,
  then the list's own search and ⋮.
- **Nothing chosen: one table** on the shared listing engine (UI MASTER §6.2), in this order:
  `Due` · `Task` · `Contact` · `Last contact` · `Assigned to` (Team Work only) · `Status`. `Due` is
  the date, never a relative word. `Task` is the
  task in its list card's own words over `{page} · {record}`. `Status` is `Broken commitment`,
  `{n} days late` or `Cut-off passed` in amber, `To do` or `Waiting` in grey, `Done` in green; a
  broken commitment is said before lateness. Late rows first, then the earliest. The footer reads
  `{n} tasks`. On `Done` the first column is `Done`, the time the work was finished, and the person
  column is `Completed by`. A search or a column filter that matches nothing says
  `No work matches these filters`. Every word is in COPY-STANDARD "The Workspace page words".
- **The table is sized to its room.** `Task` takes the room the fixed columns leave. Short of room,
  the fixed columns give way together, never under their floors. Under 600 of room `Last contact`
  is left to the task view's `History`; in Team Work under 700 of room `Contact` is left to the
  task view.
- **A row chosen: the pick list and the ONE task view.** From 1180 wide a narrow pick list of the
  same rows stands beside the task; under 1180 the task takes the whole room. The task view is the
  kit `TaskView` through `TaskFrame` (`Steps` · `Route` · `History` · `Files`; 03 §8), opened
  through the shared task desk `useTaskDesk`, the same hook the Tasks panel uses: the
  `Leave without saving?` guard, the owning module's success words in the dark toast with
  `Next: {party}`, the full surface for a form wider than the task, and the return to the list when
  the Work feed closes the act. `Back to all tasks` (✕) returns to the table.
- **`Communication` under the task** (`work/WorkCommunication.tsx`), for a task about one order or
  one PO: tabs `Supplier` · `Warehouse` · `Logistics` · `Customer`, the party's recorded channels
  in `To`, the owning module's governed templates, `Copy message`, the WhatsApp and Email doors and
  `History {n}`. The task's module picks the tab it opens on. A PO task shows its supplier's
  recorded channels only, and the `Warehouse` tab has no governed message yet: both say
  `Message not available`.
- **One task, one place.** The shell's Tasks panel and its pill step aside while this page is shown
  (`useShellTasks.pageHosts`), so a task is never open in two places.

#### One record (brief point 4; Law D)

The page reads the one Work read (§5.2.1), and `workspaceTable` asks the Tasks panel's own
arithmetic (`task-cards.ts`: `todoOn` · `waitingRows` · `doneOn` / `doneOnDay`). The page's three
numbers ARE the panel's three numbers for the same person and day.

| Tab | Holds |
|---|---|
| `To do` | On today: open work that is late, due today or has no working date. On another day: only the work dated that day. Waiting work is not in it. The day strip counts `To do` only |
| `Waiting` | Open work whose lifecycle is `waiting`: a request is recorded in the 0584 ledger and its answer day has not passed. It is not narrowed by the chosen day. When the answer day passes the work is back in `To do` by itself, with `No answer by {date}` |
| `Done` | The read's `completed` occurrences finished on the chosen day: mine in `My Task`, everyone's in Team Work, newest first. Only the owning module's completion fact writes one |

There is no second definition of waiting: the page does not read `communication.replyState`.

#### Acts done in place

Each act is the owning module's OWN form (§5.1); the page writes nothing itself.

| Act | Owning form | Where it opens |
|---|---|---|
| `Record supplier answer` | Purchasing's `SupplierReplySection` (Purchasing §5.7) | the host's full surface (`TaskWideSurface`) |
| `Assign logistics` · `Update date and time` | Delivery's `LogisticsDetailsEdit` · `DeliveryDatesEdit` | the host's full surface |
| Issue PO · `PO sent to supplier` | Purchasing's purchase batch task (`so-batch/BatchPanel.tsx`; Purchasing §5.6.1) | the task's `Steps`; the Issue PO review on the full surface |
| Delivery proof review | Delivery's one review form | embedded in the task's `Steps` |
| every other act | none admitted yet | `Open {record}`, the owning page |

FACT: the feed marks two of these `embedded` (Delivery proof review and the purchase batch's
`PO sent to supplier`). `Record supplier answer`, `Assign logistics` and `Update date and time` are
still `open_module` in the feed and are chosen by the task panel from the rule key
(`tasks/work-panels.tsx`); their §6 embedded-admission evidence is not recorded here.

#### Not built, and why

| Not built | Why |
|---|---|
| A person as a scope, `Take over`, a reassign | §§3 and 5 allow no manual take or reassign and no per-person tab. An approval request is a Work occurrence owned by the person holding the approver Duty (§§3–4), so it arrives in that holder's `My Task` |
| `@` notes and a bell note for a new internal task | The Portal has no per-person notification record. `+ Task` itself is built: §1 "Employee-created internal tasks" |
| `Board` and `Calendar` views | Not in the brief's point 3 |
| The act that records an answer which does not finish the task | No word is approved for it. `POST /api/operation/work/:occurrenceId/reply-received` exists and has no screen. Today a waiting task returns to `To do` when the owning module's fact changes it or when its answer day passes |
| A way to narrow to blocked work or a failed source, an owner choice in the address | §5.3 |
| Layouts under 1025 wide | Not measured |

#### Measured

FACT (13 Oct 2026, fixture previews, TEST data; `e2e-kit/kit-workspace.spec.ts`): the kit's own
`carres-check.js` answers PASS at 1025, 1164 and 1440 with the table and with a task open, in
`My Task` and in Team Work. The page and the table do not scroll sideways at the three widths, the
`Module` rows sum to the chosen tab's number, and the shell's Tasks panel is not shown beside the
page. Not measured: a signed-in production read, and any width under 1025.

#### What the `Route` tab reads

The `Route` tab is a SUMMARY (Law B) of the Sales Order behind the task: `missionRouteModel`
through `useMissionRoute`, drawn top to bottom. A task that serves several Sales Orders shows one
at a time; a task with no Sales Order says so. The points are **Proceed · PO · GRN · Contact ·
Delivery**. **Loan** appears between Proceed and PO only when a real loan record exists. The route
does not force the modules into Step 1/2/3: PO, customer, payment and logistics work may progress
concurrently. Payment and Logistics are contextual lines, not two extra permanent points. Nothing
is stored as a Workspace route status; every point is its owning module's reading.

- **Proceed**: the recorded order-to-proceed fact and date (`proceeded_at` only; never the Planned
  production start, owner ruling 2026-10-06).
- **Loan**: optional; the current loan fact and date only, never hidden under Payment. A loan is a
  loaner Unit, not financing (`ops_loan_offers`, `ops_sofa_loans`).
- **PO**: `{issued} of {total}` and the applicable supplier date or date range; `From stock` only
  when no goods still need a PO (owner decision 2026-09-25).
- **GRN**: the Warehouse's receipt progress and date, never a supplier claim and never a second
  receipt count (Stock MASTER §7). There is no duplicate `Stock received` point.
- **Contact**: the Logistics model's `2 working days before` check (§5.9), never a second clock.
- **Delivery**: the Requested date, then `Scheduled`, then `Delivered`.
- **Payment line**: one line before delivery, for an open Finance exception or for money owed with
  the one shared `paymentDeadlineOf` over Payment's stored Collection timing. FACT
  (`mission-route.ts`): it prints whenever money is owed before delivery and turns amber once the
  money affects the delivery.

A failed Purchasing read keeps the route: `PO` and `GRN` read `Unavailable`. A route that cannot be
read says so in one line and never takes the task's `Steps` down with it. A missing fact prints
`Not recorded`; nothing is guessed. Gap: an order outside the Operation orders list read draws no
route (a per-order read is owed).

#### Customer boundary (owner correction 2026-09-25; owner ruling 2026-09-26)

The assigned Logistics company contacts the customer and agrees the delivery date. Work is not a
routine Carres customer-calling queue and gives Operation no second scheduling workflow. Operation
may record the partner's facts on its behalf under Delivery §2, but the provenance remains the
Logistics company. Carres contacts the customer only when a source exception requires Carres
judgement or correction:

1. Sales Orders already knows the goods will be late (`delay_planning`) and Carres must notify the
   customer through the Sales Order door;
2. Logistics records `Requested Another Date` and Carres must decide the next arrangement in
   Delivery;
3. Logistics records `Customer Refused Delivery` and Carres must decide the next step in Delivery;
4. Logistics records `Contact Details Incorrect` and Carres must correct the phone number in the
   Sales Order.

`Contact due today`, `Waiting for customer`, `Accepted date` and a routine Carres date-agreement
checklist are not default Carres work. Outstation release remains the explicit separate
ERP-ARCHITECTURE §6.5 exception and keeps its governed proof/message rule.

**THE CUSTOMER DOOR IS ALWAYS THERE (owner ruling, Jess 2026-09-26: "customer still need
communication, never know — example: inform the customer no stock once we place the PO").** The
routine date agreement stays the Logistics company's job and generates no Carres task; but the
`Customer` tab of the `Communication` card is always present, so Operation can tell the customer
anything the moment it is known (a supplier delay after the PO, no stock, a changed plan) without
waiting for a governed exception to open a button. Opening a channel or copying text is never sent
evidence; the message template is the owning module's.

Completion is always the responsible source fact: Scheduled delivery for normal partner
arrangement; the recorded delay/customer-notice consequence for a known late order; Delivery's
decision for a requested date/refusal; or the corrected Sales Order phone number. Facts remain
owned by Sales Orders (customer/requested date, delay planning and phone) and Delivery (partner
contact result, scheduled/delivered and arrangement decision), with their source communication
evidence.

The customer model (`customerCardModel`) reads each exception from its owner: a known delay = the
Sales Order action engine has `delay_planning` or `arrange_new_delivery_date` open (read from the
one Work feed); `Requested Another Date` = Logistics' own answer (0581 link/portal) or a Delivery
contact record; `Customer Refused Delivery` and `Contact Details Incorrect` = the latest Delivery
contact record (0487). Each act opens its owner's door and writes nothing in Work. Delivery's
`customer_contact_by` (0488) informs the Monitor ladder only and never gives Work a routine Carres
contact act. The contact checkpoint is not a second clock: it is the Logistics model's
`2 working days before` check (§5.9), the partner's deadline, never a Carres task.

**Relation to customer information (UI MASTER §5):** the linked customer's information is reached
through the `Sales Order` tab inside Tasks (owner ruling 2026-10-05), and the customer-lookup
capability (all their orders and recorded history, approved 2026-09-26) keeps its approval with its
placement open. Both read the same Sales Orders / Delivery / Payment records; neither stores a copy.

#### Supplier facts (Purchasing owns them; Work reads them)

Supplier facts come from Purchasing through `GET /api/operation/pos/for-order/:orderId`: the PO,
whether it reached the supplier, the immutable `PO Delivery Date`, the latest supplier reply
(answer, reason, evidence), `Expected arrival`, the Supplier DO (`do_number`, `do_uploaded_at`),
Deliver To and the Warehouse GRN date and received quantity. The supplier model
(`supplierCardModel`) feeds the `Route` tab's PO and GRN points and the `Supplier` tab of the
`Communication` card.

- `Expected arrival` is the supplier's newest promised date (owner decision 2026-09-25; never
  `Latest date`): Purchasing's `effectiveArrivalOf` over the `tomorrow_delivery` answers. It prints
  beside the original `PO Delivery Date`, which is preserved forever, never instead of it.
- A supplier delay is recorded in Purchasing's ONE `Record supplier answer` form (owner-approved
  2026-09-25; Purchasing §5.4, §5.7): per PO goods line, `No change` · `Confirmed` · `New date`
  (server-classified `Earlier` / `Delayed`) · `Split delivery` (any number of `{n} pcs · {date}`
  batches) and `Supplier DO received`. It is never a second Workspace form. `Expected arrival` is
  per batch, and each batch carries its own day-before check. Evidence accepts photo, video and
  PDF through the shared Receiving uploader.
- The supplier pre-arrival confirmation is Purchasing's `tomorrowDeliveryCallOf` (anchored on the
  PO's expected arrival, closed by an answer about that exact date) or a Supplier DO. A short
  receipt is not received.
- A destination change on a sent PO is Purchasing's `Change Deliver To` (same PO number, new
  version, moved Units keep their IDs); Work reads the resulting stock route and never offers a
  destination editor.
- Sending a PO version is Purchasing's `PoIssueEvidence` (`PO sent to supplier`) and its `po_sends`
  record, never the Work ledger's request record.
- **Every goods need of the Sales Order counts (owner decision 2026-09-25).** Goods served from
  stock (order lines no PO of this order carries) are read as `From stock · {ready} of {total}
  ready · {Site}` (Delivery's readiness per line). `{Site}` is Inventory's `Stock Location` for the
  reserved Units (`Carres Klang` · `PJ Showroom` · a transit point, never `NETS`), and readiness
  respects Inventory's `Stock Condition`. Words follow Stock MASTER §7 (owner rulings 2026-09-25):
  never `Who has it` · `Where` · `With NETS Delivery` · `In transit` · `Stock use` ·
  `Not available`; `Inventory Status` is `Available` · `Reserved` · `Cannot sell`. Goods that need
  a PO and have none are named, never dropped: `No purchase order for this Sales Order · {n} items
  need one`, or `{n} items need a PO` beside the PO progress of a mixed order.
- **One occurrence per PO.** A PO that serves two or more Sales Orders, or stock, keeps ONE Work
  occurrence on the PO; it is never copied onto each order. Which orders a PO serves comes from
  the PO's own source-order record (`so`, `so_refs` and the per-line `po_line_sources`, 0382) and
  its purpose (0361), the same facts the PO PDF's `SO NO` column prints. Work never infers orders
  from goods or suppliers. Counts count occurrences, never POs: a purchase batch with two unsent
  POs is one task.

#### Communication and `Waiting` (owner rulings 2026-09-24 to 2026-09-28)

Every message is its owning module's; Work writes none and stores none. `To` lists only the
channels the owning record holds for that party (Supplier Master, Delivery, the Sales Order): no
free-text recipient, and no contact is invented. The message uses a governed template and inserts
only module-owned facts. An outside message never carries a missing field: without a governed
message the card says `Message not available` and `Copy message` is off. Customer messages use the
customer/order reference; Supplier uses the PO reference; Logistics uses CR/TCF and never exposes
the internal SO number through the external link. No dash is printed or copied. Evidence belongs to
the source communication event: WhatsApp screenshot, email record, Supplier DO, external-link
answer or governed phone outcome. Missing contact data must print the reason plus
`Open {party} record`, not an unexplained disabled control (NOT BUILT: today `To` is empty and the
doors are off). None of this authorises a routine Carres customer scheduling task or template.

The lifecycle of an open occurrence is derived from the 0584 ledger and never stored:

`To do → request recorded → Waiting` · `Waiting → answer recorded → To do, or the source fact
completes it` · `Waiting → answer day passes → To do` (`No answer by {date}`).

A send never completes work, and opening or copying a WhatsApp or email text is never a send. Only
the owning module's completion fact completes an occurrence; a recurring problem is a new
occurrence. The answer day is one Office working day after the request unless the rule sets its
own (`workReplyDueOn`). A recorded request stores the occurrence, channel, contact, actor, time and
answer day.

**`Record as sent`: BUILT 13 Oct 2026 (round 3 brief point 4); deployment and the signed-in production check are owed, re-measure before quoting.**
The one task view (`tasks/TaskRequest.tsx`) offers it between the facts and the tabs for open work
that names a party and is not waiting already: `After you asked {party}`, `Communication channel`
(`WhatsApp` · `Email` · `Phone` · `In person`), then `Record as sent`. It posts to
`POST /api/operation/work/:occurrenceId/request-sent` with the channel and the task's version as it
was read; the door refuses a task that changed or is no longer open and says so in its own
sentence. On success the dark toast says `Asked {party} · {channel} · Next contact {date}`, the
task returns to its list and is in `Waiting` on the Tasks panel and on the Workspace page at once,
because both read the same record. A purchase batch is not asked this way: its record is
`PO sent to supplier`. Not sent with it: which contact (the feed carries no contact id), a template
or evidence. **NOT BUILT:** the act that records an answer which does not finish the task
(`/reply-received` has no screen and no approved word).

#### Payment, Warehouse, loan and after-sales boundaries

Payment is a Route line only when it materially affects delivery; it is never a route point and
never `Blocked`. **Owner ruling 2026-09-25 (APPROVED / NOT BUILT; `../payment/MASTER.md` "Payment
inside Work"):** a collection Work item's object is the **Sales Order** (never an Invoice, so its
`Route` always draws); the task says `Balance due RM {x}` and `Ask customer to pay`; the Route's
payment line is `Payment due {day}` (`to collect by` is retired); the doors `Ask customer to pay` ·
`Record the result` · `Record payment` open Payment's own compositions in place, ONE shared
component with the Payment Monitor's row expansion (owner approval 2026-09-25: same function, two
frames). Where these sit in the one task view is not designed: Payment MASTER still places them in
the removed three-column page. One fact, one place. A permitted post-delivery clock starts from
Delivered. PO/supplier delay belongs to Purchasing; GRN/received quantity belongs to Warehouse.
Loan is its optional independent point. After-sales starts a separate mission after delivery
unless its own MASTER explicitly connects it.

#### Agreed or proposed, not built

- **Day-before supplier message: AGREED IN PRINCIPLE (Jess, 2026-09-27) / NOT BUILT.** Purchasing
  owns the template; its fields come from the real PO. Proposed wording: `Hi {supplier},` /
  `Please confirm whether {PO No} will be delivered to {Deliver To} tomorrow, {date}.` / `Please
  send the Supplier DO when available. If delivery will be delayed, reply with the new delivery
  date and reason.` Open challenge: `{date}` should be the date the check is about, which is
  Purchasing's anchor for the tomorrow check (the supplier's newest Expected arrival when one
  exists, else the PO Delivery Date). Quoting only the PO Delivery Date would ask about the wrong
  day after a supplier moved it. When Supplier, Deliver To, the date or a contact method is
  missing, no message is built and the card names what is missing.
- **Customer's decision after a supplier delay: LIST AGREED, BUILD LATER (own data and flow
  change; no control that cannot save).** One of `Accept new date` · `Choose another date` ·
  `Deliver available items first` · `Change product` · `Cancel delayed item` · `Needs manager
  decision` · `No reply`. `Change product`, `Cancel delayed item` and `Needs manager decision`
  enter their approval / amendment flow; a sentence alone never completes them.
- **A Carres call when the scheduling deadline is missed: PROPOSAL / NOT LAW / NOT BUILT (from
  Delivery MASTER §§5.1–5.2 and §9's act table).**
  - *Checkpoint:* the Logistics model's `2 working days before` check, counted back from the
    Scheduled delivery date, else the Requested date, on the Mon–Sat delivery week with Malaysian
    public holidays (Delivery §5.2).
  - *Missing fact at that check:* no Scheduled delivery date recorded, AND no customer contact
    record (0487, `ops_delivery_contacts`) that settles it: none with `Confirmed`,
    `Requested Another Date`, `Customer Refused Delivery` or `Contact Details Incorrect`. The last
    three already raise their own customer exception acts. A record with `No Answer`,
    `Asked to Call Again` or `Waiting for Customer Reply` does NOT stop the escalation.
  - *The act:* a separate occurrence, dated that check day, with Delivery's governed words: line 1
    `Call the customer`, line 2 `Get the scheduled delivery date`. The partner-chase row
    `Call {logistics}` stays its own occurrence.
  - *Owner:* the current recorded Work assignment, initially Sales Order PIC; Delivery Duty only
    when there is no PIC (Delivery §9).
  - *What closes it:* a Scheduled delivery date recorded, OR a customer contact record written by
    Carres (not on behalf of the partner) with a structured result. Opening or copying WhatsApp
    never closes it.
  - *Status:* Delivery does not raise this act today. It is built in Delivery, not on this page.
- Also not built: outstation customer confirmation before the first leg (ERP-ARCH §6.5), the
  customer chase answer link (ERP-ARCH §6.4), closure receipts for `Done` (§5.2.1) and the Ohana
  supplier-to-customer route.

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
| Purchasing · `purchase_return.pickup_missed` | **BUILT ON BRANCH 2026-09-29.** Confirmed Pickup Date passed and Stock's Outbound `Return to supplier` handover recorded no Unit collected · `Pickup date passed · Follow up supplier` (fact · action) · deep link: the PR record | PO Duty through the Shared Duty Resolver; Buddy cover acts | The Confirmed Pickup Date | A Unit collected (Stock Outbound actual pickup, Stock §12.8 — writer NOT BUILT) or a new confirmed pickup date not yet passed |
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

- **The task (13 Oct 2026, deployed with #2047 and #2049; seen signed in on production 13 Oct 2026 at 1025, 1164 and 1440, view only).** One Work
  occurrence per window. It opens as Purchasing's purchase batch task (`so-batch/BatchPanel.tsx`)
  in the one task view (03 §8; UI MASTER §5), from the Tasks panel and from the Workspace page
  (§5.10). Its list card and table row say the act in the Tasks panel's words (`Issue PO to
  {supplier}` · `Send PO to {supplier}` · `Send {n} POs to {suppliers}`, with its `Cut-off` time),
  read from the same window arithmetic the Work item was projected from. Its `Steps` hold the lines
  to buy and the POs to send through Purchasing's own doors: the approved 50/50 Issue PO review,
  the PDF downloads, the supplier's recorded channel and `PO sent to supplier`. A download or an
  opened channel records nothing. Items are business units; a Sales Order is counted once. Until
  the SO Batch read answers, the task says the Work item's own action sentence (COPY-STANDARD "The
  PO window card words"). The earlier middle card and right panel are removed.
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
| Work health | Shared Work: open, Late, blocked, unresolved owner/cover and failed source by normal owner | Team Work with exact URL filters | Eligible per admitted source; partial health required |
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
| `Today`, `Open POs`, `Late` KPI tiles | Replace with governed intervention facts; an open PO is not itself a problem |
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

- **The Workspace page: DEPLOYED 13 Oct 2026 (#2049, #2050); seen signed in on production 13 Oct 2026 at 1025, 1164 and 1440, view only.**
  Seen there: the table in both scopes, one task open with its four tabs, `Record as sent` shown and
  not pressed, the Communication card. Not seen there: a `Waiting` or `Done` row (none existed) and
  a task open inside the 320 Tasks panel (that account had no task of its own).
  Found there and fixed in the next change: a Delivery task spoken as `Call {logistics}` named the
  customer as its party, so `Contact` and `After you asked` said the customer. The party of such a
  task is the Logistics Partner (ACTION-FLOW Law 4 rung 2); with no partner recorded it names nobody. §5.10 is the page. FACT on the branch: `tab=work` renders
  `tasks/WorkspaceTasks.tsx`; the earlier page (`OperationWork.tsx`, its Mission, PO view, month
  rail and their model files) is removed, and with it every measurement this section held about
  that page. Measured on fixture previews with TEST data: §5.10 "Measured". The browser still
  validates the full v2 response at the query boundary: an old or partial contract is a visible
  read failure and can neither crash the page nor masquerade as an empty desk
  (`work-cache-isolation.test.tsx`). **Still open:** merge and deployment, the signed-in
  production read at 1025, 1164 and 1440, and the owner's review. Until this branch is deployed,
  production serves the earlier page, which this document no longer describes.

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
- `My Task`, Team Work, the Tasks panel and the `Pending work` reminder read that same cached
  response. The retired browser composition and Quick Rail Team/duty editor have been removed.
- **One cache key per read (production-verified 2026-09-13, `ed76eb43`).** The legacy
  `ops_tasks` read (header Bell, Orders Control) once cached under the SAME React Query key as the
  shared Work feed, so whichever read landed second was served the other's shape: My Work, Team
  Work, the Quick Rail counts and the Payment Monitor's owner cells went dark while the feed
  carried 215 items. The legacy read now owns `["operation","legacy-tasks"]`;
  `work-cache-isolation.test.tsx` proves both mounting orders, co-mounting, feed invalidation and
  shape incompatibility against a real QueryClient, with a negative control on the old key. A key
  collision is a silent wrong answer, never an error — every read owns exactly one key.
- `My Task` is the default for everyone. It routes by acting person; Team Work lists everyone's
  open work with the acting person under `Assigned to` and does not rewrite ownership.
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
| Information hierarchy and ASCII composition | §§5.2, 5.10 | §4.2 | Issue MASTER §§11.1–11.2 |
| Authoritative read/feed contract | §5.2.1 | §§3–4 | Issue MASTER §§5–6, 11.3 |
| Ownership, cover and actor | §§3, 5.2, 6.1 | §§4.2–4.4 | Issue MASTER §§5–6, 11.2–11.3 |
| Primary journeys/actions | §§5.1–5.3, 5.10 | §§4.3–4.4 | Issue MASTER §§4–5, 10, 11.2–11.3 |
| Search, views and filters | §5.3 | §4.2 | Issue MASTER §11.1 |
| Loading, empty, no-match, late, blocked and failure states | §5.4 | §4.5 | Issue MASTER §11.4 |
| Permission behavior | §§3–6 | §§4.3–4.5 | Issue MASTER §§11, 11.6 |
| Exact vocabulary | §§5.2–5.4, 5.10 and COPY STANDARD `Workspace destination words` · `The Workspace page words` | §§4.2–4.5 and same dictionary | Issue MASTER §§4–5, 11.1–11.4 and same dictionary |
| Responsive/accessibility behavior | §5.5 | §4.5 | Issue MASTER §§11.2, 11.4 |
| Cross-page/deep-link behavior | §§1.1, 5.3, 7 | §§1.1, 4.2 | §§1.1 and Issue MASTER §§11.1–11.2 |
| Current → proposed evidence | §5.7 | §4.6 | Issue MASTER §11.5 |
| Testable owner acceptance | §5.8 | §4.7 | Issue MASTER §11.7 |

The page Blueprint is reviewable when every row points to current truth with no contradiction. The
pages are built only when their acceptance contracts pass against current implementation and real
authorised accounts. The global Dashboard remains outside these three destinations and retains its
separate §§8–8.6 contract. Notifications and the right-rail boundary retain the supporting §7–7.1 contract and
never become additional Workspace destinations.

### 13.1 · Owner-review result — Workspace page 13 Oct 2026 (review owed); Duty placement 2026-09-28

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

**The Workspace page is §5.10** (owner's round 3 brief, 13 Oct 2026; BUILT ON BRANCH
#2049, deployed 13 Oct 2026; seen signed in on production 13 Oct 2026 at 1025, 1164 and 1440, view only). The owner's review of the built page is owed. The earlier Work
designs (the three-panel review surface of 2026-09-16 and the stop-card page of 2026-09-28) are
replaced by it; Git holds them, and their fixtures were never authority.

**Saturday on-call boundary — owner confirmed 9 October 2026:** rotating contact coverage, default 9:00 AM–6:00 PM and editable. Answer customer, driver and warehouse calls/WhatsApp and record any required follow-up. It is not normal Saturday office attendance, PO Duty or GRN Duty, and does not automatically transfer all routine Tasks to the on-call person. Any follow-up retains its source-owned permission, normal owner and qualified cover rules. Rotation frequency remains unspecified; implementation unverified.
