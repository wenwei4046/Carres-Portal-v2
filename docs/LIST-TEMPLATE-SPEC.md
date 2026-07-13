# Carres Portal — Operation List Page Template (canonical)

> **Locked 2026-07-13 (Jess approved, live-verified on Orders).** This is the
> canonical template every **operation** List page copies. The Orders list
> (`apps/web/src/pages/operation/OperationOrdersControl.tsx`) is the reference
> implementation; the frame is baked into
> [`apps/web/src/components/ListPageShell.tsx`](../apps/web/src/components/ListPageShell.tsx).
>
> Tokens / geometry / archetypes live in [`DESIGN-STANDARD.md`](DESIGN-STANDARD.md)
> (values in `apps/web/src/lib/design-standard.ts`). This doc locks the **page
> template** on top of that: what goes where, in which order, on which surface.
> A new page conforms to this doc; the doc does not bend to a page.

---

## 0. Anatomy

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ HEADER — ONE full-width WHITE surface band (never cream, never stacked bars) │
│  Operations › Orders                    [search…] [Bell●34] [Help] [Settings]│
│  Orders  Synced 12 Jul 26 ↻                                                  │
├────────────┬─────────────────────────────────────────────────────────────────┤
│ FACET      │ TOOLBAR — ONE row, WHITE surface                                │
│ (white     │  (pills) All·Placed·Proceed·…   30 of 171 · +Master · +AutoCount · ⋮ │
│  panel,    │  └ replaced IN PLACE by the orange bulk bar when rows selected  │
│  cream     ├─────────────────────────────────────────────────────────────────┤
│  section   │ TABLE — white surface, sticky header, own scroll                │
│  bars)     │  40px rows · table-fixed · NEXT verbs                           │
│            ├─────────────────────────────────────────────────────────────────┤
│            │ FOOTER — N orders · Reset filters                               │
└────────────┴─────────────────────────────────────────────────────────────────┘
```

Cream (`bg-background`) shows ONLY behind the body split. The account chip stays
at the sidebar's bottom-left — never in the top-right.

---

## 1. Header — one white surface band

- Full-width `bg-white border-b border-base-200`, edge to edge. Everything on
  this ONE strip — no separate breadcrumb bar, no cream band above or between.
- **Left**: breadcrumb (`Operations › <Page>`, 12px `text-base-400`) over the
  `t-h2` title, with the freshness stamp **beside the title**
  (`Synced <date>` + a `RefreshCw` refetch button, 12px `text-base-400`).
- **Right** (in this order): the page **search** input (rounded-full, 230px)
  → `Bell` → `HelpCircle` → `Settings`. Search lives HERE, not in the toolbar.
- Shell slots: `breadcrumb`, `title` (title+synced node), `actions`
  (search + `<TopBarIcons />`).

## 2. Top-bar icons (site-wide)

All Lucide, **zero emoji**, one consistent size (17px):

| Icon | Behaviour |
|---|---|
| `Bell` (Alerts) | **REAL.** Derived from the live book: overdue orders · deliveries ≤7d with no logistic ETA (chase) · escalations. Red badge = total count. Popover lists SOs per group + "Open Orders". `GlobalTopBar.tsx → TopBarIcons`. |
| `HelpCircle` (Help) | Menu with exactly two items: **Help** · **Training · SOP** (`GraduationCap`) — placeholders until the SOP library exists. |
| `Settings` | Normal size, clearly visible; opens a "Coming soon" placeholder. No settings page is built. |

Pages using `ListPageShell` embed `<TopBarIcons />` in the header's right
cluster; every other operation page gets the slim white `<GlobalTopBar />` bar
(OperationApp pins it; it hides itself on the shell pages so icons never
duplicate).

## 3. Toolbar — one row, white surface

One white panel (`bg-white border border-base-200 rounded-lg shadow-sm`) —
controls never sit naked on the cream bg.

- **Left**: status pills (`All / Placed / Proceed / Pending / Scheduled /
  Delivered` + counts). Active = solid ink fill. When the facet is collapsed, a
  small `PanelLeft` reopen toggle appears before the pills.
- **Right, exactly this order**: `N of M` count · **+ Master** · **+ AutoCount**
  (short labels — full meaning in the hover `title`) · **⋮** at the far corner.

### 3.1 The ⋮ overflow (Columns)

`MoreVertical` icon-only button → menu opens with **Show columns** checkboxes
(persisted per-browser). Room is reserved for Density / Export later. No big
"Columns 8/8" button; a small `N/8` hint appears beside the ⋮ **only when a
column is hidden**.

### 3.2 Bulk bar — in-place orange replacement

Ticking ≥1 row REPLACES the toolbar row in place (nothing moves) with the flame
band (`bg-signature-50 border-signature-100`):
`☑(indeterminate) · N selected · Select all M in <tab> · Assign logistic ▾ ·
Flag · Export ▾ (CSV / Print / Mark delivered) · ✕`. Clearing restores the
pills. The facet and table never jump. Shell slot: `bulkBar`.

## 4. Facet — one white panel, cream section bars (Option 1)

- ONE white panel (240px) in the LEFT column; its top aligns with the toolbar
  top — the toolbar strip lives only in the right column, never spanning above
  the facet.
- Every section is a **cream title bar** (`#F1EFE8`, 11px bold uppercase) with a
  `˅/›` collapse chevron + right-aligned group total. Rows are Gmail-nav pills
  (name left, count right; selection = light blue fill).
