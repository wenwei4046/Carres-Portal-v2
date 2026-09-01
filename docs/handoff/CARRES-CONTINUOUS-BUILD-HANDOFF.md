# HANDOFF — Carres Portal v2 · one session, all modules

Paste everything below the line into a fresh session. It is self-contained.

> **`docs/handoff/` HOLDS EXACTLY ONE LIVE PROMPT, AND THIS IS IT.**
> When the mission changes, OVERWRITE this file. Never add a second one beside
> it — that happened on 2026-09-01 and the two prompts disagreed about whether a
> backfill was allowed. Finished ones go to `docs/archive/`, which `CLAUDE.md`
> Law 1 excludes from authority.
>
> | Section | Shelf life |
> |---|---|
> | §2 status · §8 open work · §9 next step | **days** — re-measure or delete |
> | §0 style · §3 autonomy · §4 decisions · §5 constraints · §6 avoid | months |
>
> Re-measure every number in §2 before trusting it. That is the point of the
> file, not a disclaimer.

---

CARRES PORTAL v2 — ONE SESSION, ALL MODULES
Repo `C:\Users\User\Desktop\Carres\Carres-Portal-v2` · branch `dev_branch_yh`
Read `CLAUDE.md` first. Red lines §5 are absolute. No `Co-Authored-By` trailer.

## 0 · HOW TO WRITE TO YH — read this before anything else

**YH ran four sessions at once until 2026-09-01 and stopped because the reading
load was the bottleneck, not the building.** He named the cause: too much prose,
written for other engineers. You are now one session so that there is one thing
to read. Do not spend that budget badly.

**Rules, in the order they get broken.**

1. **Answer in the first sentence.** Not context, not what you did, not a
   restatement of the question. The answer.
2. **A status update is a table.** Three columns at most: thing · state · what to
   do. Prose wrapped around a table is usually the table said twice.
3. **Mechanism second, and short.** One line, prefixed `Why:`. If it needs a
   paragraph, the paragraph goes in the PR body and he gets the link.
4. **Use the words on the screen.** `Remove`, `Proceed date`, `Stair carry` — not
   `remove_order_addon`, not `p_proceed_date`, not `status = 'place'`. He caught
   this directly: *"wdym allow removal on status = 'place' only?"* A database
   value is not a word you may say to him.
5. **No em-dash chains. No three-clause sentences.** Full stops are free.
6. **One report per task, not per step.** He wants what shipped, what needs him,
   what is still red. Not narration.
7. **Never pad.** No "great question", no summary of the summary. If nothing
   happened, say nothing happened.

**The test:** could Jess — the boss, no coding background — read it and know what
changed? If not, rewrite it.

This governs **messages to YH only**. Code comments, migration headers, PR
bodies and this file are written for the next session and stay thorough.

## 1 · GOAL

Ship owner-released work end to end — build, test, PR, merge, verify — without
returning routine engineering choices to the owner. YH releases the work; you
own delivery. Jess is the boss and has no coding background.

**⭐ YOU OWN EVERY MODULE NOW.** Until 2026-09-01 this was four sessions, each
told to stay out of the others' files. That rule is retired: a bullet saying
"another session owns Purchasing" is now just a way to leave work undone.

| Module | Authority | State |
|---|---|---|
| Orders / Sales Order | `docs/orders/MASTER.md` | most active; the field audit's open items live here |
| Purchasing · PO · GRN | `docs/purchasing/MASTER.md` | ~112 commits in 3 days; 3 stale PRs (§7) |
| Stock / Warehouse | `docs/stock/MASTER.md` | 2 stale PRs, both conflicting (§7) |
| Delivery | `docs/delivery/MASTER.md` | 1 stale draft PR (§7) |
| Payment · Service · Rental · Guarantee · HR · UI · Issue tracker | their own `MASTER.md` | quiet |

**Work one module at a time, in its own worktree.** Owning everything is not
permission to touch everything in one branch. It is permission to pick up any of
it when YH releases it.

**The one thing that matters more than shipping: not shipping a wrong number.**
This is a furniture ERP. Most defects found here are money defects, and they are
silent — a fee nobody collects, a count nobody clamps, a total two screens
disagree about.

