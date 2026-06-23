# Sofa Engine — Phase 5: explode into per-compartment lines + cutover

> Roadmap: `docs/superpowers/plans/2026-06-21-sofa-engine-roadmap.md` §52-56.
> Builds directly on Phase 4 (`2026-06-23-sofa-phase4-server-recompute.md`).
> **Scope decided with Loo 2026-06-23:**
> - **Do the WHOLE cutover in one PR** (5A + 5B together), shipped as **dormant
>   groundwork** like P4 — it only starts biting once compartments are authored
>   (0 today). Reviewed by unit tests + Loo smoke; no live data to test against
>   until Loo authors a real model's compartments.
> - **Compartment → sellable SKU = auto-sync on offer-toggle.** When the
>   principal offers a compartment on a model (a `model_sofa_compartments` row),
>   Hono upserts a REAL `product_skus` row (`sku = {MODEL}-{code}`,
>   `compartment_id` bound, `pos_active = false`, supplier inherited from the
>   model, principal-set price). Mirrors the combo-component model (real SKUs).
> - **The 628 existing flat sofa SKUs stay legacy** — the builder is an
>   additional way to sell; ZERO migration of the flat catalog.
> - Recliner per-seat + the 2 P4 MINOR CFs (`sofa-p4-fabric-tier-trusted`,
>   `sofa-p4-asof-not-pinned`) stay deferred unless they bite.

## Why the auto-synced SKU is the linchpin (and why it's contract-safe)

Phase 4 emits/keeps ONE representative-sku line. Phase 5 **explodes** it into one
line per compartment cell. Each exploded line carries a synthetic
`sku = {MODEL}-{code}` (e.g. `OHANA-1A(LHF)`). For that to be safe, **every such
sku must be a real `product_skus` row under the sofa model** — because the whole
downstream is sku→product_skus joins:

- **0089 category mutex** (`0089_create_order_category_mutex.sql:88-107`) joins
  `payload.lines.sku → product_skus → product_models.category`. Its own comment
  warns *"Unknown SKUs drop out of the join silently."* If a compartment line's
  sku were NOT a real row under a `category='sofa'` model, a sofa build mixed
  with a mattress would **silently bypass the mutex** — a real bug. A real
  compartment sku under the sofa model ⟹ `category='sofa'` inherited ⟹ mutex
  stays sound.
- **PO-by-sku** maps each order line's sku → `product_skus.supplier_id` to group
  a PO per supplier. The auto-synced sku inherits the model's supplier ⟹ POs
  group correctly.
- **Per-unit stock / SO-Maintenance / finance / per-line threads** all assume a
  real `product_skus` row per line. The combo explode (0177) already proved this
  end-to-end in prod: **combo component lines are real SKUs + an `attrs` regroup
  key**, and they flow through every consumer. A sofa compartment line is
  structurally identical — a real sku + `attrs.sofa_build_key`.

**This is the contract-safety story: a compartment line is indistinguishable
from a combo-component line, which already works in prod.** `create_order` RPC,
`order_lines` structure, `DraftLine`, the 0089 mutex — **all UNTOUCHED.** The
explode is a Hono transform that produces MORE lines of the SAME shape; the RPC
just loops and inserts them.

## §7 gate — NO migration (target)

Phase 5 mints `product_skus` **rows** (data), not columns. `product_skus`
already has every column the synthetic sku needs:
`sku · model_id · compartment_id` (0178) `· price · cost` (0074) `· supplier_id`
(0171, nullable) `· pos_active · description` (0170) `· variant_kind`. The
explode + regroup are pure Hono + web. ⟹ **same zero-migration risk class as
P4.** Two things to confirm in T0 that could force a small migration (default =
avoid it):
- `product_skus.variant_kind` allowed values — reuse an existing value (no new
  enum/CHECK). If it's a free text column, use `'compartment'`.
- **Cost**: there is no compartment cost field today (`sofa_compartments` has
  `default_price` only; `model_sofa_compartments` has `price_override` only).
  v1 = synthetic sku `cost = null` (same as the 0175 flat-sofa backfill-clear;
  COGS placeholder already handles null). Only add `model_sofa_compartments.cost`
  (a new 0180 migration) if Loo wants real sofa COGS now — **deferred by
  default**.

## 5A — Auto-sync a compartment into a real `product_skus` row

**Trigger:** the existing P1 principal-gated `model_sofa_compartments`
write path (offer / set price / un-offer a compartment on a model).

