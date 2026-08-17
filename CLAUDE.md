# CARRES PORTAL — PROJECT CONSTITUTION

> **This file is the execution/build law.** It holds only what EVERY
> chat must know. It is loaded automatically into every session, so it is the one thing nobody
> can skip — and that is why it stays short. **200–300 lines. If it grows past that, something
> in it is not constitutional and belongs in a module MASTER.**
>
> **You read this file and ONE current module MASTER. That is the business path.** For UI
> work, also read `docs/ui/MASTER.md`, the only current UI authority. Any other document is a
> supporting reference or historical evidence; it cannot override those three roles.

---

## 1 · Mission

Carres sells furniture. This portal runs the business end to end — a customer order is taken,
the goods are bought from a factory, they arrive, they are delivered, the money is collected.
Nine roles use it. **Jess is the boss and has no coding background.**

**The operator is the design target.** Low English, low computer literacy, switching between
states all day. The portal must lead a new hire step by step: *what to do today*, with the
number, the party and the date already worked out, and one obvious button.

---

## 2 · Design philosophy

**Law order: Business Rules → Information Architecture → Design System → Implementation.**
On a conflict, Business wins.

- **The current page is Version N, never automatically final.** Studying it, finding it wrong
  and proposing better is your DUTY. Building before approval is the only thing forbidden.
- **Token VALUES are locked** — spacing, colour, typography, icons live in
  `docs/01-design-tokens.md` and are not design opinions. **Composition is yours.**
- **A component that does not exist: STOP and ask for it to join the kit.** Never draw one
  inline "just this once".
- **Content decides column width**, never the table width. **Expand has exactly one job.**
  **An inline second line is the only exception.**
- **Copy the POWER of the tools the team already uses, never their ASSUMPTIONS.** AutoCount's
  sortable headers, per-column filters and footer totals: yes. Its 17 accounting columns,
  ownerless 1,700-row lists and windows-inside-windows: never.
- **A feature is wired only if it makes the operator finish faster today.** "The kit has it" is
  not an answer. Three fewer clicks, five fewer documents opened, one fewer exception missed.
- **A word that is not in `docs/COPY-STANDARD.md` may not appear on screen.** Stop and ask.

---

## 3 · The five documentation laws

**Rules exist to build a better product.** If following one produces a worse product, STOP —
study, measure, challenge, then improve the rule. A better product beats an older rule; better
evidence beats older documentation.

### Law 1 · One Project Constitution, one MASTER per module
`CLAUDE.md` + `docs/<module>/MASTER.md`. **Two files to start work. Never eight.**
Old queues and checkpoints live in `docs/archive/` — **no chat reads them.**

### Law 2 · Build first. Freeze after validation. Then overwrite the MASTER
```
Build  →  Reality  →  Architecture review  →  If approved  →  Overwrite MASTER
```
**Approved business truth lives in the governing MASTER; code is evidence of the current
implementation, not authority to silently overturn that approved target.** Business rules freeze
before implementation; **UI layout does not freeze before operators have used it.** A design that is
worse in practice is CHANGED, not defended — *"we decided that before"* is not a reason.
**Reality outranks documentation.** If observation and the document disagree, measure again,
then update the document. Never defend an outdated document.

Hypothesis —validate→ Finding —survive→ Principle. A HYPOTHESIS is an idea not yet checked and
may never be written as a Finding. A FINDING is checked and carries its evidence. A PRINCIPLE is
a Finding that SURVIVED — challenge, other projects, real operation. It is admitted only when
the evidence is strong enough AND its boundary is explicit: a Principle must be falsifiable.
Every Principle names the Findings it rests on; if one is overwritten it returns to review in
the same change. **Principles guide research; they never replace research.** No Principle is
permanent — it holds only until better evidence replaces it.

### Law 3 · Override Law — a MASTER is never permanent, and it holds ONE truth
**A better architecture always wins.** When one is approved, **overwrite** the MASTER.
Never create `MASTER-v2` · `MASTER-final` · `MASTER-revised` · a checkpoint · an execution
queue · a planning queue. **There is only `MASTER`, continuously overwritten. Git history is
the archive; documents do not carry history.**

