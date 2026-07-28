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
| **`/ui` is LIVE** | **https://erp.carresofficial.com/ui** — deployed 2026-07-28 from main tip `9c3697a9`, public, no login. Open it and answer Q1 · Q3 · Q4. It is also on `pos.carresofficial.com/ui` and both `pages.dev` apexes |
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
| **D0.5b** | Foundation components, Radix | ⏳ **GATED (PM, 2026-07-28)** — starts once Q1 · Q3 · Q4 are frozen on `/ui`. **T3 does not gate it** — the two business validations run beside each other, and T3 has a schedule of its own (see the row above: after R8) |
| **D0.5c** | `PageShell` + `DataTable` + `DetailShell` — **extracted from Orders, not designed fresh**. `DetailShell` is specified in full below (L4 slot contract) | ⏳ **ready to build** |
| **D0.6** | **KIT-CONSOLIDATION** — write the five frozen reference principles into the law, once. Full card below | ✅ **planning card APPROVED 2026-07-28.** Build **after D0.5c**, before D1 |
| **D1** | Build Guard over all 225 files, **warn only**, write the baseline | ⏳ |
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

## PENDING decisions — D5 is blocked until this is empty

| # | Question | Where it gets answered |
|---|---|---|
| Q1 | Spacing scale — 8-step `2 4 6 8 12 16 24 32` (~779 sites) or 6-step `4 8 12 16 24 32` (~2,225 sites) | ✅ **on `/ui` now** — waiting on Jess |
| Q3 | `font-bold` (700, 158 uses) — delete into 600, or keep as a fourth weight | ✅ **on `/ui` now** — waiting on Jess |
| Q4 | Icon stroke — Lucide default 2, or 1.5 | ✅ **on `/ui` now** — waiting on Jess |

**All three are now a Jess task, not a build card** — same shape as T3. Open
`/ui`, look at the top section, answer three questions. Nothing in the code
moves whichever way they go (see D0.5a above).

### The gate, ruled by the PM 2026-07-28

```
D0.5a ✅ built
   ├── Q1 · Q3 · Q4 frozen on /ui   ← business, blocks D0.5b
   └── T3 Jess uses the drawer      ← business, blocks T4 and never D0.5b;
                                        its own schedule says after R8
D0.5b  starts once the three are frozen
```

**Two rulings about T3 met here and both survive** — the PM's *"T3 may run in
parallel"* is about SEQUENCING (T3 is not in front of D0.5b), and Loo's row
above is about TIMING (do not hand T3 to a chat until the Purchasing line stops
changing screens under Jess). Neither cancels the other: T3 does not gate the
freeze or D0.5b, and it still waits for R8.

**D0.5b is gated on the freeze and on nothing else.** Not on T3, and not on a
migration — Radix primitives carry behaviour, and behaviour does not wait for a
spacing step. The reason the freeze DOES gate it: D0.5b's ten boxes are modals,
drawers and menus, which is where spacing compounds. Building them against an
unfrozen scale is the one place the "any answer costs zero component changes"
property from D0.5a would stop holding.

**`/ui` is reachable — that blocker is closed.** Loo ruled it a business
validation showcase rather than a feature rollout, so D0.5a was merged (PR #498)
and deployed from the main tip: **https://erp.carresofficial.com/ui**, public,
no login, verified in a real browser. Nothing else stands between Jess and the
three answers.

Frozen: **Q2 page canvas = Radix `slate-3`** · **Q5** Current Issues is its own
block · **Q6** the KPI boxes merge into Progress (*already true — see the lesson
below*) · **Q7** Current Action never collapses · **Q8** it is called `Progress`,
not `Timeline` · **Q9** issues group by goods · delivery · money.

---

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

**The five frozen principles, listed here so the builder does not have to reconstruct them:**

| From | Principle (PM-ratified wording where one exists) |
|---|---|
| **R1** SAP Fiori | Closed Pattern Library — *accepted as an observation for consolidation* |
| **R2** Linear | *"UI, workflow and navigation are opinionated and consistent across the company. Business parameters remain configurable."* |
| **R3** Stripe | *"Stable ID is the contract. Visible labels are presentation attached to the Stable ID."* |
| **R4** Vercel | *"Every kit artifact must declare the kit version it follows."* |
| **R5** GOV.UK · NN/g · Polaris | *"Words are delivered by the system, not remembered from a document."* |

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
