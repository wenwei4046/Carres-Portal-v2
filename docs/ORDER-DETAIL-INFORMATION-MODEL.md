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

**FROZEN — Layout Specification L1** (§6): the six regions of responsibility those questions
become. A region is a unit of RESPONSIBILITY, not a place.

**FROZEN — Layout Specification L2** (§8): information DEPTH — Answer · Context · Evidence ·
Detail. Still not layout.

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

## 6 · Layout Specification L1 — the page regions — **FROZEN 2026-07-28**

**FROZEN by Loo, 2026-07-28.** L1 turns the six business questions into six regions of
responsibility. A **Region is a unit of responsibility, not a place** — L1 says nothing about
position, order on screen, or what is seen first. No component, no card, no tab, no rail, no
visual decision is implied or permitted here.

**The rule that keeps it honest: six questions → six regions, one to one.** Each region owns
**exactly one** question. A seventh region requires a seventh question first — if none can be
named, that region is another region's content that has set up on its own.

### R1 · Identification

| | |
|---|---|
| **Answers** | Q1 — whose order is this, does it concern me? |
| **Done when** | one plain sentence carries both halves: whose (customer · the Ref they recognise · the date we promised) and my role (mine to work, or not) |
| **Fed by** | **Identity** (customer · Ref · the responsible person · store/salesperson · building type · source · special identity: rental, guarantee, bundle) · **Commitment** (the promised date, as identification only, never as a judgement) · **Contents** (the outstanding figure — a *persistent fact*, §7②, resident here but not a member) |
| **Does NOT answer** | what to do (R2) · why (R3) · how the outstanding figure was arrived at (R5) · **it never judges urgency and never chases.** One exception: a missing building type is not shouted here — it is handed to R2 as work, because it blocks a booking |
| **When unknown** | no date → "date not set"; no prices → **"not priced", never RM 0** |
| **Absent when** | never. All three readers enter here |

### R2 · The work

