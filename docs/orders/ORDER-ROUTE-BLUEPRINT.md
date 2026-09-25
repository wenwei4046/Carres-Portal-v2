# RECOMMENDED CARRES ORDER ROUTE BLUEPRINT

> ## ⛔ PROPOSAL — NOT LAW
> Nothing here is approved. It is one complete recommendation for Jess to read in one sitting and
> answer in one pass. Where the repository already rules something, this document says so and keeps
> it; where it genuinely has no answer, this document recommends one and says what would prove it
> wrong. **No code changes with this file.**
>
> **Written 2026-09-24 against `origin/main` `fa93fb929`.** Every "today" below was measured in the
> code, not remembered.

---

## 0 · THE ONE-PARAGRAPH VERSION

Order Route already works and should **not** be redesigned. It is one connected map, read-only,
derived only from authoritative facts, and the 2026-08-16/17 rulings that shaped it are sound. What
it is missing is not beauty — it is **four kinds of truth it cannot currently say**: that a change
is waiting for approval, that a delivery went out on more than one trip, that a fact could not be
read, and that a step finished only partly. Each of those is a sentence an operator needs and the
map is silent on today. This Blueprint recommends adding exactly those four, and changing nothing
else.

---

## 1 · WHAT IS ALREADY LAW, AND STAYS

Measured in `docs/orders/MASTER.md` § *ORDER ROUTE — ONE NODE MAP* (owner ruling 2026-08-16,
**APPROVED / LOCKED**) and in `packages/shared/src/sales-order-route.ts`.

| Locked today | Keep? |
|---|---|
| **One connected map, never a stack.** White node cards, connector lines, one pan/zoom canvas. | **KEEP** |
| **Read-only, forever.** The route derives from authoritative facts and gains no writer (ownership Law B). | **KEEP** — this is what makes it trustworthy |
| **The Sales Order is the only root**, and Goods / Delivery / Money leave it simultaneously. | **KEEP** |
| **Four groups**: `GOODS` · `DELIVERY` · `MONEY` · `LOAN` (conditional), named by an uppercase band, 72px apart. | **KEEP** |
| **Colour means STATE, never route** — blue current, green done, amber exception. | **KEEP** |
| **State is never colour-only** — `✓` tick, `◉` chip, dashed future, `⚠` with its reason in words. | **KEEP** — it is also the accessibility floor |
| **`CURRENT` is one per route, at most three.** A Loan never takes one. | **KEEP** |
| **A `✓` costs real completion evidence.** Nothing ticks because the next thing started. | **KEEP** — the single most important rule on the map |
| **Waiting speaks primary-school English** — `No Purchase Order yet`, never `PO: —`. | **KEEP** |
| **Owners come from the Work Engine roster only**, initials on the node, never invented. | **KEEP** |
| **0.7× readability floor** on load fit; `⛶` may go smaller because the operator asked. | **KEEP** |
| **One goods line is one lane**, with a grey caption plate above it; one column per source PO. | **KEEP** |

**Nothing in the list above is reopened by this Blueprint.**

---

## 2 · THE ELEVEN AREAS JESS NAMED — measured, one line each

`✅` = already right · `🟡` = right but incomplete · `🔴` = the map cannot say it at all

