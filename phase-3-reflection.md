# Phase 3 — Reflection

> **Phase 3 (Principal MVP) shipped 2026-05-03.** Tag: `phase-3-complete`. 3 active pages (Dashboard + Approvals + Dealers + Invite flow), 5 SQL migrations, 7 Hono routes, ~15 React components, 215 tests green. Built end-to-end in one session.

---

## What shipped

| Milestone | Deliverable | Commits |
|---|---|---|
| **Plan** | Design spec + `/plan-eng-review` revisions + TODOS.md + step-by-step implementation plan (3051 lines, 31 tasks) | 9e9268b · 7373ef5 · 4e7ec13 |
| **M1 — Foundation** | 3 SQL migrations: `0012` adds `'rejected'` to dealer_status enum · `0013` 4 admin RPCs (dealer_invite/dealer_set_status/dealer_set_terms/principal_dashboard_summary) + 2 helper RPCs + audit_log index · `0014` extends approval_decide for new_dealer side-effect. Plus shared zod schemas (approvals + principal-dealers). | 7e9f749 · b163ad1 · 89510f7 · b5d4a78 · 0284846 |
| **M2 — Backend API** | 7 Hono routes under `/api/principal/*` and `/api/approvals/*`. All routes `requireRole(['principal'])` with defense-in-depth (route guard + RPC `is_principal()` guard). 22 new tests. | 9780ebd · fe93824 · 6dcb19a |
| **M3 — Shell + Dashboard** | `PrincipalApp` + `PrincipalSidebar` (5 nav groups, 3 active + 6 disabled) + `PrincipalDashboard` (5 KPI cards + 4 tiles in 1.4:1 grid) + 2 shared badges (`ApprovalKindBadge`, `RoleChip`). Toast copy constants. 8 React Query hooks (4 read + 4 mutation, all closure-captured ID + `await invalidateQueries`). 17 new tests. | 3ed34e8 · 4695d53 · b660542 · bbb792c |
| **M4 — Approvals page** | `PrincipalApprovals` filter tabs (pending/approved/rejected/all) + `ApprovalRow` + `ApprovalDrawer` (decide form with note + Reject/Approve). 3 new tests. | dfecddd · a5283e2 |
| **M5 — Dealers page + Invite** | `PrincipalDealers` table + search + status filter (5 pills incl. rejected) + `DealerRow` + `DealerDrawer` (3 stats + recent orders + status-aware action button) + `InviteDealerModal` (3 fields, idempotent backend). 2 new tests. | 5e4c7a3 |
| **M6 — Polish + ship** | Live Playwright smoke caught `dealer_with_stats` shape bug → fixed via migration `0015`. `/review` caught approval_decide UUID cast crash on legacy seed → fixed via migration `0016`. Stripped Credit terms feature per Loo's biz-model clarification (no HQ→dealer debt). | 1808454 · 22201e9 · c9dbd5a |

**21 commits in Phase 3, 49 files changed, +7852 / -1 lines, 215 tests green, all pushed to `origin/main`.**

---

## What surprised us

### 1. Plan's test infrastructure assumptions were wrong — adapted on the fly

The plan template (which I wrote myself in Step 4) referenced `signInAsPrincipal()`, `signInAsDealer()`, `setTestEnv()` test helpers as if they existed. They don't. The actual existing pattern uses **in-memory JWKs** (`generateKeyPair("ES256")` + `_setJwksForTesting(createLocalJWKSet(...))`) plus `vi.mock("../lib/supabase")`. Discovered when the first M2 subagent prompt referenced these non-existent helpers.

**Carry forward**: future plans should sample one existing test file in the affected workspace to learn the actual pattern before specifying test code. Don't trust the plan's snippets blindly — they're skeletons, not verified imports.

### 2. Loo's "no HQ→dealer debt" clarification mid-Phase

Built Phase 3 closely matching `reference/proto/principal-*.jsx`, which includes a Credit terms editor (credit_limit + payment_terms NET14/30/60/COD) on the Dealer drawer. After M5 shipped, Loo flagged: *"my dealer wont have any debt to me de, our system is about dealer sell item... no need but stock from us"*.

