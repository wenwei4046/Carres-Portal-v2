# RECEIVING INFORMATION MODEL — the Receiving Session

> **Status: v1 — approved by Jess 2026-08-02** (direction approved with two
> final clarifications, both incorporated: Amend is add-only; the Void
> reversibility invariant). Every ruling in here was frozen by Jess in the
> Receiving planning chat, 2026-08-02. This file is the ONE home
> for how Receiving's information is organised. The working flow (what Receiving
> DOES) and this model (how its information is ORGANISED) never repeat each other.
> UI, interaction and migrations are all downstream of this file — none of them
> may contradict it.

---

## 1 · Mission (frozen)

**Receiving is where goods are checked IN, in ONE step — the check-in itself IS
the completed GRN.** No second data-entry step, ever. Rollout: Office keys it
first (Manual); the Warehouse takes over on its own login when trusted.
Whether a submission needs Review is decided by the SUBMITTER's permission,
never by the module as a whole.

### 1.1 · Supplier fulfilment ≠ goods received (frozen by Loo, 2026-08-05)

**Three questions were being answered by one number. They are three:**

```
PO Complete   ←  supplier fulfilment confirmed
GRN           ←  the Receiving Session, and nothing else
Inventory     ←  Receiving, and nothing else
```

**Receiving owns the second and the third, and never the first.** A Receiving Session
says *the goods are on our floor and counted*. It does not say *the supplier finished
the job* — those are the same sentence only when the goods were coming to us in the
first place.

**`received_qty` and the Receiving status may NEVER be borrowed to express fulfilment.**
[`PURCHASING-WORKING-FLOW.md`](PURCHASING-WORKING-FLOW.md) §9 already rules that a
quantity means exactly one thing, and `received_qty` means *units physically received
into a Carres warehouse*. Writing it to make a purchase order look finished would make
the stock ledger claim goods are on a floor they were never on — and the stock ledger is
what the next order is sold against.

### 1.2 · The fulfilment paths, and who confirms each (frozen by Loo, 2026-08-05)

**THE GRAIN IS THE PO LINE, and it was never in question.** *"本来就是一项一项"* — Loo,
2026-08-05, correcting a chat that asked him to choose it. Each line is fulfilled by its
own path; a purchase order is finished when all of its lines are. **A purchase order is
therefore free to be MIXED**, and one live one already is (PO-2032, below). Nothing may
ask *"which path is this PO on?"* — that question has no answer and asking it is what
produces a refusal at issue that the business never asked for.

| Path | Where the goods go | Who confirms fulfilment |
|---|---|---|
| **Warehouse** | into a Carres warehouse | **nobody presses anything** — posting the Receiving Session IS the confirmation |
| **Direct to customer** | the supplier or the carrier takes them straight to the customer | **Operation confirms it explicitly** — no Session can ever exist for those goods |
| **Customer collects at the supplier** | the customer goes to the factory and takes the goods themselves | *(same category: no Carres floor, no Session. **WHO confirms it is open** — nobody on our side witnesses the handover; see §8)* |

**The third path is Loo's own, 2026-08-05:** *"我们有发生过顾客去我们厂那边"* — it happens,
so the model carries it. It is not a variant of the second: in the second a Carres-arranged
carrier moves the goods and we can ask them; in the third **no Carres party is present at
all**, which is why its confirmer is parked rather than guessed.

- **The warehouse path gets NO extra confirm button, and that is a rule rather than a
  convenience.** §1 says the check-in itself IS the completed GRN; a second *"yes, the
  supplier finished"* press over the same goods is exactly the second data-entry step
  this module exists to remove.
- **Fulfilment carries its OWN record: who · when · which path.** It is never inferred
  from a quantity and never read off a Receiving status. **`which path` is a stored value
  of the fulfilment record**, not a re-derivation of the destination — a destination can be
  edited after the fact, and the record must keep saying how the goods actually went.
- **The list of paths is Loo's and is not closed by a chat.** Three are named above; a
  fourth enters here before it enters any code.
