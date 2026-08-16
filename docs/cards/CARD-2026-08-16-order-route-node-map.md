# CARD — ORDER ROUTE NODE MAP CANVAS

```
STATUS:          QUEUED
IMPLEMENTATION:  NOT APPROVED
OWNER RULING:    2026-08-16
LANE:            DOCUMENTATION ONLY — no application code authorised by this card
MODULE:          Sales Orders (docs/orders/MASTER.md)
```

> **This card does not authorise a single line of application code.** It records an
> owner-approved business/presentation direction and the work that direction implies, so that a
> later BUILD/DELIVERY takeover has a written boundary. `IMPLEMENTATION: NOT APPROVED` stays until
> the owner explicitly moves it.

---

## 1 · What the owner approved, 2026-08-16

Verbatim, in the owner's own order:

```
1   one Node Map Canvas, not stacked section cards
2   SO is the only root
3   Goods, Delivery, and Money start simultaneously
4   Loan appears only when a loan exists
5   Loan is not a fourth main track
6   Loan never blocks DO
7   Loan never blocks Delivery completion
8   outstanding money does not block DO
9   Finance exception is the only money blocker
10  no Release button
11  no Approve button
12  the system issues the DO when requirements are met
13  Deliver and Delivery Photo appear after the DO gate
14  no Overall Status
```

Rules 1–5, 13 and 14 are **presentation/architecture** of a read-only surface.
Rules 6–9 and 12 are **business rule changes** with runtime consequences (§4).
Rules 10 and 11 are **already true** in the current implementation and are now locked (§5).

---

## 2 · What this replaces

`docs/orders/MASTER.md` — `ORDER ROUTE — TWO LAYERS OF FACT · OWNER FINAL RULING 2026-08-15 ·
APPROVED / LOCKED` is superseded by the 2026-08-16 ruling. The superseded section is preserved in
that MASTER as a historical record under the MASTER OVERWRITE LAW's history clause: the obsolete
text no longer states current truth, and it is labelled as such rather than deleted, because its
station anatomy, scenario matrix and evidence rules were carried forward unchanged.

**Carried forward from the superseded ruling, unchanged and still binding:**

- The route is read-only, derived only from authoritative facts, and gains no writer.
- Station anatomy: a `✓` costs a document number, its labelled date and an explicit door;
  a `○` is written in primary-school English and never `PO: —`; a `⚠` always carries its reason.
- Dates carry their meaning label and are spelled through the one date format.
- `CURRENT` is the registered word; `YOU ARE HERE` stays withdrawn.
- The destination fork's honest boundary — a consolidated PO does not prove a PO-line-to-SO-line
  allocation, and the route may not distribute another Sales Order's quantity by inference.
- The scenario matrix (ready stock · supplier direct · split quantity · partial receiving ·
  multiple destinations · service lines · replacement · cancelled line · amended line ·
  delivered quantity).
- The Object Header owns the identity; the route never repeats SO number or customer name.
- Every colour, size, spacing and component is the Carres UI Kit.

---

## 3 · The approved shape

```
                                  ┌──────────┐
                                  │    SO    │   the only root
                                  └────┬─────┘
                 ┌────────────────────┼────────────────────┐
                 │                    │                    │
            ┌────▼────┐          ┌────▼────┐          ┌────▼────┐
            │  GOODS  │          │DELIVERY │          │  MONEY  │
            └────┬────┘          └────┬────┘          └─────────┘
                 │                    │
        one branch per goods          │
        line, forking by              │
        qty / source / destination    │
                 │                    │
                 └────────┬───────────┘
                          │
                    ┌─────▼─────┐
                    │  DO GATE  │  system-issued when requirements are met
                    └─────┬─────┘
                          │
                    ┌─────▼─────┐
                    │  DELIVER  │
                    └─────┬─────┘
                          │
                    ┌─────▼──────────┐
                    │ DELIVERY PHOTO │
                    └────────────────┘

            ┌──────┐
            │ LOAN │  rendered ONLY when a loan exists.
            └──────┘  Not a fourth main track. Blocks nothing.
```

- **One canvas.** Not four stacked bordered section cards.
- **SO is the only root.** Every other node descends from it. There is no second entry point and
  no node that floats unattached.
- **Goods, Delivery and Money leave the root together.** They are simultaneous, not sequential.
- **Goods and Delivery converge on the DO gate.** Money does not: under rule 8 it no longer gates.
- **Loan** renders only when a loan obligation exists, hangs off the SO root, and has no edge into
  the DO gate or into Delivery completion.
- **No Overall Status node** anywhere on the canvas, and no `status` field on the resolved route.

---

## 4 · Business rule changes — the runtime gap this card creates

**These four rules contradict shipped, tested, production-verified behaviour.** The documentation
is reconciled by this card's PR; the code is not, and this card does not authorise changing it.

