# Orders — List page (canonical)

`index.html` is a faithful recreation of `OperationOrdersControl` — the reference
List page every other Carres list copies. It is the ~80% archetype.

**Structure (the `ListPageShell` frame):**
- **60px nav rail** (collapsed) — flame-heart logo, Lucide icons, flame active
  bar + `--flame-light` fill, OP avatar pinned bottom.
- **White header band** — breadcrumb `Operations › Orders`, 24px title, `Synced …`
  stamp + refresh; right cluster = pill search, Bell (badge 34), Help, Settings.
- **240px facet** — white panels with cream (`#F1EFE8`) section bars: Summary /
  Chase now (red title) / Stock / Logistic, each row = name + mono count.
- **White toolbar** — status tabs (active = black fill) · `N of M` · `+ Master`
  (outline) · `+ AutoCount` (the one flame button) · ⋮.
- **44px-row table** — sticky dark-free white header, `table-fixed` + % colgroup
  so it never scrolls horizontally. STOCK cell = pill + ETA line; DEADLINE = date
  + red `over` badge; NEXT = one status-pill verb.
- **Footer** — `176 orders` · Reset filters.

Data is dummy (13 sample orders) driven by a small JS array — swap for real rows.
