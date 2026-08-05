# CHECKPOINT — Claims (Purchasing's Exception Workspace)

> **Written 2026-08-05 by the Claims PLAN chat, at the end of its session.**
> **Everything below was RULED BY LOO on 2026-08-05 unless marked otherwise.**
>
> **This file is a resume point, not a law file.** The laws are
> [`docs/receiving-claim-execution-queue.md`](receiving-claim-execution-queue.md) (the cards),
> [`docs/PURCHASING-WORKING-FLOW.md`](PURCHASING-WORKING-FLOW.md),
> [`docs/PURCHASING-INFORMATION-MODEL.md`](PURCHASING-INFORMATION-MODEL.md),
> [`docs/COPY-STANDARD.md`](COPY-STANDARD.md) and
> [`docs/ACTION-FLOW-STANDARD.md`](ACTION-FLOW-STANDARD.md).

---

## 0 · WHICH CARD SITS ON WHICH TAB — read this first

**Purchasing has SIX tabs**, not five (`PurchasingTabs.tsx`, measured 2026-08-05):

```
To Order · Purchase Orders · Receiving · Claims · Report · Settings
                                                   ↑ Q3 shipped it
                                                              ↑ manager-only
```

| Card | **TAB it lands on** | Lane | Migration |
|---|---|---|---|
| **R13** · Claims becomes a Workspace (W-1) | **Claims** | ④ R | **none** |
| **R9** · one claim, one outcome + the split button | **Claims** | ④ R | yes |
| **R11** · the Inventory consequence executes | **Claims** (the door) — no other page | ④ R | probably none |
| **R12** · the money on a claim + the Finance queue | **Claims** reads it · the QUEUE is a **NEW Finance surface**, NOT a Purchasing tab | ④ R + Finance | yes |
| **R10** · `PURCHASING-WORKING-FLOW.md` §9 vs the code | **no tab — DOCS ONLY** | ⑦ P's file, ④ R's finding | none |
| **R14** · Receiving sees its own Claims | **Receiving** | **⚠️ THE RECEIVING LANE'S — not ours** | none |

**Build order:** `R13 → R9 → R11 → R12`. **R10 any time. R14 is somebody else's.**

**Only R13 · R9 · R11 · R12 belong to the Claims chat.**

---

## 1 · What Loo ruled on 2026-08-05

1. **ONE claim ends in ONE outcome** (option A) — on AutoCount's own evidence: its
   `Purchase Return` / `Goods Return` / `Cancel Purchase Order` are three documents and not
   one holds two outcomes. **Three conditions, all required** — R5 counts problem PO **lines**
   not claim documents · splitting is a **BUTTON** never "go open a second claim" · the A→B
   upgrade path is written down so the choice stays reversible.
2. **`Cancel PO` is not a resolution. It is `Cancel Outstanding`** — this line's
   not-yet-arrived quantity only. A claim is one line; a PO carries many customers' goods.
3. **A resolution has THREE consequences** — Inventory · Finance · **Demand**.
4. **`Accept As-Is` may NOT be hard-coded to no financial consequence** — the discount
   settlement is the commonest one in furniture.
