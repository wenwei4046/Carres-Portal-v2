# Carres UI-KIT v4 (consolidated 2026-07-16)

> **THE single source of visual truth.** Every page, every Claude Code build, every
> chat MUST follow it; where any older doc, code comment or design-standard
> conflicts, **this file wins**. This is the CONSOLIDATED edition — every rule
> below is as agreed with Jess up to 2026-07-16; all superseded values (cream,
> warm canvas, muted headers, mixed sizes, mono-on-words) are deleted, not
> merely deprecated. Machine mirror: `apps/web/src/lib/design-standard.ts`.
> Enforcement: `pnpm --filter @carres/web run check:v4` runs inside the build.

**Why the samples read easy (the standard in one line):** white base + dark
content + colour only on status/action/selection/alert + ONE row template +
room to breathe. Nothing designs freely.

---

## 1. Colour — white base, cool neutral canvas

The content area is white. Brand colour lives only in the left nav. Colour in
content carries one of four functions ONLY: **action · selection · status ·
alert**. Everything else black / grey / white. **No warm/cream tint anywhere**
(warm `#F0EFE9` / `#F5F1EA` are retired — hard to match, the guard bans them).

```
Text primary   #1a1a1a   near-black — all CONTENT (names, REF, dates, amounts, addresses)
Text secondary #6B7280   mid-grey  — secondary info, form labels, action icons at rest
Text muted     #A8A8A8   light-grey — true META only ("ordered", "+N more", captions)
Surface white  #FFFFFF   panels, rows, tiles
Canvas grey    #F3F4F6   the page canvas behind white panels (COOL neutral = base-100)

Brand flame    #C44D2B   PRIMARY ACTION buttons + checked single-checkbox ONLY
Select blue    #378ADD   row selection ONLY (row wash #e6f1fb)
Status green   #3B6D11 on #EAF3DE   ready / paid / on-time
Status amber   #854F0B on #FAEEDA   waiting / chasing
Status red     #A32D2D on #FCEBEB   problem / No PO / overdue / alert
```

## 2. Colour discipline + the ACTION LADDER (CRITICAL — locked 2026-07-16)

Every clickable action sits on ONE of four rungs. Never invent a fifth look.
The recipe lives in code as `components/Btn.tsx` — **import it, never hand-roll
a button** (consistency by architecture, not discipline).

| Rung | Look | Rule |
|---|---|---|
| **Hero** | flame filled | **ONE PER PAGE** — the page's single main action (Orders list = + AutoCount · order detail = + Add payment). A modal counts as its own surface and may carry one hero. |
| **Secondary** | **white box + hairline + BOLD icon + BOLD word** | the default for every other action; **a panel shows at most TWO**, the rest fold into ⋮ |
| **Tertiary** | ghost text / 17px grey icon | row actions, cancel, "+ add …" |
| **Overflow** | ⋮ menu | everything beyond the panel's two-button budget — actions are HIDDEN, not restyled |

- Black is NEVER a button colour — black marks ACTIVE states only (nav item,
  tab underline). The old black `.btn-primary` is retired for new code.
- **Pill ≠ button:** a pill is STATUS and never clickable; anything clickable
  is a box or an icon. An action dressed as a coloured pill is a bug.
- Flame never on titles, icons, borders, dividers, hovers, decoration.
- Number VALUES are never tinted — amounts/dates/counts stay dark even inside a
  warning context; the pill or the small alert icon carries the colour.
- Blue = selection only. Green/amber/red = status pills + alerts only.
- Two control sizes only: **md 32px** (toolbars, forms — inputs share the same
  32px via `components/Field.tsx`) · **sm 24px** (dense bands, inside 44px rows).
- **Box = clickable.** If you can click or type it, it has a box; if you only
  read it, it never does.
- **Wizard steps** (SOP flows only): numbered progress boxes — current = white
  box + flame outline + flame number dot + bold label; upcoming = grey box +
  grey dot. Position is visible before reading (§8c).

## 3. Typography — Inter, weight-layered, closed sets

**Font:** Inter for ALL words. Weights 400 / 500 / 600 / 700. Layer by WEIGHT,
never by inventing sizes.

**Mono scope (slashed-zero JetBrains Mono) — glyph-confusable strings ONLY:**
| String | Font |
|---|---|
| Amounts (RM 200), qty ratios (0/1), phone, SO/REF/PO/unit codes, in-table dates | Mono |
| Product/item NAMES, customer names, addresses, sentences, words ("Collected") | Inter — NEVER mono |
Mono wraps the number/code TOKEN only, never the words around it.

**Page scale:** 24/600 page title (largest — nothing exceeds) · 20/700 hero
number · 16/600 in-content section title · 15/500 content · 14/400 secondary ·
12 label/caption.

