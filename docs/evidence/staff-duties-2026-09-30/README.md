# Staff & Duties verification · 2026-09-30

These screenshots are local **test fixtures**, using the real SettingsWorkspace, StaffDuties,
ActivitySettings and kit components. All API requests are intercepted; no business write is made.
They are not production screenshots or proof of live automatic assignments.

| Viewport | Catalogue / detail | Horizontal overflow | Row height |
|---|---|---|---|
| 1440 × 900 | 320 / 1120 px | 0 | 52 px |
| 1180 × 900 | 272 / 908 px | 0 | 52 px |
| 820 × 900 | one pane, 820 px | 0 | 52 px |
| 743 × 900 | one pane, 743 px | 0 | 52 px |
| 390 × 900 | one pane, 390 px | 0 | 52 px |

Measured through the actual browser DOM. Computed font was Inter, DM Sans, system-ui.
Narrow selection opens detail; Back restores the catalogue. History starts collapsed and exposes
system time/reason separately from effective assignment dates. The single Assign dialog preserves
its fixed Duty and current assignee, with no default selected person/date. The menu-to-dialog
focus issue discovered in this walk is fixed through the shared Modal returnFocusRef contract.

Exact committed SQL 0613, 0615–0621 passed rollback probes: independent checkpoints, retry,
no late bounce-back, manual precedence, recorded unavailability, source/grant guards and unchanged
GRN amendment authority. All 18 final function bodies matched committed-file hashes in the probe.
The availability pass plus both source snapshots took 183 ms on the measured source population.
No probe table or tracker row remained. This does not claim the migrations are applied.
