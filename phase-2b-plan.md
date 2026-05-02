# Phase 2B — Dealer: New Order Wizard

> **Slice 2 of 5 within Phase 2.** This is the BIGGEST single feature in Phase 2.
> Honest re-estimate after reading prototypes: **15-20h focused work**, not 6-8h
> as the master-plan top-level had it. Recommend sub-slicing into 2B.1-2B.3.

---

## Why the scope is bigger than the original plan implied

Reading the 6 prototype files for this slice:

| File | LOC | Scope |
|---|---|---|
| `proto/new-order.jsx` | 190 | Wizard shell + step machine + ThankYou |
| `proto/new-order-step1.jsx` | 262 | Customer + delivery + outlet/SP picker + emergency contact compose |
| `proto/new-order-step2.jsx` | 492 | Product picker (cat→model→variant) + 3 category configurators (Mattress, Bedframe, Sofa-preset/custom + fabric surcharge) + Add-ons + Floor surcharge UI |
| `proto/new-order-step3.jsx` | 405 | Overview + canvas signature pad + payment slip picker + 3 payment methods (online / credit / installment) + min-deposit gate |
| `proto/dealer-products.jsx` | 227 | Catalog browse (separate from wizard picker but reads same data) |
| `proto/dealer-action-modals.jsx` | 542 | Reused customer modals (only ~100 lines relevant to 2B) |
| **Total relevant** | **~1700** | |

Production reference (`reference/production/src/pages/dealer/DealerNewOrder.tsx`) ports
this to 911 lines of TS+React. We'll hit similar density.

---

## Recommended sub-slicing (3 slices)

### Slice 2B.1 — Read-only catalog + outlet/SP read APIs · ~2-3h

**Ships:**
- API: `GET /api/catalog` (returns models + skus + sofa_fabrics + addons + floor_config in one bundle, RLS-public-read)
- API: `GET /api/outlets` + `GET /api/salespersons` (RLS-scoped to dealer)
- Web: `DealerProducts.tsx` — catalog grid (mattress / bedframe / sofa cards)
- Web: enable Products + Settings sidebar items (drop the "soon" tooltip; Settings is just a stub)
- Updates `lib/queries.ts` with `useCatalog`, `useOutlets`, `useSalespersons`
- Tests: 3 API tests + 1 E2E (dealer browses products page)

**Why first:** Wizard Step 1 picks outlet/salesperson; Step 2 picks from catalog.
Both have to exist before the wizard works. This slice is the foundation.

### Slice 2B.2 — Wizard shell + Step 1 (customer + delivery) · ~3-4h

**Ships:**
- Web: `DealerNewOrder.tsx` — modal shell with 3-step stepper + draft state mgmt
- Web: `pages/dealer/new-order/Step1Customer.tsx` — customer fields, address (structured),
  emergency contact composer, billing-same toggle, delivery date + TBD
- "+ New order" CTA on Dashboard + Orders page
- Cancel button + Continue gate (validates Step 1)
- Tests: 1 E2E (open modal → fill Step 1 → "Continue" enabled when valid)

**No backend yet** — wizard is frontend-only for Steps 1-2. orders.create lands in 2B.3.

### Slice 2B.3 — Step 2 + Step 3 + orders.create + ThankYou · ~5-7h

**Ships:**
- Web: `pages/dealer/new-order/Step2Products.tsx` — `ProductPicker` with category tabs +
  3 configurators (Mattress: size; Bedframe: size+color+gap; Sofa: preset/custom + fabric).
  Add-ons checklist. Floor surcharge auto-computed. Line list with remove.
- Web: `pages/dealer/new-order/Step3Confirm.tsx` — overview + signature pad (HTML canvas) +
  payment slip uploader + 3 payment methods (online / credit / installment with months).
  Min-deposit gate (50% of total). T&C checkbox. Submit button.
