# SALES ORDERS — THE MIGRATION MAP

> **This file exists so the migration can continue without re-deciding anything.**
> It holds four things and nothing else: what SO-1 BUILT · what it DELIBERATELY did not build ·
> the DEBTS it is standing on · the PARKING LOT for every objection raised after approval.
>
> **It is not a second Orders MASTER.** Business rules live in
> [`orders/MASTER.md`](orders/MASTER.md); boundaries live in
> [`ERP-ARCHITECTURE.md`](ERP-ARCHITECTURE.md). When one of them and this file disagree, they win.

---

# ⭐ THE REGISTER LAW — SO-5 (Loo, 2026-08-09), VERBATIM

> **It applies to every future register: PO / Receiving / Payments / Claims.**

```
The register never owns workflow.
A register may: Search · Filter · Sort · Select · Inspect.
A register never executes business workflow.
Workflow always belongs to its owning module.
Bulk selection may only be used for view-oriented actions
(print / export / copy), never operational workflow.
```

**And the internal vocabulary is fixed with it (SO-5):** the left grid is the **Register**, the
right pane is the **Detail Panel**. Users only ever see **"Sales Orders"** — the sidebar door,
the tab title and the page header all say it, and no user-facing surface says "register".

# ⛔ SALES ORDERS UI IS FROZEN — SO-5 (Loo, 2026-08-09)

**SO-5 passed acceptance and the Sales Orders Blueprint is FROZEN: no UI redesign is accepted;
bug fixes and minor usability only.** A chat that wants to move a column, a band, a pane or a
word on this page is asking to reverse an owner ruling and must say so out loud.

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

# §0.5 · SO-1 FINAL SUPERSEDED THE FIRST BUILD — what THE REGISTER LAW changed

**Loo, 2026-08-09:** *"Forget web applications. Build this page as if you were building Microsoft
Excel."* The card that followed is not a tweak of the first one; it deleted four things the
first build shipped and added the document. **§1 below is rewritten to the final card; the list
here is what MOVED, so the next chat does not re-propose any of it.**

| Was | Now | Because |
|---|---|---|
| a row expansion holding every line | **gone** | *"The register never expands and never explains."* The document lists every line. |
| rental orders on the register | **excluded at the source** | The Rental module owns a rent-to-own agreement; 0275's minted Sales Order is its shadow, not a sale. Measured: 8 live, **0 priced**. |
| `Outstanding` as a default column | **`Value` is default; `Outstanding` is a hidden fact column** | The owner's re-issued card. My first-round argument for the swap was heard and overruled. |
| `Ordered` dropped from the row | **restored** | And **half my objection was simply wrong**: I argued it collided with `COPY-STANDARD.md:943` (a Purchasing QUANTITY column); lines 872-873 of that same file answer it — *"a word banned on one is not automatically banned on the other."* No collision. |
| SKU codes in `Items` | **product names** | `Booqit · CNR ×1`, resolved server-side. |
| the old cockpit drawer on row click | **a Sales Order document** | A cockpit is workflow, and workflow is not the register's. |
| `Import from AutoCount` in the footer | **gone** | A register has no actions. |
| the execution right rail | **NOT MOUNTED on this route** | The card calls it a product rule, not a space preference. |

---

# §1 · WHAT SO-1 BUILT

```
apps/web/src/pages/operation/SalesOrdersRegister.tsx        the register
apps/web/src/pages/operation/SalesOrderDocument.tsx         the Sales Order DOCUMENT
apps/web/src/pages/operation/sales-order-facts.ts           the facts, pure and testable
apps/web/src/pages/operation/SalesOrdersRegister.test.tsx   27 tests — THE REGISTER LAW, clause by clause
apps/web/src/pages/operation/OperationApp.tsx               ONE line for the page + the rail is not mounted
apps/api/src/routes/operation/orders.ts                     additive: product NAMES + salesperson/outlet
apps/web/src/lib/queries.ts                                 the three new optional wire fields
docs/COPY-STANDARD.md                                       the four absence words
scripts/check-design-standard.mjs                           Rule B could not see the kit's own shell
```

