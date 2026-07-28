# UI Reference Review — what we learn from the world, and what we refuse

> **Opened by Loo, 2026-07-28**, immediately after the Order Detail Information Architecture
> line closed. **It is a separate line and must not be mixed into that one.**
>
> This file is the ONE home for the review. It is not a design document and it changes nothing
> on its own.

## The rules (Loo, 2026-07-28 — not negotiable by a chat)

1. **One reference at a time.** Never two in a discussion, never a comparison table of five.
2. **Never copy a design.** A reference is read for its *reasoning*, never for its look. "They
   do it this way" is not an argument.
3. **Every reference answers three questions**, in this order and in full:
   - **What do we learn?**
   - **What do we NOT learn?**
   - **Why does it fit Carres?** — including where it does not.
4. **Freeze one, then start the next.** No reference is revisited once frozen.
5. **`docs/UI-KIT.md` is NOT touched during this line.** Every reference is reviewed and frozen
   first; the kit is updated **once, at the end**, from the frozen set. Editing the kit while
   the review runs is how five references become five half-applied styles.

**A reference is a source of REASONING, not of authority.** Nothing in this file outranks
`docs/UI-KIT.md`, `docs/COPY-STANDARD.md`, `docs/ACTION-FLOW-STANDARD.md`,
`docs/execution-queues-index.md`, or the frozen
[`ORDER-DETAIL-INFORMATION-MODEL.md`](ORDER-DETAIL-INFORMATION-MODEL.md). Where a reference
conflicts with one of those, the conflict is **reported and the law wins** — that is a finding,
not a licence.

## The order

| # | Reference | What it is being read for | State |
|---|---|---|---|
| **R1** | **SAP Fiori** | Enterprise workflow | ✅ **frozen 2026-07-28** — adopt with modification; one rule (closed floorplan catalogue) |
| R2 | Linear | Operator workflow | ⏳ |
| R3 | Stripe Dashboard | Detail page | ⏳ |
| R4 | Vercel | Design system | ⏳ |
| R5 | GOV.UK · NN/g · Shopify Polaris · SAP Content | Microcopy | ⏳ |

**Then, and only then:** one card that updates `docs/UI-KIT.md` from the frozen set.

## What each entry must record when it freezes

The three questions, plus two things a future chat will need and cannot recover:

- **Conflicts found** — where the reference disagrees with a Carres law, and which won.
- **The limits of the reading** — what was read (published design guidance, a live product, a
  screenshot) and what was not. A reference reviewed from memory says so.

---

# R1 · SAP Fiori — enterprise workflow

**Reviewed 2026-07-28. Recommendation: ADOPT WITH MODIFICATION — one rule, and it is about
page GRAMMAR, never about the Object Page's anatomy.**

## Why this product is respected

Fiori is the only reference on the list that solved *our exact problem at our exact disadvantage*.

- **It was retro-fitted onto a running ERP.** SAP GUI had tens of thousands of transaction
  screens (`VA01`, `ME21N`) accumulated over twenty years by different teams. Fiori got no
  greenfield — it had to impose one language while the system kept taking orders. That is
  Carres today: 285 pages, 274 of them hand-rolling their own shell, live orders on the screen.
- **Its users did not choose the software.** A consumer product optimises for delight because a
  user can leave. An ERP operator cannot leave, so Fiori optimises for *learn once, never
  re-learn* — the same premise as `ACTION-FLOW-STANDARD`'s four-line training.
- **Floorplans.** Its central invention: you do not design a page, you **pick a floorplan** from
  a closed catalogue (List Report · Object Page · Overview Page · Worklist · Analytical List
  Page) and fill its slots. Ten thousand apps, one page grammar.
- **Fiori Elements.** The page is *generated* from annotations on the data service, not
  hand-written — a developer cannot draw a different header even when they want to. That is
  `UI-KIT.md`'s own thesis (*能写成结构的活下来，只能写成文字的都死了*) built at industrial scale
  twelve years before we wrote it down.
- **It has survived three visual re-skins** (Blue Crystal → Belize → Horizon) with the floorplans
  unchanged. That is the evidence that separating structure from appearance actually holds.

## ① What do we learn?

**One thing, and it is not a look — it is that a page catalogue must be CLOSED, and that closure
is itself the feature.**

