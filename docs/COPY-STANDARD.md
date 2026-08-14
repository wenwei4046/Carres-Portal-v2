# Carres Portal — Copy Standard

> The single source of truth for how UI text is written across every page of
> `apps/web`. **Read this BEFORE writing any button label, section title, row
> line, empty state, error, or tooltip.** Locked with Jess (COO) 2026-07-22.
>
> If any older chat, memory, or doc contradicts this file, this file wins.
> The UI-KIT points at this file as the authority for microcopy.

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
the applicable Carres working calendar, exclude its public holidays/non-working days, and move a
due date only according to that authoritative calendar. A governed action surface that requires a
due day prints weekday + date; `Today`, `Tomorrow` or `T−2` alone is not enough.

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
WHO + ACTION AND OBJECT + RECIPIENT + REQUIRED RESULT + WHEN
```

Use the portal-wide two-line shape when the row carries a fact plus action:

```
LINE 1  OBJECT + FACT / PROBLEM
LINE 2  OWNER + ACTION AND OBJECT + RECIPIENT + REQUIRED RESULT
```

The row/action context must also expose actual working weekday/date. `Call` · `Ask` · `Check` ·
`Choose` · `Upload` · `Add` · `Send` · `Save` · `Follow up` · `Review` · `Handle` · `Resolve`
alone are banned. If one line cannot fit, use labelled `Owner · Object · Contact · Do · Need`; omit
nothing.

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
    ✔ Khor Yee · Check in PO-2041 goods for Purchasing · Record full or partial · Thu 13 Aug.
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
  (`Call Ohana — confirm PO-88 ready date` · `Call NETS — confirm delivery
  date`); the role word (`customer`, `supplier`) only when no name exists.
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
| 2 | `Confirm delivery date` (row line: `Call {logistics} — confirm delivery date`) |
| 3 | `Deliver today` |
| 4 | `Upload delivery photo` |

**Only the words live here.** What each queue holds and when it goes late are TRIGGERS and
DUE conditions — they live in `orders/MASTER.md` §3, and nowhere else (Law 0A).
This table used to carry them; C2 found the copy and it was deleted rather than kept in
step.

Every deadline is counted in **working days** (see the one definition above) — the same
engine procurement uses. Lateness is written as the count
tail, numbers up front: `5 · 2 late`.

**`Issue delivery order` IS an action** (Jess 2026-07-27): once the customer's date is
confirmed, the SYSTEM produces the document and the operator only presses the button —
nobody authors a delivery order by hand. Card C7 builds it; the number is stamped at
dispatch today, which is too late to hand to logistics, and C7 moves it.

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

**Never** write "partial delivery", "split shipment", "back-order" or
"consignment" on screen — say what goes and what follows, in furniture words.

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
| `Confirm tomorrow's delivery` | is it coming on the day we expect it? | `It ships on {date}` · `It ships later than {date}` | — (none: the tile's own label is already the whole instruction, and this file's tooltip rule says delete a tooltip that would restate the label) |

Both answers name **the promised date** rather than "yes" and "no", because the reader must
not have to remember what was asked.

**`Confirm tomorrow's delivery`'s two answers name the DATE for a second reason, and Loo said
it in one line when he ruled them (2026-07-29):** *"These answers remain true regardless of
when the user opens the action."* The action opens the working day before the goods are due and
stays open until somebody answers it — so a relative word is only true on the first day.
`Shipping tomorrow`, answered two days late, is a sentence about a day that has already passed.
`{date}` is the PO's expected arrival, and it is right whenever it is read.

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
| `Confirm delivery date` | `Call {logistics} — confirm delivery date` | `Confirm booking` | `Delivery confirmed {date} · {slot}` | `0 calls to make · everything on track.` |
| `Issue delivery order` | `Issue delivery order` | `Issue delivery order` | `Delivery order issued` | `Nothing waiting for a delivery order.` |
| `Deliver today` | `Deliver today` | `Mark delivered` | `Delivered` | `No deliveries today.` |
| `Upload delivery photo` | `Upload delivery photo` | `Upload delivery photo` | `Delivery photo saved` | `Every delivery has its photo.` |
| `Delay planning` | `Delay planning` | `Record the delay decision` | — (none: the row leaves by itself, and `Arrange new delivery date` says what happened) | `No supplier date lands after a promised date.` |
| `Arrange new delivery date` | `Call {logistics} — arrange new delivery date` | `Record new date` | `New date recorded` | `No delayed order needs a new date.` |
| `Collect RM {amount}` | `Collect RM {amount} from {customer}` | `Record payment` | `Payment recorded` | `Nothing outstanding.` |

