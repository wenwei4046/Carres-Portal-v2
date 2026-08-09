# UI — MASTER

> **The only UI-architecture document.** Overwritten when re-ruled; never versioned.
> **You read `CLAUDE.md` and this file.**
>
> **THE TOKEN VALUES ARE NOT HERE AND NEVER WILL BE.** They live in three standards that are
> the vocabulary itself, and this file links to them rather than copying them:
> [`../01-design-tokens.md`](../01-design-tokens.md) (spacing · colour · typography · icons) ·
> [`../02-components.md`](../02-components.md) · [`../03-page-patterns.md`](../03-page-patterns.md).
> **Open one only when you need a value. A number in two files is a number that drifts.**

| I am working on | Read |
|---|---|
| anything | **§1 · §2** |
| a kit component | **§3** |
| a page shell or a grid | **§4** |
| the right rail | **§5** |
| colour or typography debt | **§6** |
| something approved and unbuilt | **§7** |

---

# §1 · Overview

### MISSION
Give every page ONE vocabulary, so an operator never re-learns a screen and a chat never invents
a value.

### THE LAW ORDER
**Business Rules → Information Architecture → Golden Template → Design System →
Implementation.** On a conflict, Business wins and the Design System follows.

```
LOCKED, never invented   token VALUES · component internals
YOURS to improve         composition — layout, hierarchy, readability, scalability
STOP and ask             a component that does not exist. Never draw one inline "just this once"
```

**A rule that exists only as documentation is temporary and incomplete.** Every UI rule must
eventually become a structure the code can enforce — a type, a lint rule, or a failing test.

---

# §2 · Shared architecture

| Concern | The ONE home |
|---|---|
| token values | `docs/01-design-tokens.md` · mirrored (never driven) by `apps/web/src/lib/design-standard.ts` |
| the components themselves | `apps/web/src/components/kit/**` |
| the live look | **`/ui`** — public, lazy, its own chunk, so a kit reference never rides the operator's bundle |
| the enforcement | `pnpm --filter @carres/web lint` + the kit source scans |

**Frozen and not to be reopened:** the spacing scale is **8 steps** (`2 4 6 8 12 16 24 32`) ·
**`font-bold` (700) is deleted into 600** · **Lucide's stroke stays 2.**

---

# §3 · The kit

### WHAT IS ON SCREEN TODAY
**28 components**, all rendering on `/ui`. *Measured 2026-08-05 by listing
`apps/web/src/components/kit/`.*

```
Button · Input · Textarea · SearchInput · Card · Panel · Badge · StatusPill ·
EmptyState · Loading · Icon · Modal · Drawer · Select · DropdownMenu · Tooltip ·
Popover · Tabs · Checkbox · DatePicker · Toast · PageShell · DataTable ·
DetailShell · DialogFrame · FieldFrame · GridToolbar · SectionHeader
```

### FROZEN RULES
- **Radix for behaviour, the kit for appearance. NOT shadcn/ui.**
- **No component takes `className` or `style`.** Enforced by `@ts-expect-error` tests.
- **`Icon`'s name is the ruled icon meaning list**, and it has **no `strokeWidth` prop** — the
  prop existed only so `/ui` could draw two candidates, so deleting it IS the enforcement.
- **`StatusPill`'s tone is the action tone type**, so *"tone from a CONDITION, never a verb"*
  holds by construction. **`Badge` has no tone. `Button` has no `danger`.**
- **`Button` forwards its ref.** Every `asChild` trigger anchors on the trigger's DOM node, and
  a Button that eats the ref makes all four overlays open in the wrong place while React only
  warns.
- **Widths and radii that have no home in a standard live as named config keys**, never as
  numbers inside a component.

# §4 · Shells and grids

### FROZEN RULES
- **`PageShell` makes the height budget a TYPE** — `variant="list"` has no KPI slot and no
  variant has an extra band, so *"an eighth band has nowhere to go"* is literally true.
- **`DataTable` takes its header word from the column def**, which is where a duplicated `<th>`
  word came from, and it **formats nothing** — money and dates keep their own one home.
- **`DetailShell` has NO `state` prop and never may have.** Seven L4 constraints are types
  checked by `tsc`, not by the runner.
- **A list table never scrolls sideways by growing.** A column RESIZE takes width from its RIGHT
  NEIGHBOUR, never from the table — AutoCount lets a column grow and hands the operator a
  horizontal scrollbar.
