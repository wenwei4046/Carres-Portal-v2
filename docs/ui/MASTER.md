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
- **The grid renders every row it is given, and the cost is now measured.** At 1,500 rows a
  header-click sort costs **~900ms** and one keystroke **~640ms**; the DOM holds 2,095 `<tr>`
  and 24,854 cells (F64 · F65). **AG Grid caps rendered rows at 500 and SAP Fiori at ~200
  before lazy-loading; `DataTable` has no cap of any kind** (F68). The cost is linear in rows
  and **flat in density** — 100ms is crossed at ~200–350 rows, so this is a WINDOWING question
  and never a row-height one.
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

# §6.4 · THE ERP REGISTER BLUEPRINT — ruled by Loo 2026-08-08 on the live Sales Orders build

> **THE TABLE IS THE APPLICATION.** A register is not a web page with a table on it. Chrome
> that exists because "pages have headers" is deleted. Scored 9.4/10 on review; these are the
> corrections that must land before it is reused.

```
Sales Orders                                        Columns  Export
───────────────────────────────────────────────────────────────────
SO ▼ │ Customer ▼ │ Items ▼ │ Value ▼ │ Promised ▼ │ …
[flt]│[flt]       │[flt]    │[flt]    │[date ▼]    │        ← typed per column
───────────────────────────────────────────────────────────────────
rows …                          ┌──────────────────────┐
                                │ SO-1300           ×  │  ← CLOSE, never Back
                                │ ‹  4 of 69  ›        │     (Outlook preview)
                                │ Customer · Money ·   │
                                │ Promise · Request ·  │
                                │ Items · History      │
                                │                Save  │  ← disabled until dirty
                                └──────────────────────┘
```

**THE RULINGS**
```
① FREEZE `SO No` + `Customer` on the left. Everything else scrolls. (AutoCount's own shape.)
② EVERY FILTER MATCHES ITS COLUMN — a date column gets This week · Next week · No date ·
   Between…, never a textbox.
③ ITEMS READ AS HUMAN WORDS — `King Mattress`, not `B1201S-K`. The SKU rides the hover.
④ THE PANEL IS CALM — no box around every field. Notion, not a form. Sections, not borders.
⑤ THE MONEY STRIP IS THE MOST-READ REGION — Total large · Paid medium · Outstanding loud.
⑥ SAVE IS DISABLED UNTIL SOMETHING CHANGED.
⑦ HISTORY GROUPS BY Today · Yesterday · Earlier, never a flat list of dates.
⑧ ⭐ RECORD WHY THE PROMISE CHANGED. `The customer asks for {date}` + `Reason` → history.
   Six months later nobody can otherwise answer WHY the promise moved.
⑨ ⭐ `Request Item Change`, NEVER `Change Items`. Changing an item moves the quotation, the
   payment, the purchasing plan and the delivery. **This is §0's Charter enforced in a button
   word: Sales Order may REQUEST what four other modules must execute.**
⑩ DELETE: the Refresh button (auto) · the Back button (it is a close, not a navigation) ·
   the page header's spare height.
```

### 🔴 THREE CHALLENGES — recorded with the ruling, not after it

**🔴 C1 · `Promised` MAY NOT BE BLUE.** `../01-design-tokens.md:101` is frozen: *"blue marks
the current thing and the primary action, and nothing else"* — line 109 says blue marks
**exactly two things on any screen.** A date in blue makes it a third. **The money strip gets
its emphasis from SIZE and WEIGHT, which the ruling already uses for Total and Paid.**
`Outstanding` may take the amber/red family only when it is genuinely late — §2.2 gives red one
job. **This is the one item of the ten that cannot ship as written.**

**🟡 C2 · DELETING SEARCH ENTIRELY CONTRADICTS THE CHARTER, and AutoCount does not do it.**
§0 froze *"a customer phones and the operator must find that order"*. **A per-column filter
requires knowing WHICH column first** — a caller says "I'm Umi" and the operator does not know
if that is a name or a phone. **AutoCount's own window carries `Enter text to search… [Find]`
in its top-right AND per-column filters** — both, in Loo's own screenshots. **Recommendation:
keep ONE search box over SO · customer · phone · item, and add the per-column filters beside
it.** Excel's filters are an addition, never a replacement.

**🟡 C3 · AUTO-REFRESH MUST NEVER CLOBBER AN OPEN EDIT.** The panel has a dirty state and a
Save. A refetch that lands mid-typing loses the operator's words. **Auto-refresh pauses while
the panel is dirty.**

### SCOPE — approved as a BLUEPRINT, not as a rollout
**Purchase Orders (Phase 2, frozen 2026-08-03) and To Order (frozen by Jess 2026-08-01 —
*"再继续改只会开始进入无限微调"*) are FROZEN pages with approved layouts.** Reusing this
blueprint on them REOPENS two freezes. **The pattern is approved; each page's migration is its
own decision and its own card.**

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
✗ start with Sales Order            the standard comes first
✗ touch business logic              APIs · calculations · the action ladder ·
                                    queues · PIC · stock · delivery · money ·
                                    permissions · order records — all PRESERVED
✗ re-measure widths, densities,     finished and recorded in grid-findings §4.7/§4.8
  engines or row height
✗ add grid capability               the foundation is DONE; S2.5 is STOPPED
✗ derive a page structure from      the last programme did exactly this, and the
  reading source                    two ⛔ blocks are the receipt
```

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