**THE MASTER OVERWRITE LAW (Jess, 2026-08-06).** When an approved workflow, operator
journey, ownership or business rule changes: **delete the obsolete version completely and
rewrite with the approved one.** Never append beside it, never keep legacy text, never keep
an alternative version, never cite a superseded document as if it still ruled. **Git is the
only history; a MASTER always contains exactly one current truth.**

### Law 4 · Challenge Law — every chat must ask
```
If I joined Carres today, would I still design it this way?
```
If the answer is **no**, you must state: **Current → Problem → Better design → Trade-off →
Recommendation.** *"The MASTER says so, therefore I follow"* is the failure this law exists to
stop. **A chat that saw a problem and said nothing has failed, even if it shipped perfectly.**
**Be a critical product architect.** Challenge assumptions, challenge documentation, challenge
previous decisions. Never defend the repository, never defend documentation, never defend a
previous decision — defend the product, and build something better.

### Law 5 · Simplicity Law — the default action is REDUCE
Before touching any document, ask: **can the project have one file fewer?**
```
not a new document   →  overwrite the old one
not a new checkpoint →  update the MASTER
not a new guideline  →  fold the rule into this Constitution
```

---

## 4 · Golden development flow

### ERP WORK START LAW

Before planning, changing code, or declaring the state of any ERP module:

1. Read [`docs/ERP-ARCHITECTURE.md`](docs/ERP-ARCHITECTURE.md) for the whole journey, ownership
   boundaries and cross-module handoffs.
2. Read the target module's current `MASTER.md` in full and, for UI work, read
   [`docs/ui/MASTER.md`](docs/ui/MASTER.md).
3. Read only cross-module MASTER sections explicitly referenced by the target module or the task.
4. State separately: **APPROVED TARGET · BUILT / VERIFIED · GENUINELY UNRESOLVED · referenced
   dependencies**. Never describe an approved target as built, or current code as the intended
   destination.
5. Inspect current code, migrations and production after the governing target is known. They prove
   what exists now and reveal the gap; they do not silently veto approved business or UI truth.
6. Never invent a missing rule. Mark it **UNKNOWN**, exhaust current governing docs and relevant
   evidence, then ask the owner one business question only if the answer still changes the result.
7. After an approved implementation is production-verified, overwrite the module MASTER's current
   implementation record in the same change. Never append a competing checkpoint.

### PLAN / DESIGN CHAT ENTRY LAW — APPROVED / LOCKED, owner ruling 2026-08-11

**A PLAN / DESIGN chat continues from approved truth; it does not rediscover it.** At entry it must:

1. Read the current governing path above before researching or advising. Current approved law is
   the baseline, not a hypothesis to reconstruct from chat history, old screens or old commits.
2. State exactly three things: **WHAT IS ALREADY APPROVED · WHAT IS GENUINELY UNRESOLVED · WHAT
   SINGLE DECISION / DECISION SURFACE THIS SESSION IS SOLVING.**
3. **APPROVED / LOCKED decisions are not re-researched, reopened or offered for re-approval.**
   Continue from the recorded answer.
4. For a genuinely **UNRESOLVED** design decision, proactively research only that declared decision
   surface. Use the relevant governed references — including Linear, Shopify, AutoCount, 2990,
   current Carres UI and other mature ERP patterns when useful — and exclude unrelated history and
   pages. Derive the common patterns and real trade-offs, then give **one evidence-based Carres
   recommendation**, not arbitrary A/B/C options. References are evidence, never specification;
   Carres business truth and governing architecture still win.
5. Treat current code and screens as implementation evidence: study them for gaps and usability,
   but never let them override approved target truth.
6. Challenge approved truth only for a genuine contradiction, demonstrated impossibility, or new
   business evidence requiring Jess's decision. State the evidence and the exact ruling affected;
   preference is not a challenge.
7. When Jess designates **PLAN MODE** or a **Layout Approved** gate, write no implementation code
   and make no implementation commit until that explicit approval. Governing-document updates are
   allowed and required: when Jess explicitly approves a complete business, UI or layout decision,
   immediately overwrite the appropriate authoritative MASTER with that current **APPROVED / LOCKED**
   truth. Do not move through further major design decisions while an approved ruling exists only in
   conversation.

### OWNER-APPROVED OBJECT / DOMAIN ARCHITECTURE COMPLETENESS LAW — APPROVED / LOCKED, owner ruling 2026-08-12

