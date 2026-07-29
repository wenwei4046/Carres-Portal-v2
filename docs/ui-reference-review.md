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

> **STATUS after the line closed (PM, 2026-07-28): this file is an INPUT, not a law.**
>
> **Reference Review is an input. UI-KIT is the only source of truth after consolidation.**
>
> **The observations frozen below are NOT architectural laws.** They carry no authority of their
> own and **become authoritative only once consolidated into `docs/UI-KIT.md`** — card **D0.6**,
> which runs **after D0.5c**. Until then, a chat that cites R1–R5 as law has cited an input. After
> then, the kit is the source and this file is the record of where the reasoning came from.

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
| **R3** | **Stripe Dashboard** | Detail page | ✅ **frozen 2026-07-28** — adopt with modification; one observation (a visible word is a contract with a stable id behind it) |
| **R4** | **Vercel (Geist)** | Design system | ✅ **frozen 2026-07-28** — adopt with modification; one observation (the kit is a dependency, not a document) |
| **R5** | **GOV.UK · NN/g · Shopify Polaris** *(SAP Content not covered — PM named three)* | Operational microcopy · language governance | ✅ **frozen 2026-07-28** — adopt with modification; one observation (words are delivered, not remembered) |

**Then, and only then:** one card that updates `docs/UI-KIT.md` from the frozen set.

## This line never freezes an enforcement mechanism (PM, 2026-07-28)

**Ruled on R4 and applied to the whole line.** A frozen observation states the *principle*. Whether
it is implemented through a Build Guard, CI, a script or any other tooling **belongs to
implementation** and is decided at KIT-CONSOLIDATION.

*Recorded by this chat as line-wide rather than R4-only, because R2's and R3's entries had each
proposed an "enforcement candidate" and leaving those standing would make two entries binding on
implementation while a third is not. **Those candidates are hereby non-binding notes.** If the PM
meant the ruling to apply to R4 alone, this paragraph is the thing to correct.*

## How later entries handle a repeat (PM, 2026-07-28)

**From R4 onwards, a reference that repeats an already-rejected concept is not re-argued.** It
cites R1–R3 and moves on. The single-status-word refusal in particular is settled: the reasoning
lives in R2's pattern note and R3's ②#1, and a later entry states only whether the reference met
the criterion or not.

## Parking lot

Items recorded once, here, so no entry repeats them.

| Item | What it is | Ruling |
|---|---|---|
| **KIT-CONSOLIDATION** | The single card that updates `docs/UI-KIT.md` from the frozen set. | ✅ **DONE 2026-07-29, card D0.6.** All five principles are in the law: **R1 → §8.0** · **R2 → §14.1** · **R3 → §10.1** · **R4 → §0.3** · **R5 → §10.2**. **From this moment `docs/UI-KIT.md` is the source and THIS FILE is the record of where the reasoning came from** (Rule 0). A chat citing this file as law has cited an input. Carried but NOT written as law: R1's *"the catalogue is full at four"* (the code ships a closed union of two — membership referred to the PM) and R1's build-guard row (no mechanism yet → D1). |
| **Worklist floorplan** | R1's finding: Fiori would call `ACTION-FLOW-STANDARD`'s "Open My Work" a Worklist, and that page does not exist. | **Parked by the PM, 2026-07-28.** Noted only. **No design discussion may be started from it.** |
| **Implementation observations** | R2's three `localStorage` sites; R4's stale machine mirror. | **Classified by the PM, 2026-07-28** as implementation observations held for KIT-CONSOLIDATION. **Handled 2026-07-29 (D0.6):** the mirror's *claims* are corrected — it declares its edition, no longer claims to outrank the law, and its dead citations carry a warning; **its exported values are untouched** (a value is a visual change → D2/D3). The three `localStorage` sites are **NOT removed** — §14.1 states the rule and names D1, because one of them is a feature somebody asked for and removing it is the PM's call. |
| **Documentation debt** | `docs/ui-reference/` does not exist while `UI-KIT` §11 cites screenshots in it. | **Classified by the PM, 2026-07-28** as documentation debt. **The review does not stop to fix it.** |

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
Carres already lets the browser hold the tool's shape.

