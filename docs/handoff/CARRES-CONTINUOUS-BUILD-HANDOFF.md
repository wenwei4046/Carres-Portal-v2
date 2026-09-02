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

## 2 · CURRENT STATUS — measured 2026-09-01, re-measure before use

| Fact | Value | How to re-measure |
|---|---|---|
| `origin/main` | `c35adc60` | `git rev-parse --short origin/main` |
| Branch state | level with main, tree clean | `git rev-list origin/main..dev_branch_yh --count` |
| `apps/web` tests | **GREEN — 282 files, 3634 tests** | `cd apps/web && pnpm exec vitest run` |
| `apps/api` + `shared` | **GREEN — 130 files, 2590 tests** | `pnpm --filter @carres/api --filter @carres/shared test` |
| Typecheck | clean | `pnpm -r typecheck` |
| Lint | passes (Stage 1, warn-only) | `pnpm -r lint` |
| Migration filenames | 418 validated | `node scripts/check-migrations.mjs` |
| Migration tail, ALL branches | **0409** → next free is **0410** | the rename-safe command in §4 |
| On `main` | `0393`–`0409`, plus `0398a` | `ls supabase/migrations` |
| Production | **2 commits behind, deploys queued** | `EXPECTED_SHA=$(git rev-parse origin/main) node scripts/verify-production.mjs` |

**On production lag:** all five surfaces agreed on `e70cac31` while `#1004`'s
deploy had been in-progress 21 minutes and `#1006`'s was cancelled by a newer
push. Queued deploys, not a failure. `verify-production.mjs` polls for 15
minutes by default; set `CONVERGENCE_TIMEOUT_MS=1` for a single pass that
reports what each surface currently serves.

**The ten red `os-card-*` tests are FIXED** (`8bfa1099`, `#1002`/`#1003`). They
were never a product bug — see §3.7. Do not go looking for them.

### Shipped by this lane, merged and live

| Migration | What it does |
|---|---|
| `0391` | Office create requires a Proceed date; a blank one may be filled ONCE, then locks |
| `0393`/`0394` | Stair carry is a real `STAIR_CARRY` add-on row, stamped at birth and re-stamped when floor/lift/count move |
| `0395` | A misclicked service can be removed — same gates as the edit door, no reason demanded |
| `0406` | A computed fee is not a pickable service — the doubling bug, closed at UI **and** database |
| `0409` | Layer ④ Carres Execution — in what ORDER the goods move. Completes Loo's four-layer claim model; **applied by YH 2026-09-01** |

