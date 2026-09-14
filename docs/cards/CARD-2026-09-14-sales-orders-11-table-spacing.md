# SALES ORDERS — CARD 11 · Table spacing and six-column expanded goods

Module: Sales Orders · Sequence: 11 · Lane: BUILD / DELIVERY
Status: OWNER APPROVED — implementation in progress, not delivered.
Owner: 2026-09-14 “agreed. open card to start code at new chat”.
Authority: Orders MASTER §0.1; UI MASTER Register; COPY-STANDARD; shared components/tokens.

## Scope and sequence

Own /operation/orders presentation and necessary opt-in shared table capability only.
No migrations, business-data writes, or changes to Purchasing's approved details table.
Existing related Sales Order revision/history Cards are different work; Orders MASTER identifies
completed Cards 1–10. This is the next scoped Sales Orders correction, Card 11.
Start: clean detached bd902136; fetched origin/main at the same SHA; isolated branch
codex/sales-orders-table-spacing. No AGENTS.md found in the worktree or ancestor chain.

## Current → problem → correction → trade-off

Authenticated production at 847×704 reproduces five child columns:
Category | Item Details | Qty | Unit ID | Deliver To. Source salesOrderLayout explicitly chooses
that sequence, percentage widths and normal wrapping; this is a source mismatch, not evidence
of cache. Measured child widths 98.25 / 294.75 / 65.5 / 98.25 / 98.25px. Main Requested Delivery
Date is 192px while Customer is 144px. Side padding already measures 8px; preserve it.
Restore six fixed-content tracks with flexible Item last, parent-edge alignment and 12px gaps.
Use a two-line date heading and more customer space. Trade-off: narrow screens scroll the grid.
Saved layout influence must be tested independently; this observation does not establish that
another user's browser has identical preferences.

## Acceptance

- Exactly Category | Unit ID | Deliver To | SKU | Qty | Item; no item checkboxes.
- Measured 8px side padding, fixed content widths, 13px readable values, visible grid lines.
- Single-line codes; complete multi-ID Popover and truthful unavailable/error/missing states.
- Child left equals actual SO No edge, right equals parent table edge; four borders; 12px gaps.
- Exact Requested Delivery Date label on two deliberate lines; usable sort/filter controls.
- Customer/location space; dates/SO numbers one line; internal horizontal scroll at 847×704.
- Default and existing saved layouts including reorder/optional columns survive reload.
- Render at 847×704 and desktop, normal/selected, long names/codes and multiple IDs.

## Verification and delivery

Targeted regression tests with a negative control, purchasing/shared consumer checks, then
repository CI gate: migrations validation, lint, typecheck, tests, production build, secret-name
bundle guard. Screenshots and measurements recorded here with honest fixture/live boundaries.
PR → successful CI → merge → successful exact-SHA deployment → authenticated read-only production
walk → Card/MASTER closure. Delivery proof is pending.

## Implementation checks (delivery still pending)

- Sales Orders regression suite: 50 tests pass. Shared grid sticky checks: 6 pass.
- Purchasing SO Batch plus shared GoodsMiniTable: 121 tests pass.
- Negative control restored the five-column branch on disk: the six-column integration assertion
  failed as expected; the correct implementation was restored in finally.
- Lint passed (repository warning-only legacy findings); migration validation passed.
- Local actual SalesOrdersRegister fixture at 847×704: body/client widths both 847;
  grid viewport 727 with 1181 scroll width. Parent widths 80/104/128/208/184/112/156/144;
  child fixed widths 132/140/200/152/64 with Item remainder 426. Header 36px; child values
  13px/18px. Every child cell has 8px left/right, child frame four 1px borders, parent expansion
  12px top/bottom. Child x=130 equals SO No x=130; child right=1246 equals parent right=1246.
- Fixture preview uses the actual page and shared engine with isolated sample responses, not
  production business data. Production baseline is before-847.png; post-change production proof
  remains pending. Do not infer delivery from these measurements.


## Rendered acceptance before merge

The actual page fixture passed 847×704 and 1440×900, with two expanded rows at desktop:
the five fixed child widths stay 132/140/200/152/64px in both, while Item grows from 426 to
560.539px. Body width equals viewport width in both. Saved layout moves Customer before SO No,
keeps Customer=288px and Requested Delivery Date=240px, adds Phone and survives reload.
The child then begins at x=418, exactly the reordered SO No edge, and reaches the parent right edge.
The normal and selected toolbars remain accessible at 847px; sort and the date filter open correctly.
The sorted two-line date button is 87.531×28px within its 128×36px header.

Content measurements at the real 13px font: Mattress protector=113.406px; ordinary SKU
5539-1A(LHF)=94.586px; AL Sungai Buloh ×10=129.039px; Unit ID (14) trigger=86.516px.
The retained fixed tracks cover these plus 16px padding and normal longer codes/destinations;
Qty retains its shared 64px header/numeral track. The 321px stress SKU and 311px stress Unit ID
stay one line in keyboard-scrollable code spans (ArrowRight produces scrollLeft=40), retaining
full-text titles. No code spills into a neighbour. The multi-ID Popover exposes all 14 IDs.

Evidence: `docs/evidence/sales-orders-11/` fixture screenshots and JSON measurements.
These are isolated samples, not live transactions. The fixture entry is excluded from production
and is not committed. A local typecheck/build was stopped under heavy machine contention; the
complete authoritative gate runs in GitHub CI. Initial CI found unsupported `exact` options in
six new test queries; those were removed (role names already match exactly). The corrected
six-column negative-control restoration passes. PR: https://github.com/wenwei4046/Carres-Portal-v2/pull/1305.