> **CLASSIFIED BY THE PM, 2026-07-28: these are IMPLEMENTATION OBSERVATIONS ONLY.** They are held
> for the final consolidation. **No design work may be started from them during this phase**, and
> they are not a defect list to be worked. The screenshot finding below is **documentation debt
> only** — the review does not stop to fix it.

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

**Ratified by the PM, 2026-07-28, in these words — this wording is the accepted one:**

> **UI, workflow and navigation are opinionated and consistent across the company.
> Business parameters remain configurable.**

The reasoning behind it, kept because the sentence alone does not carry it: a user who can
rearrange the tool must be taught their own version of it, and every handover then starts from
zero. *(The PM's wording adds **navigation** — which this entry had not named — and scopes the
consistency to **the company**, not to the page.)*
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

---

# R3 · Stripe Dashboard — the detail page

**Reviewed 2026-07-28. Recommendation: ADOPT WITH MODIFICATION — one governance observation:
the visible word is a contract, and it has a stable identifier behind it.**

## Why this product is respected

Stripe's dashboard is the reference for **a detail page about money that has to be believed** —
by a merchant, by their accountant, and by a court if it comes to that.

- **One object anatomy, reused for every object type.** Payment, customer, invoice, subscription,
  dispute — all read the same way: what it is and how much · what happened to it in time order ·
  the structured facts · what it is related to · the raw record underneath.
- **A number never appears without its provenance.** Amount → fee → net, each traceable, nothing
  silently rounded, currency always stated. A figure you cannot take apart is a figure you cannot
  defend to a merchant who disagrees with it.
- **The screen never knows something the record cannot prove.** Every dashboard page can drop to
  the underlying object and the API request log. The UI is a *view over an auditable record*, not
  a second source of truth.
- **Failure reasons are specific.** Not "payment failed" but the issuer's actual decline reason
  and what may be done about it.
- **The vocabulary is published and versioned.** A payment's status words are part of the API
  contract, documented, and changing one is a versioned event that breaks integrations. The screen
  and the system speak the *same* words because they are the same words, not because two teams
  agreed to keep them in step.

## ① What do we learn?

**One governance principle: a visible word is part of a contract, and behind every visible word
there is a stable identifier that does not move when the word does.**

Stripe can afford to rename a label because the label was never what anything keyed on. The *word*
is presentation; the *identifier* is the contract. That separation is what makes a rename a
display change instead of a data migration.

**Carres has already invented exactly this — for actions, and only for actions.** Measured this
session in `packages/shared/src/order-action-words.ts`: every action carries a `key` from the
`OrderActionKey` union — `send_po` · `confirm_ready_date` · `issue_delivery_order` · `collect` and
the rest — and `DISPLAY_RANK` in `order-actions.ts` is keyed by that union, never by a label. It is
why C1 could delete the word `Chase` from the whole portal without touching a count, a filter or a
stored row.

So the principle is not new to Carres. **What Stripe adds is the scope**: it is a rule about *every*
visible word, not a technique that happened to be applied to one module. R2 already found the
counter-example — drawer panel state keyed by the panel's **title**, so a rename silently resets it
— and under this principle that is not a bug to argue about case by case; it is the same rule not
yet applied.

**The second half of the principle, which is what makes it governance rather than engineering:**
because the word is a contract, **changing one is an event with a procedure** — it goes through
`COPY-STANDARD`, and every surface follows from the one home. It is never an edit somebody makes
while they are in the file for another reason.

## ② What do we NOT learn?