**THE API CHANGE IS ADDITIVE AND IT REMOVED AN IMPLEMENTATION RATHER THAN ADDING ONE.** The
detail route has resolved `Model · Variant` per line since 2026-07-16 so the drawer could show
names; the register needs the same names on the ROW, and the alternative was a second sku→name
implementation in the browser. That body is now `resolveSkuLabels` at the top of the file and
**both** handlers call it — `ERP-ARCHITECTURE.md` Law D. The list also gained
`salesperson_id` + `salespersons(name)` + `outlets(name)`: the card asks for both as hidden
columns and neither could be drawn before, because the id was not on the wire and the name was
nowhere. Both FKs are single, so the embeds need no disambiguating hint. The old control table
selects none of it and is unaffected.

**THE ITEM NAMES, MEASURED 2026-08-09 — and this is why there is a fallback at all:**
```
                lines   named by the catalog
native            82    81   (99%)
AutoCount         94     0   (0%)   ← an imported "sku" IS free text: `1013Jager/Fab3-King/PC151-01`
rental             8     8            excluded from the register
distinct SKUs on live orders: 84, of which 37 are in the catalog
```
There is no code being hidden on an imported line — there is **no name to show instead**, and
the text on the order is what the salesperson wrote. At go-live the import is gone
(`CLAUDE.md` §6) and the fallback stops being reachable for anything but a genuinely new
product.

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

### THE COLUMNS — the card's six, unchanged

```
default   SO No · Customer · Items · Value · Promised · Ordered
hidden    Phone · Salesperson · Outlet · Outstanding
```

**No change was proposed and none was made.** SO-1's first round argued for swapping `Value` to
`Outstanding` and dropping `Ordered`; the card was re-issued with both kept, so both ship. See
§0.5 for the half of that objection that was wrong on the law rather than merely overruled.

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

# §1.5 · WHAT SO-3 BUILT — the register grew seven powers and gained a PANEL

> **Loo, 2026-08-09:** *"KEEP the current foundation. DO NOT rebuild. Upgrade in place."*
> Nothing in §1 was thrown away. Every file below is the SO-1 file, edited.

```
apps/web/src/components/kit/DataTable.tsx        4 new OPTIONAL powers (below)
apps/web/src/components/kit/tokens.ts            ROW_HEIGHT — 40 and 34
apps/web/tailwind.config.ts                      h-row · h-row-compact, named keys
apps/web/src/pages/operation/sales-order-columns.ts   the FIELD CATALOG — 6 + 28
apps/web/src/pages/operation/SalesOrderPanel.tsx      the Sales Order panel
apps/web/src/pages/operation/SalesOrdersRegister.tsx  the register, upgraded
apps/web/src/pages/operation/sales-order-facts.ts     `promiseHistory`
apps/api/src/routes/operation/orders.ts          14 flat fields · history metadata ·
                                                 changeRequests · POST /request-change
supabase/migrations/0326_a_promise_is_never_moved_silently.sql
docs/COPY-STANDARD.md                            the panel's words + the event-stamp rule
```

### THE SEVEN CAPABILITIES, AND FOUR OF THEM WENT INTO THE KIT

| Capability | Where | Note |
|---|---|---|
| every column sortable | kit, existed | now driven off the catalog, so a new column cannot arrive unsortable |
| **auto-filter row under the header** | **kit, NEW** — `Column.filterInput` | the kit renders the box; the PAGE owns which rows survive |
| **freeze `SO No` + `Customer`** | **kit, NEW** — `DataTable.freeze` | `left` is MEASURED off the rendered header, so a resize keeps the pin correct |
| resize | kit, existed | wired for the first time (`layout`) |
| show / hide columns + Reset | page | one catalog, so the chooser cannot drift from the columns |
| **keyboard ↑ ↓** | **kit, NEW** — `DataTable.activeRow` | one press moves the row AND the panel; there is no second press |
| instant panel update | page | the panel reads the row the grid is ON |

**Every one is an OPTIONAL prop and no signature moved** — the three frozen pages that render
`DataTable` pass none of them and emit the markup they emitted before (`ui/MASTER.md` §4).
A kit test asserts that licence.

