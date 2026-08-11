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

## §1.1 · Production UI Execution Law — owner ruling 2026-08-11

**Production UI is built on proactive design judgment and reviewed asynchronously.**
This overwrites (MASTER OVERWRITE LAW) the earlier synchronous approval gates — the blanket
"ASCII mock first, wait for yes" and the localhost "Layout Approved" hold — for production
execution work:

```
BEFORE build   the token values, the kit, COPY-STANDARD and the page patterns
               BIND exactly as before — the law order is unchanged. The chat
               composes with its own best judgment inside those laws; it does
               not wait for a layout sign-off.
AFTER build    the owner reviews the LIVE surface asynchronously. A review
               verdict is a normal re-ruling: it changes the next commit,
               it does not retroactively invalidate the shipped one.
STILL GATED    a NEW business rule · a change to an approved workflow or
               ruled word · anything §4 of the Constitution's interrupt list
               names. Design judgment covers COMPOSITION, never business law.
```

**The conversational rule survives where it always lived:** when the owner is IN the
conversation deciding between options, sketch before code (Constitution §10). The gate that
is gone is the one that parked autonomous production execution on a synchronous approval.

## §1.2 · Plan / Design Research Law — APPROVED / LOCKED, owner ruling 2026-08-11

Plan/design work continues from authoritative UI truth. **APPROVED / LOCKED decisions are not
re-researched, reopened or offered for re-approval.** At entry, separate what is already approved
from what is genuinely unresolved and name the single decision surface being solved.

**UI PROPOSAL PREFLIGHT — APPROVED / LOCKED (Loo, 2026-08-11).** Before presenting **ANY** UI
proposal, mockup or layout recommendation, a new or restarted Plan/Design chat must first extract
a brief **LOCKED CONSTRAINTS** checklist appropriate to that decision surface from this MASTER,
the current/frozen design-token authority and the target module MASTER, then validate the proposal
against every item. When relevant, the checklist includes: Sidebar active/current treatment · page
header law · toolbar law · typography (size, weight and line-height) · table header/body/footer
density and row heights · pill/button treatment · spacing · Register width/scroll law · locked
target-module column order and field semantics · existing capabilities that must be preserved ·
retired/banned patterns. The preflight may be internal or briefly visible, but the validation is
mandatory. A proposal that conflicts with an **APPROVED / LOCKED** constraint is **INVALID** and
must be corrected before Jess sees it. If the authorities themselves conflict, report that
conflict and stop the proposal; never silently choose one.

For a genuinely **UNRESOLVED** UI decision, proactively research only that declared surface. Use
the relevant governed references — including Linear, Shopify, AutoCount, 2990, current Carres UI
and other mature ERP patterns when useful — and exclude unrelated history and pages. Derive the
common patterns and real trade-offs, then give **one evidence-based Carres recommendation**, not
arbitrary A/B/C options. Reference products may inform only that unresolved surface; they **NEVER**
override Carres-governed tokens, fields, semantics, column order, capabilities or locked decisions.
Current and legacy screenshots are evidence of implementation, not authority over frozen target
truth. The order is mandatory: establish locked constraints → research only the unresolved surface
→ propose.

**GOVERNANCE IS NOT A FEATURE FREEZE — APPROVED / LOCKED (Loo, 2026-08-11).** Every Register
decision separates two questions: **(1) business/capability truth** — does the capability exist
today or should Carres add it? **(2) placement/presentation** — where and how does it appear in
the new template? `Not in the repo` means *new capability requiring an owned card*, never
*forbidden to propose*. `Existing capability` means its business value and downstream behaviour
must be preserved unless explicitly retired; it does **not** freeze today's control, band, pill,
tab or location unless the authoritative MASTER explicitly locks that presentation. When a
governed reference reveals a materially useful missing capability, Plan chat researches the
capability and may recommend it with a Carres-owned boundary; it never copies the reference's
business semantics or visual treatment blindly.

When the owner approves a complete UI or layout decision, immediately overwrite this MASTER or the
owning module MASTER with the current **APPROVED / LOCKED** truth before moving to another major
decision. PLAN mode forbids application implementation, not governing-document updates.

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
- **Kit `DataTable` layout is NOT remembered across a reload.** Sales Orders uses the existing
  `register/DataGrid` engine instead; Loo explicitly ruled that Stage A preserves that engine's
  browser layout persistence. This is a page-scoped exception, not a new kit default.
- **The 40px row law remains the kit `DataTable` default.** Sales Orders reference rows are the
  approved page-scoped 33px exception in §6.5. The expanded cell is allowed to be tall and wrap.
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

