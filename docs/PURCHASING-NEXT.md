# PURCHASING — WHAT IS LEFT TO BUILD

> **This file holds ONLY open work.** A card that ships is deleted from here the same day and
> its record moves to [`archive/purchasing-shipped-cards.md`](archive/purchasing-shipped-cards.md)
> · [`archive/receiving-claim-shipped-cards.md`](archive/receiving-claim-shipped-cards.md).
>
> **Why this file exists.** On 2026-08-05 the two Purchasing queue files held **6,350 lines**
> and the open work inside them was **eight cards**. Every chat had to walk past forty shipped
> cards and their verification write-ups to find what was left, so every chat skipped, and
> what a chat skips it re-invents. **Done work and to-do work may never live in one file.**
>
> **Before you open a card, read [`PURCHASING-MODULE-MAP.md`](PURCHASING-MODULE-MAP.md).**
> It says what is already on the screen. A card that rebuilds something that exists is the
> most expensive mistake this module makes.

---

## The board

| Card | Lane | What it is | Migration |
|---|---|---|---|
| **R13** | ④ R | Claims becomes a Workspace — **Customer Resolution is the gap** | none |
| **R9** | ④ R | One claim, one outcome + the split button | yes |
| **R11** | ④ R | Item Outcome is wired to the resolution | probably none |
| **R12** | ④ R | The money on a claim, and the Finance queue | yes |
| **D-DGC** | ⑧ kit | `DecisionGuideCard` — a portal-wide component | none |
| **P5** | ⑦ P | Prove it with a real PO, end to end | likely |
| **P7** | ⑦ P | To Order becomes the Planning Workspace | none expected |
| **Q15** | ⑦ P | A PO whose goods never touch a Carres floor can be finished | probably yes |
| **R14** | ④ R | Receiving sees its own Claims — **the RECEIVING lane's, not ours** | none |
| **G-MAP** | ⑦ P | A guard that fails when a Purchasing page changes and the MAP does not | none |

**Build order for the Claims lane:** `R13 → R9 → R11 → R12`. `D-DGC` ships with or before R13.

**Lane rule:** ⑥ C4 · ⑦ P · ④ R share the Purchasing pages. **Only ONE of the three at a time.**

---

# ⭐ THE CLAIMS MODEL — frozen by Loo, 2026-08-05

**Read this before R13 · R9 · R11 · R12. It replaces every earlier resolution list.**

## The layers — and they may never be collapsed into one another

```
Customer Problem  →  Supplier Response  →  Carres Resolution  →  Carres Execution
                                                          →  Stock · Finance · Demand
```

**The test that separates them:** *can both be true at the same time?* If yes, they are two
fields, not one list. That test is what removed `Return to Supplier` from the resolution list
and what split the resolution in two.

## The panel — the order is Loo's

```
The Item              what this claim is about  (today: `The goods`)
Customer Resolution   what are we doing for the customer?          ← NEW, the V1 gap
Item Outcome          what happened to this item?                  ← EXISTS, rename only
Evidence              photos
Supplier Response     what did the supplier say?
Decision Guide        live guidance under the selected option
```

## Customer Resolution — FOUR, and no fifth

```
○ Replace                   supplier provides a NEW item
○ Repair                    supplier repairs the SAME item
○ Accept As-Is              we accept it without replacement or repair
○ No Replacement Required   we no longer need another item sent
```

**Removed, and why — do not put them back:**

