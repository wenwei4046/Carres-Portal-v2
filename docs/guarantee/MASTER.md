# GUARANTEE & SERVICE PACKAGE — MASTER

> **The only Guarantee document.** Overwritten when re-ruled; never versioned.
> **You read `CLAUDE.md` and this file.**
>
> **MISSION** — a guarantee and a care plan are the SAME object: it attaches to an item, it has
> a clock, and it gets used up. **Only the visit COUNT differs — a guarantee is a care plan with
> one visit.**
>
> **WHAT IS ON SCREEN TODAY** — `OperationGuarantees.tsx` **308 lines** (the claim desk) + a POS
> covered-item picker + an invoice cover block + a `GuaranteeCoverStrip` on both order-detail
> surfaces. *Measured 2026-08-05 from file size and the shipped card records; **not read line by
> line.*** **SHIPPED and sellable** (migrations 0261-0263, 0274) — unlike the sofa / PWP /
> delivery engines it does **not** ship dormant.
>
> **APPROVED EVOLUTION** — a recurring plan counts visits REMAINING but not when they are DUE,
> so nothing can say *"this customer is owed a clean this month"*; fine for the pilot, needs a
> due date before volume. And a sellable care plan now lives in `guarantee_terms` while the
> RENTAL-included package still lives in `service_packages` — **two registries for one
> concept**, closed when the rental path is re-pointed.

---


**Status**: SHIPPED (migrations 0261-0263). Unlike the sofa / PWP / delivery engines this does
**not** ship dormant — Loo asked for it sellable from day one.

---

## 1. The business

Carres sells a **guarantee package** on top of the manufacturer warranty.

v1 product: **Mattress Guarantee — RM150 · 15 years · one-for-one replacement.**
If the mattress fails inside the window we do **not** repair it — we hand over a new mattress.

Why it is its own SKU category and not an accessory or a service SKU:

- it is not goods (no PO, no supplier, no stock, no delivery leg) and not labour either —
  it is a **liability Carres carries for 15 years**;
- ops must be able to answer "who bought a guarantee, on which model, is it still alive"
  from the category alone;
- the POS has to **gate** it: a guarantee only sells attached to the item it covers.

## 2. Loo's three rulings (in conversation, 2026-07-26)

| # | Ruling | Why it was the call |
|---|---|---|
| 1 | **The clock starts on DELIVERY**, not on the order date | International practice (Sealy / Tempur / IKEA all run from delivery) and the customer doesn't lose the 3 months they spent waiting for stock. Cost: the expiry date reads "—" until delivery. |
| 2 | **1 guarantee : 1 unit** | The whole feature exists so a claim can be traced to *one* model. Two mattresses = two guarantees; a qty-2 guarantee line mints two entitlement rows. Order-level cover would make a K+S order ambiguous at claim time and uncap the swap cost. |
| 3 | **A claim is ONE-SHOT** | The swap fulfils the promise. The replacement carries no cover unless the customer buys another guarantee. Keeps the liability bounded and the ledger terminal. |

## 2b. The guarantee ID (0267, Loo 2026-07-26)

Every guarantee carries a **`ABCD123456`** handle — 4 random letters + 6 random digits — minted
server-side the moment the Sales Order is created. All tracking is by this ID.

The two blocks are positional, which is what makes it safe to read aloud and retype: a letter can
only appear in the first four slots and a digit only in the last six, so **O-vs-0 and I-vs-1 are
never ambiguous** off a printed document.

**It also lands on the order line.** The mint trigger writes it back into
`order_lines.attrs.guarantee.ids` AND appends `Guarantee ID: …` to `attrs.remark`, which
`lineConfigBits` already prints as `✎ …` on the order drawer and the Sales Order PDF — so the
customer's own paperwork carries the ID with no template change. An operator-typed remark is
preserved, not clobbered.

