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

## PENDING REGISTER — ✅ EMPTY (2026-07-28)

**Every question this kit was holding is answered. D5 "Guard → Fail" is no
longer blocked on a decision.**

| # | Question | Answer | Frozen |
|---|---|---|---|
| Q1 | Spacing scale — 8-step or 6-step | **8 steps: `2 4 6 8 12 16 24 32`** (Candidate A) | Jess, 2026-07-28 |
| Q2 | Page canvas | **Radix `slate-3`** | with the law, 2026-07-27 |
| Q3 | `font-bold` (700) | **Deleted into 600.** 600 is the heavy weight | Jess, 2026-07-28 |
| Q4 | Icon stroke width | **Lucide's default, 2** | Jess, 2026-07-28 |

**The freeze cost ZERO component changes, which is why it could arrive after the
components.** D0.5a built its ten boxes from the six spacing steps common to
both candidates, used no `font-bold`, and took Lucide's own stroke — so
whichever way Jess answered, nothing had to be redrawn. That property was held
by a source scan, not by anybody remembering it.

**What the freeze then bought, in D0.5b** — each one turns a sentence into a
mechanism, which is the only thing this file counts as finished:

- **Q1** — `kit-source.test.ts` stopped enforcing "the safe intersection" and
  started enforcing the FROZEN scale, read out of `SPACING_SCALE` in
  `components/kit/tokens.ts` so the record and the scan cannot drift.
- **Q3** — a kit file that writes `font-bold` now fails that scan. The 158 live
  uses across the 225 pages are **D2's codemod**, not this card's.
- **Q4** — `Icon` no longer has a `strokeWidth` prop at all. D0.5a carried one
  so `/ui` could draw both candidates; deleting it is the enforcement, and a
  second stroke width no longer compiles.

**A pending rule may still never be enforced by the Build Guard** (half
enforcement is worse than none). The register is kept, empty, because the next
open question goes here rather than into a chat.

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
| No hand-rolled page shell | Component API ✅ (the shell exists) + Build Guard G ⏳ | ⏳ D1 | `PageShell.tsx` |
| No hand-rolled table | Component API ✅ (the table exists) + Build Guard G ⏳ | ⏳ D1 | `DataTable.tsx` |
| No hand-rolled modal/drawer | Component API ✅ (the boxes exist) + Build Guard G ⏳ (a page still CAN hand-roll one until D1 bans `fixed inset-0`) | ⏳ D1 | `Modal.tsx` · `Drawer.tsx` |
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

### The kit has an EDITION, and every artifact declares the one it follows

> **Every kit artifact must declare the kit version it follows.**

**The edition is the date this law was last rewritten — `UI-KIT 2026-07-27`.**
A date rather than a semver: the kit has one consumer and no strangers to
promise anything to, so a release number would buy ceremony and nothing else.
The rewrite date is already the first thing this file states; declaring it is
free.

A **kit artifact** is anything that carries a rule of this kit outside this
file — the machine mirror, a component, a block of `index.css`, a comment that
cites a section. It writes the edition string, and a citation then has
something to be checked against.

**Why an undeclared citation is the dangerous shape: it cannot be wrong on its
face, which is exactly how it survives.** Every one of these names a file, a
section and an authority, and every one of them is a confident reference to a
dead edition — measured 2026-07-28, not recalled:

| Where | What it says | What is true |
|---|---|---|
| `design-standard.ts:4` | *"v4 — rewritten 2026-07-15"* | this law was rewritten **2026-07-27**; the mirror is 12 days behind |
| `design-standard.ts:7` | *"where any older doc… conflicts with UI-KIT v4, **v4 wins**"* | this file's own first line says **this file wins**. Two bodies of one kit each claiming to outrank the other |
| `design-standard.ts:38` | the canvas hex, *"v4 §11a COOL neutral"* | §3.2 froze the canvas at Radix `slate-3`, and **§11a does not exist** — `grep "11a"` over this file returns 0 |
| `design-standard.ts:11–18` | *"Flame appears ONLY on a clickable primary action + a checked checkbox"* | §3.4: the flame survives in **exactly one place, the logo**, and §13.3 rule B fails the build on it |
| `OrderDetailDrawer.tsx:653` | *"UI-KIT v4 §9: panels default COLLAPSED"* | today's §9 is **UI States**. The rule is cited out of a law that no longer exists |

**The sprawl is wider than those five, and the width is the argument.** A
`grep` for `UI-KIT v4` / `v4 §` across `apps/web/src` on 2026-07-28 returns
**28 citations in 12 files**, naming `v4 §1` · `§2` · `§3` · `§4` · `§5` ·
`§6` · `§8` · `§8b` · `§9` · `§10` · `§11a` · `§11c` · `§11e` · `§A0` · `§A1` ·
`§A5` · `§A6` · `§A8` — **lettered sections this file has never had.** Not one
of them looks wrong when read on its own.

| Rule | Enforcement | Status | Evidence |
|---|---|---|---|
| Every kit artifact declares the kit edition it follows | Build Guard — a header scan for the edition string in `components/kit/**`, `lib/design-standard.ts` and `index.css` | ✅ **live (D1)** | `check-design.mjs` rule J |
| No artifact claims to outrank this file | Build Guard — the same scan refuses a second authority claim | ✅ **live (D1)** | `check-design.mjs` rule K |

*(Both land with the Build Guard, which is D1's whole job. Naming the card is
what §16 requires of a rule this file cannot enforce on the day it is written.)*

## §0.4 What is configurable, and what never is

> **UI, workflow and navigation are opinionated and consistent across the company.
> Business parameters remain configurable.**

A user who can rearrange the tool must be taught **their own version of it**,
and every handover then starts from zero. `ACTION-FLOW-STANDARD` prices a new
hire's whole training at four lines; four lines only works if it is the same
tool for everybody.

Two things wear the word *settings* and they are opposites:

| | Configurable? | Why |
|---|---|---|
| **Business numbers** — production days per supplier, work weeks, reorder points, reserve levels, commission rates | **Yes, and it is compulsory** | a business number only a developer can change is a defect. Purchasing P1 made seven of them editable for exactly this reason |
| **The UI, the workflow and the navigation** — which columns exist, what order blocks appear in, which panels are open, what an action is called, which step comes next | **No, ever** | this is the tool's shape, and two operators seeing two shapes is how a handover fails |

**This is the same sentence §8.2 already says about list pages**, stated once
for the whole company instead of once per page type. §8.2 narrows it to clicks;
this section owns the principle.

| Rule | Enforcement | Status | Evidence |
|---|---|---|---|
| No per-user store of UI shape — no browser-persisted layout, panel or column state under `pages/**` | Build Guard — a scan for `localStorage` keyed to layout in `pages/**` | ✅ **live (D1)** | `check-design.mjs` rule L |

> **Its cost is not zero, and it is stated rather than discovered later.** Three
> live behaviours fail this rule today (measured by R2, 2026-07-28):
> `carres.orders.hiddenCols` — which columns the Orders table shows, per browser
> · `ops-drawer-panel-v4:{title}` — every drawer panel's open/closed state,
> across orders · `ops-drawer-rail` — the rail's collapsed state. **One of them
> is a feature somebody asked for.** D1 writes the scan; whether those three come
> off, and in which card, is Jess's, not the guard's.

