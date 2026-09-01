# HANDOFF PROMPT — Sales Order lane, continuation from 31 Aug 2026

Paste everything below the line into a fresh session. It is self-contained.
**Re-measure before trusting any status line in it** — this document was true at
`origin/main` = `57ceb227`, and this repo moves several times a day.

---

CARRES PORTAL v2 — SALES ORDER LANE, CONTINUOUS BUILD
Repo `C:\Users\User\Desktop\Carres\Carres-Portal-v2` · branch `dev_branch_yh`
Lane: **BUILD/DELIVERY**. You ship. Report to YH only for a business rule.

## 1 · GOAL

The Sales Order Workspace (`/operation/orders/so/new` and `/so/:orderId`) must be
a screen where **every visible thing has a defensible answer** for three readers
at once — Tech (where does it live, what writes it), Sales (what do I type, what
happens if I get it wrong), Operations (can I trust this number, may I change it).

That was audited in full on 2026-08-28. The audit is
`docs/audits/SO-WORKSPACE-FIELD-AUDIT.md` — 103 rows in render order, plus its own
correction pass. **Your job is the open items in it, not a re-audit.**

## 2 · CURRENT STATUS — verified 2026-08-31, re-verify before use

Everything below is **merged and live in production** unless marked otherwise.

| Shipped | What it does |
|---|---|
| `0391` | Office create requires a Proceed date; a blank one may be filled in ONCE, then locks |
| `0393`/`0394` | Stair carry is a real `STAIR_CARRY` add-on row, stamped at birth and re-stamped when floor/lift/count move |
| `0395` | A misclicked service can be removed — same gates as the edit door, no reason demanded |
| `0406` | A computed fee is not a pickable service — the doubling bug, closed at UI **and** database |
| — | ~20 banned words removed across Workspace, Revisions ledger and Order Route |
| — | Revisions/History gained loading + error guards (a 403 used to render as "No revisions recorded") |
| — | The Order Route asks the shared money predicates instead of re-deciding them |

**Three owner rulings are LAW in `docs/orders/MASTER.md`** (YH, 2026-08-28):
stair carry is money the customer owes · a date never recorded is not a date that
is locked · the delivery-payment approver is the principal only, and that is
explicitly marked CHANGEABLE.

## 3 · KEY DECISIONS, AND WHY

Read these before proposing anything — several were argued and settled.

1. **The wrapper pattern is how this lane changes a mature RPC.**
   `0385` → `0391` → `0395` → `0406` all do the same thing: `alter function …
   rename to …_unchecked_NNNN`, then a same-signature wrapper that guards and
   delegates. The mature body is preserved **byte-for-byte**, so no existing
   guard can be dropped by accident. Copying a 600-line body to add one `if` is
   how a guard goes missing.

2. **A hidden button is not a rule.** Every refusal lives in the database; the
   screen merely declines to offer a door that would 422. This was learned twice
   — `0395` did it right, and the doubling bug happened precisely because
   `Add one more` was gated only in the UI's sibling and nowhere at all in SQL.

3. **A duplicated list is the defect, not the missing entry.** `0258` spelled the
   server-computed add-on keys out three times, which is why the fourth key was
   added to none of them. `0406` replaced the list with
   `public.addon_is_server_computed(text)`. Prefer killing the duplication over
   patching each copy.

4. **Tests pin INTENT, not spelling.** Roughly twenty assertions were re-pinned
   across this work and **none was deleted**. When a ruled word changes, keep
   every assertion that carries the intent and replace only the literal. Say
   which invariant survives, in the commit.

5. **Create-mode and object-mode are different money states.** On `/so/new` there
   is no persisted add-on row, so the MONEY card and the draft PDF synthesise the
   stair line; on a saved order the real row exists and adding it again would
   **charge the carry twice**. Contract tests pin exactly that split. Do not
   "simplify" the two branches into one.

6. **The lock is on the ANSWER, never on the emptiness.** Jess's read-only rule
   for Proceed date stands; filling a blank is completion, not an edit.

## 4 · CONSTRAINTS

- **`CLAUDE.md` red lines are absolute.** In particular: never alter a committed
  migration (write a new one) and **never number a migration from `ls`** — take
  the MAX of the repo tail, every branch, and the production tracker. `0391`
  collided twice in one afternoon because main moved underneath a branch.
- **Migrations are applied BY HAND.** Code has reached production ahead of its
  migration before, and it broke order submission. Never assume a function
  exists because its file does.
