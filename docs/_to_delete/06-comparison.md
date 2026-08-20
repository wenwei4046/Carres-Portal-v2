# 5-product study — the homework, done once (2026-08-09)
Products: GitHub Projects (Table) · Linear · Gmail · Excel · AutoCount(DevExpress grid)

## Patterns 4–5 of 5 share (= safe to standardize; all already in our Blueprint)
1. Slim header + ONE toolbar row owning all view controls.
2. Full-bleed grid, no card wrapper, no zebra by default.
3. Export exists, explicit wording, fixed position.
4. Column hide/show via chooser (never delete).
5. Column reorder by dragging the header.
6. Saved named views (4/5) — WE DEVIATE deliberately (see 00 laws).

## Split decisions (no international consensus — we chose for OUR users)
- Filtering: global query bar (GitHub/Linear/Gmail) vs per-column dropdowns (Excel/AutoCount). Ours: per-column ▼ + compact global search. Reason: operator heritage.
- Detail: Linear peek overlay vs Gmail reading pane vs GitHub side panel. Ours: fixed 35% side pane.
- Header-click sort is universal ONLY in desktop grids; web tools route sort through menus. Ours: header click (Excel heritage).
- Density control: only Gmail exposes modes. Ours: fixed 28px.

## Verified facts
- Excel default row 15pt (~20px). AutoCount grid = DevExpress WinForms (Auto Filter Row, Column Chooser, Best Fit, header-right-click export confirmed against DevExpress docs).
- Gmail: 3 density modes; selection turns toolbar contextual; reading pane right/below, off by default.
- Linear: Space = peek, ↑↓ moves selection with live preview, Esc closes; filters live in URL.
- GitHub Projects: View menu holds Fields/Group/Sort/"Export view data"(.tsv).
Full source URLs: see git history of this file (research 2026-08-09).
