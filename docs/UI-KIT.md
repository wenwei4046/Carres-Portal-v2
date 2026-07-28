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
| **`/ui`** (`pages/dev/UiShowcase.tsx`) — ✅ **live since D0.5a** | the live showcase, real components | **structurally cannot go stale** |

---

## PENDING REGISTER — **EMPTY since 2026-07-28**

```
        ╔══════════════════════════════════════════════════════════╗
        ║   Nothing is pending. Every value in this file is law.    ║
        ╚══════════════════════════════════════════════════════════╝
```

| # | Question | Frozen by | Answer |
|---|---|---|---|
| Q1 | Spacing scale | Jess, 2026-07-28 | **the 8-step scale — 2 · 4 · 6 · 8 · 12 · 16 · 24 · 32** (§4.1) |
| Q2 | Page canvas | Jess, 2026-07-27 | **Radix `slate-3`** (§3.2) |
| Q3 | `font-bold` (700) | Jess, 2026-07-28 | **deleted — 600 is the only strong weight** (§2.2) |
| Q4 | Icon stroke width | Jess, 2026-07-28 | **2, Lucide's own** (§5.1) |

**A pending rule may NOT be enforced by the Build Guard** (half-enforcement is
worse than none) — that constraint now binds nothing, and **card D5 "Guard →
Fail" is UNBLOCKED**: the register being empty was its only remaining gate.

**All three answers cost ZERO component changes**, which is the part worth
keeping. The kit's ten boxes were built from the six spacing steps present in
BOTH Q1 candidates, never used `font-bold`, and took Lucide's own stroke — so
freezing was a documentation act, not a migration. What DID change in the code
is that each answer became structure: `Icon` lost its `strokeWidth` prop
entirely (one stroke, and no way to ask for another), and the source scan over
`components/kit/**` now guards the frozen eight-step scale and fails on any
`font-bold`.

**A new question does not go here.** This register exists to hold decisions
that the schedule forces; re-opening it means a card, a decision-maker and a
date, never a chat's uncertainty parked in the law.

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
| No hand-rolled modal/drawer | **Component API** — `Modal` / `Drawer` are the only overlays and the ONE scrim lives in `overlay-recipe.ts`; a source scan fails on a hand-rolled `fixed inset-0`. Build Guard G widens it to pages in D1 | ✅ **live in the kit (D0.5b)** | `Modal.tsx` · `Drawer.tsx` · `kit-source.test.ts` |
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
`CARRES_SYSTEM_MASTERPLAN.md` and of the old order-portal master spec (**that
file was then deleted whole on 2026-07-28, card D0.4** — it claimed to outrank
this one) · `CHECKPOINT-order-detail-v4` · `BACKLOG_DESIGN.md` · **`CLAUDE.md §10`**
(now deliberately empty — its v17 tokens were how a chat could follow CLAUDE.md
faithfully and still build the wrong thing) · the `.claude/skills/carres-design/`
skill (marked SUPERSEDED, `user-invocable: false`, kept only as an asset store).

*(`CHECKPOINT-purchase-cockpit` and `CHECKPOINT-purchase-v2` were deleted the
same day by the parallel Purchasing line for its own reason — seven purchasing
docs, none authoritative. Same disease, same cure, arrived at independently.)*

## §0.3 Change control

To change the look: edit the token source, then update **this file + the
machine mirror + `/ui`** in the same commit. A page conforms to the kit; the
kit does not bend to a page. See §14.

---

# §1 Decision Process & Information Hierarchy

中文：§1.1–§1.3 决定「可不可以放上去」。§1.4 决定「重要性排第几」。
两个都在画之前，不在画之后。

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

## §1.4 Information Hierarchy (FROZEN 2026-07-28 — Jess)

中文：不管版面怎么变，重要性永远一样。

> **This freezes the HIERARCHY, not the LAYOUT.** Desktop may put it left/right,
> a tablet top/bottom, a phone in an accordion — the *order of importance* is the
> same on all three. That is why it is not called "reading order": reading order
> still sounds like "left to right", and it would stop being true the moment the
> layout changed.

```
Identity                    ① Whose order is this?
   │                           ref · customer · state word
   │
   ├── Current Action       ② What has to be done today
   │                           ⭐ ALWAYS VISIBLE — see the rule below
   │
   ├── Current Issues       ③ What is stopping it right now
   │                           ⭐ AUTO-HIDES — see the rule below
   │                           grouped by goods · delivery · money
   │
   ├── Progress             ④ How far it has got, and what is next
   │                           the fixed business steps + their state
   │
   ├── Business Sections    ⑤⑥ The detail, opened on demand
   │                           Items (default) · Payment · Delivery ·
   │                           Receiving · Purchasing · Storage · Service ·
   │                           Documents · Cases · Loan …
   │                           a module switches one on; the blueprint
   │                           never changes
   │
   └── Activity            ⑦ Who did what, when — and where a human
                              writes a note
```

### The four rules that make it real

**1. Current Action is always visible.** On every surface — drawer, full page,
tablet, phone — and it survives a collapsed rail. It is the reason the record is
open; a user must never expand something to find out what to do today.
*(The bug this rule named — the drawer hiding its Current Action when the rail
collapsed — was fixed by T2, `c9966ee3`. The panel is `CallsPanel` now; a chat
grepping the name in that old sentence would have found nothing and concluded the
rule was about something that no longer exists.)*