**A mission named for a business object or domain is not a local screen question.** Before the
planner may claim that planning is complete, name the “next unresolved decision”, or split an
implementation Card for a Sales Order, Purchase Order, Receipt, Claim, Payment or equivalent
object, it must prove object-level coverage. **The planner owns completeness; Jess owns business
decisions and final approval.** Jess is not expected to know which questions, reference functions,
downstream consequences or international patterns require investigation. The planner plans ahead,
surfaces material omissions Jess did not ask about, and explains why they matter.

The planner first enumerates and audits the object's complete **relevant** surface: creation and
source · identity and numbering · Register / view / detail · edit · revision / amendment /
versioning · approval and permissions · documents / PDF and historical documents · copy /
duplicate · cancel / void · settings / maintenance / master data · scan / import · search / filter /
columns · selection / bulk actions · context actions · history / audit · exceptions · upstream
source · concurrency / rollback · lifecycle completion · reporting / export · every relevant
downstream consequence, plus any capability revealed by Carres or reference evidence. This is a
completeness checklist, not an instruction to build every capability.

Reference-product function mining is **object-level, never screenshot-level**. Inspect the relevant
backend, workflow and capability surface — not only visual layout and not only the feature the
owner happened to mention. Use the governed references that fit the object: especially 2990 for
Sales Orders, plus AutoCount, Linear, Shopify and appropriate mature / international ERP products.
Carres semantics and ownership are evaluated first; references provide proven functions and faster
reusable ideas, never foreign business truth.

The required output is one complete mapping:

```
REFERENCE CAPABILITY
→ CARRES CURRENT EQUIVALENT / OWNER
→ KEEP / ADAPT / RELOCATE / BUILD / REJECT
→ WHY
→ DEPENDENCY / CONFLICT
```

For every proposed change, apply the analogous ERP consequence check. A Sales Order Amendment, for
example, must trace Customer commitment · existing PO / Supplier commitment · Receiving · reserved
or physical Stock / Unit allocation · Delivery / DO commitment · Payment / deposit / refund and
commercial truth · current and historical customer-facing PDF · Work actions · permissions ·
history / audit · Finance · Claims · Issue Tracker and every other affected owner. The source module
may summarise or link; it does not acquire another module's writer.

Missing evidence is **UNKNOWN**, never an invitation to ask the owner to remember another feature,
say “check international”, point out Settings, or discover the next consequence for the planner.
Locked truth is protected but is not a feature freeze: after research, the planner may recommend a
useful missing capability, while never asking Jess to re-approve current truth.

Only after this pass identifies the complete unresolved set may the planner call anything **NEXT**,
sequence genuine owner decisions one at a time, or declare the mission complete. Maintain a
proposed **unnumbered** dependency roadmap; never invent an official Card number. Before asking a
local owner question, the planner must be able to state concisely: current mission · object-level
coverage completed · important gaps · cross-module consequences · reference evidence · why this is
genuinely the next owner decision. Synthesise; do not dump repetitive research. **The owner does
not function-mine the reference product for the planner, and a local answer is not an architecture
audit.**

**PLAN / DESIGN restart contract.** A fresh Plan / Design chat reads this Constitution → ERP
Architecture → target module MASTER → UI MASTER when UI is involved. It resumes approved truth,
then performs or resumes the relevant object/domain completeness pass before naming the next
decision surface. A Register mission additionally follows UI MASTER's Register restart contract.
It does not begin with a blank-sheet redesign, repeat settled research, or reduce an object mission
to the page/question in the prompt. It ends at the existing governed boundary: **READY FOR CARD**
when a buildable slice is fully governed; **PLAN MISSION COMPLETE** when no planning work remains;
**START A NEW CHAT** when the next mission is a different object/domain. These labels do not create
Card numbers or license application implementation.

**CONTINUOUS BUILD restart contract — separate and unchanged in purpose.** If a new chat is told
*“Sales Order — continue next Card”* or to run continuous Card-build mode, it reads this
Constitution → ERP Architecture → Orders MASTER → its built/verified table and next Card → UI
MASTER's Production UI Execution Law → referenced module/UI sections → relevant approved surfaces
→ current implementation. A single-Card instruction ships only that Card. Continuous mode repeats
the complete production vertical slice Card by Card without waiting for layout approval, unless
the task was explicitly placed behind a PLAN MODE / Layout Approved gate.

