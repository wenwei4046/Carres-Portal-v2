# Carres Portal — Copy Standard

> The single source of truth for how UI text is written across every page of
> `apps/web`. **Read this BEFORE writing any button label, section title, row
> line, empty state, error, or tooltip.** Locked with Jess (COO) 2026-07-22.
>
> If any older chat, memory, or doc contradicts this file, this file wins.
> The UI-KIT points at this file as the authority for microcopy.
>
> **This file owns LANGUAGE and nothing else.** It never owns business workflow,
> business rules, UI layout, information architecture, or implementation detail —
> see §0.2.

## Chapter map

Ten chapters, added 2026-07-29 as a **navigation layer only**. Every section
heading below is the one it always had — nothing was renamed, so every existing
reference by title still resolves. A chapter number is a shortcut, never a new rule.

| § | Chapter | The question it answers |
|---|---|---|
| **§0** | Purpose | why this file exists · what it owns · what it never owns |
| **§1** | Writing Principles | how any string is written |
| **§2** | Terminology Dictionary | which word names which thing |
| **§3** | Action Naming | how an action is named, and its five strings |
| **§4** | Status Naming | how a status is named |
| **§5** | Button Standards | how a button is named |
| **§6** | Labels | how a field, a column and a group heading are named |
| **§7** | Messages | how errors, tooltips and confirmations are written |
| **§8** | Empty States | how an empty screen is written |
| **§9** | Forbidden Words | **the one banned-word table — the only one** |

**Three things a chat must know before writing a word:**

1. **§9 is the only ban list in the portal.** No other section, file or chat keeps
   a second one. If a word is banned, it has exactly one row there.
2. **§3.4 is the only place an action's strings are spelled.** Five strings per
   action, one row each.
3. **A word that is not in this file may not appear on screen.** It is a decision —
   ask Jess or Loo, do not invent (§0.2).

---

# §0 · Purpose

| § | Section |
|---|---|
| 0.1 | Why this exists |
| 0.2 | What this document owns — and what it never owns |
| 0.3 | The ⇢ marker — a rule on its way out |
| 0.4 | Where the engine law lives |

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

## §0.2 What this document owns — and what it never owns

**It owns LANGUAGE.** Every visible word: actions, statuses, buttons, queues,
errors, confirmations, empty states, labels, banned words, terminology.

**It never owns:**

| Not owned here | Its owner |
|---|---|
| Business workflow — what a module does, in what order | `docs/<MODULE>-WORKING-FLOW.md` |
| Business rules — what is allowed, refused, gated, counted | `docs/<MODULE>-WORKING-FLOW.md` |
| The action engine — triggers, completion, due, ranking | `docs/ACTION-FLOW-STANDARD.md` |
| UI layout, spacing, colour, height budgets, components | `docs/UI-KIT.md` |
| Information architecture — which region carries what | `docs/<MODULE>-INFORMATION-MODEL.md` |
| Implementation detail — tables, triggers, routes, classes | the code, and the card that built it |

**The test, in one line:** if a sentence stops describing *how something is worded*
and starts describing *how something behaves*, it is not this file's. Ownership
moves out; the word stays.

**A word that is not here is a DECISION, not a gap to fill.** Ask. Three tables in
this file exist only because a screen shipped a word with nothing to check it
against (§3.4, §6.3, §9).

## §0.3 The ⇢ marker — a rule on its way out

Some blocks below describe behaviour, not language. They are marked:

> **⇢ NOT LANGUAGE · future owner: `<file>`** — kept here until the Foundation
> cleanup phase, when the owner file takes it and this copy is deleted. **Nobody
> may extend a ⇢ block, and no module doc may copy one.** Until then it is still
> the ruling — a rule with a pending address is not a rule with no address.

## Where the engine law lives

**This file defines WORDING only.** Action behaviour → `docs/ACTION-FLOW-STANDARD.md` ·
a module's workflow → `docs/<MODULE>-WORKING-FLOW.md` · execution queues →
`docs/execution-queues-index.md`. A rule lives in one document and is never copied here.

---

# §1 · Writing Principles

| § | Section |
|---|---|
| 1.1 | The 10 rules |
| 1.2 | The three "who / what / when" questions |
| 1.3 | Row action-line template |
| 1.4 | "What to do" step block template |
| 1.5 | Numbers, dates, money — incl. *A money figure is never rounded to make a column tidy* |

## The 10 rules

| # | Rule | ✘ Bad | ✔ Good |
|---|------|-------|--------|
| 1 | Button = verb + object | `OK` · `Submit` · `Send` (alone) | `Prepare PO for Ohana` |
| 2 | One action → one word | mix prepare / raise / place | `Prepare PO` everywhere |
| 3 | Numbers up front | `There are 2 POs to prepare` | `2 to prepare · 1 late` |
| 4 | Skip the obvious | `Below is the list of suppliers` | (just show the list) |
| 5 | Empty states teach | `No results` | `No purchase orders need preparation. Check back after 2 PM.` |
| 6 | Errors give the fix | `Invalid input` | `Master row missing G column. Ask Sales to fill it before Monday.` |
| 7 | Tooltip = WHY | button `Issue PO` · tip `Click to issue` | button `Issue PO` · tip `Creates the PO number and the document Ohana receives` |
| 8 | Same word app-wide | Orders `Confirm ready date` · Purchase `Follow up` | Both say `Confirm ready date` |
| 9 | Zero jargon — **unless the team already says it** | requisition · expedite · MRP · `GRN` as a VERB | order · call · plan · check in · `GRN` as the DOCUMENT (see the document/act split) |
| 10 | Cut a sentence if possible | `Please note that this order...` | `This order is 1 day late. Prepare PO now.` |

**Rule 3 is one format, portal-wide:** the count leads and lateness is the tail —
`2 to prepare · 1 late` · `5 · 2 late` · `{n} to do · {n} late`. Never a sentence
around a number.

## The three "who / what / when" questions

Before writing any string, answer:

1. **Who** reads this? (new operator · manager · customer)
2. **What** do they do next?
3. **Which** specific name / number / date do they need?

If any answer is missing, the sentence is not written yet.

## Row action-line template

Every list row ends with a plain-English sentence telling the reader the next
action. **Length ≤ 10 words.** Shape:

    [Verb] + [Object with a name] + [When or why]

Examples (all pass):

    ✔ Prepare PO for Ohana today.              (5 words)
    ✔ Remind Nice Future — PO-86 due Fri.      (7 words)
    ✔ Call Ohana — confirm PO-88 ready date.   (7 words)
    ✔ Check in from Ohana (3 items).           (6 words)

Anti-patterns (all fail):

    ✘ Process order.                           (no name · no timing · abstract verb)
    ✘ You should follow up with the factory... (passive · no name · too long)
    ✘ Handle this.                             (all three failures)
    ✘ Awaiting action.                         (passive · does not say WHO acts)

**These ✘ examples teach SHAPE, not vocabulary.** They are not a ban list —
§9 is (§9.0).

## "What to do" step block template

For a detail pane / drawer where a full task is executed. Rules:

- **Max 4 steps.**
- **Each step ≤ 8 words.**
- **Each step starts with one verb.**
- Include the specific name / number / URL in the step.

Example (good):

    What to do:
    1. WhatsApp Ohana (012-3456).
    2. Paste the SKU list above.
    3. Ask for ETA.
    4. Click Prepare PO.

Anti-pattern (too wordy):

    What to do:
    1. Open your WhatsApp application and locate the contact "Ohana"
       who is the manager of the sofa factory we work with regularly.
    2. Please make sure you copy the SKU list from the table above,
       being careful not to miss any of the items shown...

If a step needs a paragraph of explanation, it belongs in a separate help
article, not in the "What to do" block.

**Where a step is one of the portal's OWN actions, it is worded by that action's
Button string** (§3.4, string 3) — never by a verb invented for the list.
Whether a step may exist at all, and what closes it, is the engine's:
`docs/ACTION-FLOW-STANDARD.md` Law 2.

## Numbers, dates, money

- **Numbers**: tabular figures. `3 units` / `12 orders`. *(Which class renders
  them → `docs/UI-KIT.md` §2.3.)*
- **Dates**: `19 Jul 26, Sun`. One spelling, portal-wide. Never hand-format,
  never `toLocaleDateString`. *(The helper and the token → `docs/UI-KIT.md` §2.4.)*
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

