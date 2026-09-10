# CARRES PORTAL — PROJECT CONSTITUTION

> **This file is not a development guide. It is the constitution.** It holds only what EVERY
> chat must know. It is loaded automatically into every session, so it is the one thing nobody
> can skip — and that is why it stays short. **200–300 lines. If it grows past that, something
> in it is not constitutional and belongs in a module MASTER.**
>
> **BUILD starts with this file and ONE module MASTER.** ERP/module Plan/Design instead follows
> the §4 **ERP PLAN CHAT START PROTOCOL** authority chain before proposing or asking.

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
`CLAUDE.md` + `docs/<module>/MASTER.md`. BUILD starts with those two files; Plan/Design reads the
governing chain required by the §4 start protocol. This does not license indiscriminate document
loading. Old queues and checkpoints live in `docs/archive/` — **no chat reads them as authority.**

### ERP AUTHORITY MAP — canonical handoff, 2026-08-14

This table is the cold-start directory, not a second copy of module law. `APPROVED` or `LOCKED`
does not claim the target is built. `BUILD` means approved law plus committed implementation that
still requires delivery/production proof. A proposal never becomes authority through this table.

| Module / responsibility | Canonical current authority | State | Resume execution at |
|---|---|---|---|
| Catalog | No module MASTER yet; boundary in `docs/ERP-ARCHITECTURE.md` | **PROPOSAL / authority gap** | PLAN a complete Catalog Blueprint; do not infer rules from other modules |
| Sales Orders / Customer Order | `docs/orders/MASTER.md` | **PRODUCTION-VERIFIED / LOCKED** | Approved-target gaps explicitly named in that MASTER; preserve verified register/object truth |
| Purchasing / Purchase Orders | `docs/purchasing/MASTER.md` | **APPROVED / LOCKED** | Its measured current blocks and Approved Evolution; do not revive old queues |
| Receiving | `docs/purchasing/MASTER.md` §5 | **APPROVED / LOCKED** | The same MASTER's Receiving gaps and owner boundaries |
| Supplier Claims | `docs/purchasing/MASTER.md` §6 | **APPROVED / LOCKED** | The Service-Case workstream/entry-rule gap; keep Purchasing as supplier-response owner |
| Stock / Warehouse | `docs/stock/MASTER.md` | **LOCKED** | Measured Stock implementation and explicit approved gaps in that MASTER |
| Delivery | `docs/delivery/MASTER.md` | **APPROVED / LOCKED** | The approved top-to-toe target; current implementation may lag |
| Payment / Money In | `docs/payment/MASTER.md` | **APPROVED / LOCKED** | Its approved-target/not-built convergence work; Payment remains customer money only |
| Service Cases | `docs/service/MASTER.md` | **APPROVED / LOCKED** | Implement the approved 2026-08-14 Case/playbook rulings; no new business interview |
| Guarantee / Service Package | `docs/guarantee/MASTER.md` | **APPROVED / LOCKED** | Preserve shipped entitlement baseline; implement the dated policy/playbook rulings |
| Rental / Subscription | `docs/rental/MASTER.md` | **APPROVED / LOCKED** | Frozen agreement truth plus approved subscription service/visit target |
| People / HR | `docs/hr/MASTER.md` | **LOCKED** | Measured current implementation and explicit gaps in that MASTER |
| Issue Tracker | `docs/issue-tracker/MASTER.md` | **BUILD — business law APPROVED / LOCKED** | Verify/deliver the committed Issue Tracker implementation; do not re-plan the operating model |
| Workspace — Staff & Duties + Work + Dashboard | `docs/workspace/MASTER.md` | **APPROVED / LOCKED architecture; staged delivery** | Staff & Duties and Shared Duty Resolver first; module projections during module delivery; Dashboard last |
| Shared ERP UI | `docs/ui/MASTER.md` | **PRODUCTION-VERIFIED / LOCKED** | Apply the governed templates/tokens and the latest locked owner/action presentation law |

`docs/issue-tracker/MASTER.md` is the one current Issue Tracker path. The former
`docs/issues/MASTER.md` survives only in Git history and is not a second authority.

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
0  Declare the lane from the starter + authority: PLAN · BUILD/DELIVERY · REVIEW.
   PLAN writes governing truth only; BUILD ships; REVIEW inspects and reports unless asked to fix.
