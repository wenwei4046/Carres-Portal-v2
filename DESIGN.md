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

- 2026-09-16 — Added a standalone owner-review prototype for Workspace Work. The approved direction
  uses the existing global navigation plus three working panels: working day/module, action list,
  and selected owning-module action. It uses Carres surface, border, typography, selection and
  primary-action semantics; it is not production implementation.
- 2026-09-11 — Loaded the existing Carres React/Tailwind stack for the Payment production recovery.
  Reuse the governed Register, Object Detail, Work and action components; do not add a dashboard,
  module-specific inbox, Payment Monitor, or alternative money truth.
- 2026-09-11 — The Operation Payments rail opens Invoices first so the operator sees money that
  needs collection. The recorded-money listing retains six default columns; audit columns remain
  available through the shared Columns control.

## Components

- Existing Carres shared component inventory is authoritative; inspect before extending.
- Workspace Work three-panel HTML prototype — `docs/prototypes/workspace-work-three-panel.html`.
- Workspace Work measured UI handoff — `docs/prototypes/workspace-work-three-panel-SPEC.md`.
- Payment Register configuration — `apps/web/src/pages/finance/PaymentRegister.tsx`.
- Operation Payments navigation — `apps/web/src/pages/portal/portal-nav.ts`.

## Non-goals

- No new visual theme.
- No hardcoded staff, bank, delivery, payment or storage facts.
- No duplicate Payment workflow or communication history.
