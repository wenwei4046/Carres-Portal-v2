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
  Work
  Staff & Duties
  Issue Tracker
```

`Workspace` is the left-bar section label for coordination destinations, not a landing page and not
another Dashboard. Selecting `Work` opens My Work by default for staff and managers. Dashboard may
drill into filtered Work, while Work never becomes a Dashboard tab.

### 1.1 · Three-destination relationship

| From | To | Exact reason and preserved context |
|---|---|---|
| Work item | Owning module object | Perform or record the required result; Work scope/filter remains in the URL |
| Work `Not assigned` | Staff & Duties | Open the exact unresolved Duty; returning restores the same Work result |
| Staff & Duties Duty | Team Work | Read-only `Open Team Work` with exact normal-owner/Duty filter; Staff & Duties never composes rows |
| Issue Tracker Current Action | Work or same Issue result section | Shared action identity; no copied task and no second completion |
| Work Issue item | Issue workspace | Open exact Issue and Current Action; My/Team scope remains recoverable |
| Issue linked object | Owning module object | Read/write business truth there; Issue selection remains recoverable |
| Owning module problem | Issue Tracker intake | Prefill typed source object and observed facts; the module event remains authoritative |
| Dashboard Work health | Team Work | Exact URL-visible health/owner/timing filter; Dashboard never shows action rows |

Browser Back returns to the same scope, saved view, search, filters, selected owner/Duty and scroll
position where technically safe. A cross-page door never changes business state merely by opening.

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
| Next, when one exists | Governed consequence, not a Workspace promise; absence does not block admission |

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

People/HR also owns each employee's normal working-week eligibility. Module calendars own
business-open days and public-holiday/special-date rules. The Shared Duty Resolver combines the
person calendar with the module calendar for the resolved actor; Staff & Duties displays that result
but does not become a second People calendar editor.

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
│                                  │ [Assign holder] [Add cover]               │
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

`Assign holder` opens a focused action surface with `Duty`, `Holder`, `Effective from`, optional
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

#### 4.4.1 · Staff & Duties validation and refusal copy

| Condition | Exact sentence |
|---|---|
| Holder missing | `Choose a holder.` |
| Assignment start missing | `Choose when this holder starts.` |
| Assignment end before start | `Until must be on or after Effective from.` |
| Ineligible/inactive holder | `{name} cannot hold {Duty}. Choose an eligible active staff member.` |
| Conflicting primary period | `{Duty} already has a holder for these dates. Choose different dates.` |
| Cover person missing | `Choose who will cover this duty.` |
| Cover is normal holder | `Choose another person to cover {Duty}.` |
| Cover dates missing/reversed | `Choose valid cover dates.` |
| No normal owner for whole cover period | `{Duty} has no normal holder for all these dates. Assign the holder first.` |
| Conflicting cover | `{Duty} already has cover for these dates. Choose different dates.` |
| Eligibility changed before save | `{name} can no longer cover {Duty}. Choose another eligible staff member.` |
| Unknown failure | `{Duty} could not be updated. Try again.` |

Client validation may guide early, but the server returns the same business refusal and remains
authoritative. No message says `Invalid`, `Error` or `Something went wrong` without the repair.

### 4.5 · Access, states and responsive behaviour

| State | Required presentation and behaviour |
|---|---|
| Non-manager | Full authorised read view · `Duty assignments are set by the manager.` · no disabled or hidden write imitation |
| Loading | Catalogue/detail skeletons retain page geometry · `Opening Staff & Duties…` is acceptable accessible status |
| Empty catalogue | Configuration failure, because the governed catalogue is code-owned; never `No duties yet` |
| No search match | `No duties match this search` · `Clear search`; catalogue truth remains healthy |
| Not assigned | `Not assigned` · `Nobody holds {Duty}.` · manager sees `Assign holder`; Work remains visible under Duty word |
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

### 4.7 · Staff & Duties acceptance contract

The page is ready for owner acceptance only when all are demonstrable:

- every shared catalogue Duty appears once and an unknown/missing catalogue response fails visibly;
- today's normal owner, acting cover and `Not assigned` answer match the Shared Duty Resolver byte
  for byte on Staff & Duties, Team Work and one protected module door;
- manager and non-manager sessions see the exact §4.5 capabilities with no leaked write control;
- current, future and ended assignments/covers resolve on the correct company date boundary;
- inactive, departed, external Warehouse, same-as-holder and otherwise ineligible people are absent
  or refused at the authoritative write door;
- assignment and cover overlap/race attempts cannot yield two effective answers;
- success, known refusal, uncertain response and retry preserve one append-only act and honest UI;
- search/no-match/read-failure/history-empty states and deep links retain their required meaning;
- names, dates, action controls and history remain readable and operable at 1440, 1024 and 390px;
- changing the current holder/cover updates open/future Work routing without rewriting completed
  actor evidence.

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
Kanban board or second module record. Owner-approved 2026-09-16: the primary navigation is the
working week, and large desktop uses three working panels inside the existing global shell.

```text
┌ WORKING DAY / MODULE ┬ ACTIONS ───────────────┬ SELECTED ACTION ─────────────┐
│ Missed      {count}  │ {object} · {module}    │ {object} · {module}          │
│ Mon, {date} {count}  │ {fact or problem}      │ {recipient, when applicable} │
│ Tue, {date} {count}  │ {specific action}      │                              │
│ Wed, {date} {count}  │ {recipient/context}    │ CURRENT FACT                 │
│ {holiday name}       │ {timing/state}         │ {fact or problem}            │
│ Thu, {date} {count}  │                        │                              │
│ Fri, {date} {count}  │                        │ ACTION                       │
│ Sat, {date} {count}  │                        │ {specific action}            │
│ No working date      │                        │                              │
│             {count}  │                        │ REQUIRED RESULT              │
│                      │                        │ {required result}            │
│ All          {count} │                        │                              │
│ Sales Orders {count} │                        │ FINISH WHEN                  │
│ Purchasing   {count} │                        │ {completion statement}       │
│ Receiving    {count} │                        │                              │
│ Delivery     {count} │                        │ [Open {object}]              │
│ Payment      {count} │                        │                              │
│ Issue Tracker{count} │                        │                              │
└──────────────────────┴────────────────────────┴──────────────────────────────┘
```

Panel 1 chooses the working day and module. Panel 2 lists the matching authorised actions. Panel 3
shows one selected action's fact, specific act, source-owned communication where admitted, required
result and exact owning-object door. `Missed` contains actions whose governed working day has passed;
the original day and working-day age remain visible. Previous/next controls move the selected week
without changing scope or filters. Monday through Friday always show. Saturday appears only when an
authoritative module action remains scheduled on Saturday after applying that module's rule and the
resolved owner's working calendar. Payment keeps its locked Friday-action rule for a Saturday
deadline. Physical Receiving or Delivery work remains on Saturday when its authoritative rule and
resolved actor admit Saturday; without a qualified actor it is `Not assigned`, not silently moved.
There is no invented `Saturday Duty`. A separate preparation action may appear on Friday only when
its owning module generates that action. A public holiday remains visible and is named; normal work advances by
the source calendar, while an authorised holiday operation remains on the holiday and says so.
`No working date` is an admitted obligation without a lawful day and never pretends to belong to
today. Broken commitment remains the highest attention fact on the affected row; it is not another
weekday bucket.

Every action belongs to exactly one working-day count. Once its governed action day is before today,
it moves into `Missed`; the row retains and prints the original required date, but that occurrence is
not counted again under the past weekday. `All`, module and owner totals count the same occurrence
once. Day selection never creates a second copy.

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

Workspace never owns or stores module truth. In the first release, Panel 3 is an action brief, not
Object Detail and not a module-writing surface. It shows the fact, specific act, recipient,
source-provided communication evidence, completion condition, source-provided next consequence and
one `Open {object}` door. It does not show `Copy message`, `Open WhatsApp` or another communication
control in the first release, because those governed module controls may record preparation evidence.
A `FINISH WHEN` block prints the operator-safe completion statement supplied beside the
authoritative machine completion predicate. It does not expose table names or substitute
`requiredResult` merely because that sentence already exists. `WHAT HAPPENS NEXT` appears only when
the owning module supplies a separate governed consequence; Workspace never relabels the completion
predicate, required result or a likely consequence as one another.
A later release may admit an
owning module's governed action component only through a separately approved contract using that
module's authoritative API, permission, validation, evidence and completion fact.

### 5.2 · Work-item presentation contract

Each visible item uses the approved two-line action grammar beneath structured object metadata:

```text
OBJECT LABEL · MODULE OR SITE CONTEXT          metadata/header
FACT OR PROBLEM                               line 1
ACTION · RECIPIENT (when applicable)          line 2
WORKING DAY / MISSED AGE · exceptional state  metadata/footer
```

- Object identity belongs in the item header and is not repeated in the action.
- Owner belongs in the Team group/avatar or exceptional cover/handover metadata, never the sentence.
- My Work omits the signed-in person's avatar. It shows `Covered for {normal owner}` when routed by
  active cover. Team Work keeps the normal owner's group and shows `Covered by {acting person}`.
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
- Communication is a read-only structured source-owned block in Panel 3: recipient, channel, actual
  sent evidence and reply state when the source truly supplies them. It is absent for
  non-communication work. Workspace does not copy or store a second conversation. Module-owned
  preparation/send controls remain in the owning module; opening WhatsApp is not sent evidence.
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

The selected action is addressed by its stable occurrence ID in the URL. After refresh, if source
completion law removed it from the open set, Work returns focus to the next visible row and states
that the previous action is no longer open; it does not preserve a stale actionable brief. If a
filter removed it, the list retains the filter and selects the first matching row. If its source
failed, the last-safe brief is visibly non-current and has only its safe owning-object door.

Current implementation gap: the existing shared item shape does not yet carry the complete calendar
identity/health, business-deadline-versus-action-date, communication evidence, observation version
or separately governed next consequence above. The current endpoint composes its sources as one
all-or-nothing read, so one rejection can erase otherwise healthy Work. UI construction may use
fixtures for review, but production acceptance requires this contract and may not disguise the gap
with client defaults, hard-coded people/calendars or independent source calls.

### 5.3 · Filter, search and URL contract

Search matches the authorised open set by object number/label, customer, supplier, recipient,
problem and action. It never broadens permission scope and never searches a separately cached copy.

Filters are: `Scope` (`My Work` · `Team Work`), `Week`, `Working day` (`Missed` · admitted weekdays ·
Saturday when generated · `No working date`), `Module`, `Owner` (Team only), `Waiting for reply` where sourced, `Covered`,
`Blocked` and `Source failed`. `Broken commitment` is an attention filter, not a synonym for
`Missed`. Multiple filters combine and every active filter is
visible, individually removable and represented in the URL so Dashboard and Right Rail can open
the exact same result. `Clear all` preserves the current scope. Refresh re-reads the one feed and
does not change business state.

The Module filter lists only currently admitted projections: `Sales Orders` · `Purchasing` ·
`Receiving` · `Delivery` · `Payment` · `Issue Tracker`. `Service Case`, `Warehouse Outbound` and
`Claims` do not appear until their admission gates and live projection close.

Default ordering inside a working day is broken commitment, module-governed materiality, oldest
opened occurrence, then object label. Users may narrow
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
| No eligible actor that day | Keep the action on its authoritative day · `Nobody works {date} for {Duty}.` · `Set cover in Workspace → Staff & Duties`; do not falsely say the Duty has no holder |
| Blocked | Name the dependency and the door that can resolve it; retain original working day and missed age |
| Not assigned | Group under the governed Duty word · `Nobody holds {Duty}` · `Set the holder in Workspace → Staff & Duties` |
| Covered | Preserve normal owner and effective cover evidence; My Work routes to today's acting person |
| Source delayed | Preserve last safe observation and say `Could not refresh {source}` with time |
| Source failed | Isolate and name the source; never omit its possible work or convert failure to zero |
| Permission refused | `You do not have access to this work` and no leaked counts, objects or people |
| Completed/history | Leaves the open set only after the authoritative completion fact; history shows result, actual actor and time |

### 5.5 · Responsive and accessibility contract

- Work uses the existing 50px Page Header. At three-panel width it has one 45px Work Toolbar; at
  two-panel width its controls may wrap into a second 45px row because working day and module have
  moved out of Panel 1; below 768px they use the single-panel control stack. It creates no second
  title, breadcrumb, KPI band or card header. The controls contain `My Work · Team Work`, Search,
  applied filters, `Clear all` when narrowed and the Filters door; freshness is a read fact, not a
  manual business action.
- Breakpoints use the available Work canvas after the global shell, not the browser width. At
  **1104px or wider**, show all three panels: Panel 1 is the governed 240px `FilterRail`; Panel 2 is
  360px; Panel 3 takes the remainder and never falls below 500px. The full composition may use up
  to the governed 1280px content width. Straight 1px `slate-5` dividers separate panels; the shell
  has no card radius, shadow or gutters between panels.
- From **768px through 1103px**, collapse Panel 1 into toolbar controls. Panel 2 is 340px and never
  below 320px; Panel 3 consumes the remainder and never below 420px. If both minima cannot be met,
  use the single-panel transition instead of squeezing text.
- Below **768px**, show one panel at a time. Working day is a horizontally scrollable selector above
  the list and module/owner live in kit Select controls. Selecting an action replaces the list with
  full-width detail. Browser and visible `Back to work` restore week, day, module, owner, filters,
  selected occurrence and list scroll. No permanent drawer or sideways three-panel page exists.
- The page body does not own one long desktop scroll. Panel 1, Panel 2's action region and Panel 3's
  detail body scroll independently beneath fixed panel headings. On single-panel screens the active
  panel owns normal document scroll.
- Panel 1 uses the existing `FilterRail` geometry: 12px outer padding, its governed 20px component
  group gap (an existing kit exception, not a new page spacing token), and 8px heading-to-
  row gap and 36px minimum rows. Selected rows use `blue-3` plus the straight 2px `blue-9` inset
  marker; hover is `slate-3`. Counts are neutral, right-aligned and tabular. Long governed labels
  wrap; the rail never truncates them.
- Panel 2 has a 44px heading and selectable action rows with 12px vertical / 16px horizontal
  padding, 4px internal gaps and 1px `slate-5` dividers. A row is at least 88px but grows to show the
  complete object, fact/problem, action, recipient and timing state. Selection uses the same
  `blue-3` + 2px inset marker; hover remains grey. Work items are rows, never individual Cards.
- Panel 3 has 24px horizontal / 16px vertical heading padding and a left-aligned detail body no wider
  than 760px, with 24px major-section gaps. It renders in this order: object and module; current fact;
  action and recipient; `REQUIRED RESULT`; read-only communication evidence when sourced;
  `FINISH WHEN`; optional
  `WHAT HAPPENS NEXT`; timing/owner/cover/source evidence; one `Open {object}` primary door. In v1
  there is no sticky send/record bar and no second primary action.
- Desktop controls retain their owning kit geometry; Work does not force Tabs, SearchInput, Select
  and Button to one height. Below 768px, every interactive target is at least 40px high
  with 8px between adjacent targets. Page padding is 24px on multi-panel content headings and 12px
  on single-panel screens. Only the frozen spacing, type, radius, colour and elevation tokens apply.
- Every item wraps rather than truncating problem, action, recipient, required result or working-day
  state. No horizontal owner board or hidden completion text is permitted.
- Keyboard order follows scope → search → working day → module/owner → filters → items → selected
  detail. Every item has one descriptive
  accessible name combining object, problem and action. Hover evidence is also available by focus
  and tap; colour, initials and icon alone never carry meaning. Focus returns to the invoking row
  after Back; when that occurrence closed, it moves to the next visible row and announces the change.
- Acceptance captures and measures 1440×900, 1180×820, 820×900 and 390×844. It records actual
  canvas/panel widths, overflow, focus order and wrapped action content; a screenshot without those
  measurements is not responsive proof.

The implementation reuses `PageShell`, `Tabs`, `SearchInput`, `Select`, `Button`, `FilterRail`,
`FilterRailGroup`, `FilterRailRow`, `Loading`, `EmptyState`, `Badge`, `Tooltip` and Lucide icons.
Status text that must wrap does not use the truncating `StatusPill`. A shared `Avatar` must first
govern one initials algorithm plus full-name hover/focus/tap behaviour; Work may not choose among
page-local avatar recipes. The only page-specific pieces permitted are `WorkSplitShell` (geometry), `WorkDayNav`
(provided dates/counts), `WorkActionRow` (presentation) and `WorkActionBrief` (structured read-only
detail). None calculates business dates, ownership, severity, completion or source health. They are
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
5. `No working date` — the module explicitly admits an obligation with no lawful clock.

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
| Right Rail reads the same cache and opens `when` filters | Retain; all supported filters must be URL-visible and use the same vocabulary |
| Current main Work page has scope toggles and limited Rail-linked time filtering | Add governed search, visible filter controls, module/owner/cover/blocker/source filters and no-match state |
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
- My Work, Team Work and Right Rail use one authorised response and one cache identity;
- every returned occurrence and admitted-source health record satisfies §5.2.1; one failed source
  leaves healthy-source actions usable and cannot be rendered as a complete or zero set;
- normal owner, cover, acting person, `Not assigned` and actual completed actor remain
  distinct across assignment/cover changes;
- broken commitment, missed, weekday, conditional Saturday, holiday and no-working-date examples order once under
  the governed working-day law;
- blockers retain the original working day and missed age, and source failure cannot reduce or clear
  any count;
- search and every filter in §5.3 combine, serialize to the URL and restore through Dashboard/Rail
  deep links without broadening permission scope;
- every row exposes object, fact/problem, concrete action, recipient when applicable, required result,
  due/late fact and exact owning door without repeating owner/object in sentence prose;
- true empty, no match, delayed/failed source, permission refusal and read-only history cannot be
  mistaken for one another;
- keyboard, screen-reader and focus-return pass; measured 1440×900, 1180×820, 820×900 and 390×844
  layouts record both portal-sidebar state and actual Work-canvas width and preserve the complete action;
- later holder/cover changes cannot rewrite completed actor evidence. Site-queue race acceptance is
  deferred with Warehouse Outbound and is not a Work v1 acceptance condition.

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

This is a governed-rule catalogue, not proof that a rule is live in the current feed. A rule is
admitted only when §10 records its projector evidence and every §6 gate passes, including the
operator-safe completion statement required by §5.2.1. The current feed has no such statement field,
so no existing occurrence may be presented as contract-v2 complete; review fixtures must say they
are fixtures, and production keeps the current page until each admitted projection is upgraded.

| Owning module · action identity | Why it exists / required result | Owner rule | Due law | What closes it / next |
|---|---|---|---|---|
| Sales Orders · `ask_delivery_date` | Requested delivery date absent · obtain the customer's date or `not yet` answer | Responsible Salesperson | `No date` for admitted legacy rows | Requested Delivery Date or governed no-date answer exists · order planning continues |
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
| Warehouse · `warehouse.outbound_handover` | **Not admitted:** dated pickup has Units not handed over · exact receiver/proof result | Requires governed personal NETS operator or admitted Site queue; neither is currently built | Scheduled Site handover date on Warehouse calendar | Every required Unit has accepted handover evidence · admission waits for governed owner/acceptance |
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
| Payment/Stock · `payment.check_stored_furniture` | **Not admitted:** open storage case reached inspection interval · inspection result | Warehouse capability/owner rule; admission waits for a governed person resolution | Last check/storage start + configured interval | Due inspection recorded |
| Finance exception · `resolve_payment_exception` | Open Finance exception holds delivery · clearance evidence | Finance owner rule; unresolved must remain Not assigned | Immediate | Exception cleared with evidence · delivery gate re-evaluates |
| Claims · `claims.confirm_what_happens_next` | **Not admitted:** supplier answered but Carres resolution absent · customer resolution | PO Duty holder from claim-open month, retained historically | Governed `No date` | Customer resolution recorded · admission waits for a qualified live projection |
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

The Right Rail's `My Work` slot is a glanceable doorway into main My Work. It is not another scope,
feed or action surface:

```text
┌ My Work ─────────────────────┐
│ 3 missed                     │
│ 5 today                      │
│                              │
│ Open My Work                 │
└──────────────────────────────┘
```

The slot reads the same authorised response and cache identity as main Work. It shows only non-zero
`Missed` and `Today` counts plus `Open My Work`; it does not preview rows, Team workload, other
weekdays or `No working date`. Selecting a count opens main My Work with the corresponding URL-visible filter and
preserves the page the operator came from for Browser Back. `Open My Work` opens the unfiltered My
Work default. The slot contains no independent calculation, Duty editor, cover chip, assignment or
completion control.

Loading retains the slot label and uses count placeholders, never zero. A healthy clear state says
`No work due now` and retains `Open My Work`. A source failure says `My Work could not be refreshed`
and retains the last-safe counts with their observation time where permitted; it never prints a
clear state. Permission refusal hides counts and objects. On widths where the global Right Rail is
not present, the shell's existing Work destination remains the only replacement door; no floating
mini-queue or mobile drawer is created. Keyboard and accessible names state what each count opens.

Notifications are event receipts—assigned, cover activated, became missed, unblocked, source failed
or completed. Each receipt carries one durable event identity, the affected Work identity, recipient,
event time and exact Work/object door. It describes what changed; it never repeats the full action
row or supplies `Done`, assignment or result controls. Read/dismiss changes only receipt state and
never changes Work, owner, due date or completion. Duplicate delivery of one event remains one
receipt. The Bell is not a second queue.

Notification loading, true empty, delayed source and failed source are distinct. `No notifications`
is allowed only after the complete authorised receipt source is healthy. A failed receipt source
does not alter Right Rail or Work counts. Until durable transition receipts exist, the current Bell
remains legacy debt and may not be presented as this contract.

### 7.1 · Right Rail and notification acceptance contract

- Right Rail and My Work return the same `Missed` and `Today` identities and counts for the same
  authorised person and observation;
- every Rail count opens main My Work with one visible, removable URL filter and Browser Back
  restores the originating page;
- loading, healthy-clear, delayed/failed and permission-refused states cannot be mistaken for zero;
- no Rail or Bell control can assign, cover, complete, dismiss Work or record a module result;
- one Work transition produces at most one durable receipt for each governed recipient, and
  read/dismiss cannot change the Work occurrence;
- desktop keyboard/focus behavior and the narrow-screen absence of the Rail leave one obvious Work
  destination without clipped counts or hover-only meaning.

## 8 · Global Dashboard Blueprint — composition and intervention contract APPROVED / LOCKED, 2026-09-24

Jess approved the composition and Needs intervention contract; detailed refinements in §8.1.2
remain PROPOSAL / NOT LAW. This is the one Dashboard authority. Approval is product truth,
not proof of implementation or production readiness. No production code, Cards or deployment is
authorised by this PLAN closure.

### 8.1 · Purpose and composition — owner-approved, 2026-09-24

Dashboard answers **what management needs to know or intervene in**; Work answers **what staff
must do**. Exactly one independent top-level Dashboard; WORKSPACE contains only Work, Staff & Duties
and Issue Tracker. Dashboard owns no business write, assignment, deadline or completion. Its approved
reading order replaces the earlier composition:

```text
Dashboard — scope · business date · source health
┌ Needs intervention ────────────────────────────── count ┐
│ Exact fact / object + dated evidence / consequence   open│
├ Today's operation ──────────────────────────────────────┤
│ Delivery · expected/received goods · customer money     │
│ Critical Issue / Service events                         │
├ Work health ────────────────────────────────────────────┤
│ Normal-owner summaries · Not assigned · Blocked filter  │
├ Business exposure ──────────────────────────────────────┤
│ Customer / supplier promises · cash · stock · delivery  │
│ Unrecovered claim / service cost — separate tracks       │
├ Recent material changes ────────────────────────────────┤
│ Only evidenced changes affecting management decisions   │
└────────────────────────────────────────────────────────┘
```

Today's operation reads dated business facts (planned/failed/threatened delivery; goods expected,
arrived or date unconfirmed; money due/received/material risk; critical Issue/Service events), not
arbitrary Today/Upcoming/Pending KPI cards. Inclusion requires a management intervention, priority,
approval, unblock or investigation consequence. Do not copy My Work, all open POs/orders, future
task lists, notifications or a Duty editor. Every live fact still requires its owner's meaning,
threshold where applicable, permission, observation, recovery and exact destination contract.

Work health reads the same Team Work population/filters and normal-owner resolution. Current
Operation roster is Shasha and Yu Jun; names are read from active People/resolver facts, not coded
as a list. Disabled Khor Yee must not appear in current grouping (historical actor evidence remains).
Not assigned is the unresolved set; Blocked is orthogonal, not a fictional normal owner or an
additive extra group. Work's authority is b9661e36e on codex/workspace-work-v4, PR #1533; do not
rewrite its sections, copy Work cards or import its 240/360/detail panel widths into Dashboard.

Business exposure never nets unlike tracks. Recent material changes requires durable, idempotent
owning-source evidence; failed reads, dismissed notices and lost access are not recoveries. Existing
§8.2 definitions remain valid only within their named measure scopes; the expanded intervention
families below are approved candidates, not a claim that every source is already admitted/built.
Held-source prerequisites in §8.3 remain binding, not permission to silently omit domain coverage.
Right Rail, Reports, exports, calendar and external communication keep their own homes.

### 8.1.1 · Needs intervention — owner-approved contract, 2026-09-24

One full-width first Panel, never KPI cards or a second Work queue. Each row has an exact management
fact (14px/600), object plus dated evidence (12px/500), business consequence (muted 12px), and a
right-aligned approved destination icon. Use the confirmed Carres kit: blue section title, white
bordered Panel on cool-grey canvas, square/low-radius geometry, no decorative blue outline or
card-wall styling. The scoped typography ruling is recorded in 01-design-tokens; it does not change
Work or any other page. ASCII symbols in owner sketches are not production icons.

Every intervention supplies fact, business consequence, materiality/threshold source, owner OR
responsible module, observed time, exact deep link and recovery condition. Missing owner is allowed
as the fact only when the responsible module is known. A routine Missed action without a business
consequence remains in Team Work. Severity/threshold belongs to its owning module, not Dashboard.

Approved candidate families (permission and source evidence still gate each live row):

- Customer: promised delivery did not happen; promised payment not received; approved recovery has
  no next step; material Service Case exceeded its governed response/solution clock.
- Purchasing: supplier promised date passed; material purchase cannot proceed; supplier claim lacks
  governed resolution; critical receipt/stock discrepancy affects a customer commitment.
- Delivery/Warehouse: failed delivery without a next step; customer delivery blocked; loan item not
  collected; critical goods unavailable for confirmed delivery.
- Money: payment exception blocks delivery; material balance crossed its governed threshold;
  overpayment/refund decision awaits authorised approver; money source failed or cannot reconcile
  material exposure. This grants no new refund policy, approval permission or unpaid-delivery release.
- People/system: no owner; no cover on an actionable date; material overload against governed peer
  capacity; module source failed; calendar/permission failure hides actionable work. No overload
  threshold, work-effort weight or peer-capacity assumption is invented by this approval.

Whole row opens exactly one true management destination: ownership → Team Work exact filter;
module business fact → exact object/module view; source failure → safe source-health/error detail.
No Done, Assign or business form. Source-health detail must remain available when the business
source fails; a raw exception/stack/credential is never exposed. Normal permission exclusion is
not a system fault; only an evidenced unexpected failure of required authorised coverage qualifies.

A recovered issue leaves only on its owning recovery condition. It may enter Recent material
changes only through a durable idempotent source transition, never by guessing from absence, a
failed refresh or lost permission. An unresolved occurrence can change its fact without duplicating
its identity. Do not use standalone Urgent, High priority, Needs attention, Problem or Exception.
A specific statement such as Payment exception blocks delivery is allowed: it says what happened.

### 8.1.2 · Needs intervention refinement — PROPOSAL / NOT LAW

The approved contract above is persisted immediately. The following detailed presentation and
admission recommendations await owner review; they must not silently become business policy.

- Header count counts distinct authorised intervention rows, not affected actions, orders, RM or
  the sum of heterogeneous populations. One grouped owner gap affecting three actions counts as
  one row; each distinct source failure counts once. Complete data and identical predicates must
  reconcile count and rows. For partial data use `{n} confirmed · incomplete`, never a complete 0.
- Stable identity is owning rule/version + source scope + occurrence. Group only identical fact,
  consequence and recovery semantics whose exact union has ONE destination. A grouped ownership
  row deduplicates action IDs; orders without PIC qualify only where that absence demonstrably
  leaves an admitted action owner unresolved. PIC absence alone is not ownerlessness.
- Distinct business failures on one SO may remain separate when their recovery and management
  destinations differ. A specific payment-block row replaces a generic delivery-block row for the
  exact same cause/scope; other independent blockers stay visible. Overdue and no-next-step are
  distinct facts but combine only when one exact destination explains both without losing evidence.
- Order by source-owned critical/safety consequence, failed customer commitment or blocked confirmed
  delivery, other governed material exposure, ownership/capacity failure, then source-health gaps;
  persistent coverage warning stays visible above rows. Within each band sort by oldest governing
  business date then occurrence ID. No generated priority labels or staff ranking.
- Show earliest relevant business deadline in evidence; observed time remains separately readable.
  A passed date with no result is `Delivery result missing`, not proof of actual non-delivery;
  `Delivery promise missed` requires source evidence of missed customer delivery. Rebooking after
  a missed promise does not erase its history or alone prove recovery.
- Missing proof is distinct from missing result. Customer remedy/claim no-next-step requires a
  defined source continuation rule and demonstrably absent successor, not an empty UI section.
- Approved Service solution clock can be used with its lawful extension/calendar; do not invent a
  response clock or infer materiality from age. Supplier Claim uses its current owning timing rules,
  not PO reply timing. A supplier's physical non-arrival allegation first checks Receiving evidence.
- Loan collection requires the source due event and absent accepted return evidence. Confirmed goods
  shortage requires exact reserved scope/readiness, never a generic SKU low-stock count. A future
  supplier PO is not received Ready Stock and cannot be counted again with its received Unit.
- Material purchase, material balance, claim/Service exposure, refund decision and peer overload
  remain source-unqualified where their governing threshold/approval/capacity contract is missing.
  Report a proven source/configuration gap with its consequence, not a fabricated business incident.
- Overpayment requiring an existing Payment Approver decision reads canonical unallocated/excess
  money; resolution is source-recorded allocation/classification/authorised decision. An approved
  refund path is distinct; ordinary refunds are not introduced by this candidate.
- `Delivery is blocked by payment review` is the proposed consequence instead of `Delivery cannot
  be released`: the latter suggests a manual Release door that existing Delivery law retires.
  Clearing the payment-review incident does not claim all remaining Delivery gates have passed.
- Row click/Enter follow the same link with one focus target; right icon is not a second action.
  Approved entity icons (delivery, money, supplier, people) identify domain; use open for the right
  destination and refresh for source-read failure. Text carries severity; no emoji, local glyph or
  unapproved warning icon. At 390px all three levels wrap, evidence and money never truncate.
- No nested scrolling or capped top-five hiding. If pagination is needed, visible range and total
  count use the identical authorised population and one document scroll; every row remains reachable.
- Empty complete state: `No intervention needed in this scope.` Failed initial read has no count;
  delayed rows retain explicitly historical observation; source failure never removes prior incidents
  as recovered. Revoked access removes protected rows without recording a recovery. Returning from a
  destination refreshes, restores focus/scroll, and announces any source-confirmed disappearance.
- Acceptance: plain Missed excluded; header4/owner-actions3 example; same-action dedup; PIC≠owner;
  same-cause block dedup; independent causes retained; date/result/proof split; missing threshold;
  calendar failure; absent unauthorised vs unexpectedly failed permission; no peer weights invented;
  disabled staff excluded from current grouping; source failure cannot recover; source-confirmed
  recovery deduplicates transition; 1440/1024/390 keyboard/touch and row/count/target reconciliation.

### 8.2 · First-release measure register and arithmetic

Every measure has stable identity, owning source/rule version, definition, included/excluded
population, unit, permission coverage, business date, observation time/version, completeness,
threshold, comparison (v1: none), and exactly one tested filtered drill-down. An approved meaning
is not an admitted production source: every owner and destination must pass §8.6 before release.

Common rules: Asia/Kuala_Lumpur business date; a date-only commitment is past on the following
local date, with no extra grace period. Work missed age uses its own governed calendar. Include
unresolved obligations of ALL ages, not a recent-order cap. Lifecycle exclusions come from the
owner. Unknown is never zero or complete. Deduplicate by business identity, not joined lines,
PDF versions, repeated reads or Work occurrences. Amounts have two decimals, no rounding; currencies
stay separate, with no implicit conversion. Unsupported currency/unknown value prevents a complete
amount claim. Exact predicates below are owned and shared by the named module, never implemented
as independent Dashboard arithmetic.

| ID / visible measure | Unit / owning truth | Exactly one destination |
|---|---|---|
| D1 `Overdue delivery` | Customer-delivery scopes / Delivery | Delivery → Monitor: confirmed customer scope past with no result |
| D2 `Failed Delivery / Partially Delivered` | Unresolved customer-delivery scopes / Delivery | Delivery → Monitor: unresolved failed/partial scope |
| P1 `Supplier delivery date passed` | POs / Purchasing | Purchase Orders: current evidenced supplier promise past and goods owing |
| P2 `Supplier has not confirmed the PO date` | POs / Purchasing | Purchase Orders: current-version reply absent AND reply action day missed |
| M1 `Payment should have been received` | Distinct SOs / Payment | Payments → Monitor → Should have been paid |
| M2 `Amount needed` | Money / Payment, same SO set as M1 | Same overdue Payment Monitor population as M1 |
| W / Work health readings | Distinct actions; source count separately / Shared Work | Team Work with exact condition/module/owner/date filters |
| G1 `Required duties not assigned` | Duties / Staff & Duties | Staff & Duties: current required duties + Not assigned |
| G2 `No eligible cover` | Duties / Shared Duty Resolver | Staff & Duties: required current duty + holder unavailable + no eligible cover |

**D1.** Current effective customer scope has Confirmed Delivery before today and lacks its required
actual result. Requested Delivery Date alone, Estimated delivery, supplier arrivals and intermediate
partner-warehouse legs never establish a customer commitment. Exclude arrangements formally cancelled
or superseded before a visit, recorded Delivered/Failed/Partially Delivered, and proof-only work.
Count split customer scopes independently, each once. An otherwise valid confirmed scope without a
DO must remain locatable in Monitor, not disappear. Threshold: one unresolved scope past confirmation.
Show earliest qualifying Confirmed Delivery; no new elapsed-day arithmetic.

**D2.** Latest authoritative actual result is Failed Delivery or Partially Delivered and the required
remainder/remedy is unresolved under Delivery completion law. Count a scope once, not its delivered
and undelivered lines separately. Exclude resolved historical failures, pre-visit rescheduling,
cancelled arrangements and proof-only work. A new arrangement alone is not completion. Threshold:
one unresolved adverse outcome. D1 (no result) and D2 (adverse recorded result) are disjoint.

**P1.** Non-cancelled, incomplete PO; current official version has confirmed-sent evidence; qualifying
current-version evidenced supplier promise is before today; its affected Pending Delivery Qty > 0.
Accepted correct receipt reduces that balance; damaged, wrong and extra goods do not. Exclude unsent
revisions, old-version/unevidenced replies, planning ETA alone and settled balances. Count each PO
once; preserve line/quantity-specific promises, so one future balance date cannot hide another late
line. Threshold: any owing quantity past its evidenced promise. Show earliest qualifying Supplier
Delivery Date; never rewrite the immutable original PO date.

**P2.** Current version confirmed sent, goods owing, qualifying answer absent AND the governed reply
action day is missed. Use the same Purchasing Work rule: first confirmed-send day, next Office
working day when closed, with lawful calendar resolution. Resends never restart the clock. Exclude
unsent, completed/cancelled and same-day ordinary waiting. Previous-version replies do not qualify.
Threshold: missed reply working day, not an invented supplier SLA. The destination must retain both
no-answer AND missed-day conditions; the existing broad no-answer filter alone is insufficient.

**M1/M2.** Use Payment's exact `Should have been paid` population and authoritative timing. Retain
two causes in its drill-down: latest valid customer promise passed, or governed actionable collection
deadline passed. Ordinary collection retains confirmed-delivery and goods-ready/reliable-arrival
admission; genuine missed promises follow their own rule even without a delivery date. Latest
outcome governs; later promises replace earlier promises, while `Customer paid` without canonical
posting does not settle money. M1 counts each SO once despite multiple invoices/actions. M2 sums
Payment's canonical Amount needed once per included SO: live issued obligations less valid allocated
money, never order-line/legacy-paid recomputation. Exclude unissued storage accrual, void/replacement
obligations, unknown unpriced value, settled balances, AP, rental and Issue recovery. Storage lacking
a lawful overdue deadline is not automatically overdue. Threshold: positive canonical balance and
Payment's passed promise/deadline classification; no arbitrary material-RM cutoff. Partial posting,
void, replacement and settlement must reconcile with the same Monitor footer.

**W.** Same stable admitted open occurrences and health envelope as §5.2.1, all dates (not only the
current week). Readings: Actions to do; Missed (governed action day before today); Blocked (named
dependency/resolving door); Not assigned (no normal owner); no eligible actor on the required day;
Source failed (number of failed admitted sources, never guessed missing actions). Only a gap with a concrete business consequence and the §8.1.1 contract qualifies for Needs
intervention; ordinary Missed/blocked work stays in Team Work. Total open work alone does not.
Normal-owner rows show Actions to do / Missed / Blocked; cover is separate metadata, never double
counted. No staff league table, productivity score or invented capacity percentage. No working date
is not missed/today. Show oldest required action date; numeric missed age only from the shared
calendar-backed calculation, no invented ageing buckets. Calendar failures preserve safe facts and
suppress affected ages. A person-owned order with no owner is not falsely a vacant Duty; retain its
source-provided resolution door via Team Work. A default week must not truncate the drill-down.

**G1/G2.** Read the authoritative current effective required-Duty catalogue and Shared Resolver,
not Work-action existence. G1 includes required active Duties without eligible Primary; exclude
inactive/future/non-required duties. A vacancy remains visible even with zero open actions. G2
includes a currently required duty whose normal holder cannot act and whose governing rule requires
coverage but supplies no eligible acting cover. No Buddy while the Primary can act is not failure.
Missing/unreadable calendar or leave evidence is a source gap, not proof of vacancy/absence. Count
Duties separately from affected actions; never add them together. Each corresponding Staff & Duties
filter must reproduce this exact predicate before admission. No assignment control on Dashboard.

### 8.3 · Held content, comparisons and material change

| Candidate | V1 disposition / exact future admission condition |
|---|---|
| Separate broken requested-customer-date count | Reject: a request is not a confirmed promise; a distinct committed Sales obligation needs its own source/completion |
| Significant/Critical customer cases | Hold: Service-owned materiality, permission, qualified source and exact filter; its 14-day deadline is not a materiality classifier and Issue severity cannot be borrowed |
| Goods shortage/quarantine/controlled totals | Hold: one owning meaning, compatible counting units, Site scope, governed management threshold, exact Unit/document destination; never rename Needs checking to generic Quarantine |
| Issue recovery exposure | Hold: Finance-owned amount/deadline, configured materiality, restricted-record permissions and exact Finance destination |
| Trends, percentages, sparklines | No comparison in v1; reproducible historical observations and compatible populations required |
| Recent material changes | Hold until durable idempotent transition receipts and exact object links exist |
| Active orders, GMV, open POs, generic low stock | Reject as management indicators; routine volume is not intervention |
| AP, ledger/profit, targets, rental, guarantee totals | Outside v1, remain in their owning modules/Reports; absence never means zero/healthy |

No empty placeholder claims an unadmitted domain was assessed. Holding these measures is the final
v1 admission decision, not an unresolved owner question. Normal module capability remains intact.

Future comparisons require the same definition/version, unit/currency, authorised population and
explicit period in the business timezone, with complete reproducible observations on both sides.
Missing baseline, changed rule/scope, partial failure or zero denominator suppresses the comparison
with its reason. Do not reconstruct yesterday from mutable current records or present a rule change
as improvement. No decorative arrows or default percentage.

Future Recent material changes admits only newly broken/recovered admitted commitments, crossing a
source-owned materiality threshold, owner/cover/source failure or recovery, and evidenced material
financial recovery. Receipt identity, event time, prior/new fact and one exact owning-object door
are mandatory; retries deduplicate. Routine edits, new orders, notes and uploads do not qualify.
No durable history is not equivalent to `no recent changes`. Incurred, recoverable and recovered
money remain separate and never netted.

### 8.4 · Observation, permissions, navigation and UI states

Refresh on entry, explicit Refresh and return from an owning module; while visible refresh every
60 seconds. A successful observation older than five minutes is delayed; a failed refresh is named
immediately. These are technical freshness standards, not business deadlines. Business-date rollover
invalidates an unqualified current-health claim. Observations are read-only: opening, refreshing or
drilling down must not establish owners or write transactions, even through an idempotent reader.

| State | Presentation / behaviour |
|---|---|
| Loading | Shell and geometry remain; quiet placeholders, never 0 |
| Healthy | Complete current authorised value, actual source time and business date |
| Delayed | Explicitly non-current last-safe value and actual time |
| Failed with safe prior observation | Could not refresh source; Last available date/time; prior number is historical |
| Failed without safe observation | Could not load source; no numeric substitute |
| Missing rule/calendar/required fact | Name the missing fact; suppress affected totals/ages |
| Partial source failure | Healthy independent sections remain; dependent measures inherit failure |
| Invalid overall composition | Whole-page error and Try again |
| Permission refusal | No protected identity/count/amount |
| Complete healthy zero | Real zero/empty filtered set |

Unread pages, truncated results and malformed payloads mean incomplete, never a smaller total.
Do not label a healthy-source subtotal as all-company/all-Work. Suppress affected complete totals;
explicitly scoped healthy module readings may remain. Show coverage of admitted/excluded domains.
A no-intervention clear state requires all admitted measures in the stated authorised scope
healthy and zero; retain coverage alongside it. Never claim whole-ERP health. Inaccessible domains
must not leak even through their source-health labels.

Dashboard grants no access. Company totals require company source access; narrower users see only
permitted scope. Work health uses Team Work eligibility in §5.1 plus underlying module permissions;
Sales/Finance My Work access does not grant Team Work. Payment amounts require matching money access.
External suppliers/customers/logistics do not enter this internal cross-module Dashboard. Restricted
Issue/People/financial data never leaks through counts, names, tooltips, differences or caches.
Revalidate and discard prior observations when permissions narrow; no preserved wider-scope number.

Every measure has ONE navigation target carrying identity, exact predicate, authorised scope,
business date, observation reference/version and applicable module/owner/timing filters. The target
shows removable filters, the same unit and reproducible population. Refresh/Back preserve context
and Dashboard scroll. If records changed, reproduce the observation when supported or explicitly
state that results refreshed to current truth; never silently open a generic Register. Zero can open
a true empty filtered set. Failed sources never open fabricated zero sets; Source failed opens the
exact Team Work source-health context even without action rows. Historical access is never expanded.

Responsive: Needs intervention spans full width on desktop. The approved reading order is source
health → Needs intervention → Today's operation → Work health → Business exposure → Recent material
changes. At 1024–1439px and below, stack without sideways KPI strips; 390px preserves each row's
complete fact/evidence/consequence. Unqualified domains state coverage without invented values.
Source evidence is keyboard/touch accessible. Use existing Carres Panel and kit geometry with the
scoped typography ruling in 01-design-tokens; do not rebuild Work geometry or force register rows.
Right Rail retains its independent entry. Exact new detail recommendations remain §8.1.2 proposals.

COPY-STANDARD owns exact words (Dashboard dictionary). No At Risk, SLA, unqualified All on track,
No alerts checkmark, annotation Escalations, bare counts or rounded money. No inline operational act.

### 8.5 · Evidence, reference translation and current-to-approved audit

Authority resolution: Constitution → ERP Architecture → Workspace → relevant Sales Orders,
Purchasing/Receiving/Claims, Delivery, Payment, Stock, Service, Issue, People, Rental and Guarantee
MASTER sections → UI/copy/tokens/components/patterns. Current code is evidence, not authority.
Owner-reviewed baseline was 699a8a5b and updated through 5db1a1f7's Work contract/calendar/admission
corrections. The later Work implementation commit does not establish Dashboard production readiness.

Code-inspected evidence: `apps/web/src/pages/operation/OperationDashboard.tsx` and its KPI/pipeline/
PO/stock/escalation components; `apps/api/src/routes/operation/dashboard.ts`;
`supabase/migrations/0125_fix_alias_dl_after_0123_rename.sql` summary;
`packages/shared/src/purchase-order-register.ts`; `apps/api/src/routes/operation/work.ts`.
No fresh live volume/fill-rate/performance claim: existing transactions are test data under CLAUDE §6.

| Current / problem | Approved replacement / trade-off |
|---|---|
| Hero active orders/GMV, rounded amounts | Remove: fewer large figures, governed intervention meaning |
| Today scheduled volume | Remove, preserve in schedules |
| Open PO tile/card treats ordinary buying as warning | P1/P2 exact-version evidence, filtered PO destination |
| Overdue legacy date/stage arithmetic | D1 confirmed customer scope |
| Five-column pipeline/recent order cards | Remove; Sales Orders owns flow and Register |
| Low Stock + Stock Alerts + Reorder incompatible calculations | Remove; goods exposure held pending governing contract |
| Capped annotation inbox and false empty reassurance | Remove; Issue truth and admitted Work keep accountability |
| Generic See all/Manage/Open warehouse doors | Exact filtered destination per measure |
| Independent client queries/mixed observations | Validated source-health composition |
| Whole-page failure on any source | Isolate dependencies; whole-page error only for invalid composition |
| Old Dashboard action-queue page pattern / nested navigation | Reconcile to this authority |
| Work loader calls owner-establishment operation | Consume genuinely read-only shared projection; idempotence is not permission to write |

Reference-to-Carres capability matrix:

| Reference lesson | Decision / owner and consequence |
|---|---|
| SAP overview cards navigate into related business content | Adapt filtered drill-through, owning module retains records |
| Dynamics workspaces navigate from data into deeper pages | Keep context, avoid generic-page round trips |
| Dynamics lightweight in-workspace execution | Reject for Dashboard, execution belongs to Work/owner |
| Dynamics vertical workspace direction | Adapt for narrow screens |
| Current Stock MASTER's recorded 2990 research traces totals to Units/documents | Keep exact source identity and physical/financial ownership split |
| Generic ERP KPI walls | Reject without Carres intervention meaning |

Primary external references: [SAP Overview Cards](https://www.sap.com/design-system/fiori-design-web/v1-108/page-types/floorplans/overview-page-ovp/overview-page-card),
[Microsoft Operational Workspaces](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/user-interface/build-workspaces).
2990 was not accessed directly in this audit; its evidence is Stock MASTER §12.12, not a claimed
live inspection. Foreign products do not supply Carres business policy.

### 8.6 · Release acceptance and PLAN closure

These are required acceptance scenarios, not executed-test or deployment claims:

1. One top-level Dashboard; only the three governed Workspace destinations.
2. Past requested date without confirmation is not D1; today's confirmed date becomes past only
   at the next Malaysia business date.
3. Delivered with proof missing is not missing result; failed/partial unresolved scope is D2 once
   and leaves only on authoritative completion. Split scopes count independently; intermediate legs
   and joins do not inflate customer measures. Valid scope without DO remains visible.
4. V1 reply never confirms V2; PDF open is not send; resend never restarts reply clock.
5. Accepted partial receipt retains remainder; damaged/wrong/extra quantities do not settle it;
   future line promise cannot hide another overdue owing line.
6. Same-day unanswered PO is not P2; missed lawful working day is; holidays/calendars match Work.
7. Multiple invoices/actions on one SO yield one M1 count; M2 matches canonical Monitor footer.
   Partial payment, void, replacement, latest promise and settlement reconcile; Customer paid text
   without posting does not reduce money. Unknown/unissued amounts never become zero or debt.
8. Friday action for Saturday payment deadline is not Friday overdue money. Unknown arrival does
   not invent ordinary collection; real missed promises retain their own lawful rule.
9. Required Duty vacancy remains visible with no actions when its stated business consequence
   qualifies; Duty/action counts never mix. Ownership-action problems open Team Work, not an editor. Cover
   changes acting context without duplicating work or rewriting normal owner/actual-actor history.
   Holder present but no eligible actor is not Nobody holds Duty; no unnecessary Buddy warning.
10. All-date Work totals/drill-downs match; stable occurrences count once, blocked stays missed when
    applicable, undated is not late. Calendar missing/failed produces no invented days or ages.
11. Fail each source/dependency: never zero/clear reassurance, independent healthy sections survive.
    Pagination truncation/malformed data/unknown value prevents complete-total claims.
12. Freshness expiry, refresh failure and date rollover invalidate current-health claims; permission
    removal clears wider cached observations, including restricted people, amounts and source labels.
13. Every count/amount/date context (and any future trend) reconciles for the same predicate, unit,
    permission, business date and source version. Exactly one link works, filters survive refresh/
    Back, changed populations are explained; failed-source context works without action rows.
14. Opening/refresh/drill-down writes no business record, owner establishment, assignment or result.
15. 1440/1024/390px keyboard, screen-reader, focus-return and touch preserve full meanings/dates/money;
    no hover-only evidence, action queue, generic KPI, annotation inbox, fake trend or unadmitted count.

PLAN REVIEW ACTIVE — composition and §8.1.1 are approved and persisted. The new detailed
Needs intervention recommendation in §8.1.2 awaits owner review; do not describe it as approved. Source qualification, lawful calendars, shared feed
health/read-only behaviour, exact filters and production reconciliation remain delivery acceptance
obligations, not permission to substitute defaults. The next lane is BUILD/DELIVERY only after an
explicit takeover, constrained by those dependencies; this PLAN authors no Cards or implementation.

Revisit a measure if its owner supplies a distinct governed commitment/materiality/history contract,
if reconciliation disproves the proposed population, or if production observation shows no management
value. Freshness/permission failures falsify the observation contract. Revise the affected measure,
not the one-Dashboard/one-owner boundary. Source-verification and production acceptance remain open
until measured; approved documents do not claim them complete.

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
Dashboard → admitted management facts → production validation
Trends/recent material change remain outside v1 until §8.3 qualifies their evidence.
```