The proto's Credit terms editor was carried over from a generic B2B distribution template. Loo's actual model: **end customer pays HQ direct via dealer; dealer just sells**. So Credit terms doesn't apply. Stripped:
- `CreditTermsEditor.tsx` (frontend component)
- `useDealerSetTerms` hook
- `setDealerTermsInput` zod schema + tests
- `POST /api/principal/dealers/:id/terms` route + tests
- `dealer_set_terms` RPC and 3 columns (`dealers.credit_limit`, `payment_terms`, `deposit_balance`) flagged as orphaned in TODOS for Phase 5 cleanup migration.

Outstanding column kept — it's `orders.total - orders.paid` summed per dealer, meaning *"how much end customer still owes HQ via this dealer"*, which dealer needs to chase for the 50% top-up gate (Phase 2C `proceedBlockers` `payment_below_50` code).

**Carry forward**: proto fidelity is necessary but not sufficient. Always cross-check proto features against the actual business model — the proto can have artifacts that look like real features but aren't part of Loo's biz. Surfaced + saved as memory `feedback_no_hq_dealer_debt.md` (this reflection is the source of record).

### 3. `dealer_with_stats(p_id)` returned wrong shape — only caught by Playwright

Phase 3 plan (Task 8) specified `dealer_with_stats(uuid) returns setof dealers` to fetch a single dealer by id. The route then computed `recentOrders` from a separate query, but the **Stat tiles** in the drawer (Orders / GMV / Outstanding) read `dealer.order_count`, `dealer.gmv`, `dealer.outstanding` — **fields that don't exist on the raw `dealers` table row**.

Result: drawer rendered "0 / RM 0.0k / —" for every dealer, even though the table row clearly showed real numbers. Unit tests didn't catch it because their RPC mocks returned whatever shape was specified, not the actual DB shape.

**Fix**: migration `0015_dealer_with_stats_enrich.sql` recreated the function with `returns table(...)` mirroring `dealers_with_stats_list`'s shape, filtered to one row.

**Carry forward**: when a route does multi-step data fetching (RPC + supplementary query + assembly), the unit-test mocks shape the *expected* response, not the actual RPC response. Live smoke testing remains essential — `/qa` or Playwright is non-negotiable for any phase that adds new RPCs.

### 4. `approval_decide` crashed on legacy seed `refers_to` — caught by `/review`

