# SALES ORDERS — THE MIGRATION MAP

> **This file exists so the migration can continue without re-deciding anything.**
> It holds four things and nothing else: what SO-1 BUILT · what it DELIBERATELY did not build ·
> the DEBTS it is standing on · the PARKING LOT for every objection raised after approval.
>
> **It is not a second Orders MASTER.** Business rules live in
> [`orders/MASTER.md`](orders/MASTER.md); boundaries live in
> [`ERP-ARCHITECTURE.md`](ERP-ARCHITECTURE.md). When one of them and this file disagree, they win.

---

# §0 · THE MODEL — approved by SO-1, and it is NOT "Customer Order Register"

SO-1 asked whether *Customer Order Register* is the right long-term model. **It is not, and the
frozen charter already said so.** [`orders/MASTER.md`](orders/MASTER.md) §0, line 42:

> **IT IS NOT A PURE WORK QUEUE AND NOT A PURE REGISTER.**

The card's own RED LINE then makes the second half unbuildable in V1 — *what needs my attention*
is computed from stock, purchasing, delivery and booking, and every one of those is another
module's record. Read together they look contradictory. **They are not, and the reconciliation
is this file's first entry:**

```
There is exactly ONE attention signal Sales Orders OWNS: the promise itself.
`orders.delivery_date` against today needs no cross-module read, and §0 lists it
under OWNS — "the customer's promise / required date".
```

**THE MODEL, therefore:**

| Half | What it answers | Where it is |
|---|---|---|
| **REGISTER** | find any order, ever | ✅ **BUILT — SO-1** |
| **PROMISE MONITOR** · order-owned | is the promise still good? | the date is on the row; the heat is V2 |
| **PROMISE MONITOR** · cross-module | is anything blocking it? | **V2, through ONE shared read model** |

**Why the name matters rather than being tidy.** *Register* alone gives the next card no rule
against re-growing columns one cross-module fact at a time — which is exactly how V1 arrived at
eight columns and three dots. *Register + Promise Monitor* names the second half, so a
cross-module fact has somewhere to go that is not a new column.

**WHAT WOULD OVERTURN THIS.** Two days watching Shasha and Yu Jun work. If the first thing
either does on opening the page is SEARCH rather than triage, pure Register is right and this
entry is wrong. **Nobody has ever done it** —
[`research/grid-findings.md`](research/grid-findings.md) line 963 has carried that sentence
through every round, and ten cards were built past it. **It outranks every measurement in this
file.**

---

# §1 · WHAT SO-1 BUILT

```
apps/web/src/pages/operation/SalesOrdersRegister.tsx        the register
apps/web/src/pages/operation/SalesOrdersRegister.test.tsx   18 tests, the card's own criteria
apps/web/src/pages/operation/OperationApp.tsx               ONE line: which page /operation/orders mounts
scripts/check-design-standard.mjs                           Rule B could not see the kit's own shell
```

**ONE entry point.** `/operation/orders` and `/operation/orders/:stage` both mount the register.
The nameplate reads **Sales Orders** (it read `Orders`).

**THE OLD PAGE IS UNTOUCHED AND RESTORABLE IN ONE LINE.**
`OperationOrdersControl.tsx` is not edited, not renamed, not deleted. `OperationApp.tsx` holds:

```ts
const OrdersPage: typeof OperationOrdersControl = SalesOrdersRegister;
//                └── restore = put OperationOrdersControl on the right
```

The `typeof` annotation is load-bearing: the day the two pages' props diverge, **the build
fails** instead of the restore failing when it is needed.

### THE COLUMNS — five, and every one is a fact the ORDER owns

```
SO No · Customer · Items · Promised · Outstanding
```

| Change from the card's draft | Why |
|---|---|
| `Value` → **`Outstanding`** | The customer does not phone to ask what the order cost. `orderMoney` returns both; [`COPY-STANDARD.md`](COPY-STANDARD.md) line 945 already rules Outstanding is **printed, never left as a subtraction**. `Value` stays in the chooser. |
| `Ordered` **dropped from the row, kept as the default sort** | It answers nothing in a 60-second call, and `COPY-STANDARD.md` line 943 already spends the word `Ordered` on a Purchasing **quantity** column. Two meanings, one word. |
| nothing added | |

