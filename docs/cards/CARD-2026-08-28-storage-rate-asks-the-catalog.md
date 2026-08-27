# MONEY IN — CARD · THE STORAGE RATE ASKS THE CATALOG

**Module:** Payment / Money In (owns the FEE) · **Surface:** the shared storage arithmetic and its
four server call sites, plus the drawer's Storage tab
**Owner authority:** `docs/ERP-ARCHITECTURE.md` §6.1 — **FROZEN 2026-08-06**, and §3.1 · D9
**Status:** QUEUED — implements a frozen ruling; no open owner decision
**Lane:** BUILD / DELIVERY
**Base:** `origin/main` at `4519a985c3bb01a175d91bdd5862eba186e89bfa`

> **For the build agent:** read `CLAUDE.md`, `docs/ERP-ARCHITECTURE.md` §3.1 and §6.1,
> `docs/payment/MASTER.md` and `docs/carry-forwards.md`
> (`d4-is-now-three-storage-arithmetics-and-they-already-disagree`) before editing. This Card
> contains no owner question. It closes the last open third of D9.

---

## 1 · The measurement, and it is the whole Card

`storageCategoryForSku` (`packages/shared/src/schemas/ops-order-control.ts:641`) decides whether a
SKU is in storage scope, and it decides it from the **shape of the SKU string**:

```ts
s.startsWith("mattress:") || s.startsWith("bedframe:") || /^ms\d/ || /^bf\d/   → "msbf"
s.startsWith("sofa:")     || /^(sof|sf)\d/                                     → "sof"
otherwise                                                                      → "other"
```

Run against real production SKU shapes, on 2026-08-28:

```text
B1201S-K       ->  other
B1201S         ->  other
MODEL-C        ->  other
ESS-PILLOW     ->  other
B2003-Q        ->  other
SF-3STR        ->  other
NF-MATT-K      ->  other
OH-BF-Q        ->  other
```

**Every one.** `B1201S-K` is not a hypothetical — `docs/orders/MASTER.md` records it as a verified
production mattress, proved on SO-1319 to render under `MATTRESS` *because the catalog was asked*.
The storage path does not ask the catalog, so the same SKU is `other` here.

`other` means out of scope. Out of scope means `orderStorageScope` returns
`{ hasMsbf: false, hasSof: false }`. Which means **no rate applies at all**, against this table:

```ts
msbf: { amount: 150, periodDays: 30, label: "RM150 / month" }
sof:  { amount: 200, freeDays: 14,   label: "free 14 days, then RM200" }
```

> ### 🔴 THE CONSEQUENCE, IN ONE LINE
> **An operator turns storage on and the fee computes RM 0.** The rate table is live, the clock is
> live, the collection door is live, and the number they all produce is zero.

## 2 · It is WORSE than D9 recorded: there are two wrong parsers, not one

D9 named three answers to *"what kind of product is this?"* and said the storage rate was the third.
Measured today, **the storage rate is itself two answers**, on two surfaces, with nothing forcing
them to agree:

| Surface | What it asks | Where |
|---|---|---|
| The drawer's Storage tab | `lineCategory(sku)` — the keyword regex | `OrderDetailDrawer.tsx:1501-1505` |
| The shared rule + every server gate | `storageCategoryForSku(sku)` — prefix-only | `ops-order-control.ts:641` |

They are different functions with different rules. `lineCategory` at least has a catalog-aware
wrapper (`resolvedCategory`); `storageCategoryForSku` has nothing. So the screen and the gate can
disagree about whether an order is even in storage scope, and both can disagree with the catalog.

**This is Law D twice over on one fee**, and it is why the carry-forward is named
`d4-is-now-three-storage-arithmetics-and-they-already-disagree`.

## 3 · The ruling this implements — already frozen, not reopened

`ERP-ARCHITECTURE.md` §6.1, **FROZEN 2026-08-06**:

```text
CUSTOMER ORDER   owns the TRIGGER and the HOLD
MONEY IN         owns the FEE — the rate table and the arithmetic (ONE function),
                 the charge, the collection, and the WAIVER
STOCK            owns the WITNESS
```

and, in the same section, naming this exact defect as the thing correct ownership fixes:

> **The one V1 defect this ruling fixes when built:** the fee's RATE depends on the catalog
> category, and V1 resolves it with the prefix-only `storageCategoryForSku` — **wrong for every
> live SKU** (D9). Under this ruling Money In's arithmetic asks the CATALOG.

Nothing here is a new decision. The Card is the execution.

## 4 · The capability already exists on both sides — this is 🟢 READY

Do not design a category engine. Both halves shipped with D9's other two thirds:

| Need | What already exists |
|---|---|
| Read `product_models.category` for a set of SKUs | `apps/api/src/lib/sku-categories.ts` → `skuCategories(sb, skus)` returns `Map<sku, category>`; a SKU the catalog does not hold is **absent**, never guessed |
| Turn a catalog answer into a category, with a fallback | `packages/shared/src/line-category.ts:176` → `resolvedCategory(sku, category?)`, whose `null` branch is documented as *"the branch that deletes itself once the catalog is populated"* |