1  BUILD: read this file + the module MASTER.  PLAN/DESIGN: complete the start protocol below.
2  Measure.  Every proposal runs the DECISION GATE below — no exception.
3  Challenge (Law 4).  Problems get 🔴/🟡 and a fix, never a complaint alone.
4  Ask ONE decision at a time — one evidence-based Carres recommendation, with its trade-off and
   falsifier. Alternatives appear only when evidence leaves a genuine business choice.
5  Approved PLAN truth hands off to BUILD/DELIVERY → build → test → PR → merge → deploy →
   verify production → MASTER closure.  Do not return routine engineering choices to Jess.
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

#### ERP PLAN CHAT START PROTOCOL — APPROVED / LOCKED, owner rulings 2026-08-13 / 2026-08-14

Every new or restarted ERP/module Plan/Design chat completes this sequence **before proposing a
local design, Phase 1, Card or owner question**. **OWNER IS EXCEPTION, NOT INPUT SOURCE:** Jess
provides business direction, reviews the complete recommendation and may override it. The planner
owns ordinary ERP research, completeness, synthesis, product/UX recommendation, reference-system
study, cross-module reasoning and forward planning. Do not interview Jess to fill normal ERP
pattern, UI, workflow-completeness or implementation-detail gaps. If authority, research or ordinary
architecture/design judgment can resolve something, recommend the answer; owner questions remain
exception-only and must pass Step 5.

**CHAT ROLE DECLARATION / MODE INHERITANCE.** At entry, infer and state the lane from the user's
starter, explicit mission and current authoritative checkpoint: **PLAN · BUILD/DELIVERY · REVIEW**.
`— PLAN` is a hard no-application-code and no-Card-authoring/execution boundary. Implementation
requires a later BUILD/DELIVERY takeover prompt; planning approval alone does not silently change
the current chat's lane. A REVIEW chat reports unless Jess explicitly asks it to fix. If wording is
ambiguous, use the explicit mission and authoritative checkpoint; do not ask Jess about ordinary
engineering mechanics. Clarify only when acting would risk crossing a business or safety boundary.

1. **AUTHORITY READ.** Read in order: this Constitution → `docs/ERP-ARCHITECTURE.md` → target
   module MASTER → relevant upstream/downstream MASTERs. When UI is involved, also read the UI
   MASTER plus governed dictionary/copy, navigation/IA and token authority. Read the current human
   ERP Blueprint where applicable. Read current implementation as measured evidence only; missing
   or different code never overrules an approved target.
2. **RESOLUTION PASS.** Explicitly classify the domain facts as:
   - **`RESOLVED FROM AUTHORITY`** — approved/locked repo or Blueprint truth; never re-ask or
     re-approve it.
   - **`APPROVED TARGET / NOT BUILT`** — the approved operating model awaits implementation; code
     absence does not make it unresolved.
   - **`BUILT / VERIFIED`** — measured current implementation evidence.
   - **`REAL GAP / CONTRADICTION`** — the authority chain genuinely has no answer, or two current
     authoritative sources conflict.
   A missing implementation is not an owner decision. A planner preference is not an owner
   decision. Example: if Blueprint/Money authority already permits planning/booking in parallel and
   makes T−2 with RM0 the hard Delivery release gate, Delivery records it as **`RESOLVED FROM
   AUTHORITY`**; it may not ask Jess whether an outstanding balance should block release.
3. **WHOLE-DOMAIN AUDIT FIRST — AUDIT IS INPUT, NOT FINAL PLAN.** Complete the target domain
   capability and lifecycle pass, including
   cross-module consequences, dependencies, gaps and relevant mature/reference capability research,
   before asking small/local questions or proposing Phase 1/Card/UI. Do not postpone understanding
   part of the domain by calling it a later phase. Whole-domain planning does not require whole-domain
   building: once the architecture is understood, implementation may be sliced by dependency.
   Completeness and proactive research are the planner's responsibility; Jess does not supply the
   reference systems, capability checklist or next question. The four-way audit is research evidence;
   it is **not** permission to create tasks, Phase 1, `READY FOR CARD`, migrations or build sequencing.
