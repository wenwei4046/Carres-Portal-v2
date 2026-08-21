# STOCK / WAREHOUSE — MASTER

> **APPROVED / LOCKED — owner-reviewed 2026-08-20.**
> This is the only Warehouse operating model. It overwrites the former On hand, Ready stock
> planning and Held stock model. Current code is evidence only, never target authority.

## 1 · Mission and ownership

Warehouse answers: **Which exact Unit is where, who has it, what condition is it in, and can it
be used?**

Carres currently uses third-party warehouse and delivery operators. NETS performs physical work;
Carres Portal preserves Carres-controlled inventory truth. The model must work unchanged with
another 3PL or a future Carres-operated warehouse.

| Fact | Owner |
|---|---|
| PO, Consignment Order, supplier promise/claim and commercial reason | Purchasing |
| Unit ID, Where, Who has it, condition, availability and physical history | Stock / Warehouse |
| receiving session and receipt evidence | Receiving |
| exact Unit promised, reservation and release decision | Sales Order |
| journey, carrier handover and proof | Delivery |
| customer problem after delivery | Service Case |
| invoice, settlement, payment and valuation | Finance |
| material adjustment, write-off and major dispute approval | Management |

Purchasing explains why Carres obtained the Unit. Stock explains where it is now. A consequence
never transfers write ownership.

## 2 · Navigation and words

Warehouse destinations are **Stock · Ready stock · In & out · Transfers · Counts**.

- Stock: every currently controlled Unit.
- Ready stock: exact Units currently eligible for a new customer promise.
- In & out: append-only physical events.
- Transfers: Site-to-Site movement and handover.
- Counts: dated physical counts and Unit-level differences.

Reports, Settings, Work, Quick Rail and Calendar keep their shared Shell homes. Receiving,
Purchasing, Delivery, Payments and Service Cases keep their own doors.

Approved operator words include **Where · Who has it · Carres Owned · Supplier Consignment ·
Report issue · Count again**.

Rejected Warehouse UI words include On hand as the master-list name, Stock Units as the list name,
Inventory, Movements, Custody, bare Hold, Quarantine, and generic Review, Handle, Follow up,
Next Action, Priority, Edit, Delete, Add stock, Remove stock or Mark done. Shared copy remains
governed by the Copy Standard.

## 3 · Unit operating model

Every physical sofa Carres controls has one permanent Carres Unit ID, including Carres-owned and
supplier-consignment display goods, sold display goods awaiting delivery, and goods awaiting repair,
change, return or supplier collection.

The ID is created when a PO or Consignment Order is confirmed and supplied to the supplier. The
supplier adds CARRES UNIT ID to its own label; Carres does not routinely print supplier labels.
A wrong or unreadable label starts a controlled issue, never a second Unit. Replacement labels keep
the original ID and full evidence. IDs are never reused.

Every active Unit has Catalog identity, source order, ownership, **Where**, **Who has it**,
condition, calculated availability, reservation connection, last verified date, evidence and
append-only history.

| Where | Who has it |
|---|---|
| Carres Klang Warehouse | NETS Warehouse |
| On the way to PJ Showroom | NETS Delivery |
| PJ Showroom | PJ Showroom |
| selected JB partner warehouse | JB partner |
| On the way to the Singapore customer | EU or SSY |

NETS is not a Site. Site, operating party and role are separate. Independently saleable or
replaceable modules each have a Unit ID; pure shipping packages are children of their Unit.
Missing required modules, components or packages prevents Ready stock eligibility.

## 4 · Availability, reservation and replenishment

The Unit register is authority. Every quantity is derived from identifiable Units; no rollup,
page or integration maintains another available quantity.

| Facts | Result |
|---|---|
| received, inspected, complete, unreserved and uncontrolled | Available |
| bound by Sales Order | Reserved / sold |
| ordered but not received | Incoming |
| between confirmed handovers | In transit |
| issue, inspection, repair, missing component or other control | Not available |
| customer accepted or lifecycle ended | Delivered / history |

Sales Order owns choosing, binding, changing and releasing the exact promised Unit. Stock validates
eligibility and reflects the result. Warehouse may report a problem but cannot silently release or
substitute a reserved Unit.