# §2 · Terminology Dictionary

| § | Section |
|---|---|
| 2.1 | Vocabulary — the canonical words |
| 2.2 | The Purchase Order lifecycle words — CANONICAL HOME — incl. *The six Operation Status labels* and *The Purchasing nouns and facts* |
| 2.3 | Receiving and supplier-exception words |
| 2.4 | The delivery group words |
| 2.5 | The delivery calendar words |
| 2.6 | The delivery window words |
| 2.7 | The Delivery module words — incl. the Logistics word law and the Stock word law |
| 2.8 | Working days — THREE calendars, and this file does not define them |

**One concept, one word.** The banned synonyms that used to sit beside each row
moved to §9 on 2026-07-29 — every one of them is there, with the reason and this
table's word as its replacement.

## Vocabulary — the canonical words

Use these words EVERYWHERE. Never a synonym in a different page. When in
doubt, grep the codebase and match what already ships.

| Concept | Canonical word |
|---------|---------------|
| Raise a purchase order to a factory — **it is TWO acts, never one** | **`Prepare PO`** (a Draft PO exists; nothing has left our company) **then `Issue PO`** (the formal PO exists) |
| Pre-due polite follow-up on an open PO | **Remind** |
| Post-due firm follow-up on an open PO | **Call {supplier} — confirm ready date** |
| Log goods arrival — the ACT | **Check in** |
| The DOCUMENT that the act produces | **GRN** |
| An order line's goods are secured for that order | **Ready** |
| Customer confirmed ETA — ready for PO | **Proceed** |
| Customer ordered but no ETA yet | **Placed** |
| Cancel an order | **Cancel** |
| Purchase order (the document) | **PO** |
| Customer's own order | **Order** (or `SO-1207`) |
| The To Order stages | **`Confirm ready date` · `Issue PO` · `Prepare PO`** — in that display order (`docs/ACTION-FLOW-STANDARD.md` Law 4 rung 3) |
| Photo proving a delivery happened | **delivery photo** |
| Mattress + bed frame as one delivery | **Bed set** |
| A follow-up delivery on the same order | **Second trip** |
| Getting a faulty item back from the customer | **`Pick up the item from {customer}`** |
| Working out what to do about a delay, before anyone calls the customer | **`Delay planning`** |
| Telling logistics to re-arrange a delayed delivery | **`Call {logistics} — arrange new delivery date`** |
| Call to fix delivery date + slot | **Call {customer} — book delivery date** |
| The delivery company (any page/label) | **Logistics** (with s) · a named one reads `NETS Logistics` |
| The goods pool (any page/tab/label) | **Stock** |
| Stock in/out history (tab/label) | **In & out** |
| A logistics company's own working rules | **delivery rules** |
| Notice logistics need before a delivery day | **working days notice** |
| A date logistics are closed | **not running on** |
| Most drops logistics take in a day | **deliveries a day** |
| How long a factory takes to make an item | **production working days** |
| The days a factory is open | **Supplier work week** |
| The earliest delivery date a store may sell | **Earliest date a store may sell** |
| The last day we may send the PO and still be safe | **order-by date** |
| The days of the week we send POs | **PO days** |
| Days kept back for arranging the delivery | **order-by buffer** |
| Where the supplier must send the goods | **where the goods go** |
| What is still owed after a short delivery | **balance** |
| Goods moved between our own locations | **stock transfer** |
| The drawer panel listing who to ring, one row per outside party | **Calls** |

**Two rows carry a ruling that outlives their synonym, so it is stated here rather
than in §9:**

- **`Ready`, not `Reserved`, on an ORDER LINE.** On a line, `Reserved` is read as
  `Received`, and the two mean opposite things. `Reserved` stays correct on the
  Stock screens, where it describes a UNIT and sits nowhere near `Received`.
- **`Collect` means MONEY in this portal** (Jess 2026-07-27). Getting a faulty item
  back is `Pick up the item from {customer}`.

## The Purchase Order lifecycle words — CANONICAL HOME (Loo, 2026-07-29 · frozen by P6)

**Every Purchasing word lives here. No other file may redefine one; they reference this
section.** `docs/PURCHASING-WORKING-FLOW.md` owns what the actions DO,
`docs/PURCHASING-INFORMATION-MODEL.md` owns where the facts sit — neither respells a word.

**This is a PURCHASING exception to two rows in the vocabulary table above, and it is
deliberate.** A Purchase Order and a customer order are two different subjects; a word banned
on one is not automatically banned on the other. **`Draft` and `Open` stay banned for a
CUSTOMER ORDER.**

**Action ≠ Status. They may never be mixed.** An action is something a person does and it
LEAVES when its outcome is recorded. A status is what the PO currently is.

### The six Operation Status labels — the ONLY six

| # | Label | Means |
|---|---|---|
| 1 | **`Draft`** | **not a formal Purchase Order.** Nothing has left our company and no PO number exists |
| 2 | **`Issued`** | a formal PO has been created and issued |
| 3 | **`In Production`** | supplier fulfilment is underway |
| 4 | **`Receiving`** | physical goods receipt has started |
| 5 | **`Completed`** | the PO is fully received and no remaining purchasing action exists |
| 6 | **`Cancelled`** | the PO will no longer be fulfilled |

**`Open` is never a Purchase Order status.** The word for a PO that has been issued is
`Issued`. (`Open` also reads as "not yet finished", which is a different fact and is what
`Receiving` says.)

**Supplier Status is a SEPARATE axis** — what the factory and the logistics partner report.
It is never merged into the six above, and it is not Purchasing's to redefine: two external
roles run their whole lifecycle on it.

### The Purchasing nouns and facts

| Concept | Canonical word |
|---|---|
| A prepared purchase that is not yet official | **`Draft PO`** — this exact noun, everywhere it is visible. It is a Purchasing business object and **not** a Purchase Order: no PO number, no external document |
| Demand a Draft PO covers that no longer exists | **`Demand no longer required`** — a FACT, never an action and never a status. Supporting line: `The customer-order demand covered by this Draft PO no longer exists.` It must stop the draft being issued until somebody has looked at it |
| Demand that one or more Draft POs already cover | **`Covered by {count} Draft POs`** · singular **`Covered by 1 Draft PO`** — informational only. **It does not mean the demand has been ordered** |
| Demand somebody has consciously reviewed and delayed | region **`Purchasing on Hold`** · row fact **`On hold until {date}`**, carrying **Held by** · **Reason** · **Held time** · **Resume date** |
| An item whose supplier cannot be worked out | **`Supplier not assigned`** — a FACT, under Missing Configuration. Supporting line: `Assign a supplier before this item can enter the purchasing plan.` |

**Communication is NOT part of the PO lifecycle** (Loo, 2026-07-29). WhatsApp and Email are
channels that may vary per supplier; they are never a status, never an Operation Status value,
and they occupy no position in the purchasing information model. The channel words themselves
are unchanged (`Open WhatsApp` · `Open WhatsApp group`, §5.2).

**The eight terminology slots that stood open from 2026-07-29 are CLOSED by this section.**
Every word above is ruled. No terminology placeholder is left in Purchasing, and a chat that finds
one has found a document that was missed.

## Receiving and supplier-exception words (locked 2026-07-27)

One vocabulary for every module that waits on a supplier. Never invent a synonym.

| Group | The words |
|---|---|
| Receiving result | `Received` · `Received with exception` · `Rejected` |
| Exception lifecycle | `Receiving exception created` · **`Call {supplier} — confirm what happens next`** · `Waiting supplier reply` · `Waiting goods arrival` · `Overdue goods arrival` · `Supplier cannot fulfil` · `Case owner decision required` · `Exception closed` |

**`Contact supplier` is retired** (Loo, 2026-07-28). It was a SIXTH verb for behaviour the
verb dictionary already covers — reach the outside party, get an answer, record the outcome,
which is exactly `Call`. The action is `Call {supplier} — confirm what happens next` and its
five strings are in §3.4. **The R2/R3 screens still say `Contact`; the rename is
scheduled in the ④ R lane** — until it lands, this table is the ruling and the screen is the
lag, not the other way round.

