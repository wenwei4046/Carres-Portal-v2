# Evidence — 【RECEIVING】 CARD 02 · GRN Register redesign (2026-09-13)

Every image here was captured by Playwright (Chromium, exact viewports) from the dev entries of
`apps/web` on the branch `build/receiving-grn-redesign`. **None of them shows a production or
non-production database record.** The data is the card fixture in
`apps/web/src/dev/receiving-fixture.ts` (three GRNs, one PO with damaged / wrong-item / extra
lines, a 1×1 PNG standing in for a photo, an unsigned video record). Real-record evidence for the
Storage round-trips does not exist yet — see the card's verification matrix.

| File | Entry | Viewport | Data | Shows |
|---|---|---|---|---|
| `shell-1440-01-default.png` | `portal-shell-preview.html` — the REAL Portal shell (`OperationApp`, `PortalSidebar`, `PurchasingTabs`) at `/operation?tab=receiving` | 1440×900 | fixture | Sidebar 232px · rail 240px open · two-month display calendar · default columns · 32px footer at the frame's foot |
| `shell-1440-02-rail-toggled.png` | same | 1440×900 | fixture | Rail hidden → `Show filters` in the toolbar; the sheet takes the width |
| `shell-1440-03-expanded.png` | same | 1440×900 | fixture | The exceptions GRN expanded: `Item · Received · Damaged · Wrong Item · Extra`, full goods names, six evidence doors |
| `shell-1440-04-scrolled-right.png` | same | 1440×900 | fixture | Sheet scrolled 422px right: Start Receiving, Search and Columns still in view, GRN No identity pinned |
| `shell-1440-05-record.png` | same | 1440×900 | fixture | GRN detail 50/50 inside the shell, six sections, `Confirmed` |
| `shell-1440-06-record-paper.png` | same | 1440×900 | fixture | The saved GRN paper rendered by the real PDF renderer (canvas 545×771) |
| `shell-831-01-default.png` | same | 831×900 | fixture | Sidebar collapsed to 60px · rail CLOSED by default at 768–1129 · `Show filters` |
| `shell-831-02-rail-toggled.png` | same | 831×900 | fixture | Rail opened to 240px; toolbar controls still inside the viewport |
| `shell-831-03-expanded.png` | same | 831×900 | fixture | Expansion at 831 with the rail open |
| `shell-831-04-scrolled-right.png` | same | 831×900 | fixture | Sheet scrolled 600px right beside an open rail; toolbar and identity column reachable |
| `shell-831-05-record.png` | same | 831×900 | fixture | GRN detail at 831 |
| `shell-831-06-record-paper.png` | same | 831×900 | fixture | The GRN paper at 831 (canvas 687×972) |
| `preview-01-register-1440.png` … `preview-10-narrow-831-rail-open.png` | `receiving-preview.html` — the page alone in a shell-shaped frame | 1440 / 831 | fixture | The evidence viewer's states (photos, enlarged, unsigned video), the record's sections and history, the narrow rail states |

Measured on the shell entry (both widths): module header 50 · toolbar 45 · table header 36 · body
row 38 · footer 32 · rail 240 when open · no `Clear filters` text anywhere · `bodyScrollX: false`.
The numbers are in the card, `docs/cards/CARD-2026-09-13-receiving-02-grn-register-redesign.md`.

## Review captures (fourth pass, head of PR #1274)
`review-01…08.png` — the same shell entry with a visible `FIXTURE DATA` label at the foot of the
page: Register with the two-month calendar (1440) · the expanded exceptions GRN with its per-line
quantities and separate Photos / Videos doors · the Damaged Photos viewer · the Damaged Videos
viewer (an unsigned record, named as not verified) · GRN detail and its lower sections · 831 with
the rail closed · 831 with the rail open and the row expanded. Fixture data throughout.

