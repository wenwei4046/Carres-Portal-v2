# HANDOFF — Carres Portal v2 · continuous build

Paste everything below the line into a fresh session. It is self-contained.
Re-measure every number in it before trusting it; that is the point of the file,
not a disclaimer.

---

CARRES PORTAL v2 — CONTINUOUS BUILD
Repo `C:\Users\User\Desktop\Carres\Carres-Portal-v2` · branch `dev_branch_yh`
Read `CLAUDE.md` first. Red lines §5 are absolute. No `Co-Authored-By` trailer.

## GOAL

Ship owner-released work end to end — build, test, PR, merge, verify — without
returning routine engineering choices to the owner. YH releases the work; you
own delivery. Jess is the boss and has no coding background.

**The one thing that matters more than shipping: not shipping a wrong number.**
This is a furniture ERP. Most defects found here are money defects, and they are
silent — a fee nobody collects, a count nobody clamps, a total two screens
disagree about.

## CURRENT STATUS — verify, do not trust

Measured 2026-08-31. Every line below decays; re-run the command in brackets.

- `dev_branch_yh` is level with `origin/main`, tree clean, nothing unmerged.
  [`git rev-list origin/main..dev_branch_yh --count`]
- Production converged on all five surfaces.
  [`EXPECTED_SHA=$(git rev-parse origin/main) node scripts/verify-production.mjs`]
- **`main` is RED on the web suite: 10 tests failing**, all `os-card-*` in
  `BdOrdersBoard.test.tsx` and `OrderStatusPage.test.tsx`. Not caused by this
  lane. See UNRESOLVED below. [`cd apps/web && pnpm exec vitest run`]
- **Migrations 0395–0405 may not be applied.** The owner applied through 0394 by
  hand. Migrations here are applied MANUALLY in the Supabase SQL editor and the
  tracker misses rows applied that way, so absence is not proof.
  [`select name, version from supabase_migrations.schema_migrations order by version desc`]

### Shipped by this lane, all merged and live

Stair carry is money the order can hold (0393/0394 — stamped at create,
re-stamped on edit, collectable by card and cash) · office add-on door
(`SalesOrderAddons.tsx`) · the FK guard that stops a missing migration blocking a
sale · one name for the delivery fee · the two POS delivery-fee inputs withheld ·
one absence word (`Not recorded`) · goods-row alignment · Money card one size ·
`Change delivery date` · building-type gate · duty work reaching Finance and
Delivery · `Preview PDF` retired · `Copy to a new Sales Order` retired · the
stair-count clamp · `docs/audits/SO-WORKSPACE-FIELD-AUDIT.md` (578 lines).

## KEY DECISIONS, AND WHY

Do not re-litigate these. Each was ruled by the owner or resolved from authority.

| Decision | Why |
|---|---|
| **Stair carry is money the customer owes** (YH, 28 Aug) | The customer signed a total including it; the order never stored it; every payment door capped below it. RM150 uncollectable on a worked example. |
| **The fee is STAMPED, never re-derived** | `floor_config.per_floor_per_item` is a live singleton a principal can PATCH. Re-deriving repriced historic orders when a rate changed. |
| **Unset stair count = NONE** (YH, 27 Aug) | Was "every item", so an order nobody was asked about was charged the maximum. |
| **A service is never removed, only increased** (YH, 28 Aug), **narrowed** the same day to allow taking back a MISCLICK (0395) | A downsell and a slip are different acts. `edit_order_addon` still raises `downsell_blocked`; `remove_order_addon` is a sibling door with the same gates. |
| **`Copy to a new Sales Order` retired** (Jess) | It dropped each line's `attrs`, so Purchasing received a PO it could not autofill — a quiet wrong order. Loo's 11 Aug lock cited 2990 as a SOURCE and never gave a REASON. |
| **`Preview PDF` retired** (YH) | It called `openSalesOrderPdf(r.id, r.so)`. So did `Print PDF`. Two rows, one behaviour. |
| **One absence word, `Not recorded`** (YH, 29 Aug) | The register printed two, 20 cells against 18. `Not given` only fits customer-supplied fields; nobody *gives* us an invoice number. |
| **The two POS delivery-fee inputs are withheld** (YH, 29 Aug) | Jess and Chai found the section unclear, and what the fee MEANS is unruled. Restore only when Mr Loo answers what a base trip fee is for, who sets the rate, and which categories are charged. |
| **Purchase Returns NOT built** | Its only legitimate source is an approved claim outcome, and that layer — Carres Execution — is frozen by Loo. Building it means inventing authorisation the repo says nobody may guess. |

