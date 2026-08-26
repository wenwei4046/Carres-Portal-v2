# PURCHASING — CARD 02-A · FIX SO BATCH PURCHASE LEFT RAIL TO ORDER TIMING AND SAFETY DAYS

**Module:** Purchasing · **Sequence:** 02-A
**Status:** QUEUED — owner commissioned 2026-08-26
**Lane:** BUILD / DELIVERY
**Depends on:** `PURCHASING — CARD 02 · REBUILD SO BATCH PURCHASE REGISTER AND COMPLETE THE
GUIDED PO ISSUE JOURNEY`, including all production corrections through PR #921

> **For the build agent:** start from the latest `origin/main`. Read `CLAUDE.md`,
> `docs/ERP-ARCHITECTURE.md`, `docs/purchasing/MASTER.md`, `docs/ui/MASTER.md`,
> `docs/COPY-STANDARD.md`, `docs/03-page-patterns.md`, `docs/ACTION-FLOW-STANDARD.md`, and the
> current Card 02 before editing.

---

## 1 · Authority correction — persist first

The owner approved a new correction on 2026-08-26. Current documentation still contains the
obsolete six-state rail, `Ready to buy`, `Covered`, missing Sales/Catalog facets, `order-by
buffer`, and a rule saying Order By never reaches the screen.

First overwrite the current truth in:

- `docs/purchasing/MASTER.md`
- `docs/COPY-STANDARD.md`
- the directly conflicting Purchasing passage in `docs/03-page-patterns.md`
- any directly conflicting terminology in `docs/ACTION-FLOW-STANDARD.md`

Do not append competing versions. Git and this Card keep history. MASTER and COPY keep only the
final current truth.

## 2 · Current → problem → approved correction

**Current:** The left rail shows `Ready to buy`, `Covered`, `No customer date`, `No SKU`,
`No supplier`, and `No production days`.

**Problem:** These words make staff guess whether they are allowed to order. Valid SO purchasing
demand already arrives from Sales/Catalog with the customer date, SKU and supplier. `Covered`
duplicates the Purchase Orders destination. The rail does not explain early ordering or how much
safety time remains.

**Approved correction:** The rail shows only unissued buying demand, order timing, remaining
Safety days, and the one Purchasing-owned setup exception.

**Trade-off:** The rail gains more timing rows, but every row has one exact meaning and no staff
experience is required.

## 3 · Exact left-rail contract

```text
TO ORDER

All not ordered                         37


ORDER TIMING

Can order early                         xx
14 safety days left                     xx
1–13 safety days left                   xx
No safety days left                     xx
Not enough production time              xx


SETUP TO FIX
Render this whole section only when its count is above zero.

Production time not set                 xx
```

Rules:

- Counts are uncovered SO buying lines, not documents or notifications.
- Zero counts print no number.
- Rail rows use the governed `NavRow` active treatment.
- Every filter toggles and clears completely under the shared local-rail law.
- Never show `Today`, `Tomorrow`, `Overdue`, `Follow Up`, `Needs Attention`, `Priority`,
  `Pending`, `Waiting`, `Next Action`, `Buffer`, or `Ready to buy`.
- `Can order early` is selectable. Order By is a planned date, never an unlock date.
- `1–13 safety days left`, `No safety days left`, and `Not enough production time` remain
  orderable. They express timing risk, not `Cannot buy`.
- `Production time not set` is the only normal setup blocker on this surface. It belongs to
  Purchasing Settings and is not selectable until the Supplier × Category production time exists.
- Fully covered / `Buy = 0` lines do not remain in SO Batch Purchase. They are found through
  Purchase Orders, Stock and Order Route.
- After a PO is issued, its covered quantity leaves this page. If the PO is cancelled and the
  quantity is still required, the demand returns automatically.
- Do not create a second stored status. Derive every category from the one server planning engine.

## 4 · Safety-days contract

The approved visible term is Safety days. Do not show `buffer`.

```text
Safety days = 14 working days
Production working days = existing Supplier × Category setting
```

The current server planning engine remains the only arithmetic authority:

```text
Customer Delivery
− 14 Safety days
= Goods Must Arrive

Goods Must Arrive
− Supplier × Category Production working days
= Order By
```

Do not subtract Safety days twice.

Calendars remain authoritative:

- Safety days use the governed Office working calendar and holidays.
- Production working days use the supplier's configured work week and holidays.
- Browser code performs no working-day arithmetic.

Timing classification:

```text
today < Order By
→ Can order early

today = Order By
→ 14 safety days left

today > Order By, with 1–13 working days between expected production completion and Customer Delivery
→ 1–13 safety days left

expected production completion = Customer Delivery
→ No safety days left

expected production completion > Customer Delivery
→ Not enough production time
```

