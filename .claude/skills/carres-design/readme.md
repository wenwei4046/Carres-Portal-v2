> # ⛔ SUPERSEDED — 2026-07-27
>
> **This is the RETIRED v4 law. It contradicts the current one.**
> **Read [`docs/UI-KIT.md`](../../../docs/UI-KIT.md) instead — take nothing from here.**
>
> Contradicts on: row height · text sizes · canvas colour · type class names ·
> where the flame may appear · icon stroke. See `SKILL.md` for the table.
> Kept only as an asset store (logo, old screenshots) until card D0.3.

---

# Carres ERP — UI-KIT v4 Design System (RETIRED)

The single visual rulebook for **Carres Portal**, the internal ERP that runs a
Malaysian mattress & furniture business (~1,000 orders/month). Hand this system
to Claude Code so every screen it builds looks the same, reads cleanly, and
**stops "freely designing".**

> **The one problem this fixes:** before v4, pages drifted — fonts unaligned,
> sizes random, content text too pale to read, statuses indistinguishable. v4
> resets everything to a calibrated, professional, Inter-based system: **white
> content base, dark readable text, one restrained type scale, colour used only
> as a functional signal.**

**Sources (ground truth):** `github.com/wenwei4046/Carres-Portal-v2` (private) —
`docs/CARRES_UI_KIT_V4.md` (the law), `apps/web/src/index.css` + `apps/web/src/lib/design-standard.ts`
(the machine-readable tokens), `docs/LIST-TEMPLATE-SPEC.md`, `LISTING_ROW_SPEC.md`.
All token values here are copied verbatim from that repo.

---

## THE 4 RULES (memorise these)

1. **White content, brand in the nav.** The content area is white on a very-light
   grey canvas (`#F3F4F6`). The flame brand colour lives in the left nav and on
   the ONE primary action per block — nowhere else.
2. **Colour is a signal, not decoration.** Default is black/grey/white. Colour
   appears ONLY for **action · selection · status · alert**. Flame = action.
   Blue = selection. Green/amber/red = status. Never colour a title, icon,
   border, divider or hover.
3. **Layer by weight, not size.** Almost everything is 14–15px. Only the page
   title (24) and a hero number (20) go bigger. Tell things apart by **weight +
   colour**, never by making fonts random sizes.
4. **Content is dark; only labels are muted.** Anything you READ (REF, customer,
   date, amount, address) is near-black `#1A1A1A`. Light grey `#A8A8A8` is for
   labels/meta ONLY. Never pale content text.

---

## CONTENT FUNDAMENTALS (how copy is written)

- **English UI**, sentence case everywhere ("Record payment", "Chase logistic")
  — never Title Case buttons, never ALL CAPS except tiny table headers/labels.
- **Human dates:** `9 Jul 26` (day, short month, 2-digit year), weekday appended
  muted (`Sat`). Overdue shows a red `over` badge, not the word "late".
- **No `·` dot as a status separator.** Never write "by" before a partner (write
  "NETS", not "by NETS").
- **Verbs for actions:** the NEXT column is a single imperative — `Order PO`,
  `Chase supplier`, `Book logistic`, `Chase logistic`, `Confirm`.
- **Money:** `RM 1,749` (space after RM, thousands comma, tabular figures).
- **Tone:** terse, operational, scannable. No marketing voice, no emoji.

---

## VISUAL FOUNDATIONS

- **Colour** — see `tokens/colors.css`. 5 neutrals + flame brand + 3 semantic
  status tones + selection blue. Warm-neutral canvas, near-black ink.
- **Type** — Inter (400/500/600/700) for everything; JetBrains Mono for
  numbers/codes/money/phone with a **slashed zero** so `0` never reads as `o`.
  Scale in `tokens/typography.css`.
- **Backgrounds** — flat. White panels on the grey canvas. No gradients, no
  imagery, no textures. Hierarchy comes from the 1px hairline (`#E5E7EB`) + a
  whisper double drop-shadow, never from heavy borders or big shadows.
- **Cards** — white fill, 1px hairline, **12px radius**, `--shadow-card` (barely
  there). See the `.card` class.
- **Corner radii** — card 12 · button 6 · chip/cell 4 · pill fully round.
- **Status** — ALWAYS a pill: soft tint + dark same-hue text (`.pill-ready` /
  `.pill-waiting` / `.pill-overdue` / `.pill-neutral`). Never bare coloured text.
- **Buttons** — exactly ONE flame `.btn-hero` per page/block; every other primary
  is black `.btn-primary`; `.btn-secondary` outline; `.btn-danger` = red text on
  white (never red-filled).
- **Selection** — blue only. Checkbox turns blue-filled; the whole row gets a
  soft blue wash `#E6F1FB`.
- **Checkbox** — 17px, clearly visible; flame fill + white tick when checked.
- **Density** — list rows are **44px FIXED**. Content adapts to the row (truncate
  / "+N"); the row never grows. Target 18–20 rows on screen. This is the rule
  that stops "rows keep growing and the page scrolls forever."
- **Motion** — minimal. 0.15s colour transitions on hover; a gentle page-enter
  fade. No bounces.
- **Hover** — buttons darken; rows get `--base-50`; nav items get `--base-100`.

---

## ICONOGRAPHY

- **Lucide** (`lucide-react` in the app; `unpkg.com/lucide` CDN in these kits),
  one consistent size (**17–18px**), stroke width 2, coloured `--base-400/500`.
- **Zero emoji.** No unicode-glyph icons. Actions in table rows are icons, not
  text links.
- Brand mark: **flame heart** — `assets/carres-logo.png` (the only logo; render
  the word "Carres" in Inter 700 beside it or alone where no mark fits).

---

## INDEX (what's in here)

- `styles.css` — link THIS one file; it imports everything below.
- `tokens/` — `colors.css` · `typography.css` · `layout.css` · `fonts.css`.
- `components.css` — framework-free classes (`.btn-*`, `.pill-*`, `.card`,
  `.input`, `.checkbox`, `.t4-*`) mirroring the live repo.
- `components/core/` — React primitives: **Button, StatusPill, SectionCard,
  TextInput, Checkbox**.
- `components/data/` — **ListRow** (the 44px order row).
- `ui_kits/orders-list/` — the canonical Orders list page recreation.
- `ui_kits/order-detail/` — the order record (KPI cards + 32/68 split).
- `guidelines/` — visual specimen cards (Design System tab).
- `SKILL.md` — drop this whole folder into Claude Code as a skill.

## HOW TO USE WITH CLAUDE CODE

1. Download this folder (Share → set File type to **Design System**, then export).
2. Put it in your project's `.claude/skills/` (or point Claude Code at it).
3. Tell Claude Code: *"Follow the carres-design skill. Read README.md and
   SKILL.md first. Use only these tokens and components; do not invent colours,
   font sizes, or new components."*
4. It will link `styles.css`, use the `.t4-*` / `.btn-*` / `.pill-*` classes, and
   copy the component patterns — so every screen matches.
