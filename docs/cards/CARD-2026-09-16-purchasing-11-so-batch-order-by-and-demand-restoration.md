# PURCHASING — CARD 11 · SO BATCH PURCHASE — ORDER BY AND TRUTHFUL DEMAND RESTORATION

Module: Purchasing × Stock · Sequence: 11 · Lane: BUILD / DELIVERY
Status: BUILDING · Owner approved: 2026-09-16
Exact fetched main base: `ab10aa57147e0c3138adddffc7003338c610208d`
Branch: `codex/purchasing-so-batch-order-by`

## Authority and acceptance

Implement the approved review A1–A15, persisted in Purchasing MASTER §9.1. This Card is
implementation sequencing, not another blueprint. Scope is SO Batch Purchase and its shared
capabilities; no redesign of Manual Purchase, Purchase Orders, Receiving or Purchasing navigation.
Keep all existing coverage/selection guards, connected sections, document summaries and History.

Owner extension, 2026-09-16: one table, two groups (`To buy` expanded first;
`No purchase needed` initially collapsed), search/filter over both and reveal matches.
No view switch or separate history page. The owner explicitly accepted the second label to
avoid calling Ready-Stock-only coverage `Ordered`.

## Execution

1. Red regression: reserve with persistent usage, release and reassign, GET demands restores
   stockTaken=0 and selectable item demand. Test sold/exact and legacy cases separately.
2. Fix read ownership: current reserved_order_line_id supplies coverage. History can establish
   that a ledger entry is modern and therefore ineligible for legacy fallback; never turn history
   into current coverage. Never alter or subtract ledger entries.
3. Audit 0471 → 0500 and later migrations, including 0500 alternate live hashes. Verify both
   release and reassign clear the binding. Any new production SQL follows the governed apply gate.
4. Red UI/API tests then implement server Order By projection, shared parent selection/date
   contract, default sort, Goods date and A3–A15 controls/layout/copy/route corrections.
5. Focused tests, full gates, typecheck, lint, migration validation/replay, build and diff check.
   Walk authenticated UI at 1440, 1180, 820 and 390px if credentials/session permit. Record evidence.
6. Commit, PR, passing CI, merge/deploy and production proof per ENGINEERING. Production SQL
   apply requires explicit owner approval. Never report skipped/unavailable checks as passed.

## Delivery evidence

Pending; replace with measured files, gates, screenshots, SQL path, commit/PR/CI/deploy and
remaining limitations before closure.
