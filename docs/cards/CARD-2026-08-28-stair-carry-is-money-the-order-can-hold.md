# SALES ORDERS — CARD · STAIR CARRY IS MONEY, AND THE ORDER MUST BE ABLE TO HOLD IT

**Module:** Sales Orders · **Surface:** the order's money — POS confirm step, SO Workspace MONEY, every payment door
**Status:** READY — the owner ruling exists and is LOCKED. Not queued behind a decision.
**Lane:** BUILD / DELIVERY
**Authority:** `docs/orders/MASTER.md` § *STAIR CARRY IS MONEY THE CUSTOMER OWES* (owner ruling YH, 2026-08-28)
**Found by:** `docs/audits/SO-WORKSPACE-FIELD-AUDIT.md` §2 F-2, then measured end to end 2026-08-28
**Owner note:** another session already fixed F-2's *other* half — the clamp — in `392a55e1`. This Card is the remaining half.

---

## 1 · The ruling

> *"If stair carry requires money for it, it should be included — whether it's paid on the carry
> day or before, it still needs to be paid."* — YH, 2026-08-28

The fee is **revenue on this sales order**. It belongs in the total, in what the customer owes,
and in what every payment door will accept. **The timing of payment does not change whether it is
owed.**

## 2 · The defect, measured

The fee is computed in the browser on every render, from three stored inputs plus a globally
mutable rate, and is **written down nowhere**.

| Where | What happens |
|---|---|
| POS confirm step | itemises `Stair carry` **twice** (`Step3SignaturePayment.tsx:271-278`, `:314`), folds it into the 36px headline `Total` (`:123`), sizes the deposit buttons off it (`:124`, `:397`, `:414`) |
| The T&C the customer ticks | *"Stair-carry surcharges (if any) are billed on this sales order and are not invoiced separately on the DO."* (`:655-657`) |
| The database | stores `delivery_floor`, `delivery_has_lift`, `delivery_stair_items` — the three **inputs**. The fee itself: no column, no addon row, no writer, across all 404 migrations |
| SO Workspace | ORDER INFO narrates the fee; MONEY `Total` is `lines + addons` only (`order-money.ts:100`) — **one screen, two numbers** |
| The customer's SO PDF | prints the lower total, and a `balance_due` that can go negative (`orders.ts:4121-4126`) |
| Stripe | `stripe-checkout.ts:117-121` caps at lines+addons → **422 `amount_exceeds_outstanding`** at `:158-168`, **before Stripe is called** |
| Cash / manual | `top_up_order` caps identically (`0351:245-249`) and answers *"Order is already fully paid"* |

**Worked example, at seeded rates** (`free_up_to_floor 2`, `per_floor_per_item 50`) — 5 items
@ RM 1,890, floor 3, no lift, 3 needing carry:

```
customer signs .................. RM 9,600
database can ever describe ...... RM 9,450
uncollectible by every door ..... RM   150
```

**No door in the portal can collect the difference.** Once `paid` reaches lines+addons, every
door says *"already fully paid"* while the signed contract still shows a balance.

## 3 · The three contradicting statements this closes

Each file is locally coherent; nobody ever reconciled them.

| File | Claims |
|---|---|
| `apps/api/src/lib/delivery-fee-recompute.ts:38-39` | stair *"folds into the order total"* — **revenue** |
| `apps/api/src/routes/orders.ts:258-261` | *"a delivery-time concern, not a sales metric"* — **excluded** |
| `apps/api/src/routes/stripe-checkout.ts:115-116` | *"a client-side display extra"* — **not a charge at all** |

The first is now the ruling. **The other two must be corrected in the same PR that changes them**
— a comment left contradicting the MASTER is how this happened the first time.

## 4 · Scope — the road is already built

⛔ **Do not invent a mechanism.** `delivery-fee-recompute.ts` already computes the delivery TRIP
fee server-side and appends `order_addons` rows (`DELIVERY` · `DELIVERY_CROSS` · `DELIVERY_ADD`,
seeded `0184:112-116`). Stair carry follows the same road.

