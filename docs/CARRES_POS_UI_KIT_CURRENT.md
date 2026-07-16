# CARRES POS — UI KIT (current-state snapshot)

> Snapshot **2026-07-16**, branch `feat/orders-drawer` @ `3e78187`. Read back
> from the live code — chiefly `apps/web/src/styles/pos-prototype.css`
> (4,102 lines, the design contract) plus the POS components under
> `apps/web/src/pages/dealer/pos/`.
>
> **Scope**: this is the **POS** (point-of-sale) skin only — the full-screen
> sales flow at `/dealer` and `/principal?tab=pos` (catalog → cart → customer
> handover → confirm & pay → confirmation). It is a **separate design system**
> from the ops/backoffice portal (that one is "v17" — cool gray + Inter +
> flame `#C44D2B`). Everything below is scoped under the `.pos-proto` root
> class so the two systems never bleed into each other.
>
> Origin: Loo's Claude Design project "Carres POS 系统设计" (2026-07-04).
> The CSS class names ARE the contract — mirrored from the prototype;
> renaming or "improving" them is banned.

---

## 1. Palette (CSS vars on `.pos-proto`)

| Token | Hex | Use |
|---|---|---|
| `--c-cream` | `#F5F3F0` | page background (`--pos-bg`) |
| `--c-paper` | `#ECE8E2` | rail / sidebar / soft tiles (`--pos-rail`, `--surface-2`) |
| `--c-beige` | `#DDD7CF` | photo placeholder tiles |
| `--pos-panel` | `#FFFFFF` | cards, cart, toolbar, drawers |
| `--c-ink` | `#221F20` | text, active nav fill, FAB body, toast |
| `--c-orange` | `#D64F20` | THE accent: primary buttons, add-FABs, selected states, badges |
| `--c-burnt` | `#BC4319` | hover/deep accent, wordmark, prices, kickers |
| `--fg-muted` | `#6F6960` | secondary text |
| `--fg-soft` | `#9B9389` | faintest text |
| `--line` | `rgba(34,31,32,0.10)` | 1px hairlines, 1.5px control borders |
| `--line-strong` | `rgba(34,31,32,0.22)` | emphasised borders, dashed zones |
| `--c-burnt-soft` | `rgba(188,67,25,0.10)` | soft accent fill |
| `--c-festive-b` | `#B4321A` | warn badge red |
| `--c-secondary-a` | `#7A5C3E` | brown secondary (mod chips, script notes) |
| success green | `#2F8F4F` (done steps) / `#2F5D4F` (ok toast) | |
| shadows | `--shadow-1` 0 1px 2px 6% · `--shadow-3` 0 12px 32px 14% | card / float |

Note the POS orange `#D64F20` ≠ the portal flame `#C44D2B` — deliberate; do
not unify.

## 2. Fonts

| Role | Family |
|---|---|
| Everything — body, titles, buttons, **and ALL numerals** | **Outfit** (`--font-sans/-title/-button/-num`; numerals rule locked by Loo 2026-07-11) |
| `CARRES` wordmark ONLY | **Bodoni Moda** (`--font-mark`) — 23px, w700, 0.07em, uppercase, burnt |
| Handwritten accents (signature hint, remark notes, hero flourish) | **Caveat** (`--font-script`) |
| SKU / spec / order-id lines | JetBrains Mono (`--font-mono`), 10–11px, letter-spacing 0.02–0.06em |

Voice: big friendly Outfit headings (w700–900, tight −0.01em), tiny LOUD
uppercase kickers (9–11px, w600–700, letter-spacing 0.12–0.18em), mono spec
lines, script for the human touches. Prices = Outfit w900, tight tracking,
burnt, with a tiny 9–14px `RM` superscript.

## 3. Shell & top bar

- Root grid: `56px` top bar + content. Page bg cream.
- **Top bar** (white, 1px line bottom): grid `auto 1fr auto`, padding 0 20px.
  - Left: Bodoni wordmark + crumb `POS · NEW SALE` (11px, w600, 0.14em,
    uppercase, muted, 1px left border).
  - Center: step pills `01 Cart / 02 Customer / 03 Confirmed` — 12px w600
    0.18em uppercase muted; **active = ink fill, cream text**, radius-full,
    padding 4px 10px.
  - Right: `topbar-pill` outline pills (12px w600, 1.5px `--line` border,
    radius-full, padding 7px 12px, hover → burnt border+text; 13px icons;
    count badge = orange circle 18px / 10px w700) + staff chip (paper pill,
    28px burnt round avatar with 11px initials, name 13px w600, role 11px
    muted).
