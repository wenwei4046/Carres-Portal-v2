# POS 2990s Alignment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Carres dealer/showroom sales portal (the shared `DealerApp` POS) look, feel, and price like Loo's 2990s POS — while keeping Carres's stack, brand flame `#C44D2B`, and email login.

**Architecture:** Carres's dealer POS already copied the 2990s *shell* (catalog-first full-screen, 01/02/03 steps, floating cart FAB + right-slide drawer, sofa↔mattress/bedframe mutex). The gap is (1) visual/motion fidelity and (2) the pricing layer (cost/sell split + combos + fabric tiers) which Carres entirely lacks. We close it in 4 independently-shippable phases, re-expressing every 2990s pattern in Carres's Tailwind + shadcn + supabase-js stack (a literal port is impossible — 2990s is CSS-Modules + Drizzle and its `UI_REFERENCE.md` forbids Tailwind). Phase 1 (this doc, detailed) is the visual re-skin; Phases 2–4 (outlined here, each gets its own detailed plan) add the pricing layer and touch the schema.

**Tech Stack:** Vite + React 18 + TS + React Router 7 + Tailwind 3 + shadcn/ui + TanStack Query 5 + Zustand 5 (web) · Hono on CF Workers (api) · Supabase Postgres + RLS + RPCs · pnpm workspaces. Plans live in `docs/superpowers/plans/`.

## Global Constraints

