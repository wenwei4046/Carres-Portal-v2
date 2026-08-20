STATUS: EXECUTED
DATE: 2026-08-20
PR: (filled in from the real PR, never guessed — #866 was already Chai's)
IMPLEMENTATION: ENGINEERING-OWNED — no new owner ruling. `ERP-ARCHITECTURE.md`
§3.1 · D9 already rules that the CATALOG owns *"what kind of product is this?"*;
`56239a3c` (PR #859) shipped the reader and closed Stock's half. This card is
the same move on the half that PR named as still open, so it implements a
ruling rather than proposing one.

# D9's SALES ORDER HALF — the loan flow stops guessing from the SKU text

**SCOPE — the order-detail endpoint carries the catalog's category on its
lines and its free units, and the three drawer sites that FILTER stock read it
instead of parsing the SKU. NOTHING ELSE.**

## 1 · What was actually wrong

`packages/shared/src/line-category.ts:118-136` heads `lineCategory` with
**"⚠️ DISPLAY GROUPING ONLY — never ask this whether goods are safe to send"**
and names two consumers, both of which only pick a header to print under.

The grep returned more than two, and two of the extras filter warehouse stock:

```
OrderDetailDrawer.tsx:3618   drops "acc" from orderCategories
                             its own comment: "acc would let keyword-missed
                             units leak in"
LoanPanel.tsx:715            lendable = freeUnits.filter(u =>
                               catSet.has(lineCategory(u.sku)))
StockPickerGrid.tsx:140      loanMode ? lineCategory(u.sku) === "sofa" : …
```

A miss on **either** side deleted the unit. An unrecognised order line
contributed no category to match against; an unrecognised free unit resolved to
`acc`, which the drawer deliberately excludes. **A real sofa sitting in the
warehouse could not be offered as a loaner because its model name was not in a
regex.**

That is D9's own signature, not a wrong label — `ERP-ARCHITECTURE.md:28`: *"the
Sofa facet reads 0 while 10 of 28 live orders carry a sofa."*

**Why it mattered on this date.** `lineClass:86` recognises goods from a
hardcoded keyword list compiled into shared source. Every model sales key into
the catalog under Jess's 2026-08-19 direction is absent from that list and
returns `unknown`. The catalog would have held the right category and the loan
flow would not have seen it.

## 2 · What shipped

**API** — `apps/api/src/routes/operation/orders.ts` resolves both the line SKUs
and the free-unit SKUs in ONE `skuCategories` call and attaches `category` to
each. `null` when the catalog holds no row: this endpoint asked, and the browser
reads asked-and-silent differently from never-asked.

**Shared** — `resolvedCategory(sku, category)` in `packages/shared/src/line-category.ts`.
Three-valued on purpose:

```
undefined  ABSENT — nobody asked (older Worker). Parse, as before.
null       ASKED, catalog silent. Parses TODAY, deliberately — see §3.
"sofa"     ASKED and ANSWERED. The catalog wins outright.
```

A catalog word this codebase has no core meaning for reads as `acc`, never as a
core good: a loaner must not arrive because nobody taught the frontend a noun.

**Web** — the three filter sites above, plus the lendable row's own `cat` label
so a unit is SHOWN the way it was ADMITTED, plus `category` carried through the
drawer's duplicate-SKU merge.

## 3 · The one judgement call, stated rather than buried

**`null` still falls through to the parser**, which looks like the defect this
card removes. It is measured, not an oversight: on 2026-08-19 the catalog held a
row for 49 of 74 distinct live SKUs — the other 87 records, **975 units**, do not
join (`CARD-2026-08-19-onhand-category-filter`). Treating `null` as "not this
category" would drop nearly the whole warehouse out of the loan picker in one
commit, a far larger regression than the guess it removes.

So the parser keeps that bucket and the bucket shrinks every time someone keys a
product in. **The day it is empty, the branch and `lineCategory` die together.**
The exit condition is a test, not a comment — `line-category.test.ts`, *"null
means asked-and-silent, and TODAY that still falls to the parser"*, marked so a
green suite cannot hide the decision.

## 4 · The cost, counted

**ONE extra Cloudflare subrequest per 100 distinct SKUs.** `skuCategories`
chunks at 100 because the `in` list travels in the URL; lines and units resolve
in one call, not two. On the 2026-08-19 register (74 distinct SKUs) that is a
single chunk.

It was NOT folded into `resolveSkuLabels`, which already joins `product_models`
for the name and could have carried this for free. `skuCategories` is the ONE
category reader every other gate asks — the earliest-sell floor, the goods gate,
`/inventory` — and a second copy of that join is a second answer waiting to
disagree (ownership Law D). **One subrequest is the price of one owner.**

It fails OPEN: an error returns an empty map, every category is `null`, and the
browser falls back to the parser exactly as before. No new failure mode.

## 5 · Not in scope, and why

- **The storage rate** — D9's third answer, still its own. D9 does not close
  until it asks too. Kept out because it is a different owner and a different
  arithmetic (`d4-is-now-three-storage-arithmetics` is deliberately deferred).
- **`LoanPanel.tsx:217`** — already prefers the persisted `loan.category` and
  only parses as a fallback. That is the shape this card generalises, not a
  defect.
- **Deleting `lineCategory`** — it cannot go while `null` still falls back, and
  `lineClass` remains the honest three-valued classifier the readiness gates
  read. §3 names the condition that retires both.

## 6 · Done when

- [x] A production SKU the keyword list misreads (`5539-1A(LHF)`) resolves to
      `sofa` when the catalog says so — asserted for all thirteen.
- [x] The endpoint carries `category` on lines AND free units; a SKU with no
      catalog row comes back with the key PRESENT and `null`.
- [x] `pnpm typecheck` clean · shared 2452 · api 2287 · web 3088 · lint Stage 1.
- [x] `ERP-ARCHITECTURE.md` D9 records two of three answers closed and names the
      third.
