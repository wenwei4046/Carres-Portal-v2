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

- 2026-09-23 — Workspace Work v4 is assembled from the governed flat `PageShell` Work variant,
  the shared `FilterRail` and one shared `Avatar` identity chip. Its responsive shape is measured
  from the Work canvas: 240/360/min-500 at three panels; the 240px rail plus list/detail replacement
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
  `WorkActionRow` and `WorkActionPanel`. They own layout and presentation only; the server Work
  contract owns assignment, dates, completion and source health.
- Workspace Work authority and measured UI contract — `docs/workspace/MASTER.md` §§5–6.
- Rejected/exploratory Workspace HTML and companion specification under `docs/prototypes/` must not
  be used as implementation authority.
- Payment Register configuration — `apps/web/src/pages/finance/PaymentRegister.tsx`.
- Operation Payments navigation — `apps/web/src/pages/portal/portal-nav.ts`.

## Non-goals

- No new visual theme.
- No hardcoded staff, bank, delivery, payment or storage facts.
- No duplicate Payment workflow or communication history.
