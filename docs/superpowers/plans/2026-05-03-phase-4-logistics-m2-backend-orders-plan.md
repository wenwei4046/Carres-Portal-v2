# Phase 4 — Logistics M2: Backend Orders Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 8 backend API routes under `/api/logistics/*` (1 dashboard + 3 read + 5 mutation) that wrap existing M1 RPCs/helpers with role guards, zod validation, and SQLSTATE→HTTP error mapping — so the M5 frontend can render the kanban + drawer + dispatch modals against real backend.

**Architecture:** Hono routers mirroring the Phase 3 `apps/api/src/routes/principal/*` pattern. RPC pattern (zero RLS changes — M1 already shipped 14 SECURITY DEFINER RPCs guarded by `is_logistics()`). Inline `mapPgError` per file (matches Phase 3 carry-forward; extraction is a separate M6 cleanup). Tests mock `userClient` with vitest and exercise the route via `app.fetch` with a signed ES256 JWT.

**Tech Stack:** Hono v4 · zod · vitest · jose · supabase-js v2 (all already installed)

---

## Source spec

- Spec: `docs/superpowers/specs/2026-05-03-phase-4-logistics-design.md`
  - §6 (RPC signatures, draft) · §7 (route list) · §17 (eng-review decisions, supersedes §6) · §18.3 (LogisticsOrders proto fidelity for response shapes)
- Schemas already present (M1, no edits): `packages/shared/src/schemas/logistics.ts`
- DB already migrated (M1, no edits): `is_logistics()`, all 11 logistics RPCs, `purchase_order_lines`, `stock_balances.reserved`, `orders.dispatched_at`/`delivered_at`

## Out of scope for M2

- POST `/api/logistics/orders/:id/issue-pos` → M3 (procurement)
- GET `/api/logistics/orders/:id/print-do` → deferred (PDF library decision per spec §17.4 A8 → TODO `phase-7-pdf-gen-options`)
- Anything under `/api/logistics/pos/*` → M3
- Anything under `/api/logistics/warehouse/*` or `/movements` → M4
- Frontend pages/modals → M5

## File Structure

**Create (4 files, ~965 LOC total estimate):**

| Path | Purpose | LOC est |
|---|---|---|
| `apps/api/src/routes/logistics/dashboard.ts` | Single GET handler that wraps `logistics_dashboard_summary` RPC | ~35 |
| `apps/api/src/routes/logistics/dashboard.test.ts` | 3 tests (200 happy / 403 wrong role / 401 no auth) | ~120 |
| `apps/api/src/routes/logistics/orders.ts` | 7 handlers (1 list + 1 detail + 5 mutations) with inline `mapPgError` | ~280 |
| `apps/api/src/routes/logistics/orders.test.ts` | ~30 tests covering happy + role guard + zod 422 + SQLSTATE mapping for each | ~530 |

**Modify (1 file):**

| Path | Change | Lines |
|---|---|---|
| `apps/api/src/index.ts` | Add 2 imports + 2 `api.route(...)` mounts | +4 |

Files that change together live together: `dashboard.ts` + `dashboard.test.ts` are one pair; `orders.ts` + `orders.test.ts` are one pair. Both pairs sit under a new `routes/logistics/` directory mirroring `routes/principal/`.

---

## Conventions all tasks follow

1. **Role guard runs first** — `if (auth.role !== "logistics") throw new HTTPException(403, …)`. Belt-and-brace before the Supabase round-trip even though the RPC's `is_logistics()` would also reject. Pattern: `principal/dashboard.ts:18-21`.
2. **`userClient(c.env, auth.jwt)`** — never `adminClient`. The user's JWT carries the role claim that `is_logistics()` reads.
3. **zod parse before RPC call** — use `safeParse` on `await c.req.json()` (wrap with try/catch for empty body → `{}`). Return 422 with `{ error: 'invalid_input', code: 'invalid_param', message }` on failure. Pattern: `principal/approvals.ts:67-83`.
4. **Inline `mapPgError`** — copy the helper from `principal/dealers.ts:41-64` verbatim into each new route file. Per CLAUDE.md §3 "Simplicity First": don't extract a shared helper just because it duplicates — extraction is a separate planned cleanup, not in M2 scope.
5. **SQLSTATE codes** (per spec §17.5 CQ2):
   - `42501` → 403 forbidden
   - `42P01` → 404 not_found
   - `22023` → 422 invalid_param
   - `P0001` → 422 with `code = error.details ?? 'invalid_param'`
6. **Test mock pattern** — copy the `dashboard.test.ts` boilerplate verbatim (vi.mock at top, ES256 keypair in beforeAll, `_setJwksForTesting` in beforeEach, makeJwt helper). Each test mocks `userClient.mockReturnValue({ rpc: async () => ({ data, error }), from: () => ... })`.
7. **Commit cadence** — one commit per Task. Every commit message: `feat(api): logistics M2 — <task title>`. Don't bundle.

---

## Pre-flight (run BEFORE Task 1)

- [ ] **Step 0.1: Confirm green baseline**

Run: `pnpm test`
Expected: `Test Files 23 passed (23) · Tests 237 passed (237)` (Phase 3 baseline + M1 added zod tests).

Run: `pnpm typecheck`
Expected: `Done` for all 3 packages, 0 errors.

If anything is red, STOP. Investigate before starting M2 — don't add work on top of broken state.

- [ ] **Step 0.2: Confirm working tree clean**

Run: `git status`
Expected: only `.gstack/` untracked. No modified tracked files.

If working tree has unrelated edits, commit/stash before starting M2.

---

## Task 1: GET /api/logistics/dashboard

**Files:**
- Create: `apps/api/src/routes/logistics/dashboard.ts`
- Create: `apps/api/src/routes/logistics/dashboard.test.ts`

**Goal:** Single handler that wraps `logistics_dashboard_summary` RPC. Mirrors `principal/dashboard.ts` exactly with naming swapped.

- [ ] **Step 1.1: Write the failing test**

