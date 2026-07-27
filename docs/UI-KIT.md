# CARRES UI-KIT

> **The ONE UI law. Read it before changing anything under `apps/web`.**
> Rewritten 2026-07-27 (D0). This file OVERWRITES every earlier design text.
> If any other doc, skill, checkpoint or old chat disagrees — **this file wins.**

---

## The philosophy (Jess + Loo, frozen 2026-07-27)

> **Every UI rule must eventually become a structure that the code can enforce.
> If a rule exists only as documentation, it is temporary and incomplete.**
>
> 中文：**能写成结构的活下来，只能写成文字的都死了。**
> 任何规定，如果最后不能变成程式限制，就代表它还没有做完。

This is why every rule below carries **Enforcement · Status · Evidence**. A rule
whose Enforcement is `Human Review` has not been finished yet — the count of
those is a debt to drive down, not a status quo. §16 keeps the running total.

**The six kinds of Enforcement**, strongest first:

| Enforcement | Means | Can it be ignored? |
|---|---|---|
| `Type System` | the wrong value does not compile | no |
| `Component API` | there is no prop / no export to do it wrong | no |
| `Build Guard` | `check-design.mjs` fails CI | no |
| `ESLint` | lint fails CI | no |
| `Screenshot` | `/ui` diff needs a human signature | no, but it is a stop not a block |
| `Human Review` | somebody has to notice | **yes — this is the debt** |

**Why this rewrite exists.** The previous kit was frozen on 2026-07-16 with the
same claim ("the ONLY design document"). Months later the codebase held
**2,556 hard-coded font sizes in 20 sizes across 225 files**, 58 raw hex
literals, 11 radii, 15 z-index levels, 12 border colours, and 100 icons in 12
sizes. The measurement that explains it:

```
✅ Survived — things expressible as a CSS class
   btn-primary / btn-ghost / .pill     343 + 72 uses, consistent

❌ Died — things that need structure + behaviour
   page shell · table · modal · drawer · input
   274 of 285 pages hand-roll their own shell
    26 files hand-roll a <table>
    63 files hand-roll a modal/drawer
   134 files hand-roll an <input>
```

A document can say "buttons look like this", because a button is a class.
A document cannot say "tables look like this", because a table is 40 lines of
JSX — and every chat that reads the doc still writes the 27th version.

**So the kit is not only this file.** It has three bodies that must always
agree, changed in the same commit:

| Body | What it is | Why |
|---|---|---|
| `docs/UI-KIT.md` | this file — the law, in words | explains intent |
| `apps/web/src/lib/design-standard.ts` | the machine mirror | code reads this |
| **`/ui`** (`pages/dev/UiShowcase.tsx`) | the live showcase, real components | **structurally cannot go stale** |

---

## PENDING REGISTER

Rules not yet frozen. **A pending rule may NOT be enforced by the Build Guard**
(half-enforcement is worse than none), and **card D5 "Guard → Fail" is blocked
until this register is empty.** The schedule forces the decision; nobody has to
remember.

| # | Question | Decided by | Where it gets answered |
|---|---|---|---|
| Q1 | Spacing scale — 8-step (2 4 6 8 12 16 24 32) or 6-step (4 8 12 16 24 32) | Jess | `/ui` renders both — D0.5a |
| Q3 | `font-bold` (700) — delete into 600, or keep as a fourth weight | Jess | `/ui` v1 — D0.5a |
| Q4 | Icon stroke width — Lucide default 2, or 1.5 | Jess | `/ui` renders both — D0.5a |

Frozen this round: **Q2 — page canvas = Radix `slate-3`.**

---

## Scope

| In scope | Out of scope |
|---|---|
| `apps/web/src/pages/**` except `dealer/**` (~225 pages) | **`pages/dealer/**` — 57 pages = the POS, Part B, a deliberately separate system under `.pos-proto`** (§15) |
| `apps/web/src/components/**` | `pages/print/**` — PDF/print, non-Tailwind contract |
| `apps/web/src/lib/design-standard.ts` | `packages/shared` (no UI) |

Priority inside scope: `pages/operation/**` (118 pages) — Jess's daily work.

## What this file does NOT own

| Concern | Owner |
|---|---|
| Every visible word, the banned words, the vocabulary | [`COPY-STANDARD.md`](COPY-STANDARD.md) |
| Which action appears, when, and which shows first | [`ACTION-FLOW-STANDARD.md`](ACTION-FLOW-STANDARD.md) |
| Status wording and status semantics | [`STATUS-STANDARD.md`](STATUS-STANDARD.md) |
| The migration work-list (temporary) | [`ui-kit-execution-queue.md`](ui-kit-execution-queue.md) |

