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
> | owns | business workflow · business rules · action ownership · trigger · due · completion · status progression · queue behaviour · cross-module workflow boundaries | information architecture · information regions · information hierarchy · information relationships · the facts each region must carry · information excluded from To Order |
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
> **IT NOW COVERS THREE WORKSPACES (Loo, 2026-08-04 · 2026-08-05).** §1–§11 are **To Order**,
> frozen 2026-07-29 and unchanged. **§12 is Purchase Orders**, frozen 2026-08-04. **§13 is
> Receiving**, ruled 2026-08-05 (card Q12) and written to be read BESIDE §12. They share this
> file rather than getting one each, because the rule directly below — *there is no third
> Purchasing master document and none may be created* — is still in force, and because §12's
> date dictionary is portal-wide and would otherwise have two homes.
>
> **§13 is architecture only.** The Receiving FORM — its fields, its gates, its photos, its
> posting flow and its timeline — belongs to the Receiving module by Loo's own split, and
> nothing in §13 designs it.
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

**FROZEN — the six information regions, their hierarchy and their relationships**
(§3–§5).

**FROZEN — four model rules** (§6): freshness · holder scope · supplier-resolution failure ·
the two hidden-demand regions never sharing a voice.

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
   └── secured                        → leaves this workspace
```

**The distinction that decides the whole architecture:** every requirement on this workspace
is **computed** — change a setting and it changes. **To Order stores no purchasing
work-in-progress object at all** (Loo, 2026-07-30 — the Purchasing clean restart): demand
goes from the plan straight to the Purchase Order, and `Issue PO` is the one act that creates
it. The only stored decision here is a human's hold (region F).

> **A computed requirement and a stored requirement may never share one list.**

This is not a layout preference. It is the reason `ops_order_control.balance` became a lock
reading a column nobody wrote, the reason C5 found one figure read three ways, and the reason
Receiving's status tabs and its `Check in` count answer nearly the same question from two
stores. Two truths in one list is how a number quietly stops being true.

---

## 3 · The information regions

Six regions. Each is a unit of RESPONSIBILITY, not a place on a screen.

| | Region | The question it answers | Nature |
|---|---|---|---|
| **A** | Scope and freshness | Which slice of purchasing am I looking at, and when was it worked out? | navigational fact |
| **B** | Current actions | What is owed, and what is already late? | actions + counts |
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

### D · The plan

Each planning entry carries:

- supplier × category
- how many customer orders, how many items
- the order-by date (`PURCHASING-WORKING-FLOW.md` §2's formula)
- how urgent that is against today

**Never carries:** a priority word · any requirement that already has a PO (that has left
this workspace).

### E · Missing configuration

Demand that **cannot enter the plan** because purchasing configuration is missing. It has not
been made actionable, and **nobody has looked at it**.

Two causes, and both belong here:

1. **`Supplier not assigned`** — the supplier cannot be worked out for the item (§6.3)
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
a narrowing condition.**

---

## 4 · Hierarchy and the order

### The region order

```
A   Scope and freshness
B   Current actions
D   The plan
E   Missing configuration
F   Intentionally held demand
G   Narrowing conditions            (applies across B · D · E · F)
```

**Ordering principle: commitment descending.** The further down, the less anybody has yet
committed to it.

| Position | Why |
|---|---|
| **B first** | It is the only region carrying deadlines that turn red by themselves |
| **D after B** | The plan is the largest region, and it is the one nobody has yet taken responsibility for |
| **E after D** | E is the plan's coverage statement. Detached from the plan it becomes a footnote, and footnotes are not read |
| **F after E** | F is watched; E is not. The unwatched one is read first |
| **G across all** | It is not content. It is the lens |

### The action order

**Within To Order there is now ONE action** — Loo moved `Confirm ready date` to Purchase
Orders on 2026-08-05 (queue and door in one place; the door is the Purchase Orders expand,
shipped by migration 0318). One action has nothing to rank against.

```
1  Issue PO
     demand is not yet on any purchase order
