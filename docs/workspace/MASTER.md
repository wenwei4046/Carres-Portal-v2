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

**A DUTY BELONGS TO A PERSON — APPROVED / LOCKED, owner rulings (Jess) 2026-09-18, migration 0533.**

- Every Duty holder, cover, assigner and executor is an **active person**: an account whose governed
  person marker `app_users.is_person` is true. The marker — not `staff_code` (the shared owner login
  carries `CR001`) and not an HR row (the shared login has one too) — separates a person from a
  shared or generic login. People/HR sets it when it creates an internal person; no signed-in caller
  may set or clear it (`person_marker_governed`).
- The shared owner login `principal@carres.com` is **not a person**. It may read everything its role
  reads, but it never holds, covers, assigns or executes any Duty. The principal role's "decides
  anything" rung on an approver Duty now requires a principal **person**.
- `jess@carres.com` is Jess's **personal management identity**, role `principal`, person, `CR002`.
- **Nobody assigns a Duty to themself or names themself as cover** — every role, the principal
  included (`self_assignment_refused`). This is the daily control.
- Absence is expressed as a dated Buddy cover. With no eligible cover, the action **waits** for its
  normal holder; it is never downgraded to another role, a position rung or an email list.

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

Distinct Duties include Storage Waiver Approver, Payment Approver, Purchasing Approver, Delivery
Charge Approver, Stock Adjustment Approver, Service Case Approver and the fallback-only Delivery
Duty. There is no fake `ERP Owner`.

**Routine Delivery work belongs to the Sales Order's PIC** (owner ruling 2026-09-17). When an
order enters Operations, `ops_order_control.assigned_staff` names the one normal owner for its
order, customer, delivery and ordinary collection work. The Work Engine routes today's action to
that PIC's governed Buddy cover when the PIC is absent without changing the normal owner. Delivery
Duty is no longer the routine owner. It remains only the explicit fallback when a Sales Order has
no PIC; that exception stays visible under `Delivery Duty` and prints `Nobody holds Delivery Duty.`
and `Set the holder in Workspace → Staff & Duties`. Delivery Settings never holds a roster or a
second owner list (`../delivery/MASTER.md` §13.1).

**Reason for the ruling:** the PIC sweep shares open orders between the two active operators,
Shasha and Yu Jun, at roughly 50/50. A single Delivery Duty instead left 101 routine Delivery
actions unowned in production and broke the one-person customer/order follow-through.

**`Purchasing Approver` (`purchasing_approver`) takes an active Principal person only** (owner
rulings 2026-09-18, 0533). Its pickers list Principal people; the doors refuse every Operation
account — Shasha and Yu Jun included — as holder (`invalid_holder`) or cover (`invalid_cover`).
Deciding a Manual Purchase admits only today's resolved actor — the holder, or their dated Principal
cover — and never the principal role alone, the `ops_manager` position or an email list. Unheld
answers `Nobody holds Purchasing Approver.` · `Set the holder in Workspace → Staff & Duties.` Nobody
decides a Manual Purchase they raised (`own_request`), and the principal role no longer raises one.
**Bootstrap:** no door can name the first holder (self-assignment is refused and the shared login
may not assign), so 0533 assigned Jess once from 2026-09-18 with `assigned_by` NULL, note `Bootstrap
— owner ruling 2026-09-18 (no second Principal person)` and an audit row naming the migration. It
runs only when the Duty has no assignment history; it created no cover. Until a second Principal
person exists, Jess has no eligible cover: her approvals wait while she is away.

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