## §0.5 A label is presentation; the identifier is the contract

> **Stable ID is the contract. Visible labels are presentation attached to the Stable ID.**

**The label carries nothing.** The ID is the contract; the label hangs off it
and may be replaced without the contract moving. What follows: **nothing may
key on a label** — not a count, not a filter, not a stored state, not a test.
Renaming is then a display change and never a data change.

Carres already built this, for one module: every action carries a `key` from
the `OrderActionKey` union and `DISPLAY_RANK` is keyed by that union, never by
a word. It is why C1 could delete `Chase` from the whole portal without
touching a count, a filter or a stored row. **What this section adds is the
scope** — it is a rule about every visible word, not a technique that happened
to be applied once.

**The counter-example is live and is the same rule not yet applied:** the
drawer's panel state is keyed by the panel's **title** (`ops-drawer-panel-v4:{title}`),
so renaming a panel silently resets every user's state for it — and C1 renamed
that rail's panel from `Actions` to `Calls`.

**The word is still governed even though it is not the contract.** Changing one
is an event that goes through [`COPY-STANDARD.md`](COPY-STANDARD.md), never an
edit somebody makes while they are in the file for another reason.

| Rule | Enforcement | Status | Evidence |
|---|---|---|---|
| No persisted state, query key or storage key is built from a display string | Build Guard — a scan for a `localStorage` / query key composed from a label | ✅ **live (D1)** | `check-design.mjs` rule M |

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
| A list page cannot add an 8th band | **Type System** — `variant="list"` has no `kpi` and no variant has an `extraBand` | ✅ **live (D0.5c)** | `PageShell.tsx` |

> **⚠ REPORTED, NOT SETTLED (D0.5c): §1.3's budget and §8.1's band table
> disagree by 8px.** §8.1 lists title 40 + toolbar 40 + chips 28 + table header
> 40 + footer 36 + padding 24 = **208**, against this section's **200** list
> budget. Both sentences are in this file and cannot both hold. The budget IS
> met in the two shapes the law actually describes — 180 with no filter on (the
> chip row is height 0) and 168 in §1.3's own D6 projection, where the toolbar
> folds into the title band — so nothing was changed to make the sum work. A
> test pins all three numbers (`shells.test.tsx`) so the contradiction cannot be
> lost, and the kit decides which number moves.
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
| Current Action always visible | **Component API** — the slot has no `collapsible` and no `hidden` | ✅ **live (D0.5c)** | `DetailShell.tsx` |
| Current Issues auto-hides when empty | **Component API** — `[]` returns null and there is no `emptyLabel` | ✅ **live (D0.5c)** | `DetailShell.tsx` |
| Blocks cannot be reordered | **Component API** — named ORDERED slots, and the shell takes no `children` | ✅ **live (D0.5c)** | `DetailShell.tsx` |
| Progress carries no events / KPIs / buttons | **Type System** — `ProgressSlot` has no `events` · `actor` · `timestamp` · `kpi` · `actions` | ✅ **live (D0.5c)** — *this was the chapter's only Human-Review debt* | `DetailShell.tsx` |
| Identity carries values only, and the set is full at four | **Type System** — `persistentFacts` is a 4-tuple and there is no `onAction` | ✅ **live (D0.5c)** | `DetailShell.tsx` |
| Detail is a route, never a render prop | **Type System** — `detailHref?: string`, and no render prop exists | ✅ **live (D0.5c)** | `DetailShell.tsx` |

> **The shell never receives a state, and that is the load-bearing one.**
> Working · Blocked · Waiting · Completed are produced entirely by what the
> slots are given — there is no `state` prop and there may never be. That is
> the information model's L3 (*"states are never stored and never reach the
> screen"*) turned into a type: a component that cannot be told a state cannot
> print one.
>
> **`DetailShell` is BUILT and no page renders through it yet, by ruling.** The
> PM closed D0.5c as components-only on 2026-07-29: the order drawer does NOT
> gain a Persistent Facts strip, because §7② of the information model still
> reads *"RESERVED, NOT YET LAW"* and the drawer's header carries Jess's frozen
> *"ZERO order data here"*. **Real-page adoption is D6.** The contract above is
> unchanged — the ruling is about the drawer, not about the type.

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
> **14px/400**. Taking the name would have re-sized pages D0.5a is forbidden to
> touch.
>
> **D2 answered the rename question with a NO, and the reason is Part B**
> (2026-07-29). The legacy `.t-*` ramp is gone from every in-scope file — 844
> uses converted — but **its definitions stay in `index.css`, because 110 uses
> survive under `pages/dealer/**` and `pages/print/**`**, which §15 and §13.1 put
> out of scope. Deleting the ramp would restyle the POS from a card that may not
> touch it, and taking its NAMES would do the same thing one step later. The six
> classes keep the `text-*` spelling; the question is closed, not deferred.

**After D2** (re-measured 2026-07-29): the six tokens are used **3,975** times in
scope, and `text-[Npx]`, `font-bold` and the `.t-*` ramp appear in exactly ONE
in-scope file — `index.css`, holding the definitions Part B still needs.

> **The figure was 3,971 and 3,971 was wrong** (corrected on the PM's standing
> ruling that *the law must always reflect the measured repository state*). Count
> it as occurrences of the six class names across `apps/web/src`, minus
> `pages/dealer/**`, `pages/print/**` and `*.test.tsx`, and the answer on this
> commit is **3,975**. Two parallel D2 reviews reached 3,971 and 3,975 from
> byte-identical source — **the source agreed and the counting did not**, which is
> the one number in §2 nothing generates.
>
> **Read the sentence above as being about those three spellings and nothing
> else.** A SECOND retired ramp, `.t4-*`, is still live — see §2.2.

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
| 600 | titles, numbers — **the heavy weight** | 854 uses |
| ~~700~~ | **DEAD (Q3, frozen 2026-07-28)** — `font-bold` folds into 600 | ✅ **0 left in scope (D2)** — 164 converted |

`font-bold` (700) and `font-semibold` (600) were doing the same job at every
size; `/ui` showed both on the same words and Jess deleted 700. **There are
three weights, and there is no fourth.**

A kit file that writes `font-bold` fails the source scan today, and **D2 converted
the 164 live uses across the pages** (2026-07-29). No page, panel or component
under `apps/web/src` writes `font-bold` any more.

