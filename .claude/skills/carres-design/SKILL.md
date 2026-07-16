---
name: carres-design
description: Use this skill to generate well-branded, consistent interfaces for the Carres ERP (Carres Portal), either for production code or throwaway prototypes/mocks. Contains the UI-KIT v4 design law, colour/type/spacing tokens, the flame-heart logo, and reusable UI components (Button, StatusPill, SectionCard, TextInput, Checkbox, ListRow) plus full-screen recreations of the Orders list and Order detail pages.
user-invocable: true
---

# Carres UI-KIT v4

> **Precedence:** `docs/UI-KIT.md` in the repo is the LAW. This skill mirrors it
> for generation; if they ever disagree, UI-KIT.md wins (adopted 2026-07-17;
> contradictions resolved: canvas #F0EFE9 · stroke 2 · grey-soft workhorse, no
> black · radius-panel 18 · icons 14/16/18 · rows 44 FIXED).

Read `README.md` first — it holds the 4 rules, content fundamentals, and visual
foundations. Then explore the other files. **Never freely design: use only the
tokens and components defined here.**

## The non-negotiables

1. **White content area on the `#F0EFE9` canvas.** Flame `#C44D2B` only in the
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
