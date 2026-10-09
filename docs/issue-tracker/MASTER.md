# ISSUE TRACKER — MASTER

> **The only Issue Tracker document.** Overwritten when re-ruled; never versioned.
> **APPROVED / LOCKED business architecture — Jess, 2026-08-14; complete page Blueprint ready for
> owner review, 2026-09-15; business words, operating rules and shared MASTER UI composition
> owner-confirmed, 2026-10-06. Final screen UI/UX is NOT APPROVED and implementation is NOT
> AUTHORISED. Plan and align first; do not build merely because this Blueprint is detailed.**
> Read `CLAUDE.md`, `docs/ERP-ARCHITECTURE.md`, this file and the affected module MASTERs.

| I am working on | Read |
|---|---|
| anything | **§1–§3** |
| recording an issue | **§4** |
| current action / cover | **§5 and §12.5** |
| responsibility and evidence | **§6** |
| money and recovery | **§7** |
| Weekly Review / training | **§8 and §12.8–§12.9** |
| Related Party monthly report | **§9 and §12.10** |
| lifecycle, pages and permissions | **§10–§11** |
| exact owner-approved end-to-end behaviour and exceptions | **§12** |
| legacy Service Notes | **§13** |

---

# §1 · Mission

Issue Tracker records **every operational issue** so Carres can answer:

1. What happened?
2. Who or which party caused it?
3. Who must act now?
4. Who performed the extra work?
5. Who should pay?
6. What did it cost, what can Carres recover, and what was recovered?
7. What must staff learn or change?

It is the evidence used for internal training, every Weekly Review, Finance explanation and the
monthly report sent to each Related Party. Small mistakes, corrected mistakes, internal staff
errors, supplier/logistics failures, missed SOP steps and problems caught before customer impact
are all recorded.

```
MODULES       = TRUTH
WORK          = ACTION
ISSUE TRACKER = ACCOUNTABILITY + MEMORY + LEARNING
```

Issue Tracker never replaces SO, PO, Receiving, Unit/Stock, Delivery, Payment, Supplier Claim,
Service Case, Guarantee or Rental truth. It reads and links those records. Finance owns money;
Issue Tracker explains why the cost/recovery exists.

# §2 · The non-negotiable operating model

### Record every issue

Materiality controls review depth, never admission. Routine, significant and critical Issues all
enter the register. A solved issue remains evidence for meeting, training, repeat detection and
monthly reporting.

### Never depend on self-report or admission

The employee involved is never the only recorder and cannot block the record. Keep these separate:

| Fact | Meaning |
|---|---|
| **Recorded by** | who entered the Issue |
| **Found by** | who observed/discovered it |
| **Staff involved** | who performed the relevant work |
| **Staff response** | admit · disagree · no response · explanation given |
| **Reviewer finding** | confirmed fault · shared fault · not at fault · not enough evidence |

Customer Service, Operations, a duty reviewer, manager or the system may record/candidate an Issue.
Staff response is preserved but never overwrites observed evidence or the reviewed finding. People
owns discipline/performance; Issue Tracker supplies facts and learning evidence.

### System-led, not old-staff-led

Carres designs for a new employee who may not know the process, issue name, required evidence,
correct remedy or written English. The system holds the playbook. Staff confirm facts, perform the
complete named action and record the actual result. No workflow depends on memory, old WhatsApp
history or asking an experienced employee.

### Official English without English composition

Official fields, documents, exports and external reports use English. Operator instructions use
Primary School Standard English. Chinese/Bahasa Malaysia may explain `What does this mean?`; help
never changes the official record. The system generates formal English from structured answers.

# §3 · One Issue, one incident

An Issue is one coherent causal incident. It carries one permanent, searchable Issue No. and typed
links to every affected ERP object. It is never copied or deleted.

- **Merge** duplicate reports into one surviving Issue while preserving aliases/history.
- **Relate** separate Issues that may repeat the same pattern.
- **Split** only when independent causes/accountability cannot honestly close together.
- **Void** only a false/test/duplicate entry, with actor, date, reason and surviving link.
- **Reopen** only for new evidence, a missed consequence or failed preventive change, with reason.

Typed links may include SO, revision/cancellation, PO, Receiving Session, Supplier Claim, Unit,
Delivery Attempt/Exception, Delivery Order, Payment/refund/charge, Service Case, Guarantee Claim,
Rental Agreement and related Issue. The linked module remains the writer of its truth.

Classification is small and governed:

- source module;
- issue type;
- business impact;
- materiality: routine · significant · critical;
- Related Party / internal team/person;
- review requirement: standard or full learning review.

Do not collapse event, impact, cause and remedy into one category. `Priority` does not replace
materiality: urgency belongs to dated Work.

# §4 · Zero-composition intake

`Record issue` is a guided question flow, not a blank `What happened?` form. Entering from an ERP
object pre-fills its customer/supplier, item, quantity, dates and parties. The system asks one fact
at a time and branches from the answer:

```text
What has a problem?
Item · Delivery · Document · Payment · Customer information · Staff work · Something else

What did you see?
Wrong item · Damaged · Missing · Wrong quantity · Late · No reply · Wrong information
Required work was not done · I am not sure

Who found it?
Me · Customer · Warehouse · Supplier · Logistics

What proof do you have?
Photo · Video · WhatsApp reply · Delivery document · Other document
```

The answer decides the next question and evidence. A damaged Unit asks for Unit ID, label and
damage photos. Wrong delivery asks expected versus actual item/address. No reply asks party, last
contact date and required answer. A payment problem opens Finance instead of storing money in a
note.

The reporter never chooses root cause, blame or remedy at intake. `I am not sure` is a safe answer
that creates a complete evidence-check action; it never invites guessing.

The system generates the official English preview:

```text
Unit CU-000128 was damaged when Warehouse received PO-2041 on 14 Aug 2026.
3 photos were added by Mei Ling.
SO-1319 cannot use this Unit.
```

Staff choose `Correct` or return to the exact factual answer. They do not rewrite the paragraph.
Free text is a short optional `Add detail` with sentence starters; it never determines status,
fault, money or completion.

Module events may propose an **Issue candidate**: wrong/damaged Receiving result, failed Delivery
Attempt, reopened Service Case, voided/duplicate/corrected document, missing required evidence or
overdue required action. A reviewer confirms the observed facts or rejects the candidate with a
reason. Automation never accuses a person.

# §5 · Guided action and cover

The system always shows the current fact and one complete next action. The action grammar is:

```text
STRUCTURE  OBJECT IDENTITY + RESOLVED OWNER
LINE 1     FACT / PROBLEM
LINE 2     ACTION AND OBJECT + RECIPIENT + REQUIRED RESULT
```

The authoritative record is a versioned `issue_actions` occurrence. One Issue may have several
active actions when genuinely different work can proceed in parallel, but every action has exactly
one accountable owner. One governed **Primary Current Action** is selected for the Listing; the
Working Panel shows every active action and their dependencies. `Issue Triage Duty` owns evidence gathering and operational coordination;
`Issue Review Approver` owns the governed accountability decision. A module-specific action stays
in its owning module and is only linked here. Recording a result closes, partly completes or blocks
that occurrence and preserves normal owner, dated cover and actual actor; the same transition may
create the governed next action or release a dependent action. Workspace projects each active
occurrence once and never creates an `ops_tasks` copy.

Every action must answer:

- **WHO** acts — resolved from the governed Owner Rule and shown as structured avatar/metadata;
- **OBJECT** — exact Issue, SO, PO, Unit, document, evidence or amount;
- **RECIPIENT** — supplier, Logistics, customer, team or other receiving party;
- **REQUIRED RESULT** — the answer, evidence, confirmation or decision that completes it;
- **WHEN** — actual working weekday/date, shown in the row/action context.