5. **The Finance queue stays.** A Finance Action completes on an **external evidence
   reference** (the supplier's CN/DN number), never a tick-box.
6. **Claims is a missing LAYER, not a broken module.** Queue · List · Expand · Data · Status
   all already exist. **Do not rebuild the page.**
7. **The reference model is SAP QM, not Zendesk.** Workflow may be borrowed from Zendesk; the
   DATA MODEL may not.
8. **Owner ranks above the Timeline** — but it is DERIVED from `org_duties`, never a new
   `assigned_to` column.
9. **Change the model NOW** — `supplier_claims` holds 0 rows, so there is no backfill and no
   real money to touch. **No card may propose a backfill.**

**Decided by the PLAN chat, not escalated (a sequencing call, not a business rule):** W-1's
Resolution region reads today's `requested_action` + `supplier_response` and does **not** wait
on R9 — on Loo's own argument that the business decision already exists.

---

## 2 · The measurements this all rests on (2026-08-05, live prod)

```
supplier_claims        0     ← not one has ever existed
purchase_orders       21     purchase_order_lines  35     units ordered  42
received / damaged / wrong    0 / 0 / 0
warehouse_receipts     0     receiving_events  0     units on_hold  0
suppliers             10     stock_items      129

first arrival dates    12 · 13 · 19 · 25 Aug   (16 of 21 POs carry NO date)
```

**The Claims tab is empty because its upstream has never run. That is not a Claims defect.**

Code facts, measured and not to be re-derived:

```
supplier_claim_close (0291:389-460)   writes supplier_claims · po_history · audit_log
                                      touches NO purchase_order_lines column, NO PO status
To Order's real supply figure         Σ(qty − received_qty) over status='open' POs
   (to-order.ts:542-557)              — NOT §9's published required_qty > po_qty
supplier_claims                       28 columns, NOT ONE is money
SupplierClaimPanel.tsx                504 lines, grep "timeline" = 0
OperationReceiving.tsx                grep "claim" = 1  (the whole file)
claim actor columns                   reported_by · requested_by · responded_by · closed_by
                                      — all PAST events, none is an owner
claimNextMove().owner                 "carres" | "supplier" — a SIDE, not a human
```

---

## 3 · FINDINGS REPORTED, NOT FIXED — the next chat inherits these

### 3.1 · ⚠️ Q14 moved two doors off Receiving, and two FROZEN tables did not follow

**Measured on `origin/main` 2026-08-05, after Q14 (PR #629) shipped.**
`PURCHASING-WORKING-FLOW.md` **§1 (FROZEN by Loo 2026-07-29)** and **§7** both say:

```
Receiving   Confirm tomorrow's delivery · Check in · Confirm balance delivery date
```

**The code no longer agrees:**

```
OperationReceiving.tsx        renders ONLY  purchasingActionQueue("check_in")
OperationPurchaseOrders.tsx   renders       purchasingActionQueue("confirm_balance_delivery_date")
```

**And `Confirm tomorrow's delivery` has NO queue tile on ANY page in the portal** — grep
returns 0. Its door moved and its queue did not follow, which is the exact split the "queue
and door in one place" ruling exists to prevent.

**Three things for whoever picks this up:**

1. **§1's deadline-anchor rule is the governing, measurable rule and it is now stale.** Either
   the rule re-rules, or the code moved past it. **A frozen rule that the code has left behind
   is the R10 disease again** — and this one is bigger, because §1 decides which tab owns
   which action for the WHOLE module.
2. **§1 gives `Purchase Orders` no actions at all.** It now owns two.
3. **This is NOT the Claims chat's to fix.** It is ⑦ P's file and ⑦ P's pages.

### 3.2 · ⚠️ A governance precedent that contradicts my own R14

The open carry-forward `receiving-queue-model-architecture-review` carries Jess's ruling of
2026-08-03: *"Do not modify the Receiving module in this Purchase Orders workstream."*

**Q14 — a Purchase Orders workstream card — edited `OperationReceiving.tsx`** (it removed both
call buttons and their dead state).

**Either Jess's ruling is narrower than it reads (the RAIL only), or Q14 crossed it.** R14 in
this lane is written on the strict reading and is marked as the Receiving lane's.
**Somebody has to say which reading is right, or the next card guesses.**

### 3.3 · Receiving's `Current Action` column can now say only `Check in`

Q14's own report names it and defers it to the Receiving module. A column with one possible
value is a column doing no work.

### 3.4 · The Claims facet rail filters almost nothing, by design

UI-KIT §8.2 requires every list to behave identically, so Claims carries a Supplier / Problem
facet rail. **This page will hold 0–5 rows for the foreseeable future.** 200px of chrome
filtering nothing. **Law vs reality — reported, not changed.**

### 3.5 · Words that are owed

- **The module has no protagonist VERB.** COPY-STANDARD locks six (`Assign · Call · Issue ·
  Upload · Close · Return`). The panel already says **`Settle it`**. `Resolve` would be a
  seventh. **Loo has not ruled which.**
- **`Coming soon` is REFUSED** — not in COPY-STANDARD, a promise about the product rather than
  a fact about the claim.
- **R12's Finance Action needs its five strings.**
- **Two directions of money wear one word.** Jess's locked rule bans the credit note **Carres
  issues to a customer**; R12 records the one **a supplier issues to Carres**. If a screen ever
  shows both, they need separate words.

### 3.6 · Older, still open

- `hold-resolution-is-per-claim-not-per-unit` (R4's) — **closed by RULING, not by code**: Loo
  chose option A, so one claim holds one outcome and splitting is a button.
- `supplier-claim-data-is-thin` / `supplier-contact-data-is-thin` — 5 of 10 suppliers have no
  WhatsApp group and 0 of 10 have a phone.

---

## 4 · Paste this to resume in a new chat

```
You are my PLAN chat for the Claims tab (Purchasing). You write cards, NO code.

READ FIRST, in this order:
  docs/HOW-TO-RUN-A-CHAT.md            (the 跟 LOO 合作的规矩 section — follow all of it)
  docs/CHECKPOINT-claims.md            (this file — what was ruled, what is measured)
  docs/receiving-claim-execution-queue.md
       — the sections THE THREE CONSEQUENCES and THE CLAIMS WORKSPACE, then cards R9-R14
  docs/PURCHASING-WORKING-FLOW.md · docs/PURCHASING-INFORMATION-MODEL.md §12
  docs/COPY-STANDARD.md · docs/ACTION-FLOW-STANDARD.md

THEN: re-measure the numbers in §2 yourself. Do not trust this file's figures.

MY CARDS ARE R13 · R9 · R11 · R12, all on the CLAIMS tab, in that order.
R10 is docs-only. R14 belongs to the RECEIVING lane — do not build it.

Rules:
  - Do NOT rebuild the Claims page. It is a missing LAYER (§ THE CLAIMS WORKSPACE).
  - Do NOT invent a verb, a word, or a token value.
  - Do NOT propose a backfill — supplier_claims holds 0 rows.
  - Solve technical problems, bugs, conflicts YOURSELF. Come back to me only for a
    business rule.
  - Reply in Chinese, short sentences, conclusion first, ASCII before code.
  - End with the four review questions.

Tell me first: which of §3's findings are still true today, and what changed on main
since 2026-08-05.
```

---

## 5 · Lane warning

**Two Claims chats were running in parallel on 2026-08-05 and collided twice** — the second
one landed R9/R10 on `main` while the first was writing, and a later rebase hit a merge from a
third lane. Both were resolved by taking `main` and re-applying, never by clobbering.

**Before opening a BUILD chat: agree which chat holds which card.**
**⑥ C4 and ⑦ P share the Purchasing pages with ④ R — only ONE of those three at a time.**