- Page transition: `.page-shell` enter 320ms `cubic-bezier(0.22,1,0.36,1)`
  fade+10px rise. NO `will-change`, NO `both` fill (frozen-renderer
  stale-layer bug, learned 2026-07-12).

## 4. Buttons & icons

- `.btn`: pill (radius-999), **40px** tall, padding 0 18px, Outfit 13px w600,
  1.5px transparent border; hover lifts −1px + shadow; active scale 0.98;
  disabled 40%.
  - `.btn--primary` = orange fill, cream text; hover burnt + orange glow.
  - `.btn--ghost` = transparent, `--line-strong` border.
  - `.btn--sm` 32px / 12px · `.btn--lg` 52px / 15px.
- `.icon-btn`: 36px circle, hover 6% ink wash, active scale 0.92.
- Icons: Lucide only. 16px inside `.btn` / nav items / search; 18px in
  icon-btns, card add-FABs, cart FAB; stroke-width 1.75 (2 on add-FABs).

## 5. Catalog screen

Grid `220px | 1fr`.

- **Sidebar** (`cat-side`): paper bg, 1px right line, padding 20/14.
  - Heading: 10px w700 0.18em uppercase muted (`CATEGORIES` / `TO BE
    CONFIRMED` / `QUICK` / `MAINTAIN`).
  - Item: 38px tall, radius-10, 13px w600, 16px icon; hover 5% ink;
    **active = ink fill + cream text**; count right-aligned 11px at 55%.
  - Disabled "SOON" rows at 55% + pill: 9px w700 0.14em uppercase burnt on
    14% orange tint.
- **Toolbar** (white band, 16/24 padding, 1px bottom line): search = 40px
  pill, paper bg, 1.5px transparent border → focus orange border + white bg,
  14px input, 16px icon; series `select` same geometry, 13px w600; count
  12px muted.
- **Grid**: `repeat(auto-fill, minmax(240px,1fr))` gap 20, 24px gutter.

### Product card (`.prod-card`)

- White, **radius-16**, 1.5px transparent border, soft double shadow; hover
  lift −2px + `0 12px 24px 10%`; **in-cart = orange border**; locked
  (sofa-mutex) = 45% opacity.
- Photo: 4:3 cover on `#d8d2c4`; **category badge** top-left = warm-cream
  `rgba(255,249,235,.92)` pill, 10px w700 0.14em uppercase burnt; **add
  FAB** bottom-right = 36px orange circle, cream icon 18px (sliders =
  configurable / plus = flat / check = in cart), 280ms pulse on add.
- Body (14/16 padding, gap 4): options line 10px w700 0.14em uppercase burnt
  (`4 SIZES`) → name Outfit w700 16px → detail 12px muted → SKU mono 10px.
- **No price on cards** (Loo 2026-07-10) — prices appear only in the
  configurator. (The price style, where used: Outfit w900 22px −0.02em burnt,
  9px `RM` sup.)

## 6. Cart (side sheet + FAB popup)

- **Cart FAB**: fixed 24/24, ink pill radius-18, min-width 200px; 38px
  radius-12 icon tile (burnt at rest, **orange when has items**); label
  `CUSTOMER ORDER` 10px 0.12em uppercase at 65%; amount Outfit 18px w700;
  count badge = orange 22px circle with 2px cream ring, −6px offset.
- **Popup cart** (`.cart--pop`): bottom-right sheet
  `clamp(400px,42vw,580px)` × `clamp(520px,78vh,820px)`, radius-20,
  `0 30px 80px 30%` shadow, 32% ink backdrop.
- Line item (2990s CustomerOrderSheet metrics): grid `64px 1fr auto`,
  14px row padding, 1px dividers; 64px radius-12 photo; name 15px w700;
  detail 12px muted; qty stepper = paper pill with 26px round buttons;
  price Outfit 20px w900 burnt.
- Footer: 13px muted rows; total row 14px w700 over a hairline; **total
  figure 26px w900 burnt**; CTA row wraps, primary spans full width last.

## 7. Handover (02 Customer) & Confirm-and-pay (03)

Grid `1.4fr | 1fr` — form left on cream, summary rail right on white.

- Title 32px w900; sub 14px muted.
- **Step-pill row**: flex pills radius-12 on paper; active = white +
  1.5px orange border, 24px num circle orange; done = green-tint bg,
  num `#2F8F4F`; label 12px w600.
- **Fields**: label 11px w600 0.06em uppercase muted; inputs white, 1.5px
  `--line` border, **radius-12, padding 14px, 14px text**, focus → orange
  border. 2-col `form-grid`, gap 16/18.
