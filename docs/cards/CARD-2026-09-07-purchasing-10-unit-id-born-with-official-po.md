# 【PURCHASING】 — CARD 【10】 · UNIT ID BORN WITH OFFICIAL PO — TRACEABLE GOODS AND QUANTITY GOODS

Module: Purchasing (× Catalog × Stock × Receiving) · Sequence: 10
Pages: Catalog (SKU Master · New SKU) · SO Batch Purchase · Manual Purchase · Purchase Orders object · official PO PDF · Receiving · Warehouse count
Status: SHIPPED — owner approved the apply 2026-09-08; 0442 · 0443 · 0444 applied in order and verified; PR #1161 merged `11dac716`
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

**The walks these owed are settled in §8.2** — what passed, and what could not be
walked without inventing a business fact.

---

## 8.1 · What the apply actually did (production, 2026-09-08)

Applied in order through the governed path, each verified before the next.

| Applied | Measured immediately after |
|---|---|
| `0442` | 225 SKUs `exact_unit`, 4 `quantity`, 7 NULL — and every NULL is a service or guarantee SKU, which is not physical goods. Every classification carries its basis in the ledger. Both allocators owner-only. |
| `0443` | The preflight restored **exactly the 39** `po_mint` Units the old destination trigger had voided — the identities already printed on supplier paper — and invented none. Ledger: 216 Unit IDs, 216 distinct codes. The destination trigger no longer voids or mints. |
| `0444` | No receiving door contains a bulk mint. The validator enforces both modes and finds a Unit by its line binding. No open exact-unit line is short. |

Two honest observations, neither repaired because neither should be:

- **Four `PO-SMOKE-*` lines carry no mode.** Their SKUs (`SMOKE King Mattress`, `SMOKE Sofa`,
  `SMOKE Queen Bedframe`) are not in the Catalog at all, so they were never receivable through the
  governed path. Receiving now refuses them by name, which is the correct answer for a line whose
  SKU Catalog does not know. Constitution §6: these are smoke rows, not a backfill target.
- **`PO-2050` / `S1601F-K` has one pending piece and two incoming Units** — an excess left by the
  old trigger's mint/void churn, not a shortage. The preflight only restores shortages, and 0444's
  guard only blocks shortages, so it does not block anything. It is recorded here rather than
  silently adjusted.

## 8.2 · The authenticated production walk (2026-09-08, `principal@carres.com`)

Deployed SHA at the time of the walk: `322639e9`, which carries `11dac716` as an ancestor —
convergence proven by ancestry, not by equality, because a sibling merge deployed on top.

**A real PO was issued through the real Manual Purchase screens.** Request raised (`ALL-AASNDA-K`,
qty 1, Nice Future → Carres Klang), approved, then issued from the register's one issuance
placement. Production result:

```
PO-20260908-2503   created_at 2026-09-08 06:45:31.737518+00
line ALL-AASNDA-K  qty 1   identity_mode exact_unit
unit U1-000-082    created_at 2026-09-08 06:45:31.737518+00
                   po_line_id = the line   identity_scope unit   source_ref po_mint   status incoming
```

The PO row and the Unit row share the same transaction timestamp to the microsecond. That is the
ruling, measured: the number and the identity are born together or not at all.

| Walk | Result |
|---|---|
| Catalog SKU Master shows the stored mode | **PASS** — the 236-SKU list prints 225 `Unit ID`, 4 `Quantity`, 7 `Not set`, exactly the counts `0442` wrote |
| Manual Purchase issue | **PASS** — `PO-20260908-2503`, Unit born in the same transaction |
| PO object Unit ID column | **PASS** — header reads `UNIT ID`; the line prints `U1-000-082`, no status word, no missing-ID alert |
| Register still one row per PO | **PASS** — 62 POs, one row each, no Unit ID column |
| Receiving reads the identity Purchasing made | **PASS** — the PO's receiving page lists `EXPECTED UNITS U1-000-082`, and the receiving form offers that Unit an outcome instead of a blank to fill |
| PDF `Unit ID` heading | **PASS** — the deployed bundle renders `Unit ID` as the goods-table heading; `Item ID` occurs zero times in the served JavaScript |

**Three walks could not be completed, and none of them was skipped for convenience.**

