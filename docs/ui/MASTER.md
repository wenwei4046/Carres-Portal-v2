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

## §1.2 · PLAN / DESIGN CHAT ENTRY LAW — APPROVED / LOCKED, owner ruling 2026-08-11

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

- **APPROVED / LOCKED decisions are not re-researched, reopened or offered for re-approval.** If
  the answer is in governing docs, use it and continue.
- For a genuinely **UNRESOLVED** design decision, proactively research only the declared decision
  surface. Use the relevant governed references — including Linear, Shopify, AutoCount, 2990,
  current Carres UI and other mature ERP patterns when useful — and exclude unrelated history and
  pages. Derive the common patterns and real trade-offs, then give **one evidence-based Carres
  recommendation**, not arbitrary A/B/C options. References are evidence, never specification;
  Carres business truth and governing architecture still win.
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

# §4.1 · OBJECT DETAIL — APPROVED / LOCKED, Jess 2026-08-18

### WHY THIS SECTION EXISTS
**It was missing, and three modules each answered it differently.** Sales Order opens a
full-screen drawer; Purchase Orders opens a 400px right pane plus a row expand; Supplier Claims
puts a 712-line panel inside the row expansion and has no right pane at all
(`w-[400px]` greps zero on that page). `03-page-patterns.md` names a `Detail` pattern in four
lines — four regions and five hierarchy items — and stops. **Three surfaces for one job is what
happens when the law is four lines long.**

### THE THREE SURFACES, AND THERE IS NO FOURTH
```
INSPECT   inside the list      row expand      ↑↓ moves · Esc closes · read to decide
WORK      full screen          four regions    the job gets done here
EDIT      full screen          split           left composes · right shows what leaves Carres
```
`00-register-laws.md:7` already rules INSPECT (↑↓, Esc) and Purchasing already models the pair as
`{ poId, mode }`. This section names them as the complete set. **A fourth way to open one record
means staff must remember which one can do what, and that memory is the thing this portal exists
to remove.**

### THE FOUR REGIONS ARE `03-page-patterns.md`'s, UNCHANGED
```
Header       which record · what state · ‹ 4 of 69 ›
Summary      the facts read before anything is done
Sections     the content
History      Today · Yesterday · Earlier
```

### A TAB EARNS ITS PLACE TWO WAYS, AND ONLY TWO
*(Corrected the day it was written: the first draft gave one reason, then a Supplier Claim failed
the test while plainly needing tabs. The rule was incomplete, not the claim.)*

**REASON ONE — genuinely parallel tracks.** A Sales Order carries EIGHT (`items · delivery ·
balance · storage · loan · documents · cases · activity`) and earns every one: goods, delivery and
money all move at the same time and none waits for another.

**REASON TWO — reference a human opens rarely but must be able to find.** Versions, History, the
route map. Not work; evidence. Burying them in the scroll makes the daily page longer for
something read once a month, and hiding them altogether means somebody re-derives it from
WhatsApp.

**Everything else is ONE SCROLL.** A purchase return has a single track — get the goods back —
and eight tabs on it is one tab and seven empty rooms.
```
PARALLEL TRACKS      Sales Order (8)
REFERENCE ONLY       Purchase Order · Supplier Claim
                       work is the first tab; the rest are Versions / History / Order Route
ONE SCROLL           Goods Receipt · Purchase Return · Repair Order · Display Request ·
                       Manual Purchase · the three Consignment documents
```
**The test, and it is mechanical: would a staff member open this tab on an ordinary Tuesday?**
Yes and it runs beside the others → reason one. No, but they would hunt for it when something
went wrong → reason two. Neither → it is a section in the scroll, not a tab.

### THE SPLIT IS AN EDIT MODE, AND ONLY WHERE AN OUTSIDER READS THE RESULT
**Viewing never splits the screen** (Jess, 2026-08-18). Pressing edit does, and the right half is
**the document the other party will actually receive**, redrawn as the left half is typed — which
is the only way an operator can see what a supplier will read without printing it.
```
SPLITS       PO · Consignment Order · Purchase Return · Repair Order · Supplier Claim
NEVER        Goods Receipt · Display Request · Manual Purchase
```
Receiving RECORDS what was counted; it composes nothing for anybody. A preview pane there spends
half a screen on something no one outside will ever read.

