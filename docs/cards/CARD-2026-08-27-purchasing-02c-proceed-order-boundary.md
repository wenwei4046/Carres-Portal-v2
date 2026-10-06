# PURCHASING — CARD 02-C (pre-build correction) · THE PROCEEDED-ORDER BOUNDARY

**Card path:** `docs/cards/CARD-2026-08-27-purchasing-02c-proceed-order-boundary.md`
**Module:** Purchasing
**Page:** SO Batch Purchase
**Sequence:** 02-C — mandatory correction BEFORE the Product/Supplier rail work
**Status:** COMPLETE — production-verified 2026-08-27
**Lane:** BUILD / DELIVERY
**Depends on:** production-verified Card 02-B

## Authority classification

**RESOLVED FROM AUTHORITY, 2026-08-27.** A Sales Order enters SO Batch Purchase only after Sales
has completed `Proceed`, making its status `proceed_order`. Production evidence proved the page
was mixing two scopes: `data.rows` (and therefore planning, netting and every rail count) read
`place` and `proceed_order`, while `registerRows` read `proceed_order` only — so the left rail
counted orders Purchasing could not see or legitimately buy.

## The correction

1. `place` orders must not enter SO Batch Purchase planning, netting, rail counts, Register
   filtering, selection or PO issuance.
2. They are filtered BEFORE netting, so they cannot consume Open PO coverage ahead of proceeded
   orders.
3. `POST /issue-batch` rechecks that every source SO is still `proceed_order` — the POST-time
   recomputation runs through the same one boundary read, so a demand naming a `place` order
   resolves to nothing and is refused by name with zero POs created.
4. Ready Stock reservation (`POST /take-stock`) rejects a `place` order the same way — absent
   from the recomputation IS the refusal, with zero units drawn.
5. `All not ordered` and the timing facets combine with AND, never OR.
6. Regressions prove: zero rail contribution · no Register row · no Open PO coverage consumption
   · issuance refused with zero POs · reservation refused with zero draws · AND-combined filters.
7. All later Product and Supplier rail counts draw from this same proceeded-SO population,
   because there is only one order read (`loadToOrder`) and it now carries the boundary.

**One proceeded-order boundary governs read, calculation and every write door** — the SQL narrows
at `apps/api/src/lib/purchase-demand-read.ts`, a code-level guard keeps the rule true under any
permissive read, and both write doors recompute through it at POST time. The displayed count was
not patched; the population was.

---

## Completion evidence — 2026-08-27

- **PR:** [#941](https://github.com/wenwei4046/Carres-Portal-v2/pull/941), merged to `main` as
  `1b109ecd111462addc9bc71a9950753d3ca6f591`; CI `verify` green. No migration (403 filenames
  validated, 0 changes). `scripts/verify-production.mjs` converged all five governed surfaces on
  the exact merge SHA.
- **The boundary:** `loadToOrder` reads `orders … .eq("status", "proceed_order")` and re-filters
  in code, before the engine sees a line — planning, netting, rail counts, Register, selection,
  `take-stock` and `issue-batch` all inherit it from the one read.
- **The six commissioned regressions, green:** a `place` order contributes zero leaf rows (the
  population every rail count draws from) · has no Register row · cannot consume Open PO
  coverage (one contested open unit lands on the proceeded order and its leaf leaves the buying
  listing) · direct issuance refused `409 unknown_demand` with zero `purchasing_issue_pos_batch`
  calls · direct Ready Stock reservation refused `409 unknown_build` with zero
  `ops_stock_pool_draw` calls · `All not ordered + Can order early` shows only rows satisfying
  both. Plus: the SQL itself asserted `proceed_order`-only, and a dateless PROCEEDED order still
  enters — the boundary is Proceed, not the date.
- **Rebased over the merged 02-C rail (#940):** the register filters through the shared
  `soBatchRailModel`, whose `railMatches` requires EVERY selected section — AND across
  TO ORDER · ORDER TIMING · PRODUCT · SUPPLIER — and every rail count now draws from the
  proceeded-only population, because there is only one order read.
- 8,714 tests green across the monorepo (shared 2,709 · api 2,506 · web 3,499); typecheck ·
  lint · production build · `git diff --check` clean. `docs/purchasing/MASTER.md` §9.1 carries
  the boundary law from the same PR.

```text
PURCHASING CARD 02-C (PROCEEDED-ORDER BOUNDARY) COMPLETE
Production SHA: 1b109ecd111462addc9bc71a9950753d3ca6f591
```