- **A quantity line cannot be purchased at all today.** Every `quantity` SKU in the Catalog is an
  accessory, and `purchasing_production_days` holds only four rows — Hookka/bedframe,
  Nice Future/mattress, Ohana/bedframe, Ohana/sofa. With no accessory production days, Manual
  Purchase refuses the line by name: *Production days are not set · Add production days for
  Nice Future · Accessory in Settings*. So neither the `—` state nor a quantity receive is
  reachable. **This is Settings configuration, and the number is a real supplier lead time —
  inventing one would be inventing a business fact.** 🟡 **Fix, for Jess:** set production days
  for each supplier's accessory category in Purchasing Settings; the walk then completes with no
  code change. Until then the `—` state rests on `PurchaseOrdersPage.test.tsx` and the probe's
  PASS 4.
- **The SO Batch Purchase entrance has nothing left to issue.** All 26 proceeded sales orders are
  already covered by POs; selecting the one apparently-open line routed to its existing
  `PO-20260904-4665` rather than creating a second. Both entrances call the same
  `purchasing_issue_pos_batch` → `_operation_create_po_inner`, which the Manual Purchase walk
  exercised end to end. Creating a sales order purely to walk this would be inventing customer data.
- **The receive could not be saved.** The form requires an uploaded signed supplier DO photo
  (`Save — upload signed DO` stays disabled without one). There is no genuine signed DO for this
  smoke PO, and manufacturing supplier paperwork is not acceptable evidence. The receiving draft
  was cancelled; no receiving activity was recorded. What the walk *did* prove is the part this
  card owns: Receiving names `U1-000-082` as an expected identity and never offers to create one.

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

---

# 【PURCHASING】 — CARD 【10】 · SECOND PASS · THE UNIT ID CORRECTION

Reported 2026-09-09: operators still see lowercase Unit IDs — `id-aam135002`, twelve characters,
nine of them after the `id-` — where the approved identity is `U1-000-001`.

Status: BUILT · tests green · rolled-back production probe PASSED · **the apply awaits the Owner**
Migration: `0453_a_quantity_row_is_keyed_not_identified.sql` (one file, forward-only)
Lane: BUILD / DELIVERY · continues this Card rather than opening a second one

**The first pass was not wrong, it was incomplete.** It closed the PURCHASE ORDER birth, which is
what it set out to do. It did not close the other four doors into the same column, and this pass
is measured against production rather than against that intent.

---

## 10 · What is actually in production, measured 2026-09-09

```
222 register codes   ·   82 approved U…   ·   140 legacy id-…
```

The 140 break down as **84** opening-stock imports (2026-07-11), **51** PO mints from before 0443
sitting on 41 lines, and **5** counted bulk rows.

**No identity was substituted, and the evidence is arithmetic.** `unit_id_series.last_number` is
**82** and exactly **82** `U…` codes exist, each bound to a live row, with **zero** orphans in
`stock_unit_ids`. Not one `U…` was ever allocated and lost. 0443's preflight had already restored
the 39 the destination trigger voided. So there is no original identity to restore, nothing to
renumber, and no identity chain to repair — the 140 are goods that never had a `U…` at all.

## 11 · The four doors, and the fifth defect they caused

| # | 🔴 Door | Evidence | Closed by |
|---|---|---|---|
| 1 | `ops_stock_items.unit_code` **DEFAULT `gen_unit_code()`** — any insert omitting the column silently minted a lowercase code | `pg_attrdef` on the live column | the DEFAULT is dropped; omission now fails loudly |
| 2 | **`ops_stock_book_in_units` named no `unit_code` at all** and let that DEFAULT name it. The governed stock-import door, reachable at `POST /api/ops/stock/import` — **this is the door still producing `id-…` for EXACT units** | the live function body | it allocates a real `U…` for one piece, a `QTY-` key for many |
| 3 | **Receiving still minted for counted rows** — three sites in `operation_receive_po_with_do`, one in `receiving_amend`. 0444 removed the shortfall mint that invented an *identity*; it left the bulk-row mints | the live function bodies | all four move to `gen_quantity_key()` |
| 4 | **The CHECK still blessed the legacy shape** for any row, forever (0416) | `ops_stock_items_unit_code_format` | a BEFORE INSERT trigger holds new rows to their scope's shape |
| 5 | **Nothing downstream could tell an identity from a key.** `stock_unit_register_v` never exposed `identity_scope`, so every screen printed `unit_code` under a `Unit ID` heading — including **5 counted rows covering 893 pieces** | the live view definition | both views expose it, and one shared resolver decides |

