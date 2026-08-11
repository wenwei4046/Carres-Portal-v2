# UI — MASTER

> **The only UI-architecture document.** Overwritten when re-ruled; never versioned.
> **You read `CLAUDE.md` and this file.**
>
> **This MASTER is the only current UI authority.** The three files below are implementation
> reference tables owned by this MASTER, not separate governance and never a competing source:
> [`../01-design-tokens.md`](../01-design-tokens.md) (spacing · colour · typography · icons) ·
> [`../02-components.md`](../02-components.md) · [`../03-page-patterns.md`](../03-page-patterns.md).
> **Open one only when you need a value. If a reference conflicts with this MASTER, this MASTER
> governs and the reference is corrected in the same change.** A number in two files is a number
> that drifts.

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

## §1.1 · PRODUCTION UI EXECUTION LAW — owner ruling 2026-08-11

This governs **BUILD** work. It is separate from §1.2's PLAN / DESIGN gate and does not redesign,
infer or reopen a Card's approved business rules.

- A Card requiring human interaction ships its production operator UI in the same vertical slice
  as truth/schema/API/history/tests/deploy work. A backend without the surface needed to use it is
  not Card complete; a Card with no human interaction gets no invented surface.
- Required UI is not deferred to a final polish Card. Each Card is deployed, production-verified
  and recorded in the governing module MASTER before continuous build advances.
- Continuous build does not wait for routine UI approval. Stop for Jess only when a UI decision
  changes how Carres operates, contradicts approved truth, or the task was explicitly designated
  PLAN MODE / Layout Approved gate.
- Read this MASTER and only the relevant token/component/page-pattern references before changing
  UI. The kit is a design language, not a blind template; required layout, responsive behaviour,
  testing and polish remain implementer-owned within approved law.
- The final Card may run an end-to-end consistency and polish pass; it is never the first operator
  UI.

## §1.2 · PLAN / DESIGN CHAT ENTRY LAW — owner ruling 2026-08-11

This governs **PLAN / DESIGN** work. A new chat continues from the current approved truth instead
of reconstructing the thinking that produced it.

```
READ       CLAUDE.md → ERP Architecture → this UI MASTER → target module MASTER
STATE      WHAT IS ALREADY APPROVED
           WHAT IS GENUINELY UNRESOLVED
           WHAT SINGLE DECISION / DECISION SURFACE THIS SESSION IS SOLVING
RESEARCH   only that unresolved surface
PROCEED    from the approved baseline; never from a blank sheet
```

- Do not re-study the whole UI/business history, 2990, Old Orders or current pages by default.
  Consult history or research only for an explicit **UNKNOWN**, a genuine conflict between current
  governing laws, or evidence the unresolved decision needs and the MASTERs do not yet capture.
- Do not reopen approved architecture, ask Jess again, or offer broad A/B/C alternatives for a
  settled decision. If the answer is in governing docs, use it and continue.
- Current code and screens are implementation evidence. Inspect them for gaps, density and
  usability when relevant, but they cannot override the approved target.
- Challenge an approved ruling only with a genuine contradiction, demonstrated impossibility, or
  new business evidence requiring Jess's decision. Name the exact ruling and evidence.
- If the task is designated PLAN MODE or carries a Layout Approved gate, do not implement or make
  an implementation commit before explicit approval. Governing-document updates are allowed and
  required: immediately write each complete decision Jess explicitly approves into this existing
  MASTER or the owning module MASTER as **APPROVED / LOCKED** truth under the MASTER OVERWRITE LAW.
- Do not move through further major design decisions while an approved ruling remains only in chat.
  Adjacent coherent rulings may be batched into one sensible Git commit; one `yes` does not require
  one commit. On restart, the MASTER must expose the locked decisions and the next genuinely
  unresolved decision without depending on conversation memory.

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
- **A Register does not offer drag-resize.** The template gives every default column a governed,
  predetermined width (or governed range where explicitly ruled) that makes the approved default
  set clean and readable without staff designing the layout. `Customer` may have a governed width
  or range; it does not simply absorb all remaining space. Never squeeze default columns narrower
  merely to avoid scrolling.
- **Register truncation is conditional, never the sizing mechanism.** A cell truncates only after
  its column reaches the governed maximum; hovering that truncated cell reveals the complete
  value. Columns added through `Columns` use the same allocation and overflow rules.
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
① The Register's identity/freeze boundary follows the APPROVED / LOCKED wide/narrow contract in
   ruling ⑪; no smaller legacy freeze set governs Sales Orders.
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
⑪ APPROVED / LOCKED REGISTER COLUMN WIDTH LAW — 2990-style intent. Every default Register column
   has a governed, predetermined template width (or an explicitly governed range); staff do not
   drag-resize columns to make the default view usable. The approved default visible set must be
   clean and readable at those designed widths. `Customer` may have a governed width or range but
   does NOT simply absorb all remaining width. Horizontal scrolling is not the normal solution for
   the default layout. It becomes intentional when the user adds optional/additional columns and
   the resulting table exceeds the available width. Do not squeeze all default columns narrower
   merely to avoid that overflow. The column chooser decides WHAT to display, not user-designed
   layout widths. This supersedes the earlier automatic-slack and narrow quantity-region wording.
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

# §6.5 · REGISTER PLAN RESTART CONTRACT — owner ruling 2026-08-11

The ERP Register Blueprint in §6.4 is approved baseline. A new Register-plan chat does not repeat
the historical programme that produced it and does not treat current Sales Orders, Old Orders,
2990 or AutoCount as a fresh specification exercise.

If the chat is told **“Register Template — continue from repo governance”**, it must:

1. Read `CLAUDE.md` → `docs/ERP-ARCHITECTURE.md` → this UI MASTER → the target module MASTER.
2. State **ALREADY APPROVED · GENUINELY UNRESOLVED · THIS SESSION'S SINGLE DECISION SURFACE**.
3. Preserve settled architecture and the §6.4 rulings. Research only the missing Register-template
   decision named in step 2; use current screens and code only as implementation/usability evidence.
4. Consult `grid-findings`, 2990, AutoCount, Old Orders or other history only when §1.2's evidence
   exceptions are met, and say which exception triggered the lookup.
5. Present the smallest missing decision for Jess's approval. Do not restart with a portal-wide
   survey, broad A/B/C layouts, a new status model, or implementation.

**Current unresolved Register-template surface:** reusable filter/overflow behaviour beyond the
locked §6.4 width law. Default-column hierarchy and whether selection is permanent remain
page-owned and are recorded in the target module MASTER; governed template widths, a clean/readable
default set, optional-column overflow, and the chooser's WHAT-not-width boundary are **APPROVED /
LOCKED** in §6.4. Future Register-plan chats continue to the next unresolved layout decision and
may not ask Jess to choose this width behaviour again. The target module MASTER may narrow this
list; it may not silently broaden the session beyond the single decision surface declared at entry.

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