**A claim retires the ID.** `guarantee_id` is cleared (it leaves the live space and can never be
claimed twice — Loo's "被 claim 之后这个 ID 就会被删除") and the spent string moves to
`claimed_guarantee_id`. That column is deliberate: without it a customer presenting an old ID gets
"not found", which reads identical to a fake or a typo; with it, ops can say "claimed on 3 March".
Both columns are searched, and a spent ID renders struck-through everywhere it shows.

## 3. Data model (0262 + 0267)

```
guarantee_terms          -- config, principal-owned
  guarantee_sku PK · label · covers_category · coverage_years · remedy · terms_text · active

guarantee_entitlements   -- the ledger: ONE ROW PER COVERED UNIT
  order_id · order_line_id · guarantee_sku · unit_no
  guarantee_id · claimed_guarantee_id                               <- 0267, the handle
  covers_line_id · covers_sku · covers_model_id · covers_label      <- snapshot
  customer_id · customer_name · customer_phone · phone_key          <- the 3 track-back axes
  coverage_years · remedy · starts_on · expires_on · status
  claimed_at · claimed_by · claim_case_id · claim_notes · replacement_sku · void_reason
```

**Everything about the covered item is snapshotted.** A model rename or a discontinued SKU
fifteen years from now must never orphan a claim.

### Lifecycle

```
sold ─────────────► pending ──(orders.delivered_at set)──► active ──(guarantee_claim)──► claimed
                       │                                     │
                       └──(order cancelled / line removed)────┴──► void
                                                             │
                                              (expires_on < today, DERIVED) ──► expired
```

`expired` is **never written**. It is derived on every read by `effectiveGuaranteeStatus()`
so nothing depends on a nightly job having run. Any raw-SQL report must apply the same rule.

## 4. Scope: the POS is the only order entry, and history is out of scope

Loo, 2026-07-26: **every order from here on is entered through the POS** — the orders visible in
the system today are the legacy testimony orders carried over at migration, and **no Guarantee
Program existed then**, so there is deliberately **no backfill and no historical handling**. Old
orders simply have no entitlements, which is correct: nobody was sold one.

That makes exactly **two** doors a guarantee line can come through in practice, and BOTH are
gated by the covered-item picker:

1. selling one in the POS cart (`CatalogStep`);
2. adding one to an order that already exists (`AddProductOverlay`).

The trigger below still covers the other three RPC paths — free, and it means a future door
(bulk import, a script, an API client) cannot mint an unguarded guarantee.

## 5. Why a trigger, not RPC edits

A guarantee line can enter an order through **five doors** today: `create_order` (0089),
`add_order_lines` (0231/0232), `replace_order_lines` (0255/0256), the change-request approve
path (0233/0257) and the AutoCount import (0132/0237). Patching five RPCs leaks; one
`AFTER INSERT` trigger on `order_lines` closes every door at once, permanently.

The same trigger does a second job: **backfill**. `create_order` inserts lines in cart order, so
the guarantee line can land *before* the mattress it covers — `covers_line_id` is resolved from
whichever side arrives second.

Perf (CLAUDE.md §8): the orders trigger carries a `WHEN` clause (status / delivered_at /
customer_name / customer_phone only); the order_lines trigger costs one PK probe on a tiny
config table plus one partial-index probe per inserted line.

## 6. Surfaces

| Where | What |
|---|---|
| **Catalog → SKU Master** | A `Guarantee` filter chip. Guarantee SKUs have no supplier and can never enter a PO (`SUPPLIERLESS_CATEGORIES`). |
| **POS — sell** | A `Guarantees` rail. Tapping the card opens the **covered-item picker** — it cannot be added on its own. The pick is stamped into `attrs.guarantee.covers_sku` (the exact path the trigger reads); the submit pipeline is untouched. |
| **POS — add to an existing order** | `AddProductOverlay` routes the guarantee card through the SAME picker, choosing from the order's existing lines. Without this it would fall through to the generic configure drawer and add bare. |
| **Invoice PDF** | A bordered **Guarantee cover** block under the totals: what it covers, how long, the remedy in words, and the end date. The customer's only written proof. Voided entitlements are excluded. |
| **Customer block** (ops drawer + POS order detail) | `GuaranteeCoverStrip` — silent when there is no guarantee, so the ~190 pre-guarantee orders look untouched. |
| **Operation → Guarantees** | The claim desk. A **Guarantee ID** column leads the table; one search box resolves the ID first (live OR retired), then SO / name / customer id / phone. Status filter + the one-shot **Claim** action. |
| **Service Cases** | A claim can carry `claim_case_id`; the existing `warranty_claim` case type is where the follow-up work lives. |
| **Sales Orders Register** | **APPROVED optional `Guarantee` column** (Loo, 2026-08-11), selected and persisted through the Register's governed `Columns` control rather than added to the locked default columns. It summarises only entitlements actually sold on that SO. Pending cover shows `{years}y · Starts on delivery`; active/expired cover shows the derived lifecycle word and the real `starts_on–expires_on` range; no cover shows `—`; multiple unit-level entitlements show a count and open their owned detail. Filters: With guarantee · Without guarantee · Starts on delivery · Active · Expired · Claimed. Expiry is derived on every read, so the Register changes to `Expired` without a manual status update or nightly job. |

## 7. Security

- Reads are RLS-scoped: internal sees all; a store sees only its own orders' guarantees
  (that is what powers the POS badge).
- `guarantee_claim` and `guarantee_attach` are `SECURITY DEFINER` RPCs that re-check
  `is_operation()` (operation **or** principal) server-side. The route gate is the friendly
  403; RLS + the RPC are the real boundary. Finance is deliberately excluded — the claim
  moves goods, not money.
- Every claim writes an `order_history` row (guardrail 4: no silent movement).
- Terms are principal-write-only.

## 8. Known gaps (carry-forwards)

See `docs/carry-forwards.md` for the full entries:

- `guarantee-claim-no-stock-movement` — the claim records the swap but does not move stock or
  raise a replacement line; ops issues the replacement by hand.
- `guarantee-terms-no-admin-ui` — coverage years / covered category are seeded by migration;
  only the price is editable in the UI today.
- `guarantee-attach-no-ui` — LOW in practice: both POS doors force attachment, so an unattached
  entitlement can now only come from hand-written SQL or a future non-POS door. The
  `guarantee_attach` RPC + route exist as the repair path; the desk shows "Not attached to an
  item" but has no button yet.
- `guarantee-pos-one-per-add` — the picker adds one unit per tap by design.