- Web: `pages/dealer/new-order/ThankYou.tsx` — success modal with #DL + 3-step "what's next".
- API: `POST /api/orders` — single transaction inserts orders + order_lines + order_addons
  + initial order_history "Order created · X% deposit". Returns the new id + dl. zod
  validation of full payload.
- Adapter: `orderToInsertRow(...)` converts wizard draft → DB rows.
- Audit log: insert one entry per created order ("Created order DL-#### · RM ####").
- Tests: 4 API tests (create happy path + invalid payload + RLS rejects cross-dealer +
  audit row created) + 1 E2E (full wizard end-to-end → ThankYou → order appears in /dealer/orders).

---

## Cross-cutting concerns (apply to all 3 slices)

- **No `signature_url` storage in 2B yet.** Signature is captured as base64 PNG and
  stored in a new `orders.signature_url` field as a data URL (or skipped for 2B and
  added in Phase 4 alongside Storage bucket + signed URLs). **Decide in eng-review.**
- **No payment slip storage in 2B yet.** Payment slip URL stored same way (data URL or
  skipped). **Decide in eng-review.**
- **Locked unit_price snapshot.** When inserting `order_lines`, copy the SKU's current
  price into `unit_price` so future price changes don't re-cost old orders.
- **Order DL number auto-generated** by Postgres `orders_dl_seq` (already in schema).

---

## Open questions for eng-review

1. **Signature + payment slip storage strategy** — base64 data URL (cheap, works now)
   vs Supabase Storage bucket (proper, signed URLs, Phase 9 hardening). 2B-3-defer-able.
2. **Sofa configurator complexity** — full preset/custom with fabric surcharge OR
   start with preset-only and defer custom to a later slice?
3. **Outlet/SP picker logic** — duplicate the prototype's "showroom shared account"
   behavior in 2B.2, or treat it as a Phase 2E concern (showroom = a dealer variant)?
4. **Wizard URL state** — should the wizard live at `/dealer/orders/new?step=1` (deep-
   linkable) or as a transient modal over the current page?
5. **Catalog cache strategy** — TanStack staleTime 5 min (catalog rarely changes) vs
   1 hr (more aggressive).

---

## Out of scope for ALL of 2B (deferred to later phases)

- Mutations on existing orders (proceed, cancel, recordPayment, fixDate, editCustomer) → Phase 2C
- Top-up deposit modal (TopUpDepositModal) → Phase 2D
- Settings page (outlets CRUD + salespersons CRUD + deposit display) → Phase 2D
- Showroom shared-account flow (`currentSalespersonId` state) → Phase 2E
- Salesperson role outlet-scoping → Phase 2E
- Mobile bottom-tab nav + mobile-optimized wizard → Phase 2E

---

## Acceptance Checklist (final, applies after all 3 slices ship)

- [ ] Dealer can place a complete new order from Dashboard CTA
- [ ] Order appears in /dealer/orders Place tab immediately after submit
- [ ] Order detail (from Phase 2A) shows the new order's customer, items, total, history
- [ ] Audit log row appears for the create event
- [ ] All vitest cases pass (estimate: 12-15 new cases across 2B.1+2B.2+2B.3)
- [ ] All E2E specs pass (estimate: 6-8 new specs)
- [ ] Typecheck clean across 3 packages
- [ ] `service_role` audit gate passes
- [ ] `/design-review` rates wizard ≥ 8/10 (run after 2B.3)
- [ ] Tag `phase-2b-complete`

---

## Recommendation for THIS session

Given the session length already, **propose: write 2B plan only this session, then start
with Slice 2B.1 (catalog + DealerProducts read) in NEXT session.** 2B.1 is self-contained
and ships value (catalog browse) without forcing the full wizard in one go.

Alternative if Loo wants to push: do Slice 2B.1 today (~2-3h focused), pause, ship the
rest in subsequent sessions.

This plan is pre-eng-review. Run `/plan-eng-review phase-2b-plan.md` when ready to lock.