### A PANEL'S ACTIONS LIVE IN ITS OWN HEADER ⋮
Already ruled (Jess, 2026-07-11) and it corrected nine surfaces at once —
`orders/MASTER.md`: *"every panel's actions live in its header ⋮; the redundant inline button is
gone."* It binds every object detail in the portal; it is not re-argued per module.

### WHAT IS REMEMBERED, AND WHAT IS NOT
**Remembered: whether a rail or a panel is collapsed.** Shipped and measured —
`OrderDetailDrawer.tsx:2000` reads `ops-drawer-rail` from `localStorage`, and panel open/closed
persists by panel title (`:656-673`).
**Not remembered: the grid's shape** — width, order, visibility. A test asserts it
(`OperationOrdersControl.test.tsx:614`: *"persists no column shape"*), and §4's reload-is-the-reset
rule stands.
**The line is whether the choice changes what the record MEANS to the next reader.** Collapsing a
rail is where my eyes are now; re-cutting the columns redefines the table for everyone who opens
it next. *(Written down because a 2026-08-18 chat read the layout-memory rule, did not read the
shipped code, and stated the opposite.)*

---

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

## APPROVED / LOCKED · ERP-WIDE REGISTER TEMPLATE — owner ruling 2026-08-11

Every ERP Register page uses one shared Carres Register Template. **The listing capabilities are
copied from 2990 in full** — search, column-matched filtering, column selection, export, sorting,
row selection and read-only row expansion — so an operator learns one Register and can operate
the rest. Carres does not copy 2990's business assumptions or page-specific content: KPI cards,
default columns, primary actions, expansion content and business summaries remain page-owned and
must be justified by the owning module.

The template governs the complete Register composition, not only the table engine. Current pages
whose header, controls, table and detail regions run together without sufficient separation are
not the approved destination. They must be brought onto the same ruled header, control band,
listing and expansion structure as their page is migrated. Each module MASTER owns what its
Register shows; this UI MASTER owns where those parts live and how the composition stays consistent.

**Explicit boundary:** copying 2990's listing capability does not license an overall `Current`,
overall status, KPI strip or any other field the owning module does not govern. Sales Order still
has no `Current` or overall status. The shared template is reusable layout and interaction power,
never a source of business truth.

If the chat is told **“Register Template — continue from repo governance”**, it must:

1. Read `CLAUDE.md` → `docs/ERP-ARCHITECTURE.md` → this UI MASTER → the target module MASTER.
2. Apply `CLAUDE.md`'s object/domain completeness law before calling any local Register question
   the next unresolved decision. State **ALREADY APPROVED · OBJECT COVERAGE / CONSEQUENCES ·
   GENUINELY UNRESOLVED · THIS SESSION'S SINGLE DECISION SURFACE**.
3. Preserve settled architecture and the §6.4 rulings without re-researching or reopening them.
4. For the missing Register-template decision proven by step 2, proactively conduct scoped research
   using the relevant governed references — `grid-findings`, Linear, Shopify, AutoCount, 2990,
   current Carres UI and other mature ERP patterns when useful. Exclude unrelated pages and history;
   derive the common patterns and real trade-offs from the evidence.
5. Preserve UI Dictionary / IA first, proposal preflight and Carres semantics before references.
   The action contract carries **owner rule + resolved owner + action + source object + governed
   working date/calendar** as structured facts. The presentation never flattens all of them into
   one repeated sentence; §6.6 governs density by surface.
6. Present the smallest missing decision as **one evidence-based Carres recommendation** for Jess's
   approval, not arbitrary A/B/C layouts. Do not restart with a portal-wide survey, a new status
   model or implementation.

## APPROVED / LOCKED · REGISTER FILTER STATE + OPTIONAL-COLUMN OVERFLOW — owner ruling 2026-08-12

Every Register keeps one global `Search` above the listing and offers a column-matched filter on
each filterable data column. Search answers the case where the operator does not know which column
holds the words; the column filter gives precise narrowing once the fact is known. Filters combine
with **AND between columns** and **OR between selected values in one column**.

The filter control matches the fact it narrows:

```
date                 governed date presets + Between
number / money / qty minimum + maximum
SO / document code   type-to-find distinct values
enum / name          searchable multi-select values
```

