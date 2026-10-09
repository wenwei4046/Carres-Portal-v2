# Handoff: Carres · Sales Orders → Outright (list + order detail)

## Overview
The Outright Sales Order page of the Carres Operations app: the order list and the order detail (Sales Order · Order Route · Timeline), with the Tasks panel on the right. The owner (Jess, COO) confirmed it on 8 Oct 2026 as the **template every other module copies** (same shell, list, detail, density and colours).

## About the design files
`Sales Order Outright Layout v8.dc.html` is a **design reference built in HTML**, not production code. Open it in a browser (`support.js` must sit next to it) to see the look and click through the behaviour. Recreate it in the target codebase with that codebase's framework and components. Data in the file is TEST data; wire it to real data.

- `Carres Layout Standard.md`: written UI rules. **Section 1 (shell), 2 (menu), 3.1–3.3 (list, detail, Tasks) and 4 (UI rules) are binding**; follow them where this README is brief.
- `Carres Ops Rules.md`: business rules behind the screen (journey steps, dates, who acts, due dates, DO gates, date wording).

Screenshots: `screenshots/1-list.png`, `2-detail-sales-order.png`, `3-detail-order-route.png`, `4-detail-timeline.png` (captured at a narrow width; at 1440 px the Tasks panel and summary panel show beside the table).

Ignore the Settings page inside the file; it's out of scope for this handoff.

## Fidelity — READ FIRST
**High fidelity. The look must match the screenshots in `screenshots/` pixel-close.** This is not a suggestion layer on top of your component library.

**Visual source of truth, in this order:** 1) `UI Kit.md` + `Carres UI Kit.dc.html` (every component with exact measurements) 2) `screenshots/*.png` 3) `carres-tokens.css` 4) the v8 HTML file. If this README and the UI Kit disagree, the UI Kit wins.
- Use our existing components only for **behaviour** (table, router, data, forms). **Restyle them** with `carres-tokens.css`. If a component's default colour, radius, font, size or icon differs from this spec, the spec wins.
- Copy `carres-tokens.css` into the app and use its variables everywhere. Do not hard-code other colours.
- **Do not add anything that is not in the screenshots** (no extra buttons, icons, columns, filters, view switches or tabs). If you think something is missing, ask; do not add it.

### Do NOT (these were wrong in a previous build)
1. No blue anywhere. Selected = `--c-select-bg` / `--c-select-fg`.
2. Side menu opens at 220 px with words and group labels. Not icon-only by default.
3. Status pills: light background + dark text (status tokens), full word, never cut off with "…". Never dark-grey solid pills.
4. No box inside a box. Cards have one 1 px border; inside, separate with thin lines only.
5. Page title is "Sales Order / Outright": 14 px grey + 20 px weight 500. Not a big bold "Sales Orders".
6. No funnel icon on every column, no Table/Cards switch, no ⌘ or ? icons, no extra right-hand icon column, no ▸ on every row.
7. Inter only. No monospace or typewriter font for money or numbers; use tabular numbers.
8. Column name is exactly "Customer original delivery date".
9. View tabs are exactly Open · Delivered · All. No "Listing", no "Monthly demand".

### Done = all of these are true (check yourself before showing the owner)
- [ ] Put your screen side by side with each file in `screenshots/`: same columns, same order, same wording, same colours.
- [ ] Every item in the Do NOT list above is absent.
- [ ] Every colour in your CSS comes from `carres-tokens.css`.
- [ ] Only one charcoal main button per area ("Request amendment" in detail).
- [ ] Clicking a row opens the detail; tabs Sales Order · Order Route · Timeline work; Tasks panel opens and closes.
- [ ] Date words match the "Date wording" section exactly.
If any box is not ticked, fix it before showing the owner.

