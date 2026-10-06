# PURCHASING — CARD 02-C · SO BATCH PURCHASE LEFT FILTER RAIL — ORDER TIMING, PRODUCT, SUPPLIER AND FULL-LABEL READABILITY

**Card path:** `docs/cards/CARD-2026-08-27-purchasing-02c-so-batch-left-filter-rail.md`
**Module:** Purchasing
**Page:** SO Batch Purchase
**Surface:** Left filter rail only
**Sequence:** 02-C
**Status:** COMPLETE — production-verified 2026-08-27
**Owner approved:** 27 Aug 2026
**Lane:** BUILD / DELIVERY
**Depends on:** Purchasing Card 02-A and completed Card 02-B
**Expected migration:** None

---

## 1 · Outcome

Correct the `SO Batch Purchase` left filter rail so an inexperienced operator can:

1. see when an order should be placed;
2. filter by product category;
3. filter by actual supplier;
4. read every label without truncation;
5. clearly distinguish filters from the table checkboxes used to issue POs.

This Card owns the left filter rail only. Do not redesign the completed Card 02-B right
Register, PO issuance journey, 50/50 preview, calculation engine or Purchase Demand authority.

## 2 · Authority to read first

Re-read current `main` before changing anything: `CLAUDE.md` · `docs/ERP-ARCHITECTURE.md` ·
`docs/ui/MASTER.md` · `docs/COPY-STANDARD.md` · `docs/purchasing/MASTER.md` ·
`docs/cards/CARD-2026-08-26-purchasing-02a-so-batch-left-rail-order-timing.md` ·
`docs/cards/CARD-2026-08-27-purchasing-02b-so-batch-right-register.md`.

Card 02-A remains the authority for Safety-days arithmetic. Card 02-B remains the authority
for the permanent one-row-per-proceeded-SO Register. **This owner ruling supersedes the
earlier statement that the SO Batch rail has "three headings and no fourth."**

## 3 · Final left rail

```text
TO ORDER

  All not ordered                       144


ORDER TIMING

  Can order early                         6
  14 safety days left                     0
  1–13 safety days left                   4
  No safety days left                     0
  Not enough production days             29


PRODUCT

  All products

  Mattress                               52
  Bedframe                               61
  Sofa                                   31


SUPPLIER

  All suppliers

  Nice Future                            38
  [other real supplier names when present]


SETUP TO FIX

  Production days not set                 3
```

`SETUP TO FIX` and its heading render only when at least one affected SO exists.
All displayed numbers are examples. Production must calculate live counts.
Never hardcode supplier names or counts.

## 4 · Exact approved wording

Use exactly: `TO ORDER` · `All not ordered` · `ORDER TIMING` · `Can order early` ·
`14 safety days left` · `1–13 safety days left` · `No safety days left` ·
`Not enough production days` · `PRODUCT` · `All products` · `Mattress` · `Bedframe` · `Sofa` ·
`SUPPLIER` · `All suppliers` · `SETUP TO FIX` · `Production days not set`.

Replace the existing visible wording:

- `Not enough production time` → `Not enough production days`
- `Production time not set` → `Production days not set`

Do not introduce `Buffer`, `Order overdue`, `Cannot buy`, `Ready to buy`, `Needs Attention`,
`Follow Up`, `Priority`, `Today` or `Tomorrow`.

## 5 · Timing law must not change

Do not recalculate dates in the browser and do not change Card 02-A arithmetic:

```text
Requested Delivery Date − 14 Safety days                        = Goods Must Arrive
Goods Must Arrive − Supplier × Category production working days = Order By
```

The five `ORDER TIMING` rows are filters over the server-owned result. Every timing category
remains orderable. The wording reports timing condition; it never blocks buying by itself.
`Production days not set` is different: the required Supplier × Category setting is missing,
so the affected demand cannot be issued until that setting exists.

## 6 · Product authority

Product category must come from the authoritative Catalog category. Never infer category from
SKU text, model name, description, supplier, or a browser-only mapping.

Show these approved filters in this order: `All products` · `Mattress` · `Bedframe` · `Sofa`.

A Sales Order containing several categories counts once under every matching category and
still appears only once in the right Register. Records outside these three categories remain
visible under `All products`. Do not silently remove them from the permanent Register.

## 7 · Supplier authority

Supplier filters must use the same authoritative supplier projection as the completed
right-side `Supplier` column: outstanding Purchase Demand supplier, issued PO supplier
lineage, no second browser-only supplier calculation.

Rules: `All suppliers` clears the Supplier filter · show actual supplier names only · never
use placeholder supplier names · sort names alphabetically · a supplier with no matching SO
does not need a row · a selected supplier remains visible with `0` if another active filter
temporarily removes all matches · do not add a normal `No supplier` filter (an unexpected
missing supplier fails at Catalog authority and is not a normal purchasing category).