```

Both words are ruled and their five strings live in `docs/COPY-STANDARD.md`, which is their
canonical home. This model never respells them.

---

## 5 · Relationships between regions

### 5.1 · B's counts must be producible from D, E and F

Any count above zero in B must return at least that many entries when acted on. **A number
its own click cannot produce is the first count in this portal that lies** (the rule P2's
Claims half established).

### 5.2 · E and F explain what D cannot show

Single direction. Every entry in E or F is a requirement that did **not** reach D. Nothing
flows the other way.

### 5.3 · Securing a requirement removes it from this workspace

Once a PO exists, the requirement belongs to **Purchase Orders** (the official document) and
to **Receiving** (the goods). To Order carries no secured requirement. This is the definition
of the workspace boundary (§7).

---

## 6 · Four model rules, frozen with the model

### 6.1 · The workspace states when its plan was computed

Region A. The plan is derived at read time; without this, an operator can buy against a plan
that stopped being true.

### 6.2 · Holder scope

| Region | Carries "who is on this" |
|---|---|
| B · actions | **yes** |
| D · the plan | **no** |
| E · F | **no** |

A planning entry is not work anybody has taken. Giving it a holder invents responsibility
that nobody accepted.

### 6.3 · Demand whose supplier cannot be resolved stays visible

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

### 6.4 · E and F never share a status or an empty state

Stated in §3 · E/F. Repeated here because it is the rule most likely to be lost when somebody
"tidies" two small regions into one.

---

## 7 · The workspace boundary

**→ The boundary rule is `docs/PURCHASING-WORKING-FLOW.md` §1.** It is a cross-module
workflow boundary, so the workflow file owns it whole: the **role-anchor** rule (ruled
2026-08-05 — asking the supplier is the buyer's, handling the goods is Receiving's), the list
of which action lives on which tab, and the one case it leaves open.

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
│  ║                                                                                     ║ │
│  ║  every count must be producible from D · E · F            (§5.1)                     ║ │
│  ║  carries: who is on it            never carries: any communication state             ║ │
│  ╚═════════════════════════════════════════════════════════════════════════════════════╝ │
│                                                                                          │
│                              ▼  Issue PO                                                 │
│                              ─────────────────────────────────────►  ╔══════════════╗   │
│                                                                       ║ PURCHASE     ║   │
│  ╔═════════════════════════════════════════════════════════════════╗  ║ ORDERS       ║   │
│  ║ D · THE PLAN ═══════════ COMPUTED ══════════════════════════════║  ║ the official ║   │
│  ║  one entry = supplier × category                                ║  ║ document     ║   │
│  ║                                                                 ║  ╚══════╤═══════╝   │
│  ║   how many customer orders · how many items                     ║         │           │
│  ║   order-by date · urgency against today                         ║         │ goods     │
│  ║                                                                 ║         │ start     │
│  ║   nothing is stored between the plan and the document           ║         │ moving    │
│  ║   NEVER: a priority word · anything already secured             ║         ▼           │
│  ║                                                                ║   ╔══════════════╗   │
│  ╚════════════════════════════════════════════════════════════════╝   ║ RECEIVING    ║   │
│                                                                       ║ must carry:  ║   │
│  ╔═ E · MISSING CONFIGURATION ═════════════════════════════════════╗  ║  PO          ║   │
│  ║  demand that CANNOT enter the plan — nobody has looked at it    ║  ║  supplier    ║   │
│  ║                                                                ║  ║  CUSTOMER    ║   │
│  ║   SO · item · category · quantity · WHY it failed              ║  ║  SO NUMBER   ║   │
│  ║     ├── `Supplier not assigned`                       (§6.3)   ║  ║  warehouse   ║   │
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
│  ║   E and F never share one status and never share one empty state       (§6.4)        ║ │
│  ╚═════════════════════════════════════════════════════════════════════════════════════╝ │
│                                                                                          │
│  ╔═ G · NARROWING CONDITIONS ══════════════════════════════════════════════════════════╗ │
│  ║  supplier · category · urgency        — fact-shaped only, never a to-do filter       ║ │
│  ║  applies to B · D · E · F at once     — a filter describes the world, not a region   ║ │
│  ╚═════════════════════════════════════════════════════════════════════════════════════╝ │
└──────────────────────────────────────────────────────────────────────────────────────────┘

  What crosses OUT of this workspace, and what decides it:
     a requirement leaves the moment a PO exists          → Purchase Orders · Receiving
     which ACTION sits on which tab is the role-anchor boundary
                                        → PURCHASING-WORKING-FLOW.md §1 (not restated here)
```

---

## 10 · The words this model uses

**Every word on this workspace is ruled** (Loo, 2026-07-29 · P6) and **`docs/COPY-STANDARD.md`
is their canonical home.** This file never respells one — it only says where each is used, so
that reading a word tells you which part of the model it serves.

| Word | Used by this model at |
|---|---|
| `Issue PO` · `Issue PO to {supplier}` | §4 — the second action · §9 — region D's outbound arrow, the only path to Purchase Orders |
| `Purchasing on Hold` · `On hold until {date}` | §3 · F — the region and its row fact |
| `Supplier not assigned` | §3 · E and §6.3 — the fact that keeps M1's demand from vanishing |
| `Set a number` | §3 · E — the other cause under Missing configuration |
| the Operation Status labels | §8 — keeping the supplier axis out of this workspace depends on the two axes being named apart |

**`Send PO` is retired and appears nowhere in this model**, and the verb `Send` is retired
with it. **`Prepare PO` and `Draft PO` are retired too** (Loo, 2026-07-30 — the Purchasing
clean restart): raising a purchase order is ONE act, `Issue PO`, and there is no preparation
stage and no stored work-in-progress object between the plan and the document.

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
| ~~`Confirm ready date` has no path in the portal that can close it~~ — **CLOSED by migration 0318**: `purchasing_record_ready_date` writes the promise ledger and the current answer, reached from the Purchase Orders expand. The action moved there with its door (Loo, 2026-08-05) | P5, 2026-07-29 |
| No Draft PO table, function, RLS policy, column or `po_status` value exists; the `po_status` enum is `open, received, cancelled` | 2026-07-30 |
| The unused `draftPoExists` split had ZERO producers, so removing it changed no reachable behaviour beyond the word on screen | 2026-07-30 |