| # | Approved rule | What runs today | Evidence |
|---|---|---|---|
| 8 | outstanding money does not block DO | `gate.balanceReady` refuses DO issuance while money is owed | `packages/shared/src/delivery-order.ts` (`deliveryOrderIssueGate`) |
| 9 | Finance exception is the only money blocker | no such concept exists anywhere in the repository | — |
| 12 | the system issues the DO when requirements are met | a person issues it; completion fact is `orders.do_number` existing | `packages/shared/src/work-engine.ts` (`issue_delivery_order`, owner = the order's PIC) |
| 6/7 | Loan never blocks DO or Delivery completion | already true for DO; **Card 8 derived completion currently keeps an open loan open** | `docs/orders/MASTER.md` Card 6/Card 8 records |

**Consequences a BUILD lane must handle, named here so nobody rediscovers them:**

- The **T−3 / T−2 / T−1 collection clock** (Card 4, `packages/shared/src/collection-clock.ts`) exists
  because "logistics ask for the DO the evening before and the DO door refuses while money holds".
  Remove the money gate and the clock's stated reason for its T−1 deadline no longer holds. The
  clock itself may still be wanted as a collection deadline — that is a separate owner decision, not
  an engineering one.
- The **manager release lever** (`docs/orders/MASTER.md` §8 emergency override) exists solely to get
  past the money gate. With no money gate there is nothing to release. Its companion rule —
  **a release never forgives the money** — must survive in whatever replaces it, because the storage
  waiver is a genuinely separate money act.
- **Rule 6/7 vs Card 8.** Card 8's derived completion reads an open `ops_sofa_loans` row and keeps
  the whole SO open. Rules 6 and 7 say Loan blocks neither DO nor *Delivery completion*. Whether an
  open loan still blocks **`No Action Required`** (the whole-SO derived result, which is not delivery
  completion) is **not settled by the owner's wording**. This card reads it as: Loan still keeps
  `No Action Required` open, because recovering a loan unit is real outstanding work. See §6.

---

## 5 · Already true — now locked, not new work

- **No Release button.** The Order Route's only control is `Open Delivery →`. `delivery/MASTER.md`
  §15 already bans the word `Release` in employee Delivery UI in favour of `Issue Delivery Order`;
  rule 10 is consistent with that dictionary entry and does not change it.
- **No Approve button.** None exists on the route.
- **No Overall Status.** `SalesOrderRoute` carries no `status` field, and the Register carries no
  combined status column.
- **Deliver and Delivery Photo follow the DO.** `work-engine.ts` already orders
  `issue_delivery_order → deliver_today → upload_delivery_photo`. Rule 13 confirms the order; what
  is missing is that the route does not yet **render** those three as nodes (§6).

---

## 6 · Open questions — OWNER DECISION REQUIRED before implementation

These cannot be resolved from authority, code or ordinary engineering judgment. Each would change
how Carres operates if answered differently.

**Q1 · What IS a Finance exception?** 🔴 **BLOCKING**

Rule 9 makes it the only money blocker, but the term appears nowhere in the repository. To be built
it needs four answers: **who raises it · what record it is · who clears it · what its completion
evidence is.** Until then rule 9 states what does *not* block without naming what does, and no gate
can be written.

**Q2 · Does STOCK survive as a main track?**

The superseded ruling had four Layer-1 tracks: `GOODS · STOCK · DELIVERY · MONEY`. Rule 3 names
three, and rule 5's word *"fourth"* only parses if there are exactly three mains. This card
therefore reads STOCK as **folded into the Goods branch as a station**, which is where its facts
already sit (`Units not created yet`). **If the owner intended STOCK to remain a root-level branch,
say so and this card is corrected.**

**Q3 · Does an open Loan still hold `No Action Required`?**

See §4. This card's reading is **yes** — Loan does not block DO or delivery, but an unrecovered loan
unit is outstanding work and the SO is not finished. Confirm or reverse.

**Q4 · Does the collection clock survive without the money gate?**

See §4. Recommendation: **keep it** as a collection deadline in its own right; a balance still has a
due date even when it stops holding goods. Owner confirms.

---

## 7 · Documentation reconciled by this card's PR

| File | What changed |
|---|---|
| `docs/orders/MASTER.md` | New 2026-08-16 Node Map ruling; the 2026-08-15 two-layer ruling marked SUPERSEDED and preserved; §8 money gate marked superseded; the stale five-lane/Loan text in the Order Route production record corrected |
| `docs/delivery/MASTER.md` | `Issue Delivery Order is the only employee act` reconciled with system issuance; the `Release` dictionary ban left untouched |
| `docs/payment/MASTER.md` | §6 `issuing the DO is the hard gate` and the manager-release lever reconciled; Payment's ownership of the one outstanding arithmetic untouched |

**Preserved, not deleted:** every production record, PR number, merged SHA, migration number and
authenticated-acceptance result. Superseded rules are labelled, never removed.

---

## 8 · Boundary — what this card forbids

```
✗ any change under apps/ or packages/
✗ any database migration
✗ any change to ERP runtime behaviour
✗ promoting this card to APPROVED without an owner ruling
✗ answering Q1–Q4 by engineering judgment
✗ building the canvas before Q1 and Q2 are answered
```

---

## 9 · Acceptance boundary for the later BUILD lane

When — and only when — the owner moves `IMPLEMENTATION` to `APPROVED` and answers Q1–Q4, the build
slice is accepted when:

1. One canvas renders with SO as the only root and no orphan node.
2. Goods, Delivery and Money leave the root simultaneously.
3. Loan renders only when a loan exists, with no edge into the DO gate or Delivery completion.
4. DO, Deliver and Delivery Photo render as nodes in that order, after the gate.
5. No `status` field, no Overall Status node, no Release button, no Approve button, nothing tickable.
6. Every carried-forward rule in §2 still holds, proven by the existing route tests passing
   unchanged where they are still applicable.
7. The full repository gate passes on the exact source, and the owner walks the surface in
   authenticated production — a green pipeline is never acceptance.
