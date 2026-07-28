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
| On `main` | `ba7b7798` D0 law + doors · `19cad8e4` merge · `d83ecf98` §1.4 hierarchy · **`c9966ee3` T2 drawer** |
| Deployed to prod | ❌ **NOT YET.** T2 is on main and has never been built to Pages. Nobody has seen it in a browser. |
| Next thing that matters | **T3 — Jess uses the reordered drawer for one day** |

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
| **T3** | **Jess uses it for one day** | ⏳ **NEXT — blocked on a deploy** |
| **T4** | Freeze as Detail Blueprint v1 → Delivery/Payment/Purchase/Service Detail inherit | ⏳ after T3 |
| **D0.3** | Delete the retired design docs + the `carres-design` skill | ⏳ after the new kit is proven |
| **D0.4** | **Retire the old order-portal master spec completely** — move what is still true, prove nothing was lost, delete the file, kill every pointer | ✅ PR #491 |
| **D0.5a** | Foundation components, no behaviour + **`/ui`** — freezes Q1/Q3/Q4 | ⏳ |
| **D0.5b** | Foundation components, Radix | ⏳ |
| **D0.5c** | `PageShell` + `DataTable` + `DetailShell` — **extracted from Orders, not designed fresh**. `DetailShell` is specified in full below (L4 slot contract) | ⏳ **ready to build** |
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

## PENDING decisions — D5 is blocked until this is empty

| # | Question | Where it gets answered |
|---|---|---|
| Q1 | Spacing scale — 8-step `2 4 6 8 12 16 24 32` (~779 sites) or 6-step `4 8 12 16 24 32` (~2,225 sites) | `/ui` renders both — D0.5a |
| Q3 | `font-bold` (700, 158 uses) — delete into 600, or keep as a fourth weight | `/ui` v1 — D0.5a |
| Q4 | Icon stroke — Lucide default 2, or 1.5 | `/ui` renders both — D0.5a |

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

### The trap this card is most likely to fall into

**Restyling while extracting.** The whole value is that structure moved and appearance did not,
so that if the page reads better afterwards it is provably the hierarchy that did it. The line's
own lesson list already carries this one — it is repeated here because this card is the largest
opportunity to break it.

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