Ready stock contains only exact Units satisfying every eligibility rule; every total drills to IDs.
A customer shortage separates available Units from remaining demand: Warehouse receives dated
preparation work for available Units, Purchasing receives dated arrival work for the missing demand,
and Sales Order displays promise risk. General replenishment is a Purchasing decision.

## 5 · Physical lifecycle

Confirmed PO or Consignment Order creates expected Incoming Units. Receiving owns the session.
NETS Warehouse scans each actual ID, checks product, visible condition, required components,
packages and label, supplies governed evidence, and records one outcome per Unit: Check in,
check in with issue, reject, or not delivered. A bulk total cannot replace Unit results. Partial
receipt preserves received Units and leaves the remainder Incoming. Unexpected Units are
investigated, never added through a shortcut.

Showrooms are formal Sites. Staff scan arrival and departure, report observations and perform dated
counts. A reserved display Unit remains at its Site but leaves Ready stock. Display start and last
condition check are visible. No governed Position or slot exists now; reconsider when three to four
outlets or measured finding time proves Site alone inadequate.

Delivery works backward from the customer date using governed calendars, cut-offs and transit.
Warehouse consumes the calculated latest Carres Warehouse ready date and completes exact-Unit
check, completeness, pack and handover facts; it never guesses the date.

A Transfer has exact Units, From, To, collection and arrival. Collection and arrival are separate
facts. Partial handover changes only affected Units. A Unit not confirmed at destination remains
with its last confirmed holder. Customer Delivery remains Delivery's record; Stock reads its
handover facts instead of creating a duplicate Transfer.

A Singapore SO has two Delivery legs: Carres Klang Warehouse to the selected JB partner warehouse,
then that warehouse to the Singapore customer through EU or SSY. Each leg has its own logistics
partner, linked DO or trip scope, dates, handovers and proof.

A returned Unit is Returned — check required, never automatically Available. Repair requires
outbound handover, external-holder truth, return handover and inspection. Supplier collection
requires Purchasing authority and actual handover. Write-off approval and physical disposal are
separate facts. Ended Units leave the default view but remain searchable in Delivered / history.

## 6 · Issues, Counts and correction

Anyone who observes a Unit may Report issue. Reasons are observable: damaged, product different,
Unit ID unreadable, Unit cannot be found, Unit at another Site, components missing, packaging
problem, unsafe, supplier or destination refused, or another observed problem. The Portal explains
the consequence, requests reason-specific evidence, protects the Unit and raises Work. Staff do not
guess Hold or Quarantine.

Inspection records an actual result and permits only governed paths: restore eligibility, dated
repair, Purchasing decision, supplier collection, Count again, approved Site correction or proposed
write-off. Generic Close issue is invalid.

Counts are dated Site work. The first count hides the expected list. After submission, differences
are per Unit. A repeat creates new evidence and says **Count these Units again**. Multiple
mismatches say **Find out why {n} Units do not match the count**.

Cannot find does not reduce Stock. The flow checks last handover and holder, incomplete journeys
and an exact-Unit repeat count. Only an unexplained result becomes a proposed adjustment, and the
proposer cannot approve a material adjustment.

Correct this record preserves the original event, corrected fact, reason, evidence, actor, time and
approval. It is not a stock adjustment. No physical event or submitted report is edited or deleted.

## 7 · Pages and daily journeys

All surfaces reuse the governed Shell, Register, Workspace and Object Detail grammar.

Stock is the one current list. Its left rail filters the same authority by All stock, Attention,
Availability, Site or Where, Ownership, Catalog category, and Changed today, this week or this
month. Time choices are filters, not Work dates.

Ready stock groups eligible Units by Catalog product and Site and expands to exact IDs. Sales enters
its own Choose Unit door; Stock has no second reservation editor.

In & out shows actual time, Unit, event, From, To, handled by, source and evidence. Transfers
provides Register, Detail, mobile collection and arrival. Counts provides Register, mobile scan
workspace and difference surface.

Unit Detail is titled by Unit ID and product. It shows Where, Who has it, ownership, condition,
availability, reservation, last verified, one current attention item, connected records, evidence,
history and permitted actions. There is no generic Edit, status selector or Delete.

