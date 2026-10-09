# Carres UI Kit (for Claude Code)
Every value is copied from `Sales Order Outright Layout v8.dc.html` (line numbers shown). Visual reference: open `Carres UI Kit.dc.html` in a browser. Variables: `carres-tokens.css`. If a library component differs, restyle it to these values.

## Colour
Ink #221F20 · body #3A3F47 · unselected tab #4A4F57 · secondary #6B7178 · muted #8A9099 · menu #5C6168 · ground #F5F3F0 (theme) · card #FFFFFF · hover #EFECE8
Select (selection only, theme): #FBE6DB bg / #A33A14 text. Checkbox accent = #A33A14.
Borders: card #E9EBEE · button/drawer #E4E1DC · input + chip #E1E4E8 · table header line #E4E1DC · table row line #EEECE8 · table footer line #EEF0F2 · section line in cards #EEECE8
Status (fixed): done #E7F6EC/#1E7A40 · needs action/late #FBF0D6/#7A5A00 · problem #FDECEC/#B42318 · waiting/info #F0F1F3/#3A3F47 · finance hold #221F20/#FFFFFF

## Type (Inter, tabular numbers)
Page title 20/500/−0.02em (L45) · breadcrumb 14/400 #6B7178 (L43) · card/drawer title 15/600 (L678) · menu item 14/500 #5C6168 (L26) · body/table cell 13/400 (L179) · label/sub-line 12 (L165, L189) · small 11, never smaller except group label (L35) · group label 10/600/.12em caps #8A9099 (L25)

## Buttons (radius 8)
- Main: h34 · pad 0 14 · 13/600 · #221F20 bg, #FFFFFF text · no border (L241). One per area.
- Normal, page header: h34 · pad 0 14 · 13/500 · white · 1px #E4E1DC · hover #EFECE8 · icon 17, gap 6 (L240)
- Normal, toolbar/forms: h32 · pad 0 12 · 13/500 · icon 18 (L158, L268)
- Icon, toolbar: 36×36 round · no border · icon 21 · #3A3F47 · hover #EFECE8 (L156)
- Icon, header: 34×34 round · 1px #E1E4E8 · icon 20 (L53)
- Filter chip: pad 4 10 · 12/600 · #F0F1F3 · 1px #E1E4E8 · "Label ×" (L152)

## Tabs
- List views and detail tabs: pad 5 12 · 13 · radius 8 · gap 2 · selected 600 #FBE6DB/#A33A14 · others 500 transparent #4A4F57 (L149, L1120)
- View switch inside a card: track #F5F3F0 · pad 3 · round · buttons pad 4 10 · 12 (L375–376)

## Inputs
- Global search: h34 · round · #F0F1F3 · no border · pad 0 12 · icon 18 · 13 (L47)
- Field: h32 · 1px #E1E4E8 · radius 8 · pad 0 10 · 13 (L272); inside edit rows h30 (L319)
- Checkbox 16×16 (L180)

## Table (list page)
Header min-h 40 · pad 6 14 · 12/500 #8A9099 · bottom line #E4E1DC · sticky (L165)
Row min-h 54 · pad 6 14 · margin 0 6 · gap 10 · 13 · bottom line #EEECE8 · whole row clickable (L179). Second line 12 #6B7178 (L189).
Status pill: pad 3 10 · round · 12/500 · nowrap, never cut off (L183)
Footer h44 · top line #EEF0F2 · 13 #6B7178 (L162, L197)

## Side menu (one shared component on every page)
Width 220 open / 64 closed · item pad 7 10 · gap 10 · radius 8 · 14/500 #5C6168 · icon 20 · selected 600 theme select · hover #EFECE8 · group label 10/600/.12em (L20–35) · logo 20 px high (L20) · avatar 32 with 10 px online dot #1E8A47 (L34)

## Shell, cards, drawer
Columns: menu 220 · page · Tasks panel 320 (L485) · header h56 · pad 0 18 · gap 14 · no border (L40–41)
Card: #FFFFFF · 1px #E9EBEE · radius 8 · pad 14 16 · no shadow (L162). No box inside a box; separate with 1px #EEECE8.
Drawer: right · top/bottom 12 · w400 · 1px #E4E1DC · radius 8 · shadow 0 12 40 rgba(34,31,32,.18) · header pad 14 16 · backdrop rgba(34,31,32,.18) (L675–678)
Pop-up menu: white · radius 8 · shadow 0 8 28 rgba(22,24,29,.1) · pad 6 · item pad 7 10 · 13/500 (L207, L172)
Icons: Material Symbols Rounded, outline, weight 300, 16–21 px

## Settings → Appearance (per user, saved to their profile)
A theme changes only: page ground, selected background, selected text (+ checkbox accent). Ink, charcoal buttons, status colours and borders never change. Default Carres. (v8 L1171–1182)
Implement: `<html data-theme="carres" data-focus="soft">`; the classes are in carres-tokens.css.

| Theme | Group | Ground | Selected bg | Selected text | Dot |
|---|---|---|---|---|---|
| Carres | Brand | #F5F3F0 | #FBE6DB | #A33A14 | #D64F20 |
| Cool Slate | Cool | #F4F5F7 | #E6E9EE | #1F2937 | #64748B |
| Blue | Cool | #F4F6F9 | #E3ECFB | #1D4ED8 | #3B6FE0 |
| Teal | Cool | #F3F6F6 | #DDF0EE | #0F5F59 | #14857C |
| Violet | Cool | #F5F4F8 | #ECE8F7 | #4C3A8F | #6E58C4 |
| Warm Honey | Warm | #F7F4EC | #FBEFC9 | #7A5300 | #D9A21B |
| Olive | Warm | #F4F4EE | #E6ECD9 | #3F5A2A | #6E8A3E |
| Rose | Warm | #F8F3F3 | #F7E1E4 | #8A2E40 | #C2546A |
| Latte | Warm | #F5F2EE | #ECE3D8 | #5A4632 | #8B6B4A |

Picker: 3 groups · Brand "Recommended" · Cool "Calm and crisp" · Warm "Soft and homely". Option = 12 px dot + name; chosen = 2 px #221F20 ring. (v8 L1337)

Focus outline choice (keyboard focus and hovered row, offset −2px; v8 L1183–1187): Soft grey 1px #C9CED6 (default) · Theme colour 1.5px selected text · Strong 2px #221F20.
