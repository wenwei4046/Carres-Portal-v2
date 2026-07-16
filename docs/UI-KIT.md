# CARRES UI-KIT — the single source of truth

> **THE contract. Read this before changing ANY page or component in
> `apps/web`. Do not deviate.**
>
> - This is the ONLY design document in the repo. `docs/DESIGN-STANDARD.md`,
>   `docs/LIST-TEMPLATE-SPEC.md`, and the `CARRES_*_UI_KIT_CURRENT.md`
>   snapshots were merged into this file and deleted (2026-07-16). If another
>   doc or an old chat disagrees with this file, **this file wins**.
> - Machine-readable values live in
>   [`apps/web/src/lib/design-standard.ts`](../apps/web/src/lib/design-standard.ts)
>   (`COLOR` / `CHIP` / `LAYOUT` / `RADIUS` / `SPACE` / `TYPE` / `FONT`) —
>   a *record* of this kit, never a place to drive a change from.
> - **Enforced by `scripts/check-design-standard.mjs`** (wired as
>   `pnpm --filter @carres/web lint`, runs locally + CI). Rules A–G in §E
>   below FAIL the build on violation.
> - **Change control**: to change the look, edit `index.css` (tokens) or the
>   owning shell (layout), then update this doc + `design-standard.ts` in the
>   same commit. A page conforms to the kit; the kit does not bend to a page.
>
> Two systems live in this repo, deliberately separate:
> **Part A — Portal (v17)**: all ops/backoffice pages.
> **Part B — POS (`.pos-proto`)**: the full-screen sales flow only.
> Never mix their tokens.

---

# PART A — PORTAL (v17)

## A1. Brand & colour (v17, locked 2026-06-09)

All colours live ONCE as HSL tokens in `index.css :root` and reach components
only via Tailwind classes. Raw hex in JSX is banned (lint RULE A).

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
| KPI box fill (drawer header metric cards) | `#F7F4EE` | `.kpi-box` |

Neutral ramp = Tailwind cool gray as `base-50…base-900`. Focus ring = flame.

Semantic status (Tailwind 600 ink / 100 soft fill):
success `#16A34A`/`#DCFCE7` · warning `#D97706`/`#FEF3C7` · danger/red
`#DC2626`/`#FEE2E2` · info `#2563EB`/`#DBEAFE`.

## A2. Fonts

| Use | Family | Class |
|---|---|---|
| Everything (body + display) | **Inter** | `font-sans` |
| Codes: SKU, SO/ref numbers, dimensions | **JetBrains Mono** | `font-mono` |
| Money / qty / margin readouts | Inter + lining + tabular figures | `.t-num` |

## A3. Type scale — LOCKED sizes

Headings/labels use the `.t-*` utilities (size/weight/tracking only; colour
stays on the element):

| Class | px | weight | Notes |
|---|---|---|---|
| `.t-h1` | 32 | 700 | tracking −0.02em |
| `.t-h2` | 24 | 700 | page titles |
| `.t-h3` | 18 | 600 | |
| `.t-h4` | 15 | 600 | |
| `.t-body` | 14 | 400 | list-page body |
| `.t-small` | 13 | 400 | button text / drawer body |
| `.t-tiny` | 12 | 400 | list-page metadata |
| `.t-micro` | 11 | 500 | uppercase micro-label |
| `.kicker` | 11 | 600 | uppercase 0.22em, flame overline |
| `.label` | 11 | 600 | uppercase 0.1em, form/KV labels |

**Kit-governed detail surfaces (order drawer + its components) allow exactly
two inline body sizes: `text-[13px]` (body) and `text-[11px]` (labels /
sub-facts / badges), plus the two money sizes below. Everything else uses a
`.t-*` class.** 9/10/12/11.5px inline sizes are banned (lint RULE D).

**Money — exactly two tiers (lint RULE D):**

