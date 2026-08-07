# PURCHASING — MASTER

> **This is the ONLY Purchasing document.** There is no queue file, no checkpoint, no
> information model, no map, no NEXT. When something is re-ruled, **this file is overwritten**
> — never annotated "superseded", never copied to a v2. **Git history is the archive.**
>
> **You read `CLAUDE.md` (the Constitution) and this file. That is all.**
> Open `COPY-STANDARD.md` only when you need a word, `ACTION-FLOW-STANDARD.md` only when you
> need the engine law, `01/02/03-*.md` only when you need a token.

## How to use this file — go straight to your business object

**Organised by what you are working on, not by document type.** You are not looking for
"the workflow"; you are looking for **Receiving**.

| I am working on | Read |
|---|---|
| anything | **§1 · §2 first — they are short and they bind every tab** |
| SO Batch Purchase · Manual Purchase (today: To Order) | **§3** |
| Purchase Orders | **§4** |
| Receiving | **§5** |
| Claims | **§6** |
| Report | **§7** |
| Settings | **§8** |
| a decision that crosses tabs | **§9** |
| something already approved and deliberately not built | **§10 Approved Evolution** |

**Every object section has the same six blocks:** `MISSION · WORKFLOW · WHAT IS ON SCREEN
TODAY · API + DATA · FROZEN RULES · APPROVED EVOLUTION`.

**Update law.** Ship something → this file is overwritten in the same PR. The
`WHAT IS ON SCREEN TODAY` block and its `measured` line are what a chat trusts; **a stale one
is the single most expensive defect this document can carry.**

---

# §1 · Overview

**Purchasing turns approved purchasing demand into goods on a Carres floor.** It is the
buyer's module. It does not own goods movement (that is Receiving's warehouse half and
Stock) and it does not own money (that is Finance).

**TWO WAYS A PO IS BORN, ONE WAY IT LIVES** (Loo, 2026-08-06 — the navigation
ruling. **APPROVED, NOT YET BUILT**; today's screens are §3–§8's measured
blocks):

```
SALES                       PURCHASING
Sales Order  ····read···▶ SO Batch Purchase ─┐
                                             ├─▶ Purchase Order ─▶ Receiving ─▶ Supplier Claim
                          Manual Purchase   ─┘
```

```
Sales        Sales Order         every customer order. SALES owns it.

Purchasing   SO Batch Purchase   only the customer orders PURCHASING still has
                                 to act on — a filtered purchasing workspace,
                                 never a second Sales Order page
             Manual Purchase     purchases nobody's customer asked for:
                                 Ready Stock · Display · Office · Warranty ·
                                 Spare Parts · and whatever is added next
             Purchase Order      every issued PO, whichever lane bore it
             Receiving · Supplier Claim

Reports and Settings are PORTAL pages, not Purchasing pages
(`../ERP-ARCHITECTURE.md` §2.1).
```

**SALES ORDERS IS NOT A PURCHASING TAB** (Loo, 2026-08-06 — his refinement of
the same day's ruling). Purchasing READS the sales orders; it does not carry
them. The two answer different questions and the difference is the whole
point: *what did the customer buy?* is every order, while *which orders need
buying today?* is a filtered few — an order already covered by stock never
reaches SO Batch Purchase at all.

> **`PortalSidebar` is available on every operation screen**
> (`OperationApp.tsx:243`) and provides navigation between Orders and
> Purchasing. `GlobalTopBar` is suppressed on working pages
> (`OperationApp.tsx:254-260`), but it is not responsible for module navigation.
>
> **The navigation difference from AutoCount is not reachability — it is
> information architecture.** AutoCount exposes all business documents
> permanently in the navigation; Carres exposes modules first, then reveals
> documents inside the module. **Navigation decisions are based on operator
> workflow, not on implementation history or another ERP.**

**THE SPLIT IS BY JOB, NEVER BY TABLE.** Both lanes may store their demand in
`purchase_demands`; what differs is the OPERATOR'S INTENT, and that is what a
page is organised around. Customer-driven buying runs on the PO days with an
engine plan; internal buying is keyed in when somebody needs something.

**A PO CARRIES THE REASON IT WAS BORN FOR.** *"Supplier doesn't care — the PO
is ours"* (Loo): the factory receives a PDF either way, so consolidating a
customer's mattress with the shelf's into one document buys nothing and costs
the answer to *why did we buy this?* Two lanes therefore issue their own POs,
and Report can split the month by reason — `Customer Sales · Ready Stock ·
Display · Office · Warranty` — instead of reconstructing it.

> **🔴 What this ruling needs and the database does not have (measured
> 2026-08-06): `purchase_orders` carries NO reason column and
> `purchase_order_lines` carries no link back to its demand.** Until one
> exists the split report cannot be built at all. It is the first thing the
> build owes.

*Measured reality (2026-08-06):* typed demands live in `purchase_demands` with
`purpose ∈ ready_stock · display · office · warranty` (0323's gate; Spare Parts
and Other are not offered yet). Customer-order demand is COMPUTED from order
lines rather than stored as rows.

**Before you change any tab, answer both:** does what upstream sends still get in, and can
downstream still catch it?

**Live scale, measured 2026-08-06.** Every row is TEST data — at go-live the database starts
clean. These numbers are evidence about whether CODE WORKS, never about business volume.

```
purchase_demands   2      purchase_orders   24  (22 open · 16 with no arrival date)
purchase_order_lines 38   units ordered     47
received / damaged / wrong    4 / 1 / 0
warehouse_receipts 3      receiving_events   3      supplier_claims 1     units on_hold 0
suppliers 10  —  5 have no WhatsApp group, 0 of 10 have a phone

po_supplier_promises 6  —  4 arrivals across 3 POs · 1 ready date · 1 balance
                           SIX POs hold an arrival date; only THREE were given one.
```

---

# §2 · What crosses every tab

## 2.1 · The shell

ONE white 44px header row (`PurchasingTabs.tsx`). **Pages draw no header of their own** — no
breadcrumb, no `<h1>`, no page-level icons. A page structurally cannot forget the header
because it never draws one.

**One Workspace template**: 200px navigation rail → kit `DataTable` listing (for FINDING —
sort, filter, search) → 400px workspace pane (where the WORK happens). Receiving, Purchase
Orders and Report all run it. To Order runs the same shell with a launcher rail.

## 2.2 · Shared machinery — one home each, and a second copy is a defect

| Concern | The ONE home |
|---|---|
| action words (queue · line · button · done · empty) | `packages/shared/src/order-action-words.ts` — `PurchasingActionKey`, six keys |
| the supplier calls and their due dates | `packages/shared/src/purchasing-supplier-calls.ts` |
| the receiving ladder (4 rungs; the ORDER is the rule) | `packages/shared/src/po-receiving.ts` |
| PO risk order · work state · **who said the arrival date** | `comparePoRisk` · `poWorkStateOf` · `PoWorkspacePo.supplierArrivalDateIso`, `packages/shared/src/po-workspace.ts` |
| **when the goods reach us — the ONE arithmetic** | `expectedArrivalOf`, `packages/shared/src/purchasing-settings.ts`. Production on the FACTORY's week + transit on the OFFICE week. **Both the issue path and the register call it; a third spelling is the defect it was extracted to end.** |
| claim lifecycle, asks, answers, close gates | `packages/shared/src/supplier-claim.ts` |
| quarantine outcomes + status mapping | `packages/shared/src/stock-hold.ts` |
| the engine's numbers | `packages/shared/src/purchasing-settings.ts` + `purchasing_settings` |
| who is on PO duty this month | `ops_po_duty` → `GET /operation/po-duty` → `useOperationPoDuty()` |
| the rail recipe · the facet row | `components/rail/workspace-rail.tsx` · `components/FacetRow.tsx` |

> **`org_duties` does NOT hold the PO-duty holder.** Its six keys are `ops_manager` ·
> `po_duty_editor` · `account_creator` · `finance_approver` · `roster_editor` ·
> `stock_planner`; `po_duty_editor` is *the person who edits the rota*. The rota is
> **`ops_po_duty`** (month → user). Live: Jul = Shasha · Aug = **Yu Jun (CR004)** · Sep = Khor Yee.

**THE DUTY MODEL** (Jess 2026-07-24, LOCKED · cover ruled by Loo 2026-08-06). Two rotating
duties, offset by ONE month, one 3-person office team — there is no warehouse crew:

```
        PO duty (issue + call)    GRN duty (receive)    no duty this month
Jul     Shasha                    Yu Jun                Khor Yee
Aug     Yu Jun                    Khor Yee              Shasha
Sep     Khor Yee                  Shasha                Yu Jun
```

- **GRN duty is COMPUTED — the next month's PO holder from the same rota (offset-1). No
  second table, no second API.** The person who ordered never receives (segregation of
  duties). Urgent orders may bypass the rotation; a manager may override (`DutySelect`).
- **BUDDY COVER.** The member with NO duty this month covers EITHER duty. **The absence
  signal and the cutoff are the Orders pool's own law** (`staff.ts`, Jess round-3 —
  reused, never respelt): before 10:00 MYT late ≠ absent; from 10:00 with no heartbeat
  today the holder is absent TODAY and the free member covers; the holder logging in later
  takes the duty straight back; `away` (planned leave) covers from the start. **The two
  hat-wearers never cover each other** — that would put issuing and receiving in one pair
  of hands. Both absent → the remaining member does both and the Team panel says so to a
  manager. **Nothing is reassigned in data: duty is DERIVED, so cover changes the answer
  to "who, today?", never a row.**
