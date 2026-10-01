# 02 · COMPONENTS

> **Status: GOVERNED COMPONENT CONTRACTS.** Existing token values remain frozen.
> Source existence, adopted usage and production verification are separate claims.
>
> **This file documents the components we ACTUALLY USE, in the order we use
> them** (Loo, 2026-07-31). A component is written up when a real page proves
> it, not in advance. An undocumented component below the line is not forbidden
> — it is untested by a real page, and documenting it before that is how a kit
> fills with boxes nobody needs.

Every component reads `01-design-tokens.md` and may never define its own
colour, typography, radius, spacing, elevation or size.

Source: `apps/web/src/components/kit/`. Live at **`/ui`**.

**Self-contained Carres measurements:** [01 §§7–8](01-design-tokens.md#7--canonical-component-measurements--scoped-not-one-size-for-every-surface) owns the scoped numeric recipes, source/target/status matrix and unresolved conflicts. Use it with these component/pattern contracts. Reference screenshots do not supply missing numbers; proposed sizes do not override approved sizes.

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

**Purpose.** The existing bounded kit table; it is not the universal ERP Register engine.

**When to use.** Existing bounded table adopters whose content fits this contract. ERP document
registers use `components/register/DataGrid.tsx` and UI MASTER §6.0/§6.7; goods disclosure uses
GoodsMiniTable and the source-specific quantity contract. Preserve a working adopter unless a
measured need justifies migration.

**When NOT to use.** A single record's fields (that is a detail region), or
fewer than three rows of unrelated facts (that is a card).

**Anatomy.** A percentage `colgroup` + `table-fixed`, an optional sticky
header, optional whole-row selection, rows, and one of empty / loading in
place of rows.

**Behaviour of this component, NOT portal-wide table law.**
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

**Do, for this bounded component only.** Give every column a width; the set sums to 100.
Do not transfer percentage widths, forced truncation or fixed-height rules to DataGrid or goods
tables. Those follow content-led widths, governed row recipes and contained scrolling.
**Don't.** Add a column whose only job is to hold an icon with no meaning.

**Used by.** Purchase Orders → Items (first business page, 2026-07-31).

---

## Compact Register search — approved target

**OWNER ACCEPTED TEMPLATE / production verification pending — owner2026-10-01.** Clear compact search uses
Inter and existing Carres colours. Canonical dimensions live in01§7.2. Use the existing shared
search control; preserve query, clear and keyboard access. Placeholder: `Search orders…`.
Accessible hint names only verified supported search fields. Shrink on constrained screens
without clipping or hiding the active query; retain touch adaptation. Visible toolbar content:
count/filter summary, search, admitted Table/Cards, fixed far-right secondary-tool menu. Scope is
the Sales-first Register template, not automatic replacement of every search variant.

## Register toolbar overflow

**OWNER ACCEPTED TEMPLATE / production verification pending — 2026-10-01.** Use the existing admitted shared menu/control
family; do not build a page-local toolbar or new menu engine. Search/current filter summary and
admitted Table/Cards stay visible. Fixed far-right `⋯` holds supported secondary page tools
(Export, Columns; Wrap/reset only if supported). Entries use icon plus text; order writers do
not belong here. Trigger dimensions live only in 01 §7.2. Retain keyboard naming, menu navigation,
focus return and scoped selection/export rules. Narrow layouts overflow secondary tools first.
This governs Register adoption; the batch GridToolbar below retains its distinct selection job.

## GridToolbar

**Purpose.** The one row above a grid: how to narrow it, what is selected, and
the single action that acts on the selection.

**When to use.** Its existing batch-workspace adopters. Other registers use their governed
shared toolbar; do not replace it solely because this component is named GridToolbar.

**When NOT to use.** A Detail page's action group — that is the title block.
Filters that need more than a search box: those are the navigator or the
column filters, never a second toolbar row.

**Anatomy.** `[ search ] ······ [ right ] [ meta ]` — three slots, all
optional, all the caller's content. It composes no sentence and spells no word.

**There is no `scope` slot** ("which slice am I looking at"). One was built and
removed on 2026-08-03: a Workspace keeps its navigator permanently on screen
with the active row lit, so the line repeated what was already visible beside
it. Recorded because the idea is an obvious one to have twice.

**Behaviour.**
- **`right` is rendered only when it has something to say.** The primary action
  exists while a selection exists, and vanishes with it — a permanently visible
  commit button on an empty selection is a dead control.
- **`meta` is the quiet corner**: the freshness stamp, never a Refresh button.
  A Workspace recomputes itself; a Refresh implies it does not.
- It owns no state. Search value, selection and sort belong to the page.

**Do.** Keep it to one row — it is permanent height on every screen of the page.
**Don't.** Put a page title, a KPI or a count badge here; those are the shell's
slots (`03` — the five slots).

**Used by.** Purchasing → To Order (2026-08-01, the pattern's first page).

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

`panelToggle` is the approved shared filter-panel control (2026-09-16):
`PanelLeftOpen` by default, `PanelLeftClose` with `panelOpen`, using the kit’s 2px stroke.

**Purpose.** One meaning, one glyph.

**Behaviour.** `name` is a union of 50 meanings — §5.3's 40 verbatim, plus the
three made-to-order categories `mattress` · `bedframe` · `sofa` (Loo,
2026-07-31, for the To Order rail's category level; Lucide `BedDouble` ·
`Bed` · `Sofa`), `columnFilter`, `pillow`, `protector`, `panelToggle`, and the
Work left rail's `previous` (`ChevronLeft`) · `noDate` (`CalendarOff`) ·
`modules` (`LayoutGrid`) (owner-approved UI, 2026-09-24). A name outside it does not compile — which is the
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

**Scope.** Existing explicitly governed adopters only. The current object/detail/review card
choice is Block under ONE KIT LAW; this older component is not a second selectable card style.
Do not migrate working governed exceptions without scoped review.

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

**Scope.** Existing primitive/adopters, not an alternative object-card chrome. Use Block for
new compositions under ONE KIT LAW.

**Purpose.** The white surface.

**Anatomy.** White fill · `slate-5` hairline · 10px radius · **no shadow**
(depth as decoration is banned). `padding="none"` exists only for a body that
must touch the edges — a table, an empty state.

**Used by.** To Order → Issue region · the empty pane.

---

## Block

**Purpose.** The ONE card (ONE KIT LAW, 2026-09-27; moved into the kit 2026-09-28). Sales Order,
Purchase Orders, Manual Purchase, the Warehouse Unit and Work draw every card with it.

**Anatomy.** One chrome (no tone, #1672): white · 1px `slate-5` · card radius · 12/16 padding · black
`text-strong` title over a 1px rule · `headerSlot` (one door or the card's own button, never a
writer) · optional `why` line (13/400, red missed / amber due / slate-11) · body with one 12px gap.

---

## RouteStop · ChecklistRow · QuietRouteRow

**Purpose.** The Work route (Workspace MASTER §5.10): one stop per Sales Order Order Route node, its
cards' checklists, and the one-line fold of a stop with no work now. Values: UI MASTER "THE WORK
ROUTE KIT". Every mark is a RECORDED fact; staff never tick a checklist.

**Used by.** Workspace Work (the Mission and the PO view).

---

## ScheduleCard

Below 768px, embedded button and link targets have a 40px minimum height; product buttons
also have a 40px minimum width. The dense desktop controls retain their kit dimensions.

Shared calendar-card composition for Delivery and Warehouse (owner direction 2026-09-14).
Header, body and footer have fixed positions. Uses existing card border/radius, body/label text and spacing tokens, without shadow. The event owner supplies recorded facts; this component computes no status, quantity or route. Product lines may use kit Button + Popover for accessible details; the footer holds one link to the owning work. No nested interactive elements inside a card-wide link.

Product category icons retain the existing mattress / bedframe / sofa mapping. Pillow uses RectangleHorizontal and Mattress protector uses Layers2, via the shared Icon registry. Other/unverified categories use the generic goods icon and expose the recorded product name through the same detail control. No category may be inferred by the glyph component. Every product line remains separate, including repeated categories; no hidden +N more.

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

## PdfPreview

**Purpose.** Display actual PDF pages inside a document review, using the shared
`lib/pdf/paint.ts` renderer also used by Sales Order review. The component takes
an already-rendered PDF URL; it does not fetch business facts or issue documents.

**Behaviour.** Fit to pane width, Zoom in/out and Fit width; enlarged pages scroll
inside their pane. Loading and decode/render errors are explicit, with Try again.
A ready callback fires only after every page has painted. Source changes, resize,
retry and unmount cancel old rendering and release its PDF worker resources.
The caller owns the source URL and its lifetime. A failed preview is not a completed
review. The live `/ui` example includes a real draft and a failed-preview sample.

**Used by.** The shared SO Batch / Manual Purchase PO review. Purchasing MASTER §8.2
owns its approved desktop composition and completion gate; this is not the image
and evidence viewer promised for Supplier Claims.

---

## SavedEvidenceViewer

**Purpose.** The approved shared read-only saved-photo/video viewer (Purchasing MASTER
§9.5). Deployed in #1593, with authenticated Receiving and production example readback
2026-09-24 (evidence in Purchasing MASTER §9.5). Receiving's existing
arrival-evidence controls are the first consumer. Claim-record photos also adopt it
in production (#1594; authenticated readback 2026-09-24); Stock/Service and per-Unit Claim expansion
integrations remain separate work and must reuse this component.

**Contract.** The owning authorised reader supplies stable file IDs, kind, signed URL
(or null for an unreadable existing file), recorded source/event context and any proven
Unit associations. The viewer never fetches a storage list, widens permissions, uploads,
deletes, or rewrites evidence. Retry calls the owning reader again. Empty evidence has
no opening control; a known file without a readable URL remains visible as a failure.

**Behaviour.** Existing Modal viewer width, focus trap, Escape/Close, focus restoration
and scroll lock; photo zoom, drag, Reset, Previous/Next; native video playback, seeking
and fullscreen. Each file switch resets enlargement and keeps its own context. Loading,
media failure and retry differ; a late retry cannot replace a newly selected file.
The fullscreen-focus correction (#1595; production-verified 2026-09-24) returns focus
to the viewer after native fullscreen exit so a subsequent Escape can close it.
The `/ui` example includes a clearly marked photo, an unreadable file and an eight-second
synthetic H.264 video (`ui-evidence-example.mp4`, generated colour/motion test pattern,
320×180 at 12fps; no recorded business or personal content). Receiving
keeps arrival evidence at receipt scope; no Unit attribution is inferred.

---

# Shared control and state contract

**Documentation clarification, 2026-10-01.** Input, Select, DatePicker, Modal and related fields
have real SO/PO/Receiving adopters; the former blanket “not proven by a real page” inventory was
inaccurate. Adoption is not all-state or production verification. UI MASTER holds dated evidence.
The following maps existing sources and required review coverage, not new component admission.

| Need | Existing source | Required behaviour / evidence boundary |
|---|---|---|
| Text, multiline, numeric entry | kit/Input, Textarea, FieldFrame and existing source-specific numeric fields | Visible label, known value, required/read-only distinction, format hint when necessary, field error associated with input. Do not invent numeric formatting or allow source-owned calculated totals to become editable. |
| Short choice / searchable choice | kit/Select and current admitted searchable picker | One value, correct empty placeholder, unavailable options explained, long label readable, keyboard selection and contained popup. Do not silently substitute one control for a locked module choice. |
| Dates | kit/DatePicker and governed fmtDate | Clear date meaning, existing constraints, keyboard-accessible calendar, locale-independent stored value. Supplier, requested and actual dates stay separate. |
| Form groups and read-only facts | kit/Block, FieldFrame and existing detail field recipes | Same group identity between read/edit, stable label hierarchy, required facts visible. Collapsed groups reveal errors/unsaved content rather than hiding them. |
| One bounded confirmation | kit/Modal → DialogFrame | Named purpose, source identity and effect, cancel preserves valid draft, focus stays within and returns to persistent opener. Do not move a complete operation into a second modal form. |
| Evidence input | EvidenceUploadField plus existing authorised source wrapper | Accepted types/limits from source, per-file pending/failed/retry states, link exact record/line/Unit, no success before storage result. Do not duplicate uploader or mix unrelated evidence. |
| Evidence/document viewing | SavedEvidenceViewer / PdfPreview | Current/proposed/sent/historical identity; loading, absent, unreadable and denied differ; post-result PDF failure does not imply business transaction failure. |
| Loading / empty / failure / denied | Existing Loading, EmptyState and source-owned error presentation | A failed read is not zero/no records; useful retry where valid; denied access is not a recurring retry loop. No new universal Alert/Banner is implicitly admitted. |
| Save blockers | Source-owned validation plus existing field feedback | Same problem in summary and field; record/row/field target plus recovery action. Shared all-known-blockers renderer is UNVERIFIED, not an existing engine claim. |
| Business result and handoff | Existing object result + Work/Duties | Show what changed, what remains and who is responsible from actual source. Timeout may mean outcome unknown; check the same operation before retrying. A success toast alone is insufficient. |

**Dialog focus.** Modal accepts `returnFocusRef` for a persistent trigger when the opening menu
item unmounts. DialogFrame captures ordinary openers before auto-focus and restores the explicit
trigger when supplied. The WarehouseIncoming sampled close-return gap remains an adopter issue;
no page-local replacement modal is justified.

**Coverage required per control:** default, populated, required, read-only, disabled (with reason
when actionable), invalid, busy, failed/retry, keyboard focus and narrow/long-content behaviour,
where applicable. Mark non-applicable states with a reason; do not manufacture states for coverage.
Keep source evidence distinct from tests executed and runtime observations.

**SO goods-side inspection adoption — BUILT / production verification pending, 2026-10-01:** inspect the
existing Drawer/DialogFrame plus compatible goods renderer for the owner-admitted compact goods
summary door. The line count is not goods quantity. One read-only source, named region, keyboard
activation, close/focus return and narrow behaviour are required. Component presence is not proof
of this adoption; no generic full-object drawer or alternate edit form is admitted.

**Other existing exports are not universal templates.** SearchInput, Badge, StatusPill, Drawer,
Tooltip, Popover, Tabs, Toast and PageShell require inspection of the current adopter before reuse.
DetailShell embeds an OrderActionTrack/four-fact contract and must not be treated as a generic
cross-module object shell. The actual object composition governs.

---

# Names previously requested — implementation status requires inspection

`Alert` · `Banner` · `Skeleton` · `Switch` · `Radio` · `Breadcrumb` ·
`Pagination` · `Number Input` · `Currency Input` · `Side Panel`

This historical candidate list is neither proof of absence nor permission to build. Search the
current shared sources/adopters first. Record READY / REUSE CANDIDATE / COPY REQUIRED / ENGINE GAP /
UNVERIFIED in UI MASTER with evidence; admit a genuinely missing component only through its
governed review. A component missing from this inventory is not automatically missing from code.

### Accepted Sales Orders template — 2026-10-01

The owner-accepted numeric recipe is governed by [UI MASTER, Confirmed shared template](ui/MASTER.md#confirmed-shared-template--owner-acceptance-2026-10-01): search220×32 desktop, rows32 desktop, body12/18, header11/600/36, touch targets40. Reuse the shared kit; runtime delivery proof is recorded by the BUILD controller.

### Accepted template composition — 2026-10-01

Use existing DataGrid, FilterRail, Block, Drawer/DialogFrame, Button, Icon, Tooltip and Badge components under [UI MASTER, Confirmed shared template](ui/MASTER.md#confirmed-shared-template--owner-acceptance-2026-10-01). This acceptance creates no second kit. Square return controls use canonical back icon and kit neutral-control geometry; pills remain status badges. Shared /ui examples and adoption tests are required by the authorised BUILD controller before claiming kit convergence.

Accepted quick-view composition: existing Drawer `variant="quick-view"` owns the dark header and header actions; Block `tone="muted"` supplies the quiet identity section. `/ui` renders these same primitives. Close uses the canonical 32px desktop / 40px touch target. No page-local replacement drawer or card is admitted.

The shared Tabs segmented presentation example uses canonical Table/Cards icons with visible words,16px inheriting colour; accessible names remain Table/Cards. This is the owner-approved2026-10-01 presentation amendment.