- **Grid layout is NOT remembered across a reload.** There is no `storageKey` anywhere: a
  per-user store of UI shape is refused by the guard rule, and moving that store into the kit
  would satisfy the guard while breaking the law it serves. **A reload is the reset.**
- **The 40px row law binds the rows you SCAN.** The expanded cell is the ONE cell allowed to be
  tall and to wrap.
- **40px is the international default, measured 2026-08-07 — not merely our own habit.**
  AG Grid's Quartz theme ships **42px**; the two denser references anyone cites are a Windows
  desktop control (AutoCount ~17px) and another repo (2990s 28px), neither a web-grid standard.
  **And the floor is set by the CONTROLS, not the type:** the kit's expand button is 24px and
  its checkbox 16px at any row height, so a 24px control fills 60% of a 40px row and **86% of a
  28px one.** Any density change below ~32px therefore moves `badge-height` too — a second
  token. *(Evidence: `docs/research/grid-findings.md` F64 · F69 · F70. What a synthetic
  harness could NOT measure — readability, scan speed, click accuracy — stays UNKNOWN, so the
  live question is whether in-row controls stay 24px, not "40 or 28".)*
- **The windowing question is ANSWERED — `virtual` (SO-4, 2026-08-09).** The measured costs
  stand as history (at 1,500 fully-rendered rows a sort cost ~900ms and a keystroke ~640ms —
  F64 · F65 · F68); a `virtual` flat list now renders a WINDOW (2990's numbers: threshold 25,
  overscan 14) with two spacer rows carrying the off-screen height, so the DOM holds ~50 rows
  of 1,000 and a full-list scroll step measures **<1ms** on the rendered register. Grouped and
  expandable tables still render in full — variable row heights, 2990's own guard. Two defects
  were found ON THE RENDERED PAGE and are held by the fix, not by memory: a spacer's `!h-auto`
  out-important-ed its own inline height (the list scrolled 1,204px of 28,028), and a list
  narrowed while scrolled deep left a stale offset whose own spacer held the phantom height —
  the offset is clamped to the list before any index is cut from it.
