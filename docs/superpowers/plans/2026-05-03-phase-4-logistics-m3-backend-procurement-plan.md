# Phase 4 — Logistics M3: Backend Procurement Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 7 logistics procurement endpoints (1 list + 6 mutations) on top of M2's pattern. Add 1 new migration `0020_logistics_cancel_po.sql` (Loo approved 2026-05-03 to fill a gap M1 left out — spec §7 listed cancel PO but no RPC was built). Wire one `issue-pos` action onto the existing orders router. Frontend M5 then has a complete `pos.ts` to consume.

**Architecture:** RPC pattern identical to M2. Adds ONE new SECURITY DEFINER RPC (`logistics_cancel_po`) following the Phase 3/M1 conventions (manual `is_logistics()` guard, SQLSTATE-typed errors, audit_log entry, revoke/grant). Zero RLS changes. All other M3 endpoints wrap RPCs that M1 already shipped in `0019`.

**Tech Stack:** Hono v4 · zod · vitest · jose · supabase-js v2 · Postgres SECURITY DEFINER (same as M2)

---

## Source spec

- **Spec:** `docs/superpowers/specs/2026-05-03-phase-4-logistics-design.md`
  - §6 RPC signatures · §7 route list · §17 eng-review decisions · §18.4 LogisticsProcurement proto fidelity
- **M2 plan (pattern reference):** `docs/superpowers/plans/2026-05-03-phase-4-logistics-m2-backend-orders-plan.md`
- **Schema audit (passed):** `docs/superpowers/audits/2026-05-03-phase-4-m3-prep-schema-audit.md` — verified all `.select()` literals against live DB; M3 should query the live DB before writing any new query.

## What's in scope (M3)

| # | Endpoint | RPC | Source |
|---|---|---|---|
| 0 | (Migration 0020 + 2 zod schemas) | new `logistics_cancel_po` | This plan |
| 1 | `GET /api/logistics/pos` (list) | direct query | spec §7 |
| 2 | `POST /api/logistics/pos` (create) | `logistics_create_po` (M1) | spec §6 |
| 3 | `POST /api/logistics/pos/:id/receive` | `logistics_receive_po_line` (M1) | spec §6 |
| 4 | `POST /api/logistics/pos/:id/cancel` | `logistics_cancel_po` (NEW from Task 0) | spec §7 line 258 |
| 5 | `POST /api/logistics/pos/:id/assign-pickup-partner` | `logistics_assign_pickup_partner` (M1, F1.A) | spec §17.2/§18.4 |
| 6 | `POST /api/logistics/pos/:id/reassign-warehouse` | `logistics_reassign_po_warehouse` (M1, F1.A) | spec §17.2/§18.4 |
| 7 | `POST /api/logistics/orders/:id/issue-pos` | `logistics_issue_pos_for_order` (M1) | spec §17.2 (deferred from M2) |

## Out of scope for M3

- ❌ `GET /api/logistics/pos/:id/print` — PDF library decision deferred (TODO `phase-7-pdf-gen-options`)
- ❌ `/api/logistics/warehouse/*` — M4
- ❌ `/api/logistics/movements` — M4
- ❌ Frontend pages/modals — M5
- ❌ Cancel-PO frontend integration — M5 (route exists, UI wires it)

## File structure

**Create (4 files):**

| Path | Purpose | LOC est |
|---|---|---|
| `supabase/migrations/0020_logistics_cancel_po.sql` | New RPC + audit_log + revoke/grant | ~70 |
| `apps/api/src/routes/logistics/pos.ts` | 6 handlers + middleware + mapPgError | ~280 |
| `apps/api/src/routes/logistics/pos.test.ts` | ~32 tests covering happy + role guard + zod 422 + SQLSTATE mapping | ~700 |

**Modify (4 files):**

| Path | Change | Lines |
|---|---|---|
| `packages/shared/src/schemas/logistics.ts` | Add `listPurchaseOrdersQuery` + `cancelPoInput` schemas | ~25 |
| `packages/shared/src/index.ts` | Re-export the 2 new schemas + types | +4 |
| `apps/api/src/routes/logistics/orders.ts` | Append `POST /:id/issue-pos` handler + add `issuePosForOrderInput` to imports | ~30 |
| `apps/api/src/routes/logistics/orders.test.ts` | Append `describe("POST /api/logistics/orders/:id/issue-pos")` block (4 tests) | ~100 |
| `apps/api/src/index.ts` | Add 1 import + 1 mount for `/api/logistics/pos` | +2 |

---

## Conventions all tasks follow (carry-over from M2)

1. **Role guard runs first** — middleware-style for pos.ts (matches `principal/dealers.ts` pattern), inline for the single new handler in orders.ts.
2. **`userClient(c.env, auth.jwt)` only** — never `adminClient` (carry-over from M2 retro fix).
3. **Inline `mapPgError`** in `pos.ts` (5th copy across the codebase). Per CLAUDE.md §3: extraction deferred to M6 polish, not in M3 scope.
4. **zod parse before RPC call** — `safeParse` on `await c.req.json()` with try-catch fallback to `{}`. 422 envelope on fail: `{ error, code: 'invalid_param', message }`.
5. **SQLSTATE → HTTP** (per spec §17.5 CQ2): 42501→403 / 42P01→404 / 22023→422 / P0001→422 with `code = error.details ?? 'invalid_param'`.
6. **Test mock pattern** — copy boilerplate verbatim from `apps/api/src/routes/logistics/dashboard.test.ts` (lines 1-67). DO NOT include `adminClient: vi.fn()` (M2 retro dropped that dead mock — `pos.ts` only uses `userClient`).
7. **Commit cadence** — one commit per Task. Prefix: `feat(api): logistics M3 — <task>` (or `feat(db):` for Task 0 migration, `docs(phase-4):` for Task 9).
8. **No git push until Task 9** — local commits only across Tasks 0-8.

---

## Pre-flight (run BEFORE Task 0)

- [ ] **Step 0.1: Confirm green baseline**

```bash
pnpm test
pnpm typecheck
git status
```

Expect:
- `Tests 274 passed (274)` (M2 final + retro cleanup baseline)
- 0 typecheck errors across 3 packages
- Working tree clean except `.gstack/` and the screenshot

If anything red, STOP. Don't add work on top of broken state.

- [ ] **Step 0.2: Verify the M1 procurement RPCs exist live**