| # | Area | Today, measured | |
|---|---|---|---|
| 1 | **Goods** | Forks per goods line and per source quantity; `purchaseSlices()` splits one line across several POs; each lane carries `PURCHASING → SUPPLIER → RECEIVING`. | ✅ |
| 2 | **Delivery** | `LOGISTICS → DELIVERY DATE → DELIVERY ORDER → DELIVER → DELIVERY PHOTO`, with the gate in front. | 🟡 one trip only — see §3.2 |
| 3 | **Money** | Reads `orderMoney` and never recomputes it; carries "is the value known" and "what is still owed". Money no longer holds the truck, and the field that meant that was deliberately removed. | ✅ |
| 4 | **Owners** | Work Engine roster only. Purchasing and Receiving show a chip; Stock, Delivery, Sales and Payment show none *until their own governed owner rule exists* — the page refuses to invent one. | ✅ honest |
| 5 | **Dates** | Every `✓` carries a **labelled** date (`Issued: Thu, 13 Aug`), never a bare date. | ✅ |
| 6 | **Destinations** | `lineDestinations` carries Purchasing's own Deliver To answer per SKU **including quantity splits** — the Sales Order stores neither. | ✅ |
| 7 | **Multiple PO records** | Modelled: `purchaseOrders: ReadonlyArray<RoutePurchaseOrder>`, one column per source PO. | ✅ |
| 8 | **Multiple DO records** | `delivery` accepts **one** `booking` and **one** `doNumber`. | 🔴 §3.2 |
| 9 | **Partial completion** | `cancelledLines` is modelled; partial *receipt* and partial *delivery* are not distinguished from complete. | 🔴 §3.4 |
| 10 | **Amendments** | The string `amend` appears **zero** times in the resolver. | 🔴 §3.1 |
| 11 | **Failed reads** | No `unreadable` / `error` concept in the resolver or the node marks. | 🔴 §3.3 |

---

## 3 · THE FOUR RECOMMENDATIONS

### 3.1 · 🔴 A PENDING AMENDMENT IS INVISIBLE ON THE MAP

**Current.** A customer rings and changes two mattresses to one. Operation submits an amendment; it
waits for a manager. The Route keeps drawing the ORIGINAL two-mattress lane, with its purchase
chain, as if nothing had happened. Nothing anywhere on the map says a change is in flight.

**Why that is worse than it sounds.** Order Route is the page an operator opens to answer *"what is
happening to this order?"*. During the exact window when the answer is *"we are waiting for a
decision"*, the map confidently says something else. Purchasing may act on a lane that is about to
change.

**Recommended — `PROPOSED CHANGE`, one band-level banner, no new node kind.**

```
┌─ SO-1365 ────────────────────────────────────────────────────────────┐
│ ⚠ A change to this order is waiting for approval — submitted Tue,    │
│   23 Sep by Shasha.  Open the request →                              │
│   The map below shows the order as it stands TODAY, not the change.  │
└──────────────────────────────────────────────────────────────────────┘
```

- It sits **above the canvas**, not inside it. The map keeps meaning "what is true now" — that is its
  whole value, and an amendment is precisely *not yet true*.
- The last sentence is the important one. Without it, a reader assumes the map already shows the change.
- The amendment's own before/after already exists on the `Order` tab; the Route **links**, never duplicates (Law C).
- **Rejected alternative:** drawing the proposed lane in a ghost style on the canvas. It would put two
  contradictory truths on one surface, which is the defect the 2026-08-16 ruling removed.

**Falsifier:** an operator who reads the banner and still acts on the old lane — then the banner is in
the wrong place and it belongs on the affected lane's caption plate instead.

---

### 3.2 · 🔴 A SPLIT DELIVERY COLLAPSES TO ONE TRIP

**Current, measured.** Migration `0542_a_split_delivery_has_one_document_per_trip` gives
`ops_delivery_orders` a `trip` key — `0` = unsplit, `1..3` = one trip of a split delivery — because
"one sales order can go out on two or three trips in the same scope, each with its own document".
**The Route's input takes a single `booking` and a single `doNumber`.** So an order delivered on
three trips, with three real DO documents, draws one delivery chain and names one of them.

**Why it matters.** This is the case where the customer asks *"where is the rest of my order?"*. The
map is the page that should answer it and today it hides the question.

**Recommended — the Delivery group forks by trip, exactly as Goods already forks by source PO.**

```
DELIVERY
├─ Trip 1 · Sofa, 2 items ····· DO2609-48271 ✓ Delivered: Mon, 22 Sep
├─ Trip 2 · Mattress, 1 item ·· DO2609-48272 ◉ Booked: Fri, 26 Sep
└─ Trip 3 · not booked yet ···· ○ No delivery date yet
```

- **Reuse the caption-plate grammar the Goods group already has** (one lane, a grey plate naming what
  the lane carries). No new visual language; the operator already reads it in `GOODS`.