- **WHERE IDENTITY SHOWS (Loo, 2026-08-06): the Team panel is the ONE home.** It already
  states `PO DUTY` and **must gain a `GRN DUTY` row (not built — §10)**. A page never
  repeats a duty block and no rail carries a duty chip. A per-row avatar circle appears
  ONLY where rows can carry DIFFERENT names — Claims (owner = the month it was opened).
  To Order and the supplier calls carry no per-row identity: the whole surface belongs to
  the month's holder, and repeating one name down a page is noise.

## 2.3 · The numbers the engine reads

Seven, all manager-editable on **Settings**, all audited (who · when · what it was before).
**A supplier × category with no number is NOT defaulted to 7** — it reads `Set a number`, gets
no order-by date at all, and To Order names the pair out loud. Migration 0303.

```
production working days   mattress 7 · bedframe 7 · sofa 14
order-by buffer           7 today → 10 at go-live
PO days                   Mon · Wed · Fri
supplier work week        per supplier (Ohana works Saturday)
```

## 2.4 · Words

**A word not in `COPY-STANDARD.md` may not appear on screen. Stop and ask Loo.**
Seven portal verbs: `Assign · Call · Issue · Upload · Close · Return · Check`.
Retired and permanently banned from reuse: `Chase` · `Send` (as an action) · `Contact` ·
`Prepare` · `Draft PO`.

**FIELDS AND ACTIONS ARE TWO LAYERS AND NEVER SHARE A NAME** (Loo, 2026-08-06).
`Expected Arrival` is a FIELD — our own arithmetic. `Confirm ready date` ·
`Confirm tomorrow's delivery` · `Confirm balance delivery date` are ACTIONS — a
conversation with the supplier. `Check Expected Arrival` was proposed as the call's name
and REJECTED: naming the call after the field re-merges the two mouths the provenance work
separated (the operator is not checking our estimate; they are asking the factory).

**DATES ON A RAIL PRINT WEEKDAY + DATE — `Thu 6 Aug` — on every row, one format**
(Loo, 2026-08-06). Never a bare weekday (`Monday` is ambiguous — which Monday?), never
`Today` / `Tomorrow` (relative words rot in screenshots and re-sort themselves overnight).
The full date stays on hover. `Later` is the word for beyond a rolling window — never
`Next Week`, which starts lying on Thursday.

## 2.5 · A measurement trap that has cost this module real time

> **`apps/web/src/pages/operation/OperationSupplierClaims.tsx:240` holds a NUL byte** (a
> deliberate sort-key separator). **Shell `grep` treats the whole file as binary and returns
> NOTHING without `-a`.** Node's `readFileSync(…, "utf8")` is unaffected, so the repo's own
> test guards are safe — a chat measuring by hand is not.

**And the general form of it:** `grep` answers *"is the word I already thought of present?"*.
It cannot tell you about a button you have not imagined. **Read the file.**

---

# §3 · SO Batch Purchase *(on screen today as `To Order`)*

### MISSION
Review, consolidate and issue purchase orders for **demand the engine generated from
customer orders**. Purchase Orders MANAGES the documents once they exist.

> **APPROVED, NOT YET BUILT (Jess, 2026-08-07):** this tab becomes **`SO Batch Purchase`**,
> and the hand-typed purposes (Ready Stock · Display · Office · Warranty · Spare Parts)
> leave it for their own tab, **`Manual Purchase`** — with a FULL-PAGE create workspace,
> never the 600px dialog. **Both lanes issue their own POs** (§1). Everything below
> describes the single `To Order` tab as it stands today.

### WORKFLOW
The engine computes a plan per PO day and pre-selects exactly its own plan (`orderBy ≤ today`).
Rows in later buckets start unticked and a human ticks them — **human ticks are DELTAS a
refetch cannot overturn.** `Issue` posts one call per supplier × category group.

**Ready stock is SUGGESTED, never consumed** (Jess, 2026-07-21). The engine allocates the free
pool earliest-deadline-first and shows the operator a number and the records behind it; a human
presses `Reserve`. Whole records only — a bulk record that would over-reserve is skipped, never
split. Every draw records a reason on K4's dated ledger.

### WHAT IS ON SCREEN TODAY
`OperationToOrder.tsx` · route `/operation?tab=purchase` · *measured 2026-08-06, after T3
shipped: the grid rebuilt AutoCount-aligned (T1, approved by Loo on the exact mock), widths
measured in a real browser with the kit's own header classes, the longest customer name and the
open-PO cover both counted with SQL.*

```
LEFT 200px    PO SCHEDULE  rolling calendar of configured PO days, red OVERDUE row above it
                           which the next run may never swallow; every day row prints
                           weekday + date in ONE format (`Fri 7 Aug` — Loo 2026-08-06,
                           never a bare weekday, never Today/Tomorrow; full date on hover)
              CATEGORY     All · Mattress · Bedframe · Sofa · Pillow · Mattress Protector,
                           with UNIT counts (bare numbers)
              + Create Purchase        the manual entrance — may never be missing
              the rail is WHITE on the canvas grey, the other four tabs' base

RIGHT         toolbar  pill search · selection state · Issue pill (exists ONLY while
                       something is selected) · quiet `Updated hh:mm`, never a Refresh
              grid     TEN aligned columns (T1's seven + T1.1's two + T3's one,
                       2026-08-06):
                       ☑ · SO No. · Customer · Customer Delivery · Proceed date ·
                       Supplier · Qty · Model · Ready Stock · On PO · PO No.
                       widths 99 · 181 · 163 · 143 · 111 · 55 · 155 · 99 · 71 · 175
                       The last three are the buyer's question in order — *is it
                       in the warehouse · is it already bought · did I buy it
                       today* (2990s' MRP row: `Stock · PO Outstanding ·
                       Shortage`). `On PO` is NEUTRAL ink, never green: green is
                       `Ready Stock`, something you can take today.
                       A row every unit of which is already on an open purchase
                       order is a RECEIPT (T6): it stays, prints that PO number
                       as the same blue link, cannot be ticked and is in no
                       total. `Total · N units` counts what is still TO BUY.
                       ONE aligned ORDER LINE per customer order, WHITE with a
                       `slate-6` rule above it — never a grey band (Loo, T1.1: six
                       bands down one sheet read as stripes, and grey is chrome while
                       an order is data). It carries SO · customer · date · proceed
                       date + waited days, and in the PO cell the `Partly ordered`
                       pill beside the numbers; item rows leave the identity cells
                       blank. The Supplier‥Ready Stock span on an order line is EMPTY:
                       no order fact is ever parked under an item header.
                       A Ready Stock group prints `Required By {date}` in the Delivery
                       column and its destination under Customer.
                       The order line's ☑ toggles ALL its builds (all / indeterminate /
                       none); selection itself stays BUILD-level, frozen.
                       Header-click sort on every column · per-column ▼: SO No. and
                       Customer are searchable checklists, Customer Delivery is the
                       portal's Excel date ▼ (Overdue · presets · month buckets ·
                       Custom Date Range…), the PO filter speaks business
                       (`Yet to Order` + the real numbers).
                       Below its own 1326px (the ten + the ☑ + the ⊞) the grid
                       SCROLLS SIDEWAYS, never truncates — Purchase Orders' own
                       behaviour; deleting a business column, or shrinking one
                       below its measured content, to avoid a scrollbar is
                       forbidden.
              totals   `Total · N units` — ALWAYS ON, counts the visible sheet
              footer   units per category for what is TICKED (P9) · Clear filters
```

