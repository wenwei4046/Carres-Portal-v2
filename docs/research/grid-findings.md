# GRID — FINDINGS

> **This file holds evidence, not decisions.** No architecture, no recommendation, no
> "we should". Those are produced by the next investigation, not inherited from this one.
>
> **Inherit the investigation. Never inherit the conclusion.** Every finding below is to be
> re-verified before it is used. If you cannot re-verify one, it is UNKNOWN again.
>
> **Line numbers rot.** Each finding carries the code fragment that proves it — grep the
> fragment, not the number. Sources: `C:\Users\User\OneDrive\Desktop\2990s` (a separate repo,
> not a dependency) and this repository. Measured 2026-08-07.

---

## Coverage of the reading behind this file

```
2990s  DataGrid.tsx              1,551 / 1,551   read end to end
2990s  DataGrid.module.css         515 / 515     read end to end
2990s  MfgSalesOrdersList.tsx    1,669 / 1,669   read end to end
2990s  Mrp.tsx                    ~1,100 / 1,452  ~76%
Carres OperationOrdersControl.tsx 5,150 / 5,150  read end to end
Carres kit/DataTable.tsx          1,193 / 1,193  props + docblocks read end to end;
                                                 the render body read structurally
Carres kit/GridToolbar.tsx           46 / 46     read end to end
Carres kit/grid-layout.ts        UNREAD (106)  · grid-powers.test.tsx UNREAD (712)
2990s  repo total                              253,898 lines — the rest UNREAD
```

> **The first version of this file did not name `apps/web/src/components/kit/DataTable.tsx`
> at all** — it studied another company's grid end to end while the grid this company already
> ships on six pages went unread. §4.5 is that reading. The correction is recorded because
> the omission, not any single number, is what a plan built on this file would have inherited.

---

# 1 · FINDINGS — 2990s DataGrid engine

**F1 · `autoFit` estimates from character count; it never measures the DOM.**
```js
// ~8.5px per character heuristic — good enough without measuring DOM.
const w = Math.max(60, Math.min(420, Math.round(max * 7.5 + 20)));
```
`DataGrid.tsx`, in the header context-menu actions.

**F2 · `Pin left` does not pin. It moves the key to the front of the order.**
```js
const orderNow = (l.order.length ? l.order : columns.map((c) => c.key)).filter((k) => k !== key);
orderNow.unshift(key);
```
Corroborating: `position: sticky` appears in `DataGrid.module.css` on `.thead` only. There is
no `left: 0` anywhere in its 515 lines. A pinned column scrolls away horizontally.

**F3 · `Layout.pinned` is a declared field with no writer.**
```ts
type Layout = { order: string[]; hidden: string[]; widths: Record<string, number>;
                groupBy: string[]; pinned: string[]; sort: {...} | null };
```
`pinLeft` writes `order`. Nothing writes `pinned`.

**F4 · Virtualization is switched off whenever row expansion is enabled.**
```js
const VIRTUAL_THRESHOLD = 25;
const canVirtualize = !isLoading && !embedded && groupedCount === 0
                      && !expandable && renderList.length > VIRTUAL_THRESHOLD;
```
The Sales Order list passes `expandable`, so it renders every row.

**F5 · The cause of F4 is structural: the expansion body is rendered outside the flat list.**
`renderList` is a flat indexed array of `{ kind: 'group' | 'row' }`. The expansion is appended
as an extra `<tr>` after the parent row, outside that array:
```jsx
{isExpanded && expandable && (
  <tr className={styles.tr} ...>
    <td colSpan={visibleColumns.length} ...>{expandable.renderExpansion(row)}</td>
  </tr>
)}
```
Index ↔ rendered row therefore stops being 1:1, and the virtualiser's `count` no longer matches
what is on screen.

**F6 · The virtualiser estimates 30px; the CSS row is 28px.**
```js
estimateSize: () => 30,
```
against `.td { height: 28px; }`.

**F7 · Layout is persisted to `localStorage` — per browser, not per user.**
```js
window.localStorage.setItem(key, JSON.stringify(layout));
```
One layout per `storageKey`, unnamed, not shareable. There is no layout manager.