**2. Current Issues disappears when there are none.** No "✓ None", no empty
card, no reassuring green tick — an ERP's job is to say where today is *not*
normal, and a block that says "nothing is wrong" is spending height to say
nothing. §1.3 is a budget; this block only draws when it has earned it.

**3. Progress answers two questions and refuses the rest.**

| Progress answers | Progress must NEVER answer |
|---|---|
| where has it got to | who did it |
| what is the next step | when they did it |
| | what they wrote in a note |

Those belong to **Activity**. The two blocks may never both claim "what
happened" — which is why ④ is called **Progress** and not "Timeline": Activity
is already a timeline (`AnnotationTimeline`), and one word for two blocks is
how a reader stops trusting either.

Progress also carries no KPI tiles, no buttons and no warnings — every one of
those already has a home above it (② and ③). *(This retires the three separate
Balance / Stock / Delivery KPI boxes, which stated the same facts the spine
already carried.)*

**4. A list and its detail use the SAME business categories.** If the list row
says `goods · delivery · money`, the detail groups its issues by
`goods · delivery · money`. Never `Stock / Delivery / Payment` on one screen and
`Supply Chain / Logistics / Finance` on the other — that is two languages for
one business, and the user pays for the translation every time.

> **Business Vocabulary First.** The categories are decided ONCE and then every
> surface follows: list, detail, dashboard, KPI, notification, Current Issues.
> A page does not get to invent its own names for them.
> The words themselves live in [`COPY-STANDARD.md`](COPY-STANDARD.md); the
> machine-readable set is **`OrderActionTrack` in
> `packages/shared/src/order-actions.ts`** — already a union type
> (`"goods" | "delivery" | "money"`), already read by the list row's dots and by
> the two-layer action ladder. A surface that invents a fourth category does not
> compile.

### What this is for

A user learns the order once — *whose order · what to do · what is wrong · how
far · the detail · the record* — and it is then true of Delivery, Payment,
Purchasing, Receiving and Service Detail without learning any of them again.

> **The boundary with the information model (Loo, 2026-07-28).** This section owns
> **PRESENTATION architecture** — what meets the eye and in what order, shared by
> every detail page. **[`ORDER-DETAIL-INFORMATION-MODEL.md`](ORDER-DETAIL-INFORMATION-MODEL.md)
> owns INFORMATION architecture** — which business question each block answers, how
> deep an answer goes (Answer · Context · Evidence · Detail) and what it says in each
> state (Working · Blocked · Waiting · Completed). Neither repeats the other; that file
> carries the block-by-block mapping, and **where the two touch, this file wins.**
>
> Two rulings made there that this section depends on: **④ Progress is another VIEW of
> ② Current Action, never a second responsibility** — two blocks answering one question
> drift the first time either is edited; and the frozen depth model is what lets rule 2
> hide ③ safely, because the three facts a phone call asks for are answered by ④, by ②
> and by ① even when ③ is absent.

| Rule | Enforcement | Status | Evidence |
|---|---|---|---|
| Same categories on list and detail | **Type System** — both read `OrderActionTrack` | ✅ live for the three tracks | `packages/shared/src/order-actions.ts` |
| Current Action always visible | Component API — the slot has no `collapsible` option | ⏳ D0.5c | `DetailShell.tsx` |
| Current Issues auto-hides when empty | Component API — the slot renders nothing for an empty list | ⏳ D0.5c | `DetailShell.tsx` |
| Blocks cannot be reordered | Component API — named ORDERED slots, not `children` | ⏳ D0.5c | `DetailShell.tsx` |
| Progress carries no events / KPIs / buttons | **Human Review** | ⚠ **debt** | — |

---

# §2 Typography

中文：六级，没有第七级。

## §2.1 The scale

| Token | Class | px | weight | line-height | Use |
|---|---|---|---|---|---|
| `t-page` | `text-page` | 24 | 600 | 32 | page title — **max one per page** |
| `t-title` | `text-title` | 20 | 600 | 28 | section title · KPI hero number |
| `t-strong` | `text-strong` | 15 | 600 | 22 | card title · field-group heading |
| **`t-body`** | **`text-body`** | **13** | **400** | **18** | **default** — table rows, prose, buttons |
| `t-meta` | `text-meta` | 12 | 400 | 16 | secondary info, captions, timestamps |
| `t-label` | `text-label` | 11 | 500 | 14 | field labels, micro-labels, pill text |

Nothing is larger than 24. Nothing is smaller than 11.

**The class carries all three values** — size, weight and line-height come from
one `fontSize` entry in `tailwind.config.ts`, so a page cannot half-apply a
token. A seventh size means editing that file, which is the friction this
chapter wants. Measured on `/ui` in a real browser 2026-07-28: all six render
exactly the px / weight / line-height above.

> **Why the class is `text-page` and not `t-page`** (D0.5a, recorded so nobody
> "fixes" it): `.t-body` already exists in `index.css` as the retired v17 ramp's
> **14px/400** and is live in 5 files. Taking the name would have re-sized pages
> D0.5a is forbidden to touch. The legacy `.t-*` ramp dies in **D2**, and the
> question of whether the class then takes the law's own name is D2's.

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

**THREE weights. 700 is dead** (Q3, frozen by Jess on `/ui` 2026-07-28).

| Weight | Class | Use | Today |
|---|---|---|---|
| 400 | `font-normal` | body text | 33 uses |
| 500 | `font-medium` | labels, light emphasis | 202 uses |
| 600 | `font-semibold` | titles, numbers | 854 uses |
| ~~700~~ | ~~`font-bold`~~ | **DELETED into 600** | 158 uses to migrate — **D2** |

