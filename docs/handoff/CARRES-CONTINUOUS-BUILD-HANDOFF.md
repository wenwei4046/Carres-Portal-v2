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
> **2026-09-01: FOUR Claude Code sessions were merged into one, and this file is
> what they became.** They were the continuous build, the Sales Order Workspace
> field audit, the code-review/deploy watch, and the Catalog lane. Context
> switching between four of them cost more than they returned. **§6 is now one
> list with no owners.** Purchasing/Receiving/Delivery/Warehouse is a separate
> CODEX lane and was NOT merged — see §6.5.
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

## 2 · CURRENT STATUS — measured 2026-09-01, re-measure before use

| Fact | Value | How to re-measure |
|---|---|---|
| `origin/main` | `31ad3af4` — **and it moved 8 times in one hour** | `git rev-parse --short origin/main` |
| `apps/web` tests | **GREEN — 283 files, 3660 tests** | `cd apps/web && pnpm exec vitest run` |
| `apps/api` + `shared` | **GREEN — api 130 files / 2599 tests · shared 119 files / 2814 tests** | `pnpm --filter @carres/api --filter @carres/shared test` |
| Typecheck | clean | `pnpm -r typecheck` |
| Lint | passes (Stage 1, warn-only) | `pnpm -r lint` |
| Migration filenames | **419 validated** | `node scripts/check-migrations.mjs` |
| Migration tail, ALL branches | **0409** → next free is **0410** | the rename-safe command in §4 |
| On `main` | through `0409`; `0407`/`0408` exist only on branches | `git ls-tree origin/main supabase/migrations/` |
| Production | **all five surfaces agree on `71cfcb01`** | `EXPECTED_SHA=$(git rev-parse origin/main) node scripts/verify-production.mjs` |

**On production lag — read this before reporting a deploy as failed.** Deploys
are cancelled by concurrency constantly here: eight merges in one hour produced
six cancelled runs, and every one of them is normal. **The newest run builds the
main tip, and it carries everything the cancelled ones held.** The honest test
is not "did my SHA deploy" but **"is my SHA an ancestor of what production
serves"**:

```
git merge-base --is-ancestor <your-sha> <deployed-sha> && echo IN || echo NOT-IN
```

`CONVERGENCE_TIMEOUT_MS=1` gives a single pass that reports what each surface
currently serves instead of polling for 15 minutes.

### What is live, and what is only merged

⛔ **MERGED IS NOT APPLIED, AND THIS TABLE USED TO GET IT WRONG.** The previous
version of this file listed `0395` and `0406` under "merged and live" and said
`0406` was "closed at UI **and** database" — while §6 of the same file said both
were probably unapplied. **Two sentences in one document, contradicting each
other, for four hours.** That is why the finding now lives in
`docs/carry-forwards.md` instead of in a status table that decays.

| Migration | What it does | State |
|---|---|---|
| `0391` | Office create requires a Proceed date; a blank one may be filled ONCE, then locks | applied by hand |
| `0393`/`0394` | Stair carry is a real `STAIR_CARRY` add-on row, stamped at birth and re-stamped when floor/lift/count move | applied by hand |
| `0395` | A misclicked service can be removed | **merged — measured ABSENT from the database** |
| `0406` | A computed fee is not a pickable service — the doubling bug | **merged — measured ABSENT from the database** |
| `0409` | Layer ④ Carres Execution — in what ORDER the goods move | applied by YH 2026-09-01 |

**Verify before trusting either row.** See §6.1 item 1 for the one-paste query.

### Shipped and live in production, by lane

**Sales Order / Workspace lane** — the office add-on door
(`SalesOrderAddons.tsx`) · the FK guard that stops a missing migration blocking
a sale · one name for the delivery fee · the two POS delivery-fee inputs
withheld · one absence word (`Not recorded`) · goods-row alignment · Money card
one size · `Change delivery date` · the building-type gate · duty work reaching
Finance and Delivery · `Preview PDF` retired · `Copy to a new Sales Order`
retired · the stair-count clamp · ~20 banned words removed across Workspace,
Revisions and Order Route · Revisions/History loading and error guards (a 403
used to render as "No revisions recorded") · the Order Route asking the shared
money predicates instead of re-deciding them.

