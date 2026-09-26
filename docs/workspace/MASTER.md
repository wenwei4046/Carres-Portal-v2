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
There is no invented `Saturday Duty`. A separate preparation action may appear on Friday only when
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
  **Today** is the black number with a dot under it; the word `Today` is never on screen. The
  **chosen** day is the solid-blue tile with white text — the page's ONE blue: a rail row choice is
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
  icons · the right rail names each icon. **`Covering` is retired (Jess, 2026-09-26):** a covered row
  says so on the row itself; the toolbar carries no cover button.
- **The Date rail** is the one-line week header and the week strip of tiles in §5.2 Panel 1 (Jess,
  2026-09-26 — replaces the day cards, `Today` in words, `No work`, `Public holiday · {name}` and
  the two-week column). `No date` (never `No working date`) is always listed.
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
| No eligible actor that day | Keep the action on its authoritative day · `Nobody works {date} for {Duty}.` · `Set cover in Workspace → Staff & Duties`; do not falsely say the Duty has no holder |
| Blocked | Stays in its own working-day group (no `Blocked` group) · `Blocked by {dependency}` plus the door that can resolve it; retain original working day and missed age; the `Blocked` filter narrows to these rows |
| Not assigned | Group under the governed Duty word · `Nobody holds {Duty}` · `Set the holder in Workspace → Staff & Duties` |
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
- **Toolbar** — ONE white section (`rounded-work`), 12px padding (10px below 600px), 8px between
  controls. Every control is 36px (40px below 768px), 14/20/400 (`text-control`), 12px sides,
  `rounded-control`; the active `My Work`/`Team Work` segment is 600. Search is 240px from 768px
  and fills its row below. From 768px the toolbar is one row (`Filters` · `My Work · Team Work` ·
  Search · Owner · `Covered` · `Clear all`). **Below 768px it is exactly two rows** — `Date · Module ·
  My Work/Team Work`, then `Search · Owner · Covered` — **and below 600px exactly four**: `Date ·
  Module` / `My Work · Team Work` / Search / `Owner · Covered`; rows are 40px apart by 8px. The ruling's
  table put the 36/40px switch at 600px, but its 743px acceptance requires 40px rows; the
  acceptance is the more specific line, so controls (and the 12px canvas padding) switch at
  768px with the header, and only the toolbar's own 12/10px padding and the four-row split switch
  at 600px. Freshness is a read fact, not a manual business action.
- **THE WORK SHELL — owner correction 2026-09-24, APPROVED / BUILT.** The workspace is an UNFRAMED
  grid on the light-grey canvas with 16px padding (12px below 768px): no frame, fill, radius or
  shadow around it. The toolbar is one white section; 16px below it the columns sit 16px apart.
  Every white surface is its own section: 1px `work-line` (`#ccd7e5`) edge, 9px `rounded-work`
  radius, no shadow, no coloured corner. Breakpoints read the Work page's own width:
  **≥1280px** three columns `240px · 420px · remainder (≥480px)` — Date and Module as two separate
  rail sections, the list, the detail; **768–1279px** the rail collapses behind the toolbar
  `Filters` control and the list is exactly 400px (it never collapses); **<768px** Date and Module
  open from compact toolbar controls and the list (100% wide) and the detail share ONE stage with
  `Back to work`.
- **The list column** — the heading (the chosen Date, 16/22/600, with `{n} actions to do` 13/18/500
  on the same 24px line; at 390px it may wrap once, never grow), 8px, the 36px `To do · Waiting ·
  Completed` tabs (`?list=`; 3px padding, 2px between tabs, tab 13/18/600 with its count 13/18/500,
  tab radius 5px, bar 7px), 8px, then the work cards 8px apart, drawn 50 at a time as the list end
  scrolls into view; a failed refresh keeps the last good list with one retry row. Team Work groups
  under ONE 32px owner line — `[SH] Shasha  49 actions to do · 88 missed`: 32px avatar with 12/16/600
  initials, 8px, owner name 15/20/600, count 12/16/400, missed 12/16/500; 8px to its first card,
  16px from its last card to the next owner.
- **THE WORK LIST ROW — 52px, two lines, in a 300px column (Jess, 2026-09-26; replaces the
  104px card).** The middle column is a PICKER: line 1 is the document number 13/18/600 with the
  due date 12/16 on the right (`Thu, 1 Oct`; the date alone in red 600 when missed — no word; `No date`);
  line 2 is the action sentence 13/18 slate-11 truncated. My Work marks a covered row `For {normal
  owner}` in an amber tag beside the number; Team Work says it once on the owner's group line.
  Rows sit edge to edge with a 1px rule; the chosen row is the pale-blue wash with the 2px left
  line — the list's one blue. The number opens the record; the row shows it on the right. Over the
  list ONE line names the chosen Date (`Thu, 1 Oct` · `Missed` · `No date`) — no count, no tabs.
  Rows draw 50 at a time as the list end scrolls into view; a failed refresh keeps the last good
  list with one retry row. Team Work groups under ONE 32px owner line — `[SH] Shasha  49 actions to
  do · 88 missed`: 32px avatar with 12/16/600 initials, 8px, owner name 15/20/600, count 12/16/400,
  missed 12/16/500.
