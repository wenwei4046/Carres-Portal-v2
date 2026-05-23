# Supplier "Incoming" forecast — fix category derivation for Place-status orders

> Spec date: 2026-05-24 · Phase 10 · author: Claude + Loo
> Status: **draft for review**
> Migrations: **0148** (forecast category fix) + **0149** (Ohana → HoOKkA rename)

---

## 0. 结论 (TL;DR)

供应商的 **Incoming forecast** 看不到任何单——不是权限问题，是 **category 算不出来**。

`supplier_pending_demand` RPC 靠 `split_part(sku, ':', 1)` 取 category，这假设 SKU 是 `category:model:variant` 格式。但现在 DB 里 115 张 `status='place'` 的单全是 AutoCount 导入的自由文字 SKU（`Breeze FirmCare-B1201F-K`、`1013Jager/Fab3-King/COL:PC151-02`），切出来全是垃圾，配不上任何供应商的 `cat_covered` → forecast 永远空。

**修法（外科手术式）**：把 category 的来源换成一个分层 resolver——原生 Portal 单走 catalog join（精准），AutoCount 历史单走 Item Group / 关键字兜底。Forecast 与 Commit 两个 bucket 都用它。生命周期逻辑（Forecast → Commit → 0）本来就对，不动。外加把误植的供应商名 `Ohana` 改回 `HoOKkA`。

**不动 schema、不碰冻结 migration。**

---

## 1. Background & root cause

### 1.1 The two-bucket lifecycle (already correct, do not change)

Supplier visibility of demand has two buckets, and demand flows through three states:

```
   placed / proceeded, no PO yet          PO issued (thread.po_id set)        PO delivered
┌──────────────────────────────┐      ┌──────────────────────────────┐    ┌──────────┐
│   INCOMING FORECAST (pending) │  →   │   COMMIT (open PO lines)      │ →  │   gone(0)│
└──────────────────────────────┘      └──────────────────────────────┘    └──────────┘
```

- **Forecast (pending)** = order lines on active orders (`status NOT IN ('delivered','cancelled')`) whose per-line thread has **no `po_id`** yet.
- **Commit** = `purchase_order_lines` whose PO `sup_status` is still *open* (`pending … shipped`, excludes `delivered`).
- A line leaves Forecast and enters Commit the moment Operation issues a PO (sets `order_supplier_threads.po_id`). It leaves Commit (→ 0) when the PO is marked `delivered`.

This matches Loo's worked example: 10 in Forecast → issue PO → 10 in Commit → deliver → 0. **The transitions already work in the live DB.** The current `SupplierIncoming` page already renders both buckets (`Total demand = Committed + Pending`).

### 1.2 The actual bug — category derivation

`supplier_pending_demand` (migration 0078, live def) groups + filters category by:

```sql
where split_part(ol.sku, ':', 1) = ANY (v_cat_covered)
```

This assumes the legacy proto SKU shape `category:model:variant`. It is wrong for **every** SKU now in the system:

