STATUS: EXECUTED
IMPLEMENTATION: APPROVED — owner wrote IMPLEMENT 2026-08-17; delivered and production-verified same day
SUPERSEDES: decision B in the executed node-map implementation (PR #825)
DATE: 2026-08-16
OWNER RULING: decision A, 2026-08-16
PRS: #829 (0355, Slice 1) · #830 (Slice 3, one slice across gate + engine + canvas + API) · #831 (stale copy found by the walk)
ACCEPTANCE: authenticated production walk PASSED 2026-08-17 on SO-1321 (DO-170826-5050 issued over RM 1,500 owing; Finance exception refused, cleared, released) — full record in docs/orders/MASTER.md §8

# MONEY GATE CORRECTION — the balance stops holding the door

> **This card does not authorise a single line of application code.** It records the correction the
> owner ruled AFTER the node map shipped, so a later BUILD/DELIVERY takeover has a written boundary.
> `IMPLEMENTATION: NOT APPROVED` stays until the owner explicitly moves it.

---

## 1 · Why this card exists

The node map was designed, approved, built and merged as **PR #825** while a parallel documentation
branch was open. During that build the money question was put to the owner and answered as
**decision B — money stays a gate requirement**, because the Finance exception the design card named
did not exist and inventing one was correctly refused.

**On 2026-08-16 the owner defined the Finance exception and ruled decision A.** Decision B is
therefore superseded — not overruled on its reasoning, but answered: the objection was *"the
mechanism does not exist"*, and the owner has now specified it.

**PR #825's card stays `EXECUTED / APPROVED` and is not touched by this card.** It is the historical
truth of what was built and why. This card corrects one rule inside it.

---

## 2 · The ruling

```
outstanding money does not block the DO
an OPEN Finance exception is the ONLY money blocker
OPEN     blocks the DO gate
CLEARED  removes the block
the exception is an explicit Finance-owned record, never a derived balance state
```

**`Finance exception` — owner definition, 2026-08-16:**

```
WHAT IT IS      an explicit record, linked to the Sales Order
IT CARRIES      creator · reason · status · timestamps · clear evidence
WHO CREATES     Finance, and only Finance
WHO CLEARS      Finance, and only Finance
```

An outstanding balance — of any size, of any age — does not block. An uncollected storage fee does
not block. **Only an OPEN Finance exception blocks.**

**It is a decision, never a derived state.** It may not be computed from a balance, or the gate this
ruling removes grows straight back under another word. Persisted in `docs/orders/MASTER.md` §8,
which owns the gate; `payment/MASTER.md` §6 and `delivery/MASTER.md` §3 read it and never write it.

---

## 3 · What the shipped implementation got RIGHT — keep all of it

Owner assessment, 2026-08-16. **None of this is reopened by this card.**

```
✅ the node map itself                    KEEP
✅ GOODS / DELIVERY / MONEY root branches  KEEP
✅ STOCK as a station inside GOODS         KEEP
✅ conditional LOAN branch                 KEEP
✅ no Release button, no Approve button    KEEP — already correct
✅ Deliver and Delivery Photo after the DO gate   KEEP
✅ the six-slot owner mapping              KEEP — it fixed a real defect
```

The LOAN rules shipped in PR #825 already match the owner's answers exactly: it never joins the
gate, never blocks delivery completion, and an uncollected loan keeps the obligation open for
Card 8's derived completion, reading `Loan not collected back` after delivery. **Nothing to correct.**

---

## 4 · What is WRONG or MISSING — the correction scope

| # | Item | Current state | Evidence |
|---|---|---|---|
| 1 | **Finance exception record** | **does not exist** — no table, RPC, route, permission or UI | no `finance exception` concept in `packages/shared/src`, `apps/api/src`, `apps/web/src` |
| 2 | **Money in the DO gate** | still a requirement — **incorrect** | `GateRequirementId` includes `"money"`; `deliveryOrderIssueGate` refuses on `balanceReady`; `order-actions.ts` `deliveryHeldOnMoney` withholds `issue_delivery_order` |
| 3 | **Automatic DO issuance** | **documented but not implemented** — a person still issues it | `work-engine.ts` `issue_delivery_order`: owner = *"the order's PIC"*, trigger includes *"money passed"* |

---

## 5 · ⭐ THE CONSTRAINT THAT GOVERNS THE FIX — Architecture Law D

**The screen and the server move in the SAME slice, or the gate lies in the other direction.**

This is the exact objection decision B raised, and it survives decision A intact. If the canvas
stops counting money while `deliveryOrderIssueGate` and `deliveryHeldOnMoney` still refuse on it,
the operator reads `all requirements met` on a DO the server will not issue. **That is the same
defect PR #825 refused to ship, pointing the other way.**

```
FORBIDDEN   removing the money requirement from the canvas alone
FORBIDDEN   removing it from the gate while deliveryHeldOnMoney still withholds the action
REQUIRED    one slice: gate + action engine + canvas + the Finance exception it replaces with
```

**A gate with no blocker at all is not an acceptable intermediate state.** Money leaves only when
the Finance exception arrives to take its place — otherwise the correction ships an ungated DO,
which nobody approved.

---

## 6 · Boundary — what this card forbids

```
✗ any change under apps/ or packages/
✗ any database migration
✗ any change to ERP runtime behaviour
✗ editing, downgrading or re-dating CARD-2026-08-16-order-route-node-map.md
✗ describing the Finance exception or automatic DO issuance as implemented
✗ treating the exception's absence as permission to keep the retired money requirement
✗ shipping the money removal and the Finance exception in separate slices
```

---

## 7 · Acceptance boundary for the later BUILD lane

When — and only when — the owner moves `IMPLEMENTATION` to `APPROVED`:

1. **The Finance exception exists as a real record** with creator, reason, status, timestamps and
   clear evidence, and `clear evidence` is required, not optional.
2. **Only Finance can create or clear it — enforced server-side**, in RLS and at the API boundary,
   not merely hidden in the UI. A non-Finance role is refused by the database.
3. **`OPEN` refuses the DO; `CLEARED` does not.** An outstanding balance alone never refuses, at any
   amount or age; an uncollected storage fee never refuses.
4. **It is not derivable.** No code path computes an exception from a balance, and no reader infers
   one. One record, one owner (Law A); one door, never a duplicate (Law C).
5. **Gate, action engine and canvas agree** — `deliveryOrderIssueGate`, `deliveryHeldOnMoney` and
   the canvas gate ask the same predicate and cannot disagree (Law D).
6. **The system issues the DO** when every requirement is met, with no Release button, no Approve
   button and no manual bypass in any state.
7. **A release never forgives money.** The collect action still survives delivery; a delivered order
   that still owes keeps its action and its red dot. The waiver stays a separate, manager-gated
   money act under Money In.
8. **The T−1 collection clock still runs**, unchanged, and collection work is reachable and open on
   a delivered order that still owes.
9. The full repository gate passes on the exact source, and **the owner walks it in authenticated
   production** — a green pipeline is never acceptance.
