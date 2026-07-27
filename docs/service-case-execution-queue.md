# Service Case execution queue — ONE CARD PER CHAT (locked with Jess 2026-07-27)

> **How to use (Jess):** new chat, paste:
> "Read `docs/service-case-execution-queue.md`. Do card S<n> ONLY. Do not touch any other
> card. Do not redesign anything marked ALREADY EXISTS."
>
> **Source:** Jess's design conversation — the Service Note / Issue Tracker pain: staff
> cannot fill free-text forms ("What happened" 每个人写法不同), so the system asks guided
> questions one by one, demands evidence per issue type, and auto-creates the follow-up
> tasks. Principle: **Guide, don't ask. No evidence, no service case.**
>
> **Sidebar home: Service Cases (EXISTS — upgrade in place, no new menu item).**

## Ground truth (read before ANY card)

- **Service Cases module is LIVE**: `OperationServiceCases.tsx` (list, All/Ongoing/Closed,
  case type + status classify) + `ServiceCaseModal` + printable **Service Note dispatch
  order** (P2). The wizard REPLACES the modal's free-form entry — it does not replace the
  list, the statuses, or the Service Note.
- **These tables hold Jess's REAL data — never bulk-delete as test data.**
- Guarantee claim desk is live (Operation → Guarantees) — a guarantee claim is NOT a
  service case; do not merge them.
- Copy law: plain words, staff click choices, free text only as optional last field.

## S1 · Case wizard v1 — guided questions replace the essay

**Goal:** "New case" becomes one-question-at-a-time:

1. Who found it? `Customer / Warehouse / Logistic / Supplier / Staff`
2. Which product? (pick the order line — order link comes free)
3. What's wrong? — options DEPEND on category:
   - Mattress: `Wrong SKU · Damaged · Other`
   - Bed frame: `Missing parts · Wrong specification · Wrong colour · Damaged · Other`
   - Sofa: `Missing parts · Wrong specification · Wrong colour · Colour uneven · Damaged · Other`
4. Can the customer still use it? `Yes / Temporarily / No` → **system sets priority**
   (No = High, notify manager); staff never pick priority themselves.
5. What does the customer want? multi-pick: `Repair / Replace / Missing parts / Inspection / Refund`

Wizard writes the SAME case row the modal writes today (issue fields land in structured
columns/attrs, not prose). **Done when:** a new hire can file a complete case without
typing a sentence.

> **SHIPPED 2026-07-27 (PR #397, migration 0285 applied, Worker `290f91f6` + web
> `index-oX_Va0XG.js`).** Notes for the cards that follow:
> - `priority` is a **GENERATED column** derived from `usable` — staff never pick it and
>   no write path is given the ability to. The rule lives twice (SQL + `casePriorityFor`
>   in shared) because the DB cannot import TS; both assert the same three rungs.
> - `what_happened` is **composed** from the five answers (`composeCaseSummary`), so the
>   list column and the printable Service Note kept working untouched. Prose is a render
>   of the structured answers now — do not reintroduce it as a source of truth.
> - The option lists are ONE shared constant (`packages/shared/src/service-case-intake.ts`)
>   mirrored by CHECKs. **S2's evidence checklists key off `issue_type` from that file.**
> - `order_line_id` is ON DELETE **SET NULL** (an ordinary item edit deletes lines);
>   `product_sku` + `product_category` are snapshots so an old case never re-derives.
> - "Notify manager" is a **visible flag**, not a send — no message channel exists in the
>   API yet. S3/S4 must not assume one either.
> - The wizard replaces **CREATE only**; the edit modal shows the intake read-only.

## S2 · Evidence checklist per issue type — no evidence, no case