| Condition | Write-door code | Exact sentence |
|---|---|---|
| Holder missing | (form) | `Choose a holder.` |
| Assignment start missing | `invalid_dates` on assign | `Choose when this holder starts.` |
| Assignment end before start | (form) | `Until must be on or after Effective from.` |
| Ineligible/inactive/non-person holder, or anyone naming themself as holder | `invalid_holder` · `self_assignment_refused` on assign | `{name} cannot hold {Duty}. Choose an eligible active staff member.` |
| Anyone naming themself as cover | `self_assignment_refused` on cover | `{name} can no longer cover {Duty}. Choose another eligible staff member.` |
| Conflicting primary period | (newest assignment wins; no refusal today) | `{Duty} already has a holder for these dates. Choose different dates.` |
| Cover person missing | (form) | `Choose who will cover this duty.` |
| Cover is normal holder | `cover_is_holder` | `Choose another person to cover {Duty}.` |
| Cover dates missing/reversed | `invalid_dates` on cover | `Choose valid cover dates.` |
| No one normal owner for every day of the cover | `no_duty_holder` | `{Duty} has no normal holder for all these dates. Assign the holder first.` |
| Conflicting cover | `cover_overlap` | `{Duty} already has cover for these dates. Choose different dates.` |
| Eligibility changed before save | `invalid_cover` | `{name} can no longer cover {Duty}. Choose another eligible staff member.` |
| Caller is not a duty manager, or is a shared login (0533) | `not_duty_manager` | `Duty assignments are set by the manager.` |
| Unknown failure | `unknown` (any other error, a network failure included) | `{Duty} could not be updated. Try again.` |

The API returns only the code; the page maps it to the sentence above and never renders the
database's or the network's own text.

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
| Cover overlap and whole-period holder are refused by the writer (0532); ending/replacing a cover has no governed act yet | Build the append-only end/replace-cover act with reason/actor/time (§4.4) |
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

Work is one page with two scopes over one permission-scoped open set. It is an operator workspace,
not a Dashboard, Kanban board or second module record. **OWNER APPROVED 2026-09-24:** the previous
v4 reference artifact and its `Broken commitment` grouping, combined list heading, three-line row
grammar and repeated selected-action brief are superseded. No rejected prototype is authority.

At a Work canvas of 1104px or wider, the page has three columns inside the global shell:

1. a 240px scope column containing separate `Working day` and `Module` Panels;
2. a 360px list column containing compact Work cards grouped by date in My Work or by normal owner
   in Team Work;
3. a detail column of at least 500px containing the selected action's executable Panels.

The canvas is the confirmed Carres light-grey page surface. Each scope/detail session is a white
Panel with 1px grey border, 10px radius, no shadow, 16px padding, one blue section title and one
divider. Panels have 16px separation. A compact Work card is one object, never nested sessions:
white surface, 1px grey border, 6px radius, no shadow, 10–12px padding, natural height and at most
one footer divider. Selection uses only a quiet blue-grey fill; it has no blue outline, corner or
selection edge. A failed external promise may add a thin red attention edge only when the exact
failure words remain visible.

Panel 1 has two independent Panels. `Working day` shows `Missed`, Monday–Friday, Saturday only
when an admitted action remains there, named public holidays and `No working date`; zero counts
are omitted. `Module` shows `All modules` and admitted modules with the same governed icons as
navigation. Rows are flat, counts are neutral/right-aligned/tabular and selection uses the governed
quiet fill. Working-day counts cover the selected week. Module counts equal the currently visible
Panel 2 set and sum to `All modules`.

My Work first opens with two distinct sticky list groups: `Missed {n}`, then the current or next
eligible governed weekday/date `{weekday, date} {n}`. It never combines them into one heading.
Selecting a single day shows only that group. There is no visible or counted `Broken commitment`
group: an external promise failure sorts first inside its lawful date group and prints the exact
promise and failed fact. It remains one occurrence. A blocker likewise stays in the original group
and prints its exact dependency; there is no Blocked group.

Team Work is available to Operation, Principal and Jess without widening module permission. It uses
the same filters and cards but groups Panel 2 by normal owner. Each owner header shows the governed
avatar/full name and `{n} actions · {n} missed`. A card does not repeat that owner. Acting cover
appears only as `Covered by {acting person}`; the card remains under its normal owner. Unresolved
work appears last under `Not assigned` with the exact Duty and Staff & Duties correction door.
Khor Yee is disabled and cannot appear as a current owner or cover. Shared/generic accounts never
form a human owner group.