> **Where 700 still survives — corrected 2026-07-29, because the sentence that
> stood here was false.** It said the only `font-bold` left was `.t-h1` / `.t-h2`.
> There are **three** definitions in `index.css`, and the third is not Part B's:
>
> | | | |
> |---|---|---|
> | `.t-h1` | `32px/700` | Part B — §15 protects it |
> | `.t-h2` | `24px/700` | Part B — §15 protects it |
> | **`.t4-hero-num`** | **`20px/700`** | **the retired v4 ramp. Nothing protects it** |
>
> `lib/design-standard.ts:132` records that weight as 700, and one in-scope page
> renders it. **So "0 left" is true of what a page WRITES and false of what the
> browser COMPUTES**, and the shipped stylesheet emits `font-weight:700` 116 times.
>
> **Neither the codemod nor guard rule D can see it**, and that is structural, not
> an oversight: rule D reads the values a page writes, and a page writes only
> `t4-hero-num` while the size and the weight live in the stylesheet. The whole
> `.t4-*` ramp is **9 classes, 44 in-scope uses across 8 files** — §16's class-use
> table has counted it all along without anything connecting that number to this
> claim.
>
> **RULED by the PM 2026-07-29: Reported Only. D2 was NOT extended, and the ramp is
> scheduled onto D6/D7** — converting it moves 44 sites including a money figure,
> so it travels with the pages when they migrate. D6 owns the definitions and the
> mirror's `weight: 700`.

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
| Only 3 weights exist | Build Guard D (live over `components/kit/**` since D0.5b) | ⏳ D1 for pages | `kit-source.test.ts` |
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

## §4.1 Spacing — ✅ FROZEN (Q1, Jess 2026-07-28): eight steps

```
  2   4   6   8   12   16   24   32
  │   │   │   │    │    │    │    └ between major regions
  │   │   │   │    │    │    └────── between blocks · card padding
  │   │   │   │    │    └─────────── dense card padding · table cell x-pad
  │   │   │   │    └──────────────── standard gap
  │   │   │   └───────────────────── inside a control
  │   │   └───────────────────────── icon-to-text gap  ⭐ most used
  │   └───────────────────────────── touching
  └───────────────────────────────── hairline nudge (pill y-padding)

  Migration cost ≈ 779 sites  (D2–D4)
```

**Why not the strict 4pt grid.** The 6-step alternative dropped 2 and 6, which
are what keep a dense table dense — losing them loosens every row and costs
orders per screen, against §1.3's budget — and it cost ≈2,225 sites instead of
≈779. Jess froze the 8 steps on `/ui`.

Dead: `10 · 14 · 18 · 20 · 22 · 33` and every arbitrary `p-[Npx]` /
`gap-[Npx]` / `m-[Npx]`.

**The scale is a RECORD the code reads, not a list to retype** —
`SPACING_SCALE` in `components/kit/tokens.ts` carries the eight steps with their
Tailwind suffixes, `/ui` draws them from it, and `kit-source.test.ts` scans
every kit file against it. A ninth step means editing that record, which is the
friction §0.3 asks for.

*(Until 2026-07-28 this scan enforced the six steps present in BOTH candidates,
so the ten D0.5a components were Q1-proof and the answer could arrive after
them. It cost zero component changes, as designed.)*

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

| Layer | z | Owned by | State |
|---|---|---|---|
| sticky table header | 10 | `DataTable` | ✅ D0.5c |
| toolbar / bulk bar | 20 | `PageShell` | ⏳ D6 — `PageShell` shipped, but no bulk bar renders through it yet, so layer 20 still has no class string |
| popover · dropdown · tooltip | 30 | Radix portal | ✅ D0.5b |
| modal · drawer | 40 | Radix portal | ✅ D0.5b |
| toast | 50 | sonner | ✅ shipped — sonner's own, the kit never writes it |

**No component may set its own z-index.** The ladder lives in ONE file —
`components/kit/overlay-layer.ts` — and `kit-source.test.ts` fails if any other
kit file writes a `z-` class at all. A chat needing a new layer has to come
here first, which is the whole point.

> **A picker inside a dialog needs no sixth layer** (D0.5b.1, written down
> because the next person will hit it). A `Select` at 30 opened inside a `Modal`
> at 40 painted UNDERNEATH it, because both Radix portals mount as SIBLINGS on
> `<body>` — and "a picker inside a dialog" is the commonest form pattern there
> is. **The fix is structural, not numeric**: `DialogFrame` publishes its own
> content node and every picker portals INTO it, so 30-above-the-dialog's-
> children is exactly right and this ladder is untouched. Raising a number to
> fix a component is how fifteen levels happened the first time; a test asserts
> the ladder still reads 10 · 20 · 30 · 40 · 50.

| Rule | Enforcement | Status | Evidence |
|---|---|---|---|
| Only scale steps exist | Build Guard E (live over `components/kit/**` since D0.5b) | ⏳ D1 for pages | `kit-source.test.ts` |
| Only 4 radii | Build Guard E | ⏳ D1 | `check-design.mjs` |
| Only 2 border colours | Build Guard E | ⏳ D1 | `check-design.mjs` |
| Only 5 z-layers | **Component API** — one file names a layer, the rest cannot; Radix portals own 30/40 | ✅ **live (D0.5b)** | `overlay-layer.ts` · `kit-source.test.ts` |

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

Stroke    ✅ FROZEN (Q4, Jess 2026-07-28) — Lucide's default, 2.
          `Icon` has NO strokeWidth prop; a second stroke does not compile.
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
| Stroke is 2, and only 2 | **Type System** — `Icon` has no `strokeWidth` prop, so there is nothing to pass | ✅ **live (D0.5b)** | `Icon.tsx` |

> **§5.2 decides a `warning` survivor that §5.3 has no row for.** `Icon` carries
> §5.3's 40 meanings exactly, so `TriangleAlert` has no name and cannot be
> rendered. Reported by D0.5a rather than invented: a 41st meaning is a kit
> addition, not a component's decision. Same question one line down — §3.6 names
> a **held (🔒)** condition and §5.3's STATUS group has no `lock` row, only an
> ACTIONS one, so `StatusPill`'s icon is narrowed to the four STATUS meanings.

---

# §6 Box Dictionary

> ✅ **D0.5a landed the ten no-behaviour boxes. ✅ D0.5b landed the ten Radix
> ones.** All twenty live in `apps/web/src/components/kit/` and render on
> `/ui`. Nothing was written in this chapter before its component existed — a
> specification without a component is a specification 285 pages each
> re-implement differently, which is the failure this rewrite ends.

**D0.5a — no behaviour needed (structure + CSS):** ✅
`Button` · `Input` · `Textarea` · `SearchInput` · `Card` · `Panel` · `Badge` ·
`StatusPill` · `EmptyState` · `Loading` (+ `Icon`, §5).

