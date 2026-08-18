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

**TWO WAYS A PO IS BORN, ONE WAY IT LIVES** (Loo, 2026-08-06; the page list rewritten
by Jess 2026-08-18 — **APPROVED, NOT YET BUILT**; today's screens are §3–§8's measured
blocks):

```
SALES                       PURCHASING
Sales Order  ····read···▶ SO Batch Purchase ─┐
                                             ├─▶ Purchase Order ─▶ Receiving ─▶ Supplier Claim
                          Manual Purchase   ─┘
```

```
Sales        Sales Order         every customer order. SALES owns it.

Purchasing   SO Batch Purchase       customer orders PURCHASING still has to act on
             Manual Purchase         purchases nobody's customer asked for:
                                     Ready Stock · Display · Office · Spare Parts
             Purchase Orders         every issued PO, whichever lane bore it
             Goods Receipts          what physically arrived, one door
             Supplier Claims         the exception a receiving produced
             Purchase Returns        goods formally going back to the supplier
             Repair Orders           a Carres unit out for repair, the SAME unit back
             Display Requests        what a showroom needs, raised by Sales
             Consignment Orders      supplier-owned goods placed with Carres
             Consignment Receipts    a filtered view of Goods Receipts, not a second engine
             Consignment Returns     the supplier collecting its own goods back

Reports and Settings are PORTAL pages, not Purchasing pages
(`../ERP-ARCHITECTURE.md` §2.1).
```

**ELEVEN PAGES, AND WHY IT IS NOT FIVE** (Jess, 2026-08-18). The five-page tree was argued
from information architecture: expose modules, then reveal documents inside them. Jess
overturned it from the operator's side — **three staff who each do every job cannot be asked
to remember which workspace hides which document.** A document a human must find again BY NAME
gets a permanent door. The IA argument survives everywhere else: nothing gets a page because
it exists, only because somebody looks for it twice.

**TWO PROPOSED PAGES WERE REFUSED, and each refusal is the rule.**
`My Purchasing Work` — Work is ONE cross-module surface (`../workspace/MASTER.md`); the same
person receives in September and buys in August, and three module Work pages make them rank
their own day. `Purchase Demands` — demand already has exactly TWO lanes, and a third surface
over the same rows becomes a third place to press Issue. It is a Portal report,
`Outstanding to Buy`, read-only.

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
> never the 600px dialog. **Both lanes issue their own POs** (§1). `+ Create Purchase`
> leaves this rail with them. Everything below describes the single `To Order` tab as it
> stands today.

> ### ⭐ THE GRID BECOMES A HIERARCHY, AND SOFA GROUPS DIFFERENTLY (Jess, 2026-08-18)
> **APPROVED, NOT YET BUILT.** Today's grid is FLAT — one row per SO line. Four customers
> wanting the same beige three-seater are four rows scattered down the list, and the buyer
> adds them up in their head. **But Carres buys from a FACTORY, not from a sales order**, and
> every quantity that matters commercially — MOQ, pack, what fills a lorry — is per item.
> Every mature planning screen groups by item for exactly this reason: SAP's MD04 is per
> material, Odoo's replenishment is per product, Dynamics' requisition worksheet is per item.
>
> **So the grid becomes three levels:**
> ```
> Item · Description        Qty Needed · Stock · On PO · To Buy
>   └─ variant (fabric / colour)
>        └─ SO No · Customer · Customer Delivery · Qty · Coverage · Supplier
> ```
> **`To Buy` is PRINTED, never left as `11 − 3 − 2`** — the same law Receiving already carries
> for `Outstanding`. **Rows with nothing to buy sink; shortages float to the top, and only a
> shortage line is selectable.** Every SO line carries a `Coverage` tag saying what holds it
> up — `stock` · `PO-2041 · 22 Aug` · `SHORT` — so the buyer sees at a glance which promises
> have nothing behind them.
>
> **SOFA IS THE EXCEPTION AND IT GROUPS BY SALES ORDER.** A sofa is sold as a colour-matched
> SET; two customers' sofas may not be merged onto one PO line because the fabric batch must
> match within the set. **Selecting any piece selects the whole same-SO set.** 2990s runs
> exactly this split in production and states the reason in its own header —
> `apps/backend/src/pages/Mrp.tsx:15-17`: *"A sofa is one PO per SO, so selecting any sofa
> variant selects the whole same-SO set together."* Mattress, bedframe, pillow and protector
> group by item; sofa groups by SO. **One page, two groupings, chosen by category.**
>
> **The trade-off, stated:** two grouping paths cost more to build than one flat list. The
> complexity is already in the business — refusing it does not remove it, it moves it into a
> buyer's head every morning.