`Order By` stays fixed for the demand unless an authoritative source fact changes. `Safety days
left` changes as working days pass.

The setting copy is:

```text
Safety days                         14 working days
Extra time allowed for delays.
```

Reuse the existing governed setting and internal engine field. Do not create a second Safety-days
field or arithmetic. Make the effective governed value 14 through the repository's existing
Settings/configuration authority. Measure first; do not invent a migration if the existing
governed settings path is sufficient.

## 5 · Remove from this rail

Remove these rail words and states:

```text
All lines
Ready to buy
Covered
No buying needed
Cannot buy
No customer date
No SKU
No supplier
No production days
BUYING RECORDS
WORK TO DO
```

Unexpected missing customer-date, SKU or supplier data must fail safely at its owning boundary.
Do not silently default it and do not turn it back into a permanent Purchasing rail facet.

## 6 · Strict scope boundary

This Card owns only:

- the SO Batch Purchase 200px local rail;
- the server-derived timing/facet fields required for its counts;
- the Safety-days setting wording and effective value;
- directly conflicting MASTER/COPY/page-pattern wording;
- focused tests and production visual verification.

This Card must not redesign or change:

- the right Register columns or their order;
- table density, row layout or horizontal behaviour;
- the shared `GoodsMiniTable` row expansion;
- `Deliver To` or Split;
- the 50/50 Issue PO journey or PDF;
- Purchase Orders, Manual Purchase, Receiving, Returns or Claims pages;
- the Purchasing module sidebar;
- Work Engine ownership;
- Sales Order customer-promise ownership;
- Stock arithmetic;
- Delivery ownership of required-arrival facts;
- PO, SO or Unit numbering;
- supplier communication or real supplier documents.

The right Register listing will be reviewed by the owner only after this Card is
production-verified.

## 7 · Required tests

Write failing tests first and cover:

1. exact rail headings, row order and approved words;
2. absence of every retired/banned word;
3. timing-boundary cases: greater than 14, exactly 14, 13, 1, 0 and negative;
4. supplier-specific production working days and work weeks;
5. Safety days using the governed working calendar and holidays;
6. no browser-side date arithmetic;
7. early lines remain selectable;
8. low/no Safety-days lines remain selectable;
9. production-time-not-set is blocked and the conditional section hides at zero;
10. `Buy = 0` lines are absent;
11. issued quantity leaves and cancelled uncovered quantity returns;
12. rail filters toggle and clear under the shared Register law;
13. the right table, expansion and 50/50 surface remain unchanged.

Run focused tests during development, then the complete repository release gate.

## 8 · Required production walk

After CI, merge and deployment, verify the exact production SHA and capture:

1. 1440px SO Batch Purchase with the complete corrected rail;
2. `Can order early` selected and its rows still selectable;
3. `1–13 safety days left`, `No safety days left`, and `Not enough production time` fixture
   states;
4. `Production time not set` visible, then the whole section absent when its count is zero;
5. Settings showing `Safety days · 14 working days`;
6. evidence that the right table and shared expansion did not change.

Use controlled fixtures only. Do not send a real PO or supplier message.

## 9 · Delivery behaviour

Execute autonomously through implementation, tests, self-review, CI, merge, deploy, production
SHA verification and Card/MASTER closure. Do not return routine engineering choices, rebases,
test failures, PR mechanics or deployment steps to the owner.

Only a genuinely new business-rule conflict, an unavoidable governed production migration
approval, a credential requirement, rollback/emergency, or irreversible production-data change
may interrupt.

When complete, report the production result and stop. Do not begin redesigning the right
Register.

---

## 10 · Execution record — 2026-08-26