**F8 · `memo` silently no-ops unless the caller passes a stable `columns` reference.**
The file says so itself: *"Pages calling `<DataGrid>` MUST pass a stable `columns` reference
(define at module scope or wrap in useMemo) for the memo to actually hit."*

**F9 · One column carries FIVE value accessors, and each exists for a measured reason.**
```ts
accessor      → ReactNode, what the cell draws
searchValue   → string; `coerceSearchString` returns '' for any ReactNode, so a cell that
                renders JSX is unsearchable without it
filterValue   → one clean value; searchValue deliberately bundles tokens
                ("SO-2605-001 CONFIRMED"), which makes every row its own distinct
                filter option
exportValue   → clean text; exporting searchValue produced duplicated cells
                ("Installment installment", doubled phone numbers)
groupValue    → stable key with an explicit blank ("(none)" / "(blank)")
```
The export fallback chain is `exportValue → filterValue → rendered text → groupValue`, and
`searchValue` is never exported.

**F10 · `defaultHidden` ships 21 columns visible of 42, ported from another ERP.**
Re-counted 2026-08-07 in `MfgSalesOrdersList.tsx`: the header grid declares **42** columns and
**21** carry `defaultHidden: true`. The drill-down grid is a separate set — **15** columns, **1**
hidden. *(The earlier "18 of 32" was wrong on both halves.)*
The attribution lives in `DataGrid.tsx`, not in the page:
```js
* Used to match Houzs "19 of 25 columns visible by default" semantics.
```
and a second spelling names a different pair:
```js
/* HOUZS port — when the persisted layout is pristine (no order +
   no hidden customisations yet) apply `defaultHidden: true` from the
   column spec so the grid starts with Houzs's 19-of-25 / 34-of-44
   visible-by-default semantics. */
```
Neither pair matches the 21-of-42 the file actually ships. **Three places handle the "pristine
layout" overlay this negative flag requires** — confirmed: the toggle, `effectiveHidden`, and the
Columns popover each recompute `columns.filter((c) => c.defaultHidden)` for themselves.

**F11 · The row context menu is resolved at open time, not per row up front.**
```ts
contextMenu?: (row: T) => DataGridContextMenuItem[];
```
The Sales Order page builds 11 items gated on `status`, `has_children`, `has_undelivered`.

**F12 · Five `filterType` values exist; `numbering` has exactly ONE behavioural use.**
```jsx
{(col?.filterType === 'numbering' || filterValues.length > 8) && ( ...type-to-find box... )}
```
**Nine columns declare it across eight page files** — re-counted 2026-08-07 by grepping
`filterType: '` over `pages/*.tsx`: `date` 60 · `number` 9 · `numbering` 9 · `enum` 3. Every
`numbering` column is a document-number column, and the labels are:
```
Note No.  ·  Return No. (×2)  ·  DO No.  ·  Transfer From (SO)
Invoice No.  ·  SO No.  ·  + ConsignmentOrders  ·  + MfgSalesOrdersList
```
Its distinct values are 1:1 with rows.

**F13 · The filter dropdown builds a Set over ALL rows every time it opens.**
```js
const set = new Set<string>();
for (const row of rows) set.add(filterColValue(c, row));
return [...set].sort(...)
```
On a document-number column at 1,567 rows this is a 1,567-entry list that can never narrow
anything.

**F14 · Empty primitive cells render an em dash, decided once in the grid.**
```jsx
{isEmpty ? (col.key.startsWith('__') ? null : '—') : content}
```

**F15 · Horizontal overflow is accepted and made grabbable, not avoided.**
```css
.table  { width: max-content; min-width: 100%; }
.scroll { overflow-x: scroll; }            /* scroll, not auto — always visible */
.scroll::-webkit-scrollbar { height: 12px; width: 12px; }
```

**F16 · Numeric columns switch to a mono family; text columns do not.**
```css
.tdAlignRight { text-align: right; font-family: var(--font-mono); }
```