**Everything in the database today is test data** (CLAUDE.md). These measurements are
evidence about whether the CODE behaves, never about business volume.

---

# §12 · THE PURCHASE ORDERS WORKSPACE — FROZEN 2026-08-04 by Loo

> **Why this section exists, in his words:** *"这已经不是 copy，而是整个 Purchase Orders 的
> Information Architecture. 先把模型定下来，再改 UI，一次会比较干净."*
>
> **He stopped the word-fixing to write this**, and he was right to: the words could not be
> settled one at a time because each one needed a model that did not exist. **No UI is
> decided here. No column list is decided here.** §12.5 says what is deliberately left open.

## 12.1 · Workspace mission

**Purchase Orders is the Supplier Execution Register.** It answers exactly one question:

> **A purchase order has been issued — how far has the supplier got with it?**

To Order asks *what do we not have yet*; Purchase Orders asks *what did we already ask for,
and where is it*. A fact that helps neither has no home on this tab.

## 12.2 · THE DATE DICTIONARY — portal-wide, and this is the section's centre

**Ruled by Loo, 2026-08-04.** A purchase order carries FOUR dates and today the portal spells
them six ways across four screens. **One fact, one word, everywhere it appears.**

| # | The fact | **THE WORD** | Where it is stored | Who says it |
|---|---|---|---|---|
| ① | the factory has finished making it | **`Ready Date`** | `purchase_orders.expected_ready_date` | the supplier |
| ② | the goods are **expected** to reach our warehouse | **`Expected Arrival`** | `purchase_orders.eta_date` | the supplier (or our own estimate — see 12.2.1) |
| ③ | the goods **actually** reached our warehouse | **`Received At`** | `warehouse_receipts.goods_received_at` | the warehouse, at the moment it counted |
| ④ | the customer was promised this day | **`Customer Delivery`** | `orders.delivery_date` | Sales |

**`Received At` is the fact this system does not have today**, and that is why it is in the
model rather than in a card: 0 `warehouse_receipts` rows have ever existed, so the register
can say *how many* arrived (`Received 0 / 1`) and can never say *when*.

**THESE SPELLINGS ARE RETIRED. All three named the SAME fact ②:**

```
✗  Goods Arrival     Purchase Orders column · Receiving column · the workspace's date row
✗  Stock             the Orders list column   (its own comment: "the SUPPLIER arrival ETA")
✗  Stock ETA         the Activity timeline    — and `ETA` is a BANNED word
```

`ETA` is banned by the Business Date Dictionary; it is the ground on which Jess's own
`Confirm ETA` was refused on 2026-08-02, and `Stock ETA` has been live on the timeline the
whole time.

**`Expected Arrival` names its destination and so does `Customer Delivery`.** That is the
whole reason the pair works: *arrival at OUR warehouse* against *delivery to THEIR house*.
`Goods Arrival` named no destination, which is exactly the ambiguity Loo hit — *arrival of
what, where?*

**The sweep is portal-wide and it is NOT one card.** `Goods Arrival` is live on the Receiving
page, which belongs to the ④ R lane; `Stock` and `Stock ETA` are live on the Orders list and
its Activity timeline, which belong to the Orders lane. **A Purchasing chat may change neither
page.** The word is ruled here for all of them; each lane sweeps its own screens.

### 12.2.1 · An estimate and a promise are the same COLUMN and never the same STATEMENT

`eta_date` holds a date the supplier gave. When there is none, the register computes one from
production working days and shows it — measured 2026-08-04: **16 of 21 POs are showing our own
estimate, and 8 of them are already warning that it lands after the customer's date.**

> **A date we guessed and a date a factory gave may never look identical.** The register
> already separates them by tone since Q1 (a broken promise is red; a risk we computed is
> amber). This model makes that permanent: **`Expected Arrival` must always state which of the
> two it is.** Nothing may present an estimate as a supplier's word.

### 12.2.2 · ONE COLUMN, TWO DOCUMENTS, TWO MEANINGS — reported, not resolved

Measured 2026-08-04, and it is the most dangerous thing in this section:

```
docs/PURCHASING-WORKING-FLOW.md §2
    "the supplier's READY date | … per customer line `ops_order_control.line_etas`"

apps/web/src/pages/operation/OperationOrdersControl.tsx:435
    "The STOCK column carries the SUPPLIER ARRIVAL ETA … read from `line_etas`"
```

**The same column is the READY date in the flow file and the ARRIVAL date in the code.** Those
are two different days — every supplier here carries `transit_days` (Ohana 1, Nice Future 1),
so ready and arrival are by definition not the same date.

This is the open carry-forward `eta-model-stock-eta-vs-line-etas-undecided` becoming load-
bearing. Loo froze it on 2026-07-28 with *"settle after real POs run"*. **21 real POs now
exist.** It is named here so the next ruling has somewhere to land; **this model does not
settle it**, because it decides what an Orders-lane column means and that is not Purchasing's
to take.

## 12.3 · ACTION AND STATUS ARE TWO KINDS AND MAY NEVER SHARE A COLUMN