| # | Stripe pattern | Why Carres refuses it |
|---|---|---|
| 1 | **One status word on the object** (`succeeded` · `failed` · `pending`) | **The third reference in a row, and the criterion set in R2 was applied rather than repeated:** a Stripe payment has essentially ONE track — the money — so summarising it into one word loses nothing. Carres runs three tracks that can disagree, and a delivered order that still owes money is Working, not Completed. **The test still finds no reference with three independent tracks that summarises them.** Refused again, for the same reason, not by habit. |
| 2 | **The raw object / API log on the page** | Directly against L2: Evidence is the *second sentence* of an answer and Detail *belongs somewhere else*. It is also a live exposure shape we already carry a carry-forward for (`combo-cost-pos-bundle-exposure` — principal-only cost fields riding a bundle to the client). A record an operator can open raw is a record whose every field is published. |
| 3 | **Test mode / Live mode as a global toggle** | Carres has no test mode. Every row today is test data and **at go-live the database starts clean** — a mode switch would be a control that lies, because there is no second environment behind it. |
| 4 | **The free-text `metadata` bag** | The opposite of a lesson this project has paid for twice. `ops_order_control.balance` was read by a lock for months and written by nobody; Purchasing P1 found two `delivery_fee_config` lead fields editable, saved and read by nothing. **A field with no reader is the disease**, and a metadata bag is a field with no reader by design. |
| 5 | **The developer surfaces** — webhooks, API keys, request logs, event replay | A different user entirely. Ours is described in CLAUDE.md as non-technical and low-English. |
| 6 | **The look** | Rule 2 of this line. |

## ③ Why does it fit Carres — and where it does not

**It fits** on the two regions Stripe is genuinely better at than anyone: **R5 money** and
**R6 record**. Its amount → fee → net discipline is our *one number, three depths* rule
(`ORDER-DETAIL-INFORMATION-MODEL` §6) reached from the money side — and its timeline is R6's
*who · when · what they did, in time order, with what was said kept verbatim*.

**It does not fit** in the same way R1 did not, which is now a pattern worth naming: **Stripe's
detail page is built for INVESTIGATION and ours is built for ACTION.** Stripe's reader is asking
*what happened and can I prove it*; ours is asking *what do I do now*, and leaves at step ② four
times out of five. **Two of the world's most respected detail pages are both document viewers.**
That is not an argument that L1 is unusual — it is an argument that L1 is answering a question
neither of them was asked.

## Conflicts found

**One, and it is the same one for the third time:** the single object status word, refused —
see ②#1, where the R2 criterion was applied and the reference failed it on the merits (one track,
not three).

**No conflict on the principle itself.** The stable-identifier rule agrees with what Carres already
does for actions; it disagrees with nothing frozen.

**Not re-opened, deliberately:** R2's panel-title finding is the natural example of this principle
and it stays an **implementation observation for the final consolidation** under the PM's ruling.
Naming it here as the same rule is a classification, not design work.

## The observation this reference contributes

**Carried to the final consolidation. Not a rule, not scheduled, `docs/UI-KIT.md` untouched.**

**Frozen by the PM, 2026-07-28, in these words:**

> **Stable ID is the contract.
> Visible labels are presentation attached to the Stable ID.**

**The PM's correction, recorded so it is not re-introduced:** this entry first wrote *"a visible
word is a contract"*, which reads as though the label itself carried the contract — the exact
confusion the principle exists to end. **The label carries nothing.** The ID is the contract; the
label hangs off it and may be replaced without the contract moving.

What follows from it: nothing may key on a label — not a count, not a filter, not a stored state,
not a test. Renaming is then a display change and never a data change. And because the *word* is
still governed even though it is not the contract, changing one goes through `COPY-STANDARD` as an
event, never as an edit made in passing.
>
> *Enforcement candidate for consolidation to weigh (§16 requires one):* the pattern already
> exists and is typed — `OrderActionKey` is a union and `DISPLAY_RANK` is keyed by it. The
> candidate is therefore **generalisation, not invention**: no persisted state, query key or
> storage key may be built from a display string. Build-Guard shaped, not Human-Review shaped.

## The limits of this reading

- **Read from product knowledge of the Stripe Dashboard and its published API vocabulary, held in
  memory.** **No live Stripe dashboard was opened this session** — note that a Stripe account
  *does* exist for this business (it carries the rental subscriptions), so this is a limit that
  could be lifted if the PM ever wants a visual reference; rule 2 of this line means R3 does not
  need one.
- **Carres side read live this session, not from memory:** `packages/shared/src/order-action-words.ts`
  (the `key` field and eleven of its values) and `order-actions.ts` (`OrderActionTrack`,
  `OrderActionKey`, `DISPLAY_RANK`) — grepped, so the claim that Carres already keys on identifiers
  is measured rather than recalled.
