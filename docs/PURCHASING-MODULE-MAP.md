# PURCHASING MODULE MAP — what is ACTUALLY on the screen today

> **Read this BEFORE you discuss, design, critique or card anything in Purchasing.**
> Written 2026-08-05. It is the module's third file and it does not repeat the other two:
>
> | File | Answers |
> |---|---|
> | [`PURCHASING-WORKING-FLOW.md`](PURCHASING-WORKING-FLOW.md) | what Purchasing **DOES** — actions, triggers, gates |
> | [`PURCHASING-INFORMATION-MODEL.md`](PURCHASING-INFORMATION-MODEL.md) | how the information is **ORGANISED** |
> | **this file** | what is **BUILT AND ON SCREEN RIGHT NOW** — every block, every button, every endpoint, every table, with live row counts |

---

## §0 · Why this file exists — the failure it prevents, named

**Loo, 2026-08-05:** *"为什么每一次你不会自己先找好了跟我说？我发现你今天一开始，非要等我讲了
什么，你才说『已经有了』，然后才找得到。"*

He was right, and the mechanism is worth writing down because it will happen again:

```
A chat opens CHECKPOINT-claims.md
  → it finds a section headed "Code facts, measured and not to be re-derived", eight lines
  → it verifies all eight  ✅
  → it believes it has measured the page                        ← THE MISTAKE

But those eight lines are what the PREVIOUS chat happened to check.
They are not an inventory. Nothing outside them was ever looked at.
```

**Measured cost on 2026-08-05, one session:** the chat discussed the Claims Resolution model
for four rounds before discovering that **the item-outcome picker it was designing had been
live on that very page since 2026-07-27**. Its only contact with `SupplierClaimPanel.tsx`
(504 lines) had been `grep -c "timeline"` → `0`. It never read the file.

**Two rules follow, and they are the whole point of this document:**

1. **A checkpoint's measurement list is a STARTING point, never a ceiling.** If a fact is not
   in it, that means nobody looked — not that it is absent.
2. **`grep` cannot inventory a page.** `grep` answers *"is the word I already thought of
   present?"*. It cannot tell you about a button you have not imagined. **Read the file.**

> ⚠️ **`OperationSupplierClaims.tsx` contains a NUL byte at line 240** (a deliberate sort-key
> separator, `` `${owner}\0${label}` ``). **Shell `grep` treats the whole file as BINARY and
> returns NOTHING without `-a`.** Every source scan run from a shell against that file
> silently measures zero. Node's `readFileSync(…, "utf8")` is unaffected, so the repo's own
> test guards are safe — but a chat measuring by hand is not. **Use `grep -a` on that file.**

---

## §1 · How to keep this file true

- **Every card that changes a Purchasing screen updates its tab's section here, in the same PR.**
- **Never delete a row to make the map tidy** — the map's value is that it is complete.
- **Each tab below carries a `MEASURED HOW` line.** A tab read end-to-end and a tab read from
  its docblock are not the same evidence, and the next chat must be able to tell them apart.
  **That line is the honesty this file needs to avoid becoming the trap in §0.**

---

## §2 · The six tabs

`PurchasingTabs.tsx` — ONE white 44px header row; pages draw no header of their own.

```
Create Purchase ─▶ To Order ─▶ Purchase Orders ─▶ Receiving ─▶ Claims
                                                                  │
                                     Report (read-only)  ·  Settings (manager-only)
```

| Tab | Route | Page file | Lines | Mission (one sentence) |
|---|---|---|---|---|
| To Order | `/operation?tab=purchase` | `OperationToOrder.tsx` | 1,965 | Decide which customer orders become purchase orders **today** |
| Purchase Orders | `/operation/procurement` | `OperationPurchaseOrders.tsx` | 3,167 | Pick today's PO → update supplier progress → talk to the supplier → hand to Receiving |
| Receiving | `/operation?tab=receiving` | `OperationReceiving.tsx` | 983 | Book in what physically arrived, through ONE door that leaves a record |
| Claims | `/operation?tab=claims` | `OperationSupplierClaims.tsx` | 854 | Resolve the exception a receiving produced |
| Report | `/operation?tab=purchasing-report` | `OperationPurchasingReport.tsx` | 327 | How many did we buy this month — every number is a door |
| Settings | `/operation?tab=purchasing-settings` | `OperationPurchasingSettings.tsx` | 561 | Every number the ordering engine reads, manager-only |

