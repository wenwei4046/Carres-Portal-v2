# 【WAREHOUSE】 — CARD 02 · Inventory works and tells the truth

> **Module:** Warehouse · **Sequence:** 02 · **Surface owned:** the Inventory Register's data
> path, the Warehouse surfaces' top-row chrome, the Unit Detail route, the register's banned
> words. **May not touch:** the register's column architecture (a later slice), Ready Stock
> eligibility actions, Counts, business rules, other modules' rows.
>
> Authority: `docs/stock/MASTER.md` §2 · §6 · §7 · §13 (owner-approved 2026-09-01, on main by
> PR #1044). Predecessor: CARD 01 (PR #1045, `d96cb87f`).

## The three measured defects this card closes

**1 · 🔴 The register API has answered 500 since birth — migration 0417.**
`GET /api/ops/stock/register` selects `site_name` and `holder_name` from
`stock_unit_register_v`; no migration ever gave the view either column (the route merged on
2026-08-21, its migration never landed — the inverse of red line 7). Measured live 2026-09-03:
`42703 column "site_name" does not exist` → 500 on every call; the Inventory page renders over
an error while production holds 136 real Units. **0417** rebuilds the view on 0373's exact
shape plus two governed-name joins (`warehouses.name` → Site, `stock_operating_parties.name` →
holder), with row-count, name-agreement, negative-control and anon-grant sanity checks.
*The apply is the governed production-migration step and awaits the owner's go.*

**2 · 🔴 A Unit's permanent address rendered the Dashboard.**
`/operation/stock/unit/:unitCode` had its Route but never joined `isUrlDriven`, so the URL fell
through to the `?tab=` branch — the exact defect class Edit Delivery documented ("a new route
joins BOTH lists in the same commit"). Measured live on `id-aam135002`. Fixed: the flag joins
the gate, and the slim bar stands down (Unit Detail draws its own Destination Header).

**3 · 🔴 Two top rows on every Warehouse surface.**
The Inventory Register, the two de-navigated legacy Stock pages and Unit Detail all draw their
own 50px Destination Header (ModuleHeader embeds TopBarIcons), and none was in the
GlobalTopBar suppression list — two Jump to, two bells, two gears on one screen, seen on the
CARD 01 walk. Fixed: `stock-onhand · stock-plan · movements · /operation/stock/unit` suppress
the slim bar; a control test pins that the dashboard keeps it.

**4 · Word law.** The rail group `Attention` / `Nothing needs attention` and the column
`Current attention` are the generic label the approved MASTER rejects by name; they now read
**`Needs checking`** / `Nothing needs checking`. Identifiers keep their names — a label is
copy, an identifier is a contract.

## Deliberately NOT this card

- The register's approved default columns (`Stock use · SO No · SO date · PO/Source No …`) and
  rail re-architecture (`STOCK / WHO HAS IT / OWNERSHIP / CONTROL` groups) — a later Inventory
  slice; they need new joins and their own walk.
- `Counts & Adjustments`, `Needs checking` full problem model, Ready Stock eligibility door —
  own cards (§6, §12.3-12.5).
- #1005's `next_movement_*` Schedule read model — superseded scope.
- The rail's `Changed: Today · This week · This month` chips — history-scope filters over past
  events; whether the stricter date law reaches them is a COPY-STANDARD question flagged, not
  taken in passing.

## Execution record

- Migration `0417_the_register_names_the_site_and_the_holder.sql` (repo tail 0416, tracker
  tail 0412, branch max 0416 → 0417). **The number then collided**: PR #1065 merged its own,
  already-applied `0417_the_partner_says_it_cannot_deliver` minutes after this card's PR —
  the 2026-08-24 race again, caught by the deploy gate. Both files are committed, so red
  line 6 forbids renaming either (a renumber PR was refused by the immutability check,
  correctly); the pair is BASELINED in `scripts/check-migrations.mjs` per that gate's own
  doctrine, with the measured applied/unapplied split recorded there. The register half's
  content is one idempotent `CREATE OR REPLACE VIEW`, order-independent of the partner half.
  #1005's draft 0410 likewise collides with main's own 0410 and must renumber on its own PR
  (it is unmerged, so renaming remains legal there).
- Code: `OperationApp.tsx` (`isStockUnitUrl` joins `isUrlDriven` + four suppression entries) ·
  `WarehouseStockRegister.tsx` (three word renames).
- Tests: `OperationApp.test.tsx` +6 (Unit route mounts · slim-bar stands down · three
  Warehouse suppressions · dashboard control) — the register/word tests ride the existing
  suites. Production proof: see the closing entry in `docs/stock/MASTER.md` §13.
