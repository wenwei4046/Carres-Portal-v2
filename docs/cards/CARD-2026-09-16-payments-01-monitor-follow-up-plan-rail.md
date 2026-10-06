# 【PAYMENTS】 — CARD 01 · Monitor left rail becomes the Monday–Friday follow-up plan

| | |
|---|---|
| Module | Payments |
| Sequence | 01 |
| Owner authority | Owner ruling 2026-09-16 (this chat) · `docs/payment/MASTER.md` §3 Payment Monitor · `docs/ui/MASTER.md` LOCAL FILTER RAIL (fixed header, collapse, Today ring / selected fill) · `docs/COPY-STANDARD.md` PAYMENTS → Monitor |
| Reuses | `FilterRail` / `FilterRailRow` + the governed collapse · Delivery Monitor's week arrows (`Previous week` / `Next week`) and its Today-ring / selected-fill law · `fmtDate` · the shared Work Engine feed (`/api/operation/work`) |
| Depends on | nothing new — the Work Engine already raises every collection item with its owner-working-day due date |
| Blocks | Payments CARD 02 — the right-hand listing aligned to Delivery's common register format |
| Migration | **none.** Presentation over existing reads. |

## What this Card owns

**Only the Payment Monitor's left rail and how a picked date narrows the existing listing.**
It does NOT touch the listing's columns, cells, sorting or actions, the collection workspace, the
collection clock, admission, owners, money arithmetic or any writer.

## The work

1. **Replace the seven rail filters and the summary sentences** with the Monday–Friday week:
   `‹ Mon, 14 Sep – Fri, 18 Sep ›`, `This week` when elsewhere, five day cards, then
   `All unpaid orders {n}`.
2. **One source — the shared Work Engine.** Day lines are the engine's collection items on their own
   `dueOn`: `payment.collect_customer_balance` → `Ask {n} customers to pay` ·
   `payment.missed_promise` → `Check {n} promised payments` · `payment.send_storage_invoice` →
   `Collect {n} storage payments`. Count = distinct orders per kind. Only items resolving to a
   Monitor row count, so the rail count and the listing are one set.
3. **Plan day.** Today when Operation works today (Mon–Fri, not a public holiday), else the next
   such day. Default pick = plan day. Only a working today wears the ring + `Today`.
4. **Earlier unfinished work** counts once on the plan day (`Includes {n} not done since {day}`);
   its own day says `{n} not done · counted under Today` and still lists those orders. No due date
   changes.
5. **States.** `No follow-up planned` · `Reading the collection desk…` · `The follow-up plan could
   not be loaded.` + `Try again` · Finance: `The follow-up plan is Operation's.` → `All unpaid orders`.
6. **Words wrap** in the 240px rail; collapsed rail repeats the picked day + lines in the sheet header.

## Acceptance

- Picking a day ⇒ listing = that day's orders, footer count equal to the day's orders.
- This week / previous / next week; Today; empty day; carried overdue (once); public holiday
  (16 Sep 2026 Malaysia Day); weekend; cover (avatar = cover, count unchanged); Finance.
- Desktop 1440 and narrow (390 drawer): no truncation, no clipped words, no sideways page scroll.
- Money, Payment timing, owners and rows are unchanged under `All unpaid orders`.
- Shared + web suites green; production walked on the deployed SHA.