Valid:

```text
Supplier has not replied
Call Macio about IS-204 · Ask if they accept RM80.

Recovery amount is missing
Add the amount to IS-204 · Link the Finance record.
```

Bare `Call`, `Ask`, `Check`, `Choose`, `Upload`, `Add`, `Send`, `Save`, `Follow up`, `Review`,
`Handle` and `Resolve` are invalid. If one line cannot fit, show labelled `Owner · Object · Contact ·
Do · Need`; omit nothing. `Owner` remains a structured field in that expanded view and is not
prepended to the action sentence.

The system prepares the evidence/message and presents governed factual results, for example:

```text
Repair accepted · Replacement accepted · Rejected · More proof needed · No reply
```

The selected result derives the next Work item. Work remains the action owner and the relevant
module records its completion fact.

An authorised cover opens `My Cover Work` and continues from current fact, owner, due date, last
reply, missing evidence, prepared material and required result. Cover does not grant approval,
fault-review, recovery-waiver or Finance posting authority.

# §6 · Accountability, evidence and review

Never collapse these identities:

| Identity | Question |
|---|---|
| **Fault Owners** | Which one or more parties caused or contributed to it? |
| **Action Owner** | Who must solve it now? |
| **Cost Bearer** | Who should ultimately pay? |
| **Service Provider** | Who performed the extra work? |

**Fault Owners are one-to-many.** One Issue may name several internal/external parties when the
evidence proves several contributing failures. Never force one primary party merely to make the
register tidy. Each Fault Owner entry carries:

- governed party/person/team identity;
- confirmed fault · contributing fault · not yet confirmed;
- the exact act/omission attributed to that party;
- supporting evidence;
- reviewer and reviewed date;
- party/staff response;
- append-only revision history.

Example: Hookka supplied the wrong item; Operations did not check the label; TSDD delivered it.
These are three separate Fault Owner findings on one incident, not three duplicate Issues.

Each external Fault Owner resolves to one governed Related Party master. `Hookka`, `Supplier-Hookka`
and spelling variants cannot split the monthly record.

Do not require a blame percentage. Use a percentage only when an authorised commercial agreement
actually allocates liability. Fault contribution and money liability remain separate: the Issue may
have three Fault Owners but only one or two Cost Bearers.

The append-only timeline preserves observed fact, evidence, external reply, linked module events,
staff response, attribution/revision, Work, money links, review, learning, close/reopen/merge/split/
void. Corrections append what changed and what they supersede.

Accountability review answers:

- what was observed and what authoritative records prove;
- which one or more parties caused/contributed and what evidence supports each finding;
- who performed extra work;
- what cost arose and who should bear it;
- whether this repeats another Issue;
- what the involved staff/party said;
- what training, SOP or prevention result is required.

Staff or party admission is evidence, never a gate. Preserve their response and reviewer finding
separately. Routine Issues receive a short review; significant, critical, recurring, safety/legal
or threshold-cost Issues receive a full learning review.

# §7 · Money and recovery

Show three tracks; never net them:

1. **Cost incurred** — what Carres owes/paid for the consequence.
2. **Amount recoverable** — what another party should pay Carres.
3. **Amount recovered** — what Carres actually received.

Example:

```text
Cost incurred       RM80 · NETS extra trip · Paid by Carres
Amount recoverable  RM80 · Hookka supplied the wrong item
Amount recovered    RM0 · Waiting Hookka reply
```

Each amount carries currency, date, counterparty, simple business reason, evidence and owning
Finance record. Partial recovery is allowed. Waived/not pursued needs authorised reason and never
rewrites incurred cost to zero. Issue Tracker explains the incident; Finance owns payment,
receivable/recovery and ledger truth.

# §8 · Weekly Review and learning

`Weekly Review` is the permanent capability name. Wednesday is only the default setting and may be
changed for future sessions. Every Weekly Review covers:

- every Issue recorded since the last meeting;
- every still-open Issue;
- internal staff mistakes;
- waiting staff/party response;
- waiting reviewer finding;
- repeat Issues;
- training/SOP changes;
- costs and unrecovered amounts.

Routine Issues are confirmed quickly: fact · responsibility · current action · result · learning.
The meeting spends deeper time on repeats, significant/critical Issues, internal mistakes, high
cost and overdue recovery.

The Issue stores `Issue discussed`, session identity/date, training needed/not needed, SOP change needed/not
needed and linked complete actions. A solved operational problem remains in Weekly Review until
its required learning result is recorded. Do not maintain a second meeting spreadsheet.

# §9 · Related Party monthly report

For every supplier, Logistics company, warehouse or other Related Party, the system prepares one
monthly evidence report. It exists so Carres, Finance and the party use the same facts instead of
arguing from WhatsApp memory.

An Issue with several Fault Owners appears in every applicable Related Party report, showing only
that party's attributed act/omission plus the common incident facts. The Issue count is a distinct
Issue count within each party report. Company-wide totals count the Issue once.

Header:

- Related Party · month · report version/generated date · Carres contact;
- counts separated into confirmed fault · waiting response · disputed;
- separate totals for cost incurred · amount recoverable · amount recovered.

Every Issue row includes:

1. Issue No/date;
2. linked ERP document/object;
3. system-generated factual description;
4. reviewed fault finding;
5. evidence list;
6. customer/operational consequence;
7. action/result;
8. incurred/recoverable/recovered amounts allocated to this party, plus common incident cost for
   context where permitted;
9. party response/date;
10. current required result.

Confirmed, awaiting response and disputed Issues are separate report sections, and one party row
lands in exactly one (HF-2, 2026-09-17): the party disagrees → Disputed, whatever the finding;
otherwise a confirmed or contributing fault → Confirmed; otherwise not yet confirmed → Waiting. Only
Issues observed inside the chosen month (`?month=YYYY-MM`) count. An allegation never
enters confirmed totals. Disagreement never deletes evidence: preserve Carres finding, evidence
sent/date, party response/date and final reviewed outcome.

Never duplicate money merely because an Issue has several Fault Owners. Cost incurred is counted
once at Issue/company level. Recoverable and recovered amounts are assigned to the relevant Cost
Bearer(s); the sum across party reports must reconcile to the Issue totals.

Staff do not rewrite a monthly narrative. An authorised owner checks the generated report,
recipient and attachments before sending. The system records exact version, recipient, channel,
sent date and evidence. External sending remains separately authorised; planning never sends it.

Finance receives the corresponding permissioned view grouped by party Carres paid, Fault Owners,
Cost Bearer, incurred, recoverable, recovered, outstanding recovery, Finance link and missing
Finance action.

# §10 · Lifecycle and closure

```text
Observed → recorded/matched → facts/evidence → operational links/Work
→ accountability review → money follow-through → learning review
→ Weekly Review where required → closure gate → Closed
```

Close only when:

- operational consequences are complete or explicitly continue in their owning module;
- required Work is owned;
- fault/cost identities are confirmed or evidence says not attributable;
- incurred/recoverable/recovered tracks reconcile or authorised non-pursuit exists;
- required review and learning are complete;
- closure summary states what changed and what remains elsewhere.

Customer Service Case closes on customer confirmation; Supplier Claim closes on its own evidence;
Finance closes money; Issue close never closes them, and their close never automatically closes the
Issue.

# §11 · Pages, views, settings and permissions

Issue Tracker is a **WORKSPACE** destination beside Work, because it crosses every module. Use the
governed Register, Object Detail, Work Toolbar, central Settings and Carres UI/copy authority.

