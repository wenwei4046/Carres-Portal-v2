# CARRES PORTAL — UI KIT (current-state snapshot)

> Snapshot taken **2026-07-16** from branch `feat/orders-drawer` @ `3e78187`.
> This records what is **actually live in the code today** — read back from
> `apps/web/src/index.css`, `apps/web/src/lib/design-standard.ts`,
> `docs/LIST-TEMPLATE-SPEC.md`, `components/SectionPanel.tsx`, and
> `pages/operation/components/OrderDetailDrawer.tsx`. Nothing here is
> aspirational; §11 lists the measured inconsistencies still to fix.
>
> Context: internal ops portal (Vite + React 18 + Tailwind 3 + shadcn/ui) for a
> Malaysian furniture company. Operator = COO + small ops team, desktop-first,
> data-dense screens. The Orders list page + its order-detail drawer are the
> canonical templates every other operation page copies.

---

## 1. Brand & colour (v17, locked 2026-06-09)

All colours live ONCE as HSL tokens in `index.css :root` and reach components
only via Tailwind classes (`bg-primary`, `text-base-500`…). Raw hex in JSX is
banned (lint ratchet `scripts/check-design-standard.mjs`).

| Role | Hex | Class |
|---|---|---|
| Page background (cream) | `#F5F1EA` | `bg-background` |
| Card surface | `#FFFFFF` | `bg-white` / `bg-card` |
| Main bg behind cards | `#F9FAFB` | `bg-base-50` |
| Hairline border | `#E5E7EB` | `border-base-200` |
| Body ink | `#111827` | `text-base-900` |
| Muted text | `#6B7280` | `text-base-500` |
| Icons at rest | `#9CA3AF` | `text-base-400` |
| **Brand flame** (ONE hero CTA / page) | `#C44D2B` | `bg-primary` / `text-primary` |
| Flame hover | `#9A3D22` | `hover:bg-signature-700` |
| Flame tint (active fill / bulk bar) | `#F4E4DD` | `bg-signature-50` |
| Black workhorse (primary buttons, active tab) | `#111827` | `bg-base-900` |
| Section band (cream title bars) | `#F1EFE8` | `.section-band` |
| Section band ink / danger / total | `#221F20` / `#991B1B` / `#6F6960` | `.section-band-title(-danger)` / `.section-band-total` |
| KPI box fill (drawer header metric cards) | `#F7F4EE` | (inline today — no token yet) |

Neutral ramp = Tailwind cool gray as `base-50…base-900`. Focus ring = flame.

Semantic status (Tailwind 600 ink / 100 soft fill):
success `#16A34A`/`#DCFCE7` · warning `#D97706`/`#FEF3C7` · danger/red
`#DC2626`/`#FEE2E2` · info `#2563EB`/`#DBEAFE`.

## 2. Fonts

| Use | Family | Class |
|---|---|---|
| Everything (body + display) | **Inter** | `font-sans` |
| Codes: SKU, SO/ref numbers, dimensions | **JetBrains Mono** | `font-mono` |
| Money / qty / margin readouts | Inter + lining + tabular figures | `.t-num` (`font-medium` + `font-variant-numeric: lining-nums tabular-nums`) |
| POS price hero (dealer POS ONLY — not ops) | Archivo Black | `font-price` |

## 3. Type scale (`.t-*` utilities — size/weight/tracking only, colour stays on the element)

| Class | px | weight | Notes |
|---|---|---|---|
| `.t-h1` | 32 | 700 | tracking −0.02em |
| `.t-h2` | 24 | 700 | page titles |
| `.t-h3` | 18 | 600 | |
| `.t-h4` | 15 | 600 | |
| `.t-body` | 14 | 400 | |
| `.t-small` | 13 | 400 | also the button text size |
| `.t-tiny` | 12 | 400 | |
| `.t-micro` | 11 | 500 | uppercase, tracking 0.05em |
| `.kicker` | 11 | 600 | uppercase 0.22em, flame — hero/section overlines |
| `.label` | 11 | 600 | uppercase 0.1em, base-700 — form/KV labels |

## 4. Buttons (locked hierarchy — sentence case, 13px semibold, 6px radius)

| Class | Look | Use |
|---|---|---|
| `.btn-hero` | flame fill, white text | THE one create/commit CTA per page |
| `.btn-primary` | **black** fill (`base-900`), white text | every other primary action |
| `.btn-secondary` | white, 1px `base-300` border | secondary |
| `.btn-ghost` | transparent, base-700 text | tertiary / toolbar |
| `.btn-danger` | white bg, **red text + red border** — never red-filled | destructive |