| Tier | Spec | Use |
|---|---|---|
| Hero | `text-[22px]` bold, mono for IDs / `.t-num` for RM | header #SO + ref, Balance Outstanding |
| Standard | `text-[16px]` semibold tabular | KPI values, secondary money readouts |

Row-level amounts inside 36px rows use body 13px `.t-num`.

## A4. Icons — exactly three sizes (lint RULE C)

Lucide only, zero emoji. On kit-governed surfaces every icon is one of:

| Size | Use |
|---|---|
| **14** | inline glyphs: band chevrons, KPI track icons, per-row affordances |
| **16** | panel/menu actions: ⋮ menus, back chevron, close |
| **17** | top-bar actions: Bell / Help / Settings / Flag |

## A5. Buttons (sentence case, 13px semibold, 6px radius)

| Class | Look | Use |
|---|---|---|
| `.btn-hero` | flame fill, white text | THE one create/commit CTA per page |
| `.btn-primary` | **black** fill (`base-900`), white text | every other primary action |
| `.btn-secondary` | white, 1px `base-300` border | secondary |
| `.btn-ghost` | transparent, base-700 text | tertiary / toolbar |
| `.btn-danger` | white bg, **red text + red border**, never red-filled | destructive |

All: `px-[18px] py-2.5 rounded-md text-[13px] font-semibold`, `disabled:opacity-40`.
Drawer chase pair: `[Reminder]` = flame outline · `[Chase]` = solid flame,
both `text-[11px] font-semibold px-2.5 py-1 rounded-md`.

## A6. Status pills

`.pill` = `text-[11.5px] font-semibold px-2.5 py-0.5 rounded-full border
border-transparent` (transparent border keeps bordered/borderless the same box).

| Class | Fill / border / ink | Meaning |
|---|---|---|
| `.pill-warning` | `#FBE8C6` / `#F0D08A` / `#92400E` | waiting / low / on-hold (amber) |
| `.pill-confirmed` | `#D6EFD9` / `#A9D8B0` / `#166534` | ready / confirmed / delivered (green) |
| `.pill-overdue` | `#FCE4E4` / `#F3B4B4` / `#991B1B` | overdue / no-PO / chase (red) |
| `.pill-sent` | `#D3E4FB` / `#A9C8F2` / `#1E40AF` | scheduled / booked (blue) |
| `.pill-neutral` | `base-100` / — / `base-700` | done / neutral (grey) |

Order-STATE pills in the drawer header are amber/blue/green/grey only — never
danger red (red = actionable alarms).

## A7. Geometry — never re-type these numbers (import `LAYOUT`)

| | px |
|---|---|
| Radius: SectionCard / `--radius` / buttons / grid cells / pills | 12 · 8 · 6 · 4 · full |
| Sidebar expanded / collapsed | 232 / 60 (flame 3px active bar) |
| Right rail panel / icon strip | 320 / 52 |
| Page header | 56 (h-14) |
| **List table rows** | **40** (`[&_td]:h-[40px]`), `table-fixed` + % colgroup, never horizontal-scrolls |
| **Drawer panel rows** | **36** (`h-9`) — every KV / money / item row inside a drawer panel (lint RULE F) |
| Facet panel width | 240 |
| Drawer body columns | `340px minmax(0,1fr)` — left view · right work |
| Card padding / page gutter / default gap | 16 (p-4) · 24 (p-6) · 8 (gap-2) |

## A8. Shared section chrome — `SectionCard` + `SectionBand` (THE rule)

One component pair (`components/SectionPanel.tsx`) renders **both** the Orders
list facet groups AND every order-drawer panel — list and detail are 1:1 by
construction. **Hand-rolling this chrome fails lint RULE G.**

- `SectionCard` = white, 1px `base-200`, `rounded-[12px]`, `p-1.5` inset,
  floats on the cream page.
- `SectionBand` = cream `#F1EFE8` bar: chevron 14 + **11px bold uppercase**
  title (ink `#221F20`, danger `#991B1B`) + tabular count `#6F6960` + free
  `right` slot.
