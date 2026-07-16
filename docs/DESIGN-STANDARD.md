# Carres Portal — Page Design Standard

> ## ⚠️ SUPERSEDED by UI-KIT v4 (2026-07-15)
>
> **The single source of visual truth is now [`docs/CARRES_UI_KIT_V4.md`](CARRES_UI_KIT_V4.md)**
> (white base · functional colour only · restrained Inter scale · slashed-zero mono),
> mirrored machine-readably in [`apps/web/src/lib/design-standard.ts`](../apps/web/src/lib/design-standard.ts).
> Where anything below conflicts with v4, **v4 wins** — the v17 cream-content tokens,
> the 32px `.t-h*` type ramp and the old chip palette recorded here are void.
> This file is kept only as the historical record of the pre-v4 (v17) system and for
> the structural rules v4 explicitly carries forward (§9 layout decisions).
>
> ~~Locked 2026-07-12. Visual tokens are **v17** (locked 2026-06-09, see root `CLAUDE.md` §10).~~

---

## 0. The one rule

**Every page is one of three archetypes. Pick the archetype, use its shell, don't hand-roll chrome.**

| Archetype | When | Shell | Example |
|---|---|---|---|
| **List** (the default — ~80% of pages) | A table/feed of rows you scan, filter, and act on | `<ListPageShell>` | Orders, Stock, Suppliers, Payments, SO Maintenance |
| **Dashboard** (rare — one per role) | Landing KPI overview, marketing hero copy | bare `<div>` + hero header (NOT `PageHeader`) | OperationDashboard, FinanceDashboard |
| **Detail / form** | A single record, opened over a list | drawer (`OrderDetailDrawer` pattern) or modal | OrderDetailDrawer, APDrawer |

List pages are **list-first**: no giant title row, no KPI cards stacked above the table. The
list is the hero. Summary/among-counts live in the facet panel's **Summary** block, not as cards.

---

## 1. Layout geometry — never re-type these numbers

Import from `design-standard.ts` (`LAYOUT`). Do not eyeball a magic px.

- **Main nav (`PortalSidebar`)** — 232px expanded / 60px icon rail. **Fixed. Do not touch per-page.**
- **Right rail (`OperationRightRail`)** — 320px panel / 52px strip. Operation-only.
- **Page header (`PageHeader` / shell top bar)** — 56px (`h-14`). One title size (`t-h2`, 24px).
- **List table row** — 50px (`[&_td]:h-[50px]`).
- **Facet panel** — 240px, collapses to an edge chevron rail.

The portal shell is a 3-column grid `auto minmax(0,1fr) auto` (sidebar | main | right rail).
There is **no single global top bar** — each page renders its own header via the shell.

---

## 2. Colour — tokens only, never a duplicate hex

Colours live **once** in `index.css :root` (as HSL) and reach components **only** through Tailwind
utility classes (`bg-primary`, `text-base-700`, `border-base-200`). `design-standard.ts` `COLOR`
records the resolved hex **for reference/reporting only** — in JSX you use the `className`.

**Rule: never write a hex in a component that duplicates a token.** Use the class. The lint guard
(§6) rejects raw `#rrggbb` in `apps/web/src/**` outside `index.css` / `*design-standard*` / the
narrow chip-fill allow-list.

Key tokens (see `COLOR` for the full set):

- Page bg = cream `#F5F1EA` → `bg-background`
- Card = white `#FFFFFF` → `bg-card`
- Table surface = white; hierarchy from the 1px hairline `border-base-200` + subtle shadow
- Body ink `#111827` → `text-base-900`; muted `#6B7280` → `text-base-500`
- **Flame `#C44D2B`** → `bg-primary` / `text-primary` — the **one** hero CTA per page
- **Black `#111827`** → `bg-base-900` — the workhorse primary button + active tab

### Status chips — the four semantic tones

Use `.pill` + one modifier, OR the `CHIP` record for the Orders-grid soft-fill cells. As of
2026-07-12 both palettes are **unified** onto the warmer Orders-list fill (`index.css` `.pill-*`
now carries the `CHIP.*.ordersFill/ordersBorder`), so a `.pill-warning` renders identically to an
Orders chip.

