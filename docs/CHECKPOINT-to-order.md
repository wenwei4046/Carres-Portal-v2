# CHECKPOINT — Purchasing · To Order

> **Last written 2026-07-31.** Overwritten in place; there is never a second
> version of this file. It is a handover, not a design doc — the design lives in
> `docs/PURCHASING-WORKING-FLOW.md` + `docs/PURCHASING-INFORMATION-MODEL.md`.
>
> Read this before touching Purchasing.

---

## 🔴 FIRST JOB: nobody has seen the page work yet

The last fix (`74ec30aa`) landed minutes before the session ended. **No human
has opened To Order since.** The operator's last report was *"still order don't
have — should have 3 order"*, and that was against the code BEFORE the root
cause was found.

**Open it before doing anything else:**

```
https://erp.carresofficial.com  →  Purchasing  →  To Order
```

**Hard-refresh** — the Worker changed, the browser has yesterday's answer cached.

**What it should say.** Computed from live data on 2026-07-31, after the 7
purchase orders already issued are netted off:

```
Nice Future · Mattress    1 Purchase Order     11 customer orders · 14 lines
Ohana · Sofa              8 Purchase Orders     8 customer orders · 11 lines
Ohana · Bedframe          1 Purchase Order      7 customer orders ·  7 lines
```

The two orders keyed in on 2026-07-31 are in there: **SO-1285 jimmy** (Ohana ·
Lyyar sofa) and **SO-1284 LIM KUAN YANG** (Nice Future mattress). Mattress and
bedframe merge into ONE document each, so adding a customer order does not move
those counts — it adds a row inside the one document. **Only the sofa number
moves.**

If it is still wrong, **report the exact words on screen** — blank, a message,
or the wrong number. Three rounds were lost to guessing.

---

## What went wrong, so nobody re-derives it

**One root cause produced three different symptoms over two days.**

`order_lines.sku` is free text with no foreign key, and **16 live demand lines
carry a DOUBLE QUOTE** in the value:

```
Leg 4"
HK5531/28"(2 Seater + Lshape)/M2402-4 Sand
AM9053/30"(3 Seater)/M2402-4 Sand
```

PostgREST wraps a value holding reserved characters in double quotes, so a value
that CONTAINS one breaks the filter it is put into, and the server answers with
whatever it managed to parse.

| | Symptom | What it really was |
|---|---|---|
| 07-30 | Seven customer requirements on no purchase order; the documents issued looked complete | the catalog read came back short |
| 07-31 | A guard read the short answer as an alarm and disabled `Issue` for the whole page | same short read |
| 07-31 | Two freshly keyed orders "did not appear" | same short read |

**The chunking added in between did nothing** — the unparseable value is still
inside one of the chunks. It was a fix aimed at the wrong cause.

### The rule that replaced it

> **A SKU may never go into a PostgREST `.in()` list.**

The catalog is 205 rows and every open purchase-order line is a small live
slice, so **both are read whole**. Nothing to quote, nothing to chunk. A SKU
absent from the catalog map is then *definitively* not a product — `Transport
Fees`, `No Lift Per Floor Charge`, `Leg 4"`, the AutoCount free-text
descriptions, **95 of them** — and is passed over in silence, which the original
route always did and was always right to do.

**A source test enforces it** (`to-order.test.ts`): no `.in()` on a sku anywhere
in the route. A render test cannot see this; only the source can.

> ⚠ **`/today` — the OLD purchase route — still uses `.in("sku", …)`.**
> `apps/api/src/routes/operation/purchase.ts` was not touched. If anything reads
> from it, it has the same bug.

---

## What is live

| | |
|---|---|
| Main | **`74ec30aa`** |
| Web bundle | `index-z5-nGUg1.js` · all four canonicals converged · `SERVICE_ROLE` 0 |
| API Worker | **`37d94086`** · `api.carresofficial.com` · `/health` 200 |
| Migration | **none, the whole session** |
| Prod data | 7 purchase orders (`PO-2031`…`PO-2037`), 18 lines, 23 `ops_stock_items` incoming |