For the Sales Order Workspace specifically (`/operation/orders/so/new` and
`/so/:orderId`), the standard is that **every visible thing has a defensible
answer** for three readers at once: Tech (where does it live, what writes it),
Sales (what do I type, what happens if I get it wrong), Operations (can I trust
this number, may I change it). That was audited in full on 2026-08-28 —
`docs/audits/SO-WORKSPACE-FIELD-AUDIT.md`, 103 rows in render order. **The open
items in it are the work; do not re-audit.**

## 2 · CURRENT STATUS — measured 2026-09-01 18:00, re-measure before use

| Fact | Value | How to re-measure |
|---|---|---|
| `origin/main` | `31ad3af4` | `git rev-parse --short origin/main` |
| `apps/web` tests | GREEN — 282 files, 3639 tests | `cd apps/web && pnpm exec vitest run` |
| `apps/api` tests | GREEN — 130 files, 2590 tests | `pnpm --filter @carres/api test` |
| `packages/shared` | GREEN — 119 files, 2807 tests | `pnpm --filter @carres/shared test` |
| Typecheck · lint · migration filenames | clean | `pnpm -r typecheck` · `pnpm -r lint` · `node scripts/check-migrations.mjs` |
| Migration tail on `main` | `0409` | `ls supabase/migrations` |
| Migration tail, ALL branches | `0409` → **next free is `0410`** | the rename-safe command in §5 |
| Open PRs, other lanes | **6, four of them CONFLICTING** | §7 |

### Migrations — what is in the DATABASE, not just the repo

**Merged is not applied.** Migrations here are run BY HAND in the Supabase SQL
editor, and a hand-applied one leaves **no tracker row** — so the tracker cannot
answer this and a green `main` is not evidence. Ask the database:

```sql
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('addon_is_server_computed',
   'remove_order_addon', 'sales_order_create_unchecked_0374',
   'order_stamp_stair_carry') order by 1;
```

A name missing from the result is a migration that never ran.

| Migration | What it does | In the DB |
|---|---|---|
| `0391` | Office create requires a Proceed date; a blank one may be filled ONCE, then locks | ✅ applied |
| `0393`/`0394` | Stair carry is a real `STAIR_CARRY` add-on row, stamped at birth, re-stamped when floor/lift/count move | ✅ applied |
| `0395` | A misclicked service can be removed — same gates as the edit door, no reason demanded | ✅ **applied by YH 2026-09-01** |
| `0406` | A computed fee is not a pickable service — the doubling bug, closed at UI **and** database | ✅ **applied by YH 2026-09-01** |
| `0409` | Layer ④ Carres Execution — in what ORDER the goods move | ✅ applied by YH 2026-09-01 |

⭐ **`0395` and `0406` sat merged-but-unapplied for four days and nobody noticed**,
because merging is visible and applying is not. For those four days `Remove` was
a dead button and the add-on doubling bug was open in the database while the
screen looked correct — the office UI hides that control, so the missing rule
was invisible *because* it was missing. **A PR merging is not a feature
shipping.** Run the probe above before you report anything as live.

### Shipped without a migration

The office add-on door (`SalesOrderAddons.tsx`) · the POS pencil asking the one
shared key list instead of a local label map · the FK guard that stops a missing
migration blocking a sale · one name for the delivery fee · the two POS
delivery-fee inputs withheld · one absence word (`Not recorded`) · goods-row
alignment · Money card one size · `Change delivery date` · the building-type gate
· duty work reaching Finance and Delivery · `Preview PDF` retired · `Copy to a
new Sales Order` retired · the stair-count clamp · ~20 banned words removed
across Workspace, Revisions and Order Route · Revisions/History loading and error
guards (a 403 used to render as "No revisions recorded") · the Order Route asking
the shared money predicates instead of re-deciding them · the field audit's
818-line correction pass.

