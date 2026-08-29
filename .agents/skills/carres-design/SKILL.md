---
name: carres-design
description: "SUPERSEDED 2026-07-27 — DO NOT USE FOR DESIGN DECISIONS. This skill holds the RETIRED UI-KIT v4 law, whose tokens now contradict docs/ui/MASTER.md. Read docs/ui/MASTER.md instead. Kept only as a historical asset store."
user-invocable: false
---

# ⛔ SUPERSEDED — 2026-07-27

> **This skill's design law is the OLD kit and it CONTRADICTS the current law.**
> **Read [`docs/ui/MASTER.md`](../../../docs/ui/MASTER.md). Take nothing from this file.**
>
> Do NOT take from here: spacing · colour · typography · row height · icon
> stroke · component specs · page templates · `styles.css` · `components.css` ·
> `tokens/` · `ui_kits/` · `guidelines/`.
>
> **Known contradictions with the current law** (this is why it is closed, not
> merely "older"):
>
> | This skill says | The current law says |
> |---|---|
> | rows **44px FIXED** | row height is **PENDING** — decided in card D0.5c |
> | "almost all text **14–15px**" | **13px** is the body default; 14 and 16 do not exist |
> | `.t4-*` type classes | `t-page / t-title / t-strong / t-body / t-meta / t-label` |
> | canvas `#F3F4F6` | Radix **`slate-3`** (`#F0F0F3`) |
> | flame `#C44D2B` **in the left nav** + one action per block | flame appears in **the logo only** |
> | its own hex table | **`@radix-ui/colors`** — the law names the STEP, never the hex |
> | icon stroke **2** | **PENDING Q4** — decided on `/ui` |
>
> The replacement for "show me what it looks like" is the live **`/ui`** route
> (card D0.5), which renders the real components and therefore cannot go stale
> the way this folder did.
>
> **Not deleted on purpose.** The logo assets and the old screenshots are still
> the only copies. Deleting is card D0.3, after the new kit is proven.

---

<details>
<summary>Retired content below — historical record only, do not follow</summary>

# Carres UI-KIT v4 (RETIRED)

Read `README.md` first — it holds the 4 rules, content fundamentals, and visual
foundations. Then explore the other files. **Never freely design: use only the
tokens and components defined here.**

## The non-negotiables

1. **White content area on the `#F3F4F6` canvas.** Flame `#C44D2B` only in the
   left nav + the ONE primary action per block.
2. **Colour = action · selection · status · alert only.** Everything else is
   black/grey/white. Flame=action, blue=selection, green/amber/red=status.
3. **Inter, layer by weight not size.** Almost all text 14–15px; only page title
   24 and hero number 20 go bigger. Numbers/codes in JetBrains Mono (slashed 0).
4. **Content is near-black `#1A1A1A`; muted grey is for labels only.** Never pale
   content text.
5. **List rows are 44px FIXED** — content truncates, the row never grows.
6. **Status is always a pill; one flame button per page; Lucide icons, no emoji.**

## When building

- **Always link `styles.css`.** Use its classes: `.t4-page-title/-hero-num/-section/
  -content/-secondary/-label/-caption` for type; `.btn-hero/-primary/-secondary/
  -ghost/-danger` for buttons; `.pill-ready/-waiting/-overdue/-neutral` for status;
  `.card`, `.input`, `.checkbox`, `.mono`, `.t-num` for the rest.
- **Production React code:** copy the components from `components/core/` and
  `components/data/` (or match their structure) and the token classes.
- **Prototypes / mocks / slides:** copy `assets/` + `styles.css` out and write
  static HTML. Use `ui_kits/orders-list/index.html` and `ui_kits/order-detail/
  index.html` as the layout reference — they are faithful recreations of the real
  screens.
- **Every new list page** copies the Orders-list frame: 60px nav rail · white
  header band (breadcrumb + title + synced stamp · search/bell/help/settings) ·
  240px facet with cream section bars · white toolbar (status pills + count +
  actions + ⋮) · white sticky-header 44px table · footer with row count.

If invoked with no other guidance, ask what they want to build, ask a few
questions, then act as an expert Carres designer — output HTML artifacts for
mocks, or production-shaped React for real code.

</details>

---

⛔ **End of retired content.** Everything above the `<details>` line is the only
part still in force: read [`docs/ui/MASTER.md`](../../../docs/ui/MASTER.md).