- NETS Warehouse opens dated Work, scans receipt, Count and handover, and supplies evidence.
- NETS Delivery scans collection and arrival; unresolved Units remain visibly with it.
- Showroom scans arrivals and departures, sees and counts its Site, and reports observations.
- Carres Warehouse / Stock maintains evidence-backed Unit truth, exceptions, returns and month-end.
- Finance receives frozen month-end facts and never edits Units.
- Management decides material exceptions; approval never replaces physical proof.

## 8 · Work and dates

Warehouse uses the one shared Work Engine. Owner and cover are structured metadata, not sentence
text. The business object has no fake universal Owner. Labels tell a new operator the concrete act;
completion is an authoritative fact, never Mark done.

Every Work row has an actual weekday and date; appointments also have time. Today, This week,
This month and Upcoming are view or group labels only. Without a governed real date, the action
contract is incomplete and cannot enter Work.

- current year: Tue, 18 Aug;
- non-current year: Fri, 1 Jan 2027;
- with time: Tue, 18 Aug · 10:42 AM;
- standalone formal reports, audit evidence and cross-year ranges show the year.

The Stock rail finds Units. Quick Rail finds actions. Calendar shows dated Count, collection,
arrival, return, inspection, repair, supplier collection and month-end commitments.

## 9 · Month-end Stock Confirmation

Each month produces a formal Month-end Stock Confirmation:

- Stock date: final calendar day at 11:59 PM;
- count date: actual date, allowed within two calendar days before or after Stock date;
- submission date: governed Warehouse date after the window.

Stock operations never close. The Portal reconciles exact timestamped Unit events between count and
Stock date; it never guesses, backdates or adjusts a total to match. The frozen report separates
Carres Owned, Supplier Consignment, Sites, In transit, Reserved or sold, controlled Units, approved
adjustments and unresolved differences, with drill-down to IDs.

Warehouse may submit on time with disclosed unresolved differences. Finance acknowledges a specific
version. Later correction creates a reasoned Version 2; Version 1 remains. Finance valuation reads
ownership and source facts but does not write physical Stock.

## 10 · Permissions

- Sales searches and chooses through Sales Order, and reports issues; no physical edits.
- Purchasing owns PO, Consignment, supplier, claim and Sold to Settle; no physical handover/payment.
- NETS Warehouse owns only assigned receipt, warehouse handover, evidence and Count execution.
- NETS Delivery owns only assigned collection, transport, arrival, return and evidence.
- Showroom owns only its Site arrival, count and observation.
- Warehouse / Stock owns Unit, location, condition, availability control, differences, returns and
  month-end; no commercial terms, customer promise or payment.
- Finance owns invoice, settlement, payment, valuation and report acknowledgement; no Unit edits.
- Management approves material adjustment, write-off, compensation and major dispute; approval does
  not replace evidence.

No person completes demand, ordering, receipt, stock adjustment and payment end to end. Cover moves
Work but grants no new capability.

## 11 · Reports, Settings and external boundary

Reports cover Stock by Site, product, ownership and availability; Showroom; stale verification;
receipt, Transfer and Count; partner evidence; current issues; corrections and adjustments; and
month-end versions. Reports are read-only. Export never becomes authority.

Central Settings owns Sites, operators and roles, Stock calendar, month-end and Count rules, issue
reasons, evidence rules, Unit ID rules, permissions and approval limits. Settings never edits a
Unit, reservation, event or report.

Carres Portal is the minimum control plane. NETS receives narrow mobile Work, scan, observable
outcome and evidence surfaces, not the full ERP. Optional APIs may propose events but cannot
overwrite Unit truth. Offline scans remain visibly Not submitted and non-authoritative until
submission; actual and submitted times are separate.

The model never hard-codes NETS. Site, operating party, role, permission, calendar and evidence
remain separate. Current scope rejects unproven heavy-WMS bin, rack, put-away, pick-wave, forklift
and packing-station complexity. Zone, Rack or Bin may extend the same Unit model when measured need
justifies it.

## 12 · Current implementation reality — evidence, not law

### 12.1 · BUILT / VERIFIED — the Unit authority foundation (0366, 2026-08-20)

`CARD-2026-08-20-warehouse-unit-authority` is built and applied. The exact physical Unit register
`ops_stock_items` is now the one inventory authority, enforced in the database rather than by
convention. Measured on production before the change, and again after it:

| What the card required | How it is enforced now | Verified |
|---|---|---|
| One permanent Unit ID, never duplicated | `unit_code` NOT NULL, defaulted from `gen_unit_code()`, FULL unique index `ops_stock_items_unit_code_uq` (it was PARTIAL, and 88 of 136 live units carried no id at all) | duplicate insert refused |
| Never reused after cancellation, delivery, return, write-off or disposal | ledger table `stock_unit_ids` — every id ever minted, never pruned; the generator asks the LEDGER, and a birth trigger re-registers | a written-off unit's id refused for reuse |
| A row is never deleted | `stock_unit_identity_permanence` refuses every DELETE (0341 protected only committed units); `trg_po_units_follow_destination` now VOIDS surplus incoming units instead of deleting them | delete refused |
| A replacement label keeps the original id | the same trigger refuses any change to `unit_code` | rename refused |
| No bulk sofa row acts as several reservable Units | CHECK `ops_stock_items_bulk_never_reserved`; trigger refuses `qty > 1` when the CATALOG says the SKU is a sofa | bulk reservation refused |
| Ownership: Carres Owned vs Supplier Consignment | `ownership` column + CHECK; consignment must name its supplier | — |
| Site, operating party and role are separate | `warehouses` = Site; new `stock_operating_parties` = WHO HAS IT (`carres_warehouse`, `nets_warehouse`, `nets_delivery`, `pj_showroom`); `holder_party_id` on the Unit. NETS is a row, never hard-coded | two doors, neither moves the other |
| Last verified date | `last_verified_at`, stamped only by `ops_stock_verify_unit` | — |
| Append-only identity and physical event lineage | `stock_unit_events`, written by a TRIGGER on the register itself so no door can forget it; UPDATE and DELETE both refused; ordered by a monotonic `seq` (0372) | a Unit driven through a governed life in one transaction reads `unit_born -> status_changed -> reservation_changed -> protection_changed -> holder_changed -> verified -> ownership_changed -> condition_changed`, 8 events, 8 distinct sequences, and the sequence itself refused a rewrite |
| ONE availability arithmetic | `unit_availability(status, needs_repair, hold_reason, condition)` in SQL and `unitAvailability()` in `packages/shared/src/unit-availability.ts`, pinned to each other by tests | six words, both sides |
| Availability is never a stored number | view `stock_sku_availability` computes from the register on every read — it cannot be stale. A trigger-kept column was rejected: a second copy is still a second copy (Architecture Law D) | — |
| Every derived total drills to the exact ids | view `stock_unit_availability_v` carries id, availability, lifecycle outcome, catalog category and source status | 74 (sku, site) rows all drill |
| A bulk record is never mistaken for promisable stock | `stock_sku_availability` carries THREE named numbers (0368) | 85 bindable · 893 bulk · 978 sellable |
| Negative stock impossible | availability is counted from units that exist; `stock_balances_qty_nonneg` | 0 impossible rows |
| No generic Edit, Delete, Add stock, Remove stock or status selector | `ops_stock_items` lost its write policy entirely; `POST /api/ops/stock` ("+ Add stock"), `DELETE /:itemId`, `POST /api/operation/warehouse/adjust`, `operation_adjust_stock` and the `+ Adjust` modal are all gone | adjust refused in words |
| One governed door per fact | `ops_stock_set_condition` · `refurbish` · `refurbish_complete` · `bind_units` · `unbind_unit` · `set_site` · `set_holder` · `set_ownership` · `verify_unit` · `book_in_units` · `set_thresholds` | — |
| No second reservation writer | the two raw writers measured on live (POS post-receive labelling, the sofa-loan claim and its rollback) now go through `ops_stock_bind_units` / `ops_stock_unbind_unit`. Sales Order still decides WHICH unit; Stock only records it | — |
| A stock total can never be hand-written | `stock_balances_derived_only` refuses any write to `qty`/`reserved` outside the rollup | hand-write refused |

**The two arithmetics that did not agree, measured.** `ops_rollup_stock_balances` used `count(*)`,
not `sum(qty)`, so the five live bulk rows (qty 2 · 555 · 15 · 319 · 2) counted as ONE unit each.
They contribute **893 units**; the rollup saw 5. After the change the cache and the authority agree
on every row (`cache_drift = 0`), and the live figures are 978 available · 2 reserved · 43 incoming
across 74 (sku, site) rows.