4. **BLUEPRINT BEFORE CARDS — WHOLE SOLUTION FIRST; CARD AUTHORING IS A LATER BUILD LANE.** After
   the audit, proactively mine relevant
   current/known references top-to-toe (especially 2990 where applicable, plus suitable mature ERP,
   WMS or logistics systems) and synthesize one complete, owner-reviewable **`RECOMMENDED CARRES
   <MODULE> BLUEPRINT`**. For each major capability show the useful chain:
   `CURRENT CARRES → 2990 / MATURE ERP LESSON → KEEP / ADAPT / IMPROVE / REJECT → RECOMMENDED
   CARRES BUSINESS FLOW → OPERATOR JOURNEY → UI/PAGE/OBJECT PLACEMENT → CROSS-MODULE CONNECTION`.
   Do not wait for Jess to name functions. Do not blindly copy terminology, IA, statuses, colours or
   business rules; Carres authority wins. If a reference is inaccessible, state that limitation and
   use the available authoritative/reference evidence—never pretend it was inspected.

   The Blueprint is the primary Plan deliverable for owner + IT: human-readable product architecture
   explaining what Carres will do, why, how staff use it, what UI surfaces exist, how exceptions work
   and how it connects to the ERP—not mainly gaps or engineering tasks. Present the complete
   end-to-end recommendation and rationale for review instead of turning review into serial A/B
   interviews. Silence is not approval. The Blueprint covers, where applicable: purpose, ownership
   and boundaries · complete normal lifecycle · exception journeys · daily morning-to-close operator
   journey · navigation/IA/page destinations · Registers/workspaces/calendar/boards · object detail
   and document lineage · actions/permissions · Work Engine actions/deep-links · Quick Rail/Calendar
   integration · Settings/Maintenance placement · reports/export · external supplier/carrier/partner
   boundaries and cutover separation · cross-module consequences · intentional rejects/non-goals.
   Apply the approved **Shell Template + Register Template + Object Detail Template** and UI
   governance where applicable; reuse the grammar, not identical content, and allow a justified
   calendar/dispatch or other operational workspace instead of forcing every module into a Register.
5. **OWNER DECISION GATE.** Ask Jess only after the whole-domain audit and Blueprint synthesis, and
   only when the question
   displays all applicable evidence below:
   ```
   AUTHORITY SEARCHED             exact authoritative documents and sections checked
   WHY NOT ALREADY RESOLVED       the genuine absence or conflict
   TWO OR MORE REAL OPERATING OPTIONS   when alternatives exist; never cosmetic implementation choices
   RECOMMENDATION                 evidence-based Carres recommendation
   OPERATIONAL CONSEQUENCE        change to operation, ownership, customer, supplier, logistics or finance
   ```
   If the gate cannot be filled, **do not ask Jess**. Resolve it from authority or ordinary
   engineering/design judgment. An owner decision is a real unresolved choice that changes how
   Carres operates, not a request to reconfirm truth.

**PLAN AUTHORITY BOUNDARY.** An internal clean start means establishing clean ERP target truth; it
does **not** authorize external cutover. Plan/Design may not contact, email or message external
parties; invite suppliers/carriers; create production partner accounts; deploy; disable current
external channels; cut over Google Sheet/portal/manual integrations; or change live operations.
Each external integration/cutover or live action requires separate, explicit owner authorization
for that action.

**OWNER-APPROVED OBJECT / DOMAIN ARCHITECTURE COMPLETENESS LAW (Jess, 2026-08-12 / 2026-08-14).** A mission
concerning a business object/domain — Sales Order, Purchase Order, Receiving, Claim, Payment,
Delivery, Warehouse Unit or equivalent — is not a local page/question. Jess owns genuine business
decisions and final approval. The Plan chat owns the mission boundary, research completeness,
dependency discovery, cross-module consequences, gap detection, sequencing and the proposed plan.
Proactively surface material issues Jess did not ask about and complete the relevant object/domain
pass before calling anything the next unresolved decision or the mission complete.

