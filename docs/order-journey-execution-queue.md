# Order Journey execution queue — ONE CARD PER CHAT (locked with Jess 2026-07-27)

> **How to use (Jess):** open a NEW chat, paste:
> "Read `docs/order-journey-execution-queue.md`. Do card J<n> ONLY. Do not touch any other
> card. Do not redesign anything marked ALREADY EXISTS."
> One card = one PR = one deploy. Mark ✅ + PR number here when shipped.
>
> **Source:** Jess's design conversation (the "Tier 1, above Dashboard" ruling). The idea:
> one button on the order answers "这张 Order 到底发生了什么？现在卡在哪里？下一步是谁？" —
> documents, cases, attempts, one timeline, missing-item check. READ-ONLY across modules;
> it never processes business.
>
> **Sidebar home: NONE.** Order Journey is a button inside the Orders drawer, not a menu item.
> **Sequencing:** J-cards touch `OrderDetailDrawer.tsx` — never run a J-chat and a delivery
> T-chat at the same time. One chat at a time, always.

## Ground truth (read before ANY card)

- **The drawer already IS half the journey**: route-map spine (goods → delivery → money
  combined timeline, 定稿 rev25) + activity history (0211 trigger writes `order_history`
  automatically — booking fields included) + NOTES auto-dated log. DO NOT build a second
  timeline; the journey view READS these.
- **Documents already exist scattered**: SO PDF · Invoice PDF · Receipt PDF (Payments) ·
  supplier DO photos (`delivery-orders` bucket) · doc numbering law `docNumber()` =
  `PREFIX-DDMMYY-NNNN` (packages/shared) — reuse it, never a new counter.
- **Related records already exist**: `purchase_orders` + `order_supplier_threads` link
  PO↔SO; Service Cases module is live (`OperationServiceCases.tsx`, `/api/ops/service-cases`);
  guarantees desk is live.
- Design law `docs/UI-KIT.md` · copy law `docs/COPY-STANDARD.md` (POD banned → "delivery
  photo"; plain words, no ERP jargon).

## J1 · Documents panel + missing check

**Goal:** a `Documents` section (drawer, near the header): every document this order has,
one row each, clickable to open — and what is MISSING, stated out loud.

```
DOCUMENTS
Sales order    SO-1258        open ↗
Invoice        INV-260726-xxxx open ↗
Receipt        RC-260726-xxxx  open ↗
Purchase order PO-0325 · NETS  open ↗
Supplier DO    photo           open ↗
Delivery photo — missing       (greyed; T6 ships the upload)
```

**Rule:** derived at read time from existing tables/buckets — NO new `documents` table,
NO manual linking. A doc type that cannot exist yet for this order simply doesn't render
(no noise). **No migration expected.**
**Done when:** every existing artifact for an order is reachable in ≤2 clicks from the
drawer; missing rows say "missing", never hide.

## J2 · Related cases cross-links (both directions)

**Goal:** the order drawer shows its related cases; each case shows its order.

- Drawer gains `RELATED CASES`: service cases (+ status pill) · guarantee claims ·
  supplier claim/receiving issues when R-series ships them. Click → opens that module
  filtered to the case.
- Service Case modal/list rows link BACK to the SO (open the order drawer).

**ALREADY EXISTS:** service cases carry an order reference — verify the field, do not add
a second link column if one exists. **No migration expected.**
**Done when:** order→case and case→order are each one click; an order with zero cases
shows nothing (not an empty box).

## J3 · Journey header — current stage · current owner · health

**Goal:** one strip at the top of the drawer answering the three questions in 3 seconds:

```
JOURNEY   Purchase ✓ · Goods ✓ · Booking ● · Delivery · Done
OWNER     Operations — waiting customer confirmation
HEALTH    ⚠ balance RM 1,200 outstanding · ⚠ delivery photo missing
```

- Stage strip READS the existing route-map signals (no new state).
- HEALTH = the missing-check (J1) + PayHold + Delay Radar (T3) rolled into ≤3 lines.
**Done when:** the strip agrees with the ladder/queues for the same order, always;
zero new writes.

## LATER (no card = not planned)

- **AI order summary** (the 30-second paragraph) — after J3, only if Jess still wants it.
- **Dependency check on delete/close** ("this PO has a GRN + claim — cannot delete") —
  FK constraints already block most of this at DB level; surface friendly messages when a
  real incident shows the need.
- **Full-screen relationship map / Case Explorer page** — J1-J3 inside the drawer first;
  a dedicated page only if the drawer version proves too small in live use.

## Status

| Card | Status | PR |
|---|---|---|
| J1 | ⬜ | — |
| J2 | ⬜ | — |
| J3 | ⬜ | — |
