# Sofa Engine — Phase 4: Server recompute + drift-reject (the trust gate)

> Roadmap: `docs/superpowers/plans/2026-06-21-sofa-engine-roadmap.md` §46-50.
> Scope decided with Loo **2026-06-23**: **trust gate ONLY** — server recompute +
> 0.5% drift-reject on the existing single representative-sku sofa-build line.
> **The explode into per-compartment `order_lines` is DEFERRED to Phase 5**,
> because exploding needs compartments authored as real `product_skus` (0 today)
> or the 0089 category mutex + every downstream `order_lines.sku → product_skus`
> INNER JOIN (PO-by-sku, per-unit stock, SO grid) silently goes blind to the
> synthetic `{MODEL}-{code}` skus. Phase 5 owns compartment-as-sku authoring +
> explode + downstream regroup as one coordinated cutover.

## Why this is contract-safe (the whole point)

- `create_order` RPC, `order_lines` table, `DraftLine`, `cart.ts`, the 0089
  mutex — **all UNTOUCHED**. Phase 4 adds a pure server-side *guard* in the Hono
  `POST /api/orders` handler that runs ONLY for lines carrying `attrs.sofa_build`.
- A sofa-build line stays exactly what Phase 3 emits: ONE line, real
  representative sofa `product_skus.sku`, `unitPrice` = build total,
  `attrs.sofa_build = { cells, height }` + `attrs.fabric_tier` +
  `attrs.sofa_build_key`. The guard only **overwrites that line's `unitPrice`
  with the server-recomputed total** (authoritative), or **rejects the whole
  POST** when the client price drifted > 0.5%.
- Non-build lines (normal POS, combos, AutoCount import) flow through with **zero
  behaviour change** — the guard is a no-op when no line has `attrs.sofa_build`.
- **Dormant in prod today**: the builder only opens for sofa models with offered
  compartments (0 authored), so 0 build lines exist. Landing the guard now is
  zero-risk groundwork; it starts biting the moment compartments are authored.
- Trust-model scope stays narrow (roadmap risk): recompute is sofa-build-only,
  uses the **user JWT** (`userClient`, RLS read on the catalog tables) — **never
  service_role** — and lives in Hono per §4.3, not in the RPC.

## Mechanism (in `ordersRouter.post("/")`, after zod + storage-path + lead-time)

For each `line` in `parsed.data.lines` where `line.attrs?.sofa_build` is present:

1. **Validate** the build descriptor with the new shared zod schema
   `sofaBuildLineAttrsSchema` (`{ sofa_build: { cells: [{ moduleCode, x?, y?,
   rot? }]≥1, height }, fabric_tier?, sofa_build_key? }`). Malformed → **400**.
2. **Resolve model**: `product_skus.sku = line.sku → model_id` (one select).
   Missing → **400** (a build line must point at a real sofa model).
3. **Fetch fresh snapshot** for that model (memoized per model within the
   request) — mirrors the catalog GET assembly exactly, reusing the same
   `Adapters.*FromRow`:
   - `sofa_compartments` (whole pool)
   - `model_sofa_compartments` where `model_id = …`
   - `sofa_combo_pricing` where `model_id = …` AND `active` AND
     `discontinued_at IS NULL` (the non-admin POS filter)
   - `fabric_tier_addon_config` (id=1 singleton; `{0,0}` fallback)
   - `model_fabric_tier_overrides` where `model_id = …`
4. **Recompute**: build a `SofaBuild` (`modelId`, `cells`, `fabricTier =
   attrs.fabric_tier ?? null`, `height`) and call the pure Phase-2
   `computeSofaPrice(build, snapshot)` → `serverTotal`.
