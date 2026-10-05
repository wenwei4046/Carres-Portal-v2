# 01 · DESIGN TOKENS

> **Status: FROZEN.** The visual rules of the Carres Portal.
>
> Law order (`UI_KIT_MASTER`, Loo 2026-07-31):
> **Business Rules → Information Architecture → Golden Template → Design System → Implementation.**
> On a conflict, Business wins and the Design System follows.
>
> **The new Design System is the law; the existing implementation is the DEFAULT,
> not the law** (Loo, 2026-07-31). Values already verified, shipped and frozen are
> carried forward rather than re-decided — refactoring for its own sake is not a
> reason to change a number. A value changes only when Business or Design decides
> it must.

---

## 0 · Governance

These rules moved here from the retired `ui/MASTER.md` §0 because they are about
tokens, not about a page.

**Use tokens only.** Never hardcode a colour, a type size, a spacing value, a
radius, an elevation or a size. Never create a duplicate token.

**A label is presentation; the identifier is the contract.** Renaming what a
thing is CALLED is a copy decision. Renaming the token or the test id is a
breaking change.

**One concern, one file.** A value lives in exactly one of `01` / `02` / `03`.
When a rule is re-decided the old text is DELETED, never annotated
"superseded", never left beside its replacement.

**The machine mirror.** `apps/web/src/components/kit/tokens.ts` is a RECORD of
this file, read by every kit component and by `/ui`. `scripts/check-design-standard.mjs`
scans source against it. A token changed here and not there is a token that
does not exist.

---

## 1 · Typography

Seven tokens. An eighth does not exist and does not compile — each is one
Tailwind `fontSize` entry carrying size + weight + line-height in ONE class, so
an eighth cannot be written without editing the config. The seventh, `control`,
is the owner's Work toolbar ruling of 2026-09-25.

| Token | Class | Size | Weight | Line | Use |
|---|---|---:|---:|---:|---|
| page | `text-page` | 24 | 600 | 32 | page title — max one per page |
| title | `text-title` | 20 | 600 | 28 | section title · KPI hero number |
| strong | `text-strong` | 15 | 600 | 22 | card title · field-group heading |
| body | `text-body` | 13 | 400 | 18 | default — table rows, prose, buttons |
| meta | `text-meta` | 12 | 400 | 16 | secondary info, captions, timestamps |
| label | `text-label` | 11 | 500 | 14 | field labels, micro-labels, pill text |
| control | `text-control` | 14 | 400 | 20 | workspace toolbar controls (Work) — 36px tall, 40px below 768px |

**Weights: 400 · 500 · 600. There is no 700.** Frozen by Jess 2026-07-28 —
600 and 700 were doing the same job at every size. A kit file writing
`font-bold` fails `kit-source.test.ts`.

**Numbers and codes** use `tabular-nums` so a column of figures lines up.
**Dates** are `fmtDate()` and nothing else — a second date spelling is a defect.
It prints `Wed, 12 Aug`, and the year only when it is not the current year
(`Fri, 15 Jan 27`) — THE YEAR RULE, owner ruling 2026-08-15, recorded in
`COPY-STANDARD.md`.

**The two-line action grammar is 13 / 11** — `text-body` semibold over
`text-label` at `font-normal` (owner ruling 2026-08-15). Two tokens one step
apart do not read as two ranks; these two do. The law itself is
`ui/MASTER.md` §5 — this row exists so the ramp above is not read as leaving
the pairing open.

**The History / Revision record grammar is 13 / 12 / 11** — `text-body`
semibold for what happened, `text-meta` for actor + role + actual date/time,
then `text-label` at `font-normal` for the important result or detail (owner
ruling 2026-08-27). The third rank is omitted when there is no detail; the
remaining ranks do not collapse into one sentence. The law itself is in
`ui/MASTER.md`.

---

## 2 · Colour

**Source: `@radix-ui/colors`. No file in this repo maintains a hex table, so
nobody can mistype a digit.** The law names the STEP; Tailwind resolves the hex.

**CompactModuleCard identity Header (owner2026-10-04):** existing slate-12 fill, white primary/countdown, slate-4 secondary text and slate-11 divider/hover. Countdown uses label. Light body tokens remain unchanged; no new token values.

### 2.1 Semantic layer (approved Loo, 2026-07-31)

| Semantic | Step | Use |
|---|---|---|
| `background` | `kit.canvas` (`#F7F8FA`) | page canvas — see the note below |
| `surface` | `white` | card · panel |
| `surface-alt` | `slate-3` | inset · nested surface · table header |
| `surface-expansion` | `slate-2` | the area under an opened register row (ruling R5, 2026-09-16) |
| `border` | `slate-5` | table lines · card edge |
| `divider` | `slate-6` | section split |
| `text-primary` | `slate-12` | primary text |
| `text-secondary` | `slate-11` | secondary text |
| `text-disabled` | `slate-9` | disabled · placeholder · icon at rest |
| `primary` | `blue-9` | the ONE action fill · focus ring |
| `primary-hover` | *not implemented* | token reserved, no consumer yet |
| `primary-active` | *not implemented* | token reserved, no consumer yet |
| `info` | `blue-3` / `blue-11` | selected row · hover tint |
| `success` | `green-3` / `green-11` | |
| `warning` | `amber-3` / `amber-11` | |
| `error` | `red-3` / `red-11` | |

**The canvas is the one step that is not a Radix step.** Jess specified `#F7F8FA` for the page
canvas on 2026-08-02, and `tailwind.config.ts` publishes it as `kit.canvas` with that dated ruling.
This table previously said `slate-3`; that text disagreed with the shipped pixels and is corrected
here without changing any colour. `slate-3` remains the canvas only on pages not yet migrated to
`bg-kit-canvas`. `slate-2` was added on 2026-09-16 (owner ruling R5, SO Batch Purchase) — additive,
no existing step moved.

### 2.1.1 · The Work palette — owner correction 2026-09-24, BUILT (Work page only)

The Work shell and its 104px cards carry six page-scoped steps the owner specified by value. They
live ONLY in `index.css` (`--work-*`) and `tailwind.config.ts` (`colors.work.*`), are used only
under `pages/operation/work/**` and `OperationWork.tsx`, and never replace a kit step elsewhere.