**Controls** `to-order-create-purchase` · `to-order-issue` · `to-order-retry` ·
`to-order-cancel-dialog`/`-qty`/`-submit` · `to-order-clear-filters` · `to-order-footer-clear`
· `to-order-total` · `kit-table-group-{orderId}` (the order line's ☑) ·
`to-order-free-{row}` (the Ready Stock number) · `to-order-onpo-{row}` (the On PO number) ·
`table-expand-{row}` → `to-order-reserve-{row}`
· `to-order-cancel-{row}` (both acts, one door — see FROZEN RULES)

**Create Purchase** is a multi-line dialog (`+ Add line` / `Remove`, 600px wide). One POST per
line; a created line can never post twice because the loop walks only rows that are not
`created`; a failed line keeps the server's own sentence and `Create` retries exactly those.

### API + DATA
`GET /operation/purchase/to-order` · `GET …/demand/pick-items` · `POST …/demand` ·
`POST …/demand/:id/cancel` · `POST …/issue` · `POST …/take-stock`
Tables: `purchase_demands` (**2 rows**) — one row per SKU; `issued_qty` is writable only
through `purchasing_demand_record_issue` and `remaining_qty` is GENERATED (0320), so two stored
numbers can never disagree. A cancel stamps `cancelled_at` and lets the remainder FREEZE (0321)
— **no cancelled-quantity column exists, deliberately.**

### FROZEN RULES
- **`Order By` never reaches the screen.** Each row carries it only to know its time bucket;
  the operator sees the CUSTOMER's date.
- **Issue = zero popups, zero toasts.** Rows update in place; a partial failure stays with
  `Retry` until it succeeds.
- **⭐ A BOUGHT ROW READS AS DONE FROM THE LEFT EDGE, AND RED STAYS ON WORK** (Loo, 2026-08-07,
  on the live page). T6 put every already-bought order back on the sheet and they arrived
  wearing the **overdue bar** — the page telling an operator to act now about goods somebody
  had already bought — and otherwise looking identical to work, with the only distinguishing
  fact, the purchase-order number, sitting past 900px of table. Measured after the fix: **60
  bought rows, 0 red bars, 60 muted; 27 work rows, 9 red, 0 muted.**
  `rowLate` now asks `!poOf(r)` — `01-design-tokens` §2.2 gives red exactly one job and a row
  with a purchase order has no claim on it — and a bought row wears the kit's `rowMuted`, the
  same wash Purchase Orders puts on a cancelled document. **The ORDER LINE above stays
  full-strength:** who the customer is and when they want it is still worth reading.
- **An ITEM row prints `↳` in the `SO No.` cell and nothing else.** The identity columns are
  blank on an item row by design (the fact is stated once), which was fine while the goods sat
  beside them; at nine columns the grid is 1,255px, so on a narrower window the only columns
  visible are the four that are deliberately empty and the sheet reads as blank blocks. The
  marker is **2990s' own answer** (`Mrp.module.css:348-353`): a literal glyph in a cell, never a
  `padding-left` indent, because it survives a column resize and copies into Excel as a
  character instead of vanishing.
- **⭐ A CUSTOMER ORDER IS NEVER TORN APART — AND A RECEIPT ROW'S KEY IS UNIQUE** (Loo, on the
  live page 2026-08-07: *"wrong"*). Measured: sorting the grid produced **64 group headers for
  47 orders — 17 orders split into fragments** scattered down the sheet, and the first five rows
  had no order line above them at all. It read as a sorting bug and it was a KEYING bug: a
  receipt row was keyed `po:{poId}:{orderId}` while the wire sends one row per BUILD, so a
  purchase order carrying three pieces for one customer minted **three rows with the same key**
  — React placed them where it liked, and `rowByKey` and the selection had been reading a
  colliding map the whole time. The key now carries the row's ordinal.
  **Both halves stay, because they are two different rules.** The key is unique, AND the page
  re-clusters after every sort so an order's items stay under their own line whatever column is
  clicked — the kit emits a header when the key CHANGES from the row above (its own contract:
  the page's sort decides grouping), so a sort on any per-ITEM fact would interleave orders and
  shatter the grouping. The sort still means what the header says: click `Qty` and the order
  holding the biggest quantity comes first.
- **⭐ AN ORDER ALREADY BOUGHT STAYS ON THE SHEET, WITH ITS PURCHASE ORDER** (Loo, 2026-08-06 —
  T6, closing G11). A demand line every unit of which sits on an open purchase order used to be
  DROPPED by the engine, and with it the whole customer order when all its lines were covered:
  measured that day, **41 of 78 eligible demand lines were covered and every one of them in
  FULL**, so `SO-1210` vanished and *"where is SO-1210?"* was answered on no screen. **A
  workspace can only be checked by what it shows.**
  It returns as a **RECEIPT — the exact shape an already-ordered row has had since
  2026-08-01** — which is what keeps it out of the selection, the rail counts, the category
  footer and `Issue` without one new rule: every one of those already asks *does this row have a
  purchase order?* `validateIssuePlan` refuses it server-side as `already_on_po`, because a rule
  that lives only in the browser is not a rule.
  **The number it shows may be a purchase order raised for ANOTHER customer.** The engine nets
  per SKU, earliest deadline first, so units go to whoever needs them soonest — measured, **18 of
  54 covered demand rows**. It answers *where are these units coming from*, never *this is your
  document*, and **it can change between refreshes** when a more urgent order joins the pool.
  Nothing is lost when it moves; the allocation moved. Loo was shown this and took the trade for
  a real number over a vague word.
- **`Total` counts what is still TO BUY, not every row on the sheet** — the receipts forced the
  repair. It summed the visible rows while the only receipts were a handful of POs from the last
  fortnight; with T6 the sheet carries **35 of 62** rows that are already bought, and summing it
  said `71 units` on a day the buyer had 32 to place. The rail's category counts have skipped
  bought rows since P9, so this is two numbers on one screen agreeing instead of contradicting
  each other 200px apart.
- **⭐ A FACT IS SCANNED; AN ACT IS CHOSEN** (Loo, T1.1, 2026-08-06). A fact the buyer reads
  down the page gets a COLUMN — `Ready Stock` is the case that named the rule: the free-stock
  number existed on every row since P10 and could only be reached by noticing a ⊞, so the
  answer to *must I buy this at all* was invisible (measured the day it shipped: **91 free
  units across 50 SKUs**, ONE row on the page saying so). An ACT stays behind the row's ⊞,
  where a scanning finger cannot reach it by accident: `Reserve` writes the stock register and
  `Cancel Purchase` cannot be undone from any screen. **Two acts, one door — G10 is CLOSED**
  and the `PO No.` cell answers one question again.
- **⭐ `On PO` IS THE THIRD OF FOUR NUMBERS, AND IT ANSWERS *WHY 1?*** (T3, Loo, 2026-08-06).
  `net-requirements.ts` has netted open purchase orders out of demand since the day it was
  written (`coveredByOpenPo`), and the number **had ZERO readers in the repository**: a fully
  covered line was dropped and a PARTLY covered line printed its REDUCED quantity with nothing
  beside it. The grid said `Qty 1` where the customer ordered 3, and the two units on `PO-2051`
  were stated on no screen — so the buyer could not check the plan before signing it. 2990s'
  MRP row is the reference (`Qty Needed · Stock · PO Outstanding · Shortage`); this page already
  had two of the four, and `On PO` is the third. **Neutral ink, blank at zero, no ▼, and no act
  in the cell** — a fact is scanned, an act is chosen. The hover names the purchase orders
  behind the number (`2 on PO-2051`), recovered by replaying the ENGINE's own allocation order
  over the API's per-document list; **when it cannot be resolved the number ships alone — a
  reference is never invented**, because an operator can phone a PO number that does not exist.
  **No migration, no new query**: `po_id` IS the PO number, and it rode a query already run.
- **⚠️ A FULLY COVERED LINE IS NOT ON THIS GRID, AND THAT IS NOT A BUG.** It has nothing left to
  buy, so it leaves the workspace exactly as a stock-covered line does. **The demand is NOT
  lost**: the engine reads `status = 'open'` and nothing else, so cancelling the purchase order
  brings the requirement straight back. The consequence to hold on to is that **the pool drains
  earliest-deadline first, so at most ONE line per SKU can ever be PARTLY covered** — the one
  the pool ran out on. **Measured on production the day T3 shipped: 78 eligible demand lines,
  41 of them covered by an open purchase order and ALL 41 covered in FULL (43 units across 24
  SKUs), 0 partly — so the column is blank on every live row today.** It is a correctness
  instrument, not a busy one, and the next chat must not read the blank as a defect.
- **THE ORDER LINE IS WHITE, RULED — NEVER A GREY BAND.** Measured on the live page: the band
  was `bg-kit-slate-2`, a step the palette does not publish, so it had rendered as NOTHING and
  the order line was byte-identical to the item rows under it. Painting it grey fixed the
  hierarchy and broke the reading (*"every customer is grey too — i confused"*): a group line
  every two rows makes six bands a stripe pattern. The separation is a `slate-6` rule above
  the line — the `divider` token, whose stated use is *section split* — and grey stays what
  the surface law says it is: chrome.
- **No Status pills, no Sort By, no Group By** — two filter doors for one fact is the Excel sin.
  The `PO No.` column IS the status answer: `Yet to Order` / the number / the order line's
  amber `Partly ordered` pill. **No Status column is ever added beside it.**
- **The engine owns the schedule; operators own the PO.** `Hold` / `Skip` / `Next-Run` /
  `Postpone` are banned forever. The two exceptions are `Change Required Date` and
  `Cancel Purchase`.
- **A sofa line with no modules carries its own quantity**; a group of more than one line is a
  build and collapses to 1.
- **The grid is ALIGNED, never a sentence** (T1, Loo 2026-08-06). An order's facts print once,
  on their own row, each in the column whose header names it — a free-text group header was
  ruled hard to read and may not come back.
- **Ordered rows STAY on the grid** in their 14-day window (AutoCount's Posted/Partial habit);
  a PO number is the door to Purchase Orders with that document open — the PDF button lives
  there, never here.
- `resize` and `reorder` are **REFUSED here in writing** (Q6) and a test asserts their absence:
  content sizes every column, nothing truncates at 1280, and **below ~1200px the grid scrolls
  sideways rather than truncating** — Purchase Orders' own behaviour.
- **NO `Ref` column, ever** (Loo, 2026-08-06). CR/TCF refs (`source_ref`) are AutoCount /
  Master-Sheet IMPORT artifacts — test data only. Go-live starts clean with no such import, so
  **no feature may depend on `source_ref` existing** and the ruling is recorded here so the
  column never comes back.
- **An order with no delivery date does not reach operation** (Loo, 2026-08-06). The SALES
  portal enforces the date at entry; To Order's guard (a dateless customer order is not listed)
  is a backstop, not the enforcement. **The enforcement build belongs to the Orders module,
  not Purchasing.** A Ready Stock demand is exempt: its empty date means *buy on the next run*.

### APPROVED EVOLUTION
- **The Planning Workspace** — the frozen information architecture made true on this tab.
  FOUR measured gaps carry it: **G1** demand whose supplier cannot be resolved is silently
  discarded · **G2** supplier resolution runs by TWO different rules in one module (planning
  by the item's own supplier; PO creation also by category coverage) · **G3** intentionally
  held demand produces no output at all — it must state what · who · why · until when ·
  **G5** `Check in` must leave To Order and **Receiving must gain PO · supplier · customer name
  · SO number · warehouse · ETA · quantity-still-to-receive FIRST**, or information is deleted.
  *(**G8** · **G10** · **G11** are CLOSED, 2026-08-06. G8 by T1: the customer's date sits under
  the `Customer Delivery` header and a typed demand prints `Required By {date}`. G10 by T1.1:
  `Cancel` left the `PO No.` cell for the row's ⊞, on the rule a fact is scanned and an act is
  chosen. G11 by T6 — see FROZEN RULES.)*
- **The September switch** — Nice Future stops supplying; a new mattress supplier takes over on
  the subscription model. Sofa and bedframe unchanged.

---

# §4 · Purchase Orders

### MISSION
Pick today's purchase order → update supplier progress → talk to the supplier → hand over to
Receiving.

### WORKFLOW
A PO is ISSUED as one act (there is no draft). The portal then asks the supplier three
questions in order, and each one closes only while the answer still names the CURRENT facts:

```
Confirm ready date              when will it be finished?
Confirm tomorrow's delivery     is the van going tomorrow?
Confirm balance delivery date   per PO LINE, after a short delivery
```

**Every promise is kept, never overwritten** — `po_supplier_promises` is append-only and each
row names what it was made ABOUT, so a factory that slips again re-opens the call by itself.

**AND IT IS THE PROVENANCE OF THE ARRIVAL DATE** (Loo, 2026-08-05; built). `purchase_orders`
holds ONE arrival date and it may have come from either of two mouths — the factory's, or our
own arithmetic at issue time. **The ledger is what tells them apart**: an arrival is the
supplier's word only while a `tomorrow_delivery` promise stands behind it. A `ready_date`
promise is fact ① and never counts, because *"finished on the 12th"* is not *"with you on the
14th"*. Read once, through `poDateHistoryOf(...).currentDate`.

**All three calls are in the engine** (T2, 2026-08-06). `purchasingSupplierCallsOf` carries
`confirm_ready_date` · `confirm_tomorrows_delivery` · `confirm_balance_delivery_date`. The
ready-date call opens on an open PO that still owes goods when the factory has neither a
STANDING ready date nor a STANDING arrival promise (standing = about a day not yet passed —
S4's rule, so a factory that slips re-opens the call by itself). Its due is
`customer date − buffer (OFFICE week) − production working days (FACTORY week)`; a
supplier × category with no production number, or a PO with no customer date, gets NO due and
can never turn late (P1/T7). The facts are OPT-IN on `SupplierCallPo` — a caller that does not
carry them (Receiving's mapping) asks no ready-date question. **And a ready date the factory
gives MOVES the expected arrival** (0325): the API computes
`ready date + transit working days` with `arrivalFromReadyDate` — the ONE spelling, shared
with `expectedArrivalOf` — and the RPC records it in the same transaction as the promise row;
no transit number → the old arrival stands, never a guessed one. The previous arrival is
never destroyed: the ledger is append-only, `po_history` prints old → new, and the cell keeps
its `(revised)` marker.

### WHAT IS ON SCREEN TODAY
`OperationPurchaseOrders.tsx` · route `/operation/procurement` · *measured 2026-08-06, after
T2 shipped: the rail rebuilt on screen, the calendar walked in tests against the frozen
sketch's own dates.*

```
LEFT 200px   CALLS      — the week's factory calls, a rolling FIVE-office-
                          working-day window (T2, frozen with Loo 2026-08-06):
                          Overdue      red · above the days · only when > 0
                          Thu 6 Aug    today — always the first day row
                          …            weekday + date on EVERY row, one format
                                       (§2.4); full date on hover; zero-count
                                       day rows STILL render
                          Later        beyond the window · only when > 0
                          Counts = the engine's own dues (a dueless call plans
                          no day — P1/T7 — and shows in the unfiltered listing
                          only). Public holidays skip exactly as weekends
                          (`myHolidaySet()` until the Working Calendar, §10).
                          Day rows are VIEWS — a click only narrows the
                          listing; a call cannot be made early. No duty chip
                          (§2.2). A factory-Saturday due files under the
                          office's LAST day on or before it, never the day
                          after (it would first surface already late).
             SUPPLIER PROGRESS
                          Waiting Supplier Date · Waiting for Goods · Ready to Receive ·
                          Completed · Cancelled            (PO_WORK_STATE_LABEL)
                          Both groups draw the shared rail recipe
                          (`components/workspace-rail.tsx`) — the inline copy
                          this page carried is deleted (its own docblock's
                          instruction, done with T2).

CENTRE       NINE frozen columns, ONE fixed set:
             PO Issued · Supplier · PO No. · SO No. · Items · Destination ·
             Customer Delivery · Expected Arrival · Current Action
             widths 96 · 88 · 83 · 95 · 136 · 135 · 140 · 206 · 192, min-width 1208
             default order = RISK TO THE CUSTOMER'S PROMISE
             Current Action on a dateless PO now reads the ENGINE's own
             `Confirm ready date` — a real due underneath the same word, in
             place of the state word `Check Expected Arrival` (Q8's sameness
             held: overdue and dateless still read ONE word)

RIGHT 400px  WORKING HEADER → REFERENCE LAYER → SUPPLIER FOLLOW-UP →
             RECEIVING SUMMARY → ACTIVITY
```

**Controls** `po-date-open`/`-form`/`-input`/`-save`/`-reason`/`-remarks`/`-extend` ·
`po-ready-date-open`/`-input` · `po-print-pdf` · `po-open-whatsapp` · `po-open-email` ·
`po-copy-message` · `po-wa-toggle` · `po-save-template` · `po-history` · `po-activity` ·
`po-panel-items` · `po-panel-close` · `po-overdue` · `po-arrival-gap`

### API + DATA
`GET /operation/pos` · `/:id/print-data` · `/:id/receiving` · `/:id/source-orders` ·
`/:id/units` · `/awaiting-stock-shortage` · `/report` · `POST /` · `/batch` · `/:id/ready-date`
· `/:id/tomorrow-delivery` · `/:id/sends` · `/:id/cancel` · `/:id/office-receive` ·
`/:id/assign-pickup-partner` · `/:id/reassign-warehouse` · `/:id/chase-event` ·
`POST /lines/:lineId/balance-date` · `/destination` · `/ops-remark` · `/split` ·
`PUT /message-template`

Tables: `purchase_orders` **24** · `purchase_order_lines` **38** · `po_history` **23** ·
`po_sends` **3** · `po_revisions` **2** · `po_supplier_promises` **6**

**`GET /operation/pos` already ships every promise per PO** (`promises`, read since 0310 for the
date history), which is why provenance needed **no migration and no new wire field** — the
answer was already on the page, unread.

**`purchasing_record_ready_date` is 4-arg since 0325** (`p_po_id, p_new_date, p_reason,
p_new_eta`) — the old 3-arg signature is DROPPED, not overloaded, and a sanity block aborts
the migration if two signatures survive. The arithmetic is NOT in plpgsql: the API computes
`p_new_eta` with the shared `arrivalFromReadyDate` (Law D — one spelling) and the RPC only
records it.

### FROZEN RULES
- **The nine columns NEVER change because the panel opened.** No compact variant. When they do
  not fit, the LISTING REGION scrolls sideways — deleting a business column to avoid a
  scrollbar is forbidden. `resize` and `reorder` are how an operator rebalances.
- **ONE purchase order, ONE way of looking at it.** State is `{ poId, mode }`: row click opens
  the panel · the ⌄ expands the row and CLOSES the panel · collapsing brings it back on the
  same PO. Two POs on one screen are structurally unrepresentable.
- **PO-line quantities are RPC-only** (0316). No client may PATCH `received_qty`.
- **A sent PO is never edited.** More items means a NEW PO; stopping means cancelling the whole
  PO. There are no revisions to keep.
- **The portal never claims it sent anything.** Pressing a channel button records
  `{Channel} opened · Snapshot N` — a click is all the system observed. Print writes no history,
  moves no status, mints no revision and has no limit.
- **Communication is not part of the PO lifecycle** — never a status, never a stage.
- **Row order is risk to the customer's promise**, and clearing a header sort returns to it.
- **Red is reserved for a date the factory GAVE.** Our own estimate warns amber, greys the
  date, prints `· expected` on the expand, and makes the supplier draft ASK for a date instead
  of quoting ours back at them. **Provenance is the promise ledger, never a null test on
  `eta_date`** — that test broke on 2026-08-03 and was repaired 2026-08-06. `same day` stays
  amber either way: tight is not broken.
- **A promise can be broken; our own guess cannot.** `Overdue` counts only against a date the
  supplier named. A PO whose estimate has run out is `Waiting Supplier Date`, and its Current
  Action is already the identical phone call.
- **THE RAIL MOVES WITH PROVENANCE — LET IT** (Loo, 2026-08-06). He was shown the alternative
  — grey the date and freeze the counts — and rejected it: *a quiet queue that says goods are
  coming about a factory nobody has phoned is the same lie one level up.* **A louder queue
  whose number is true beats a calm one whose number is not.** Measured on the day it shipped,
  `Waiting Supplier Date` 16 → 19 and `Waiting for Goods` 6 → 3. *(His ruling quoted 16 → 21
  and 8 → 3, counted before `PO-2052` and `PO-2054` were received; the rule is what binds, not
  the two POs that finished in between.)*
- **The expected arrival has ONE arithmetic** — `expectedArrivalOf`: production on the
  FACTORY's week, transit on the OFFICE week. The register spelt it a second time without the
  transit leg and under-warned by exactly the day it forgot.
- **One editing surface per fact.** The expand is the working area; the right panel is Activity.

### APPROVED EVOLUTION
*(The CALLS calendar, the `Confirm ready date` queue and "a ready date MOVES the expected
arrival" all SHIPPED with T2 on 2026-08-06 — 0325 + the engine's third call + the rail — and
their rules now live under WORKFLOW and WHAT IS ON SCREEN TODAY above. Still separate,
deliberately: `expected_ready_date` and `eta_date` remain two columns and two facts — 0325
links them at the moment of recording; it does not merge them.)*
- **Prove it with a real PO, end to end** — the line has never run. Two gates have no home yet
  (a PO cannot be issued twice for the same customer line and quantity; a check-in cannot be
  posted twice for the same supplier DO number), and **whoever is on an action must show on
  it** — a lightweight claim `(action identity) → claimed by → claimed at`, expiring on
  `ACTION_CLAIM_TIMEOUT_MS` (already exported from `packages/shared/order-actions.ts` — import
  it, never retype the number), read ONLY through the open-action list. **`ops_tasks` has
  `claimed_by`/`claimed_at` and is still the WRONG home**: minting a task row per engine action
  turns the ladder back into a manual to-do list.
- **Fulfilment ≠ received.** A PO whose goods never touch a Carres floor must still be able to
  finish. **Two paths, per LINE** (*"本来就是一项一項"*): into a Carres warehouse → the
  Receiving Session IS the confirmation, **no button**; never touching a Carres floor →
  Operation confirms explicitly, and **customer self-collection is that second path, not a
  third**. Fulfilment carries its own record — who · when · which path — and may **never** be
  expressed by writing `received_qty`. **Measured: PO-2032 carries two lines to an
  address-only destination, so it can never reach `Completed` today.**

---

# §5 · Receiving

### MISSION
Book in what physically arrived, through ONE door that leaves a record.

### WORKFLOW
`Read Mode → Start Receiving → Receiving Mode → Save → Posted`. An Office receive opens a
Receiving Session and writes ONE `posted` event, through the same validator and the same
receive engine the warehouse uses. **A `submitted` event is deliberately NOT written for the
Office path** — two people and two acts is the Warehouse; one operator pressing Save once is
the Office, and an event records what happened in the BUSINESS world, not the steps the system
walked.

Damaged or wrong units become `on_hold` at the moment of receipt and stop counting as future
supply (0299), and a claim is raised automatically (0288's trigger).

### WHAT IS ON SCREEN TODAY
`OperationReceiving.tsx`, 1036 lines · route `/operation?tab=receiving` · ***measured
2026-08-06, after T5 shipped: the file read END TO END — the rail is TWO QUEUES with two
independent facet sets, which the previous entry did not say.***

```
LEFT 200px   QUEUES              To receive  ·  Goods Received      ← always both,
                                 never hidden at zero (a switch, not a facet).
                                 `?queue=received` rides the URL.

             ── while `To receive` is open ──
             RECEIVING PROGRESS  Receiving issue (danger) · Partially received ·
                                 In transit · Fully received
             SUPPLIER            per factory

             ── while `Goods Received` is open (its OWN facets, held apart) ──
             RECEIVED            Today · This week · This month · Earlier
             SUPPLIER            per factory
             SOURCE              last, and only once TWO desks have filed

CENTRE       `To receive` — SEVEN columns: PO Issued · Supplier · PO No. · Items ·
             Goods Arrival · Received · Current Action.
             Default order = PO Issued OLDEST first.
             `Goods Arrival` COLOURS WHEN IT IS LATE (T5, 2026-08-06) — red for a
             date the factory GAVE, amber for our own estimate, plain when it is
             not late, the existing grey dash when there is none. No new word:
             the colour is the whole change.
             ⚠️ MEASURED: `Goods Arrival` and `Received` are OUTSIDE the
             reading-pane compact set (`COMPACT_KEYS`), so with the workspace pane
             open — the default — neither renders. The operator sees the colour by
             putting the pane away or by sorting on the column (the honesty guard
             never hides a sorted column). NOT changed by T5, which was ruled to
             touch nothing but the colour; whether the compact set is right is a
             Workspace-layer question.

             `Goods Received` — SIX columns: Received · GRN No. · Supplier ·
             PO No. · Supplier DO No. · Units. No Status column: the queue itself
             is the status, and it holds POSTED records only.

RIGHT 400px  ONE PO's Receiving Session. Receiving Mode takes the stage rather than
             opening an overlay — five lines with three numbers each do not fit in 400px.
             On `Goods Received` the pane is the read-only record (`?receipt=`, its
             own key — a PO and a Session are two documents).
```

**Controls** `receiving-rail` · `receiving-listing` · `receiving-workspace-toggle`/`-pane`/
`-page` · `receiving-clear-filters` · `receiving-queue-to-receive`/`-received` ·
`receiving-rail-state-{state}`/`-supplier-{id}`/`-bucket-{key}`/`-rec-supplier-{name}`/
`-source-{key}` · `receiving-arrival-{poId}` (the arrival cell, carrying `data-tone`
`promised` · `estimate` · `plain`)

### API + DATA
`POST /operation/pos/:id/office-receive` (→ `office_receive_post`, 0315) ·
`GET /operation/warehouse-receipts` · `POST /:id/check-in` · `POST /:id/send-back`
Tables: `warehouse_receipts` **3** · `receiving_events` **3**

### THE INFORMATION MODEL — frozen

**ONE physical delivery (one truck) = ONE Receiving Session.**

- A missed line on the same truck is an **Amend** on the same Session — never a second one.
- A genuinely second truck is a NEW Session (a normal partial delivery).
- A wrong record (wrong qty / PO / DO) is a **Void** plus a correct new Session.
  **History is never overwritten and never edited in place.**
- **Duplicate guard: same Supplier + same PO + same DO number cannot create a second live
  Session.** One DO number MAY span several POs — one van, two POs is legal, and each PO gets
  its own Session.
- **A field's owner is the module that CREATES it.** Foreign fields display read-only with a
  jump to their owner. The Session owns: session id · PO ref · **the warehouse SNAPSHOT**
  (never re-derived after a PO relocation) · supplier DO number · lines (received-this-time as
  a DELTA · damaged · wrong · photos) · the internal note, **which is never mixed with
  supplier-facing text.**

**THREE TIMES, never one `created_at`:**

| Time | Set by | Editable | Means |
|---|---|---|---|
| **Goods Received At** | human | ✅ default today; never future; never before the PO date | when the goods PHYSICALLY arrived |
| **Submitted At** | system | ❌ | when it entered the system |
| **Posted At** | system | ❌ | when it hit the books |

**Friday's truck keyed in on Monday reads: Received Friday · Submitted Monday.** Reports use
the business date, audit keeps the system dates, **and both are true.**

**THE EVENT LEDGER IS THE ONE HISTORY.** `receiving_events` is append-only; the Activity
timeline reads it **and nothing else.** A single status column loses *"was once returned"* the
moment it resubmits, and a second return overwrites the first reason.

**Event names are business facts and the list is CLOSED:**
`submitted · returned · resubmitted · posted · voided · amended`
(**`resubmitted` is a first-class event — never `submitted` with a flag.**)

**The payload dictionary is closed too, and a new key enters the table before it enters any
payload:** `do_number` · `goods_received_at` · `units_counted` · `entry_source`
(`office | warehouse`) · `reason` · `claims_linked` · `changes`.
**Both doors write the same five keys on `posted`**, so a report over the ledger reads the same
regardless of which desk keyed the count — which is why the Office's single act **widened the
payload rather than manufacturing a `submitted` event nobody performed.**

### FROZEN RULES
- **The Supplier DO number is THEIRS.** No default, no suggestion — a number we invent is a
  reference the supplier never issued, and it defeats the duplicate guard that reads it.
- **`Received` is PRINTED, never left as `5 − 3`.** An operator should never subtract to learn
  what is still owed.
- **The Save button NAMES the gap** (`Save — add a DO number`). A grey button that will not say
  why is a puzzle.
- **No `GRN` tab, ever.** GRN is a document OF Receiving, not a module.
- **A LATE TRUCK MUST LOOK LATE — and §4's colour law is the SAME law here** (T5, approved by
  Loo 2026-08-06). `Goods Arrival` had exactly two states, the date or a grey dash, so on the
  one page whose whole job is goods physically turning up a truck three days late was
  pixel-identical to one arriving on time; the only red on the row was `Current Action`.
  **Red is reserved for a date the FACTORY GAVE. Our own arithmetic warns AMBER and never
  accuses a supplier of breaking a promise nobody made** — the two need opposite next moves.
  **Provenance is the promise ledger, `poDateHistoryOf(...).currentDate`, never a null test on
  `eta_date`** (which has held our own estimate since 2026-08-03). **`late` is the engine's own
  open calls** — the identical expression `Current Action` and Purchase Orders' `Expected
  Arrival` already read, so one date cannot turn late on two tabs on two different days. **A
  second clock or a second provenance test on this page is a defect, not a refinement.**
- **The receiving ladder is FOUR rungs and the ORDER is the rule:** `fully_received` →
  `receiving_issue` → `partially_received` → `in_transit`. **Live consequence today: PO-2054 is
  3 received of 3 with 1 damaged, so it reads `Fully received` and the damaged unit is
  invisible on the rail.** That is the published precedence working as ruled.

### ✅ RECEIVING HAS ONE DOOR — the third one is deleted (D2, 2026-08-06)

The Orders drawer used to call `useReceiveLine` → `POST /operation/orders/:id/receive-line`,
rendered on its Items tab as **`Goods arrived at the warehouse (GRN)`**. It booked units into
the stock register and stamped `ops_order_control.line_received` **without opening a Receiving
Session**: no `warehouse_receipts` row, no `receiving_events` entry, and it never moved
`purchase_order_lines.received_qty`. **Two surfaces recorded one physical act two different
ways, and no surface could reconcile them.**

**Measured on production before removal: it had been used ZERO times** — `line_received` empty
on all 65 control rows and 0 units reserved to an SO — while this module's Receiving Workspace
had posted **3** sessions through `office_receive_post`. That measurement is what made the
removal an engineering decision rather than a business question.

**The route is DELETED, not left unrendered**, on this module's own C1 ruling: *a live route
with no caller is a bypass one curl away.* An old tab now meets a loud 404 instead of quietly
writing an untraceable receive, and a guard asserts exactly that.

**The Orders drawer still SHOWS the received count and hands over through the PO row's
`Check in` link.** Orders may show cross-module work; it may not write it.

### THINGS A CHAT GETS WRONG HERE
- **The rail is a PROGRESS rail, not an action queue.** There is no `Check in` queue tile.
- **`Current Action` is NOT limited to `Check in`** — `callsById` is still computed and can
  render either supplier call. Today's data reaches only `Check in`; that is a DATA fact.
- **`OperationReceiving.tsx` says `claim` exactly ONCE in 1036 lines** (re-counted 2026-08-06,
  after T5). Receiving is blind to what it produces.

### APPROVED EVOLUTION
- **The rail becomes a QUEUE model** (`To Receive` / `Received`), ruled by Jess 2026-08-03.
- **Receiving sees its own Claims** — `Claims · n open · n closed` without switching tabs.
- **⚠️ Both are the RECEIVING workstream's**, on its own worktree. Jess, 2026-08-03: *"Do not
  modify the Receiving module in this Purchase Orders workstream."*
  **UNRESOLVED:** Q14, a Purchase Orders card, edited this file on 2026-08-05. Either her
  ruling is narrower than it reads (the RAIL only), or Q14 crossed it. **Somebody must say
  which, or the next card guesses.** *(T5 is not that guess: Loo lifted the boundary for it
  EXPLICITLY on 2026-08-06, and T5 is a Receiving-owned card on its own worktree touching
  `OperationReceiving.tsx` and its tests and nothing else. The open question is still about
  PURCHASE ORDERS cards reaching in.)*

---

# §6 · Supplier Claim

### MISSION
Resolve the exception a receiving produced — and Claims owns the defective item's whole life.

### WORKFLOW
A claim is BORN from a PO line (0288's trigger). **There is no create button and there never
will be** — this is SAP QM's Quality Notification, not a Zendesk ticket, and the reference
object (`PO · SKU · Supplier · DO`) is carried forever.

```
we ask the supplier  →  the supplier answers  →  Carres decides  →  Carres executes
```

A recorded side becomes READ-ONLY prose: the ask FREEZES the moment an answer lands, which is
what makes *"what we wanted vs what we got"* worth reading later. Close is refused, in the UI
and server-side, unless both sides are on file.

### WHAT IS ON SCREEN TODAY
`OperationSupplierClaims.tsx` 854 lines + `SupplierClaimPanel.tsx` 712 lines ·
route `/operation?tab=claims` · ***measured 2026-08-06, after layer ③ shipped: both files read
END TO END, and the four columns and one row were counted in production with SQL.***

```
LEFT 200px   QUEUES    Confirm what happens next        ← the only queue tile
             SUPPLIER · PROBLEM
CENTRE       kit DataTable, eight measured widths 150 · 111 · 181 · 154 · 147 · 194 · 368 · 134
             status picker Open / Closed / All — a STAGE, one is always on
             ⚠ NO column was added for the resolution — the grid already totals 1481 in a
               1022 container, and layer ③ is a decision you make in the panel, not a fact you
               scan the list for
RIGHT        NOTHING. There is no right panel on this tab.
```

**The expanded row** — a 2-column grid, and the whole 712-line panel lives inside the kit
table's `expansion`:

```
LEFT                                       RIGHT
  Evidence             photos, or            What we asked    ask buttons → [ Send to {supplier} ]
                       "No photo — a late                       or [ Save what we asked ] · [ Copy ]
                        delivery has nothing                     once recorded → read-only prose
                        to photograph."
  Customer Resolution  "What are we doing    What {supplier} answered
   ← LAYER ③, LIVE       for the customer?"    ○ Replacement · Deliver remaining · Repair ·
     2026-08-06        ○ Replace                 Return & replace · Reject · Other agreement
                       ○ Repair               note REQUIRED for reject / other agreement
                       ○ Accept As-Is         [ Save {supplier}'s answer ]
                       ○ No Replacement Required
                       one DEFINITION line under the pick
                       note (optional) · [ Save what we are doing ] · Recorded {date}
                       closed claim → read-only, or
                       "Nothing recorded — this claim closed without one."
  Item Outcome         "{n} unit on hold"    Settle it        note (optional) · [ Close claim ]
   ← renamed from       "What happened to                      STILL gated on both sides and
     `The goods`         this item?"                           NOTHING ELSE — layer ③ does not
     2026-08-06        ○ Put back in stock                     gate the close
                       ○ Returned to supplier
                       ○ Write off
                       note REQUIRED for write off
                       [ Save what happened ]
  Closed               date + close note
```

**Each decision's buttons sit in a `role="group"` carrying its section's name.** The panel now
holds two buttons reading `Replace` and two reading `Repair` — the supplier saying it and
Carres deciding it are different facts about different parties — so the heading disambiguates
them for a reader and the group's accessible name does the same for a screen reader.

> **THE FACT MOST CHATS GET WRONG.** The item-outcome picker **already exists and Claims is its
> only home**: `STOCK_HOLD_OUTCOMES` (`packages/shared/src/stock-hold.ts`) is imported by
> **exactly one file in the repository** — `SupplierClaimPanel.tsx` — and its endpoint lives
> under Claims. **Removing it leaves quarantined goods with no way out of quarantine.**
> Shipped by migration **0299**, 2026-07-27.

### API + DATA
`GET /operation/supplier-claims` · `GET /:id/photos` · `POST /:id/request` · `/:id/response` ·
`/:id/hold-resolve` · `/:id/close` · **`/:id/customer-resolution`** (0324)
`supplier_claims` — **32 columns, not one is money**; **1 live row**. Migration **0324** added
the four: `customer_resolution` · `_note` · `_at` · `_by`, all NULLable with no backfill.

**`SC-1014`**, a full end-to-end test on 2026-08-05: `PO-2054 · JAGER-SS · damaged · qty 1 ·
DO-P5-0001 · 1 photo`, reported → requested `replace` → responded `replacement` → closed, **all
four timestamps present** — real data for a timeline to render against. **It is CLOSED, so it
carries no resolution and never can**, and its panel prints
`Nothing recorded — this claim closed without one.` rather than a blank. Re-measured after
0324: still 1 row, still all four timestamps, `customer_resolution` NULL.

### FROZEN RULES — the claim model, ruled by Loo 2026-08-05

**The four layers, and they may never be collapsed:**

```
Customer Problem → Supplier Response → Carres Resolution → Carres Execution
                                                     → Stock · Finance · Demand
```

**The test that keeps them apart:** *can both be true at the same time?* **If yes, they are two
fields, not one list.**

**TWO decisions, because they answer two different questions. BOTH ARE ON SCREEN (2026-08-06):**

| | Asks | Options | Stored |
|---|---|---|---|
| **Customer Resolution** | what are we doing for the CUSTOMER? | `Replace` · `Repair` · `Accept As-Is` · `No Replacement Required` | `supplier_claims.customer_resolution` (0324) |
| **Item Outcome** | what happened to THIS item? | `Put Back in Stock` · `Return to Supplier` · `Write Off` | `ops_stock_items.status` via `ops_stock_resolve_hold` (0299) |

**`Repair` is on BOTH the supplier's answer list and the resolution list, and that is not a
collision.** The supplier saying *"we will repair it"* is their answer; Carres deciding the
customer gets a repair is our decision. Different columns, allowed to disagree — preserving the
disagreement is why the layers are kept apart at all.

**The worked case, and it is why the split exists.** The customer cancelled AND the mattress is
destroyed. Under one list the operator must choose which truth to record — **must lie**. Under
two, both are recorded.

**Removed from the resolution list, and do not put them back:**

| Removed | Reason |
|---|---|
| `Return to Supplier` | **it loops back** — "send it back and wait for their next word" resolves nothing. It is an EXECUTION move |
| `Write Off` | answers what happened to the ITEM. It lives in Item Outcome, where it already is |
| `Cancel Outstanding` | replaced by `No Replacement Required`. **`SC-1014` is 3 ordered / 3 received, so outstanding = 0 and `Cancel Outstanding` could not be pressed at all** — the rename changed what the option DOES |
| `Reject` · `Deliver Remaining` · `Replacement` · `Return and Replace` | all SUPPLIER answers, not Carres decisions. `Return and Replace` is two concepts in one option |

**`Refund` is NOT built and NOT deleted.** Supplier credit note? cash? offset against future
purchases? **The business meaning is not frozen and nobody may guess it.**

**Carres Execution — frozen, NOT built:** `Return to Supplier · Collect Defective Item ·
Replace First · Collect First · Exchange on Collection`. No option here may be folded into a
resolution list.

**Five business laws:**

1. **`Replace` = a NEW item.** How the defective item is collected is an EXECUTION decision.
2. **`Repair` = the SAME item**, returning to the SAME customer — unless Carres decides the
   customer cannot wait, in which case the customer gets a replacement first and the repaired
   item goes to warehouse stock. **Carres' decision, not the supplier's.**
3. **Default policy — recover the defective item whenever practical.** Repair for resale,
   reduce losses, preserve asset value. **Not because the supplier asks; because the item is
   still worth money to Carres.** Replacement-first is the exception.
4. **When the supplier refuses, the screen states the fact and stops.**
   `Supplier Response: Rejected` → a waiting state → `Next Action: Select Resolution`.
   **Stock, Finance and Demand are NOT derived until a resolution is chosen** — nothing is yet
   known about any of them, and a screen may only show what is true right now.
5. **Consequences are `f(Resolution, Execution)`, never `f(Resolution)`.** Law 2 is the proof.

**A claim's owner:** the PO-duty holder **of the month it was OPENED in, forever** — it never
changes when the month rolls over, because the person who spoke to the factory is the person
who knows the case. **DERIVED from `ops_po_duty`, never an `assigned_to` column.**

**Where a claim can be born:** ONE engine, and the long-term architecture is two entrances
(Receiving · Service Cases), which is how SAP, Oracle and Dynamics all do it. **TODAY only
Receiving exists**, and that is a ruling with a stated price: 0299's guard allows
`incoming → on_hold` and no other entry, so **a fault found a week after receiving has no
supplier-claim route at all** — it is a service case. **If that changes, the entry rule and the
refurbish door must be settled in the SAME change**, or the refurbish path hands a held unit
back to the pool with no claim ever answered.

### THE PANEL LOO FROZE, 2026-08-05 — three of six built, 2026-08-06

```
The Item              what this claim is about              NOT BUILT — it is the Workspace
                                                            layer's un-collapsible header
Customer Resolution   what are we doing for the customer?   ✅ LIVE 2026-08-06
Item Outcome          what happened to this item?           ✅ LIVE — renamed from `The goods`
Evidence              photos                                ✅ already there
Supplier Response     what did the supplier say?            the screen says `What {supplier}
                                                            answered` — see below
Decision Guide        live guidance under the selected      PART built: one DEFINITION line per
                      option                                option, and nothing more
```

**`Supplier Response` was NOT taken to screen, and that is a decision.** The live heading is
`What {supplier} answered`, which NAMES THE PARTY — the thing COPY-STANDARD asks for everywhere
else. Renaming it to the generic noun is a Workspace-layer call about section headings, not
part of recording a resolution, so it waits for that card rather than being taken in passing.

**`Decision Guide` stops at a DEFINITION and may not grow into a consequence here.** Each
option carries one line saying what it means for the customer (`The customer gets a NEW item.`
— Loo's law 1, verbatim). **`What happens next` and `Typical examples` are NOT built**, because
both would state a consequence, and consequences are `f(Resolution, Execution)` with Execution
unbuilt. A guide that named stock, money or the outstanding quantity would be a guess wearing a
screen's authority — law 5, applied.

**The words are now IN `COPY-STANDARD.md`** (§ *The Claims decision words*, written 2026-08-06,
attributed to Loo's ruling of 2026-08-05): `Customer Resolution` · `Item Outcome` · `The Item` ·
`Accept As-Is` · `No Replacement Required` · `Supplier Response` · `Next Action`, the four
definition lines, the two questions, the button and the closed-claim line. **`Refund` has a row
that records it as NOT ruled**, so its absence cannot be read as an oversight.

**Both collisions are settled, by law already in the dictionary — apply them, do not re-open:**

1. Loo's `Waiting Internal Resolution` **loses** to the already-locked
   `Case owner decision required` (2026-07-27). One meaning, one word, and the older lock is
   what the rest of the portal's exception vocabulary is built around.
2. **`Return` (the verb — a record goes back to whoever produced it) and `Return to Supplier`
   (an Item Outcome about GOODS) BOTH STAND.** Two senses of one spelling, exactly as `Recovery`
   is; neither is renamed to avoid the other. Recorded in COPY-STANDARD.

### APPROVED EVOLUTION
- **NOTHING TELLS ANYONE TO PICK A RESOLUTION.** Layer ③ ships the decision and no prompt for
  it: `claimNextMove` is untouched, so the queue tile, the `Next move` column and the row line
  say exactly what they said before. **That is deliberate** — Loo's law 4 names the state
  (`Supplier Response: Rejected` → a waiting state → `Next Action: Select Resolution`), and
  `Next Action` is a REGION of the unbuilt Workspace layer; wiring it would silently re-word a
  dictionary-locked queue from inside a panel card. **The next card on this tab should be that
  wiring, and until it lands a resolution is found only by opening the row.** Reported, not
  softened.
- **The Workspace layer.** §12.7.5's two-tier split, the un-collapsible `PO · SKU · Supplier ·
  DO` header (= `The Item`), a Timeline off the four existing timestamps (**no migration** —
  and 0324 adds a fifth, `customer_resolution_at`), the Consequences region with its mapping,
  the `Supplier Response` heading rename, and the Owner. **⚠️ There is no right panel today** —
  `w-[400px]` greps 0 in that page — so this CREATES the second tier rather than moving things
  between two.
- **One claim, ONE outcome, and a button that splits it.** Loo ruled option A on AutoCount's own
  evidence (`Cancel Purchase Order` / `Goods Return` / `Purchase Return` are three documents and
  none holds two outcomes). Three binding conditions: **R5 counts problem PO LINES, never claim
  documents** (`ScorecardClaim` carries `po_id` and not `po_line_id`, and `claimRate` keys on a
  Set of distinct POs — the claim STATS move with it or the fix is half done) · **the split is a
  BUTTON**, never *"go and open a second claim"* · **the A→B upgrade path is written down while
  it is free** (every claim becomes one child row: outcome copied, quantity equal to the whole).
  A claim with a NULL `po_line_id` is counted BY NAME, never dropped.
- **The close does not ask for a resolution, and a claim can still close without one.** 0291's
  gate is "both sides on file" and 0324 left it exactly there — a third condition is a NEW
  business rule and layer ③ was not ruled to make one. If Loo wants a claim to be unclosable
  until the customer's side is decided, that is one constraint and one sentence, and it is his
  call, not engineering's.
- **Item Outcome wired to the resolution** — pure WIRING: 0299 already ships
  `returned_to_supplier` · `written_off` · `back_to_stock`, and `Replace` is the receive engine.
  `Repaired` and `Disposed` are NOT built: 0299's guard admits exactly three destinations, so
  adding them is a migration.
- **The money, and a Finance queue.** `supplier_claims` has 28 columns and not one is money; the
  cost sits in `purchase_order_lines.cost`. **A Finance Action completes on an EXTERNAL EVIDENCE
  reference** — the supplier's credit-note or debit-note number — never a tick-box, which is why
  §8's ban on self-declaration does not kill the queue. *2990s is the worked example of getting
  it wrong: its `purchase_returns.credit_note_ref` has exactly two readers in that whole
  repository, a PDF and a detail page.* **Operations never sees AP; Finance never sees photos.**
  Jess's locked rule stands and does not block this: hers is the credit note **Carres issues to
  a customer**; this queue records the one **a supplier issues to Carres**.
- **The facet rail filters a table holding 0–5 rows** for the foreseeable future. Law vs
  reality; reported, not changed.

---

# §7 · Report

> **This page belongs to the PORTAL layer, not to Purchasing**
> (`../ERP-ARCHITECTURE.md` §2.1). It lives here until it moves.

### MISSION
How many did we buy this month — and every number is a door.

### WHAT IS ON SCREEN TODAY
`OperationPurchasingReport.tsx`, 327 lines · *measured 2026-08-05 from its docblock.*
200px rail (`Month` · `Supplier` · `Category`, all three toggle) → grouped table → `Total`.
No Refresh button — a report recomputes itself and states when it did.

### API + DATA
`GET /operation/pos/report`. **Stores nothing** — no table, no RPC, no cached figure.

### FROZEN RULES
- **It stores nothing**, and `buildPoReport` computes at read time from the same
  `purchase_order_lines` the register reads.
- **Every number is a DOOR** — a row unfolds into exactly the purchase orders its count was made
  of, and each is a link into the register at that document. *This is what AutoCount cannot do:
  its answer to every analysis is export to Excel, and a number in Excel has left the system.*
- **Cancelled purchase orders are excluded, and the exclusion is stated on screen.** A silent
  filter is how two people get two answers from one report.
- **NO MONEY**, structurally: the wire has no cost field, so the page could not print one.
- **An `All` row prints the number its OWN click produces**, never the filtered total.
- **Six words and no seventh:** `Report` (singular — Loo's spelling and AutoCount's own menu
  word; `Reports` and `Reporting` are both wrong) · `POs` · `Ordered` · `Received` ·
  `Outstanding` · `Total`.

---

# §8 · Settings

### MISSION
Every number the ordering engine reads, on one manager-only screen.

### WHAT IS ON SCREEN TODAY
`OperationPurchasingSettings.tsx`, 561 lines · *measured 2026-08-05 from its docblock.*
The seven numbers, server-gated to a manager. The supplier × category matrix is derived from
the catalog, so only factories that actually own a SKU appear — nobody reads a 10 × 3 grid of
blanks. Every row carries **who changed it, when, and what it was before**.

### API + DATA
`GET /operation/purchasing/settings` · `PUT /number` · `/po-days` · `/production-days` ·
`/work-week` · table `purchasing_settings` (**1 row**) · migration 0303.

### FROZEN RULES
- **A supplier × category with no number says `Set a number`** and gets no order-by date at all.
  It is never quietly planned on a 7 — a quiet screen must mean *watched and fine*, never
  *nobody looked*.
- **Nothing here has a default parameter.** A fallback is how one file's constant read
  `Mon + Thu` for months after the engine had moved to `Mon/Wed/Fri`.

---

# §9 · Architecture decisions that cross tabs

| Decision | Ruling |
|---|---|
| **Navigation never defines ownership** | Architecture decisions are justified by business ownership. Navigation may support those decisions, but navigation never defines ownership. |
| **Where an action lives** | The tab that owns the WORK owns the door AND its queue. **CLOSED by T2 (2026-08-06): the CALLS calendar on Purchase Orders is the queue for all three supplier calls** — each call's due files under its day, `Overdue` holds the late ones, and the door (the expand) sits on the same tab. |
| **Two status axes, never merged** | `purchase_orders.status` is a 3-value stored enum. The 5-word Operation Status is derived and never stored. A reader who confuses them will "fix" one to match the other. |
| **A quantity means exactly one thing** | No column is ever reused for a second meaning — that is how `ops_order_control.balance` became a lock reading a column nobody wrote. |
| **Deliberately not stored** | `in_transit_qty` · `ready_for_collection_qty` · `supplier_confirmed_qty`. **A column nobody writes is worse than a missing one.** |
| **No cancelled quantity anywhere** | Stopping is the whole PO. A per-line cancelled quantity would put a policy decision into an arithmetic column. |
| **A held unit is not "on the way"** | `on_hold` stops counting as future supply (0299), or the planner keeps believing goods are coming that never will. |
| **Widths are MEASURED in a real browser** | jsdom has no widths, so a page test structurally cannot catch a truncated cell. **A guessed number may never be written down.** |
| **The map must not go stale** | A guard that FAILS when a PR changes a Purchasing page file and does not change this document's `WHAT IS ON SCREEN TODAY`. **A rule in a document gets skipped; a failing test does not.** Not built. |

---

# ▶︎ P20 · APPROVED TO BUILD 2026-08-08 — ONE width mechanism across the five tabs

> **Runs in PARALLEL with Orders S2 and may not collide with it.** Different module, different
> files. **PAGE-SIDE ONLY — `kit/DataTable.tsx` may NOT be touched by this card**, because S2's
> chat is the one that owns the kit this week. A change that needs the kit STOPS and waits.

**MEASURED, and the evidence is already committed** — `../research/grid-findings.md` §4.8
(F71 · F72 · F73) plus six production screenshots Loo supplied 2026-08-07.

```
THE DEFECT, in one line: three width mechanisms and TWO different scrollbars
in one module, so a gesture learned on one tab does not work on the next.

tab               sizing      declares   renders   honoured   who scrolls @900px
To Order          "content"    1,252px   1,252px   YES        the KIT's box
Supplier Claims   "content"    1,439px   1,439px   YES        the KIT's box (583px hidden)
Purchase Orders   ABSENT       1,171px   1,201px   NO         the PAGE pane — header scrolls away
Receiving         ABSENT       1,078px   1,238px   NO         the KIT's box
Report            ABSENT       37/15/15/15/15 %    —          percentages
```
`sizing` absent means `"fill"`, and `"fill"` treats a declared px as a SHARE — so **widths an
earlier card measured in a browser are silently redistributed.**

```text
BUILD CARD · P20.   git pull first.   ONE commit per item, never one PR.

P20.1  Purchase Orders + Receiving pass sizing="content".
       Their px widths were browser-measured; stop redistributing them.
P20.2  ONE scrollbar. Purchase Orders scrolls the PAGE pane because of a
       hand-written min-w-[1208px] wrapper (:1548); Receiving's min-w-[880px]
       is CONDITIONAL on the workspace being closed (:937). Both go — the
       kit's own box is the scroller on the other three.
P20.3  Report leaves percentages. `DataTable`'s own doc warns by name:
       "percentage columns inflate on wide monitors and open holes between
       neighbours" (Jess 2026-08-01). Widths must be measured, not guessed.
P20.4  🔴 Settings prints the literal `was {0}` on screen —
       OperationPurchasingSettings.tsx:79 renders `change.oldValue` raw and
       the stored value is a Postgres array. A work week must read as days.
P20.5  Receiving's `Current Action` reads "Check in" on all 24 rows.
       A column identical on every row carries no information.
P20.6  Claims lands on `Open 0` while `All` holds 1, and its empty-state
       sentence centres on the 1,439px table instead of the visible width.

OUT OF SCOPE, NAMED   sticky columns (NO engine has them — F72; it is the
                      obvious fix and it needs the kit, so it is NOT this card)
                      · queues · business rules · api · any column deleted to
                      avoid a scrollbar, which §3 already forbids.

STOP AND REPORT if any item needs kit/DataTable.tsx.
```

**WHY THE LAST COLUMN MATTERS AND THIS IS NOT COSMETIC.** On four of the six screenshots the
column that falls off the right edge is the one answering the tab's own question — `On PO` /
`PO No.` (*did I buy it*), `Customer Delivery` (*when do they want it*), `Next move` (*what do
I do*). **The operator's answer is the thing that goes missing.**

---

# §10 · Approved Evolution — decided, deliberately not implemented

> **This is architecture, not a to-do list.** Everything here has been ruled; none of it is
> waiting for a decision. **Who builds it and when belongs to GitHub Issues, not to this file.**

| What | Status |
|---|---|
| **`Refund` as a claim resolution** | **Approved as a concept, blocked on business meaning** — supplier credit note? cash? AP offset? Hidden until Loo rules it. **Do not guess and do not delete it.** |
| **`Repaired` · `Disposed` as item outcomes** | Approved. Needs a migration: 0299's transition guard admits exactly three destinations. |
| **Carres Execution as a real field** | Frozen (five options, §6). Not built. |
| **A second claim entrance from Service Cases** | Approved as the long-term architecture. **The entry rule and the refurbish door must be settled in the SAME change.** |
| **`DecisionGuideCard`** | Approved as a **portal-wide kit component**, not a Claims feature. One card under the selector, updating live: title → 1–2 sentences → max 3 `Typical examples` → max 3 `What happens next`. **Never a hover tooltip for business guidance** (users do not discover them; mobile cannot hover; staff stop reading after the first week). **Content from a configuration object, never hard-coded in the component.** Next homes: `Deliver To` · `Receiving Method` · `Purpose` · `Delivery Status` · `Payment Result`. |
| **The September supplier switch** | Approved. Nice Future stops; a subscription-model mattress supplier takes over. |
| **PO revisions** | **RULED OUT, not deferred.** A sent PO is never edited. |
| **The Working Calendar** | Approved 2026-08-06. Public holidays live in code (`packages/shared/src/my-holidays.ts`) and a manager cannot edit them — but the real fact is *"is Carres working that day?"*, which only the office can answer (a gazetted holiday can be a working day, and the company can close on an ordinary one). Settings gains ONE company calendar: the official list auto-loads each year, a manager marks a day working / adds a closure, audited like every Settings number. **Every engine — order-by, the CALLS calendar, delivery arithmetic — reads this ONE calendar.** Until built, `myHolidaySet()` stands. |
| **`View Flow`** | Approved 2026-08-06 — **the ONE function worth porting from AutoCount's PO-register menu** (2990s' `RelationshipMap` is the worked example): one click shows the whole chain SO → PO → Receiving → Claim for a document. Everything else on that menu was reviewed with Loo the same day and is either already here or REJECTED: blank `New` (bypasses PURCHASING DEMAND, the single entry) · `Edit` (a sent PO is never edited) · `Delete` (red line — `Cancel` keeps the record) · AP/invoice transfers (Purchasing never touches money). |
| **Team panel `GRN DUTY` row** | Approved 2026-08-06 — the panel states PO duty and must state GRN duty too (§2.2). One home for identity; no page repeats it. |