- **Not read:** the Payments module docs and `payment-module-proposal.md`. R3 is a governance
  reading; the money *module* is a business design question and is not this line's.

---

# R4 · Vercel (Geist) — the component system

**Reviewed 2026-07-28. Recommendation: ADOPT WITH MODIFICATION — one governance observation:
the kit is a DEPENDENCY, not a document. It is consumed, versioned, and migrated.**

## Why this product is respected

Geist is respected less for how it looks than for **what it is structurally**: a design system
shipped as a package that other people's builds depend on.

- **It is consumed, not read.** Vercel's dashboard, docs and marketing all install the same system.
  Nobody re-implements a button from a specification — they import one. That single fact is what
  keeps a system honest at scale, and it is why "a document cannot say tables look like this" is
  true everywhere and not only here.
- **Its documentation is the live component.** The system's docs site renders the real components
  in every state. Documentation that *is* the artefact **cannot go stale** — there is no second
  copy to drift.
- **Tokens are a closed, named, numbered set** with semantic aliases on top. The same family as
  Radix Colors, which Carres already chose.
- **Because it is a package, its API is a contract.** Adding a prop is cheap; removing one is a
  breaking change with a version and a migration path. Versioning is not bureaucracy here — it is
  the only way a consumer knows which rules they are on.
- **Dark mode and accessibility live in the token layer**, not as a theme bolted on afterwards.

## ① What do we learn?

**The kit is a DEPENDENCY, not a document — and a dependency has a version.**

Carres already believes half of this. `UI-KIT.md` opens by stating the kit has **three bodies that
must always agree, changed in the same commit** — the law, the machine mirror
(`apps/web/src/lib/design-standard.ts`) and the live `/ui` showcase, whose stated reason for
existing is that it *"structurally cannot go stale"*. Vercel corroborates that thesis completely.

**What Vercel adds is the part Carres has not built: a version, and the discipline that a version
buys.** A dependency tells you which rules you are on. A document does not — so code written
against an old version keeps citing it, confidently, forever, and nothing catches it.

**This is not theoretical. It is live today, and it was measured this session, not recalled:**

| Where | What it says | Against |
|---|---|---|
| `design-standard.ts:4` | *"⭐ v4 — rewritten 2026-07-15 from `docs/UI-KIT.md`"* | The kit was **rewritten on 2026-07-27**. The mirror is 12 days behind the law it mirrors. |
| `design-standard.ts:7` | *"Where any older doc, code comment, or token conflicts with **UI-KIT v4, v4 wins**"* | The current kit's first line: *"This file OVERWRITES every earlier design text… **this file wins**."* **Two bodies of one kit each claim to outrank the other.** |
| `design-standard.ts:38` | page canvas `#F3F4F6`, commented *"v4 §11a COOL neutral"* | The kit froze **Q2 — page canvas = Radix `slate-3` ≈ `#F0F0F3`** (§3.2), and §3.1 says *the law names the STEP, never the hex*. The cited **§11a does not exist** in the current kit. |
| `design-standard.ts:11–18` | *"Flame appears ONLY on a clickable primary action + a checked checkbox"* | §3.4 bans **the Carres flame outside the logo**, and §13.3 rule B **fails the build** on it. *"The Carres flame `#C44D2B` survives in exactly one place: the logo."* |
| `OrderDetailDrawer.tsx:651` (found in R2) | *"UI-KIT v4 §9: panels default COLLAPSED"* | Today's §9 is **UI States**. The rule is cited from a law that no longer exists. |

**The pattern, which is the actual lesson:** every one of those is a *confident citation of a dead
version*. Not one of them looks wrong when you read it — they each name a file, a section and an
authority. **A law with no version number produces code that cites it correctly and obeys the wrong
edition.** A dependency makes that impossible, because the version is in the import.

**Two secondary things Vercel corroborates**, recorded so they are not mistaken for new imports:

- **Executable documentation.** `/ui` is already this idea, already scheduled (D0.5a/b/c), and
  already carries the right justification in the kit's own words.
- **Props are the rules.** UI-KIT's `Component API` enforcement tier and L4's *"what the types must
  make impossible"* are the same instinct: a rule that cannot be expressed as the presence or
  absence of a prop is a rule nobody is enforcing. Vercel's corollary is worth having in view at
  consolidation — **a component that keeps gaining props is a component quietly becoming
  configurable**, which is where this reference meets R2's ratified principle.