| Token | Value | Use |
|---|---|---|
| `work-line` | `#ccd7e5` | every Work section and card edge (1px) |
| `work-line-hover` | `#aebfd3` | a card's hovered edge |
| `work-ink` | `#17243a` | card fact and date numerals |
| `work-slate` | `#40516a` | card module · party line |
| `work-muted` | `#66758b` | card weekday and quiet text |
| `work-tabs` | `#e9eef5` | the `To do · Waiting · Completed` tab track |
| `work-missed-*` | fill / line / ink | the `Missed` date badge |

`primary-hover` and `primary-active` are reserved on purpose: the token exists,
the implementation is not required until something needs it.

### 2.2 The four jobs colour may do

Action · selection · status · alert. **Nothing else.** Decoration by hue is not
a job. Blue appears ONCE on a screen — on the primary button.

### 2.3 Hover and selection

**Ruled by Loo, 2026-08-03**, settling a live conflict between this section
(which said a row hovers blue and "never grey") and his own 2026-07-30 accent
law (blue marks the current thing and the primary action, and nothing else).
Both were half right; the missing sentence is the division of labour.

| | Fill | Why |
|---|---|---|
| **hover** | **grey** (`slate-3`) | "the mouse is here" — true for one second, carries no meaning, and must not spend the accent |
| **selection** | **blue** (`blue-3`) | "this row is in the batch" — a lasting state with a consequence |

So **blue marks exactly two things on any screen: the primary action and the
current selection.** An accent that marks four things marks nothing.

GitHub, SAP Fiori and Excel all split it this way.

**Enforced, not remembered.** The hover fill is ONE CSS variable
(`--hover-tint`), so 88 of the portal's 99 hovers move together; the remaining
literals were swept the same day and `UiShowcase.test.tsx` pins the Button's
own declaration, so a drift back to blue fails the suite.

---

## 3 · Spacing

**Eight steps. Frozen by Jess, 2026-07-28.**

| px | Tailwind | Use |
|---:|---|---|
| 2 | `0.5` | hairline nudge (pill y-padding) |
| 4 | `1` | touching |
| 6 | `1.5` | icon-to-text gap — most used |
| 8 | `2` | inside a control |
| 12 | `3` | standard gap |
| 16 | `4` | dense card padding · table cell x-pad |
| 24 | `6` | between blocks · card padding |
| 32 | `8` | between major regions |

---

## 4 · Radius

| px | Class | Use |
|---:|---|---|
| 4 | `rounded-pill` | **checkbox** |
| 6 | `rounded-control` | button · input · dropdown |
| 9 | `rounded-work` | the Work page's sections and 104px cards only (owner correction 2026-09-24; density 2026-09-25) |
| 10 | `rounded-card` | card · panel · modal · drawer |
| — | `rounded-full` | **pill · small tag** · avatar · status dot |

### 4.1 · A pill is a capsule — re-ruled by the owner, 2026-08-15

**A `pill` at 4px is a rounded rectangle.** The word already named the shape and
the number contradicted it, and the contradiction was visible on one screen:
search and the pill toolbar buttons have been **fully rounded since Jess ruled
the capsule language on 2026-08-01**, so a `StatusPill` sitting beside them read
as a different family of object. Pills and small tags now join `rounded-full`,
which is the language the portal already speaks.

**The checkbox keeps 4px, and the 4px row is now honest about it.** That row
used to claim three uses and only one of them was true; a fully rounded 16px
checkbox is a radio button, which is a different control with a different
meaning. It is the ONE thing the value exists for, so it is the only thing the
row names.

**`rounded-pill` KEEPS ITS NAME.** §0: a label is presentation, an identifier is
a contract. Renaming the class would be a breaking change across the Tailwind
config, `kit/tokens.ts` and the source scan, for no gain — the row's USE column
is the law, not its historical spelling.

**Measured 2026-08-15: 18 sites.** 14 became capsules; `Checkbox.tsx` (2) and
the `tokens.ts` record itself (1) are excluded by the ruling, and one is this
file's own prose. **Shape cannot be proved by checksum** — the PR that lands a
radius change carries before/after screenshots.

---

## 5 · Border · Elevation · Motion

| | |
|---|---|
| border-default | 1px |
| border-focus | 2px |
| elevation | page · card · overlay · dialog — one ladder, no free z-index |
| motion-fast | 150ms |
| motion-normal | 200ms |
| motion-slow | 300ms |

### 5.1 A data grid carries column separators

**Ruled by Loo, 2026-08-05** (card P17), from two photographs of the live page
taken seconds apart on the same data. Before it, **every cell in all four
Purchasing grids measured `border-right: 0px`** — rows had a hairline, the head
had one, and the table had no vertical rule anywhere.

| | |
|---|---|
| **column separator** | **`border` (`slate-5`), 1px, on a cell's RIGHT** |

**It is the same token as the row hairline, and that is the rule, not a
coincidence.** §2.1 gives `border` = `slate-5` the use *"table lines · card
edge"*; a column separator is a table line. A column line and a row line are
one line turned ninety degrees, so they are one value.

**Not `divider` (`slate-6`).** That is *"section split"* and it is right where
the HEAD stops and the data starts — the head's bottom edge keeps it. A column
line drawn in it would change colour at the header and read as two lines.

**They are structure, not content: never dark enough to compete with the text.**

**WHEN THE LINE IS DRAWN AT ALL — owner ruling 2026-09-27 (Jess), checked against international
guidance first.** A column separator is for a table where the eye has to track a column across many
or look-alike neighbours; a short table of distinct columns reads better without one (NN/g and
Carbon: separators are optional, keep them where columns are many or adjacent content is similar,
1px light grey; Material: none, column padding and row hover instead).

| Table | Column separators |
|---|---|
| a Register or grid of **7 or more columns**, or with adjacent same-kind columns (`Proceed Date · SO Doc Date`, `PO No · DO No`) | **yes** — 1px `slate-5` on the right, as ruled above (Sales Orders, Purchase Orders, Delivery Monitor, Receiving …) |
| a table of **6 or fewer columns**, or one whose columns are numbers under distinct words | **no** — row hairlines only (Monthly demand, totals tables, Dashboard tables, the SO Items and Payment tables) |

