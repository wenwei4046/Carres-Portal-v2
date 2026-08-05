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

Six tokens. A seventh does not exist and does not compile — each is one
Tailwind `fontSize` entry carrying size + weight + line-height in ONE class, so
a seventh cannot be written without editing the config.

| Token | Class | Size | Weight | Line | Use |
|---|---|---:|---:|---:|---|
| page | `text-page` | 24 | 600 | 32 | page title — max one per page |
| title | `text-title` | 20 | 600 | 28 | section title · KPI hero number |
| strong | `text-strong` | 15 | 600 | 22 | card title · field-group heading |
| body | `text-body` | 13 | 400 | 18 | default — table rows, prose, buttons |
| meta | `text-meta` | 12 | 400 | 16 | secondary info, captions, timestamps |
| label | `text-label` | 11 | 500 | 14 | field labels, micro-labels, pill text |

**Weights: 400 · 500 · 600. There is no 700.** Frozen by Jess 2026-07-28 —
600 and 700 were doing the same job at every size. A kit file writing
`font-bold` fails `kit-source.test.ts`.

**Numbers and codes** use `tabular-nums` so a column of figures lines up.
**Dates** are `fmtDate()` and nothing else — a second date spelling is a defect.

---

## 2 · Colour

**Source: `@radix-ui/colors`. No file in this repo maintains a hex table, so
nobody can mistype a digit.** The law names the STEP; Tailwind resolves the hex.

### 2.1 Semantic layer (approved Loo, 2026-07-31)

| Semantic | Step | Use |
|---|---|---|
| `background` | `slate-3` | page canvas |
| `surface` | `white` | card · panel |
| `surface-alt` | `slate-3` | inset · nested surface |
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
| 4 | `rounded-pill` | pill · small tag · checkbox |
| 6 | `rounded-control` | button · input · dropdown |
| 10 | `rounded-card` | card · panel · modal · drawer |
| — | `rounded-full` | avatar · status dot |

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

**One meaning, one glyph.** The 40 permitted meanings are the `IconName` union
in `apps/web/src/components/kit/Icon.tsx`; a name outside it does not compile.
Validated 2026-07-31: the kebab is `overflow`, and `more` does not exist.

---

## 7 · Sizing

| | |
|---:|---|
| button-sm / md / lg | 32 / 40 / 48 |
| input-sm / md / lg | 32 / 40 / 48 |
| **row-compact** | **40 — the portal's table row** |
| row-default | 48 |
| row-comfortable | 56 |
| badge-height | 24 |

**Rows are 40px FIXED and content adapts to the row, never the reverse.**
Cells clip their own overflow and ellipsis-truncate. Validated on the Purchase
Order Items table, 2026-07-31.

---

## 8 · Layout

| | |
|---:|---|
| desktop-max-width | 1280 |
| desktop-min-width | 1024 |
| sidebar-width | 280 |
| sidebar-collapsed-width | 72 |
| **workspace-rail-width** | **200 — the Workspace navigator** (`03`) |
| topbar-height | 64 |
| page-padding | 32 |
| section-gap | 32 |
| card-gap | 20 |
| dialog-sm / md / lg | 480 / 640 / 960 |
| side-panel-width | 420 |

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

**Banned:** `Pending` · `Exception` · `Chase` · `Soon` · `Maybe` · `Scheduled` ·
`Appointment Pending` · `Booking Pending` · `POD`.

A banned DISPLAY word may still exist as a database or API value where
compatibility requires it. Never rename a stored value silently — the screen
translates; the store keeps its contract (§0's label-vs-identifier rule).

**Every word answers one question: who · what · next.** No decoration, no
marketing language, no unnecessary explanation.
