# PURCHASING — CARD 11 · SO BATCH PURCHASE — ORDER BY AND TRUTHFUL DEMAND RESTORATION

Module: Purchasing × Stock · Sequence: 11 · Lane: BUILD / DELIVERY
Status: ROUND 1 BUILT · Owner approved: 2026-09-16
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

Local implementation, typecheck, lint, migration guard and production build pass.
Draft PR: https://github.com/wenwei4046/Carres-Portal-v2/pull/1395. CI and delivery remain open.

- Demand regression was red for both release and reassignment with retained usage. Actual
  reservation SQL → release/reassign SQL → GET demands now restores `stockTaken=0`, `toBuy=1`,
  while the ledger is byte-for-byte unchanged. Sold bindings and legacy coverage remain covered.
- API/SQL focused run: 106 passed; final demand suite after read-failure protection: 76 passed.
  Shared full suite: 3,401 passed, then revised timing-count suite: 84 passed.
- Web full run: 4,856 passed and one obsolete icon-registry count failed. After registering
  `panelToggle`, five focused suites passed 189 tests. This is not a claim of a final full green
  gate; CI must run the final tree. Lint passes (existing warning-only governance debt remains).
- Local actual-component fixture walked at 1440, 1180, 820 and 390px. At 820px the 536px
  canvas uses an absolute 240px filter overlay and 40px rows; at 390px Clear, duty avatar,
  Issue PO and export remain reachable. Issue review: 1156px surface has 578px halves;
  896px surface stacks and scrolls. Fixed CSS specificity after measuring the failed overlay.
  Screenshots are local review artifacts, not authenticated production proof.
- Full 521-file PostgreSQL 17 migration replay: only baseline failures 0149, 0317, 0339,
  0398a and 0453. Canonical final 0500 release/reassign bodies clear the binding. Its alternate
  accepted bodies do not; tests execute both actual alternate bodies and prove the correction.
- Proposed forward SQL is `scripts/purchasing-reservation-binding-repair.sql`, kept OUTSIDE
  `supabase/migrations` pending explicit approval under ENGINEERING §5. Number reconciliation
  measured live tracker 0509 and repository/all branches maximum 0521; remeasure before numbering.
  No production SQL has been applied.
- Authenticated production SQL read on 2026-09-16: live release hash
  `be8a7765464ae6a7929d31b435bf9e65`; reassign hash `332ca1257c6ce5e25b4496652715d490`.
  Both actual UPDATE assignments already clear `reserved_order_line_id`; candidate would leave
  them unchanged. Both have `search_path=public, pg_temp`; neither body contains the 0500
  `v_role is null` phrase. Do not silently replace these differing live bodies.

Production rollback probe against committed `4bf5c50a` passed: the candidate leaves both live
function hashes unchanged, and the exact repair block rejects an unknown temporary function body
(the negative control). The transaction rolled back; no production function or tracker changed.

## Round 1 — owner rulings R1–R8 (2026-09-16)

Scope: SO Batch Purchase only; rulings persisted in Purchasing MASTER §9.1, UI MASTER §6.7 (search),
COPY-STANDARD (SO Batch rows) and the tokens doc (`kit.slate.2`, canvas text). Manual Purchase is
the next round and starts with an audit.

- **Engine (opt-in, siblings unchanged):** DataGrid `palette="slate"`, `searchPresentation="responsive"`,
  governed group heading/button, ticked-row fill. Smoke-rendered Sales Orders frame, Delivery Orders,
  Payments, Manual Purchase and Purchase Orders previews: no new classes, same header colours, no
  page errors.
- **Shared:** `soBatchOrderPlanning` groups by remaining demand; `compareSoBatchPlanning` orders it.
  The pool-covered test fails on the previous rank rule (it put the order in `No purchase needed`).
- **Rendered evidence — FIXTURE, not authenticated production:** `apps/web/so-batch-shell-preview.html`
  mounts the real `OperationApp` shell with a seeded 27-order payload. Screens in
  `docs/evidence/purchasing-11-so-batch-round1/`. Measured: grid left/width 480/900 (1440),
  308/812 (1180), 68/692 (820, rail overlays), 68/262 (390); document never scrolls sideways;
  all 10 headers fit text + controls at 1440, 390 and 200% zoom; header slate-3/slate-11 11px/600
  5.22:1; heading 13px/600 16.39:1, 38px; counts, absences and footer 5.94:1; row rules slate-5;
  ticked row and pinned cells blue-3; expansion slate-2; link on ticked row 14.62:1 (was 4.25:1,
  fixed); `Issue PO` 32px and inside the grid at every width; search box at ≥520px toolbar, icon at
  262px; search reveals a collapsed match; keyboard reaches and toggles `No purchase needed` with a
  2px blue-9 focus ring (89 Tab stops away); Issue → `Esc` stays → `Back to buying` keeps scroll
  420/150, the tick, the open group and the query.
- **Gates:** shared 3,408 passed; web focused suites 402 + 130 passed; full web run 4,862 passed with
  two load timeouts that pass alone (Manual Purchase 122, Warehouse Stock 26); typecheck, design
  standard and production build pass. CI result, merge SHA and production proof are recorded in the
  PR.
- **Owed:** authenticated owner walk on production. `scripts/purchasing-reservation-binding-repair.sql`
  remains a separate, unapproved production gate; this round does not apply or approve it.
