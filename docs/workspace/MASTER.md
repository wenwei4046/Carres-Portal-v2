# WORKSPACE — MASTER

> **APPROVED / LOCKED by Jess, 2026-09-03.** This is the single owner for ERP Staff & Duties,
> action/approval owner resolution and buddy cover. Modules reference duties; they never duplicate
> people assignments.

## 1 · Mission

Workspace answers: who holds each ERP duty today, who covers an absence, and who actually acted?
It does not own module records, business completion facts or a universal owner for an SO/PO/etc.

## 2 · Duty contract

```text
Work/approval type → owner duty → primary holder → today's buddy cover → actual actor
```

Every action preserves trigger, owner rule, resolved owner, action, completion fact, due, source
object and cover rule. Reassignment changes future/current resolution but never historical actors.

A duty is specific enough to express authority: Payment Duty, Storage Waiver Approver, Payment
Approver, Purchasing Approver, Delivery Charge Approver, Stock Adjustment Approver and Service Case
Approver are separate duties. There is no single ERP Manager owner.

## 3 · Settings UI

`Workspace → Staff & Duties` is the one assignment surface. An authorised manager can:

- assign one primary holder;
- assign an optional buddy cover and effective absence period;
- reassign a duty to a future manager without code changes;
- view current/future coverage and immutable assignment history.

Modules may link here but cannot render a second staff picker. Module Settings chooses which duty a
rule requires, not which named person currently holds it.

## 4 · Resolution and display

- Normal day: work resolves to the primary holder.
- Covered day: work appears to today's cover while preserving the normal owner.
- History: records normal owner, cover when applicable, actual actor, decision and time.
- My Work omits the current person's repeated avatar.
- Team Work groups by owner avatar/name.
- Avatar initials are metadata; names appear on hover, never inside the action sentence.

## 5 · Permissions and safeguards

Only governed manager authority changes assignments. A staff member cannot assign themself a duty
or approval power. A missing required holder is an explicit configuration exception, never silent
fallback to an email address or arbitrary manager. Duty and cover changes are effective-dated and
audited with old/new value, actor and time.

## 6 · Payment binding approved 2026-09-03

Jess currently holds `Storage Waiver Approver`. A future manager replaces Jess through this page.
Payment stores only the rule that mattress/bedframe free-storage requests on total days 22–30 need
that duty. The approver's name is never hard-coded in Payment.

## 7 · Done-when

One duty registry resolves actions/approvals across ERP; every module reads it; cover changes daily
work without changing history; module-local person lists and hard-coded names are absent; and UI
renders the shared owner contract consistently.