## 8 · Filter interaction

The rail is navigation, not batch selection. Therefore:

- No checkboxes in the left rail. Use the approved blue `NavRow` active treatment.
- The only checkboxes on this page remain the right Register checkboxes for `Issue PO`.
- One filter may be selected in each section. Filters from different sections combine.
- Clicking the selected timing row again clears that timing filter.
- `All products` clears the Product filter; `All suppliers` clears the Supplier filter.
- Clearing every filter restores the complete permanent Register, including orders that
  already have a PO. `All not ordered` remains the explicit outstanding-only filter.

Counts mean unique Sales Orders — never SKU quantity, demand-line count, PO count or
notification count. Counts update against the other selected filter sections so the number
predicts the resulting SO rows.

## 9 · Shared readable rail template

Create or use one reusable local filter-rail shell. Do not leave another page-specific rail
copy for Manual Purchase to reproduce later. Required geometry:

```text
Rail width                        240px
Outer padding                      12px
Heading → first filter row          8px
Between filter groups              20px
Normal filter row                  36px minimum
Wrapped filter row                 48px minimum / natural height
```

Rules: never truncate a governed filter label · `Not enough production days` may wrap
naturally onto two lines · the second line uses the same body font (not helper text) · keep
the count visible and right-aligned · never rely on hover or a tooltip to reveal the full
label · keep the rail vertically scrollable when supplier names increase · keep the border
separating the rail and Register · at narrower desktop widths the Register scrolls
horizontally and the rail is never squeezed below 240px.

Update the reusable rail component so Manual Purchase can later import the same shell, group
and row grammar. Do not migrate unrelated existing modules inside this Card.

## 10 · Manual Purchase template boundary

Manual Purchase must later reuse: the same 240px local filter rail · the same group-heading
typography and spacing · the same active blue row treatment · the same no-checkbox rule · the
same Product category authority · the same dynamic Supplier filter behaviour · the same
unique-object count rule.

Manual Purchase must not copy: `ORDER TIMING` · Safety-days arithmetic · Requested Delivery
Date logic · SO-specific `All not ordered` meaning. Its business filter groups will be decided
by the Manual Purchase Blueprint. Do not build Manual Purchase in this Card.

## 11 · Likely implementation surfaces

`packages/shared/src/so-batch-purchase.ts` (+ tests) ·
`apps/web/src/pages/operation/so-batch/SoBatchRegister.tsx` (+ tests) ·
`apps/web/src/pages/operation/components/workspace-rail.tsx` (+ tests) ·
`docs/COPY-STANDARD.md` · `docs/ui/MASTER.md` · `docs/purchasing/MASTER.md` · this Card.
Use existing order-line category, supplier summary and PO lineage facts. No new database
truth is expected.

## 12 · Required tests

Prove at minimum:

1. Exact section order and wording.
2. All five timing rows remain visible, including zero counts.
3. `Not enough production days` is fully readable and not truncated.
4. Product rows appear in the approved order.
5. Product filtering uses Catalog category, never SKU-name inference.
6. A multi-category SO counts under each applicable category but appears once.
7. Supplier names are real, dynamic and alphabetically ordered.
8. Supplier filtering uses the same supplier facts as the right Register.
9. Counts are unique SO counts.
10. Filters combine correctly across sections.
11. `All products` and `All suppliers` clear their dimensions.
12. No left-rail checkbox exists.
13. Right-side selection checkboxes still work.
14. The Card 02-B ten Register columns remain unchanged.
15. Existing PO status, PO numbers, expansions and 50/50 issuance remain unchanged.
16. The complete permanent Register returns after filters are cleared.
17. No migration is added.

## 13 · Visual owner walk

Walk the real page at both 1440px and 1130px widths. Evidence must show: complete left rail ·
the full two-line `Not enough production days` · Product filters · actual Supplier filters ·
a combined `All not ordered + Mattress + supplier` result · blue rail selection without
checkbox · separate right-side buying checkboxes · 240px rail retained at 1130px · horizontal
Register scrolling rather than compressed unreadable columns · right Register unchanged from
completed Card 02-B. Provide original-size evidence the owner can open and read.

## 14 · Failure conditions

The Card fails if: a filter label is cut off · Product is inferred from SKU text · supplier
names are hardcoded · counts are quantities or demand-line counts · rail rows use checkboxes ·
an issued PO disappears from the permanent Register · Card 02-B columns or status words
change · Safety-days arithmetic is duplicated in the browser · `Not enough production days`
is treated as `Cannot buy` · Manual Purchase business logic is added · a migration is
introduced without stopping and reporting the contradiction.