```
0  Say which kind of chat you are.  PLAN writes no code.  BUILD ships one thing.
1  Read this file + the module MASTER.  Nothing else first.
2  Measure.  Every proposal runs the DECISION GATE below — no exception.
3  Challenge (Law 4).  Problems get 🔴/🟡 and a fix, never a complaint alone.
4  Ask ONE decision at a time — one evidence-based Carres recommendation, with its trade-off and
   falsifier. Alternatives appear only when the evidence leaves a genuine business choice.
5  Approved → build → test → PR → merge → deploy → verify production.  Do not come back.
6  Overwrite the MASTER in the same PR.
```

**PLAN DECISION PERSISTENCE LAW. A DECISION THAT STAYS IN THE CHAT IS A DECISION THAT DIES.**
The moment the owner explicitly agrees to a complete business, UI or layout decision in PLAN /
DESIGN mode, overwrite its authoritative MASTER with the current **APPROVED / LOCKED** truth.
Do not leave the ruling only in chat or move through further major design decisions before it is
recorded. Adjacent coherent rulings may share one sensible Git commit; one `yes` does not require
one commit. PLAN MODE still forbids application implementation until its explicit gate, but it
requires these governance updates. A fresh chat must be able to read the MASTER, see what is
locked, and identify the next genuinely unresolved decision. **So every line written wears its
own label:**

```
FACT      measured, cited      →  the research file.  Binds nobody.
RULING    the OWNER's word     →  the MASTER.  Binds until the owner changes it.
PROPOSAL  YOURS                →  the MASTER, marked NOT LAW, carrying its own
                                  falsifier.  Must be CHALLENGED, never obeyed.
```

**PROVE THE CAPABILITY BEFORE DESIGNING THE ENGINE.** *"Can X move onto Y?"* is answered by
mapping what each side already does — one table, no solutions — and the answer is READY or NOT
READY. Only NOT READY licenses an engine card, and only for the capabilities the mapping named.
**Redesigning a thing that already supports the case is the most expensive way to be wrong.**

**AND THE MAPPING HAS THREE OUTCOMES, NEVER TWO** (Loo, 2026-08-07). *Another repo has it* is
**not** *we have it* — the question is what moves TODAY, and copying and inventing are not the
same work:

```
🟢 READY          ours supports it today — migrate, change nothing
🟡 COPY REQUIRED  ours does not; a proven implementation elsewhere does.
                  STILL NOT READY TODAY, but it needs no invention.
🔴 ENGINE GAP     nobody has solved it. Design · research · validate · build.
```

**A NOT READY verdict must keep 🟡 and 🔴 apart.** Merged, they cost the same on paper and an
order of magnitude apart in reality, and the next card cannot be prioritised.

**TWO CHATS PER MODULE IS THE CEILING.** Past that point, coordination cost grows faster than
delivery. A chat that has claimed a lane still occupies a lane, even if no code has been written.

**Only ONE thing may interrupt the owner: a business rule.** Technical problems, bugs, wording
conflicts, deploys, rebases, test failures — **solve them yourself. Finding another bug is not
a reason to stop; it is an instruction to fix it and continue.**

**THE TEST, applied before you type a question to the owner:**

```
Can this be answered by reading the code, the docs, the database, or by measuring?
    YES →  IT IS YOURS. Decide it. Say which way you went. Continue.
    NO  →  is it about how the BUSINESS runs?
               YES →  ask. ONE question, recommendation first.
               NO  →  it is still yours.
```

**These are NEVER his** — decide and move: *may this card edit this file* · *is this page still
frozen* · *which of two implementations* · *rebase, merge or deploy* · *a test fails, continue?*
· *which column, route or file name* · *is this refactor in scope* · *should I fix what I just
found*. **The failure has a name: dressing an engineering decision as a business decision.**
*"Option A or B?"* about a file, a freeze, a scope or a merge is *"please do my job"*, and it is
worse than silence because it looks like diligence.

**A card is handed over TAB FIRST** — `【TAB】 — 【id】 · 【one line】`, and the paste block says
which tab it owns and which it may not touch. The queue letters are the build line, not the
screen, and they do not match: `R9` · `R11` · `R12` are all **Claims** and touch no Receiving
file, while Receiving is the closed page.

