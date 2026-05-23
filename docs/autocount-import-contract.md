# AutoCount Import Contract — single source of truth

> **Status:** locked 2026-05-19, **revised 2026-05-19 post-sync** (operation-role
> rename + dl→so rename + schema-gap finding). This document is the ONE contract
> both dev streams (wenwei's `apps/api` + Jess's operation panel) build against.
> If the import door changes, this doc changes first, then code.
>
> **Owner of this door:** wenwei (this repo). The import endpoint lives in
> `apps/api`. Jess does NOT build a parallel importer.
>
> **⚠️ One open DECISION blocks the build — see §1.5. Everything else is locked.**

---

## 1.5 Schema reality gap — DECISION NEEDED before build

The survey of the current code (post the ~80-commit sync: `logistics`→`operation`
role rename migration 0121, `dl`→`so` rename migration 0123) found that the
existing order-creation path **cannot ingest AutoCount orders as-is**:

1. **No external-reference column.** `orders.so` is a server-generated
   auto-increment int (seq `orders_so_seq`, starts 1251). There is **no column**
   for AutoCount's `Ref.` (`CR0418`, `TCF0282/CR1009`) and **no column on
   `order_lines`** for AutoCount's `PO Doc No.` (`PO/2604-046`). The locked
   idempotency rule ("re-import same Ref + PO# = upsert not duplicate") is
   **impossible** without somewhere to store those keys.

2. **`create_order(payload)` RPC** (migration 0006) is built for the dealer
   wizard. It **requires** fields AutoCount listing does NOT have:
   `outletId`, `salespersonId`, `signaturePath` (required!), `paymentSlipPath`,
   `depositPct`, `paymentMethod`, `termsAccepted`. It also force-generates a new
   `so` number and writes `order_history` "Order created" text. Reusing it
   verbatim for import is wrong: imported orders have no salesperson/signature,
   and we'd be double-keying (AutoCount is the source of truth, not the portal).

**Recommended approach (needs Loo's explicit §7 approval — schema change):**

- New migration `00NN_autocount_import.sql` adding:
  - `orders.source_ref text[]` (the AutoCount Ref set; combined refs kept as array)
  - `orders.source_system text` (e.g. `'autocount'`) + `channel='dealer'` derive
  - `order_lines.source_po text` (AutoCount PO Doc No. for that line)
  - a UNIQUE/conflict key over `(source_system, source_ref)` for idempotent upsert
- New dedicated RPC `import_autocount_order(payload jsonb)` — a sibling of
  `create_order`, NOT a modification of it. Relaxes the wizard-only required
  fields (no signature/salesperson), preserves AutoCount Ref + PO# verbatim,
  still creates `orders`+`order_lines`(+threads) so downstream pipeline behaves
  identically. `so` is still server-generated as the internal id; `source_ref`
  is the external/business key operation reads by.

**Why not just extend `create_order`:** it is load-bearing for the live dealer
flow (6+ call sites, strict zod). A sibling RPC isolates import risk and keeps
the dealer path untouched. This mirrors the project's "frontend/reality wins,
schema follows" methodology.

**DECISION for Loo:** approve (a) the new columns + (b) a dedicated
`import_autocount_order` RPC as one new migration in the single chain? Until
approved, the endpoint cannot be built correctly — building on `create_order`
as-is would silently drop the AutoCount keys and break idempotency + the
GAI→NETS / Master-sheet replacement.

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
| HoOKkA | 78 | `BF04-` |
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

- **Auth:** Bearer JWT, role-gated **`operation`** (guard `requireOperation` in
  `apps/api/src/lib/auth-guards.ts`; `operation` OR `principal` acceptable —
  `requireOperationOrPrincipal`). Role decision is RESOLVED: `logistics` was
  renamed to `operation` (migration 0121); Jess's panel uses `operation`. No new
  role needed.
- **Input:** parsed rows (client parses xlsx → JSON array; the endpoint validates
  with a zod schema in `packages/shared` so both sides share one validator).
- **Grouping:** rows → orders keyed by `Ref.` set; lines preserve order.
- **Idempotency:** re-importing the same AutoCount `Ref.` + `PO Doc No.` set must
  upsert, not duplicate. Natural key = `(source_system, source_ref)` (see §1.5 —
  needs the new columns). Define the conflict key explicitly in the migration/RPC.
- **Preserve verbatim:** AutoCount Ref + PO numbers stored as-is in
  `orders.source_ref[]` / `order_lines.source_po`. `orders.so` remains the
  server-generated internal id (auto-increment int, NOT the AutoCount number);
  operation reads/searches by `source_ref`.
- **RPC:** dedicated `import_autocount_order(payload jsonb)` — sibling of
  `create_order`, NOT a modification (see §1.5). Relaxes wizard-only required
  fields; still writes `orders`+`order_lines`(+threads) so downstream is identical.
- **Report:** return a per-row result (created / upserted / unmatched-sku /
  error) so operation can fix-and-reimport. No silent drops.
- **Schema changes** (the §1.5 columns + RPC) go through this repo's **single
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

## 9. Open items

1. **BLOCKING — §1.5 decision:** approve new columns (`orders.source_ref[]`,
   `orders.source_system`, `order_lines.source_po`) + dedicated
   `import_autocount_order` RPC as one migration. Build cannot start correctly
   without this.
2. ~~Role decision~~ — RESOLVED: `operation` role (migration 0121). Not deferred.
3. SKU master → `product_skus`/`suppliers` seed script (separate task; uses the
   committed `scripts/ops-seed/carres-sku-master.xlsx`).
4. GAI → NETS warehouse cutover (master-data + stock-location migration) — separate
   urgent track, this repo, not part of the import door.
5. `phase-5-cogs-real-source` switch once SKU `Cost` is seeded (§4.4).