Plus, without a migration: the office add-on door (`SalesOrderAddons.tsx`) · the
FK guard that stops a missing migration blocking a sale · one name for the
delivery fee · the two POS delivery-fee inputs withheld · one absence word
(`Not recorded`) · goods-row alignment · Money card one size · `Change delivery
date` · the building-type gate · duty work reaching Finance and Delivery ·
`Preview PDF` retired · `Copy to a new Sales Order` retired · the stair-count
clamp · ~20 banned words removed across Workspace, Revisions and Order Route ·
Revisions/History loading and error guards (a 403 used to render as "No
revisions recorded") · the Order Route asking the shared money predicates
instead of re-deciding them.

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

## 6 · OPEN WORK, in order

**Closed since this file was written:** Layer ④ (Carres Execution) is BUILT —
migration `0409`, applied by YH 2026-09-01. Loo's four-layer claim model is
complete, and the argument Purchase Returns (§9.6) and Repair Orders (§9.7) were
frozen on now exists. **Both are still unbuilt**; they are unfrozen, not
delivered, and each is a register with its own numbering, PDFs, handover proof
and custody moves. The audit's 818-line correction pass also landed, from
another lane.

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

2. ~~**`SO Date` is unregistered and contradicts the dictionary.**~~ **CLOSED
   2026-09-01 — YH ruled REGISTER, not revert.** `SO Date` is now a `Use
   exactly` row in `docs/COPY-STANDARD.md`, and the Order Route table that
   ruled `Ordered: {date}` for the same fact prints `SO Date: {date}` with it.
   `Ordered` and `Ordered Qty` stay Purchasing's words, which is the reason the
   tie broke this way: a Purchase Order is *Ordered* when it reaches the
   factory, and one word for two modules' facts on one operator's screen is how
   a header stops being trusted.
   **The reading lesson, kept because it is the reusable part:** the rename
   shipped on five surfaces and nothing anywhere checked it against the
   dictionary, so the contradiction survived five days in plain sight. No gate
   reads COPY-STANDARD. Until one does, a rename is only as good as the person
   who remembers this file exists.

3. **The instalment-months 500.** `orders_installment_months_chk` allows
   NULL/6/12 and nothing above the database knows. A proposal of 9 saves fine and
   fails at the **principal's** Approve press with raw constraint text on screen.
   The bound is verified; the refusal **sentence** needs a ruled word from YH.

4. **Migrations `0395`–`0406` are probably unapplied.** YH applied through `0394`
   by hand. `0395` is the one the office add-on door needs. Run the tracker query
   and apply what is missing.

5. **The stair-carry backfill has not been run.** `pnpm backfill:stair-carry`
   (dry run), `-- --apply` to write. **YH's to run** — it needs the service-role
   key and it changes money on existing orders.

6. **Still open from the audit** (re-measured 2026-09-01): F-7
   (`building_type` — see item 7) · F-11 (the promised date is guarded by one
   layer, not two) · F-12 (`update_order` freezes six delivery fields after
   Proceed; the office door does not) · F-13 (the floors evaluator is blind to
   seven fields) · F-14 (`sales-order-copy.ts` is dead code — its only importer
   is its own test; **deleting it is the owner's call**, red line 5).
   **CLOSED since this list was written:** F-8 (floor bounds — the office door
   now carries the same 1-to-3 the POS does) · the emergency-contact
   parts-direction round-trip.

7. **`building_type` — DECIDED, PARTLY UNRULED, DELIBERATELY NOT BUILT.**
   The business rule is not missing and never was. `COPY-STANDARD.md` §"The
   delivery window words" carries Jess's locked map of 2026-07-27 — `Landed` ·
   `Retail` take a full day, `Condo` · `Apartment` · `Office` take a half day,
   and `Other` / not filled takes a full day **with the booking refused until it
   is filled**. Loo made the field mandatory at go-live on 2026-07-28 and set a
   Saturday capacity weight of `Landed = 1 · Condo = 0.5`. Jess made it required
   on both doors on 2026-08-21.

   **YH confirmed 2026-09-01: `Other` follows Jess's row — it does not satisfy
   the requirement.** Today it does: both create doors accept `Other` as filled
   (`draft.ts`, `SalesOrderWorkspace.tsx` both test only for emptiness).

   ⛔ **AND THE ENFORCEMENT IS STILL NOT BUILT, on purpose.** Nothing in the
   codebase turns a building type into a delivery window: a grep for half-day /
   full-day / slot length across every `.ts`, `.tsx` and `.sql` returns the two
   refusal SENTENCES and nothing else. The field is free text inside
   `entry_data->fields` with no column and no CHECK, and the only branch on it
   anywhere (`EditDelivery.tsx`) matches `condo|apartment|flat|serviced` — two
   words that are not legal options, and it misses `Office`, which is half-day.

   **THE OWNER HAS STOPPED THIS DELIBERATELY (YH, 2026-09-01), and the reason is
   the right one:** the parts nobody has ruled cannot be guessed, and building
   the ruled half alone would put a half-finished rule on the delivery calendar.
   What is genuinely unruled:

   - **What a half-day IS, in slots.** `DELIVERY_TIME_SLOTS` offers four windows
     plus `Anytime`; none of them is half a day. Which windows may a half-day
     take, and does full-day mean `Anytime`?
   - **The Saturday weight's denominator.** `Landed = 1 · Condo = 0.5` had
     nothing to count against when Loo wrote it. ⚠️ **That may have changed on
     2026-09-01:** the Delivery lane added a per-partner `dailyCapacity`, and
     `delivery-calendar.ts` counts every booking as exactly 1 against it — which
     is where a weight would go. Two gaps remain: the table names only `Landed`
     and `Condo`, so Apartment/Office/Retail/Other have no weight; and Loo ruled
     SATURDAY while capacity applies to every day.
   - **A third create door.** Jess ruled "both doors". `PrincipalNewOrder.tsx`
     never asks for building type at all.
   - **Orders with no address.** Both doors skip the building-type gate when
     `customer_address_unknown` is set. Nothing covers what happens when one
     reaches booking.

   **Do not build any of the above from inference.** The column and its CHECK
   are the only part that is fully ruled, and they are not worth a migration on
   their own until the window rule that reads them exists.

## 7 · EXACT NEXT STEP

Ask YH which item in §6 he is releasing, and recommend **① the stale stair fee**
— it is the only 🔴 on the list, it is a live money defect in code this lane
shipped, and it is small. If he releases nothing, stand by. **Do not invent
work.**

Do NOT start Purchase Returns or Repair Orders on your own initiative just
because Layer ④ unfroze them. Each is a full register — numbering, PDF issue,
handover proof, custody moves, Finance credit reads — and §9.6/§9.7 are page
blueprints, not build scopes. They need YH to release them.

---

*Written 2026-09-01 at `origin/main` = `c35adc60`. Status lines decay within
days in this repo — measure, do not recite.*
