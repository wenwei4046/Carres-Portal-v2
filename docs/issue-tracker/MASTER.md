# ISSUE TRACKER — MASTER

> **The only Issue Tracker document.** Overwritten when re-ruled; never versioned.
> **APPROVED / LOCKED — Jess, 2026-08-14.**
> Read `CLAUDE.md`, `docs/ERP-ARCHITECTURE.md`, this file and the affected module MASTERs.

| I am working on | Read |
|---|---|
| anything | **§1–§3** |
| recording an issue | **§4** |
| current action / cover | **§5** |
| responsibility and evidence | **§6** |
| money and recovery | **§7** |
| Wednesday review / training | **§8** |
| Related Party monthly report | **§9** |
| pages, permissions and legacy SN | **§10–§12** |

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

It is the evidence used for internal training, every Wednesday review, Finance explanation and the
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

The authoritative record is one versioned `issue_actions` occurrence. Exactly one may be open for
an Issue. `Issue Triage Duty` owns evidence gathering and operational coordination;
`Issue Review Approver` owns the governed accountability decision. A module-specific action stays
in its owning module and is only linked here. Recording a result closes the occurrence and preserves
normal owner, dated cover and actual actor; if the result requires another Issue action, the same
transition replaces it with the next sequence. Workspace projects the open occurrence and never
creates an `ops_tasks` copy.

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

# §8 · Wednesday review and learning

Every Wednesday review covers:

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

The Issue stores `Issue discussed`, meeting date, training needed/not needed, SOP change needed/not
needed and linked complete actions. A solved operational problem remains in Wednesday review until
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

Confirmed, awaiting response and disputed Issues are separate report sections. An allegation never
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
→ Wednesday review where required → closure gate → Closed
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

Register default columns: Issue No. · Observed · Issue · Linked object · Fault Owners · current
complete action · money consequence · review state.

Saved views: All Issues · Needs triage · Wednesday review · Internal issues · Waiting staff response
· Waiting reviewer finding · Monthly report — Related Party · Cost not recorded · Recovery not
requested · Recovery not received · Closed · Voided.

Issue workspace: identity/summary · Current Action · linked records · four accountability identities
· three money tracks · evidence/timeline · review/learning · related/repeat Issues · history.

The Current Action block shows `What is true · What to do · Why · What to check/send · What to ask ·
Choose their answer · What happens next` and only relevant fields.

Central Settings → Issue Tracker owns issue types/source mappings, materiality/review rules,
cost/recovery thresholds, attribution/recovery roles, Related Party report contacts/recipients,
meeting/learning destinations, retention and restricted categories.

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

# §12 · Legacy Service Notes

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