**Catalog lane** — the supplier **column** became a **door** (`efe73b7e`, #1008):
a cell cannot hold a list, so one item code opens a modal showing the routing
slot and every supplier that has quoted it, HOUZS-style · sofa combos gained a
read-only **costing** view on `/operation?tab=op-catalog` (`969bd1b1`, #1014),
answering *what does this combo cost us* per seat height, with a blank reading
`not set` and never `RM 0.00` · the register's billing column now shows the
delivery address when **"same as delivery"** is ticked instead of `Not recorded`
(#1001) · emergency contact split from one column into three.

**Both merges are confirmed live** — `efe73b7e` and `969bd1b1` are both
ancestors of the deployed `71cfcb01`.

**Calendar-fragility lane** — three board suites pinned their clock (#1002,
#1003, #1013). The ten red `os-card-*` tests are FIXED and were never a product
bug; see §3.7. **Do not go looking for them.**

**Three owner rulings are LAW in `docs/orders/MASTER.md`** (YH, 2026-08-28):
stair carry is money the customer owes · a date never recorded is not a date
that is locked · the delivery-payment approver is the principal only, and that
is explicitly marked CHANGEABLE.

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
- **This clone is shared, and merging the sessions did not stop that.** It has
  moved branches underneath a lane twice and discarded uncommitted work once,
  and the codex lane still pushes to it. Work in your own `git worktree`,
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
  `Manual Purchase` / `GRN` / `PO`) unless YH reassigns it. It is a **codex**
  lane, it was not part of the four-session merge, and it has five open PRs
  right now (#1000, #999, #993, #986, #1005).
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

## 6 · OPEN WORK, in order

**This section now carries all four lanes.** Ownership is gone; the list is one
list. Where an item came from another lane, its evidence is named so you can
re-measure rather than trust it.

### 6.1 · The two things that are wrong RIGHT NOW

1. 🔴 **`0395` and `0406` may never have been applied — and one of them is a
   money bug.** Both are merged, both have live callers, and the SO lane
   measured both absent from the database on 2026-09-01. **This file said the
   opposite in §2 for four hours; that contradiction is why the finding now
   lives in `docs/carry-forwards.md`** as
   `two-shipped-migrations-may-never-have-been-applied-and-one-is-a-money-bug`
   (HIGH), where it cannot be quietly overwritten by a status line. If it holds:
   `Remove` is a dead button in production (`orders.ts:3255` calls a function
   that is not there), and the add-on doubling bug is open in the database.
   **First action of the merged session: run the query in that entry.** It is
   one paste and it never errors.

2. 🔴 **The stair fee goes stale when goods change** — a live money defect in
   shipped code. `stairCarryFee` clamps on the order's item count, but
   `touchesStairInputs` watches only `delivery_floor`, `delivery_has_lift` and
   `delivery_stair_items`. Add or remove goods on a clamped order and the
   on-screen working-out recomputes live while the stored row does not. **One
   screen, two numbers** — Ownership Law D, and the exact defect the stair Card
   was opened to close. Fix: make the line-writing paths re-stamp too.

### 6.2 · Waiting on YH, not on engineering

3. **`SO Date` is unregistered and contradicts the dictionary.** Commit
   `11e11ca2` renamed `Ordered` → `SO Date` on five surfaces with no
   COPY-STANDARD entry, and the table at `COPY-STANDARD:1756` still rules
   `Ordered: {date}` for that exact fact. Register `SO Date` against
   `orders.placed_at` and retire the old row — or revert the rename. **YH picks.**

4. **The instalment-months 500.** `orders_installment_months_chk` allows
   NULL/6/12. A proposal of 9 saves fine and fails at the **principal's** Approve
   press with raw constraint text on screen. The bound is verified; the refusal
   **sentence** needs a ruled word.

5. **The add-on suppliers Card is QUEUED on one question.**
   `docs/cards/CARD-2026-09-01-an-addon-remembers-every-supplier-that-quoted-it.md`
   (merged `65a0ec91`). One add-on can be bought from several suppliers at
   several costs and there is nowhere to put the second quotation — no add-on
   table has ever carried a supplier. §9 asks: **does Carres ever raise a PO for
   an add-on, or is add-on cost only ever a margin reference?** The Card
   recommends building the offers table and leaving the routing slot out, which
   is useful either way and cannot be wrong. **Do not build it before §9 is
   answered.**

6. **The stair-carry backfill has not been run.** `pnpm backfill:stair-carry`
   (dry run), `-- --apply` to write. **YH's to run** — service-role key, and it
   changes money on existing orders.

7. **Nine alpha accounts and `principal@carres.com` are still on `111`.** Must
   be rotated before go-live. YH's, not engineering's.

### 6.3 · Carried in from the Catalog lane

8. **Blank Sales Order fields — YH is filling them himself.** Jess asked that
   every fillable column be filled by the time an order reaches Operations. The
   measurement that settled the panic: 85 orders, 37 AutoCount imports (100%
   blank, and §6 of the Constitution says today's rows are test data), 48
   portal, of which 10 could not have passed the delivery-date gate and 4 are
   genuinely unexplained. **Every order above SO-1322 is clean.** ⚠️ **Untick
   `Address not given yet` BEFORE typing an address, or the save discards it.**
   Re-scan after YH finishes.

9. **Catalog has no module MASTER.** `CLAUDE.md`'s authority map calls it a
   `PROPOSAL / authority gap` and says *do not infer rules from other modules*.
   Four owner rulings now live only in Card headers and commit messages — the
   supplier slot vs. offer list split, one item code with a modal rather than a
   column, cost belongs on the Operation door, and combos are viewable there
   read-only. **They belong in a MASTER.** This is the highest-value docs work
   available and needs no owner decision to start.

### 6.4 · Still open from the SO field audit

10. F-7 (`building_type` decides delivery slot length, has no column and no
    constraint) · F-8 (floor bounds disagree across UI/API/DB) · F-11 (the
    promised date is guarded by one layer, not two) · F-12 (`update_order`
    freezes six delivery fields after Proceed; the office door does not) · F-13
    (the floors evaluator is blind to seven fields) · F-14
    (`sales-order-copy.ts` is dead code — its only importer is its own test) ·
    the emergency-contact parts-direction round-trip.

    **Do not re-run the audit.** It exists, it has been corrected once, and a
    second sweep will re-report closed items.

### 6.5 · Not yours unless YH reassigns

**Purchasing, Receiving, Delivery and Warehouse are a CODEX lane, not one of the
merged sessions**, and they have five open PRs right now — #1000, #999, #993,
#986, #1005. Merging the Claude sessions did **not** merge that lane. Do not
touch `docs/purchasing/MASTER.md` or anything `Manual Purchase` / `GRN` / `PO`.

**#948 must not ride an ordinary merge** — it needs `0391` applied before merge
and `0392` after the Worker is verified, and it needs Jess's approval.

**Purchase Returns (§9.6) and Repair Orders (§9.7) are unfrozen, not
released.** Layer ④ (`0409`) completed Loo's four-layer claim model and removed
the argument they were frozen on. Each is a full register — numbering, PDF
issue, handover proof, custody moves, Finance credit reads — and §9.6/§9.7 are
page blueprints, not build scopes. **Do not start either on your own
initiative.**

**YH ruled 2026-09-01: the layers are NOT cross-validated.** `Replace First`
with `No Replacement Required` is incoherent and the database accepts it,
deliberately — a guard would collapse two layers Loo's model keeps apart, and
would refuse a real event. Written into `docs/purchasing/MASTER.md` §9.5 and
pinned by a test. **Do not add the guard** without reopening it with Loo.

## 7 · EXACT NEXT STEP

**Run the `pg_proc` query from §6.1 item 1 first.** Everything else on this list
is a guess until you know whether `0395` and `0406` are in the database. It is
one paste, it never errors, and it either closes a HIGH carry-forward or turns
it into the most urgent item in the file.

Then ask YH which item he is releasing, and recommend **the stale stair fee
(§6.1 item 2)** — it is a live money defect in shipped code, it is small, and it
needs no owner ruling.

If he releases nothing, **do the Catalog MASTER (§6.3 item 9)**. Four owner
rulings currently survive only in Card headers and commit messages, the
authority map already flags the gap, and writing them down needs no decision
from anybody. **Do not invent work beyond that.**

---

*Merged from four sessions on 2026-09-01. Every status line above decays within
days in this repo — measure, do not recite.*