1. **Seed a stair key into `addons`.** The set is **NOT closed** — `POST /api/catalog/addons`
   (`catalog.ts:1854-1880`, gate `internalOnly`, schema `addonCreateInput`) inserts one, and the
   door is on screen at **Settings → Catalog → Special Add-ons**
   (`SpecialAddonsTab.tsx:159` renders `OrderAddonsSection`). Prefer a migration seed over a
   hand-created row so the key exists in every environment.
   *(An earlier draft of the audit called this FK-impossible. That was wrong, and YH caught it.)*
2. **Write the fee server-side**, into `order_addons.qty` / `unit_price`, on create and on any
   save that moves floor / lift / stair count. `addons.price` is a fixed per-key price and stair
   carry is computed, so the per-order figure rides the order_addons row — exactly as the
   delivery-fee rows already do.
3. **Nothing downstream needs changing.** `orderMoney`, the SO PDF, `stripe-checkout` and
   `top_up_order` all already read `order_addons`. The total, the outstanding and every payment
   cap start including it the moment the row exists.
4. **Correct the two false comments** (§3) in the same PR.

## 5 · The trap that must not be repeated

⚠️ **STAMP THE FEE, DO NOT RE-DERIVE IT.** Today `floor_config.per_floor_per_item` is a live
singleton a principal can PATCH (`catalog.ts:1794-1798`, policy `floor_write_principal`
`0002:118`). Because no order stores its fee, **changing that rate silently reprices the
displayed stair carry on every historic order.** A charge a customer signed for may not move
because a rate changed afterwards. The `order_addons` row fixes this as a side effect — write it
once, at the order.

## 6 · Boundary — what this Card may NOT touch

- **The clamp.** Already fixed in `392a55e1` (`stairCarryCount` extracted; `floorSurcharge`
  clamps). Do not re-open it.
- **The 2026-08-27 UNSET-MEANS-NONE ruling.** An unset count still charges nothing. This Card
  changes where the fee is RECORDED, never how many items it counts.
- **`MAX_DELIVERY_FLOOR`.** Floor bounds disagree across UI / API / DB (audit F-8) — a separate
  finding, not this Card's.
- **Backfill.** `CLAUDE.md` §6 — every row today is test data. **No backfill is proposed.** The
  ruling binds new orders from the day it ships.

## 7 · Acceptance

1. A POS order on floor 3, no lift, 3 of 5 items carried, creates an `order_addons` row whose
   `qty × unit_price` equals the fee the confirm step showed.
2. The SO Workspace MONEY `Total` equals the number the customer signed. **One screen, one
   number.**
3. Collecting the full outstanding through Stripe succeeds where it previously 422'd.
4. `top_up_order` accepts the full balance instead of answering *"already fully paid"*.
5. The customer's SO PDF total matches the signed total, and `balance_due` cannot go negative.
6. Changing `floor_config.per_floor_per_item` afterwards does **not** move the fee on an existing
   order.
7. An order with lift, or floor ≤ 2, or an unset count, creates **no** addon row — the fee is 0
   and a zero row is noise.

## 8 · Tests that pin the current intent

Named so nobody deletes one. **The surviving invariant is the cap itself** — a payment may never
exceed what is owed. This Card changes what *is* owed, not whether the cap holds.

- `apps/api/src/routes/orders.test.ts` — the `stair_carry` addon fixture at `:868` uses a key
  that **cannot exist** in the real database today. It becomes real under this Card.
- `stripe-checkout` tests asserting `amount_exceeds_outstanding` — the refusal must survive; only
  the number it compares against changes.
- `packages/shared/src/order-money.test.ts` — `orderMoney` stays `lines + addons`. That contract
  is unchanged; stair simply becomes an addon.
- `apps/web/src/lib/order-totals.test.ts` — `draftTotals.grand` must keep matching what the
  order now stores.

## 9 · Open question this Card does NOT answer

**Which SKU or service does the stair add-on point at?** `addonCreateInput` accepts an optional
`serviceSku`, and `ensureServiceSkuRow` mints a `product_skus` row when one is given. Whether
stair carry needs a service SKU for accounting, or is a bare addon key, is a Finance question —
not an engineering one. Decide it before step 1, because the key is created once.
