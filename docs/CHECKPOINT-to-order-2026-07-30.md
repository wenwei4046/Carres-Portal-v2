# CHECKPOINT — Purchasing · To Order, 2026-07-30

> **Read this before touching Purchasing.** It is a handover, not a design doc.
> The design lives in `docs/PURCHASING-WORKING-FLOW.md` +
> `docs/PURCHASING-INFORMATION-MODEL.md`; this file says what SHIPPED, what is
> BROKEN, and what the next session should do first.

---

## 🔴 STOP — read this before issuing another purchase order

**Seven customer requirements were silently not ordered, across five customer
orders.** The operator pressed `Issue Purchase Order`, seven POs were created,
and these never reached any of them:

| SO | Customer | SKU | Ordered | On a PO |
|---|---|---|---|---|
| 1204 | ella | `5539-1A(LHF)` | 1 | — |
| 1207 | PETER | `5539-1A(LHF)` | 1 | — |
| 1208 | ahmad | `5539-1A(LHF)` | 1 | — |
| 1211 | kanan | `5539-STOOL` | 1 | — |
| 1257 | kee tong | `5539-2B(LHF)` | 1 | — |
| 1257 | kee tong | `5539-L(RHF)` | 1 | — |
| 1282 | mei emi | `TELLUC-1S` | 1 | — |

**SO-1257 and SO-1282 got NO purchase order at all** — every sofa line they
carry is on the list above, so the whole customer order vanished from the
workspace. The other three lost one module each from a PO that otherwise
looked complete, which is the more dangerous shape: the document looks right.

**This is the exact failure the whole design exists to prevent.** Nothing on
screen said anything was missing.

### What has been RULED OUT (do not re-check these)

| Ruled out | Evidence |
|---|---|
| The projection (`packages/shared/src/to-order.ts`) | Fed the real shape of all four affected orders it returns **all four rows**, including kee tong (no date) and mei emi (Telluc). Reproduced in a throwaway test on 2026-07-30 |
| The SKUs are missing from the catalog | All 8 exist in `product_skus`; the 5 dropped ones all carry a supplier and resolve to `category = 'sofa'` |
| A PostgREST row cap | The reads are 58 orders · 149 order lines · **78 distinct SKUs** — far under any limit |
| `excluded_from_plan` / `exclude_from_plan_until` | Both false / null on every affected line |
| Already covered by an open PO | `open_po_qty_for_sku` was 0 for every dropped SKU at issue time |
| `operation_create_po` dropping lines | The POs contain exactly the lines they were sent; the loss is upstream |

### The remaining suspects, ranked

1. **`product_skus` `.in("sku", skus)` in `apps/api/src/routes/operation/to-order.ts`.**
   PostgREST's `in.(…)` list is comma-delimited and these SKUs contain
   parentheses — `5539-1A(LHF)`. A value with `(`, `)`, `,` or `.` must be
   double-quoted or the list mis-parses. If a SKU is not returned, `cat.get(sku)`
   is `undefined` and the line is **skipped in silence**, which matches every
   symptom exactly: partial lines on some POs, whole orders gone when all their
   SKUs are affected.
   *Against it:* `5539-1B(LHF)` survived and `5539-1A(LHF)` did not, and both
   have parentheses. So if this is the cause the parse failure is positional,
   not per-value.
2. **The `product_models!inner(...)` embed.** An inner join drops a SKU whose
   model does not resolve. Measured as resolving in SQL — but SQL is not
   PostgREST, and the embed is the one thing SQL cannot reproduce.
3. **The engine's per-SKU allocation** in `computeNetRequirements`. `5539-1A(LHF)`
   is shared by three customer orders, which is the one property the dropped
   SKUs mostly share.

### How to find it in one step

Log the two reads in `loadToOrder` — `skus.length` in vs `skuRows.length` out,
and the set difference. If they differ, it is suspect 1 or 2 and the fix is to
chunk the `.in()` or replace it with an unfiltered read of the catalog. **Do
this before anything else.**

> ⚠ **`/today` — the OLD To Order cockpit — used the same query shape.** If this
> is the `.in()`, the bug is not new; it was invisible because that page could
> not create a purchase order. Check `purchase.ts` too.

---

## What is live right now

