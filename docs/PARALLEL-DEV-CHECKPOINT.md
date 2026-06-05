# Parallel Development Checkpoint

**As of 2026-06-05** — Loo running two Claude Code sessions in parallel.

## Why this doc

One session ("**Feature**") owns DB / API / business logic. A separate session
("**UI**") owns visual polish + components. Both push PRs against `main`; Loo
merges. This doc is the shared mental model so they don't trip over each other.

Read this **first** when opening either session.

---

## Setup for a new UI session (one-time)

The UI session works in a parallel `git worktree` off the same repo so the
two sessions don't fight over branch switches.

```powershell
cd C:\Users\User\OneDrive\Desktop
git -C "Carres-Portal v2" fetch origin
git -C "Carres-Portal v2" worktree add ..\Carres-Portal-UI main
```

Open Claude Code in `C:\Users\User\OneDrive\Desktop\Carres-Portal-UI`.
First message to the new Claude:

> Read `CLAUDE.md` (project rules) then `docs/PARALLEL-DEV-CHECKPOINT.md`
> (parallel-dev plan). Then pick up the next UI task from §"Active sprint"
> in that doc.

Per CLAUDE.md §15 the new Claude must reply in Chinese-primary, casual tone,
conclusion-first, English tech terms preserved.

---

## Folder boundaries

| Path                              | Feature session | UI session   |
|-----------------------------------|-----------------|--------------|
| `supabase/migrations/`            | ✏️ owns         | 👁️ read only |
| `apps/api/`                       | ✏️ owns         | 👁️ read only |
| `packages/shared/src/schemas/`    | ✏️ defines contracts | 👁️ consumes |
| `packages/shared/src/{db-types,domain,adapters}.ts` | ✏️ owns (DB-side) | 👁️ read only |
| `apps/web/src/pages/`             | 👁️ read only   | ✏️ owns      |
| `apps/web/src/components/`        | 👁️ read only   | ✏️ owns      |
| `apps/web/src/lib/queries.ts`     | ⚠️ add hooks + query keys for new endpoints | ⚠️ add hooks for UI-only queries |
| `apps/web/tailwind.config.ts`     | 👁️             | ✏️ owns (design tokens) |
| `apps/web/vite.config.ts`         | coordinate via Loo | coordinate via Loo |
| `apps/web/.env.local` · `apps/api/.dev.vars` | **never commit** — both gitignored |
| `CLAUDE.md` (project rules)       | coordinate via Loo | coordinate via Loo |

`apps/web/src/lib/queries.ts` is the **likely conflict zone** — both sessions
add hooks here. Mitigation: add hooks at the END of the relevant section and
keep changes small. If both edit the same hook → second to push rebases.

---

## Sync protocol

Before starting any new branch:

```powershell
git fetch origin
git switch main
git pull origin main
git checkout -b <new-branch-name>
```

After Loo merges your PR, the OTHER session pulls main before continuing:

```powershell
git fetch origin
git switch main
git pull origin main
# resume work — switch back to your in-flight branch if any
```

Branch naming:
- Feature session: `feat/<area>-<short-desc>`, `fix/<area>-<short-desc>`
- UI session:      `ui/<area>-<short-desc>`,   `polish/<area>-<short-desc>`

Each branch = one PR. No direct commits to main.

---

## Currently in flight (don't touch unless coordinated)

| PR | Branch | Owner | What |
|----|--------|-------|------|
| (this) | `feat/multi-leg-delivery-api` | Feature | API endpoints + shared types contract |