### ⭐ THE ONE CLAUSE OF THE REGISTER LAW THAT MOVED, AND WHO MOVED IT

```
SO-1  "no cell may contain another layout"   → one string per cell
SO-3  "Customer cell: phone under the name"  → ONE cell, TWO lines
```
**The owner re-ruled his own law, and the clause the law is FOR still holds:** *a row may never
be taller than another row.* `text-body` is 18px of line-height and `text-meta` is 16 — the
stack is **34px**, which is exactly the row height the same card asks for (`density −15%`).
The two halves of that instruction are ONE decision and they arrive in one row height.

**34 is not a taste.** `ui/MASTER.md` §4 puts the floor at ~32px, because the kit's in-row
expand button is 24px at any density and a change below that moves `badge-height` too. 40 × 0.85
= 34, which clears it with 5px either side, and no second token moved. The number lives in
`tailwind.config.ts` and is mirrored by `kit/tokens.ts` `ROW_HEIGHT`.

### THE COLUMN CHOOSER — 6 on, 28 off, and NOT ONE of them computed

**Fill rates, production 2026-08-09, all 77 orders:** phone 77 · channel 77 · floor 77 · lift 77
· address 72 · promised 71 · salesperson 40 · source ref 37 · email 32 · outlet 32 · payment
method 32 · race/gender/birthday 32 each · emergency 31 · address parts 27 · proceed date 27 ·
approval code 24 · deposit paid 23 · instalments 2 · **DO no 0 · invoice no 0 · invoiced 0 ·
dispatched 0 · delivered 0 · billing 0 · stair items 0**.

**The zeroes are still offered, and that is `CLAUDE.md` §6 rather than an oversight**: every row
in this database is TEST data and go-live starts CLEAN, so a live count is evidence about
whether the CODE works and never about whether the FIELD matters. What it does decide is the
absence word — five of the zeroes are event stamps, and `COPY-STANDARD` now rules them
`Not recorded` rather than minting a sixth word.

**`race`, `gender` and `birthday` are on `orders` and are deliberately NOT offered.** They are
filled 32/77 and they are not facts about the ORDER — a register that offered them would be a
customer database growing inside a sales-order page, and nobody asked for one.

### THE PANEL — and it closes F31, which SO-1 filed against itself as D-G

The register stays mounted. `?order=<id>` opens the panel beside the grid; `?view=document` is
the full-page printable Sales Order, kept as its own screen because it is the thing you print.
**Opening one order no longer costs you the list.**

**THE THREE PERMISSION LEVELS, and the middle one is why 0326 exists:**
```
LEVEL 1  edit          phone · address · internal note
                       PATCH /api/orders/:id (0222 already admits customer fields on a
                       proceed-lane order) + POST /annotations. Both already existed.
LEVEL 2  REQUEST       the customer's postpone · an item change
                       0326: two new kinds on `order_change_requests`, one RPC, and
                       `orders.delivery_date` is NEVER written.
LEVEL 3  never         items · prices · discount · salesperson · Ordered ·
                       the ORIGINAL promised date. No control, not a disabled one.
```

**`Original {date} · changed ×N` counts records and nothing else.** Measured 2026-08-09: ONE
live `order_history` row records a `delivery_date` edit, and `update_order` stamps the payload
it was SENT — which holds the NEW value only. **So a change is countable and the original is not
recoverable from those rows**, and the cell prints the second line only when a record actually
says what the date was before. Never `changed ×0`; never the current value dressed as the
original. A test holds both.

### ⭐ THREE DEFECTS THE TESTS PASSED AND THE SCREEN DID NOT — all found by looking

**Every one shipped green.** They are recorded because the lesson is the same each time: a
suite proves the rule it was given, and only the built page proves the rule was right.