The implementer should run this once before Task 0 to confirm RPC names match what the plan assumes (saves time vs guessing):

```sql
SELECT proname FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN (
    'logistics_create_po',
    'logistics_receive_po_line',
    'logistics_assign_pickup_partner',
    'logistics_reassign_po_warehouse',
    'logistics_issue_pos_for_order',
    'is_logistics'
  )
ORDER BY proname;
```

Expect: 6 rows back. If any RPC is missing → STOP and report (M1 didn't ship as documented).

- [ ] **Step 0.3: Verify `purchase_orders.status` enum has `cancelled`**

Already confirmed by Loo on 2026-05-03 via direct SQL — values are `{open, received, cancelled}`. Task 0's migration uses `'cancelled'` with no enum change. If the implementer wants to reverify:

```sql
SELECT enumlabel FROM pg_enum e
JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'po_status'
ORDER BY enumsortorder;
```

---

## Task 0: Add migration `0020_logistics_cancel_po.sql` + 2 zod schemas + apply migration

**Files:**
- Create: `supabase/migrations/0020_logistics_cancel_po.sql`
- Modify: `packages/shared/src/schemas/logistics.ts` (append 2 schemas)
- Modify: `packages/shared/src/index.ts` (re-export 2 schemas + types)

**Goal:** Foundation for M3 — a missing RPC + 2 input schemas — applied to remote Supabase before any API code is written.

### Step 0.1: Read M1's audit_log insertion pattern

Before writing the new RPC, read `supabase/migrations/0019_logistics_rpcs.sql` and find an existing audit_log insert (e.g., search for `insert into audit_log`). Mirror its column names exactly. The likely shape is:

```sql
insert into audit_log (role, action, ref, dealer_id)
values ('logistics', 'po.cancelled', p_po_id, <derived dealer_id>);
```

If 0019's pattern uses different column names or includes extra fields, follow that pattern (don't improvise).

### Step 0.2: Create the migration file

Create `supabase/migrations/0020_logistics_cancel_po.sql` with this content:

```sql
-- =============================================================================
-- 0020_logistics_cancel_po.sql — Phase 4 M3 procurement: cancel-PO RPC
-- =============================================================================
-- Source spec: docs/superpowers/specs/2026-05-03-phase-4-logistics-design.md
--   §7  — listed cancel PO endpoint (line 258 "cancel PO (status=open only)")
--   §17 — RPC pattern, SQLSTATE error contract (CQ2)
--
-- Why this migration exists:
--   M1 spec listed `POST /api/logistics/pos/:id/cancel` but the corresponding
--   RPC was not in 0019's function set. Loo confirmed 2026-05-03: add the RPC
--   in M3 (option B from the M3 brainstorm — full RPC pattern, no direct UPDATE).
--
-- Pattern (matches 0019 exactly):
--   - SECURITY DEFINER + manual is_logistics() guard
--   - SQLSTATE codes per §17.5 CQ2:
--       42501 forbidden / 42P01 not_found / 22023 wrong_status /
--       P0001 reason_required
--   - Reason text required (matches abandon_order pattern from 0019)
--   - audit_log entry mirrors 0019's PO-related entries
--   - revoke from public + grant to authenticated (Phase 3 0013 pattern)
--
-- No stock effects: PO is for future stock that hasn't arrived yet. Cancelling
-- doesn't release any reserved stock_balances. Awaiting_stock orders waiting on
-- this PO will stay in awaiting_stock — logistics needs to issue a fresh PO or
-- abandon the order via existing logistics_abandon_order RPC.
-- =============================================================================

create or replace function public.logistics_cancel_po(
  p_po_id text,
  p_reason text
)
returns purchase_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_po purchase_orders;
  v_dealer_id uuid;
begin
  -- 1. Role guard
  if not public.is_logistics() then
    raise exception 'forbidden: logistics role required'
      using errcode = '42501', detail = 'forbidden';
  end if;

  -- 2. Reason required (mirrors abandon_order pattern)
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'reason required'
      using errcode = 'P0001', detail = 'reason_required';
  end if;

  -- 3. Fetch PO
  select * into v_po from purchase_orders where id = p_po_id;
  if not found then
    raise exception 'PO not found: %', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  -- 4. State machine: only open POs can be cancelled (spec §7 line 258)
  if v_po.status <> 'open' then
    raise exception 'PO is not open (current status: %)', v_po.status
      using errcode = '22023', detail = 'wrong_status';
  end if;

  -- 5. Derive dealer_id for audit_log (matches 0019 pattern for replenishment POs:
  --    pull from orders by dl, LIMIT 1; null when PO is stock-only with no dl)
  if v_po.dl is not null then
    select dealer_id into v_dealer_id
      from orders where dl = v_po.dl
      limit 1;
  end if;

  -- 6. Cancel
  update purchase_orders
    set status = 'cancelled',
        updated_at = now()
    where id = p_po_id
    returning * into v_po;

  -- 7. Audit (mirror 0019's column shape — verify against 0019 before commit)
  insert into audit_log (role, action, ref, dealer_id)
  values (
    'logistics',
    'po.cancelled',
    p_po_id,
    v_dealer_id
  );

  return v_po;
end;
$$;

revoke all on function public.logistics_cancel_po(text, text) from public;
grant execute on function public.logistics_cancel_po(text, text) to authenticated;
```

**Implementer must verify before commit**: that the `audit_log (role, action, ref, dealer_id)` columns match exactly what 0019 uses. If 0019 uses different column names (e.g., `actor`, `ref_id`, `actor_text`), update the insert in this migration to match. Don't guess.

### Step 0.3: Apply the migration to remote Supabase

Use the `mcp__supabase__apply_migration` tool with the migration content from Step 0.2:

```
mcp__supabase__apply_migration({
  name: "0020_logistics_cancel_po",
  query: "<full SQL from Step 0.2>"
})
```

After applying, verify the function exists:

```sql
SELECT proname FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='logistics_cancel_po';
```

Expect: 1 row.

If the migration fails (e.g., audit_log column mismatch), do NOT proceed. Read the error, adjust the SQL, retry. The migration is idempotent (`create or replace function`) so retries are safe.

### Step 0.4: Add the 2 zod schemas to packages/shared/src/schemas/logistics.ts

Append to the END of `packages/shared/src/schemas/logistics.ts`:

```typescript
/**
 * `listPurchaseOrdersQuery` — GET /api/logistics/pos query string.
 * status: 'all' (default) or one of the 3 PO statuses (open / received / cancelled).
 * supplierId: optional uuid for per-supplier filtering.
 * channel: not applicable to POs (suppliers don't have a "channel" concept).
 */
export const listPurchaseOrdersQuery = z.object({
  status: z.enum(['all', 'open', 'received', 'cancelled']).default('all'),
  supplierId: z.string().uuid().optional(),
});
export type ListPurchaseOrdersQuery = z.infer<typeof listPurchaseOrdersQuery>;

/**
 * `cancelPoInput` — POST /api/logistics/pos/:id/cancel.
 * Maps to `logistics_cancel_po(po_id, reason)` RPC (0020 migration). Reason is
 * required for the audit trail (mirrors abandonOrderInput shape).
 */
export const cancelPoInput = z.object({
  reason: z.string().min(1),
});
export type CancelPoInput = z.infer<typeof cancelPoInput>;
```

### Step 0.5: Re-export from packages/shared/src/index.ts

Find the existing `export { ... } from './schemas/logistics'` block (or similar) and add `listPurchaseOrdersQuery, cancelPoInput, type ListPurchaseOrdersQuery, type CancelPoInput` to the exports.

### Step 0.6: Verify

```bash
pnpm --filter @carres/shared test
pnpm typecheck
```

Expect: shared tests still pass (no new tests added — schema-only addition; the existing logistics.test.ts only tests handler-side schemas, not list/query schemas). Typecheck clean.

### Step 0.7: Commit

```bash
git add supabase/migrations/0020_logistics_cancel_po.sql packages/shared/src/schemas/logistics.ts packages/shared/src/index.ts
git commit -m "feat(db): 0020 — add logistics_cancel_po RPC + cancel/list zod schemas

Spec §7 line 258 listed cancel PO endpoint but M1's 0019 didn't ship the
RPC. Loo approved 2026-05-03 (option B from M3 brainstorm) to add it now
following the same SECURITY DEFINER + is_logistics() + SQLSTATE-typed
errors + audit_log pattern as 0019. State machine: only status='open'
can cancel (per spec); reason text required (mirrors abandon_order).

No stock effects: PO is future stock not yet arrived; cancelling does
not release stock_balances.reserved. Awaiting_stock orders waiting on
this PO will stay awaiting_stock until logistics issues a replacement
PO or abandons the order.

Also adds 2 zod input schemas:
  - listPurchaseOrdersQuery (status filter + optional supplier filter)
  - cancelPoInput ({ reason: min 1 char })

Migration applied to remote Supabase via mcp__supabase__apply_migration.
Verified: select proname from pg_proc returns logistics_cancel_po."
```

---

## Task 1: GET /api/logistics/pos (list)

**Files:**
- Create: `apps/api/src/routes/logistics/pos.ts`
- Create: `apps/api/src/routes/logistics/pos.test.ts`
- Modify: `apps/api/src/index.ts` (add import + mount)

**Goal:** List POs for the logistics procurement page. Filters: `?status=open|received|cancelled|all` (default all), `?supplierId=<uuid>` optional. Returns up to 200 rows ordered by `placed_at DESC`. Each PO row should include the embedded `purchase_order_lines` (multi-line summary in proto §18.4 row).

### Step 1.1: Write the failing test

Create `apps/api/src/routes/logistics/pos.test.ts`. Copy the boilerplate VERBATIM from `apps/api/src/routes/logistics/dashboard.test.ts` (lines 1-67 — vi.mock without adminClient, env, makeJwt, beforeAll/Each/All). Then add:

```typescript
describe("GET /api/logistics/pos", () => {
  const PO_ROW = {
    id: "PO-2030",
    supplier_id: "00000000-0000-0000-0000-000000000a01",
    warehouse_id: "00000000-0000-0000-0000-000000000b01",
    status: "open",
    sup_status: "pending",
    dl: 4001,
    dl_refs: null,
    eta_date: "2026-05-15",
    placed_at: "2026-05-03T10:00:00Z",
    purchase_order_lines: [
      { sku: "MAT-K-001", qty: 2, received_qty: 0 },
    ],
  };

  function mockPosList(rows: typeof PO_ROW[]) {
    const eq = vi.fn().mockReturnThis();
    const order = vi.fn().mockReturnThis();
    const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
    const select = vi.fn(() => ({ eq, order, limit }));
    vi.mocked(userClient).mockReturnValue({
      from: vi.fn(() => ({ select })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return { eq, order, limit };
  }

  it("returns POs for logistics with default 'all' status", async () => {
    const { order, limit } = mockPosList([PO_ROW]);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pos: typeof PO_ROW[] };
    expect(body.pos).toHaveLength(1);
    expect(body.pos[0]?.id).toBe("PO-2030");
    expect(order).toHaveBeenCalledWith("placed_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(200);
  });

  it("filters by status when query param provided", async () => {
    const { eq } = mockPosList([PO_ROW]);
    const jwt = await makeJwt("logistics");
    await app.fetch(
      new Request("http://t/api/logistics/pos?status=open", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(eq).toHaveBeenCalledWith("status", "open");
  });

  it("filters by supplierId when query param provided", async () => {
    const { eq } = mockPosList([PO_ROW]);
    const jwt = await makeJwt("logistics");
    const supId = "00000000-0000-0000-0000-000000000a01";
    await app.fetch(
      new Request(`http://t/api/logistics/pos?supplierId=${supId}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(eq).toHaveBeenCalledWith("supplier_id", supId);
  });

  it("returns 422 for invalid status", async () => {
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos?status=bogus", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 for invalid supplierId (not uuid)", async () => {
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos?supplierId=not-a-uuid", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 403 for dealer role (no Supabase round-trip)", async () => {
    const from = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns 401 without Authorization header", async () => {
    const res = await app.fetch(new Request("http://t/api/logistics/pos"), env);
    expect(res.status).toBe(401);
  });
});
```

### Step 1.2: Verify failing

```bash
pnpm --filter @carres/api test -- pos.test.ts
```
Expect: 7 tests fail (route not yet mounted).

### Step 1.3: Create the route file

Create `apps/api/src/routes/logistics/pos.ts`:

```typescript
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { listPurchaseOrdersQuery } from "@carres/shared";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/logistics/pos — Phase 4 M3 backend procurement subsystem.
 *
 * Endpoints implemented in this task (M3 Task 1):
 *   GET / — list with status/supplier filters
 *
 * Future M3 tasks add: POST /, POST /:id/receive, POST /:id/cancel,
 * POST /:id/assign-pickup-partner, POST /:id/reassign-warehouse.
 *
 * Pattern: matches apps/api/src/routes/logistics/orders.ts (multi-endpoint
 * router with role-only middleware + inline mapPgError + RPC wraps).
 */