**The ten red `os-card-*` tests are FIXED** (`#1002`/`#1003`, unified by `#1013`).
They were month-boundary fixtures, not a product bug. `sameMonth` had been on the
ruled-out list and `sameMonth` is what it was — **"ruled out" meant "found nothing
in it"**, which is a weaker claim than it reads as. Do not go looking for them.

**Three owner rulings are LAW in `docs/orders/MASTER.md`** (YH, 2026-08-28):
stair carry is money the customer owes · a date never recorded is not a date that
is locked · the delivery-payment approver is the principal only, and that is
explicitly marked CHANGEABLE.

## 3 · AUTONOMY — what "let it run" means

YH merged four sessions into one to stop context-switching. That only pays off if
you stop asking him things he has already answered. **Default to shipping.**

**SHIP without asking.** Open the PR, merge it when the gate is green, tell him
after in one line.

- Any fix to a defect you can demonstrate — a wrong number, a dead button, a gate
  that disagrees with its API, a duplicated list.
- Tests, types, lint, dead-code removal, comment and docs accuracy.
- Any item in §8 that has no ⚠️ beside it.
- Choosing the approach, the file layout, the migration shape, the test strategy.
- Re-measuring anything in §2 and correcting it.

**STOP and ask.** These are his, and guessing them has cost real money here.

- ⚠️ **A customer-facing word that is not already in `docs/COPY-STANDARD.md`.**
  Not a synonym, not "obviously fine". Ruled words only.
- ⚠️ **A business rule** — who may approve, what a fee means, whether a thing is
  owed. Ask Jess's question, not the schema's.
- ⚠️ **Anything that writes to existing rows** — backfills, repricing, migrations
  that touch data rather than shape.
- ⚠️ **Applying a migration.** You cannot; it is hand-run. Hand him the file and
  the probe.
- ⚠️ **Deleting anything he did not ask you to delete** (red line 5).

**When blocked, do not idle.** Finish everything in the task that does not depend
on the answer, ship that, then ask the one question. One question, at the end,
with your recommendation first.

## 4 · KEY DECISIONS, AND WHY

Do not re-litigate these. Each was ruled by the owner or resolved from authority.

1. **Stair carry is money the customer owes** (YH, 28 Aug). The customer signed a
   total including it; the order never stored it; every payment door capped
   below it. RM150 uncollectable on a worked example.

2. **The fee is STAMPED, never re-derived.** `floor_config.per_floor_per_item` is
   a live singleton a principal can PATCH. Re-deriving repriced historic orders
   whenever the rate changed.

3. **Unset stair count = NONE** (YH, 27 Aug). It used to mean "every item", so an
   order nobody was asked about was charged the maximum.

4. **A service is never removed, only increased** (YH, 28 Aug) — **narrowed the
   same day** to allow taking back a MISCLICK (`0395`). A downsell and a slip are
   different acts. `edit_order_addon` still raises `downsell_blocked`;
   `remove_order_addon` is a sibling door with the same gates.

5. **The wrapper pattern is how this lane changes a mature RPC.** `0385` → `0391`
   → `0395` → `0406` all do the same thing: `alter function … rename to
   …_unchecked_NNNN`, then a same-signature wrapper that guards and delegates.
   The mature body is preserved **byte-for-byte**. Copying a 600-line body to add
   one `if` is how a guard goes missing.

6. **A hidden button is not a rule.** Every refusal lives in the database; the
   screen merely declines to offer a door that would 422. Learned twice — `0395`
   did it right, and the doubling bug happened precisely because `Add one more`
   was gated in one UI sibling and nowhere at all in SQL.

7. **A duplicated list is the defect, not the missing entry.** The stair clamp
   lived in 4 places (1 wrong); the server-computed add-on keys in 4 (1 missed,
   and it was user-visible); the absence word in 2. `0406` replaced the SQL copy
   with `public.addon_is_server_computed(text)`. Kill the duplication; do not
   patch each copy.

8. **Tests pin INTENT, not spelling.** ~20 assertions were re-pinned across this
   work and **none was deleted**. When a ruled word changes, keep every assertion
   carrying the intent and replace only the literal. Name the surviving invariant
   in the commit.