**Engineer-Owned Delivery.** After approval, engineering owns delivery until production is
verified: implementation · testing · self-review · fixing what it finds · merge · deploy ·
production verification. **Never return routine engineering as an approval request.**
The four reasons to interrupt: a new business rule · an approved UI/workflow/word must change ·
production data must be modified irreversibly · long-term architecture must change.

⛔ DECISION GATE — before PROPOSING or freezing any architecture, workflow, business
   rule, information model or shared behaviour:
   ① Name the decision in one line.
   ② List the primary evidence it needs, and what is EXCLUDED and why. Study only that.
      If something excluded turns out to matter, STOP and re-list before continuing.
   ③ Label every statement FACT · INFERENCE · RECOMMENDATION · UNKNOWN. Every FACT
      points to primary evidence — file:line, SQL, schema, measurement, observation.
   ④ Every recommendation states what would OVERTURN it; the falsifier must name a
      file, a measurement, a schema or an observable event.
   Do not freeze a decision that still depends on an UNKNOWN. External systems are
   EVIDENCE, never specification. Freeze concepts; implementation choices are decided
   by building, not by reading.

---

## 5 · Red lines — never, in any circumstance

1. **Never DROP / TRUNCATE / DELETE** without the owner's explicit confirmation **in the current
   conversation**. *"She said OK before"* is not permission.
2. **Never modify RLS** without explaining what changes and why.
3. **Never write a secret in code.** `SUPABASE_SERVICE_ROLE_KEY` lives only in Cloudflare
   Workers secrets — never in source, never in `apps/web`, never in a log or a response.
4. **Never `git push --force`, `git reset --hard`, or `rm -rf`** on tracked work.
5. **Never delete files that were not requested.**
6. **Never alter a committed migration.** Write a new one.
7. **Never number a migration from `ls`** — take the MAX of the tracker tail, the repository
   tail and every branch. **An applied migration missing from the repository is a P0.**
8. **A migration may never assert a production ROW COUNT.** Schema is what it owns; data is
   what it walks past.

---

## 6 · Every row in the database today is TEST data

The AutoCount and Master Sheet imports are a trial. **At go-live the database starts CLEAN and
nothing old is carried over.** Therefore: live counts are evidence about whether CODE WORKS,
never about business volume · **never propose a backfill, a repair worklist or a cleanup card
for imported rows** · no feature may depend on old data existing. What must survive is
CONFIGURATION — suppliers, SKUs, production days, rates — not transactions.

---

## 7 · Business model — locked 2026-05-03

- The dealer sells; **the customer pays HQ directly.** There is no HQ→dealer credit or debt.
- `Outstanding` means what the CUSTOMER owes HQ.
- Operation and Supplier are HQ-INTERNAL roles, never dealer-side.

---

## 8 · Module map

> [`docs/ERP-ARCHITECTURE.md`](docs/ERP-ARCHITECTURE.md) is supporting architecture evidence.
> It is not a fourth authority and does not replace the current module MASTERs.
>
> **Implementations provide evidence; they do not define architecture.** Nine engineering-debt
> items were found by studying Orders V1 end to end and measuring production, and **every one of
> them was the same defect — an unowned record**, not a missing feature.
>
> The architecture answers four questions and only four: **what each module OWNS · what ACTIONS
> belong to it · what it only SUMMARISES · what it LINKS to instead of owning.** Its four
> ownership laws bind every module:
>
> ```
> A · One record, one owner
> B · A summary is READ-ONLY, forever — it may never gain a form
> C · A door, never a duplicate — two forms for one act make two records
> D · A derived fact has ONE arithmetic — not two that currently agree
> ```
>
> When it and a current module MASTER disagree, stop and reconcile the affected current
> MASTERs in the same approved change. Do not silently let a supporting reference override them.

## 8.1 · Modules