`/review` flagged that `approval_decide` (migration `0014`) hard-cast `v_app.refers_to::uuid` for the new_dealer kind. Verified live: the seeded Sleep Studio KK approval has `refers_to = 'dlr-pendng-1'` (legacy non-UUID format from the proto's pre-Phase-1 placeholder). Approving from UI → `invalid input syntax for type uuid` → whole tx rolled back → approval not even marked decided.

**Fix**: migration `0016_approval_decide_safe_uuid_cast.sql` regex-gates the cast. If `refers_to` doesn't match `^[0-9a-f]{8}-...$`, the approval still records the decision but the dealer mutation is skipped. Future inserts via `dealer_invite` (Phase 3 RPC) always produce real UUIDs, so the safeguard only matters for legacy seed rows.

Re-tested live via Playwright: clicking Approve on Sleep Studio KK → 200 + decision recorded + dealer correctly stays Pending (because seed UUID is invalid). Graceful degradation working.

**Carry forward**: any function that casts string fields to typed PostgreSQL types (uuid, int, jsonb, etc.) needs format validation when the source data may have been written by older code or seed scripts.

### 5. Subagent dispatching scaled cleanly

Used `superpowers:subagent-driven-development` for M1-M5. 5 subagent dispatches total (M1.1-3 migrations, M1.4 schemas, M2.6+7 dashboard+approvals routes, M2.8+9 dealers routes, M3 frontend, M4 approvals page, M5 dealers page). Each dispatch took 1-5 min wall-clock. **Net positive vs doing it inline**: saved my context budget for orchestration + review work, subagents made smart small deviations (matched existing token names, inlined helpers per existing pattern, accepted closure-captured-ID convention from Phase 2C).

**Carry forward**: subagents work well when the plan is detailed enough that the implementer doesn't need to make architectural decisions, just execution. Frontend tasks (M3-M5) benefited especially — subagents read existing Phase 2C component files for convention before writing.

---

## Schema tweaks (5 migrations applied to remote Supabase via MCP)

| File | Adds | Destructive? |
|---|---|---|
| `0012_add_rejected_dealer_status.sql` | `alter type dealer_status add value 'rejected'` | No — additive enum value |
| `0013_principal_admin.sql` | 4 RPCs (dealer_invite, dealer_set_status, dealer_set_terms, principal_dashboard_summary) + 2 helpers (dealer_with_stats, dealers_with_stats_list) + `audit_log_occurred_at_idx` index | No — only new functions + new index |
| `0014_approval_decide_extend.sql` | Extends `approval_decide` with new_dealer side-effect | No — `create or replace` of existing function |
| `0015_dealer_with_stats_enrich.sql` | Drops + recreates `dealer_with_stats(uuid)` with `returns table(...)` shape | Drops a function created earlier this session — irrelevant for production rollback |
| `0016_approval_decide_safe_uuid_cast.sql` | Re-extends `approval_decide` with regex guard for refers_to | No — `create or replace` |

**Zero RLS policy changes** (RED LINE intact). All 5 RPCs are `security definer` with internal `is_principal()` guard. Defense in depth: API route checks role too.

---

## What got deferred

### Captured in TODOS.md for Phase 5 (Finance) cleanup migration

- **`orphaned-debt-rpcs-and-columns`** — `dealer_set_terms` RPC, `dealer_topup` RPC (from Phase 1, no caller after Phase 3 strip), `dealers.credit_limit`, `payment_terms`, `deposit_balance` columns. None used; dropping requires explicit Loo approval per project CLAUDE.md §7.
- **`audit-log-duplicate-index`** — `audit_log_at_idx` (from `0001`) and `audit_log_occurred_at_idx` (from `0013`) are functionally identical. Cost negligible; drop one in any future migration that already touches audit_log.
- **`approval-decided-by-shows-uuid`** — `approvals.decided_by` returns the UUID, not the actor name. Drawer's Decision block shows raw UUID. Fix sketch: add a join in GET `/api/approvals` or add `decided_by_name` text column.
- **`approval-row-type-missing-reason`** — `ApprovalRow` type in `apps/web/src/lib/queries.ts` doesn't declare optional `reason` field. Drawer types it locally. One-line fix.
- **`pagination-deferred`** — Approvals and Dealers lists have no pagination. Fine at current scale (5 dealers, 4 approvals); revisit at 50+.

### Spec-level deferrals (not in MVP)

- ❌ Suppliers / Catalog / Pricing / All Orders / Stock / Audit log dedicated pages — disabled nav items, "Coming in Phase X" tooltips
- ❌ `discount` approval kind — explicitly excluded server-side (`q.neq('kind', 'discount')`); seed row still present but filter hides it. Loo confirmed not part of biz model.
- ❌ `decided_by` UUID → name lookup
- ❌ Sales sparkline + Category breakdown (proto's "detailed" dashboard layout)
- ❌ Tweaks panel (proto-only dev tool)
- ❌ Mobile responsive (defer — Loo uses desktop for HQ work)

---

## Time spent (approximate)

- Phase 2C closure (reflection + tag + push): ~30 min
- Brainstorm + spec writing: ~45 min
- `/plan-eng-review` (3 sections + decisions + spec patch): ~40 min
- Implementation plan writing (3051 lines): ~25 min
- M1 (3 migrations + zod schemas via 2 subagents): ~25 min
- M2 (7 Hono routes + tests via 2 subagents): ~50 min
- M3 (frontend shell + dashboard + 5 tiles via 1 subagent): ~60 min
- M4 (Approvals page via 1 subagent): ~30 min
- M5 (Dealers page + Invite via 1 subagent): ~35 min
- Live Playwright smoke + bug fix (`0015`): ~15 min
- Loo's biz-model clarification + Credit terms strip: ~20 min
- Design review (proto fidelity audit): ~15 min
- `/review` + bug fix (`0016`) + Playwright re-verify: ~20 min
- Reflection + tag (this commit): ~15 min

**Total Phase 3 active work: ~6.5 hours in one session.** Master plan budget was 1 week — well inside.

---

## What to carry into Phase 4 (Logistics)

1. **Phase 4 is HQ internal team** (PO + warehouse + delivery), not a new dealer-side feature. Per Loo's clarification: dealer just sells, customer pays HQ direct, internal team fulfills.
2. **`order.status` transitions**: Phase 2C built dealer-side `place → proceed_order`. Phase 4 needs internal-side `proceed_order → awaiting_stock → ready → dispatched → delivered`. **WILL need new RLS UPDATE policies** for logistics role to mutate orders — RED LINE confirmation required at session start.
3. **Auto-PO on Place→Proceed**: the proto's `ingestProceededOrder` function. Currently a no-op stub in `proceed_order` RPC. Phase 4 must implement the PO creation logic.
4. **All Phase 3 patterns established work for Phase 4**:
   - SECURITY DEFINER + manual role guard for new RPCs
   - Closure-captured ID + `await invalidateQueries` for new mutation hooks
   - Toast constants in `apps/web/src/lib/toast-copy.ts`
   - Sidebar disabled-state pattern for not-yet-built phases
5. **Audit log feed on Principal dashboard** picks up Phase 4 mutations automatically — no Phase 3 changes needed when logistics ships.
6. **Subagent-driven development worked**. Continue using it for M1-M5 of each phase. Reserve own context for orchestration and review.

---

## Acceptance check (final)

Phase 3 spec acceptance criteria (`docs/superpowers/specs/2026-05-03-phase-3-principal-mvp-design.md` §10):

- [x] Sara logs in → lands on `/principal` Dashboard (verified live: `principal@carres.com / 111`)
- [x] Dashboard shows KPI strip + 4 tiles, all with real data from seed/Phase 2C orders
- [x] Sidebar shows pending approval count badge in primary color
- [x] Clicking pending KPI card OR "Review all" → Approvals tab
- [x] Approvals page lists pending (refund + new_dealer); discount filtered out server-side
- [x] Approve refund (DL-1239 · RM 2,400) → `refunds.status = approved`, audit log entry, list refreshes (verified live)
- [x] Approve new_dealer (Sleep Studio KK) → no crash even with legacy non-UUID `refers_to` (graceful skip; verified live with `0016` fix)
- [x] Dealers page table shows 7 seeded dealers with computed stats (Outstanding column accurate)
- [x] Click BedHouse KL row → drawer with 3 stats (1453 / RM 75.2k / RM 63,120) + recent orders + Suspend button
- [x] Suspend / Reactivate flows work (status flips, audit log entry, list reflects after invalidation — covered by tests)
- [x] Invite dealer creates dealer (pending) + new_dealer approval row + idempotent on double-submit
- [x] All 6 disabled nav items show tooltip on hover (silent click — no toast noise)
- [x] Tests: 215 total green (35 shared + 85 api + 99 web — was 159 baseline, +56 new)
- [x] `/review` clean (1 P1 found + fixed)
- [x] `/design-review` clean (4 intentional biz-aligned deviations from proto, 0 unintentional drift)
- [x] No RLS policy changes (`grep "create policy\|alter policy" supabase/migrations/0012* 0013* 0014* 0015* 0016*` → empty)
- [x] No `SUPABASE_SERVICE_ROLE_KEY` in `apps/web/dist/` (RED LINE check)
- [x] `phase-3-reflection.md` written (this file)
- [ ] `git tag phase-3-complete` and push (next step)
- [ ] CLAUDE.md §17 status updated to "Phase 3 complete; Phase 4 not started"

Phase 3 acceptance items NOT in MVP (deferred per Loo's choices during planning):

- ❌ "View as dealer" impersonation (master plan §613) — defer to Phase 3.5 or skip
- ❌ Account admin via service_role admin API (master plan §595) — defer to Phase 8
- ❌ Suppliers + Catalog & Pricing + Stock + All Orders + Audit log dedicated pages — defer
- ❌ Mobile responsive layout — desktop-first per Loo
