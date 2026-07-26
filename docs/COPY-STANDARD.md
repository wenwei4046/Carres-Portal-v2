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
| 8 | Same word app-wide | Orders `Chase` · Purchase `Follow up` | Both say `Chase` |
| 9 | Zero jargon | requisition · expedite · MRP · GRN | order · chase · plan · check in |
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
    ✔ Chase Ohana — PO-88 late 2 days.         (6 words)
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
    ✔ "0 chases · everything on track. Nothing to do here."
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

## Action naming law (delivery T2, locked with Jess 2026-07-26)

Every visible ACTION label (ladder pill, drawer button, follow-up preset,
queue verb) is written as:

    [Verb] + [Object] + (reason, only when the same verb+object has two causes)

- The reason in brackets exists so a new staff knows WHY they are calling —
  `Call customer (book delivery)` vs `Call customer (stock delay)` are two
  different conversations that must never share one label.
- **No abbreviations, ever.** ERP shorthand a new hire must google is banned.
  **"POD" is banned** — the word is **delivery photo** everywhere (button,
  toast, hint, aria-label). "DO" and "PO" survive because the team already
  speaks them daily (vocabulary table below).
- Reserved delivery action labels (use EXACTLY these spellings):
  - `Call customer (book delivery)` — call to fix the delivery date + slot.
  - `Call customer (stock delay)` — stock ETA overshoots the promised date
    (delay radar, T3). Reserved now so no chat invents a synonym.
  - `Upload delivery photo` — attach the photo proving delivery (T6).

## Vocabulary — the canonical words

Use these words EVERYWHERE. Never a synonym in a different page. When in
doubt, grep the codebase and match what already ships.

| Concept | Canonical word | Do NOT use |
|---------|---------------|------------|
| Raise a purchase order to a factory | **Send** (order / PO) | Place · Raise · Push · Submit · Create |
| Pre-due polite follow-up on an open PO | **Remind** | Notify · Ping · Alert · Nudge |
| Post-due firm follow-up on an open PO | **Chase** | Expedite · Follow up · Push · Escalate |
| Log goods arrival | **Check in** | Receive (as a verb) · Book in · GRN · Goods receipt |
| Customer confirmed ETA — ready for PO | **Proceed** | Confirmed · Approved · Green-lit |
| Customer ordered but no ETA yet | **Placed** | New · Draft · Pending · Open |
| Cancel an order | **Cancel** | Void · Abandon · Kill |
| Purchase order (the document) | **PO** | Purchase order · P/O · Order (ambiguous with customer order) |
| Customer's own order | **Order** (or `SO-1207`) | Sales order · Job · Ticket |
| The Purchase panel's three stages | **Send · Chase · Receive** | Place · Follow up · Book in |
| Photo proving a delivery happened | **delivery photo** | POD · Proof of Delivery · e-POD |
| Call to fix delivery date + slot | **Call customer (book delivery)** | Schedule delivery · Book delivery · Confirm delivery date |

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