- Drawer `Panel` = SectionBand + body stacked inside the column's ONE
  SectionCard; collapsible, persisted per title
  (`ops-drawer-panel-v3:<title>`). Defaults: Balance/Delivery/Items/Warehouse
  open; Customer/Storage/Loan collapsed.
- `.kpi-box` = the drawer-header metric card: `#F7F4EE` fill, NO border,
  `rounded-[8px] px-3 py-2` (token in `index.css`; inline `#F7F4EE` fails
  lint RULE E).

## A9. List page template (canonical = Orders list, locked 2026-07-13)

Frame = `ListPageShell` slots. Gmail scroll model: header band, toolbar, chips
row, table column-header all FIXED; only the facet body and table rows scroll.

1. **Header** — ONE full-width WHITE band (`bg-white border-b border-base-200`):
   breadcrumb 12px `base-400` › `t-h2` title + `Synced <date>` ↻ stamp;
   right: rounded-full 230px search → `Bell` (live alerts, red count badge) →
   `HelpCircle` → `Settings`, all Lucide **17px**.
2. **Toolbar** — one white panel: status pills left (active = solid ink fill);
   right in order: `N of M` · short action buttons (`+ Master` style, full
   words in `title`) · ⋮ overflow (Show-columns, persisted).
3. **Bulk bar** — ticking rows REPLACES the toolbar in place with a flame band
   (`bg-signature-50 border-signature-100`); nothing else moves.
4. **Facet** — one white 240px panel, cream `SectionBand` groups
   (SUMMARY → CHASE NOW (danger) → STOCK → LOGISTIC → REGION → CATEGORY);
   rows = Gmail-nav pills; « on SUMMARY collapses the whole panel.
5. **Table** — 40px rows, sticky head, infinite scroll ×30, single-verb NEXT
   column (`Order PO → Chase supplier → Book logistic → Chase logistic →
   Confirm`, Confirm 🔒 on a money-hold), sort = slack ascending.
6. **Footer** — `N orders · Reset filters`.

List pages are **list-first**: no KPI cards above the table; summary lives in
the facet SUMMARY block. Three archetypes exist — List (`ListPageShell`),
Dashboard (bare hero, one per role), Detail (drawer/modal, §A10). Pick one;
don't hand-roll chrome.

## A10. Order-detail drawer (the Detail archetype reference)

Full-screen takeover on the cream page (‹ Orders back, no ✕):

- **Header panel** = ONE SectionCard, fixed:
  - Row 1: ‹ back (chevron 16) · `#SO` + ref `font-mono text-[22px] font-bold`
    adjacent · order-state pill · meta 13px `base-500`
    (`customer · region · ordered <date>`) · Flag 17 · ⋮ menu 16.
  - Row 2: **3 `.kpi-box` mission tracks** (`grid grid-cols-3 gap-2`) —
    CUSTOMER·MONEY / STOCK / LOGISTIC: icon 14 + 11px uppercase label; value
    `text-[16px] font-semibold tabular-nums` coloured by status; sub-facts
    11px; chase buttons INSIDE the box when red.
- **Body** = 2 independently-scrolling columns (`340px | 1fr`, overlay
  scrollbars), each ONE SectionCard of stacked Panels:
  LEFT (view): CUSTOMER / BALANCE / STORAGE / DELIVERY / ACTIVITY.
  RIGHT (work): ITEMS ORDERED / WAREHOUSE STOCK / LOAN.
- **All panel rows are 36px** (`h-9`, RULE F): MoneyRows, KV rows, item rows.
- **Balance**: Outstanding leads at money-hero 22px (red `#991B1B` owing /
  green Settled); Total + Collected as 36px rows.
- Storage rule: fees start deadline+7d; MS/BF RM150/month, sofa 14d free then
  RM200/2-weeks.

## A11. Hard rules