At 768–1103px of Work canvas, Panel 1 stays visible beside one work column. Selecting a card replaces
the list with detail; `Back to work` restores the exact card, filters and scroll. Below 768px,
Working day becomes a horizontal selector, Module moves into Filters, and list/detail replace one
another full width. Every touch target is at least 40px.

Clicking a card selects its detail. Clicking the footer's external-link icon alone opens the owning
object. The detail does not repeat the whole card: its compact identity is module + full object door
+ current fact/problem, followed immediately by genuine work-step Panels. Communication, recording
the authoritative result and other steps are separate sessions only when they are separate acts.
Completion is supporting copy inside the result Panel, never a separate decorative Panel.

Workspace never owns or stores module truth. Every occurrence declares `embedded`, `open_module`
or `read_only`, but those engineering modes are not visible card badges. An embedded action reuses
the owning module's component, API, permission, validation, evidence, source-version, idempotency,
completion and receipt law. Missing any admission fact keeps the action an exact object-door flow.

### 5.2 · Work-item presentation contract

**OWNER APPROVED 2026-09-24:** a compact card is fact/problem first. Neither the action, recipient
nor document number is its largest text.

```text
MODULE                                                     small metadata
{context or promise date}                                  small supporting fact
{exact fact or problem}                                    main emphasis
{specific action}                                          secondary
{recipient / contact / location, when applicable}          supporting
──────────────────────────────────────────────────────────────────────────
{source object label} [external-link icon]                 footer metadata
```

The fixed hierarchy is:

- fact/problem: 14px/600;
- action: 12px/500;
- recipient/contact/location: 12px/400–500;
- supporting fact: 11–12px/400;
- module, object and metadata: 10–11px/500–600.

Module belongs at the top; object number belongs only in the footer and never in the header. Long
document numbers stay on one line, use a governed middle-short display preserving prefix and suffix,
and expose the full accessible value; detail shows the full value. The action uses a specific verb.
`Follow up`, `Check`, `Handle`, `Process` and `Pending` alone remain forbidden.

`Broken commitment` is no longer operator-facing vocabulary. The feed retains the structured
attention fact for ordering, while UI prints the actual business evidence, for example:

```text
Promised Tue, 22 Sep
Not delivered
```

Likewise, operator cards do not print abstract `{n} working day(s) missed`, `Late`, `Overdue`,
`Due` or `Upcoming`. The `Missed` group expresses internal lateness; the card prints the exact
action date and unresolved fact only when needed. Missed age remains structured sorting/management
evidence. `Today` may mark the current selector but is not stored status text.

My Work omits the signed-in owner. It prints only exceptional `Covered for {normal owner}`.
Team Work owns the normal-owner group and prints only exceptional `Covered by {acting person}`.
Owner never enters the action sentence.

Communication detail follows the approved composer law. Its Panel header is `Contact {recipient}`
with icon doors for WhatsApp, Email when a valid address exists, and More. WhatsApp uses its brand
icon; other controls use governed icons. The message body auto-loads the rule's default owning-module
template and remains editable. The composer footer shows the applied template and Copy icon. More
contains `Use another template`, `Save as template` and `Communication history`; personal and
team template visibility remain distinct. Icon-only controls have tooltip, focus/tap help and full
accessible names. Mutations that write business truth always use icon + words.

Opening WhatsApp or an external email app and copying text record nothing. On return, the source-owned
composer may ask `Did you send the message?` with `Not sent` and `Record sent`; only confirmed
recording creates actor/time/message-snapshot evidence. A server-sent email may record success only
after server confirmation. Communication evidence never closes business work.

A simple admitted result Panel places related fields on one row where space permits, uses governed
calendar/clock icons and one primary mutation, then states the exact completion effect as supporting
copy. Example: `Work closes after the date and time are saved.` There is no separate Completion
Panel. The row leaves only after the feed re-read proves the owning completion predicate removed it.

The first target embedded actions are Delivery proof review, confirmed supplier date and Delivery
date/time arrangement; each still requires the full admission contract before production. Receiving/
GRN, Delivery result, Issue PO, Payment allocation/refund and other complex work keep the exact
owning-object door until their own shared component is admitted.

#### 5.2.1 · Authoritative Work feed contract
### 5.3 · Filter, search and URL contract