Create `apps/api/src/routes/logistics/dashboard.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
}));

import { userClient } from "../../lib/supabase";

const SUPABASE_URL = "https://test.supabase.co";
const KID = "test-kid-1";

const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};

let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string) {
  return new SignJWT({
    email: `${role}@carres.com`,
    app_metadata: { role },
  })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000999")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

const SUMMARY_PAYLOAD = {
  kpis: { today_deliveries: 3, open_pos: 7, overdue: 1, active_orders: 12, active_gmv: 45000 },
  pipeline: { awaiting_stock: [], ready_to_dispatch: [], dispatched: [] },
  open_pos: [],
  low_stock: [],
};

beforeAll(async () => {
  const kp = await generateKeyPair("ES256", { extractable: true });
  signKey = kp.privateKey;
  publicJwk = await exportJWK(kp.publicKey);
  publicJwk.kid = KID;
  publicJwk.alg = "ES256";
  publicJwk.use = "sig";
});

beforeEach(() => {
  _setJwksForTesting(createLocalJWKSet({ keys: [publicJwk] }));
  vi.mocked(userClient).mockReset();
});

afterAll(() => _setJwksForTesting(null));

describe("GET /api/logistics/dashboard", () => {
  it("returns 200 + summary JSON for logistics", async () => {
    vi.mocked(userClient).mockReturnValue({
      rpc: async () => ({ data: SUMMARY_PAYLOAD, error: null }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/dashboard", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as typeof SUMMARY_PAYLOAD;
    expect(body.kpis.today_deliveries).toBe(3);
  });

  it("returns 403 for principal role (no Supabase round-trip)", async () => {
    const rpc = vi.fn();
    vi.mocked(userClient).mockReturnValue({ rpc } as any);

    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/logistics/dashboard", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 401 without Authorization header", async () => {
    const res = await app.fetch(new Request("http://t/api/logistics/dashboard"), env);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `pnpm --filter @carres/api test -- dashboard.test.ts`
Expected: FAIL with cannot find module / route returns 404 (route not yet mounted, file doesn't exist yet).

- [ ] **Step 1.3: Write the minimal route**

Create `apps/api/src/routes/logistics/dashboard.ts`:

```typescript
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * GET /api/logistics/dashboard
 *
 * Wraps `logistics_dashboard_summary` RPC (M1, 0019). Single round-trip returns
 * the dashboard payload (KPIs + pipeline buckets + open POs + low stock cards).
 * The RPC is SECURITY DEFINER + manual `is_logistics()` guard; we layer a
 * same-role check here for fast 403s without a Supabase round-trip.
 */
const logisticsDashboardRouter = new Hono<AppEnv>();

logisticsDashboardRouter.get("/", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "logistics") {
    throw new HTTPException(403, { message: "Logistics only" });
  }

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("logistics_dashboard_summary");
  if (error) {
    return c.json(
      { error: "rpc_failed", code: "rpc_failed", message: error.message },
      500,
    );
  }
  return c.json(data);
});

export default logisticsDashboardRouter;
```

- [ ] **Step 1.4: Mount the route in `index.ts`**

Modify `apps/api/src/index.ts`:

Add import (alphabetical with existing logistics imports — currently none, so insert after `principal/dealers`):
```typescript
import logisticsDashboardRouter from "./routes/logistics/dashboard";
```

Add mount (insert after `api.route("/principal/dealers", principalDealersRouter)`):
```typescript
api.route("/logistics/dashboard", logisticsDashboardRouter);
```

- [ ] **Step 1.5: Run test to verify it passes**

Run: `pnpm --filter @carres/api test -- dashboard.test.ts`
Expected: 3 tests pass.

- [ ] **Step 1.6: Run full suite to verify no regressions**

Run: `pnpm test`
Expected: `Tests 240 passed (240)` (was 237 + 3 new).

- [ ] **Step 1.7: Commit**

```bash
git add apps/api/src/routes/logistics/dashboard.ts apps/api/src/routes/logistics/dashboard.test.ts apps/api/src/index.ts
git commit -m "feat(api): logistics M2 — dashboard route wraps logistics_dashboard_summary RPC"
```

---

## Task 2: GET /api/logistics/orders (list)

**Files:**
- Create: `apps/api/src/routes/logistics/orders.ts`
- Create: `apps/api/src/routes/logistics/orders.test.ts`
- Create new zod query schema in `packages/shared/src/schemas/logistics.ts` (next step) and re-export from `packages/shared/src/index.ts`.

**Goal:** Listed orders for logistics kanban with filters. Per spec §18.3:
- `?stage=awaiting_stock|ready_to_dispatch|dispatched|delivered|all` (default `all`)
- `?search=<dl-number-or-customer-name>` (ILIKE on customer_name + exact match on dl when numeric)
- `?channel=dealers|showrooms|all` (default `all`)

Always filters `status IN ('proceed_order','delivered')` (Phase 4 only sees post-Proceed orders). Returns up to 200 rows ordered by `placed_at DESC` — no pagination per CLAUDE.md TODOS.

- [ ] **Step 2.1: Add the list query zod schema**

Modify `packages/shared/src/schemas/logistics.ts`. Append at the bottom:

```typescript
/**
 * `listLogisticsOrdersQuery` — GET /api/logistics/orders query string.
 * stage: 'all' (default) or one of the 4 logistics stages.
 * channel: 'all' (default) | 'dealers' | 'showrooms'.
 * search: free-text matched against customer_name (ILIKE) AND parsed as int for dl exact match.
 */