**1 · A REQUEST WAS BEING COUNTED AS A CHANGE.** The first `promiseHistory` counted 0326's
`promise_change_requested` rows. Recorded a real postpone against SO-1299 on production and the
strip printed **`Original Sat, 29 Aug 26 · changed ×1`** — while the order still promised Sat,
29 Aug, so the "original" it named was the CURRENT date and the count claimed a move that had
not happened. **`changed ×N` must mean the customer was told a different day N times.** It now
counts `{kind:'edit', changed:['delivery_date']}` and `promise_change_applied` only; the
undecided ask is reported once, by the panel's own *Waiting for a decision* line, which names
old → new. *(Nothing writes `promise_change_applied` yet — that is D-M's card.)*

**2 · THE STRIP'S MOST IMPORTANT LINE WAS ELLIPSISED.** Four cells across a 420px panel is
~105px each, and `Sat, 29 Aug 26` alone is ~105px of ink at `text-strong`: the promised date
drew as `Sat, 29 A…` and its second line as `Original Sat, …`. Widening the panel takes the
width off the REGISTER, which is the thing that has to stay readable — so the four cells are
**2 × 2**, which is still exactly four cells and gives each ~186px. Nothing truncates now, and
SO-1's own rule (*the Promised cell may NEVER truncate*) is kept rather than quietly broken by
a panel it was written before.

**3 · THE TOOLBAR OVERFLOWED, TWICE.** At 1440 a 448px search pushed the scope Select UNDER the
Columns button; fixing that at 1440 then broke again when the panel opened and took another
420. The search is now `flex-1` capped at 384 — **it is the control that absorbs the squeeze**,
because a date field that shrinks stops showing a date. One line at every width.

---

# §1.6 · WHAT SO-4 BUILT — the register runs 2990's grid engine, full-bleed

**Recorded here by SO-5, because SO-4 shipped without writing itself into this file.** The
register was re-based on 2990's own shipped mechanics
(`2990s/apps/backend/src/components/DataGrid.tsx`): header ▼ per column (checklist · date
presets + range · min/max), Gmail-style chips that exist only while a ▼ narrows, `dense` 28px
rows at fs-12, windowed (virtual) rows, full-bleed (no card, no `PageShell`), and no Refresh —
the query refetches itself. The permanent filter-input row and the standalone date pickers —
inventions 2990 never had — were deleted. The Customer cell went back to ONE line, and `paid`
stopped printing `Paid in full` on an order nobody had paid a sen on (`RM 0` is a figure).

# §1.7 · WHAT SO-5 BUILT — the freeze card, walked clause by clause

**SO-5 is the last UI card. Everything below is the frozen shape** (the freeze notice is at the
top of this file):

```
NAMING     the sidebar door says Sales Orders (operation AND principal areas) ·
           Register / Detail Panel are the internal words, never shown to users
LAYOUT     the Detail Panel is a SIDE PANE at a FIXED 35% — a flex sibling,
           never an overlay. Opening it REFLOWS the grid: every column kept,
           proportionally narrowed (`fill` sizing), SO No + Customer frozen,
           Items ellipsising. No resizing — deferred by owner ruling.
           The dead white zone is gone: SO-4's `content` sizing + trailing
           filler was the dead zone, and `fill` retires it in both pane states.
REGISTER   five default columns: SO No · Customer · Items · Promised Delivery ·
           Ordered. Value moved to the chooser, default off. Customer cell is
           the NAME ONLY, one line; Phone is its own optional column. Selection
           checkboxes serve Export ONLY (THE REGISTER LAW's clause); the Export
           button says `Export CSV · current view` / `Export CSV · N selected` —
           the format joined the card's scope words on Loo's same-day review
           ("Export 什么？" — 2990's `Export Excel` names its format, ours names
           CSV; `Export ▾` waits for a real second format). There is NO Actions
           menu. The Columns button carries 2990's own count — `Columns · 5/34`
           — same review. Search is fixed at 200px. Filter state (every ▼ + the
           search + the scope) persists on the URL — a narrowed register is a
           shareable link. The empty state is `No matching sales orders.` with
           one `Clear filters` button — never a blank table. The status bar
           says `{n} orders`, and `{x} of {n} · Filters active` while narrowed.
COLUMNS    the chooser is remembered per user (localStorage, auto-remember —
           NOT a layout manager: no widths, no order, no filters in the store),
           lists EVERY column in four groups (Order · Customer · Money ·
           Dates), and carries `Reset columns`. The "Extra facts. Cleared on
           reload." line is deleted — it stopped being true. The menu lives in
           the register column's toolbar, so it can never overlap the open pane.
PANEL      header unchanged (SO no · customer · phone, one line); facts strip
           on top with Outstanding visually dominant over Paid; section order
           strip → Customer → Items → History. The strip's date fact is
           `Promised Delivery`, per the dictionary below.
WORDS      COPY-STANDARD gained the Sales Order date dictionary — Ordered ·
           Promised Delivery · Original Promised Delivery · Current Promised
           Delivery · Requested Delivery Date · Delivered · Completed — and the
           status bar's words were overwritten there (`Record x of y` retired).
```

**What 2990's own Sales Orders screen has that this register deliberately does NOT copy** (its
screenshots were supplied during the build, and Loo walked them point by point the same day):
`New Sales Order`, `Scan Order` and `SO Maintenance` are workflow/configuration doors ON its
register — THE REGISTER LAW forbids exactly that here, and order creation stays with the
POS/sales portal. Its KPI strip (Revenue / Outstanding / Paid) is a boss's band, not an
operator's — *"Operator 第一眼不会想 Revenue，而是今天要处理什么"* — and its breadcrumb
duplicates a sidebar Carres already has. Its long scrolling New SO form loses to the Detail
Panel. **What WAS taken:** the Excel-style header ▼ (already in since SO-4), the named export
format, and the `22/42` columns count.

