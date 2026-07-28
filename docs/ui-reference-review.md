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
| **R2** | **Linear** | Operator workflow | ✅ **frozen 2026-07-28** — adopt with modification; one observation (opinionated, not configurable) |
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
not exist — today the Orders list is asked to be both the worklist and the browse surface.

> **PARKING LOT — ruled by the PM, 2026-07-28.** Noted only. **No design discussion may be started
> from it**, in this line or in a later one, until the PM takes it off the lot. A chat that opens a
> Worklist design because it read this paragraph has broken the ruling, not followed the finding.

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

**Narrowed by the PM, 2026-07-28 — read this before the paragraph below.** The closed-catalogue
principle is accepted as an **OBSERVATION carried to the final consolidation**, not as a rule
scheduled onto a build card. It is not attached to D0.5c and no card changes because of it. The
arithmetic that follows is kept because it still decides *how* the observation may eventually be
written — never *when* this line writes it.

**Why it cannot land alone, whenever it lands.** `UI-KIT` §16 carries two health rules:
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

---

# R2 · Linear — operator workflow

**Reviewed 2026-07-28. Recommendation: ADOPT WITH MODIFICATION — one observation, and it is
about GOVERNANCE (who decides), not about speed, keyboards or looks.**

## Why this product is respected

Linear is the reference for *software built for the person who is in it all day*.

- **It made speed a design principle instead of a performance target.** A local-first sync engine,
  optimistic writes and no full-page spinners — interactions land in tens of milliseconds. Nobody
  had argued before that latency is a *design* decision made at the architecture layer, not a
  polish task at the end.
- **It published its philosophy.** *The Linear Method* is a written product doctrine — build for
  the people doing the work, opinionated workflow, no busywork, aim for clarity. Design systems
  are common; a design *doctrine* a company will refuse features over is rare.
- **It refuses configurability.** Very few settings, no per-user layouts, no custom field zoo. The
  product decides, and that is stated as a feature rather than apologised for.
- **Visual restraint.** A neutral grey field, one accent, tiny monochrome icons, status carried by
  a small glyph rather than a coloured band. Quiet enough to look at for eight hours.
- **Keyboard-first, with a command menu** as the single door to every capability.

## ① What do we learn?

**One thing: *opinionated, not configurable* — and where exactly that line falls for Carres.**

Linear's real discipline is not "few settings". It is that **the product's own shape is not the
user's business.** How the list is arranged, which columns exist, what the workflow steps are —
decided once, for everybody, by the people who own the product. A user who can rearrange the tool
has to be *taught their own version of it*, and every handover starts from zero.

That is directly ours: `ACTION-FLOW-STANDARD` opens with *"The system leads; the staff follow"*
and prices a new hire's whole training at four lines. Four lines only works if the tool is the
same tool for everybody.

**The refinement Carres needs — and Linear does not have to make, because it has no factories.**
Two things wear the word *settings* and they are opposites:

| | Configurable? | Why |
|---|---|---|
| **Business numbers** — production days per supplier, work weeks, reorder points, reserve levels, commission rates | **Yes, and it is compulsory** | Purchasing P1 made seven of these editable precisely because a constant in code was a number nobody could correct. A business number that only a developer can change is a defect. |
| **The UI and the workflow** — which columns exist, what order blocks appear in, which panels are open, what an action is called, which step comes next | **No, ever** | This is the tool's shape. Two operators seeing two shapes is how a handover fails, and `ORDERS-WORKING-FLOW`'s multi-operator handover is a live business fact, not a hypothetical. |

**A second thing, adopted with a hard limit** (the limit is in ②): *speed is decided at the
architecture layer, not at the polish stage.* An operator making forty calls a day pays for every
spinner forty times.

## ② What do we NOT learn?

| # | Linear pattern | Why Carres refuses it |
|---|---|---|
| 1 | **Optimistic UI on writes** | Linear can be optimistic because an issue's status has **no server-side business gate that can refuse it**. Ours do: confirm-booking, issue-delivery-order and proceed-order all refuse on goods, money, Sunday or a public holiday — C7 moved the hard gate *onto* issuing the document. An optimistic "issued" that the server then refuses is **worse than a spinner**, because by then the operator has told the customer. Optimism is safe for reads, navigation and filtering; it is banned on a gated write. |
| 2 | **⌘K command palette as the primary door** | Against `ACTION-FLOW-STANDARD`'s one sentence — *staff never decide what is next*. A palette is built for a user who already knows what they want to do. Ours is described in CLAUDE.md §1 as a **non-technical, low-English operator**, on a shared login, with a phone in the other hand. |
| 3 | **Keyboard-first as an assumption** | Linear assumes one person, one machine, all day. Carres operations is several people through one shared login with mid-order handovers. Shortcuts as an *accelerator* are a future question; keyboard-first as the *model* imports the wrong user. |
| 4 | **The anti-friction instinct applied to records** | Linear deliberately keeps an issue thin — fewer required fields, less ceremony. Carres's Service Case **refuses to be filed without the photos its issue type demands** (S2), and Rental refuses an unsigned agreement. Removing friction is right for a to-do and wrong for a claim; a claim's friction *is* the product. |
| 5 | **One status field on the object** | Same refusal as Fiori's `ObjectStatus`. See the pattern note below. |
| 6 | **The look** — dark default, the purple accent, their type and icon set | §3 is Radix, §5 is Lucide, §2 is six type levels — and rule 2 of this line already forbids reading a reference for its look. |
| 7 | **Cycles · projects · roadmap** | Product-management concepts. Not our business model. |