5. **Drift gate** (pure shared helper `sofaPriceWithinTolerance`):
   - `serverTotal > 0`: reject when `|client − server| / server > 0.005`.
   - `serverTotal ≤ 0` (model can't justify any price): require `|client| <
     0.005` (i.e. a genuine free/0 build), else reject.
   - On reject → **422** `{ error: "rule_violation", code: "sofa_price_drift",
     message, clientTotal, serverTotal }` (matches the house 422 rule-violation
     convention used by `mixed_category_lines` + `lead_time_violation`; the
     roadmap's loose "400" is superseded by the codebase convention).
6. **Within tolerance** → set `line.unitPrice = serverTotal` (server is
   authoritative — even sub-0.5% client rounding is corrected). Continue.

After the loop, the (possibly price-corrected) `parsed.data.lines` flow into
`orderInputToRpcPayload` + `create_order` exactly as before.

## Files

**`packages/shared`** (pure, TDD):
- `src/sofa-pricing.ts` (or a small `sofa-recompute.ts`): add
  `SOFA_PRICE_DRIFT_TOLERANCE = 0.005` + `sofaPriceWithinTolerance(client,
  server): boolean`. Unit-tested: exact, within, over, server-0+client-0,
  server-0+client>0, negative guards.
- `src/schemas/` : `sofaBuildLineAttrsSchema` + `SofaBuildLineAttrs` type +
  `isSofaBuildLine(attrs)` guard. Exported from the barrel.

**`apps/api`**:
- `src/lib/sofa-recompute.ts` (new, mirrors `lib/lead-time.ts`):
  `recomputeSofaBuildLines(sb, lines)` → `{ ok: true } | { ok: false, line,
  clientTotal, serverTotal }`, mutating accepted lines' `unitPrice` in place;
  internal `fetchSofaSnapshot(sb, modelId)` (memoized).
- `src/routes/orders.ts`: call it in `POST /` between lead-time and
  `orderInputToRpcPayload`; map an `ok:false` to the 422 body.
- `src/routes/orders.test.ts`: new `describe("sofa build recompute")` — within
  tolerance overwrites unitPrice + calls create_order with the server number;
  > 0.5% drift → 422 + create_order NOT called; non-build line untouched;
  malformed `sofa_build` → 400; server-0/client-0 ok; server-0/client>0 → 422;
  multi-build memoizes the snapshot fetch per model.

## §7 gate

**NO migration.** All config rides in the frozen `order_lines.attrs` free jsonb;
the recompute reads existing 0176/0178/0179 catalog tables. Risk class: lower
than 0176/0177 (read-only on the catalog; the only write is correcting one
in-memory `unitPrice` before the unchanged RPC).

## Deferred to Phase 5 (explicit)

- `explodeSofaBuild` into per-compartment `order_lines` (the helper already
  exists from P2, unused here).
- Authoring compartments as real `product_skus` (so exploded skus satisfy the
  mutex + downstream joins).
- Downstream regroup-by-`sofa_build_key` (operation detail, SO grid, DO-pick,
  returns).
- group-drag/rotate + recliner per-seat (P3 polish carry-forwards).

## Review findings (independent adversarial review 2026-06-23 — **APPROVE**)

Verdict APPROVE; contract-safety YES (create_order / order_lines / DraftLine /
cart.ts untouched; the 0089 mutex still fires on the rep sku). No blockers. Two
MINORs deferred to Phase 5 (the reviewer's own recommendation — not expanding the
P4 trust gate):

- **CF `sofa-p4-fabric-tier-trusted`** (MINOR): the client-supplied
  `attrs.fabric_tier` is trusted, not re-derived from `attrs.fabric_id` against
  `sofa_fabrics.tier`. Exposure is bounded to the tier DELTA only (the à-la-carte
  + combo base is fully reverified); same class as the now-closed DB lock
  `fabric-tier-db-lock`. Phase 5 (fabric→sku reverify) should re-derive the tier
  server-side from `fabric_id`. Dormant (0 tiered fabrics + 0 builds in prod).
- **CF `sofa-p4-asof-not-pinned`** (MINOR): `recomputeSofaBuildLines` runs
  without an `asOf`, so `computeSofaPrice` anchors a combo's `effective_from` to
  server-today. A combo flipping effective between the client preview and submit
  can cause a rare false `sofa_price_drift` reject (self-healing on rebuild;
  never under-prices). Pin `asOf` to the client preview timestamp if it bites.

## Acceptance

- shared + api + web green at the §17.3 baselines; no new regressions beyond the
  8 pre-existing fails (§17.7).
- A tampered client price on a build line is rejected (422 `sofa_price_drift`);
  an honest one is accepted at the server's number.
- A normal (non-build) order is byte-identical to today (guard no-op).
- `/review` (backend safety) before merge. No UI → `/design-review` N/A.
