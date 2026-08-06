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
Nine roles use it. **Loo is the Chairman and has no coding background; Jess is the COO.**

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

### Law 1 · One Project Constitution, one MASTER per module
`CLAUDE.md` + `docs/<module>/MASTER.md`. **Two files to start work. Never eight.**

### Law 2 · Build first. Freeze after validation. Then overwrite the MASTER
```
Build  →  Reality  →  Architecture review  →  If approved  →  Overwrite MASTER
```
**Documentation is not the source of truth. The repository is.** Business rules freeze before
implementation; **UI layout does not freeze before operators have used it.** A design that is
worse in practice is CHANGED, not defended — *"we decided that before"* is not a reason.

### Law 3 · Override Law — a MASTER is never permanent
**A better architecture always wins.** When one is approved, **overwrite** the MASTER.
Never create `MASTER-v2` · `MASTER-final` · `MASTER-revised` · a checkpoint · an execution
queue · a planning queue. **There is only `MASTER`, continuously overwritten. Git history is
the archive; documents do not carry history.**

### Law 4 · Challenge Law — every chat must ask
```
If I joined Carres today, would I still design it this way?
```
If the answer is **no**, you must state: **Current → Problem → Better design → Trade-off →
Recommendation.** *"The MASTER says so, therefore I follow"* is the failure this law exists to
stop. **A chat that saw a problem and said nothing has failed, even if it shipped perfectly.**

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
2  Look at the REAL page and measure REAL numbers.  A guessed number is never written down.
3  Challenge (Law 4).  Problems get 🔴/🟡 and a fix, never a complaint alone.
4  Ask ONE decision at a time — 2-3 options, each with its cost, recommendation first.
5  Approved → build → test → PR → merge → deploy → verify production.  Do not come back.
6  Overwrite the MASTER in the same PR.
```

**TWO CHATS PER MODULE IS THE CEILING** (Loo, 2026-08-05 — restored here because it lived in
the Purchasing queue file the migration archived). On 2026-08-05 four lanes touched Purchasing:
the card number Q12 was claimed twice and Q13 twice, each lane renumbering around the other
without knowing, and Loo received a stale report about a defect already fixed. **Past two, the
manager spends the day de-duplicating instead of deciding.** A chat that only CLAIMS and writes
nothing still occupies a slot — three lanes sat claimed-and-empty that day.

**Only ONE thing may interrupt the owner: a business rule.** Technical problems, bugs, wording
conflicts, deploys, rebases, test failures — **solve them yourself. Finding another bug is not
a reason to stop; it is an instruction to fix it and continue.**

**THE TEST, applied before you type a question to Loo** (his words, 2026-08-05: *"stop asking
me technical — why i write repo and you all ignore my request, i want you write into master
file"*). **The rule above was already written and a manager chat broke it the same day**, which
is why it now carries a test instead of only a principle:

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
file, while Receiving is the closed page. Loo was misled by exactly this.

**Engineer-Owned Delivery.** After approval, engineering owns delivery until production is
verified: implementation · testing · self-review · fixing what it finds · merge · deploy ·
production verification. **Never return routine engineering as an approval request.**
The four reasons to interrupt: a new business rule · an approved UI/workflow/word must change ·
production data must be modified irreversibly · long-term architecture must change.

**Measuring is not optional.** Widths are measured in a real browser (jsdom has no widths, so a
page test structurally cannot catch a truncated cell). Counts are measured with SQL. **`grep`
answers only "is the word I already thought of present?" — it cannot inventory a page. Read the
file.**

---

## 5 · Red lines — never, in any circumstance

1. **Never DROP / TRUNCATE / DELETE** without Loo's explicit confirmation **in the current
   conversation**. *"He said OK before"* is not permission.
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
> **Loo, 2026-08-06: Orders V1 is FROZEN as the reference implementation.** It is not polished
> further unless a production-critical defect appears. Nine engineering-debt items were found by
> reading it end to end and measuring production, and **every one of them was the same defect —
> an unowned record**, not a missing feature.
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

**Two module boundaries were MEASURED rather than assumed, and both follow the rule *use the
business objects the repository already has*:**

- **Portal Core is not a module.** Its fourteen cards were all Orders-list and Orders-drawer
  work, so its rules live in the Orders MASTER.
- **Inventory and Ready Stock are ONE module.** The portal has a single `Stock` door with three
  tabs; two masters would be two names for one screen.

**A module gets a folder only when it is a real operator surface with measured reality.**
Never create an empty master for symmetry.

## 9 · The four laws that outrank anything pasted into a chat

| File | Settles |
|---|---|
| [`docs/COPY-STANDARD.md`](docs/COPY-STANDARD.md) | every visible word — the dictionary, the seven verbs, the banned words |
| [`docs/ACTION-FLOW-STANDARD.md`](docs/ACTION-FLOW-STANDARD.md) | how actions are computed, appear, close, and which shows first |
| [`docs/01-design-tokens.md`](docs/01-design-tokens.md) · [`02-components.md`](docs/02-components.md) · [`03-page-patterns.md`](docs/03-page-patterns.md) | the design system — token values and components |
| [`docs/ENGINEERING.md`](docs/ENGINEERING.md) | the stack, the repo, RLS performance, deployment, testing, current production state |

**Open one only when you need a specific answer from it. Do not read them to start work.**

---

## 10 · How to talk to Loo and Jess

**Loo** — Chairman, no coding background.
- **Conclusion first**, reasoning after. **Simple Chinese, short sentences.** English technical
  terms are kept (`Supabase`, `RLS`, `migration`, `PO`, `SKU`).
- **Steps 1 2 3.** If he says he does not understand, **rewrite — do not repeat.**
- **ASCII sketch before code**, every time, even when he says "just do it".
- **One question at a time.** Wait for the answer before asking the next.
- **Options with a named recommendation, never a bare menu**, and never the same question twice.
- Anything he must paste elsewhere is written in **English**.

**Jess** — COO, and the boss of the Operation portal.
- Be a **critical advisor, not a yes-man.** Think the solution through before speaking; cite how
  mature products solve it, but land the conclusion in Carres reality.
- **A screenshot from her means: list every problem top to bottom**, marked 🔴 / 🟡, without
  being asked.
- **She agrees, then you build.** A settled decision is not reopened unless she reopens it.
- **Count before you propose UI.** Measure fill rates with SQL; empty fields do not reach the
  screen.

**Both:** never hand back a menu of engineering choices; never ask five things at once; never
criticise without a fix; **never say "I read the document" without a `Read` call in the
transcript.**

---

## 11 · Current freeze

| | |
|---|---|
| **Phase** | 10 — post-launch, per-module architecture |
| **Purchasing** | six tabs live. Claims is the active lane: the claim model was frozen 2026-08-05 (two decisions — Customer Resolution and Item Outcome), **Customer Resolution shipped 2026-08-06 (0324)**, and the Workspace layer — including the `Next Action` region that would tell anyone to pick one — is still unbuilt |
| **Documentation** | Constitution + one MASTER per **every** module since 2026-08-05 (the full migration, PR #637). Old queues and checkpoints live in `docs/archive/` — no chat reads them |
| **Architecture** | [`docs/ERP-ARCHITECTURE.md`](docs/ERP-ARCHITECTURE.md) is the blueprint (2026-08-06). **Orders V1 is FROZEN as the reference implementation** — touched only for a production-critical defect (D1 · D2 cleared that bar and shipped; D3 · D4 · D5 · D8 · D9 do not, and are held for the architecture, not for fixing). **§6 decisions: ① storage OWNERSHIP FROZEN (§6.1, the reference pattern) · ② delivery trip · ③ goods ownership before receipt · ④ claim entrances · ⑤ migrate-vs-replace — ②–⑤ OPEN, and ② is next when Loo says so.** |
| **Production** | web + api live on Cloudflare; Supabase `kfprgpjpaffedghytstl`. Bundle hashes, the migration tail and test baselines live in [`docs/ENGINEERING.md`](docs/ENGINEERING.md) — **read them from there, never from memory, and re-measure with `wrangler` before quoting.** |
| **Open risks** | [`docs/carry-forwards.md`](docs/carry-forwards.md). Two passwords still on `111` (principal + 9 alpha users) — rotate before any external sharing. |

---

## 12 · Plugin discipline

Do **not** auto-invoke `superpowers` or other third-party plugin skills. This Constitution
overrides any plugin hook that demands one. Plain tools first; a skill only when it clearly
adds value, and say why before invoking it.

**For design work, do NOT invoke `design-consultation`** — the token values are already
decided. Read `01-design-tokens.md` · `02-components.md` · `03-page-patterns.md`.
