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

---

## LOCKED by Loo (2026-07-25, same day) — answers to the decision list

1. **Collection = Stripe auto-debit.** Rental products sync to Stripe (Product + recurring monthly Price); Stripe issues the invoices too. See the Stripe capability notes below.
2. **RENT-TO-OWN**: after month 84 is paid, the system automatically issues the customer a **request-to-buy form to sign** → ownership transfers to the customer.
3. **Default**: Carres repossesses the unit; the residual can settle slowly afterwards. **Early exit = BUYOUT**: e.g. at month 50 the customer pays the remaining term in one shot.
4. **Service packages are OURS to set, by visit count**: some 2/year, some 3/year, some 4/year — `visits_per_year` is configurable per package (not fixed at 3).
5. **Everyone can sell it.** Commission = % of each month's collected revenue. A big HIERARCHY comes later (→ the parallel HR line's 0245_hr_commission work); for now a **flat base**: e.g. of RM45–59 collected, **20% to the dealer/salesperson**. Separately a **fixed supplier rate**: of every RM59 collected, **49% to the supplier**. Both recorded in finance per collection (rental_billings.supplier_share / commission_share).
6. **Rented-out unit = a rent-out ASSET**: it has left the warehouse (DO'd out) but sits "in the middle of rental stock" → its own registry (`rental_stock_units`, RU-codes), each unit tracks its full service records + warranty claims via `rental_unit_events`.
7. **Cleaning-partner tab: NEXT phase** — base first (visits carry a free-text partner until then).

## Stripe capability notes (to live-verify once the MCP OAuth completes)

- **Recurring monthly in MYR**: Stripe Billing subscriptions — supported. A fixed 84-month term uses a **subscription schedule** (phase with 84 iterations, end_behavior=cancel).
- **Product sync**: one Stripe Product per rentable SKU + a recurring monthly Price (e.g. RM59/mo); plan authoring in the P&M Rental tab pushes/updates the Stripe object (sell-lane phase).
- **"Auto-debit" reality in Malaysia**: Stripe MY recurring = **card-on-file** (credit/debit). FPX is one-time only (no recurring mandate); DuitNow AutoDebit / bank eMandate is NOT on Stripe — if true bank-account debiting is required later, that's a different rail (e.g. Curlec). Day-1: card recurring via Stripe + manual transfer fallback recorded at POS.
- **Invoices**: every subscription cycle auto-generates a **Stripe Invoice** (hosted page + PDF + email). ⚠ Stripe does NOT file Malaysia LHDN MyInvois e-invoices — that compliance layer stays ours (consolidated e-invoice or middleware; open item).
- **Failed payments**: Stripe Smart Retries + `invoice.payment_failed` webhooks feed the dunning ladder (the locked D0/3/7/14/21/30/60 cadence).
- Existing wiring to extend: 0223 stripe-checkout route + `/stripe` webhook in apps/api.

## Base SHIPPED (this line, 2026-07-25) — migrations 0247-0249

- **0247_customers** — the first customer entity (canonical `phone_key`, one row per phone).
- **0248_rental_config** — `service_packages` (duration × visits/year × price × optional service SKU) + `rental_plans` (sku × term × monthly fee + supplier_rate_pct / commission_base_pct + included package). Principal-only writes.
- **0249_rental_agreements** — `rental_agreements` (RA-1001…, full rent-to-own status machine incl. buyout/ownership_transferred/repossessed + stripe_customer_id/stripe_subscription_id stubs) + `rental_billings` (per-month schedule + supplier/commission split fields + stripe_invoice_id) + `rental_stock_units` (RU-1001… asset registry) + `rental_unit_events` (service/warranty history) + `service_entitlements` + `service_visits`. All RLS internal-only, all DORMANT.
- Web: P&M **Rental** tab (`?section=rental`, config editors) + internal-portal **Rental** page (`?tab=rental`, agreements + units registry, read-only). API: `/api/rental/*` config CRUD (principal) + registry reads (internal).

**Next phases**: ① POS rental sell lane + Stripe product sync/subscription create + entitlement minting (incl. free-gift attach), ② billing/dunning engine (Jess line's locked cadence), ③ cleaning-partner tab + visit scheduling ops, ④ customer check surface (staff lookup → OTP page), ⑤ LHDN e-invoice decision.

---

## LOCKED by Loo (2026-07-26) — the agreement, the settlement lane and the approver gate

**Naming**: the module is **Rental**. Not "Rental On", not "Rental setting".

**Where it lives**: Rental left Product & Maintenance and is its own Admin tab
(`?tab=rental-setting`), filed by product family (`?section=mattress|bedframe|sofa|service`).
It is a SETTINGS surface only — collections, service visits and the rented-out fleet stay
operations. SKUs still live in SKU Master.

### 1. The agreement document (Loo's Word file, v5_260706)

- The uploaded T&C is printed **verbatim**; the system only fills the blanks and stamps the
  signature. The customer signs at the sales order — **no signature, no order**, therefore no
  draft state exists.
- **CORRECTION (2026-07-26, shipped as 0279).** "Signs at the sales order" became literally
  impossible when 0275 moved the Sales Order behind finance approval: read as written it forces
  either a draft state (which the line above forbids) or a signature that arrives after the
  contract. **The signature attaches at agreement BIRTH** — which IS the counter moment the clause
  means — and the SO the approval mints inherits it. The rule is unchanged in substance and now
  enforced by construction: `create_rental_agreement` refuses without a signature, and
  `rental_approve_agreement` refuses to approve an unsigned application, so no signature means no
  agreement means no order. Two things the spec did not anticipate, both structural: a store JWT
  cannot READ `rental_agreement_templates` (RLS internal-only) and cannot WRITE to the
  `rental-agreements` bucket (`is_internal()` INSERT policy) — so the wording is served by a
  definer function and the signature bytes travel through Hono, written with the service client.
- **The free service package must NOT appear in the agreement.** It is a promotion, not a term
  of the rental — the document stays a pure rental agreement. (The `service.included` token is
  dropped from the field map.)
- Gaps found by reading the file (wording is Loo's / his lawyer's call, NOT ours to invent):
  1. the T&C says the product stays the Company's property with **no ownership transfer** — the
     business is rent-to-own, so an ownership-transfer clause is missing;
  2. **no early-buyout clause**, though buyout is a locked business rule (see §2 below);
  3. clause 1.2 says rental **excludes** maintenance/servicing — an exception is needed if a care
     plan rides along free;
  4. payment is due **on or before the 7th** each month with **8% per month** late interest —
     the billing engine must match that calendar and that rate;
  5. participation is **subject to credit assessment** — that is the approver gate in §3.
- Entity on the paper: **Carress Sdn. Bhd. (202401055306 / 1601150-X)**.

### 2. Buyout / one-time settlement

- A customer may settle the remaining term in one payment at any time.
- **Operation/Finance gets a Settlement action**: when a customer elects to settle, finance
  **clears the payment off** from the finance surface (the remaining months close in one move).
- A **supporting document** rides the settlement: the customer signs it first, then it is
  **attached** to the agreement (same upload discipline as the DO/POD attachments).

### 3. Stripe — penalty yes, auto-terminate no

- **8%/month late interest is NOT a native Stripe feature.** Stripe Billing has dunning retries,
  not percentage interest. The engine computes the penalty and pushes it onto the next invoice as
  a one-off invoice item — supported, and it keeps the arithmetic ours (auditable).
- **No auto-termination.** The subscription is configured so a failed payment leaves the
  subscription past-due/unpaid rather than cancelling it. Six consecutive missed months is a
  MANUAL termination by Carres (the contract's right, exercised by a person).

### 4. Approver page (new tab)

- Flow: sales takes the order + customer signature → the order lands on a **finance Approver
  page** (new tab) instead of going straight to operations.
- The page shows the customer's particulars; **later** it calls the **CBM API** to verify them
  (the hook is planned, not built now).
- **Approve** → the sales order moves on to operations. **Reject** → the order fails.
- This is the system's implementation of the T&C's credit-assessment clause.


### 5. The offer-tab design is LOCKED to the approved mock

Loo, 2026-07-26: the Rental **offer** surface follows the approved artifact —
https://claude.ai/code/artifact/c6ea9f74-23ac-47a9-b198-7df5cadb3c79 — and the POS lane
must speak the same language:

- two lanes per offer: **Rent** (monthly, per variant / compartment / combo) and **Buy**
  (one-off), each with its own free-gift cell;
- every option value carries a **one-time** and/or **monthly** price, with the
  over-the-term figure shown;
- fabric drills **series → colour** (open 4 of 16 if that is the offer);
- manual **surcharge slots**, principal-authored, ticked but never typed by a store;
- a **service-plan block** whose plans are SKUs;
- category-driven editors: a mattress shows sizes and price only; legs / divan / gaps /
  fabric belong to the bed frame; a sofa swaps the size axis for compartments and combos.

Anything built later — POS configure page, signing view, the printed agreement — reads
the same fields and uses the same words as that mock. Do not reinvent the vocabulary.
