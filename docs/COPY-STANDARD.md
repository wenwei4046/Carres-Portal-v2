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
| 1 | Button = verb + object | `OK` · `Submit` · `Send` (alone) | `Send order to Ohana` |
| 2 | One action → one word | mix send / raise / place | `Send` everywhere |
| 3 | Numbers up front | `There are 2 orders to send` | `2 to send · 1 late` |
| 4 | Skip the obvious | `Below is the list of suppliers` | (just show the list) |
| 5 | Empty states teach | `No results` | `No orders to send today. Check back after 2 PM.` |
| 6 | Errors give the fix | `Invalid input` | `Master row missing G column. Ask Sales to fill it before Monday.` |
| 7 | Tooltip = WHY | button `Send` · tip `Click to send` | button `Send` · tip `Sends the PO to Ohana via WhatsApp` |
| 8 | Same word app-wide | Orders `Confirm ready date` · Purchase `Follow up` | Both say `Confirm ready date` |
| 9 | Zero jargon | requisition · expedite · MRP · GRN | order · call · plan · check in |
| 10 | Cut a sentence if possible | `Please note that this order...` | `This order is 1 day late. Send now.` |

## The three "who / what / when" questions

Before writing any string, answer:

1. **Who** reads this? (new operator · manager · customer)
2. **What** do they do next?
3. **Which** specific name / number / date do they need?

If any answer is missing, the sentence is not written yet.

---

## Row action-line template

Every list row ends with a plain-English sentence telling the reader the next
action. **Length ≤ 10 words.** Shape:

    [Verb] + [Object with a name] + [When or why]

Examples (all pass):

    ✔ Send order to Ohana today.               (5 words)
    ✔ Remind Nice Future — PO-86 due Fri.      (7 words)
    ✔ Call Ohana — confirm PO-88 ready date.   (7 words)
    ✔ Check in from Ohana (3 items).           (6 words)

Anti-patterns (all fail):

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
    4. Click Send PO.

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

    ✔ "No orders to send today. Check back after 2 PM when Master syncs."
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
    ✔ "PO already sent — you cannot send again. If wrong, click Cancel."

Anti-patterns:

    ✘ "Invalid input."
    ✘ "Error 500."
    ✘ "Something went wrong."

---

## Tooltip pattern

The visible label says **WHAT**. The tooltip says **WHY**. They must not repeat.

    Label "Send"        · tooltip "Sends the PO to Ohana via WhatsApp."
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
  becomes a Call with a named party and a measurable object. "DO" and "PO"
  survive because the team already speaks them daily.
- **Every label lives in ONE place** — the audit table below ("The dictionary"). There is
  no second list of approved labels anywhere.

## Where the engine law lives

**This file defines WORDING only.** Action behaviour → `docs/ACTION-FLOW-STANDARD.md` ·
a module's workflow → `docs/<MODULE>-WORKING-FLOW.md` · execution queues →
`docs/execution-queues-index.md`. A rule lives in one document and is never copied here.

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
DUE conditions — they live in `docs/ORDERS-WORKING-FLOW.md` §3, and nowhere else (Law 0A).
This table used to carry them; C2 found the copy and it was deleted rather than kept in
step.

Every deadline is counted in **working days** (see the one definition above) — the same
engine procurement uses. Lateness is written as the count
tail, numbers up front: `5 · 2 late`.

**`Issue delivery order` IS an action** (Jess 2026-07-27): once the customer's date is
confirmed, the SYSTEM produces the document and the operator only presses the button —
nobody authors a delivery order by hand. Card C7 builds it; the number is stamped at
dispatch today, which is too late to hand to logistics, and C7 moves it.

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
The code mirror is `packages/shared/order-action-words.ts`; that module and this
table are one-to-one, so a queue and a row can never spell one action two ways.