---

# §0 Governance

中文：谁说了算 · 三个身体 · 给每个 chat 的界线。

## §0.1 The boundary for every chat

```
╔══════════════════════════════════════════════════════════════════╗
║  You are NOT a UI designer.                                      ║
║  You may only ASSEMBLE pages from approved components.           ║
║                                                                  ║
║  You may NOT invent:                                             ║
║      spacing · colours · typography · icons                      ║
║      component styles · page layouts · horizontal bands          ║
║                                                                  ║
║  You MAY challenge (with evidence):                              ║
║      business logic · workflow · data model · wording            ║
║                                                                  ║
║  If a component you need does not exist:                         ║
║      STOP. Ask for it to be added to the kit first.              ║
║      Do not draw it inline "just this once".                     ║
╚══════════════════════════════════════════════════════════════════╝
```

| Rule | Enforcement | Status | Evidence |
|---|---|---|---|
| No hand-rolled page shell | Component API + Build Guard G | ⏳ D0.5c | `PageShell.tsx` |
| No hand-rolled table | Component API + Build Guard G | ⏳ D0.5c | `DataTable.tsx` |
| No hand-rolled modal/drawer | Component API + Build Guard G | ⏳ D0.5b | `Modal.tsx` · `Drawer.tsx` |
| No inventing tokens | Build Guard A–I | ⏳ D1 | `check-design.mjs` |
| Every chat reads the boundary | Human Review | ⏳ D0 | `CLAUDE.md` header |

> **`CLAUDE.md` §0 must be amended in the same commit.** It currently instructs
> every chat to *"PROPOSE a superior redesign"* — read literally, that is an
> instruction to redesign the UI. Narrow it to business logic, or it cancels
> this chapter.

## §0.2 One concern, one file

Old text is **deleted and overwritten** — never annotated "superseded", never
two versions side by side. Deleted into this file on 2026-07-27:

`docs/DESIGN-STANDARD.md` · `docs/LIST-TEMPLATE-SPEC.md` ·
`CARRES_*_UI_KIT_CURRENT.md` · the design sections of
`CARRES_SYSTEM_MASTERPLAN.md`, `CARRES_ORDER_PORTAL_SPEC.md`,
`CHECKPOINT-order-detail-v4`, `CHECKPOINT-purchase-cockpit`,
`CHECKPOINT-purchase-v2` · `BACKLOG_DESIGN.md` · `CLAUDE.md §10`
(replaced by a one-line pointer) · the `.claude/skills/carres-design/` css +
md (now points here).

## §0.3 Change control

To change the look: edit the token source, then update **this file + the
machine mirror + `/ui`** in the same commit. A page conforms to the kit; the
kit does not bend to a page. See §14.

---

# §1 Decision Process

中文：画之前先过这一关。填不出来 = 不准画。

> **The home page is not a display of all information. It is a tool for
> finishing today's work.**
>
> Every permanent element must justify the vertical space it occupies. If it is
> not required for the majority of daily operational tasks, it must be
> collapsible, contextual, or moved into a Drawer, Popover, or Side Rail.

## §1.1 The gate — four questions

Before adding **any** permanent UI element, answer all four. **No answers = no
drawing.** Paste the filled table into the card / PR.

```
1  Who uses it?
2  How often?          every hour / daily / weekly / monthly
3  If it were removed, could today's work still be finished?
       YES  →  it must NOT stay permanently on the page
       NO   →  it may stay
4  How much permanent vertical height does it take?
       ___ px  =  ___ fewer orders visible
```

## §1.2 Priority ladder

| Level | Meaning | Where it may live |
|---|---|---|
| **P1** | operated every hour, every day | permanent on the page |
| **P2** | used daily, not continuously | a **Contextual Surface** — see below |
| **P3** | occasional | Drawer / Popover / row action |
| **P4** | administration & configuration | never on a working page |

**Contextual Surface** = anything that does not hold permanent vertical height:
a Side Rail · an accordion · a collapsible block · a secondary panel · a
Popover. The rule governs the *height*, not the *position* — a page with no
rail is not exempt, it just uses a different surface.

**Summary information prefers the Side Rail, and may never create a new
horizontal band.** The rail is already full-height and mostly empty; the top of
the page is the scarcest space on the screen.

## §1.3 Height budget — by page type

