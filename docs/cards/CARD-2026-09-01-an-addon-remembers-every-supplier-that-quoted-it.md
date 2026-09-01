# CATALOG — CARD · AN ADD-ON REMEMBERS EVERY SUPPLIER THAT QUOTED IT

**Module:** Catalog · **Surface:** `special_addons` + `addons`, the Special Add-ons tab, the
Operation cost tab
**Owner authority:** YH, 2026-09-01 — *"1 add-on can be made from different suppliers with
different cost so that needs to be taken account"*
**Precedent:** migration `0388` (SKU dual-sourcing) — **this Card copies it, it does not redesign it**
**Status:** QUEUED — owner-approved capability; **owner review of §9 before build**
**Lane:** BUILD / DELIVERY
**Base:** `origin/main` at the tip that carries `build/supplier-offers-modal`

> ⚠️ **Catalog has no module MASTER.** `CLAUDE.md`'s authority map calls it a
> `PROPOSAL / authority gap` and says *"do not infer rules from other modules"*. This Card does not
> invent Catalog law: it applies a ruling the owner gave for this exact case, using a shape the
> repository already froze for SKUs. Everything it decides is recorded here until Catalog has a
> MASTER to hold it.

---

## 1 · The measurement

An add-on has nowhere to remember who supplies it. Measured 2026-09-01:

```sql
create table addons (                 -- the plain add-ons
  key    text primary key,
  name   text not null,
  price  numeric(12,2) not null,      -- SELLING price
  active boolean not null default true
);                                    -- no cost. no supplier.

CREATE TABLE public.special_addons (
  selling_price numeric(12,2) NOT NULL DEFAULT 0,
  cost          numeric(14,2),        -- "procurement benchmark only", ONE number
  ...                                 -- no supplier column
);
```

| | cost | supplier |
|---|---|---|
| `addons` | **none** | **none** |
| `special_addons` | one, nullable | **none** |

**No add-on table has ever carried a supplier.** Grepped every migration: the only files matching
both `addons` and `supplier` are `0001`/`0002`/`0003`/`0019`, and in each the two words are
unrelated.

> ### 🔴 THE CONSEQUENCE, IN ONE LINE
> **Two suppliers quote the same add-on at different prices and the second quotation has nowhere to
> go.** The keyer is holding paper the system refuses to remember — the identical sentence `0388`
> was written to end for SKUs.

## 2 · This is `0388` one level over, and the ruling already exists

`0388` (2026-08-26) met the same wall for SKUs and answered it. Its ruling, verbatim:

> `product_skus.supplier_id` remains THE routing truth: POs address the supplier in the slot,
> exactly as before this migration. The slot and the offer list are DIFFERENT facts — *"who the next
> PO goes to"* versus *"who has quoted this item, at what terms"* — so this is not a second copy of
> one fact (Law D); it is the first home of a fact that had none.

**Every word transfers.** An add-on needs a slot and a list for the same reason a SKU did, and the
answer must not be a second `special_addons` row per supplier — that is the two-rows-per-product
design the owner already refused, and `docs/modules/mrp.md` in HOUZS ERP records the cost of the
adjacent mistake: *"a Model or a Sales Order does not have suppliers, each VARIANT does."*

## 3 · What this Card builds

### 3.1 · One table, mirroring `sku_supplier_offers`

```sql
create table if not exists public.addon_supplier_offers (
  id             uuid primary key default gen_random_uuid(),
  special_addon_id uuid not null references public.special_addons(id) on delete cascade,
  supplier_id    uuid not null references public.suppliers(id) on delete cascade,
  supplier_code  text,                    -- THEIR code for it
  cost           numeric(14,2),           -- what THEY charge us
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.app_users(id),
  unique (special_addon_id, supplier_id)  -- a re-key UPDATES, never stacks
);
```

**The one deliberate difference from `0388`.** The SKU table records `price` / `pwp_price` because a
supplier quotation for a SKU *is* a selling price by group convention (YH, 2026-08-25). An add-on's
`selling_price` is Carres', set once on the add-on itself; what varies per supplier is **cost**. So
this table carries `cost`, not price. **Recording a per-supplier selling price would invent a second
selling truth** — exactly the Law D failure the table exists to avoid.

**Take the migration number from the MAX of the tracker tail, the repository tail and every branch
(red line 7).** Measured 2026-09-01: repo tail `0406`, and no remote branch carries anything higher.
**The live tracker was not readable from this session — confirm it before applying.**

### 3.2 · The slot

`special_addons` gains `supplier_id` (nullable, FK to `suppliers`) and `supplier_code`. That is the
routing truth — who a PO for this add-on is addressed to — and it is exactly one, mirroring
`product_skus`.

🟡 **Whether an add-on is ever purchased on a PO at all is not established.** If Purchasing never
raises a PO for an add-on, the slot is documentation rather than routing, and the honest build is
the offers table alone. **This is §9's owner question.**

