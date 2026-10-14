# Handoff: Forecast Purchase · Outright

Owner-approved 13 Oct 2026. Build **Outright only**. Subscription is parked (business not started); its code path stays in the design file but is hidden.

## Overview
A weekly page in Purchasing → Buy → **Forecast Purchase**. It shows, per model and size, what sold recently, the free stock, and a **suggested** quantity for this Monday plus a forecast for the next 2 Mondays. The person decides what to order; the page never pushes ("Suggested / Forecast", never "Buy / To buy"). One review day a week: Monday.

## About the design files
The `.dc.html` files are **design references built in HTML** (they open directly in a browser with `support.js`). Recreate them in the Carres Portal codebase with its existing patterns — do not ship this HTML. `Carres Shell` and `Carres Table` mirror the Portal's shared shell and table; reuse the Portal's real equivalents and add the two new table options listed below.

## Fidelity
**High-fidelity.** Colours, type, sizes, widths, wording are final. Measure against the file at 1164 px (Summary open and closed) and run `carres-check.js` — it must print `PASS`.

## Screen: Forecast Purchase · Outright · By model (only view)

**Shell:** crumb `Purchasing`, title `Forecast Purchase`, menu item `Purchasing → BUY → Forecast Purchase` (under SO Batch Purchase). Tabs: `Suggested · Ordered · All` (default All). View menu: `By model · Outright` (one view).

**Table columns** (Carres Table, row 44–56, gap 10):

| Column | Width | Content |
|---|---|---|
| Model | minmax(120px,1fr) | 600 model name; grey line `{supplier} · {n} sizes`. Bedframes `1013 Jager · PC151-01`. Never cut. |
| Aug (2 months ago) | 32 right | sold pcs, grey `0` when none |
| Sep (last month) | 32 right | sold pcs |
| Oct (this month) | 36 right | sold so far, **600**; whole column has neutral band `#EEF0F3` (header, rows, opened items). Header = month only. |
| Free stock | 48 right | header 2 lines `Free` / `stock`; tip "Not reserved by any order (New, in the warehouse) + on PO not yet arrived. Reserved, Displayed and Exhibition are not counted" |
| This Monday | 56 right | header `12 Oct` over grey `Mon`; suggested pcs, 600 when > 0 |
| Next Monday | 56 right | `19 Oct` / `Mon`; forecast, grey text |
| Monday after | 56 right | `26 Oct` / `Mon`; forecast, grey text |

Dates follow the Copy Standard: `Fri, 16 Oct` (weekday, day, month) everywhere in text; table headers use the 2-line form.

**Opened row** (chevron): one line per size in fixed order Super King → King → Queen → Super Single → Single, same columns. Mattresses always show all 4 sizes (0 when not sold).

**Ticks:** a model tick selects all its sizes that have a suggestion; each size has its own tick. Rows/sizes that cannot be ordered show a **greyed checkbox** (45%, not-allowed) with the reason as tooltip: `Enough stock · nothing to buy` · `Already ordered` · `Supplier not set` · `Skipped this week`.

**Selection bar:** `{n} items selected · {pcs} · {n} PO` → `Create {n} PO` (Navy #1B1B39) → Review PO dialog (lines, `Back`, `Skip this week`, `Place {n} PO`). One PO per supplier + category. After Place: toast + Send PO step card task (Download PDF → WhatsApp/Email → Mark sent), same as SO Batch.

**Summary (left)** — two cards, nothing else:
1. `Weekly forecast` · meta `Mon, 12 Oct` · KPI `{total} pcs` label `Suggested` (not amber); rows `Mon, 19 Oct · n pcs`, `Mon, 26 Oct · n pcs` (forecast totals).
2. `BY SUPPLIER` · one row per supplier with this Monday's pcs (`Nice Future 31 pcs`, `Ohana 6 pcs`), tip = models.

**Footer:** `{n} models · in pcs · suggestion only, you decide`.

## Logic (Ops Rules · Forecast Purchase · Outright)
- **On the page:** Outright mattresses (Nice Future) + bedframe 1013 Jager PC151-01 (Ohana). **Excluded:** sofas, other bedframe models/colours (bought per SO in SO Batch), accessories (pillows, mattress protectors).
- **Supplier by product:** mattress = Nice Future; bedframe = Ohana; (for SO Batch) sofa TH = Todern, AM = Armani, DSL = Dorsettloft Sofa, HK/Hookka = Ohana. Missing → `Supplier not set`.
- **Sales:** per model + size by month of sale. Design data = `ops-sales.js` (from Carres_Master_Sample.xlsx Ops sheet, month = Import Date). Production = AutoCount export / Portal sales lines.
- **Free stock** = New units, not reserved, not out + Outright POs not yet arrived. Design data = `inv-stock.js` (6 Oct Inventory, column M Free + New + no Date out). Match by model code + size (+ bedframe colour), see `invKey()`.
- **Daily rate** = sold in the last 14 days ÷ 14.
- **Stock level** = rate × 14 days.
- **Suggested this Monday** = max(0, stock level − free stock), capped at rate × 7 (1 week of sales). The rest follows next Monday.
- **Forecast next 2 Mondays** = same rule, assuming sales continue at the daily rate and this Monday's suggestion arrives.
- **Review day = Monday.** Each Monday one task per supplier + category: title `Weekly forecast · {supplier}`, line 2 `{category} · suggested {n} pcs · you decide`, owner = today's **PO Duty** (Settings → Team → Duty), due that Monday, late from Tuesday. Quick action `Review PO`.
- **Skip this week** hides the sizes until next Monday.
- **Undo** within 15 min of Place. After that: `Cancel goods not received` on the PO (Purchasing MASTER §5.8.1).
- Outright SOs take this stock first; SO Batch only buys the shortfall.

## New shared table options (add to the Portal table)
- `sortDefault` — sort used only when the user has no saved sort.
- column `l2` — grey 12/400 second header line (dates).
- column `hl` — neutral column band (never the theme colour).
- `ckTip` (row) / `ck.tip` (item) — greyed disabled checkbox with reason tooltip.

## Design tokens (Carres)
Ink #1F2937 · secondary #4B5563 · grey text #6B7280 · faint #9CA3AF · border #E5E7EB · row line #F1F2F4 · column band #EEF0F3 · Navy button #1B1B39 (hover #2B2B55) · warn pill #FBF0D6 / #7A5A00 · ok pill #E7F6EC / #1E7A40 · neutral pill #E5E7EB / #374151. Inter; titles 15/500, table 13, grey lines 12; radius 8; rows 44–56; header 40.

## Open (not in this build)
- Who may press Place PO: only Jess, or PO Duty without approval? (owner to answer)
- Settings screen for the stock level per size (now system-worked only).
- AutoCount import for real monthly sales; real Free stock from the Portal's stock tables.
- Diglant / John Curtis supplier contacts.

## Files
- `Forecast Purchase.dc.html` — the page (Outright logic in `minMax()`, `rate()`, `sugKeep()`, `capOf()`).
- `Carres Shell.dc.html`, `Carres Table.dc.html` — shared shell and table (with the new options).
- `purchasing-data.js` (suppliers, PDF, SO data), `ops-sales.js` (sales), `inv-stock.js` (free stock + `invKey`), `carres-tasks.js` (PO Duty owner, `keep:` tasks), `carres-log.js`, `carres-theme.js`, `carres-check.js`, `support.js` (runs the .dc.html files).