**ORDERS + DELIVERY** (shipped C1, PR #461):

| Queue tile | Row line | Button | Done message | Empty state |
|---|---|---|---|---|
| `Send PO` | `Send PO to {supplier}` | `Send PO` | `PO sent to {supplier}` | `No POs to send today.` |
| `Confirm ready date` | `Call {supplier} — confirm ready date` | `Record ready date` | `Ready date recorded` | `No supplier to call today. Everything on track.` |
| `Assign logistics` | `Assign logistics` | `Assign logistics` | `{logistics} assigned` | `Every order has a logistics company.` |
| `Confirm delivery date` | `Call {logistics} — confirm delivery date` | `Confirm booking` | `Delivery confirmed {date} · {slot}` | `0 calls to make · everything on track.` |
| `Issue delivery order` | `Issue delivery order` | `Issue delivery order` | `Delivery order issued` | `Nothing waiting for a delivery order.` |
| `Deliver today` | `Deliver today` | `Mark delivered` | `Delivered` | `No deliveries today.` |
| `Upload delivery photo` | `Upload delivery photo` | `Upload delivery photo` | `Delivery photo saved` | `Every delivery has its photo.` |
| `Arrange new delivery date` | `Call {logistics} — arrange new delivery date` | `Record new date` | `New date recorded` | `No delayed order needs a new date.` |
| `Collect RM {amount}` | `Collect RM {amount} from {customer}` | `Record payment` | `Payment recorded` | `Nothing outstanding.` |

**PURCHASING** (`docs/PURCHASING-WORKING-FLOW.md`):

| Queue tile | Row line | Button | Done message | Empty state |
|---|---|---|---|---|
| `Send PO` | `Send PO to {supplier}` | `Send PO` | `PO sent to {supplier}` | `No POs to send today. Next PO day is {date}.` |
| `Confirm ready date` | `Call {supplier} — confirm ready date` | `Record ready date` | `Ready date recorded` | `No supplier to call today. Everything on track.` |
| `Confirm tomorrow's delivery` | `Call {supplier} — confirm tomorrow's delivery` | `Record answer` | `Answer recorded` | `Nothing arriving tomorrow.` |
| `Check in` | `Check in from {supplier}` | `Check in` | `Checked in {n} of {m}` | `No goods arriving today. {supplier}'s next delivery is {date}.` |
| `Confirm balance delivery date` | `Call {supplier} — confirm balance delivery date` | `Record balance date` | `Balance date recorded` | `Nothing short today.` |
| `Confirm what happens next` | `Call {supplier} — confirm what happens next` | `Record what happens next` | `Supplier answer recorded` | `No claim is waiting for a supplier answer.` |

**`Send PO` and `Confirm ready date` are ONE action each, shared by Orders and
Purchasing** — same trigger, same completion, same words. They are listed twice
because both flows show them; they are never spelt differently.

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

### The verb dictionary — portal-wide (locked 2026-07-27)

Five verbs, five meanings. Every module uses these; no module invents a sixth.

**They govern WORKLIST ACTIONS, not form buttons.** A button inside a form that stores what
you just typed is `Save`, and one that abandons it is `Cancel` — those are not actions, they
never appear in a queue, and they need no verb from this table.

**The CHANNEL is not the action.** `Call {supplier} — confirm what happens next` is the same
action whether it is done by phone, by WhatsApp or in person: outward communication whose
outcome is recorded. A button that opens the WhatsApp group or copies the message is HOW,
not WHAT — label it `Open WhatsApp group` / `Copy message`, never as a second action.
**`Send` stays pinned to raising a purchase order to a factory** and is never reused for
"this message leaves our company" (rule 8).

| Verb | Means | Completion is |
|---|---|---|
| **Assign** | an INTERNAL decision — we choose who | the object is chosen. **Never** "the other side accepted" — acceptance is a later, separate action |
| **Call** | OUTWARD communication — we ask someone for information | the information is obtained **and recorded in the system**. A call with nothing recorded is not complete |
| **Issue** | the SYSTEM produces a formal document | the document exists |
| **Upload** | evidence is attached | the file exists |
| **Close** | a case or claim is finished and its record is sealed | the record can no longer change |

Examples: `Assign logistics` · `Assign PIC` · `Assign warehouse picker` ·
`Call {supplier} — confirm ready date` · `Call {logistics} — confirm delivery date` ·
`Call {logistics} — arrange new delivery date` · `Issue invoice` · `Issue credit note` ·
`Upload delivery photo` · `Upload payment proof`.

**Consequence of the Issue rule:** the SYSTEM writes the document; the human only presses
the button. **`Issue delivery order` IS an action** (Jess ruled 2026-07-27): once the
customer's date is confirmed, the operator presses one button and the document exists, ready
to hand to logistics. Today `orders.do_number` is stamped by a DB trigger on the DISPATCH
transition (0098) — a day too late to give logistics the paper they ask for the evening
before. Card C7 moves the stamp to customer confirmation. Nobody ever authors a delivery
order by hand.

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
`Inventory` · `Movements` · `Recovery` (staff say "this order going to delay" — the word on
screen is `Delay planning`)

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

| Concept | Canonical word | Do NOT use |
|---------|---------------|------------|
| Raise a purchase order to a factory | **Send** (order / PO) | Place · Raise · Push · Submit · Create |
| Pre-due polite follow-up on an open PO | **Remind** | Notify · Ping · Alert · Nudge |
| Post-due firm follow-up on an open PO | **Call {supplier} — confirm ready date** | Chase · Expedite · Follow up · Push · Escalate |
| Log goods arrival | **Check in** | Receive (as a verb) · Book in · GRN · Goods receipt |
| An order line's goods are secured for that order | **Ready** | Reserved — on an order line it is read as `Received`, and the two mean opposite things. `Reserved` stays correct on the Stock screens, where it describes a UNIT and sits nowhere near `Received` |
| Customer confirmed ETA — ready for PO | **Proceed** | Confirmed · Approved · Green-lit |
| Customer ordered but no ETA yet | **Placed** | New · Draft · Pending · Open |
| Cancel an order | **Cancel** | Void · Abandon · Kill |
| Purchase order (the document) | **PO** | Purchase order · P/O · Order (ambiguous with customer order) |
| Customer's own order | **Order** (or `SO-1207`) | Sales order · Job · Ticket |
| The Purchase panel's three stages | **Send · Confirm ready date · Receive** | Chase · Place · Follow up · Book in |
| Photo proving a delivery happened | **delivery photo** | POD · Proof of Delivery · e-POD |
| Mattress + bed frame as one delivery | **Bed set** | Bedroom set · Bundle · Bed package |
| A follow-up delivery on the same order | **Second trip** | Partial delivery · Split shipment · Back-order |
| Getting a faulty item back from the customer | **`Pick up the item from {customer}`** | Collect the item · Retrieve · Recall — `Collect` means MONEY in this portal (Jess 2026-07-27) |
| Working out what to do about a delay, before anyone calls the customer | **`Delay planning`** | Recovery · Recovery plan · Exception handling · Escalation |
| Telling logistics to re-arrange a delayed delivery | **`Call {logistics} — arrange new delivery date`** | Call customer (stock delay) · Inform customer · Reschedule |
| Call to fix delivery date + slot | **Call {customer} — book delivery date** | Schedule delivery · Chase · Call customer (book delivery) [old T2 spelling] |
| The delivery company (any page/label) | **Logistics** (with s) · a named one reads `NETS Logistics` | Logistic · Carrier · Partner · Delivery partner |
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
| Where the supplier must send the goods | **where the goods go** | Ship-to · Destination · Drop point |
| What is still owed after a short delivery | **balance** | Outstanding qty · Back-order · Shortfall |
| Goods moved between our own locations | **stock transfer** | Relocation · Internal shipment · Redeployment |
| The drawer panel listing who to ring, one row per outside party | **Calls** | Chase Now · Actions · Follow-ups · Contacts — `Actions` is the ROW's open-action list and one word may not head two blocks (Jess 2026-07-28, PR #487); the panel's own empty state has read `0 calls to make · everything on track.` since C1, so the title is that sentence's noun, not a new word |

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

**The Logistics word law (Jess 2026-07-27).** Jess: "our english bad — logistic & logistics
we don't see different", so this was decided rather than asked again. **`Logistics`, always
with the s** — it is the correct English noun and it reads naturally with the company names
staff already say (`NETS Logistics`). `Carrier`, `Partner` and `Delivery partner` are banned
UI words (DB table names keep theirs). The rename is free: C1 is already rewriting every one
of those strings.

**The three-dot column has NO header (Jess 2026-07-27).** The dots are three independent
facts, not one status. `Status` is wrong and `Checks` reads as "cheques" beside money — so
the column carries no header word, and each dot is labelled by its own small icon (goods ·
delivery · money) from the portal icon set, never emoji (UI-KIT). The actions column IS
headed, and its word is **`Actions`** — plural, because an order can have several.

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

## Numbers, dates, money

- **Numbers**: tabular-nums font (`tabular-nums` class). `3 units` / `12 orders`.
- **Dates**: use `fmtDate()` from `@/lib/fmt-date` → `19 Jul 26, Sun`. Never
  hand-format. Never `toLocaleDateString`. See UI-KIT §A0 date law.
- **Relative time** (`today`, `2 days ago`) is allowed ONLY in headers or
  lead lines that render live — never in stored text.
- **Currency**: `RM 1,250.00`. Never `$` or `MYR` in row text.

---

## Header rules (see UI-KIT for the shell)

When a page sits under a module tab bar (like Purchasing's `To Order /
Purchase Orders / Receiving`), the page does NOT repeat the active tab as
a breadcrumb or big title. **The tab is the title.** Move the freshness
stamp (`Today · Wed 22 Jul`) and refresh icon to the right side of the
tab bar. See `docs/UI-KIT.md` "Module-tab law".

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