`font-bold` and `font-semibold` were doing the same job; `/ui` put them on the
same words and the answer was that nothing was lost. The 158 remaining uses are
D2's codemod — **a page still carrying `font-bold` is not "an exception", it is
unmigrated.** No kit component may write it (source scan, `kit-source.test.ts`).

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
| Only 3 weights exist | Build Guard D + a source scan on the kit | ⏳ D1 (kit ✅ D0.5a) | `kit-source.test.ts` |
| Dates via `fmtDate()` | **Human Review** — no rule exists | ⚠ **debt** | `lib/fmt-date.ts` |

---

# §3 Colours

中文：颜色是讯号，不是装饰。只有四个工作。

## §3.1 Source — Radix Colors, never hand-picked

`@radix-ui/colors` is **installed (D0.5a)** and `tailwind.config.ts` reads the
hexes out of it. **The law names the STEP, never the hex** — so nobody can
mistype a digit and no file in this repo maintains a hex table.

**The class is `bg-kit-<scale>-<step>`** — `bg-kit-slate-3`, `text-kit-red-11`,
`border-kit-slate-5`. The `kit` namespace exists because Tailwind's own `blue` /
`green` / `amber` / `red` are still live in 76 class uses across the unmigrated
pages; overriding them would have re-coloured pages D0.5a may not touch. Only
the steps this chapter names exist — a chat reaching for `bg-kit-slate-4` gets
nothing, which is the point.

## §3.2 Neutral — 95% of the screen

| Role | Step | ≈ hex |
|---|---|---|
| **Page canvas** ✅ frozen Q2 | `slate-3` | `#F0F0F3` |
| Card / panel surface | white | `#FFFFFF` |
| Hairline (table lines, card edge) | `slate-5` | `#E0E1E6` |
| Stronger divider (section split) | `slate-6` | `#D9D9E0` |
| Icon at rest · placeholder | `slate-9` | `#8B8D98` |
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

## §3.6 Action tone — carried forward from the parallel Purchasing line (LOCKED 2026-07-27)

A row's actions live in a column named **`Actions`** (plural — a row can carry
several) and are ALWAYS pills, never a plain-text verb sitting beside a pill.

**This file never spells an action word.** Every label comes from the dictionary
in [`COPY-STANDARD.md`](COPY-STANDARD.md), mirrored in
`packages/shared/order-action-words.ts`. What this file locks is the **tone**,
and the tone is chosen by a **condition**, never by which verb it is:

| Tone | Pill | When |
|---|---|---|
| danger (red) | `pill-overdue` | the action's due date has passed |
| warning (amber) | `pill-warning` | due soon, or held (🔒) |
| info (blue) | `pill-sent` | open and not yet due |
| success (green) | `pill-confirmed` | can be completed right now |
| neutral (grey) | `pill-neutral` | terminal fact (`Done`) |
| money (indigo) | `pill-collected` | the money action — an independent track, shown as a SECOND pill (max two pills per row) |

> Tone by CONDITION is what makes this survive a rename. The old table mapped
> tone to specific verbs, so `Chase logistic → Chase logistic` appeared under
> two different tones and every renamed verb needed the table edited again.

| Rule | Enforcement | Status | Evidence |
|---|---|---|---|
| No raw hex | Build Guard A (ratchet) | ✅ live | `check-design-standard.mjs` |
| Status is always a pill | Component API — `<StatusPill>` is the only renderer | ✅ **live (D0.5a)** | `components/kit/StatusPill.tsx` |
| Flame only in the logo | Build Guard B | ⏳ D1 | `check-design.mjs` |
| Action tone comes from a condition, not a verb | **Type System** — `tone: OrderActionTone`, the union the engine computes; the pill file contains no verb and no verb→tone map | ✅ **live (D0.5a)** | `StatusPill.tsx` · `order-actions.ts` |
| Max 2 reds per screen | **Human Review** — not statically measurable | ⚠ **debt** | `/ui` screenshot |

> **§3.6 lists SIX tones; `OrderActionTone` has FIVE** — there is no `money`
> member, so `<StatusPill tone="money">` does not compile (a `@ts-expect-error`
> test pins it). Reported by D0.5a, not invented around: adding a sixth tone
> changes what the action engine may return, which is a business decision about
> whether the money track gets its own colour. Today the money pill's indigo
> lives only as the legacy `.pill-collected` class in `index.css`.

---

# §4 Spacing · Radius · Border · Z-index

## §4.1 Spacing — eight steps, FROZEN 2026-07-28 (Jess, Q1)

```
  2   4   6   8   12   16   24   32          Tailwind suffix
  │   │   │   │    │    │    │    └ between major regions          -8
  │   │   │   │    │    │    └────── between blocks · card padding -6
  │   │   │   │    │    └─────────── dense card padding · cell x   -4
  │   │   │   │    └──────────────── standard gap                  -3
  │   │   │   └───────────────────── inside a control              -2
  │   │   └───────────────────────── icon-to-text gap ⭐ most used -1.5
  │   └───────────────────────────── touching                      -1
  └───────────────────────────────── hairline nudge (pill y-pad)   -0.5

  ≈ 779 sites to migrate — D4
```

**Why this one, in Jess's words on `/ui`**: the 6-step strict-4pt alternative
drops 2 and 6, which loosens every dense row and costs rows per screen — and
§1.3 is a height budget. It also cost ~2,225 migration sites against 779.

Dead: `10 · 14 · 18 · 20 · 22 · 33` and every arbitrary
`p-[Npx]` / `gap-[Npx]` / `m-[Npx]`.