- For the **`REAL GAP / CONTRADICTION`** portion of an object/domain mission, map its complete relevant
  lifecycle: creation/source · identity/numbering · Register/view/detail · edit · revision/
  amendment/versioning · approval/permissions · documents/PDF and historical documents · copy/
  duplicate · cancel/void · Settings/Maintenance/master data · scan/import · search/filter/columns ·
  selection/bulk/context actions · history/audit · exceptions · upstream source · concurrency/
  rollback · lifecycle completion · reporting/export · downstream consequences · anything else
  revealed by Carres/reference evidence. This is a completeness checklist, not an order to build
  every capability. Only after this pass may the chat narrow to the genuinely next decision.
- Reference research is **object-level function mining, not screenshot-level research**. Inspect
  the relevant backend/workflow/capability surface, not only visual layout or the feature Jess named.
  Use the relevant governed references — including Linear, Shopify, AutoCount, 2990, current
  Carres UI and appropriate mature/international ERP patterns when useful — and exclude unrelated
  objects/history. For Sales Orders, systematically mine 2990 plus relevant AutoCount and mature
  international ERP patterns before Jess has to name Amendment, Settings, Copy, PO consequence or
  another missing function one by one. Carres semantics/ownership come first; references provide
  proven reusable ideas, never foreign business truth.
- Produce a **REFERENCE-TO-CARRES CAPABILITY MATRIX** for the complete relevant surface:
  `REFERENCE CAPABILITY | CARRES CURRENT EQUIVALENT/OWNER | KEEP/ADAPT/RELOCATE/BUILD/REJECT |
  WHY | DEPENDENCY/CONFLICT`. “Copy” means reuse a proven principle/function/interaction where it
  fits; Carres locked truth, architecture, dictionary, navigation/module ownership, capability and
  tokens win. Reference discovery never makes the reference a design authority.
- Derive the common patterns and real trade-offs, then give **one evidence-based Carres
  recommendation**, not arbitrary A/B/C options. Carres semantics, ownership and destination come
  first. Linear, Shopify, AutoCount, 2990 and other mature ERP products contribute principles and
  interactions only; translate them into Carres architecture and never blindly copy their
  terminology, IA, colours, tokens, fields or placement. Current or legacy screenshots are
  implementation evidence, never authority over frozen target truth or proof that an unresolved
  presentation must remain unchanged. Where useful, state **KEEP · IMPROVE · RELOCATE · RETIRE ·
  BUILD**, explain why, and name the cross-module consequence.
- After presenting the complete Blueprint, obtain owner review/approval; correction replaces the
  proposal and silence never counts as approval. When the owner approves the complete operating
  model, immediately overwrite the appropriate authoritative
  MASTER with the current **APPROVED / LOCKED** truth before moving to another major decision.
  PLAN mode forbids application implementation, not governing-document updates. A proposal or draft
  remains explicitly **PROPOSAL / NOT LAW** and is never written as approved truth.
- **PLAN COMPLETION GATE.** Before recommending implementation or declaring the surface complete,
  show coverage of: current Carres capabilities · locked governance · UI dictionary/IA/module
  ownership · relevant reference-product function mining · mature/international benchmark where
  materially useful · missing-capability/gap analysis · cross-module/future consequences ·
  dependencies · complete recommended Blueprint and operator/UI journey. Then ask Jess only for
  genuine owner decisions. A fresh or
  restarted Plan/Design chat performs this automatically; Jess never has to spoon-feed these checks.
- **ERP CONSEQUENCE GATE.** Apply the analogous cross-module check to every object decision. A Sales
  Order Amendment, for example, must trace existing PO/supplier commitment · Receiving · reserved
  or physical Unit/Stock · Delivery/DO commitment · Payment/deposit/refund/commercial truth ·
  current and historical customer-facing PDF · Work · permissions · audit/history · Finance ·
  Claims · Issue Tracker and every other affected owner. Consequences do not transfer write
  ownership. Before asking Jess a local question, concisely state current mission · object coverage
  completed · important gaps · cross-module consequences · reference evidence · why this is
  genuinely the next owner decision. Synthesise; do not dump repetitive research.

### MISSION / CARD / CHAT BOUNDARY LAW — APPROVED / LOCKED, owner ruling 2026-08-12

