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
| Page canvas (v4 neutral grey — brand lives in the flame, not the bg) | `#F5F5F7` | `bg-background` |
| Card surface | `#FFFFFF` | `bg-white` / `bg-card` |
| Main bg behind cards | `#F9FAFB` | `bg-base-50` |
| Hairline border | `#E5E7EB` | `border-base-200` |
| Body ink | `#111827` | `text-base-900` |
| Muted text | `#6B7280` | `text-base-500` |
| Icons at rest | `#9CA3AF` | `text-base-400` |
| **Brand flame** (ONE hero CTA / page) | `#C44D2B` | `bg-primary` / `text-primary` |
| Flame hover | `#9A3D22` | `hover:bg-signature-700` |
| Flame tint (active fill / bulk bar) | `#F4E4DD` | `bg-signature-50` |
| Grey-soft workhorse button (v4 — black retired) | `#F1F0EC` | `.btn-primary` / `.btn-soft` |
| Ink (active tab fill) | `#111827` | `bg-base-900` |
| Section band (cream title bars) | `#F1EFE8` | `.section-band` |
| Section band ink / danger / total | `#221F20` / `#991B1B` / `#6F6960` | `.section-band-title(-danger)` / `.section-band-total` |
| KPI mission-track card (independent WHITE card) | white + hairline | `.kpi-box` |
| Selection blue (checkbox `.is-select` + row wash) | `#2563EB` / wash `#EAF1FD` | `.checkbox.is-select` |

Neutral ramp = Tailwind cool gray as `base-50…base-900`. Focus ring = flame.

**Colour is a signal, not decoration (v4)**: flame = action · blue = selection
· green/amber/red = status · bare red = alert accent. Everything else is
black/grey/white. Content text is near-black (`text-base-900`); muted grey
(`base-400/500`) is for labels/meta ONLY — never pale content text.

Semantic tokens (for `bg-success` etc.): success `#16A34A` · warning `#D97706`
· danger `#DC2626` · info `#2563EB`. Status is ALWAYS a pill (§A6), never bare
coloured text.

## A2. Fonts

| Use | Family | Class |
|---|---|---|
| Everything (body + display) | **Inter** | `font-sans` |
| Codes: SKU, SO/ref numbers, phone, dimensions | **JetBrains Mono** + slashed zero | `font-mono` |
| Money / qty / margin readouts | Inter + lining + tabular + slashed-zero figures | `.t-num` |

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

**v4 principle: LAYER BY WEIGHT, NOT SIZE.** Almost everything is 14–15px;
only the page title (24, `.t-h2`) and the hero number (20) go bigger. REF and
SO ids are the SAME size — tell them apart by weight + colour.

Kit-governed surfaces allow exactly these inline sizes (lint RULE D):

| Inline size | Use |
|---|---|
| `text-[15px]` medium | content you READ — customer, dates, amounts (near-black) |
| `text-[14px]` | secondary info / drawer body |
| `text-[13px]` | buttons (via `.btn-*`) / row REF (bold) |
| `text-[12px]` | labels, table headers (uppercase, muted), sub-facts |
| `text-[20px]` bold | THE hero number — header #SO + ref (mono), Outstanding, KPI values |

Everything else uses a `.t-*` class. 9/10/11/16/18/22px inline are banned.

## A4. Icons — exactly three sizes (lint RULE C)

Lucide only, stroke 2, zero emoji, no hand-drawn SVG, no brand logos (chase =
`message-circle`, never the WhatsApp mark). Same meaning ⇒ same glyph on every
page. On kit-governed surfaces every icon is one of:

| Size | Use |
|---|---|
| **14** | inside pills / row-inline glyphs / band chevrons |
| **16** | default UI: KPI track icons, ⋮ menus, back, close, buttons |
| **18** | top-bar / page-level actions: Bell / Help / Settings / Flag |

## A5. Buttons (sentence case, 13px semibold, 8px radius — v4: NO solid black)

| Class | Look | Use |
|---|---|---|
| `.btn-hero` | flame fill, white text | THE one flame per page/block — the single most urgent action |
| `.btn-primary` / `.btn-soft` | **grey base** `#F1F0EC`, ink text | the normal workhorse action (soft, not heavy — black is retired) |
| `.btn-secondary` | white box, 1px `base-300` border | light / tertiary |
| `.icon-btn` | 34px white box, hairline | icon-only actions: ⋮, expand, bell |
| `.btn-ghost` | transparent, base-700 text | inline tertiary |
| `.btn-danger` | white bg, **red text + red border**, never red-filled | destructive |