Measured on a 13" laptop, usable viewport ≈ **760px**. "Fixed chrome" = every
pixel that is not scrolling content (header + toolbar + chips + table header +
footer + page padding).

| Page type | Pages | Fixed chrome | `PageShell variant` |
|---|---|---|---|
| **List** | Orders · Delivery · Purchase · Receiving · Stock · Payments · Service Cases | **≤ 200px** | `"list"` |
| **Dashboard** | HR Overview · Sales Analysis · role dashboards | **≤ 280px** | `"dashboard"` |
| **Detail / Form** | order detail · SKU editor · wizards | no band budget; max content width applies | `"detail"` |
| **Settings** | Accounts · Positions · configuration | unlimited | `"settings"` |

**Exceptions are expressed by TYPE, not by prose.** `variant="list"` has no
`kpi` slot in its props; `variant="dashboard"` does. A chat cannot "make an
exception" — the type either has the slot or it does not.

### The arithmetic behind the budget

```
Orders today (7 bands)             Orders after D6 (3 bands)
────────────────────────           ──────────────────────────
breadcrumb          28             title + tabs + search   40
title + Synced      34             filter chips            28
padding             16             table header            40
toolbar card        56             footer                  36
tabs row            34             padding                 24
chips row           34             ─────────────────────────
table header        40             fixed total           168px
footer              36
padding             20             remaining 592px → 14-15 rows
────────────────────
fixed total       298px

remaining 462px → 11 rows          ⭐ 11 → 15 rows = +36%
```

Every horizontal band costs roughly **one order per 40px**. The seven bands on
Orders today cost four orders on every screen, every day.

> These figures are computed from the stylesheet, not measured in a browser.
> **D6 must measure once in a real browser and correct this table.**

| Rule | Enforcement | Status | Evidence |
|---|---|---|---|
| A list page cannot exceed 200px fixed chrome | Build Guard H | ⏳ D1 | `check-design.mjs` |
| A list page cannot add an 8th band | Type System — `list` variant has no `extraBand` / `kpi` prop | ⏳ D0.5c | `PageShell.tsx` |
| The four questions are answered before building | Human Review | ⏳ D0 | card template in `ui-kit-execution-queue.md` |

---

# §2 Typography

中文：六级，没有第七级。

## §2.1 The scale

| Token | px | weight | line-height | Use |
|---|---|---|---|---|
| `t-page` | 24 | 600 | 32 | page title — **max one per page** |
| `t-title` | 20 | 600 | 28 | section title · KPI hero number |
| `t-strong` | 15 | 600 | 22 | card title · field-group heading |
| **`t-body`** | **13** | **400** | **18** | **default** — table rows, prose, buttons |
| `t-meta` | 12 | 400 | 16 | secondary info, captions, timestamps |
| `t-label` | 11 | 500 | 14 | field labels, micro-labels, pill text |

Nothing is larger than 24. Nothing is smaller than 11.

```
Orders                                       24  t-page

┌───────────────────────────────────────────┐
│ Outstanding                    11  t-label │
│ RM 56,859                      20  t-title │
│ 18 orders · updated 2 min ago  12  t-meta  │
└───────────────────────────────────────────┘

Delivery this week                           15  t-strong
SO-1256   Tan Wei Ming   27 Jul 26, Sun      13  t-body
```

## §2.2 Weight

| Weight | Use | Today |
|---|---|---|
| 400 | body text | 33 uses |
| 500 | labels, light emphasis | 202 uses |
| 600 | titles, numbers | 854 uses |
| **700** | **⚠ PENDING Q3 — proposed: delete into 600** | 158 uses |

`font-bold` (700) and `font-semibold` (600) are currently doing the same job.
`/ui` shows both; Jess freezes Q3 there.

## §2.3 Numbers and codes

```
money · quantity · percentage    →  .t-num     tabular figures + slashed zero
SKU · SO ref · phone · dimension →  font-mono  JetBrains Mono + slashed zero
                                    NEVER on words — codes only
```

Neither is a seventh or eighth size; both use the sizes above. Money appears at
exactly two sizes: `t-title` (20, hero) and `t-body` (13, in a row).

## §2.4 Dates — carried forward, still law

The canonical human date is **`19 Jul 26, Sun`** — abbreviated month, 2-digit
year, weekday — **everywhere, including inside table cells**. It comes from ONE
helper: `fmtDate()` in `@/lib/fmt-date`. Never hand-format, never
`toLocaleDateString`, never `fmtDateShort`, never split the weekday off. A date
column must be wide enough to hold the weekday.