**Ruled by Loo, 2026-08-04.** His own words: *"Current Action 其实混了 Action 和 Status …
这一栏本身已经不纯了."*

| | ACTION | STATUS |
|---|---|---|
| answers | what must a human DO | where are the goods |
| shape | verb + named party + measurable object | a state word |
| who writes it | **the action engine, and nothing else** (Law 7) | derived from stored quantities and dates |
| when it leaves | when the system measures its outcome | when the goods move |
| may it be empty | **yes** — nothing to do is a real answer | no, a PO is always somewhere |

**`Waiting for Goods` is a STATUS wearing an action's column.** So is `Open Receiving` — that
is navigation, not work. Both leave the action column.

**`Contact Supplier` is not a legal label at all.** `Contact` was retired as a verb by Loo on
2026-07-28 — `Call` already covers *reach the outside party, get
an answer, record the outcome*. It has been live on this page since.

**`Confirm Arrival` reverses its own meaning and that is the sharpest example of why this
section exists.** The full string is `Confirm Goods Arrival Date` — *phone the factory and ask
which day the goods come*. The register shortens it to `Confirm Arrival`, which a reader takes
as *tick that it has arrived*. **A future question became a past confirmation.** One is a phone
call; the other is receiving. It is showing on 16 of 21 rows today.

> **A short form may drop WORDS. It may never drop the TENSE or the OBJECT.**

## 12.4 · WHAT THIS COSTS TODAY — measured, and stated before anybody builds

If the action column holds only engine actions, then **today it is empty on all 21 rows.**

```
the engine has exactly TWO action keys
    confirm_tomorrows_delivery      fires when arrival is the next office working day
    confirm_balance_delivery_date   fires when a line is short

measured 2026-08-04 · 0 of 21 POs raise either
    the five known arrival dates are 12 · 13 · 19 · 19 · 25 Aug — none is tomorrow
    0 lines are short, because 0 goods have ever been received
```

**That is not a reason to keep the four invented words. It is the measurement of the hole.**

**THE HOLE, NAMED: no action exists for the thing 16 of 21 POs are waiting on.**
`PURCHASING-WORKING-FLOW.md` §3 defines `Call {supplier} — confirm ready date` — the date the
factory FINISHES. It defines no action for *the factory has never told us which day the goods
reach us*, which is `Expected Arrival` and is the axis this whole register is built on.

So the register's state machine and the flow file's action list stand on two different dates.
**Closing that is a business decision — a new action with all six of Law 2's things, and five
strings in COPY-STANDARD — and it is Loo's, not a chat's.**

## 12.5 · WHAT IS DELIBERATELY NOT DECIDED HERE

Loo's instruction was *freeze the model, then change the UI*. The following are therefore
**open**, and a chat that settles one has taken a decision that was left to him on purpose:

1. **Which columns the register carries.** *"再决定列表到底放哪些栏位."*
2. **Where STATUS goes** once it leaves the action column — a column, the left rail, a pill.
   The rail already carries five state words that are in no dictionary (§12.6).
3. **The missing action** for `Expected Arrival` (§12.4) — its trigger, due, owner and five
   strings.
4. **How row priority is shown.** Q1 made the ORDER correct and the order is invisible; the
   three candidates studied (a left edge bar, an in-cell badge, its own column) are recorded
   in the checkpoint and none is chosen.
   **THE ORDER ITSELF IS CLOSED, 2026-08-04 — Q1 STAYS.** Loo: *"永远以 Operator Priority
   排序，不是 PO Issued。Operator 打开 Purchase Orders，是为了处理今天最重要的事情，不是看
   最新开的 PO."* His earlier `PO Issued Newest → Oldest` line is withdrawn by that ruling.
   **`PO Issued` is a column and a header sort, and decides nothing about row order** — this
   also finally settles the conflict between Jess's 2026-08-02 listing law and
   `PURCHASING-WORKING-FLOW.md` §6 / `ACTION-FLOW-STANDARD.md` Law 5, in favour of the two laws.
5. **`line_etas`' true meaning** (§12.2.2) — an Orders-lane ruling.

## 12.7 · TREE GRID — the Information Architecture review Loo asked for, 2026-08-04

> **⚠️ THIS SECTION IS A REVIEW, NOT LAW.** Loo asked *"为什么国际 ERP 用 Tree Grid …
> 如果答案成立，我们就采用。如果不是，我们不要为了像 AutoCount 而做."* This is the answer
> and its evidence. **Nothing here is frozen until he rules on it.** A chat that builds from
> this section has built from a proposal.

### 12.7.1 · The question, and the honest answer

**The answer is: they do not use a Tree Grid for documents. They use it for HIERARCHIES.**

SAP's own guideline — the largest ERP vendor, writing about its own Tree Table:

> *"You should only show trees with a lot of hierarchical data **as a last resort**. Try
> instead to break down the data into manageable chunks and allow the user to navigate or
> drill down between them."*
> *"Neither the tree table nor the grid table are responsive."*

That is not an endorsement. It is a warning, from the vendor whose product Loo is asking us
to learn from.