Fiori has no "custom" floorplan. A page that fits none of them means either the task was
misunderstood or a genuine gap was found, and finding a gap is a **governance event** — never a
licence to draw. The catalogue is small on purpose: a big catalogue is the same as no catalogue.

We already have the *shape* of this — `PageShell variant="list | dashboard | detail | settings"`
(`UI-KIT` §8.1) — but **no rule about who may add a fifth, or on what grounds.** UI-KIT applies a
cap discipline to persistent facts (`ORDER-DETAIL-INFORMATION-MODEL` §7② — "the set is full at
four") and to nothing else. That is the one hole this reference closes.

**Two further things Fiori corroborates but does not teach us**, recorded so a later chat does not
mistake them for new imports:

- **The floorplan is chosen by the user's TASK, not by the data's shape.** SAP keeps *List Report*
  (find and analyse) and *Worklist* (items requiring my action) as two floorplans over identical
  data, because the two readers arrive with different questions. That is our Business Thinking
  Model §2③ — *same page, three people, three entry questions* — reached from the app side rather
  than the human side.
- **Sections are declared, never composed.** Object Page facets come from metadata in a fixed
  order and a page cannot re-order them locally. That is **L4 rule 3 verbatim** (*"slots are named
  and ordered — never `children`"*). Two systems reaching the same rule independently is the
  strongest evidence available that the rule is right.

## ② What do we NOT learn?

**The Object Page anatomy — all of it.** Fiori's detail page is a **document viewer**: its job is
to show everything known about an object, well organised. Our L1 is a **work surface**: its job is
to answer six questions and to draw *nothing* where the order is calm. Different products.

| # | Fiori pattern | Why Carres refuses it |
|---|---|---|
| 1 | **`ObjectStatus` — one status word in the header** (Error / Warning / Success / Information) | *"An overall status — not a region. It does not exist."* (L1 §6). R3 needs three independent answers — goods · delivery · money — and one summarising word destroys all three. |
| 2 | **Header KPI facets and micro-charts** | This is `Header Everything`, which §7② exists to stop. Persistent facts are capped at four and carry **values only, no explanation and no door** (L2 rule ①). A header KPI is an explanation wearing a number's clothes. |
| 3 | **The sticky footer bar carrying the finalizing action** (Save · Submit · Edit) | L1: *"Doors are not a region… nobody opens an order in order to find a door."* A permanent action bar creates the doors region L1 refuses, and spends permanent height §1.3 budgets. |
| 4 | **Display / Edit mode toggle and draft handling** | L2 rule ②: *Detail is always a read-only door, never a writing one; to change something you go through R2's Context, because that door carries its gate.* Fiori flips the whole page into edit and the gate goes with it. |
| 5 | **Sections that render "No data" when empty** | UI-KIT §1.4 rule 2 and L4 rule 2: `currentIssues` returns null for `[]` and has **no** `emptyLabel`. A reassuring empty card spends height to say nothing. |
| 6 | **The Launchpad — a home wall of dynamic KPI tiles** | §1: *"The home page is not a display of all information. It is a tool for finishing today's work."* |
| 7 | **Compact vs Cozy density modes** | Two densities is two designs; every row height in the Table Dictionary would exist twice. |
| 8 | **The whole visual layer** — Horizon theme, SAP icon font, `#0a6ed1`, the Shell Bar, 3rem headers | §3 is Radix Colors, §5 is Lucide only, §2 is six type levels. Not open, and rule 2 of this line already forbids reading a reference for its look. |
| 9 | **SAPUI5 / Fiori Elements as technology** | Stack is locked (CLAUDE.md §2). We take the *idea* of a page generated from a contract; our contract is L4 plus TypeScript. |

**The trap worth naming, because Fiori is where it is most likely to be sprung:** every pattern in
it looks enterprise-credible, so copying the Object Page would import a status word, a KPI header
and an edit mode in one confident move — and each of the three breaks a *different* frozen ruling.
**Take the grammar. Leave the anatomy.**

## ③ Why does it fit Carres — and where it does not

**It fits** because Fiori's premise is ours: an operator who did not choose the software, a
catalogue of pages too large for anyone to hold in their head, and a business that changes faster
than the UI can be redrawn. Its answer — fix the grammar, let the content vary — is the answer
`PageShell` and `DetailShell` were already reaching for. This review does not change the direction;
it closes one hole in it.

**It does not fit** wherever Fiori is completing a *record* and we are prosecuting *work*. Fiori's
Object Page is at its best when a controller must see everything about a purchase order. Our page
is at its best when 80% of readers leave at step ②, having done one thing. That difference is why
four of Fiori's most recognisable detail-page patterns are refused above rather than adapted —
adapting them would have quietly re-opened L1.

## Conflicts found

**Four, all in the Object Page anatomy, all against FROZEN rulings, and the law won in every
case** — items #1–#4 in the table above (`ObjectStatus` vs "no overall status" · header KPIs vs the
capped persistent-fact set · footer action bar vs "doors are not a region" · edit mode vs
"Detail is read-only, the gate lives on R2's door").

**No conflict was found in the page grammar.** L4 and Fiori Elements are the same idea expressed
in two type systems.

**One finding reported, not built** (Law 0; it is a PM decision, not an architecture one): Fiori
would call `ACTION-FLOW-STANDARD`'s *"1. Open My Work"* a **Worklist floorplan**, and that page does
not exist — today the Orders list is asked to be both the worklist and the browse surface. Recorded
here so the observation is not lost; it belongs to a PM queue, not to this line.

## The rule this reference freezes

**Frozen here, NOT written into `docs/UI-KIT.md`** — rule 5 of this line: the kit is updated once,
at the end, from the frozen set.

> ### Proposed as UI-KIT §8.0 — the floorplan catalogue is CLOSED
>
> Every in-scope page renders **exactly one `PageShell`** and declares **one `variant`** from a
> closed union. There is no `custom`, no free-form page, and no in-scope page that renders no shell.
>
> **The catalogue is full at four** — `list · dashboard · detail · settings`. Adding a fifth is a
> governance event under the same discipline as §7②'s persistent facts: it requires naming the
> **user task** no existing floorplan can serve. *"This page is a bit different"* is not a task and
> is not an argument.
>
> | Rule | Enforcement | Status | Evidence |
> |---|---|---|---|
> | Every page declares one floorplan from a closed set | **Type System** — `variant` is a closed union; `"custom"` does not compile | ⏳ D0.5c | `PageShell.tsx` |
> | A page component that renders no `PageShell` fails the build | Build Guard G | ⏳ D0.5c | `check-design.mjs` |

**When it lands, and why the timing is not a detail.** `UI-KIT` §16 carries two health rules:
coverage may never go down, and Human Review debt may never grow. Today the count is **3 enforced
/ 33 rules = 9.09%**, where *enforced* means the mechanism is live, not scheduled. Writing this
rule into the kit on its own would make it **3 / 34 = 8.82%** — denominator up, numerator flat, the
number ticks down, which is exactly what §16 rule 1 forbids. It therefore lands **in the same PR as
`PageShell.tsx` (card D0.5c)**: rule and mechanism together, **4 / 34 = 11.8%**, and the number goes
up.

That is also the answer to why one reference yields one rule and not thirty paragraphs: a rule
without a mechanism is a rule that has not been finished, and finishing one costs a card.

## The limits of this reading

- **Read from published SAP Fiori design guidance held in memory** — the floorplan catalogue, the
  Object Page anatomy, Fiori Elements' annotation model, the five design principles, and the
  Belize → Horizon theme history. **No live SAP system was opened**, no screenshot was taken, and
  **nothing was added to `docs/ui-reference/`** (`UI-KIT` §11 requires a screenshot in the repo
  before a visual reference may be cited — and no visual reference is cited here, by design).
- **Carres side read live this session, not from memory:**
  [`docs/ORDER-DETAIL-INFORMATION-MODEL.md`](ORDER-DETAIL-INFORMATION-MODEL.md) in full,
  [`docs/ACTION-FLOW-STANDARD.md`](ACTION-FLOW-STANDARD.md) in full, and
  [`docs/UI-KIT.md`](UI-KIT.md) §0–§2 and §5–§16.
- **Not read, and not needed for this entry:** `COPY-STANDARD.md` (Fiori's wording contributions
  belong to R5, not here) and the module working-flow files.