The value never changes; only whether it is drawn. `DataGrid` takes the choice from its column count
by default (`columnRules="auto"`), and a page states an exception in its own MASTER.

**Four rules about where it stops.**

- **The last cell in a row never carries one.** It would sit 1px inside the
  table's own wrapper border and read as a 2px edge.
- **A control gutter is ONE gutter and pays for no line.** The disclosure and
  checkbox columns are sized to their contents EXACTLY (§7: `8+16+8 = 32` and
  `2+8+24+8 = 42`), so a border on either shaves the control it holds — measured
  live, a 16px checkbox overflowed a 15px box and was clipped. The gutter's
  boundary is therefore drawn as the FIRST DATA column's LEFT border: the same
  pixel, paid for by a column with room. There is no rule *between* the two
  control columns — they are one gutter, not two facts.
- **A full-width band is never sliced** — a group header, an expanded record or
  an empty state is ONE statement spanning the width, and a rule through it
  cuts a sentence. It is anchored by the ruled columns beneath it, which is
  what it lacked.
- **Trailing whitespace is bounded, never latticed.** The last real column
  rules its own right edge so the empty region reads as closed; it is not
  filled with further lines, because §8's trailing whitespace says *this page
  holds these business facts and no more*, and fake rules would say more
  columns are coming.

**Enforced, not remembered.** The value is typed once, in `DataTable`'s
`COLUMN_RULE`/`GUTTER_RULE`, and `grid-powers.test.tsx` fails if a grid renders without it.

---

## 6 · Icons

**Lucide, stroke 2** (Lucide's own default; frozen by Jess 2026-07-28 —
`Icon` has no `strokeWidth` prop, so this is the only stroke the portal can draw).

**Three sizes: 14 · 16 · 18.**

**One meaning, one glyph.** The 46 registered meanings are the `IconName` union
in `apps/web/src/components/kit/Icon.tsx`; a name outside it does not compile.
These include the original 40, mattress/bedframe/sofa, columnFilter, and the
compact product-line card's pillow/protector. Stroke and size tokens are unchanged.
Validated 2026-07-31: the kebab is `overflow`, and `more` does not exist.

---

## 7 · Canonical component measurements — scoped, not one size for every surface

**Documentation reconciliation, 2026-10-01. No application change.** This section replaces the
obsolete generic sizing/layout tables. It records the current shared recipes and later scoped
rulings; it does not approve every implementation difference. Values are CSS pixels unless noted.
`KEEP` below means retain the stated admitted recipe in its scope, not production verification.
A proposed value is **PROPOSAL / NOT LAW** until reviewed. Source inspection does not prove that a
font loaded, a control is accessible, or a page rendered correctly.

**Source basis:** application files in the inspected checkout, compared with main
`36e2840dd8dcce6eeb77252417ab57febbd6848d` for the previously recorded shared-source scope.
Paths below are relative to `apps/web/src/` except `tailwind.config.ts`, under `apps/web/`.
Reported Sales pilot runtime evidence is separately identified; its changes are not assumed merged.
Houzs measurements are research provenance (`docs/research/houzs-ui-reference.md`), never the instruction for Carres values.

### 7.1 Type, spacing, colour and icons

| Item | Current Carres value / source | Exact recommended target | Status / evidence |
|---|---|---|---|
| Latin UI family | Inter → DM Sans → system-ui → sans-serif; `tailwind.config.ts` sans/display/body | KEEP Inter; no imported Houzs display face | Owner confirmed Inter; actual loaded face still needs runtime verification |
| Mixed Chinese text | Noto Sans SC → DM Sans → system-ui → sans-serif; config + `lib/cjk.ts` | KEEP scoped CJK fallback | Source present; do not claim all glyphs rendered in Inter |
| Type ramp | §1: page 24/600/32; title 20/600/28; strong 15/600/22; body 13/400/18; meta 12/400/16; label 11/500/14; control 14/400/20 (size/weight/line) | KEEP all seven; scoped table header 11/600/14 | Approved ramp; source matches. See table-header conflict below |
| Letter spacing / number alignment | Ordinary type has no extra tracking; numeric roles use tabular figures | 0 additional tracking for ordinary body/control text; tabular numbers, amounts right aligned | KEEP; no blanket adoption of Houzs uppercase tracking |
| Spacing scale | §3: 2, 4, 6, 8, 12, 16, 24, 32 | KEEP; select by recipe below | Approved; not permission to mix arbitrary gaps per page |
| Borders / focus / radius / icons | §§4–6: border 1, focus 2; radius 4/6/10/full plus scoped Work 9; Lucide stroke 2, sizes 14/16/18 | KEEP; control 6, Block 10, status full | Approved; no second icon set or imported palette |
| Colours | §2 named Carres palette and state roles | KEEP §2 values; source and target use same names | No new colour approval in this reconciliation |

### 7.2 Controls and field groups