- **AutoCount legacy orders** (the 115 current `place` rows): free-text SKUs, no category prefix. `split_part` returns garbage. **0/123 distinct placed SKUs** resolve in `product_skus`.
- **Native Portal orders (going forward)**: store the **canonical catalog Item Code** (e.g. `MS01-B1201F-K`, `BF04-1007/Cody/Fab3-Q`). Also has no `:` prefix — `split_part` returns the whole string. (Verified via `create_order` 0089's category-mutex, which joins `order_lines.sku → product_skus → product_models.category`.)

Net effect: `split_part(...) = ANY('{mattress}')` never matches → **every supplier's forecast is empty**, regardless of data.

### 1.3 Supporting findings (live DB, 2026-05-24)

- Orders by status: `place`=115, `proceed_order`=4, `cancelled`=1. One `purchase_orders` row exists at `sup_status='pending'` (a live Commit-bucket test case).
- Suppliers with `cat_covered` set: **Nice Future** = `{mattress}`, **Ohana** (= HoOKkA, see §4) = `{bedframe,sofa}`. The other 8 are empty `{}` (out of scope — see §5).
- `product_models.category` is an enum: `mattress | bedframe | sofa`.
- AutoCount import preserved `Item Group` per line in `ops_imported_orders.items[]` (`Mattress / Bed Fram / Sofa / Pillow / M.P / Service`), consistent per description (zero conflicts), but only covers ~66% of current placed SKUs (staging holds one batch; placed orders span more).
- **Full SKU normalization is infeasible** for bedframe/sofa and explicitly **out of scope**: order descriptions and the master catalog use different naming schemes (order `1013Jager/Fab3-King` vs catalog `Jager LSD013/NB01(Beige)-K`; sofa seater-configs + colour suffixes don't exact-match). Mattress + accessories *do* exact-match, but the forecast only needs **category**, not the canonical SKU.

### 1.4 Classifier validation (live placed orders)

A layered category resolver (catalog join → Item Group → keyword) run over the 115 placed orders:

| category | lines | units |
|---|---|---|
| mattress | 80 | 91 |
| sofa | 63 | 64 |
| bedframe | 34 | 36 |
| (unclassified) | 116 | 215 |

Every "unclassified" line is a genuine **accessory/service** (8 distinct: Memory Pillow, Mattress Protector ×2, 3× Disposal, Transport Fees, No Lift Charge) → correctly `NULL`, correctly excluded. **100% accuracy on core furniture, zero misclassified.** Resulting forecast: Nice Future sees ~91 mattress units; HoOKkA sees ~100 bedframe+sofa units.

---

## 2. Goals

1. **Going forward (primary):** any native Sales Order that enters `status='place'` immediately appears in the Incoming forecast of every supplier whose `cat_covered` includes the line's category. Category derived **exactly** from the catalog.
2. **Legacy:** the 115 AutoCount placed orders also appear, category derived best-effort (Item Group + keyword).
3. **Lifecycle preserved:** POed lines drop out of Forecast into Commit; delivered POs drop to 0. (No change — just don't break it.)
4. **Data correction:** rename supplier `Ohana` → `HoOKkA` to match the rest of the system.

## 3. Non-goals (explicit scope cut)

- ❌ Full AutoCount SKU → canonical Item Code normalization (separate future project; needs human mapping for bedframe/sofa).
- ❌ Downstream proceed → supplier-thread category split fix (this spec only touches the supplier *forecast* read path).
- ❌ Logistics-partner pre-proceed forecast (proto has none; supplier-only per Loo).
- ❌ Populating `cat_covered` for the other 8 suppliers (mechanism is general; data is Loo's to add later).
- ❌ Any schema change or edit to frozen migrations.

---

## 4. Design

### 4.1 `resolve_demand_category(p_sku text) → text` (new, shared)

`language sql stable security definer`, `search_path = public, pg_temp`. Returns `'mattress' | 'bedframe' | 'sofa' | NULL`. Layered, best-signal-first:

1. **Native / canonical catalog (exact):**
   `SELECT pm.category::text FROM product_skus ps JOIN product_models pm ON pm.id = ps.model_id WHERE ps.sku = p_sku LIMIT 1`.
   This is the going-forward path; native order lines always hit it.
2. **AutoCount `Item Group` (legacy authoritative):** look up `p_sku` against `ops_imported_orders.items[].description` (normalized `lower(trim())`); map `Mattress→mattress`, `Bed Fram→bedframe`, `Sofa→sofa`; ignore `Pillow/M.P/Service`.
3. **Keyword classifier (legacy fallback):** regex on `lower(p_sku)`:
   - accessory/service guard first → `NULL`: `disposal | transport fee | no lift | per floor | memory pillow | protector | microfiber`
   - bedframe: `jager | cody | trion | hilton | fenrir | ricardo | regal | divan | /fab[0-9]`
   - sofa: `hk55 | dsl90 | dsl80 | am90 | th50 | th51 | glano | muro | nuvio | lunor | modulo | seater | incliner | eleganz` (`hk55` covers HK5531/HK5535)
   - mattress: `firmcare | softcloud | breeze | lumi | forte | sonic | haven | solace | meridian | b120 | l120 | h140 | m140 | s160`
   - canonical prefix safety net: `^ms\d → mattress`, `^bf\d → bedframe`, `^sf\d → sofa`
4. Else → `NULL` (not shown in any supplier forecast; matches proto's "3 categories only").

> The keyword list is a **legacy-only** fallback; native catalog SKUs resolve at layer 1 and never reach it. Comment in the migration to flag it as maintained-for-AutoCount.

> Perf: called per order-line/PO-line during aggregation. At forecast scale (hundreds of lines, low QPS) with `STABLE` planner caching this is well within CLAUDE.md §8 budgets. If data grows, inline as set-based `LEFT JOIN`s.

### 4.2 Forecast bucket — rewrite `supplier_pending_demand()`

Keep signature/return shape compatible; **add `category`** to the output and fix the filter:

```sql
returns table(sku text, category text, pending_qty int, order_count int)
...
return query
  select ol.sku::text,
         resolve_demand_category(ol.sku)              as category,
         sum(ol.qty)::int                              as pending_qty,
         count(distinct ol.order_id)::int              as order_count
    from order_lines ol
    join orders o on o.id = ol.order_id
   where o.status not in ('delivered','cancelled')              -- active
     and resolve_demand_category(ol.sku) = ANY (v_cat_covered)  -- supplier's categories
     and not exists (                                            -- NOT yet POed → still Forecast
       select 1 from order_supplier_threads t
        where t.order_line_id = ol.id and t.po_id is not null
     )
   group by ol.sku;
```

Changes vs 0078:
- category via `resolve_demand_category` (was `split_part`).
- the "already POed" exclusion now matches on **`t.order_line_id = ol.id`** (precise, leverages 0124 per-line threads) instead of the fragile `(order, supplier, category)` triple with `split_part`.
- keep `status NOT IN ('delivered','cancelled')` — **not** `status='place'`. A proceeded-but-not-yet-POed line must stay in Forecast until its PO is issued (Loo's lifecycle). `po_id IS NULL` is the true Forecast/Commit boundary, not the order status.

### 4.3 Commit bucket — give it the same category

The committed bucket reads `purchase_order_lines` joined to open-status `purchase_orders`. It currently also relies on the frontend's `split_part`, so it has the same latent bug (invisible today only because there are ~no open POs). Fix symmetrically:

- Replace the route's PostgREST committed query with a new RPC `supplier_committed_demand()` returning `(sku, category, committed_qty, po_count)`, category via `resolve_demand_category(pol.sku)`, filtered to caller's supplier + `OPEN_SUP_STATUSES` (excludes `delivered`).
- (Implementation choice — symmetric twin RPCs vs one combined `supplier_demand()`. Default: two twin RPCs for testability; the route merges by sku as it does now.)

### 4.4 API — `GET /api/supplier/products/demand`

Returns one row per sku carrying both buckets + category:

```ts
{ sku: string; category: 'mattress'|'bedframe'|'sofa'|null;
  committedQty: number; poCount: number;
  pendingQty: number; pendingOrderCount: number }[]
```

Update the zod schema (`packages/shared`) + adapter accordingly. The route keeps merging the two RPC results by sku.

### 4.5 Frontend — `SupplierIncoming.tsx`

Minimal change (the two-bucket KPI layout stays — it is what Loo wants):

- Group rows by the server-returned **`category`** instead of `r.sku.split(':')[0]`.
- Rows whose `category` is `null` are accessories/services → **not rendered** (no furniture supplier covers them).
- Keep `Total demand = Committed + Pending`, the `Committed (POs)` and `Pending (orders)` KPIs, the per-category card layout, and the empty state. Only the grouping key changes.

### 4.6 Ohana → HoOKkA rename (migration 0149, data correction)

The supplier row (`id …e1`) is named `Ohana`, but the rest of the system already uses **HoOKkA** (app_user `HoOKkA · Sales` / `hookka@gmail.com`, components `HoOKkASofaTab.tsx` / `HoOKkABedFrameTab.tsx`, e2e specs). `Ohana` was introduced only by the Phase-A master-data seed (xlsx sheet name). Correct it:

- `UPDATE suppliers SET name = 'HoOKkA' WHERE id = '00000000-0000-0000-0000-0000000000e1'` (1 row). `cat_covered` unchanged (`{bedframe,sofa}`).
- `UPDATE ops_stock_items SET supplier = 'HoOKkA' WHERE supplier = 'Ohana'` (9 rows).
- **slug**: currently `ohana`. Grep for `'ohana'` slug usage first; rename to `hookka` only if nothing depends on it, else leave (slug is internal, low risk either way — decide in plan).
- Editable files (not frozen): `docs/autocount-import-contract.md` (line 161), and the `Ohana` sheet name in `scripts/ops-seed/carres-sku-master.xlsx` (prevents reintroduction on re-seed).
- Frozen migrations 0134/0137 keep the literal `Ohana` as historical text (per CLAUDE.md §13/§14 #6); the 0149 UPDATE supersedes their effect on live data.
- app_user already `HoOKkA` — no change.

---

## 5. Generality (Loo's "all suppliers, going forward")

The fix is **mechanism-level, not data-level**. `supplier_pending_demand` keys off the caller's `cat_covered`, so:

- Any supplier with `cat_covered` populated automatically gets a working forecast — today that's Nice Future + HoOKkA; future suppliers work the moment Loo sets their `cat_covered` (no code change).
- A new native SO entering `status='place'` is visible to every supplier covering its line categories within one query refresh.
- Multiple suppliers covering the same category all see that category's aggregate demand (pre-proceed, no supplier assigned yet — this is the point of a forecast).

---

## 6. Testing

- **Unit (vitest):** `resolve_demand_category` truth table — canonical mattress/bedframe/sofa Item Codes (layer 1), AutoCount raw furniture strings (layer 3), accessory/service → null. (Tested via the api route mock + a dedicated SQL-logic test, mirroring the classifier SQL.)
- **Integration (api):** `/products/demand` returns category-grouped rows; pending excludes POed lines; committed reflects open POs.
- **Frontend:** `SupplierIncoming` groups by returned `category`; null-category rows hidden; two-bucket KPIs intact.
- **Live SQL verification (post-deploy):** as Nice Future and HoOKkA — confirm non-empty forecast with correct per-category totals; confirm the 1 existing `pending` PO surfaces in Commit, not Forecast.
- **Lifecycle smoke:** proceed one placed order + issue a PO → that line moves Forecast → Commit; deliver → drops to 0.

---

## 7. Migrations

- **0148_supplier_forecast_category.sql** — `resolve_demand_category()` + rewrite `supplier_pending_demand()` + new `supplier_committed_demand()`. Idempotent `CREATE OR REPLACE`. Includes a `DO $sanity$` assert that `supplier_pending_demand` no longer references `split_part`.
- **0149_rename_ohana_hookka.sql** — the data UPDATEs in §4.6. Reversible (HoOKkA → Ohana) if ever needed.

(Live DB at 0147; these are the next two.)

## 8. Risks & follow-ups

- **Keyword fallback drift:** new AutoCount model names could miss the regex. Mitigated: native orders never use it; for legacy, unmatched core items just don't show (no wrong data). New carry-forward: `phase-10-forecast-keyword-coverage` — re-check if more AutoCount batches land.
- **Perf:** per-row function calls — fine at forecast scale; inline as joins if it ever regresses.
- **Carry-forward touched:** closes `phase-10-incoming-server-side` (the forecast now derives category correctly server-side). `phase-10-supplier-pos-list-urgency-blank` is adjacent but separate.

## 9. Acceptance criteria

1. As HoOKkA, the Incoming page shows bedframe + sofa pending demand from the placed orders (≈100 units); as Nice Future, mattress demand (≈91 units).
2. Accessory/service lines (pillow/protector/disposal/transport/lift) never appear.
3. Issuing a PO for a placed line moves it out of Forecast into Commit; delivering the PO drops it to 0.
4. A freshly created **native** SO at `status='place'` appears in the matching supplier's forecast with category from the catalog (no keyword guessing).
5. Supplier row reads `HoOKkA` everywhere; nothing in the app still shows `Ohana`.
6. No schema change; no frozen migration edited; typecheck + existing supplier tests green.
