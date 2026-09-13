# DELIVERY — CARD 21 · Retire the legacy warehouse pick application doors

BUILD/DELIVERY continuation · 2026-09-13.

Authority: the owner’s Delivery convergence request; Delivery MASTER Card 14 outstanding warehouse-pick defect; Stock MASTER exact Unit ownership; Orders MASTER SO Batch Purchase Ready Stock. Cards 19 and 20 are already owned by the parallel Delivery workspaces and are not duplicated here.

The legacy `warehouse` and `transfer-ready` API routes call `operation_warehouse_pick`, which can call `_operation_reserve_order` and attempts to write derived stock totals. Close both application doors with 410 and remove the drawer’s Transfer to ready act. Reservation remains with the governed Ready Stock journey and its exact Unit selection. No Unit, warehouse, order stage or stock total is changed by this retirement.

- [ ] API refusal tests including permission and no database calls
- [ ] Remove the obsolete drawer act
- [ ] Green CI, merge, exact-SHA deploy and authenticated refusal proof
- [ ] Database RPC retirement: separate reviewed SQL; not complete until tracker/all-branch maximum, rolled-back positive/negative probes and production application are verified

Migration: no database change in the application retirement PR. The existing RPC remains a separate outstanding database boundary; do not claim it is retired by HTTP refusal alone.