| Item | Current Carres value / source | Exact recommended target | Status / evidence |
|---|---|---|---|
| Button small | `kit/Button.tsx`: height 24, horizontal pad 8, gap 4, icon 14 | KEEP desktop compact recipe | Implemented/source inspected; not a 40px touch target |
| Button medium | Same: height 32, horizontal pad 12, gap 8, icon 16 | KEEP standard desktop recipe | Implemented/source inspected |
| Touch / Work toolbar button | Same: height 40 below viewport 768, 36 at ≥768; horizontal pad 12, gap 6, icon 14 | KEEP admitted scoped recipe; retain ≥40 touch hit target where needed | Approved scoped recipe; touch interaction needs actual verification |
| Register toolbar overflow trigger | Existing admitted Button/Icon recipes; new fixed-right adoption not yet verified | Desktop32×32; touch hit target≥40×40; registered overflow icon16/stroke2, control radius6, focus2; centred icon | Owner-approved target2026-10-01. Existing icon/radius/focus tokens retained; no new toolbar height approval |
| Single-line input | `kit/field-recipe.ts`: height 32, horizontal pad 8, body 13/400/18, border 1, radius 6 | KEEP | Implemented/source inspected; remove generic 32/40/48 size assumption |
| Search / toolbar field | Same: pill search height 32, horizontal pad 16; toolbar field 40 below768/36 at≥768, horizontal pad12, type14/400/20 | KEEP distinct admitted uses | Implemented/source inspected; no arbitrary per-page search size |
| Compact Register search | Existing shared search control; scoped owner ruling2026-10-01 | Desktop preferred width220, height32, Inter12/400/18, icon16, radius6/border1; shrink within constrained space without clipping; touch control/hit target≥40 | OWNER ACCEPTED / production verification pending. Applies to the Sales-first Register template, not automatic replacement of every search variant. Icon/text gap retains existing admitted recipe; no new spacing token |
| Textarea | Same: horizontal pad8, vertical pad4, body13/400/18; content-driven height | KEEP; never invent fixed universal multiline height | Source inspected; form supplies content/rows |
| Label / hint / error | `kit/FieldFrame.tsx`: label11/500/14; vertical field gap4; hint12/400/16; error13/400/18 with icon/text gap6 | KEEP | Source inspected; message wraps and increases height, never clipped to one line |
| Status pill / neutral badge | `kit/StatusPill.tsx`, `Badge.tsx`: horizontal pad8, vertical pad4, label11/500/14, full radius; solid semantic step11 fill, white text, no icon (owner confirmed 2026-10-02) | KEEP; natural one-line height22, not universal24 | Derived from source, not fresh runtime measurement; long status must remain discoverable |

### 7.3 Register filter rail

| Item | Current Carres value / source | Exact recommended target | Status / evidence |
|---|---|---|---|
| Rail width | `operation/components/workspace-rail.tsx`:240 | KEEP240 for FilterRail family | Governed family; Sales pilot reports runtime240. Not global navigation width |
| Rail inset / scroll | Horizontal12, bottom12; fixed header pad12 when present; remaining body vertically scrolls | KEEP | Source inspected |
| Group / header | Group vertical8, separator1; group header minimum36, horizontal6, gap8; body top4, child gap2 | KEEP | Source inspected |
| Filter row | Minimum36; horizontal8, vertical9, gap8; body13/400/18 | KEEP; two-line label naturally54 before any supporting line | Source arithmetic; minimum is not a clipping height |
| Count / selection | Count nonshrinking on right, tabular, 12px with18 line height for factual rows; selected label600 and2px left rule; scoped workspace marker3 | KEEP respective variants | Source inspected; do not recolour every selected filter as a record selection |
| Collapse control |28×28, inset8; current source | PROPOSAL: retain desktop geometry; ensure40×40 touch hit area on touch surface | Accessibility gap, not approved geometry change |
| Narrow canvas | Below896 **available canvas** pixels floats; absent saved preference starts closed | KEEP896 rule, retain chosen filters | Approved responsive contract; browser viewport is not canvas width |

### 7.4 Register and goods tables

| Item | Current Carres value / source | Exact recommended target | Status / evidence |
|---|---|---|---|
| Sales main row | `SalesOrdersRegister.tsx` explicitly `rowHeight=32` | Accepted SO-derived32px desktop,12/18 text | Owner accepted 2026-10-01; UI MASTER §6.0 rule 5 supersedes the older 40px Sales recipe |
| Generic reference / Purchasing parent | `register/DataGrid.module.css` baseline38; UI MASTER §6.5 density minimum38 | KEEP38 in that scope | Approved scoped exception; not a Sales size |
| Two-line goods | UI MASTER §6.8 owner ruling 2026-09-26: 51; name13/18 plus secondary11/14 | KEEP51 across the same goods table; grow consistently when required by admitted content | Approved shared baseline; not a licence to clip meaningful quantities |
| Reference table header | CSS height36, horizontal8, line14, size11, **weight700**; UI MASTER says600 | Target36 minimum,11/600/14; horizontal8, up to two lines with vertical4 | REAL GAP: weight700 source contradicts governed600; no code changed here |
| Checkbox | Shared goods-table geometry (UI MASTER §6.8): 16×16, vertically centred | KEEP16 visible control; apply touch hit-target requirement separately | Approved geometry; icon size is not hit-target size |
| Cell inset / rules | Reference DataGrid horizontal8, vertical0; goods family ordinarily8 per side; separator1 | KEEP by row recipe; apply §5.1 separator conditions | Source inspected; do not add padding that silently grows the governed row |
| Goods header exception | `GoodsMiniTable.tsx`: normal horizontal8/vertical6; Purchasing layout explicitly40 high | KEEP existing scoped Purchasing40 header pending joined-table alignment review | Implemented/source inspected; not universal36 claim |
| Toolbar / footer | Reference DataGrid45 toolbar (vertical6/horizontal12); footer32 (horizontal12); labelled toolbar wraps with auto height | Accepted SO-derived desktop40px toolbar; other scoped variants retained; footer remains outside row scroll | Source inspected; actual overflow still requires page verification |
| Expansion | Shared Purchasing target top12/bottom16; DataGrid generic nonflush inset12 vertically; flush0 | Preserve named adopter recipe; converge discrepancies only in approved scope | REAL GAP where an adopter claims Purchasing geometry but uses generic inset; not universal spacing override |
| Column widths | Governed field-width registry (UI MASTER §6.11); sort/filter controls require space | Keep registry widths and page-specific approved roles; do not divide screen equally | Width depends on fact, not table width; personal column state survives |
| Scroll | DataGrid owns table viewport; content width may exceed available canvas | KEEP bounded horizontal/vertical scroll and admitted pinned identity | No promise all14 columns fit one page; no shrinking text to force fit |
| Accepted Sales density | Sales32 / goods51 | **OWNER ACCEPTED:** main32, header36; goods51 retained | UI MASTER §6.0; numbers §7.5; verify Inter/long content/control fit and 200% zoom review |

### 7.5 Accepted SO-derived template — measurement lookup