**Branch:** `claude/purchasing-02a-left-rail-timing`, cut fresh from `origin/main` `48940312`
(#924), built in an isolated worktree. **PR:** https://github.com/wenwei4046/Carres-Portal-v2/pull/926

### 10.1 Authority persisted first

One commit before any code: `docs/purchasing/MASTER.md` §9.1 (the rail contract, the Safety-days
law and timing classification), `docs/COPY-STANDARD.md` (the rail block rewritten; dictionary
`order-by buffer` → **Safety days** with `Buffer` banned; `Overdue`/`Buffer` added to the
Purchasing surface bans; the retired rail words listed), `docs/03-page-patterns.md` (the frozen
2026-08-01 To Order example overwritten with the current SO Batch Purchase pattern; the
"`Order By` never reaches the screen" rule retired — Order By now DRIVES the timing rows and
remains a planned date, never an unlock date), `docs/ACTION-FLOW-STANDARD.md` ("arrival buffer" →
"Safety days"). Nothing appended beside old truth.

### 10.2 The model

- `PurchaseDemandState` = five timing states (`can_order_early` · `safety_days_full` ·
  `safety_days_low` · `safety_days_none` · `not_enough_production_time`) + four blockers.
  **`covered` no longer exists on the wire**: a fully covered / `Buy = 0` build or
  stock-covered line is not returned at all, and returns automatically by recomputation when
  the covering PO is cancelled (`purchase_order_lines` is read `status = 'open'` and nothing
  else) — proved by test.
- `purchaseDemandStateWords(safetyDays)` / `purchaseDemandRailWords(safetyDays)` compose the
  safety-band words from the governed value, so a changed setting can never make the screen lie.
  At 14 they are the approved words exactly.
- **One engine.** `ToOrderBuild` now carries its bundle's own `raiseBy` (Order By) and
  `promiseIfOrderedToday` (expected production completion). `purchaseDemandTimingOf` only
  COMPARES the engine's dates: `today < Order By → Can order early`, `today = Order By → full`,
  then office-calendar working days between expected completion and Customer Delivery
  (`≥ safetyDays → full` on calendar rounding, `1…13 → low`, `0 → none`,
  `completion > delivery → not enough`). Safety days are subtracted exactly once, in
  `net-requirements.ts`, where they always were.
- A carried build the engine gave no dates falls to `no_production_days` — the one
  Purchasing-owned setup facet — never a silently defaulted timing. The three Sales/Catalog
  blockers stay row facts (fact/fix two-line treatment) and are not rail facets.
- The rail: `TO ORDER · All not ordered` (active = no facet; clicking clears — the shared
  local-rail `All` law), five timing rows (all orderable, all selectable), `SETUP TO FIX`
  rendered only above zero, with a guard that drops its filter when the section hides.
- Settings: `Safety days` · `Extra time allowed for delays.` · `working days`; the save key and
  engine field stay `order_by_buffer_days` — one setting, one arithmetic, no migration.

### 10.3 Gates — all green on the final branch

| Gate | Result |
|---|---|
| `pnpm test` | shared 115/2686 · api 126/2481 · web 280/3466 — **8,633 tests, 0 failed** |
| `pnpm typecheck` · `pnpm lint` · `check:v4` | clean |
| `node scripts/check-migrations.mjs` | 402 filenames validated; **this Card adds no migration** |
| `pnpm build` | clean; `so-batch-rail-preview.html` **absent from `apps/web/dist`** — verified |
| `git diff --check` | clean |

Tests written first and proved failing: 37 failures across the two shared contract files before
the model landed; the API projection fixture was re-anchored (Date faked to Wed 2026-09-02,
deliveries composed with the shared calendar engine relative to expected completion) so the five
timing bands are deterministic on any run day.

### 10.4 The dev walk — real component, seeded payload

`apps/web/so-batch-rail-preview.html` + `src/dev/so-batch-rail-preview.tsx` (dev-only vite
entry, the `route-preview` precedent; cannot reach production). Evidence in
`docs/evidence/purchasing-02a-rail/`:

| File | Proves |
|---|---|
| `1-1440-rail-complete.png` | the complete corrected rail at 1440×900, one row per category |
| `2-can-order-early-selected.png` | `Can order early` active (NavRow wash + 2px line), 2 rows, both selectable, honest footer |
| `3-risk-bands-filtered.png` | `1–13` + `No safety days left` + `Not enough production time` selected together, rows still selectable |
| `4a/4b` | `SETUP TO FIX` visible with its one unselectable line · the whole section absent at zero |
| `6-expansion-unchanged.png` | the shared `GoodsMiniTable` expansion untouched |
| `0-old-vs-new.png` · `old-vs-new-rail.html` | the retired six-state rail reconstructed beside the real corrected page |

Measured in the rendered DOM: the rail's exact text is the §3 contract verbatim; 8 rows → 8
tick-boxes with exactly the two blocked rows disabled; `All not ordered` `aria-pressed=true` at
rest and after clearing.

- 🟡 **`Not enough production time` truncates by ~10px** in the governed 200px rail
  (`Not enough producti…`); the tooltip carries the full words. The words are the owner's exact
  approved copy, so nothing was shortened. Proposed fix if she wants it: let this rail's labels
  wrap to a second line instead of truncating.

### 10.5 Release steps still owed (autonomous)

1. CI green → merge → automatic deploy → production SHA proof.
2. Set the governed value 7 → 14 through the existing settings authority (measured live
   2026-08-26: `order_by_buffer_days = 7`; range check 0–60 admits 14; config row + audit line,
   **no migration** — §4's own instruction).
3. Production walk per §8 and closure of this record.