Shipped this session, in order: `84213001` (#526) · `16da4802` (#527) ·
`fbf30eda` (#528) · `74ec30aa` (#529).

---

## The architecture, frozen — do not reopen

**Supplier is the work queue; the purchase order is the preview.**

```
LEFT  300px      Supplier × Category · {N} Purchase Orders · Order by {date}
RIGHT            Purchase Order Preview — PO 1…N, each expandable
                   Customer → Sofa/Item → Modules → SKU
BOTTOM sticky    Destination ▾ · Issue {N} Purchase Orders
```

An operator manages a **supplier** — they WhatsApp Ohana, not PO-2037 — so a
list of documents on the left would turn 3 rows into 90 and lose the supplier.

**Proposal is not a business object. It is a computed view.** No status, no
hold, no audit, no lifecycle. Only a Purchase Order is real.

**Four actions, all browser-session only.** A refresh throws the arrangement
away and the server's suggestion comes back.

| Action | Meaning |
|---|---|
| `Include in this issue` | whether a document goes out THIS time. Not a hold, not an exclusion, not a cancellation, not a status |
| `Remove from this Purchase Order` | off this document; the customer's order is untouched and the next recomputation offers it again |
| `Split` · `Move` | only where a PO may hold more than one customer order. **Never on sofa** — nothing to split, and moving would be the merge the boundary forbids |
| `Merge` | **not built.** No legal use while no supplier carries two procurable categories |

**Other frozen rules:** Qty counts sofas, not module lines · Summary is
`Model · Qty · at most ONE spec`, three tokens, `Height 24"` never prints and no
leg *height* prints · a dateless row sinks under every column in both directions
· only mattress/bedframe/sofa enter, by a positive rule · four date names never
mix (`Customer Delivery` · `Stock Ready` · `Supplier Ready Date` ·
`Delivery Date`) · **blue appears once, on the primary button.**

### The write

```
POST /api/operation/purchase/to-order/issue
{ supplierId, category, destinationId,
  purchaseOrders: [ { key, include, buildKeys } ] }
```

The client posts an **arrangement and nothing else** — no SKU, no quantity, no
price. The server reads those from its own recomputation.

`operation_create_pos_batch` is one plpgsql function, so the whole issue is **one
transaction**: a failure on the seventh document rolls the first six back. Its
1–20 cap is a refusal, never a quiet chunking. The destination lands in ONE
statement over every id.

Six refusals, each tested: `unknown_build` (not waiting to be ordered, another
supplier's, or changed since the page loaded) · `duplicate_build` ·
`empty_document` · `sofa_merge` · `batch_too_large` · `no_documents`. Plus
`demand_unresolved` — a SKU in the catalog, in a procurable category, with no
supplier.

---

## What is NOT built

### Ruled 2026-07-30/31, still owed

1. The right pane's header duplicates the sidebar → make it `Review`.
   *Watch: the identity then leaves the pane holding an irreversible button.*
2. The success page is too empty → `✓ Purchase Order Created` / PO + supplier /
   `Next Step — Confirm Supplier Ready Date` / button.
3. The count should serve the button — `Issue 7 Purchase Orders`.
4. **`Search…` is decoration.** No input, no filter. Make it real.
5. Auto-advance to the next supplier after issuing.
6. Column weight — Customer and Summary are what a reviewer reads.

### Blocking gaps

- 🔴 **The PO document has no screen.** `PoDocumentPreview.tsx` is orphaned —
  nothing imports it, `purchasing_po_document` has no caller. **A purchase order
  can be created and not sent.**
- 🔴 **Nothing writes `purchase_orders.expected_ready_date`.** The success panel
  points at Purchase Orders and Purchase Orders cannot record it.
- 🟡 The Receiving journey is undesigned — `Issued → ? → Ready to Receive`.
- 🟡 **The grey-hover ratchet enforces the OPPOSITE of the accent law.** UI-KIT
  §3.5 says a row hovers blue; the ruling gives blue to the current thing and
  the primary action only. Baseline moved 94 → 96 and the reason is written into
  `scripts/check-design-standard.mjs`. §3.5 has to be rewritten.
- 🟡 Every PO line costs 0 — 205 SKUs carry no cost. Ruled acceptable; fix in
  SKU Master, no To Order change needed.
- 🟡 PO days are retired in the design and still live in code —
  `purchasing_settings.po_days`, `isPoDayMYT`, `nextPoDayMYT`,
  `/line/push-next`, the PO-day cron.
- 🟡 Exclusion has no button. `Exclude from Purchasing` /
  `Exclude Until Resolved` are designed and unbuilt; they belong to Orders.
- 🟡 `Stock ready` survives in the dictionary with nothing rendering it — the
  column left with the grid. Dead word, safe, worth clearing.
- 🟡 Destination reads `HOUZS` in the database, `HOUZS Balakong` in the spec.

### Known bad data, not a code problem

The 7 purchase orders already in prod are **SHORT** — they were issued while the
short read was live, so seven requirements are missing from them. Whether to
cancel and re-issue, or raise the balance separately, is a business decision.
**`PO-2031`…`PO-2037` should not be treated as a correct example of the output.**

---

## Test baselines

| | |
|---|---|
| shared | 2009 / 2009 |
| api | 3 pre-existing (`partner/pickups` ×1 · `supplier/pos` ×2) |
| web | 16 pre-existing (`OperationOrders` ×7 · `OhanaSofaTab` ×4 · `OrderCustomerCard` ×4 · `NiceFutureMattressTab` ×1) |
| tsc | web clean · api 4 (`rental-sell.test.ts`) |

**The web suite oscillates 16–17.** The extra failure emits no `FAIL` line and
lands in the known-flaky `OperationOrders` drawer file. Count the `FAIL` lines,
not the summary.

---

## Where Loo wants to go next

> *"Purchase Orders 长在 To Order 产出的 PO 上. 如果 Preview 的形状还没冻结，
> Purchase Orders 一定会跟着重做."*

The Preview architecture IS frozen (above). **To Order can be frozen the moment
the page is confirmed working** — then Purchase Orders, which is the large
module: a PO lives there for weeks waiting on a ready date, an ETA, a supplier
delay, goods.

**Do not start Purchase Orders before somebody has watched To Order issue a
correct purchase order end to end.**

---

## Two habits this session paid for

**A number that surprises you is a measurement to check, not a fact to explain.**
Three rounds were spent reasoning about why lines vanished; one query comparing
what went into a read with what came out would have found it immediately.

**A fix aimed at a cause you have not proved is a fix that hides the cause.**
The chunking looked responsible, shipped clean, and changed nothing.