Core admission covers Sales Orders, Purchasing, Receiving, Stock/Warehouse, Delivery, Payment,
Service Cases and Issue Tracker. Catalog, Guarantee and Rental may join later; they do not block
honest Work for admitted modules.

## 10 · Measured implementation truth — 2026-09-06

- **Sales Orders reader boundary, production-verified 2026-09-13/15.** Sales Orders PRs #1227 and
  #1259 preserve canonical Paid/Outstanding arithmetic while showing saved at-sale method,
  reference and slip as independent evidence. An absent individual transaction row does not prove
  that the customer never paid and does not authorise Workspace to infer a corrected amount.
  Collection Work continues to project only from Payment's complete issued-Invoice truth and one
  atomic outstanding calculation; saved evidence, an empty transaction list or the Sales Order
  reader may never generate a duplicate collection action. Warehouse/Delivery exact-Unit work uses
  recorded provenance; the Sales Orders `verifiedUnitIds` reader is evidence for display, not a new
  Unit assignment or Work source.
- Migration 0425's shared Duty registry/resolver, effective primary assignment, dated cover,
  audit evidence, guarded API and the one `Workspace → Staff & Duties` UI are production-proven
  for GRN Duty. The same catalogue now exposes the other approved cross-module Duty names; their
  module consumers remain implementation evidence until each module is production-verified.