**Owner accepted 2026-10-01 (UI MASTER §6.0); source audit 2026-10-02.** These values supersede older
conflicting generic register density values for the SO-derived template (Sales Orders, SO Batch,
Purchase Orders) and are moved here from UI MASTER on 2026-10-05 so numbers have one home. Sizes not
listed come from §§1–7.4 or the component source; absence is not permission to invent a number.
Module-owned column widths stay content-measured (UI MASTER §6.11). Source inspection is not proof
that every module renders them.

**Composition summary:** count/summary left; Search 220×32 desktop + Table/Cards + 32×32 Page tools
aligned right. Toolbar 40px desktop, touch controls 40px. Rail 240px; slate-2 canvas, white rail
cards with slate-6 border, radius 6, gap 8; slate-3 headings 36px over white expanded bodies; chosen
values visible when closed. Rows 32px desktop, body 12/18, header 11/600/36, horizontal cell padding 8;
touch targets 40px. Table/Cards uses the shared segmented `Tabs` with canonical icon 16 plus visible
words: outer 32px, border 1 / padding 2 / option 26, radius 6; option 13/18, horizontal padding 10,
selected blue-3 / blue-11 / 600; outer 40px touch.

| Element | Accepted measurement / behavior |
|---|---|
| Register search | Desktop 220px wide × 32px high; responsive width follows shared DataGrid |
| Desktop results | Row32px; body12px /18px line height; header11px, weight600, height36px; horizontal cell padding8px |
| Register toolbar | Desktop40px; responsive wrapping may increase height |
| Active filters | Minimum36px row; chips24px; padding6px vertical /12px horizontal; gap8px before toolbar; omitted when empty |
| Canonical action/control icons |16px; use kit Icon registry and supported sizes, not independently drawn glyphs |
| Back/Close controls |32px desktop /40px touch; canonical neutral control geometry |
| Local rail breakpoint |896px available content canvas, after shell rails; not viewport width |
| Collapsed local rail |44px Show filters control; full open composition uses source `.so-template-rail` |
| SO summary |Four visible rows;8px row gap; label left, value right, tabular/no-wrap; conditional source notices |
| Object tab selection/divider |Weight600 black, blue underline;1px slate-5 divider; white identity row /slate-2 tab row |
| Quick-view facts |Labels12px; values weight600; use Drawer/Block source for width, padding and responsive stacking |
| Carres official mark |Expanded36px, collapsed28px; preserve original asset proportions |

**Detailed composition — source recipes (2026-10-02).** Shared token radii: control 6px, card 10px. `text-strong` is 15px/22px, weight 600.

| Surface / element | Exact source recipe | Design and responsive rule |
|---|---|---|
| Block card | `kit/Block.tsx`: horizontal padding16px, vertical12px; border1px; radius10px | White default, slate-3 muted identity; black15/22/600 heading; slate-5 border/divider |
| Block heading | Bottom padding8px; header horizontal gap12px /vertical4px; body margin-top12px | Header wraps; read-only navigation may use headerSlot; writing actions stay with their facts |
| Quick-view drawer | `kit/DialogFrame.tsx` + Tailwind `max-w-drawer`: width100%, maximum560px, full height | At desktop>=768 right offset64px preserves right rail; below768 uses side-frame right0 |
| Drawer header/body | Header padding16px horizontal /12px vertical; title/actions gap16px; actions gap8px; body padding16px | Quick view dark slate-12/white; title truncates with full tooltip; below768 header wraps into identity/actions rows with8px gap |
| Quick-view content | Register composition: cards gap12px; fact grid2columns, gap12px; labels12px, value600, value margin-top4px | Contact facts first; no duplicate customer card; no footer; body owns vertical scrolling |
| Button default | `kit/Button.tsx`: desktop>=768 height32px; phone40px; horizontal padding12px; gap8px; icon16px | Shared primary/secondary/ghost variants; no local className/style overrides |
| Icon-only button | Desktop32×32px; below76840×40px; padding0 | Tooltip and accessible name required; icon alone never removes keyboard access |
| Button specialised sizes | `sm`: height24px, padding8px, gap4px; `touch`: desktop36px/phone40px, padding12px, gap6px; sm/touch icon14px | Supported API variants only; small size is not the default for phone actions |
| FieldFrame | Label/control vertical gap4px | Shared label, required/error/hint semantics; do not hand-roll field wrappers |
| Single-line field | `kit/field-recipe.ts`: height32px, horizontal padding8px, border1px, radius6px | White/rest slate-5; focus blue-9 ring2px; disabled slate-3/slate-9; error border red-9 |
| Read-only framed fact | Workspace FullFact: minimum32px, padding8px horizontal /4px vertical, natural wrapping | Read-only is not disabled editing; automatic fact may use slate-3; preserve module ownership |
| Multi-line field | Padding8px horizontal /4px vertical; natural content height | Same control skin; do not force all multiline facts to32px |
| Toolbar field | Height36px at>=768,40px below; padding12px; text14/20 | Use supported toolbar shape, distinct from compact register search |
| Object identity/actions row | `SalesOrderTabs.tsx`: desktop44px; horizontal padding24px at>=768 /16px below; gap12px | Fixed outside content scroll; shared CSS wraps at available container<=1023px; wrapped row height is natural, not a fixed44px |
| Object tab row | Height36px, horizontal padding24px desktop /16px below768; top divider1px slate-5 | Slate-2 surface; horizontal overflow belongs to tab row; selected600 black with blue underline |
| Object panes (SO reference) | Workspace form minimum660px, PDF minimum320px | Available host>=1320: equal halves;980–1319:660px form plus remainder PDF; below980: stack form then PDF; these are SO source values, not universal module pane minimums |
| Object pane padding/gaps | Each pane16px padding; quick-view/card fact gaps12px | Side-by-side panes scroll independently; stacked view uses outer natural scroll; Items has no nested vertical scroll |
| Rail fixed navigation | `index.css`: padding8px vertical /12px horizontal; stacked tabs gap4px; tabs height36px, horizontal padding8px, radius6px | SO accepted stacked views; selected blue-3/blue-11/600; below768 minimum40px targets |
| Rail filter group | Margin4px vertical; border1px slate-6; radius6px; white body | Slate-3 header, slate-4 hover; expanded header bottom divider1px; header minimum36px/phone40px |
| Rail group body/rows | Body padding4px top/bottom,8px right,16px left; rows minimum32px, padding7px vertical; text12/18 | Phone minimum40px; chosen rows blue-3/blue-11; long text may increase height rather than clip |
| Table/Cards segmented switch | Shared CSS: outer padding2px/gap2px/border1px/radius6px; tab height26px desktop /34px phone, padding10px horizontal, radius4px, text13/18 | Selected600 blue-11 on blue-3; both labels and16px icons remain visible; surrounding hit targets must retain accepted touch behavior |