- **SUMMARY** is the top section (Outstanding / At-risk / On-time) and carries a
  small **«** (`ChevronsLeft`) on its bar = collapse the WHOLE panel → the table
  widens, active filters surface as toolbar chips, the reopen toggle appears in
  the toolbar. Section order: SUMMARY → CHASE NOW (danger red title) → STOCK →
  LOGISTIC → REGION → CATEGORY (collapsed by default).
- The facet body scrolls independently of the table.

## 5. Table

- White surface, **sticky column header**, its own scroll box (infinite-scroll
  batches of 30).
- **40px rows** (`[&_td]:h-[40px]`), `table-fixed` + a `%` colgroup — the table
  NEVER horizontally scrolls; hidden columns rescale the rest to full width.
  STOCK carries 13% so `Waiting 0/16` never clips (NEXT gives up the 2%).
- **NEXT** = one single-action verb per row, dual-track:
  `Order PO → Chase supplier → Book logistic → Chase logistic → Confirm`
  (Confirm 🔒-locked on a money-hold). Sort = slack ascending.
- Reading conventions (DESIGN-STANDARD §5): no `·` status separators; LATE = a
  date + red pill; never "by" before a partner.

## 6. Scroll model (Gmail)

Header band, toolbar, active-chips row, and the table's column header are all
FIXED. Only two things scroll, independently: the facet body and the table
rows. The page body itself never scrolls.

---

## 7. Copying the template — checklist

1. Render through `<ListPageShell>`; fill slots: `breadcrumb` / `title`(+synced)
   / `actions`(search + `<TopBarIcons />`) / `facet`+`facetOpen`+`onFacetToggle`
   / `toolbar`(pills) / `toolbarRight`(count · page actions · ⋮) / `bulkBar` /
   `activeChips` / `footer`.
2. Facet sections via the cream-bar group pattern; SUMMARY on top with the «.
3. Table: 40px rows, `table-fixed` + `%` colgroup, sticky head, single-verb
   action column where the page has one.
4. Lucide icons only — zero emoji. Short action labels (`+ Master` style),
   full words in `title` tooltips.
5. Token classes only (no raw hex — the lint ratchet
   `scripts/check-design-standard.mjs` enforces this + shell adoption).
6. `pnpm --filter @carres/web lint` + the page's tests green before commit.

**Reference implementation**: `OperationOrdersControl.tsx` (page) ·
`ListPageShell.tsx` (frame) · `GlobalTopBar.tsx` (icons) ·
`PageHeader.tsx` (title row). Live-verified 2026-07-13.