**`stock_balances` survives as a NON-AUTHORITATIVE CACHE, and nothing may read it as truth.**
Eighteen live SECURITY DEFINER functions across Orders, Purchasing, Receiving and Delivery still
read its `qty`/`reserved`; dragging them into a Warehouse foundation card would have been a worse
change. So it lost its independence instead: no hand write, recomputed by statement trigger inside
the same transaction as the change, and every screen that decides whether goods can be OFFERED —
the alert RPC, the POS shortage feed, the warehouse totals, the stock summary, the order drawer,
the purchase assembly and the PO-duty cron — now reads `stock_sku_availability`. Its
`low_threshold`/`high_threshold` remain, because those are Settings and configuration is what
survives go-live. **Retiring the cache entirely is the next card's work, not a gap in this one.**

**THREE NAMED NUMBERS, because there are three questions (0368).** 0366 shipped ONE `available`
and it answered two of them at once — the defect this whole card exists to remove, found by review
before merge. `ops_stock_items_bulk_never_reserved` forbids a `qty > 1` record from ever being
reserved, yet `available` summed those records: it said **978** where **85** could actually be
promised. Corrected to:

| Number | The question it answers | Live 2026-08-20 |
|---|---|---|
| `available` | which exact Units can a Sales Order BIND right now | **85** |
| `bulk_on_hand` | pieces present in a `qty > 1` record — real goods no exact-Unit promise can name | **893** in 5 records |
| `sellable` | must we BUY more? (`available + bulk_on_hand`) | **978** |
| `on_hand` | what is physically at this Site, reserved and controlled included | **980** |

`sellable` is what the reorder alert, the POS shortage feed, the purchase assembly, the PO-duty cron
and the Stock page's sellable column read — a shelf holding 555 pillows needs no purchase order,
whether or not a pillow carries an identity. `available` is what an exact-Unit promise reads.
Nothing computes `on_hand - reserved`. `stock_balances.qty` deliberately did NOT move: it tracks
`sellable + reserved`, which is the free + reserved membership it has meant since 0137.

**THE ONE THING THIS CARD SURFACED AND DID NOT DECIDE — an owner question.** 893 real pieces
(pillows, mattress protectors) sit in 5 bulk records, and **no Sales Order can bind any of them to a
customer**, because a record standing for 555 anonymous pieces cannot carry one customer's promise.
Splitting them into 893 Units was proposed and rejected here: MASTER §3 requires an identity for
every sofa and every independently saleable or replaceable module, the id is printed by the SUPPLIER
on its own label, and Carres does not label 555 pillows one at a time — minting 893 ids would change
how Carres operates, which is Jess's call and not a migration's. The card also forbids a backfill
over imported rows, and every live row is test data.

So the question stands, and it is a real operating choice, not an engineering one:

```
AUTHORITY SEARCHED       Stock MASTER §3 (Unit identity, supplier-printed label) ·
                         §4 (availability) · Card §2/§6 · Constitution §6 (clean start)
WHY NOT ALREADY RESOLVED the approved model requires identity for FURNITURE and is silent on
                         whether an accessory piece carries one
TWO REAL OPTIONS         (a) every accessory piece is a Unit with a supplier-printed id -
                             honest binding, but the supplier must label pillows one by one
                         (b) accessory demand is satisfied WITHOUT exact-Unit binding -
                             no labelling burden, but the Sales Order can never promise a
                             specific pillow and Stock needs a quantity-draw door for them
RECOMMENDATION           (b). The labelling cost in (a) falls on the supplier for goods nobody
                         traces individually, and the operator gains nothing from it.
OPERATIONAL CONSEQUENCE  under (b) a later card owes Stock a governed quantity-draw door for
                         bulk records; until then those pieces are visible and countable but
                         not promisable, which is exactly what the screens now say.
```

Nothing is blocked on the answer: the numbers are honest either way, and both options build on the
same Unit authority.

**`ended` never erases how a life ended.** `unit_lifecycle_outcome()` is a separate authoritative
answer beside the availability word — `delivered` · `cancelled_before_receipt` · `written_off` ·
`returned_to_supplier` · `active` — so Delivered / history can tell them apart without a second
query or a second arithmetic. Physical disposal is not a fifth word until that fact is recorded.