Search matches the authorised open set by object number/label, customer, supplier, recipient,
problem and action. It never broadens permission scope and never searches a separately cached copy.

The toolbar `Filters` door is governed for Work. It lives in the toolbar only and is never a Panel 1
or rail heading. Filters are: `Scope` (`My Work` · `Team Work`), `Week`, `Working day` (`Missed` · admitted weekdays ·
Saturday when generated · `No working date`), `Module`, `Owner` (Team only), `Waiting for reply` where sourced, `Covered`,
`Blocked`, `Not assigned` (Team only) and `Source failed`. External promise failure remains
structured ordering evidence and exact card copy, not a generic filter or label. Multiple filters combine and every active filter is
visible, individually removable and represented in the URL so Dashboard and Right Rail can open
the exact same result. `Clear all` preserves the current scope. Refresh re-reads the one feed and
does not change business state.

The Module filter lists only currently admitted projections: `Sales Orders` · `Purchasing` ·
`Receiving` · `Delivery` · `Payment` · `Issue Tracker`. `Service Case`, `Warehouse Outbound` and
`Claims` do not appear until their admission gates and live projection close.

My Work group order is `Missed` → selected day (§5.1). Exact external promise failures sort first
inside their lawful group, then module-governed materiality, oldest opened occurrence and object label. Users may narrow
the view but cannot manually reprioritise authoritative due facts. Search and filter results keep
the same group and item grammar; zero matches is not the same as zero work.

### 5.4 · Work states

| State | Required presentation and behaviour |
|---|---|
| Loading | Keep the page shell and applied scope/filter visible; use quiet row placeholders, never `0` |
| Empty My Work | `Nothing assigned to you` · `Open Team Work` for authorised supervisors; source freshness remains visible |
| Empty Team Work | `No open work` only when every admitted source is healthy; otherwise show the failed source state |
| No search/filter match | `No work matches these filters` · `Clear filters`; never imply the source set is empty |
| Missed | The occurrence stays under `Missed` and prints its exact required date/unresolved fact when needed; missed age is sorting/management evidence, not generic card copy |
| Saturday | Appears only when an admitted action remains on Saturday after module and resolved-owner calendar law; retains the Saturday business date |
| Public holiday | Day remains visible and names the holiday; only an authorised holiday operation may remain assigned there |
| Calendar not configured | Name the affected Site/owner calendar and correction door; do not invent off-days or missed age |
| Calendar read failed | Say working days could not be loaded, preserve safe dated facts and hide invented missed age; never treat failure as zero |
| No eligible actor that day | Keep the action on its authoritative day · `Nobody works {date} for {Duty}.` · `Set cover in Workspace → Staff & Duties`; do not falsely say the Duty has no holder |
| Blocked | Stays in its own working-day group (no `Blocked` group) · `Blocked by {dependency}` plus the door that can resolve it; retain original working day and missed age; the `Blocked` filter narrows to these rows |
| Not assigned | Group under the governed Duty word · `Nobody holds {Duty}` · `Set the holder in Workspace → Staff & Duties` |
| Covered | Preserve normal owner and effective cover evidence; My Work routes to today's acting person |
| Source delayed | Preserve last safe observation and say `Could not refresh {source}` with time |
| Source failed | Isolate and name the source; never omit its possible work or convert failure to zero |
| Permission refused | `You do not have access to this work` and no leaked counts, objects or people |
| Completed/history | Leaves the open set only after the authoritative completion fact; history shows result, actual actor and time |

### 5.5 · Responsive and accessibility contract

- Work uses the existing 50px Page Header. At three-panel and 768–1103px widths it has one 45px
  Work Toolbar whose controls may wrap into a second 45px row when the canvas is narrow; below 768px
  they use the single-panel control stack. It creates no second title, breadcrumb, KPI band or card
  header. The controls contain `My Work · Team Work`, Search, applied filters, `Clear all` when
  narrowed and the toolbar `Filters` door; freshness is a read fact, not a manual business action.
