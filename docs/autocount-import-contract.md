# AutoCount Import Contract — single source of truth

> **Status:** locked 2026-05-19. This document is the ONE contract both dev streams
> (wenwei's `apps/api` + Jess's operation panel) build against. If the import door
> changes, this doc changes first, then code.
>
> **Owner of this door:** wenwei (this repo). The import endpoint lives in
> `apps/api`. Jess does NOT build a parallel importer.

---

## 1. Why this exists

Real Carres operation does not start in the portal. It starts in **AutoCount**
(the accounting system). Sales are keyed into AutoCount; AutoCount auto-creates
PO numbers and counts items. Operation **exports an Excel "listing"** from
AutoCount, then today pastes it into a Google Sheet (`Carres_Master`) to control
everything (logistics assignment, stock location, delivery, balance, issues).

We are replacing the Google Sheet. The AutoCount Excel listing becomes the
**single front door** into the portal via `POST /api/orders/import`. Every order
— whether keyed by a dealer in the portal UI or imported from AutoCount —
enters through the same gate so the downstream pipeline (procurement, stock,
delivery, finance) behaves identically.

---

## 2. Source files (committed, do not rely on Downloads)

The two machines do not share `Downloads/`. Canonical copies live in-repo:

| File | Repo path | What it is |
|---|---|---|
| SKU master | `scripts/ops-seed/carres-sku-master.xlsx` | Authoritative 1159-SKU catalog (`Carress - SKU with Supplier Code & Name-Updated.xlsx`, 2026-05-15) |
| Sample listing | `scripts/ops-seed/sample-autocount-listing.xlsx` | Real AutoCount export sample (`listing 18 may.xlsx`, 272 rows) — the import-contract fixture |

Both are the locked reference. Re-export/replace only with a new dated commit.

---

## 3. AutoCount Listing format — the INPUT contract

One sheet. **One row = one line item (one SKU). Rows sharing `Ref.` (+ overlapping
`PO Doc No.`) = one order.** 14 columns, header row = row 1:

| # | Column | Type | Notes |
|---|---|---|---|
| 1 | `Ref.` | string | Order reference. May be combined: `TCF0282/CR1009`. **Order grouping key.** |
| 2 | `Delivery Location` | string | `City, State` (e.g. `Petaling Jaya, Selangor`) |
| 3 | `New- Delivery Date` | Excel serial | Integer day serial (e.g. `46143`). Convert: `1899-12-30 + N days`. |
| 4 | `Item Group` | enum | `Mattress` / `Bed Fram` / `Sofa` / `Pillow` / `M.P` / `Service` |
| 5 | `Qty` | integer | Line quantity |
| 6 | `Detail Description` | string | **SKU match key** — see §4. Free-text product string OR a service label. |
| 7 | `PO Doc No.` | string | AutoCount PO number(s). May be multiple: `PO/2604-095, PO/2604-096`. **Preserve verbatim.** |
| 8 | `Debtor Name` | string | Customer name |
| 9 | `Phone` | string | May hold two numbers split by `/` |
| 10 | `Delivery Address 1` | string | |
| 11 | `Delivery Address 2` | string | |
| 12 | `Delivery Address 3` | string | |
| 13 | `Delivery Address 4` | string | Often a unit/landmark note in parentheses |
| 14 | `Balance` | string | `RM3322 Paid` \| empty \| `RM<amount>` outstanding. Parse amount + paid-flag. |

`Item Group` mapping to portal `product_category`:
`Mattress`→mattress · `Bed Fram`→bedframe · `Sofa`→sofa · `Pillow`/`M.P`→accessory ·
`Service`→service line (e.g. `Sofa Disposal`, `No Lift Per Floor Charge`). Service
+ accessory rows are NOT catalog SKUs in the product_models sense — keep them as
line items with `category=service`/`accessory`, no sku match required (see §4.3).

---

## 4. SKU matching rule (LOCKED)

### 4.1 Match key = `Description`, canonical key = full `Item Code`

`scripts/ops-seed/carres-sku-master.xlsx` — 10 sheets (one supplier per sheet),
**1159 SKUs**. Columns:

```
Item Code | Description | Item Group | UOM | Cost | Min/Max Selling Price |
Min/Max Purchase Price | Min/Max Qty | Costing Method | Item Type |
Is Stock Control? | Active? | Total Bal Qty | Supplier Code | Supplier Name
```

(`Item Type`, `Is Stock Control?` columns → **ignore**.)

- AutoCount Listing `Detail Description` **==** SKU master `Description` → the join.
- On match, store the SKU master full **`Item Code`** into `product_skus.sku`
  (the canonical key — AutoCount's real unique key).
- Also capture `Cost`, `Supplier Code`, `Supplier Name` as SKU metadata.

| Listing `Detail Description` | SKU master `Description` | `product_skus.sku` ← Item Code | Cost |
|---|---|---|---|
| `Breeze FirmCare-B1201F-K` | identical ✅ | `MS01-B1201F-K` | 882 |
| `Cody KHJ57/Divan10"` | identical ✅ | `BF03-KHJ57/Divan10"-…` | … |

### 4.2 Do NOT strip the Item Code prefix

`MS01 / BF01-04 / SF01-03 / EO11 / RD01 / BL01 / SERV` = a composite
**category + supplier-channel** code, NOT a pure supplier code. Reasons to keep
full: ① it is AutoCount's true unique key ② collision guard (different suppliers
reuse model numbers like `1003`) ③ order matching joins on `Description`, not
`Item Code` — the prefix never affects import, it is only attached metadata.

Sheet → prefix (informational):

