# Rental + Service Plan — full-cycle proposal (Loo's angle, 2026-07-25 · DRAFT, not yet approved)

> Loo's ask (2026-07-25): a new "pay monthly / rental" product payment method (e.g. RM59 × 84 months), a new **Rental tab** in Product & Maintenance setting rental price + bound service plan; service plans (vacuum cleaning, 1yr = 3 visits every 4 months) can be FREE with a grand-product purchase or BOUGHT as a SKU (1/2/3-year variants); rental + service entitlements BIND to the customer so the customer can check their account (has rental? visits remaining?).
>
> **CRITICAL CONTEXT**: this is the SAME initiative as `docs/subscription-mattress-proposal.md` — the spec LOCKED on Jess's line 2026-07-22 (Sept 2026 hard launch, 5/7-year terms = 60/84 months, 3 cleanings/year every ~4 months, dunning ladder + Credit Bureau, feature-flagged). Loo's RM59×84 = that spec's 7-year plan. This doc does NOT fork it — it maps Loo's three NEW requirements onto the locked spec and lists the gaps.

## What Loo adds on top of the locked spec

1. **P&M Rental tab** (config surface): per-model rental pricing + term + bound service plan, authored by the principal — the locked spec has the 5-model/2-term business shape but no config surface; this is it. Plugs into `catalog-tabs.ts` (P&M lives in Admin since PR #254).
2. **Service plan as a standalone product**: the locked spec only bundles cleanings INSIDE a subscription. Loo decouples it — a service plan can attach to a NORMAL one-off sale, either FREE with a grand product (reuse P7 `model_default_free_gifts`: gift SKU = a service-plan SKU at RM0) or BOUGHT as a `service`-category SKU (1yr=3 visits; 2yr/3yr = 6/9 visits TBC).
3. **Customer binding + self-check**: entitlements bind to the CUSTOMER. NOTE — Carres has NO customer entity today (orders carry name/phone text; PWP binds by canonical `pwp_phone_key`). The locked spec's draft SQL references `customers(id)` but never creates the table — a real gap in both asks. A `customers` table (canonical phone key) is the shared foundation.

## Proposed full cycle (6 segments)

**A. Config (P&M "Rental & Service" tab)** — principal-only, dormant until authored:
- Rental plans: model → monthly fee per term (60/84 months per locked 5/7yr) → active.
- Service plan SKUs: `SVC-CLEAN-{1,2,3}Y` (visits 3/6/9, price, validity).
- Free-attach rules: which models gift which plan (P7 free-gift mechanism, zero new engine for the free path).

**B. Sell (POS)**:
- Rental lane: rentable model → term → monthly preview (RM59 × 84 = RM4,956) → customer name+phone MANDATORY → creates order (type subscription) + subscription + 84 billing rows + service schedule (per locked spec's signup transaction).
- Normal sale: service SKU in cart (bought or auto-gifted RM0) mints a service entitlement bound to the customer phone.

**C. Money**: pre-generated `subscription_billings`; collection = manual transfer + POS record day 1, auto-debit/Stripe recurring when banking rails picked; dunning D0/3/7/14/21/30/60 + Credit Bureau AS LOCKED (not re-litigated here).

**D. Service ops**: ONE entitlement engine, two sources (`subscription` | `sku_purchase` incl. free gift). Visits every ~4 months, partner booking, photo-proof completion decrements remaining — Jess's Services tab consumes it.

**E. Customer check**: phase 1 = staff lookup in POS (customer gives phone at the store); phase 2 = public page + WhatsApp/SMS OTP (the OTP channel arrives with dunning messaging anyway).

**F. End of life**: term completion (ownership outcome TBD — rent-to-own vs return vs renew), early termination (locked spec's own open gap #9), default → repossession flow.

## Gaps Loo didn't mention (decision list)

1. HOW the monthly RM59 is collected (auto-debit / card recurring / manual) — day-1 realistic answer = manual + record, rails later.
2. Month 84 outcome: mattress becomes the customer's? returned? renewed? (Locked spec silent too.)
3. Early termination / default policy — chase remaining? repossess? (= locked spec gap #9.)
4. Deposit — Jess LOCKED no-deposit; Loo to confirm alignment.
5. No customer entity exists — `customers` table + phone binding must be built FIRST.
6. Check-surface privacy (public page needs OTP; staff lookup doesn't).
7. Service plan details: 2/3-yr visit counts (6/9?), transferability, expiry, stacking free+bought.
8. Who sells rental — Carres showrooms only, or dealers too (commission?).
9. Rented mattress = Carres ASSET — per-unit tracking (`ops_stock_items` precedent), return/refurb.
10. Tax/invoice: monthly-fee e-invoice (LHDN mandate) + SST treatment.
11. External dependencies (locked spec Phase 0): supplier contract · Credit Bureau resumption · cleaning partner.
12. **Two-line coordination**: Jess's line owns the locked spec + 6-week timeline (ops module, billing, dunning); Loo's line naturally owns P&M config tab + POS sell + customers/entitlement foundation + check surface. Migration numbers in the locked spec (0256-0261) are placeholders — tail is 0243+, renumber at apply, guardrail #8 applies (drafts never into supabase/migrations before Jess approves).

## Recommended build order

P0 decisions above → P1 `customers` + entitlement engine (shared foundation) → P2 P&M Rental & Service tab (dormant) → P3 POS sell (rental lane + service attach) → P4 billing/dunning (Jess line per locked spec) → P5 ops Services/Collections tabs (Jess line) → P6 customer check (staff lookup → OTP page).

— Draft by Loo's line 2026-07-25, pending Loo's answers + reconciliation with Jess.
