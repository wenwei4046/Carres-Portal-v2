# Phase 2A — Dealer: Orders Read Path

> **Slice 1 of 5 within Phase 2 (Dealer + Salesperson, master plan W3-W4).**
> Read-only foundation: shell + dashboard + orders kanban + order detail drawer.
> No mutations. Sets the pattern that 2B-2E reuse.

**Estimated:** 4-6h. **Branch:** `phase/2a-dealer-orders-read` (or stay on main per current convention).

---

## 1. What ships in 2A

| Layer | File | Purpose |
|---|---|---|
| API | `apps/api/src/routes/orders.ts` | `GET /api/orders` + `GET /api/orders/:id` |
| API | `apps/api/src/routes/dealers.ts` | `GET /api/dealers/me` (current dealer profile) |
| API | `apps/api/src/middleware/role-gate.ts` | already exists; used here |
| API | `apps/api/src/index.ts` | mount the new routers |
| Web | `apps/web/src/pages/dealer/DealerApp.tsx` | shell + sidebar + nested routes |
| Web | `apps/web/src/pages/dealer/DealerDashboard.tsx` | greeting + KPIs + 3-column status overview |
| Web | `apps/web/src/pages/dealer/DealerOrders.tsx` | 3-tab list (Place / Proceed / Delivered) |
| Web | `apps/web/src/pages/dealer/DealerOrderDetail.tsx` | drawer/modal — read-only stages + customer + items + activity |
| Web | `apps/web/src/lib/queries.ts` | TanStack Query hooks (`qk`, `useOrders`, `useOrder`, `useDealerSelf`) |
| Web | `apps/web/src/lib/order-totals.ts` | pure functions — `orderTotal`, `lineSubtotal`, `addonSubtotal`, `floorSurcharge` |
| Web | `apps/web/src/App.tsx` | add `/dealer/*` route gated by `RequireAuth` + role check |
| Tests | `apps/api/src/routes/orders.test.ts` | 4 cases: no auth 401, dealer scoped to own, principal sees all, get(id) populates lines |
| Tests | `apps/web/src/lib/order-totals.test.ts` | pure-function tests for the math |
| Tests | `e2e/dealer-orders.spec.ts` | login → dashboard → orders tab → click row → detail visible |

**Out of scope** (deferred to later 2B-2E):
- Mutations (proceed, cancel, recordPayment, fixDate, editCustomer)
- New Order wizard (Phase 2B)
- Settings (outlets, salespersons, top-up) (Phase 2D)
- DealerProducts catalog browser (Phase 2C)
- Showroom mode + Salesperson role scoping (Phase 2E)
- Mobile bottom-tab nav (Phase 2E)
- "Ready to proceed" blocker logic (Phase 2C — needs the proceed mutation context)

The detail drawer in 2A shows the order **read-only**: stages, customer, items list, paid amount, history. The action panel (Proceed button, Top-up button, Add address button) is shown disabled with a "Phase 2C will enable" tooltip — or simply omitted. Decide in eng-review.

---

## 2. API contract

### `GET /api/orders`

Returns the caller's scoped list, lightweight shape (no rels). RLS enforces scoping; the route does no extra `WHERE`.

**Query params (all optional):**
- `status` — one of `place | proceed_order | delivered | cancelled`
- `outletId` — uuid (for salesperson scope, Phase 2E uses)
- `salespersonId` — uuid

**Response shape (zod-validated):**
```ts
const orderListItemSchema = z.object({
  id: z.string().uuid(),
  dl: z.number().int(),
  status: z.enum(["place","proceed_order","delivered","cancelled"]),
  channel: z.string(),
  dealerId: z.string().uuid(),
  outletId: z.string().uuid().nullable(),
  salespersonId: z.string().uuid().nullable(),
  customer: z.object({
    name: z.string(),
    phone: z.string().nullable(),
    address: z.string().nullable(),
    addressUnknown: z.boolean(),
  }),
  delivery: z.object({
    date: z.string().nullable(),
    dateTbd: z.boolean(),
    floor: z.number(),
    hasLift: z.boolean(),
  }),
  paid: z.number(),
  placedAt: z.string(),  // ISO
  // No lines/addons/history in the list response — those load lazily in detail.
});
const ordersResponseSchema = z.object({
  orders: z.array(orderListItemSchema),
  total: z.number().int(),
});
```

