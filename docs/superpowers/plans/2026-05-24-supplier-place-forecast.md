# Supplier "Incoming" forecast — category fix + Ohana→HoOKkA rename · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the supplier *Incoming* forecast show pending demand (and the Commit bucket) grouped by a correctly-derived category, for any order at `status='place'` — fixing the `split_part(sku,':')` bug that left it empty — and standardize the supplier name to canonical **Ohana**.

> **2026-05-24 correction:** Task 2 below was first written as "Ohana → HoOKkA"; the correct direction is **HoOKkA → Ohana** (Ohana is canonical). Migration 0149 went the wrong way and was corrected by **0150**; the code rename `HoOKkA → Ohana` (component files → `Ohana*Tab`, labels, tests, e2e) **kept the internal routing slug `hookka`** (wired into `_v3_resolve_sop_name` + `sops.ts`) and the login email. Read Task 2's direction inverted.

**Architecture:** A new `STABLE` SQL function `resolve_demand_category(sku)` derives category two ways — exact catalog join (`product_skus → product_models.category`) for native Portal orders, model-keyword regex for legacy AutoCount free-text SKUs. Both the Forecast RPC (`supplier_pending_demand`, rewritten) and a new Commit RPC (`supplier_committed_demand`) use it. The Hono `/demand` route merges the two RPCs by SKU; the React page groups by the returned `category`. The three-state lifecycle (Forecast → Commit → 0) is unchanged — the Forecast/Commit boundary is `order_supplier_threads.po_id IS NULL`.

**Tech Stack:** Postgres (Supabase, plpgsql/sql functions, applied via Supabase MCP), Hono on CF Workers (TypeScript), React 18 + TanStack Query, vitest. Branch: `phase/10-supplier-place-forecast`. Spec: `docs/superpowers/specs/2026-05-24-supplier-place-forecast-design.md`.

> **Environment note (read first):** there is **no local Postgres / dev server** (`.dev.vars` + `.env.local` are not configured). Therefore:
> - SQL (Tasks 1–2) is verified by **applying to the remote DB via `mcp__supabase__apply_migration`** and asserting with `mcp__supabase__execute_sql`. The remote DB **is** staging = prod; the changes are additive (`CREATE OR REPLACE`) + a reversible data rename. These steps need this session's authenticated Supabase MCP — **run them inline, not in a subagent.**
> - TS (Tasks 3–5) is pure vitest with mocks — no DB needed; safe for subagents.
> - Migrations are also written as files in `supabase/migrations/` (git source of truth) **and** applied via MCP (live). Both.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `supabase/migrations/0148_supplier_forecast_category.sql` | `resolve_demand_category()` + rewrite `supplier_pending_demand()` + new `supplier_committed_demand()` | Create |
| `supabase/migrations/0149_rename_ohana_hookka.sql` | Data rename `Ohana`→`HoOKkA` (`suppliers`, `ops_stock_items`) | Create |
| `apps/api/src/routes/supplier/products.ts` | `/demand` route: call both RPCs, merge by SKU, emit `category` | Modify (~L58–127) |
| `apps/api/src/routes/supplier/products.test.ts` | Route tests for the new two-RPC shape | Modify |
| `apps/web/src/lib/queries.ts` | `SupplierDemandRow` gains `category` | Modify (L3552–3562) |
| `apps/web/src/pages/supplier/SupplierIncoming.tsx` | Group by `category` (not `sku.split(':')`) | Modify (L32–38, KPI sums) |
| `apps/web/src/pages/supplier/SupplierIncoming.test.tsx` | `category` on demand mock rows | Modify |
| `docs/autocount-import-contract.md` | `Ohana`→`HoOKkA` in the sheet/prefix table | Modify (L161) |
| `scripts/ops-seed/carres-sku-master.xlsx` | Rename sheet `Ohana`→`HoOKkA` (prevents re-seed regression) | Modify |

---

## Task 1: Migration 0148 — category resolver + Forecast/Commit RPCs

