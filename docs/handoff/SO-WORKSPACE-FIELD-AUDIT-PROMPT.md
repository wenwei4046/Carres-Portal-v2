# HANDOFF PROMPT — Sales Order Workspace, line-by-line field audit

Paste everything below the line into a fresh session. It is self-contained.

---

CARRES PORTAL v2 — SALES ORDER WORKSPACE FIELD AUDIT
Repo `C:\Users\User\Desktop\Carres\Carres-Portal-v2` · branch `dev_branch_yh`
Lane: **REVIEW**. You report; you do not fix unless YH asks in that session.

## THE ONE SCREEN

`https://erp.carresofficial.com/operation/orders/so/:orderId` — the Sales Order
Workspace, rendered by `apps/web/src/pages/operation/SalesOrderWorkspace.tsx`.
The same component serves `/so/new`. **Audit both modes.** Nothing else is in
scope: not the register, not the POS, not Order Route, not Delivery.

Note: bare `/operation/orders/so` has no route — the live URLs are `/so/new`
and `/so/:orderId`. Confirm which YH means if it matters.

## WHY THIS EXISTS

YH's words: *"Sales need to be very clear to fill all the stuff — ensure me as a
tech person, as a sales person and operations team member should be able to work
with everything without issue"* and *"ensure I can answer everything in the flow,
every word, line, column and option."*

So the deliverable is not a bug list. It is **a screen where every single thing
a human can see or touch has a known, defensible answer** — and an explicit list
of the ones that do not.

## READ FIRST, IN THIS ORDER

1. `CLAUDE.md` — the constitution. Red lines §5 are absolute.
2. `docs/orders/MASTER.md` — especially §THE MERGED ORDER TAB.
3. `docs/COPY-STANDARD.md` — **every visible word must be in here.** A word that
   is not is a finding, not a style preference.
4. `docs/ERP-ARCHITECTURE.md` §3.1 and the four ownership laws.
5. `docs/01-design-tokens.md` only when a spacing/colour question arises.

## THE METHOD — one pass per field, no skipping

The Order tab is FOUR cards (locked, do not re-litigate):
`CUSTOMER` (+Delivery address +Emergency contact) · `MONEY` ·
`ORDER INFO` (+Sales ownership) · `GOODS`.

Walk them **in render order**. For every label, input, button, link, column
header, placeholder, empty-state string, helper note and dropdown option,
produce one row:

| # | What the user sees | Card | Control | DB column / source | Writable? | Who may write | Governed word? | Verdict |

- **What the user sees** — the exact string, copied, not paraphrased.
- **DB column / source** — trace it. `orders.customer_phone`, a computed value,
  a join, or `DERIVED`. If you cannot trace it, write `UNTRACED` — never guess.
- **Writable?** — read-only / editable / editable-before-proceed / amendment-only.
- **Who may write** — role gate AND the API/RPC gate. **If the UI gate and the
  API gate differ, that is a finding** (a UI must mirror its API's gate, never
  invent a second policy).
- **Governed word?** — `COPY-STANDARD:<line>` or `NOT REGISTERED`.
- **Verdict** — `OK` · `🟡` · `🔴`, with one sentence.

## VERIFY AGAINST THE DATABASE, NOT AGAINST THE TYPES

YH asked you to *"read each line and ask the database."* TypeScript types drift
from the schema. For each traced column, confirm it in `supabase/migrations/`
(the column's real type, nullability, default, and any check constraint or
trigger). Where a value is computed, find the ONE arithmetic and name it — and
if you find two arithmetics that currently agree, that is a 🔴 under ownership
law D, even though nothing is visibly wrong today.

## KNOWN-OPEN — do not re-derive these, and do not close them

- An old revision renders **typable** fields under `Viewing Rev n · read-only`.
  Recorded in `docs/carry-forwards.md`. No writer exists, so no data is at risk;
  the hazard is that an operator can type into a photograph.
- `<Money>` re-declares 13px on its numeral, so `MASTER.md:1150`'s weighting
  ruling (*Total large · Paid medium · Outstanding loudest*) never reaches the
  screen. Shared component — it changes everywhere at once or surfaces disagree.
- **Add-ons cannot be amended.** `amendmentSubmitInput` is `.strict()` over four
  keys and add-ons are not among them, while the governing doc files them as
  Class A. See the separate add-on task; do not fold it into this audit.
- Copy to a new Sales Order was **retired 2026-08-28** (Jess). If you find any
  surviving reference, that is a finding.

## THE THREE READERS

Answer each field for all three, because YH named all three:

- **Tech** — where does it live, what writes it, what breaks if it is null?
- **Sales** — what do I type here, and what happens if I get it wrong?
- **Operations** — can I trust this number, and may I change it?

A field that only one of the three can answer is a 🟡.

## RULES THAT HAVE BITTEN THIS REPO

- **Tests pin INTENT, not spelling.** If you propose a change, say which test
  pins the old intent and what the surviving invariant is. Never propose
  deleting a test.
- **A shared function changes in every caller at once**, or the surfaces disagree.
- **Never number a migration from `ls`.** Not that you should need one here.
- `docs/orders/MASTER.md` outranks a migration's column comment when they
  disagree (the `0104` stair-carry precedent).

## DELIVERABLE

One markdown file, `docs/audits/SO-WORKSPACE-FIELD-AUDIT.md`:

1. The full table, in render order. Completeness is the point — a field left out
   is the failure this audit exists to prevent.
2. **`UNTRACED`** — every field whose source you could not establish, and what
   you tried. This list being honest matters more than it being short.
3. **`NOT REGISTERED`** — every visible word absent from COPY-STANDARD.
4. **`GATE MISMATCH`** — every place the UI gate and the API gate disagree.
5. **Questions for YH** — only genuine business decisions, each with: what you
   searched, why authority did not settle it, the options, your recommendation,
   and the operational consequence. If you cannot fill that shape, it is not a
   YH question — resolve it yourself.

Do not open a PR. Do not change application code. Report.
