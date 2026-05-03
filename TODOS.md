# TODOS

Deferred work captured during planning / review. Each item explains *why* it was deferred and *when* to revisit.

---

## pagination-deferred

**What**: Server-side pagination for `/api/principal/approvals` and `/api/principal/dealers` (and the corresponding UI infinite-scroll or page controls).

**Why deferred**: Current data volume is ~5 dealers + ~4 approvals (seed). Client-side filtering is fine. Pagination would be over-engineering today.

**Revisit when**: Either (a) Phase 9 go-live data load planning shows >50 dealers / >50 active approvals, or (b) page load time on these routes exceeds 500ms in production.

**Surfaced by**: `/plan-eng-review` on `docs/superpowers/specs/2026-05-03-phase-3-principal-mvp-design.md` (finding A3).

**Where to start**: Add `?limit=` + `?cursor=` to the two routes; introduce shared `paginated<T>` response type in `packages/shared`. UI: switch `useQuery` → `useInfiniteQuery` with cursor in queryKey.

---

## phase-2-leftovers

Phase 2 acceptance items NOT covered by 2C (carry-forward from `phase-2c-reflection.md`):

1. **Mobile (<768px) bottom-tab navigation** — touched lightly in 2A but not fully audited against `proto/dealer-mobile.jsx`. Triage: do as Phase 2D sweep, or accept as "desktop-first MVP" and revisit after go-live.
2. **Salesperson role outlet scoping** — not yet implemented. Spec'd in Phase 2 acceptance #6 but no code. Triage: Phase 2D or fold into Phase 3.5.
3. **Top-up requests appearing in `approvals` table** — Phase 2C `top_up_order` writes to `order_history` only; `dealer_topup` (Phase 1) bumps `deposit_balance` directly. Master plan §572 envisioned an approval gate but Loo confirmed (`/plan-eng-review` 2026-05-03) that direct self-record is the chosen flow. **No work needed** — close this item.

**Surfaced by**: `phase-2c-reflection.md` §10 acceptance check.

---

## orphaned-debt-rpcs-and-columns

**What**: After Phase 3 stripped the Credit terms feature (Loo confirmed: no HQ→dealer debt — customer pays HQ direct, dealer just sells), several DB artifacts are now orphaned with no caller:

- `dealer_set_terms(uuid, numeric, text)` RPC (migration `0013`) — no API route, no UI calls it
- `dealer_topup(uuid, numeric, payment_method, text, text)` RPC (migration `0003`) — also no caller; the dealer-side TopUpDepositModal uses `top_up_order` (Phase 2C `0009`), which writes to `orders.paid` not `dealers.deposit_balance`
- `dealers.credit_limit numeric` column — not exposed in any UI
- `dealers.payment_terms text` column — not exposed in any UI
- `dealers.deposit_balance numeric` column — not exposed in any UI

**Why deferred**: Dropping requires a migration with `drop function ...` + `alter table dealers drop column ...`. Schema changes need explicit Loo approval per project CLAUDE.md §7. Leaving them is harmless (functions sit unused; columns default to 0).

**Revisit when**: Phase 5 (Finance) — that phase will revisit how money flows through the system; if it confirms these are truly dead, do one cleanup migration `0XXX_drop_unused_dealer_credit.sql`.

**Risk if not cleaned**: Future engineer might re-discover these and assume they're load-bearing. Code reviewer might flag "why is dealer_set_terms here if nothing uses it?"

**Surfaced by**: Loo's biz-model clarification on 2026-05-03 — "my dealer wont have any debt to me, our system is about dealer sell item, customer pay HQ directly".

---

## approval-decided-by-shows-uuid

**What**: `approvals.decided_by uuid references app_users(id)` returns the UUID, not the name. The Approval drawer's "Decision" block shows `<UUID> · <timestamp>` instead of `<Name> · <timestamp>`.

**Why deferred**: Cosmetic. Drawer is functional, decisions are recorded correctly, audit_log has full names. Polish item.

**Revisit when**: M6 polish, or any time before Loo demos to a third party.

**Fix sketch**: Either (a) add `decided_by_name text` column populated from `app_users.name` in `approval_decide` RPC, or (b) add a join in the GET `/api/approvals` query, or (c) UI looks up name from a roster the dashboard already has.

**Surfaced by**: M4 implementer subagent on commit `dfecddd`.

---

## approval-row-type-missing-reason

**What**: The `ApprovalRow` type in `apps/web/src/lib/queries.ts` doesn't declare the optional `reason` field, even though `select * from approvals` returns it. The `ApprovalDrawer` types it locally (`reason?: string | null`) to compensate.

**Why deferred**: One-line type fix, no runtime impact.

**Revisit when**: Next time `queries.ts` is touched, or M6 polish.

**Surfaced by**: M4 implementer subagent on commit `dfecddd`.

---

## audit-log-duplicate-index

**What**: `audit_log` table now has two functionally identical indexes on `occurred_at desc`: `audit_log_at_idx` (from migration `0001`) and `audit_log_occurred_at_idx` (from migration `0013`).

**Why deferred**: Cost is negligible (~50 audit rows/day → tiny write amplification). Dropping in-place is a 1-line migration, not worth a separate cycle now.

**Revisit when**: Any other Phase 4+ migration touches `audit_log` — bundle the `drop index audit_log_at_idx` into that migration. Or anytime a perf pass on writes is needed.

**Surfaced by**: Phase 3 M1 implementer subagent on commit `b163ad1`.

---

## supabase-jwt-secret-cleanup

**What**: Remove `SUPABASE_JWT_SECRET` from `.dev.vars`, `.dev.vars.example`, and the `Bindings` type in `apps/api/src/index.ts`.

**Why deferred**: Phase 1 switched to ES256/JWKS; secret is unused but kept for potential HS256 service-to-service tokens in Phase 9.

**Revisit when**: Phase 9 deploy planning confirms no HS256 use case.

**Surfaced by**: `phase-1-reflection.md` §6.