**PLAN CHAT OWNS THE MISSION BOUNDARY.** Throughout Plan/Design work the planner continuously
maintains and can state: **CURRENT MISSION · RESOLVED FROM AUTHORITY · APPROVED TARGET / NOT BUILT ·
BUILT / VERIFIED · REAL GAP / CONTRADICTION · RECOMMENDED NEXT STEP.** Jess must not have to ask
when planning is complete, when a coherent build scope is ready, what follows it, or whether a fresh
chat is advisable.

- **PLAN CHAT TERMINAL BOUNDARY.** The Plan lifecycle is exactly: **Authority → whole-domain audit →
  proactive reference mining → `RECOMMENDED CARRES <MODULE> BLUEPRINT` → owner review/correction →
  authoritative MASTER persistence → `PLAN MISSION COMPLETE`**. That terminal state does not turn
  PLAN into BUILD. PLAN must not author a detailed implementation Card, create a `*Card.md` or
  `*card.md` file,
  start implementation, select a coding strategy, spawn build tasks or ask how engineering should
  execute. Implementation implications stay at business architecture, acceptance boundary and
  dependency level—not writer inventories, migrations, exact test files, TDD steps, task breakdown,
  CI/deploy probes or other engineering execution instructions. Jess may explicitly commission Card
  authoring in that chat; absent that explicit instruction, the lane ends here.
- **`READY FOR CARD — <scope>`.** Never state or invent this, Phase 1, task/roadmap or implementation
  sequencing before the complete recommended module Blueprint has been presented, owner-reviewed/
  approved and persisted as final truth in the authoritative module MASTER. Only after
  **`PLAN MISSION COMPLETE`** may dependency-ordered, unnumbered scopes be derived. Then state a
  scope proactively only when a coherent capability or build slice
  has sufficient approved business truth, UI/interaction truth where relevant, ownership,
  dependencies and an acceptance boundary, with no unresolved owner decision blocking safe build.
  Recommend its dependency/build order and acceptance/business boundary. The scope remains an
  unnumbered handoff boundary, not a Card file or engineering plan; never invent an official Card
  number or status merely because it is ready. Detailed Card authoring belongs to the later
  **BUILD/DELIVERY lane after takeover**. Do not continue solving application implementation detail
  in Plan mode; do not send unresolved business/UI truth to build merely to keep moving.
- **`PLAN MISSION COMPLETE`.** State this proactively when the whole domain is understood, the
  complete Blueprint has been owner-reviewed/approved and final truth is persisted to the owning
  MASTER. Summarise the **LOCKED operating model · intentional rejects/deferred items · exact
  recommended next lane/action.** READY scopes and dependency order may be identified only after
  this state; the BUILD/DELIVERY lane authors any detailed Cards and chooses implementation mechanics.
  Build may be phased, but architecture planning understands the whole domain first. Never wait for
  Jess to ask *“what next?”*
- **`START A NEW CHAT`.** Recommend this only when the current mission is complete and the next work
  is a materially different planning domain, or accumulated unrelated context creates a real
  confusion risk. Conversation length alone is not a reason while one coherent mission remains
  active and its decisions are safely persisted in the repository. Give the exact concise restart
  prompt and state whether the next chat is **PLAN / DESIGN** or **CONTINUOUS BUILD**, with the
  reason. The standard Plan restart contract is:
  **`<Module> Module Completion — PLAN. Follow ERP PLAN CHAT START PROTOCOL; produce authority
  resolution + whole-domain audit, then the complete Recommended Carres <Module> Blueprint for
  owner review. Persist approved truth, identify READY scopes, then stop before Card authoring.`**
  The repository carries the protocol;
  do not recreate it in a giant handoff prompt.

  The standard Build takeover contract is:
  **`<Module> — CONTINUOUS BUILD. Read current authoritative MASTER and READY scopes; execute each
  approved scope as a full production vertical slice autonomously. Do not ask owner for engineering
  execution choices.`**

Approved decisions are persisted immediately under the law below; chat length is never the memory
mechanism. A fresh Plan/Design chat automatically owns these boundaries. **CONTINUOUS BUILD remains
separate:** after an approved READY scope is handed over under a BUILD takeover, it follows the
existing production vertical-slice law. PLAN mode blocks application implementation, not required
governing-document updates. **Prohibited example:** a PLAN chat creates `Customer Payment Posting Convergence
Card.md` and asks “1 Subagent-driven or 2 Inline execution?” Correct behavior: close the approved
Blueprint into the MASTER, identify the dependency-ordered `READY FOR CARD` scope, declare
`PLAN MISSION COMPLETE`, and stop. A later BUILD/DELIVERY chat chooses its own compliant method.

