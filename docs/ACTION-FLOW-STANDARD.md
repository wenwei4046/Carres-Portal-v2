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
1. Open My Work.
2. Start from the top row.
3. Open the action and complete it.
4. The system closes it and shows the next action.
```

Work is assigned automatically — nobody hunts for their own name in a filter.

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

## Law 0A — Source of Truth

Every rule exists in ONE document only.

| Rule | Its only home |
|---|---|
| Action engine | `docs/ACTION-FLOW-STANDARD.md` |
| UI wording | `docs/COPY-STANDARD.md` |
| A module's working flow | `docs/<MODULE>-WORKING-FLOW.md` |
| Execution queue | `docs/execution-queues-index.md` |

Never duplicate a rule into a second document. When a rule changes, the source document is
updated and nothing else — a copy elsewhere is how Delivery gets fixed and Purchasing is
forgotten.

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
| **Label** | verb + clear object; name the party whenever an outside party is involved (COPY-STANDARD) |
| **Checklist** | the steps that close it — each one DERIVED from a stored signal or an INPUT the system stores |
| **Completion** | a condition the SYSTEM measures. Never "someone says they did it" |
| **Due** | when it turns late, in **working days** |
| **Task Owner** | assigned automatically by the module that raised the action; it may change hands |

**Case Owner** is separate and is never written on an action: one person owns the customer's
case from start to finish and never changes, while task owners come and go.

**Working days, one definition for every module:** Monday–Saturday · Sunday excluded ·
Malaysian public holidays excluded (the live calendar is the Selangor observance set, since
the warehouse is in Selangor) · a due date landing on a non-working day moves automatically
to the next working day.

**The no-decorative-checkbox law:** a tick-box that only records an assertion is banned.
Where a FORM already collects the inputs, that form IS the checklist — never a second row
of ticks beside it.

## Law 3 — every module has ONE working-flow file, and it is the only place its actions live

A module's actions are NOT listed here. They live in one file per module, overwritten in
place, never duplicated:

**Every module owns ONE working-flow file. Every working-flow file uses the SAME structure.
Only the business content differs — the document structure never changes.**
Orders' file (`docs/ORDERS-WORKING-FLOW.md`) is the template; a module's file is named
`docs/<MODULE>-WORKING-FLOW.md` and is written when that line starts.

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
2  The customer must be told something (through logistics — Carres does not
   phone about a delay, and never before the ready date is known)
     Call {logistics} — arrange new delivery date
3  Goods are not secured
     Send PO to {supplier} · Call {supplier} — confirm ready date
4  Delivery preparation
     Assign logistics · Call {logistics} — confirm delivery date · Issue delivery order
5  Money
     Collect RM {amount} from {customer}
```

**Rung 2 never names the customer.** Carres does not phone a customer about a delay —
logistics carries that conversation, and the action in this portal is the call to
logistics. Any surface that opens a customer call about a delay is wrong.
(Jess, 2026-07-27; the flow is `docs/ORDERS-WORKING-FLOW.md` §3.)

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

## Law 6 — the three dots — ✅ BUILT (C10, PR #471)

The dots are three INDEPENDENT facts, never one status: **goods · delivery · money**. Each
is labelled by its own small icon from the portal icon set (never emoji, per
`docs/UI-KIT.md`) — **so the dots need no header of their own.**

**They sit BESIDE the stage pill, never replacing it** (Jess 2026-07-27). The pill is the
order's overall progress summary — WHERE this order is; the dots are WHICH PART has
trouble. Different questions, both kept. The column keeps the header word `Status`, which
is correct for the pill it heads.

```
Customer     Status                    Actions
John Tan     Proceed  📦 🚚 $          Call Ohana — confirm ready date  +2
                      🟢 🟡 🔴
```

A delivered order never alarms on goods or delivery, and may still show a red money dot
with an open payment action. Delivered is not paid.

Tones live in `docs/ORDERS-WORKING-FLOW.md` §7 — one home (Law 0A).

**BUILT — C10, PR #471, live 2026-07-27.** The dots render beside the stage pill in the
`Status` column, each as its own Lucide icon (goods `Package` · delivery `Truck` · money
`Wallet`, 14px). The pill is untouched and keeps the header word.

## Law 7 — the action engine is the ONLY source of actions

**Ruled by Loo, 2026-07-28.** Nothing else in the portal creates work.

A module, a panel, a record view or a report may produce **SIGNALS** — facts computed from
what is stored. **Only the action engine turns a signal into an action**, and only when all
six of Law 2's things exist.

**Why this is a law and not a preference.** An action created anywhere else has no Due, no
Task Owner and no Completion the system measures — so nothing can ever close it. That is
exactly the row C3 retired (`Confirm delivery with {customer}`): the one line in the drawer
that no button in the portal could close. A row with no button teaches a new hire that they
have missed something.

**Two kinds of "missing", and only one of them is work:**

| | |
|---|---|
| **A human can fix it** — no delivery photo, no building type | the engine raises it as an ACTION, with a due and an owner |
| **No human can fix it** — a number the system should have stamped and did not | **it is not work.** It is a fact in the record, and a defect to report. It may never be shown as a task |

A "missing" list that fills up with things nobody can do is how a worklist dies: staff stop
reading all of it.

**What a records surface may do:** state what it has and what it lacks.
**What it may not do:** phrase that lack as an instruction, give it a deadline, or assign it
to anybody. Two computations may not describe the same fixable gap — if the engine already
raises it, the record states nothing.

## What this replaces

- The single next-action ladder as a business rule (it stays as Layer 2 input).
- Any module-local idea of "status" that mixes goods, delivery and money into one word.