**Waiting words are STATES, never actions** — nobody acts while one is true (engine law;
the bare word `Waiting` is banned, §9).
**Every module fails the same way:** one `Exception` plus a `Reason`, never a family of
different failure words.

## The delivery group words (T8, locked with Jess 2026-07-27)

There are exactly TWO groups, and a group is one atom — the words below name
groups, never individual items:

| Group | The word | What it holds |
|---|---|---|
| bed | **Bed set** | Mattress + bed frame |
| sofa | **Sofa** | Sofa lines |

Accessories (pillow, mattress protector) belong to no group and are never
named in a trip.

Fixed phrasings — reuse these, do not invent variants:

- Split offer (only when part is ready and part is not):
  `Sofa not ready yet. Ask the customer:` + `Wait for everything` /
  `Deliver Bed set now`
- Confirmed partial trip: `Bed set only` (pill) ·
  `Bed set only — Sofa follows on a second trip` (activity line)
- What is still owed: row `Second trip` → `Sofa still to deliver` +
  `Book second trip`, or `stock not in yet` when it cannot be booked.

**Never** write "partial delivery", "split shipment", "back-order" or
"consignment" on screen — say what goes and what follows, in furniture words (§9).

> **⇢ NOT LANGUAGE · future owner: `docs/ORDERS-WORKING-FLOW.md`** — **what may
> travel apart and what may never**: a Bed set may go alone but never one half of
> it without the other; a Sofa may follow on a second trip ONLY if the customer
> agreed; accessories never block a delivery and are back-ordered. That is a
> business rule about goods, not a word. Still the ruling; moves at the Foundation
> cleanup phase.

## The delivery calendar words (T10, locked with Jess 2026-07-27)

| Concept | Canonical word |
|---|---|
| The three calendar views | **Today · Tomorrow · This week** |
| The customer said yes to this date | **Confirmed** (+ the slot, e.g. `12pm–3pm`) |
| Only logistics have named this date | **Logistics' date** |
| Promised on this day, no booking yet | **Promised this day, no date yet** |
| No logistics picked yet | **No logistics picked** |
| Nothing booked on a day | **No deliveries booked this day.** |

> **⇢ NOT LANGUAGE · future owner: `docs/ORDERS-WORKING-FLOW.md`** (colour →
> `docs/UI-KIT.md` §3.6) — a calendar day answers ONE question, *which trucks move
> that day*, so a day is filled by the BOOKING and never by the date we promised;
> **"This week" means the REST of this week** (today through Saturday, Sunday never
> in a delivery range); a promised-but-unbooked order is never COUNTED as a
> delivery but is listed under its own heading with the call that fixes it
> (`Call {customer} — book delivery date`); **Confirmed is the ONLY green on the
> calendar**, and the logistics company's own date is amber, always.

## The delivery window words (locked with Jess 2026-07-27)

Fixed phrasings — reuse, never invent a variant:

- The fact: `Half-day delivery · condominium` · `Full-day delivery`
- The refusal: `Fill in the building type first — a condominium can only take a
  half-day delivery.`

**Never** write "access restrictions", "site constraints", "delivery window policy" or
"lift booking required" on screen (§9). Say what the building is and how long the truck has.

> **⇢ NOT LANGUAGE · future owner: `docs/ORDERS-WORKING-FLOW.md`** — **how long a
> delivery takes depends on the building**, and the rule behind the two phrasings
> above is business, not wording:
>
> | Building type | The window | Why |
> |---|---|---|
> | `Landed` · `Retail` | **Full-day delivery** | the truck drives up to the door |
> | `Condo` · `Apartment` · `Office` | **Half-day delivery** | the lift must be booked and the driver must report in |
> | `Other` / not filled | **Full-day delivery**, and the booking is refused until it is filled | the refusal STANDS |
>
> **Building type is MANDATORY at go-live, and the blanks are not a reason to
> soften it** (Loo, 2026-07-28). Of the live blanks measured 2026-07-28, the
> AutoCount import rows disappear when the database starts clean; the handful of
> portal orders are blank because the POS writes the field only when it is
> non-empty — so "mandatory" is a change the POS still has to make, not a state it
> is already in. *(The measured counts are evidence, not law: they live in
> `docs/phase-10-worklog.md`.)* A chat that meets those blanks must not propose a
> default, a grandfather clause or a "legacy" branch.

## The Delivery module words (T11, locked with Jess 2026-07-27)

The standalone Delivery page adds **no new vocabulary**. Its queue names, its
action pills and its calendar lines are the words already ruled above, taken
from the same shared constants the Orders list reads — a module that spelt a
queue differently would be rule 8's failure with its own menu item. Only these
four strings are the page's own:

| Concept | Canonical word |
|---|---|
| The two views of the module | **Queues · Calendar** |
| How much work is on the board | **{n} to do · {n} late** |
| Nothing in the picked queue | **Nothing to do here.** + the sentence saying when an order joins |
| Leaving the module to act | **Open order** |

**The module states facts and hands over.** Every write — booking a date,
recording a reason, uploading a delivery photo — happens in the order drawer.
So the page carries exactly ONE button, and its word says where it takes you.

**The delivery-rule word law (T9, Jess 2026-07-27):** every delivery-rule line
must name the logistics company and end in something the operator can do — "call
them" or "pick another day". A warning that only states a fact ("capacity
exceeded") tells a new hire nothing about the next second. **Sunday never appears
in a logistics company's rules**: a per-partner Sunday line would read as though a
phone call could buy one.

> **⇢ NOT LANGUAGE · future owner: `docs/ORDERS-WORKING-FLOW.md`** — that every
> delivery-rule line WARNS and none of them BLOCKS, and that Sunday is refused for
> every logistics company, are business rules. The wording law above stands on its
> own without them.

**The Logistics word law (Jess 2026-07-27).** Jess: "our english bad — logistic & logistics
we don't see different", so this was decided rather than asked again. **`Logistics`, always
with the s** — it is the correct English noun and it reads naturally with the company names
staff already say (`NETS Logistics`). `Carrier`, `Partner` and `Delivery partner` are banned
UI words (§9); DB table names keep theirs.

**The Stock word law (K0, Jess 2026-07-27):** one warehouse, three questions —
`On hand` (what's here now) · `Ready stock` (how much to keep — a PLAN about
the same goods, never a second pool) · `In & out` (when things moved).
"Inventory" and "Movements" are banned UI words (§9); internal
keys/routes keep their names.

## Working days — THREE calendars, and this file does not define them

**Office Mon–Fri · Warehouse Mon–Sat · Delivery Mon–Fri + a reduced Saturday** (Loo
2026-07-28). The definition lives in **`docs/ACTION-FLOW-STANDARD.md` Law 2A** and nowhere
else — this file owns WORDS, not the engine.

*(Until 2026-07-28 the full definition sat here AND in Law 2, both saying "Monday–Saturday,
one definition for every module". Two homes for one rule, and the rule itself was the
warehouse's week wearing everybody's name. Deleted here rather than corrected in two
places — Law 0A.)*

**The word on screen is always "working days"** — never "business days", never a
raw day count that has quietly skipped a weekend.

---

# §3 · Action Naming

| § | Section |
|---|---|
| 3.1 | Action naming law — incl. *The document / act split* |
| 3.2 | The verb dictionary — portal-wide |
| 3.3 | The dictionary — every visible word, audited |
| 3.4 | **THE DICTIONARY — five strings per action** |
| 3.5 | The delivery queue words |
| 3.6 | The warehouse count words |
| 3.7 | One business, one dictionary |
| 3.8 | UI type dictionary |

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
- **Every label lives in ONE place** — §3.4 ("The dictionary"). There is
  no second list of approved labels anywhere.

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

## The verb dictionary — portal-wide (locked 2026-07-27)

**SEVEN verbs, seven meanings. Every module uses these; no module invents an eighth.**

*(It was five until 2026-07-28. `Return` was added by Loo's ruling because R6 needed a word
for "this record goes back to whoever produced it" and reached for `Send back`. **`Prepare`
was added 2026-07-29 (P6) and cleared the same bar**: the frozen Purchase Order lifecycle
splits raising a PO into two acts, and the first one produces a Draft PO that has left our
company in no way. Every existing verb was tested against it and none fits — `Issue` is the
SECOND act, and `Assign` · `Call` · `Upload` · `Close` · `Return` are about other objects
entirely. **The bar for an eighth is this bar: no existing verb fits, and the alternative is
a module inventing its own.**)*

