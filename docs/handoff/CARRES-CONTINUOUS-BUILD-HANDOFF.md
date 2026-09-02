# HANDOFF — Carres Portal v2 · continuous build

Paste everything below the line into a fresh session. It is self-contained.

> **`docs/handoff/` HOLDS EXACTLY ONE LIVE PROMPT, AND THIS IS IT.**
>
> Two prompts existed here for four hours on 2026-09-01 — this one and
> `SO-LANE-CONTINUATION-PROMPT.md`, merged five minutes apart by two sessions on
> the same branch. They disagreed about whether the stair-carry backfill was
> allowed. A fresh session could not tell which one ruled, which is the exact
> failure Law 5 asks about: *can the project have one file fewer?* The Sales
> Order prompt now lives in `docs/archive/`, which `CLAUDE.md` Law 1 excludes
> from authority, and everything still live in it was folded into this file.
>
> **When this lane's mission changes, OVERWRITE this file — never add a second
> one beside it.**
>
> Its sections do not age at the same rate:
>
> | Section | Shelf life |
> |---|---|
> | §2 status · §6 open work · §7 next step | **days** — re-measure or delete |
> | §3 decisions · §4 constraints · §5 what to avoid | months — these are why the file exists |
>
> Re-measure every number in §2 before trusting it. That is the point of the
> file, not a disclaimer.

---

CARRES PORTAL v2 — CONTINUOUS BUILD
Repo `C:\Users\User\Desktop\Carres\Carres-Portal-v2` · branch `dev_branch_yh`
Read `CLAUDE.md` first. Red lines §5 are absolute. No `Co-Authored-By` trailer.
Lane: **BUILD/DELIVERY**. You ship. Interrupt YH only for a business rule.

## 1 · GOAL

Ship owner-released work end to end — build, test, PR, merge, verify — without
returning routine engineering choices to the owner. YH releases the work; you
own delivery. Jess is the boss and has no coding background.

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

## 2 · CURRENT STATUS — measured 2026-09-02 after #1060, re-measure before use

| Fact | Value | How to re-measure |
|---|---|---|
| `origin/main` | `90147ff2` | `git rev-parse --short origin/main` |
| `apps/web` tests | **GREEN — 285 files, 3731 tests** | `cd apps/web && pnpm exec vitest run` |
| `apps/api` tests | **GREEN — 131 files, 2649 tests** | `pnpm --filter @carres/api test` |
| `packages/shared` tests | **GREEN — 122 files, 2836 tests** | `pnpm --filter @carres/shared test` |
| Typecheck | clean | `pnpm -r typecheck` — **NOT** `tsc -p tsconfig.json` in `apps/web`, which checks nothing |
| Migration filenames | 425 validated | `node scripts/check-migrations.mjs` |
| Migration tail, ALL branches | `0416` — on the unmerged `fix/so-batch-scroll-and-unit-id`, NOT on main → **next free is `0417`** | the rename-safe command in §4 |
| Open PRs from this lane | **none** — #1058, #1059 and #1060 all merged 2 Sep | `gh pr list --author @me` |

### Migrations — APPLIED means probed, not merged

| Migration | Probe verdict 2026-09-02 |
|---|---|
| `0395`, `0406` | ✅ applied — closed the HIGH carry-forward that had been open four days |
| `0405` | ✅ applied 1 Sep. **It had never run**; the PO collection guard existed only in two API routes |
| `0410` Manual Purchase is one transaction | ✅ applied |
| `0414` a stamped fee remembers its rate | ✅ applied |
| `0415` the office door locks what the shop door locks | ✅ **applied 2026-09-02 by YH.** Confirm it landed WHOLE — §6.2 |
| `0413` the over-issue guard counts what was approved | ❓ **NEVER PROBED** — merged 2 Sep inside #1054, and its own PR body says *MERGED IS NOT APPLIED*. §6.1 |
| `0411` instalment months widened | **WITHDRAWN, never applied.** YH asked *"if the POS still sells 6 and 12, why widen?"* and he was right |

### Shipped 1–2 Sep, merged and live