### PLAN DECISION PERSISTENCE LAW — APPROVED / LOCKED

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

**A card is handed over MODULE FIRST** — `【MODULE】 — CARD 【sequence】 · 【clear capability name】`.
The card file repeats the module and sequence in its metadata and H1; a date or opaque ID never
replaces the human build order. The paste block says which module/surface it owns and which it may
not touch. Queue letters remain technical build lines, not screen or module names.

**Engineer-Owned Delivery.** After approval, engineering owns delivery until production is
verified: implementation · testing · self-review · fixing what it finds · merge · deploy ·
production verification. **Never return routine engineering as an approval request.**
**Code owns tests; `main` owns deployment.** GitHub CI must pass before merge; a merge to `main`
deploys both Pages projects and the production Worker, then proves every canonical
surface reports that exact SHA. Never ask Jess to run routine fetch, push, build, Wrangler or
deployment commands. Manual intervention is limited to first-time credential setup, the governed
approval/apply path for production migrations, and rollback or emergency response.
The four reasons to interrupt: a new business rule · an approved UI/workflow/word must change ·
production data must be modified irreversibly · long-term architecture must change.

**BUILD/DELIVERY DEFAULT AUTONOMY.** A BUILD takeover of an approved `READY FOR CARD` scope owns the
full vertical slice: inspect current `origin/main` and authority → implement → run targeted tests
during development → pass the authoritative release gate → push/PR/merge → deploy → authenticated
production verification → close the owning MASTER. If the mission says continuous build, continue
to the next approved READY scope without asking *“what next?”* or saying *“waiting for your next
instruction.”* Never ask Jess to choose subagent-driven vs inline execution, technical-layer order,
test batching, branch/worktree strategy, migration numbering, PR sequence, CI strategy, deployment
mechanism or similar engineering mechanics. The implementing agent chooses the safest and most efficient
repo-compliant method. Ask for owner action only when a credential or governed production approval
literally requires her; never ask her to push, fetch, run a terminal command or deploy.

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

> **GLOBAL DUTY LAW — OWNER-APPROVED 2026-09-03.** Every ERP action and approval resolves its
> owner through the shared Staff & Duties system: duty rule → primary holder → today's buddy cover
> → actual actor evidence. A module may name the duty it needs; it may never hard-code a person's
> name, keep a second assignment list, or turn owner identity into action-sentence text.

## 8.1 · Modules

| Module | What it owns | MASTER |
|---|---|---|
| **Orders** | the customer's order end to end — the list, the drawer, the action engine, delay planning, the money gate | [`docs/orders/MASTER.md`](docs/orders/MASTER.md) |
| **Purchasing** | buy what customers ordered and what the shelf needs | [`docs/purchasing/MASTER.md`](docs/purchasing/MASTER.md) |
| **Delivery** | the delivery WORKSPACE — it owns the arrangement, the Delivery Order document, handover and proof; Sales owns the promise | [`docs/delivery/MASTER.md`](docs/delivery/MASTER.md) |
| **Stock** | exact Unit · Where · Who has it · availability · physical history and month-end truth | [`docs/stock/MASTER.md`](docs/stock/MASTER.md) |
| **Payment** | the collections desk | [`docs/payment/MASTER.md`](docs/payment/MASTER.md) |
| **Service** | customer complaints after delivery | [`docs/service/MASTER.md`](docs/service/MASTER.md) |
| **UI** | the design system, the kit, the portal shell and its right rail | [`docs/ui/MASTER.md`](docs/ui/MASTER.md) |
| **HR** | people, commission, targets, cost | [`docs/hr/MASTER.md`](docs/hr/MASTER.md) |
| **Rental** | rent-to-own agreements, billing and buyout | [`docs/rental/MASTER.md`](docs/rental/MASTER.md) |
| **Workspace** | Staff & Duties, duty holders, cover and shared approval routing | [`docs/workspace/MASTER.md`](docs/workspace/MASTER.md) |

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