**F17 · Measured density.**
```css
.td { padding: 4px 8px; height: 28px;
      border-right: 1px solid rgba(34, 31, 32, 0.04); }
.th { font-size: var(--fs-10, 10px); font-weight: 700; letter-spacing: 0.06em;
      text-transform: uppercase; padding: 6px 8px; }
.table { font-size: var(--fs-12); font-variant-numeric: tabular-nums; }
```
The file's own header states the target: *"Density target: ~28px row height, fs-12 body, fs-10
uppercase header."* `--fs-12` resolves to **11px** — see T3.

---

# 2 · FINDINGS — how a real page consumes it

**F18 · The page hands the grid its own toolbar and receives back the visible rows.**
`onFilteredRowsChange` feeds four KPI tiles (Total Orders · Revenue · Outstanding · Paid), so
narrowing a column filter re-scopes the headline numbers.

**F19 · The drill-down is the SAME component in `embedded` mode.**
It shares one `storageKey` (`so-drilldown-grid.v1`) across every expanded row, so a column
choice follows the operator into every document.

**F20 · Cost and margin sit on the sales list, default-hidden.**
`total_cost_centi` · `total_margin_centi` · `margin_pct_basis` on the header row; `Unit Cost` ·
`Line Cost` · `Margin` in the drill-down.

**F21 · The balance figure has a three-step fallback chain.**
```js
if (typeof r.balance_centi_live === 'number') return r.balance_centi_live;
if (typeof r.balance_centi === 'number') return r.balance_centi;
return r.local_total_centi - (r.paid_centi ?? 0);
```

**F22 · There is no owner, queue or next-action concept anywhere in the 1,669 lines.**

---

# 3 · FINDINGS — where the engine is not used

**F23 · `Mrp.tsx` does not import `DataGrid` at all, and the shape explains why.**
```
three levels, and the depth changes per tab
  sofa      grouped by SO          (groupBySo)
  bedframe  flattened to variant   (groupByVariant)
  mattress  grouped by model       (groupByModel)
checkboxes live on the LEAF (soItemId); parent rows are all/indeterminate/none
an editable <select> lives inside a leaf cell (per-line supplier)
parent totals are recomputed from date-filtered children
```
`expandable` offers one level; `selectable` is a flat set of row keys; nothing aggregates
filtered children.

**F24 · The four MRP numbers, verbatim.**
```jsx
<th className={styles.num}>Qty Needed</th>
<th className={styles.num}>Stock</th>
<th className={styles.num}>PO Outstanding</th>
<th className={styles.num}>Shortage</th>
```

**F25 · Repo-wide use of the component.**
```
105 pages total
 51 import DataGrid
 46 hand-write <table>          of which 20 ALSO import DataGrid
                                the rest are mostly Detail / form pages
```

**F26 · Neither repo has a table library, and only ONE of them has a virtualiser.**
Re-measured 2026-08-07, `grep -rn "tanstack" --include=package.json`:
```
2990s  apps/backend   @tanstack/react-query ^5.62.11   @tanstack/react-virtual ^3.14.2
2990s  apps/pos       @tanstack/react-query ^5.62.11
Carres apps/web       @tanstack/react-query ^5.59.16   ← and NOTHING else
```
`@tanstack/react-table`, `ag-grid`, `react-data-grid` and `handsontable` grep **0** in both.
**Carres has no virtualiser of any kind installed** — the earlier "Carres: neither" said only
that it has no table package and read as if the two repos were equally equipped.

---

# 4 · FINDINGS — Carres, measured 2026-08-07

```
orders, not cancelled            77      (autocount archive 37 · live 40)
stage tabs as rendered           All 77 · Placed 38 · Proceed 0 · To book 39
                                 · Customer confirmed 0 · Delivered 0
delivery_partner_id set          0 / 77
booking confirmed · slot         0 · 0
delivery photos · order_payments 0 · 0
line_etas with a value           3
customer_name non-ASCII          0 / 77
live orders with a real PO       19 / 40      with none: 21
sofa on a live order  catalog    12           lineCategory regex finds  1
distinct PICs holding all rows   2            (rows with a PIC: 75)
outstanding                      RM 78,137 across 28 orders
```

**F27 · `Proceed` is unreachable once the free-stock map loads.**
```js
if (availableBySku) {
  return bookingConfirmedOf(o) ? "scheduled" : "pending";   // returns before "proceed"
}
```