**The Foundation Components needed no change to absorb this.** They were built
from the six steps present in BOTH candidates, so the answer cost zero edits —
and the source scan over `components/kit/**` now guards the frozen eight
(`kit-source.test.ts`). That is why D0.5a could ship components while Q1 was
still open, instead of the line waiting on a decision.

## §4.2 Radius — four, frozen

| px | Class | Use |
|---|---|---|
| 4 | `rounded-pill` | pill · small tag · checkbox |
| 6 | `rounded-control` | button · input · dropdown |
| 10 | `rounded-card` | card · panel · modal · drawer |
| full | `rounded-full` | avatar · status dot |

**Named by USE, so nobody picks a number.** A chat that wants "a slightly
rounder card" has to change the kit, which is the friction §0.3 asks for.

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
| Only scale steps exist | Build Guard E + a source scan on the kit | ⏳ D1 (kit ✅ D0.5a) | `kit-source.test.ts` |
| Only 4 radii | Build Guard E | ⏳ D1 | `check-design.mjs` |
| Only 2 border colours | Build Guard E | ⏳ D1 | `check-design.mjs` |
| Only 5 z-layers | **Component API** — the ladder is `Z` in `tokens.ts`, Radix portals own 30/40, and a source scan fails on any `z-` class written anywhere else in the kit | ✅ **live (D0.5b)** | `tokens.ts` · `kit-source.test.ts` |

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

Stroke    2 — Lucide's own default. FROZEN 2026-07-28 (Jess, Q4), after
          /ui showed 2 and 1.5 side by side at all three sizes.
          `Icon` has NO prop to change it: one stroke, and no way to ask
          for another.
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
| Only 3 sizes (14/16/18) | **Type System** — `size` is `14 \| 16 \| 18`; Build Guard C also live on kit files | ✅ **live (D0.5a)** | `components/kit/Icon.tsx` |
| One meaning → one glyph | **Type System** — `<Icon name>` is a union; `"edit3"` fails to compile | ✅ **live (D0.5a)** | `components/kit/Icon.tsx` |
| Lucide only, no emoji | **Component API** — one file in `components/kit/**` may import `lucide-react`, asserted by a source scan; Build Guard C widens to all pages in D1 | ✅ **live in the kit (D0.5a)** | `kit-source.test.ts` |
| One stroke width | **Component API** — `Icon` has no `strokeWidth` prop, and no kit file may write a stroke literal | ✅ **live (frozen 2026-07-28)** | `Icon.tsx` · `kit-source.test.ts` |

> **§5.2 decides a `warning` survivor that §5.3 has no row for.** `Icon` carries
> §5.3's 40 meanings exactly, so `TriangleAlert` has no name and cannot be
> rendered. Reported by D0.5a rather than invented: a 41st meaning is a kit
> addition, not a component's decision. Same question one line down — §3.6 names
> a **held (🔒)** condition and §5.3's STATUS group has no `lock` row, only an
> ACTIONS one, so `StatusPill`'s icon is narrowed to the four STATUS meanings.

---

# §6 Box Dictionary

> ✅ **D0.5a landed — the ten no-behaviour boxes below live in
> `apps/web/src/components/kit/` and render on `/ui`.**
> ✅ **D0.5b landed — the Radix half is §6.6–§6.10 below.** A specification written before its
> component exists is a specification that 285 pages each re-implement
> differently — the exact failure this rewrite ends, which is why nothing is
> written here until it is on `/ui`.

**D0.5a — no behaviour needed (structure + CSS):** ✅
`Button` · `Input` · `Textarea` · `SearchInput` · `Card` · `Panel` · `Badge` ·
`StatusPill` · `EmptyState` · `Loading` (+ `Icon`, §5).

**D0.5b — behaviour from Radix:** ✅ **landed 2026-07-28**
`Modal` · `Drawer` · `Select` · `DropdownMenu` · `Tooltip` · `Popover` ·
`Tabs` · `Checkbox` · `DatePicker` · `Toast`

The pre-kit boxes stay alive until their pages migrate in D2–D7 and are **not**
law: [`Btn.tsx`](../apps/web/src/components/Btn.tsx) ·
[`Field.tsx`](../apps/web/src/components/Field.tsx) ·
[`Money.tsx`](../apps/web/src/components/Money.tsx) ·
[`SectionPanel.tsx`](../apps/web/src/components/SectionPanel.tsx) ·
[`Segmented.tsx`](../apps/web/src/components/Segmented.tsx) ·
the `.btn-*` and `.pill*` utilities in `apps/web/src/index.css`.

## §6.0 The rule every box below obeys

> **A kit component takes no `className` and no `style`.**

§0.1 says a chat may not invent component styles. The only way that becomes
true rather than remembered is for there to be **nowhere to put one** — so
every component's props are `Omit<…HTMLAttributes, "className" | "style">`.
Behaviour, `data-testid`, `aria-*` and `onClick` all pass through; appearance
does not. Layout AROUND a box is the caller's wrapper.

| Rule | Enforcement | Status | Evidence |
|---|---|---|---|
| A component cannot be restyled by its caller | **Component API** — no `className`, no `style` prop | ✅ **live (D0.5a)** | `kit.test.tsx` (11 × `@ts-expect-error`) |
| A badge can never carry a status colour | **Component API** — `Badge` has no `tone` prop | ✅ **live (D0.5a)** | `Badge.tsx` |
| There is no red control | **Type System** — `variant` has no `danger` member | ✅ **live (D0.5a)** | `Button.tsx` |
| An error message replaces the hint | **Component API** — `FieldFrame` renders one or the other | ✅ **live (D0.5a)** | `FieldFrame.tsx` |
| A kit component uses only Q1-safe spacing | **Build Guard** — source scan over `components/kit/**` | ✅ **live (D0.5a)** | `kit-source.test.ts` |