# §6.5 · REGISTER NAVIGATION AND HEADER ADMISSION — ruled by Loo 2026-08-11

**TABS ARE AVOIDED BY DEFAULT — APPROVED / LOCKED.** Separate business jobs, owned records
or destinations are separate portal-navigation entries and pages; they are never compressed
into a module tab strip. Purchasing is the explicit reference: SO Batch Purchase · Manual
Purchase · Purchase Orders · Receiving · Supplier Claim are individual destinations, with no
Purchasing tabs and no substitute second navigation row.

**TAB ADMISSION LAW — APPROVED / LOCKED.** A tab row is not a standard Register layer. Tabs
are admitted only when every tab remains inside the same owned business object, the same
operator responsibility and the same primary work, and switching tabs changes only the view
or partition of that one work surface. If the owned record, operator job, primary action or
page purpose changes, the destination must be separate navigation instead.

A proposed tab may not be introduced merely to group related pages, imitate another product,
or fill a second header. Therefore the default Register stack has no tab row: Destination
Header → page Work Toolbar when required → Work Surface. Any exception is a new page-scoped
design decision and must demonstrate that it passes every admission condition above.

**REGISTER REFERENCE DIVISION — APPROVED / LOCKED.** Carres does not copy one product's whole
page. Register headers follow the compact, width-spending Linear pattern: portal navigation
owns destination switching; the content header stays one 44px identity row and uses horizontal
room instead of adding title, breadcrumb, KPI or tab bands. Register listing behaviour and
readability follow the governed 2990 reference: its listing engine, controls, column powers,
row disclosure and table hierarchy are the reference. GitHub is evidence for tab admission,
not the Carres Register shell. Carres business ownership remains authoritative over all three.

**REGISTER PAGE HEADER — APPROVED / LOCKED (Loo, 2026-08-11).** Every Register begins with one
rendered 44px Page Header. Left = the current destination's governed icon + one short identity
title, for example `Sales Orders`. Right = genuine global utilities only: `Jump to…` with its
keyboard hint · Notifications · Help · System Settings. `Jump to…` is an approved missing
global-navigation capability: it finds permitted modules/destinations and exact document numbers,
offers recent destinations, and only navigates; it never performs workflow. The header contains
no breadcrumb, `Backend` label, duplicate title, KPI, tab, scope/view, current-Register Search,
filter, export, Columns, selection state or page-specific action. New/create, Scan Order,
SO Settings and every other page-owned action belong to the next Work Toolbar layer. Toasts
anchor below the header's right utility cluster as overlays and do not add header height.

**REFERENCE PRODUCTS NEVER AUTHOR CARRES VISUAL TOKENS — APPROVED / LOCKED.** Linear, 2990,
GitHub, Shopify, AutoCount and every other reference may supply a proven structure, behaviour
or trade-off; they never supply Carres colour, typography, radius, elevation, icon treatment or
component styling. Those come exclusively from frozen `../01-design-tokens.md` and the existing
Carres UI Kit component that owns the element. Copying 2990 cream/yellow surfaces, orange ink or
another product's control shape is a defect even when its listing behaviour is the reference.
A design mockup must use the governed Carres tokens and components too; mockup status never
permits invented styling.

**LOCAL RAIL ACTIVE ROW — APPROVED / LOCKED EXISTING KIT TRUTH.** A page-owned queue/facet rail
uses the governed Carres `NavRow` treatment: `rounded-control`; `blue-3` selection wash; one
straight 2px `blue-9` line inset on the left; slate hover for inactive rows. It is not a bordered
card, not a module tab, not a foreign reference colour and not a newly invented rail variant.

**PORTAL NAVIGATION ACTIVE COLOUR — APPROVED / LOCKED.** The flame repoint applies to active
navigation too: the current destination uses the governed blue selection treatment, never a
red/flame active line or red rounded selection block. Flame remains the Carres brand mark;
red remains late work / alert under the token law. A navigation item is selection, so its
active line and wash are `blue-9` / `blue-3`. The rollout remains a separate implementation
card; new designs and mockups show the approved destination, not the legacy red state.

**REGISTER TABLE DENSITY LAW — APPROVED / LOCKED.** The readable 2990 parent-list geometry is
the Register baseline, expressed only through frozen Carres typography tokens: rendered 36px
table header using `text-label` (11px / 14px); rendered 38px single-line parent row using
`text-body` (13px / 18px). The remaining height is balanced vertical breathing room, with the
row's checkbox included in the measured height. Expanded content takes its
natural governed child-row height and is not forced into 38px. Carres gains visible rows by
removing tall page chrome, breadcrumbs, KPI bands and redundant headings — never by squeezing
the parent row below this readable baseline. Footer existence, contents and height remain a
separate decision from row density.