# §1.8 · THE SALES DOMAIN — Loo's direction, 2026-08-09 (recorded so it does not die in chat)

**Stated on 2990's screenshots during SO-5, and it is DIRECTION for the next IA card, not a
change to this frozen page:**

```
Sales Orders is not a PAGE. It is a DOMAIN — 2990/SAP shape:

Sales
├── Sales Orders      ← the Register (THIS page, frozen)
├── Delivery
├── Payments
├── Returns
├── Amendments
└── Settings          ← every configuration fact (venue, dropdowns, country,
                        building type…) moves HERE. The Register stays clean,
                        exactly as 2990's `SO Maintenance` is its own door.
```

- **The Register never grows a Settings section, ever** — configuration is a sibling page of
  the domain. Purchasing follows the same shape later.
- **The standing question for every future button on ANY register** (his words): *"这是
  Register 应该拥有的吗？还是它属于这个 Domain 的其他页面？"*
- **And the frame he named:** this page is the **Carres Register Blueprint** — Sales Orders ·
  Purchase Orders · Receiving · Claims · Payments · Deliveries · Inventory will all wear this
  shape. THE REGISTER LAW at the top of this file is that blueprint's first law.

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

### 🟩 D-G · CLOSED BY SO-3 · The document replaced the register in place
Opening one order cost you the list (`grid-findings.md` F31, filed about the old drawer and
equally true of SO-1's document). **The row now opens the PANEL and the register stays mounted**
— no unmount, no re-fetch on Back, and `↑`/`↓` keep working while an order is open. The
printable document is still its own screen, reached by `⤢`, because it is the thing you print
and printing a panel is not a thing. *Remaining: the document screen still unmounts the grid.
That is correct for a document and is not a debt.*

### 🟡 D-H · A CJK customer name would render in the wrong font
The register's cells are bare strings, because the law says no cell may contain another layout —
so there is no `<span class="font-cjk">` to switch to Noto Sans SC. Measured 2026-08-09:
**0 of 77 live customer names carry a CJK character** (Malaysian Chinese customers are romanised
in this data). When one arrives, the font belongs on the kit's `<td>`, where every column gets
it — never on a wrapper one page smuggles into one cell.

### 🟡 D-L · `Money` rounds to whole ringgit, and COPY-STANDARD says never
`apps/web/src/components/Money.tsx` renders `Math.round(n).toLocaleString()`;
`COPY-STANDARD.md`'s *"a money figure is never rounded"* rule demands two decimals, because the
figure is what an operator says out loud and what a receipt must match. Measured 2026-08-09: of
69 non-rental live orders, **0** carry sen in value, paid or outstanding — so nothing on screen
is wrong today, and the first part-payment with sen makes it wrong. It is a SHARED component on
every money surface in the portal; it needs its own card, not a register's.

### 🟩 D-I · CLOSED BY SO-1 AND WIDENED BY SO-3 · the chooser has real names, not UUIDs
SO-1 put `salespersons(name)` + `outlets(name)` on the list payload; **SO-3 added the other
fourteen flat fields** the chooser offers (`channel`, `customer_email`, the five address parts,
floor / lift, billing / emergency, `invoice_no` / `invoiced_at`, `payment_method`,
`installment_months`). Both FKs are single, so neither embed needs a disambiguating hint. The
entry stays here rather than being deleted, because it is the receipt for why a chooser and a
list endpoint are one question.

### 🟡 D-M · SO-3 · The two Level-2 requests have nowhere to be DECIDED
A postpone and an item change are recorded as `pending` rows on `order_change_requests` and the
panel shows what is waiting. **Nobody can approve or reject one from this page** — the existing
decision doors (`/api/orders/:id/change-requests/:id/decide`) were built for the dealer's three
PRODUCT kinds and are wired to the POS's approval queue, not to a register. That is deliberate
for one card: a decision surface is a WORKLIST, and a register has none (`MIGRATION-MAP` §0's
Promise Monitor is where a worklist goes). **Until it exists, a request waits and a human moves
it by talking to somebody.** It needs its own card and it should be the next one after §6's
step 2.

### 🟡 D-N · SO-3 · Editing the address clears the structured address parts
`update_order` (0230) treats a flat `customer_address` write with no parts in the payload as a
stale-guard and NULLs `customer_address_line1/2/city/state/postcode`. The panel edits the
composed address only, so an operator fixing a typo silently drops the parts. Measured
2026-08-09: **27 of 77 orders carry parts**, and nothing on any screen reads them today except
the chooser's own five columns. The fix is a structured address editor in the panel (five
fields, sent together) — it is a form design, not a register's, and it is not urgent while
nothing downstream consumes the parts.