**Files:**
- Create: `supabase/migrations/0148_supplier_forecast_category.sql`

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/0148_supplier_forecast_category.sql` with exactly:

```sql
-- =============================================================================
-- 0148_supplier_forecast_category.sql (Loo 2026-05-24)
-- =============================================================================
-- Fix the supplier "Incoming" forecast: it was empty because
-- supplier_pending_demand derived category via split_part(sku, ':', 1), which
-- assumes the legacy `category:model:variant` SKU shape. Neither AutoCount
-- legacy SKUs (free text) nor native canonical Item Codes (MS01-/BF0x-/SF0x-)
-- carry that prefix, so it matched no supplier's cat_covered.
--
-- Fix = resolve_demand_category(sku): exact catalog join for native orders,
-- model-keyword regex for legacy AutoCount. Used by BOTH buckets:
--   • supplier_pending_demand  (Forecast: active line, po_id IS NULL)
--   • supplier_committed_demand (Commit:  open-status PO lines)
-- Authorized in conversation 2026-05-24. Spec:
-- docs/superpowers/specs/2026-05-24-supplier-place-forecast-design.md
-- =============================================================================

-- ---------------------------------------------------------------------------
-- resolve_demand_category(sku) → 'mattress' | 'bedframe' | 'sofa' | NULL
-- Layer 1: native canonical catalog (exact; Portal orders always hit this).
-- Layer 2: keyword classifier (legacy AutoCount free-text; native never reaches
--          it because layer 1 short-circuits). NULL = accessory/service.
-- The keyword list is maintained for the one-time pre-Portal AutoCount backfill.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_demand_category(p_sku text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $func$
  select coalesce(
    (select pm.category::text
       from product_skus ps
       join product_models pm on pm.id = ps.model_id
      where ps.sku = p_sku
      limit 1),
    (select case
       when z.n ~ 'disposal|transport fee|no lift|per floor|memory pillow|protector|microfiber' then null
       when z.n ~ 'jager|cody|trion|hilton|fenrir|ricardo|regal|divan|/fab[0-9]'                 then 'bedframe'
       when z.n ~ 'hk55|dsl90|dsl80|am90|th50|th51|glano|muro|nuvio|lunor|modulo|seater|incliner|eleganz' then 'sofa'
       when z.n ~ 'firmcare|softcloud|breeze|lumi|forte|sonic|haven|solace|meridian|b120|l120|h140|m140|s160' then 'mattress'
       when z.n ~ '^ms[0-9]' then 'mattress'
       when z.n ~ '^bf[0-9]' then 'bedframe'
       when z.n ~ '^sf[0-9]' then 'sofa'
       else null
     end
     from (select lower(coalesce(p_sku, '')) as n) z)
  );
$func$;

revoke all on function public.resolve_demand_category(text) from public, anon;
grant execute on function public.resolve_demand_category(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Forecast bucket. Active order lines NOT yet covered by a PO (po_id IS NULL),
-- scoped to the caller-supplier's cat_covered. category via resolver.
-- Boundary is "not yet POed" (leverages 0124 per-line threads.order_line_id),
-- NOT status='place' — a proceeded-but-unPOed line stays in Forecast.
-- ---------------------------------------------------------------------------
create or replace function public.supplier_pending_demand()
returns table(sku text, category text, pending_qty int, order_count int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $func$
declare
  v_supplier_id uuid;
  v_cat_covered text[];
begin
  if public.app_role() <> 'supplier' then
    raise exception 'forbidden: supplier only' using errcode = '42501', detail = 'forbidden';
  end if;
  v_supplier_id := public.app_supplier_id();
  if v_supplier_id is null then
    raise exception 'no supplier_id on JWT' using errcode = '42501', detail = 'no_supplier_id';
  end if;
  select s.cat_covered into v_cat_covered from suppliers s where s.id = v_supplier_id;
  if v_cat_covered is null or array_length(v_cat_covered, 1) is null then
    return;
  end if;

  return query
    with lines as (
      select ol.id, ol.order_id, ol.sku, ol.qty,
             public.resolve_demand_category(ol.sku) as cat
        from order_lines ol
        join orders o on o.id = ol.order_id
       where o.status not in ('delivered', 'cancelled')
         and not exists (
           select 1 from order_supplier_threads t
            where t.order_line_id = ol.id and t.po_id is not null
         )
    )
    select l.sku::text,
           l.cat                                as category,
           sum(l.qty)::int                      as pending_qty,
           count(distinct l.order_id)::int      as order_count
      from lines l
     where l.cat = ANY (v_cat_covered)
     group by l.sku, l.cat
     order by sum(l.qty) desc;
end;
$func$;

revoke all on function public.supplier_pending_demand() from public, anon;
grant execute on function public.supplier_pending_demand() to authenticated;

-- ---------------------------------------------------------------------------
-- Commit bucket. Open-status PO lines for the caller-supplier. category via
-- resolver. 'delivered' is excluded → a delivered PO drops the bucket to 0.
-- ---------------------------------------------------------------------------
create or replace function public.supplier_committed_demand()
returns table(sku text, category text, committed_qty int, po_count int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $func$
declare
  v_supplier_id uuid;
begin
  if public.app_role() <> 'supplier' then
    raise exception 'forbidden: supplier only' using errcode = '42501', detail = 'forbidden';
  end if;
  v_supplier_id := public.app_supplier_id();
  if v_supplier_id is null then
    raise exception 'no supplier_id on JWT' using errcode = '42501', detail = 'no_supplier_id';
  end if;

  return query
    select pol.sku::text,
           public.resolve_demand_category(pol.sku) as category,
           sum(pol.qty)::int                       as committed_qty,
           count(distinct pol.po_id)::int          as po_count
      from purchase_order_lines pol
      join purchase_orders po on po.id = pol.po_id
     where po.supplier_id = v_supplier_id
       and po.sup_status in (
         'pending','acknowledged','in_production','ready_for_pickup',
         'pickup_assigned','pickup_accepted','partially_shipped','shipped','reassign_needed'
       )
     group by pol.sku
     order by sum(pol.qty) desc;
end;
$func$;

revoke all on function public.supplier_committed_demand() from public, anon;
grant execute on function public.supplier_committed_demand() to authenticated;

-- Sanity: the forecast RPC must no longer reference split_part.
do $sanity$
begin
  if pg_get_functiondef('public.supplier_pending_demand()'::regprocedure) ilike '%split_part%' then
    raise exception '0148 sanity: supplier_pending_demand still references split_part';
  end if;
end;
$sanity$;
```

- [ ] **Step 2: Apply the migration to the remote DB (inline — uses session MCP)**

Call `mcp__supabase__apply_migration` with `name = "supplier_forecast_category"` and `query =` the full file body above.
Expected: success, no error (the `do $sanity$` block passes).

- [ ] **Step 3: Verify the resolver truth table (MCP)**

Run via `mcp__supabase__execute_sql`:

```sql
select
  public.resolve_demand_category('MS01-B1201F-S')                         as native_ms,    -- mattress (catalog)
  public.resolve_demand_category('BF04-1007/Cody/Fab3-Q')                 as native_bf,    -- bedframe (catalog)
  public.resolve_demand_category('1013Jager/Fab3-King/COL:PC151-02')      as legacy_bf,    -- bedframe (keyword)
  public.resolve_demand_category('HK5531/28"(2+LSeater)/KN390-14 METAL')  as legacy_sofa,  -- sofa (keyword)
  public.resolve_demand_category('Breeze FirmCare-B1201F-K')              as legacy_mt,    -- mattress (keyword)
  public.resolve_demand_category('Essential Memory Pillow(L)')            as accessory,    -- null
  public.resolve_demand_category('Sofa Disposal')                         as service;      -- null
```
Expected: `mattress, bedframe, bedframe, sofa, mattress, NULL, NULL`.

- [ ] **Step 4: Verify the Forecast aggregate as the two live suppliers (MCP)**

Run (simulates each supplier's cat_covered without needing a JWT):

```sql
-- HoOKkA(=Ohana e1) covers bedframe+sofa; Nice Future(e2) covers mattress.
with lines as (
  select ol.id, ol.order_id, ol.qty, public.resolve_demand_category(ol.sku) as cat
  from order_lines ol join orders o on o.id = ol.order_id
  where o.status not in ('delivered','cancelled')
    and not exists (select 1 from order_supplier_threads t where t.order_line_id = ol.id and t.po_id is not null)
)
select cat, sum(qty) qty, count(distinct order_id) orders
from lines where cat = any(array['bedframe','sofa']) group by cat order by 1;
```
Expected: `bedframe ~36`, `sofa ~64` (HoOKkA's forecast). Re-run with `array['mattress']` → `mattress ~91` (Nice Future).

- [ ] **Step 5: Verify the Commit bucket reflects the one live open PO (MCP)**

```sql
select pol.sku, public.resolve_demand_category(pol.sku) as category, sum(pol.qty) qty, count(distinct pol.po_id) pos
from purchase_order_lines pol join purchase_orders po on po.id = pol.po_id
where po.supplier_id = '00000000-0000-0000-0000-0000000000e2'
  and po.sup_status in ('pending','acknowledged','in_production','ready_for_pickup','pickup_assigned','pickup_accepted','partially_shipped','shipped','reassign_needed')
group by pol.sku;
```
Expected: one row `MS01-B1201F-S | mattress | 5 | 1` (Nice Future's open PO-2031).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0148_supplier_forecast_category.sql
git commit -m "feat(supplier): resolve_demand_category + Forecast/Commit RPCs (migration 0148)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Migration 0149 — Ohana → HoOKkA rename (+ docs/xlsx)

**Files:**
- Create: `supabase/migrations/0149_rename_ohana_hookka.sql`
- Modify: `docs/autocount-import-contract.md` (L161)
- Modify: `scripts/ops-seed/carres-sku-master.xlsx` (sheet name)

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/0149_rename_ohana_hookka.sql`:

```sql
-- =============================================================================
-- 0149_rename_ohana_hookka.sql (Loo 2026-05-24)
-- =============================================================================
-- Data correction: supplier row id …e1 was mis-seeded as 'Ohana' by the
-- Phase-A master-data xlsx (sheet name). The rest of the system already uses
-- 'HoOKkA' (app_user 'HoOKkA · Sales', components HoOKkASofaTab/HoOKkABedFrameTab,
-- e2e specs). Bring the data into line. Reversible (HoOKkA → Ohana).
-- slug 'ohana' intentionally left unchanged — internal id, no user benefit to
-- churning it (decision in §spec 4.6). Frozen migrations 0134/0137 keep the
-- literal 'Ohana' as historical text per CLAUDE.md §13/§14 #6.
-- =============================================================================
update suppliers     set name = 'HoOKkA' where id = '00000000-0000-0000-0000-0000000000e1' and name = 'Ohana';
update ops_stock_items set supplier = 'HoOKkA' where supplier = 'Ohana';

do $sanity$
begin
  if exists (select 1 from suppliers where name = 'Ohana') then
    raise exception '0149 sanity: a supplier named Ohana still exists';
  end if;
end;
$sanity$;
```

- [ ] **Step 2: Apply to remote (inline — uses session MCP)**

Call `mcp__supabase__apply_migration` with `name = "rename_ohana_hookka"` and the file body. Expected: success.

- [ ] **Step 3: Verify (MCP)**

```sql
select name, cat_covered from suppliers where id = '00000000-0000-0000-0000-0000000000e1';
select supplier, count(*) from ops_stock_items group by supplier order by 2 desc;
```
Expected: name = `HoOKkA`, cat_covered = `{bedframe,sofa}`; `ops_stock_items` shows `HoOKkA` (9), no `Ohana`.

- [ ] **Step 4: Check the slug is safe to leave (grep)**

Run: `git grep -n "'ohana'" -- apps packages` and `git grep -n '"ohana"' -- apps packages`
Expected: no routing/logic dependency on the literal slug `ohana`. (If a dependency shows up, add `update suppliers set slug='hookka' where id='…e1';` to the migration and re-apply; otherwise leave slug as-is.)

- [ ] **Step 5: Fix the editable docs + xlsx sheet**

In `docs/autocount-import-contract.md` line 161, change `| Ohana | 78 | \`BF04-\` |` to `| HoOKkA | 78 | \`BF04-\` |`.

Rename the xlsx sheet (prevents the name regressing on any future re-seed):
```bash
python - <<'PY'
import openpyxl
p = "scripts/ops-seed/carres-sku-master.xlsx"
wb = openpyxl.load_workbook(p)
for ws in wb.worksheets:
    if ws.title.strip() == "Ohana":
        ws.title = "HoOKkA"
wb.save(p)
print("sheets:", [w.title for w in wb.worksheets])
PY
```
Expected: printed sheet list shows `HoOKkA`, no `Ohana`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0149_rename_ohana_hookka.sql docs/autocount-import-contract.md scripts/ops-seed/carres-sku-master.xlsx
git commit -m "fix(supplier): rename Ohana -> HoOKkA across data + docs (migration 0149)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `/demand` route — two RPCs + category

**Files:**
- Modify: `apps/api/src/routes/supplier/products.ts` (the `OPEN_SUP_STATUSES` const L24–41 and the `/demand` handler L58–127)
- Test: `apps/api/src/routes/supplier/products.test.ts`

- [ ] **Step 1: Rewrite the `/demand` test block to the two-RPC shape**

In `apps/api/src/routes/supplier/products.test.ts`, replace the entire `describe("GET /api/supplier/products/demand", ...)` block (L102–260) with:

```ts
describe("GET /api/supplier/products/demand", () => {
  // 2026-05-24 — both buckets are now SECURITY DEFINER RPCs that carry
  // `category` (resolve_demand_category): supplier_committed_demand (Commit)
  // and supplier_pending_demand (Forecast). The route merges by sku.
  function mockDemandSb(opts: {
    committed: Array<{ sku: string; category: string | null; committed_qty: number; po_count: number }>;
    pending: Array<{ sku: string; category: string | null; pending_qty: number; order_count: number }>;
  }) {
    return {
      rpc: vi.fn().mockImplementation((name: string) =>
        Promise.resolve({
          data: name === "supplier_committed_demand" ? opts.committed : opts.pending,
          error: null,
        }),
      ),
    };
  }

  it("aggregates committed PO demand by sku with category, sorted desc", async () => {
    const sb = mockDemandSb({
      committed: [
        { sku: "MS01-cloud-Q", category: "mattress", committed_qty: 15, po_count: 2 },
        { sku: "MS01-cloud-K", category: "mattress", committed_qty: 3, po_count: 1 },
      ],
      pending: [],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request("http://t/api/supplier/products/demand", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<{ sku: string; category: string; openQty: number; poCount: number }>;
    expect(rows[0]).toMatchObject({ sku: "MS01-cloud-Q", category: "mattress", openQty: 15, poCount: 2 });
    expect(rows[1]).toMatchObject({ sku: "MS01-cloud-K", category: "mattress", openQty: 3, poCount: 1 });
  });

  it("calls both supplier demand RPCs by name", async () => {
    const sb = mockDemandSb({ committed: [], pending: [] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    await app.fetch(
      new Request("http://t/api/supplier/products/demand", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(sb.rpc).toHaveBeenCalledWith("supplier_committed_demand");
    expect(sb.rpc).toHaveBeenCalledWith("supplier_pending_demand");
  });

  it("returns empty array when both buckets are empty", async () => {
    const sb = mockDemandSb({ committed: [], pending: [] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request("http://t/api/supplier/products/demand", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("merges Forecast (pending) and Commit (committed) by sku, carrying category", async () => {
    const sb = mockDemandSb({
      committed: [{ sku: "MS01-cloud-Q", category: "mattress", committed_qty: 5, po_count: 1 }],
      pending: [
        { sku: "MS01-cloud-Q", category: "mattress", pending_qty: 3, order_count: 2 },
        { sku: "MS01-cloud-K", category: "mattress", pending_qty: 7, order_count: 4 },
      ],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request("http://t/api/supplier/products/demand", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<{
      sku: string; category: string; openQty: number; poCount: number; pendingQty: number; pendingOrderCount: number;
    }>;
    // Queen: committed 5 + pending 3 = 8 (sorted first).
    expect(rows[0]).toMatchObject({ sku: "MS01-cloud-Q", category: "mattress", openQty: 5, poCount: 1, pendingQty: 3, pendingOrderCount: 2 });
    // King: committed 0 + pending 7 = 7.
    expect(rows[1]).toMatchObject({ sku: "MS01-cloud-K", category: "mattress", openQty: 0, poCount: 0, pendingQty: 7, pendingOrderCount: 4 });
  });

  it("rejects partner role with 403", async () => {
    const jwt = await makeJwt("partner");
    const res = await app.fetch(
      new Request("http://t/api/supplier/products/demand", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @carres/api exec vitest run src/routes/supplier/products.test.ts`
Expected: FAIL (route still queries `purchase_order_lines` via `.from().select().in()`, and `sb.from` is no longer mocked; rows lack `category`).

- [ ] **Step 3: Rewrite the `/demand` handler**

In `apps/api/src/routes/supplier/products.ts`:

(a) Delete the `OPEN_SUP_STATUSES` const block (L24–41) — the open-status filter now lives in `supplier_committed_demand`.

(b) Replace the whole `supplierProductsRouter.get("/demand", …)` handler (L58–127) with:

```ts
supplierProductsRouter.get("/demand", requireSupplier, async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);

  // Two buckets, both SECURITY DEFINER RPCs that carry `category`
  // (resolve_demand_category, migration 0148):
  //   committed = Commit bucket (open-status PO lines)
  //   pending   = Forecast bucket (active lines, po_id IS NULL, scoped to cat_covered)
  const [committedRes, pendingRes] = await Promise.all([
    sb.rpc("supplier_committed_demand"),
    sb.rpc("supplier_pending_demand"),
  ]);
  if (committedRes.error) {
    throw new HTTPException(500, { message: committedRes.error.message });
  }
  if (pendingRes.error) {
    throw new HTTPException(500, { message: pendingRes.error.message });
  }

  const map = new Map<
    string,
    { sku: string; category: string | null; openQty: number; poCount: number; pendingQty: number; pendingOrderCount: number }
  >();
  const get = (sku: string) =>
    map.get(sku) ?? { sku, category: null, openQty: 0, poCount: 0, pendingQty: 0, pendingOrderCount: 0 };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (committedRes.data ?? []) as any[]) {
    const sku = String(row.sku);
    if (!sku) continue;
    const cur = get(sku);
    cur.openQty += Number(row.committed_qty ?? 0);
    cur.poCount += Number(row.po_count ?? 0);
    cur.category = cur.category ?? (row.category ?? null);
    map.set(sku, cur);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (pendingRes.data ?? []) as any[]) {
    const sku = String(row.sku);
    if (!sku) continue;
    const cur = get(sku);
    cur.pendingQty += Number(row.pending_qty ?? 0);
    cur.pendingOrderCount += Number(row.order_count ?? 0);
    cur.category = cur.category ?? (row.category ?? null);
    map.set(sku, cur);
  }

  return c.json(
    [...map.values()].sort((a, b) => b.openQty + b.pendingQty - (a.openQty + a.pendingQty)),
  );
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @carres/api exec vitest run src/routes/supplier/products.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck the api package**

Run: `pnpm --filter @carres/api typecheck`
Expected: no errors (confirm the now-unused `OPEN_SUP_STATUSES` is fully removed, no dangling import).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/supplier/products.ts apps/api/src/routes/supplier/products.test.ts
git commit -m "feat(supplier): /demand reads Forecast+Commit RPCs with category

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `SupplierDemandRow` gains `category`

**Files:**
- Modify: `apps/web/src/lib/queries.ts` (L3552–3562)

- [ ] **Step 1: Add the field**

In `apps/web/src/lib/queries.ts`, change the `SupplierDemandRow` interface (L3552–3562) to:

```ts
export interface SupplierDemandRow {
  sku: string;
  /** mattress | bedframe | sofa, or null for accessories/services (hidden).
   *  Server-derived via resolve_demand_category (migration 0148). */
  category: "mattress" | "bedframe" | "sofa" | null;
  /** Formal commitment (already-issued PO lines) — the Commit bucket. */
  openQty: number;
  poCount: number;
  // pre-commit demand from active orders not yet POed — the Forecast bucket.
  // Fed by supplier_pending_demand(); 0 means nothing beyond what's POed.
  pendingQty: number;
  pendingOrderCount: number;
}
```

- [ ] **Step 2: Typecheck the web package**

Run: `pnpm --filter @carres/web typecheck`
Expected: a type error in `SupplierIncoming.tsx` is acceptable here only if it predates Task 5; otherwise no errors. (The interface change alone is additive — existing code compiles; Task 5 will consume `category`.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/queries.ts
git commit -m "feat(supplier): SupplierDemandRow carries category

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `SupplierIncoming` groups by `category`

**Files:**
- Modify: `apps/web/src/pages/supplier/SupplierIncoming.tsx` (L28–38 grouping + KPI sums)
- Test: `apps/web/src/pages/supplier/SupplierIncoming.test.tsx`

- [ ] **Step 1: Update the test demand mock to carry `category`**

In `apps/web/src/pages/supplier/SupplierIncoming.test.tsx`, replace the `DEMAND` constant (L26–30) with rows that carry `category` + full shape, and update the grouping-test comment:

```ts
const DEMAND = [
  { sku: "MS01-cloud-Q", category: "mattress", openQty: 12, poCount: 2, pendingQty: 0, pendingOrderCount: 0 },
  { sku: "MS01-premier-K", category: "mattress", openQty: 4, poCount: 1, pendingQty: 2, pendingOrderCount: 1 },
  { sku: "BF04-l1202-K", category: "bedframe", openQty: 6, poCount: 1, pendingQty: 0, pendingOrderCount: 0 },
];
```

In the test `"groups SKUs by category prefix"` rename it to `"groups rows by server-returned category"` (the assertions on `incoming-cat-mattress` / `incoming-cat-bedframe` stay).

- [ ] **Step 2: Run the web test to verify current behavior still parses (baseline)**

Run: `pnpm --filter @carres/web exec vitest run src/pages/supplier/SupplierIncoming.test.tsx`
Expected: the grouping test may still PASS by accident (old code splits `"MS01-cloud-Q"` on `:` → whole-string key `"ms01-cloud-q"`, so `incoming-cat-mattress` would NOT be found → FAIL). Confirm it FAILS on the grouping test — that's the red state proving the bug.

- [ ] **Step 3: Switch the component to group by `category`**

In `apps/web/src/pages/supplier/SupplierIncoming.tsx`:

(a) Replace the KPI total + grouping block (L28–38) with:

```tsx
  // Only the 3 furniture categories belong in a supplier forecast; the server
  // already excludes accessories/services (category null), but guard anyway.
  const relevant = rows.filter((r) => r.category);
  const totalOpenUnits = relevant.reduce((s, r) => s + r.openQty, 0);
  const totalPendingUnits = relevant.reduce((s, r) => s + (r.pendingQty ?? 0), 0);
  const totalUnits = totalOpenUnits + totalPendingUnits;

  // Group by server-derived category (migration 0148 resolve_demand_category).
  // The legacy `sku.split(":")` is gone — AutoCount + canonical SKUs have no
  // category prefix.
  const byCat: Record<string, typeof rows> = {};
  for (const r of relevant) {
    const cat = r.category as string;
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(r);
  }
```

(b) The `Across {rows.length} SKU…` line (L86) and the empty-state check `rows.length === 0` (L102): change `rows.length` → `relevant.length` in both so the counts/empty-state reflect furniture rows only.

- [ ] **Step 4: Run the web test to verify it passes**

Run: `pnpm --filter @carres/web exec vitest run src/pages/supplier/SupplierIncoming.test.tsx`
Expected: PASS (KPI test, grouping test with `incoming-cat-mattress` + `incoming-cat-bedframe`, empty-state test).

- [ ] **Step 5: Typecheck the web package**

Run: `pnpm --filter @carres/web typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/supplier/SupplierIncoming.tsx apps/web/src/pages/supplier/SupplierIncoming.test.tsx
git commit -m "feat(supplier): Incoming page groups by server category

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Full verification + acceptance

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `pnpm -r typecheck`
Expected: no errors across `@carres/shared`, `@carres/api`, `@carres/web`.

- [ ] **Step 2: Full test suite (catch regressions)**

Run: `pnpm -r test`
Expected: api + web + shared green, **modulo the 7 pre-existing failures documented in CLAUDE.md §17.7** (`partner/pickups`, `supplier/pos` ×2, `HoOKkASofaTab` ×4). Confirm no *new* failures versus that baseline; in particular `supplier/products.test.ts` and `SupplierIncoming.test.tsx` pass.

- [ ] **Step 3: Acceptance check against the live DB (MCP)**

Confirm spec §9 criteria 1–2 with the real `cat_covered`-scoped logic:

```sql
-- HoOKkA (e1) forecast: bedframe + sofa
with lines as (
  select ol.id, ol.order_id, ol.qty, public.resolve_demand_category(ol.sku) cat
  from order_lines ol join orders o on o.id = ol.order_id
  where o.status not in ('delivered','cancelled')
    and not exists (select 1 from order_supplier_threads t where t.order_line_id = ol.id and t.po_id is not null)
)
select 'HoOKkA' supplier, cat, sum(qty) qty from lines
where cat = any((select cat_covered from suppliers where id='00000000-0000-0000-0000-0000000000e1')) group by cat
union all
select 'NiceFuture', cat, sum(qty) from lines
where cat = any((select cat_covered from suppliers where id='00000000-0000-0000-0000-0000000000e2')) group by cat
order by 1, 2;
```
Expected: HoOKkA → bedframe ~36, sofa ~64; NiceFuture → mattress ~91. **No accessory rows.**

- [ ] **Step 4: Confirm no `Ohana` remains in app code/data**

Run: `git grep -ni "ohana" -- apps packages docs` and the MCP `select count(*) from suppliers where name='Ohana'`.
Expected: no `Ohana` in `apps`/`packages` (slug `ohana` in a comment/migration is fine); 0 supplier rows named Ohana.

- [ ] **Step 5: Finish the branch**

Use the `superpowers:finishing-a-development-branch` skill to decide merge/PR. Note for the human: **deploy is manual** (CLAUDE.md / memory) — after merge, `wrangler deploy --env production` (api) + build & `wrangler pages deploy` (web); the DB migrations are already live (applied via MCP in Tasks 1–2).

---

## Self-review notes (author)

- **Spec coverage:** resolver (§4.1)→T1; pending rewrite (§4.2)→T1; commit category (§4.3)→T1; endpoint (§4.4)→T3; frontend (§4.5)→T4/T5; rename (§4.6)→T2; generality (§5)→inherent in cat_covered filter; testing (§6)→T1 MCP + T3/T5 vitest + T6; acceptance (§9)→T6.
- **No schema change, no frozen-migration edits** — confirmed (only `CREATE OR REPLACE` functions + data `UPDATE`s).
- **Type consistency:** RPC outputs `category/pending_qty/order_count/committed_qty/po_count` → route maps to `category/openQty/poCount/pendingQty/pendingOrderCount` → `SupplierDemandRow` (Task 4) → consumed in `SupplierIncoming` (Task 5). Names align across tasks.
- **Pre-existing failures** (§17.7) are called out in T6 so they aren't mistaken for regressions.
