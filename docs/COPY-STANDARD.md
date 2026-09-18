# Carres Portal — Copy Standard

> The single source of truth for how UI text is written across every page of
> `apps/web`. **Read this BEFORE writing any button label, section title, row
> line, empty state, error, or tooltip.** Locked with Jess (COO) 2026-07-22.
>
> If any older chat, memory, or doc contradicts this file, this file wins.
> The UI-KIT points at this file as the authority for microcopy.
> Purchasing work must read [Purchasing UI dictionary](#purchasing-ui-dictionary) and the exact
> per-page column lists in Purchasing MASTER §9.1–§9.4; older labels in other modules do not override it.

---

## Why this exists

Every screen the operations team uses must let a no-experience operator do
their job without asking anyone. **Text is the training.** Icons alone do not
teach. This document is the standard for how to write that text so a new hire
can walk up, read the screen, and act.

Two hard beliefs behind the rules:

1. **Words are the interface** for a productivity tool. "Minimal text" is a
   mobile / marketing dogma — it does not apply here.
2. **Same word, same meaning, everywhere.** Synonyms across pages are the
   #1 reason a new hire gets confused ("Is 'Chase' the same as 'Follow up'?").

---

## The 10 rules

| # | Rule | ✘ Bad | ✔ Good |
|---|------|-------|--------|
| 1 | Button = verb + object | `OK` · `Submit` · `Send` (alone) | `Issue PO to Ohana` |
| 2 | One action → one word | mix send / raise / place | `Issue PO` everywhere |
| 3 | Numbers up front | `There are 2 POs to issue` | `2 to issue · 1 past the order-by date` |
| 4 | Skip the obvious | `Below is the list of suppliers` | (just show the list) |
| 5 | Empty states teach | `No results` | `No purchase orders to issue.` |
| 6 | Errors give the fix | `Invalid input` | `Master row missing G column. Ask Sales to fill it before Monday.` |
| 7 | Tooltip = WHY | button `Issue PO` · tip `Click to issue` | button `Issue PO` · tip `Creates the PO number and the document Ohana receives` |
| 8 | Same word app-wide | Orders `Confirm ready date` · Purchase `Follow up` | Both say `Confirm ready date` |
| 9 | Zero jargon — **unless the team already says it** | requisition · expedite · MRP · `GRN` as a VERB | order · call · plan · check in · `GRN` as the DOCUMENT (see the document/act split) |
| 10 | Cut a sentence if possible | `Please note that this order...` | `This order is 1 day late. Issue PO now.` |

## Primary School Standard English — owner ruling 2026-08-14

Every Portal instruction must be understandable the first time a new employee sees it. This is
professional Plain English: clear, short and consistent. Formal documents keep correct business
English; complexity is never used to make an instruction sound official.

- Aim for no more than 12 words per sentence.
- One sentence states one fact or one action.
- Prefer common governed verbs: `Call`, `Ask`, `Check`, `Choose`, `Save`, `Upload`, `Record` and the
  business-specific verbs in this standard.
- Ban vague substitutes such as `Process`, `Handle`, `Proceed accordingly` and `Resolve` without
  naming the concrete result.
- Print full dates such as `18 Aug 2026`; actionable work also carries its governed weekday/date.
- Errors name what is wrong and exactly how to fix it.
- A button says what pressing it does: verb plus object.
- Keep necessary business nouns (`Purchase Order`, `Supplier`, `Deliver To`, `Unit ID`, `Invoice`,
  `Credit Note`, `Claim`, `Consignment`) and provide a simple first-use explanation through Help.
- The official record is Simple English. Original customer, staff and partner words remain
  preserved; optional Chinese/Bahasa Malaysia help explains but never creates a second truth.

`Send` is banned from Portal action labels, buttons and Current Action copy. It hides the actor,
channel, object, recipient and required result. Name the real act instead: `Email PO-2041 to Hooka`,
`Ask Lim for mattress photos`, `Upload delivery note`, or `Record TCF's reply`. `Open WhatsApp`
names navigation only; opening the channel never proves that the business action is complete.

## Two-Line Action Copy Standard — owner ruling 2026-08-14

An actionable alert, Work row or detail-page current action uses:

```text
[Current fact/problem]
[Action + object] · [recipient + required result]
[Governed working weekday/date]
[Verb + object button]
```

- Line 1 states what is true; the object identity stays in the governed row/card header or object
  field and is not repeated when that context is already visible. Use normal register text size
  and medium/semibold weight.
- Line 2 identifies `ACTION + OBJECT · TO WHOM · WHAT IS NEEDED`; one size smaller and regular
  weight. Never show a bare verb.
- Owner is structured identity resolved by the action's Owner Rule. Show it as governed avatar,
  metadata or Team Work group, never as repeated sentence text. My Work may omit the current
  user's identity because scope already answers who.
- The channel is named when transmission matters: `Email`, `WhatsApp`, `Call` or another governed
  channel. `Send` remains banned.
- Each line is one sentence. It should fit one desktop line but may wrap to two narrow-screen
  lines; never ellipsize the party, amount, document or date needed to act.
- Red is reserved for overdue, blocking, safety, custody or money risk. Missing routine data is
  not made red merely to attract attention.
- The row exposes one primary action. Parallel actions remain visible through the governed `+N`
  expansion; no copy hides them.

Example:

```text
Mattress measurement video is missing
Ask Lim for the required video · Record their reply.
Fri 14 Aug
[Ask customer]
```

Further governed examples:

```text
PO-2041 Version 1 has not reached Hooka
Email PO-2041 Version 1 to Hooka · Ask for delivery confirmation.

Delivery note DO-883 is missing
Upload Hooka DO-883 · Link it to PO-2041.

Hooka has not replied
Call Hooka about PO-2041 · Record item availability.

PO-2041 Deliver To has changed
Email PO-2041 Version 2 to Hooka · Ask them to use AL Sungai Buloh.

Unit CU-000128 is damaged
Hold CU-000128 · Add photos for Purchasing.

PO-2041 price changed to RM1,250
Check PO-2041 · Accept or reject RM1,250.

Customer delivery is at risk
Tell the responsible salesperson · Record the new date, 25 Aug 2026.
```

An action whose Owner Rule cannot resolve a person does not hide two actions in one line. Repairing
the roster/duty/cover fact is the current action; the business follow-up becomes the next action:

```text
PO Duty has no holder
Add today's PO Duty holder · The system must route PO-2041.
[Open duty roster]
```

The two-line ACTION form is not forced onto completed records, small field validation or empty
states. **History and Revision records use their own governed three-rank grammar in
`ui/MASTER.md`: what happened first, who/when second, and only the important result third.** A
simple record may omit the third line when no result/detail exists, but actor, time and fact may
never be flattened into one dot-separated database sentence.

## Work detail — five answers, not five compulsory boxes

Opening an action must answer these five questions in this order:

1. `What to do` — the single primary act.
2. `Why` — the trigger/fact that made it necessary.
3. `Files / details` — only when an artefact or information is required.
4. `What to ask` — only when an external answer is required.
5. `What happens next` — the next system consequence or reminder.

Omit a section that does not apply; an empty heading teaches nothing. A complex execution still
uses the governed maximum-four-step `What to do` block below.

## Workspace destination words

These words govern the three destinations under the left-bar `WORKSPACE` section. The one global
`Dashboard` remains an independent top-level destination and is never called `Workspace Dashboard`.

| Meaning | Use exactly | Do NOT use |
|---|---|---|
| Workspace destinations | `Work` · `Staff & Duties` · `Issue Tracker` | Workspace Dashboard · Tasks · Duty roster · Service Notes |
| Work scopes | `My Work` · `Team Work` | My Tasks · Team Tasks · Work queue |
| Work timing | `Broken commitment` · `Missed` · governed working weekdays · Saturday when an authoritative action remains there · `Today` · `Public holiday` · `Holiday operation` · `No working date` | Due as the primary structure · Upcoming · Later · Overdue as the section word · Backlog |
| Work search | `Search work…` | Search tasks… |
| My Work true empty | `Nothing assigned to you` | All done! · No tasks · `0` while loading/failed |
| Team Work true empty | `No open work — every track is clear.` | All done! · No tasks · `0` while loading/failed |
| Work no match | `No work matches these filters` · `Clear filters` | No work · No results |
| Work applied filters | `Clear all` | Reset · Clear everything |
| Work selected-action sections | `CURRENT FACT` · `ACTION` · `REQUIRED RESULT` · `COMMUNICATION` · `FINISH WHEN` · `WHAT HAPPENS NEXT` | Problem details · Task · Done when |
| Work selected-action navigation | `Back to work` · `Open {object}` | Close · Go back · View details |
| Work embedded result | icon plus `Nice Future confirmed Fri, 18 Sep` · `Delivery proof accepted` (the exact source result; icon/colour never stands alone) | Done · Completed · Success · icon alone |
| Work closure by another actor | icon plus `Done by {person}` only when the source supplies durable actor evidence | inferring the actor from assignment or cover |
| Work order cancelled | icon plus `Order cancelled` | No longer needed without the known reason |
| Work closure without an authorised receipt | icon plus `No longer needed` | This work is no longer open. · invented person/result |
| Work mutation not confirmed | warning icon plus `Not confirmed · Try again` | Not saved when the response is uncertain · Something went wrong · optimistic completion |
| Work stale action | warning icon plus `Action changed · Review again` | Conflict · stale record · silently submitting an old source version |
| Work left-panel groups (owner ruling 2026-09-17) | `WORKING DAY` (counts the whole week: `Missed` · weekdays · Saturday only when an admitted action remains there · `No working date`; a public holiday is named and carries no ordinary work) · `MODULE` with first row `All modules` (counts only the jobs in the centre list; `All modules` equals the centre row count) | a separate list-count label · a module total that excludes visible Missed rows · counting one occurrence twice |
| Work centre heading (owner ruling 2026-09-17) | `Missed {n} · {weekday, date} {n}` on first open · `{weekday, date} {n}` when one day is selected | a list-count suffix · a heading count that differs from `All modules` |
| Work centre groups, in order (owner ruling 2026-09-17) | `BROKEN COMMITMENT` → `MISSED` → `{WEEKDAY, DATE}` · a broken commitment is a red group heading plus a thin red row edge, no row badge, and still counts under its own working day | a Broken badge on the row · a `BLOCKED` group · counting a broken commitment twice |
| Work blocked job (owner ruling 2026-09-17) | `Blocked by {dependency}` on the row, inside its own working-day group · filter option `Blocked` | `Blocked` as a group · `Waiting` alone · hiding a blocked missed job |
| Work filters door (owner ruling 2026-09-17) | `Filters` — the toolbar door only | `Filters` as a left-panel or rail heading |
| Work communication controls (owner ruling 2026-09-17) | the owning module's own `Open WhatsApp group` · `Open WhatsApp` · `Copy message` in the right panel's `COMMUNICATION` section, labelled by the door the click opens | `Send` · `Sent` · `Message sent` · treating an opened WhatsApp or a copied message as sent evidence |
| Work action sentences (owner ruling 2026-09-17) | fact `Overdue delivery` · `Call {logistics}` over `Arrange a new delivery date` · `Ask {logistics}` over `Record the delivery result` · fact `Supplier has not confirmed the PO date` with action `Ask {supplier} to confirm the PO delivery date` · button `Record supplier answer` only after the supplier-reply action is admitted in Work | `Date passed` · `Reschedule` · `Follow up supplier` · `Record supplier answer` before the supplier reply is admitted |
| Work embedded location | neutral `Do it here` on an admitted embedded row only | green badge · repeating `Open module` on ordinary rows |
| Work embedded validation | `Choose a review result.` · `Write the reason.` | generic Required · invalid input |
| Delivery proof choices | `Accept proof` · `Request more proof` · `Reject proof` | colour-only consequences · claiming a driver was contacted |
| Delivery proof supporting result | `More proof is required` | The driver is asked for more proof |
| Delivery proof receipts | `Delivery proof accepted` · `More proof requested` · `Delivery proof rejected` | Done · Completed · an unconfirmed optimistic receipt |
| Delivery proof viewer | `Photo {n} of {total}` · `Previous photo` · `Next photo` · `Close` · `← → change photo · Esc closes` | image controls without text names |
| Delivery proof viewed aid | `Viewed` | storing view state · treating view state as completion evidence |
| Delivery proof load failure | `Photo could not be loaded · Try again` · `Photo {n} of {total} could not be loaded` | allowing `Accept proof` while any file in the latest proof package is unreadable |
| Work read-only action | `Only {acting person} can record this.` · `You can see this work here. Recording it is not part of your access.` | disabled mutation controls · implying Team Work visibility grants permission |
| Work detail evidence | `Working day and source` · `Owner, working day and source` only when exceptional owner evidence is present · `Required` · `Working day` · `Source` | ordinary owner metadata in My Work |
| Work source remainder | `Other work is current.` | implying one failed source made the whole list current or empty |
| Work loading announcement | `Loading work` | No work · zero counts while loading |
| Work object shortcut | `Open {object} (O)` | an undiscoverable keyboard shortcut |
| Work source health | `Could not refresh {source}` · `Last updated {time}` | `0` · No open work |
| Work read failure | `Work could not be loaded. Try again.` · `Try again` | No open work · Something went wrong |
| Work calendar not configured | `Working hours not configured · {Site or owner}` · `Open {owning settings}` | assuming Sunday or Saturday is closed · showing `0` |
| Work calendar read failure | `Working days could not be loaded. Dates may be missing.` · `Try again` | using a default calendar silently · showing invented missed age |
| Work day has no eligible actor | `Nobody works {weekday, date} for {Duty}.` · `Set cover in Workspace → Staff & Duties` | Nobody holds {Duty}. · Saturday Duty · moving a physical Saturday action to Friday |
| Right Rail healthy clear | `No work due now` · `Open My Work` | All done! · `0` while loading/failed |
| Right Rail refresh failure | `My Work could not be refreshed` | No work due now · No open work |
| Duty page purpose | `Who holds each company duty today and who covers an absence.` | Manage staff · Duty roster |
| Duty facts | `Normal owner` · `Acting today` · `Effective` · `Cover` · `Reason` | PIC · Assigned to · Substitute |
| Duty actions | `Assign holder` · `Add cover` | Change owner · Reassign · Take it · Release |
| Duty filters | `All duties` · `Covered today` · `Cover scheduled` · `Not assigned` | Active · Inactive · Upcoming |
| Duty no match | `No duties match this search` · `Clear search` | No duties |
| Duty read failure | `Staff & Duties could not be opened` · `Try again` | No duties · Error |
| Duty unassigned | `Not assigned` · `Nobody holds {Duty}.` | Unowned · Available · — |
| Duty resolution with cover | `{acting person} covering for {normal owner}` | `{acting person}` alone · owner name inside action sentence |
| Duty write success | `{name} holds {Duty} from {date}` · `{acting person} covers {normal owner} for {Duty}, {from}–{until}` | Saved · Updated successfully |
| Duty validation | `Choose a holder.` · `Choose when this holder starts.` · `Choose who will cover this duty.` · `Choose valid cover dates.` | Required · Invalid date · Error |
| Duty conflict | `{Duty} already has a holder for these dates. Choose different dates.` · `{Duty} already has cover for these dates. Choose different dates.` | Conflict · Overlap found |
| Duty refusal | `{name} cannot hold {Duty}. Choose an eligible active staff member.` · `Choose another person to cover {Duty}.` · `{Duty} has no normal holder for all these dates. Assign the holder first.` · `{name} can no longer cover {Duty}. Choose another eligible staff member.` · `{Duty} could not be updated. Try again.` (by write-door code, workspace/MASTER.md §4.4.1) | the database's own sentence · Invalid · Error · Something went wrong |
| Issue Register purpose | `Every issue stays for facts, money and learning.` | Issue dashboard · Problem inbox |
| Issue search | `Search issues…` | Search Service Notes… |
| Issue true empty | `No issues recorded` | All clear · `0 issues` while loading/failed |
| Issue no match | `No issues match these filters` · `Clear filters` | No issues · No results |
| Issue read failure | `Issue Tracker could not be opened` · `Try again` | No issues · Something went wrong |
| Issue creation | `Record issue` | Create ticket · Add problem · New SN |
| Issue current action | `Current Action` · `No current action` · `Waiting for triage rule` | Set next action · Follow up · Handle |
| Issue action result | `Record result` | Save result · Mark done · Complete task |
| Issue intake validation | `Choose what has a problem.` · `Choose what you saw.` · `Choose who found the issue.` · `Choose when the issue was found.` · `Find and choose the linked record.` · `Add the required proof.` | Required · Invalid · Complete all fields |
| Issue result validation | `Choose what happened.` · `Add the evidence needed for this result.` | Save failed · Conflict · Try later |
| Issue stale action (owner ruling 2026-09-17, replaces `This action has changed. Read the current action before recording a result.`) | warning icon plus `Action changed · Review again` | Conflict · stale record · the long sentence |
| Issue save definitely failed (owner ruling 2026-09-17) — the server answered with an error | `Issue not recorded · Try again` · `Result not recorded · Try again` | Save failed · Something went wrong · closing the dialog silently |
| Issue save not confirmed (owner ruling 2026-09-17) — network error, timeout, no answer | warning icon plus `Not confirmed · Try again` | `Issue not recorded` or `Result not recorded` when the answer is uncertain |
| Issue save refused (owner ruling 2026-09-17) | `Only {acting person} can record this.` · only when no acting person can be named: `You do not have access to record this result.` | `Only {Duty} can record this result.` (a Duty is not the person who acts) · Forbidden · Access denied |
| Issue detail sections | `What is true` · `Linked records` · `Accountability` · `Money` · `Evidence & timeline` · `Review & learning` · `Related Issues & history` | Details · Activity · Notes as catch-all sections |
| Issue report door | `Monthly report` | Report dashboard · Export issues |

An empty or failure sentence uses the exact object it describes. `No open work` cannot describe an
empty Issue Register; `No issues recorded` cannot describe a filtered no-match; neither may appear
until the complete authorised source is healthy.

## Action copy / work clarity law — owner ruling 2026-08-11

When a surface represents something a human must handle, follow up, confirm, call, chase or do,
the operator must understand all six parts at first read:

```
WHO              responsible named person or team/station
ACTION           concrete verb
OBJECT           exact document, order, goods, evidence, amount or other business object
RECIPIENT        party/person/team receiving the act or being contacted
REQUIRED RESULT  answer, evidence, confirmation or decision that completes it
WHEN             actual working weekday + date from the action's authoritative calendar
```

Use the actual person or team when responsibility is known, the governed action verb, and the
specific object, recipient and required result the operator can recognise. `WHEN` follows
`ACTION-FLOW-STANDARD.md` Law 2A: use
the applicable Carres working calendar and exclude its public holidays/non-working days. Recorded
business dates are never silently moved; only a computed work due date may move when its governing
rule explicitly permits it. A governed action surface that requires a due day prints the resulting
weekday + date; `Today`, `Tomorrow` or `T−2` alone is not enough.

**Banned as substitutes for clear work:** `Follow up` · `Waiting` · `Need action` · vague
`Chase`. These may describe neither a measurable act nor its object/recipient/result/date. A waiting condition is a
fact, not an action, until a human must do something.

This law does **not** turn every truth into work. Registers and module surfaces continue to show
owned facts in factual language. Apply all six action parts only when the item is genuinely
actionable. My Work, Team Work and every other action-bearing UI use this same formulation; they do
not invent a shorter status-only dialect.

### System-led action + Primary School Standard English — owner ruling 2026-08-14

Purchasing, Sales Order, Service Case, Issue Tracker and every future module use one standard: the
system holds process knowledge; a new employee confirms facts, performs the named action and records
the result. No screen depends on written-English skill, old WhatsApp history or an experienced
employee explaining what comes next.

Official fields/documents remain English. Operator instructions use Primary School Standard English:
one fact or action per sentence, about 12 words maximum, complete dates, and an error always says how
to fix it. Chinese/Bahasa Malaysia may appear only under optional `What does this mean?` help and do
not enter the official record.

**A simple verb alone is not simple English; it is missing work.** Every action-bearing surface must
expose:

```
STRUCTURED OWNER + STRUCTURED OBJECT + ACTION AND OBJECT + RECIPIENT + REQUIRED RESULT + WHEN
```

Use the portal-wide two-line shape when the row carries a fact plus action:

```
LINE 1  FACT / PROBLEM
LINE 2  ACTION AND OBJECT + RECIPIENT + REQUIRED RESULT
```

The governed row/card structure supplies object identity and resolved owner without repeating either
inside the semantic lines. The row/action context must also expose actual working weekday/date.
`Call` · `Ask` · `Check` ·
`Choose` · `Upload` · `Add` · `Send` · `Save` · `Follow up` · `Review` · `Handle` · `Resolve`
alone are banned. If one line cannot fit, use labelled `Owner · Object · Contact · Do · Need`; keep
Owner and Object as structured fields and omit nothing.

Normal intake is guided factual questions and governed answers. The system generates the official
English summary. A blank `What happened?`, `Action taken`, `Root cause`, `Prevention` or `Follow-up
remark` textarea may be supplementary only; it can never be the main path or determine status,
accountability or completion.

**External reply evidence — owner ruling 2026-08-14.** For supplier and Logistics communication,
`Message prepared`, `Message copied`, `WhatsApp opened` and `Sent` never complete a confirmation
action. They prove only our outbound act. `Confirm` completes only when the outside party's answer
is recorded with evidence of that answer—normally the reply screenshot/email, reporter, recorder,
channel and reported/recorded times. Operations may record it on the party's behalf. The UI asks for
the concrete answer, never a trust-based `Sent` checkbox.

---

## Row action-line template

Every actionable list row ends with a plain-English sentence telling the reader the next action.
The owner and due weekday/date may be adjacent governed fields when repeating them inside the
sentence would harm scanning, but the row as a whole must expose all six parts. Use the shortest
sentence that remains complete; about 12 words is the target, never a reason to omit recipient or
required result. Shape:

    [Owner] + [Verb and object] + [recipient] + [required result] + [working weekday/date]

Examples (all pass):

    ✔ Yu Jun · Send PO-86 to Ohana · Ask them to confirm delivery · Wed 12 Aug.
    ✔ Shasha · Check in PO-2041 goods for Purchasing · Record full or partial · Thu 13 Aug.
    ✔ Shasha · Call AL about SO-1318 · Record the delivery date · Fri 14 Aug.

Anti-patterns (all fail):

    ✘ Follow up.                               (no owner · object · recipient · result · date)
    ✘ Waiting.                                 (a fact presented as work)
    ✘ Need action.                             (no action at all)
    ✘ Process order.                           (no name · no timing · abstract verb)
    ✘ You should follow up with the factory... (passive · no name · too long)
    ✘ Handle this.                             (all three failures)
    ✘ Awaiting action.                         (passive · does not say WHO acts)

---

## "What to do" step block template

For a detail pane / drawer where a full task is executed. Rules:

- **Max 4 steps.**
- **Each step ≤ 8 words.**
- **Each step starts with one verb.**
- Include the specific name / number / URL in the step.

Example (good):

    What to do:
    1. WhatsApp Ohana (012-3456).
    2. Send the SKU list above.
    3. Ask for ETA.
    4. Click Issue PO.

Anti-pattern (too wordy):

    What to do:
    1. Open your WhatsApp application and locate the contact "Ohana"
       who is the manager of the sofa factory we work with regularly.
    2. Please make sure you copy the SKU list from the table above,
       being careful not to miss any of the items shown...

If a step needs a paragraph of explanation, it belongs in a separate help
article, not in the "What to do" block.

---

## Empty-state pattern

Every empty state answers three things: (a) **why** it is empty · (b) **when**
it will change · (c) **what** the reader should do meanwhile.

Examples:

    ✔ "No purchase orders to issue. Check back after 2 PM when Master syncs."
    ✔ "0 calls to make · everything on track. Nothing to do here."
    ✔ "No goods arriving today. Ohana's next delivery is Thu 24 Jul."

Anti-patterns:

    ✘ "No data."
    ✘ "Empty."
    ✘ "Nothing to display."

---

## Error pattern

Errors tell the reader: (a) **what** broke · (b) **how** to fix it · (c) **who**
to ask if they can't.

Examples:

    ✔ "Master row missing G column. Ask Sales to fill it before Monday."
    ✔ "Ohana's phone number is not in Suppliers. Ask a manager to add it."
    ✔ "PO already issued — you cannot issue it again. If wrong, click Cancel."

Anti-patterns:

    ✘ "Invalid input."
    ✘ "Error 500."
    ✘ "Something went wrong."

---

## Tooltip pattern

The visible label says **WHAT**. The tooltip says **WHY**. They must not repeat.

    Label "Issue PO"    · tooltip "Creates the PO number and the document Ohana receives."
    Label "Late 2d"     · tooltip "Order-by was 20 Jul; today is 22 Jul."
    Label "No deadline" · tooltip "This order's Master row has no G column."

If the tooltip would just re-state the label, delete the tooltip.

---

## Action naming law (Jess ruling 2026-07-27 — supersedes the T2 version)

Every visible ACTION label (queue name, ladder pill, drawer button, checklist
row, follow-up preset) is written as:

    [Verb] + [clear object]
    — and the NAMED PARTY whenever an outside party is involved.

- **Name the party when there is one.** `Assign logistics`, `Issue delivery order` and
  `Upload delivery photo` involve nobody outside, so they carry no party and are correct as
  they stand. Use the actual person/company when the system knows it
  (`Call Ohana — confirm PO-88 ready date`; a Delivery sentence is two lines, `Call NETS`
  over `Confirm the delivery date`); the role word (`customer`, `supplier`) only when no name exists.
- **The object is measurable.** "Contacted the supplier" completes nothing —
  the label names the business outcome (a ready date, a delivery slot, an
  amount collected, a photo uploaded).
- **No abbreviations, ever.** ERP shorthand a new hire must google is banned.
  **"POD" is banned** (→ delivery photo). **"Chase" is banned** (Jess
  2026-07-27) — it names a mood, not an outcome; every former Chase label
  becomes a Call with a named party and a measurable object. **"DO", "PO" and
  "GRN" survive because the team already speaks them daily** — and all three
  survive as the NAME OF A DOCUMENT, never as a verb.

### The document / act split (Loo ruled 2026-07-28)

**A word may name the piece of paper, the act, or neither — never both.** `GRN` is the
document the warehouse produces; **`Check in` is what a human does.** Same event, two words,
and that is correct rather than a synonym problem.

**The test, and it is mechanical:** replace the word with *"the piece of paper"*. If the
sentence still means what it meant — `View GRN`, `3 GRNs on this PO`, `GRN-0012` — the word is
right. If it does not — `+ GRN`, `Save GRN`, `GRN — goods arrived` — a human is DOING
something, and the word is `Check in`.

**Why this and not a clean ban.** The abbreviation rule above bans shorthand a new hire must
google, and exempts `DO` and `PO` on one ground: the team already says them. **`GRN` clears
exactly that bar** — it is what their AutoCount calls the document and what the warehouse says
out loud. Banning it would have put a word on screen the warehouse does not use, to satisfy a
rule whose own exemption already covered it.

**This applies to every module,** and the same split settles the next argument of this shape:
name the act with a verb from the table, name the artefact with the artefact's real name.
- **Every label lives in ONE place** — the audit table below ("The dictionary"). There is
  no second list of approved labels anywhere.

## Where the engine law lives

**This file defines WORDING only.** Action behaviour → `docs/ACTION-FLOW-STANDARD.md` ·
a module's workflow → `docs/<MODULE>-WORKING-FLOW.md` · execution queues →
`../CLAUDE.md`. A rule lives in one document and is never copied here.

## The delivery queue words (re-ruled by Jess 2026-07-27 — this is the only version)

The delivery lifecycle is FOUR queues; the queue's label IS the row's top
checklist item. The list is closed; a new chat does not add a fifth:

| Step | The label |
|---|---|
| 1 | `Assign logistics` |
| 2 | `Confirm delivery date` (row lines, the two-line Delivery Work grammar of the 2026-09-13 owner ruling: `Call {logistics}` over `Confirm the delivery date`) |
| 3 | `Deliver on {weekday, date}` (re-worded from `Deliver today` — the Delivery dictionary bans Today/Tomorrow; the actual weekday + date is printed) |
| 4 | `Upload delivery photo` |

**Only the words live here.** What each queue holds and when it goes late are TRIGGERS and
DUE conditions — they live in `orders/MASTER.md` §3, and nowhere else (Law 0A).
This table used to carry them; C2 found the copy and it was deleted rather than kept in
step.

Every deadline is counted in **working days** (see the one definition above) — the same
engine procurement uses. Lateness is written as the count
tail, numbers up front: `5 · 2 late`.

**`Issue Delivery Order` names the SYSTEM's act, not a button** (Jess 2026-08-16, overwriting
the 2026-07-27 press-the-button half): the SYSTEM issues the document the moment its governed
gate is met — nobody authors one by hand and **no surface carries an Issue, Release or Approve
control**. The one governed manual door is `Request Delivery Order` (2026-08-19, the outstation
trip's door — same single issuing path, same gates).

**Delivery execution words — owner-approved 2026-08-14, final Blueprint wording.** Employee UI
never uses `Release`; use `Issue Delivery Order`, `Ready to issue delivery order` or `Cannot issue
delivery order yet`. Employee UI never uses `Attempt` or asks a person to create a `Delivery Visit`.
The employee action is `Record Delivery Result`, the page/section is `Delivery History`, and one
entry reads `Delivery on {weekday, date}`. `Delivery Visit` remains the formal system, permission
and audit object; internal schema/code may retain `delivery_attempt`. Results are `Delivered`,
`Partially Delivered` and `Failed Delivery`; never `Not Delivered`. `Rescheduled` and `Delivery
Cancelled` are arrangement states, not actual Delivery Results. Use `Delivery Proof` or the
concrete proof name (`Delivery Photo`, `Signed Delivery Order`, `Logistics confirmation`) when the
employee can be told what is required. Delivery schedule groups and due labels use the actual
weekday + date, never `Today` or `Tomorrow`. Never show generic `Contact Customer` or `Follow Up`;
name the purpose, such as `Confirm New Delivery Date` or `Confirm Delivery Address`.

**Delivery status words — owner ruling 2026-08-24, Monitor words re-ruled by the owner
2026-09-13.** The DOCUMENT and the OPERATION have **two separate vocabularies**, and neither may
borrow the other's words.

```
Delivery Order document — the DOCUMENT's own life
  Created · Out for delivery · Arrived · Delivered · Delivery exception · Cancelled
  (`Arrived` only on an intermediate Journey leg's document — the goods reached the
   named partner warehouse; `Delivered` is the customer leg's word — Card 20, 2026-09-13)

Monitor `Delivery Status` — the OPERATION's progress, naming the actor and the fact
  before the arrangement is agreed — the ACTOR rungs, unchanged:
    Operation must assign logistics · Call customer · Waiting for customer reply ·
    Confirm delivery time
  once it is agreed — the JOURNEY rungs (re-ruled 2026-09-14):
    customer leg   Confirmed · Waiting for {partner} pickup · Collected by {partner} ·
                   On the way to customer · Delivered to customer · Failed Delivery
    transfer leg   Transfer confirmed · Collected for transfer · In transit to {stop} ·
                   Arrived at {stop} · Transfer failed
  across both      Overdue · Order details incomplete
```

**Re-ruled 2026-09-14, replacing the 2026-09-13 spellings one-for-one** (one fact, one word — the
column, the `DELIVERY STATUS` dropdown, the schedule card and every report read the SAME
arithmetic): `Confirmed for {weekday, date}` → **`Confirmed`** (the day and window are column 8's
job, and on a card the date column already names the day) · `Goods collected by {partner}` →
**`Collected by {partner}`** · `{partner} is delivering to the customer` → **`On the way to
customer`** · `Delivered` → **`Delivered to customer`** · `Arrived` → **`Arrived at {stop}`**.
`Waiting for {partner} pickup` is KEPT: it is a recorded fact (the document exists, the partner
has not collected) that the new ladder does not otherwise express.

**`Delivered` is reserved for goods that reached the CUSTOMER (Card 20, 2026-09-13).** An
intermediate Journey leg's success is **`Arrived`** on line one and the partner warehouse the goods
reached on line two (`JB transit warehouse`) — on Monitor, the Delivery Orders register, the DO
object header, Delivery history and every report — through the same two arithmetics. A warehouse
arrival owes no delivery photo, signed paper or proof review; the customer leg's document carries
them. `Logistics Performance` counts customer-leg results only.

`{partner}` is the actual company name from the data, never a hard-coded carrier. The one
arithmetic and the facts behind each word are `delivery/MASTER.md` §8.4.

**THE DELIVERY SCHEDULE CARD — TWO FACTS, TWO LINES (owner ruling 2026-09-14).** The Monitor tab
is **`Delivery schedule`**; `Confirmed deliveries` is retired and survives only in dated historical
walk records. The schedule carries both kinds of logistics work under a type label that is never
mixed and never summed:

```
DELIVERY   the final customer leg          TRANSFER   an intermediate warehouse leg

tab count and split, following the SELECTED RANGE and every active filter:
  Delivery schedule {n}
  {c} customer deliveries · {t} transfers          e.g. `0 customer deliveries · 2 transfers`

LINE 1 · JOURNEY PROGRESS                  LINE 2 · READINESS OR BLOCKER
  customer leg        transfer leg           Ready · Stock risk · Payment blocked ·
  Confirmed           Transfer confirmed     Logistics details incomplete · DO not released
  Collected by {p}    Collected for transfer
  On the way to       In transit to {stop}
    customer
  Delivered to        Arrived at {stop}
    customer
  Failed Delivery     Transfer failed
```

Progress and readiness never merge into one status. The two ladders share no word. A transfer is
never counted as a customer delivery and never produces a `Delivered to customer` result. A
transfer card prints its own `{from} → {to}` route, never the customer's town.

**`Arrived at customer` is not a Carres word** — no arrival-at-customer fact is recorded, and it
may never be inferred from a time, an ETA or a location.

**Schedule view words:** `Day` · **`3 days`** (768–1279px) · **`Work week`** (≥1280px, Mon–Sat) ·
`Month`. **A three-day layout is never labelled `Week`.**
The schedule boundary is **`Confirmed dates only`**: a date can be confirmed while its time
still needs agreeing. It applies equally to customer deliveries and transfers.

**Expanded-row words:** **`Logistics details incomplete`** · **`DO not released`** ·
**`Leg {n} of {m}`** · `Access not recorded` (orange, actionable — never a grey absence).

⛔ **Retired on Monitor, never to return:** `Waiting for customer date` · `Delivery confirmed` ·
`Waiting for warehouse` · `Ready for handover` · `Out for delivery` · `Created` · any bare
`Waiting` that does not name who must act. `Ready for handover` and `Received by logistics`
survive only as the recorded handover EVENT words on the DO object page. The operational words
may not appear in the Delivery Orders register, which describes documents.

Banned as status words on either surface, because each names a mood rather than a fact:
`Pending` · `In progress` · `Scheduled` · `Booked` · `Awaiting` · `Unscheduled` · `Not booked`.
**This ban was tested and upheld on 2026-09-14:** a proposed schedule ladder opened with
`Scheduled` / `Transfer scheduled`, and the owner ruled the governed **`Confirmed`** /
**`Transfer confirmed`** instead. `Delivery failed` is likewise not a second spelling of
**`Failed Delivery`**.

**Delivery workspace rail and action words — owner ruling 2026-08-24, editor words re-ruled
2026-09-13.** The rail's overdue queue is **`Overdue delivery`**, never `Date passed`. The two
governed partner acts are **`Assign logistics`** (first partner on a scope) and **`Change
logistics`** (replacing one, which requires a governed reason and writes history) — never
`Reassign`, `Set partner` or `Update logistics`. **`Edit Delivery` and `Save Delivery` are
RETIRED**: the Delivery-owned writes live inside the Monitor row's expanded panels, and the date
act is **`Update date and time`** with its save **`Save confirmed delivery`** (owner ruling
2026-09-13). A wrong Sales fact offers the door **`Open Sales Order to change`**. The Monitor
selection bar does not invent a unit word: `1 selected` / `3 selected`. The Delivery Orders
Register keeps its document count. The disclosure's hover reads **`Show delivery brief`**. A loan
line inside the expansion reads `Loan {Unit ID} · collect back on delivery day`.

**Monitor rail and calendar words — owner correction 2026-09-07.** `Calendar` is a view, never a
`WORK TO DO` row. The page toolbar uses exactly **`Day · Week · Month`**. The rail's four group
headings are **`WORK TO DO` · `STATE` · `LOGISTICS` · `DELIVERY STATUS`** (`REGION` and
`LOGISTICS` are retired as Monitor headings; the groups carry no `All …` row — picking again
unpicks and `Clear filters` clears). `scope` and `leg` are not employee-facing words anywhere on
Monitor or its assignment door: the footer counts `{n} deliveries`, a Journey row prints its route. The rail's proof job is
**`Upload delivery proof`**, never `Delivered — Proof Required`; its rows name the concrete missing
evidence as `Upload delivery photo` and/or `Upload signed Delivery Order`. The `DELIVERY STATUS` group is a
kit dropdown over the Monitor status words above; it never holds a work queue.

**Monitor's `Actions` and `Edit Delivery` columns are RETIRED — owner ruling 2026-09-12,
overwriting the 2026-09-09 `Actions` column ruling.** The Monitor register carries twelve
columns and no action column; the row's acts live inside its expanded panels
(`delivery/MASTER.md` §8.3 to §8.6). The customer's date keeps its governed word **`Requested
Delivery Date`** beside Delivery's own **`Confirmed Delivery`** / **`Confirmed Time`**; **`DO
date`** names the day the document issued and is never either of them. Its three absences are
`To be confirmed` (the customer has asked, the day is not settled) and `No delivery date` (none
asked for) for the request, and `Not confirmed` for the answer (the Monitor cell word; `No
confirmed date` remains the rail and calendar absence) — one spelling each, on screen and in the
export alike.

### The Monitor register, status and Payment words — owner rulings 2026-09-12 / 2026-09-13

The exact twelve Monitor columns, the 72px two-line row, the four expanded panels and the
in-panel writes are `delivery/MASTER.md` §8.3 to §8.6. These are their words:

| Where | The words |
|---|---|
| Column headings, in order | `Delivery Status` · `SO No` · `Customer` · `Delivery Location` · `Requested Delivery Date` · `Confirmed Delivery` · `Logistics` · `Items & Stock` · `Payment` · `DO No` (after the checkbox and expand columns) |
| `Confirmed Delivery` | `Confirmed` · `Not confirmed` on line one; the day, then the window (`Thu, 22 Oct` · `2 PM to 5 PM`) or `Mon, 14 Sep · No time agreed` on line two — and NOTHING on line two while unconfirmed (owner ruling 2026-09-14: the contact deadline is stated once, in `Delivery Status`) |
| `Items & Stock` | `Ready` · `Not ready` on line one; `2 of 2` · `1 of 2 · 1 short` · `Arriving after the requested date` on line two |
| Monitor Payment when valuation is unknown | `No price yet` — the existing Sales wording; never infer `Paid` from absent prices |
| `Payment`, paid | **`Paid`** |
| `Payment`, unpaid | **`Do not deliver`** over **`RM {amount} still to collect`**, or over `Finance is holding this delivery` |
| `Payment`, authoritative COD | **`Collect RM {amount}`** over **`Cash on delivery`** |
| A required Sales fact missing on a Monitor row | **`Order details incomplete`** as the status word; the panel names the fact, for example `Building type not recorded`, with the door `Open Sales Order to change` |
| The expanded panels, in order | `Customer, Address & Access` · `Delivery Dates` · `Logistics Details` · `Items, Services & Stock` |
| Delivery Dates edit state | `Update date and time` · `Confirmed date` · `Confirmed time` · `Information received from` · `WhatsApp proof` · `Save confirmed delivery` · disabled form `Save confirmed delivery — upload the WhatsApp reply` |
| `Information received from` choices | `{partner}` · `Customer` · `Operation on behalf of {partner}` |
| Items panel grid | `Item` · `Qty` · `Source` · `Status` · `Location` |
| Items panel Source | the Unit ID on line one; the clickable PO No, or `Counted stock`, on line two; never an invented PO number |
| Items panel Status | `Ready` · `Arriving {date}` · `Arriving after the requested date` · `No purchase order raised yet` · `Not received yet` |
| Items panel Location | the place: `Carres Klang` · `With NETS Delivery` · `PJ Showroom`; never `Ready at Carres Klang Warehouse` |
| Logistics Details pickup fact | `Handed over {date} {time} · {n} of {m} Units` · `Received by {partner} {time}` · `Pickup not recorded` |
| No Delivery Duty holder | `Nobody holds Delivery Duty.` · `Set the holder in Workspace → Staff & Duties` |

**Do NOT use on Monitor:** `Paid in full` (that is the Sales Orders register's money word) ·
`Payment pending` · `Needs attention` · `Attention` · `Alert` · `Checklist` · `Due` · `Next
Action` · `Priority` · `Ready at {place}` · `Edit Delivery` · `Save Delivery`.

**Colour and icons (owner ruling 2026-09-13).** Semantic status uses clear words and text colour:
green for `Paid`, `Ready`, `Confirmed`, `Delivered`; orange for a specific fact that needs an act
and is not yet late; red for `Overdue`, `Failed Delivery`, `Do not deliver` and a passed contact
deadline. Colour never replaces the word. No emoji, tick, checkmark, warning mark or decorative
progress icon appears inside a status fact. Governed functional icons remain: Search, Export,
Columns, the expand chevron, Download, Hide and Show filters, the calendar arrows and the rest of
the existing Carres utility set.

**Delivery Work sentences are two structured lines (owner ruling 2026-09-13).** Line one is the
act with its recipient; line two is the required result. Owner, source object and the actual
working date are structured metadata beside the sentence, never joined into it, and no `—`
appears in either line. The row's status word carries the fact. The complete table is
`delivery/MASTER.md` §10; the load-bearing pairs are `Call NETS` over `Confirm the delivery
date`, `Call NETS` over `Confirm the delivery time`, `Call the customer` over `Confirm the
delivery date`, `Ask NETS` over `Record the delivery result`, `Upload the delivery photo` over
`Attach the photo from NETS`, `Check the delivery proof` over `Accept it, ask for more, or reject
it`, and `Collect the loan item` over `Bring back {Unit ID} on the delivery day`.

**THE MONITOR `Delivery Status` CELL — owner ruling 2026-09-14.** The same law, applied to the
register column that used to name a party: line one is the ACT — **`Call customer`**, or
**`Confirm delivery time`** when the day is agreed and only the window is missing — and line two
is the CONTACT DEADLINE, drawn as a kit glyph and a day (`call` while there is time, `late` in red
once there is not). **`{partner} must contact the customer` and `Operation must call the customer`
are retired on Monitor**: the party is the `Logistics` column's own fact and may not re-enter the
action sentence. **`Call by {date}` is retired from every visible line** — it printed the verb the
status word above it had just said, and it printed the same day twice on one row. The words move
to the tooltip, the accessible name, Search and the Excel export: `Contact deadline {date}`, and
`Contact deadline {date} · overdue, the deadline does not move` once it has passed. No `—`
appears in either, and no glyph replaces the action text. `Call by {date}` survives ONLY on the
order detail's `Before you call` panel, whose entry below is unchanged. The complete cell law is
`delivery/MASTER.md` §8.3.

### Reports → Delivery words — 【DELIVERY】 CARD 17 (Delivery MASTER §12, 2026-09-13)

The central Delivery report lives at `Reports → Delivery` (`/operation?tab=delivery-report`,
reachable by direct URL like the Receiving report). It draws the Delivery destination header, the
eyebrow `Reports · Delivery`, the `Month` filter, `Export Excel`, and the §12 catalogue as ten
sections, each opening with one sentence that names its **source fact, its date basis and its
coverage** — the exclusion is always stated, never silent:

| The ten listings | The words inside them |
|---|---|
| `Delivery Commitment Performance` | `Kept the requested date` · `After the requested date` · `No requested date` · `{n} deliveries · Kept the requested date {rate}` |
| `First Delivery Success` | `Delivered on the first visit` · `Partly delivered on the first visit` · `Failed on the first visit` |
| `Failed Delivery Analysis` | the reason library's own words with the category in brackets, e.g. `Customer unreachable (Customer)` |
| `Logistics Performance` | `{n} trips · {n} delivered · {n} partly delivered · {n} failed · Cannot Deliver {n}` · `Delivered {rate}` · `No logistics named`; customer-leg results only — `Journey legs before the last are warehouse trips and are excluded.` (Card 20) |
| `Warehouse Performance` | `Ready {date} · Handed over {date} · Received by logistics {date}` · `Handed over by the delivery day` · `Handed over after the delivery day` |
| `Delivery Proof Control` | `No proof yet` · `Not reviewed yet` · `Proof Accepted` · `More Proof Required` · `Proof Rejected` · `Delivery photo missing` · `Signed Delivery Order missing` |
| `Schedule and Capacity` | `{n} deliveries confirmed across {n} days · busiest {day} with {n}` · `{n} deliveries · {n} booked` |
| `Customer Contact Performance` | `{n} contacts · {n} confirmed · {n} recorded on behalf of a partner` · `Recorded on behalf of {partner}` · `Contact deadline passed today` |
| `Return-to-Warehouse Control` | `Returned to Warehouse` · `Still with Logistics` · `Waiting at Inbound · {n} of {m} received` · `Received at Inbound · {site}` · `No Inbound arrival recorded` · `Inbound not available` |
| `Exception Ageing` | `Overdue` · `Failed Delivery` · `Proof missing` · `{kind} since {date}` · `Today` · `1 to 2 days` · `3 to 7 days` · `Over 7 days` |

**A rate with too few records is not printed (§12):** every rate reads `{hits} of {total} · {pct}%`
from five records, and `Rate withheld · fewer than 5 records` below that. **An unreadable read is
`Not available`, never 0** — the Cannot Deliver count and the Inbound join each say so. Empty
listings say `No delivery reached a customer this month.` · `No first delivery visit was recorded
this month.` · `No delivery failed this month.` · `No partner recorded a result this month.` · `No
handover was recorded this month.` · `No delivery proof is on record for this month.` · `No
delivery was confirmed for this month.` · `No customer contact was recorded this month.` · `No
goods came back this month.` · `No open exception today.` The page failure is `This report could
not be opened` over `Try again`. Every row is a door: the Delivery Order object, the Monitor row
with its brief unfolded, the Monitor day, or the Inbound arrival.

## The delivery group words (T8, locked with Jess 2026-07-27)

What may travel apart, and what may never. There are exactly TWO groups, and a
group is one atom — the words below name groups, never individual items:

| Group | The word | What it holds | May it go alone? |
|---|---|---|---|
| bed | **Bed set** | Mattress + bed frame | Yes — but never one without the other |
| sofa | **Sofa** | Sofa lines | Yes, on a second trip, ONLY if the customer agreed |

Accessories (pillow, mattress protector) belong to no group and are never
named in a trip: they never block a delivery, they are back-ordered.

Fixed phrasings — reuse these, do not invent variants:

- Split offer (only when part is ready and part is not):
  `Sofa not ready yet. Ask the customer:` + `Wait for everything` /
  `Deliver Bed set now`
- Confirmed partial trip: `Bed set only` (pill) ·
  `Bed set only — Sofa follows on a second trip` (activity line)
- What is still owed: row `Second trip` → `Sofa still to deliver` +
  `Book second trip`, or `stock not in yet` when it cannot be booked.

**Never** write "partial delivery", "split shipment" or "back-order" on screen — say what goes
and what follows, in furniture words.

**`consignment` IS UNBANNED ON THE PURCHASING AXIS, AND STILL BANNED HERE** (Jess, 2026-08-18).
The ban was written to stop a DELIVERY being described as split; that meaning stays banned, and
so does the word anywhere near a trip. But Carres genuinely holds supplier-owned furniture, the
supplier calls it consignment, the agreement says consignment, and inventing a Carres-only word
would leave staff translating in both directions. **`Consignment Order` · `Consignment Return` ·
`Consignment Sale Notice`** are the ruled supplier-document names. A consignment arrival uses the
same **`Goods Receipt`** as a purchase arrival while preserving supplier ownership. On a UNIT the fact is spelt
**`Supplier Consignment`**, against **`Carres Owned`**. The word never describes a delivery.

## The dictionary — every visible word, audited (Jess 2026-07-27)

**First, the distinction that stops the arguing.** Screen text is one of TWO kinds, and
mixing them is what produced words like "need booking":

| Kind | Must read as | Lives in |
|---|---|---|
| **ACTION** — what a human does next | verb + **named party** + **measurable object** | NEXT column · queue names · buttons · drawer checklist |
| **FACT** — what is true right now | a name, a date, a number | delivery column · badges · timeline |

**The trap is the third kind: a FACT that is secretly a to-do.** `need booking` ·
`Unscheduled` · `Pending` · `At Risk` · `Attention` — they describe a GAP, so the reader
still has to work out what to do. **Rule: a fact may state an absence (`No logistics`), but
it may never contain a to-do word (`need`, `pending`, `required`, `TBD`, `at risk`).**
If the sentence is about a gap, write the ACTION that closes it.

### THE DICTIONARY — five strings per action (locked 2026-07-27)

**An action appears on screen in FIVE places, and all five are locked here.** Four
were being invented per chat, which is why the same action read three different
ways on three screens.

| # | The string | Where it shows |
|---|---|---|
| 1 | **Queue tile** | the facet row, the filter chip, the count — **no party**, because a queue holds many |
| 2 | **Row line** | one record's Actions cell — **names the party**, because a row is one order |
| 3 | **Button** | the button that does it, inside the drawer or the form |
| 4 | **Done message** | the confirmation after it is recorded |
| 5 | **Empty state** | what the queue says when it holds nothing (why · when it changes · what to do meanwhile) |

**Five filled = designed. One missing = not designed — do not open a card for it.**

**A `—` is a filled cell, not a missing one.** It means *this action has no such string, and
here is why* — `Delay planning` has no done message because the row leaves by itself and the
action that follows it says what happened. An EMPTY cell is the undesigned case. The
difference matters because C8 stopped and asked on exactly this square, which is the behaviour
the rule wants.

**The two answers and the tooltip are part of the design too.** Where an action asks a
question, the answers are locked strings like any other:

| Action | The question | The answers | The queue tooltip |
|---|---|---|---|
| `Delay planning` | can the promised date still be met? | `We can still make the promised date` · `We cannot make the promised date` | `Supplier date lands after the promised date — decide before anyone calls (Delay planning)` |
| `Confirm tomorrow's delivery` | is it coming on the day we expect it? | `It arrives on {date}` · `It arrives later than {date}` | — (none: the tile's own label is already the whole instruction, and this file's tooltip rule says delete a tooltip that would restate the label) |

Both answers name **the promised date** rather than "yes" and "no", because the reader must
not have to remember what was asked.

**`Confirm tomorrow's delivery`'s two answers name the DATE for a second reason, and Loo said
it in one line when he ruled them (2026-07-29):** *"These answers remain true regardless of
when the user opens the action."* The action opens the working day before the goods are due and
stays open until somebody answers it — so a relative word is only true on the first day.
`Shipping tomorrow`, answered two days late, is a sentence about a day that has already passed.
`{date}` is the PO's expected arrival, and it is right whenever it is read.

**AND THE VERB NAMES ARRIVAL (owner ruling 2026-09-10, replacing the retired `It ships on
{date}` · `It ships later than {date}`).** `{date}` was always the expected arrival — the line
above already said so — while the sentence said `ships`, and a shipping verb on an arrival date
is the one reading that makes a reader add the transit leg a second time and move the arrival
twice. The answers now read **`It arrives on {date}`** · **`It arrives later than {date}`**.
A supplier answer that genuinely names a factory-ready or dispatch day is a DIFFERENT fact with
its own door (`Confirm ready date` → `expected_ready_date`) and becomes an arrival only through
the governed transit calculation. The stored `shipping` answer value is unchanged: it is a
ledger value, never a word on a screen.

**The answer words are not sufficient completion evidence** (Owner-approved Purchasing → Receiving
model, 2026-08-29). `Confirm supplier delivery`, `Supplier has not confirmed the PO date`,
`Supplier delivery date passed` and `Balance date missing` close only when the structured answer/date
is stored together with the supplier's WhatsApp or equivalent response evidence, recipient/channel,
actual actor and time.
Opening WhatsApp or transcribing an unsupported answer is not completion.

**`Confirm balance delivery date` gets no row here and that is a filled answer, not a missing
one**: it asks no question. It records ONE date, so its Button (`Record balance date`) is the
whole interaction and there is nothing for a second string to say.
The code mirror is `packages/shared/order-action-words.ts`; that module and this
table are one-to-one, so a queue and a row can never spell one action two ways.

**ORDERS + DELIVERY** (shipped C1, PR #461):

| Queue tile | Row line | Button | Done message | Empty state |
|---|---|---|---|---|
| `Issue PO` · `Confirm ready date` | **→ defined once in the PURCHASING table below.** The Orders ladder DISPLAYS these two; it does not respell them. *(This row replaces the old `Send PO` entry — `Send PO` is retired, and so are `Prepare PO` and the Draft PO it produced.)* | | | |
| `Assign logistics` | `Assign logistics` | `Assign logistics` | `{logistics} assigned` | `Every order has a logistics company.` |
| `Confirm delivery date` | `Call {logistics}` over `Confirm the delivery date` (two lines, owner ruling 2026-09-13) | `Save confirmed delivery` | `Delivery confirmed {date} · {slot}` | `0 calls to make · everything on track.` |
| `Confirm delivery date` — **the day is agreed, the window is not** (owner ruling 2026-09-12) | `Call {logistics}` over `Confirm the delivery time` | `Save confirmed delivery` | `Delivery confirmed {date} · {slot}` | *(same queue — a delivery is booked only with a day AND a window, so the row does not leave until both are recorded)* |
| *(retired 2026-08-16 — the SYSTEM issues the DO; no tile, no button)* | — | — | `Delivery order issued` (history line only) | `Nothing waiting for a delivery order.` |
| `Deliver on {weekday, date}` | `Deliver on {weekday, date}` | `Record Delivery Result` | `Delivered` | `No deliveries on {weekday, date}.` |
| `Upload delivery photo` | `Upload the delivery photo` over `Attach the photo from {logistics}` (two lines, owner ruling 2026-09-13) | `Upload delivery photo` | `Delivery photo saved` | `Every delivery has its photo.` |
| `Delay planning` | `Delay planning` | `Record the delay decision` | — (none: the row leaves by itself, and `Arrange new delivery date` says what happened) | `No supplier date lands after a promised date.` |
| `Arrange new delivery date` | `Call {logistics}` over `Arrange a new delivery date` | `Record new date` | `New date recorded` | `No delayed order needs a new date.` |
| `Collect RM {amount}` | `Collect RM {amount} from {customer}` | `Record payment` | `Payment recorded` | `Nothing outstanding.` |
| — *(no queue: the §4 chain lives on the Delivery page's detail, one next act at a time)* | — *(same)* | `Mark ready for handover` | `Ready for handover recorded` | — *(the block renders only once a DO exists — no DO, no handover, no empty queue)* |
| — *(same)* | — *(same)* | `Record handover` | `Handed over to {logistics}` | — *(same)* |
| — *(same)* | — *(same)* | `Confirm logistics receipt` | `Received by logistics — out for delivery` | — *(same)* |

**The handover chain's FACT words** (delivery MASTER §4, slice 1 shipped 2026-08-19): on screen a
recorded fact reads `Ready for handover` · `Handed over` · `Received by logistics`, sentence case,
with its recorder, duty word (`Warehouse` / `Logistics`), company and date. The receipt form's
instruction sentence is `Logistics' own count — correct any quantity that differs; both counts
stay on record.` — a discrepancy keeps both facts and overwrites neither.

**PURCHASING** (docs/purchasing/MASTER.md):

### Purchasing navigation words — owner ruling 2026-08-22

These are the exact visible words for the Purchasing sidebar tree. They name doors only; they
do not create a second business status, work queue or source of truth.

| Level | Exact visible words |
|---|---|
| Group headings | `BUY` · `RECEIVE` · `PROBLEMS` · `SHOWROOM` |
| BUY pages | `SO Batch Purchase` · `Manual Purchase` · `Purchase Orders` |
| RECEIVE pages | `Receiving` |
| PROBLEMS pages | `Supplier Claims` · `Purchase Returns` · `Repair Orders` |
| SHOWROOM pages | `Display Requests` · `Consignment Orders` · `Consignment Returns` · `Consignment Sale Notices` |

Purchasing has no Home, module-specific Work, Purchase Demands, New Supplier/New SKU request,
Consignment Overview, Consignment Receipts, Report or Settings sidebar destination. The capability
lives in its authority home: Registers, central Work/Reports/Settings, in-context Catalog governance
or the one Receiving engine. `purchase_demand` remains an authoritative record, not a page.

**ADD SUPPLIER — APPROVED / LOCKED, owner ruling 2026-09-04; in-context Catalog door.** Exact
visible words, top to bottom:

| Purpose | Exact visible words |
|---|---|
| Form and identity | `Add Supplier` · `Supplier Name` |
| Goods movement | `Delivery Method` · `Supplier delivers` · `We collect` |
| Existing Catalog classification | `Product Categories` · `Mattress` · `Bedframe` · `Sofa` |
| One value for every selected category | `Production Days` · `working days` |
| Factory calendar | `Supplier work week` |

`Product Categories` is multi-select and never a free-text create-category field. Its available
values are `Mattress` · `Bedframe` · `Sofa`. Selecting a category reveals its own required
`Production Days`; never show or save one generic supplier lead time. A PO date never appears in
this form because it belongs to the Purchase Order.

**PO send wording — APPROVED (Jess, 2026-09-16) · BUILT 2026-09-17 in `PoIssueEvidence`.** Implement in the Purchase
Orders round (after Sales Orders small patch and Manual Purchase Round 2, Jess 2026-09-17), through the shared
`PoIssueEvidence` component on all three PO-sending surfaces; no separate build task.

| Where | Exact wording |
|---|---|
| Current-version sending confirmation button | `PO sent to supplier` |
| Current-version sent mark absent: group | `Confirm PO sent to supplier` |
| Current-version sent mark absent: cell | `Sending not confirmed` |
| Shared completion sentence | `Current PO version marked as sent` |

Retired for this PO fact: `Not marked as sent`, `Mark as sent`, `Record the PDF sent`, `PDF not sent`, `Not sent`,
`Not sent to supplier`, and `Current PO version reached supplier with evidence`.
Classify groups in priority order: Cancelled → Completed → Waiting for goods from supplier (current version marked,
goods pending) → Confirm PO sent to supplier. A completed PO missing a mark remains Completed.
Preserve older version sending evidence without claiming the current version is marked.
Never claim supplier receipt, reading or acceptance from a sent mark. Staff send externally
before marking; the Portal cannot observe WhatsApp sending without an API.

**PURCHASE ORDERS REGISTER — APPROVED / NOT BUILT (Jess, 2026-09-18).**

Columns, exactly: `PO Date · PO No · SO No / MPR No · Supplier · Items ·
Supplier Deliver To · PO Default Delivery Date · Supplier Confirmed Delivery Date · Goods Received Date · GRN No · PO Version`.

| Fact | Exact copy |
|---|---|
| PO document issue date (not sent-mark date) | `PO Date` |
| GRN creation date; physical arrival is separately Goods Received Date | `GRN Date` |
| DO issue date | `DO Date` |
| Separate delivery facts | `PO Default Delivery Date` · `Supplier Confirmed Delivery Date` · `Goods Received Date` |
| Supplier reply missing / confirmed / changed | `Not confirmed by supplier` · `Confirmed by supplier` · `Supplier changed from {date}` |
| Unknown original date | `Not recorded` |
| Current version | `PO V{n}` |
| Current version sending evidence, supporting line | `PO sent to supplier · {channel} · {date}` / `Sending not confirmed` |
| Multiple SO / GRN references | `{n} SOs` · `{n} GRNs` |
| Manual source in SO No column | `Manual Purchase` |
| Goods summary | one item name / `{first item} + {n} more` |
| Shared send-area prompt after opening channel | `Send the PDF, then press PO sent to supplier.` |
| Footer | `{n} purchase orders` · `{n} of {m} purchase orders` · `1 purchase order` |

Groups: `Confirm PO sent to supplier` · `Waiting for goods from supplier` · `Completed` · `Cancelled`; membership and sorting are
owned by Purchasing MASTER §9.3. No quantity totals in the PO listing footer.
Expansion: `SKU · Item / configuration · Qty · Deliver To` (read-only).

| Rail group | Visible rows |
|---|---|
| `Supplier reply` | `Date not confirmed` · `Date changed` · `Date passed` |
| `Receiving` | `Partly received` |
| `Supplier` | Supplier facts |
| `Deliver To` | Destination facts |

Inside the `Supplier reply` group the short rows are used. Outside that group context — including
active-condition chips — use the complete labels `Supplier has not confirmed the PO date` ·
`Supplier Confirmed Delivery Date changed` · `Supplier delivery date passed`.
Supplier-reply conditions require the current version marked as sent and goods pending.
Retire on this listing: `PO Issued`, separate `Sent to Supplier`, `Source`, combined `Expected Delivery Date`,
`PDF not sent`, `All purchase orders`, `DOCUMENT` and `Send the new version to supplier` rail text.
Original dates, quantities, sources and version/send evidence remain authoritative in detail;
these copy retirements do not delete business facts or ban their words on other governed surfaces.

| Queue tile | Row line | Button | Done message | Empty state |
|---|---|---|---|---|
| `Issue PO` | `Issue PO to {supplier}` | `Issue PO` | `PO issued to {supplier}` | `No purchase orders to issue.` |
| `Supplier has not confirmed the PO date` | `Ask {supplier} to confirm the PO delivery date` | `Record supplier answer` | `Supplier answer recorded` | `Every supplier has confirmed the PO delivery date.` |
| `Supplier delivery date passed` | `Ask {supplier} when the goods will arrive` | `Record supplier answer` | `Supplier answer recorded` | `No supplier delivery date has passed.` |
| `Goods to receive` | `Check in {document} from {supplier}` | `Start receiving` | `GRN posted · {n} received · {m} pending delivery` | `No supplier delivery is ready to receive.` |
| `Balance date missing` | `Ask {supplier} for the balance delivery date` | `Record balance date` | `Balance date recorded` | `Every part receipt has a balance date.` |
| `Confirm what happens next` | `Call {supplier} — confirm what happens next` | `Record what happens next` | `Supplier answer recorded` | `No claim is waiting for a supplier answer.` |
| `Issue consignment order` | `Issue consignment order to {supplier}` | `Issue consignment order` | `Consignment order issued to {supplier}` | `No showroom is waiting for stock.` |
| `Issue purchase return` | `Issue purchase return to {supplier}` | `Issue purchase return` | `Purchase return issued to {supplier}` | `Nothing is going back.` |
| `Issue repair order` | `Issue repair order to {supplier}` | `Issue repair order` | `Repair order issued to {supplier}` | `Nothing is out for repair.` |
| `Confirm collection date` | `Call {supplier} — confirm collection date` | `Record collection date` | `Collection date recorded` | `Nobody is waiting to be collected.` |
| `Upload delivery note` | `Upload delivery note` | `Upload delivery note` | `Delivery note saved` | `Every receipt has its note.` |
| `Check quantity difference` | `Check quantity difference` | `Record the correct count` | `Count recorded` | `Every count matches.` |
| `Close claim` | `Close claim` | `Close claim` | `Claim closed` | `No claim is finished and waiting.` |
| `Approve the purchase` | `Approve {n} {model} for {purpose}` | `Approve` · `Refuse` | `Approved — {n} {model}` | `Nothing waiting for you.` |
| `Decide what happens to the item` | `Decide what happens to {unit}` | `Save what happened` | `Recorded` | `No item is waiting.` |
| `Late supplier goods` | `Ask {supplier} if the goods can arrive by {weekday, date}` | `Record supplier answer` | `Supplier answer recorded` | `No supplier delivery is late.` |
| `Check the SKU` | `Check the SKU with {supplier}` | `Publish the SKU` | `SKU published` | `Every request has its product.` |
| `Check the supplier` | `Check the supplier for {model}` | `Save the supplier` | `Supplier saved` | `Every model has a supplier.` |
| `Upload handover proof` | `Upload handover proof` | `Upload handover proof` | `Handover proof saved` | `Every handover has its proof.` |

**PURCHASE DEMAND FACTS — used inside SO Batch Purchase and connected objects.**
`purchase_demand` explains buying demand and coverage; it never issues a purchase order and has no
sidebar page. Existing implementation constants do not override these approved placement words.

| Where | The word |
|---|---|
| Page | No page — use `SO Batch Purchase` or the source object |
| Search | `Search Sales Order, customer, SKU or supplier…` |
| Rail headings | `ORDER TIMING` · `PRODUCT` · `SUPPLIER` · `REGION` · `SETUP TO FIX` |
| Empty state | `No proceeded Sales Orders.` |
| Register columns (owner ruling 2026-09-18 — exactly, in this order; overwrites R3 2026-09-16) | `Proceed Date` · `SO No` · `PO Safety Days` · `Customer Requested Delivery Date` · `Customer Delivery Location` · `Customer` · `Items` · `Supplier` · `Supplier Deliver To` · `PO No` · `PO Default Delivery Date` |
| Table group headings (ruling R1 2026-09-16) | `To buy` (heading, count beside it) · `No purchase needed` (disclosure button, count beside it) |
| Order By absence (ruling R2, split by S1 — BUILT 2026-09-17) | Three facts, three words, blank when nothing is left to buy: `Not planned` — ONLY missing setup blocks the date · `Already on a PO` — another open PO covers the remaining demand · `Coverage not checked` — whether an open PO covers it could not be verified. Never one word for all three. |
| Footer (ruling R6) | `27 Sales Orders` · `5 of 27 Sales Orders` · `1 Sales Order` — one total, nothing else |
| Search clear control (ruling R4) | `Clear search` |
| `Proceed Date` on SO Batch Purchase | The actual date Sales handed the complete order to Operations (`orders.proceeded_at`). Never the planned production-start field (`orders.proceed_date`) |
| Parent Status column | Retired. Do not restore `Partial` / `Ordered` as status pills or footer tallies. `To buy` / `No purchase needed` are the separately approved table group headings, not stored statuses. |
| A parent cell over several values | one value prints itself; several print `2 POs` · `2 suppliers` · `Multiple` — the exact mapping lives in the expansion |
| Open local filter-rail control | `Hide filters` |
| Hidden local filter-rail control | `Show filters` |
| Selected Issue action | `1 selected · 1 unit · Issue 1 PO  [Clear]  [YJ]  [Issue PO]          [Export Excel (1)]` |
| PO Duty owner chip title | `{name} · PO Duty` |
| Dated cover chip title | `{cover name} · PO Duty cover for {normal holder}` |
| No monthly holder in selected action | `Nobody holds PO duty this month.` |

The SO Batch Purchase owner is never a permanent sentence in the toolbar or rail and never repeats
on rows. Do not write Yu Jun's name in the action sentence. The compact chip carries the owner;
`Issue PO` remains the one governed verb. This selected action replaces the Register's top Work
Toolbar above the column headings; it is never a second bar at the bottom of the table. Summary,
`Clear`, owner chip and `Issue PO` stay left; `Export Excel` stays at the far right.

**SO Batch corrections — owner approved 2026-09-16.** `Not planned` means the
Order By cannot yet be stated because setup blocks the demand (S1: never for covered or unverified
coverage — those read `Already on a PO` / `Coverage not checked`). `No Sales Orders match these filters`
with `Clear filters` is distinct from `No proceeded Sales Orders.`. The singular is
`1 Sales Order`; narrowed scope remains `{n} of {total} Sales Orders`.
`Only PO Duty can issue this PO` explains an unavailable Issue button.

**SO Batch grouped Register — owner approved 2026-09-16.** `To buy` and
`No purchase needed` are table group headings, never rail rows or stored statuses. The second
includes PO coverage and Ready Stock coverage; `Ordered` must not describe an order with no PO.
This dated group-heading ruling permits these words here only; the retired rail stays retired.

**Purchasing and Receiving date facts — owner ruling 2026-08-29.** These words are never
interchangeable:

| Word | Exact fact |
|---|---|
| `PO Issued` | current-version marked-sent time in legacy lineage surfaces; not a Purchase Orders register column |
| `PO Default Delivery Date` | the original official supplier-facing date on the PO |
| `Supplier Confirmed Delivery Date` | the supplier's answer to the PO date: `Not confirmed` before evidenced supplier reply; `Same as PO` after the supplier confirms the PO date; otherwise the different date supplied by the supplier |
| `Goods Received Date` | the physical arrival date and time; never keyed/submitted/posted time. Owner correction 2026-09-06 — the retired spelling `Goods Received At` may not appear. |

**Unit ID words — owner ruling 2026-09-07 (Purchasing CARD 10, Unit ID Born With Official PO).**
`Unit ID` is the only visible word for a physical identity; `Item ID` is retired everywhere,
including the official PO PDF heading (`UNIT ID`). A Unit ID exists only for goods Catalog
traces one by one; quantity goods have none, and the screen must say so with a dash, never
with an absence word that implies one is owed.

| Fact | Word | Do NOT use |
|---|---|---|
| The goods-line column of an opened PO, and the PO PDF heading | **`Unit ID`** (screen) · **`UNIT ID`** (paper) | Item ID · Unit IDs · Serial · Code |
| A quantity-scoped goods line — it has no Unit ID by law | **`—`** | Not allocated · No Unit ID · Not created yet · Pending |
| An exact-unit line with no Unit IDs after official issue — an integrity failure, never an ordinary empty state | **`Unit IDs missing on this line — do not send this PO`** | No Unit ID · a blank cell · Not allocated |
| Catalog's per-SKU answer to *how does Stock count this?* | **`Stock identity`** with the values **`Unit ID`** · **`Quantity`**, and **`Not set`** while Catalog has not said | Tracking mode · Serialised · Bulk · Traceable flag |
| Official PO issue refused because Catalog has not said | **`Set the stock identity (Unit ID or Quantity) for {sku} in Catalog before issuing a PO`** | Unknown mode · Configuration missing · Contact admin |
| Receiving refuses a quantity-only count on a traced line | **`line {sku} is traced by Unit ID — record one result for each expected Unit`** | Units required · Invalid submission |
| Receiving refuses Unit IDs named against a counted line | **`line {sku} is counted by quantity — it has no Unit IDs to scan`** | Bulk item · Not serialised |
| The supplier's package-label instruction | **`CARRES UNIT ID: U1-000-001`** | QR · barcode · label template · Item ID |

**Supplier reply truth — correction card 2026-09-06.** The reply form's date field is labelled
`Supplier Confirmed Delivery Date` (never a bare `Date`), and the form states the comparison beside it:
`Same as PO` · `Earlier than the PO date` · `Later than the PO date`. Only a LATER date asks
`Why has it moved?`, and nothing is pre-chosen — the select opens on `Choose a reason`. A reply
recorded before the evidence law reads `Supplier reply recorded without evidence · {date}`; it never
claims the governed `Supplier Confirmed Delivery Date` and never reads as `Not confirmed`, because a recorded
answer is not a proven absence. The object's `Reply history` lists every reply by version —
`PO V{n} · {date} ·` one of `Confirms the PO date` · `Earlier than the PO date` ·
`Delayed — {reason}` · `Date reported` — with its `Reply evidence` link where evidence exists.
A demand an open purchase order already fully covers refuses issue with
`An open purchase order ({PO No}) already covers this line.` /
`Nothing to buy here. Check the covering purchase order instead.`

In SO Batch review, `Issue PO` automatically reads the covering PO and resumes its
PDF/send evidence step without issuing another document or showing the coverage refusal.
Keep the label `Issue PO`; no second recovery click is needed. If that read fails,
use `Could not open {PO No}.` / `Try again.`; the same button retries opening that PO.

**Sent documents — correction card 2026-09-06.** Revisions lists each version the supplier
actually received as `Sent document · PO V{n}` · `Recorded at the confirmed send`, with
`Download PDF`. A version sent before document keeping began answers
`No kept document for this PO version` — a named absence, never a reconstruction.

**Help version words — correction card 2026-09-06.** The Help menu shows `Version {code}` and
`Built {time}`, with `Check for update` answering one of `You are on the latest version` ·
`A newer version is ready` (with the `Reload to update` button — the reload is always the
operator's own click, so unfinished input is never thrown away) ·
`The version check did not reach the server`.

No recorded business date is silently moved to fit a calendar. Purchasing/Operation work uses the
Office calendar (Mon–Fri); Receiving/GRN/Warehouse uses the Warehouse calendar (Mon–Sat); Sunday
and Selangor public holidays are excluded.

**The SO Batch Purchase rail — owner correction 2026-09-11.** FIVE purchasing fact sections, in
this order. Central Work actions do not appear here. `SETUP TO FIX` renders only when at least
one affected Sales Order exists. **`TO ORDER` / `All not ordered` is RETIRED from this rail**: it
named the page's own default — what an operator already sees with nothing selected — rather than a
fact about a Sales Order, and it sat above the section that answers what to buy today. The
outstanding arithmetic behind it is untouched and still governs the tick and the Ready Stock door;
Manual Purchase uses its own request groups and remainder arithmetic.

| Heading | Rail rows |
|---|---|
| `ORDER TIMING` | `Can order early` · `14 safety days left` · `1–13 safety days left` · `No safety days left` · `Not enough production days` |
| `PRODUCT` | `All products` · `Mattress` · `Bedframe` · `Sofa` |
| `SUPPLIER` | `All suppliers` · actual supplier names, alphabetical — never hardcoded, never a placeholder, and no `No supplier` row |

`PURPOSE` (Manual Purchase), `PRODUCT` and `SUPPLIER` are **compact fact dropdowns** (owner ruling
2026-09-11; `PRODUCT`, `SUPPLIER` and `REGION` on SO Batch Purchase too). The `All …` word is the
control's first option and its clear; every governed value stays present as an option; the
count rides in the option text (`Ohana · 4`). `ORDER TIMING` and
`SETUP TO FIX` keep their visible rows.
| `REGION` | `All regions` · `Klang Valley` first · actual outstation Delivery State names, alphabetical · `Others` last and only when Delivery State is not recorded |
| `SETUP TO FIX` | `Production days not set` |

`My Work` / `Team Work` are the only daily-work surfaces. The SO Batch rail must not copy
`Issue PO`, customer-information, Catalog or supplier-setup actions into a local work panel.
Counts are UNIQUE Sales Orders, never documents, notifications, leaf lines, SKU quantities or
PO counts, and each section's counts update against the other selected sections. The fixed
fact rows print their live count, zero included; a supplier or region row exists only while it
matches — except the selected row, which stays visible with `0`. Region reads the server's
recorded Delivery State: Kuala Lumpur, Selangor and Putrajaya group as `Klang Valley`; every
outstation state keeps its own name; an absent state is `Others`. The default no-filter Register
retains every proceeded record in `To buy` (expanded) and `No purchase needed` (initially collapsed). The outstanding arithmetic reads customer quantity less Ready Stock
already taken and less exact, non-cancelled PO lineage. A generic Open PO SKU pool is not proof
that this SO was ordered; without exact `po_line_sources` the units stay outstanding. The issue
leaf is not the coverage authority. One filter per section; sections combine; a second click on
the selected timing row clears it; `All products`, `All suppliers` and `All regions` clear
their sections.
The rail carries NO checkboxes — filters are `NavRow` rows; the only checkboxes on the page
are the Register's `Issue PO` selection. Every `ORDER TIMING` row stays orderable — the words
say timing risk, never `Cannot buy`, and Order By is a planned date, never an unlock date.
`Production days not set` lines are not selectable until the Supplier × Category production
days exist. Fully covered / `Buy = 0` DEMAND is never selectable, but the Sales Order's own
row is permanent and never leaves the Register. A governed rail label is never truncated —
it wraps onto a second line in the same body font, never a tooltip.

**The row facts.** Line 1 is the FACT; line 2 is the FIX, in the imperative. A line the owning
boundary (Sales / Catalog) unexpectedly let through without its customer date, SKU or supplier is
NAMED on its own row — it is never silently defaulted or turned into a rail category. Its concrete
fix action belongs only to the owner-resolved central Work projection:

| Fact (line 1) | Fix (line 2) |
|---|---|
| `Requested delivery date is missing` | `Ask the customer which date they want` |
| `SKU not found` | `Add this item to the SKU catalog` |
| `Supplier not assigned` | `Check the supplier for {model}` |
| `Production days not set` | `Add production days for {supplier} · {category}` |

`Check the supplier for {model}` is the Work Engine's own dictionary row above, reused verbatim
rather than respelt.

**The Safety-days words.** The visible term is `Safety days`; `buffer` never reaches a screen.
The Purchasing Settings row reads `Safety days` · `14 working days` with the explanation line
`Extra time allowed for delays.`

**The absence words.** A cell never prints a bare dash where a sentence is owed:
`No delivery date yet` · `No supplier yet` · `Not counted yet` (the blocker also blocks the
coverage arithmetic, so nothing is known) · `Nothing covers it yet` (the arithmetic ran and
found nothing). The last two are DIFFERENT answers and may not be merged.

**Banned on Purchasing surfaces:** `Today` · `Tomorrow` · `Overdue` · `Needs attention` ·
`Follow up` · `Pending` · `Waiting` · `Priority` · `Buffer` · a generic `Next action` column. A
word that tells the operator a row is important without telling them what is wrong with it is not
a word this Register may use. **Retired from the SO Batch Purchase rail, never to return:**
`TO ORDER` · `All not ordered` ·
`Ready to buy` · `Covered` · `No customer date` · `No SKU` · `No supplier` · `No production days` ·
`BUYING RECORDS` · `All lines` · `No buying needed` · `Cannot buy`.

**SO Batch goods and stock picker — Jess, 2026-09-18 · APPROVED / NOT BUILT.**
Goods expansion and item-local Ready Stock follow Purchasing §9.1, appearance UI MASTER §6.8–6.9.
These stock-picker words do not rename every Warehouse screen.

| Where | The words |
|---|---|
| Actionable goods heads | `Status` · `Category` · `Qty` · `Item` · `Ready Stock` · `Supplier` · `Supplier Deliver To`; selection checkbox leads. Retire SKU, Ordered Qty, To buy and Order By from this table only. |
| Need for a new PO, parent/item Status | `Need PO` · `No PO needed`. Not eligibility, PO completion, or a rename of the existing register groups. Never use `Not ordered yet` or `No purchase needed` for these status cells. |
| Ready Stock cell | `{n} available` / `{n} reserved` on separate lines; reserved means this SO item line. `0` only for a successful empty read with no saved choice. |
| Stock picker heads | `Goods Received Date` · `Stock Location` · `Supplier` · `PO No / Ref No` with `Unit ID` on line two · `Condition`; checkbox leads. Date only, physical receipt; current stock location. No Date In or Where on this picker. |
| Stock picker actions | `Choose Ready Unit` · `Change selection` · `Save changes` · `Cancel`. No per-Unit Undo; save writes, checkbox alone does not. |
| Stock picker feedback | `{n} selected` · `Not saved` · `Stock selection saved.` · `Choose up to {n} Units for {SO No}.` · `{n} of {N} reserved for {SO No}.` · `Save or cancel your stock selection before issuing a PO.` · `Choose no more than {n} Units.` |
| The record's heading | **`Purchase order details`** — never `Covered by` (retired: one heading, three questions) and never `ON PO` (that is the goods table's quantity column; a heading repeating a column name makes the number and the section read as one thing). |
| The record's heads | `PO No` · `Unit ID` · `SKU` · `Item` · `Qty` · `Deliver To` · `Supplier` · `PO Status` · `PO Default Delivery Date`. **`PO No` first and `Unit ID` beside it** — the two identifiers a person copies. Both print in FULL: `PO-20260904-4665`, **never** `PO-260904-4665`. **Absent on purpose:** `Ready Stock` · `To buy` · `Category` · any tick — a column of dashes states nothing. |
| `PO Status` | The DOCUMENT's own state, in the ONE Purchasing vocabulary: **`Completed`** · **`Waiting for goods from supplier`** · **`Sending not confirmed`** — the same `documentState` union the Purchase Orders register prints. **`Open` is never a Purchase Order status** and the raw database value never reaches a screen. It is the column that makes `On PO` legible: that figure counts every non-cancelled document, `Completed` ones included, while `To buy` is netted against OPEN documents only. |
| A Unit cell with no Unit | **FIVE answers, never one.** `Loading…` in flight · `Could not be loaded` on failure · **`Not checked`** when the read answered for the ORDER but carried no entry for this item line (Carres did not look here — never `Not read`, which reads as an unopened message rather than an unasked question) · **`Counted stock`** when the goods are counted rather than individually tracked (0453 — the technical `QTY-` key never reaches a `Unit ID` heading; never `Not unit-tracked`, which names a database column to an operator who has never seen one) · `Not allocated` ONLY when the read answered for this line and nothing is tied to it. **Printing any of the first four as the last tells an operator goods do not exist because a request was slow.** |
| HOW a Unit reached this item line — three answers, never merged | The record binds it here, or a purchase-order line sourced exclusively to this line carries it: **nothing extra is printed**, because that is evidence, and the row carries its quantity. It got here by SKU (no binding, or a binding naming another line): **`Item line matched by SKU`**, and the row carries **NO quantity** — the same physical Unit is offered to every item line of that SKU, so counting it would let one Unit answer two lines at once. Nothing in the read evidences it at all: **`Item line unknown`** — a gap in the READ, which may never borrow the sentence for a gap in the RECORD. The Unit is SHOWN in all three cases; what changes is what the screen claims about it. |
| `To buy` — a figure ONLY where the page offers the buy | `To buy` means *what is left to buy*, so on a row the register does not offer it prints the governed absence `—` and the row says which state it is in. **Covered** (the engine's `fullyOnPo`): `—` · **`Already on a PO`** · **`Nothing to buy here`**, titled `An open purchase order already covers this line. Nothing to buy here — check the covering purchase order instead. Issue PO refuses it.` — the door's own words (`purchasingRefusal("already_on_po")`) at cell width, so the operator meets ONE sentence, not two. **Not checked** (no flag in the payload): `—` · **`Coverage not checked`**, titled `Whether an open Purchase Order already covers this line could not be checked, so it is not offered for buying. Reopen the page to check again.` — unknown is not yes, and a page may not describe an eligibility nobody verified. **The engine's covering quantity is never printed under this head**: it is a covering quantity, not a purchasing one, and the customer's `Qty` and the historical `Ordered Qty` carry the facts two columns away. Notes are WRITTEN as short lines, never left to wrap — the long sentence takes the item row to 91px. **Never `Open PO …`** — a retired column head. |
| A document fact that is not on file | `Not recorded` — the same word Purchase Orders uses, never back-filled from a planning date. |

**MANUAL PURCHASE — the internal buy's own words.**

| Where | The word |
|---|---|
| The page's create button | `+ Manual Purchase` |
| The create workspace title | `New Manual Purchase` |
| Submit · abandon | `Send for approval` · `Cancel` |
| The disabled Send NAMES its gap (the Receiving button law; first missing header fact wins, top-to-bottom) | `Send — lead days are not set` · `Send — pick a date` · `Send — pick the Service Case` · `Send — pick the staff member` · `Send — name the subsidiary` · `Send — say what it is for` |
| The form's fields | `Need for` · `Proceed Date` (read-only server preview before Send; actual server hand-off after Send) · `Delivery Date` · `Deliver to` · `Raised by` · `Items` · `Qty` · `Note` · `Supplier` · `+ Add line` · `Remove` — plus the per-purpose For field: `Service Case` · `Staff member` · `Subsidiary` · `What is this for?` (Other Purchase only; routine purposes ask no duplicate `Why` — the historical `Why` label survives on pre-Card-04 objects only) |
| The already-have block | `WHAT WE ALREADY HAVE` — `free stock` · `already on PO` · `still needed` (the arithmetic is PRINTED, never left to the reader) |
| The register columns — owner ruling 2026-09-18, NOT BUILT | `Status` · `Proceed Date` · `MPR No` · `Approval Status` · `Purpose` · `Requested By` · `PO Safety Days` · `Customer Requested Delivery Date` · `Customer Delivery Location` · `Customer` · `Items` · `Supplier` · `Supplier Deliver To` · `PO No` · `PO Default Delivery Date`. `MPR No` opens the request; `PO No` lists every resulting PO, blank before any. Customer columns stay blank for purposes with no customer; never invented. |
| Manual date planning | `Proceed Date` is the actual request hand-off. `Delivery Date` defaults from the slowest selected line's Supplier × Category production days + supplier transit days. `Order by {date}` is derived by walking the same lead days backwards; the earliest line governs the request. Do not add the SO fixed 14-day reserve; the shared `PO Safety Days` margin display still applies. |
| Missing lead facts | `Production days are not set` → `Add production days for {supplier} · {category} in Settings`; `Transit days are not set` → `Add transit days for {supplier} in Settings`; disabled Send: `Send — lead days are not set`. |
| The Approval Status facts | `Need approval` · `Approved` · `Refused` · `Withdrawn` · `Sent back for changes` — the FACT alone on the Register row (owner ruling 2026-09-11): no stacked approver name and no Approve/Refuse button. The quiet `{name} approves` line belongs to the object's `Approval` section. A `Need PO` row's own selectability explanation may still appear, computed from the same facts the tick reads: `Approved at 0. Nothing to order.` · `Remaining quantity not checked` (title: `The quantity still to buy could not be read, so it is not offered for buying. Reopen the page to check again.`). A `Sent back for changes` row carries the real requester's initials avatar, title `{name} · Edit and send again`, or `Staff identity not recorded`. `No approval needed` is RETIRED (R1). |
| The deterministic summaries | `—` (no PO yet — a fact, not a button) · the one PO number · `{n} POs` (opens the object's exact linked PO list) — `{first item} + {n} more` — `{n} suppliers` — `Multiple` (several destinations) |
| Ready Stock (APPROVED / NOT BUILT, Jess 2026-09-18) | Use the SO Batch stock-picker headers and selection words; saved allocations bind to an approved exact MPR line for a concrete need. Additional replenishment and unapproved requests are read-only. Never pretend an MPR is an SO. `Goods Received Date` is date-only here; `Stock Location` is current location. |
| The selection bar — replaces the top toolbar, no action bar below the table | `{n} selected · {u} unit(s) · Issue {p} PO(s)` beside the resolved PO Duty person and `Issue PO` — PO Duty renders NOWHERE without a selection; `Select at most 20 requests for one issue.` |
| The states | `Waiting for approval` · `Sent back for changes` · `Withdrawn` · `Waiting for the SKU` · `Ready to order` · `Ordered` · `Arrived` · `Not going ahead` — `Waiting` always names what it waits ON; `Arrived` is a FACT the system observes, never a button |
| The purpose choices — owner rulings 2026-08-28 (Card 03) / 2026-08-29 (Card 04), exactly and in this order | `Ready Stock` · `Showroom Display` · `Service Case` · `Internal Staff Purchase` · `Subsidiary Purchase` · `Other Purchase` — Management is included under `Internal Staff Purchase`; there is no `Management Purchase`; only `Other Purchase` asks `What is this for?` |
| Retired purpose words — history only, never offered, never relabelled | `Display` · `Warranty` · `Office` · `Spare Parts` — a pre-ruling row keeps printing the word it was actually asked as; the doors refuse these values for a new request |
| The document identity — owner ruling 2026-09-18 (overwrites Card 08, 2026-09-04) | Each Manual Purchase request shows its `MPR No` (`MPR-YYYYMMDD-RRRR`); the supplier still receives only the PO. `Manual Purchase No`, `Request No`, `Draft PO` and `MP` stay banned. Historical `MPR-…` numbers show as they are; `REQ-…` stays searchable. |
| Manual PO grouping | `Issue {p} PO(s)` counts Supplier × Category × Deliver To × Purpose × Delivery Date. Different Delivery Dates create different POs; each PO keeps that approved `PO Default Delivery Date`. |
| The register's empty state | `No Manual Purchase yet.` |
| The Object Detail sections — Card 05 (2026-08-29), exactly and in this order | `Request` · `Items Requested` · `What We Already Have` · `Approval` · `Purchase Orders` · `History` — one full-width scroll; no tabs, no split preview |
| The object header — Card 08 (2026-09-04) | back destination `Manual Purchase` · the business heading `{Need for} · {For}` with the quieter `{Proceed Date} · {supplier summary}` context · one state pill · the filtered position `{n} of {m}` with previous/next — browser title `Manual Purchase — Carres`; no number, no UUID, no duplicate Back, page title, breadcrumb or PDF action |
| The Request facts, in reading order | `Proceed Date` · `Delivery Date` · `Need for` · `For` · `Deliver To` · `Requested By` — timing second line: `Order by {date}`; if passed, `Order date passed` then `Order by {date}`; `Requested By` is the real staff display name; a shared-account record whose individual cannot be recovered reads `Staff identity not recorded` |
| A missing Catalog supplier on a line | `No supplier yet` + `Ask Catalog to set the supplier of {sku}.` — a named fact on the affected line, fixed at the Catalog boundary, filterable as `Supplier not set` under `SETUP TO FIX` |
| The already-have table heads | `SKU` · `Free Stock` · `Already On PO` · `Still Needed` — decision facts, not buttons. D3 (Round 2) sentence above them: `For each SKU across Carres — free stock and open purchase orders. This request's own purchase orders are listed below. Stock shown here does not reduce what this request asks for.` |
| The Approval facts | `Need approval` + `{name} approves` · `Approved` / `Refused` / `Withdrawn` / `Sent back for changes` + the real actor and date/time, and (approved) quantity per line, (refused / sent back) the reason. Requester, sent back: `Edit and send again`. Requester, before a decision: `Withdraw request`, asked once more with `Cancel` · `Withdraw request`. |
| The approver's decision line | `SKU` · `Requested Qty` · `Still Needed` · `Approved Qty` (prefilled from Still Needed, whole 0..Requested) · `Transaction Cost` · `Line Total` — read-only approval evidence, never an Operation price control |
| The decision controls | `Approve` (primary) · `Send back` · `Refuse` · `Decision reason` (required for Send back and Refuse). Requester: `Withdraw request` before decision; `Edit and send again` after return. |
| Purchase Orders expansion heads | The CONFIRMED shared goods composition `☐ · Status · Category · Qty · Item · Ready Stock · Supplier · Supplier Deliver To`, with no checkbox because this Register carries no batch action, and without `PO No` / `PO Default Delivery Date`, which identify the document already open. `Item` carries the SKU on its 11px second line and SKU stays searchable — the confirmed sibling rule. `Unit ID` is absent: one row is one PO line and a line of `Qty 3` carries three Units. **A 2026-09-18 planning round invented a third, shorter column set; that is withdrawn.** `Category`, `Supplier` and `Ready Stock` each print one repeated value on this page and are an owner decision, never a planner's deletion. |
| A parent cell over several values on Purchase Orders | `Multiple` — the same governed word SO Batch and Manual Purchase use. **It applies to `Supplier Deliver To`:** a line may be re-routed away from its document (`purchase_order_lines.destination_id`), so the parent prints one destination only when every line agrees, never the first one it finds. The exact mapping lives in the expansion. |
| The Purchase Orders footer | `{n} purchase orders` · `{n} of {m} purchase orders` · `1 purchase order` — unchanged approved text; no quantity totals. **🟡 Open question, not a correction:** it is lower case while `27 Sales Orders` and `{n} Manual Purchases` are Title Case. A 2026-09-18 planning round changed it unilaterally; that change is withdrawn and the casing is the owner's to settle. |
| The Purchase Orders destination column | `Supplier Deliver To` — the dictionary retired the bare `Deliver To` for this fact on these four pages. The built label is still `Deliver To`; the approved column list (Purchasing §9.3) already carries the corrected word. |
| 🔴 `Supplier Delivery Date changed` — LIVE RETIRED LABEL (measured 2026-09-18) | The Purchase Orders rail's active-condition chip prints `Supplier Delivery Date changed` (`PurchaseOrdersPage.tsx:89`), and `Supplier Delivery Date` is in this file's own retired list for that fact. The governed word is **`Supplier Confirmed Delivery Date changed`**. A dictionary repair, not new copy. |
| Purchase Orders rail rows — PROPOSAL / NOT LAW (2026-09-18) | The complete dictionary names, which already exist in the page as the active-condition chip text: `Supplier has not confirmed the PO date` · `Supplier Confirmed Delivery Date changed` · `Supplier delivery date passed`. They are CONDITIONS that narrow the whole Register — never a column, a display toggle or a stock date. **They overlap, so their counts may never be added together or shown as a Register total;** the footer's single total is the only count of purchase orders. |
| `Sending not confirmed` — what it may and may not claim | The system holds **no send confirmation for this version**. It does NOT say the staff member failed to send (§5.6: missing evidence does not prove no send) and says nothing at all about the supplier. A sent mark is the person's statement of sending, never proof of receipt, reading or acceptance. One shared record: Workspace assigns PO Duty and its cover, `PO sent to supplier` in the one shared communication area writes version, actor, recipient, channel and time, and every Register reads that same record. No page keeps a second confirmation or a second owner list. |
| Purchase Orders group band | `Confirm PO sent to supplier` — CONFIRMED, unchanged (§5.6: a current version without a sent mark has this group and the cell `Sending not confirmed`). A 2026-09-18 planning round proposed renaming it; **that proposal is withdrawn.** The ask was to adjust presentation, not to replace an owner-approved word. |
| Purchase Orders `{n} GRNs` — PROPOSAL / NOT LAW (2026-09-18) | A disclosure opening the receipts beneath that row, one row per receipt: `Goods Received Date` · `GRN No` · `Received Qty`. One purchase order stays one row and no split receipt is hidden. A single GRN keeps its direct link into Receiving. `{n} receipt dates` stays a plain fact and never becomes a second door onto the same list. |
| A Purchase Orders row with several receipts | `{n} receipt dates` — **never one chosen date standing for all of them**, and never a date with the count as a second line. The approved rule is that no single date represents several receipts. |
| 🔴 `GRN No` or `GRN No.` — one fact, two spellings (measured 2026-09-18) | Purchasing §9.4's approved Receiving columns pin `GRN Date` and **`GRN No`**; §9.5's approved Supplier Claims defaults end with **`GRN No.`**. The dictionary owns which one it is; both sections then print that one, and the trailing full stop stops drifting between pages. The same question applies to `Supplier Claim No.` beside `PO No`, `MPR No` and `SO No`, none of which carries one. |
| 🔴 Supplier Claims register order — source read 2026-09-18, production walk OWED | `OperationSupplierClaims.tsx` on `origin/main` leads with `Supplier Claim No.` (89) then `Reported` (90), and places `PO No` (92) and `GRN No.` (93) fourth and fifth. The approved order is `Reported · Supplier Claim No. · Supplier · Product · Variant · Qty · Problem · Supplier Response · Claim status · PO No · GRN No.` — linked documents last. The page also passes neither `leadingColumns` nor `stickyIdentity`, so the approved pinned pair does not apply. **Committed-code evidence, not a statement about the deployed page.** |
| Supplier Claims `Clear filters` | One control, in the toolbar's active-condition bar (`activeConditions`). **Not a permanent row at the bottom of the rail** — a selected facet clears by clicking it again. The same distinction as the 2026-09-18 Receiving correction. |
| `Customer Resolution` · `Carres Execution` | **Not Supplier Claims listing columns**, not even hidden ones offered through the Columns chooser. They live on the claim object. |
| The Purchase Orders lineage heads | `PO No` · `Ordered Qty` · `Still To Order` · `PO Issued` · `PO Default Delivery Date` · `Supplier Confirmed Delivery Date`; supplier answer reads `Not confirmed` · `Same as PO` · the changed date; no lineage reads `Not ordered yet`. **D5 — ONE MEANING PER WORD (Round 2, 2026-09-17):** `PO Issued` here is the CURRENT PO version's marked-sent date and time — the current-version sending evidence retained on the Purchase Orders page — and a version nobody marked reads `Sending not confirmed`. It is never `purchase_orders.placed_at` (the creation time). |
| The History titles (stored facts only) | `Purchase requested` · `Purchase approved` · `Purchase refused` · `Marked not going ahead` · `Purchase order issued` · `Sent back for changes` · `Sent again for approval` · `Withdrawn` — three-rank grammar, grouped `Today · Yesterday · Earlier`; an event with no stored individual reads `Staff identity not recorded`. Rank 3 of a resubmission: `Round {n}` and each change — `{sku} · Qty {old} → {new}` · `{sku} added · Qty {n}` · `{sku} removed` · `Deliver To: {old} → {new}` · `Delivery Date: {old} → {new}` · `What is this for? {new}` · `For changed`. A line removed while editing is stored with the reason `Removed before sending again`. |
| The object's loading / failure states | `Opening the Manual Purchase` · `This Manual Purchase could not be opened` + `Try again` |
| The round refusals — Round 2, two lines, fact then act | `This request was withdrawn.` + `Raise a new request if the goods are still needed.` — `This request was sent back for changes.` + `Wait for the requester to edit it and send it again.` — `Only the person who asked for this purchase may do this.` + `Ask {requester} to do it.` — `This request was not sent back for changes.` + `Reload the Manual Purchase to see where it is now.` — `This request already has a purchase order.` + `Reload the Manual Purchase. It can no longer be withdrawn.` — `The request has no items.` + `Add at least one item, then send it again.` — `The Delivery Date is missing.` + `Pick a Delivery Date, then send it again.` |
| The decision refusals — two lines, fact then act | `Only the approver may decide this purchase.` + `Ask {approver} to approve or refuse it.` — `Nobody holds Purchasing Approver.` + `Set the holder in Workspace → Staff & Duties.` (0533; also the object's approver line when unheld) — `You cannot decide a purchase you raised.` + `Withdraw it if the goods are no longer needed.` (0533, `own_request`) — `This purchase was already decided.` + `Reload the Manual Purchase to see the decision.` — `The decision reason is missing.` + `Type why this purchase is not going ahead.` — `The approved quantity is not valid.` + `Enter a whole number from 0 to {requested quantity}.` — `The decision was not recorded.` + `Reload the Manual Purchase and try once more. Tell IT if it happens again.` |
| Retired from this surface, never to return | the object's own `Issue PO` / `Issue as one PO?` consolidation offer and every other issuance, PO Duty, price-edit or Receive control — PO issuance lives ONLY in the Register's selected action (`Issue PO` beside PO Duty); physical arrival lives only in `Receiving` |


| Manual Purchase purchase-need Status | `Need PO` · `No PO needed`. Known need can read Need PO while Approval Status reads Need approval; buying and saving stock remain disabled until approved. Unknown coverage uses the existing explicit missing-coverage wording. |
| Manual Purchase groups | `Need approval` · `Need PO` · `No PO needed`. Hide an empty historical group, retain/count nonempty history. To buy / No purchase needed are retired on this page only. |
| Manual Purchase goods heads | `Status` · `Category` · `Qty` · `Item` · `Ready Stock` · `Supplier` · `Supplier Deliver To` · `PO No` · `PO Default Delivery Date`; checkbox leads. |
| Manual Purchase stock actions/feedback | `Choose Ready Unit` · `Change selection` · `Save changes` · `Cancel` · `{n} available` · `{n} reserved` · `{n} selected` · `Not saved` · `Stock selection saved.` · `{n} reserved for this MPR`. These are allocation actions, never automatic additional replenishment. |

**Manual Purchase — APPROVED (Jess, 2026-09-16), BUILT in Round 2 (migration 0522).** Every
request requires approval, regardless of purpose or amount; the exemption state and per-purpose
approval configuration are retired.

| Where | Words |
|---|---|
| One-table groups | `Need approval` · `To buy` · `No purchase needed` (closed by default) |
| Waiting group | Pending approval or `Sent back for changes`; `Nothing waiting for approval` when empty |
| Requester withdrawal | `Withdraw request` · `Withdrawn` |
| Return and resubmit | `Send back` · `Sent back for changes` · `Edit and send again` (the form title on the returned request) · `Send again for approval` (its submit) |
| No matches | `No Manual Purchases match these filters` |
| Footer | `{n} Manual Purchases` · `1 Manual Purchase` · `{n} of {m} Manual Purchases` |

Search/filters cover all groups and open a group holding a match. Sent-back requests remain in
`Need approval`; approved positive remainder belongs to `To buy`, including `Not planned`;
ordered/refused/withdrawn or confirmed zero remainder belongs to `No purchase needed` after
those approval checks. Footer totals include collapsed rows. History keeps every return round
and the actor/time for withdrawal and line cancellation.

**The Manual Purchase rail.** Five sections, in this exact order:

| Heading | Rail rows |
|---|---|
| `ORDER TIMING` | `Can order early` · `Order date reached` · `Order date passed` |
| `PURPOSE` | `All purposes` · the six governed purposes |
| `PRODUCT` | `All products` · `Mattress` · `Bedframe` · `Sofa` |
| `SUPPLIER` | `All suppliers` · actual supplier names, alphabetical |
| `SETUP TO FIX` | `Supplier not set` · `Production days not set` · `Transit days not set`; section appears only when affected requests exist |

`WORK TO DO` and `TO ORDER / All not ordered` are retired from this page only. Central Work
still uses its governed action words. Counts are unique requests, cross-computed against the
other selected sections; sections combine with AND. Fact sections are dropdowns; no rail
checkboxes. Product and Supplier retain their Catalog source; fixing setup remains in its
owning Catalog/Settings surface. Timing never grants or removes issue authority.

**The approval owner (Card 03 §3, corrected 2026-09-11).** The OBJECT prints the REAL action owner beside `Waiting for approval` as `{name} approves` —
the resolved `Purchasing Approver` duty holder(s), falling back to `ops_manager` only while
that duty has no active holder (0474); several print `{name} or {name} approves`; a robot or
shared-password login never prints while a named person holds the duty; nothing resolved
prints nothing. The REGISTER row carries the approval fact alone.

**PO REVISIONS — the sent document's version** (CARD-2026-08-19-po-revisions, executing
purchasing/MASTER.md §4's revision rule, Jess 2026-08-18 — *a sent PO is not overwritten, it is
REVISED*; registered on execution so no screen respells them):

| Where | The word |
|---|---|
| The panel title | `PO-2041 · Version 2` — **Version 1 prints nothing**: an unrevised PO is just the PO |
| The door | `Revise` — beside `Print PDF`, an act on the document; only an open PO offers it |
| The form's fields | `Qty` · `Destination` · `Why` |
| The floor, stated inline where it binds | `{n} received` — grey while honoured, red when the draft breaks it |
| Save | `Save Version {n}` — the button names the act's product |
| The disabled Save NAMES its gap (the Receiving button law; first gap wins, the floor first) | `Save — below received` · `Save — nothing changed` · `Save — say why` |
| The unshared version (DERIVED, work to do, never a stage) | `{po} Version {n} has not reached {supplier}` |
| A silent qty / Deliver To edit on a shared PO, refused (the SQL door's own sentence, printed inline) | `A shared PO changes through Revise.` |
| The history row | `Revised to Version {n} — {old → new changes} — {why}` |

`Revision` stays off every screen for the SNAPSHOT store (0317's ruling holds — `Snapshot N` is
the hand-over word); `Version` is the DOCUMENT changing, which is exactly what that ruling
reserved the word for.

**SIXTY-FIVE ACTIONS BECAME TWENTY, AND THAT WAS THE POINT** (Jess, 2026-08-18). A blueprint
draft named 65 distinct pieces of work across the Purchasing surfaces; 49 of them opened with a verb
this portal does not have, and most were ONE act wearing four names — `Share PO PDF` ·
`Share Claim with Supplier` · `Share Return with Supplier` · `Share Repair Order` are one act,
and the act is **`Issue`**, because a document that has not reached its supplier is not issued
yet. The merge is the reason the seven verbs are worth defending: **the count fell by 80% and
nothing was lost.**

**A SHARE IS NOT ITS OWN ACTION — `Issue` ALREADY CARRIES IT** (Jess, 2026-08-18). The row line
has always read `Issue PO to {supplier}`: getting the document to the factory was never a second
act, and a document the factory has not seen is not issued. **`Issue` stays open until an operator
confirms which version went to whom on which channel**, and the button inside the form changes to
`Record what you sent` — a form button, which needs no verb from the table. The same holds for a
consignment order, a purchase return and a repair order. *(A separate `Check what was sent` was
drafted and dropped: `Send` is banned, and stretching `Check` over it would have taught staff that
`Check` means two different jobs.)*

**`Return` HAS NO PURCHASING ENTRY, AND ITS ABSENCE IS RULED** (Jess, 2026-08-18). Bouncing an
incomplete request back to whoever raised it was proposed and refused: a salesperson lives on
the showroom floor, not in a queue, and work handed to them stops moving. **Operations calls
them, gets the answer on the phone, and records it.** The general form — *the portal never waits
on somebody who does not work in it* — binds every module.

**SO-scoped Batch Purchase entrance** (2026-08-10):

| Context | Words |
|---|---|
| Toolbar scope | `Sales Order · SO-{number}` · aria: `Clear Sales Order scope` |
| Unknown SO | `Sales Order not found.` |
| Production-days block | `Set a number before this demand can be issued.` |
| Delivery-date block | `No delivery date — this demand cannot be issued.` |
| Catalog resolution block | `Purchasing cannot resolve this demand from the catalog.` |
| Open-PO cover | `Demand is already covered by an open Purchase Order.` |
| Issued history | `Purchase Order already issued.` |
| No remainder | `Nothing remains to buy for this Sales Order.` |

These are explanations, never actions. They cannot acquire a form or resolve a Purchasing
rule from the Sales Order entrance.

**Governed Issue review** (2026-08-11):

| Context | Words |
|---|---|
| Review title | `Review Purchase Orders` |
| Factory-pickup collection fact | `{partner} collects from {supplier} and delivers to {destination}.` |
| Missing Catalog cost | `{sku} has no transaction cost.` · `Set the cost of {sku} in Catalog.` |
| Missing supplier collection rule | `{supplier} collection is not configured.` · `Set its collector and destination in Purchasing Settings.` |
| Deliver To differs from the governed collection rule | `{supplier} must be collected to {destination}.` · `Set Deliver To to {destination}, then issue again.` — the act names the purchase, not Settings: Settings holds the collection agreement and changes rarely, the purchase is today's work |

Issue review contains no cost editor, `Free of Charge` choice or procurement-partner picker.
Catalog owns normal cost; Purchasing Settings owns supplier collection. The review only states the
resolved collection fact once per governed Issue document.

**THIS TABLE IS THE CANONICAL HOME FOR EVERY PURCHASING ACTION, INCLUDING THE ONES THE ORDERS
LADDER DISPLAYS.** Orders and Purchasing show the same structured action; they never store two
sentences or two completion facts. `Issue PO` is the governed act. The issue surface may prepare a
numbered PDF, but the action stays open until a person marks that exact version as sent
and its recipient/channel/actor/time evidence exists. This is not proof of supplier receipt.

`Send PO`, `Prepare PO` and `Draft PO` remain banned action names. In normal sentences, use the full
object and recipient: `Issue the purchase order to Hooka`. Inside the formal issue surface, the
completion control says `PO sent to supplier`; it records the person's confirmation for the exact
version, not a second business action or proof that the supplier received/read/accepted it.

**RETIRED, and it is not in the table above because it is no longer an action**
(C3, PR #479): the old bare `Confirm` fired when everything was already arranged
and the day had simply not come — the one drawer row no button could close. It is
now a FACT: `Delivering 27 Jul · 9-11 AM` in the drawer, the bare word
`Delivering` in the row, because the Delivery cell beside it already prints the
day.

**FACTS (the delivery column, badges):**

| Ships today | Verdict | Must become |
|---|---|---|
| `confirmed 27 Jul · 9–11 AM` | ✅ keep | — |
| `not confirmed · logistics said 27 Jul` | ✅ keep | — |
| `need booking` | **to-do word in a fact** | the status word `{partner} must contact the customer`, and the Work lines `Call {logistics}` over `Confirm the delivery date` |
| `Unscheduled` | banned (T1) | the same |
| `No logistics` | ✅ keep | (states an absence, no to-do word; the Actions column carries `Assign logistics`) |

**FILTER / STATE words** live in FILTERS only (C-vocab, Jess 2026-07-19) and are nouns,
not actions: `All · Placed · Proceed · Scheduled · Delivered · Owing`. **`Pending` is
banned even as a filter** — pending on what? Rename it to the state it actually selects
when C1 reaches it.

**Adopted from the PORTAL_CORE vocabulary proposal:** the ban on `Chase`, on `At Risk` /
`Attention` / `Pending`, and the rule that a label names measurable work.
**Deliberately NOT adopted:** its ban on the WORD "customer" as a party (when no name is
stored, the role word is the honest answer), and its "Confirm Supplier Stock ETA" phrasing
(our shape puts the party first: `Call Ohana — confirm ready date`).

### Deliver To — the Purchasing destination words (owner correction, 2026-08-14)

`Deliver To` is the short UI label. It names Purchasing's instruction for where the supplier
must send the goods; it never means a Unit's current physical Warehouse location.

| What | The word |
|---|---|
| The UI field/column label in Batch Purchase, Purchase Order and read-only SO goods expansion | **`Deliver To`** |
| The current options | **`Carres Klang`** · **`AL Sungai Buloh`** · **`HOUZS`** · **`Ohana`** |
| Nice Future, which does not deliver | **`NETS collects from Nice Future and delivers to Carres Klang.`** |
| The optional free-text field beside it | **`Delivery instructions`** |
| A destination nobody has given an address for — **Settings only** | **`Address not set`** |

Settings owns the expandable list; these are its exact management words:
`Deliver To` · `Add Deliver To` · `Name` · `Address` · `Available for new POs` · `Default` ·
`Not available for new POs`. A future destination is added here and then appears in every governed
Purchasing picker. No SO Batch Purchase page keeps its own destination list.

The Settings introduction is **`The settings the ordering engine reads. Change one here and SO Batch
Purchase uses it the same day.`** It covers both destination master data and timing rules; do not narrow
it back to numbers only.

**The PO and the external document print the SAVED destination name**, never a re-derived one
and never one of the banned nouns. That is why the name is stored rather than mapped from a
code in the UI: a document a supplier holds must still read the same after somebody renames a
destination on screen.

**`HOUZS` is the option word and it is deliberately shorter than the place.** The warehouse the
business says out loud is "HOUZS Balakong"; Loo ruled the option `HOUZS`. Do not "complete" it
— a chat that helpfully expands it has invented a fourth string.

**`Address not set` is a SETTINGS word and appears nowhere else** (Loo, 2026-07-29). It is a
FACT stating an absence, which the fact/action rule allows, and it carries no to-do word. It
may not leak onto a PO, onto the external document, or into an error a store reads: **a PO may
stay a draft while its external destination has no address, and it may not be issued, exported
or sent until the address is complete** — that refusal is enforced in the database, not by this
string. `Carres Klang` never shows it: its address is derived from the own warehouse record.

### Facet group headings (locked 2026-07-28, after P2-Claims found they had no home)

The facet rail's ORDER is `ui/MASTER.md` §8.4; the WORDS are here. A module picks the
headings it needs from this list and adds none.

| Heading | What sits under it |
|---|---|
| `Queues` | the module's open actions — each row's name IS its action, from the dictionary above |
| `Supplier` · `Logistics` · `Customer` | the outside party |
| `Problem` | what went wrong (claim type, delay reason, issue type) |
| `Stock` · `Region` · `Category` · `Store` | facts about the record |
| `Due` | when it turns late |
| `Calls` | who to ring, planned on a rolling calendar — `Overdue` · day rows · `Later` (Loo, 2026-08-06, the Purchase Orders CALLS calendar; the same noun the Orders drawer's who-to-ring panel already carries below) |

**The rail calendar's own three words** (Loo, 2026-08-06 — the Purchasing MASTER §2.4 rulings,
recorded here so the dictionary holds them too):

- **A day row prints WEEKDAY + DATE — `Thu 6 Aug` — one format on every row.** Never a bare
  weekday (`Monday` is ambiguous — which Monday?), never `Today` / `Tomorrow`. The full date
  stays on hover. *(This row used to carve out an exception — "the Delivery calendar's three
  VIEWS keep their own ruled names, a view is not a day row." **The owner deleted that
  exception on 2026-08-15**; see the generalised ruling below.)*
- **`Overdue`** — red, above the day rows, rendered only above zero.
- **`Later`** — everything beyond a rolling window. Never `Next Week`, which starts lying on
  Thursday. Never `Upcoming` · `Future` · `Beyond`.

**A heading is a NOUN and never an action** — `Queues` holds actions, it is not one.
A group with one row still gets its heading: a lone unlabelled row reads as a stray.

**Only a fact may be a filter** (the UI type dictionary above), so every heading except
`Queues` names a fact. That is also why there is no `Status` heading — status is the pill on
the row, and a facet filtering by it would compete with the queue rows for the same job.

**Need one that is not here?** It is a word, so it is a decision — ask, do not invent. This
table exists because three headings shipped on a real screen with nothing to check them
against.

### The verb dictionary — portal-wide (locked 2026-07-27)

**NINE verbs, nine meanings. Every module uses these; no module invents a tenth.**

*(It was five until 2026-07-28. `Return` was added by Loo's ruling because R6 needed a word
for "this record goes back to whoever produced it" and reached for `Send back`. **`Prepare`
was added 2026-07-29 and RETIRED 2026-07-30** with the Purchasing clean restart: raising a
purchase order is one act again, so the verb has no object left. **`Check` was added by Loo
on 2026-08-05** — see the row below and the note under the table. **The bar for an eighth is
the bar `Return` cleared: no existing verb fits, and the alternative is a module inventing
its own.** **`Approve` and `Decide` were added by Jess on 2026-08-18 against that same bar,
and the reasoning is recorded because it is the test the next one must pass.** Approving a
purchase is not `Check` — nothing is missing that could be found out; somebody must PERMIT it.
Choosing what a customer gets is not `Assign` either: **`Assign logistics` reads clearly
because a party is being attached to a record, and staff already read the word that way — a
decision between four outcomes attached to nobody is a different act, and one word carrying
both is how a screen stops being readable.**)*

**They govern WORKLIST ACTIONS, not form buttons.** A button inside a form that stores what
you just typed is `Save`, and one that abandons it is `Cancel` — those are not actions, they
never appear in a queue, and they need no verb from this table.

#### The line-list controls (Loo, 2026-08-05, card P19)

**A form whose body is a LIST OF LINES needs two more controls, and they are form buttons by
the rule directly above — they take no verb from the table and they never appear in a queue.**
They are ruled here anyway, because this document's own law is that a word on a screen has an
entry, and both were live on Carres screens for months with none.

| Concept | Canonical word | Do NOT use |
|---|---|---|
| Add one more line to the list being typed | **`Add line`** (rendered `+ Add line`) | Add line item · Add item · Add row · New line · Insert · `+` alone |
| Take a line back out, before it is submitted | **`Remove`** | Delete · Remove line · Clear · Discard · `×` alone |

**Loo chose from three candidates with their costs attached**, and the two he did not choose
are recorded because each was already on a real screen and a later chat will find them:
the Sales Portal's New Sales Order — the form the P19 comparison was made against — spells the
same pair `Add line item` / `Remove line`, and `Add item` was the third. He ruled `Add line` /
`Remove`, so **the Sales Portal is now the screen that disagrees with the dictionary**, and
changing it is that lane's card, not a tidy-up anyone may do in passing.

**`Remove` is deliberately NOT `Delete`.** Nothing has been stored yet: the row is typing, and
`Delete` names the destruction of a record. Once a line HAS been created the control is gone
altogether — a created line reads `Created`, because a form that offers to remove a record it
cannot un-make is lying about what the press does.

**Neither word may be reused for a worklist action.** `Remove` here is a form control on an
unsaved row; taking a line off a purchase order that exists is a different act and gets its own
entry, exactly as `Cancel`-the-action and `Cancel`-the-form-button are two entries in the
Purchasing mirror.

**The CHANNEL is not the action.** `Call {supplier} — confirm what happens next` is the same
action whether it is done by phone, by WhatsApp or in person: outward communication whose
outcome is recorded. A button that opens WhatsApp or copies the message is HOW,
not WHAT — never a second action.
**`Send` IS RETIRED AS AN ACTION VERB (2026-07-29, P6) AND STAYS BANNED FROM REUSE.** It was
pinned to raising a purchase order to a factory; the frozen lifecycle replaced that single
act with **`Issue PO`**, so **no action in the portal is named `Send`
any more.** The pin does not lift with it: `Send` may still never be reused for "this message
leaves our company" (rule 8), for returning a record (`Return`), or for anything else. A word
with no owner is not a free word — it is a word one module is about to claim.

#### The WhatsApp button — the label says which door it opens (Loo, 2026-07-28)

**The word follows the BEHAVIOUR, not the other way round.** There are two doors and they are
not the same thing, so they do not share a label:

| What the button actually opens | The label |
|---|---|
| a `wa.me/{phone}` chat with ONE named party | **`Open WhatsApp`** |
| the supplier's saved WhatsApp GROUP link | **`Open WhatsApp group`** |
| nothing — it puts the message on the clipboard | **`Copy message`** |

**Why this needed ruling rather than reuse.** The table above used to give only
`Open WhatsApp group`, and R8 stopped on it (2026-07-28) rather than applying it: the To Order
button opens a **direct chat** when the factory has a contact number and only falls back to the
group, so `group` would have been a word that is false about half the time. A label that names
a door the click does not open is worse than a vague one — the operator learns to stop reading
it.

**This rules ONE button label and changes no other WhatsApp wording** (Loo's scope). The
message TEMPLATES, the group-link field, `whatsapp_group_url` and every existing sentence
about WhatsApp stay exactly as they are.

**A button whose behaviour is conditional takes the label of the door it will actually open**,
resolved at render time from what is on file — never a third blended word covering both.

| Verb | Means | Completion is |
|---|---|---|
| **Assign** | an INTERNAL decision — we choose who | the object is chosen. **Never** "the other side accepted" — acceptance is a later, separate action |
| **Call** | OUTWARD communication — we ask someone for information | the information is obtained **and recorded in the system**. A call with nothing recorded is not complete |
| **Issue** | the SYSTEM produces a formal document | the document exists |
| **Upload** | evidence is attached | the file exists |
| **Close** | a case or claim is finished and its record is sealed | the record can no longer change |
| **Return** | a record goes BACK to the party that produced it, for them to act on | the record is with them **and its state says so on their screen** |
| **Check** | a fact the business needs is MISSING, and somebody must establish it — by any means | the fact is **recorded in the system**. Finding out and not writing it down completes nothing |
| **Approve** | a person with the authority permits **a purchase nobody's customer ordered** | the answer is recorded, yes or no — and a `Refuse` carries a reason that goes back to whoever asked. **The label always names WHAT is approved; a bare `Approve` is not a label** |
| **Decide** | Carres CHOOSES between several outcomes that all exist — nothing is being found out, and nobody outside is being asked | the choice is recorded |

### `Check` vs `Call`, and `Check` vs `Check in` (Loo, 2026-08-05)

**Added on his ruling, after he read the alternative and chose this word anyway.** The
conflict was reported to him and is recorded here rather than re-argued.

| | It names | Example |
|---|---|---|
| **`Call`** | going OUTWARD to a NAMED party for something only they can tell us | `Call {supplier} — confirm tomorrow's delivery` |
| **`Check`** | a fact that is simply ABSENT. The source is not part of the action, and may be an email already sitting in the inbox, a portal, or a phone call | `Check Expected Arrival` |
| **`Check in`** | goods have physically arrived and are being counted. A two-word phrase with its own dictionary row, and an act on GOODS rather than on a fact | `Check in from {supplier}` |

**The distinction that keeps them apart is the OBJECT.** `Check` takes a missing FACT;
`Check in` takes arriving GOODS. A reader who meets both on the Purchasing module reads two
different objects, which is the same test the `GRN` / `Check in` document-act split already
passed on 2026-07-28.

**Why `Call` was not stretched to cover it:** on 16 of 21 live purchase orders nobody has said
anything at all, so there is no promise to confirm and no named party who is known to hold the
answer. `Confirm` presumes something was said; `Call` presumes we know whom to ask.

Examples: `Assign logistics` · `Assign PIC` · `Assign warehouse picker` ·
`Call {supplier} — confirm ready date` · the Delivery pairs `Call {logistics}` over `Confirm the
delivery date` · `Call {logistics}` over `Confirm the delivery time` · `Call {logistics}` over
`Arrange a new delivery date` ·
`Issue invoice` · `Issue credit note` ·
`Upload delivery photo` · `Upload payment proof` · `Return count to Carres` ·
`Return count to {warehouse}`.

### The warehouse count words (Loo, 2026-07-28)

**One verb, two directions, and the party is always named.** `Send back` is retired: `Send`
is pinned to raising a purchase order to a factory and is never reused (rule 8).

| Who does it | Queue tile | Row line | Button | Done message | Empty state |
|---|---|---|---|---|---|
| the warehouse files its count | `Return count` | `Return count to Carres` | `Return count to Carres` | `Count returned to Carres` | `Nothing counted and waiting.` |
| Carres sends it back to be redone | `Return count` | `Return count to {warehouse}` | `Return count to {warehouse}` | `Count returned to {warehouse}` | `No count is waiting for a check.` |

The queue word is the same for both because a queue holds many and names no party — which is
the dictionary's own rule, and here it is load-bearing rather than incidental: the two rows
are the same act seen from the two ends.

**This replaces R6's `Save count` on the warehouse form, and that is deliberate.** The form
law says a button that merely stores what you typed is `Save` — but this one does not merely
store: it hands the count to Carres and the state becomes `Waiting Carres check`. A button
that changes whose problem something is has never been a `Save`.

**These four strings cover the WAREHOUSE RECEIPT and nothing else** (Loo, 2026-07-28). See the
rule directly below — a different business line does not inherit them by looking similar.

### One business, one dictionary (Loo, 2026-07-28)

**A shared SHAPE is not a shared WORD.** Ready Stock's plan review also has a button that
sends a record back to whoever produced it (`OperationStockPlan.tsx`). It is the same shape as
the warehouse count and it does NOT get `Return count to …`, and it does not get renamed as a
side effect of the receiving line's sweep: **a plan is not a count, and Ready Stock must
define its own flow and its own dictionary rows first.**

**This does not weaken rule 8, it says where rule 8 applies.** Rule 8 is *one business fact,
one word, everywhere it appears* — `Confirm ready date` reads the same on Orders and on
Purchasing because it is the same fact. It was never *"two actions that look alike must share
a label"*, and reading it that way is how a word gets stretched over a second business until
it means neither.

**The test, in one question:** would a new hire doing BOTH jobs be surprised that the two
screens use one word? If the objects differ — a count of goods vs a proposal about stock —
they would, and the word is wrong however similar the click feels.

**So the sequence is fixed:** the module writes its flow → the flow names its actions → those
actions get their five strings here → only then does a screen change. A rename that arrives
before the flow is a chat guessing on behalf of a business line that has not spoken.

**Consequence of the Issue rule:** the SYSTEM writes the document AND triggers the act (Jess
2026-08-16, overwriting the 2026-07-27 press-the-button half): the moment the governed gate is
met — customer date confirmed, goods ready, money in full — the document exists, ready to hand
to logistics, with no button pressed anywhere. The one governed manual door is `Request
Delivery Order` (the outstation trip's door, same path, same gates). Nobody ever authors a delivery
order by hand.

### Sales Order read-only evidence states

| Meaning | Use exactly | Boundary |
|---|---|---|
| Successfully read an empty payment transaction list | `No payment transactions to show` | Does not claim that `Paid` is zero or that an older order never recorded money. |
| Paid summary without transaction history | `The order records a paid amount. Individual payment transactions are not available.` | Preserve saved customer payment evidence without manufacturing a receipt. |
| Payment evidence with zero paid | `Payment evidence is saved, but the recorded paid amount is zero. Check this order in Payments.` | Flag the inconsistent records; never infer an amount from a reference or attached file. |
| Historical fulfilment evidence absent | `Not recorded in this revision` | Current Unit/destination facts must not be attached by row position to an older agreement. |
| Saved payment capture on the order | `Payment details recorded at sale` | Method, recorded instalment months, reference and slip only; not a synthesized transaction. |
| Goods evidence read failed | `The goods could not be opened.` | Never show an allocation shortage or missing destination as the result of a failed read. |

### The On hand Category filter words (card 2026-08-19)

The `Category` heading itself is already governed above (*facts about the record*). These are
the pill words underneath it on On hand's left rail. **The category is the CATALOG's answer**
(ERP-ARCHITECTURE §3.1 · D9) — no screen derives one from a SKU string, so every word here is
either a catalog value or the honest admission that there is none.

| Meaning | Use exactly | Do NOT use |
|---|---|---|
| No category filter applied | **`Any`** | `All` — this rail already spends `All` on the Status bucket list, where it names a bucket. Two `All` pills stacked in one rail ask *"all of what?"* |
| The catalog's own six values | **`Mattress` · `Bedframe` · `Sofa` · `Accessory` · `Service` · `Guarantee`**, in that order | count order · alphabetical order · any raw SKU word |
| The SKU has no catalog row | **`Not in catalog`** | `No catalog match` · `Unknown` · `Uncategorised` · `Other` · `Other goods` — and above all never folded into `Accessory` |

**Why `Not in catalog` and not `No catalog match`.** *Match* names the lookup the system just
performed; this rail states a fact about the GOODS. It is the same shape as the two facts this
dictionary already rules — **`Supplier not assigned`** and **`Address not given yet`** — and the
same reason `Invalid SKU` and `Supplier error` are banned there: a screen reports what is true of
the record, never what the query did.

**It is display, never a worklist.** 87 of 136 live records (975 units) sit in this bucket, and
they are free-text import SKUs. Every live row today is TEST data (Constitution §6), so the
number is honest reporting — it raises no alert, and it is never a cleanup or backfill queue.

**`Other goods` is NOT the fallback here.** That word is ruled for the Sales Order footer's
category tally, where a line is known goods that simply has no tally word of its own. *We do not
know what this is* is a different fact, and borrowing the word would hide 975 unknown units
under a confident one.

### The Receiving Workspace's own words (Owner-corrected 2026-08-29)

**OWNER CORRECTION 2026-08-29.** The table below keeps the governed workspace/action words but its
former `Received · Outstanding` summary is superseded. Receiving now keeps these quantity facts
separate: `Order Qty` · `Received Qty` · `Damaged Qty` · `Wrong Item Qty` ·
`Pending Delivery Qty`. Damaged, wrong and extra goods never reduce `Pending Delivery Qty` and
never create available stock. `Accepted` / `Rejected` are not default Register quantity columns.

`Check in` above is the ACT and stays the queue word. These are the words the
Office Receiving Workspace puts on screen while performing it — they name
sections, fields and the state of the Save button, so they are not actions and
do not take the five-string shape.

| Word | Where | Why this word |
|---|---|---|
| `Receiving Summary` | workspace section | **Never `Progress`** (Jess): the section answers *what has this PO taken in*, a count, not a stage. |
| `Order Qty` · `Received Qty` · `Damaged Qty` · `Wrong Item Qty` · `Pending Delivery Qty` | receiving quantities | Each fact prints its own number. The operator never subtracts to learn what is still due; damaged, wrong and extra goods never reduce Pending Delivery Qty or create available Stock. |
| `Start Receiving` | primary action | A PRIMARY ACTION, never a section — the operator's whole job here is one press. |
| `Receiving Details` | the strip Receiving Mode adds | What this delivery was, as opposed to what was on it. |
| `Goods Received Date` | field | The Business Date Dictionary's own word — the physical arrival date and time, which is not when the goods were keyed in. Owner correction 2026-09-06: the retired spelling `Goods Received At` may not appear on any Receiving surface, filter, table, export, GRN or report. |
| `Supplier DO No.` | field | **Theirs, not ours.** It has no default and no suggestion; a number we invent is a reference the supplier never issued. |
| `Signed DO photo` | field | The evidence, named by what it is a photo OF. |
| `Received Qty` | per-line physical count | What physically arrived in this receiving session; it is distinct from damaged and wrong quantities. |
| `What kind of wrong?` | per-line picker | Plain words. The claim needs the kind before it can be filed. |
| `Save Receiving` | the Save button, when nothing is missing | |
| `Prefilled results are not confirmed. Check the goods before saving.` | active receiving form | Proposed input is not proof of physical verification; owner-approved operator-flow review, 2026-09-16. |
| `Receiving results confirmed. Not saved yet.` | confirmed receiving draft | Explicit review is distinct from saved receipt/GRN. |
| `Proposed results · not saved` | live Receiving Summary | These quantities describe the draft, not a completed receipt. |
| `I checked the goods and confirm these receiving results.` | receiving confirmation | Confirmation belongs to the exact draft, including evidence; changing the draft requires confirmation again. |
| `Save — confirm receiving results` | save blocker | Names the missing verification once other required facts are present. |
| `Save — {what is missing}` | the Save button otherwise | The button NAMES the gap: `Save — add a DO number` · `Save — upload signed DO` · `Save — count at least one unit`. A grey button that will not say why is a puzzle. |
| `Pending Delivery Qty after save: {n}` | beside Save | Quiet, never a popup: a short receipt is normal, the number stays on the source PO, and routine confirms train people to click OK. |
| `No receiving activity yet.` | Activity empty state | **Never `Nothing received yet`** (Jess, 2026-08-03) — that reads as *the goods have not come*, which is a different fact and usually a false one. What is empty is the RECORD. |
| `Open in Claims` | Exceptions section | A DOOR, never a form. The claim already exists; the receive that recorded the problem opened it. |

**OWNER INSTRUCTION 2026-09-04 — the Receiving & GRN completion words.** These joined the
dictionary with the approved Receiving build; each is registered here so no chat re-invents it:

| Word | Where | Why this word |
|---|---|---|
| `Goods arrived at` | Receiving Details field · Register column · rail heading `GOODS ARRIVED AT` | Where the goods PHYSICALLY arrived — a warehouse, showroom or any other real site, never assumed to be a warehouse. It never overwrites `Supplier Deliver To` (where the PO instructed the supplier to deliver; `Deliver To` on other surfaces) — the instruction and the physical truth are two facts, both preserved. **Owner correction 2026-09-06:** the retired labels `Actual Site`, `Delivery Location` and `Goods Received At` may not appear on Receiving surfaces; `Delivery Location` stays reserved for the CUSTOMER's delivery address. |
| `Extra Qty` | Receiving Summary · Register column | Goods that were not on the source PO/CO, recorded SEPARATELY. Extra goods never enter Inventory and never alter ordered/pending-delivery arithmetic. |
| `Extra goods` | session section | The section that records `Extra Qty` lines. First check whether the goods belong to another PO or CO. |
| `Arrival evidence` | Receiving Details field | Photo AND video of the physical arrival — beside, never instead of, the `Signed DO photo`. |
| `Received` · `Received with issue` · `Not received` | per-Unit outcome | The three physical results for a governed expected Unit (ERP-ARCHITECTURE §3.4, owner ruling 2026-09-01). `Received with issue` is a SUBSET of received — never counted twice. `Expected Units = Received Units + Not received Units`. (`Not received yet` stays the Route phrase for a PO-level absence; this row is the per-Unit outcome word.) |
| `Amend Receiving` | the posted GRN's correction door | A posted GRN has no ordinary Edit. The original is preserved; the correction carries its reason, before/after, and an append-only `amended` event. |
| `Void Receiving` | the GRN object's `More ▾` menu | Only for a GRN that should never have existed — not a normal primary action (owner correction 2026-09-06). Distinct from an order's `Cancel`: the record and its evidence survive; the consequences reverse, or the door refuses with the exact downstream blocker. |
| `Cancelled` | GRN document status — shown only under the GRN No of a cancelled GRN, the object pill and the GRN paper | **Owner ruling 2026-09-17 (APPROVED / NOT BUILT):** a normal GRN shows no status label; `Valid` and the Status column are retired. `Posted` and `Voided` remain internal database statuses and never reach a normal user's screen. A cancelled GRN keeps its number and prints `CANCELLED` on the document. |
| `GRN date` · `Received with` · `Damaged goods` · `Wrong items` · `Extra goods` · `Goods arrived at` · `Cancelled GRNs` · `Choose dates…` · `{d} – {d} {Mon}` | Receiving rail (owner ruling 2026-09-17, APPROVED / NOT BUILT) | The month calendar is retired from Receiving. `GRN date` is the GRN creation date; the arrow expands a week into days without filtering; pressing a week, month or day filters. No explanatory sentences in the rail. |
| `Someone changed this GRN. Check it again.` · `Reserved for {SO No}` · `On {DO No}` · `Delivered` · `cannot change` · `Time not recorded` | Amend Receiving (owner ruling 2026-09-17, APPROVED / NOT BUILT) | Named-Unit amend refusals and the unknown-time state of an older GRN. |
| `GOODS RECEIVED NOTE` | the formal GRN document's title | The A4 document (SO-PDF-STANDARD chrome, money-free). A GRN number without this formal document is not sufficient. |
| `No GRN yet` | `Reports → Receiving & Inbound` cell for an unposted session | The formal GRN exists only from the posted session (purchasing/MASTER.md §7.3) — an honest absence, never `—`. The GRN REGISTER never needs it: a Register row exists only once the GRN does (owner correction 2026-09-06). |
| `Find PO or CO` | the Start Receiving entrance | Receiving starts from the exact source. The search is CONTROLLED: an unknown delivery may record evidence but never invents a supplier, an order, a Session, a GRN or Inventory. |
| `Only GRN duty may save a receiving.` | the refused act | The page states the same rule the SQL door holds (0425/0426): GRN Duty, its dated cover, or an Operations Superuser. |
| `Staff & Duties` | Workspace rail row + page | The ONE company-wide assignment surface (Law F.1). A module names the duty it needs; it never keeps a second assignment list. |
| `GRN Duty` | duty label | The receiving duty's name everywhere — pages, history, work rows. |
| `Nobody holds GRN Duty.` | Staff & Duties resolution · unassigned states | The honest unassigned answer (owner correction 2026-09-04): no rota recommendation is ever shown as if it were an assignment. Protected posting refuses until the manager assigns. |
| `{acting} covering for {holder}` | duty resolution while a cover runs | Both names, both facts — the cover never erases the normal holder. |
| `Duty assignments are set by the manager.` | Staff & Duties, non-manager view | The page states the same gate the SQL door holds; it never offers a control the server would refuse. |
| `Receiving & Inbound` | Reports destination (PurchasingTabs `receiving-report`) | The central receiving report: every non-draft session with its GRN, plus `Still owed by suppliers`. |
| `Still owed by suppliers` | the report's pending section | Open PO quantities not yet received — supplier debt in goods, not a queue. |
| `No supplier yet` | report cell for a missing supplier | An honest absence, never `—` and never a raw id. |
| `SO No / MPR No / CO No / RO No` · `PO No` | GRN Register columns (owner ruling 2026-09-18; overwrites the single `PO/CO No` column) | The first shows the receipt's actual linked document numbers — the SO No, the MPR No, the CO No or the RO No (repair returns come back through Receiving) — blank when none. `PO No` is its own column, blank for a CO or RO receipt with no PO. The one Receiving engine serves all of them. |
| `Supplier Confirmed Delivery Date` | GRN Register column | The SAME governed word as the Purchase Orders register (the evidenced supplier answer — see the Purchasing date dictionary). `Not confirmed` while no evidenced reply exists. |
| 🔴 Retired words in the Receiving Register's SOURCE — source read 2026-09-18, production walk OWED | `OperationReceiving.tsx` on `origin/main` renders `Supplier Delivery Date` (234), `Goods received on` (263), `Deliver To` (335), `Product` (308) and a `Status` column (386). The governed replacements are `Supplier Confirmed Delivery Date`, `Goods Received Date`, `Supplier Deliver To`, `Items`, and no status label on a normal GRN with `Cancelled` under its `GRN No`. All five are dictionary repairs, not new copy. **This is committed-code evidence, not a statement about the deployed page;** only a signed-in walk makes it a production finding. |
| Receiving `Clear filters` — two places, not one answer | **No permanent button in the rail:** a selected facet clears by clicking it again. **The toolbar's active-condition clearing is kept**, per the shared listing standard, while search, rail or header filters narrow the list. Never record this as Receiving keeping or losing `Clear filters` as a whole. |
| Receiving goods expansion — APPROVED (Jess, 2026-09-18) | `Category` · `Supplier` · `Supplier Deliver To` · `PO No / Ref No` with the actual line-bound `Unit ID`s beneath it in the same cell · `Items` (configuration beneath the name) · `Received Qty` · `Damaged Qty` · `Wrong Item Qty` · `Extra Qty`. Read-only expansion of a saved GRN, never a purchasing selector: no `Ready Stock`, no checkbox, no reservation control. Counted goods keep their governed absence of a Unit ID. Every quantity reads the same fact source the formal GRN prints — no second arithmetic, no netting, extra goods separate from the ordered lines. |
| Receiving rail counts | Counts of **GRN records** — never units, never product quantities, never outstanding work. A GRN with two exception types appears under both `Received with` rows, so those counts overlap and are never added into a total. Opening Receiving needs no date choice; date filtering is optional and nothing is preselected. |
| `Items` | GRN Register column (owner ruling 2026-09-18; was `Product`) | The GRN paper's own line words (`product_skus.variant`, else the SKU) — the register speaks the document, never a second product spelling. |
| `Showing {from}–{to} of {total}` | GRN Register footer | Server-side pagination speaks for the WHOLE filtered result set (owner correction 2026-09-06, second ruling) — never `{n} loaded` over an unknown remainder. |
| `Previous` · `Next` | GRN Register footer page moves | One server page back / forward; disabled at the ends rather than hidden. |
| `{date} — {n} expected supplier arrival(s)` | the rail Calendar day's aria sentence | The marker COUNT said in words — colour is never the only signal (owner correction 2026-09-06, second ruling). |

### Supplier Claim decision words — owner boundary confirmed 2026-09-14

`docs/purchasing/MASTER.md` §7.3 and §9.5 own the stock-claim flow. A Supplier Claim starts
from Stock/PO/receiving evidence, not a customer complaint or Service Case. The official
Purchasing destination remains `Supplier Claims`; this boundary does not rename it.

Keep these facts separate:

```text
Stock / Receiving Problem → Supplier Response → Authorised Stock-Claim Decision → Execution
```

| Word | Where | Meaning |
|---|---|---|
| `The Item` | Claim summary | Affected item, Unit where applicable, supplier and source PO/receipt |
| `Supplier Response` | Claim communication | What the supplier actually answered; not Carres approval or completion |
| `Authorised Outcome` | Claim decision | The permitted stock-claim result, with approver and reason |
| `Item Outcome` | Claim execution summary | Actual goods result read from the owning Stock/receipt/return/repair record |
| `Work` | Claim action context | Outstanding fact, resolved action owner and actual date |
| `Recorded {date}` | Saved evidence/decision | When that fact was recorded; not proof that the goods moved |
| `Close claim` | Claim action | Available only when the required stock-claim outcomes and evidence are complete |

`Customer Resolution` and `What are we doing for the customer?` do not introduce a Purchasing
picker. Customer remedies belong to Service Case. If a related customer case is
shown, its outcome is read-only with a link to Service; no customer case is required to operate a
stock claim.

`Repair` in a supplier reply is an offer. An authorised repair decision is permission to execute.
A repair completes only when the original Unit has been repaired, received back and inspected.
Neither the offer nor the decision means completion. A replacement physical Unit has its own ID.

`Put back in stock`, `Returned to supplier` and `Written off`, where used as historical result
labels, describe physical facts; they are
not shortcuts to perform those acts from the Claim. Stock's governed availability, handover and
disposal rules determine the actual result.

Physical return and financial recovery are separate. `Collected` describes evidenced handover;
required `Credit Note`/`Debit Note` evidence comes from Finance. A generic `Refund` choice must
not conflate customer refund, supplier credit and supplier cash settlement. Payment owns customer
refunds; Finance owns supplier financial processing.

A Claim's internal decision state uses the approved Purchasing wording `Carres decision missing`. It must not imply
a mandatory customer Case owner. `Return` as a document-routing verb remains distinct from
`Return to supplier` as a goods decision.

**Execution ownership — APPROVED / NOT BUILT, Jess 2026-09-18.** These existing words keep their
meanings; their edit surface follows the customer/supplier boundary. No new synonym is introduced.

| Existing option | Owning decision | Definition |
|---|---|---|
| `Return to Supplier` | Purchasing supplier-side execution | The item goes back to the supplier. Nothing goes to the customer. |
| `Collect Defective Item` | Service Case customer arrangement | Carres collects the item from the customer. Nothing goes out. |
| `Replace First` | Service Case customer arrangement | The new item goes out BEFORE the old one is collected. |
| `Collect First` | Service Case customer arrangement | The old item comes back BEFORE the new one goes out. |
| `Exchange on Collection` | Service Case customer arrangement | Both change hands in one visit. |

`Carres Execution` on Supplier Claim is a read-only supplier execution summary with owning document
links, not a customer movement picker or a default listing column. Historical values remain
readable with their recorded provenance. Customer arrangement lives in the linked Case; no Case
is fabricated merely to hold an old value. Stock/Delivery/Finance consequences follow Purchasing
§9.5 and Service §1.1; choosing a word is not proof of physical movement, approval or payment.
Supplier replacement and customer replacement are separate legs, not matched dropdown pairs.

Supplier Claims default heads: `Reported` · `Supplier Claim No.` · `Supplier` · `PO No` · `GRN No.` ·
`Product` · `Variant` · `Qty` · `Problem` · `Supplier Response` · `Claim status`.
`Reported` means stored report date/time, displayed in Malaysia time, not discovery/issue/closure.
Rail heads: `Supplier` · `Problem` · `Claim status` · `Supplier Response`.
`Late delivery` remains readable for historical records only; passing time never creates a new Claim.
Missing source/evidence is retained in detail and Work, not presented as proof from a PO ID alone.

**Supplier Claims words — APPROVED (Jess, 2026-09-18) · NOT BUILT.** The page that uses them is
APPROVED / NOT BUILT (Purchasing MASTER §9.5, owner review 2026-09-18).

| Where | Exact wording | Meaning |
|---|---|---|
| Claim object, action that opens the 50/50 pack | `Prepare supplier claim` | Prepare the claim content and its document. Preparing, copying or opening WhatsApp is not sending |
| Claim pack, confirmation after staff actually sent it | `Claim sent to supplier` | Staff confirm a real send. It records the pack version, channel, recipient, actor and time. It never claims the supplier received, read or accepted it |
| Supplier Claims register, read failure (the grid keeps its toolbar) | `Supplier Claims could not be loaded` + `Try again` | The read failed; never shown as zero claims |
| Supplier Claims register, nothing recorded yet | `No Supplier Claims yet.` | True empty; never shown for a read failure |
| Supplier Claims register, filters leave no rows | `No Supplier Claims match these filters` | Filtered empty; `Clear filters` restores the set |
| Supplier Claims footer | `{N} Supplier Claims` · `1 Supplier Claim` · `{n} of {N} Supplier Claims` | Claim count only; no quantity total |
| History identity of a fact the system itself wrote | `Recorded automatically` | Only for a record CONFIRMED as system-written (for example by the retired late-delivery sweep). Never inferred merely because no staff name is stored; an unknown individual stays `Staff identity not recorded` |

<a id="purchasing-ui-dictionary"></a>
### Purchasing UI dictionary — APPROVED / NOT BUILT (Jess, 2026-09-18)

This is the single naming reference for SO Batch Purchase, Manual Purchase, Purchase Orders and
Receiving, including the same facts in details and exports. Every future task reads this section
and Purchasing MASTER §9.1–§9.4 before changing these surfaces. Exact column orders live there;
never substitute a generic identity/customer/items ordering rule. Other modules keep their own
approved column composition; when presenting these same purchasing facts, use these exact labels.
No new document or duplicated dictionary is required. Code may lag; approval is not build proof.

| Exact label | Meaning / boundary |
|---|---|
| `PO Safety Days` | Working-day margin remaining if the outstanding demand were ordered today, after supplier production and transit, relative to the applicable required date. Not the Order By date, not always 14, not days since creation. Use the one server calendar/planning engine. Parent shows the tightest outstanding line; none remaining is blank. Unknown setup/coverage is never 0. SO keeps its governed 14-working-day planning reserve. Manual Purchase also shows margin against its actual required arrival date; this does NOT approve adding a fixed 14-day reserve or relabelling its internal date as a customer promise. Validate the projection against the existing engine before build. |
| `Customer Requested Delivery Date` | Actual customer's requested delivery date. No customer link means no invented date; never substitute Manual Purchase's internal required-arrival date. |
| `Customer Delivery Location` | Actual customer's delivery address. Never substitute a warehouse or supplier destination. |
| `Customer` | Actual linked customer, never Requested By. |
| `Requested By` | Person who raised the Manual Purchase, not the buyer or customer. |
| `Supplier Deliver To` | Destination instructed to the supplier; distinct from customer delivery address and actual arrival site. Replaces Deliver To for this fact on the four reviewed pages. |
| `PO Default Delivery Date` | Original planned delivery date recorded on the PO using governed lead settings. A date, not a supplier's number of lead days. Preserved when the supplier replies or Settings later change. Replaces PO Delivery Date. |
| `Supplier Confirmed Delivery Date` | Evidenced supplier-confirmed date. Missing confirmation reads `Not confirmed`; do not fill with the PO default. Replaces Supplier Delivery Date. |
| `Goods Received Date` | Actual goods-arrival date AND time, displayed in Asia/Kuala_Lumpur; never GRN creation, expected arrival or save time. Replaces Goods received on. Old date-only records retain the date plus `Time not recorded`. |
| `{n} receipt dates` | Multiple physical receipts on a PO; each GRN/date/time/quantity remains accessible. Never show one latest date as if all goods arrived then. |
| `Goods arrived at` | Actual receiving location, including warehouse, showroom or other actual site. |
| `Items` | Recorded goods summary; expansion preserves all items and their exact references. |
| `SO No / MPR No` | PO combined-reference header (owner ruling 2026-09-18: no `CO No` — consignment marking is not a CO link; the header changes only by a deliberate Blueprint update); actual linked references only, not invented mandatory relationships. |
| `SO No / MPR No / CO No / RO No` | GRN combined-reference header. PO No remains separate. Preserve multiple references and per-line attribution; do not select one arbitrary source. |
| `MPR No` | Manual Purchase Request number `MPR-YYYYMMDD-RRRR` (owner ruling 2026-09-18): each Manual Purchase request has one; CO, RO and other documents keep their own numbers. `MPR` = Manual Purchase Request. Never `MP` (Mattress Protector SKU code) and never `Manual Purchase No.` |
| `Damaged Qty` · `Wrong Item Qty` · `Extra Qty` | Separate existing receipt-result quantities; this naming does not change receipt arithmetic. |

Retired labels for these same facts: `PO Delivery Date`, `Supplier Delivery Date`, `Goods received on`.
`Order By` remains an internal planning/detail fact, not the SO Batch/Manual Purchase parent column.
`Expected Delivery Date` no longer merges default and confirmed dates in the PO register.

### Every listing, same order and words — OWNER RULING (Jess, 2026-09-18)

All listings read date → number → customer or supplier → goods → quantity → other facts → linked
documents, with the same column words: Sales Orders now uses `Customer Requested Delivery Date` and
`Customer Delivery Location` like SO Batch Purchase and Manual Purchase (orders MASTER); Supplier
Claims puts `PO No` · `GRN No.` last (Purchasing §9.5).

### Receiving and supplier-exception words (locked 2026-07-27)

One vocabulary for every module that waits on a supplier. Never invent a synonym.

| Group | The words |
|---|---|
| Receiving quantities | `Order Qty` · `Received Qty` · `Damaged Qty` · `Wrong Item Qty` · `Pending Delivery Qty` |
| Exception lifecycle | `Receiving exception created` · **`Call {supplier} — confirm what happens next`** · `Waiting supplier reply` · `Waiting goods arrival` · `Overdue goods arrival` · `Supplier cannot fulfil` · `Carres decision missing` · `Exception closed` |

**`Contact supplier` is retired** (Loo, 2026-07-28). It was a SIXTH verb for behaviour the
five already cover — reach the outside party, get an answer, record the outcome, which is
exactly `Call`. The action is `Call {supplier} — confirm what happens next` and its five
strings are in the dictionary above. **The R2/R3 screens still say `Contact`; the rename is
scheduled in the ④ R lane** — until it lands, this table is the ruling and the screen is the
lag, not the other way round.

**Waiting words are STATES, never actions** — nobody acts while one is true (engine law).
**Every module fails the same way:** one `Exception` plus a `Reason`, never a family of
different failure words.

### A door that is planned but not open says `Coming soon` (Jess, 2026-08-18)

**`Coming soon` is the ONE way the portal marks a page that is approved but not
built.** It is the sidebar's own case: Purchasing lists all thirteen of its pages
from the day the rail changes, and seven of them do not exist yet.

| Situation | The words |
|---|---|
| A rail entry for a page that is approved but not built | **`Coming soon`**, on its own line under the name (measured 2026-08-19: beside the tag every unbuilt name truncates) |

**Banned for the same fact:** `TBD` · `Not available` · `Not yet` · `In progress` ·
`Soon` on its own · a greyed word with nothing beside it. Those are six sentences
for one fact and a new hire has to learn all six.

**The words are only half of it — the row may not be a control.** A `Coming soon`
row is a `<span>` with no href, out of the tab order and `aria-disabled`. That is
what keeps it inside `03-page-patterns.md:149` (*a control that opens nothing is a
dead control*) while satisfying `:219` (*a control that is deliberately disabled
must say why, on screen*). **There is no dead arrow because there is no arrow.**

**It never carries a count**, not even zero — a number would claim work exists on
a page that does not.

### A number is not a status until someone sets a target (locked 2026-07-27)

A percentage, a count or a rate is a FACT. It gets a colour only when a human has set the
line it is being judged against. Painting 82% amber invents a policy nobody ruled, and the
reader cannot tell an opinion from a measurement.

Two consequences, both already shipped: **a rate with too few records is not printed at
all** — `0 ÷ 0` shown as `0%` reads "this supplier never delivers on time" and shown as
`100%` reads "perfect", and both are lies a screen tells with a straight face (R5); and
**"nobody has set a number yet" is its own visible state**, never a reassuring green
(K1's `Set a number`). A quiet screen must mean *watched and fine*, never *nobody looked*.

### Working days — THREE calendars, and this file does not define them

**Office Mon–Fri · Warehouse Mon–Sat · Delivery Mon–Fri + a reduced Saturday** (Loo
2026-07-28). The definition lives in **`docs/ACTION-FLOW-STANDARD.md` Law 2A** and nowhere
else — this file owns WORDS, not the engine.

*(Until 2026-07-28 the full definition sat here AND in Law 2, both saying "Monday–Saturday,
one definition for every module". Two homes for one rule, and the rule itself was the
warehouse's week wearing everybody's name. Deleted here rather than corrected in two
places — Law 0A.)*

### UI type dictionary (locked 2026-07-27)

Every visible element has exactly one allowed shape. If a string does not fit its row,
it is in the wrong element.

| UI element | Must be |
|---|---|
| Action (ladder · queue · button · checklist row) | verb + named party + measurable object |
| Checklist item | one short measurable task |
| Completion rule | a condition the SYSTEM can measure — never "someone did it" |
| Queue | a list of open Actions (its name IS the action) |
| Dashboard tile | a count of open Actions |
| Badge | fact only |
| Status dot | fact only |
| Filter | fact only |
| Bulk action | verb + PLURAL object (`Send 12 POs` · `Call 8 suppliers — confirm ready date`) |

**Banned words — never visible anywhere** (each names a mood or a gap instead of work):

`Chase` · `POD` / `Proof of Delivery` · `Unscheduled` · `Not booked` · `need booking` ·
`Pending` · `Processing` · `In Progress` · `At Risk` · `Attention` ·
`Customer Delivery` · `Deliver By` · `Promised Delivery` · `Customer 1st Requested Delivery` **as a name for the customer date** (retired 2026-08-27 — the word is `Requested Delivery Date`) ·
`Movements` · `Recovery` **in the delay sense** (staff say "this order going to
delay" — the word on screen is `Delay planning`)

**`Inventory` is no longer banned globally — owner ruling 2026-09-01.** It is the approved
Warehouse master Register destination under `Monitor · Inbound · Inventory · Outbound`
(the Warehouse map's words since the 2026-09-06 owner replacement Card). It does
not become a synonym for Finance valuation, Purchasing planning or another module's goods pool.

**`Recovery` is banned by MEANING, not by spelling.** Account recovery on the login page is a
different word that happens to be spelt the same, and it stays. C8 grepped the live bundle,
found `Recovery` nine times, and correctly changed none: eight are React internals
(`errorRecoveryDisabledLanes`) and the ninth is `Login.tsx`'s forgot-password dialog. **A
banned word is banned where it names the banned concept** — a chat sweeping this list by
string match will rename the login page and call it compliance.

(Filters may name a real STATE — `Placed`, `Proceed`, `Delivered`, `Owing` — but never
one of the words above.)

**`Waiting` alone is banned; `Waiting <the exact thing>` is allowed as a STATE.**
`Waiting` on its own tells the reader nothing — waiting for what? But
`Waiting supplier reply` and `Waiting goods arrival` name precisely what is being waited
for, and they are states, not actions: **nobody acts while one is true.** Never use such a
phrase as an action label, and never shorten one to the bare word. (Ruled 2026-07-27 after
S4 found this file banning a word its own receiving vocabulary approved.)

**The no-decorative-checkbox law.** A checklist item may exist only if it is either
(a) DERIVED from a signal the system already stores, or (b) an input the system then
stores. **A tick-box that only records "I say I did it" is banned** — it turns the portal
into a manual to-do list and lets an order look complete when nothing happened. Where a
FORM already collects the inputs (the PO form, the confirm-booking form), that form IS the
checklist — never a second list of ticks beside it.

## Vocabulary — the canonical words

Use these words EVERYWHERE. Never a synonym in a different page. When in
doubt, grep the codebase and match what already ships.

**These rows name RECORDS, documents, buttons and statuses. MODULE and PAGE names are
Information Architecture and live in [`ERP-ARCHITECTURE.md`](ERP-ARCHITECTURE.md) §2.1.**

| Concept | Canonical word | Do NOT use |
|---------|---------------|------------|
| Raise a purchase order to a factory — **it is ONE act, never two** | **`Issue PO`** (the formal PO exists) | **Send PO** · **Prepare PO** · **Draft PO** — all retired · Place · Raise · Push · Submit · Create |
| Pre-due polite follow-up on an open PO | **Remind** | Notify · Ping · Alert · Nudge |
| Post-due firm follow-up on an open PO | **Call {supplier} — confirm ready date** | Chase · Expedite · Follow up · Push · Escalate |
| Log goods arrival — the ACT | **Check in** | Receive (as a verb) · Book in · Goods receipt · **GRN** (that is the document, not the act) |
| The DOCUMENT that the act produces | **GRN** | Goods receipt note · Receiving note · Check-in record |
| An order line's goods are secured for that order | **Ready** | Reserved — on an order line it is read as `Received`, and the two mean opposite things. `Reserved` stays correct on the Stock screens, where it describes a UNIT and sits nowhere near `Received` |
| Customer confirmed ETA — ready for PO | **Proceed** | Confirmed · Approved · Green-lit |
| Customer ordered but no ETA yet | **Placed** | New · Draft · Pending · Open — **and this ban is about a CUSTOMER ORDER only. See the Purchasing exception below: `Draft` and `Issued` are ruled words on the Purchase Order axis** |
| Cancel an order | **Cancel** | Void · Abandon · Kill |
| Purchase order (the document) | **PO** | Purchase order · P/O · Order (ambiguous with customer order) |
| Customer's own order | **Order** (or `SO-1207`) | Sales order · Job · Ticket |
| The To Order stages | **`Issue PO`** — one tile. `Confirm ready date` MOVED TO PURCHASE ORDERS (Loo, 2026-08-05: queue and door in one place; the door is the Purchase Orders expand, shipped 0318) | Chase · Place · Follow up · Book in · **`Send PO`** · **`Prepare PO`** · **`Receive` as a To Order stage** (it left for Receiving on the deadline-anchor boundary) |
| How many of this item stand in the warehouse right now, on the To Order grid | **`Ready Stock`** | Available · On hand · In stock · Free stock — the module already spells this fact `Ready Stock` on its rail and on a typed demand's own line, and a third spelling for one number is how two screens come to disagree. Ruled as a COLUMN header by Loo, 2026-08-06 (*"i need to add to show ready stock like autocount"*), after the number spent its life behind a ⊞ |
| How many of this item an OPEN purchase order already covers, on the To Order grid | **`On PO`** | On Order · Incoming · In Transit · Open PO · PO Outstanding — **`PO` is already this dictionary's word for the document** (two rows below), so the header composes a ruled noun instead of minting a fifth spelling for a purchase order. `Incoming` and `In Transit` are both WRONG as well as new: the goods may not have been made yet. Added by card T3, 2026-08-06, when the fact finally reached a screen — `net-requirements.ts` had computed it since the day it was written and it had ZERO readers, so a partly covered line printed a reduced `Qty` with nothing on screen saying what took the rest |
| Sales' planned production start, as a To Order column header | **`Proceed date`** | Proceed · Start date · Production date — the bare `Proceed` is an order STATE two rows above, a different fact. The header carries the word so the CELL prints the date alone |
| Photo proving a delivery happened | **delivery photo** | POD · Proof of Delivery · e-POD |
| Mattress + bed frame as one delivery | **Bed set** | Bedroom set · Bundle · Bed package |
| A follow-up delivery on the same order | **Second trip** | Partial delivery · Split shipment · Back-order |
| Getting a faulty item back from the customer | **`Pick up the item from {customer}`** | Collect the item · Retrieve · Recall — `Collect` means MONEY in this portal (Jess 2026-07-27) |
| Working out what to do about a delay, before anyone calls the customer | **`Delay planning`** | Recovery · Recovery plan · Exception handling · Escalation |
| Telling logistics to re-arrange a delayed delivery | **`Call {logistics}` over `Arrange a new delivery date`** (two lines, owner ruling 2026-09-13) | Call customer (stock delay) · Inform customer · Reschedule |
| Call to fix delivery date + slot | **`Call {customer}` over `Book the delivery date`** (two lines) | Schedule delivery · Chase · Call customer (book delivery) [old T2 spelling] |
| The company responsible for customer contact/transport in Delivery | **Logistics** · a named one reads `NETS Logistics` | Logistic · Carrier · Delivery partner |
| The physical-goods domain in explanatory copy | **Stock** | Warehouse as a quantity noun |
| The module's rail heading (CARD-2026-08-19-warehouse-rail) | **Warehouse** | Stock (as a heading) · Supply Chain |
| The Warehouse master Register destination | **Inventory** | On hand · Stock Units |
| The two Warehouse dated pages (owner ruling 2026-09-14) | **`Arrival Schedule` · `Pickup Schedule`** — two independent sidebar destinations. **The single combined `Monitor` is RETIRED as a Warehouse page word**: one board carrying both directions made every operator read past half of it. `Monitor` remains Delivery's and Payments' word; the ERP still keeps ONE global `Dashboard`. The retired `?tab=warehouse-monitor` / `?tab=warehouse-dashboard` addresses resolve to `Arrival Schedule` | Monitor (as a Warehouse page) · Dashboard (as a Warehouse page) · Board · Overview · a direction TAB inside one page |
| ARRIVAL event names — printed only when the movement is SPECIAL | **`Transfer arrival` · `Customer/failed-delivery return` · `Return from repair` · `Supplier replacement`** (`Supplier replacement` ADDED 2026-09-14: the claim-replacement inbound, which had no word). **An ordinary supplier arrival prints NO event-type heading at all** — the page is already called Arrival Schedule, and the same heading repeated down a whole column is noise | `Supplier arrival` as a per-card heading (retired 2026-09-14) · Inbound delivery · Receipt · GRN (as an event name) |
| PICKUP event names — printed only when the movement is SPECIAL | **`Transfer pickup` · `Supplier-return pickup` · `Repair pickup`**. **An ordinary customer pickup prints NO event-type heading.** `Supplier-return pickup` and `Repair pickup` have NO owning record today and render zero cards; the words are governed so they are right the day the record exists | `Customer-delivery pickup` as a per-card heading (retired 2026-09-14) · Dispatch · Shipment · Collection (bare) |
| Whether a Schedule date is AGREED — the card's one tinted pill | **`Expected`** (amber) · **`Scheduled`** (blue). `Scheduled` requires recorded evidence of an agreement; **a date alone is never `Scheduled`**, and an unknown agreement prints NO pill and no tint. The tint means date agreement and NOTHING else — never progress, damage or lateness | `Confirmed` (that is Delivery's customer word) · `TBC` · a tint that also encodes progress |
| A Schedule line's progress | **`{n}/{m}`** with its meaning in the accessible name — `{n} of {m} received` (arrivals) · `{n} of {m} loaded` (pickups). **Where no record states a result, the PLANNED quantity stands ALONE** (`{m}`, read as `{m} expected, receipt not recorded` / `{m} to load, loading not recorded`). A recorded `0/{m}` and an absent result are DIFFERENT answers and never render alike | `0 of 3` for an unmeasured line · `—` · `Pending` · `0%` |
| Damage on a Schedule card | **`{n} received with issue · counted in received, not available stock`** — its own warning line. `Received with issue` is already a SUBSET of received (§Receiving), so the two never sum, and the sentence has to say the goods are not saleable stock | adding damage to the received count · `Damaged {n}` alone (reads as a fourth Unit) |
| The logistics side's own count on a pickup card | **`Driver confirmed {n}`** — its own line, never merged into the loading progress. Loading is the warehouse's act; this is the counterparty's statement, and the two disagreeing is the exception worth seeing | Handed over · Received {n} · one combined confirmation |
| A Schedule card's door into work | **`Open receiving work`** · **`Open loading work`** (tooltip + accessible name). The door OPENS filtered work; it never posts a receipt, a loading result, a driver acceptance or a stock change | Receive · Load · Complete · Done · an action verb on a summary card |
| A Schedule date with genuinely nothing on it | **`Nothing arriving.`** (Arrival Schedule) · **`Nothing for pickup.`** (Pickup Schedule) | No arrivals or pickups on {date} (retired with the split) · No handovers · Empty |
| A Schedule date whose FEED FAILED | **`The schedule could not be read for this date.`** — a broken read may NEVER print an empty-day sentence. `cards: []` with a non-empty `errors` is a failure, not a clear day | `Nothing arriving` while a feed is down · `0 arrangements` · a silent blank column |
| Schedule work the board cannot place | **`{n} with no date yet — not shown on any column.`** — an undated arrangement is reported, never dropped and never quietly parked on today | hiding undated work · placing it on today |
| A Schedule fact the source never recorded | **`Party not recorded`** · **`Model not recorded`** | an empty cell · `Unknown` · `N/A` |
| Outbound's pickup-status filter group | **`PICKUP STATUS`** | OUTBOUND SCHEDULE (retired with the Monitor split) · Status |
| Warehouse rails' governed-Site filter group | **`SITE`** | Warehouse Location · Branch · Place |
| The Inbound/Outbound Register column naming the governing record (unified card 2026-09-07) | **`Document`** — the fixed column header; the cell prints the document's own name and number (`PO No PO-…` · `Transfer No TR-…`) and the number opens the document | Source · Source Type — both retired 2026-09-07; a source is a document with a name |
| Warehouse rails' document-kind filter group (unified card 2026-09-07) | **`DOCUMENT TYPE`** — rows keep the arrival kind words (`Supplier delivery` · `Transfer` · …) | `SOURCE` (retired 2026-09-07) · Type · Reason |
| The document-name words the `Document` cell may print | **`PO No` · `DO No` · `Transfer No` · `Repair Order No` · `Claim No` · `Case No`** — each names the record whose number follows it; the numbers are minted records (`TR-…`, `RO-…`, the Claim's or Case's own number), never invented for a screen | Ref · Reference No · a made-up document name |
| Outbound valid empty date | **`No pickups on {date}. Choose another date.`** | No outbound handovers (retired 2026-09-06) · Empty · Nothing |
| The exact goods a pickup takes, as the work heading | **`Goods scheduled for pickup`** — listing exact Unit IDs and products | Units to give · Items · Load list |
| The transport company and the person, ALWAYS separate fields | **`Logistics` · `Assigned Driver` · `Vehicle`**; unassigned reads **`Waiting for {partner} to assign a driver`** | NETS driver (merged identity) · Driver (as the company) · an invented driver name |
| The Outbound §3.5.1 tally (extended 2026-09-07) | **`Required {n} · Loaded {n} · Not loaded {n} · Driver confirmed {n}`** — required, warehouse-loaded and driver-confirmed are THREE separate facts and never one number | Handed over (retired 2026-09-06) · Progress · Completed · Pending · Done |
| The three per-Unit preparation facts, in order | **Scanned · Checked · Packed** | Picked · Staged · Loaded · Ready (as a stored status — `loaded` is the ACT sentence and evidence line below, never a stored status word) |
| A Unit's derived not-yet reason on Outbound | **`Not scanned yet` · `Not checked yet` · `Not packed yet` · `Waiting to be loaded`** | Pending · In progress · Blocked · Waiting for handover (retired 2026-09-06) |
| The evidence-backed loading act (2026-09-06 replacement Card) | **`Record {n} Units loaded to {person}`** | Record handover (retired) · Mark done · Complete · Ship · Dispatch |
| The two evidence records, never merged | **`Warehouse loaded`** (the identified operator's exact-Unit submission) · **`Driver collected`** (the driver's own confirmation) | Handover · Receiver · a single combined confirmation |
| A load/collection mismatch — per exact Unit, never generic | **`{unit} was not confirmed by {person}. It remains with {site}.`** | Needs checking · Mismatch · Discrepancy |
| The shared Inbound/Outbound Register location columns (unified card 2026-09-07) | **`From` · `To`** — always PLACES (or the customer); a carrier, driver or receiver never substitutes for a location; a missing origin reads `Origin not recorded` | Ship-from/Ship-to · Location (ambiguous) · the transporter's name as a place |
| The Register's one physical-progress column (unified card 2026-09-07) | **`Status`** — Inbound speaks `Not received yet · Part received · Received · Records incomplete`, decided by `Pending Delivery Qty`, so ten pieces on the floor with two damaged still read `Part received`; Outbound speaks `Not loaded yet · Part loaded · Loaded`. Progress and exceptions can BOTH hold; they never merge into one word | Overall status · Stage · Done/Pending (as stored words) |
| The Register's exception column (unified card 2026-09-07) | **`Exceptions`** — each line names its exact Unit or record (`{unit} · Damaged` · `{unit} · Received at {site}, not {site}` · `Loading evidence not submitted`); never a bare flag. `Linked problems` stays the Case-linkage heading — a different fact | Issues · Alerts · Problems (bare) |
| Outbound's date column — the warehouse→transporter handover, never the customer's delivery time | **`Scheduled handover`** — the second line prints `Driver pickup {time}` or exactly `Time not provided` | Delivery date (that is the customer's fact) · ETA · Pickup date (retired into this word 2026-09-07) |
| The default Warehouse filters | Inbound **Awaiting receipt**: correct goods are owed or receipt records incomplete. Outbound **Awaiting loading or driver confirmation**: loading, loading evidence or independent driver confirmation is outstanding. **Awaiting driver confirmation** is the driver responsibility filter. | Not finished · Done |
| Inbound's actual-receipt date column (receiving-workspace card 2026-09-15) | **`Goods Received Date`** — one line PER supplier delivery note: its own DO number, linked to its own receipt, beside its own actual date. The retired `Received on · {n} receipts` collapsed several trucks into a latest date and hid the earlier ones | Arrival date (that is the expectation) · Done date · a single latest date standing for several receipts |
| Inbound's Site strip (receiving-workspace card 2026-09-15) | **the governed Site's own name**, opening on `Carres Klang Warehouse`. A partner Site appears because it is a governed Site with receiving access | a partner name written into the page · Location · Branch |
| A purchasing destination with goods coming and NO governed Site linked | the tab **`Destinations without a Site`**; the row's `To` cell reads **`{destination} — no Site linked`**; its receiving column reads **`No Site linked`** and offers no door. **The gap is always stated** — such arrangements may never be silently absent, and goods that never reach a Carres Site must not mint a warehouse receipt | Unknown · Unassigned · Other · hiding the rows · inventing an address for the destination |
| Inbound arrival filters | **Awaiting receipt · Fully received · All arrivals**. Damaged/wrong goods do not settle accepted quantity. | Not finished · overlapping Expected/Part received/With issue filters |
| Inbound's receiving column (receiving-workspace card 2026-09-15) | **`Receive`** on the row. While the duty authority is still answering: **`Checking…`**; when it refuses: **`Not your duty today`** | Start · Go · Open Receiving Session (retired — receiving happens on the page) · a hidden row |
| Damage or wrong goods on COUNTED STOCK, which has no Unit ID to name | **`Damaged Qty {n} · counted stock`** · **`Wrong Item Qty {n} · counted stock`** | a bare quantity with no Unit · `Not unit-tracked` · omitting the damage because no Unit exists |
| The `PO No` cell's second line on Inbound | **`PO Issued {date}`**, or **`PO Issued date not recorded`** | PO date (ambiguous — three PO dates exist) · Created |
| The DO-object door to the Warehouse work page | **Open Outbound** | Go to warehouse · Handover here |
| Schedule work not shown in the working-date columns | **Earlier work still overdue**; **Scheduled on other dates in this period**; every entry retains its original date and owning source link | changing the scheduled date to fit the calendar; hiding closed-day or older pending work |
| Physical visits evidenced by receipt and departure | **Site visits**; **Received** / **Departed** with the owning document; **Departure not paired with this receipt** when evidence cannot establish the pair | PO issue date as physical receipt; current Site as historical Site; invented dates |
| Inventory footer counting exact and quantity rows together | **{n} records**; separate **{n} you can promise** and **{n} pieces you cannot** | calling quantity rows Units; promising a quantity row because qty happens to equal one |
| Unit and Stock event history | **History** | In & out · Movements · Movement log · Ledger |
| Cross-Site movement object | **Transfer** | Movement · Relocation; it appears in Inbound/Outbound/Inventory rather than a fifth top page |
| Formal Unit verification and correction view | **Counts & Adjustments** | Stocktake · Audit · separate Count Differences page · separate Adjustment Requested page |
| A logistics company's own working rules | **delivery rules** | Partner profile · SLA · Carrier config |
| Notice logistics need before a delivery day | **working days notice** | Lead time · Cut-off · Booking window |
| A date logistics are closed | **not running on** | Blackout · Unavailable · Out of service |
| Most drops logistics take in a day | **deliveries a day** | Capacity · Max load · Slots |
| How long a factory takes to make an item | **production working days** | Lead time · Manufacturing lead · Turnaround |
| The days a factory is open | **Supplier work week** | working days · Work-week · Factory calendar · Shift pattern |
| The earliest delivery date a store may sell | **Earliest date a store may sell** | Lead time · Minimum lead · Sell-from date · Earliest available |
| The last day we may send the PO and still be safe | **order-by date** | Raise-by · Trigger date · Reorder date |
| The days of the week we send POs | **PO days** | Cycle · Review day · Batch day |
| Days kept back for arranging the delivery | **Safety days** | Buffer · order-by buffer · Safety stock days · Slack · Padding |
| Where the supplier must send the goods | **Deliver To** | Where the goods go · Ship-to · Destination · Drop point · Location |
| Physical identity assigned to one stock unit | **Unit ID** | Serial · Item ID |
| What is still owed after a short delivery | **balance** | Outstanding qty · Back-order · Shortfall |
| Goods moved between our own locations | **stock transfer** | Relocation · Internal shipment · Redeployment |
| An SO edit because the RECORD was wrong — the customer's agreement never changed | **Staff correction** | Amendment · Fix · Data fix · Edit (as a cause word) — the two cause words come from the SO V2 Card 1 spec (owner, 2026-08-11) and are the structured `change_type` on every contractual revision |
| An SO edit because the CUSTOMER asked for something different | **Customer change** | Amendment · Change request (that is the pending ASK, not the applied change) · Revision (that is the record it mints) |
| A fulfilment-side substitution/recovery that does not create a new customer transaction | **Fulfilment replacement** | Customer change · Staff correction · Cancel and reorder |
| The date the customer is asking Carres to deliver on | **`Requested Delivery Date`** | **`Customer Delivery`** · **`Deliver By`** · **`Promised Delivery`** · **`Customer 1st Requested Delivery`** — all four RETIRED 2026-08-27 and banned from reuse · `Delivery Window` (that word belongs to Delivery) · `Promised` · `Current` |
| The delivery day Logistics and the customer agreed | **`Confirmed Delivery`** | Logistic delivery date · Final delivery date · Deliver by · Booked date — Delivery owns this word and this ruling does not rename it |
| The time range Logistics and the customer agreed | **`Confirmed Time`** | Slot · Time window · Delivery window (that is the half-day/full-day fact) |
| The goods actually reached the customer | **`Delivered`** | Completed · Closed · Done |
| Register column of what the customer still owes | **Outstanding** | Balance — re-ruled 2026-08-15; `balance` is the goods word, two rows above |
| A money cell on an order that is fully settled | **`Paid in full`** | Settled · Cleared · Fully paid · Nil outstanding — registered 2026-09-02 (D7): it has been on the SO register and the workspace MONEY card since they were written and was in no dictionary, so the rule it was breaking was this one. Registered rather than reverted, on the `SO Date` precedent (2026-09-01). ⚠️ **The DELIVERY GATE says `Money in full` for the same arithmetic** (outstanding = 0, ruled 2026-09-01, two tables below). Two words, one fact, two surfaces — left as it is deliberately, because unifying them is an owner's call and not a tidy-up. Do not swap one for the other without one. |
| A money cell on an order nobody has priced | **`No price yet`** | RM 0 · Unpriced · — · Free. The DELIVERY GATE says the longer `No price yet — money does not hold this delivery` because a gate must name the consequence; a register column has no room for one and states only the fact |
| Money Carres pays a SUPPLIER before its bill, later knocked off that bill (or sent back) | **`Advance`** — **APPROVED, owner ruling YH 11 Sep 2026**, for exactly three places: the payment voucher's advance box, the advance knocked off a bill (the bill's Payments), and the column on `Unpaid by Supplier` showing advance not yet used. Migrations 0484–0485 | Deposit · Prepayment · Down payment · Supplier credit · Refund (`Refund` still has no entry — see the Claims ruling). The phrases built on it (`Advance left`, `Apply advance`, `Money back` …) are PROPOSAL until ruled — § Finance ledger words, *Supplier advances* |
| Register column naming the selling showroom | **Showroom** | Outlet · Branch · Store |
| Register destination summary | **Delivery Location** | Address · Location (ambiguous) · Ship-to |
| Direct customer-order document identity | **SO No** | Doc. No. · Current |
| Direct purchase-order document lineage | **PO No** | PO Doc No. · Current |
| Direct delivery-order document lineage | **DO No** | Delivery Order No. · Current |
| The complete currently-applied SO version | **Current** / **Order** (detail tabs only) | Current status · Overall status |
| Complete immutable versions of one SO | **Revisions** | History · Amendments |
| Append-only events on one SO | **History** | Revisions · Activity (for this object view) |
| Fact-derived document/fulfilment/obligation map | **Order Route** | Relationship Map · Journey · Workflow · Checklist · Status |

### The customer-money word is `Outstanding` (owner ruling 2026-08-15)

**`Outstanding` is what the CUSTOMER owes HQ** (`CLAUDE.md` §7). It was already this dictionary's
word for a column of what is still owed; the ruling ends the last two places that said `Balance` —
the Sales Order MONEY summary and the register's MONEY column.

**`balance` stays the GOODS word** for what is still owed after a short delivery (the row in the
canonical vocabulary below). The two facts were wearing one label. A stored key or test id keeps
its name: renaming a label is a copy decision, renaming an identifier is a breaking change.

| Concept | Canonical word | Do NOT use |
|---|---|---|
| What the customer still owes HQ, anywhere on screen | **`Outstanding`** | Balance · Balance owing · Amount due · Owing |

### The delivery money gate, payment approval and COD words (owner ruling 2026-08-19 · door closed 2026-09-01 · shut in the database 2026-09-12)

Money in full before delivery is absolute. The Delivery Payment Approval words below survive only
for the HISTORY an approval granted before 2026-09-01 still carries (0362 · 0486); no screen
offers the raise or decide door and the API answers 410. The gate, the canvas, the object page,
the drawer and the DO document read them from the shared modules (`delivery-payment-approval.ts`
· `delivery-order.ts`), never a local rewording.

| Meaning | Use exactly | Do NOT use |
|---|---|---|
| The manual DO door (outstation — partner schedules the customer) | **`Request Delivery Order`** | Issue DO · Create DO · Generate DO · Release |
| The approval object / the Money-block label | **`Delivery payment approval`** | Payment exception · Money release · COD request |
| The raise door on the order | **`Request payment approval`**, reason field **`Reason`**, submit **`Send request`** | Ask Jess · Escalate · Apply for release |
| The approver's two verbs | **`Approve`** · **`Refuse`**, reason field **`Decision reason`** | Reject · Deny · OK |
| The approved state, everywhere it renders | **`COD approved — collect before unloading`** | Released · Money waived · Approved to deliver |
| A raised, undecided request | **`Waiting for decision`** (gate line: `… approval waiting for decision`) | Pending approval · In review |
| ⭐ The DO document's instruction, printed when issued under an approval and still owing | **`COLLECT RM {amount} BY ONLINE TRANSFER BEFORE UNLOADING — NO CASH.`** | any softer or reworded version — these are the owner's words |
| The gate refusal, nothing raised | **`RM {amount} is still outstanding — collect it in full, or request a payment approval.`** | Money not collected · Balance due |
| The gate refusal, request pending | **`RM {amount} is still outstanding — a payment approval is waiting for the approver's decision.`** | — |
| Route gate, money met | **`Money in full`** · under approval **`COD approved — collect before unloading`** | Paid · Settled |
| Route gate, unpriced order | **`No price yet — unknown never holds`** | Money does not hold this delivery |
| The drawer's absence sentence | **`No delivery order yet — the system issues it when the goods, money and date are ready`** | the 2026-08-16 version without `money` |

### PAYMENTS → Monitor · Payment Records (owner ruling 2026-09-12)

| Meaning | Use exactly | Do NOT use |
|---|---|---|
| The module heading and its two destinations | **`Payments`** · **`Monitor`** · **`Payment Records`** | Finance Portal · Invoices · Receipts · Order Payments · Collections desk |
| Monitor columns, in order (owner ruling 2026-09-16) | **`SO No · Customer · Amount needed · Items & Stock · Storage · Requested Delivery Date · Confirmed Delivery · Payment timing`** — on a fixed 72px row, one fact and one supporting line per cell | Goods · Customer delivery (both RETIRED 2026-09-16) · Stock readiness · Stock arrival · Next step · Needed · Expected arrival · Stock status · Logistics ETA · Payment Timing (capital T) |
| SO No and Customer cells | line 1 **`SO-{n}`** (opens the Sales Order) over the customer's reference(s) **`TCF0541 · CR1122`**, nothing when none; line 1 the customer name over the phone. A cut value opens whole by click or keyboard | `SO-1217 TCF0541` on one line · a hover-only full value |
| Items & Stock cell (Delivery's words) | **`Ready`** · **`Not ready`** over **`2 of 2`** · **`1 of 2 · 1 short`** · **`Arriving after the requested date`**; **`Delivered`** for a delivered order still owing; Finance reader **`Stock facts are Operation's.`**; a failed stock read **`Stock facts could not be loaded.`** The cell opens Delivery's **`Items, Services & Stock`** panel (`Item` · `Qty` · `Source` · `Status` · `Location`) | Goods ready · Received (for Ready) · Stock readiness · In stock · ETA |
| Storage cell | **`No storage charge`** · **`Free until {day}`** · **`{Group} · Day {n} · RM {x} so far`** · **`Free request waiting for approval · Estimated charge RM {x}`** · **`Free storage approved until {day}`** · **`Storage Invoice issued · RM {x} not paid`** — on the 72px row the same words break onto two lines after the state (`Sofa · Day 15` / `RM 200.00 so far` · `Free storage approved` / `until {day}`); Search and Export keep the one sentence | Storage fee · Accrued · Pending waiver |
| Requested Delivery Date and Confirmed Delivery cells | the request in Delivery's words **`{Weekday}, {d} {Mon}`** · **`To be confirmed`** · **`No delivery date`**; the confirmed fact **`Confirmed`** over **`{day} · {window}`**, **`Not confirmed`** over **`{day} · No time agreed`**, or **`Not confirmed`** alone | Customer delivery · Not confirmed yet (retired 2026-09-16) · Logistics ETA · TBD |
| Payment timing — the fact (line 1) | **`Payment due today`** · **`Ask customer today`** · **`Customer promised to pay today`** · **`Payment should have been received`** · **`Arrival not confirmed`** · **`Storage Invoice not paid`** · **`No delivery date`** · **`Payment due {day}`** | Overdue · Late · Due T−2 |
| Payment timing — the action (line 2) | **`Ask customer to pay`** · **`Wait`** · **`Send the invoice and collect payment`** | Ask the customer to pay · Chase · Remind · Collect |
| The owner on the action | line 2 is the shared Work item's OWN action beside the avatar chip — no Work item, no action and no person (only **`Wait`** stands alone); accessible name = the acting person; hover **`Normal owner: {name} · Today's cover: {name}`** when covered; no owner resolved → **`Not assigned`**, named **`Nobody is assigned to this order. Assign it in Sales Orders → Team`**, door the Sales Orders Team; the workspace prints **`Nobody is assigned to this order.`** + **`Assign it in Sales Orders → Team`** (owner instruction 2026-09-16) | a name inside the sentence · `Nobody holds Delivery Duty.` / `Staff & Duties` for a collection owner (retired 2026-09-16) |
| The rail's follow-up plan (owner ruling 2026-09-16 — replaces the seven filters and the summaries) | the week **`{Mon, 14 Sep} – {Fri, 18 Sep}`** with **`Previous week`** · **`Next week`** · **`This week`** · a day **`{fmtDate}`** with the marker **`Today`** (only on a working today) · **`Public holiday · {name}`** · **`Ask {n} customer(s) to pay`** · **`Check {n} promised payment(s)`** · **`Collect {n} storage payment(s)`** · **`Includes {n} not done since {day}`** · **`{n} not done · counted under Today`** / **`… counted under {day}`** · **`No follow-up planned`** · **`All unpaid orders`** · **`Reading the collection desk…`** · **`The follow-up plan could not be loaded.`** · **`The follow-up plan is Operation's.`** | tabs of any kind · Open · Late · Overdue · Needs attention · `Today` WITHOUT its date |
| Monitor footer / empty / scoped-empty | **`{n} orders · RM {x} still needed`** · **`No customer money is needed right now.`** · **`No follow-up planned on {day}.`** · **`SO-{n} needs no payment right now. Its money is in Payment Records.`** | — |
| Opening a Monitor row | the chevron **`Show payment details`**; the row opens below itself; its sections **`Money · Delivery Dates · Items, Services & Stock · Storage · What to do · Collection owner · Invoice · Related Payments · Communication History`**; its doors **`Statement · Print · Create payment link · Record payment`** | Show items · Open workspace · Details |
| The collection owner section (workspace) | **`Collection owner`** · **`Normal owner: {name}`** · **`Today's cover: {name} · until {day}`** / **`No cover today`** · **`Acting today: {name}`** · **`Responsible Delivery Operation · since {day}`** / **`Handed over · since {day}`** · **`Hand over collection`** (principal/manager) · **`New owner`** · **`Reason`** · **`Effective from`** · **`Previous owner: {name}`** · history lines **`Established · …`** / **`Handed over · {from} → {to} · {reason} · by {who} · {when} · effective from {day}`** · **`Owner facts are Operation's.`** (Finance) | Assign · Reassign · Owner · PIC · Payment Duty |
| Communication History entries | sent messages (**`Payment message sent`** …) and recorded results (**`Customer will pay on a date · promised {day}`** · **`Customer did not answer`** …) with **`Next: {sentence}`**; empty **`No messages or results recorded yet.`** | Notes · Log · Activity |
| Payment Records columns, in order | **`Paid date · Receipt No · Customer · SO No · Amount received · Method`** | Amount · Paid Date · Recorded |
| The exception beside the receipt | **`VOIDED`** · **`RM {x} needs review`** | Overpaid · Duplicate? · Recorded |
| Payment Records footer | **`{n} payments · RM {x} received`** | — |
| Printing selected documents | **`Print {n} receipts`** (one: `Print 1 receipt`) | Export receipts · Download |
| Payment Record header state | **`Payment recorded`** · **`VOIDED`** | Recorded · Success |
| Payment Record sections, in order | **`Payment facts · Allocated to · Evidence · Actions · Receipt · History`** | — |
| Evidence door · the two rare doors | **`View`** · **`Correct allocation`** · **`Void payment`** (overflow, authorised only) | Open slip · Edit · Delete · Reverse |
| Settings → Payments sections, in order | **`Receiving bank accounts · Which bank to use · Payment methods · Collection timing · WhatsApp templates · Invoice and Receipt numbers · Storage charges · Online payment provider`** | — |
| Collection timing fields | **`Start asking the customer to pay`** · **`Payment must be complete`** — each `{n} working days before Confirmed Delivery` | T−3 · T−2 · Chase window |
| Storage rule card lines | **`Free storage {n} calendar days`** · **`Charge RM {x}`** · **`Charge every {n} calendar days`** · **`Operation may approve until Day {n}`** · **`Approver may approve until Day {n}`** · **`Extra free storage Not allowed`** · **`Check stored goods every {n} calendar days`** | Free days: · Rate · Cycle |
| The settings change record | **`Changes`** — `{what}` / `{who} · {when} · effective from {date}` / `{old} → {new} · {reason}` | Audit log · History (as the section name) |
| The retired approval door's refusal | **`Money must be in full before delivery. There is no approval that releases a delivery while money is owed. Collect the balance in Payments → Monitor.`** | Request payment approval |

### The Sales Order register and object words (owner ruling 2026-08-15)

| Meaning | Use exactly | Do NOT use |
|---|---|---|
| The register's search placeholder | **`Search sales orders…`** | `SO number, customer, phone or item…` — the box is a governed 200px, so the long form clipped at every width, not only a narrow one |
| The register's eighth default column | **`Showroom`** | Outlet · Branch · Store |
| The register's footer count (Listing Standard, owner approved 2026-09-16) | **`{n} sales orders`** · singular **`1 sales order`** · narrowed or capped **`{n} of {m} sales orders`** (`{m}` is the SERVER's `salesOrderTotal` — every Sales Order this user may read, rentals excluded, search not applied; when it is unknown the footer prints **`{n} sales orders`** with no `of`) · ticked **`{n} selected sales orders`** / **`1 selected sales order`** | `{n} orders` · `{n} of {m} orders` · `{n} rows` |
| The register holds no sales order at all | **`No sales orders yet`** | `No orders yet` · No data |
| Search or header filters leave nothing | **`No sales orders match these filters`** + **`Clear filters`** (it clears the search too; while this state shows its button, the condition strip keeps its chips but not a second button) | `No matching sales orders.` · No results |
| The register could not be read | **`Sales orders could not be loaded`** + **`Try again`** — one kit error, no raw transport message | `The register could not be loaded` · an API error string |
| The footer's category tally | the governed words only — `Mattress · Bedframe · Sofa · Pillow · Mattress protector · Topper · Footrest · Service` | any raw SKU word, and above all `M.P` — the AutoCount sheet's abbreviation. ⛔ **`Other goods` is COUNTED BUT NO LONGER PRINTED here** (YH, 2026-08-27) — this overwrites the earlier "never dropped from the count". The word reports a CATALOG GAP (a line with no catalog row, or a catalogued `guarantee` item, since this vocabulary covers five of the catalog's six categories), which is not a fact about the customer's goods and is not actionable from a register footer. 🟡 The printed numbers therefore no longer sum to the order's item count; `footerWord` is untouched and still computes the bucket |
| Copy this order into a new one, from the object page | **`Copy to new Sales Order`** | Duplicate · Clone · New from this |
| The object MONEY card's door to the collections desk | **`Open this order in Payments`** | View payments · Go to Payments · Collect |
| The day the Sales Order was taken — register column, Order info, Order Route, field catalog | **`SO Date`** | `Ordered` · `Ordered Qty` · Order date · Placed · Created · Taken on. **REGISTERED 2026-09-01 (YH), five days after the screens started printing it.** `11e11ca2` renamed this fact on five surfaces and never wrote it down here, so the dictionary went on saying `Ordered: {date}` while every screen said `SO Date` — the exact drift Law 1 exists to stop, and it survived because nothing checks a rename against this file. **Why `SO Date` wins the tie:** `Ordered` is Purchasing's word. A Purchase Order is *Ordered* when it goes to the factory, and `Ordered Qty` is a purchasing column on the same operator's screen — one word for two modules' facts is how an operator learns to distrust the header. Sales Orders name their own fact after their own document. The row above under THE ORDER ROUTE WORDS moves with it: the Route node prints `SO Date: {date}`. |
| Payments' chip for that scope | **`Sales Order SO-{n}`** | Filtered by order · Order scope |
| Order Route, a promise with no trip arranged | **`Customer date {date} · Delivery not arranged`** | `Promised this day, no date yet` — retired 2026-08-15: it named a day and denied it in one line |
| Order Route, no promise at all | **`No delivery date`** | any second spelling — this is the same governed value the Register prints |
| Order Route first-layer heading | **`Order tracks`** | Overall status · Order status · Still owed |
| Order Route conditional linked-case heading | **`Linked problems`** | Service track · Other track · Exceptions |
| Order Route delivery-gate heading | **`Delivery release`** | Release checklist · Delivery status |
| Delivery release is blocked | **`Not ready for delivery`** | Cannot proceed · On hold · Blocked |
| Delivery release is clear | **`Ready for delivery`** | All done · Released · Complete |
| A required purchasing document does not exist | **`No Purchase Order yet`** | PO: — · Waiting Purchasing |
| A route document door | **`Open {document number}`** | an unexplained ↗ · View document · Go to document |
| The register's emergency-contact columns | **`Emergency contact`** (the NAME) · **`Emergency phone`** · **`Emergency relationship`** — three columns, three words (YH, 2026-08-28) | one `Emergency contact` column printing `name · phone · relationship`. `customer_emergency` stores the three joined, and the register printed the join raw — a dot-separated schema dump this file bans, and three facts nobody could filter or sort apart. `RegisterField.text` is one string that is printed, filtered, sorted AND exported, so a cell cannot carry a second line; three facts take three columns. The object page's own `Name` · `Phone` · `Relationship` labels stay as they are — they sit under an `Emergency contact` heading that supplies the subject, and a bare `Phone` column header would collide with the customer's own |

### The Sales Order entry-gate words (owner ruling 2026-08-15)

Two rules refuse an order at entry, and each refusal names what is wrong and exactly how to fix it
(the Error pattern above). **`(TBD)`, `Confirm later` and `For Further Notice` are RETIRED** — a
new Sales Order always carries a real `Requested Delivery Date`.

| Meaning | Use exactly | Do NOT use |
|---|---|---|
| Step 3's standing note under the date picker | **`Ask the customer for the date before you save the order. An order without a delivery date cannot be filed.`** | Confirm later · TBD · For Further Notice · Optional |
| The wizard refuses a dateless step | **`Delivery date — ask the customer for the date, then pick it`** | `Delivery — pick a date, or tick 'Confirm later'` |
| **Any door** refuses a missing production start — the wizard, the POS schema, the office create door | **`Proceed date — pick the day production should start`** | …`or tick 'Confirm later'` · `Proceed date is required. Choose the day production should start.` — a second spelling that lived at `packages/shared/src/schemas/orders.ts:326` until 2026-08-28, so the POS wizard and its own schema refused the same thing in two different sentences. **One refusal, one wording, every door** (YH, 2026-08-28) |
| The office object page offers a proceed date that was never recorded | **`Never recorded — fill it in once, then it locks`** | Optional · Add a date · Editable · Missing — the hint states the CONSEQUENCE of typing, because this control appears exactly once in an order's life and the operator has no way to learn that from the field |
| The save door refuses moving a proceed date that IS recorded | **`The proceed date is already recorded and cannot be changed here`** | Locked · Read-only · Not editable · Forbidden — the refusal names WHERE it cannot be changed (`here`), because moving a production start is a real act with a real door; it is simply not this one |
| The create door refuses a dateless order | **`Delivery date is required. Ask the customer for the date before you save the order.`** | `delivery date is required unless marked TBD` |
| The cart refuses a service-only order | **`This order has no product — add the product this service belongs to`** | Invalid cart · Nothing to sell · Add an item |
| The create door refuses a service-only order | **`A Sales Order must contain a product. Add the product this service belongs to, or open a Service Case instead.`** | Bad request · Service not allowed |
| **Any door** refuses an order without a delivery address (owner ruling 2026-09-13, Delivery Card 18 — the `Fill in address later` tick is RETIRED at every create door) | **`Delivery address — ask the customer for the address before you save the order`** | Fill in address later · Address unknown · `Address — Line 1 (≥5 chars), or tick 'Unknown'` |
| **Any door** refuses a missing State | **`Delivery address — pick the State`** | `Address — State, or tick 'Unknown'` |
| **Any door** refuses a missing building type | **`Building type — pick the building the goods go to`** | `Address — Building type, or tick 'Unknown'` · Building type required |
| The office door refuses a missing floor or lift answer (the POS shape carries both) | **`Floor — enter the floor the goods go to`** · **`Lift — say whether the building has a lift`** | Floor required · Lift required |
| The wizard's address sub-step names the empty field | **`Address — Line 1 (≥5 chars)`** · **`Address — State`** · **`Address — City`** · **`Address — Postcode`** · **`Address — Building type`** | any of them followed by `, or tick 'Unknown'` |
| The office door's date field hint | **`Ask the customer for the date before you save the order. No lead-time floor.`** | `Any date — leave empty = TBD. No lead-time floor.` |

### The Sales Order object page words (owner ruling 2026-08-15)

The object page is ONE page in ONE state, so the words that named a MODE are retired with it.
**`Edit`, `Edit operational details`, `Order context` and `Save changes` no longer appear on the
object page** — nothing announces permission to type into a field that is already typeable. The
Register's context menu keeps the word `Edit` only because it names a destination, and that
destination is the same one `View` opens.

#### Its section names — owner ruling 2026-08-26 (Jess), re-paired 2026-09-11

Jess ruled the Order tab MERGED: fewer, fuller cards. A merged section keeps its exact word as
an in-card heading — the merge moves a border, never a name.

**RE-PAIRED 2026-09-11, and no word changed.** The approved detail organisation moved two
headings to the card each belongs with: `Sales ownership` joined `Customer` (who sold it is part
of who bought it) and `Delivery address` became a heading of the new `Delivery` card, beside the
access conditions that decide whether the lorry can reach the address. The WORDS below are the
same words; only which card carries them moved.

| Meaning | Use exactly | Do NOT use |
|---|---|---|
| The customer, who sold to them, and who to ring | **`Customer`**, with **`Sales ownership`** and **`Emergency contact`** as its in-card headings | Customer details · Buyer · Client · Contact · Ship to |
| The order's own administrative facts | **`Order info`** | Order details · Dates · Dates / Access · Admin · Meta |
| Where the goods go and what the lorry meets there | **`Delivery`**, with **`Delivery address`** and **`Delivery access`** as its in-card headings — registered 2026-09-11 with the re-pairing; the card holds the address, the billing relationship, the building type and the floor/stair/lift answers | Ship to · Address · Logistics · Delivery details · Access (alone, which names the conditions and loses the address) |
| Whether we already have this customer, beside the card's name | **`New customer`** · **`Existing customer`** · **`Checking…`** · **`Not known yet`** | New/Returning · First-time · Repeat · a coloured status dot with no word |
| ⛔ RETIRED — the delivery legs, holder, partner and appointment | nothing. **`Order Route` owns them** and always did; the Order tab printed a read-only copy | `Delivery Journey` — and `Journey` was already banned two sections below, against `Order Route` |
| ⛔ RETIRED — the index of every linked document | nothing. **`Order Route` carries a door to each owner** | `Related Documents` · Linked documents · Attachments · Files |

### The delivery fee — ONE name, the reason as a qualifier (YH, 2026-08-28)

The charge for the delivery TRIP. It had no entry here at all, and the POS confirm step named
it **six** ways on one screen — the base line renamed itself to `Cross-category follow-up
delivery` or `Special delivery fee` depending on configuration the salesperson cannot see, and
the two component rows used two more nouns. A salesperson reading a customer's order could not
tell whether they were looking at one charge or four. Every row now opens with the same two
words and puts the reason after a `·`, exactly as stair carry already qualifies itself with
`(with lift)`.

| Meaning | Use exactly | Do NOT use |
|---|---|---|
| The charge for the delivery trip | **`Delivery fee`** | Delivery charge · Transport fee · Trip fee · Freight · Shipping |
| That charge at a per-target override rate | **`Delivery fee · special rate`** | `Special delivery fee` (it reads as a different charge) |
| That charge reduced because an earlier order already paid the trip | **`Delivery fee · follow-up order`** | `Cross-category follow-up delivery` · Follow-up delivery |
| The extra charged when one order spans two product categories | **`Delivery fee · extra category`** | `Cross-category delivery` · Cross-category surcharge — **`cross-category` is an internal word and may not appear on screen** |
| The amount the store adds by hand | **`Delivery fee · added by store`** | `Additional delivery fee` · Extra fee · Surcharge |
| The operator input that adds to it | **`Add to the delivery fee (optional)`** | Additional delivery fee · Extra charge |
| The operator input naming the earlier order | **`Earlier order this delivery follows (optional)`** | `Previous SO — cross-category link` · Linked SO · Parent order |
| Who sets the rate, beside the section name | **`Head office sets the rate — you can add to it here`** | `Server-priced` · System-priced · Auto-calculated |

| Meaning | Use exactly | Do NOT use |
|---|---|---|
| The bar that appears when something has changed | **`⚠ {n} changes`** with **`Discard`** and **`Save`** | Unsaved changes · You have edits · Save changes · Apply |
| The mark on the document preview while changes are unsaved | **`UNSAVED`** | Draft · Preview · Not saved yet |
| A submitted amendment, above the document | **`⚠ Amendment pending approval: delivery date → {date}`** | Pending change · Proposed · Awaiting sign-off |
| The three-field section that moves the promised date | **`Change delivery date`**, with the note **`creates a Revision · needs approval`** | Amend delivery date · Reschedule · Postpone · `Change delivery date` WITHOUT its note (the note is what carries "this is not a quiet edit") |
| Its three fields, in order | **`Requested date (from customer)`** · **`New delivery date`** · **`Reason for change`** (required) | Request date · New date · Notes · Remark · the retired `Amend …` trio |
| Why the emergency contact is collected | **nothing — the section carries no note** (YH, 2026-08-27; overwrites the 2026-08-15 ruling that required the sentence). `Emergency contact` needs no explaining, and the collapsed summary already says whether one is recorded | Next of kin · In case of emergency · Backup contact · **`Used only if we cannot reach the customer on delivery day`** (the retired note) |
| The management-only door on Sales ownership | **`Change salesperson`** | Request ownership change (that stays the FORM's title) · Reassign · Change owner · **`Change salesperson — needs approval`** (the previous ruling; retired 2026-08-26). The suffix was one of THREE statements of the same fact stacked around an unpressed button — a line above it, the suffix, and a line below. The rule now lives once, on the modal the button opens, where it is read at the moment it is acted on. The verb alone is the door |
| Report a problem, now inside `More actions` | **`Report a problem`** | Raise an issue · Log a complaint · New Service Case |
| The delivery address the customer has not given yet | **`Address not given yet`** | Unknown · Fill in later · TBC |
| A cell with no value, anywhere in a register | **`Not recorded`** | `Not given` · Not provided · None · N/A · — · a blank cell. **ONE word, YH 2026-08-29.** The Sales Orders register printed TWO — `Not given` for a fact the customer never told us, `Not recorded` for one Carres never wrote down — 20 cells against 18 on the same table. The distinction is real and invisible: an operator sees two spellings of empty and must work out whether they differ. `Not recorded` survives because it is honest about EVERY column; nobody *gives* us an invoice number or a showroom. Neither word had ever been registered here, while `lib/locality.ts` claimed `Not given` was governed by this file |
| Billing that repeats the delivery address | **`Billing address same as delivery`** | Same as above · Use delivery address |
| SO goods with order/SKU association but no proven line association (2026-09-11 review) | **`Unit ID link not verified`**; full evidence remains inspectable | Not allocated · silently assigning the same IDs to every matching SKU line |
| Proven SO line Unit IDs exceed its ordered Qty | **`Unit ID count exceeds order quantity`** | truncating the IDs to fit Qty |
| SO expansion read fails | **`Could not load goods details`** · **`Retry`** | Not allocated · Not recorded |
| SO category footer breakdown | **`Qty:`** before category quantities; include **`Other goods`** when counted | a partial breakdown presented as the complete item count |
| Saved SO configuration `gap=KIV` | **`Mattress gap: Confirm later`** — same meaning as the POS configurator | gap KIV |
| The stair-carry count, when the salesperson named none | **`0`** — the box carries the number it means, and the hint states the range (**`0 to {n}`**) | Auto · All · Default · ⛔ **`Empty = every item`** (the retired hint). Unset means NONE from 2026-08-27: somebody says how many pieces need carrying before the customer is charged for carrying them |
| The auto-detected customer type, before a dial-able phone | **`Not known yet`** | — · N/A · Unknown |
| What the ADMIN catalog door is, on its own page | **`The product list, from the selling side — what we sell and what the customer pays…  Costs and suppliers are on the Operations catalog.`** | a feature list (`Manage the SKU master, modular models, combos…`) — it names the tabs the reader can already see and answers nothing. Each door says which SIDE it is and where the other half lives, because the owner could not tell the two apart (2026-08-26) |
| What the OPERATIONS catalog door is | **`The product list, from the buying side — what each item costs us and who supplies it. Selling prices are shown for reference; only the Master Admin can change them.`** | `Isolated from POS selling prices` — that was the old ruling and it is no longer true; the read-only price is the whole point of the alignment |
| The two money columns on a catalog grid, told apart | **`cost = what we pay · price = what the customer pays`** as the grid's own hint | Buying/selling price · Purchase price · RRP · List price — the two words `Cost` and `Price` are the governed column headers; the hint exists because both now sit on ONE row (owner ruling 2026-08-26) and an operator must not have to guess which is which |
| A catalog money cell a role may read but not set | **`Prices: Master Admin only`** | Locked · Read-only · No permission · Contact admin |
| Whether the building has a lift — the QUESTION | **`Lift available?`** | Lift · Lift available · Elevator · Has lift? — the POS has asked it this way since the wizard was written; the object page asked the same fact as an unlabelled tickbox until 2026-08-26 |
| Its two ANSWERS, in this order | **`No lift`** · **`Has lift`** | Yes/No · ✓/✗ · With lift/Without lift · True/False — a tickbox cannot say the difference between *no lift* and *nobody asked*, which is why the answers are named. `No lift` leads because it is the stored default and the answer that costs the customer money. Both surfaces import `LIFT_OPTIONS` from `packages/shared/src/sales-order-form.ts`; neither may retype them |
| Carrying goods up stairs — the CHARGEABLE fact | **`Stair carry`** (two words, no hyphen) | Stair-carry · Staircarry · Carry charge · Portage · Walk-up fee. **The hyphen is correct only as a compound ADJECTIVE** — `stair-carry fee`, `stair-carry items` — and the bare noun never takes it |
| The count of items needing it, as a field label | **`Items needing stair carry`** | Stair carry items · Stair-carry items · Quantity · Qty |
| The sum, shown to whoever keyed it | **`{n} of {m} items × {f} floors above {free}F × {rate} = {total}`** | a bare total with no working-out. Both surfaces print the same sentence from the same `floorSurchargeRaw`; a second copy of the arithmetic is a Law D failure |

`Customer type (auto)`, `Existing customer`, `New customer` and `Checking…` are the Sales
Portal's own words and are printed unchanged on the object page — one fact, one spelling.

| Meaning | Use exactly | Do NOT use |
|---|---|---|
| Printing while the form is dirty | **`You have unsaved changes — printing the saved version`** | Save first · Unsaved · Print anyway |

### The Order Route words (owner ruling 2026-08-16 — OVERWRITES the 2026-08-15 version)

**The route is ONE NODE MAP.** The 2026-08-15 words for a three-section stack (`ORDER TRACKS`,
`GOODS ROUTES`, `DELIVERY RELEASE`) are retired with the layout that carried them; this table is
the only current version.

**`CURRENT` is the Route's position word, and it belongs to a ROUTE.** `YOU ARE HERE` stays
**REJECTED**: a Sales Order stands in up to three places at once, so a phrase that says *here* has
to point at one of them and be wrong about the others.

| Meaning | Use exactly | Do NOT use |
|---|---|---|
| The whole surface | **`Order Route`** | Timeline · Journey · Progress · Flow chart · Diagram |
| A node's heading | **`SALES ORDER`** · **`PURCHASING`** · **`SUPPLIER`** · **`RECEIVING`** · **`STOCK`** · **`LOGISTICS`** · **`DELIVERY DATE`** · **`MONEY`** · **`DELIVERY ORDER`** · **`DELIVER`** · **`DELIVERY PHOTO`** · **`LOAN`** | Step · Stage · Task · any renaming of these |
| Where the work stands on a route | **`CURRENT`** | `YOU ARE HERE` (rejected) · Now · Active · Here |
| The conditional exception strip beside the map | **`LINKED PROBLEMS`** | Issues · Exceptions · Service · Alerts — and never a node |
| The convergence gate | **`DELIVERY ORDER`** | Release gate · Ready check · Can we deliver |
| Its two headlines | **`NOT READY FOR DELIVERY`** / **`READY FOR DELIVERY`** | Blocked · Not ready · OK to go · Cleared |
| The requirement count | **`{k} of {n} requirements met`** | {n} blockers · {n} still open · Everything done |
| The issued document | **`{DO number}`** + **`Delivery order issued`** | Released · Approved · Done |
| The zoom controls | **`Zoom out`** · **`Zoom in`** · **`Fit the whole route`** (aria-labels) | Reset · Recenter · 100% |

**THE GATE REQUIREMENTS — one plain sentence each, with the count that makes them countable.**

| Requirement | Use exactly | Do NOT use |
|---|---|---|
| Goods partly ready | **`Goods not ready ({n} of {m})`** | Partial · Incomplete · Some ready |
| Goods all ready | **`Goods ready ({n} Units)`** | Ready (alone) |
| Goods ready for a scoped partial trip | **`Goods ready for this delivery ({n} Units in, {m} Units still open)`** | Ready (alone) — a met requirement on partial goods must show its scope |
| No company chosen | **`No logistics chosen`** | No carrier · Unassigned · TBC |
| A company is chosen | **`Logistics chosen ({name})`** | Assigned · Booked |
| No agreed day | **`Date + slot not confirmed`** | No booking · Unscheduled · TBC · Appointment not confirmed |
| An agreed day | **`Date + slot confirmed`** | Booked · Scheduled |
| Finance is not holding the delivery | **`No Finance hold`** | Money cleared · Paid enough |
| An OPEN Finance exception holds it | **`Finance is holding this delivery: {reason} — Finance clears it`** | Payment outstanding · Unpaid · On hold · a derived balance sentence |
| Nobody has priced the order | **`No price yet — money does not hold this delivery`** | RM 0 · Unpriced · — |
| The agreed day is a Sunday | **`Date falls on a Sunday — pick another day`** | Invalid date · Not a working day |
| The agreed day is a public holiday | **`Date falls on a public holiday — pick another day`** | Closed · Holiday · Not available |

**⭐ MONEY IS A GATE REQUIREMENT, ABSOLUTE (owner rulings 2026-08-19 and 2026-09-01 — the
2026-08-16 "money left the gate" decision A is overturned).** The gate's money line shows
**`Money in full`** when outstanding = 0, and **`RM {amount} still to collect`** while any of it
is owed; since 2026-09-01 there is no exception path, so no request sentence exists. **The OPEN
Finance exception stays the SECOND, independent money line**, stated with its reason and its
owner because Finance is the only party that can clear it. The collect ACTION and its amount
live on unchanged in the worklist. `docs/orders/MASTER.md` §8 carries the ruling.

**THE MISSING-FACT PHRASES — primary-school English, never a dash.** A node nobody has reached says
what has not happened yet, in the plainest words available:

| Node | Use exactly | Do NOT use |
|---|---|---|
| No Purchase Order covers this quantity | **`No Purchase Order yet`** | `PO: —` · No PO · Not ordered · Pending |
| The supplier has not confirmed a ready date | **`Ready date not confirmed`** | ETA unknown · TBC · — |
| Nothing has been received against the PO | **`Not received yet`** | Not received · GRN: — · Outstanding |
| Part of the PO arrived | **`{n} of {m} received`** | Partial · {n}/{m} |
| Units are short on the line | **`{n} of {m} Units ready`** + **`Waiting for purchase`** | Units not created yet · No stock · Not allocated |
| No company chosen yet | **`No logistics chosen yet`** | No carrier · Unassigned |
| Nobody has agreed a delivery day | **`Date + slot not confirmed`** | Appointment not confirmed · No booking · TBC |
| Not delivered | **`Not delivered yet`** | Pending · Open · In progress |
| No photo on file | **`No delivery photo yet`** | No photo · Missing · — |
| The photo is on file | **`Uploaded by {name}`** + **`Uploaded: {date}`** | Done · Complete |
| A loan item is out | **`{n} {item} on loan to customer`** + **`Collect back on delivery day`** | On loan · Lent · Outstanding loan |
| A loan is still out after delivery | **`Loan not collected back`** | Overdue loan · Not returned |
| A line a Revision removed | **`{item} · Qty {n}`** + **`Cancelled · Rev {n}`** | Removed · Deleted · Void |

**BANNED on this surface, as everywhere:** `No data` · `No results` · `Not available`. Every empty
state answers three things — what is missing, why, and who does what next.

**THE NODE ACTION LINE USES THE QUEUE WORD, and the queue word is the one this dictionary already
owns.** The node is compact and the fact line above it already names the amount or the document, so
the instruction is the short form and never repeats the party or the number.

| Node | Action line | Where the word comes from |
|---|---|---|
| PURCHASING, no PO | **`Issue PO`** | the action dictionary — the ONE act that creates a Purchase Order |
| SUPPLIER | **`Confirm ready date`** | the action dictionary |
| RECEIVING | **`Check in`** | the act on arriving GOODS — **never `Receive`**, which this dictionary bans as a verb |
| STOCK | **`Create the Units`** | the Stock act |
| LOGISTICS | **`Assign logistics`** | the action dictionary |
| DELIVERY DATE | **`Confirm delivery date`** | the action dictionary |
| MONEY | **`Collect`** | the action dictionary's queue word; the amount is on the fact line above |
| DELIVER, after a failed run | **`Arrange new delivery date`** | the action dictionary |
| DELIVERY PHOTO | **`Upload delivery photo`** | the action dictionary |
| LOAN | **`Collect the loan item`** | NEW, registered here 2026-08-16 — the generic form of the card's `Collect the loan sofa`, because a loan is not always a sofa |

**🔴 FIXED IN THE SAME PR (2026-08-16):** the shipped Route said **`Receive the goods`** on its
RECEIVING station. `Receive` as a verb has been banned since 2026-07-27 — the act is `Check in` —
and the string reached production because it was written on a surface nobody cross-checked against
this table. It now reads `Check in`.

**A ROUTE DATE ALWAYS CARRIES ITS MEANING.** The label says WHICH fact the day belongs to, and the
day itself is spelled by `fmtDate` under the year rule (`Wed, 12 Aug`). **A bare date never ships.**
The source may contain a full timestamp; the Route prints only the governed date. ISO timestamps
such as `2026-08-12T04:38:44.852046+00:00` never appear to staff. The Sales Order node is evidence
inside the object already open, so it has no circular `Open SO-{n} →` action.

| Fact | Prints |
|---|---|
| The day the order was taken | **`SO Date: {date}`** |
| The day the customer asked for | **`Customer requested: {date}`** |
| The day the delivery is due | **`Due: {date}`** |
| The day the Purchase Order was issued | **`Issued: {date}`** |
| What the supplier confirmed | **`Estimated ready: {date}`** |
| The day the goods arrived | **`Received: {date}`** |
| The agreed delivery day | **`Delivery appointment: {date}`** |
| The booked day, before it happens | **`Scheduled: {date}`** |
| The day it was delivered | **`Delivered: {date}`** |
| The day the photo went on file | **`Uploaded: {date}`** |

**THE EDGE WORDS.** A connector may carry a small grey label, and only these:
**`goods`** · **`(same line)`** · **`delivery`** · **`money`** · **`loan`** ·
**`{item} · Qty {n}`** · **`{n} to buy from factory`** · **`collect back`**.

**`Logistics`, never `Carrier`** — already this dictionary's word for the delivery module,
restated here because the Route names the party on the delivery side and a second spelling on a new
surface is how a dictionary splits.

### The Sales Order amendment words

| Meaning | Use exactly |
|---|---|
| Open the governed customer-change form | **Propose a change to the customer** |
| Persist the proposal without changing the order | **Record the proposal** |
| A submitted proposal awaiting its authorised decision | **Waiting for management** |
| Impact heading before a decision | **Before approval** |
| Decision field | **Management decision reason** |
| Negative decision | **Reject** |
| Positive decision that atomically creates the next revision | **Approve and apply** |
| Re-propose a complete historical version as a new governed change | **Propose this version again** |
| Stale proposal state/action | **Out of date — propose again** |
| Contract term field | **Instalment months** |
| Unknown promised date | **Delivery date to be confirmed** |
| Empty immutable-version view | **No revisions recorded** |
| Empty event-ledger view | **No history recorded** |
| Those two views while the read is IN FLIGHT | **`Opening the revisions`** · **`Opening the history`** |
| Those two views when the read FAILED | **`These revisions could not be opened`** · **`This history could not be opened`**, with `Try again` |

⭐ **AN EMPTY SENTENCE MAY NEVER DOUBLE AS A FAILURE SENTENCE (2026-08-28).** The two rows above
exist because the ledger had neither a loading state nor an error state, so a 403, a 500 or an
expired token fell straight through to `No revisions recorded` — **a permission refusal rendering
as a factual claim about the order.** `No revisions recorded` says Carres looked and found none;
only a screen that actually got an answer may say it. The same rule binds every empty state in
this document: if a surface can fail, its empty word is not allowed to describe the failure.
| The drawer panel listing who to ring, one row per outside party | **Calls** | Chase Now · Actions · Follow-ups · Contacts — `Actions` is the ROW's open-action list and one word may not head two blocks (Jess 2026-07-28, PR #487); the panel's own empty state has read `0 calls to make · everything on track.` since C1, so the title is that sentence's noun, not a new word |

## The Purchase Order lifecycle words — CANONICAL HOME (Loo, 2026-07-29 · frozen by P6)

**Every Purchasing word lives here. No other file may redefine one; they reference this
section.** `docs/purchasing/MASTER.md` owns what the actions DO,
`docs/purchasing/MASTER.md` owns where the facts sit — neither respells a word.

**A Purchase Order and a customer order are different subjects, but neither uses a vague visible
`Open` status.** A numbered PO without a current-version sending confirmation shows `Sending not confirmed`; it is not called `Draft`, `Prepared` or `Pending`.

**Action ≠ Status. They may never be mixed.** An action is something a person does and it
LEAVES when its outcome is recorded. A status is what the PO currently is.

### Operation facts and current sending labels

| # | Label | Means |
|---|---|---|
| 1 | **`Waiting for goods from supplier`** | current-version sending is recorded and goods remain pending |
| 2 | **`In Production`** | supplier fulfilment is underway |
| 3 | **`Receiving`** | physical goods receipt has started |
| 4 | **`Completed`** | the PO is fully received and no remaining purchasing action exists |
| 5 | **`Cancelled`** | the PO will no longer be fulfilled |

**`Open` is never a visible Purchase Order status.** Register groups are
`Confirm PO sent to supplier`, `Waiting for goods from supplier`, `Completed`, `Cancelled`.
These revised labels are BUILT 2026-09-17 (SLICE 1) · authenticated walk OWED (approved Jess, 2026-09-17). Existing internal state keys
are not renamed merely to change display copy. There is no `Acknowledged` state; a sending
confirmation does not prove supplier receipt, reading or acceptance.

**Supplier Status is a SEPARATE axis** — what the factory and the logistics company report.
It is never merged into the five above, and it is not Purchasing's to redefine: two external
roles run their whole lifecycle on it.

### The Purchasing nouns and facts

| Concept | Canonical word | Do NOT use |
|---|---|---|
| Demand somebody has consciously reviewed and delayed | region **`Purchasing on Hold`** · row fact **`On hold until {date}`**, carrying **Held by** · **Reason** · **Held time** · **Resume date** | Snoozed · Paused · Excluded · Hidden · Pending |
| An item whose supplier cannot be worked out | **`Supplier not assigned`** — a FACT, under Missing Configuration. Supporting line: `Assign a supplier before this item can enter the purchasing plan.` | Orphan · Unknown supplier · Invalid SKU · Supplier error |

### Purchase Orders detail quantities and Register version evidence

**The Register has NO `Work` column.** A Register lists documents and authoritative facts; actions
live in My Work, Team Work, the Purchase Order detail and Order Route (the shared UI law in
`docs/ui/MASTER.md`). No register cell carries an action sentence, an owner avatar, an owner name
or a duty holder. A cell's second line is supporting EVIDENCE only (`PO V1` / `WhatsApp · Thu, 4
Sep`), never an instruction (`PO V1` / `Send the new version to supplier` is banned as a cell).

| Fact | Canonical word | Do NOT use |
|---|---|---|
| Total quantity on the current PO | **`Order Qty`** | Ordered (as this column) · Qty |
| Correct and accepted quantity posted through Receiving | **`Received Qty`** | Received (bare) |
| Order Qty − Received Qty — pieces, never money | **`Pending Delivery Qty`** | Open Balance · Open · Outstanding |
| The current official document version | **`PO Version`**, valued `PO V1` · `PO V2` · `PO V3` | Current Version · Version 1 · PDF Version 1 |
| Current version sending evidence, inside PO Version on the listing | **`PO sent to supplier · {channel} · {date}`** / **`Sending not confirmed`** | Supplier Has · No current PDF |

The three quantity words above remain in PO detail and receiving progress, not PO listing columns
or its footer. Damaged, wrong and extra goods never reduce `Pending Delivery Qty`.

The structured work sentences survive unchanged where actions live — My Work, Team Work, the PO
detail's work card and Order Route:

| Fact (line 1) | Action (line 2, with structured owner avatar) |
|---|---|
| `The PO PDF has not been sent` | `Issue the purchase order to {supplier}` |
| `Supplier has not confirmed the PO date` | `Ask {supplier} to confirm the PO delivery date` |
| `The supplier delivery date passed on {weekday, date}` | `Ask {supplier} when the goods will arrive` |
| `The balance delivery date is missing` | `Ask {supplier} for the balance delivery date` |
| `PO V{n} has not been sent` | `Issue PO V{n} to {supplier}` |
| `Supplier changed the price` | `Ask the commercial approver to check the new price` |

The avatar is metadata, not part of the sentence. The PO and supplier are not repeated where their
columns already identify them. Completion comes from the named authoritative fact; there is no
manual `Done` tick.
### Why a purchase order was refused — CANONICAL HOME (CARD-2026-08-22-purchasing-02, 2026-08-24)

Every refusal on the Purchasing buying journey uses the portal two-line shape — LINE 1 the FACT,
LINE 2 the ACT with its object, who is asked and what completes it — and there is exactly ONE place
the words live: `packages/shared/src/purchasing-refusals.ts`. The API sends both lines, both surfaces
render both, and a refusal raised in SQL is translated into them rather than shown raw. Written three
times the same refusal becomes three sentences, and the operator learns that the message is
unreliable rather than that the document is blocked.

The load-bearing ones, verbatim:

| Refused because | Line 1 · the fact | Line 2 · the act |
|---|---|---|
| The caller is not today's PO actor | `You do not hold PO duty today.` | `Ask {name} to issue this purchase order.` |
| No duty holder is set for the month | `Nobody holds PO duty this month.` | `Ask management to set this month's PO duty holder.` |
| Catalog's price moved since the review | `{sku} costs a different price now.` | `Go back to buying and check the new price before you issue.` |
| Nobody checked the price of a line | `{sku} has no checked transaction cost.` | `Check the cost of {sku} on this page, then issue again.` |
| An exception has no manager's approval | `Nobody approved this price for {sku}.` | `Ask a manager to approve the price of {sku} for {supplier}.` |
| Catalog holds no price at all | `{sku} has no transaction cost.` | `Set the cost of {sku} in Catalog.` |
| A manager would approve their own exception | `You cannot approve a price you will use yourself.` | `Ask another manager to approve this price.` |
| The Deliver To split does not add up | `You arranged {n} units and must buy {m}.` | `Change the Deliver To split so the units add up, then issue again.` |
| A matched set was split across two places | `A sofa set cannot go to two places.` | `Send the whole set to one place, then issue again.` |
| The document on screen is out of date | `The purchase orders on screen are out of date.` | `Go back to buying, then open Review Purchase Orders again.` |
| The purchase order changed after rendering | `{po} changed after you opened it.` | `Open the new PDF, send it, then record it as sent.` |
| The day's number pool is exhausted | `Today has no purchase order number left.` | `Tell IT today. Issue this purchase order tomorrow.` |

Rules that bind every line, and are proved by test rather than reviewed:

- **Banned outright**, here as everywhere (one ruled exception: the Payment Monitor's rail FILTER
  `Needs attention`, owner ruling 2026-09-12 — a filter that gathers every row carrying a
  non-`Wait` action, never a state word on a row): `Needs attention` · `Next action` · `Something went
  wrong` · `Pending` · `Waiting` · `Priority` · a bare `Follow up` · `Invalid` · `Failed to`.
- **Fourteen words maximum per line**, and each line ends as a sentence.
- A refusal **names the SKU, supplier, document or destination** it is about whenever the server
  knows it; where it does not, a plain noun stands in — never an empty gap.
- An unrecognised code still names an act: `The Portal refused this purchase order.` /
  `Nothing was created. Tell IT the message on screen.` A message with no act is the defect the
  file exists to remove.
- **Nothing is created when a refusal fires.** The batch is atomic, so the operator stays where they
  were with the selection intact.

### Purchasing report words — central Reports and Register exports

Purchasing has no `Report` sidebar page or module tab. Central `Reports` and Register export may
use the exact measure words `POs`, `Ordered`, `Received`, `Outstanding` and `Total`. They
may also show Supplier, Category and exact date filters. There is no generic `Status` facet.

Operations reports contain quantity, Unit, supplier-performance and work facts. Supplier cost,
invoice, credit, settlement and payment amounts belong to Finance. An export is a snapshot, not a
second editable truth.

**Outbound channel is evidence, not a lifecycle status.** WhatsApp and Email may vary by supplier.
The recorded-send condition is complete only when staff confirm sending the current PDF version and the Portal records
recipient, channel, actor and time. Opening WhatsApp/email is not proof. Supplier silence does not
create an `Acknowledged` state.

**The eight terminology slots that stood open from 2026-07-29 are CLOSED by this section.**
Every word above is ruled. No terminology placeholder is left in Purchasing, and a chat that finds
one has found a document that was missed.

## ⭐ THE YEAR RULE — owner ruling 2026-08-15 (Chai), portal-wide

**`Wed, 12 Aug`. The year appears only when it is not the current year.**

```
Wed, 12 Aug        a date in the year the operator is living in
Fri, 15 Jan 27     a date that is not — and now the year IS the news
```

**One formatter, ERP-wide.** `fmtDate()` in `@/lib/fmt-date` — Register columns, object dates,
Order Route, Activity, Calendar day headers and chips, Work rows, every one of them. There is no
second date formatter and no page may compose one.

**Why the year goes.** Nine dates in ten on an operational screen are this year. A `26` repeated
down a column answers nothing and costs width in the one column that has none to spare — and
because it is always there, it stops being read. **Dropping it turns the year into a signal:**
the moment `27` appears, it is carrying the whole meaning, and the operator sees it.

**Why the WEEKDAY never goes.** The no-relative-date-words rule above means an operator reads
the day off the date itself. `12 Aug` does not say whether the truck moves on a working day;
`Wed, 12 Aug` does. The year is context the reader already has; the weekday is not.

**THE ONE EXCEPTION: a PRINTED DOCUMENT always carries its year** — `fmtDate(iso, { year:
"always" })`. A screen is read today, so "this year" is a fact the reader is holding. A service
note or a receipt is printed, filed and re-read in a later year by a customer or a technician
who is holding nothing, and `Request Date: Wed, 12 Aug` has lost a fact the document exists to
carry. **It is an option ON the one formatter, never a second formatter.**

**The compact spelling is the ruled date LESS ITS WEEKDAY, not a second rule.** `fmtDateShort()`
prints `12 Aug` / `15 Jan 27` for a date inside a sentence — `received 12 Aug`, `due 12 Aug` —
where the sentence already says what the day is for. It reads the year off the SAME predicate
`fmtDate` does, so the two can never disagree about a day. A date COLUMN always uses `fmtDate`.

**`fmtMonth()` is untouched: `Jul 2026`.** It names a PERIOD in a switcher, where two adjacent
entries may sit either side of a year boundary and the year is what tells them apart.

**A BUSINESS ENGINE SPELLS NO DATES — it hands its caller DAYS and no words.** This is the same
rule the `dayWord()` deletion established, and it caught a fifth spelling: `workDayLabel` in
`packages/shared` fed the Work rows and Work day headings through `toLocaleDateString` (banned
above), dropped the comma so a Work row and a Register cell named one day two ways, and printed
NO year ever — indistinguishable from this rule until the work is due in another year, at which
point the heading hid the one fact that made it urgent. It is deleted, with `WorkItem.dueLabel`
and `WorkDayGroup.label`. A `WorkDayGroup` now carries `dayIso`, and the screen spells it.

**Enforcement is structural.** The year is decided in ONE predicate that every spelling in the
module calls, `fmtDayChip` is deleted, and the three page-local no-year formatters built by
string surgery on top of these — `railDayLabel` in To Order and Purchase Orders, `dayMon` in the
Order Detail drawer — are deleted with it. `work-engine.test.ts` asserts the engine exports no
label function and its items carry no label field. They were regexing off a year the formatter should
never have printed; the compensation is now the rule. `fmt-date.test.ts` pins the clock and
asserts the module exports exactly three functions, so a fourth spelling cannot be added quietly.

**A test may never hard-code a dated spelling.** "This year" moves. An expectation written as
`"Wed, 12 Aug 26"` asserts the wrong thing for half of every year and starts failing on 1
January with nothing deployed. Build the expected string with `fmtDate()`, or pin the clock.

## ⭐ CUSTOMER NAME — CAPITALIZE UP ONLY — owner ruling 2026-08-15 (Chai)

**Raise a word's first letter. Never lower a letter that is already raised.**

```
jimmy          →  Jimmy
mei emi        →  Mei Emi
KJ NG          →  KJ NG            ← initials survive
LIM KUAN YANG  →  LIM KUAN YANG    ← unchanged
```

**Why one-directional.** A title-caser that lowercases the tail is guessing that the capital was
an accident. On a Malaysian customer list that guess is wrong often enough to be a defect: `KJ`,
`TCF`, `AL` and the `Sdn Bhd` company forms are initials and acronyms, and `Kj Ng` is not the
reader's name. **Raising a letter can only ever fix a name typed in a hurry; lowering one can
destroy a name that was typed correctly.** So the rule only moves in the safe direction.

**Display only. The record keeps exactly what was typed.** This never runs on write, never
reaches an import, and no migration normalises the column. It is a lens, not a correction —
which is also why it must have ONE home: a name shown three ways on three screens reads as three
customers. `displayCustomerName()` in `@/lib/customer-name`, and no page-local copy. The one
that existed — `properCase` in To Order — had the WRONG rule and is deleted.

**Where it applies — EVERY surface that names a customer, owner ruling 2026-08-15.** The
Register's Customer column and its search, filter and export · the object header and CUSTOMER
card · Payments · Order Route · Activity · Work rows · the Quick Rail's Team, Calendar and Work
peeks · the Delivery workspace · **the WhatsApp greeting** · **every PDF document**.

**The WhatsApp greeting obeys the same rule.** `titleCaseName()` used to soften `LEE WEI YANG`
into `Lee Wei Yang` for politeness. The owner ruled it out, because the same guess that softens
a shouted name also turns `KJ NG` into `Kj Ng` — **and a message addressed to `Kj` is addressed
to nobody.** The function is DELETED rather than re-pointed at the shared helper: a second name
for one rule is how two rules come back. `salutationOf()` calls `displayCustomerName`, and the
preferred-name field still wins over both.

**A PDF prints what the screen prints,** and the helper is applied **in the TEMPLATE, not in the
payload each caller assembles.** That placement is the rule, not an implementation detail: there
are many doors into a document — the workspace, Payments, a regenerated historical PDF — and a
rule applied at each door is a rule that one new door will miss. Applied at the render, every
door and every later regeneration passes through it. A document whose casing disagrees with the
register it was raised from reads as a different customer.

**The ONE place it does not apply, and the boundary is deliberate: an EDIT field.** An input
stays on the raw stored value, because a cased field writes its casing back to the record on
save — which is the one thing this rule forbids. Display-only means display-only.

**Enforcement is structural.** `wa-templates.test.ts` asserts the module exports no second
casing entry point. `pdf/customer-name-display.test.ts` scans every `*-template.tsx` source —
not a render, because a render test only sees the branches its fixture reaches, and a signature
caption is exactly the branch a fixture forgets — and fails if any customer name reaches a
render unwrapped.

## ⭐ NO RELATIVE DATE WORDS — owner ruling 2026-08-15, portal-wide

**A date on screen names its actual day. `Today` and `Tomorrow` are not dates.**

The ban already existed in three places — the delivery word table, the rail day-row rule and
the 2026-08-14 delivery execution words. Each carved out its own exception, and the exceptions
were where the words survived. **The owner generalised the rule and deleted the carve-outs.**

| Where | Print | Never |
|---|---|---|
| A day heading / schedule group | **`Sat, 15 Aug`** (`fmtDate`) | `TODAY · 15 AUG 26` · `Today` · `Tomorrow` |
| A day CHIP | **`Sat, 15 Aug`** (`fmtDate` — the same string) | `Today` · `Tomorrow` |
| A range that spans days | **`This week`** | `Next 7 days` · `Week view` · `Upcoming` |
| A plan day that IS today (Payment Monitor rail, owner ruling 2026-09-16) | **`Tue, 15 Sep`** with the marker **`Today`** beside it — the date is always printed; the marker never replaces it and never lands on a weekend, a holiday or another day | `Today` alone |

**The chip row used to name a second formatter, and no longer can.** `fmtDayChip` existed
because a ~100px chip could not afford the year; THE YEAR RULE below drops the year from every
current-year date, so the chip's spelling and the portal's spelling became one string and the
second function is DELETED. A single-day chip also lost its hover: the full ruled date is now on
the chip's face, and a tooltip that repeats — or says less than — the thing it explains is a
defect, not a courtesy. A SPAN chip keeps its hover, because `This week` names no date.

**Why it is not a style preference.** A relative word is true only on the day it is read. It
rots in a screenshot, it re-sorts itself overnight, and an operator reading `Tomorrow` on a
chip at 00:05 is reading a lie about the day the truck moves. **`This week` survives because it
is a SPAN, not a day** — no date can spell it, and it stays true for its whole range.

**THE ONE EXCEPTION, and it is a different fact: a HISTORY group.** `Today · Yesterday ·
Earlier` remain the ruled headings for an append-only history (`ui/MASTER.md` §6.4 ⑦), because
a history group is *recomputed live over the past* — an event correctly moves from `Today` to
`Yesterday` as time passes, and the grouping never claims a specific day. A FUTURE date labelled
`Tomorrow` is a claim about one day, and that is what this rule bans. **Do not "fix" the history
headings, and do not cite them as licence for a relative future date.**

**Enforcement is structural, not vigilance.** `dayWord()` — the shared helper whose only product
was `Today` / `Tomorrow` — is DELETED, and `DeliveryRange` no longer carries a `label` field.
A range hands its caller DAYS and no word, so there is nothing left for a screen to print.

## The delivery calendar words (T10, locked with Jess 2026-07-27)

A calendar day answers ONE question: **which trucks move that day.** A day is
therefore filled by the BOOKING, never by the date we promised the customer —
those two dates diverge the moment anything is rescheduled, which is why D1
split them.

| Concept | Canonical word | Do NOT use |
|---|---|---|
| The three calendar views | **`Sat, 15 Aug` · `Sun, 16 Aug` · `This week`** — the two single-day views name their day (owner, 2026-08-15; this row read `Today · Tomorrow · This week` until then) | `Today` · `Tomorrow` · Next 7 days · Week view · Upcoming |
| The customer said yes to this date | **Confirmed** (+ the slot, e.g. `12pm–3pm`) | Booked · Locked · Scheduled |
| Only logistics have named this date | **Logistics' date** | Provisional · Tentative · ETA · Pencilled in · Carrier's date |
| Promised on this day, no booking yet | **Promised this day, no date yet** | Unscheduled · Not booked · Unbooked · Pending · anything with "needs" |
| No logistics picked yet | **No logistics picked** | Unassigned · TBD · No carrier · — |
| Nothing booked on a day | **No deliveries booked this day.** | Empty · Free · Nothing |

- **"This week" means the REST of this week** — today through Saturday. Sunday
  is never in a delivery range: it is refused for every logistics company.
- A promised-but-unbooked order is never COUNTED as a delivery. It is listed
  under its own heading with the call that fixes it
  (`Call {customer}` over `Book the delivery date`), so a day never reads as empty when
  work is sitting on it, and never reads as booked when nothing is.
- Confirmed is the ONLY green on the calendar, exactly as in the Orders list's
  Delivery column (T1). The logistics company's own date is amber, always.

## The delivery window words (locked with Jess 2026-07-27)

**How long a delivery takes depends on the building**, and the POS already asks: the
customer step carries a building type (`Landed · Condo · Apartment · Office · Retail ·
Other`), stored in `entry_data.fields.building_type`. Today **nothing reads it** — it is
printed in the drawer and no rule uses it.

| Building type | The window | Why |
|---|---|---|
| `Landed` · `Retail` | **Full-day delivery** | the truck drives up to the door |
| `Condo` · `Apartment` · `Office` | **Half-day delivery** | the lift must be booked and the driver must report in |
| `Other` / not filled | **Full-day delivery**, and the booking is refused until it is filled | see the ruling below — the refusal STANDS |

**Building type is MANDATORY at go-live, and the blanks are not a reason to soften it**
(Loo, 2026-07-28). Measured live 2026-07-28, and the split matters:

```
37 AutoCount import rows   37 blank   0 filled   ← test data, gone at go-live
19 portal orders            3 blank  16 filled   ← the POS does NOT require the field TODAY
```

Those **3** are the real finding, not the 37. They are portal orders, and they are blank
because the POS writes the field only when it is non-empty — so "mandatory" is a change the
POS still has to make, not a state it is already in. The 37 disappear by themselves when the
database starts clean.

**Therefore the rule is not softened to fit them.** "No building type → no booking" stands as
written. This is CLAUDE.md's standing law made concrete: *test data is evidence about whether
CODE WORKS, never a reason to change what the business does.* A chat that meets those 40
blanks must not propose a default, a grandfather clause or a "legacy" branch — it must check
whether the row is an import, and the answer is that all 40 are.

Fixed phrasings — reuse, never invent a variant:

- The fact: `Half-day delivery · condominium` · `Full-day delivery`
- The refusal: `Fill in the building type first — a condominium can only take a
  half-day delivery.`

**Never** write "access restrictions", "site constraints", "delivery window policy" or
"lift booking required" on screen. Say what the building is and how long the truck has.

## The Delivery Order DOCUMENT words (blueprint card, owner ruling 2026-08-16)

The Delivery listing and the DO object page speak these words and no others. The status set is
the document's own lifecycle — registered here and in
`STATUS-STANDARD.md`; the ONE arithmetic is `deliveryOrderStatusOf` in `packages/shared`.

| Meaning | Use exactly | Do NOT use |
|---|---|---|
| The sidebar door / one workspace | **Delivery** | Delivery Work · Delivery Orders · DOs · Dispatch |
| A fresh document, no run yet | **Created** | New · Open · Pending |
| Goods received by logistics, not yet resulted (derived from the §4 chain's `Received by logistics` fact, 0363 — never from the calendar) | **Out for delivery** | In transit · Dispatched · On the way |
| The trip completed | **Delivered** | Done · Complete · Closed |
| The trip did not complete | **Delivery exception** + its ONE reason from the T4 Reason Library | Failed · Problem · a second word list |
| A voided document | **Cancelled** + `Order cancelled` / `Rescheduled` | Deleted · Void · Removed |
| No date on the document | **No delivery date yet** | — · TBC · N/A |
| The register's empty state | **No delivery orders yet — the system issues one when a trip's goods, logistics and date are ready. The Order Route on each Sales Order shows what is still open.** | No data · No results |
| An order's row before the document exists (drawer / detail) | **No delivery order yet — the system issues it when the goods, logistics and date are ready** | — · Not issued · a button |
| The reprint promise (Print hover) | **Reprint carries the same number** | Duplicate · Copy |

The T4 Reason Library gained the card's four remaining exception reasons —
`Goods damaged` · `Wrong goods` · `Delivery photo missing` · `Loan not collected back` — in the
library itself (`delivery-reasons.ts`), never as a second list. **No Release, Approve or Issue
button exists anywhere on this surface**: the SYSTEM issues the document
(`../orders/MASTER.md` §8).

## The Delivery module words (CARD-2026-09-04-delivery-01 — overwrites the 2026-08-24 one-word ruling)

The Delivery module carries TWO navigation destinations under the module word **Delivery**:
**Monitor** (`?tab=delivery`) and **Delivery Orders** (the formal-document register). The DO
object page is a door on a number, never navigation. **The Edit Delivery page is retired (owner
ruling 2026-09-13)**: every arrangement write lives inside the Monitor row's expanded panels.
`Delivery Work` remains banned; a formal DO remains a Delivery Order and its number remains a
door.

| Concept | Canonical word | Do NOT use |
|---|---|---|
| The module | **Delivery** | Delivery Work · Deliveries |
| The daily delivery page and its sidebar child | **Monitor** | Schedule · Board · Overview · Dashboard |
| The register page and its sidebar child | **Delivery Orders** | DO list · Documents |
| No confirmed operational date | **No confirmed date** | Unscheduled · Pending · No ETA |
| Confirmed date is behind today with no result | **Overdue** | Date passed · Late delivery |
| Calendar product receipt evidence (2026-09-14) | **Received Qty**; unknown **Receipt not verified**. Details: **Receipt for this product line. Delivery and current location are separate.** These refer to explicitly bound stock records, not SKU-pooled availability or payment release. | assuming an unbound or missing row means not received |
| No formal DO exists yet | **DO** in the Monitor DO No cell (owner correction 2026-09-14), muted and non-interactive; tooltip and accessible name **No delivery order yet**. Detail explanations keep the full absence wording. | Not issued · Create DO · Issue DO |
| Compact calendar card's existing-DO door | **Open DO**. The accessible name includes the actual DO number; the full number remains at the top of the card. Without a DO, keep **Edit Delivery** and the existing arrangement route. | repeating the entire DO number in the visible footer |
| Open the formal document | the actual **DO number** | View DO · Details |

A Monitor card carries the arrangement facts, DO number and Delivery Status in one place. This
does not merge their authority: Delivery arrangement remains editable operational truth (edited
inside the Monitor row's expanded panels, never on the calendar card) and the issued DO remains a
formal historical document.

**Monitor + Delivery Orders register words — owner UI correction 2026-09-06.** The correction
ruled these strings (the 2026-09-04 `NEEDS CHECKING` / `DELIVERY SCHEDULE` proposals are
RETIRED — the rail is ONE `WORK TO DO` group):

| String | Where it appears | Status |
|---|---|---|
| `Monitor` | the page title and sidebar child | **RULED 2026-09-06** (carried in the correction's own wording) |
| `WORK TO DO` | Monitor's one work group, and the Delivery Orders register's queue group — the same word Purchasing's rail already governs | **RULED 2026-09-06** |
| `Day` · `Week` · `Month` | Monitor's calendar-view control in the page toolbar; `Week` is the desktop default | **RULED 2026-09-07** |
| `All delivery work` | the WORK TO DO row listing every open scope — the unfiltered selectable listing | **RULED 2026-09-06** (month-calendar correction) |
| `STATE` · `LOGISTICS` | Monitor's second and third rail groups. The State dropdown offers **All states**; the Logistics dropdown offers **All** under its visible **LOGISTICS** heading. Each clears only that filter. | `REGION` · `LOGISTICS PARTNER` · `All partners` |
| `Deliveries {n}` · `Exceptions {n}` · `No logistics picked {n}` | the Month view's compact cell lines, label then count (the rail row grammar); `Exceptions` = the Overdue + Failed Delivery + Upload delivery proof rows of that date; zero lines are omitted | **RULED 2026-09-07** (`Unassigned` stays banned — the third line reuses `No logistics picked`) |
| `{n} deliveries` / `{n} of {m} deliveries` · `No deliveries` · `No matching deliveries.` | Monitor's work-list footer and empty states; `1 delivery` / `{n} deliveries` on the Assign logistics door | **RULED 2026-09-07** (`delivery scope(s)` RETIRED from every employee surface) |
| `Calendar view` | the Day · Week · Month control's accessible name only | **RULED 2026-09-07** |
| `Previous month` · `Next month` | the rail month calendar's arrow labels (the month itself prints locale-aware, e.g. `SEPTEMBER 2026`), and the toolbar arrows while `Month` shows (`Sep 2026` in the one month spelling) | **RULED 2026-09-06** (month-calendar correction) |
| `No deliveries` | one individually empty calendar day (the long T10 sentence is retired on Monitor) | **RULED 2026-09-06** |
| `No deliveries are scheduled from {first} to {last}.` | the ONE spanning state of a fully empty visible range | **RULED 2026-09-06** |
| `{n} deliveries need a confirmed date.` / `1 delivery needs a confirmed date.` | under the spanning state, from the REAL count only | **RULED 2026-09-06** |
| `Open No confirmed date` | that state's one door | **RULED 2026-09-06** |
| `Clear filters` | the combined active-filter summary above the work list | **RULED 2026-09-06** |
| `{N} selected` · `{N} delivery orders selected` | the Monitor and Delivery Orders selection toolbars respectively | **RULED 2026-09-07** |
| `Print {N} delivery orders` | the register's selection output | **RULED 2026-09-06** |
| `Record delivery result` · `Upload delivery photo` · `Upload signed Delivery Order` · `Check delivery proof` | the register's WORK TO DO queues. `Check delivery proof` joined on 2026-09-13 with the §6.1 proof-review record (0489): a delivered or partially delivered result whose newest file no review has judged | **RULED 2026-09-06**, fourth queue **BUILT 2026-09-13** |
| `Proof Accepted` · `More Proof Required` · `Proof Rejected` | Operation's three review acts on the DO object's `Evidence` section (`delivery/MASTER.md` §6.1); the latter two require a `Reason`. The same three words print the review state and its history line (`{word} · {reason} · {date} · {reviewer}`), the Monitor status second line (`Proof Rejected · {reason}`) and the History entry | **RULED 2026-09-13** |
| `Evidence` | the DO object's §9 section: every file bound to the delivery it proves, the signed paper, the proof review. It replaces the pre-ruling `Delivery photo` and `Signature / proof` panels | **RULED 2026-09-13** |
| `Proof review` · `Not reviewed yet` · `Save review` · `Reason` | the Evidence section's review block: its heading, its absence, its one save word, its reason field | **RULED 2026-09-13** |
| `Save signed Delivery Order` · `Signed Delivery Order file` · `Received & signed by` | the in-panel attach form behind `Upload signed Delivery Order` on a delivered or partially delivered document; the file is filed against the latest attempt and re-records nothing | **RULED 2026-09-13** |
| `No files from this delivery yet` · `No delivery result recorded yet — evidence binds to the delivery it proves.` | the Evidence section's two absences | **RULED 2026-09-13** |
| `Proof review saved` · `Signed Delivery Order saved` | the two toasts | **RULED 2026-09-13** |
| `Route` | the DO object's Delivery details fact on a Journey leg's document — `Klang WH → JB transit`, never a `Leg` word | **RULED 2026-09-13** (Card 14) |
| `Arrived` · `Record arrival` · `Arrival recorded` | an INTERMEDIATE Journey leg's result chooser word, its one save word and its toast — the goods reached the named warehouse, the customer leg still owes its result | **RULED 2026-09-13** (Card 14) |
| `Return to Warehouse for checking` · `Release the reservation` | the two actions for a Unit that did not reach the customer (the retired `Hold for Inspection` / `Return to Available`); the first plans the Inbound arrival, the second is the commercial release | **RULED 2026-09-13** (Card 14) |
| `Failed Delivery return` · `DO No` | the Inbound arrival kind of goods coming back from a failed visit, and its Document word when the source is the Delivery Order the goods went out on | **RULED 2026-09-13** (Card 14) |
| `Loan offer` · `No loan offered` · `Offer a loan` · `Record the offer` · `Customer accepted` · `Customer declined` · `Record the answer` | the Sales Order drawer's loan-offer block (0492, Delivery MASTER §14.2): its heading, its absence, the offer door, its save word, the two answer doors, the decline's save word | **RULED 2026-09-13** (Card 15) |
| `Loan offered` · `Customer accepted the loan` · `Customer declined the loan` | the three record words — the block's state line, its history and the order's History line | **RULED 2026-09-13** (Card 15) |
| `Waiting for the customer's answer` · `Prepare the loan Unit` · `Record the customer's answer` · `Lend out the loan Unit` | the Order Route LOAN node's second line and action while an offer is open or accepted and no item is out yet | **RULED 2026-09-13** (Card 15) |
| `Loan {Unit ID} · collect back on delivery day` | printed with the EXACT Unit ID on Monitor panel 4 (one line per loan Unit out) and on the DO object's Loan collection | **RULED 2026-09-12**, Unit ID **BUILT 2026-09-13** (Card 15) |
| `Delivery Order` · `Delivery history` · `Warehouse handover` · `Evidence` · `Exceptions` · `History` · `Related records` | the DO object's seven governed sections (`delivery/MASTER.md` §9), one scroll of kit `Panel`s, no tab strip; `Loan collection` renders between Evidence and Exceptions only while a loan exists | **RULED 2026-09-13** (Card 16) |
| `Goods on this trip` · `The document` · `Rendering the document…` · `The document could not be rendered here — Print opens the same document.` | inside section one: the trip's lines, and the live document rendered by the governed DO renderer (the same bytes `Print` opens), its loading word and its failure | **RULED 2026-09-13** (Card 16) |
| `Warehouse` · `ETA` · `Building type` · `Floor` · `Lift` · `No lift` · `Stairs` · `Access` · `Customer request` · `Instruction for logistics` · `No warehouse recorded` · `None recorded` | section one's site and arrangement facts and their absences (`Not recorded` remains the plain absence) | **RULED 2026-09-13** (Card 16) |
| `Delivery on {day} · {result}` · `Goods: {location}` | the Delivery history entry and its second line | **RULED 2026-09-13** (Card 16) |
| `No open problems` · `Finance is holding this delivery — {reason}` · `Payment approval requested — {reason}` | the Exceptions section's absence and its two money problems (a failed or partial visit prints its result and reason; the Work action lines follow with their owner) | **RULED 2026-09-13** (Card 16) |
| `Open Payments →` · `Open Unit {Unit ID} →` · `Open Case {Case No} →` · `Open {DO No} →` · `No exact Units recorded on this document` · `Service Cases could not be read` · `No Service Case on this order` · `No other delivery order on this Sales Order` | Related records' doors (beside `Open SO-{n} →` and `Open Order Route →`) and their absences | **RULED 2026-09-13** (Card 16) |
| `Opening SO-{n}` · `Sales Order not found.` · `Back to Sales Orders` | the Sales Order object page opened by its NUMBER (`/operation/orders/so/SO-1362`): the one-moment loading word while the number resolves to the id, the absence when no order carries that number (the existing Unknown-SO word, reused), and its door | **REGISTERED 2026-09-13** (Delivery Card 19 — a number and an id open the same page; the owner may re-word) |
| `Check the delivery proof` / `Accept it, ask for more, or reject it` · `Delivery proof not reviewed` | the Work sentence (act / required result) and the Work problem word of the `check_delivery_proof` rule, Delivery Duty's | **RULED 2026-09-13** |
| `Upload delivery proof` | Monitor's WORK TO DO queue for a recorded delivered result with incomplete required evidence; each row names the exact missing file | **RULED 2026-09-07** |
| `DELIVERY STATUS` | Monitor's operational-status filter group, a kit dropdown over the §8.4 status words of `delivery/MASTER.md` | **RULED 2026-09-07**, words re-ruled **2026-09-13** |
| `DOCUMENT STATUS` | the register rail's status group — a governed **dropdown** offering `All` plus the ladder's words (`Arrived` joined 2026-09-13, Card 20), each with its live count | **RULED 2026-09-06**, control corrected **2026-09-11** |
| `Arrived` over `{partner warehouse}` · `This leg ends at a partner warehouse. It owes no delivery proof — the customer leg's document carries it.` | an intermediate Journey leg's document: its pill word and line two on the register, Monitor and the DO header; and the Evidence section's one sentence on such a document | **BUILT 2026-09-13** (Card 20 — the word is Card 14's ruled `Arrived`) |
| `Driver submission` | the Delivery Orders register's column for what came back from THIS delivery order's trip. It replaces the default `Proof Status` column (retired 2026-09-11) | **RULED 2026-09-11** |
| `Photos {n}` · `Videos {n}` | the two count buttons inside `Driver submission`. The number is the ledger's own count of files stamped with THIS document; a count is NEVER printed when the answer is unknown, and no button is offered for a kind with no files. **No video is not a shortage** — video is not required, so an absent video prints nothing at all | **RULED 2026-09-11** |
| `Signed Delivery Order` | the viewing link to the signed paper on file, on the second line of `Driver submission`. Already the governed proof name; here it is a door | **REUSED 2026-09-11** |
| `An uploaded file records what the driver sent. It is not proof accepted and not a successful delivery.` | the one sentence at the top of every attachment viewer. An upload is evidence of an upload — the portal never lets a count read as a verdict | **RULED 2026-09-11** |
| `Not recorded` | `Driver submission` when the ledger never reached the screen. An UNKNOWN is printed as an unknown, never as a reassuring `0` | **REUSED 2026-09-11** |
| `Showing only:` | the label opening the register's active-condition strip above the table; each live condition is a removable chip and `Clear filters` removes them all | **RULED 2026-09-11** |
| `Reset columns` | Register Columns menu: restores the page's default visible columns, order and widths; leaves filters, permissions and records unchanged. Purchase Orders per-account extension is APPROVED / NOT BUILT; other pages retain existing persistence. | **BUILT 2026-09-17 — shared DataGrid, PR #1396** |
| `Search: {query}` | the governed Register search's chip in the `Showing only:` strip; its ✕ and `Clear filters` both empty the search (and a server search returns to the whole register) | **BUILT 2026-09-17 — shared DataGrid, PR #1396** |
| `Row actions` | accessible name of the row menu opened by right-click, the Menu key or Shift+F10 (never drawn) | **BUILT 2026-09-17 — shared DataGrid, PR #1396** |
| `{column}: {full value}` | accessible name of a cut cell that opens its whole value in a Popover (never drawn) | **BUILT 2026-09-17 — shared DataGrid, PR #1396** |

| `Logistics` | the Delivery Orders register's COLUMN HEADING for the partner named on the document. The role word stays `Logistics` everywhere the role itself is named; the heading spends its width on the fact | **RULED 2026-09-11** |
| A CANCELLED document's `Driver submission` | **nothing at all** when no file was ever sent. The pill already says `Cancelled`; two absences beside it read as two outstanding jobs on a trip that will never happen. Files sent before the void are still shown — a void never erases a recorded fact | **RULED 2026-09-11** |

**ONE `Status` COLUMN, AND ITS SECOND LINE SAYS WHAT HAPPENED — owner ruling 2026-09-11.** The
Delivery Orders register prints the outcome ONCE. Line 1 is the DOCUMENT's own pill word
(`Created` · `Out for delivery` · `Arrived` · `Delivered` · `Delivery exception` · `Cancelled`). Line 2 of a
`Delivery exception` carries the RESULT that was actually recorded and its reason —
`Partially Delivered · {reason}` or `Failed Delivery · {reason}` — which is what the retired
default `Delivery Result` column used to print three columns away. `Cancelled` keeps its void
reason on line 2; `Arrived` carries the partner warehouse the goods reached (Card 20). **The search, the per-column filter and the Excel export print the same
spelling as the cell**, so a reader looking for `Partially Delivered` finds the row that recorded
it even though its pill spells `Delivery exception`. Combining a DISPLAY never changes the status
arithmetic and never removes a recorded result: the Delivery Order's own page still holds every
result and its whole history.
| `Search deliveries…` | the toolbar search placeholder | kept |
| `Previous days` · `Next days` | the range arrows' accessible labels | kept |

Already governed and merely REUSED (not new words): `No confirmed date` · `Overdue` ·
`No delivery order yet` · `No logistics picked` · `Hide filters` /
`Show filters` · `Requested Delivery Date` ·
`Confirmed Delivery` · `Confirmed Time` ·
`Not delivered yet` · `No delivery photo yet` · `Delivery photo saved` ·
`Signed document on file` / `No signed document yet` (the DO object's own shipped pair).

**The delivery-rule word law (T9, Jess 2026-07-27):** every one of these lines
WARNS and none of them blocks, so every one of them must name the logistics company and
end in something the operator can do — "call them" or "pick another day". A
warning that only states a fact ("capacity exceeded") tells a new hire nothing
about the next second. Sunday never appears in a logistics company's rules: it is refused
for everyone, and a per-partner Sunday line would read as though a phone call
could buy one.

**The Logistics word law (owner correction 2026-09-14).** Use
**`Logistics`** for the role/category and the actual company name, such as **`NETS
Logistics`**, for an assignment. `Logistics` always keeps the s. `Logistics Partner`, `Logistic`, `Carrier` and
`Delivery partner` are banned UI words; the standalone generic `Partner` is too ambiguous on a
Delivery surface. DB/schema names may retain their technical spelling.

**The three-dot column has NO header (Jess 2026-07-27).** The dots are three independent
facts, not one status. `Status` is wrong and `Checks` reads as "cheques" beside money — so
the column carries no header word, and each dot is labelled by its own small icon (goods ·
delivery · money) from the portal icon set, never emoji (UI-KIT). The actions column IS
headed, and its word is **`Actions`** — plural, because an order can have several.

**The booking-call words (SO V2 Card 3, owner ruling 2026-08-13).** The approved journey
opens the customer conversation **three working days before the Customer Promised Deadline,
regardless of stock readiness**, and names what Operations hands Logistics for it. These are
the words that panel may use, and no others:

| Word | What it names | Why not the alternatives |
|---|---|---|
| **`Before you call`** | the panel heading — the facts to have in hand before the phone rings | It is the only heading that says WHEN it is for. `Call brief` · `Pre-call` · `Summary` are jargon (rule 9) and none of them tells a new hire the panel is about a call that has not happened yet |
| **`Call by {date}`** | the day the conversation is due, from `logistics_call_working_days` | `Due {date}` alone does not say *do what*. The late spelling is the portal's existing **`Late — was due {date}`**, unchanged, so this step reads like every other late step |
| **`Not in yet`** | committed goods the register does not hold — the ruling's *"what is / is not expected in"* | `Waiting` alone is already banned; `Outstanding` is the money word; `Short` is warehouse jargon |
| **`Everything is on hand`** | the whole commitment is allocated, so no arrival is pending | States the fact positively so the row is not a blank. `On hand` is the Stock word law's own word, reused rather than re-coined |
| **`Expected arrival`** | the latest supplier ready date among the lines still short | The portal's existing column word (`Check Expected Arrival`). **`Stock ETA` may not reach the screen** — `ETA` is an abbreviation, and rule 9 bans those even when the ruling itself uses one internally |
| **`The factory has not given a date`** | lines are short and no supplier date is on file | An empty cell would read as "nothing is coming". This states the real gap, and it is the same fact `Check Expected Arrival` exists to close |

**A confirmed booking names the company it was AGREED WITH, never the one assigned now**
(migration 0346). When they differ the pane says so, and it says so with the fix, because
the delivery-rule word law above applies here too — a warning that only states a fact tells
a new hire nothing about the next second:

> `Assigned to {now} since the customer agreed this day with {then} — put the original
> company back, or call the customer to agree the day again.`

**No `Appointment` noun.** The ruling calls the fact a *confirmed delivery appointment*, but
the screen already has one word for it — the booking, spelt **`{logistics} · confirmed
{date} · {slot}`** (T1). A second noun for one fact is exactly the synonym rule 8 forbids, so
the ruling's phrase stays in the documents and the screen keeps the word it has.

**SUPERSEDED Stock word law — owner ruling 2026-09-01.** The former `On hand · Ready stock · In &
out` top-page model is historical evidence only. Warehouse now has exactly `Dashboard · Inbound ·
Inventory · Outbound`. Inventory is the one current Unit Register; Ready Stock is a saved eligible-
Unit view shared with Sales; History is a rail/detail/report view; Transfer projects into Inbound,
Outbound and Inventory; `Counts & Adjustments` is one Inventory control view. `Movements`, `Stock
Units`, bare Hold/Quarantine/Attention and the old master-list name `On hand` remain rejected.

**Aligning Purchase and Orders panels:** the Orders panel uses **Placed** only while a submitted
order still lacks a governed Proceed fact, or for a legacy/raw recovery record. A complete Sales
Portal final submit crosses Proceed automatically; a later payment, address, date or governed edit
retries automatically at the transaction's final state when it supplies the last fact. Raw/office
records do not receive the Sales final-submit fact. Historical recovery uses exact confirmed order
IDs and a recorded reason; it never guesses from completeness. The Purchase panel's ① stage therefore fires
after the canonical Proceed transition, not after a second Sales click, and uses the governed
**Issue PO** action. `Send` is not restored as a stage or action name.

---

## ⭐ AN ABSENT VALUE READS AS WORDS — owner ruling 2026-08-15

**A `—` on either side of a change arrow is a dash pretending to be a value.** The reader
cannot tell an empty field from a value that failed to load, and `— → —` says nothing at all.

```
✔  No payment status → Paid          ✘  — → Paid
✔  Tue, 21 Jul 26 → No logistics' date   ✘  21/07/2026 → —
```

**The pattern: `No {the field's own ruled label, lowercased}`.** The field name supplies the
noun, so the phrase says WHICH fact was missing. It is not one shared word for every field:
an Activity feed renders `status` and `payment_status` side by side, and a bare `No status`
on both would be ambiguous on its own screen.

This does not replace the ruled absence FACTS that already exist and name their own subject —
`Address not set` · `No logistics picked` · `Supplier not assigned` · `No date`. Those stay.
This rule covers the generic case: a change event whose before or after simply did not exist.

**And a `—` standing in for a whole missing record gets words too**: an activity row with no
order reads `No order`, never a dash.

## ⭐ NO INTERNAL ENUM ON SCREEN — owner ruling 2026-08-15

**No database word reaches an operator.** This is the state-vocabulary law that
`PLAN_STATUS_LABEL` and `EMERGENCY_STATUS_LABEL` already enforce, stated once for everyone:
every stored value is translated through the dictionary before it is printed, and that includes
the values inside an EVENT, not just the ones in a column.

| Stored | Prints |
|---|---|
| `place` | **`Placed`** |
| `proceed_order` | **`Proceed`** |
| `delivered` | **`Delivered`** |
| `cancelled` | **`Cancelled`** |

*Measured on production 2026-08-15: the Quick Rail's Activity panel was rendering
`Status changed — place → proceed_order` on 35 live events.*

**A raw value is never "close enough" because it is readable.** `proceed_order` is not a word
this business uses; `1000.00` is not the money spelling (`RM 1,000.00`); `2026-08-28` is not
the date spelling (`Fri, 28 Aug 26`). **An event value is formatted by its FIELD's own kind** —
status through the dictionary, dates through `fmtDate`, money through `fmtMoney`.

**An action the event taxonomy never declared prints `Activity`, not its key.** De-underscoring
a raw key (`stock_flag_repair` → `stock flag repair`) puts the database's vocabulary on screen
to describe an event the portal cannot name. An undeclared type is an engineering defect, and
the row still carries its order, its person and its time.

## The Work module words (SO V2 Card 10, owner ruling 2026-08-11)

The Work page adds **no new action vocabulary** — every row line is the same
`orderActionLine` the Orders list prints, and every due date is the ruled
weekday+date spelling (`Thu 6 Aug`). Only these strings are the page's own:

| Concept | Canonical word | Do NOT use |
|---|---|---|
| The sidebar door / page | **Work** | Tasks · To-do · Queue · Dashboard |
| The two filters over the one set | **My Work · Team Work** | My tasks · Everyone · All work |
| Work with no anchor date yet | **No date** | Unscheduled · Someday · TBD |
| The tally — page, staff group and rail row | **{n} actions to do · {n} late** | **{n} open · {n} overdue** (superseded) · Total · Outstanding |
| A row's due date, on line 2 | **due {fmtDate}** (`due Wed, 20 Aug`) | Today · Tomorrow · a bare date |
| A late row's line 2 | **Late — was due {fmtDate}** (the original due never moves) | Overdue by · Delayed |
| The clear state | **No open work — every track is clear.** | All done · Empty |

> **⭐ EVERY COUNT SAYS WHAT IT COUNTS — owner ruling 2026-08-16 (blueprint card §7), and it
> OVERWRITES the 2026-08-14/15 `open · overdue` tally.** A bare `open` beside a number told a
> low-English operator nothing; `{n} actions to do · {n} late` says the thing itself. The rail's
> Team peek and the Work page speak the same pair.

**THE TWO-LINE WORK ROW HAS ONE MAPPING (card §7).** Line 1 is the action's registered SHORT
display — **the dictionary's own QUEUE word**, no second definition of any act. Line 2 carries
names · document numbers · the due date, and only line 2 does.

**TWO NEW ACTS — registered by the blueprint card (owner-approved 2026-08-16):**

| Act | Queue / line 1 | Owner rule | Due |
|---|---|---|---|
| The loan comes back on the trip | **Collect the loan item** over **Bring back {Unit ID} on the delivery day** (the 2026-08-16 generic form — a loan is not always a sofa; two lines since 2026-09-13) | the `delivery_duty` rule through the Shared Duty Resolver (owner ruling 2026-09-13) | the delivery day itself |
| Finance lifts the one money blocker | **Resolve the payment exception** | the Finance owner — only Finance clears it, with evidence | immediately |

Neither is ever a button on a register or an object page; they are WORK, composed from the
module facts (`ops_sofa_loans` · `order_finance_exceptions`) by the Work engine. A duty with no
roster holder yet shows its DUTY WORD where a name cannot stand — never a hand-picked person.

**System work has NO Done button** — an item leaves when its owning module
records the completion fact. A human follow-up stays `ops_tasks`, labelled
human, and is the only explicitly completable thing.

## Numbers, dates, money

- **Numbers**: tabular-nums font (`tabular-nums` class). `3 units` / `12 orders`.
- **Dates**: use `fmtDate()` from `@/lib/fmt-date` → `Sun, 19 Jul`. Never
  hand-format. Never `toLocaleDateString`. See THE YEAR RULE below.
- **Relative time**: `Today` / `Tomorrow` are BANNED as a date — see the
  no-relative-date-words ruling above. A live-recomputed HISTORY group
  (`Today · Yesterday · Earlier`) is the one exception, and it is never in
  stored text.
- **Currency**: `RM 1,250.00`. Never `$` or `MYR` in row text.

### A money figure is never rounded to make a column tidy (Loo, 2026-07-28)

**Two decimals, always, and the number on screen is the number owed.**

```
✔  Collect RM 1,250.50
✘  Collect RM 1,251          ← rounded up: the screen now asks for 50 sen nobody owes
✘  Collect RM 1,250          ← rounded down: the screen under-states the debt
✘  Collect RM RM 1,250.00    ← the currency word added twice
```

**The reason is not typography.** A collections figure is what a human will say out loud to a
customer and what a receipt must match. Rounding it makes the portal disagree with the ledger,
and it disagrees in whichever direction is worse for whoever is reading. **Visual consistency
with another column is never a reason to change a money figure** — if two columns must line
up, pad them, do not re-value them.

**This confirms the currency rule above rather than adding to it**, and it names the two ways
it has actually been broken so a chat can grep for them:

| The shape | What it means |
|---|---|
| `maximumFractionDigits: 0` on anything a human reads as money | breaks this rule |
| passing an already-formatted `RM …` string into a helper that adds `RM ` itself | prints the word twice |

**Where a helper owns the `RM `, the caller passes the bare number** — that split is the whole
reason both failures exist, so a caller that formats first is the thing to look for.

---

## Warehouse Settings — owner card 2026-09-09

The one Warehouse configuration surface (`stock/MASTER.md` §11). Two words here are
**exceptions written by the owner**, and the exception is scoped so the older rulings stand:

- **`Save changes`** is the Warehouse Settings header button. It stays banned on the Sales Order
  object page and in the `⚠ {n} changes` bar, whose spelling is still `Discard` · `Save`. The
  difference is real: those name an act inside a form that is already typeable; this one names
  the page's single commit, and the page has no other Save. It obeys the Receiving button law —
  a disabled Save NAMES its gap: `Save changes — say why this date is different`.
- **`Not configured`** is a SETTING nobody has recorded. It is not `Not recorded`, which stays
  the one word for an empty REGISTER cell. A register cell is a fact about a record; a settings
  row is a rule the business has not decided yet, and `Configure it` is the next act.

| Meaning | Use exactly | Do NOT use |
|---|---|---|
| The page | **`Warehouse Settings`** | Warehouse Maintenance · Warehouse Config · Site Settings |
| Its five sections | **`Warehouse Details`** · **`Working Hours`** · **`Public Holidays`** · **`Special Dates`** · **`Access`** | Closed Dates · Cut-off · Calendar · Permissions · Roles |
| A setting nobody has recorded | **`Not configured`** | Not set · None · N/A · Empty · a blank · **`0`** |
| A person nobody has named | **`Not assigned`** | Unassigned · Nobody · TBD · — |
| No such individual exists in the ERP at all | **`No individual recorded`** | Unknown person · No contact · a made-up name |
| The site's own state | **`Active`** · **`Closed`** | Open · Operating · Disabled · Inactive |
| The organisation that runs the site | **`Operated by`** | Operator · Vendor · 3PL · Partner. It names an ORGANISATION; a PERSON is `Key contact`, and the two are never merged |
| The person to call at the site | **`Key contact`** | Contact person · PIC · In charge · Owner |
| Goods coming IN | **`Receiving hours`** | Inbound hours · Delivery window · Goods-in |
| Goods going OUT | **`Collection hours`** | Outbound hours · Pickup window · Dispatch |
| That activity is unavailable that day | **`Closed`** | Unavailable · Off · Rest day · Holiday |
| The five kinds of Special Date | **`Closed all day`** · **`Receiving unavailable`** · **`Collection unavailable`** · **`Special receiving hours`** · **`Special collection hours`** | Blackout · Exception · Non-working day |
| The five public-holiday choices | **`Closed`** · **`Receiving only`** · **`Collection only`** · **`Normal working hours`** · **`Special hours`** | Half day · Skeleton crew · Limited |
| The policy nobody has saved | **`Public-holiday policy    Not configured`** | Disabled · Off · Default |
| Why a resolved day is what it is | **`Special hours`** · **`Company closure`** · **`{State} public holiday`** · **`Normal working hours`** · **`Not configured`** | Override · Rule 1 · System default |
| The four Warehouse capabilities | **`Manage Warehouse Settings`** · **`Confirm inbound receipt`** · **`Confirm collection from Warehouse`** · **`Perform stock count`** | Warehouse admin · Full access · Supervisor |

**`Chase`, `Handle`, `Review`, `Manage stock` and `Edit` do not appear on this page.** Neither
does a standing warning such as *"Changes apply to future work and never rewrite recorded
history"* — the rule is enforced by there being no writer, and by the audit trail; a sentence
that repeats a guarantee the operator cannot verify is noise.

---

## Finance ledger words — PROPOSAL, awaiting owner review

**PROPOSAL / NOT LAW.** Words the finance ledger builds (migrations 0475–0479) put on screen
before the owner has ruled on them. Each block names its build and pages; until a ruling, a word
here may appear only on the page its block names. Falsifier: a finance user reads a word here and
cannot say what it means or does. A stored key never reaches the screen.

### Journal · Trial Balance · Self-check (migration 0479)

| Group | Word | Meaning |
|---|---|---|
| Destinations | **`Journal`** | Every ledger entry, newest first. |
| | **`Trial Balance`** | Every account's balance on one day, debits beside credits. |
| | **`Self-check`** | The books test themselves and name what is wrong. |
| Journal columns | **`Entry No`** · **`Date`** · **`Source`** · **`Document`** · **`Narration`** · **`Amount`** · **`Reversal`** | The entry's number, day, what made it, its document, its note, its total, its reversed pair. |
| Sources | **`Sales invoice`** · **`Customer payment`** · **`Supplier bill`** · **`Supplier payment`** · **`Payment voucher`** · **`Other debtor invoice`** · **`Other receipt`** · **`Rental payment`** · **`Manual journal`** | What made the entry. |
| | **`{source} reversal`** | The entry that cancels one of those. |
| | **`Other entry`** | A source this list does not name yet. Never the key. |
| Reversed pairs | **`Not reversed`** · **`Reversed`** · **`Reversal`** | The entry stands · it was cancelled · it cancels another. |
| | **`Reversed by {Entry No}`** · **`Reverses {Entry No}`** | Links each half of a pair to the other. |
| Entry lines | **`Account`** · **`Debit`** · **`Credit`** · **`Party`** · **`Memo`** · **`Total`** | One line of an entry, and its totals. |
| | **`Customer · {name}`** · **`Supplier · {name}`** · **`Other party`** · **`No party`** | Who the line belongs to. |
| Entry page | **`Entry`** · **`Lines`** · **`Same document`** | The entry's facts · its lines · other entries on that document. |
| Absent values | **`No document number`** · **`No narration`** · **`No memo`** · **`Name not available`** · **`Account name not available`** | The value is missing, said in words. |
| Journal scope | **`All accounts`** · **`{code} {name} only`** · **`From {date}`** · **`Up to {date}`** · **`Show all entries`** | The account and dates the Journal is narrowed to, and the way out. |
| Buttons | **`Show lines`** · **`Open entry`** · **`Back to Journal`** · **`Open Self-check`** · **`Check again`** | Row expand · open one entry · return · go to the checks · read the checks again. |
| Trial Balance | **`Kind`** · **`Asset`** · **`Liability`** · **`Equity`** · **`Income`** · **`Expense`** · **`Other account`** | The account's kind, used to group the page. |
| | **`As of`** | The day the balances are taken on. |
| | **`Since {date} · No opening balances`** | Figures are movement since the ledger started, not a full position. |
| | **`Difference {money}`** · **`Difference not checked`** | Debits less credits · the read failed, so no figure. |
| Self-check verdicts | **`Clean`** · **`{n} findings`** · **`Finding`** · **`Not checked`** | Nothing wrong · how many problems · this check failed · the read failed. Never zero for a failed read. |
| Self-check cards | **`Debits and credits`** · **`Customer receivables`** · **`Supplier payables`** · **`Rental months`** · **`Ledger checks`** · **`{code} {name}`** | One card per question; one per customer or supplier account. |
| | **`Checked {date and time}`** | When the checks were read. |
| | **`Ledger {money} · Bills {money}`** | One supplier's ledger figure beside its bills less payments. |

Sentences these pages print follow the Empty-state and Error patterns above, for example
`No entries yet. Invoices, payments and bills add entries here.` ·
`The Journal could not be loaded. Try again.` · `No entry has that number. Check it and try again.`
The Self-check finding sentences (`1 line for RM 5.00 names nobody.`) are composed in
`finance-ledger.ts` from the row's own numbers.
A balance on the other side turns the sentence round (`Carres owes customers RM 2,815.00` ·
`suppliers owe Carres RM 100.00`), never a negative figure.

### Reports (Profit and Loss · Balance Sheet)

Page: Finance → `Reports`. Both statements are read from the ledger (migration 0469); every figure
is one the ledger summed. The page also uses these words from the Journal block above, with the same
meaning: `Account` · `Amount` · the kind words · `As of` · `Since {date} · No opening balances` ·
`Account name not available` · `Open Self-check` · `Try again`.

| Group | Word | Meaning | Falsifier (NOT LAW) |
|---|---|---|---|
| Statements | **`Profit and Loss`** | Income less expense for a period. Panel title. | A finance user calls it something else (`P&L`, `Income Statement`) and does not recognise this name. |
| | **`Balance Sheet`** | What Carres has and owes on one day. Panel title. | As above, for `Statement of Financial Position`. |
| Period | **`Month`** | Picks one whole month for the Profit and Loss. | A user picks a month expecting it to change the Balance Sheet too. |
| | **`Custom Date Range`** | Shown in `Month` when the dates are not one whole month. | A user reads it as a button that opens a date range. |
| | **`From`** · **`Up to`** | The first and last day of the Profit and Loss, as field labels. `Up to` includes that day. | A user asks whether the `Up to` day is included. |
| Totals | **`Net result`** | Income less expense for the period, as the ledger served it. Bottom line of the Profit and Loss. | A user reads a negative figure here and does not see it is a loss. |
| | **`Net result not yet closed`** | Income less expense up to the day, not yet moved into equity. A line inside Equity. | A user adds it to Equity a second time, not seeing it is already in the Equity total. |
| Accounts | **`Advances to suppliers`** | The name of account 1230 (migration 0507), the line label on Reports → Balance Sheet and in the month-end pack. Money Carres paid to suppliers before their bill: a supplier whose payables balance is below zero. The Balance Sheet shows that money here and leaves it out of Payables (report only — the Trial Balance and the Journal still show it on 2110, or 2120 for an other creditor). **APPROVED (YH, 14 Sep 2026).** | A finance user reads it as money lent (1250 Loans and advances given) or as a supplier claim (1220) and looks for it in the wrong place. |
| Sentences | **`No income in this period.`** · **`No expenses in this period.`** | Under the Profit and Loss Income or Expense band when every account in it is at RM 0.00. APPROVED (YH, 14 Sep 2026). | A user opens the Journal for that period and finds income or expense entries that did not cancel out. |
| | **`No assets on this day.`** · **`No liabilities on this day.`** · **`No equity on this day.`** | Under the Balance Sheet Asset, Liability or Equity band when every account in it is at RM 0.00. APPROVED (YH, 14 Sep 2026). | As above, for the day. |
| | **`Includes {money} from customers who paid before their invoice.`** | About `2210 Customer deposits held`. Shown in the tooltip of the info mark next to the account on Reports → Balance Sheet, and as its own row in the month-end pack. A customer whose receivable balance is below zero paid before the invoice; the Balance Sheet shows that money here and leaves it out of Receivables (migration 0506, report only — the Trial Balance and the Journal still show it on 1210). The line label is the account's own name. **APPROVED (YH, 14 Sep 2026).** | A finance user opens 2210 in the Journal, finds no entries, and cannot tell where the figure came from. |
| | **`Leaves out {money} that customers paid before their invoice.`** | About `1210 Trade receivables`. Shown in the tooltip of the info mark next to the account on Reports → Balance Sheet, and as its own row in the month-end pack. The other side of the note on 2210: the amount 0506 moved off receivables, so the line still reconciles to the Trial Balance and the Journal. **APPROVED (YH, 14 Sep 2026).** | A finance user compares Receivables with 1210 on the Trial Balance, sees two different numbers, and cannot tell why. |
| | **`Includes {money} paid to suppliers before their bill.`** | About `1230 Advances to suppliers`. Shown in the tooltip of the info mark next to the account on Reports → Balance Sheet, and as its own row in the month-end pack. A supplier whose payables balance is below zero was paid before its bill; the Balance Sheet shows that money here and leaves it out of Payables (migration 0507, report only — the Trial Balance and the Journal still show it on 2110, or 2120 for an other creditor). The line label is the account's own name. **APPROVED (YH, 14 Sep 2026).** | A finance user opens 1230 in the Journal, finds no entries, and cannot tell where the figure came from. |
| | **`Leaves out {money} paid to suppliers before their bill.`** | About `2110 Trade payables` (and `2120 Other payables`). Shown in the tooltip of the info mark next to the account on Reports → Balance Sheet, and as its own row in the month-end pack. The other side of the note on 1230: the amount 0507 moved off payables, so the line still reconciles to the Trial Balance and the Journal. **APPROVED (YH, 14 Sep 2026).** | A finance user compares Payables with 2110 on the Trial Balance, sees two different numbers, and cannot tell why. |
| | **`⚠ Assets differ from liabilities plus equity by {money}.`** | The ledger's own check failed on that day; followed by `Open Self-check`. The only place the difference prints. | A user cannot tell which side is larger, and needs to. |
| | **`The ledger has no start date yet. Nothing can be totalled.`** | The ledger has no go-live day, so neither statement can be read. | A user does not know who sets the start date. |
| | **`The ledger started on {date}. Pick a day from then on.`** | The chosen day or period ends before go-live. | A user picks a later day and still sees it. |
| | **`The profit and loss could not be loaded. Try again.`** · **`The balance sheet could not be loaded. Try again.`** | The read failed; no figure is shown. Same sentence as the API sends. | A user retries and gets the same sentence every time, so `Try again` promises nothing. |

### Manual journal (principal only)

**PROPOSAL / NOT LAW.** The words of the principal's manual journal door on the Journal
(`?entry=new`, `ManualJournalForm.tsx`, `routes/finance/manual-journals.ts`). They may appear only
there. Falsifier: the principal reads one of these and cannot say what happens next, or records
a second entry because a sentence told her to try again after the first one stood.

| Group | Word | Meaning |
|---|---|---|
| Door | **`New journal entry`** | The Journal's one create action (Row 2), principal only; also the form's heading. Same pattern as `New receipt`. |
| Form | **`Entry`** · **`Lines`** · **`Date`** · **`Narration`** · **`Account`** · **`Debit`** · **`Credit`** · **`Memo`** · **`Add line`** · **`Remove`** · **`Back to Journal`** | Reused from the Journal block and the line-list controls; nothing new. |
| | **`Choose an account`** · **`Loading accounts…`** | The account picker empty, and while the chart loads. |
| | **`The ledger started on {date}. Opening balances take that date.`** | The date hint. |
| | **`Customer, supplier and other party accounts are not listed. They move only through their own documents.`** | Why control accounts are missing from the picker. |
| | **`Total · Debit {money} · Credit {money} · Difference {money}`** | The live totals; the difference is red until it is RM 0.00. |
| Button | **`Record journal entry`** | Records the entry; it gets its JE number at once. Asks first. Same verb as `Record receipt`. |
| | **`Record journal entry — {gap}`**, gaps: `choose the date` · `choose a day from {date} on` · `type the narration` · `check line {n}` · `choose an account on line {n}` · `type a debit or a credit on line {n}` · `add a second line` · `the total is larger than the ledger can hold` · `make debits equal credits` | The disabled button names the first thing missing (the `Save method — type a name` pattern). |
| Dialog | **`Record this journal entry?`** · **`{money} debit and credit, dated {date}. A recorded entry cannot be changed. To correct it, record another entry.`** · **`It gets its entry number now.`** · **`Cancel`** · **`Record journal entry`** | The ask-first dialog. |
| Done | **`Journal entry recorded.`** | The toast; the new entry then opens. |
| Unknown outcome | **`The connection dropped. Check the Journal for this entry before you record it again.`** · **`The answer did not come back. Check the Journal for this entry before you record it again.`** | No answer came back, so the entry may stand, and the API cannot vouch that the request key (0502) is honoured. Never `Try again`: a second press could be a second entry. |
| | **`The answer did not come back. Press Record journal entry again. This entry is never recorded twice.`** | No answer came back, and the API has seen the keyed `gl_manual_journal` answer (0502 applied). The form keeps one request key per entry, so a second press returns the first entry or records it once. Shown only on a 503 with `retry_safe: true`. |
| Resend refused | **`This entry was already recorded as {entry no} before it was changed. Open it in the Journal. To record another, start a New journal entry.`** (without a number: `This entry was already recorded before it was changed. …`) | The same request key came back with other details (`idempotency_mismatch`): the first press stood, then the form was edited. Nothing new is recorded. |
| Field refusals | `Type the amount in numbers, like 1500.00.` · `The amount must be more than RM 0.00.` · `An amount has at most two decimals.` · `The amount is larger than the ledger can hold.` · `A line takes a debit or a credit, not both.` | Under the field as it is typed. |
| Entry refusals | `Choose the entry date.` · `Type the narration.` · `The narration is at most 500 characters.` · `A memo is at most 500 characters.` · `Choose an account on every line.` · `Type a debit or a credit on every line.` · `A journal entry needs at least two lines.` · `A journal entry takes at most 100 lines.` · `Debits and credits must be equal.` · `The total is larger than the ledger can hold.` · `The entry adds up to RM 0.00.` · `The ledger started on {date}. Pick a day from then on.` · `The entry date is before the ledger started.` · `The ledger has no start date yet.` · `The lines could not be read. Check them and try again.` | The whole entry is refused; the form stays as typed. |
| Line refusals | `Line {n} ` + `uses a customer, supplier or other party account. Those accounts move only through their own documents.` · `has no account. Choose one.` · `names an account that is not in the chart.` · `names an account that is no longer in use.` · `names a heading account. Choose an account under it.` · `needs its amount in numbers.` · `has an amount below RM 0.00. Put it on the other side instead.` · `has a debit and a credit. A line takes one of them, not both.` · `has no debit and no credit.` · `could not be read. Check it and try again.` | The ledger refused one line and names it (`A line …` when it gives no number). |
| Other refusals | `Only the principal may record a journal entry.` · `The journal entry could not be recorded. Try again.` (the database answered and rolled back) · `The journal entry was refused. Check it and try again.` · `The chart of accounts could not be loaded. Try again.` | Who may, and the fallbacks. |


### Supplier bills and payment vouchers (migration 0477)

Pages: Finance → `Bills`, `Payment Vouchers`, `Unpaid by Supplier`; the AP drawer's doors.

| Where | Word on screen | Stored value it replaces | Note |
|---|---|---|---|
| Destination / nav | **Bills** · **Payment Vouchers** · **Unpaid by Supplier** | — | three listings, one toolbar switch; the Finance sidebar names the third **AP · Payables** (RULING below) |
| Bill status | **Draft** · **Confirmed** · **Cancelled** | `draft` · `confirmed` · `cancelled` | `Posted` never reaches the screen: a confirmed bill *is* entered in the ledger |
| Voucher status | **Draft** · **Prepared** · **Checked** · **Approved** · **Cancelled** | same, lower case | `Voided` never reaches the screen |
| Voucher purpose | **Pay supplier bills** · **Direct payment** | `SUPPLIER_BILLS` · `DIRECT` | |
| Pay method | **Bank transfer** · **Cheque** · **Cash** · **Other** | `BANK_TRANSFER` … | |
| History | **Created** · **Changed** · **Confirmed** · **Prepared** · **Checked** · **Approved** · **Returned to draft** · **Cancelled** · **File added** | `created` … `file_added` | |
| Creditor type | **Supplier** · **Other creditor** | `suppliers.kind` | an other creditor is a landlord, an advertiser, a lorry company on credit — its bills go to 2120 Other payables |
| Money a SUPPLIER is still owed | **Unpaid** | — | `Outstanding` stays customer money only (§ Vocabulary); `Balance` stays banned for money |
| Voucher form | **Left to pay** · **Pay now** · **Paid from** · **Payee** | — | the voucher **Total** is added up, never typed |
| Price check | **Same as PO price** · **RM x above PO price** · **RM x below PO price** · **No PO price** · **`n` lines differ from PO** | — | a flag, never a block |
| Line source | **Not from a GRN** | `warehouse_receipt_id is null` | |
| No number yet | **Draft, no number yet** | `bill_no` / `voucher_no` null | numbers are drawn on confirm / prepare |
| Ledger link | **Ledger entry** · **reversed by `JE-…`** | `gl_entries` | |
| An unknown stored value | **Not known** | anything the word map lacks | never the raw value |
| Buttons | **+ New Bill** · **Convert GRN to bill** · **Confirm bill** · **Cancel bill** · **+ New Payment Voucher** · **Prepare voucher** · **Check voucher** · **Approve payment** · **Return to draft** · **Cancel voucher** · **Add other creditor** · **Attach file** · **Use this GRN** | — | form buttons stay `Save` / `Cancel`; line lists stay `+ Add line` / `Remove` |

**Three dictionary conflicts, reported rather than decided:**

1. **`Prepare`** was retired with `Prepare PO` on 2026-07-30. The voucher's first step keeps
   it (`Prepare voucher`) because the brief names the Houzs structure Draft → Prepared →
   Checked → Approved, and the preparer is the person the separation-of-duties rule excludes
   from the next two steps. *Overturned by:* an owner ruling for another word (e.g. `Submit
   voucher`); only the word map and the button change.
2. **`Check`** means establishing a missing fact. `Check voucher` fits loosely — the fact
   established is "the bills, amounts and payee match the papers attached" — but the object is
   a document, not an absent fact. *Overturned by:* the owner reading `Check` as the
   Purchasing-only verb.
3. **`Approve`** is ruled for a purchase nobody's customer ordered. `Approve payment` names what
   is approved, as the rule demands, but widens the verb to money leaving Carres. *Overturned
   by:* an owner ruling that money out takes its own verb (e.g. `Release payment`).

The brief's `Reject` is shown as **`Return to draft`**: the voucher goes back to the person who
prepared it, which is the dictionary's `Return` exactly.
**NOT LAW.** Words the finance ledger builds put on screen that this dictionary did not have.
Each carries its meaning; the owner accepts, renames or strikes it.

### Invoice doors and payment methods (migration 0476)

| Meaning | Proposed words | Do NOT use |
|---|---|---|
| The ledger account a payment method's money lands in (Settings → Payment → Payment methods) | **`Money account`** · `Money account: {code} · {name}` | GL account · Posting account · Clearing |
| A method with no money account yet (reuses the Warehouse Settings word for an unrecorded setting) | **`Money account: Not configured`** | Not set · None · a blank |
| The door that adds a method | **`Add a payment method`** | New method · + Method · Create |
| The method form's Save, naming its gap while disabled | **`Save method`** · `Save method — type a name` · `Save method — choose a money account` | Save changes · Submit |
| The account picker's empty state | **`Choose a money account`** | Select · Pick one |
| The saved toast / the failed read | **`Payment method saved`** · `Payment methods could not be loaded. Try again.` | Success! · Error |
| The proof a manager-added method asks for (the six governed methods keep their §16 words) | **`Payment proof`** | Attachment · Upload · Evidence file |
| The method the provider records (a receipt row, never a manual choice) | **`Online payment`** | e-wallet · Stripe · Online |
| An invoice before the issue draws its number (Generate invoice header · PDF preview stamp) | **`Draft`** · **`DRAFT`** on the preview paper | a predicted `INV-YYYY-…` number · Pending |
| Where a Sales Invoice is issued (the old AR drawer door is gone) | **`To issue a Sales Invoice, open the order and choose Generate invoice.`** | Issue invoice (AR drawer) |
| The correction door on an issued invoice | **`Void and replace`** · `Void and replace — say why this invoice is wrong` | Void invoice · Cancel invoice · Edit invoice |
| Its reason field | **`Why is this invoice wrong?`** | Void reason · Remarks |
| What it will do, said before the act | **`{INV No} is voided and keeps its paper. A replacement draft with the same lines is created; issue it from the order with Generate invoice. It gets a new number.`** | Are you sure? |
| After the act | **`{INV No} voided — the replacement draft is ready. Issue it from the order: Generate invoice.`** | Done · Voided successfully |

### Money in that is not a sale — Other debtors and Other receipts (migration 0478)

| Word | Meaning |
|---|---|
| `Other debtors` | Finance destination: parties that are not customers and owe Carres money, and the invoices raised to them. |
| `Other receipts` | Finance destination: money into our bank or cash that is not customer order money (loan in, director's money, other income, or payment of an other debtor invoice). |
| `Party` / `Parties` | Someone Carres bills or receives money from who is neither a customer nor a supplier — a sister company, a lender, a director. |
| `Company or person` · `SSM or IC number` | The party's kind and its registration number. |
| `New invoice` · `New party` · `New receipt` | The one create action on each register (Row 2). |
| `Issue invoice` | Gives the draft its ARI number and adds its total to what the party owes. Asks first. |
| `Save draft` | Keeps the invoice without a number; it owes nothing yet. |
| `Cancel invoice` | A draft simply stops. An issued invoice is reversed on its own date by the finance approver. |
| `Record receipt` | Records money received; it gets its RV number at once. Asks first. Same verb as `Record payment`. |
| `Cancel receipt` | The finance approver reverses a receipt; the invoices it paid owe that money again. |
| `Draft` · `Issued` · `Cancelled` | An other debtor invoice's status. |
| `Recorded` · `Cancelled` | An other receipt's status (the database words `posted` / `voided` never reach the screen). |
| `Draft — no number yet` | The Invoice No cell of a draft. |
| `Not issued yet` · `Paid in full` | The Outstanding cell of a draft, and of an issued invoice with nothing left to pay. |
| `Outstanding` | Extended here: what a party that is not a customer still owes on issued invoices. `Balance` stays banned. |
| `What for` | The column saying what an invoice or receipt was for, in the chart's own account names. |
| `Received from` · `Received into` · `Payer name` | Who paid; which bank or cash account the money went into; the payer when there is no party. |
| `Against invoices` · `Received for {ARI No} (RM)` | The part of a receipt that pays a party's open invoices. |
| `Ledger entry {JE No}` | The History line naming the journal entry a document posted or reversed. |
| `Active` · `Not active` | Whether a party can be chosen on a new invoice or receipt. |

### Supplier advances (migrations 0484–0485)

`Advance` itself is **APPROVED** — YH ruled it on 11 Sep 2026 for money paid to a supplier before
its bill: the voucher's advance box, the knock-off on the bill, and the unused-advance column on
Unpaid by Supplier (see the Vocabulary row). The money back number's prefix `SMB` is **APPROVED**
— YH ruled it on 14 Sep 2026. Every other word below is **PROPOSAL — PENDING APPROVAL**, listed
with where it appears.

| Word | Where · meaning |
|---|---|
| `Advance` (field) · `Money paid before the bill. It is applied to a bill later, or the supplier sends it back.` | Payment voucher form, the Advance card under Bills to pay. |
| `Pays confirmed bills, or an advance before the bill.` | The Purpose help on the voucher form (replaces the 0477 sentence's first clause). |
| `An advance cannot be less than RM 0.00` | Form and API refusal. |
| `No advance` · `{RM} · {RM} left` | The Advance column of the Payment Vouchers register. |
| `Advance on this voucher` · `Applied to bills` · `Money back` · `Advance left` | The voucher's Advance card and its facts. |
| `Not paid yet — approving the payment pays it` | Advance left before the voucher is approved. |
| `Apply advance` · `Apply advance to a bill?` · `Apply advance to this bill?` | Action on the voucher's Advance card and the bill's Payments card, and its modal. |
| `Take advance off` · `Take this advance off the bill?` | Undo one knock-off; needs a reason. |
| `Record money back` · `Cancel money back` · `Cancel this money back?` | The supplier sent part of an advance back (money back); the approver reverses it. |
| `Advance applied` · `Advance taken off` · `Money back recorded` · `Money back cancelled` | History lines (event words) and toasts. |
| `Applied` · `Taken off` | A knock-off's status (database `applied` / `cancelled`). |
| `Recorded` · `Cancelled` | A money back's status (database `posted` / `voided`) — same pair as Other receipts. |
| `Money back No` · `SMB-YYYYMMDD-NNNN` | The money back number. Prefix SMB = supplier money back, **APPROVED** (YH, 14 Sep 2026); it is one line, `supplier_money_back_prefix()` in 0485. |
| `This money back was already recorded as {No} with different details. Open the form again to record another.` | Refusal (`idempotency_mismatch`) when a key is re-sent with a different voucher, amount, account or date. |
| `Received into` | Reused from 0478: the bank or cash account the money back came into. |
| `Advance from {PV No}` | A knock-off row on a bill's Payments card. |
| `This supplier has no advance left.` · `Choose the advance` · `Choose the bill` · `Loading advances…` · `The advances could not be loaded. Try again.` | The Apply advance modal. |
| `More than can be applied` · `More than the advance left` | Amount warnings in the modals. |
| `Nothing is entered in the ledger: the advance is already on the supplier's account. The bill shows it as paid by this amount.` | Apply advance modal. |
| `Nothing is entered in the ledger. The bill is unpaid again by this amount, and the advance is left to use.` | Take advance off modal. |
| `The supplier sent part of the advance on {PV No} back. It is entered in the ledger on the date below.` | Record money back modal. |
| `The ledger entry is reversed on its own date, and the amount is left on the advance again.` | Cancel money back modal. |
| `An advance applied to a bill or sent back must be taken off or cancelled first.` | Added to the cancel-voucher sentence when the voucher carries an advance. |
| `A bill already on a payment voucher, or with an advance applied, cannot be cancelled.` | Cancel bill sentence (extends 0477's). |
| `Advance Left` · `Unpaid After Advance` | Columns on Unpaid by Supplier (`advance_open`, `net_owing`). |
| `Supplier money back` · `Supplier money back reversal` | The Journal's Source for `SUPPLIER_MONEY_BACK` and its reversal (finance-ledger.ts). |
| `{Bill No} · {Supplier invoice} · {RM} left to pay` | An option in the Bill picker of Apply advance (from the voucher). |
| `{PV No} · {date} · {RM} left` | An option in the Advance picker of Apply advance (from the bill). |
| `Taken off — {reason}` · `Cancelled — {reason}` | Status cell of a knock-off taken off, and of a money back cancelled, with the reason. |
| `This voucher is cancelled, so its advance was never paid or has been reversed.` | The Advance card of a cancelled voucher, in place of Applied / Money back / Advance left. |
| `Loading accounts…` · `The accounts could not be loaded. Try again.` | Record money back, in place of the Received into list while it loads or fails. |
| `Advance` (picker label) · `Bill` · `Date` · `Amount` · `Reference` | Field labels in the Apply advance and Record money back modals. |
| `Bill No` · `Supplier invoice` · `Draft bill` · `Loading bills…` · `The bills could not be loaded. Try again.` · `This supplier has no confirmed bill left to pay.` · `Choose the bank or cash account` · `Bank reference or cheque No` | Reused from 0477 — the Apply advance and Record money back modals and the knock-off table. |

### Money moves and the three-person voucher (migration 0529)

**PROPOSAL — PENDING APPROVAL.** Every word below is new. Page: `Money moves` at
`/finance/money-moves` (Finance sidebar, after `Other receipts`), and one new refusal on the
payment voucher's Approve.

| Word | Where · meaning |
|---|---|
| `Money moves` | Sidebar row, page header and export name: Finance moving its own money between its own accounts. |
| `New money move` · `Prepare money move` | Toolbar button that opens the form; the form's press (prepares, posts nothing). |
| `Bank transfer` · `Card payout` | The two kinds (`TRANSFER` · `CARD_PAYOUT`), and the Journal's Source for `MONEY_TRANSFER` / `CARD_PAYOUT` (with ` reversal`). `Bank transfer` is already a pay-method word. |
| `Move No` · `MM-YYYYMMDD-NNNN` | The number column and the number (prefix MM = money move). |
| `Kind` · `Date` · `Paid from` · `Paid into` · `Amount` · `Fee` · `Reference` · `Note` · `Status` | Register columns and form labels. `Paid into` is new; the rest are reused. |
| `Amount (RM)` · `Paid into the bank (RM)` · `Card company fee (RM)` · `{RM} leaves {code}` | Form amount label for a transfer · for a card payout · the fee · the gross hint under the fee. |
| `Prepared` · `Approved` · `Reversed` · `Cancelled` | Status (database `prepared` · `approved` · `reversed` · `cancelled`). |
| `Approve` · `Cancel money move` · `Cancel this money move?` | Row actions and the cancel modal title. |
| `Nothing was entered in the ledger yet.` · `The ledger entry is reversed on the money move date.` | Cancel modal description for a prepared · an approved move. |
| `Nothing is entered in the ledger until another finance approver approves it.` | The form's description. |
| `You prepared this. Another finance approver approves it.` | Expanded row of your own prepared move. |
| `{RM gross} from {account} · {RM} into {account} · Fee {RM}` · `Prepared · {when} · {name}` · `Approved · {when} · {name}` | Expanded row facts and history. |
| `No reference` · `No note` · `No reason on file` · `Name not available` | Empty values in the Reference column and the expanded row (reused from Other debtors). |
| `{n} money moves · {n} to approve` · `Search money moves…` · `Inspect money move` | Register footer, search placeholder, expand control. |
| `No money move yet. Press New money move to record a bank transfer or a card payout.` | Empty state. |
| `Money move prepared. A finance approver approves it next.` · `{MM No} approved.` · `Money move cancelled.` | Toasts. |
| `Choose where the money came from.` · `Choose where the money went.` · `The money must move between two different accounts.` · `A bank transfer has no fee.` · `Choose a bank transfer or a card payout.` · `The fee cannot be below RM 0.00.` · `Type the fee.` | Form refusals (shared schema). |
| `Paid from must be a cash or bank account in use.` · `Paid into must be a cash or bank account in use.` · `A card payout comes from a card or online holding account in use.` · `A card payout goes into a bank account in use.` · `A bank transfer has no fee. Record a bank charge on a payment voucher.` · `The amount must be more than RM 0.00, in sen at most.` · `The fee must be RM 0.00 or more, in sen at most.` · `Choose the date the money moved.` · `Only Finance records a money move.` · `Approving a money move takes the finance approver.` · `You prepared money move {MM No}, so somebody else must approve it.` · `Money move {MM No} is {status}, so it cannot be approved.` · `Reversing a posted money move takes the finance approver.` · `Type why the money move is cancelled.` · `Money move {MM No} is already {status}.` · `Money moves are for Finance.` | Database refusals, shown as they come. |
| `You checked payment voucher {PV No}, so somebody else must approve it. Three different people prepare, check and approve a payment.` | Payment voucher Approve refusal (`checker_cannot_approve`). |

### Finance Dashboard · AR · Receivables (build/finance-old-reads)

**RULING — YH, 2026-09-14.** The Finance sidebar row that opens `/finance/ap-outstanding` is
**`AP · Payables`** again (PR #1248 had renamed it `Unpaid by Supplier`), and it sits above
`AR · Receivables`: `Dashboard` · `AP · Payables` · `AR · Receivables`, then the rest. The page
it opens is unchanged; its header and the Bills toolbar switch keep `Unpaid by Supplier`. The
Dashboard keeps its pre-#1248 layout (figure tiles, then the Payables card) with every number
read through `money-owed.ts`.

**PROPOSAL / NOT LAW** for the rest of this block. Pages: Finance → `Dashboard` and
`AR · Receivables`, and the AR drawer. Both figures add up the same per-row numbers as the page
they open (`money-owed.ts`). The words may appear only on these pages until the owner rules.

| Word on screen | Meaning | Falsifier |
|---|---|---|
| `AP · Payables` | RULING: the Finance sidebar row and the Dashboard card for what Carres still owes suppliers and other creditors on confirmed bills. | — (owner ruling) |
| `AR · Receivables` | Destination: every order a customer still owes money on, where Finance records a receipt. | The owner rules one global Dashboard with no Finance AR page (COPY 1690), or recording moves to the Invoices register. |
| `Outstanding` · `Unpaid` · `{n} orders` · `{n} suppliers` | Dashboard figure tiles: what customers still owe HQ (storage included, unpriced orders left out), and what Carres still owes on confirmed bills; the count under each. | A tile differs from the footer of the page its door opens. |
| `Open AR · Receivables` · `Open AP · Payables` · `Open invoice` | Doors to the page that adds a figure up, and to the order's invoice (`Open {module}`). | A door opens a page whose total differs from the figure it sits under. |
| `includes storage {RM}` | Second line under Outstanding: the storage part of what the customer owes (Payment MASTER). | Storage owed shows as a separate total that the Outstanding figure leaves out. |
| `Could not load {source}` · `Last available {date and time} · {RM}` · `Try again` | A figure whose read failed: said in words, never RM 0.00, with the last figure it had. | A failed read shows a zero or a blank. |
| `Invoices could not be loaded. Try again.` | The AR register's failed read (Error pattern). | The page shows an empty list when the read failed. |
| `No customer owes money.` | The AR register's empty state. | It shows while an order still owes money. |
| `Search orders…` | Search placeholder on the AR register. | Search also matches something that is not an order or customer. |
| `SO not available` | The SO No cell when the order has no SO number (absent value in words). | A raw id or blank shows instead. |
| `Record payment received` · `Amount must be positive` · `Receipt failed: {reason}` · `Recorded {RM} for SO-{n}` | Heading, validation, failure and success of the drawer's Record receipt form. | The form records a zero or negative amount, or fails silently. |
| `No receipts recorded yet.` · `Receipt number missing` · `Method not recorded` · `VOIDED` | Payment history: none yet · a receipt without its RC number · a receipt without its method · a cancelled receipt. | A stored method key or a blank reaches the screen. |
| `Overdue (>30d)` | Dashboard tile, and the AR register's removable condition, for what customers still owe on sales invoices issued more than 30 days ago (Malaysia days; the old `finance_ar_aging` buckets, aged from the invoice date by owner ruling YH 18 Sep 2026 — not a due date). An order whose invoice is not issued is never counted. Kept in the pre-#1248 spelling by the owner's 2026-09-14 layout ruling; it breaks "No abbreviations" and is flagged for a ruling. | The tile differs from the AR register's footer at `?age=over-30`, or an invoice issued exactly 30 days ago is counted. |
| `A/R Aging · Outstanding by age` · `{bucket} days` (`0-30 days` · `31-60 days` · `61-90 days` · `90+ days`) · `{RM} · {n} orders` | The Dashboard's aging card: what customers owe, split by how many days ago the sales invoice was issued; each row opens AR · Receivables narrowed to that age. An order whose invoice is not issued yet stays in Outstanding and is in no bucket. Pre-#1248 heading kept by the owner ruling; `A/R` flagged as above. | A bucket differs from the AR register's footer at that `?age=`, or the four buckets do not add up to Outstanding less the orders whose invoice is not issued yet. |
| `Age` · `{n} days` · `1 day` · `Not issued yet` | The AR register's Age column: days since the sales invoice was issued (owner ruling YH 18 Sep 2026); an order whose invoice is still a draft reads `Not issued yet` — the same words the Other debtors Outstanding cell uses for a draft, here meaning the order's sales invoice. | An order whose invoice is not issued shows 0 days or lands in a bucket or in Overdue. |
| `No order owing money is this old.` | The AR register's empty state while an age condition is on. | It shows while an order of that age still owes money. |
| `Net cash · 12 wks` · `In {RM} · Out {RM}` · `Since {date} · {n} of 12 weeks` · `Since {date}` | Dashboard tile: money in less money out on the cash and bank accounts (under 1100 in the chart) over the last twelve weeks, never before the ledger's go-live; the second line shows while fewer than twelve whole weeks exist — with the count while fewer than twelve week columns exist, and as `Since {date}` alone when twelve columns show but the first starts mid-week on go-live (never `12 of 12 weeks`). It is a movement, never a balance: the ledger has no opening balances. Pre-#1248 spelling kept by the owner ruling; `wks` flagged as above. | The tile differs from the sum of the Cashflow weeks, or from the cash and bank rows of the Trial Balance over the same days. |
| `Cashflow · Last 12 weeks` · `Money in less money out on cash and bank accounts · No opening balances` · `Inflow` · `Outflow` · `Inflow total` · `Outflow total` · `Net` · `The ledger started on {date}. {n} of 12 weeks so far.` · `The ledger started on {date}.` | The Dashboard's weekly chart of the same movement: one column per week, the week's net under it, and the totals. The notice carries the count only while fewer than twelve week columns exist; with twelve columns whose first starts mid-week on go-live it names the date alone. | A week's column counts an entry dated outside that week, or a move between two cash accounts shows as In or Out. |
| `Could not load Cash and bank` · `Could not load Journal` · `The ledger has no start date yet.` · `The ledger starts on {date}.` | A Dashboard ledger read that failed, a ledger with no go-live date, and a go-live date still ahead of today (no week has begun): said in words in place of the Net cash figure and the Cashflow chart, never RM 0.00. | A failed read or a go-live still ahead shows a zero, a blank or an empty chart. |
| `Activity · Recent transactions` · `Open Journal` | The Dashboard's card of the newest posted ledger entries (Date · Entry No · Source · Amount); each Entry No opens that entry in the Journal. | An entry number opens a different entry, or the card lists an entry the Journal does not. |
| `Month` · `Export month-end pack` · `The month-end pack could not be exported. Try again.` | The Dashboard's one export: a workbook `Month-end pack {Mon YYYY}.xlsx` with three sheets — `Trial Balance`, `Profit and Loss`, `Balance Sheet` — for the chosen month (last complete month by default; this month when last month ended before go-live). The sheets reuse the report pages' own words (`As of {date}` · `Since {date} · No opening balances` · `Account` · `Kind` · `Debit` · `Credit` · `Total` · `Amount` · `Net result` · `Net result not yet closed` · `Assets differ from liabilities plus equity by`). | A sheet's figure differs from the page of the same name on the same days, or a sheet is written after a failed read. |

### Finance Settings — money accounts (migration 0512) and the Finance Approver (migration 0514)

**APPROVED — YH merged #1360 (Finance Settings) and #1364 (0514) on 15 Sep 2026, and picked the
0515 refusal wording the same day.** Page: `Finance Settings` at `/finance/settings`, opened from
the header gear (`GlobalTopBar.tsx`, `moduleSettingsFor`). It is the one list of money accounts:
cash, each bank, and the holding account of each card or online payment company. A word already in
this file keeps its meaning; a word with a second meaning says so here.

| Group | Word | Meaning |
|---|---|---|
| Page | **`Finance Settings`** | The page word, and the header gear's label on every Finance page. |
| Button | **`Add a money account`** | The page's one create action, and the heading of its form. Same pattern as `Add a payment method`. |
| Form | `Money account` | The form's heading when one account is opened. Same word as the Invoice doors block. |
| | `Name` · `Kind` · `Active` · `Save` · `Cancel` | The form. `Kind` shows only when adding; `Active` only when an account is opened. |
| Columns | `Account` · `Name` · `Kind` · `Status` | The account's code, its name, its kind, and whether it is in use. |
| Kinds | `Cash` · `Bank transfer` · `Online payment` | **Second meaning.** These are payment method words (the Supplier bills and Invoice doors blocks). Here they are also the `Kind` of a money account: the cash account, a bank, or the holding account of a card or online payment company. This `Kind` is not the Trial Balance kind (`Asset` and the rest). Adding offers only `Bank transfer` and `Online payment`; the cash account is already on the list. |
| Status | `Active` · `Not active` | **Second meaning.** In the Other debtors block they say whether a party can be chosen. Here they say whether the account is in use. A `Not active` account is not offered in any Paid from or Received into picker. |
| Failed read | `The accounts could not be loaded. Try again.` · `Try again` | Reused from the Supplier advances block. |
| Refusals (database, 0512) | `The money accounts are for Finance.` · `Only Finance changes the money accounts.` | Who may read the list, and who may change it. |
| | `Type the account name.` · `Keep the name to 60 characters.` · `Choose the kind: a bank, or an online payment company.` | The form's checks. The API and the database say the same sentence. |
| | `A money account named {name} is already on the list.` | Two accounts cannot share a name. |
| | `Codes 1121 to 1129 are all used. Take an account out of use, or ask for a new range.` (a holding account: `1131 to 1139`) | The database picks the code, and every code for that kind is taken. |
| | `That money account is not on the list.` | No account has that code. The API says it too, for a code that is not four digits. |
| | `{code} {name} is not at RM 0.00 in the ledger. It stays in use until it is.` | Taking an account out of use while the ledger still holds money in it. |
| Refusal (database, Staff & Duties, 0514) | `the Finance Approver must be an active Finance user` | Database log text only (detail `invalid_holder` / `invalid_cover`). The page prints `{name} cannot hold Finance Approver. Choose an eligible active staff member.` or `{name} can no longer cover Finance Approver. Choose another eligible staff member.` (workspace/MASTER.md §4.4.1). |
| Refusal (database, 0515) | `{method} still uses {code} {name}. Move {method} to another account first.` | **APPROVED — YH picked this wording on 15 Sep 2026.** Taking an account out of use while a payment method still puts its money there. Used on Finance Settings. Since 0523 it counts every payment method row, on or off, and the two rows no screen shows: `{method}` is then `Online payment` (Stripe, the existing word) or `POS card` (POS credit, debit and instalment money; **APPROVED — YH, 17 Sep 2026**; since 0525). |
| Refusal (database, 0515) | `{code} {name} is out of use. Move {method} to another account first.` | **APPROVED — YH, 16 Sep 2026.** The same rule from the other side: turning a payment method on while its account is out of use. Built only from the approved sentence above. Used on Settings → Payment → Payment methods (the Active switch). |

An empty list would show the grid's default `No data.`, which the Empty-state pattern bans. The
list always holds the cash account (1110), so it does not show today. A real empty sentence needs
the page to pass its own.

---

### Payment terms in days (migration 0530) — PROPOSAL — PENDING APPROVAL

Owner ruling (YH, 17 Sep 2026): terms are set per supplier and per PO; the PO's win. The words
below are **PROPOSAL — PENDING APPROVAL**. Pages: Operation → Purchasing Settings, Purchase
Order detail, Finance → Supplier bill form.

| Where | Word | Meaning |
|---|---|---|
| Settings section | **`Payment terms`** | Heading for the per-supplier terms. |
| | **`Days after the supplier's bill date that the bill is due. A PO's own terms come first.`** | What the number does. |
| Supplier row · PO detail | **`Terms (days)`** | The number of days. Blank = not set. |
| PO detail hint | **`Blank uses the supplier's terms`** | An empty PO field falls back. |
| Both fields, refused | **`0 to 365`** | The allowed range. |
| Bill form, under Due date | **`Bill date + {n} days, from the PO's terms`** · **`Bill date + {n} days, from the supplier's terms`** | Where the filled-in due date came from. Gone once the user types a date. |
| PO detail, refused | **`The terms could not be saved`** | The save failed. |

## Header rules (see UI-KIT for the shell)

Purchasing has no module tab bar. Each destination uses the approved compact Destination Header:
the current page word once at 24px, no leading page icon and no `Purchasing ·` prefix. Search,
help and Settings stay in their governed header positions. See `ui/MASTER.md` §4.2.

---

## Review checklist (paste into every UI PR)

Before merging a UI change:

- [ ] Every button label starts with a verb.
- [ ] Every list row ends with a ≤10-word action-line.
- [ ] Every empty state teaches what to do next.
- [ ] Every error gives the fix.
- [ ] No new synonyms — checked against the vocabulary table above.
- [ ] Zero jargon (rule 9).
- [ ] Tooltips do not repeat the label.
- [ ] Dates go through `fmtDate()`.


### Delivery legacy warehouse pick refusal · Card 21 · 2026-09-13

`This action is no longer available. Use Ready Stock in SO Batch Purchase.` — HTTP 410 refusal for the retired `warehouse` and `transfer-ready` doors. The drawer no longer offers `Transfer to ready`. The destination uses the existing governed Ready Stock journey, never a replacement stock writer.

Warehouse receiving summary: **Physical arrived Qty {n}** is physical arrival, separate from accepted **Received Qty {n}**. **Loading** opens the owning exact-Unit loading workspace. **Back to Outbound** returns to the preserved register.

Warehouse operator-flow review, 2026-09-16: **Loading recorded. Awaiting driver confirmation.** distinguishes the Warehouse act from the driver's act. **Loading and driver confirmation recorded.** requires both facts. **Loading evidence is still missing.** names the separate evidence gap. **Open Delivery Order** opens the owning DO. A refused scan stays visible: **{Unit ID} is not a Unit this delivery order requires. Check the label and scan the required Unit.** or **{Unit ID} was already loaded. Scan a Unit still to load.** The entered ID remains available for correction or retry.

### Date-first listing contract — APPROVED (Jess, 2026-09-17) · BUILT on Sales Orders, SO Batch, Manual Purchase and Purchase Orders 2026-09-17

Exact leading columns: Sales Orders `SO Date · SO No`; SO Batch `Proceed Date · SO No`;
Manual Purchase `Proceed Date · MPR No` (Purchasing §9.2); Purchase Orders `PO Date · PO No`;
Receiving `GRN Date · GRN No`; Supplier Claims `Reported · Supplier Claim No.`; Delivery Orders `DO Date · DO No`;
Payment Records `Paid date · Receipt No`. Pin both at canvas ≥768px, identity alone below768px.
Date-first adoption: Sales Orders small patch → Manual Purchase Round 2 → Purchase Orders.
Personal saved layouts pilot on Purchase Orders only; rollout requires owner acceptance.

### Personal column layouts — APPROVED (Jess, 2026-09-17) · BUILT 2026-09-17, Purchase Orders only

PO-only opt-in pilot in the Purchase Orders round. Exact Columns menu copy:
`Save layout as…` · `Load layout` · `Set as my default` · `Reset columns` · `Best fit` ·
`Expand all` · `Collapse all`. Reset returns to company defaults. Saved layouts belong only to
one signed-in user, up to 10 per listing; their contents and responsive pinning follow UI MASTER
§6.7. Other pages do not expose this capability until the owner accepts rollout.

Supporting copy (BUILT 2026-09-17): the name field `Layout name` and its button `Save`; the
refusals `You can keep 10 layouts. Save under an existing name to replace one.` ·
`The layout could not be saved. Try again.` · `Your default could not be saved. Try again.`
Purchase Orders rail: `All suppliers` · `All destinations`; row disclosure hover `Show goods`.

**Other money in: printed documents (PROPOSAL — PENDING APPROVAL, 17 Sep 2026).** The other
debtor invoice and the other receipt pages each get `Download PDF` (already in this standard).
New words: on the invoice PDF `INVOICE` · `INVOICE · CANCELLED` · `CANCELLED · {reason}` ·
`Reg No` · `Due` · `Description` · `Amount (RM)` · `TOTAL DUE` · `Note: {narration}`; on the
receipt PDF the right-hand signature line `Payer signature`; and the failure toasts
`The invoice could not be opened — {error}` · `The receipt could not be opened — {error}`. A draft
invoice has no number and no PDF.

### PO copy and Portal-wide readability — BUILT 2026-09-17 (SLICE 1) · authenticated walk OWED (approved Jess, 2026-09-17)

Canonical PO group labels: `Confirm PO sent to supplier` · `Waiting for goods from supplier` ·
`Completed` · `Cancelled`. Button: `PO sent to supplier`. PO Version supporting line:
`Sending not confirmed` or `PO sent to supplier · {channel} · {date}`. Channel is recorded data,
never hardcoded WhatsApp. Shared completion: `Current PO version marked as sent`.
`Waiting for goods from supplier` is an exact approved exception, not permission for vague Waiting.
Under `Supplier reply`: `Date not confirmed` · `Date changed` · `Date passed`; outside that group
use full supplier-date meanings. Shortening never changes the existing predicate or evidence.
UI MASTER §6.7 owns Portal-wide readability (13 main/11 fact/12 helper/13 error or cannot-act).
No page-local copies of its appearance rules; this does not authorize new business copy.