export const listLogisticsOrdersQuery = z.object({
  stage: z.enum(['all', 'awaiting_stock', 'ready_to_dispatch', 'dispatched', 'delivered']).default('all'),
  channel: z.enum(['all', 'dealers', 'showrooms']).default('all'),
  search: z.string().trim().max(100).optional(),
});
export type ListLogisticsOrdersQuery = z.infer<typeof listLogisticsOrdersQuery>;
```

Re-export from `packages/shared/src/index.ts` — find the block of `export { ... } from './schemas/logistics'` and add `listLogisticsOrdersQuery, type ListLogisticsOrdersQuery,`.

- [ ] **Step 2.2: Write the failing test**

Create `apps/api/src/routes/logistics/orders.test.ts` with the same boilerplate as `dashboard.test.ts` (copy lines 1-67 verbatim — the imports, makeJwt, env, beforeAll/Each/All), then add the first describe block:

```typescript
describe("GET /api/logistics/orders", () => {
  const ORDER_ROW = {
    id: "00000000-0000-0000-0000-000000000a01",
    dl: 4001,
    status: "proceed_order",
    logistics_stage: "awaiting_stock",
    warehouse_id: "00000000-0000-0000-0000-000000000w01",
    customer_name: "Tan Ah Kow",
    placed_at: "2026-05-03T10:00:00Z",
    delivery_date: "2026-05-10",
    delivery_partner_id: null,
    do_number: null,
    dispatched_at: null,
    delivered_at: null,
    showroom_id: null,
    dealer_id: "00000000-0000-0000-0000-000000000d01",
    dealers: { name: "BedHouse KL" },
  };

  function mockOrdersList(rows: typeof ORDER_ROW[]) {
    const eq = vi.fn().mockReturnThis();
    const inFn = vi.fn().mockReturnThis();
    const ilike = vi.fn().mockReturnThis();
    const or = vi.fn().mockReturnThis();
    const order = vi.fn().mockReturnThis();
    const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
    const select = vi.fn(() => ({ in: inFn, eq, ilike, or, order, limit }));
    vi.mocked(userClient).mockReturnValue({
      from: vi.fn(() => ({ select })),
    } as any);
    return { eq, inFn, ilike, or, order, limit };
  }

  it("returns orders for logistics with default 'all' stage and 'all' channel", async () => {
    const { inFn, order, limit } = mockOrdersList([ORDER_ROW]);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/orders", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orders: any[] };
    expect(body.orders).toHaveLength(1);
    expect(body.orders[0]?.dl).toBe(4001);
    expect(inFn).toHaveBeenCalledWith("status", ["proceed_order", "delivered"]);
    expect(order).toHaveBeenCalledWith("placed_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(200);
  });

  it("filters by stage when query param provided", async () => {
    const { eq } = mockOrdersList([ORDER_ROW]);
    const jwt = await makeJwt("logistics");
    await app.fetch(
      new Request("http://t/api/logistics/orders?stage=ready_to_dispatch", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(eq).toHaveBeenCalledWith("logistics_stage", "ready_to_dispatch");
  });

  it("filters by channel=dealers excludes showroom orders", async () => {
    const m = mockOrdersList([ORDER_ROW]);
    const jwt = await makeJwt("logistics");
    await app.fetch(
      new Request("http://t/api/logistics/orders?channel=dealers", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    // dealers channel: showroom_id IS NULL
    const calls = (m as any).eq.mock.calls;
    expect(calls.find((c: any[]) => c[0] === 'showroom_id' && c[1] === null)).toBeTruthy();
  });

  it("returns 422 for invalid stage", async () => {
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/orders?stage=bogus", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 403 for dealer role", async () => {
    const from = vi.fn();
    vi.mocked(userClient).mockReturnValue({ from } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/logistics/orders", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns 401 without Authorization header", async () => {
    const res = await app.fetch(new Request("http://t/api/logistics/orders"), env);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2.3: Run test to verify it fails**

Run: `pnpm --filter @carres/api test -- orders.test.ts`
Expected: FAIL with route returns 404.

- [ ] **Step 2.4: Write the minimal route file with the list handler**

Create `apps/api/src/routes/logistics/orders.ts`:

```typescript
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  abandonOrderInput,
  assignPartnerInput,
  attachDoInput,
  listLogisticsOrdersQuery,
  recheckStockInput,
  warehousePickInput,
} from "@carres/shared";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/logistics/orders — Phase 4 M2 backend orders subsystem.
 *
 * Endpoints:
 *   GET  /                     — list with stage/channel/search filters
 *   GET  /:id                  — detail with stock + linked POs + history
 *   POST /:id/assign-partner   — logistics_assign_partner RPC (D1.dispatch step 1)
 *   POST /:id/attach-do        — logistics_attach_do_and_deliver RPC (D1.dispatch step 2)
 *   POST /:id/abandon          — logistics_abandon_order RPC (A6 cancel)
 *   POST /:id/warehouse        — logistics_warehouse_pick RPC (manual override)
 *   POST /:id/recheck-stock    — re-runs pick_warehouse + calc_shortages (E1)
 *
 * Pattern: matches apps/api/src/routes/principal/dealers.ts (multi-endpoint
 * with inline mapPgError). Logistics-only role guard at top via middleware.
 */
const logisticsOrdersRouter = new Hono<AppEnv>();

// Inline logistics-only guard — fast 403 before any Supabase round-trip.
logisticsOrdersRouter.use("*", async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "logistics") {
    throw new HTTPException(403, { message: "Logistics only" });
  }
  await next();
});

/** SQLSTATE -> HTTP body+status. Mirrors principal/dealers.ts. */
function mapPgError(error: { code?: string; message?: string; details?: string }) {
  switch (error.code) {
    case "42501":
      return { status: 403 as const, body: { error: "forbidden", code: "forbidden", message: error.message ?? "forbidden" } };
    case "42P01":
      return { status: 404 as const, body: { error: "not_found", code: "not_found", message: error.message ?? "not found" } };
    case "22023":
      return { status: 422 as const, body: { error: "invalid_param", code: "invalid_param", message: error.message ?? "invalid param" } };
    case "P0001":
      return { status: 422 as const, body: { error: "rule_violation", code: error.details ?? "invalid_param", message: error.message ?? "rule violation" } };
    default:
      return { status: 500 as const, body: { error: "rpc_failed", code: "rpc_failed", message: error.message ?? "rpc failed" } };
  }
}

// ----- GET / list -----
logisticsOrdersRouter.get("/", async (c) => {
  const parsed = listLogisticsOrdersQuery.safeParse({
    stage: c.req.query("stage") ?? undefined,
    channel: c.req.query("channel") ?? undefined,
    search: c.req.query("search") ?? undefined,
  });
  if (!parsed.success) {
    return c.json(
      { error: "invalid_query", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid query" },
      422,
    );
  }
  const { stage, channel, search } = parsed.data;

  const sb = userClient(c.env, c.var.auth.jwt);
  let q = sb
    .from("orders")
    .select(
      "id, dl, status, logistics_stage, warehouse_id, customer_name, placed_at, delivery_date, delivery_partner_id, do_number, dispatched_at, delivered_at, showroom_id, dealer_id, dealers(name)",
    )
    .in("status", ["proceed_order", "delivered"]);

  if (stage !== "all") q = q.eq("logistics_stage", stage);
  if (channel === "dealers") q = q.eq("showroom_id", null);
  if (channel === "showrooms") q = q.not("showroom_id", "is", null);
  if (search) {
    const asInt = Number.parseInt(search, 10);
    if (Number.isFinite(asInt)) {
      q = q.or(`customer_name.ilike.%${search}%,dl.eq.${asInt}`);
    } else {
      q = q.ilike("customer_name", `%${search}%`);
    }
  }

  q = q.order("placed_at", { ascending: false }).limit(200);
  const { data, error } = await q;
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ orders: data ?? [] });
});

export default logisticsOrdersRouter;
```

- [ ] **Step 2.5: Mount in `index.ts`**

Add import:
```typescript
import logisticsOrdersRouter from "./routes/logistics/orders";
```

Add mount (after the dashboard mount from Task 1):
```typescript
api.route("/logistics/orders", logisticsOrdersRouter);
```

- [ ] **Step 2.6: Run test to verify it passes**

Run: `pnpm --filter @carres/api test -- orders.test.ts`
Expected: 6 tests pass.

- [ ] **Step 2.7: Run full suite for regressions**

Run: `pnpm test`
Expected: `Tests 246 passed (246)` (was 240 + 6 new).

- [ ] **Step 2.8: Commit**

```bash
git add apps/api/src/routes/logistics/orders.ts apps/api/src/routes/logistics/orders.test.ts apps/api/src/index.ts packages/shared/src/schemas/logistics.ts packages/shared/src/index.ts
git commit -m "feat(api): logistics M2 — GET /orders list with stage/channel/search filters"
```

---

## Task 3: GET /api/logistics/orders/:id (detail)

**Files:**
- Modify: `apps/api/src/routes/logistics/orders.ts` (add handler)
- Modify: `apps/api/src/routes/logistics/orders.test.ts` (add tests)

**Goal:** Aggregated detail per spec §18.3 OrderDetailDrawer:
- Order base + lines + addons (compute total client-side same as dealers.ts pattern)
- Dealer + showroom info (already joined in list query, expand on detail)
- Source warehouse name + per-line stock_balances (`{ sku, on_hand, reserved }`)
- Linked POs via `dl = $1 OR $1 = ANY(dl_refs)` with their `purchase_order_lines`
- Order history timeline

Multiple `.from()` queries in the route, joined client-side. No new RPC.

- [ ] **Step 3.1: Write the failing test**

Append to `orders.test.ts`:

```typescript
describe("GET /api/logistics/orders/:id", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";

  function mockDetailQueries(opts: {
    order?: any;
    lines?: any[];
    addons?: any[];
    history?: any[];
    pos?: any[];
    poLines?: any[];
    warehouse?: any;
    stockBalances?: any[];
  }) {
    const fromImpl = vi.fn((table: string) => {
      const chain: any = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), single: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockReturnThis() };
      const promise = (data: any) => Promise.resolve({ data, error: null });
      switch (table) {
        case 'orders':
          chain.maybeSingle = vi.fn(() => promise(opts.order ?? null));
          break;
        case 'order_lines':
          chain.eq = vi.fn(() => promise(opts.lines ?? []));
          break;
        case 'order_addons':
          chain.eq = vi.fn(() => promise(opts.addons ?? []));
          break;
        case 'order_history':
          chain.order = vi.fn(() => promise(opts.history ?? []));
          break;
        case 'purchase_orders':
          chain.or = vi.fn(() => promise(opts.pos ?? []));
          break;
        case 'purchase_order_lines':
          chain.in = vi.fn(() => promise(opts.poLines ?? []));
          break;
        case 'warehouses':
          chain.maybeSingle = vi.fn(() => promise(opts.warehouse ?? null));
          break;
        case 'stock_balances':
          chain.in = vi.fn(() => promise(opts.stockBalances ?? []));
          break;
      }
      return chain;
    });
    vi.mocked(userClient).mockReturnValue({ from: fromImpl } as any);
    return fromImpl;
  }

  it("returns 404 when order does not exist", async () => {
    mockDetailQueries({ order: null });
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("returns aggregated detail for an awaiting_stock order", async () => {
    mockDetailQueries({
      order: {
        id: ORDER_ID, dl: 4001, status: "proceed_order", logistics_stage: "awaiting_stock",
        warehouse_id: "00000000-0000-0000-0000-000000000w01",
        customer_name: "Tan Ah Kow", customer_phone: "+60123456789", customer_address: "...",
        delivery_date: "2026-05-10", placed_at: "2026-05-03T10:00:00Z",
        do_number: null, do_note: null, dispatched_at: null, delivered_at: null,
        delivery_partner_id: null, dealer_id: "00000000-0000-0000-0000-000000000d01",
        dealers: { name: "BedHouse KL" }, showroom_id: null, showrooms: null,
      },
      lines: [
        { sku: "MAT-K-001", qty: 2, unit_price: 1500 },
        { sku: "BED-K-002", qty: 1, unit_price: 800 },
      ],
      addons: [{ sku: "PIL-001", qty: 4, unit_price: 50 }],
      history: [{ text: "Order placed", by_role: "dealer", occurred_at: "2026-05-03T09:00:00Z" }],
      pos: [{ id: "PO-2030", supplier_id: "...", warehouse_id: "...", status: "open", sup_status: "pending", dl: 4001, dl_refs: null }],
      poLines: [{ po_id: "PO-2030", sku: "MAT-K-001", qty: 2, received_qty: 0 }],
      warehouse: { id: "00000000-0000-0000-0000-000000000w01", name: "KL HQ", address: "..." },
      stockBalances: [
        { sku: "MAT-K-001", warehouse_id: "00000000-0000-0000-0000-000000000w01", qty: 0, reserved: 0 },
        { sku: "BED-K-002", warehouse_id: "00000000-0000-0000-0000-000000000w01", qty: 5, reserved: 0 },
      ],
    });

    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.order.dl).toBe(4001);
    expect(body.lines).toHaveLength(2);
    expect(body.addons).toHaveLength(1);
    expect(body.total).toBe(2 * 1500 + 1 * 800 + 4 * 50);
    expect(body.warehouse.name).toBe("KL HQ");
    expect(body.stockBalances).toHaveLength(2);
    expect(body.pos).toHaveLength(1);
    expect(body.pos[0].lines).toHaveLength(1);
    expect(body.history).toHaveLength(1);
  });

  it("returns 403 for dealer role", async () => {
    const from = vi.fn();
    vi.mocked(userClient).mockReturnValue({ from } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3.2: Run test to verify it fails**

Run: `pnpm --filter @carres/api test -- orders.test.ts`
Expected: 3 new tests fail (route doesn't exist yet for `/:id`).

- [ ] **Step 3.3: Add the detail handler to `orders.ts`**

Append to `orders.ts` (before `export default`):

```typescript
// ----- GET /:id detail -----
logisticsOrdersRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);

  const { data: order, error: e1 } = await sb
    .from("orders")
    .select(
      "id, dl, status, logistics_stage, warehouse_id, customer_name, customer_phone, customer_address, customer_address_unknown, delivery_date, delivery_date_tbd, placed_at, do_number, do_note, dispatched_at, delivered_at, delivery_partner_id, dealer_id, showroom_id, dealers(name), showrooms(name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (e1) {
    const m = mapPgError(e1);
    return c.json(m.body, m.status);
  }
  if (!order) {
    return c.json({ error: "not_found", code: "not_found", message: "Order not found" }, 404);
  }

  const [linesRes, addonsRes, historyRes] = await Promise.all([
    sb.from("order_lines").select("sku, qty, unit_price").eq("order_id", id),
    sb.from("order_addons").select("sku, qty, unit_price").eq("order_id", id),
    sb.from("order_history").select("text, by_role, occurred_at").order("occurred_at", { ascending: true }),
  ]);
  if (linesRes.error) { const m = mapPgError(linesRes.error); return c.json(m.body, m.status); }
  if (addonsRes.error) { const m = mapPgError(addonsRes.error); return c.json(m.body, m.status); }
  if (historyRes.error) { const m = mapPgError(historyRes.error); return c.json(m.body, m.status); }

  const lines = linesRes.data ?? [];
  const addons = addonsRes.data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const total = [...lines, ...addons].reduce((s: number, r: any) => s + Number(r.unit_price) * Number(r.qty), 0);

  let warehouse: any = null;
  let stockBalances: any[] = [];
  if (order.warehouse_id) {
    const { data: wh } = await sb
      .from("warehouses")
      .select("id, name, address")
      .eq("id", order.warehouse_id)
      .maybeSingle();
    warehouse = wh;
    const skus = lines.map((l: any) => l.sku);
    if (skus.length > 0) {
      const { data: sb_rows } = await sb
        .from("stock_balances")
        .select("sku, warehouse_id, qty, reserved")
        .eq("warehouse_id", order.warehouse_id)
        .in("sku", skus);
      stockBalances = sb_rows ?? [];
    }
  }

  // Linked POs (own dl OR within dl_refs[]).
  const { data: pos = [] } = await sb
    .from("purchase_orders")
    .select("id, supplier_id, warehouse_id, status, sup_status, dl, dl_refs, eta")
    .or(`dl.eq.${order.dl},dl_refs.cs.{${order.dl}}`);
  let poLinesByPo: Record<string, any[]> = {};
  if (pos && pos.length > 0) {
    const poIds = pos.map((p: any) => p.id);
    const { data: poLines = [] } = await sb
      .from("purchase_order_lines")
      .select("po_id, sku, qty, received_qty")
      .in("po_id", poIds);
    poLinesByPo = (poLines ?? []).reduce((acc: Record<string, any[]>, l: any) => {
      (acc[l.po_id] ??= []).push(l);
      return acc;
    }, {});
  }
  const posWithLines = (pos ?? []).map((p: any) => ({ ...p, lines: poLinesByPo[p.id] ?? [] }));

  return c.json({
    order,
    lines,
    addons,
    total,
    warehouse,
    stockBalances,
    pos: posWithLines,
    history: historyRes.data ?? [],
  });
});
```

- [ ] **Step 3.4: Run test to verify it passes**

Run: `pnpm --filter @carres/api test -- orders.test.ts`
Expected: 3 new tests pass (9 total in this file).

- [ ] **Step 3.5: Commit**

```bash
git add apps/api/src/routes/logistics/orders.ts apps/api/src/routes/logistics/orders.test.ts
git commit -m "feat(api): logistics M2 — GET /orders/:id detail with lines, stock, linked POs, history"
```

---

## Task 4: POST /api/logistics/orders/:id/assign-partner

**Files:**
- Modify: `apps/api/src/routes/logistics/orders.ts` (add handler)
- Modify: `apps/api/src/routes/logistics/orders.test.ts` (add tests)

**Goal:** Body `{ partnerId: uuid }` (zod: `assignPartnerInput` already exists in M1) → call `logistics_assign_partner(order_id, partner_id)` RPC. SQLSTATE mapping per §17.5 CQ2: 42501/42P01/22023/P0001.

- [ ] **Step 4.1: Write the failing tests**

Append to `orders.test.ts`:

```typescript
describe("POST /api/logistics/orders/:id/assign-partner", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";
  const PARTNER_ID = "00000000-0000-0000-0000-000000000p01";

  it("returns 200 on successful RPC call", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: ORDER_ID, dispatched_at: "2026-05-03T11:00:00Z" }, error: null,
    });
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/assign-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: PARTNER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("logistics_assign_partner", {
      p_order_id: ORDER_ID,
      p_partner_id: PARTNER_ID,
    });
  });

  it("returns 422 when partnerId is not a uuid", async () => {
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/assign-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: "not-a-uuid" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when body is empty", async () => {
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/assign-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("maps SQLSTATE 42P01 → 404", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "42P01", message: "order not found" } });
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/assign-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: PARTNER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("maps SQLSTATE 22023 → 422 wrong_stage", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "22023", message: "wrong stage", details: "wrong_stage" } });
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/assign-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: PARTNER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 403 for non-logistics role", async () => {
    const rpc = vi.fn();
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/assign-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: PARTNER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4.2: Run test to verify it fails**

Run: `pnpm --filter @carres/api test -- orders.test.ts`
Expected: 6 new tests fail (route doesn't exist yet).

- [ ] **Step 4.3: Add the handler to `orders.ts`**

Append:

```typescript
// ----- POST /:id/assign-partner -----
logisticsOrdersRouter.post("/:id/assign-partner", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { body = {}; }
  const parsed = assignPartnerInput.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid input" },
      422,
    );
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("logistics_assign_partner", {
    p_order_id: c.req.param("id"),
    p_partner_id: parsed.data.partnerId,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ order: data });
});
```

- [ ] **Step 4.4: Run test to verify it passes**

Run: `pnpm --filter @carres/api test -- orders.test.ts`
Expected: 6 new tests pass (15 total in this file).

- [ ] **Step 4.5: Commit**

```bash
git add apps/api/src/routes/logistics/orders.ts apps/api/src/routes/logistics/orders.test.ts
git commit -m "feat(api): logistics M2 — POST /orders/:id/assign-partner wraps logistics_assign_partner RPC"
```

---

## Task 5: POST /api/logistics/orders/:id/attach-do

**Files:**
- Modify: `apps/api/src/routes/logistics/orders.ts`
- Modify: `apps/api/src/routes/logistics/orders.test.ts`

**Goal:** Body `{ doNumber, doNote?, signed: true }` → `logistics_attach_do_and_deliver(order_id, do_number, do_note)` RPC. The RPC handles stock deduction (qty -= line.qty AND reserved -= line.qty) and flips status to delivered. Per spec §18.3 DOAttachModal, `signed: literal(true)` is a required UI gate — the zod already enforces this.

- [ ] **Step 5.1: Write the failing tests**

Append to `orders.test.ts`:

```typescript
describe("POST /api/logistics/orders/:id/attach-do", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";
  const VALID = { doNumber: "DO-9801", doNote: "Delivered to lobby", signed: true };

  it("returns 200 on success and calls RPC with snake_case args", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: ORDER_ID, delivered_at: "2026-05-03T11:00:00Z" }, error: null,
    });
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/attach-do`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("logistics_attach_do_and_deliver", {
      p_order_id: ORDER_ID,
      p_do_number: "DO-9801",
      p_do_note: "Delivered to lobby",
    });
  });

  it("rejects when signed is false", async () => {
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/attach-do`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ doNumber: "DO-9801", signed: false }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects when doNumber is < 3 chars", async () => {
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/attach-do`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ doNumber: "DO", signed: true }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("passes p_do_note as null when omitted", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/attach-do`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ doNumber: "DO-9802", signed: true }),
      }),
      env,
    );
    expect(rpc).toHaveBeenCalledWith("logistics_attach_do_and_deliver", {
      p_order_id: ORDER_ID,
      p_do_number: "DO-9802",
      p_do_note: null,
    });
  });

  it("maps P0001 do_required → 422 with code", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "P0001", message: "DO required", details: "do_required" } });
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/attach-do`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as any;
    expect(body.code).toBe("do_required");
  });

  it("returns 403 for non-logistics role", async () => {
    const rpc = vi.fn();
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/attach-do`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5.2: Run test to verify it fails**

Run: `pnpm --filter @carres/api test -- orders.test.ts`
Expected: 6 new tests fail.

- [ ] **Step 5.3: Add the handler to `orders.ts`**

Append:

```typescript
// ----- POST /:id/attach-do -----
logisticsOrdersRouter.post("/:id/attach-do", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { body = {}; }
  const parsed = attachDoInput.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid input" },
      422,
    );
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("logistics_attach_do_and_deliver", {
    p_order_id: c.req.param("id"),
    p_do_number: parsed.data.doNumber,
    p_do_note: parsed.data.doNote ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ order: data });
});
```

- [ ] **Step 5.4: Run test to verify it passes**

Run: `pnpm --filter @carres/api test -- orders.test.ts`
Expected: 6 new tests pass (21 total).

- [ ] **Step 5.5: Commit**

```bash
git add apps/api/src/routes/logistics/orders.ts apps/api/src/routes/logistics/orders.test.ts
git commit -m "feat(api): logistics M2 — POST /orders/:id/attach-do wraps logistics_attach_do_and_deliver RPC"
```

---

## Task 6: POST /api/logistics/orders/:id/abandon

**Files:**
- Modify: `apps/api/src/routes/logistics/orders.ts`
- Modify: `apps/api/src/routes/logistics/orders.test.ts`

**Goal:** Body `{ reason: string }` → `logistics_abandon_order(order_id, reason)` RPC. RPC sets `status='cancelled'`, `logistics_stage=NULL`, releases `reserved` stock. Does NOT issue refund (Phase 5 Finance).

- [ ] **Step 6.1: Write the failing tests**

Append to `orders.test.ts`:

```typescript
describe("POST /api/logistics/orders/:id/abandon", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";

  it("returns 200 on success", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: ORDER_ID, status: "cancelled" }, error: null });
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/abandon`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Customer requested cancel" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("logistics_abandon_order", {
      p_order_id: ORDER_ID,
      p_reason: "Customer requested cancel",
    });
  });

  it("returns 422 when reason is empty", async () => {
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/abandon`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("maps 22023 wrong_status → 422", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "22023", message: "wrong status", details: "wrong_status" } });
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/abandon`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "test" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 403 for non-logistics", async () => {
    const rpc = vi.fn();
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/abandon`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "test" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6.2: Run test to verify it fails**

