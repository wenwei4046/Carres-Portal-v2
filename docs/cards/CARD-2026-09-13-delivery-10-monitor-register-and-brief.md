# DELIVERY — CARD 10 · Monitor register and expanded delivery brief

> Module **DELIVERY** · Card **10** · authored 2026-09-13 under the BUILD/DELIVERY takeover of the
> owner-approved Delivery Blueprint (PR #1255, #1256). Steps use checkbox syntax for tracking.

**Goal:** Build the approved 12-column Monitor register on 72px two-line rows with the four-panel expanded delivery brief, the colour and icon law, the required-Sales-facts problem line and the chooser set.

**Authority:** `docs/delivery/MASTER.md` §8.2, §8.3, §8.5 · `docs/ui/MASTER.md` §4.1, §5, §6.5, §6.7 · `docs/COPY-STANDARD.md` Monitor register words · `docs/orders/MASTER.md` cross-module date contract · `docs/stock/MASTER.md` §3.5.1 reconciliation. The approved MASTER decides the design; this Card adds no design of its own.

**Dependencies:** Card 09.

**Runtime readers and writers affected:** Readers: `OperationDelivery.tsx`, `delivery-work.ts`, `delivery-monitor.ts`, `register/DataGrid`, `GoodsMiniTable`, `Panel`, `useSalesOrderExpansion`, `orderMoney`, `deliveryStockReadinessOf`, `deliveryArrivalStateOf`, `tripLinesOf`, `unitIdOf`, `requestedDeliveryOf`. Writers: none (read-only card).

**Migrations required:** none.

**Production acceptance surface:** Production Monitor at 1440, 949 and 390px: the twelve headings in order, 72px rows, pinned `SO No` and `Customer`, the four panels with the ruled grids and words, `Paid` / `Do not deliver` / `Collect RM` cells from the one money rule, orange and red text with no icons inside status facts, `Order details incomplete` on a legacy row.

## Global constraints

- Reuse existing Carres components, arithmetics and write doors; no duplicate quantity, owner, duty, date, payment or stock truth.
- Every visible word comes from `docs/COPY-STANDARD.md`; dates through `fmtDate`; no em dash joins a Delivery Work sentence.
- No `New DO`, `Issue`, `Release` or `Approve` control; no new payment exception or COD door; no Delivery-local roster; no Operations Superuser fallback.
- Loading, error, empty and no-results states, keyboard and focus, responsive behaviour, permissions and proxy-recording boundaries are tested.
- A Card is complete only after PR merge, exact-SHA deployment and authenticated production verification with the resulting records re-read.

## Tasks

- [x] Column definitions and cell renderers for the twelve columns; storage key `workList.v5`
- [x] 72px parent row as the page exception on the shared engine; sticky identity list
- [x] The four panels on kit `Panel` with the connector; panel 1 two columns collapsing; panel 4 grid with Source, Status, Location
- [x] Chooser columns; retire `Actions` and `Edit Delivery` columns
- [x] Tests: columns, rows, panels, colour words, no icons, legacy problem line, responsive; typecheck; design guard
- [x] PR → merge → deploy → authenticated production verification

**Evidence (2026-09-13):** PR #1263 squash-merged as `81bb905b`; Pages `/__carres_deploy.json` and Worker `/health` both report `81bb905b`. Authenticated as operation@carres.com on Monitor `Work to do` (89 rows): the grid reports `data-row-height="72"` and the first cell measures 72px; the status column prints the §8.4 words on real rows (`Operation must assign logistics` ×6 · `{partner} must contact the customer` ×34 · `Order details incomplete` ×48 legacy rows · `Overdue` ×2 · `Failed Delivery` ×1); `Confirmed Delivery` prints `Not confirmed` ×88; `Payment` prints `Paid` ×48 and `Do not deliver` ×41 from the one money rule; `Items & Stock` prints `Not ready` ×89; `DO No` prints `No delivery order yet` ×89. The ten headings read back in order (`Delivery Status` · `SO No` · `Customer` · `Delivery Location` · `Requested Delivery Date` · `Confirmed Delivery` · `Logistics` · `Items & Stock` · `Payment` · `DO No`); the ▸ chevron opened the brief's four panels (`Customer, Address & Access` · `Delivery Dates` · `Logistics Details` · `Items, Services & Stock`) with the `Item · Qty · Source · Status · Location` grid.
