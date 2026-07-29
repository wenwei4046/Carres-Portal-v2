# STATUS STANDARD — what a status MEANS

> The third Foundation law. **It owns MEANING.** What a status is, which business
> condition produces it, which families exist, and how one maps to the next.
> Frozen 2026-07-29 (Loo).
>
> **Three files, three jobs, no overlap:**
> [`COPY-STANDARD.md`](COPY-STANDARD.md) owns the **words** ·
> [`UI-KIT.md`](UI-KIT.md) owns the **presentation** ·
> **this file owns the meaning.**
>
> If any older chat, memory or doc contradicts this file on a status's MEANING,
> this file wins. On a word, COPY-STANDARD wins. On a pixel, UI-KIT wins.

## Chapter map

| § | Chapter |
|---|---|
| **§0** | Purpose · ownership · the chain · the families |
| **§1** | Money and goods — the two derived families |
| **§2** | Progress marks — the five step states |
| **§3** | The reminder — pre-due and post-due |
| **§4** | Tab rail states |
| **§5** | Recorded inconsistencies — pointers for the cleanup phase |

---

# §0 · Purpose

| § | Section |
|---|---|
| 0.1 | What this file owns — and what it never owns |
| 0.2 | The ownership chain |
| 0.3 | What a status IS |
| 0.4 | The status families — the register |
| 0.5 | Where the old sections went |

## §0.1 What this file owns — and what it never owns

**Owns:**

- what a status **means**
- the **business condition** that produces it
- the valid status **families**
- the **semantic mapping** from condition → status

**Never owns:** wording · colours · icons · pixels · CSS · components.

**The test, in one line:** if a sentence can be answered with a hex, a size, a class
name or a string in quotes, it is not this file's.

**This file names no visible word.** Where a status has a ruled word, the word is
cited from COPY-STANDARD, never re-spelled here. Where it has none, this file says
so — an unruled word is a decision for Jess or Loo, never an invention (COPY-STANDARD
§0.2).

## §0.2 The ownership chain

**Every semantic status is expressed in this order, and the order never varies:**

```
Business condition        what is true about the record
        ↓
Semantic status           what we call that situation — THIS FILE
        ↓
COPY-STANDARD wording     the word the reader sees
        ↓
UI-KIT presentation       the pill, the mark, the tone
```

**This is the permanent ownership chain** (Loo, 2026-07-29). Read it downward and
each step is produced by the one above it. Three consequences, and they are what the
chain is for:

1. **A status may never be born at the wording step.** A word invented on a screen
   with no condition behind it is not a status — it is a label pretending to be one.
2. **A status may never be born at the presentation step.** A colour is not a state.
   If a tone exists that no condition produces, the tone is wrong, not the data.
3. **A missing link is a stop, not a gap to fill.** A condition with no ruled word
   does not get one invented; it gets asked. Several in §1 and §2 are in exactly
   that position today, and they are marked, not filled.

## §0.3 What a status IS

**A status says what the record IS right now.** It is not what a human should do —
that is an ACTION, and it belongs to `docs/ACTION-FLOW-STANDARD.md`.

Four rules, all semantic:

1. **A status is DERIVED, never typed.** It is computed from stored data. A status a
   human sets by hand is a field, not a status.
2. **A status belongs to exactly ONE family** (§0.4). A record carries one status per
   family and never two from the same one.
3. **A status may state an absence** — *no logistics picked*, *no supplier assigned*.
   An absence is a fact and is a legitimate status.
4. **A status is never a to-do.** If the honest answer to "what is this?" is "somebody
   still has to…", the record has an open ACTION and the status is whatever is true
   while that action is open.

**A status that no condition can produce is not shipped.** It is recorded here as
NOT PRODUCIBLE with the signal it waits for, and nothing renders it. A state nobody
can reach reads on screen as a state nobody has reached — the two are indistinguishable
to the reader, and one of them is a lie.

## §0.4 The status families — the register

**A family is one question about the record.** These are the families that exist. A
module does not invent a family; adding one is a decision.