All: `px-[18px] py-2.5 rounded-md text-[13px] font-semibold`, `disabled:opacity-40`.
Drawer chase pair (WhatsApp templates): `[Reminder]` = flame outline on white ·
`[Chase]` = solid flame; both `text-[11px] font-semibold px-2.5 py-1 rounded-md`.

## 5. Status pills

`.pill` = `text-[11.5px] font-semibold px-2.5 py-0.5 rounded-full border border-transparent`
(transparent border so bordered + borderless pills share one box height).

| Class | Fill / border / ink | Meaning |
|---|---|---|
| `.pill-warning` | `#FBE8C6` / `#F0D08A` / `#92400E` | waiting / low / on-hold (amber) |
| `.pill-confirmed` | `#D6EFD9` / `#A9D8B0` / `#166534` | ready / confirmed / delivered (green) |
| `.pill-overdue` | `#FCE4E4` / `#F3B4B4` / `#991B1B` | overdue / no-PO / chase (red) |
| `.pill-sent` | `#D3E4FB` / `#A9C8F2` / `#1E40AF` | scheduled / booked (blue) |
| `.pill-neutral` | `base-100` / — / `base-700` | done / neutral (grey) |
| `.pill-draft` / `.pill-collected` | purple / indigo, no border | rarely used |

Order-STATE pills in the drawer header are amber/blue/green/grey only — never
danger red (red is reserved for actionable alarms).

## 6. Geometry

| | px |
|---|---|
| Radius: card / button / small chip / pill | 12 (SectionCard) · 8 (`--radius`, KPI box) · 6 (buttons, menus) · 4 (grid cells) · full (pills) |
| Sidebar expanded / collapsed | 232 / 60 (flame 3px active bar) |
| Right rail panel / icon strip | 320 / 52 |
| Page header | 56 (h-14) |
| Orders list table rows | **40px**, `table-fixed` + % colgroup, never horizontal-scrolls |
| Facet panel width | 240 |
| Drawer body columns | `340px minmax(0,1fr)` — left view column · right work column |
| Card padding / page gutter / default gap | 16 (p-4) · 24 (p-6) · 8 (gap-2) |
| Hairline | 1px `base-200` |

## 7. Shared section chrome — `SectionCard` + `SectionBand` (THE rule)

One component pair (`components/SectionPanel.tsx`) renders **both** the Orders
list facet groups AND every order-drawer panel — list and detail are 1:1 by
construction. **No page may hand-roll this chrome.**

- `SectionCard` = white surface, 1px `base-200`, `rounded-[12px]`, `p-1.5`
  inset (so bands read as inset bars), floats on the cream page.
- `SectionBand` = cream `#F1EFE8` bar, `rounded-md pl-2 pr-1.5 py-1.5`:
  chevron (`ChevronDown/Right size={12}`) + **11px bold uppercase** title
  (tracking 0.04em, ink `#221F20`, danger variant `#991B1B`) + right-aligned
  tabular count `#6F6960` + a free `right` slot (status chip / ⋮ menu).
- Drawer `Panel` = SectionBand + body stacked inside the column's ONE
  SectionCard; collapsible, state persisted per title in localStorage
  (`ops-drawer-panel-v3:<title>`). Defaults: Balance/Delivery/Items/Warehouse
  open; Customer/Storage/Loan collapsed.
- Panel ⋮ menu: `MoreVertical size={16}`, dropdown `w-48 rounded-[6px]
  shadow-lg`, items `text-[12px] px-3 py-1.5`.

## 8. List page template (canonical = Orders list, locked 2026-07-13)

Frame = `ListPageShell` slots. Gmail scroll model: header band, toolbar, chips
row, table column-header all FIXED; only the facet body and table rows scroll.

1. **Header** — ONE full-width WHITE band (`bg-white border-b border-base-200`):
   breadcrumb 12px `base-400` › `t-h2` title + `Synced <date>` ↻ stamp;
   right: rounded-full 230px search → `Bell`(live alerts, red count badge) →
   `HelpCircle` → `Settings`, all Lucide **17px**.
2. **Toolbar** — one white panel: status pills left (active = solid ink fill);
   right in order: `N of M` · short action buttons (`+ Master` style, full words
   in `title`) · ⋮ overflow (Show-columns checkboxes, persisted).
3. **Bulk bar** — ticking rows REPLACES the toolbar in place with a flame band
   (`bg-signature-50 border-signature-100`); nothing else moves.