- The plate names the **delivery groups the trip carries** (`ops_order_control.booking_groups`, 0282) —
  the same fact the booking already stores.
- An unsplit order keeps exactly today's single chain. `trip = 0` renders with no plate, so nothing
  changes for the ordinary case.
- **`CURRENT` stays one per route.** With three trips, the current one is the earliest unfinished trip —
  not one per trip, or the map grows four current chips and the rule that makes them meaningful dies.

**Depends on:** the DO collision fix (#1550 / 0575), which is changing DO numbering underneath this.
**Build after it lands**, not beside it.

**Falsifier:** production shows no order with `trip > 0` and none is expected before go-live — then this
is real but not urgent, and it waits behind §3.1 and §3.3.

---

### 3.3 · 🔴 A FACT THAT COULD NOT BE READ LOOKS LIKE A FACT THAT IS NOT THERE

**Current.** The resolver has no notion of a failed read. Marks are `complete · current · waiting ·
blocked · future`. If Purchasing's read throws, the lane renders `waiting` — **`No Purchase Order
yet`** — which is a *positive claim about the business* made from a *technical failure*.

**Why this is the most dangerous of the four.** The other three hide information. This one **states
something false in primary-school English**, which is exactly the register the operator trusts most.
An operator who reads `No Purchase Order yet` will raise a purchase that already exists.

This is the same class of defect the repo has already been bitten by twice and written rules about:
*"absence is not zero"* and *"a blank may never carry two meanings"*.

**Recommended — a sixth mark, `unreadable`, and one sentence.**

⚠️ **NOT `unknown`.** That word is already taken in this exact file, and it means something
different: `sales-order-route.ts:817/1016/1023` use "unknown" for an unknown MONEY VALUE — *"An
unknown value never holds a delivery"*. Two meanings for one word in one resolver is how the next
reader gets it wrong. `unreadable` says what actually happened: the read failed.

```
⚠  Could not read Purchasing for this line.
   This does NOT mean there is no purchase order.  Try again →
```

- `unreadable` renders like `blocked` (amber `⚠`) — it IS an exception, just not a business one.
- The second line is not optional. Without it the operator draws the same wrong conclusion from a
  different word.
- **A node in `unreadable` may never be ticked and may never be `CURRENT`.** A failed read is not a position.
- The route stays **whole**: one branch failing must not blank the map, in exactly the way
  `docByRevision` on the Sales Order page already fails soft (a failed document read leaves every
  version reporting "no stored file" instead of the version list refusing to load).

**Falsifier:** if every upstream read is already guaranteed non-throwing at the resolver boundary, this
is dead code — check `apps/api`'s route assembly before building it.

---

### 3.4 · 🔴 PARTLY DONE IS DRAWN AS DONE OR NOT DONE

**Current.** `cancelledLines` is modelled, so a removed line states its outcome and stops — good. But
**3 of 5 received** and **2 of 3 delivered** have no representation: a node is `✓` or it is not.

**Why it matters.** Partial receipt is the *normal* case in this business — a factory ships what it
has. The operator's real question is *"what is still outstanding?"*, and the map answers only
*"finished / not finished"*.

**Recommended — the count rides the node's factual line; the mark stays binary.**

```
◉ RECEIVING        3 of 5 received · Latest GRN: Fri, 19 Sep
                   Chase the remaining 2 with Ohana
                   Open GRN-2609-0041 →
```

- **Do NOT add a "partial" mark.** Five marks are already at the edge of what a low-literacy operator
  reads at a glance, and a sixth (after `unknown`) would be one too many. The *number* carries the
  nuance; the *mark* stays `◉ current` until the last unit lands.
- `✓` still costs full completion evidence — which is the existing rule, now visibly enforced rather
  than silently.
- Same treatment for delivery: `2 of 3 delivered`.

**Falsifier:** if `RouteReceivingRecord` cannot express "how many of how many" without a new read, the
cost changes and this drops behind §3.1–§3.3.

---

## 4 · OPERATOR JOURNEY — the map after these four

Morning. Shasha opens SO-1365, tab `Order Route`.

1. A banner: **a change is waiting for approval** — she stops before touching the goods lane. *(§3.1)*
2. `GOODS` — one lane per product. Mattress: `3 of 5 received`, chase the other two. *(§3.4)*
3. Sofa lane: `⚠ Could not read Purchasing` — she does **not** raise a duplicate PO. *(§3.3)*
4. `DELIVERY` — Trip 1 delivered, Trip 2 booked Friday, Trip 3 not booked. She can answer the
   customer without opening anything. *(§3.2)*
5. `MONEY` — unchanged, and still the only place the balance is stated.

Everything she did was **read**. The map still writes nothing.

---

## 5 · WHAT THIS BLUEPRINT DELIBERATELY REJECTS

| Rejected | Why |
|---|---|
| Making the Route writable ("just let them press it here") | Ownership Law B. A summary never gains a form. Every door already opens the owner that can write. |
| Drawing the proposed amendment on the canvas | Two contradictory truths on one surface — the defect the 2026-08-16 ruling removed. |
| A `partial` mark | Six marks is past what the design target reads at a glance. The count carries it. |
| Route-coloured edges | Colour is STATE. Routes are told apart by band and spacing — already ruled. |
| A stacked/mobile fallback | Explicitly ruled out: nodes keep full anatomy at every width. |
| Rebuilding the geometry resolver | It is sound, tested, and its constants are a contract with the page. |

---

## 6 · BUILD ORDER, IF APPROVED

Dependency-ordered. **No Cards are authored here** — that belongs to a BUILD lane.

```
1. §3.3  unreadable mark         — smallest, highest harm prevented, no upstream dependency
2. §3.1  amendment banner        — reads facts that already exist on the Order tab
3. §3.4  partial counts          — needs the receipt read to answer "how many of how many"
4. §3.2  split-delivery trips    — MUST wait for the DO numbering fix (#1550 / 0575)
```

---

## 7 · WHAT I NEED FROM JESS — three questions, not thirty

Everything else in this document is an engineering or design judgement and I have made it.

1. ✅ **ANSWERED 2026-09-25 (Jess): YES** — the banner is law, recorded in `MASTER.md` § `PROPOSED CHANGE`. *(was:)* **Does an operator need to see a waiting amendment on Order Route at all**, or is the `Order` tab
   enough? *(If the Order tab is enough, §3.1 disappears — it is the only one of the four that is a
   genuine business-visibility choice rather than a correctness fix.)*
2. **Do split deliveries actually happen often enough to draw?** I can see the database supports up to
   four trips; I cannot see how often Carres really splits. *(Drives §3.2's priority, not its design.)*
3. **When a read fails, may the map say so in those words** — `Could not read Purchasing for this
   line` — or do you want different wording for the operator? *(The behaviour is a correctness fix
   either way; only the sentence is yours.)*

**§3.3 and §3.4 I would build regardless of the answers** — they are correctness, not preference.

---

## 8 · EVIDENCE THIS RESTS ON

| Claim | Where it was measured |
|---|---|
| Node marks, kinds, branches | `packages/shared/src/sales-order-route.ts:81–104` |
| `amend` absent from the resolver | zero matches, whole file |
| Failed reads absent | marks are `complete · current · waiting · blocked · future` only; the four `unknown` hits at `:817/1016/1023` all mean an unknown MONEY VALUE, not a failed read |
| One booking, one DO number | `SalesOrderRouteInput.delivery`, `:330–345` |
| Split delivery is real and shipped | `supabase/migrations/0542_a_split_delivery_has_one_document_per_trip.sql:1–14` |
| Multiple POs already modelled | `purchaseOrders: ReadonlyArray<RoutePurchaseOrder>` `:326`, `purchaseSlices()` `:602` |
| Destinations carry quantity splits | `lineDestinations` `:321` |
| Owner chips are roster-only and honest | Orders MASTER § *Node anatomy*, MEASURED BOUNDARY 2026-09-07 |
| Locked canvas rules | Orders MASTER `:1264–1340` |