| Family | The question it answers | Where the meaning is | Where the words are |
|---|---|---|---|
| **Money** | how much of this order is paid? | §1.1 | COPY-STANDARD §4.3 (`Owing`); the rest unruled — §1.1 |
| **Goods** | are this order's goods secured? | §1.2 | COPY-STANDARD §2.1 (`Ready`); the rest unruled — §1.2 |
| **Step progress** | how far is one step of a task? | §2 | unruled — §2 |
| **Purchase order** | what is this PO? | the six labels are ruled words, and their meanings sit with them | **COPY-STANDARD §2.2** — canonical |
| **Supplier** | what does the factory / logistics partner report? | a SEPARATE axis, never merged into the PO family | COPY-STANDARD §2.2 |
| **Receiving result** | how did this delivery arrive? | `Received` · `Received with exception` · `Rejected` | COPY-STANDARD §2.3 |
| **Exception lifecycle** | where has this problem got to? | the `Waiting …` states are states, not actions — nobody acts while one is true | COPY-STANDARD §2.3 |
| **Customer order** | where is this order in its life? | `Placed` · `Proceed` · `Delivered` · `Owing` | COPY-STANDARD §4.3 |
| **Delivery** | is the delivery day agreed? | `Confirmed` · logistics' date · promised-but-unbooked · no logistics picked | COPY-STANDARD §2.5 · §3.4 |
| **Delivery window** | how long does the truck have? | full-day / half-day, from the building type | COPY-STANDARD §2.6 |

**Four of these families are fully ruled and this file adds nothing to them** — the
PO, supplier, receiving and customer-order families were settled word-first in
COPY-STANDARD, and their meaning travels with their word. **The three this file
carries alone are Money, Goods and Step progress**: they exist on screen, they are
derived from real conditions, and nobody has ever written down what they mean.

## §0.5 Where the old sections went

This file was a visual specification until 2026-07-29 — donut sizes, mark colours,
button looks, rail hexes. **All of it was UI-KIT's, and it is gone rather than
migrated: presentation rules for components that no longer exist are not preserved**
(Loo, 2026-07-29). The section numbers are kept so existing citations still land on
the same subject.

| Old section | What survived | What went |
|---|---|---|
| §1 Dials | the money and goods MEANINGS → §1 | the 30px donut, the track, the fill fraction, the tone classes → UI-KIT |
| §2 Checklist marks | the five step STATES → §2 | the 20px mark, its shapes and colours → UI-KIT. **`CheckMark` has no implementation anywhere and its spec is deleted, not moved** |
| §3 The chase pair | the reminder MEANING → §3 | the three-button table, the flame sentence, the glyph rule → UI-KIT. **`Chase` is a banned word and `.btn-reminder` has no call site: the pair does not exist** |
| §4 Tab rail states | what a rail tab must SIGNAL → §4 | `#DBEAFE` · `#1E40AF` · the hover fraction → UI-KIT |

---

# §1 · Money and goods — the two derived families

**These two are computed from the order, every time it is read.** Neither is stored,
and neither may be.

## §1.1 Money — how much of this order is paid

**The condition is one number**: what the order still owes. **How that number is
computed is not this file's** — it is one shared rule, owned by
`docs/ORDERS-WORKING-FLOW.md` §3, and every surface asks it rather than adding up its
own. This file says only what the answer MEANS.

| Business condition | Semantic status | Word (COPY-STANDARD) | Presentation |
|---|---|---|---|
| nothing collected | **nothing paid** | **not ruled — ask** | UI-KIT |
| part collected, nothing overdue | **part paid** | **not ruled — ask** | UI-KIT |
| still owes, and the collect-by date has passed | **overdue** | **not ruled — ask.** `Overdue goods arrival` is a different family's ruled string and does not lend its word | UI-KIT |
| nothing left to owe | **settled** | **not ruled — ask** | UI-KIT |
| the customer has been invoiced | **invoiced** | — | **NOT PRODUCIBLE.** No invoice-sent signal is stored. It waits for one; until then nothing renders it |

**`Owing` is the one ruled word in this family** (COPY-STANDARD §4.3) and it is the
FILTER word — it selects orders that still owe. It is not a fifth state and must not
be stretched over one.

**A money status never softens a money figure.** The figure is exact to two decimals
(COPY-STANDARD §1.5); the status describes it and never rounds it.

## §1.2 Goods — are this order's goods secured

**The condition is a proportion**: how many of the order's goods lines are secured for
that order.