**PURCHASING** (docs/purchasing/MASTER.md):

| Queue tile | Row line | Button | Done message | Empty state |
|---|---|---|---|---|
| `Issue PO` | `Issue PO to {supplier}` | `Issue PO` | `PO issued to {supplier}` | `No purchase orders to issue.` |
| `Confirm ready date` | `Call {supplier} — confirm ready date` | `Record ready date` | `Ready date recorded` | `No supplier to call today. Everything on track.` |
| `Confirm tomorrow's delivery` | `Call {supplier} — confirm tomorrow's delivery` | `Record answer` | `Answer recorded` | `Nothing arriving tomorrow.` |
| `Check in` | `Check in from {supplier}` | `Check in` | `Checked in {n} of {m}` | `No goods arriving today. {supplier}'s next delivery is {date}.` |
| `Confirm balance delivery date` | `Call {supplier} — confirm balance delivery date` | `Record balance date` | `Balance date recorded` | `Nothing short today.` |
| `Confirm what happens next` | `Call {supplier} — confirm what happens next` | `Record what happens next` | `Supplier answer recorded` | `No claim is waiting for a supplier answer.` |

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
| Ordinary commercial choice | `Normal Purchase` |
| PO-line price | `Transaction Cost` · empty: `Cost required` |
| Zero-price commercial choice | `Free of Charge` |
| Free-of-Charge explanation | `Reason` · empty: `Reason required` |
| Factory-pickup document fact | `Procurement Partner` |

`Free of Charge` is a commercial classification, never the empty or default value for an
unknown cost. `Procurement Partner` appears once per governed Issue document, never once per
demand line.

**THIS TABLE IS THE CANONICAL HOME FOR EVERY PURCHASING ACTION, INCLUDING THE ONES THE ORDERS
LADDER DISPLAYS.** The Orders row and the Purchasing row show the same work, so `Issue PO`
and `Confirm ready date` are defined **once, here**. The ORDERS table above points
at this one; it does not respell them.

*(This replaces the rule that `Send PO` and `Confirm ready date` were ONE action each "shared
by Orders and Purchasing … listed twice". Loo deleted that statement on 2026-07-29: the
requirement it created — that both flows carry an identical entry — is what made the
Purchasing split unbuildable without dragging Orders' wording along. **Defining an action
once and referencing it is stronger than defining it twice and promising the copies match.**)*

> **`Send PO` IS GONE FROM PURCHASING (Loo, 2026-07-29), AND SO ARE `Prepare PO` AND
> `Draft PO` (Loo, 2026-07-30 — the Purchasing clean restart).** Raising a purchase order is
> ONE act — **`Issue PO`** creates the formal Purchase Order, and nothing is stored before it.
> The old done message `PO sent to {supplier}` described a step that no longer exists. The verb `Send`
> is retired with it and stays banned from reuse — see the verb dictionary.

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
| `need booking` | **to-do word in a fact** | `{logistics} — confirm delivery date` |
| `Unscheduled` | banned (T1) | `{logistics} — confirm delivery date` |
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
| The three options | **`Carres Klang`** · **`AL Sungai Buloh`** · **`HOUZS`** |
| Nice Future, which does not deliver | **`NETS collects from Nice Future and delivers to Carres Klang.`** |
| The optional free-text field beside it | **`Delivery instructions`** |
| A destination nobody has given an address for — **Settings only** | **`Address not set`** |

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
  weekday (`Monday` is ambiguous — which Monday?), never `Today` / `Tomorrow` on a rail
  (relative words rot in screenshots and re-sort themselves overnight; the Delivery calendar's
  three VIEWS keep their own ruled names — a view is not a day row). The full date stays on
  hover.
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

**SEVEN verbs, seven meanings. Every module uses these; no module invents an eighth.**

