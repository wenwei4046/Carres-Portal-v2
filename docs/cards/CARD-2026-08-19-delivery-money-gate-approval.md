STATUS: EXECUTED — built, tested, 0362 probed on production in a rolled-back
        transaction (7 probes, all negative controls fired); owner walk owed
DATE: 2026-08-19
PR: #855
IMPLEMENTATION: APPROVED — Jess ruled the complete package with the planner
2026-08-19, triggered by a real incident the same day (goods delivered with
money uncollected and no approval).

# DELIVERY MONEY GATE + OWNER APPROVAL + COD — one card

**SCOPE — the DO money gate, the payment-approval door, the collection clock,
the DO document's COD instruction, and one manual `Request Delivery Order`
door. NOTHING ELSE.** This card may not touch the warehouse handover chain,
the NETS portal, the sidebar (its own card), Delivery Work, or any Purchasing
page.

Read `CLAUDE.md`, `docs/orders/MASTER.md` §8 (the gate it corrects),
`docs/payment/MASTER.md` (the collection clock), `docs/delivery/MASTER.md` §3,
`docs/COPY-STANDARD.md`, on the LATEST `origin/main`. Execute as CONTINUOUS
BUILD: implement → tests → release gate → PR → CI → merge → deploy → prove SHA
→ overwrite the owning MASTERs in the same PRs. **If code structure conflicts
with this card, STOP and report — do not choose.**

## 0 · The ruling this card lands (Jess, 2026-08-19 — SUPERSEDES 2026-08-16)

The 2026-08-16 ruling *"outstanding money never blocks the DO; an OPEN Finance
exception is the only money blocker"* is **REVERSED by the owner on new
evidence**: on 2026-08-19 an order was delivered with money uncollected and no
approval — exactly the exposure the old rule permitted. The owner's SOP is:

```
Money in full BEFORE delivery. That is the only default.
Operation cannot proceed on its own word. The exception is a recorded
approval — black and white in the system, never verbal.
```

The Finance exception record (migration 0355) is NOT retired: an OPEN
exception still blocks regardless of payment. It becomes the second blocker,
not the only one.

## 1 · The money gate

A Delivery Order issues only when, for the trip's Sales Order:

```
outstanding = 0
OR an APPROVED Delivery Payment Approval covers the order
AND no OPEN Finance exception
```

Everything else about issuance is unchanged and stays LOCKED: **the system
issues the DO when its requirements are met** — customer-confirmed date +
time slot, goods Ready/Reserved for the trip's scope, and now this money
gate. No Issue, Release or Approve button exists on the DO path, anywhere.
Paid alone never issues a DO — the date and goods gates still hold (owner
re-confirmed 2026-08-19: "已付清也要有 ETA 才发 DO").

## 2 · The Delivery Payment Approval (the black-and-white door)

One new append-only record owned by Sales Orders (beside the Finance
exception it mirrors):

- **Raise** — Operation or the salesperson raises a request on the order:
  reason required, requester + time recorded. Raising changes nothing else.
- **Approve / Refuse** — **the approver today is Jess ONLY.** The approver
  list is data (settings-maintained), so managers can join later without a
  code change. The decision records approver, time and reason, append-only.
- An APPROVED record opens the money gate for that order's DOs. A REFUSED or
  pending request keeps it shut.
- Nobody else may create, edit or delete a decision; deletion refused by
  trigger, same pattern as 0355.

## 3 · What an approval means — COD, defined by the owner

An approval authorizes **COD on these exact terms** (owner's words,
2026-08-19):

```
1. Goods load and travel to the customer's house.
2. The customer may SEE the goods first — on the truck, before unloading.
3. BEFORE the driver takes the goods down: the customer pays the full
   balance by ONLINE TRANSFER. No cash.
4. Transfer confirmed → unload and hand over.
   Not paid → the goods do not come down; the trip returns.
```

Purpose: the customer can never hold the goods hostage — "fix the problem
first, then I pay" — after installation.

**The DO document prints the instruction** when issued under an approval:
`COLLECT RM {amount} BY ONLINE TRANSFER BEFORE UNLOADING — NO CASH.`
The string joins `COPY-STANDARD.md` in the same PR.

## 4 · The collection clock moves to T−2

Current law (`packages/shared/src/collection-clock.ts`, Payment MASTER):
T−3/T−2 attention, **T−1 deadline**. The owner ruled the deadline is one day
too late: logistics takes the DO at T−1, so the money must already be settled
before that day.

```
T−3  attention — chase begins
T−2  DEADLINE — money in full (or the approval request is already raised)
T−1  logistics takes the DO; the trip is scheduled
T    delivery
```

Same calendar (Mon–Sat + Malaysian public holidays), same anchor
(customer-confirmed date, else promised date), same no-anchor-no-clock rule.
Only the deadline day changes: `delivery − 2 working days`. Both consumers
(collections desk, Work engine dues) follow automatically because there is
one arithmetic.

## 5 · The manual door — `Request Delivery Order`

For outstation trips the partner schedules the customer, so the DO is needed
BEFORE a confirmed booking exists. One manual door, governed:

- `Request Delivery Order` walks **the SAME single issuing path** with the
  SAME gates — goods Ready/Reserved + money gate + no OPEN Finance exception
  — merely without waiting for the booking-confirm trigger.
- It is never a free-form create: no editable customer, goods, price or
  number. If a gate fails, the door refuses and names the gate.
- The request and the issuance are recorded like every other issue event.

## 6 · The MASTERs say what shipped — same PRs, MASTER OVERWRITE LAW

- `orders/MASTER.md` §8: the 2026-08-16 money paragraph is DELETED and
  rewritten with §§1–3 above; the superseded-ruling table row gains this
  reversal with its evidence.
- `payment/MASTER.md`: the clock paragraph rewritten to T−2 (§4).
- `delivery/MASTER.md` §3: the sentence "outstanding money no longer blocks
  the DO…" rewritten to point at the new §8 law.
- `COPY-STANDARD.md`: the COD instruction string, the door label
  `Request Delivery Order`, and the approval strings register.

## STILL LOCKED — do not touch

System issuance (no button) · the ONE issuing path and `docNumber` scheme ·
derived DO status (`deliveryOrderStatusOf`) · rebooked trip = new document ·
the void door and its two reasons · the Finance exception record and its
Finance-only ownership · the DO register's eight columns · the Order Route.

## MIGRATIONS

Manual Purchase holds 0359–0361. **Number from the MAX of the tracker tail,
the repository tail and every branch at build time — never from `ls`.**

## TESTS AND DEPLOY — MANDATORY, EVERY SLICE

- A DO cannot issue while outstanding > 0 and no APPROVED approval exists —
  asserted at the database door, not only the UI.
- An OPEN Finance exception blocks even a fully-paid order (unchanged).
- Raising a request changes no gate; APPROVED opens it; REFUSED keeps it
  shut; decisions are append-only and refuse deletion.
- Only the configured approver (today: Jess) can decide; others get a
  permission refusal.
- The clock: an order anchored on Friday has its deadline on Wednesday
  (Mon–Sat week), attention Tuesday; public-holiday skip proven.
- A DO issued under approval renders the COD instruction on the document;
  a paid order's DO renders no COD line.
- `Request Delivery Order` issues through the same path (same number scheme,
  same history event) and refuses with the failing gate named.
- Authenticated production walk: one owing order blocked → request raised →
  Jess approves → DO appears with the COD line → clock shows T−2.

## Acceptance boundary

Authenticated production verification of the walk above, screenshots attached
to the PR, MASTERs overwritten in the same PRs. Report SHA convergence.
