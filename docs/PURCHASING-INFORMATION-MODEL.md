# Purchasing — the Information Model

> ## ⚖️ OWNERSHIP — Purchasing has exactly TWO documents and they are LAYERS, not versions
>
> **These two documents are complementary and non-overlapping.**
> **Business workflow belongs to `docs/PURCHASING-WORKING-FLOW.md`.**
> **Information Architecture belongs to `docs/PURCHASING-INFORMATION-MODEL.md` — this file.**
> **A rule must have only one canonical home and may only be REFERENCED, not duplicated, in
> the other document.**
>
> | | **`PURCHASING-WORKING-FLOW.md`** | **`PURCHASING-INFORMATION-MODEL.md`** — this file |
> |---|---|---|
> | owns | business workflow · business rules · action ownership · trigger · due · completion · status progression · queue behaviour · cross-module workflow boundaries | information architecture · information regions · information hierarchy · information relationships · the legal overlap between Planning and Draft PO · the facts each region must carry · information excluded from To Order |
>
> **There is no third Purchasing master document and none may be created** — no
> `PURCHASING_MODULE_MASTER.md`, no V2 / FINAL / COPY. **A rule that appears in full in both
> files is a defect**, and the fix is always the same: keep it whole in its canonical file
> above and leave a one-line pointer in the other.
>
> **When this file needs a workflow rule, it POINTS.** Trigger, due, completion, which tab an
> action lives on, and what a status means are never restated here — they change, and a copy
> is how two files start disagreeing.

> **FROZEN 2026-07-29 by Loo.** This is the ONE home for how the Purchasing module organises
> information. It is read before any Purchasing work — layout, copy, or code.
>
> It does not repeat: the module's actions and their six things →
> [`docs/PURCHASING-WORKING-FLOW.md`](PURCHASING-WORKING-FLOW.md) · the action MODEL →
> [`docs/ACTION-FLOW-STANDARD.md`](ACTION-FLOW-STANDARD.md) · the WORDS →
> [`docs/COPY-STANDARD.md`](COPY-STANDARD.md) · the SHELL and the click behaviour →
> [`docs/UI-KIT.md`](UI-KIT.md) · card progress →
> [`docs/purchasing-execution-queue.md`](purchasing-execution-queue.md).
>
> **The boundary with UI-KIT.** **`docs/UI-KIT.md` owns PRESENTATION ARCHITECTURE** — what
> meets the eye and in what order, shared by every page in the portal. **This file owns
> INFORMATION ARCHITECTURE** — which question each region answers and what it may never
> carry. **Where they touch, UI-KIT wins** (CLAUDE.md).
>
> **`docs/ORDER-DETAIL-INFORMATION-MODEL.md` is a STRUCTURAL precedent only.** Its regions,
> its six questions and its L1–L4 specifications are about ONE customer order. Nothing in it
> is inherited here.

---

## 0 · What is frozen, and what is not

**FROZEN — the workspace mission and the information subject** (§1–§2).

**FROZEN — the seven information regions, their hierarchy and their relationships**
(§3–§5).

**FROZEN — seven model rules** (§6): the legal overlap · freshness · holder scope · the
draft's risk date · a draft whose demand has gone · supplier-resolution failure · the two
hidden-demand regions never sharing a voice.

**FROZEN — the terminology** (2026-07-29, P6). Every word this workspace shows is ruled and
lives in `docs/COPY-STANDARD.md`. §10 maps each one to where this model uses it.

**FROZEN — the workspace boundary** (§7) and **what is excluded** (§8).

**NOT frozen, and NOT decided by this file:**

- **Layout** — nothing about position on screen, visual order, or what is read first.
- **Components** — no card, panel, table, rail, tab, drawer or button is implied here.
- **UI** — no spacing, colour, typography, icon, dimension or responsive behaviour.
- **Wording** — the words are `docs/COPY-STANDARD.md`'s, not this file's. §10 lists which
  word this model uses where; a chat that respells one here has created a second home for it.

**The binding direction:**

> **The system's organisation is re-fitted to serve this model. Never the reverse.**

---

## 1 · Workspace mission

**To Order is the Planning Workspace.** It answers exactly one question:

> **Goods we do not have yet — how far along is each one?**

Everything on this workspace is that question. A piece of information that does not help
answer it has no business justification here and belongs to another workspace (§8).

---