A filtered column always shows an active indicator in its header. The Register does not add a
second permanent toolbar: only while Search or a column filter is active, one compact removable
filter band appears below the control band. It names every active narrowing and ends with
`Clear filters`, for example:

```
Customer: Umi ×   Ordered: This week ×                         Clear filters
```

Hiding a filtered optional column does **not** silently remove its filter. The filter continues to
apply; the active-filter band continues to name it; and the `Columns` chooser marks that column
`Filtered`. The operator can clear it from the band or show the column again. An invisible filter
with no visible disclosure is forbidden.

`Columns` decides only **WHAT** optional facts are visible. It does not resize, reorder, pin,
group or save a layout. Approved default columns remain first and in the owning module's governed
order. Optional columns appear after them in one governed template order. Reload restores the
shared default columns and clears Search and column filters; no personal width, order, visibility
or filter layout is remembered.

When optional columns exceed the available width, only the listing region scrolls horizontally.
Header, rows, read-only expansion and footer totals share one horizontal scroll position. Search,
the active-filter band, `Columns` and `Export` remain fixed outside that scroll. A Register may not
create a second nested horizontal scrollbar, and an open filter/column overlay may not be clipped
by the listing scroller.

`Clear filters` clears Search and every column filter. It does not change visible columns,
selection or a page-owned scope. A filtered empty result explains the state and offers the same
exit: `No {records} match these filters.` + `Clear filters`, using the owning module's governed
record word.

**Upgrade trigger:** if observed operators must repeatedly rebuild the same factual narrowing to
perform stable daily work, add a governed named shared view. That evidence does not license
personal column-width/order memory.

**Current unresolved Register-template surface:** none inside reusable filter/overflow behaviour.
Default-column hierarchy, initial scope, optional factual columns, selection actions, context
actions, page-owned primary actions and footer summaries remain page-owned decisions in the target
module MASTER. Future Register-plan chats continue with the target module's next single unresolved
decision and may not ask Jess to choose this filter/overflow behaviour again.

## APPROVED / LOCKED · STRUCTURED ACTION + OWNER PRESENTATION — owner ruling 2026-08-14

> **Action has an Owner. Sales Order does not have one universal Owner.**

One business object may raise several actions and every action may resolve through a different
owner rule. The UI may not create one permanent `Owner` column for a Sales Order, and it may not
degrade a structured owner into ordinary action text such as `Tan Qu Qu · Ask customer…`.

The shared presentation contract is:

```
object identity       row/card header or its governed Register column
fact or problem       first semantic line
resolved owner        structured avatar / metadata, outside the sentence
action                second semantic line; action only
completion fact       authoritative owner-module fact, not copied prose
due                    derived through the governed calendar law
cover                  normal owner + today's acting cover, both retained as evidence
```

### Register

The Register does not repeat facts that already own columns. In Sales Orders, `SO No` and
`Customer` remain in their columns. Customer Delivery may render:

```
⚠ No delivery date
[SH] Ask customer for a delivery date
```

`[SH]` is an independent avatar chip, never sentence text. Hover/focus exposes `Shasha`. Do not
append `Save the agreed date` unless staff can actually complete that result from the Register.
When the Register is reference-only, it may render only `⚠ No delivery date`; the full action
belongs to Sales Order detail / Work Engine.

### My Work

The user already knows the work is theirs, so the list does not repeat their own avatar on every
row. It shows object identity, fact/problem and action. Owner context appears only for cover,
handover or another exceptional ownership condition.

```
TODAY

SO-1318
No delivery date
Ask customer for a delivery date
```

### Team Work

Owner identity belongs to the grouping header, not every row:

```
[SH] Shasha
8 open · 2 overdue

SO-1318
No delivery date
Ask customer for a delivery date
```

The next person is the next group. Per-row owner metadata appears only when the row's owner differs
from its group, or cover/handover evidence must be explained.

### Cover

Roster and buddy-cover law resolve today's acting person automatically without overwriting normal
ownership:

```
Normal owner: [SH] Shasha
Today's cover: [YJ] Yu Jun
```

Work Engine shows today's work to Yu Jun and preserves both identities. Register, My Work and Team
Work consume the same action contract; only their presentation density changes.

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