**D0.5b — behaviour from Radix:** ✅
`Modal` · `Drawer` · `Select` · `DropdownMenu` · `Tooltip` · `Popover` ·
`Tabs` · `Checkbox` · `DatePicker` · `Toast`
(+ three internal extractions §6.6 demanded: `DialogFrame`,
`floating-surface.ts`, `overlay-layer.ts`).

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
| A kit component uses only the frozen §4.1 scale | **Build Guard** — source scan over `components/kit/**`, reading `SPACING_SCALE` | ✅ **live (D0.5a, re-pointed at the frozen scale in D0.5b)** | `kit-source.test.ts` |
| A surface that takes the screen is CONTROLLED | **Component API** — `Modal` / `Drawer` have no `defaultOpen` and hold no state | ✅ **live (D0.5b)** | `Modal.tsx` · `Drawer.tsx` |
| A surface that takes the screen must say what it is | **Type System** — `title: string` is required, and Radix makes it the accessible name | ✅ **live (D0.5b)** | `DialogFrame.tsx` |
| Placement is a component, never a prop | **Component API** — `Modal` and `Drawer` are two boxes; no `place` / `side` / `variant` prop exists | ✅ **live (D0.5b)** | `DialogFrame.tsx` |
| A menu row and a listbox row are DATA | **Component API** — `Select` and `DropdownMenu` take `options` / `items`, never `children` | ✅ **live (D0.5b)** | `Select.tsx` · `DropdownMenu.tsx` |
| There is no red menu item | **Component API** — no `destructive` member; a destructive command is an ordinary word | ✅ **live (D0.5b)** | `DropdownMenu.tsx` |
| A tab bar is a §8.2 stage picker | **Component API** — Radix fires `onValueChange` only on a CHANGE, so re-clicking the active tab is a no-op | ✅ **live (D0.5b)** | `Tabs.tsx` · `kit-behaviour.test.tsx` |
| A tooltip holds one line of text | **Type System** — `content: string`, so JSX cannot be put where a keyboard cannot reach it | ✅ **live (D0.5b)** | `Tooltip.tsx` |
| A date is ISO in, ISO out, and printed by `fmtDate()` | **Component API** — `DatePicker` takes and returns `YYYY-MM-DD` and renders through the one helper | ✅ **live (D0.5b)** | `DatePicker.tsx` |
| A toast has three kinds and no fourth | **Type System** — `ToastKind` is `success \| warning \| danger` | ✅ **live (D0.5b)** | `Toast.tsx` |

*(Values below are measured on `/ui` in a real browser, not read off the source.
D0.5b re-measured on the built bundle, 2026-07-28: canvas `rgb(240,240,243)` =
slate-3 · Select 32 high, radius 6, hairline `rgb(224,225,230)` = slate-5, type
13px · Checkbox 16 square at radius 4 · tab indicator `rgb(0,144,255)` = blue-9,
2px tall · DatePicker 32 high printing `19 Jul 26, Sun` · Toast white at radius
10 · Modal max-width 512, radius 10, z-index 40, scrim `rgba(28,32,36,0.4)` =
slate-12 at 40% · **69 icons, and `stroke-width` takes exactly ONE value: 2** ·
**font-weight takes exactly three: 400 · 500 · 600 — no 700 anywhere.**)*

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
frame is `FieldFrame.tsx` — §6.6 applied: the second occurrence was extracted
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

## §6.6 The rule that keeps this chapter closed

> **If a UI element appears a second time, it stops being inline and becomes a
> Foundation Component.** The first occurrence may be written in place. The
> second occurrence is a full stop: extract it first, then use it twice.

| Rule | Enforcement | Status | Evidence |
|---|---|---|---|
| Second occurrence must be extracted | Build Guard I (duplicated class string across ≥ 2 files) | ⏳ D1 | `check-design.mjs` |