Register default columns, in order: `Observed On · Issue No · Issue · Work Needed · Current Action ·
Fault Owners · Money · Linked Records`. `Observed On` and `Issue No` are the non-hideable leading
columns. `Issue State` and all audit facts remain available through the shared Columns menu.

The left mission rail is not a second ordinary filter menu. It shows system-derived work that a
normal column filter cannot explain: `Need Facts · Need Action · Need Responsibility · Need Money ·
Waiting for Reply · Weekly Review · Need Learning · Ready to Close`. One Issue may appear in several
queues; counts are real non-additive counts. `All/Open/Closed/Voided`, people, party, source, type,
date and state remain Search, column filters or saved views. Monthly Reports live under Page tools.

Issue workspace: identity/summary · Current Action · linked records · four accountability identities
· three money tracks · evidence/timeline · review/learning · related/repeat Issues · history.

The Current Action block shows `What is true · What to do · Why · What to check/send · What to ask ·
Choose their answer · What happens next` and only relevant fields.

Central Settings → Issue Tracker surfaces the Issue-owned configuration for issue types/source
mappings, materiality/review rules, cost/recovery thresholds, attribution/recovery policy, Related
Party report contacts/recipients, meeting/learning destinations, retention and restricted
categories. This is one central Settings destination, not permission to duplicate Staff & Duties,
Payment/Finance or Related Party source records inside Issue Tracker.

Permissions:

- any authorised observer/reviewer may record an Issue involving another staff member with evidence;
- involved staff may add a response but cannot rewrite observed facts;
- review-authorised Operations/Principal confirms fault with reason/evidence;
- Finance records money in Finance;
- Principal/governed authority waives recovery and closes critical/restricted Issues;
- authorised business owner approves/sends external monthly reports;
- merge/split/void/reopen are restricted and fully audited.

No KPI-card dashboard, employee league table, bulk fault/close/recovery mutation, Issue calendar,
duplicate Settings home, blank English report, copied Issue or deletion.

## §11.1 · Workspace destination composition

Issue Tracker is a `Workspace` destination beside `Work`; Staff & Duties belongs in global
Settings (Workspace §4, owner-approved placement 2026-09-28 / NOT BUILT). Issue Tracker is not a
Work scope and not a Dashboard. The Register answers what incidents exist and where accountability,
money or learning remains incomplete. Shared Work answers who must perform the current admitted
Issue action. One Issue and its versioned `issue_actions` occurrences retain the same identities on
both pages.