| | |
|---|---|
| Main commit | **`17625bd3`** (PR #524) + `50da8544` (button colour) |
| Web bundle | `index-Bv1-_bDA.js` · all four canonicals converged · `SERVICE_ROLE` 0 |
| API Worker | **`4f0cbebb`** · `api.carresofficial.com` · `/health` 200 |
| Migration | **none** |
| URL | **https://erp.carresofficial.com** → sidebar `Purchasing` → tab `To Order` |

**Real data written on 2026-07-30:** 7 purchase orders (`PO-2031` … `PO-2037`),
18 PO lines, 23 `ops_stock_items` at `incoming`, all destination `Carres Klang`.
`PO-2031`–`PO-2035` are Ohana sofa (one per customer order), `PO-2036` is the
Ohana bedframe merge, `PO-2037` the Nice Future mattress merge.

---

## What was built

**`packages/shared/src/to-order.ts`** — the whole projection, pure and tested
(31 tests). It owns every business rule; the page owns none.

- Nothing is stored. A proposal is recomputed on every read — no status, no
  hold, no audit, no lifecycle. Only a Purchase Order is a business object.
- **Qty counts sofas, not module lines.** PETER's one order holds two builds
  across five `order_lines`; the grid says 2.
- **Sofa is one document per customer order**; every other category merges the
  supplier's whole demand into one.
- **Summary = Model · Qty · at most ONE spec**, by a frozen priority (fabric →
  No Leg → non-default height). `Height 24"` never prints. No leg *height*
  prints — 4" and 6" both exist and nobody has said which is standard.
- **A dateless row sinks under every column, in both directions.**
- **Only mattress, bedframe and sofa enter, by a POSITIVE rule.**

**Stock Ready** is the engine's own `arriveBy`, promoted from a local variable
that was computed and thrown away. Order-by is measured back from it, so the
two can never disagree. There is no second date calculation.

**`apps/api/src/routes/operation/to-order.ts`** — `GET /` projects, `POST /issue`
writes through the existing **`operation_create_po`** RPC. No second write path,
no migration. The destination lands with a follow-up `UPDATE`, which
`trg_po_destination_guard` already permits while a PO has received nothing. The
route recomputes rather than trusting the client's rows. Price rides from the
catalog and is never asked for; an unpriced SKU writes 0.

**`fmtDate`** now reads `Tue, 20 May 26` — weekday first, so a date column lines
up. One helper, one spelling.

---

## The frozen dictionary (22 strings)

```
Navigation   To Order · Purchase Orders · Receiving · Claims · Settings
Left         Search… · Filter · {N} Purchase Order(s) · Order by {date}
Right        Order by · Destination · Customer · SO · Qty · Summary · Stock ready
Bottom       {N} Purchase Orders · Issue Purchase Order
Exception    Production Days Required · Set production days in Settings.
             No delivery date
After        {N} purchase orders issued to {supplier}
             Next: confirm the ready date in Purchase Orders · Open Purchase Orders
Empty        No purchase orders to issue.
Format       Tue, 20 May 26 · no relative dates · no price · no red
```

**Accent law:** blue appears on the primary button and nowhere else. Current
row, hover and the expanded row are grey. Measured on the running page: exactly
one element has a blue background.

---

## The open list, in the order Loo ruled it

### Ruled on 2026-07-30 and NOT yet built

1. **The right pane's header duplicates the sidebar.** `Ohana · Sofa` appears
   twice. → make it `Review`.
   *Watch:* the identity then leaves the pane holding an irreversible button.
2. **The success page is too empty.** → `✓ Purchase Order Created` / PO +
   supplier / `Next Step — Confirm Supplier Ready Date` / button.
3. **The count should serve the button** — `Issue 7 Purchase Orders`, not a
   number standing alone in the middle.
4. **`Search…` is decoration.** No input, no filter. Make it real.
5. **Auto-advance to the next supplier** after issuing.
6. **Column weight** — Customer and Summary are what a reviewer reads; SO and
   Qty should recede.

### Contradiction to settle before either is built

⑥ praises the in-row expand; ⑦ praises a right Drawer. **They are the same
surface twice.** Recommendation on file: keep the expand, give the Drawer to
Purchase Orders, which has enough to fill it.

### Blocking gaps

- 🔴 **The PO document has no screen.** `PoDocumentPreview.tsx` is orphaned —
  nothing imports it and `purchasing_po_document` has no caller. **A purchase
  order can be created and not sent.**
- 🔴 **`Confirm ready date` has no writer anywhere in the portal.** Nothing
  writes `purchase_orders.expected_ready_date`. The success panel points at
  Purchase Orders, and Purchase Orders cannot record it.
- 🟡 **The Receiving journey is undesigned** — `Issued → ? → Ready to Receive`.
  What turns a PO into "supplier ready", "waiting delivery", "ready to receive"
  is not decided.
- 🟡 **The grey-hover ratchet enforces the OPPOSITE of the accent law.** UI-KIT
  §3.5 says a row hovers blue. Baseline moved 94 → 96 and the reason is written
  into `scripts/check-design-standard.mjs`. §3.5 has to be rewritten.
- 🟡 **Every PO line costs 0** — 205 SKUs carry no cost. Ruled acceptable; fix
  in SKU Master, no To Order change needed.
- 🟡 **PO days are retired in the design and still live in the code** —
  `purchasing_settings.po_days`, `isPoDayMYT`, `nextPoDayMYT`,
  `/line/push-next`, the PO-day cron.
- 🟡 **Exclusion has no button.** `Exclude from Purchasing` /
  `Exclude Until Resolved` are designed and unbuilt; they belong to Orders.
- 🟡 Destination reads `HOUZS` in the database, `HOUZS Balakong` in the spec.

---

## Where Loo wants to go next

> *"如果我是你的 Product Architect，我现在不会再继续磨 To Order。我会 Freeze
> To Order，然后马上开始设计 Purchase Orders，因为真正复杂的业务才刚开始。"*

**Purchase Orders is the big module** — a PO lives there for weeks waiting on a
ready date, an ETA, a supplier delay, goods. To Order takes a minute.

**But To Order cannot be frozen while the defect at the top of this file is
open.** Fix that first; it under-orders customer goods in silence.

---

## Test baselines

| | |
|---|---|
| shared | 2009 / 2009 |
| api | 3 pre-existing (`partner/pickups` ×1 · `supplier/pos` ×2) |
| web | 16 pre-existing (`OperationOrders` ×7 · `OhanaSofaTab` ×4 · `OrderCustomerCard` ×4 · `NiceFutureMattressTab` ×1) |
| tsc | web clean · api 4 (`rental-sell.test.ts`) |

New coverage: 31 shared · 12 api · 14 web.