*(Values below are measured on `/ui` in a real browser, not read off the source.)*

## §6.1 `Button`

| | |
|---|---|
| Variants | `primary` blue-9 filled · `neutral` white + slate-5 hairline · `ghost` no box |
| Height | 32 (`md`) · 24 (`sm`) |
| Radius · Type | `rounded-control` (6) · `text-body` + `font-medium` |
| Padding · gap | 12 / 8 x-padding · 8 / 4 gap |
| Icon | `IconName` only — 16 (`md`) · 14 (`sm`) |
| Hover | filled → `brightness-95` (§3.5, keeps its own colour) · unfilled → `blue-3` |
| Focus | `ring-2 blue-9` + 1px offset, `focus-visible` only |
| Disabled | opacity 40, `not-allowed`, hover suppressed |
| Loading | spinner replaces the icon, `disabled` + `aria-busy` |
| Long text | never wraps; the caller constrains the width |

**There is no `danger` variant.** §3.3 gives red one job — *late · act now* —
and §3.4 bans colour as decoration; a red button paints intent onto a control
instead of onto the state that earned it. A destructive action is a `neutral`
button whose WORD says what it does (COPY-STANDARD owns the word).

**One `primary` per block** — §3.4 already bans two blue actions in one block.

## §6.2 `Input` · `Textarea` · `SearchInput`

One skin, three shapes. The recipe is `field-recipe.ts` and the label/message
frame is `FieldFrame.tsx` — §6.11 applied: the second occurrence was extracted
before it was used twice. Replaces **134 hand-rolled `<input>`s in 121 distinct
class strings**.

| | |
|---|---|
| Height | 32 single-line · natural for `Textarea` (`rows`, never a height) |
| Radius · Type | `rounded-control` (6) · `text-body` |
| Background · border | white · `slate-5` hairline → `red-9` when refused |
| Placeholder | `slate-9` |
| Focus | `ring-2 blue-9` + `border-blue-9` |
| Disabled | `slate-3` fill, `slate-9` ink, `not-allowed` |
| Label · message | `text-label slate-11` above · `text-meta` below |
| Error | **replaces** the hint, `role="alert"`, `aria-invalid` |
| Empty value | the placeholder, and nothing else |

**An error replaces the hint, never stacks under it** — two lines of guidance
under one control is how a form starts scrolling, and §1.3 is a budget.

`SearchInput` is its own box rather than `<Input icon="search">`: a search box
carries no label (§8.1 puts it in the title band, where a label would cost a
row of the height budget), takes no error and is never required. A
`leadingIcon` prop on `Input` would have opened all three doors on every field
in the portal.

**Form LAYOUT is not here** — one column or two, the air between fields, where
a section heading goes. §8 says it has no home yet; **D0.5c** writes it.

## §6.3 `Card` · `Panel`

| | `Card` | `Panel` |
|---|---|---|
| Surface | white, `slate-5` hairline, `rounded-card` (10) | same |
| Padding | 16, or `none` for a table-bodied card | same, on the body |
| Header | — | title `text-strong`, `slate-6` divider, one `right` slot |
| Heading level | — | a real `<h2>` |

**No shadow.** The old `.card` utility carries a double drop shadow; depth used
as decoration is banned by §3.4, and on a `slate-3` canvas a hairline already
separates the surface.

**Two components, not one `title?` prop**, so a page cannot half-title a card.
The question "does this surface need to say what it is?" has two answers and
each gets a box. `Panel` **does not collapse** — that is behaviour, D0.5b/D0.5c.

## §6.4 `StatusPill` · `Badge`

| | `StatusPill` | `Badge` |
|---|---|---|
| Shape | `rounded-pill` (4), 8/4 padding, `text-label` | same |
| Colour | tone fill + same-hue ink (§3.3) | `slate-3` + `slate-11`, always |
| Icon | the four §5.3 STATUS meanings, 14 | none |
| Long text | truncates inside its cell | truncates |

**`Badge` has no `tone`, and that is the design.** A coloured badge is a status
wearing a different name, and §3.4 says a status is a pill — so a badge that
could be red would be a second status renderer with none of `StatusPill`'s
rules. There is no prop to pass.

**`StatusPill` spells no word.** Every visible string comes from COPY-STANDARD
via `order-action-words.ts`; the pill renders what it is given.

## §6.5 `EmptyState` · `Loading`

| | |
|---|---|
| `EmptyState` | centred; optional 18px `slate-9` glyph · `text-strong` title (required) · `text-meta` detail · one action slot |
| `Loading` `spinner` | inherits `currentColor`, sized 14/16/18 to line up with an icon |
| `Loading` `skeleton` | `slate-3` bars, last one short, `animate-pulse` |

**An empty state is an ANSWER, not an apology** — §1.4 rule 2's logic applied
to a list: the message must tell the operator something they did not know, or
the region should not draw. No illustration slot: art is decoration.

**One action, never two.** Two buttons in an empty state is a decision, and a
decision is not a state.

## §6.6 `Modal` · `Drawer`