> ### ⭐ DERIVE THE DESTINATION AND THE DATE — NEVER ASK THE BUYER (Jess, 2026-08-18)
> **APPROVED, NOT YET BUILT.** 2990s shipped a "PO Defaults" card asking Expected Delivery and
> Purchase Location on the batch screen, then DELETED it —
> `apps/backend/src/pages/PurchaseOrderFromSo.tsx:6-9`: *"REMOVED the 'PO Defaults' card …
> Those are NOT asked anymore — the server derives each PO line's warehouse from the source
> SO's Sales Location, and each line's delivery date from the SO line's own delivery date …
> header expected_at / purchase location are rolled up from the lines server-side."*
>
> **The customer's order already says where the goods go and when they are wanted.** Asking a
> buyer to retype it invites a mismatch between the SO and the PO that nobody can reconcile,
> and it is work for an answer the system already holds. **The line derives; the header rolls
> UP from the lines.** A buyer may still change a line, and the change is an exception with a
> reason — never the default keystroke. **It is an INLINE CELL, never a queue action:** every
> line always carries a destination, so an action would fire on every PO and be ignored on all
> but one, and a prompt everybody dismisses daily is a prompt nobody reads on the day it
> matters. **A change has a consequence the screen must state** — goods landing at `AL` for an
> order shipping from `Carres` need a stock transfer before the delivery date, and the system
> says so at the moment of the change rather than letting the warehouse find out on the morning
> of the run. *(This retires the proposed action `Assign where the goods go` entirely: on the
> customer lane it is derived, and on Manual Purchase the requester picks it in the form.)*
>
> **Grouping is the SERVER's, not the buyer's** — `PurchaseOrderFromSo.tsx:17`: *"Server groups
> by main supplier and emits one PO per supplier."* Same rule Dynamics states for requisition
> consolidation: differ on legal entity, vendor or currency and a separate order is created.
> **The buyer picks WHAT to buy; the system decides how it splits.**

