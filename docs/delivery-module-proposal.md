# Delivery module page — what T11 assembles

> **Rewritten 2026-07-27.** The 2026-07-22 version of this file was written before the
> T-series existed. Ten cards shipped since, and they answered most of what it proposed —
> often differently. Keeping both would have left two versions of the same module in the
> repo, so the superseded content is deleted rather than annotated.
>
> **T11 is the LAST card of line ①.** It is ASSEMBLY: every signal, queue, word, reason,
> profile and calendar it needs is already live. It invents nothing.

## Read these first — they outrank this file

| File | What it settles |
|---|---|
| `docs/ACTION-FLOW-STANDARD.md` | how actions are computed, when they appear, which shows first |
| `docs/COPY-STANDARD.md` | every visible word (the dictionary + the audit table) |
| `docs/UI-KIT.md` §8.3 | the shell, the module-tab law, the golden reference page |
| `docs/delivery-execution-queue.md` T1-T10 shipped notes | what already exists and must not be rebuilt |

## What T11 builds

**ONE new sidebar item — the only new menu item in the whole plan.** Everything else in
every line upgrades an existing door.

**A 3-pane module page**, the same shape as Purchasing and Orders (facet ~200 · list ~420 ·
detail fills the rest). This is the one part of the old proposal that survives intact,
because it is module discipline, not delivery logic.

**The panes read what already exists — no new state:**

| Pane | Fed by |
|---|---|
| Facet rail | the four live delivery queues + their auto-overdue deadlines (T7, `packages/shared/delivery-queue.ts`) |
| List rows | the same computed actions the Orders list shows (C2's Layer 1), so the two pages can never disagree |
| Detail | the booking (T1/D1), delivery groups (T8), the delivery rules of the logistics company (T9), the photo ledger (T6) |
| Calendar view | `bookingDayOf` (T10) — the ONE confirmed-vs-provisional rule; never a second store |

## Decisions the T-series already made (do not re-open)

- **Module name = `Delivery`.** The word `Logistics` names the company, not the module.
- **The queues are the four live ones**, not the old "To assign / In transit / POD queue":
  `Assign logistics` · `Confirm delivery date` · `Deliver today` · `Upload delivery photo`.
  `POD` is a banned word; there is no "in transit" state in our data.
- **Filter by logistics company** is a facet, not a second tab row (the old proposal's
  per-partner tabs assumed five carriers; there are eight).
- **Multi-leg** journeys already exist as `orders.delivery_stops` + `DeliveryChain.tsx`.
- **The money gate** is server-side and shared (`bookingConfirmGate`) — the page never
  re-implements it, and C5 must land before it can be trusted.

## Known gaps this page does NOT solve

They are recorded so nobody thinks the module hides them: logistics-side login and
driver-side photo upload (the third external role, R6's pattern), bulk import of a
carrier's delivery report, and the delivery scorecard per logistics company.

## Status

Prerequisite: everything in the drawer lane ahead of it (C5 → C1 → C2 → C3 → C6 → C7 → C8).
T11 goes last on purpose — assembling before the words and the action model are settled
would mean building the page twice.