*(It was five until 2026-07-28. `Return` was added by Loo's ruling because R6 needed a word
for "this record goes back to whoever produced it" and reached for `Send back`. **`Prepare`
was added 2026-07-29 and RETIRED 2026-07-30** with the Purchasing clean restart: raising a
purchase order is one act again, so the verb has no object left. **`Check` was added by Loo
on 2026-08-05** — see the row below and the note under the table. **The bar for an eighth is
the bar `Return` cleared: no existing verb fits, and the alternative is a module inventing
its own.**)*

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
`Call {supplier} — confirm ready date` · `Call {logistics} — confirm delivery date` ·
`Call {logistics} — arrange new delivery date` · `Issue invoice` · `Issue credit note` ·
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

**Consequence of the Issue rule:** the SYSTEM writes the document; the human only presses
the button. **`Issue delivery order` IS an action** (Jess ruled 2026-07-27): once the
customer's date is confirmed, the operator presses one button and the document exists, ready
to hand to logistics. Today `orders.do_number` is stamped by a DB trigger on the DISPATCH
transition (0098) — a day too late to give logistics the paper they ask for the evening
before. Card C7 moves the stamp to customer confirmation. Nobody ever authors a delivery
order by hand.

### The Receiving Workspace's own words (locked 2026-08-03, Slice B)

`Check in` above is the ACT and stays the queue word. These are the words the
Office Receiving Workspace puts on screen while performing it — they name
sections, fields and the state of the Save button, so they are not actions and
do not take the five-string shape.

| Word | Where | Why this word |
|---|---|---|
| `Receiving Summary` | workspace section | **Never `Progress`** (Jess): the section answers *what has this PO taken in*, a count, not a stage. |
| `Received` · `Outstanding` | the summary's two rows | Outstanding is PRINTED, not left as `5 − 3`. An operator should never subtract to learn what is still owed. |
| `Start Receiving` | primary action | A PRIMARY ACTION, never a section — the operator's whole job here is one press. |
| `Receiving Details` | the strip Receiving Mode adds | What this delivery was, as opposed to what was on it. |
| `Goods Received At` | field | The Business Date Dictionary's own word — when the goods PHYSICALLY arrived, which is not when they were keyed in. |
| `Supplier DO No.` | field | **Theirs, not ours.** It has no default and no suggestion; a number we invent is a reference the supplier never issued. |
| `Signed DO photo` | field | The evidence, named by what it is a photo OF. |
| `Receive now` | per-line input | *"Receive this time"*, never *"total so far"* — the column beside it already says `Received`. |
| `What kind of wrong?` | per-line picker | Plain words. The claim needs the kind before it can be filed. |
| `Save Receiving` | the Save button, when nothing is missing | |
| `Save — {what is missing}` | the Save button otherwise | The button NAMES the gap: `Save — add a DO number` · `Save — upload signed DO` · `Save — count at least one unit`. A grey button that will not say why is a puzzle. |
| `Remaining after save: {n} (stays on this PO)` | beside Save | Quiet, never a popup: a short receipt is normal, and routine confirms train people to click OK. |
| `No receiving activity yet.` | Activity empty state | **Never `Nothing received yet`** (Jess, 2026-08-03) — that reads as *the goods have not come*, which is a different fact and usually a false one. What is empty is the RECORD. |
| `Open in Claims` | Exceptions section | A DOOR, never a form. The claim already exists; the receive that recorded the problem opened it. |

### The Claims decision words (ruled by Loo, 2026-08-05 — transcribed here 2026-08-06)

These are **Loo's own spellings**, taken from his ruling of 2026-08-05 (the claim model in
`docs/purchasing/MASTER.md` §6). They were ruled but never written down here, which is exactly
the gap this file exists to close: a word that has been ruled and is not in the dictionary is a
word the next chat re-invents.

**A claim carries FOUR layers and they may never be collapsed:**

```
Customer Problem → Supplier Response → Carres Resolution → Carres Execution
```

**The test that keeps them apart is his:** *can both be true at the same time?* **If yes, they
are two fields, not one list.** The customer cancelled AND the mattress is destroyed — under
one list the operator has to choose which truth to record, i.e. has to lie.

