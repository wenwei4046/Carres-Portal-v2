# Sofa Engine — Phase 2: Pricing engine + sofa-combo model (the money core)

> Phase 2 of the sofa engine roadmap (`2026-06-21-sofa-engine-roadmap.md`). Builds the **pure pricing engine** + the **sofa-combo data model** + the **explode helper**. Additive + principal-owned, same risk class as 0176/0177/0178. NO builder UI (Phase 3) / NO server-recompute or order change (Phase 4) yet — Phase 2 is the *engine + its inputs*, exercised only by unit tests + a maintenance UI in this phase.
> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`. Migration `0179` goes through the §7 STOP gate before apply. **Heavy TDD on Task 3** (the pure functions must match 2990s outputs on a battery of cases).
> **Grounding:** the exact 2990s code this faithfully reproduces is in `docs/superpowers/2026-06-21-sofa-engine-understand.md` + the Phase-2 ground workflow (5 readers, 2026-06-21). File:line references below point at the verified 2990s source.

## Locked decisions (Loo, 2026-06-21)
- **Combo price = `prices_by_height` matrix** (NOT a single price). Faithful to 2990s: a combo carries a price per seat-height; the build's chosen height selects the price. À-la-carte compartment prices stay flat (height-independent) — only combos vary by height (exactly 2990s).
- **Recliner / 电动 = DEFERRED to Phase 3** (no Carres data today, no UI to author/select a recliner seat until the builder exists). `computeSofaPrice` lands `reclinerExtra` as a **`+ 0` interface-complete stub** (mirrors 2990s mfg `reclinerUpgradePrice: 0`, `sofa-build.ts:521`). The `product_models.recliner_upgrade_price` column + maintenance input + seat toggle all land in Phase 3, where the data first has a consumer.
- **Combo scope = company-wide only** (defer `customer_id` + the customer-scope ranking tiers). Carres is B2C dealer POS — no per-customer combo pricing need.
- Pricing rule (confirmed against 2990s `groupPrice`, `sofa-build.ts:1176-1333`): **matched combo > à-la-carte** (Carres sofas have no "bundle" layer — skip it). A matched combo applies **whenever its price for the chosen height is > 0, even if pricier** (the "only-if-cheaper" guard was deleted 2026-05-30; the stale doc-comment at 2990s `sofa-combo-pricing.ts:23-27` is DEAD — follow the code). Combo price covers ONLY the matched subset; **extra modules beyond the matched slots add at full à-la-carte**; fabric-tier P2/P3 delta adds on top.
- Combo matching = **subset coverage via Kuhn's bipartite max-matching** over ordered SLOTS (each slot = OR-set of compartment codes); order-independent; extras allowed (`matchComboSubset`, 2990s `sofa-combo-pricing.ts:289-333`).

## Reuse map (grounded — these already exist in `@carres/shared`)
- **`explodeCombo`** (`packages/shared/src/combo.ts:55-122`) — integer-cents proportional split + **residue-on-last** (Σ exact). Its `distributeProportionally` math is byte-identical to 2990s `so-sofa-split.ts:54-70`. → `explodeSofaBuild` reuses/extends it. `ExplodedComboLine` (`{sku,qty,unitPrice,comboKey,comboLabel}`) is the per-compartment line shape.
- **`resolveFabricDelta`** (`packages/shared/src/fabric-tier.ts:51-67`) — `override?.tierNDelta ?? config?.sofaTierNDelta ?? 0`, clamped ≥0 (`??` chain, NOT `||`). → `computeSofaPrice` calls it for the fabric-tier add.
- **`SofaCompartment.defaultPrice` + `ModelSofaCompartment.priceOverride`** (`domain.ts:167-189`, migration 0178) — the per-(model,compartment) à-la-carte price = `priceOverride ?? defaultPrice`. **No shared helper exists yet** (only inline at `ProductModelDrawer.tsx:795`) → Task 3 writes `resolveCompartmentPrice`.
- **`catalogResponseSchema`** (`schemas/catalog.ts:285-303`) — every later field is `.optional()` additive. → add `sofaCombos?`.
- **`catalog.ts` CRUD template** — `principalOnly(c, MSG)` + `parseJsonBody` + `userClient` + `mapPgError` + `updated_at`/`updated_by` stamp + two-table compensating-delete (POST /combos, `catalog.ts:1048-1103`). → mirror for `/sofa-combos`.
- **Money convention:** Carres money is **numeric MYR at rest** (`adapters.ts` `Number()` coercion, no `/100`). The **integer-cents-internally** convention is local to `explodeCombo`. `computeSofaPrice` follows it: MYR-in → cents for the arithmetic → MYR-out.

## Global constraints
- Additive only (§7): new migration `0179` (+ §7 note + Loo OK before apply). Do NOT touch `create_order`, `order_lines`, `orderLineInputSchema`, `DraftLine`, the existing `SofaConfigurator` price path. Only ADD a table + shared functions + a catalog GET field + CRUD routes + a maintenance UI.
- Principal-only writes: RLS `(select public.is_principal())` USING+WITH_CHECK (mirror 0176/0177/0178 exactly); read = any authenticated. §8 InitPlan-wrap, STABLE helpers.
- One zod schema / two consumers (§9.5); `qk` centralized; table-name constants (§9.4); snake↔camel via adapters only (§9.1); barrel-export everything (don't repeat the P4 barrel-omission). v17/2990s look, Lucide, no emoji.
- Green at baselines (measured 2026-06-21 after PR #29): **shared 233/233 · api 784/787 · web 676/681** (8 known pre-existing fails per §17.7 — add none).

---

### Task 1: migration `0179` — `sofa_combo_pricing` (§7 GATE: write → confirm → apply)
**Files:** Create `supabase/migrations/0179_sofa_combo_pricing.sql`
- [ ] **Step 1 — verify live** (`mcp__supabase__list_migrations` tail = 0178; `execute_sql` to confirm): `public.is_principal()` is STABLE + SECURITY DEFINER; `product_models(id)` PK; `sofa_compartments(code)` UNIQUE (0178); `fabric_price_tier`/tier enum NOT present in Carres (Carres uses text `'PRICE_1|2|3'` on `sofa_fabrics.tier`, 0176 — combos store tier as **text nullable**, NOT a PG enum). Do NOT recreate anything.
- [ ] **Step 2 — write the migration (additive):**
  - `sofa_combo_pricing`:
    - `id uuid PK default gen_random_uuid()`
    - `model_id uuid NOT NULL REFERENCES product_models(id) ON DELETE CASCADE` — the base model the combo applies to (Carres-idiomatic FK; mirrors `model_sofa_compartments`/`model_fabric_tier_overrides`). (2990s keyed by `base_model` text; Carres uses the model uuid.)
    - `slots jsonb NOT NULL DEFAULT '[]'::jsonb` — ordered list of SLOTS, each slot = OR-set of compartment `code` strings, e.g. `[["2A(LHF)","2A(RHF)"],["L(LHF)","L(RHF)"]]` (2990s `modules` jsonb `string[][]`, migration 0093). A singleton slot `["1NA"]` = a required exact code.
    - `tier text` (nullable; `NULL` = applies to any fabric tier) `CHECK (tier IS NULL OR tier IN ('PRICE_1','PRICE_2','PRICE_3'))`.
    - `prices_by_height jsonb NOT NULL DEFAULT '{}'::jsonb` — `{ "24": 2640, "28": 2750, ... }`, height-string → numeric MYR (or the key absent / `null` = no price at that height = combo does not apply there). Keys ∈ the canonical `SOFA_HEIGHTS` set (Task 2).
    - `label text` (nullable; null = auto-build from slots).
    - `effective_from date NOT NULL DEFAULT CURRENT_DATE` — tie-break (newest wins among equal-priority matches) + future-dating.
    - `active boolean NOT NULL DEFAULT true`, `discontinued_at timestamptz` (soft-delete; mirror 0177 combos).
    - `created_at/updated_at timestamptz NOT NULL DEFAULT now()`, `updated_by uuid`.
    - **Deferred columns (NOT in v1):** `customer_id` (company-scope only), `supplier_id` (no supplier combos), `selling_prices_by_height`/`pwp_prices_by_height`/`default_free_gifts` (promo deferred). `prices_by_height` IS the selling price.
    - Indexes: `CREATE INDEX idx_sofa_combo_pricing_lookup ON sofa_combo_pricing (model_id, tier, effective_from)`; optional GIN on `slots` (`jsonb_path_ops`) for future containment queries (2990s has it).
    - Enable RLS; SELECT `(SELECT auth.uid()) IS NOT NULL`; ALL write `(SELECT public.is_principal())` USING+WITH_CHECK. Header comment (WHY = sofa engine Phase 2, additive, principal-owned, prices-by-height per Loo 2026-06-21, customer/supplier/promo deferred, never edit frozen 0001-0178).
- [ ] **Step 3 — STOP, §7 gate.** Present the SQL to Loo (additive, principal-owned, zero order-contract change, empty table = zero behaviour change) + design notes (model_id FK vs 2990s base_model; prices_by_height matrix; deferred columns). Get OK → apply via Supabase MCP → verify (table + RLS enabled + 2 policies + FK CASCADE + CHECKs + indexes).
- [ ] **Step 4 — commit** `feat(catalog): migration 0179 — sofa_combo_pricing (prices-by-height, principal-owned)`

### Task 2: shared — types/schemas/adapters + `SOFA_HEIGHTS` + catalogResponse extend (mechanical)
**Files:** `packages/shared/src/{db-types,domain,adapters,schemas/catalog,tables,index}.ts` (+ a new `sofa-pricing-constants.ts` or fold into an existing module)
- [ ] `SofaComboPricingRow` (db-types, snake) + `SofaCombo`/`SofaComboPricing` (domain, camel): `{ id, modelId, slots: string[][], tier: FabricTier|null, pricesByHeight: Record<string, number|null>, label: string|null, effectiveFrom: string, active: boolean, discontinuedAt: string|null }`.
- [ ] `SOFA_HEIGHTS = ['24','28','30','32','35'] as const` + `SofaHeight` type (the canonical seat-height/depth axis, = 2990s `sofaSizes`, confirmed `mfg-pricing.test.ts:67`). Export from barrel. (The builder in Phase 3 lets the customer pick one; the maintenance UI authors a price per height.)
- [ ] zod `sofaComboSchema` (Dto) + `sofaComboCreateInput` + `sofaComboPatchInput`. Validate `slots` = non-empty array of non-empty `string[]`; `pricesByHeight` = record of `SOFA_HEIGHTS` keys → `number≥0 | null`; `tier` nullable enum.
- [ ] adapters `sofaComboFromRow` (+ `…ToRow` if used). `catalogResponseSchema.sofaCombos: z.array(sofaComboSchema).optional()` (additive). `SOFA_COMBO_PRICING` table constant. Barrel-export all.
- [ ] Green (shared tests + typecheck; no logic, mechanical).
- [ ] **Commit** `feat(shared): sofa-combo types/schemas/adapters + SOFA_HEIGHTS`

### Task 3: shared PURE ENGINE — the money core (HEAVY TDD; strict test-driven-development)
**Files:** `packages/shared/src/sofa-pricing.ts` (+ `sofa-pricing.test.ts`); barrel-export.
> Write tests FIRST. The pure functions take MYR-numeric catalog inputs, do arithmetic in integer cents (the `explodeCombo` convention), return MYR. NO DB, NO IO.
- [ ] **`resolveCompartmentPrice(modelComp, pool): number`** — `modelComp.priceOverride ?? pool.defaultPrice` (mirror `resolveFabricDelta`'s `??` discipline; override `0` wins, `null` inherits). + a `mirrorCode(code)` helper (LHF↔RHF swap) so a build cell priced only on one facing falls back to its mirror (faithful to 2990s `compRow(id) ?? compRow(mirror(id))`, `sofa-build.ts:1186-1188`).
- [ ] **`matchSofaCombo(builtCodes: string[], slots: string[][]): number[] | null`** — Kuhn bipartite max-matching, port of 2990s `matchComboSubset` (`sofa-combo-pricing.ts:289-333`). Returns the matched built-index subset (exactly `slots.length` entries) or `null`. Properties to TEST: distinct assignment; **maximum** matching not greedy (overlapping OR-sets `[{X,Y},{X}]` vs built `[X,Y]` must match); order-independent; extras allowed (`built.length ≥ slots.length`); empty slots → null; too-few-built → null; a slot with no candidate → null.
- [ ] **`pickSofaCombo(args, combos): { combo, priceMyr, matchedIndices } | null`** — filter (active && !discontinued, `model_id` match, `tier === args.tier || tier === null`, `effective_from <= asOf`, a numeric `prices_by_height[args.height] > 0` exists, slots coverable by `matchSofaCombo`) → rank (company+tier(2) > company+any(1); customer tiers deferred) → tie-break **newest `effective_from`** → return best. Port of 2990s `pickComboMatch` (`sofa-combo-pricing.ts:368-418`), customer tiers dropped.
- [ ] **`computeSofaPrice(build, snapshot): SofaPriceResult`** — the faithful port of 2990s `groupPrice` (`sofa-build.ts:1176-1333`), promo/bundle removed:
  - `aLaCarteSum = Σ resolveCompartmentPrice(cell)` over build cells (with mirror fallback).
  - combo override: `match = pickSofaCombo({modelId, builtCodes, tier: build.fabricTier ?? 'PRICE_1', height: build.height}, snapshot.sofaCombos)`. If matched & `priceMyr > 0`: `basis='combo'`; `comboSubsetSum = Σ resolveCompartmentPrice` over matched-subset cells (SAME lookup incl. mirror — the load-bearing invariant, 2990s C1 audit); `comboExtras = max(0, aLaCarteSum − comboSubsetSum)`; `base = priceMyr + comboExtras`. Else `basis='a_la_carte'`, `base = aLaCarteSum`.
  - `reclinerExtra = 0` (Phase-3 stub; interface present).
  - `fabricDelta = resolveFabricDelta(build.fabricTier, snapshot.fabricTierOverride, snapshot.fabricTierConfig)`.
  - `total = base + reclinerExtra + fabricDelta`. Return a breakdown `{ aLaCarteSum, basis, comboId?, comboPrice?, comboSubsetSum?, comboExtras?, reclinerExtra, fabricDelta, total, matchedCellIndices? }`.
  - **Combo-lookup tier nuance** (2990s): default lookup tier when unset = `'PRICE_1'` (combos authored at PRICE_1; the fabric P2/P3 delta is the *separate* add, never a base-tier switch). Document + test.
  - All arithmetic in integer cents; `total` rounded to 2dp MYR once at the end.
- [ ] **`explodeSofaBuild(build, totalMyr, compartmentPriceLookup): ExplodedComboLine[]`** — reuse `explodeCombo`'s `distributeProportionally` (cents, floor-each + residue-on-last; Σ exact). One line per build cell, weight = that cell's à-la-carte price (all-zero → equal split). `sku`/`itemCode` shape is a Phase-4 concern (compartments-as-SKUs); in P2 the helper returns the per-cell split + a `buildKey`/`cellIndex` carrier so P4 wires it to `order_lines`. TEST: Σ(unitPrice×qty) === totalMyr exactly (qty=1 case); residue lands on LAST; missing price → 0 weight (no NaN); 3×equal → 33.33/33.33/33.34.
- [ ] **TDD battery (the acceptance bar):** combo-override-even-if-pricier; extras-beyond-slots at full price; combo covers only matched subset; mirror fallback doesn't double-charge (C1); no-match → à-la-carte; fabric-tier delta stacks; PRICE_1 delta = 0; per-height combo price selection; height with no combo price → à-la-carte; reclinerExtra stub = 0; Σ-exact explode. Mirror the 2990s test cases in `2990s/packages/shared/src/__tests__/sofa-combo-pricing.test.ts` where applicable.
- [ ] Green (shared, all new tests + 233 baseline). **Commit** `feat(shared): sofa pricing engine — computeSofaPrice + Kuhn combo match + explodeSofaBuild (TDD)`

### Task 4: API — catalog GET returns `sofaCombos`; principal-gated sofa-combo CRUD
**Files:** `apps/api/src/routes/catalog.ts` (+ `catalog.test.ts`)
- [ ] GET `/api/catalog` adds `sofaCombos` (each row mapped via `Adapters.sofaComboFromRow`; non-principal sees only `active && !discontinued`, principal sees all — mirror the combos branch `catalog.ts:229-243`). Add `SOFA_COMBO_PRICING` to the `Promise.all` + error-check + `catalogResponseSchema.parse`.
- [ ] Principal-gated CRUD (mirror POST/PATCH/DELETE `/combos` verbatim): `const SOFA_COMBO_PRINCIPAL_MSG = "Only the principal (Master Admin) can manage sofa combos"`. POST/PATCH `/catalog/sofa-combos` (+ `:id`), DELETE soft (`active:false, discontinued_at`). `principalOnly(c, MSG)` + `parseJsonBody(c, sofaComboCreateInput/PatchInput)` + `userClient` + `mapPgError` + `updated_at`/`updated_by` stamp. Empty patch → 422.
- [ ] TDD (mocked Supabase): GET shape (sofaCombos present + active-filter for non-principal); principal 200 / non-principal 403 (`/Master Admin/i`) on each write; PATCH/DELETE 404; canonical slots stored (sort codes within slot + slots by first code, mirror 2990s `canonicalizeComboModulesForStorage` — OR fold canonicalization into Task 3 and call it here).
- [ ] Green (api 784/787 baseline, add none). **Commit** `feat(api): catalog returns sofa combos; principal-gated sofa-combo CRUD`

### Task 5: web — sofa-combo maintenance UI (principal-only)
**Files:** `apps/web/src/pages/catalog/**` + `apps/web/src/lib/queries.ts` (+ tests)
- [ ] Hooks `useCreate/Update/DeleteSofaCombo` (mirror combo/sofa-fabric hooks; invalidate `["catalog"]`).
- [ ] A sofa-combo editor (in the P&M Combos tab as a "Sofa Combos" section, OR a sub-panel — match the existing Combos tab pattern): list model's combos; modal editor with (a) **slots editor** — ordered list of OR-sets, each slot picks ≥1 compartment `code` from the model's offered set (reuse the searchable picker pattern from CombosTab `SkuPicker`, but over the model's `modelSofaCompartments`); (b) a **`prices_by_height` grid** — one RM input per `SOFA_HEIGHTS` (blank = null = combo n/a at that height); (c) tier select (Any / P1 / P2 / P3); (d) effective_from; (e) active toggle. Live preview: for a sample build, show which combo matches + the resolved price (calls `computeSofaPrice` client-side — proves the engine end-to-end).
- [ ] Principal-gated (non-principal read-only; no Add/Edit/Delete). zod `safeParse` gates Save. v17/2990s look, Lucide.
- [ ] Component tests (principal edits; non-principal read-only; slots round-trip; prices-by-height round-trip). Green (web 676/681 baseline). **Commit** `feat(catalog): Sofa Combos maintenance (slots + prices-by-height, principal-only)`

### Task 6: green gate + PR + deploy decision
- [ ] Final gate: shared+api+web at baselines (zero new fails); `grep -ri SERVICE_ROLE apps/web/dist` = 0 (§4.4); branch not behind main (`git log HEAD..origin/main` empty).
- [ ] Independent adversarial review of the whole branch (opus) — esp. Task 3 math (Kuhn correctness, Σ-exact, mirror C1, combo-even-if-pricier).
- [ ] PR `feat: sofa engine Phase 2 — pricing engine + sofa-combo model`. **Deploy decision with Loo** (additive, principal-only maintenance + pure engine with no order-side consumer yet — safe to ship standalone OR batch with Phase 3/4). Update the roadmap doc + CLAUDE.md §17 + memory + phase-10-worklog + SDD ledger.

## Self-review / open sub-decisions (resolve in-task)
- **`model_id` FK vs `base_model` text** — chose model_id uuid FK (Carres-idiomatic, matches 0178). The explode `itemCode = {BASE_MODEL}-{code}` (P4) reads `product_models.base_model`/code then — not a P2 concern.
- **Slots store compartment `code` strings** (not compartment uuids) — faithful to 2990s + survives compartment re-id; the matcher works on codes (= the build cells' moduleCodes). Confirm at Task 1.
- **Canonicalize slots on save** (sort within slot + sort slots) so equivalent combos persist identically — decide Task 3 (pure helper) vs Task 4 (API). Recommend a pure `canonicalizeSofaSlots` in Task 3, called by the API.
- **Fabric delta inside `computeSofaPrice`** (chosen) vs caller-applied (2990s applies outside). Inside = one source of truth for Carres; the explode distributes `total` (incl. fabric delta), faithful to 2990s server `authoritativeSofaSen = sofaSellingSen + fabricAddonCenti` (`mfg-pricing-recompute.ts:552`).
- **`sofa_fabrics.tier` DB-lock CF** (`fabric-tier-db-lock-sofa-fabrics-tier`) — once combo pricing keys off tier, the tier label is a price input. Fold a 0175-style trigger on `sofa_fabrics.tier` into Task 1 (or file as a deferred CF if Loo prefers v1 UI-gate-only). Recommend: add the trigger in 0179 (cheap defense-in-depth).

## Contract safety
Additive table + pure functions + a catalog GET field + CRUD routes + a maintenance UI. `create_order` / `order_lines` / order zod / `DraftLine` / the existing `SofaConfigurator` price path UNTOUCHED. No POS/order behaviour change in Phase 2. The engine has no order-side consumer until Phase 4.