| Rule | Enforcement | Status | Evidence |
|---|---|---|---|
| Only 6 sizes exist | Build Guard D (bans `text-[Npx]` + any 7th token) | ⏳ D1 | `check-design.mjs` |
| Only 3 weights exist | Build Guard D | ⚠ pending Q3 | — |
| Dates via `fmtDate()` | **Human Review** — no rule exists | ⚠ **debt** | `lib/fmt-date.ts` |

---

# §3 Colours

中文：颜色是讯号，不是装饰。只有四个工作。

## §3.1 Source — Radix Colors, never hand-picked

Install `@radix-ui/colors`. **The law names the STEP, never the hex** — so
nobody can mistype a digit and nobody maintains a hex table.

## §3.2 Neutral — 95% of the screen

| Role | Step | ≈ hex |
|---|---|---|
| **Page canvas** ✅ frozen Q2 | `slate-3` | `#F0F0F3` |
| Card / panel surface | white | `#FFFFFF` |
| Hairline (table lines, card edge) | `slate-5` | `#E0E1E6` |
| Stronger divider (section split) | `slate-6` | `#D9D9E0` |
| Icon at rest | `slate-9` | `#8B8D98` |
| Secondary text | `slate-11` | `#60646C` |
| Primary text | `slate-12` | `#1C2024` |

**Exactly two border colours exist.** The codebase uses twelve today.

## §3.3 The four jobs

| Job | Colour | Fill | Ink |
|---|---|---|---|
| **Action · clickable · selected** | blue | `blue-9` filled · `blue-3` selected row | `blue-11` |
| **Done · received · in stock** | green | `green-3` | `green-11` |
| **Needs attention · waiting** | amber | `amber-3` | `amber-11` |
| **Late · act now** | red | `red-3` pill · `red-9` dot | `red-11` |
| everything else | black / grey / white | | |

```
┌──────────────────────────────────────────────────────────────────┐
│ ☐  SO-1256   Tan Wei Ming   ●●●   27 Jul 26, Sun  [ Call NETS ] │
│              slate-12        ↑    slate-11         ↑             │
│                       coloured only when          blue = the     │
│                       something is wrong          one action     │
├──────────────────────────────────────────────────────────────────┤
│ ☐  SO-1257   Lim Ah Kaw     ●●●   25 Jul 26, Fri  [ Call NETS ] │
│                              ↑ red-9                             │
│                    late → the only red on the screen             │
└──────────────────────────────────────────────────────────────────┘
```

**Red must stay rare or it stops meaning anything.** A typical 15-row screen
carries 0–2 reds.

## §3.4 Banned

```
✕ any raw hex in JSX                    ✕ grey hover (reads as structure)
✕ the Carres flame outside the logo     ✕ bare coloured text (status = pill)
✕ decorative purple/indigo/pink/teal    ✕ two blue actions in one block
✕ colour on a number's VALUE            ✕ colour used as decoration at all
```

The Carres flame `#C44D2B` survives in **exactly one place: the logo.**

## §3.5 Hover and selection — carried forward, still law

| State | Look |
|---|---|
| Row / nav / chip hover | one faint blue tint — never grey |
| Row / chip selected | the stronger blue wash (`blue-3`), wash only |
| Underline tab hover | darken the text, not the background |
| Colour-filled pill hover | `brightness-95` — keep its own colour |

| Rule | Enforcement | Status | Evidence |
|---|---|---|---|
| No raw hex | Build Guard A (ratchet) | ✅ live | `check-design-standard.mjs` |
| Status is always a pill | Component API — `<StatusPill>` is the only renderer | ⏳ D0.5a | `StatusPill.tsx` |
| Flame only in the logo | Build Guard B | ⏳ D1 | `check-design.mjs` |
| Max 2 reds per screen | **Human Review** — not statically measurable | ⚠ **debt** | `/ui` screenshot |

---

# §4 Spacing · Radius · Border · Z-index

> ⚠️ **PENDING Q1.** `/ui` renders the same Orders row under both scales; Jess
> freezes it there. Until frozen, the Build Guard does not enforce §4.1.

## §4.1 Spacing — two candidates