**REGISTER STATUS FOOTER — APPROVED / LOCKED.** Every Register table ends in one compact,
always-present status footer fixed to the table frame; it never scrolls with the rows. The
footer keeps the operator oriented without spending a full data-row height. In its resting
state it states the current listing's total summary. When rows are selected it immediately
states the selected business summary in the page's owned unit — for example To Order's
`Mattress 5` — rather than replacing that consequence with a generic checkbox count. When a
filter narrows the listing, the footer must make the narrowed-versus-total state explicit.

The status footer is information, not a second toolbar: no primary action, Columns, Reset
layout or duplicated filter controls may enter it. **Every actionable control stays above the
table** in the page Work Toolbar, selection bar or the relevant top popover; `Reset layout`
belongs to Columns and never to the footer. Each Register MASTER owns its truthful summary
vocabulary and arithmetic; the global template may not invent a KPI, status or unit.
The exact compact height and the page-by-page summary mapping remain the next unresolved
footer decision.

# §6.6 · SALES ORDERS REFERENCE STRUCTURE — ruled by Loo 2026-08-10

**Stage A is owner-accepted and CLOSED.** Sales Orders is the first production reference
implementation of the approved Carres destination/listing architecture. This ruling is
page-scoped; it does not reopen Purchase Orders, To Order, Sidebar, Utility Rail or any other
surface.

```
DestinationHeader  44px  Sales Orders identity + genuine global utilities only
Work Toolbar       45px  scope · one Search · Filters · Export · Columns · New Sales Order
Work Surface             one DataGrid; loading · empty · error remain inside it
```

**Proven in authenticated production at 1920 · 1440 · 1130:** one destination identity · one
Work Toolbar · one general Search · no duplicate destination tab/title · no outer-page scroll ·
DataGrid-owned genuine-wide horizontal overflow · 1130 without another toolbar band · Search ·
Filters · Export · Columns · persistence · expansion all survive the migration.

**The Sales Orders reference appearance is deliberately page-scoped:** 10px bold uppercase
header in a rendered 31px row; 11px single-line parent cells in rendered 33px rows; 8px
horizontal cell padding; rendered 22px footer; flat zero-radius grid; faint structural
dividers; no zebra. This is not a global 32px law and does not alter kit/DataTable defaults.

**Preserved engine powers:** server Search · typed column filters · Columns · Excel Export ·
resize · reorder · browser layout persistence under the existing Sales Orders storage key ·
expanded order lines. The Work Toolbar's Filters control is a second door into the same
per-column filter state, not a second filter engine.

**1130 ruling:** Stage A must attempt one toolbar row and show a measured failure if it does
not fit. It may not invent a responsive law. The 2026-08-10 production-like measurement fit
all controls in 846px with no clipping; the grid itself retained 306px of grid-owned
horizontal overflow.

**Stage boundary:** expansion + virtualization is acknowledged DataGrid engine debt and Stage B
is not started. It does not block continuation of the ERP UI migration unless measured real
production scale or performance proves otherwise. The Sales Order Workspace and Old Orders
execution surface are unchanged.

# §7 · Approved Evolution

| What | Why it is not built |
|---|---|
| **The flame repoint — `--primary` to blue, 594 sites** | Approved. **It cannot be proved by checksum**, so it needs its own card AND a visual approval. |
| **`base-*` → the kit palette, 4,661 sites** | Approved. Ten steps into six, so it rolls out **page by page with the page migrations, never globally.** |
| **Real pages rendering through `PageShell` / `DataTable` / `DetailShell`** | Approved. Components-only was the ruling, not a shortfall. The order drawer specifically is BLOCKED: L4 needs a persistent-facts 4-tuple that does not exist on it, and creating one reverses a frozen ruling. |
| **A picker inside a dialog renders UNDER it** | A real P1 defect, scoped and approved, not yet built. |
| **Splitting the grid's `layout` prop** | `resize` and `reorder` arrive through ONE prop, so **no page can justify one power without the other.** The day a page wants one and not the other, this is the kit's card. |
| **Layout memory** | Refused as a kit-wide default. Sales Orders preserves its existing role-scoped browser layout key by owner ruling; no other page inherits that exception. |