## 15 · Delivery

Work from the latest `main` in a dedicated worktree. Run the repository's complete required
gates, inspect for sibling overlap, open a clearly titled PR, wait for CI, merge, deploy and
verify the production SHA. Do not return for routine permission between build, test, PR,
merge and deployment. Stop only for: an unexpected migration · a genuine authority
contradiction · destructive or materially broader scope. After production verification,
update the Card and authoritative MASTER/COPY documents with final truth and report the live
result.

---

## Completion evidence — 2026-08-27

- **PR:** [#940](https://github.com/wenwei4046/Carres-Portal-v2/pull/940), built in a
  dedicated worktree from `main` `d064297f`, merged to `main` as
  `0f421277cb8fec6ad032b76edf26020b04d7cd25`; CI `verify` green (14m03s). **No migration** —
  none was needed, none was manufactured (403 filenames validated, 0 changes).
- **Authority persisted before code** (`654d516d` inside the PR):
  `docs/purchasing/MASTER.md` §9.1 (the five-section rail law, readable-shell geometry,
  cross-updating unique-SO counts), the `docs/COPY-STANDARD.md` rail block (five headings,
  the `days` wording, the no-checkbox and never-truncate rules), `docs/ui/MASTER.md`
  (LOCAL FILTER RAIL — READABLE SHELL, locked), and `docs/03-page-patterns.md` — whose SO
  Batch example was also two cards stale and now records the 02-B ten-column grid.
- **The model:** `SoBatchRailFilter` (one slot per section) + `soBatchRailFacts` +
  `soBatchRailModel` in `packages/shared/src/so-batch-purchase.ts` — every count is unique
  Sales Orders computed under the OTHER sections' selections, so the printed number predicts
  the click; fixed rows print zero rather than hiding it; the selected supplier survives at
  `0`. Product reads only the Catalog category on the Register's own lines (`oE`, a SKU
  whose TEXT screams mattress but whose category is absent, is proven uncounted). Supplier
  rides `soBatchOrderSupplierNames` — the exact projection the right Register's `Supplier`
  column prints, now shared so the two cannot drift. Wording changed at the source
  (`purchase-demands.ts`): `Not enough production days` · `Production days not set`; the
  wire state keys kept their spellings.
- **The shell:** `FilterRail` / `FilterRailGroup` / `FilterRailRow` join
  `workspace-rail.tsx` — 240px · 12px padding · 8px heading gap · 20px group gap · 36px
  minimum row (9px + one 18px `text-body` line + 9px), labels `break-words`, never
  `truncate`, count right-aligned on the first line. The legacy 200px `RailGroup`/`RailItem`
  pair survives untouched underneath its four other governed pages; they migrate in their
  own cards.
- **Gates:** 8,706 tests green (shared 2,709 · api 2,499 · web 3,498, including 10 new
  shared rail-model proofs and 14 new register rail proofs), typecheck, lint, `check:v4`,
  `ci:migrations`, production build (the dev preview entry proven absent from `dist`),
  `git diff --check` — all clean.
- **Walk** (`docs/evidence/purchasing-02c-rail/`, the real component + seeded payload at
  1440px and 1130px, original-size captures delivered to the owner): the complete five-section
  rail; `Not enough production days` whole on its 36px row (DOM-measured: rail 240px at both
  widths, full label text, 0 rail checkboxes, 13 grid checkboxes); the combined
  `All not ordered + Mattress + Hooka` result (7 rows, three blue NavRow selections,
  Bedframe/Sofa/setup counts honestly at 0, unmatched suppliers dropped); clearing every
  filter returning all 12 records, Ordered included; `?setup=0` removing the whole
  `SETUP TO FIX` section; the Register horizontally scrolling under the sticky `SO No` at
  1130px; and the retired 200px truncating rail (`Not enough producti…`) reconstructed
  beside the new one.
- **Production:** deploy run 33064330629 SUCCEEDED; `scripts/verify-production.mjs`
  converged all five governed surfaces (carres-portal Pages · carres-pos Pages · ERP
  canonical · POS canonical · API Worker `/health`) on the exact merge SHA. The served ERP
  bundle (`index-DAoYVoPb.js`, fetched and counted): `Not enough production days` ·
  `Production days not set` · `PRODUCT` · `All products` · `SUPPLIER` · `All suppliers` ·
  `All not ordered` all present; `Not enough production time` · `Production time not set`
  both **0**.
- The authenticated production walk on live data remains the owner's, per the standing
  owner-only acceptance law; the SHA, bundle counts and seeded-component walk above are the
  engineering proof.

```text
PURCHASING CARD 02-C COMPLETE
Production SHA: 0f421277cb8fec6ad032b76edf26020b04d7cd25
```