**F28 · The Orders list has no sorting, grouping, row expansion or row menu.**
5,150 lines; `<Th>` is a plain `<th>`; the only ordering is `compareBySlack`.

**F29 · `stockWindowDays` is hard-coded while the real numbers are settings.**
```js
stockWindowDays: hasMsbf ? 7 : hasSofa ? 5 : 7,
```
Purchasing's own production values are 7 · 7 · 14 and manager-editable. Both the settings hook
and the catalog map are already in that component's memory, unread by the engine.

**F30 · One grey fails WCAG AA on white; the other passes with less margin than was claimed.**
Recomputed 2026-08-07 from the sRGB relative-luminance formula.
```
#A8A8A8  on #FFFFFF   2.38 : 1     FAILS (AA body text needs 4.5)
#6B7280  on #FFFFFF   4.83 : 1     passes        (earlier stated 5.1 : 1 — wrong)
```
Both are hard-coded in `OperationOrdersControl.tsx`:
```jsx
<span className="tabular-nums" style={{ fontSize: "12px", color: "#A8A8A8" }}>
<span className="text-label font-medium" style={{ color: "#A8A8A8" }}>TBD</span>
: { bg: "#F3F4F6", fg: "#6B7280" }; // 7d+ — neutral grey
```

**F31 · `OrderDetailDrawer.tsx` is 7,576 lines.** The list returns it in place of itself
rather than navigating, so the detail surface cannot become its own route without changing that.
```
import OrderDetailDrawer from "./components/OrderDetailDrawer";   OperationOrdersControl.tsx:36
<OrderDetailDrawer                                               OperationOrdersControl.tsx:2600
```

---

# 4.5 · FINDINGS — the grid Carres already ships, measured 2026-08-07

> **This section did not exist in the first version of this file.** Everything in §1–§3 is
> another company's engine; everything here is ours.

**F32 · Carres owns a grid engine: `apps/web/src/components/kit/DataTable.tsx`, 1,193 lines.**
Its own opening line states its provenance:
```js
 * DataTable — the ONE list table (UI-KIT §7, card D0.5c).
 * **Extracted from the Orders table, not designed fresh** — §7 says so by name,
```

**F33 · SEVEN files render through it, and every one of them is Purchasing.**
`grep -arln "kit/DataTable"` (note `-a` — see TRAPS):
```
pages/dev/UiShowcase.tsx
pages/operation/CreatePurchaseDialog.tsx
pages/operation/OperationPurchaseOrders.tsx
pages/operation/OperationPurchasingReport.tsx
pages/operation/OperationReceiving.tsx
pages/operation/OperationSupplierClaims.tsx
pages/operation/OperationToOrder.tsx
```
**No Sales / Orders file is on the list.**

**F34 · Which powers each page has actually wired, counted by grepping the props it passes.**
```
OperationToOrder          selection group expansion totals sizing rowLate rowMuted onSortChange
OperationPurchaseOrders   expansion layout rowMuted onSortChange
OperationPurchasingReport expansion totals
OperationSupplierClaims   expansion sizing onSortChange
OperationReceiving        onSortChange
```
`layout` (resize + reorder) is wired on exactly ONE page. `group` on exactly one.

**F35 · The kit table does NOT own sorting, filtering, searching or exporting. The PAGE does.**
```js
/** The active sort. The PAGE sorts the rows; the kit only shows the arrow. */
sort?: TableSort | null;
```
```js
 * popover — a value checklist with an optional search — and NOTHING more: the
 * page owns which rows survive, exactly as it owns formatting.
```
`export`, `xlsx` and `csv` grep **0** in the file. There is no global search prop; search lives
in `GridToolbar`, which passes it straight to the page. **This is the opposite division of
labour from §1's engine, where `DataGrid` owns sort, filter, search, group and XLSX export.**

**F36 · The kit table has NO column show/hide, no `Columns` popover and no auto-fit.**
`defaultHidden`, `hidden`, `visibleColumns` and `autoFit` all grep 0. `Column<Row>` carries
exactly: `key · label · width · align · numeric · headerTitle · sortable · filter · cell` —
**one value accessor**, against §1 F9's five.

