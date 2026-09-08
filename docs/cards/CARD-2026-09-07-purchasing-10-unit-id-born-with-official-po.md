# 【PURCHASING】 — CARD 【10】 · UNIT ID BORN WITH OFFICIAL PO — TRACEABLE GOODS AND QUANTITY GOODS

Module: Purchasing (× Catalog × Stock × Receiving) · Sequence: 10
Pages: Catalog (SKU Master · New SKU) · SO Batch Purchase · Manual Purchase · Purchase Orders object · official PO PDF · Receiving · Warehouse count
Status: BUILT / PROBED — awaiting the governed production migration-apply approval
Lane: BUILD / DELIVERY
Start from: `origin/main` `a5b39b25` in a fresh dedicated worktree
Production at start: `72779db7` (an ancestor of `a5b39b25`; three newer merges were mid-deploy)
Expected migrations: THREE forward-only migrations — `0442` → `0443` → `0444`, applied in that order
Owner approval needed: the migration apply only. Implementation, tests, PR, merge, deployment
and verification are engineering's and do not return to the Owner.

Sequence note: `09` is claimed by `CARD-2026-09-06-purchasing-09-supplier-claims-ui.md` on the
open `codex/claims-case-delivery` branch, so this Card takes `10` rather than reusing a number
another lane is already building under.

---

## 1 · Owner-approved outcome (2026-09-07)

When an official Purchase Order is created, the PO number and all required Carres Unit IDs are
born **in the same transaction**.

- This applies only to goods Catalog governs as **exact-unit traceable**.
- Governed **interchangeable** goods stay quantity-scoped and never receive fake Unit IDs.
- Purchasing shows the same Unit IDs in the PO object and in the official supplier PDF.
- Receiving **verifies** the identities Purchasing created. It never creates, replaces or
  renumbers one.
- Every issued Unit ID is permanent: never deleted, reused, reset or renumbered.

The main Purchase Orders register stays **one row per PO** and gains no Unit ID column — one PO
carries many goods and many Units. Unit IDs live in the opened PO's `Document → Goods lines` and
on the official PO PDF.

---

## 2 · The eight defects, and what each one now does

| # | Measured defect | Corrected by |
|---|---|---|
| 1 | Catalog had no per-SKU field saying whether stock is tracked by exact Unit or by quantity | `product_skus.stock_identity_mode` (0442), stored and audited |
| 2 | PO creation allocated `qty` Unit IDs for **every** positive line | the birth is gated on the line's snapshotted mode (0443) |
| 3 | Units were linked by PO number + SKU, never `po_line_id`; duplicate-SKU lines shared or showed the wrong IDs | `ops_stock_items.po_line_id`, immutable (0442), and every reader moved onto it (0443, API, web) |
| 4 | `allocate_unit_id()` was EXECUTE-granted to `authenticated` (and `anon`) | revoked from every client role (0442); only the SECURITY DEFINER PO authority allocates |
| 5 | Receiving could generate missing Unit IDs later through the legacy allocator | both shortfall mints removed (0444); a short exact-unit line is refused by name |
| 6 | Receiving could take the quantity path by omitting the Unit array | the snapshotted mode decides, at the validator **and** at the engine (0444) |
| 7 | The PO PDF used `Item ID` | the heading is `UNIT ID`; a source-scan test fails if `Item ID` returns |
| 8 | MASTER passages contradicted the traceable-vs-quantity rule | overwritten in place (§6) |

**Two further defects were found while building, and are corrected here.**

- 🔴 **The destination trigger was voiding the printed IDs.** `trg_po_units_follow_destination`
  (0366) voided every incoming Unit at commit whenever the PO's Deliver To was not a Carres-owned
  warehouse, and re-minted `id-…` codes when it was. Measured on production 2026-09-07: **39
  official `U…` IDs already printed on supplier PDFs had been voided**, and **35 open traceable
  lines had zero incoming Units left**. 0443 replaces the trigger — Units follow the PO's booked
  warehouse and are never voided or minted by destination — and its preflight restores each
  short line's own voided `po_mint` IDs, the exact identities the supplier's paper already
  carries. It restores nothing else and stops if a line cannot be made whole from its own IDs.