## CONSTRAINTS

- **Migrations are applied BY HAND.** Code can reach production before its
  migration does — it did on 29 Aug and every stair-carry order failed with
  `order_addons_addon_key_fkey`, because the create is one transaction. Any code
  that depends on a new row must degrade, not abort.
- **Never number a migration from `ls`** (red line 7). Take the MAX of the
  tracker, the repo, AND every branch:
  `git log --all --pretty=format: --name-only -- supabase/migrations | sed 's#.*/##' | grep -oE '^[0-9]{4}' | sort -nu | tail`
  Unmerged branches routinely hold numbers above `main`'s tail.
- **CRLF.** Every source file is CRLF and the gate audits it. A file written with
  LF must be normalised before commit.
- **A word not in `docs/COPY-STANDARD.md` may not appear on screen.**
- **Tests pin INTENT, not spelling.** An outdated pin is REWRITTEN to its
  surviving invariant with the reasoning in the test body. Never deleted.
- **A shared function changes in every caller at once**, or the surfaces disagree.
- **A UI must mirror its API's gate**, never invent a second policy.
- **Full gate before push:** `pnpm -r typecheck` · `pnpm -r test` · `pnpm -r lint`
  · `node scripts/check-migrations.mjs` · CRLF/NUL audit on changed files ·
  `verify-production.mjs` after deploy.
- **Merge `origin/main` before starting and before every push.** `gh pr merge`
  leaves you on main — run `git branch --show-current` before committing.
- **The working tree is SHARED with other sessions.** It has moved branches
  underneath this lane twice and discarded uncommitted work once. Commit early;
  if you must switch, save a patch first.

## WHAT TO AVOID

- **Do not report a PR's contents from a local commit count.**
  `git rev-list origin/main..HEAD --count` answers "what is unmerged", NOT "what
  is in that PR". Use `gh pr view <n>`. This lane got it wrong once and the user
  caught it.
- **Do not hand over a command you have not run.** A backfill script was
  delivered that could not execute — wrong file type, failed on import before
  any logic.
- **Do not fix a "one rule, several copies" defect by editing one copy.** This
  codebase's signature defect: the stair clamp lived in 4 places (1 wrong), the
  server-exclusive addon keys in 4 places (3 found, 1 missed and it was
  user-visible), the absence word in 2. Grep for every copy, then unify.
- **Do not touch Chai's purchasing lane** unless YH reassigns it.
- **Do not build Purchase Returns, Repair Orders, or any `soon: true` page**
  without the ruling named above.
- **Do not delete files that were not requested** (red line 5), and do not use
  `git checkout <ref> -- .` to inspect another branch — it overwrites the working
  tree. Use `git show <ref>:<path>`.
- **Do not write long explanations to YH.** He has said so repeatedly. Plain
  words, conclusion first, mechanism second or on request.

## UNRESOLVED — needs a human

1. **`main` is red: 10 `os-card-*` tests.** Ruled out: card markup, `laneOf`,
   `sameMonth`, the query mock's completeness, fake-timer ordering, the global
   setup restoring real timers, and the PIN gate. No code path found that would
   empty that list. **Needs one page load** of POS My Orders and the BD board to
   tell "stale tests" from "broken site". Another lane's code.
2. **Migrations 0395–0405** — run the tracker query and apply what is missing.
   `0395` is the one that matters to the add-on door.
3. **The backfill has not been run.** `pnpm backfill:stair-carry` (dry run),
   `-- --apply` to write. Owner's to run; it needs the service-role key and it
   changes money on existing orders.
4. **Layer ④ (Carres Execution)** — YH approved building it (option (a),
   30 Aug). Still frozen, still unbuilt. It unblocks Purchase Returns AND Repair
   Orders. Research it before writing anything; the ruling it un-freezes is
   Loo's.

## EXACT NEXT STEP

Ask YH which of these he is releasing, in this order of recommendation:

1. **Layer ④ (Carres Execution)** — he already approved it. Largest, and it
   unblocks two `soon: true` destinations.
2. **The 10 red tests** — if he confirms the boards are broken on the live site,
   this jumps to first and becomes urgent.
3. Nothing else is queued from this lane. If he releases nothing, stand by;
   do not invent work.