> ### ⭐ MANUAL PURCHASE — THE REQUEST, THE APPROVAL, THE ORDER (Jess, 2026-08-18)
> **APPROVED, NOT YET BUILT.** 2990s has nothing to copy here: its manual entrance is a BLANK
> New PO (`PurchaseOrderNew.tsx`), which this module already rejects — a PO with no demand
> behind it has no reason on the record. The pattern is the Purchase Requisition every mature
> ERP carries (SAP `ME57` / `ME59N`, Dynamics' purchase requisitions, Oracle's AutoCreate).
>
> **Anyone raises it, in six fields:** `Need for` (Ready Stock · Display · Office · Spare Parts)
> · what · how many · where to · needed by · **why**. `why` may not be blank — it is the
> sentence the approver reads, and *"restock"* answers nothing.
>
> **Before it is submitted the system answers the question first:** free stock, quantity already
> on an open PO, and what is therefore still needed. Half of these requests are for goods Carres
> already has or already bought.
>
> **Every purpose requires approval** (Settings, §8) and **a customer order requires none — the
> order IS the authority.** The approver sees the money; the three operators never do.
>
> **APPROVED REQUESTS DO NOT WAIT FOR A PO DAY** (Jess, 2026-08-18). Consolidation windows exist
> to win price and freight from large vendors; a furniture factory charges the same for one
> order or three, so making a request wait buys nothing and costs days. **PO days stay on the
> customer lane only**, where they exist to let a factory plan production. Consolidation here is
> an OFFER, never a gate: several approved requests for one supplier surface together with
> `Issue as one PO?`, and issuing them separately is always available.
>
> ### ⭐ DISPLAY REQUESTS — Sales says what a floor needs; Purchasing decides how (Jess, 2026-08-18)
> **APPROVED, NOT YET BUILT, AND ENTIRELY NEW.** Measured: `showroom` and `display request` grep
> ZERO across `apps/web/src` and zero across all eight governing documents; 2990s has no request
> ahead of its consignment order either. **Nothing exists to copy and nothing exists to unpick.**
>
> Today a salesperson notices a tired floor model and WhatsApps somebody. Purchasing cannot see
> how many of those are open, how long they have waited, or which were quietly dropped.
>
> **Five fields, and one of them may be vague on purpose:** which showroom · add / change /
> remove · which unit now (scan the Unit ID; only for a change or a removal) · **what they want**
> · why · wanted by. **`what they want` accepts a description and a photo, not only a catalog
> SKU** — a salesperson says *"the Ohana beige, lower than the one we have"*, and a form that
> demands a published SKU is a form they abandon for WhatsApp. No SKU on file raises the
> New SKU work to the month's PO duty, and the request waits on it.
>
> **The states are facts a new hire can read, and `Waiting` always names what it waits ON**
> (`../COPY-STANDARD.md`): `Waiting for Purchasing` · `Waiting for the SKU` · `Ready to order` ·
> `Ordered` · `On display` · `Not going ahead`. *`Not looked at yet` was written and rejected —
> it reads as an accusation, and the useful half of it is WHO it waits on.*
>
> **`Not going ahead` is a required exit, and it carries a reason.** Purchasing may refuse — the
> model is discontinued, the price does not justify it, a unit already sitting in Klang can be
> moved instead. Without the exit, a refused request is simply never touched again, and three
> months later nobody can say why. **The refusal goes back by PHONE, recorded by Operations** —
> the portal never parks work with a salesperson and waits.
>
> **`On display` is not a tick.** It is three facts: the right Unit ID received, its place
> recorded, and the showroom's handover signed. A request that can be closed by pressing a button
> will be closed while the floor is still empty.
>
> ### ⭐ THE THREE CONSIGNMENT PAGES — one engine, one ownership fact (Jess, 2026-08-18)
> **APPROVED, NOT YET BUILT.** 2990s ships ELEVEN consignment pages, and its own header says how:
> `apps/backend/src/pages/PurchaseConsignmentOrders.tsx:9` is the Purchase Orders page COPIED and
> the queries re-pointed at `/purchase-consignment-orders`. Two codebases for one screen — a fix
> lands twice or it lands once and rots. **And measured: no consignment page carries an ownership
> flag on a line or a unit** (`grep -in "owner" *Consignment*.tsx` returns code comments only).
> 2990s cannot tell consigned goods from bought goods by looking at them; it tells them apart by
> which TABLE the paperwork sits in. **That is the failure Carres avoids by putting the fact on
> the UNIT** (`../stock/MASTER.md` — `ownership`, `carres` or `supplier`).
>
> **CONSIGNMENT ORDER = a purchase order plus two things.** Ownership is fixed to the supplier and
> may not be edited; and when a floor model is being swapped, **the unit coming IN and the unit
> going BACK ride the same document.** Two documents let the new sofa land while the old one
> stays, and the position holds two — or the old one leaves and the position stands empty.
> ```
> New unit          Ohana 3 Seater · Grey · 1
> Old unit back     CU-000128 · Beige · on display since 12 Feb 26 · 187 days
> ```
> **It creates no payable.** Goods arrive, stand at HOUZS, and Carres owes nothing until one
> sells — and what happens then is Finance's, not this module's.
> **No blank create, same as a PO:** the source is an approved Display Request or a claim ruling a
> swap. Consignment is where "where did this sofa come from" gets lost fastest, and a unit with no
> source is a unit nobody can pay for correctly.
>
> **CONSIGNMENT RECEIPT IS NOT A SECOND RECEIVING ENGINE.** The person at HOUZS counts, checks for
> damage, photographs and uploads the supplier DO — **identical work whether the sofa is bought or
> consigned**, and they should not have to know which. The difference is already carried on the
> unit. **One receipt document, ONE number series;** `Consignment Receipts` is a FILTERED VIEW of
> Goods Receipts. *(Refused: a `CGRN-` series. It makes staff remember which prefix to look under,
> and it breaks outright the day one van carries both.)*
>
> **CONSIGNMENT RETURN — the supplier takes its own goods back.** It is not a Purchase Return:
> nothing is owed back, no credit note is chased, because the goods were never Carres'. It carries
> the same physical law as every other handover — **issuing the document moves no stock; a signed
> collection note or a handover photo does.** On a swap the return is bound to the incoming
> Consignment Order so the floor position is never briefly empty or briefly double-booked.
> **Over-delivery reuses this same collection mechanism** rather than growing a fourth path.

> **A NEW SHOWROOM IS A SETTINGS ROW, MANAGER-GATED — never a field Sales can type into.** The
> name reaches a supplier's PO and a driver follows the address; it also needs a receiving
> contact and a ruling on whether goods may land there at all, and Sales owns none of those.
> Sales picks from the list; the list is maintained where the seven engine numbers are.