**A hierarchy and a document are different shapes, and the difference is the whole answer:**

| | A HIERARCHY | A DOCUMENT |
|---|---|---|
| depth | unbounded — a node contains a node contains a node | **exactly two, forever** |
| examples | chart of accounts · bill of materials · org chart · product categories · cost centres · WBS | purchase order · invoice · delivery order · sales order |
| the operator asks | *where does this sit in the structure?* | *what is on this one, and what do I do about it?* |
| the pattern used | **Tree Grid** | **Header + Lines** |

**A purchase order is a document.** It is a PO and its lines. It is never a PO inside a PO.
It cannot grow a third level, because `PURCHASING-WORKING-FLOW.md` §3 already rules that
adding items means a NEW PO, never a deeper one.

### 12.7.2 · What the six products actually do — measured, not assumed

**Every one of them expresses "a document and its lines" the same way, and it is not a tree:**

| Product | The PO list | Where the lines live |
|---|---|---|
| **SAP Fiori** | List Report | **Object Page** — header + sections. The list-plus-detail case is the **Flexible Column Layout**, sanctioned for exactly this: *"if the user needs to switch easily between different work items … letting the user work down the list without additional navigation"* |
| **Business Central** | List page | **Document page** — header FastTabs, then a FastTab titled **`Lines`**. Its right pane is a **FactBox**: *"related facts about the current record … at-a-glance"* — a READING surface, never the editor |
| **Dynamics 365 F&O** | Grid with grouping + totals | Details form, and the same FactBox pattern |
| **Oracle Fusion** | PO list | PO page — header + lines |
| **Odoo** | List | Form — header fields + an editable lines table |
| **AutoCount** | **FLAT list, one row per PO, no expand** | New / Edit / View opens the document |

**THE SHARPEST PIECE OF EVIDENCE IS AUTOCOUNT'S OWN, AND IT IS IN LOO'S OWN SCREENSHOTS.**
Its **Purchase Order** list (2026-08-04, his first screenshot) is flat — one row per PO, no
expander. The hierarchical rows he admired are in **`SO Batch Posting`** (his later
screenshot), which is a different kind of screen: it acts on MANY parents' children in ONE
pass, before committing them all together.

> **AutoCount uses a tree grid where you process many documents at once, and a flat list
> where you pick one document and work it.** We would not be copying AutoCount by putting a
> tree on the PO register — we would be copying the wrong AutoCount screen.

### 12.7.3 · Carres already has the internationally-correct pattern

Purchase Orders today is a **list + a persistent detail panel**. That IS Fiori's Flexible
Column Layout and BC's list-plus-FactBox. **The pattern is not the problem.** What is wrong
is the ALLOCATION — which facts sit in which of the three places (§12.7.5).

### 12.7.4 · So is an expand justified at all? YES — but for a narrower reason

**Not** *"so the operator does not have to open the panel"*. That reason fails its own test:
the panel is already open and free, and duplicating its content one level up is the
one-number-in-four-places disease Loo himself named.

**The reason that survives is one the row and the panel structurally cannot cover:**

> **The panel shows ONE document. The row shows ONE value per document. Neither can compare
> the CHILDREN of SEVERAL documents at once.**

Carres has exactly this case today, and Loo found it:

```
PO-2032 has 3 lines going to 2 destinations — AL Sungai Buloh + Carres Klang.
"Which lines across all my open POs are going to AL this week?"
  → the row can only say `Carres Klang +1`
  → the panel can only answer for one PO at a time
  → today: open all 21 POs, one by one
```

**That is the test, and it is portable to Receiving, Claims and Stock:**

> **Build the expand when the operator must read a fact that lives on the LINE, across MANY
> documents, in one pass. Otherwise the panel is enough and the expand is decoration.**

### 12.7.5 · THE ALLOCATION — which fact goes where

**Loo's rule, adopted verbatim (2026-08-04):** *"Expand only shows information that cannot be
represented in a single row."*

> **⛔ THIS ALLOCATION WAS REWRITTEN BY LOO THE SAME DAY, AND HIS IS BETTER.** The version
> below is his. What it replaced said *"the expand never writes; writes stay in the panel"* —
> and my reason for that rule was that two editing surfaces for one PO will disagree.
> **He removed the disagreement instead of the feature: the panel STOPS being an editing
> surface.** One editing surface remains, so the rule it needed is gone. His diagnosis is
> the part worth keeping: *"Right panel not friendly to edit detail"* — which is a signal
> that the panel's JOB was defined wrong, not that editing is hard.

**The split that decides everything: DOCUMENT DATA vs ACTIVITY** (Loo, 2026-08-04).

| | **A · Document Data** — the PO itself | **B · Activity** — what happened AROUND the PO |
|---|---|---|
| what | Destination · Supplier Ready Date · Expected Arrival · Qty · line remark · supplier SKU · receiving qty | Communication · Timeline · Files · Notes · Print |
| is it the PO? | **yes** | **no** |
| where it lives | **the EXPAND — the working area** | **the RIGHT PANEL — the Activity panel** |

