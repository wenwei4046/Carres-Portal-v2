# Sales Order Maintenance — AutoCount-style configurable SO grid

> Plan owner: Claude (for Loo). Started 2026-06-16. Worktree branch `worktree-feat+sales-order-maintenance`.

## 1. What & why

Loo wants an **AutoCount-style Sales Order grid** in the portal (reference = AutoCount SO listing screenshot:
resizable columns, per-column filter funnels, a `Columns N/M` show/hide picker, row search).

Clarified scope (2026-06-16 Q&A with Loo):

- **NOT** an editor for historical orders. Rows are **read-only**.
- The "maintenance / amendment" is over the **column format + options**: which columns show, their order /
  width, and the curated option lists for dropdown-type columns. This config is **persisted server-side and
  shared for all internal users** ("link for all amendment" = one shared config).
- Grid granularity = **one row per order_line** (order header fields repeated per line), matching AutoCount
  where Item Code / Qty / Unit Price are line-level.
- v1 surface = the **Operation** module (operation + principal). Catalog SKU table upgrade deferred (Loo: "只先做 SO 页").

## 2. Column catalog (~46)

Defined statically in `packages/shared/src/schemas/sales-order-maintenance.ts` as `SO_GRID_COLUMNS`. The DB only
stores per-column overrides (visible/order/width) + option lists — the catalog universe lives in code.

Groups: Order · Customer · Item(line) · Delivery · Payment · Operation · Meta.
Sources: `order` (header, repeated per line) · `line` · `resolved` (joined name: dealer/agent/product/item group/
location/partner). ~18–20 visible by default; the rest are opt-in via the column picker.

Column types: `text · number · money · date · datetime · bool · option`. `option` columns carry a curatable
value list (stored in config.options[key]) used as the filter dropdown / future data-entry choices — this never
mutates any DB enum (safe).

## 3. Layers / files

### shared (`packages/shared/src`)
- NEW `schemas/sales-order-maintenance.ts` — `SO_GRID_COLUMNS` catalog + zod: `soGridColumnConfigSchema`,
  `soGridConfigSchema`, `soGridRowSchema` (scalar catchall), `soGridResponseSchema`, `updateSoGridConfigSchema`.
- `index.ts` — barrel-export the new schemas + inferred types.

### DB — migration `0174_sales_order_grid_config.sql`
- Single-row table `public.sales_order_grid_config (id bool pk default true check(id), columns jsonb, options jsonb,
  updated_at, updated_by)`. Seed the singleton row.
- RLS: SELECT to internal roles via `(select public.app_role())` InitPlan-wrapped; revoke direct write.
- SECURITY DEFINER `set_sales_order_grid_config(p_columns jsonb, p_options jsonb)` RPC for the write (STABLE not
  applicable — it's volatile; mark `language sql security definer` + grant execute to authenticated, role-check inside).
- Copies the safe pattern from `0083_user_nav_seen.sql`.

### API (`apps/api/src/routes/operation/sales-order-maintenance.ts`)
- `requireOperationOrPrincipal` guard.
- `GET /grid` — fetch orders + nested `order_lines`, batch-enrich (dealer / salesperson / outlet / warehouse /
  delivery_partner names + sku→product_models for product name + item group), flatten to one row per line keyed by
  column key. Returns `{ rows, config, generatedAt }`. Pattern from `orders-feed.ts:44-106`.
- `GET /config` — read the singleton config (seeded defaults from `SO_GRID_COLUMNS` if a column is missing).
- `PUT /config` — validate with `updateSoGridConfigSchema`, call `set_sales_order_grid_config` RPC.
- Mount in `apps/api/src/index.ts` at `/operation/sales-order-maintenance`.

### web (`apps/web/src`)
- NEW `components/data-grid/DataGrid.tsx` — reusable, headless-ish, hand-rolled (no new dep):
  resizable columns (pointer-drag on header border → width state), per-column filter popover (text contains /
  multi-select for option / number+date range), `Columns N/M` visibility picker, global row search, sticky header,
  row cap with "refine" message (like SkuMaster). CSS Grid w/ dynamic `gridTemplateColumns`.
- NEW `pages/operation/SalesOrderMaintenancePage.tsx` — page header (kicker + t-h1) + the DataGrid wired to the
  grid query + a "Column Settings" modal (reorder / rename label / maintain option lists) that PUTs config.
- `lib/queries.ts` — add `qk.salesOrderGrid` namespace + `useSalesOrderGrid()` + `useUpdateSoGridConfig()`.
- `pages/operation/OperationApp.tsx` — tab-state render `{tab === "sales-order-maintenance" && <…/>}`.
- `pages/operation/OperationSidebar.tsx` — add a `SECTIONS` entry (lucide icon, e.g. `ClipboardList`).

### tests
- shared: catalog invariants (unique keys, every option col has a label) + zod round-trip.
- api: `sales-order-maintenance.test.ts` (msw) — grid flatten shape, config get/put, role guard 403.
- web: `DataGrid` render + column-visibility toggle + filter; `SalesOrderMaintenancePage` render.

## 4. Approval / deploy gates

- **Migration 0174 apply to live DB (staging=prod) needs Loo's explicit OK** (CLAUDE.md §7). Write the file now,
  apply later.
- Deploy (api `wrangler deploy` + web build/deploy) is manual — after Loo OK + green tests.

## 5b. Build status (2026-06-16)

All layers built in the worktree. Verified:
- **typecheck**: shared + api + web all clean (`pnpm -r typecheck`).
- **tests**: shared 206/206 · api 741/744 · web 544/549. The 3 api + 5 web failures are the
  documented pre-existing ones (§17.7: supplier/pos + partner/pickups; OhanaSofaTab + NiceFutureMattressTab).
  **Zero new regressions.** New tests: shared 13 + api 9 + web 9 = 31, all green.

Files: shared schema + barrel · migration 0174 (FILE only) · API router + index mount · DataGrid component +
SalesOrderColumnSettings + SalesOrderMaintenancePage · queries hooks/qk · OperationApp tab + OperationSidebar nav ·
3 test files.

**Pending (need Loo OK):**
1. Apply migration 0174 to live DB (staging=prod) — CLAUDE.md §7.
2. Commit branch + PR.
3. Deploy: api `wrangler deploy` + web build/deploy. Then live smoke (the /grid endpoint reads
   `sales_order_grid_config`, so it needs the migration applied first).

## 5. Risk notes

- Zero cascade risk: rows read-only; only a new isolated config table is added; orders schema untouched.
- `option` lists are display/filter-only — never alter DB enums.
- Perf: 158 orders / ~575 lines — well within the orders-feed precedent; row cap guards DOM bloat.
