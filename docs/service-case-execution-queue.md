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

## S2 · Evidence checklist per issue type — no evidence, no case

**Goal:** step 3's answer decides the REQUIRED uploads, shown as a tick-list with plain
instructions (e.g. Colour uneven → customer WhatsApp screenshot · overall photo ·
close-up ×2 · SKU label · 10-20s video "从左到右慢慢拍"). Submit is disabled until
required items are ticked; every file is stamped who-uploaded + when.
Checklists live as ONE shared constant (like T4's reasons) — NOT a config table.
**Done when:** submitting without required evidence is impossible; each file shows its
uploader role in the case view.

## S3 · The case drives the follow-ups

**Goal:** on submit, the system creates the next steps instead of the staff remembering:

- issue needs the supplier → a **supplier claim** stub (links to R-series when it ships;
  until then, a task row on the case: `Chase SUPPLIER — replacement/parts/repair`)
- item must come back → logistic collect task; repaired/replaced → redeliver task
- each party sees only its own task; the case shows the whole chain as a timeline
  (`Complaint → Collected → At supplier → Repaired → Redelivered → Closed`)

**Done when:** closing a case requires all its tasks closed + customer-confirmed.

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
| S1 | ⬜ | — |
| S2 | ⬜ | — |
| S3 | ⬜ | — |
| S4 | ⬜ | — |
| S5 | ⬜ | — |