4. **Facet** — one white 240px panel, cream `SectionBand` groups
   (SUMMARY → CHASE NOW (danger) → STOCK → LOGISTIC → REGION → CATEGORY);
   rows = Gmail-nav pills (count right, selection = light blue fill);
   « on SUMMARY collapses the whole panel.
5. **Table** — 40px rows, sticky head, infinite scroll ×30, single-verb NEXT
   column (`Order PO → Chase supplier → Book logistic → Chase logistic →
   Confirm`), sort = slack ascending.
6. **Footer** — `N orders · Reset filters`.

## 9. Order-detail drawer (current structure)

Full-screen takeover on the cream page (replaces the list; ‹ Orders back
button, no ✕). Vertical stack:

- **Header panel** = ONE SectionCard, fixed (body scrolls under):
  - Row 1: ‹ back · `#SO` + customer-ref both `font-mono text-[22px] font-bold`
    adjacent · order-state pill · meta line 13px `base-500`
    (`customer · region · ordered <date>`) · Flag 18px · ⋮ ActionsMenu.
  - Row 2: **3 KPI mission-track boxes** in one `grid grid-cols-3 gap-2` —
    CUSTOMER·MONEY / STOCK / LOGISTIC. Each `KpiBox`: fill `#F7F4EE`, NO
    border, `rounded-[8px] px-3 py-2`; Lucide icon 13px + 10px uppercase label;
    value `text-[16px] font-semibold tabular-nums` coloured by status
    (success/warning/danger/neutral ink); sub-facts 11px side by side; chase
    buttons INSIDE the box when red/actionable.
- **Body** = 2 independently-scrolling columns (`340px | 1fr`, overlay
  scrollbars), each ONE SectionCard of stacked Panels:
  - LEFT (view): CUSTOMER / BALANCE / STORAGE / DELIVERY / ACTIVITY & NOTES.
  - RIGHT (work): ITEMS ORDERED / WAREHOUSE STOCK / LOAN.
- **Balance card**: Outstanding leads, `font-mono text-[18px] font-bold`
  (red `#991B1B` when owing, green "Settled" when clear); Total + Collected as
  small `MoneyRow`s (`grid-cols-[auto_1fr_auto] px-3.5 py-3`, `divide-y`).
- **Items ordered** grid: Item · Qty · Source · Status · Action, inline
  Reserve; header badge = readiness (`No PO / Waiting / Ready`).
- Storage rule: fees start deadline+7d; MS/BF RM150/month, sofa 14d free then
  RM200/2-weeks.

## 10. Hard rules

1. Token classes only — no raw hex in JSX (`scripts/check-design-standard.mjs`
   ratchets this + shell adoption). `pnpm --filter @carres/web lint` before commit.
2. Lucide icons only, **zero emoji**.
3. ONE flame CTA per page; black is the workhorse; destructive = red text on
   white, never red-filled.
4. Section chrome only via `SectionCard`/`SectionBand` — bespoke panel styling
   is banned.
5. Reading conventions: no `·` between status words; LATE = date + red pill;
   never "by" before a partner name; short button labels with full words in
   `title` tooltips.
6. Money: integers only (`RM 12,345`), tabular figures; codes stay mono.
7. Cream shows only as page bg + section bands; cards are white — hierarchy
   from borders + subtle shadow, not stacked cream.

## 11. Measured inconsistencies (drawer, as of this snapshot)

Raw material for the next consistency pass — counts from
`OrderDetailDrawer.tsx` (3,653 lines):

- **Icon sizes are a zoo**: `size={14}` ×13, `13` ×4, `12` ×4, `10` ×2, plus
  one each of 16/15/11 and an 18px Flag. (Target discussed: 3 tiers — tile 16
  / chevron·inline 14 / top-action 17 — kill all 12/13px.)
- **Text sizes**: 12px ×26, 11px ×25, **10px ×19**, 13px ×7, 11.5 ×3, 9px ×1 —
  body copy drifts across 10/11/12/13px instead of settling on 13px.
- **Money sizes**: 4 tiers live today — 22px (header IDs, mono) · 18px
  (Balance Outstanding, mono) · 16px (KPI values, Inter tabular) · 11–12px
  (row amounts). Undecided: keep a 20px-hero + 13px two-tier scale vs one
  uniform size.
- **KPI boxes** sit as 3 grid cells inside the header card (fill `#F7F4EE`,
  no border) — candidate change: 3 separate white cards.
- **Row heights** in drawer panels are content-driven (only one fixed
  `h-[18px]`); the list table locks 40px — candidate: lock panel rows to 36px.
- `#F7F4EE` KPI fill is inline (not a token) — should join `.section-band*`
  in `index.css` if kept.
