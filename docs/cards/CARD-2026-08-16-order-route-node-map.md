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
| 9 | Finance exception is the only money blocker | **nothing exists** — no table, RPC, route, permission or UI. Defined by the owner 2026-08-16 (§6 A1); **IMPLEMENTATION REQUIRED** | — |
| 12 | the system issues the DO when requirements are met | a person issues it; completion fact is `orders.do_number` existing | `packages/shared/src/work-engine.ts` (`issue_delivery_order`, owner = the order's PIC) |
| 6/7 | Loan never blocks DO or Delivery completion | already true for DO; **Card 8 derived completion currently keeps an open loan open** | `docs/orders/MASTER.md` Card 6/Card 8 records |

**Consequences a BUILD lane must handle, named here so nobody rediscovers them:**

- The **T−3 / T−2 / T−1 collection clock** (Card 4, `packages/shared/src/collection-clock.ts`) was
  justified by the DO door. **Owner ruling: keep the clock** (§6 A4). Its arithmetic does not change;
  only its stated reason does. Collection runs independently of the delivery.
- The **manager release lever** (`docs/orders/MASTER.md` §8 emergency override) exists solely to get
  past the money gate. With no money gate there is nothing to release, and rules 10/11 forbid the
  button. Its companion rule — **a release never forgives the money** — survives in full, because the
  storage waiver is a genuinely separate money act and stays manager-gated under Money In.
- **Rule 6/7 vs Card 8 — settled** (§6 A3). Loan blocks neither the DO nor Delivery completion, and
  an uncollected loan is still **amber outstanding work, never `No Action Required`**, closed only
  when **Stock records collection**. Card 8's derived completion is confirmed, not changed.
- **The Finance exception is a whole build, not a flag.** Record + RLS · Finance-only create/clear
  doors and their permission rule · the DO gate's read of it · its appearance on the Order Route as
  a blocking fact with its reason. None of it exists.

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

## 6 · Owner answers — ALL FOUR SETTLED 2026-08-16

Every question this card opened has been answered by the owner. **No unresolved owner decision
blocks a build.** What blocks it is that implementation is not yet approved (§8) — a different
thing, and the owner's own instruction.

**A1 · A Finance exception is an explicit, Finance-created record.** ✅ SETTLED

```
WHAT IT IS      an explicit record linked to the Sales Order
IT CARRIES      creator · reason · status · timestamps · clear evidence
WHO CREATES     Finance, and only Finance
WHO CLEARS      Finance, and only Finance
OPEN            blocks the DO gate
CLEARED         removes the block
```

It is the ONE money blocker. An outstanding balance of any size or age does not block; an
uncollected storage fee does not block. **It is a decision, never a derived state** — it may not be
computed from a balance, or the retired gate grows back under another word. Persisted in
`orders/MASTER.md` §8, which owns the gate; `payment/MASTER.md` §6 and `delivery/MASTER.md` §3 read
it and never write it.

**A2 · STOCK is a station inside the GOODS route, not a root-level track.** ✅ SETTLED

Root routes are exactly three: **GOODS · DELIVERY · MONEY.** LOAN is **conditional linked work, not
a fourth route.** This confirms the reading this card proposed; the superseded model's fourth
Layer-1 track is retired.

**A3 · An uncollected Loan is never `No Action Required`.** ✅ SETTLED

It remains **amber outstanding work** until **Stock records collection** — that is the completion
fact, and nothing else closes it. It still **blocks neither the DO nor Delivery completion**. This
confirms Card 8's derived completion rather than changing it: removing Loan from the blocking path
did not remove it from the completion test. `Delivered ≠ Complete`.

**A4 · The T−1 collection clock is kept.** ✅ SETTLED

Unchanged arithmetic; only its justification is retired. **A balance has a due date because it is
owed, not because it holds goods.** Collection work runs independently of the delivery, and money
is not a DO requirement unless an OPEN Finance exception exists.

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
✗ describing the Finance exception, system DO issuance or the canvas as implemented
✗ treating the Finance exception's absence as permission to keep the retired money gate
```

**All four owner questions are answered (§6). What is still missing is the owner's approval to
build, and that is the owner's call, not a gap in the specification.**

---

## 9 · Acceptance boundary for the later BUILD lane

When — and only when — the owner moves `IMPLEMENTATION` to `APPROVED`, the build slice is accepted
when:

1. One canvas renders with SO as the only root and no orphan node.
2. Goods, Delivery and Money leave the root simultaneously; **STOCK renders as a station inside the
   Goods route and never as a root branch.**
3. Loan renders only when a loan exists, as conditional linked work, with no edge into the DO gate
   or Delivery completion — **and an uncollected loan reads as amber outstanding work, never
   `No Action Required`, closing only when Stock records collection.**
4. DO, Deliver and Delivery Photo render as nodes in that order, after the gate.
5. No `status` field, no Overall Status node, no Release button, no Approve button, nothing tickable.
6. **The Finance exception exists as a real record** with creator, reason, status, timestamps and
   clear evidence; **only Finance can create or clear it**, enforced server-side, not merely in the
   UI. `OPEN` refuses the DO; `CLEARED` does not. An outstanding balance alone never refuses.
7. **The T−1 collection clock still runs**, and collection work is reachable and open on a delivered
   order that still owes.
8. Every carried-forward rule in §2 still holds, proven by the existing route tests passing
   unchanged where they are still applicable.
9. The full repository gate passes on the exact source, and the owner walks the surface in
   authenticated production — a green pipeline is never acceptance.
