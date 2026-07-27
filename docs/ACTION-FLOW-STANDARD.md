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

## Law 3 — the tracks (they run in parallel)

| Track | Action | Trigger | Completion |
|---|---|---|---|
| **Purchasing** | `Send PO to {supplier}` | goods line needs buying, no PO | PO number exists AND supplier ready date exists |
| | `Call {supplier} — confirm ready date` | ready date missing · due for re-confirm · passed with no goods · later than the customer's date · changed by the supplier | latest ready date recorded AND call outcome recorded |
| **Recovery** | `Confirm recovery plan` (internal) | latest supplier ready date is LATER than the customer's promised date | a proposed new date exists AND a communication owner is named |
| | `Call {customer} — agree new delivery date` | a recovery plan exists and the original date still cannot be met | customer accepted a new date AND the outcome is recorded |
| **Payment** | `Collect RM {amount} from {customer}` | outstanding > RM 0 | outstanding = RM 0 |
| **Delivery** | `Assign logistics` | delivery needed, no logistics company chosen | a logistics company is recorded. **NEVER "they accepted"** |
| | `Call {logistics} — confirm delivery date` | assigned, but the customer has not confirmed BOTH date and slot | customer-confirmed date AND slot recorded |
| | `Issue delivery order` | the customer-confirmed date exists | the delivery order document exists for this trip |
| | `Deliver today` | customer-confirmed date is today, not yet delivered | delivered, OR a specific named problem recorded |
| | `Upload delivery photo` | delivered, no photo | at least one photo exists |

**Two rules that keep this honest:**

- A logistics-proposed date is a FACT, never a confirmation.
- Payment, purchasing and delivery actions may all be open at the same time. Being
  further down the display order never means an action is gone.

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