**On offer / price-change (upsert a `model_sofa_compartments` row):** upsert a
`product_skus` row:
| column | value |
|---|---|
| `sku` | `{modelPrefix}-{compartment.code}` — deterministic, UNIQUE. `modelPrefix` = the model's stable short code (T0 decides: a model code field, else the model's first existing sku prefix). Parens in `code` (`1A(LHF)`) are fine in a text sku (confirm no constraint in T0). |
| `model_id` | the sofa model ⟹ category inherited = `sofa` ⟹ mutex/PO/stock sound |
| `compartment_id` | the pool compartment (0178 column) |
| `price` | `price_override ?? pool.default_price` (principal-owned, 0175) |
| `cost` | `null` (v1 — see §7) |
| `supplier_id` | inherited from the model's existing flat skus (shared supplier) |
| `pos_active` | **`false`** — never appears as a standalone flat product in the POS grid; only reachable via the builder + the exploded order lines. This is what keeps the 628 flat skus + the compartment skus from colliding in the catalog. |
| `variant_kind` | an existing allowed value (T0) |
| `description` | the compartment description |

**On un-offer (delete a `model_sofa_compartments` row):** do **NOT** delete the
sku (historical `order_lines` may FK it). Set `pos_active = false` +
`discontinued_at = now()`. Idempotent re-offer clears `discontinued_at`.

**Where:** a small helper in `apps/api` invoked from the existing
`model_sofa_compartments` route handler (principal-gated already). Whether the
`product_skus` upsert uses the principal's user-JWT (if `product_skus` RLS
allows principal writes — 0175's trigger implies it does) or the admin
service_role route exception (§4.3) is a T2 decision — **prefer user-JWT/RLS**
to keep service_role surface minimal; fall back to service_role only if RLS
blocks the insert.

## 5B — Explode on submit (extend the P4 trust gate) + downstream regroup

**Server explode (recommended — keeps the client emit path untouched):** the
client keeps emitting the SAME single representative-sku build line that P3/P4
emit (`buildToDraftLine` unchanged). The explode happens **server-side**, folded
into the P4 recompute in `apps/api/src/lib/sofa-recompute.ts`:

1. Steps 1-4 unchanged: parse `attrs.sofa_build`, resolve model, fetch snapshot,
   `computeSofaPrice → serverTotal`.
2. Drift gate unchanged: > 0.5% → 422 `sofa_price_drift`.
3. **NEW — explode** instead of `line.unitPrice = serverTotal`:
   - Extend the snapshot fetch with the model's compartment skus:
     `product_skus where model_id = X and compartment_id is not null` →
     `Map<compartment_code, sku>`.
   - `explodeSofaBuild(build, serverTotal, compartmentPriceLookup)` (the pure P2
     helper, already Σ-exact, residue-on-last) → per-cell `{moduleCode, unitPrice}`.
   - Map each cell → a real line: `sku = map.get(code)`, `unitPrice` = the split,
     `attrs = { sofa_build_key, cell_index, x, y, rot, fabric_id, fabric_name,
     fabric_surcharge, fabric_tier }` (fabric on every line; build-level extras
     on the first line only — mirrors the combo `attrs` convention).
   - **Fail closed**: a cell whose compartment has no synced sku ⟹ 422/400 (a
     build referencing an un-synced compartment — impossible in normal flow
     because 5A syncs on offer, but never silently drop a line).
   - The handler **replaces** the single build line with the N exploded lines in
     `parsed.data.lines` before `orderInputToRpcPayload` + `create_order`.
   - Signature change: `recomputeSofaBuildLines` returns the (possibly expanded)
     line array instead of mutating `unitPrice` in place; the route uses the
     returned array. Non-build lines pass through unchanged.

Net: cart shows **1** sofa line @ `RM serverTotal`; the persisted order has **N**
compartment lines summing **exactly** to `serverTotal`. Customer/ops docs then
show the itemized breakdown OR a regrouped single sofa (see downstream). The RPC
is unchanged — it just inserts N rows instead of 1.

**Downstream regroup (display only — read `attrs.sofa_build_key`):** mirror the
combo regroup `lineComboKey` in `CartDrawer.tsx:14-71`. A shared
`lineSofaBuildKey(line)` + a regroup that renders N compartment lines belonging
to one `sofa_build_key` as ONE "sofa build" card/row with the group total. Apply
to the highest-value read surfaces:
- **Operation order detail / line list** (the main ops view).
- **Confirm/cart** (so the salesperson sees one sofa, not N parts).
- **SO Maintenance grid** — N rows sharing a `sofa_build_key` get a group
  indicator (the grid is 1-row-per-line by design; a visual group marker, not a
  structural merge).

Lower-value surfaces (DO-pick visual grouping, returns, finance invoice
itemize-vs-group) render correctly as N labelled real-sku lines already (no
crash); their *pretty* regroup is **polish, flagged as follow-on** to keep the PR
focused. They are correctness-safe because every line is a real sku.