| Tier | The test it must pass | What lives there |
|---|---|---|
| **ROW** | *Is it ONE value for the whole PO, and does it help me choose which PO to touch?* | PO Issued · Supplier · PO No. · SO No. · Items · Destination · Customer Delivery · Expected Arrival · Current Action |
| **EXPAND — the WORKING AREA** | *Is this the DOCUMENT?* Line-level facts, **and the operator edits them here.** | per line: which SO · which item · qty · **its own destination** (editable) · received / short / damaged · plus `Supplier Ready Date` and `Expected Arrival` (editable) and `Received At` |
| **RIGHT PANEL — the ACTIVITY PANEL** | *Is this something that HAPPENED, rather than the PO?* | Communication · Timeline · Files · Notes · Print. **It stops carrying the date door** |

**Why this is right and the old version was not:** the operator's real complaint was
*click → right → scroll → change → close → click the next one*. AutoCount feels good because
**the document is in front of you and you type into it.** Putting the document in the middle
and the history on the right is that, without AutoCount's full-page expand.

**Four rules, and each one closes a hole this repo has already paid for:**

1. **A fact may be READ in two tiers. It may be WRITTEN in only one.** *(Narrowed by Loo, 2026-08-04, after using the page: it first read "nothing appears in two tiers", and Q5 obeyed it by taking the items grid OUT of the right panel — so clicking a row showed the supplier, the dates and the communication and never what was ON the purchase order. **Rule 1 was written to stop two sources of TRUTH; two READERS of one source were never the danger.** The panel gets the items back, read-only; the expand keeps the editing. Card Q9, ABSORBED BY
   Q10 and shipped there 2026-08-05 — the panel's items block is asserted to hold no control at
   all, so rule 3 is untouched.)* Loo's own rule, and the reason the expand may not
   repeat Supplier · PO No. · Items — those are columns. *(Destination and Expected Arrival
   DO appear twice on purpose and it is not duplication: the row prints ONE value for the
   whole PO as a flag — `Carres Klang +1` — and the expand carries the per-LINE value that
   the row structurally cannot hold. A flag and a field are not the same fact.)*
2. **ONE PO expands at a time.** Loo's rule, and it is load-bearing rather than tidy: the
   expand holds date pickers, dropdowns and inputs, and three open at once is a page of live
   controls with no focus. **Opening a second closes the first.**
3. **ONE editing surface.** Because the expand edits, the panel must NOT — the date door
   moves out of the panel rather than being kept in both. Two doors onto one PO is C1's
   bypass in a new coat.
4. **The expand is not a tree.** Two levels, fixed forever. No expandable node inside an
   expanded node — the shape Fiori calls a last resort.

### 12.7.5a · HOW A FIELD SAVES — corrected by real use, 2026-08-04

**The rule as first written was wrong, and Jess broke it with her hands within minutes of
using the page** — *"i cant save?"* and *"i cant save for AL"*. It said: *a value is TEXT
until clicked, then a control; Enter saves, Esc cancels, and there is no Save button anywhere
on the surface.* That is Jess's own 2026-08-02 inline-edit ruling and it is still right — but
only for the case it was written about.

**The missing distinction, and it is mechanical:**

| The field | How it commits | Why |
|---|---|---|
| **one value the operator TYPES** — a date, a remark | **Enter saves · Esc cancels · no button** | the hand is already on the keyboard, so the gesture is free and a button would be furniture |
| **a value chosen with the MOUSE** — a dropdown | **an explicit Save** | **a picker changed with the mouse has no keyboard gesture to commit.** There is nothing for Enter to mean |
| **a form of SEVERAL fields** — date + reason + remarks | **an explicit Save** | Enter in field 1 cannot know whether fields 2 and 3 are finished |

**A button that performs an ACT rather than storing a value is named for the act** — the
quantity split's control is `Split`, not `Save`, because it does something the operator can
describe.

> **This correction is what CLAUDE.md §13.2 is for.** The rule was defensible in writing and
> false in the hand, and it took one operator one minute to prove it. Nobody would have found
> it in another day of discussion.

### 12.7.6 · The costs — stated, because a review that only lists benefits is an advert

| Cost | Why it bites Carres specifically |
|---|---|
| **A filter becomes ambiguous** | Filter `Destination = AL Sungai Buloh`: does the register show the PARENT PO, or only the matching LINE? The facet counts and the nine column funnels all have to answer this, and today every one of them counts POs |
| **A count becomes ambiguous** | The footer reads `21 purchase orders`. With children on screen, is it 21 or 35? Both are true and the operator cannot tell which they are looking at |
| **Not responsive** | SAP's own words. Rows stop being a fixed 40px, so the scanning rhythm the page is built on breaks wherever a row is open |
| **The 40px law bends** | `DataTable`'s own comment: the expanded cell is *"the ONE cell in this table that may be taller"* — it is already an exception, and every open row is another one |
| **Two clicks, not one** | Read the expand → find a problem → still have to open the panel to act. The current design is one click to the panel |
| **It is not free to un-build** | Once operators learn to expand, removing it costs more than never adding it |

### 12.7.7 · What already exists, so nobody rebuilds it