### 🟡 D-O · SO-3 · One order still holds ONE pending PRODUCT change
0326 split `order_change_requests_one_pending` so an operator's postpone can never block a
dealer's product change — the three product kinds keep the exact predicate they had, and the two
new kinds get their own per-kind index. **But the dealer's own rule is unchanged**: an order
with a pending `add_lines` still refuses a `replace_lines`. That was 0129's ruling and this card
did not reopen it; it is recorded here because the next chat WILL find the two indexes and
wonder which one is the intent. Both are.

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

### 🟩 D-K · STILL FOUR, STILL NOT SO-3's — and now PROVED against an edited API file
SO-3 edits `apps/api/src/routes/operation/orders.ts`, so "we touch no API file" is no longer
the argument. The named four are unchanged and none is in this route:
`@carres/api` reads **3 files failed / 103 passed · 4 tests failed of 2,141** before and after,
and `src/routes/operation/orders.test.ts` is **82/82 green** including SO-3's six new door
tests. The card is still owed. *(`@carres/web` **2,815/2,815** · `@carres/shared`
**2,231/2,231** · typecheck clean · design-standard clean · `pnpm build` clean.)*

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
                     what did I buy      → Items    (one line; the document has every line)
                     when did you promise→ Promised
                     what do I still owe → Outstanding
③  WHAT NOW     open the row → the Sales Order PANEL, beside the register
                (SO-3; SO-1 opened the printable document in its place)
```

### THE 30-SECOND PHONE TEST, walked on the built page (SO-3, 2026-08-09)

**The customer says a name or a number, and the operator answers three questions.**

```
"how much do I owe?"      register  → Outstanding (a hidden column, one tick)
                          panel     → OUTSTANDING, second cell of four, always a
                                      sentence: the amount · Paid in full · No price yet
"when will it arrive?"    register  → Promised, a default column
                          panel     → PROMISED, and `Original … · changed ×N` under it
                                      when the promise has actually moved
"what did I buy?"         register  → Items, product NAMES, `+2 more` past two
                          panel     → ITEMS, every line with its qty and its money
