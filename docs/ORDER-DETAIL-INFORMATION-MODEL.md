# Order Detail — the Information Model

> **FROZEN 2026-07-28 by Loo.** This is the ONE home for how the Order Detail page organises
> information. It is read before any Order Detail work — layout, copy, or code.
>
> It does not repeat: the action MODEL → `docs/ACTION-FLOW-STANDARD.md` · the WORDS →
> `docs/COPY-STANDARD.md` · the SHELL → `docs/UI-KIT.md` · the module's actions →
> `docs/ORDERS-WORKING-FLOW.md`.

## 0 · What is frozen, and what is not

**FROZEN — the Business Thinking Model** (§1–§3): the order in which a human's brain asks
questions when it opens one order, and what counts as a satisfying answer to each.

**NOT frozen, and NOT decided by this file:**

- **Layout** — nothing about position, order on screen, or what is read first *visually*.
- **Components** — no card, panel, tab, rail, strip, table or button is implied here.
- **UI** — no spacing, colour, typography or icon.

**The binding direction (Loo, 2026-07-28):**

> **The System Model must be re-fitted to serve the Business Model. Never the reverse.**

The system's own organisation (Identity · Commitment · Reality · Verdict · Actions ·
Records · Doors — §4) is a *supply* structure. It is how data is computed and kept
consistent. **It is not a display order and must never be shown as one.** If a system layer
does not feed one of the six questions in §1, its presence on this page has no business
justification and must be argued for on its own.

**Layout is discussed ONLY on top of this model.** A layout proposal that cannot name which
of the six questions each part of it answers has not been designed — it has been decorated.

## 1 · The six steps — the brain's order

Each step states: the sentence in the operator's head · what counts as a satisfying answer ·
what they do next · what makes them skip it · what they do NOT want yet.

### Step 1 — "Whose order is this? Does it concern me?"

> 「哦，这张是谁的单？……是我在跟的吗？」

Two questions asked as one, in about a second: **whose order** (customer, the Ref they
recognise, the date we promised) and **my role in it** (mine to work, someone else's, or
just passing through).

- **Satisfying answer:** one plain sentence — *"陈太，答应她 27 号，Shasha 跟的。"*
- **Then they:** leave immediately if it is the wrong order; drop a gear from "I am working"
  to "I am looking" if it is not theirs.
- **Skipped when:** never fully — even arriving from the list, they confirm they did not
  misclick.
- **Not wanted yet:** order numbers, creation time, system identifiers, what was bought.

### Step 2 — "What do I have to do now?"

> 「那这张单现在到底要我做什么？」

**They are not asking for a status.** Status is a system word; a brain wants a verb and a
party.

- **Satisfying answer:** **every** open thing, not just the first — they often make two calls
  in one sitting. Each one states **what · with whom · by when**. "Nothing to do" is a valid
  and required answer, stated with certainty (*"等 27 号出货，现在没事"*) — vagueness here
  reads as "I have missed something".
- **Then they:** in ~80% of openings, act and leave. **Answer step 2 well and steps 3–6 are
  never read.**
- **Skipped when:** never. This is why they came.
- **Not wanted yet:** why. They want the verb before they have the patience for the reason.

### Step 3 — "Why?"

> 「为什么会卡在这里？」「为什么系统叫我打给 NETS？」

**This step is a subtraction: what we promised ⟷ what is actually true.** The gap is the
reason.

The brain splits it three ways and wants three separate answers, never one summary:
**goods** (ordered? factory's date? how many arrived?) · **delivery** (who carries it? has
the customer agreed a date?) · **money** (how much is in?).

- **Satisfying answer:** three sentences, one per track. A track that is fine says one calm
  thing and explains nothing. **Only the stuck track owes a reason.**
- **Then they:** either accept it and go back to step 2, or — if it does not add up — carry
  on to steps 4 and 6.
- **Skipped when:** the instruction is self-evident (*upload the delivery photo*).
- **Not wanted yet:** PO numbers, per-unit identifiers, working-day arithmetic. Those are
  **evidence for an argument**, not a reason.

### Step 4 — "What did they buy?"

> 「等下，他到底买了什么？」

**Not a routine step — a triggered one.** Three triggers only: the customer is asking on the
phone · they are raising a PO or a delivery document and must count goods · step 3 did not
add up and they are checking it themselves.

- **Satisfying answer:** what, how many, which spec — in human words (*"三座沙发，灰布"*),
  not codes.
- **Then they:** usually return to the step-2 task.
- **Skipped when:** most days, entirely. Knowing what was bought is not needed to chase a
  factory.
- **Not wanted yet:** discount maths, promotion breakdown, which warehouse each unit sits in.
  That is auditing, not identifying.

### Step 5 — "Is there a money problem?"

> 「他钱给了没有？」