| Tone | Meaning | Pill class | Fill / border / ink |
|---|---|---|---|
| 🟡 amber | waiting stock / low | `.pill-warning` | `#FBE8C6` / `#F0D08A` / `#92400E` |
| 🟢 green | ready / confirmed | `.pill-confirmed` | `#D6EFD9` / `#A9D8B0` / `#166534` |
| 🔴 red | overdue / no-PO / chase | `.pill-overdue` | `#FCE4E4` / `#F3B4B4` / `#991B1B` |
| 🔵 blue | scheduled / call / assign | `.pill-sent` | `#D3E4FB` / `#A9C8F2` / `#1E40AF` |
| ⚪ grey | done / neutral | `.pill-neutral` | token `bg-base-100` / — / `text-base-700` |

---

## 3. Type + radius + spacing

- **Type scale** — use the `.t-*` utilities (`t-h1` 32 · `t-h2` 24 · `t-h3` 18 · `t-h4` 15 ·
  `t-body` 14 · `t-small` 13 · `t-tiny` 12 · `t-micro` 11 uppercase). Never hand-roll `text-[Npx]`.
- **Buttons** — `.btn-hero` (the ONE flame CTA per page) · `.btn-primary` (black workhorse) ·
  `.btn-secondary` / `.btn-ghost` · `.btn-danger` (red text on white, never filled).
- **Money / qty / margin** — `.t-num` (Inter, lining + tabular figures).
- **SKU / codes / dimensions** — `font-mono` (JetBrains Mono).
- **Radius** — `RADIUS`: card 8 (`rounded-lg`) · button 6 (`rounded-md`) · chip/cell 4 (`rounded-[4px]`) · pill full.
- **Spacing** — `SPACE`: card pad 16 (`p-4`) · page gutter 24 (`p-6`) · default gap 8 (`gap-2`).

---

## 4. `<ListPageShell>` — the structural contract

Every List page renders through `apps/web/src/components/ListPageShell.tsx`. It bakes in the
geometry so no page re-types it, and guarantees the same skeleton everywhere. Slots:

```
<ListPageShell
  title="Orders"                       // → PageHeader (56px, t-h2)
  actions={<search /><buttons />}      // right cluster: search · Alerts · Help · ONE hero action
  facet={<FacetGroups /> | undefined}  // left 240px panel; opens with a Summary block; edge-chevron collapse
  facetOpen / onFacetToggle            // collapse state (persisted by the page)
  toolbar={<tabs + count + Columns />} // thin control bar between header and table
  footer={<rowCount + Reset />}        // sticky footer under the table
  savedViews={<SavedViews ▾ />}        // optional
  activeChips={[{label,onClear}]}      // active-filter chips row (auto-hidden when empty)
>
  <table>…</table>                     // the white surface table (shell wraps it in the scroll box)
</ListPageShell>
```

Hard rules the shell enforces:

1. **Main nav is never touched** by a page — it's outside the shell.
2. **Top bar** is fixed-height (56px), title left, actions right, all at one baseline.
3. **Facet panel** is optional, 240px, collapses to an edge chevron; its top is a **Summary** block
   aligned with the toolbar's tab pills.
4. **Table** sits on a **white surface** with a sticky column header and its **own** scroll area —
   the page body itself never scrolls, only the rows do. The table is `table-fixed` + a `%` colgroup
   so it never horizontally scrolls.
5. **Control bar** (tabs + page-count + Columns picker) is thin, full-width, above the table.
6. **Footer** shows row count + a Reset-filters affordance.
7. **List-first**: no oversized title row, no KPI cards above the table.

A page **may** keep bespoke internals (row/cell renderers, bulk-select head row, drawers) — the shell
standardises the *frame*, not the *contents*.

---

## 5. Orders — the critical-path reading model (the List reference implementation)

Orders (`OperationOrdersControl`) is the canonical List page. Beyond the frame, it carries a
**critical-path engine** so an operator reads risk at a glance. Three date columns, each self-contained:

- **DEADLINE** — the customer's promised date + a countdown. `LATE` = a date + a **red** pill (never a `·` dot separator).
- **STOCK** — state + a stock ETA.
  - Source of the ETA = the **entered / imported per-line `stock_eta`** (migration 0170; filled in the
    drawer or bulk via *Import from Master*). Take the **latest** line ETA = when the whole order can ship.
  - `LATE` = stock ETA is later than `deadline − 3d`.
  - `OVERDUE` = the ETA has passed and the goods still haven't arrived.
  - `Ready` renders nothing (no ETA noise when stock is in hand).
  - **⚠ Data gap:** the spec's alternative `ETA = 下PO日 + lead (MS/BF 7d · SOF 5d)` is **not backed**
    — there is no PO-raised-date on the order. Use the entered `stock_eta`; when absent → `Not set` / `No PO`.
- **LOGISTIC** — partner + delivery date. States: `unassigned` / `no date yet` (grey) / **`call now`
  (red)** = inside the 1–3 day delivery window regardless of stock / `Deliver` (green) / `Delivered`.
  Never write "by" before the partner.

**NEXT** — a single suggested action, dual-track (stock track ∥ logistic track):
`Order PO → Book logistic → Chase supplier → Chase logistic → Confirm`. `Confirm` stays 🔒
locked while a money-hold (unpaid balance) is outstanding. Operation neither schedules nor calls the
customer from this action.

**Sort** — by **slack** (deadline − today, adjusted for the blocking track): the most dangerous
orders float to the top; completed sinks to the bottom.

**Reading conventions** (apply to every List page, not just Orders):
- No `·` dot as a status separator.
- `LATE` = a date rendered *with* a red pill, not the word "late".
- Never prefix a partner/owner with "by".

---

## 6. Enforcement

### 6.1 Lint guard — `pnpm --filter @carres/web lint`

`scripts/check-design-standard.mjs` (zero new deps) runs in CI and locally. It fails the build on:

1. **Hard-coded hex** — a `#rrggbb` / `#rgb` literal anywhere in `apps/web/src/**/*.{ts,tsx}`,
   except `index.css`, files matching `*design-standard*`, and the documented chip-fill allow-list.
   Fix by using a token class.
2. **List page missing its shell** — a file under `apps/web/src/pages/**` whose name is a List page
   (heuristic: renders a top-level `<table` or a `DataGrid`) that does **not** import `ListPageShell`
   or `PageHeader`. Fix by adopting the shell, or annotate `// design-standard: not-a-list-page` with a reason.

> Note: the repo has no ESLint today, so enforcement is a plain Node script wired to the `lint`
> npm script — no toolchain added. If editor-inline squiggles are wanted later, port rules 1–2 to an
> ESLint flat-config plugin; the guard script stays as the CI gate.

### 6.2 PR checklist — paste into every UI PR

- [ ] Page uses the right archetype shell (`ListPageShell` for lists; hero header for a dashboard; drawer/modal for detail).
- [ ] Main nav untouched; header is the 56px `PageHeader` bar with one `t-h2` title.
- [ ] No hard-coded hex — colours come from token classes (`bg-*` / `text-*` / `border-*`). `pnpm lint` passes.
- [ ] Type via `.t-*` utilities; buttons via `.btn-*`; exactly one `.btn-hero` per page.
- [ ] List-first — no KPI cards or oversized title above the table; summary lives in the facet Summary block.
- [ ] Table is a white surface, sticky header, own scroll area, `table-fixed` + `%` colgroup (no horizontal page scroll).
- [ ] Facet panel (if any) is 240px, collapses to an edge chevron; active filters show as clearable chips.
- [ ] Reading conventions honoured (no `·` separators; LATE = date + red pill; no "by" before a partner).

---

## 7. Change control

To change the **look**, edit `index.css` (colours/radius) or the owning shell (layout), **then** update
`design-standard.ts` + this doc to match. Never edit a value in `design-standard.ts` to *drive* a
visual change — it is a record, not a source. New pages conform to this doc; the doc does not bend to a page.