```text
┌ Issue Tracker ───────────────────────────────────────────────────────────────┐
│ Every issue stays for facts, money and learning.                            │
│ Search issues…   Table / Cards        ⋯ Page tools              Record issue│
├ WORK NEEDED ─────────┬ ISSUE REGISTER ───────────────────────────────────────┤
│ Need Facts           │ Observed On · Issue No · Issue · Work Needed          │
│ Need Action          │ Current Action · Fault Owners · Money · Linked Records│
│ Need Responsibility  │                                                       │
│ Need Money           │ IS-2608-0001 · 14 Sep                                │
│ Waiting for Reply    │ Unit CU-000128 was damaged…                          │
│ Weekly Review        │ Need Responsibility +2                               │
│ Need Learning        │ Mei Ling → Hookka · Ask for written proof            │
│ Ready to Close       │ RM80 incurred · recovery not ready                   │
└──────────────────────┴───────────────────────────────────────────────────────┘

The default listing scope contains all authorised Issues; materiality never removes routine Issues. Search matches Issue No.,
official English, linked object number, governed Related Party and authorised staff identity. Filters
are `Observed`, `Source module`, `Issue type`, `Materiality`, `Related Party`, `Internal team/person`,
`Issue state`, `Current-action state`, `Money state` and `Repeat/related`. Saved views are governed
combinations of ordinary filters, not substitutes for the mission rail. Search, selected work queue, filters and
opened `issue` identity are URL-visible and individually removable under one `Clear filters`.

The Register is reference truth. Selecting a row opens the Issue workspace; no row-level fault,
money, close or result mutation exists. `Current Action` uses the shared two-line presentation and
opens the exact action/result section. It never says `Set next action`: when no valid action exists,
it states the lifecycle fact such as `No current action`, `Waiting for triage rule` or `Closed`, and a
configuration failure remains visible to authorised supervision.

## §11.2 · Issue workspace composition

The Issue workspace is a full object detail, not a wide generic modal. Its fixed identity header is
`Issue No. · lifecycle state · materiality`, with links to exact owning objects. The reading order is:

1. `What is true` — official generated English and observed/source facts;
2. `Current Action` — structured owner, fact/problem, action, recipient, required result, due and
   exact `Record result` door when the signed-in actor is authorised;
3. `Linked records` — live read-only identities/statuses from owning modules;
4. `Accountability` — Found by, Staff involved, Fault Owners, Action Owner, Cost Bearer and Service
   Provider kept distinct;
5. `Money` — incurred, recoverable and recovered tracks with Finance doors, never local arithmetic;
6. `Evidence & timeline` — append-only evidence, responses, findings, actions and corrections;
7. `Review & learning` — standard/full review, Weekly Review outcome and prevention evidence;
8. `Related Issues & history` — repeat links, merge/split/reopen/void evidence.

Only the current relevant section expands by default. On desktop, a quiet section index may remain
sticky beside the document. The primary action changes with lifecycle and permission; there is never
more than one competing blue action in a section. Closing the detail preserves Register search/view.

## §11.3 · Record Issue and current-action generation

`Record issue` follows §4 one governed question per step, with Back and a visible progress sentence.
Entering from an owning object pre-fills and locks its typed identity while allowing the reporter to
correct a visibly wrong link through a governed search. Dates use the shared date control; proof uses
the governed uploader and records actual files, not a proof-type answer with no attachment.

The system—not the reporter—derives source module, official English, materiality suggestion, review
requirement, owner rule, next-action choices and due law from structured answers/settings. The
reporter confirms the generated factual preview and may choose only a governed result/action branch.
They never type an arbitrary action, required result or due date to make intake pass. `I am not sure`
opens a complete evidence-check action owned by Issue Triage Duty.

Creation is atomic: Issue identity, typed links, intake facts, evidence references and first governed
action either persist together or not at all (BUILT 2026-09-17: `issue_record_issue`, 0526, keyed by the client `request_id`). An uncertain response reconciles by request/Issue
identity before retry; it cannot create a duplicate incident. Success opens the new Issue workspace.

`Record result` shows the exact action being completed and only its governed result choices. Each
choice names the evidence required and the derived consequence before confirmation. One atomic
transition records result, actual actor, normal owner, cover, time and evidence, then completes or
replaces the occurrence. There is no generic `Save result`, free-text-only completion or manual
`Done`. Optional detail supplements a structured result and never determines status.

### Intake and result validation copy

| Condition | Exact sentence |
|---|---|
| Problem object missing | `Choose what has a problem.` |
| Observed problem missing | `Choose what you saw.` |
| Finder missing | `Choose who found the issue.` |
| Observed date missing | `Choose when the issue was found.` |
| Required typed source missing | `Find and choose the linked record.` |
| Required proof branch has no evidence | `Add the required proof.` |
| Generated facts not confirmed | `Check the facts before recording this issue.` |
| No governed action rule can be derived | `The next action could not be worked out. Ask an Issue Tracker reviewer to check the rules.` |
| Result choice missing | `Choose what happened.` |
| Result evidence missing | `Add the evidence needed for this result.` |
| Action already changed/completed (404) | warning icon plus `Action changed · Review again` |
| Create/result uncertain — network error, timeout, no answer | warning icon plus `Not confirmed · Try again`; never `not recorded`. A retry of the same answers reuses the request id, so it cannot record a second Issue |
| Create refused by the server with an error | `Issue not recorded · Try again` |
| Result refused by the server with an error | `Result not recorded · Try again` |
| Permission refused (403) | `Only {acting person} can record this.`; only when no acting person can be named: `You do not have access to record this result.` Never `Only {Duty} can record this result.` — a Duty is not the person who acts |

Owner ruling 2026-09-17 (HF-2). A 400/422 shows the sentence of the first wrong step and opens that
step. Every sentence appears inside the open dialog, takes focus and keeps every answer; the submit
button accepts one request at a time.

The page focuses the first invalid governed answer and preserves all valid answers/files. A raw
database, validation-library or status-code sentence never reaches the operator.

## §11.4 · Register and detail states

| State | Required presentation and behaviour |
|---|---|
| Loading | Keep view/search/filter shell; row/detail skeletons match final geometry; never show `0 issues` early |
| True empty | `No issues recorded` only when the complete authorised source is healthy; `Record issue` remains available |
| No match | `No issues match these filters` · `Clear filters`; never imply there is no history |
| List source failed | `Issue Tracker could not be opened` · `Try again`; footer does not print zero |
| Detail source failed | Keep selected Issue identity where safe · name failed section · retry it without closing the Register |
| No current action | Print exact lifecycle reason; do not invite a generic next action |
| Not assigned | Print governed Duty and Staff & Duties correction door; Issue remains visible in Register and Team Work health |
| Late action | Exact due date/working-days-late from shared Work; blocked/review state does not hide lateness |
| Permission refused | No protected evidence, people, money or counts leak; return to authorised Register scope |
| Save in progress | Disable duplicate submit; preserve entered structured facts; show one progress state |
| Save failed/uncertain | Keep answers/evidence; reconcile original request before retry; never fabricate success |
| Closed/voided | Read-only full authorised history with closure/void actor, reason and surviving links |

Reuse the responsive behaviour of the shared `DataGrid`, `Drawer variant="compact-card"` and
`CompactModuleCard`; Issue Tracker must not invent a second breakpoint or card system. On narrow
screens the shared Cards presentation is one column and the Working Panel is full width. No page
horizontal overflow, clipped official English or three-card accountability grid is admitted. Intake
and result flows are single-column, touch-safe and resumable. Hover evidence is also accessible by
focus/tap.

## §11.5 · Current → proposed gap audit — 2026-09-15

| Current branch evidence | Required Blueprint state |
|---|---|
| Register, saved-view labels, Record issue, object detail, monthly-report door and versioned action result exist | Retain identities and authoritative doors; rebuild presentation to §11.1–§11.4 |
| Current list has no governed loading, error, true-empty or no-match treatment and prints `0 issues` before source health | Add explicit source-aware states; failed/unknown is never zero |
| Current views are local state; search and structured filters are absent | Use one authorised query contract with URL-visible view/search/filters |
| Current eight-column table relies on horizontal overflow | Preserve desktop reference table; use vertical rows below 1024px |
| Current row says `No current action` when no occurrence exists (HF-2, 2026-09-17) | Replace with exact lifecycle/configuration fact; no generic action invention |
| Current detail is one wide modal with three simplified accountability cards | Use the governed object-detail reading order and keep all distinct identities/evidence |
| Current intake asks for free-form linked identity/date facts and lets reporter choose action, required result and due | Make typed object/date/evidence controls and system-derived action/due law authoritative |
| Current proof choice can save without actual evidence attachment | Require governed file/evidence record where the chosen branch says proof exists |
| Current result flow uses generic choices plus free-text evidence and `Save result` | Show action-specific result/evidence choices and one atomic transition with actual actor/cover |
| Current tests prove only basic register/intake/action opening | Add source-state, URL, permission, identity, atomic retry, action derivation and 1440/1024/390 responsive evidence |

## §11.6 · Permission matrix

| Capability | Authorised actor | Everyone else |
|---|---|---|
| Read Issue/Register | Permissioned Operations/Principal and specifically authorised reviewers | No row, count, identity, evidence or money leak |
| Record Issue | Any authorised observer/reviewer, including about another person | No intake door |
| Add involved-staff response | That staff member or authorised recorder acting with attributed evidence | Cannot overwrite observed facts/finding |
| Perform Current Action | Shared Work's resolved acting person with the action's required capability | Read-only action facts or no access |
| Record Current Action result | Same authorised actor/proxy law checked at submit | Refused without changing occurrence |
| Confirm Fault Owner/finding | Review-authorised Operations/Principal, not automatically the involved person | May add response only where authorised |
| Record/link money | Finance through Finance's source doors | Issue Tracker reads links only |
| Waive recovery / close critical or restricted Issue | Principal or governed authority | No control; never a disabled imitation |
| Merge, split, void or reopen | Restricted governed authority with reason/evidence | Read-only lifecycle history |
| Approve/send Related Party report | Authorised business owner; external transmission separately confirmed | Preview only within permission scope |

Permission is checked again by each write door. Visibility of an Issue or Work item never implies
authority to decide fault, post money, waive recovery, send externally or close it.

## §11.7 · Issue Tracker acceptance contract

The page is ready for owner acceptance only when all are demonstrable:

- routine, significant and critical Issues enter one Register with one permanent searchable number;
- source-object entry prefills a typed link and preserves authoritative source facts;
- the guided intake reaches a generated official-English preview without a required blank narrative;
- source module, materiality/review rule, owner rule, action choices, required result and due law are
  system-derived; staff cannot type an arbitrary action/date to create a valid Issue;
- evidence branches that say proof exists retain an actual governed file/evidence record;
- every active versioned action has exactly one accountable owner, projects once into Work, and
  completes/partly-completes/blocks or creates its governed successor atomically with normal owner,
  cover, actual actor, result, evidence and time; one Primary Current Action is selected for Listing;
- all accountability identities and all three money tracks remain separate and reconcile to their
  owning sources;
- saved views are reproducible filters; URL search/view/filter/Issue selection survives detail and
  cross-module navigation;
- permissions in §11.6 pass positive and negative authenticated tests without leaked counts/details;
- loading, true-empty, no-match, partial/detail failure, not-assigned, late, uncertain-save,
  closed and voided states match §11.4;
- duplicate create/result retries, concurrent result attempts, merge/split/reopen/void and correction
  preserve one incident/action history without deletion;
- Register, object detail, intake, result and monthly-report paths remain readable and keyboard/touch
  operable at 1440, 1024 and 390px;
- Weekly Review and Related Party report totals trace back to distinct Issues and Finance links,
  never duplicated action/task rows.

# §12 · Owner-approved business operating contract — 2026-10-06

This section resolves the business-word, workflow and shared-composition review held on 2026-10-06.
It is **APPROVED / LOCKED for business meaning and planning**. It is not approval of a screen design,
localhost, implementation Card or deployment. Earlier business wording is read through this section
where it conflicts. A future authorised build must demonstrate each trigger, staff step, system
transition, completion gate, exception and audit fact below. Do not ask the Owner to choose
engineering details.

## §12.0 · Build and review protocol

Every new Issue Tracker chat must first pull current `origin/main` and read `CLAUDE.md`,
`docs/ERP-ARCHITECTURE.md`, `docs/UI-DICTIONARY.md`, `docs/ui/MASTER.md`, this MASTER, the affected
module MASTERs and the current shared component source. It must inspect the current localhost UI and
real supplied sources before proposing or building. An old screenshot or standalone HTML is never
UI authority.

Keep four states explicit: **APPROVED**, **PROPOSAL — OWNER REVIEW REQUIRED**, **BUILT LOCALLY — NOT
DEPLOYED**, and **DEPLOYED**. Silence is not approval. Approval of one surface does not approve the
next. `Yes` approves only the item immediately presented; it never silently means final UI/UX or
implementation approval. Before implementation, the relevant cross-module alignment and complete
Blueprint review require Owner approval. Before deployment, the complete real-data localhost flow
and final UI/UX require the Owner's explicit words `UI/UX approved`. No deployment follows from
Blueprint or localhost review alone.

**Current authority status (2026-10-06):**

| Scope | Status |
|---|---|
| Business purpose, words and workflows in this MASTER | **OWNER CONFIRMED** |
| Listing words: `Problem Date · Issue No · What Happened · Work Needed · Current Action · Fault Owners · Money · Linked Records` | **OWNER CONFIRMED** |
| Shared composition: global ERP shell · shared Header · mission rail · DataGrid Table/Cards · Drawer + CompactModuleCard · Full Issue | **OWNER CONFIRMED** |
| Exact visual result, dimensions in context, responsive UX and complete localhost | **OWNER REVIEW REQUIRED — NOT APPROVED** |
| Existing standalone or real-component Issue Tracker previews | **REJECTED AS UI/UX AUTHORITY** |
| Implementation plan/Cards, production code and deployment | **NOT AUTHORISED** |

**Settings reconciliation — 2026-10-09:** the consolidated Settings inventory confirms the
required Issue Tracker coverage; it is an index and evidence record, not a second Issue authority or
a build claim. Issue Tracker continues to own its classification, source mapping, restricted
category, review/materiality, responsibility, cost-attribution/recovery-policy, Weekly Review,
Minutes/learning and Related Party reporting configuration. The owning sources remain separate:

- Staff identity, qualification, duty, approver resolution, recorded leave and qualified Cover come
  from Workspace Staff & Duties; Issue Tracker stores the resolved role/person and actual actor, but
  does not create another staff, rota, leave or approver editor.
- Payment/Finance owns actual incurred, paid, receivable, recovered, waiver/write-off and ledger
  truth. Issue Tracker may configure classification, thresholds and attribution/recovery workflow,
  but it does not create a second money account, posting, payment or Finance-approval editor.
- The governed Related Party source supplies party identity and verified communication records.
  Issue Tracker owns report-purpose contacts/recipients, permitted access, retention and audited
  send use; a visible party row or typed recipient is not proof that the recipient is verified, the
  report is approved, sending is enabled or delivery succeeded.

Authenticated observation on 2026-10-09 found only the Related Party name/type/contact/recipient
surface and an empty table on the current Issue Settings page. Treat that only as displayed runtime
evidence. It does **not** prove the wider classification, review/materiality, Weekly Review, Minutes,
learning, reporting or retention Settings are built, saved, enforced or production-verified. The
same Staff & Duties observation showed Issue Triage and Issue Review unassigned; that is a current
displayed value, not an approved default and not permission to invent a person.

Owner direction that rules are configurable means an authorised editor, version/effective treatment
and audit history must be defined before implementation. It does not grant unrestricted editing,
permit disabling mandatory evidence or Finance controls, silently recalculate completed sessions or
sent reports, or make a new setting retroactive by assumption. `Confirmed` in the Settings inventory
means the setting scope/default has authority; it never means every value is supplied or the control
already exists online.

The confirmed shared composition means Issue Tracker must reuse the current UI MASTER and actual
shared components; it does not approve any module-local arrangement. A future UI review must show
the real current ERP shell and reference module, then receive explicit final approval.

For every workflow state, the build specification and acceptance evidence must state:

1. trigger and source;
2. person responsible and person accountable;
3. facts shown to the operator;
4. exact structured answers available;
5. automatic system work;
6. authoritative output and owning module;
7. completion and exit condition;
8. permission and approval;
9. failure, unavailable-source and correction behaviour;
10. timeline/audit facts and downstream consumers.

Use real records and real counts in localhost review. Unknown source values render `Not recorded`,
`Needs review` or `Source unavailable`; never invent a person, status, amount, date, action or result.
Every review visibly says `Real source data · Localhost review · Not deployed`. Customer personal
information is hidden unless the reviewed work requires it.

Core RACI:

| Process | Responsible | Accountable | Consulted | Informed |
|---|---|---|---|---|
| Record/confirm facts | authorised reporter or Issue Triage Duty | Operations supervisor | owning module staff/customer service | involved staff |
| Perform Current Action | resolved Action Owner or recorded Cover | owner-rule supervisor | target party/owning module | Issue reviewer |
| Confirm responsibility | authorised Issue reviewer | governed manager for dispute/high materiality | involved staff/Related Party | Action Owner and Finance where relevant |
| Confirm money/posting | Finance operator | Finance authority | Issue reviewer/Cost Bearer | Action Owner |
| Weekly Review and Minutes | actual chair/Backup | configured Minutes approver | participants/Finance where relevant | Action and Learning Owners |
| Learning/improvement | Trainer or improvement Owner | supervisor/manager | SOP/system/HR owner where relevant | affected staff |
| Monthly Report | authorised report owner | governed business approver | Issue reviewer and Finance | Related Party and Action Owners |
| Close/reopen/void/correct | authorised lifecycle actor | governed authority | owning modules/Finance | affected owners and parties where required |

## §12.1 · Shared UI composition — no page-local imitation

Issue Tracker uses the one shared ERP composition:

```text
module entry → left mission rail → shared DataGrid Listing → shared Working Panel
             → action/result → return to the same Listing context