### `GET /api/orders/:id`

Returns the full order with `lines`, `addons`, `history`. RLS rejects with 404-ish (RLS makes the row invisible, so the PostgREST/PostgREST-equivalent returns empty — Hono normalizes to 404).

**Response:** `MeOrder` = `OrderListItem` + `lines: OrderLine[] + addons: OrderAddon[] + history: OrderHistory[]`. Schema lives in `packages/shared/src/schemas/orders.ts` (new file).

### `GET /api/dealers/me`

Returns the dealer profile of the JWT's `dealer_id`, or 403 if the role isn't `dealer`/`salesperson`.

**Response:**
```ts
const dealerSelfSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  region: z.string().nullable(),
  status: z.enum(["active","suspended","pending"]),
  creditLimit: z.number(),
  paymentTerms: z.string().nullable(),
  depositBalance: z.number(),
  channel: z.string(),
});
```

---

## 3. Data flow

```
Browser
  ↓ apiFetch("/api/orders?status=place")
Hono (apps/api)
  - authMiddleware verifies ES256 JWT
  - requireRole(["dealer","salesperson","principal","logistics","finance","bd"])
  - userClient(env, jwt) → supabase.from("orders").select(...)
  - RLS auto-scopes by dealer_id
  ↓
Postgres (RLS-filtered rows returned)
  ↓
adapters.orderFromRow → ordersResponseSchema.parse → JSON
  ↓
Browser
  - TanStack Query caches under qk.orders({status})
  - Component renders camelCase domain object
```

**Key invariants:**
- API never bypasses RLS for read paths (no `service_role` here).
- Adapters live in `packages/shared/src/adapters.ts` (already done in Phase 1) — both API and web import the same conversion.
- Zod schemas live in `packages/shared/src/schemas/orders.ts` — both consumers validate the same shape.

---

## 4. Web architecture

### Routes (React Router 7)

```tsx
// apps/web/src/App.tsx
<Routes>
  <Route path="/login" element={<Login />} />
  <Route path="/me" element={<RequireAuth><Me /></RequireAuth>} />
  <Route path="/dealer/*" element={
    <RequireAuth><RequireRole roles={["dealer","salesperson"]}><DealerApp /></RequireRole></RequireAuth>
  } />
  <Route path="/" element={<Navigate to="/dealer" replace />} />
  <Route path="*" element={<Navigate to="/dealer" replace />} />
</Routes>
```

`DealerApp` renders the sidebar + nested `<Routes>` for `/dealer`, `/dealer/orders`, `/dealer/orders/:id`. Open question: should `/dealer/orders/:id` open a drawer over the orders list, or a full page? Prototype uses a modal over the list. Match.

Sidebar items: Dashboard, Orders, Products (link visible but page is "Coming in 2C"), Settings (same).

### State

- **Server state:** TanStack Query, hooks in `apps/web/src/lib/queries.ts`
  - `useOrders(filters)` → list
  - `useOrder(id)` → single + rels
  - `useDealerSelf()` → current dealer
- **UI state:** local `useState` in components (active tab, open detail id, etc.)
- **Auth state:** existing Zustand `useAuth` from Phase 1 (no changes)

### Order total math

Pure functions in `apps/web/src/lib/order-totals.ts`. Mirrors prototype helpers:
- `lineSubtotal(order, skus)`: sum `line.unitPrice * qty`. (The unit price is locked at order time and stored on the line — no need for live SKU price.)
- `addonSubtotal(order, addons)`: sum `addon.unitPrice * qty`. Same — locked at order time.
- `floorSurcharge(order, floorConfig)`: stair carry math from `floor_config` table. **2A defers floor_config fetch — return 0 always for now** and re-baseline once we add the floor_config endpoint in 2C.
- `orderTotal(order, ...)`: sum of the above.

**Why these are pure functions, not hooks:** they're called inside render, want to be cheap, no async deps. Test in isolation.

---

## 5. Test plan

