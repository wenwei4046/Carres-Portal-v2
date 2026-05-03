# Phase 3 — Principal MVP Design

> **Status**: Approved by Loo · 2026-05-03
> **Scope**: 3-page MVP (Dashboard + Approvals + Dealers) + Invite dealer flow
> **Estimate**: ~14 hrs / 1.5–2 days
> **Prerequisite**: Phase 2C complete (tag `phase-2c-complete`)

---

## 1. Goal (one sentence)

Give Loo a daily-use HQ view: see the network at a glance, decide pending approvals (refund + new_dealer), and manage the dealer roster (suspend / reactivate / set credit terms / invite new).

## 2. User story (Loo's daily 5-minute flow)

```
1. Login as sara@carres.com / 111
2. Dashboard loads → see GMV, active orders, dealer leaderboard, pending count
3. Sidebar shows Approvals · 3 (red badge) → click
4. 3 pending: refund, new dealer application, discount (filtered out, see §6)
5. Open drawer → review receipt / reason → Approve or Reject + optional note
6. Approval ripples: refund updates refunds.status; new_dealer flips dealer pending→active
7. Network → Dealers → see roster table → click a row → drawer
8. Suspend an inactive dealer / edit credit terms / Invite a new one
9. Close browser. 5–10 minutes total.
```

## 3. Pages (3) — UI is 100% match to `reference/proto/principal-*.jsx`

### 3.1 PrincipalApp shell — `reference/proto/principal.jsx`

5 nav groups, **3 active** + **6 disabled**:

| Group | Item | State | Notes |
|---|---|---|---|
| Pulse | Dashboard | ✅ active | Default tab on login |
| Pulse | Approvals | ✅ active | Pending count badge in brand-signature |
| Network | Dealers | ✅ active | |
| Network | Suppliers | ❌ disabled | "Coming in Phase 6" tooltip on click → toast |
| Catalog | Catalog & Pricing | ❌ disabled | "Coming in Phase 5" tooltip |
| Records | All orders | ❌ disabled | "Coming in Phase 5" tooltip |
| Records | Stock | ❌ disabled | "Coming in Phase 4" tooltip |
| Records | Audit log | ❌ disabled | "Coming in Phase 5" tooltip (recent activity already on dashboard) |
| Admin | Accounts | ❌ disabled | "Coming in Phase 8" tooltip |

**Sidebar bottom**: persona block shows logged-in user's name + role (proto hardcodes "Sara Cheong / CEO" — v2 uses real auth user data).

**Tweaks panel**: NOT implemented (proto-only dev tool).

### 3.2 PrincipalDashboard — `reference/proto/principal-dashboard.jsx`