- **The migration tracker cannot be queried from the repo.** Ask YH; `version` is
  a timestamp and the `0NNN` lives in `name`.
- **A word not in `docs/COPY-STANDARD.md` may not appear on screen** — and check
  the *Do NOT use* column too, not only whether the word is absent. Two findings
  were marked OK because only absence was checked.
- **Three sessions share this clone.** Work in your own `git worktree`, stage by
  filename, and re-measure `origin/main` before and after. Do not touch another
  lane's branch.
- **Gate before every push:** `pnpm -r typecheck` · `pnpm -r test` ·
  `pnpm -r lint` · `node scripts/check-migrations.mjs`.

## 5 · WHAT TO AVOID

- **Do not re-run the field audit.** It exists, it has been corrected once, and a
  second sweep will re-report closed items.
- **Do not touch the Purchasing lane** (`docs/purchasing/MASTER.md`, anything
  `Manual Purchase` / `GRN` / `PO`). Another session owns it and had ~112 commits
  in three days.
- **Do not "fix" the `delivery_payment_approver` UI to read the duty.** The duty
  key was never created, so the gate is already identical to principal-only. It
  is refuted in the audit at §5 G-4 and ruled CHANGEABLE in the MASTER.
- **Do not propose a backfill.** `CLAUDE.md` §6 — every row today is test data.
- **Do not invent customer-facing words.** Two open items are blocked on a ruled
  sentence and must stay blocked rather than be guessed.
- ⚠️ **`apps/web/src/pages/dealer/pos/OrderStatusPage.test.tsx` fails on clean
  `main`** and is **not** yours. It is date-dependent (cards filtered relative to
  today), so CI may be red for a reason unrelated to your change. Verify by
  stashing before you debug it, and leave it to the POS lane.

## 6 · EXACT NEXT STEP

**Push the audit's correction pass to `main`. It never landed.**

`origin/main`'s copy of `docs/audits/SO-WORKSPACE-FIELD-AUDIT.md` is **680 lines**
and stops at `## 9`. The corrected **818-line** version — carrying `## 0-B` the
refutation round, `## 10` the child components, `## 11` Route/Revisions/History
and `## 12` the G-2b gate finding — is committed on the merged branch
`docs/so-audit-and-three-rulings` at `66e2d472` and was never PR'd a second time.

Until it lands, anyone reading the audit on `main` gets the **uncorrected first
pass**, which still says `Add item` and the building-type toast are OK (both are
banned words) and still lists G-4 as a live gate mismatch after it was refuted.

```bash
git log --oneline origin/docs/so-audit-and-three-rulings -3
```

Cherry-pick `66e2d472` onto a fresh branch off `main`, verify the file is 818
lines and contains `REFUTATION ROUND`, and open the PR. Docs only, no gate risk.

### Then, in this order

1. **`SO Date` is unregistered and contradicts the dictionary.** Commit `11e11ca2`
   renamed `Ordered` → `SO Date` on five surfaces without a COPY-STANDARD entry,
   and **`COPY-STANDARD:1758` still rules `Ordered: {date}` for that exact fact**.
   Shipped code now breaks the dictionary it is ruled by. Register `SO Date`
   against `orders.placed_at` and retire the old row.
2. **The stair fee goes stale when goods change.** `restampStairCarry` is called
   from three header-driven places only; `touchesStairInputs` watches floor, lift
   and count — never the lines. Add goods to a clamped order and the working-out
   sentence recomputes live while the stored fee does not. One screen, two
   numbers — the defect the stair Card was opened to close.
3. **The instalment-months 500.** `orders_installment_months_chk` allows NULL/6/12
   and nothing above the database knows. A proposal of 9 saves fine and fails at
   the **principal's** Approve press with raw constraint text on screen. The
   bound is verified; the refusal **sentence** needs a ruled word from YH first.
4. **Still open from the audit:** F-7 (`building_type` decides delivery slot
   length and has no column, no constraint), F-8 (floor bounds disagree across
   UI/API/DB), F-11 (the promised date is guarded by one layer, not two), F-12
   (`update_order` freezes six delivery fields after Proceed; the office door does
   not), F-13 (the floors evaluator is blind to seven fields), F-14
   (`sales-order-copy.ts` is dead code with zero callers), and the emergency
   contact parts-direction round-trip.

---

*Written 2026-08-31 at `origin/main` = `57ceb227`. Status lines decay fast in this
repo — measure, do not recite.*