const logisticsPosRouter = new Hono<AppEnv>();

// Inline logistics-only guard — fast 403 before any Supabase round-trip.
logisticsPosRouter.use("*", async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "logistics") {
    throw new HTTPException(403, { message: "Logistics only" });
  }
  await next();
});

/** SQLSTATE -> HTTP body+status. Mirrors logistics/orders.ts inline mapper. */
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
logisticsPosRouter.get("/", async (c) => {
  const parsed = listPurchaseOrdersQuery.safeParse({
    status: c.req.query("status") ?? undefined,
    supplierId: c.req.query("supplierId") ?? undefined,
  });
  if (!parsed.success) {
    return c.json(
      { error: "invalid_query", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid query" },
      422,
    );
  }
  const { status, supplierId } = parsed.data;

  const sb = userClient(c.env, c.var.auth.jwt);
  let q = sb
    .from("purchase_orders")
    .select(
      "id, supplier_id, warehouse_id, status, sup_status, dl, dl_refs, eta_date, placed_at, purchase_order_lines(sku, qty, received_qty)",
    );

  if (status !== "all") q = q.eq("status", status);
  if (supplierId) q = q.eq("supplier_id", supplierId);

  q = q.order("placed_at", { ascending: false }).limit(200);
  const { data, error } = await q;
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ pos: data ?? [] });
});