```
Candidate A — 8 steps (recommended)
  2   4   6   8   12   16   24   32
  │   │   │   │    │    │    │    └ between major regions
  │   │   │   │    │    │    └────── between blocks · card padding
  │   │   │   │    │    └─────────── dense card padding · table cell x-pad
  │   │   │   │    └──────────────── standard gap
  │   │   │   └───────────────────── inside a control
  │   │   └───────────────────────── icon-to-text gap  ⭐ most used
  │   └───────────────────────────── touching
  └───────────────────────────────── hairline nudge (pill y-padding)

  Migration cost ≈ 779 sites

Candidate B — 6 steps (strict 4pt)
  4   8   12   16   24   32

  Purer, but drops 2 and 6 — dense tables loosen, fewer rows per screen.
  Migration cost ≈ 2,225 sites
```

Dead under both: `10 · 14 · 18 · 20 · 22 · 33` and every arbitrary
`p-[Npx]` / `gap-[Npx]` / `m-[Npx]`.

## §4.2 Radius — four, frozen

| px | Use |
|---|---|
| 4 | pill · small tag · checkbox |
| 6 | button · input · dropdown |
| 10 | card · panel · modal · drawer |
| full | avatar · status dot |

Dead: `sm` · `md` · `lg` · `xl` · `3px` · `5px` · `8px` · `9px` · `12px`
(11 radii in use today).

## §4.3 Border — one width, two colours

```
width   1px only. No 2px, no dashes, no coloured borders.
colour  slate-5  hairline (default)
        slate-6  stronger divider
```

## §4.4 Z-index — one ladder, frozen

Fifteen levels exist today (`1 · 10 · 20 · 30 · 40 · 50 · 55 · 60 · 70 · 90 ·
100 · 110 · 120`). Five survive, reachable only through components:

| Layer | z | Owned by |
|---|---|---|
| sticky table header | 10 | `DataTable` |
| toolbar / bulk bar | 20 | `PageShell` |
| popover · dropdown · tooltip | 30 | Radix portal |
| modal · drawer | 40 | Radix portal |
| toast | 50 | Sonner |

**No component may set its own z-index.** A chat needing a new layer adds it
here first.

| Rule | Enforcement | Status | Evidence |
|---|---|---|---|
| Only scale steps exist | Build Guard E | ⚠ pending Q1 | — |
| Only 4 radii | Build Guard E | ⏳ D1 | `check-design.mjs` |
| Only 2 border colours | Build Guard E | ⏳ D1 | `check-design.mjs` |
| Only 5 z-layers | Component API (Radix portals own 30/40) + Build Guard F | ⏳ D0.5b | `Modal.tsx` · `check-design.mjs` |

---

# §5 Icons

中文：一个意思，一个 icon。今天有 100 个 icon、12 种尺寸，而且已经在漂。

## §5.1 Source and size

```
Library   Lucide only (installed). No emoji. No hand-drawn SVG.
          No brand marks — the WhatsApp chase uses message-circle, never the logo.

Size      Exactly three:
            14   inside a table row · inside a pill
            16   buttons, toolbars, ⋮ menus          ← default
            18   page-level actions, empty states

Colour    Inherits text colour. At rest slate-9, hover slate-11.
          A coloured icon appears only inside a status pill.

Stroke    ⚠ PENDING Q4 — Lucide's default is 2, which reads heavy at 14px.
          /ui renders 2 and 1.5 side by side.
```

Twelve sizes are in use today (14 ×157 · 16 ×126 · 13 ×73 · 12 ×52 · 18 ×34 ·
15 ×28 · 11 ×23 · plus five more).

## §5.2 Already drifting — one meaning, two glyphs

