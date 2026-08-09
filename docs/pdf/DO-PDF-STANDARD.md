# Delivery Order PDF Standard

**Status** — Law
**Owner** — Loo (approved 2026-08-09, reviewed on rendered PDFs alongside the SO)
**This is the ONLY copy.** Amend in place; the Change Log records every amendment.
Implementation: `apps/web/src/lib/pdf/do-template.tsx`.

**The chrome is NOT defined here.** Header, parties voice, ink bar, grey bands,
row pitches, type sizes, footer, fixed zones — ALL of it is
[`SO-PDF-STANDARD.md`](SO-PDF-STANDARD.md) (§2.1 measurement sheet + §8.5
conversion law), applied verbatim. This file holds only what the DO decides
for itself. A rule stated in both files is a defect.

## 1 · Mission

The DO is the signed proof of delivery: the crew's trip sheet on the way out,
the customer's acknowledgment on the way back. Quantity, identity, access —
never money.

## 2 · The DO's own rules

- **NO MONEY anywhere.** Quantity only — the same ruling 2990's owner made
  (2026-06-26) and the PO law lives by.
- **ONE DO PER TRIP** (mirrors the frozen purchasing bundle rule): mattress +
  bedframe travel as one DO; the sofa gets its own. The SPLIT is the API's job
  when cutting DOs; the template renders whatever one trip carries.
- **DELIVER TO leads** (the driver's page): Name · Address · Tel · **Emergency**
  — who the driver calls when the customer is unreachable (sales portal
  collects it; 32/77 filled at review time).
- **DELIVERY DETAILS**: `DO No · SO No · Delivery date · Logistic · Access`.
  Number labels say WHICH number — never "Doc No"/"SO Ref". No Issued date —
  the delivery date is the date this paper works by.
- **Items table**: `# · ITEM CODE · DESCRIPTION · UNIT ID · PO NO · QTY`.
  - **UNIT ID** = `ops_stock_items.unit_code` (0153) — the scannable per-unit
    ids, one per physical unit, stacked; the warehouse's loading checklist and
    the warranty trace. The column appears only when codes exist.
  - **PO NO** = the PO(s) that supplied the line (2990's Source PO picking
    aid — production holds the link; the earlier "no such data" claim was
    false and is recorded as such).
  - QTY right-inset 5mm; `—` for untraced cells; closing `TOTAL` row sums
    quantity only (no money to name it SUBTOTAL after).
  - 2990's m³ and Rack columns are NOT copied — no such Carres data.

## 3 · Sofa pages — one set per page

- Each sofa set renders on its OWN page: its table + its layout drawing
  (the PO law's one-set-per-page rule; 2 sets = 2 pages). Non-sofa lines
  share one table before the set pages.
- **A set is ONE numbered item** (Qty 1, `{set name} — 1 set · N modules`);
  the modules are grey sub-lines with their specs. Unit ids stack in the
  UNIT ID column in module order; module POs dedupe. The `#` counts what was
  SOLD; the sub-lines are what gets carried.
- The layout drawing is the PO's vector drawing verbatim: module boxes with
  the back strip, chaise deeper, module + fabric codes, TV facing marker.
  Caption: `Top view. Back at the top. TV in front.`

## 4 · Signing zone (bottom-anchored)

- **ONE dashed box — the customer's.** The driver box was tried and retired:
  Carres delivers through PARTNER logistics; their driver signing our paper
  attests nothing. Driver accountability lives in the portal (logistic
  assignment, delivery photos, timestamps). 2990's driver box came from its
  own fleet — its assumption, not ours.
- Caption inside the box, centred (`Customer Signature · {name}`) — a caption
  names the whole box; right-alignment belongs to money alone. A captured POD
  eSign (orders.pod_*) prints into the box.
- Beneath: `By signing above, the customer confirms receipt of the items
  listed in good order and condition.`
- Footer centre: `Computer-generated document · Signatures above are the
  delivery record.`

## Change Log

| Date | Change | Approved |
|---|---|---|
| 2026-08-09 | Initial law — DO joins the SO standard's chrome; quantity-only table with UNIT ID + PO NO; one DO per trip; one sofa set per page as ONE item with module sub-lines + drawing; single customer signature box (driver box retired). | Loo |