- Breakpoints use the available Work canvas after the global shell, not the browser width. At
  **1104px or wider**, show all three panels: Panel 1 is the governed 240px `FilterRail`; Panel 2 is
  360px; Panel 3 takes the remainder and never falls below 500px. The full composition may use up
  to the governed 1280px content width. Straight 1px `slate-5` dividers separate panels; the shell
  has no card radius, shadow or gutters between panels.
- From **768px through 1103px** of Work canvas, show Panel 1 plus one work column. With no job
  chosen the column is the Panel 2 list. Choosing a job replaces the column with that job's Panel 3
  detail and moves focus to `Back to work`; `Back to work` restores the list and returns focus to the
  same row (or the next visible row when it closed). Panel 1 stays visible throughout.
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
- Panel 2 uses compact Work cards governed by §5.2. Cards grow for content and never truncate.
  Selection uses quiet `blue-3` fill without a blue outline/edge; hover remains grey. A failed
  external promise may add only the thin red edge while exact failure words remain visible. No
  interaction-mode badge (`Do it here`, `Open module`, `Read only`) appears on a card.
- Panel 3 is a grey detail canvas with separate Carres Panels and a left-aligned body no wider than
  760px. Its compact identity is module + full object door + current fact/problem; it does not repeat
  the card. Each genuine step has one Panel. An admitted result Panel contains the owning-module
  form, one primary mutation and its exact work-closes supporting sentence; no separate Completion
  Panel or generic sticky bar exists. At 1440×900 the primary mutation is visible without scrolling.
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
(provided dates/counts), `WorkActionRow` (presentation) and `WorkActionPanel` (structured detail and
host for an admitted owning-module component). None calculates business dates, ownership, severity, completion or source health. They are
not promoted into the global kit until a separately governed second use exists.

### 5.6 · Priority, due and SLA law

Workspace does not store a free-form priority or invent one global SLA. Severity is derived in this
order from module truth:

1. An explicit customer, supplier, payment or delivery promise is past and its completion fact is
   absent. This structured attention fact sorts first but UI prints the exact promise/failure, never
   the retired generic `Broken commitment` label.
2. `Missed` — the governed working day is before today on that rule's calendar; missed age remains
   internal sorting/management evidence rather than generic card copy.
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

### 5.7 · Work current → proposed gap audit — 2026-09-23

| Current branch evidence | Required Blueprint state |
|---|---|
| My Work / Team Work use one server-composed open feed | Retain; make all admitted modules use the same transport contract and source health |
| My Work defaults correctly and Team groups by normal owner | Retain; add complete cover/handover and unresolved-Duty evidence everywhere |
| Right Rail reads the same cache and opens `day` filters; since HF-3 (2026-09-17) the badge, the panel and My Work share one identity (the signed-in account id), one focus day (`workFocusDay`) and one `Missed` + `Today` count (`myMissedAndToday`); the badge accessible name is `My Work · {n} missed · {n} today`; loading keeps count placeholders and a failed refresh keeps the last-safe counts with `Last updated {time}` and source words | Retain; all supported filters must be URL-visible and use the same vocabulary |
| Current production still renders the retired rounded toolbar/day strip. The Work v4 branch now uses the flat 50px header, 45px toolbar, governed FilterRail and canvas-measured three/two/one-panel shell | Merge only after measured 1440/1180/820/390 visual acceptance; production evidence, not branch code, closes this row |
| Current production can truthfully return no personal actions for a shared Principal account but offers no supervisory next door. The Work v4 branch keeps `Nothing assigned to you` and adds `Open Team Work` only for Principal/Operation | Production-verify the empty Principal/Operation path and prove Sales/Finance do not receive Team Work or protected counts |
| Current production still uses a page-local row and old selected brief. The Work v4 branch uses the shared 64px-minimum `WorkActionRow`, `WorkActionPanel` and shared `Avatar`; object/problem/action wrap and required result stays in Panel 3 | Complete visual, keyboard and screen-reader acceptance, including focus return and the 390px wrapped-content proof |
| Search, module/day/owner selection, source-failure isolation and true-empty/no-match states exist; remaining approved filters are not complete | Add waiting-for-reply, blocker and source filters plus individually removable applied-filter chips without inventing client-side business truth |
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
- first open shows `Missed` followed by the actual current or next eligible governed weekday/date,
  names a public holiday and never duplicates an occurrence or hides the complete working week;