**They govern WORKLIST ACTIONS, not form buttons.** A button inside a form that stores what
you just typed is `Save`, and one that abandons it is `Cancel` — those are not actions, they
never appear in a queue, and they need no verb from this table (§5.1).

**The CHANNEL is not the action.** `Call {supplier} — confirm what happens next` is the same
action whether it is done by phone, by WhatsApp or in person: outward communication whose
outcome is recorded. A button that opens WhatsApp or copies the message is HOW,
not WHAT — never a second action.

| Verb | Means | Completion is |
|---|---|---|
| **Assign** | an INTERNAL decision — we choose who | the object is chosen. **Never** "the other side accepted" — acceptance is a later, separate action |
| **Call** | OUTWARD communication — we ask someone for information | the information is obtained **and recorded in the system**. A call with nothing recorded is not complete |
| **Issue** | the SYSTEM produces a formal document | the document exists |
| **Upload** | evidence is attached | the file exists |
| **Close** | a case or claim is finished and its record is sealed | the record can no longer change |
| **Return** | a record goes BACK to the party that produced it, for them to act on | the record is with them **and its state says so on their screen** |
| **Prepare** | work is gathered and organised into a document that is **not yet formal** and has left our company in no way | **the draft exists and can be reviewed.** Never "it was sent" — sending is a later, separate act, and under `Issue` |

Examples: `Assign logistics` · `Assign PIC` · `Assign warehouse picker` ·
`Call {supplier} — confirm ready date` · `Call {logistics} — confirm delivery date` ·
`Call {logistics} — arrange new delivery date` · `Issue invoice` · `Issue credit note` ·
`Upload delivery photo` · `Upload payment proof` · `Return count to Carres` ·
`Return count to {warehouse}`.

**`Send` IS RETIRED AS AN ACTION VERB (2026-07-29, P6) AND STAYS BANNED FROM REUSE.** It was
pinned to raising a purchase order to a factory; the frozen lifecycle replaced that single
act with **`Prepare PO`** then **`Issue PO`**, so **no action in the portal is named `Send`
any more.** The pin does not lift with it: `Send` may still never be reused for "this message
leaves our company" (rule 8), for returning a record (`Return`), or for anything else. A word
with no owner is not a free word — it is a word one module is about to claim. Its row is in §9.

