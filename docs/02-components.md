# 02 · COMPONENTS

> **Status: FROZEN.** Reusable UI components for the whole Carres Portal.
>
> **This file documents the components we ACTUALLY USE, in the order we use
> them** (Loo, 2026-07-31). A component is written up when a real page proves
> it, not in advance. An undocumented component below the line is not forbidden
> — it is untested by a real page, and documenting it before that is how a kit
> fills with boxes nobody needs.

Every component reads `01-design-tokens.md` and may never define its own
colour, typography, radius, spacing, elevation or size.

Source: `apps/web/src/components/kit/`. Live at **`/ui`**.

---

## Component standard

Every entry follows this shape. Sections with nothing true to say are omitted,
never padded.

**Purpose · When to use · When NOT to use · Anatomy · Variants · Sizes ·
States · Behaviour · Accessibility · Do · Don't · Used by**

---

## Naming

Nouns. `Button`, `Table`, `Card`, `Badge`, `Dialog`.
Never `Blue Button`, `Large Card`, `Success Table`.

**One purpose, one visual language, one behaviour, one source of truth.**
If an existing component solves the problem, reuse it. Create a new one only
when composition cannot.

---

# Documented — proven by a real page

## DataTable

**Purpose.** The ONE list table.

**When to use.** Any list of records an operator scans, compares and acts on.

**When NOT to use.** A single record's fields (that is a detail region), or
fewer than three rows of unrelated facts (that is a card).

**Anatomy.** A percentage `colgroup` + `table-fixed`, an optional sticky
header, optional whole-row selection, rows, and one of empty / loading in
place of rows.

**Behaviour.**
- **Never scrolls horizontally on any screen.** The table is always exactly its
  container width; long content ellipsis-truncates.
- **Rows are 40px fixed.** Content adapts to the row.
- **Columns are DATA.** The header word comes from the column def and is typed
  exactly once — a hand-written `<th>` is how one column ends up with two words.
- **It formats nothing.** Money is `Money`, a date is `fmtDate()`. A table that
  formatted them would be a second date spelling. It offers `align` and
  `numeric` and stops.
- **It spells no word.** Every label is the caller's, from COPY-STANDARD.
- Row click opens the record on the first tab, when the caller passes one.

**States.** Rows · empty · loading · selected · hover.

**Accessibility.** `label` names the table for a screen reader. Select-all shows
the indeterminate dash on a partial tick.

**Do.** Give every column a width; the set sums to 100.
**Don't.** Add a column whose only job is to hold an icon with no meaning.

**Used by.** Purchase Orders → Items (first business page, 2026-07-31).

---

## SectionHeader

**Purpose.** Say what a region of a page IS, and what it holds right now.

**When to use.** Every region of a multi-region page. A page whose regions
label themselves in their own markup is a page where one region has a count and
its neighbour has none.

**When NOT to use.** A card's title — that is `Panel`, which owns a surface.
`SectionHeader` draws no border and no background: it labels a region of a page,
not a box.

**Anatomy.** `[chevron] TITLE ······ meta · action`

**Behaviour.**
- **Collapsing is a TYPE, not an optional prop.** The two shapes are a
  discriminated union. A permanent region has no `open`, no `onToggle`, and
  **no chevron and no button at all** — a disabled control that can never do
  anything is worse than no control, because a reader spends a moment finding
  out.
- **It renders the header, not the body.** The caller owns what is inside and
  decides whether to mount it, so a collapsed region costs nothing to render and
  this never becomes a layout box.
- `open` is **controlled**. The page already knows which regions are open; a
  second copy of that state is a second answer.
- **It spells no word and composes no sentence.** `title` is the caller's, from
  COPY-STANDARD; `meta` is a slot.

**Anatomy notes.** The title is `text-label`, uppercase — a region eyebrow, not
a heading. `meta` sits at the right edge and is omitted entirely when there is
nothing to say, rather than rendering an empty span that still takes height.

**Accessibility.** The collapsible form is a real `<button>` carrying
`aria-expanded`. The permanent form carries neither.

**Do.** Give a region a `meta` only when the fact changes — a count, a status.
**Don't.** Put a module's word inside this file, or make a region collapsible
because its neighbour is.

**Used by.** Purchase Orders → Items (permanent, 2026-07-31). Header and
Supplier Communication adopt the collapsible form as those sections are built;
Notes may.

---

## DropdownMenu

**Purpose.** Actions on one row or one object, folded behind `⋯`.

**When to use.** A row has more than one action, or an action is rare enough
that a permanent button would spend width on it every row.

**When NOT to use.** Bulk actions on a selection — those belong to an action bar
that appears on selection. A menu item always acts on the one row it hangs off.

**Anatomy.** A trigger (a kit `Button`) + a floating surface of items. An item
is a label, an optional icon, and an optional divider ABOVE it for grouping.

**Behaviour.**
- **No submenus.** A nested target is one item per target
  (`Move to Purchase Order 2`), because a dead-end verb is worse than a list.
- An item that has no destination is not rendered — never disabled and left
  sitting there.

**Accessibility.** Opens on `Enter`/`Space` on the trigger. **Test it by
keyboard:** jsdom has no `PointerEvent`, so a `fireEvent.click` on a Radix
trigger dispatches an event the trigger never sees and the menu silently never
opens — a click-only test passes while proving nothing.