| Module | What it owns | MASTER |
|---|---|---|
| **Orders** | the customer's order end to end — the list, the drawer, the action engine, delay planning, the money gate | [`docs/orders/MASTER.md`](docs/orders/MASTER.md) |
| **Purchasing** | buy what customers ordered and what the shelf needs | [`docs/purchasing/MASTER.md`](docs/purchasing/MASTER.md) |
| **Delivery** | the delivery WORKSPACE — a view of Orders' delivery track | [`docs/delivery/MASTER.md`](docs/delivery/MASTER.md) |
| **Stock** | on hand · in & out · ready stock · the reorder engine | [`docs/stock/MASTER.md`](docs/stock/MASTER.md) |
| **Payment** | the collections desk | [`docs/payment/MASTER.md`](docs/payment/MASTER.md) |
| **Service** | customer complaints after delivery | [`docs/service/MASTER.md`](docs/service/MASTER.md) |
| **UI** | the design system, the kit, the portal shell and its right rail | [`docs/ui/MASTER.md`](docs/ui/MASTER.md) |
| **HR** | people, commission, targets, cost | [`docs/hr/MASTER.md`](docs/hr/MASTER.md) |
| **Rental** | rent-to-own agreements, billing and buyout | [`docs/rental/MASTER.md`](docs/rental/MASTER.md) |

**A module gets a folder only when it is a real operator surface with measured reality.**
Never create an empty master for symmetry.
**Architectural reasoning belongs in ADRs, not in the Constitution.**

## 9 · Supporting references — open only for implementation detail

| File | Supports |
|---|---|
| [`docs/COPY-STANDARD.md`](docs/COPY-STANDARD.md) | every visible word — the dictionary, the seven verbs, the banned words |
| [`docs/ACTION-FLOW-STANDARD.md`](docs/ACTION-FLOW-STANDARD.md) | how actions are computed, appear, close, and which shows first |
| [`docs/01-design-tokens.md`](docs/01-design-tokens.md) · [`02-components.md`](docs/02-components.md) · [`03-page-patterns.md`](docs/03-page-patterns.md) | the design system — token values and components |
| [`docs/ENGINEERING.md`](docs/ENGINEERING.md) | the stack, the repo, RLS performance, deployment, testing, current production state |

**These files are not independent authority.** If one conflicts with the current module or UI
MASTER, the MASTER must be corrected or the supporting reference updated in the same change.
Open one only when you need a specific implementation detail. Do not read them to start work.

---

## 10 · How to talk to the owner

**Jess** — the boss, and no coding background.
- **Conclusion first**, reasoning after. **Simple Chinese, short sentences.** English technical
  terms are kept (`Supabase`, `RLS`, `migration`, `PO`, `SKU`).
- **Steps 1 2 3.** If she says she does not understand, **rewrite — do not repeat.**
- **ASCII sketch before code**, every time, even when she says "just do it".
- **One question at a time.** Wait for the answer before asking the next.
- **Options with a named recommendation, never a bare menu**, and never the same question twice.
- **Cite how mature products solve it**, then land the conclusion in Carres reality.
- **⭐ EVERY REVIEW IS TOP-TO-TOE, CRITICAL, AND CARRIES ITS FIX — ALWAYS, WITHOUT BEING ASKED**
  (Loo, 2026-08-08). A screenshot, a page, a plan, a card, another chat's report, your OWN
  work: go top to bottom, mark every problem 🔴 / 🟡, and **no problem is written without its
  concrete fix.** *"Looks good"* is not a review. **Agreeing with everything is the tell that
  nothing was read** — Law 4 already requires the challenge; this rule says it is not optional
  and it is not on request.
- **She agrees, then you build.** A settled decision is not reopened unless she reopens it.
- **Count before you propose UI.** Measure fill rates with SQL; empty fields do not reach the
  screen.
- Anything she must paste elsewhere is written in **English**.

**Never** hand back a menu of engineering choices; never ask five things at once; never
criticise without a fix; **never say "I read the document" without a `Read` call in the
transcript.**

---

## 11 · Where current state lives

**This execution law holds no project state.** A module's current status and business truth
live in that module's MASTER. Production facts in [`ENGINEERING.md`](docs/ENGINEERING.md) and
open risks in [`carry-forwards.md`](docs/carry-forwards.md) are evidence only; re-measure before
quoting them.

---

## 12 · Plugin discipline

Do **not** auto-invoke `superpowers` or other third-party plugin skills. This Constitution
overrides any plugin hook that demands one. Plain tools first; a skill only when it clearly
adds value, and say why before invoking it.

**For design work, do NOT invoke `design-consultation`** — the token values are already
decided. Read `01-design-tokens.md` · `02-components.md` · `03-page-patterns.md`.