Never a rainbow of solid colour buttons — colour is a signal (§A1).
All: `px-[18px] py-2.5 rounded-lg text-[13px] font-semibold`, `disabled:opacity-40`.
Drawer chase pair: `[Reminder]` = flame outline · `[Chase]` = solid flame,
both `text-[11px] font-semibold px-2.5 py-1 rounded-md`.

## A6. Status pills — icon + word (v4)

Status is ALWAYS a pill: soft tint + dark same-hue ink + a 14px Lucide glyph
(`check` ready · `clock` waiting · `alert-circle` overdue · `pause-circle` on
hold). Never bare coloured text. `.pill` = inline-flex, 11.5px semibold,
rounded-full, transparent border for box parity.

| Class | Fill / border / ink | Meaning |
|---|---|---|
| `.pill-warning` | `#FAEEDA` / `#F0D08A` / `#854F0B` | waiting / low / on-hold (amber) |
| `.pill-confirmed` | `#EAF3DE` / `#A9D8B0` / `#3B6D11` | ready / confirmed / delivered (green) |
| `.pill-overdue` | `#FCEBEB` / `#F3B4B4` / `#A32D2D` | overdue / no-PO / chase (red) |
| `.pill-sent` | `#D3E4FB` / `#A9C8F2` / `#1E40AF` | scheduled / booked — the ONE status blue (blue otherwise = selection) |
| `.pill-neutral` | `base-100` / — / `base-700` | done / neutral (grey) |

Order-STATE pills in the drawer header are amber/blue/green/grey only — never
danger red (red = actionable alarms).

## A7. Geometry — never re-type these numbers (import `LAYOUT`)

| | px |
|---|---|
| Radius: SectionCard+cards / `--radius` / buttons / grid cells / pills | 12 · 8 · 8 (`rounded-lg`) · 4 · full |
| Sidebar expanded / collapsed | 232 / 60 (flame 3px active bar) |
| Right rail panel / icon strip | 320 / 52 |
| Page header | 56 (h-14) |
| **ALL rows — list + drawer** | **44 FIXED** (`h-11` / `[&_td]:h-[44px]`) — content truncates (`+N`), the row NEVER grows; target 18–20 rows per screen (lint RULE F) |
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
- `.kpi-box` = ONE mission track as an INDEPENDENT WHITE card on the canvas:
  `bg-white border-base-200 rounded-[12px] px-4 py-3`. Number stays INK;
  colour only as the alert signal. (The old `#F7F4EE` tint is retired — that
  hex inline fails lint RULE E.)
- `.checkbox` = 17px, flame fill + white tick; `.is-select` variant = BLUE
  (blue means selection, only for row multi-select).

## A9. List page template (canonical = Orders list, locked 2026-07-13)

Frame = `ListPageShell` slots. Gmail scroll model: header band, toolbar, chips
row, table column-header all FIXED; only the facet body and table rows scroll.

1. **Header** — ONE full-width WHITE band (`bg-white border-b border-base-200`):
   breadcrumb 12px `base-400` › `t-h2` title + `Synced <date>` ↻ stamp;
   right: rounded-full 230px search → `Bell` (live alerts, red count badge) →
   `HelpCircle` → `Settings`, all Lucide **18px**.
2. **Toolbar** — one white panel: status pills left (active = solid ink fill);
   right in order: `N of M` · short action buttons (`+ Master` style, full
   words in `title`) · ⋮ overflow (Show-columns, persisted).
3. **Bulk bar** — ticking rows REPLACES the toolbar in place with a flame band
   (`bg-signature-50 border-signature-100`); nothing else moves.
4. **Facet** — one white 240px panel, cream `SectionBand` groups
   (SUMMARY → CHASE NOW (danger) → STOCK → LOGISTIC → REGION → CATEGORY);
   rows = Gmail-nav pills; « on SUMMARY collapses the whole panel.
5. **Table** — 44px FIXED rows, sticky head, infinite scroll ×30, single-verb NEXT
   column (`Order PO → Chase supplier → Book logistic → Chase logistic →
   Confirm`, Confirm 🔒 on a money-hold), sort = slack ascending.
6. **Footer** — `N orders · Reset filters`.

