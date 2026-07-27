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

    [Verb] + [named party] + [measurable object]

- **Name the party.** Use the actual person/company when the system knows it
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

How actions are computed, when they appear and disappear, which one shows first, and what
every action must carry — **`docs/ACTION-FLOW-STANDARD.md`**. This file does not repeat it.
This file is only about the WORDS.

## The delivery queue words (re-ruled by Jess 2026-07-27 — this is the only version)

The delivery lifecycle is FOUR queues; the queue's label IS the row's top
checklist item. The list is closed; a new chat does not add a fifth:

| Step | The label | It holds | It goes late |
|---|---|---|---|
| 1 | `Assign logistics` | Stock in, no logistics company picked | 3 working days before the promised date |
| 2 | `Confirm delivery date` | Logistics assigned, customer has not confirmed (row line: `Call {logistics} — confirm delivery date`) | 1 working day before the promised date |
| 3 | `Deliver today` | Customer confirmed TODAY | — (it is today) |
| 4 | `Upload delivery photo` | Delivered, no photo attached | 1 working day after the delivery |

Every deadline is counted in **working days** (Mon–Sat, Selangor public holidays
skipped) — the same engine procurement uses. Lateness is written as the count
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

### Live audit — what ships today vs what it must say

**ACTIONS (the ladder, the queues, the buttons):**

| Ships today | Verdict | Must become |
|---|---|---|
| `Order PO` | no party | `Send PO to {supplier}` |
| `Chase supplier` | banned word · no measurable object | `Call {supplier} — confirm ready date` |
| `Chase logistic` | banned word + banned party word | `Call {logistics} — confirm delivery date` |
| `Call customer (stock delay)` | party is a role · object not measurable | `Call {customer} — agree new delivery date` |
| `Assign logistics` | ✅ keep | (the party is what you are choosing — it cannot be named yet) |
| `Deliver today` | ✅ keep | (verb + when; the truck is the party) |
| `Upload delivery photo` | ✅ keep | (nobody else is involved) |
| `Collect $` | no amount, no party | `Collect RM {amount} from {customer}` (pill: `Collect RM 2,455`) |
| `Confirm` | bare verb — worst offender | `Confirm delivery with {customer}` |
| `Done` | ✅ keep | (terminal fact, not an action) |

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

Four verbs, four meanings. Every module uses these; no module invents a fifth.

| Verb | Means | Completion is |
|---|---|---|
| **Assign** | an INTERNAL decision — we choose who | the object is chosen. **Never** "the other side accepted" — acceptance is a later, separate action |
| **Call** | OUTWARD communication — we ask someone for information | the information is obtained **and recorded in the system**. A call with nothing recorded is not complete |
| **Issue** | the SYSTEM produces a formal document | the document exists |
| **Upload** | evidence is attached | the file exists |

Examples: `Assign logistic` · `Assign PIC` · `Assign warehouse picker` ·
`Call {supplier} — confirm ready date` · `Call {logistics} — confirm delivery date` ·
`Call {customer} — agree new delivery date` · `Issue invoice` · `Issue credit note` ·
`Upload delivery photo` · `Upload payment proof`.

**Consequence of the Issue rule:** if a document is produced automatically, there is no
human action to show. `orders.do_number` is stamped by a DB trigger on dispatch (0098), so
**"Issue delivery order" is not an action in this portal** — the verb rule and the trigger
agree. It becomes an action only if Carres later wants a human gate before dispatch, which
is a business decision, not a wording one.

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
`Pending` · `Processing` · `In Progress` · `Waiting` · `At Risk` · `Attention` ·
`Inventory` · `Movements`

(Filters may name a real STATE — `Placed`, `Proceed`, `Delivered`, `Owing` — but never
one of the words above.)

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
| Customer confirmed ETA — ready for PO | **Proceed** | Confirmed · Approved · Green-lit |
| Customer ordered but no ETA yet | **Placed** | New · Draft · Pending · Open |
| Cancel an order | **Cancel** | Void · Abandon · Kill |
| Purchase order (the document) | **PO** | Purchase order · P/O · Order (ambiguous with customer order) |
| Customer's own order | **Order** (or `SO-1207`) | Sales order · Job · Ticket |
| The Purchase panel's three stages | **Send · Confirm ready date · Receive** | Chase · Place · Follow up · Book in |
| Photo proving a delivery happened | **delivery photo** | POD · Proof of Delivery · e-POD |
| Mattress + bed frame as one delivery | **Bed set** | Bedroom set · Bundle · Bed package |
| A follow-up delivery on the same order | **Second trip** | Partial delivery · Split shipment · Back-order |
| Call to fix delivery date + slot | **Call {customer} — book delivery date** | Schedule delivery · Chase · Call customer (book delivery) [old T2 spelling] |
| The delivery company (any page/label) | **Logistics** (with s) · a named one reads `NETS Logistics` | Logistic · Carrier · Partner · Delivery partner |
| The goods pool (any page/tab/label) | **Stock** | Inventory · Warehouse (as a menu word) |
| Stock in/out history (tab/label) | **In & out** | Movements · Movement log (menu) · Ledger |
| A logistics company's own working rules | **delivery rules** | Partner profile · SLA · Carrier config |
| Notice logistics need before a delivery day | **working days notice** | Lead time · Cut-off · Booking window |
| A date logistics are closed | **not running on** | Blackout · Unavailable · Out of service |
| Most drops logistics take in a day | **deliveries a day** | Capacity · Max load · Slots |

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