## ② What do we NOT learn?

| # | Vercel / Geist pattern | Why Carres refuses it |
|---|---|---|
| 1 | **Publishing the kit as a public package** | The cost is real (API stability, release notes, semver on every change) and the consumer count is one. Carries none of the benefit and all of the ceremony. The *internal* version is the part worth taking. |
| 2 | **Dark mode as a first-class token dimension** | Doubles every token decision for an audience of zero — this is a warehouse and office tool on shared machines. If it is ever wanted, it is a kit card, never a side effect. |
| 3 | **Marketing-grade motion and polish** | Geist serves a developer-marketing surface as well as a product. Carres has no marketing surface in this codebase, and §1.3 prices every permanent pixel in orders-per-screen. |
| 4 | **Adopting Geist's components themselves** | Settled and unchanged: **Radix = behaviour, Carres = appearance** (`UI-KIT` §11). Taking a third party's appearance means later unwinding it. |
| 5 | **The look** | Rule 2 of this line. |

**No already-rejected concept recurred in this reference.** Per the PM's instruction, nothing from
R1–R3 is re-argued here; Geist carries no object-status concept to refuse.

## ③ Why does it fit Carres — and where it does not

**It fits** because Carres has already independently reached Vercel's central claim — that a design
system which exists only as prose loses to a design system that exists as code. The kit's own
rewrite was triggered by measuring 2,556 hard-coded font sizes and concluding *"things expressible
as a CSS class survived; things needing structure died."* Vercel is the same conclusion with a
decade of operating evidence behind it.

**It does not fit** where Vercel's system serves a public audience it must never break, and ours
serves one application it must be free to correct quickly. That difference is why the *package* is
refused and the *version* is taken: we want the discipline of knowing which edition a piece of code
was written against, without the ceremony of promising strangers we will not change it.

## Conflicts found

**None between the principle and a Carres law** — it strengthens `UI-KIT`'s own three-bodies rule
rather than competing with it.

**One conflict found INSIDE the kit, and it is the material fact of this entry:** the law and its
machine mirror currently **contradict each other on the page canvas and on the flame**, and each
declares itself the winner. The kit's rule is that the three bodies change in the same commit; on
2026-07-27 the law was rewritten and the mirror was not.

> **CLASSIFIED: implementation observation, held for KIT-CONSOLIDATION** (PM, 2026-07-28). Not
> design work, not fixed here. It is recorded with line numbers so the consolidation card does not
> have to re-find it. **Note for whoever picks it up:** the mirror is described in CLAUDE.md as
> *"a record of the kit, never a place to drive a change from"* — so this is a correction of a
> record, not a design decision.

## The observation this reference contributes

**Carried to the final consolidation. Not a rule, not scheduled, `docs/UI-KIT.md` untouched.**

**Frozen by the PM, 2026-07-28, in these words:**

> **Every kit artifact must declare the kit version it follows.**

The reasoning, kept because the sentence alone does not carry it: **a citation without a version
cannot be wrong on its face, which is exactly how it survives.** All five stale citations above are
correct-looking references to a dead edition.

**No enforcement mechanism is frozen** (PM, 2026-07-28 — Build Guard, CI, scripts or other tooling
is an implementation choice). **All version inconsistencies remain under KIT-CONSOLIDATION.**

## The limits of this reading

- **Read from knowledge of Geist and Vercel's product surfaces held in memory.** **No live Vercel
  dashboard or Geist documentation site was opened this session**, and nothing was added to
  `docs/ui-reference/` (documentation debt, parked).
- **Carres side read live this session, not from memory:** `apps/web/src/lib/design-standard.ts`
  (header and the colour block, opened), `UI-KIT` §3.1–§3.4, §11, §13.3 and §16, and the
  `OrderDetailDrawer.tsx:651` comment carried over from R2. Every contradiction in the table above
  is quoted from a file read this session — **none of it is recalled.**
- **Not verified:** how many of the 225 in-scope pages actually import from the stale mirror. That
  is a code question and belongs to KIT-CONSOLIDATION, not to a reference review.

