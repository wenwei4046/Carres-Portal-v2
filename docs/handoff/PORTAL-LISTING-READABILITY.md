# Claude handoff — PO copy and Portal-wide listing readability

APPROVED / NOT BUILT — Jess, 2026-09-17.

Merge this documentation PR first. Wait until PR #1419 is merged, then open a fresh Claude
conversation (not a fork). Verify main and open PRs before implementation. Another open PR
editing FilterRail, DataGrid or register CSS is a STOP: report the overlap before proceeding.
This handoff does not start Receiving's pending workflow work or expand personal layouts beyond PO.

Authority: [UI MASTER §6.7](../ui/MASTER.md#portal-wide-listing-readability--approved--not-built-jess-2026-09-17),
[Purchasing MASTER §5.6/§5.8/§9.3](../purchasing/MASTER.md), [COPY-STANDARD](../COPY-STANDARD.md).

## SLICE 1 — Purchase Orders wording + PORTAL-WIDE listing readability

- Replace old PO sending display words in code, tests and shared completion wording. Groups:
  `Confirm PO sent to supplier` · `Waiting for goods from supplier` · `Completed` · `Cancelled`.
  Button: `PO sent to supplier`. PO Version line 2: `Sending not confirmed` or
  `PO sent to supplier · {channel} · {date}`. Supplier reply rows: `Date not confirmed` ·
  `Date changed` · `Date passed`. Search code/tests for obsolete `Not marked as sent` and
  `Mark as sent`: zero remaining visible-copy uses. Preserve internal state keys and evidence
  semantics; shared completion says `Current PO version marked as sent`. Missing evidence does
  not prove no send. Keep cancellation/completion precedence and unknown-quantity safeguards.
- Shared FilterRail: style C becomes the DEFAULT for every listing. Icon + text titles,
  collapsible groups, dividers, chosen value in blue only when filtered, single choice per group,
  remembered collapse state. Keep each page's filter content and control type. Use existing kit
  icons; list each existing group's icon mapping in the PR. Special schedules keep their contents.
- Shared DataGrid/register styling: white surfaces, slate-3 header with slate-11 11px/600 normal
  casing, one canvas token #F7F8FA. Retire blue-grey register theme overrides and #F3F4F6 body
  background. Do not copy appearance rules into page styles.
- Text portal-wide: 13 main · 11 table line 2 · 12 helper · 13 error color + icon · 13 cannot-act
  reason by meaning. Replace slate-9 meaningful text on every listing. Follow the canonical UI
  section for colors and hierarchy; do not manufacture helper sentences or new supplier names.
- Render and capture EVERY listing before and after at 1440 and 390: Sales Orders, SO Batch,
  Manual Purchase, Purchase Orders, Receiving, Supplier Claims, Delivery Monitor, Delivery Orders,
  Warehouse Inbound/Inventory/Outbound, Payment Monitor, Payment Records, all Finance listings.
  Inventory routes so no listing is omitted. Check long names, keyboard expand/collapse/choose/clear,
  200% zoom and rendered contrast. Unintended content or behavior changes are defects to fix before
  merge. Preserve permissions, search/filter counts, date meanings and business actions.
- Attach screenshots to the PR rather than committing them. Report any authenticated walkthrough
  that could not be completed as OWED; do not claim production verification from source inspection.
- Run appropriate shared-component and business-regression checks. Report simple Chinese evidence,
  affected pages, failures/owed checks and actual build status. Update authority build markers only
  once proven; owner approval alone is not deployment evidence.
