# CARRES PORTAL — PROJECT CONSTITUTION

> **This file is not a development guide. It is the constitution.** It holds only what EVERY
> chat must know. It is loaded automatically into every session, so it is the one thing nobody
> can skip — and that is why it stays short. **200–300 lines. If it grows past that, something
> in it is not constitutional and belongs in a module MASTER.**
>
> **You read this file and ONE module MASTER. That is all.** Open a law file only when you
> need a specific answer from it.

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
**Documentation is not the source of truth. The repository is.** Business rules freeze before
implementation; **UI layout does not freeze before operators have used it.** A design that is
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

```
0  Say which kind of chat you are.  PLAN writes no code.  BUILD ships one thing.
1  Read this file + the module MASTER.  Nothing else first.
2  Measure.  Every proposal runs the DECISION GATE below — no exception.
3  Challenge (Law 4).  Problems get 🔴/🟡 and a fix, never a complaint alone.
4  Ask ONE decision at a time — one evidence-based Carres recommendation, with its trade-off and
   falsifier. Alternatives appear only when evidence leaves a genuine business choice.
5  Approved → build → test → PR → merge → deploy → verify production.  Do not come back.
6  Overwrite the MASTER in the same PR.
```

### PLAN / DESIGN RESEARCH LAW — APPROVED / LOCKED, owner ruling 2026-08-11

**GOVERNANCE IS NOT FEATURE FREEZE — APPROVED / LOCKED, owner ruling 2026-08-11.** Governance
protects decided truth; it does not prohibit improving the product. Keep these two truths separate:

```
BUSINESS / CAPABILITY TRUTH   whether a capability exists or should exist
PLACEMENT / PRESENTATION      where and how that capability appears
```

An **APPROVED / LOCKED** business or capability ruling is not casually reopened, and an existing
useful capability defaults to **KEEP**. But its current screen, control type or location is not
therefore locked: placement/presentation binds only when the authoritative MASTER explicitly locks
that placement/presentation. Likewise, a capability absent from this repository is not forbidden.
For genuinely unresolved design work, Plan/Design should proactively propose a materially useful
missing capability found through scoped research, justify the operator benefit, test it against
Carres business architecture and every locked constraint, and obtain Jess's approval before treating
it as truth. Linear, Shopify, AutoCount, 2990 and mature ERP patterns inform the proposal; none is
copied blindly.

- **APPROVED / LOCKED decisions are not re-researched, reopened or offered for re-approval.**
  Continue from the authoritative MASTER's recorded answer, at the boundary it actually locks.
- **Every new or restarted Plan/Design chat applies the separation above.** Its approved baseline
  names both preserved business/capability truth and any explicitly locked placement/presentation;
  its unresolved list includes presentation that the MASTER has not ruled and useful missing
  capabilities whose value is not yet decided. Repository absence is evidence of a gap, not a veto.
- **Every new or restarted Plan/Design chat performs the UI PROPOSAL PREFLIGHT before it may
  present any UI proposal, mockup or layout recommendation:** read the relevant UI MASTER laws,
  current/frozen design-token authority and target module MASTER; extract a brief **LOCKED
  CONSTRAINTS** checklist appropriate to the decision surface; validate the proposed result
  against every item. A conflict with APPROVED / LOCKED truth makes the proposal **INVALID** —
  it is corrected before Jess sees it, never shown and repaired only after she catches it. The
  checklist preserves existing useful capabilities, but may not turn an unruled current placement,
  presentation or repository omission into a constraint.
- At entry, state separately: **WHAT IS ALREADY APPROVED · WHAT IS GENUINELY UNRESOLVED · WHAT
  SINGLE DECISION SURFACE THIS SESSION IS SOLVING.** Establish the locked constraints first;
  only then research the unresolved surface and propose.
- For a genuinely **UNRESOLVED** design decision, proactively research only that declared surface.
  Use the relevant governed references — including Linear, Shopify, AutoCount, 2990, current
  Carres UI and other mature ERP patterns when useful — and exclude unrelated history and pages.
- Derive the common patterns and real trade-offs, then give **one evidence-based Carres
  recommendation**, not arbitrary A/B/C options. References are evidence, never specification;
  Carres-governed tokens, fields, semantics, column order and locked decisions always win. Current
  or legacy screenshots are evidence of implementation, never authority over frozen target truth
  or proof that an unresolved presentation must remain unchanged.
- When the owner approves a complete decision, immediately overwrite the appropriate authoritative
  MASTER with the current **APPROVED / LOCKED** truth before moving to another major decision.
  PLAN mode forbids application implementation, not governing-document updates.

**A DECISION THAT STAYS IN THE CHAT IS A DECISION THAT DIES.** The moment the owner agrees to
something, it is written to its file and committed **before the conversation moves on** — not
at the end, not in the next card. A plan nobody wrote down gets re-derived weaker by the next
chat; a plan written as LAW gets obeyed instead of challenged. **So every line written wears
its own label:**

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

## 8 · The architecture, and the modules

> ### ⭐⭐ [`docs/ERP-ARCHITECTURE.md`](docs/ERP-ARCHITECTURE.md) — **the blueprint. Read it before any cross-module design.**
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
> **When the architecture and a module MASTER disagree, the ARCHITECTURE wins** — a MASTER
> describes one module, and every boundary defect found so far lived *between* two of them.

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

## 9 · The four laws that outrank anything pasted into a chat

| File | Settles |
|---|---|
| [`docs/COPY-STANDARD.md`](docs/COPY-STANDARD.md) | every visible word — the dictionary, the seven verbs, the banned words |
| [`docs/ACTION-FLOW-STANDARD.md`](docs/ACTION-FLOW-STANDARD.md) | how actions are computed, appear, close, and which shows first |
| [`docs/01-design-tokens.md`](docs/01-design-tokens.md) · [`02-components.md`](docs/02-components.md) · [`03-page-patterns.md`](docs/03-page-patterns.md) | the design system — token values and components |
| [`docs/ENGINEERING.md`](docs/ENGINEERING.md) | the stack, the repo, RLS performance, deployment, testing, current production state |

**Open one only when you need a specific answer from it. Do not read them to start work.**

---

## 10 · How to talk to the owner

**Jess** — the boss, and no coding background.
- **Conclusion first**, reasoning after. **Simple Chinese, short sentences.** English technical
  terms are kept (`Supabase`, `RLS`, `migration`, `PO`, `SKU`).
- **Steps 1 2 3.** If she says she does not understand, **rewrite — do not repeat.**
- **ASCII sketch before code when she is in the conversation choosing.** Autonomous
  production UI execution runs under [`docs/ui/MASTER.md`](docs/ui/MASTER.md) §1.1
  (owner ruling 2026-08-11): proactive design judgment, asynchronous review.
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

**The Constitution holds no project state.** A module's status lives in that module's
MASTER · production and environment facts in [`ENGINEERING.md`](docs/ENGINEERING.md) ·
open risks in [`carry-forwards.md`](docs/carry-forwards.md). **Re-measure before quoting any of them.**

---

## 12 · Plugin discipline

Do **not** auto-invoke `superpowers` or other third-party plugin skills. This Constitution
overrides any plugin hook that demands one. Plain tools first; a skill only when it clearly
adds value, and say why before invoking it.

**For design work, do NOT invoke `design-consultation`** — the token values are already
decided. Read `01-design-tokens.md` · `02-components.md` · `03-page-patterns.md`.