| Removed | Reason |
|---|---|
| `Return to Supplier` | not a resolution — **it loops back**. "Send it back and wait for their next word" leaves the claim unresolved. It is an EXECUTION move |
| `Write Off` | answers *what happened to the ITEM*, not *what we do for the CUSTOMER*. It lives in Item Outcome, where it already is |
| `Cancel Outstanding` | replaced by `No Replacement Required`. **Measured on the one live claim `SC-1014`: PO-2054 is 3 ordered / 3 received, so outstanding = 0 and `Cancel Outstanding` could not be pressed at all**, while `No Replacement Required` fits exactly. The rename changed what the option DOES |
| `Refund` | **business meaning not frozen** — supplier credit note? cash? AP offset? **Hidden until Loo rules it. Do not guess and do not delete it from this list** |
| `Reject` · `Deliver Remaining` · `Replacement` · `Return and Replace` | all SUPPLIER answers, not Carres decisions. `Return and Replace` is two concepts in one option: Resolution `Replace` + Execution `Return to Supplier` |

## Item Outcome — THREE, and they already exist

```
○ Put Back in Stock        ○ Return to Supplier        ○ Write Off
```

> **DO NOT REBUILD AND DO NOT MOVE THIS OUT OF CLAIMS.** `STOCK_HOLD_OUTCOMES`
> (`packages/shared/src/stock-hold.ts`) is imported by **exactly one file in the repository** —
> `SupplierClaimPanel.tsx` — and its endpoint `POST /operation/supplier-claims/:id/hold-resolve`
> lives under Claims. Shipped by R4 / migration **0299**, 2026-07-27.
> **Removing it leaves quarantined goods with no way out of quarantine.**

`Repaired` and `Disposed` were proposed by Loo on 2026-08-05 and are **NOT built**: 0299's
transition guard admits exactly three destinations. Adding them is a card with a migration.

## Carres Execution — FROZEN, NOT BUILT

```
Return to Supplier · Collect Defective Item · Replace First · Collect First · Exchange on Collection
```

Execution happens AFTER a resolution. **No card builds it yet**, and no card may fold one of
these into the resolution list.

## Business rules — these are laws, not UI

1. **`Replace` = a NEW item.** How the defective item is collected is an EXECUTION decision.
2. **`Repair` = the SAME item**, and it returns to the SAME customer — unless Carres decides
   the customer cannot wait, in which case the customer gets a replacement first and the
   repaired item goes to warehouse stock.
3. **Default policy: recover the defective item whenever practical** — repair for resale,
   reduce losses, preserve asset value. Not because the supplier asks; because the item has
   value to Carres.
4. **Execution is not Resolution.** Never mix them.
5. **When the supplier refuses**, the screen shows the FACT and stops:
   `Supplier Response: Rejected` · a waiting state · `Next Action: Select Resolution`.
   **Stock / Finance / Demand are NOT derived until a resolution is chosen.**
6. **Consequences are `f(Resolution, Execution)`, not `f(Resolution)`** — rule 2 is the proof:
   one resolution, two different stock outcomes, and the difference is the execution decision.

## The words — every one still needs a COPY-STANDARD row

**None of these exists in the dictionary today** (checked 2026-08-05, all zero):
`Customer Resolution` · `Item Outcome` · `The Item` · `Accept As-Is` · `No Replacement
Required` · `Supplier Response` · `Next Action` · `Resolution` · `Typical examples` ·
`What happens next` · `Refund`.

**Two collisions to settle before they reach a screen:**

- The dictionary already locked **`Case owner decision required`** (2026-07-27) for the state
  Loo spelt `Waiting Internal Resolution`. Same meaning, one must die. **Measured: the locked
  one has never appeared on any screen** — grep returns 0 across `apps/web` and
  `packages/shared`. Loo has not ruled which survives.
- **`Return`** is a locked VERB meaning *a record goes back to the party that produced it*.
  `Return to Supplier` is about GOODS. Report it; do not silently widen the verb.

---

# ④ R — the Claims lane

## R13 · Claims becomes a Workspace

**MIGRATION: NONE. Read THE CLAIMS MODEL above, then
[`PURCHASING-MODULE-MAP.md`](PURCHASING-MODULE-MAP.md) §3.4.**