> **The order form is 2990s' full-page create form, unchanged** (`PurchaseOrderNew.tsx`:
> two-column header + inline line table, with the sofa variant block — fabric · gap · divan
> height · leg height · seat size). **Only the entrance differs:** 2990s starts blank, Carres
> starts pre-filled from the approved request. **A sofa PO without its fabric and configuration
> is a factory building the wrong sofa.**

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

CENTRE       TEN frozen columns, ONE fixed set (Jess, 2026-08-18 — `Receiving`
             added so a scan answers "how much landed" without opening a row;
             `SO No.` and `Customer Delivery` stay, they are HOW a row is ranked;
             a second date column was refused — see the arrival law below):
             PO Issued · Supplier · PO No. · SO No. · Items · Destination ·
             Customer Delivery · Expected Arrival · Receiving · Current Action
             widths 96 · 88 · 83 · 95 · 136 · 135 · 140 · 206 · 96 · 192,
             min-width 1304 (re-measure in a real browser before build)
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
- **A sent PO is not overwritten — it is REVISED** (Jess, 2026-08-18, overturning *"a sent PO
  is never edited · there are no revisions to keep"*). Cancel-and-reissue puts TWO numbers for
  ONE job in the factory's hands, and a factory reads two numbers as two jobs. A change KEEPS
  the number and mints `PO-2041 · Version 2`: the prior version is snapshotted, the reason and
  the author are stored, and the PO drops back to `Issued` until the new version's share is
  confirmed. **THE FLOOR — no line may be revised BELOW what has already been received;** the
  excess goes back through a Purchase Return first. (2990s proves both halves in production:
  `PurchaseOrderDetail.tsx:621` snapshots the prior version into `po_revisions`, and approve-po
  409s `received_floor` at `:639`.) Adding items is still a NEW PO; stopping is still the whole PO.
- **The portal never claims it sent anything.** Pressing a channel button records
  `{Channel} opened · Snapshot N` — a click is all the system observed. Print writes no history,
  moves no status and has no limit.
- **A SHARE IS A HUMAN FACT, IN TWO STEPS** (Jess, 2026-08-18). Step one is the click, and it
  records only the opening. Step two is a question the portal asks and an operator answers:
  WHICH version, to WHICH supplier, on WHICH channel. **Only the answer is the share.** A press
  that never became an answer is a PO nobody sent, and the register says so.
- **Communication is still not a STATUS.** The five Operation Status words are unchanged and
  none of them is `Ordered`. `PO PDF not shared` is work to do, never a stage.
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
- **GROUP BY SUPPLIER, and it is the ONE grouping this register offers** (Jess, 2026-08-18).
  Collapsing the list to one row per factory is how a buyer prepares a phone call: everything
  Ohana owes, in one place, one call, no scrolling back. 2990s makes `Supplier` groupable on
  its own PO register (`apps/backend/src/pages/PurchaseOrders.tsx:122`). Grouping is a VIEW —
  it re-sorts nothing else, remembers nothing across a reload, and never becomes a saved layout.
- **`Total` EXISTS AND IS PERMISSIONED, not deleted** (Jess, 2026-08-18, refining *"no money on
  Purchasing"*). The three operators buy, chase and receive without ever seeing a price — price
  is not theirs to judge and a number on their screen invites them to judge it. The approver
  sees it, because approving a purchase without its cost is not approving anything. **The same
  page shows different columns to different people; permission rides the PERSON, never the
  page** — which is also how a future purchasing manager gets access without a rebuild.

### WHAT THE 2990s REGISTER SHOWED AND CARRES DOES NOT COPY
2990s' PO register is a document BOOK; this one is a WORK LIST, and the gap is measurable.
It carries no `SO No.` and no `Customer Delivery` (`PurchaseOrders.tsx:114-256`), so it cannot
rank by risk to a customer's promise and falls back to date order. It has no `Current Action`
column at all. It hides received quantity behind `Transfer To (GRN)`, `defaultHidden: true`
(`:239`) — the answer to *did it land* is one picker-click away from a buyer who asks it hourly.
And its Confirm / Edit / Cancel / Convert live on a right-click menu (`GoodsReceivedList.tsx:546`),
which Register Law 8 forbids outright. **Take the grouping, take the drill-down, leave the rest.**

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
**THE SESSION IS BORN WITH THE PO, NOT WITH THE TRUCK** (Jess, 2026-08-18, following Odoo,
Dynamics BC and SAP's inbound delivery). Issuing a PO opens its Receiving Session and mints its
number in the same act. Nobody presses `Start Receiving`; the operator opens the tab and reads
*"what is due to land"* — the session is already there, waiting. **A half-counted session keeps
its number and stays in `To receive` reading `6 of 10`**, which is the whole point: the truck
that arrives at 17:30 does not have to be finished by 18:00, and tomorrow morning nobody has to
hunt for what they were doing.

`Session exists → Receiving Mode → Save → Posted`. An Office receive writes ONE `posted` event,
through the same validator and the same receive engine the warehouse uses. **A `submitted` event
is deliberately NOT written for the Office path** — one operator pressing Save once is the Office,
and an event records what happened in the BUSINESS world, not the steps the system walked.

**GOODS THAT LAND AWAY FROM THE OFFICE USE THE WAREHOUSE'S TWO ACTS** (Jess, 2026-08-18). Three
office staff cannot stand at HOUZS Balakong when a van arrives. Whoever is THERE counts, checks
condition, photographs and uploads the supplier DO — that is `submitted`. The month's GRN duty
reads it and posts it. **Segregation survives intact: the person who ordered still never posts
the receipt.** This is not a new path; it is the warehouse path pointed at a second address.

Damaged or wrong units become `on_hold` at the moment of receipt and stop counting as future
supply (0299), and a claim is raised automatically (0288's trigger).

**MORE ARRIVED THAN WAS ORDERED — THE DEFAULT IS THE DRIVER TAKES IT BACK** (Jess, 2026-08-18).
The counter records what is in front of them; the system never blocks the count. Excess is
refused at the tailgate and never enters stock — the receipt reads the ordered quantity and one
line records that the supplier over-shipped, so *"how often does this factory over-ship"* stays
answerable. **Found after the van has gone:** the surplus is marked for the supplier's next
collection, held out of sellable stock because it is not Carres' goods, and it rides the SAME
collection mechanism as a consignment return. Purchasing is TOLD, and does not decide — the one
case that needs a buyer is Carres wanting to KEEP the surplus, which is a commercial conversation.

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
- **THE TWO QUEUES CARRY THE SESSION, NOT THE PO** (Jess, 2026-08-18). Now that a session is
  born with its order, `To receive` shows `GRN No.` from the first day — `PO Issued` leaves the
  set, because this queue lists RECEIPTS and the PO has its own register. And **`Received`
  prints a fraction, `6 / 10`**, so a half-counted truck is legible without opening a row: the
  van that arrives at 17:30 is finished tomorrow, by whoever is on duty, without anyone hunting.
  ```
  To receive       GRN No. · Supplier · PO No. · Items · Goods Arrival ·
                   Received · Current Action
  Goods Received   Received · GRN No. · Supplier · PO No. ·
                   Supplier DO No. · Units · Claim
  ```
  **`Claim` is the last column of the posted queue**, adapted from 2990s' `Transfer To (PI / PR)`
  (`apps/backend/src/pages/GoodsReceivedList.tsx:98`) and re-pointed: the question this business
  asks of a past delivery is *did that truck cause trouble*, not *was it invoiced* — invoicing is
  Finance's and never appears here.
- **✅ THE COMPACT-SET DEFECT DIES WITH THE ALWAYS-OPEN PANE.** Measured 2026-08-06: `Goods
  Arrival` and `Received` sat outside `COMPACT_KEYS`, so with the workspace pane open — the
  DEFAULT — this page's two most-read columns rendered for nobody. The listing is now full width
  until a row is opened (Jess, 2026-08-18), so the compact set stops deciding what a receiver
  can see.
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
LEFT 200px   QUEUES    Confirm what happens next        ← the only queue tile TODAY
             SUPPLIER · PROBLEM
CENTRE       kit DataTable, eight measured widths 150 · 111 · 181 · 154 · 147 · 194 · 368 · 134
             status picker Open / Closed / All — a STAGE, one is always on
             ⚠ NO column was added for the resolution — the grid already totals 1481 in a
               1022 container, and layer ③ is a decision you make in the panel, not a fact you
               scan the list for
RIGHT        NOTHING. There is no right panel on this tab.
```

> ### ⭐ THE RAIL GAINS THE TWO DECISIONS — the recorded gap, closed (Jess, 2026-08-18)
> **APPROVED, NOT YET BUILT.** §6's own Approved Evolution says it out loud: **"NOTHING TELLS
> ANYONE TO PICK A RESOLUTION."** One queue tile exists and it is the phone call. The moment the
> supplier answers, the claim goes SILENT — the answer is on file, the decision is not made, and
> no surface anywhere asks anybody to make it. A claim that needs a human decision and raises no
> action is exactly what Law 7 was written to prevent.
> ```
> QUEUES
>   Confirm what happens next        waiting on the supplier
>   Decide what we do                the supplier answered; layer ③ is open
>   Decide what happens to the item  resolution chosen; the unit is still in limbo
> ```
> **The two new tiles ARE the two frozen decisions** — `Customer Resolution` (*what are we doing
> for the customer?*) and `Item Outcome` (*what happened to THIS item?*) — and they are separate
> tiles for the same reason they are separate fields: **both can be true at once, and a claim can
> sit waiting on either.** Recording the supplier's answer moves the claim from the first tile to
> the second by itself, onto the Work day of the duty holder who owns it. **Nobody has to remember
> to come back.**
>
> **No `Resolution` COLUMN is added, and the refusal stands** — the grid already measures 1481px
> in a 1022px container, and layer ③ is a decision made in the panel, not a fact scanned in a
> list. The rail answers *how many are waiting on me*; the panel is where the answer is given.
>
> **2990s contributes nothing here and the reason is worth recording:** it has no claim object at
> all — a bad receipt becomes a Purchase Return and the questions *what did the supplier say* and
> *what did WE decide* have nowhere to live. On this page Carres is a generation ahead, and the
> only thing to copy is the discipline of not copying.

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

**⭐ WHO DECIDES, AND THE LINE IS WHOSE MONEY IT IS** (Jess, 2026-08-18). Owning a claim is not
the same as being allowed to spend on it. **The supplier accepts responsibility → the duty holder
records the outcome and it is finished** — Ohana saying *"we will replace it"* needs nobody's
permission; it is Ohana's sofa and Ohana's cost. **The supplier refuses, or the item is to be
written off → Carres is paying now, and it goes to the approver.** A replacement sofa is thousands
of ringgit and it is not one operator's call at 5pm on a Friday.
**This is the SAME line the purchase approval already draws** — a customer's order authorises
itself; money Carres spends on its own account needs a person with the authority. Staff carry ONE
sentence, not two rules: **if it comes out of Carres' pocket, it goes to Jess.**

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
- **⭐ REPAIR ORDERS — the page that covers the gap between "flagged" and "back"** (Jess,
  2026-08-18). **APPROVED, NOT YET BUILT.** A repair surface already exists and it is 14 lines:
  `apps/web/src/pages/operation/OperationOpsRepair.tsx` is a thin wrapper over
  `OpsStockListView` — *"Units flagged for repair, or in old / damaged condition. Unflag when
  fixed, or takeout if written off"* — with exactly two actions, `flag-repair` and `takeout`.
  Stock carries one word for the same thing, `needs_repair` (`../stock/MASTER.md`).
  **Measured consequence: a unit is flagged and then the record goes silent** — who took it out,
  which repairer has it, when it was promised back, whether it is chargeable, none of it exists
  anywhere.
  **The split, and neither side duplicates the other:** Stock's queue owns *which units are
  faulty*; a Repair Order owns *the trip out and back*. `RO No · Repairer · Unit ID · Model ·
  Sent From · Handover · Expected Back · Next Action`. States read as facts —
  `Not shared with {repairer}` · `Waiting for handover` · `With {repairer}` · `Back, not checked`.
  **A repair is never a Purchase Return**: ownership does not move, and the SAME Unit ID must
  come back — a different one stops the receipt, because a repairer substituting a unit is a
  claim, not a repair.
  **AND IT NEEDS THE UNHAPPY ENDING.** *"Cannot be repaired"* may not close the order — the sofa
  is still at the repairer and nobody owns it. The unit comes BACK first, is checked, and only
  then does a human choose: sell it as damaged, or write it off. Without that path a
  beyond-repair unit sits in `With {repairer}` forever, which is how a physical asset quietly
  leaves a business.
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

### WHAT SETTINGS HOLDS — the full list (Jess, 2026-08-18)
```
production working days     per supplier x category      Ohana sofa 14
supplier work week          per supplier                 Ohana works Saturday
order-by buffer             days kept back to arrange the delivery
PO days                     Mon / Wed / Fri
company holidays            the one calendar every engine counts on

approval required?          Ready Stock  yes    Display      yes
                            Office       yes    Spare Parts  yes
                            a customer order needs none — the order IS the authority

no-answer rounds            3, then the work changes from "call the supplier"
                            to "tell the salesperson this order is at risk"

unit-tracked categories     sofa yes · bedframe yes · consumables no
supplier contact channel    the WhatsApp group / email a share actually goes to
destinations                name · full name · address · receiving contact ·
                            may goods land here?   ADD A DESTINATION HERE,
                            never in code — a fourth outlet is a settings row
```

### FROZEN RULES
- **A supplier × category with no number says `Set a number`** and gets no order-by date at all.
  It is never quietly planned on a 7 — a quiet screen must mean *watched and fine*, never
  *nobody looked*.
- **`approval required?` has no amount, because Purchasing has no money** (Jess, 2026-08-18).
  It is a switch per PURPOSE, not a threshold: an amount on this screen would make three
  operators judge prices, and price is not theirs. The approver sees the money; the buyer
  never does. **A purpose whose switch is off still records WHY it was bought.**
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

# ▶︎ P20 · SHIPPED 2026-08-08 — ONE width mechanism across the five tabs

> **The card is DONE and this block is the record of what it changed.** Six commits, one per
> item, page-side only. **`kit/DataTable.tsx` was never touched** — `sizing` is an existing
> prop, so nothing here needed the kit and nothing waited on S2.

**THE DEFECT WAS: three width mechanisms and TWO different scrollbars in one module, so a
gesture learned on one tab did not work on the next.** All five tabs now run one mechanism.

```
tab               sizing      declares    renders    who scrolls
To Order          "content"   1,252px     1,252px    the KIT's box     (unchanged)
Supplier Claims   "content"   1,439px     1,439px    the KIT's box     (unchanged)
Purchase Orders   "content"   1,172px     1,172px    the KIT's box     <- was "fill", PAGE pane
Receiving         "content"     826px       826px    the KIT's box     <- was "fill", 2 wrappers
Report            "content"     352px       352px    the KIT's box     <- was 37/15/15/15/15 %
```

**EVERY WIDTH IS NOW EXACT, NOT A MINIMUM.** `"fill"` (the absence of the prop) spends a
declared pixel as a SHARE, so a browser measurement became a ratio the moment the pane was
wider than the sum. Under `"content"` a column gets what its def asks for and the slack goes
to the kit's filler, which holds no word and no figure.

## What each item found — and the findings are worth more than the fixes

| Item | What was actually wrong |
|---|---|
| **P20.1** | Purchase Orders' `action` needed **192 -> 193**: `"content"` puts a filler after the last column, so it now carries P17's rule, which takes 1px of the BOX — Q13's pixel arriving one column later. **Receiving's widths had never had to carry their own content**: `arriving` 104 -> 105 · `received` 72 -> 82 · `grn` 132 -> 142 · two `auto` columns -> 193 / 61. `fill` had been topping them up out of the pane's slack — 160px of make-up. |
| **P20.2** | The kit's `<thead>` is `sticky top-0` **against the KIT's box**, so while a page-owned pane was the scroller the column headers scrolled away with the rows. Receiving's min-width was CONDITIONAL on the workspace being closed — which element scrolled changed with a record being open. |
| **P20.3** | 37% of a ~1,040px pane is 385px of column for the word `Mattress`, and the hole GREW with the monitor. Measured: 83 · 60 · 61 · 66 · 82, with a **stated** five-digit guard on the number columns — an allowance, not a measurement, and said so. |
| **P20.4** 🔴 | The entire audit trail in production is TWO rows, both `supplier_work_week` — so the only two history lines this page had ever shown read `was {0}` and `was {0,6}`. `po_days` held the identical defect, waiting for a manager's first change. |
| **P20.5** | **The cause was not the data.** 22 open POs and **21 have no arrival promise from any factory** — the one thing an operator cannot do to those 21 is check them in. Receiving was answering its own question (`Check in` whenever a PO owed a unit, true of every open PO from issue) while Purchase Orders read the shared `poCurrentActionOf` — **two tabs, one PO, two answers.** |
| **P20.6** | The empty sentence asserted *"every delivery so far arrived complete and on time"* while a closed claim sat in the table. And it centred on the 1,439px TABLE: measured, its centre is pinned at **721px at every pane width**, so below a ~700px pane it is off-screen and the operator lands on a blank grid. |

## Rulings this card is now evidence for

- **A width measured under `"fill"` was never really tested.** Five of Receiving's and Report's
  numbers only worked because the browser was topping them up. **A page that declares pixels
  must pass `sizing="content"`, or the pixels are decoration.**
- **`container-type: inline-size` belongs on the PANE, not on a scroller.** A page cannot style
  the kit's box, so the pane is the only handle on the visible width. It is **2px wider than
  the scrollport** (the kit's 1px borders), which `PoWorkArea`'s ceiling now pays for
  explicitly and the empty state deliberately does not.
- **`sticky left-0` inside a `<td>` does not hold horizontally.** Measured by Q10, re-used here
  rather than re-probed. It is never left in as a class that does nothing.
- **A second arithmetic hides as a page convenience.** P20.5's `Check in` and P20.4's raw
  `oldValue` were both a page answering a question a shared module already owns.

## Left open, deliberately — NOT LAW, and each names what would close it

- 🟡 **Receiving cannot ask `Confirm ready date`.** Purchase Orders passes the ready-date facts
  (`expected_ready_date` + the production/buffer arithmetic, which need the settings and catalog
  queries); Receiving does not, so it gets the state word `Check Expected Arrival` where that
  tab gets the dated call. That is the degradation `poCurrentActionOf` documents by name.
  **Passing HALF the facts would be worse** — the call would fire with no due and could never be
  late, so one word would mean two urgencies on two tabs (T7 · T5). *Closes when: one extracted
  hook feeds both pages. It touches the frozen Purchase Orders page, so it is its own card.*
- 🔴 **Sticky columns — still nobody's.** F72 stands: no engine here has them, it is the obvious
  fix for a 1,439px grid, and it needs the kit.
- 🟡 **Report's number columns carry a five-digit guard, not a measurement.** Every row today is
  TEST data (§6), so nothing on screen can size them honestly. *Closes when: real volume exists
  and the widest figure can be measured.*
- **Whether `Open` should stay Claims' landing tab when it is empty is the OWNER'S**, and it was
  NOT changed. A work queue opening on the work, with a rail stating `Closed` and `All` beside
  it, is a true screen; only what it said was wrong.

**WHY THE LAST COLUMN MATTERED AND THIS WAS NOT COSMETIC.** On four of the six screenshots the
column that fell off the right edge was the one answering the tab's own question — `On PO` /
`PO No.` (*did I buy it*), `Customer Delivery` (*when do they want it*), `Next move` (*what do
I do*). **The operator's answer was the thing that went missing.**

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
| **PO revisions** | **RULED IN, 2026-08-18 (Jess), reversing the 2026-08-06 exclusion.** A sent PO keeps its number and mints `Version n+1`; the prior version is snapshotted with its reason and author. The excluded thing was OVERWRITING, and that stays excluded. Floor: no line revises below `received_qty`. |
| **The Working Calendar** | Approved 2026-08-06. Public holidays live in code (`packages/shared/src/my-holidays.ts`) and a manager cannot edit them — but the real fact is *"is Carres working that day?"*, which only the office can answer (a gazetted holiday can be a working day, and the company can close on an ordinary one). Settings gains ONE company calendar: the official list auto-loads each year, a manager marks a day working / adds a closure, audited like every Settings number. **Every engine — order-by, the CALLS calendar, delivery arithmetic — reads this ONE calendar.** Until built, `myHolidaySet()` stands. |
| **`Order Route`** | Approved 2026-08-06 as `View Flow`; **renamed `Order Route` by Jess 2026-08-18** — the Sales Order canvas and this one draw the SAME chain entered through different doors, and one chain earns one name. **the ONE function worth porting from AutoCount's PO-register menu** (2990s' `RelationshipMap` is the worked example): one click shows SO → PO → Receiving → Claim for a document. Everything else on that menu is either already here or REJECTED: blank `New` (bypasses PURCHASING DEMAND, the single entry) · `Delete` (red line — `Cancel` keeps the record) · AP/invoice transfers (Purchasing never touches money). **`Edit` is no longer on the reject list** — see §4's revision rule. |
| **Team panel `GRN DUTY` row** | Approved 2026-08-06 — the panel states PO duty and must state GRN duty too (§2.2). One home for identity; no page repeats it. |