### 7.6 Compact module card — CompactModuleCard

**Moved here from UI MASTER §4.3 on 2026-10-05 so numbers have one home.** The card's rules live in
[`ui-reference/MODULE-CARD-TEMPLATE.md`](ui-reference/MODULE-CARD-TEMPLATE.md); its law in UI MASTER §4.3.
The embedded `Sales Order` tab presentation's measured numbers join this section when its build merges.

**Scope and authority:** this table describes the existing shared compact card, not every full-page table or the whole kit. CSS px throughout; padding is vertical × horizontal unless otherwise stated. Source is `apps/web/src/components/kit/compact-card.module.css`, plus `DeliveryBrief.tsx`, `field-recipe.ts`, `PdfPreview.tsx` and `DialogFrame.tsx`. These are implementation measurements, not new independently editable token definitions. Canonical tokens remain in01; update source and this lookup together. Do not copy these values into a page-local stylesheet.

**Evidence key:** **Live** means measured on real SO-1368 after production2ce91e2d. **Source** means inspected current final cascade, not a fresh browser measurement. **Pending reference value** means implemented for fidelity but still subject to the existing token decision; recording it does not approve it globally. Natural content decides height; do not reserve four lines or freeze card/editor/section height.

| Element | Current measurement and relationship | Basis |
|---|---|---|
| Card container |100% of available width, maximum560px; inline-size container queries | Source; live560/440/416/396/366 |
| Outer card | Border1px; overflow hidden; natural height | Source |
| Card radius/font | Outer radius8px; system-ui; base13px/1.4 (18.2px line height); normal weight400 | Pending reference value |
| Reference control/inner-box radius | Native reference controls4px; summary/editor/menu boxes6px; kit controls retain canonical6px | Pending reference value versus canonical field recipe |
| General card glyph |16×16px, stroke1.7; contact glyph12×12px; address glyph stroke1.6 | Source; reference glyph decision remains pending |
| Header | Minimum56px, natural growth; padding6×12px; columns `minmax(0,1fr) auto auto 64px`; gap8px, vertically centred | Source |
| Identity layout | Text plus24px toggle column; row gap2px, column gap6px; right divider1px and8px inset | Source |
| Customer name |14px/18px, weight700; wrap long words; title-group gap10px | Source; card font/weight fidelity exception |
| Order/phone |11px; flex wrapping contact group gap4px; phone icon+number stays one wrapping unit, internal gap4px | Source |
| Sales chevron |24×32px; lower-right of identity; font12px, chevron11px/1; margin-bottom−7px; no visible label | Source |
| Address trigger column |38px high,6px right inset,1px right divider; bottom aligned; trigger11px/18px with4px icon/text gap | Source |
| Target date column |38px high; vertical gap2px, right inset8px/divider1px; date13px, icon gap5px, no wrapping | Source |
| Countdown | Canonical label11px/500/14px; white on dark Header, no badge fill; existing0×5px inset | Source; visible26d live5Oct |
| Header Open/Close |32×32px each; text-arrow/×18px; action column64px above460px | Source |
| Header colours | slate-12 background, white primary/countdown, slate-4 contacts, slate-11 dividers/hover; white2px focus outline with−2px offset | Approved source tokens |
| Sales-fact disclosure | Padding10×12px; SO grid1fr/1fr/1.55fr/0.75fr (two equal columns at≤440px); gap12px;1px top rule; label11px, value12px/17px weight500; label/value gap4px | Source |
| Address disclosure | Padding8×12px; type12px;1px top rule; full-address icon gap6px; address left/access right200px, column gap12px; access group vertical gap4px, no top margin; stack at≤440px; fact internal gap5px | Source |
| Module navigation | Horizontal inset10px;1px top/bottom rules; tabs12px with8×7px padding; selected underline2px, weight600 | Source |
| Navigation disclosure icons |32×32px, padding8px; icon16px; active soft background/brand colour | Source |
| Body | Padding10px; white surface | Source |
| Summary strip | Equal columns based on actual1/2/3/4 facts, no column gap; border1px, radius6px; bottom margin8px | Source |
| Summary cell | Padding8px; natural height; right dividers1px except last; title row16px then natural value, gap4px, top/left aligned | Source |
| Summary type | Title11px/16px; main value12px/18px weight700; optional status11px/16px weight400 with4px top margin; Info value13px above400px | Source |
| Summary disclosure | Chevron at right of title row; active cell bottom inset accent2px; main value maximum4 lines, never4 reserved rows | Source |
| Inline editor | Padding10px; soft surface, radius6px, bottom margin8px; natural height | Source |
| Editor labels/error | Labels11px; reference margin7px top/3px bottom, compact kit labels margin0; error12px/16px with8px top margin | Source; error colour retains existing pending review |
| Native reference field | Type12px; padding7px, border1px, reference radius4px; default textarea minimum90px | Source, distinct from embedded kit fields |
| Canonical embedded field recipe | Single line32px, sides8px/radius6px, solid1px slate-5 border; focus blue-9 ring2px; multiline sides8px/top-bottom4px | Source field-recipe; see actual cascade below |
| Actual Select/DatePicker in card |32px high, padding0×8px, radius6px, solid1px slate-5; Select13px/18px, inherited system-ui | Live Select; DatePicker recipe/source and border live |
| Actual ETA Input/condo Textarea | `.panel input/textarea` still overrides recipe:12px system-ui, padding7px all sides, radius4px, border1px card-line. ETA32px; condo48px minimum | Live; recorded source-cascade discrepancy, not a canonical token change |
| Customer grid | Two equal columns, gap8px above400px card width; one column at400px or below; outer form stack gap12px | Source; five widths live |
| Logistics grid | Driver/vehicle two equal columns, gap12px; outer form stack gap12px; ETA full width; source/proof retained | Source; controls live within bounds |
| Compact condo textarea | Two rows, minimum48px; grows with content; omit long hint | Source; empty48px live |
| Editor actions | Cancel then Save, right aligned; gap6px, top margin10px; minimum32px, type12px, padding6×10px | Source; live visible through366px |
| DO checklist | Single column; one condition per line; grid gap4px vertical/12px horizontal, top margin8px; line internal gap8px; type12px, indicator16px | Source; live read-only conditions |
| Compact generic items |100% width, fixed layout, separate borders/spacing0; cells6px; header11px/500, body12px; bottom rules1px, none after last row | Source |
| Generic item column hints | Source first55%, second10%, third38%; these are CSS hints, not additive exact pixel widths (total103%). Do not reuse them as a full-page table-width contract | Source; retained fidelity limitation |
| Info goods table |100% width, auto table layout; cells7×6px; header11px/500, body13px; first body cell50%; numeric cells right/no-wrap; row rules1px; config11px | Source |
| Communication/Timeline section | Top rule1px; section padding10px; head padding8×10px, margin−10px sides/top and10px bottom; header/body natural height | Source |
| Section title |14px, inherited1.4 line height, weight700 | Source; reference fidelity, not global Block title token |
| Channel select |112×32px; padding4×8px, type12px;1px border, native radius4px | Source |
| To/Subject row | Label column48px + flexible field, gap8px; row margin8px vertical; label11px; input32px high | Source |
| Message toolbar | Internal gap8px; margin8px top/4px bottom; menu trigger32×32px | Source |
| Message input |80px high/minimum, vertically resizable, full width | Source |
| Template menu |190px wide,4px inset, top36px, right0; border1px/radius6px; shadow0 3px 12px black13%; menu rows8px inset,12px type | Source |
| Template picker/manager | Picker padding8px/bottom margin8px; manager padding10px/top margin8px;1px border/radius6px; template rows6px vertical, gap8px | Source |
| Naming dialog | `min(320px,100vw−32px)`; padding12px; border1px/radius8px; backdrop rgb(20,30,40)/25%; actions top margin12px | Source |
| Attachment evidence | Trigger32×32px/border1px; row gap6px/margin8px vertical; chips11px, padding4×6px, gap6px, native radius4px, wrap within card | Source |
| Timeline event | Padding8px vertical, gap8px, type12px; subsequent events top rule1px | Source |
| Actor avatar |28×28px circle;1px border; initial11px/600; actor name accessible, no repeated visible name | Source; live |
| Event metadata/result | Metadata/time11px, gap8px; title12px; time no-wrap, full instant retained; result12px, top margin2px | Source; live recorded time without MYT |
| Compact Drawer | No second visible container header; body0 inset with vertical scrolling; card owns visible identity/Close; Drawer owns focus/Escape/backdrop/return | Source |
| PDF title/action header | Gap8px, bottom margin8px; flexible wrapped title13px/18px weight600; actions shrink0/gap8px; Close uses existing icon-only Button32×32px at viewport≥768px and40×40px below768px (iconOnly overrides small-button height); Button requests14px icon, while the enclosing card SVG cascade is16px | Source, distinct from32px card Header × |
| PDF zoom/render region | Controls on next row, gap8px/bottom margin8px; PDF pane flexes/scrolls. Paper height depends on actual document and zoom, no card-local fixed height | Source |
| Full-page continuation | Use existing Block/DocumentTable/TotalsSummary/field recipes (UI MASTER §3 table recipes and §7.5 above); Slip uses the existing inline link-button with16px attachment icon,6px icon/text gap,13px/18px body text/weight500; not a new input or card | Source; Orders owns business grouping |