9. **Create-mode and object-mode are different money states.** On `/so/new` no
   persisted add-on row exists, so the MONEY card and draft PDF synthesise the
   stair line; on a saved order the real row exists and synthesising it again
   would **charge the carry twice**. Contract tests pin that split. Do not
   "simplify" the two branches into one.

10. **The lock is on the ANSWER, never on the emptiness.** Jess's read-only rule
    for Proceed date stands; filling a blank is completion, not an edit.

11. **`Copy to a new Sales Order` retired** (Jess). It dropped each line's
    `attrs`, so Purchasing received a PO it could not autofill — a quiet wrong
    order. Loo's 11 Aug lock cited 2990 as a SOURCE and never gave a REASON.

12. **`Preview PDF` retired** (YH). It called `openSalesOrderPdf(r.id, r.so)`. So
    did `Print PDF`. Two rows, one behaviour.

13. **One absence word, `Not recorded`** (YH, 29 Aug). The register printed two,
    20 cells against 18. `Not given` only fits customer-supplied fields; nobody
    *gives* us an invoice number.

14. **The two POS delivery-fee inputs are withheld** (YH, 29 Aug). Jess and Chai
    found the section unclear, and what the fee MEANS is unruled. Restore only
    when Mr Loo answers what a base trip fee is for, who sets the rate, and which
    categories are charged.

15. **Purchase Returns NOT built.** Its only legitimate source is an approved
    claim outcome, and that layer — Carres Execution — was frozen by Loo.
    Building it means inventing authorisation the repo says nobody may guess.
    YH approved building Carres Execution itself on 30 Aug (§8).