**F37 · The row height is 40px in the component and it is a LOCKED TOKEN, not a choice.**
```jsx
className="w-full table-fixed border-separate border-spacing-0 text-body
           [&_td]:h-10 [&_td]:overflow-hidden [&_td]:whitespace-nowrap [&_td]:align-middle"
```
`docs/01-design-tokens.md`:
```
| **row-compact** | **40 — the portal's table row** |
**Rows are 40px FIXED and content adapts to the row, never the reverse.**
```
`docs/02-components.md`: *"Rows are 40px fixed. Content adapts to the row."*
**2990s' 28px (§1 F17) and Carres' 40px are not the same decision made twice — they are two
different locked numbers, and one of them is locked by this company's own token file.**

**F38 · Layout memory is REFUSED BY LAW in Carres, so §1 F7 is not portable.**
```js
 * **Layout MEMORY is deliberately absent, and it is the finding this card
 * carries.** §0.4 rules that *"the UI, the workflow and the
 * navigation … no per-user store of UI shape"*, and guard rule L enforces it.
```
`docs/ui/MASTER.md` §4: *"There is no `storageKey` anywhere … **A reload is the reset.**"*
and §7 lists **Layout memory — REFUSED, not deferred**, naming it as the owner's call.

**F39 · The kit table has no virtualisation of any kind.** `virtual` greps 0 in
`DataTable.tsx`, and F26 shows no virtualiser is installed in the repository. Its expansion
comment states the height rule the 2990s engine could not hold:
```js
 * The expanded cell is the ONE cell in this table that may be taller than
 * 40px and may wrap: it is not a row of the list, it is the record. The
 * 40px law binds the rows you scan, or nothing could ever open.
```

**F40 · The one page with the most rows renders through NO grid at all.**
`OperationOrdersControl.tsx` is 5,150 lines and the combined count of
`onSortChange` + `expansion` + `groupBy` + `contextMenu` in it is **0** (corroborates F28).
`Th` is a hand-written `<th>` with inline `style`:
```jsx
      className={`px-2 py-1.5 font-semibold uppercase ${center ? "text-center" : "text-left"}`}
      /* v4 header: DARK 12/600 cool ink (warm #4A4335 retired). */
      style={{ color: "#374151", fontSize: "12px", letterSpacing: "0.04em" }}
```

**F41 · Live row volumes, both target pages, measured by SQL 2026-08-07.**
```sql
orders (none cancelled)     77      autocount 37 · live 40
order_lines                184
ops_order_control           75
purchase_demands             4      (Purchasing MASTER §1 still says 2 — stale)
purchase_orders             24      purchase_order_lines 38
ops_stock_items            135
```
**Neither page renders more than about 130 rows today.** Every row is TEST data
(`CLAUDE.md` §6), so these are evidence about what the code does, never about volume.

**F42 · Two `WHAT IS ON SCREEN TODAY` line counts are stale.**
`wc -l`, 2026-08-07: `OperationOrdersControl.tsx` **5,150** (Orders MASTER §3 says 5,121) ·
`OrderDetailDrawer.tsx` **7,576** (Orders MASTER §4 says 7,717) ·
`OperationToOrder.tsx` **2,501**.

---

# 5 · REJECTED — claims made during this investigation and disproved