## Files (anticipated — SDD tasks refine)

**`packages/shared`** (pure, TDD):
- `sofa-pricing.ts`: a thin `explodeSofaBuildToLines(build, total, lookup,
  skuByCode, fabricAttrs)` mapping the existing `explodeSofaBuild` output into
  `{sku, qty, unitPrice, attrs}[]` (or keep the mapping in the API if it needs
  no sharing — decide in T1). `lineSofaBuildKey(attrs)` guard if shared with web.
- `schemas/`: extend `sofaBuildLineAttrsSchema` only if the per-cell exploded
  attrs need a schema (the build descriptor is unchanged).

**`apps/api`**:
- `lib/sofa-compartment-sku.ts` (new, 5A): `syncCompartmentSku(sb, modelId,
  compartmentId, …)` upsert + `discontinueCompartmentSku(...)`.
- `routes/catalog.ts` (or wherever `model_sofa_compartments` CRUD lives): call
  the sync after the offer/price/un-offer write.
- `lib/sofa-recompute.ts` (5B): explode after the drift gate; return the expanded
  line array; extend the snapshot fetch with the compartment-sku map.
- `routes/orders.ts`: consume the returned (expanded) lines.
- tests: `catalog.test.ts` (sync upsert/discontinue + sku fields incl.
  `pos_active=false`, supplier inheritance, mutex-soundness via category),
  `orders.test.ts` (build line → N real-sku lines summing to serverTotal;
  un-synced compartment → fail closed; non-build untouched; drift still 422).

**`apps/web`**:
- a shared `lineSofaBuildKey` + regroup helper; apply in CartDrawer/confirm +
  operation order detail + SO grid group marker.
- Maintenance per-model panel: read-back the synced sku per offered compartment
  (`OHANA-1A(LHF) · pos off`), so the principal sees the auto-sync happened.
- tests for the regroup helper + the panel read-back.

## Sequencing / SDD tasks

Established sofa-phase workflow: **per-task implement → independent adversarial
review → fix**, then a whole-branch contract-safety review + SERVICE_ROLE scan.
(Platform API-529 flakiness may force inline authoring like P1's T3/T4 — fine.)

- **T0** — confirm the two §7 questions (`variant_kind` value, sku-prefix source,
  parens-in-sku, supplier-inheritance source) against the live DB. 30-min spike;
  decides whether the no-migration target holds.
- **T1** — shared explode→lines mapping + `lineSofaBuildKey` (TDD).
- **T2** — 5A auto-sync (`syncCompartmentSku` + route hook + tests).
- **T3** — 5B server explode in `sofa-recompute` + orders route + tests.
- **T4** — web downstream regroup (CartDrawer/confirm + ops detail + SO grid).
- **T5** — web Maintenance sku read-back.
- **T6** — whole-branch adversarial review + contract-safety audit + SERVICE_ROLE
  scan on `apps/web/dist`.

## Acceptance

- shared + api + web green at the §17.3 baselines; no new regressions beyond the
  8 pre-existing fails (§17.7).
- Offering a compartment on a model mints a real `product_skus` row
  (`pos_active=false`, real `supplier_id`, `category='sofa'` via model); the flat
  POS grid is unchanged (compartment skus never appear there).
- Submitting a built sofa creates N real per-compartment `order_lines` summing
  EXACTLY to the server-recomputed total; a tampered client price → 422; a build
  referencing an un-synced compartment → fail closed.
- The 0089 mutex still fires on a sofa-build + mattress mix (now via the
  compartment lines' inherited sofa category).
- A normal (non-build) order + a combo order are byte-identical to today.
- Operation order detail + cart show a built sofa regrouped as one sofa (not N
  loose parts); SO grid marks the group.
- `/review` (backend safety) before merge. UI is additive (regroup display) →
  `/design-review` optional on the regroup card.

## Deferred (explicit)

- Recliner per-seat toggle + pricing (needs `product_models.recliner_upgrade_price`
  — a migration).
- The 2 P4 MINOR CFs (`sofa-p4-fabric-tier-trusted` re-derive tier from
  `fabric_id`; `sofa-p4-asof-not-pinned` pin combo `asOf` to the preview
  timestamp) — fold in here only if T3 makes them free; else keep deferred.
- Pretty regroup for DO-pick / returns / finance invoice itemization (correctness
  is already safe; this is display polish).
- Real sofa COGS (`model_sofa_compartments.cost`) — add only if Loo wants it.
- Migrating any of the 628 flat sofa SKUs to compartments — explicitly NOT done.