- **Brand accent stays flame `#C44D2B`** (`--primary` / `--terracotta`, HSL `13 64% 47%`). Do NOT introduce 2990s orange `#E86B3A`. Loo decision 2026-06-20.
- **Login stays email + password** (Supabase Auth, browser→Supabase direct per CLAUDE.md §4.2). NO PIN layer.
- **Keep the existing stack** — Tailwind + shadcn + v17 tokens. No CSS Modules, no new UI lib, no drag library (CLAUDE.md §2). Re-derive 2990s patterns into v17 utilities; never import 2990s CSS.
- **v17 token NAMES are frozen** (`--primary`, `--base-*`, `--card`…). Re-skin ADDS new POS-scoped utilities/tokens; it does not flip existing v17 values (those are Loo-locked 2026-06-09).
- **v17 button hierarchy holds**: exactly one `.btn-hero` (flame) CTA per screen; `.btn-primary` = black workhorse; `.btn-danger` = red text on white.
- **Lucide icons only, stroke-width 1.75. Never emoji.** (2990s hard rule + Carres convention.)
- **Cards / drawers / modals are white over the cream page** — hierarchy from border + shadow, not tinted bg (v17 + 2990s agree; memory `feedback_modal_cream`).
- **Phase 1 changes NOTHING about pricing or the submit contract.** `DraftLine` / `WizardDraft` / `createOrderInputSchema` / `create_order` RPC are untouched — Phase 1 cannot regress orders.
- **Every phase ends green:** `pnpm --filter @carres/web build` + `pnpm typecheck` + the web/api/shared test suites at or above their documented pass counts (CLAUDE.md §17.1; 8 known pre-existing fails per §17.7 — do not "fix" those here, just don't add new ones).
- **Deployment is manual** (memory `project_deployment`): api `wrangler deploy --env production`; web `pnpm --filter @carres/web build` then `wrangler pages deploy ../web/dist --project-name=carres-portal --branch=main`. Loo deploys/approves; do not deploy without his go.
- **Schema is frozen (CLAUDE.md §7).** Phases 2–4 each require new numbered migrations (0175+) and, where they touch `create_order`, a §7 explanation + explicit Loo approval *in that phase's conversation* before the migration is written.

---

## Phase Roadmap

| Phase | Deliverable | Touches schema? | Touches `create_order`? | Effort | Ship independently? |
|---|---|---|---|---|---|
| **1 · Re-skin** (detailed below) | dealer/showroom POS looks & moves like 2990s (flame-kept): price-hero, flame selected-ring, soft ink shadows, page-enter/hover/press motion, 2990s-style cards/FAB/stepper/pay-cards/drawers | No | No | ~3–6 days | ✅ yes |
| **2 · Cost/Sell split** | Product Maintenance (principal = "Master Admin") gains a selling-price source distinct from cost; POS reads selling price; margin visible to principal | Yes (0175+) | Maybe (read-side only; recompute deferred) | ~1–2 wk | ✅ yes (additive column) |
| **3 · Fabric-tier pricing** | Replace today's single flat sofa-fabric surcharge with P2/P3 tier deltas (per-model override), maintained in Product Maintenance | Yes | No (price still client-snapshot v1) | ~1 wk | ✅ yes |
| **4 · Combo / bundle pricing** | Combo (set) pricing maintained in Product Maintenance; POS prices a matched combo; (sofa-split into per-module lines is a stretch) | Yes (new tables) | Likely (combo safest server-side) | ~3–5 wk | ✅ yes |

**Sequencing rationale:** Phase 1 is the headline ("make it look like 2990s"), is pure `apps/web`, zero-risk to orders, and gives Loo something to see immediately. Phases 2–4 are *additive* pricing (Carres has none today), build on each other (2 is the selling-price foundation 3 & 4 ride on), and each hits §7 — so each gets its own brainstorm + detailed plan + Loo-approved migration when we reach it. **Do not start Phase 2 schema work from this doc** — it is an outline pending its own plan.

---

# PHASE 1 — POS Re-skin (detailed)

**Scope:** Only the dealer POS surfaces under `apps/web/src/pages/dealer/` (the POS that `dealer` / `salesperson` / `showroom` all mount). Back-office `DealerChrome` pages (Orders/Products/Settings) are out of scope for v1. No pricing/logic/contract changes.

**Verification model:** This is visual-fidelity work, so each task verifies with: (a) `pnpm --filter @carres/web build` clean, (b) `pnpm typecheck` clean, (c) the web test suite still green at ≥ documented count (no new regressions), and (d) `/design-review` on the changed surface for **layout + motion fidelity** against the 2990s reference (`reference` repo at `C:\Users\wenwe\Projects\2990s\prototype\pos-*` + `pos-styles.css`; colour target is flame, NOT 2990s orange). TDD does not fit CSS tokens; where a task changes component *logic*, keep its existing unit test green.

**The 2990s visual contract to reproduce (flame-adapted), from the cross-check `n_look` report:**
- **Selected/in-cart state** = accent border + `0 0 0 3px rgba(flame,0.16)` ring — identical treatment on every selectable card (product card in-cart, pay-card, config option, category active).
- **Price = the hero**: Archivo Black, `font-stretch ~80%`, weight 900, letter-spacing `-0.02em`, flame/burnt colour; "RM" is a smaller, slightly-muted superscript so the number dominates. Sizes: product card 22px · cart line 16px · cart total 26px · confirm summary total 36px.
- **Cards**: white, radius 16 (`rounded-2xl`), soft *ink-tinted* shadow, 4:3 photo top (placeholder uses a branded glyph — Carres already does this), badge top-left, round add button bottom-right.
- **Shadows**: soft, low-contrast, ink-tinted `rgba(17,24,39,a)` — never glossy/coloured (except the flame primary-button glow). Card rest ≈ `0 1px 2px`; card hover ≈ `0 12px 24px rgba(17,24,39,0.10)`; drawer ≈ `0 12px 32px`.
- **Motion (single tempo)**: easing `cubic-bezier(0.22,1,0.36,1)`. Page/step enter = 320ms opacity 0→1 + translateY(10px)→0 on step change. Card hover = translateY(-2px) + shadow grow, ~200ms. Button press = scale(0.98), ~100ms. Add-to-cart = one-shot pulse scale 1→1.15→1, 280ms. Toast = slide-up from bottom, ~200ms in / 1600ms life. Drawer = slide-in-right ~260ms + scrim `rgba(17,24,39,0.40)` + `blur(4px)`. **Honour `prefers-reduced-motion: reduce`** (disable enter + hover transforms).
- **FAB** (cart): fixed bottom-right 24px, ink pill, flame icon tile, micro-label + amount, flame count badge. (Carres's `FloatingCartButton` is currently a flame `btn-hero` pill — restyle to the ink-pill-with-flame-tile shape.)
- **Step-pill / stepper**: active = white bg + flame border + flame number; done = green tint + green number.
- **Pay-card grid**: payment methods as a card grid; selected = flame ring (not a `<select>`).
- **Inputs**: white, 1.5px border, radius 12, focus = flame border (no glow box-shadow on plain inputs).
- **Lucide @1.75** everywhere; replace any non-Lucide glyph/emoji.

### File structure (Phase 1)

- **Foundation (shared):**
  - Modify `apps/web/index.html` — add Archivo (wdth+wght) Google Font.
  - Modify `apps/web/tailwind.config.ts` — add `fontFamily.price`, motion keyframes/animation.
  - Modify `apps/web/src/index.css` — add POS-scoped `@layer components` utilities (`.pos-price`, `.pos-card`, `.pos-ring` selected-state, `.pos-fab`, `.pos-step-pill`, `.pos-pay-card`, `.pos-drawer-scrim`) + `@keyframes` + reduced-motion guard. **Reuses the existing `--primary` flame token — adds nothing to `:root` except, if needed, a `--pos-ring` alpha helper.**
- **POS shell:** `apps/web/src/pages/dealer/DealerPos.tsx`, `pos/PosStepper.tsx`.
- **Catalog step:** `pos/CatalogStep.tsx`, `pos/CategoryRail.tsx`, `pos/ProductCard.tsx`, `pos/AddonsPanel.tsx`, `pos/FloatingCartButton.tsx`.
- **Drawers:** `pos/ConfigureDrawer.tsx`, `pos/CartDrawer.tsx` (+ the configurator option controls in `new-order/configurators.tsx` — visual only, keep DraftLine output identical).
- **Customer step:** `pos/CustomerStep.tsx`, `new-order/Step1Customer.tsx`, `new-order/Step3Delivery.tsx`, `pos/StairCarryFields.tsx`.
- **Confirm step:** `new-order/Step3SignaturePayment.tsx`, `new-order/PaymentSlipPicker.tsx`, `new-order/ThankYou.tsx`.

---

### Task 1: Visual foundation — fonts, tokens, motion, POS utilities

**Files:**
- Modify: `apps/web/index.html:10-13` (font link)
- Modify: `apps/web/tailwind.config.ts:96-118` (fontFamily) and `:124-131` (keyframes/animation)
- Modify: `apps/web/src/index.css` (`@layer components` + new `@layer utilities` keyframes)

**Interfaces:**
- Produces: Tailwind class `font-price`; component utilities `.pos-price` / `.pos-price-rm`, `.pos-card`, `.pos-ring` (+ `.is-selected`), `.pos-fab`, `.pos-step-pill` (+ `.is-active`/`.is-done`), `.pos-pay-card` (+ `.is-selected`), `.pos-drawer-scrim`; animation classes `animate-page-enter`, `animate-cart-pulse`. All consumed by Tasks 2–6.

- [ ] **Step 1: Add the Archivo price font.** In `apps/web/index.html`, extend the first Google Fonts `<link href=…>` to include the Archivo width+weight axis. Append `&family=Archivo:wght@600;700;800;900` to the existing `css2?…` query (Archivo's static 900 = the price-hero weight; we apply `font-stretch` via CSS in Step 3).

- [ ] **Step 2: Register the price family in Tailwind.** In `apps/web/tailwind.config.ts` `fontFamily`, add:
```ts
price: ["Archivo", "Inter", "system-ui", "sans-serif"],
```

- [ ] **Step 3: Add the POS component utilities to `index.css`.** Inside the existing `@layer components` block, append (flame is `--primary`):
```css
  /* ===== 2990s-style POS surfaces (Phase 1, flame-kept). Scoped to the
   * dealer POS; pure presentation, no token-value changes to :root. ===== */

  /* Price hero — Archivo Black, condensed, flame. RM is a muted superscript. */
  .pos-price    { @apply font-price font-black tracking-[-0.02em] text-primary;
                  font-stretch: 80%; font-variant-numeric: tabular-nums; }
  .pos-price-rm { @apply font-price font-semibold align-top opacity-70;
                  font-size: 0.6em; margin-right: 0.12em; }

  /* Card — white, radius 16, soft ink shadow, hover lift. */
  .pos-card {
    @apply bg-white rounded-2xl transition-[transform,box-shadow] duration-200;
    border: 1.5px solid rgba(17,24,39,0.06);
    box-shadow: 0 1px 2px rgba(17,24,39,0.05), 0 1px 1px rgba(17,24,39,0.03);
  }
  @media (hover:hover) and (pointer:fine) {
    .pos-card:hover { transform: translateY(-2px);
                      box-shadow: 0 12px 24px rgba(17,24,39,0.10); }
  }

  /* Selected / in-cart ring — flame border + 3px translucent flame ring. */
  .pos-ring.is-selected {
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.16);
  }

  /* Cart FAB — ink pill, flame icon tile, count badge. */
  .pos-fab {
    @apply fixed bottom-6 right-6 z-50 inline-flex items-center gap-3
           rounded-[18px] bg-base-900 text-white pl-2 pr-4 py-2
           transition-transform duration-150;
    box-shadow: 0 8px 18px rgba(17,24,39,0.20);
  }
  .pos-fab:hover { transform: translateY(-2px); }
  .pos-fab:active { transform: scale(0.98); }

  /* Step pill — active white+flame, done green. */
  .pos-step-pill { @apply inline-flex items-center gap-2 text-[13px] font-semibold text-base-500; }
  .pos-step-pill .num { @apply inline-flex h-6 w-6 items-center justify-center rounded-full
                               border border-base-300 text-[12px]; }
  .pos-step-pill.is-active { @apply text-base-900; }
  .pos-step-pill.is-active .num { @apply border-primary text-primary bg-white; }
  .pos-step-pill.is-done .num   { @apply border-success text-success bg-success-soft; }

  /* Pay-card — selectable payment method tile. */
  .pos-pay-card {
    @apply pos-ring bg-white rounded-xl px-4 py-3 text-left transition-shadow;
    border: 1.5px solid rgba(17,24,39,0.10);
  }

  /* Drawer scrim — ink wash + blur (matches v17 white-drawer convention). */
  .pos-drawer-scrim { @apply fixed inset-0 z-40;
                      background: rgba(17,24,39,0.40); backdrop-filter: blur(4px); }
```

- [ ] **Step 4: Add motion keyframes + reduced-motion guard.** Append a new `@layer utilities` block at the end of `index.css`:
```css
@layer utilities {
  @keyframes pos-page-enter { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
  @keyframes pos-cart-pulse { 0%{transform:scale(1)} 50%{transform:scale(1.15)} 100%{transform:scale(1)} }
  .animate-page-enter { animation: pos-page-enter .32s cubic-bezier(0.22,1,0.36,1) both; }
  .animate-cart-pulse { animation: pos-cart-pulse .28s cubic-bezier(0.22,1,0.36,1); }
  @media (prefers-reduced-motion: reduce) {
    .animate-page-enter, .animate-cart-pulse { animation: none; }
    .pos-card { transition: none; }
  }
}
```

- [ ] **Step 5: Verify foundation builds.** Run `pnpm --filter @carres/web build` and `pnpm --filter @carres/web typecheck`. Expected: both clean (utilities unused yet is fine — Tailwind `@layer components` are emitted; the `animate-*`/`font-price` classes are referenced from CSS/config so JIT keeps them once used in Tasks 2–6).

- [ ] **Step 6: Commit.**
```bash
git add apps/web/index.html apps/web/tailwind.config.ts apps/web/src/index.css
git commit -m "feat(pos): add 2990s-style POS visual foundation (Archivo price font, flame ring, soft shadows, motion)"
```

---

### Task 2: POS shell — top bar + step-enter motion

**Files:**
- Modify: `apps/web/src/pages/dealer/DealerPos.tsx`
- Modify: `apps/web/src/pages/dealer/pos/PosStepper.tsx`

**Interfaces:**
- Consumes: `.pos-step-pill`/`.is-active`/`.is-done`, `.animate-page-enter` (Task 1).
- Produces: the re-skinned shell every step renders inside.

- [ ] **Step 1: Restyle `PosStepper`** to the 2990s step-pill: render each of `01 CATALOG · 02 CUSTOMER · 03 CONFIRM` as `.pos-step-pill` with `.is-active` for the current step and `.is-done` for completed (still back-clickable only — keep the existing click logic). Numbers in the `.num` circle. Keep the existing component API/props.
- [ ] **Step 2: Top bar polish** in `DealerPos.tsx`: keep `CarresLockup` + role label + cart pill + Exit + avatar, but align to the 2990s 56px fixed top bar feel (white bar over cream, hairline bottom border `border-b border-base-200`, comfortable spacing). Do not change behaviour (cart pill opens drawer, Exit guard, etc.).
- [ ] **Step 3: Step-enter motion**: wrap the step body switch so the active step container gets `key={step}` + `className="animate-page-enter"`, so each 01→02→03 transition plays the 320ms lift+fade. Verify `prefers-reduced-motion` disables it (Task 1 guard).
- [ ] **Step 4: Verify.** `pnpm --filter @carres/web build` + `typecheck` clean; `pnpm --filter @carres/web test` green at ≥ documented count; run `/design-review` on the POS shell (top bar + stepper + step transition) against 2990s `prototype/pos-styles.css` `.pos-topbar` / `.step-pill`.
- [ ] **Step 5: Commit.**
```bash
git add apps/web/src/pages/dealer/DealerPos.tsx apps/web/src/pages/dealer/pos/PosStepper.tsx
git commit -m "feat(pos): 2990s-style POS top bar + step-pill stepper + step-enter motion"
```

---

### Task 3: Catalog step — product cards (price hero), category rail, FAB

**Files:**
- Modify: `apps/web/src/pages/dealer/pos/ProductCard.tsx`
- Modify: `apps/web/src/pages/dealer/pos/CategoryRail.tsx`
- Modify: `apps/web/src/pages/dealer/pos/CatalogStep.tsx`
- Modify: `apps/web/src/pages/dealer/pos/AddonsPanel.tsx`
- Modify: `apps/web/src/pages/dealer/pos/FloatingCartButton.tsx`

**Interfaces:**
- Consumes: `.pos-card`, `.pos-ring`/`.is-selected`, `.pos-price`/`.pos-price-rm`, `.pos-fab`, `.animate-cart-pulse` (Task 1).

- [ ] **Step 1: `ProductCard`** → `.pos-card` shell, 4:3 photo/placeholder top, badge top-left (cream pill, flame uppercase kicker via `.kicker`), the "From RM x" price rendered with `.pos-price` (number) + `.pos-price-rm` (the "RM"/"From" superscript), round flame add-affordance bottom-right. When the model has lines in the cart, apply `.pos-ring.is-selected`. Keep the whole-card-button behaviour + locked/dim state.
- [ ] **Step 2: `CategoryRail`** → active entry = flame text + flame left-accent (not black); locked entries keep grey + lock glyph (Lucide `Lock`, stroke 1.75). Keep counts + mutex bounce logic.
- [ ] **Step 3: `CatalogStep`** → sticky toolbar (pill search input with flame focus border + series/section + count), auto-fill card grid `minmax(240px,1fr)`. On add, trigger the `.animate-cart-pulse` one-shot on the FAB (reuse existing pulse state; just swap the class). Keep `mergeLine`/toast logic.
- [ ] **Step 4: `AddonsPanel`** → add-on tiles as small `.pos-card`s; disposal add-ons keep the required-size control (red border until set) — purely restyle, keep the gate.
- [ ] **Step 5: `FloatingCartButton`** → `.pos-fab` (ink pill + flame icon tile holding a Lucide `ShoppingBag`/`ShoppingCart`, micro-label "CART" + the `cartTotalExStair` amount in `.pos-price`-ish treatment, flame count badge top-right). Keep disabled-when-empty + open-cart behaviour. NOTE: this remains the page's single hero CTA on step 1 (v17 rule); it's now ink-pill-with-flame-tile rather than a solid flame pill.
- [ ] **Step 6: Verify.** build + typecheck clean; `pnpm --filter @carres/web test` green (esp. `CatalogStep.test.tsx`, `catalog-index.test.ts`, `cart.test.ts` — restyle must not change logic); `/design-review` on the catalog grid + rail + FAB vs 2990s `.prod-card` / `.cart-fab`.
- [ ] **Step 7: Commit.**
```bash
git add apps/web/src/pages/dealer/pos/ProductCard.tsx apps/web/src/pages/dealer/pos/CategoryRail.tsx apps/web/src/pages/dealer/pos/CatalogStep.tsx apps/web/src/pages/dealer/pos/AddonsPanel.tsx apps/web/src/pages/dealer/pos/FloatingCartButton.tsx
git commit -m "feat(pos): 2990s-style catalog — price-hero cards, flame rail, ink-pill cart FAB"
```

---

### Task 4: Drawers — configure + cart (scrim/blur, selected-ring options, price treatment)

**Files:**
- Modify: `apps/web/src/pages/dealer/pos/ConfigureDrawer.tsx`
- Modify: `apps/web/src/pages/dealer/pos/CartDrawer.tsx`
- Modify: `apps/web/src/pages/dealer/new-order/configurators.tsx` (visual only — DraftLine output unchanged)

**Interfaces:**
- Consumes: `.pos-drawer-scrim`, `.pos-ring`/`.is-selected`, `.pos-price`/`.pos-price-rm`, `.pos-card` (Task 1).

- [ ] **Step 1: Drawer chrome** (both drawers) → white panel `460px`, slide-in-right ~260ms, over `.pos-drawer-scrim`. Keep them as the existing right-slide drawers; just apply the scrim + panel treatment + a hairline header.
- [ ] **Step 2: `configurators.tsx` option controls** → render size/colour/gap/fabric/preset choices as `.pos-ring` selectable chips/cards (selected = flame ring) and qty as a pill stepper (two round −/+ flanking a centered count). **Do not change `ConfiguratorForModel`'s DraftLine output** (attrs shapes, unitPrice math) — restyle the inputs only; keep `configurators.test.tsx` green.
- [ ] **Step 3: `ConfigureDrawer`** → header = model name + `.pos-price` for the live line price; keep the `key={model.id}` remount discipline (the SO-1006 guard). Add button stays the drawer's primary CTA.
- [ ] **Step 4: `CartDrawer`** → line rows with photo + name + qty pill stepper + remove (Lucide `Trash2`), line price in `.pos-price` (16px), subtotal foot, total in `.pos-price` (26px). "Proceed to Customer →" stays `.btn-primary` (black — the FAB/Add owns the flame). Keep `step2Valid` gate + first-disposal-issue hint.
- [ ] **Step 5: Verify.** build + typecheck clean; tests green (`configurators.test.tsx`, `cart.test.ts`); `/design-review` on both drawers vs 2990s `.cart-pop`/`CartContents` + configurator controls (layout only).
- [ ] **Step 6: Commit.**
```bash
git add apps/web/src/pages/dealer/pos/ConfigureDrawer.tsx apps/web/src/pages/dealer/pos/CartDrawer.tsx apps/web/src/pages/dealer/new-order/configurators.tsx
git commit -m "feat(pos): 2990s-style configure + cart drawers (scrim/blur, flame option rings, price hero)"
```

---

### Task 5: Customer + Confirm steps — fields, pay-card grid, signature, summary

**Files:**
- Modify: `apps/web/src/pages/dealer/pos/CustomerStep.tsx`
- Modify: `apps/web/src/pages/dealer/new-order/Step1Customer.tsx`
- Modify: `apps/web/src/pages/dealer/new-order/Step3Delivery.tsx`
- Modify: `apps/web/src/pages/dealer/pos/StairCarryFields.tsx`
- Modify: `apps/web/src/pages/dealer/new-order/Step3SignaturePayment.tsx`
- Modify: `apps/web/src/pages/dealer/new-order/PaymentSlipPicker.tsx`

**Interfaces:**
- Consumes: `.pos-pay-card`/`.is-selected`, `.pos-card`, `.pos-price`, `.label`/`.kicker` (existing), `.pos-ring` (Task 1).

- [ ] **Step 1: Field styling** (Step1Customer, Step3Delivery, StairCarryFields, CustomerStep wrapper) → inputs white + 1.5px border + radius 12 + flame focus border; field labels use the existing `.label` eyebrow; 2-col field grid where space allows; the customer column on a `.pos-card`. Keep ALL validation (`step1Valid`, `step3DateValid`, lead-time, proceed-date pairing, ASAP/TBD) untouched.
- [ ] **Step 2: Payment method as pay-card grid** in `Step3SignaturePayment` → render online/credit/installment as a `.pos-pay-card` grid; selected = `.is-selected` flame ring (replace any `<select>`/radio). Keep the required approval-code field (all methods), paid amount, 50/Full/Custom, `willProceed` banner.
- [ ] **Step 3: Signature + slip** → `SignaturePad` border goes solid flame when signed; `PaymentSlipPicker` as a dashed drop tile (camera on touch). Keep the 5MB cap + base64-into-draft behaviour.
- [ ] **Step 4: Summary recap** → the confirm recap reads like the 2990s `SummaryPanel`: order lines + big `.pos-price` (36px) total. Keep the footer Submit (`.btn-hero`) + `step4Valid && asapDepositOk` gate in `DealerPos`.
- [ ] **Step 5: Verify.** build + typecheck clean; web tests green; `/design-review` on customer + confirm vs 2990s `pos-handover.jsx` (form + pay-cards + signature + summary) — layout only, flame colour.
- [ ] **Step 6: Commit.**
```bash
git add apps/web/src/pages/dealer/pos/CustomerStep.tsx apps/web/src/pages/dealer/new-order/Step1Customer.tsx apps/web/src/pages/dealer/new-order/Step3Delivery.tsx apps/web/src/pages/dealer/pos/StairCarryFields.tsx apps/web/src/pages/dealer/new-order/Step3SignaturePayment.tsx apps/web/src/pages/dealer/new-order/PaymentSlipPicker.tsx
git commit -m "feat(pos): 2990s-style customer + confirm — field polish, pay-card grid, signature, summary hero total"
```

---

### Task 6: ThankYou + full-flow design pass + green gate

**Files:**
- Modify: `apps/web/src/pages/dealer/new-order/ThankYou.tsx`

- [ ] **Step 1: `ThankYou`** → 2990s confirmed-screen feel: success mark (Lucide `CheckCircle2` in a flame circle), `CO-{so}` heading, what's-next list, `Download Sales Order`, "+New order" (flame `.btn-hero`) / "View orders" (`.btn-secondary`). Keep both behaviours + the `CO-`/`SO-` prefix quirk exactly.
- [ ] **Step 2: Full-flow `/design-review`** end-to-end (catalog → configure → cart → customer → confirm → thankyou) for motion + layout fidelity + the single-flame-CTA-per-screen rule; fix any drift inline.
- [ ] **Step 3: Final green gate.** Run and record:
```bash
pnpm --filter @carres/web build
pnpm --filter @carres/web typecheck
pnpm --filter @carres/web test
```
Expected: build clean; typecheck clean; web tests ≥ documented pass count (CLAUDE.md §17.1, only the 5 known pre-existing web fails from §17.7). Record the bundle size delta.
- [ ] **Step 4: Commit + hand to Loo for live smoke.**
```bash
git add apps/web/src/pages/dealer/new-order/ThankYou.tsx
git commit -m "feat(pos): 2990s-style ThankYou + full-flow design pass"
```
Then: Loo manual-smokes on staging (POS sits behind a real dealer login — see carry-forward `pos-live-smoke`); on his go, deploy web per the manual deploy runbook.

---

## Phase 1 Self-Review

- **Spec coverage:** Re-skin to 2990s look (flame-kept) → Tasks 1–6 cover shell, catalog, drawers, customer, confirm, thankyou + foundation. Login unchanged ✅. Flame kept ✅. No pricing change ✅.
- **Placeholder scan:** Foundation CSS/config is concrete (Task 1). Component tasks specify the exact utilities + which behaviour to preserve; visual edits are pattern-level by necessity (CSS fidelity is gated by `/design-review`, not unit tests) — acceptable for a re-skin, not a placeholder.
- **Consistency:** Utility names (`.pos-card`, `.pos-ring`/`.is-selected`, `.pos-price`/`.pos-price-rm`, `.pos-fab`, `.pos-step-pill`, `.pos-pay-card`, `.pos-drawer-scrim`, `animate-page-enter`, `animate-cart-pulse`, `font-price`) are defined once in Task 1 and consumed verbatim in Tasks 2–6.
- **Risk:** Lowest-risk phase — zero schema/API/contract change; orders cannot regress. Main watch: keep every existing web test green (the restyle must not touch logic in `configurators.tsx` / `cart.ts` / `draft.ts`).

---

# PHASE 2 — Cost/Sell Split (outline — needs its own plan)

**Intent (Loo 2026-06-20):** principal = "Master Admin"; Product Maintenance defines the **Retail Selling Price** as a source distinct from cost (the 2990s model). Today Carres `product_skus.price` IS the selling price and cost lives only in PO/`CogsLineEditor`.

**Open design decisions for the Phase 2 brainstorm (do NOT decide unilaterally):**
1. **Where does cost live?** New `product_skus.cost` column vs a separate cost table vs promoting the existing PO/CogsLineEditor cost to SKU level. (2990s: price tables = cost, `sell_price` separate.)
2. **Does the selling price stay on `product_skus.price`** (principal-edited in SKU Master, POS keeps reading it) and we just ADD cost + a margin view? (Smallest change, matches "selling price already works.") Or do we introduce a 2990s-style derived-selling model?
3. **Server recompute?** Loo declined the 0.5% drift gate, so v1 likely keeps the client price-snapshot. Confirm we are NOT touching `create_order`'s trust model in Phase 2 (read-side + maintenance UI only).
4. **Access:** principal already mounts `ProductMaintenancePage` (`PrincipalApp`, `isPrincipal`). Confirm operation's access is unchanged (or scoped) — no new role.

**Likely shape (pending decisions):** migration 0175 adds `product_skus.cost` (additive, nullable) + RLS unchanged; `MaintenanceTab`/`SkuMasterTab` gain a cost field + margin readout for principal; adapters/zod extend with `cost`; POS untouched (still reads selling `price`). §7 explanation + Loo approval before the migration.

---

# PHASE 3 — Fabric-tier Pricing (outline — needs its own plan)

**Intent:** replace today's single flat sofa-fabric surcharge with 2990s-style **P2/P3 tier deltas** (flat MYR, per-model override, SOFA[+BEDFRAME?] only), maintained in Product Maintenance.

**Open decisions:** tier source table shape (global tier delta + per-model override, mirroring 2990s `fabric-tier-addon`); which categories (2990s = sofa + bedframe); how `sofa_fabrics` maps to tiers P1/P2/P3; whether the POS `SofaConfigurator` shows tier or just the resulting surcharge. Migration 0176+. Client price-snapshot stays unless Loo wants server recompute.

---

# PHASE 4 — Combo / Bundle Pricing (outline — needs its own plan)

**Intent:** combo/set pricing maintained in Product Maintenance; POS prices a matched combo. 2990s's engine (edge-contact union-find grouping + Kuhn bipartite combo match at PRICE_1 + always-apply override + sofa-split into per-module lines) is **very complex and 2990s-business-specific** — Carres almost certainly wants a simpler model.

**Open decisions (biggest phase):** combo data model (which SKUs/models form a set, the set price); match semantics (exact set vs subset-covers); does combo price live client-side or must `create_order` recompute it (combos are the case where server-side is safest — would touch the frozen RPC, §7 event); whether sofa-split into per-module SO lines is wanted at all. This phase gets a full brainstorm + spec before any migration.

---

## Carry-forwards this initiative should fold in (Phase 1 freebies where cheap)
- `pos-product-photos` — most models lack `photo_url`; cards show the branded placeholder. Phase 1 keeps the placeholder; real photos via the existing `product-model-photos` bucket later.
- `pos-web-shell-tests` — `DealerPos` state machine + routing still untested. Consider adding a `DealerPos` render/smoke test during Phase 1 Task 2 to lock the re-skinned shell.
- `pos-folder-rename` — reused blocks still under `dealer/new-order/`; out of scope here (tidy-up).