- **Staff & Duties §4.2 composition — BUILT, repository-verified 2026-09-16; NOT production-verified.**
  Branch `build/staff-duties-ui`, PR #1388, head `d809f908` (unmerged, undeployed). The stacked
  720px document is replaced by one catalogue and one selected Duty (`StaffDuties.tsx` +
  `staff-duties/`). The shared catalogue, `GET /api/operation/workspace-duties`, the SQL resolver
  and the assign/cover doors are unchanged and remain the only ownership truth; no API, migration
  or roster was added. Presentation helpers read today's actor from `resolution` alone and take the
  company date from `appTodayIso()`. Measured: catalogue rows equal `WORKSPACE_DUTIES.length` (12,
  including Finance Approver); unknown `duty` keys are corrected with history-replace; readers
  receive `Duty assignments are set by the manager.` and zero write controls; `Assign holder` and
  `Add cover` are focused kit `Modal` acts with §4.4.1 sentences, server refusals printed verbatim,
  no optimistic owner change, and `Add cover` absent while nobody holds the Duty; an empty
  catalogue renders the read-failure sentence; history uses event / who-when / note ranks with no
  controls. Gates: repo typecheck and `pnpm build` clean; `design-standard: no new violations`;
  API `workspace-duties.test.ts` 13/13 unchanged; Staff & Duties suites 99/99 on merged head
  `d809f908`; full web suite 4,829/4,829 before the final responsive change and 4,830 pass + 1
  after it, the one being unrelated `OtherReceiptsPage.test.tsx`, which fails 1 of 3 solo runs
  with no Staff & Duties import. `pnpm test` also timed out `ops/stock-register.test.ts` under
  parallel load (34.5s); alone it passes 16/16 in 1.7s. A seeded rendered walk (real
  page, real portal shell, fixture responses, no authentication) measured 1440px catalogue 320 /
  detail 888, 1024px 272 / 692, 390px one pane with `Back to duties`, zero document horizontal
  overflow at every width, dialogs inside the viewport and single-column (`docs/evidence/staff-duties/`).
  That walk found and fixed two defects jsdom passed: a four-chip State strip that widened the
  390px document by 125px and clipped `Not assigned`, and a catalogue not narrower at 1024px.
  **Not yet performed:** authenticated manager and non-manager sessions against live data;
  byte-for-byte resolver agreement across Staff & Duties, Team Work and a protected module door;
  live refusal, overlap, race and company-date-boundary checks; eligibility exclusion of departed
  or external Warehouse accounts at the write door. §4.7 acceptance stays open until those run.
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
  calculations and an annotation inbox; it is not accepted as management truth. Sections 8.1–8.6
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
9. Last, implement and production-verify the owner-approved Dashboard §8; Blueprint review is closed, source and production acceptance remain open.

Cards follow dependency slices; this MASTER is not an implementation queue.
The execution sequence that implements this authority is recorded in
`docs/workspace/IMPLEMENTATION-PLAN.md`; it cannot amend this MASTER.

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
separate §§8–8.6 contract. Right Rail and Notifications retain the supporting §7–7.1 contract and
never become a fourth Workspace destination.

### 13.1 · Owner-review result — 2026-09-16

The composition review covers the complete relationship, not isolated screens:

```text
Dashboard ──management fact drill-down──▶ owning Register / Team Work
Workspace ──Work──▶ exact owning action door
          ├─Staff & Duties──▶ shared owner/cover resolution
          └─Issue Tracker──▶ Issue truth + shared Current Action
Right Rail ──filtered count──▶ My Work
Notifications ──event receipt──▶ Work / owning object
```

No new business decision remains in the page composition. Implementation remains gated by the
module admission and production-proof work in §§6, 10 and 11; `Blueprint ready` does not mean those
sources, migrations or pages are deployed.