```

- Listing uses the shared `PageShell`, `register/DataGrid`, Search, Table/Cards, Page tools, Columns,
  typed column filters, sorting, pagination, loading, empty, no-match and error states.
- Cards consume the DataGrid's exact filtered/sorted result. They are not a dashboard or Kanban.
- A row or Card opens the shared `Drawer variant="compact-card"` containing the real
  `CompactModuleCard`; Issue Tracker must not recreate its header, tabs, helpers or responsive CSS.
- The card identity is the Issue. It opens on `Issue`; `Info` is factual read-only context.
  Communication, Timeline and any linked-record/evidence door reuse the shared admitted component.
  If the shared kit lacks an Evidence door, evidence stays inside `Issue` until the UI authority
  closes that kit gap; the module may not invent a helper icon.
- The Working Panel shows Work Needed, all active actions and the Primary Current Action. Full Issue
  opens the complete record. Closing either preserves rail scope, Search, filters, sort, page,
  selection and scroll.
- Mobile uses the shared one-column Cards result and full-width Drawer. It never presents an
  eight-column sideways page.

Default Listing columns, in order:

| Column | Contract |
|---|---|
| `Observed On` | real/estimated/unknown observed date; never substitute Created On; pinned and non-hideable |
| `Issue No` | permanent identity and Full Issue door; pinned and non-hideable |
| `Issue` | short generated fact, with `reported` wording while unconfirmed |
| `Work Needed` | highest-priority mission condition plus `+N`; all conditions in panel |
| `Current Action` | Primary Action in `owner → target · act · due` compact form and exact no-action reason |
| `Fault Owners` | all-party summary and confirmation/dispute state; never hide additional parties |
| `Money` | amount plus `not known/estimated/confirmed/paid/recovery` state, not a naked number |
| `Linked Records` | typed doors to owning records; Service Note/Claim/Message is not a duplicate Issue |

The grouped Columns chooser exposes Issue; Action; Responsibility; Money; Source and People;
Review and Learning; Communication and Evidence; and Monthly Report facts. Personal layout is saved
per user. Team saved views never silently replace another user's layout. Dates use date filters,
people/parties use governed identities, money and responsibility use typed states. There is no
duplicate generic Filters button.

The left mission rail shows only work that ordinary listing filters cannot explain:

| Queue | Enter when | Staff must do | Exit when |
|---|---|---|---|
| `Need Facts` | required observed/object/event/party/source/evidence fact missing | confirm structured facts and proof | minimum factual statement is complete |
| `Need Action` | no valid Current Action, or prior action ended without a successor | confirm governed owner, target, act, due and proof | valid active action exists |
| `Need Responsibility` | possible/multiple/disputed owner, missing reason/evidence/percentage/approval | review every possible owner | responsibility completion gate passes |
| `Need Money` | incurred/paid/recovery fact or Finance proof incomplete | complete cost and Finance-owned links | money completion gate passes |
| `Waiting for Reply` | actual outbound request is waiting | monitor, record reply or execute overdue follow-up | reply result recorded or new action replaces wait |
| `Weekly Review` | governed review/decision/learning trigger | record structured meeting decision | decision, actions, learning and approved Minutes exist |
| `Need Learning` | training/SOP/system/prevention result incomplete | perform and prove learning/improvement | learning gate passes |
| `Ready to Close` | every other gate passes | perform final authorised check | Issue is Closed |

One Issue may occur in several queues and the counts therefore do not add to the distinct Issue
total. Counts are live calculated facts. Closed/Voided Issues do not appear. `All/Open/Closed/
Voided`, internal/external party, people, source, type, date and status belong to Search, column
filters or saved views. Monthly Reports belong to Page tools, not the rail.

## §12.2 · Five intake doors and one Issue

An Issue enters through exactly one recorded origin, while later sources link to it:

1. **System-created Draft** — an approved module event creates `Needs Staff Confirmation`.
2. **Report Issue** — an authorised person invokes the door from a real ERP object; that object is
   prefilled and linked.
3. **Customer Claim** — a secure external submission creates/matches a Draft, never a confirmed fact.
4. **WhatsApp/API** — the immutable inbound event creates/matches a Draft and preserves message ID.
5. **Manual New Issue** — for phone,现场/internal/system-outside events with no usable source object.

Before creation, duplicate detection compares source record, customer, product/object, governed
problem type, observed time, party, Service Case, Claim, message ID and evidence checksum. A likely
duplicate shows the surviving Issue and why. The authorised operator chooses `Link to existing
issue`, `Create a separate issue` with a governed reason, or `Not the same problem`. A Service Note,
Claim, Message or API event linked to an existing incident never becomes a second Issue row.

The guided steps are: how found → observed date/time and certainty → affected object and Primary
Source → module-specific `What happened` choice → confirm/correct each source fact without
overwriting it → involved/witness/reporter/possible-owner roles → `Yes/No/Not known yet` money →
actual evidence and `What does this prove?` → generated English preview → system-calculated Work
Needed and first Current Action → `Confirm Issue`.

`Involved` never implies `Responsible`. A possible Fault Owner is never confirmed at intake.
Customer/external statements remain labelled statements until authorised review. Dates preserve
Observed, Reported and Created separately. `Other` branches into further simple questions, never a
large required English textarea. The staff member corrects structured facts rather than rewriting
the generated sentence.

On confirmation the system atomically creates the permanent Issue No, source links, immutable source
facts, evidence, Draft/confirmed transition, Work Needed, first action(s), timeline and owning-module
Issue link. If a rule cannot derive a safe action, show `Waiting for triage rule` and enter `Need
Action`; never invent one. Rejected/spam/not-an-Issue Drafts keep actor, reason and original source.

Every module proposal and Blueprint chat currently in progress must align with this common handoff
contract before that module is declared complete: source module/type/identity/URL, event time,
customer/party, affected object/product, involved staff, original state/message/evidence, known money,
creation origin and duplicate candidates. When each module is completed, perform an **Issue Tracker Integration Audit**
covering trigger events, auto-Draft versus suggested/manual door, excluded normal
events, prefill, evidence, money, duplicate detection, return result, permissions and timeline. After
all modules, perform the whole-domain audit again. Module completion without this audit is incomplete.

This alignment happens in two passes and does not wait silently until the end:

1. **During each active module Blueprint/build:** tell that module chat which events auto-create a
   Draft, suggest `Report Issue`, remain manual or must not create an Issue; define exact prefill,
   evidence, Money/Finance ownership, duplicate key, Issue link and result returned to the module.
2. **After that module is complete:** run the Issue Tracker Integration Audit against the actual
   built module, then record gaps without inventing a second Issue workflow.

The final whole-domain audit reconciles Sales Orders, Purchasing, Receiving, Stock, Delivery,
Payment, Service Case, Customer Service WhatsApp/API and secure Claim/Reply links. Until those module
contracts are available, keep their mappings as explicit alignment work—not guessed implementation.

## §12.3 · Facts, evidence and source corrections

Original source facts and files are immutable. A correction appends original value, corrected value,
reason, actor, time and evidence. The official fact always distinguishes `Customer reported`, `Staff
recorded`, `Delivery proof shows`, `System confirmed` and `Not confirmed`.

Every evidence record holds type, immutable file/message, source, actor/time, original filename,
the fact/owner/cost/action/learning it proves, verification state and external-sharing permission.
States are `Not reviewed · Verified · Needs clarification · Rejected · Source unavailable ·
Restricted`. Rejection preserves the file and reason. Supported meanings are what happened/when,
involvement, responsibility, amount/payment/recovery, communication, action completion and learning.
The system preserves original files, validates permitted type/size/safety, produces a view copy and
shows `Evidence file unavailable` instead of blank content.

## §12.4 · Working Panel and Full Issue

The card header shows Issue No, short fact and highest-priority Work Needed (`+N` when more). It never
borrows a fake customer, order, address, requested date or Delivery countdown. Its four summary facts
are Observed On, Current Action, Fault Owners and Money; linked records retain typed doors.

`Info` contains identity/state/dates/source, confirmed versus reported facts, affected object/type/
impact/materiality, people/parties, typed linked records and money summary. `Issue` begins `This issue
needs N things`, then shows why, owner, due, state and completion door for each, followed by Primary
Current Action and relevant Responsibility, Money and Evidence work. Buttons are `Do Action`, `Record
Result`, `Cannot Do`, `Ask for Help` and the authorised management doors—never a generic Save/Done.

Full Issue keeps complete facts, all owners, costs, evidence, communication, timeline, Weekly Review,
Monthly Report, learning, correction and lifecycle history. The panel is quick work, not a replacement.

## §12.5 · Current Action, parallel work and result

Every action contains structured `Action Owner · Object · Target Party · Required Action · Due date/
time · Required Proof · Completion Rule · Reason`. Visible sentences use Primary School English.
Bare `Call/Ask/Check/Follow up/Send/Upload` are invalid.

One Issue may have multiple active actions, but each has one accountable owner; contributors,
reviewer, approver and Cover are separate. If people own different completion results, create separate
actions. Dependencies are `blocked by`, `starts after` or `parallel`. Primary Action priority is:
overdue blocker → overdue external wait → missing key fact → responsibility → money → Weekly Review
decision → learning/closure. Listing shows it plus `+N actions`.

States are `Ready · In Progress · Waiting for Reply · Blocked · Overdue · Result Review · Completed ·
Cancelled`. `Start` records actual actor/time. `Do Action` opens the owning tool: Communication,
Evidence, Money, Responsibility, Weekly Review, Learning or linked record.

`Record Result` asks completed `Yes/Partly/No`, an action-specific result, confirmed fields, proof and
whether a successor is required. The system generates the English result and atomically records it,
updates the Issue, releases dependencies and creates only the governed successor. Completion is
refused with an exact missing-items list until the Completion Rule passes. Part completion preserves
confirmed results and leaves/refines the remaining action.

Sending/opening/copying a message never completes a wait. Waiting starts only from recorded outbound
evidence and ends only when a reviewed reply result exists. Due expiry makes the action Overdue,
retains the original due, notifies Owner and escalates by rule. A due change appends old/new/reason/
actor/approval; it cannot erase lateness.

`Cannot Do` records a governed reason: no reply, unavailable information/evidence/source, wrong
owner/party, manager/Finance/Weekly Review needed, staff unavailable or approved other. It creates a
blocker, reassignment, escalation, follow-up or review—never silent closure. `Ask for Help` creates a
support/review relationship but leaves accountability with the owner.

Short absence uses Cover while retaining normal owner; long leave/departure requires audited
reassignment. The new person receives fact, action, previous results, missing information, evidence
and due—no oral handoff dependency. Cancellation is restricted to duplicate/wrong/replaced/voided
work with reason and replacement. A completed result changes only through a versioned Correction,
which recalculates downstream work and preserves both versions.

## §12.6 · Responsibility and multiple Fault Owners

Each possible party/person/team/process/system has an independent finding state: `Not reviewed ·
Possible responsibility · Waiting for evidence · For confirmation · Confirmed · Partly responsible ·
Not responsible · Disputed · Unable to decide`.

For every candidate the review records what the party did, what it should have done, evidence,
finding, reason, optional percentage, reviewer/date, party/staff response, dispute and approval.
System-generated English never replaces these structured facts. Internal staff need not self-report
or admit; they may respond/disagree but cannot delete, hide, rewrite evidence or decide their own
finding. Issue Tracker supports learning; sensitive discipline remains in the HR-owned record.

Percentage is used only for a real commercial or cost allocation. Confirmed allocations total 100%,
`Not responsible` is 0%, and undecided evidence cannot receive a confirmed percentage. Money may
differ from fault percentage only with reason and approval. Process/system gaps may coexist with
staff/external fault.

External parties receive only their finding, permitted evidence, percentage/amount and deadline.
They choose Agree, Partly agree, Do not agree or Need more information. Disagreement must identify
the wrong fact, proposed correct fact/reason and proof. No reply never equals admission; it produces
follow-up/escalation and may still allow an internally approved finding that states no reply.
Disputes preserve original finding/reply/evidence, list disputed points, enter authorised review and
record the final version. A confirmed finding changes only by `Correct Finding`, with new evidence/
wrong party/percentage/fact/calculation/review reason and downstream Money/Report recalculation.

The queue exits only when every candidate is reviewed; confirmed findings have reason/evidence;
percentage is complete or explicitly unnecessary; disputes are resolved or explicitly unable to
decide; approvals and money recalculation are complete; and the next action exists.

## §12.7 · Cost, Finance and recovery

An Issue has multiple typed Cost Items, never one money note. Each holds type (transport, repair,
replacement, redelivery, return, refund, compensation, labour, installation, storage, disposal,
discount, loss/damage or approved other), description, `Not known/Estimated/Waiting for quotation/
Confirmed/Paid/Cancelled`, original currency, tax, date, Paid By/To, Finance record, proof and recovery
facts. Estimated, confirmed, paid and recovered are distinct. Paid By, Fault Owner and Recovery Party
are distinct.

Staff submit known facts; Finance confirms/corrects/rejects/requests proof and owns ledger truth.
Possible duplicate costs compare Issue, invoice, amount, payee, date, payment and evidence. Allocation
records recoverable basis, party, percentage, rounding and approved adjustment. Recovery decisions
are full/partial/not pursue/wait/customer goodwill/internal cost/supplier credit/insurance/unable.
Non-recovery, waiver, write-off, absorption or settlement requires governed reason and approval; it
never rewrites incurred cost to zero.

Finance Recovery states are `Not ready · Ready for Finance · Request not sent · Sent · Waiting for
reply · Agreed · Disputed · Partly recovered · Fully recovered · Waiver requested · Written off`.
Partial payments create a remaining-amount action. Credit Note/offset counts only when Finance
confirms its actual application. Customer Refund/compensation and Related Party Recovery are separate
records. Foreign currency preserves original amount, rate, rate date/source and MYR equivalent.

`Need Money` exits when every Cost Item has a valid status; confirmed amounts have Finance review;
Paid By/To and required proof exist; recovery decision/allocation/party are complete; Finance link
exists; and duplicate warnings are resolved. Business closure may coexist with a still-open Finance
Recovery only when that authoritative action remains visible and owned. Confirmed money changes only
through audited Correction, recalculating Recovery and sent-report consequences.

## §12.8 · Communication, WhatsApp/API and secure links

One communication record stores Issue, direction, channel, sender/recipient, sent/received time,
body, original language/translation, attachments, delivery/open result, related action/evidence,
actor and immutable source message ID. Channels are official Customer Service WhatsApp, ordinary
WhatsApp handoff, Email, Call record, Customer Claim, Related Party link, supplier/transporter API,
Internal note, Monthly Report and face-to-face record.

The operator chooses purpose (facts/evidence/amount/payer/responsibility/no-reply/report/completion),
and the system generates simple text containing identity, issue/object, exact request, proof,
deadline and secure link. Official WhatsApp API records Queued/Sent/Delivered/Read/Failed/Replied.
Opening ordinary WhatsApp records only `Opened in WhatsApp`; the operator must confirm sent time and
proof. Email preserves subject/thread/failure. Calls use structured contacted/answered/confirmed/
missing/promise/due/proof answers; financial or fault assertions still require written proof unless
an authorised exception exists.

Inbound matching uses secure reference/message ID, Issue No, phone/email, linked object and governed
context. A phone number alone is insufficient. One high-confidence match may be proposed; multiple/
no matches require staff linking or a new duplicate-checked Draft. Original inbound content is
immutable.

Customer Claim links expose only necessary customer/order/product/problem/date/upload/contact and
privacy facts, with scoped random token, expiry, access/submission audit and OTP where risk requires.
They never expose internal fault, staff, cost, Minutes or other customer data. Submission receives a
reference and remains external statement/Draft.

Related Party links expose only that party's Issue facts, permitted evidence, proposed finding,
percentage/amount and deadline. Agree/partial/disagree/more information/payment/credit replies and
uploads remain External Submissions until authorised review; they never overwrite internal truth.
API events require authenticated source, unique external event ID, type/time, party, record reference,
payload and attachment references. Authentication, duplicate, unknown record/party, invalid amount,
attachment and processing failures enter review and safe retry; they are never silently lost or
duplicated.

Customer personal/contact/payment identity and restricted/internal/other-party evidence are removed
from external copies by default. Templates are purpose/channel/language/required-fact/proof/deadline/
approved-wording/version controlled. Original language is retained; translation never replaces it.
Replies are checked against the required result before completing an action. No reply produces
overdue follow-up and escalation. Sent content cannot be edited; use `Sent in error` plus a linked
Correction Message.

## §12.9 · Weekly Review, automatic Minutes and learning

Settings own Review day (Wednesday default), time/duration, chair, Backup, participants, reminders,
inclusion/public-holiday/unavailable rules, Minutes reviewer/approval and carry-forward law. A change
states effective date and affected future sessions; completed/approved/in-progress sessions never
move or rewrite.

The system creates a numbered Session and Agenda. It includes unresolved responsibility/money,
multiple/disputed parties, repeats, internal error, material customer/cost impact, training/SOP/
system gaps, overdue escalation and carry-forward—not every open Issue. Agenda readiness names exact
missing facts/evidence/amount/reply before the meeting.

Before start the authorised chair may `Continue with backup`, `Move meeting` with old/new/reason/
notifications, or `Skip meeting` with governed reason. Skip completes no Issue; all work carries to
the next session with origin. Start records actual chair, time, present/absent/late participants.

For each Issue the session confirms facts → each responsibility → money decision → next actions →
learning → carry-forward. Structured choices drive generated Minutes; staff do not compose English.
Carry-forward requires missing item, reason, owner, due, proof and next session. `Finish Review`
refuses until every Issue has an outcome, every action has owner/due/proof, money/learning decisions
are complete and attendance is recorded.

`Minutes Review` corrects structured facts/people/decisions, not generated prose independently.
Approval creates immutable version/PDF, updates Issues, activates actions, notifies participants and
recalculates queues. Later change is a versioned Minutes Correction. External parties see only their
approved permitted outcome; Finance sees money decisions; customer never sees internal staff/other
party/training content.

Learning types are staff training, SOP reminder/update, system improvement, manager coaching, team/
supplier/transporter briefing, monitoring or approved no-learning. Each record holds problem, people,
lesson/correct method, trainer/owner, due, method, proof, understanding check, result and approval.
Every person has an independent state: `Not started · In progress · Waiting for trainer/proof ·
Understanding check needed · Failed check · Completed · Monitoring`.

Completion requires knowledge/practical/observation/evidence and risk-appropriate monitoring; reading
and acknowledgement alone is insufficient for high risk. Failure creates repeat training and keeps
the old result. Manager coaching addresses known-but-not-followed work without turning Issue Tracker
into HR discipline. SOP/system improvements retain owner/version/effective date/verification and may
continue after business Issue closure.

Repeat detection considers type, module, staff/team, party, product, root cause, time and SOP step.
A proposed repeat is reviewed, not auto-confirmed. The Pattern records Issues, first/latest/count,
people/parties, total money, learning and improvements. Repetition after completed training forces
analysis of training, SOP, system control, workload/permission and higher review; never merely repeat
the same course and close. `Need Learning` exits only after decision, people, owner/trainer, due,
proof, understanding result and required improvement/monitoring exist.

## §12.10 · Related Party Monthly Reports

Monthly Reports are an Issue Tracker-specific Page-tools destination, not a mandatory feature of
every module and not a Left Rail queue. Its shared Listing defaults to Report Month, Related Party,
Report No, Issues, Amount Requested, Missing Information, Report Status, Reply Due and Last Activity.
States are `Preparing · Needs Information · Ready for Review · Approved · Sent · Delivered · Opened ·
Replied · Partly Resolved · Resolved · Superseded · Cancelled`.

`Prepare Monthly Report` selects month, Related Party, responsibility/cost/service-quality/combined
type and reply deadline. Inclusion considers period, party finding, money, previous report, Void and
external-sharing law. A multi-owner Issue appears in each applicable party report with only that
party's finding, evidence, percentage and amount; company distinct totals count it once. Late-confirmed
old Issues name original month and why included now.

Readiness validates Issue statement/date/object, finding/reason/percentage/approval, confirmed cost/
request/Finance, permitted evidence, recipient and deadline. It names every missing fact and opens
the original Issue to fix it; the report stores no second truth. External copy strips customer
contact/payment identity, internal staff/HR/discussion, other-party data and restricted evidence.
Preview shows the exact PDF, secure-link view, message, attachments, recipient and deadline.

Approval threshold follows materiality, dispute, multiple owners, customer sensitivity and money.
Approval creates permanent Report No/version, Issue snapshot, PDF and evidence manifest. Delivery
may use Email, official WhatsApp API, ordinary handoff, secure link or download, with Created/Opened
in app/Sent/Delivered/Opened/Replied kept distinct.

The secure response supports per-report contact/extension and per-Issue agree/partial/disagree/more
information/payment/credit/evidence. Disagreement requires exact fact/amount correction, reason and
proof. Replies are external submissions reviewed into original Issues. Deadline extensions append
old/new/reason/requester/approver. No reply never means agreement; it creates report and Issue
follow-up/escalation. Each Issue resolves independently, so a report may be Partly Resolved.

Agreed money creates/updates the Finance Recovery; Finance confirms actual payment/Credit Note. Sent,
Replied and Recovered never collapse. An error in sent content uses Correction Version, retains and
supersedes the prior PDF and sends a correction notice. Later new information uses an Addendum.
Cancellation is restricted to duplicate/wrong party/period/creation, retains reason and replacement,
and a sent recipient is notified. Every inclusion, removal, approval, version, recipient, send/open/
reply/upload, deadline, follow-up, Recovery, Correction and Addendum is audited.

## §12.11 · Closure, correction and authoritative continuation

`Ready to Close` requires complete minimum facts; all Issue actions completed/cancelled with reason;
responsibility complete; money gate complete or separately owned Finance continuation; required
reply/evidence/review/learning complete; linked module consequence explicit; and an authorised closure
summary. Closing never closes Service Case, Claim, Delivery or Finance. A continuing authoritative
record remains linked with owner and state.

Close records actor/time/reason, what changed and what continues. Reopen requires new evidence,
missed consequence, failed preventive change or approved correction and recalculates every queue.
Void is false/test/duplicate only and retains surviving link. Merge/split preserve aliases and all
sources. No confirmed fact/finding/money/result/Minutes/report/learning is overwritten; each uses its
named Correction workflow and recalculates downstream consumers.

## §12.12 · Permissions, failure states and acceptance cases

Permissions are capability-specific and rechecked on write. Seeing an Issue does not grant fault,
Finance, waiver, external-send, Minutes approval, correction, Void/Reopen or close authority. Staff
may report/respond/upload; supervisors review ordinary facts/findings/actions/training; governed
management approves disputes, percentages, high materiality, customer responsibility, reports,
waiver/write-off and restricted lifecycle; Finance alone confirms ledger truth; external parties see
only scoped secure views. Involved staff cannot suppress or decide their own record.

Every screen implements healthy loading skeleton, true empty, no match, source/detail partial failure,
permission refusal without data/count leakage, duplicate submit lock, uncertain save reconciliation,
not assigned, overdue, closed/voided read-only, link expired, external submission pending review and
unsupported/unavailable source. Failed upload/API/send preserves operator input and original event.

Acceptance must cover, with real data and positive/negative permissions: all five intake doors;
duplicate Service Note/Claim/Message matching; uncertain retry; multiple and disputed Fault Owners;
internal non-admission; parallel/dependent actions; part result/no reply/overdue/absence/reassignment;
multiple costs, partial Recovery, Credit Note, refund, waiver/write-off and correction; official and
ordinary WhatsApp, email, call, claim/reply link and API failure; evidence privacy; normal/rescheduled/
Backup/skipped/holiday Weekly Review, carry-forward and Minutes correction; failed learning and repeat
after training; multi-party Monthly Report, missing/sensitive data, partial/no reply, deadline,
Correction/Addendum and Finance reconciliation; close with continuing Finance work; and shared UI at
1440, 1024 and 390px with keyboard, touch, focus and restored Listing context.

# §13 · Legacy Service Notes

The existing Service Notes workbook and repository subsystem prove useful needs: permanent SN
identity, customer/order/item context, Logistics/Supplier/Warehouse handoff, printable evidence and
historical volume. They also prove the failed assumption: blank `What Happened`, `Carres Remark`,
section remarks and follow-up boxes require staff to know the process and write English.

- Preserve every genuine historical SN and its original number as evidence/alias.
- Do not pretend old records contain modern fault, cost or learning truth; unknown stays unknown.
- Customer resolution belongs to Service Case.
- Delivery/Warehouse/Supplier Claim own their execution documents and facts.
- Issue Tracker owns accountability, costs, Related Party reporting and learning.
- Retire Service Note as a new standalone master workflow after governed transition; do not delete
  history or force every old SN into a fabricated complete Issue.
