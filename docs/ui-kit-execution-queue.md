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
| **D0.5a** | Foundation components, no behaviour + **`/ui`** — freezes Q1/Q3/Q4 | ⏳ |
| **D0.5b** | Foundation components, Radix | ⏳ |
| **D0.5c** | `PageShell` + `DataTable` + `DetailShell` — **extracted from Orders, not designed fresh** | ⏳ |
| **D1** | Build Guard over all 225 files, **warn only**, write the baseline | ⏳ |
| **D2 / D3 / D4** | codemod typography / colour / spacing | ⏳ |
| **D5** | Guard → **Fail**. Blocked while the PENDING register is non-empty | ⏳ |
| **D6** | Orders list: 7 bands → 3 (11 rows → 14-15 visible) | ⏳ |
| **D7+** | Delivery · Purchase · Receiving · Stock · Service · Payments · Catalog — one card each | ⏳ |

**Order is not negotiable for D0.5 → D6.** Rebuilding a page before the
components exist means hand-rolling it twice.

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
grepped, which returns tooltips. `ChaseNowPanel` existed all along; only Current
Issues was genuinely missing.

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