- **None of these is a Receiving screen.** Receiving handles goods; goods that never arrive
  here are not its work. The confirmation belongs to the buyer's side — §1's role-anchor
  rule, one file over.

**MEASURED ON LIVE PRODUCTION, 2026-08-05 — the direct path is not hypothetical, and it
is already stuck.** `purchasing_destinations` holds three rows, and 0307's own constraint
makes the discriminator readable without a new column: a destination is either linked to
a warehouse or carries a plain address.

```
Carres Klang       warehouse-linked      24 POs
AL Sungai Buloh    address only           2 PO LINES   ← goods never reach a Carres floor
HOUZS              address only           0
```

Both of those lines sit on **PO-2032**, a three-line purchase order, and they are 0311's
own worked example word for word: *"one of them to AL Sungai Buloh because AL collects it
and takes it straight to the customer."* **No Receiving Session can ever exist for those
two lines**, so `received >= ordered` can never become true for PO-2032, so **PO-2032 can
never reach `Completed` under today's derivation.** The rule above names the gap; the
fulfilment record that closes it is NOT built (§8).

---

## 2 · The one object: Receiving Session

```
ONE physical delivery (one truck) = ONE Receiving Session
```

- A missed line on the same truck is an **Amend** on the same Session — never a
  second Session.
- A genuinely second truck = a NEW Session (normal partial delivery).
- A wrong record (wrong qty / wrong PO / wrong DO) = **Void** the Session and
  create a correct one. History is never overwritten and never edited in place.
- Duplicate guard: **same Supplier + same PO + same DO number** cannot create a
  second live Session. One DO number MAY span several POs (one van, two POs =
  legal; each PO gets its own Session in v1).
- The existing dead table `po_receipts` (0001) is neither written nor deleted.
  `warehouse_receipts` (0302) is the starting store the Session upgrades.

---

## 3 · Field ownership

A field's owner is the module that CREATES it. Foreign fields display read-only
with a jump to their owner module.

### 3.1 Receiving Session — owner: Receiving

| Field | State | Notes |
|---|---|---|
| session id | ✅ exists | `warehouse_receipts.id` |
| PO ref | ✅ exists | one PO per Session (v1) |
| warehouse (snapshot) | ✅ exists | never re-derived after a PO relocation |
| supplier DO number | ✅ exists | |
| lines[] | ✅ exists | per PO line: **received this time (delta)** · damaged · wrong · line photos |
| note | ✅ exists | internal note; supplier-facing text is a different field, never mixed |
| receiving method | 🔴 new | HOW the session was created: `manual` / `warehouse` (naming open; concept frozen). WHO is `submitted_by` — responsibilities never merge |
| photos[] | 🔴 new | Session-level multi-attachment. Future: each photo carries a TYPE (DO / Goods / Damage / Other) — recorded, not built in v1 |
| Goods Received At | 🔴 new | see §5 dates |
| Submitted At / By | ✅ exists | system-stamped, never editable |
| Posted At / By | 🔴 new | its OWN pair. Today `reviewed_at/by` stamps both posted AND returned — a returned session has a review stamp but is NOT posted, so the pair must split |
| status | 🟡 upgrade | see §4 lifecycle |
| return reason | ✅ exists | latest reason; FULL history lives in the Event Ledger |
| void by / at / reason | 🔴 new | |

**There is deliberately NO `amendments[]` on the Session.** An amendment is an
EVENT (§6). Two history systems will always drift; there is exactly one.

### 3.2 PO — owner: Purchase Orders (read-only inside Receiving)

| Field | State | Notes |
|---|---|---|
| PO number · supplier · warehouse · PO Date | ✅ | display only |
| PO status | 🟡 | `Open → Partially Received → Received` — **always ENGINE-derived from quantities** (`received_qty` vs `qty`). Today the receive RPC writes the word; that write becomes a pure derivation. No human ever picks a PO status |
| `purchase_orders.do_file_path` (+ uploaded at/by) | 🔴 retire | one overwritable slot — the second truck's DO erases the first. Evidence's home is the Session; the PO keeps no receiving evidence |

