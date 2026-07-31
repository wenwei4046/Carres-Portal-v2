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

**Behaviour.** `name` is a union of 40 meanings. A name outside it does not
compile — which is the enforcement, not a convention. Sizes 14 · 16 · 18.
Stroke is Lucide's 2 and there is no prop to change it.

**Don't.** Reach for a glyph because it looks right. Reach for the MEANING; if
the meaning is not in the union, it has not been ruled.

**Used by.** Everywhere.

---

## Button

**Purpose.** Perform an action.

**When NOT to use.** Navigation (that is a link) or status (that is a pill).

**Variants.** Primary · secondary · tertiary · ghost · destructive.
**Sizes.** sm 32 · md 40 · lg 48.
**States.** Default · hover · active · focus · disabled · loading.

**Behaviour.** Forwards its ref — every `asChild` overlay anchors on the
trigger's DOM node, and a Button that eats the ref makes menus, popovers and
tooltips open in the wrong place while React only warns.

**Do.** One primary button per screen.

**Used by.** Everywhere.

---

# Built, not yet proven by a real page

These exist in `components/kit/` and render on `/ui`. They are written up when a
business page adopts one.

`Input` · `Textarea` · `SearchInput` · `Card` · `Panel` · `Badge` ·
`StatusPill` · `EmptyState` · `Loading` · `Modal` · `Drawer` · `Select` ·
`Tooltip` · `Popover` · `Tabs` · `Checkbox` · `DatePicker` · `Toast` ·
`PageShell` · `DetailShell`

---

# Not built

`Alert` · `Banner` · `Skeleton` · `Switch` · `Radio` · `Breadcrumb` ·
`Pagination` · `Number Input` · `Currency Input` · `Side Panel`

Listing a name here is not a plan to build it. It is a record that the problem
has come up and has no component yet.