**Seven migrations, because self-review and review kept finding real holes. Every one was found by
looking again, not by a failing test — which is the point of Law 4. Two of them (0369, 0370) exist
because a guard described as protecting the numbers could not fire at all, and one (0371) because
the new authority disagreed with the oldest reader it was meant to replace.**

| | What it does | Why it exists |
|---|---|---|
| **0366** | the foundation above | the card |
| **0367** | revokes the write grants on the five objects 0366 created | **found by self-review.** 0366 §10 revoked INSERT/UPDATE/DELETE on the register and the cache by name, but assumed a NEW table starts with no write grant. Supabase's `ALTER DEFAULT PRIVILEGES` hands `authenticated` ALL on every new table in `public`, so all five came out carrying INSERT/UPDATE/DELETE/TRUNCATE. RLS still refused the three tables — but `stock_unit_availability_v` is a simple view over one table and therefore **auto-updatable**, a latent second door onto the inventory authority. 0366's sanity block checked policies and never checked grants, which is why it passed. 0367 revokes, and asserts grants from here on. It also revokes TRUNCATE, which empties a table without firing the row trigger that refuses a delete |
| **0368** | the three named numbers above, and widens the bulk guard from sofa-only to sofa/bedframe/mattress | **found by review.** `available` overstated promisable stock ~11x; and two of the five live bulk records (`DIVAN ONLY (K)`, `SONIC-L1202S-Q`) are furniture, which a sofa-only guard never covered. The guard asks the CATALOG, so a SKU the catalog does not hold cannot be judged and passes — at go-live the catalog is configuration that survives, so every real SKU has a row; today none of the five does, which is why the sofa-only guard never fired on any of them |

| **0369** | every bucket in `stock_sku_availability` is `coalesce(..., 0)`; `anon` loses its SELECT on all seven objects; the sanity block is rewritten NULL-safe and carries its own negative control | **found by review, and the sharpest of the three.** 0366 counted rows (`count(*) filter`, which returns 0 for an empty group); 0368 had to SUM `qty` so a bulk record contributes 555 rather than 1 — and `sum(...) filter` returns **NULL** for an empty group. Measured: `reserved` NULL on 73 of 74 rows, `bulk_on_hand` on 69, `incoming` on 50. Worse, 0368's own reconciliation guard was written `where sellable <> available + bulk_on_hand`, and a NULL on either side makes that predicate NULL — neither true nor false — so it never raised. **The predicate evaluated to NULL on all 74 rows: the guard was not passing, it was not testing anything.** A test believed to hold while the thing it guards is broken. 0369's guards use `is distinct from` and one of them is a deliberate negative control that proves the reconciliation check CAN fail |

| **0370** | the rollup upserts every pair (no `> 0` predicate), then RE-READS what it wrote and raises if it disagrees with the register | **found by review, and it had already caused harm.** During the window between 0368 and 0369 the view returned NULL for empty buckets, and the rollup's two predicates both read `(sellable + reserved)`: `NULL > 0` is NULL, so the INSERT skipped the row and the follow-up `update ... set qty = 0 where not exists (... > 0)` matched it and **zeroed it**. The cache said Carres held **5** units where the register held **980** — and eighteen SECURITY DEFINER functions read that cache. Repaired by re-running the rollup (980 = 980, 0 drifted rows). But the real defect was that a function whose whole job is to keep two numbers equal could write a wrong answer and return success, so it now proves its own answer and a disagreement aborts the statement that caused it |

| **0371** | `unit_availability()` gains CONDITION, and the three-argument signature is dropped | **found by review, comparing the new authority against the oldest free-stock reader in the repo.** `readFreeStock` in the To Order engine has excluded damaged goods since 2026-08-04, and said why: R4 releases a quarantined unit back to `free` keeping the condition it was released with, so a damaged unit can be free, sound and unsellable. 0366's arithmetic never asked about condition — so the moment a damaged unit is released, the AUTHORITY would offer a unit every other reader refuses. Live exposure is zero today (0 damaged units; live conditions are `new` and `exhibition`), which is the same reason To Order closed it early. The old signature is DROPPED rather than defaulted: a fourth parameter with a default leaves the wrong call resolvable, which is how this existed in the first place |

