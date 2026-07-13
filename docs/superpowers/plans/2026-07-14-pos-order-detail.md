# POS "My orders" — Order Detail drawer (2990s parity) — design

> 2026-07-14 · Loo's ask: clicking an order card in the POS My-orders board must open a
> POS-native order detail (NOT the back-office `DealerOrderDetail` overlay), replicating
> the 2990s My-orders drawer **exactly**: layout, the rules for when an order moves to
> Proceed, and what stays editable in the Proceed lane (products locked, customer
> details/payment still editable). Standalone inside the POS — never navigates to the
> operation portal.
>
> Layout contract: `prototype/pos-order-status.jsx` `OrderDetail` (lines 264-527) — the
> Carres adaptation of the 2990s drawer. CSS classes (`os-detail*`, `os-section`,
> `os-field`, `os-pay*`, `os-slip*`, `os-checklist`, `os-check`, `os-tick`) already exist
> in `apps/web/src/styles/pos-prototype.css`.
> Behaviour contract: 2990s `apps/pos/src/pages/OrderStatus.tsx` OrderDetail +
> `docs/specs/2026-06-13-pos-proceed-edit-spec.md` (in the 2990s repo).

## 1. Lane + edit-scope model (Carres mapping of 2990s `getSoEditScope`)

Lanes come from the EXISTING `laneOf(status, operationStage, sourceSystem)` in
`OrderStatusPage.tsx` (unchanged):

- `place` lane = status `place`, no operationStage, not autocount → **editablePlaced**
- `proceed` lane = status `proceed_order`, or `place` already picked up by ops
  (operationStage set) or autocount import → **editableProceed**
- `delivered` lane = status `delivered` → fully locked
- cancelled → off the board (unchanged)

New pure helper `apps/web/src/pages/dealer/pos/order-edit-scope.ts` (unit-tested, mirrors
2990s `so-edit-scope.ts`):

```ts
export type OrderEditScope = {
  isDeliveredLane: boolean;
  editablePlaced: boolean;   // place lane — everything
  editableProceed: boolean;  // proceed lane — customer/address/payment only
  canEditDetails: boolean;   // editablePlaced || editableProceed
  canUnproceed: boolean;     // "Move to Order placed"
};
export function getOrderEditScope(o: {
  status: Order["status"]; operationStage: Order["operationStage"];
  sourceSystem: Order["sourceSystem"]; proceedDate: string | null;
}, todayMY: string): OrderEditScope
```