### 3.3 · The plain `addons` table is NOT touched

`addons` has four columns and no cost. Giving it suppliers means first giving it a cost, and that is
a different decision with a different owner. **Out of scope, named so it is not read as forgotten.**

## 4 · The surface — reuse, do not rebuild

`SupplierOffersModal` shipped on 2026-09-01 (PR #1008) and already draws exactly this: a slot
section that says *"The next Purchase Order for this item goes here"*, and an offers list that says
*"Changing it does not move the Purchase Order."*

- [ ] Generalise it over `{ slot, offers }` rather than `ProductSkuDto`, so one component serves both.
- [ ] Open it from the Special Add-ons tab the way the SKU grid opens it — from the code, not a new
      column. A column would repeat the mistake this Card exists to correct.
- [ ] Do **not** add a Supplier column to `SpecialAddonsTab`. A cell cannot hold a list; that is the
      whole finding.

## 5 · Build tasks

### Task 1 · Lock it with failing tests
- [ ] Two suppliers quote one add-on at different costs; both are readable, neither overwrites the other.
- [ ] A re-key of one supplier's offer UPDATES that row and leaves the other untouched.
- [ ] Prove these fail before the migration exists.

### Task 2 · The migration
- [ ] `addon_supplier_offers` as §3.1, idempotent (`if not exists` / `drop policy if exists`).
- [ ] RLS mirroring `sku_supplier_offers` exactly — no new access shape invented here.
- [ ] No backfill. `CLAUDE.md` §6: today's rows are test data and go-live starts clean.

### Task 3 · The read/write path
- [ ] API routes mirroring the SKU offer endpoints; one bounded read per add-on.
- [ ] `CatalogResponse` gains the offers **optional**, so a pre-Card client is unaffected.

### Task 4 · The surface
- [ ] Generalise `SupplierOffersModal`; open it from Special Add-ons.
- [ ] The SKU path must keep its current tests green — that is the regression bar.

### Task 5 · Prove the boundary held
- [ ] `special_addons.selling_price` is unchanged and no per-supplier selling price exists anywhere.
- [ ] A grep test: no caller sums an offer `cost` into a customer total.

## 6 · Tests

```text
packages/shared/src/schemas/catalog.test.ts
apps/api/src/routes/catalog.test.ts
apps/web/src/pages/catalog/tabs/SpecialAddonsTab.test.tsx
apps/web/src/pages/catalog/tabs/SkuMasterTab.test.tsx     (regression bar)
```

1. two suppliers, two costs, both survive;
2. re-key updates one row, leaves the other;
3. the offers are optional on the wire — an older client still parses;
4. cost never reaches a customer-facing total;
5. the Special Add-ons tab gained a door, not a column;
6. the SKU supplier modal still passes every test it passes today.

## 7 · Boundaries

Do not change:

```text
special_addons.selling_price, or how any customer total is computed
the plain `addons` table
product_skus / sku_supplier_offers  — the SKU path is the precedent, not the target
who may write catalog money (0175 principal-only price, 0226 cost)
```

No backfill of any kind.

## 8 · What this does NOT decide

**Whether Purchasing may auto-fall-back to an alternate offer when the slot supplier cannot
supply.** `0388` left that open for SKUs — *"a real operating-model decision… it sits with the
owner"* — and this Card leaves it open for add-ons on the same terms. It records the paper; it does
not change who gets the PO.

## 9 · The one owner question

```text
AUTHORITY SEARCHED        ERP-ARCHITECTURE §3.1/§3.3 · purchasing/MASTER.md ·
                          0181 (special_addons) · 0388 (SKU offers)
WHY NOT ALREADY RESOLVED  0181 calls add-on cost a "procurement benchmark only,
                          never summed into the selling total". A benchmark is a
                          reference; a slot is a routing instruction. Nothing
                          establishes that Carres raises a PO for an add-on.
```

**Does Carres ever issue a Purchase Order for an add-on, or is add-on cost only ever a margin
reference?**

- **PO is raised** → build the slot (§3.2) and the offers. The slot routes.
- **Reference only** → build the offers **alone**. A slot nobody routes on is a field that will
  drift, and the fee it implies would be fiction.

**RECOMMENDATION: build the offers table first and leave the slot out.** It is the half the owner
actually asked for — *"different suppliers with different cost"* — it is useful either way, and it
cannot be wrong. The slot is cheap to add once the answer exists and expensive to remove once
something reads it.

**OPERATIONAL CONSEQUENCE:** none until a surface writes to it. Recording a quotation changes no
price, no total and no PO.

## 10 · Completion record

```text
Implementation commit:
PR:
CI:
Merge SHA:
Migration number + tracker reconciliation:
Production SHA:
Two-supplier add-on proved:
Selling price unchanged:
SKU modal regression:
Defects opened:
```
