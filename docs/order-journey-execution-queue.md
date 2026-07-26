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
> T-chat at the same time. Parallel with R/S/K lines is fine (index parallel law, 2026-07-27).

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

## J1 · Documents panel + missing check ✅ (PR #385)

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
**Shipped note (PR #385):** ZERO migration, and the card's two rules only reconcile as
THREE states — exists (number + Open) · **cannot exist yet (renders nothing)** · should
exist by now ("missing"). "By now" always reads a real transition, never a guess: dispatch
auto-issues BOTH the invoice and the delivery-order number (0098), a delivered order owes a
delivery photo (0280), a `received` PO owes its supplier DO file. **Live data is why this
matters**: prod holds 56 orders with ZERO invoices, payments, POs, threads, DO numbers,
delivered orders and delivery photos, so a two-state rule would open every order onto six
red "missing" lines; under this rule a raw order shows exactly ONE row, its sales order.
The list is derived from what the drawer already loads and every Open path already existed
— the panel routes rows to them rather than adding a second way to fetch a file, and the
delivery photo is **view-only** here (upload stays in the Delivery card: one upload door).
ONE api field added to an existing select — `purchase_orders.do_file_path` (column since
0030) — because the browser signs the view url itself: the `delivery_orders_read` policy
admits operation + principal outright, so no Worker route carries the file; the web type is
OPTIONAL so this build against an older Worker degrades instead of crashing.
**Two deliberate deviations, both inside DONE WHEN:** (1) it is a tab in the drawer's
utility rail beside Loan / Activity, not a card "near the header" — the 280px left rail
already stacks three cards over a scrolling nav, and that rail's own contract names the spot
for "non-flow utilities"; drawer → Documents → Open is still 2 clicks. (2) a **Delivery
order** row joins the card's six (`orders.do_number` → the DO PDF the drawer could already
print) because DONE WHEN asks for *every* existing artifact. 13 new tests incl. a
banned-word guard (POD / Proof of Delivery / Unscheduled grep 0).

## J2 · Related cases cross-links (both directions) ✅ (PR #389)

**Goal:** the order drawer shows its related cases; each case shows its order.

- Drawer gains `RELATED CASES`: service cases (+ status pill) · guarantee claims ·
  supplier claim/receiving issues when R-series ships them. Click → opens that module
  filtered to the case.
- Service Case modal/list rows link BACK to the SO (open the order drawer).

**ALREADY EXISTS:** service cases carry an order reference — verify the field, do not add
a second link column if one exists. **No migration expected.**
**Done when:** order→case and case→order are each one click; an order with zero cases
shows nothing (not an empty box).
**Shipped note (PR #389):** ZERO migration. **ALREADY EXISTS held** — `service_cases.order_id`
is the link (0210's "permanent key"), and no second column was added; what was missing was
that `order_id` is a **uuid**, so nothing on screen could NAME the order. The API joins
`orders(so)` (verified exactly one FK, so the PostgREST embed resolves unambiguously) and the
new `so` field is **OPTIONAL, not just nullable** — absent = a Worker older than J2 (the link
still works, it travels by id), null = genuinely no order. **The live data decided the design**:
prod holds 56 orders, 1 service case and 0 claimed guarantees, and that one case has
`order_id` NULL with a `ref_no` (TCF0497) pointing at an order wiped in the 06-24 reset. So the
states that had to read well were the EMPTY ones: the drawer's `Cases` tab **renders only when
the order has a case** (a permanent tab reading "0" is exactly the empty box DONE WHEN forbids),
and "Not linked to an order" is a first-class state, not an error. **Claimed guarantees only** —
an active guarantee is cover, not an incident, and `GuaranteeCoverStrip` already shows it;
listing live ones would make every guaranteed order look like it had a problem. A claim that
opened a service case is **ONE row, not two** (same incident). Supplier claims / receiving
issues are deliberately NOT stubbed — a placeholder row would be a promise the data cannot keep
until the R-series ships. **Fixed a real defect found on the case side**: `ServiceCaseModal`
rendered the literal word `"linked"` for any case opened for EDITING, because the SO number was
only ever set by the create-mode lookup — an existing case could name its order only in the
session that created it. Wiring: `?orderId=` narrows in the DATABASE (not fetch-all-then-filter);
`/operation/orders?order=` and `?tab=service-notes&case=` open the far side, each stripping its
param once consumed so closing a drawer returns to the list; the guarantee desk now reads
`?q=`/`?status=` so "filtered to the case" is true rather than just landing on the page, and an
unrecognised status word is ignored. 31 new tests. **NOT done: browser verification** — reaching
the drawer needs a portal login and passwords are not entered; covered by unit tests + live
prod queries instead.

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
| J1 | ✅ shipped 2026-07-27 | #385 |
| J2 | ✅ shipped 2026-07-27 | #389 |
| J3 | ⬜ | — |
