# 2990s Products parity — Phase 3: Special Add-ons

> Part of the 9-tab parity initiative. **Migration 0181** (applied to staging=prod).
> All-in-one (Loo's call): schema + admin tab + per-model attach + POS picker +
> **server-recompute trust gate**. Contract-safe: create_order / order_lines /
> DraftLine / cart.ts / 0089 mutex UNTOUCHED.

## What it is
Per-model SELLING surcharges with one-level follow-up question groups (group →
choices, each carrying an `extra`). Surcharges (base + extras) may be **negative**
(a deduction). Attached per-model via `product_models.allowed_options.specials`
(codes; `.passthrough()` → no schema change). At POS the picked surcharge **folds
into the line unitPrice** (no separate SKU); the selections ride in
`order_lines.attrs.specials[]` and are **server-recomputed** on submit.

## Locked decisions (Loo, 2026-06-25)
- §7 schema **approved**: one new `special_addons` table, principal-only RLS.
- Pricing trust = **server-recompute + 0.5% drift gate** (like sofa P4), not client-priced.
- Build = **all-in-one** (admin + POS in one PR).

## Schema (migration 0181, additive, empty table)
`special_addons` (id, code UNIQUE, label, so_description, categories text[],
selling_price numeric(12,2) [negative OK], cost numeric(14,2) null, option_groups
jsonb, active, sort_order, timestamps, updated_by) + index (active, sort_order) +
RLS read-all-authenticated / write `(SELECT public.is_principal())` (InitPlan-wrapped,
mirrors 0177/0179).

## Layers
- **shared**: pure `resolveSpecialAddonSurcharge` / `resolveSpecialsTotal` /
  `specialPickComplete` (client preview == server recompute) + zod schemas +
  adapter + db-type + domain + `allowed_options.specials`.
- **api**: `specialAddons` in the GET bundle (active-only for POS, all for admin) +
  principal CRUD (POST/PATCH/DELETE; `code` set-on-create not patchable; soft-delete
  active=false; `updated_at`/`updated_by` stamped like siblings) +
  `special-addons-recompute.ts` (Hono trust gate: re-resolve from FRESH ACTIVE defs,
  retired/unknown code → 400, `>max(0.5%, RM0.01)` drift → 422 `special_price_drift`,
  fail-closed; nudges unitPrice + canonicalises attrs) wired AFTER the sofa recompute,
  userClient/RLS only.
- **web**: Special Add-ons tab (CRUD + nested option-groups editor, principal-gated) +
  per-model attach panel in ProductModelDrawer (writes allowed_options.specials,
  internal-editable, category-filtered) + POS picker (`special-addons-picker.tsx`:
  picker + `useSpecials` hook + `SpecialsSummary`) folded into all 3 configurators
  (surcharge → unitPrice, picks → attrs, required-answer gating, reset on add) +
  cart + order-detail render.

## Review outcome (5-dimension adversarial workflow)
contract-safety **clean** · server-recompute **correct** · pricing-security **sound** ·
pos-picker **correct** · schema **clean**. Fixed:
- `updated_at`/`updated_by` now stamped on POST/PATCH (sibling consistency).
- `code` kebab regex (matches comboKey/addon.key; clean jsonb key).
- `specials_total` zod `.finite()` (belt vs a non-JSON NaN).
- `RecomputableLine` now one shared type across the two recompute stages.
- Added mis-category picker-guard test.

### Deferred (documented CFs — not fixed)
- `special-addons-negative-below-base`: a deduction exceeding the base SKU price folds
  the line unitPrice < 0 → the API's `orderLineInputSchema.nonnegative()` rejects it
  with a generic 400 (safe, no corruption). Practically unreachable (specials on
  hundreds-to-thousands-RM products). Clamp at the configurator if it ever bites.
- `special-addons-recompute-category-offer-check`: the server re-resolves a pick BY CODE
  only — it doesn't re-verify the def's categories include the line's product category
  nor that the model offers the code. The surcharge stays server-honest; only the
  *attachment* is client-trusted (POS filters by category/offer). Defense-in-depth,
  like `sofa-p4-fabric-tier-trusted`.
- `special-addons-route-integration-test`: the recompute is unit-tested (8 cases) but the
  orders.ts WIRING has no route-level test — **matches the sofa recompute precedent**
  (also unit-only; `buildSbForCreate` can't chain `.in().eq()` without harness surgery).
- minor: `SpecialAddonOptionGroup` declared in both domain.ts + special-addons.ts
  (cosmetic, no collision); 23505 duplicate-code → 500 not 409 (cross-cutting, pre-existing).

## Verification
shared **415/415** · api **839 pass / 3 known-fail (§17.7)** · web **769 pass / 5 known-fail (§17.7)** ·
typecheck ×3 + build clean · `SERVICE_ROLE` dist scan 0 · zero new regressions · migration 0181 applied.
