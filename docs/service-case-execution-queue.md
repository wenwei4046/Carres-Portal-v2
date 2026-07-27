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

**Done when:** closing a case requires all its tasks closed + customer-confirmed.

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

## S5 · Monthly numbers that answer WHY

**Goal:** the counts Jess keeps by hand (per category per month), now derived — plus the
breakdown Excel can't do: issues by type per category, by supplier, avg days to close,
SLA hit rate. A small `Numbers` tab on the module; no new tables — read the cases.
**Done when:** "which supplier / which issue type causes the most cases" is one glance.

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
| S4 | ⬜ | — |
| S5 | ⬜ | — |