**Goal:** step 3's answer decides the REQUIRED uploads, shown as a tick-list with plain
instructions (e.g. Colour uneven → customer WhatsApp screenshot · overall photo ·
close-up ×2 · SKU label · 10-20s video "从左到右慢慢拍"). Submit is disabled until
required items are ticked; every file is stamped who-uploaded + when.
Checklists live as ONE shared constant (like T4's reasons) — NOT a config table.
**Done when:** submitting without required evidence is impossible; each file shows its
uploader role in the case view.

> **SHIPPED 2026-07-27 (PR #410 + renumber #419, migration 0289 applied, Worker `0cd3106b`
> + web `index-CD_Zji_Q.js`).** Notes for the cards that follow:
> - The checklist is `packages/shared/src/service-case-evidence.ts` — a global slot
>   registry (`CASE_EVIDENCE_SLOTS`: what a piece of evidence IS) plus
>   `CASE_EVIDENCE_BY_ISSUE` (which slots, how many, required or not). Slot KEYS are
>   what gets stored, so labels and instructions can be reworded without re-tagging a
>   filed case. **S5 can count "cases with no close-up" off one column.**
> - **The card's one unfollowable line, and what replaced it**: it lists a customer
>   WhatsApp screenshot as required for Colour uneven, but that file cannot exist when
>   the WAREHOUSE found the fault before dispatch — and a required item nobody can
>   produce teaches staff to upload a junk photo to get past the gate. So a rule may
>   name the `reporters` it applies to, and the customer-message slot is asked only when
>   question 1 said "Customer". Every issue type still demands at least one file on
>   every reporter (asserted, for all 7 × 5 combinations).
> - **The carton photo is OPTIONAL everywhere it appears** (damaged, missing parts) for
>   the same reason: a complaint raised weeks later has no box left.
> - "Submit is disabled" is the courtesy; the **server refusal is the rule**. `POST /`
>   recomputes `caseEvidenceGaps` from the same shared function the button asks and
>   answers 422 `evidence_missing` naming what is short. S3/S4 must not assume the
>   client gate is the only one.
> - **The stamp is server-side and structurally non-optional**: `at`/`by`/`by_role` are
>   written by the API only, `kind` is derived from the slot registry (never taken from
>   the client), and 0289's `sc_evidence_wellformed` CHECK refuses an entry missing any
>   of them. The DB also holds a FLOOR (`issue_type is not null` ⇒ at least one file)
>   that is strictly weaker than the API checklist, so it can never refuse something the
>   API allows.
> - **The checklist itself is deliberately NOT mirrored in SQL.** Unlike 0285's flat key
>   lists, it is a function of two answers plus per-slot counts — a SQL copy would be a
>   differently-shaped rule that drifts, not a mirror.
> - Files live in a new PRIVATE bucket `service-case-evidence`, 25 MB (the checklist asks
>   for a 10–20s video), **no delete policy and no remove endpoint** — evidence is
>   evidence; a wrong photo is answered by uploading the right one.
> - The wizard is **6 steps** now; step 6 is the tick-list. Uploads are keyed to a
>   client-minted `draftId` because the files must exist before the case does — see CF
>   `case-evidence-abandoned-draft-orphans`.
> - The case view (`CaseEvidenceGallery`) can ADD a file later (the customer sends the
>   photo the next day) via `POST /:id/evidence`, under `case/{id}/`.

## S3 · The case drives the follow-ups

**Goal:** on submit, the system creates the next steps instead of the staff remembering:

- issue needs the supplier → a **supplier claim** stub (links to R-series when it ships;
  until then, a task row on the case: `Call {supplier} — confirm replacement/parts/repair date`)
- item must come back → logistic collect task; repaired/replaced → redeliver task
- each party sees only its own task; the case shows the whole chain as a timeline
  (`Complaint → Collected → At supplier → Repaired → Redelivered → Closed`)

**How a case ENDS depends on who found it (Jess 2026-07-27)** — the same shape as S2's
`reporters` rule: a case the CUSTOMER raised, or one on goods already in their home, ends
with the customer confirming they are satisfied. A case the WAREHOUSE or a supplier found
before the goods went out ends when the fix is verified internally — the customer was never
told, so there is nothing for them to confirm. If such a case DELAYS the customer's
delivery, that is not this case's ending: it opens the delivery-side chain, where logistics
arranges the new date (see `docs/ORDERS-WORKING-FLOW.md`).
**Done when:** closing a case requires all its steps closed, and the ending that matches
who reported it.

> **SHIPPED 2026-07-27 (PR #431, migration 0293 applied, Worker `ccc9616a` + web
> `index-DEsBDZHt.js`).** Notes for the cards that follow:
> - **The steps are DERIVED, not created.** `packages/shared/src/service-case-plan.ts`
>   turns question 5 into the chain (`caseFollowUpPlan`), so there is no task row to
>   forget to create, none to delete, and none that can drift from what the customer
>   asked for. What IS stored is the opposite half — each step's OUTCOME
>   (`service_cases.progress`: the date it happened, stamped with who recorded it).
>   Nothing in this card is a tick-box; every step closes on a fact.
> - The chain, from the wants: repair → supplier date · collect · send to supplier ·
>   check in · redeliver · **replace** → supplier date · collect · redeliver (a
>   replacement does not go to the factory) · **missing parts** → supplier date ·
>   redeliver (nothing comes back — what the customer has is not faulty) ·
>   **inspection** → inspect (a note is mandatory) · **refund** → collect ·
>   **and every case ends on the customer's own word**, including a case with no
>   answers at all.
> - **The close gate is the server's** (422 `case_steps_open`, naming what is left),
>   plus a DB floor: 0293's trigger refuses the transition INTO a closed status
>   without a `customer_confirmed` entry. The floor is strictly weaker than the API
>   gate, and it fires on the TRANSITION only — the one live case (SC2607-01) is
>   already closed and stays editable.
> - **The supplier is nameable today and the PO is not**: prod holds 0 purchase
>   orders but 200 of 205 SKUs carry a `supplier_id`, so the factory is resolved from
>   the SKU at intake, server-side, and snapshotted onto `service_cases.supplier_id`.
>   The label reads `Call Ohana — confirm the repair date`, degrading to "the
>   supplier" only where no name exists.
> - **No supplier-claim row is minted.** R2/R3's `supplier_claims` is keyed to a PO
>   LINE (a receiving problem) and a customer complaint has no PO — cross-linking the
>   two is R3's territory, not this card's. The card's own words are what shipped:
>   the call, with the supplier named.
> - **Two of Law 2's six things are deliberately absent, and S4 owns one of them**:
>   the steps carry no DEADLINE (the 14-working-day SLA is S4; a per-step clock
>   invented here would be a second rule S4 must unpick) and no per-step OWNER
>   (nothing in service cases assigns a PIC; the module is operation-scoped).
>   **Nothing in S3 ever turns red.**
> - `progress` is append-only through `POST /:id/progress` — the generic PATCH never
>   had the field. One outcome per step; a second is refused (`step_already_recorded`).
>   A step OUTSIDE the current plan can still be recorded (the answers stay editable
>   and history must not lie); the plan only decides what is still OWED.

## S4 · 14 working days SLA + at-risk alert

**Goal:** every case shows its deadline (14 WORKING days from report — Sun excluded,
Sat per current business practice; the shared working-day util ships here if T9/T10
haven't built it yet). At day 10 unresolved → `⚠ SLA at risk` on the list + case
(operator informs the customer BEFORE day 14, with a T4-style structured reason).
Special-order parts may extend once — extension recorded with reason.
**Done when:** no case silently passes day 14.

> **SHIPPED 2026-07-27 (PR #449, migration 0298 applied, Worker `ce4f4c9e` + web
> `index-Ds-5K6Ke.js`).** Notes for the card that follows:
> - **The deadline is DERIVED, not stored** — the S3 law applied to the clock.
>   `opened_at + 14 working days`, computed by
>   `packages/shared/src/service-case-sla.ts` on every read, off the working-day
>   engine procurement and delivery T7 already share. There is no `due_at`
>   column to disagree with the rule, and correcting the holiday calendar fixes
>   every case at once. **S5 can therefore recompute any month's deadlines
>   without trusting a stored number.**
> - **The card's own `⚠ SLA at risk` is the one line NOT built as written.**
>   `COPY-STANDARD.md` bans `At Risk` outright and lists `SLA` as a do-not-use,
>   and the four laws outrank a card. The behaviour is exactly what the card
>   asked for; the words are the laws': the FACT is the date plus
>   `4 working days left` / `2 working days late`, and the ACTION is
>   **`Call {customer} — say why it is taking longer`**. A test asserts every
>   visible string against the banned list.
> - **Every event carries the deadline it was made against** (`due`, and an
>   extension's `until`). "The customer has been told" is only ever true about
>   ONE deadline — without that field, moving the deadline would mark the new
>   one as already explained, and the case the extension was created for would
>   be the only case that never gets the second call.
> - The reasons are ONE shared constant (`CASE_DELAY_REASONS`, seven, T4's
>   shape) each carrying a hidden `responsibility` (supplier | carres |
>   customer). Nothing shows it — **it is there so S5 can answer "which
>   supplier causes the most late cases" without a second tagging pass.**
> - **`caseSlaRecordProblem` is ONE function with two consumers** — the
>   disabled button and the Hono route — so the screen can never be more
>   permissive than the rule, or more strict.
> - The extension's LENGTH is a decision the card did not make: it is bounded
>   at one more full period (14 working days) measured against the BASE
>   deadline, so it cannot be walked forward, and a date landing on a Sunday or
>   a holiday moves to the next working day before the bound is checked.
>   **The reason list is not narrowed to special-order parts**: the card names
>   that case and it is the first option, but refusing every other true reason
>   would only get the deadline moved under a false one.
> - **Nothing sends anything.** S1 ruled "notify manager" a visible flag
>   because no message channel exists in the API; the same holds here — the
>   deadline turns the row by itself, on read. There is no cron and no message.
> - Live state at ship: **1 case, closed, opened 2026-06-16** — so no case on
>   file has a running clock and the column is the empty state until the next
>   case is filed.

## S5 · Monthly numbers that answer WHY

**Goal:** the counts Jess keeps by hand (per category per month), now derived — plus the
breakdown Excel can't do: issues by type per category, by supplier, avg days to close,
SLA hit rate. A small `Numbers` tab on the module; no new tables — read the cases.
**Done when:** "which supplier / which issue type causes the most cases" is one glance.

> **SHIPPED 2026-07-27 (PR #474, NO migration, Worker `<pending>` + web
> `<pending>`).** Notes for whoever comes back to this module:
> - **The carry-forward said add a column; the column is not needed.**
>   `case-sla-no-closed-at` wanted `closed_at` in S5's own migration. That is
>   true of the STATUS FLIP and false of the case: S3 (0293) made closing
>   impossible without a `customer_confirmed` entry in `service_cases.progress`,
>   and that entry carries `on` — the BUSINESS date the customer said it was
>   solved, stamped server-side. A `closed_at` column would record the afternoon
>   somebody changed a dropdown. So the finish date is DERIVED
>   (`caseFinishedOn`), the card's "no new tables — read the cases" is kept
>   literally, and the S3/S4 law holds one rung further out.
> - **The cost of that is named, not hidden**: a case closed BEFORE 0293 has no
>   such entry. It lands in `finish.unmeasured`, says so on screen, and is
>   never averaged and never assumed on time.
> - **Every figure carries its own coverage and withholds itself with a reason.**
>   Live there is ONE case — closed, opened 2026-06-16, filed before S1 — so an
>   average off `updated_at` would be a row-touch and an on-time rate would be a
>   coin toss. Both print the reason instead (K5's rule B, inherited).
> - **`unclassified` is a first-class rung, NOT `other`.** `other` is an answer a
>   human picks; "nobody was asked" is a different fact and reads
>   `Filed before the questions`. Folding them would tell Jess her staff keep
>   choosing Other.
> - **The card's `SLA hit rate` is the one line NOT built as written** — the same
>   ruling S4 made. COPY-STANDARD bans `At Risk` and lists `SLA` as a do-not-use,
>   and the four laws outrank a card. The behaviour is the card's, the words are
>   the laws': `Finished on time` · `Average working days to finish`, asserted by
>   a test against the banned list.
> - **Days are WORKING days, not calendar days**, so the average reads directly
>   against the 14-working-day promise it is being judged by.
> - S4's hidden `responsibility` per delay reason is finally READ — "why they ran
>   long" needed no second tagging pass, exactly as S4 predicted.
> - The engine is `packages/shared/src/service-case-numbers.ts`; the route is
>   `GET /api/ops/service-cases/numbers?period=`, reads only, registered before
>   `/:id` (a test proves it is not shadowed). `?tab=numbers` is a real deep
>   link and the no-tab default is unchanged.
> - **NOT re-measured on prod this session**: the Supabase MCP in the build
>   environment is authorised to a different account and has no access to
>   `kfprgpjpaffedghytstl`. The live figures above are S4's, recorded the same
>   day. Nothing in S5 writes, so the risk of that is a stale sentence in this
>   note, not a wrong row in the database.

## LATER

- WhatsApp-side customer updates · quality score per case · decision-tree admin editor
  (the trees are constants until editing them is a real need) · linking to a future
  Warranty module.

## Status

| Card | Status | PR |
|---|---|---|
| S1 | ✅ | [#397](https://github.com/wenwei4046/Carres-Portal-v2/pull/397) · migration **0285** |
| S2 | ✅ | [#410](https://github.com/wenwei4046/Carres-Portal-v2/pull/410) · migration **0289** |
| S3 | ✅ | [#431](https://github.com/wenwei4046/Carres-Portal-v2/pull/431) · migration **0293** |
| S4 | ✅ | [#449](https://github.com/wenwei4046/Carres-Portal-v2/pull/449) · migration **0298** |
| S5 | ✅ | [#474](https://github.com/wenwei4046/Carres-Portal-v2/pull/474) · **no migration** |

**Line ③ COMPLETE: S1-S5.**