**Measured fill rates, production 2026-08-08, 77 orders in list scope:** SO 77/77 · Customer
77/77 · Phone 77/77 · Items 77/77 (avg 2.4 lines, max 8) · Promised 71/77 (5 no date yet) ·
priced 29/77 — and of the 48 unpriced, **37 are the AutoCount archive that dies at go-live** and
8 are rental-minted. Among native orders: **29 of 32 priced.**

**`—` means nothing is owed. A BLANK means nobody has priced this order.** Two different facts;
the live page spells both as empty.

### WORDS

`TBD` is a **banned** word (`COPY-STANDARD.md` line 274, and line 983 lists it as a rejected
spelling). The live page renders it at `OperationOrdersControl.tsx:5569`. The register renders
**`No date yet`**, the approved shape.

`Open` is **banned for a customer order** (`COPY-STANDARD.md` line 873), so the two-state filter
is **`Not delivered` / `All orders`** — which is also exactly what it selects. *Complete* is
deliberately not claimed: `orders/MASTER.md` §2.4 — **"Delivered is not paid."**

### WIDTHS — measured, and the first measurement was wrong

Every width is the text's ink in the REAL cell, canvas-measured against the cell's own computed
font in Chromium with Inter and JetBrains Mono confirmed loaded, `+16` for the kit's `px-2`.

```
column        ink    width    the string that sets it
SO No        54.6       87    sized to `SO-100257`, not today's `SO-1257`
Customer    169.3      188    `MyHouse Management PLT`
Items       440.5      459    the widest live two-line composition
Promised     96.4      113    `Wed, 19 Aug 26` — this cell may never truncate (§3's rule)
Outstanding  61.6      109    sized to `RM 1,234,567`, not today's largest live order
                             table 998px · verified 0 clipped cells of 56 at 1440 AND 1130
```

**TWO METHOD FINDINGS, both worth more than the numbers.**

1. **A standalone harness is not the real cell.** Every MONO string measured identical to the
   rendered page to a tenth of a pixel (`CR0925 +2` = 70.2, the number S3.1 recorded). Every
   INTER string measured **3–6px NARROW**. Shipping the harness's numbers would have clipped
   `Customer` on the widest live name and taken the MONTH off every date.
2. **A truncating column needs +2 over its measurement.** `ink + 16` is the exact fit and an
   exact fit still ellipsises — `MyHouse Management PLT` at 169.3 in a 170.0 box drew as
   `MyHouse Management P…` while every arithmetic check said it fitted. Only the two truncating
   columns carry it.

---

# §2 · WHAT SO-1 DELIBERATELY DID NOT BUILD