16. **The stair-carry backfill IS allowed** (YH, 30 Aug: *"on old orders, if they
    should be added, they get added"*). The archived SO prompt said the opposite,
    citing `CLAUDE.md` §6 — but §6 forbids backfilling **imported rows**. These
    are orders created in the portal that missed their fee to a code bug, and the
    owner ruled directly on them. Not a contradiction; an over-generalisation.

17. **The four claim layers are NOT cross-validated** (YH, 1 Sep). `Replace First`
    with `No Replacement Required` is incoherent and the database accepts it, on
    purpose. Two reasons, and both must be answered before anyone adds the guard:
    a CHECK across the two would **collapse two layers Loo's model exists to keep
    apart** — the moment one narrows the other they stop being two questions; and
    it would **refuse a real event**, because the van is already out collecting
    while the customer has not settled what they want, so a matched-pair rule
    makes an operator type a false answer to record a true one. In
    `docs/purchasing/MASTER.md` §9.5 and pinned by a test.

## 5 · CONSTRAINTS

- **Migrations are applied BY HAND.** Code can reach production before its
  migration does — it did on 29 Aug and every stair-carry order failed with
  `order_addons_addon_key_fkey`, because the create is one transaction. **Any
  code that depends on a new row must degrade, not abort.** Never assume a
  function exists because its file does.
- **The tracker cannot be queried from the repo.** Ask YH. `version` is a
  timestamp; the `0NNN` lives in `name`, and the regex anchor is load-bearing.
- **Never number a migration from `ls`** (red line 7). Take the MAX of the
  tracker, the repo, AND every branch — unmerged branches routinely hold numbers
  above `main`'s tail (today: `0407`, `0408`):
  ```
  git log --all --pretty=format: --name-only -- supabase/migrations \
    | sed 's#.*/##' | grep -oE '^[0-9]{4}' | sort -nu | tail
  ```
- **CRLF.** Every source file is CRLF and the gate audits it. A file written with
  LF must be normalised before commit.
- **A word not in `docs/COPY-STANDARD.md` may not appear on screen** — and check
  the *Do NOT use* column too, not only whether the word is absent. Two audit
  findings were wrongly cleared because only absence was checked.
- **A shared function changes in every caller at once**, or the surfaces disagree.
- **A UI must mirror its API's gate**, never invent a second policy.
- **Full gate before push:** `pnpm -r typecheck` · `pnpm -r test` · `pnpm -r lint`
  · `node scripts/check-migrations.mjs` · CRLF/NUL audit on changed files ·
  `verify-production.mjs` after deploy.
- **Merge `origin/main` before starting and before every push.** `gh pr merge`
  leaves you on main — run `git branch --show-current` before committing.
- **One session now, but the clone still holds five worktrees and other tools
  push here.** Branches have moved underneath a lane twice and uncommitted work
  was discarded once. Work in your own `git worktree`, stage by filename, commit
  early, and re-measure `origin/main` before and after. A branch name that
  already exists is a signal, not an obstacle — pick another.
- **A PR can merge while you are editing its branch.** It happened on
  2026-09-01: a push landed on an already-merged branch and never reached `main`.
  Re-check `gh pr view <n>` before pushing a follow-up commit.

## 6 · WHAT TO AVOID

- **Do not report a PR's contents from a local commit count.**
  `git rev-list origin/main..HEAD --count` answers "what is unmerged", NOT "what
  is in that PR". Use `gh pr view <n>`. This lane got it wrong once and YH caught
  it.
- **Do not hand over a command you have not run.** A backfill script was
  delivered that could not execute — wrong file type, failed on import before any
  logic ran.
- **Do not fix a "one rule, several copies" defect by editing one copy.** See
  §3.7 — it is this codebase's signature defect.
- **Do not re-run the field audit.** It exists, it has been corrected once, and a
  second sweep will re-report closed items.
- ~~Do not touch the Purchasing lane~~ **— RETIRED 2026-09-01.** That bullet
  existed because another session owned it. It does not any more; see §1. What
  survives is the reason it was written: Purchasing moves fast (~112 commits in
  three days) and has three open PRs, so **re-read `docs/purchasing/MASTER.md`
  and `git log` that module before you change it**, rather than trusting anything
  you remember about it.
- **Do not "fix" the `delivery_payment_approver` UI to read the duty.** The duty
  key was never created, so the gate is already identical to principal-only.
  Refuted in the audit §5 G-4 and ruled CHANGEABLE in the MASTER.
- **Do not invent customer-facing words.** Two open items are blocked on a ruled
  sentence and must stay blocked rather than be guessed.
- **Do not delete files that were not requested** (red line 5), and do not use
  `git checkout <ref> -- .` to inspect another branch — it overwrites the working
  tree. Use `git show <ref>:<path>`.
- **Do not write long explanations to YH.** The rules are in **§0** and they are
  not a style preference — the reading load is what ended the four-session setup.
  Kept as one line here rather than restated, because a rule written twice is the
  defect §4.7 is about.

## 7 · INHERITED PRs — six open, none of them yours

These are the other sessions' work, left open when the four became one. **Nothing
here is urgent and nothing here should be merged blind.** Four conflict against
`main` and two are drafts. They are listed so you know they exist, not so you
close them.

| PR | Module | State | Size |
|---|---|---|---|
| [#1000](https://github.com/wenwei4046/Carres-Portal-v2/pull/1000) | Purchasing — converge through formal GRN | mergeable | +10393 / −3966 |
| [#993](https://github.com/wenwei4046/Carres-Portal-v2/pull/993) | Purchasing — governed Purchase Orders | **conflicting** | +3134 / −235 |
| [#986](https://github.com/wenwei4046/Carres-Portal-v2/pull/986) | Receiving — reconcile GRN authority | **conflicting** | +813 / −68 |
| [#1005](https://github.com/wenwei4046/Carres-Portal-v2/pull/1005) | Stock — Stock Register and exact Unit access | **conflicting**, draft | +188 / −2 |
| [#999](https://github.com/wenwei4046/Carres-Portal-v2/pull/999) | Delivery — Work, DO handover, result, narrow layout | draft | +1152 / −78 |
| [#860](https://github.com/wenwei4046/Carres-Portal-v2/pull/860) | Warehouse — a unit crosses a site only by transfer | **conflicting**, stale since 20 Aug | +1950 / −15 |

**Ask YH before touching any of them.** #1000 alone is 10k lines; rebasing it is
a project, not a chore. The right first question is whether each is still wanted,
not how to merge it.

## 8 · OPEN WORK, in order

**Recently closed:** Layer ④ (Carres Execution) is BUILT —
migration `0409`, applied by YH 2026-09-01. Loo's four-layer claim model is
complete, and the argument Purchase Returns (§9.6) and Repair Orders (§9.7) were
frozen on now exists. **Both are still unbuilt**; they are unfrozen, not
delivered, and each is a register with its own numbering, PDFs, handover proof
and custody moves. The audit's 818-line correction pass also landed.

**YH ruled while building it (2026-09-01): the layers are NOT cross-validated.**
`Replace First` with `No Replacement Required` is incoherent and the database
accepts it, deliberately — a guard would collapse two layers Loo's model keeps
apart, and would refuse a real event (the van is already collecting; the
customer has not settled what they want). Written into
`docs/purchasing/MASTER.md` §9.5 and pinned by a test. **Do not add the guard**
without reopening it with Loo.

1. 🔴 **The stair fee goes stale when goods change** — a live money defect in
   shipped code. `stairCarryFee` clamps on the order's item count, but
   `touchesStairInputs` watches only `delivery_floor`, `delivery_has_lift` and
   `delivery_stair_items`. Add or remove goods on a clamped order and the
   on-screen working-out recomputes live while the stored row does not. **One
   screen, two numbers** — ownership Law D, and the exact defect the stair Card
   was opened to close. Fix: make the line-writing paths re-stamp too.

2. **`SO Date` is unregistered and contradicts the dictionary.** Commit
   `11e11ca2` renamed `Ordered` → `SO Date` on five surfaces with no
   COPY-STANDARD entry, and the table at `COPY-STANDARD:1756` still rules
   `Ordered: {date}` for that exact fact. Shipped code breaks the dictionary it
   is ruled by. Register `SO Date` against `orders.placed_at` and retire the old
   row — or revert the rename. YH decides which.

3. **The instalment-months 500.** `orders_installment_months_chk` allows
   NULL/6/12 and nothing above the database knows. A proposal of 9 saves fine and
   fails at the **principal's** Approve press with raw constraint text on screen.
   The bound is verified; the refusal **sentence** needs a ruled word from YH.

4. ✅ **CLOSED — `0395` and `0406` were unapplied and now are not.** Measured
   against the live database on 2026-09-01 and applied by YH the same day. The
   probe in §2 is what answered it; keep using it rather than reasoning from the
   repo.

5. **The stair-carry backfill has not been run.** `pnpm backfill:stair-carry`
   (dry run), `-- --apply` to write. **YH's to run** — it needs the service-role
   key and it changes money on existing orders.

6. **Still open from the audit:** F-7 (`building_type` decides delivery slot
   length, has no column and no constraint) · F-8 (floor bounds disagree across
   UI/API/DB) · F-11 (the promised date is guarded by one layer, not two) · F-12
   (`update_order` freezes six delivery fields after Proceed; the office door does
   not) · F-13 (the floors evaluator is blind to seven fields) · F-14
   (`sales-order-copy.ts` is dead code — its only importer is its own test) · the
   emergency-contact parts-direction round-trip.

## 9 · EXACT NEXT STEP

**Start with §8 ① — the stale stair fee.** Do not ask first. It is the only 🔴 on
the list, it is a live money defect in code this lane shipped, it is small, and
it needs no ruling: the arithmetic already exists and one caller does not run it.

Then work down §8 in order, shipping each as its own PR. **Stop only at an item
marked ⚠️**, which today means ② (`SO Date` — YH picks register-or-revert) and ③
(the instalment refusal sentence — needs a ruled word). Bank those two questions
and ask them together, once, with your recommendation first.

Do NOT start Purchase Returns or Repair Orders just because Layer ④ unfroze them.
Each is a full register — numbering, PDF issue, handover proof, custody moves,
Finance credit reads — and `docs/purchasing/MASTER.md` §9.6/§9.7 are page
blueprints, not build scopes. They need YH to release them.

Do NOT touch the six inherited PRs in §7 without asking.

---

*Written 2026-09-01 at `origin/main` = `31ad3af4`, when four sessions became one.
Status lines decay within days in this repo — measure, do not recite.*