Layout: **compact only** (proto's "detailed" with sparkline + category breakdown is deferred).

```
┌─────────────────────────────────────────────────────────────┐
│ HQ · Overview                                                │
│ The whole network, at a glance.                              │
│ {N} dealers · {N} SKUs · {N} orders this period              │
├─────────────────────────────────────────────────────────────┤
│ [GMV]  [Active orders] [Active dealers] [Pending] [LowStock] │
├──────────────────────────────┬──────────────────────────────┤
│ Dealer Leaderboard           │ Awaiting your decision (top 4)│
│ (top 4 GMV, bar chart)       │ Manage all → / Review all →  │
├──────────────────────────────┼──────────────────────────────┤
│ Alerts                       │ Recent activity (top 5)      │
│ (low stock + suspended)      │ Full log →                   │
└──────────────────────────────┴──────────────────────────────┘
```

**Note on empty states (proto-faithful)**:
- Low-stock count = 0 until Phase 4 (logistics) populates stock data → KPI shows 0, AlertsTile shows "All systems normal" (matches proto exactly when no alerts).
- Audit log feed shows recent entries from Phase 1 seed + entries written by Phase 2C/3 mutations.

**Click behavior** (per proto):
- "Pending approvals" KPI card → tab to Approvals
- "Low-stock SKUs" KPI card → no-op (target tab disabled)
- "Manage all" in Leaderboard → tab to Dealers
- "Review all" in Approvals tile → tab to Approvals
- "Full log" in Recent activity → no-op (Audit tab disabled)

### 3.3 PrincipalApprovals — `reference/proto/principal-approvals.jsx`

```
┌─────────────────────────────────────────────────────────┐
│ HQ · Approvals                                           │
│ Decisions in your court                                  │
│ {N} pending · auto-routed from Finance, Sales, Catalog. │
├─────────────────────────────────────────────────────────┤
│ [Pending·N] [Approved·N] [Rejected·N] [All]              │
├─────────────────────────────────────────────────────────┤
│ [BADGE] Title              actor · created · ref  AMOUNT  STATUS │
│ [BADGE] Title              ...                                  │
│ ...                                                              │
└─────────────────────────────────────────────────────────┘

Drawer (right slide-in, 520px):
- Header: id (kicker) + title (display font) + close
- Status pills: kind badge + status pill
- DT field grid: Type / Status / Submitted by / Submitted / Refers to / Amount / Region / Contact / Reason
- Linked order context (if kind=refund): order DL + customer + total + paid
- Decision (if not pending): decided by + at + note
- Action area (if pending):
  - Note textarea (optional)
  - [Reject] [Approve] (50/50 buttons)
```

**Approval kinds in MVP**:
- `refund` — backend: existing `approval_decide` already updates `refunds` table. Demo from seed.
- `new_dealer` — backend: extend `approval_decide` to flip `dealers.status pending→active` + set `dealers.joined_date`. Demo from seed (Sleep Studio KK) + Invite flow.
- `top_up` / `price_change` — schema enum exists; Approvals page does NOT filter these out, but no business flow creates them in MVP. Display-only (decide does nothing kind-specific).
- `discount` — **explicitly excluded** per Loo: not part of the business model. Approvals list filters out `kind = 'discount'` server-side. Seed row is removed in `seed.sql` cleanup (additive, doesn't break anything).

### 3.4 PrincipalDealers — `reference/proto/principal-dealers.jsx`

```
┌─────────────────────────────────────────────────────────────────┐
│ HQ · Network                              [+ Invite dealer]      │
│ Dealers                                                          │
│ {N} active · {N} pending · {N} suspended                         │
├─────────────────────────────────────────────────────────────────┤
│ [search box………]              [all] [active] [pending] [suspended]│
├─────────────────────────────────────────────────────────────────┤
│ Dealer        Region   Joined   Orders  GMV     Outstanding  Status  │
│ BedHouse KL …  Klang    2024     12      RM 50k  RM 5,200    [active]│
│ …                                                                    │
└─────────────────────────────────────────────────────────────────┘

Drawer (right slide-in, 520px):
- Header: dealer.id (kicker) + name (display) + contact + close
- Status pill + region + joined
- 3 stat cards: Orders / GMV / Outstanding
- Credit terms card (with inline edit toggle):
  - View: Limit · RM N · Terms · NET 30
  - Edit: input + select(NET14/NET30/NET60/COD) + Cancel/Save
- Recent orders card (last 8): DL-{n} · customer · total · status
- Action button (status-aware):
  - active   → [Suspend] (with native confirm dialog)
  - suspended → [Reactivate]
  - pending   → "Awaiting approval · review in Approvals tab" (text only)
```

**Invite dealer modal** (`+ Invite dealer` button → modal, `principal-dealers.jsx:227-254`):
```
┌─────────────────────────────────────┐
│ Network                              │
│ Invite a new dealer                  │
│ They'll appear with status Pending   │
│ until approved.                       │
│                                       │
│ Business name [..............]        │
│ Region        [..............]        │
│ Contact       [..............]        │
│                                       │
│              [Cancel] [Send invite]   │
└─────────────────────────────────────┘
```

Submit flow:
1. Frontend → `POST /api/principal/dealers/invite { name, region, contact }`
2. Backend RPC `dealer_invite` (security definer, principal-only):
   - Insert `dealers (name, region, contact, status='pending')` — no `joined_date` yet
   - Insert `approvals (kind='new_dealer', title='New dealer application · {name}', actor='HQ · {principal name}', refers_to=dealer.id, dealer_id=dealer.id, status='pending')`
   - Audit log entry
3. Toast: "{name} invited · approval queued"
4. Dashboard pending count + Dealers list update via `qk.principal.*` invalidation

**Approval flow for new_dealer**:
1. Approvals page → drawer → Approve
2. `approval_decide(id, 'approved', note)` extended logic:
   - Update `approvals.status = 'approved'`, `decided_at`, `decided_by`, `decision_note` (existing)
   - **NEW**: If `kind = 'new_dealer'` and `refers_to` is a dealer UUID, update `dealers.status = 'active'`, `joined_date = current_date`
3. Audit log
4. Both Approvals + Dealers queries invalidate

---

## 4. Backend changes

### 4.1 New / modified RPCs (1 new migration: `0012_principal_admin.sql`)

| RPC | Purpose | Auth |
|---|---|---|
| `dealer_invite(name text, region text, contact text)` | Create dealer (status=pending) + new_dealer approval | `is_principal()` only |
| `dealer_set_status(dealer_id uuid, new_status dealer_status, reason text)` | Suspend / reactivate, with audit log | `is_principal()` only |
| `dealer_set_terms(dealer_id uuid, credit_limit numeric, payment_terms text)` | Update credit_limit + payment_terms | `is_principal()` only |
| `principal_dashboard_summary()` | Returns JSON `{ kpis, leaderboard, pending_approvals, audit_recent, alerts }` for one round-trip | `is_principal()` only |

All `security definer`, mirror Phase 2C pattern. Use SQLSTATE codes:
- `42501` forbidden
- `42P01` not_found
- `22023` invalid_param

### 4.2 Modified `approval_decide` RPC (1 new migration: `0013_approval_decide_extend.sql`)

Add `new_dealer` side-effect (after existing refund block):
```sql
if v_app.kind = 'new_dealer' and v_app.refers_to is not null then
  update dealers
     set status = (case when p_status = 'approved' then 'active'::dealer_status else 'rejected'::dealer_status end),
         joined_date = (case when p_status = 'approved' then current_date else null end),
         updated_at = now()
   where id = v_app.refers_to::uuid;
end if;
```

(Note: `dealer_status` enum needs to include `'rejected'`. If it doesn't, only handle approve case and leave rejected dealers as `pending` for manual cleanup. **TBD: confirm enum values during implementation** — if missing, skip the rejected-side update.)

### 4.3 NO RLS policy changes (RED LINE intact ✅)

Principal already has read-everything from Phase 1 (`app_role() = 'principal'` in policies). All new mutations go through `security definer` RPCs with internal `is_principal()` guard.

---

## 5. New API routes (Hono)

```
GET  /api/principal/dashboard                  → calls principal_dashboard_summary RPC
GET  /api/approvals?status=&kind=             → list (status filter, kind filter, exclude discount)
POST /api/approvals/:id/decide                → { status: 'approved'|'rejected', note? } → approval_decide RPC
GET  /api/principal/dealers                    → list with computed stats (orders, gmv, outstanding)
GET  /api/principal/dealers/:id                → detail with recent orders
POST /api/principal/dealers/invite             → { name, region, contact } → dealer_invite RPC
POST /api/principal/dealers/:id/status         → { status, reason? } → dealer_set_status RPC
POST /api/principal/dealers/:id/terms          → { credit_limit, payment_terms } → dealer_set_terms RPC
```

All routes: `requireRole(['principal'])`. Return shape mirrors Phase 2C convention (single JSON body, 422 with `{ error, code, message }` on business-rule failures).

---

## 6. Frontend (Vite + React + TanStack Query)

### 6.1 New pages (`apps/web/src/pages/principal/`)

```
PrincipalApp.tsx              — shell + sidebar + tab routing
PrincipalSidebar.tsx          — extracted nav with disabled states
PrincipalDashboard.tsx
  components/
    KpiStrip.tsx
    DealerLeaderboard.tsx
    ApprovalsTile.tsx
    AlertsTile.tsx
    RecentActivityTile.tsx
PrincipalApprovals.tsx
  components/
    ApprovalRow.tsx
    ApprovalDrawer.tsx
    ApprovalKindBadge.tsx
    ApprovalStatusPill.tsx
PrincipalDealers.tsx
  components/
    DealerRow.tsx
    DealerDrawer.tsx
    InviteDealerModal.tsx
    DealerStatusPill.tsx
    CreditTermsEditor.tsx
```

### 6.2 New TanStack Query keys (`apps/web/src/lib/queries.ts`)

```ts
export const qk = {
  // ... existing keys
  principal: {
    dashboard: () => ['principal', 'dashboard'] as const,
    approvals: (filters?: { status?: string; kind?: string }) =>
      ['principal', 'approvals', filters ?? {}] as const,
    dealers: (filters?: { status?: string; search?: string }) =>
      ['principal', 'dealers', filters ?? {}] as const,
    dealer: (id: string) => ['principal', 'dealers', id] as const,
  },
};
```

### 6.3 Mutation hooks (closure-captured ID pattern from Phase 2C)

- `useDecideApproval(approvalId)` → on success: invalidate `qk.principal.approvals()` + `qk.principal.dashboard()` + (if new_dealer) `qk.principal.dealers()`.
- `useDealerSetStatus(dealerId)` / `useDealerSetTerms(dealerId)` / `useDealerInvite()` → similar invalidation pattern.
- All mutations `await qc.invalidateQueries({ exact: true })` BEFORE caller's onSuccess (per Phase 2C carry-forward).

### 6.4 Routing

Add to `App.tsx`:
```tsx
<Route path="/principal/*" element={<RequireAuth roles={['principal']}><PrincipalApp /></RequireAuth>} />
```

Login redirect logic: principal role → `/principal`; existing dealer → `/dealer`.

### 6.5 Toast convention (sonner from Phase 2C)

- "Approved {kind} · {title.first-segment}"
- "Rejected {kind} · {title.first-segment}"
- "{name} invited · approval queued"
- "{name} suspended" / "{name} reactivated"
- "Credit terms updated · {name}"

---

## 7. Tests

| Layer | Coverage | Estimated count |
|---|---|---|
| `packages/shared` | New zod schemas (decide / invite / set-status / set-terms) | ~5 |
| `apps/api` | All 7 new routes — happy path + role guard + 422 cases + cross-role side-effects | ~20 |
| `apps/web` | KPI calculations + AlertsTile empty-state + Approval drawer + InviteDealerModal validation | ~10 |

**Target**: 159 (current) + ~35 = **~194 total green**.

E2E (Playwright, optional for MVP):
- Login as Sara → dashboard loads → click pending count → Approvals → approve refund → toast → list refreshes
- Login as Sara → Dealers → suspend BedHouse KL → reload → still suspended

---

## 8. Migrations summary

```
supabase/migrations/0012_principal_admin.sql       — dealer_invite + dealer_set_status + dealer_set_terms + principal_dashboard_summary
supabase/migrations/0013_approval_decide_extend.sql — add new_dealer side-effect to approval_decide
```

Both additive. **No table changes**, only new functions + extended function body. Apply via `mcp__supabase__apply_migration` after local commit (Phase 2B/2C pattern).

---

## 9. What's explicitly NOT in MVP

- ❌ Suppliers / Catalog / Pricing / All Orders / Stock / Audit log dedicated pages
- ❌ Account admin (create user via service_role) — Phase 8 onboarding
- ❌ "View as dealer" impersonation — Phase 3.5
- ❌ `discount` approval kind — not part of Loo's business model
- ❌ Sales sparkline + Category breakdown (proto's "detailed" layout)
- ❌ Tweaks panel (proto-only dev tool)
- ❌ Mobile responsive layout — defer (Loo uses desktop for HQ work)

---

## 10. Acceptance criteria

- [ ] Sara logs in → lands on `/principal` Dashboard
- [ ] Dashboard shows KPI strip + 4 tiles, all with real data from seed/Phase 2C orders
- [ ] Sidebar shows pending approval count badge in brand-signature
- [ ] Clicking pending KPI card OR "Review all" → Approvals tab
- [ ] Approvals page lists 3 pending (refund + new_dealer + new_dealer-from-Sleep-Studio); discount filtered out
- [ ] Approve refund (DL-1239 · RM 2,400) → `refunds.status = approved`, audit log entry, list refreshes (no manual refresh)
- [ ] Approve new_dealer (Sleep Studio KK) → `dealers.status = active`, dealer appears in Dealers list as active
- [ ] Dealers page table shows 5 seeded dealers with computed stats
- [ ] Click BedHouse KL row → drawer with 3 stats + credit editor + 8 recent orders + Suspend button
- [ ] Suspend BedHouse KL → status flips, audit log entry, list reflects after invalidation
- [ ] Edit credit terms → values persist, audit log entry
- [ ] Invite dealer "Test Dealer / KL / contact-info" → appears in Dealers as pending + appears in Approvals as new_dealer pending
- [ ] All 6 disabled nav items show tooltip on hover, toast on click
- [ ] Tests: ~194 total green
- [ ] `/review` and `/design-review` clean
- [ ] No RLS policy changes (`grep -ri "create policy\|alter policy" supabase/migrations/0012* 0013*` → empty)
- [ ] `phase-3-reflection.md` written
- [ ] Tag `phase-3-complete` and push

---

## 11. Carry-forward from Phase 2C

- Closure-captured ID pattern in mutation hooks
- `await qc.invalidateQueries({ exact: true })` in onSuccess BEFORE caller's onSuccess
- `security definer` + manual role guard for all RPCs (no RLS changes)
- SQLSTATE error codes mapped to 422 in Hono
- Sonner toast convention (top-right, richColors, closeButton)

## 12. Risks & open questions

1. **`dealer_status` enum**: confirm during implementation whether `'rejected'` value exists. If not, MVP only handles approve→active flow for new_dealer; rejection leaves dealer as pending (acceptable, unlikely in practice).
2. **`principal_dashboard_summary` JSON shape**: define and document; freeze before any frontend tile starts consuming.
3. **Audit log entries from Phase 2C `top_up_order`**: already write `'order.top_up'` action. Confirm Recent Activity tile RoleChip handles all action shapes.
4. **Race: rapid approve/reject**: TanStack Query invalidation should serialize, but worth a manual test of "click approve, click reject quickly" to confirm UX.
5. **Search performance on Dealers**: current implementation client-side filter. At ~10 dealers fine; revisit at 100+.