**In-row closed set (the ONLY row typography — utilities in index.css):**
- `.t4-row` 13/500 ink — row content (regions, partners, qty…)
- `.t4-row-strong` 13/600 ink — row emphasis (names, REF, dates, amounts)
- `.t4-label` 12/600 uppercase `#374151` — panel band titles + table headers (DARK)
- `.t4-caption` 12/400 `#A8A8A8` — true meta only
Minimum font anywhere: 11px. No 9–10px text.

## 4. Text colour layering

Content (what you READ) = near-black — dates included, always. Secondary =
mid-grey. **Muted `#A8A8A8` is ONLY for meta — never for content, never for the
header that names a block.** Panel band titles + table column headers are DARK
(12/600 uppercase `#374151`) — the reference tables' headers are dark.

## 5. Checkbox

17–18px square, clearly visible: unchecked = 1.5px grey outline on white;
checked in a SELECTION context = blue `#378ADD` fill + white tick (row/multi
select); checked in a single yes/no field = flame fill + white tick. Never let
a flex cell squash it (`shrink-0`).

## 6. Status = pill, ONE spec

`11px · 600 · px-2 py-0.5 · rounded-full · §1 tint/ink pair · NO border.`
Status is always a pill, never bare text, never a solid colour block. Any
status chip not matching this spec is wrong.

## 7. Action = icon

Row actions are outline icons (never "View / Edit / Delete" text links):
**17px, `#6B7280` at rest, darken to `#1F2937` on hover**, aligned in a row.
Expander chevrons 14px. Never flame, never `#A8A8A8` (invisible).

## 8. Selection

Checkbox turns blue-filled + white tick; the whole selected row gets the soft
blue wash `#e6f1fb`. Blue never doubles as action or decoration.

## 8b. Row density (LOCKED)

- **Row height = 44px FIXED — never min-height.** Content adapts to the row
  (truncate/ellipsis/fold to "+N", full value in the tooltip); the row never
  grows. `whitespace-nowrap` on cells kills silent text-wrap row growth.
- Inside the row: content 12–13px, checkbox 17px, pill 11px, blue wash select.
- Three sources always agree: the code's td height, `design-standard.ts
  ROW.heightPx`, the actual render — all 44.

## 8c. Read by shape, not by reading (LOCKED)

Shape/colour registers before text: fill vs outline = primary vs secondary
action; clear box/pill boundaries on every clickable thing; 17px checkbox;
filled status pills; blue selected block. Font stays small (12–15) and calm.

## 9. Tabs (LOCKED 2026-07-16 — sample type 2)

Main tab bars (e.g. the Orders status tabs) use **icon + label + underline**:
- Each tab: 16px outline icon + sentence-case label + count as a small grey chip.
- Active: ink text 600, icon ink, a 2px dark underline under the tab.
- Inactive: `#6B7280` text + icon, no underline; hover darkens.
- The bar sits on a white/light strip with a bottom hairline; no pill-buttons,
  no boxes per tab.

## 10. Layout + breathing

- Order-detail page: 32% (left summaries) / 68% (right — the Items table is the
  hero); panels default collapsed to one line; expand to edit.
- White panels on the grey canvas; 0.5px hairlines; 12px card radius.
- **Radius ladder (LOCKED — always pick from these four, never invent):**
  `999` pills / circles / segmented rails · `12` cards (SectionCard) ·
  `8` inner blocks (money stack, grey containers) · `6` controls (Btn, Field).
- **Segmented control** (`components/Segmented.tsx`): grey pill rail
  (base-100, radius 999, 2px inset) + the active option as a WHITE chip —
  for view toggles / modes. Not for status (pills), not for actions (Btn).
- **Round icon button**: `Btn iconOnly` — a circle at the same md 32 / sm 24
  heights, white + hairline, grey glyph (flame only if it IS the page hero).
- **Scrollbars**: thin 6px, transparent track, `rgba(26,26,26,.16)` thumb —
  global (index.css), so every scroll area reads the same.
- **Breathing:** table cells pad 12px horizontal (16px first column); the
  toolbar (bulk action buttons + search) is its OWN row above the table with a
  12px gap; panels 12px apart. Actions in the toolbar are outline buttons with
  icons; search sits right with an inline magnifier.
- Sentence case everywhere. Human dates ("14 Jul 26 · Sat").

## 11. The template rule + how to use

- **The Orders list table is THE template.** Every listing/table surface copies
  its row anatomy exactly (44px row · 17px checkbox · pills · icon actions ·
  dark 12/600 headers · toolbar row). Panels copy the Balance panel's header
  anatomy (`LABEL · summary ···· ⋮`, collapsed shortcut slot).
- Any page / chat / task: read THIS file first; run
  `pnpm --filter @carres/web run check:v4` before committing UI work (it also
  gates the build). Conflicts with older docs/code → this file wins; fix the
  old thing. Root `CLAUDE.md` §10 points here.