**The chain rule (`HOW-TO-RUN-A-CHAT.md`):** before changing any tab, answer *does what
upstream sends still get in, and can downstream still catch it?*

---

## §3 · Tab by tab

### 3.1 · To Order

**MEASURED HOW:** docblock read in full · every `data-testid` extracted · endpoints listed.
**NOT read line by line.**

**On screen**

```
LEFT 200px          PO SCHEDULE  — rolling calendar of configured PO days,
                                   red OVERDUE row above it, never swallowed
                    CATEGORY     — All · Mattress · Bedframe · Sofa (no counts)
                    + Create Purchase        ← the manual entrance, may never be missing

RIGHT               toolbar: pill search · selection state · Issue pill
                             (exists ONLY while something is selected) · `Updated hh:mm`
                    grid: SIX frozen columns, header-click sort, per-column ▼ filter
                          PO filter speaks business: `Not Ordered` / `Ordered`
                    footer: units per category + clear
```

**Controls** `to-order-create-purchase` · `to-order-issue` / `to-order-issue-pill` ·
`to-order-retry` · `to-order-continue` · `to-order-cancel-dialog` / `-qty` / `-submit` ·
`to-order-clear-filters` · `to-order-footer-clear` · `to-order-sheet` · `to-order-updated`

**Endpoints** `GET /operation/purchase/to-order` · `GET …/demand/pick-items` ·
`POST …/demand` · `POST …/demand/:id/cancel` · `POST …/issue` · `POST …/take-stock`

**Tables** `purchase_demands` (**2 rows**) · reads `order_lines` · `purchase_order_lines` ·
`ops_stock_items`

**Frozen rules that are NOT negotiable here**
- `Order By` never reaches the screen — the operator sees the CUSTOMER's date.
- Engine pre-selects its own plan; human ticks are DELTAS a refetch cannot overturn.
- Issue = zero popups, zero toasts; rows update in place; partial failure keeps `Retry`.
- No Status pills, no Sort By, no Group By.

---

### 3.2 · Purchase Orders

**MEASURED HOW:** docblock read in full · every `data-testid` extracted · endpoints listed.
**NOT read line by line** (3,167 lines).

**On screen**

```
LEFT 200px          CALLS        Overdue · Today · Tomorrow
                    WORK STATUS  Need Supplier Confirmation · Waiting Goods ·
                                 Ready to Receive · Completed

CENTRE              NINE frozen columns (Q7, Loo 2026-08-04), one fixed set:
                    PO Issued · Supplier · PO No. · SO No. · Items ·
                    Destination · Customer Delivery · Expected Arrival · Current Action
                    default order = RISK TO THE CUSTOMER'S PROMISE (`comparePoRisk`)

RIGHT 400px         WORKING HEADER → REFERENCE LAYER → SUPPLIER FOLLOW-UP →
                    RECEIVING SUMMARY → ACTIVITY
```

**Controls (44 named)** — the load-bearing ones:
`po-date-open` / `-form` / `-input` / `-save` / `-reason` / `-remarks` / `-extend` ·
`po-ready-date-open` / `-input` · `po-print-pdf` · `po-open-whatsapp` · `po-open-email` ·
`po-copy-message` · `po-wa-toggle` · `po-save-template` · `po-history` · `po-activity` ·
`po-panel-items` · `po-panel-close` · `po-overdue` · `po-arrival-gap`

**Endpoints** `GET /operation/pos` · `/:id/print-data` · `/:id/receiving` ·
`/:id/source-orders` · `/:id/units` · `/awaiting-stock-shortage` · `/report` ·
`POST /` · `/batch` · `/:id/ready-date` · `/:id/tomorrow-delivery` · `/:id/sends` ·
`/:id/cancel` · `/:id/office-receive` · `/:id/assign-pickup-partner` ·
`/:id/reassign-warehouse` · `/:id/chase-event` · `POST /lines/:lineId/balance-date` ·
`/destination` · `/ops-remark` · `/split` · `PUT /message-template`