**Money defects closed.** A **live POS double-charge**: `PosOrderDetail.tsx`
added the stored `STAIR_CARRY` add-on row *and* a live `floorSurcharge()`
recomputation into one total, so the stair fee was charged twice and drove the
payment prefill. Its test could not see it — the fixture had `floor: 1`,
`hasLift: true` and no stair items, three separate ways of zeroing the live half
while a real fee sat in the add-ons. · The **stale stair fee** (the 🔴 that
opened this file's old §6): `restampAfterLineWrite` now re-stamps when goods
change, and skips the write when the fee is unchanged. · **`0414`** stores the
rate that produced a stamped fee, so an old order re-reads its own rate instead
of today's.

**Sales Order workspace.** Every non-editable fact now renders as a read-only
textbox (`role="textbox" aria-readonly`) so filled and empty look the same
shape · money boxed · service rows in the Goods card styled like goods ·
`Sales ownership` split into its own card · card titles carry
`text-signature-700`, the one hue free of a token job · `{n} of {m} Units ready`
replaces the banned `Not allocated` · stair-carry quantity has a ceiling
(`max={stair?.itemsTotal}`) and the floor bound is `1–3` on both doors — *office
follows POS*, measured, not assumed · `Change salesperson` no longer owns a row ·
the delivery-payment approval box removed on YH's ruling · `SO Date` registered
in `COPY-STANDARD.md` · `sales-order-copy.ts` deleted (F-14) · the
emergency-contact round trip fixed — only *trailing* empties drop, so a blank
middle field no longer shifts every value one slot left.

**Purchasing.** `0410` makes a Manual Purchase all-or-nothing — it was six
separate browser transactions, and a failure on line 3 left a half-record that
could still be approved and issued · `approvedQty` in `manualPurchaseStatusOf` ·
`useAddOrderLines` now invalidates `["operation","orders"]` — React Query
matches by **prefix**, so adding a service wrote to the database and the screen
never refetched.

**A settled doc.** `docs/orders/MASTER.md:1727` is struck as spent: its own
condition (*"until the amendment lane lands"*) had expired, and it was the only
text authorising a silent change to a customer's promised date.
## 3 · KEY DECISIONS, AND WHY

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
    YH approved building Carres Execution itself on 30 Aug (§6).

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

## 4 · CONSTRAINTS

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
- **Three sessions share this clone.** It has moved branches underneath a lane
  twice and discarded uncommitted work once. Work in your own `git worktree`,
  stage by filename, commit early, and re-measure `origin/main` before and after.
  Do not touch another lane's branch.

## 5 · WHAT TO AVOID

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
- **Do not touch the Purchasing lane** (`docs/purchasing/MASTER.md`, anything
  `Manual Purchase` / `GRN` / `PO`) unless YH reassigns it. Another session owns
  it and had ~112 commits in three days.
- **Do not "fix" the `delivery_payment_approver` UI to read the duty.** The duty
  key was never created, so the gate is already identical to principal-only.
  Refuted in the audit §5 G-4 and ruled CHANGEABLE in the MASTER.
- **Do not invent customer-facing words.** Two open items are blocked on a ruled
  sentence and must stay blocked rather than be guessed.
- **Do not delete files that were not requested** (red line 5), and do not use
  `git checkout <ref> -- .` to inspect another branch — it overwrites the working
  tree. Use `git show <ref>:<path>`.
- **Do not write long explanations to YH.** He has said so repeatedly. Plain
  words, conclusion first, mechanism second or on request.

## 5b · WHAT TO AVOID — three added 2026-09-02, each learned by doing it

- **`git log --diff-filter=A` to find the next migration number.** It reports
  additions only, and git records a renumbered file as a **rename** — so it hid
  `0413` on another branch and the next migration was nearly numbered on top of
  a live one. Use the rename-safe command in §4.
- **A two-part SQL probe pasted as one file.** The Supabase SQL editor runs only
  the **last** statement of a paste, so a two-question probe silently answers
  half. Split them into separate files and say so when handing them over.
- **Degrading quietly.** A `0410` fallback returned HTTP 200 while dropping
  every line of a Manual Purchase. "Degrade, don't abort" is not "stay silent" —
  if the safe path cannot do the whole job, refuse in words (503), never
  half-write.
- **A gate that never ran, read as a gate that passed.** Two ways to get this,
  both hit on 2026-09-02. A **fresh worktree has no `node_modules`**, so
  `pnpm -r typecheck` fails with *'tsc' is not recognized* — a missing binary,
  not clean code. And `pnpm -r test 2>&1 | tail` reports **tail's** exit code,
  so a red suite prints green. Run `pnpm install` in a new worktree first, and
  redirect to a file rather than piping: `pnpm -r test > log 2>&1; echo $?`.
  Same family as the `tsc -p tsconfig.json` warning in §2 — the failure mode is
  always that nothing was measured, and nothing looks like success.

## 6 · OPEN WORK, in order

1. ⚠️ **`0413` has never been probed.** It merged inside #1054 on 2 Sep and its
   own PR body says *MERGED IS NOT APPLIED*. It makes the over-issue guard count
   what the approver ALLOWED (`coalesce(approved_qty, qty)`) rather than the
   original ask, so until it is applied the database will let a caller issue the
   full ask on a line the approver cut. No money has moved wrongly — the API is
   the only caller and it respects the cut — but a guard that is correct only
   because the layer above it happens to be correct is not a guard. Hand YH
   `0413-applied.sql`; apply only if it answers `false`.

2. **Confirm `0415` landed WHOLE, not half.** YH applied it on 2 Sep, so F-11
   (the promised date guarded by one layer, not two), F-12 (`update_order`
   freezes six delivery fields after Proceed; the office door did not) and F-13
   (the floors evaluator blind to ten fields) are all live. The half-apply was
   the whole risk: the file renames `sales_order_floors` →
   `sales_order_floors_unchecked_0328` and then installs a wrapper, and a stop
   between those two steps leaves every Sales Order write with no floors check
   at all. The guard DO block should have made that impossible. Confirming costs
   one query — `0415-landed-whole.sql`, expect `2, true, true`.

3. **The instalment-months refusal sentence.** The bound is verified and
   correct — NULL/6/12, matching what the POS sells. A proposal of 9 still fails
   at the principal's Approve press with **raw constraint text on screen**. The
   *word* needs ruling by YH; the bound does not need changing. **Do not widen
   the constraint** — that was `0411`, and it was withdrawn for a good reason.

4. **`building_type` — DECIDED, PARTLY UNRULED, DELIBERATELY NOT BUILT.**
   Unchanged from the previous revision of this file and still correct. Jess's
   locked map lives in `COPY-STANDARD.md`; `Other` does **not** satisfy the
   requirement (YH, 2026-09-01) but both create doors still accept it. What is
   genuinely unruled: what a half-day *is* in slots · the Saturday weight's
   denominator (`delivery-calendar.ts` now counts every booking as 1, which is
   where a weight would go — but only `Landed` and `Condo` have weights, and Loo
   ruled Saturday while capacity applies every day) · the third create door
   (`PrincipalNewOrder.tsx` never asks) · orders with no address. **Do not build
   any of it from inference.**

5. **Purchase Returns (§9.6) and Repair Orders (§9.7)** — unfrozen by `0409`,
   still unbuilt. Each is a full register: numbering, PDF issue, handover proof,
   custody moves, Finance credit reads. They are page blueprints, not build
   scopes. **They need YH to release them.**

6. **Six migration numbers are each claimed twice** across Chai's unmerged
   branches. Not this lane's to fix, but check before numbering anything.

**Ruled, do not re-open:** the four claim layers are NOT cross-validated —
`Replace First` with `No Replacement Required` is incoherent and the database
accepts it deliberately (YH, 2026-09-01, `docs/purchasing/MASTER.md` §9.5,
pinned by a test). Adding the guard would collapse two layers Loo's model keeps
apart and would refuse a real event.

## 7 · EXACT NEXT STEP

**Hand YH two probes — `0413-applied.sql` and `0415-landed-whole.sql` — and
wait for both verdicts.** One query each, and they are the only two facts in this
file that cannot be measured from the repository. Every line of the 1–2 Sep build
is merged; whether the DATABASE agrees is the open question, and this repo has
been wrong about that twice in three days.

Then ask YH which item in §6 he is releasing. Items 3, 4 and 5 are each blocked
on a ruling from him, not on work. **Do not invent work**, and do not start
Purchase Returns or Repair Orders on your own initiative.

---

*Written 2026-09-02 at `origin/main` = `90147ff2`. Status lines decay within
days in this repo — measure, do not recite.*