| **0372** | `stock_unit_events` gains a monotonic `seq`, and `event_at` moves from `now()` to `clock_timestamp()` | **found by review, the first time anyone READ a lineage instead of asserting the trigger fired.** Driving one Unit through a governed life in a single transaction wrote all eight events correctly and returned them as `status_changed -> unit_born -> …` — a Unit that was BORN SECOND. `now()` is the TRANSACTION start time, so every event written in one transaction ties to the microsecond and the order collapses to a uuid tiebreak. Every governed door writes several events per transaction, so this was the normal case, not an edge. MASTER §7 asks In & out for "actual time … event", and §6 asks a correction to preserve the original event and its time; an append-only history whose order cannot be reconstructed answers neither |

**Verification evidence.** All seven migrations applied to production; each sanity block passed.
Eight negative controls were run against production in a rolled-back transaction after 0366 —
duplicate id · delete · id reuse after write-off · rename · bulk reservation · hand-written total ·
the retired adjust door · editing a unit event — and **all eight fired**; the register was unchanged
afterwards (136 units · 136 ledger ids · 0 events · 0 units without an identity). After 0367 the
seven Warehouse objects carry SELECT and nothing else. After 0368 the three numbers reconcile
(85 + 893 = 978) and `stock_balances` did not move (`cache_moved = 0`). After 0369, across the same
74 rows: **0 NULL buckets** in any of the eight columns, the reconciliation guard passes for real
and its negative control proves it can fail, and **0 grants of any kind remain to `anon`** on the
seven objects. Live figures unchanged throughout: on_hand 980 · available 85 · bulk_on_hand 893 ·
sellable 978 · reserved 2 · incoming 43. After 0370 the cache equals the register exactly (**980 = 980**, 0 drifted
rows), and healing was proven end to end in a rolled-back transaction against production: the cache
was zeroed deliberately, ONE unit was touched, and the statement trigger restored all 980 units for
the whole Site.

**All seven applied migrations were reconciled against their repository files** by comment-stripped
md5 — every one an exact match, so what production runs is what the repository says:

| Migration | md5 (repo == applied) |
|---|---|
| 0366 | `33ab7586e227a63366f0ba44d9c7ebc8` |
| 0367 | `a98022030312d9071a60b3b2c55d1ada` |
| 0368 | `c13fbeab0f2cb7fa4772bf9b46be3d96` |
| 0369 | `c9860a6375a0d89ebb0bc6e954170a38` |
| 0370 | `07357039f1ad66aa1bd11163a1aa43d4` |
| 0371 | `a45dea200a0556fea6bd060ae812b690` |
| 0372 | `5c3b8be145f1382c553009b42aa550fc` |

**Card §6 coverage, item by item.** Each row says how it is proven, not that it is.

| Card §6 requires | Proven by | Result |
|---|---|---|
| duplicate and reused Unit IDs are refused | production negative controls ①③ — duplicate insert, and reuse of a written-off unit's id | both refused |
| traceable goods cannot be an over-reserving bulk row | CHECK `ops_stock_items_bulk_never_reserved` + the catalog-driven trigger; negative control ⑤ | refused |
| Carres Owned and Supplier Consignment stay distinct | production controls — a third word refused, consignment-without-supplier refused, consignment-with-supplier persists, default is `carres_owned` | 4 of 4 fired |
| Site and operating party change independently | route tests: two doors, and neither call carries the other's parameter | green |
| Sales Order reservation reflected with no second Stock writer | the register has no write policy; the two raw writers now call `ops_stock_bind_units`; route test asserts no direct `.update()` | green |
| incoming, in-transit, protected and reserved absent from available | live view query — rows that are `available` while not free/sound/unreserved/undamaged | **0 leaks** |
| every derived total drills to the exact contributing ids | live query comparing each `available` against the sum of its own contributing unit rows | **0 that do not drill** |
| direct or unauthorised writes and deletes are refused | negative controls ②④⑥⑧ + the grant assertions in 0367/0369 | all refused |
| existing Purchasing, Receiving, Orders and Delivery tests green | full API suite | 2293 green |

