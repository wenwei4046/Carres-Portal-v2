# Carres Action Flow Standard — how the portal leads a human

> **Locked with Jess 2026-07-27.** This is the ENGINE law: what an action is, when it
> appears, when it closes, and which one shows first. The WORDS are in
> `docs/COPY-STANDARD.md`; this file never re-specifies wording.
>
> Applies to every module — Orders, Purchasing, Receiving, Service, Stock, Payments.
> A module does not invent its own action model.

## The one sentence

**The system leads; the staff follow.** An action appears BY ITSELF when its trigger
becomes true, and disappears BY ITSELF when its completion becomes true. Staff never
create an action, never tick one off, never decide what is next, and never read an SOP
to find out — every action explains itself on screen at the moment it is needed.

**No paper.** There is no printed SOP, no wall chart, no training deck. If a staff member
needs a document to use the portal, the portal is wrong. (Jess, 2026-07-27.)

**A new hire's whole training is four lines:**

```
1. Open Orders and pick your own name.
2. Start from the top row.
3. Open the action and follow it — fill in what it asks for.
4. It ticks itself and the next thing comes up.
```

## Law 0 — follow the law, and say so when the law is wrong

Following is not silent obedience. **A chat that spots a problem and says nothing has
failed, even if it shipped the card perfectly.** (Jess, 2026-07-27.)

- **Report, do not unilaterally change.** The laws and the module flow files are followed as
  written. If one of them is wrong, contradicts the live code or data, or would confuse a
  new hire, the chat SAYS SO to Jess — with the evidence — and Jess decides. It never edits
  a law to suit the card it is building, and it never quietly does something different.
- **Every chat ends with a review section, even when empty.** Four questions, always
  answered: what in the flow contradicts the real code or data · what would confuse a
  new hire · what could not be implemented exactly as written · what the flow does not
  cover at all. "Nothing found" is a valid answer; silence is not.
- **A blocking problem stops the work.** If building the card as written would ship
  something wrong, the chat stops before building and asks. Shipping a known-wrong thing
  because "the card said so" is the worst outcome available.

## Law 1 — TWO LAYERS, never one

The old single ladder (`first matching rule wins`) is retired as a business rule. It hid
real work: an order with no PO, RM 2,000 owing and no carrier showed only `Order PO`, and
the other two facts vanished.

```
LAYER 1 · COMPUTE      every track evaluates INDEPENDENTLY.
                       One action may never suppress another track's action.
                       Result: the order's full set of OPEN ACTIONS.

LAYER 2 · DISPLAY      picks which ONE goes first in the table row.
                       Everything else rides behind it as "+N" and is fully
                       visible the moment the row is opened.
```

The old ladder's ordering survives ONLY as input to Layer 2.

## Law 2 — every action carries six things

A thing is not an action unless all six exist. If one is missing, the design is not
finished — do not build it.

| | |
|---|---|
| **Trigger** | the condition that makes it appear, computed from stored data |
| **Label** | verb + named party + measurable object (COPY-STANDARD) |
| **Checklist** | the steps that close it — each one DERIVED from a stored signal or an INPUT the system stores |
| **Completion** | a condition the SYSTEM measures. Never "someone says they did it" |
| **Due** | when it turns late (working days — Mon–Sat, MY public holidays skipped) |
| **Owner** | who is responsible (PIC, or the duty holder for shared work) |

**The no-decorative-checkbox law:** a tick-box that only records an assertion is banned.
Where a FORM already collects the inputs, that form IS the checklist — never a second row
of ticks beside it.

## Law 3 — every module has ONE working-flow file, and it is the only place its actions live

A module's actions are NOT listed here. They live in one file per module, overwritten in
place, never duplicated:

| Module | Its one file |
|---|---|
| Orders | `docs/ORDERS-WORKING-FLOW.md` |
| Purchasing | `docs/PURCHASING-WORKING-FLOW.md` (written when that line starts) |
| Receiving & claims · Service · Stock · Payments | same shape, same naming |

**The shape is fixed** so every module reads the same way, and a chat can be pointed at one
file: (1) what the module is · (2) what the flow reads, naming the real column for every
signal · (3) the actions, each with the six things · (4) which shows first · (5) gates,
stated as separate from display order · (6) row order · (7) the facts on screen ·
(8) what is deliberately NOT an action.

Tracks inside a module run in PARALLEL: purchasing, payment and delivery actions may all be
open on the same record at the same time.

## Law 4 — display priority (which one shows first)

```
1  Broken commitment or today's run
     Deliver today · the failed-delivery follow-up · Upload delivery photo
2  The customer must be told something
     Call {customer} — agree new delivery date
3  Goods are not secured
     Send PO to {supplier} · Call {supplier} — confirm ready date
4  Delivery preparation
     Assign logistics · Call {logistics} — confirm delivery date · Issue delivery order
5  Money
     Collect RM {amount} from {customer}
```

**Money displays last on purpose and this is not a demotion.** It matches the existing
collections rule — 催钱前先看货, you do not chase a payment for goods you cannot deliver —
and the action is always present in the checklist and in the Owing filter. (Jess confirmed
2026-07-27.)

**Money still LOCKS.** Display order and gating are different things: an outstanding
balance still blocks confirming a delivery, server-side. See C5 — that gate currently reads
a column nobody writes and must be fixed first.

## Law 5 — row sorting (unchanged in spirit, stated here so it is not re-derived)

Primary: risk to the promise (overdue → due today → due next working day → commitment
broken → stock will miss the window → action due soon → normal).
Secondary: the customer's promised date.
Tertiary: order value, high to low — **a tie-breaker only.** A RM 20,000 order three weeks
out never outranks a RM 1,500 order going out tomorrow.

## Law 6 — the three dots have no header

The dots are three INDEPENDENT facts, not one status, so the column carries no header word
(`Status` was wrong, `Checks` reads as "cheques" next to money). Each dot is labelled by
its own small icon instead — goods · delivery · money — using the portal's icon set, not
emoji, per `docs/UI-KIT.md`.

```
Customer        📦 🚚 $        Actions
John Tan        🟢 🟡 🔴       Call Ohana — confirm ready date  +2
```

A delivered order may still show a red money dot and keep an open payment action.
Delivered is not paid.

## What this replaces

- The single next-action ladder as a business rule (it stays as Layer 2 input).
- Any module-local idea of "status" that mixes goods, delivery and money into one word.