- **`DataTable`'s optional powers: SO-3 added four, SO-4 deleted one and widened two**
  (2026-08-09): frozen leading columns (`freeze`, whose `left` is MEASURED off the rendered
  header so a resize keeps the pin correct), the keyboard reading position (`activeRow` —
  `↑ ↓ Enter`), `density`, and `virtual`. **`Column.filterInput` — SO-3's permanent auto-filter
  row — is DELETED** (SO-4: *"the permanent per-column filter row was an invention — 2990's own
  DataGrid never had one"*); the open-string question lives inside the ▼'s search box, where
  2990 always kept it. The ▼ itself (`Column.filter`) now carries 2990's three shapes: the
  value checklist, date preset chips + a live from/to pair, and number min/max bounds — the kit
  renders and reports, the page owns which rows survive. A frozen column takes **no `z-`
  class**: a `sticky` cell is positioned and every other `<td>` is not, so painting order
  already answers it and §4.4's ladder stays closed at five.
- **Row height is 40px, 34 on `density="compact"`, 28 on `density="dense"`** — `tokens.ts`
  `ROW_HEIGHT`, mirrored by `tailwind.config.ts`'s `h-row` / `h-row-compact` / `h-row-dense`.
  34 is 40 × 0.85 and clears the ~32px floor below. **28 is 2990's own shipped density target
  and sits BELOW that floor knowingly**: the floor is set by 24px in-row CONTROLS, and a dense
  register carries none — no expansion, no checkbox — so nothing has to fit but one 12px line
  (`dense` also drops the table's type to `text-meta`). A page wanting `dense` plus a control
  gutter is asking for the collision the floor names.
- **Every optional power is OPTIONAL and no signature moved** — that is the only reason a kit
  card can run while pages are frozen. **A page must justify wiring a power** (`§13.3` of the
  Constitution's design philosophy); an unwired power's ABSENCE is asserted by a test, because a
  power that quietly appears later is the failure that rule exists to stop.

# §5 · The right rail

### MISSION
Four widgets on the right of **every** main panel — **Calendar · Team · Tasks · Activity** —
so a COO can supervise and every operator knows what everyone is doing without asking.

### WHAT IS ON SCREEN TODAY
`apps/web/src/pages/operation/components/rail/` — `CalendarPanel` · `TeamPanel` · `KeepPanel` ·
`TasksPanel`. *Measured 2026-08-05 by listing the directory; **behaviour not read line by
line.***

### FROZEN RULES
- **No widget is an island.** Widgets interlink with each other AND with the LEFT panel; an
  action anywhere cascades to the relevant widgets.
- **The rail is 200px and it is navigation**, never a second place to act.
- **The calendar's day comes from the BOOKING, through the one shared rule** — never from the
  promised date, or two surfaces put one order on two days.

# §6 · The measured debt

**Colour**, measured 2026-07-29: the portal has **6,385 colour sites**; the guard saw **435**
(6.8%). After the ruler shipped, **5,545 of 6,129 are measured — 90.5%.** Rules O 4,661 ·
P 594 · Q 111 make the debt countable for the first time.

**Typography**: the `t-*` ramp is retired; sizes carry weight and line-height in ONE class.

**The kit's own coverage number may never go down.**

---

# ⛔ §6.5 · PAGE STRUCTURE IS NOT DECIDED — study the PORTAL before any one page

> **Loo, 2026-08-08:** *"study all portal and rearrange how to build every page structure —
> then only start sales order page again."* **This block is the brief and the open-item list.**
> Its sibling is `../orders/MASTER.md`'s own ⛔ START HERE block, which records why: ten cards
> upgraded how a table is DRAWN and not one asked what the operator should SEE.

### ⛔⛔ THE ENTRY GATE — the chat produces these BEFORE it advises anything

> **A promise to read has already been tried here and it failed.**
> `../research/grid-findings.md` TRAPS: *"A Study Receipt does not prove the conclusions came
> from the reading. One was produced at the start of this investigation and four false claims
> followed it."* **So this gate asks for no receipt. It asks for five things that cannot be
> produced without reading, and that are worth having on their own.**

```
A · THREE VERBATIM LINES, each with file:line — one from a module MASTER, one
    from grid-findings, one from 2990's own source. THE LINE, not a summary.

B · ONE THING IN THIS RECORD IT DISAGREES WITH, with its evidence.
    Law 4 is not optional. A chat that agrees with everything has not read it —
    and every good finding of the last programme came from a contradiction:
    the PRIOR ART path that did not exist · "measured in Chromium" that had
    measured a header with no arrow in it · C14 sizing `Actions` off nearly the
    NARROWEST party-named line · Receiving's px widths that were never measured.

C · WHAT IT DID NOT READ, named with line counts. Every round that hid this
    inherited a false conclusion.

D · 2990's PAGE STRUCTURE, first-hand — NOT its DataGrid, which is finished and
    must not be re-studied. How its pages COMPOSE: what leads, what sits beside,
    what opens. `SalesOrderDetail.tsx` (3,699) has NEVER been opened by anyone
    here, and ~100 of its pages are unread. That is where a page-structure
    answer lives, and this programme has only ever read its grid.

E · AutoCount's page structure. F50–F57 are first-hand OBSERVATIONS of screens
    already on file (nested child grid · filled status cell · bottom-left filter
    statement · every document type exposed permanently). It must say which it
    ACCEPTS and which it doubts, and why — they are observations of a screen,
    never of the code behind it.
```

**AND THE STANDING RULE BINDS THE WHOLE GATE:**
```
copy the POWERS, never the ASSUMPTIONS
```
**2990 and AutoCount are EVIDENCE, never specification** (`CLAUDE.md` DECISION GATE). 2990's
Sales Order list has no owner, no queue and no next-action anywhere in 1,669 lines
(grid-findings F22) — **it answers a different question than ours does. Read it to learn how it
COMPOSES a page, not to inherit what it decided to show.**

**THE ORDER OF WORK IS NOW FIXED, and it is the reverse of what was done:**
```
1  study the WHOLE portal — every operator surface, how each is composed today
2  agree ONE page-structure standard with Loo   ← consult, never propose-and-ship
3  ONLY THEN re-do Sales Order against it
```
**Sales Order stops being an upgrade and becomes the first page BUILT to the standard.**

### THE OPEN ITEMS — everything raised and NOT done, collected once

**Scattered across ~15 commits and three files until now, which is the same as unrecorded.**

```
PORTAL-WIDE — the structural questions nobody has answered
  · every page composes its own shell: Orders uses ListPageShell + a 9-group
    facet rail; Purchasing uses a 200px rail + tabs; neither is ruled the standard
  · §5 rules FOUR right-rail widgets (Calendar · Team · Tasks · Activity) on
    "every main panel". Orders' right side is facets instead. Two shapes, one law
  · the drawer REPLACES the list rather than sitting beside it (grid-findings F31,
    OrderDetailDrawer 7,576 lines) — so opening one order costs you the list
  · what is a QUEUE vs what is a FILTER — Orders' rail mixes 1 group of work with
    8 of dimensions and calls them all facets

ORDERS REGISTER — raised, measured, never carded
  · Status pill reads the same word on 30 of 31 rows and costs 139px
  · the three dots repeat what Stock, Delivery and Actions already say
  · PIC is a constant for every non-manager (they default to their own orders)
  · Deadline shows the ORDER's date; what actually expires is the ACTION's own
    deadline, and the row never shows it

KNOWN DEFECTS, filed and unfixed
  · 🔴 the drawer's items table renders `PO` and `ITEM` on top of each other
  · 🟡 D10 · D11 — dead surfaces still compiled into the bundle
  · 🟡 an unrecognised SKU still LABELS as `Accessory` in the drawer (D9 fixed the
    CLAIM, not the label — the fold survives while those files are frozen)
  · 🟡 Receiving cannot raise `Confirm ready date` — half of P20.5, needs one hook
    feeding both pages, which reaches the frozen Purchase Orders page
  · 🟡 16 free-text SKUs need real names; the keyword list mirrors migration 0148
    word for word, so both move together or neither does

THE ONE THAT OUTRANKS ALL OF THEM
  · NOBODY HAS WATCHED AN OPERATOR WORK. `../research/grid-findings.md` §6 has
    carried this line through every round and ten cards were built past it.
    Two days with Shasha and Yu Jun answers more than any further measurement.
```

**⛔ WHAT THE NEXT CHAT MAY NOT DO**
```
✗ touch business logic              APIs · calculations · the action ladder ·
                                    queues · PIC · stock · delivery · money ·
                                    permissions · order records — all PRESERVED
✗ re-measure widths or engines      finished and recorded in grid-findings §4.7/§4.8
✗ derive a page structure from      the last programme did exactly this, and the
  reading source                    two ⛔ blocks are the receipt
```

> ### ✅ TWO OF THIS BLOCK'S LINES ARE RETIRED — by the owner, twice, in writing
>
> This block said `✗ start with Sales Order — the standard comes first` and `✗ add grid
> capability — the foundation is DONE`. **The owner then issued SO-1 (2026-08-09) and SO-3
> (2026-08-09), which do both**: the register was rebuilt to THE REGISTER LAW and then given
> seven grid capabilities, four of them new kit powers.
>
> **`CLAUDE.md` Law 2 settles it — reality outranks documentation, and the owner's newest
> instruction outranks a note he wrote the day before.** Leaving the lines standing while
> shipping past them is the failure Law 4 exists to stop: a document nobody may contradict
> while the owner contradicts it is not a law, it is a stale note that makes the next chat
> argue with a ghost.
>
> **Sales Order is therefore the page the page-structure standard is derived FROM**, not the
> first page built to one. The ROW-HEIGHT line above is now a live number rather than a frozen
> one: `tokens.ts` `ROW_HEIGHT` carries **40, 34 and 28** — 34 is exactly the floor arithmetic
> this section already stated (24px controls, ~32px floor), and 28 (SO-4) steps under that
> floor only because a dense register carries no in-row control at all. The 200-row cost is no
> longer the live constraint either: SO-4's `virtual` windows the flat list (§4 above). Widths
> and engines stand as recorded.
> *Receipt: `docs/MIGRATION-MAP.md` §1.5 and §5 P1.*

---

# §7 · Approved Evolution

| What | Why it is not built |
|---|---|
| **The flame repoint — `--primary` to blue, 594 sites** | Approved. **It cannot be proved by checksum**, so it needs its own card AND a visual approval. |
| **`base-*` → the kit palette, 4,661 sites** | Approved. Ten steps into six, so it rolls out **page by page with the page migrations, never globally.** |
| **Real pages rendering through `PageShell` / `DataTable` / `DetailShell`** | Approved. Components-only was the ruling, not a shortfall. The order drawer specifically is BLOCKED: L4 needs a persistent-facts 4-tuple that does not exist on it, and creating one reverses a frozen ruling. |
| **A picker inside a dialog renders UNDER it** | A real P1 defect, scoped and approved, not yet built. |
| **Splitting the grid's `layout` prop** | `resize` and `reorder` arrive through ONE prop, so **no page can justify one power without the other.** The day a page wants one and not the other, this is the kit's card. |
| **Layout memory** | **REFUSED, not deferred** — a per-user store of UI shape breaks a standing rule. Whether that rule bends for a grid is the owner's call, and it is the one thing this module hands back. |
