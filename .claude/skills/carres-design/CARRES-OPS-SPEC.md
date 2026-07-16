# CARRES OPS — the build contract (read this first, every time)

> Paste rule for Claude Code: **"Before writing any Operation-portal UI, read
> CARRES-OPS-SPEC.md and obey it. Use only tokens + the classes/components in
> this system. Never invent a colour, font size, radius, or component. If a rule
> here is not satisfiable, STOP and ask — do not improvise."**

This is the Operation portal only (Jess decides Operation; Admin/Finance are out
of scope here).

---

## 0. THE 6 HARD RULES (a page that breaks any of these is wrong)

1. **No hard-coded values.** Every colour/size/radius comes from `tokens/*.css`
   (`var(--flame)`, `var(--text-primary)`, `var(--radius-panel)`…). Never a raw
   `#hex` or `text-[13px]` in a page.
2. **White content on the canvas; brand in the nav.** Content = white panels on
   `var(--canvas)`. Flame only in the left nav + ONE primary action per page.
3. **One flame per page; no heavy black buttons.** Exactly one `.btn-hero` (flame)
   = the single most urgent action. The normal workhorse action = `.btn-soft`
   (grey base — soft, not heavy). Light/tertiary = `.btn-secondary` (white box).
   Destructive = `.btn-danger` (red text on white). Icon buttons (⋮, expand,
   bell, etc) = `.icon-btn` (white box). Never solid black; never a rainbow of
   solid colour buttons.
4. **Layer by weight, not size.** Body = 14–15px. Only page title (24/30) and a
   hero number go bigger. Numbers/codes/money/phone = JetBrains Mono (slashed 0).
5. **Content is near-black; muted grey is labels only.** Never pale content text.
6. **Status is always an icon + word pill.** Green ✓ ready · amber ⏲ waiting ·
   red ⚠ overdue · grey neutral. Never bare coloured text. List rows fixed height.

## 1. WHERE VALUES LIVE (never retype these)

- Colours → `tokens/colors.css`. Change theme = edit `--flame` (+ `-dark`/`-light`) once.
- Type → `tokens/typography.css` + `.t4-*` classes.
- Layout/radius/space → `tokens/layout.css` (`--radius-panel` 18 · `--radius-card` 12
  · `--row-h` 44 · `--header-h` 56 · nav 64/60 · right rail 52).
- Component classes → `components.css` (`.btn-hero` flame / `.btn-soft` grey base /
  `.btn-secondary` white box / `.btn-ghost` / `.btn-danger`; `.icon-btn` boxed icon
  button; `.pill-ready/-waiting/-overdue/-neutral` icon+word pills; `.card`,
  `.input`, `.checkbox`, `.mono`, `.t-num`).
- React primitives → `components/core/` (Button, StatusPill, SectionCard, TextInput,
  Checkbox) + `components/data/` (ListRow). Copy these, don't rebuild.

## 2. THE TWO MASTER LAYOUTS (copy the skeleton, swap the content)

- **Any record page (Payment, Supplier, Delivery…)** → copy
  `ui_kits/order-detail/index.html`: order header row · 3 KPI cards (icon-chip label,
  big Archivo number, small meta, ≤1 flame) · 33% summary / 67% detail split ·
  rounded panels · icon+word pills.
- **Any list page (Payments list, Stock, Suppliers…)** → copy
  `ui_kits/orders-list/index.html`: 60px nav rail · white header band (breadcrumb +
  title + synced + search/bell/help/settings) · 240px facet (cream section bars) ·
  white toolbar (status tabs + count + actions + ⋮) · fixed-row white table · footer.

## 3. ICONS

- Lucide only, **stroke-width 2**, sizes 14 (pill/inline) / 16 (default UI) / 18 (top bar), colour `var(--base-500)` (or
  the pill's ink colour inside a pill). **Zero emoji. Zero hand-drawn SVG.**
- Load: `lucide.createIcons({ attrs: { 'stroke-width': 2 } })`.

## 4. THE AUTOMATIC GATE (this is what makes it "can't fail")

The repo already ships `scripts/check-design-standard.mjs`, run by
`pnpm --filter @carres/web lint` in CI. It **fails the build** on:
1. a raw `#hex` in `apps/web/src/**` (use a token class instead), and
2. a list page that doesn't render through `ListPageShell` / `PageHeader`.

Keep this gate on. Docs remind; the gate enforces. If Claude Code writes a raw
colour or skips the shell, the build breaks — so it physically cannot drift.

## 5. PER-PAGE CHECKLIST (paste into every PR)

- [ ] No raw hex / no `text-[Npx]` — all via tokens + classes. `pnpm lint` passes.
- [ ] White panels on canvas; exactly one flame button; brand only in nav.
- [ ] Type via `.t4-*`; numbers/codes mono; content near-black, labels muted.
- [ ] Every status is an icon+word pill; list rows fixed height.
- [ ] Lucide icons at stroke 2, sizes 14/16/18; no emoji.
- [ ] Page copies the right master layout (record → order-detail; list → orders-list).