| Business condition | Semantic status | Word (COPY-STANDARD) | Presentation |
|---|---|---|---|
| none secured | **none secured** | **not ruled — ask** | UI-KIT |
| some secured | **part secured** | **not ruled — ask.** `Partial delivery` is banned and is a different concept | UI-KIT |
| not all secured, and the supplier's date has passed | **late** | **not ruled — ask.** The word must not be `Delayed` by default: `Delay planning` is a ruled ACTION and one word may not be both | UI-KIT |
| all secured | **ready** | **`Ready`** — ruled, on an ORDER LINE (COPY-STANDARD §2.1) | UI-KIT |

**`Ready` on a line, `Reserved` on a unit** — COPY-STANDARD §2.1 rules the split, and
it is semantic, not stylistic: on a line `Reserved` is read as `Received`, and the two
mean opposite things.

**The goods family answers a different question from the Delivery family.** Goods asks
*do we have the things*; Delivery asks *is the day agreed*. An order can be fully ready
with no delivery date, and can have a confirmed date with nothing in stock. Never fold
them into one status.

## §1.3 What the code stores today, and why it is recorded here

`PieDial`'s state type carries four TONES and no business state
(`OrderDetailDrawer.tsx`). **The mapping in §1.1 and §1.2 is therefore enforced
nowhere** — it lives in this document and in whatever each call site worked out.
Recorded, not fixed: closing it is a BUILD card, and this file may not edit code.

---

# §2 · Progress marks — the five step states

**One step of a task is in exactly one of five states.** This family describes a STEP,
never an order and never an action.

| Business condition | Semantic status | Word (COPY-STANDARD) | Presentation |
|---|---|---|---|
| the step's outcome is recorded | **complete** | **not ruled — ask** | UI-KIT |
| the step is with somebody outside, and nobody here can act | **waiting on a named party** | the `Waiting {the exact thing}` family is ruled (COPY-STANDARD §2.3 · §9.2). **The bare word `Waiting` is banned** | UI-KIT |
| something must be cleared before the step can run | **blocked** | **not ruled — ask** | UI-KIT |
| the step has not started and nothing prevents it | **not started** | **not ruled — ask.** The old name was `pending`, which is a **banned word** (COPY-STANDARD §9) | UI-KIT |
| the step does not apply to this record | **not applicable** | **not ruled — ask** | UI-KIT |

**Two of these five have historically been named with banned words** — `pending` and
a bare `waiting`. This file names the CONDITION so the rename has something to be
correct against; the words themselves are Jess's or Loo's to rule.

**A mark is DERIVED or it does not exist.** A tick that only records *"I say I did
it"* is banned — that is the no-decorative-checkbox law, and it belongs to
`docs/ACTION-FLOW-STANDARD.md` Law 2, not here. It is cited because it is the reason
this family has five states and not six: there is no *"marked done by a human"* state.

**`complete` is not the same as an action closing.** An action leaves when the SYSTEM
measures its completion (ACTION-FLOW Law 2). This family describes the step; that law
describes the action. They agree by construction only if the step's condition is the
one the engine measures — and where it is not, the engine is right.

---

# §3 · The reminder — pre-due and post-due

*(This section was called "the chase pair". Retitled 2026-07-29 by Loo. **`Chase` is a
banned word** — COPY-STANDARD §9 — and the pair it described no longer exists: one
button remains, and it says `Remind`.)*

**A reminder is not an action.** It is a nudge sent while an action is still open, and
it closes nothing. The action it serves is whatever the ladder already shows.

| Business condition | Semantic status | Word (COPY-STANDARD) | Presentation |
|---|---|---|---|
| something is owed to us and the due date has NOT passed | **pre-due reminder is appropriate** | **`Remind`** — ruled (COPY-STANDARD §2.1) | UI-KIT |
| the due date HAS passed | **the follow-up is an ACTION, not a reminder** | `Call {party} — {measurable object}` (COPY-STANDARD §3.4) | UI-KIT |

**Urgency lives in the status VALUE, never in the button.** An overdue record is
already saying so through its own family (§1.1); making the button shout it a second
time tells the reader nothing new and makes the same button mean two things. This is a
semantic rule, and it is the reason the presentation has no "hot" variant to specify.

