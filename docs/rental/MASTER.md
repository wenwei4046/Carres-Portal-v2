# RENTAL — MASTER

> **The only Rental document.** Overwritten when re-ruled; never versioned.
> **You read `CLAUDE.md` and this file.**

---

# §1 · Overview

### MISSION
Rent-to-own furniture: an agreement is signed, approved on credit, billed monthly, and can be
settled early.

### WHAT IS ON SCREEN TODAY
`OperationRental.tsx` **356 lines** · a POS Rent-to-Own lane · a Finance **Rental Approver** tab
· a Rental Setting tab under Admin. *Measured 2026-08-05 from file sizes and the shipped card
records; **pages not read line by line.***

**Live scale: ONE agreement (`RA-1003`), 0 Stripe subscriptions.** Almost every rule below is
therefore proved by test and by rolled-back production transactions, **not by daily use.**

---

# §2 · Frozen rules

### THE AGREEMENT
- **Rent and outright purchase may NEVER share one order.** The rule lives in ONE module that
  the rail lock, the add guard, the totals and the submit branch all ask, so they cannot drift.
  The guard sits in the single funnel all four add-doors pass through. **A both-kinds cart
  reports RENTAL — the safe answer.**
- **Qty is fixed at 1.** One rented item = one agreement + one subscription + one tracked asset.
- **The monthly fee and the CONTRACT TOTAL are shown together.** *"RM59"* without
  *"× 84 = RM4,956"* is how people mis-buy credit.
- **An agreement is BORN signed.** The POS captured a signature and threw it away, so credit was
  approved against a record that only claimed one. Approve now refuses an unsigned agreement.
- **The wording is stored as ordered blocks with immutable versions**, and the agreement records
  which version it was signed against.

### THE CREDIT GATE
- **An agreement is born `pending_approval` and NOTHING is materialised until finance approves.**
  Before this, the sell RPC wrote the full billing schedule, allocated the asset and minted the
  service entitlement in the same breath — so a REJECTED application would have held phantom
  receivables, a reserved asset and unearned visits.
- **The gate is finance + principal, deliberately NARROWER than "internal"** — that would admit
  BD, and a BD sells these.
- **Free win:** the Stripe checkout route already required `active`, so no card can be charged
  before approval with zero API changes.

### THE MONEY
- **The calendar is the signup payment plus the 7th of every month**, N payments for an N-month
  term, and **approve REFUSES a schedule that does not sum to the contract value.**
- **`rental_billings` has exactly ONE writer.** A collected month is undeletable.
- **Stripe cannot express the rule directly** — so the signup month is a one-time line item, a
  trial carries the gap, trial end BECOMES the anchor, and the schedule runs term − 1.
- **A bounced card is recorded as an EVENT, never as a second writer** of the billing row, and
  it is idempotent **on Stripe's EVENT id** — Smart Retries fire a genuinely new event per
  attempt, so three refusals are three rows while one event delivered thrice is one.
- **Late interest: ACCRUED is derived, CHARGED is stored.** Interest grows daily, so a stored
  figure is wrong tomorrow.
- **A discounted settlement is REFUSED with the real figure**, never allocated by guess — 49% of
  a customer's penalty belongs to the supplier.
- **Settlement goes THROUGH the payment RPC per month**, so the split and the one-writer law
  both hold and each month genuinely was paid.

### THE ORDER
- **A rental produces a Sales Order**, or operations never see it: the unit was allocated while
  nothing told a warehouse to deliver.
- **The line is priced ZERO on purpose.** A rental order is a FULFILMENT document; retail price
  would overstate AR and contract value would double-count the billing schedule.
- **Credit approval replaces the 50% deposit** in the proceed gate.

---

# §3 · Approved Evolution

| What | Why it is not built |
|---|---|
| **The dunning ladder (Day 3 / 7 / 21)** | **BLOCKED with a named cause: no message-sending integration exists anywhere in the API.** The rungs cannot be built until one does. |
| **Pushing the penalty onto a Stripe invoice** | Ledger half shipped. Blocked: 0 of 1 agreements has a subscription, so the invoice-item path is unverifiable. Key it to the event so a retry cannot double-bill. |
| **A discount policy for early settlement** | Undecided how it spreads across N months and two payees. **A guess would short the supplier.** |
| **The archived signed PDF** | The signature is captured; the rendered agreement PDF has no writer yet. |
| **Store-side reading of agreements** | Needs a dealer-scoped RLS read. |
| **Interest as "per month or part thereof"** | The harsher reading is a one-line change in BOTH the shared function and its SQL mirror. Now that a button exists, it is worth an explicit ruling. |