export default logisticsPosRouter;
```

### Step 1.4: Mount in index.ts

Modify `apps/api/src/index.ts`. Add import in the logistics cluster (right after `logisticsOrdersRouter`):

```typescript
import logisticsPosRouter from "./routes/logistics/pos";
```

Add mount after `api.route("/logistics/orders", logisticsOrdersRouter);`:

```typescript
api.route("/logistics/pos", logisticsPosRouter);
```

### Step 1.5: Verify pass

```bash
pnpm --filter @carres/api test -- pos.test.ts
pnpm test
pnpm typecheck
```

Expect: 7 new tests pass. Total `pnpm test` = 281 (274 + 7).

### Step 1.6: Commit

```bash
git add apps/api/src/routes/logistics/pos.ts apps/api/src/routes/logistics/pos.test.ts apps/api/src/index.ts
git commit -m "feat(api): logistics M3 — GET /pos list with status/supplier filters"
```

---

## Task 2: POST /api/logistics/pos (create)

**Files:**
- Modify: `apps/api/src/routes/logistics/pos.ts` (add import + handler)
- Modify: `apps/api/src/routes/logistics/pos.test.ts` (add describe block)

**Goal:** Body validated by `createPoInput` (M1 zod) → call `logistics_create_po` RPC. Inserts a new PO with optional `dl` (single-order) or `dlRefs` (combined cross-order bundle per spec §17.4 A7). Returns the new PO row.

### Step 2.1: Write the failing tests

Append to `pos.test.ts`:

```typescript
describe("POST /api/logistics/pos", () => {
  const SUPPLIER_ID = "00000000-0000-0000-0000-000000000a01";
  const WAREHOUSE_ID = "00000000-0000-0000-0000-000000000b01";
  const VALID = {
    supplierId: SUPPLIER_ID,
    warehouseId: WAREHOUSE_ID,
    lines: [{ sku: "MAT-K-001", qty: 2 }],
    dl: 4001,
  };

  it("returns 200 on success and calls RPC with snake_case args", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: "PO-2050", supplier_id: SUPPLIER_ID, warehouse_id: WAREHOUSE_ID, status: "open", sup_status: "pending", dl: 4001, dl_refs: null }, error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("logistics_create_po", {
      p_supplier_id: SUPPLIER_ID,
      p_warehouse_id: WAREHOUSE_ID,
      p_lines: [{ sku: "MAT-K-001", qty: 2 }],
      p_dl: 4001,
      p_dl_refs: null,
    });
  });

  it("supports combined PO with dlRefs[] (and no dl)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    await app.fetch(
      new Request("http://t/api/logistics/pos", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: SUPPLIER_ID,
          warehouseId: WAREHOUSE_ID,
          lines: [{ sku: "MAT-K-001", qty: 5 }],
          dlRefs: [4001, 4002, 4003],
        }),
      }),
      env,
    );
    expect(rpc).toHaveBeenCalledWith("logistics_create_po", {
      p_supplier_id: SUPPLIER_ID,
      p_warehouse_id: WAREHOUSE_ID,
      p_lines: [{ sku: "MAT-K-001", qty: 5 }],
      p_dl: null,
      p_dl_refs: [4001, 4002, 4003],
    });
  });

  it("returns 422 when lines is empty", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID, lines: [] }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when supplierId is not uuid", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID, supplierId: "not-a-uuid" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("maps P0001 supplier_not_found → 422 with code", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "P0001", message: "supplier missing", details: "supplier_not_found" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID),
      }),
      env,
    );
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.code).toBe("supplier_not_found");
  });

  it("returns 403 for non-logistics", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos", {
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

### Step 2.2: Verify failing

```bash
pnpm --filter @carres/api test -- pos.test.ts
```
Expect: 6 new tests fail.

### Step 2.3: Add the handler

Update `pos.ts` import line:
```typescript
import {
  createPoInput,
  listPurchaseOrdersQuery,
} from "@carres/shared";
```

Append before `export default`:

```typescript
// ----- POST / create -----
logisticsPosRouter.post("/", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { body = {}; }
  const parsed = createPoInput.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid input" },
      422,
    );
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("logistics_create_po", {
    p_supplier_id: parsed.data.supplierId,
    p_warehouse_id: parsed.data.warehouseId,
    p_lines: parsed.data.lines,
    p_dl: parsed.data.dl ?? null,
    p_dl_refs: parsed.data.dlRefs ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ po: data });
});
```

### Step 2.4: Verify + commit

```bash
pnpm --filter @carres/api test -- pos.test.ts  # 13 tests
pnpm test                                       # 287/287
pnpm typecheck                                  # 0 errors

git add apps/api/src/routes/logistics/pos.ts apps/api/src/routes/logistics/pos.test.ts
git commit -m "feat(api): logistics M3 — POST /pos create wraps logistics_create_po RPC"
```

---

## Task 3: POST /api/logistics/pos/:id/receive

**Files:** Modify `pos.ts` + `pos.test.ts`.

**Goal:** Body `{ sku, receivedQty }` (single-line receive). RPC `logistics_receive_po_line(po_id, sku, received_qty)`. The RPC handles auto-promote (orders waiting on this PO that are now fully stocked auto-flip to `ready_to_dispatch`).

### Step 3.1: Append failing tests

```typescript
describe("POST /api/logistics/pos/:id/receive", () => {
  const PO_ID = "PO-2030";

  it("returns 200 on success and calls RPC with snake_case args", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { po_status: "received", orders_promoted: ["00000000-0000-0000-0000-000000000a01"] },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/receive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sku: "MAT-K-001", receivedQty: 2 }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("logistics_receive_po_line", {
      p_po_id: PO_ID,
      p_sku: "MAT-K-001",
      p_received_qty: 2,
    });
  });

  it("returns 422 when receivedQty is zero or negative", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/receive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sku: "MAT-K-001", receivedQty: 0 }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when sku is empty", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/receive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sku: "", receivedQty: 2 }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("maps P0001 over_received → 422 with code", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "P0001", message: "over receipt", details: "over_received" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/receive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sku: "MAT-K-001", receivedQty: 99 }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.code).toBe("over_received");
  });

  it("returns 403 for non-logistics (no rpc)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/receive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sku: "MAT-K-001", receivedQty: 2 }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});
```

### Step 3.2: Verify failing → add handler → verify pass

Update `pos.ts` import to add `receivePoLineInput`:
```typescript
import {
  createPoInput,
  listPurchaseOrdersQuery,
  receivePoLineInput,
} from "@carres/shared";
```

Append before `export default`:
```typescript
// ----- POST /:id/receive -----
logisticsPosRouter.post("/:id/receive", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { body = {}; }
  const parsed = receivePoLineInput.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid input" },
      422,
    );
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("logistics_receive_po_line", {
    p_po_id: c.req.param("id"),
    p_sku: parsed.data.sku,
    p_received_qty: parsed.data.receivedQty,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});
```

### Step 3.3: Verify + commit

```bash
pnpm --filter @carres/api test -- pos.test.ts  # 18 tests
pnpm test                                       # 292/292

git add apps/api/src/routes/logistics/pos.ts apps/api/src/routes/logistics/pos.test.ts
git commit -m "feat(api): logistics M3 — POST /pos/:id/receive wraps logistics_receive_po_line RPC"
```

---

## Task 4: POST /api/logistics/pos/:id/cancel

**Files:** Modify `pos.ts` + `pos.test.ts`.

**Goal:** Body `{ reason: string }` → `logistics_cancel_po(po_id, reason)` RPC (the one Task 0 added). Returns the cancelled PO row.

### Step 4.1: Append failing tests

```typescript
describe("POST /api/logistics/pos/:id/cancel", () => {
  const PO_ID = "PO-2030";

  it("returns 200 on success and calls RPC with snake_case args", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: PO_ID, status: "cancelled" }, error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Wrong supplier selected" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("logistics_cancel_po", {
      p_po_id: PO_ID,
      p_reason: "Wrong supplier selected",
    });
  });

  it("returns 422 when reason is empty", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("maps 22023 wrong_status → 422 (PO already received/cancelled)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "22023", message: "PO not open", details: "wrong_status" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "test" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("maps 42P01 → 404 (PO not found)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "42P01", message: "PO not found", details: "po_not_found" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "test" }),
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 for non-logistics (no rpc)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/cancel`, {
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

### Step 4.2: Verify failing → add handler → verify pass

Update `pos.ts` import to add `cancelPoInput`:
```typescript
import {
  cancelPoInput,
  createPoInput,
  listPurchaseOrdersQuery,
  receivePoLineInput,
} from "@carres/shared";
```

Append before `export default`:
```typescript
// ----- POST /:id/cancel -----
logisticsPosRouter.post("/:id/cancel", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { body = {}; }
  const parsed = cancelPoInput.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid input" },
      422,
    );
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("logistics_cancel_po", {
    p_po_id: c.req.param("id"),
    p_reason: parsed.data.reason,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ po: data });
});
```

### Step 4.3: Verify + commit

```bash
pnpm --filter @carres/api test -- pos.test.ts  # 23 tests
pnpm test                                       # 297/297

git add apps/api/src/routes/logistics/pos.ts apps/api/src/routes/logistics/pos.test.ts
git commit -m "feat(api): logistics M3 — POST /pos/:id/cancel wraps logistics_cancel_po RPC (0020)"
```

---

## Task 5: POST /api/logistics/pos/:id/assign-pickup-partner

**Files:** Modify `pos.ts` + `pos.test.ts`.

**Goal:** Body `{ partnerId: uuid }` → `logistics_assign_pickup_partner(po_id, partner_id)` RPC. F1.A factory_pickup flow per spec §18.4 — sup_status `ready_for_pickup` → `pickup_assigned`.

### Step 5.1: Append failing tests

```typescript
describe("POST /api/logistics/pos/:id/assign-pickup-partner", () => {
  const PO_ID = "PO-2030";
  const PARTNER_ID = "00000000-0000-0000-0000-000000000c01";

  it("returns 200 on success and calls RPC with snake_case args", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: PO_ID, sup_status: "pickup_assigned" }, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/assign-pickup-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: PARTNER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("logistics_assign_pickup_partner", {
      p_po_id: PO_ID,
      p_partner_id: PARTNER_ID,
    });
  });

  it("returns 422 when partnerId is not uuid", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/assign-pickup-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: "not-a-uuid" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("maps 22023 wrong_sup_status → 422", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "22023", message: "wrong sup_status", details: "wrong_sup_status" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/assign-pickup-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: PARTNER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 403 for non-logistics (no rpc)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/assign-pickup-partner`, {
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

### Step 5.2: Add handler

Update `pos.ts` import to add `assignPickupPartnerInput`:
```typescript
import {
  assignPickupPartnerInput,
  cancelPoInput,
  createPoInput,
  listPurchaseOrdersQuery,
  receivePoLineInput,
} from "@carres/shared";
```

Append before `export default`:
```typescript
// ----- POST /:id/assign-pickup-partner -----
logisticsPosRouter.post("/:id/assign-pickup-partner", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { body = {}; }
  const parsed = assignPickupPartnerInput.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid input" },
      422,
    );
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("logistics_assign_pickup_partner", {
    p_po_id: c.req.param("id"),
    p_partner_id: parsed.data.partnerId,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ po: data });
});
```

### Step 5.3: Verify + commit

```bash
pnpm --filter @carres/api test -- pos.test.ts  # 27 tests
pnpm test                                       # 301/301

git add apps/api/src/routes/logistics/pos.ts apps/api/src/routes/logistics/pos.test.ts
git commit -m "feat(api): logistics M3 — POST /pos/:id/assign-pickup-partner wraps logistics_assign_pickup_partner RPC (F1.A)"
```

---

## Task 6: POST /api/logistics/pos/:id/reassign-warehouse

**Files:** Modify `pos.ts` + `pos.test.ts`.

**Goal:** Body `{ newWarehouseId: uuid }` → `logistics_reassign_po_warehouse(po_id, new_warehouse_id)`. F1.A reassign flow (currently unreachable in MVP per spec §18.4 since it requires Phase 7 partner reporting).

### Step 6.1: Append failing tests

```typescript
describe("POST /api/logistics/pos/:id/reassign-warehouse", () => {
  const PO_ID = "PO-2030";
  const NEW_WH = "00000000-0000-0000-0000-000000000d01";

  it("returns 200 on success and calls RPC with snake_case args", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: PO_ID, warehouse_id: NEW_WH, sup_status: "ready_for_pickup" }, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/reassign-warehouse`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ newWarehouseId: NEW_WH }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("logistics_reassign_po_warehouse", {
      p_po_id: PO_ID,
      p_new_warehouse_id: NEW_WH,
    });
  });

  it("returns 422 when newWarehouseId is not uuid", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/reassign-warehouse`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ newWarehouseId: "not-a-uuid" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("maps 22023 wrong_state → 422 (PO not in reassign_needed)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "22023", message: "not in reassign state", details: "wrong_state" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/reassign-warehouse`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ newWarehouseId: NEW_WH }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 403 for non-logistics (no rpc)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/reassign-warehouse`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ newWarehouseId: NEW_WH }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});
```

