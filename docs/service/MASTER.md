# SERVICE — MASTER

> **The only Service document.** Overwritten when re-ruled; never versioned.
> **You read `CLAUDE.md` and this file.**

| I am working on | Read |
|---|---|
| anything | **§1** |
| filing a complaint | **§2 Intake** |
| the follow-ups | **§3** |
| the deadline | **§4** |
| the monthly numbers | **§5** |

---

# §1 · Overview

### MISSION
A customer has a problem **after** the goods were delivered. Take it, prove it, drive it to a
finish, and finish when the CUSTOMER says it is finished.

### WHAT IS ON SCREEN TODAY
`OperationServiceCases.tsx` **369 lines** · `OperationServiceNotes.tsx` **293 lines** ·
*measured 2026-08-05 from size, route and the shipped card records; **not read line by line.***
**Live: ONE case on file**, opened 2026-06-16, before the intake wizard existed.

### THE BOUNDARY THAT MATTERS
**A service case is NOT a supplier claim.** A claim is keyed to a PO LINE; a customer complaint
has no PO. **A fault found after receiving has no supplier-claim route at all today** — it is a
service case, and changing that means settling Stock's entry rule and the refurbish door in the
same change.

---

# §2 · Intake — no evidence, no case

### FROZEN RULES
- **The answer to *what is wrong* decides which photos the case cannot be filed without.**
  ONE shared checklist constant, **deliberately NOT mirrored in SQL** — it is a function of two
  answers plus per-slot counts, and a copy would drift rather than mirror.
- **A rule may name its REPORTERS.** A customer WhatsApp screenshot cannot exist when the
  WAREHOUSE found the fault, and **a required item nobody can produce teaches staff to upload a
  junk photo.** Every one of the 7 × 5 reporter/issue combinations is asserted satisfiable.
- **The gate is the SERVER'S**, recomputed from the same function the disabled button asks.
  The client is never trusted with the stamp, the file kind or the object key.
- **The database holds only what SQL can hold alone** — the stamp, and a floor strictly WEAKER
  than the API checklist.

# §3 · The follow-ups are DERIVED, not stored

### FROZEN RULES
- **The next steps are derived from question 5 of the intake**, so there is no task row to
  forget, delete, or leave pointing at an edited answer. **Only the OUTCOMES are stored** — the
  business date, stamped server-side with who recorded it.
- **Nothing here is a tick-box.** A step closes because a DATE exists.
- **The factory is resolved from the SKU at intake and snapshotted**, because zero purchase
  orders exist and `source_po` names nobody, while 200 of 205 SKUs carry a supplier.
- **Close is gated twice** — the API refuses with the open steps named, and a trigger refuses
  the TRANSITION into a closed status without a `customer_confirmed` entry. Already-closed cases
  stay editable, which is why the one live case survives.

# §4 · The deadline

### FROZEN RULES
- **14 WORKING days from the day it was reported, DERIVED and never stored.** No column can
  disagree with the rule, and a holiday-calendar correction fixes every case at once.
- **Four working days before it, the portal asks for ONE thing:** a call to the customer saying
  why it is taking longer, **with a reason picked from a locked list of seven.**
- **Every event names the deadline it was made ABOUT.** *"The customer has been told"* is only
  true about ONE deadline; without that field, moving the deadline would mark the new one as
  already explained.
- **Extend ONCE, bounded**, measured against the BASE deadline so it cannot be walked forward.
  A Sunday or holiday moves to the next working day BEFORE the bound is checked.
- **The reason list is deliberately NOT narrowed** to special-order parts — refusing every other
  true reason only gets the deadline moved under a false one.
- **The words are the laws', not the card's.** `At Risk` and `SLA` are banned, so the fact reads
  `4 working days left` / `2 working days late` and the action is the Call.

# §5 · The monthly numbers

### FROZEN RULES
- **No `closed_at` column, and it was REFUSED rather than deferred.** Closing already demands a
  `customer_confirmed` entry, and that entry carries the BUSINESS date the customer said it was
  solved. `closed_at` would record the afternoon somebody changed a dropdown; **the confirm date
  records the day the problem stopped**, which is the module's own law.
- **Every figure carries its coverage and withholds itself with a stated reason.** With one case
  on file an average would be invented and an on-time rate a coin toss.
- **Days are WORKING days**, so the average reads against the 14-working-day promise directly.
- **The delay reasons captured at §4 are READ here** — *why they ran long* needs no second
  tagging pass.

---

# §6 · Approved Evolution

| What | Why it is not built |
|---|---|
| **A service case raising a supplier claim** | Approved as the long-term architecture (Receiving and Service are two entrances to ONE claim engine, as SAP, Oracle and Dynamics all do it). **Blocked**: a claim is keyed to a PO line, and the entry rule plus the refurbish door must be settled together. |
| **`opened_at` becoming read-only after day one** | The deadline derives from it and the edit modal lets anyone change it, so moving `Opened` moves the deadline silently. Bounded today at one case. Approved fix: read-only, or log the change as an SLA event. |
| **A sweep for abandoned intake uploads** | Evidence uploads against a client-minted draft id land before the case exists — they must. An abandoned wizard orphans them. Approved fix is a `draft/` sweep, **not** a move-on-create: a mover adds a failure mode between *bytes uploaded* and *case filed*. |