**Tables** `purchase_orders` (**24**, 22 open) · `purchase_order_lines` (**38**) ·
`po_history` (**23**) · `po_sends` (**3**) · `po_revisions` (**2**) ·
`po_supplier_promises` (**6**)

**Frozen rules**
- The nine columns NEVER change because the panel opened. No compact variant.
- When they do not fit, the LISTING REGION scrolls sideways. Deleting a column to avoid a
  scrollbar is forbidden.
- ONE PO at a time: `{ poId, mode }`. Row click → panel; ⌄ → expand + panel closes.
- PO-line quantities are RPC-only (0316) — no client may PATCH `received_qty`.

---

### 3.3 · Receiving

**MEASURED HOW:** docblock read in full · rail definition read · `actionWordOf` read ·
endpoints listed. **NOT read line by line.**

**On screen**

```
LEFT 200px      RECEIVING PROGRESS   Receiving issue (danger) · Partially received ·
                                     In transit · Fully received
                SUPPLIER             per factory
                SOURCE               last (Jess's ruling 4)

CENTRE          SEVEN columns: PO Issued · Supplier · PO No. · Items ·
                Goods Arrival · Received · Current Action
                default order = PO Issued OLDEST first

RIGHT 400px     ONE PO's Receiving Session:
                Read Mode → Start Receiving → Receiving Mode → Save → Posted
```

**Controls** `receiving-rail` · `receiving-listing` · `receiving-workspace-toggle` /
`-pane` / `-page` · `receiving-clear-filters` (the Session's own controls live in
`ReceivingWorkspace`)

**Endpoints** `POST /operation/pos/:id/office-receive` (via `office_receive_post`, 0315) ·
`GET /operation/warehouse-receipts` · `POST /:id/check-in` · `POST /:id/send-back`

**Tables** `warehouse_receipts` (**3**) · `receiving_events` (**3**)

**Facts a chat gets wrong here**
- **The rail is a PROGRESS rail, not an action queue.** There is NO `Check in` queue tile.
  Jess ruled 2026-08-03 that the model *should* be a queue (`To Receive` / `Received`) — the
  open carry-forward `receiving-queue-model-architecture-review` owns it.
- **`Current Action` is NOT limited to `Check in`.** `callsById` is still computed
  (line 288) and can render `Confirm tomorrow's delivery` or `Confirm balance delivery
  date`. Today's data reaches only `Check in` — that is a DATA fact, not a code fact.