| Not built | Why, and where it goes |
|---|---|
| **Stock · Delivery · Actions · Status · the three dots · PIC** | Every one is another module's record. `ERP-ARCHITECTURE.md` Law B. They return as the Promise Monitor's ONE shared read model, never as columns. A test asserts none of these words is on the header row. |
| **`journey` handed to the drawer** | The register computes no cross-module signal, so it has none to pass. The drawer's own prop doc says absent is the safe answer — *"rather than run a second derivation that could disagree"*. |
| **A persisting column chooser** | `carres.orders.hiddenCols` was RULED AGAINST 2026-08-04 (F58 · F61) and deleted in S1; [`ui/MASTER.md`](ui/MASTER.md) §7 carries *"Layout memory — REFUSED, not deferred."* The chooser is session state and a test asserts `localStorage` stays empty. **Whether a NAMED layout with a company default (AutoCount's own answer, F44) should exist is the owner's, and is parked.** |
| **Tabs · facet rail · bulk actions** | The card. |
| **A new list endpoint** | The card says the 200-row cap is *recorded only*. §3 records it. |
| **OWNER SCOPE (`My Orders` default)** | `orders/MASTER.md` §2.2 freezes it, and the card's first screen has no rail or tab to host it. The charter's own table settles where it belongs: *DATE SCOPE = the REGISTER is the scope · OWNER SCOPE = the WORK is the default filter.* V1 is the register half, so V1 is **Everyone**; owner scope returns with the Promise Monitor. |

---

# §3 · THE DEBTS THIS PAGE STANDS ON

### 🔴 D-A · The register silently stops being the register
`apps/api/src/routes/operation/orders.ts:192` — `.order("placed_at", desc).limit(200)`. At
1,000 orders/month that is **the newest ~6 days**. No total, no "200 of N", no error. The frozen
DATE SCOPE ruling (*"`All` = every non-cancelled order"*) becomes false and nothing on screen
says so. Invisible today at 77 rows.

### 🔴 D-B · Search is client-side, and that is ONE debt on purpose
The server searches customer name · imported ref · SO number — **not phone, not item**
(`orders.ts:184`). Passing `search` would make two of the card's four fields silently dead, so
the register passes none and filters the fetched page itself. **All four work today, and they
expire at exactly the same row count as D-A.** One fix serves both: a thin server-paged,
server-searched list endpoint.

### 🔴 D-C · Nothing the register sorts or searches on is indexed
`orders` carries 15 indexes and **none on `placed_at`** (the sort key) and **none on
`customer_name`** (the search key). `pg_trgm` is **available and not installed**. Only `so` is
indexed (`orders_so_key`).

### 🟡 D-D · Payload
Measured **4,734 bytes per order** (base + lines + control, `entry_data` excluded, before
threads, annotations, PO coverage and partner embeds). 200 rows ≈ 950 KB. An uncapped register
≈ **56 MB**.

### 🟡 D-E · A second full fetch on every other operation page
`pages/operation/components/GlobalTopBar.tsx:57` calls `useOperationOrders({})` for its feed, on
every operation page except this one.

### 🔴 D-F · TEAM assignment is NOT homeless — it is load-bearing on the file being replaced
The card records it as *"TEAM assignment homeless"*. It is not.
`POST /api/operation/staff/auto-assign` has **exactly two callers in the repository**, both
inside `OperationOrdersControl.tsx` (`:2852`, `:5040`).

```
grep -ran "staff/auto-assign" apps/web/src apps/api/src   → those two lines, nothing else
```

**So while the register is mounted at `/operation/orders`, unowned orders are no longer dealt
out.** Presence and pool enrolment are safe — `POST /heartbeat` is fired by the shell at
`OperationApp.tsx:98` — but the SWEEP is not. It must be carried before the old page is retired,
and it does not belong in a register: **it is the Promise Monitor's, or the shell's.**

### 🟡 D-G · The drawer replaces the list
Opening one order costs you the register (`grid-findings.md` F31). Reused as instructed and
recorded, not solved.

### 🟡 D-H · `moneyOf` and `stageOf` live in a page
Both are pure and exported, and `OperationDelivery.tsx:51-59` already imports them the same way
with the reason written above the import. Re-composing `orderMoney` + `storageHold` in the
register would be a SECOND arithmetic — Law D's named failure. **They move to
`@carres/shared` on the commit that retires `OperationOrdersControl`, not before**: the card
says the old implementation may not be touched.

### ⚪ D-I · Salesperson and Outlet cannot be offered
`orders.salesperson_id` is filled on 40/77 and `outlet_id` on 32/77, but **neither is on the
list payload and neither has a name embedded** — the chooser would offer a column of UUIDs. It
needs the list endpoint to carry the names (D-B's card).

### 🔴 D-K · FOUR API TESTS ARE ALREADY RED ON THIS BRANCH — found by SO-1, not caused by it
```
src/routes/operation/to-order.test.ts   stamps eta_date = today + production + transit
src/routes/partner/pickups.test.ts      GET /api/partner/pickups returns LP's POs
src/routes/supplier/pos.test.ts         threads with per-order sku_lines flattened
src/routes/supplier/pos.test.ts         empty array (no second query) when PO has no threads
```
**Proved pre-existing, not asserted:** `git stash -u` → the same 4 fail → `git stash pop`.
`@carres/api` reads **3 files failed / 103 passed · 4 tests failed / 2,131 passed** with and
without this card. SO-1 touches no API file (`git status` = `apps/web` + `scripts` + `docs`).
`@carres/web` 2,742/2,742 and `@carres/shared` 2,231/2,231 are green.
**Left out of this commit on purpose** — three unrelated modules, and mixing them into a
register card would hide both. It needs its own card and it needs one soon: a red suite stops
being read.

### ⚪ D-J · `check-design.mjs --report` is broken
It reads `docs/UI-KIT.md`, which no longer exists (it is `docs/ui/MASTER.md`). Pre-existing,
unrelated to this card, warn-only tooling. Guard rule **I** also sits **+2 over its baseline of
298** — two class strings the register shares with the Claims page. Stage 1 is warn-only.

---

# §4 · THE REGISTER ACCEPTANCE TEST

**Give the boss ONE real order and 30 seconds.** Not a demo, not a walkthrough — hand over an
SO number or a customer name and stop talking.

```
①  FIND IT      type any one of: the SO number · the customer's name ·
                their phone as they say it · a product they bought
②  READ IT      the row answers, without opening anything:
                     what did I buy      → Items    (the chevron opens every line in full)
                     when did you promise→ Promised
                     what do I still owe → Outstanding
③  WHAT NOW     open the row → the existing drawer, unchanged
```

**PASS** = ①②③ inside 30 seconds, no scrolling sideways, no asking what a column means.
**FAIL** = change the UI. **Not a code debate, and no planning round** — the card pre-approved
both outcomes.

**The one question this test is expected to raise**, so it is not mistaken for a bug: on an
order nobody has priced, `Outstanding` is **blank**, and blank can read as *nothing owed*. The
alternative (`—`) is worse, because it claims a fact nobody knows. If the boss reads a blank as
zero, that is a FAIL of ② and the fix is a word, not a colour.

---

# §5 · PARKING LOT

**SO-1's one round of challenge is spent. Everything below is recorded, not re-opened.**

| # | Raised | By whom, when |
|---|---|---|
| P1 | **`ui/MASTER.md:250` says `✗ start with Sales Order — the standard comes first`.** SO-1 goes straight there, so Sales Orders now DEFINES the page-structure standard by being built first instead of being the first page built TO it. The owner's newest instruction outranks the document; the line needs retiring or the card needs re-reading. | SO-1 review, 2026-08-08 |
| P2 | **A named layout with a company default** (AutoCount F44) versus no memory at all. `ui/MASTER.md` §7 hands this to the owner by name. | SO-1 review |
| P3 | **The drawer as a full-page route rather than a replacement panel.** 2990's own Sales Order detail is a route (`SalesOrderDetail.tsx:2`); Carres' is a 7,717-line panel that costs you the list. | grid-findings F31 · SO-1 |
| P4 | **Nobody has watched an operator work.** Outranks everything else in this file. | grid-findings §6, every round |
| P5 | **16 free-text SKUs need real names.** They are what makes `Items` a 459px column; real names make it narrower. | `ui/MASTER.md` §6.5 |
| P6 | **The footer shows a count and no money total.** S2.3 shipped a total on the live list; the register omits it because the card said *only facts, no business computation*. Worth re-asking after the acceptance test. | SO-1 |

---

# §6 · WHAT THE NEXT CARD DOES

**In this order, and the first one is not optional.**

```
1  RUN THE ACCEPTANCE TEST (§4). It is 30 seconds and it decides the next card.
2  CARRY THE SWEEP (D-F). Unowned orders are not being dealt out today.
3  THE LIST ENDPOINT (D-A · D-B · D-C · D-I). Thin, server-paged, server-searched
   over SO · customer · phone · item, with the indexes to match. It retires four
   debts at once and it is what 1,000 orders/month actually needs.
4  ONLY THEN the Promise Monitor — ONE shared read model, never a new column.
```

**Do not** add a column, a tab, a rail or a queue to the register before step 1 has been run.
That is the mistake this whole programme is the receipt for.
