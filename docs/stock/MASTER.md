# STOCK — MASTER

> **The only Stock document.** Overwritten when re-ruled; never versioned.
> **You read `CLAUDE.md` and this file.**
>
> **Inventory and Ready Stock are ONE module, and that is measured, not chosen:** the portal has
> a single `Stock` door with three tabs. Two masters would be two names for one screen.

| I am working on | Read |
|---|---|
| anything | **§1 · §2** |
| what is physically here | **§3 On hand** |
| what moved | **§4 In & out** |
| the shelf plan and reorder points | **§5 Ready stock** |
| quarantined goods | **§6 Held stock** |
| the review numbers | **§7** |

---

# §1 · Overview

### MISSION
Answer three questions and no more: **what is physically here · what moved · what should we buy
for the shelf.**

### WHAT IS ON SCREEN TODAY
ONE sidebar item, three tabs (`OperationStock.tsx`, 156 lines — the tab shell).
*Measured 2026-08-05 from file sizes, routes and the shipped card records; **pages not read line
by line.***

```
OperationStockOnHand.tsx    547   On hand    — the per-unit register, chip-filtered
OperationMovements.tsx      885   In & out   — every movement
OperationStockPlan.tsx      746   Ready stock — the plan, reorder points, K5's digest
```

**`Inventory` and `Movements` are BANNED UI words.** The goods pool is **`Stock`** on any page,
tab or label.

### LIVE SCALE — measured 2026-08-05
```
ops_stock_items 135 · units on_hold 0 · ops_stock_pool_usage 0
49 warehouse SKUs, ZERO with a single real sale, seven days of real records
```

---

# §2 · Shared architecture

| Concern | The ONE home |
|---|---|
| the per-unit register | `ops_stock_items` — **the register is the authority, not a rollup** |
| the rolled-up balance | `stock_balances` via `ops_rollup_stock_balances` |
| quarantine outcomes + status mapping | `packages/shared/src/stock-hold.ts` |
| pool draw reasons (K4's dated ledger) | `ops_stock_pool_usage` + `POOL_USE_REASONS` |
| reorder points | `ops_reorder_points` |

> **THE TRAP THAT HAS COST REAL TIME: two base tables with NO trigger between them.**
> `ops_stock_items` (the register) and `stock_balances` (the rollup) do not move together.
> **Anything that decides whether stock is available must read the REGISTER** — a rollup number
> does not fall when a draw happens, so the same units get offered again tomorrow.

---

# §3 · On hand

### MISSION
What is physically in a warehouse right now, per unit.

### FROZEN RULES
- **Every pick filters `status='free'`**, and the rollup counts only free + reserved.
- **A record is drawn WHOLE.** A bulk record of N units that would over-reserve is skipped,
  never split — so a 555-unit pillow row reserved for one pillow takes all 555 out of free
  stock, and the ledger honestly records 555. **A pre-existing property of the per-unit engine,
  not something a card introduced.**
- **`Reserve`, never `Take`.** The goods do not leave; they are LOCKED until delivery, and an
  operator who believes stock has gone will not chase it. The past tense moved with it —
  *reserved N from stock*, never *took*.

# §4 · In & out

### MISSION
What moved, when, and why.

### FROZEN RULES
- **A movement row is a record of a decision** and is never deleted to make a number tidy.
- **Known defect, recorded not fixed:** `ops_stock_takeout` writes `qty 1` regardless of the
  record's real quantity, so taking out a 555-unit record logs one unit. It predates the bulk
  column, and the movements ledger feeds a `count(*)`-based rollup — **fix both together or
  neither**, or the two disagree differently.

# §5 · Ready stock

### MISSION
Decide what to buy for the SHELF — stock nobody has ordered yet.

### FROZEN RULES
- **A reorder point is a HUMAN number.** A SKU with none reads `Set a number` and raises no
  alert. **A quiet screen must mean *watched and fine*, never *nobody looked*.**
- **`ops_reorder_points.reorder_point` is NOT NULL and 0 means "alert OFF"**, which is why
  reserve levels are their OWN table — a placeholder row would silently flip `Set a number` to
  *watched and fine*.
- **A reserve level WARNS and never BLOCKS.** Nothing anywhere disables anything on one.
- **Ready stock is SUGGESTED to Purchasing, never consumed.** Goods are labelled per order;
  nothing auto-consumes them. The human presses the button.

# §6 · Held stock — problem goods

### MISSION
A damaged or wrong unit stops counting as future supply, under the claim that is chasing it.

### FROZEN RULES
- **The guard asks WHERE a unit is going, never WHO is writing.** `ops_stock_items` has a
  blanket internal write policy and three live PostgREST paths write `status`, so a rule inside
  one RPC is a rule one call walks around.
- **`on_hold` may reach `free`, `returned_to_supplier` or `written_off`, and can NEVER reach
  `reserved`, `sold` or `transferred`** (0299).
- **A held unit is not "on the way."** Before this, a broken unit stayed `incoming` forever and
  both the reorder engine and the ready-stock plan read `incoming` as *coming*, inflating
  future supply with goods that will never arrive.
- **Entry is from `incoming` only.** A unit already in the free pool that is later found faulty
  goes through `needs_repair` instead. **Consequence, and it is deliberate: a supplier claim can
  only ever be raised at receiving.** Changing that means settling the entry rule and the
  refurbish door in the SAME change.
- **Every draw off the shared pool names a REASON, in the same transaction as the draw.**
  Six reasons, and the draw and the reason cannot come apart, because a failed stamp used to
  leave an unexplained unit.
- **Three doors out of the pool, not two** — the reserve doors AND `Takeout` on a free row.

# §7 · The review layer

### FROZEN RULES
- **It mints nothing.** It reads the reorder points (when to BUY) and the reserve levels (how
  low it may GO) and adds no third number.
- **Every alert withholds itself until the records can back it.** A 90-day no-sale alert waits
  until the records SPAN 90 days; a never-sold SKU is reported quiet for exactly as long as the
  window can see. **All four gates heal by themselves.**
- **`unrated` is a first-class rung, not `other`.** *Nobody set a number* is a different fact
  from *somebody chose Other*, and folding them tells a manager her staff keep choosing Other.
- **A month still running gets no percentage.**
- **A WINDOW is not a HISTORY.** The route says where its window ENDS, or the window's own
  oldest row silently becomes *"when our records start"*.

---

# §8 · Approved Evolution

| What | Why it is not built |
|---|---|
| **Splitting a bulk record on partial reserve** | Approved shape: decrement `qty`, mint a reserved sibling. **Every consumer of `ops_stock_items.qty` must be re-read when it happens**, which is why it is not a small card. |
| **A net figure for the pool-usage split** | A release does not currently negate its draw row, because the ledger answers *what did we draw on ready stock FOR* and a release does not unmake the decision. If a net figure is ever wanted: add a `released_at` stamp and give the summariser a mode — **never delete rows.** |
| **`ops_stock_items.reserve_reason` (0213) is orphaned** | It has no writer, 0 rows and no reader; the reason lives on the dated ledger. Dropping a column is the owner's call. |
| **A post-receipt supplier claim** | Approved as a concept. Blocked: the entry rule and the refurbish door must move together. |