**Do.** Order items by how often they are used, with the leaving-the-module
action last, after a divider.
**Don't.** Put a destructive action first.

**Used by.** Purchase Orders → Items row `⋯`.

---

## Icon

**Purpose.** One meaning, one glyph.

**Behaviour.** `name` is a union of 43 meanings — §5.3's 40 verbatim, plus the
three made-to-order categories `mattress` · `bedframe` · `sofa` (Loo,
2026-07-31, for the To Order rail's category level; Lucide `BedDouble` ·
`Bed` · `Sofa`). A name outside it does not compile — which is the
enforcement, not a convention. Sizes 14 · 16 · 18. Stroke is Lucide's 2 and
there is no prop to change it.

**Don't.** Reach for a glyph because it looks right. Reach for the MEANING; if
the meaning is not in the union, it has not been ruled.

**Used by.** Everywhere.

---

## Button

**Purpose.** Perform an action.

**When NOT to use.** Navigation (that is a link) or status (that is a pill).

**Variants.** Primary · neutral · ghost — three, and the ladder is a colour
law: `blue-9` filled is the ONE action fill per block, neutral is every other
action, ghost has no box. **There is no destructive variant** — red has one job
(late · act now) and a red button paints intent onto a control; a destructive
action is a neutral button whose WORD says what it does.
**Sizes.** sm 24 · md 32.
**States.** Default · hover · active · focus · disabled · loading.

**Behaviour.** Forwards its ref — every `asChild` overlay anchors on the
trigger's DOM node, and a Button that eats the ref makes menus, popovers and
tooltips open in the wrong place while React only warns.

**Do.** One primary button per screen.

**Used by.** Everywhere.

---

## Checkbox

**Purpose.** A box, a tick, and a word.

**Anatomy.** The whole row is the label — a bare box with a word beside it is a
word that toggles nothing when clicked. Inside a table cell or a bar there is no
visible label; `ariaLabel` is then required.

**States.** Unchecked · checked · `indeterminate` — a real third value meaning
*some, not none* (a select-all over a partial pick shows a DASH, so the
difference survives greyscale).

**Do.** Use it for a fact the operator flips, like `Include in this issue`.
**Don't.** Use it as a status display nobody can change.

**Used by.** To Order → the PO bar's `Include in this issue`; `DataTable`
selection.

---

## Select

**Purpose.** Pick one value from a short known list.

**When NOT to use.** More than ~10 options (that needs search), or an action
list (that is `DropdownMenu` — a Select CHOOSES, it never DOES).

**Anatomy.** It wears the field skin (`field-recipe.ts`), so a Select and an
Input in one row share height, hairline, focus ring and refusal red. Options
are DATA, never children — a children API is how row appearance stops being the
kit's within a week.

**Accessibility.** Radix, not `<select>` — opens by keyboard; jsdom tests must
open it by keyboard because a click-only test proves nothing.

**Used by.** To Order → Issue region (`Destination`).

---

## Panel

**Purpose.** A Card that has a title.

**When to use.** The one question: does this surface need to say what it IS? If
yes, Panel; if no, Card. Two components rather than an optional `title`, so a
page cannot half-title a card.

**Anatomy.** Title (`text-strong`) · optional `right` slot (one control — a
count, a pill, a Button) · body. Header split by the STRONGER `slate-6`
divider. **It does not collapse** — a collapsible region is `SectionHeader`.

**Used by.** To Order → `Not on any purchase order` · the issued result.

---

## Card

**Purpose.** The white surface.

**Anatomy.** White fill · `slate-5` hairline · 10px radius · **no shadow**
(depth as decoration is banned). `padding="none"` exists only for a body that
must touch the edges — a table, an empty state.

**Used by.** To Order → Issue region · the empty pane.

---

## EmptyState

**Purpose.** What a region says when it holds nothing — an ANSWER, not an
apology.

**Anatomy.** Required `title` (the answer, one line) · optional `detail` ·
optional single `action`. No illustration slot: art is decoration.

**Used by.** `DataTable`'s empty row · To Order's empty pane.

---

## Loading

**Purpose.** Two shapes for two questions: a **spinner** says *this control is
busy* (inherits `currentColor`, so it is right inside a blue button without
anybody choosing); a **skeleton** says *this region is arriving* (`slate-3`
bars, the last one short so it cannot be mistaken for a table).

**Behaviour.** No timing, no state — the caller knows whether anything is
loading; this component only draws.

**Used by.** `Button loading` · `DataTable` loading · To Order's queue rail.

---

# Built, not yet proven by a real page

These exist in `components/kit/` and render on `/ui`. They are written up when a
business page adopts one.

`Input` · `Textarea` · `SearchInput` · `Badge` · `StatusPill` · `Modal` ·
`Drawer` · `Tooltip` · `Popover` · `Tabs` · `DatePicker` · `Toast` ·
`PageShell` · `DetailShell`

---

# Not built

`Alert` · `Banner` · `Skeleton` · `Switch` · `Radio` · `Breadcrumb` ·
`Pagination` · `Number Input` · `Currency Input` · `Side Panel`

Listing a name here is not a plan to build it. It is a record that the problem
has come up and has no component yet.
