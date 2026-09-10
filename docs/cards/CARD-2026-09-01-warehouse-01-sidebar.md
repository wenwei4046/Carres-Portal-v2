# 【WAREHOUSE】 — CARD 01 · Sidebar + four destinations

> **Module:** Warehouse · **Sequence:** 01 · **Surface owned:** the portal rail's Warehouse
> module rows and the Inventory destination word. **May not touch:** page bodies, routes,
> business rules, migrations, any other module's rows.
>
> Authority: the owner-approved 2026-09-01 Warehouse Blueprint — `docs/stock/MASTER.md` §2,
> `docs/ERP-ARCHITECTURE.md` §2.1 (Warehouse placement ruling), `docs/COPY-STANDARD.md`
> (`Inventory` unbanned for exactly this destination). Landed on main by PR #1044.

## What this card ships

The Warehouse module's complete approved map, from day one:

```
Warehouse
├── Dashboard      Coming soon
├── Inbound        Coming soon
├── Inventory      → /operation?tab=stock-onhand   (the Unit Register — live)
└── Outbound       Coming soon
```

- **`Inventory` renames the door, not the page.** The row keeps key `stock` and the
  `?tab=stock-onhand` address, so no bookmark and no active-indication logic moves. The
  register's own destination header, docTitle and export name say `Inventory`
  (`WarehouseStockRegister.tsx`) — the destination header prints the rail's own word.
- **The three unbuilt rows are `Coming soon` non-controls** — `<span>`, no href, out of the
  tab order, `aria-disabled`, excluded from Jump To. Each goes live in its own page's PR by
  dropping the flag; the rail never reshuffles after this card.
- **The collapsed 60px icon opens a NAMED destination** — `WAREHOUSE_LANDING_KEY = "stock"`
  (Inventory), the same law Purchasing follows. When Dashboard is built, that page's own
  approved scope may take the landing (Stock MASTER §7: the daily journey opens on Dashboard).
- **The superseded subtree leaves the rail**: `Stock · Ready stock · In & out · Transfers ·
  Counts` (owner ruling 2026-09-01 supersedes it by name).

## De-navigated, not deleted — the two legacy pages

`?tab=stock-plan` (Ready stock planning: reorder points K1, urgent restock K3, pool usage K4)
and `?tab=movements` (In & out event history) keep their routes and their `StockTabs` header
words. A direct URL still lands; the rail no longer offers them. Their capabilities await
relocation — reorder/replenishment belongs to Purchasing/Settings under the Blueprint
(replenishment is a Purchasing decision), and the movement history folds into Unit History /
Inventory. Those are their own scopes, recorded in Stock MASTER §13; this card does not decide
them. This is the same pattern `OperationStockOnHand` already follows (§13.4).

## Siblings this card supersedes on the nav surface

- **PR #1005 (DRAFT, `codex/warehouse-stock-p0-convergence`)** — its
  `Schedule · Inventory · Transfers · Counts` / no-Dashboard candidate was explicitly awaiting
  the owner-approved seam; this card is that seam. Its P0 findings stand and belong to
  CARD 02 (Inventory): the production `stock_unit_register_v.site_name` failure and the
  `/operation/stock/unit/:unitCode` deep-link fallthrough.
- **PR #860 (`build/warehouse-transfers`)** — Transfers as a fifth top page contradicts the
  approved model (Transfer projects into Outbound/Inbound/Inventory); its migration number is
  also stale. The custody-chain DB design remains useful input for the Outbound/Inbound cards.

## Build order after this card

CARD 02 Inventory (register repairs + rail views) → CARD 03 Inbound → CARD 04 Outbound →
CARD 05 Dashboard (a projection, so it is last). Counts & Adjustments, Needs checking and
Month-end are Inventory views with their own later cards.

## Execution record

- Code: `portal-nav.ts` (four rows, comment rewritten, `WAREHOUSE_LANDING_KEY` exported) ·
  `PortalSidebar.tsx` (named Warehouse landing) · `WarehouseStockRegister.tsx` (word
  `Inventory`) · `StockTabs.tsx` (legacy-header comment).
- Tests: `PortalSidebar.test.tsx` Warehouse block rewritten (map order · one live door ·
  three `Coming soon` non-controls · superseded rows absent · named collapsed landing) ·
  `WarehouseStockRegister.test.tsx` destination word · `JumpTo.test.tsx` destination label.
- Full web suite green at build time: 285 files / 3686 tests. PR/SHA and production proof:
  see the closing entry in `docs/stock/MASTER.md` §13.