Coverage diagram from /plan-eng-review (2026-05-02): 16 codepaths identified; the cases below close all 5 gaps the diagram flagged.

| Layer | Tool | Cases |
|---|---|---|
| Pure | vitest | `order-totals.test.ts` — 4 cases (empty, lines only, lines+addons, lines+addons+stair-stub-zero) |
| API | vitest + msw + JWKS injection | `orders.test.ts` — (1) no auth 401, (2) dealer JWT returns own scoped list, (3) status filter applied, (4) outletId/salespersonId filter applied, (5) `/orders/:id` populates lines/addons/history via PostgREST nested, (6) `/orders/:id` returns 404 for unknown / RLS-hidden id (same message), (7) different-dealer JWT returns disjoint list (RLS proof), (8) principal JWT sees all dealers' orders |
| API | vitest + JWKS | `dealers.test.ts` — (1) `/me` returns dealer for dealer JWT, (2) `/me` returns dealer for salesperson JWT, (3) 403 for principal JWT (no dealer scope), (4) 404 if `dealer_id` in JWT points to a row that doesn't exist |
| E2E | Playwright | `dealer-orders.spec.ts` — (1) dealer login → /dealer/dashboard renders + counts shown, (2) navigate to Orders tab → at least 1 order visible per status tab, (3) click row → modal opens with customer name, (4) close modal returns to list with prior tab active, (5) principal logging in is redirected from /dealer to /me (RequireRole proof) |

**Acceptance** (must hit all before declaring 2A complete):
- ✅ All vitest tests pass
- ✅ E2E spec passes against `pnpm dev`
- ✅ `/design-review` skill verifies sidebar + dashboard + orders kanban match prototype visually (≥ 8/10)
- ✅ Dealer login → no console errors → kanban shows orders
- ✅ Different dealer logging in (e.g. another seed dealer) sees ONLY their orders (RLS proof)
- ✅ Typecheck clean across all 3 packages
- ✅ `grep -ri SERVICE_ROLE apps/web/dist` after `vite build` → 0 matches

---

## 6. Decisions locked via /plan-eng-review (2026-05-02)

1. **Detail view = modal** over `/dealer/orders` (matches prototype). Deep-link via `?open=<id>` query param. Phase 3 principal impersonation can ride the same query param later.
2. **Order list item info = `lineCount` field** ("3 items" shown in row). Detail modal shows full items. Trades pixel-perfect prototype fidelity for SQL simplicity. itemSummary string is deferred.
3. **`useOrders` cache strategy = `staleTime: 30_000`**. Mutations in 2C invalidate explicitly via TanStack queryClient.
4. **`orders` route — accepts `dealerId` query param but ignores it for dealer/salesperson JWTs.** RLS enforces. Principal in Phase 3 will use it for cross-dealer filtering.
5. **Total computed client-side** in `order-totals.ts`. List view skips total entirely (only paid + lineCount + status). Detail modal loads rels then computes.
6. **404 behavior = same message for "not found" and "RLS-hidden".** Don't reveal whether the row exists but is invisible to this dealer.
7. **One `orderSchema` with optional `lines/addons/history`.** Aligns 1:1 with `domain.Order`. List endpoint returns array without rels; detail returns single with rels. No schema duplication.
8. **`/api/orders/:id` uses PostgREST nested syntax**: `supabase.from("orders").select("*, order_lines(*), order_addons(*), order_history(*)").eq("id", id).single()`. One round-trip. Each child table's RLS still applies independently.
9. **`RequireRole` web wrapper** at `apps/web/src/lib/require-role.tsx`. Generic `<RequireRole roles={Role[]}>`. Reads from `useAuth` Zustand. Re-used by Phases 3-9.
10. **Sidebar inactive items (Products / Settings) = disabled grey + tooltip "Coming in Phase 2C/2D".** Gives Loo a preview of the full nav without orphaning links.

---

## 7. What this slice doesn't validate (acknowledge gaps)

- We can't fully test the prototype's "Ready to proceed" indicator until the proceed mutation lands (2C). 2A renders a stub: blockers count appears, but no proceed button.
- The visual "this month $RM" KPI on Dashboard is omitted from 2A — needs catalog data for total math. Dashboard shows counts only.
- No real customer-facing pages yet (Showroom is 2E).

