# 【PAYMENTS】 — CARD 02 · The Monitor listing is Delivery's 72px listing with the eight approved columns

| | |
|---|---|
| Module | Payments |
| Sequence | 02 |
| Owner authority | Owner UI ruling 2026-09-16 (this chat) · `docs/payment/MASTER.md` §3 Payment Monitor · `docs/ui/MASTER.md` REGISTER TABLE DENSITY LAW (72px exceptions) · `docs/COPY-STANDARD.md` PAYMENTS → Monitor |
| Reuses | Delivery Monitor's DataGrid frame, `rowHeight={72}`, sticky identity, toolbar and footer · `monitorGoodsOf` · `ItemsServicesStockPanel` · `MonitorTwoLines` (`TwoLines` · `confirmedDeliveryLines`) · `requestedDeliveryText` · the collection workspace |
| Depends on | Payments CARD 01 (the Monday–Friday rail, #1389) — its day filter narrows this listing unchanged |
| Migration | **none.** One read gains two embeds (`ops_delivery_arrangements`, `ops_delivery_orders`) and two overlay columns. |

## What this Card owns

The Payment Monitor's right-hand listing, the way a row opens, and the one confirmed-delivery fact
Payment reads. It does not change the rail, money arithmetic, storage rules, posting, receipts,
templates, permissions or any writer.

## The work

1. **Eight columns, exact order:** `SO No · Customer · Amount needed · Items & Stock · Storage ·
   Requested Delivery Date · Confirmed Delivery · Payment timing`. `Goods` and `Customer delivery`
   are deleted, not renamed beside new ones.
2. **Delivery's listing:** fixed 72px parent rows, two lines per cell, `SO No` + `Customer`
   sticky (SO No alone below 768px), inner horizontal scroll, no decorative checkbox, a cut value
   opens whole by click or keyboard, the Finance frame is a fixed viewport so only the sheet scrolls.
3. **Items & Stock** is Delivery's own arithmetic (`monitorGoodsOf`, extracted unchanged from the
   Delivery Monitor) over the whole Sales Order; `Delivered` for a delivered order still owing;
   `Stock facts are Operation's.` for Finance.
4. **One confirmed-delivery fact.** `invoiceConfirmedDelivery` = Delivery's ladder for the customer
   leg (live DO → arrangement → booking overlay while `confirmed`). The Monitor, the workspace, the
   collection clock and the Work Engine read it. Before: Payment read `ops_order_control.confirmed_date`
   alone, which Delivery's `Save confirmed delivery` never writes.
5. **Payment timing line 2** = the shared Work item's own action + owner avatar; the item matching
   the printed fact wins when an order has two; no item ⇒ no action and no person (only `Wait`).
6. **A row opens below itself** (chevron `Show payment details`, the Items & Stock cell, the
   Storage cell) with the same collection workspace; Work's `?invoice=` opens that row; paid money
   keeps the full-page object.
7. **Stale owner hint cleared:** `Nobody holds Delivery Duty.` / `Staff & Duties` →
   `Not assigned` on the row, `Nobody is assigned to this order.` + `Assign it in Sales Orders →
   Team` in the workspace.
8. Overwrite Payment MASTER §3/§10/§16, COPY-STANDARD, UI MASTER exceptions, Delivery MASTER §8.3
   consequence line.

## Acceptance

- Header order exact; no retired/invented headings; `data-row-height=72`; no checkbox.
- Stock: ready · part ready (`2 of 3 · 1 short`) · reliable arrival · no purchase order · delivered.
- Dates: not confirmed · day only (`No time agreed`) · day and time · rescheduled (voided DO) ·
  request kept beside a different confirmed day · customer not sure.
- Money/timing: part paid · promised today · overdue · storage invoice (`includes storage`).
- Storage: all six states on two lines, cell opens the Storage section, nothing edited in the cell.
- Owner: normal · cover · not assigned; two items on one order.
- Long name + two references; sticky identity; inner scroll; 1440 · 1366 · 200% zoom · 390 phone:
  every row 72px, ≤ 2 lines, no page sideways scroll (`docs/evidence/payment-monitor-listing/`).
- Picked day, filters, scroll and row place kept when a row opens; saved money refreshes the list.
- Shared + web suites green; production walked read-only on the deployed SHA.