| Meaning | Found in code | Survivor |
|---|---|---|
| edit | `Pencil` ×8 · `Edit3` ×3 | **`Pencil`** |
| warning | `AlertTriangle` ×10 · `TriangleAlert` ×7 | **`TriangleAlert`** (Lucide's current name) |
| filter | `Filter` ×2 · `SlidersHorizontal` ×2 | **`SlidersHorizontal`** |

## §5.3 The name map — one meaning, one glyph

```
ACTIONS
  add          Plus              edit        Pencil
  delete       Trash2            confirm     Check
  search       Search            filter      SlidersHorizontal
  refresh      RefreshCw         copy        Copy
  download     Download          print       Printer
  open         ExternalLink      close       X
  overflow     MoreVertical      flag        Flag
  message      MessageCircle     call        Phone
  attach       Paperclip         settings    Settings
  help         CircleHelp        lock        Lock
  history      History

NAVIGATION
  back         ArrowLeft         forward     ChevronRight
  expand       ChevronDown       collapse    ChevronUp

STATUS (inside a pill only)
  ready        Check             waiting     Clock
  late         AlertCircle       on hold     PauseCircle

BUSINESS ENTITIES
  goods        Package           delivery    Truck
  money        Wallet            supplier    Factory
  customer     User              people      Users
  warehouse    Warehouse         order       ClipboardList
  date         CalendarDays      note        Lightbulb
  activity     ScrollText
```

| Rule | Enforcement | Status | Evidence |
|---|---|---|---|
| Only 3 sizes (14/16/18) | Build Guard C | ✅ live on kit files — widen to all in D1 | `check-design-standard.mjs` |
| One meaning → one glyph | Type System — `<Icon name>` is a union; `"edit3"` fails to compile | ⏳ D0.5a | `Icon.tsx` |
| Lucide only, no emoji | Build Guard C | ⏳ D1 | `check-design.mjs` |
| Stroke width | ⚠ **PENDING Q4** — not enforced until frozen | ⚠ | `/ui` |

---

# §6 Box Dictionary

> ⏳ **Written by D0.5a and D0.5b, one component at a time.** A specification
> written before its component exists is a specification that 285 pages will
> each re-implement differently — the exact failure this rewrite ends.

Each component gets its section here **when it lands on `/ui`**, specifying:
height · radius · padding · font token · border · background · hover · focus ·
disabled · selected · loading · long text · empty value.

**D0.5a — no behaviour needed (structure + CSS):**
`Button` · `Input` · `Textarea` · `SearchInput` · `Card` · `Panel` · `Badge` ·
`StatusPill` · `EmptyState` · `Loading`

**D0.5b — behaviour from Radix:**
`Modal` · `Drawer` · `Select` · `DropdownMenu` · `Tooltip` · `Popover` ·
`Tabs` · `Checkbox` · `DatePicker` · `Toast`

Until a component lands, the record is the code, not this file:
[`Btn.tsx`](../apps/web/src/components/Btn.tsx) ·
[`Field.tsx`](../apps/web/src/components/Field.tsx) ·
[`Money.tsx`](../apps/web/src/components/Money.tsx) ·
[`SectionPanel.tsx`](../apps/web/src/components/SectionPanel.tsx) ·
[`Segmented.tsx`](../apps/web/src/components/Segmented.tsx) ·
the `.btn-*` and `.pill*` utilities in `apps/web/src/index.css`.

## §6.1 The rule that keeps this chapter closed

> **If a UI element appears a second time, it stops being inline and becomes a
> Foundation Component.** The first occurrence may be written in place. The
> second occurrence is a full stop: extract it first, then use it twice.

| Rule | Enforcement | Status | Evidence |
|---|---|---|---|
| Second occurrence must be extracted | Build Guard I (duplicated class string across ≥ 2 files) | ⏳ D1 | `check-design.mjs` |

---

# §7 Table Dictionary

> ⏳ **Written by D0.5c.** `DataTable` is **extracted from the Orders table**,
> not designed fresh — Orders already carries `table-fixed` percentage widths, a
> sticky head, whole-row selection, a bulk bar that replaces the header,
> hover/selected washes, an action cell, the three dots and `+N`. A `DataTable`
> designed in the abstract will not fit it, and D6 would rebuild it.

Will specify: header · row height · density · sticky · selection · checkbox ·
hover · sort · column alignment · money cell · date cell · quantity cell ·
action cell · overflow / truncation · empty state · loading skeleton ·
pagination.

Today: **26 files hand-roll a `<table>`, in 7 header shapes, in two opposite
visual languages** (dark header + white text ×6, light grey header + grey text
×5). One of those two dies in D0.5c.

---

# §8 Page Dictionary

> ⏳ **Written by D0.5c** — except the slot contract below, which is already
> decided, because §1.3 depends on it.

## §8.1 The `PageShell` slot contract (decided)

```tsx
<PageShell
  variant="list"        // list | dashboard | detail | settings
  title                 // title + tabs + search — ONE band
  toolbar               // one band; the bulk bar REPLACES it in place
  chips                 // active filters; height 0 when empty
  footer                // count + pagination
>
  <DataTable />
</PageShell>
```

**There is no `extraBand`. There is no slot above the table.**
`variant="list"` has no `kpi` prop; `variant="dashboard"` does. An eighth band
is not forbidden by a sentence — it has nowhere to go.

| Band | Height |
|---|---|
| title (+ tabs + search) | 40 |
| toolbar / bulk bar | 40 |
| chips | 28, or 0 when no filter is active |
| table header | 40 |
| footer | 36 |
| page padding | 24 |

Will also specify: sidebar width · side rail width · drawer width · max content
width · minimum supported screen · responsive rules · **form layout** (label
position, field spacing, required marker, error placement, one vs two columns —
which has no home at all today).

---

# §9 UI States

> ⏳ **Written by D0.5a.** These are UI states, not business statuses.

`Empty` · `Loading skeleton` · `Error` · `Partial data` · `No permission` ·
`Offline` · `Success`.

**`/ui` must render every component in every state**, including the ugly ones —
default · hover · focus · selected · disabled · loading · error · **long text**
· **empty value**. A visual-regression screenshot that only covers the happy
path proves nothing.

---

# §10 Copy

UI wording is owned by [`COPY-STANDARD.md`](COPY-STANDARD.md).
**No word is copied into this file.** Two files holding the same words will
drift — the failure this rewrite exists to end.

---

# §11 Reference Library

Two columns, because "looks like Linear" is not something code can read.

| Component | Visual reference (humans) | Implementation reference (code can read) |
|---|---|---|
| Page layout · Table · Sidebar | `docs/ui-reference/linear-*.png` | Carres `PageShell` / `DataTable` |
| Status pill · density | `docs/ui-reference/linear-list.png` | Carres `StatusPill` |
| Modal · Drawer | — | `@radix-ui/react-dialog` |
| Dropdown · ⋮ menu | — | `@radix-ui/react-dropdown-menu` |
| Popover · filter panel | — | `@radix-ui/react-popover` |
| Tooltip | — | `@radix-ui/react-tooltip` |
| Select | — | `@radix-ui/react-select` |
| Checkbox | — | `@radix-ui/react-checkbox` |
| Tabs | — | `@radix-ui/react-tabs` |
| Date picker | — | `react-day-picker` (**Radix has no calendar primitive**) |
| Colour scales | — | `@radix-ui/colors` |
| Icons | [lucide.dev](https://lucide.dev) | `lucide-react` |
| Toast | — | `sonner` |
| Empty state | `docs/ui-reference/primer-blankslate.png` | Carres `EmptyState` |

**Screenshots live in the repo** (`docs/ui-reference/`). An external URL is not
a reference — it changes without telling us.

**`shadcn/ui` is deliberately NOT used.** Radix supplies behaviour (keyboard,
focus trap, escape, scroll lock, accessibility); appearance is Carres's own.
Copying shadcn's appearance means importing a look we would then have to unwind.
**Radix = behaviour. Carres = appearance.**

---

# §12 Migration

Active migration work is maintained in
[`docs/ui-kit-execution-queue.md`](ui-kit-execution-queue.md).
**That file is temporary and must be deleted when the migration completes.**
Nothing about D1–D10 belongs in this permanent law.

---

# §13 Build Guard

中文：文件会被忘记，lint 不会。写错的要编译不过。

## §13.1 Scope

**All of `apps/web/src`** — not a hand-maintained file list. The previous guard
inspected 3 files and checked colour only; that is why 225 files drifted.
Exempt: `pages/dealer/**` (POS, Part B) and `pages/print/**`.

## §13.2 Ratchet

| Stage | Behaviour | Card |
|---|---|---|
| 1 | Warn only; write the baseline count | D1 |
| 2 | Warn + CI report; the baseline may only go down | D2–D4 |
| 3 | **Fail the build** | D5 |

**Stage 3 is blocked while the PENDING register is non-empty.**

## §13.3 Rules

| Rule | Fails on | Frozen? |
|---|---|---|
| A | any raw hex literal in JSX | ✅ |
| B | the Carres flame outside the logo component | ✅ |
| C | a Lucide `size` ∉ {14, 16, 18}; an emoji used as an icon; an icon name outside §5.3 | ✅ |
| D | `text-[Npx]`; a typography token outside §2.1; a weight outside §2.2 | ⚠ pending Q3 |
| E | a spacing / radius / border value outside §4 | ⚠ pending Q1 |
| F | a `z-` class anywhere in `pages/**` | ✅ |
| G | a raw `<table>`, `<input>`, `<select>`, or a `fixed inset-0` overlay in `pages/**` | ⏳ needs D0.5 |
| H | a `PageShell` whose fixed chrome exceeds its variant's budget (§1.3) | ⏳ needs D0.5c |
| I | the same class string ≥ 40 chars repeated across ≥ 2 files (§6.1) | ⏳ D1 |

## §13.4 The screenshot gate

`/ui` is screenshotted in CI. **A changed screenshot requires a human
signature** — which buys visual regression for the whole kit at the price of
one page.

---

# §14 UI Change Policy

Any UI change answers these seven before code is written. If any answer is
"yes", **update this file first, then the code.**

```
1  Why is it changing?
2  Does it affect other modules?
3  Does UI-KIT.md need updating?
4  Does it need a codemod?
5  Does it need a new design token?
6  Does it change a reference screenshot?
7  Does it change a Build Guard rule?
```

Plus, for anything occupying permanent vertical space, the §1.1 gate.

---

# §15 Part B — POS (`.pos-proto`)

The POS sales flow (`/dealer`, `/principal?tab=pos`) is a **separate system**,
scoped entirely under `.pos-proto`
(`apps/web/src/styles/pos-prototype.css` — the class names are the contract, do
not rename). **Portal tokens never apply there, and POS tokens never leak
here.** 57 pages. Out of scope for §1–§14 and for the Build Guard.

Bringing the POS into this kit would be its own card and its own decision —
never a side effect of a portal change.

---

# §16 UI Health

中文：这份 kit 永远有一个百分比。每接上一条 Enforcement，它就上升。

> **The kit is never "done" — it has a coverage number.** A rule that exists
> only as words counts as *not yet built*, and this is where that shows.

**This block is GENERATED**, not hand-typed — `check-design.mjs --report`
parses the Enforcement column out of this file, checks which mechanisms
actually exist in the repo, and rewrites the block. A hand-maintained
percentage is prose, and prose drifts; that is the whole thesis of this
document.
*(The numbers below are the D0 hand count, valid until D1 wires the generator.)*

```
                         enforced / total
  Typography    ░░░░░░░░░░    0%      0 / 3
  Colour        ██▌░░░░░░░    25%     1 / 4
  Spacing       ░░░░░░░░░░    0%      0 / 4
  Icons         ██▌░░░░░░░    25%     1 / 4
  Components    ░░░░░░░░░░    0%      0 / 6
  Layout        ░░░░░░░░░░    0%      0 / 3
  ──────────────────────────────────────────
  TOTAL         ▊░░░░░░░░░    8%      2 / 24
```

| | Count | Meaning |
|---|---|---|
| Rules | **24** | design rules stated in §1–§6 |
| **Enforced** | **2** | Type System / Component API / Build Guard / ESLint is live |
| Scheduled | 17 | a card exists (D0.5–D5) |
| **Blocked on a decision** | 3 | Q1 spacing · Q3 weight · Q4 stroke — see PENDING REGISTER |
| **Human Review debt** | 2 | `fmtDate()` · "max 2 reds per screen" — nobody has found a mechanism |

**Two health rules:**

1. **Coverage may never go down.** A PR that adds a rule without an Enforcement
   raises the denominator and lowers the number — visible in CI.
2. **Human Review debt may never grow.** Adding a rule enforced only by a human
   requires either a mechanism in the same PR, or a card that names one.

| Rule | Enforcement | Status | Evidence |
|---|---|---|---|
| Coverage never decreases | Build Guard (report mode, ratchet) | ⏳ D1 | `check-design.mjs --report` |
| Human Review debt never grows | Build Guard (report mode, ratchet) | ⏳ D1 | `check-design.mjs --report` |

---

## Appendix — the measurements this rewrite is built on

Taken 2026-07-27 across `apps/web/src`:

| | |
|---|---|
| Pages | 285 (225 in scope; `operation/` = 118) |
| Shared components | 19 |
| Pages using `ListPageShell` / `PageHeader` | 10 / 1 — **274 hand-roll a shell** |
| Files hand-rolling `<table>` | 26, in 7 header shapes, 2 opposite visual languages |
| Files hand-rolling a modal/drawer | 63, in 12+ overlay shapes, 5 backdrop colours |
| Files hand-rolling `<input>` | 134, in 121 distinct class strings |
| Hard-coded `text-[Npx]` | **2,556**, in 20 sizes, across 225 files |
| Typography class uses | `t-*` 956 · `t4-*` 33 |
| Font weights | 4 (semibold 854 · medium 202 · bold 158 · normal 33) |
| Raw hex literals | 58 |
| Radii | 11 |
| Border colours | 12 |
| Z-index levels | 15 |
| Lucide icons | 100 distinct, in 12 sizes, with 3 known duplicate meanings |
| `.btn-*` uses | 343 — **consistent; the one thing that worked** |
| `.pill` uses | 72 — largely consistent |
| Radix packages installed | **0** |
| `shadcn/ui` installed | **no** — `components/ui/` does not exist |

---

—— End of UI-KIT.md ——