| Claim | Verdict | What the measurement said |
|---|---|---|
| "2990s has no Best Fit" | **FALSE** | `autoFit` exists — see F1. It estimates rather than measures, which is a different criticism |
| "46 2990s pages bypass their own DataGrid" | **FALSE** | 20 of the 46 also import it; ~26 are Detail/form pages where a layout table is correct — F25 |
| "Carres customer names are mixed Chinese and Latin" | **FALSE** | 0 of 77 carry a non-ASCII byte. A `cjkClassName` helper is applied to every name and nothing triggers it |
| "TanStack + react-virtual solves expanded-tree virtualisation" | **NOT VERIFIED** | The package is installed in neither repo and its source was never read — F26 |
| "The portal has no module menu on a working page" | **FALSE** | `PortalSidebar` is mounted unconditionally on every operation screen and carries both Orders and Purchasing; only `GlobalTopBar` is suppressed |
| "2990s' MRP four-number row" (as first stated) | **SECOND-HAND** | Originally quoted from Carres' own Purchasing MASTER. Later confirmed first-hand — F24 |
| "Carres has no grid engine" (implied by this file's own silence) | **FALSE** | `kit/DataTable.tsx` is 1,193 lines and SEVEN files render through it — F32 · F33. The first version of this file never named it |
| "`defaultHidden` ships 18 of 32" | **FALSE** | 21 of 42 on the header grid, 1 of 15 on the drill-down — F10 |
| "`#6B7280` measures 5.1 : 1" | **FALSE** | 4.83 : 1. It still passes AA, so the conclusion held while the number did not — F30 |
| "`OperationSupplierClaims.tsx` does not use the kit table" | **FALSE** | It imports it at line 23 and wires `expansion` + `sizing` + `onSortChange`. Plain `grep` returned nothing; `grep -a` returned six hits. **The NUL trap was documented in this very file and still caught this investigation** |

**Re-open condition for every row above:** a first-hand reading of the current source that
contradicts it.

---

# 6 · UNKNOWN

- Whether any engine — TanStack, AG Grid, or something written here — sustains **expansion plus
  virtualisation** at a 28px row over 500–1,500 rows. **Never measured in a browser by anyone.**
- Whether 2990s' 1,567-row Sales Order list is genuinely un-virtualised in practice. F4 and F5
  are read from source; the render was never observed.
- Row height for Carres. **The token is 40 and it is LOCKED (F37)**, so the live question is
  40 vs 28, not 28 vs 24, and it is the owner's — token values are not a build card's to move.
  Nobody has put three operators in front of both.
- **How many Sales Orders exist at once after go-live.** Today's 77 rows are TEST data
  (`CLAUDE.md` §6) and cannot answer it. **Nothing about virtualisation can be settled until
  this is a number**, and it is a business fact, not a measurement.
- Whether the five value accessors (F9) are the right shape for Carres, or whether fewer
  express the same five jobs. Carres' own column carries ONE (F36) and has not yet needed more.
- Whether `kit/DataTable`'s expansion holds up when the expanded body is large. Claims already
  renders a 712-line panel inside it (Purchasing MASTER §6); **never measured on screen.**
- `kit/grid-layout.ts` (106) and `kit/grid-powers.test.tsx` (712) — not read.
- `Mrp.tsx` ~350 lines unread (toolbar and summary region).
- `SalesOrderDetail.tsx` 3,699 lines — never opened.
- The other ~100 pages of 2990s — never opened.

---

# 7 · TRAPS

- **Line numbers rot.** Grep the code fragment in each finding, not the number.
- **`--fs-12` in 2990s is 11px.** Its type scale is remapped (`main.css`); variable names there
  do not match their values. Do not copy a number by its name.
  ```css
  --fs-11: 11px;   --fs-12: 11px;   --fs-13: 12px;   --fs-14: 13px;
  ```
  **And `--fs-10` is not declared at all**, so `font-size: var(--fs-10, 10px)` in the grid header
  renders the literal fallback. A reader chasing the variable finds nothing and concludes the
  header is unstyled.
- **A finding's own trap does not protect the next reading of it.** The NUL-byte trap below was
  already written in this file, and the 2026-08-07 pass still recorded a false claim about
  `OperationSupplierClaims.tsx` from a plain `grep`. **Put `-a` in the command, not in a note.**
- **Reading another company's engine end to end is not coverage.** The first version of this
  file read 3,735 lines of 2990s and did not open the 1,193-line grid this company ships. A
  coverage table can be complete about the wrong repository.
- **`OperationSupplierClaims.tsx` holds a NUL byte** (a deliberate sort-key separator). Shell
  `grep` treats the whole file as binary and returns nothing without `-a`. Node's
  `readFileSync(…, "utf8")` is unaffected.
- **A blank `On PO` column on Carres' To Order is correct, not a defect.** The pool drains
  earliest-deadline first, so at most one line per SKU can ever be partly covered.
- **`grep` cannot inventory a page.** It answers only "is the word I already thought of
  present". Four false claims in the Rejected table above came from grepping instead of reading.
- **A Study Receipt does not prove the conclusions came from the reading.** One was produced at
  the start of this investigation and four false claims followed it.
