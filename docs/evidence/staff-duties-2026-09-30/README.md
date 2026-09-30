# Staff & Duties verification · 2026-09-30

The `preview-*.png` screenshots are local **test fixtures**, using the real SettingsWorkspace, StaffDuties,
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

Exact committed SQL 0613, 0615–0621 and 0624 passed rollback probes: independent checkpoints, retry,
no late bounce-back, manual precedence, recorded unavailability, source/grant guards and unchanged
GRN amendment authority. All 19 final function bodies matched committed-file hashes in the probe.
The availability pass plus both source snapshots took 183 ms on the measured source population.
No probe fixture or tracker row remained. All nine migrations were subsequently applied and
their tracker file hashes and all 19 live function bodies matched the exact committed SQL.

## Production proof

PR #1798 merged as `0f80cff62a73d17ade68fce0c07b87a73732cf59`.
[Deployment run 36677653387](https://github.com/wenwei4046/Carres-Portal-v2/actions/runs/36677653387)
passed and both Pages projects, both canonical web domains and API `/health` reported that SHA.
The deployed commit passed shared 3,974, API 3,865 and web 5,815 tests, with 259 existing skips;
lint, typecheck, build and the browser-secret scan passed.

`production-*.png` are authenticated live screenshots at 1440, 1180, 820, 743 and 390 × 900.
Every width had `documentElement.scrollWidth === innerWidth`. Desktop retains catalogue/detail;
narrow screens show one pane. Live facts: PO Yu Jun through 30 September; Next Shasha 1–31 October;
GRN Shasha; check times 10:30/15:00. History opens/closes without changing assignments. No browser
console errors were observed. This login is the shared Sara · Principal account: the time fields
are read-only and the assignment menu is absent. It is not Jess's personal-manager session.
Manager Save/Cancel, reader access, long names, errors and menu-to-dialog return focus were walked
in the real-component fixture; SQL manager gates and writes were tested only inside rollback probes.

Downloaded release asset `index-CTAWmece.js` (7,334,920 bytes) was compared to the actual predecessor
`index-DC6rScYU.js` (7,331,782 bytes): `Morning check time` 0→2, `Afternoon check time` 0→2,
`Normal owner` 2→0; control `Staff & Duties` 13→17. Other modules' existing `Buddy cover` occurrences
remain in the bundle; this proof does not claim global removal beyond the authorised surfaces.

A post-apply rollback probe also passed morning movement → intervening movement → afternoon
current-actor acceptance, with the stale actor refused. Follow-up reads proved the private clock
restored and zero future probe receipts or probe tracker rows.