**Sending a reminder produces no status.** Nothing about the record changes because a
message left the building — the record changes when the other side answers, and that
answer belongs to the action's own completion.

**CSS class names and component names are implementation identifiers, not user-visible
language** (COPY-STANDARD §9.0 rule 2). `.btn-chase`, `.btn-chase-hot`, `.text-chase`
and any `Chase…` component or prop name are code, and the ban on the WORD does not
reach them. **A banned word on SCREEN is a different matter** and is a BUILD card —
§5 records the two live ones.

---

# §4 · Tab rail states

**A rail tab answers two questions about its own track, and only two:**

| Business condition | Semantic status | Word (COPY-STANDARD) | Presentation |
|---|---|---|---|
| the track has at least one open action | **needs action** | — (no word: the signal is not text) | UI-KIT |
| a number tells the reader more than the flag does | **carries a count** | the count format is `{n}` / `{n} · {n} late` (COPY-STANDARD §1.1 rule 3) | UI-KIT |
| neither | **quiet** | — | UI-KIT |

**Quiet must mean *watched and fine*, never *nobody looked*** (COPY-STANDARD §4.4). A
tab whose track has never been computed is not quiet — it has no state yet, and
rendering it as calm is the same lie a `0%` tells for a supplier with no records.

**Which tab is selected is not a status.** Selection is a UI state and belongs to
UI-KIT; this family describes the track, not the pointer.

---

# §5 · Recorded inconsistencies — pointers for the cleanup phase

**Nothing below was fixed here.** This file may modify no other document and no code
(Loo, 2026-07-29). Each row names what is wrong, where, and who owns the fix.

| # | What | Where | Owner of the fix |
|---|---|---|---|
| 1 | The ownership table assigns *"Status wording and status semantics"* to this file, two rows after assigning every visible word to COPY-STANDARD. **This file owns semantics only** | `docs/UI-KIT.md` (What this file does NOT own) | Cross-document Cleanup |
| 2 | A stylesheet comment cites **`MASTER SPEC §4`** and claims it supersedes this file's old §3. **`MASTER SPEC` exists as no document in the repo** | `apps/web/src/index.css` ×2 | Pointer Migration |
| 3 | **`.btn-reminder` has zero call sites** and **`CheckMark` has zero implementations** — dead style and a spec for a component that was never built | `index.css` · repo-wide | a BUILD card (UI-KIT lane) |
| 4 | **The banned word `Chase` is live on screen** as `Last chased {date}` — a rendered line and a tooltip | `OrderDetailDrawer.tsx` · `OperationPayments.tsx` | a BUILD card; the word is already ruled (COPY-STANDARD §9) |
| 5 | The dial's rendered size has been three different numbers (this file said 30, the component defaults to 24, the one call site passes 18). **Presentation, so it is UI-KIT's to settle** — recorded so the discrepancy is not lost with the deleted spec | `OrderDetailDrawer.tsx` | UI-KIT lane |
| 6 | **Eleven semantic statuses in §1 and §2 have no ruled word.** They are on screen today under words nobody approved, two of which are banned | COPY-STANDARD §0.2 — ask | Jess / Loo, then a BUILD card |
| 7 | The queue row that verified this file's old §1 and §2 as *"CHECK ✅"* was verifying the PRESENTATION spec that is now deleted | `docs/ui-kit-execution-queue.md` row 8 | Cross-document Cleanup |

**Row 6 is the one with business consequence.** Everything else is a stale pointer;
row 7 means the operations team is reading status words that no law has ever approved.
It is also the smallest fix: eleven words, one sitting.

---

## Review checklist (paste into any PR that adds or changes a status)

- [ ] The status has a **business condition** that produces it, stated in words.
- [ ] It belongs to exactly **one family** (§0.4), and that family already exists.
- [ ] It is **derived**, not typed by a human.
- [ ] It is not a to-do (§0.3 rule 4) — if it is, the record has an open action.
- [ ] Its **word** comes from COPY-STANDARD, or the PR says the word is unruled and asks.
- [ ] Its **presentation** comes from UI-KIT — no hex, no size, no class in this file.
- [ ] If no condition can produce it, it is marked **NOT PRODUCIBLE** and renders nowhere.
- [ ] The chain reads downward without a missing link (§0.2).