This is the same move `56239a3c` (PR #859) made for Stock and `#867` made for the Sales Order. The
third consumer copies a proven implementation; it invents nothing.

## 5 · The hard part, stated honestly

`storageCategoryForSku(sku: string)` is a **pure string function**. Asking the catalog is an async
database read. A pure function cannot do it, and it must not learn how — `sku-categories.ts` exists
precisely so one join has one home.

**So the category is passed IN, and the pure function keeps being pure.** Every caller resolves the
category first and hands it down. That is what makes this a Card rather than a patch: it reaches
four server call sites and one screen.

```text
apps/api/src/lib/storage-gate.ts:47          the server-side DELIVERY GATE
apps/api/src/lib/booking-context.ts:107
apps/api/src/routes/operation/order-payments.ts:447
apps/api/src/routes/operation/orders.ts:1216
apps/web/src/pages/operation/components/OrderDetailDrawer.tsx:1501-1505   the Storage tab
```

All four server sites already hold a Supabase client, so `skuCategories` is reachable from every
one of them. Verified before this Card was written.

## 6 · Build tasks

### Task 1 · Lock the defect with failing tests first

- [ ] Assert `B1201S-K`, `B2003-Q`, `NF-MATT-K` and `OH-BF-Q` resolve to `msbf` when the catalog
      says `mattress` / `bedframe`, and `SF-3STR` to `sof` when it says `sofa`.
- [ ] Assert an order of real SKUs with storage ON computes a **non-zero** fee.
- [ ] Prove those fail against current `main` before writing production code.

### Task 2 · Let the scope take a category

- [ ] `storageCategoryForSku` gains an optional resolved category and prefers it over the prefix
      test. Keep the parser as the **explicit fallback**, with the same deletion condition
      `resolvedCategory` already carries — it dies with the uncatalogued bucket, not before.
- [ ] `orderStorageScope` and `computeOrderStorage` take the category map, not bare SKU strings.
- [ ] Never invent a category for a SKU the catalog does not hold. Absent stays absent.

### Task 3 · Every server caller asks the catalog once

- [ ] All four sites resolve through `skuCategories` — one bounded read each, no per-line queries.
- [ ] The delivery gate is the one that must not regress: an order out of scope today must not
      start holding a delivery merely because the category resolved. **Storage still only accrues
      when the operator turned it on** (`computeOrderStorage` deliberately has no ETA fallback);
      that rule is untouched.

### Task 4 · The drawer stops using the other parser

- [ ] `hasMsbf` / `hasSof` read the resolved category, not `lineCategory`.
- [ ] The Storage tab's visibility (`OrderDetailDrawer.tsx:1984`) follows the same answer, so the
      tab cannot appear on an order the gate thinks is out of scope, or vice versa.

### Task 5 · Retire the second answer

- [ ] After Tasks 2–4, `lineCategory` must have **no remaining caller in the storage path**.
      Prove it by grep, in a test, the way `carry-forwards.md` says the last one was found.

## 7 · Tests

```text
packages/shared/src/schemas/ops-order-control.test.ts
packages/shared/src/storage-hold.test.ts
apps/api/src/lib/storage-gate.test.ts
apps/web/src/pages/operation/components/OrderDetailDrawer.test.tsx
```

Required cases:

1. a catalogued mattress SKU bills at the MS/BF rate;
2. a catalogued sofa SKU bills at the SOF rate, after its 14 free days;
3. a SKU the catalog does not hold falls back to the parser and says so;
4. an order with storage OFF is still never due, whatever the category;
5. the delivery gate holds on a real fee and does not hold on an absent one;
6. the drawer's scope and the gate's scope agree on the same order;
7. no storage-path caller of `lineCategory` survives.

Then the repository's normal gates: `ci:migrations`, lint, typecheck, full suites, production build.

## 8 · Boundaries

Do not change:

```text
the rate table, the clock, the anchor or the grace week
the WAIVER path or its manager gate
the "storage only accrues when the operator turns it on" rule
who owns the trigger, the fee or the hold (ERP-ARCHITECTURE §6.1 is frozen)
the Sales Order or Stock category paths — both already ask the catalog
```

No migration is expected. No backfill of any kind: `CLAUDE.md` §6 forbids repairing imported rows,
and this Card repairs an **arithmetic**, never a stored number.

## 9 · The one consequence worth telling Jess

**Storage fees start computing.** Today an operator who turns storage on gets RM 0; afterwards they
get the real figure. That is the fix working, and §6.1 already ruled the ownership — so it is not
an owner decision. It is worth *telling* her, in one sentence, because the first non-zero fee will
look like a new charge rather than a repaired one.

Bounded by two facts: storage never accrues unless an operator explicitly turns it on, and every row
in the database today is test data (`CLAUDE.md` §6).

## 10 · Completion record

```text
Implementation commit:
PR:
CI:
Merge SHA:
Deployment run:
Production SHA:
SKUs proved non-zero:
Delivery-gate regression check:
Drawer/gate scope agreement:
lineCategory storage callers remaining:
Defects opened:
```

Only when every line above carries evidence may `Status` become
`EXECUTED · SHIPPED · PRODUCTION-VERIFIED`, and only then may
`d4-is-now-three-storage-arithmetics-and-they-already-disagree` close in `carry-forwards.md` — with
a strikethrough pointing here, never a deletion.