---

# R5 · GOV.UK · NN/g · Shopify Polaris — operational microcopy and language governance

**Reviewed 2026-07-28. Recommendation: ADOPT WITH MODIFICATION — one governance observation:
the words are DELIVERED by the system, not remembered from a document.**

**Scope, as instructed by the PM:** operational microcopy and **language governance** only.
**Branding, tone of voice and marketing are excluded** — which removes a large part of what all
three publish, and all of what makes them famous outside operations.

**Read as ONE reference on one subject, not compared against each other** (rule 1 of this line).
They are grouped because each holds a different third of the same question: GOV.UK owns *how a
word is decided*, NN/g owns *why one word per concept is not taste*, Polaris owns *where the word
lives*.

**One thing flagged, not silently dropped:** the order table in this file grouped R5 as
*GOV.UK · NN/g · Shopify Polaris · **SAP Content***. The PM's instruction names three. **SAP's
content guidance is therefore not covered by this entry.** If it is wanted it is a line item, not
an omission to be quietly filled in later.

## Why these are respected

**GOV.UK** writes for people who have no choice, often under stress, often with low literacy, and
who cannot go elsewhere if the words fail them. That is the closest published match to a Carres
operator that exists. Its content design manual is enforced across every department: plain English,
short sentences, active voice, one thing per page, a published **words-to-avoid list**, and —
the part that matters most here — **words are decided by testing what real users say, not by what
is technically correct.**

**NN/g** is the evidence base. Thirty years of usability research supplying the *reasons*: users
scan rather than read, so meaning goes at the front of a label; an error must say what happened,
why, and what to do, without blame; a button names the **outcome**, not the mechanism; and
**synonyms measurably increase error rates** — one concept, two words, and people hesitate.

**Polaris** is the only one of the three that solved *delivery*. Its content rules do not live in a
style guide beside the design system — **they live inside each component's own documentation**, so
you cannot pick up the component and miss its words. Content is treated as a design material, not
as a layer applied afterwards.

## ① What do we learn?

**Words are DELIVERED by the system, not remembered from a document.**

This is the one third Carres does not already have — and the measurement that shows it also shows
how much of the rest is already in place.

**What COPY-STANDARD already is, read live this session:** GOV.UK's model, independently. It has a
central dictionary and states there is **no second list** — *"Every label lives in ONE place — the
audit table below. There is no second list of approved labels anywhere."* It has a banned list with
reasons (`Chase` names a mood not an outcome; `POD` → delivery photo). It has NN/g's label doctrine
— *"the label names the business outcome"*, and a tooltip that answers **why** rather than
repeating the button.

**And it independently reached GOV.UK's most-quoted rule, with GOV.UK's own justification.** This
entry set out to report a law-vs-law contradiction — *"no abbreviations, ever"* against
`ACTION-FLOW-STANDARD` Law 4's own `Send PO to {supplier}`. **The evidence refuted it before it
shipped:** COPY-STANDARD line 177 reads

> **"DO" and "PO" survive because the team already speaks them daily.**

That is *use the words your users actually use*, not the ones that are technically correct —
reached from Malaysian showroom floor practice rather than from a research programme, and the
exception is stated with its reason rather than left as an inconsistency.

**So GOV.UK and NN/g are corroboration. Polaris is the gap.** Today the words live in a 699-line
document that a chat must remember to open. The one place they are delivered is actions:
`packages/shared/src/order-action-words.ts` holds them per action, keyed by `OrderActionKey`, and
its own comment names the limit — *"string 3 of the five COPY-STANDARD locks per action"*. **Three
of five, for one module.** Every other module's words, and the other two strings, are recall.

**Why this is governance and not tidiness:** a rule that must be remembered is enforced by whoever
happens to be reading. The evidence that this is the failing mechanism and not a hypothetical is in
this project's own history — `Chase` survived a week in the drawer after being banned, and it was
caught by a source scan, not by anybody remembering. **A word that ships with the thing that
renders it cannot be forgotten by a chat that never read the document.**

## ② What do we NOT learn?

