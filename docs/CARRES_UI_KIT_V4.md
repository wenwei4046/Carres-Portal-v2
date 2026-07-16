# Carres UI-KIT v4

> **THIS FILE OVERWRITES ALL PRIOR UI BASELINES.** It is the single source of visual
> truth on `main`. Every page, every Claude Code build, every Claude chat MUST follow
> it. Where any older doc, code comment, or design-standard conflicts with this file,
> **this file wins.** Prior scattered UI decisions (cream backgrounds, mixed font
> sizes, light-grey text, small checkboxes) are void.
>
> Reset reason: the old kit was never fixed, so every design drifted and reading was
> hard. v4 is calibrated against professional Inter-based UI kits: white base, dark
> text, restrained type scale, colour only as a functional signal.

---

## 1. Colour — white base, functional colour only

**The content area is white. Brand colour lives only in the left nav.** Colour appears
in the content only when it carries one of four functions: action, selection, status,
alert. Everything else is black / grey / white.

Core palette (5 neutrals + brand + semantic):
```
Text primary   #1a1a1a   near-black — main content (REF, customer, date, amount, address)
Text secondary #6B7280   mid-grey  — secondary info
Text muted     #A8A8A8   light-grey — labels, icons, meta words ("ordered", "PHONE")
Surface white  #FFFFFF   content background, panels, rows
Canvas grey    #F0EFE9   page canvas behind white panels (very light)

Brand flame    #C44D2B   PRIMARY ACTION buttons + checkbox-checked ONLY
Select blue    #378ADD   row selected / multi-select ONLY
Semantic green #3B6D11 on #EAF3DE   status: ready / paid / on-time
Semantic amber #854F0B on #FAEEDA   status: waiting / chasing
Semantic red   #A32D2D on #FCEBEB   status: problem / overdue / alert
```

Brand identity is carried by the left nav (Carres theme). The content area does NOT
re-carry brand colour.

## 2. Colour discipline — anti-abuse (CRITICAL)

Colour is a functional signal, not decoration. Default is no colour (black/white/grey).
Colour only for: **action · selection · status · alert.**

**Flame rules (most-abused — enforce hard):**
- Flame appears ONLY on a clickable primary action, and on a checked checkbox.
- **At most ONE flame primary button per block/section.** Other actions use secondary
  style (outline / grey).
- Flame is NEVER used on: titles, icons, borders, dividers, hovers, or any decoration.
- Flame (action) and red (alert) must stay visually distinct and never swap roles.

**Self-check test (apply to any screen):**
1. "Is this orange a clickable primary action?" No → it's abuse, make it grey.
2. "Does this block have more than one flame button?" Yes → keep only the most
   important as flame, demote the rest to secondary.

Result: every page is mostly black-white-grey with a few meaningful coloured points —
like the reference kits.

## 3. Typography — Inter, restrained scale

**Font:** Inter for all text/UI. Weights used: Regular 400 · Medium 500 · SemiBold 600
· Bold 700. Layer by WEIGHT, not by making everything a different size.

**Numbers / codes / money / phone:** a slashed-zero monospace (e.g. JetBrains Mono or
IBM Plex Mono, or Inter with `zero` + `tnum` features) so 0 and o are never confused.
Applies to REF, SO, amounts, phone numbers, PO numbers, dates in code-like contexts.

**Type scale (px / weight):**
```
Page title (Orders)        24  SemiBold   ← largest. Nothing exceeds this.
Hero number (Outstanding)  20  Bold       ← big, but < page title
Section title (ITEMS…)     16  SemiBold
Main content (REF/cust/date/amount) 15  Medium
Secondary info             14  Regular
Panel label / table header 12  Medium, uppercase, muted
Caption / meta             12  Regular, muted
```
Most content sits at 14–15; only the page title (24) and hero number (20) rise above.
REF and SO are the SAME size — distinguish by weight/colour, never by size.

## 4. Text colour layering

- Main content (what you READ: REF, customer, **date**, amount, address) = primary
  near-black. Date is content, not a label — it is dark, never light-grey.
- Secondary info = mid-grey.
- Labels, icons, meta words ("PHONE", "ordered", table headers) = muted light-grey.

Never set content to light-grey. Light-grey is for labels/meta only. (This was the old
"everything is pale, can't read" bug — fixed here.)

## 5. Checkbox

- 16–18px square, clearly visible (not a tiny dot).
- Unchecked: grey outline empty box.
- Checked: flame-filled box + white tick.

## 6. Status = pill

Soft tinted background + dark same-hue text, pill radius:
- Ready / Paid / on-time → green (`#3B6D11` on `#EAF3DE`)
- Waiting / chasing → amber (`#854F0B` on `#FAEEDA`)
- Problem / No PO / overdue → red (`#A32D2D` on `#FCEBEB`)
Status is always a pill, never bare text.

## 7. Action = icon

Outline Tabler icons, aligned in a row, mid-grey, ~17px:
`ti-eye` (view) · `ti-edit` (edit) · `ti-trash` (delete), etc.
Never text links ("View / Edit / Delete") for row actions.

## 8. Selected row

- Checkbox turns blue-filled with white tick.
- Whole selected row gets a soft blue wash (`#e6f1fb`).
- Blue = selection only; it never doubles as an action or decoration.

## 8b. Row density (locked)

- **Row height = 44px, FIXED — not min-height.** Content adapts to the row, the row
  never grows to the content. (The old bug: `h-[40px]` was min-height semantics, so
  two-line content pushed rows to 48px and the three sources — code, design-standard,
  render — all disagreed. Fixed here: one value, 44px, 固定.)
- Content longer than one line (multi-REF, two-line item tags) → truncate with
  ellipsis or collapse; never expand the row.
- Inside the 44px row: content font 12px, checkbox 17px, status pill 11px, selected
  row gets the blue wash.
- The room comes from a slightly smaller font + breathing space, NOT from taller
  boxes. Boxes stay tight; the page never grows mile-long.
- Align all three sources to 44: `OperationOrdersControl.tsx` td height,
  `design-standard.ts` `tableRowHeight`, and the actual render.

## 8c. Read by shape, not by reading (locked)

Users should tell rows/elements apart by shape and colour BEFORE reading text:
- Layer by SHAPE first (fill vs outline = primary vs secondary action), then weight,
  then colour — not by enlarging font.
- Every clickable thing has a clear box/pill boundary.
- Big-enough checkbox (17px), status as a filled pill, selected row as a blue block —
  these register by shape/colour first; text is confirmation, not the only signal.
- Font stays small (12–15) and calm; it does not carry the whole load of telling
  things apart.

## 9. Layout basics (carried from prior locked decisions)

- Order-detail page: two columns 32% (left) / 68% (right). Left = summaries; right =
  the Items table (the hero). Panels default collapsed to a one-line summary; expand to
  edit.
- White panels on the grey canvas; 0.5px hairline borders; 12px radius on cards.
- Sentence case everywhere. Human dates ("14 Jul 26 · Sat").

## 10. How to use

- Any page / chat / Claude Code task: read this file first. It governs all visuals.
- Conflicts with older docs or code → this file wins; update the old thing.
- **Action for Claude Code:** wire the fonts into the repo config — Inter for text,
  a slashed-zero monospace for numbers/codes — and replace the old design-standard
  tokens with the palette and type scale above. Do this as its own step; show Jess;
  do not deploy.
