# Carres Design Context

## Stack

- Framework: React 18 + Vite + TypeScript
- Styling: Tailwind CSS with the existing Carres component kit
- Components: shared components under `apps/web/src/components`
- Icons: Lucide React
- Data: TanStack Query

## Authority

- Product constitution: `CLAUDE.md`
- UI grammar: `docs/ui/MASTER.md`
- Copy: `docs/COPY-STANDARD.md`
- Tokens: `docs/01-design-tokens.md`
- Payment workflow and layout: `docs/payment/MASTER.md`

These existing authorities outrank this context file. This file does not define a second token,
copy, component, or business-rule system.

## Decisions

- 2026-09-24 — Delivery proof review inside Work uses Delivery's existing mutation and evidence
  source, with an in-page governed picture viewer, arrow-key navigation, trigger-focus return and
  a real image retry. Acceptance stays unavailable until every photo in the latest proof is readable;
  request-more and reject remain available so an unreadable submission can still be resolved.
- 2026-09-24 — An embedded Work completion never removes its card optimistically. The owning
  mutation first succeeds and refreshes the Work feed; only when the same occurrence is absent does
  its exact Delivery receipt replace the old row, receive focus and move selection to the next open
  occurrence. If the occurrence remains open, no completion receipt is shown.
- 2026-09-24 — Work keyboard entry follows the approved list-detail model: `Enter` on a row selects
  it and focuses the first actionable control in its detail; `O` opens the owning object from a Work
  row or non-editing detail surface. Search, input, textarea, select and contenteditable targets never
  receive the shortcut. The object-door tooltip exposes `O` without adding another visible button.

- 2026-09-24 — Work compact cards rank exact problem/fact first, action second, recipient third and
  keep the document number in a footer object door. Promise failures stay inside their lawful date
  group and print the exact promise/failure rather than a generic badge. Selected detail uses the
  confirmed Carres blue-title white Panel composition and never repeats CURRENT FACT/ACTION/RESULT.

- 2026-09-23 — Workspace Work v4 is assembled from the governed flat `PageShell` Work variant,
  the shared `FilterRail` and one shared `Avatar` identity chip. Its responsive shape is measured
  from the Work canvas: 240/360/min-500 with two 16px separations at 1132px; the 240px rail plus list/detail replacement
  at two panels; one panel below 768px. Actions use the shared 64px-minimum `WorkActionRow`; the
  selected brief uses `WorkActionPanel`. Principal/Operation empty My Work remains truthful and
  provides `Open Team Work`; roles without Team permission do not receive that door.
- 2026-09-16 — Owner-approved Work is an execution workspace, not a read-only directory. My Work
  opens with `Missed` plus the actual current governed day (or next eligible day when a named public
  holiday admits no operation) while the full week remains visible. Panel 3 declares `embedded`,
  `open_module` or `read_only`; embedded actions reuse the owning component/API/permission/evidence/
  completion law. Delivery proof review is the first vertical slice.
- 2026-09-16 — Workspace Work is governed only by `docs/workspace/MASTER.md` §§5–6. The approved
  direction uses the existing global navigation plus three working panels: working day/module,
  action list and a selected-action execution panel. The standalone prototype and its companion
  specification are exploratory artefacts, not implementation authority.
- 2026-09-11 — Loaded the existing Carres React/Tailwind stack for the Payment production recovery.
  Reuse the governed Register, Object Detail, Work and action components; do not add a dashboard,
  module-specific inbox, Payment Monitor, or alternative money truth.
- 2026-09-11 — The Operation Payments rail opens Invoices first so the operator sees money that
  needs collection. The recorded-money listing retains six default columns; audit columns remain
  available through the shared Columns control.

## Components

- Existing Carres shared component inventory is authoritative; inspect before extending.
- Shared staff identity chip — `apps/web/src/components/kit/Avatar.tsx`; one initials algorithm,
  full-name tooltip/focus label and the governed staff colour mapping.
- Work shell primitives — `PageShell variant="work"`, `WorkSplitShell`, `WorkDayNav`,
  `WorkActionRow` (`apps/web/src/pages/operation/work/WorkActionRow.tsx`) and `WorkActionPanel`
  (`apps/web/src/pages/operation/work/WorkActionPanel.tsx`). They own layout and presentation only; the server Work
  contract owns assignment, dates, completion and source health.
- Workspace Work authority and measured UI contract — `docs/workspace/MASTER.md` §§5–6.
- Embedded Delivery proof review — `apps/web/src/pages/operation/components/DeliveryProofReviewWork.tsx`
  and `DeliveryProofReviewForm.tsx`; reuses the Delivery mutation and renders its current photos in
  the shared `Modal width="viewer"` rather than opening a browser tab.
- Rejected/exploratory Workspace HTML and companion specification under `docs/prototypes/` must not
  be used as implementation authority.
- Payment Register configuration — `apps/web/src/pages/finance/PaymentRegister.tsx`.
- Operation Payments navigation — `apps/web/src/pages/portal/portal-nav.ts`.

## Non-goals

- No new visual theme.
- No hardcoded staff, bank, delivery, payment or storage facts.
- No duplicate Payment workflow or communication history.