List pages are **list-first**: no KPI cards above the table; summary lives in
the facet SUMMARY block. Three archetypes exist — List (`ListPageShell`),
Dashboard (bare hero, one per role), Detail (drawer/modal, §A10). Pick one;
don't hand-roll chrome.

## A10. Order-detail drawer (the Detail archetype reference)

Full-screen takeover on the cream page (‹ Orders back, no ✕):

- **Header** (fixed):
  - Row 1 in ONE SectionCard: ‹ back (chevron 16) · `#SO` + ref `font-mono
    text-[20px] font-bold` adjacent (same size — weight/colour differentiate)
    · order-state pill (icon+word) · meta 14px `base-500`
    (`customer · region · ordered <date>`) · Flag 18 · ⋮ menu 16.
  - Below it: **3 `.kpi-box` INDEPENDENT WHITE CARDS** (`grid grid-cols-3
    gap-2.5`) — CUSTOMER·MONEY / STOCK / LOGISTIC: icon 16 + 12px uppercase
    label; value `text-[20px] font-bold .t-num` INK (colour only as the alert
    mark); sub-facts 12px; chase buttons INSIDE the card when red.
- **Body** = 2 independently-scrolling columns (`340px | 1fr`, overlay
  scrollbars), each ONE SectionCard of stacked Panels:
  LEFT (view): CUSTOMER / BALANCE / STORAGE / DELIVERY / ACTIVITY.
  RIGHT (work): ITEMS ORDERED / WAREHOUSE STOCK / LOAN.
- **All rows are 44px FIXED** (`h-11`, RULE F): MoneyRows, KV rows, item rows.
- **Balance**: Outstanding leads at hero 20px (red `#991B1B` owing /
  green Settled); Total + Collected as 44px rows.
- Storage rule: fees start deadline+7d; MS/BF RM150/month, sofa 14d free then
  RM200/2-weeks.

## A11. Hard rules

1. Token classes only — no raw hex in JSX (lint RULE A ratchet).
2. Lucide icons only, stroke 2, zero emoji; sizes ∈ {14, 16, 18} (RULE C).
3. Inline text sizes ∈ {12, 13, 14, 15} + 20 hero (RULE D); headings via `.t-*`;
   content near-black, muted grey for labels only.
4. ONE flame CTA per page; the workhorse is GREY-SOFT (`.btn-primary`), never
   solid black; destructive = red on white; no solid-colour button rainbow.
5. Section chrome only via `SectionCard`/`SectionBand` (RULE G); KPI = white
   `.kpi-box` cards (RULE E bans the old tint); ALL rows 44px FIXED (RULE F).
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
| C | kit scope | Lucide `size={N}` with N ∉ {14,16,18} |
| D | kit scope | `text-[Npx]` with N ∉ {12,13,14,15,20} |
| E | all `apps/web/src` | inline `#F7F4EE` (the retired KPI tint) |
| F | kit scope | `h-[Npx]` with N ≠ 44 (rows are 44 FIXED, `h-11`) |
| G | all `apps/web/src` except `SectionPanel.tsx` | literal `section-band` class in JSX (render `<SectionBand>`) |

**Kit scope** = the `KIT_FILES` list in the script (today: `SectionPanel.tsx`,
`OrderDetailDrawer.tsx`, `StockPickerGrid.tsx`, `RouteJourneyBar.tsx`,
`OrderControlPanel.tsx`). **Add each file to `KIT_FILES` as you migrate it;
never remove one.** POS (`pages/dealer/**`) and print/PDF are exempt from
C/D/F (separate contract / non-Tailwind). Legacy operation modals join the
scope as they're touched.

PR checklist: right archetype shell · no new hex · `.t-*`/`.btn-*` classes ·
one `.btn-hero`, grey workhorse, no black/rainbow · icons 14/16/18 stroke 2 ·
rows 44 FIXED · status = icon+word pill · content near-black · lint green.

---

**v4 adoption (2026-07-17, Jess).** This kit absorbed the "Carres ERP 系统 UI
Kit" Claude-Design export (the v4 design law). Its internal contradictions were
resolved as: canvas `#F5F5F7` · icon stroke 2 · workhorse = grey soft (no
black) · `--radius-panel` 18 (unused until a panel needs it). The export lives
on as the local skill `.claude/skills/carres-design/` (tokens corrected to
match this file); UI-KIT.md remains the law when they disagree.