```
**Every one is answered without leaving the register**, which is the change: the list is still
on screen behind the panel, so the next call does not start with finding the page again.
`⤢` is only for the printable document.

**PASS** = ①②③ inside 30 seconds, no scrolling sideways, no asking what a column means.
**FAIL** = change the UI. **Not a code debate, and no planning round** — the card pre-approved
both outcomes.

**The blank is gone, and that was SO-1 FINAL's own instruction.** `Value` and `Outstanding` now
print one of three sentences — the amount, **`Paid in full`**, or **`No price yet`** — so an
empty-looking cell can never mean both *settled* and *nobody priced it*. The four absence words
(those two plus `Not recorded` and `Not given`) are entered in `COPY-STANDARD.md`, not invented
on screen.

**③ is one click and the document answers it whole:** customer, phone, address, salesperson,
ordered, promised, every line with its price, total, paid, outstanding, and a read-only history.
It has no `Issue PO`, no ETA, no stock, no delivery action and no journey widget — and it writes
nothing at all, which is the property that keeps the boundary rather than a promise to keep it.

---

# §5 · PARKING LOT

**SO-1's one round of challenge is spent. Everything below is recorded, not re-opened.**

| # | Raised | By whom, when |
|---|---|---|
| P1 | ✅ **SETTLED BY SO-3.** `ui/MASTER.md` §6.5 said `✗ start with Sales Order` and `✗ add grid capability`. The owner then issued SO-1 and SO-3, which do both — twice, in writing, after that block was written. **A document nobody may contradict while the owner contradicts it is not a law, it is a stale note**, so §6.5's two lines are retired in this card rather than quietly worked around. Sales Order is now the page the standard is derived FROM. | SO-1 review 2026-08-08 · closed 2026-08-09 |
| P2 | **A named layout with a company default** (AutoCount F44) versus no memory at all. `ui/MASTER.md` §7 hands this to the owner by name. | SO-1 review |
| P3 | ✅ **ANSWERED BY SO-3, and neither of the two options won.** The record opens BESIDE the list, not as a route and not as a replacement panel — so the list is never lost and the URL still deep-links (`?order=`). The printable document keeps the full screen, which is the one case a route was right for. | grid-findings F31 · SO-1 · closed 2026-08-09 |
| P7 | **A Level-2 request has nowhere to be DECIDED** (D-M). The panel records; nobody approves. The decision surface is a worklist, and this page has none. | SO-3, 2026-08-09 |
| P4 | **Nobody has watched an operator work.** Outranks everything else in this file. | grid-findings §6, every round |
| P5 | **16 free-text SKUs need real names.** They are what makes `Items` a 459px column; real names make it narrower. | `ui/MASTER.md` §6.5 |
| P6 | **The footer shows a count and no money total.** S2.3 shipped a total on the live list; the register omits it because the card said *only facts, no business computation*. Worth re-asking after the acceptance test. | SO-1 |

---

# §6 · WHAT THE NEXT CARD DOES

**In this order, and the first one is not optional.**

```
1  RUN THE ACCEPTANCE TEST (§4) WITH THE BOSS. It is 30 seconds and it decides
   the next card. SO-3 walked it on the built page and it passes; that is not
   the same as an operator doing it, and P4 still outranks everything here.
2  CARRY THE SWEEP (D-F). Unowned orders are not being dealt out today.
3  DECIDE A REQUEST (D-M · P7). Two kinds of request can now be RAISED and
   neither can be answered. That gap is one card old today and it grows.
4  THE LIST ENDPOINT (D-A · D-B · D-C). Thin, server-paged, server-searched
   over SO · customer · phone · item, with the indexes to match. It retires three
   debts at once and it is what 1,000 orders/month actually needs. **SO-3 raised
   its urgency:** every column now filters IN THE BROWSER over the fetched page,
   so the 200-row cap is now silently narrowing a filter as well as a search.
5  ONLY THEN the Promise Monitor — ONE shared read model, never a new column.
```

**Do not** add a column, a tab, a rail or a queue to the register before step 1 has been run.
That is the mistake this whole programme is the receipt for.