## Page shell
- Desktop 1280–1920 px (MacBook 1440 is the main test size). Columns: side menu 220 px (64 px closed) · page · Tasks panel 320 px. The page itself never scrolls; panels and table bodies scroll inside with thin scrollbars.
- **Side menu (one shared component, the same on every page of the app; build it once and reuse it)**: logo row (wordmark 20 px high when open, heart mark 34 px when closed, « / » collapse button). Group labels 10 px 600 uppercase, letter-spacing .12em, #8A9099: OVERVIEW · SALES LOCATIONS · SALES · SUPPLY CHAIN · SERVICE · DATA. Items 14 px, weight 500, #5C6168, padding 7×10, radius 8. Sub-items (Outright, Subscription …) have a thin grey tree line. Selected: #FBE6DB background, #A33A14 text, 600. Settings ⚙ and the user avatar (32 px, online dot) at the bottom.
- **Header** (56 px): "Sales Order / Outright" (14 px #6B7178, then 20 px 500 ink). Right: global search pill (#F0F1F3, 34 px, "Search SO, PO, supplier, customer"), team button (online count), bell.

## List page (Layout Standard 3.1)
- Summary panel 240 px (collapsible): ‹ month ›, number tiles that filter the table on click, pieces by category.
- Toolbar: view tabs Open · Delivered · All · search this list · column views (Sales Order · Overview · Payment · Stock · Warehouse · Delivery) · ⋮ (Export Excel/PDF, Save as my view, Sync from Sales Portal).
- Ticking rows swaps the toolbar for a selection bar: "n selected · n pcs · Total RM x | Export · Print SO | Clear".
- Table: fixed header (12–13 px 500 grey); rows 13 px, min 54 px, two-line cells allowed, 1 px row lines. Click anywhere on a row to open it (checkbox and in-row buttons don't open it; Ctrl/⌘-click opens a new tab). Status as pill = colour + word.
- Bottom summary line: "n orders · Qty: Mattress 7 · Bed frame 4 …".

## Order detail (Layout Standard 3.2)
- Header: ← · SO no. · customer · status pill · PIC avatar · "Rev n" if amended · Log contact · **Request amendment** (the one charcoal button) · ⋮.
- Tabs: **Sales Order · Order Route · Timeline**.
- **Sales Order tab**: sales strip (SO Doc Date · Proceed Date · Dealer · Sales Location · Salesperson); cards Customer + Emergency contact, Delivery + Address (label left, value right, 12–13 px); Items table; Payment.
- **Amendment**: the page stays put; pencils appear next to editable fields; a sticky bar shows "Amendment · n changes · Why? · proof · Cancel · Submit for approval". Rev history drawer: newest first, before → after, who, why.
- **Order Route tab**: a status card (Customer original delivery date · Customer confirmed delivery date · days left · problem pill), then the view switch Overview · Steps · Details.
  - Overview: three cards, **Goods · Delivery · Payment** (problem cards amber and first). Each card shows: icon · name · pill; one plain sentence; facts (Now at · Due · Document · Next); steps list; owner. Goods card lists items by product (item × qty, status pill, Supplier · PO · Deadline · Actual · Result). Supplier lateness is judged only against the supplier deadline (PO date + production days).
  - Steps: node map SO → Goods / Delivery / Payment → Goods in + Paid + Date confirmed → Delivery Order → Delivered.
  - Details: Step · Who · Planned · Actual · Status · Document. Every document number opens a preview drawer (SO PDF, PO preview).
- **Timeline tab**: every event with date/time, who (avatar; gear for System), what, details, source, attachments. Filters All · Contacts · Amendments · by module. Records are never edited.

## Tasks panel (Layout Standard 3.3)
"Tasks" · date · n left · Log button · module filter icons in menu order (count when there are jobs, pale when none). The whole row opens the result form. Log form: WhatsApp / Call → Who → What happened → details → Remark → Proof → Save.

## Date wording (use exactly)
Customer original delivery date · Customer new delivery date · Customer confirmed delivery date · Delivered. Never "Planned", "Agreed date" or "ETA" for the customer date (ETA is for supplier goods only). Dates are shown as "Thu, 15 Oct". Money is shown as "RM 1,200.00".

## Design tokens
See `UI Kit.md` and `carres-tokens.css`. All values there are copied from v8 with line numbers.

## Assets
`assets/carres-wordmark.png`, `assets/carres-mark.png`. Never recolour.