### 3.3 PO Line — owner: Purchase Orders (quantities engine-written only)

| Field | State | Notes |
|---|---|---|
| sku · description · ordered qty | ✅ | |
| received_qty (cumulative) | ✅ | engine total = Σ posted Session deltas; no human arithmetic, no manual write |
| damaged_qty · wrong_item_qty | ✅ | cumulative, engine-written |
| short_since | ✅ | 0306 trigger, already live |
| balance date | ✅ | lives in the promise ledger (`po_supplier_promises`), read-only here |
| per-unit ids | 🔵 Stock's | read-only in the row extend (v1). Selecting WHICH unit is damaged is NOT possible until the scan card — the engine does not accept it today |

---

## 4 · Lifecycle (frozen)

```
Status: Draft · Submitted · Returned · Posted · Voided   (five, exactly)

            submit                     post (by permission)
  Draft ──────────────> Submitted ──────────────> Posted ──void──> Voided
    │                    ▲      │                   │
    │ post (Manual /     │      │ return (review)   │ amend (missed lines,
    │ trusted warehouse) │      ▼                   │        via Event)
    └────────────────────┘   Returned ─resubmit──> Submitted
```

- **Returned is a real business state, not Draft.** It means: was submitted, was
  reviewed, was sent back. The UI lets it be edited like a draft; the status
  never lies about the history.
- Review may **approve or return only — never re-key the data** (otherwise two
  operators do one job).
- Void exists only for Posted (it reverses stock through the engine). An
  unsubmitted Draft is discarded, not voided — nothing happened business-wise.
- **Void reversibility invariant (frozen):** a Posted Receiving Session may be
  reversed only when all affected inventory remains reversible. If any received
  unit or quantity has already been allocated, sold, delivered, transferred,
  consumed, or otherwise used, the system must block direct reversal and
  require the appropriate inventory correction workflow. That correction
  workflow is NOT designed in this file — it belongs to the later Inventory
  interaction/build work.
- **Amend is ADD-ONLY (frozen).** It exists only for Posted, and only when
  goods were physically present in the SAME delivery but were omitted from the
  Posted record. Allowed: add an omitted item quantity · add omitted receiving
  evidence or photos · add an explanatory note. NOT allowed: reduce a
  quantity · replace an item with another item · change the PO · change the
  supplier DO identity · delete or overwrite previously Posted facts — those
  are recording errors and must go `Void / Reverse → Recreate`. Every Amend
  posts its additional inventory effect through the normal engine path and
  appends an `Amended` event carrying who, when, why, and exactly what was
  added. The engine re-derives totals.
- Whether Draft→Posted may skip Submitted is a PERMISSION of the submitter
  (Manual = direct; Warehouse = review until trusted), never a module switch.
- **An event records what happened in the BUSINESS world, not the steps the
  system walked (Jess, 2026-08-03).** The Warehouse flow is two people, two
  acts, two times, so its ledger reads `submitted` then `posted`. The Office
  is one operator pressing Save once, so its ledger reads `posted` and nothing
  else — a `submitted` event there would name an act nobody performed. When a
  one-act flow leaves a payload short, the Event Payload Dictionary is widened
  (§6.1); an artificial event is never manufactured to carry the fields.

---

## 5 · The three times (frozen — never one `created_at`)

| Time | Set by | Editable | Meaning |
|---|---|---|---|
| **Goods Received At** | human | ✅ default today; never in the future; never before PO Date (finer bounds open) | when the goods PHYSICALLY arrived — the Business Date Dictionary's "Goods Received At", owned by this page |
| **Submitted At** | system | ❌ never | when it entered the system |
| **Posted At** | system | ❌ never | when it hit the books |

Friday's truck keyed in on Monday reads: Received Friday · Submitted Monday.
Reports use the business date; audit keeps the system dates. Both are true.

---

## 6 · Receiving Event Ledger (frozen — the ONE history)

```
receiving_events (append-only, one writer: the engine's doors)
  session ref · event: submitted | returned | posted | voided | amended
  who · when · payload (jsonb)
```