- **`OperationReceiving.tsx` says `claim` exactly ONCE** in 983 lines. Receiving is blind to
  what it produces (card R14, the Receiving lane's).
- **Q14 (PR #629) moved both supplier-call doors OFF this page.** Jess's 2026-08-03 ruling
  says no Purchase Orders workstream may modify Receiving; **whether Q14 crossed it is
  unresolved.**

---

### 3.4 · Claims

**MEASURED HOW:** ✅ **`SupplierClaimPanel.tsx` read END TO END, all 504 lines.**
`OperationSupplierClaims.tsx` read for structure (imports, panel mount, rail). Endpoints and
tables verified against live production.

**On screen — the page**

```
LEFT 200px      QUEUES     Confirm what happens next        ← ONE queue tile only
                SUPPLIER
                PROBLEM
CENTRE          kit DataTable, EIGHT measured column widths (D7-Claims #612)
                150 · 111 · 181 · 154 · 147 · 194 · 368 · 134
                status picker: Open / Closed / All  (a STAGE — one is always on)
RIGHT           ❌ NOTHING. There is no right panel on this tab.
```

**On screen — the expanded row (`SupplierClaimPanel`, a 2-column grid)**

```
LEFT COLUMN                              RIGHT COLUMN
  Evidence                                 What we asked
    photos, or                               ○ the ask buttons (list depends on claim_type)
    "No photo — a late delivery has          [ Send to {supplier} ] or
     nothing to photograph."                 [ Save what we asked ]  ·  [ Copy ]
                                             once recorded → READ-ONLY prose
  The goods            ← Loo renames         and the WhatsApp message preview
    "{n} unit on hold · {reason}"        
    ○ Put back in stock                    What {supplier} answered
    ○ Returned to supplier                   ○ Replacement · Deliver remaining · Repair ·
    ○ Write off                                Return & replace · Reject · Other agreement
    note (REQUIRED for write off)            note (REQUIRED for reject / other agreement)
    [ Save what happened ]                   [ Save {supplier}'s answer ]

  Closed  (only when closed)              Settle it   (only when NOT closed)
    date + close note                        note (optional)
                                             [ Close claim ]
```

**THIS IS THE FACT MOST CHATS GET WRONG:**

> **The item-outcome picker already exists and Claims is its ONLY home.**
> `STOCK_HOLD_OUTCOMES` (`packages/shared/src/stock-hold.ts`) is imported by exactly one file
> in the whole repository — `SupplierClaimPanel.tsx` — and its endpoint
> `POST /operation/supplier-claims/:id/hold-resolve` lives under Claims.
> **Removing it from Claims leaves quarantined goods with no way out of quarantine.**
> Shipped by R4 / migration 0299, 2026-07-27.

**Endpoints** `GET /operation/supplier-claims` · `GET /:id/photos` · `POST /:id/request` ·
`POST /:id/response` · `POST /:id/hold-resolve` · `POST /:id/close`

**Table** `supplier_claims` — **28 columns, NOT ONE is money**, **1 live row**

**The one live claim, `SC-1014`** (2026-08-05 16:20–16:23 MYT, a full end-to-end test):

```
PO-2054 · JAGER-SS · damaged · qty 1 · DO-P5-0001 · 1 photo
reported → requested `replace` → responded `replacement` → closed
all four timestamps present   ← R13's Timeline has real data to render
```

**What Claims does NOT have**
- no right panel · no Timeline · no Owner · no Consequences region · no money field
- **no create button — and never will** (SAP QM: a claim is born from a PO line, 0288's trigger)
- **no post-receipt entry.** A fault found a week after receiving has NO supplier-claim route
  at all — it is a service case. CF `hold-entry-only-from-incoming` states the price of
  changing that: *the entry rule and the refurbish door must be settled in the SAME change.*

---

### 3.5 · Report

**MEASURED HOW:** docblock read in full · controls extracted.

**On screen** 200px rail (`Month` · `Supplier` · `Category`, all three toggle) → grouped
table → `Total` row. **No money field exists on the wire**, so the page could not print one.
No Refresh button — the stamp rides the shell's page-meta slot.

**Six words and no seventh:** `Report` (singular) · `POs` · `Ordered` · `Received` ·
`Outstanding` · `Total`.

**Endpoint** `GET /operation/pos/report`. **Stores nothing** — no table, no RPC.

**Every number is a door**: a row unfolds into the exact POs it counted; each is a link into
the register at that document. **Cancelled POs are excluded and the exclusion is on screen.**

---

### 3.6 · Settings

**MEASURED HOW:** docblock read in full · controls extracted.

**On screen** the seven engine numbers, manager-only, server-gated. The supplier × category
matrix is derived from the catalog, so only factories that own a SKU appear.

**A pair with no number reads `Set a number` and gets NO order-by date at all** — it is never
quietly planned on a 7. Every row carries **who changed it, when, and what it was before**.

**Endpoints** `GET /operation/purchasing/settings` · `PUT /number` · `/po-days` ·
`/production-days` · `/work-week`

**Table** `purchasing_settings` (**1 row**) · migration 0303

---

## §4 · How to design a tab's mission — the method

**Do these five in order. Skipping step 1 is the §0 failure.**

**1 · INVENTORY the tab before you have an opinion.**
Read the page file end to end. Read its panel components. List every endpoint and every
table. **Write what you found into §3 of this file before you propose anything.** If a
concept you are about to design already has a button, you must find it here, not three
rounds into the conversation.

**2 · State the mission in ONE sentence, and make it a question the operator asks.**
Good: *"decide which customer orders become purchase orders today"*.
Bad: *"manage purchasing"* — that is a noun, not a question.
**Two tabs may never answer the same question.** Purchase Orders asks where the SUPPLIER
CONVERSATION is; Receiving asks where the DELIVERY is. Neither borrows the other's rail.

**3 · Check the chain in both directions.** What does upstream send in? What must downstream
catch? A tab that breaks either is not a tab, it is a dead end.

**4 · Separate the LAYERS before you name anything.** The 2026-08-05 Claims session found
this the hard way, and it generalises:

```
Customer Problem  →  Supplier Response  →  Carres Resolution  →  Carres Execution
                                                          →  Stock · Finance · Demand
```

**Two decisions that answer different questions may never be forced into one list.**
Test: *can both be true at the same time?* If yes, they are two fields, not one.

**5 · Only then, words.** Every visible string must already be in
[`COPY-STANDARD.md`](COPY-STANDARD.md). If it is not, **stop and ask Loo** — do not invent
one, and do not reach for an ERP term because AutoCount uses it.

---

## §5 · Shared machinery — one home each, never a second copy

| Concern | The ONE home |
|---|---|
| Action words (queue · line · button · done · empty) | `packages/shared/src/order-action-words.ts` — `PurchasingActionKey`, six keys |
| The six supplier calls / due dates | `packages/shared/src/purchasing-supplier-calls.ts` |
| Receiving progress ladder (4 rungs, ORDER is the rule) | `packages/shared/src/po-receiving.ts` |
| PO risk order | `comparePoRisk`, `packages/shared/src/po-workspace.ts` |
| Claim lifecycle, asks, answers, close gates | `packages/shared/src/supplier-claim.ts` |
| Quarantine outcomes + status mapping | `packages/shared/src/stock-hold.ts` |
| Engine numbers | `packages/shared/src/purchasing-settings.ts` + `purchasing_settings` |
| Who is on PO duty this month | `ops_po_duty` → `GET /operation/po-duty` → `useOperationPoDuty()` |
| The rail recipe | `pages/operation/components/workspace-rail.tsx` |
| The facet row | `components/FacetRow.tsx` |
| The tab bar / header | `pages/operation/PurchasingTabs.tsx` |

> ⚠️ **`org_duties` does NOT hold the PO-duty holder.** Its six keys are `ops_manager` ·
> `po_duty_editor` · `account_creator` · `finance_approver` · `roster_editor` ·
> `stock_planner`. `po_duty_editor` is *the person who edits the rota*. The rota itself is
> `ops_po_duty` (month → user). **Live: Jul = Shasha · Aug = Yu Jun (CR004) · Sep = Khor Yee.**
> `useOperationPoDuty()` already returns `holder.name` — **no migration, no new API.**

---

## §6 · Live production snapshot — measured 2026-08-05

**Every row in the database today is TEST data** (CLAUDE.md). These numbers are evidence
about whether CODE WORKS, never about business volume. **Re-measure before quoting.**

```
purchase_demands          2      purchase_orders         24   (22 open · 16 with no eta)
purchase_order_lines     38      units ordered           47
received / damaged / wrong        4 / 1 / 0
warehouse_receipts        3      receiving_events         3
supplier_claims           1      units on_hold            0
po_history 23 · po_sends 3 · po_revisions 2 · po_supplier_promises 6
purchasing_settings 1 · ops_po_duty 3 · ops_stock_items 135 · ops_stock_pool_usage 0
suppliers 10  (5 have no WhatsApp group · 0 of 10 have a phone)
```

**One live oddity worth knowing:** `PO-2054` is 3 ordered / 3 received / **1 damaged**. The
receiving ladder tests `fully_received` FIRST, so it reads **`Fully received`** on the rail
and the damaged unit is invisible there. That is the published precedence working as ruled
(R10 / §9) — the first live case of its cost.

---

## §7 · Known gaps, carried not hidden

| Gap | Owner |
|---|---|
| `Confirm tomorrow's delivery` has a door on Purchase Orders and **no queue tile anywhere** | ⑦ P |
| `PURCHASING-WORKING-FLOW.md` §1/§7 still assign three actions to Receiving; the code moved two | ⑦ P |
| Receiving's rail is a status model where Jess ruled a queue model | ④ R / CF `receiving-queue-model-architecture-review` |
| Whether Q14 crossed Jess's "do not modify Receiving" ruling | unresolved — somebody must say which reading is right |
| Claims facet rail filters a table holding 0–5 rows for the foreseeable future | reported, law vs reality |
| No post-receipt supplier claim (a latent fault has no route) | CF `hold-entry-only-from-incoming` |
| `supplier_claims` has no money column; the cost sits in `purchase_order_lines.cost` | card R12 |