**A real tension, ruled here rather than left to layout:**

> **When READING, money is step 5.** 催钱前先看货 — you do not chase payment for goods you
> cannot deliver.
> **When SPEAKING, money is the first second.** The customer opens with *"我还欠多少"*, and
> staff cannot go hunting mid-call.

Same person, two situations, two orders. So the answer has two forms, and both are business
requirements:

1. **The number**, always in hand, not gated behind reaching step 5 — *"还欠 RM 2,800"*.
2. **The explanation** (which payments, how storage accrued, whether the due date passed) —
   that is step 5 proper.

- **Satisfying answer:** the number, plus one line on whether it is holding the delivery.
  An order with no prices says **"未定价"** — never RM 0.
- **Then they:** decide whether to chase while they are here.
- **Skipped when:** settled. One line — "collected" — done.

### Step 6 — "What has happened?"

> 「这张单之前谁在跟？发生过什么事？为什么会搞成这样？」

**Runs only when something is wrong.** A healthy order never reaches step 6 in its life.

Three people actually get here: **the one taking over** (shift change, leave) · **a complaint**
(*"你们上次答应我……"*) · **management**, after an incident.

- **Satisfying answer:** who · when · what they did, in time order, with what was said kept
  verbatim. Plus one more thing of equal weight: **what is missing** — anything that should
  exist by now and does not. That sentence throws them back to step 2.
- **Skipped when:** everything is normal.
- **Not wanted:** the system's own bookkeeping. They want what a *person* did, not when a row
  was touched.

## 2 · Three business facts the model asserts

**① ~80% leave at step 2.** Steps 1 and 2 answered badly make the other four worthless;
steps 3–6 answered slowly cost very little.

**② The brain does not read through — it asks one question and decides whether to ask the
next.** Every step must therefore be able to **finish the job on its own**. Nothing may
require reading all six to become useful.

**③ Same page, three people, three entry questions:**

| Who | Their first question | Their route |
|---|---|---|
| **The operator working it** (~80%) | "What do I do?" | 1 → 2 → (leave) |
| **The interrupted one** (customer call, management asks) | "What is the situation?" | 1 → 3 → 5 → 4 |
| **The one taking over / after an incident** | "What happened?" | 1 → 6 → 3 → 2 |

All three start at step 1 and **fork immediately**. This is the model's most important
sentence: **the six steps are an order you may enter at any point, not a path you must walk.**

## 3 · What the model rules out

- **A single overall status word.** Step 3 wants three answers; a summary word destroys all
  three. (Same ruling as `docs/ORDERS-WORKING-FLOW.md` §1, reached independently from the
  human side.)
- **Making step 2 wait for step 3.** Showing state first and letting the operator conclude
  the action asks a human to re-derive what the engine already computed.
- **Evidence competing with answers.** Numbers, identifiers, timestamps and line-by-line
  detail are the *second* sentence of an answer, never the first.
- **A number the system cannot back.** Unknown is stated as unknown.

## 4 · How the System Model supplies the six steps

This mapping is a *supply* relationship. It is not a display order and never becomes one.

| Brain step | Supplied by |
|---|---|
| 1 Whose order | Identity |
| 2 What to do | Actions (Verdict sets weight) |
| 3 Why | Commitment ⟷ Reality — the gap |
| 4 What was bought | Contents |
| 5 Money | Contents (the amount) + Reality (the money track) |
| 6 What happened | Records |

**Doors** (recording a payment, raising a PO, extending, waiving, cancelling) belong to no
step. Nobody opens an order in order to find a door; doors travel with step 2 and step 6.

**Evidence** (identifiers, timestamps, per-unit rows, payment lines, working-day arithmetic)
belongs to no step. It is the second sentence of an answer, everywhere.

**The re-fit this implies** — the System Model is now the thing that must move:

- Any system layer that feeds no step must justify itself or leave the page.
- `Commitment` and `Reality` exist to be *subtracted*, so they are supplied together or step 3
  cannot be answered.
- The money **number** is supplied independently of step 5, because the speaking order needs
  it before the reading order reaches it.

## 5 · Deliberately still open

Named so nobody reads this file as covering them:

- **A finished order** (delivered · paid · photo in · nothing open). After go-live this is
  most orders, and steps 2–6 all resolve to "nothing". The model holds — step 2 answers
  "done" — but **what that page is for has never been ruled.** Not a layout question.
- **The follow-up after a failed delivery** — `docs/ORDERS-WORKING-FLOW.md` §4 states it is
  not built. Step 2 has a hole there, and it is that file's hole, not this one's.
- **Whether the payment detail may be shown at all** — the ledger has writers and no reader
  (carry-forward `order-payments-ledger-has-no-reader`), so step 5's *explanation* can
  currently contradict step 5's *number*. The number is safe; the breakdown is not.