- **Activity Timeline reads this ledger and nothing else.**
- A single status column loses "was once returned" the moment it resubmits, and
  a second return overwrites the first reason — the ledger is what keeps them.
- An Amend's payload carries WHAT changed: `Item A: 3 → 5 · reason: missed
  during first entry`.
- There is no second history mechanism anywhere in Receiving.

### 6.1 Event Payload Dictionary (frozen — no RPC invents its own field names)

Every event's payload uses ONLY these keys, spelled exactly so. A new key
enters this table before it enters any payload.

| Key | Type | Used by | Meaning |
|---|---|---|---|
| `do_number` | string | submitted · resubmitted · posted | the supplier DO this act was about |
| `goods_received_at` | date | submitted · resubmitted · posted | the business date as entered |
| `units_counted` | int | submitted · resubmitted · posted | good + damaged + wrong across all lines |
| `entry_source` | string | posted | `office` \| `warehouse` — which desk keyed the count |
| `reason` | string | returned · voided · amended | the human's stated why |
| `claims_linked` | int | posted | supplier claims this posting opened |
| `changes` | array | amended | `[{sku, from, to}]` — exactly what was added |

**`posted` carries the business date, the count and the source (Jess,
2026-08-03).** The Office posts in ONE act, so its Session has no `submitted`
event to read those facts off — and the answer is to widen the payload, never
to write an event nobody performed (see §4). Both doors write the same five
keys, so a report over the ledger reads the same regardless of which desk
keyed the count.

Event names themselves are business facts and closed:
`submitted · returned · resubmitted · posted · voided · amended`
(`resubmitted` is a first-class event — never `submitted` with a flag.)

---

## 7 · Working rules already frozen (recorded here so no chat re-litigates)

1. Session stores **this-time quantities (delta)**; cumulative totals are always
   engine-derived. The form asks "Receive this time", never "total so far".
2. **Prefill**: starting a receiving prefills every line at its remaining qty —
   a complete delivery is zero typing (copied from 2990's ready-to-review
   draft).
3. Beside the input the operator sees `Ordered 10 · Received 6 · Remaining 4` —
   no mental arithmetic.
4. **Short receipt does not block**: saving with remainder shows a quiet
   `Remaining after save: N items` near the Save button. Only real risk blocks
   (e.g. receiving more than ordered). No routine confirm popups — they train
   people to click OK.
5. No "same DO as previous" shortcut in v1 — workflow optimisation, not
   Receiving core. Revisit when repetition is measured, as an Enhancement.
6. Input ORDER is never frozen (count first or DO first — operator's choice);
   only data COMPLETENESS is frozen: qty + DO number + photos before Save
   completes a GRN.
7. Exception quantities are recorded ON the item rows. The Exceptions section
   only DISPLAYS results (held units) and doors into Claims — it exists only
   when exceptions exist.
8. Words: `Check in` is the act; `GRN` survives only as the record's noun.
   `Chase` / `Receive`-as-verb / `Send back` stay banned. Every new word needs
   a COPY-STANDARD row before it may appear on screen.

---

## 8 · Open items (parked, with their phase)

| Item | Waits for |
|---|---|
| **the fulfilment record itself** (who · when · which path) and the Operation confirmation for the paths with no Carres floor — §1.2's rule is frozen, nothing is built, and **PO-2032 is stuck today** | its own card, on the BUYER's side, never a Receiving screen |
| **WHO confirms `customer collects at the supplier`** — no Carres party witnesses that handover, so the confirmation rests on either the supplier's word or the customer's signature at the factory. **Loo's, and deliberately not guessed** | his ruling, before that path is built |
| `receiving method` value naming (`manual` vs something better) | before migration |
| photo TYPE taxonomy (DO / Goods / Damage / Other) | photos v2 |
| Goods Received At lower bound (PO Date vs something finer) | before migration |
| one-van-many-POs single-session convenience | measured pain, own card |
| scan-to-receive + pick WHICH unit is damaged | Phase B, own card (touches the hot receive RPC) |
| `Returned` word vs COPY-STANDARD (needs its dictionary row) | Phase 7 UI copy |