All 8 partners now read consistently: `AL · EU · HOUZS · NETS · SSY · TEOW
· TSDD · TT` (PR #7 merged 2026-06-05).

---

## Active sprint — Multi-leg delivery (γ architecture)

The schema landed already (migration 0156 — merged in PR #6): `orders.delivery_stops
jsonb` + 2 RPCs (`set_delivery_chain`, `patch_delivery_stop`).

### Feature session — DONE in this PR

1. ✅ **API endpoints** in `apps/api/src/routes/operation/delivery-chain.ts`:
   - `PUT /api/operation/orders/:id/delivery-chain` → calls `set_delivery_chain` RPC
   - `PATCH /api/operation/orders/:id/delivery-stops/:leg` → calls `patch_delivery_stop` RPC
2. ✅ **TypeScript contract** in `packages/shared/src/schemas/delivery-chain.ts`:
   - `deliveryStopSchema`, `setDeliveryChainInputSchema`, `patchDeliveryStopInputSchema`,
     `deliveryChainResponseSchema` + matching types
   - Re-exported from `@carres/shared` root
3. ✅ **Tests** in `apps/api/src/routes/operation/delivery-chain.test.ts` (16/16 pass)
4. ⚠️ **POD upload**: deferred — frontend uploads directly to Storage via
   supabase-js (bucket `delivery-orders`, path `orders/<id>/legs/<n>/<ts>.<ext>`)
   then PATCHes the leg with `pod_url`. No backend endpoint needed.

🟢 **Multi-leg contract is READY** — UI session can pull main + start the
timeline component (task #4 below). Imports: `import { deliveryStopSchema,
setDeliveryChainInputSchema, type DeliveryStop } from "@carres/shared"`.

### Feature session — next

- React Query hooks in `apps/web/src/lib/queries.ts`:
  `useSetDeliveryChain(orderId)`, `usePatchDeliveryStop(orderId)`
  + matching query keys + cache invalidation
- Surface `delivery_stops` on `useOperationOrder` (already returns row;
  jsonb column just needs to be included in the SELECT)
- Tests for the new hooks

### UI session — start NOW (independent of multi-leg backend)

Pick one and ship a PR. All three are scoped + don't need new backend.

1. **Stock indicator badge on Order kanban cards** — 🟢 Ready / 🟡 Pending / 🔴 No
   stock. Data already available via `useOperationOrder` → `stockBalances`. File:
   `apps/web/src/pages/operation/components/OrderCard.tsx` (or wherever the card lives).
2. **Partner filter chips on Orders kanban** — `[All] [NETS] [TEOW] [TT] [EU] [SSY]
   [TSDD] [HOUZS] [AL]`. Reads `useDeliveryPartners()`. Filters the kanban orders by
   `delivery_partner_id`. File: `apps/web/src/pages/operation/OperationOrders.tsx`.
3. **Inbox dropdown polish** — show partner zone next to name in the picker,
   e.g. `TEOW · KL → Johor Bahru`. File: `apps/web/src/pages/operation/OperationInbox.tsx`.

### UI session — Multi-leg timeline (UNBLOCKED 🟢)

4. **Multi-leg timeline UI** in Order detail drawer
   - Component: `apps/web/src/pages/operation/components/DeliveryChain.tsx`
   - Renders the stops array from `useOperationOrder().order.delivery_stops`
   - "Add leg" form (partner picker + from/to)
   - Per-leg actions: `[Mark Picked Up]` `[Mark Handed Off]` `[Mark Delivered]`
     `[Upload POD]` `[Edit notes]`
   - On submit, calls the hooks Feature session will publish next
     (`useSetDeliveryChain`, `usePatchDeliveryStop`) — names final, types
     already in `@carres/shared`
   - Empty `delivery_stops` (null or `[]`) → render single-leg compact view
     (just shows `delivery_partner_id`'s name as today)
   - Multi-leg (1+ stops) → vertical timeline with status pills per leg

---

## Communication rules

- **Both sessions write to this doc** when they start/finish a big task — update
  the "Currently in flight" table.
- **Don't @-mention the other session** — they're separate Claudes with no shared
  memory. Loo is the only human relay.
- **If you discover something the other session needs to know** (a schema gap, a
  changed API contract, a renamed file), update this doc + tell Loo.

## Stuck? Conflicts?

- **File conflict on push** (both sessions edited the same file): the second
  pusher rebases. `git fetch origin && git rebase origin/main`. Resolve manually.
- **Confused who owns a file**: default to "don't touch" + tell Loo.
- **Need to break the boundary** (e.g. UI session must add a new API endpoint):
  STOP, ask Loo, don't silently cross over.