**The one item this card does NOT prove: "incomplete".** Card §6 asks that an *incomplete* Unit be
absent from available results. Missing components/packages is not a fact the register records — there
is no column for it and no door that sets one — so nothing here can enforce it. `damaged` and the
protection reasons cover the adjacent cases. Recording completeness is Receiving's scan surface
(MASTER §5) and belongs to that card; it is named here so it is not mistaken for shipped.

**Local release gate:** shared (2474) and API (2293) suites fully green; typecheck, lint, build
clean; no server secret in the web bundle. The web suite is green on 265 of 266 files. The one
exception is **pre-existing flakiness this card did not cause and did not fix**:
`apps/web/src/pages/operation/OperationPurchaseOrders.test.tsx` (last touched by PR #858, untouched
by this branch) passes 132/132 in isolation but times out under full parallel load — three
consecutive full runs failed a DIFFERENT set of its tests each time (16, then 2, then 1), with the
drag-and-drop column-reorder tests taking 68s and 36s before failing. It is flagged for its own
card rather than papered over here.

### 12.2 · Still not built

The superseded three-tab Stock IA, the old wording, the planning-page meaning of Ready stock,
generic Held stock or Quarantine, and the claim-only issue route are all still on screen and are
still superseded. Transfers (PR #860), Counts, month-end, the Stock Register, Ready stock as
eligible Units, Showroom Sites, the partner mobile surfaces and the reports in §11 remain
**APPROVED TARGET / NOT BUILT**. `holder_party_id`, `ownership` and `last_verified_at` have their
doors but no operator screen yet — the Stock Register card owns that presentation.

## 13 · Resolved contradictions and plan state

Resolved: legacy tab shell to Warehouse destinations; On hand to Stock; Ready stock planning to
eligible Units; warehouse-only scope to all governed Sites and journeys; rollup to Unit authority;
bulk sofa to Unit identity; Quarantine to observable issue and automatic control; Receiving-only
supplier fault to Receiving and Service entrances; NETS-as-place to Site/operator separation;
one movement status to collection, transit and arrival; bulk reservation to Sales Order exact-Unit
binding; missing month-end to Stock date, window, reconciliation and version; generic task to the
shared Action contract; and hard-coded NETS to role-based partner/future-self-operation.

Intentional rejects now: duplicate Warehouse Dashboard, second exception register, manual totals,
negative stock, generic status editing, Position or slot at current scale, heavy WMS without
measured need, and assumed external cutover.

**RESOLVED FROM AUTHORITY:** Unit authority, ownership seams, shared Work and UI grammar and
upstream/downstream owners.

**APPROVED TARGET / NOT BUILT:** the rest of this Warehouse operating model and its UI — the
destinations in §2, the journeys in §5, Issues/Counts/correction in §6, the pages in §7, month-end
in §9 and the reports in §11.

**BUILT / VERIFIED:** the Unit authority foundation in §12.1 — one permanent identity, one
availability arithmetic, one governed door per fact, and no ungoverned write path left on the
register. **PRODUCTION-VERIFIED 2026-08-21**: PR #878 merged as `4246ff91`, all seven migrations
applied, and every canonical surface reports that exact SHA —
`erp.carresofficial.com` · `pos.carresofficial.com` · `carres-portal.pages.dev` ·
`carres-pos.pages.dev` · the API Worker's `/health`.

Measured on production after the deploy: 136 units · 136 ledger ids · **0 without an identity** ·
85 bindable · 893 bulk pieces · 978 sellable · 980 on hand · **0 cache drift** ·
**0 write policies** and **0 write grants** on any of the seven Warehouse objects ·
**exactly 1** version of `unit_availability`.

**What a BUILD chat still cannot prove**: the login-gated operator walk. The only visible change on
the Warehouse page is that `+ Adjust` is gone; nothing else in this card has a screen yet.

**REAL GAP / CONTRADICTION:** none requiring an owner decision.

**OWNER DECISIONS:** one, surfaced by this card and stated in full in §12.1 — **does an accessory
piece carry a Unit identity, or is accessory demand satisfied without exact-Unit binding?**
Recommendation: without binding, plus a governed quantity-draw door in a later card. Nothing is
blocked on the answer. Owner walk of the Warehouse page is also owed and does not block the next
card either: the only visible change is that `+ Adjust` is gone.