| | |
|---|---|
| **Answers** | Q2 — what do I have to do now? |
| **Done when** | **every** open item is listed, each saying what · with whom · by when. Nothing open is stated with certainty ("delivering 27 Jul, nothing to do now") |
| **Fed by** | **Actions** (every open action + its six things) · **Verdict** (how late → order and tone) · **Doors** (the door that closes an item travels with it) |
| **Does NOT answer** | why it is like this (R3) · what has already been done (R6's history) · what was bought (R4) · **it never asks the reader to work out what to do** — the engine computed it, and making a human re-derive it wastes the computation |
| **When empty** | it must say so plainly. **Silence is a failure** — a blank reads as "I have missed something" |
| **Absent when** | never |

> **Records do not feed this region.** Under `ACTION-FLOW-STANDARD` Law 7 the engine reads the
> same stored signal and raises the action itself. There are **zero** cross-region channels.

### R3 · Explanation

| | |
|---|---|
| **Answers** | Q3 — why? |
| **Done when** | **three independent answers** — goods · delivery · money, one line each. **They may never be merged into one summary** |
| **Fed by** | **Commitment ⟷ Reality**, subtracted per track · **Verdict** (each track's tone) |
| **Does NOT answer** | **it never tells anybody to do anything** (R2) · it does not lay out evidence — PO numbers, unit identifiers, working-day arithmetic are the *second sentence*, not the answer · it does not tell history (R6) · **a track that is fine does not explain itself** |
| **When unknown** | unknown is an answer ("the factory has not given a date") |
| **Absent when** | never — but when all is well it is worth one line |

### R4 · Contents

| | |
|---|---|
| **Answers** | Q4 — what did they buy? |
| **Done when** | what · how many · which spec, in human words, not codes |
| **Fed by** | **Contents** (lines · quantities · specs · service add-ons) |
| **Does NOT answer** | the price explanation (R5) · discount and promotion breakdown (evidence) · where each unit physically sits (that is R3's goods evidence) · **it proves nothing** — it answers "what was bought" and stops |
| **Its normal state** | unread. **That is correct, not failure** — it is triggered by three things only: the customer is asking · goods must be counted for a PO or a delivery document · R3 did not add up |

### R5 · Money

| | |
|---|---|
| **Answers** | Q5 — the *explanation* half |
| **Done when** | what was collected · how storage accrued · whether the due date passed · whether a manager released it |
| **Fed by** | **Contents** (the composition · storage) · **Reality** (the money track) · **Commitment** (the payment due date) |
| **Does NOT answer** | **the figure itself** — that is a persistent fact resident in R1, because the speaking order needs it before the reading order arrives · chasing (that is an action in R2) · **cost and margin, ever** |
| **Half of it cannot be built today** | the payment breakdown reads a ledger with no reader, and it can contradict the figure. Until that is fixed this region states only what can be computed exactly |
| **When empty** | settled — one line |

### R6 · Record

| | |
|---|---|
| **Answers** | Q6 — what has happened? |
| **Done when** | who · when · what they did, in time order, with what was said kept verbatim — **plus what is missing** |
| **Fed by** | **Records** (history · notes · follow-ups · documents · related cases) |
| **Does NOT answer** | **what to do now** — it produces a signal and stops; the engine decides whether that signal is work · why it is stuck (R3) · the system's own bookkeeping — it records what a *person* did |
| **Documents have three states** | exists · cannot exist yet (**renders nothing**) · should exist by now (says "missing") |
| **When empty** | a new order is almost entirely empty. **What is empty does not appear at all** |

### Three things that are NOT regions

1. **Evidence** — identifiers (SO id · PO · DO · invoice · SKU · unit numbers) · timestamps ·
   who recorded what · working-day arithmetic · individual payments · storage workings.
   **It has no region of its own and never may.** It is the *second sentence* of an answer.
   Giving it a region promotes "material for an argument" into "work to be done".
2. **Doors** — not a region. The door that closes an item travels with that item in R2; the
   door that corrects history travels with R6. **Nobody opens an order in order to find a door.**
3. **An overall status** — not a region. It does not exist. R3 needs three answers, and one
   summarising word destroys all three.

### One number, three depths (money)

| Region | What it answers |
|---|---|
| R1 | **the figure itself** — the first second of a phone call cannot wait for R5 |
| R3 | one line: is money what is blocking this? |
| R5 | where the figure comes from |

**All three must be computed by the same rule** (`order-money.ts`). This is not tidiness: this
system has genuinely had three surfaces quoting three different figures for one order.

## 7 · Architecture rulings — 2026-07-28

Three questions asked of the architecture before the layout specification (L1) is frozen.
**L1 itself is NOT in this file and is NOT frozen.** These are the rulings that constrain it.

**Priority, ruled by the PM: ① → ② → ③.**

### ① RULED AND NOW LAW — the action engine is the only source of actions

`docs/ACTION-FLOW-STANDARD.md` **Law 7**. Not restated here (Law 0A).

What it changes for this page: **Records produce SIGNALS ONLY.** The "what is missing" check
does not flow into the work — the engine reads the same stored signal and raises an action
with a due and an owner, or it is not work at all. The six regions therefore have **zero**
cross-region channels, not one.

### ② RESERVED, NOT YET LAW — "Persistent Facts" is its own concept

**Ruled:** a small set of facts must stay available no matter which question is being asked.
It is **an independent concept, not a member of any region.** A region may be where such a
fact surfaces; that is residence, never membership.

**A law will be written later.** Until it is, nothing here is enforceable. What it is expected
to carry, recorded now so the reasoning is not lost:

- **The admission test** — a fact qualifies only when staff are asked it in **outward**
  communication, **answering it wrongly would create a wrong outward commitment** (an amount,
  a date, a name), and it is computed by one rule into one value. Under this test the current
  set admits **no new member**: 客户名 · Ref · the promised date · outstanding.
- **A cap.** The set is full at four. A fifth requires removing one — the same
  only-goes-one-way discipline as UI-KIT §16.
- **Values only.** A persistent fact carries no explanation and no door. *Header Everything is
  not caused by having many things; it is caused by things that start carrying actions and
  explanations.*
- **The symptom to watch for:** the first time someone argues for admission on the grounds of
  "it's convenient / it's used a lot" rather than the test above. The test exists so that
  argument has nothing to stand on.

### ③ RESERVED, NOT BUILT — Gap stays implicit

**Ruled:** reserve the concept; do **not** introduce a Gap layer. Upgrade only when a business
scenario demands it.

Why it is worth reserving: a gap has properties that belong to neither side of it — *has this
already been acknowledged* and *whose fault is it*. Both exist in the system today, living
apart (acknowledgement inside the extension record and the delay stages; fault recomputed by
the supplier scorecard). A concept with properties of its own eventually earns a name.

**The upgrade trigger, so nobody has to re-derive it:** when a third kind of commitment is
added (a rental instalment date, a guarantee term, a service-case deadline are the candidates)
and Verdict and Actions each have to be edited separately to keep up. That second separate
edit is the signal — not a feeling that it would be tidier.

**If it is ever built, three boundaries hold or it becomes a second "status":** computed and
never stored · carries no tone, no colour and no action (Verdict and Actions both *read* it) ·
**never rendered** — the page shows the gap in plain words, never the gap itself. Rendering it
would create a seventh region, which is what L1's one-question-one-region rule exists to stop.
## 8 · Layout Specification L2 — information depth — **FROZEN 2026-07-28**

**FROZEN by Loo, 2026-07-28.** L1 said which region answers which question. **L2 says how deep
an answer goes, and what sits at each depth.** It is still not layout: no position, no order on
screen, no component.

Depth is the right layer to fix before any layout, because three of the Business Thinking
Model's assertions are depth statements, not position ones: ~80% leave at step ② · every step
must finish the job alone · calm is worth a line and trouble earns room. **An argument about
how big something should be is an argument about its depth.**

### The four depths

**Business discussions use the names. Code may keep using D0–D3.** (Loo, 2026-07-28.)

| Code | **Business name** | What it is | When it appears |
|---|---|---|---|
| D0 | **Answer** | the sentence that answers this region's question | **always. A region may never have an empty Answer** |
| D1 | **Context** | the facts needed to act on that answer | **opens by itself when something is wrong**; absent when all is well |
| D2 | **Evidence** | what proves the Answer is true | only when asked |
| D3 | **Detail** | the full list, the full history, the full breakdown | only when explicitly asked — and it belongs somewhere else |

**Four rules:**

1. **Every region must be able to finish the job at Answer depth alone.** This is the Business
   Thinking Model's second assertion turned into structure.
2. **Depth is not importance.** Evidence is not "less important" — it is **not the answer**. A
   number can be critical and still be Evidence.
3. **All well → Answer only. Something wrong → Answer + Context, opened by the system.** This is
   how "trouble earns room" becomes a rule **without naming a single size.**
4. **Context may only open on a condition the system can compute.** Never on "the operator might
   want to see this".

### The six regions by depth

| Region | **Answer** | **Context** (opens on trouble) | **Evidence** (on request) | **Detail** (elsewhere) |
|---|---|---|---|---|
| **R1** Identification | customer · Ref · promised date · my role · **the outstanding figure** | a missing building type → handed to R2 | order number · source · created · salesperson | — |
| **R2** Work | every open item: what · with whom · by when — **or** "nothing to do" | the door that closes it | how the due date was reached (working days, which holiday) | completed actions → R6 |
| **R3** Explanation | three sentences: goods · delivery · money | the reason the stuck track is stuck | PO numbers · unit identifiers · how the supplier's date moved | the full goods / delivery / money record |
| **R4** Contents | what was bought · how many | — | full specs · SKU | discounts · promotions · where each unit sits |
| **R5** Money | one sentence: settled / owed / held | what is holding it · the due date | how storage was calculated | every payment (**cannot be built today**) |
| **R6** Record | one sentence: has anything happened | what happened recently · what is missing | who did it, and when | the full history · all documents · all cases |

### Three depth rules that cross regions

**① A Persistent Fact has an Answer and nothing else.** The outstanding figure is a *value* in
R1 — its explanation is R5's Evidence, chasing it is R2's Answer. This is §7②'s "values only"
expressed as depth, and it is also the structural defence against Header Everything: **a thing
that may only ever have an Answer cannot grow.**

**② Detail is always a read-only door, never a writing one.** C6 set this precedent: the
drawer's step list is a disclosure that writes nothing. **To change something you go through
R2's Context, because that door carries its gate.** Detail only shows.

**③ Detail is not this page's content — it is where to go.** The full history, every document,
every unit: their home is elsewhere, and R6's Detail is *a way there*, not a copy. This is the
rule that stops the page slowly swallowing the rest of the system.

### Two open questions L2 closes on its way past

- **The dangerous doors** (change the total · waive storage · refund · cancel) are **R2's
  Detail**. Not a new region — the deepest level: not an answer, not context, not evidence, but
  a capability that appears only when explicitly asked. What still needs a ruling is *who may
  press them*, not where they live.
- **R5's payment breakdown was already Detail**, so the unreadable ledger blocks nothing at
  Answer, Context or Evidence depth. Fixing it is now its own card, not a dependency.


## 9 · Layout Specification L3 — states — **FROZEN 2026-07-28**

**FROZEN by Loo, 2026-07-28.** L1 said which region answers which question, L2 said how deep
each answer goes. **L3 says what each region says in each situation an order can be in.** It is
the last specification that does not discuss position.

### These are not statuses

`docs/ORDERS-WORKING-FLOW.md` §1: an order has no single overall status. **L3's states are never
stored and never reach the screen.** No word anywhere tells anyone the order is "Blocked". They
are a checklist — used when designing and when testing, to ask *"what does this region say in
this situation?"* — and nothing else.

### Two states, not five

**Business discussions use the names. Code may keep A1–B2.** (Loo, 2026-07-28.)

```
SHAPE A · there is work            SHAPE B · there is no work
   A1  Working                        B1  Waiting   (all arranged, the day has not come)
   A2  Blocked                        B2  Completed
```

Listing the obvious five (new · working · blocked · waiting · done) is what showed there are
only two. **"New" is not a state at all** — a fresh order always has work (no PO), so it is
**Working** with an empty record, and an empty record already renders nothing.

**Blocked is not a rung above Working**, it is a variant: the work is still there, it just
carries a condition and a door. Arranging these four as a ladder is exactly how they would turn
back into the status word §1 forbids.

### The six regions across the four

| Region | **Working** | **Blocked** | **Waiting** | **Completed** |
|---|---|---|---|---|
| **R1** Identification | ← **identical in all four** → | | | |
| **R4** Contents | ← **identical in all four** → | | | |
| **R2** Work | every open item | the item, plus **what is holding it** and the door that lifts it | *"delivering 27 Jul, 9–11 AM — nothing to do"*, stated with certainty | "completed" |
| **R3** Explanation | the stuck track gives its reason, the others one line each | the money track says it is holding the delivery | three calm lines | three finished lines — **money may still be owed** |
| **R5** Money | collected / owed | held, with the reason and the due date | usually settled (the booking gate demands it) | settled **or** owed |
| **R6** Record | what has happened — a new order is empty, and **empty renders nothing** | the release request and the decision live here | present | fullest; **"what is missing" is most likely to fire here** (the photo) |

**R1 and R4 say the same thing in all four states.** Not a coincidence — it is evidence those
two regions are correctly drawn: **identifying the customer and identifying the goods do not
depend on how far the order has got.** Only work, reason, money and record move.

### Completed — the hole L1 and L2 left open

**Ruled (Loo, 2026-07-28): Completed means NO OPEN ACTIONS. It does not mean delivered.**

A delivered order that still owes money has work and a red money track — **that is Working, not
Completed**, which is `ORDERS-WORKING-FLOW.md` §7's rule ("delivered is not paid") arriving here
by itself.

**The page does not become a different page. It collapses.** All six regions remain, all of them
at **Answer** depth only. The one still worth opening is R6, because after an order is over only
two people come: someone asking what happened, and someone looking for a document.

**So no second page is needed, and L1 + L2 hold unchanged.** That is the return on fixing depth
before layout: *Completed is not a new design, it is the shallowest state of the same one.*

### Unknown is an attribute, not a state

**Ruled (Loo, 2026-07-28).** 37 live orders carry no prices and 40 no building type — unknown is
the majority case, not the exception.

1. **Unknown is always said out loud** ("not priced", "building type not filled in") and is
   **never** dressed as 0 or as a blank.
2. **Unknown warns, it does not block** — the single exception is the building type, which blocks
   *agreeing a date* because a condominium physically takes a half-day. It blocks that one act,
   never the order.
3. **Unknown never changes the state.** An order nobody has priced is still Working or Waiting.
   **If unknown could move an order between states, it would have become a status word.**