### The pattern worth naming now, before a third reference triggers it

**Two references in a row have put ONE status word on the object, and we have refused both times**
— Fiori's `ObjectStatus`, Linear's single status field. Stripe (R3) will almost certainly make it
three, because nearly every product outside logistics has one.

Recorded here so that the argument from consensus — *"every serious product does this, our rule
must be wrong"* — has something to meet. The reason we refuse is **not** taste and is not
contrarianism: Carres runs **three tracks that can disagree** (goods · delivery · money), and a
delivered order that still owes money is Working, not Completed. Products with one status word are
products whose object has one track. **When a reference does have three independent tracks and
still summarises them into one word, that will be a genuine finding worth re-opening.** None so far
does.

## ③ Why does it fit Carres — and where it does not

**It fits** because the two users are the same *kind*: somebody inside the tool all day, whose
minutes are the product's real cost, and who is measured on throughput rather than on exploring
features. Linear's governance answer — the product's shape is not up for negotiation — is the same
answer `ACTION-FLOW-STANDARD` and `COPY-STANDARD` already give, reached from the tooling side.

**It does not fit** wherever Linear assumes its user *chose the tool and is technical*. That single
assumption produces the palette, the shortcuts, the thin records and the anti-friction instinct —
and every one of them inverts for an operator who did not choose the portal and cannot type an
English command. **Linear's user opted in. Ours was assigned.** That is the sentence to keep; it
explains four refusals at once.

## Conflicts found

**None between the principle and a Carres law.** But applying it surfaced three live places where
Carres already lets the browser hold the tool's shape — reported under Law 0, **not fixed, and not
a redesign proposal**:

| Where | Key | What persists |
|---|---|---|
| `OperationOrdersControl.tsx:1389` | `carres.orders.hiddenCols` | which columns the Orders table shows — **per browser** |
| `OrderDetailDrawer.tsx:662` | `ops-drawer-panel-v4:{title}` | every drawer panel's open/closed state, **across orders**, keyed by the panel's TITLE |
| `OrderDetailDrawer.tsx:2010` | `ops-drawer-rail` | the drawer rail's collapsed state |

Three things about the middle one are worth having on record:

1. **Its comment cites "UI-KIT v4 §9"** as the authority for panels defaulting collapsed. UI-KIT v4
   was overwritten on 2026-07-27; today's §9 is *UI States*. The code is carrying a rule from a
   law that no longer exists.
2. **L4 rule 1 says `currentAction` has no `collapsible` and no `hidden`**, and §1.4 rule 1 says
   Current Action is always visible and survives a collapsed rail. Whether today's Current Action
   block is one of the five panels rendered through that collapsible wrapper **was not verified
   this session** — it is a code question for D0.5c, and this line does not touch code.
3. **The store is keyed by the panel's title**, so renaming a panel silently resets every user's
   state for it. C1/PR #487 renamed that rail's panel from `Actions` to `Calls`; whether that
   panel goes through this wrapper was likewise not verified.

**A second finding, on this reference specifically:** `UI-KIT` §11 cites
`docs/ui-reference/linear-*.png` and `docs/ui-reference/primer-blankslate.png` as the visual
references for page layout, table, sidebar, status pill and empty state — and **`docs/ui-reference/`
does not exist.** §11's own rule is *"Screenshots live in the repo. An external URL is not a
reference — it changes without telling us."* The Reference Library currently points at nothing.
No screenshot was added by this entry, because rule 2 of this line means R2 contributes no visual
reference at all.

## The observation this reference contributes

**Carried to the final consolidation. Not a rule, not scheduled, and `docs/UI-KIT.md` is not
touched** (rule 5 of this line; PM ruling 2026-07-28).

> **Opinionated, not configurable.** The UI and the workflow are decided once, for everybody —
> which columns exist, what order blocks appear in, what an action is called, which step is next.
> **Only BUSINESS NUMBERS are settings.** A user who can rearrange the tool must be taught their
> own version of it, and every handover then starts from zero.
>
> *Enforcement candidate for consolidation to weigh (§16 requires one):* the absence of a
> per-user UI-preference store — no browser-persisted layout, panel or column state under
> `pages/**`. That is Build-Guard shaped rather than Human-Review shaped, which matters because
> §16 forbids growing the Human Review debt. **Its cost is not zero:** three live behaviours listed
> above would come off, and one of them (`hiddenCols`) is a feature somebody asked for. That is a
> consolidation decision, not this entry's.

## The limits of this reading

- **Read from *The Linear Method* and from product knowledge held in memory.** **No live Linear
  workspace was opened this session**, no screenshot was taken, and nothing was added to
  `docs/ui-reference/` — which, as recorded above, does not exist.
- **Carres side read live this session, not from memory:** the three `localStorage` sites above
  (grepped and opened), `UI-KIT` §11 and §16, and the frozen L1/L2/L4 text quoted.
- **Not verified, and deliberately left alone:** whether the Current Action block passes through
  the collapsible panel wrapper. Answering it means reading a 7,000-line file for a code decision
  that belongs to D0.5c, and this line reviews references — it does not open code cards.
