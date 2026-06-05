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
| #7 | `fix/normalize-nets-name` | Feature | NETS + TEOW name normalization (0157 + 0158) |
| (this) | `docs/parallel-dev-checkpoint` | Feature | this doc |
| (next) | TBD | Feature | multi-leg delivery API endpoints |

After PR #7 merges, all 8 partners read consistently: `AL · EU · HOUZS · NETS
· SSY · TEOW · TSDD · TT`.

---

## Active sprint — Multi-leg delivery (γ architecture)

The schema landed already (migration 0156 — merged in PR #6): `orders.delivery_stops
jsonb` + 2 RPCs (`set_delivery_chain`, `patch_delivery_stop`).

### Feature session (me) — next

1. **API endpoints** in `apps/api/src/routes/operation/delivery-chain.ts`:
   - `PUT /api/operation/orders/:id/delivery-chain` → calls `set_delivery_chain` RPC
   - `PATCH /api/operation/orders/:id/delivery-stops/:leg` → calls `patch_delivery_stop` RPC
   - `POST /api/operation/orders/:id/delivery-stops/:leg/pod` → upload POD photo to Storage
2. **TypeScript contract** in `packages/shared/src/schemas/delivery-chain.ts`:
   - `deliveryStopSchema` (zod)
   - `setDeliveryChainInput`, `patchDeliveryStopInput`
3. **Tests** in `apps/api/src/routes/operation/delivery-chain.test.ts`
4. Watch this section — will be marked **"Multi-leg contract ready"** when types are
   merged so UI session can pull and start the timeline component.

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

### UI session — wait for "Multi-leg contract ready" signal

4. **Multi-leg timeline UI** in Order detail drawer — depends on Feature session
   shipping `packages/shared/src/schemas/delivery-chain.ts`. Updates to this doc
   will signal when it's ready to pull.

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