- 🔴 **A revision left the ledger behind.** `purchasing_revise_po` changed `qty` and touched no
  Unit: a grown line had fewer IDs than pieces, a shrunk line kept IDs for pieces no longer
  ordered. Growth now allocates only the additional Units; reduction retires the surplus
  not-yet-received Units (newest first) without deleting or reusing an ID.

---

## 3 · The data authority

`product_skus.stock_identity_mode` — `exact_unit` · `quantity` · NULL.

NULL means **Catalog has not said**, and official PO issue refuses that SKU by name:
`Set the stock identity (Unit ID or Quantity) for {sku} in Catalog before issuing a PO`. Nothing
chooses for it.

The mode is **stored truth**. No module derives it at runtime from supplier, delivery
destination, SKU text, `pos_active` or category. Category decided **once**, in the audited 0442
classification, where the existing authority makes the answer deterministic (Stock MASTER §3;
0368 §1): mattress · bedframe · sofa are traced one by one; accessories are interchangeable.
Service and guarantee SKUs are not physical goods and stay NULL. Every mode fact — the one-time
classification and every later Catalog edit, with its actor — is written to the append-only
`product_sku_identity_history`.

Catalog states the mode on the SKU grid and on `+ New SKU`; the form's default comes from the
category and the keyer confirms it, but only the stored value is authority.

---

## 4 · PO issue

One PO-creation authority, two governed entrances (SO Batch Purchase · Manual Purchase), both
through `purchasing_issue_pos_batch` → `_operation_create_po_inner`.

1. Every line's Catalog mode is resolved and checked **before a PO number is drawn**.
2. The number, the lines (each snapshotting its mode) and every required Unit are one transaction.
3. An exact-unit line is born with exactly one permanent Unit ID per ordered piece, for **every**
   governed destination.
4. Every Unit is bound to its immutable `po_line_id`.
5. A quantity line is born with zero Unit IDs.
6. Any failure rolls the whole issue back: no PO, no consumed number, no partial lines, no
   partial demand update, no orphan Units. The batch then re-checks the ledger against the lines.
7. `allocate_unit_id()` and `gen_unit_code()` are revoked from `public`, `anon`, `authenticated`
   and `service_role`.
8. A revision that grows a traceable line allocates only the additional Units; reductions and
   cancellations retire without deleting or reusing.

---

## 5 · Receiving

Every line is answered by its **snapshotted** mode, at the validator and again at the engine, so
a direct caller cannot impersonate a mode.

- Exact-unit line: one governed outcome per expected Unit; a quantity-only submission is refused
  (`exact_unit_line_needs_units`).