Run: `pnpm --filter @carres/api test -- orders.test.ts`
Expected: 4 new tests fail.

- [ ] **Step 6.3: Add the handler**

Append to `orders.ts`:

```typescript
// ----- POST /:id/abandon -----
logisticsOrdersRouter.post("/:id/abandon", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { body = {}; }
  const parsed = abandonOrderInput.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid input" },
      422,
    );
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("logistics_abandon_order", {
    p_order_id: c.req.param("id"),
    p_reason: parsed.data.reason,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ order: data });
});
```

- [ ] **Step 6.4: Run test to verify it passes**

Run: `pnpm --filter @carres/api test -- orders.test.ts`
Expected: 4 new tests pass (25 total).

- [ ] **Step 6.5: Commit**

```bash
git add apps/api/src/routes/logistics/orders.ts apps/api/src/routes/logistics/orders.test.ts
git commit -m "feat(api): logistics M2 — POST /orders/:id/abandon wraps logistics_abandon_order RPC"
```

---

## Task 7: POST /api/logistics/orders/:id/warehouse

**Files:**
- Modify: `apps/api/src/routes/logistics/orders.ts`
- Modify: `apps/api/src/routes/logistics/orders.test.ts`

**Goal:** Body `{ warehouseId: uuid }` → `logistics_warehouse_pick(order_id, warehouse_id)` RPC. Manual override; only valid when `logistics_stage = awaiting_stock` AND no open POs. The RPC re-runs shortage calc and may auto-promote to ready_to_dispatch.

