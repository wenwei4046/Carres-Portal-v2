# ⑧ UI-KIT rebuild — the D line

> **TEMPORARY FILE.** This is migration work, not law. When the last card ships,
> **delete this file** — `docs/UI-KIT.md` §12 says so, and the permanent law must
> not carry a work-list that goes stale.
>
> **Kickoff sentence for a new chat:**
> *"Read `docs/UI-KIT.md` fully, then `docs/ui-kit-execution-queue.md`. Do card
> D__ and only card D__. Report at the end: what contradicts the real code · what
> would confuse a new hire · what could not be built as written · what the queue
> does not cover."*

---

## Where this stands (2026-07-28)

| | |
|---|---|
| On `main` | `ba7b7798` D0 law + doors · `19cad8e4` merge · `d83ecf98` §1.4 hierarchy · **`c9966ee3` T2 drawer** · **`a548ddc9` D0.5a (PR #498)** · **`d77bd4f6` D0.5b (PR #502)** · **`2d5aaddb` D0.5b.1** · **`929fa746` D0.5c (PR #505)**. **The whole D0.5 block is merged**, and `docs/UI-KIT.md` no longer marks any of it `⏳` (D0.6, 2026-07-29) |
| **`/ui` is LIVE** | **https://erp.carresofficial.com/ui** — public, no login, also on `pos.carresofficial.com/ui` and both `pages.dev` apexes. **Deployed from main tip `d77bd4f6` (PR #502, D0.5b) and it now shows the FROZEN RECORD, verified in a real browser**: the heading is `Frozen decisions`, `Pending decisions` is gone, `Candidate B` is absent, and all four answers render. It did its job — Jess answered Q1 · Q3 · Q4 there, and the page is now the record rather than the question |
| Deployed to prod | ✅ **YES — corrected 2026-07-28.** `git merge-base --is-ancestor c9966ee3 10f49add` passes, and `10f49add` is the live web tip in CLAUDE.md §17.1 (`index-c7LT9aSQ.js`, PR #492). **T2 has been in front of users since that deploy.** This row previously read *"NOT YET… nobody has seen it in a browser"* — it went stale when a parallel line shipped a bundle containing it. |
| Next thing that matters | **T3 — Jess uses the reordered drawer for one day.** **No longer blocked**: the deploy it was waiting for already happened. T3 is a Jess task, not a build card. **Deliberately scheduled AFTER the Purchasing line finishes** (Loo, 2026-07-28: P2 · C8b · R8 first). The reason is the point of T3 — it tests whether the Information Hierarchy helps, and a review run while three chats are still changing screens measures the churn instead of the hierarchy. **Re-scheduled 2026-07-28: it now runs after P5**, not after R8 — Loo ruled that R8 is a words card and does not close Purchasing, so the review waits for the module to be finished AND used (P5 puts a real PO through it). **Do not offer T3 to a chat before P5 has merged**, and do not read the delay as T3 being optional. |

**The one-sentence reason this line exists.** The kit was frozen once already
(2026-07-16) with the same claim of being the only design document, and the
codebase still reached 2,556 hard-coded font sizes across 225 files. What
survived was everything expressible as a CSS class (`.btn-*` 343 uses, `.pill`
72); what died was everything needing structure — **274 of 285 pages hand-roll a
page shell, 26 hand-roll a `<table>`, 63 a modal, 134 an `<input>`.** So the
deliverable is Foundation Components, not a better document.

---

## The cards

| Card | What | State |
|---|---|---|
| **D0** | The law: `docs/UI-KIT.md` rewritten, 16 chapters + §1.4 Information Hierarchy | ✅ `ba7b7798` + `d83ecf98` |
| **D0.1** | Shut the doors that taught the old law | ✅ `ba7b7798` |
| **D0.2** | This file | ✅ |
| **T1** | Freeze the Order Panel information hierarchy | ✅ `d83ecf98` (UI-KIT §1.4) |
| **T2** | Apply it to the order drawer — reorder + Current Issues | ✅ `c9966ee3` |
| **T3** | **Jess uses it for one day** | ⏳ **UNBLOCKED 2026-07-28** — the deploy already happened (T2 rode PR #492's bundle). Waiting on Jess, not on code |
| **T4** | Freeze as Detail Blueprint v1 → Delivery/Payment/Purchase/Service Detail inherit | ⏳ after T3 |
| **D0.3** | Delete the retired design docs + the `carres-design` skill | ⏳ after the new kit is proven |
| **D0.4** | **Retire the old order-portal master spec completely** — move what is still true, prove nothing was lost, delete the file, kill every pointer | ✅ PR #491 |
| **D0.5a** | Foundation components, no behaviour + **`/ui`** — renders Q1/Q3/Q4 for Jess to freeze | ✅ **built 2026-07-28** — full card below |
| **D0.5b** | Foundation components, Radix | ✅ **SHIPPED 2026-07-28, PR #502 `d77bd4f6`, deployed** — full card below. The gate opened: Jess froze Q1 · Q3 · Q4 |
| **D0.5b.1** | **P1 follow-up** — a picker inside a dialog renders UNDER it. Scoped card below | ✅ **shipped on main** (`2d5aaddb`) |
| **D0.5c** | `PageShell` + `DataTable` + `DetailShell` — **extracted from Orders, not designed fresh** | ✅ **CLOSED as components-only** (PM, 2026-07-29), merged as PR #505 `929fa746`. The drawer is NOT migrated; real-page adoption is D6 |
| **D0.6** | **KIT-CONSOLIDATION** — write the five frozen reference principles into the law, once. Full card below | ✅ **CLOSED 2026-07-29** — §8.0 · §0.3 · §0.4 · §0.5 · §10.1, the mirror re-based, §16 counted. Findings below, all Reported Only |
| **D1** | Build Guard over all 225 files, **warn only**, write the baseline | ✅ **BUILT 2026-07-29** — `scripts/check-design.mjs`, 348 files, 14 rules, 9,511 findings frozen. §16 is generated. Card below |
| **D2** | codemod **typography** | ✅ **BUILT 2026-07-29 · accepted with revisions at PM review the same day** — 4,052 conversions in 236 files; guard rule D **3,239 → 33**, and all 33 are `index.css`. Card below |
| **D3** | codemod **colour** | 🔨 **CLAIMED 2026-07-29** — branch `claude/carres-portal-d3-execution-0be46e`, worktree `carres-portal-d3-execution-0be46e`. **PM approved Option A: Phase 1 (the ruler) + Phase 2 (15 deterministic conversions) ONLY.** Phase 3 (`--primary` flame → blue) and Phase 4 (`base-*` → kit palette) are **NOT in this card** and each needs its own. Card below |
| **D4** | codemod **spacing** | ⏳ — baselined at E 1,727 |
| **D5** | Guard → **Fail**. Blocked while the PENDING register is non-empty | ⏳ |
| **D6** | Orders list: 7 bands → 3 (11 rows → 14-15 visible) | ⏳ — **also carries the `.t4-*` legacy migration** (PM, 2026-07-29). D2 found a SECOND retired ramp: 9 classes, **44 in-scope uses across 8 files**, invisible to rule D because a page writes only the class name while the size and weight sit in `index.css`. **`.t4-hero-num` is `20px/700`** and `lib/design-standard.ts:132` records that 700, so a §2.2-dead weight still renders. Ruled **Reported Only for D2**: it is a visual change on a money figure and belongs with the pages when they migrate. **D6 owns the DEFINITIONS and the mirror's `weight: 700`** |
| **D7+** | Delivery · Purchase · Receiving · Stock · Service · Payments · Catalog — one card each | ⏳ — whichever of these owns a file still writing `.t4-*` retires it there, so the last card to migrate does not inherit the ramp's deletion |

**Order is not negotiable for D0.5 → D6.** Rebuilding a page before the
components exist means hand-rolling it twice.

---

## D0.4 ✅ — the old order-portal master spec is DELETED (PR #491)

Loo, 2026-07-28: *"Retire it completely. Do NOT leave it as an archive or historical
authority."* It is gone — no archive, no stub, no "historical reference" file. Its own third
line claimed to OUTRANK the kit, so any chat that opened it built the wrong thing while
believing it had followed a locked spec.

**Where each section went.** `RETIRED` = the current law already overwrote it ·
`MOVE` = still true, had no home · `CHECK` = proved already homed by quoting the target.

| § | Verdict | Where it is now |
|---|---|---|
| 0 Jess's working rules | **MOVED** | `CLAUDE.md` §15 — the six that were missing. The "3 options per proposal" rule was NOT moved: `CLAUDE.md` §0 step 5 rules the opposite. Reported to Loo |
| 1–6 look & layout | RETIRED | UI-KIT §2–§8 |
| 7 no-KPI + counterparty panel | RETIRED | UI-KIT §1.4 rule 3 + C2's drawer (`CallsPanel`) |
| 8 dials & checklist marks | **CHECK ✅** | `STATUS-STANDARD.md` §1 *"A 30px donut … whose FILL fraction and COLOUR are the state"*, §2 *"20px rounded mark, shape-first"*. Its NEXT-verb list died with C1/C3 |
| 9 Items tab | RETIRED (layout, D7) + **MOVED** (words) | `Book in` / `GRN` / `Receive` were already banned in COPY-STANDARD; **`Reserved` → `Ready`** is a new row there, scoped to an ORDER LINE only |
| 10 Balance tab | **CHECK ✅** | `ORDERS-WORKING-FLOW.md` §3 *"outstanding = Σ order lines + add-ons + chargeable storage − `orders.paid`"* — one shared rule, `packages/shared/order-money.ts` |
| 11 **storage rates** | **CHECK ✅, and CORRECTED** | `packages/shared/src/schemas/ops-order-control.ts` *"MS/BF = RM150 per commenced 30-day month over the window. Sofa = the first 14 days of the window free, then a flat one-time RM200."* CLAUDE.md and OPS-BUILD-BRIEF both said "RM200/2wk" — a RECURRING fee the code has never charged. Both rewritten |
| 12 Delivery tab | RETIRED | ① Delivery line (D1 · T1-T11) |
| 13 WhatsApp templates | **MOVED** | `ORDERS-WORKING-FLOW.md` §3 "What we send"; the literal bodies stay in `apps/web/src/lib/wa-templates.ts` |
| 14 · 14.5 staff assignment | **MOVED** | `ORDERS-WORKING-FLOW.md` §3 "How the PIC is decided" — the whole live rule (0232 + 0235). The PO-duty half was already owned by `PURCHASING-WORKING-FLOW.md` |
| 14.6 purchasing | deleted 2026-07-28 | — |
| 14.7 import reconciliation | **CHECK ✗ → MOVED** | `docs/autocount-import-contract.md` §7. That file had no trace of it and still said re-import "must upsert" — the opposite of 0214. Overwritten with create-only + the 0237 append door + the `clean` test |
| 16 · Build order | RETIRED | — |

**Deliberately NOT carried over:** the §14.7 FIX-DATA worklist (five named imported orders).
CLAUDE.md's standing law is that every imported row is test data and no cleanup card may be
written for one — the list dies with go-live.

**Pointers killed: FIVE, not the three this card predicted.** The card measured
`docs/OPS-BUILD-BRIEF.md` · `docs/STATUS-STANDARD.md` · `docs/UI-KIT.md`, and missed
`docs/execution-queues-index.md` and **`scripts/check-design-standard.mjs`**, where RULE D and
RULE F both cited the dead spec as the authority for a live CI failure message. Repointed at
UI-KIT §2.1 and §7. A `grep -rn` for the deleted file's name over the whole repo returns
**0** — including this file, which is why the name is not written down here either.

---

## T3 — the next card, in full

**This is the only card in the line whose result is not a diff.**

Deploy `c9966ee3` (web only — T2 touches no `apps/api` file, no migration), then
Jess opens real orders for a day and answers **three questions only**:

```
1  Did I find things faster?
2  Did I know where to start looking?
3  Is there a block I always skip?
```

**Do not ask whether it looks good.** T2 changed no colour, no font, no spacing —
if the answer to 1 and 2 is no, the Information Hierarchy is wrong and §1.4 gets
re-ruled. That is the hypothesis being tested, and it is the whole point of
having reordered instead of rebuilt.

**Deploy recipe** (CLAUDE.md rules, unchanged): `git fetch` → `git log
HEAD..origin/main` empty → build from the main tip → deploy to **both** Pages
projects `--branch=main` → re-curl all 4 canonicals and poll until they converge
→ download the bundle to a file before grepping (a piped `curl | grep` on ~4 MB
truncates and reports a false 0).

**Proof markers for the shipped bundle** — grep BOTH directions:

| Present in the new bundle | Absent from the old one |
|---|---|
| `Current issues` | same string |
| `lines have no PO` | same string |
| `No delivery date confirmed` | same string |
| `holding delivery` | same string |

---

## D0.5a ✅ — the ten boxes exist, and `/ui` is real (2026-07-28)

**Ten Foundation Components** in `apps/web/src/components/kit/` — `Button` ·
`Input` · `Textarea` · `SearchInput` · `Card` · `Panel` · `Badge` ·
`StatusPill` · `EmptyState` · `Loading`, plus `Icon` (§5) and two internal
extractions §6.6 demanded (`FieldFrame`, `field-recipe`). **`/ui`** renders all
of them in every §9 state and is routed public and lazy, so a kit reference
never rides the operator's bundle (it built as its own 23 kB chunk).

**Zero existing pages touched**, which is what the queue's lane rule requires of
this card: `git diff --stat` outside `components/kit/**` and `pages/dev/**` is
`tailwind.config.ts` (additive keys only), `App.tsx` (one route) and the docs.

**The three decisions this card was NOT allowed to make, and did not.** Q1 · Q3
· Q4 render side by side on `/ui` and **no component depends on any of them** —
the kit is built from the six spacing steps present in BOTH Q1 candidates, uses
no `font-bold`, and takes Lucide's own stroke. A source scan
(`kit-source.test.ts`) fails if anyone edits a kit padding off that safe set, so
the property survives the next hand. **Freezing Q1 either way costs zero
component changes**, which is the reason components could ship before the
answer.

**The one thing that could not be built as the law words it.** §2.1's tokens are
`t-page … t-label`; `.t-body` is ALREADY the retired v17 ramp's 14px/400 in
`index.css`, live in 5 files. Taking the name would have re-sized pages this
card may not touch, so the classes are `text-page … text-label` (Tailwind
`fontSize` entries carrying size + weight + line-height in one class — a
stronger shape than a CSS class, and `text-[Npx]` never appears). UI-KIT §2.1
records the mapping and hands the rename question to **D2**.

**Enforcement, not documentation** — every rule this card added is a type or an
API, never a sentence: no kit component accepts `className` or `style` (11 ×
`@ts-expect-error`), `Icon`'s `name` is §5.3's 40 meanings and `size` is 14|16|18,
`StatusPill`'s tone is `OrderActionTone` so a page cannot invent one, `Badge`
has no tone at all, and `Button` has no `danger` variant. §16 moves **9.09% →
31.58%** with the Human Review debt unchanged at 4; the arithmetic is printed in
§16.

**Measured in a real browser, not asserted** (`vite preview`, `/ui`, computed
styles): canvas `rgb(240,240,243)` = slate-3 · card border `rgb(224,225,230)` =
slate-5 · radius 10 · primary button `rgb(0,144,255)` = blue-9 at radius 6,
height 32 · danger pill red-3 on red-11 at radius 4 · all six type tokens exactly
24/600/32 · 20/600/28 · 15/600/22 · 13/400/18 · 12/400/16 · 11/500/14.
**A screenshot could not be taken** — the harness reported the Browser pane not
displayed — so the evidence is the computed-style read, which is stronger for
tokens anyway.

**Five findings, reported not fixed** (they are the kit's to rule, not a card's):

1. **§3.6 lists six tones; `OrderActionTone` has five.** No `money` member, so
   `tone="money"` does not compile. Whether the money track gets its own colour
   changes what the ACTION ENGINE may return — a business decision.
2. **§5.2 picks `TriangleAlert` as the `warning` survivor and §5.3 has no row
   for it**, so the kit has no warning glyph and cannot render one.
3. **§3.6 names a held (🔒) condition; §5.3's STATUS group has no `lock`.**
   `StatusPill`'s icon is narrowed to the four STATUS meanings until it does.
4. **§13.4's screenshot gate has no CI job** — the page now exists, the image
   diff does not. Named in §13.4 and parked on D1.
5. **`lib/status-pill.ts` maps a status WORD to a legacy pill class** and is
   still the live renderer for the unmigrated pages — a second status renderer
   until D2–D7 move them. Left alive on purpose; deleting it would restyle
   pages this card may not touch.

---

## D0.5b ✅ — the Radix half, and the register empties (2026-07-28, PR #502, DEPLOYED)

**Ten more Foundation Components** in `apps/web/src/components/kit/` — `Modal` ·
`Drawer` · `Select` · `DropdownMenu` · `Tooltip` · `Popover` · `Tabs` ·
`Checkbox` · `DatePicker` · `Toast` — plus the three internal extractions §6.6
demanded before anything was used twice: `DialogFrame` (a modal and a drawer are
one object placed differently), `floating-surface.ts` (five primitives, one
white surface and one row recipe) and `overlay-layer.ts` (§4.4's ladder).
**Eight Radix packages installed**, plus `react-day-picker` — §11 pins the
calendar there because Radix has none.

**Zero existing pages touched**, same lane rule as D0.5a: outside
`components/kit/**` and `pages/dev/**` the diff is `tailwind.config.ts` (three
additive keys), `src/test/setup.ts` (jsdom polyfills), the guard's file list,
and docs.

**None of it reaches the operator's bundle, and that was measured rather than
assumed.** `/ui` is the only consumer and it is a lazy route, so the built main
chunk greps **0** for `data-radix-popper-content-wrapper`, `DropdownMenuTrigger`
and `rdp-`, while the showcase chunk carries all three. The behaviour half of
the kit costs an operator nothing until a page adopts it.

### The freeze, applied

Q1 · Q3 · Q4 were answered by Jess the morning this card ran. Each answer became
a mechanism rather than a sentence:

| | Answer | What it changed in the code |
|---|---|---|
| Q1 | 8 steps | `kit-source.test.ts` stopped enforcing the two-candidate intersection and started enforcing `SPACING_SCALE` — the law's own record, read, never retyped |
| Q3 | 700 deleted | a kit file that writes `font-bold` now fails that scan. The 158 page uses are **D2's codemod**, deliberately not touched here |
| Q4 | stroke 2 | **`Icon` lost its `strokeWidth` prop.** D0.5a carried one so `/ui` could draw both candidates; deleting it is the enforcement |

`/ui` stopped ASKING and started RECORDING: the "Pending decisions" section is
now "Frozen decisions", and a test asserts the page no longer renders a
candidate B or a 1.5 stroke. **A page still posing a settled question is how a
settled question gets re-opened.**

### Rules that became structure, not prose

Eight new §6 rules, each arriving with its own mechanism — a modal that is
always controlled and always titled · placement being a COMPONENT and not a prop
· menu and listbox rows being DATA and not children · no red menu item · a tab
bar that is §8.2's stage picker by construction · a tooltip that can only hold
one line · a date that is ISO in, ISO out and printed by `fmtDate()` · a toast
with three kinds and no fourth. Plus two rules that already existed as words and
became structure: the icon stroke and §4.4's five-layer ladder.

**§16 moves 31.58% → 47.83%**, Human Review debt unchanged at 4, blocked-on-a-
decision **3 → 0**; the arithmetic is printed in §16. Two rules deliberately did
NOT move to ✅ even though half of each was built — *"no hand-rolled
modal/drawer"* and the spacing/weight guards are live over the kit and not over
the 225 pages, which is D1's job.

### Three law conflicts found, reported, not settled in code

1. **§4.3 forbids what §3.5 assumes.** §3.5 says *"underline tab hover — darken
   the text"*, and §4.3 says borders are *"1px only… no coloured borders"* — so
   the usual `border-b-2 border-blue` breaks the law twice. The indicator is a
   background bar instead, which breaks neither, and the kit should settle it.
2. **§4.2 names its radii by USE and has no row for a popover or a tooltip.**
   Both take the dropdown's 6 because that is what they are; the law does not
   say so.
3. **§3 has no scrim.** A modal backdrop is not in the colour chapter at all, so
   it is `slate-12` at 40% — the nearest thing the law does name.

Two more, reported as facts rather than conflicts: **modal and drawer widths
have no home** (§8 writes the portal's width table at D0.5c, so they are named
config keys until then, not numbers typed into a component), and **`Button` had
to start forwarding its ref** — every `asChild` trigger anchors on the trigger's
DOM node, and a Button that eats the ref makes all four overlays open in the
wrong place, silently, because React only warns.

### What the test environment taught, written down so nobody re-learns it

`jsdom@25` has **no `PointerEvent`**, measured (`typeof PointerEvent ===
"undefined"`). `fireEvent.pointerDown` therefore dispatches a plain `Event` that
React's pointer plugin ignores — so a Radix **menu**, which opens on
pointerdown, silently stays shut and reads as a broken component. A Radix
**popover** opens on click and is fine. The menus are opened with the KEYBOARD
in tests, which is the better assertion anyway.

Also: a source scan must strip comments first. The `font-bold` rule failed on
`tokens.ts` — the file whose comment EXPLAINS that 700 is dead. A scan that
punishes the explanation teaches people to delete the explanation.

### Verification

`tsc -p tsconfig.app.json` clean · `pnpm --filter @carres/web lint` clean · the
web suite at baseline (**2182 passed / 16 pre-existing**, the documented four
files, zero new) · `pnpm build` clean · and **measured in a real browser** on
the built bundle (`vite preview`, computed styles): canvas slate-3 · Select 32
high at radius 6 on a slate-5 hairline, 13px · Checkbox 16 square at radius 4 ·
tab indicator blue-9, 2px · DatePicker 32 high printing `19 Jul 26, Sun` ·
Modal max-width 512, radius 10, z-40, scrim slate-12 at 40% · **69 icons with
exactly ONE stroke-width, 2** · **font-weight takes exactly three values, 400 ·
500 · 600, and no 700 appears anywhere on the page.**

A screenshot could not be taken — the harness reports the Browser pane not
displayed, and the viewport reads 0×0, which is why the modal's measured WIDTH
is 2px while its max-width is the correct 512px. For tokens the computed-style
read is the stronger evidence anyway.

### The deploy receipt

**PR #502, merge `d77bd4f6`, web `index-DcRxJK0f.js` + `UiShowcase-B8cQuG6T.js`**
(carres-portal `289584ec` + carres-pos `385aea4d`, both `--branch=main`;
`wrangler pages deployment list` names Production/main source `d77bd4f` the
newest writer; all four canonicals converged after one poll cycle).
`SERVICE_ROLE` **0** in both files.

**The proof lives in the SHOWCASE chunk, not the main bundle** — `/ui` is lazy,
so none of its strings are in `index-*.js` at all. Against the predecessor chunk
(`UiShowcase-OPW5MQkO.js`, fetched from its own deployment URL because a
superseded asset 404s at the apex): `Pending decisions` **1 → 0** ·
`Candidate B — 6 steps (strict 4pt)` **1 → 0**; `Frozen decisions` ·
`Deleted into 600` · `Lucide default —` · `Radix slate-3` · `Open a modal` ·
`Open a drawer` · `Record the delay decision` · `tab-indicator` · `date-picker`
· `dialog-overlay` each **0 → 1**; `dropdown-menu` **0 → 6**.

**`Candidate A — 8 steps` greps 1 in BOTH, and that is correct rather than a
null result** — the string survived while its meaning changed from *one of two
candidates* to *the frozen answer*, which is exactly why the retired sibling is
the load-bearing marker. **A marker deliberately not used:** `stroke 1.5` was
built from a template (`stroke ${stroke}`), so that literal never existed in
either bundle.

**Radix confinement measured on the live files**:
`data-radix-popper-content-wrapper` · `DropdownMenuTrigger` · `rdp-` · `radix`
grep **0 · 0 · 0 · 0** in the main bundle and **1 · 2 · 4 · 64** in the showcase
chunk.

**Verified in a real browser** at `https://erp.carresofficial.com/ui`: the
heading is `Frozen decisions`, `Pending decisions` is gone, `Candidate B` is
absent, all four answers render, and the computed styles match §6 — **69 icons
with exactly one `stroke-width` (2)** and **font-weight taking exactly 400 ·
500 · 600, no 700 anywhere.**

**No api deploy, checked not assumed**: `git diff aa70cd45..d77bd4f6 --
apps/api packages/shared supabase/migrations` is empty, so R8's Worker
`0b2640bc` already matches this tip; `GET /health` returns 200. No migration —
the repo tail stays `0305`.

**Gates at baseline on the deployed tip**: web **2200 passed / 16 pre-existing**
(the four documented files) · shared **1949/1949** · api **3 pre-existing** ·
lint clean · `tsc` clean · build clean.

---

## PENDING decisions — ✅ EMPTY (2026-07-28)

| # | Question | Answer |
|---|---|---|
| Q1 | Spacing scale — 8-step `2 4 6 8 12 16 24 32` (~779 sites) or 6-step `4 8 12 16 24 32` (~2,225 sites) | ✅ **Candidate A, the 8 steps** |
| Q3 | `font-bold` (700, 158 uses) — delete into 600, or keep as a fourth weight | ✅ **Deleted into 600** |
| Q4 | Icon stroke — Lucide default 2, or 1.5 | ✅ **Lucide default, 2** |

Frozen earlier: **Q2 page canvas = Radix `slate-3`** · **Q5** Current Issues is
its own block · **Q6** the KPI boxes merge into Progress · **Q7** Current Action
never collapses · **Q8** it is called `Progress`, not `Timeline` · **Q9** issues
group by goods · delivery · money.

**The gate is open and D0.5b is built.** `D5 "Guard → Fail"` is no longer
blocked on a decision — only on D1–D4 existing.

**The one thing worth remembering from how this ran.** D0.5a shipped ten
components while the answers were still open, by building them from the six
spacing steps present in BOTH candidates and holding that with a source scan. It
cost **zero component changes** when the answer arrived — the freeze re-pointed
one test and deleted one prop. A card that had waited for the answer would have
shipped the same ten components a week later.

**T3 is untouched by any of this** and still waits for P5 (see the table at the
top). The PM's *"T3 may run in parallel"* was about SEQUENCING and Loo's row is
about TIMING; neither cancels the other, and T3 never gated D0.5b.

---

---

## D0.5b.1 — a picker inside a dialog renders UNDER it (P1, scoped by the PM 2026-07-28)

**The defect.** §4.4 puts popovers on **30** and dialogs on **40**. Both Radix portals mount as
SIBLINGS on `<body>`, so a `Select`, `Popover` or `DatePicker` opened inside a `Modal` or `Drawer`
paints underneath the dialog. *A picker inside a dialog* is the commonest form pattern there is —
the first real form in a modal hits this.

**Found by comparison, not by a bug report.** Two chats built D0.5b; the second (PR #501, closed as
superseded) had carried a fix the merged one does not. On `main`, `container` greps **0** in
`DialogFrame.tsx`, `Select.tsx`, `Popover.tsx` and `DatePicker.tsx`.

**Not reachable on `/ui` today** — the shipped demo modal contains no picker, checked on the live
page. Nothing is visibly broken; this is a trap, not an outage.

### The fix, and why it is not a number

The obvious repair is to raise the popover layer above 40. **That is how fifteen z-levels happened
the first time**, and §4.4 is frozen. Instead: **the dialog publishes its own content node, and a
picker portals INTO it.** Inside the dialog's stacking context, 30-above-the-dialog's-children is
exactly right, so **the ladder is untouched**.

### Scope — the PM's, verbatim, and nothing beside it

```
IN    portal container for Select · Popover · DatePicker inside a Dialog
IN    the negative-control test
OUT   redesign of anything
OUT   any other D0.5b work
```

### Acceptance

1. A `Select` opened inside a `Modal` is a DOM **descendant** of that dialog.
2. The same for `Popover` and `DatePicker`.
3. Outside a dialog all three still portal to `<body>` — the fix must not move the normal case.
4. **`Z_LADDER` is byte-identical.** A diff that touches a z-value has missed the point.
5. Negative control: remove the `container` from `Select`'s portal → exactly the Select test fails.
6. Gates at baseline; no visual change (`git diff` introduces no hex, no `text-[`, no `h-[`).

### Reported by the build, for the PM to rule

**`DropdownMenu` and `Tooltip` have the identical defect** — same portal shape, same two layers,
one line each to fix. They are NOT in this card's scope because the scope names three components,
and the scope came from a report that had listed only those three. **They are left open
deliberately and said out loud**, because this line already paid for the opposite mistake once:
*"closing the old door is not the optional half — leaving it open while filing a CF looks
disciplined and behaves like a trap."*

---

## D0.5c ✅ CLOSED — components only (PR #505 `929fa746`, DEPLOYED 2026-07-29)

> **Deploy receipt.** web `index-ydv91zJ9.js` + `UiShowcase-qyt-I2oo.js`
> (carres-portal `7fca85d7` + carres-pos `064595c2`, both `--branch=main`;
> `wrangler pages deployment list` names Production/main source `929fa74`; all
> four canonicals converged on the first poll; `SERVICE_ROLE` **0** in both
> files). **No api deploy, no migration** — `git diff aa70cd45..929fa746 --
> apps/api packages/shared supabase/migrations` is empty and the tail stays
> `0305`.
>
> **Zero visual change, proved by checksum rather than by inspection.** The
> operator's main bundle is 4,500,781 bytes before and after, and once the lazy
> chunk's filename is normalised the two are **md5-identical**
> (`0d551c1b…` both sides). The only change in the bundle every operator
> downloads is the hash in the `/ui` chunk's name.
>
> **One marker would have read as a false positive.** `page-shell` greps 4 in
> the live main bundle — and 4 in the predecessor, because it is the POS's own
> `.page-shell` class in `pages/dealer/DealerPos.tsx` (Part B, out of §1–§14
> scope). The kit's own markers — `data-table` · `detail-shell` ·
> `detail-current-issues` · `persistentFacts` — grep **0** in the main bundle
> and are present only in the lazy chunk.
>
> **No Orders regression:** no file with `order` in its name is in the diff at
> all, and the suite held at **2230 passed / 16 pre-existing** in the same four
> documented files.

**All three shells exist**, extracted from the live Orders implementation, and
`/ui` renders them. **No page renders through any of them, and that is the
card's final shape** — the PM closed D0.5c as components-only.

| | Built | Migrated |
|---|---|---|
| `PageShell` | ✅ from `components/ListPageShell.tsx` | ⏳ **D6** (Orders) then D7+ |
| `DataTable` | ✅ from `OperationOrdersControl.tsx`'s table | ⏳ **D6** |
| `DetailShell` | ✅ to L4 exactly — all seven constraints | **not in this card** — see the ruling |

### ✅ RULED BY THE PM, 2026-07-29 — no Persistent Facts strip on the drawer

**The decision: do NOT add a Persistent Facts strip to the Order drawer, and do
NOT turn §7② into law.** D0.5c closes as components-only; the drawer is not
migrated here, and real-page adoption belongs to **D6**.

The PM's four reasons, recorded verbatim in substance: Persistent Facts is
explicitly **RESERVED, NOT YET LAW** · the frozen drawer ruling says the header
carries **ZERO order data** · D0.5c requires **zero visual change** · adding the
strip would create a new layout **and reverse a frozen ruling**.

**What this leaves standing, and it is worth being exact about.**
`DetailShell` still implements L4 as frozen — `identity.persistentFacts` is a
required 4-tuple and the shell renders it — because the ruling is about the
DRAWER, not about the contract. So the component is complete and correct, and
what is deferred is the migration. The first page to render through it (D6, or
whichever card follows the Persistent Facts law) is where the four facts get a
home.

**The evidence the ruling was made on, kept so nobody re-derives it:**

**L4 makes `persistentFacts` a required 4-tuple**, and §7② of the information
model names the four: **客户名 · Ref · the promised date · outstanding.** The
shell renders them, because a prop nobody reads is the disease this codebase
keeps naming.

**On the live drawer those four facts do not sit together, and one block
explicitly refuses to carry them.** Measured, not assumed:

```
客户名      CustomerIdentityCard, in the left rail
Ref         the header strip — "#1256"
promised    the journey strip / the Delivery card
outstanding the money card (C5's ONE Outstanding)
```

The drawer's header carries a comment from Jess, rev 4: **"ZERO order data here
— the identity lives in the Customer card below."** So rendering the drawer
through `DetailShell` means creating a four-fact strip that does not exist
today, which is (a) a **visual change**, and this card's own acceptance
criterion 3 is *zero visual change*; (b) **permanent vertical height**, which
§1.1's four-question gate must rule; and (c) a **reversal of a ruling Jess made
by name**.

It is also not obviously ripe: **§7② says Persistent Facts is "RESERVED, NOT YET
LAW … until it is, nothing here is enforceable"**, while §10's L4 — frozen the
same day — makes it a required type.

**The question that was asked, in one line:** *does the order drawer gain a
persistent four-fact strip (customer · ref · promised date · outstanding), or
does `DetailShell` wait until Persistent Facts is law?* — **Answered
2026-07-29: it waits.**

**Nothing was invented while it was open, and nothing was invented after.** The
component implements L4 as frozen; the drawer is untouched; §7② stays RESERVED.

### What was built

**`PageShell`** — extracted from `ListPageShell`, which is the live shell on 10
pages and already carries the geometry Jess ruled through July. What changed in
the move: it takes **no `className`** (§6.0), and **§1.3's budget became a
type** — `variant="list"` has no `kpi` slot at all, `variant="dashboard"` does,
and no variant has an `extraBand`. §8.1's *"an eighth band is not forbidden by a
sentence — it has nowhere to go"* is now literally true.

**`DataTable`** — extracted from the Orders table: `table-fixed` percentage
widths so it never scrolls sideways, 40px fixed rows that clip rather than wrap,
a sticky head reading §4.4's layer 1 from `overlay-layer.ts` rather than typing
a number, whole-row selection with a real indeterminate select-all, §3.5's
washes. **The header word comes from the column def** — C1 found `Manage`
surviving in a hand-written `<th>` while the Columns popover already read the
def, and now there is nowhere else to type it. It formats nothing: money and
dates stay `Money` / `fmtDate()`, or the kit would own a second date spelling.

**`DetailShell`** — L4's six ordered slots with all seven constraints as types,
and **no `state` prop**, which is L3 turned into a compiler rule.

### Three findings, reported not settled

1. **§1.3 and §8.1 disagree by 8px.** §8.1's band table sums to **208** against
   §1.3's **200** list budget. Neither was edited; a test pins 208, the 180 with
   no filter on, and §1.3's own 168 D6 projection, so the contradiction cannot be
   lost. Recorded in UI-KIT §1.3.
2. **§8.3 says the module-tab exception "stops being an exception… it is
   `variant`"**, but §1.3's four variants contain nothing meaning
   *module-tabbed*. The shell expresses it by the title being absent — still a
   thing to remember. Either §1.3 gains a fifth variant or §8.3's sentence is
   wrong. No variant was invented.
3. **L4 does not say which section is open.** A shell that renders §1.4's ⑤⑥
   must know, so `activeSectionId` + `onSectionChange` were added and are
   flagged here. Mechanics, not information architecture — but an addition to a
   frozen contract, so it is reported rather than assumed.

### What a TypeScript quirk cost, written down

**`@ts-expect-error` does not work on a JSX element that carries a
`{...spread}`** — TypeScript switches excess-property checking off, so
`<DetailShell {...BASE} emptyLabel="None" />` compiles happily and the directive
reports as *unused*. Two of the seven constraints (no `emptyLabel`, no
`children`) silently proved nothing until they were rewritten without a spread.
Measured, not guessed: that is exactly how they first failed.

### Verification

`tsc -p tsconfig.app.json` clean (which is where the seven `@ts-expect-error`
constraints are actually checked) · `pnpm --filter @carres/web lint` clean ·
`pnpm build` clean · web suite **at baseline: 2225 passed / 16 pre-existing**,
zero new · **negative control run**: make `currentIssues: []` render a container
and exactly the "renders NO issues container" test goes red, nothing else moves.

---

## D0.5c — the original card (`DetailShell` in full; the `PageShell` / `DataTable` halves keep their one-liners above)

**Written 2026-07-28, the day the Order Detail Information Architecture closed.** Its whole
input is [`docs/ORDER-DETAIL-INFORMATION-MODEL.md`](ORDER-DETAIL-INFORMATION-MODEL.md) §10 (L4),
which exists because UI-KIT §1.4's rules are meant to be enforced by TYPES rather than by memory.
**Read L4 before writing a line.** This card does not restate it; it says what to build.

**The card template, answered:**

```
Who uses it?            every operator who opens an order — and, once T4 lands,
                        every operator who opens a delivery, payment, purchase
                        or service case
How often?              every hour
If removed?             NO — a detail record with no shell is 285 files each
                        re-deciding where "what to do today" goes
Permanent height?       0px NEW — the shell replaces the drawer's existing
                        blocks, it does not add one
Priority?               P1
```

### Extracted from Orders, not designed fresh

`OrderDetailDrawer.tsx` already renders every one of these blocks — T2 put them in §1.4's order
and C2/C6 built the action list. **The shell is that arrangement lifted into named slots.** If a
slot needs markup the drawer does not already have, stop: either the drawer is missing something
(a bug, its own card) or the shell is being designed rather than extracted.

### The slot API

```ts
type Depth = "answer" | "context";          // evidence + detail are inside a slot's own content

interface DetailShellProps {
  identity:       IdentitySlot;             // required
  currentAction:  CurrentActionSlot;        // required — no collapsible, no hidden
  currentIssues:  Issue[];                  // [] renders NOTHING. There is no emptyLabel
  progress:       ProgressSlot;             // required — no events, no actor, no kpi, no actions
  sections:       DetailSection[];          // ordered; a section that cannot exist is absent
  activity?:      ActivitySlot;             // absent renders nothing
}

interface IdentitySlot {
  primary: ReactNode;                       // whose order — no action may be passed
  persistentFacts: [Fact, Fact, Fact, Fact];// EXACTLY four. A fifth means removing one
}

interface DetailSection {
  id: string;
  label: string;
  track: OrderActionTrack | null;           // "goods" | "delivery" | "money" | null
  detailHref?: string;                      // Detail is a ROUTE, never a render prop
  children: ReactNode;
}
```

**No `state` prop, and that is the point.** Working · Blocked · Waiting · Completed are produced
by what the slots receive (L4's table). A component that cannot be told a state cannot print one,
which is how L3's *"states never reach the screen"* stops depending on anyone remembering it.

### Type constraints — each one is a rule that currently has no enforcement

| # | Constraint | Replaces | Test |
|---|---|---|---|
| 1 | `CurrentActionSlot` has no `collapsible` / `hidden` | UI-KIT §1.4 rule 1, ⏳ | a `@ts-expect-error` test passing either prop |
| 2 | `currentIssues: []` renders null; no `emptyLabel` in the type | §1.4 rule 2, ⏳ | render `[]` → container absent; `@ts-expect-error` on `emptyLabel` |
| 3 | named ordered slots, never `children` on the shell | §1.4 "blocks cannot be reordered", ⏳ | DOM order asserted against §1.4's order |
| 4 | `ProgressSlot` has no `events` / `actor` / `timestamp` / `kpi` / `actions` | §1.4 rule 3 — **currently ⚠ Human Review debt** | `@ts-expect-error` ×5 |
| 5 | `persistentFacts` is a 4-tuple; `IdentitySlot` has no `onAction` | model §7② (prose only today) | `@ts-expect-error` on a 5th fact and on an action |
| 6 | `DetailSection.track` is `OrderActionTrack \| null` | §1.4 rule 4 — already a live union | `@ts-expect-error` on `"finance"` |
| 7 | Detail is `detailHref`, not a render prop | model §8 rule ③ (prose only today) | `@ts-expect-error` on a Detail render prop |

**Constraint 4 is the one that pays for this card on its own** — it turns UI-KIT's only
Human-Review debt in §1.4 into something that does not compile.

### Acceptance criteria

1. `DetailShell` exists and `OrderDetailDrawer` renders **through it** — not beside it.
2. All seven constraints hold, each with the test named above.
3. **Zero visual change.** Colour, type, spacing and icons are provably untouched: `git diff`
   introduces no hex, no `text-[`, no `h-[`, and `pnpm --filter @carres/web lint` reports no new
   violations. *This card moves structure. If the page looks different, something else happened.*
4. The web suite is at baseline — today **2029 passed / 16 pre-existing failures**. Zero new.
5. `tsc -p tsconfig.app.json` is clean, and the seven `@ts-expect-error` tests fail if their
   constraint is deleted.
6. A calm order renders **no** Current Issues container at all — not an empty one.
7. `progress` and `activity` never both claim what happened: a test asserting `ProgressSlot`
   receives no actor and no timestamp.

### Test checklist

- [ ] 7 × `@ts-expect-error` — one per constraint
- [ ] `currentIssues: []` → the container is absent from the DOM (not empty, absent)
- [ ] slot DOM order matches §1.4: identity → currentAction → currentIssues → progress → sections → activity
- [ ] `currentAction` renders with the rail collapsed (the T2 bug, as a regression test)
- [ ] the four states each render correctly **without any state being passed in**
- [ ] a section with `track: null` renders; `track: "finance"` does not compile
- [ ] **negative control** — delete constraint 2's null-return and confirm exactly the empty-issues
      test goes red, nothing else
- [ ] full web suite at baseline

### Migration scope

**In:** `OrderDetailDrawer.tsx` only — one consumer, one PR.

**Out, deliberately:** Delivery · Payment · Purchase · Receiving · Service Detail. They inherit at
**T4** (Detail Blueprint v1), and T4 is gated on **T3** — Jess using the drawer for a day. Porting
five pages before one has been used for a day is how a wrong shell reaches five pages.

**Also out:** `PosOrderDetail.tsx`. It is the customer-facing order view, not an ops record; L4
was written from the operator's six questions and has not been checked against a showroom's.

**Watch:** the drawer is ~7,600 lines and other lines touch it (J-cards, delivery T-cards). Take
the worktree rule seriously — one worktree, and check `origin/main` before starting.

### Implementation observations — NOT acceptance criteria

Recorded so the builder does not have to rediscover them. **They are observations, not rules**
(Loo, 2026-07-28): none of them is an IA law, none reopens L1–L4, and none is a pass/fail gate.

- **When the record scrolls, the header may collapse — but identity and the current action may
  not.** L4 says `currentAction` is always visible and stops there; our detail scrolls, so
  "always visible" needs a scroll answer. The one worth knowing: **do not pin the whole header**
  (that spends permanent height, §1.3) — collapse it to a single line that keeps *who this is*
  and *what can be done*. From `docs/ui-reference-review.md` R1 (SAP Fiori's Object Page), where
  it is filed as an observation for exactly this card.

### The trap this card is most likely to fall into

**Restyling while extracting.** The whole value is that structure moved and appearance did not,
so that if the page reads better afterwards it is provably the hierarchy that did it. The line's
own lesson list already carries this one — it is repeated here because this card is the largest
opportunity to break it.

---

## D3 🔨 THE COLOUR CARD — CLAIMED 2026-07-29 (Option A: Phase 1 + Phase 2 only)

**This line is held.** Branch `claude/carres-portal-d3-execution-0be46e`. A second chat opening D3
has taken this card.

**Why D3 is not shaped like D2, measured before anything was written.** D2 was safe because
typography had six tokens and a size→token map a machine could apply and a checksum could verify.
**Colour has neither.** In the guard's own 349-file scope (rule A reproduced byte-for-byte at 430):

```
  raw hex (rule A) ....................... 430
    styles/pos-prototype.css (§15 Part B) .. 249   ← 58%, and D3 may not touch it
    portal hex ............................. 181
      exactly equals a named token ......... 33  — but only 15 are UNAMBIGUOUS
      equals nothing the law names ......... 148  (69 distinct colours)
  flame hex (rule B) ....................... 5    ← and NONE is the live flame
  ─────────────────────────────────────── measured by NO rule ───────────────
  non-kit palette classes .................. 4,661  (4,577 are `base-*`)
  flame-derived classes .................... 613
  legacy .pill-* / .btn-* .................. 247 / 337
  inline style={{ …color }} ................ 116
```

**≈6,290 colour sites; the guard sees 435 of them — 6.9% — and 249 of those are out of scope.**

**Two facts decided the shape.** ① **An exact hex match is not automatically mechanical**:
`#FFFFFF` equals EIGHT tokens (`--card` · `--popover` · `--primary-foreground` ·
`--destructive-foreground` · `--danger-foreground` · `--success-foreground` ·
`--warning-foreground` · `--info-foreground`), and picking one is a decision about what the surface
IS. Unambiguous 1:1: `#1A1A1A`→`--foreground` (11) · `#D1D5DB`→`--base-300` (2) ·
`#4B5563`→`--base-600` (2) = **15 sites.** ② **Rule B structurally cannot see the flame it exists
to find** — the live assignment is `--primary: 13 64% 47%`, HSL, and rule B matches `#C44D2B` only,
whose only appearance on that line is in a comment D2's stripper now blanks. So B = 5 and not one
of the five is that assignment, while **613 class uses render flame.** D2's own lesson in its other
form: *you cannot check a ruler against nothing.*

### Scope — approved by the PM, and nothing beside it

```
IN   Phase 1  the RULER — guard scope correction, rule B learns HSL,
              new rules O · P · Q, self-tests, re-frozen baseline
IN   Phase 2  the 15 UNAMBIGUOUS hex conversions, byte-equal colour
OUT  Phase 3  repointing --primary to blue  → its own card + visual approval
OUT  Phase 4  base-* → kit palette          → its own card, page by page (D6/D7)
OUT  .pill-* · .btn-*                        → component adoption, D6/D7
OUT  pages/dealer/** · pages/print/** · styles/pos-prototype.css  → §15 Part B
OUT  any token VALUE, any colour DECISION, any UI-KIT rule but §13.3 and §16
```

**`--primary` is not touched by this card** — not repointed, not commented, not moved. §3.3 and
§3.4 already give the action colour to blue and keep the flame in the logo; **the live `--primary`
flame assignment stays a REPORTED-ONLY contradiction**, and resolving it re-colours 613 sites,
which is a business decision with a visual approval, not a codemod's.

> **Read the tip that merged, not the branch that shares its name — again.** A PM colour ruling
> commit (`4cf1d29e`, *"action stays BLUE, flame is brand only"*) exists on
> `claude/carres-d0-6-kit-consolidation-6ccfb5` and is **NOT on `main`**: `docs/UI-KIT.md` here has
> zero hits for its re-affirmation, and this table's D3 row still carried its pre-ruling text with
> the stale figures `A 442 · B 8`. This card's planning quoted that commit as live state and was
> wrong to; the substance is unaffected because the ruling is itself a re-affirmation of §3.3 /
> §3.4, which ARE on main. **Reported, not merged by this card** — merging another line's branch is
> not a colour card's business. D0.6 finding #6 wrote this lesson down and it recurred inside a
> week.

---

## D2 ✅ THE TYPOGRAPHY CODEMOD — BUILT 2026-07-29

**`scripts/codemod-d2-typography.mjs`** — mechanical, re-runnable, idempotent. **4,052 conversions
across 236 files**, and guard rule **D falls 3,239 → 33**.

```
  text-[Npx] → a §2.1 token ........ 2,735
  Tailwind's own ramp → a token .....  309
  the retired .t-* ramp → a token ...  844
  a dead weight → a §2.2 weight .....  164   (font-bold · font-black · font-extrabold)
                                     ─────
                                     4,052 conversions in 236 files
```

> **These are the figures against `origin/main`, re-measured at the PM's review on 2026-07-29.**
> They were taken on `e0a3c7a7`; main then moved to `cb3385eb` mid-review and the branch was
> rebased again — **those three commits touch `docs/` only and no file under `apps/web/src`,
> `scripts/` or `docs/UI-KIT.md`, checked rather than assumed**, so not one figure below moves.
> The first run scored 4,047 in 235 files against an OLDER main; the branch was then
> rebased, and the rebase brought in two Purchasing-P3 files the codemod had never seen. Re-running
> it converted 19 more sites and the tally is stated against the tree being merged, not against the
> tree the card started on. `--dry` now reports 0 — the run has converged.

**All 33 survivors are `index.css`** — the class DEFINITIONS — and they survive on purpose:
**110 uses of the `.t-*` ramp and 154 `text-[Npx]` live under `pages/dealer/**` and
`pages/print/**`**, which §15 and §13.1 put out of scope. Deleting the ramp would restyle Part B
from a card that may not touch it. **That also closes §2.1's open question with a NO**: the six
classes keep the `text-*` spelling rather than taking the law's `t-*` names, because taking the
names would restyle the POS one step later.

### The one thing that had to be measured before a single file was touched

Each §2.1 token is a Tailwind `fontSize` entry carrying size + line-height + **weight** in one
class, so `text-meta` sets 400. A site written `text-[12px] font-semibold` therefore has two
utilities both emitting `font-weight`, and **the winner is CSS SOURCE ORDER, not class order.** If
the token won, the codemod would have silently flattened every emphasised label in the portal.

Measured on this project's own Tailwind build rather than assumed: `.text-meta` lands at byte
22,105 and `.font-semibold` at 22,181 — **the explicit weight comes later and wins.** So an
explicit weight survives untouched, and the conversion is weight-safe. That single check is what
made the other 4,057 edits safe to make at all.

### The codemod's own first run was WRONG, and the failure is worth keeping

It rewrote the sentences that EXPLAIN the banned values. `kit-source.test.ts`'s
*"Three rules are new: no `font-bold`"* became *"no `font-semibold`"* — not noise, a **lie**, and
in the file whose whole job is to ban 700. `tokens.ts` lost the same way, twice. It also rewrote a
test's assertion regex, which would have turned a guard against the old value into a guard against
the value that replaced it.

**D0.5b had already written this lesson down** — *"a source scan must strip comments first… a scan
that punishes the explanation teaches people to delete the explanation"* — and a codemod commits
the identical error in the other direction. It now transforms **code segments only**, and skips
`*.test.ts(x)` entirely. Reverted whole and re-run; the kit's records are byte-identical.

### TWO DEFECTS IN D1'S GUARD, found by D2 and fixed under the PM's exception

Rule D reported **6,081**. It was counting **2,842 COLOURS as typography**: this repo's neutral
palette is `base`, so `text-base-500` / `text-base-700` matched `\btext-base\b` — the `-` after
`base` is a word boundary. **Only 5 of the 2,847 `text-base` hits were the type class.** A codemod
scored against that baseline would have reported "fixed 2,842" for touching nothing real, and a
careless one would have rewritten the colour palette.

Fixed with a `(?!-)` lookahead; rule D re-measured at 3,239 before the codemod ran. (`p-0` went
with it — `0` is the ABSENCE of spacing, not a ninth step.)

**Defect 2 — the guard punished the explanation.** It scanned COMMENTS as if they were code, so
`tokens.ts` was flagged twice for the sentence saying 700 is dead, and the flame rule counted a PDF
template's comment ABOUT the flame. **This is the exact lesson D0.5b wrote down for the kit's own
source scan, and D1 shipped without it.** Comments are now blanked before the value rules run —
blanked, not removed, so every reported line number is still real — while **J and K deliberately
keep reading the full source**, because an edition declaration and an authority claim both LIVE in
a header comment and a stripped copy would make those two rules incapable of ever firing. That
removed 25 more false positives: A 442→430 · B 8→5 · C 146→145 · E 1,727→1,725 · G 684→679.

**This is the case the PM's "do not revisit D1 unless a defect is found in the guard itself" was
written for**, and it is worth naming why defect 1 stayed hidden: rule D's number was the biggest
on the board, so it read as the most urgent work rather than the most wrong measurement. **The
codemod was the thing that found it — you cannot check a ruler against nothing.**

### Verification

`tsc` clean · lint clean · **web suite 2230 passed / 16 pre-existing** in the four documented
files, zero new · `pnpm build` clean · guard re-baselined · the self-test still fires on all twelve
provoked rules. **The generator touched nothing outside its markers** — proved by diffing the law
either side of the block: byte-identical.

### Findings, Reported Only

1. **`.t-micro` carried more than a size.** It is `11px/500 + uppercase + tracking-[0.05em]`, so
   converting it to `text-label` alone would have dropped the capitals on 104 labels. The codemod
   emits `text-label uppercase tracking-[0.05em]`. **The law rules neither uppercase nor tracking**,
   so preserving them is a codemod; dropping them would have been a redesign.
2. **Sizes above 24 collapse to 24** — `32 · 36 · 44` existed, and §2.1 says *"Nothing is larger
   than 24."* That is the law applied, and it is the most visible change D2 makes.
3. **`.t-num` was deliberately NOT converted.** §2.3 keeps it as law (tabular figures, slashed
   zero); it is not part of the retired ramp, and its 126 uses are untouched.
4. **Part B now has two type systems in one stylesheet** — the six tokens for the portal and the
   `.t-*` / `.pos-proto` ramp for the POS. That is what §15 asks for, but the shipped CSS still
   emits `font-weight: 700` **116 times** (re-measured 2026-07-29; this line first said 114), so
   *"there is no 700 anywhere"* is true of the portal and NOT of the bundle. Worth knowing before
   anyone greps the CSS as proof.
5. **THERE ARE TWO RETIRED RAMPS, NOT ONE, and finding #4 above is what hid the second one**
   (added 2026-07-29, from the parallel D2 review; §2.1 and §2.2 now carry it). Reading "the
   surviving 700 is Part B's" closes the question, and **one of the three survivors is not Part
   B's**: `.t4-hero-num` is `20px/700`, `lib/design-standard.ts:132` records that weight, and one
   in-scope page renders it. The whole `.t4-*` ramp is **9 classes,
   44 in-scope uses across 8 files**, and **neither the codemod nor rule D can see any of it**,
   structurally: rule D reads the values a page WRITES, and a page writes only `t4-hero-num` while
   the size and the weight live in `index.css`. §16's class-use table has counted `t4-* 33` all
   along with nothing connecting that number to §2.2's claim — **a number in the law is not the
   same thing as a number the law reads.** RULED Reported Only by the PM; **scheduled onto D6/D7**,
   see the queue table at the top of this file.

### PM REVIEW — accepted with revisions (2026-07-29). What the review changed

**1 · The rebase was already done and the re-run was not.** `origin/main` is `e0a3c7a7` and the
branch sits directly on it, so there was nothing to rebase — but the rebase had brought in two
Purchasing-P3 files (`OperationReceiving.tsx`, `RecordSupplierAnswerModal.tsx`) that the codemod
never saw, and **the guard was reading D at 51 against a baseline of 33**. Re-running converted 19
sites; D is 33 again and `--dry` reports 0.

**2 · The comment stripper could not see a string, and it failed in the flattering direction.**
Both readers — D1's guard and D2's own codemod — asked *"where are the comments?"* with the same
regex. `//` inside `href="https://…"` opened a line comment; `/*` inside `accept="image/*"` opened
a block comment that ran until the next `*/` anywhere below. Everything in between stopped being
counted and stopped being converted, **silently, and always as a smaller number.**

The question is answered once now, in **`scripts/lib/source-segments.mjs`**, by a scanner that
knows a string, a template's every `${…}`, and a regex literal from a comment. Measured across all
644 files of `apps/web/src`: **3,763 characters the regex wrongly blanked are now visible, and the
scanner blanks nothing extra** — a strictly one-directional change, so no comment became code.
It found a real hit the guard had been missing: a hand-rolled `<input>` at
`OrderDetailDrawer.tsx:6327`, hidden behind an `image/*` earlier in the file.

**Both shapes now have a negative control** in `check-design.selftest.mjs`, and each was proved to
FAIL under the old regex first — the `image/*` case needs a later `*/` in the same file or the old
regex finds no pair, blanks nothing, and the control passes for the wrong reason.

**3 · Baseline re-frozen** — `files 348 → 349 · E 1,725 → 1,727 · G 679 → 683`, D unchanged at 33.
**The two rises are named rather than absorbed:** +2 E and +3 G arrived with main's own P3 files
(measured on the rebased tree before anything in this review was touched), and the last +1 G is the
`<input>` the stripper fix revealed. `takenAt` now reads `D2`, because a baseline labelled `D1`
that D2 rewrote is exactly the stale fact this queue exists to prevent.

**4 · Two figures in the law corrected**, as instructed — `848 → 844` (§2.1) and `169 → 164`
(§2.2 ×2). **The PM's `843` is reported as `844` and the one-count difference is the point of the
re-run:** 843 was the pre-rebase figure and `RecordSupplierAnswerModal.tsx` contributes one more
`.t-tiny`. `164` matched exactly. Both were re-measured on `origin/main` with the fixed scanner,
not carried over.

**5 · Visual sanity check — what was and was not possible.** Order List, Order Detail and Dashboard
all sit behind an operation login, and reaching them means typing a password into a form, which is
not something a build chat does. What was checked instead, and it is the risk itself rather than a
proxy: **every one of the 4,052 conversions was classified by size delta**, because only text that
gets BIGGER can overflow or truncate.

| Surface | Conversions | Same size | Smaller | Weight-only 700→600 | **Bigger** |
|---|---|---|---|---|---|
| Order List | 128 | 94 | 7 | 10 | **17** |
| Order Detail | 309 | 277 | 4 | 19 | **9** |
| Dashboard | 72 | 56 | 7 | 2 | **7** |

**Every single "bigger" on all three surfaces is the sub-11px promotion the PM has already ruled
Reported Only** — 9px / 9.5px / 10px / 10.5px → 11px, a floor §2.1 states outright. There is no
other growth anywhere on the three pages. Of those 33 sites, **five sit on an element that can clip**
(`line-clamp-1` ×1, `whitespace-nowrap` ×3, a fixed 16px badge ×1); the badge is provably unaffected
and the other four widen a short label by 1–2px inside a flex row.

Measured in a real browser on the built bundle (`vite preview`, computed styles): the six tokens
render **24/600/32 · 20/600/28 · 15/600/22 · 13/400/18 · 12/400/16 · 11/500/14** exactly;
`font-weight` takes **three values only — 400 · 500 · 600, no 700**; and **an explicit utility still
wins over the token**, now proved for line-height as well as weight (`text-label leading-[16px]`
computes 11px/500/**16px**, so the right-rail badge keeps its 16px line box). `/login` and `/ui`
render with **zero document overflow and zero unintended truncation** — the only clipping on `/ui`
is the showcase's own deliberate truncation demo, and `/login`'s 2px `.scroll-cue` overflow is
pre-existing (D2 touches neither `Login.tsx` nor `Login.css`).

**Re-verified after all of the above:** `tsc` clean · lint clean · guard all fourteen rules `=`
against the re-frozen baseline · self-test fires on all twelve provoked rules plus the two stripper
controls · `pnpm build` clean · **web suite 2,240 passed / 16 pre-existing** in the same four
documented files, zero new · §16 regenerated byte-identically (75.00%, debt 3).

**A THIRD figure, reported rather than quietly edited — then RULED.** §2.1's *"the six tokens are
used **3,970** times in scope"* measures **3,971**. **PM, final review 2026-07-29: correct it in the
same PR, so every published figure stays internally consistent** — and the rule behind all three
corrections is his, stated in one line worth keeping: **measured repository state always overrides a
historical number.** That is also why `844` stands over the PM's own `843`.

---

## D1 ✅ THE BUILD GUARD — BUILT 2026-07-29

**`scripts/check-design.mjs`.** §13.1's real scope — **all of `apps/web/src`, 348 files**, not a
hand-maintained list. The previous guard read a 30-file allow-list and checked colour only, which
is why 225 files drifted while it reported clean.

**§13.2 stage 1: it counts and never fails.** That is the design, not a compromise — the baseline
is the measurement D2–D4 are scored against, and a guard that failed on day one would have been
switched off on day one. `--strict` is built and is what D5 switches on.

### The fourteen rules, and the baseline they froze

```
  A   442  a raw hex literal              I   294  a repeated class string
  B     8  the flame outside the logo     J     3  no kit edition declared
  C   146  an icon outside §5             K     0  an authority claim
  D  6081  a type value outside §2        L     8  a persisted UI shape
  E  1765  a §4 value                     M     2  a key built from a label
  F    78  a `z-` class in pages/**       N     0  a component spelling a word
  G   684  a hand-rolled box              H     0  a PageShell over budget
                                          ─────────────────────────────────
                                          9,511 findings, 348 files
```

**J–N are the five mechanisms D0.6 wrote into §0.3 · §0.4 · §0.5 · §10.1** — all five were `⏳ D1`
and are now `✅ live`, which is the whole reason D0.6 was allowed to write them with a named card
instead of a mechanism.

### Nothing in the guard retypes a token

The eight spacing steps, four radii, six type tokens, three weights, three icon sizes and forty
icon meanings are READ at runtime out of `components/kit/tokens.ts` and `components/kit/Icon.tsx`.
A ninth step is picked up by editing the record. **This is the direct answer to the §16 disease:**
the percentage drifted for three cards because it was retyped; the guard cannot drift because it
never holds a copy.

### §16 is GENERATED, and its two health rules are now a ratchet

`--report` parses the Enforcement column of every rule table in §1–§8, rewrites the block between
`<!-- UI-HEALTH:START -->` markers, and **fails** if coverage drops or the Human Review debt grows.
Proved by negative control: downgrade one ✅ and it exits 1 with
*"coverage 72.92% is BELOW the baseline 75.00%"*.

**It also caught a bug in its own first draft.** The generator read **33/48** where the tables said
**36/48**, because three Enforcement cells contain an ESCAPED pipe — ``​`size` is `14 \| 16 \| 18`​``
— and a naive `split("|")` reads the Status column out of the middle of the Enforcement cell. **The
generator was wrong and the hand count was right**, which is the opposite of what I expected and the
reason the two were compared at all.

### Twelve of fourteen rules are PROVED able to fire

`scripts/check-design.selftest.mjs` writes one file per rule that breaks exactly that rule, re-runs
the guard, and asserts the count went up. **A rule reporting 0 is either clean or broken, and from
the outside those are identical.** That is not hypothetical: the first draft of **L and M reported
ZERO** on the three `localStorage` sites reference R2 had already found by hand, because the key is
a `const` two lines above the call rather than a literal at it. Resolving the expression first took
L from 2 → 8 and M from 0 → 2, and M now names the exact `ops-drawer-panel-v4:${title}` key R3
called out.

**J is proved by its 3 live hits. H is the one rule with no proof of life** — provoking it means
editing `PageShell.tsx`, another card's file — and that is stated rather than left looking clean.

### Findings, all Reported Only

1. **The two guards' rule LETTERS mean different things.** The legacy `check-design-standard.mjs`
   calls hex `A`, the shell `B`, icons `C`, KPI fill `E`, row height `F`, section chrome `G`, hand
   -rolled selection `H`, grey hover `I` — while §13.3 calls those letters flame, spacing, `z-`,
   hand-rolled boxes, PageShell budget, duplicate class strings. **Two files, one letter, two
   meanings.** D1 did not renumber the legacy script: it is the live hard gate on `main` and
   changing what it fails on is not a warn-only card's business. `lint` now runs both. **D5 folds
   them into one.**
2. **`B` reports 8 flame sites and the top two are the definition itself** — `index.css` sets
   `--primary` to the flame, so the portal's PRIMARY ACTION colour *is* the flame, while §3.3 gives
   that job to blue and §3.4 keeps the flame in the logo alone. **There is no logo component in
   `apps/web/src`.** This is a real contradiction between the law and the running stylesheet, and it
   is D3's to resolve, not a guard's.
3. **`J` reports 3 kit artifacts with no edition** — `DialogFrame.tsx`, `dialog-container.tsx`,
   `index.css`. One line each; not fixed here because D1 measures and D2–D7 edit.
4. **`D` = 6,081 is bigger than the appendix's 2,556** because it also counts Tailwind's own type
   ramp (`text-xs` …) and every dead weight, which §2.1 and §2.2 both forbid. The appendix counted
   `text-[Npx]` only. **The appendix is not wrong, it is narrower** — re-measuring it is D1's own
   listed job and is done here.
5. **`I` = 294 duplicated class strings** is §6.6's "extract it" rule, and it is the single clearest
   map of what D2–D4 should extract first.

---

## D0.6 ✅ KIT-CONSOLIDATION — CLOSED 2026-07-29

> **PM review 2026-07-29: consolidation accepted; closed after the status
> synchronisation below.** Every milestone merged into `main` — D0.5a · D0.5b · D0.5b.1 · D0.5c —
> reads its real state in `docs/UI-KIT.md`, verified against the live repository. All findings
> stay **Reported Only**. **D1 is not started.**

**The five frozen principles are law.** Each landed in exactly one chapter, each with a
`Rule · Enforcement · Status · Evidence` row, and a grep for each PM-ratified sentence returns
**exactly one hit** outside `ui-reference-review.md` — measured, all five.

| Principle | Chapter | Rule row's Enforcement |
|---|---|---|
| R1 the floorplan catalogue is CLOSED | **§8.0** (new) | Type System — `variant` is a closed union of exactly the four · ✅ **live (D0.5c)** |
| R4 every kit artifact declares its edition | **§0.3** (extended) | Build Guard — a header scan · ⏳ **D1** (×2 rows) |
| R2 opinionated UI, configurable business numbers | **§0.4** (new) | Build Guard — no `localStorage` layout key in `pages/**` · ⏳ **D1** |
| R3 the identifier is the contract | **§0.5** (new) | Build Guard — no key built from a display string · ⏳ **D1** |
| R5 words are delivered, not remembered | **§10.1** (new) | Build Guard — no COPY-STANDARD literal in `components/**` · ⏳ **D1** |

**The kit now HAS an edition, because R4's principle needs something to declare.** It is the date
this law was last rewritten — **`UI-KIT 2026-07-27`** — a date and not a semver, because R4 ②#1
already refused the package ceremony. Choosing that mechanism was this card's job (Rule 4); it is
the least-invention option available, since the date is already line 4 of the law.

**Nothing was redesigned, no business rule moved, and the IA was not opened.** `git diff
--name-only` contains neither `ORDER-DETAIL-INFORMATION-MODEL.md` nor `ACTION-FLOW-STANDARD.md`.

### The mirror is re-based, and provably no value moved

`design-standard.ts` **declares the edition it follows and no longer claims to outrank the law.**
The header sentence *"where any older doc, code comment, or token conflicts with UI-KIT v4, v4
wins"* is retired — two bodies of one kit each declaring itself the winner was R4's material
finding, and the mirror is *"a record of the kit, never a place to drive a change from."*

**Every line of CODE in that file is byte-identical** — proved by stripping comments from both
revisions and diffing: no change. In the raw diff, lines containing `hex:` = **0** and lines
containing a colour literal = **0**. Nine stale `v4 §N` citations became either the current section
number or an explicit `⚠️ STALE` note naming the card that corrects the value (D2 · D3 · D0.5c).

**One dead citation is deliberately LEFT, and it is listed rather than passed on.** `v4 §11a` on
the `canvas` entry sits inside an **exported `use:` string**, and this card may change no exported
value; it is neutralised by a comment immediately above it that names §3.2 and the correcting card.

### Findings handed back to the PM

1. **The mirror is not what the law says it is.** `docs/UI-KIT.md` calls it the body that *"code
   reads"*. Measured 2026-07-28: **1 real importer** (`lib/staff-avatar.ts`, for `AVATAR_COLORS`
   only), **28 files that merely name it in a comment**, and `check-design-standard.mjs` **never
   parses it** — it is hex-ALLOW-LISTED. Every export except `AVATAR_COLORS` has no reader. The
   three-bodies model may be correct and unimplemented, or the mirror may have no job left. **Both
   are above this card**, so the law's sentence was NOT edited.
2. **§16's published percentage has drifted through THREE cards, and D0.6 had to COUNT before it
   could recompute.** `main` published **34 / 52 = 65.38%**; counted off the tables by script it
   actually carried **35 / 47 = 74.47%**. The entire gap is one section — §16 credited
   **Components 13 / 19** where §6 has **14 / 15**. D0.5a, D0.5b and D0.5c each ADDED to the figure
   in front of them instead of re-counting, so one wrong number propagated silently across three
   cards. §16's own opening line predicted exactly this (*"a hand-maintained percentage is prose,
   and prose drifts"*). **D1's `--report` generator is not a nicety — it is the only thing that
   makes this number true.**
3. **RESOLVED by D0.5c merging — kept on the record because the resolution is the lesson.** This
   card first ran against a `main` that did not yet carry `PageShell.tsx`, so §8.0's rule was `⏳`
   and coverage ticked DOWN — which collided with the card's own two rules (Rule 4 permits `⏳` with
   a named card *because "this card writes law, not code"*; Rule 5 forbids coverage going down).
   With D0.5c merged, **§8.0 is born enforced and coverage goes UP, 74.47% → 75.00%.** The conflict
   was real and it was dissolved by SEQUENCE, not by argument: the PM's `D0.5c → D0.6 → D1` order is
   exactly what made the mechanism exist before the rule was written.
4. **The exit criterion and §16's health rule disagree about what "coverage" is measured against.**
   The criterion pins an absolute floor — *"not lower than the 3 / 33 = 9.09% it reads today"* — a
   figure that went stale the moment D0.5a shipped. §16 rule 1 states a DIRECTION. Read as an
   absolute the card passes; read as a direction it does not. **A number written into an exit
   criterion goes stale; a direction does not.**
5. **Governance and copy rules have no home in the health number.** §16 counts §1–§8, so §0.1's
   five existing rules — and the four this card added to §0 and §10 — are outside it. Widening the
   denominator would read **36 / 58 = 62.07%** on a day nothing got worse, so it is reported and not
   taken. §16 now states the exclusion out loud instead of leaving it to be inferred.
6. **WITHDRAWN — I reported this wrongly, and the correction matters more than the finding.** I
   reported that the closed catalogue *"already has a member the law does not name"*, because
   `PageShell.tsx` on `origin/claude/carres-d05c-shells` shipped `variant: "list" | "module"`. **That
   branch is not what merged.** PR #505 merged a different implementation whose union is
   `list | dashboard | detail | settings` — **exactly §8.1's four, no `module`.** I read a superseded
   branch and reported it as the live state. *Read the tip that merged, not the branch that shares
   its name.*
7. **Two z-layers were still credited to D0.5c and only one of them shipped.** §4.4's layer 10
   (sticky table header) IS wired — `DataTable.tsx` imports `Z_TABLE_HEADER`. **Layer 20
   (toolbar / bulk bar) is not**: `overlay-layer.ts`'s own comment says *"Layer 2 still has no class
   string: nothing uses it"*, and `PageShell.tsx` writes no `z-` at all. The row now reads ⏳ **D6**,
   because the bulk bar arrives with page adoption, not with the shell.
8. **The stale-citation sprawl is far wider than R4's five.** `grep "UI-KIT v4|v4 §"` over
   `apps/web/src` returns **28 citations across 12 files**, naming `§8b · §11a · §11c · §11e · §A0 ·
   §A1 · §A5 · §A6 · §A8` — **lettered sections this law has never had.** The five R4 recorded are
   closed by this card; the rest are page files, which this card may not touch, and they are D1–D7's.
   It is also the strongest possible evidence for R4's principle.

### Sequencing note — the card ran twice, and the second run is why it closes

The PM's order is `D0.5c → D0.6 → D1`, and the reason given was *"the components are built first,
and consolidation writes down what exists."* **The first pass broke that order without meaning
to**: `origin/main` was `51f2758d`, D0.5c was unmerged on a branch, and the card wrote down what
existed on `main` — so §8.0 was `⏳` and coverage dipped.

**D0.5c then merged as PR #505 (`929fa746`), and the card was re-run against it.** §8.0 is enforced,
coverage rises, and finding 6 was withdrawn because the merged `PageShell` is not the one the branch
carried. **The whole difference between the two passes is which tip was read** — which is the
sequencing rule stated as a consequence rather than as advice.

### Status synchronisation (PM instruction, 2026-07-29)

Every milestone merged into `main` no longer reads `⏳` anywhere in the law. Verified against the
live repository, not assumed:

| Card | On `main` | Law now reads |
|---|---|---|
| **D0.5a** | `a548ddc9` (PR #498) | ✅ throughout — §5, §6.0–§6.5, §9 |
| **D0.5b** | `d77bd4f6` (PR #502) | ✅ throughout — §6.7–§6.14, §4.4 layers 30 · 40 |
| **D0.5b.1** | `2d5aaddb` | ✅ — §4.4's note; `dialog-container.tsx` is on `main` |
| **D0.5c** | `929fa746` (PR #505) | ✅ — §8.0 · §8.1 · §7 · §1.4's seven constraints · §4.4 layer 10 |

**Three rows deliberately still read `⏳`, because the thing itself has not shipped** — a status sync
may not paint a ✅ on something that does not exist: §4.4 layer 20 (no bulk bar renders through
`PageShell`) → **D6** · §8.2's one-interaction-model row (no page renders through the components)
→ **D6** · Build Guard rules **G** and **H**, whose D0.5 blocker is gone but whose guard is **D1**.

---

## D0.6 · KIT-CONSOLIDATION — the PLANNING CARD (the approved scope, kept for audit)

> **STATUS: planning card APPROVED by the PM, 2026-07-28; BUILT 2026-07-29** — see the record above.

**Why this card exists.** The Reference Review line (`docs/ui-reference-review.md`, R1–R5, closed
2026-07-28) reviewed five international references and froze **five principles**. Rule 5 of that
line was that **the kit is updated ONCE, at the end, from the frozen set** — *"editing the kit
while the review runs is how five references become five half-applied styles."* This is that once.

---

### 1 · SCOPE

**In scope — the law and its own bodies, nothing else:**

| # | What | Why it is in |
|---|---|---|
| 1 | `docs/UI-KIT.md` | The five frozen principles are written here, and nowhere else (Law 0A). |
| 2 | `docs/UI-KIT.md` §16 | The health count is recomputed. Adding rules moves it, and §16 governs which direction. |
| 3 | `apps/web/src/lib/design-standard.ts` — **the claims it makes**, not the values it exports | R4's principle. It is 12 days behind the law, cites sections that no longer exist, and declares *"where any older doc, code comment, or token conflicts with UI-KIT v4, v4 wins"* while the law's first line says the law wins. **Two bodies of one kit each claiming to outrank the other is the finding, and it is a correction of a RECORD** — CLAUDE.md: the mirror is *"a record of the kit, never a place to drive a change from."* |
| 4 | The five stale kit citations listed in `ui-reference-review.md` R4 | *"All version inconsistencies remain under KIT-CONSOLIDATION"* (PM, 2026-07-28). |

**OUT of scope — named so the card cannot creep:**

| What | Where it belongs |
|---|---|
| **The Information Architecture** — Business Thinking Model · L1 · L2 · L3 · L4 · Law 7 | **CLOSED.** This card may not reopen, restate or "align" any of it. Where the kit and the model touch, **UI-KIT wins** — that is already ruled and needs no new sentence. |
| Any page, component or test under `apps/web/src/**` | D0.5a/b/c and D2–D7 |
| **The token VALUES the mirror exports** (canvas hex, flame placement) | **D2/D3 codemods.** See the measurement below — correcting a *value* is a visual change and this card makes none. |
| `/ui` showcase | D0.5a |
| Q1 · Q3 · Q4 (the PENDING register) | `/ui`, D0.5a. **This card may not freeze a pending value**, and may not add a sixth pending question. |
| Choosing HOW a principle is enforced | **This card decides it** — see Rules #4. It is out of scope for the *review line*, not for this one. |
| `docs/ui-reference/` (missing screenshots) | Documentation debt, parked. **Not this card**, and not a blocker. |

**A measurement that shapes the scope, taken 2026-07-28 rather than assumed:**

```
apps/web/src/lib/design-standard.ts
  real importers ....... 1   (staff-avatar.ts, for AVATAR_COLORS)
  files that only NAME it in a comment .......... 25
  read by scripts/check-design-standard.mjs? ... NO — it is hex-ALLOW-LISTED, never parsed
```

**So the mirror's stale values are consumed by almost nothing, and correcting its *claims* carries
no visual risk at all.** It also means UI-KIT's own description of the mirror as the body that
*"code reads"* **is not true today** — and that is an input this card must carry to the PM, not a
thing this card decides. The three-bodies model may be correct and unimplemented, or the mirror may
have no job left. **Both are decisions above this card's pay grade.**

---

### 2 · INPUTS

Everything this card is allowed to read *as a source*. Nothing else may become law here.

| Input | What it supplies |
|---|---|
| `docs/ui-reference-review.md` **R1–R5**, the five frozen principles **only** | The substance. The PM's exact ratified wording is used verbatim where one exists. |
| `docs/UI-KIT.md` as it stands | The target, its chapter structure, and §16's two health rules. |
| `apps/web/src/lib/design-standard.ts` | The stale-citation evidence (R4), with line numbers already recorded. |
| The **parking lot** in `ui-reference-review.md` | Implementation observations classified by the PM — read as context, **never pasted in as law.** |
| `docs/execution-queues-index.md` | Where this card is indexed and which lane owns which file. |

**The five frozen principles, and where each one now LIVES.**

*(This table used to reprint all four PM-ratified sentences verbatim, so a builder did not have to
reconstruct them. It stops doing that on the day they land: the card's own exit criterion is that a
grep for each sentence returns **exactly one hit** outside `ui-reference-review.md`, and a copy in a
work-list is a second home. The wording is in the chapter named below; the reasoning behind it stays
in `ui-reference-review.md`, which is the record.)*

| From | Principle | Now lives in |
|---|---|---|
| **R1** SAP Fiori | the floorplan catalogue is CLOSED | **UI-KIT §8.0** |
| **R2** Linear | opinionated UI · configurable business numbers | **UI-KIT §0.4** |
| **R3** Stripe | the identifier is the contract, the label is presentation | **UI-KIT §0.5** |
| **R4** Vercel | every kit artifact declares its kit edition | **UI-KIT §0.3** |
| **R5** GOV.UK · NN/g · Polaris | words are delivered, not remembered | **UI-KIT §10.1** |

**NOT an input:** any reference not in R1–R5, any observation the PM did not approve, and any
design idea this card's author has. **The review line is closed; consolidation writes it down, it
does not extend it.**

---

### 3 · OUTPUTS

Exactly four artefacts. A fifth means the card grew.

| # | Output | Shape |
|---|---|---|
| 1 | **`docs/UI-KIT.md` carries the five principles**, each in the chapter that owns its concern — never a new "Principles" chapter bolted on the end. Each gets the standard **Rule · Enforcement · Status · Evidence** row the file already uses for every rule. | Edit |
| 2 | **§16 recomputed** — rule count, enforced count, coverage, and the Human Review debt line, with the arithmetic shown. | Edit |
| 3 | **The mirror declares its version and drops its claim of authority** — its header states which kit edition it follows, and the dead section citations (`v4 §11a`, `v4 §9`) are corrected or removed. **Exported values are untouched.** | Edit |
| 4 | **A findings note back to the PM** — the mirror-has-one-importer measurement, and any principle that could not be written without a decision the PM has not made. | Report |

**Explicitly NOT an output:** a new document. Five principles landing in a sixth file is the exact
disease `UI-KIT` §0.2 and Law 0A exist to prevent.

---

### 4 · RULES

**0. The rule that governs all the others (PM, 2026-07-28):**

> **Reference Review is an input.
> UI-KIT is the only source of truth after consolidation.**

**Reference Review observations are NOT architectural laws.** R1–R5 carry no authority of their
own — they **become authoritative only once consolidated into `docs/UI-KIT.md`**, and from that
moment the kit is the source and `docs/ui-reference-review.md` is the record of where the reasoning
came from. A chat that cites the review file as law has cited an input.

1. **`docs/UI-KIT.md` wins, and the IA stays closed.** Where a principle touches L1–L4, the kit's
   wording governs presentation and the model keeps information — neither file is edited to suit
   the other, and the model is not edited at all.
2. **One concern, one file.** A principle is written in exactly one chapter. If it seems to belong
   in two, it has been stated too broadly — narrow it until it has one home.
3. **The PM's wording is used verbatim** where a ratified sentence exists (R2 · R3 · R4 · R5). The
   *reasoning* may be summarised; the *sentence* may not be improved.
4. **Every principle written into the law arrives with an Enforcement**, because §16 forbids adding
   a rule enforced only by a human without a mechanism in the same PR **or a card that names one**.
   Naming the card is the expected route here — this card writes law, not code. **Choosing the
   mechanism is this card's job** (the review line was forbidden from freezing one; that
   prohibition ends here).
5. **§16 coverage may not go down and the Human Review debt may not grow.** Both are measured
   before and after, and the arithmetic is printed in the PR. If a principle cannot be added
   without breaking this, it is deferred with its reason stated — **not smuggled in as prose.**
6. **No visual change and no behaviour change.** Zero token values altered, zero components
   touched. `pnpm --filter @carres/web lint` reports no new violations and the web suite stays at
   baseline. *This card changes what the law says, not what the screen does.*
7. **A pending question stays pending.** Q1 · Q3 · Q4 are frozen on `/ui` by Jess, not here, and no
   sixth pending question may be created — a principle that needs a new decision is deferred, not
   parked in the register.
8. **Report, never unilaterally change** (Law 0). If a frozen principle contradicts the live code
   or the law, the card SAYS SO with evidence and the PM decides. **The mirror's claim of authority
   is corrected because the PM already ruled it in scope; anything discovered beyond that is
   reported, not fixed.**

---

### 5 · EXIT CRITERIA

Every line is checkable by someone who did not write the card.

- [ ] **All five principles appear in `docs/UI-KIT.md`**, each in exactly one chapter, each with a
      `Rule · Enforcement · Status · Evidence` row.
- [ ] **A `grep` for each PM-ratified sentence returns exactly one hit** in the whole repo outside
      `ui-reference-review.md` — proving one home, not two.
- [ ] **§16's block is recomputed and the arithmetic is shown in the PR.** Coverage is **not lower**
      than the 3 / 33 = 9.09% it reads today, and the Human Review debt is **not higher** than 4.
- [ ] **Every principle names its Enforcement**, and any that is `⏳` names the card that will
      deliver it. **No principle is added with `Human Review` and no card.**
- [ ] **`design-standard.ts` declares the kit edition it follows**, no longer claims to outrank the
      law, and cites no section that does not exist. **`git diff` on that file changes no exported
      value** — provable by grepping the diff for `#` and for `hex:`.
- [ ] **The five stale citations from R4 are each either corrected or listed with a reason for
      being left**, so KIT-CONSOLIDATION closes them rather than passing them on.
- [ ] **Zero visual change, proved not asserted:** `git diff` introduces no hex, no `text-[`, no
      `h-[`; `pnpm --filter @carres/web lint` clean; web suite at baseline (today **2029 passed /
      16 pre-existing**), `tsc -p tsconfig.app.json` clean.
- [ ] **The IA files are untouched** — `git diff --name-only` contains neither
      `ORDER-DETAIL-INFORMATION-MODEL.md` nor `ACTION-FLOW-STANDARD.md`.
- [ ] **No new document was created.**
- [ ] **`docs/ui-reference-review.md`'s parking lot is updated** — KIT-CONSOLIDATION marked done,
      with the observations that were carried and the ones deliberately not.
- [ ] **The four review questions are answered**, including the mirror-has-one-importer finding
      handed back to the PM as a decision, not silently acted on.

---

### Sequencing — CONFIRMED by the PM, 2026-07-28

```
D0.5a  →  D0.5b  →  D0.5c  →  D0.6 KIT-CONSOLIDATION  →  D1 Build Guard
```

**D0.6 may NOT be moved ahead of D0.5c.** The open question this card raised — whether the closed
catalogue rule should lead `PageShell` or describe it — **is decided: the components are built
first, and consolidation writes down what exists.** That is consistent with Rule 0: the review is
an input, and an input does not get to gate the build.

**It still lands before D1**, which is the half of the ordering that matters downstream: D1 writes
the Build Guard baseline over all 225 files, and a guard written against a law about to gain five
principles is a guard that gets rewritten.

---

## The card template — every card answers this before building

From UI-KIT §1.1. **No answers = no drawing.**

```
Who uses it?
How often?              every hour / daily / weekly / monthly
If removed, could today's work still be finished?
    YES → it must NOT stay permanently on the page
    NO  → it may stay
Permanent vertical height?   ___ px  =  ___ fewer orders visible
Priority?                    P1 / P2 / P3 / P4
```

---

## Lessons this line has already paid for

**A stale comment is a second source of truth.** The order drawer's `rev9`
comment described three KPI track boxes pinned to the top of the right column.
They were deleted at `rev15`; the comment was not, and it then outlived them long
enough to be read as the live design and reported as such. **Delete a comment
with the code it describes.**

**Grep the component tree, not the attributes.** An early report said the drawer
had neither "what to do today" nor "why it's stuck". Half wrong — `title=` was
grepped, which returns tooltips. The counterparty panel existed all along
(`ChaseNowPanel` then, **`CallsPanel` since PR #487**); only Current Issues was
genuinely missing.

**The design guard works on the author too.** T2's count badges arrived as
`text-[10px]` / `h-[15px]` — two new typography values in the card that forbids
adding typography values. Caught by `pnpm --filter @carres/web lint`, fixed to
11px on the Tailwind scale, **not baselined.**

**Check `origin/main` before assuming a rewrite is safe.** A parallel Purchasing
line edited `docs/UI-KIT.md` and `CLAUDE.md` on the same day this rewrite
replaced the whole file. Taking either side wholesale would have silently deleted
the other; five rulings were ported by hand instead (§3.6, §8.2-§8.4).

**A source scan beats a render test for this file.** 7,337 lines of branches: a
render test only sees what its fixture reaches, and the bug §1.4 rule 1 fixes
survived precisely because the collapsed branch is the one nobody mounts. Run the
**negative control** — break the rule on purpose and confirm exactly the right
test goes red.

---

## Anything a chat must NOT do on this line

- **Never restyle while reordering.** T2's value is that colour, type and spacing
  are provably untouched, so if the reading gets better it is the hierarchy that
  did it.
- **Never write a §6/§7/§8 dictionary entry before its component exists** — a
  spec without a component is a spec 285 pages each re-implement differently.
- **Never enforce a PENDING rule.** Half-enforcement is worse than none.
- **Never add a rule with no Enforcement** without either a mechanism in the same
  PR or a card that names one (UI-KIT §16).