| Sheet | ~Count | Prefix |
|---|---|---|
| Red Sofa | 594 | `SF01-` |
| NB Furniture | 235 | `BF03-` |
| Ohana | 78 | `BF04-` |
| Nice Future | 69 | `MS01-` |
| Armani | 65 | `SF02-` |
| Without Supplier Code | 62 | `EO11-/RD01-/BL01-/SERV-` |
| Doresetloft | 23 | `SF03-` |
| Todern | 15 | `SF02-` |
| Rennes | 12 | `BF01-` |
| Laveo | 6 | `BF02-` |

Sheet names in the file have trailing spaces (`'Todern '`, `'Without Supplier
Code '`) — trim on read.

### 4.3 Unmatched / non-catalog rows

- `Item Group = Service` (e.g. `Sofa Disposal`, `No Lift Per Floor Charge`): keep
  as a service line, no SKU match. These are delivery surcharges/services.
- `Pillow` / `M.P` accessories: match by `Description` where possible; if absent
  from master, keep as accessory line with `sku = null` and raw description.
- A core item (`Mattress`/`Bed Fram`/`Sofa`) that fails to match `Description`
  is a **hard error for that row** — surface in the import report, do not silently
  drop. Operation fixes the AutoCount description or the master, re-imports.

### 4.4 Cost bonus — closes a carry-forward

SKU master `Cost` is the real procurement cost. Once SKU cost is seeded from
this file, the Phase-5 carry-forward **`phase-5-cogs-real-source`** (currently a
55% revenue placeholder in `finance_monthly_pl`) can be switched to real COGS.
Track that as a follow-up; not in the import door's scope.

---

## 5. Ref prefix semantics (LOCKED by Jess)

| Prefix | Meaning | Portal attribution |
|---|---|---|
| `RF` | Ready Stock (in-stock, deliver within 3 days) | fast-path fulfilment |
| `CR` | Carres PJ Showroom order (mattress / bedframe) | showroom |
| `TCF` | Sofa order | (sofa SOP) |
| `DL` | **Dealer** order | dealer/outlet |

Combined refs (`TCF0282/CR1009`, `TCF0282 + CR1009`) = a sofa + mattress order
delivered together → one logical delivery, two source refs. Import must keep
both source refs on the order (array) and not collapse them.

---

## 6. Listing → portal mapping

**Order (group by `Ref.`, validated against shared `PO Doc No.`):**

| Portal field | From |
|---|---|
| external ref(s) | `Ref.` (split combined, store as list) |
| customer name | `Debtor Name` |
| phone | `Phone` (keep raw; may be two `/`-split) |
| delivery address | `Delivery Address 1..4` (concatenate, preserve lines) |
| delivery location | `Delivery Location` |
| delivery date | `New- Delivery Date` (serial → date) |
| balance amount / paid flag | parse `Balance` (`RM<n>` + ` Paid` suffix) |
| AutoCount PO numbers | union of `PO Doc No.` across the group (split on `,`) |
| channel | derive from `Ref.` prefix (§5) |

**Order line (per row):**

| Portal field | From |
|---|---|
| category | `Item Group` (§3 mapping) |
| qty | `Qty` |
| sku (canonical) | `Item Code` resolved via `Description` match (§4) |
| raw description | `Detail Description` (always keep, even when matched) |
| sku cost | SKU master `Cost` (at match time) |
| supplier code / name | SKU master `Supplier Code` / `Supplier Name` |
| source PO | row `PO Doc No.` |

---

## 7. `POST /api/orders/import` — behaviour

- **Auth:** Bearer JWT, role-gated (operation/principal-class — final role per the
  separate role decision; until then `principal`).
- **Input:** parsed rows (client parses xlsx → JSON array; the endpoint validates
  with a zod schema in `packages/shared` so both sides share one validator).
- **Grouping:** rows → orders keyed by `Ref.` set; lines preserve order.
- **Idempotency:** re-importing the same AutoCount `Ref.` + `PO Doc No.` set must
  upsert, not duplicate. AutoCount PO# + Ref are the natural keys. Define the
  conflict key explicitly in the migration/RPC.
- **Preserve verbatim:** AutoCount PO numbers and Refs are stored as-is. The
  portal does NOT regenerate its own PO/DL numbers for imported orders.
- **Report:** return a per-row result (created / upserted / unmatched-sku /
  error) so operation can fix-and-reimport. No silent drops.
- **Schema changes** needed for any of the above go through this repo's **single
  migration chain** (next free `00NN_*.sql`), reviewed per CLAUDE.md §7. Jess
  does not write migrations on the shared DB.

---

## 8. Ownership boundaries (locked)

| Area | Owner | Rule |
|---|---|---|
| `POST /api/orders/import` + import RPC + zod contract | **wenwei** (`apps/api`) | the shared door |
| Core `orders` / `order_lines` / stock / delivery | shared schema | single migration chain (wenwei gatekeeps) |
| `ops_imported_orders` staging | **Jess** | STOP once the import door ships; switch to read core `orders` |
| `ops_order_annotations` (customer-360 overlay) | **Jess** | additive, references core orders read-only |
| **Issue Tracker** module | **Jess** | greenfield, `ops_` namespace, zero core touch |
| **Service Note** module | **Jess** | greenfield, `ops_` namespace, zero core touch |
| SKU + supplier seed from `carres-sku-master.xlsx` | **wenwei** | one seeded source of truth |

---

## 9. Open items (not blocking the contract)

1. Final **role** for the operation panel (new role vs reuse `principal`) — deferred
   decision; `principal` until resolved. New role = one coordinated migration.
2. SKU master → `product_skus`/`suppliers` seed script (separate task; uses the
   committed xlsx).
3. GAI → NETS warehouse cutover (master-data + stock-location migration) — separate
   urgent track, this repo, not part of the import door.
4. `phase-5-cogs-real-source` switch once SKU `Cost` is seeded (§4.4).