D0.5b obeyed it three times before using anything twice: `DialogFrame` (a modal
and a drawer are one object placed differently), `floating-surface.ts` (five
primitives wanted the same white surface and the same row) and
`overlay-layer.ts` (§4.4's ladder, so no component picks a number).

## §6.7 `Modal` · `Drawer` — the surfaces that take the screen

Replaces the modal half of **63 files hand-rolling an overlay in 12+ shapes with
5 different backdrop colours**. Radix Dialog supplies the behaviour and nothing
else (§11): focus trap · escape · scroll lock · `aria-modal` · focus returned to
whatever opened it.

| | `Modal` | `Drawer` |
|---|---|---|
| Placement | centred | full height, right edge |
| Size | `max-w-modal` (512) · `max-h-dialog` (85vh), body scrolls | `max-w-drawer` (560), full height |
| Radius | `rounded-card` (10) | `rounded-l-card` — leading edge only |
| Scrim | `slate-12` at 40%, §4.4 layer 40 | same |
| Header | title `text-strong`, optional `text-meta` description, ✕ | same |
| Footer | optional; one `primary`, §3.4 | same |

**Both are CONTROLLED, always.** There is no `defaultOpen` and no internal
state: a surface that owns whether it is open is one a page cannot close after a
save succeeded, which is how a form submits twice.

**`title` is required** — a surface that blocks the page must say what it is,
and Radix uses it for `aria-labelledby`, so an untitled one is both an
accessibility failure and an unanswerable screen.

**Two components, not one with a `place` prop.** They answer different
questions: a Modal interrupts to ask something, a Drawer opens a RECORD beside
the list it came from — and §8.2 depends on the difference (*"close the drawer →
the table keeps its filter AND its scroll"*). A page choosing placement from a
prop can put a record in the middle of the screen.

**ONE size each, and §8 has not ruled them.** The values are named
`tailwind.config.ts` keys rather than numbers typed into a component, and
`PageShell` (D0.5c) writes the portal's width table and takes them over.

**What goes INSIDE a Drawer is not here** — identity · current action · current
issues · progress · sections · activity is §1.4's ordered slots, `DetailShell`,
card **D0.5c**.

## §6.8 `Select`

| | |
|---|---|
| Skin | `field-recipe.ts`, the same one `Input` wears — same height, hairline, focus ring, refusal red |
| Trigger | 32 high, `rounded-control`, chevron at the right in `slate-9` |
| List | white, `slate-5` hairline, `rounded-control`, §4.4 layer 30, as wide as the trigger |
| Row | 8/6 padding, `text-body`, blue-3 when highlighted, a 14px tick when chosen |
| Label · error | through `FieldFrame` — identical contract to `Input` |

**Not a native `<select>`**: it renders the OS's own list on Windows, cannot
show a tick beside the chosen row, and gives one control three appearances.

**Options are DATA, never children.** A children API lets a page put a pill, an
icon or a second line inside a row, and the appearance stops being the kit's
within a week. A row is a word and optionally a §5.3 meaning.

## §6.9 `DropdownMenu` — the ⋮ menu

| | |
|---|---|
| Surface | the §6.8 list surface, ≥160 wide |
| Item | word + optional 14px §5.3 glyph; `blue-3` highlight; 40% opacity when refused |
| Separator | a `slate-5` hairline — grouping, never decoration |
| Trigger | the caller's `Button`, handed Radix's behaviour by `asChild` |

**A menu carries no colour and has no `destructive` item.** §3.3 gives red one
job — *late · act now* — and a command is not a state; a destructive command is
an ordinary row whose WORD says what it does. Same ruling `Button` makes about
having no `danger` variant.

## §6.10 `Popover` · `Tooltip`

| | `Popover` | `Tooltip` |
|---|---|---|
| Surface | white, `slate-5`, `rounded-control`, 16 padding | `slate-12` fill, white ink, `text-meta` |
| Layer | 30 | 30 |
| Content | the caller's — a form, a list, a calendar | **one line of text, `content: string`** |
| Opens on | click | hover **and focus** |

`Popover` is §1.2's **Contextual Surface**: the answer for anything P3, because
it holds no permanent vertical height. It does not dim the page and does not
trap focus — if a thing must be answered before anything else can happen, that
is a `Modal`, and the difference is which component a page reaches for.

**A tooltip never carries the only copy of anything.** It is unreachable on a
touch screen, so a rule, a deadline or a refusal that exists only in a tooltip
is a fact half the portal's users cannot read.

> **Reported, not settled here:** §4.2 names its four radii by USE, and neither
> *popover* nor *tooltip* appears in any of the four lists. Both take the
> dropdown's 6 because that is what they are — a small surface hanging off a
> control — but the law does not say so, and it should.

## §6.11 `Tabs` — the module tab bar

| | |
|---|---|
| Bar | `slate-5` hairline underneath, 16 between tabs |
| Tab | `text-body`, `slate-11` at rest, `slate-12` when active or hovered |
| Indicator | a 2px `blue-9` BAR at the bottom of the active tab |
| Count | a `Badge`, and only where there is something to count |

**It is a STAGE picker and §8.2 already ruled what that means**: exactly one is
on, always; clicking the one that is on does NOTHING; no ✕ chip. Radix gives
that shape for free — a trigger fires `onValueChange` only on a real change — so
the rule holds by construction rather than by every page remembering it.

**It renders the BAR and no panels.** Every tabbed page in the portal is
deep-linked (`?tab=…`) and the panels belong to the router; a component owning
them would fight the URL and break every link Jess has bookmarked. §8.3's other
half — a module-tabbed page drops its breadcrumb and big title — is
`PageShell`'s `variant`, card D0.5c.

> **Reported:** the indicator is a background bar rather than `border-b-2`
> because §4.3 says borders are *"1px only… no coloured borders"*, while §3.5
> assumes tabs are underlined. The two sentences disagree; this is built the way
> that breaks neither, and the kit should settle it.

## §6.12 `Checkbox`

| | |
|---|---|
| Box | 16 square, `rounded-pill` (4 — §4.2 names a checkbox there by name) |
| Off | white, `slate-5` hairline |
| On | `blue-9` fill, white 14px tick |
| Some | `blue-9` fill, white **dash** |
| Label | part of the control — the whole row toggles |

**"Some" is a different SHAPE, not a different colour**, so it survives a
greyscale screenshot and a colour-blind reader. It is a real value
(`"indeterminate"`), not a class a page paints on, so a select-all over a
partial pick cannot be mistaken for "none". `DataTable` (D0.5c) is the consumer
it exists for.

## §6.13 `DatePicker`

| | |
|---|---|
| Trigger | the `Select` shape — field skin, 32 high, calendar glyph at the right |
| Reads | `YYYY-MM-DD`, or null |
| Prints | **`fmtDate()`** — `19 Jul 26, Sun`, §2.4's one spelling |
| Calendar | `react-day-picker` inside a kit `Popover`, week starts Monday |
| Empty | the placeholder in `slate-9`, and nothing else |

**`Input type="date"` is deliberately not allowed**: it opens the OS's own
picker, which is a different control on every machine and spells the date in the
machine's locale — the exact thing §2.4 forbids. §11 pins the calendar to
`react-day-picker` because **Radix has no calendar primitive**.

This shrinks §2.4's Human-Review debt by one control: a date field that speaks
ISO and prints through the one helper cannot hand a date to the locale.

## §6.14 `Toast`

| | |
|---|---|
| Surface | white, `slate-5` hairline, `rounded-card`, 16/12 padding |
| Tone | on the GLYPH only — a fully coloured card is a status pill the size of a card |
| Kinds | `success` · `warning` · `danger`. **No `info`** |
| Host | the ONE `<Toaster>` `App.tsx` already mounts |
| Layer | 50 — sonner's, and the kit never writes it |

§9's Success row: *"what changed; it never becomes a permanent block."* So the
kit exports a FUNCTION (`notify`) rather than something a page mounts — a
success a page has to render ends up as a green bar nobody dismisses.

**There is deliberately no `info` toast**: a message with no consequence has not
earned an interruption.

**It reuses the existing host and changes no existing caller.** The ~40 pages
still calling `toast.success(...)` keep sonner's own look until D2–D7 move them;
a second host would stack two toasts in two corners.

---

# §7 Table Dictionary

> ✅ **Written by D0.5c.** `DataTable` is **extracted from the Orders table**,
> not designed fresh — every value below is a property
> `OperationOrdersControl` already had. A `DataTable` designed in the abstract
> would not fit it, and D6 would rebuild it.

| | |
|---|---|
| Width | `table-fixed` + a PERCENTAGE colgroup — the table is ALWAYS exactly the container width, so it **never scrolls sideways**; long content ellipsis-truncates |
| Row height | **40px fixed.** Content adapts to the row, never the reverse |
| Overflow | every cell clips its own and never wraps — a wrapping cell is what makes one row taller than the rest |
| Head | sticky, §4.4 layer 1, `slate-3` band with a `slate-5` hairline, `text-label` |
| Header word | comes from the COLUMN DEF, and there is nowhere else to type it |
| Selection | optional. Absent = **no checkbox column at all**; present = whole-row select + a select-all showing the indeterminate DASH on a partial tick |
| Row click | opens the record (§8.2); the checkbox cell stops the event, so ticking never opens |
| Hover · selected | §3.5 — one faint blue tint · the stronger `blue-3` wash. Never grey |
| Alignment | `align` and `numeric` per column; `numeric` is tabular figures (§2.3) |
| Empty | an `EmptyState`, never a blank body |
| Loading | a skeleton — shape, not words |

**It formats nothing.** Money is `Money` / `.t-num` and a date is `fmtDate()`
(§2.3 · §2.4); a table that formatted them would be a second date spelling. It
decides where a value sits and whether its figures line up, and stops.

**Still not specified, and named so nobody assumes otherwise:** sort · density ·
pagination · the action cell. Orders carries its own of each today, and each is
a decision rather than an extraction — they land with **D6**, the card that
re-lays that page out.

Today: **26 files hand-roll a `<table>`, in 7 header shapes, in two opposite
visual languages** (dark header + white text ×6, light grey header + grey text
×5). **Neither has died yet** — D0.5c wrote the component and migrated no page;
D6 and D7+ retire the 26.

| Rule | Enforcement | Status | Evidence |
|---|---|---|---|
| A list table never scrolls sideways | **Component API** — `table-fixed` + percentage widths are the component's, not the caller's | ✅ **live (D0.5c)** | `DataTable.tsx` |
| A row is 40px and a cell never wraps | **Component API** — the height and `whitespace-nowrap` are the component's | ✅ **live (D0.5c)** | `DataTable.tsx` |
| A header word is typed once | **Type System** — `label` lives on the column def and the `<th>` reads it | ✅ **live (D0.5c)** | `DataTable.tsx` |
| "Some rows selected" is a real state | **Type System** — the select-all takes `boolean \| "indeterminate"` | ✅ **live (D0.5c)** | `Checkbox.tsx` · `DataTable.tsx` |

---

# §8 Page Dictionary

> ✅ **§8.1 is BUILT (D0.5c).** The rest of this chapter — sidebar width, side
> rail width, drawer width, max content width, minimum supported screen,
> responsive rules and **form layout** — is still unwritten, and D0.5c did not
> invent any of it. Form layout in particular has no home at all today.

## §8.0 The floorplan catalogue is CLOSED

Every in-scope page renders **exactly one `PageShell`** and declares **one
`variant`** from a closed set. There is no `custom`, no free-form page, and no
in-scope page that renders no shell.

**The catalogue is full at four** — `list · dashboard · detail · settings`.
Adding a fifth is a **governance event** under the same discipline
`ORDER-DETAIL-INFORMATION-MODEL` §7② applies to persistent facts: it requires
naming the **user task** that no existing floorplan can serve. *"This page is a
bit different"* is not a task and is not an argument.

**The closure is the feature, not a side effect of having four.** A page that
fits none of them means either the task was misunderstood or a real gap was
found — and finding a gap is something the kit decides, never a licence to
draw. A catalogue big enough to hold every page is the same as no catalogue.

**The floorplan is chosen by the user's TASK, not by the data's shape.** Two
pages over identical rows can be two floorplans, because the two readers arrive
with different questions — which is the Business Thinking Model's *same page,
three people, three entry questions* reached from the page side.

| Rule | Enforcement | Status | Evidence |
|---|---|---|---|
| Every page declares one floorplan from a closed set, and the set is full at four | **Type System** — `variant` is a closed union of exactly the four; `"custom"` does not compile | ✅ **live (D0.5c)** | `PageShell.tsx` |

*(The second half of this principle — **a page component that renders no
`PageShell` fails the build** — is already law as §0.1's "No hand-rolled page
shell", and §1.3's "a list page cannot add an 8th band" already carries the
variant's type consequence. Only the CAP was missing, so only the cap is added:
one concern, one row.)*

## §8.1 The `PageShell` slot contract (decided · built)

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
| One interaction model for every list page | Component API — the FRAME is `PageShell` / `DataTable`; the filter behaviour still lives in each page | ⏳ **D6** — the components exist, no page renders through them yet | `PageShell.tsx` · `DataTable.tsx` |
| A module-tabbed page has no breadcrumb/title | **Component API** — the title band does not draw when no title is given, and there is no breadcrumb slot to pass | ✅ **live (D0.5c)** | `PageShell.tsx` |
| Facet group order | **Human Review** | ⚠ **debt** | — |

> **Reported by D0.5c:** §8.3 says that once `PageShell` lands the module-tab
> exception *"stops being an exception at all: it is `variant`, not a rule
> somebody has to remember."* §1.3 gives four variants — list · dashboard ·
> detail · settings — and **none of them means "module-tabbed"**, so the shell
> expresses it by the title being absent, which is still a thing to remember.
> Either §1.3 gains a fifth variant or §8.3's sentence is wrong; both are the
> kit's call, and no variant was invented here.

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
| **Success** | a toast — `notify()` (§6.14, sonner) ✅ **D0.5b** | what changed; it never becomes a permanent block |

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

## §10.1 How a word reaches a screen

> **Words are delivered by the system, not remembered from a document.**

One dictionary, one word per concept, a reason for every banned word — which
`COPY-STANDARD` already is — **plus the words travelling with the thing that
renders them**, so a surface cannot be built without them.

**A rule that must be remembered is enforced by whoever happens to be reading.**
That is not a hypothetical here: `Chase` was banned and still shipped, survived
a week in the drawer, and was caught by a **source scan** — not by anybody
remembering the document. A word that ships with the component that renders it
cannot be forgotten by a chat that never opened the document.

**Measured 2026-07-28, so the size of the gap is on the record:**
`packages/shared/src/order-action-words.ts` delivers **three of the five
COPY-STANDARD strings, for one module.** Every other module's words, and the
other two strings, are recall.

**This chapter still copies no word.** It owns the DELIVERY — that a string
arrives with its component — and `COPY-STANDARD` owns which string it is.

| Rule | Enforcement | Status | Evidence |
|---|---|---|---|
| A component may not spell a business word; it receives one from the dictionary module | Build Guard — a scan for a COPY-STANDARD label literal inside `components/**` | ✅ **live (D1)** | `check-design.mjs` rule N |

*(Two components already hold this by construction and are the shape the scan
generalises: `StatusPill` spells no word, and `Icon` carries §5.3's meanings
rather than any label.)*

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
Exempt: `pages/dealer/**` (POS, Part B), `pages/print/**` and
**`styles/pos-prototype.css`**.

> **The third exemption is D3's, and it is a SCOPE CORRECTION rather than a
> fix.** §15 puts Part B out of scope; `pages/dealer/**` was excluded by PATH,
> and the POS's own stylesheet does not live under that path. It held **249 of
> rule A's 430 hex hits — 58% of the colour baseline was one file no card is
> allowed to touch.** A number nobody may act on is not a target; it is noise
> standing where a target should be, and it would have made every colour card
> look 58% incomplete for ever. **A 430 → 181 on the day the exemption landed,
> and none of that drop is work anyone did.**

## §13.2 Ratchet

| Stage | Behaviour | Card | State |
|---|---|---|---|
| 1 | Warn only; write the baseline count | D1 | ✅ **live** — `scripts/check-design.mjs`, baseline in `scripts/design-guard-baseline.json` |
| 2 | Warn + CI report; the baseline may only go down | D2–D4 | ⏳ — built, switched on by `--strict` |
| 3 | **Fail the build** | D5 | ⏳ — `--strict` becomes the default |

**Stage 1 counts and never fails.** That is the point: the baseline is the
measurement the codemods (D2–D4) are scored against, and a guard that failed on
day one would have had to be switched off on day one.

**The guard reads the token records; it retypes nothing.** The eight spacing
steps, four radii, six type tokens, three weights, three icon sizes and forty
icon meanings come out of `components/kit/tokens.ts` and `components/kit/Icon.tsx`
at runtime — so a ninth step is picked up by editing the record, and the scan
cannot drift from the law the way the §16 percentage did.

**Stage 3 is blocked while the PENDING register is non-empty.** ✅ It is empty
since 2026-07-28, so D5 is no longer blocked on a DECISION — only on D1–D4
being built.

## §13.3 Rules

| Rule | Fails on | Frozen? |
|---|---|---|
| A | any raw hex literal in JSX | ✅ |
| B | the Carres flame outside the logo component | ✅ |
| C | a Lucide `size` ∉ {14, 16, 18}; an emoji used as an icon; an icon name outside §5.3 | ✅ |
| D | `text-[Npx]`; a typography token outside §2.1; a weight outside §2.2 (700 is dead) | ✅ **frozen** |
| E | a spacing / radius / border value outside §4 (the 8-step scale) | ✅ **frozen** |
| F | a `z-` class anywhere in `pages/**` | ✅ |
| G | a raw `<table>`, `<input>`, `<select>`, or a `fixed inset-0` overlay in `pages/**` | ✅ **frozen** |
| H | a `PageShell` whose fixed chrome exceeds its variant's budget (§1.3) | ✅ **frozen** |
| I | the same class string ≥ 40 chars repeated across ≥ 2 files (§6.6) | ✅ **frozen** |
| J | a kit artifact that declares no kit edition (§0.3) | ✅ **frozen** |
| K | an artifact claiming to outrank this file (§0.3) | ✅ **frozen** |
| L | a browser-persisted UI-shape key under `pages/**` (§0.4) | ✅ **frozen** |
| M | a persisted / query / storage key built from a display string (§0.5) | ✅ **frozen** |
| N | a component spelling a COPY-STANDARD business word (§10.1) | ✅ **frozen** |
| O | a colour class outside §3's palette — `text-base-500`, `bg-red-50` … (§3.1) | ✅ **frozen (D3)** |
| P | a colour class bound to a legacy brand alias — `bg-primary`, `btn-hero` … (§3.1) | ✅ **frozen (D3)** |
| Q | a colour written into an inline `style={{ … }}` (§3.1) | ✅ **frozen (D3)** |

**All seventeen are implemented and measured.** J–N are the five mechanisms card
D0.6 wrote into §0.3 · §0.4 · §0.5 · §10.1. **O–Q are D3's**, and the reason
they exist is the one number worth remembering from that card:

```
                                       BEFORE D3      AFTER D3
  colour sites in scope ..............     6,385         6,129
  measured by SOME rule ..............       435         5,545
                                            6.8%         90.5%
```

**HOW THAT IS COUNTED** — stated because a figure the generator does not produce
must carry its method, and D2 is why: two independent reviews read byte-identical
source and got 3,971 and 3,975 for one quantity. **The source agreed and the
counting did not.**

> *Colour sites* = the sum of the colour rules over §13.1's scope — `A + B + O +
> P + Q` from `scripts/design-guard-baseline.json`, **plus** the two legacy
> recipe families no rule owns, counted over the same file list with the guard's
> own comment stripper: `\bpill-[a-z]+\b` = **247** and
> `\bbtn-(?:primary|secondary|soft|ghost|danger|hero)\b` = **337**.
> *Measured* = the rules only. **BEFORE** reads O · P · Q at the values D3 first
> measured them at, since the code they count predates the rules.
> The surface SHRINKS by 256 because 249 Part B hexes left scope, 10 were
> converted, and rule B's net +3 stayed.

**A and B measured hex. The colour debt is not hex** — it is 4,661 palette
classes, 594 legacy brand aliases, 111 inline colours and 584 legacy `.pill-*` /
`.btn-*` recipes, and until D3 none of it was counted by anything. **D5 cannot
ratchet what nobody measures**, which is the whole reason a colour card's first
output is a ruler rather than a codemod.

> **`.pill-*` and `.btn-*` are in the SURFACE and in no RULE**, deliberately.
> They are component adoption (§3.6's `StatusPill`, §6.1's `Button`), which is
> D6/D7's, and a rule that flagged them would be a rule no colour card may act
> on. They are counted so the denominator is honest.

> **Rule B could not see the flame it exists to find, and that is why it read
> clean.** The live assignment is `--primary: 13 64% 47%` — HSL — while B matched
> `#C44D2B` only, and the one appearance of that hex on the line is a trailing
> comment which the stripper correctly blanks. B reported 5, none of them that
> assignment, while **594 class uses render flame.** B now derives the HSL from
> the law's own hex and counts both spellings: **5 → 8.**
>
> **The two spellings are not the same colour.** Integer HSL cannot hold
> `#C44D2B`; `13 64% 47%` renders **`#C54C2B`**, one unit out on every channel.
> Invisible on screen, decisive for a codemod — D3 converts on EXACT hex
> equality only, so the rounding can never produce a wrong substitution.
> **Reported Only:** which of the two is the real flame is §3.4's question.

### The baseline, re-frozen by D3 on 348 files

```
  A   171  a raw hex literal              I   298  a repeated class string
  B     8  the flame outside the logo     J     3  no kit edition declared
  C   145  an icon outside §5             K     0  an authority claim
  D    33  a type value outside §2        L     8  a persisted UI shape
  E  1727  a §4 value                     M     2  a key built from a label
  F    78  a `z-` class in pages/**       N     0  a component spelling a word
  G   683  a hand-rolled box              H     0  a PageShell over budget
  O  4661  a colour class outside §3      P   594  a legacy brand alias
  Q   111  a colour in an inline style
                                          ─────────────────────────────────
                                          8,522 findings
```

**Every movement from D1's own baseline is declared, because two of them go UP
and a baseline that moves silently is worth nothing:**

| Rule | D1 | D2 | D3 | Why |
|---|---|---|---|---|
| A | 442 | 430 | **171** | −249 the Part B **scope correction** (§13.1) · −10 **conversions D3 actually made** |
| B | 8 | 5 | **8** | −1 `lib/pdf/**` now skipped as it already is for A · **+4 the HSL spelling B could not see** |
| O · P · Q | — | — | **4661 · 594 · 111** | new rules; first measurement |

**Fifteen of the seventeen are proved able to FIRE**, by
`scripts/check-design.selftest.mjs`: it writes one file per rule that breaks
exactly that rule, re-runs the guard and asserts the count went up. **A rule
reporting 0 is either clean or broken, and from the outside those look
identical** — the first draft of L and M reported ZERO on the three sites R2 had
already found by hand, because the key was a `const` two lines above the call.
J is proved instead by its 3 live hits. **H is the one rule with no proof of
life**, said out loud rather than left looking clean: provoking it means editing
`PageShell.tsx`, which belongs to another card.

**Two controls beyond the per-rule ones, and each was proved able to FAIL before
it was trusted.** The comment stripper's (D2) puts a real violation behind a URL
and behind `accept="image/*"`. **The flame's (D3) asserts `+2`, not `+1`** — one
per spelling — because a `+1` passes with the HSL half deleted; run with that
half removed it reports `expected +2, got +1` and exits 1. Rule Q's brace
counter is proved the same way: replaced with a `[^}]*` window it stops seeing a
style object containing a template literal, its provocation goes dead and the
live count silently drops 111 → 109. **A control that cannot fail measures
nothing.**

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
*(Regenerated by `node scripts/check-design.mjs --report`. **Do not hand-edit
the block below** — three cards did, each adding to the figure in front of it,
and by D0.6 the published number was nine points adrift of its own tables.)*

<!-- UI-HEALTH:START — generated by scripts/check-design.mjs --report. Do not hand-edit. -->

```
                         enforced / total
  Typography    ░░░░░░░░░░     0%     0 / 3
  Colour        ██████░░░░    60%     3 / 5
  Spacing       ███░░░░░░░    25%     1 / 4
  Icons         ██████████   100%     4 / 4
  Components    █████████░    93%    14 / 15
  Table         ██████████   100%     4 / 4
  Layout        █████░░░░░    50%     3 / 6
  Hierarchy     ██████████   100%     7 / 7
  ──────────────────────────────────────────
  TOTAL         ████████░░    75%    36 / 48
```

| | Count | Meaning |
|---|---|---|
| Rules | **48** | design rules stated in §1–§8 |
| **Enforced** | **36** | Type System / Component API / Build Guard / ESLint is live |
| Scheduled | 9 | a card exists |
| **Blocked on a decision** | **0** | ✅ the PENDING REGISTER is empty |
| **Human Review debt** | **3** | nobody has found a mechanism |

36 + 9 + 3 = 48.

**Coverage — 36 / 48 = 75.00%.** Counted from the Enforcement
column of every rule table in §1–§8, by `check-design.mjs --report`. **No card may
add to this figure by hand** — three cards did, and by D0.6 the published number
was nine points adrift of the tables it claimed to summarise.

**Governance and copy rules are outside this count**, as they always have been:
§0 and §10 carry **10** more rule rows. Widening the denominator would read
36 / 58 = 62.07% on a day nothing got worse, so it is stated, not taken.

**Every ✅ points at a file that exists in the repo** — checked, not asserted.

<!-- UI-HEALTH:END -->

**The D0.6 arithmetic, shown so it can be checked:**

```
rules      47  +  1  =  48     §8.0's cap. The other four principles landed in
                               §0.3 · §0.4 · §0.5 · §10.1 — governance and copy,
                               outside this count by its own definition
enforced   35  +  1  =  36     §8.0 is born enforced: `PageShell.tsx` ships the
                               variant union as a closed set of exactly the four
                               §8.1 names, so a fifth floorplan does not compile
coverage   74.47%  →  75.00%   ⬆  +0.53
debt          3    →      3    unchanged — no rule was added with Human Review
blocked       0    →      0    unchanged
```

**The baseline it starts from is NOT the one this block used to print, and that
is the finding this card carries.** The published figure was **34 / 52 =
65.38%**. Counted off the tables by script — every row of a
`Rule · Enforcement · Status · Evidence` table in §1–§8, and nothing else —
`main` actually carried **35 / 47 = 74.47%**. The whole gap is one section: §16
credited **Components 13 / 19** where §6 has **14 / 15**. D0.5a, D0.5b and D0.5c
each ADDED to the figure in front of them instead of re-counting, so one wrong
number propagated silently through three cards.

**This block's own opening sentence predicted it** — *"a hand-maintained
percentage is prose, and prose drifts; that is the whole thesis of this
document."* It had drifted. **D1's `--report` generator is not a nicety; it is
the only thing that makes this number true**, and until it lands every card that
touches §16 must COUNT rather than add.

**Why §8.0 is born enforced, which is the whole reason the number went up.** The
reference review's own arithmetic said this rule *"lands in the same PR as
`PageShell.tsx`"* — rule and mechanism together — and warned that landing it
alone would tick the number down. D0.5c shipped `PageShell.tsx` first with the
variant union closed at exactly §8.1's four, so by the time the rule was
written its mechanism was already live. **The order the PM fixed —
`D0.5c → D0.6 → D1` — is what bought that**, and it is the concrete case for
*"the components are built first, and consolidation writes down what exists."*

**The D0.5b arithmetic, shown so it can be checked** (health rule 1 says
coverage may never go down, and rule 2 says the debt may never grow):

```
rules      38  +  8  =  46     the eight new §6.7–§6.14 Component-API rules
enforced   12  +  8  =  20     each of the eight arrives with its mechanism
             +  2  =  22     plus TWO that were already written and became
                             structure: the icon stroke (Q4 frozen → the prop
                             is gone) and the five-layer ladder (§4.4 → one
                             file may name a layer, asserted by a source scan)
coverage   31.58%  →  47.83%   ⬆
debt          4    →      4    unchanged — no rule was added with Human Review
blocked       3    →      0    ⬇ Q1 · Q3 · Q4 frozen by Jess
```

**Nothing was counted because a card exists** — every ✅ in §1–§8 points at a
file that fails today if the rule is broken. Two rules deliberately did NOT move
to ✅ even though D0.5b built half of each: *"no hand-rolled modal/drawer"*
(§0.1) and the spacing/weight Build Guards (§2.2 · §4.1) are live over
`components/kit/**` and not over the 225 pages, which is **D1**'s job. Counting
a half-built mechanism is how a coverage number stops meaning anything.

**The D0.5a arithmetic, kept for the audit trail:**

```
rules      33  +  5  =  38     the five new §6.0 Component-API rules
enforced    3  +  9  =  12     status-is-a-pill · action-tone-from-a-condition ·
                               icon size · icon meaning · lucide-only-in-the-kit ·
                               plus the five §6.0 rules
coverage   9.09%  →  31.58%    ⬆
```

**Two health rules:**

1. **Coverage may never go down.** A PR that adds a rule without an Enforcement
   raises the denominator and lowers the number — visible in CI.
2. **Human Review debt may never grow.** Adding a rule enforced only by a human
   requires either a mechanism in the same PR, or a card that names one.

| Rule | Enforcement | Status | Evidence |
|---|---|---|---|
| Coverage never decreases | Build Guard (report mode, ratchet) | ✅ **live (D1)** | `check-design.mjs --report` |
| Human Review debt never grows | Build Guard (report mode, ratchet) | ✅ **live (D1)** | `check-design.mjs --report` |

---

## Appendix — the measurements this rewrite is built on

Taken 2026-07-27 across `apps/web/src`:

| | |
|---|---|
| Pages | 285 (225 in scope; `operation/` = 118) |
| Shared components | 19 |
| Pages using `ListPageShell` / `PageHeader` | 10 / 1 — **274 hand-roll a shell** |
| **Re-measured by D1's guard, 2026-07-29** | **348 files in scope · 9,511 findings** — A 442 hex · B 8 flame · C 146 icon · D 6,081 type · E 1,765 §4 · F 78 `z-` · G 684 hand-rolled box · I 294 repeated class string · J 3 no edition · L 8 persisted UI shape · M 2 key-from-a-label. **D is larger than the 2,556 below because it also counts Tailwind's own ramp and the dead weights**, which §2.1 and §2.2 both forbid; the row below counted `text-[Npx]` only |
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
| Radix packages installed | **8 since D0.5b** — `colors` + `react-dialog` · `react-dropdown-menu` · `react-popover` · `react-tooltip` · `react-select` · `react-checkbox` · `react-tabs`, plus `react-day-picker` (Radix has no calendar). **None of it reaches the operator's bundle**: `/ui` is the only consumer and it is a lazy route, measured — 0 Radix markers in `index-*.js`, all of them in the showcase chunk |
| `shadcn/ui` installed | **no** — `components/ui/` does not exist |

**What D0.5a and D0.5b changed against this table** (2026-07-28): twenty
Foundation Components exist and `/ui` renders them, so the *shell · table ·
modal · input* row of the "Died" list is now only half true — `<input>` and
`modal/drawer` both have a box; **shell and table are D0.5c**. **None of the 225
pages has moved yet, on purpose**: neither card touches an existing page, and
the codemods (D2–D4) plus the page cards (D6, D7+) are what burn the 2,556
hard-coded sizes down. This appendix is re-measured by **D1**.

---

—— End of UI-KIT.md ——