**ALREADY EXISTS — do not rebuild:** the queue rail (P2 #494) · the kit table and its eight
measured column widths (D7-Claims #612) · the words (R8 #499) · the 504-line claim panel with
`Evidence` · `The goods` + its three outcome buttons · `What we asked` · `What {supplier}
answered` · `Settle it` / `Close claim` · `Closed`.

**⚠️ THE PREVIOUS PLAN'S DIAGRAM WAS WRONG AND IS CORRECTED HERE.** It described a two-tier
split as if both tiers existed. **There is no right panel on the Claims tab** — `w-[400px]`
greps 0 in `OperationSupplierClaims.tsx`, and the whole panel renders inside the kit table's
`expansion`. **R13 must CREATE the second tier**, not move things between two.

**To build**
- the panel reorganised into Loo's six regions, in his order (above)
- **`Customer Resolution` — the new field.** It is a THIRD column beside `requested_action`
  (what we asked) and `supplier_response` (what they said); it is neither of them, and R3's
  two-field design stands. *(That question is settled: Loo ruled Resolution = Carres' own
  final decision.)*
- `The goods` → **`The Item`** · the outcome block → **`Item Outcome`**. **Buttons unchanged.**
- the un-collapsible context header `PO · SKU · Supplier · DO`
- the Timeline's first four rungs from `reported_at → requested_at → responded_at → closed_at`
  — **no migration; `SC-1014` carries all four and is real data to render against**
- the Consequences region **with its pure mapping**, per business rule 6
- the **Owner**, and it is **NOT a new column**

> **Owner — measured 2026-08-05, and the previous plan named the wrong source.**
> `org_duties` does **not** hold the PO-duty holder; its six keys are `ops_manager` ·
> `po_duty_editor` · `account_creator` · `finance_approver` · `roster_editor` ·
> `stock_planner`, and `po_duty_editor` is *the person who edits the rota*.
> The rota is **`ops_po_duty`** (month → user) → `GET /operation/po-duty` →
> **`useOperationPoDuty()`, which already returns `holder.name`.**
> Live: Jul = Shasha · Aug = **Yu Jun (CR004)** · Sep = Khor Yee.
> **Zero migration, zero new API.**
> **RULED by Loo 2026-08-05: a claim keeps the holder of the month it was OPENED in, forever.
> It never changes when the month rolls over.**

**DONE WHEN** the six regions are on screen · the Timeline reads off existing timestamps with
no migration · every Consequences cell is a derived sentence and none is blank · a name
appears as Owner · **there is no create button and no `Coming soon` string anywhere.**

**MUST NOT** ❌ rebuild the page · ❌ add `assigned_to` to `supplier_claims` · ❌ move
`Item Outcome` out of Claims · ❌ let the right panel edit anything · ❌ collapse the context
header · ❌ touch `OperationReceiving.tsx`.

> ⚠️ **`OperationSupplierClaims.tsx:240` holds a NUL byte** (a sort-key separator).
> **Shell `grep` reads the whole file as binary and returns nothing without `-a`.**
> Node's `readFileSync(…, "utf8")` is unaffected, so the repo's test guards are safe.

---

## R9 · One claim, one outcome — and a button that splits it

**MIGRATION: yes. Amends R3 and R5; answers R4's carry-forward.**

**LOO RULED IT 2026-08-05: option A — a claim holds ONE outcome. Two outcomes are two claims.**
On AutoCount's own evidence: `Cancel Purchase Order` · `Goods Return` · `Purchase Return` are
three documents and none holds two outcomes. *"换 2 退 1"* is two documents there. The team
already works this way.

**The three conditions, all binding:**

**① R5 counts PROBLEM PO LINES, never claim documents.** One line with a problem is ONE
occurrence however many claims close it. Measured: `ScorecardClaim` carries `po_id` and **not**
`po_line_id`, and `claimRate` keys on `claimedPoIds`, a Set of distinct **POs**. It gains
`po_line_id` and re-keys to distinct problem LINES. **The claim STATS move with it or the fix
is half done** — `claims.open` counts distinct lines with an open claim, and the settle-time
average measures per line, to the LAST claim on that line closing. **`supplier_claims.po_line_id`
is `ON DELETE SET NULL` (0288)**, so a claim can have no line: count it **BY NAME**, never drop
it silently.

**② The split is a BUTTON on the claim screen.** One press on *"this one ends two ways"* turns
one claim into two and divides the quantity. An operator is never told to go and open a second
claim by hand — that is C1's second-receiving-door failure again.

**③ The A → B upgrade path is written down now, while it is free.** If the business ever needs
one claim to hold many outcomes, every existing claim becomes ONE child row: outcome copied,
quantity equal to the whole claim. **A is cheap to reverse and this card says so.**

**What replaced `Cancel Outstanding` — read THE CLAIMS MODEL.** It is `No Replacement
Required`, and it is a CUSTOMER RESOLUTION, not a quantity operation.

> ⚠️ **`PURCHASING-WORKING-FLOW.md` §9's frozen no-per-line-cancellation rule.** The old
> `Cancel Outstanding` design overrode it and §9 was to be updated in the same PR. **Loo's
> 2026-08-05 rename removes that collision** — `No Replacement Required` types no quantity into
> any column. **§9 therefore stands unamended, and the builder must NOT edit it.**

**Also closed by this card:** R4's carry-forward `hold-resolution-is-per-claim-not-per-unit`
— under A that is correct behaviour, not a limitation. Mark it closed **by ruling** in the CF
file; do not delete it and do not build its proposed `p_item_ids` narrowing.

**DONE WHEN** a claim carries exactly one Customer Resolution and the TYPE makes a second one
unrepresentable · the split button turns one claim into two with the quantity divided, and no
screen tells an operator to open a claim by hand · R5's claim rate, open count and settle
average are all keyed on the problem LINE, and a split provably moves none of them (assert it:
two claims from one line read the same as one) · a claim with a NULL `po_line_id` is counted by
name.

**MUST NOT** ❌ let one claim hold two Customer Resolutions · ❌ leave R5 counting claim
documents · ❌ make the operator open the second claim themselves · ❌ type a cancelled
quantity into an arithmetic column · ❌ invent a word · ❌ touch the Receiving queue model.

**Timing: NOW.** Live today: **1 claim**, a full-lifecycle test row. Re-verify before building.

---

## R11 · The Item Outcome is wired to the resolution

**MIGRATION: probably none — prove it. Read THE CLAIMS MODEL first.**

**Goal:** choosing a resolution moves the goods, once, through the machine that already
exists — never a second thing an operator has to remember.

**ALREADY EXISTS, and it is why this card is small.** R4 / 0299 already ships the outcomes:

```
Return to Supplier   →  returned_to_supplier    ✅
Write Off            →  written_off             ✅
Accept As-Is         →  back_to_stock           ✅
Replace              →  the receive engine      ✅
Repair · No Replacement Required   →  no stock move by themselves
```

**Nothing new is built. This is WIRING.** A chat that proposes new stock statuses has not read
0299.

**DONE WHEN** the stock move is a consequence of the resolution, and 0299's transition guard
still refuses every illegal destination (`on_hold` may never reach `reserved`, `sold` or
`transferred`).

**MUST NOT** ❌ add a parallel stock table · ❌ re-open R4's carry-forward — R9 closes it by
ruling · ❌ gate the stock move on the claim closing: goods and paperwork move on different
days (R4's own rule).

---

## R12 · The money on a claim, and the Finance queue

**MIGRATION: yes. Its action needs five strings in `docs/COPY-STANDARD.md`.**

**Goal:** a resolution with a financial consequence raises ONE action, owned by Finance, that
completes on evidence from OUTSIDE the portal.

**ALREADY EXISTS: nothing — and that is the measurement.** `supplier_claims` has **28 columns
and not one is money** (re-verified 2026-08-05), and `supplier-claim.ts` says so in its own
header. The cost sits in `purchase_order_lines.cost` and the claim has never read it.

**A Finance Action completes when an EXTERNAL EVIDENCE reference is recorded** — the supplier's
credit-note or debit-note number, or the AP adjustment reference. **The Portal does not perform
accounting.** It owns *this must be done* and *it is done*. That is why
`PURCHASING-WORKING-FLOW.md` §8's ban on tick-box completion does not kill this queue.

**2990s is the worked example of getting it wrong:** its `purchase_returns.credit_note_ref` is
free text a human types, and its only readers in that whole repository are the PDF that prints
it and the detail page that displays it. **It has the field and no action.**

**Jess's locked rule, and why it does not block this card:** *"supplier claims never produce a
Credit Note — credit notes are Finance-only for billing mistakes."* Hers is the credit note
**Carres issues to a customer**; this queue records the one **a supplier issues to Carres**.
Two directions of money wearing one word — if a screen ever shows both, they need separate
words, and that is a business decision.

**DONE WHEN** Finance has a queue of its own · Operations never sees AP · Finance never sees
photos · every item completes on a reference from outside the portal · `Accept As-Is` can carry
a discount.

**MUST NOT** ❌ build a tick-box completion · ❌ build AP, a supplier ledger or a credit-note
document · ❌ let a money figure reach the Claims screen.

---

## R14 · Receiving sees its own Claims — **THE RECEIVING LANE'S CARD, NOT OURS**

**Measured 2026-08-05: `OperationReceiving.tsx` mentions `claim` exactly ONCE in 983 lines.**
Receiving is blind to what it produces, and a claim is born from a receiving exception — so the
Receiving summary should carry `Claims · n open · n closed` without switching tabs.

**⚠️ NO PURCHASING SIBLING CHAT MAY BUILD THIS.** The carry-forward
`receiving-queue-model-architecture-review` carries Jess's ruling of 2026-08-03: *"Do not modify
the Receiving module in this Purchase Orders workstream."*

> **UNRESOLVED, and somebody must say which reading is right:** Q14 — a Purchase Orders
> workstream card — **edited `OperationReceiving.tsx`** on 2026-08-05 (it removed both call
> buttons and their dead state). Either Jess's ruling is narrower than it reads (the RAIL only),
> or Q14 crossed it. **Until it is settled, the next card guesses.**

---

# ⑧ kit

## D-DGC · `DecisionGuideCard` — a portal-wide component

**Lane ⑧ (`components/kit/**`). MIGRATION: none. Ruled by Loo, 2026-08-05.**

**It is NOT a Claims feature.** *"This should become a Carres UI pattern."* Building it inside
Claims locks it to one page, which is the thing this card exists to prevent.

**The problem it replaces:** a dropdown plus a `?` tooltip. Loo's reasons, and they are the
standard ERP finding: users do not discover tooltips · mobile cannot hover · staff stop reading
after the first week.

**The pattern** — one card, directly under the selector, updating live:

```
Resolution
  ○ Replace     ○ Repair     ●  Accept As-Is     ○ No Replacement Required
────────────────────────────────────────────
Accept As-Is
Keep the goods without replacement.

Typical examples
• Minor cosmetic defect   • Colour variation   • Customer accepts the item

What happens next
✓ Customer receives the goods   ✓ Stock is released   • Finance action may be required
```

**Rules**
- exactly ONE card visible at a time · updates instantly on selection
- **never a hover tooltip for business guidance**
- description 1–2 sentences · **max 3 examples · max 3 outcomes**
- facts, never implementation detail
- **content comes from a CONFIGURATION OBJECT, never hard-coded in the component** (Loo's
  own instruction) — so Purchasing, Receiving, Delivery and Payment reuse it unchanged

**Where it goes next** (recorded, not built): `Deliver To` · `Receiving Method` ·
`Purpose (Customer Order / Ready Stock)` · `Delivery Status` · `Payment Result`.

**The Claims content is business-frozen — Code may not reword it.** It is written out in full
in Loo's own words in the session record; the four Customer Resolution entries and the three
Item Outcome entries carry Description / Typical examples / What happens next.

**MUST NOT** ❌ hard-code any copy inside the component · ❌ ship it as a Claims-only
component · ❌ invent a token value · ❌ put a business decision behind a tooltip.

---

# ⑦ P — the Purchasing lane

## P5 · Prove it with a real PO

**MIGRATION: likely. Draft to Jess first.**

**Goal:** the whole line has never run end to end. Take one real customer order from To Order
through `Issue PO` → ready date → tomorrow's call → check in (part) → balance call → fully
received, and fix whatever breaks.

**This is a card, not a test plan.** Every earlier card is theory until one PO goes the whole
way.

**Build / fix as found**

1. **Two gates with no home yet:** a PO cannot be issued twice for the same customer line and
   quantity; a check-in cannot be posted twice for the same supplier DO number.
2. **Whoever is on an action shows on it** (`Yu Jun is handling this · started 10:14`).
   Everybody sees everybody's work, so two people WILL open the same action. Store it as a
   lightweight claim — `(action identity) → claimed by → claimed at` — expiring on
   `ACTION_CLAIM_TIMEOUT_MS` (**already exported from `packages/shared/order-actions.ts`;
   import it, never retype the number**), read ONLY through the open-action list so a finished
   or recomputed-away action cannot carry one (flow §5). **`ops_tasks` has `claimed_by` /
   `claimed_at` and is still the WRONG home** — minting a task row per engine action turns the
   ladder back into a manual to-do list. **Reuse the shape, not the table.**
   *(This is also the mechanism R13's Owner uses when a human takes over from the duty holder.)*
3. **One PO really does carry several customers' lines, and one customer order really does need
   several POs.** Prove both on the real run, not on a fixture.

**`cancelled_qty` is NOT in this card** (Loo 2026-07-28): purchasing does not model a
cancellation. Stopping is the whole PO (`purchase_orders.status='cancelled'`, already built).

**`Confirm ready date` — CLOSED since this card was written.** Migration **0318** built the
door (`purchasing_record_ready_date`), and Q5 wired the button on the Purchase Orders expand.
**Do not rebuild it; verify it on the real run.**

**DONE WHEN** one real PO has gone the whole way including a short delivery, and every number
on screen matches what actually happened.

---

## P7 · To Order becomes the Planning Workspace

**MIGRATION: none expected.** To Order stores no work-in-progress object (Loo, 2026-07-30).

**READ FIRST, BOTH IN FULL:** [`PURCHASING-INFORMATION-MODEL.md`](PURCHASING-INFORMATION-MODEL.md)
(frozen 2026-07-29) and [`PURCHASING-WORKING-FLOW.md`](PURCHASING-WORKING-FLOW.md) §1 · §7 · §9.

**✅ The terminology is frozen — P6 ruled all eight slots.** Nothing here is blocked on a word.

**ALREADY EXISTS — do not rebuild:** the plan engine · the order-by computation · the urgency
buckets · the working-day calendar · the settings store (P1/0303) · the facet rail and the
§8.2 click behaviour (P2/#492) · the freshness stamp · the `Set a number` output.

**The measured gaps this card carries** — facts, measured 2026-07-29 and 2026-08-04:

| # | Gap | Where |
|---|---|---|
| **G1** | **Demand whose supplier cannot be resolved is silently discarded** — no output anywhere. It must appear under Missing configuration stating the customer order, the item, the category, the quantity and why resolution failed | `routes/operation/purchase.ts` |
| **G2** | **Supplier resolution runs by TWO different rules in one module.** Planning resolves by the item's own supplier alone; PO creation also falls back to which categories a supplier covers. **One rule, shared** | `purchase.ts` + `CreatePOModal.tsx` |
| **G3** | **Intentionally held demand produces no output at all.** It must state **what · who · why · until when**, and may never share a status or an empty state with Missing configuration | `purchase.ts` |
| **G5** | **`Check in` must leave To Order, and no information may leave with it.** To Order states the customer name / SO number per entry; Receiving does not carry that fact. **Receiving gains PO · supplier · customer name · SO number · warehouse · ETA · quantity still to receive FIRST** | To Order → Receiving |
| **G8** | **The group header's bare date carries TWO facts under NO word** — a customer order's `Customer Delivery` and a typed demand's `Required By`, same slot, same format, no label. `TO_ORDER_WORDS.colPreferred` is pinned to `Customer Delivery` so the ruled word is ready | frozen header — layout + copy decision |
| **G9** | **Three ruled words have no screen consumer** — `colPreferred` · `colSoNo` · `colCustomer`. **`colPreferred` must NOT be deleted: G8 needs it.** Which of the others survive is P7's composition question | COPY decision |
| **G10** | **The `PO No.` cell holds a STATUS word and an ACTION button in one column** (`Yet to Order` + `Cancel`). §12.3 forbids it. Splitting costs a column on a grid whose widths Loo froze | composition decision |

**NOT P7's — it belongs to lane ⑧:** `DataTable` hands out `resize` and `reorder` through ONE
`layout` prop, so no page can answer §13.3 per power.

**Order of operations**
1. **The shape decision first, written down before any code:** UI-KIT §8.2's stage-vs-queue test
   applied to the NEW composition. **The test is the empty state, never the look.**
2. **G5 before the removal.** Receiving gains the facts first; the other order deletes
   information.
3. Anything blocked on a word waits for Jess. **Report it; do not name it.**

**DONE WHEN** no real procurable demand can leave the purchasing workload silently · held demand
states who held it and until when · `Check in` has left To Order without a single fact being lost.

---

## Q15 · A purchase order whose goods never touch a Carres floor can be finished

**MIGRATION: probably yes — the fulfilment record. NOT a Receiving screen (§1's role-anchor rule).**

**THE RULE IS ALREADY FROZEN AND THIS CARD ONLY BUILDS IT** (Loo 2026-08-05, written into
`PURCHASING-WORKING-FLOW.md` §9 and `RECEIVING-INFORMATION-MODEL.md` §1.1 · §1.2):

```
PO Complete   ←  supplier fulfilment confirmed
GRN           ←  the Receiving Session, and nothing else
Inventory     ←  Receiving, and nothing else
```

**TWO PATHS:**

```
into a Carres warehouse       → the Receiving Session IS the confirmation. NO button
never touches a Carres floor  → Operation confirms explicitly
    a carrier takes it to the customer, OR the customer collects at the factory
```

**Customer self-collection is the SECOND path, not a third** (Loo, answering directly).
Fulfilment asks one question — *did the supplier hand the goods over?* — and both answer it
identically. Who carries the goods is a DELIVERY fact with its own home; the only difference is
EVIDENCE, which rides the record's note. **Build ONE confirm act for the second path, and do
not add a `self_collect` path value.**

**THE GRAIN IS SETTLED — PER LINE.** *"本来就是一项一项"*. A line finishes by its own path; the
PO finishes when all its lines have. **A MIXED purchase order is normal**, so nothing may ask
*"which path is this PO on?"* and a mixed PO is never refused at issue.

**MEASURED LIVE — one real purchase order is stuck today.** `purchasing_destinations` holds
`Carres Klang` (warehouse-linked) · `AL Sungai Buloh` (address only, **2 PO lines**) · `HOUZS`
(address only, 0). Both address-only lines are on **PO-2032**, nothing can ever receive them,
so `received >= ordered` is unreachable and that PO can never read `Completed`.

**`which path` is a STORED value of the fulfilment record**, never a re-derivation of the
destination — a destination can be edited afterwards and the record must keep saying how the
goods actually went.

**Free measurement, do not re-derive:** a destination with `warehouse_id is null` can never
produce a Receiving Session (0307's constraint). **What is missing is the RECORD of the
confirmation, not the ability to tell the paths apart.**

**DONE WHEN** a direct-to-customer line can be confirmed fulfilled by Operation and its PO can
reach `Completed` · the record names who · when · which path · `received_qty` is provably
untouched by that act (assert it) · the warehouse path gains **no** new button · nothing in
Receiving changes.

**MUST NOT** ❌ write `received_qty` or any receipt to close a direct-ship line · ❌ build it as
a Receiving screen · ❌ invent a word · ❌ decide the mixed-PO question in code.

---

## G-MAP · The map cannot go stale without the build failing

**Lane ⑦ P (or whoever ships next). MIGRATION: none. Small.**

**Why.** [`PURCHASING-MODULE-MAP.md`](PURCHASING-MODULE-MAP.md) is only worth reading while it
is true, and *"update it in the same PR"* is a sentence in a document — **which is exactly the
kind of rule this module has watched get skipped.** Every UI rule in this repo must eventually
become a structure the code can enforce (CLAUDE.md); this is that structure for the map.

**Build.** A test that reads the diff against `origin/main`:

```
this PR changes any of
    apps/web/src/pages/operation/OperationToOrder.tsx
    apps/web/src/pages/operation/OperationPurchaseOrders.tsx
    apps/web/src/pages/operation/OperationReceiving.tsx
    apps/web/src/pages/operation/OperationSupplierClaims.tsx
    apps/web/src/pages/operation/OperationPurchasingReport.tsx
    apps/web/src/pages/operation/OperationPurchasingSettings.tsx
    apps/web/src/pages/operation/PurchasingTabs.tsx
    apps/api/src/routes/operation/{to-order,pos,purchasing-settings,supplier-claims,warehouse-receipts}.ts
        AND NOT docs/PURCHASING-MODULE-MAP.md
                            ↓
                          FAIL
```

**DONE WHEN** the guard fires on a real edit to each of the seven page files, and passes when
the map is edited too · the failure message names the file that changed and the six-line
checklist from the map's §1 · a PR that touches only tests or comments in those files is not
blocked from stating so.

**MUST NOT** ❌ compare against a hard-coded commit — measure against `origin/main` ·
❌ require a specific SECTION to change (unenforceable, and it invites a one-character edit) ·
❌ read `OperationSupplierClaims.tsx` from a shell without `-a` — **it holds a NUL byte at line
240 and shell `grep` returns nothing.** Node's `readFileSync(…, "utf8")` is safe.

---

# Reported, not built — recorded so nobody rediscovers them late

- **PO revisions — RULED OUT, not deferred** (Loo 2026-07-28). A sent PO is never edited: more
  items means a NEW PO, and stopping one means cancelling the whole PO.
- **The finer quantities** (`in_transit_qty`, `ready_for_collection_qty`,
  `supplier_confirmed_qty`) — a column nobody writes is worse than a missing one.
- **The September switch.** Nice Future stops supplying in September; a new mattress supplier
  takes over on the subscription model. Sofa and bed frame unchanged. Its own line when it comes.
- **`Confirm tomorrow's delivery` has a door on Purchase Orders and no queue tile anywhere.**
  `PURCHASING-WORKING-FLOW.md` §1 / §7 still assign it to Receiving. ⑦ P's to settle.
- **Receiving's rail is a STATUS model where Jess ruled a QUEUE model** (`To Receive` /
  `Received`, and no `GRN` tab ever). CF `receiving-queue-model-architecture-review`.
- **No post-receipt supplier claim exists.** A latent fault found a week after receiving has no
  supplier-claim route — it is a service case. CF `hold-entry-only-from-incoming` names the
  price: the entry rule and the refurbish door must be settled in the SAME change.
- **The Claims facet rail filters a table holding 0–5 rows** for the foreseeable future.
  Law vs reality; reported, not changed.