**Responsive rules — actual card width, not viewport width:**

| Width condition | Existing change |
|---|---|
| Card≤460px | Header inset6×8px, gap5px; columns `minmax(0,1fr) 28px auto 60px`; hide only the address-place word on its icon trigger; order text10px; title gaps2px/6px; sales-fact horizontal inset8px |
| Card≤420px | Reference arrange split becomes one column; original-date divider becomes bottom rule with8px bottom inset; event metadata wraps; sales-fact columns1fr/1.4fr/0.65fr, gap8px; Info items cells7×3px/type11px |
| Card≤400px | Four-fact strip becomes2×2; right divider removed from second cell; three-fact Info strip remains three columns; Info value12px/title11px; compact Customer fields one column |
| Five verified card widths |560/440/416/396/366px; actual dimensions checked. Do not equate them to identical viewport sizes in a Drawer or reference page |

**Recorded field-cascade limitation:** excluding `data-kit` from border/button resets restores Select/DatePicker skin, but the existing `.panel input/select/textarea` rule still overrides font, padding, radius and border colour of native Input/Textarea. Do not claim all fields already use canonical skin unchanged; the actual dimensions above are the current implementation. This documentation commission does not authorise another visual change. Keep this discrepancy visible for a governed source correction rather than silently copying it to another module.

**Surface values still awaiting the existing token decision:** source CSS variables are background#f3f5f7, surface#fff, soft#f0f3f6, ink#202631, muted#596370, line#d8dde5, brand#006ac2, select-line#d5dce6, select-ink#172033, missing#64748b, disabled-fill#e8ebef, info-muted#536175, table-head#f1f3f5, toggle-hover#e7edf4, error#ce2c31. These describe the reference-fidelity block only; the approved dark Header and embedded kit field tokens override it in their own scopes. Do not spread these literals to another page or claim the pending full-card token conversion has been approved.

**Height evidence:** `docs/ui-reference/module-card-measurements.json` records the historical25-state×5-width reference parity run at viewport height900px. Its card/section heights and reference source hash are evidence of that run, not fixed heights for the current card, current business editors or current copy. The real production editor acceptance above records controls and layout; long names, wrapped values, errors/evidence and open sections can increase height. Never recreate a fixed total height from a screenshot.

## 8 · Composition, overlays and responsive measurements