| Word | Where | Why this word |
|---|---|---|
| `The Item` | claim section | What this claim is ABOUT — the reference object (`PO · SKU · Supplier · DO`). **Not on screen yet**: it is the Workspace layer's un-collapsible header. |
| `Customer Resolution` | claim section + its picker | *What are we doing for the CUSTOMER?* **Live 2026-08-06.** |
| `Item Outcome` | claim section + its picker | *What happened to THIS item?* **Live 2026-08-06** — it renamed `The goods`, which named the noun rather than the decision, and with a second decision beside it the two must read apart at a glance. |
| `Supplier Response` | claim section | What the supplier said. **The screen still says `What {supplier} answered`** — that names the party, which this file otherwise asks for, so the rename waits for the Workspace layer rather than being taken in passing. |
| `Next Action` | claim region | What is owed now. **Not on screen yet** — the region belongs to the Workspace layer. |
| `What are we doing for the customer?` | under `Customer Resolution` | The section's own question, so the picker never has to be guessed at. |
| `What happened to this item?` | under `Item Outcome` | Its twin. Two decisions, two questions, and a reader who can tell them apart without being told. |
| `Save what we are doing` | the resolution's button | Parallel to `Save what happened` beside it — both name the record being written, not the thing decided. |
| `Recorded {date}` | beside that button | A FACT: a resolution stays editable while the claim is open, so the screen says when the one on file was set. |
| `Nothing recorded — this claim closed without one.` | closed claim, no resolution | A closed claim with a blank here is finished, not neglected. Never a bare `—`. |

**`Customer Resolution` — the four options, and the one line each carries.** The line is a
DEFINITION, never a consequence: consequences are `f(Resolution, Execution)` and Carres
Execution is frozen-but-unbuilt, so a line naming stock, money or an outstanding quantity would
be a guess wearing a screen's authority.

| Option | The line under it |
|---|---|
| `Replace` | `The customer gets a NEW item.` |
| `Repair` | `The SAME item is repaired and goes back to the SAME customer.` |
| `Accept As-Is` | `The customer keeps this item as it is.` |
| `No Replacement Required` | `Nothing more goes to the customer for this item.` |

**`Item Outcome` — the three, unchanged since 0299:** `Put back in stock` · `Returned to
supplier` · `Written off`.

**Removed from the resolution list, and they do not go back**: `Return to Supplier` and
`Write Off` (they answer what happened to the ITEM) · `Cancel Outstanding` (renamed
`No Replacement Required`) · `Reject` · `Deliver Remaining` · `Replacement` ·
`Return and Replace` (all four are SUPPLIER answers, not Carres decisions).

**`Repair` appears on BOTH the supplier's answer list and this one, and that is not a
collision.** The supplier saying *"we will repair it"* is their answer; Carres deciding the
customer gets a repair is our decision. They are different fields, they are allowed to
disagree, and preserving that disagreement is the whole reason the layers are kept apart.

> **`Refund` HAS NO ENTRY, and that is the ruling.** Supplier credit note? cash? offset
> against future purchases? **The business meaning is not frozen and nobody may guess it.** It
> is not built and it is not deleted. This row exists so the next chat does not read its
> absence as an oversight and invent one.

**Two collisions, both settled by law already in this file:**

1. Loo spelt the waiting state `Waiting Internal Resolution`. **The dictionary already locked
   `Case owner decision required`** (2026-07-27, in the exception-lifecycle row below) for the
   same meaning. **The locked one wins** — one meaning, one word, and the older lock is the one
   the rest of the portal's exception vocabulary is built around.
2. **`Return` is a locked VERB** meaning *a record goes BACK to the party that produced it*
   (the verb dictionary). **`Return to Supplier` is about GOODS**, and it is Loo's newer and
   more specific ruling. **Both stand.** They are two senses of one spelling, exactly as
   `Recovery` is: the verb is a record's move, the Item Outcome is a physical one, and neither
   may be renamed to avoid the other.

### Receiving and supplier-exception words (locked 2026-07-27)

One vocabulary for every module that waits on a supplier. Never invent a synonym.

| Group | The words |
|---|---|
| Receiving result | `Received` · `Received with exception` · `Rejected` |
| Exception lifecycle | `Receiving exception created` · **`Call {supplier} — confirm what happens next`** · `Waiting supplier reply` · `Waiting goods arrival` · `Overdue goods arrival` · `Supplier cannot fulfil` · `Case owner decision required` · `Exception closed` |