**D0.5d shipped the whole mechanism on 2026-08-04** (`apps/web/src/components/kit/DataTable.tsx`):

```
group     AutoCount-style group headers   — Loo asked for it 2026-08-03, live on To Order
expand    `expanded` set + `expandable(row)` — the one cell allowed to exceed 40px
resize    drag the header edge; width comes from the RIGHT NEIGHBOUR, never the table
reorder   drag the header
footer    totals band
```

**This is wiring, not building.** A chat that proposes building an expander has not read the kit.

## 12.6 · Reported with the freeze, not built

- **The rail's five words are in no dictionary** — `Waiting Supplier Date` · `Waiting for
  Goods` · `Ready to Receive` · `Completed` · `Cancelled`. COPY-STANDARD rules FIVE Operation
  Status labels (`Issued` · `In Production` · `Receiving` · `Completed` · `Cancelled`) and
  says they are *the ONLY five*. Two vocabularies for one lifecycle. **Three of the rail's
  five have read 0 forever** and cannot move until goods are received.
- **`purchase_orders.sup_status` is `pending` on all 21.** `Pending` is a banned display word.
- **One sofa is split across two purchase orders** (`SO-1204` · `1207` · `1208` · `1211`), and
  nothing on the register can show that two PO numbers are one customer's one sofa.

---

# §13 · THE RECEIVING WORKSPACE — the four tiers, RULED 2026-08-05 by Loo (card Q12)

> **Read beside §12, never instead of it.** §12 is the Supplier Execution Register; §13 is the
> Receiving Workspace. They are the same SHAPE — list · expand · panel — and they answer
> different questions, and the whole point of putting them next to each other is that a chat
> can see which fact belongs to which.
>
> **This section is ARCHITECTURE only, by Loo's own split (2026-08-05):** *what the page is
> for, and which fact goes in the Row, the Expand, the Panel or the Form* is the Purchasing
> workflow's. **The Receiving Form itself — the DO number, the damage photos, the posting
> flow, the timeline — is the RECEIVING module's**, and nothing here designs it.

## 13.1 · Workspace mission

**Receiving is the Goods Custody Workspace.** It answers exactly one question:

> **Goods have turned up — what physically came, and does the record now match the floor?**

§12.1's register asks *where has the supplier got to*; §13 asks *what is in my hands*. The line
between them is `PURCHASING-WORKING-FLOW.md` §1's role-anchor rule, and after the 2026-08-05
ruling this workspace carries **exactly one action of the module: `Check in`.**

**What that ruling took OFF this page** — `Confirm tomorrow's delivery` and
`Confirm balance delivery date`. Both are phone calls to a factory about goods that have not
arrived, both are owned by the PO-duty holder, and both now live on Purchase Orders.

## 13.2 · The four tiers

**Loo's draft, confirmed with two corrections** — the corrections are marked and each carries
its evidence. The tier tests are §12.7.5's, reused deliberately: two workspaces of one module
may not sort facts by two different questions.

| Tier | The test it must pass | What lives there |
|---|---|---|
| **ROW** | *Is it ONE value for the whole PO, and does it help me decide whether to start on this one?* | supplier · PO No. · Supplier DO No. (once counted) · items preview · `Received n / m` · the queue's own state |
| **EXPAND** | *Is it a LINE-level fact I need to read across MANY purchase orders in one pass?* **READ-ONLY.** | per line: which item · `Ordered` · `Received` · **`Remaining`** · what is held or in exception |
| **RIGHT PANEL** | *Is it the RECORD of this PO's receiving — what has happened to it here?* | `Receiving Summary` · `Items` · `Exceptions` · `Activity`. **No Communication band** |
| **FORM** | *Is somebody writing what physically came?* **The one and only writing surface.** | Receiving Mode: `Supplier DO No.` · `Goods Received At` · `Signed DO photo` · `Receive now` per line · damage / wrong-item · `Save Receiving` |

### Correction 1 — the RIGHT PANEL takes NO Communication band

Loo's draft read *`RIGHT PANEL Summary · Timeline · Communication`*. **`Communication` is
struck**, and this is the one correction that would have re-created the defect Q12 was written
to close.

- Phase 3 froze it on 2026-08-03: **"Communication starts from the DOCUMENT"**, and the
  document is the purchase order. §12.7.5 puts Communication · Timeline · Files · Notes · Print
  in the REGISTER's Activity panel.
- After the role-anchor ruling, every action that talks to a supplier is Purchase Orders'. A
  Communication band on Receiving would be a second door to the supplier from the tab that,
  by the rule just written, does not talk to suppliers.
- **Measured 2026-08-05: Receiving has no Communication band today** — its pane holds
  `Receiving Summary` · `Items` · `Exceptions` · `Activity`. So this is a fence, not a repair:
  it stops one being added later on the strength of Loo's own draft line.

**`Activity` is not `Timeline` and the words are not interchangeable.** Receiving's `Activity`
is the receiving sessions and their events — what this workspace did. The register's `Timeline`
is what the supplier did. COPY-STANDARD already rules `No receiving activity yet.` for the
empty state, and it is deliberately not `Nothing received yet` (Jess, 2026-08-03).