## 2 · The information subject

**There is ONE subject: a requirement to buy** — a customer line that needs goods, where the
goods are not yet secured.

Every region is that same subject at a different distance from being secured:

```
a requirement to buy
   ├── cannot enter the plan          E · configuration is missing
   ├── deliberately held out          F · a human decided, and said until when
   ├── in the plan, untouched         D · computed
   ├── in preparation                 C · stored  (Draft PO)
   └── secured                        → leaves this workspace
```

**The distinction that decides the whole architecture:** D is **computed** — change a
setting and it changes. C is **stored** — change a setting and it does not.

> **A computed requirement and a stored requirement may never share one list.**

This is not a layout preference. It is the reason `ops_order_control.balance` became a lock
reading a column nobody wrote, the reason C5 found one figure read three ways, and the reason
Receiving's status tabs and its `Check in` count answer nearly the same question from two
stores. Two truths in one list is how a number quietly stops being true.

---

## 3 · The information regions

Seven regions. Each is a unit of RESPONSIBILITY, not a place on a screen.

| | Region | The question it answers | Nature |
|---|---|---|---|
| **A** | Scope and freshness | Which slice of purchasing am I looking at, and when was it worked out? | navigational fact |
| **B** | Current actions | What is owed, and what is already late? | actions + counts |
| **C** | Drafts in preparation | What have I already started? | **stored objects** |
| **D** | The plan | What still has no protection at all? | **computed** |
| **E** | Missing configuration | What cannot even enter the plan? | computed |
| **F** | **`Purchasing on Hold`** | What did somebody decide to leave out, and until when? | stored decisions |
| **G** | Narrowing conditions | How do I make all of the above smaller? | facts |

### A · Scope and freshness

Carries:

- **which slice** of purchasing work is in view
- **when the plan was worked out** — the plan is computed at read time from settings,
  customer orders and existing POs; any of the three moving changes it

A plan that does not state when it was computed will be acted on after it has gone stale.

Carries no business rows of its own.

### B · Current actions

Each action carries three facts:

- what the action is
- how many are open
- how many are already late

**Order within this region is frozen — see §4.**

**Never carries:** any communication state (Q5, frozen: communication is not part of the PO
lifecycle) · **any priority word** — the reason, and the rule that replaces it, are
`docs/PURCHASING-WORKING-FLOW.md` §6.

### C · Drafts in preparation

**What a Draft PO IS** — a stored business object, not a Purchase Order, and not a state of
one — is a status-progression rule and lives in `docs/PURCHASING-WORKING-FLOW.md` §9. **What
a draft ENTRY must carry, and must never carry, is this file's** and is below.

Each draft carries:

| Fact | Why it must be there |
|---|---|
| which supplier it is for | a draft's only natural anchor |
| which customer orders and how many items it covers | what it is protecting |
| **its origin** — from the plan · started manually · a line split out on its own | the three kinds are different work; only the first has a planning row behind it |
| **its risk date** — the earliest order-by date across the demand it covers | when holding it stops being safe |
| who is holding it | `PURCHASING-WORKING-FLOW.md` §5 — two people will open the same work |
| **`Demand no longer required`** when the demand it covers has gone | §6.5 |

**Never carries — and their absence IS the proof that a draft is not a PO:**

- no PO number
- no official document of any kind
- no communication channel state

Nothing else is needed to enforce "Draft is NOT a Purchase Order". It is structural.

### D · The plan

Each planning entry carries:

- supplier × category
- how many customer orders, how many items
- the order-by date (`PURCHASING-WORKING-FLOW.md` §2's formula)
- how urgent that is against today
- **`Covered by {count} Draft POs`** (singular `Covered by 1 Draft PO`) — §6.1

**Never carries:** a priority word · any requirement that already has a PO (that has left
this workspace).

### E · Missing configuration

Demand that **cannot enter the plan** because purchasing configuration is missing. It has not
been made actionable, and **nobody has looked at it**.

Two causes, and both belong here:

1. **`Supplier not assigned`** — the supplier cannot be worked out for the item (§6.6)
2. **Production working days are not configured** for that supplier × category — the rule
   that no number means no order-by date, rather than a fallback, is
   `docs/PURCHASING-WORKING-FLOW.md` §2

Each entry carries:

- the customer order / SO
- the item
- the category
- the quantity
- **why it could not be made actionable** — which of the two causes

**This region may never be silent about a requirement it is holding.** A quiet screen must
mean *watched and fine*, never *nobody looked*.

### F · `Purchasing on Hold`

Demand a human has **already reviewed** and deliberately delayed. The region's name is
`Purchasing on Hold` and each row states `On hold until {date}` (COPY-STANDARD).

Each entry carries:

- **what** was held
- **Held by** — who held it
- **Reason** — why it was held
- **Held time** — when the hold was placed
- **Resume date** — when it comes back

**E and F may never share one status word and may never share one empty state**
(Loo, 2026-07-29). They mean opposite things: E is *nobody has looked at this*; F is
*somebody looked and decided*. One voice for both tells the operator that a configuration
hole and a considered decision are the same event.

### G · Narrowing conditions

Carries only **fact-shaped** dimensions: supplier · category · urgency.

**Never carries a to-do-shaped filter.** A filter that can be cleared but never set is the
same lie one level down — the two that existed (`attn` · `selectedDay`) were deleted whole by
R8 for exactly that reason and may not return without their own card and their own words.

**A narrowing condition applies to every region that has entries** — B, C, D, E, F. A filter
describes the world, not one region.

**A dimension that exists in only one region stays a FACT on that region and does not become
a narrowing condition.** (A draft's origin is the standing example.)

---

## 4 · Hierarchy and the order

### The region order

```
A   Scope and freshness
B   Current actions
C   Drafts in preparation
D   The plan
E   Missing configuration
F   Intentionally held demand
G   Narrowing conditions            (applies across B · C · D · E · F)
```

**Ordering principle: commitment descending.** The further down, the less anybody has yet
committed to it.

| Position | Why |
|---|---|
| **B first** | It is the only region carrying deadlines that turn red by themselves |
| **C before D** | The first real risk on a purchasing day is not missing something — it is **preparing the same thing twice**. Seeing what you already started, before seeing what is unstarted, is itself the guard |
| **D after C** | The plan is the largest region, but it is the one nobody has yet taken responsibility for. Placing it first buries the work already in flight |
| **E after D** | E is the plan's coverage statement. Detached from the plan it becomes a footnote, and footnotes are not read |
| **F after E** | F is watched; E is not. The unwatched one is read first |
| **G across all** | It is not content. It is the lens |

### The action order — FROZEN 2026-07-29 by Loo

Within To Order, actions rank:

```
1  Confirm ready date
     an existing supplier commitment is missing or broken

2  Issue PO
     work is already prepared and has not yet become a formal PO

3  Prepare PO
     demand has not yet been placed into a Draft PO
```

**The region order and the action order are the same order**, and that is a property of the
model rather than a coincidence: the draft action ranks above the preparing action because a
prepared draft is closer to a commitment than an untouched requirement, which is the same
sentence as "C before D".

All three words are ruled (Loo, 2026-07-29) and their five strings live in
`docs/COPY-STANDARD.md`, which is their canonical home. This model never respells them.

---

## 5 · Relationships between regions

### 5.1 · B's counts must be producible from C, D, E and F

Any count above zero in B must return at least that many entries when acted on. **A number
its own click cannot produce is the first count in this portal that lies** (the rule P2's
Claims half established).

### 5.2 · C and D never share one list

Different truth source, different meaning of an entry, different ordering law. **This is the
first frozen condition of this model.**

### 5.3 · One requirement legitimately appears in C and D at the same time

This is the only overlap in the model and it is deliberate:

- a draft exists, but the requirement is **still not secured** — no PO exists, so D must keep
  showing it
- a draft **can be deleted** — if D dropped the requirement the moment a draft appeared, then
  deleting the draft would remove an unmet requirement from the entire workspace

**Therefore D never hides an entry because of anything in C.**

The price is that one requirement is visible twice during preparation, and that price is what
D's *"how many drafts cover this"* fact pays for. Without it, the overlap is a trap: the
operator prepares a second draft for demand already covered.

**The relationship is not one-to-one and the fact must never assume it is.** `Send PO` is
counted per supplier, but sofa splits per (customer order × item × fabric), so one planning
entry can be covered by several drafts; and a draft started manually, or split out on its
own, has **no planning entry behind it at all** and exists only in C.

### 5.4 · E and F explain what D cannot show

Single direction. Every entry in E or F is a requirement that did **not** reach D. Nothing
flows the other way.

### 5.5 · Securing a requirement removes it from this workspace

Once a PO exists, the requirement belongs to **Purchase Orders** (the official document) and
to **Receiving** (the goods). To Order carries no secured requirement. This is the definition
of the workspace boundary (§7).

---

## 6 · Seven model rules, frozen with the model

### 6.1 · A planning entry states `Covered by {count} Draft POs`

The consequence of the legal overlap (§5.3). It is a **fact** — it states what is true and
carries no to-do word.

### 6.2 · The workspace states when its plan was computed

Region A. The plan is derived at read time; without this, an operator can buy against a plan
that stopped being true.

### 6.3 · Holder scope

| Region | Carries "who is on this" |
|---|---|
| B · actions | **yes** |
| C · drafts | **yes** |
| D · the plan | **no** |
| E · F | **no** |

A planning entry is not work anybody has taken. Giving it a holder invents responsibility
that nobody accepted.

### 6.4 · A draft's risk date is computed at read time, never stamped

The draft's risk date is derived from the demand it covers. That demand's promised date
moves — a customer reschedules, a delay decision lands. **A date stamped when the draft was
created is wrong the moment the promise moves**, and a stored figure nobody re-computes is
the exact disease this codebase has already paid for four times.

A draft stores *what is to be bought*. It does not store *when the deadline was, once*.

### 6.5 · A draft whose covered demand has disappeared states `Demand no longer required`

A draft can outlive its reason: the customer order changed, another PO covered the goods, the
line was excluded. The draft is still a legal stored object, but it now covers nothing.

**C must be able to state this.** It is a **fact**, not a to-do word. Without it, somebody
issues a formal PO for goods nobody needs.

### 6.6 · Demand whose supplier cannot be resolved stays visible

**Measured 2026-07-29 (M1, positive):** the planning read discards any demand line whose item
resolves to no supplier, with no output anywhere.

> **Silent discard is not permitted.** Any real procurable demand that cannot resolve a
> supplier remains visible under **E · Missing configuration**, stating the customer order,
> the item, the category, the quantity, and why resolution failed. **It may never disappear
> from the purchasing workload.**

**Measured, and part of the same rule:** supplier resolution is done by **two different rules
in one module** — the plan resolves by the item's own supplier alone, while PO creation
additionally falls back to which categories a supplier covers. A requirement invisible to one
and buyable in the other is one requirement with two truths.

> **Supplier resolution must eventually be ONE rule shared by planning and PO creation. Two
> resolution systems may not be preserved.**

### 6.7 · E and F never share a status or an empty state

Stated in §3 · E/F. Repeated here because it is the rule most likely to be lost when somebody
"tidies" two small regions into one.

---

## 7 · The workspace boundary

**→ The boundary rule is `docs/PURCHASING-WORKING-FLOW.md` §1.** It is a cross-module
workflow boundary, so the workflow file owns it whole: the deadline-anchor rule, the list of
which action lives on which tab, and why the plain-language "goods are not yet secured"
sentence is an explanation rather than the rule.

**Why this model needs it at all:** the boundary is what decides the CONTENTS of this
workspace. Everything §1–§6 organises is the work the boundary assigns to To Order; the
moment an action moves across it, this model's regions change with it. That is also why §7.1
below is here and not there — the MOVE is a workflow decision, but which FACTS must survive
the move is an information requirement.

### 7.1 · Moving `Check in` out of To Order may not delete information

**Measured 2026-07-29 (M2, positive):** To Order's receiving stage states, per entry, the
**customer name / SO number** that the PO serves. The Receiving workspace does not carry that
fact today.

> **`Check in` leaves To Order, and no information leaves with it.** Receiving must carry:
> the PO · the supplier · **the customer name** · **the SO number** · the warehouse ·
> the ETA / expected arrival · the quantity still to receive.
>
> **The existing To Order receiving implementation is not removed until Receiving can carry
> every one of those facts.**

This freezes the information requirement. It does not decide how Receiving presents it.

---

## 8 · Information explicitly excluded from To Order

| Information | Whose it is |
|---|---|
| the contents and state of an issued PO | Purchase Orders |
| supplier-side facts (`sup_status`, the pickup chain) | the second status axis — belongs to the PO, not to the plan |
| receiving progress and check-in records | Receiving |
| quality problems and claims | Claims |
| the purchasing numbers themselves | Settings — E names which pair has no number; it carries neither the value nor the editing |
| WhatsApp / Email channels and their history | **not part of the PO lifecycle at all** (frozen) — they occupy no information position in this model |
| moving goods we already own between locations | Stock — `PURCHASING-WORKING-FLOW.md` §8 |

---

## 9 · The information layout — full page

**This is an information layout.** It shows which region carries what and how information
moves. It decides no colour, no spacing, no icon, no component, no dimension and no
responsive behaviour — all of those are `docs/UI-KIT.md`'s and are decided in the UI-KIT
phase.

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│  PURCHASING                                                                              │
│  ┌──────────┬─────────────────┬───────────┬────────┬──────────┐                          │
│  │ To Order │ Purchase Orders │ Receiving │ Claims │ Settings │  ← Settings: manager only │
│  └────▲─────┴─────────────────┴───────────┴────────┴──────────┘                          │
│       │ active                                                                           │
├───────┴──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  ╔═ A · SCOPE AND FRESHNESS ═══════════════════════════════════════════════════════════╗ │
│  ║  which slice of purchasing is in view                                               ║ │
│  ║  when this plan was worked out            ← the plan is computed at read time        ║ │
│  ╚═════════════════════════════════════════════════════════════════════════════════════╝ │
│                                                                                          │
│  ╔═ B · CURRENT ACTIONS ═══════════════════════════════════════════════════════════════╗ │
│  ║  order FROZEN — commitment descending                                               ║ │
│  ║                                                                                     ║ │
│  ║   1. Confirm ready date          how many open · how many late                      ║ │
│  ║   2. Issue PO                    how many open · how many late                      ║ │
│  ║   3. Prepare PO                  how many open · how many late                      ║ │
│  ║                                                                                     ║ │
│  ║  every count must be producible from C · D · E · F        (§5.1)                     ║ │
│  ║  carries: who is on it            never carries: any communication state             ║ │
│  ╚═════════════════════════════════════════════════════════════════════════════════════╝ │
│                                                                                          │
│  ╔═ C · DRAFTS IN PREPARATION ═════════════ STORED OBJECTS ════════════════════════════╗ │
│  ║  one entry = one Draft PO                                                           ║ │
│  ║                                                                                     ║ │
│  ║   supplier · what it covers (customer orders + items) · origin                       ║ │
│  ║   risk date  ← COMPUTED AT READ TIME from the demand it covers        (§6.4)         ║ │
│  ║   who is holding it                                                                 ║ │
│  ║   `Demand no longer required` — its covered demand has gone           (§6.5)         ║ │
│  ║                                                                                     ║ │
│  ║   NEVER: a PO number · an official document · a communication channel                ║ │
│  ║          └── their absence IS the proof that a Draft is not a PO                     ║ │
│  ╚═════════════════════════════════════════════════════════════════════════════════════╝ │
│         │                                                                                │
│         │  Prepare PO        ▲                    ▼  Issue PO                            │
│         │  ────────────────  │                    ─────────────────►  ╔══════════════╗   │
│         │                    │                                        ║ PURCHASE     ║   │
│  ╔══════▼═══════════════════ │ ═══════════════════════════════════╗   ║ ORDERS       ║   │
│  ║ D · THE PLAN ═══════════ COMPUTED ═════════════════════════════║   ║ the official ║   │
│  ║  one entry = supplier × category                               ║   ║ document     ║   │
│  ║                                                                ║   ╚══════╤═══════╝   │
│  ║   how many customer orders · how many items                    ║          │           │
│  ║   order-by date · urgency against today                        ║          │ goods     │
│  ║   `Covered by {count} Draft POs`                   (§6.1)      ║          │ start     │
│  ║                                                                ║          │ moving    │
│  ║   D NEVER hides an entry because C has one           (§5.3)    ║          ▼           │
│  ║   NEVER: a priority word · anything already secured             ║   ╔══════════════╗   │
│  ╚════════════════════════════════════════════════════════════════╝   ║ RECEIVING    ║   │
│                                                                       ║ must carry:  ║   │
│  ╔═ E · MISSING CONFIGURATION ═════════════════════════════════════╗  ║  PO          ║   │
│  ║  demand that CANNOT enter the plan — nobody has looked at it    ║  ║  supplier    ║   │
│  ║                                                                ║  ║  CUSTOMER    ║   │
│  ║   SO · item · category · quantity · WHY it failed              ║  ║  SO NUMBER   ║   │
│  ║     ├── `Supplier not assigned`                       (§6.6)   ║  ║  warehouse   ║   │
│  ║     └── production working days are not set  → `Set a number`  ║  ║  ETA         ║   │
│  ║                                                                ║  ║  qty left    ║   │
│  ║   may NEVER be silent about a requirement it holds             ║  ║        (§7.1)║   │
│  ╚════════════════════════════════════════════════════════════════╝  ╚══════════════╝   │
│                                                                                          │
│  ╔═ F · PURCHASING ON HOLD ════════════════════════════════════════════════════════════╗ │
│  ║  somebody already reviewed this and decided                                         ║ │
│  ║                                                                                     ║ │
│  ║   `On hold until {date}` · what was held · Held by · Reason · Held time              ║ │
│  ║                                                                                     ║ │
│  ║   E and F never share one status and never share one empty state       (§6.7)        ║ │
│  ╚═════════════════════════════════════════════════════════════════════════════════════╝ │
│                                                                                          │
│  ╔═ G · NARROWING CONDITIONS ══════════════════════════════════════════════════════════╗ │
│  ║  supplier · category · urgency        — fact-shaped only, never a to-do filter       ║ │
│  ║  applies to B · C · D · E · F at once — a filter describes the world, not a region   ║ │
│  ╚═════════════════════════════════════════════════════════════════════════════════════╝ │
└──────────────────────────────────────────────────────────────────────────────────────────┘

  What crosses OUT of this workspace, and what decides it:
     a requirement leaves the moment a PO exists          → Purchase Orders · Receiving
     which ACTION sits on which tab is the deadline-anchor boundary
                                        → PURCHASING-WORKING-FLOW.md §1 (not restated here)
```

---

## 10 · The words this model uses

**Every word on this workspace is ruled** (Loo, 2026-07-29 · P6) and **`docs/COPY-STANDARD.md`
is their canonical home.** This file never respells one — it only says where each is used, so
that reading a word tells you which part of the model it serves.

| Word | Used by this model at |
|---|---|
| `Prepare PO` · `Prepare PO for {supplier}` | §4 — the third action of To Order · §9 — region D's outbound arrow |
| `Issue PO` · `Issue PO to {supplier}` | §4 — the second action · §9 — region C's outbound arrow, the only path to Purchase Orders |
| `Draft PO` | §3 · C — the region's object, everywhere it is visible |
| `Demand no longer required` | §3 · C and §6.5 — the fact a draft states when its covered demand has gone. It is a fact and a stop, never an error word |
| `Covered by {count} Draft POs` | §3 · D and §6.1 — the fact that pays for the legal overlap in §5.3. **Without it, §5.3 is a trap and not a design** |
| `Purchasing on Hold` · `On hold until {date}` | §3 · F — the region and its row fact |
| `Supplier not assigned` | §3 · E and §6.6 — the fact that keeps M1's demand from vanishing |
| `Set a number` | §3 · E — the other cause under Missing configuration |
| the six Operation Status labels | §8 — keeping the supplier axis out of this workspace depends on the two axes being named apart |

**`Send PO` is retired and appears nowhere in this model.** Raising a purchase order is two
acts — `Prepare PO`, then `Issue PO` — and the verb `Send` is retired with the old single
action.

---

## 11 · The measured facts this model rests on

Recorded so nobody re-derives them, and so a future contradiction is traceable.

| Fact | Measured |
|---|---|
| The planning read discards supplier-less demand with no output (M1) | 2026-07-29 |
| Supplier resolution runs by two different rules — planning vs PO creation | 2026-07-29 |
| To Order's receiving stage states the customer / SO; Receiving does not (M2) | 2026-07-29 |
| Deliberately excluded, time-boxed and snoozed demand produces no output at all | 2026-07-29 |
| The freshness fact already exists on this workspace | 2026-07-29 |
| The two unreachable narrowing conditions were deleted whole by R8 | 2026-07-28 |
| `Confirm ready date` has no path in the portal that can close it | P5, 2026-07-29 |
| There is no Draft anywhere in the system today | 2026-07-29 |

**Everything in the database today is test data** (CLAUDE.md). These measurements are
evidence about whether the CODE behaves, never about business volume.