**`Contact supplier` is retired** (Loo, 2026-07-28). It was a SIXTH verb for behaviour the
five already cover — reach the outside party, get an answer, record the outcome, which is
exactly `Call`. The action is `Call {supplier} — confirm what happens next` and its five
strings are in the dictionary above. **The R2/R3 screens still say `Contact`; the rename is
scheduled in the ④ R lane** — until it lands, this table is the ruling and the screen is the
lag, not the other way round.

**Waiting words are STATES, never actions** — nobody acts while one is true (engine law).
**Every module fails the same way:** one `Exception` plus a `Reason`, never a family of
different failure words.

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
`Inventory` · `Movements` · `Recovery` **in the delay sense** (staff say "this order going to
delay" — the word on screen is `Delay planning`)

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
| Telling logistics to re-arrange a delayed delivery | **`Call {logistics} — arrange new delivery date`** | Call customer (stock delay) · Inform customer · Reschedule |
| Call to fix delivery date + slot | **Call {customer} — book delivery date** | Schedule delivery · Chase · Call customer (book delivery) [old T2 spelling] |
| The company responsible for customer contact/transport in Delivery | **Logistics Partner** · a named one reads `NETS Logistics` | Logistic · Carrier · Delivery partner |
| The goods pool (any page/tab/label) | **Stock** | Inventory · Warehouse (as a menu word) |
| Stock in/out history (tab/label) | **In & out** | Movements · Movement log (menu) · Ledger |
| A logistics company's own working rules | **delivery rules** | Partner profile · SLA · Carrier config |
| Notice logistics need before a delivery day | **working days notice** | Lead time · Cut-off · Booking window |
| A date logistics are closed | **not running on** | Blackout · Unavailable · Out of service |
| Most drops logistics take in a day | **deliveries a day** | Capacity · Max load · Slots |
| How long a factory takes to make an item | **production working days** | Lead time · Manufacturing lead · Turnaround |
| The days a factory is open | **Supplier work week** | working days · Work-week · Factory calendar · Shift pattern |
| The earliest delivery date a store may sell | **Earliest date a store may sell** | Lead time · Minimum lead · Sell-from date · Earliest available |
| The last day we may send the PO and still be safe | **order-by date** | Raise-by · Trigger date · Reorder date |
| The days of the week we send POs | **PO days** | Cycle · Review day · Batch day |
| Days kept back for arranging the delivery | **order-by buffer** | Safety stock days · Slack · Padding |
| Where the supplier must send the goods | **Deliver To** | Where the goods go · Ship-to · Destination · Drop point · Location |
| Physical identity assigned to one stock unit | **Unit ID** | Serial · Item ID |
| What is still owed after a short delivery | **balance** | Outstanding qty · Back-order · Shortfall |
| Goods moved between our own locations | **stock transfer** | Relocation · Internal shipment · Redeployment |
| An SO edit because the RECORD was wrong — the customer's agreement never changed | **Staff correction** | Amendment · Fix · Data fix · Edit (as a cause word) — the two cause words come from the SO V2 Card 1 spec (owner, 2026-08-11) and are the structured `change_type` on every contractual revision |
| An SO edit because the CUSTOMER asked for something different | **Customer change** | Amendment · Change request (that is the pending ASK, not the applied change) · Revision (that is the record it mints) |
| A fulfilment-side substitution/recovery that does not create a new customer transaction | **Fulfilment replacement** | Customer change · Staff correction · Cancel and reorder |
| Register date promised/requested for the customer | **Customer Delivery** | Promised · Delivery date (as this register header) · Current |
| Register destination summary | **Delivery Location** | Address · Location (ambiguous) · Ship-to |
| Direct customer-order document identity | **SO No** | Doc. No. · Current |
| Direct purchase-order document lineage | **PO No** | PO Doc No. · Current |
| Direct delivery-order document lineage | **DO No** | Delivery Order No. · Current |
| The complete currently-applied SO version | **Current** / **Order** (detail tabs only) | Current status · Overall status |
| Complete immutable versions of one SO | **Revisions** | History · Amendments |
| Append-only events on one SO | **History** | Revisions · Activity (for this object view) |
| Fact-derived document/fulfilment/obligation map | **Order Route** | Relationship Map · Journey · Workflow · Checklist · Status |

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
| The drawer panel listing who to ring, one row per outside party | **Calls** | Chase Now · Actions · Follow-ups · Contacts — `Actions` is the ROW's open-action list and one word may not head two blocks (Jess 2026-07-28, PR #487); the panel's own empty state has read `0 calls to make · everything on track.` since C1, so the title is that sentence's noun, not a new word |

## The Purchase Order lifecycle words — CANONICAL HOME (Loo, 2026-07-29 · frozen by P6)

**Every Purchasing word lives here. No other file may redefine one; they reference this
section.** `docs/purchasing/MASTER.md` owns what the actions DO,
`docs/purchasing/MASTER.md` owns where the facts sit — neither respells a word.

**This is a PURCHASING exception to two rows in the vocabulary table above, and it is
deliberate.** A Purchase Order and a customer order are two different subjects; a word banned
on one is not automatically banned on the other. **`Draft` and `Open` stay banned for a
CUSTOMER ORDER.**

**Action ≠ Status. They may never be mixed.** An action is something a person does and it
LEAVES when its outcome is recorded. A status is what the PO currently is.

### The five Operation Status labels — the ONLY five

| # | Label | Means |
|---|---|---|
| 1 | **`Issued`** | a formal PO has been created and issued |
| 2 | **`In Production`** | supplier fulfilment is underway |
| 3 | **`Receiving`** | physical goods receipt has started |
| 4 | **`Completed`** | the PO is fully received and no remaining purchasing action exists |
| 5 | **`Cancelled`** | the PO will no longer be fulfilled |

**`Open` is never a Purchase Order status.** The word for a PO that has been issued is
`Issued`. (`Open` also reads as "not yet finished", which is a different fact and is what
`Receiving` says.)

**Supplier Status is a SEPARATE axis** — what the factory and the logistics partner report.
It is never merged into the five above, and it is not Purchasing's to redefine: two external
roles run their whole lifecycle on it.

### The Purchasing nouns and facts

| Concept | Canonical word | Do NOT use |
|---|---|---|
| Demand somebody has consciously reviewed and delayed | region **`Purchasing on Hold`** · row fact **`On hold until {date}`**, carrying **Held by** · **Reason** · **Held time** · **Resume date** | Snoozed · Paused · Excluded · Hidden · Pending |
| An item whose supplier cannot be worked out | **`Supplier not assigned`** — a FACT, under Missing Configuration. Supporting line: `Assign a supplier before this item can enter the purchasing plan.` | Orphan · Unknown supplier · Invalid SKU · Supplier error |

### The register's Current Action words (Loo, 2026-08-04 — card Q8)

The Purchase Orders register has a `Current Action` column. **It holds exactly ONE state word
and otherwise says `—`.** Three words that used to sit in it were not actions and are RETIRED.

| What the column says | When | Note |
|---|---|---|
| **`Check Expected Arrival`** | the factory has never told us which day the goods reach us — **and also when the date they gave has PASSED and nothing came** | **Loo's own word, chosen after seeing the preview.** It is the SHORT spelling of `Confirm Goods Arrival Date`; it matches the column beside it (`Expected Arrival`) so the eye does not change track |
| **`—`** | the goods are on their way, or already checked in, or the PO is completed or cancelled | **an empty action column is a real answer** (purchasing/MASTER.md), not a gap |

| RETIRED — never put back | Why |
|---|---|
| ~~`Confirm Arrival`~~ | it REVERSED the full string's tense. `Confirm Goods Arrival Date` asks the factory *which day do the goods reach us* (FUTURE); `Confirm Arrival` reads as *tick that it has arrived* (PAST). **A short form may drop WORDS; it may never drop the TENSE or the OBJECT** |
| ~~`Contact Supplier`~~ | `Contact` is not one of the verbs — Loo retired it 2026-07-28 and `Call` covers it. It was also a second word for a LATE version of one action, and **a late version of one action is not a second action**: lateness is shown in red, not spelt differently |
| ~~`Waiting for Goods`~~ | a STATUS wearing an action's column. It keeps its one home — the register's left rail |
| ~~`Open Receiving`~~ | navigation, not work |

> **⚠️ ONE COLLISION, REPORTED TO LOO AND OVERRULED BY HIM. Do not "fix" it back.**
> `Check in` already means the receiving act in this same module (the document/act split,
> Loo 2026-07-28) — so a new hire could read `Check Expected Arrival` as the receiving act.
> The alternative needing no new verb was `Confirm expected arrival`. **He saw both and chose
> `Check Expected Arrival`.**
>
> **RESOLVED 2026-08-05 — he opened the verb table rather than leaving an exception.**
> The row above first said `Check` "does not widen the verb table … no other module may reach
> for it", which left the dictionary claiming SIX verbs while a seventh was live on 16 rows —
> the exact drift this dictionary exists to stop. **`Check` is now the seventh verb**, with
> its meaning, its completion and its boundary against `Call` and `Check in` written in the
> verb dictionary above. **Any module may use it, for the meaning defined there and no other.**

### The Report words (Loo, 2026-08-04 — card Q3)

Purchasing has a "look at the numbers" layer, and these are the only words on
it. **Six were ruled; the page may use no seventh.**

| What | The word | Note |
|---|---|---|
| the tab | **`Report`** — **singular** | Loo's own spelling, given verbatim, and it is AutoCount's own menu-bar word, which the team reads daily. **`Reports` and `Reporting` are both wrong; do not "correct" it** |
| a column: how many purchase orders | **`POs`** | the plural of `PO`, the document's own name |
| a column: the quantity we asked the factory for | **`Ordered`** | |
| a column: what physically arrived | **`Received`** | already ruled — the Receiving Workspace's word, reused, not respelt |
| a column: what is still owed | **`Outstanding`** | already ruled — and **its own rule binds here**: it is PRINTED, never left as `19 − 0` for the reader to subtract |
| the last row | **`Total`** | |

**No money appears anywhere on this page** (Loo, 2026-08-04): *"i dont show
costing — due to supplier have own, finance will deal with it. If future need
to add, just add, not now."* It is structural rather than remembered — the wire
carries no price field at all, so the page could not print one.

**The rail's headings are `Month` · `Supplier` · `Category`.** The last two are
the facet-group headings ruled above. **`Month` has no row in this file** — it
is reused verbatim from the portal's own live screens (HR's commission-run
column, Finance's month picker) rather than invented, and it is reported here so
the next chat finds it. **There is deliberately no `Status` facet**: the
facet-heading rule above bans one by name, and measured 2026-08-04 all 21 live
purchase orders sit in one state, so the group could narrow nothing.

**Communication is NOT part of the PO lifecycle** (Loo, 2026-07-29). WhatsApp and Email are
channels that may vary per supplier; they are never a status, never an Operation Status value,
and they occupy no position in the purchasing information model. The channel words themselves
are unchanged (`Open WhatsApp` · `Open WhatsApp group`).

**The eight terminology slots that stood open from 2026-07-29 are CLOSED by this section.**
Every word above is ruled. No terminology placeholder is left in Purchasing, and a chat that finds
one has found a document that was missed.

## The delivery calendar words (T10, locked with Jess 2026-07-27)

A calendar day answers ONE question: **which trucks move that day.** A day is
therefore filled by the BOOKING, never by the date we promised the customer —
those two dates diverge the moment anything is rescheduled, which is why D1
split them.

| Concept | Canonical word | Do NOT use |
|---|---|---|
| The three calendar views | **Today · Tomorrow · This week** | Next 7 days · Week view · Upcoming |
| The customer said yes to this date | **Confirmed** (+ the slot, e.g. `12pm–3pm`) | Booked · Locked · Scheduled |
| Only logistics have named this date | **Logistics' date** | Provisional · Tentative · ETA · Pencilled in · Carrier's date |
| Promised on this day, no booking yet | **Promised this day, no date yet** | Unscheduled · Not booked · Unbooked · Pending · anything with "needs" |
| No logistics picked yet | **No logistics picked** | Unassigned · TBD · No carrier · — |
| Nothing booked on a day | **No deliveries booked this day.** | Empty · Free · Nothing |

- **"This week" means the REST of this week** — today through Saturday. Sunday
  is never in a delivery range: it is refused for every logistics company.
- A promised-but-unbooked order is never COUNTED as a delivery. It is listed
  under its own heading with the call that fixes it
  (`Call {customer} — book delivery date`), so a day never reads as empty when
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

## The Delivery module words (T11, locked with Jess 2026-07-27)

The standalone Delivery page adds **no new vocabulary**. Its queue names, its
action pills and its calendar lines are the words already ruled above, taken
from the same shared constants the Orders list reads — a module that spelt a
queue differently would be rule 8's failure with its own menu item. Only these
four strings are the page's own:

| Concept | Canonical word | Do NOT use |
|---|---|---|
| The two views of the module | **Queues · Calendar** | List · Board · Schedule · Planner |
| How much work is on the board | **{n} to do · {n} late** | Total · Outstanding · Open items |
| Nothing in the picked queue | **Nothing to do here.** + the sentence saying when an order joins | No results · Empty · All clear |
| Leaving the module to act | **Open order** | View · Details · Go to order · Edit |

**The module states facts and hands over.** Every write — booking a date,
recording a reason, uploading a delivery photo — happens in the order drawer,
which is where the gates live. So the page carries exactly ONE button, and its
word says where it takes you.

**The delivery-rule word law (T9, Jess 2026-07-27):** every one of these lines
WARNS and none of them blocks, so every one of them must name the logistics company and
end in something the operator can do — "call them" or "pick another day". A
warning that only states a fact ("capacity exceeded") tells a new hire nothing
about the next second. Sunday never appears in a logistics company's rules: it is refused
for everyone, and a per-partner Sunday line would read as though a phone call
could buy one.

**The Logistics word law (re-ruled by the Delivery Blueprint, owner 2026-08-14).** Use
**`Logistics Partner`** for the role/category and the actual company name, such as **`NETS
Logistics`**, for an assignment. `Logistics` always keeps the s. `Logistic`, `Carrier` and
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

**The Stock word law (K0, Jess 2026-07-27):** one warehouse, three questions —
`On hand` (what's here now) · `Ready stock` (how much to keep — a PLAN about
the same goods, never a second pool) · `In & out` (when things moved).
"Inventory" and "Movements" are banned UI words (POD treatment); internal
keys/routes keep their names.

**Aligning Purchase and Orders panels:** the Orders panel uses **Placed**
for the pre-Proceed state (customer ordered, ETA not confirmed). The
Purchase panel's ① stage fires AFTER Sales clicks Proceed, so it is called
**Send**, not "Place" — otherwise a new hire sees "Place" on two panels
meaning two different things.

---

## The Work module words (SO V2 Card 10, owner ruling 2026-08-11)

The Work page adds **no new action vocabulary** — every row line is the same
`orderActionLine` the Orders list prints, and every due date is the ruled
weekday+date spelling (`Thu 6 Aug`). Only these strings are the page's own:

| Concept | Canonical word | Do NOT use |
|---|---|---|
| The sidebar door / page | **Work** | Tasks · To-do · Queue · Dashboard |
| The two filters over the one set | **My Work · Team Work** | My tasks · Everyone · All work |
| Work with no anchor date yet | **No date** | Unscheduled · Someday · TBD |
| The open/late tally | **{n} open · {n} late** | Total · Outstanding |
| The clear state | **No open work — every track is clear.** | All done · Empty |
| Late work | **{n} working days late** (the original due stays printed) | Overdue by · Delayed |

**System work has NO Done button** — an item leaves when its owning module
records the completion fact. A human follow-up stays `ops_tasks`, labelled
human, and is the only explicitly completable thing.

## Numbers, dates, money

- **Numbers**: tabular-nums font (`tabular-nums` class). `3 units` / `12 orders`.
- **Dates**: use `fmtDate()` from `@/lib/fmt-date` → `19 Jul 26, Sun`. Never
  hand-format. Never `toLocaleDateString`. See UI-KIT §A0 date law.
- **Relative time** (`today`, `2 days ago`) is allowed ONLY in headers or
  lead lines that render live — never in stored text.
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

## Header rules (see UI-KIT for the shell)

When a page sits under a module tab bar (Purchasing's `To Order / Purchase
Orders / Receiving / Claims / Settings`), the page does NOT repeat the active tab as
a breadcrumb or big title. **The tab is the title.** Move the freshness
stamp (`Today · Wed 22 Jul`) and refresh icon to the right side of the
tab bar. See `ui/MASTER.md` "Module-tab law".

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