| # | Pattern | Why Carres refuses it |
|---|---|---|
| 1 | **GOV.UK's words-to-avoid list itself** | Adopt the *mechanism* — a banned list with a reason per word — never the *contents*. Theirs is written for citizens meeting government once; ours is an operational vocabulary for people who use it hourly, and it correctly keeps trade words its own users speak. COPY-STANDARD's `PO` exception would fail GOV.UK's list and is right. |
| 2 | **GOV.UK's reading-age target and general-public framing** | Ours is a trained reader in a known domain, not a stranger. Simplifying to a general-public reading age would strip precision the job needs. |
| 3 | **NN/g's reduce-friction guidance applied to gates** | Already settled — see **R2 ②#4**. Not re-argued. |
| 4 | **Polaris's merchant vocabulary** (`fulfillment` and the rest) | Shopify's business, not ours. `COPY-STANDARD` owns our words and there is no second list. |
| 5 | **Tone of voice, brand voice, personality guidelines** | **Excluded by the PM's instruction**, and most of what the three publish under "content" is exactly this. |
| 6 | **Localisation and multi-language content models** | The portal UI is English-only by a shipped ruling (PR #209). Not in scope, and not this line's to reopen. |

## ③ Why does it fit Carres — and where it does not

**It fits** because Carres's reader is GOV.UK's reader wearing a warehouse uniform: someone who did
not choose the words, cannot look them up, and pays immediately when they are wrong. Jess's own
ruling on `logistic` vs `logistics` — recorded in COPY-STANDARD with her reason, *"our english
bad"* — is a content-design decision made on exactly GOV.UK's grounds.

**It does not fit** where GOV.UK's reader meets the service once and ours meets it four hundred
times a month. GOV.UK optimises for a stranger's first read; we can and must optimise for a
regular's hundredth — which is why our vocabulary keeps `PO` and theirs would not, and why
precision beats simplification whenever the two disagree.

**No already-rejected concept recurred**, other than #3 above, which is cited rather than
re-argued per the PM's instruction.

## Conflicts found

**None.** This is the first entry in the line to find no conflict with a Carres law, and the
reason is worth recording: **`COPY-STANDARD` was written to the same doctrine these three publish,
so there was nothing to disagree with.** The gap it has is a delivery gap, not a doctrinal one.

**One hypothesis raised and refuted by evidence, recorded because a later chat will raise it
again:** *"no abbreviations, ever"* looks like it contradicts `Send PO to {supplier}`. It does not
— the rule carries its own stated exception (line 177), and the exception is grounded in what the
team says daily. **A chat that greps only the rule and not the paragraph under it will file this as
a contradiction.** It is not one.

## The observation this reference contributes

**Carried to the final consolidation. Not a rule, not scheduled, `docs/UI-KIT.md` untouched. No
enforcement mechanism is frozen** (PM, 2026-07-28).

> **Words are delivered by the system, not remembered from a document.**
> One dictionary with one word per concept and a reason for every banned word — which
> `COPY-STANDARD` already is — **plus the words travelling with the thing that renders them**, so a
> surface cannot be built without them. A rule that must be remembered is enforced by whoever
> happens to be reading.

## The limits of this reading

- **Read from knowledge of the GOV.UK content design manual and style guide, NN/g's published
  usability research, and Shopify Polaris's content guidelines, held in memory.** **None of the
  three sites was opened this session**, and nothing was added to `docs/ui-reference/`
  (documentation debt, parked).
- **Carres side read live this session, not from memory:** `docs/COPY-STANDARD.md` lines 38, 65–66,
  136, 150, 169–180 and 640–642 (the abbreviation rule and its `PO` exception, the one-place rule,
  the tooltip rule, the Logistics ruling), and `packages/shared/src/order-action-words.ts` (the
  `OrderActionWord` shape and its "three of five" comment). **The refuted contradiction above was
  refuted by reading the file, not by reasoning about it.**
- **Not covered:** SAP's content guidance, per the PM's naming — flagged above rather than dropped.
- **Not counted:** how many of COPY-STANDARD's locked strings across all modules are delivered in
  code versus held only in the document. Three-of-five is measured for actions only; the
  portfolio-wide count is a code question and belongs to KIT-CONSOLIDATION.