### Correction 2 — the EXPAND must print `Remaining`, and today nothing does

Loo's draft asks for *Ordered / Received / Remaining*. Measured 2026-08-05: the panel's `Items`
block prints `Ordered` and `Received` and a `Total` row, and **prints no per-line remainder at
all** — a PO-level outstanding exists in `Receiving Summary`, but a line's is left as
subtraction.

COPY-STANDARD's own Receiving Workspace rule already forbids that: *"Outstanding is PRINTED,
not left as `5 − 3`. An operator should never subtract to learn what is still owed."* The rule
was written for the summary and the same reason binds the line. **The word is the one already
ruled — `Outstanding` — and `Remaining` is Loo's draft language for the same fact, not a
second word to add to the dictionary.**

*(Building it is the Receiving module's. §13 states the requirement; it does not draw it.)*

### Why an EXPAND is justified here at all

§12.7.4's frozen test — *build the expand when the operator must read a fact that lives on the
LINE, across MANY documents, in one pass* — and Receiving passes it for the same reason
Purchase Orders did, with a different fact:

```
"Which lines, across all my open POs, are still short?"
  → the row can only say `Received 12 / 35` for a whole PO
  → the panel can only answer for one PO at a time
```

**The expand is READ-ONLY here, and that is the difference from §12.** On Purchase Orders the
expand edits, because each fact there is ONE value the operator types or picks — a date, a
destination. On Receiving the writing is a FORM of several fields with a gate on it (a DO
number, a signed photo, a count per line), which is §12.7.5a's own third row: *a form of
SEVERAL fields → an explicit Save*. **That is why Receiving has a fourth tier and Purchase
Orders has three** — not because receiving is more important, but because its write cannot be
expressed as an inline field.

### The FORM is a MODE, not an overlay — and it is the ONE writing surface

Already shipped as `Read Mode → Start Receiving → Receiving Mode → Save → Posted` (Slice B,
2026-08-03). §12.7.5's **rule 3, ONE editing surface**, therefore holds on this workspace by
construction: the row reads, the expand reads, the panel reads, the form writes. Nothing else
on this tab may grow a write.

**`Start Receiving` is a PRIMARY ACTION and never a section** (COPY-STANDARD, locked
2026-08-03). It is not a fifth tier and it is not an action of the module — `Check in` is the
action; `Start Receiving` is the button that opens the surface that closes it.

## 13.3 · What the ruling does to `Current Action`

The `Current Action` column on Receiving could take exactly three values, computed in
`OperationReceiving.tsx` from the engine's open calls first and `Check in` second:

```
Confirm tomorrow's delivery        ← leaves: Purchase Orders' work
Confirm balance delivery date      ← leaves: Purchase Orders' work
Check in                           ← stays
```

**With the two calls gone the column has one possible value, and the queue the row is already
sitting in says it.** A column whose only content is the name of the list it is in carries no
information, and §12.3's own law applies: an action column may be empty, but a column that can
only ever say one thing is not an action column.

**This section does not delete the column** — that is a screen change and the Receiving module
owns the screen. It records what the boundary decided, so that whoever opens that page next is
not re-arguing it from the words.

## 13.4 · What §13 deliberately does NOT decide

1. **The Receiving Form's design** — fields, layout, gates, photos, posting. Loo's split.
2. **The queue model.** `To Receive` / `Goods Received` is **Jess's ruling of 2026-08-03** and
   it stands; **no `GRN` tab may ever be added**, because GRN is a DOCUMENT of Receiving.
   *(Measured 2026-08-05, and the carry-forward that raised it is out of date: the page already
   ships her two queues, and the four progress words — `Receiving issue` · `Partially received`
   · `In transit` · `Fully received` — are already demoted to a facet group inside the work
   queue, which is exactly what that carry-forward asked for.)*
3. **`To receive` and `In transit` are NOT merged.** Both read 21 today and they are different
   facts: a part-received PO leaves `In transit` and stays in `To receive`. Merging them on
   today's numbers would delete a distinction the first real delivery creates.
4. **`Check in` is not renamed.** Loo confirmed the word on 2026-08-05 and it already carries
   all five strings in COPY-STANDARD.

## 13.5 · The measured facts §13 rests on

| Fact | Measured |
|---|---|
| `warehouse_receipts` = **0** · `receiving_events` = **0** — no receiving has ever happened | 2026-08-05 |
| part-received lines = **0** · short lines = **0** · lines with any receipt = **0** of 35 | 2026-08-05 |
| purchase orders arriving tomorrow = **0**, so neither departing call fires today | 2026-08-05 |
| 21 purchase orders, all `open`; `supplier_claims` = **0** | 2026-08-05 |
| Receiving's pane holds Summary · Items · Exceptions · Activity — **no Communication band** | 2026-08-05 |
| the panel's `Items` block prints no per-line remainder | 2026-08-05 |

**Nobody has disproved any of this with use, and that is stated rather than hidden.** Every
queue on that page is uniform because nothing has ever arrived. §13 is therefore an
architecture ruling made BEFORE the first delivery — which is the right time to make it, and
the reason it must be revisited the week real goods start landing.
