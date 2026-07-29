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
| On `main` | `ba7b7798` D0 law + doors · `19cad8e4` merge · `d83ecf98` §1.4 hierarchy · **`c9966ee3` T2 drawer** · **`a548ddc9` D0.5a (PR #498)** |
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
| **D0.5b.1** | **P1 follow-up** — a picker inside a dialog renders UNDER it. Scoped card below | ✅ **SHIPPED 2026-07-28, `2d5aaddb`.** *(Row corrected by D1 — it read "⏳ before D0.5c" for a day after the fix landed.)* |
| **D0.5c** | `PageShell` + `DataTable` + `DetailShell` — **extracted from Orders, not designed fresh** | ✅ **COMPLETE 2026-07-29** — all three built and tested, Orders renders through the first two. **Scope is component EXTRACTION; the drawer migration was never in it** (PM, 2026-07-29) — card below |
| **D0.5c.1** | **DECISION card** — §7② and §10 disagreed about whether the Persistent Facts cap is law. No code | ✅ **RULED 2026-07-29 — A: §10 (L4) is the authoritative law.** Card below |
| **D0.5c.2** | **`OrderDetailDrawer` renders through `DetailShell`** — the four `identity` nodes have to exist first. Own card, not yet written | ⏳ **after D0.5c.1** |
| **D0.6** | **KIT-CONSOLIDATION** — write the five frozen reference principles into the law, once. Full card below | ✅ **DONE 2026-07-29.** R1 → §8.0 · R2 → §14.1 · R3 → §10.1 · R4 → §0.3 · R5 → §10.2. §16 **47.83% → 48.94% ⬆**, debt 4 → 4. The kit is now the source; the review file is the record |
| **D1** | Build Guard over all 225 files, **warn only**, write the baseline | ✅ **BUILT 2026-07-29.** C · D · F widened off `KIT_FILES`; kit scope DERIVED from `components/kit/**`; **860 violations across 151 files frozen**, guard exits 0. New RULE J (floorplan) · K (UI preference) · L (kit edition). `--report` generates §16 — **and disagrees with its hand count; reported, not fixed** |
| **D2 / D3 / D4** | codemod typography / colour / spacing | ⏳ |
| **D5** | Guard → **Fail**. Blocked while the PENDING register is non-empty | ⏳ |
| **D6** | Orders list: 7 bands → 3 (11 rows → 14-15 visible) | ⏳ |
| **D7+** | Delivery · Purchase · Receiving · Stock · Service · Payments · Catalog — one card each | ⏳ |

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

## D0.5c.1 ✅ RULED — the Persistent Facts law conflict is settled (DECISION card, 2026-07-29)

> ## ✅ THE RULING — PM, 2026-07-29
>
> **A. §10 (L4) is the authoritative law.** §7② explicitly says *"A law will be written later"* —
> **L4 is that law.**
>
> - **§7② remains historical design intent.** It is not deleted; it is the reasoning that
>   produced the rule, and the admission test still stands on it.
> - **§10 is the enforceable rule.** Where the two are read against each other, §10 wins.
> - **Do not weaken the 4-tuple constraint.** `DetailShell` is untouched.
>
> **And a second ruling the card did not ask for, which unblocks the queue:**
> **D0.5c's scope is component EXTRACTION, not `OrderDetailDrawer` migration. D0.5c is
> COMPLETE.** The drawer migration becomes its own follow-up card (**D0.5c.2**). The drawer is
> not to be redesigned inside D0.5c.

**This card wrote no code.** It existed because **two frozen passages of the same document
disagreed**, and a chat may not settle that. Everything below is the record of the decision as it
was put — kept verbatim so the ruling can be audited, **not** an open question.

### The two passages, verbatim — as they read BEFORE the ruling

> **`ORDER-DETAIL-INFORMATION-MODEL.md` §7② — "RESERVED, NOT YET LAW"**
> *"**A law will be written later.** Until it is, nothing here is enforceable."*
> …and, in the same block: *"**A cap.** The set is full at four."*

> **`ORDER-DETAIL-INFORMATION-MODEL.md` §10 (L4), FROZEN, constraint 5**
> *"`identity` takes values only, no `onAction`; its persistent facts are a **fixed 4-tuple**"*

§7② said the concept was **not yet enforceable**. §10 **enforces it as a type**. Both are dated
2026-07-28 and both were marked frozen. **§7② has since been corrected** — its heading now reads
*"② NOW LAW — Persistent Facts is its own concept, and §10 (L4) enforces it"*, and the sentence
that claimed unenforceability names §10 as the law it was waiting for. **There is no longer a
sentence anywhere saying the cap is unenforceable.**

### What it costs today, in one line

`DetailShell` implements §10 — `persistentFacts` is a 4-tuple, and a `@ts-expect-error` test
proves a fifth or a third does not compile. The drawer has **no such four nodes**:
`CustomerIdentityCard` renders the customer and the SO, while the promised date and the
outstanding figure live in other blocks. So the wrap cannot be written without either moving
business content or weakening the type — and the PM has ruled out both.

### The decision, and ONLY this decision

**Which definition is authoritative?**

| | Ruling | What follows |
|---|---|---|
| **A** ✅ **CHOSEN, PM 2026-07-29** | **§10 (L4) is authoritative.** §7②'s "not yet enforceable" is superseded — L4 froze the cap into a type the same day, which IS the law §7② said would be written later. | §7②'s sentence is corrected to point at L4. `DetailShell` is untouched. The wrap then needs the four nodes to EXIST, which becomes its own small card — **D0.5c.2** |
| **B** | **§7② is authoritative.** The cap is not law yet, so a shell may not enforce it. | Constraint 5 loses the tuple — which the PM has already forbidden ("do not weaken existing constraints"), so this option exists only to be ruled out on the record. **Not chosen** |

**Ruled A.** §7②'s own words are *"a law will be written later"*, and L4 is later on the same day
and in the same file. Reading it as still-unwritten left the document saying a rule both is and
is not enforceable, which is the state that stopped the build.

**A third frozen passage agrees, and it was found during the review rather than cited by this
card**: **L1 (§6), frozen the same day**, already treats persistent facts as operative and places
all four in R1 — R1's *Fed by* row names the promised date and *"the outstanding figure — a
persistent fact, §7②, resident here but not a member"*, and R3's *Absent when* row **spends** that
ruling, deleting the calm-order explanation region because *"the money [is answered] by R1's
persistent fact — so nothing was lost"*. Under B, that justification would have collapsed too.
**So the shell matches frozen L1; it is the drawer that does not** — which is what D0.5c.2 is for,
and why it is a smaller job than "redesign three blocks".

### Scope — the PM's, and nothing beside it

```
IN    decide which of §7② / §10 is authoritative
IN    edit the LOSING passage so the document stops contradicting itself
OUT   redesigning the drawer
OUT   redesigning DetailShell
OUT   moving any business content (the promised date, the outstanding figure)
OUT   weakening any existing constraint
```

### Exit criteria — all met 2026-07-29

- [x] One of the two passages is marked as superseded, in ONE edit, naming the ruling and its date.
      **§7② is the one edited**; its heading and its second paragraph now name §10 as the law.
- [x] `grep` finds no remaining sentence saying the cap is unenforceable — *one concern, one file*.
      The only surviving occurrences are inside THIS card, as the quoted record of a settled
      decision, and are labelled as such.
- [x] `DetailShell.tsx` and its test are **byte-identical** — `git diff` on both is empty.
- [x] No `apps/web` file changes at all. This card shipped documentation only.
- [x] The queue records what the wrap still needs — **D0.5c.2**, below.

---

## D0.5c ✅ COMPLETE — the three shells are extracted (2026-07-28, closed 2026-07-29)

> **✅ CLOSED by the PM, 2026-07-29.** *"The scope of D0.5c is component extraction, not
> `OrderDetailDrawer` migration."* All three shells are built, tested and extracted, so the card
> is **done**. The drawer migration is **D0.5c.2**, its own follow-up card — and the drawer is
> **not** to be redesigned inside D0.5c. The section below, written while the card still believed
> the migration was its last step, is kept as the record of why that step is a separate card.

**Built and merged:** `PageShell` · `DataTable` · `DetailShell`, all three extracted, all three
tested. **Orders renders through the first two** and its own 134 tests pass untouched, which is
the real proof the extraction is faithful.

**`PageShell`** — `ListPageShell`'s frame, moved. Not a pixel designed; what is NEW is the TYPE:
`variant="list"` has **no `kpi` prop** (§1.3's height budget) and `variant="module"` has **no
`title` and no `breadcrumb`** (§8.3's module-tab law). Both were rules a chat had to remember.
**Two variants ship, not §8.1's four** — only the list frame exists in the codebase to extract,
and building `dashboard` · `detail` · `settings` from nothing is the designing this card forbids.

**`DataTable`** — the Orders table's frame: percentage colgroup with `table-fixed` (so a list is
always exactly the container width and never scrolls sideways), the sticky head on layer 1, 40px
rows, the full-width empty state, the trailing sentinel. **The page keeps its ROW**, because a row
carries business rendering the kit has no business owning. `Th` was deleted with the header cells
it drew rather than left behind as a second source of truth.

**`DetailShell`** — all seven of L4's constraints are types now, including the one that **closes
UI-KIT §1.4's only Human-Review debt** (`progress` cannot take events, an actor, a timestamp, a
KPI or a button). And there is no `state` prop: a component that cannot be told a state cannot
print one.

### The drawer does NOT render through it — and that is D0.5c.2, not a defect in this card

The card's own rule: *"If a slot needs markup the drawer does not already have, **stop**: either
the drawer is missing something (a bug, its own card) or the shell is being designed rather than
extracted."* That is exactly what happened, on slot ①.

**L4 constraint 5 makes `identity.persistentFacts` a fixed 4-tuple** — 客户名 · Ref · the promised
date · outstanding. **The drawer has no such four nodes.** `CustomerIdentityCard` is ONE card that
renders the customer and the SO itself; the promised date and the outstanding figure live in other
blocks entirely. Migrating means one of two things:

| Option | What it costs |
|---|---|
| **A — the identity block absorbs them** | the promised date and the outstanding figure MOVE into R1, out of the blocks that hold them today. **This is the one that survives the ruling**, and L1 already requires it — see D0.5c.2 |
| **B — weaken the tuple** | `persistentFacts` becomes an array, and constraint 5 — the defence against Header Everything — stops existing the day it was built. **Ruled out, PM 2026-07-29** |

**This was a decision and not a defect**, which is why the card stopped: §7② and §10 disagreed
about whether the set was enforceable, and a chat may not settle that. **Settled 2026-07-29 —
§10 is the law** (D0.5c.1). **The migration itself was never in this card's scope**, so D0.5c
closes here rather than waiting on it.

**Everything else in the shell is ready**: the other six constraints hold, and the drawer's rail
order already matches §1.4.

---

## D0.5c.2 — `OrderDetailDrawer` renders through `DetailShell` (⏳ card not yet written)

**Not started. Recorded now so D0.5c.2 does not re-derive what D0.5c already measured.**

**The one thing standing in the way**: `identity.persistentFacts` is a fixed 4-tuple — 客户名 ·
Ref · the promised date · outstanding — and the drawer has no such four nodes.
`CustomerIdentityCard` (`OrderDetailDrawer.tsx`, *"identity ONLY"*) renders the customer and the
SO as ONE card; the outstanding figure lives in the money blocks and the promised date elsewhere
again.

**It is smaller than "a redesign of three blocks", and the reason is that the model already ruled
it.** **L1 (§6), frozen 2026-07-28**, places all four in R1 on its own: R1's *Fed by* row names
the promised date and *"the outstanding figure — a persistent fact, §7②, resident here but not a
member"*, R5 refuses the figure because *"that is a persistent fact resident in R1"*, and R3's
*Absent when* row spends the ruling — it deletes the calm-order explanation region **because**
the money is answerable from R1's persistent fact. **So the shell matches frozen L1 and the
drawer does not.** The work is bringing the drawer into line with a law that already exists, not
inventing a new arrangement.

**Out of scope, permanently**: weakening the tuple (ruled out 2026-07-29) and redesigning
`DetailShell`.

**Not ruled, and the card must not assume it**: whether the drawer's *existing* blocks keep a
copy of the figure once R1 carries it, or give it up entirely. That is a layout question for
whoever writes this card with Loo — L2's depth table says the Payment section carries *"only
Evidence and Detail"*, which points at giving it up, but pointing is not a ruling.

---

## D0.5c — `DetailShell`, in full (the `PageShell` / `DataTable` halves keep their one-liners above)

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
| 5 | `persistentFacts` is a 4-tuple; `IdentitySlot` has no `onAction` | model **§10 (L4) constraint 5** — the law; §7② is the intent behind it (ruled 2026-07-29) | `@ts-expect-error` on a 5th fact and on an action |
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

## D0.6 · KIT-CONSOLIDATION — the PLANNING CARD

> **STATUS: planning card APPROVED by the PM, 2026-07-28.** The work may begin **only after
> D0.5c ships** — see Sequencing. `docs/UI-KIT.md` is still untouched today.

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

**The five frozen principles — ✅ CONSOLIDATED 2026-07-29. The sentences are NOT repeated here any
more:** they lived in this table while the card was unbuilt so the builder did not have to
reconstruct them, and the moment they became law that made two homes for one sentence. **The law
is the home; this table is the index.**

| From | Principle | Now lives in |
|---|---|---|
| **R1** SAP Fiori | Closed Pattern Library — *accepted as an observation for consolidation* | **`UI-KIT` §8.0** |
| **R2** Linear | opinionated product, configurable business | **`UI-KIT` §14.1** |
| **R3** Stripe | the ID is the contract, the label is presentation | **`UI-KIT` §10.1** |
| **R4** Vercel | every kit artifact declares its edition | **`UI-KIT` §0.3** |
| **R5** GOV.UK · NN/g · Polaris | words are delivered, not remembered | **`UI-KIT` §10.2** |

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

---

## D1 · BUILD GUARD over all 225 files — warn only, write the baseline (EXECUTION CARD, opened 2026-07-29)

> **STATUS: ✅ BUILT 2026-07-29.** Both PM rulings honoured (③ `hiddenCols` stays · ⑤ the shipped
> union `list` · `module`). **Only `scripts/` changed — `apps/web` is untouched entirely**, which
> is stronger than the card's own Rule 5 asked for.
>
> ```
> guard exits 0 on a clean tree, with 860 frozen violations across 151 files
>   RULE C icon size    132        RULE J floorplan   0 pre-existing, HARD
>   RULE D text size    671        RULE K UI pref     9 (the 3 ruled sites, frozen)
>   RULE F row height    48        RULE L kit edition live
> ```
>
> **Two things this card found and did NOT fix, both by its own Rule 4:**
> **(a) `--report` disagrees with §16's hand count** — 43 rules / 24 enforced against 47 / 23.
> All 18 rule tables use the exact header and all 18 are read, so it is a stale hand count, not a
> parse miss. Reconciling it means editing the law, and D0.6 is closed.
> **(b) POS was walked into and walked back out** — widening C · D · F reached `pages/dealer/**`,
> which UI-KIT §15 puts out of Build Guard scope. The exemption is now explicit in the script.

**Why now, and not earlier.** D0.6 was D1's precondition and the reason is arithmetic, not
ceremony: **a guard written against a law about to gain five principles is a guard that gets
rewritten.** The law gained them on 2026-07-29 and is now still. D1 writes the baseline against a
law that is no longer moving.

**The card template, answered:**

```
Who uses it?            every chat that touches apps/web — it is the thing that
                        catches what a chat forgot to read
How often?              every commit (it is @carres/web's `lint`, already in CI)
If removed?             NO — without it §16's number is a hand count, and a hand
                        count is prose. Prose drifts; that is this file's thesis
Permanent height?       0px — it is a script, it draws nothing
Priority?               P1
```

---

### 1 · WHAT ALREADY EXISTS — measured 2026-07-29, not assumed

**A chat that starts by writing a new guard has misread this card.** The guard is live and has
been for months. D1 **widens** it; it does not create it.

```
scripts/check-design-standard.mjs      the guard — zero-dependency, wired as
                                       @carres/web's `lint`, runs in CI + locally
scripts/design-standard-baseline.json  the ratchet — hex: 35 files
                                                     listPages: 255 entries
```

| Rule | What it catches | Scope TODAY |
|---|---|---|
| **A** | hard-coded hex | **all** `apps/web/src` (ratcheted) |
| **B** | a list page that does not use the shell | **all** `pages/**` (ratcheted) |
| **C** | Lucide `size={N}`, N not in {14,16,18} | WARNING — **kit only** (`KIT_FILES`) |
| **D** | inline `text-[Npx]` off the scale | WARNING — **kit only** |
| **E** | inline KPI fill hex | **all** web src |
| **F** | `h-[Npx]` where N is not 44 | WARNING — **kit only** |
| **G** | hand-rolled `section-band` | **all** web src |

**So D1's real job is C, D and F**, which today see **29 kit files** and must come to see all
**236 in-scope page files** (`pages/**` minus `dealer/**` minus tests). A, B, E and G are already
repo-wide.

---

### 2 · SCOPE

**In scope:**

| # | What | Why |
|---|---|---|
| 1 | Widen rules **C, D and F** from `KIT_FILES` to all of `apps/web/src`, **warn only** | §13.1 already says the scope is *"all of `apps/web/src` — not a hand-maintained file list"*. The code does not do that yet. |
| 2 | **Write the baseline** for the newly-seen violations, per rule and per file | The ratchet is how a 225-file debt becomes finite. Freezing is not forgiving — it is the only way the number can start going down. |
| 3 | `KIT_FILES` **stops being hand-maintained** — the kit is `components/kit/**` | See finding ① below: three shells shipped into the kit and nobody added them to the list. |
| 4 | **§16's generator** — the `--report` mode that parses the Enforcement column and rewrites the block | §16 says the block *"is GENERATED, not hand-typed"* and then says the numbers are a hand count. One of those is a lie today. |
| 5 | The three enforcement mechanisms D0.6 handed to D1 | §14.1 (R2) · §10.1 (R3) · §0.3 (R4). Each is Build-Guard shaped and each is named as D1's in the law. |
| 6 | The stale index rows, per the PM 2026-07-29 | D0.5b.1's row still reads "before D0.5c" though it shipped in `2d5aaddb`. Documentation cleanup, carried here rather than reopening D0.6. |
| 7 | **A guard rule for the `PageShell` variant** — rejects an arbitrary variant, never allows `"custom"`, and enforces **only the shipped union `list` · `module`** | **PM ruling, 2026-07-29** (finding ⑤). Catches what the Type System cannot see — a variant arriving through a cast or from outside TypeScript. **Adds no rule to §16 and moves no number**: §8.0 is already counted ✅ via the Type System. |

**OUT of scope — named so the card cannot creep:**

| What | Where it belongs |
|---|---|
| **Fixing any violation the guard newly sees** | D2 · D3 · D4 codemods. **D1 measures and freezes. It repairs nothing.** |
| Turning the guard to **fail** | **D5**, and D5 is blocked until the debt is walked down. |
| Migrating any page to the kit | D2–D7 |
| `OrderDetailDrawer` rendering through `DetailShell` | **D0.5c.2** |
| The Orders list 7 bands to 3 | **D6** |
| Editing `docs/UI-KIT.md` | **D0.6, and it is CLOSED.** If D1 finds the law wrong, it REPORTS. |

---

### 3 · RULES

1. **WARN ONLY. The build does not go red on a pre-existing violation.** A guard that fails on
   day one gets switched off on day one, and then nothing is enforced at all.
2. **D1 repairs nothing.** If the widened rules see 800 violations, the number is 800 and it is
   written down. **A card that fixes what it measures cannot be trusted about what it measured.**
3. **The baseline is per rule and per file**, never a global total — a global number lets one file
   improve while another rots and the total stands still.
4. **Report, never unilaterally change** (Law 0). Every finding below and every new one goes to the
   PM. **The law is closed to this card.**
5. **No visual change and no behaviour change.** `apps/web/src/**` is not edited except for
   `KIT_FILES`' replacement. Web suite at baseline: **16 pre-existing failures in 4 documented
   files** (`OperationOrders` x7, `OrderCustomerCard` x4, `OhanaSofaTab` x4,
   `NiceFutureMattressTab` x1) — **zero new**.
6. **§16's coverage may not go down and the debt may not grow.** D1 adds *mechanisms*, so the
   number should go UP; if a mechanism cannot be built, its rule stays scheduled and the reason is
   stated.

---

### 4 · FINDINGS ALREADY IN HAND — measured 2026-07-29, so D1 does not re-derive them

**① The three D0.5c shells are in the kit and are not guarded.** `PageShell.tsx`,
`DataTable.tsx` and `DetailShell.tsx` live in `components/kit/**` — the kit by definition — and
none of them is in `KIT_FILES`, so rules C, D and F have never run on them. **This is exactly the
failure §13.1's "not a hand-maintained file list" sentence exists to prevent, and it happened to
the newest kit files within a day of shipping.** It is scope item 3, not a bug report.

**② §16 cites a script that does not exist.** It names `check-design.mjs --report` twice; the file
is `check-design-standard.mjs`. Harmless while the block is hand-typed, load-bearing the moment
D1 wires the generator — a chat will run the cited command and get "not found".
**Reported, not fixed: editing §16 means editing the law, and D0.6 is closed.**

**③ R2's mechanism touches a live feature — ✅ RULED BY THE PM, 2026-07-29.**

> **`hiddenCols` stays. It is an existing user UI preference, not a business-rule override.**
> **D1 may DETECT, REPORT and BASELINE it. D1 may not remove, rewrite or disable it.**

§14.1 forbids a per-user UI preference and three live browser-persisted UI-state sites under
`pages/**` sit against it. **The rule is not weakened and the feature is not deleted** — the sites
are measured and frozen into the baseline like every other pre-existing violation, which is what
warn-only means and is the whole reason D1 is warn-only. **A build chat that "tidies away"
`hiddenCols` has broken this card, not completed it.** Whether the preference is eventually
removed is a later ruling and belongs to nobody in the D-line today.

**④ `MUST_USE_SHELL` holds exactly ONE page** (`OperationOrdersControl.tsx`) against 236. Rule B
is repo-wide for NEW pages but only one existing page is held to it. Widening that list is a
**D2–D7** consequence, not D1's — noted so D1 does not mistake it for its own job.

**⑤ The floorplan catalogue's membership — ✅ RULED BY THE PM, 2026-07-29.**

> **For D1, enforce only the currently shipped closed union: `list` · `module`.**
> **The guard must reject an arbitrary variant and must never allow `"custom"`.**
> **D1 may not add, rename or remove any `PageShell` variant.**

**The guard enforces what SHIPS, not what the law aspires to.** §8.1 names four
(`list · dashboard · detail · settings`); `PageShell.tsx` ships two. **That mismatch stays
REPORTED ONLY, for a later ruling** — D1 does not close it, does not pick a side, and does not
edit either the component or §8.1 to make them agree.

**A note so the build chat does not double-count**: §8.0's rule is ALREADY enforced and already
counted ✅ in §16, by the Type System — `"custom"` does not compile. The guard here is a **second
mechanism on the same one rule**, which catches the case the type cannot see (a variant string
arriving through a cast or from outside TypeScript). **It adds no rule and no numerator**; §16 is
unchanged by it.

---

### 5 · EXIT CRITERIA

Every line is checkable by someone who did not write the card.

- [ ] Rules **C, D and F** run over all of `apps/web/src`, and a deliberately-planted violation in
      a non-kit page is **seen** (proved by planting one, running, then removing it).
- [ ] The guard **exits 0** on a clean tree. Warn-only is proved, not asserted.
- [ ] `KIT_FILES` is **derived** from `components/kit/**`, not typed. Adding a kit component puts
      it in scope with no second edit — proved by the three shells appearing without being listed.
- [ ] The baseline is **committed**, per rule and per file, and its totals are printed in the PR.
- [ ] The report mode regenerates §16's block, and its output **matches the hand count** on the day
      it lands — if it does not, the hand count was wrong and the difference is explained.
- [ ] Each of the three inherited mechanisms is either **live** (and §16's numerator moves) or
      **stays scheduled with a stated reason**. No principle silently loses its card.
- [ ] **The variant rule rejects `"custom"` and an arbitrary string, and accepts `list` and
      `module`** — all four cases asserted. `PageShell.tsx` is **not edited**: `git diff` on it is
      empty, proving no variant was added, renamed or removed.
- [ ] **`hiddenCols` still works.** The three UI-preference sites appear in the baseline and
      **none of them is edited** — `git diff` touches no file that implements them.
- [ ] Web suite at baseline (16 failures in 4 files, zero new) and `tsc -p tsconfig.app.json` clean.
- [ ] **`docs/UI-KIT.md` is NOT in `git diff --name-only`.**
- [ ] The stale index rows are corrected in THIS file.
- [ ] The four review questions are answered, findings ① to ④ carried forward or closed.

---

### 6 · SEQUENCING

```
D0.5a -> D0.5b -> D0.5b.1 -> D0.5c -> D0.6 (done) -> D1 -> D2/D3/D4 codemods -> D5 (guard = FAIL)

D0.5c.2 (the drawer) runs beside these and blocks nothing.
```

**D1 does not block D0.5c.2 and D0.5c.2 does not block D1.** One widens a script, the other wraps
a drawer; they touch no common file. **D5 is what D1 unlocks** — and D5 cannot start until the
codemods have walked the baseline down, because turning the guard red over a frozen debt fails
every build in the repo.