- [ ] **Step 7.1: Write the failing tests**

Append to `orders.test.ts`:

```typescript
describe("POST /api/logistics/orders/:id/warehouse", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";
  const WAREHOUSE_ID = "00000000-0000-0000-0000-000000000w02";

  it("returns 200 on success", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: ORDER_ID, warehouse_id: WAREHOUSE_ID, logistics_stage: "ready_to_dispatch" }, error: null });
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/warehouse`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId: WAREHOUSE_ID }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("logistics_warehouse_pick", {
      p_order_id: ORDER_ID,
      p_warehouse_id: WAREHOUSE_ID,
    });
  });

  it("returns 422 when warehouseId is not uuid", async () => {
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/warehouse`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId: "not-a-uuid" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("maps P0001 has_open_pos → 422 with code", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "P0001", message: "PO already issued", details: "has_open_pos" } });
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/warehouse`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId: WAREHOUSE_ID }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as any;
    expect(body.code).toBe("has_open_pos");
  });

  it("returns 403 for non-logistics", async () => {
    const rpc = vi.fn();
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/warehouse`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId: WAREHOUSE_ID }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 7.2: Run test to verify it fails**

Run: `pnpm --filter @carres/api test -- orders.test.ts`
Expected: 4 new tests fail.

- [ ] **Step 7.3: Add the handler**

Append to `orders.ts`:

```typescript
// ----- POST /:id/warehouse -----
logisticsOrdersRouter.post("/:id/warehouse", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { body = {}; }
  const parsed = warehousePickInput.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid input" },
      422,
    );
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("logistics_warehouse_pick", {
    p_order_id: c.req.param("id"),
    p_warehouse_id: parsed.data.warehouseId,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ order: data });
});
```

- [ ] **Step 7.4: Run test to verify it passes**

Run: `pnpm --filter @carres/api test -- orders.test.ts`
Expected: 4 new tests pass (29 total).

- [ ] **Step 7.5: Commit**

```bash
git add apps/api/src/routes/logistics/orders.ts apps/api/src/routes/logistics/orders.test.ts
git commit -m "feat(api): logistics M2 — POST /orders/:id/warehouse wraps logistics_warehouse_pick RPC"
```

---

## Task 8: POST /api/logistics/orders/:id/recheck-stock

**Files:**
- Modify: `apps/api/src/routes/logistics/orders.ts`
- Modify: `apps/api/src/routes/logistics/orders.test.ts`

**Goal:** Empty body (zod `recheckStockInput` already exists, `.strict()` rejects extras). Re-runs `logistics_pick_warehouse(order_id)` + `logistics_calc_shortages(order_id, warehouse_id)` to refresh stock state. Per spec §17.3 E1 (proto-driven). Returns `{ warehouse_id, shortages: [{sku, qty, missing}] }`.

This route does NOT need a new RPC — it just calls the 2 existing helpers in sequence. If shortages drop to zero between visits, the response signals the frontend to refetch the order detail (which will show ready_to_dispatch from the auto-promote in `logistics_pick_warehouse`).

NOTE: M1 RPC `logistics_pick_warehouse(p_order_id)` returns the warehouse uuid OR null. M1 RPC `logistics_calc_shortages(p_order_id, p_warehouse_id)` returns a setof `(sku text, qty int, missing int)`. The route composes both.

- [ ] **Step 8.1: Write the failing tests**

Append to `orders.test.ts`:

```typescript
describe("POST /api/logistics/orders/:id/recheck-stock", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";
  const WH_ID = "00000000-0000-0000-0000-000000000w01";

  it("returns 200 with shortages list", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: WH_ID, error: null })
      .mockResolvedValueOnce({ data: [{ sku: "MAT-K-001", qty: 2, missing: 2 }], error: null });
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/recheck-stock`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.warehouseId).toBe(WH_ID);
    expect(body.shortages).toEqual([{ sku: "MAT-K-001", qty: 2, missing: 2 }]);
    expect(rpc).toHaveBeenNthCalledWith(1, "logistics_pick_warehouse", { p_order_id: ORDER_ID });
    expect(rpc).toHaveBeenNthCalledWith(2, "logistics_calc_shortages", { p_order_id: ORDER_ID, p_warehouse_id: WH_ID });
  });

  it("returns warehouseId=null and empty shortages when no warehouse pickable", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: null });
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/recheck-stock`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.warehouseId).toBeNull();
    expect(body.shortages).toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("returns 422 when body has extra keys (.strict)", async () => {
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/recheck-stock`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ unexpected: "key" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 403 for non-logistics", async () => {
    const rpc = vi.fn();
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/recheck-stock`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 8.2: Run test to verify it fails**

Run: `pnpm --filter @carres/api test -- orders.test.ts`
Expected: 4 new tests fail.

- [ ] **Step 8.3: Add the handler**

Append to `orders.ts`:

```typescript
// ----- POST /:id/recheck-stock -----
logisticsOrdersRouter.post("/:id/recheck-stock", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { body = {}; }
  const parsed = recheckStockInput.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid input" },
      422,
    );
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const orderId = c.req.param("id");

  const { data: wh, error: e1 } = await sb.rpc("logistics_pick_warehouse", { p_order_id: orderId });
  if (e1) {
    const m = mapPgError(e1);
    return c.json(m.body, m.status);
  }
  if (!wh) {
    return c.json({ warehouseId: null, shortages: [] });
  }
  const { data: shortages, error: e2 } = await sb.rpc("logistics_calc_shortages", { p_order_id: orderId, p_warehouse_id: wh });
  if (e2) {
    const m = mapPgError(e2);
    return c.json(m.body, m.status);
  }
  return c.json({ warehouseId: wh, shortages: shortages ?? [] });
});
```

- [ ] **Step 8.4: Run test to verify it passes**

Run: `pnpm --filter @carres/api test -- orders.test.ts`
Expected: 4 new tests pass (33 total in this file).

- [ ] **Step 8.5: Commit**

```bash
git add apps/api/src/routes/logistics/orders.ts apps/api/src/routes/logistics/orders.test.ts
git commit -m "feat(api): logistics M2 — POST /orders/:id/recheck-stock composes pick_warehouse + calc_shortages"
```

---

## Task 9: M2 smoke test against live dev server

**Files:** none — verification only.

**Goal:** Boot dev server, hit each new endpoint with `curl` against real Supabase to confirm mocked unit tests reflect reality.

- [ ] **Step 9.1: Boot dev server**

Run (in background): `pnpm dev`
Wait until both `web :5173` and `api :8787` respond.

- [ ] **Step 9.2: Get a logistics JWT**

Run:
```bash
curl -s -X POST http://localhost:8787/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"logistics@carres.com","password":"111"}' | jq -r .session.access_token
```
Expected: Long JWT string. Save as `JWT=<token>`.

- [ ] **Step 9.3: Hit the dashboard endpoint**

Run:
```bash
curl -s http://localhost:8787/api/logistics/dashboard -H "Authorization: Bearer $JWT" | jq .
```
Expected: JSON with `kpis`, `pipeline`, `open_pos`, `low_stock`. Status 200.

- [ ] **Step 9.4: Hit the orders list**

Run:
```bash
curl -s http://localhost:8787/api/logistics/orders -H "Authorization: Bearer $JWT" | jq '.orders | length, .orders[0]'
```
Expected: order count + first order shape (dl, customer_name, logistics_stage, dealer_name).

- [ ] **Step 9.5: Hit a stage-filtered list**

Run:
```bash
curl -s "http://localhost:8787/api/logistics/orders?stage=delivered" -H "Authorization: Bearer $JWT" | jq '.orders | length'
```
Expected: Count of `delivered` orders only.

- [ ] **Step 9.6: Hit a 403 with dealer JWT**

Run (with dealer JWT from `sara@carres.com`):
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8787/api/logistics/orders -H "Authorization: Bearer $DEALER_JWT"
```
Expected: `403`.

- [ ] **Step 9.7: Hit detail of one of the orders**

Pick an `id` from step 9.4 and run:
```bash
curl -s "http://localhost:8787/api/logistics/orders/$ID" -H "Authorization: Bearer $JWT" | jq '.order.dl, .lines | length, .total'
```
Expected: order details + line count + total > 0.

If any smoke step fails: STOP and investigate. Don't move to Task 10.

---

## Task 10: M2 milestone close

**Files:**
- Update: `CLAUDE.md` §17 — bump test count and milestone progress
- Optionally: write `phase-4-m2-reflection.md` (not required mid-phase; full reflection at M6)

- [ ] **Step 10.1: Confirm clean state**

Run: `git status` → only `.gstack/` untracked.
Run: `pnpm test` → expect 270 tests passing (237 baseline + 33 new M2 tests).
Run: `pnpm typecheck` → 0 errors.
Run: `pnpm --filter @carres/api lint` (if lint script exists) → 0 errors.

- [ ] **Step 10.2: Update CLAUDE.md §17 status**

Modify the `## 17. Project status` block:
- Change `Current phase:` to `Phase 4 (Logistics) M2 done, M3-M6 pending`
- Bump `Test count:` from `215/215 green` to `270/270 green` (or actual)
- Bump `Migrations applied:` from `16` to `19`
- Remove the `Phase 4 RED LINE warning` line — RPC pattern locked, zero RLS changes

- [ ] **Step 10.3: Commit and push**

```bash
git add CLAUDE.md
git commit -m "docs(phase-4): mark M2 backend orders complete; status block updated"
git push origin main
```

- [ ] **Step 10.4: Sanity wrap**

- All 8 endpoints reachable in browser network tab
- Dev server still running for M3 to start cleanly
- Tag `phase-4-m2-complete`? Per Phase 3 pattern, tags are per-phase not per-milestone. Skip unless Loo wants a checkpoint tag.

---

## Self-review checklist (run after writing all 10 tasks)

**1. Spec coverage (M2 scope only):**

| Spec item | Task |
|---|---|
| GET /api/logistics/dashboard (§7, §17.7 P1, §18.2) | Task 1 |
| GET /api/logistics/orders list (§7, §18.3 stage chips + channel) | Task 2 |
| GET /api/logistics/orders/:id detail (§7, §18.3 OrderDetailDrawer) | Task 3 |
| POST /api/logistics/orders/:id/assign-partner (§17.2 D1.dispatch step 1, §17.5 CQ2) | Task 4 |
| POST /api/logistics/orders/:id/attach-do (§17.2 D1.dispatch step 2, §17.5 CQ2, §18.3 DOAttachModal `signed: true`) | Task 5 |
| POST /api/logistics/orders/:id/abandon (§17.4 A6, §17.5 CQ2) | Task 6 |
| POST /api/logistics/orders/:id/warehouse (§6 logistics_warehouse_pick, §17.5 CQ2 has_open_pos) | Task 7 |
| POST /api/logistics/orders/:id/recheck-stock (§17.3 E1, composes pick_warehouse + calc_shortages) | Task 8 |

Out of scope (verified):
- ❌ POST /orders/:id/issue-pos → M3
- ❌ GET /orders/:id/print-do → deferred (PDF library decision)
- ❌ All /pos/* + /warehouse/* + /movements → M3/M4

**2. Placeholder scan:** Searched plan for "TBD", "TODO" (in plan steps, not in committed code), "implement later", "fill in details" → none found in steps. The PDF deferral and issue-pos deferral are explicit `❌` items, not placeholders.

**3. Type consistency:**
- `assignPartnerInput` schema field is `partnerId` (zod) → RPC arg `p_partner_id` (snake) — handled in Task 4 Step 4.3 and Step 4.1 test assertion.
- `attachDoInput` schema field is `doNumber` / `doNote` / `signed` → RPC args `p_do_number` / `p_do_note` (signed not passed) — Task 5 Step 5.3 + Step 5.1 test.
- `abandonOrderInput` `reason` → `p_reason` — Task 6 consistent.
- `warehousePickInput` `warehouseId` → `p_warehouse_id` — Task 7 consistent.
- `recheckStockInput` `.strict()` empty object → no body → 2 RPC calls in sequence — Task 8 consistent.
- `listLogisticsOrdersQuery` `stage` / `channel` / `search` → query param parser — Task 2 consistent.

All function names referenced in tasks (`logistics_assign_partner`, `logistics_attach_do_and_deliver`, `logistics_abandon_order`, `logistics_warehouse_pick`, `logistics_pick_warehouse`, `logistics_calc_shortages`, `logistics_dashboard_summary`) exist in remote DB per the M1 verification at the start of this session.

---

## Subagent dispatch hint (for executor)

Per spec §16 "M2 ~5 hr / 2 subagents", a reasonable parallel split:

- **Subagent A — Read endpoints (Tasks 1, 2, 3)**: dashboard wrap + orders list + orders detail. Touches: dashboard.ts, orders.ts (top half), orders.test.ts (top half), index.ts. Estimated ~2 hr.
- **Subagent B — Mutation endpoints (Tasks 4, 5, 6, 7, 8)**: 5 POST handlers. Touches: orders.ts (bottom half), orders.test.ts (bottom half). Estimated ~3 hr.

⚠️ **Dispatch order matters**: Subagent A's Task 2 creates `orders.ts` and adds the `app.use('*', logistics-only guard)` middleware. Subagent B appends handlers to that file. Run A → B sequentially, NOT in parallel, to avoid merge conflicts on `orders.ts`. If the executor wants true parallelism, restructure: A does Tasks 1-3, B does Tasks 4-8 in a separate worktree, then merge.

Tasks 9-10 are sequential review/finalize — not subagent-suitable.

---

## Done criteria (M2 complete when ALL true)

- [ ] All 10 tasks committed (10 commits with `feat(api): logistics M2 —` prefix, except Task 10 which is `docs(phase-4):`).
- [ ] `pnpm test` green at 270+ tests (237 baseline + 33 new).
- [ ] `pnpm typecheck` green (0 errors across 3 packages).
- [ ] Smoke (Task 9) confirms 8 routes reachable end-to-end against real Supabase.
- [ ] CLAUDE.md §17 reflects M2 done.
- [ ] No new RLS policies (`grep -r "create policy" supabase/migrations/0017 0018 0019` returns 0).
- [ ] Dev server still running OR cleanly killable for M3 handoff.

---

## What unlocks after M2

- **M3 (procurement)** can start: needs `/orders/:id/issue-pos` + `/pos/*` endpoints. M2's mutation pattern is the template.
- **M5 (frontend)** can start in parallel with M3 if a separate session is taken: M5 needs `useQuery` hooks against M2's GET routes + `useMutation` hooks against M2's POST routes. Frontend doesn't need M3/M4 backend complete to render its scaffold.