Replace **63 hand-rolled overlays in 12+ shapes with 5 backdrop colours**. Radix
`Dialog` supplies every behaviour that made those 63 subtly different — focus
trap, focus return, Escape, scroll lock, `aria-modal`, the portal — and none of
it is re-implemented.

| | `Modal` | `Drawer` |
|---|---|---|
| Purpose | **INTERRUPTS** — answer it and the page comes back | **ACCOMPANIES** — the record stays behind it |
| Position · size | centred, `max-w` sm/md/lg | docked RIGHT, full height, `max-w` md/lg/xl |
| Surface | white, `slate-5` hairline, `rounded-card` | same, square on the docked edge |
| Scrim | the ONE scrim — `slate-12/40`, `z-40` | same |
| Header | required `title` as a real `<h2>` + close | same |
| Footer | optional; the caller's Buttons, no verb of its own | same |

**Two components, not a `variant` prop.** The choice between them is a business
one, and a prop would let a page flip the meaning by editing a word.

**There is no `size="full"`** (that is a page — D0.5c's `PageShell`) and **no
way to make one undismissable** (that is a trap; a destructive confirm asks a
question whose answer is a Button, it does not remove the exit). **Right edge
only** — a left drawer fights the sidebar and a bottom sheet is a phone pattern
with no card.

## §6.7 `Select` · `DatePicker` · `Checkbox`

All three wear `Input`'s skin — 32px, `slate-5` hairline, `rounded-control`,
the same focus ring and the same error contract — so a form row lines up
whatever the field happens to be.

| | |
|---|---|
| `Select` | options are **DATA, not children**, so a caller cannot put a heading or a button in the list; Radix gives type-ahead, arrows, Home/End, Escape |
| `DatePicker` | `react-day-picker` inside the kit's `Popover` (**Radix has no calendar**, §11). Its stylesheet is NOT imported — every part is dressed with kit tokens |
| `Checkbox` | 4px radius, `blue-9` when checked (§3.3's "selected"); `indeterminate` is a real third state, drawn as a DASH — "some" is not "partly done" |

**The date value is an ISO `YYYY-MM-DD` string, never a `Date`**, and the
trigger prints `fmtDate()` — §2.4's one human date. A picker showing
`2026-07-19` would be the 21st spelling of a date in this codebase.

**`Checkbox` has no `label` prop**: in a table row the ROW is the label, and in
a form the label belongs to `FieldFrame`'s layout.

## §6.8 `DropdownMenu` · `Popover` · `Tooltip`

The three contextual surfaces (§1.2), and the difference between them is what
they may hold:

| | Holds | Opens on | Layer |
|---|---|---|---|
| `DropdownMenu` | a list of ACTIONS, as data | click | 30 |
| `Popover` | CONTROLS — a filter panel, a column picker | click | 30 |
| `Tooltip` | ONE line of text, and it may only repeat or expand what is already on screen | hover / focus | 30 |

**A tooltip's `content` is a `string`, not a node.** You cannot click your way
into a tooltip before it closes, so a tooltip holding a button is a `Popover`
wearing the wrong name. And **if a fact exists ONLY in a tooltip it is
invisible** — there is no hover on a touch screen.

**Menu items carry their own `onSelect` and a `tone: "danger"` is ink only** —
the one place red is allowed on a control, because a destructive item must be
findable among five neutral ones.

## §6.9 `Tabs`

A tab bar is a **STAGE PICKER**, and §8.2 already ruled what that means: one is
always on, clicking the active one does nothing, and there is no ✕ chip because
there is nothing to clear into. Radix has exactly that behaviour — which is the
reason not to hand-roll it, after Purchasing's To Order tab shipped a re-click
that threw away the supplier filter.

Underline, never a filled pill: §3.5 says hover darkens the TEXT. A filled tab
would be a second selection language beside the blue wash. The count is a
`Badge`, so it structurally cannot become a status colour.

**The active value is the CALLER's state**, because on most pages it lives in
the URL (`?tab=`) and every deep link must keep working.

## §6.10 `Toast`

§11 pins the renderer to **`sonner`**, mounted once in `App.tsx`, so the kit
ships a door rather than a component: `toast.success` · `toast.error` ·
`toast.info`.

**The door is narrow on purpose — no `duration`, no `action`, no `id`.** §9
gives Success one home and says it never becomes a permanent block; the reverse
is the rule that matters here: **a toast may not carry a state the page should
be showing.** A fact that disappears was never really told.

| Rule | Enforcement | Status | Evidence |
|---|---|---|---|
| A dialog cannot exist without an accessible name | **Component API** — `title` is required and renders as `Dialog.Title` | ✅ **live (D0.5b)** | `Modal.tsx` · `Drawer.tsx` |
| An overlay cannot paint its own scrim | **Component API** — one `SCRIM`, and a source scan fails on a hand-rolled `fixed inset-0` | ✅ **live (D0.5b)** | `overlay-recipe.ts` · `kit-source.test.ts` |
| Menu and select entries are data, not children | **Type System** — `items` / `options` are typed arrays; children do not compile | ✅ **live (D0.5b)** | `DropdownMenu.tsx` · `Select.tsx` |
| A tooltip cannot hold something clickable | **Type System** — `content` is a `string` | ✅ **live (D0.5b)** | `Tooltip.tsx` |

## §6.11 The rule that keeps this chapter closed

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

## §8.2 Interaction law (LOCKED 2026-07-27)

Every list page in the portal behaves **identically**, so a new hire learns it
once and it is true everywhere:

```
Click a queue tile     →  the table filters to that queue; the tile shows selected
Click it again / ✕     →  the filter clears and every row comes back
Two tiles picked       →  both queues show; each pick is one ✕-able chip
Click a row            →  the drawer opens on its FIRST tab, never a deep tab
Close the drawer       →  the table keeps its filter AND its scroll position
```

**A module never invents its own click behaviour.** If a module needs a
different one, that is a change to THIS law, decided by Jess — never a local
exception.

### A page with no "everything" state (added 2026-07-28, found by P2)

The five lines above quietly assume every list has an **unfiltered** state to
clear back to. Some do not. Purchasing's To Order is a **stage** page: three
cells, exactly one always on, and no way to show all three at once — clearing the
stage would show a blank screen, not every row.

**So a picker with no empty state is not a queue tile and does not toggle.**

| | Queue tile / facet | Stage picker |
|---|---|---|
| how many can be on | any number, including none | **exactly one, always** |
| clicking the one that is on | clears it | **does nothing** — never a blank page |
| carries a ✕ chip | yes | no — there is nothing to clear to |
| the rest of §8.2 | applies | **applies in full** — filters and scroll still survive the drawer |

**The test is the empty state, not the shape on screen.** If "none selected" is a
legal, useful view, it is a tile and it toggles. If "none selected" shows nothing,
it is a stage and re-clicking is a no-op. A tab bar is the same thing wearing a
different look, which is why this rule is here and not in §8.3.

**This narrows §8.2; it does not create an exception to it.** A module still may
not invent behaviour — it reads which of the two shapes it has, and both are
defined here.

## §8.3 Module-tab law (LOCKED 2026-07-22)

When a page sits under a module tab bar (Purchasing's
`To Order / Purchase Orders / Receiving / Claims / Settings`), the page does NOT
render the shell's breadcrumb slot or the big title — they duplicate the active
tab and burn ~80px, and §1.3 is a height budget. The freshness stamp and the
refresh icon move to the RIGHT of the tab bar; content starts immediately below.

**Stand-alone pages (Orders, Stock, Payments) keep the two-row header.** This is
an exception for module-tabbed pages only — and once `PageShell` lands it stops
being an exception at all: it is `variant`, not a rule somebody has to remember.

## §8.4 Facet rail order

`SUMMARY` → **the module's own queue names, the danger group first** → `STOCK` →
`LOGISTICS` → `REGION` → `CATEGORY`. Queue names come from
[`COPY-STANDARD.md`](COPY-STANDARD.md), never invented here.

**The GROUP HEADINGS are words too, and they live in COPY-STANDARD** (added
2026-07-28, found by P2-Claims: this section ordered the groups and no document
owned what they are called, so `Queues` · `Supplier` · `Problem` were invented on a
screen with nothing to check them against). This file orders them; it does not
name them.

| Rule | Enforcement | Status | Evidence |
|---|---|---|---|
| One interaction model for every list page | Component API — behaviour lives in `PageShell` / `DataTable`, not in the page | ⏳ D0.5c | `PageShell.tsx` |
| A module-tabbed page has no breadcrumb/title | Type System — `variant` decides | ⏳ D0.5c | `PageShell.tsx` |
| Facet group order | **Human Review** | ⚠ **debt** | — |

---

# §9 UI States

> ✅ **Written by D0.5a.** These are UI states, not business statuses — a
> business status is a `StatusPill` and its words belong to COPY-STANDARD.

**Seven states, and they share two boxes.** A state that seems to need a new
component is a state nobody has defined yet — say what the region should SAY,
and it will turn out to be one of these.

| State | Rendered by | What it must say |
|---|---|---|
| **Empty** | `EmptyState` | why it is empty, in the operator's terms — never "No data" |
| **Loading** | `Loading` — `skeleton` for a region, `spinner` for a control | nothing; it shows shape, not words |
| **Error** | `EmptyState` + a `Try again` action | what did not happen, not the exception |
| **Partial data** | the surface renders what it HAS and states the gap in its own words | which part is missing — **never a silent blank** |
| **No permission** | `EmptyState`, no action | that it is not theirs to open, and who to ask |
| **Offline** | `EmptyState` + a retry action | that the connection dropped, not that the record is gone |
| **Success** | a toast — `toast.success` (§6.10, `sonner`) | what changed; it never becomes a permanent block |

**Partial data is the one with no component, on purpose.** A box that renders
"some of this is missing" in a generic voice is how a screen ends up saying
less than it knows; the surface that owns the data is the only thing that can
name the gap. Every module doing this today (K5's coverage line, HR-P7's
withheld ratio, S5's withheld figures) states its own — that is the pattern.

**`/ui` renders every component in every state**, including the ugly ones —
default · hover · focus · disabled · loading · error · **long text** · **empty
value**. Hover and focus are painted in a FORCED variant beside the live one,
because a static screenshot cannot hold a pointer; the forced classes are
pinned to the components' own declarations by `UiShowcase.test.tsx`, so they
can never become a hand-painted lookalike. A visual-regression screenshot that
only covers the happy path proves nothing.

| Rule | Enforcement | Status | Evidence |
|---|---|---|---|
| Every state renders on `/ui`, ugly ones included | **Screenshot** (§13.4) + a test asserting the disabled / error / loading / long-text samples exist | ✅ **live (D0.5a)** | `UiShowcase.test.tsx` |

> **Partial data is deliberately NOT written as a Rule row.** No mechanism can
> tell a silent blank from a legitimately empty field, so a row would have
> arrived carrying `Human Review` — and §16's second health rule forbids growing
> that debt without a mechanism or a card that names one. It stays as the
> paragraph above until somebody finds one.

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
| Modal · Drawer | — | `@radix-ui/react-dialog` ✅ installed |
| Dropdown · ⋮ menu | — | `@radix-ui/react-dropdown-menu` ✅ installed |
| Popover · filter panel | — | `@radix-ui/react-popover` ✅ installed |
| Tooltip | — | `@radix-ui/react-tooltip` ✅ installed |
| Select | — | `@radix-ui/react-select` ✅ installed |
| Checkbox | — | `@radix-ui/react-checkbox` ✅ installed |
| Tabs | — | `@radix-ui/react-tabs` ✅ installed |
| Date picker | — | `react-day-picker` ✅ installed (**Radix has no calendar primitive**) |
| Colour scales | — | `@radix-ui/colors` ✅ installed |
| Icons | [lucide.dev](https://lucide.dev) | `lucide-react` |
| Toast | — | `sonner` ✅ installed, mounted once in `App.tsx` |
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

**Stage 3 was blocked while the PENDING register was non-empty — it is EMPTY since 2026-07-28, so D5 is unblocked.**

## §13.3 Rules

| Rule | Fails on | Frozen? |
|---|---|---|
| A | any raw hex literal in JSX | ✅ |
| B | the Carres flame outside the logo component | ✅ |
| C | a Lucide `size` ∉ {14, 16, 18}; an emoji used as an icon; an icon name outside §5.3 | ✅ |
| D | `text-[Npx]`; a typography token outside §2.1; a weight outside §2.2 | ✅ |
| E | a spacing / radius / border value outside §4 | ✅ |
| F | a `z-` class anywhere in `pages/**` | ✅ |
| G | a raw `<table>`, `<input>`, `<select>`, or a `fixed inset-0` overlay in `pages/**` | ⏳ D1 — every box it needs now exists (D0.5a + D0.5b) |
| H | a `PageShell` whose fixed chrome exceeds its variant's budget (§1.3) | ⏳ needs D0.5c |
| I | the same class string ≥ 40 chars repeated across ≥ 2 files (§6.11) | ⏳ D1 |

## §13.4 The screenshot gate

`/ui` is screenshotted in CI. **A changed screenshot requires a human
signature** — which buys visual regression for the whole kit at the price of
one page.

> **Status, stated rather than implied: the PAGE exists (D0.5a), the CI
> SCREENSHOT does not.** There is no image-diff step in the repo today, so this
> gate is a page waiting for a job. What D0.5a did deliver is the half that a
> screenshot cannot do anyway — `UiShowcase.test.tsx` fails if the showcase
> stops rendering an icon meaning, a tone, or one of the three pending
> questions. **Wiring the image diff belongs to D1**, with the rest of the
> Build Guard.

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
*(The numbers below are the D0.5b hand count, valid until D1 wires the generator.)*

```
                         enforced / total
  Typography    ███▎░░░░░░    33%     1 / 3
  Colour        ██████░░░░    60%     3 / 5
  Spacing       █████░░░░░    50%     2 / 4
  Icons         ██████████   100%     4 / 4
  Components    ██████▋░░░    67%    10 / 15
  Layout        ░░░░░░░░░░     0%     0 / 6
  Hierarchy     ██░░░░░░░░    20%     1 / 5
  ──────────────────────────────────────────
  TOTAL         █████░░░░░    50%    21 / 42
```

| | Count | Meaning |
|---|---|---|
| Rules | **42** | design rules stated in §1–§8 |
| **Enforced** | **21** | Type System / Component API / Build Guard / ESLint is live |
| Scheduled | 17 | a card exists (D0.5c–D5) |
| **Blocked on a decision** | **0** | the PENDING REGISTER is empty |
| **Human Review debt** | 4 | `fmtDate()` · "max 2 reds per screen" · facet group order · "Progress carries no events" — nobody has found a mechanism |

**What "enforced" counts, stated so the number cannot be inflated**: a mechanism
that FAILS TODAY, for the scope its row names. **Nothing counts because a card
exists.**

**The D0.5b arithmetic:**

```
rules       38  +  4  =  42     four new §6.10 Component-API / Type-System rules
enforced    15  +  6  =  21     the four new ones, PLUS two that had been waiting
                                for this card — "no hand-rolled modal/drawer"
                                and "only 5 z-layers"
coverage  39.47%  →  50.00%     ⬆
debt          4  →   4          unchanged
```

Every rule this card added arrived **already enforced** — which is what a
Component API is: the rule and its mechanism are one object. Half the kit's
stated rules now fail the build when broken; what is left is Layout (D0.5c) and
the four Human-Review debts.

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
| Radix packages installed | **8 since D0.5b** — `colors` · `react-dialog` · `react-dropdown-menu` · `react-popover` · `react-tooltip` · `react-select` · `react-checkbox` · `react-tabs`, plus `react-day-picker` (Radix has no calendar) |
| `shadcn/ui` installed | **no** — `components/ui/` does not exist |

**What D0.5a changed against this table** (2026-07-28): the ten Foundation
Components exist and `/ui` renders them, so the *shell · table · modal · input*
row of the "Died" list is no longer entirely true — `<input>` now has a box.
**None of the 225 pages has moved yet, on purpose**: D0.5a touches no existing
page, and the codemods (D2–D4) plus the page cards (D6, D7+) are what burn the
2,556 hard-coded sizes down. This appendix is re-measured by **D1**.

---

—— End of UI-KIT.md ——