- Existing-customer autocomplete: white radius-12 dropdown, 1.5px line,
  hover 8% orange tint rows.
- **Date picker**: 7-col grid, radius-14 card; day = square radius-10 13px,
  today = burnt bold, **selected = orange fill cream text**; 8px dot legend.
- **Time slots**: outline pills, selected = **ink** fill.
- **Pay cards**: 2-col; radius-14, 1.5px line, selected = orange border +
  3px 18%-orange ring; 40px paper icon tile with burnt 20px icon; label 14px
  w600, hint 11px muted.
- **Amount entry**: paper card radius-14; white field radius-12 with
  baseline `RM` 16px w700 muted + input **28px w700 tnum**; quick-amount
  chips = outline pills, selected orange fill.
- **Signature pad**: 1.5px **dashed** `--line-strong` radius-14, 180px
  canvas, Caveat 28px ghost hint centred; signed → solid orange border.
- Upload buttons: dashed pill-cards, hover orange.

## 8. Summary rail (order summary, both steps)

- Section labels 10px w700 0.18em uppercase muted; KV rows 13px
  (key muted / val w500 right).
- Item row: grid `48px 1fr auto`, top-aligned, 14px photo↔text gap, 16px
  between items ("分开来 有空间一点"). Photo 48px radius-10 on beige,
  **background-size: contain** (never cover-crop a product shot). Name
  Outfit 14px w700 + 9px uppercase pill badges; spec line mono 11px muted;
  price Outfit w900 18px condensed (font-stretch 80%) burnt.
- Sofa builds: cream radius-12 sub-card; per-module rows in a paper
  radius-8 box, 12px, ids in burnt w700; remark = Caveat 14px brown.
- Footer on paper rail: `TOTAL` 11px 0.18em uppercase · figure **36px w900
  condensed −0.03em burnt** with 14px `RM` sup.

## 9. Configurator (`cfg-*`, full-page) & sofa flow

- Header: white bar, eyebrow 11px 0.18em uppercase; tab group = pills in a
  paper radius-full tray, active tab = **burnt** fill cream text, 12px w600
  uppercase; 32px round back button.
- Body `1.4fr | 1fr`: left canvas on **paper** with the plan view = white
  radius-16 card ruled with a 24px grid-paper pattern (6% ink lines),
  compartment blocks 1.5px 55%-ink borders; right = options rail.
- Option pills (`cfg-pill`): 11px w600 uppercase outline, active = orange.
- Sofa custom canvas: drag builder; selected group = orange dashed frame.
- Empty/placeholder: 1.5px dashed radius-24 on warm cream, title 28px w700.

## 10. Confirmation (03 done)

Grid `1fr | 460px`: full-bleed lifestyle photo hero with top+bottom ink
gradient; 64px orange check circle with glow; eyebrow 11px 0.18em; headline
**48px w900** with a **Caveat 56px orange** accent word; sub 16px w300;
right = white receipt panel.

## 11. Motion & misc

- One easing everywhere: `cubic-bezier(0.22,1,0.36,1)`, 120–320ms.
  Hover = small lift (−1/−2px) + deeper shadow; active = scale 0.96–0.985.
- `prefers-reduced-motion` kills all of it.
- Toast: ink pill (ok variant `#2F5D4F`), bottom-center, radius-full.
- Drawers (Quotes 520px): slide-in 240ms from right, 45% ink + 4px blur
  scrim.
- Phase banner: cream pill, 10px 0.18em uppercase burnt, 6px orange dot.

## 12. Hard rules

1. Everything scoped under `.pos-proto` — the portal/backoffice (v17) look
   must stay untouched, and vice versa.
2. Class names mirror the prototype (`prototype/pos-styles.css`) — the names
   are the design contract; don't rename or restyle "for consistency".
3. All numerals in standard Outfit (`--font-num`); Bodoni is the wordmark
   only; Caveat only for deliberate handwritten accents.
4. Lucide icons only (16/18px, stroke 1.75); zero emoji.
5. Orange `#D64F20` = action/selection accent; ink `#221F20` = active
   nav/step/timeslot fill; the two are not interchangeable.
6. No price on catalog cards; prices live in the configurator + cart.
7. Controls are pills (radius-999) or radius-10–16 cards; 1.5px borders on
   interactive surfaces, 1px hairlines elsewhere.
8. Undefined CSS vars invalidate whole declarations — new sections must only
   use vars already defined on `.pos-proto` (a past bug: `--space-*` /
   `--fs-*` were referenced but undefined → gaps collapsed to 0).