**Consequence of the `Issue` rule:** the SYSTEM writes the document; the human only presses
the button. Nobody ever authors a delivery order, an invoice or a credit note by hand, and no
label may suggest they do.

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
| `Confirm tomorrow's delivery` | is it coming on the day we expect it? | `It ships on {date}` · `It ships later than {date}` | — (none: the tile's own label is already the whole instruction, and the tooltip rule in §7.2 says delete a tooltip that would restate the label) |

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

**ORDERS + DELIVERY** (shipped C1, PR #461):

| Queue tile | Row line | Button | Done message | Empty state |
|---|---|---|---|---|
| `Prepare PO` · `Issue PO` · `Confirm ready date` | — | — | — | — *(**defined once in the PURCHASING table below.** The Orders ladder DISPLAYS these three; it does not respell them, so all four cells are answered by that table rather than empty here.)* |
| `Assign logistics` | `Assign logistics` | `Assign logistics` | `{logistics} assigned` | `Every order has a logistics company.` |
| `Confirm delivery date` | `Call {logistics} — confirm delivery date` | `Confirm booking` | `Delivery confirmed {date} · {slot}` | `0 calls to make · everything on track.` |
| `Issue delivery order` | `Issue delivery order` | `Issue delivery order` | `Delivery order issued` | `Nothing waiting for a delivery order.` |
| `Deliver today` | `Deliver today` | `Mark delivered` | `Delivered` | `No deliveries today.` |
| `Upload delivery photo` | `Upload delivery photo` | `Upload delivery photo` | `Delivery photo saved` | `Every delivery has its photo.` |
| `Delay planning` | `Delay planning` | `Record the delay decision` | — (none: the row leaves by itself, and `Arrange new delivery date` says what happened) | `No supplier date lands after a promised date.` |
| `Arrange new delivery date` | `Call {logistics} — arrange new delivery date` | `Record new date` | `New date recorded` | `No delayed order needs a new date.` |
| `Collect RM {amount}` | `Collect RM {amount} from {customer}` | `Record payment` | `Payment recorded` | `Nothing outstanding.` |

**PURCHASING** (`docs/PURCHASING-WORKING-FLOW.md`):

| Queue tile | Row line | Button | Done message | Empty state |
|---|---|---|---|---|
| `Prepare PO` | `Prepare PO for {supplier}` | `Prepare PO` | `Draft PO prepared for {supplier}` | `No purchase orders need preparation.` |
| `Issue PO` | `Issue PO to {supplier}` | `Issue PO` | `PO issued to {supplier}` | `No draft purchase orders are ready to issue.` |
| `Confirm ready date` | `Call {supplier} — confirm ready date` | `Record ready date` | `Ready date recorded` | `No supplier to call today. Everything on track.` |
| `Confirm tomorrow's delivery` | `Call {supplier} — confirm tomorrow's delivery` | `Record answer` | `Answer recorded` | `Nothing arriving tomorrow.` |
| `Check in` | `Check in from {supplier}` | `Check in` | `Checked in {n} of {m}` | `No goods arriving today. {supplier}'s next delivery is {date}.` |
| `Confirm balance delivery date` | `Call {supplier} — confirm balance delivery date` | `Record balance date` | `Balance date recorded` | `Nothing short today.` |
| `Confirm what happens next` | `Call {supplier} — confirm what happens next` | `Record what happens next` | `Supplier answer recorded` | `No claim is waiting for a supplier answer.` |

**THIS TABLE IS THE CANONICAL HOME FOR EVERY PURCHASING ACTION, INCLUDING THE ONES THE ORDERS
LADDER DISPLAYS.** The Orders row and the Purchasing row show the same work, so `Prepare PO`,
`Issue PO` and `Confirm ready date` are defined **once, here**. The ORDERS table above points
at this one; it does not respell them.

*(This replaces the rule that `Send PO` and `Confirm ready date` were ONE action each "shared
by Orders and Purchasing … listed twice". Loo deleted that statement on 2026-07-29: the
requirement it created — that both flows carry an identical entry — is what made the
Purchasing split unbuildable without dragging Orders' wording along. **Defining an action
once and referencing it is stronger than defining it twice and promising the copies match.**)*

> **`Send PO` IS GONE FROM PURCHASING (Loo, 2026-07-29).** Raising a purchase order is two
> acts now — **`Prepare PO`** produces a Draft PO that has left our company in no way, and
> **`Issue PO`** creates the formal Purchase Order. Neither is called `Send PO`, and the old
> done message `PO sent to {supplier}` described a step that no longer exists. The verb `Send`
> is retired with it and stays banned from reuse — §3.2 and §9.

**RETIRED, and it is not in the table above because it is no longer an action**
(C3, PR #479): the old bare `Confirm` fired when everything was already arranged
and the day had simply not come — the one drawer row no button could close. It is
now a FACT: `Delivering 27 Jul · 9-11 AM` in the drawer, the bare word
`Delivering` in the row, because the Delivery cell beside it already prints the
day.

**The code mirror is `packages/shared/order-action-words.ts`.** **This table is the
authority; the mirror is a SUBSET of it** — by its own rule it gains a string only
when a surface reads that string, so a blank there means "nothing renders it yet",
never "this action has no such word". A queue and a row therefore cannot spell one
action two ways, and a chat comparing the two must read a difference as mirror lag,
not as a second ruling.

**OPEN, recorded rather than resolved here (2026-07-29):** the `Collect` row's queue
tile is written `Collect RM {amount}` while string 1's own rule says a queue tile
carries no per-record value, because a queue holds many. The mirror renders the tile
as `Collect` and puts the amount on the row line. **Ownership of the tile word is
this file's; the ruling that put the amount in it was Jess's** — so it is flagged for
her, not overwritten by a chat.

**FACTS (the delivery column, badges):**

| Ships today | Verdict | Must become |
|---|---|---|
| `confirmed 27 Jul · 9–11 AM` | ✅ keep | — |
| `not confirmed · logistics said 27 Jul` | ✅ keep | — |
| `need booking` | **to-do word in a fact** | `{logistics} — confirm delivery date` |
| `Unscheduled` | banned (T1) | `{logistics} — confirm delivery date` |
| `No logistics` | ✅ keep | (states an absence, no to-do word; the Actions column carries `Assign logistics`) |

**A FACT slot takes the action WITHOUT its verb** (`NETS — confirm delivery date`),
because its neighbours in that cell are facts too.

**Adopted from the PORTAL_CORE vocabulary proposal:** the ban on `Chase`, on `At Risk` /
`Attention` / `Pending`, and the rule that a label names measurable work.
**Deliberately NOT adopted:** its ban on the WORD "customer" as a party (when no name is
stored, the role word is the honest answer), and its "Confirm Supplier Stock ETA" phrasing
(our shape puts the party first: `Call Ohana — confirm ready date`).

## The delivery queue words (re-ruled by Jess 2026-07-27 — this is the only version)

**The delivery lifecycle's queue words are spelled once, in §3.4** — one row each,
five strings each. This section names no label of its own: a second copy of a queue
word is exactly how a queue and a row came to disagree in the first place.

The one wording rule that is this section's own, and it survives:

> **The queue's label IS the row's top checklist item.** A queue name and the first
> thing the operator must do are the same sentence, or the queue is named wrong.

**Only the words are this file's.** Which queues exist, in what order they run, what
each one holds, when it goes late, and whether the list is closed are TRIGGERS, DUE
conditions and lifecycle — they live in `docs/ORDERS-WORKING-FLOW.md` §3, and nowhere
else (Law 0A).

> **Conflict recorded, not resolved (2026-07-29).** This section used to state "the
> delivery lifecycle is FOUR queues; the list is closed", while §3.4 carries five
> delivery rows — `Issue delivery order` among them, ruled an action by Jess on
> 2026-07-27 and shipped by C7. **The count is a business fact and this file no
> longer states one.** `docs/ORDERS-WORKING-FLOW.md` §3 is the only place it may be
> settled. Nothing here was invented to close the gap.

**Lateness is written as the count tail, numbers up front** — the one format in
§1.1 rule 3, not a delivery-only spelling.

## The warehouse count words (Loo, 2026-07-28)

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

## One business, one dictionary (Loo, 2026-07-28)

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

## UI type dictionary (locked 2026-07-27)

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
| Bulk action | verb + PLURAL object (`Issue 12 POs` · `Call 8 suppliers — confirm ready date`) |

**A checklist item is not this file's to admit or refuse** — whether one may exist at
all is the no-decorative-checkbox law, `docs/ACTION-FLOW-STANDARD.md` Law 2. This table
rules only how one is WORDED.

---

# §4 · Status Naming

| § | Section |
|---|---|
| 4.1 | The one status law |
| 4.2 | The status register — every status word set and its one home |
| 4.3 | FILTER / STATE words |
| 4.4 | A number is not a status until someone sets a target |

**This chapter CONSOLIDATES what this file already owns. It redesigns nothing.**
`docs/STATUS-STANDARD.md` is a separate, visual-only document (dials, marks,
button shapes) and is scheduled to be rebuilt after this one. **Two facts about it
are reported here and fixed nowhere:** it is not referenced by this file for any
word, and the button labels it still shows (`Chase`, `Chase (hot)`) are banned by
§9. Its rebuild is the place to settle that — not this PR.

## §4.1 The one status law

**A status says what the thing IS. An action says what a human DOES.** They may
never be mixed, and one may never be spelled with the other's words:

- a status is a **noun or a state**, never a verb phrase — `Issued`, not `Issue PO`;
- a status **never contains a to-do word** (`need`, `pending`, `required`, `TBD`,
  `at risk`) — that is the FACT/ACTION trap in §3.3, and it is what produced
  `need booking`;
- a status **may state an absence** — `No logistics`, `Supplier not assigned`,
  `Address not set`;
- **a status is never invented per screen.** It comes from one of the sets below.

## §4.2 The status register — every status word set and its one home

| Set | Where it is spelled |
|---|---|
| Purchase Order — the six Operation Status labels | §2.2 (canonical home) |
| Supplier Status — the external axis | §2.2 — a separate axis, never merged into the six |
| Purchasing facts (`Draft PO` · `Demand no longer required` · `Covered by {count} Draft POs` · `Purchasing on Hold` / `On hold until {date}` · `Supplier not assigned`) | §2.2 |
| Receiving result (`Received` · `Received with exception` · `Rejected`) | §2.3 |
| Exception lifecycle + the `Waiting …` states | §2.3 |
| Delivery facts (`confirmed …` · `not confirmed · logistics said …` · `No logistics`) | §3.4 |
| Delivery calendar facts (`Confirmed` · `Logistics' date` · `Promised this day, no date yet` · `No logistics picked`) | §2.5 |
| Customer-order states (`Placed` · `Proceed` · `Delivered` · `Owing` …) | §4.3 and §2.1 |
| Delivery window facts (`Half-day delivery · condominium` · `Full-day delivery`) | §2.6 |

**A set that is not in this register does not exist.** Adding one is a decision (§0.2).

## §4.3 FILTER / STATE words

**FILTER / STATE words** live in FILTERS only (C-vocab, Jess 2026-07-19) and are nouns,
not actions: `All · Placed · Proceed · Scheduled · Delivered · Owing`.

**Only a fact may be a filter** (§3.8). **`Pending` is banned even as a filter** —
pending on what? Rename it to the state it actually selects when C1 reaches it.

Filters may name a real STATE — `Placed`, `Proceed`, `Delivered`, `Owing` — but never
one of the words in §9.

## A number is not a status until someone sets a target (locked 2026-07-27)

A percentage, a count or a rate is a FACT. It becomes a status only when a human has set the
line it is being judged against. Calling 82% "at risk" invents a policy nobody ruled, and the
reader cannot tell an opinion from a measurement.

Two consequences, both already shipped: **a rate with too few records is not printed at
all** — `0 ÷ 0` shown as `0%` reads "this supplier never delivers on time" and shown as
`100%` reads "perfect", and both are lies a screen tells with a straight face (R5); and
**"nobody has set a number yet" is its own visible state**, never a reassuring green
(K1's `Set a number`). A quiet screen must mean *watched and fine*, never *nobody looked*.

> **⇢ NOT LANGUAGE · future owner: `docs/UI-KIT.md` §3.6** — the same rule stated as
> COLOUR: a number gets a tone only once a human has set the line. Tone comes from a
> CONDITION, which is already §3.6's law; this file keeps only the words.

---

# §5 · Button Standards

| § | Section |
|---|---|
| 5.1 | The four button rules |
| 5.2 | The WhatsApp button — the label says which door it opens |

## §5.1 The four button rules

1. **A button label is verb + object** (§1.1 rule 1). Never `OK`, never a bare
   `Submit`, never a noun on its own.
2. **A worklist button is string 3 of its action** — read it out of §3.4, never
   write a new one. Its verb comes from the seven in §3.2.
3. **A FORM button is not an action.** A button that merely stores what you just
   typed is **`Save`**; one that abandons it is **`Cancel`**. They never appear in a
   queue and they take no verb from §3.2. **The test is whose problem it moves:** a
   button that hands the record to somebody else is not a `Save` — that is why the
   warehouse count's is `Return count to Carres` (§3.6).
4. **A button whose behaviour is conditional takes the label of the door it will
   actually open**, resolved at render time from what is on file — never a third
   blended word covering both (§5.2).

**NOT RULED, and a chat may not invent it:** the wording of a DESTRUCTIVE button and
its confirmation (delete, cancel-an-order, write-off). `Cancel` is already taken as
"abandon this form" *and* as the canonical word for cancelling an order (§2.1), and
nobody has ruled how the two are told apart on one screen. Ask (§0.2); see §7.3.

### The WhatsApp button — the label says which door it opens (Loo, 2026-07-28)

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

**The CHANNEL is never the action** (§3.2): this button is HOW, and the action it serves is
`Call {party} — {measurable object}`.

---

# §6 · Labels

| § | Section |
|---|---|
| 6.1 | The four kinds of label, and the rule for each |
| 6.2 | Where the goods go — the PO destination words |
| 6.3 | Facet group headings |
| 6.4 | Column headers |
| 6.5 | Header rules (see UI-KIT for the shell) |

## §6.1 The four kinds of label, and the rule for each

| Kind | Rule |
|---|---|
| **Field label** | names the thing in the reader's own words, never in the database's. It is a NOUN PHRASE, never a sentence and never a to-do (`Where the goods go`, not `Ship-to`, not `Set destination`) |
| **Column header** | a NOUN, and it heads what is actually in the column. Plural when a cell can hold several (`Actions`) |
| **Group heading** | a NOUN and never an action (§6.3) |
| **Section title** | takes the module's own ruled word; a page under a module tab bar does not repeat the tab (§6.5) |

**A label states, it never instructs.** `Delivery instructions` is a field label;
`Fill in the delivery instructions` is an error (§7.1).

### Where the goods go — the PO destination words (locked by Loo, 2026-07-29)

The concept is already in the vocabulary table (`where the goods go`, §2.1). These are the
STRINGS.

| What | The word |
|---|---|
| The field label, on the PO form and the external document | **`Where the goods go`** |
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
may not leak onto a PO, onto the external document, or into an error a store reads.

> **⇢ NOT LANGUAGE · future owner: `docs/PURCHASING-WORKING-FLOW.md`** — **a PO may
> stay a draft while its external destination has no address, and it may not be
> issued, exported or sent until the address is complete.** That refusal is a
> business rule, enforced in the database; only the string above is this file's.
> `Carres Klang` never shows it: its address is derived from the own warehouse record.

### Facet group headings (locked 2026-07-28, after P2-Claims found they had no home)

The facet rail's ORDER is `docs/UI-KIT.md` §8.4; the WORDS are here. A module picks the
headings it needs from this list and adds none.

| Heading | What sits under it |
|---|---|
| `Queues` | the module's open actions — each row's name IS its action, from §3.4 |
| `Supplier` · `Logistics` · `Customer` | the outside party |
| `Problem` | what went wrong (claim type, delay reason, issue type) |
| `Stock` · `Region` · `Category` · `Store` | facts about the record |
| `Due` | when it turns late |

**A heading is a NOUN and never an action** — `Queues` holds actions, it is not one.
A group with one row still gets its heading: a lone unlabelled row reads as a stray.

**Only a fact may be a filter** (§3.8), so every heading except
`Queues` names a fact. That is also why there is no `Status` heading — status is the pill on
the row, and a facet filtering by it would compete with the queue rows for the same job.

**Need one that is not here?** It is a word, so it is a decision — ask, do not invent. This
table exists because three headings shipped on a real screen with nothing to check them
against.

## §6.4 Column headers

**The actions column IS headed, and its word is `Actions`** — plural, because an
order can have several. `Actions` is that column's header and nothing else's: the
drawer panel listing who to ring is `Calls` (§2.1), because one word may not head
two blocks (Jess 2026-07-28, PR #487).

**The three-dot column** carries three independent facts — goods · delivery · money —
each labelled by its own small icon from the portal icon set, never emoji
(`docs/UI-KIT.md`). **The dots need no header of their own.**

> **CONFLICT, recorded and NOT resolved here (2026-07-29).** Whether the column that
> carries the dots keeps the header word `Status` is stated in two Foundation files
> and stated oppositely: `docs/ACTION-FLOW-STANDARD.md` Law 6 says the column keeps
> `Status`, which is correct for the stage pill it also heads; the text that stood
> here said the column carries no header word and that `Status` is wrong — written
> when the dots were to OWN the column, before C10 shipped them BESIDE the pill.
> **The word is this file's to own and the ruling is Law 6's to release**, so
> nothing was overwritten. A PLAN chat settles it; until then Law 6 is what ships.

## Header rules (see UI-KIT for the shell)

**The tab is the title.** A page sitting under a module tab bar does not spell that
tab's word a second time as a breadcrumb or a big title — one word, one place on the
screen.

**Everything else about that header is layout and is already ruled** — which slots the
page drops, and where the freshness stamp and the refresh icon sit, are
`docs/UI-KIT.md` §8.3 (Module-tab law).

---

# §7 · Messages

| § | Section |
|---|---|
| 7.1 | Error pattern |
| 7.2 | Tooltip pattern |
| 7.3 | Confirmation pattern |

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

**A refusal is an error and takes the same three parts** — the ruled example is
`Fill in the building type first — a condominium can only take a half-day delivery.`
(§2.6): what broke, how to fix it, and why, in one sentence.

**An error never prints a code, a column name, a table name or a status key.** If
the reader cannot act on the word, it belongs in the log, not on the screen.

## Tooltip pattern

The visible label says **WHAT**. The tooltip says **WHY**. They must not repeat.

    Label "Issue PO"    · tooltip "Creates the PO number and the document Ohana receives."
    Label "Late 2d"     · tooltip "Order-by was 20 Jul; today is 22 Jul."
    Label "No deadline" · tooltip "This order's Master row has no G column."

If the tooltip would just re-state the label, delete the tooltip.

**A queue tile's tooltip is part of its design** — where one exists it is locked in
§3.4 beside the action's answers, and where the label is already the whole
instruction the cell reads `—`, meaning *ruled to have none*.

## §7.3 Confirmation pattern

**A confirmation says what was RECORDED, in the past tense, naming the thing.**

- **After an action, the confirmation is string 4 of that action** — read it out of
  §3.4, never write a new one. `Ready date recorded` · `PO issued to {supplier}` ·
  `Delivery confirmed {date} · {slot}` · `Count returned to Carres`.
- **It names what changed**, not that a click happened: never `Saved`, never
  `Success`, never `Done!` — those tell the reader nothing they can check.
- **A `—` in the Done message column means the action has none, and why** — the row
  leaves by itself and the next action says what happened (§3.4). Absence is a
  designed answer, so nobody adds one back.
- **A confirmation is not a status.** It is said once, after the fact; the status is
  what the record now reads (§4).

**NOT RULED — ask, do not invent:** the wording of a confirmation that asks *before*
a destructive act (delete, cancel an order, write off money). Nobody has ruled the
question, the two answer words, or how they avoid colliding with `Cancel` in its two
existing meanings (§5.1). A chat that meets one stops and asks. This is deliberately
an empty square, not an oversight — §3.4's own law: one missing = not designed.

---

# §8 · Empty States

| § | Section |
|---|---|
| 8.1 | Empty-state pattern |

## Empty-state pattern

Every empty state answers three things: (a) **why** it is empty · (b) **when**
it will change · (c) **what** the reader should do meanwhile.

Examples:

    ✔ "No purchase orders need preparation. Check back after 2 PM when Master syncs."
    ✔ "0 calls to make · everything on track. Nothing to do here."
    ✔ "No goods arriving today. Ohana's next delivery is Thu 24 Jul."

Anti-patterns:

    ✘ "No data."
    ✘ "Empty."
    ✘ "Nothing to display."

**A queue's empty state is string 5 of its action** (§3.4) — read it there, never
write a second one for the same queue.

**A quiet screen must mean *watched and fine*, never *nobody looked*** (§4.4). Where
nothing has been configured yet, the honest empty state says so — `Set a number` —
rather than showing a reassuring zero.

---

# §9 · Forbidden Words

| § | Section |
|---|---|
| 9.0 | The only ban list in the portal |
| 9.1 | **The table** |
| 9.2 | The `Waiting` rule, stated once |

## §9.0 The only ban list in the portal

**Every banned word in Carres Portal has exactly one row in the table below.** No other
section of this file, no module document, no card and no chat keeps a second list.
Sections that used to carry a `Do NOT use` column now carry the canonical word only,
and point here.

**Three rules govern the table:**

1. **A word is banned where it names the banned CONCEPT, not wherever it is spelled.**
   `Recovery` is the worked example: C8 grepped the live bundle, found it nine times,
   and correctly changed none — eight were React internals and the ninth was the login
   page's forgot-password dialog, a different word that happens to be spelt the same.
   **A chat sweeping this table by string match will rename the login page and call it
   compliance.**
2. **Code identifiers are not visible words.** DB tables and columns, routes, query
   keys, CSS classes, component and function names keep their own names; this table
   governs what a human reads on screen. *(Already ruled in the Stock word law and the
   Logistics word law, §2.7.)*
3. **A word banned for one subject is not automatically banned for another.** A
   Purchase Order and a customer order are different subjects — which is why `Draft`
   and `Issued` are ruled Purchasing words while `Draft` stays banned on a customer
   order (§2.2).

**What is NOT in this table:** the ✘ example SENTENCES in §1.3, §1.4, §7.1 and §8 —
those teach shape, not vocabulary, and are owned by their pattern.

## §9.1 The table

| Word | Why banned | Approved replacement | Exception |
|---|---|---|---|
| `access restrictions` | jargon; says nothing about the truck | `Half-day delivery · condominium` · `Full-day delivery` | — |
| `Abandon` | soft word for a hard act | `Cancel` | — |
| `Actions` **as the Calls panel title** | one word may not head two blocks | `Calls` | `Actions` IS the actions column header (§6.4) |
| `Alert` | names a system noise, not a call | `Remind` | — |
| `All clear` | reassures without saying why | the empty-state pattern (§8) | — |
| `Allocated` | reads as "already ordered" | `Covered by {count} Draft POs` | — |
| `Approved` (customer's ETA) | our word for it is the stage | `Proceed` | — |
| `At Risk` | a mood, not work; also invents a policy nobody set | the action that closes it, with its Due | — |
| `Attention` | names a gap, not the work | the action that closes it | — |
| `Back-order` | trade jargon; hides who owes what | `balance` (short delivery) · `Second trip` (delivery) | — |
| `Batch day` | jargon | `PO days` | — |
| `Bedroom set` | not the group we deliver | `Bed set` | — |
| `Blackout` | jargon | `not running on` | — |
| `Board` (a view) | not a word the team says | `Queues · Calendar` | — |
| `Book in` | warehouse jargon, and a verb for a document | `Check in` | — |
| `Booked` (a date) | does not say the customer agreed | `Confirmed` | — |
| `Booking window` | jargon | `working days notice` | — |
| `Bundle` (bed) | means a priced bundle elsewhere in the portal | `Bed set` | — |
| `Call customer (book delivery)` | old T2 spelling | `Call {customer} — book delivery date` | — |
| `Call customer (stock delay)` | the customer is not called first | `Call {logistics} — arrange new delivery date` | — |
| `Capacity` | jargon; not a number an operator can act on | `deliveries a day` | — |
| `Carrier` | not the word staff say | `Logistics` | — |
| `Carrier config` | jargon | `delivery rules` | — |
| `Carrier's date` | wrong noun, and possessive of a banned one | `Logistics' date` | — |
| `Chase` | names a MOOD, not an outcome (Jess 2026-07-27) | `Call {party} — {measurable object}` | — |
| `Chase Now` | same, as a panel title | `Calls` | — |
| `Check-in record` | invents a name for a document that has one | `GRN` | — |
| `Collect the item` | `Collect` means MONEY in this portal | `Pick up the item from {customer}` | — |
| `Confirmed` (customer's ETA) | collides with the delivery meaning | `Proceed` | `Confirmed` IS the calendar word for *the customer said yes to this date* (§2.5) |
| `Consignment` | trade jargon | say what goes and what follows (§2.4) | — |
| `Contact` / `Contact supplier` | a sixth verb for what `Call` already covers | `Call {supplier} — confirm what happens next` | — |
| `Create` (a PO) | says nothing about formality | `Prepare PO` then `Issue PO` | — |
| `Cut-off` | jargon | `working days notice` | — |
| `Cycle` | jargon | `PO days` | — |
| `Delivery partner` | not the word staff say | `Logistics` | — |
| `Delivery window policy` | policy-speak | the fixed phrasing (§2.6) | — |
| `Destination` | jargon | `where the goods go` | — |
| `Details` (leave a page) | does not say where it takes you | `Open order` | — |
| `Draft` (a CUSTOMER order) | reads as "not real yet" | `Placed` | `Draft` is a ruled Purchase Order status, and `Draft PO` a ruled noun (§2.2) |
| `Draft Error` | error-speak for a business fact | `Demand no longer required` | — |
| `Drop point` | jargon | `where the goods go` | — |
| `e-POD` | abbreviation a new hire must google | `delivery photo` | — |
| `Edit` (leave a page) | does not say where it takes you | `Open order` | — |
| `Empty` (a day / a list) | says nothing | `No deliveries booked this day.` · the empty-state pattern | — |
| `Escalate` / `Escalation` | names a mood | `Call {supplier} — confirm ready date` · `Delay planning` | — |
| `Exception` (a Draft PO fact) | failure-speak for a normal business fact | `Demand no longer required` | `Receiving exception created` · `Exception closed` are ruled receiving words (§2.3) |
| `Exception handling` | jargon | `Delay planning` | — |
| `Expedite` | jargon (rule 9) | `Call {supplier} — confirm ready date` | — |
| `Factory calendar` | jargon | `Supplier work week` | — |
| `Follow up` | vague; no measurable object | `Call {supplier} — confirm ready date` | — |
| `Free` (a day) | reads as "no charge" | `No deliveries booked this day.` | — |
| `Go to order` | wordy | `Open order` | — |
| `Goods receipt` (the act) | the act has its own word | `Check in` | — |
| `Goods receipt note` | the document has a shorter name the team says | `GRN` | — |
| `Green-lit` | slang | `Proceed` | — |
| `GRN` **as a verb / as the act** | it is the piece of paper, not the doing (§3.1) | `Check in` | `GRN` IS correct as the DOCUMENT name |
| `Hidden` | describes our UI, not the business | `Purchasing on Hold` | — |
| `In Progress` / `In progress` | a mood; says nothing about the next step | the open action · `Covered by {count} Draft POs` | `In Production` is a ruled PO status (§2.2) |
| `Inventory` | not the word staff say | `Stock` | internal keys and routes keep their names |
| `Invalid Draft` | error-speak for a business fact | `Demand no longer required` | — |
| `Invalid SKU` | blames the data, names no fix | `Supplier not assigned` | — |
| `Job` | not our word for a customer order | `Order` | — |
| `Kill` | violent slang | `Cancel` | — |
| `Lead time` | one phrase for three different numbers | `production working days` (factory) · `working days notice` (logistics) · `Earliest date a store may sell` (store) | — |
| `Ledger` | accounting jargon on a stock screen | `In & out` | — |
| `Lift booking required` | to-do word in a fact | the fixed phrasing (§2.6) | — |
| `List` (a view) | says nothing | `Queues · Calendar` | — |
| `Locked` (a date) | does not say the customer agreed | `Confirmed` | — |
| `Logistic` (no s) | wrong English noun (Jess 2026-07-27) | `Logistics` | — |
| `Manufacturing lead` | jargon | `production working days` | — |
| `Max load` | jargon | `deliveries a day` | — |
| `Minimum lead` | jargon | `Earliest date a store may sell` | — |
| `Movement log` | menu jargon | `In & out` | — |
| `Movements` | menu jargon | `In & out` | internal keys and routes keep their names |
| `MRP` | abbreviation a new hire must google (rule 9) | say the work: `plan` · `order-by date` | — |
| `MYR` | not how the price is said | `RM ` | — |
| `need booking` / anything with `needs` | a to-do word hiding inside a fact | `{logistics} — confirm delivery date` | — |
| `New` (a customer order) | says nothing about the state | `Placed` | — |
| `Next 7 days` | not one of the three views | `Today · Tomorrow · This week` | — |
| `No carrier` | banned noun | `No logistics picked` | — |
| `No results` | teaches nothing | the empty-state pattern (§8) · `Nothing to do here.` | — |
| `Not booked` | to-do word in a fact | `Promised this day, no date yet` | — |
| `Notify` | system-speak | `Remind` | — |
| `Nothing` (a day) | says nothing | `No deliveries booked this day.` | — |
| `Nudge` | slang | `Remind` | — |
| `OK` (a button) | not verb + object (rule 1) | the action's Button string (§3.4) | — |
| `Open` (a CUSTOMER order) | reads as "not yet finished" | `Placed` | `Open WhatsApp` · `Open WhatsApp group` · `Open order` are ruled buttons. **`Open` is never a PO status either** — that word is `Issued` (§2.2) |
| `Open items` | says nothing about lateness | `{n} to do · {n} late` | — |
| `Open PO` / `Pending PO` / `Provisional PO` / `Unsent PO` / `Pre-PO` / `PO Draft` / `Purchase Draft` / `Draft Purchase` | seven spellings of one object | `Draft PO` | — |
| `Orphan` / `Orphan Draft` | jargon that blames the record | `Supplier not assigned` · `Demand no longer required` | — |
| `Out of service` | jargon | `not running on` | — |
| `Outstanding` (a count of work) | says nothing about lateness | `{n} to do · {n} late` | the money figure's own label is not ruled here |
| `Outstanding qty` | jargon | `balance` | — |
| `Padding` | jargon | `order-by buffer` | — |
| `Partial delivery` | trade jargon; hides what follows | `Second trip` · say what goes and what follows | — |
| `Partner` (the delivery company) | not the word staff say | `Logistics` | — |
| `Partner profile` | jargon | `delivery rules` | — |
| `Paused` | describes our UI, not the business | `Purchasing on Hold` | — |
| `Pencilled in` | idiom a new hire will miss | `Logistics' date` | — |
| `Pending` | pending on WHAT? names a gap, not work | the action that closes it, or the state actually being selected | — |
| `Ping` | slang | `Remind` | — |
| `Place` (raise a PO) | one word for two acts | `Prepare PO` then `Issue PO` | `Placed` IS the ruled customer-order state (§2.1) |
| `Planner` (a view) | not a word the team says | `Queues · Calendar` | — |
| `POD` / `Proof of Delivery` | abbreviation a new hire must google | `delivery photo` | — |
| `Processing` | a mood; says nothing about the next step | the open action | — |
| `Provisional` | jargon | `Logistics' date` | — |
| `Purchase order` (spelled out, as a label) | the team says the short form | `PO` | — |
| `P/O` | a third spelling | `PO` | — |
| `Push` | slang, and used for two different acts | `Prepare PO` / `Issue PO` · `Call {supplier} — confirm ready date` | — |
| `Raise` | says nothing about formality | `Prepare PO` then `Issue PO` | — |
| `Raise-by` | jargon | `order-by date` | — |
| `Recall` | means a product recall elsewhere | `Pick up the item from {customer}` | — |
| `Recovery` / `Recovery plan` (the DELAY sense) | staff say "this order going to delay"; recovery names a mood | `Delay planning` | account recovery on the login page is a different word spelt the same, and it stays (§9.0 rule 1) |
| `Redeployment` | jargon | `stock transfer` | — |
| `Receive` (as a VERB) | the act has its own word (§3.1) | `Check in` | `Received` · `Received with exception` · `Rejected` are the ruled receiving RESULT words (§2.3) |
| `Receiving note` | invents a name for a document that has one | `GRN` | — |
| `Relocation` | jargon | `stock transfer` | — |
| `Reorder date` | jargon | `order-by date` | — |
| `requisition` | jargon a new hire must google (rule 9) | `Draft PO` · `Prepare PO` | — |
| `Reschedule` | says nothing about who is called | `Call {logistics} — arrange new delivery date` | — |
| `Reserved` (on an ORDER LINE) | read as `Received`, and the two mean opposite things | `Ready` | `Reserved` stays correct on the Stock screens, where it describes a UNIT |
| `Retrieve` | jargon | `Pick up the item from {customer}` | — |
| `Review day` | jargon | `PO days` | — |
| `Safety stock days` | jargon | `order-by buffer` | — |
| `Sales order` | the team says the short form | `Order` (or `SO-1207`) | — |
| `Save count` | it does not merely store — it hands the count over (§3.6) | `Return count to Carres` | `Save` IS the right word for a button that only stores what you typed (§5.1) |
| `Schedule` (a view) | not one of the two views | `Queues · Calendar` | — |
| `Schedule delivery` | says nothing about who is called | `Call {customer} — book delivery date` | — |
| `Scheduled` (a date) | does not say the customer agreed | `Confirmed` | `Scheduled` IS a ruled customer-order filter word (§4.3) |
| `Sell-from date` | jargon | `Earliest date a store may sell` | — |
| `Send` (as an ACTION VERB) | retired 2026-07-29 with the act it named; **banned from reuse** so no module can claim it | `Prepare PO` then `Issue PO` · `Return` for handing a record back | — |
| `Send back` | `Send` is retired, and this names no party | `Return count to {party}` | — |
| `Send PO` | the act is two acts (Loo, 2026-07-29) | `Prepare PO` then `Issue PO` | — |
| `Shift pattern` | jargon | `Supplier work week` | — |
| `Ship-to` | jargon | `where the goods go` | — |
| `Shortfall` | jargon | `balance` | — |
| `Site constraints` | jargon | the fixed phrasing (§2.6) | — |
| `SLA` | abbreviation a new hire must google | `delivery rules` | — |
| `Slack` | jargon, and a chat app | `order-by buffer` | — |
| `Slots` | jargon | `deliveries a day` | — |
| `Snoozed` | app slang | `Purchasing on Hold` | — |
| `Split shipment` | trade jargon | `Second trip` | — |
| `Submit` (alone) | not verb + object (rule 1) | the action's Button string (§3.4) | — |
| `Supplier error` | blames the supplier for our missing config | `Supplier not assigned` | — |
| `Taken` | reads as "already ordered" | `Covered by {count} Draft POs` | — |
| `TBD` | a to-do word in a fact | the action that closes it · `No logistics picked` | — |
| `Tentative` | jargon | `Logistics' date` | — |
| `Ticket` | support-desk word for a customer order | `Order` | — |
| `Total` (work on the board) | says nothing about lateness | `{n} to do · {n} late` | — |
| `Trigger date` | jargon | `order-by date` | — |
| `Turnaround` | jargon | `production working days` | — |
| `Unassigned` | names a gap, not the work | `No logistics picked` | — |
| `Unavailable` | jargon | `not running on` | — |
| `Unbooked` | to-do word in a fact | `Promised this day, no date yet` | — |
| `Unknown supplier` | blames the data | `Supplier not assigned` | — |
| `Unscheduled` | to-do word in a fact (T1) | `{logistics} — confirm delivery date` · `Promised this day, no date yet` | — |
| `Upcoming` | not one of the three views | `Today · Tomorrow · This week` | — |
| `View` (leave a page) | does not say where it takes you | `Open order` | — |
| `Void` | accounting jargon | `Cancel` | — |
| `Waiting` (alone) | waiting for WHAT? | `Waiting {the exact thing}` | `Waiting supplier reply` · `Waiting goods arrival` · `Waiting Carres check` are ruled STATES (§2.3) |
| `Warehouse` (as a MENU word) | the pool has one name | `Stock` | the word is correct where it names a physical place (`Return count to {warehouse}`) |
| `Week view` | not one of the three views | `Today · Tomorrow · This week` | — |
| `Work-week` | jargon | `Supplier work week` | — |
| `working days` (as the label for a FACTORY's open days) | collides with the deadline unit | `Supplier work week` | `working days` IS the unit every deadline is counted in (§2.8) |
| `$` | not how the price is said | `RM ` | — |

## §9.2 The `Waiting` rule, stated once

**`Waiting` alone is banned; `Waiting <the exact thing>` is allowed as a STATE.**
`Waiting` on its own tells the reader nothing — waiting for what? But
`Waiting supplier reply` and `Waiting goods arrival` name precisely what is being waited
for, and they are states, not actions: **nobody acts while one is true.** Never use such a
phrase as an action label, and never shorten one to the bare word. (Ruled 2026-07-27 after
S4 found this file banning a word its own receiving vocabulary approved.)

---

## Review checklist (paste into every UI PR)

Before merging a UI change:

- [ ] Every button label starts with a verb (§5.1).
- [ ] Every list row ends with a ≤10-word action-line (§1.3).
- [ ] Every empty state teaches what to do next (§8).
- [ ] Every error gives the fix (§7.1).
- [ ] No new synonyms — checked against §2.
- [ ] No banned word — checked against **§9, the only ban list**.
- [ ] Zero jargon (rule 9).
- [ ] Tooltips do not repeat the label (§7.2).
- [ ] Dates read `19 Jul 26, Sun`; money reads `RM 1,250.00` with two decimals (§1.5).
- [ ] Every action's five strings come from §3.4 — none was written in the card.
- [ ] Nothing new was added to a ⇢ block (§0.3).
