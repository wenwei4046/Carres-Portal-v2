# REGISTER LAWS — single source of truth for every Carres register
> Sales Orders · Delivery Orders · Purchase Orders · Receiving · Claims · Payments
> Every new chat: READ THIS FIRST. Do not re-study GitHub/Linear/Gmail — the study is done (06-comparison.md).

1. ONE reusable Register component. Business pages consume it; they never fork it.
2. Search always left, compact (~200px). It searches across fields; it is not the hero.
3. Export always right. Wording explicit: "Export Excel — current view" / "Export Excel (N selected)".
4. Column chooser always right, shows count (e.g. Columns 5/28), grouped, persisted per user, with Reset.
5. Per-column filters behind a header ▼ (popup: find + checkbox values + date/number ranges). NEVER a permanent filter-input row.
6. No KPI/revenue cards on a register. Aggregates belong to Dashboard.
7. Detail opens in a fixed side pane (35%); grid reflows, frozen identity columns stay visible. ↑↓ navigates, Esc closes.
8. THE REGISTER NEVER OWNS WORKFLOW. It may Search · Filter · Sort · Select · Inspect · Export. Bulk selection serves view actions (export/print/copy) only — never operational workflow.
9. Export = current view (visible columns + filters + sort). With selection = selected rows only. (Verified against a real 2990 export: 21 visible columns, filtered rows only.)
10. One interaction everywhere. A new register page = new columns + new data source. Nothing else changes.
11. Excel row law: one record = one row, one cell = one fact, no cell contains a layout/chip/icon/workflow, all rows equal height (~28px, body fs-12, header fs-10).
12. Every field edit (anywhere) writes history: who · when · old → new.

## Deliberate deviations from international patterns (documented, not accidental)
- NO Saved Views / Layout Manager (GitHub/Linear have them). Evidence: our team used AutoCount for years and saved exactly ONE layout. Column-visibility persistence + Reset is enough.
- Per-column funnel filters over a global query bar. Our operators come from Excel/AutoCount, not from engineering tools.
- Fixed 35% pane, not resizable (owner ruling 2026-08-09; revisit only if operators complain).

13. ONE Register Engine for every Carres register. A module may
    configure: columns · filters · exports · detail panel.
    A module may NOT fork or modify the engine. If a new capability
    is needed, extend the engine once so every register benefits.