1. Token classes only — no raw hex in JSX (lint RULE A ratchet).
2. Lucide icons only, zero emoji; sizes ∈ {14, 16, 17} (RULE C).
3. Inline text sizes ∈ {11, 13} body + {16, 22} money (RULE D); headings via `.t-*`.
4. ONE flame CTA per page; black is the workhorse; destructive = red on white.
5. Section chrome only via `SectionCard`/`SectionBand` (RULE G); KPI fill only
   via `.kpi-box` (RULE E); drawer rows 36px (RULE F).
6. List pages through `ListPageShell` (RULE B).
7. Reading conventions: no `·` between status words; LATE = date + red pill;
   never "by" before a partner; short labels, full words in `title`.
8. Money integers (`RM 12,345`) in `.t-num`; codes in mono.
9. Cream only as page bg + section bands; cards white.

---

# PART B — POS (`.pos-proto`, scoped)

The POS sales flow (`/dealer`, `/principal?tab=pos`) is a SEPARATE system —
Loo's prototype skin (2026-07-04), all scoped under `.pos-proto`
(`apps/web/src/styles/pos-prototype.css`, class names are the contract; do
not rename). Portal tokens never apply here, and vice versa.

- **Palette**: cream `#F5F3F0` bg · paper `#ECE8E2` rails · white panels ·
  ink `#221F20` · **orange `#D64F20`** action accent (≠ portal flame —
  deliberate) · burnt `#BC4319` hover/prices · muted `#6F6960` ·
  lines `rgba(34,31,32,.10/.22)`.
- **Fonts**: Outfit everywhere incl. ALL numerals; Bodoni Moda = CARRES
  wordmark only; Caveat = handwritten accents; mono for SKU/spec.
- **Controls**: pills (radius-999) or radius-10–16 cards; 1.5px borders on
  interactive surfaces; `.btn` 40px pill (primary orange / ghost outline);
  icons 16/18 stroke 1.75; active nav/step/timeslot = ink fill; selected
  cards = orange border (+ 3px 18% ring on pay-cards).
- **Signature moves**: product card radius-16 + 4:3 photo + cream category
  badge + 36px orange add-FAB, no price on cards; cart FAB ink pill w/ burnt
  tile; summary prices Outfit w900 condensed burnt (36px total); step pills
  01/02/03 ink-filled when active; one easing
  `cubic-bezier(0.22,1,0.36,1)` 120–320ms, hover lift, reduced-motion safe.
- Undefined CSS vars invalidate whole declarations — only use vars already
  defined on `.pos-proto`.

---

# §E. Enforcement — `pnpm --filter @carres/web lint`

`scripts/check-design-standard.mjs` (zero deps, CI + local). Legacy debt is
frozen in `scripts/design-standard-baseline.json` (ratchet); the kit rules
below fail HARD on kit-governed files.

| Rule | Scope | Fails on |
|---|---|---|
| A | all `apps/web/src` (ratchet) | new raw hex literal |
| B | `pages/**` | List page without `ListPageShell` |
| C | kit scope | Lucide `size={N}` with N ∉ {14,16,17} |
| D | kit scope | `text-[Npx]` with N ∉ {11,13,16,22} |
| E | all `apps/web/src` | inline `#F7F4EE` (use `.kpi-box`) |
| F | drawer components | `h-[Npx]` with N ≠ 36 (rows are `h-9`; the list's 40px lives outside this scope) |
| G | all `apps/web/src` except `SectionPanel.tsx` | literal `section-band` class in JSX (render `<SectionBand>`) |

**Kit scope** (grows as pages migrate) =
`pages/operation/components/**` + `components/SectionPanel.tsx`.
POS (`pages/dealer/**`) and print/PDF are exempt from C/D/F (separate
contract / non-Tailwind).

PR checklist: right archetype shell · no new hex · `.t-*`/`.btn-*` classes ·
one `.btn-hero` · icons 14/16/17 · drawer rows 36 · lint green.