**The rule, stated once:** a quantity row is **KEYED**, an exact unit is **IDENTIFIED**. They stop
sharing a shape, so nothing can print one as the other. `gen_unit_code()` is **dropped** — the
`id-` shape has no producer left anywhere in the database.

## 12 · One resolver, and every surface asks it

`packages/shared/src/unit-identity.ts` — `unitIdOf()` returns the stored identity or **`null`**.
Counted goods get `null` every time, on every surface, and `null` prints `—`.

- **Display and printing preserve the stored value exactly.** `U1-000-001` prints `U1-000-001`; a
  grandfathered `id-abc123456` prints `id-abc123456`, because that is what the label says.
- **Search accepts variation on INPUT only** — case and every separator are stripped for
  comparison, so `u1000001`, `U1 000 001` and `U1-000-001` all find the same Unit. The `/register/:unitCode`
  door also tries the canonical spelling, and **refuses to resolve a counted row**: nothing was
  ever printed, so nothing can be scanned.
- 🔴 **`DeliveryResultAction` was rendering `unit.unitCode ?? unit.id` — a raw UUID** beside the
  operator's tick box whenever a line had no Unit ID. Counted goods are now named by their product.

Corrected surfaces: Stock Register (display · search · **export** · row-open) · Stock On-Hand
search · Ops Stock list · Warehouse Unit detail door · Delivery Order projections and the DO PDF ·
Delivery Result.

## 13 · Historical IDs — the recommendation, and why nothing is rewritten

**RECOMMENDATION: keep all 140 exactly as they are. Do not uppercase, renumber, delete or
replace one.** They are printed on labels in the warehouse and on supplier PDFs already sent;
rewriting them destroys the only link between the paper and the record, and buys nothing —
Constitution §6 says every one of these rows is test data that go-live discards.

`0453` therefore contains **no `UPDATE`, no `DELETE`, no `TRUNCATE`** at migration time, the
CHECK keeps grandfathering the `id-` shape, and the trigger fires **on INSERT only** so those rows
stay fully movable, reservable and deliverable. A test asserts each of these.

**Falsifier:** if a legacy `id-` code is found on a Unit whose PO document prints a *different*
`U…` code, that Unit was substituted and this recommendation is wrong for it. Measured today, no
such Unit exists — the series arithmetic in §10 rules it out.

## 14 · Proof

**Tests — 9,976 pass across the monorepo, typecheck clean in all three packages.**
`unit-identity.test.ts` (24) holds the resolver, the display/search split and the preservation of
historical codes; `unit-id-correction.test.ts` (20) holds the migration's contract, including
*rewrites no row* and *asserts no production row count*; `stock-register.test.ts` executes the
route's real SQL against the committed migrations in PGlite.

🔴 **That contract test caught a real regression before it shipped.** `create or replace view`
silently resets `security_invoker`, which would have made both register views run as the definer
and stopped RLS applying to the reader. Both views now restate `with (security_invoker = true)`.

**The rolled-back production probe** — `scripts/probe-unit-id-correction.sql`, one transaction on
production, rolled back, nothing survived. Its verbatim result is recorded in that file. PASS 6 is
the one that closes the report: the insert that used to yield `id-aam135002` now fails loudly.
Production was re-measured immediately afterwards and is **untouched** — `gen_unit_code` present,
DEFAULT present, series still 82, 222 rows.

## 15 · 🟡 Found in passing, not fixed here

**Fourteen migrations in the `0400+` range are applied in production but missing from the
`supabase_migrations.schema_migrations` ledger** — `0405 · 0406 · 0409 · 0410 · 0413 · 0414 ·
0415 · 0416 · 0418 · 0419 · 0420 · 0421 · 0422 · 0423`. Verified applied, not merely assumed:
0416's constraint carries its own comment and 0423's column exists. **Fix:** record the missing
rows so a future `supabase db push` cannot try to re-run them. Left out of this Card deliberately —
writing to the migration ledger changes deployment behaviour repo-wide and deserves its own scope.

## 16 · Apply order

```
0453_a_quantity_row_is_keyed_not_identified.sql   (needs 0442 · 0443 · 0444, all applied 2026-09-08)
```

One file, one transaction, with its own four-assertion sanity block. It refuses to commit if the
legacy generator survives, if the DEFAULT survives, if any function still calls the generator, or
if the register did not gain `identity_scope`.