- `WORKING DAY` counts the whole week; `All modules` equals the visible card count and the module rows
  sum to it; first open has separate `Missed {n}` and `{weekday, date} {n}` groups;
- exact external promise failures sort first inside their lawful group and carry no generic group or
  badge; a blocked job stays in its original group with its exact dependency;
- cards never truncate; after a confirmed completion the receipt stays in place,
  the next row is selected with focus on it, `Enter` moves into Panel 3 and `O` opens the object;
- at a 768–1103px canvas Panel 1 plus one work column shows; choosing a job replaces the column and
  `Back to work` returns focus to the same row;
- a communication job uses the owning-module composer, approved channel/template/history icon
  language and records nothing merely from external launch or Copy;
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

## 6 · Module admission gate

**RO return timing — owner correction 2026-09-20; target, not built.** Purchasing §9.7 owns
Carres’s default 14-working-day target starting from evidenced Supplier receipt of the RO document,
not goods pickup or document sending. My Work/Team Work reads those same source facts; a later
Supplier-reported return date does not reset the Carres target or complete overdue follow-up.
Preserve setting/calendar versions and previous dates. A missing receipt cannot produce an
invented due date. Calendar and occurrence admission still require the §6 contract; no new task
engine, arbitrary follow-up deadline or extension approver is authorised here.

**Repair Orders integration — owner-approved target, 2026-09-18; NOT BUILT.** Purchasing MASTER
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
| Delivery · `arrange_new_delivery_date` | Approved delay requires a reachable new booking · confirmed date/slot | Sales Order PIC; Buddy cover acts; Delivery Duty fallback only when no PIC | Same Office working day as delay decision | Customer-confirmed reachable booking exists |
| Delivery · `assign_logistics` | Delivery required with no company · company selected | Sales Order PIC; Buddy cover acts; Delivery Duty fallback only when no PIC | 3 delivery working days before promise | Delivery company recorded · booking action may open |
| Delivery · `confirm_delivery_date` | Company assigned but customer date/slot unconfirmed · evidenced booking | Sales Order PIC; Buddy cover acts; Delivery Duty fallback only when no PIC | Configured call days before promise | Confirmed date and slot with evidence |
| Delivery · `deliver_today` | Confirmed delivery is today without result · result recorded | Sales Order PIC; Buddy cover acts; Delivery Duty fallback only when no PIC | Confirmed delivery date | Delivery attempt result exists · proof/recovery follows result |
| Delivery · `upload_delivery_photo` | Delivered result lacks file · proof file recorded | Sales Order PIC; Buddy cover acts; Delivery Duty fallback only when no PIC | 1 delivery working day after delivery | File exists · proof review may open |
| Delivery · `upload_signed_delivery_order` | Delivered result lacks the signed Delivery Order · signed file recorded | Sales Order PIC; Buddy cover acts; Delivery Duty fallback only when no PIC | 1 delivery working day after delivery | Signed Delivery Order exists · proof review may open |
| Delivery · `check_delivery_proof` | Latest delivery file is unreviewed · governed review result | Sales Order PIC; Buddy cover acts; Delivery Duty fallback only when no PIC | 1 delivery working day after delivery | Review newer than latest file exists |
| Delivery · `failed_delivery_next_step` | Failed Delivery has no recorded next step · named recovery fact | Sales Order PIC; Buddy cover acts; Delivery Duty fallback only when no PIC | Same Delivery working day | Named next fact exists · delivery planning continues |
| Delivery · `collect_loan_item` | Loan item remains out on delivery day · returned evidence | Sales Order PIC; Buddy cover acts; Delivery Duty fallback only when no PIC | Delivery day | Loan row is returned |
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
- the global Right Rail remains a separate My Work doorway and Dashboard remains one independent
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
My Work → Team Work → module-rail previews → Notifications