- `editablePlaced` = lane === 'place'
- `editableProceed` = lane === 'proceed'
- `canEditDetails` = either
- `canUnproceed` = `status === 'proceed_order' && operationStage === 'confirmed'
  && !(proceedDate && proceedDate.slice(0,10) < todayMY)`
  — i.e. only the sales Proceed marker is reversible (once ops moves the stage past
  `confirmed` the button disappears), and only while the proceed date is empty / today /
  future. `todayMY = new Date(Date.now() + 8*3600*1000).toISOString().slice(0,10)`.
  (Mirrors 2990s PR #589: `canUnproceed = CONFIRMED && proceededAt && !processingPassed`.)

### Editable matrix (the rule Loo wants copied 1:1)

| Section | place lane | proceed lane | delivered |
|---|---|---|---|
| Items (products) | read-only (Carres has no line-edit surface; see §7) | 🔒 read-only | 🔒 |
| Customer name / phone / email | ✅ | ✅ | 🔒 |
| Delivery address (+ addressUnknown implied) | ✅ | ✅ | 🔒 |
| Delivery date / Proceed date | ✅ (proceed date unlocks only at ≥50% paid) | 🔒 ("move back to edit") | 🔒 |
| Record payment (top-up) | ✅ when outstanding > 0 | ✅ when outstanding > 0 | 🔒 |
| Save changes | ✅ when dirty | ✅ when dirty (customer fields only) | — |
| Move to Proceed | ✅ when checklist all-ok | — | — |
| Move to Order placed (un-proceed) | — | ✅ when `canUnproceed` | — |

Footer strips when nothing actionable: proceed lane without canUnproceed →
`Locked · HQ operation handling`; delivered lane → `Delivered · managed in backend portal`.

## 2. Migration `supabase/migrations/0222_pos_proceed_lane_edits.sql` (renumbered from 0220 — Jess took 0220/0221; applied to prod 2026-07-14)

**⚠ Before applying: `list_migrations` to re-verify the tail (Jess's parallel line) and
renumber if needed. Live defs verified against prod 2026-07-14 (update_order = 0165
version; top_up_order = 0105 version; proceed_order sets operation_stage='confirmed').**

1. **`update_order(p_order_id uuid, p_payload jsonb)` — recreate** (same signature):
   - Add `customer_email` as an accepted payload key (nullable trim, like phone), written
     to `orders.customer_email` (0200 column).
   - Replace the wholesale `status <> 'place' → wrong_status` gate with field-scoping:
     - status `place` → all fields allowed (today's behaviour + email).
     - status `proceed_order` → allowed: `customer_name, customer_phone, customer_email,
       customer_address, customer_address_unknown, customer_billing,
       customer_billing_same, customer_emergency`. If the payload contains ANY of
       `delivery_date, proceed_date, delivery_date_tbd, delivery_floor,
       delivery_has_lift` → raise 22023 detail `proceed_locked_fields`.
     - status `delivered`/`cancelled` → 22023 `wrong_status` (unchanged).
   - Keep: cross-dealer guard, empty-name guard, no_changes guard,
     proceed_after_delivery re-check, order_history + audit_log writes.
2. **`unproceed_order(p_order_id uuid)` — NEW RPC** (SECURITY DEFINER, search_path
   public,pg_temp, grant execute to authenticated):
   - Role: internal roles pass; dealer/salesperson/showroom only own dealer's order
     (same pattern as proceed_order).
   - Guards: status must be `proceed_order` (22023 `wrong_status`); `operation_stage`
     must be `'confirmed'` (22023 `wrong_stage` — ops already working on it); if
     `proceed_date` is set and `< (now() at time zone 'Asia/Kuala_Lumpur')::date` →
     22023 `proceed_date_passed`.
   - Flip: `status='place', operation_stage=NULL` (NULL, not 'confirmed' — fresh place
     orders have NULL stage; `laneOf` relies on it to put the order back in lane 01).
   - Writes order_history (`kind:'unproceed'`) + audit_log (`order.unproceeded`).

## 3. API (Hono) changes

- `packages/shared/src/schemas/orders.ts` — `updateOrderInputSchema.customer` gains
  `email: z.string().trim().email().max(320).nullable().optional()` (allow `null` to
  clear; empty string → null in the route or schema transform).
- `PATCH /api/orders/:id` (apps/api/src/routes/orders.ts) — flatten `customer.email` →
  `customer_email` in the RPC payload. Map new RPC error detail `proceed_locked_fields`
  through the existing 422 shape.
- **NEW** `POST /api/orders/:id/unproceed` — same role list as `/proceed`
  (dealer/salesperson/showroom/principal/operation/finance/bd), calls
  `unproceed_order` RPC via **userClient** (never service_role); error map: 42501→403,
  42P01→404, 22023→422 `{error:"unproceed_blocked", code: detail}`.
- `apps/web/src/lib/queries.ts` — new `useUnproceedOrder(orderId)` mutation hook
  (invalidate `qk.order(id)` + `["orders"]`, same pattern as `useProceedOrder`).

## 4. Web — `PosOrderDetail.tsx` (new, `apps/web/src/pages/dealer/pos/`)

Rendered by `OrderStatusPage` in place of `DealerOrderDetail` (which stays untouched for
the `/dealer/orders` back-office page). Props: `{ id, staffName, onClose }`.
Data: `useOrder(id)` + `useCatalog()`. Totals via `@/lib/order-totals` `orderTotal`.
While loading show the drawer shell with a plain "Loading…" body.

Structure = prototype OrderDetail verbatim (os-* classes), with the §1 gating replacing
the prototype's `lane !== 'place'` disables:

1. **Overlay + drawer**: `os-detail-overlay` (click = close) + `os-detail` aside
   (stopPropagation). Escape closes; body scroll locked while open (2990s parity).
2. **Head**: eyebrow `Order · {Order placed|Proceed|Delivered}` · title `#{so}` ·
   sub `{customer.name} · placed {daysAgo(placedAt)} by {staffName ?? '—'}` · X icon-btn.
3. **Items** (`os-section`): title `Items` + `{n} pieces`. Rows via
   `groupSofaBuildLines` (from `@/lib/sofa-build-display`) so exploded sofa builds render
   as ONE row; each row: `os-item__photo` (model photoUrl or `▦` placeholder),
   name (catalog model name; fallback sku), detail line `{size/variant} · {sku}`,
   `×{qty}`, line total. GWP/free-item/PWP lines show their existing pill labels (reuse
   the small badges logic from DealerOrderDetail if cheap, else plain text suffix
   `· FREE`). Addons render after lines (label from addons catalog / delivery labels).
   Totals rows: `Subtotal`, `Add-ons` (when > 0), `Stair carry` (when > 0), grand `Total`.
   **No pencil, no add-product** (§7).
4. **Customer** (`os-section`): tick `Complete`/`Incomplete` where
   `customerInfoOk = !!(name && phone && email)`. Fields (os-grid/os-field):
   Full name · Phone · Email (span). All `disabled={!canEditDetails}`.
5. **Delivery** (`os-section`): tick `Set`/`Missing` where
   `addressOk = !!(address && !addressUnknown)` and `dateOk = !dateTbd && !!date`.
   Fields: Delivery address textarea (span, `disabled={!canEditDetails}`) ·
   Delivery date (`disabled={!editablePlaced}`) · Proceed date
   (`disabled={!editablePlaced || !paidOk}`; hint when `editablePlaced && !paidOk`:
   `Set the proceed date once ≥50% of the total is paid.`).
   Date inputs: reuse the POS date-keyin calendar (`date-keyin/` from PR #149) if it
   drops in cleanly, else `type=date`. Constraints: delivery min =
   `minDeliveryDateISO(maxLeadDaysFor(order lines' categories))` (reuse the shared
   helpers exactly like `EditOrderModal`); proceed min = today (MY), max = delivery date.
   Clearing both date fields → save sends `dateTbd: true`.
6. **Payment** (`os-section`): tick `≥ 50% paid`/`Below 50%`.
   KV row `Paid so far` = `RM {paid} / {total}`; `os-pay__bar` with 50% mark;
   legend `{paidPct}% collected` / `Threshold · 50%`.
   `paidPct` = 2990s rule: `paid >= total ? 100 : Math.min(99, Math.floor(paid/total*100))`, 0 when total is 0.
   **Record-payment form** shown when `canEditDetails && outstanding > 0` (works in the
   proceed lane — `top_up_order` was already widened by 0105):
   - Method chips (cash/bank/online/cheque/card — the same values `TopUpOrderInput`
     accepts), amount input (prefilled with outstanding, min 0 max outstanding),
     Approval code text input (→ `reference`), payment-slip attach/camera
     (prototype `os-slip*` markup; upload via `@/lib/storage.uploadAttachment` with a
     `newWizardSessionId`, path prefix like TopUpDepositModal; pass as `photoPaths`).
   - Proof rule (2990s): slip required when `amount > 0 && method !== 'cash'` —
     disable the Record button until attached.
   - Submit via `useTopUpOrder(orderId)` with `{amount, method, methodLabel, reference,
     note: null, date: todayISO, photoPaths}`. On success: reset amount/code/slip.
7. **Footer**:
   - `editablePlaced`: 5-chip checklist — `Customer info` (name+phone+email) ·
     `Delivery address` · `Delivery date` · `≥ 50% paid` · `Proceed date`
     (`!!proceedDate`) — then CTA row: `Save changes` (ghost, disabled `!dirty ||
     saving`) + `Move to Proceed` (primary, disabled unless ALL 5 ok; on click: if dirty
     first save via PATCH, then `useProceedOrder`; on success close the drawer).
     422 blocker codes surface via the existing `PROCEED_BLOCKER_LABEL` map.
   - `editableProceed`: `Save changes` (when dirty) + when `canUnproceed`:
     hint `Move back to edit · only before the proceed date` + button
     `Move to Order placed` (arrow-left icon; `useUnproceedOrder`; on success DO NOT
     close — the refetched order flips the same drawer into placed mode, 2990s parity).
     When `!canUnproceed && !dirty-actions`: info strip `Locked · HQ operation handling`.
   - delivered: info strip `Delivered · managed in backend portal.`
   - Error lines (red, fs-12): `Save failed: …` / `Proceed failed: …` /
     `Couldn't move back: …` with friendly copy:
     `proceed_locked_fields` → "Dates are locked after Proceed — move the order back to
     Order placed to edit them."; `wrong_stage` → "HQ operation has already started on
     this order — it can't be moved back."; `proceed_date_passed` → "The proceed date
     has passed — this order can't be moved back."; RPC blocker codes → existing labels.
8. **Dirty/save mechanics** (2990s): local `edited` state seeded from the order, resync
   only on `order.id` change; `dirty` = any of name/phone/email/address/deliveryDate/
   proceedDate/dateTbd differs; Save sends a **diff-only** `UpdateOrderInput`
   (EditOrderModal pattern) — dates only when changed. In the proceed lane the date
   inputs are disabled so the patch never contains them.

`OrderStatusPage.tsx` change: `{activeId && <PosOrderDetail id={activeId} staffName={…}
onClose={() => setActiveId(null)} />}` (drop the DealerOrderDetail import); pass
staffName from the existing `staffById` map via the active order's salespersonId.

## 5. Tests

- `order-edit-scope.test.ts` — pin the matrix: place lane; proceed_order+confirmed
  (canEditDetails, canUnproceed with null/today/future proceedDate); proceed_order with
  passed proceedDate (no unproceed); operationStage in_production (no unproceed);
  place+autocount (proceed lane, no unproceed); delivered (all false).
- `PosOrderDetail.test.tsx` — render the three lanes (mock useOrder/useCatalog):
  gating assertions (customer input enabled in proceed, date input disabled in proceed,
  record-payment visible in proceed, checklist only in place, unproceed button
  visibility), Move-to-Proceed disabled until 5 checks pass, save sends diff-only.
- api `orders.test.ts` additions — `POST /:id/unproceed`: 401 no token; 403 role; RPC
  called with p_order_id; 22023 wrong_stage → 422 code passthrough. PATCH with
  customer.email flattens to customer_email.
- shared schema test: email accepted/nullable, invalid email rejected.
- Baseline: origin/main already has 16 pre-existing web test failures
  (OperationOrders×7 + OrderCustomerCard×4 + …, Jess's #147 line) — do not chase.

## 6. Deliberate Carres adaptations (NOT deviations from Loo's ask)

- Postcode/City separate inputs (2990s/prototype) → ONE composed address textarea:
  Carres stores a single `customer_address` string (that's also what the POS create flow
  captures). addressOk keys on the composed string.
- 2990s "Processing date" ≙ Carres `proceed_date` (same semantics: planned production
  start; pairs with delivery date; ≥50%-paid unlock; passing it locks un-proceed).
- 2990s payments ledger → Carres `top_up_order` scalar + history (the dealer-visible
  book). No itemized ledger list in v1 (prototype doesn't show one either).
- 2990s checklist item "Processing date" → checklist item `Proceed date`, client-side
  gate only (proceed_order RPC doesn't require it — same as 2990s where it's a
  POS-button-only tick).
- Un-proceed in 2990s is `PATCH {proceededAt: null}`; Carres status actually flips
  place↔proceed_order, so it's a dedicated RPC with the same three preconditions
  (sales-marker-only stage, before proceed date, own order).

## 7. Out of scope (flagged, not forgotten)

- **Item-level edit at place lane** (2990s pencil/TbcLineEditor/Add product/swap):
  Carres has ZERO order_lines write path (create_order-only by contract); the Carres
  design contract (prototype) scopes items read-only. Porting line-edit = its own
  initiative (mutex + sofa explode + PWP + delivery-fee recompute implications).
- 2990s `recustomer` customer re-resolve + cross-category delivery re-detect (Carres has
  no customers registry on orders; PWP vouchers bind by phone — untouched).
- Sales Order PDF button in the drawer (exists in back-office detail; add later if asked).
- Payments in Delivered lane (2990s locks it too).