### Step 6.2: Add handler

Update `pos.ts` import to add `reassignPoWarehouseInput`:
```typescript
import {
  assignPickupPartnerInput,
  cancelPoInput,
  createPoInput,
  listPurchaseOrdersQuery,
  reassignPoWarehouseInput,
  receivePoLineInput,
} from "@carres/shared";
```

Append before `export default`:
```typescript
// ----- POST /:id/reassign-warehouse -----
logisticsPosRouter.post("/:id/reassign-warehouse", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { body = {}; }
  const parsed = reassignPoWarehouseInput.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid input" },
      422,
    );
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("logistics_reassign_po_warehouse", {
    p_po_id: c.req.param("id"),
    p_new_warehouse_id: parsed.data.newWarehouseId,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ po: data });
});
```

### Step 6.3: Verify + commit

```bash
pnpm --filter @carres/api test -- pos.test.ts  # 31 tests
pnpm test                                       # 305/305

git add apps/api/src/routes/logistics/pos.ts apps/api/src/routes/logistics/pos.test.ts
git commit -m "feat(api): logistics M3 — POST /pos/:id/reassign-warehouse wraps logistics_reassign_po_warehouse RPC (F1.A)"
```

---

## Task 7: POST /api/logistics/orders/:id/issue-pos (in orders.ts)

**Files:** Modify `apps/api/src/routes/logistics/orders.ts` + `apps/api/src/routes/logistics/orders.test.ts`.

**Goal:** Empty body trigger (`issuePosForOrderInput` is `z.object({}).strict()` from M1) → `logistics_issue_pos_for_order(order_id)` RPC → returns `{ pos_created: [...] }` (per spec §6 / §17.8). Lives on the `/orders/` router because the action is per-order, even though it produces POs.

### Step 7.1: Append failing tests

Append to `apps/api/src/routes/logistics/orders.test.ts`:

```typescript
describe("POST /api/logistics/orders/:id/issue-pos", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";

  it("returns 200 on success with empty body", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { pos_created: [{ id: "PO-2050", supplier_id: "00000000-0000-0000-0000-000000000a01", line_count: 1 }] },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/issue-pos`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("logistics_issue_pos_for_order", { p_order_id: ORDER_ID });
  });

  it("returns 422 when body has extra keys (.strict)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/issue-pos`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ unexpected: "key" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("maps P0001 already_issued → 422 with code (soft idempotency per spec §17.5)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "P0001", message: "POs already issued for this order", details: "already_issued" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/issue-pos`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.code).toBe("already_issued");
  });

  it("returns 403 for non-logistics (no rpc)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/issue-pos`, {
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

### Step 7.2: Add handler to orders.ts

Update orders.ts import to add `issuePosForOrderInput` alphabetically:
```typescript
import {
  abandonOrderInput,
  assignPartnerInput,
  attachDoInput,
  issuePosForOrderInput,
  listLogisticsOrdersQuery,
  recheckStockInput,
  warehousePickInput,
} from "@carres/shared";
```

Append before `export default`:
```typescript
// ----- POST /:id/issue-pos -----
logisticsOrdersRouter.post("/:id/issue-pos", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { body = {}; }
  const parsed = issuePosForOrderInput.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid input" },
      422,
    );
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("logistics_issue_pos_for_order", {
    p_order_id: c.req.param("id"),
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});
```

### Step 7.3: Verify + commit

```bash
pnpm --filter @carres/api test -- orders.test.ts  # 38 tests now
pnpm test                                          # 309/309

git add apps/api/src/routes/logistics/orders.ts apps/api/src/routes/logistics/orders.test.ts
git commit -m "feat(api): logistics M3 — POST /orders/:id/issue-pos wraps logistics_issue_pos_for_order RPC"
```

---

## Task 8: Live smoke test against running dev server

**Files:** none — verification only.

**Goal:** Confirm 7 new endpoints reachable end-to-end against real Supabase. Catch any column/schema drift before declaring M3 done (M2 caught 3 with this step).

### Step 8.1: Pre-check — dev server running

Loo's dev server should already be running (background process from earlier in session). Verify:
```bash
curl -s -o /dev/null -w "web:%{http_code}\napi:%{http_code}\n" http://localhost:5173 -L && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8787
```
Expect: web 200, api 404 (root, expected). If down: ask Loo to restart `pnpm dev`.

### Step 8.2: Get logistics JWT

Auth doesn't go through Hono — hit Supabase Auth directly. SUPABASE_ANON_KEY in `apps/api/.dev.vars`:
```bash
ANON=$(grep SUPABASE_ANON_KEY apps/api/.dev.vars | cut -d= -f2)
URL=$(grep SUPABASE_URL apps/api/.dev.vars | cut -d= -f2)
JWT=$(curl -s -X POST "$URL/auth/v1/token?grant_type=password" \
  -H "Content-Type: application/json" -H "apikey: $ANON" \
  -d '{"email":"logistics@carres.com","password":"111"}' | jq -r '.access_token // empty')
echo "JWT length: ${#JWT}"
```
Expect: JWT length ~700+ chars.

### Step 8.3: Endpoint 1 — list POs

```bash
curl -s -o /tmp/pos.json -w "STATUS=%{http_code}\n" http://localhost:8787/api/logistics/pos -H "Authorization: Bearer $JWT"
cat /tmp/pos.json | jq '{count: (.pos|length), first: .pos[0]}'
```
Expect: 200 + JSON with `pos` array. NOT 500. If 500 → schema drift. Stop and investigate.

### Step 8.4: Endpoint 1 with status filter

```bash
curl -s -o /tmp/pos_open.json -w "STATUS=%{http_code}\n" "http://localhost:8787/api/logistics/pos?status=open" -H "Authorization: Bearer $JWT"
cat /tmp/pos_open.json | jq '.pos | length'
```

### Step 8.5: Endpoint 1 invalid status → 422

```bash
curl -s -o /tmp/pos_bogus.json -w "STATUS=%{http_code}\n" "http://localhost:8787/api/logistics/pos?status=bogus" -H "Authorization: Bearer $JWT"
```
Expect: 422.

### Step 8.6: Mutation endpoints — bad body validation only (don't side-effect remote DB)

For Endpoints 2-7, send a body that triggers 422 zod validation so the route is verified without changing live DB state:

```bash
# Pick an order id from M2 earlier smoke (or query).
ORDER_ID=$(curl -s http://localhost:8787/api/logistics/orders -H "Authorization: Bearer $JWT" | jq -r '.orders[0].id // empty')

# Pick a PO id (likely none exist yet — that's fine, 404 also proves route is mounted).
PO_ID="PO-9999-fake"

# Endpoint 2 — POST /pos (create) — bad body
curl -s -o /dev/null -w "create-bad-body STATUS=%{http_code}\n" \
  -X POST "http://localhost:8787/api/logistics/pos" \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"lines":[]}'

# Endpoint 3 — POST /pos/:id/receive — bad body
curl -s -o /dev/null -w "receive-bad-body STATUS=%{http_code}\n" \
  -X POST "http://localhost:8787/api/logistics/pos/$PO_ID/receive" \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"sku":"","receivedQty":0}'

# Endpoint 4 — POST /pos/:id/cancel — bad body
curl -s -o /dev/null -w "cancel-bad-body STATUS=%{http_code}\n" \
  -X POST "http://localhost:8787/api/logistics/pos/$PO_ID/cancel" \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"reason":""}'

# Endpoint 5 — POST /pos/:id/assign-pickup-partner — bad body
curl -s -o /dev/null -w "pickup-bad-body STATUS=%{http_code}\n" \
  -X POST "http://localhost:8787/api/logistics/pos/$PO_ID/assign-pickup-partner" \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"partnerId":"not-uuid"}'

# Endpoint 6 — POST /pos/:id/reassign-warehouse — bad body
curl -s -o /dev/null -w "reassign-bad-body STATUS=%{http_code}\n" \
  -X POST "http://localhost:8787/api/logistics/pos/$PO_ID/reassign-warehouse" \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"newWarehouseId":"not-uuid"}'

# Endpoint 7 — POST /orders/:id/issue-pos — extra body (.strict)
if [ -n "$ORDER_ID" ]; then
  curl -s -o /dev/null -w "issue-pos-strict STATUS=%{http_code}\n" \
    -X POST "http://localhost:8787/api/logistics/orders/$ORDER_ID/issue-pos" \
    -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
    -d '{"unexpected":"key"}'
fi
```

Expect: all 6 statuses = 422 (zod runs, route mounted).

### Step 8.7: 403 with dealer JWT

```bash
DJWT=$(curl -s -X POST "$URL/auth/v1/token?grant_type=password" \
  -H "Content-Type: application/json" -H "apikey: $ANON" \
  -d '{"email":"dealer@carres.com","password":"111"}' | jq -r '.access_token // empty')
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8787/api/logistics/pos -H "Authorization: Bearer $DJWT"
```
Expect: 403.

If any smoke step returns an unexpected status: STOP, investigate, fix per the M2 pattern (column drift, RPC arg mismatch, etc.).

---

## Task 9: M3 milestone close — CLAUDE.md status + push

**Files:**
- Modify: `CLAUDE.md` §17

**Goal:** Update project status block to reflect M3 done + push everything (including 0020 migration commit) to origin.

### Step 9.1: Pre-flight

```bash
git status                # only .gstack/ + screenshot untracked
pnpm test 2>&1 | tail -5  # 309/309 (274 baseline + 35 new tests across M3)
pnpm typecheck 2>&1 | tail -3  # Done, 0 errors
```

If anything red, STOP. Don't push broken state.

### Step 9.2: Update CLAUDE.md §17

Edit only these lines:

| Old | New |
|---|---|
| `Current phase: Phase 4 (Logistics) M1 + M2 complete; M3-M6 pending` | `Current phase: Phase 4 (Logistics) M1 + M2 + M3 complete; M4-M6 pending` |
| `Test count: 274/274 green (shared 53 + api 122 + web 99) · 5 Playwright E2E specs` | `Test count: 309/309 green (shared 53 + api 157 + web 99) · 5 Playwright E2E specs` |
| `Migrations applied: 19 (0001-0019, all additive, zero RLS changes since Phase 1)` | `Migrations applied: 20 (0001-0020, all additive, zero RLS changes since Phase 1)` |
| `Next decision pending: M3 (procurement) start time. M2 backend orders fully shipped + smoke-verified.` | `Next decision pending: M4 (warehouse + movements) start time. M3 procurement fully shipped + smoke-verified.` |

Append to the carry-forward TODOs line: ` · phase-4-rpc-shape-audit (audit recommended next; see 2026-05-03 schema audit §Methodology gaps)`

### Step 9.3: Commit + push

```bash
git add CLAUDE.md
git commit -m "docs(phase-4): mark M3 backend procurement complete; status updated to 309 tests + 20 migrations

Phase 4 M3 shipped:
  - 1 new migration (0020 logistics_cancel_po RPC, Loo-approved)
  - 7 backend procurement endpoints (1 list + 6 mutations) covering POs
    and the new orders/:id/issue-pos action.
  - 35 new tests (32 in pos.test.ts + 4 in orders.test.ts issue-pos block)
  - Mocked unit tests + live curl smoke against real Supabase

Carry-forward: phase-4-rpc-shape-audit added per Phase 4 M3-prep schema
audit's Methodology Gaps section (RPC return-shape validation not yet
covered; recommended pre-M5 to catch the next class of bug)."

git push origin main
```

### Step 9.4: Verify push

```bash
git status                          # clean, up to date with origin/main
git log --oneline -3                # see your last commit + Task 7 + Task 6
git rev-parse HEAD; git rev-parse origin/main  # match exactly
```

---

## Self-review checklist (after writing all 9 tasks)

**1. Spec coverage (M3 scope only):**

| Spec item | Task |
|---|---|
| Migration 0020 logistics_cancel_po (Loo approved) | Task 0 |
| GET /pos list (§7) | Task 1 |
| POST /pos create (§6 logistics_create_po) | Task 2 |
| POST /pos/:id/receive (§6 logistics_receive_po_line) | Task 3 |
| POST /pos/:id/cancel (§7 line 258, NEW RPC from Task 0) | Task 4 |
| POST /pos/:id/assign-pickup-partner (§17.2 F1.A) | Task 5 |
| POST /pos/:id/reassign-warehouse (§17.2 F1.A) | Task 6 |
| POST /orders/:id/issue-pos (§17.2 — auto-issue logic, deferred from M2 §16) | Task 7 |

Out of scope (verified):
- ❌ GET /pos/:id/print → PDF deferred (TODO `phase-7-pdf-gen-options`)
- ❌ /api/logistics/warehouse/* → M4
- ❌ /api/logistics/movements → M4
- ❌ Frontend pages/modals → M5

**2. Placeholder scan:** No "TBD", "TODO" in steps. Deferred items explicit `❌`.

**3. Type consistency:**
- `createPoInput` zod fields → RPC args: `supplierId/warehouseId/lines/dl/dlRefs` → `p_supplier_id/p_warehouse_id/p_lines/p_dl/p_dl_refs` (Task 2)
- `receivePoLineInput` zod → RPC args: `sku/receivedQty` → `p_sku/p_received_qty` (Task 3)
- `cancelPoInput` zod → RPC args: `reason` → `p_reason` (Task 4)
- `assignPickupPartnerInput` zod → RPC args: `partnerId` → `p_partner_id` (Task 5)
- `reassignPoWarehouseInput` zod → RPC args: `newWarehouseId` → `p_new_warehouse_id` (Task 6)
- `issuePosForOrderInput` zod (`{}.strict()`) → RPC args: just `p_order_id` from path (Task 7)

All RPC names exist in remote DB:
- `logistics_create_po` ✅ (M1)
- `logistics_receive_po_line` ✅ (M1)
- `logistics_cancel_po` ⏳ (Task 0 creates it)
- `logistics_assign_pickup_partner` ✅ (M1)
- `logistics_reassign_po_warehouse` ✅ (M1)
- `logistics_issue_pos_for_order` ✅ (M1)

---

## Subagent dispatch hint

Per spec §16 "M3 ~4 hr / 1-2 subagents":

- **Subagent A — Foundation (Task 0)**: migration + apply + zod schemas. Touches: `0020_*.sql`, `logistics.ts`, `shared/index.ts`. Estimated ~30 min. **Must finish before Subagent B starts** (Subagent B's tests depend on the new RPC existing).
- **Subagent B — All 6 PO endpoints (Tasks 1-6)**: builds `pos.ts` + `pos.test.ts` + mounts in index.ts. Sequential within (shared file). Estimated ~2 hr.
- **Subagent C — Single orders.ts addition (Task 7)**: appends `POST /:id/issue-pos`. Touches: `orders.ts`, `orders.test.ts`. Independent of B, can run in parallel **after B finishes** (or in parallel if implementing in different files — but A→B sequence is mandatory). Estimated ~20 min.
- Tasks 8-9: sequential review/finalize, single subagent.

⚠️ **Migration apply is destructive in spirit**: even though `create or replace function` is idempotent, applying a NEW function to remote Supabase warrants verification. Subagent A must verify the RPC exists post-apply (Task 0 Step 0.3 includes the verify query).

---

## Done criteria (M3 complete when ALL true)

- [ ] All 9 tasks committed with the right prefix per Conventions §7
- [ ] `pnpm test` shows 309/309 (274 baseline + 35 new)
- [ ] `pnpm typecheck` shows 0 errors
- [ ] `mcp__supabase__list_migrations` shows `0020_logistics_cancel_po` in the list
- [ ] Smoke (Task 8) returns expected statuses for all 7 endpoints
- [ ] CLAUDE.md §17 reflects M3 done
- [ ] No new RLS policies (`grep -r "create policy" supabase/migrations/0020*` returns 0)
- [ ] Push successful (HEAD == origin/main)

## What unlocks after M3

- **M4 (warehouse + movements)** can start: needs `/warehouse/*` + `/movements` endpoints. M2/M3 mutation pattern is the template; M4 is mostly read endpoints + 1 adjust-stock RPC wrap.
- **M5 (frontend)** can start in parallel with M4 if a separate session is taken: M5 needs hooks against M2 + M3 GET/POST routes. M4 endpoints only block specific procurement-related UI panels.