## 7a. Failure modes (per /plan-eng-review)

| Codepath | Failure mode | Test? | Error handling? | UX surface |
|---|---|---|---|---|
| `/api/orders` slow Supabase | 5+ s response stalls UI | TanStack default timeout (30s) → query error | yes (TanStack `error` state) | "Couldn't load orders" + retry button |
| `/api/orders/:id` row deleted between list and click | 404 race | covered (case 6 above) | yes (modal closes + toast) | toast "Order no longer available" |
| Dealer JWT `app_metadata.dealer_id` is null (Auth Hook glitch) | RLS returns 0 orders | covered (Phase 1 covered) | yes (dealer sees empty list, no crash) | "No orders yet" empty state |
| `userClient(env, jwt)` token expired mid-request | Supabase 401 | covered indirectly via apiFetch | yes (apiFetch throws ApiError, useAuth re-hydrates session, may redirect to /login) | redirect to /login |
| Web bundle build leaks SUPABASE_SERVICE_ROLE_KEY | secret exposure | grep audit gate (Phase 1 acceptance) | hard gate in CI | n/a — build fails |

No critical gaps (all failure modes have at least test + error handling + user-facing surface).

## 7b. What already exists (per /plan-eng-review)

- `apps/api/src/middleware/auth.ts` — `c.var.auth` populated with id/role/dealerId/etc. Reused unchanged.
- `apps/api/src/middleware/role-gate.ts` — `requireRole(allowed[])`. Reused unchanged.
- `apps/api/src/lib/supabase.ts` — `userClient(env, jwt)` factory. Reused unchanged.
- `packages/shared/src/adapters.ts` — `orderFromRow(row, rels?)` already handles flat→nested + optional rels. **Reused as the only conversion path.**
- `packages/shared/src/db-types.ts` and `domain.ts` — Row + domain types already complete.
- `apps/web/src/lib/api.ts` — `apiFetch<T>` wrapper with Bearer header attach. Reused unchanged.
- `apps/web/src/lib/auth.ts` — Zustand `useAuth` exposes role + dealerId. `RequireRole` reads from this.

**Nothing reinvented. Net new = orders/dealers route handlers + 4 web pages + queries hook + order-totals helpers + RequireRole wrapper + tests.**

---

## 8. After 2A merges

Open follow-up issues:
- 2B planning doc — New Order wizard scope.
- Decide on shared "RequireRole" wrapper location (Hono middleware exists; web wrapper TBD — first need is here in 2A).
- If `/design-review` flags anything < 8, commit the fixes inline before declaring 2A done.

---

## Acceptance Checklist (final)

- [ ] All API routes implemented + mounted in `apps/api/src/index.ts`
- [ ] All web pages implemented under `apps/web/src/pages/dealer/`
- [ ] TanStack Query hooks centralized in `lib/queries.ts`
- [ ] zod schemas in `packages/shared/src/schemas/orders.ts` shared by both consumers
- [ ] All vitest cases listed above pass (8 API orders + 4 API dealers + 4 pure-fn = 16 unit/integration)
- [ ] E2E spec `dealer-orders.spec.ts` passes (5 specs)
- [ ] Typecheck clean across 3 packages
- [ ] `service_role` audit gate passes
- [ ] `/design-review` rates dealer pages ≥ 8/10
- [ ] Multi-dealer RLS proof: log in as 2 different dealers → each sees only their own orders
- [ ] Commit + push + (optional) tag `phase-2a-complete`

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---|---|---|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run (mid-phase slice; CARRES_PORTAL_V2_PLAN.md §Phase 2 already locks the strategy) |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | not run |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 4 decisions locked, 5 test gaps closed, 1 perf fix locked, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | run during/after implementation |
| DX Review | `/plan-devex-review` | DX gaps | 0 | — | not applicable (no new dev surface) |

**UNRESOLVED:** 0
**VERDICT:** ENG CLEARED — ready to implement. Run `/design-review` after the first runnable build to close the visual fidelity loop.