There is no global rule that every page has32px padding, a1280px maximum, a200px rail or a420px
side panel. Use the admitted shell/component's scope. The legacy `kit/PageShell` has its own
24px padding and height-budget contract; this does not override the operation shell. Do not
change global navigation, its collapse width or the top bar from a warehouse/register proposal.
Their actual shell adoption must be measured before a new numeric target is admitted.

### 8.1 Cards and detail groups

| Item | Current Carres value / source | Exact recommended target | Status / evidence |
|---|---|---|---|
| Shared Block | `kit/Block.tsx`: horizontal16/vertical12, radius10, border1; white | KEEP | Approved shared card; source inspected |
| Card title / grouping | strong15/600/22; header bottom pad8/divider1; body top12/group gap12; subtitle top4/meta12/400/16 | KEEP | Source inspected; title is a card heading, not page24 heading |
| Cards grid | New Sales pilot reports gap12 and container pad12 | PROPOSAL: gap12/pad12, minimum useful card width320; available inner width≥984 three columns,≥652 two, below652 one | Composition target pending sample review; thresholds calculated as columns×320 + gaps, not device breakpoints |
| Card width / height | Sales BUILD reports426×214 at1440×1000 with72 synthetic records | Width fluid in grid; height auto; no fixed426×214 token | Reported runtime outcome only; not independently re-run here or production-verified |
| Card facts | Pilot reports label11/500/14, value13/400/18; title15/600/22 | KEEP type ramp; fields wrap, quantity/status retain identifiable labels | Reported pilot measurement; same records/filter population as Table required |

### 8.2 Modal and admitted goods side inspection

| Item | Current Carres value / source | Exact recommended target | Status / evidence |
|---|---|---|---|
| Centred widths | Config `modal512`, `modal-wide600`, `modal-viewer880`; UI MASTER §3 centred surface ruling | KEEP three named widths, capped at viewport width; max height85vh | Approved; no caller-chosen fourth width |
| Drawer width / height | Config560; DialogFrame width100% capped560, full viewport height, leading radius10 | KEEP `min(560px, viewport width)`; content height never fixes drawer height | Existing component; Sales pilot reports560 at1440. Scoped goods use approved; not general full-order drawer admission |
| Header | `kit/DialogFrame.tsx`: horizontal16/vertical12, gap16, divider1; title15/600/22, description12/400/16 separated4 | KEEP; natural header height, no fixed Houzs60 | Source inspected; long heading allowed |
| Body / footer | Body pad16, flex remaining space, vertical scroll; footer horizontal16/vertical12, gap8, divider1 | KEEP; optional footer absent means0 footer band | Source inspected; header/footer stay outside body scroll |
| Close | Icon16 + pad4 each side =24 visible target; focus ring2 | PROPOSAL: ≥40 touch hit area; retain clear Close label and focus return | Source gap against touch law; source focus handling present, runtime needs verification |
| Goods summary | Compact summary + remaining goods-line count; click opens readonly goods inspection | Same560 shared drawer and goods source; preserve full-order door and list context | Owner-approved scoped target; pilot reported separately. No edit form or status engine inside |

### 8.3 Loading, empty, error and accessibility geometry

| Item | Current Carres value / source | Exact recommended target | Status / evidence |
|---|---|---|---|
| Empty region | `kit/EmptyState.tsx`: horizontal16/vertical32, gap8; icon18, heading15/600/22, detail12/400/16 | KEEP; content-driven height, one relevant action | Source inspected; not reused to disguise failed or denied reads |
| Loading skeleton | `kit/Loading.tsx`:3 lines default; bar16high, gap8; last width60%, preceding100%; radiusfull | KEEP current primitive; region remains labelled busy | Source inspected; row-skeleton alternative not admitted by this record |
| Spinner | Same: default16, admitted14/16/18; stroke2 | KEEP; preserve control dimensions while saving | Source inspected |
| Field error | FieldFrame body13/400/18, gap6; wraps | KEEP; no universal fixed height; error links to exact input | Source inspected; server error must preserve entered work |
| Region error / permission | Actual adopter-dependent, no universal numerical error component proved | PROPOSAL: shared message region pad16/gap8, body13/400/18, one32px desktop retry control (40 touch) when retry meaningful | NOT LAW; report missing shared recipe rather than draw it locally |
| Touch / focus | §9 touch minimum40, focus2; some24/28 desktop controls remain | KEEP40 touch acceptance; keyboard visible focus and return; no clipping at200% zoom | Existing requirement; source dimensions alone do not prove compliance |
| Responsive review | Rail896canvas, toolbar768viewport, drawer viewport cap; card thresholds above are proposal | Verify390/820/1180/1440 viewport and200% zoom with actual shell | Acceptance sizes, not four new layout breakpoints; retain filters, identity and action access |

**Sales-first acceptance boundary.** Sales Orders is the first complete shared-template sample.
Purchasing and Warehouse reuse the accepted component geometry and interaction grammar, keeping
their own fields, actors, workflows and permission rules. A numeric table is not acceptance of a
page. Sales must report actual font loading and per-surface computed values, long data and narrow
screen results before calling the sample verified. This PLAN document neither commissions code
nor extends the separately authorised Sales pilot to merge/deploy or other module builds.

---

## 9 · Accessibility

Minimum touch target 40px · keyboard focus required · WCAG AA contrast.

**Every overlay opens by keyboard.** Verified by test rather than assumed: a
Radix trigger opens on `Enter`, and jsdom has no `PointerEvent`, so a click-only
test proves nothing.

---

## 10 · Words

Approved business vocabulary only; a word that has not been ruled may not appear
on a screen. The dictionary is `docs/COPY-STANDARD.md`.

**Banned:** `Pending` · `Exception` · `Chase` · `Soon` · `Maybe` ·
`Appointment Pending` · `Booking Pending` · `POD`. (`Scheduled` is the customer-leg delivery word
since the owner ruling of 2026-09-24 — COPY-STANDARD.)

A banned DISPLAY word may still exist as a database or API value where
compatibility requires it. Never rename a stored value silently — the screen
translates; the store keeps its contract (§0's label-vs-identifier rule).

**Every word answers one question: who · what · next.** No decoration, no
marketing language, no unnecessary explanation.