LAST
Dashboard → management facts → cross-module trends → production validation
```

Core admission covers Sales Orders, Purchasing, Receiving, Stock/Warehouse, Delivery, Payment,
Service Cases and Issue Tracker. Catalog, Guarantee and Rental may join later; they do not block
honest Work for admitted modules.

## 10 · Measured implementation truth — 2026-09-16

- **Work truth hotfix HF-1 — DEPLOYED to production 2026-09-17 (`a48e5237`, PR #1400, includes YH's
  UTC-safe `workWeek`); authenticated production read OWED.** Measured on `a5776c50`: at UTC+8 the day
  strip read `Sun 13 Sept … Thu 17 Sept`, Malaysia Day was an ordinary `0` row, an empty day said
  `Nothing assigned to you` while Friday held work, one module filter zeroed every other module, and
  the panel count followed `window.innerWidth` (three panels in a ~950px Work area). Now: every day
  label is `fmtDate`; holidays come from the shared `my-holidays.ts` as `Public holiday · {name}` with
  no count and no button; the focus day is today when it is a working day, else the next working day
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
  responsive list/detail behavior and the shared Right Rail counts. The browser validates the full
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
  Collection Work continues to project only from Payment's complete issued-Invoice truth and one
  atomic outstanding calculation; saved evidence, an empty transaction list or the Sales Order
  reader may never generate a duplicate collection action. Warehouse/Delivery exact-Unit work uses
  recorded provenance; the Sales Orders `verifiedUnitIds` reader is evidence for display, not a new
  Unit assignment or Work source.
- Migration 0425's shared Duty registry/resolver, effective primary assignment, dated cover,
  audit evidence, guarded API and the one `Workspace → Staff & Duties` UI are production-proven
  for GRN Duty. The same catalogue now exposes the other approved cross-module Duty names; their
  module consumers remain implementation evidence until each module is production-verified.
- **Staff & Duties §4.2 composition — DEPLOYED to production 2026-09-16 (`56e52d0e`, PR #1388);
  owner acceptance under §4.7 still open.** Deploy run 35075197322 passed its repeated
  authoritative checks and deployment proof; an independent `verify-production.mjs` run then read
  `56e52d0e` from carres-portal Pages, carres-pos Pages, erp.carresofficial.com,
  pos.carresofficial.com and the API Worker. The stacked 720px document is replaced by one catalogue
  and one selected Duty (`StaffDuties.tsx` + `staff-duties/`). The shared catalogue,
  `GET /api/operation/workspace-duties`, the SQL resolver and the assign/cover doors are unchanged
  and remain the only ownership truth; no API, migration or roster was added. Presentation helpers
  read today's actor from `resolution` alone and take the company date from `appTodayIso()`.
  Built behaviour: catalogue rows equal `WORKSPACE_DUTIES.length` (12, including Finance Approver);
  an unknown `duty` key is corrected with history-replace; readers receive `Duty assignments are set
  by the manager.` and zero write controls; `Assign holder` and `Add cover` are focused kit `Modal`
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
  `scheduled_cover_id` with `{acting} covering for {normal}`, dates and reason. Duty pickers list
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
  loan-return actions retain Delivery as their owning module in the shared engine. Their stable
  object is the Delivery scope until a Delivery Order exists, then the exact DO where the
  result/proof act belongs; the server supplies the Delivery editor/DO door. Ownership of the
  business fact remains with Delivery while responsibility for the action resolves to the linked
  Sales Order PIC and today's Buddy cover, with Delivery Duty only when that order has no PIC.
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

**OWNER APPROVED — Work design v3.1, 2026-09-16.** The approved review surface proves the
three/two/one-panel composition at 1440×900, 1180×820, 820×900 and 390×844; reconciled
Missed-plus-plan-day counts; inline completion receipts; Team/My ownership density; the three
interaction modes; keyboard/focus return; proof-image inspection and failure; and the §5.4 state
matrix. Its example objects, people, dates, amounts, permissions, photographs, save outcomes,
sidebar, Right Rail and unfinished filters remain fixtures and are not authority. Production must
render the contract and owning-module facts governed here; it must not copy fixture records or the
artifact's implementation.