- The detail column takes every pixel the rail and the 300px list leave (the working panel is the
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

### 5.10 · Complete Work right panel — owner-approved target 2026-09-25 / NOT BUILT

This section is the canonical continuation of §5.9. It freezes the complete selected-mission
composition so a later chat reads it from the repository rather than reconstructing it from chat.
The deployed left Date/Module rail, middle To do/Waiting/Completed cards, density contract in §5.5
and Logistics behaviour in §5.9 are preserved. The build scope is the missing Customer card,
multi-supplier Supplier card, compact Order Route and their shared communication/state behaviour.

#### One fixed top-to-bottom composition (Jess, 2026-09-26 — Route FIRST; BUILT)

1. **Order Route** — one compact horizontal mission-health line, first, always open; its title
   line is `{object} · {module}` (`SO-1362 · Delivery`), never the words "Order Route"; it is not
   a wizard or sequence.
2. **Sales Order card** — the order's own facts, read-only: `Customer` (name · phone) · `Deliver to`
   · `Goods` (`{name} ×{qty}` per line) · `Customer date` · `Balance` (`RM 0.00 · paid` / red
   `RM {n} · not paid`), with the `Open {SO}` door on its title line.
3. **Logistics card** — §5.9's deployed component and eight-section expansion, unchanged.
4. **Customer card** — mission-relevant dates, contact checkpoint and structured answer only.
5. **Supplier card** — one mission card; when expanded, one row per supplier/PO.
6. **Owner, timing and source** — audit disclosure, last, not repeated inside every card.

The selected-work summary block (problem · action · `Open {object}`) is retired for order missions
(Jess, 2026-09-26: with the parties below it said everything twice); it is drawn only for work that
names no Sales Order. No section is dragged or reordered; sections are always open on a desktop.
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
collapsed. Normal partner contact has no Carres button.

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

**Relation to the right rail's Customers door (owner-confirmed 2026-09-26, UI MASTER §5):** this card is
one mission's customer-facing exception; the rail door starts from the customer and lists all their orders
and recorded history. Both read the same Sales Orders / Delivery / Payment records; neither stores a copy.

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
calendar card. Use the Payment MASTER's governed collection/approval action and do not invent
`Blocked`. A permitted post-delivery clock starts from Delivered. PO/supplier delay belongs to
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
- **Payment exception line** beneath the Route: `Payment · Hold delivery · RM {amount} unpaid · by {date}` (amber
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
| Sales Orders · `delay_planning` | Supplier date breaks the customer commitment · record the customer-plan decision for that exact date | Responsible Delivery Operation for the customer commitment | 2 Office working days from detection | Decision and decided ETA recorded · Delivery opens the governed next booking act when required |
| Purchasing · `manual_purchase.approve` | Manual Purchase awaits a decision · approval/refusal recorded | Purchasing Approver | Request Order By date, Office calendar | Decision stored · approved demand may require PO issue |
| Purchasing · `manual_purchase.issue_po` | Approved demand/current PO version has not reached supplier · sent evidence | PO Duty | Request Order By date, Office calendar | Current version has confirmed-send evidence · normal state becomes Waiting for goods; no immediate reply task |
| Purchasing · `purchasing.po_window` | Eligible SO demand is stamped into a daily PO window, or a PO issued from that window has an unsent current version · buy the window's demand and send every PO | PO Duty | The window's own time on its day (PO Days that are Office working days; a supplier's earlier cut-off is its own window) | No eligible demand left in the window and every PO issued from it has its current version marked `PO sent to supplier` · the PO waits for goods |
| Purchasing · `purchasing.supplier_reply` | **Retired 2026-09-24:** absence of an immediate answer after sending is not work | — | — | Early exception is recorded in Purchasing when reported; otherwise the exact-date day-before rule governs |
| Purchasing · `purchasing.supplier_date_passed` | Supplier date passed with goods owing · new evidenced arrival answer | PO Duty | Supplier date, closure-adjusted | New governed supplier answer/date exists |
| Purchasing · `purchasing.confirm_tomorrows_delivery` | Effective arrival is tomorrow · obtain Supplier DO or evidenced confirmation for that exact date and named Warehouse. **One occurrence per PO goods line / split batch — BUILT 2026-09-26** (owner-approved 2026-09-25, Purchasing §5.7 per-item answer; `poExpectedArrivalsOf`): a line split `4 pcs · 26 Sep` + `2 pcs · 6 Oct` derives two dated occurrences | PO Duty | One Office working day before each batch's effective arrival | Matching Supplier DO or evidenced tomorrow-delivery confirmation exists for that batch; a later answer is recorded per line in Purchasing's one `Record supplier answer` form (`No change` · `Confirmed` · `New date` → `Earlier`/`Delayed` · `Split delivery`) and derives new date-specific occurrences. Card action: `Click WhatsApp, ask {Supplier} for the Supplier DO for {PO No}` (email channel: `Click Email, …`). **Recording is open to any active Operation person (owner ruling 2026-09-25, Purchasing §5.7)** — the occurrence routes to PO Duty, but whoever records the supplier's answer closes it; actual recorder is stored beside normal duty/cover, never in place of them |
| Purchasing · `purchasing.confirm_balance_delivery_date` | Short receipt left goods owing · balance promise | PO Duty | Opens with short receipt; Calls calendar owns filing | Balance promise for line exists |
| Receiving · `receiving.check_in` | Promised goods lack a posted session · check in the arrival. **Since 2026-09-26 the date trigger fires only for a PO whose current version is marked sent, on the earliest expected arrival; its fact reads `Supplier date passed · nothing received yet`** | GRN Duty owns the card; **any active Operation person may perform the receipt** (owner ruling 2026-09-25, Stock §7) — capability and owner stay separate | Promised arrival day | Receiving Session posted · stock/issue facts continue from Receiving |
| Warehouse · `warehouse.outbound_handover` | **Not admitted:** dated pickup has Units not handed over · exact receiver/proof result | Requires governed personal NETS operator or admitted Site queue; neither is currently built. **PROPOSAL / NOT LAW (Stock §7, 2026-09-25):** until then the card resolves to the current GRN Duty so a Carres person sees `{DO No} · {SO No} / {n} items · pickup by {company} today / Load the goods` | Scheduled Site handover date on Warehouse calendar | Every required Unit has accepted handover evidence · admission waits for governed owner/acceptance |
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
| Purchasing · `claims.record_ask` | **APPROVED TARGET / NOT BUILT (2026-09-25, Purchasing §9.5).** Claim open with no recorded ask · record what Carres asks the supplier | PO Duty | Next Office working day after intake/evidence readiness | `requested_action` stored with actor/time · `claims.obtain_reply` opens |
| Purchasing · `claims.obtain_reply` | **APPROVED TARGET / NOT BUILT (2026-09-25).** Ask recorded, `Reply expected` passed, no reply · `Ask {Supplier} to reply to the supplier claim` (opens the claim record's `Record supplier reply`) | PO Duty; any active Operation person may record and thereby close it (actual recorder stored) | Ask + Settings `Reply expected` working days (start 2); Settings escalation (start +2) raises it to supervision | `supplier_response` stored with scope, date and evidence · outcome work continues in Purchasing |
| Purchasing · `purchase_return.issue` | **APPROVED TARGET / NOT BUILT (2026-09-25, Purchasing §9.6).** Claim records `Return to supplier` and no PRTN exists · `Issue the purchase return to {Supplier}` (claim record → `Issue Purchase Return`) | PO Duty | Next Office working day after the decision | PRTN row exists · its send occurrence follows the shared send rule |
| Purchasing · `purchase_return.confirm_tomorrows_pickup` | **APPROVED TARGET / NOT BUILT (2026-09-25).** `Confirmed Pickup Date` is tomorrow and nothing is collected · `Confirm tomorrow's pickup · {Supplier}` | PO Duty; any active Operation person may record the supplier's confirmation | One Office working day before Confirmed Pickup Date | Evidenced pickup confirmation on the PRTN; a passed date with no Outbound handover reads `Pickup missed · Follow up supplier`; Stock's Outbound handover is the physical fact |
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
  Purchasing. Purchasing Settings has storage (0585) for the window times and supplier cut-offs but
  no editing screen yet; until one ships, the windows stay 11:30 AM and 4:00 PM.

## 7 · Right Rail and Notifications

**OWNER-APPROVED TARGET / NOT BUILT — 2026-09-24.** Remove the Right Rail My Work slot
and replace it with the customer-search/record door governed by UI MASTER §5. Formal Work,
My Work and Team Work retain their current scope, counts, action projection and existing navigation.
The customer door has no Work badge or task-completion control. The existing My Work rail code is
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

- The right rail follows UI MASTER §5's Calendar/customer/Activity target; it does not duplicate Work.
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
- The right rail (Calendar · Customers · Activity, UI MASTER §5) stays beside Dashboard on supported
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
never become a fourth Workspace destination.

### 13.1 · Owner-review result — 2026-09-16

The composition review covers the complete relationship, not isolated screens:

```text
Dashboard ──management fact drill-down──▶ owning Register / Team Work
Workspace ──Work──▶ exact owning action door
          ├─Staff & Duties──▶ shared owner/cover resolution
          └─Issue Tracker──▶ Issue truth + shared Current Action
Right rail ──(no Work count; UI MASTER §5)
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