- Quantity line: reconciled quantities; Unit IDs named against it are refused
  (`quantity_line_takes_no_units`). Received pieces post as bulk register rows
  (`identity_scope = quantity`, 0218's model) whose technical key is never shown as a Unit ID.
- Missing, foreign, duplicated, **wrong-line** and already-received Units refuse by name; a Unit
  is looked up by its line binding, never by `(PO, SKU)`.
- `expected = cumulatively received + not yet received` holds per line in both modes.
- Damaged, wrong and not-received outcomes are preserved and never change an identity.
- The legacy shortfall mints in `operation_receive_po_with_do` (0426) and `receiving_amend`
  (0427) are gone. 0444 refuses to apply while any open exact-unit line is still short.

---

## 6 · UI and PDF

- Purchase Orders register: unchanged, one row per PO, no Unit ID column.
- Opened PO `Document → Goods lines`: the column is `Unit ID`. An exact-unit line lists its real
  line-bound IDs immediately after issue. A quantity line prints `—` — intentional, not
  `Not allocated`. An exact-unit line with no IDs after issue is an integrity failure and says
  `Unit IDs missing on this line — do not send this PO`, never an ordinary empty state.
- A pre-issue draft still has no PO number, version, date or Unit IDs.
- The official PDF heads the column `UNIT ID` (never `ITEM ID`) and prints the same line-bound
  IDs the object shows. Supplier instruction stays one line on the supplier's own package label,
  `CARRES UNIT ID: U1-000-001` — no QR, barcode or Carres label template. The real Supplier
  Master name and address are untouched.

---

## 7 · Documents overwritten

`docs/ERP-ARCHITECTURE.md` (Catalog owns the mode · Purchasing owns the birth · Receiving
verifies) · `docs/purchasing/MASTER.md` §6.2 and §5 · `docs/stock/MASTER.md` §3 ·
`docs/orders/MASTER.md` Card 2 spine · `docs/ui/MASTER.md` · `docs/COPY-STANDARD.md` (the Unit ID
word table) · `docs/pdf/PO-PDF-STANDARD.md`. No competing version was created and no completed
Card was rewritten as current law.

---

## 8 · Verification

**SQL-contract tests** — `packages/shared/src/unit-id-birth.test.ts` (23) and the updated
`purchasing-po-identity.test.ts` (17) hold the committed files' contract: the Catalog gate before
the number is drawn, the line-bound birth, the closed allocators, the destination trigger that no
longer mints, the revision's allocate-only/retire-only behaviour, the document reading each line's
own Units, and a Receiving that never allocates. `apps/web/src/lib/pdf/po-template.test.ts` fails
if `Item ID` returns. `PurchaseOrdersPage.test.tsx` covers the three goods-line states.

**The rolled-back production probe** — `scripts/probe-unit-id-birth.sql`, run inside one
transaction on production 2026-09-07 and rolled back. Nothing survived. Verbatim result:

```
PROBE COMPLETE - every assertion held - rolling back
fixtures: exact=ALL-AASNDA-K qty=MATTRESS-PROTECTOR
PASS 1: allocate_unit_id() refused for authenticated (42501)
PASS 1b: gen_unit_code() refused for authenticated (42501)
PASS 2: unclassified SKU refused - Set the stock identity (Unit ID or Quantity)
        for ALL-AASNDA-K in Catalog before issuing a PO
PASS 3: PO-20260907-0035 born with 2+0+1 line-bound Units
        (U1-000-082->e831ccd6, U1-000-083->e831ccd6, U1-000-084->fb481151)
PASS 4: the document prints each line own Units; the quantity line prints none
PASS 5: revision +1 allocated one more; -2 retired two and deleted none
PASS 6: the two modes cannot impersonate each other; foreign, wrong-line and
        duplicate Units refused by name
PASS 7: ledger grew only by 3 born + 1 revision; all 216 prior IDs unchanged
```

PASS 3 is the duplicate-SKU case: two lines of `ALL-AASNDA-K` on one PO, disjoint IDs bound to
different lines (`e831ccd6` and `fb481151`). No PO number was consumed by the refused issue and
no Unit was left behind; the refused issue is PASS 2's own control.

An earlier run of the same transaction applied all three files **in full**, including both sanity
blocks and the 0443 preflight repair, and reached the probe — that is the proof the complete
files apply. Two schema facts were measured along the way and are recorded because they shaped
the code: `purchase_order_lines` is unique on `(po_id, sku, attrs)`, so two lines of one SKU are
the multi-variant case (0076) — exactly the case `(PO, SKU)` could not tell apart; and
`purchase_orders.destination_id` is NOT NULL, so the helper names the missing Deliver To rule
instead of letting a raw constraint speak.

**Owed after apply** — authenticated production walks: SO Batch issue · Manual Purchase issue ·
the PO object's Unit ID column · the rendered PDF heading · an exact-unit receive · a quantity
receive · the register still one row per PO.

---

## 9 · Migration dependency and apply order

Forward-only. No committed migration was altered. Apply **in this order, one at a time**:

```
0442_a_sku_declares_how_its_stock_is_identified.sql
   → Catalog mode + audit ledger + the one-time classification
   → purchase_order_lines.identity_mode, ops_stock_items.po_line_id / identity_scope
   → both allocators revoked from every client role

0443_a_unit_id_is_born_with_the_official_po.sql   (needs 0442)
   → the creation helper, the issue authority, the destination trigger,
     the revision, the document
   → the preflight that restores the printed IDs the old trigger voided

0444_receiving_verifies_the_units_purchasing_issued.sql   (needs 0442 and 0443)
   → refuses to apply while any open exact-unit line is short
   → the mode-aware validator, engine, amendment and count form
   → the shortfall mints are removed
```

0444's own preflight is the guard: if 0443 has not run, or did not make every open exact-unit
line whole, 0444 stops rather than remove the fallback something still depends on.
