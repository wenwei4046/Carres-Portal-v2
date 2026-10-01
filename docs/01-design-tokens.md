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
Houzs measurements remain provenance in UI MASTER, never the instruction for Carres values.

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
| Single-line input | `kit/field-recipe.ts`: height 32, horizontal pad 8, body 13/400/18, border 1, radius 6 | KEEP | Implemented/source inspected; remove generic 32/40/48 size assumption |
| Search / toolbar field | Same: pill search height 32, horizontal pad 16; toolbar field 40 below768/36 at≥768, horizontal pad12, type14/400/20 | KEEP distinct admitted uses | Implemented/source inspected; no arbitrary per-page search size |
| Textarea | Same: horizontal pad8, vertical pad4, body13/400/18; content-driven height | KEEP; never invent fixed universal multiline height | Source inspected; form supplies content/rows |
| Label / hint / error | `kit/FieldFrame.tsx`: label11/500/14; vertical field gap4; hint12/400/16; error13/400/18 with icon/text gap6 | KEEP | Source inspected; message wraps and increases height, never clipped to one line |
| Status pill / neutral badge | `kit/StatusPill.tsx`, `Badge.tsx`: horizontal pad8, vertical pad4, label11/500/14, full radius; pill icon14/gap4 | KEEP; natural one-line height22, not universal24 | Derived from source, not fresh runtime measurement; long status must remain discoverable |

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
| Sales main row | `SalesOrdersRegister.tsx` explicitly `rowHeight=40` | KEEP40 | Approved Sales baseline; do not replace with generic engine38 |
| Generic reference / Purchasing parent | `register/DataGrid.module.css` baseline38; UI MASTER Shared Purchasing geometry minimum38 | KEEP38 in that scope | Approved scoped exception; not a Sales size |
| Two-line goods | UI MASTER owner ruling2026-09-26:51; name13/18 plus secondary11/14 | KEEP51 across the same goods table; grow consistently when required by admitted content | Approved shared baseline; not a licence to clip meaningful quantities |
| Reference table header | CSS height36, horizontal8, line14, size11, **weight700**; UI MASTER says600 | Target36 minimum,11/600/14; horizontal8, up to two lines with vertical4 | REAL GAP: weight700 source contradicts governed600; no code changed here |
| Checkbox | Shared Purchasing geometry:16×16, vertically centred | KEEP16 visible control; apply touch hit-target requirement separately | Approved geometry; icon size is not hit-target size |
| Cell inset / rules | Reference DataGrid horizontal8, vertical0; goods family ordinarily8 per side; separator1 | KEEP by row recipe; apply §5.1 separator conditions | Source inspected; do not add padding that silently grows the governed row |
| Goods header exception | `GoodsMiniTable.tsx`: normal horizontal8/vertical6; Purchasing layout explicitly40 high | KEEP existing scoped Purchasing40 header pending joined-table alignment review | Implemented/source inspected; not universal36 claim |
| Toolbar / footer | Reference DataGrid45 toolbar (vertical6/horizontal12); footer32 (horizontal12); labelled toolbar wraps with auto height | KEEP respective variants; footer remains outside row scroll | Source inspected; actual overflow still requires page verification |
| Expansion | Shared Purchasing target top12/bottom16; DataGrid generic nonflush inset12 vertically; flush0 | Preserve named adopter recipe; converge discrepancies only in approved scope | REAL GAP where an adopter claims Purchasing geometry but uses generic inset; not universal spacing override |
| Column widths | Governed field-width registry + UI MASTER content measurements; sort/filter controls require space | Keep registry widths and page-specific approved roles; do not divide screen equally | Width depends on fact, not table width; personal column state survives |
| Scroll | DataGrid owns table viewport; content width may exceed available canvas | KEEP bounded horizontal/vertical scroll and admitted pinned identity | No promise all14 columns fit one page; no shrinking text to force fit |
| Denser Sales candidate | Existing Sales40 / goods51 | **PROPOSAL ONLY:** main32, header36; goods51 retained | Sales planner's candidate, not owner-approved. Needs Inter/long content/control fit and 200% zoom review |

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
| Centred widths | Config `modal512`, `modal-wide600`, `modal-viewer880`; UI MASTER centred surface ruling | KEEP three named widths, capped at viewport width; max height85vh | Approved; no caller-chosen fourth width |
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
